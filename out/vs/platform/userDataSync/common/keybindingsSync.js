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
import { isNonEmptyArray } from "../../../base/common/arrays.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Event } from "../../../base/common/event.js";
import { parse } from "../../../base/common/json.js";
import { OperatingSystem, OS } from "../../../base/common/platform.js";
import { isUndefined } from "../../../base/common/types.js";
import { localize } from "../../../nls.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { FileOperationResult, IFileService } from "../../files/common/files.js";
import { IStorageService } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { AbstractInitializer, AbstractJsonFileSynchroniser } from "./abstractSynchronizer.js";
import { merge } from "./keybindingsMerge.js";
import { Change, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, IUserDataSyncUtilService, SyncResource, UserDataSyncError, UserDataSyncErrorCode, USER_DATA_SYNC_SCHEME, CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM } from "./userDataSync.js";
function getKeybindingsContentFromSyncContent(syncContent, platformSpecific, logService) {
  try {
    const parsed = JSON.parse(syncContent);
    if (!platformSpecific) {
      return isUndefined(parsed.all) ? null : parsed.all;
    }
    switch (OS) {
      case OperatingSystem.Macintosh:
        return isUndefined(parsed.mac) ? null : parsed.mac;
      case OperatingSystem.Linux:
        return isUndefined(parsed.linux) ? null : parsed.linux;
      case OperatingSystem.Windows:
        return isUndefined(parsed.windows) ? null : parsed.windows;
    }
  } catch (e) {
    logService.error(e);
    return null;
  }
}
let KeybindingsSynchroniser = class extends AbstractJsonFileSynchroniser {
  constructor(profile, collection, userDataSyncStoreService, userDataSyncLocalStoreService, logService, configurationService, userDataSyncEnablementService, fileService, environmentService, storageService, userDataSyncUtilService, telemetryService, uriIdentityService) {
    super(profile.keybindingsResource, { syncResource: SyncResource.Keybindings, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, userDataSyncUtilService, configurationService, uriIdentityService);
    /* Version 2: Change settings from `sync.${setting}` to `settingsSync.{setting}` */
    this.version = 2;
    this.previewResource = this.extUri.joinPath(this.syncPreviewFolder, "keybindings.json");
    this.baseResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" });
    this.localResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" });
    this.remoteResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" });
    this.acceptedResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" });
    this._register(Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("settingsSync.keybindingsPerPlatform"))(() => this.triggerLocalChange()));
  }
  async generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine, userDataSyncConfiguration) {
    const remoteContent = remoteUserData.syncData ? getKeybindingsContentFromSyncContent(remoteUserData.syncData.content, userDataSyncConfiguration.keybindingsPerPlatform ?? this.syncKeybindingsPerPlatform(), this.logService) : null;
    lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
    const lastSyncContent = lastSyncUserData ? this.getKeybindingsContentFromLastSyncUserData(lastSyncUserData) : null;
    const fileContent = await this.getLocalFileContent();
    const formattingOptions = await this.getFormattingOptions();
    let mergedContent = null;
    let hasLocalChanged = false;
    let hasRemoteChanged = false;
    let hasConflicts = false;
    if (remoteContent) {
      let localContent2 = fileContent ? fileContent.value.toString() : "[]";
      localContent2 = localContent2 || "[]";
      if (this.hasErrors(localContent2, true)) {
        throw new UserDataSyncError(localize("errorInvalidSettings", "Unable to sync keybindings because the content in the file is not valid. Please open the file and correct it."), UserDataSyncErrorCode.LocalInvalidContent, this.resource);
      }
      if (!lastSyncContent || lastSyncContent !== localContent2 || lastSyncContent !== remoteContent) {
        this.logService.trace(`${this.syncResourceLogLabel}: Merging remote keybindings with local keybindings...`);
        const result = await merge(localContent2, remoteContent, lastSyncContent, formattingOptions, this.userDataSyncUtilService);
        if (result.hasChanges) {
          mergedContent = result.mergeContent;
          hasConflicts = result.hasConflicts;
          hasLocalChanged = hasConflicts || result.mergeContent !== localContent2;
          hasRemoteChanged = hasConflicts || result.mergeContent !== remoteContent;
        }
      }
    } else if (fileContent) {
      this.logService.trace(`${this.syncResourceLogLabel}: Remote keybindings does not exist. Synchronizing keybindings for the first time.`);
      mergedContent = fileContent.value.toString();
      hasRemoteChanged = true;
    }
    const previewResult = {
      content: hasConflicts ? lastSyncContent : mergedContent,
      localChange: hasLocalChanged ? fileContent ? Change.Modified : Change.Added : Change.None,
      remoteChange: hasRemoteChanged ? Change.Modified : Change.None,
      hasConflicts
    };
    const localContent = fileContent ? fileContent.value.toString() : null;
    return [{
      fileContent,
      baseResource: this.baseResource,
      baseContent: lastSyncContent,
      localResource: this.localResource,
      localContent,
      localChange: previewResult.localChange,
      remoteResource: this.remoteResource,
      remoteContent,
      remoteChange: previewResult.remoteChange,
      previewResource: this.previewResource,
      previewResult,
      acceptedResource: this.acceptedResource
    }];
  }
  async hasRemoteChanged(lastSyncUserData) {
    const lastSyncContent = this.getKeybindingsContentFromLastSyncUserData(lastSyncUserData);
    if (lastSyncContent === null) {
      return true;
    }
    const fileContent = await this.getLocalFileContent();
    const localContent = fileContent ? fileContent.value.toString() : "";
    const formattingOptions = await this.getFormattingOptions();
    const result = await merge(localContent || "[]", lastSyncContent, lastSyncContent, formattingOptions, this.userDataSyncUtilService);
    return result.hasConflicts || result.mergeContent !== lastSyncContent;
  }
  async getMergeResult(resourcePreview, token) {
    return resourcePreview.previewResult;
  }
  async getAcceptResult(resourcePreview, resource, content, token) {
    if (this.extUri.isEqual(resource, this.localResource)) {
      return {
        content: resourcePreview.fileContent ? resourcePreview.fileContent.value.toString() : null,
        localChange: Change.None,
        remoteChange: Change.Modified
      };
    }
    if (this.extUri.isEqual(resource, this.remoteResource)) {
      return {
        content: resourcePreview.remoteContent,
        localChange: Change.Modified,
        remoteChange: Change.None
      };
    }
    if (this.extUri.isEqual(resource, this.previewResource)) {
      if (content === void 0) {
        return {
          content: resourcePreview.previewResult.content,
          localChange: resourcePreview.previewResult.localChange,
          remoteChange: resourcePreview.previewResult.remoteChange
        };
      } else {
        return {
          content,
          localChange: Change.Modified,
          remoteChange: Change.Modified
        };
      }
    }
    throw new Error(`Invalid Resource: ${resource.toString()}`);
  }
  async applyResult(remoteUserData, lastSyncUserData, resourcePreviews, force) {
    const { fileContent } = resourcePreviews[0][0];
    let { content, localChange, remoteChange } = resourcePreviews[0][1];
    if (localChange === Change.None && remoteChange === Change.None) {
      this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing keybindings.`);
    }
    if (content !== null) {
      content = content.trim();
      content = content || "[]";
      if (this.hasErrors(content, true)) {
        throw new UserDataSyncError(localize("errorInvalidSettings", "Unable to sync keybindings because the content in the file is not valid. Please open the file and correct it."), UserDataSyncErrorCode.LocalInvalidContent, this.resource);
      }
    }
    if (localChange !== Change.None) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating local keybindings...`);
      if (fileContent) {
        await this.backupLocal(this.toSyncContent(fileContent.value.toString()));
      }
      await this.updateLocalFileContent(content || "[]", fileContent, force);
      this.logService.info(`${this.syncResourceLogLabel}: Updated local keybindings`);
    }
    if (remoteChange !== Change.None) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating remote keybindings...`);
      const remoteContents = this.toSyncContent(content || "[]", remoteUserData.syncData?.content);
      remoteUserData = await this.updateRemoteUserData(remoteContents, force ? null : remoteUserData.ref);
      this.logService.info(`${this.syncResourceLogLabel}: Updated remote keybindings`);
    }
    try {
      await this.fileService.del(this.previewResource);
    } catch (e) {
    }
    if (lastSyncUserData?.ref !== remoteUserData.ref) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized keybindings...`);
      await this.updateLastSyncUserData(remoteUserData, { platformSpecific: this.syncKeybindingsPerPlatform() });
      this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized keybindings`);
    }
  }
  async hasLocalData() {
    try {
      const localFileContent = await this.getLocalFileContent();
      if (localFileContent) {
        const keybindings = parse(localFileContent.value.toString());
        if (isNonEmptyArray(keybindings)) {
          return true;
        }
      }
    } catch (error) {
      if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
        return true;
      }
    }
    return false;
  }
  async resolveContent(uri) {
    if (this.extUri.isEqual(this.remoteResource, uri) || this.extUri.isEqual(this.baseResource, uri) || this.extUri.isEqual(this.localResource, uri) || this.extUri.isEqual(this.acceptedResource, uri)) {
      return this.resolvePreviewContent(uri);
    }
    return null;
  }
  getKeybindingsContentFromLastSyncUserData(lastSyncUserData) {
    if (!lastSyncUserData.syncData) {
      return null;
    }
    if (lastSyncUserData.platformSpecific !== void 0 && lastSyncUserData.platformSpecific !== this.syncKeybindingsPerPlatform()) {
      return null;
    }
    return getKeybindingsContentFromSyncContent(lastSyncUserData.syncData.content, this.syncKeybindingsPerPlatform(), this.logService);
  }
  toSyncContent(keybindingsContent, syncContent) {
    let parsed = {};
    try {
      parsed = JSON.parse(syncContent || "{}");
    } catch (e) {
      this.logService.error(e);
    }
    if (this.syncKeybindingsPerPlatform()) {
      delete parsed.all;
    } else {
      parsed.all = keybindingsContent;
    }
    switch (OS) {
      case OperatingSystem.Macintosh:
        parsed.mac = keybindingsContent;
        break;
      case OperatingSystem.Linux:
        parsed.linux = keybindingsContent;
        break;
      case OperatingSystem.Windows:
        parsed.windows = keybindingsContent;
        break;
    }
    return JSON.stringify(parsed);
  }
  syncKeybindingsPerPlatform() {
    return !!this.configurationService.getValue(CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM);
  }
};
KeybindingsSynchroniser = __decorateClass([
  __decorateParam(2, IUserDataSyncStoreService),
  __decorateParam(3, IUserDataSyncLocalStoreService),
  __decorateParam(4, IUserDataSyncLogService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IUserDataSyncEnablementService),
  __decorateParam(7, IFileService),
  __decorateParam(8, IEnvironmentService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IUserDataSyncUtilService),
  __decorateParam(11, ITelemetryService),
  __decorateParam(12, IUriIdentityService)
], KeybindingsSynchroniser);
let KeybindingsInitializer = class extends AbstractInitializer {
  constructor(fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService) {
    super(SyncResource.Keybindings, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
  }
  async doInitialize(remoteUserData) {
    const keybindingsContent = remoteUserData.syncData ? this.getKeybindingsContentFromSyncContent(remoteUserData.syncData.content) : null;
    if (!keybindingsContent) {
      this.logService.info("Skipping initializing keybindings because remote keybindings does not exist.");
      return;
    }
    const isEmpty = await this.isEmpty();
    if (!isEmpty) {
      this.logService.info("Skipping initializing keybindings because local keybindings exist.");
      return;
    }
    await this.fileService.writeFile(this.userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(keybindingsContent));
    await this.updateLastSyncUserData(remoteUserData);
  }
  async isEmpty() {
    try {
      const fileContent = await this.fileService.readFile(this.userDataProfilesService.defaultProfile.settingsResource);
      const keybindings = parse(fileContent.value.toString());
      return !isNonEmptyArray(keybindings);
    } catch (error) {
      return error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND;
    }
  }
  getKeybindingsContentFromSyncContent(syncContent) {
    try {
      return getKeybindingsContentFromSyncContent(syncContent, true, this.logService);
    } catch (e) {
      this.logService.error(e);
      return null;
    }
  }
};
KeybindingsInitializer = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IUserDataSyncLogService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUriIdentityService)
], KeybindingsInitializer);
export {
  KeybindingsInitializer,
  KeybindingsSynchroniser,
  getKeybindingsContentFromSyncContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24va2V5YmluZGluZ3NTeW5jLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSwgT1MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBpc1VuZGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEluaXRpYWxpemVyLCBBYnN0cmFjdEpzb25GaWxlU3luY2hyb25pc2VyLCBJQWNjZXB0UmVzdWx0LCBJRmlsZVJlc291cmNlUHJldmlldywgSU1lcmdlUmVzdWx0IH0gZnJvbSAnLi9hYnN0cmFjdFN5bmNocm9uaXplci5qcyc7XG5pbXBvcnQgeyBtZXJnZSB9IGZyb20gJy4va2V5YmluZGluZ3NNZXJnZS5qcyc7XG5pbXBvcnQgeyBDaGFuZ2UsIElSZW1vdGVVc2VyRGF0YSwgSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLCBJVXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbiwgSVVzZXJEYXRhU3luY2hyb25pc2VyLCBJVXNlckRhdGFTeW5jTG9nU2VydmljZSwgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLCBJVXNlckRhdGFTeW5jVXRpbFNlcnZpY2UsIFN5bmNSZXNvdXJjZSwgVXNlckRhdGFTeW5jRXJyb3IsIFVzZXJEYXRhU3luY0Vycm9yQ29kZSwgVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBDT05GSUdfU1lOQ19LRVlCSU5ESU5HU19QRVJfUExBVEZPUk0gfSBmcm9tICcuL3VzZXJEYXRhU3luYy5qcyc7XG5cbmludGVyZmFjZSBJU3luY0NvbnRlbnQge1xuXHRtYWM/OiBzdHJpbmc7XG5cdGxpbnV4Pzogc3RyaW5nO1xuXHR3aW5kb3dzPzogc3RyaW5nO1xuXHRhbGw/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJS2V5YmluZGluZ3NSZXNvdXJjZVByZXZpZXcgZXh0ZW5kcyBJRmlsZVJlc291cmNlUHJldmlldyB7XG5cdHByZXZpZXdSZXN1bHQ6IElNZXJnZVJlc3VsdDtcbn1cblxuaW50ZXJmYWNlIElMYXN0U3luY1VzZXJEYXRhIGV4dGVuZHMgSVJlbW90ZVVzZXJEYXRhIHtcblx0cGxhdGZvcm1TcGVjaWZpYz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRLZXliaW5kaW5nc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQoc3luY0NvbnRlbnQ6IHN0cmluZywgcGxhdGZvcm1TcGVjaWZpYzogYm9vbGVhbiwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiBzdHJpbmcgfCBudWxsIHtcblx0dHJ5IHtcblx0XHRjb25zdCBwYXJzZWQgPSA8SVN5bmNDb250ZW50PkpTT04ucGFyc2Uoc3luY0NvbnRlbnQpO1xuXHRcdGlmICghcGxhdGZvcm1TcGVjaWZpYykge1xuXHRcdFx0cmV0dXJuIGlzVW5kZWZpbmVkKHBhcnNlZC5hbGwpID8gbnVsbCA6IHBhcnNlZC5hbGw7XG5cdFx0fVxuXHRcdHN3aXRjaCAoT1MpIHtcblx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0cmV0dXJuIGlzVW5kZWZpbmVkKHBhcnNlZC5tYWMpID8gbnVsbCA6IHBhcnNlZC5tYWM7XG5cdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5MaW51eDpcblx0XHRcdFx0cmV0dXJuIGlzVW5kZWZpbmVkKHBhcnNlZC5saW51eCkgPyBudWxsIDogcGFyc2VkLmxpbnV4O1xuXHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93czpcblx0XHRcdFx0cmV0dXJuIGlzVW5kZWZpbmVkKHBhcnNlZC53aW5kb3dzKSA/IG51bGwgOiBwYXJzZWQud2luZG93cztcblx0XHR9XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHRsb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBLZXliaW5kaW5nc1N5bmNocm9uaXNlciBleHRlbmRzIEFic3RyYWN0SnNvbkZpbGVTeW5jaHJvbmlzZXIgaW1wbGVtZW50cyBJVXNlckRhdGFTeW5jaHJvbmlzZXIge1xuXG5cdC8qIFZlcnNpb24gMjogQ2hhbmdlIHNldHRpbmdzIGZyb20gYHN5bmMuJHtzZXR0aW5nfWAgdG8gYHNldHRpbmdzU3luYy57c2V0dGluZ31gICovXG5cdHByb3RlY3RlZCByZWFkb25seSB2ZXJzaW9uOiBudW1iZXIgPSAyO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByZXZpZXdSZXNvdXJjZTogVVJJID0gdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwgJ2tleWJpbmRpbmdzLmpzb24nKTtcblx0cHJpdmF0ZSByZWFkb25seSBiYXNlUmVzb3VyY2U6IFVSSSA9IHRoaXMucHJldmlld1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbG9jYWxSZXNvdXJjZTogVVJJID0gdGhpcy5wcmV2aWV3UmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlUmVzb3VyY2U6IFVSSSA9IHRoaXMucHJldmlld1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KTtcblx0cHJpdmF0ZSByZWFkb25seSBhY2NlcHRlZFJlc291cmNlOiBVUkkgPSB0aGlzLnByZXZpZXdSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLFxuXHRcdGNvbGxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jVXRpbFNlcnZpY2UgdXNlckRhdGFTeW5jVXRpbFNlcnZpY2U6IElVc2VyRGF0YVN5bmNVdGlsU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihwcm9maWxlLmtleWJpbmRpbmdzUmVzb3VyY2UsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3MsIHByb2ZpbGUgfSwgY29sbGVjdGlvbiwgZmlsZVNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgdXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsIHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBsb2dTZXJ2aWNlLCB1c2VyRGF0YVN5bmNVdGlsU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZmlsdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzZXR0aW5nc1N5bmMua2V5YmluZGluZ3NQZXJQbGF0Zm9ybScpKSgoKSA9PiB0aGlzLnRyaWdnZXJMb2NhbENoYW5nZSgpKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2VuZXJhdGVTeW5jUHJldmlldyhyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJTGFzdFN5bmNVc2VyRGF0YSB8IG51bGwsIGlzUmVtb3RlRGF0YUZyb21DdXJyZW50TWFjaGluZTogYm9vbGVhbiwgdXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbjogSVVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24pOiBQcm9taXNlPElLZXliaW5kaW5nc1Jlc291cmNlUHJldmlld1tdPiB7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhID8gZ2V0S2V5YmluZGluZ3NDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhLmNvbnRlbnQsIHVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24ua2V5YmluZGluZ3NQZXJQbGF0Zm9ybSA/PyB0aGlzLnN5bmNLZXliaW5kaW5nc1BlclBsYXRmb3JtKCksIHRoaXMubG9nU2VydmljZSkgOiBudWxsO1xuXG5cdFx0Ly8gVXNlIHJlbW90ZSBkYXRhIGFzIGxhc3Qgc3luYyBkYXRhIGlmIGxhc3Qgc3luYyBkYXRhIGRvZXMgbm90IGV4aXN0IGFuZCByZW1vdGUgZGF0YSBpcyBmcm9tIHNhbWUgbWFjaGluZVxuXHRcdGxhc3RTeW5jVXNlckRhdGEgPSBsYXN0U3luY1VzZXJEYXRhID09PSBudWxsICYmIGlzUmVtb3RlRGF0YUZyb21DdXJyZW50TWFjaGluZSA/IHJlbW90ZVVzZXJEYXRhIDogbGFzdFN5bmNVc2VyRGF0YTtcblx0XHRjb25zdCBsYXN0U3luY0NvbnRlbnQ6IHN0cmluZyB8IG51bGwgPSBsYXN0U3luY1VzZXJEYXRhID8gdGhpcy5nZXRLZXliaW5kaW5nc0NvbnRlbnRGcm9tTGFzdFN5bmNVc2VyRGF0YShsYXN0U3luY1VzZXJEYXRhKSA6IG51bGw7XG5cblx0XHQvLyBHZXQgZmlsZSBjb250ZW50IGxhc3QgdG8gZ2V0IHRoZSBsYXRlc3Rcblx0XHRjb25zdCBmaWxlQ29udGVudCA9IGF3YWl0IHRoaXMuZ2V0TG9jYWxGaWxlQ29udGVudCgpO1xuXHRcdGNvbnN0IGZvcm1hdHRpbmdPcHRpb25zID0gYXdhaXQgdGhpcy5nZXRGb3JtYXR0aW5nT3B0aW9ucygpO1xuXG5cdFx0bGV0IG1lcmdlZENvbnRlbnQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBoYXNMb2NhbENoYW5nZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRsZXQgaGFzUmVtb3RlQ2hhbmdlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdGxldCBoYXNDb25mbGljdHM6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRcdGlmIChyZW1vdGVDb250ZW50KSB7XG5cdFx0XHRsZXQgbG9jYWxDb250ZW50OiBzdHJpbmcgPSBmaWxlQ29udGVudCA/IGZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkgOiAnW10nO1xuXHRcdFx0bG9jYWxDb250ZW50ID0gbG9jYWxDb250ZW50IHx8ICdbXSc7XG5cdFx0XHRpZiAodGhpcy5oYXNFcnJvcnMobG9jYWxDb250ZW50LCB0cnVlKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jRXJyb3IobG9jYWxpemUoJ2Vycm9ySW52YWxpZFNldHRpbmdzJywgXCJVbmFibGUgdG8gc3luYyBrZXliaW5kaW5ncyBiZWNhdXNlIHRoZSBjb250ZW50IGluIHRoZSBmaWxlIGlzIG5vdCB2YWxpZC4gUGxlYXNlIG9wZW4gdGhlIGZpbGUgYW5kIGNvcnJlY3QgaXQuXCIpLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTG9jYWxJbnZhbGlkQ29udGVudCwgdGhpcy5yZXNvdXJjZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghbGFzdFN5bmNDb250ZW50IC8vIEZpcnN0IHRpbWUgc3luY1xuXHRcdFx0XHR8fCBsYXN0U3luY0NvbnRlbnQgIT09IGxvY2FsQ29udGVudCAvLyBMb2NhbCBoYXMgZm9yd2FyZGVkXG5cdFx0XHRcdHx8IGxhc3RTeW5jQ29udGVudCAhPT0gcmVtb3RlQ29udGVudCAvLyBSZW1vdGUgaGFzIGZvcndhcmRlZFxuXHRcdFx0KSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogTWVyZ2luZyByZW1vdGUga2V5YmluZGluZ3Mgd2l0aCBsb2NhbCBrZXliaW5kaW5ncy4uLmApO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGxhc3RTeW5jQ29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMsIHRoaXMudXNlckRhdGFTeW5jVXRpbFNlcnZpY2UpO1xuXHRcdFx0XHQvLyBTeW5jIG9ubHkgaWYgdGhlcmUgYXJlIGNoYW5nZXNcblx0XHRcdFx0aWYgKHJlc3VsdC5oYXNDaGFuZ2VzKSB7XG5cdFx0XHRcdFx0bWVyZ2VkQ29udGVudCA9IHJlc3VsdC5tZXJnZUNvbnRlbnQ7XG5cdFx0XHRcdFx0aGFzQ29uZmxpY3RzID0gcmVzdWx0Lmhhc0NvbmZsaWN0cztcblx0XHRcdFx0XHRoYXNMb2NhbENoYW5nZWQgPSBoYXNDb25mbGljdHMgfHwgcmVzdWx0Lm1lcmdlQ29udGVudCAhPT0gbG9jYWxDb250ZW50O1xuXHRcdFx0XHRcdGhhc1JlbW90ZUNoYW5nZWQgPSBoYXNDb25mbGljdHMgfHwgcmVzdWx0Lm1lcmdlQ29udGVudCAhPT0gcmVtb3RlQ29udGVudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpcnN0IHRpbWUgc3luY2luZyB0byByZW1vdGVcblx0XHRlbHNlIGlmIChmaWxlQ29udGVudCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBSZW1vdGUga2V5YmluZGluZ3MgZG9lcyBub3QgZXhpc3QuIFN5bmNocm9uaXppbmcga2V5YmluZGluZ3MgZm9yIHRoZSBmaXJzdCB0aW1lLmApO1xuXHRcdFx0bWVyZ2VkQ29udGVudCA9IGZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHRoYXNSZW1vdGVDaGFuZ2VkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRjb250ZW50OiBoYXNDb25mbGljdHMgPyBsYXN0U3luY0NvbnRlbnQgOiBtZXJnZWRDb250ZW50LFxuXHRcdFx0bG9jYWxDaGFuZ2U6IGhhc0xvY2FsQ2hhbmdlZCA/IGZpbGVDb250ZW50ID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLkFkZGVkIDogQ2hhbmdlLk5vbmUsXG5cdFx0XHRyZW1vdGVDaGFuZ2U6IGhhc1JlbW90ZUNoYW5nZWQgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuTm9uZSxcblx0XHRcdGhhc0NvbmZsaWN0c1xuXHRcdH07XG5cblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBmaWxlQ29udGVudCA/IGZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkgOiBudWxsO1xuXHRcdHJldHVybiBbe1xuXHRcdFx0ZmlsZUNvbnRlbnQsXG5cblx0XHRcdGJhc2VSZXNvdXJjZTogdGhpcy5iYXNlUmVzb3VyY2UsXG5cdFx0XHRiYXNlQ29udGVudDogbGFzdFN5bmNDb250ZW50LFxuXG5cdFx0XHRsb2NhbFJlc291cmNlOiB0aGlzLmxvY2FsUmVzb3VyY2UsXG5cdFx0XHRsb2NhbENvbnRlbnQsXG5cdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblxuXHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMucmVtb3RlUmVzb3VyY2UsXG5cdFx0XHRyZW1vdGVDb250ZW50LFxuXHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblxuXHRcdFx0cHJldmlld1Jlc291cmNlOiB0aGlzLnByZXZpZXdSZXNvdXJjZSxcblx0XHRcdHByZXZpZXdSZXN1bHQsXG5cdFx0XHRhY2NlcHRlZFJlc291cmNlOiB0aGlzLmFjY2VwdGVkUmVzb3VyY2UsXG5cdFx0fV07XG5cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBoYXNSZW1vdGVDaGFuZ2VkKGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGxhc3RTeW5jQ29udGVudCA9IHRoaXMuZ2V0S2V5YmluZGluZ3NDb250ZW50RnJvbUxhc3RTeW5jVXNlckRhdGEobGFzdFN5bmNVc2VyRGF0YSk7XG5cdFx0aWYgKGxhc3RTeW5jQ29udGVudCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnQgPSBhd2FpdCB0aGlzLmdldExvY2FsRmlsZUNvbnRlbnQoKTtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQ6IHN0cmluZyA9IGZpbGVDb250ZW50ID8gZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSA6ICcnO1xuXHRcdGNvbnN0IGZvcm1hdHRpbmdPcHRpb25zID0gYXdhaXQgdGhpcy5nZXRGb3JtYXR0aW5nT3B0aW9ucygpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1lcmdlKGxvY2FsQ29udGVudCB8fCAnW10nLCBsYXN0U3luY0NvbnRlbnQsIGxhc3RTeW5jQ29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMsIHRoaXMudXNlckRhdGFTeW5jVXRpbFNlcnZpY2UpO1xuXHRcdHJldHVybiByZXN1bHQuaGFzQ29uZmxpY3RzIHx8IHJlc3VsdC5tZXJnZUNvbnRlbnQgIT09IGxhc3RTeW5jQ29udGVudDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZXRNZXJnZVJlc3VsdChyZXNvdXJjZVByZXZpZXc6IElLZXliaW5kaW5nc1Jlc291cmNlUHJldmlldywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWVyZ2VSZXN1bHQ+IHtcblx0XHRyZXR1cm4gcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0QWNjZXB0UmVzdWx0KHJlc291cmNlUHJldmlldzogSUtleWJpbmRpbmdzUmVzb3VyY2VQcmV2aWV3LCByZXNvdXJjZTogVVJJLCBjb250ZW50OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBY2NlcHRSZXN1bHQ+IHtcblxuXHRcdC8qIEFjY2VwdCBsb2NhbCByZXNvdXJjZSAqL1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsKHJlc291cmNlLCB0aGlzLmxvY2FsUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQgPyByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSA6IG51bGwsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuTW9kaWZpZWQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8qIEFjY2VwdCByZW1vdGUgcmVzb3VyY2UgKi9cblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5yZW1vdGVSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk1vZGlmaWVkLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvKiBBY2NlcHQgcHJldmlldyByZXNvdXJjZSAqL1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsKHJlc291cmNlLCB0aGlzLnByZXZpZXdSZXNvdXJjZSkpIHtcblx0XHRcdGlmIChjb250ZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdC5jb250ZW50LFxuXHRcdFx0XHRcdGxvY2FsQ2hhbmdlOiByZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHJlc291cmNlUHJldmlldy5wcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk1vZGlmaWVkLFxuXHRcdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk1vZGlmaWVkLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBSZXNvdXJjZTogJHtyZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGFwcGx5UmVzdWx0KHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEsIGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSB8IG51bGwsIHJlc291cmNlUHJldmlld3M6IFtJS2V5YmluZGluZ3NSZXNvdXJjZVByZXZpZXcsIElBY2NlcHRSZXN1bHRdW10sIGZvcmNlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyBmaWxlQ29udGVudCB9ID0gcmVzb3VyY2VQcmV2aWV3c1swXVswXTtcblx0XHRsZXQgeyBjb250ZW50LCBsb2NhbENoYW5nZSwgcmVtb3RlQ2hhbmdlIH0gPSByZXNvdXJjZVByZXZpZXdzWzBdWzFdO1xuXG5cdFx0aWYgKGxvY2FsQ2hhbmdlID09PSBDaGFuZ2UuTm9uZSAmJiByZW1vdGVDaGFuZ2UgPT09IENoYW5nZS5Ob25lKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogTm8gY2hhbmdlcyBmb3VuZCBkdXJpbmcgc3luY2hyb25pemluZyBrZXliaW5kaW5ncy5gKTtcblx0XHR9XG5cblx0XHRpZiAoY29udGVudCAhPT0gbnVsbCkge1xuXHRcdFx0Y29udGVudCA9IGNvbnRlbnQudHJpbSgpO1xuXHRcdFx0Y29udGVudCA9IGNvbnRlbnQgfHwgJ1tdJztcblx0XHRcdGlmICh0aGlzLmhhc0Vycm9ycyhjb250ZW50LCB0cnVlKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jRXJyb3IobG9jYWxpemUoJ2Vycm9ySW52YWxpZFNldHRpbmdzJywgXCJVbmFibGUgdG8gc3luYyBrZXliaW5kaW5ncyBiZWNhdXNlIHRoZSBjb250ZW50IGluIHRoZSBmaWxlIGlzIG5vdCB2YWxpZC4gUGxlYXNlIG9wZW4gdGhlIGZpbGUgYW5kIGNvcnJlY3QgaXQuXCIpLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTG9jYWxJbnZhbGlkQ29udGVudCwgdGhpcy5yZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGxvY2FsQ2hhbmdlICE9PSBDaGFuZ2UuTm9uZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyBsb2NhbCBrZXliaW5kaW5ncy4uLmApO1xuXHRcdFx0aWYgKGZpbGVDb250ZW50KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuYmFja3VwTG9jYWwodGhpcy50b1N5bmNDb250ZW50KGZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTG9jYWxGaWxlQ29udGVudChjb250ZW50IHx8ICdbXScsIGZpbGVDb250ZW50LCBmb3JjZSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCBsb2NhbCBrZXliaW5kaW5nc2ApO1xuXHRcdH1cblxuXHRcdGlmIChyZW1vdGVDaGFuZ2UgIT09IENoYW5nZS5Ob25lKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0aW5nIHJlbW90ZSBrZXliaW5kaW5ncy4uLmApO1xuXHRcdFx0Y29uc3QgcmVtb3RlQ29udGVudHMgPSB0aGlzLnRvU3luY0NvbnRlbnQoY29udGVudCB8fCAnW10nLCByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YT8uY29udGVudCk7XG5cdFx0XHRyZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRoaXMudXBkYXRlUmVtb3RlVXNlckRhdGEocmVtb3RlQ29udGVudHMsIGZvcmNlID8gbnVsbCA6IHJlbW90ZVVzZXJEYXRhLnJlZik7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCByZW1vdGUga2V5YmluZGluZ3NgKTtcblx0XHR9XG5cblx0XHQvLyBEZWxldGUgdGhlIHByZXZpZXdcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwodGhpcy5wcmV2aWV3UmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGUpIHsgLyogaWdub3JlICovIH1cblxuXHRcdGlmIChsYXN0U3luY1VzZXJEYXRhPy5yZWYgIT09IHJlbW90ZVVzZXJEYXRhLnJlZikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyBsYXN0IHN5bmNocm9uaXplZCBrZXliaW5kaW5ncy4uLmApO1xuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVMYXN0U3luY1VzZXJEYXRhKHJlbW90ZVVzZXJEYXRhLCB7IHBsYXRmb3JtU3BlY2lmaWM6IHRoaXMuc3luY0tleWJpbmRpbmdzUGVyUGxhdGZvcm0oKSB9KTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGVkIGxhc3Qgc3luY2hyb25pemVkIGtleWJpbmRpbmdzYCk7XG5cdFx0fVxuXG5cdH1cblxuXHRhc3luYyBoYXNMb2NhbERhdGEoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxvY2FsRmlsZUNvbnRlbnQgPSBhd2FpdCB0aGlzLmdldExvY2FsRmlsZUNvbnRlbnQoKTtcblx0XHRcdGlmIChsb2NhbEZpbGVDb250ZW50KSB7XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmdzID0gcGFyc2UobG9jYWxGaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKGlzTm9uRW1wdHlBcnJheShrZXliaW5kaW5ncykpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVDb250ZW50KHVyaTogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwodGhpcy5yZW1vdGVSZXNvdXJjZSwgdXJpKVxuXHRcdFx0fHwgdGhpcy5leHRVcmkuaXNFcXVhbCh0aGlzLmJhc2VSZXNvdXJjZSwgdXJpKVxuXHRcdFx0fHwgdGhpcy5leHRVcmkuaXNFcXVhbCh0aGlzLmxvY2FsUmVzb3VyY2UsIHVyaSlcblx0XHRcdHx8IHRoaXMuZXh0VXJpLmlzRXF1YWwodGhpcy5hY2NlcHRlZFJlc291cmNlLCB1cmkpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlUHJldmlld0NvbnRlbnQodXJpKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGdldEtleWJpbmRpbmdzQ29udGVudEZyb21MYXN0U3luY1VzZXJEYXRhKGxhc3RTeW5jVXNlckRhdGE6IElMYXN0U3luY1VzZXJEYXRhKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKCFsYXN0U3luY1VzZXJEYXRhLnN5bmNEYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBSZXR1cm4gbnVsbCBpZiB0aGVyZSBpcyBhIGNoYW5nZSBpbiBwbGF0Zm9ybSBzcGVjaWZpYyBwcm9wZXJ0eSBmcm9tIGxhc3QgdGltZSBzeW5jLlxuXHRcdGlmIChsYXN0U3luY1VzZXJEYXRhLnBsYXRmb3JtU3BlY2lmaWMgIT09IHVuZGVmaW5lZCAmJiBsYXN0U3luY1VzZXJEYXRhLnBsYXRmb3JtU3BlY2lmaWMgIT09IHRoaXMuc3luY0tleWJpbmRpbmdzUGVyUGxhdGZvcm0oKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGdldEtleWJpbmRpbmdzQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhLnN5bmNEYXRhLmNvbnRlbnQsIHRoaXMuc3luY0tleWJpbmRpbmdzUGVyUGxhdGZvcm0oKSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgdG9TeW5jQ29udGVudChrZXliaW5kaW5nc0NvbnRlbnQ6IHN0cmluZywgc3luY0NvbnRlbnQ/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGxldCBwYXJzZWQ6IElTeW5jQ29udGVudCA9IHt9O1xuXHRcdHRyeSB7XG5cdFx0XHRwYXJzZWQgPSBKU09OLnBhcnNlKHN5bmNDb250ZW50IHx8ICd7fScpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuc3luY0tleWJpbmRpbmdzUGVyUGxhdGZvcm0oKSkge1xuXHRcdFx0ZGVsZXRlIHBhcnNlZC5hbGw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBhcnNlZC5hbGwgPSBrZXliaW5kaW5nc0NvbnRlbnQ7XG5cdFx0fVxuXHRcdHN3aXRjaCAoT1MpIHtcblx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0cGFyc2VkLm1hYyA9IGtleWJpbmRpbmdzQ29udGVudDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5MaW51eDpcblx0XHRcdFx0cGFyc2VkLmxpbnV4ID0ga2V5YmluZGluZ3NDb250ZW50O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3M6XG5cdFx0XHRcdHBhcnNlZC53aW5kb3dzID0ga2V5YmluZGluZ3NDb250ZW50O1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHBhcnNlZCk7XG5cdH1cblxuXHRwcml2YXRlIHN5bmNLZXliaW5kaW5nc1BlclBsYXRmb3JtKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQ09ORklHX1NZTkNfS0VZQklORElOR1NfUEVSX1BMQVRGT1JNKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBLZXliaW5kaW5nc0luaXRpYWxpemVyIGV4dGVuZHMgQWJzdHJhY3RJbml0aWFsaXplciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFN5bmNSZXNvdXJjZS5LZXliaW5kaW5ncywgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgbG9nU2VydmljZSwgZmlsZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGRvSW5pdGlhbGl6ZShyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qga2V5YmluZGluZ3NDb250ZW50ID0gcmVtb3RlVXNlckRhdGEuc3luY0RhdGEgPyB0aGlzLmdldEtleWJpbmRpbmdzQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YS5jb250ZW50KSA6IG51bGw7XG5cdFx0aWYgKCFrZXliaW5kaW5nc0NvbnRlbnQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTa2lwcGluZyBpbml0aWFsaXppbmcga2V5YmluZGluZ3MgYmVjYXVzZSByZW1vdGUga2V5YmluZGluZ3MgZG9lcyBub3QgZXhpc3QuJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNFbXB0eSA9IGF3YWl0IHRoaXMuaXNFbXB0eSgpO1xuXHRcdGlmICghaXNFbXB0eSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1NraXBwaW5nIGluaXRpYWxpemluZyBrZXliaW5kaW5ncyBiZWNhdXNlIGxvY2FsIGtleWJpbmRpbmdzIGV4aXN0LicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhrZXliaW5kaW5nc0NvbnRlbnQpKTtcblxuXHRcdGF3YWl0IHRoaXMudXBkYXRlTGFzdFN5bmNVc2VyRGF0YShyZW1vdGVVc2VyRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGlzRW1wdHkoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGZpbGVDb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZ3MgPSBwYXJzZShmaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRcdHJldHVybiAhaXNOb25FbXB0eUFycmF5KGtleWJpbmRpbmdzKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuICg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0S2V5YmluZGluZ3NDb250ZW50RnJvbVN5bmNDb250ZW50KHN5bmNDb250ZW50OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGdldEtleWJpbmRpbmdzQ29udGVudEZyb21TeW5jQ29udGVudChzeW5jQ29udGVudCwgdHJ1ZSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCLFVBQVU7QUFDcEMsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBNkIscUJBQXFCLG9CQUFvQjtBQUV0RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUEyQixnQ0FBZ0M7QUFDM0QsU0FBUyxxQkFBcUIsb0NBQXVGO0FBQ3JILFNBQVMsYUFBYTtBQUN0QixTQUFTLFFBQXlCLGdDQUFtRix5QkFBeUIsZ0NBQWdDLDJCQUEyQiwwQkFBMEIsY0FBYyxtQkFBbUIsdUJBQXVCLHVCQUF1Qiw0Q0FBNEM7QUFpQnZWLFNBQVMscUNBQXFDLGFBQXFCLGtCQUEyQixZQUF3QztBQUM1SSxNQUFJO0FBQ0gsVUFBTSxTQUF1QixLQUFLLE1BQU0sV0FBVztBQUNuRCxRQUFJLENBQUMsa0JBQWtCO0FBQ3RCLGFBQU8sWUFBWSxPQUFPLEdBQUcsSUFBSSxPQUFPLE9BQU87QUFBQSxJQUNoRDtBQUNBLFlBQVEsSUFBSTtBQUFBLE1BQ1gsS0FBSyxnQkFBZ0I7QUFDcEIsZUFBTyxZQUFZLE9BQU8sR0FBRyxJQUFJLE9BQU8sT0FBTztBQUFB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
