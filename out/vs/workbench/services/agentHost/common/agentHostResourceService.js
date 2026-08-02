var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { DeferredPromise } from "../../../../base/common/async.js";
import { VSBuffer, decodeBase64 } from "../../../../base/common/buffer.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { derived, observableValue } from "../../../../base/common/observable.js";
import { extUri } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import {
  AgentHostAccessMode,
  AgentHostLocalFilePermissionsSettingId,
  AgentHostPermissionMode,
  AgentHostResourcePermissionError,
  IAgentHostResourceService,
  LOCAL_AGENT_HOST_RESOURCE_IDENTITY
} from "../../../../platform/agentHost/common/agentHostResourceService.js";
import { normalizeRemoteAgentHostAddress } from "../../../../platform/agentHost/common/agentHostUri.js";
import {
  ContentEncoding,
  ResourceType
} from "../../../../platform/agentHost/common/state/protocol/commands.js";
import { ROOT_STATE_URI } from "../../../../platform/agentHost/common/state/sessionState.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
function normalizeResourceIdentity(identity) {
  return identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY ? identity : normalizeRemoteAgentHostAddress(identity);
}
let AgentHostResourceService = class extends Disposable {
  constructor(_configurationService, _fileService, _textModelService, _logService) {
    super();
    this._configurationService = _configurationService;
    this._fileService = _fileService;
    this._textModelService = _textModelService;
    this._logService = _logService;
    this._inMemoryGrants = /* @__PURE__ */ new Map();
    this._pending = observableValue("agentHostResources.pending", []);
    this.allPending = this._pending;
  }
  // ---- Gated FS operations ------------------------------------------------
  async list(identity, uri) {
    await this._gate(identity, uri, AgentHostPermissionMode.Read, { channel: ROOT_STATE_URI, uri: uri.toString(), read: true });
    const stat = await this._fileService.resolve(uri);
    if (!stat.isDirectory) {
      throw new Error(`Resource is not a directory: ${uri.toString()}`);
    }
    return {
      entries: (stat.children ?? []).map((c) => ({
        name: c.name,
        type: c.isDirectory ? "directory" : "file"
      }))
    };
  }
  async read(identity, uri) {
    await this._gate(identity, uri, AgentHostPermissionMode.Read, { channel: ROOT_STATE_URI, uri: uri.toString(), read: true });
    try {
      const content = await this._fileService.readFile(uri);
      return { bytes: content.value };
    } catch (err) {
      const virtual = await this._readVirtual(uri);
      if (virtual) {
        return { bytes: virtual };
      }
      throw err;
    }
  }
  async write(identity, params) {
    const uri = URI.parse(params.uri);
    await this._gate(identity, uri, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: uri.toString(), write: true });
    const buf = params.encoding === ContentEncoding.Base64 ? decodeBase64(params.data) : VSBuffer.fromString(params.data);
    try {
      if (params.createOnly) {
        await this._fileService.createFile(uri, buf, { overwrite: false });
      } else {
        await this._fileService.writeFile(uri, buf);
      }
    } catch (err) {
      if (await this._writeVirtual(uri, buf)) {
        return;
      }
      throw err;
    }
  }
  async del(identity, params) {
    const uri = URI.parse(params.uri);
    await this._gate(identity, uri, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: uri.toString(), write: true });
    await this._fileService.del(uri, { recursive: !!params.recursive });
  }
  async move(identity, params) {
    const source = URI.parse(params.source);
    const destination = URI.parse(params.destination);
    await this._gate(identity, source, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: source.toString(), write: true });
    await this._gate(identity, destination, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: destination.toString(), write: true });
    await this._fileService.move(source, destination, !params.failIfExists);
  }
  async copy(identity, params) {
    const source = URI.parse(params.source);
    const destination = URI.parse(params.destination);
    await this._gate(identity, source, AgentHostPermissionMode.Read, { channel: ROOT_STATE_URI, uri: source.toString(), read: true });
    await this._gate(identity, destination, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: destination.toString(), write: true });
    await this._fileService.copy(source, destination, !params.failIfExists);
  }
  async resolve(identity, params) {
    const uri = URI.parse(params.uri);
    await this._gate(identity, uri, AgentHostPermissionMode.Read, { channel: ROOT_STATE_URI, uri: uri.toString(), read: true });
    let stat;
    try {
      stat = await this._fileService.stat(uri);
    } catch (err) {
      const virtual = await this._statVirtual(uri);
      if (virtual) {
        return virtual;
      }
      throw err;
    }
    let type;
    if (stat.isSymbolicLink && params.followSymlinks === false) {
      type = ResourceType.Symlink;
    } else if (stat.isDirectory) {
      type = ResourceType.Directory;
    } else {
      type = ResourceType.File;
    }
    return {
      uri: uri.toString(),
      type,
      ...stat.size !== void 0 ? { size: stat.size } : {},
      ...stat.mtime !== void 0 ? { mtime: new Date(stat.mtime).toISOString() } : {},
      ...stat.ctime !== void 0 ? { ctime: new Date(stat.ctime).toISOString() } : {},
      ...stat.etag ? { etag: stat.etag } : {}
    };
  }
  async mkdir(identity, params) {
    const uri = URI.parse(params.uri);
    await this._gate(identity, uri, AgentHostPermissionMode.Write, { channel: ROOT_STATE_URI, uri: uri.toString(), write: true });
    const existing = await this._fileService.stat(uri).catch(() => void 0);
    if (existing && !existing.isDirectory) {
      throw new Error(`Path exists and is not a directory: ${uri.toString()}`);
    }
    await this._fileService.createFolder(uri);
  }
  // ---- Permission requests / observables ---------------------------------
  async check(identity, uri, mode) {
    const normalized = normalizeResourceIdentity(identity);
    const canonical = await this._canonicalize(uri);
    return this._isCovered(normalized, canonical, mode);
  }
  async request(identity, params) {
    const normalized = normalizeResourceIdentity(identity);
    const canonical = await this._canonicalize(URI.parse(params.uri));
    if (normalized === LOCAL_AGENT_HOST_RESOURCE_IDENTITY) {
      return;
    }
    const wantsWrite = params.write === true;
    const wantsRead = params.read === true || !wantsWrite;
    if (wantsRead && !await this._isCovered(normalized, canonical, AgentHostPermissionMode.Read)) {
      await this._enqueue(normalized, canonical, AgentHostPermissionMode.Read);
    }
    if (wantsWrite && !await this._isCovered(normalized, canonical, AgentHostPermissionMode.Write)) {
      await this._enqueue(normalized, canonical, AgentHostPermissionMode.Write);
    }
  }
  pendingFor(address) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    return derived((reader) => this._pending.read(reader).filter((r) => r.address === normalized));
  }
  findPending(id) {
    return this._pending.get().find((r) => r.id === id);
  }
  grantImplicitRead(identity, uri) {
    const handle = generateUuid();
    const lexical = extUri.normalizePath(uri);
    const realpath = this._fileService.realpath(lexical).then(
      (real) => real ?? lexical,
      () => lexical
    );
    this._inMemoryGrants.set(handle, {
      identity: normalizeResourceIdentity(identity),
      realpath,
      mode: AgentHostAccessMode.Read
    });
    return toDisposable(() => this._inMemoryGrants.delete(handle));
  }
  connectionClosed(identity) {
    const normalized = normalizeResourceIdentity(identity);
    for (const [handle, grant] of this._inMemoryGrants) {
      if (grant.identity === normalized) {
        this._inMemoryGrants.delete(handle);
      }
    }
    if (normalized === LOCAL_AGENT_HOST_RESOURCE_IDENTITY) {
      return;
    }
    const cancel = new CancellationError();
    const remaining = [];
    for (const request of this._pending.get()) {
      if (request.address === normalized) {
        request.deferred.error(cancel);
      } else {
        remaining.push(request);
      }
    }
    if (remaining.length !== this._pending.get().length) {
      this._pending.set(remaining, void 0);
    }
  }
  // ---- internals ---------------------------------------------------------
  async _gate(identity, uri, mode, deniedRequest) {
    if (!await this.check(identity, uri, mode)) {
      throw new AgentHostResourcePermissionError(deniedRequest);
    }
  }
  async _readVirtual(uri) {
    try {
      const ref = await this._textModelService.createModelReference(uri);
      try {
        return VSBuffer.fromString(ref.object.textEditorModel.getValue());
      } finally {
        ref.dispose();
      }
    } catch {
      return void 0;
    }
  }
  /**
   * Write {@link bytes} as text into the resolved text model for {@link uri},
   * if one can be resolved and is writable. Returns `true` when the model was
   * updated, `false` otherwise (no provider, readonly, decode failure).
   */
  async _writeVirtual(uri, bytes) {
    try {
      const ref = await this._textModelService.createModelReference(uri);
      try {
        if (ref.object.isReadonly()) {
          return false;
        }
        ref.object.textEditorModel.setValue(bytes.toString());
        return true;
      } finally {
        ref.dispose();
      }
    } catch {
      return false;
    }
  }
  /**
   * Resolve {@link uri} via {@link ITextModelService} and synthesize a
   * {@link ResourceResolveResult} so virtual resources stat as `File` with
   * a size matching their text content. Returns `undefined` if no model
   * can be resolved.
   */
  async _statVirtual(uri) {
    try {
      const ref = await this._textModelService.createModelReference(uri);
      try {
        const size = VSBuffer.fromString(ref.object.textEditorModel.getValue()).byteLength;
        return {
          uri: uri.toString(),
          type: ResourceType.File,
          size
        };
      } finally {
        ref.dispose();
      }
    } catch {
      return void 0;
    }
  }
  /**
   * Resolve {@link uri} against the local filesystem, collapsing `..`
   * segments and following symlinks so the policy check sees the same
   * path the OS will actually open. For URIs that don't exist (e.g. a
   * `resourceWrite` for a new file), realpath the deepest existing
   * ancestor and re-append the leaf.
   */
  async _canonicalize(uri) {
    const normalized = extUri.normalizePath(uri);
    const real = await this._fileService.realpath(normalized).catch(() => void 0);
    if (real) {
      return real;
    }
    const parent = extUri.dirname(normalized);
    if (extUri.isEqual(parent, normalized)) {
      return normalized;
    }
    const realParent = await this._fileService.realpath(parent).catch(() => void 0);
    return realParent ? extUri.joinPath(realParent, extUri.basename(normalized)) : normalized;
  }
  async _isCovered(identity, canonicalUri, mode) {
    if (identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY) {
      return true;
    }
    const requireWrite = mode === AgentHostPermissionMode.Write;
    for (const grant of this._readPersistedGrants(identity)) {
      if (requireWrite && grant.mode !== AgentHostAccessMode.ReadWrite) {
        continue;
      }
      if (extUri.isEqualOrParent(canonicalUri, grant.uri)) {
        return true;
      }
    }
    const candidates = [];
    for (const grant of this._inMemoryGrants.values()) {
      if (grant.identity !== identity) {
        continue;
      }
      if (requireWrite && grant.mode !== AgentHostAccessMode.ReadWrite) {
        continue;
      }
      candidates.push(grant.realpath);
    }
    const realpaths = await Promise.all(candidates);
    return realpaths.some((uri) => extUri.isEqualOrParent(canonicalUri, uri));
  }
  _enqueue(address, canonicalUri, mode) {
    const existing = this._pending.get().find((r) => r.address === address && r.mode === mode && extUri.isEqual(r.uri, canonicalUri));
    if (existing) {
      return existing.deferred.p;
    }
    const deferred = new DeferredPromise();
    const request = {
      id: generateUuid(),
      address,
      uri: canonicalUri,
      mode,
      deferred,
      allow: () => this._resolve(request, "memory"),
      allowAlways: () => this._resolve(request, "persist"),
      deny: () => {
        this._dropPending(request);
        deferred.error(new CancellationError());
      }
    };
    this._pending.set([...this._pending.get(), request], void 0);
    return deferred.p;
  }
  _resolve(request, scope) {
    const accessMode = request.mode === AgentHostPermissionMode.Write ? AgentHostAccessMode.ReadWrite : AgentHostAccessMode.Read;
    this._inMemoryGrants.set(generateUuid(), {
      identity: request.address,
      realpath: Promise.resolve(request.uri),
      mode: accessMode
    });
    if (scope === "persist") {
      void this._persistGrant(request.address, request.uri, request.mode).catch((err) => {
        this._logService.warn("[AgentHostResourceService] Failed to persist grant", err);
      });
    }
    this._dropPending(request);
    request.deferred.complete();
  }
  _dropPending(request) {
    const next = this._pending.get().filter((r) => r !== request);
    if (next.length !== this._pending.get().length) {
      this._pending.set(next, void 0);
    }
  }
  *_readPersistedGrants(address) {
    const forAddress = this._configurationService.getValue(AgentHostLocalFilePermissionsSettingId)?.[address];
    if (!forAddress) {
      return;
    }
    for (const [uriStr, mode] of Object.entries(forAddress)) {
      if (mode !== AgentHostAccessMode.Read && mode !== AgentHostAccessMode.ReadWrite) {
        continue;
      }
      try {
        yield { uri: URI.parse(uriStr), mode };
      } catch {
      }
    }
  }
  async _persistGrant(address, uri, mode) {
    const requested = mode === AgentHostPermissionMode.Write ? AgentHostAccessMode.ReadWrite : AgentHostAccessMode.Read;
    for (const grant of this._readPersistedGrants(address)) {
      const covers = grant.mode === AgentHostAccessMode.ReadWrite || requested === AgentHostAccessMode.Read;
      if (covers && extUri.isEqualOrParent(uri, grant.uri)) {
        return;
      }
    }
    const { target, value } = this._inspectScopedSetting();
    const forAddress = { ...value[address] ?? {} };
    const uriKey = uri.toString();
    if (forAddress[uriKey] === AgentHostAccessMode.ReadWrite) {
      return;
    }
    forAddress[uriKey] = requested;
    await this._configurationService.updateValue(
      AgentHostLocalFilePermissionsSettingId,
      { ...value, [address]: forAddress },
      target
    );
  }
  _inspectScopedSetting() {
    const inspected = this._configurationService.inspect(AgentHostLocalFilePermissionsSettingId);
    if (inspected.applicationValue !== void 0) {
      return { target: ConfigurationTarget.APPLICATION, value: inspected.applicationValue };
    }
    if (inspected.userLocalValue !== void 0) {
      return { target: ConfigurationTarget.USER_LOCAL, value: inspected.userLocalValue };
    }
    if (inspected.userRemoteValue !== void 0) {
      return { target: ConfigurationTarget.USER_REMOTE, value: inspected.userRemoteValue };
    }
    if (inspected.userValue !== void 0) {
      return { target: ConfigurationTarget.USER, value: inspected.userValue };
    }
    return { target: ConfigurationTarget.APPLICATION, value: {} };
  }
};
AgentHostResourceService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IFileService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, ILogService)
], AgentHostResourceService);
registerSingleton(IAgentHostResourceService, AgentHostResourceService, InstantiationType.Delayed);
export {
  AgentHostResourceService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFJlc291cmNlU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyLCBkZWNvZGVCYXNlNjQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgZGVyaXZlZCwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBleHRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQge1xuXHRBZ2VudEhvc3RBY2Nlc3NNb2RlLFxuXHRBZ2VudEhvc3RMb2NhbEZpbGVQZXJtaXNzaW9uc1NldHRpbmdJZCxcblx0QWdlbnRIb3N0UGVybWlzc2lvbk1vZGUsXG5cdEFnZW50SG9zdFBlcm1pc3Npb25zU2V0dGluZyxcblx0QWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSxcblx0QWdlbnRIb3N0UmVzb3VyY2VQZXJtaXNzaW9uRXJyb3IsXG5cdElBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2UsXG5cdElQZW5kaW5nUmVzb3VyY2VSZXF1ZXN0LFxuXHRJUmVzb3VyY2VMaXN0UmVzdWx0LFxuXHRJUmVzb3VyY2VSZWFkUmVzdWx0LFxuXHRMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZLFxufSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFJlc291cmNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHtcblx0Q29udGVudEVuY29kaW5nLFxuXHRSZXNvdXJjZUNvcHlQYXJhbXMsIFJlc291cmNlRGVsZXRlUGFyYW1zLCBSZXNvdXJjZU1rZGlyUGFyYW1zLCBSZXNvdXJjZU1vdmVQYXJhbXMsXG5cdFJlc291cmNlUmVxdWVzdFBhcmFtcywgUmVzb3VyY2VSZXNvbHZlUGFyYW1zLCBSZXNvdXJjZVJlc29sdmVSZXN1bHQsIFJlc291cmNlVHlwZSwgUmVzb3VyY2VXcml0ZVBhcmFtcyxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBST09UX1NUQVRFX1VSSSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmludGVyZmFjZSBJSW50ZXJuYWxQZW5kaW5nUmVxdWVzdCBleHRlbmRzIElQZW5kaW5nUmVzb3VyY2VSZXF1ZXN0IHtcblx0cmVhZG9ubHkgZGVmZXJyZWQ6IERlZmVycmVkUHJvbWlzZTx2b2lkPjtcbn1cblxuaW50ZXJmYWNlIElJbk1lbW9yeUdyYW50IHtcblx0cmVhZG9ubHkgaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHk7XG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0byB0aGUgcmVhbHBhdGgnZCBVUkkgZm9yIHRoZSBncmFudC4gU3RvcmVkIGFzIGEgcHJvbWlzZSBzb1xuXHQgKiBgZ3JhbnRJbXBsaWNpdFJlYWRgIGNhbiByZXR1cm4gc3luY2hyb25vdXNseSB3aGlsZSB0aGUgcmVhbHBhdGggbG9va3VwXG5cdCAqIGlzIGluIGZsaWdodDsgY29uc3VtZXJzIGluIGBfaXNDb3ZlcmVkYCBhd2FpdCB0aGUgcmVzb2x2ZWQgVVJJIGJlZm9yZVxuXHQgKiBjb21wYXJpbmcsIHNvIGEgY2hlY2sgdGhhdCBoYXBwZW5zIGJlZm9yZSB0aGUgbG9va3VwIGNvbXBsZXRlcyBzdGlsbFxuXHQgKiBjb21wYXJlcyBhZ2FpbnN0IHRoZSBjYW5vbmljYWwgcGF0aC4gQWx3YXlzIHJlc29sdmVzIChuZXZlciByZWplY3RzKS5cblx0ICovXG5cdHJlYWRvbmx5IHJlYWxwYXRoOiBQcm9taXNlPFVSST47XG5cdHJlYWRvbmx5IG1vZGU6IEFnZW50SG9zdEFjY2Vzc01vZGU7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVJlc291cmNlSWRlbnRpdHkoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHkpOiBBZ2VudEhvc3RSZXNvdXJjZUlkZW50aXR5IHtcblx0cmV0dXJuIGlkZW50aXR5ID09PSBMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZID8gaWRlbnRpdHkgOiBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzKGlkZW50aXR5KTtcbn1cblxuLyoqXG4gKiBEZWZhdWx0IGltcGxlbWVudGF0aW9uIG9mIHtAbGluayBJQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlfSBcdTIwMTQgdGhlIHVuaWZpZWRcbiAqIG93bmVyIG9mIGFnZW50LWhvc3QtZmFjaW5nIGZpbGVzeXN0ZW0gb3BlcmF0aW9ucyBhbmQgdGhlIHBlcm1pc3Npb25cbiAqIHBvbGljeSB0aGF0IGdhdGVzIHRoZW0uIFJlYWRzIHRyYW5zcGFyZW50bHkgZmFsbCBiYWNrIHRvXG4gKiB7QGxpbmsgSVRleHRNb2RlbFNlcnZpY2V9IHNvIHZpcnR1YWwgcmVzb3VyY2VzICh1bnRpdGxlZCBkb2N1bWVudHMsXG4gKiBub3RlYm9vayBjZWxscywgLi4uKSB3b3JrIHdpdGhvdXQgdGhlIGhvc3QgaGF2aW5nIHRvIGtub3cgYWJvdXQgdGhlbS5cbiAqXG4gKiBQZXJtaXNzaW9uIHN0b3JhZ2Ugc2hhcGUgKGluIHVzZXIgc2V0dGluZ3MpOlxuICpcbiAqIGBgYGpzb25jXG4gKiBcImNoYXQuYWdlbnRIb3N0LmxvY2FsRmlsZVBlcm1pc3Npb25zXCI6IHtcbiAqICAgXCJsb2NhbGhvc3Q6MzAwMFwiOiB7XG4gKiAgICAgXCJmaWxlOi8vL1VzZXJzL21lLy5naXRjb25maWdcIjogXCJyXCIsXG4gKiAgICAgXCJmaWxlOi8vL1VzZXJzL21lLy5hZ2VudENvbmZpZ1wiOiBcInJ3XCJcbiAqICAgfVxuICogfVxuICogYGBgXG4gKlxuICogLSBLZXlzIGFyZSByZW1vdGUgYWRkcmVzc2VzIG5vcm1hbGl6ZWQgdmlhXG4gKiAgIHtAbGluayBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzfS5cbiAqIC0gVmFsdWVzIGFyZSBVUkkgc3RyaW5ncyBcdTIxOTIgYHJgIHwgYHJ3YC4gRGVzY2VuZGFudCBVUklzIGFyZSBjb3ZlcmVkIGJ5IGFcbiAqICAgcGFyZW50IGdyYW50LlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbk1lbW9yeUdyYW50cyA9IG5ldyBNYXA8c3RyaW5nLCBJSW5NZW1vcnlHcmFudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJSW50ZXJuYWxQZW5kaW5nUmVxdWVzdFtdPignYWdlbnRIb3N0UmVzb3VyY2VzLnBlbmRpbmcnLCBbXSk7XG5cblx0cmVhZG9ubHkgYWxsUGVuZGluZzogSU9ic2VydmFibGU8cmVhZG9ubHkgSVBlbmRpbmdSZXNvdXJjZVJlcXVlc3RbXT4gPSB0aGlzLl9wZW5kaW5nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8vIC0tLS0gR2F0ZWQgRlMgb3BlcmF0aW9ucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRhc3luYyBsaXN0KGlkZW50aXR5OiBBZ2VudEhvc3RSZXNvdXJjZUlkZW50aXR5LCB1cmk6IFVSSSk6IFByb21pc2U8SVJlc291cmNlTGlzdFJlc3VsdD4ge1xuXHRcdGF3YWl0IHRoaXMuX2dhdGUoaWRlbnRpdHksIHVyaSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCwgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiB1cmkudG9TdHJpbmcoKSwgcmVhZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZSh1cmkpO1xuXHRcdGlmICghc3RhdC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBSZXNvdXJjZSBpcyBub3QgYSBkaXJlY3Rvcnk6ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRlbnRyaWVzOiAoc3RhdC5jaGlsZHJlbiA/PyBbXSkubWFwKGMgPT4gKHtcblx0XHRcdFx0bmFtZTogYy5uYW1lLFxuXHRcdFx0XHR0eXBlOiBjLmlzRGlyZWN0b3J5ID8gJ2RpcmVjdG9yeScgOiAnZmlsZScsXG5cdFx0XHR9KSksXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHJlYWQoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHVyaTogVVJJKTogUHJvbWlzZTxJUmVzb3VyY2VSZWFkUmVzdWx0PiB7XG5cdFx0YXdhaXQgdGhpcy5fZ2F0ZShpZGVudGl0eSwgdXJpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IHVyaS50b1N0cmluZygpLCByZWFkOiB0cnVlIH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpKTtcblx0XHRcdHJldHVybiB7IGJ5dGVzOiBjb250ZW50LnZhbHVlIH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zdCB2aXJ0dWFsID0gYXdhaXQgdGhpcy5fcmVhZFZpcnR1YWwodXJpKTtcblx0XHRcdGlmICh2aXJ0dWFsKSB7XG5cdFx0XHRcdHJldHVybiB7IGJ5dGVzOiB2aXJ0dWFsIH07XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgd3JpdGUoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHBhcmFtczogUmVzb3VyY2VXcml0ZVBhcmFtcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShwYXJhbXMudXJpKTtcblx0XHRhd2FpdCB0aGlzLl9nYXRlKGlkZW50aXR5LCB1cmksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLldyaXRlLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IHVyaS50b1N0cmluZygpLCB3cml0ZTogdHJ1ZSB9KTtcblx0XHRjb25zdCBidWYgPSBwYXJhbXMuZW5jb2RpbmcgPT09IENvbnRlbnRFbmNvZGluZy5CYXNlNjRcblx0XHRcdD8gZGVjb2RlQmFzZTY0KHBhcmFtcy5kYXRhKVxuXHRcdFx0OiBWU0J1ZmZlci5mcm9tU3RyaW5nKHBhcmFtcy5kYXRhKTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKHBhcmFtcy5jcmVhdGVPbmx5KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmNyZWF0ZUZpbGUodXJpLCBidWYsIHsgb3ZlcndyaXRlOiBmYWxzZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZSh1cmksIGJ1Zik7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fd3JpdGVWaXJ0dWFsKHVyaSwgYnVmKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZGVsKGlkZW50aXR5OiBBZ2VudEhvc3RSZXNvdXJjZUlkZW50aXR5LCBwYXJhbXM6IFJlc291cmNlRGVsZXRlUGFyYW1zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHBhcmFtcy51cmkpO1xuXHRcdGF3YWl0IHRoaXMuX2dhdGUoaWRlbnRpdHksIHVyaSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuV3JpdGUsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogdXJpLnRvU3RyaW5nKCksIHdyaXRlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmRlbCh1cmksIHsgcmVjdXJzaXZlOiAhIXBhcmFtcy5yZWN1cnNpdmUgfSk7XG5cdH1cblxuXHRhc3luYyBtb3ZlKGlkZW50aXR5OiBBZ2VudEhvc3RSZXNvdXJjZUlkZW50aXR5LCBwYXJhbXM6IFJlc291cmNlTW92ZVBhcmFtcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNvdXJjZSA9IFVSSS5wYXJzZShwYXJhbXMuc291cmNlKTtcblx0XHRjb25zdCBkZXN0aW5hdGlvbiA9IFVSSS5wYXJzZShwYXJhbXMuZGVzdGluYXRpb24pO1xuXHRcdGF3YWl0IHRoaXMuX2dhdGUoaWRlbnRpdHksIHNvdXJjZSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuV3JpdGUsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogc291cmNlLnRvU3RyaW5nKCksIHdyaXRlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHRoaXMuX2dhdGUoaWRlbnRpdHksIGRlc3RpbmF0aW9uLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5Xcml0ZSwgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBkZXN0aW5hdGlvbi50b1N0cmluZygpLCB3cml0ZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5tb3ZlKHNvdXJjZSwgZGVzdGluYXRpb24sICFwYXJhbXMuZmFpbElmRXhpc3RzKTtcblx0fVxuXG5cdGFzeW5jIGNvcHkoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHBhcmFtczogUmVzb3VyY2VDb3B5UGFyYW1zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc291cmNlID0gVVJJLnBhcnNlKHBhcmFtcy5zb3VyY2UpO1xuXHRcdGNvbnN0IGRlc3RpbmF0aW9uID0gVVJJLnBhcnNlKHBhcmFtcy5kZXN0aW5hdGlvbik7XG5cdFx0YXdhaXQgdGhpcy5fZ2F0ZShpZGVudGl0eSwgc291cmNlLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IHNvdXJjZS50b1N0cmluZygpLCByZWFkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHRoaXMuX2dhdGUoaWRlbnRpdHksIGRlc3RpbmF0aW9uLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5Xcml0ZSwgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBkZXN0aW5hdGlvbi50b1N0cmluZygpLCB3cml0ZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jb3B5KHNvdXJjZSwgZGVzdGluYXRpb24sICFwYXJhbXMuZmFpbElmRXhpc3RzKTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmUoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHBhcmFtczogUmVzb3VyY2VSZXNvbHZlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVJlc29sdmVSZXN1bHQ+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UocGFyYW1zLnVyaSk7XG5cdFx0YXdhaXQgdGhpcy5fZ2F0ZShpZGVudGl0eSwgdXJpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IHVyaS50b1N0cmluZygpLCByZWFkOiB0cnVlIH0pO1xuXHRcdGxldCBzdGF0O1xuXHRcdHRyeSB7XG5cdFx0XHRzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uuc3RhdCh1cmkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc3QgdmlydHVhbCA9IGF3YWl0IHRoaXMuX3N0YXRWaXJ0dWFsKHVyaSk7XG5cdFx0XHRpZiAodmlydHVhbCkge1xuXHRcdFx0XHRyZXR1cm4gdmlydHVhbDtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdFx0bGV0IHR5cGU6IFJlc291cmNlVHlwZTtcblx0XHRpZiAoc3RhdC5pc1N5bWJvbGljTGluayAmJiBwYXJhbXMuZm9sbG93U3ltbGlua3MgPT09IGZhbHNlKSB7XG5cdFx0XHR0eXBlID0gUmVzb3VyY2VUeXBlLlN5bWxpbms7XG5cdFx0fSBlbHNlIGlmIChzdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHR0eXBlID0gUmVzb3VyY2VUeXBlLkRpcmVjdG9yeTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dHlwZSA9IFJlc291cmNlVHlwZS5GaWxlO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiB1cmkudG9TdHJpbmcoKSxcblx0XHRcdHR5cGUsXG5cdFx0XHQuLi4oc3RhdC5zaXplICE9PSB1bmRlZmluZWQgPyB7IHNpemU6IHN0YXQuc2l6ZSB9IDoge30pLFxuXHRcdFx0Li4uKHN0YXQubXRpbWUgIT09IHVuZGVmaW5lZCA/IHsgbXRpbWU6IG5ldyBEYXRlKHN0YXQubXRpbWUpLnRvSVNPU3RyaW5nKCkgfSA6IHt9KSxcblx0XHRcdC4uLihzdGF0LmN0aW1lICE9PSB1bmRlZmluZWQgPyB7IGN0aW1lOiBuZXcgRGF0ZShzdGF0LmN0aW1lKS50b0lTT1N0cmluZygpIH0gOiB7fSksXG5cdFx0XHQuLi4oc3RhdC5ldGFnID8geyBldGFnOiBzdGF0LmV0YWcgfSA6IHt9KSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgbWtkaXIoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHBhcmFtczogUmVzb3VyY2VNa2RpclBhcmFtcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShwYXJhbXMudXJpKTtcblx0XHRhd2FpdCB0aGlzLl9nYXRlKGlkZW50aXR5LCB1cmksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLldyaXRlLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IHVyaS50b1N0cmluZygpLCB3cml0ZTogdHJ1ZSB9KTtcblx0XHRjb25zdCBleGlzdGluZyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQodXJpKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdGlmIChleGlzdGluZyAmJiAhZXhpc3RpbmcuaXNEaXJlY3RvcnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgUGF0aCBleGlzdHMgYW5kIGlzIG5vdCBhIGRpcmVjdG9yeTogJHt1cmkudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHVyaSk7XG5cdH1cblxuXHQvLyAtLS0tIFBlcm1pc3Npb24gcmVxdWVzdHMgLyBvYnNlcnZhYmxlcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRhc3luYyBjaGVjayhpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSwgdXJpOiBVUkksIG1vZGU6IEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVJlc291cmNlSWRlbnRpdHkoaWRlbnRpdHkpO1xuXHRcdGNvbnN0IGNhbm9uaWNhbCA9IGF3YWl0IHRoaXMuX2Nhbm9uaWNhbGl6ZSh1cmkpO1xuXHRcdHJldHVybiB0aGlzLl9pc0NvdmVyZWQobm9ybWFsaXplZCwgY2Fub25pY2FsLCBtb2RlKTtcblx0fVxuXG5cdGFzeW5jIHJlcXVlc3QoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHBhcmFtczogUmVzb3VyY2VSZXF1ZXN0UGFyYW1zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVJlc291cmNlSWRlbnRpdHkoaWRlbnRpdHkpO1xuXHRcdGNvbnN0IGNhbm9uaWNhbCA9IGF3YWl0IHRoaXMuX2Nhbm9uaWNhbGl6ZShVUkkucGFyc2UocGFyYW1zLnVyaSkpO1xuXHRcdGlmIChub3JtYWxpemVkID09PSBMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHdhbnRzV3JpdGUgPSBwYXJhbXMud3JpdGUgPT09IHRydWU7XG5cdFx0Y29uc3Qgd2FudHNSZWFkID0gcGFyYW1zLnJlYWQgPT09IHRydWUgfHwgIXdhbnRzV3JpdGU7XG5cblx0XHRpZiAod2FudHNSZWFkICYmICFhd2FpdCB0aGlzLl9pc0NvdmVyZWQobm9ybWFsaXplZCwgY2Fub25pY2FsLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZW5xdWV1ZShub3JtYWxpemVkLCBjYW5vbmljYWwsIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQpO1xuXHRcdH1cblx0XHRpZiAod2FudHNXcml0ZSAmJiAhYXdhaXQgdGhpcy5faXNDb3ZlcmVkKG5vcm1hbGl6ZWQsIGNhbm9uaWNhbCwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuV3JpdGUpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9lbnF1ZXVlKG5vcm1hbGl6ZWQsIGNhbm9uaWNhbCwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuV3JpdGUpO1xuXHRcdH1cblx0fVxuXG5cdHBlbmRpbmdGb3IoYWRkcmVzczogc3RyaW5nKTogSU9ic2VydmFibGU8cmVhZG9ubHkgSVBlbmRpbmdSZXNvdXJjZVJlcXVlc3RbXT4ge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzKGFkZHJlc3MpO1xuXHRcdHJldHVybiBkZXJpdmVkKHJlYWRlciA9PiB0aGlzLl9wZW5kaW5nLnJlYWQocmVhZGVyKS5maWx0ZXIociA9PiByLmFkZHJlc3MgPT09IG5vcm1hbGl6ZWQpKTtcblx0fVxuXG5cdGZpbmRQZW5kaW5nKGlkOiBzdHJpbmcpOiBJUGVuZGluZ1Jlc291cmNlUmVxdWVzdCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmcuZ2V0KCkuZmluZChyID0+IHIuaWQgPT09IGlkKTtcblx0fVxuXG5cdGdyYW50SW1wbGljaXRSZWFkKGlkZW50aXR5OiBBZ2VudEhvc3RSZXNvdXJjZUlkZW50aXR5LCB1cmk6IFVSSSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBsZXhpY2FsID0gZXh0VXJpLm5vcm1hbGl6ZVBhdGgodXJpKTtcblx0XHRjb25zdCByZWFscGF0aCA9IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWxwYXRoKGxleGljYWwpLnRoZW4oXG5cdFx0XHRyZWFsID0+IHJlYWwgPz8gbGV4aWNhbCxcblx0XHRcdCgpID0+IGxleGljYWwsXG5cdFx0KTtcblx0XHR0aGlzLl9pbk1lbW9yeUdyYW50cy5zZXQoaGFuZGxlLCB7XG5cdFx0XHRpZGVudGl0eTogbm9ybWFsaXplUmVzb3VyY2VJZGVudGl0eShpZGVudGl0eSksXG5cdFx0XHRyZWFscGF0aCxcblx0XHRcdG1vZGU6IEFnZW50SG9zdEFjY2Vzc01vZGUuUmVhZCxcblx0XHR9KTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2luTWVtb3J5R3JhbnRzLmRlbGV0ZShoYW5kbGUpKTtcblx0fVxuXG5cdGNvbm5lY3Rpb25DbG9zZWQoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHkpOiB2b2lkIHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUmVzb3VyY2VJZGVudGl0eShpZGVudGl0eSk7XG5cblx0XHRmb3IgKGNvbnN0IFtoYW5kbGUsIGdyYW50XSBvZiB0aGlzLl9pbk1lbW9yeUdyYW50cykge1xuXHRcdFx0aWYgKGdyYW50LmlkZW50aXR5ID09PSBub3JtYWxpemVkKSB7XG5cdFx0XHRcdHRoaXMuX2luTWVtb3J5R3JhbnRzLmRlbGV0ZShoYW5kbGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChub3JtYWxpemVkID09PSBMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNhbmNlbCA9IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdGNvbnN0IHJlbWFpbmluZzogSUludGVybmFsUGVuZGluZ1JlcXVlc3RbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiB0aGlzLl9wZW5kaW5nLmdldCgpKSB7XG5cdFx0XHRpZiAocmVxdWVzdC5hZGRyZXNzID09PSBub3JtYWxpemVkKSB7XG5cdFx0XHRcdHJlcXVlc3QuZGVmZXJyZWQuZXJyb3IoY2FuY2VsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlbWFpbmluZy5wdXNoKHJlcXVlc3QpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocmVtYWluaW5nLmxlbmd0aCAhPT0gdGhpcy5fcGVuZGluZy5nZXQoKS5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmcuc2V0KHJlbWFpbmluZywgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIGludGVybmFscyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIGFzeW5jIF9nYXRlKFxuXHRcdGlkZW50aXR5OiBBZ2VudEhvc3RSZXNvdXJjZUlkZW50aXR5LFxuXHRcdHVyaTogVVJJLFxuXHRcdG1vZGU6IEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLFxuXHRcdGRlbmllZFJlcXVlc3Q6IFJlc291cmNlUmVxdWVzdFBhcmFtcyxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFhd2FpdCB0aGlzLmNoZWNrKGlkZW50aXR5LCB1cmksIG1vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgQWdlbnRIb3N0UmVzb3VyY2VQZXJtaXNzaW9uRXJyb3IoZGVuaWVkUmVxdWVzdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVhZFZpcnR1YWwodXJpOiBVUkkpOiBQcm9taXNlPFZTQnVmZmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3RleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UodXJpKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBWU0J1ZmZlci5mcm9tU3RyaW5nKHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLmdldFZhbHVlKCkpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFdyaXRlIHtAbGluayBieXRlc30gYXMgdGV4dCBpbnRvIHRoZSByZXNvbHZlZCB0ZXh0IG1vZGVsIGZvciB7QGxpbmsgdXJpfSxcblx0ICogaWYgb25lIGNhbiBiZSByZXNvbHZlZCBhbmQgaXMgd3JpdGFibGUuIFJldHVybnMgYHRydWVgIHdoZW4gdGhlIG1vZGVsIHdhc1xuXHQgKiB1cGRhdGVkLCBgZmFsc2VgIG90aGVyd2lzZSAobm8gcHJvdmlkZXIsIHJlYWRvbmx5LCBkZWNvZGUgZmFpbHVyZSkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF93cml0ZVZpcnR1YWwodXJpOiBVUkksIGJ5dGVzOiBWU0J1ZmZlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl90ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHVyaSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAocmVmLm9iamVjdC5pc1JlYWRvbmx5KCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwuc2V0VmFsdWUoYnl0ZXMudG9TdHJpbmcoKSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSB7QGxpbmsgdXJpfSB2aWEge0BsaW5rIElUZXh0TW9kZWxTZXJ2aWNlfSBhbmQgc3ludGhlc2l6ZSBhXG5cdCAqIHtAbGluayBSZXNvdXJjZVJlc29sdmVSZXN1bHR9IHNvIHZpcnR1YWwgcmVzb3VyY2VzIHN0YXQgYXMgYEZpbGVgIHdpdGhcblx0ICogYSBzaXplIG1hdGNoaW5nIHRoZWlyIHRleHQgY29udGVudC4gUmV0dXJucyBgdW5kZWZpbmVkYCBpZiBubyBtb2RlbFxuXHQgKiBjYW4gYmUgcmVzb2x2ZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zdGF0VmlydHVhbCh1cmk6IFVSSSk6IFByb21pc2U8UmVzb3VyY2VSZXNvbHZlUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3RleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UodXJpKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNpemUgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLmdldFZhbHVlKCkpLmJ5dGVMZW5ndGg7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dXJpOiB1cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHR0eXBlOiBSZXNvdXJjZVR5cGUuRmlsZSxcblx0XHRcdFx0XHRzaXplLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUge0BsaW5rIHVyaX0gYWdhaW5zdCB0aGUgbG9jYWwgZmlsZXN5c3RlbSwgY29sbGFwc2luZyBgLi5gXG5cdCAqIHNlZ21lbnRzIGFuZCBmb2xsb3dpbmcgc3ltbGlua3Mgc28gdGhlIHBvbGljeSBjaGVjayBzZWVzIHRoZSBzYW1lXG5cdCAqIHBhdGggdGhlIE9TIHdpbGwgYWN0dWFsbHkgb3Blbi4gRm9yIFVSSXMgdGhhdCBkb24ndCBleGlzdCAoZS5nLiBhXG5cdCAqIGByZXNvdXJjZVdyaXRlYCBmb3IgYSBuZXcgZmlsZSksIHJlYWxwYXRoIHRoZSBkZWVwZXN0IGV4aXN0aW5nXG5cdCAqIGFuY2VzdG9yIGFuZCByZS1hcHBlbmQgdGhlIGxlYWYuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jYW5vbmljYWxpemUodXJpOiBVUkkpOiBQcm9taXNlPFVSST4ge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBleHRVcmkubm9ybWFsaXplUGF0aCh1cmkpO1xuXHRcdGNvbnN0IHJlYWwgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFscGF0aChub3JtYWxpemVkKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdGlmIChyZWFsKSB7XG5cdFx0XHRyZXR1cm4gcmVhbDtcblx0XHR9XG5cdFx0Y29uc3QgcGFyZW50ID0gZXh0VXJpLmRpcm5hbWUobm9ybWFsaXplZCk7XG5cdFx0aWYgKGV4dFVyaS5pc0VxdWFsKHBhcmVudCwgbm9ybWFsaXplZCkpIHtcblx0XHRcdHJldHVybiBub3JtYWxpemVkO1xuXHRcdH1cblx0XHRjb25zdCByZWFsUGFyZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhbHBhdGgocGFyZW50KS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdHJldHVybiByZWFsUGFyZW50XG5cdFx0XHQ/IGV4dFVyaS5qb2luUGF0aChyZWFsUGFyZW50LCBleHRVcmkuYmFzZW5hbWUobm9ybWFsaXplZCkpXG5cdFx0XHQ6IG5vcm1hbGl6ZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pc0NvdmVyZWQoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIGNhbm9uaWNhbFVyaTogVVJJLCBtb2RlOiBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChpZGVudGl0eSA9PT0gTE9DQUxfQUdFTlRfSE9TVF9SRVNPVVJDRV9JREVOVElUWSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHJlcXVpcmVXcml0ZSA9IG1vZGUgPT09IEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLldyaXRlO1xuXG5cdFx0Zm9yIChjb25zdCBncmFudCBvZiB0aGlzLl9yZWFkUGVyc2lzdGVkR3JhbnRzKGlkZW50aXR5KSkge1xuXHRcdFx0aWYgKHJlcXVpcmVXcml0ZSAmJiBncmFudC5tb2RlICE9PSBBZ2VudEhvc3RBY2Nlc3NNb2RlLlJlYWRXcml0ZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChleHRVcmkuaXNFcXVhbE9yUGFyZW50KGNhbm9uaWNhbFVyaSwgZ3JhbnQudXJpKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjYW5kaWRhdGVzOiBQcm9taXNlPFVSST5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZ3JhbnQgb2YgdGhpcy5faW5NZW1vcnlHcmFudHMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChncmFudC5pZGVudGl0eSAhPT0gaWRlbnRpdHkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVxdWlyZVdyaXRlICYmIGdyYW50Lm1vZGUgIT09IEFnZW50SG9zdEFjY2Vzc01vZGUuUmVhZFdyaXRlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2FuZGlkYXRlcy5wdXNoKGdyYW50LnJlYWxwYXRoKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVhbHBhdGhzID0gYXdhaXQgUHJvbWlzZS5hbGwoY2FuZGlkYXRlcyk7XG5cdFx0cmV0dXJuIHJlYWxwYXRocy5zb21lKHVyaSA9PiBleHRVcmkuaXNFcXVhbE9yUGFyZW50KGNhbm9uaWNhbFVyaSwgdXJpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9lbnF1ZXVlKGFkZHJlc3M6IHN0cmluZywgY2Fub25pY2FsVXJpOiBVUkksIG1vZGU6IEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9wZW5kaW5nLmdldCgpLmZpbmQociA9PlxuXHRcdFx0ci5hZGRyZXNzID09PSBhZGRyZXNzICYmIHIubW9kZSA9PT0gbW9kZSAmJiBleHRVcmkuaXNFcXVhbChyLnVyaSwgY2Fub25pY2FsVXJpKSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3RpbmcuZGVmZXJyZWQucDtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCByZXF1ZXN0OiBJSW50ZXJuYWxQZW5kaW5nUmVxdWVzdCA9IHtcblx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdGFkZHJlc3MsXG5cdFx0XHR1cmk6IGNhbm9uaWNhbFVyaSxcblx0XHRcdG1vZGUsXG5cdFx0XHRkZWZlcnJlZCxcblx0XHRcdGFsbG93OiAoKSA9PiB0aGlzLl9yZXNvbHZlKHJlcXVlc3QsICdtZW1vcnknKSxcblx0XHRcdGFsbG93QWx3YXlzOiAoKSA9PiB0aGlzLl9yZXNvbHZlKHJlcXVlc3QsICdwZXJzaXN0JyksXG5cdFx0XHRkZW55OiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2Ryb3BQZW5kaW5nKHJlcXVlc3QpO1xuXHRcdFx0XHRkZWZlcnJlZC5lcnJvcihuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0dGhpcy5fcGVuZGluZy5zZXQoWy4uLnRoaXMuX3BlbmRpbmcuZ2V0KCksIHJlcXVlc3RdLCB1bmRlZmluZWQpO1xuXHRcdHJldHVybiBkZWZlcnJlZC5wO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZShyZXF1ZXN0OiBJSW50ZXJuYWxQZW5kaW5nUmVxdWVzdCwgc2NvcGU6ICdtZW1vcnknIHwgJ3BlcnNpc3QnKTogdm9pZCB7XG5cdFx0Y29uc3QgYWNjZXNzTW9kZSA9IHJlcXVlc3QubW9kZSA9PT0gQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuV3JpdGVcblx0XHRcdD8gQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkV3JpdGVcblx0XHRcdDogQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkO1xuXG5cdFx0dGhpcy5faW5NZW1vcnlHcmFudHMuc2V0KGdlbmVyYXRlVXVpZCgpLCB7XG5cdFx0XHRpZGVudGl0eTogcmVxdWVzdC5hZGRyZXNzLFxuXHRcdFx0cmVhbHBhdGg6IFByb21pc2UucmVzb2x2ZShyZXF1ZXN0LnVyaSksXG5cdFx0XHRtb2RlOiBhY2Nlc3NNb2RlLFxuXHRcdH0pO1xuXG5cdFx0aWYgKHNjb3BlID09PSAncGVyc2lzdCcpIHtcblx0XHRcdHZvaWQgdGhpcy5fcGVyc2lzdEdyYW50KHJlcXVlc3QuYWRkcmVzcywgcmVxdWVzdC51cmksIHJlcXVlc3QubW9kZSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlXSBGYWlsZWQgdG8gcGVyc2lzdCBncmFudCcsIGVycik7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9kcm9wUGVuZGluZyhyZXF1ZXN0KTtcblx0XHRyZXF1ZXN0LmRlZmVycmVkLmNvbXBsZXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9kcm9wUGVuZGluZyhyZXF1ZXN0OiBJSW50ZXJuYWxQZW5kaW5nUmVxdWVzdCk6IHZvaWQge1xuXHRcdGNvbnN0IG5leHQgPSB0aGlzLl9wZW5kaW5nLmdldCgpLmZpbHRlcihyID0+IHIgIT09IHJlcXVlc3QpO1xuXHRcdGlmIChuZXh0Lmxlbmd0aCAhPT0gdGhpcy5fcGVuZGluZy5nZXQoKS5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmcuc2V0KG5leHQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSAqX3JlYWRQZXJzaXN0ZWRHcmFudHMoYWRkcmVzczogc3RyaW5nKTogSXRlcmFibGU8eyB1cmk6IFVSSTsgbW9kZTogQWdlbnRIb3N0QWNjZXNzTW9kZSB9PiB7XG5cdFx0Y29uc3QgZm9yQWRkcmVzcyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0XHQuZ2V0VmFsdWU8QWdlbnRIb3N0UGVybWlzc2lvbnNTZXR0aW5nPihBZ2VudEhvc3RMb2NhbEZpbGVQZXJtaXNzaW9uc1NldHRpbmdJZCk/LlthZGRyZXNzXTtcblx0XHRpZiAoIWZvckFkZHJlc3MpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbdXJpU3RyLCBtb2RlXSBvZiBPYmplY3QuZW50cmllcyhmb3JBZGRyZXNzKSkge1xuXHRcdFx0aWYgKG1vZGUgIT09IEFnZW50SG9zdEFjY2Vzc01vZGUuUmVhZCAmJiBtb2RlICE9PSBBZ2VudEhvc3RBY2Nlc3NNb2RlLlJlYWRXcml0ZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHlpZWxkIHsgdXJpOiBVUkkucGFyc2UodXJpU3RyKSwgbW9kZSB9O1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIElnbm9yZSBtYWxmb3JtZWQgVVJJIGtleXMuXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcGVyc2lzdEdyYW50KGFkZHJlc3M6IHN0cmluZywgdXJpOiBVUkksIG1vZGU6IEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVxdWVzdGVkOiBBZ2VudEhvc3RBY2Nlc3NNb2RlID0gbW9kZSA9PT0gQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuV3JpdGVcblx0XHRcdD8gQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkV3JpdGVcblx0XHRcdDogQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkO1xuXG5cdFx0Zm9yIChjb25zdCBncmFudCBvZiB0aGlzLl9yZWFkUGVyc2lzdGVkR3JhbnRzKGFkZHJlc3MpKSB7XG5cdFx0XHRjb25zdCBjb3ZlcnMgPSBncmFudC5tb2RlID09PSBBZ2VudEhvc3RBY2Nlc3NNb2RlLlJlYWRXcml0ZSB8fCByZXF1ZXN0ZWQgPT09IEFnZW50SG9zdEFjY2Vzc01vZGUuUmVhZDtcblx0XHRcdGlmIChjb3ZlcnMgJiYgZXh0VXJpLmlzRXF1YWxPclBhcmVudCh1cmksIGdyYW50LnVyaSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHsgdGFyZ2V0LCB2YWx1ZSB9ID0gdGhpcy5faW5zcGVjdFNjb3BlZFNldHRpbmcoKTtcblx0XHRjb25zdCBmb3JBZGRyZXNzOiBSZWNvcmQ8c3RyaW5nLCBBZ2VudEhvc3RBY2Nlc3NNb2RlPiA9IHsgLi4uKHZhbHVlW2FkZHJlc3NdID8/IHt9KSB9O1xuXHRcdGNvbnN0IHVyaUtleSA9IHVyaS50b1N0cmluZygpO1xuXHRcdGlmIChmb3JBZGRyZXNzW3VyaUtleV0gPT09IEFnZW50SG9zdEFjY2Vzc01vZGUuUmVhZFdyaXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvckFkZHJlc3NbdXJpS2V5XSA9IHJlcXVlc3RlZDtcblxuXHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFxuXHRcdFx0QWdlbnRIb3N0TG9jYWxGaWxlUGVybWlzc2lvbnNTZXR0aW5nSWQsXG5cdFx0XHR7IC4uLnZhbHVlLCBbYWRkcmVzc106IGZvckFkZHJlc3MgfSxcblx0XHRcdHRhcmdldCxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5zcGVjdFNjb3BlZFNldHRpbmcoKTogeyB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQ7IHZhbHVlOiBBZ2VudEhvc3RQZXJtaXNzaW9uc1NldHRpbmcgfSB7XG5cdFx0Y29uc3QgaW5zcGVjdGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxBZ2VudEhvc3RQZXJtaXNzaW9uc1NldHRpbmc+KEFnZW50SG9zdExvY2FsRmlsZVBlcm1pc3Npb25zU2V0dGluZ0lkKTtcblx0XHRpZiAoaW5zcGVjdGVkLmFwcGxpY2F0aW9uVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHsgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LkFQUExJQ0FUSU9OLCB2YWx1ZTogaW5zcGVjdGVkLmFwcGxpY2F0aW9uVmFsdWUgfTtcblx0XHR9XG5cdFx0aWYgKGluc3BlY3RlZC51c2VyTG9jYWxWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4geyB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCwgdmFsdWU6IGluc3BlY3RlZC51c2VyTG9jYWxWYWx1ZSB9O1xuXHRcdH1cblx0XHRpZiAoaW5zcGVjdGVkLnVzZXJSZW1vdGVWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4geyB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUsIHZhbHVlOiBpbnNwZWN0ZWQudXNlclJlbW90ZVZhbHVlIH07XG5cdFx0fVxuXHRcdGlmIChpbnNwZWN0ZWQudXNlclZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB7IHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLCB2YWx1ZTogaW5zcGVjdGVkLnVzZXJWYWx1ZSB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT04sIHZhbHVlOiB7fSB9O1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2UsIEFnZW50SG9zdFJlc291cmNlU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFw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
