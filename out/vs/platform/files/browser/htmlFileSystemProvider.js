import { localize } from "../../../nls.js";
import { URI } from "../../../base/common/uri.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { basename, extname, normalize } from "../../../base/common/path.js";
import { isLinux } from "../../../base/common/platform.js";
import { extUri, extUriIgnorePathCase, joinPath } from "../../../base/common/resources.js";
import { newWriteableStream } from "../../../base/common/stream.js";
import { createFileSystemProviderError, FileSystemProviderCapabilities, FileSystemProviderError, FileSystemProviderErrorCode, FileType, FileChangeType } from "../common/files.js";
import { WebFileSystemAccess, WebFileSystemObserver } from "./webFileSystemAccess.js";
import { LogLevel } from "../../log/common/log.js";
class HTMLFileSystemProvider extends Disposable {
  //#endregion
  constructor(indexedDB, store, logService) {
    super();
    this.indexedDB = indexedDB;
    this.store = store;
    this.logService = logService;
    //#region Events (unsupported)
    this.onDidChangeCapabilities = Event.None;
    //#endregion
    //#region File Capabilities
    this.extUri = isLinux ? extUri : extUriIgnorePathCase;
    //#endregion
    //#region File Watching (unsupported)
    this._onDidChangeFileEmitter = this._register(new Emitter());
    this.onDidChangeFile = this._onDidChangeFileEmitter.event;
    //#endregion
    //#region File/Directoy Handle Registry
    this._files = /* @__PURE__ */ new Map();
    this._directories = /* @__PURE__ */ new Map();
  }
  get capabilities() {
    if (!this._capabilities) {
      this._capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileReadStream;
      if (isLinux) {
        this._capabilities |= FileSystemProviderCapabilities.PathCaseSensitive;
      }
    }
    return this._capabilities;
  }
  //#region File Metadata Resolving
  async stat(resource) {
    try {
      const handle = await this.getHandle(resource);
      if (!handle) {
        throw this.createFileSystemProviderError(resource, "No such file or directory, stat", FileSystemProviderErrorCode.FileNotFound);
      }
      if (WebFileSystemAccess.isFileSystemFileHandle(handle)) {
        const file = await handle.getFile();
        return {
          type: FileType.File,
          mtime: file.lastModified,
          ctime: 0,
          size: file.size
        };
      }
      return {
        type: FileType.Directory,
        mtime: 0,
        ctime: 0,
        size: 0
      };
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  async readdir(resource) {
    try {
      const handle = await this.getDirectoryHandle(resource);
      if (!handle) {
        throw this.createFileSystemProviderError(resource, "No such file or directory, readdir", FileSystemProviderErrorCode.FileNotFound);
      }
      const result = [];
      for await (const [name, child] of handle) {
        result.push([name, WebFileSystemAccess.isFileSystemFileHandle(child) ? FileType.File : FileType.Directory]);
      }
      return result;
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  //#endregion
  //#region File Reading/Writing
  readFileStream(resource, opts, token) {
    const stream = newWriteableStream((data) => VSBuffer.concat(data.map((data2) => VSBuffer.wrap(data2))).buffer, {
      // Set a highWaterMark to prevent the stream
      // for file upload to produce large buffers
      // in-memory
      highWaterMark: 10
    });
    (async () => {
      try {
        const handle = await this.getFileHandle(resource);
        if (!handle) {
          throw this.createFileSystemProviderError(resource, "No such file or directory, readFile", FileSystemProviderErrorCode.FileNotFound);
        }
        const file = await handle.getFile();
        if (typeof opts.length === "number" || typeof opts.position === "number") {
          let buffer = new Uint8Array(await file.arrayBuffer());
          if (typeof opts?.position === "number") {
            buffer = buffer.slice(opts.position);
          }
          if (typeof opts?.length === "number") {
            buffer = buffer.slice(0, opts.length);
          }
          stream.end(buffer);
        } else {
          const reader = file.stream().getReader();
          let res = await reader.read();
          while (!res.done) {
            if (token.isCancellationRequested) {
              break;
            }
            await stream.write(res.value);
            if (token.isCancellationRequested) {
              break;
            }
            res = await reader.read();
          }
          stream.end(void 0);
        }
      } catch (error) {
        stream.error(this.toFileSystemProviderError(error));
        stream.end();
      }
    })();
    return stream;
  }
  async readFile(resource) {
    try {
      const handle = await this.getFileHandle(resource);
      if (!handle) {
        throw this.createFileSystemProviderError(resource, "No such file or directory, readFile", FileSystemProviderErrorCode.FileNotFound);
      }
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  async writeFile(resource, content, opts) {
    try {
      let handle = await this.getFileHandle(resource);
      if (!opts.create || !opts.overwrite) {
        if (handle) {
          if (!opts.overwrite) {
            throw this.createFileSystemProviderError(resource, "File already exists, writeFile", FileSystemProviderErrorCode.FileExists);
          }
        } else {
          if (!opts.create) {
            throw this.createFileSystemProviderError(resource, "No such file, writeFile", FileSystemProviderErrorCode.FileNotFound);
          }
        }
      }
      if (!handle) {
        const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
        if (!parent) {
          throw this.createFileSystemProviderError(resource, "No such parent directory, writeFile", FileSystemProviderErrorCode.FileNotFound);
        }
        handle = await parent.getFileHandle(this.extUri.basename(resource), { create: true });
        if (!handle) {
          throw this.createFileSystemProviderError(resource, "Unable to create file , writeFile", FileSystemProviderErrorCode.Unknown);
        }
      }
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  //#endregion
  //#region Move/Copy/Delete/Create Folder
  async mkdir(resource) {
    try {
      const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
      if (!parent) {
        throw this.createFileSystemProviderError(resource, "No such parent directory, mkdir", FileSystemProviderErrorCode.FileNotFound);
      }
      await parent.getDirectoryHandle(this.extUri.basename(resource), { create: true });
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  async delete(resource, opts) {
    try {
      const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
      if (!parent) {
        throw this.createFileSystemProviderError(resource, "No such parent directory, delete", FileSystemProviderErrorCode.FileNotFound);
      }
      return parent.removeEntry(this.extUri.basename(resource), { recursive: opts.recursive });
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  async rename(from, to, opts) {
    try {
      if (this.extUri.isEqual(from, to)) {
        return;
      }
      const fileHandle = await this.getFileHandle(from);
      if (fileHandle) {
        const file = await fileHandle.getFile();
        const contents = new Uint8Array(await file.arrayBuffer());
        await this.writeFile(to, contents, { create: true, overwrite: opts.overwrite, unlock: false, atomic: false });
        await this.delete(from, { recursive: false, useTrash: false, atomic: false });
      } else {
        throw this.createFileSystemProviderError(from, localize("fileSystemRenameError", "Rename is only supported for files."), FileSystemProviderErrorCode.Unavailable);
      }
    } catch (error) {
      throw this.toFileSystemProviderError(error);
    }
  }
  watch(resource, opts) {
    const disposables = new DisposableStore();
    this.doWatch(resource, opts, disposables).catch((error) => this.logService.error(`[File Watcher ('FileSystemObserver')] Error: ${error} (${resource})`));
    return disposables;
  }
  async doWatch(resource, opts, disposables) {
    if (!WebFileSystemObserver.supported(globalThis)) {
      return;
    }
    const handle = await this.getHandle(resource);
    if (!handle || disposables.isDisposed) {
      return;
    }
    const observer = new globalThis.FileSystemObserver((records) => {
      if (disposables.isDisposed) {
        return;
      }
      const events = [];
      for (const record of records) {
        if (this.logService.getLevel() === LogLevel.Trace) {
          this.logService.trace(`[File Watcher ('FileSystemObserver')] [${record.type}] ${joinPath(resource, ...record.relativePathComponents)}`);
        }
        switch (record.type) {
          case "appeared":
            events.push({ resource: joinPath(resource, ...record.relativePathComponents), type: FileChangeType.ADDED });
            break;
          case "disappeared":
            events.push({ resource: joinPath(resource, ...record.relativePathComponents), type: FileChangeType.DELETED });
            break;
          case "modified":
            events.push({ resource: joinPath(resource, ...record.relativePathComponents), type: FileChangeType.UPDATED });
            break;
          case "errored":
            this.logService.trace(`[File Watcher ('FileSystemObserver')] errored, disposing observer (${resource})`);
            disposables.dispose();
        }
      }
      if (events.length) {
        this._onDidChangeFileEmitter.fire(events);
      }
    });
    try {
      await observer.observe(handle, opts.recursive ? { recursive: true } : void 0);
    } finally {
      if (disposables.isDisposed) {
        observer.disconnect();
      } else {
        disposables.add(toDisposable(() => observer.disconnect()));
      }
    }
  }
  registerFileHandle(handle) {
    return this.registerHandle(handle, this._files);
  }
  registerDirectoryHandle(handle) {
    return this.registerHandle(handle, this._directories);
  }
  get directories() {
    return this._directories.values();
  }
  async registerHandle(handle, map) {
    let handleId = `/${handle.name}`;
    if (map.has(handleId) && !await map.get(handleId)?.isSameEntry(handle)) {
      const fileExt = extname(handle.name);
      const fileName = basename(handle.name, fileExt);
      let handleIdCounter = 1;
      do {
        handleId = `/${fileName}-${handleIdCounter++}${fileExt}`;
      } while (map.has(handleId) && !await map.get(handleId)?.isSameEntry(handle));
    }
    map.set(handleId, handle);
    try {
      await this.indexedDB?.runInTransaction(this.store, "readwrite", (objectStore) => objectStore.put(handle, handleId));
    } catch (error) {
      this.logService.error(error);
    }
    return URI.from({ scheme: Schemas.file, path: handleId });
  }
  async getHandle(resource) {
    let handle = await this.doGetHandle(resource);
    if (!handle) {
      const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
      if (parent) {
        const name = extUri.basename(resource);
        try {
          handle = await parent.getFileHandle(name);
        } catch (error) {
          try {
            handle = await parent.getDirectoryHandle(name);
          } catch (error2) {
          }
        }
      }
    }
    return handle;
  }
  async getFileHandle(resource) {
    const handle = await this.doGetHandle(resource);
    if (handle instanceof FileSystemFileHandle) {
      return handle;
    }
    const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
    try {
      return await parent?.getFileHandle(extUri.basename(resource));
    } catch (error) {
      return void 0;
    }
  }
  async getDirectoryHandle(resource) {
    const handle = await this.doGetHandle(resource);
    if (handle instanceof FileSystemDirectoryHandle) {
      return handle;
    }
    const parentUri = this.extUri.dirname(resource);
    if (this.extUri.isEqual(parentUri, resource)) {
      return void 0;
    }
    const parent = await this.getDirectoryHandle(parentUri);
    try {
      return await parent?.getDirectoryHandle(extUri.basename(resource));
    } catch (error) {
      return void 0;
    }
  }
  async doGetHandle(resource) {
    if (this.extUri.dirname(resource).path !== "/") {
      return void 0;
    }
    const handleId = resource.path.replace(/\/$/, "");
    const inMemoryHandle = this._files.get(handleId) ?? this._directories.get(handleId);
    if (inMemoryHandle) {
      return inMemoryHandle;
    }
    const persistedHandle = await this.indexedDB?.runInTransaction(this.store, "readonly", (store) => store.get(handleId));
    if (WebFileSystemAccess.isFileSystemHandle(persistedHandle)) {
      let hasPermissions = await persistedHandle.queryPermission() === "granted";
      try {
        if (!hasPermissions) {
          hasPermissions = await persistedHandle.requestPermission() === "granted";
        }
      } catch (error) {
        this.logService.error(error);
      }
      if (hasPermissions) {
        if (WebFileSystemAccess.isFileSystemFileHandle(persistedHandle)) {
          this._files.set(handleId, persistedHandle);
        } else if (WebFileSystemAccess.isFileSystemDirectoryHandle(persistedHandle)) {
          this._directories.set(handleId, persistedHandle);
        }
        return persistedHandle;
      }
    }
    throw this.createFileSystemProviderError(resource, "No file system handle registered", FileSystemProviderErrorCode.Unavailable);
  }
  //#endregion
  toFileSystemProviderError(error) {
    if (error instanceof FileSystemProviderError) {
      return error;
    }
    let code = FileSystemProviderErrorCode.Unknown;
    if (error.name === "NotAllowedError") {
      error = new Error(localize("fileSystemNotAllowedError", "Insufficient permissions. Please retry and allow the operation."));
      code = FileSystemProviderErrorCode.Unavailable;
    }
    return createFileSystemProviderError(error, code);
  }
  createFileSystemProviderError(resource, msg, code) {
    return createFileSystemProviderError(new Error(`${msg} (${normalize(resource.path)})`), code);
  }
}
export {
  HTMLFileSystemProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2ZpbGVzL2Jyb3dzZXIvaHRtbEZpbGVTeXN0ZW1Qcm92aWRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZXh0bmFtZSwgbm9ybWFsaXplIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZXh0VXJpLCBleHRVcmlJZ25vcmVQYXRoQ2FzZSwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgbmV3V3JpdGVhYmxlU3RyZWFtLCBSZWFkYWJsZVN0cmVhbUV2ZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmVhbS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvciwgSUZpbGVEZWxldGVPcHRpb25zLCBJRmlsZU92ZXJ3cml0ZU9wdGlvbnMsIElGaWxlUmVhZFN0cmVhbU9wdGlvbnMsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcywgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSwgRmlsZVR5cGUsIElGaWxlV3JpdGVPcHRpb25zLCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkU3RyZWFtQ2FwYWJpbGl0eSwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSwgSVN0YXQsIElXYXRjaE9wdGlvbnMsIElGaWxlQ2hhbmdlLCBGaWxlQ2hhbmdlVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBGaWxlU3lzdGVtT2JzZXJ2ZXJSZWNvcmQsIFdlYkZpbGVTeXN0ZW1BY2Nlc3MsIFdlYkZpbGVTeXN0ZW1PYnNlcnZlciB9IGZyb20gJy4vd2ViRmlsZVN5c3RlbUFjY2Vzcy5qcyc7XG5pbXBvcnQgeyBJbmRleGVkREIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvaW5kZXhlZERCLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcblxuZXhwb3J0IGNsYXNzIEhUTUxGaWxlU3lzdGVtUHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHkge1xuXG5cdC8vI3JlZ2lvbiBFdmVudHMgKHVuc3VwcG9ydGVkKVxuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzID0gRXZlbnQuTm9uZTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRmlsZSBDYXBhYmlsaXRpZXNcblxuXHRwcml2YXRlIGV4dFVyaSA9IGlzTGludXggPyBleHRVcmkgOiBleHRVcmlJZ25vcmVQYXRoQ2FzZTtcblxuXHRwcml2YXRlIF9jYXBhYmlsaXRpZXM6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyB8IHVuZGVmaW5lZDtcblx0Z2V0IGNhcGFiaWxpdGllcygpOiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMge1xuXHRcdGlmICghdGhpcy5fY2FwYWJpbGl0aWVzKSB7XG5cdFx0XHR0aGlzLl9jYXBhYmlsaXRpZXMgPVxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSB8XG5cdFx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbTtcblxuXHRcdFx0aWYgKGlzTGludXgpIHtcblx0XHRcdFx0dGhpcy5fY2FwYWJpbGl0aWVzIHw9IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5QYXRoQ2FzZVNlbnNpdGl2ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fY2FwYWJpbGl0aWVzO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGluZGV4ZWREQjogSW5kZXhlZERCIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc3RvcmU6IHN0cmluZyxcblx0XHRwcml2YXRlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvLyNyZWdpb24gRmlsZSBNZXRhZGF0YSBSZXNvbHZpbmdcblxuXHRhc3luYyBzdGF0KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElTdGF0PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHRoaXMuZ2V0SGFuZGxlKHJlc291cmNlKTtcblx0XHRcdGlmICghaGFuZGxlKSB7XG5cdFx0XHRcdHRocm93IHRoaXMuY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IocmVzb3VyY2UsICdObyBzdWNoIGZpbGUgb3IgZGlyZWN0b3J5LCBzdGF0JywgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChXZWJGaWxlU3lzdGVtQWNjZXNzLmlzRmlsZVN5c3RlbUZpbGVIYW5kbGUoaGFuZGxlKSkge1xuXHRcdFx0XHRjb25zdCBmaWxlID0gYXdhaXQgaGFuZGxlLmdldEZpbGUoKTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6IEZpbGVUeXBlLkZpbGUsXG5cdFx0XHRcdFx0bXRpbWU6IGZpbGUubGFzdE1vZGlmaWVkLFxuXHRcdFx0XHRcdGN0aW1lOiAwLFxuXHRcdFx0XHRcdHNpemU6IGZpbGUuc2l6ZVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBGaWxlVHlwZS5EaXJlY3RvcnksXG5cdFx0XHRcdG10aW1lOiAwLFxuXHRcdFx0XHRjdGltZTogMCxcblx0XHRcdFx0c2l6ZTogMFxuXHRcdFx0fTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy50b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZWFkZGlyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFtzdHJpbmcsIEZpbGVUeXBlXVtdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHRoaXMuZ2V0RGlyZWN0b3J5SGFuZGxlKHJlc291cmNlKTtcblx0XHRcdGlmICghaGFuZGxlKSB7XG5cdFx0XHRcdHRocm93IHRoaXMuY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IocmVzb3VyY2UsICdObyBzdWNoIGZpbGUgb3IgZGlyZWN0b3J5LCByZWFkZGlyJywgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogW3N0cmluZywgRmlsZVR5cGVdW10gPSBbXTtcblxuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBbbmFtZSwgY2hpbGRdIG9mIGhhbmRsZSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChbbmFtZSwgV2ViRmlsZVN5c3RlbUFjY2Vzcy5pc0ZpbGVTeXN0ZW1GaWxlSGFuZGxlKGNoaWxkKSA/IEZpbGVUeXBlLkZpbGUgOiBGaWxlVHlwZS5EaXJlY3RvcnldKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy50b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRmlsZSBSZWFkaW5nL1dyaXRpbmdcblxuXHRyZWFkRmlsZVN0cmVhbShyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZVJlYWRTdHJlYW1PcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBSZWFkYWJsZVN0cmVhbUV2ZW50czxVaW50OEFycmF5PiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtPFVpbnQ4QXJyYXk+KGRhdGEgPT4gVlNCdWZmZXIuY29uY2F0KGRhdGEubWFwKGRhdGEgPT4gVlNCdWZmZXIud3JhcChkYXRhKSkpLmJ1ZmZlciwge1xuXHRcdFx0Ly8gU2V0IGEgaGlnaFdhdGVyTWFyayB0byBwcmV2ZW50IHRoZSBzdHJlYW1cblx0XHRcdC8vIGZvciBmaWxlIHVwbG9hZCB0byBwcm9kdWNlIGxhcmdlIGJ1ZmZlcnNcblx0XHRcdC8vIGluLW1lbW9yeVxuXHRcdFx0aGlnaFdhdGVyTWFyazogMTBcblx0XHR9KTtcblxuXHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCB0aGlzLmdldEZpbGVIYW5kbGUocmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoIWhhbmRsZSkge1xuXHRcdFx0XHRcdHRocm93IHRoaXMuY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IocmVzb3VyY2UsICdObyBzdWNoIGZpbGUgb3IgZGlyZWN0b3J5LCByZWFkRmlsZScsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZmlsZSA9IGF3YWl0IGhhbmRsZS5nZXRGaWxlKCk7XG5cblx0XHRcdFx0Ly8gUGFydGlhbCBmaWxlOiBpbXBsZW1lbnRlZCBzaW1wbHkgdmlhIGByZWFkRmlsZWBcblx0XHRcdFx0aWYgKHR5cGVvZiBvcHRzLmxlbmd0aCA9PT0gJ251bWJlcicgfHwgdHlwZW9mIG9wdHMucG9zaXRpb24gPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0bGV0IGJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KGF3YWl0IGZpbGUuYXJyYXlCdWZmZXIoKSk7XG5cblx0XHRcdFx0XHRpZiAodHlwZW9mIG9wdHM/LnBvc2l0aW9uID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0YnVmZmVyID0gYnVmZmVyLnNsaWNlKG9wdHMucG9zaXRpb24pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh0eXBlb2Ygb3B0cz8ubGVuZ3RoID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0YnVmZmVyID0gYnVmZmVyLnNsaWNlKDAsIG9wdHMubGVuZ3RoKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRzdHJlYW0uZW5kKGJ1ZmZlcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBFbnRpcmUgZmlsZVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRjb25zdCByZWFkZXI6IFJlYWRhYmxlU3RyZWFtRGVmYXVsdFJlYWRlcjxVaW50OEFycmF5PiA9IGZpbGUuc3RyZWFtKCkuZ2V0UmVhZGVyKCk7XG5cblx0XHRcdFx0XHRsZXQgcmVzID0gYXdhaXQgcmVhZGVyLnJlYWQoKTtcblx0XHRcdFx0XHR3aGlsZSAoIXJlcy5kb25lKSB7XG5cdFx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIFdyaXRlIGJ1ZmZlciBpbnRvIHN0cmVhbSBidXQgbWFrZSBzdXJlIHRvIHdhaXRcblx0XHRcdFx0XHRcdC8vIGluIGNhc2UgdGhlIGBoaWdoV2F0ZXJNYXJrYCBpcyByZWFjaGVkXG5cdFx0XHRcdFx0XHRhd2FpdCBzdHJlYW0ud3JpdGUocmVzLnZhbHVlKTtcblxuXHRcdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXMgPSBhd2FpdCByZWFkZXIucmVhZCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzdHJlYW0uZW5kKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHN0cmVhbS5lcnJvcih0aGlzLnRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoZXJyb3IpKTtcblx0XHRcdFx0c3RyZWFtLmVuZCgpO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cblx0XHRyZXR1cm4gc3RyZWFtO1xuXHR9XG5cblx0YXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VWludDhBcnJheT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCB0aGlzLmdldEZpbGVIYW5kbGUocmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFoYW5kbGUpIHtcblx0XHRcdFx0dGhyb3cgdGhpcy5jcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihyZXNvdXJjZSwgJ05vIHN1Y2ggZmlsZSBvciBkaXJlY3RvcnksIHJlYWRGaWxlJywgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZpbGUgPSBhd2FpdCBoYW5kbGUuZ2V0RmlsZSgpO1xuXG5cdFx0XHRyZXR1cm4gbmV3IFVpbnQ4QXJyYXkoYXdhaXQgZmlsZS5hcnJheUJ1ZmZlcigpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy50b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB3cml0ZUZpbGUocmVzb3VyY2U6IFVSSSwgY29udGVudDogVWludDhBcnJheSwgb3B0czogSUZpbGVXcml0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0bGV0IGhhbmRsZSA9IGF3YWl0IHRoaXMuZ2V0RmlsZUhhbmRsZShyZXNvdXJjZSk7XG5cblx0XHRcdC8vIFZhbGlkYXRlIHRhcmdldCB1bmxlc3MgeyBjcmVhdGU6IHRydWUsIG92ZXJ3cml0ZTogdHJ1ZSB9XG5cdFx0XHRpZiAoIW9wdHMuY3JlYXRlIHx8ICFvcHRzLm92ZXJ3cml0ZSkge1xuXHRcdFx0XHRpZiAoaGFuZGxlKSB7XG5cdFx0XHRcdFx0aWYgKCFvcHRzLm92ZXJ3cml0ZSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgdGhpcy5jcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihyZXNvdXJjZSwgJ0ZpbGUgYWxyZWFkeSBleGlzdHMsIHdyaXRlRmlsZScsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlRXhpc3RzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKCFvcHRzLmNyZWF0ZSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgdGhpcy5jcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihyZXNvdXJjZSwgJ05vIHN1Y2ggZmlsZSwgd3JpdGVGaWxlJywgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIENyZWF0ZSB0YXJnZXQgYXMgbmVlZGVkXG5cdFx0XHRpZiAoIWhhbmRsZSkge1xuXHRcdFx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCB0aGlzLmdldERpcmVjdG9yeUhhbmRsZSh0aGlzLmV4dFVyaS5kaXJuYW1lKHJlc291cmNlKSk7XG5cdFx0XHRcdGlmICghcGFyZW50KSB7XG5cdFx0XHRcdFx0dGhyb3cgdGhpcy5jcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihyZXNvdXJjZSwgJ05vIHN1Y2ggcGFyZW50IGRpcmVjdG9yeSwgd3JpdGVGaWxlJywgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRoYW5kbGUgPSBhd2FpdCBwYXJlbnQuZ2V0RmlsZUhhbmRsZSh0aGlzLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSksIHsgY3JlYXRlOiB0cnVlIH0pO1xuXHRcdFx0XHRpZiAoIWhhbmRsZSkge1xuXHRcdFx0XHRcdHRocm93IHRoaXMuY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IocmVzb3VyY2UsICdVbmFibGUgdG8gY3JlYXRlIGZpbGUgLCB3cml0ZUZpbGUnLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5rbm93bik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gV3JpdGUgdG8gdGFyZ2V0IG92ZXJ3cml0aW5nIGFueSBleGlzdGluZyBjb250ZW50c1xuXHRcdFx0Y29uc3Qgd3JpdGFibGUgPSBhd2FpdCBoYW5kbGUuY3JlYXRlV3JpdGFibGUoKTtcblx0XHRcdGF3YWl0IHdyaXRhYmxlLndyaXRlKGNvbnRlbnQgYXMgVWludDhBcnJheTxBcnJheUJ1ZmZlcj4pO1xuXHRcdFx0YXdhaXQgd3JpdGFibGUuY2xvc2UoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy50b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTW92ZS9Db3B5L0RlbGV0ZS9DcmVhdGUgRm9sZGVyXG5cblx0YXN5bmMgbWtkaXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCB0aGlzLmdldERpcmVjdG9yeUhhbmRsZSh0aGlzLmV4dFVyaS5kaXJuYW1lKHJlc291cmNlKSk7XG5cdFx0XHRpZiAoIXBhcmVudCkge1xuXHRcdFx0XHR0aHJvdyB0aGlzLmNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKHJlc291cmNlLCAnTm8gc3VjaCBwYXJlbnQgZGlyZWN0b3J5LCBta2RpcicsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCBwYXJlbnQuZ2V0RGlyZWN0b3J5SGFuZGxlKHRoaXMuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKSwgeyBjcmVhdGU6IHRydWUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMudG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZGVsZXRlKHJlc291cmNlOiBVUkksIG9wdHM6IElGaWxlRGVsZXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCB0aGlzLmdldERpcmVjdG9yeUhhbmRsZSh0aGlzLmV4dFVyaS5kaXJuYW1lKHJlc291cmNlKSk7XG5cdFx0XHRpZiAoIXBhcmVudCkge1xuXHRcdFx0XHR0aHJvdyB0aGlzLmNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKHJlc291cmNlLCAnTm8gc3VjaCBwYXJlbnQgZGlyZWN0b3J5LCBkZWxldGUnLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEZvdW5kKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHBhcmVudC5yZW1vdmVFbnRyeSh0aGlzLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSksIHsgcmVjdXJzaXZlOiBvcHRzLnJlY3Vyc2l2ZSB9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy50b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZW5hbWUoZnJvbTogVVJJLCB0bzogVVJJLCBvcHRzOiBJRmlsZU92ZXJ3cml0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwoZnJvbSwgdG8pKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gbm8tb3AgaWYgdGhlIHBhdGhzIGFyZSB0aGUgc2FtZVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbXBsZW1lbnQgZmlsZSByZW5hbWUgYnkgd3JpdGUgKyBkZWxldGVcblx0XHRcdGNvbnN0IGZpbGVIYW5kbGUgPSBhd2FpdCB0aGlzLmdldEZpbGVIYW5kbGUoZnJvbSk7XG5cdFx0XHRpZiAoZmlsZUhhbmRsZSkge1xuXHRcdFx0XHRjb25zdCBmaWxlID0gYXdhaXQgZmlsZUhhbmRsZS5nZXRGaWxlKCk7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnRzID0gbmV3IFVpbnQ4QXJyYXkoYXdhaXQgZmlsZS5hcnJheUJ1ZmZlcigpKTtcblxuXHRcdFx0XHRhd2FpdCB0aGlzLndyaXRlRmlsZSh0bywgY29udGVudHMsIHsgY3JlYXRlOiB0cnVlLCBvdmVyd3JpdGU6IG9wdHMub3ZlcndyaXRlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRlbGV0ZShmcm9tLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIHVzZVRyYXNoOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlsZSBBUEkgZG9lcyBub3Qgc3VwcG9ydCBhbnkgcmVhbCByZW5hbWUgb3RoZXJ3aXNlXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0dGhyb3cgdGhpcy5jcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihmcm9tLCBsb2NhbGl6ZSgnZmlsZVN5c3RlbVJlbmFtZUVycm9yJywgXCJSZW5hbWUgaXMgb25seSBzdXBwb3J0ZWQgZm9yIGZpbGVzLlwiKSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVuYXZhaWxhYmxlKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy50b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRmlsZSBXYXRjaGluZyAodW5zdXBwb3J0ZWQpXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VGaWxlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IElGaWxlQ2hhbmdlW10+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbGUgPSB0aGlzLl9vbkRpZENoYW5nZUZpbGVFbWl0dGVyLmV2ZW50O1xuXG5cdHdhdGNoKHJlc291cmNlOiBVUkksIG9wdHM6IElXYXRjaE9wdGlvbnMpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0aGlzLmRvV2F0Y2gocmVzb3VyY2UsIG9wdHMsIGRpc3Bvc2FibGVzKS5jYXRjaChlcnJvciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtGaWxlIFdhdGNoZXIgKCdGaWxlU3lzdGVtT2JzZXJ2ZXInKV0gRXJyb3I6ICR7ZXJyb3J9ICgke3Jlc291cmNlfSlgKSk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvV2F0Y2gocmVzb3VyY2U6IFVSSSwgb3B0czogSVdhdGNoT3B0aW9ucywgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghV2ViRmlsZVN5c3RlbU9ic2VydmVyLnN1cHBvcnRlZChnbG9iYWxUaGlzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHRoaXMuZ2V0SGFuZGxlKHJlc291cmNlKTtcblx0XHRpZiAoIWhhbmRsZSB8fCBkaXNwb3NhYmxlcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0Y29uc3Qgb2JzZXJ2ZXIgPSBuZXcgKGdsb2JhbFRoaXMgYXMgYW55KS5GaWxlU3lzdGVtT2JzZXJ2ZXIoKHJlY29yZHM6IEZpbGVTeXN0ZW1PYnNlcnZlclJlY29yZFtdKSA9PiB7XG5cdFx0XHRpZiAoZGlzcG9zYWJsZXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGV2ZW50czogSUZpbGVDaGFuZ2VbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCByZWNvcmQgb2YgcmVjb3Jkcykge1xuXHRcdFx0XHRpZiAodGhpcy5sb2dTZXJ2aWNlLmdldExldmVsKCkgPT09IExvZ0xldmVsLlRyYWNlKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbRmlsZSBXYXRjaGVyICgnRmlsZVN5c3RlbU9ic2VydmVyJyldIFske3JlY29yZC50eXBlfV0gJHtqb2luUGF0aChyZXNvdXJjZSwgLi4ucmVjb3JkLnJlbGF0aXZlUGF0aENvbXBvbmVudHMpfWApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c3dpdGNoIChyZWNvcmQudHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgJ2FwcGVhcmVkJzpcblx0XHRcdFx0XHRcdGV2ZW50cy5wdXNoKHsgcmVzb3VyY2U6IGpvaW5QYXRoKHJlc291cmNlLCAuLi5yZWNvcmQucmVsYXRpdmVQYXRoQ29tcG9uZW50cyksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH0pO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZGlzYXBwZWFyZWQnOlxuXHRcdFx0XHRcdFx0ZXZlbnRzLnB1c2goeyByZXNvdXJjZTogam9pblBhdGgocmVzb3VyY2UsIC4uLnJlY29yZC5yZWxhdGl2ZVBhdGhDb21wb25lbnRzKSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ21vZGlmaWVkJzpcblx0XHRcdFx0XHRcdGV2ZW50cy5wdXNoKHsgcmVzb3VyY2U6IGpvaW5QYXRoKHJlc291cmNlLCAuLi5yZWNvcmQucmVsYXRpdmVQYXRoQ29tcG9uZW50cyksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdlcnJvcmVkJzpcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0ZpbGUgV2F0Y2hlciAoJ0ZpbGVTeXN0ZW1PYnNlcnZlcicpXSBlcnJvcmVkLCBkaXNwb3Npbmcgb2JzZXJ2ZXIgKCR7cmVzb3VyY2V9KWApO1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChldmVudHMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRmlsZUVtaXR0ZXIuZmlyZShldmVudHMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IG9ic2VydmVyLm9ic2VydmUoaGFuZGxlLCBvcHRzLnJlY3Vyc2l2ZSA/IHsgcmVjdXJzaXZlOiB0cnVlIH0gOiB1bmRlZmluZWQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoZGlzcG9zYWJsZXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRvYnNlcnZlci5kaXNjb25uZWN0KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG9ic2VydmVyLmRpc2Nvbm5lY3QoKSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBGaWxlL0RpcmVjdG95IEhhbmRsZSBSZWdpc3RyeVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVzID0gbmV3IE1hcDxzdHJpbmcsIEZpbGVTeXN0ZW1GaWxlSGFuZGxlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXJlY3RvcmllcyA9IG5ldyBNYXA8c3RyaW5nLCBGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlPigpO1xuXG5cdHJlZ2lzdGVyRmlsZUhhbmRsZShoYW5kbGU6IEZpbGVTeXN0ZW1GaWxlSGFuZGxlKTogUHJvbWlzZTxVUkk+IHtcblx0XHRyZXR1cm4gdGhpcy5yZWdpc3RlckhhbmRsZShoYW5kbGUsIHRoaXMuX2ZpbGVzKTtcblx0fVxuXG5cdHJlZ2lzdGVyRGlyZWN0b3J5SGFuZGxlKGhhbmRsZTogRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSk6IFByb21pc2U8VVJJPiB7XG5cdFx0cmV0dXJuIHRoaXMucmVnaXN0ZXJIYW5kbGUoaGFuZGxlLCB0aGlzLl9kaXJlY3Rvcmllcyk7XG5cdH1cblxuXHRnZXQgZGlyZWN0b3JpZXMoKTogSXRlcmFibGU8RmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZT4ge1xuXHRcdHJldHVybiB0aGlzLl9kaXJlY3Rvcmllcy52YWx1ZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVnaXN0ZXJIYW5kbGUoaGFuZGxlOiBGaWxlU3lzdGVtSGFuZGxlLCBtYXA6IE1hcDxzdHJpbmcsIEZpbGVTeXN0ZW1IYW5kbGU+KTogUHJvbWlzZTxVUkk+IHtcblx0XHRsZXQgaGFuZGxlSWQgPSBgLyR7aGFuZGxlLm5hbWV9YDtcblxuXHRcdC8vIENvbXB1dGUgYSB2YWxpZCBoYW5kbGUgSUQgaW4gY2FzZSB0aGlzIGV4aXN0cyBhbHJlYWR5XG5cdFx0aWYgKG1hcC5oYXMoaGFuZGxlSWQpICYmICFhd2FpdCBtYXAuZ2V0KGhhbmRsZUlkKT8uaXNTYW1lRW50cnkoaGFuZGxlKSkge1xuXHRcdFx0Y29uc3QgZmlsZUV4dCA9IGV4dG5hbWUoaGFuZGxlLm5hbWUpO1xuXHRcdFx0Y29uc3QgZmlsZU5hbWUgPSBiYXNlbmFtZShoYW5kbGUubmFtZSwgZmlsZUV4dCk7XG5cblx0XHRcdGxldCBoYW5kbGVJZENvdW50ZXIgPSAxO1xuXHRcdFx0ZG8ge1xuXHRcdFx0XHRoYW5kbGVJZCA9IGAvJHtmaWxlTmFtZX0tJHtoYW5kbGVJZENvdW50ZXIrK30ke2ZpbGVFeHR9YDtcblx0XHRcdH0gd2hpbGUgKG1hcC5oYXMoaGFuZGxlSWQpICYmICFhd2FpdCBtYXAuZ2V0KGhhbmRsZUlkKT8uaXNTYW1lRW50cnkoaGFuZGxlKSk7XG5cdFx0fVxuXG5cdFx0bWFwLnNldChoYW5kbGVJZCwgaGFuZGxlKTtcblxuXHRcdC8vIFJlbWVtYmVyIGluIEluZGV4REIgZm9yIGZ1dHVyZSBsb29rdXBcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5pbmRleGVkREI/LnJ1bkluVHJhbnNhY3Rpb24odGhpcy5zdG9yZSwgJ3JlYWR3cml0ZScsIG9iamVjdFN0b3JlID0+IG9iamVjdFN0b3JlLnB1dChoYW5kbGUsIGhhbmRsZUlkKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6IGhhbmRsZUlkIH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0SGFuZGxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPEZpbGVTeXN0ZW1IYW5kbGUgfCB1bmRlZmluZWQ+IHtcblxuXHRcdC8vIEZpcnN0OiB0cnkgdG8gZmluZCBhIHdlbGwga25vd24gaGFuZGxlIGZpcnN0XG5cdFx0bGV0IGhhbmRsZSA9IGF3YWl0IHRoaXMuZG9HZXRIYW5kbGUocmVzb3VyY2UpO1xuXG5cdFx0Ly8gU2Vjb25kOiB3YWxrIHVwIHBhcmVudCBkaXJlY3RvcmllcyBhbmQgcmVzb2x2ZSBoYW5kbGUgaWYgcG9zc2libGVcblx0XHRpZiAoIWhhbmRsZSkge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgdGhpcy5nZXREaXJlY3RvcnlIYW5kbGUodGhpcy5leHRVcmkuZGlybmFtZShyZXNvdXJjZSkpO1xuXHRcdFx0aWYgKHBhcmVudCkge1xuXHRcdFx0XHRjb25zdCBuYW1lID0gZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRoYW5kbGUgPSBhd2FpdCBwYXJlbnQuZ2V0RmlsZUhhbmRsZShuYW1lKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0aGFuZGxlID0gYXdhaXQgcGFyZW50LmdldERpcmVjdG9yeUhhbmRsZShuYW1lKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0Ly8gSWdub3JlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGhhbmRsZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RmlsZUhhbmRsZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxGaWxlU3lzdGVtRmlsZUhhbmRsZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHRoaXMuZG9HZXRIYW5kbGUocmVzb3VyY2UpO1xuXHRcdGlmIChoYW5kbGUgaW5zdGFuY2VvZiBGaWxlU3lzdGVtRmlsZUhhbmRsZSkge1xuXHRcdFx0cmV0dXJuIGhhbmRsZTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCB0aGlzLmdldERpcmVjdG9yeUhhbmRsZSh0aGlzLmV4dFVyaS5kaXJuYW1lKHJlc291cmNlKSk7XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHBhcmVudD8uZ2V0RmlsZUhhbmRsZShleHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gZ3VhcmQgYWdhaW5zdCBwb3NzaWJsZSBET01FeGNlcHRpb25cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldERpcmVjdG9yeUhhbmRsZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgdGhpcy5kb0dldEhhbmRsZShyZXNvdXJjZSk7XG5cdFx0aWYgKGhhbmRsZSBpbnN0YW5jZW9mIEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUpIHtcblx0XHRcdHJldHVybiBoYW5kbGU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyZW50VXJpID0gdGhpcy5leHRVcmkuZGlybmFtZShyZXNvdXJjZSk7XG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwocGFyZW50VXJpLCByZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIHJldHVybiB3aGVuIHJvb3QgaXMgcmVhY2hlZCB0byBwcmV2ZW50IGluZmluaXRlIHJlY3Vyc2lvblxuXHRcdH1cblxuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHRoaXMuZ2V0RGlyZWN0b3J5SGFuZGxlKHBhcmVudFVyaSk7XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHBhcmVudD8uZ2V0RGlyZWN0b3J5SGFuZGxlKGV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBndWFyZCBhZ2FpbnN0IHBvc3NpYmxlIERPTUV4Y2VwdGlvblxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9HZXRIYW5kbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8RmlsZVN5c3RlbUhhbmRsZSB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Ly8gV2Ugc3RvcmUgZmlsZSBzeXN0ZW0gaGFuZGxlcyB3aXRoIHRoZSBgaGFuZGxlLm5hbWVgXG5cdFx0Ly8gYW5kIGFzIHN1Y2ggcmVxdWlyZSB0aGUgcmVzb3VyY2UgdG8gYmUgb24gdGhlIHJvb3Rcblx0XHRpZiAodGhpcy5leHRVcmkuZGlybmFtZShyZXNvdXJjZSkucGF0aCAhPT0gJy8nKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhbmRsZUlkID0gcmVzb3VyY2UucGF0aC5yZXBsYWNlKC9cXC8kLywgJycpOyAvLyByZW1vdmUgcG90ZW50aWFsIHNsYXNoIGZyb20gdGhlIGVuZCBvZiB0aGUgcGF0aFxuXG5cdFx0Ly8gRmlyc3Q6IGNoZWNrIGlmIHdlIGhhdmUgYSBrbm93biBoYW5kbGUgc3RvcmVkIGluIG1lbW9yeVxuXHRcdGNvbnN0IGluTWVtb3J5SGFuZGxlID0gdGhpcy5fZmlsZXMuZ2V0KGhhbmRsZUlkKSA/PyB0aGlzLl9kaXJlY3Rvcmllcy5nZXQoaGFuZGxlSWQpO1xuXHRcdGlmIChpbk1lbW9yeUhhbmRsZSkge1xuXHRcdFx0cmV0dXJuIGluTWVtb3J5SGFuZGxlO1xuXHRcdH1cblxuXHRcdC8vIFNlY29uZDogY2hlY2sgaWYgd2UgaGF2ZSBhIHBlcnNpc3RlZCBoYW5kbGUgaW4gSW5kZXhlZERCXG5cdFx0Y29uc3QgcGVyc2lzdGVkSGFuZGxlID0gYXdhaXQgdGhpcy5pbmRleGVkREI/LnJ1bkluVHJhbnNhY3Rpb24odGhpcy5zdG9yZSwgJ3JlYWRvbmx5Jywgc3RvcmUgPT4gc3RvcmUuZ2V0KGhhbmRsZUlkKSk7XG5cdFx0aWYgKFdlYkZpbGVTeXN0ZW1BY2Nlc3MuaXNGaWxlU3lzdGVtSGFuZGxlKHBlcnNpc3RlZEhhbmRsZSkpIHtcblx0XHRcdGxldCBoYXNQZXJtaXNzaW9ucyA9IGF3YWl0IHBlcnNpc3RlZEhhbmRsZS5xdWVyeVBlcm1pc3Npb24oKSA9PT0gJ2dyYW50ZWQnO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKCFoYXNQZXJtaXNzaW9ucykge1xuXHRcdFx0XHRcdGhhc1Blcm1pc3Npb25zID0gYXdhaXQgcGVyc2lzdGVkSGFuZGxlLnJlcXVlc3RQZXJtaXNzaW9uKCkgPT09ICdncmFudGVkJztcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTsgLy8gdGhpcyBjYW4gZmFpbCB3aXRoIGEgRE9NRXhjZXB0aW9uXG5cdFx0XHR9XG5cblx0XHRcdGlmIChoYXNQZXJtaXNzaW9ucykge1xuXHRcdFx0XHRpZiAoV2ViRmlsZVN5c3RlbUFjY2Vzcy5pc0ZpbGVTeXN0ZW1GaWxlSGFuZGxlKHBlcnNpc3RlZEhhbmRsZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9maWxlcy5zZXQoaGFuZGxlSWQsIHBlcnNpc3RlZEhhbmRsZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoV2ViRmlsZVN5c3RlbUFjY2Vzcy5pc0ZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUocGVyc2lzdGVkSGFuZGxlKSkge1xuXHRcdFx0XHRcdHRoaXMuX2RpcmVjdG9yaWVzLnNldChoYW5kbGVJZCwgcGVyc2lzdGVkSGFuZGxlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBwZXJzaXN0ZWRIYW5kbGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVGhpcmQ6IGZhaWwgd2l0aCBhbiBlcnJvclxuXHRcdHRocm93IHRoaXMuY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IocmVzb3VyY2UsICdObyBmaWxlIHN5c3RlbSBoYW5kbGUgcmVnaXN0ZXJlZCcsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5VbmF2YWlsYWJsZSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoZXJyb3I6IEVycm9yKTogRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3Ige1xuXHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKSB7XG5cdFx0XHRyZXR1cm4gZXJyb3I7IC8vIGF2b2lkIGRvdWJsZSBjb252ZXJzaW9uXG5cdFx0fVxuXG5cdFx0bGV0IGNvZGUgPSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5rbm93bjtcblx0XHRpZiAoZXJyb3IubmFtZSA9PT0gJ05vdEFsbG93ZWRFcnJvcicpIHtcblx0XHRcdGVycm9yID0gbmV3IEVycm9yKGxvY2FsaXplKCdmaWxlU3lzdGVtTm90QWxsb3dlZEVycm9yJywgXCJJbnN1ZmZpY2llbnQgcGVybWlzc2lvbnMuIFBsZWFzZSByZXRyeSBhbmQgYWxsb3cgdGhlIG9wZXJhdGlvbi5cIikpO1xuXHRcdFx0Y29kZSA9IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5VbmF2YWlsYWJsZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3JlYXRlRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IoZXJyb3IsIGNvZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihyZXNvdXJjZTogVVJJLCBtc2c6IHN0cmluZywgY29kZTogRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKTogRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3Ige1xuXHRcdHJldHVybiBjcmVhdGVGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcihuZXcgRXJyb3IoYCR7bXNnfSAoJHtub3JtYWxpemUocmVzb3VyY2UucGF0aCl9KWApLCBjb2RlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsU0FBUyxpQkFBaUI7QUFDN0MsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsUUFBUSxzQkFBc0IsZ0JBQWdCO0FBQ3ZELFNBQVMsMEJBQWdEO0FBQ3pELFNBQVMsK0JBQWtHLGdDQUFnQyx5QkFBeUIsNkJBQTZCLFVBQWlLLHNCQUFzQjtBQUN4WCxTQUFtQyxxQkFBcUIsNkJBQTZCO0FBRXJGLFNBQXNCLGdCQUFnQjtBQUUvQixNQUFNLCtCQUErQixXQUFzSDtBQUFBO0FBQUEsRUE4QmpLLFlBQ1MsV0FDUyxPQUNULFlBQ1A7QUFDRCxVQUFNO0FBSkU7QUFDUztBQUNUO0FBN0JUO0FBQUEsU0FBUywwQkFBMEIsTUFBTTtBQU16QztBQUFBO0FBQUEsU0FBUSxTQUFTLFVBQVUsU0FBUztBQWtRcEM7QUFBQTtBQUFBLFNBQWlCLDBCQUEwQixLQUFLLFVBQVUsSUFBSSxRQUFnQyxDQUFDO0FBQy9GLFNBQVMsa0JBQWtCLEtBQUssd0JBQXdCO0FBb0V4RDtBQUFBO0FBQUEsU0FBaUIsU0FBUyxvQkFBSSxJQUFrQztBQUNoRSxTQUFpQixlQUFlLG9CQUFJLElBQXVDO0FBQUEsRUE5UzNFO0FBQUEsRUF2QkEsSUFBSSxlQUErQztBQUNsRCxRQUFJLENBQUMsS0FBSyxlQUFlO0FBQ3hCLFdBQUssZ0JBQ0osK0JBQStCLGdCQUMvQiwrQkFBK0I7QUFFaEMsVUFBSSxTQUFTO0FBQ1osYUFBSyxpQkFBaUIsK0JBQStCO0FBQUEsTUFDdEQ7QUFBQSxJQUNEO0FBRUEsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUEsRUFlQSxNQUFNLEtBQUssVUFBK0I7QUFDekMsUUFBSTtBQUNILFlBQU0sU0FBUyxNQUFNLEtBQUssVUFBVSxRQUFRO0FBQzVDLFVBQUksQ0FBQyxRQUFRO0FBQ1osY0FBTSxLQUFLLDhCQUE4QixVQUFVLG1DQUFtQyw0QkFBNEIsWUFBWTtBQUFBLE1BQy9IO0FBRUEsVUFBSSxvQkFBb0IsdUJBQXVCLE1BQU0sR0FBRztBQUN2RCxjQUFNLE9BQU8sTUFBTSxPQUFPLFFBQVE7QUFFbEMsZUFBTztBQUFBLFVBQ04sTUFBTSxTQUFTO0FBQUEsVUFDZixPQUFPLEtBQUs7QUFBQSxVQUNaLE9BQU87QUFBQSxVQUNQLE1BQU0sS0FBSztBQUFBLFFBQ1o7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLFFBQ04sTUFBTSxTQUFTO0FBQUEsUUFDZixPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0QsU0FBUyxPQUFPO0FBQ2YsWUFBTSxLQUFLLDBCQUEwQixLQUFLO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLFFBQVEsVUFBOEM7QUFDM0QsUUFBSTtBQUNILFlBQU0sU0FBUyxNQUFNLEtBQUssbUJBQW1CLFFBQVE7QUFDckQsVUFBSSxDQUFDLFFBQVE7QUFDWixjQUFNLEtBQUssOEJBQThCLFVBQVUsc0NBQXNDLDRCQUE0QixZQUFZO0FBQUEsTUFDbEk7QUFFQSxZQUFNLFNBQStCLENBQUM7QUFFdEMsdUJBQWlCLENBQUMsTUFBTSxLQUFLLEtBQUssUUFBUTtBQUN6QyxlQUFPLEtBQUssQ0FBQyxNQUFNLG9CQUFvQix1QkFBdUIsS0FBSyxJQUFJLFNBQVMsT0FBTyxTQUFTLFNBQVMsQ0FBQztBQUFBLE1BQzNHO0FBRUEsYUFBTztBQUFBLElBQ1IsU0FBUyxPQUFPO0FBQ2YsWUFBTSxLQUFLLDBCQUEwQixLQUFLO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBLEVBTUEsZUFBZSxVQUFlLE1BQThCLE9BQTREO0FBQ3ZILFVBQU0sU0FBUyxtQkFBK0IsVUFBUSxTQUFTLE9BQU8sS0FBSyxJQUFJLENBQUFBLFVBQVEsU0FBUyxLQUFLQSxLQUFJLENBQUMsQ0FBQyxFQUFFLFFBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQUlwSCxlQUFlO0FBQUEsSUFDaEIsQ0FBQztBQUVELEtBQUMsWUFBWTtBQUNaLFVBQUk7QUFDSCxjQUFNLFNBQVMsTUFBTSxLQUFLLGNBQWMsUUFBUTtBQUNoRCxZQUFJLENBQUMsUUFBUTtBQUNaLGdCQUFNLEtBQUssOEJBQThCLFVBQVUsdUNBQXVDLDRCQUE0QixZQUFZO0FBQUEsUUFDbkk7QUFFQSxjQUFNLE9BQU8sTUFBTSxPQUFPLFFBQVE7QUFHbEMsWUFBSSxPQUFPLEtBQUssV0FBVyxZQUFZLE9BQU8sS0FBSyxhQUFhLFVBQVU7QUFDekUsY0FBSSxTQUFTLElBQUksV0FBVyxNQUFNLEtBQUssWUFBWSxDQUFDO0FBRXBELGNBQUksT0FBTyxNQUFNLGFBQWEsVUFBVTtBQUN2QyxxQkFBUyxPQUFPLE1BQU0sS0FBSyxRQUFRO0FBQUEsVUFDcEM7QUFFQSxjQUFJLE9BQU8sTUFBTSxXQUFXLFVBQVU7QUFDckMscUJBQVMsT0FBTyxNQUFNLEdBQUcsS0FBSyxNQUFNO0FBQUEsVUFDckM7QUFFQSxpQkFBTyxJQUFJLE1BQU07QUFBQSxRQUNsQixPQUdLO0FBQ0osZ0JBQU0sU0FBa0QsS0FBSyxPQUFPLEVBQUUsVUFBVTtBQUVoRixjQUFJLE1BQU0sTUFBTSxPQUFPLEtBQUs7QUFDNUIsaUJBQU8sQ0FBQyxJQUFJLE1BQU07QUFDakIsZ0JBQUksTUFBTSx5QkFBeUI7QUFDbEM7QUFBQSxZQUNEO0FBSUEsa0JBQU0sT0FBTyxNQUFNLElBQUksS0FBSztBQUU1QixnQkFBSSxNQUFNLHlCQUF5QjtBQUNsQztBQUFBLFlBQ0Q7QUFFQSxrQkFBTSxNQUFNLE9BQU8sS0FBSztBQUFBLFVBQ3pCO0FBQ0EsaUJBQU8sSUFBSSxNQUFTO0FBQUEsUUFDckI7QUFBQSxNQUNELFNBQVMsT0FBTztBQUNmLGVBQU8sTUFBTSxLQUFLLDBCQUEwQixLQUFLLENBQUM7QUFDbEQsZUFBTyxJQUFJO0FBQUEsTUFDWjtBQUFBLElBQ0QsR0FBRztBQUVILFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLFNBQVMsVUFBb0M7QUFDbEQsUUFBSTtBQUNILFlBQU0sU0FBUyxNQUFNLEtBQUssY0FBYyxRQUFRO0FBQ2hELFVBQUksQ0FBQyxRQUFRO0FBQ1osY0FBTSxLQUFLLDhCQUE4QixVQUFVLHVDQUF1Qyw0QkFBNEIsWUFBWTtBQUFBLE1BQ25JO0FBRUEsWUFBTSxPQUFPLE1BQU0sT0FBTyxRQUFRO0FBRWxDLGFBQU8sSUFBSSxXQUFXLE1BQU0sS0FBSyxZQUFZLENBQUM7QUFBQSxJQUMvQyxTQUFTLE9BQU87QUFDZixZQUFNLEtBQUssMEJBQTBCLEtBQUs7QUFBQSxJQUMzQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sVUFBVSxVQUFlLFNBQXFCLE1BQXdDO0FBQzNGLFFBQUk7QUFDSCxVQUFJLFNBQVMsTUFBTSxLQUFLLGNBQWMsUUFBUTtBQUc5QyxVQUFJLENBQUMsS0FBSyxVQUFVLENBQUMsS0FBSyxXQUFXO0FBQ3BDLFlBQUksUUFBUTtBQUNYLGNBQUksQ0FBQyxLQUFLLFdBQVc7QUFDcEIsa0JBQU0sS0FBSyw4QkFBOEIsVUFBVSxrQ0FBa0MsNEJBQTRCLFVBQVU7QUFBQSxVQUM1SDtBQUFBLFFBQ0QsT0FBTztBQUNOLGNBQUksQ0FBQyxLQUFLLFFBQVE7QUFDakIsa0JBQU0sS0FBSyw4QkFBOEIsVUFBVSwyQkFBMkIsNEJBQTRCLFlBQVk7QUFBQSxVQUN2SDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBR0EsVUFBSSxDQUFDLFFBQVE7QUFDWixjQUFNLFNBQVMsTUFBTSxLQUFLLG1CQUFtQixLQUFLLE9BQU8sUUFBUSxRQUFRLENBQUM7QUFDMUUsWUFBSSxDQUFDLFFBQVE7QUFDWixnQkFBTSxLQUFLLDhCQUE4QixVQUFVLHVDQUF1Qyw0QkFBNEIsWUFBWTtBQUFBLFFBQ25JO0FBRUEsaUJBQVMsTUFBTSxPQUFPLGNBQWMsS0FBSyxPQUFPLFNBQVMsUUFBUSxHQUFHLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDcEYsWUFBSSxDQUFDLFFBQVE7QUFDWixnQkFBTSxLQUFLLDhCQUE4QixVQUFVLHFDQUFxQyw0QkFBNEIsT0FBTztBQUFBLFFBQzVIO0FBQUEsTUFDRDtBQUdBLFlBQU0sV0FBVyxNQUFNLE9BQU8sZUFBZTtBQUM3QyxZQUFNLFNBQVMsTUFBTSxPQUFrQztBQUN2RCxZQUFNLFNBQVMsTUFBTTtBQUFBLElBQ3RCLFNBQVMsT0FBTztBQUNmLFlBQU0sS0FBSywwQkFBMEIsS0FBSztBQUFBLElBQzNDO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQU0sTUFBTSxVQUE4QjtBQUN6QyxRQUFJO0FBQ0gsWUFBTSxTQUFTLE1BQU0sS0FBSyxtQkFBbUIsS0FBSyxPQUFPLFFBQVEsUUFBUSxDQUFDO0FBQzFFLFVBQUksQ0FBQyxRQUFRO0FBQ1osY0FBTSxLQUFLLDhCQUE4QixVQUFVLG1DQUFtQyw0QkFBNEIsWUFBWTtBQUFBLE1BQy9IO0FBRUEsWUFBTSxPQUFPLG1CQUFtQixLQUFLLE9BQU8sU0FBUyxRQUFRLEdBQUcsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLElBQ2pGLFNBQVMsT0FBTztBQUNmLFlBQU0sS0FBSywwQkFBMEIsS0FBSztBQUFBLElBQzNDO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxPQUFPLFVBQWUsTUFBeUM7QUFDcEUsUUFBSTtBQUNILFlBQU0sU0FBUyxNQUFNLEtBQUssbUJBQW1CLEtBQUssT0FBTyxRQUFRLFFBQVEsQ0FBQztBQUMxRSxVQUFJLENBQUMsUUFBUTtBQUNaLGNBQU0sS0FBSyw4QkFBOEIsVUFBVSxvQ0FBb0MsNEJBQTRCLFlBQVk7QUFBQSxNQUNoSTtBQUVBLGFBQU8sT0FBTyxZQUFZLEtBQUssT0FBTyxTQUFTLFFBQVEsR0FBRyxFQUFFLFdBQVcsS0FBSyxVQUFVLENBQUM7QUFBQSxJQUN4RixTQUFTLE9BQU87QUFDZixZQUFNLEtBQUssMEJBQTBCLEtBQUs7QUFBQSxJQUMzQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sT0FBTyxNQUFXLElBQVMsTUFBNEM7QUFDNUUsUUFBSTtBQUNILFVBQUksS0FBSyxPQUFPLFFBQVEsTUFBTSxFQUFFLEdBQUc7QUFDbEM7QUFBQSxNQUNEO0FBR0EsWUFBTSxhQUFhLE1BQU0sS0FBSyxjQUFjLElBQUk7QUFDaEQsVUFBSSxZQUFZO0FBQ2YsY0FBTSxPQUFPLE1BQU0sV0FBVyxRQUFRO0FBQ3RDLGNBQU0sV0FBVyxJQUFJLFdBQVcsTUFBTSxLQUFLLFlBQVksQ0FBQztBQUV4RCxjQUFNLEtBQUssVUFBVSxJQUFJLFVBQVUsRUFBRSxRQUFRLE1BQU0sV0FBVyxLQUFLLFdBQVcsUUFBUSxPQUFPLFFBQVEsTUFBTSxDQUFDO0FBQzVHLGNBQU0sS0FBSyxPQUFPLE1BQU0sRUFBRSxXQUFXLE9BQU8sVUFBVSxPQUFPLFFBQVEsTUFBTSxDQUFDO0FBQUEsTUFDN0UsT0FHSztBQUNKLGNBQU0sS0FBSyw4QkFBOEIsTUFBTSxTQUFTLHlCQUF5QixxQ0FBcUMsR0FBRyw0QkFBNEIsV0FBVztBQUFBLE1BQ2pLO0FBQUEsSUFDRCxTQUFTLE9BQU87QUFDZixZQUFNLEtBQUssMEJBQTBCLEtBQUs7QUFBQSxJQUMzQztBQUFBLEVBQ0Q7QUFBQSxFQVNBLE1BQU0sVUFBZSxNQUFrQztBQUN0RCxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFFeEMsU0FBSyxRQUFRLFVBQVUsTUFBTSxXQUFXLEVBQUUsTUFBTSxXQUFTLEtBQUssV0FBVyxNQUFNLGdEQUFnRCxLQUFLLEtBQUssUUFBUSxHQUFHLENBQUM7QUFFckosV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsUUFBUSxVQUFlLE1BQXFCLGFBQTZDO0FBQ3RHLFFBQUksQ0FBQyxzQkFBc0IsVUFBVSxVQUFVLEdBQUc7QUFDakQ7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLE1BQU0sS0FBSyxVQUFVLFFBQVE7QUFDNUMsUUFBSSxDQUFDLFVBQVUsWUFBWSxZQUFZO0FBQ3RDO0FBQUEsSUFDRDtBQUdBLFVBQU0sV0FBVyxJQUFLLFdBQW1CLG1CQUFtQixDQUFDLFlBQXdDO0FBQ3BHLFVBQUksWUFBWSxZQUFZO0FBQzNCO0FBQUEsTUFDRDtBQUVBLFlBQU0sU0FBd0IsQ0FBQztBQUMvQixpQkFBVyxVQUFVLFNBQVM7QUFDN0IsWUFBSSxLQUFLLFdBQVcsU0FBUyxNQUFNLFNBQVMsT0FBTztBQUNsRCxlQUFLLFdBQVcsTUFBTSwwQ0FBMEMsT0FBTyxJQUFJLEtBQUssU0FBUyxVQUFVLEdBQUcsT0FBTyxzQkFBc0IsQ0FBQyxFQUFFO0FBQUEsUUFDdkk7QUFFQSxnQkFBUSxPQUFPLE1BQU07QUFBQSxVQUNwQixLQUFLO0FBQ0osbUJBQU8sS0FBSyxFQUFFLFVBQVUsU0FBUyxVQUFVLEdBQUcsT0FBTyxzQkFBc0IsR0FBRyxNQUFNLGVBQWUsTUFBTSxDQUFDO0FBQzFHO0FBQUEsVUFDRCxLQUFLO0FBQ0osbUJBQU8sS0FBSyxFQUFFLFVBQVUsU0FBUyxVQUFVLEdBQUcsT0FBTyxzQkFBc0IsR0FBRyxNQUFNLGVBQWUsUUFBUSxDQUFDO0FBQzVHO0FBQUEsVUFDRCxLQUFLO0FBQ0osbUJBQU8sS0FBSyxFQUFFLFVBQVUsU0FBUyxVQUFVLEdBQUcsT0FBTyxzQkFBc0IsR0FBRyxNQUFNLGVBQWUsUUFBUSxDQUFDO0FBQzVHO0FBQUEsVUFDRCxLQUFLO0FBQ0osaUJBQUssV0FBVyxNQUFNLHNFQUFzRSxRQUFRLEdBQUc7QUFDdkcsd0JBQVksUUFBUTtBQUFBLFFBQ3RCO0FBQUEsTUFDRDtBQUVBLFVBQUksT0FBTyxRQUFRO0FBQ2xCLGFBQUssd0JBQXdCLEtBQUssTUFBTTtBQUFBLE1BQ3pDO0FBQUEsSUFDRCxDQUFDO0FBRUQsUUFBSTtBQUNILFlBQU0sU0FBUyxRQUFRLFFBQVEsS0FBSyxZQUFZLEVBQUUsV0FBVyxLQUFLLElBQUksTUFBUztBQUFBLElBQ2hGLFVBQUU7QUFDRCxVQUFJLFlBQVksWUFBWTtBQUMzQixpQkFBUyxXQUFXO0FBQUEsTUFDckIsT0FBTztBQUNOLG9CQUFZLElBQUksYUFBYSxNQUFNLFNBQVMsV0FBVyxDQUFDLENBQUM7QUFBQSxNQUMxRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFTQSxtQkFBbUIsUUFBNEM7QUFDOUQsV0FBTyxLQUFLLGVBQWUsUUFBUSxLQUFLLE1BQU07QUFBQSxFQUMvQztBQUFBLEVBRUEsd0JBQXdCLFFBQWlEO0FBQ3hFLFdBQU8sS0FBSyxlQUFlLFFBQVEsS0FBSyxZQUFZO0FBQUEsRUFDckQ7QUFBQSxFQUVBLElBQUksY0FBbUQ7QUFDdEQsV0FBTyxLQUFLLGFBQWEsT0FBTztBQUFBLEVBQ2pDO0FBQUEsRUFFQSxNQUFjLGVBQWUsUUFBMEIsS0FBa0Q7QUFDeEcsUUFBSSxXQUFXLElBQUksT0FBTyxJQUFJO0FBRzlCLFFBQUksSUFBSSxJQUFJLFFBQVEsS0FBSyxDQUFDLE1BQU0sSUFBSSxJQUFJLFFBQVEsR0FBRyxZQUFZLE1BQU0sR0FBRztBQUN2RSxZQUFNLFVBQVUsUUFBUSxPQUFPLElBQUk7QUFDbkMsWUFBTSxXQUFXLFNBQVMsT0FBTyxNQUFNLE9BQU87QUFFOUMsVUFBSSxrQkFBa0I7QUFDdEIsU0FBRztBQUNGLG1CQUFXLElBQUksUUFBUSxJQUFJLGlCQUFpQixHQUFHLE9BQU87QUFBQSxNQUN2RCxTQUFTLElBQUksSUFBSSxRQUFRLEtBQUssQ0FBQyxNQUFNLElBQUksSUFBSSxRQUFRLEdBQUcsWUFBWSxNQUFNO0FBQUEsSUFDM0U7QUFFQSxRQUFJLElBQUksVUFBVSxNQUFNO0FBR3hCLFFBQUk7QUFDSCxZQUFNLEtBQUssV0FBVyxpQkFBaUIsS0FBSyxPQUFPLGFBQWEsaUJBQWUsWUFBWSxJQUFJLFFBQVEsUUFBUSxDQUFDO0FBQUEsSUFDakgsU0FBUyxPQUFPO0FBQ2YsV0FBSyxXQUFXLE1BQU0sS0FBSztBQUFBLElBQzVCO0FBRUEsV0FBTyxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsTUFBTSxNQUFNLFNBQVMsQ0FBQztBQUFBLEVBQ3pEO0FBQUEsRUFFQSxNQUFNLFVBQVUsVUFBc0Q7QUFHckUsUUFBSSxTQUFTLE1BQU0sS0FBSyxZQUFZLFFBQVE7QUFHNUMsUUFBSSxDQUFDLFFBQVE7QUFDWixZQUFNLFNBQVMsTUFBTSxLQUFLLG1CQUFtQixLQUFLLE9BQU8sUUFBUSxRQUFRLENBQUM7QUFDMUUsVUFBSSxRQUFRO0FBQ1gsY0FBTSxPQUFPLE9BQU8sU0FBUyxRQUFRO0FBQ3JDLFlBQUk7QUFDSCxtQkFBUyxNQUFNLE9BQU8sY0FBYyxJQUFJO0FBQUEsUUFDekMsU0FBUyxPQUFPO0FBQ2YsY0FBSTtBQUNILHFCQUFTLE1BQU0sT0FBTyxtQkFBbUIsSUFBSTtBQUFBLFVBQzlDLFNBQVNDLFFBQU87QUFBQSxVQUVoQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLGNBQWMsVUFBMEQ7QUFDckYsVUFBTSxTQUFTLE1BQU0sS0FBSyxZQUFZLFFBQVE7QUFDOUMsUUFBSSxrQkFBa0Isc0JBQXNCO0FBQzNDLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxTQUFTLE1BQU0sS0FBSyxtQkFBbUIsS0FBSyxPQUFPLFFBQVEsUUFBUSxDQUFDO0FBRTFFLFFBQUk7QUFDSCxhQUFPLE1BQU0sUUFBUSxjQUFjLE9BQU8sU0FBUyxRQUFRLENBQUM7QUFBQSxJQUM3RCxTQUFTLE9BQU87QUFDZixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsbUJBQW1CLFVBQStEO0FBQy9GLFVBQU0sU0FBUyxNQUFNLEtBQUssWUFBWSxRQUFRO0FBQzlDLFFBQUksa0JBQWtCLDJCQUEyQjtBQUNoRCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sWUFBWSxLQUFLLE9BQU8sUUFBUSxRQUFRO0FBQzlDLFFBQUksS0FBSyxPQUFPLFFBQVEsV0FBVyxRQUFRLEdBQUc7QUFDN0MsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFNBQVMsTUFBTSxLQUFLLG1CQUFtQixTQUFTO0FBRXRELFFBQUk7QUFDSCxhQUFPLE1BQU0sUUFBUSxtQkFBbUIsT0FBTyxTQUFTLFFBQVEsQ0FBQztBQUFBLElBQ2xFLFNBQVMsT0FBTztBQUNmLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxZQUFZLFVBQXNEO0FBSS9FLFFBQUksS0FBSyxPQUFPLFFBQVEsUUFBUSxFQUFFLFNBQVMsS0FBSztBQUMvQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sV0FBVyxTQUFTLEtBQUssUUFBUSxPQUFPLEVBQUU7QUFHaEQsVUFBTSxpQkFBaUIsS0FBSyxPQUFPLElBQUksUUFBUSxLQUFLLEtBQUssYUFBYSxJQUFJLFFBQVE7QUFDbEYsUUFBSSxnQkFBZ0I7QUFDbkIsYUFBTztBQUFBLElBQ1I7QUFHQSxVQUFNLGtCQUFrQixNQUFNLEtBQUssV0FBVyxpQkFBaUIsS0FBSyxPQUFPLFlBQVksV0FBUyxNQUFNLElBQUksUUFBUSxDQUFDO0FBQ25ILFFBQUksb0JBQW9CLG1CQUFtQixlQUFlLEdBQUc7QUFDNUQsVUFBSSxpQkFBaUIsTUFBTSxnQkFBZ0IsZ0JBQWdCLE1BQU07QUFDakUsVUFBSTtBQUNILFlBQUksQ0FBQyxnQkFBZ0I7QUFDcEIsMkJBQWlCLE1BQU0sZ0JBQWdCLGtCQUFrQixNQUFNO0FBQUEsUUFDaEU7QUFBQSxNQUNELFNBQVMsT0FBTztBQUNmLGFBQUssV0FBVyxNQUFNLEtBQUs7QUFBQSxNQUM1QjtBQUVBLFVBQUksZ0JBQWdCO0FBQ25CLFlBQUksb0JBQW9CLHVCQUF1QixlQUFlLEdBQUc7QUFDaEUsZUFBSyxPQUFPLElBQUksVUFBVSxlQUFlO0FBQUEsUUFDMUMsV0FBVyxvQkFBb0IsNEJBQTRCLGVBQWUsR0FBRztBQUM1RSxlQUFLLGFBQWEsSUFBSSxVQUFVLGVBQWU7QUFBQSxRQUNoRDtBQUVBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUdBLFVBQU0sS0FBSyw4QkFBOEIsVUFBVSxvQ0FBb0MsNEJBQTRCLFdBQVc7QUFBQSxFQUMvSDtBQUFBO0FBQUEsRUFJUSwwQkFBMEIsT0FBdUM7QUFDeEUsUUFBSSxpQkFBaUIseUJBQXlCO0FBQzdDLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxPQUFPLDRCQUE0QjtBQUN2QyxRQUFJLE1BQU0sU0FBUyxtQkFBbUI7QUFDckMsY0FBUSxJQUFJLE1BQU0sU0FBUyw2QkFBNkIsaUVBQWlFLENBQUM7QUFDMUgsYUFBTyw0QkFBNEI7QUFBQSxJQUNwQztBQUVBLFdBQU8sOEJBQThCLE9BQU8sSUFBSTtBQUFBLEVBQ2pEO0FBQUEsRUFFUSw4QkFBOEIsVUFBZSxLQUFhLE1BQTREO0FBQzdILFdBQU8sOEJBQThCLElBQUksTUFBTSxHQUFHLEdBQUcsS0FBSyxVQUFVLFNBQVMsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJO0FBQUEsRUFDN0Y7QUFDRDsiLAogICJuYW1lcyI6IFsiZGF0YSIsICJlcnJvciJdCn0K
