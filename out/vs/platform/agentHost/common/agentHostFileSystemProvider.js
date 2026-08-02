import { decodeBase64, VSBuffer } from "../../../base/common/buffer.js";
import { disposableTimeout } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { createFileSystemProviderError, FileChangeType, FilePermission, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType } from "../../files/common/files.js";
import { fromAgentHostUri, toAgentHostUri } from "./agentHostUri.js";
import { ContentEncoding } from "./state/protocol/commands.js";
import { AhpErrorCodes } from "./state/protocol/errors.js";
import { ProtocolError } from "./state/sessionProtocol.js";
import { ActionType } from "./state/sessionActions.js";
import { ROOT_STATE_URI } from "./state/sessionState.js";
async function createRemoteWatchHandle(primitives, params) {
  const { channel } = await primitives.createResourceWatch(params);
  const channelUri = URI.parse(channel);
  await primitives.subscribe(channelUri);
  const onDidChangeEmitter = new Emitter();
  const listener = primitives.onDidAction((envelope) => {
    if (envelope.channel !== channel || envelope.action.type !== ActionType.ResourceWatchChanged) {
      return;
    }
    const items = envelope.action.changes?.items ?? [];
    if (items.length === 0) {
      return;
    }
    onDidChangeEmitter.fire(items.map((item) => ({
      resource: URI.parse(item.uri),
      type: item.type === "added" ? FileChangeType.ADDED : item.type === "deleted" ? FileChangeType.DELETED : FileChangeType.UPDATED
    })));
  });
  let disposed = false;
  return {
    onDidChange: onDidChangeEmitter.event,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      listener.dispose();
      onDidChangeEmitter.dispose();
      try {
        primitives.unsubscribe(channelUri);
      } catch {
      }
    }
  };
}
function agentHostUri(authority, path) {
  return toAgentHostUri(URI.file(path), authority);
}
function agentHostRemotePath(uri) {
  return fromAgentHostUri(uri).path;
}
const _AHPFileSystemProvider = class _AHPFileSystemProvider extends Disposable {
  constructor(_connectionGraceMs = _AHPFileSystemProvider._DEFAULT_CONNECTION_GRACE_MS) {
    super();
    this._connectionGraceMs = _connectionGraceMs;
    this.capabilities = FileSystemProviderCapabilities.PathCaseSensitive | FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileFolderCopy | FileSystemProviderCapabilities.FileRealpath;
    this._onDidChangeCapabilities = this._register(new Emitter());
    this.onDidChangeCapabilities = this._onDidChangeCapabilities.event;
    this._onDidChangeFile = this._register(new Emitter());
    this.onDidChangeFile = this._onDidChangeFile.event;
    this._onDidWatchError = this._register(new Emitter());
    this.onDidWatchError = this._onDidWatchError.event;
    /**
     * Per-authority registration slot. We keep the slot alive for a brief
     * grace period after the last registration is disposed, so an
     * operation issued during a reconnection window can wait for the
     * replacement registration instead of failing immediately.
     */
    this._authorities = /* @__PURE__ */ new Map();
    /**
     * Fires the authority whose active connection has changed: added,
     * replaced, fallen back to an older registration, entered the grace
     * window (no active connection), or evicted. Long-lived consumers
     * (e.g. {@link watch}) subscribe here so they continue to receive
     * notifications across full entry eviction + later re-creation —
     * something a per-entry emitter cannot offer.
     */
    this._onDidChangeConnection = this._register(new Emitter());
  }
  /**
   * Register a mapping from a URI authority to a connection.
   * Returns a disposable that unregisters the mapping. Multiple
   * concurrent registrations for the same authority are supported;
   * the most recent registration wins, and disposing it falls back to
   * the previous one (if any). After the *last* registration is
   * disposed the entry is held open for {@link _connectionGraceMs} so
   * that a reconnect can replace it without orphaning in-flight
   * operations.
   */
  registerAuthority(authority, connection) {
    let entry = this._authorities.get(authority);
    if (!entry) {
      entry = {
        connections: [connection],
        expiry: new MutableDisposable()
      };
      this._authorities.set(authority, entry);
    } else {
      entry.expiry.clear();
      entry.connections.push(connection);
    }
    const adopted = entry;
    this._onDidChangeConnection.fire(authority);
    return toDisposable(() => {
      const idx = adopted.connections.indexOf(connection);
      if (idx === -1) {
        return;
      }
      const wasActive = idx === adopted.connections.length - 1;
      adopted.connections.splice(idx, 1);
      if (adopted.connections.length === 0) {
        adopted.expiry.value = disposableTimeout(
          () => this._expireAuthority(authority, adopted),
          this._connectionGraceMs,
          this._store
        );
      }
      if (wasActive) {
        this._onDidChangeConnection.fire(authority);
      }
    });
  }
  _expireAuthority(authority, entry) {
    if (this._authorities.get(authority) !== entry || entry.connections.length > 0) {
      return;
    }
    this._authorities.delete(authority);
    entry.expiry.dispose();
    this._onDidChangeConnection.fire(authority);
  }
  dispose() {
    for (const entry of this._authorities.values()) {
      entry.expiry.dispose();
      entry.connections.length = 0;
    }
    this._authorities.clear();
    super.dispose();
  }
  watch(resource, opts) {
    const store = new DisposableStore();
    const handleHolder = store.add(new MutableDisposable());
    const authority = resource.authority;
    const params = {
      channel: ROOT_STATE_URI,
      uri: this._decodeUri(resource).toString(),
      recursive: opts.recursive,
      ...opts.excludes.length > 0 ? { excludes: { items: [...opts.excludes] } } : {},
      ...opts.includes && opts.includes.length > 0 ? { includes: { items: opts.includes.map((p) => typeof p === "string" ? p : p.pattern) } } : {}
    };
    let attached;
    let attaching = false;
    let pendingReattach = false;
    const reattach = async () => {
      if (store.isDisposed) {
        return;
      }
      if (attaching) {
        pendingReattach = true;
        return;
      }
      const entry = this._authorities.get(authority);
      const next = entry?.connections.at(-1);
      if (next === attached) {
        return;
      }
      handleHolder.clear();
      attached = void 0;
      const watchResource = next?.watchResource;
      if (!next || !watchResource) {
        return;
      }
      attaching = true;
      const target = next;
      try {
        const handle = await watchResource.call(target, params);
        if (store.isDisposed) {
          handle.dispose();
          return;
        }
        const current = this._authorities.get(authority);
        if (!current || current.connections.at(-1) !== target) {
          handle.dispose();
          return;
        }
        const sub = handle.onDidChange((changes) => this._onDidChangeFile.fire(changes.map((c) => ({
          resource: this._encodeUri(c.resource, resource.authority),
          type: c.type
        }))));
        handleHolder.value = toDisposable(() => {
          sub.dispose();
          handle.dispose();
        });
        attached = target;
      } catch (err) {
        this._onDidWatchError.fire(err instanceof Error ? err.message : String(err));
      } finally {
        attaching = false;
        if (pendingReattach) {
          pendingReattach = false;
          void reattach();
        }
      }
    };
    store.add(this._onDidChangeConnection.event((a) => {
      if (a === authority) {
        void reattach();
      }
    }));
    void reattach();
    return store;
  }
  async stat(resource) {
    const path = resource.path;
    if (path === "/" || path === "") {
      return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
    }
    const decoded = this._decodeUri(resource);
    if (decoded.scheme === "session-db" || decoded.scheme === "git-blob") {
      return { type: FileType.File, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
    }
    if (decoded.path === "/" || decoded.path === "") {
      return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0, permissions: FilePermission.Readonly };
    }
    const connection = await this._getConnection(resource.authority);
    try {
      const resolved = await this._resolve(connection, decoded);
      return {
        type: resolved.type === "directory" ? FileType.Directory : resolved.type === "symlink" ? FileType.SymbolicLink : FileType.File,
        mtime: resolved.mtime ? Date.parse(resolved.mtime) : 0,
        ctime: resolved.ctime ? Date.parse(resolved.ctime) : 0,
        size: resolved.size ?? 0
      };
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.FileNotFound);
    }
  }
  async realpath(resource) {
    const path = resource.path;
    if (path === "/" || path === "") {
      return path;
    }
    const decoded = this._decodeUri(resource);
    if (decoded.scheme === "session-db" || decoded.scheme === "git-blob" || decoded.path === "/" || decoded.path === "") {
      return path;
    }
    const connection = await this._getConnection(resource.authority);
    try {
      const resolved = await this._resolve(connection, decoded);
      return this._encodeUri(URI.parse(resolved.uri), resource.authority).path;
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.FileNotFound);
    }
  }
  async readdir(resource) {
    const entries = await this._listDirectory(resource.authority, resource);
    return entries.map((e) => [e.name, e.type === "directory" ? FileType.Directory : FileType.File]);
  }
  async readFile(resource) {
    const connection = await this._getConnection(resource.authority);
    try {
      const originalUri = this._decodeUri(resource);
      const result = await connection.resourceRead(originalUri);
      if (result.encoding === ContentEncoding.Base64) {
        return decodeBase64(result.data).buffer;
      }
      return VSBuffer.fromString(result.data).buffer;
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.FileNotFound);
    }
  }
  async writeFile(resource, content, _opts) {
    const connection = await this._getConnection(resource.authority);
    try {
      const originalUri = this._decodeUri(resource);
      await connection.resourceWrite({
        channel: ROOT_STATE_URI,
        uri: originalUri.toString(),
        data: VSBuffer.wrap(content).toString(),
        encoding: ContentEncoding.Utf8
      });
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
    }
  }
  async mkdir(resource) {
    const connection = await this._getConnection(resource.authority);
    try {
      const originalUri = this._decodeUri(resource);
      await connection.resourceMkdir({ channel: ROOT_STATE_URI, uri: originalUri.toString() });
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
    }
  }
  async delete(resource, opts) {
    const connection = await this._getConnection(resource.authority);
    try {
      const originalUri = this._decodeUri(resource);
      await connection.resourceDelete({ channel: ROOT_STATE_URI, uri: originalUri.toString(), recursive: opts.recursive });
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
    }
  }
  async rename(from, to, opts) {
    const connection = await this._getConnection(from.authority);
    try {
      const originalFrom = this._decodeUri(from);
      const originalTo = this._decodeUri(to);
      await connection.resourceMove({ channel: ROOT_STATE_URI, source: originalFrom.toString(), destination: originalTo.toString(), failIfExists: !opts.overwrite });
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
    }
  }
  async copy(from, to, opts) {
    const connection = await this._getConnection(from.authority);
    try {
      const originalFrom = this._decodeUri(from);
      const originalTo = this._decodeUri(to);
      await connection.resourceCopy({ channel: ROOT_STATE_URI, source: originalFrom.toString(), destination: originalTo.toString(), failIfExists: !opts.overwrite });
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
    }
  }
  /**
   * Negotiate access to {@link resource} with the receiver, asking for the
   * granted modes in {@link opts}. Used after a `NoPermissions` failure to
   * prompt the receiver to grant access; the caller can then retry.
   *
   * Resolves on success. Rejects if the receiver denies, the connection
   * is missing, or the connection doesn't implement `resourceRequest`.
   */
  async requestResourceAccess(resource, opts) {
    const connection = await this._getConnection(resource.authority);
    if (!connection.resourceRequest) {
      throw createFileSystemProviderError(
        `Connection for ${resource.authority} does not support resourceRequest`,
        FileSystemProviderErrorCode.Unavailable
      );
    }
    const originalUri = this._decodeUri(resource);
    try {
      await connection.resourceRequest({
        channel: ROOT_STATE_URI,
        uri: originalUri.toString(),
        read: opts.read,
        write: opts.write
      });
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.NoPermissions);
    }
  }
  // ---- Internals ----------------------------------------------------------
  _getConnection(authority) {
    const entry = this._authorities.get(authority);
    if (!entry) {
      return Promise.reject(createFileSystemProviderError(
        `No connection for authority: ${authority}`,
        FileSystemProviderErrorCode.Unavailable
      ));
    }
    const active = entry.connections.at(-1);
    if (active) {
      return Promise.resolve(active);
    }
    return new Promise((resolve, reject) => {
      const settle = () => {
        const current = this._authorities.get(authority);
        if (!current) {
          sub.dispose();
          reject(createFileSystemProviderError(
            `No connection for authority: ${authority}`,
            FileSystemProviderErrorCode.Unavailable
          ));
          return;
        }
        const c = current.connections.at(-1);
        if (c) {
          sub.dispose();
          resolve(c);
        }
      };
      const sub = this._onDidChangeConnection.event((a) => {
        if (a === authority) {
          settle();
        }
      });
      settle();
    });
  }
  /**
   * Translate a thrown error from a {@link IRemoteFilesystemConnection}
   * into a {@link FileSystemProviderError}. Preserves `PermissionDenied`
   * (-32009) as `NoPermissions` so callers can distinguish a
   * permission failure from `NotFound` and decide whether to negotiate
   * via {@link requestResourceAccess}.
   */
  _mapError(err, defaultCode) {
    if (err instanceof ProtocolError && err.code === AhpErrorCodes.PermissionDenied) {
      return createFileSystemProviderError(err.message, FileSystemProviderErrorCode.NoPermissions);
    }
    return createFileSystemProviderError(
      err instanceof Error ? err.message : String(err),
      defaultCode
    );
  }
  /**
   * Resolve a decoded resource over {@link connection}. Shared by
   * {@link stat} and {@link realpath}.
   */
  _resolve(connection, decoded) {
    return connection.resourceResolve({ channel: ROOT_STATE_URI, uri: decoded.toString() });
  }
  async _listDirectory(authority, resource) {
    const connection = await this._getConnection(authority);
    try {
      const originalUri = this._decodeUri(resource);
      const result = await connection.resourceList(originalUri);
      return result.entries;
    } catch (err) {
      throw this._mapError(err, FileSystemProviderErrorCode.Unavailable);
    }
  }
};
/**
 * Grace period during which {@link _getConnection} will await a new
 * registration after the previous one is disposed. Covers the window
 * where a transport is briefly torn down and re-registered (e.g. an
 * agent-host client reconnect that races a plugin sync). 5s matches
 * the typical reconnect timeout. Consumers should still implement
 * logical retries for longer reconnection latencies, but this is a
 * low level, best-effort mechanism.
 *
 * Tests can override this via the constructor parameter.
 */
