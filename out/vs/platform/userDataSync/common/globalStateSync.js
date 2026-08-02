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
import { VSBuffer } from "../../../base/common/buffer.js";
import { getErrorMessage } from "../../../base/common/errors.js";
import { Event } from "../../../base/common/event.js";
import { parse } from "../../../base/common/json.js";
import { toFormattedString } from "../../../base/common/jsonFormatter.js";
import { isWeb } from "../../../base/common/platform.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { getServiceMachineId } from "../../externalServices/common/serviceMachineId.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { AbstractInitializer, AbstractSynchroniser, getSyncResourceLogLabel, isSyncData } from "./abstractSynchronizer.js";
import { edit } from "./content.js";
import { merge } from "./globalStateMerge.js";
import { ALL_SYNC_RESOURCES, Change, createSyncHeaders, getEnablementKey, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, SYNC_SERVICE_URL_TYPE, UserDataSyncError, UserDataSyncErrorCode, USER_DATA_SYNC_SCHEME } from "./userDataSync.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { IUserDataProfileStorageService } from "../../userDataProfile/common/userDataProfileStorageService.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
const argvStoragePrefx = "globalState.argv.";
const argvProperties = ["locale"];
function stringify(globalState, format) {
  const storageKeys = globalState.storage ? Object.keys(globalState.storage).sort() : [];
  const storage = {};
  storageKeys.forEach((key) => storage[key] = globalState.storage[key]);
  globalState.storage = storage;
  return format ? toFormattedString(globalState, {}) : JSON.stringify(globalState);
}
const GLOBAL_STATE_DATA_VERSION = 1;
let GlobalStateSynchroniser = class extends AbstractSynchroniser {
  constructor(profile, collection, userDataProfileStorageService, fileService, userDataSyncStoreService, userDataSyncLocalStoreService, logService, environmentService, userDataSyncEnablementService, telemetryService, configurationService, storageService, uriIdentityService, instantiationService) {
    super({ syncResource: SyncResource.GlobalState, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
    this.userDataProfileStorageService = userDataProfileStorageService;
    this.version = GLOBAL_STATE_DATA_VERSION;
    this.previewResource = this.extUri.joinPath(this.syncPreviewFolder, "globalState.json");
    this.baseResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" });
    this.localResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" });
    this.remoteResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" });
    this.acceptedResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" });
    this.localGlobalStateProvider = instantiationService.createInstance(LocalGlobalStateProvider);
    this._register(fileService.watch(this.extUri.dirname(this.environmentService.argvResource)));
    this._register(
      Event.any(
        /* Locale change */
        Event.filter(fileService.onDidFilesChange, (e) => e.contains(this.environmentService.argvResource)),
        Event.filter(userDataProfileStorageService.onDidChange, (e) => {
          if (e.targetChanges.some((profile2) => this.syncResource.profile.id === profile2.id)) {
            return true;
          }
          if (e.valueChanges.some(({ profile: profile2, changes }) => this.syncResource.profile.id === profile2.id && changes.some((change) => change.target === StorageTarget.USER))) {
            return true;
          }
          return false;
        })
      )((() => this.triggerLocalChange()))
    );
  }
  async generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine) {
    const remoteGlobalState = remoteUserData.syncData ? JSON.parse(remoteUserData.syncData.content) : null;
    lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
    const lastSyncGlobalState = lastSyncUserData && lastSyncUserData.syncData ? JSON.parse(lastSyncUserData.syncData.content) : null;
    const localGlobalState = await this.localGlobalStateProvider.getLocalGlobalState(this.syncResource.profile);
    if (remoteGlobalState) {
      this.logService.trace(`${this.syncResourceLogLabel}: Merging remote ui state with local ui state...`);
    } else {
      this.logService.trace(`${this.syncResourceLogLabel}: Remote ui state does not exist. Synchronizing ui state for the first time.`);
    }
    const storageKeys = await this.getStorageKeys(lastSyncGlobalState);
    const { local, remote } = merge(localGlobalState.storage, remoteGlobalState ? remoteGlobalState.storage : null, lastSyncGlobalState ? lastSyncGlobalState.storage : null, storageKeys, this.logService);
    const previewResult = {
      content: null,
      local,
      remote,
      localChange: Object.keys(local.added).length > 0 || Object.keys(local.updated).length > 0 || local.removed.length > 0 ? Change.Modified : Change.None,
      remoteChange: remote.all !== null ? Change.Modified : Change.None
    };
    const localContent = stringify(localGlobalState, false);
    return [{
      baseResource: this.baseResource,
      baseContent: lastSyncGlobalState ? stringify(lastSyncGlobalState, false) : localContent,
      localResource: this.localResource,
      localContent,
      localUserData: localGlobalState,
      remoteResource: this.remoteResource,
      remoteContent: remoteGlobalState ? stringify(remoteGlobalState, false) : null,
      previewResource: this.previewResource,
      previewResult,
      localChange: previewResult.localChange,
      remoteChange: previewResult.remoteChange,
      acceptedResource: this.acceptedResource,
      storageKeys
    }];
  }
  async hasRemoteChanged(lastSyncUserData) {
    const lastSyncGlobalState = lastSyncUserData.syncData ? JSON.parse(lastSyncUserData.syncData.content) : null;
    if (lastSyncGlobalState === null) {
      return true;
    }
    const localGlobalState = await this.localGlobalStateProvider.getLocalGlobalState(this.syncResource.profile);
    const storageKeys = await this.getStorageKeys(lastSyncGlobalState);
    const { remote } = merge(localGlobalState.storage, lastSyncGlobalState.storage, lastSyncGlobalState.storage, storageKeys, this.logService);
    return remote.all !== null;
  }
  async getMergeResult(resourcePreview, token) {
    return { ...resourcePreview.previewResult, hasConflicts: false };
  }
  async getAcceptResult(resourcePreview, resource, content, token) {
    if (this.extUri.isEqual(resource, this.localResource)) {
      return this.acceptLocal(resourcePreview);
    }
    if (this.extUri.isEqual(resource, this.remoteResource)) {
      return this.acceptRemote(resourcePreview);
    }
    if (this.extUri.isEqual(resource, this.previewResource)) {
      return resourcePreview.previewResult;
    }
    throw new Error(`Invalid Resource: ${resource.toString()}`);
  }
  async acceptLocal(resourcePreview) {
    if (resourcePreview.remoteContent !== null) {
      const remoteGlobalState = JSON.parse(resourcePreview.remoteContent);
      const { local, remote } = merge(resourcePreview.localUserData.storage, remoteGlobalState.storage, remoteGlobalState.storage, resourcePreview.storageKeys, this.logService);
      return {
        content: resourcePreview.remoteContent,
        local,
        remote,
        localChange: Change.None,
        remoteChange: remote.all !== null ? Change.Modified : Change.None
      };
    } else {
      return {
        content: resourcePreview.localContent,
        local: { added: {}, removed: [], updated: {} },
        remote: { added: Object.keys(resourcePreview.localUserData.storage), removed: [], updated: [], all: resourcePreview.localUserData.storage },
        localChange: Change.None,
        remoteChange: Change.Modified
      };
    }
  }
  async acceptRemote(resourcePreview) {
    if (resourcePreview.remoteContent !== null) {
      const remoteGlobalState = JSON.parse(resourcePreview.remoteContent);
      const { local, remote } = merge(resourcePreview.localUserData.storage, remoteGlobalState.storage, resourcePreview.localUserData.storage, resourcePreview.storageKeys, this.logService);
      return {
        content: resourcePreview.remoteContent,
        local,
        remote,
        localChange: Object.keys(local.added).length > 0 || Object.keys(local.updated).length > 0 || local.removed.length > 0 ? Change.Modified : Change.None,
        remoteChange: Change.None
      };
    } else {
      return {
        content: resourcePreview.remoteContent,
        local: { added: {}, removed: [], updated: {} },
        remote: { added: [], removed: [], updated: [], all: null },
        localChange: Change.None,
        remoteChange: Change.None
      };
    }
  }
  async applyResult(remoteUserData, lastSyncUserData, resourcePreviews, force) {
    const { localUserData } = resourcePreviews[0][0];
    const { local, remote, localChange, remoteChange } = resourcePreviews[0][1];
    if (localChange === Change.None && remoteChange === Change.None) {
      this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing ui state.`);
    }
    if (localChange !== Change.None) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating local ui state...`);
      await this.backupLocal(JSON.stringify(localUserData));
      await this.localGlobalStateProvider.writeLocalGlobalState(local, this.syncResource.profile);
      this.logService.info(`${this.syncResourceLogLabel}: Updated local ui state`);
    }
    if (remoteChange !== Change.None) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating remote ui state...`);
      const content = JSON.stringify({ storage: remote.all });
      remoteUserData = await this.updateRemoteUserData(content, force ? null : remoteUserData.ref);
      this.logService.info(`${this.syncResourceLogLabel}: Updated remote ui state.${remote.added.length ? ` Added: ${remote.added}.` : ""}${remote.updated.length ? ` Updated: ${remote.updated}.` : ""}${remote.removed.length ? ` Removed: ${remote.removed}.` : ""}`);
    }
    if (lastSyncUserData?.ref !== remoteUserData.ref) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized ui state...`);
      await this.updateLastSyncUserData(remoteUserData);
      this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized ui state`);
    }
  }
  async resolveContent(uri) {
    if (this.extUri.isEqual(this.remoteResource, uri) || this.extUri.isEqual(this.baseResource, uri) || this.extUri.isEqual(this.localResource, uri) || this.extUri.isEqual(this.acceptedResource, uri)) {
      const content = await this.resolvePreviewContent(uri);
      return content ? stringify(JSON.parse(content), true) : content;
    }
    return null;
  }
  async hasLocalData() {
    try {
      const { storage } = await this.localGlobalStateProvider.getLocalGlobalState(this.syncResource.profile);
      if (Object.keys(storage).length > 1 || storage[`${argvStoragePrefx}.locale`]?.value !== "en") {
        return true;
      }
    } catch (error) {
    }
    return false;
  }
  async getStorageKeys(lastSyncGlobalState) {
    const storageData = await this.userDataProfileStorageService.readStorageData(this.syncResource.profile);
    const user = [], machine = [];
    for (const [key, value] of storageData) {
      if (value.target === StorageTarget.USER) {
        user.push(key);
      } else if (value.target === StorageTarget.MACHINE) {
        machine.push(key);
      }
    }
    const registered = [...user, ...machine];
    const unregistered = lastSyncGlobalState?.storage ? Object.keys(lastSyncGlobalState.storage).filter((key) => !key.startsWith(argvStoragePrefx) && !registered.includes(key) && storageData.get(key) !== void 0) : [];
    if (!isWeb) {
      const keysSyncedOnlyInWeb = [...ALL_SYNC_RESOURCES.map((resource) => getEnablementKey(resource)), SYNC_SERVICE_URL_TYPE];
      unregistered.push(...keysSyncedOnlyInWeb);
      machine.push(...keysSyncedOnlyInWeb);
    }
    return { user, machine, unregistered };
  }
};
GlobalStateSynchroniser = __decorateClass([
  __decorateParam(2, IUserDataProfileStorageService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IUserDataSyncStoreService),
  __decorateParam(5, IUserDataSyncLocalStoreService),
  __decorateParam(6, IUserDataSyncLogService),
  __decorateParam(7, IEnvironmentService),
  __decorateParam(8, IUserDataSyncEnablementService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IStorageService),
  __decorateParam(12, IUriIdentityService),
  __decorateParam(13, IInstantiationService)
], GlobalStateSynchroniser);
let LocalGlobalStateProvider = class {
  constructor(fileService, environmentService, userDataProfileStorageService, logService) {
    this.fileService = fileService;
    this.environmentService = environmentService;
    this.userDataProfileStorageService = userDataProfileStorageService;
    this.logService = logService;
  }
  async getLocalGlobalState(profile) {
    const storage = {};
    if (profile.isDefault) {
      const argvContent = await this.getLocalArgvContent();
      const argvValue = parse(argvContent);
      for (const argvProperty of argvProperties) {
        if (argvValue[argvProperty] !== void 0) {
          storage[`${argvStoragePrefx}${argvProperty}`] = { version: 1, value: argvValue[argvProperty] };
        }
      }
    }
    const storageData = await this.userDataProfileStorageService.readStorageData(profile);
    for (const [key, value] of storageData) {
      if (value.value && value.target === StorageTarget.USER) {
        storage[key] = { version: 1, value: value.value, scope: value.scope };
      }
    }
    return { storage };
  }
  async getLocalArgvContent() {
    try {
      this.logService.debug("GlobalStateSync#getLocalArgvContent", this.environmentService.argvResource);
      const content = await this.fileService.readFile(this.environmentService.argvResource);
      this.logService.debug("GlobalStateSync#getLocalArgvContent - Resolved", this.environmentService.argvResource);
      return content.value.toString();
    } catch (error) {
      this.logService.debug(getErrorMessage(error));
    }
    return "{}";
  }
  async writeLocalGlobalState({ added, removed, updated }, profile) {
    const syncResourceLogLabel = getSyncResourceLogLabel(SyncResource.GlobalState, profile);
    const argv = {};
    const updatedProfileStorage = /* @__PURE__ */ new Map();
    const updatedSharedStorage = profile.isDefault ? /* @__PURE__ */ new Map() : void 0;
    const storageData = await this.userDataProfileStorageService.readStorageData(profile);
    const handleUpdatedStorage = (keys, storage) => {
      for (const key of keys) {
        if (key.startsWith(argvStoragePrefx)) {
          argv[key.substring(argvStoragePrefx.length)] = storage ? storage[key].value : void 0;
          continue;
        }
        if (storage) {
          const storageValue = storage[key];
          if (storageValue.value !== storageData.get(key)?.value) {
            const targetMap = updatedSharedStorage && storageValue.scope === StorageScope.APPLICATION_SHARED ? updatedSharedStorage : updatedProfileStorage;
            targetMap.set(key, storageValue.value);
          }
        } else {
          if (storageData.get(key) !== void 0) {
            const targetMap = updatedSharedStorage && storageData.get(key)?.scope === StorageScope.APPLICATION_SHARED ? updatedSharedStorage : updatedProfileStorage;
            targetMap.set(key, void 0);
          }
        }
      }
    };
    handleUpdatedStorage(Object.keys(added), added);
    handleUpdatedStorage(Object.keys(updated), updated);
    handleUpdatedStorage(removed);
    if (Object.keys(argv).length) {
      this.logService.trace(`${syncResourceLogLabel}: Updating locale...`);
      const argvContent = await this.getLocalArgvContent();
      let content = argvContent;
      for (const argvProperty of Object.keys(argv)) {
        content = edit(content, [argvProperty], argv[argvProperty], {});
      }
      if (argvContent !== content) {
        this.logService.trace(`${syncResourceLogLabel}: Updating locale...`);
        await this.fileService.writeFile(this.environmentService.argvResource, VSBuffer.fromString(content));
        this.logService.info(`${syncResourceLogLabel}: Updated locale.`);
      }
      this.logService.info(`${syncResourceLogLabel}: Updated locale`);
    }
    if (updatedProfileStorage.size) {
      this.logService.trace(`${syncResourceLogLabel}: Updating global state...`);
      await this.userDataProfileStorageService.updateStorageData(profile, updatedProfileStorage, StorageTarget.USER);
      this.logService.info(`${syncResourceLogLabel}: Updated global state`, [...updatedProfileStorage.keys()]);
    }
    if (updatedSharedStorage?.size) {
      this.logService.trace(`${syncResourceLogLabel}: Updating application shared state...`);
      await this.userDataProfileStorageService.updateStorageData(profile, updatedSharedStorage, StorageTarget.USER, StorageScope.APPLICATION_SHARED);
      this.logService.info(`${syncResourceLogLabel}: Updated application shared state`, [...updatedSharedStorage.keys()]);
    }
  }
};
LocalGlobalStateProvider = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, IUserDataProfileStorageService),
  __decorateParam(3, IUserDataSyncLogService)
], LocalGlobalStateProvider);
let GlobalStateInitializer = class extends AbstractInitializer {
  constructor(storageService, fileService, userDataProfilesService, environmentService, logService, uriIdentityService) {
    super(SyncResource.GlobalState, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
  }
  async doInitialize(remoteUserData) {
    const remoteGlobalState = remoteUserData.syncData ? JSON.parse(remoteUserData.syncData.content) : null;
    if (!remoteGlobalState) {
      this.logService.info("Skipping initializing global state because remote global state does not exist.");
      return;
    }
    const argv = {};
    const isDefaultProfile = this.storageService.hasScope(this.userDataProfilesService.defaultProfile);
    const storage = {};
    for (const key of Object.keys(remoteGlobalState.storage)) {
      if (key.startsWith(argvStoragePrefx)) {
        argv[key.substring(argvStoragePrefx.length)] = remoteGlobalState.storage[key].value;
      } else {
        const isSharedScope = remoteGlobalState.storage[key].scope === StorageScope.APPLICATION_SHARED;
        if (isSharedScope && !isDefaultProfile) {
          continue;
        }
        const scope = isSharedScope ? StorageScope.APPLICATION_SHARED : StorageScope.PROFILE;
        if (this.storageService.get(key, scope) === void 0) {
          storage[key] = { value: remoteGlobalState.storage[key].value, scope };
        }
      }
    }
    if (Object.keys(argv).length) {
      let content = "{}";
      try {
        const fileContent = await this.fileService.readFile(this.environmentService.argvResource);
        content = fileContent.value.toString();
      } catch (error) {
      }
      for (const argvProperty of Object.keys(argv)) {
        content = edit(content, [argvProperty], argv[argvProperty], {});
      }
      await this.fileService.writeFile(this.environmentService.argvResource, VSBuffer.fromString(content));
    }
    if (Object.keys(storage).length) {
      const storageEntries = [];
      for (const key of Object.keys(storage)) {
        storageEntries.push({ key, value: storage[key].value, scope: storage[key].scope, target: StorageTarget.USER });
      }
      this.storageService.storeAll(storageEntries, true);
    }
  }
};
GlobalStateInitializer = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IUserDataProfilesService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, IUserDataSyncLogService),
  __decorateParam(5, IUriIdentityService)
], GlobalStateInitializer);
let UserDataSyncStoreTypeSynchronizer = class {
  constructor(userDataSyncStoreClient, storageService, environmentService, fileService, logService) {
    this.userDataSyncStoreClient = userDataSyncStoreClient;
    this.storageService = storageService;
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.logService = logService;
  }
  getSyncStoreType(userData) {
    const remoteGlobalState = this.parseGlobalState(userData);
    return remoteGlobalState?.storage[SYNC_SERVICE_URL_TYPE]?.value;
  }
  async sync(userDataSyncStoreType) {
    const syncHeaders = createSyncHeaders(generateUuid());
    try {
      return await this.doSync(userDataSyncStoreType, syncHeaders);
    } catch (e) {
      if (e instanceof UserDataSyncError) {
        switch (e.code) {
          case UserDataSyncErrorCode.PreconditionFailed:
            this.logService.info(`Failed to synchronize UserDataSyncStoreType as there is a new remote version available. Synchronizing again...`);
            return this.doSync(userDataSyncStoreType, syncHeaders);
        }
      }
      throw e;
    }
  }
  async doSync(userDataSyncStoreType, syncHeaders) {
    const globalStateUserData = await this.userDataSyncStoreClient.readResource(SyncResource.GlobalState, null, void 0, syncHeaders);
    const remoteGlobalState = this.parseGlobalState(globalStateUserData) || { storage: {} };
    remoteGlobalState.storage[SYNC_SERVICE_URL_TYPE] = { value: userDataSyncStoreType, version: GLOBAL_STATE_DATA_VERSION };
    const machineId = await getServiceMachineId(this.environmentService, this.fileService, this.storageService);
    const syncDataToUpdate = { version: GLOBAL_STATE_DATA_VERSION, machineId, content: stringify(remoteGlobalState, false) };
    await this.userDataSyncStoreClient.writeResource(SyncResource.GlobalState, JSON.stringify(syncDataToUpdate), globalStateUserData.ref, void 0, syncHeaders);
  }
  parseGlobalState({ content }) {
    if (!content) {
      return null;
    }
    const syncData = JSON.parse(content);
    if (isSyncData(syncData)) {
      return syncData ? JSON.parse(syncData.content) : null;
    }
    throw new Error("Invalid remote data");
  }
};
UserDataSyncStoreTypeSynchronizer = __decorateClass([
  __decorateParam(1, IStorageService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IFileService),
  __decorateParam(4, ILogService)
], UserDataSyncStoreTypeSynchronizer);
export {
  GlobalStateInitializer,
  GlobalStateSynchroniser,
  LocalGlobalStateProvider,
  UserDataSyncStoreTypeSynchronizer,
  stringify
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vZ2xvYmFsU3RhdGVTeW5jLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBnZXRFcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgdG9Gb3JtYXR0ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uRm9ybWF0dGVyLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUhlYWRlcnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGdldFNlcnZpY2VNYWNoaW5lSWQgfSBmcm9tICcuLi8uLi9leHRlcm5hbFNlcnZpY2VzL2NvbW1vbi9zZXJ2aWNlTWFjaGluZUlkLmpzJztcbmltcG9ydCB7IElTdG9yYWdlRW50cnksIElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RJbml0aWFsaXplciwgQWJzdHJhY3RTeW5jaHJvbmlzZXIsIGdldFN5bmNSZXNvdXJjZUxvZ0xhYmVsLCBJQWNjZXB0UmVzdWx0LCBJTWVyZ2VSZXN1bHQsIElSZXNvdXJjZVByZXZpZXcsIGlzU3luY0RhdGEgfSBmcm9tICcuL2Fic3RyYWN0U3luY2hyb25pemVyLmpzJztcbmltcG9ydCB7IGVkaXQgfSBmcm9tICcuL2NvbnRlbnQuanMnO1xuaW1wb3J0IHsgbWVyZ2UgfSBmcm9tICcuL2dsb2JhbFN0YXRlTWVyZ2UuanMnO1xuaW1wb3J0IHsgQUxMX1NZTkNfUkVTT1VSQ0VTLCBDaGFuZ2UsIGNyZWF0ZVN5bmNIZWFkZXJzLCBnZXRFbmFibGVtZW50S2V5LCBJR2xvYmFsU3RhdGUsIElSZW1vdGVVc2VyRGF0YSwgSVN0b3JhZ2VWYWx1ZSwgSVN5bmNEYXRhLCBJVXNlckRhdGEsIElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSwgSVVzZXJEYXRhU3luY2hyb25pc2VyLCBJVXNlckRhdGFTeW5jTG9nU2VydmljZSwgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLCBTeW5jUmVzb3VyY2UsIFNZTkNfU0VSVklDRV9VUkxfVFlQRSwgVXNlckRhdGFTeW5jRXJyb3IsIFVzZXJEYXRhU3luY0Vycm9yQ29kZSwgVXNlckRhdGFTeW5jU3RvcmVUeXBlLCBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUgfSBmcm9tICcuL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNTdG9yZUNsaWVudCB9IGZyb20gJy4vdXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5cbmNvbnN0IGFyZ3ZTdG9yYWdlUHJlZnggPSAnZ2xvYmFsU3RhdGUuYXJndi4nO1xuY29uc3QgYXJndlByb3BlcnRpZXM6IHN0cmluZ1tdID0gWydsb2NhbGUnXTtcblxudHlwZSBTdG9yYWdlS2V5cyA9IHsgbWFjaGluZTogc3RyaW5nW107IHVzZXI6IHN0cmluZ1tdOyB1bnJlZ2lzdGVyZWQ6IHN0cmluZ1tdIH07XG5cbmludGVyZmFjZSBJR2xvYmFsU3RhdGVSZXNvdXJjZU1lcmdlUmVzdWx0IGV4dGVuZHMgSUFjY2VwdFJlc3VsdCB7XG5cdHJlYWRvbmx5IGxvY2FsOiB7IGFkZGVkOiBJU3RyaW5nRGljdGlvbmFyeTxJU3RvcmFnZVZhbHVlPjsgcmVtb3ZlZDogc3RyaW5nW107IHVwZGF0ZWQ6IElTdHJpbmdEaWN0aW9uYXJ5PElTdG9yYWdlVmFsdWU+IH07XG5cdHJlYWRvbmx5IHJlbW90ZTogeyBhZGRlZDogc3RyaW5nW107IHJlbW92ZWQ6IHN0cmluZ1tdOyB1cGRhdGVkOiBzdHJpbmdbXTsgYWxsOiBJU3RyaW5nRGljdGlvbmFyeTxJU3RvcmFnZVZhbHVlPiB8IG51bGwgfTtcbn1cblxuaW50ZXJmYWNlIElHbG9iYWxTdGF0ZVJlc291cmNlUHJldmlldyBleHRlbmRzIElSZXNvdXJjZVByZXZpZXcge1xuXHRyZWFkb25seSBsb2NhbFVzZXJEYXRhOiBJR2xvYmFsU3RhdGU7XG5cdHJlYWRvbmx5IHByZXZpZXdSZXN1bHQ6IElHbG9iYWxTdGF0ZVJlc291cmNlTWVyZ2VSZXN1bHQ7XG5cdHJlYWRvbmx5IHN0b3JhZ2VLZXlzOiBTdG9yYWdlS2V5cztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmluZ2lmeShnbG9iYWxTdGF0ZTogSUdsb2JhbFN0YXRlLCBmb3JtYXQ6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRjb25zdCBzdG9yYWdlS2V5cyA9IGdsb2JhbFN0YXRlLnN0b3JhZ2UgPyBPYmplY3Qua2V5cyhnbG9iYWxTdGF0ZS5zdG9yYWdlKS5zb3J0KCkgOiBbXTtcblx0Y29uc3Qgc3RvcmFnZTogSVN0cmluZ0RpY3Rpb25hcnk8SVN0b3JhZ2VWYWx1ZT4gPSB7fTtcblx0c3RvcmFnZUtleXMuZm9yRWFjaChrZXkgPT4gc3RvcmFnZVtrZXldID0gZ2xvYmFsU3RhdGUuc3RvcmFnZVtrZXldKTtcblx0Z2xvYmFsU3RhdGUuc3RvcmFnZSA9IHN0b3JhZ2U7XG5cdHJldHVybiBmb3JtYXQgPyB0b0Zvcm1hdHRlZFN0cmluZyhnbG9iYWxTdGF0ZSwge30pIDogSlNPTi5zdHJpbmdpZnkoZ2xvYmFsU3RhdGUpO1xufVxuXG5jb25zdCBHTE9CQUxfU1RBVEVfREFUQV9WRVJTSU9OID0gMTtcblxuLyoqXG4gKiBTeW5jaHJvbmlzZXMgZ2xvYmFsIHN0YXRlIHRoYXQgaW5jbHVkZXNcbiAqIFx0LSBHbG9iYWwgc3RvcmFnZSB3aXRoIHVzZXIgc2NvcGVcbiAqIFx0LSBMb2NhbGUgZnJvbSBhcmd2IHByb3BlcnRpZXNcbiAqXG4gKiBHbG9iYWwgc3RvcmFnZSBpcyBzeW5jZWQgd2l0aG91dCBjaGVja2luZyB2ZXJzaW9uIGp1c3QgbGlrZSBvdGhlciByZXNvdXJjZXMgKHNldHRpbmdzLCBrZXliaW5kaW5ncykuXG4gKiBJZiB0aGVyZSBpcyBhIGNoYW5nZSBpbiBmb3JtYXQgb2YgdGhlIHZhbHVlIG9mIGEgc3RvcmFnZSBrZXkgd2hpY2ggcmVxdWlyZXMgbWlncmF0aW9uIHRoZW5cbiAqIFx0XHRPd25lciBvZiB0aGF0IGtleSBzaG91bGQgcmVtb3ZlIHRoYXQga2V5IGZyb20gdXNlciBzY29wZSBhbmQgcmVwbGFjZSB0aGF0IHdpdGggbmV3IHVzZXIgc2NvcGVkIGtleS5cbiAqL1xuZXhwb3J0IGNsYXNzIEdsb2JhbFN0YXRlU3luY2hyb25pc2VyIGV4dGVuZHMgQWJzdHJhY3RTeW5jaHJvbmlzZXIgaW1wbGVtZW50cyBJVXNlckRhdGFTeW5jaHJvbmlzZXIge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSB2ZXJzaW9uOiBudW1iZXIgPSBHTE9CQUxfU1RBVEVfREFUQV9WRVJTSU9OO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByZXZpZXdSZXNvdXJjZTogVVJJID0gdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwgJ2dsb2JhbFN0YXRlLmpzb24nKTtcblx0cHJpdmF0ZSByZWFkb25seSBiYXNlUmVzb3VyY2U6IFVSSSA9IHRoaXMucHJldmlld1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbG9jYWxSZXNvdXJjZTogVVJJID0gdGhpcy5wcmV2aWV3UmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlUmVzb3VyY2U6IFVSSSA9IHRoaXMucHJldmlld1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KTtcblx0cHJpdmF0ZSByZWFkb25seSBhY2NlcHRlZFJlc291cmNlOiBVUkkgPSB0aGlzLnByZXZpZXdSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGxvY2FsR2xvYmFsU3RhdGVQcm92aWRlcjogTG9jYWxHbG9iYWxTdGF0ZVByb3ZpZGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsXG5cdFx0Y29sbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuR2xvYmFsU3RhdGUsIHByb2ZpbGUgfSwgY29sbGVjdGlvbiwgZmlsZVNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgdXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsIHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHR0aGlzLmxvY2FsR2xvYmFsU3RhdGVQcm92aWRlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsR2xvYmFsU3RhdGVQcm92aWRlcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZmlsZVNlcnZpY2Uud2F0Y2godGhpcy5leHRVcmkuZGlybmFtZSh0aGlzLmVudmlyb25tZW50U2VydmljZS5hcmd2UmVzb3VyY2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRFdmVudC5hbnkoXG5cdFx0XHRcdC8qIExvY2FsZSBjaGFuZ2UgKi9cblx0XHRcdFx0RXZlbnQuZmlsdGVyKGZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UsIGUgPT4gZS5jb250YWlucyh0aGlzLmVudmlyb25tZW50U2VydmljZS5hcmd2UmVzb3VyY2UpKSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKHVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlLCBlID0+IHtcblx0XHRcdFx0XHQvKiBTdG9yYWdlVGFyZ2V0IGhhcyBjaGFuZ2VkIGluIHByb2ZpbGUgc3RvcmFnZSAqL1xuXHRcdFx0XHRcdGlmIChlLnRhcmdldENoYW5nZXMuc29tZShwcm9maWxlID0+IHRoaXMuc3luY1Jlc291cmNlLnByb2ZpbGUuaWQgPT09IHByb2ZpbGUuaWQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0LyogVXNlciBzdG9yYWdlIGRhdGEgaGFzIGNoYW5nZWQgaW4gcHJvZmlsZSBzdG9yYWdlICovXG5cdFx0XHRcdFx0aWYgKGUudmFsdWVDaGFuZ2VzLnNvbWUoKHsgcHJvZmlsZSwgY2hhbmdlcyB9KSA9PiB0aGlzLnN5bmNSZXNvdXJjZS5wcm9maWxlLmlkID09PSBwcm9maWxlLmlkICYmIGNoYW5nZXMuc29tZShjaGFuZ2UgPT4gY2hhbmdlLnRhcmdldCA9PT0gU3RvcmFnZVRhcmdldC5VU0VSKSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH0pLFxuXHRcdFx0KSgoKCkgPT4gdGhpcy50cmlnZ2VyTG9jYWxDaGFuZ2UoKSkpXG5cdFx0KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZW5lcmF0ZVN5bmNQcmV2aWV3KHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEsIGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSB8IG51bGwsIGlzUmVtb3RlRGF0YUZyb21DdXJyZW50TWFjaGluZTogYm9vbGVhbik6IFByb21pc2U8SUdsb2JhbFN0YXRlUmVzb3VyY2VQcmV2aWV3W10+IHtcblx0XHRjb25zdCByZW1vdGVHbG9iYWxTdGF0ZTogSUdsb2JhbFN0YXRlID0gcmVtb3RlVXNlckRhdGEuc3luY0RhdGEgPyBKU09OLnBhcnNlKHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhLmNvbnRlbnQpIDogbnVsbDtcblxuXHRcdC8vIFVzZSByZW1vdGUgZGF0YSBhcyBsYXN0IHN5bmMgZGF0YSBpZiBsYXN0IHN5bmMgZGF0YSBkb2VzIG5vdCBleGlzdCBhbmQgcmVtb3RlIGRhdGEgaXMgZnJvbSBzYW1lIG1hY2hpbmVcblx0XHRsYXN0U3luY1VzZXJEYXRhID0gbGFzdFN5bmNVc2VyRGF0YSA9PT0gbnVsbCAmJiBpc1JlbW90ZURhdGFGcm9tQ3VycmVudE1hY2hpbmUgPyByZW1vdGVVc2VyRGF0YSA6IGxhc3RTeW5jVXNlckRhdGE7XG5cdFx0Y29uc3QgbGFzdFN5bmNHbG9iYWxTdGF0ZTogSUdsb2JhbFN0YXRlIHwgbnVsbCA9IGxhc3RTeW5jVXNlckRhdGEgJiYgbGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSA/IEpTT04ucGFyc2UobGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YS5jb250ZW50KSA6IG51bGw7XG5cblx0XHRjb25zdCBsb2NhbEdsb2JhbFN0YXRlID0gYXdhaXQgdGhpcy5sb2NhbEdsb2JhbFN0YXRlUHJvdmlkZXIuZ2V0TG9jYWxHbG9iYWxTdGF0ZSh0aGlzLnN5bmNSZXNvdXJjZS5wcm9maWxlKTtcblxuXHRcdGlmIChyZW1vdGVHbG9iYWxTdGF0ZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBNZXJnaW5nIHJlbW90ZSB1aSBzdGF0ZSB3aXRoIGxvY2FsIHVpIHN0YXRlLi4uYCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogUmVtb3RlIHVpIHN0YXRlIGRvZXMgbm90IGV4aXN0LiBTeW5jaHJvbml6aW5nIHVpIHN0YXRlIGZvciB0aGUgZmlyc3QgdGltZS5gKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yYWdlS2V5cyA9IGF3YWl0IHRoaXMuZ2V0U3RvcmFnZUtleXMobGFzdFN5bmNHbG9iYWxTdGF0ZSk7XG5cdFx0Y29uc3QgeyBsb2NhbCwgcmVtb3RlIH0gPSBtZXJnZShsb2NhbEdsb2JhbFN0YXRlLnN0b3JhZ2UsIHJlbW90ZUdsb2JhbFN0YXRlID8gcmVtb3RlR2xvYmFsU3RhdGUuc3RvcmFnZSA6IG51bGwsIGxhc3RTeW5jR2xvYmFsU3RhdGUgPyBsYXN0U3luY0dsb2JhbFN0YXRlLnN0b3JhZ2UgOiBudWxsLCBzdG9yYWdlS2V5cywgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJR2xvYmFsU3RhdGVSZXNvdXJjZU1lcmdlUmVzdWx0ID0ge1xuXHRcdFx0Y29udGVudDogbnVsbCxcblx0XHRcdGxvY2FsLFxuXHRcdFx0cmVtb3RlLFxuXHRcdFx0bG9jYWxDaGFuZ2U6IE9iamVjdC5rZXlzKGxvY2FsLmFkZGVkKS5sZW5ndGggPiAwIHx8IE9iamVjdC5rZXlzKGxvY2FsLnVwZGF0ZWQpLmxlbmd0aCA+IDAgfHwgbG9jYWwucmVtb3ZlZC5sZW5ndGggPiAwID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLk5vbmUsXG5cdFx0XHRyZW1vdGVDaGFuZ2U6IHJlbW90ZS5hbGwgIT09IG51bGwgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuTm9uZSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KGxvY2FsR2xvYmFsU3RhdGUsIGZhbHNlKTtcblx0XHRyZXR1cm4gW3tcblx0XHRcdGJhc2VSZXNvdXJjZTogdGhpcy5iYXNlUmVzb3VyY2UsXG5cdFx0XHRiYXNlQ29udGVudDogbGFzdFN5bmNHbG9iYWxTdGF0ZSA/IHN0cmluZ2lmeShsYXN0U3luY0dsb2JhbFN0YXRlLCBmYWxzZSkgOiBsb2NhbENvbnRlbnQsXG5cdFx0XHRsb2NhbFJlc291cmNlOiB0aGlzLmxvY2FsUmVzb3VyY2UsXG5cdFx0XHRsb2NhbENvbnRlbnQsXG5cdFx0XHRsb2NhbFVzZXJEYXRhOiBsb2NhbEdsb2JhbFN0YXRlLFxuXHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMucmVtb3RlUmVzb3VyY2UsXG5cdFx0XHRyZW1vdGVDb250ZW50OiByZW1vdGVHbG9iYWxTdGF0ZSA/IHN0cmluZ2lmeShyZW1vdGVHbG9iYWxTdGF0ZSwgZmFsc2UpIDogbnVsbCxcblx0XHRcdHByZXZpZXdSZXNvdXJjZTogdGhpcy5wcmV2aWV3UmVzb3VyY2UsXG5cdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0bG9jYWxDaGFuZ2U6IHByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5hY2NlcHRlZFJlc291cmNlLFxuXHRcdFx0c3RvcmFnZUtleXNcblx0XHR9XTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBoYXNSZW1vdGVDaGFuZ2VkKGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGxhc3RTeW5jR2xvYmFsU3RhdGU6IElHbG9iYWxTdGF0ZSB8IG51bGwgPSBsYXN0U3luY1VzZXJEYXRhLnN5bmNEYXRhID8gSlNPTi5wYXJzZShsYXN0U3luY1VzZXJEYXRhLnN5bmNEYXRhLmNvbnRlbnQpIDogbnVsbDtcblx0XHRpZiAobGFzdFN5bmNHbG9iYWxTdGF0ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IGxvY2FsR2xvYmFsU3RhdGUgPSBhd2FpdCB0aGlzLmxvY2FsR2xvYmFsU3RhdGVQcm92aWRlci5nZXRMb2NhbEdsb2JhbFN0YXRlKHRoaXMuc3luY1Jlc291cmNlLnByb2ZpbGUpO1xuXHRcdGNvbnN0IHN0b3JhZ2VLZXlzID0gYXdhaXQgdGhpcy5nZXRTdG9yYWdlS2V5cyhsYXN0U3luY0dsb2JhbFN0YXRlKTtcblx0XHRjb25zdCB7IHJlbW90ZSB9ID0gbWVyZ2UobG9jYWxHbG9iYWxTdGF0ZS5zdG9yYWdlLCBsYXN0U3luY0dsb2JhbFN0YXRlLnN0b3JhZ2UsIGxhc3RTeW5jR2xvYmFsU3RhdGUuc3RvcmFnZSwgc3RvcmFnZUtleXMsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0cmV0dXJuIHJlbW90ZS5hbGwgIT09IG51bGw7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0TWVyZ2VSZXN1bHQocmVzb3VyY2VQcmV2aWV3OiBJR2xvYmFsU3RhdGVSZXNvdXJjZVByZXZpZXcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SU1lcmdlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHsgLi4ucmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQsIGhhc0NvbmZsaWN0czogZmFsc2UgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZXRBY2NlcHRSZXN1bHQocmVzb3VyY2VQcmV2aWV3OiBJR2xvYmFsU3RhdGVSZXNvdXJjZVByZXZpZXcsIHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUdsb2JhbFN0YXRlUmVzb3VyY2VNZXJnZVJlc3VsdD4ge1xuXG5cdFx0LyogQWNjZXB0IGxvY2FsIHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwocmVzb3VyY2UsIHRoaXMubG9jYWxSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmFjY2VwdExvY2FsKHJlc291cmNlUHJldmlldyk7XG5cdFx0fVxuXG5cdFx0LyogQWNjZXB0IHJlbW90ZSByZXNvdXJjZSAqL1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsKHJlc291cmNlLCB0aGlzLnJlbW90ZVJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuYWNjZXB0UmVtb3RlKHJlc291cmNlUHJldmlldyk7XG5cdFx0fVxuXG5cdFx0LyogQWNjZXB0IHByZXZpZXcgcmVzb3VyY2UgKi9cblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5wcmV2aWV3UmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQ7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIFJlc291cmNlOiAke3Jlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFjY2VwdExvY2FsKHJlc291cmNlUHJldmlldzogSUdsb2JhbFN0YXRlUmVzb3VyY2VQcmV2aWV3KTogUHJvbWlzZTxJR2xvYmFsU3RhdGVSZXNvdXJjZU1lcmdlUmVzdWx0PiB7XG5cdFx0aWYgKHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50ICE9PSBudWxsKSB7XG5cdFx0XHRjb25zdCByZW1vdGVHbG9iYWxTdGF0ZTogSUdsb2JhbFN0YXRlID0gSlNPTi5wYXJzZShyZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCk7XG5cdFx0XHRjb25zdCB7IGxvY2FsLCByZW1vdGUgfSA9IG1lcmdlKHJlc291cmNlUHJldmlldy5sb2NhbFVzZXJEYXRhLnN0b3JhZ2UsIHJlbW90ZUdsb2JhbFN0YXRlLnN0b3JhZ2UsIHJlbW90ZUdsb2JhbFN0YXRlLnN0b3JhZ2UsIHJlc291cmNlUHJldmlldy5zdG9yYWdlS2V5cywgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50LFxuXHRcdFx0XHRsb2NhbCxcblx0XHRcdFx0cmVtb3RlLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogcmVtb3RlLmFsbCAhPT0gbnVsbCA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5Ob25lLFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogcmVzb3VyY2VQcmV2aWV3LmxvY2FsQ29udGVudCxcblx0XHRcdFx0bG9jYWw6IHsgYWRkZWQ6IHt9LCByZW1vdmVkOiBbXSwgdXBkYXRlZDoge30gfSxcblx0XHRcdFx0cmVtb3RlOiB7IGFkZGVkOiBPYmplY3Qua2V5cyhyZXNvdXJjZVByZXZpZXcubG9jYWxVc2VyRGF0YS5zdG9yYWdlKSwgcmVtb3ZlZDogW10sIHVwZGF0ZWQ6IFtdLCBhbGw6IHJlc291cmNlUHJldmlldy5sb2NhbFVzZXJEYXRhLnN0b3JhZ2UgfSxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhY2NlcHRSZW1vdGUocmVzb3VyY2VQcmV2aWV3OiBJR2xvYmFsU3RhdGVSZXNvdXJjZVByZXZpZXcpOiBQcm9taXNlPElHbG9iYWxTdGF0ZVJlc291cmNlTWVyZ2VSZXN1bHQ+IHtcblx0XHRpZiAocmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQgIT09IG51bGwpIHtcblx0XHRcdGNvbnN0IHJlbW90ZUdsb2JhbFN0YXRlOiBJR2xvYmFsU3RhdGUgPSBKU09OLnBhcnNlKHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50KTtcblx0XHRcdGNvbnN0IHsgbG9jYWwsIHJlbW90ZSB9ID0gbWVyZ2UocmVzb3VyY2VQcmV2aWV3LmxvY2FsVXNlckRhdGEuc3RvcmFnZSwgcmVtb3RlR2xvYmFsU3RhdGUuc3RvcmFnZSwgcmVzb3VyY2VQcmV2aWV3LmxvY2FsVXNlckRhdGEuc3RvcmFnZSwgcmVzb3VyY2VQcmV2aWV3LnN0b3JhZ2VLZXlzLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogcmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQsXG5cdFx0XHRcdGxvY2FsLFxuXHRcdFx0XHRyZW1vdGUsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBPYmplY3Qua2V5cyhsb2NhbC5hZGRlZCkubGVuZ3RoID4gMCB8fCBPYmplY3Qua2V5cyhsb2NhbC51cGRhdGVkKS5sZW5ndGggPiAwIHx8IGxvY2FsLnJlbW92ZWQubGVuZ3RoID4gMCA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5Ob25lLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogcmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQsXG5cdFx0XHRcdGxvY2FsOiB7IGFkZGVkOiB7fSwgcmVtb3ZlZDogW10sIHVwZGF0ZWQ6IHt9IH0sXG5cdFx0XHRcdHJlbW90ZTogeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCB1cGRhdGVkOiBbXSwgYWxsOiBudWxsIH0sXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGFwcGx5UmVzdWx0KHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEsIGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSB8IG51bGwsIHJlc291cmNlUHJldmlld3M6IFtJR2xvYmFsU3RhdGVSZXNvdXJjZVByZXZpZXcsIElHbG9iYWxTdGF0ZVJlc291cmNlTWVyZ2VSZXN1bHRdW10sIGZvcmNlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyBsb2NhbFVzZXJEYXRhIH0gPSByZXNvdXJjZVByZXZpZXdzWzBdWzBdO1xuXHRcdGNvbnN0IHsgbG9jYWwsIHJlbW90ZSwgbG9jYWxDaGFuZ2UsIHJlbW90ZUNoYW5nZSB9ID0gcmVzb3VyY2VQcmV2aWV3c1swXVsxXTtcblxuXHRcdGlmIChsb2NhbENoYW5nZSA9PT0gQ2hhbmdlLk5vbmUgJiYgcmVtb3RlQ2hhbmdlID09PSBDaGFuZ2UuTm9uZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IE5vIGNoYW5nZXMgZm91bmQgZHVyaW5nIHN5bmNocm9uaXppbmcgdWkgc3RhdGUuYCk7XG5cdFx0fVxuXG5cdFx0aWYgKGxvY2FsQ2hhbmdlICE9PSBDaGFuZ2UuTm9uZSkge1xuXHRcdFx0Ly8gdXBkYXRlIGxvY2FsXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0aW5nIGxvY2FsIHVpIHN0YXRlLi4uYCk7XG5cdFx0XHRhd2FpdCB0aGlzLmJhY2t1cExvY2FsKEpTT04uc3RyaW5naWZ5KGxvY2FsVXNlckRhdGEpKTtcblx0XHRcdGF3YWl0IHRoaXMubG9jYWxHbG9iYWxTdGF0ZVByb3ZpZGVyLndyaXRlTG9jYWxHbG9iYWxTdGF0ZShsb2NhbCwgdGhpcy5zeW5jUmVzb3VyY2UucHJvZmlsZSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCBsb2NhbCB1aSBzdGF0ZWApO1xuXHRcdH1cblxuXHRcdGlmIChyZW1vdGVDaGFuZ2UgIT09IENoYW5nZS5Ob25lKSB7XG5cdFx0XHQvLyB1cGRhdGUgcmVtb3RlXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0aW5nIHJlbW90ZSB1aSBzdGF0ZS4uLmApO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHsgc3RvcmFnZTogcmVtb3RlLmFsbCB9KTtcblx0XHRcdHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGhpcy51cGRhdGVSZW1vdGVVc2VyRGF0YShjb250ZW50LCBmb3JjZSA/IG51bGwgOiByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0ZWQgcmVtb3RlIHVpIHN0YXRlLiR7cmVtb3RlLmFkZGVkLmxlbmd0aCA/IGAgQWRkZWQ6ICR7cmVtb3RlLmFkZGVkfS5gIDogJyd9JHtyZW1vdGUudXBkYXRlZC5sZW5ndGggPyBgIFVwZGF0ZWQ6ICR7cmVtb3RlLnVwZGF0ZWR9LmAgOiAnJ30ke3JlbW90ZS5yZW1vdmVkLmxlbmd0aCA/IGAgUmVtb3ZlZDogJHtyZW1vdGUucmVtb3ZlZH0uYCA6ICcnfWApO1xuXHRcdH1cblxuXHRcdGlmIChsYXN0U3luY1VzZXJEYXRhPy5yZWYgIT09IHJlbW90ZVVzZXJEYXRhLnJlZikge1xuXHRcdFx0Ly8gdXBkYXRlIGxhc3Qgc3luY1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyBsYXN0IHN5bmNocm9uaXplZCB1aSBzdGF0ZS4uLmApO1xuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVMYXN0U3luY1VzZXJEYXRhKHJlbW90ZVVzZXJEYXRhKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGVkIGxhc3Qgc3luY2hyb25pemVkIHVpIHN0YXRlYCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUNvbnRlbnQodXJpOiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbCh0aGlzLnJlbW90ZVJlc291cmNlLCB1cmkpXG5cdFx0XHR8fCB0aGlzLmV4dFVyaS5pc0VxdWFsKHRoaXMuYmFzZVJlc291cmNlLCB1cmkpXG5cdFx0XHR8fCB0aGlzLmV4dFVyaS5pc0VxdWFsKHRoaXMubG9jYWxSZXNvdXJjZSwgdXJpKVxuXHRcdFx0fHwgdGhpcy5leHRVcmkuaXNFcXVhbCh0aGlzLmFjY2VwdGVkUmVzb3VyY2UsIHVyaSlcblx0XHQpIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnJlc29sdmVQcmV2aWV3Q29udGVudCh1cmkpO1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQgPyBzdHJpbmdpZnkoSlNPTi5wYXJzZShjb250ZW50KSwgdHJ1ZSkgOiBjb250ZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGFzeW5jIGhhc0xvY2FsRGF0YSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBzdG9yYWdlIH0gPSBhd2FpdCB0aGlzLmxvY2FsR2xvYmFsU3RhdGVQcm92aWRlci5nZXRMb2NhbEdsb2JhbFN0YXRlKHRoaXMuc3luY1Jlc291cmNlLnByb2ZpbGUpO1xuXHRcdFx0aWYgKE9iamVjdC5rZXlzKHN0b3JhZ2UpLmxlbmd0aCA+IDEgfHwgc3RvcmFnZVtgJHthcmd2U3RvcmFnZVByZWZ4fS5sb2NhbGVgXT8udmFsdWUgIT09ICdlbicpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8qIGlnbm9yZSBlcnJvciAqL1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFN0b3JhZ2VLZXlzKGxhc3RTeW5jR2xvYmFsU3RhdGU6IElHbG9iYWxTdGF0ZSB8IG51bGwpOiBQcm9taXNlPFN0b3JhZ2VLZXlzPiB7XG5cdFx0Y29uc3Qgc3RvcmFnZURhdGEgPSBhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLnJlYWRTdG9yYWdlRGF0YSh0aGlzLnN5bmNSZXNvdXJjZS5wcm9maWxlKTtcblx0XHRjb25zdCB1c2VyOiBzdHJpbmdbXSA9IFtdLCBtYWNoaW5lOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHN0b3JhZ2VEYXRhKSB7XG5cdFx0XHRpZiAodmFsdWUudGFyZ2V0ID09PSBTdG9yYWdlVGFyZ2V0LlVTRVIpIHtcblx0XHRcdFx0dXNlci5wdXNoKGtleSk7XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlLnRhcmdldCA9PT0gU3RvcmFnZVRhcmdldC5NQUNISU5FKSB7XG5cdFx0XHRcdG1hY2hpbmUucHVzaChrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCByZWdpc3RlcmVkID0gWy4uLnVzZXIsIC4uLm1hY2hpbmVdO1xuXHRcdGNvbnN0IHVucmVnaXN0ZXJlZCA9IGxhc3RTeW5jR2xvYmFsU3RhdGU/LnN0b3JhZ2UgPyBPYmplY3Qua2V5cyhsYXN0U3luY0dsb2JhbFN0YXRlLnN0b3JhZ2UpLmZpbHRlcihrZXkgPT4gIWtleS5zdGFydHNXaXRoKGFyZ3ZTdG9yYWdlUHJlZngpICYmICFyZWdpc3RlcmVkLmluY2x1ZGVzKGtleSkgJiYgc3RvcmFnZURhdGEuZ2V0KGtleSkgIT09IHVuZGVmaW5lZCkgOiBbXTtcblxuXHRcdGlmICghaXNXZWIpIHtcblx0XHRcdC8vIEZvbGxvd2luZyBrZXlzIGFyZSBzeW5jZWQgb25seSBpbiB3ZWIuIERvIG5vdCBzeW5jIHRoZXNlIGtleXMgaW4gb3RoZXIgcGxhdGZvcm1zXG5cdFx0XHRjb25zdCBrZXlzU3luY2VkT25seUluV2ViID0gWy4uLkFMTF9TWU5DX1JFU09VUkNFUy5tYXAocmVzb3VyY2UgPT4gZ2V0RW5hYmxlbWVudEtleShyZXNvdXJjZSkpLCBTWU5DX1NFUlZJQ0VfVVJMX1RZUEVdO1xuXHRcdFx0dW5yZWdpc3RlcmVkLnB1c2goLi4ua2V5c1N5bmNlZE9ubHlJbldlYik7XG5cdFx0XHRtYWNoaW5lLnB1c2goLi4ua2V5c1N5bmNlZE9ubHlJbldlYik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgdXNlciwgbWFjaGluZSwgdW5yZWdpc3RlcmVkIH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIExvY2FsR2xvYmFsU3RhdGVQcm92aWRlciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlXG5cdCkgeyB9XG5cblx0YXN5bmMgZ2V0TG9jYWxHbG9iYWxTdGF0ZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTxJR2xvYmFsU3RhdGU+IHtcblx0XHRjb25zdCBzdG9yYWdlOiBJU3RyaW5nRGljdGlvbmFyeTxJU3RvcmFnZVZhbHVlPiA9IHt9O1xuXHRcdGlmIChwcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0Y29uc3QgYXJndkNvbnRlbnQ6IHN0cmluZyA9IGF3YWl0IHRoaXMuZ2V0TG9jYWxBcmd2Q29udGVudCgpO1xuXHRcdFx0Y29uc3QgYXJndlZhbHVlOiBJU3RyaW5nRGljdGlvbmFyeTxhbnk+ID0gcGFyc2UoYXJndkNvbnRlbnQpO1xuXHRcdFx0Zm9yIChjb25zdCBhcmd2UHJvcGVydHkgb2YgYXJndlByb3BlcnRpZXMpIHtcblx0XHRcdFx0aWYgKGFyZ3ZWYWx1ZVthcmd2UHJvcGVydHldICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRzdG9yYWdlW2Ake2FyZ3ZTdG9yYWdlUHJlZnh9JHthcmd2UHJvcGVydHl9YF0gPSB7IHZlcnNpb246IDEsIHZhbHVlOiBhcmd2VmFsdWVbYXJndlByb3BlcnR5XSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHN0b3JhZ2VEYXRhID0gYXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZS5yZWFkU3RvcmFnZURhdGEocHJvZmlsZSk7XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2Ygc3RvcmFnZURhdGEpIHtcblx0XHRcdGlmICh2YWx1ZS52YWx1ZSAmJiB2YWx1ZS50YXJnZXQgPT09IFN0b3JhZ2VUYXJnZXQuVVNFUikge1xuXHRcdFx0XHRzdG9yYWdlW2tleV0gPSB7IHZlcnNpb246IDEsIHZhbHVlOiB2YWx1ZS52YWx1ZSwgc2NvcGU6IHZhbHVlLnNjb3BlIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IHN0b3JhZ2UgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0TG9jYWxBcmd2Q29udGVudCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ0dsb2JhbFN0YXRlU3luYyNnZXRMb2NhbEFyZ3ZDb250ZW50JywgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYXJndlJlc291cmNlKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3ZSZXNvdXJjZSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ0dsb2JhbFN0YXRlU3luYyNnZXRMb2NhbEFyZ3ZDb250ZW50IC0gUmVzb2x2ZWQnLCB0aGlzLmVudmlyb25tZW50U2VydmljZS5hcmd2UmVzb3VyY2UpO1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdH1cblx0XHRyZXR1cm4gJ3t9Jztcblx0fVxuXG5cdGFzeW5jIHdyaXRlTG9jYWxHbG9iYWxTdGF0ZSh7IGFkZGVkLCByZW1vdmVkLCB1cGRhdGVkIH06IHsgYWRkZWQ6IElTdHJpbmdEaWN0aW9uYXJ5PElTdG9yYWdlVmFsdWU+OyB1cGRhdGVkOiBJU3RyaW5nRGljdGlvbmFyeTxJU3RvcmFnZVZhbHVlPjsgcmVtb3ZlZDogc3RyaW5nW10gfSwgcHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN5bmNSZXNvdXJjZUxvZ0xhYmVsID0gZ2V0U3luY1Jlc291cmNlTG9nTGFiZWwoU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlLCBwcm9maWxlKTtcblx0XHRjb25zdCBhcmd2OiBJU3RyaW5nRGljdGlvbmFyeTxhbnk+ID0ge307XG5cdFx0Y29uc3QgdXBkYXRlZFByb2ZpbGVTdG9yYWdlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4oKTtcblx0XHRjb25zdCB1cGRhdGVkU2hhcmVkU3RvcmFnZSA9IHByb2ZpbGUuaXNEZWZhdWx0ID8gbmV3IE1hcDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4oKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzdG9yYWdlRGF0YSA9IGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UucmVhZFN0b3JhZ2VEYXRhKHByb2ZpbGUpO1xuXHRcdGNvbnN0IGhhbmRsZVVwZGF0ZWRTdG9yYWdlID0gKGtleXM6IHN0cmluZ1tdLCBzdG9yYWdlPzogSVN0cmluZ0RpY3Rpb25hcnk8SVN0b3JhZ2VWYWx1ZT4pOiB2b2lkID0+IHtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcblx0XHRcdFx0aWYgKGtleS5zdGFydHNXaXRoKGFyZ3ZTdG9yYWdlUHJlZngpKSB7XG5cdFx0XHRcdFx0YXJndltrZXkuc3Vic3RyaW5nKGFyZ3ZTdG9yYWdlUHJlZngubGVuZ3RoKV0gPSBzdG9yYWdlID8gc3RvcmFnZVtrZXldLnZhbHVlIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzdG9yYWdlKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RvcmFnZVZhbHVlID0gc3RvcmFnZVtrZXldO1xuXHRcdFx0XHRcdGlmIChzdG9yYWdlVmFsdWUudmFsdWUgIT09IHN0b3JhZ2VEYXRhLmdldChrZXkpPy52YWx1ZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0TWFwID0gdXBkYXRlZFNoYXJlZFN0b3JhZ2UgJiYgc3RvcmFnZVZhbHVlLnNjb3BlID09PSBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEID8gdXBkYXRlZFNoYXJlZFN0b3JhZ2UgOiB1cGRhdGVkUHJvZmlsZVN0b3JhZ2U7XG5cdFx0XHRcdFx0XHR0YXJnZXRNYXAuc2V0KGtleSwgc3RvcmFnZVZhbHVlLnZhbHVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKHN0b3JhZ2VEYXRhLmdldChrZXkpICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldE1hcCA9IHVwZGF0ZWRTaGFyZWRTdG9yYWdlICYmIHN0b3JhZ2VEYXRhLmdldChrZXkpPy5zY29wZSA9PT0gU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCA/IHVwZGF0ZWRTaGFyZWRTdG9yYWdlIDogdXBkYXRlZFByb2ZpbGVTdG9yYWdlO1xuXHRcdFx0XHRcdFx0dGFyZ2V0TWFwLnNldChrZXksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRoYW5kbGVVcGRhdGVkU3RvcmFnZShPYmplY3Qua2V5cyhhZGRlZCksIGFkZGVkKTtcblx0XHRoYW5kbGVVcGRhdGVkU3RvcmFnZShPYmplY3Qua2V5cyh1cGRhdGVkKSwgdXBkYXRlZCk7XG5cdFx0aGFuZGxlVXBkYXRlZFN0b3JhZ2UocmVtb3ZlZCk7XG5cblx0XHRpZiAoT2JqZWN0LmtleXMoYXJndikubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyBsb2NhbGUuLi5gKTtcblx0XHRcdGNvbnN0IGFyZ3ZDb250ZW50ID0gYXdhaXQgdGhpcy5nZXRMb2NhbEFyZ3ZDb250ZW50KCk7XG5cdFx0XHRsZXQgY29udGVudCA9IGFyZ3ZDb250ZW50O1xuXHRcdFx0Zm9yIChjb25zdCBhcmd2UHJvcGVydHkgb2YgT2JqZWN0LmtleXMoYXJndikpIHtcblx0XHRcdFx0Y29udGVudCA9IGVkaXQoY29udGVudCwgW2FyZ3ZQcm9wZXJ0eV0sIGFyZ3ZbYXJndlByb3BlcnR5XSwge30pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFyZ3ZDb250ZW50ICE9PSBjb250ZW50KSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0aW5nIGxvY2FsZS4uLmApO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0aGlzLmVudmlyb25tZW50U2VydmljZS5hcmd2UmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0ZWQgbG9jYWxlLmApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGVkIGxvY2FsZWApO1xuXHRcdH1cblxuXHRcdGlmICh1cGRhdGVkUHJvZmlsZVN0b3JhZ2Uuc2l6ZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRpbmcgZ2xvYmFsIHN0YXRlLi4uYCk7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLnVwZGF0ZVN0b3JhZ2VEYXRhKHByb2ZpbGUsIHVwZGF0ZWRQcm9maWxlU3RvcmFnZSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCBnbG9iYWwgc3RhdGVgLCBbLi4udXBkYXRlZFByb2ZpbGVTdG9yYWdlLmtleXMoKV0pO1xuXHRcdH1cblxuXHRcdGlmICh1cGRhdGVkU2hhcmVkU3RvcmFnZT8uc2l6ZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRpbmcgYXBwbGljYXRpb24gc2hhcmVkIHN0YXRlLi4uYCk7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLnVwZGF0ZVN0b3JhZ2VEYXRhKHByb2ZpbGUsIHVwZGF0ZWRTaGFyZWRTdG9yYWdlLCBTdG9yYWdlVGFyZ2V0LlVTRVIsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl9TSEFSRUQpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGVkIGFwcGxpY2F0aW9uIHNoYXJlZCBzdGF0ZWAsIFsuLi51cGRhdGVkU2hhcmVkU3RvcmFnZS5rZXlzKCldKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEdsb2JhbFN0YXRlSW5pdGlhbGl6ZXIgZXh0ZW5kcyBBYnN0cmFjdEluaXRpYWxpemVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlLCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBmaWxlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZG9Jbml0aWFsaXplKHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZW1vdGVHbG9iYWxTdGF0ZTogSUdsb2JhbFN0YXRlID0gcmVtb3RlVXNlckRhdGEuc3luY0RhdGEgPyBKU09OLnBhcnNlKHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhLmNvbnRlbnQpIDogbnVsbDtcblx0XHRpZiAoIXJlbW90ZUdsb2JhbFN0YXRlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnU2tpcHBpbmcgaW5pdGlhbGl6aW5nIGdsb2JhbCBzdGF0ZSBiZWNhdXNlIHJlbW90ZSBnbG9iYWwgc3RhdGUgZG9lcyBub3QgZXhpc3QuJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXJndjogSVN0cmluZ0RpY3Rpb25hcnk8YW55PiA9IHt9O1xuXHRcdGNvbnN0IGlzRGVmYXVsdFByb2ZpbGUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmhhc1Njb3BlKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUpO1xuXHRcdGNvbnN0IHN0b3JhZ2U6IElTdHJpbmdEaWN0aW9uYXJ5PGFueT4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhyZW1vdGVHbG9iYWxTdGF0ZS5zdG9yYWdlKSkge1xuXHRcdFx0aWYgKGtleS5zdGFydHNXaXRoKGFyZ3ZTdG9yYWdlUHJlZngpKSB7XG5cdFx0XHRcdGFyZ3Zba2V5LnN1YnN0cmluZyhhcmd2U3RvcmFnZVByZWZ4Lmxlbmd0aCldID0gcmVtb3RlR2xvYmFsU3RhdGUuc3RvcmFnZVtrZXldLnZhbHVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgaXNTaGFyZWRTY29wZSA9IHJlbW90ZUdsb2JhbFN0YXRlLnN0b3JhZ2Vba2V5XS5zY29wZSA9PT0gU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRDtcblx0XHRcdFx0aWYgKGlzU2hhcmVkU2NvcGUgJiYgIWlzRGVmYXVsdFByb2ZpbGUpIHtcblx0XHRcdFx0XHRjb250aW51ZTsgLy8gU2tpcCBBUFBMSUNBVElPTl9TSEFSRUQga2V5cyBmb3Igbm9uLWRlZmF1bHQgcHJvZmlsZXNcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzY29wZSA9IGlzU2hhcmVkU2NvcGUgPyBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEIDogU3RvcmFnZVNjb3BlLlBST0ZJTEU7XG5cdFx0XHRcdGlmICh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChrZXksIHNjb3BlKSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0c3RvcmFnZVtrZXldID0geyB2YWx1ZTogcmVtb3RlR2xvYmFsU3RhdGUuc3RvcmFnZVtrZXldLnZhbHVlLCBzY29wZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKE9iamVjdC5rZXlzKGFyZ3YpLmxlbmd0aCkge1xuXHRcdFx0bGV0IGNvbnRlbnQgPSAne30nO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZmlsZUNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3ZSZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnRlbnQgPSBmaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHsgfVxuXHRcdFx0Zm9yIChjb25zdCBhcmd2UHJvcGVydHkgb2YgT2JqZWN0LmtleXMoYXJndikpIHtcblx0XHRcdFx0Y29udGVudCA9IGVkaXQoY29udGVudCwgW2FyZ3ZQcm9wZXJ0eV0sIGFyZ3ZbYXJndlByb3BlcnR5XSwge30pO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYXJndlJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHR9XG5cblx0XHRpZiAoT2JqZWN0LmtleXMoc3RvcmFnZSkubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBzdG9yYWdlRW50cmllczogQXJyYXk8SVN0b3JhZ2VFbnRyeT4gPSBbXTtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHN0b3JhZ2UpKSB7XG5cdFx0XHRcdHN0b3JhZ2VFbnRyaWVzLnB1c2goeyBrZXksIHZhbHVlOiBzdG9yYWdlW2tleV0udmFsdWUsIHNjb3BlOiBzdG9yYWdlW2tleV0uc2NvcGUsIHRhcmdldDogU3RvcmFnZVRhcmdldC5VU0VSIH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZUFsbChzdG9yYWdlRW50cmllcywgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhU3luY1N0b3JlVHlwZVN5bmNocm9uaXplciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNTdG9yZUNsaWVudDogVXNlckRhdGFTeW5jU3RvcmVDbGllbnQsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0Z2V0U3luY1N0b3JlVHlwZSh1c2VyRGF0YTogSVVzZXJEYXRhKTogVXNlckRhdGFTeW5jU3RvcmVUeXBlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZW1vdGVHbG9iYWxTdGF0ZSA9IHRoaXMucGFyc2VHbG9iYWxTdGF0ZSh1c2VyRGF0YSk7XG5cdFx0cmV0dXJuIHJlbW90ZUdsb2JhbFN0YXRlPy5zdG9yYWdlW1NZTkNfU0VSVklDRV9VUkxfVFlQRV0/LnZhbHVlIGFzIFVzZXJEYXRhU3luY1N0b3JlVHlwZTtcblx0fVxuXG5cdGFzeW5jIHN5bmModXNlckRhdGFTeW5jU3RvcmVUeXBlOiBVc2VyRGF0YVN5bmNTdG9yZVR5cGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzeW5jSGVhZGVycyA9IGNyZWF0ZVN5bmNIZWFkZXJzKGdlbmVyYXRlVXVpZCgpKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZG9TeW5jKHVzZXJEYXRhU3luY1N0b3JlVHlwZSwgc3luY0hlYWRlcnMpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgVXNlckRhdGFTeW5jRXJyb3IpIHtcblx0XHRcdFx0c3dpdGNoIChlLmNvZGUpIHtcblx0XHRcdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5QcmVjb25kaXRpb25GYWlsZWQ6XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgRmFpbGVkIHRvIHN5bmNocm9uaXplIFVzZXJEYXRhU3luY1N0b3JlVHlwZSBhcyB0aGVyZSBpcyBhIG5ldyByZW1vdGUgdmVyc2lvbiBhdmFpbGFibGUuIFN5bmNocm9uaXppbmcgYWdhaW4uLi5gKTtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmRvU3luYyh1c2VyRGF0YVN5bmNTdG9yZVR5cGUsIHN5bmNIZWFkZXJzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU3luYyh1c2VyRGF0YVN5bmNTdG9yZVR5cGU6IFVzZXJEYXRhU3luY1N0b3JlVHlwZSwgc3luY0hlYWRlcnM6IElIZWFkZXJzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gUmVhZCB0aGUgZ2xvYmFsIHN0YXRlIGZyb20gcmVtb3RlXG5cdFx0Y29uc3QgZ2xvYmFsU3RhdGVVc2VyRGF0YSA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU3RvcmVDbGllbnQucmVhZFJlc291cmNlKFN5bmNSZXNvdXJjZS5HbG9iYWxTdGF0ZSwgbnVsbCwgdW5kZWZpbmVkLCBzeW5jSGVhZGVycyk7XG5cdFx0Y29uc3QgcmVtb3RlR2xvYmFsU3RhdGUgPSB0aGlzLnBhcnNlR2xvYmFsU3RhdGUoZ2xvYmFsU3RhdGVVc2VyRGF0YSkgfHwgeyBzdG9yYWdlOiB7fSB9O1xuXG5cdFx0Ly8gVXBkYXRlIHRoZSBzeW5jIHN0b3JlIHR5cGVcblx0XHRyZW1vdGVHbG9iYWxTdGF0ZS5zdG9yYWdlW1NZTkNfU0VSVklDRV9VUkxfVFlQRV0gPSB7IHZhbHVlOiB1c2VyRGF0YVN5bmNTdG9yZVR5cGUsIHZlcnNpb246IEdMT0JBTF9TVEFURV9EQVRBX1ZFUlNJT04gfTtcblxuXHRcdC8vIFdyaXRlIHRoZSBnbG9iYWwgc3RhdGUgdG8gcmVtb3RlXG5cdFx0Y29uc3QgbWFjaGluZUlkID0gYXdhaXQgZ2V0U2VydmljZU1hY2hpbmVJZCh0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy5maWxlU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3Qgc3luY0RhdGFUb1VwZGF0ZTogSVN5bmNEYXRhID0geyB2ZXJzaW9uOiBHTE9CQUxfU1RBVEVfREFUQV9WRVJTSU9OLCBtYWNoaW5lSWQsIGNvbnRlbnQ6IHN0cmluZ2lmeShyZW1vdGVHbG9iYWxTdGF0ZSwgZmFsc2UpIH07XG5cdFx0YXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTdG9yZUNsaWVudC53cml0ZVJlc291cmNlKFN5bmNSZXNvdXJjZS5HbG9iYWxTdGF0ZSwgSlNPTi5zdHJpbmdpZnkoc3luY0RhdGFUb1VwZGF0ZSksIGdsb2JhbFN0YXRlVXNlckRhdGEucmVmLCB1bmRlZmluZWQsIHN5bmNIZWFkZXJzKTtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VHbG9iYWxTdGF0ZSh7IGNvbnRlbnQgfTogSVVzZXJEYXRhKTogSUdsb2JhbFN0YXRlIHwgbnVsbCB7XG5cdFx0aWYgKCFjb250ZW50KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3Qgc3luY0RhdGEgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdGlmIChpc1N5bmNEYXRhKHN5bmNEYXRhKSkge1xuXHRcdFx0cmV0dXJuIHN5bmNEYXRhID8gSlNPTi5wYXJzZShzeW5jRGF0YS5jb250ZW50KSA6IG51bGw7XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCByZW1vdGUgZGF0YScpO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFHekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGFBQWE7QUFFdEIsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBd0IsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzVFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCLHNCQUFzQix5QkFBd0Usa0JBQWtCO0FBQzlJLFNBQVMsWUFBWTtBQUNyQixTQUFTLGFB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LHFCQUFxQixHQUFHO0FBQUEsRUFDM0Q7QUFBQSxFQUVBLE1BQU0sS0FBSyx1QkFBNkQ7QUFDdkUsVUFBTSxjQUFjLGtCQUFrQixhQUFhLENBQUM7QUFDcEQsUUFBSTtBQUNILGFBQU8sTUFBTSxLQUFLLE9BQU8sdUJBQXVCLFdBQVc7QUFBQSxJQUM1RCxTQUFTLEdBQUc7QUFDWCxVQUFJLGFBQWEsbUJBQW1CO0FBQ25DLGdCQUFRLEVBQUUsTUFBTTtBQUFBLFVBQ2YsS0FBSyxzQkFBc0I7QUFDMUIsaUJBQUssV0FBVyxLQUFLLGdIQUFnSDtBQUNySSxtQkFBTyxLQUFLLE9BQU8sdUJBQXVCLFdBQVc7QUFBQSxRQUN2RDtBQUFBLE1BQ0Q7QUFDQSxZQUFNO0FBQUEsSUFDUDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsT0FBTyx1QkFBOEMsYUFBc0M7QUFFeEcsVUFBTSxzQkFBc0IsTUFBTSxLQUFLLHdCQUF3QixhQUFhLGFBQWEsYUFBYSxNQUFNLFFBQVcsV0FBVztBQUNsSSxVQUFNLG9CQUFvQixLQUFLLGlCQUFpQixtQkFBbUIsS0FBSyxFQUFFLFNBQVMsQ0FBQyxFQUFFO0FBR3RGLHNCQUFrQixRQUFRLHFCQUFxQixJQUFJLEVBQUUsT0FBTyx1QkFBdUIsU0FBUywwQkFBMEI7QUFHdEgsVUFBTSxZQUFZLE1BQU0sb0JBQW9CLEtBQUssb0JBQW9CLEtBQUssYUFBYSxLQUFLLGNBQWM7QUFDMUcsVUFBTSxtQkFBOEIsRUFBRSxTQUFTLDJCQUEyQixXQUFXLFNBQVMsVUFBVSxtQkFBbUIsS0FBSyxFQUFFO0FBQ2xJLFVBQU0sS0FBSyx3QkFBd0IsY0FBYyxhQUFhLGFBQWEsS0FBSyxVQUFVLGdCQUFnQixHQUFHLG9CQUFvQixLQUFLLFFBQVcsV0FBVztBQUFBLEVBQzdKO0FBQUEsRUFFUSxpQkFBaUIsRUFBRSxRQUFRLEdBQW1DO0FBQ3JFLFFBQUksQ0FBQyxTQUFTO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFdBQVcsS0FBSyxNQUFNLE9BQU87QUFDbkMsUUFBSSxXQUFXLFFBQVEsR0FBRztBQUN6QixhQUFPLFdBQVcsS0FBSyxNQUFNLFNBQVMsT0FBTyxJQUFJO0FBQUEsSUFDbEQ7QUFDQSxVQUFNLElBQUksTUFBTSxxQkFBcUI7QUFBQSxFQUN0QztBQUVEO0FBekRhLG9DQUFOO0FBQUEsRUFJSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbInByb2ZpbGUiXQp9Cg==
