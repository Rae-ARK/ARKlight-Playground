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
import { Queue } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import { ResourceMap } from "../../../base/common/map.js";
import { URI } from "../../../base/common/uri.js";
import { isIExtensionIdentifier } from "./extensionManagement.js";
import { areSameExtensions } from "./extensionManagementUtil.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { isObject, isString, isUndefined } from "../../../base/common/types.js";
import { getErrorMessage } from "../../../base/common/errors.js";
var ExtensionsProfileScanningErrorCode = /* @__PURE__ */ ((ExtensionsProfileScanningErrorCode2) => {
  ExtensionsProfileScanningErrorCode2["ERROR_PROFILE_NOT_FOUND"] = "ERROR_PROFILE_NOT_FOUND";
  ExtensionsProfileScanningErrorCode2["ERROR_INVALID_CONTENT"] = "ERROR_INVALID_CONTENT";
  return ExtensionsProfileScanningErrorCode2;
})(ExtensionsProfileScanningErrorCode || {});
class ExtensionsProfileScanningError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
const IExtensionsProfileScannerService = createDecorator("IExtensionsProfileScannerService");
let AbstractExtensionsProfileScannerService = class extends Disposable {
  constructor(extensionsLocation, fileService, userDataProfilesService, uriIdentityService, logService) {
    super();
    this.extensionsLocation = extensionsLocation;
    this.fileService = fileService;
    this.userDataProfilesService = userDataProfilesService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this._onAddExtensions = this._register(new Emitter());
    this.onAddExtensions = this._onAddExtensions.event;
    this._onDidAddExtensions = this._register(new Emitter());
    this.onDidAddExtensions = this._onDidAddExtensions.event;
    this._onRemoveExtensions = this._register(new Emitter());
    this.onRemoveExtensions = this._onRemoveExtensions.event;
    this._onDidRemoveExtensions = this._register(new Emitter());
    this.onDidRemoveExtensions = this._onDidRemoveExtensions.event;
    this.resourcesAccessQueueMap = new ResourceMap();
  }
  scanProfileExtensions(profileLocation, options) {
    return this.withProfileExtensions(profileLocation, void 0, options);
  }
  async addExtensionsToProfile(extensions, profileLocation, keepExistingVersions) {
    const extensionsToRemove = [];
    const extensionsToAdd = [];
    try {
      await this.withProfileExtensions(profileLocation, (existingExtensions) => {
        const result = [];
        if (keepExistingVersions) {
          result.push(...existingExtensions);
        } else {
          for (const existing of existingExtensions) {
            if (extensions.some(([e]) => areSameExtensions(e.identifier, existing.identifier) && e.manifest.version !== existing.version)) {
              extensionsToRemove.push(existing);
            } else {
              result.push(existing);
            }
          }
        }
        for (const [extension, metadata] of extensions) {
          const index = result.findIndex((e) => areSameExtensions(e.identifier, extension.identifier) && e.version === extension.manifest.version);
          const extensionToAdd = { identifier: extension.identifier, version: extension.manifest.version, location: extension.location, metadata };
          if (index === -1) {
            extensionsToAdd.push(extensionToAdd);
            result.push(extensionToAdd);
          } else {
            result.splice(index, 1, extensionToAdd);
          }
        }
        if (extensionsToAdd.length) {
          this._onAddExtensions.fire({ extensions: extensionsToAdd, profileLocation });
        }
        if (extensionsToRemove.length) {
          this._onRemoveExtensions.fire({ extensions: extensionsToRemove, profileLocation });
        }
        return result;
      });
      if (extensionsToAdd.length) {
        this._onDidAddExtensions.fire({ extensions: extensionsToAdd, profileLocation });
      }
      if (extensionsToRemove.length) {
        this._onDidRemoveExtensions.fire({ extensions: extensionsToRemove, profileLocation });
      }
      return extensionsToAdd;
    } catch (error) {
      if (extensionsToAdd.length) {
        this._onDidAddExtensions.fire({ extensions: extensionsToAdd, error, profileLocation });
      }
      if (extensionsToRemove.length) {
        this._onDidRemoveExtensions.fire({ extensions: extensionsToRemove, error, profileLocation });
      }
      throw error;
    }
  }
  async updateMetadata(extensions, profileLocation) {
    const updatedExtensions = [];
    await this.withProfileExtensions(profileLocation, (profileExtensions) => {
      const result = [];
      for (const profileExtension of profileExtensions) {
        const extension = extensions.find(([e]) => areSameExtensions({ id: e.identifier.id }, { id: profileExtension.identifier.id }) && e.manifest.version === profileExtension.version);
        if (extension) {
          profileExtension.metadata = { ...profileExtension.metadata, ...extension[1] };
          updatedExtensions.push(profileExtension);
          result.push(profileExtension);
        } else {
          result.push(profileExtension);
        }
      }
      return result;
    });
    return updatedExtensions;
  }
  async removeExtensionsFromProfile(extensions, profileLocation) {
    const extensionsToRemove = [];
    try {
      await this.withProfileExtensions(profileLocation, (profileExtensions) => {
        const result = [];
        for (const e of profileExtensions) {
          if (extensions.some((extension) => areSameExtensions(e.identifier, extension))) {
            extensionsToRemove.push(e);
          } else {
            result.push(e);
          }
        }
        if (extensionsToRemove.length) {
          this._onRemoveExtensions.fire({ extensions: extensionsToRemove, profileLocation });
        }
        return result;
      });
      if (extensionsToRemove.length) {
        this._onDidRemoveExtensions.fire({ extensions: extensionsToRemove, profileLocation });
      }
    } catch (error) {
      if (extensionsToRemove.length) {
        this._onDidRemoveExtensions.fire({ extensions: extensionsToRemove, error, profileLocation });
      }
      throw error;
    }
  }
  async withProfileExtensions(file, updateFn, options) {
    return this.getResourceAccessQueue(file).queue(async () => {
      let extensions = [];
      let storedProfileExtensions;
      try {
        const content = await this.fileService.readFile(file);
        storedProfileExtensions = JSON.parse(content.value.toString().trim() || "[]");
      } catch (error) {
        if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
          throw error;
        }
        if (this.uriIdentityService.extUri.isEqual(file, this.userDataProfilesService.defaultProfile.extensionsResource)) {
          storedProfileExtensions = await this.migrateFromOldDefaultProfileExtensionsLocation();
        }
        if (!storedProfileExtensions && options?.bailOutWhenFileNotFound) {
          throw new ExtensionsProfileScanningError(getErrorMessage(error), "ERROR_PROFILE_NOT_FOUND" /* ERROR_PROFILE_NOT_FOUND */);
        }
      }
      if (storedProfileExtensions) {
        if (!Array.isArray(storedProfileExtensions)) {
          this.throwInvalidConentError(file);
        }
        let migrate = false;
        for (const e of storedProfileExtensions) {
          if (!isStoredProfileExtension(e)) {
            this.throwInvalidConentError(file);
          }
          let location;
          if (isString(e.relativeLocation) && e.relativeLocation) {
            location = this.resolveExtensionLocation(e.relativeLocation);
          } else if (isString(e.location)) {
            this.logService.warn(`Extensions profile: Ignoring extension with invalid location: ${e.location}`);
            continue;
          } else {
            location = URI.revive(e.location);
            const relativePath = this.toRelativePath(location);
            if (relativePath) {
              migrate = true;
              e.relativeLocation = relativePath;
            }
          }
          if (isUndefined(e.metadata?.hasPreReleaseVersion) && e.metadata?.preRelease) {
            migrate = true;
            e.metadata.hasPreReleaseVersion = true;
          }
          const uuid = e.metadata?.id ?? e.identifier.uuid;
          extensions.push({
            identifier: uuid ? { id: e.identifier.id, uuid } : { id: e.identifier.id },
            location,
            version: e.version,
            metadata: e.metadata
          });
        }
        if (migrate) {
          await this.fileService.writeFile(file, VSBuffer.fromString(JSON.stringify(storedProfileExtensions)));
        }
      }
      if (updateFn) {
        extensions = updateFn(extensions);
        const storedProfileExtensions2 = extensions.map((e) => ({
          identifier: e.identifier,
          version: e.version,
          // retain old format so that old clients can read it
          location: e.location.toJSON(),
          relativeLocation: this.toRelativePath(e.location),
          metadata: e.metadata
        }));
        await this.fileService.writeFile(file, VSBuffer.fromString(JSON.stringify(storedProfileExtensions2)));
      }
      return extensions;
    });
  }
  throwInvalidConentError(file) {
    throw new ExtensionsProfileScanningError(`Invalid extensions content in ${file.toString()}`, "ERROR_INVALID_CONTENT" /* ERROR_INVALID_CONTENT */);
  }
  toRelativePath(extensionLocation) {
    return this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.dirname(extensionLocation), this.extensionsLocation) ? this.uriIdentityService.extUri.basename(extensionLocation) : void 0;
  }
  resolveExtensionLocation(path) {
    return this.uriIdentityService.extUri.joinPath(this.extensionsLocation, path);
  }
  async migrateFromOldDefaultProfileExtensionsLocation() {
    if (!this._migrationPromise) {
      this._migrationPromise = (async () => {
        const oldDefaultProfileExtensionsLocation = this.uriIdentityService.extUri.joinPath(this.userDataProfilesService.defaultProfile.location, "extensions.json");
        const oldDefaultProfileExtensionsInitLocation = this.uriIdentityService.extUri.joinPath(this.extensionsLocation, ".init-default-profile-extensions");
        let content;
        try {
          content = (await this.fileService.readFile(oldDefaultProfileExtensionsLocation)).value.toString();
        } catch (error) {
          if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
            return void 0;
          }
          throw error;
        }
        this.logService.info("Migrating extensions from old default profile location", oldDefaultProfileExtensionsLocation.toString());
        let storedProfileExtensions;
        try {
          const parsedData = JSON.parse(content);
          if (Array.isArray(parsedData) && parsedData.every((candidate) => isStoredProfileExtension(candidate))) {
            storedProfileExtensions = parsedData;
          } else {
            this.logService.warn("Skipping migrating from old default profile locaiton: Found invalid data", parsedData);
          }
        } catch (error) {
          this.logService.error(error);
        }
        if (storedProfileExtensions) {
          try {
            await this.fileService.createFile(this.userDataProfilesService.defaultProfile.extensionsResource, VSBuffer.fromString(JSON.stringify(storedProfileExtensions)), { overwrite: false });
            this.logService.info("Migrated extensions from old default profile location to new location", oldDefaultProfileExtensionsLocation.toString(), this.userDataProfilesService.defaultProfile.extensionsResource.toString());
          } catch (error) {
            if (toFileOperationResult(error) === FileOperationResult.FILE_MODIFIED_SINCE) {
              this.logService.info("Migration from old default profile location to new location is done by another window", oldDefaultProfileExtensionsLocation.toString(), this.userDataProfilesService.defaultProfile.extensionsResource.toString());
            } else {
              throw error;
            }
          }
        }
        try {
          await this.fileService.del(oldDefaultProfileExtensionsLocation);
        } catch (error) {
          if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
            this.logService.error(error);
          }
        }
        try {
          await this.fileService.del(oldDefaultProfileExtensionsInitLocation);
        } catch (error) {
          if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
            this.logService.error(error);
          }
        }
        return storedProfileExtensions;
      })();
    }
    return this._migrationPromise;
  }
  getResourceAccessQueue(file) {
    let resourceQueue = this.resourcesAccessQueueMap.get(file);
    if (!resourceQueue) {
      resourceQueue = new Queue();
      this.resourcesAccessQueueMap.set(file, resourceQueue);
    }
    return resourceQueue;
  }
};
AbstractExtensionsProfileScannerService = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, IUserDataProfilesService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, ILogService)
], AbstractExtensionsProfileScannerService);
function isStoredProfileExtension(obj) {
  const candidate = obj;
  return isObject(candidate) && isIExtensionIdentifier(candidate.identifier) && (isUriComponents(candidate.location) || isString(candidate.location) && !!candidate.location) && (isUndefined(candidate.relativeLocation) || isString(candidate.relativeLocation)) && !!candidate.version && isString(candidate.version);
}
function isUriComponents(obj) {
  if (!obj) {
    return false;
  }
  const thing = obj;
  return typeof thing?.path === "string" && typeof thing?.scheme === "string";
}
export {
  AbstractExtensionsProfileScannerService,
  ExtensionsProfileScanningError,
  ExtensionsProfileScanningErrorCode,
  IExtensionsProfileScannerService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBRdWV1ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgTWV0YWRhdGEsIGlzSUV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMgfSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb24sIElFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UsIHRvRmlsZU9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBNdXRhYmxlLCBpc09iamVjdCwgaXNTdHJpbmcsIGlzVW5kZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcblxuaW50ZXJmYWNlIElTdG9yZWRQcm9maWxlRXh0ZW5zaW9uIHtcblx0aWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXI7XG5cdGxvY2F0aW9uOiBVcmlDb21wb25lbnRzIHwgc3RyaW5nO1xuXHRyZWxhdGl2ZUxvY2F0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHZlcnNpb246IHN0cmluZztcblx0bWV0YWRhdGE/OiBNZXRhZGF0YTtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmluZ0Vycm9yQ29kZSB7XG5cblx0LyoqXG5cdCAqIEVycm9yIHdoZW4gdHJ5aW5nIHRvIHNjYW4gZXh0ZW5zaW9ucyBmcm9tIGEgcHJvZmlsZSB0aGF0IGRvZXMgbm90IGV4aXN0LlxuXHQgKi9cblx0RVJST1JfUFJPRklMRV9OT1RfRk9VTkQgPSAnRVJST1JfUFJPRklMRV9OT1RfRk9VTkQnLFxuXG5cdC8qKlxuXHQgKiBFcnJvciB3aGVuIHByb2ZpbGUgZmlsZSBpcyBpbnZhbGlkLlxuXHQgKi9cblx0RVJST1JfSU5WQUxJRF9DT05URU5UID0gJ0VSUk9SX0lOVkFMSURfQ09OVEVOVCcsXG5cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNQcm9maWxlU2Nhbm5pbmdFcnJvciBleHRlbmRzIEVycm9yIHtcblx0Y29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nLCBwdWJsaWMgY29kZTogRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmluZ0Vycm9yQ29kZSkge1xuXHRcdHN1cGVyKG1lc3NhZ2UpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uIHtcblx0cmVhZG9ubHkgaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXI7XG5cdHJlYWRvbmx5IHZlcnNpb246IHN0cmluZztcblx0cmVhZG9ubHkgbG9jYXRpb246IFVSSTtcblx0cmVhZG9ubHkgbWV0YWRhdGE/OiBNZXRhZGF0YTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9maWxlRXh0ZW5zaW9uc0V2ZW50IHtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uczogcmVhZG9ubHkgSVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uW107XG5cdHJlYWRvbmx5IHByb2ZpbGVMb2NhdGlvbjogVVJJO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERpZEFkZFByb2ZpbGVFeHRlbnNpb25zRXZlbnQgZXh0ZW5kcyBQcm9maWxlRXh0ZW5zaW9uc0V2ZW50IHtcblx0cmVhZG9ubHkgZXJyb3I/OiBFcnJvcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEaWRSZW1vdmVQcm9maWxlRXh0ZW5zaW9uc0V2ZW50IGV4dGVuZHMgUHJvZmlsZUV4dGVuc2lvbnNFdmVudCB7XG5cdHJlYWRvbmx5IGVycm9yPzogRXJyb3I7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb2ZpbGVFeHRlbnNpb25zU2Nhbk9wdGlvbnMge1xuXHRyZWFkb25seSBiYWlsT3V0V2hlbkZpbGVOb3RGb3VuZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjb25zdCBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZT4oJ0lFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlJyk7XG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG9uQWRkRXh0ZW5zaW9uczogRXZlbnQ8UHJvZmlsZUV4dGVuc2lvbnNFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkQWRkRXh0ZW5zaW9uczogRXZlbnQ8RGlkQWRkUHJvZmlsZUV4dGVuc2lvbnNFdmVudD47XG5cdHJlYWRvbmx5IG9uUmVtb3ZlRXh0ZW5zaW9uczogRXZlbnQ8UHJvZmlsZUV4dGVuc2lvbnNFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlRXh0ZW5zaW9uczogRXZlbnQ8RGlkUmVtb3ZlUHJvZmlsZUV4dGVuc2lvbnNFdmVudD47XG5cblx0c2NhblByb2ZpbGVFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbjogVVJJLCBvcHRpb25zPzogSVByb2ZpbGVFeHRlbnNpb25zU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdPjtcblx0YWRkRXh0ZW5zaW9uc1RvUHJvZmlsZShleHRlbnNpb25zOiBbSUV4dGVuc2lvbiwgTWV0YWRhdGEgfCB1bmRlZmluZWRdW10sIHByb2ZpbGVMb2NhdGlvbjogVVJJLCBrZWVwRXhpc3RpbmdWZXJzaW9ucz86IGJvb2xlYW4pOiBQcm9taXNlPElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdPjtcblx0dXBkYXRlTWV0YWRhdGEoZXh0ZW5zaW9uczogW0lFeHRlbnNpb24sIE1ldGFkYXRhIHwgdW5kZWZpbmVkXVtdLCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uW10+O1xuXHRyZW1vdmVFeHRlbnNpb25zRnJvbVByb2ZpbGUoZXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQWRkRXh0ZW5zaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFByb2ZpbGVFeHRlbnNpb25zRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkFkZEV4dGVuc2lvbnMgPSB0aGlzLl9vbkFkZEV4dGVuc2lvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBZGRFeHRlbnNpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RGlkQWRkUHJvZmlsZUV4dGVuc2lvbnNFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWRkRXh0ZW5zaW9ucyA9IHRoaXMuX29uRGlkQWRkRXh0ZW5zaW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblJlbW92ZUV4dGVuc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxQcm9maWxlRXh0ZW5zaW9uc0V2ZW50PigpKTtcblx0cmVhZG9ubHkgb25SZW1vdmVFeHRlbnNpb25zID0gdGhpcy5fb25SZW1vdmVFeHRlbnNpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVtb3ZlRXh0ZW5zaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPERpZFJlbW92ZVByb2ZpbGVFeHRlbnNpb25zRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbW92ZUV4dGVuc2lvbnMgPSB0aGlzLl9vbkRpZFJlbW92ZUV4dGVuc2lvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZXNvdXJjZXNBY2Nlc3NRdWV1ZU1hcCA9IG5ldyBSZXNvdXJjZU1hcDxRdWV1ZTxJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25bXT4+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zTG9jYXRpb246IFVSSSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHNjYW5Qcm9maWxlRXh0ZW5zaW9ucyhwcm9maWxlTG9jYXRpb246IFVSSSwgb3B0aW9ucz86IElQcm9maWxlRXh0ZW5zaW9uc1NjYW5PcHRpb25zKTogUHJvbWlzZTxJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLndpdGhQcm9maWxlRXh0ZW5zaW9ucyhwcm9maWxlTG9jYXRpb24sIHVuZGVmaW5lZCwgb3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBhZGRFeHRlbnNpb25zVG9Qcm9maWxlKGV4dGVuc2lvbnM6IFtJRXh0ZW5zaW9uLCBNZXRhZGF0YSB8IHVuZGVmaW5lZF1bXSwgcHJvZmlsZUxvY2F0aW9uOiBVUkksIGtlZXBFeGlzdGluZ1ZlcnNpb25zPzogYm9vbGVhbik6IFByb21pc2U8SVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBleHRlbnNpb25zVG9SZW1vdmU6IElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvQWRkOiBJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25bXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLndpdGhQcm9maWxlRXh0ZW5zaW9ucyhwcm9maWxlTG9jYXRpb24sIGV4aXN0aW5nRXh0ZW5zaW9ucyA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogSVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdFx0aWYgKGtlZXBFeGlzdGluZ1ZlcnNpb25zKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goLi4uZXhpc3RpbmdFeHRlbnNpb25zKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGV4aXN0aW5nIG9mIGV4aXN0aW5nRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbnMuc29tZSgoW2VdKSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4aXN0aW5nLmlkZW50aWZpZXIpICYmIGUubWFuaWZlc3QudmVyc2lvbiAhPT0gZXhpc3RpbmcudmVyc2lvbikpIHtcblx0XHRcdFx0XHRcdFx0Ly8gUmVtb3ZlIHRoZSBleGlzdGluZyBleHRlbnNpb24gd2l0aCBkaWZmZXJlbnQgdmVyc2lvblxuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25zVG9SZW1vdmUucHVzaChleGlzdGluZyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaChleGlzdGluZyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgW2V4dGVuc2lvbiwgbWV0YWRhdGFdIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRjb25zdCBpbmRleCA9IHJlc3VsdC5maW5kSW5kZXgoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSAmJiBlLnZlcnNpb24gPT09IGV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uKTtcblx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25Ub0FkZCA9IHsgaWRlbnRpZmllcjogZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHZlcnNpb246IGV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uLCBsb2NhdGlvbjogZXh0ZW5zaW9uLmxvY2F0aW9uLCBtZXRhZGF0YSB9O1xuXHRcdFx0XHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbnNUb0FkZC5wdXNoKGV4dGVuc2lvblRvQWRkKTtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGV4dGVuc2lvblRvQWRkKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnNwbGljZShpbmRleCwgMSwgZXh0ZW5zaW9uVG9BZGQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uc1RvQWRkLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuX29uQWRkRXh0ZW5zaW9ucy5maXJlKHsgZXh0ZW5zaW9uczogZXh0ZW5zaW9uc1RvQWRkLCBwcm9maWxlTG9jYXRpb24gfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbnNUb1JlbW92ZS5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLl9vblJlbW92ZUV4dGVuc2lvbnMuZmlyZSh7IGV4dGVuc2lvbnM6IGV4dGVuc2lvbnNUb1JlbW92ZSwgcHJvZmlsZUxvY2F0aW9uIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9KTtcblx0XHRcdGlmIChleHRlbnNpb25zVG9BZGQubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQWRkRXh0ZW5zaW9ucy5maXJlKHsgZXh0ZW5zaW9uczogZXh0ZW5zaW9uc1RvQWRkLCBwcm9maWxlTG9jYXRpb24gfSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uc1RvUmVtb3ZlLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlbW92ZUV4dGVuc2lvbnMuZmlyZSh7IGV4dGVuc2lvbnM6IGV4dGVuc2lvbnNUb1JlbW92ZSwgcHJvZmlsZUxvY2F0aW9uIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGV4dGVuc2lvbnNUb0FkZDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGV4dGVuc2lvbnNUb0FkZC5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRBZGRFeHRlbnNpb25zLmZpcmUoeyBleHRlbnNpb25zOiBleHRlbnNpb25zVG9BZGQsIGVycm9yLCBwcm9maWxlTG9jYXRpb24gfSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uc1RvUmVtb3ZlLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlbW92ZUV4dGVuc2lvbnMuZmlyZSh7IGV4dGVuc2lvbnM6IGV4dGVuc2lvbnNUb1JlbW92ZSwgZXJyb3IsIHByb2ZpbGVMb2NhdGlvbiB9KTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHVwZGF0ZU1ldGFkYXRhKGV4dGVuc2lvbnM6IFtJRXh0ZW5zaW9uLCBNZXRhZGF0YV1bXSwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgdXBkYXRlZEV4dGVuc2lvbnM6IElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdID0gW107XG5cdFx0YXdhaXQgdGhpcy53aXRoUHJvZmlsZUV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uLCBwcm9maWxlRXh0ZW5zaW9ucyA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHByb2ZpbGVFeHRlbnNpb24gb2YgcHJvZmlsZUV4dGVuc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZXh0ZW5zaW9ucy5maW5kKChbZV0pID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IGUuaWRlbnRpZmllci5pZCB9LCB7IGlkOiBwcm9maWxlRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQgfSkgJiYgZS5tYW5pZmVzdC52ZXJzaW9uID09PSBwcm9maWxlRXh0ZW5zaW9uLnZlcnNpb24pO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0cHJvZmlsZUV4dGVuc2lvbi5tZXRhZGF0YSA9IHsgLi4ucHJvZmlsZUV4dGVuc2lvbi5tZXRhZGF0YSwgLi4uZXh0ZW5zaW9uWzFdIH07XG5cdFx0XHRcdFx0dXBkYXRlZEV4dGVuc2lvbnMucHVzaChwcm9maWxlRXh0ZW5zaW9uKTtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChwcm9maWxlRXh0ZW5zaW9uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChwcm9maWxlRXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblx0XHRyZXR1cm4gdXBkYXRlZEV4dGVuc2lvbnM7XG5cdH1cblxuXHRhc3luYyByZW1vdmVFeHRlbnNpb25zRnJvbVByb2ZpbGUoZXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb25zVG9SZW1vdmU6IElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdID0gW107XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMud2l0aFByb2ZpbGVFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbiwgcHJvZmlsZUV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQ6IElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgZSBvZiBwcm9maWxlRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdGlmIChleHRlbnNpb25zLnNvbWUoZXh0ZW5zaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZXh0ZW5zaW9uKSkpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbnNUb1JlbW92ZS5wdXNoKGUpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaChlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbnNUb1JlbW92ZS5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLl9vblJlbW92ZUV4dGVuc2lvbnMuZmlyZSh7IGV4dGVuc2lvbnM6IGV4dGVuc2lvbnNUb1JlbW92ZSwgcHJvZmlsZUxvY2F0aW9uIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9KTtcblx0XHRcdGlmIChleHRlbnNpb25zVG9SZW1vdmUubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkUmVtb3ZlRXh0ZW5zaW9ucy5maXJlKHsgZXh0ZW5zaW9uczogZXh0ZW5zaW9uc1RvUmVtb3ZlLCBwcm9maWxlTG9jYXRpb24gfSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChleHRlbnNpb25zVG9SZW1vdmUubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkUmVtb3ZlRXh0ZW5zaW9ucy5maXJlKHsgZXh0ZW5zaW9uczogZXh0ZW5zaW9uc1RvUmVtb3ZlLCBlcnJvciwgcHJvZmlsZUxvY2F0aW9uIH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3aXRoUHJvZmlsZUV4dGVuc2lvbnMoZmlsZTogVVJJLCB1cGRhdGVGbj86IChleHRlbnNpb25zOiBNdXRhYmxlPElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbj5bXSkgPT4gSVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uW10sIG9wdGlvbnM/OiBJUHJvZmlsZUV4dGVuc2lvbnNTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRSZXNvdXJjZUFjY2Vzc1F1ZXVlKGZpbGUpLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBleHRlbnNpb25zOiBJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25bXSA9IFtdO1xuXG5cdFx0XHQvLyBSZWFkXG5cdFx0XHRsZXQgc3RvcmVkUHJvZmlsZUV4dGVuc2lvbnM6IElTdG9yZWRQcm9maWxlRXh0ZW5zaW9uW10gfCB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShmaWxlKTtcblx0XHRcdFx0c3RvcmVkUHJvZmlsZUV4dGVuc2lvbnMgPSBKU09OLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKS50cmltKCkgfHwgJ1tdJyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIG1pZ3JhdGUgZnJvbSBvbGQgbG9jYXRpb24sIHJlbW92ZSB0aGlzIGFmdGVyIGNvdXBsZSBvZiByZWxlYXNlc1xuXHRcdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZmlsZSwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0c3RvcmVkUHJvZmlsZUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLm1pZ3JhdGVGcm9tT2xkRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zTG9jYXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXN0b3JlZFByb2ZpbGVFeHRlbnNpb25zICYmIG9wdGlvbnM/LmJhaWxPdXRXaGVuRmlsZU5vdEZvdW5kKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbnNQcm9maWxlU2Nhbm5pbmdFcnJvcihnZXRFcnJvck1lc3NhZ2UoZXJyb3IpLCBFeHRlbnNpb25zUHJvZmlsZVNjYW5uaW5nRXJyb3JDb2RlLkVSUk9SX1BST0ZJTEVfTk9UX0ZPVU5EKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHN0b3JlZFByb2ZpbGVFeHRlbnNpb25zKSB7XG5cdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheShzdG9yZWRQcm9maWxlRXh0ZW5zaW9ucykpIHtcblx0XHRcdFx0XHR0aGlzLnRocm93SW52YWxpZENvbmVudEVycm9yKGZpbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFRPRE8gQHNhbmR5MDgxOiBSZW1vdmUgdGhpcyBtaWdyYXRpb24gYWZ0ZXIgY291cGxlIG9mIHJlbGVhc2VzXG5cdFx0XHRcdGxldCBtaWdyYXRlID0gZmFsc2U7XG5cdFx0XHRcdGZvciAoY29uc3QgZSBvZiBzdG9yZWRQcm9maWxlRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdGlmICghaXNTdG9yZWRQcm9maWxlRXh0ZW5zaW9uKGUpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRocm93SW52YWxpZENvbmVudEVycm9yKGZpbGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsZXQgbG9jYXRpb246IFVSSTtcblx0XHRcdFx0XHRpZiAoaXNTdHJpbmcoZS5yZWxhdGl2ZUxvY2F0aW9uKSAmJiBlLnJlbGF0aXZlTG9jYXRpb24pIHtcblx0XHRcdFx0XHRcdC8vIEV4dGVuc2lvbiBpbiBuZXcgZm9ybWF0LiBObyBtaWdyYXRpb24gbmVlZGVkLlxuXHRcdFx0XHRcdFx0bG9jYXRpb24gPSB0aGlzLnJlc29sdmVFeHRlbnNpb25Mb2NhdGlvbihlLnJlbGF0aXZlTG9jYXRpb24pO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNTdHJpbmcoZS5sb2NhdGlvbikpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBFeHRlbnNpb25zIHByb2ZpbGU6IElnbm9yaW5nIGV4dGVuc2lvbiB3aXRoIGludmFsaWQgbG9jYXRpb246ICR7ZS5sb2NhdGlvbn1gKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRsb2NhdGlvbiA9IFVSSS5yZXZpdmUoZS5sb2NhdGlvbik7XG5cdFx0XHRcdFx0XHRjb25zdCByZWxhdGl2ZVBhdGggPSB0aGlzLnRvUmVsYXRpdmVQYXRoKGxvY2F0aW9uKTtcblx0XHRcdFx0XHRcdGlmIChyZWxhdGl2ZVBhdGgpIHtcblx0XHRcdFx0XHRcdFx0Ly8gRXh0ZW5zaW9uIGluIG9sZCBmb3JtYXQuIE1pZ3JhdGUgdG8gbmV3IGZvcm1hdC5cblx0XHRcdFx0XHRcdFx0bWlncmF0ZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdGUucmVsYXRpdmVMb2NhdGlvbiA9IHJlbGF0aXZlUGF0aDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGlzVW5kZWZpbmVkKGUubWV0YWRhdGE/Lmhhc1ByZVJlbGVhc2VWZXJzaW9uKSAmJiBlLm1ldGFkYXRhPy5wcmVSZWxlYXNlKSB7XG5cdFx0XHRcdFx0XHRtaWdyYXRlID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGUubWV0YWRhdGEuaGFzUHJlUmVsZWFzZVZlcnNpb24gPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB1dWlkID0gZS5tZXRhZGF0YT8uaWQgPz8gZS5pZGVudGlmaWVyLnV1aWQ7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdGlkZW50aWZpZXI6IHV1aWQgPyB7IGlkOiBlLmlkZW50aWZpZXIuaWQsIHV1aWQgfSA6IHsgaWQ6IGUuaWRlbnRpZmllci5pZCB9LFxuXHRcdFx0XHRcdFx0bG9jYXRpb24sXG5cdFx0XHRcdFx0XHR2ZXJzaW9uOiBlLnZlcnNpb24sXG5cdFx0XHRcdFx0XHRtZXRhZGF0YTogZS5tZXRhZGF0YSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobWlncmF0ZSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoc3RvcmVkUHJvZmlsZUV4dGVuc2lvbnMpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlXG5cdFx0XHRpZiAodXBkYXRlRm4pIHtcblx0XHRcdFx0ZXh0ZW5zaW9ucyA9IHVwZGF0ZUZuKGV4dGVuc2lvbnMpO1xuXHRcdFx0XHRjb25zdCBzdG9yZWRQcm9maWxlRXh0ZW5zaW9uczogSVN0b3JlZFByb2ZpbGVFeHRlbnNpb25bXSA9IGV4dGVuc2lvbnMubWFwKGUgPT4gKHtcblx0XHRcdFx0XHRpZGVudGlmaWVyOiBlLmlkZW50aWZpZXIsXG5cdFx0XHRcdFx0dmVyc2lvbjogZS52ZXJzaW9uLFxuXHRcdFx0XHRcdC8vIHJldGFpbiBvbGQgZm9ybWF0IHNvIHRoYXQgb2xkIGNsaWVudHMgY2FuIHJlYWQgaXRcblx0XHRcdFx0XHRsb2NhdGlvbjogZS5sb2NhdGlvbi50b0pTT04oKSxcblx0XHRcdFx0XHRyZWxhdGl2ZUxvY2F0aW9uOiB0aGlzLnRvUmVsYXRpdmVQYXRoKGUubG9jYXRpb24pLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiBlLm1ldGFkYXRhXG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUoZmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShzdG9yZWRQcm9maWxlRXh0ZW5zaW9ucykpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGV4dGVuc2lvbnM7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHRocm93SW52YWxpZENvbmVudEVycm9yKGZpbGU6IFVSSSk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFeHRlbnNpb25zUHJvZmlsZVNjYW5uaW5nRXJyb3IoYEludmFsaWQgZXh0ZW5zaW9ucyBjb250ZW50IGluICR7ZmlsZS50b1N0cmluZygpfWAsIEV4dGVuc2lvbnNQcm9maWxlU2Nhbm5pbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9DT05URU5UKTtcblx0fVxuXG5cdHByaXZhdGUgdG9SZWxhdGl2ZVBhdGgoZXh0ZW5zaW9uTG9jYXRpb246IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5kaXJuYW1lKGV4dGVuc2lvbkxvY2F0aW9uKSwgdGhpcy5leHRlbnNpb25zTG9jYXRpb24pXG5cdFx0XHQ/IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5iYXNlbmFtZShleHRlbnNpb25Mb2NhdGlvbilcblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlRXh0ZW5zaW9uTG9jYXRpb24ocGF0aDogc3RyaW5nKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKHRoaXMuZXh0ZW5zaW9uc0xvY2F0aW9uLCBwYXRoKTtcblx0fVxuXG5cdHByaXZhdGUgX21pZ3JhdGlvblByb21pc2U6IFByb21pc2U8SVN0b3JlZFByb2ZpbGVFeHRlbnNpb25bXSB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXN5bmMgbWlncmF0ZUZyb21PbGREZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnNMb2NhdGlvbigpOiBQcm9taXNlPElTdG9yZWRQcm9maWxlRXh0ZW5zaW9uW10gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX21pZ3JhdGlvblByb21pc2UpIHtcblx0XHRcdHRoaXMuX21pZ3JhdGlvblByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBvbGREZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnNMb2NhdGlvbiA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aCh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmxvY2F0aW9uLCAnZXh0ZW5zaW9ucy5qc29uJyk7XG5cdFx0XHRcdGNvbnN0IG9sZERlZmF1bHRQcm9maWxlRXh0ZW5zaW9uc0luaXRMb2NhdGlvbiA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aCh0aGlzLmV4dGVuc2lvbnNMb2NhdGlvbiwgJy5pbml0LWRlZmF1bHQtcHJvZmlsZS1leHRlbnNpb25zJyk7XG5cdFx0XHRcdGxldCBjb250ZW50OiBzdHJpbmc7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29udGVudCA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKG9sZERlZmF1bHRQcm9maWxlRXh0ZW5zaW9uc0xvY2F0aW9uKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKSA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnTWlncmF0aW5nIGV4dGVuc2lvbnMgZnJvbSBvbGQgZGVmYXVsdCBwcm9maWxlIGxvY2F0aW9uJywgb2xkRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zTG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0XHRcdGxldCBzdG9yZWRQcm9maWxlRXh0ZW5zaW9uczogSVN0b3JlZFByb2ZpbGVFeHRlbnNpb25bXSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBwYXJzZWREYXRhID0gSlNPTi5wYXJzZShjb250ZW50KTtcblx0XHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwYXJzZWREYXRhKSAmJiBwYXJzZWREYXRhLmV2ZXJ5KGNhbmRpZGF0ZSA9PiBpc1N0b3JlZFByb2ZpbGVFeHRlbnNpb24oY2FuZGlkYXRlKSkpIHtcblx0XHRcdFx0XHRcdHN0b3JlZFByb2ZpbGVFeHRlbnNpb25zID0gcGFyc2VkRGF0YTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1NraXBwaW5nIG1pZ3JhdGluZyBmcm9tIG9sZCBkZWZhdWx0IHByb2ZpbGUgbG9jYWl0b246IEZvdW5kIGludmFsaWQgZGF0YScsIHBhcnNlZERhdGEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHQvKiBJZ25vcmUgKi9cblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHN0b3JlZFByb2ZpbGVFeHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlRmlsZSh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShzdG9yZWRQcm9maWxlRXh0ZW5zaW9ucykpLCB7IG92ZXJ3cml0ZTogZmFsc2UgfSk7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnTWlncmF0ZWQgZXh0ZW5zaW9ucyBmcm9tIG9sZCBkZWZhdWx0IHByb2ZpbGUgbG9jYXRpb24gdG8gbmV3IGxvY2F0aW9uJywgb2xkRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zTG9jYXRpb24udG9TdHJpbmcoKSwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9ESUZJRURfU0lOQ0UpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ01pZ3JhdGlvbiBmcm9tIG9sZCBkZWZhdWx0IHByb2ZpbGUgbG9jYXRpb24gdG8gbmV3IGxvY2F0aW9uIGlzIGRvbmUgYnkgYW5vdGhlciB3aW5kb3cnLCBvbGREZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnNMb2NhdGlvbi50b1N0cmluZygpLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwob2xkRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zTG9jYXRpb24pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwob2xkRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zSW5pdExvY2F0aW9uKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gc3RvcmVkUHJvZmlsZUV4dGVuc2lvbnM7XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbWlncmF0aW9uUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVzb3VyY2VBY2Nlc3NRdWV1ZShmaWxlOiBVUkkpOiBRdWV1ZTxJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25bXT4ge1xuXHRcdGxldCByZXNvdXJjZVF1ZXVlID0gdGhpcy5yZXNvdXJjZXNBY2Nlc3NRdWV1ZU1hcC5nZXQoZmlsZSk7XG5cdFx0aWYgKCFyZXNvdXJjZVF1ZXVlKSB7XG5cdFx0XHRyZXNvdXJjZVF1ZXVlID0gbmV3IFF1ZXVlPElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdPigpO1xuXHRcdFx0dGhpcy5yZXNvdXJjZXNBY2Nlc3NRdWV1ZU1hcC5zZXQoZmlsZSwgcmVzb3VyY2VRdWV1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXNvdXJjZVF1ZXVlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzU3RvcmVkUHJvZmlsZUV4dGVuc2lvbihvYmo6IHVua25vd24pOiBvYmogaXMgSVN0b3JlZFByb2ZpbGVFeHRlbnNpb24ge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBvYmogYXMgSVN0b3JlZFByb2ZpbGVFeHRlbnNpb24gfCB1bmRlZmluZWQ7XG5cdHJldHVybiBpc09iamVjdChjYW5kaWRhdGUpXG5cdFx0JiYgaXNJRXh0ZW5zaW9uSWRlbnRpZmllcihjYW5kaWRhdGUuaWRlbnRpZmllcilcblx0XHQmJiAoaXNVcmlDb21wb25lbnRzKGNhbmRpZGF0ZS5sb2NhdGlvbikgfHwgKGlzU3RyaW5nKGNhbmRpZGF0ZS5sb2NhdGlvbikgJiYgISFjYW5kaWRhdGUubG9jYXRpb24pKVxuXHRcdCYmIChpc1VuZGVmaW5lZChjYW5kaWRhdGUucmVsYXRpdmVMb2NhdGlvbikgfHwgaXNTdHJpbmcoY2FuZGlkYXRlLnJlbGF0aXZlTG9jYXRpb24pKVxuXHRcdCYmICEhY2FuZGlkYXRlLnZlcnNpb25cblx0XHQmJiBpc1N0cmluZyhjYW5kaWRhdGUudmVyc2lvbik7XG59XG5cbmZ1bmN0aW9uIGlzVXJpQ29tcG9uZW50cyhvYmo6IHVua25vd24pOiBvYmogaXMgVXJpQ29tcG9uZW50cyB7XG5cdGlmICghb2JqKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IHRoaW5nID0gb2JqIGFzIFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQ7XG5cdHJldHVybiB0eXBlb2YgdGhpbmc/LnBhdGggPT09ICdzdHJpbmcnICYmXG5cdFx0dHlwZW9mIHRoaW5nPy5zY2hlbWUgPT09ICdzdHJpbmcnO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFzQjtBQUMvQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFdBQTBCO0FBQ25DLFNBQW1CLDhCQUE4QjtBQUNqRCxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLHFCQUFxQixjQUFjLDZCQUE2QjtBQUN6RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFrQixVQUFVLFVBQVUsbUJBQW1CO0FBQ3pELFNBQVMsdUJBQXVCO0FBVXpCLElBQVcscUNBQVgsa0JBQVdBLHdDQUFYO0FBS04sRUFBQUEsb0NBQUEsNkJBQTBCO0FBSzFCLEVBQUFBLG9DQUFBLDJCQUF3QjtBQVZQLFNBQUFBO0FBQUEsR0FBQTtBQWNYLE1BQU0sdUNBQXVDLE1BQU07QUFBQSxFQUN6RCxZQUFZLFNBQXdCLE1BQTBDO0FBQzdFLFVBQU0sT0FBTztBQURzQjtBQUFBLEVBRXBDO0FBQ0Q7QUEwQk8sTUFBTSxtQ0FBbUMsZ0JBQWtELGtDQUFrQztBQWU3SCxJQUFlLDBDQUFmLGNBQStELFdBQXVEO0FBQUEsRUFpQjVILFlBQ2tCLG9CQUNjLGFBQ1kseUJBQ0wsb0JBQ1IsWUFDN0I7QUFDRCxVQUFNO0FBTlc7QUFDYztBQUNZO0FBQ0w7QUFDUjtBQW5CL0IsU0FBaUIsbUJBQW1CLEtBQUssVUFBVSxJQUFJLFFBQWdDLENBQUM7QUFDeEYsU0FBUyxrQkFBa0IsS0FBSyxpQkFBaUI7QUFFakQsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLFFBQXNDLENBQUM7QUFDakcsU0FBUyxxQkFBcUIs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QUFBQSxRQUNEO0FBRUEsZUFBTztBQUFBLE1BQ1IsR0FBRztBQUFBLElBQ0o7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFUSx1QkFBdUIsTUFBOEM7QUFDNUUsUUFBSSxnQkFBZ0IsS0FBSyx3QkFBd0IsSUFBSSxJQUFJO0FBQ3pELFFBQUksQ0FBQyxlQUFlO0FBQ25CLHNCQUFnQixJQUFJLE1BQWtDO0FBQ3RELFdBQUssd0JBQXdCLElBQUksTUFBTSxhQUFhO0FBQUEsSUFDckQ7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBN1NzQiwwQ0FBZjtBQUFBLEVBbUJKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F0Qm1CO0FBK1N0QixTQUFTLHlCQUF5QixLQUE4QztBQUMvRSxRQUFNLFlBQVk7QUFDbEIsU0FBTyxTQUFTLFNBQVMsS0FDckIsdUJBQXVCLFVBQVUsVUFBVSxNQUMxQyxnQkFBZ0IsVUFBVSxRQUFRLEtBQU0sU0FBUyxVQUFVLFFBQVEsS0FBSyxDQUFDLENBQUMsVUFBVSxjQUNwRixZQUFZLFVBQVUsZ0JBQWdCLEtBQUssU0FBUyxVQUFVLGdCQUFnQixNQUMvRSxDQUFDLENBQUMsVUFBVSxXQUNaLFNBQVMsVUFBVSxPQUFPO0FBQy9CO0FBRUEsU0FBUyxnQkFBZ0IsS0FBb0M7QUFDNUQsTUFBSSxDQUFDLEtBQUs7QUFDVCxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sUUFBUTtBQUNkLFNBQU8sT0FBTyxPQUFPLFNBQVMsWUFDN0IsT0FBTyxPQUFPLFdBQVc7QUFDM0I7IiwKICAibmFtZXMiOiBbIkV4dGVuc2lvbnNQcm9maWxlU2Nhbm5pbmdFcnJvckNvZGUiLCAic3RvcmVkUHJvZmlsZUV4dGVuc2lvbnMiXQp9Cg==
