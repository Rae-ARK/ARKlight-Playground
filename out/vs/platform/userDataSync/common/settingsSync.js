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
import { distinct } from "../../../base/common/arrays.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Event } from "../../../base/common/event.js";
import { localize } from "../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../configuration/common/configuration.js";
import { ConfigurationModelParser } from "../../configuration/common/configurationModels.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { IExtensionManagementService } from "../../extensionManagement/common/extensionManagement.js";
import { ExtensionType } from "../../extensions/common/extensions.js";
import { FileOperationResult, IFileService } from "../../files/common/files.js";
import { IStorageService } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { AbstractInitializer, AbstractJsonFileSynchroniser } from "./abstractSynchronizer.js";
import { getIgnoredSettings, isEmpty, merge, updateIgnoredSettings } from "./settingsMerge.js";
import { Change, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, IUserDataSyncUtilService, SyncResource, UserDataSyncError, UserDataSyncErrorCode, USER_DATA_SYNC_CONFIGURATION_SCOPE, USER_DATA_SYNC_SCHEME, getIgnoredSettingsForExtension } from "./userDataSync.js";
function isSettingsSyncContent(thing) {
  return thing && (thing.settings && typeof thing.settings === "string") && Object.keys(thing).length === 1;
}
function parseSettingsSyncContent(syncContent) {
  const parsed = JSON.parse(syncContent);
  return isSettingsSyncContent(parsed) ? parsed : (
    /* migrate */
    { settings: syncContent }
  );
}
let SettingsSynchroniser = class extends AbstractJsonFileSynchroniser {
  constructor(profile, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, logService, userDataSyncUtilService, configurationService, userDataSyncEnablementService, telemetryService, extensionManagementService, uriIdentityService) {
    super(profile.settingsResource, { syncResource: SyncResource.Settings, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, userDataSyncUtilService, configurationService, uriIdentityService);
    this.profile = profile;
    this.extensionManagementService = extensionManagementService;
    /* Version 2: Change settings from `sync.${setting}` to `settingsSync.{setting}` */
    this.version = 2;
    this.previewResource = this.extUri.joinPath(this.syncPreviewFolder, "settings.json");
    this.baseResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" });
    this.localResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" });
    this.remoteResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" });
    this.acceptedResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" });
    this.coreIgnoredSettings = void 0;
    this.systemExtensionsIgnoredSettings = void 0;
    this.userExtensionsIgnoredSettings = void 0;
  }
  async getRemoteUserDataSyncConfiguration(refOrLatestData) {
    const lastSyncUserData = await this.getLastSyncUserData();
    const remoteUserData = await this.getLatestRemoteUserData(refOrLatestData, lastSyncUserData);
    const remoteSettingsSyncContent = this.getSettingsSyncContent(remoteUserData);
    const parser = new ConfigurationModelParser(USER_DATA_SYNC_CONFIGURATION_SCOPE, this.logService);
    if (remoteSettingsSyncContent?.settings) {
      parser.parse(remoteSettingsSyncContent.settings);
    }
    return parser.configurationModel.getValue(USER_DATA_SYNC_CONFIGURATION_SCOPE) || {};
  }
  async generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine) {
    const fileContent = await this.getLocalFileContent();
    const formattingOptions = await this.getFormattingOptions();
    const remoteSettingsSyncContent = this.getSettingsSyncContent(remoteUserData);
    lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
    const lastSettingsSyncContent = lastSyncUserData ? this.getSettingsSyncContent(lastSyncUserData) : null;
    const ignoredSettings = await this.getIgnoredSettings();
    let mergedContent = null;
    let hasLocalChanged = false;
    let hasRemoteChanged = false;
    let hasConflicts = false;
    if (remoteSettingsSyncContent) {
      let localContent2 = fileContent ? fileContent.value.toString().trim() : "{}";
      localContent2 = localContent2 || "{}";
      this.validateContent(localContent2);
      this.logService.trace(`${this.syncResourceLogLabel}: Merging remote settings with local settings...`);
      const result = merge(localContent2, remoteSettingsSyncContent.settings, lastSettingsSyncContent ? lastSettingsSyncContent.settings : null, ignoredSettings, [], formattingOptions);
      mergedContent = result.localContent || result.remoteContent;
      hasLocalChanged = result.localContent !== null;
      hasRemoteChanged = result.remoteContent !== null;
      hasConflicts = result.hasConflicts;
    } else if (fileContent) {
      this.logService.trace(`${this.syncResourceLogLabel}: Remote settings does not exist. Synchronizing settings for the first time.`);
      mergedContent = fileContent.value.toString().trim() || "{}";
      this.validateContent(mergedContent);
      hasRemoteChanged = true;
    }
    const localContent = fileContent ? fileContent.value.toString() : null;
    const baseContent = lastSettingsSyncContent?.settings ?? null;
    const previewResult = {
      content: hasConflicts ? baseContent : mergedContent,
      localChange: hasLocalChanged ? Change.Modified : Change.None,
      remoteChange: hasRemoteChanged ? Change.Modified : Change.None,
      hasConflicts
    };
    return [{
      fileContent,
      baseResource: this.baseResource,
      baseContent,
      localResource: this.localResource,
      localContent,
      localChange: previewResult.localChange,
      remoteResource: this.remoteResource,
      remoteContent: remoteSettingsSyncContent ? remoteSettingsSyncContent.settings : null,
      remoteChange: previewResult.remoteChange,
      previewResource: this.previewResource,
      previewResult,
      acceptedResource: this.acceptedResource
    }];
  }
  async hasRemoteChanged(lastSyncUserData) {
    const lastSettingsSyncContent = this.getSettingsSyncContent(lastSyncUserData);
    if (lastSettingsSyncContent === null) {
      return true;
    }
    const fileContent = await this.getLocalFileContent();
    const localContent = fileContent ? fileContent.value.toString().trim() : "";
    const ignoredSettings = await this.getIgnoredSettings();
    const formattingOptions = await this.getFormattingOptions();
    const result = merge(localContent || "{}", lastSettingsSyncContent.settings, lastSettingsSyncContent.settings, ignoredSettings, [], formattingOptions);
    return result.remoteContent !== null;
  }
  async getMergeResult(resourcePreview, token) {
    const formatUtils = await this.getFormattingOptions();
    const ignoredSettings = await this.getIgnoredSettings();
    return {
      ...resourcePreview.previewResult,
      // remove ignored settings from the preview content
      content: resourcePreview.previewResult.content ? updateIgnoredSettings(resourcePreview.previewResult.content, "{}", ignoredSettings, formatUtils) : null
    };
  }
  async getAcceptResult(resourcePreview, resource, content, token) {
    const formattingOptions = await this.getFormattingOptions();
    const ignoredSettings = await this.getIgnoredSettings();
    if (this.extUri.isEqual(resource, this.localResource)) {
      return {
        /* Remove ignored settings */
        content: resourcePreview.fileContent ? updateIgnoredSettings(resourcePreview.fileContent.value.toString(), "{}", ignoredSettings, formattingOptions) : null,
        localChange: Change.None,
        remoteChange: Change.Modified
      };
    }
    if (this.extUri.isEqual(resource, this.remoteResource)) {
      return {
        /* Update ignored settings from local file content */
        content: resourcePreview.remoteContent !== null ? updateIgnoredSettings(resourcePreview.remoteContent, resourcePreview.fileContent ? resourcePreview.fileContent.value.toString() : "{}", ignoredSettings, formattingOptions) : null,
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
          /* Add ignored settings from local file content */
          content: content !== null ? updateIgnoredSettings(content, resourcePreview.fileContent ? resourcePreview.fileContent.value.toString() : "{}", ignoredSettings, formattingOptions) : null,
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
      this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing settings.`);
    }
    content = content ? content.trim() : "{}";
    content = content || "{}";
    this.validateContent(content);
    if (localChange !== Change.None) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating local settings...`);
      if (fileContent) {
        await this.backupLocal(JSON.stringify(this.toSettingsSyncContent(fileContent.value.toString())));
      }
      await this.updateLocalFileContent(content, fileContent, force);
      await this.configurationService.reloadConfiguration(ConfigurationTarget.USER_LOCAL);
      this.logService.info(`${this.syncResourceLogLabel}: Updated local settings`);
    }
    if (remoteChange !== Change.None) {
      const formatUtils = await this.getFormattingOptions();
      const remoteSettingsSyncContent = this.getSettingsSyncContent(remoteUserData);
      const ignoredSettings = await this.getIgnoredSettings(content);
      content = updateIgnoredSettings(content, remoteSettingsSyncContent ? remoteSettingsSyncContent.settings : "{}", ignoredSettings, formatUtils);
      this.logService.trace(`${this.syncResourceLogLabel}: Updating remote settings...`);
      remoteUserData = await this.updateRemoteUserData(JSON.stringify(this.toSettingsSyncContent(content)), force ? null : remoteUserData.ref);
      this.logService.info(`${this.syncResourceLogLabel}: Updated remote settings`);
    }
    try {
      await this.fileService.del(this.previewResource);
    } catch (e) {
    }
    if (lastSyncUserData?.ref !== remoteUserData.ref) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized settings...`);
      await this.updateLastSyncUserData(remoteUserData);
      this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized settings`);
    }
  }
  async hasLocalData() {
    try {
      const localFileContent = await this.getLocalFileContent();
      if (localFileContent) {
        return !isEmpty(localFileContent.value.toString());
      }
    } catch (error) {
      if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
        return true;
      }
    }
    return false;
  }
  async resolveContent(uri) {
    if (this.extUri.isEqual(this.remoteResource, uri) || this.extUri.isEqual(this.localResource, uri) || this.extUri.isEqual(this.acceptedResource, uri) || this.extUri.isEqual(this.baseResource, uri)) {
      return this.resolvePreviewContent(uri);
    }
    return null;
  }
  async resolvePreviewContent(resource) {
    let content = await super.resolvePreviewContent(resource);
    if (content) {
      const formatUtils = await this.getFormattingOptions();
      const ignoredSettings = await this.getIgnoredSettings();
      content = updateIgnoredSettings(content, "{}", ignoredSettings, formatUtils);
    }
    return content;
  }
  getSettingsSyncContent(remoteUserData) {
    return remoteUserData.syncData ? this.parseSettingsSyncContent(remoteUserData.syncData.content) : null;
  }
  parseSettingsSyncContent(syncContent) {
    try {
      return parseSettingsSyncContent(syncContent);
    } catch (e) {
      this.logService.error(e);
    }
    return null;
  }
  toSettingsSyncContent(settings) {
    return { settings };
  }
  async getIgnoredSettings(content) {
    if (!this.coreIgnoredSettings) {
      this.coreIgnoredSettings = this.userDataSyncUtilService.resolveDefaultCoreIgnoredSettings();
    }
    if (!this.systemExtensionsIgnoredSettings) {
      this.systemExtensionsIgnoredSettings = this.getIgnoredSettingForSystemExtensions();
    }
    if (!this.userExtensionsIgnoredSettings) {
      this.userExtensionsIgnoredSettings = this.getIgnoredSettingForUserExtensions();
      const disposable = this._register(Event.any(
        Event.filter(this.extensionManagementService.onDidInstallExtensions, ((e) => e.some(({ local }) => !!local))),
        Event.filter(this.extensionManagementService.onDidUninstallExtension, ((e) => !e.error))
      )(() => {
        disposable.dispose();
        this.userExtensionsIgnoredSettings = void 0;
      }));
    }
    const defaultIgnoredSettings = (await Promise.all([this.coreIgnoredSettings, this.systemExtensionsIgnoredSettings, this.userExtensionsIgnoredSettings])).flat();
    return getIgnoredSettings(defaultIgnoredSettings, this.configurationService, content);
  }
  async getIgnoredSettingForSystemExtensions() {
    const systemExtensions = await this.extensionManagementService.getInstalled(ExtensionType.System);
    return distinct(systemExtensions.map((e) => getIgnoredSettingsForExtension(e.manifest)).flat());
  }
  async getIgnoredSettingForUserExtensions() {
    const userExtensions = await this.extensionManagementService.getInstalled(ExtensionType.User, this.profile.extensionsResource);
    return distinct(userExtensions.map((e) => getIgnoredSettingsForExtension(e.manifest)).flat());
  }
  validateContent(content) {
    if (this.hasErrors(content, false)) {
      throw new UserDataSyncError(localize("errorInvalidSettings", "Unable to sync settings as there are errors/warning in settings file."), UserDataSyncErrorCode.LocalInvalidContent, this.resource);
    }
  }
};
SettingsSynchroniser = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUserDataSyncStoreService),
  __decorateParam(6, IUserDataSyncLocalStoreService),
  __decorateParam(7, IUserDataSyncLogService),
  __decorateParam(8, IUserDataSyncUtilService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IUserDataSyncEnablementService),
  __decorateParam(11, ITelemetryService),
  __decorateParam(12, IExtensionManagementService),
  __decorateParam(13, IUriIdentityService)
], SettingsSynchroniser);
let SettingsInitializer = class extends AbstractInitializer {
  constructor(fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService) {
    super(SyncResource.Settings, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
  }
  async doInitialize(remoteUserData) {
    const settingsSyncContent = remoteUserData.syncData ? this.parseSettingsSyncContent(remoteUserData.syncData.content) : null;
    if (!settingsSyncContent) {
      this.logService.info("Skipping initializing settings because remote settings does not exist.");
      return;
    }
    const isEmpty2 = await this.isEmpty();
    if (!isEmpty2) {
      this.logService.info("Skipping initializing settings because local settings exist.");
      return;
    }
    await this.fileService.writeFile(this.userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(settingsSyncContent.settings));
    await this.updateLastSyncUserData(remoteUserData);
  }
  async isEmpty() {
    try {
      const fileContent = await this.fileService.readFile(this.userDataProfilesService.defaultProfile.settingsResource);
      return isEmpty(fileContent.value.toString().trim());
    } catch (error) {
      return error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND;
    }
  }
  parseSettingsSyncContent(syncContent) {
    try {
      return parseSettingsSyncContent(syncContent);
    } catch (e) {
      this.logService.error(e);
    }
    return null;
  }
};
SettingsInitializer = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IUserDataSyncLogService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUriIdentityService)
], SettingsInitializer);
export {
  SettingsInitializer,
  SettingsSynchroniser,
  parseSettingsSyncContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vc2V0dGluZ3NTeW5jLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uTW9kZWxzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25UeXBlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEluaXRpYWxpemVyLCBBYnN0cmFjdEpzb25GaWxlU3luY2hyb25pc2VyLCBJQWNjZXB0UmVzdWx0LCBJRmlsZVJlc291cmNlUHJldmlldywgSU1lcmdlUmVzdWx0IH0gZnJvbSAnLi9hYnN0cmFjdFN5bmNocm9uaXplci5qcyc7XG5pbXBvcnQgeyBnZXRJZ25vcmVkU2V0dGluZ3MsIGlzRW1wdHksIG1lcmdlLCB1cGRhdGVJZ25vcmVkU2V0dGluZ3MgfSBmcm9tICcuL3NldHRpbmdzTWVyZ2UuanMnO1xuaW1wb3J0IHsgQ2hhbmdlLCBJUmVtb3RlVXNlckRhdGEsIElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSwgSVVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24sIElVc2VyRGF0YVN5bmNocm9uaXNlciwgSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsIElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgSVVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlLCBTeW5jUmVzb3VyY2UsIFVzZXJEYXRhU3luY0Vycm9yLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUsIFVTRVJfREFUQV9TWU5DX0NPTkZJR1VSQVRJT05fU0NPUEUsIFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgZ2V0SWdub3JlZFNldHRpbmdzRm9yRXh0ZW5zaW9uLCBJVXNlckRhdGEgfSBmcm9tICcuL3VzZXJEYXRhU3luYy5qcyc7XG5cbmludGVyZmFjZSBJU2V0dGluZ3NSZXNvdXJjZVByZXZpZXcgZXh0ZW5kcyBJRmlsZVJlc291cmNlUHJldmlldyB7XG5cdHByZXZpZXdSZXN1bHQ6IElNZXJnZVJlc3VsdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2V0dGluZ3NTeW5jQ29udGVudCB7XG5cdHNldHRpbmdzOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGlzU2V0dGluZ3NTeW5jQ29udGVudCh0aGluZzogYW55KTogdGhpbmcgaXMgSVNldHRpbmdzU3luY0NvbnRlbnQge1xuXHRyZXR1cm4gdGhpbmdcblx0XHQmJiAodGhpbmcuc2V0dGluZ3MgJiYgdHlwZW9mIHRoaW5nLnNldHRpbmdzID09PSAnc3RyaW5nJylcblx0XHQmJiBPYmplY3Qua2V5cyh0aGluZykubGVuZ3RoID09PSAxO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VTZXR0aW5nc1N5bmNDb250ZW50KHN5bmNDb250ZW50OiBzdHJpbmcpOiBJU2V0dGluZ3NTeW5jQ29udGVudCB7XG5cdGNvbnN0IHBhcnNlZCA9IDxJU2V0dGluZ3NTeW5jQ29udGVudD5KU09OLnBhcnNlKHN5bmNDb250ZW50KTtcblx0cmV0dXJuIGlzU2V0dGluZ3NTeW5jQ29udGVudChwYXJzZWQpID8gcGFyc2VkIDogLyogbWlncmF0ZSAqLyB7IHNldHRpbmdzOiBzeW5jQ29udGVudCB9O1xufVxuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NTeW5jaHJvbmlzZXIgZXh0ZW5kcyBBYnN0cmFjdEpzb25GaWxlU3luY2hyb25pc2VyIGltcGxlbWVudHMgSVVzZXJEYXRhU3luY2hyb25pc2VyIHtcblxuXHQvKiBWZXJzaW9uIDI6IENoYW5nZSBzZXR0aW5ncyBmcm9tIGBzeW5jLiR7c2V0dGluZ31gIHRvIGBzZXR0aW5nc1N5bmMue3NldHRpbmd9YCAqL1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyID0gMjtcblx0cmVhZG9ubHkgcHJldmlld1Jlc291cmNlOiBVUkkgPSB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCAnc2V0dGluZ3MuanNvbicpO1xuXHRyZWFkb25seSBiYXNlUmVzb3VyY2U6IFVSSSA9IHRoaXMucHJldmlld1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSk7XG5cdHJlYWRvbmx5IGxvY2FsUmVzb3VyY2U6IFVSSSA9IHRoaXMucHJldmlld1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pO1xuXHRyZWFkb25seSByZW1vdGVSZXNvdXJjZTogVVJJID0gdGhpcy5wcmV2aWV3UmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pO1xuXHRyZWFkb25seSBhY2NlcHRlZFJlc291cmNlOiBVUkkgPSB0aGlzLnByZXZpZXdSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsXG5cdFx0Y29sbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlIHVzZXJEYXRhU3luY1N0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlIHVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jVXRpbFNlcnZpY2UgdXNlckRhdGFTeW5jVXRpbFNlcnZpY2U6IElVc2VyRGF0YVN5bmNVdGlsU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZSB9LCBjb2xsZWN0aW9uLCBmaWxlU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgdXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLCB1c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSwgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGxvZ1NlcnZpY2UsIHVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0fVxuXG5cdGFzeW5jIGdldFJlbW90ZVVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24ocmVmT3JMYXRlc3REYXRhOiBzdHJpbmcgfCBJVXNlckRhdGEgfCBudWxsKTogUHJvbWlzZTxJVXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbj4ge1xuXHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0aGlzLmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRoaXMuZ2V0TGF0ZXN0UmVtb3RlVXNlckRhdGEocmVmT3JMYXRlc3REYXRhLCBsYXN0U3luY1VzZXJEYXRhKTtcblx0XHRjb25zdCByZW1vdGVTZXR0aW5nc1N5bmNDb250ZW50ID0gdGhpcy5nZXRTZXR0aW5nc1N5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhKTtcblx0XHRjb25zdCBwYXJzZXIgPSBuZXcgQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyKFVTRVJfREFUQV9TWU5DX0NPTkZJR1VSQVRJT05fU0NPUEUsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0aWYgKHJlbW90ZVNldHRpbmdzU3luY0NvbnRlbnQ/LnNldHRpbmdzKSB7XG5cdFx0XHRwYXJzZXIucGFyc2UocmVtb3RlU2V0dGluZ3NTeW5jQ29udGVudC5zZXR0aW5ncyk7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJzZXIuY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKFVTRVJfREFUQV9TWU5DX0NPTkZJR1VSQVRJT05fU0NPUEUpIHx8IHt9O1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdlbmVyYXRlU3luY1ByZXZpZXcocmVtb3RlVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSwgbGFzdFN5bmNVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhIHwgbnVsbCwgaXNSZW1vdGVEYXRhRnJvbUN1cnJlbnRNYWNoaW5lOiBib29sZWFuKTogUHJvbWlzZTxJU2V0dGluZ3NSZXNvdXJjZVByZXZpZXdbXT4ge1xuXHRcdGNvbnN0IGZpbGVDb250ZW50ID0gYXdhaXQgdGhpcy5nZXRMb2NhbEZpbGVDb250ZW50KCk7XG5cdFx0Y29uc3QgZm9ybWF0dGluZ09wdGlvbnMgPSBhd2FpdCB0aGlzLmdldEZvcm1hdHRpbmdPcHRpb25zKCk7XG5cdFx0Y29uc3QgcmVtb3RlU2V0dGluZ3NTeW5jQ29udGVudCA9IHRoaXMuZ2V0U2V0dGluZ3NTeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YSk7XG5cblx0XHQvLyBVc2UgcmVtb3RlIGRhdGEgYXMgbGFzdCBzeW5jIGRhdGEgaWYgbGFzdCBzeW5jIGRhdGEgZG9lcyBub3QgZXhpc3QgYW5kIHJlbW90ZSBkYXRhIGlzIGZyb20gc2FtZSBtYWNoaW5lXG5cdFx0bGFzdFN5bmNVc2VyRGF0YSA9IGxhc3RTeW5jVXNlckRhdGEgPT09IG51bGwgJiYgaXNSZW1vdGVEYXRhRnJvbUN1cnJlbnRNYWNoaW5lID8gcmVtb3RlVXNlckRhdGEgOiBsYXN0U3luY1VzZXJEYXRhO1xuXHRcdGNvbnN0IGxhc3RTZXR0aW5nc1N5bmNDb250ZW50OiBJU2V0dGluZ3NTeW5jQ29udGVudCB8IG51bGwgPSBsYXN0U3luY1VzZXJEYXRhID8gdGhpcy5nZXRTZXR0aW5nc1N5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEpIDogbnVsbDtcblx0XHRjb25zdCBpZ25vcmVkU2V0dGluZ3MgPSBhd2FpdCB0aGlzLmdldElnbm9yZWRTZXR0aW5ncygpO1xuXG5cdFx0bGV0IG1lcmdlZENvbnRlbnQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBoYXNMb2NhbENoYW5nZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRsZXQgaGFzUmVtb3RlQ2hhbmdlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdGxldCBoYXNDb25mbGljdHM6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRcdGlmIChyZW1vdGVTZXR0aW5nc1N5bmNDb250ZW50KSB7XG5cdFx0XHRsZXQgbG9jYWxDb250ZW50OiBzdHJpbmcgPSBmaWxlQ29udGVudCA/IGZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkudHJpbSgpIDogJ3t9Jztcblx0XHRcdGxvY2FsQ29udGVudCA9IGxvY2FsQ29udGVudCB8fCAne30nO1xuXHRcdFx0dGhpcy52YWxpZGF0ZUNvbnRlbnQobG9jYWxDb250ZW50KTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogTWVyZ2luZyByZW1vdGUgc2V0dGluZ3Mgd2l0aCBsb2NhbCBzZXR0aW5ncy4uLmApO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVTZXR0aW5nc1N5bmNDb250ZW50LnNldHRpbmdzLCBsYXN0U2V0dGluZ3NTeW5jQ29udGVudCA/IGxhc3RTZXR0aW5nc1N5bmNDb250ZW50LnNldHRpbmdzIDogbnVsbCwgaWdub3JlZFNldHRpbmdzLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdFx0bWVyZ2VkQ29udGVudCA9IHJlc3VsdC5sb2NhbENvbnRlbnQgfHwgcmVzdWx0LnJlbW90ZUNvbnRlbnQ7XG5cdFx0XHRoYXNMb2NhbENoYW5nZWQgPSByZXN1bHQubG9jYWxDb250ZW50ICE9PSBudWxsO1xuXHRcdFx0aGFzUmVtb3RlQ2hhbmdlZCA9IHJlc3VsdC5yZW1vdGVDb250ZW50ICE9PSBudWxsO1xuXHRcdFx0aGFzQ29uZmxpY3RzID0gcmVzdWx0Lmhhc0NvbmZsaWN0cztcblx0XHR9XG5cblx0XHQvLyBGaXJzdCB0aW1lIHN5bmNpbmcgdG8gcmVtb3RlXG5cdFx0ZWxzZSBpZiAoZmlsZUNvbnRlbnQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogUmVtb3RlIHNldHRpbmdzIGRvZXMgbm90IGV4aXN0LiBTeW5jaHJvbml6aW5nIHNldHRpbmdzIGZvciB0aGUgZmlyc3QgdGltZS5gKTtcblx0XHRcdG1lcmdlZENvbnRlbnQgPSBmaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpLnRyaW0oKSB8fCAne30nO1xuXHRcdFx0dGhpcy52YWxpZGF0ZUNvbnRlbnQobWVyZ2VkQ29udGVudCk7XG5cdFx0XHRoYXNSZW1vdGVDaGFuZ2VkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBmaWxlQ29udGVudCA/IGZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkgOiBudWxsO1xuXHRcdGNvbnN0IGJhc2VDb250ZW50ID0gbGFzdFNldHRpbmdzU3luY0NvbnRlbnQ/LnNldHRpbmdzID8/IG51bGw7XG5cblx0XHRjb25zdCBwcmV2aWV3UmVzdWx0ID0ge1xuXHRcdFx0Y29udGVudDogaGFzQ29uZmxpY3RzID8gYmFzZUNvbnRlbnQgOiBtZXJnZWRDb250ZW50LFxuXHRcdFx0bG9jYWxDaGFuZ2U6IGhhc0xvY2FsQ2hhbmdlZCA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5Ob25lLFxuXHRcdFx0cmVtb3RlQ2hhbmdlOiBoYXNSZW1vdGVDaGFuZ2VkID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLk5vbmUsXG5cdFx0XHRoYXNDb25mbGljdHNcblx0XHR9O1xuXG5cdFx0cmV0dXJuIFt7XG5cdFx0XHRmaWxlQ29udGVudCxcblxuXHRcdFx0YmFzZVJlc291cmNlOiB0aGlzLmJhc2VSZXNvdXJjZSxcblx0XHRcdGJhc2VDb250ZW50LFxuXG5cdFx0XHRsb2NhbFJlc291cmNlOiB0aGlzLmxvY2FsUmVzb3VyY2UsXG5cdFx0XHRsb2NhbENvbnRlbnQsXG5cdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblxuXHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMucmVtb3RlUmVzb3VyY2UsXG5cdFx0XHRyZW1vdGVDb250ZW50OiByZW1vdGVTZXR0aW5nc1N5bmNDb250ZW50ID8gcmVtb3RlU2V0dGluZ3NTeW5jQ29udGVudC5zZXR0aW5ncyA6IG51bGwsXG5cdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXG5cdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMucHJldmlld1Jlc291cmNlLFxuXHRcdFx0cHJldmlld1Jlc3VsdCxcblx0XHRcdGFjY2VwdGVkUmVzb3VyY2U6IHRoaXMuYWNjZXB0ZWRSZXNvdXJjZSxcblx0XHR9XTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBoYXNSZW1vdGVDaGFuZ2VkKGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGxhc3RTZXR0aW5nc1N5bmNDb250ZW50OiBJU2V0dGluZ3NTeW5jQ29udGVudCB8IG51bGwgPSB0aGlzLmdldFNldHRpbmdzU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSk7XG5cdFx0aWYgKGxhc3RTZXR0aW5nc1N5bmNDb250ZW50ID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlQ29udGVudCA9IGF3YWl0IHRoaXMuZ2V0TG9jYWxGaWxlQ29udGVudCgpO1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudDogc3RyaW5nID0gZmlsZUNvbnRlbnQgPyBmaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpLnRyaW0oKSA6ICcnO1xuXHRcdGNvbnN0IGlnbm9yZWRTZXR0aW5ncyA9IGF3YWl0IHRoaXMuZ2V0SWdub3JlZFNldHRpbmdzKCk7XG5cdFx0Y29uc3QgZm9ybWF0dGluZ09wdGlvbnMgPSBhd2FpdCB0aGlzLmdldEZvcm1hdHRpbmdPcHRpb25zKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbWVyZ2UobG9jYWxDb250ZW50IHx8ICd7fScsIGxhc3RTZXR0aW5nc1N5bmNDb250ZW50LnNldHRpbmdzLCBsYXN0U2V0dGluZ3NTeW5jQ29udGVudC5zZXR0aW5ncywgaWdub3JlZFNldHRpbmdzLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdHJldHVybiByZXN1bHQucmVtb3RlQ29udGVudCAhPT0gbnVsbDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZXRNZXJnZVJlc3VsdChyZXNvdXJjZVByZXZpZXc6IElTZXR0aW5nc1Jlc291cmNlUHJldmlldywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWVyZ2VSZXN1bHQ+IHtcblx0XHRjb25zdCBmb3JtYXRVdGlscyA9IGF3YWl0IHRoaXMuZ2V0Rm9ybWF0dGluZ09wdGlvbnMoKTtcblx0XHRjb25zdCBpZ25vcmVkU2V0dGluZ3MgPSBhd2FpdCB0aGlzLmdldElnbm9yZWRTZXR0aW5ncygpO1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5yZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdCxcblxuXHRcdFx0Ly8gcmVtb3ZlIGlnbm9yZWQgc2V0dGluZ3MgZnJvbSB0aGUgcHJldmlldyBjb250ZW50XG5cdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdC5jb250ZW50ID8gdXBkYXRlSWdub3JlZFNldHRpbmdzKHJlc291cmNlUHJldmlldy5wcmV2aWV3UmVzdWx0LmNvbnRlbnQsICd7fScsIGlnbm9yZWRTZXR0aW5ncywgZm9ybWF0VXRpbHMpIDogbnVsbFxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0QWNjZXB0UmVzdWx0KHJlc291cmNlUHJldmlldzogSVNldHRpbmdzUmVzb3VyY2VQcmV2aWV3LCByZXNvdXJjZTogVVJJLCBjb250ZW50OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBY2NlcHRSZXN1bHQ+IHtcblxuXHRcdGNvbnN0IGZvcm1hdHRpbmdPcHRpb25zID0gYXdhaXQgdGhpcy5nZXRGb3JtYXR0aW5nT3B0aW9ucygpO1xuXHRcdGNvbnN0IGlnbm9yZWRTZXR0aW5ncyA9IGF3YWl0IHRoaXMuZ2V0SWdub3JlZFNldHRpbmdzKCk7XG5cblx0XHQvKiBBY2NlcHQgbG9jYWwgcmVzb3VyY2UgKi9cblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5sb2NhbFJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0LyogUmVtb3ZlIGlnbm9yZWQgc2V0dGluZ3MgKi9cblx0XHRcdFx0Y29udGVudDogcmVzb3VyY2VQcmV2aWV3LmZpbGVDb250ZW50ID8gdXBkYXRlSWdub3JlZFNldHRpbmdzKHJlc291cmNlUHJldmlldy5maWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpLCAne30nLCBpZ25vcmVkU2V0dGluZ3MsIGZvcm1hdHRpbmdPcHRpb25zKSA6IG51bGwsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuTW9kaWZpZWQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8qIEFjY2VwdCByZW1vdGUgcmVzb3VyY2UgKi9cblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5yZW1vdGVSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC8qIFVwZGF0ZSBpZ25vcmVkIHNldHRpbmdzIGZyb20gbG9jYWwgZmlsZSBjb250ZW50ICovXG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50ICE9PSBudWxsID8gdXBkYXRlSWdub3JlZFNldHRpbmdzKHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50LCByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQgPyByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSA6ICd7fScsIGlnbm9yZWRTZXR0aW5ncywgZm9ybWF0dGluZ09wdGlvbnMpIDogbnVsbCxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0LyogQWNjZXB0IHByZXZpZXcgcmVzb3VyY2UgKi9cblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5wcmV2aWV3UmVzb3VyY2UpKSB7XG5cdFx0XHRpZiAoY29udGVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y29udGVudDogcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQuY29udGVudCxcblx0XHRcdFx0XHRsb2NhbENoYW5nZTogcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRcdFx0cmVtb3RlQ2hhbmdlOiByZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdC5yZW1vdGVDaGFuZ2UsXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC8qIEFkZCBpZ25vcmVkIHNldHRpbmdzIGZyb20gbG9jYWwgZmlsZSBjb250ZW50ICovXG5cdFx0XHRcdFx0Y29udGVudDogY29udGVudCAhPT0gbnVsbCA/IHVwZGF0ZUlnbm9yZWRTZXR0aW5ncyhjb250ZW50LCByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQgPyByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSA6ICd7fScsIGlnbm9yZWRTZXR0aW5ncywgZm9ybWF0dGluZ09wdGlvbnMpIDogbnVsbCxcblx0XHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk1vZGlmaWVkLFxuXHRcdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk1vZGlmaWVkLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBSZXNvdXJjZTogJHtyZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGFwcGx5UmVzdWx0KHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEsIGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSB8IG51bGwsIHJlc291cmNlUHJldmlld3M6IFtJU2V0dGluZ3NSZXNvdXJjZVByZXZpZXcsIElBY2NlcHRSZXN1bHRdW10sIGZvcmNlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyBmaWxlQ29udGVudCB9ID0gcmVzb3VyY2VQcmV2aWV3c1swXVswXTtcblx0XHRsZXQgeyBjb250ZW50LCBsb2NhbENoYW5nZSwgcmVtb3RlQ2hhbmdlIH0gPSByZXNvdXJjZVByZXZpZXdzWzBdWzFdO1xuXG5cdFx0aWYgKGxvY2FsQ2hhbmdlID09PSBDaGFuZ2UuTm9uZSAmJiByZW1vdGVDaGFuZ2UgPT09IENoYW5nZS5Ob25lKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogTm8gY2hhbmdlcyBmb3VuZCBkdXJpbmcgc3luY2hyb25pemluZyBzZXR0aW5ncy5gKTtcblx0XHR9XG5cblx0XHRjb250ZW50ID0gY29udGVudCA/IGNvbnRlbnQudHJpbSgpIDogJ3t9Jztcblx0XHRjb250ZW50ID0gY29udGVudCB8fCAne30nO1xuXHRcdHRoaXMudmFsaWRhdGVDb250ZW50KGNvbnRlbnQpO1xuXG5cdFx0aWYgKGxvY2FsQ2hhbmdlICE9PSBDaGFuZ2UuTm9uZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyBsb2NhbCBzZXR0aW5ncy4uLmApO1xuXHRcdFx0aWYgKGZpbGVDb250ZW50KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuYmFja3VwTG9jYWwoSlNPTi5zdHJpbmdpZnkodGhpcy50b1NldHRpbmdzU3luY0NvbnRlbnQoZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSkpKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTG9jYWxGaWxlQ29udGVudChjb250ZW50LCBmaWxlQ29udGVudCwgZm9yY2UpO1xuXHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5yZWxvYWRDb25maWd1cmF0aW9uKENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCBsb2NhbCBzZXR0aW5nc2ApO1xuXHRcdH1cblxuXHRcdGlmIChyZW1vdGVDaGFuZ2UgIT09IENoYW5nZS5Ob25lKSB7XG5cdFx0XHRjb25zdCBmb3JtYXRVdGlscyA9IGF3YWl0IHRoaXMuZ2V0Rm9ybWF0dGluZ09wdGlvbnMoKTtcblx0XHRcdC8vIFVwZGF0ZSBpZ25vcmVkIHNldHRpbmdzIGZyb20gcmVtb3RlXG5cdFx0XHRjb25zdCByZW1vdGVTZXR0aW5nc1N5bmNDb250ZW50ID0gdGhpcy5nZXRTZXR0aW5nc1N5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhKTtcblx0XHRcdGNvbnN0IGlnbm9yZWRTZXR0aW5ncyA9IGF3YWl0IHRoaXMuZ2V0SWdub3JlZFNldHRpbmdzKGNvbnRlbnQpO1xuXHRcdFx0Y29udGVudCA9IHVwZGF0ZUlnbm9yZWRTZXR0aW5ncyhjb250ZW50LCByZW1vdGVTZXR0aW5nc1N5bmNDb250ZW50ID8gcmVtb3RlU2V0dGluZ3NTeW5jQ29udGVudC5zZXR0aW5ncyA6ICd7fScsIGlnbm9yZWRTZXR0aW5ncywgZm9ybWF0VXRpbHMpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyByZW1vdGUgc2V0dGluZ3MuLi5gKTtcblx0XHRcdHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGhpcy51cGRhdGVSZW1vdGVVc2VyRGF0YShKU09OLnN0cmluZ2lmeSh0aGlzLnRvU2V0dGluZ3NTeW5jQ29udGVudChjb250ZW50KSksIGZvcmNlID8gbnVsbCA6IHJlbW90ZVVzZXJEYXRhLnJlZik7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCByZW1vdGUgc2V0dGluZ3NgKTtcblx0XHR9XG5cblx0XHQvLyBEZWxldGUgdGhlIHByZXZpZXdcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwodGhpcy5wcmV2aWV3UmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGUpIHsgLyogaWdub3JlICovIH1cblxuXHRcdGlmIChsYXN0U3luY1VzZXJEYXRhPy5yZWYgIT09IHJlbW90ZVVzZXJEYXRhLnJlZikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyBsYXN0IHN5bmNocm9uaXplZCBzZXR0aW5ncy4uLmApO1xuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVMYXN0U3luY1VzZXJEYXRhKHJlbW90ZVVzZXJEYXRhKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGVkIGxhc3Qgc3luY2hyb25pemVkIHNldHRpbmdzYCk7XG5cdFx0fVxuXG5cdH1cblxuXHRhc3luYyBoYXNMb2NhbERhdGEoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxvY2FsRmlsZUNvbnRlbnQgPSBhd2FpdCB0aGlzLmdldExvY2FsRmlsZUNvbnRlbnQoKTtcblx0XHRcdGlmIChsb2NhbEZpbGVDb250ZW50KSB7XG5cdFx0XHRcdHJldHVybiAhaXNFbXB0eShsb2NhbEZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVDb250ZW50KHVyaTogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwodGhpcy5yZW1vdGVSZXNvdXJjZSwgdXJpKVxuXHRcdFx0fHwgdGhpcy5leHRVcmkuaXNFcXVhbCh0aGlzLmxvY2FsUmVzb3VyY2UsIHVyaSlcblx0XHRcdHx8IHRoaXMuZXh0VXJpLmlzRXF1YWwodGhpcy5hY2NlcHRlZFJlc291cmNlLCB1cmkpXG5cdFx0XHR8fCB0aGlzLmV4dFVyaS5pc0VxdWFsKHRoaXMuYmFzZVJlc291cmNlLCB1cmkpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlUHJldmlld0NvbnRlbnQodXJpKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZVByZXZpZXdDb250ZW50KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0XHRsZXQgY29udGVudCA9IGF3YWl0IHN1cGVyLnJlc29sdmVQcmV2aWV3Q29udGVudChyZXNvdXJjZSk7XG5cdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdGNvbnN0IGZvcm1hdFV0aWxzID0gYXdhaXQgdGhpcy5nZXRGb3JtYXR0aW5nT3B0aW9ucygpO1xuXHRcdFx0Ly8gcmVtb3ZlIGlnbm9yZWQgc2V0dGluZ3MgZnJvbSB0aGUgcHJldmlldyBjb250ZW50XG5cdFx0XHRjb25zdCBpZ25vcmVkU2V0dGluZ3MgPSBhd2FpdCB0aGlzLmdldElnbm9yZWRTZXR0aW5ncygpO1xuXHRcdFx0Y29udGVudCA9IHVwZGF0ZUlnbm9yZWRTZXR0aW5ncyhjb250ZW50LCAne30nLCBpZ25vcmVkU2V0dGluZ3MsIGZvcm1hdFV0aWxzKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFNldHRpbmdzU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSk6IElTZXR0aW5nc1N5bmNDb250ZW50IHwgbnVsbCB7XG5cdFx0cmV0dXJuIHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhID8gdGhpcy5wYXJzZVNldHRpbmdzU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEuY29udGVudCkgOiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZVNldHRpbmdzU3luY0NvbnRlbnQoc3luY0NvbnRlbnQ6IHN0cmluZyk6IElTZXR0aW5nc1N5bmNDb250ZW50IHwgbnVsbCB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBwYXJzZVNldHRpbmdzU3luY0NvbnRlbnQoc3luY0NvbnRlbnQpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHRvU2V0dGluZ3NTeW5jQ29udGVudChzZXR0aW5nczogc3RyaW5nKTogSVNldHRpbmdzU3luY0NvbnRlbnQge1xuXHRcdHJldHVybiB7IHNldHRpbmdzIH07XG5cdH1cblxuXHRwcml2YXRlIGNvcmVJZ25vcmVkU2V0dGluZ3M6IFByb21pc2U8c3RyaW5nW10+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIHN5c3RlbUV4dGVuc2lvbnNJZ25vcmVkU2V0dGluZ3M6IFByb21pc2U8c3RyaW5nW10+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIHVzZXJFeHRlbnNpb25zSWdub3JlZFNldHRpbmdzOiBQcm9taXNlPHN0cmluZ1tdPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhc3luYyBnZXRJZ25vcmVkU2V0dGluZ3MoY29udGVudD86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRpZiAoIXRoaXMuY29yZUlnbm9yZWRTZXR0aW5ncykge1xuXHRcdFx0dGhpcy5jb3JlSWdub3JlZFNldHRpbmdzID0gdGhpcy51c2VyRGF0YVN5bmNVdGlsU2VydmljZS5yZXNvbHZlRGVmYXVsdENvcmVJZ25vcmVkU2V0dGluZ3MoKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnN5c3RlbUV4dGVuc2lvbnNJZ25vcmVkU2V0dGluZ3MpIHtcblx0XHRcdHRoaXMuc3lzdGVtRXh0ZW5zaW9uc0lnbm9yZWRTZXR0aW5ncyA9IHRoaXMuZ2V0SWdub3JlZFNldHRpbmdGb3JTeXN0ZW1FeHRlbnNpb25zKCk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy51c2VyRXh0ZW5zaW9uc0lnbm9yZWRTZXR0aW5ncykge1xuXHRcdFx0dGhpcy51c2VyRXh0ZW5zaW9uc0lnbm9yZWRTZXR0aW5ncyA9IHRoaXMuZ2V0SWdub3JlZFNldHRpbmdGb3JVc2VyRXh0ZW5zaW9ucygpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueTxhbnk+KFxuXHRcdFx0XHRFdmVudC5maWx0ZXIodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZEluc3RhbGxFeHRlbnNpb25zLCAoZSA9PiBlLnNvbWUoKHsgbG9jYWwgfSkgPT4gISFsb2NhbCkpKSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVbmluc3RhbGxFeHRlbnNpb24sIChlID0+ICFlLmVycm9yKSkpKCgpID0+IHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLnVzZXJFeHRlbnNpb25zSWdub3JlZFNldHRpbmdzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9KSk7XG5cdFx0fVxuXHRcdGNvbnN0IGRlZmF1bHRJZ25vcmVkU2V0dGluZ3MgPSAoYXdhaXQgUHJvbWlzZS5hbGwoW3RoaXMuY29yZUlnbm9yZWRTZXR0aW5ncywgdGhpcy5zeXN0ZW1FeHRlbnNpb25zSWdub3JlZFNldHRpbmdzLCB0aGlzLnVzZXJFeHRlbnNpb25zSWdub3JlZFNldHRpbmdzXSkpLmZsYXQoKTtcblx0XHRyZXR1cm4gZ2V0SWdub3JlZFNldHRpbmdzKGRlZmF1bHRJZ25vcmVkU2V0dGluZ3MsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRJZ25vcmVkU2V0dGluZ0ZvclN5c3RlbUV4dGVuc2lvbnMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGNvbnN0IHN5c3RlbUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlN5c3RlbSk7XG5cdFx0cmV0dXJuIGRpc3RpbmN0KHN5c3RlbUV4dGVuc2lvbnMubWFwKGUgPT4gZ2V0SWdub3JlZFNldHRpbmdzRm9yRXh0ZW5zaW9uKGUubWFuaWZlc3QpKS5mbGF0KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRJZ25vcmVkU2V0dGluZ0ZvclVzZXJFeHRlbnNpb25zKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCB1c2VyRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKEV4dGVuc2lvblR5cGUuVXNlciwgdGhpcy5wcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0cmV0dXJuIGRpc3RpbmN0KHVzZXJFeHRlbnNpb25zLm1hcChlID0+IGdldElnbm9yZWRTZXR0aW5nc0ZvckV4dGVuc2lvbihlLm1hbmlmZXN0KSkuZmxhdCgpKTtcblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVDb250ZW50KGNvbnRlbnQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmhhc0Vycm9ycyhjb250ZW50LCBmYWxzZSkpIHtcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNFcnJvcihsb2NhbGl6ZSgnZXJyb3JJbnZhbGlkU2V0dGluZ3MnLCBcIlVuYWJsZSB0byBzeW5jIHNldHRpbmdzIGFzIHRoZXJlIGFyZSBlcnJvcnMvd2FybmluZyBpbiBzZXR0aW5ncyBmaWxlLlwiKSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkxvY2FsSW52YWxpZENvbnRlbnQsIHRoaXMucmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc0luaXRpYWxpemVyIGV4dGVuZHMgQWJzdHJhY3RJbml0aWFsaXplciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgbG9nU2VydmljZSwgZmlsZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGRvSW5pdGlhbGl6ZShyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2V0dGluZ3NTeW5jQ29udGVudCA9IHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhID8gdGhpcy5wYXJzZVNldHRpbmdzU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEuY29udGVudCkgOiBudWxsO1xuXHRcdGlmICghc2V0dGluZ3NTeW5jQ29udGVudCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1NraXBwaW5nIGluaXRpYWxpemluZyBzZXR0aW5ncyBiZWNhdXNlIHJlbW90ZSBzZXR0aW5ncyBkb2VzIG5vdCBleGlzdC4nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc0VtcHR5ID0gYXdhaXQgdGhpcy5pc0VtcHR5KCk7XG5cdFx0aWYgKCFpc0VtcHR5KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnU2tpcHBpbmcgaW5pdGlhbGl6aW5nIHNldHRpbmdzIGJlY2F1c2UgbG9jYWwgc2V0dGluZ3MgZXhpc3QuJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKHNldHRpbmdzU3luY0NvbnRlbnQuc2V0dGluZ3MpKTtcblxuXHRcdGF3YWl0IHRoaXMudXBkYXRlTGFzdFN5bmNVc2VyRGF0YShyZW1vdGVVc2VyRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGlzRW1wdHkoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGZpbGVDb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UpO1xuXHRcdFx0cmV0dXJuIGlzRW1wdHkoZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKS50cmltKCkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyZXR1cm4gKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZVNldHRpbmdzU3luY0NvbnRlbnQoc3luY0NvbnRlbnQ6IHN0cmluZyk6IElTZXR0aW5nc1N5bmNDb250ZW50IHwgbnVsbCB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBwYXJzZVNldHRpbmdzU3luY0NvbnRlbnQoc3luY0NvbnRlbnQpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGFBQWE7QUFFdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMscUJBQXFCO0FBQzlCLFNBQTZCLHFCQUFxQixvQkFBb0I7QUFDdEUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBMkIsZ0NBQWdDO0FBQzNELFNBQVMscUJBQXFCLG9DQUF1RjtBQUNySCxTQUFTLG9CQUFvQixTQUFTLE9BQU8sNkJBQTZCO0FBQzFFLFNBQVMsUUFBeUIsZ0NBQW1GLHlCQUF5QixnQ0FBZ0MsMkJBQTJCLDBCQUEwQixjQUFjLG1CQUFtQix1QkFBdUIsb0NBQW9DLHVCQUF1QixzQ0FBaUQ7QUFVdlksU0FBUyxzQkFBc0IsT0FBMkM7QUFDekUsU0FBTyxVQUNGLE1BQU0sWUFBWSxPQUFPLE1BQU0sYUFBYSxhQUM3QyxPQUFPLEtBQUssS0FBSyxFQUFFLFdBQVc7QUFDbkM7QUFFTyxTQUFTLHlCQUF5QixhQUEyQztBQUNuRixRQUFNLFNBQStCLEtBQUssTUFBTSxXQUFXO0FBQzNELFNBQU8sc0JBQXNCLE1BQU0sSUFBSTtBQUFBO0FBQUEsSUFBdUIsRUFBRSxVQUFVLFlBQVk7QUFBQTtBQUN2RjtB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R0FBRztBQUNuQyxZQUFNLElBQUksa0JBQWtCLFNBQVMsd0JBQXdCLHVFQUF1RSxHQUFHLHNCQUFzQixxQkFBcUIsS0FBSyxRQUFRO0FBQUEsSUFDaE07QUFBQSxFQUNEO0FBRUQ7QUExVGEsdUJBQU47QUFBQSxFQWFKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXhCVTtBQTRUTixJQUFNLHNCQUFOLGNBQWtDLG9CQUFvQjtBQUFBLEVBRTVELFlBQ2UsYUFDWSx5QkFDTCxvQkFDSSxZQUNSLGdCQUNJLG9CQUNwQjtBQUNELFVBQU0sYUFBYSxVQUFVLHlCQUF5QixvQkFBb0IsWUFBWSxhQUFhLGdCQUFnQixrQkFBa0I7QUFBQSxFQUN0STtBQUFBLEVBRUEsTUFBZ0IsYUFBYSxnQkFBZ0Q7QUFDNUUsVUFBTSxzQkFBc0IsZUFBZSxXQUFXLEtBQUsseUJBQXlCLGVBQWUsU0FBUyxPQUFPLElBQUk7QUFDdkgsUUFBSSxDQUFDLHFCQUFxQjtBQUN6QixXQUFLLFdBQVcsS0FBSyx3RUFBd0U7QUFDN0Y7QUFBQSxJQUNEO0FBRUEsVUFBTUMsV0FBVSxNQUFNLEtBQUssUUFBUTtBQUNuQyxRQUFJLENBQUNBLFVBQVM7QUFDYixXQUFLLFdBQVcsS0FBSyw4REFBOEQ7QUFDbkY7QUFBQSxJQUNEO0FBRUEsVUFBTSxLQUFLLFlBQVksVUFBVSxLQUFLLHdCQUF3QixlQUFlLGtCQUFrQixTQUFTLFdBQVcsb0JBQW9CLFFBQVEsQ0FBQztBQUVoSixVQUFNLEtBQUssdUJBQXVCLGNBQWM7QUFBQSxFQUNqRDtBQUFBLEVBRUEsTUFBYyxVQUE0QjtBQUN6QyxRQUFJO0FBQ0gsWUFBTSxjQUFjLE1BQU0sS0FBSyxZQUFZLFNBQVMsS0FBSyx3QkFBd0IsZUFBZSxnQkFBZ0I7QUFDaEgsYUFBTyxRQUFRLFlBQVksTUFBTSxTQUFTLEVBQUUsS0FBSyxDQUFDO0FBQUEsSUFDbkQsU0FBUyxPQUFPO0FBQ2YsYUFBNEIsTUFBTyx3QkFBd0Isb0JBQW9CO0FBQUEsSUFDaEY7QUFBQSxFQUNEO0FBQUEsRUFFUSx5QkFBeUIsYUFBa0Q7QUFDbEYsUUFBSTtBQUNILGFBQU8seUJBQXlCLFdBQVc7QUFBQSxJQUM1QyxTQUFTLEdBQUc7QUFDWCxXQUFLLFdBQVcsTUFBTSxDQUFDO0FBQUEsSUFDeEI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUVEO0FBakRhLHNCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FSVTsiLAogICJuYW1lcyI6IFsibG9jYWxDb250ZW50IiwgImlzRW1wdHkiXQp9Cg==