_AHPFileSystemProvider._DEFAULT_CONNECTION_GRACE_MS = 5e3;
let AHPFileSystemProvider = _AHPFileSystemProvider;
class AgentHostFileSystemProvider extends AHPFileSystemProvider {
  _decodeUri(resource) {
    return fromAgentHostUri(resource);
  }
  _encodeUri(resource, authority) {
    return toAgentHostUri(resource, authority);
  }
}
export {
  AHPFileSystemProvider,
  AgentHostFileSystemProvider,
  agentHostRemotePath,
  agentHostUri,
  createRemoteWatchHandle
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVjb2RlQmFzZTY0LCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IsIEZpbGVDaGFuZ2VUeXBlLCBGaWxlUGVybWlzc2lvbiwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUsIEZpbGVUeXBlLCBJRmlsZUNoYW5nZSwgSUZpbGVEZWxldGVPcHRpb25zLCBJRmlsZU92ZXJ3cml0ZU9wdGlvbnMsIElGaWxlU3lzdGVtUHJvdmlkZXIsIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWxwYXRoQ2FwYWJpbGl0eSwgSUZpbGVXcml0ZU9wdGlvbnMsIElTdGF0LCBJV2F0Y2hPcHRpb25zIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGZyb21BZ2VudEhvc3RVcmksIHRvQWdlbnRIb3N0VXJpIH0gZnJvbSAnLi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgQ29udGVudEVuY29kaW5nLCB0eXBlIENyZWF0ZVJlc291cmNlV2F0Y2hQYXJhbXMsIHR5cGUgRGlyZWN0b3J5RW50cnksIHR5cGUgUmVzb3VyY2VDb3B5UGFyYW1zLCB0eXBlIFJlc291cmNlQ29weVJlc3VsdCwgdHlwZSBSZXNvdXJjZURlbGV0ZVBhcmFtcywgdHlwZSBSZXNvdXJjZURlbGV0ZVJlc3VsdCwgdHlwZSBSZXNvdXJjZUxpc3RSZXN1bHQsIHR5cGUgUmVzb3VyY2VNa2RpclBhcmFtcywgdHlwZSBSZXNvdXJjZU1rZGlyUmVzdWx0LCB0eXBlIFJlc291cmNlTW92ZVBhcmFtcywgdHlwZSBSZXNvdXJjZU1vdmVSZXN1bHQsIHR5cGUgUmVzb3VyY2VSZWFkUmVzdWx0LCB0eXBlIFJlc291cmNlUmVxdWVzdFBhcmFtcywgdHlwZSBSZXNvdXJjZVJlcXVlc3RSZXN1bHQsIHR5cGUgUmVzb3VyY2VSZXNvbHZlUGFyYW1zLCB0eXBlIFJlc291cmNlUmVzb2x2ZVJlc3VsdCwgdHlwZSBSZXNvdXJjZVdyaXRlUGFyYW1zLCB0eXBlIFJlc291cmNlV3JpdGVSZXN1bHQgfSBmcm9tICcuL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFocEVycm9yQ29kZXMgfSBmcm9tICcuL3N0YXRlL3Byb3RvY29sL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBQcm90b2NvbEVycm9yIH0gZnJvbSAnLi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgdHlwZSBBY3Rpb25FbnZlbG9wZSB9IGZyb20gJy4vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgUk9PVF9TVEFURV9VUkkgfSBmcm9tICcuL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5cbi8qKlxuICogSW50ZXJmYWNlIGZvciBwZXJmb3JtaW5nIHJlc291cmNlIG9wZXJhdGlvbnMgb24gYSByZW1vdGUgZW5kcG9pbnQuXG4gKlxuICogQm90aCB7QGxpbmsgSUFnZW50Q29ubmVjdGlvbn0gKGNsaWVudFx1MjE5MnNlcnZlcikgYW5kIGNsaWVudC1leHBvc2VkXG4gKiBmaWxlc3lzdGVtcyAoc2VydmVyXHUyMTkyY2xpZW50KSBzYXRpc2Z5IHRoaXMgY29udHJhY3QuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVJlbW90ZUZpbGVzeXN0ZW1Db25uZWN0aW9uIHtcblx0cmVzb3VyY2VMaXN0KHVyaTogVVJJKTogUHJvbWlzZTxSZXNvdXJjZUxpc3RSZXN1bHQ+O1xuXHRyZXNvdXJjZVJlYWQodXJpOiBVUkkpOiBQcm9taXNlPFJlc291cmNlUmVhZFJlc3VsdD47XG5cdHJlc291cmNlV3JpdGUocGFyYW1zOiBSZXNvdXJjZVdyaXRlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVdyaXRlUmVzdWx0Pjtcblx0cmVzb3VyY2VEZWxldGUocGFyYW1zOiBSZXNvdXJjZURlbGV0ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VEZWxldGVSZXN1bHQ+O1xuXHRyZXNvdXJjZU1vdmUocGFyYW1zOiBSZXNvdXJjZU1vdmVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlTW92ZVJlc3VsdD47XG5cdC8qKiBDb3B5IGEgcmVzb3VyY2Ugb24gdGhlIHJlbW90ZSBlbmRwb2ludC4gKi9cblx0cmVzb3VyY2VDb3B5KHBhcmFtczogUmVzb3VyY2VDb3B5UGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZUNvcHlSZXN1bHQ+O1xuXHQvKipcblx0ICogTmVnb3RpYXRlIGFjY2VzcyB0byBhIHJlc291cmNlIHRoZSByZWNlaXZlciBtZWRpYXRlcy4gT3B0aW9uYWwgYmVjYXVzZVxuXHQgKiBub3QgZXZlcnkgY29ubmVjdGlvbiBpbiB0aGUgY29kZWJhc2UgY2FycmllcyBvbmUgXHUyMDE0IG9ubHkgdGhlIGFnZW50LWhvc3Rcblx0ICogc2VydmVyLXRvLWNsaWVudCBkaXJlY3Rpb24gbmVlZHMgdG8gc2VuZCBgcmVzb3VyY2VSZXF1ZXN0YCB0b2RheS5cblx0ICovXG5cdHJlc291cmNlUmVxdWVzdD8ocGFyYW1zOiBSZXNvdXJjZVJlcXVlc3RQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlUmVxdWVzdFJlc3VsdD47XG5cdC8qKiBSZXNvbHZlIChzdGF0ICsgcmVhbHBhdGgpIGEgcmVzb3VyY2Ugb24gdGhlIHJlbW90ZSBlbmRwb2ludC4gKi9cblx0cmVzb3VyY2VSZXNvbHZlKHBhcmFtczogUmVzb3VyY2VSZXNvbHZlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVJlc29sdmVSZXN1bHQ+O1xuXHQvKiogQ3JlYXRlIGEgZGlyZWN0b3J5IG9uIHRoZSByZW1vdGUgZW5kcG9pbnQgKG1rZGlyIC1wIHNlbWFudGljcykuICovXG5cdHJlc291cmNlTWtkaXIocGFyYW1zOiBSZXNvdXJjZU1rZGlyUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZU1rZGlyUmVzdWx0Pjtcblx0LyoqXG5cdCAqIFN0YXJ0IGEgZmlsZS1zeXN0ZW0gd2F0Y2hlciBvbiB0aGUgcmVtb3RlIGVuZHBvaW50IGFuZCByZXR1cm4gYVxuXHQgKiBoYW5kbGUgd2hvc2UgYG9uRGlkQ2hhbmdlYCBldmVudCBmaXJlcyBmb3IgZXZlcnkgY2hhbmdlIHRoZSByZW1vdGVcblx0ICogcmVwb3J0cyB1bmRlciB0aGUgd2F0Y2hlZCByb290LiBEaXNwb3NpbmcgdGhlIGhhbmRsZSB1bnN1YnNjcmliZXNcblx0ICogdGhlIHdhdGNoIChzdWJqZWN0IHRvIHRoZSByZWNlaXZlcidzIGdyYWNlIHdpbmRvdykuXG5cdCAqXG5cdCAqIE9wdGlvbmFsOiBpbXBsZW1lbnRhdGlvbnMgd2l0aG91dCBzdWJzY3JpcHRpb24gbWFjaGluZXJ5IG9taXQgaXQ7IHRoZVxuXHQgKiBmaWxlc3lzdGVtIHByb3ZpZGVyIGRlZ3JhZGVzIHRvIGEgbm8tb3AgYHdhdGNoKClgIGluIHRoYXQgY2FzZS5cblx0ICovXG5cdHdhdGNoUmVzb3VyY2U/KHBhcmFtczogQ3JlYXRlUmVzb3VyY2VXYXRjaFBhcmFtcyk6IFByb21pc2U8SVJlbW90ZVdhdGNoSGFuZGxlPjtcbn1cblxuLyoqXG4gKiBIYW5kbGUgZm9yIGEgcmVtb3RlIGZpbGUtc3lzdGVtIHdhdGNoZXIgcmV0dXJuZWQgYnlcbiAqIHtAbGluayBJUmVtb3RlRmlsZXN5c3RlbUNvbm5lY3Rpb24ud2F0Y2hSZXNvdXJjZX0uIE1pcnJvcnMgdGhlIHNoYXBlXG4gKiBvZiBgSUZpbGVTeXN0ZW1XYXRjaGVyYCBmcm9tIGAuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanNgIHNvIHRoZSBGU1xuICogcHJvdmlkZXIgY2FuIHBsdWcgZXZlbnRzIHN0cmFpZ2h0IGludG8gaXRzIG93biBgb25EaWRDaGFuZ2VGaWxlYFxuICogZW1pdHRlci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUmVtb3RlV2F0Y2hIYW5kbGUgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxyZWFkb25seSBJRmlsZUNoYW5nZVtdPjtcbn1cblxuLyoqXG4gKiBTaGFyZWQgaW1wbGVtZW50YXRpb24gb2Yge0BsaW5rIElBZ2VudENvbm5lY3Rpb24ud2F0Y2hSZXNvdXJjZX0gXHUyMDE0XG4gKiBidW5kbGVzIGBjcmVhdGVSZXNvdXJjZVdhdGNoYCArIGBzdWJzY3JpYmVgICsgYSBwZXItY2hhbm5lbCBsaXN0ZW5lclxuICogb24gdGhlIGFjdGlvbiBzdHJlYW0gaW50byBhbiB7QGxpbmsgSVJlbW90ZVdhdGNoSGFuZGxlfS4gVXNlZCBieVxuICogZXZlcnkgdHJhbnNwb3J0IHRoYXQgZXhwb3NlcyB0aG9zZSBmb3VyIHByaW1pdGl2ZXMgc28gd2UgZG9uJ3QgbmVlZFxuICogdG8gZHVwbGljYXRlIHRoZSB3aXJlIGJvb2trZWVwaW5nIGluIGVhY2ggYElBZ2VudENvbm5lY3Rpb25gXG4gKiBpbXBsZW1lbnRhdGlvbi5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVJlbW90ZVdhdGNoSGFuZGxlKFxuXHRwcmltaXRpdmVzOiB7XG5cdFx0Y3JlYXRlUmVzb3VyY2VXYXRjaChwYXJhbXM6IENyZWF0ZVJlc291cmNlV2F0Y2hQYXJhbXMpOiBQcm9taXNlPHsgY2hhbm5lbDogc3RyaW5nIH0+O1xuXHRcdHN1YnNjcmliZShjaGFubmVsOiBVUkkpOiBQcm9taXNlPHVua25vd24+O1xuXHRcdHVuc3Vic2NyaWJlKGNoYW5uZWw6IFVSSSk6IHZvaWQ7XG5cdFx0b25EaWRBY3Rpb246IEV2ZW50PEFjdGlvbkVudmVsb3BlPjtcblx0fSxcblx0cGFyYW1zOiBDcmVhdGVSZXNvdXJjZVdhdGNoUGFyYW1zLFxuKTogUHJvbWlzZTxJUmVtb3RlV2F0Y2hIYW5kbGU+IHtcblx0Y29uc3QgeyBjaGFubmVsIH0gPSBhd2FpdCBwcmltaXRpdmVzLmNyZWF0ZVJlc291cmNlV2F0Y2gocGFyYW1zKTtcblx0Y29uc3QgY2hhbm5lbFVyaSA9IFVSSS5wYXJzZShjaGFubmVsKTtcblx0YXdhaXQgcHJpbWl0aXZlcy5zdWJzY3JpYmUoY2hhbm5lbFVyaSk7XG5cdGNvbnN0IG9uRGlkQ2hhbmdlRW1pdHRlciA9IG5ldyBFbWl0dGVyPHJlYWRvbmx5IElGaWxlQ2hhbmdlW10+KCk7XG5cdGNvbnN0IGxpc3RlbmVyID0gcHJpbWl0aXZlcy5vbkRpZEFjdGlvbihlbnZlbG9wZSA9PiB7XG5cdFx0aWYgKGVudmVsb3BlLmNoYW5uZWwgIT09IGNoYW5uZWwgfHwgZW52ZWxvcGUuYWN0aW9uLnR5cGUgIT09IEFjdGlvblR5cGUuUmVzb3VyY2VXYXRjaENoYW5nZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaXRlbXMgPSBlbnZlbG9wZS5hY3Rpb24uY2hhbmdlcz8uaXRlbXMgPz8gW107XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRvbkRpZENoYW5nZUVtaXR0ZXIuZmlyZShpdGVtcy5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShpdGVtLnVyaSksXG5cdFx0XHR0eXBlOiBpdGVtLnR5cGUgPT09ICdhZGRlZCcgPyBGaWxlQ2hhbmdlVHlwZS5BRERFRFxuXHRcdFx0XHQ6IGl0ZW0udHlwZSA9PT0gJ2RlbGV0ZWQnID8gRmlsZUNoYW5nZVR5cGUuREVMRVRFRFxuXHRcdFx0XHRcdDogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCxcblx0XHR9KSkpO1xuXHR9KTtcblx0bGV0IGRpc3Bvc2VkID0gZmFsc2U7XG5cdHJldHVybiB7XG5cdFx0b25EaWRDaGFuZ2U6IG9uRGlkQ2hhbmdlRW1pdHRlci5ldmVudCxcblx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRpZiAoZGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0b25EaWRDaGFuZ2VFbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHByaW1pdGl2ZXMudW5zdWJzY3JpYmUoY2hhbm5lbFVyaSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gQ29ubmVjdGlvbiBtYXkgYWxyZWFkeSBiZSBnb25lOyB0aGUgc2VydmVyLXNpZGUgZ3JhY2Vcblx0XHRcdFx0Ly8gdGltZXIgd2lsbCBjbGVhbiB1cC5cblx0XHRcdH1cblx0XHR9LFxuXHR9O1xufVxuXG4vKipcbiAqIEJ1aWxkIGEge0BsaW5rIEFHRU5UX0hPU1RfU0NIRU1FfSBVUkkgZm9yIGEgZ2l2ZW4gY29ubmVjdGlvbiBhdXRob3JpdHlcbiAqIGFuZCByZW1vdGUgcGF0aC4gQXNzdW1lcyB0aGUgcmVtb3RlIHBhdGggaXMgYSBgZmlsZTovL2AgcmVzb3VyY2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZ2VudEhvc3RVcmkoYXV0aG9yaXR5OiBzdHJpbmcsIHBhdGg6IHN0cmluZyk6IFVSSSB7XG5cdHJldHVybiB0b0FnZW50SG9zdFVyaShVUkkuZmlsZShwYXRoKSwgYXV0aG9yaXR5KTtcbn1cblxuLyoqXG4gKiBFeHRyYWN0IHRoZSByZW1vdGUgZmlsZXN5c3RlbSBwYXRoIGZyb20gYSB7QGxpbmsgQUdFTlRfSE9TVF9TQ0hFTUV9IFVSSS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFnZW50SG9zdFJlbW90ZVBhdGgodXJpOiBVUkkpOiBzdHJpbmcge1xuXHRyZXR1cm4gZnJvbUFnZW50SG9zdFVyaSh1cmkpLnBhdGg7XG59XG5cbi8vIC0tLS0gQWJzdHJhY3QgYmFzZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmludGVyZmFjZSBJQXV0aG9yaXR5RW50cnkge1xuXHQvKipcblx0ICogQWxsIGN1cnJlbnRseS1yZWdpc3RlcmVkIGNvbm5lY3Rpb25zIGZvciB0aGlzIGF1dGhvcml0eSwgb2xkZXN0XG5cdCAqIGZpcnN0LiBUaGUgYWN0aXZlIGNvbm5lY3Rpb24gaXMgdGhlIGxhc3QgZW50cnkgKG1vc3QgcmVjZW50XG5cdCAqIHJlZ2lzdHJhdGlvbiB3aW5zKS4gT2xkZXIgcmVnaXN0cmF0aW9ucyBhcmUga2VwdCBzbyB0aGF0IGlmIGFcblx0ICogY2FsbGVyIHJlZ2lzdGVycyBgQWAsIHRoZW4gYEJgLCB0aGVuIGRpc3Bvc2VzIGBCYCwgd2UgdHJhbnNwYXJlbnRseVxuXHQgKiBmYWxsIGJhY2sgdG8gYEFgIGluc3RlYWQgb2YgZW50ZXJpbmcgYSBncmFjZSB3aW5kb3cuXG5cdCAqXG5cdCAqIEVtcHR5IHdoaWxlIHRoZSBlbnRyeSBpcyBpbnNpZGUgdGhlIGdyYWNlIHdpbmRvdy5cblx0ICovXG5cdGNvbm5lY3Rpb25zOiBJUmVtb3RlRmlsZXN5c3RlbUNvbm5lY3Rpb25bXTtcblx0LyoqXG5cdCAqIFBlbmRpbmcgZXZpY3Rpb24gdGltZXI7IGFybWVkIHdoaWxlIHtAbGluayBjb25uZWN0aW9uc30gaXMgZW1wdHksXG5cdCAqIGNsZWFyZWQgb24gcmUtcmVnaXN0cmF0aW9uIG9yIGV2aWN0aW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgZXhwaXJ5OiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT47XG59XG5cbi8qKlxuICoge0BsaW5rIElGaWxlU3lzdGVtUHJvdmlkZXJ9IHRoYXQgcHJveGllcyBmaWxlc3lzdGVtIG9wZXJhdGlvbnNcbiAqIHRocm91Z2ggYSB7QGxpbmsgSVJlbW90ZUZpbGVzeXN0ZW1Db25uZWN0aW9ufS5cbiAqXG4gKiBVUklzIGVuY29kZSB0aGUgb3JpZ2luYWwgc2NoZW1lIGFuZCBhdXRob3JpdHkgaW4gdGhlIHBhdGggc28gYW55IHJlbW90ZVxuICogcmVzb3VyY2UgY2FuIGJlIHJlcHJlc2VudGVkLiBTdWJjbGFzc2VzIHByb3ZpZGUgdGhlIFVSSSBkZWNvZGUgZnVuY3Rpb25cbiAqIGFuZCBzY2hlbWUtc3BlY2lmaWMgaGVscGVycy5cbiAqXG4gKiBJbmRpdmlkdWFsIGNvbm5lY3Rpb25zIGFyZSBpZGVudGlmaWVkIGJ5IHRoZSBVUkkncyBhdXRob3JpdHkgY29tcG9uZW50LlxuICovXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQUhQRmlsZVN5c3RlbVByb3ZpZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElGaWxlU3lzdGVtUHJvdmlkZXIsIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWxwYXRoQ2FwYWJpbGl0eSB7XG5cblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzID1cblx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmUgfFxuXHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlIHxcblx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUZvbGRlckNvcHkgfFxuXHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhbHBhdGg7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMgPSB0aGlzLl9vbkRpZENoYW5nZUNhcGFiaWxpdGllcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUZpbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJRmlsZUNoYW5nZVtdPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGaWxlID0gdGhpcy5fb25EaWRDaGFuZ2VGaWxlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFdhdGNoRXJyb3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZFdhdGNoRXJyb3IgPSB0aGlzLl9vbkRpZFdhdGNoRXJyb3IuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIFBlci1hdXRob3JpdHkgcmVnaXN0cmF0aW9uIHNsb3QuIFdlIGtlZXAgdGhlIHNsb3QgYWxpdmUgZm9yIGEgYnJpZWZcblx0ICogZ3JhY2UgcGVyaW9kIGFmdGVyIHRoZSBsYXN0IHJlZ2lzdHJhdGlvbiBpcyBkaXNwb3NlZCwgc28gYW5cblx0ICogb3BlcmF0aW9uIGlzc3VlZCBkdXJpbmcgYSByZWNvbm5lY3Rpb24gd2luZG93IGNhbiB3YWl0IGZvciB0aGVcblx0ICogcmVwbGFjZW1lbnQgcmVnaXN0cmF0aW9uIGluc3RlYWQgb2YgZmFpbGluZyBpbW1lZGlhdGVseS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dGhvcml0aWVzID0gbmV3IE1hcDxzdHJpbmcsIElBdXRob3JpdHlFbnRyeT4oKTtcblxuXHQvKipcblx0ICogRmlyZXMgdGhlIGF1dGhvcml0eSB3aG9zZSBhY3RpdmUgY29ubmVjdGlvbiBoYXMgY2hhbmdlZDogYWRkZWQsXG5cdCAqIHJlcGxhY2VkLCBmYWxsZW4gYmFjayB0byBhbiBvbGRlciByZWdpc3RyYXRpb24sIGVudGVyZWQgdGhlIGdyYWNlXG5cdCAqIHdpbmRvdyAobm8gYWN0aXZlIGNvbm5lY3Rpb24pLCBvciBldmljdGVkLiBMb25nLWxpdmVkIGNvbnN1bWVyc1xuXHQgKiAoZS5nLiB7QGxpbmsgd2F0Y2h9KSBzdWJzY3JpYmUgaGVyZSBzbyB0aGV5IGNvbnRpbnVlIHRvIHJlY2VpdmVcblx0ICogbm90aWZpY2F0aW9ucyBhY3Jvc3MgZnVsbCBlbnRyeSBldmljdGlvbiArIGxhdGVyIHJlLWNyZWF0aW9uIFx1MjAxNFxuXHQgKiBzb21ldGhpbmcgYSBwZXItZW50cnkgZW1pdHRlciBjYW5ub3Qgb2ZmZXIuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbm5lY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXG5cdC8qKlxuXHQgKiBHcmFjZSBwZXJpb2QgZHVyaW5nIHdoaWNoIHtAbGluayBfZ2V0Q29ubmVjdGlvbn0gd2lsbCBhd2FpdCBhIG5ld1xuXHQgKiByZWdpc3RyYXRpb24gYWZ0ZXIgdGhlIHByZXZpb3VzIG9uZSBpcyBkaXNwb3NlZC4gQ292ZXJzIHRoZSB3aW5kb3dcblx0ICogd2hlcmUgYSB0cmFuc3BvcnQgaXMgYnJpZWZseSB0b3JuIGRvd24gYW5kIHJlLXJlZ2lzdGVyZWQgKGUuZy4gYW5cblx0ICogYWdlbnQtaG9zdCBjbGllbnQgcmVjb25uZWN0IHRoYXQgcmFjZXMgYSBwbHVnaW4gc3luYykuIDVzIG1hdGNoZXNcblx0ICogdGhlIHR5cGljYWwgcmVjb25uZWN0IHRpbWVvdXQuIENvbnN1bWVycyBzaG91bGQgc3RpbGwgaW1wbGVtZW50XG5cdCAqIGxvZ2ljYWwgcmV0cmllcyBmb3IgbG9uZ2VyIHJlY29ubmVjdGlvbiBsYXRlbmNpZXMsIGJ1dCB0aGlzIGlzIGFcblx0ICogbG93IGxldmVsLCBiZXN0LWVmZm9ydCBtZWNoYW5pc20uXG5cdCAqXG5cdCAqIFRlc3RzIGNhbiBvdmVycmlkZSB0aGlzIHZpYSB0aGUgY29uc3RydWN0b3IgcGFyYW1ldGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0RFRkFVTFRfQ09OTkVDVElPTl9HUkFDRV9NUyA9IDUwMDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvbkdyYWNlTXM6IG51bWJlciA9IEFIUEZpbGVTeXN0ZW1Qcm92aWRlci5fREVGQVVMVF9DT05ORUNUSU9OX0dSQUNFX01TLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVyIGEgbWFwcGluZyBmcm9tIGEgVVJJIGF1dGhvcml0eSB0byBhIGNvbm5lY3Rpb24uXG5cdCAqIFJldHVybnMgYSBkaXNwb3NhYmxlIHRoYXQgdW5yZWdpc3RlcnMgdGhlIG1hcHBpbmcuIE11bHRpcGxlXG5cdCAqIGNvbmN1cnJlbnQgcmVnaXN0cmF0aW9ucyBmb3IgdGhlIHNhbWUgYXV0aG9yaXR5IGFyZSBzdXBwb3J0ZWQ7XG5cdCAqIHRoZSBtb3N0IHJlY2VudCByZWdpc3RyYXRpb24gd2lucywgYW5kIGRpc3Bvc2luZyBpdCBmYWxscyBiYWNrIHRvXG5cdCAqIHRoZSBwcmV2aW91cyBvbmUgKGlmIGFueSkuIEFmdGVyIHRoZSAqbGFzdCogcmVnaXN0cmF0aW9uIGlzXG5cdCAqIGRpc3Bvc2VkIHRoZSBlbnRyeSBpcyBoZWxkIG9wZW4gZm9yIHtAbGluayBfY29ubmVjdGlvbkdyYWNlTXN9IHNvXG5cdCAqIHRoYXQgYSByZWNvbm5lY3QgY2FuIHJlcGxhY2UgaXQgd2l0aG91dCBvcnBoYW5pbmcgaW4tZmxpZ2h0XG5cdCAqIG9wZXJhdGlvbnMuXG5cdCAqL1xuXHRyZWdpc3RlckF1dGhvcml0eShhdXRob3JpdHk6IHN0cmluZywgY29ubmVjdGlvbjogSVJlbW90ZUZpbGVzeXN0ZW1Db25uZWN0aW9uKTogSURpc3Bvc2FibGUge1xuXHRcdGxldCBlbnRyeSA9IHRoaXMuX2F1dGhvcml0aWVzLmdldChhdXRob3JpdHkpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdGVudHJ5ID0ge1xuXHRcdFx0XHRjb25uZWN0aW9uczogW2Nvbm5lY3Rpb25dLFxuXHRcdFx0XHRleHBpcnk6IG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSxcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9hdXRob3JpdGllcy5zZXQoYXV0aG9yaXR5LCBlbnRyeSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVudHJ5LmV4cGlyeS5jbGVhcigpO1xuXHRcdFx0ZW50cnkuY29ubmVjdGlvbnMucHVzaChjb25uZWN0aW9uKTtcblx0XHR9XG5cdFx0Y29uc3QgYWRvcHRlZCA9IGVudHJ5O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbi5maXJlKGF1dGhvcml0eSk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnN0IGlkeCA9IGFkb3B0ZWQuY29ubmVjdGlvbnMuaW5kZXhPZihjb25uZWN0aW9uKTtcblx0XHRcdGlmIChpZHggPT09IC0xKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHdhc0FjdGl2ZSA9IGlkeCA9PT0gYWRvcHRlZC5jb25uZWN0aW9ucy5sZW5ndGggLSAxO1xuXHRcdFx0YWRvcHRlZC5jb25uZWN0aW9ucy5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdGlmIChhZG9wdGVkLmNvbm5lY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRhZG9wdGVkLmV4cGlyeS52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KFxuXHRcdFx0XHRcdCgpID0+IHRoaXMuX2V4cGlyZUF1dGhvcml0eShhdXRob3JpdHksIGFkb3B0ZWQpLFxuXHRcdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25HcmFjZU1zLFxuXHRcdFx0XHRcdHRoaXMuX3N0b3JlLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAod2FzQWN0aXZlKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbi5maXJlKGF1dGhvcml0eSk7IC8vIEZhbGxpbmcgYmFjayB0byBhbiBvbGRlciBjb25uZWN0aW9uIFx1MjAxNCBzdXJmYWNlIHRoZSBjaGFuZ2UuXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9leHBpcmVBdXRob3JpdHkoYXV0aG9yaXR5OiBzdHJpbmcsIGVudHJ5OiBJQXV0aG9yaXR5RW50cnkpOiB2b2lkIHtcblx0XHQvLyBBIHJlLXJlZ2lzdHJhdGlvbiBtYXkgaGF2ZSBsYW5kZWQgYmV0d2VlbiBzY2hlZHVsaW5nIGFuZFxuXHRcdC8vIGZpcmluZyBcdTIwMTQgYmFpbCBpbiB0aGF0IGNhc2UuXG5cdFx0aWYgKHRoaXMuX2F1dGhvcml0aWVzLmdldChhdXRob3JpdHkpICE9PSBlbnRyeSB8fCBlbnRyeS5jb25uZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2F1dGhvcml0aWVzLmRlbGV0ZShhdXRob3JpdHkpO1xuXHRcdGVudHJ5LmV4cGlyeS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9uLmZpcmUoYXV0aG9yaXR5KTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9hdXRob3JpdGllcy52YWx1ZXMoKSkge1xuXHRcdFx0ZW50cnkuZXhwaXJ5LmRpc3Bvc2UoKTtcblx0XHRcdGVudHJ5LmNvbm5lY3Rpb25zLmxlbmd0aCA9IDA7XG5cdFx0fVxuXHRcdHRoaXMuX2F1dGhvcml0aWVzLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqIERlY29kZSBhIHByb3ZpZGVyIFVSSSBiYWNrIHRvIHRoZSBvcmlnaW5hbCBVUkkgZm9yIHRoZSByZW1vdGUgZW5kcG9pbnQuICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZGVjb2RlVXJpKHJlc291cmNlOiBVUkkpOiBVUkk7XG5cblx0LyoqIEVuY29kZSBhIHJlbW90ZSBVUkkgYmFjayBpbnRvIGEgcHJvdmlkZXIgVVJJIHdpdGggdGhlIGdpdmVuIGF1dGhvcml0eS4gKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9lbmNvZGVVcmkocmVzb3VyY2U6IFVSSSwgYXV0aG9yaXR5OiBzdHJpbmcpOiBVUkk7XG5cblx0d2F0Y2gocmVzb3VyY2U6IFVSSSwgb3B0czogSVdhdGNoT3B0aW9ucyk6IElEaXNwb3NhYmxlIHtcblx0XHQvLyBgSUZpbGVTeXN0ZW1Qcm92aWRlci53YXRjaGAgaXMgc3luY2hyb25vdXMsIGJ1dCBhY3F1aXJpbmcgYVxuXHRcdC8vIGNvbm5lY3Rpb24gbWF5IGhhdmUgdG8gd2FpdCBmb3IgYSAocmUpcmVnaXN0cmF0aW9uIGFuZCB0aGVcblx0XHQvLyB1bmRlcmx5aW5nIEFIUCBgY3JlYXRlUmVzb3VyY2VXYXRjaGAgKyBgc3Vic2NyaWJlYCByb3VuZC10cmlwXG5cdFx0Ly8gaXMgaXRzZWxmIGFzeW5jLiBBZGRpdGlvbmFsbHksIHdhdGNoZXJzIGFyZSBsb25nLWxpdmVkOiBldmVyeVxuXHRcdC8vIHRpbWUgdGhlIGFjdGl2ZSBjb25uZWN0aW9uIGZvciBgYXV0aG9yaXR5YCBjaGFuZ2VzIChyZWNvbm5lY3QsXG5cdFx0Ly8gZmFsbGJhY2sgdG8gYW4gb2xkZXIgcmVnaXN0cmF0aW9uLCBldmljdGlvbiBmb2xsb3dlZCBieSBhIGZyZXNoXG5cdFx0Ly8gcmVnaXN0cmF0aW9uLCAuLi4pIHdlIHRlYXIgZG93biBhbnkgZXhpc3RpbmcgcmVtb3RlIGhhbmRsZSBhbmRcblx0XHQvLyByZS1hdHRhY2ggYWdhaW5zdCB0aGUgbmV3IGNvbm5lY3Rpb24uIFRoZSBjbGFzcy1sZXZlbFxuXHRcdC8vIHtAbGluayBfb25EaWRDaGFuZ2VDb25uZWN0aW9ufSBldmVudCBrZWVwcyB1cyBpbmZvcm1lZCBhY3Jvc3Ncblx0XHQvLyB0aGUgZnVsbCBlbnRyeS1ldmljdGlvbiBjeWNsZS5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBoYW5kbGVIb2xkZXIgPSBzdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0XHRjb25zdCBhdXRob3JpdHkgPSByZXNvdXJjZS5hdXRob3JpdHk7XG5cdFx0Y29uc3QgcGFyYW1zOiBDcmVhdGVSZXNvdXJjZVdhdGNoUGFyYW1zID0ge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmk6IHRoaXMuX2RlY29kZVVyaShyZXNvdXJjZSkudG9TdHJpbmcoKSxcblx0XHRcdHJlY3Vyc2l2ZTogb3B0cy5yZWN1cnNpdmUsXG5cdFx0XHQuLi4ob3B0cy5leGNsdWRlcy5sZW5ndGggPiAwID8geyBleGNsdWRlczogeyBpdGVtczogWy4uLm9wdHMuZXhjbHVkZXNdIH0gfSA6IHt9KSxcblx0XHRcdC4uLihvcHRzLmluY2x1ZGVzICYmIG9wdHMuaW5jbHVkZXMubGVuZ3RoID4gMFxuXHRcdFx0XHQ/IHsgaW5jbHVkZXM6IHsgaXRlbXM6IG9wdHMuaW5jbHVkZXMubWFwKHAgPT4gdHlwZW9mIHAgPT09ICdzdHJpbmcnID8gcCA6IHAucGF0dGVybikgfSB9XG5cdFx0XHRcdDoge30pLFxuXHRcdH07XG5cblx0XHQvLyBUcmFjayB3aGljaCBjb25uZWN0aW9uIHRoZSBjdXJyZW50IGhhbmRsZSB3YXMgY3JlYXRlZCBhZ2FpbnN0XG5cdFx0Ly8gc28gd2UgaWdub3JlIHNwdXJpb3VzIGNoYW5nZSBldmVudHMgdGhhdCBkb24ndCByZXByZXNlbnQgYVxuXHRcdC8vIHJlYWwgc3dhcCAoZS5nLiBhIHN0YWxlIHJlZ2lzdHJhdGlvbiBkaXNwb3NhbCkuXG5cdFx0bGV0IGF0dGFjaGVkOiBJUmVtb3RlRmlsZXN5c3RlbUNvbm5lY3Rpb24gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGF0dGFjaGluZyA9IGZhbHNlO1xuXHRcdGxldCBwZW5kaW5nUmVhdHRhY2ggPSBmYWxzZTtcblxuXHRcdGNvbnN0IHJlYXR0YWNoID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0aWYgKHN0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGF0dGFjaGluZykge1xuXHRcdFx0XHRwZW5kaW5nUmVhdHRhY2ggPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2F1dGhvcml0aWVzLmdldChhdXRob3JpdHkpO1xuXHRcdFx0Y29uc3QgbmV4dCA9IGVudHJ5Py5jb25uZWN0aW9ucy5hdCgtMSk7XG5cdFx0XHRpZiAobmV4dCA9PT0gYXR0YWNoZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aGFuZGxlSG9sZGVyLmNsZWFyKCk7XG5cdFx0XHRhdHRhY2hlZCA9IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHdhdGNoUmVzb3VyY2UgPSBuZXh0Py53YXRjaFJlc291cmNlO1xuXHRcdFx0aWYgKCFuZXh0IHx8ICF3YXRjaFJlc291cmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF0dGFjaGluZyA9IHRydWU7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBuZXh0O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgd2F0Y2hSZXNvdXJjZS5jYWxsKHRhcmdldCwgcGFyYW1zKTtcblx0XHRcdFx0aWYgKHN0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fYXV0aG9yaXRpZXMuZ2V0KGF1dGhvcml0eSk7XG5cdFx0XHRcdGlmICghY3VycmVudCB8fCBjdXJyZW50LmNvbm5lY3Rpb25zLmF0KC0xKSAhPT0gdGFyZ2V0KSB7XG5cdFx0XHRcdFx0Ly8gQWN0aXZlIGNvbm5lY3Rpb24gY2hhbmdlZCB1bmRlcm5lYXRoIHVzIFx1MjAxNCB0b3NzIHRoaXNcblx0XHRcdFx0XHQvLyBoYW5kbGUgYW5kIGxldCB0aGUgcGVuZGluZyByZWF0dGFjaCBwaWNrIHRoZSBuZXcgb25lLlxuXHRcdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHN1YiA9IGhhbmRsZS5vbkRpZENoYW5nZShjaGFuZ2VzID0+IHRoaXMuX29uRGlkQ2hhbmdlRmlsZS5maXJlKGNoYW5nZXMubWFwKGMgPT4gKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogdGhpcy5fZW5jb2RlVXJpKGMucmVzb3VyY2UsIHJlc291cmNlLmF1dGhvcml0eSksXG5cdFx0XHRcdFx0dHlwZTogYy50eXBlLFxuXHRcdFx0XHR9KSkpKTtcblx0XHRcdFx0aGFuZGxlSG9sZGVyLnZhbHVlID0gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhdHRhY2hlZCA9IHRhcmdldDtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFdhdGNoRXJyb3IuZmlyZShlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycikpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXR0YWNoaW5nID0gZmFsc2U7XG5cdFx0XHRcdGlmIChwZW5kaW5nUmVhdHRhY2gpIHtcblx0XHRcdFx0XHRwZW5kaW5nUmVhdHRhY2ggPSBmYWxzZTtcblx0XHRcdFx0XHR2b2lkIHJlYXR0YWNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbi5ldmVudChhID0+IHtcblx0XHRcdGlmIChhID09PSBhdXRob3JpdHkpIHtcblx0XHRcdFx0dm9pZCByZWF0dGFjaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR2b2lkIHJlYXR0YWNoKCk7XG5cblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cblxuXHRhc3luYyBzdGF0KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElTdGF0PiB7XG5cdFx0Y29uc3QgcGF0aCA9IHJlc291cmNlLnBhdGg7XG5cblx0XHRpZiAocGF0aCA9PT0gJy8nIHx8IHBhdGggPT09ICcnKSB7XG5cdFx0XHRyZXR1cm4geyB0eXBlOiBGaWxlVHlwZS5EaXJlY3RvcnksIG10aW1lOiAwLCBjdGltZTogMCwgc2l6ZTogMCwgcGVybWlzc2lvbnM6IEZpbGVQZXJtaXNzaW9uLlJlYWRvbmx5IH07XG5cdFx0fVxuXHRcdGNvbnN0IGRlY29kZWQgPSB0aGlzLl9kZWNvZGVVcmkocmVzb3VyY2UpO1xuXHRcdGlmIChkZWNvZGVkLnNjaGVtZSA9PT0gJ3Nlc3Npb24tZGInIHx8IGRlY29kZWQuc2NoZW1lID09PSAnZ2l0LWJsb2InKSB7XG5cdFx0XHRyZXR1cm4geyB0eXBlOiBGaWxlVHlwZS5GaWxlLCBtdGltZTogMCwgY3RpbWU6IDAsIHNpemU6IDAsIHBlcm1pc3Npb25zOiBGaWxlUGVybWlzc2lvbi5SZWFkb25seSB9O1xuXHRcdH1cblxuXHRcdGlmIChkZWNvZGVkLnBhdGggPT09ICcvJyB8fCBkZWNvZGVkLnBhdGggPT09ICcnKSB7XG5cdFx0XHRyZXR1cm4geyB0eXBlOiBGaWxlVHlwZS5EaXJlY3RvcnksIG10aW1lOiAwLCBjdGltZTogMCwgc2l6ZTogMCwgcGVybWlzc2lvbnM6IEZpbGVQZXJtaXNzaW9uLlJlYWRvbmx5IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMuX2dldENvbm5lY3Rpb24ocmVzb3VyY2UuYXV0aG9yaXR5KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlKGNvbm5lY3Rpb24sIGRlY29kZWQpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiByZXNvbHZlZC50eXBlID09PSAnZGlyZWN0b3J5JyA/IEZpbGVUeXBlLkRpcmVjdG9yeVxuXHRcdFx0XHRcdDogcmVzb2x2ZWQudHlwZSA9PT0gJ3N5bWxpbmsnID8gRmlsZVR5cGUuU3ltYm9saWNMaW5rXG5cdFx0XHRcdFx0XHQ6IEZpbGVUeXBlLkZpbGUsXG5cdFx0XHRcdG10aW1lOiByZXNvbHZlZC5tdGltZSA/IERhdGUucGFyc2UocmVzb2x2ZWQubXRpbWUpIDogMCxcblx0XHRcdFx0Y3RpbWU6IHJlc29sdmVkLmN0aW1lID8gRGF0ZS5wYXJzZShyZXNvbHZlZC5jdGltZSkgOiAwLFxuXHRcdFx0XHRzaXplOiByZXNvbHZlZC5zaXplID8/IDAsXG5cdFx0XHR9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhyb3cgdGhpcy5fbWFwRXJyb3IoZXJyLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEZvdW5kKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZWFscGF0aChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBwYXRoID0gcmVzb3VyY2UucGF0aDtcblx0XHQvLyBTeW50aGV0aWMgcm9vdHMgYW5kIHZpcnR1YWwgY29udGVudCBzY2hlbWVzIGhhdmUgbm8gZGlzdGluY3Rcblx0XHQvLyBjYW5vbmljYWwgcGF0aCBcdTIwMTQgcmV0dXJuIHRoZSBpbnB1dCBwYXRoIHVuY2hhbmdlZC5cblx0XHRpZiAocGF0aCA9PT0gJy8nIHx8IHBhdGggPT09ICcnKSB7XG5cdFx0XHRyZXR1cm4gcGF0aDtcblx0XHR9XG5cdFx0Y29uc3QgZGVjb2RlZCA9IHRoaXMuX2RlY29kZVVyaShyZXNvdXJjZSk7XG5cdFx0aWYgKGRlY29kZWQuc2NoZW1lID09PSAnc2Vzc2lvbi1kYicgfHwgZGVjb2RlZC5zY2hlbWUgPT09ICdnaXQtYmxvYicgfHwgZGVjb2RlZC5wYXRoID09PSAnLycgfHwgZGVjb2RlZC5wYXRoID09PSAnJykge1xuXHRcdFx0cmV0dXJuIHBhdGg7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLl9nZXRDb25uZWN0aW9uKHJlc291cmNlLmF1dGhvcml0eSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5fcmVzb2x2ZShjb25uZWN0aW9uLCBkZWNvZGVkKTtcblx0XHRcdC8vIGByZXNvbHZlZC51cmlgIGlzIHRoZSByZW1vdGUgY2Fub25pY2FsIChyZWFscGF0aCkgVVJJLiBSZS1lbmNvZGVcblx0XHRcdC8vIGl0IGJhY2sgaW50byBwcm92aWRlciBzcGFjZTsgdGhlIGZpbGUgc2VydmljZSBhcHBsaWVzIHRoZVxuXHRcdFx0Ly8gcmV0dXJuZWQgcGF0aCBvbnRvIHRoZSBvcmlnaW5hbCBwcm92aWRlciBVUkkuXG5cdFx0XHRyZXR1cm4gdGhpcy5fZW5jb2RlVXJpKFVSSS5wYXJzZShyZXNvbHZlZC51cmkpLCByZXNvdXJjZS5hdXRob3JpdHkpLnBhdGg7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aHJvdyB0aGlzLl9tYXBFcnJvcihlcnIsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlYWRkaXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8W3N0cmluZywgRmlsZVR5cGVdW10+IHtcblx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgdGhpcy5fbGlzdERpcmVjdG9yeShyZXNvdXJjZS5hdXRob3JpdHksIHJlc291cmNlKTtcblx0XHRyZXR1cm4gZW50cmllcy5tYXAoZSA9PiBbZS5uYW1lLCBlLnR5cGUgPT09ICdkaXJlY3RvcnknID8gRmlsZVR5cGUuRGlyZWN0b3J5IDogRmlsZVR5cGUuRmlsZV0pO1xuXHR9XG5cblx0YXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VWludDhBcnJheT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLl9nZXRDb25uZWN0aW9uKHJlc291cmNlLmF1dGhvcml0eSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsVXJpID0gdGhpcy5fZGVjb2RlVXJpKHJlc291cmNlKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24ucmVzb3VyY2VSZWFkKG9yaWdpbmFsVXJpKTtcblx0XHRcdGlmIChyZXN1bHQuZW5jb2RpbmcgPT09IENvbnRlbnRFbmNvZGluZy5CYXNlNjQpIHtcblx0XHRcdFx0cmV0dXJuIGRlY29kZUJhc2U2NChyZXN1bHQuZGF0YSkuYnVmZmVyO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFZTQnVmZmVyLmZyb21TdHJpbmcocmVzdWx0LmRhdGEpLmJ1ZmZlcjtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRocm93IHRoaXMuX21hcEVycm9yKGVyciwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgd3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IFVpbnQ4QXJyYXksIF9vcHRzOiBJRmlsZVdyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLl9nZXRDb25uZWN0aW9uKHJlc291cmNlLmF1dGhvcml0eSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsVXJpID0gdGhpcy5fZGVjb2RlVXJpKHJlc291cmNlKTtcblx0XHRcdGF3YWl0IGNvbm5lY3Rpb24ucmVzb3VyY2VXcml0ZSh7XG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHR1cmk6IG9yaWdpbmFsVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGRhdGE6IFZTQnVmZmVyLndyYXAoY29udGVudCkudG9TdHJpbmcoKSxcblx0XHRcdFx0ZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4LFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aHJvdyB0aGlzLl9tYXBFcnJvcihlcnIsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBta2RpcihyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMuX2dldENvbm5lY3Rpb24ocmVzb3VyY2UuYXV0aG9yaXR5KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxVcmkgPSB0aGlzLl9kZWNvZGVVcmkocmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgY29ubmVjdGlvbi5yZXNvdXJjZU1rZGlyKHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogb3JpZ2luYWxVcmkudG9TdHJpbmcoKSB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRocm93IHRoaXMuX21hcEVycm9yKGVyciwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLk5vUGVybWlzc2lvbnMpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGRlbGV0ZShyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZURlbGV0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgdGhpcy5fZ2V0Q29ubmVjdGlvbihyZXNvdXJjZS5hdXRob3JpdHkpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFVyaSA9IHRoaXMuX2RlY29kZVVyaShyZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCBjb25uZWN0aW9uLnJlc291cmNlRGVsZXRlKHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogb3JpZ2luYWxVcmkudG9TdHJpbmcoKSwgcmVjdXJzaXZlOiBvcHRzLnJlY3Vyc2l2ZSB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRocm93IHRoaXMuX21hcEVycm9yKGVyciwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLk5vUGVybWlzc2lvbnMpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlbmFtZShmcm9tOiBVUkksIHRvOiBVUkksIG9wdHM6IElGaWxlT3ZlcndyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLl9nZXRDb25uZWN0aW9uKGZyb20uYXV0aG9yaXR5KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxGcm9tID0gdGhpcy5fZGVjb2RlVXJpKGZyb20pO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxUbyA9IHRoaXMuX2RlY29kZVVyaSh0byk7XG5cdFx0XHRhd2FpdCBjb25uZWN0aW9uLnJlc291cmNlTW92ZSh7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCBzb3VyY2U6IG9yaWdpbmFsRnJvbS50b1N0cmluZygpLCBkZXN0aW5hdGlvbjogb3JpZ2luYWxUby50b1N0cmluZygpLCBmYWlsSWZFeGlzdHM6ICFvcHRzLm92ZXJ3cml0ZSB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRocm93IHRoaXMuX21hcEVycm9yKGVyciwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLk5vUGVybWlzc2lvbnMpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNvcHkoZnJvbTogVVJJLCB0bzogVVJJLCBvcHRzOiBJRmlsZU92ZXJ3cml0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgdGhpcy5fZ2V0Q29ubmVjdGlvbihmcm9tLmF1dGhvcml0eSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsRnJvbSA9IHRoaXMuX2RlY29kZVVyaShmcm9tKTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsVG8gPSB0aGlzLl9kZWNvZGVVcmkodG8pO1xuXHRcdFx0YXdhaXQgY29ubmVjdGlvbi5yZXNvdXJjZUNvcHkoeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgc291cmNlOiBvcmlnaW5hbEZyb20udG9TdHJpbmcoKSwgZGVzdGluYXRpb246IG9yaWdpbmFsVG8udG9TdHJpbmcoKSwgZmFpbElmRXhpc3RzOiAhb3B0cy5vdmVyd3JpdGUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aHJvdyB0aGlzLl9tYXBFcnJvcihlcnIsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogTmVnb3RpYXRlIGFjY2VzcyB0byB7QGxpbmsgcmVzb3VyY2V9IHdpdGggdGhlIHJlY2VpdmVyLCBhc2tpbmcgZm9yIHRoZVxuXHQgKiBncmFudGVkIG1vZGVzIGluIHtAbGluayBvcHRzfS4gVXNlZCBhZnRlciBhIGBOb1Blcm1pc3Npb25zYCBmYWlsdXJlIHRvXG5cdCAqIHByb21wdCB0aGUgcmVjZWl2ZXIgdG8gZ3JhbnQgYWNjZXNzOyB0aGUgY2FsbGVyIGNhbiB0aGVuIHJldHJ5LlxuXHQgKlxuXHQgKiBSZXNvbHZlcyBvbiBzdWNjZXNzLiBSZWplY3RzIGlmIHRoZSByZWNlaXZlciBkZW5pZXMsIHRoZSBjb25uZWN0aW9uXG5cdCAqIGlzIG1pc3NpbmcsIG9yIHRoZSBjb25uZWN0aW9uIGRvZXNuJ3QgaW1wbGVtZW50IGByZXNvdXJjZVJlcXVlc3RgLlxuXHQgKi9cblx0YXN5bmMgcmVxdWVzdFJlc291cmNlQWNjZXNzKHJlc291cmNlOiBVUkksIG9wdHM6IHsgcmVhZG9ubHkgcmVhZD86IGJvb2xlYW47IHJlYWRvbmx5IHdyaXRlPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMuX2dldENvbm5lY3Rpb24ocmVzb3VyY2UuYXV0aG9yaXR5KTtcblx0XHRpZiAoIWNvbm5lY3Rpb24ucmVzb3VyY2VSZXF1ZXN0KSB7XG5cdFx0XHR0aHJvdyBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihcblx0XHRcdFx0YENvbm5lY3Rpb24gZm9yICR7cmVzb3VyY2UuYXV0aG9yaXR5fSBkb2VzIG5vdCBzdXBwb3J0IHJlc291cmNlUmVxdWVzdGAsXG5cdFx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5VbmF2YWlsYWJsZSxcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGNvbnN0IG9yaWdpbmFsVXJpID0gdGhpcy5fZGVjb2RlVXJpKHJlc291cmNlKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY29ubmVjdGlvbi5yZXNvdXJjZVJlcXVlc3Qoe1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0dXJpOiBvcmlnaW5hbFVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRyZWFkOiBvcHRzLnJlYWQsXG5cdFx0XHRcdHdyaXRlOiBvcHRzLndyaXRlLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aHJvdyB0aGlzLl9tYXBFcnJvcihlcnIsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIEludGVybmFscyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfZ2V0Q29ubmVjdGlvbihhdXRob3JpdHk6IHN0cmluZyk6IFByb21pc2U8SVJlbW90ZUZpbGVzeXN0ZW1Db25uZWN0aW9uPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9hdXRob3JpdGllcy5nZXQoYXV0aG9yaXR5KTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoXG5cdFx0XHRcdGBObyBjb25uZWN0aW9uIGZvciBhdXRob3JpdHk6ICR7YXV0aG9yaXR5fWAsXG5cdFx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5VbmF2YWlsYWJsZSxcblx0XHRcdCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZSA9IGVudHJ5LmNvbm5lY3Rpb25zLmF0KC0xKTtcblx0XHRpZiAoYWN0aXZlKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGFjdGl2ZSk7XG5cdFx0fVxuXHRcdC8vIEVudHJ5IGlzIGluc2lkZSBpdHMgZ3JhY2Ugd2luZG93IGFmdGVyIHRoZSBsYXN0IHJlZ2lzdHJhdGlvblxuXHRcdC8vIHdhcyBkaXNwb3NlZC4gV2FpdCB1bnRpbCBlaXRoZXIgYSBuZXcgcmVnaXN0cmF0aW9uIGFycml2ZXNcblx0XHQvLyAocmVzb2x2ZSkgb3IgdGhlIGdyYWNlIHRpbWVyIGV4cGlyZXMgYW5kIGV2aWN0cyB0aGUgZW50cnlcblx0XHQvLyAocmVqZWN0KS5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2V0dGxlID0gKCk6IHZvaWQgPT4ge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fYXV0aG9yaXRpZXMuZ2V0KGF1dGhvcml0eSk7XG5cdFx0XHRcdGlmICghY3VycmVudCkge1xuXHRcdFx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVqZWN0KGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKFxuXHRcdFx0XHRcdFx0YE5vIGNvbm5lY3Rpb24gZm9yIGF1dGhvcml0eTogJHthdXRob3JpdHl9YCxcblx0XHRcdFx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5VbmF2YWlsYWJsZSxcblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYyA9IGN1cnJlbnQuY29ubmVjdGlvbnMuYXQoLTEpO1xuXHRcdFx0XHRpZiAoYykge1xuXHRcdFx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZShjKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHN1YiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbi5ldmVudChhID0+IHtcblx0XHRcdFx0aWYgKGEgPT09IGF1dGhvcml0eSkge1xuXHRcdFx0XHRcdHNldHRsZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdC8vIFJlLWNoZWNrIGFmdGVyIHN1YnNjcmliaW5nIGluIGNhc2UgdGhlIHN0YXRlIGNoYW5nZWQgYmV0d2VlblxuXHRcdFx0Ly8gb3VyIGluaXRpYWwgY2hlY2sgYW5kIHRoZSBsaXN0ZW5lciByZWdpc3RyYXRpb24uXG5cdFx0XHRzZXR0bGUoKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFuc2xhdGUgYSB0aHJvd24gZXJyb3IgZnJvbSBhIHtAbGluayBJUmVtb3RlRmlsZXN5c3RlbUNvbm5lY3Rpb259XG5cdCAqIGludG8gYSB7QGxpbmsgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3J9LiBQcmVzZXJ2ZXMgYFBlcm1pc3Npb25EZW5pZWRgXG5cdCAqICgtMzIwMDkpIGFzIGBOb1Blcm1pc3Npb25zYCBzbyBjYWxsZXJzIGNhbiBkaXN0aW5ndWlzaCBhXG5cdCAqIHBlcm1pc3Npb24gZmFpbHVyZSBmcm9tIGBOb3RGb3VuZGAgYW5kIGRlY2lkZSB3aGV0aGVyIHRvIG5lZ290aWF0ZVxuXHQgKiB2aWEge0BsaW5rIHJlcXVlc3RSZXNvdXJjZUFjY2Vzc30uXG5cdCAqL1xuXHRwcml2YXRlIF9tYXBFcnJvcihlcnI6IHVua25vd24sIGRlZmF1bHRDb2RlOiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUpOiBFcnJvciB7XG5cdFx0aWYgKGVyciBpbnN0YW5jZW9mIFByb3RvY29sRXJyb3IgJiYgZXJyLmNvZGUgPT09IEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCkge1xuXHRcdFx0cmV0dXJuIGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVyci5tZXNzYWdlLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihcblx0XHRcdGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKSxcblx0XHRcdGRlZmF1bHRDb2RlLFxuXHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSBhIGRlY29kZWQgcmVzb3VyY2Ugb3ZlciB7QGxpbmsgY29ubmVjdGlvbn0uIFNoYXJlZCBieVxuXHQgKiB7QGxpbmsgc3RhdH0gYW5kIHtAbGluayByZWFscGF0aH0uXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlKGNvbm5lY3Rpb246IElSZW1vdGVGaWxlc3lzdGVtQ29ubmVjdGlvbiwgZGVjb2RlZDogVVJJKTogUHJvbWlzZTxSZXNvdXJjZVJlc29sdmVSZXN1bHQ+IHtcblx0XHRyZXR1cm4gY29ubmVjdGlvbi5yZXNvdXJjZVJlc29sdmUoeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBkZWNvZGVkLnRvU3RyaW5nKCkgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9saXN0RGlyZWN0b3J5KGF1dGhvcml0eTogc3RyaW5nLCByZXNvdXJjZTogVVJJKTogUHJvbWlzZTxyZWFkb25seSBEaXJlY3RvcnlFbnRyeVtdPiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMuX2dldENvbm5lY3Rpb24oYXV0aG9yaXR5KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxVcmkgPSB0aGlzLl9kZWNvZGVVcmkocmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5yZXNvdXJjZUxpc3Qob3JpZ2luYWxVcmkpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdC5lbnRyaWVzO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhyb3cgdGhpcy5fbWFwRXJyb3IoZXJyLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5hdmFpbGFibGUpO1xuXHRcdH1cblx0fVxufVxuXG4vLyAtLS0tIEFnZW50IEhvc3QgZmlsZXN5c3RlbSAoY2xpZW50IHJlYWRzIGFnZW50IGhvc3QgZmlsZXMpIC0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIEZpbGVzeXN0ZW0gcHJvdmlkZXIgZm9yIGFjY2Vzc2luZyBhZ2VudCBob3N0IGZpbGVzIGZyb20gdGhlXG4gKiBjbGllbnQgc2lkZS4gUmVnaXN0ZXJlZCB1bmRlciB0aGUgYHZzY29kZS1hZ2VudC1ob3N0YCBzY2hlbWUuXG4gKlxuICogYGBgXG4gKiB2c2NvZGUtYWdlbnQtaG9zdDovL1tjb25uZWN0aW9uQXV0aG9yaXR5XS9bb3JpZ2luYWxTY2hlbWVdL1tvcmlnaW5hbEF1dGhvcml0eV0vW29yaWdpbmFsUGF0aF1cbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyIGV4dGVuZHMgQUhQRmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0cHJvdGVjdGVkIF9kZWNvZGVVcmkocmVzb3VyY2U6IFVSSSk6IFVSSSB7XG5cdFx0cmV0dXJuIGZyb21BZ2VudEhvc3RVcmkocmVzb3VyY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9lbmNvZGVVcmkocmVzb3VyY2U6IFVSSSwgYXV0aG9yaXR5OiBzdHJpbmcpOiBVUkkge1xuXHRcdHJldHVybiB0b0FnZW50SG9zdFVyaShyZXNvdXJjZSwgYXV0aG9yaXR5KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxjQUFjLGdCQUFnQjtBQUN2QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxpQkFBOEIsbUJBQW1CLG9CQUFvQjtBQUMxRixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQkFBK0IsZ0JBQWdCLGdCQUFnQixnQ0FBZ0MsNkJBQTZCLGdCQUFxTDtBQUMxVCxTQUFTLGtCQUFrQixzQkFBc0I7QUFDakQsU0FBUyx1QkFBZ2Y7QUFDemYsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxrQkFBdUM7QUFDaEQsU0FBUyxzQkFBc0I7QUF5RC9CLGVBQXNCLHdCQUNyQixZQU1BLFFBQzhCO0FBQzlCLFFBQU0sRUFBRSxRQUFRLElBQUksTUFBTSxXQUFXLG9CQUFvQixNQUFNO0FBQy9ELFFBQU0sYUFBYSxJQUFJLE1BQU0sT0FBTztBQUNwQyxRQUFNLFdBQVcsVUFBVSxVQUFVO0FBQ3JDLFFBQU0scUJBQXFCLElBQUksUUFBZ0M7QUFDL0QsUUFBTSxXQUFXLFdBQVcsWUFBWSxjQUFZO0FBQ25ELFFBQUksU0FBUyxZQUFZLFdBQVcsU0FBUyxPQUFPLFNBQVMsV0FBVyxzQkFBc0I7QUFDN0Y7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUFRLFNBQVMsT0FBTyxTQUFTLFNBQVMsQ0FBQztBQUNqRCxRQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3ZCO0FBQUEsSUFDRDtBQUNBLHVCQUFtQixLQUFLLE1BQU0sSUFBSSxXQUFTO0FBQUEsTUFDMUMsVUFBVSxJQUFJLE1BQU0sS0FBSyxHQUFHO0FBQUEsTUFDNUIsTUFBTSxLQUFLLFNBQVMsVUFBVSxlQUFlLFFBQzFDLEtBQUssU0FBUyxZ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
