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
import { MainContext } from "./extHost.protocol.js";
import * as files from "../../../platform/files/common/files.js";
import { FileSystemError } from "./extHostTypes.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { IExtHostFileSystemInfo } from "./extHostFileSystemInfo.js";
import { toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceQueue } from "../../../base/common/async.js";
import { extUri, extUriIgnorePathCase } from "../../../base/common/resources.js";
import { Schemas } from "../../../base/common/network.js";
let ExtHostConsumerFileSystem = class {
  constructor(extHostRpc, fileSystemInfo) {
    this._fileSystemProvider = /* @__PURE__ */ new Map();
    this._writeQueue = new ResourceQueue();
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadFileSystem);
    const that = this;
    this.value = Object.freeze({
      async stat(uri) {
        try {
          let stat;
          const provider = that._fileSystemProvider.get(uri.scheme);
          if (provider) {
            await that._proxy.$ensureActivation(uri.scheme);
            stat = await provider.impl.stat(uri);
          } else {
            stat = await that._proxy.$stat(uri);
          }
          return {
            type: stat.type,
            ctime: stat.ctime,
            mtime: stat.mtime,
            size: stat.size,
            permissions: stat.permissions === files.FilePermission.Readonly ? 1 : void 0
          };
        } catch (err) {
          ExtHostConsumerFileSystem._handleError(err);
        }
      },
      async readDirectory(uri) {
        try {
          const provider = that._fileSystemProvider.get(uri.scheme);
          if (provider) {
            await that._proxy.$ensureActivation(uri.scheme);
            return (await provider.impl.readDirectory(uri)).slice();
          } else {
            return await that._proxy.$readdir(uri);
          }
        } catch (err) {
          return ExtHostConsumerFileSystem._handleError(err);
        }
      },
      async createDirectory(uri) {
        try {
          const provider = that._fileSystemProvider.get(uri.scheme);
          if (provider && !provider.isReadonly) {
            await that._proxy.$ensureActivation(uri.scheme);
            return await that.mkdirp(provider.impl, provider.extUri, uri);
          } else {
            return await that._proxy.$mkdir(uri);
          }
        } catch (err) {
          return ExtHostConsumerFileSystem._handleError(err);
        }
      },
      async readFile(uri) {
        try {
          const provider = that._fileSystemProvider.get(uri.scheme);
          if (provider) {
            await that._proxy.$ensureActivation(uri.scheme);
            return (await provider.impl.readFile(uri)).slice();
          } else {
            const buff = await that._proxy.$readFile(uri);
            return buff.buffer;
          }
        } catch (err) {
          return ExtHostConsumerFileSystem._handleError(err);
        }
      },
      async writeFile(uri, content) {
        try {
          const provider = that._fileSystemProvider.get(uri.scheme);
          if (provider && !provider.isReadonly) {
            await that._proxy.$ensureActivation(uri.scheme);
            await that.mkdirp(provider.impl, provider.extUri, provider.extUri.dirname(uri));
            return await that._writeQueue.queueFor(uri, () => Promise.resolve(provider.impl.writeFile(uri, content, { create: true, overwrite: true })));
          } else {
            return await that._proxy.$writeFile(uri, VSBuffer.wrap(content));
          }
        } catch (err) {
          return ExtHostConsumerFileSystem._handleError(err);
        }
      },
      async delete(uri, options) {
        try {
          const provider = that._fileSystemProvider.get(uri.scheme);
          if (provider && !provider.isReadonly && !options?.useTrash) {
            await that._proxy.$ensureActivation(uri.scheme);
            return await provider.impl.delete(uri, { recursive: false, ...options });
          } else {
            return await that._proxy.$delete(uri, { recursive: false, useTrash: false, atomic: false, ...options });
          }
        } catch (err) {
          return ExtHostConsumerFileSystem._handleError(err);
        }
      },
      async rename(oldUri, newUri, options) {
        try {
          return await that._proxy.$rename(oldUri, newUri, { ...{ overwrite: false }, ...options });
        } catch (err) {
          return ExtHostConsumerFileSystem._handleError(err);
        }
      },
      async copy(source, destination, options) {
        try {
          return await that._proxy.$copy(source, destination, { ...{ overwrite: false }, ...options });
        } catch (err) {
          return ExtHostConsumerFileSystem._handleError(err);
        }
      },
      isWritableFileSystem(scheme) {
        const capabilities = fileSystemInfo.getCapabilities(scheme);
        if (typeof capabilities === "number") {
          return !(capabilities & files.FileSystemProviderCapabilities.Readonly);
        }
        return void 0;
      }
    });
  }
  async mkdirp(provider, providerExtUri, directory) {
    const directoriesToCreate = [];
    while (!providerExtUri.isEqual(directory, providerExtUri.dirname(directory))) {
      try {
        const stat = await provider.stat(directory);
        if ((stat.type & files.FileType.Directory) === 0) {
          throw FileSystemError.FileExists(`Unable to create folder '${directory.scheme === Schemas.file ? directory.fsPath : directory.toString(true)}' that already exists but is not a directory`);
        }
        break;
      } catch (error) {
        if (files.toFileSystemProviderErrorCode(error) !== files.FileSystemProviderErrorCode.FileNotFound) {
          throw error;
        }
        directoriesToCreate.push(providerExtUri.basename(directory));
        directory = providerExtUri.dirname(directory);
      }
    }
    for (let i = directoriesToCreate.length - 1; i >= 0; i--) {
      directory = providerExtUri.joinPath(directory, directoriesToCreate[i]);
      try {
        await provider.createDirectory(directory);
      } catch (error) {
        if (files.toFileSystemProviderErrorCode(error) !== files.FileSystemProviderErrorCode.FileExists) {
          throw error;
        }
      }
    }
  }
  static _handleError(err) {
    if (err instanceof FileSystemError) {
      throw err;
    }
    if (err instanceof files.FileSystemProviderError) {
      switch (err.code) {
        case files.FileSystemProviderErrorCode.FileExists:
          throw FileSystemError.FileExists(err.message);
        case files.FileSystemProviderErrorCode.FileNotFound:
          throw FileSystemError.FileNotFound(err.message);
        case files.FileSystemProviderErrorCode.FileNotADirectory:
          throw FileSystemError.FileNotADirectory(err.message);
        case files.FileSystemProviderErrorCode.FileIsADirectory:
          throw FileSystemError.FileIsADirectory(err.message);
        case files.FileSystemProviderErrorCode.NoPermissions:
          throw FileSystemError.NoPermissions(err.message);
        case files.FileSystemProviderErrorCode.Unavailable:
          throw FileSystemError.Unavailable(err.message);
        default:
          throw new FileSystemError(err.message, err.name);
      }
    }
    if (!(err instanceof Error)) {
      throw new FileSystemError(String(err));
    }
    if (err.name === "ENOPRO" || err.message.includes("ENOPRO")) {
      throw FileSystemError.Unavailable(err.message);
    }
    switch (err.name) {
      case files.FileSystemProviderErrorCode.FileExists:
        throw FileSystemError.FileExists(err.message);
      case files.FileSystemProviderErrorCode.FileNotFound:
        throw FileSystemError.FileNotFound(err.message);
      case files.FileSystemProviderErrorCode.FileNotADirectory:
        throw FileSystemError.FileNotADirectory(err.message);
      case files.FileSystemProviderErrorCode.FileIsADirectory:
        throw FileSystemError.FileIsADirectory(err.message);
      case files.FileSystemProviderErrorCode.NoPermissions:
        throw FileSystemError.NoPermissions(err.message);
      case files.FileSystemProviderErrorCode.Unavailable:
        throw FileSystemError.Unavailable(err.message);
      default:
        throw new FileSystemError(err.message, err.name);
    }
  }
  // ---
  addFileSystemProvider(scheme, provider, options) {
    this._fileSystemProvider.set(scheme, { impl: provider, extUri: options?.isCaseSensitive ? extUri : extUriIgnorePathCase, isReadonly: !!options?.isReadonly });
    return toDisposable(() => this._fileSystemProvider.delete(scheme));
  }
  getFileSystemProviderExtUri(scheme) {
    return this._fileSystemProvider.get(scheme)?.extUri ?? extUri;
  }
};
ExtHostConsumerFileSystem = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostFileSystemInfo)
], ExtHostConsumerFileSystem);
const IExtHostConsumerFileSystem = createDecorator("IExtHostConsumerFileSystem");
export {
  ExtHostConsumerFileSystem,
  IExtHostConsumerFileSystem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RGaWxlU3lzdGVtQ29uc3VtZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBNYWluQ29udGV4dCwgTWFpblRocmVhZEZpbGVTeXN0ZW1TaGFwZSB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0ICogYXMgZmlsZXMgZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTeXN0ZW1FcnJvciB9IGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RScGNTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0UnBjU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvIH0gZnJvbSAnLi9leHRIb3N0RmlsZVN5c3RlbUluZm8uanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVF1ZXVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSUV4dFVyaSwgZXh0VXJpLCBleHRVcmlJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgdmFsdWU6IHZzY29kZS5GaWxlU3lzdGVtO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkRmlsZVN5c3RlbVNoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maWxlU3lzdGVtUHJvdmlkZXIgPSBuZXcgTWFwPHN0cmluZywgeyBpbXBsOiB2c2NvZGUuRmlsZVN5c3RlbVByb3ZpZGVyOyBleHRVcmk6IElFeHRVcmk7IGlzUmVhZG9ubHk6IGJvb2xlYW4gfT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93cml0ZVF1ZXVlID0gbmV3IFJlc291cmNlUXVldWUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dEhvc3RScGNTZXJ2aWNlIGV4dEhvc3RScGM6IElFeHRIb3N0UnBjU2VydmljZSxcblx0XHRASUV4dEhvc3RGaWxlU3lzdGVtSW5mbyBmaWxlU3lzdGVtSW5mbzogSUV4dEhvc3RGaWxlU3lzdGVtSW5mbyxcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0UnBjLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRGaWxlU3lzdGVtKTtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdHRoaXMudmFsdWUgPSBPYmplY3QuZnJlZXplKHtcblx0XHRcdGFzeW5jIHN0YXQodXJpOiB2c2NvZGUuVXJpKTogUHJvbWlzZTx2c2NvZGUuRmlsZVN0YXQ+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRsZXQgc3RhdDtcblxuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhhdC5fZmlsZVN5c3RlbVByb3ZpZGVyLmdldCh1cmkuc2NoZW1lKTtcblx0XHRcdFx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdFx0XHRcdC8vIHVzZSBzaG9ydGN1dFxuXHRcdFx0XHRcdFx0YXdhaXQgdGhhdC5fcHJveHkuJGVuc3VyZUFjdGl2YXRpb24odXJpLnNjaGVtZSk7XG5cdFx0XHRcdFx0XHRzdGF0ID0gYXdhaXQgcHJvdmlkZXIuaW1wbC5zdGF0KHVyaSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHN0YXQgPSBhd2FpdCB0aGF0Ll9wcm94eS4kc3RhdCh1cmkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBzdGF0LnR5cGUsXG5cdFx0XHRcdFx0XHRjdGltZTogc3RhdC5jdGltZSxcblx0XHRcdFx0XHRcdG10aW1lOiBzdGF0Lm10aW1lLFxuXHRcdFx0XHRcdFx0c2l6ZTogc3RhdC5zaXplLFxuXHRcdFx0XHRcdFx0cGVybWlzc2lvbnM6IHN0YXQucGVybWlzc2lvbnMgPT09IGZpbGVzLkZpbGVQZXJtaXNzaW9uLlJlYWRvbmx5ID8gMSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdEV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0uX2hhbmRsZUVycm9yKGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRhc3luYyByZWFkRGlyZWN0b3J5KHVyaTogdnNjb2RlLlVyaSk6IFByb21pc2U8W3N0cmluZywgdnNjb2RlLkZpbGVUeXBlXVtdPiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGF0Ll9maWxlU3lzdGVtUHJvdmlkZXIuZ2V0KHVyaS5zY2hlbWUpO1xuXHRcdFx0XHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0XHRcdFx0Ly8gdXNlIHNob3J0Y3V0XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGF0Ll9wcm94eS4kZW5zdXJlQWN0aXZhdGlvbih1cmkuc2NoZW1lKTtcblx0XHRcdFx0XHRcdHJldHVybiAoYXdhaXQgcHJvdmlkZXIuaW1wbC5yZWFkRGlyZWN0b3J5KHVyaSkpLnNsaWNlKCk7IC8vIHNhZmUtY29weVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhhdC5fcHJveHkuJHJlYWRkaXIodXJpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHJldHVybiBFeHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtLl9oYW5kbGVFcnJvcihlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgY3JlYXRlRGlyZWN0b3J5KHVyaTogdnNjb2RlLlVyaSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhhdC5fZmlsZVN5c3RlbVByb3ZpZGVyLmdldCh1cmkuc2NoZW1lKTtcblx0XHRcdFx0XHRpZiAocHJvdmlkZXIgJiYgIXByb3ZpZGVyLmlzUmVhZG9ubHkpIHtcblx0XHRcdFx0XHRcdC8vIHVzZSBzaG9ydGN1dFxuXHRcdFx0XHRcdFx0YXdhaXQgdGhhdC5fcHJveHkuJGVuc3VyZUFjdGl2YXRpb24odXJpLnNjaGVtZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhhdC5ta2RpcnAocHJvdmlkZXIuaW1wbCwgcHJvdmlkZXIuZXh0VXJpLCB1cmkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhhdC5fcHJveHkuJG1rZGlyKHVyaSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRyZXR1cm4gRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbS5faGFuZGxlRXJyb3IoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFzeW5jIHJlYWRGaWxlKHVyaTogdnNjb2RlLlVyaSk6IFByb21pc2U8VWludDhBcnJheT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhhdC5fZmlsZVN5c3RlbVByb3ZpZGVyLmdldCh1cmkuc2NoZW1lKTtcblx0XHRcdFx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdFx0XHRcdC8vIHVzZSBzaG9ydGN1dFxuXHRcdFx0XHRcdFx0YXdhaXQgdGhhdC5fcHJveHkuJGVuc3VyZUFjdGl2YXRpb24odXJpLnNjaGVtZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gKGF3YWl0IHByb3ZpZGVyLmltcGwucmVhZEZpbGUodXJpKSkuc2xpY2UoKTsgLy8gc2FmZS1jb3B5XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IGJ1ZmYgPSBhd2FpdCB0aGF0Ll9wcm94eS4kcmVhZEZpbGUodXJpKTtcblx0XHRcdFx0XHRcdHJldHVybiBidWZmLmJ1ZmZlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHJldHVybiBFeHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtLl9oYW5kbGVFcnJvcihlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgd3JpdGVGaWxlKHVyaTogdnNjb2RlLlVyaSwgY29udGVudDogVWludDhBcnJheSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhhdC5fZmlsZVN5c3RlbVByb3ZpZGVyLmdldCh1cmkuc2NoZW1lKTtcblx0XHRcdFx0XHRpZiAocHJvdmlkZXIgJiYgIXByb3ZpZGVyLmlzUmVhZG9ubHkpIHtcblx0XHRcdFx0XHRcdC8vIHVzZSBzaG9ydGN1dFxuXHRcdFx0XHRcdFx0YXdhaXQgdGhhdC5fcHJveHkuJGVuc3VyZUFjdGl2YXRpb24odXJpLnNjaGVtZSk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGF0Lm1rZGlycChwcm92aWRlci5pbXBsLCBwcm92aWRlci5leHRVcmksIHByb3ZpZGVyLmV4dFVyaS5kaXJuYW1lKHVyaSkpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoYXQuX3dyaXRlUXVldWUucXVldWVGb3IodXJpLCAoKSA9PiBQcm9taXNlLnJlc29sdmUocHJvdmlkZXIuaW1wbC53cml0ZUZpbGUodXJpLCBjb250ZW50LCB7IGNyZWF0ZTogdHJ1ZSwgb3ZlcndyaXRlOiB0cnVlIH0pKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGF0Ll9wcm94eS4kd3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIud3JhcChjb250ZW50KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRyZXR1cm4gRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbS5faGFuZGxlRXJyb3IoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFzeW5jIGRlbGV0ZSh1cmk6IHZzY29kZS5VcmksIG9wdGlvbnM/OiB7IHJlY3Vyc2l2ZT86IGJvb2xlYW47IHVzZVRyYXNoPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGF0Ll9maWxlU3lzdGVtUHJvdmlkZXIuZ2V0KHVyaS5zY2hlbWUpO1xuXHRcdFx0XHRcdGlmIChwcm92aWRlciAmJiAhcHJvdmlkZXIuaXNSZWFkb25seSAmJiAhb3B0aW9ucz8udXNlVHJhc2ggLyogbm8gc2hvcnRjdXQ6IHVzZSB0cmFzaCAqLykge1xuXHRcdFx0XHRcdFx0Ly8gdXNlIHNob3J0Y3V0XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGF0Ll9wcm94eS4kZW5zdXJlQWN0aXZhdGlvbih1cmkuc2NoZW1lKTtcblx0XHRcdFx0XHRcdHJldHVybiBhd2FpdCBwcm92aWRlci5pbXBsLmRlbGV0ZSh1cmksIHsgcmVjdXJzaXZlOiBmYWxzZSwgLi4ub3B0aW9ucyB9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoYXQuX3Byb3h5LiRkZWxldGUodXJpLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIHVzZVRyYXNoOiBmYWxzZSwgYXRvbWljOiBmYWxzZSwgLi4ub3B0aW9ucyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHJldHVybiBFeHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtLl9oYW5kbGVFcnJvcihlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgcmVuYW1lKG9sZFVyaTogdnNjb2RlLlVyaSwgbmV3VXJpOiB2c2NvZGUuVXJpLCBvcHRpb25zPzogeyBvdmVyd3JpdGU/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHQvLyBubyBzaG9ydGN1dDogcG90ZW50aWFsbHkgaW52b2x2ZXMgZGlmZmVyZW50IHNjaGVtZXMsIGRvZXMgbWtkaXJwXG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoYXQuX3Byb3h5LiRyZW5hbWUob2xkVXJpLCBuZXdVcmksIHsgLi4ueyBvdmVyd3JpdGU6IGZhbHNlIH0sIC4uLm9wdGlvbnMgfSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHJldHVybiBFeHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtLl9oYW5kbGVFcnJvcihlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgY29weShzb3VyY2U6IHZzY29kZS5VcmksIGRlc3RpbmF0aW9uOiB2c2NvZGUuVXJpLCBvcHRpb25zPzogeyBvdmVyd3JpdGU/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHQvLyBubyBzaG9ydGN1dDogcG90ZW50aWFsbHkgaW52b2x2ZXMgZGlmZmVyZW50IHNjaGVtZXMsIGRvZXMgbWtkaXJwXG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoYXQuX3Byb3h5LiRjb3B5KHNvdXJjZSwgZGVzdGluYXRpb24sIHsgLi4ueyBvdmVyd3JpdGU6IGZhbHNlIH0sIC4uLm9wdGlvbnMgfSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHJldHVybiBFeHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtLl9oYW5kbGVFcnJvcihlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0aXNXcml0YWJsZUZpbGVTeXN0ZW0oc2NoZW1lOiBzdHJpbmcpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gZmlsZVN5c3RlbUluZm8uZ2V0Q2FwYWJpbGl0aWVzKHNjaGVtZSk7XG5cdFx0XHRcdGlmICh0eXBlb2YgY2FwYWJpbGl0aWVzID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHJldHVybiAhKGNhcGFiaWxpdGllcyAmIGZpbGVzLkZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5SZWFkb25seSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbWtkaXJwKHByb3ZpZGVyOiB2c2NvZGUuRmlsZVN5c3RlbVByb3ZpZGVyLCBwcm92aWRlckV4dFVyaTogSUV4dFVyaSwgZGlyZWN0b3J5OiB2c2NvZGUuVXJpKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGlyZWN0b3JpZXNUb0NyZWF0ZTogc3RyaW5nW10gPSBbXTtcblxuXHRcdHdoaWxlICghcHJvdmlkZXJFeHRVcmkuaXNFcXVhbChkaXJlY3RvcnksIHByb3ZpZGVyRXh0VXJpLmRpcm5hbWUoZGlyZWN0b3J5KSkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBwcm92aWRlci5zdGF0KGRpcmVjdG9yeSk7XG5cdFx0XHRcdGlmICgoc3RhdC50eXBlICYgZmlsZXMuRmlsZVR5cGUuRGlyZWN0b3J5KSA9PT0gMCkge1xuXHRcdFx0XHRcdHRocm93IEZpbGVTeXN0ZW1FcnJvci5GaWxlRXhpc3RzKGBVbmFibGUgdG8gY3JlYXRlIGZvbGRlciAnJHtkaXJlY3Rvcnkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgPyBkaXJlY3RvcnkuZnNQYXRoIDogZGlyZWN0b3J5LnRvU3RyaW5nKHRydWUpfScgdGhhdCBhbHJlYWR5IGV4aXN0cyBidXQgaXMgbm90IGEgZGlyZWN0b3J5YCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRicmVhazsgLy8gd2UgaGF2ZSBoaXQgYSBkaXJlY3RvcnkgdGhhdCBleGlzdHMgLT4gZ29vZFxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKGZpbGVzLnRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKGVycm9yKSAhPT0gZmlsZXMuRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCkge1xuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gZnVydGhlciBnbyB1cCBhbmQgcmVtZW1iZXIgdG8gY3JlYXRlIHRoaXMgZGlyZWN0b3J5XG5cdFx0XHRcdGRpcmVjdG9yaWVzVG9DcmVhdGUucHVzaChwcm92aWRlckV4dFVyaS5iYXNlbmFtZShkaXJlY3RvcnkpKTtcblx0XHRcdFx0ZGlyZWN0b3J5ID0gcHJvdmlkZXJFeHRVcmkuZGlybmFtZShkaXJlY3RvcnkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSBkaXJlY3Rvcmllc1RvQ3JlYXRlLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRkaXJlY3RvcnkgPSBwcm92aWRlckV4dFVyaS5qb2luUGF0aChkaXJlY3RvcnksIGRpcmVjdG9yaWVzVG9DcmVhdGVbaV0pO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBwcm92aWRlci5jcmVhdGVEaXJlY3RvcnkoZGlyZWN0b3J5KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmIChmaWxlcy50b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZShlcnJvcikgIT09IGZpbGVzLkZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlRXhpc3RzKSB7XG5cdFx0XHRcdFx0Ly8gRm9yIG1rZGlycCgpIHdlIHRvbGVyYXRlIHRoYXQgdGhlIG1rZGlyKCkgY2FsbCBmYWlsc1xuXHRcdFx0XHRcdC8vIGluIGNhc2UgdGhlIGZvbGRlciBhbHJlYWR5IGV4aXN0cy4gVGhpcyBmb2xsb3dzIG5vZGUuanNcblx0XHRcdFx0XHQvLyBvd24gaW1wbGVtZW50YXRpb24gb2YgZnMubWtkaXIoeyByZWN1cnNpdmU6IHRydWUgfSkgYW5kXG5cdFx0XHRcdFx0Ly8gcmVkdWNlcyB0aGUgY2hhbmNlcyBvZiByYWNlIGNvbmRpdGlvbnMgbGVhZGluZyB0byBlcnJvcnNcblx0XHRcdFx0XHQvLyBpZiBtdWx0aXBsZSBjYWxscyB0cnkgdG8gY3JlYXRlIHRoZSBzYW1lIGZvbGRlcnNcblx0XHRcdFx0XHQvLyBBcyBzdWNoLCB3ZSBvbmx5IHRocm93IGFuIGVycm9yIGhlcmUgaWYgaXQgaXMgb3RoZXIgdGhhblxuXHRcdFx0XHRcdC8vIHRoZSBmYWN0IHRoYXQgdGhlIGZpbGUgYWxyZWFkeSBleGlzdHMuXG5cdFx0XHRcdFx0Ly8gKHNlZSBhbHNvIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy84OTgzNClcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9oYW5kbGVFcnJvcihlcnI6IGFueSk6IG5ldmVyIHtcblx0XHQvLyBkZXNpcmVkIGVycm9yIHR5cGVcblx0XHRpZiAoZXJyIGluc3RhbmNlb2YgRmlsZVN5c3RlbUVycm9yKSB7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXG5cdFx0Ly8gZmlsZSBzeXN0ZW0gcHJvdmlkZXIgZXJyb3Jcblx0XHRpZiAoZXJyIGluc3RhbmNlb2YgZmlsZXMuRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IpIHtcblx0XHRcdHN3aXRjaCAoZXJyLmNvZGUpIHtcblx0XHRcdFx0Y2FzZSBmaWxlcy5GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUV4aXN0czogdGhyb3cgRmlsZVN5c3RlbUVycm9yLkZpbGVFeGlzdHMoZXJyLm1lc3NhZ2UpO1xuXHRcdFx0XHRjYXNlIGZpbGVzLkZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQ6IHRocm93IEZpbGVTeXN0ZW1FcnJvci5GaWxlTm90Rm91bmQoZXJyLm1lc3NhZ2UpO1xuXHRcdFx0XHRjYXNlIGZpbGVzLkZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90QURpcmVjdG9yeTogdGhyb3cgRmlsZVN5c3RlbUVycm9yLkZpbGVOb3RBRGlyZWN0b3J5KGVyci5tZXNzYWdlKTtcblx0XHRcdFx0Y2FzZSBmaWxlcy5GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUlzQURpcmVjdG9yeTogdGhyb3cgRmlsZVN5c3RlbUVycm9yLkZpbGVJc0FEaXJlY3RvcnkoZXJyLm1lc3NhZ2UpO1xuXHRcdFx0XHRjYXNlIGZpbGVzLkZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zOiB0aHJvdyBGaWxlU3lzdGVtRXJyb3IuTm9QZXJtaXNzaW9ucyhlcnIubWVzc2FnZSk7XG5cdFx0XHRcdGNhc2UgZmlsZXMuRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVuYXZhaWxhYmxlOiB0aHJvdyBGaWxlU3lzdGVtRXJyb3IuVW5hdmFpbGFibGUoZXJyLm1lc3NhZ2UpO1xuXG5cdFx0XHRcdGRlZmF1bHQ6IHRocm93IG5ldyBGaWxlU3lzdGVtRXJyb3IoZXJyLm1lc3NhZ2UsIGVyci5uYW1lIGFzIGZpbGVzLkZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gZ2VuZXJpYyBlcnJvclxuXHRcdGlmICghKGVyciBpbnN0YW5jZW9mIEVycm9yKSkge1xuXHRcdFx0dGhyb3cgbmV3IEZpbGVTeXN0ZW1FcnJvcihTdHJpbmcoZXJyKSk7XG5cdFx0fVxuXG5cdFx0Ly8gbm8gcHJvdmlkZXIgKHVua25vd24gc2NoZW1lKSBlcnJvclxuXHRcdGlmIChlcnIubmFtZSA9PT0gJ0VOT1BSTycgfHwgZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ0VOT1BSTycpKSB7XG5cdFx0XHR0aHJvdyBGaWxlU3lzdGVtRXJyb3IuVW5hdmFpbGFibGUoZXJyLm1lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdC8vIGZpbGUgc3lzdGVtIGVycm9yXG5cdFx0c3dpdGNoIChlcnIubmFtZSkge1xuXHRcdFx0Y2FzZSBmaWxlcy5GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUV4aXN0czogdGhyb3cgRmlsZVN5c3RlbUVycm9yLkZpbGVFeGlzdHMoZXJyLm1lc3NhZ2UpO1xuXHRcdFx0Y2FzZSBmaWxlcy5GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEZvdW5kOiB0aHJvdyBGaWxlU3lzdGVtRXJyb3IuRmlsZU5vdEZvdW5kKGVyci5tZXNzYWdlKTtcblx0XHRcdGNhc2UgZmlsZXMuRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RBRGlyZWN0b3J5OiB0aHJvdyBGaWxlU3lzdGVtRXJyb3IuRmlsZU5vdEFEaXJlY3RvcnkoZXJyLm1lc3NhZ2UpO1xuXHRcdFx0Y2FzZSBmaWxlcy5GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUlzQURpcmVjdG9yeTogdGhyb3cgRmlsZVN5c3RlbUVycm9yLkZpbGVJc0FEaXJlY3RvcnkoZXJyLm1lc3NhZ2UpO1xuXHRcdFx0Y2FzZSBmaWxlcy5GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9uczogdGhyb3cgRmlsZVN5c3RlbUVycm9yLk5vUGVybWlzc2lvbnMoZXJyLm1lc3NhZ2UpO1xuXHRcdFx0Y2FzZSBmaWxlcy5GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5hdmFpbGFibGU6IHRocm93IEZpbGVTeXN0ZW1FcnJvci5VbmF2YWlsYWJsZShlcnIubWVzc2FnZSk7XG5cblx0XHRcdGRlZmF1bHQ6IHRocm93IG5ldyBGaWxlU3lzdGVtRXJyb3IoZXJyLm1lc3NhZ2UsIGVyci5uYW1lIGFzIGZpbGVzLkZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tXG5cblx0YWRkRmlsZVN5c3RlbVByb3ZpZGVyKHNjaGVtZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLkZpbGVTeXN0ZW1Qcm92aWRlciwgb3B0aW9ucz86IHsgaXNDYXNlU2Vuc2l0aXZlPzogYm9vbGVhbjsgaXNSZWFkb25seT86IGJvb2xlYW4gfCBJTWFya2Rvd25TdHJpbmcgfSk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9maWxlU3lzdGVtUHJvdmlkZXIuc2V0KHNjaGVtZSwgeyBpbXBsOiBwcm92aWRlciwgZXh0VXJpOiBvcHRpb25zPy5pc0Nhc2VTZW5zaXRpdmUgPyBleHRVcmkgOiBleHRVcmlJZ25vcmVQYXRoQ2FzZSwgaXNSZWFkb25seTogISFvcHRpb25zPy5pc1JlYWRvbmx5IH0pO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fZmlsZVN5c3RlbVByb3ZpZGVyLmRlbGV0ZShzY2hlbWUpKTtcblx0fVxuXG5cdGdldEZpbGVTeXN0ZW1Qcm92aWRlckV4dFVyaShzY2hlbWU6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9maWxlU3lzdGVtUHJvdmlkZXIuZ2V0KHNjaGVtZSk/LmV4dFVyaSA/PyBleHRVcmk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbSBleHRlbmRzIEV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0geyB9XG5leHBvcnQgY29uc3QgSUV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0gPSBjcmVhdGVEZWNvcmF0b3I8SUV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0+KCdJRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbScpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1CQUE4QztBQUV2RCxZQUFZLFdBQVc7QUFDdkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBc0Isb0JBQW9CO0FBQzFDLFNBQVMscUJBQXFCO0FBQzlCLFNBQWtCLFFBQVEsNEJBQTRCO0FBQ3RELFNBQVMsZUFBZTtBQUdqQixJQUFNLDRCQUFOLE1BQWdDO0FBQUEsRUFXdEMsWUFDcUIsWUFDSSxnQkFDdkI7QUFQRixTQUFpQixzQkFBc0Isb0JBQUksSUFBdUY7QUFFbEksU0FBaUIsY0FBYyxJQUFJLGNBQWM7QUFNaEQsU0FBSyxTQUFTLFdBQVcsU0FBUyxZQUFZLG9CQUFvQjtBQUNsRSxVQUFN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
