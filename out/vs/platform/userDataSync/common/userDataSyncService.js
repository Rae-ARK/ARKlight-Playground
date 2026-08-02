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
import { equals } from "../../../base/common/arrays.js";
import { createCancelablePromise, RunOnceScheduler } from "../../../base/common/async.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { isEqual } from "../../../base/common/resources.js";
import { isBoolean, isUndefined } from "../../../base/common/types.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IExtensionGalleryService } from "../../extensionManagement/common/extensionManagement.js";
import { IFileService } from "../../files/common/files.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { ExtensionsSynchroniser } from "./extensionsSync.js";
import { GlobalStateSynchroniser } from "./globalStateSync.js";
import { KeybindingsSynchroniser } from "./keybindingsSync.js";
import { PromptsSynchronizer } from "./promptsSync/promptsSync.js";
import { SettingsSynchroniser } from "./settingsSync.js";
import { SnippetsSynchroniser } from "./snippetsSync.js";
import { TasksSynchroniser } from "./tasksSync.js";
import { McpSynchroniser } from "./mcpSync.js";
import { UserDataProfilesManifestSynchroniser } from "./userDataProfilesManifestSync.js";
import {
  ALL_SYNC_RESOURCES,
  createSyncHeaders,
  IUserDataSyncEnablementService,
  IUserDataSyncLogService,
  IUserDataSyncStoreManagementService,
  IUserDataSyncStoreService,
  SyncResource,
  SyncStatus,
  UserDataSyncError,
  UserDataSyncErrorCode,
  UserDataSyncStoreError,
  USER_DATA_SYNC_CONFIGURATION_SCOPE,
  IUserDataSyncResourceProviderService,
  IUserDataSyncLocalStoreService,
  isUserDataManifest
} from "./userDataSync.js";
const LAST_SYNC_TIME_KEY = "sync.lastSyncTime";
let UserDataSyncService = class extends Disposable {
  constructor(fileService, userDataSyncStoreService, userDataSyncStoreManagementService, instantiationService, logService, telemetryService, storageService, userDataSyncEnablementService, userDataProfilesService, userDataSyncResourceProviderService, userDataSyncLocalStoreService) {
    super();
    this.fileService = fileService;
    this.userDataSyncStoreService = userDataSyncStoreService;
    this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
    this.instantiationService = instantiationService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this.storageService = storageService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.userDataProfilesService = userDataProfilesService;
    this.userDataSyncResourceProviderService = userDataSyncResourceProviderService;
    this.userDataSyncLocalStoreService = userDataSyncLocalStoreService;
    this._status = SyncStatus.Uninitialized;
    this._onDidChangeStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangeStatus.event;
    this._onDidChangeLocal = this._register(new Emitter());
    this.onDidChangeLocal = this._onDidChangeLocal.event;
    this._conflicts = [];
    this._onDidChangeConflicts = this._register(new Emitter());
    this.onDidChangeConflicts = this._onDidChangeConflicts.event;
    this._syncErrors = [];
    this._onSyncErrors = this._register(new Emitter());
    this.onSyncErrors = this._onSyncErrors.event;
    this._lastSyncTime = void 0;
    this._onDidChangeLastSyncTime = this._register(new Emitter());
    this.onDidChangeLastSyncTime = this._onDidChangeLastSyncTime.event;
    this._onDidResetLocal = this._register(new Emitter());
    this.onDidResetLocal = this._onDidResetLocal.event;
    this._onDidResetRemote = this._register(new Emitter());
    this.onDidResetRemote = this._onDidResetRemote.event;
    this.activeProfileSynchronizers = /* @__PURE__ */ new Map();
    this._status = userDataSyncStoreManagementService.userDataSyncStore ? SyncStatus.Idle : SyncStatus.Uninitialized;
    this._lastSyncTime = this.storageService.getNumber(LAST_SYNC_TIME_KEY, StorageScope.APPLICATION, void 0);
    this._register(toDisposable(() => this.clearActiveProfileSynchronizers()));
    this._register(new RunOnceScheduler(
      () => this.cleanUpStaleStorageData(),
      5 * 1e3
      /* after 5s */
    )).schedule();
  }
  get status() {
    return this._status;
  }
  get conflicts() {
    return this._conflicts;
  }
  get lastSyncTime() {
    return this._lastSyncTime;
  }
  async createSyncTask(manifest, disableCache) {
    this.checkEnablement();
    this.logService.info("Sync started.");
    const startTime = (/* @__PURE__ */ new Date()).getTime();
    const executionId = generateUuid();
    try {
      const syncHeaders = createSyncHeaders(executionId);
      if (disableCache) {
        syncHeaders["Cache-Control"] = "no-cache";
      }
      manifest = await this.userDataSyncStoreService.manifest(manifest, syncHeaders);
    } catch (error) {
      const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);
      reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
      throw userDataSyncError;
    }
    const executed = false;
    const that = this;
    let cancellablePromise;
    return {
      manifest,
      async run() {
        if (executed) {
          throw new Error("Can run a task only once");
        }
        cancellablePromise = createCancelablePromise((token) => that.sync(manifest, false, executionId, token));
        await cancellablePromise.finally(() => cancellablePromise = void 0);
        that.logService.info(`Sync done. Took ${(/* @__PURE__ */ new Date()).getTime() - startTime}ms`);
        that.updateLastSyncTime();
      },
      stop() {
        cancellablePromise?.cancel();
        return that.stop();
      }
    };
  }
  async createManualSyncTask() {
    this.checkEnablement();
    if (this.userDataSyncEnablementService.isEnabled()) {
      throw new UserDataSyncError("Cannot start manual sync when sync is enabled", UserDataSyncErrorCode.LocalError);
    }
    this.logService.info("Sync started.");
    const startTime = (/* @__PURE__ */ new Date()).getTime();
    const executionId = generateUuid();
    const syncHeaders = createSyncHeaders(executionId);
    let latestUserDataOrManifest;
    try {
      latestUserDataOrManifest = await this.userDataSyncStoreService.getLatestData(syncHeaders);
    } catch (error) {
      const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);
      this.telemetryService.publicLog2(
        "sync.download.latest",
        {
          code: userDataSyncError.code,
          serverCode: userDataSyncError instanceof UserDataSyncStoreError ? String(userDataSyncError.serverCode) : void 0,
          url: userDataSyncError instanceof UserDataSyncStoreError ? userDataSyncError.url : void 0,
          resource: userDataSyncError.resource,
          executionId,
          service: this.userDataSyncStoreManagementService.userDataSyncStore.url.toString()
        }
      );
      try {
        latestUserDataOrManifest = await this.userDataSyncStoreService.manifest(null, syncHeaders);
      } catch (error2) {
        const userDataSyncError2 = UserDataSyncError.toUserDataSyncError(error2);
        reportUserDataSyncError(userDataSyncError2, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
        throw userDataSyncError2;
      }
    }
    await this.resetLocal();
    const that = this;
    const cancellableToken = new CancellationTokenSource();
    return {
      id: executionId,
      async merge() {
        return that.sync(latestUserDataOrManifest, true, executionId, cancellableToken.token);
      },
      async apply() {
        try {
          try {
            await that.applyManualSync(latestUserDataOrManifest, executionId, cancellableToken.token);
          } catch (error) {
            if (UserDataSyncError.toUserDataSyncError(error).code === UserDataSyncErrorCode.MethodNotFound) {
              that.logService.info("Client is making invalid requests. Cleaning up data...");
              await that.cleanUpRemoteData();
              that.logService.info("Applying manual sync again...");
              await that.applyManualSync(latestUserDataOrManifest, executionId, cancellableToken.token);
            } else {
              throw error;
            }
          }
        } catch (error) {
          that.logService.error(error);
          throw error;
        }
        that.logService.info(`Sync done. Took ${(/* @__PURE__ */ new Date()).getTime() - startTime}ms`);
        that.updateLastSyncTime();
      },
      async stop() {
        cancellableToken.cancel();
        await that.stop();
        await that.resetLocal();
      }
    };
  }
  async sync(manifestOrLatestData, preview, executionId, token) {
    this._syncErrors = [];
    try {
      if (this.status !== SyncStatus.HasConflicts) {
        this.setStatus(SyncStatus.Syncing);
      }
      const defaultProfileSynchronizer = this.getOrCreateActiveProfileSynchronizer(this.userDataProfilesService.defaultProfile, void 0);
      this._syncErrors.push(...await this.syncProfile(defaultProfileSynchronizer, manifestOrLatestData, preview, executionId, token));
      const userDataProfileManifestSynchronizer = defaultProfileSynchronizer.enabled.find((s) => s.resource === SyncResource.Profiles);
      if (userDataProfileManifestSynchronizer) {
        const syncProfiles = await userDataProfileManifestSynchronizer.getLastSyncedProfiles() || [];
        if (token.isCancellationRequested) {
          return;
        }
        await this.syncRemoteProfiles(syncProfiles, manifestOrLatestData, preview, executionId, token);
      }
    } finally {
      if (this.status !== SyncStatus.HasConflicts) {
        this.setStatus(SyncStatus.Idle);
      }
      this._onSyncErrors.fire(this._syncErrors);
    }
  }
  async syncRemoteProfiles(remoteProfiles, manifest, preview, executionId, token) {
    for (const syncProfile of remoteProfiles) {
      if (token.isCancellationRequested) {
        return;
      }
      const profile = this.userDataProfilesService.profiles.find((p) => p.id === syncProfile.id);
      if (!profile) {
        this.logService.error(`Profile with id:${syncProfile.id} and name: ${syncProfile.name} does not exist locally to sync.`);
        continue;
      }
      this.logService.info("Syncing profile.", syncProfile.name);
      const profileSynchronizer = this.getOrCreateActiveProfileSynchronizer(profile, syncProfile);
      this._syncErrors.push(...await this.syncProfile(profileSynchronizer, manifest, preview, executionId, token));
    }
    for (const [key, profileSynchronizerItem] of this.activeProfileSynchronizers.entries()) {
      if (this.userDataProfilesService.profiles.some((p) => p.id === profileSynchronizerItem[0].profile.id)) {
        continue;
      }
      await profileSynchronizerItem[0].resetLocal();
      profileSynchronizerItem[1].dispose();
      this.activeProfileSynchronizers.delete(key);
    }
  }
  async applyManualSync(manifestOrLatestData, executionId, token) {
    try {
      this.setStatus(SyncStatus.Syncing);
      const profileSynchronizers = this.getActiveProfileSynchronizers();
      for (const profileSynchronizer of profileSynchronizers) {
        if (token.isCancellationRequested) {
          return;
        }
        await profileSynchronizer.apply(executionId, token);
      }
      const defaultProfileSynchronizer = profileSynchronizers.find((s) => s.profile.isDefault);
      if (!defaultProfileSynchronizer) {
        return;
      }
      const userDataProfileManifestSynchronizer = defaultProfileSynchronizer.enabled.find((s) => s.resource === SyncResource.Profiles);
      if (!userDataProfileManifestSynchronizer) {
        return;
      }
      const remoteProfiles = await userDataProfileManifestSynchronizer.getRemoteSyncedProfiles(getRefOrUserData(manifestOrLatestData, void 0, SyncResource.Profiles) ?? null) || [];
      const remoteProfilesToSync = remoteProfiles.filter((remoteProfile) => profileSynchronizers.every((s) => s.profile.id !== remoteProfile.id));
      if (remoteProfilesToSync.length) {
        await this.syncRemoteProfiles(remoteProfilesToSync, manifestOrLatestData, false, executionId, token);
      }
    } finally {
      this.setStatus(SyncStatus.Idle);
    }
  }
  async syncProfile(profileSynchronizer, manifestOrLatestData, preview, executionId, token) {
    const errors = await profileSynchronizer.sync(manifestOrLatestData, preview, executionId, token);
    return errors.map(([syncResource, error]) => ({ profile: profileSynchronizer.profile, syncResource, error }));
  }
  async stop() {
    if (this.status !== SyncStatus.Idle) {
      await Promise.allSettled(this.getActiveProfileSynchronizers().map((profileSynchronizer) => profileSynchronizer.stop()));
    }
  }
  async resolveContent(resource) {
    const content = await this.userDataSyncResourceProviderService.resolveContent(resource);
    if (content) {
      return content;
    }
    for (const profileSynchronizer of this.getActiveProfileSynchronizers()) {
      for (const synchronizer of profileSynchronizer.enabled) {
        const content2 = await synchronizer.resolveContent(resource);
        if (content2) {
          return content2;
        }
      }
    }
    return null;
  }
  async replace(syncResourceHandle) {
    this.checkEnablement();
    const profileSyncResource = this.userDataSyncResourceProviderService.resolveUserDataSyncResource(syncResourceHandle);
    if (!profileSyncResource) {
      return;
    }
    const content = await this.resolveContent(syncResourceHandle.uri);
    if (!content) {
      return;
    }
    await this.performAction(profileSyncResource.profile, async (synchronizer) => {
      if (profileSyncResource.syncResource === synchronizer.resource) {
        await synchronizer.replace(content);
        return true;
      }
      return void 0;
    });
    return;
  }
  async accept(syncResource, resource, content, apply) {
    this.checkEnablement();
    await this.performAction(syncResource.profile, async (synchronizer) => {
      if (syncResource.syncResource === synchronizer.resource) {
        await synchronizer.accept(resource, content);
        if (apply) {
          await synchronizer.apply(isBoolean(apply) ? false : apply.force, createSyncHeaders(generateUuid()));
        }
        return true;
      }
      return void 0;
    });
  }
  async hasLocalData() {
    const result = await this.performAction(this.userDataProfilesService.defaultProfile, async (synchronizer) => {
      if (synchronizer.resource !== SyncResource.GlobalState && await synchronizer.hasLocalData()) {
        return true;
      }
      return void 0;
    });
    return !!result;
  }
  async hasPreviouslySynced() {
    const result = await this.performAction(this.userDataProfilesService.defaultProfile, async (synchronizer) => {
      if (await synchronizer.hasPreviouslySynced()) {
        return true;
      }
      return void 0;
    });
    return !!result;
  }
  async reset() {
    this.checkEnablement();
    await this.resetRemote();
    await this.resetLocal();
  }
  async resetRemote() {
    this.checkEnablement();
    try {
      await this.userDataSyncStoreService.clear();
      this.logService.info("Cleared data on server");
    } catch (e) {
      this.logService.error(e);
    }
    this._onDidResetRemote.fire();
  }
  async resetLocal() {
    this.checkEnablement();
    this._lastSyncTime = void 0;
    this.storageService.remove(LAST_SYNC_TIME_KEY, StorageScope.APPLICATION);
    for (const [synchronizer] of this.activeProfileSynchronizers.values()) {
      try {
        await synchronizer.resetLocal();
      } catch (e) {
        this.logService.error(e);
      }
    }
    this.clearActiveProfileSynchronizers();
    this._onDidResetLocal.fire();
    this.logService.info("Did reset the local sync state.");
  }
  async cleanUpStaleStorageData() {
    const allKeys = this.storageService.keys(StorageScope.APPLICATION, StorageTarget.MACHINE);
    const lastSyncProfileKeys = [];
    for (const key of allKeys) {
      if (!key.endsWith(".lastSyncUserData")) {
        continue;
      }
      const segments = key.split(".");
      if (segments.length === 3) {
        lastSyncProfileKeys.push([key, segments[0]]);
      }
    }
    if (!lastSyncProfileKeys.length) {
      return;
    }
    const disposables = new DisposableStore();
    try {
      let defaultProfileSynchronizer = this.activeProfileSynchronizers.get(this.userDataProfilesService.defaultProfile.id)?.[0];
      if (!defaultProfileSynchronizer) {
        defaultProfileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, this.userDataProfilesService.defaultProfile, void 0));
      }
      const userDataProfileManifestSynchronizer = defaultProfileSynchronizer.enabled.find((s) => s.resource === SyncResource.Profiles);
      if (!userDataProfileManifestSynchronizer) {
        return;
      }
      const lastSyncedProfiles = await userDataProfileManifestSynchronizer.getLastSyncedProfiles();
      const lastSyncedCollections = lastSyncedProfiles?.map((p) => p.collection) ?? [];
      for (const [key, collection] of lastSyncProfileKeys) {
        if (!lastSyncedCollections.includes(collection)) {
          this.logService.info(`Removing last sync state for stale profile: ${collection}`);
          this.storageService.remove(key, StorageScope.APPLICATION);
        }
      }
    } finally {
      disposables.dispose();
    }
  }
  async cleanUpRemoteData() {
    const remoteProfiles = await this.userDataSyncResourceProviderService.getRemoteSyncedProfiles();
    const remoteProfileCollections = remoteProfiles.map((profile) => profile.collection);
    const allCollections = await this.userDataSyncStoreService.getAllCollections();
    const redundantCollections = allCollections.filter((c) => !remoteProfileCollections.includes(c));
    if (redundantCollections.length) {
      this.logService.info(`Deleting ${redundantCollections.length} redundant collections on server`);
      await Promise.allSettled(redundantCollections.map((collectionId) => this.userDataSyncStoreService.deleteCollection(collectionId)));
      this.logService.info(`Deleted redundant collections on server`);
    }
    const updatedRemoteProfiles = remoteProfiles.filter((profile) => allCollections.includes(profile.collection));
    if (updatedRemoteProfiles.length !== remoteProfiles.length) {
      const profileManifestSynchronizer = this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, this.userDataProfilesService.defaultProfile, void 0);
      try {
        this.logService.info("Resetting the last synced state of profiles");
        await profileManifestSynchronizer.resetLocal();
        this.logService.info("Did reset the last synced state of profiles");
        this.logService.info(`Updating remote profiles with invalid collections on server`);
        await profileManifestSynchronizer.updateRemoteProfiles(updatedRemoteProfiles, null);
        this.logService.info(`Updated remote profiles on server`);
      } finally {
        profileManifestSynchronizer.dispose();
      }
    }
  }
  async saveRemoteActivityData(location) {
    this.checkEnablement();
    const data = await this.userDataSyncStoreService.getActivityData();
    await this.fileService.writeFile(location, data);
  }
  async extractActivityData(activityDataResource, location) {
    const content = (await this.fileService.readFile(activityDataResource)).value.toString();
    const activityData = JSON.parse(content);
    if (activityData.resources) {
      for (const resource in activityData.resources) {
        for (const version of activityData.resources[resource]) {
          await this.userDataSyncLocalStoreService.writeResource(resource, version.content, new Date(version.created * 1e3), void 0, location);
        }
      }
    }
    if (activityData.collections) {
      for (const collection in activityData.collections) {
        for (const resource in activityData.collections[collection].resources) {
          for (const version of activityData.collections[collection].resources?.[resource] ?? []) {
            await this.userDataSyncLocalStoreService.writeResource(resource, version.content, new Date(version.created * 1e3), collection, location);
          }
        }
      }
    }
  }
  async performAction(profile, action) {
    const disposables = new DisposableStore();
    try {
      const activeProfileSyncronizer = this.activeProfileSynchronizers.get(profile.id);
      if (activeProfileSyncronizer) {
        const result = await this.performActionWithProfileSynchronizer(activeProfileSyncronizer[0], action, disposables);
        return isUndefined(result) ? null : result;
      }
      if (profile.isDefault) {
        const defaultProfileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, profile, void 0));
        const result = await this.performActionWithProfileSynchronizer(defaultProfileSynchronizer, action, disposables);
        return isUndefined(result) ? null : result;
      }
      const userDataProfileManifestSynchronizer = disposables.add(this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, profile, void 0));
      const manifest = await this.userDataSyncStoreService.manifest(null);
      const syncProfiles = await userDataProfileManifestSynchronizer.getRemoteSyncedProfiles(manifest?.latest?.profiles ?? null) || [];
      const syncProfile = syncProfiles.find((syncProfile2) => syncProfile2.id === profile.id);
      if (syncProfile) {
        const profileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, profile, syncProfile.collection));
        const result = await this.performActionWithProfileSynchronizer(profileSynchronizer, action, disposables);
        return isUndefined(result) ? null : result;
      }
      return null;
    } finally {
      disposables.dispose();
    }
  }
  async performActionWithProfileSynchronizer(profileSynchronizer, action, disposables) {
    const allSynchronizers = [...profileSynchronizer.enabled, ...profileSynchronizer.disabled.reduce((synchronizers, syncResource) => {
      if (syncResource !== SyncResource.WorkspaceState) {
        synchronizers.push(disposables.add(profileSynchronizer.createSynchronizer(syncResource)));
      }
      return synchronizers;
    }, [])];
    for (const synchronizer of allSynchronizers) {
      const result = await action(synchronizer);
      if (!isUndefined(result)) {
        return result;
      }
    }
    return void 0;
  }
  setStatus(status) {
    const oldStatus = this._status;
    if (this._status !== status) {
      this._status = status;
      this._onDidChangeStatus.fire(status);
      if (oldStatus === SyncStatus.HasConflicts) {
        this.updateLastSyncTime();
      }
    }
  }
  updateConflicts() {
    const conflicts = this.getActiveProfileSynchronizers().map((synchronizer) => synchronizer.conflicts).flat();
    if (!equals(this._conflicts, conflicts, (a, b) => a.profile.id === b.profile.id && a.syncResource === b.syncResource && equals(a.conflicts, b.conflicts, (a2, b2) => isEqual(a2.previewResource, b2.previewResource)))) {
      this._conflicts = conflicts;
      this._onDidChangeConflicts.fire(conflicts);
    }
  }
  updateLastSyncTime() {
    if (this.status === SyncStatus.Idle) {
      this._lastSyncTime = (/* @__PURE__ */ new Date()).getTime();
      this.storageService.store(LAST_SYNC_TIME_KEY, this._lastSyncTime, StorageScope.APPLICATION, StorageTarget.MACHINE);
      this._onDidChangeLastSyncTime.fire(this._lastSyncTime);
    }
  }
  getOrCreateActiveProfileSynchronizer(profile, syncProfile) {
    let activeProfileSynchronizer = this.activeProfileSynchronizers.get(profile.id);
    if (activeProfileSynchronizer && activeProfileSynchronizer[0].collection !== syncProfile?.collection) {
      this.logService.error("Profile synchronizer collection does not match with the remote sync profile collection");
      activeProfileSynchronizer[1].dispose();
      activeProfileSynchronizer = void 0;
      this.activeProfileSynchronizers.delete(profile.id);
    }
    if (!activeProfileSynchronizer) {
      const disposables = new DisposableStore();
      const profileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, profile, syncProfile?.collection));
      disposables.add(profileSynchronizer.onDidChangeStatus((e) => this.setStatus(e)));
      disposables.add(profileSynchronizer.onDidChangeConflicts((conflicts) => this.updateConflicts()));
      disposables.add(profileSynchronizer.onDidChangeLocal((e) => this._onDidChangeLocal.fire(e)));
      this.activeProfileSynchronizers.set(profile.id, activeProfileSynchronizer = [profileSynchronizer, disposables]);
    }
    return activeProfileSynchronizer[0];
  }
  getActiveProfileSynchronizers() {
    const profileSynchronizers = [];
    for (const [profileSynchronizer] of this.activeProfileSynchronizers.values()) {
      profileSynchronizers.push(profileSynchronizer);
    }
    return profileSynchronizers;
  }
  clearActiveProfileSynchronizers() {
    this.activeProfileSynchronizers.forEach(([, disposable]) => disposable.dispose());
    this.activeProfileSynchronizers.clear();
  }
  checkEnablement() {
    if (!this.userDataSyncStoreManagementService.userDataSyncStore) {
      throw new Error("Not enabled");
    }
  }
};
UserDataSyncService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUserDataSyncStoreService),
  __decorateParam(2, IUserDataSyncStoreManagementService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IUserDataSyncLogService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IUserDataSyncEnablementService),
  __decorateParam(8, IUserDataProfilesService),
  __decorateParam(9, IUserDataSyncResourceProviderService),
  __decorateParam(10, IUserDataSyncLocalStoreService)
], UserDataSyncService);
let ProfileSynchronizer = class extends Disposable {
  constructor(profile, collection, userDataSyncEnablementService, instantiationService, extensionGalleryService, userDataSyncStoreManagementService, telemetryService, logService, configurationService) {
    super();
    this.profile = profile;
    this.collection = collection;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.instantiationService = instantiationService;
    this.extensionGalleryService = extensionGalleryService;
    this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
    this.telemetryService = telemetryService;
    this.logService = logService;
    this.configurationService = configurationService;
    this._enabled = [];
    this._status = SyncStatus.Idle;
    this._onDidChangeStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangeStatus.event;
    this._onDidChangeLocal = this._register(new Emitter());
    this.onDidChangeLocal = this._onDidChangeLocal.event;
    this._conflicts = [];
    this._onDidChangeConflicts = this._register(new Emitter());
    this.onDidChangeConflicts = this._onDidChangeConflicts.event;
    this._register(userDataSyncEnablementService.onDidChangeResourceEnablement(([syncResource, enablement]) => this.onDidChangeResourceEnablement(syncResource, enablement)));
    this._register(toDisposable(() => this._enabled.splice(0, this._enabled.length).forEach(([, , disposable]) => disposable.dispose())));
    for (const syncResource of ALL_SYNC_RESOURCES) {
      if (userDataSyncEnablementService.isResourceEnabled(syncResource)) {
        this.registerSynchronizer(syncResource);
      }
    }
  }
  get enabled() {
    return this._enabled.sort((a, b) => a[1] - b[1]).map(([synchronizer]) => synchronizer);
  }
  get disabled() {
    return ALL_SYNC_RESOURCES.filter((syncResource) => !this.userDataSyncEnablementService.isResourceEnabled(syncResource));
  }
  get status() {
    return this._status;
  }
  get conflicts() {
    return this._conflicts;
  }
  onDidChangeResourceEnablement(syncResource, enabled) {
    if (enabled) {
      this.registerSynchronizer(syncResource);
    } else {
      this.deRegisterSynchronizer(syncResource);
    }
  }
  registerSynchronizer(syncResource) {
    if (this._enabled.some(([synchronizer2]) => synchronizer2.resource === syncResource)) {
      return;
    }
    if (syncResource === SyncResource.Extensions && !this.extensionGalleryService.isEnabled()) {
      this.logService.info("Skipping extensions sync because gallery is not configured");
      return;
    }
    if (syncResource === SyncResource.Profiles) {
      if (!this.profile.isDefault) {
        return;
      }
    }
    if (syncResource === SyncResource.WorkspaceState) {
      return;
    }
    if (syncResource !== SyncResource.Profiles && this.profile.useDefaultFlags?.[syncResource]) {
      this.logService.debug(`Skipping syncing ${syncResource} in ${this.profile.name} because it is already synced by default profile`);
      return;
    }
    const disposables = new DisposableStore();
    const synchronizer = disposables.add(this.createSynchronizer(syncResource));
    disposables.add(synchronizer.onDidChangeStatus(() => this.updateStatus()));
    disposables.add(synchronizer.onDidChangeConflicts(() => this.updateConflicts()));
    disposables.add(synchronizer.onDidChangeLocal(() => this._onDidChangeLocal.fire(syncResource)));
    const order = this.getOrder(syncResource);
    this._enabled.push([synchronizer, order, disposables]);
  }
  deRegisterSynchronizer(syncResource) {
    const index = this._enabled.findIndex(([synchronizer]) => synchronizer.resource === syncResource);
    if (index !== -1) {
      const [[synchronizer, , disposable]] = this._enabled.splice(index, 1);
      disposable.dispose();
      this.updateStatus();
      synchronizer.stop().then(null, (error) => this.logService.error(error));
    }
  }
  createSynchronizer(syncResource) {
    switch (syncResource) {
      case SyncResource.Settings:
        return this.instantiationService.createInstance(SettingsSynchroniser, this.profile, this.collection);
      case SyncResource.Keybindings:
        return this.instantiationService.createInstance(KeybindingsSynchroniser, this.profile, this.collection);
      case SyncResource.Snippets:
        return this.instantiationService.createInstance(SnippetsSynchroniser, this.profile, this.collection);
      case SyncResource.Prompts:
        return this.instantiationService.createInstance(PromptsSynchronizer, this.profile, this.collection);
      case SyncResource.Tasks:
        return this.instantiationService.createInstance(TasksSynchroniser, this.profile, this.collection);
      case SyncResource.Mcp:
        return this.instantiationService.createInstance(McpSynchroniser, this.profile, this.collection);
      case SyncResource.GlobalState:
        return this.instantiationService.createInstance(GlobalStateSynchroniser, this.profile, this.collection);
      case SyncResource.Extensions:
        return this.instantiationService.createInstance(ExtensionsSynchroniser, this.profile, this.collection);
      case SyncResource.Profiles:
        return this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, this.profile, this.collection);
    }
  }
  async sync(manifestOrLatestData, preview, executionId, token) {
    if (token.isCancellationRequested) {
      return [];
    }
    const synchronizers = this.enabled;
    if (!synchronizers.length) {
      return [];
    }
    try {
      const syncErrors = [];
      const syncHeaders = createSyncHeaders(executionId);
      const userDataSyncConfiguration = preview ? await this.getUserDataSyncConfiguration(manifestOrLatestData) : this.getLocalUserDataSyncConfiguration();
      for (const synchroniser of synchronizers) {
        if (token.isCancellationRequested) {
          return [];
        }
        if (!this.userDataSyncEnablementService.isResourceEnabled(synchroniser.resource)) {
          return [];
        }
        try {
          const refOrUserData = getRefOrUserData(manifestOrLatestData, this.collection, synchroniser.resource) ?? null;
          await synchroniser.sync(refOrUserData, preview, userDataSyncConfiguration, syncHeaders);
        } catch (e) {
          const userDataSyncError = UserDataSyncError.toUserDataSyncError(e);
          reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
          if (canBailout(e)) {
            throw userDataSyncError;
          }
          this.logService.error(e);
          this.logService.error(`${synchroniser.resource}: ${toErrorMessage(e)}`);
          syncErrors.push([synchroniser.resource, userDataSyncError]);
        }
      }
      return syncErrors;
    } finally {
      this.updateStatus();
    }
  }
  async apply(executionId, token) {
    const syncHeaders = createSyncHeaders(executionId);
    for (const synchroniser of this.enabled) {
      if (token.isCancellationRequested) {
        return;
      }
      try {
        await synchroniser.apply(false, syncHeaders);
      } catch (e) {
        const userDataSyncError = UserDataSyncError.toUserDataSyncError(e);
        reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
        if (canBailout(e)) {
          throw userDataSyncError;
        }
        this.logService.error(e);
        this.logService.error(`${synchroniser.resource}: ${toErrorMessage(e)}`);
      }
    }
  }
  async stop() {
    for (const synchroniser of this.enabled) {
      try {
        if (synchroniser.status !== SyncStatus.Idle) {
          await synchroniser.stop();
        }
      } catch (e) {
        this.logService.error(e);
      }
    }
  }
  async resetLocal() {
    for (const synchroniser of this.enabled) {
      try {
        await synchroniser.resetLocal();
      } catch (e) {
        this.logService.error(`${synchroniser.resource}: ${toErrorMessage(e)}`);
        this.logService.error(e);
      }
    }
  }
  async getUserDataSyncConfiguration(manifestOrLatestData) {
    if (!this.profile.isDefault) {
      return {};
    }
    const local = this.getLocalUserDataSyncConfiguration();
    const settingsSynchronizer = this.enabled.find((synchronizer) => synchronizer instanceof SettingsSynchroniser);
    if (settingsSynchronizer) {
      const remote = await settingsSynchronizer.getRemoteUserDataSyncConfiguration(getRefOrUserData(manifestOrLatestData, this.collection, SyncResource.Settings) ?? null);
      return { ...local, ...remote };
    }
    return local;
  }
  getLocalUserDataSyncConfiguration() {
    return this.configurationService.getValue(USER_DATA_SYNC_CONFIGURATION_SCOPE);
  }
  setStatus(status) {
    if (this._status !== status) {
      this._status = status;
      this._onDidChangeStatus.fire(status);
    }
  }
  updateStatus() {
    this.updateConflicts();
    if (this.enabled.some((s) => s.status === SyncStatus.HasConflicts)) {
      return this.setStatus(SyncStatus.HasConflicts);
    }
    if (this.enabled.some((s) => s.status === SyncStatus.Syncing)) {
      return this.setStatus(SyncStatus.Syncing);
    }
    return this.setStatus(SyncStatus.Idle);
  }
  updateConflicts() {
    const conflicts = this.enabled.filter((s) => s.status === SyncStatus.HasConflicts).filter((s) => s.conflicts.conflicts.length > 0).map((s) => s.conflicts);
    if (!equals(this._conflicts, conflicts, (a, b) => a.syncResource === b.syncResource && equals(a.conflicts, b.conflicts, (a2, b2) => isEqual(a2.previewResource, b2.previewResource)))) {
      this._conflicts = conflicts;
      this._onDidChangeConflicts.fire(conflicts);
    }
  }
  getOrder(syncResource) {
    switch (syncResource) {
      case SyncResource.Settings:
        return 0;
      case SyncResource.Keybindings:
        return 1;
      case SyncResource.Snippets:
        return 2;
      case SyncResource.Tasks:
        return 3;
      case SyncResource.Mcp:
        return 4;
      case SyncResource.GlobalState:
        return 5;
      case SyncResource.Extensions:
        return 6;
      case SyncResource.Prompts:
        return 7;
      case SyncResource.Profiles:
        return 8;
      case SyncResource.WorkspaceState:
        return 9;
    }
  }
};
ProfileSynchronizer = __decorateClass([
  __decorateParam(2, IUserDataSyncEnablementService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IExtensionGalleryService),
  __decorateParam(5, IUserDataSyncStoreManagementService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IUserDataSyncLogService),
  __decorateParam(8, IConfigurationService)
], ProfileSynchronizer);
function canBailout(e) {
  if (e instanceof UserDataSyncError) {
    switch (e.code) {
      case UserDataSyncErrorCode.MethodNotFound:
      case UserDataSyncErrorCode.TooLarge:
      case UserDataSyncErrorCode.TooManyRequests:
      case UserDataSyncErrorCode.TooManyRequestsAndRetryAfter:
      case UserDataSyncErrorCode.LocalTooManyRequests:
      case UserDataSyncErrorCode.LocalTooManyProfiles:
      case UserDataSyncErrorCode.Gone:
      case UserDataSyncErrorCode.UpgradeRequired:
      case UserDataSyncErrorCode.IncompatibleRemoteContent:
      case UserDataSyncErrorCode.IncompatibleLocalContent:
        return true;
    }
  }
  return false;
}
function reportUserDataSyncError(userDataSyncError, executionId, userDataSyncStoreManagementService, telemetryService) {
  telemetryService.publicLog2(
    "sync/error",
    {
      code: userDataSyncError.code,
      serverCode: userDataSyncError instanceof UserDataSyncStoreError ? String(userDataSyncError.serverCode) : void 0,
      url: userDataSyncError instanceof UserDataSyncStoreError ? userDataSyncError.url : void 0,
      resource: userDataSyncError.resource,
      executionId,
      service: userDataSyncStoreManagementService.userDataSyncStore.url.toString()
    }
  );
}
function getRefOrUserData(manifestOrLatestData, collection, resource) {
  if (isUserDataManifest(manifestOrLatestData)) {
    if (collection) {
      return manifestOrLatestData?.collections?.[collection]?.latest?.[resource];
    }
    return manifestOrLatestData?.latest?.[resource];
  }
  if (collection) {
    return manifestOrLatestData?.collections?.[collection]?.resources?.[resource];
  }
  return manifestOrLatestData?.resources?.[resource];
}
export {
  UserDataSyncService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc0Jvb2xlYW4sIGlzVW5kZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNTeW5jaHJvbmlzZXIgfSBmcm9tICcuL2V4dGVuc2lvbnNTeW5jLmpzJztcbmltcG9ydCB7IEdsb2JhbFN0YXRlU3luY2hyb25pc2VyIH0gZnJvbSAnLi9nbG9iYWxTdGF0ZVN5bmMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NTeW5jaHJvbmlzZXIgfSBmcm9tICcuL2tleWJpbmRpbmdzU3luYy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzU3luY2hyb25pemVyIH0gZnJvbSAnLi9wcm9tcHRzU3luYy9wcm9tcHRzU3luYy5qcyc7XG5pbXBvcnQgeyBTZXR0aW5nc1N5bmNocm9uaXNlciB9IGZyb20gJy4vc2V0dGluZ3NTeW5jLmpzJztcbmltcG9ydCB7IFNuaXBwZXRzU3luY2hyb25pc2VyIH0gZnJvbSAnLi9zbmlwcGV0c1N5bmMuanMnO1xuaW1wb3J0IHsgVGFza3NTeW5jaHJvbmlzZXIgfSBmcm9tICcuL3Rhc2tzU3luYy5qcyc7XG5pbXBvcnQgeyBNY3BTeW5jaHJvbmlzZXIgfSBmcm9tICcuL21jcFN5bmMuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFQcm9maWxlc01hbmlmZXN0U3luY2hyb25pc2VyIH0gZnJvbSAnLi91c2VyRGF0YVByb2ZpbGVzTWFuaWZlc3RTeW5jLmpzJztcbmltcG9ydCB7XG5cdEFMTF9TWU5DX1JFU09VUkNFUywgY3JlYXRlU3luY0hlYWRlcnMsIElVc2VyRGF0YU1hbnVhbFN5bmNUYXNrLCBJVXNlckRhdGFTeW5jUmVzb3VyY2VDb25mbGljdHMsIElVc2VyRGF0YVN5bmNSZXNvdXJjZUVycm9yLFxuXHRJVXNlckRhdGFTeW5jUmVzb3VyY2UsIElTeW5jUmVzb3VyY2VIYW5kbGUsIElVc2VyRGF0YVN5bmNUYXNrLCBJU3luY1VzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhTWFuaWZlc3QsIElVc2VyRGF0YVN5bmNDb25maWd1cmF0aW9uLFxuXHRJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIElVc2VyRGF0YVN5bmNocm9uaXNlciwgSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsIElVc2VyRGF0YVN5bmNTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSxcblx0U3luY1Jlc291cmNlLCBTeW5jU3RhdHVzLCBVc2VyRGF0YVN5bmNFcnJvciwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLCBVc2VyRGF0YVN5bmNTdG9yZUVycm9yLCBVU0VSX0RBVEFfU1lOQ19DT05GSUdVUkFUSU9OX1NDT1BFLCBJVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UsIElVc2VyRGF0YVN5bmNBY3Rpdml0eURhdGEsIElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSxcblx0SVVzZXJEYXRhU3luY0xhdGVzdERhdGEsXG5cdElVc2VyRGF0YSxcblx0aXNVc2VyRGF0YU1hbmlmZXN0LFxufSBmcm9tICcuL3VzZXJEYXRhU3luYy5qcyc7XG5cbnR5cGUgU3luY0Vycm9yQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnc2FuZHkwODEnO1xuXHRjb21tZW50OiAnSW5mb3JtYXRpb24gYWJvdXQgdGhlIGVycm9yIHRoYXQgb2NjdXJyZWQgd2hpbGUgc3luY2luZyc7XG5cdGNvZGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdlcnJvciBjb2RlJyB9O1xuXHRzZXJ2aWNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnU2V0dGluZ3MgU3luYyBzZXJ2aWNlIGZvciB3aGljaCB0aGlzIGVycm9yIGhhcyBvY2N1cnJlZCcgfTtcblx0c2VydmVyQ29kZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdTZXR0aW5ncyBTeW5jIHNlcnZpY2UgZXJyb3IgY29kZScgfTtcblx0dXJsPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1NldHRpbmdzIFN5bmMgcmVzb3VyY2UgVVJMIGZvciB3aGljaCB0aGlzIGVycm9yIGhhcyBvY2N1cnJlZCcgfTtcblx0cmVzb3VyY2U/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnU2V0dGluZ3MgU3luYyByZXNvdXJjZSBmb3Igd2hpY2ggdGhpcyBlcnJvciBoYXMgb2NjdXJyZWQnIH07XG5cdGV4ZWN1dGlvbklkPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1NldHRpbmdzIFN5bmMgZXhlY3V0aW9uIGlkIGZvciB3aGljaCB0aGlzIGVycm9yIGhhcyBvY2N1cnJlZCcgfTtcbn07XG5cbnR5cGUgU3luY0Vycm9yRXZlbnQgPSB7XG5cdGNvZGU6IHN0cmluZztcblx0c2VydmljZTogc3RyaW5nO1xuXHRzZXJ2ZXJDb2RlPzogc3RyaW5nO1xuXHR1cmw/OiBzdHJpbmc7XG5cdHJlc291cmNlPzogc3RyaW5nO1xuXHRleGVjdXRpb25JZD86IHN0cmluZztcbn07XG5cbmNvbnN0IExBU1RfU1lOQ19USU1FX0tFWSA9ICdzeW5jLmxhc3RTeW5jVGltZSc7XG5cbmV4cG9ydCBjbGFzcyBVc2VyRGF0YVN5bmNTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElVc2VyRGF0YVN5bmNTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfc3RhdHVzOiBTeW5jU3RhdHVzID0gU3luY1N0YXR1cy5VbmluaXRpYWxpemVkO1xuXHRnZXQgc3RhdHVzKCk6IFN5bmNTdGF0dXMgeyByZXR1cm4gdGhpcy5fc3RhdHVzOyB9XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlU3RhdHVzOiBFbWl0dGVyPFN5bmNTdGF0dXM+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U3luY1N0YXR1cz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RhdHVzOiBFdmVudDxTeW5jU3RhdHVzPiA9IHRoaXMuX29uRGlkQ2hhbmdlU3RhdHVzLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlTG9jYWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxTeW5jUmVzb3VyY2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxvY2FsID0gdGhpcy5fb25EaWRDaGFuZ2VMb2NhbC5ldmVudDtcblxuXHRwcml2YXRlIF9jb25mbGljdHM6IElVc2VyRGF0YVN5bmNSZXNvdXJjZUNvbmZsaWN0c1tdID0gW107XG5cdGdldCBjb25mbGljdHMoKTogSVVzZXJEYXRhU3luY1Jlc291cmNlQ29uZmxpY3RzW10geyByZXR1cm4gdGhpcy5fY29uZmxpY3RzOyB9XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlQ29uZmxpY3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVVzZXJEYXRhU3luY1Jlc291cmNlQ29uZmxpY3RzW10+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbmZsaWN0cyA9IHRoaXMuX29uRGlkQ2hhbmdlQ29uZmxpY3RzLmV2ZW50O1xuXG5cdHByaXZhdGUgX3N5bmNFcnJvcnM6IElVc2VyRGF0YVN5bmNSZXNvdXJjZUVycm9yW10gPSBbXTtcblx0cHJpdmF0ZSBfb25TeW5jRXJyb3JzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVVzZXJEYXRhU3luY1Jlc291cmNlRXJyb3JbXT4oKSk7XG5cdHJlYWRvbmx5IG9uU3luY0Vycm9ycyA9IHRoaXMuX29uU3luY0Vycm9ycy5ldmVudDtcblxuXHRwcml2YXRlIF9sYXN0U3luY1RpbWU6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Z2V0IGxhc3RTeW5jVGltZSgpOiBudW1iZXIgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fbGFzdFN5bmNUaW1lOyB9XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlTGFzdFN5bmNUaW1lOiBFbWl0dGVyPG51bWJlcj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxhc3RTeW5jVGltZTogRXZlbnQ8bnVtYmVyPiA9IHRoaXMuX29uRGlkQ2hhbmdlTGFzdFN5bmNUaW1lLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkUmVzZXRMb2NhbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlc2V0TG9jYWwgPSB0aGlzLl9vbkRpZFJlc2V0TG9jYWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRSZXNldFJlbW90ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlc2V0UmVtb3RlID0gdGhpcy5fb25EaWRSZXNldFJlbW90ZS5ldmVudDtcblxuXHRwcml2YXRlIGFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXJzID0gbmV3IE1hcDxzdHJpbmcsIFtQcm9maWxlU3luY2hyb25pemVyLCBJRGlzcG9zYWJsZV0+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZTogSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlOiBJVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc3RhdHVzID0gdXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZSA/IFN5bmNTdGF0dXMuSWRsZSA6IFN5bmNTdGF0dXMuVW5pbml0aWFsaXplZDtcblx0XHR0aGlzLl9sYXN0U3luY1RpbWUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldE51bWJlcihMQVNUX1NZTkNfVElNRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jbGVhckFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXJzKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuY2xlYW5VcFN0YWxlU3RvcmFnZURhdGEoKSwgNSAqIDEwMDAgLyogYWZ0ZXIgNXMgKi8pKS5zY2hlZHVsZSgpO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlU3luY1Rhc2sobWFuaWZlc3Q6IElVc2VyRGF0YU1hbmlmZXN0IHwgbnVsbCwgZGlzYWJsZUNhY2hlPzogYm9vbGVhbik6IFByb21pc2U8SVVzZXJEYXRhU3luY1Rhc2s+IHtcblx0XHR0aGlzLmNoZWNrRW5hYmxlbWVudCgpO1xuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1N5bmMgc3RhcnRlZC4nKTtcblx0XHRjb25zdCBzdGFydFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcblx0XHRjb25zdCBleGVjdXRpb25JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzeW5jSGVhZGVycyA9IGNyZWF0ZVN5bmNIZWFkZXJzKGV4ZWN1dGlvbklkKTtcblx0XHRcdGlmIChkaXNhYmxlQ2FjaGUpIHtcblx0XHRcdFx0c3luY0hlYWRlcnNbJ0NhY2hlLUNvbnRyb2wnXSA9ICduby1jYWNoZSc7XG5cdFx0XHR9XG5cdFx0XHRtYW5pZmVzdCA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLm1hbmlmZXN0KG1hbmlmZXN0LCBzeW5jSGVhZGVycyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnN0IHVzZXJEYXRhU3luY0Vycm9yID0gVXNlckRhdGFTeW5jRXJyb3IudG9Vc2VyRGF0YVN5bmNFcnJvcihlcnJvcik7XG5cdFx0XHRyZXBvcnRVc2VyRGF0YVN5bmNFcnJvcih1c2VyRGF0YVN5bmNFcnJvciwgZXhlY3V0aW9uSWQsIHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSwgdGhpcy50ZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRcdHRocm93IHVzZXJEYXRhU3luY0Vycm9yO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4ZWN1dGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0bGV0IGNhbmNlbGxhYmxlUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG1hbmlmZXN0LFxuXHRcdFx0YXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRpZiAoZXhlY3V0ZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NhbiBydW4gYSB0YXNrIG9ubHkgb25jZScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhbmNlbGxhYmxlUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHRoYXQuc3luYyhtYW5pZmVzdCwgZmFsc2UsIGV4ZWN1dGlvbklkLCB0b2tlbikpO1xuXHRcdFx0XHRhd2FpdCBjYW5jZWxsYWJsZVByb21pc2UuZmluYWxseSgoKSA9PiBjYW5jZWxsYWJsZVByb21pc2UgPSB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGF0LmxvZ1NlcnZpY2UuaW5mbyhgU3luYyBkb25lLiBUb29rICR7bmV3IERhdGUoKS5nZXRUaW1lKCkgLSBzdGFydFRpbWV9bXNgKTtcblx0XHRcdFx0dGhhdC51cGRhdGVMYXN0U3luY1RpbWUoKTtcblx0XHRcdH0sXG5cdFx0XHRzdG9wKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjYW5jZWxsYWJsZVByb21pc2U/LmNhbmNlbCgpO1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5zdG9wKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZU1hbnVhbFN5bmNUYXNrKCk6IFByb21pc2U8SVVzZXJEYXRhTWFudWFsU3luY1Rhc2s+IHtcblx0XHR0aGlzLmNoZWNrRW5hYmxlbWVudCgpO1xuXG5cdFx0aWYgKHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNFcnJvcignQ2Fubm90IHN0YXJ0IG1hbnVhbCBzeW5jIHdoZW4gc3luYyBpcyBlbmFibGVkJywgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkxvY2FsRXJyb3IpO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTeW5jIHN0YXJ0ZWQuJyk7XG5cdFx0Y29uc3Qgc3RhcnRUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cdFx0Y29uc3QgZXhlY3V0aW9uSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBzeW5jSGVhZGVycyA9IGNyZWF0ZVN5bmNIZWFkZXJzKGV4ZWN1dGlvbklkKTtcblx0XHRsZXQgbGF0ZXN0VXNlckRhdGFPck1hbmlmZXN0OiBJVXNlckRhdGFTeW5jTGF0ZXN0RGF0YSB8IElVc2VyRGF0YU1hbmlmZXN0IHwgbnVsbDtcblx0XHR0cnkge1xuXHRcdFx0bGF0ZXN0VXNlckRhdGFPck1hbmlmZXN0ID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UuZ2V0TGF0ZXN0RGF0YShzeW5jSGVhZGVycyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnN0IHVzZXJEYXRhU3luY0Vycm9yID0gVXNlckRhdGFTeW5jRXJyb3IudG9Vc2VyRGF0YVN5bmNFcnJvcihlcnJvcik7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxTeW5jRXJyb3JFdmVudCwgU3luY0Vycm9yQ2xhc3NpZmljYXRpb24+KCdzeW5jLmRvd25sb2FkLmxhdGVzdCcsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb2RlOiB1c2VyRGF0YVN5bmNFcnJvci5jb2RlLFxuXHRcdFx0XHRcdHNlcnZlckNvZGU6IHVzZXJEYXRhU3luY0Vycm9yIGluc3RhbmNlb2YgVXNlckRhdGFTeW5jU3RvcmVFcnJvciA/IFN0cmluZyh1c2VyRGF0YVN5bmNFcnJvci5zZXJ2ZXJDb2RlKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmw6IHVzZXJEYXRhU3luY0Vycm9yIGluc3RhbmNlb2YgVXNlckRhdGFTeW5jU3RvcmVFcnJvciA/IHVzZXJEYXRhU3luY0Vycm9yLnVybCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRyZXNvdXJjZTogdXNlckRhdGFTeW5jRXJyb3IucmVzb3VyY2UsXG5cdFx0XHRcdFx0ZXhlY3V0aW9uSWQsXG5cdFx0XHRcdFx0c2VydmljZTogdGhpcy51c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY1N0b3JlIS51cmwudG9TdHJpbmcoKVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0Ly8gRmFsbGJhY2sgdG8gbWFuaWZlc3QgaW4gc3RhYmxlXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRsYXRlc3RVc2VyRGF0YU9yTWFuaWZlc3QgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5tYW5pZmVzdChudWxsLCBzeW5jSGVhZGVycyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRjb25zdCB1c2VyRGF0YVN5bmNFcnJvciA9IFVzZXJEYXRhU3luY0Vycm9yLnRvVXNlckRhdGFTeW5jRXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRyZXBvcnRVc2VyRGF0YVN5bmNFcnJvcih1c2VyRGF0YVN5bmNFcnJvciwgZXhlY3V0aW9uSWQsIHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSwgdGhpcy50ZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRcdFx0dGhyb3cgdXNlckRhdGFTeW5jRXJyb3I7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0LyogTWFudWFsIHN5bmMgc2hhbGwgc3RhcnQgb24gY2xlYW4gbG9jYWwgc3RhdGUgKi9cblx0XHRhd2FpdCB0aGlzLnJlc2V0TG9jYWwoKTtcblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGNvbnN0IGNhbmNlbGxhYmxlVG9rZW4gPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGV4ZWN1dGlvbklkLFxuXHRcdFx0YXN5bmMgbWVyZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHJldHVybiB0aGF0LnN5bmMobGF0ZXN0VXNlckRhdGFPck1hbmlmZXN0LCB0cnVlLCBleGVjdXRpb25JZCwgY2FuY2VsbGFibGVUb2tlbi50b2tlbik7XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgYXBwbHkoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoYXQuYXBwbHlNYW51YWxTeW5jKGxhdGVzdFVzZXJEYXRhT3JNYW5pZmVzdCwgZXhlY3V0aW9uSWQsIGNhbmNlbGxhYmxlVG9rZW4udG9rZW4pO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRpZiAoVXNlckRhdGFTeW5jRXJyb3IudG9Vc2VyRGF0YVN5bmNFcnJvcihlcnJvcikuY29kZSA9PT0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLk1ldGhvZE5vdEZvdW5kKSB7XG5cdFx0XHRcdFx0XHRcdHRoYXQubG9nU2VydmljZS5pbmZvKCdDbGllbnQgaXMgbWFraW5nIGludmFsaWQgcmVxdWVzdHMuIENsZWFuaW5nIHVwIGRhdGEuLi4nKTtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhhdC5jbGVhblVwUmVtb3RlRGF0YSgpO1xuXHRcdFx0XHRcdFx0XHR0aGF0LmxvZ1NlcnZpY2UuaW5mbygnQXBwbHlpbmcgbWFudWFsIHN5bmMgYWdhaW4uLi4nKTtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhhdC5hcHBseU1hbnVhbFN5bmMobGF0ZXN0VXNlckRhdGFPck1hbmlmZXN0LCBleGVjdXRpb25JZCwgY2FuY2VsbGFibGVUb2tlbi50b2tlbik7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhhdC5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGF0LmxvZ1NlcnZpY2UuaW5mbyhgU3luYyBkb25lLiBUb29rICR7bmV3IERhdGUoKS5nZXRUaW1lKCkgLSBzdGFydFRpbWV9bXNgKTtcblx0XHRcdFx0dGhhdC51cGRhdGVMYXN0U3luY1RpbWUoKTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyBzdG9wKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjYW5jZWxsYWJsZVRva2VuLmNhbmNlbCgpO1xuXHRcdFx0XHRhd2FpdCB0aGF0LnN0b3AoKTtcblx0XHRcdFx0YXdhaXQgdGhhdC5yZXNldExvY2FsKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3luYyhtYW5pZmVzdE9yTGF0ZXN0RGF0YTogSVVzZXJEYXRhTWFuaWZlc3QgfCBJVXNlckRhdGFTeW5jTGF0ZXN0RGF0YSB8IG51bGwsIHByZXZpZXc6IGJvb2xlYW4sIGV4ZWN1dGlvbklkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3N5bmNFcnJvcnMgPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKHRoaXMuc3RhdHVzICE9PSBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cykge1xuXHRcdFx0XHR0aGlzLnNldFN0YXR1cyhTeW5jU3RhdHVzLlN5bmNpbmcpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTeW5jIERlZmF1bHQgUHJvZmlsZSBGaXJzdFxuXHRcdFx0Y29uc3QgZGVmYXVsdFByb2ZpbGVTeW5jaHJvbml6ZXIgPSB0aGlzLmdldE9yQ3JlYXRlQWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcih0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fc3luY0Vycm9ycy5wdXNoKC4uLmF3YWl0IHRoaXMuc3luY1Byb2ZpbGUoZGVmYXVsdFByb2ZpbGVTeW5jaHJvbml6ZXIsIG1hbmlmZXN0T3JMYXRlc3REYXRhLCBwcmV2aWV3LCBleGVjdXRpb25JZCwgdG9rZW4pKTtcblxuXHRcdFx0Ly8gU3luYyBvdGhlciBwcm9maWxlc1xuXHRcdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlTWFuaWZlc3RTeW5jaHJvbml6ZXIgPSBkZWZhdWx0UHJvZmlsZVN5bmNocm9uaXplci5lbmFibGVkLmZpbmQocyA9PiBzLnJlc291cmNlID09PSBTeW5jUmVzb3VyY2UuUHJvZmlsZXMpO1xuXHRcdFx0aWYgKHVzZXJEYXRhUHJvZmlsZU1hbmlmZXN0U3luY2hyb25pemVyKSB7XG5cdFx0XHRcdGNvbnN0IHN5bmNQcm9maWxlcyA9IChhd2FpdCAodXNlckRhdGFQcm9maWxlTWFuaWZlc3RTeW5jaHJvbml6ZXIgYXMgVXNlckRhdGFQcm9maWxlc01hbmlmZXN0U3luY2hyb25pc2VyKS5nZXRMYXN0U3luY2VkUHJvZmlsZXMoKSkgfHwgW107XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0aGlzLnN5bmNSZW1vdGVQcm9maWxlcyhzeW5jUHJvZmlsZXMsIG1hbmlmZXN0T3JMYXRlc3REYXRhLCBwcmV2aWV3LCBleGVjdXRpb25JZCwgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAodGhpcy5zdGF0dXMgIT09IFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKSB7XG5cdFx0XHRcdHRoaXMuc2V0U3RhdHVzKFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vblN5bmNFcnJvcnMuZmlyZSh0aGlzLl9zeW5jRXJyb3JzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN5bmNSZW1vdGVQcm9maWxlcyhyZW1vdGVQcm9maWxlczogSVN5bmNVc2VyRGF0YVByb2ZpbGVbXSwgbWFuaWZlc3Q6IElVc2VyRGF0YU1hbmlmZXN0IHwgSVVzZXJEYXRhU3luY0xhdGVzdERhdGEgfCBudWxsLCBwcmV2aWV3OiBib29sZWFuLCBleGVjdXRpb25JZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHN5bmNQcm9maWxlIG9mIHJlbW90ZVByb2ZpbGVzKSB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJvZmlsZSA9IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmluZChwID0+IHAuaWQgPT09IHN5bmNQcm9maWxlLmlkKTtcblx0XHRcdGlmICghcHJvZmlsZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFByb2ZpbGUgd2l0aCBpZDoke3N5bmNQcm9maWxlLmlkfSBhbmQgbmFtZTogJHtzeW5jUHJvZmlsZS5uYW1lfSBkb2VzIG5vdCBleGlzdCBsb2NhbGx5IHRvIHN5bmMuYCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1N5bmNpbmcgcHJvZmlsZS4nLCBzeW5jUHJvZmlsZS5uYW1lKTtcblx0XHRcdGNvbnN0IHByb2ZpbGVTeW5jaHJvbml6ZXIgPSB0aGlzLmdldE9yQ3JlYXRlQWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcihwcm9maWxlLCBzeW5jUHJvZmlsZSk7XG5cdFx0XHR0aGlzLl9zeW5jRXJyb3JzLnB1c2goLi4uYXdhaXQgdGhpcy5zeW5jUHJvZmlsZShwcm9maWxlU3luY2hyb25pemVyLCBtYW5pZmVzdCwgcHJldmlldywgZXhlY3V0aW9uSWQsIHRva2VuKSk7XG5cdFx0fVxuXHRcdC8vIERpc3Bvc2UgJiBEZWxldGUgcHJvZmlsZSBzeW5jaHJvbml6ZXJzIHdoaWNoIGRvIG5vdCBleGlzdCBhbnltb3JlXG5cdFx0Zm9yIChjb25zdCBba2V5LCBwcm9maWxlU3luY2hyb25pemVySXRlbV0gb2YgdGhpcy5hY3RpdmVQcm9maWxlU3luY2hyb25pemVycy5lbnRyaWVzKCkpIHtcblx0XHRcdGlmICh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLnNvbWUocCA9PiBwLmlkID09PSBwcm9maWxlU3luY2hyb25pemVySXRlbVswXS5wcm9maWxlLmlkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHByb2ZpbGVTeW5jaHJvbml6ZXJJdGVtWzBdLnJlc2V0TG9jYWwoKTtcblx0XHRcdHByb2ZpbGVTeW5jaHJvbml6ZXJJdGVtWzFdLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuYWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMuZGVsZXRlKGtleSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhcHBseU1hbnVhbFN5bmMobWFuaWZlc3RPckxhdGVzdERhdGE6IElVc2VyRGF0YU1hbmlmZXN0IHwgSVVzZXJEYXRhU3luY0xhdGVzdERhdGEgfCBudWxsLCBleGVjdXRpb25JZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5zZXRTdGF0dXMoU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRcdGNvbnN0IHByb2ZpbGVTeW5jaHJvbml6ZXJzID0gdGhpcy5nZXRBY3RpdmVQcm9maWxlU3luY2hyb25pemVycygpO1xuXHRcdFx0Zm9yIChjb25zdCBwcm9maWxlU3luY2hyb25pemVyIG9mIHByb2ZpbGVTeW5jaHJvbml6ZXJzKSB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCBwcm9maWxlU3luY2hyb25pemVyLmFwcGx5KGV4ZWN1dGlvbklkLCB0b2tlbik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlZmF1bHRQcm9maWxlU3luY2hyb25pemVyID0gcHJvZmlsZVN5bmNocm9uaXplcnMuZmluZChzID0+IHMucHJvZmlsZS5pc0RlZmF1bHQpO1xuXHRcdFx0aWYgKCFkZWZhdWx0UHJvZmlsZVN5bmNocm9uaXplcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHVzZXJEYXRhUHJvZmlsZU1hbmlmZXN0U3luY2hyb25pemVyID0gZGVmYXVsdFByb2ZpbGVTeW5jaHJvbml6ZXIuZW5hYmxlZC5maW5kKHMgPT4gcy5yZXNvdXJjZSA9PT0gU3luY1Jlc291cmNlLlByb2ZpbGVzKTtcblx0XHRcdGlmICghdXNlckRhdGFQcm9maWxlTWFuaWZlc3RTeW5jaHJvbml6ZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTeW5jIHJlbW90ZSBwcm9maWxlcyB3aGljaCBhcmUgbm90IHN5bmNlZCBsb2NhbGx5XG5cdFx0XHRjb25zdCByZW1vdGVQcm9maWxlcyA9IChhd2FpdCAodXNlckRhdGFQcm9maWxlTWFuaWZlc3RTeW5jaHJvbml6ZXIgYXMgVXNlckRhdGFQcm9maWxlc01hbmlmZXN0U3luY2hyb25pc2VyKS5nZXRSZW1vdGVTeW5jZWRQcm9maWxlcyhnZXRSZWZPclVzZXJEYXRhKG1hbmlmZXN0T3JMYXRlc3REYXRhLCB1bmRlZmluZWQsIFN5bmNSZXNvdXJjZS5Qcm9maWxlcykgPz8gbnVsbCkpIHx8IFtdO1xuXHRcdFx0Y29uc3QgcmVtb3RlUHJvZmlsZXNUb1N5bmMgPSByZW1vdGVQcm9maWxlcy5maWx0ZXIocmVtb3RlUHJvZmlsZSA9PiBwcm9maWxlU3luY2hyb25pemVycy5ldmVyeShzID0+IHMucHJvZmlsZS5pZCAhPT0gcmVtb3RlUHJvZmlsZS5pZCkpO1xuXHRcdFx0aWYgKHJlbW90ZVByb2ZpbGVzVG9TeW5jLmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnN5bmNSZW1vdGVQcm9maWxlcyhyZW1vdGVQcm9maWxlc1RvU3luYywgbWFuaWZlc3RPckxhdGVzdERhdGEsIGZhbHNlLCBleGVjdXRpb25JZCwgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLnNldFN0YXR1cyhTeW5jU3RhdHVzLklkbGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3luY1Byb2ZpbGUocHJvZmlsZVN5bmNocm9uaXplcjogUHJvZmlsZVN5bmNocm9uaXplciwgbWFuaWZlc3RPckxhdGVzdERhdGE6IElVc2VyRGF0YU1hbmlmZXN0IHwgSVVzZXJEYXRhU3luY0xhdGVzdERhdGEgfCBudWxsLCBwcmV2aWV3OiBib29sZWFuLCBleGVjdXRpb25JZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElVc2VyRGF0YVN5bmNSZXNvdXJjZUVycm9yW10+IHtcblx0XHRjb25zdCBlcnJvcnMgPSBhd2FpdCBwcm9maWxlU3luY2hyb25pemVyLnN5bmMobWFuaWZlc3RPckxhdGVzdERhdGEsIHByZXZpZXcsIGV4ZWN1dGlvbklkLCB0b2tlbik7XG5cdFx0cmV0dXJuIGVycm9ycy5tYXAoKFtzeW5jUmVzb3VyY2UsIGVycm9yXSkgPT4gKHsgcHJvZmlsZTogcHJvZmlsZVN5bmNocm9uaXplci5wcm9maWxlLCBzeW5jUmVzb3VyY2UsIGVycm9yIH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3RvcCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zdGF0dXMgIT09IFN5bmNTdGF0dXMuSWRsZSkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHRoaXMuZ2V0QWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMoKS5tYXAocHJvZmlsZVN5bmNocm9uaXplciA9PiBwcm9maWxlU3luY2hyb25pemVyLnN0b3AoKSkpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc29sdmVDb250ZW50KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5yZXNvbHZlQ29udGVudChyZXNvdXJjZSk7XG5cdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdHJldHVybiBjb250ZW50O1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHByb2ZpbGVTeW5jaHJvbml6ZXIgb2YgdGhpcy5nZXRBY3RpdmVQcm9maWxlU3luY2hyb25pemVycygpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHN5bmNocm9uaXplciBvZiBwcm9maWxlU3luY2hyb25pemVyLmVuYWJsZWQpIHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHN5bmNocm9uaXplci5yZXNvbHZlQ29udGVudChyZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRhc3luYyByZXBsYWNlKHN5bmNSZXNvdXJjZUhhbmRsZTogSVN5bmNSZXNvdXJjZUhhbmRsZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY2hlY2tFbmFibGVtZW50KCk7XG5cblx0XHRjb25zdCBwcm9maWxlU3luY1Jlc291cmNlID0gdGhpcy51c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5yZXNvbHZlVXNlckRhdGFTeW5jUmVzb3VyY2Uoc3luY1Jlc291cmNlSGFuZGxlKTtcblx0XHRpZiAoIXByb2ZpbGVTeW5jUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5yZXNvbHZlQ29udGVudChzeW5jUmVzb3VyY2VIYW5kbGUudXJpKTtcblx0XHRpZiAoIWNvbnRlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnBlcmZvcm1BY3Rpb24ocHJvZmlsZVN5bmNSZXNvdXJjZS5wcm9maWxlLCBhc3luYyBzeW5jaHJvbml6ZXIgPT4ge1xuXHRcdFx0aWYgKHByb2ZpbGVTeW5jUmVzb3VyY2Uuc3luY1Jlc291cmNlID09PSBzeW5jaHJvbml6ZXIucmVzb3VyY2UpIHtcblx0XHRcdFx0YXdhaXQgc3luY2hyb25pemVyLnJlcGxhY2UoY29udGVudCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KTtcblxuXHRcdHJldHVybjtcblx0fVxuXG5cdGFzeW5jIGFjY2VwdChzeW5jUmVzb3VyY2U6IElVc2VyRGF0YVN5bmNSZXNvdXJjZSwgcmVzb3VyY2U6IFVSSSwgY29udGVudDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgYXBwbHk6IGJvb2xlYW4gfCB7IGZvcmNlOiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNoZWNrRW5hYmxlbWVudCgpO1xuXG5cdFx0YXdhaXQgdGhpcy5wZXJmb3JtQWN0aW9uKHN5bmNSZXNvdXJjZS5wcm9maWxlLCBhc3luYyBzeW5jaHJvbml6ZXIgPT4ge1xuXHRcdFx0aWYgKHN5bmNSZXNvdXJjZS5zeW5jUmVzb3VyY2UgPT09IHN5bmNocm9uaXplci5yZXNvdXJjZSkge1xuXHRcdFx0XHRhd2FpdCBzeW5jaHJvbml6ZXIuYWNjZXB0KHJlc291cmNlLCBjb250ZW50KTtcblx0XHRcdFx0aWYgKGFwcGx5KSB7XG5cdFx0XHRcdFx0YXdhaXQgc3luY2hyb25pemVyLmFwcGx5KGlzQm9vbGVhbihhcHBseSkgPyBmYWxzZSA6IGFwcGx5LmZvcmNlLCBjcmVhdGVTeW5jSGVhZGVycyhnZW5lcmF0ZVV1aWQoKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGhhc0xvY2FsRGF0YSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBlcmZvcm1BY3Rpb24odGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSwgYXN5bmMgc3luY2hyb25pemVyID0+IHtcblx0XHRcdC8vIHNraXAgZ2xvYmFsIHN0YXRlIHN5bmNocm9uaXplclxuXHRcdFx0aWYgKHN5bmNocm9uaXplci5yZXNvdXJjZSAhPT0gU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlICYmIGF3YWl0IHN5bmNocm9uaXplci5oYXNMb2NhbERhdGEoKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0cmV0dXJuICEhcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgaGFzUHJldmlvdXNseVN5bmNlZCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBlcmZvcm1BY3Rpb24odGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSwgYXN5bmMgc3luY2hyb25pemVyID0+IHtcblx0XHRcdGlmIChhd2FpdCBzeW5jaHJvbml6ZXIuaGFzUHJldmlvdXNseVN5bmNlZCgpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KTtcblx0XHRyZXR1cm4gISFyZXN1bHQ7XG5cdH1cblxuXHRhc3luYyByZXNldCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNoZWNrRW5hYmxlbWVudCgpO1xuXHRcdGF3YWl0IHRoaXMucmVzZXRSZW1vdGUoKTtcblx0XHRhd2FpdCB0aGlzLnJlc2V0TG9jYWwoKTtcblx0fVxuXG5cdGFzeW5jIHJlc2V0UmVtb3RlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY2hlY2tFbmFibGVtZW50KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnQ2xlYXJlZCBkYXRhIG9uIHNlcnZlcicpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRSZXNldFJlbW90ZS5maXJlKCk7XG5cdH1cblxuXHRhc3luYyByZXNldExvY2FsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY2hlY2tFbmFibGVtZW50KCk7XG5cdFx0dGhpcy5fbGFzdFN5bmNUaW1lID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKExBU1RfU1lOQ19USU1FX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRmb3IgKGNvbnN0IFtzeW5jaHJvbml6ZXJdIG9mIHRoaXMuYWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMudmFsdWVzKCkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHN5bmNocm9uaXplci5yZXNldExvY2FsKCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5jbGVhckFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXJzKCk7XG5cdFx0dGhpcy5fb25EaWRSZXNldExvY2FsLmZpcmUoKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnRGlkIHJlc2V0IHRoZSBsb2NhbCBzeW5jIHN0YXRlLicpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjbGVhblVwU3RhbGVTdG9yYWdlRGF0YSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhbGxLZXlzID0gdGhpcy5zdG9yYWdlU2VydmljZS5rZXlzKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRjb25zdCBsYXN0U3luY1Byb2ZpbGVLZXlzOiBbc3RyaW5nLCBzdHJpbmddW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBhbGxLZXlzKSB7XG5cdFx0XHRpZiAoIWtleS5lbmRzV2l0aCgnLmxhc3RTeW5jVXNlckRhdGEnKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlZ21lbnRzID0ga2V5LnNwbGl0KCcuJyk7XG5cdFx0XHRpZiAoc2VnbWVudHMubGVuZ3RoID09PSAzKSB7XG5cdFx0XHRcdGxhc3RTeW5jUHJvZmlsZUtleXMucHVzaChba2V5LCBzZWdtZW50c1swXV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWxhc3RTeW5jUHJvZmlsZUtleXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0bGV0IGRlZmF1bHRQcm9maWxlU3luY2hyb25pemVyID0gdGhpcy5hY3RpdmVQcm9maWxlU3luY2hyb25pemVycy5nZXQodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5pZCk/LlswXTtcblx0XHRcdGlmICghZGVmYXVsdFByb2ZpbGVTeW5jaHJvbml6ZXIpIHtcblx0XHRcdFx0ZGVmYXVsdFByb2ZpbGVTeW5jaHJvbml6ZXIgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9maWxlU3luY2hyb25pemVyLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLCB1bmRlZmluZWQpKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVzZXJEYXRhUHJvZmlsZU1hbmlmZXN0U3luY2hyb25pemVyID0gZGVmYXVsdFByb2ZpbGVTeW5jaHJvbml6ZXIuZW5hYmxlZC5maW5kKHMgPT4gcy5yZXNvdXJjZSA9PT0gU3luY1Jlc291cmNlLlByb2ZpbGVzKSBhcyBVc2VyRGF0YVByb2ZpbGVzTWFuaWZlc3RTeW5jaHJvbmlzZXI7XG5cdFx0XHRpZiAoIXVzZXJEYXRhUHJvZmlsZU1hbmlmZXN0U3luY2hyb25pemVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxhc3RTeW5jZWRQcm9maWxlcyA9IGF3YWl0IHVzZXJEYXRhUHJvZmlsZU1hbmlmZXN0U3luY2hyb25pemVyLmdldExhc3RTeW5jZWRQcm9maWxlcygpO1xuXHRcdFx0Y29uc3QgbGFzdFN5bmNlZENvbGxlY3Rpb25zID0gbGFzdFN5bmNlZFByb2ZpbGVzPy5tYXAocCA9PiBwLmNvbGxlY3Rpb24pID8/IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBba2V5LCBjb2xsZWN0aW9uXSBvZiBsYXN0U3luY1Byb2ZpbGVLZXlzKSB7XG5cdFx0XHRcdGlmICghbGFzdFN5bmNlZENvbGxlY3Rpb25zLmluY2x1ZGVzKGNvbGxlY3Rpb24pKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFJlbW92aW5nIGxhc3Qgc3luYyBzdGF0ZSBmb3Igc3RhbGUgcHJvZmlsZTogJHtjb2xsZWN0aW9ufWApO1xuXHRcdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKGtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY2xlYW5VcFJlbW90ZURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVtb3RlUHJvZmlsZXMgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLmdldFJlbW90ZVN5bmNlZFByb2ZpbGVzKCk7XG5cdFx0Y29uc3QgcmVtb3RlUHJvZmlsZUNvbGxlY3Rpb25zID0gcmVtb3RlUHJvZmlsZXMubWFwKHByb2ZpbGUgPT4gcHJvZmlsZS5jb2xsZWN0aW9uKTtcblx0XHRjb25zdCBhbGxDb2xsZWN0aW9ucyA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLmdldEFsbENvbGxlY3Rpb25zKCk7XG5cdFx0Y29uc3QgcmVkdW5kYW50Q29sbGVjdGlvbnMgPSBhbGxDb2xsZWN0aW9ucy5maWx0ZXIoYyA9PiAhcmVtb3RlUHJvZmlsZUNvbGxlY3Rpb25zLmluY2x1ZGVzKGMpKTtcblx0XHRpZiAocmVkdW5kYW50Q29sbGVjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgRGVsZXRpbmcgJHtyZWR1bmRhbnRDb2xsZWN0aW9ucy5sZW5ndGh9IHJlZHVuZGFudCBjb2xsZWN0aW9ucyBvbiBzZXJ2ZXJgKTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChyZWR1bmRhbnRDb2xsZWN0aW9ucy5tYXAoY29sbGVjdGlvbklkID0+IHRoaXMudXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLmRlbGV0ZUNvbGxlY3Rpb24oY29sbGVjdGlvbklkKSkpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYERlbGV0ZWQgcmVkdW5kYW50IGNvbGxlY3Rpb25zIG9uIHNlcnZlcmApO1xuXHRcdH1cblx0XHRjb25zdCB1cGRhdGVkUmVtb3RlUHJvZmlsZXMgPSByZW1vdGVQcm9maWxlcy5maWx0ZXIocHJvZmlsZSA9PiBhbGxDb2xsZWN0aW9ucy5pbmNsdWRlcyhwcm9maWxlLmNvbGxlY3Rpb24pKTtcblx0XHRpZiAodXBkYXRlZFJlbW90ZVByb2ZpbGVzLmxlbmd0aCAhPT0gcmVtb3RlUHJvZmlsZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBwcm9maWxlTWFuaWZlc3RTeW5jaHJvbml6ZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhUHJvZmlsZXNNYW5pZmVzdFN5bmNocm9uaXNlciwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdSZXNldHRpbmcgdGhlIGxhc3Qgc3luY2VkIHN0YXRlIG9mIHByb2ZpbGVzJyk7XG5cdFx0XHRcdGF3YWl0IHByb2ZpbGVNYW5pZmVzdFN5bmNocm9uaXplci5yZXNldExvY2FsKCk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdEaWQgcmVzZXQgdGhlIGxhc3Qgc3luY2VkIHN0YXRlIG9mIHByb2ZpbGVzJyk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBVcGRhdGluZyByZW1vdGUgcHJvZmlsZXMgd2l0aCBpbnZhbGlkIGNvbGxlY3Rpb25zIG9uIHNlcnZlcmApO1xuXHRcdFx0XHRhd2FpdCBwcm9maWxlTWFuaWZlc3RTeW5jaHJvbml6ZXIudXBkYXRlUmVtb3RlUHJvZmlsZXModXBkYXRlZFJlbW90ZVByb2ZpbGVzLCBudWxsKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFVwZGF0ZWQgcmVtb3RlIHByb2ZpbGVzIG9uIHNlcnZlcmApO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cHJvZmlsZU1hbmlmZXN0U3luY2hyb25pemVyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBzYXZlUmVtb3RlQWN0aXZpdHlEYXRhKGxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNoZWNrRW5hYmxlbWVudCgpO1xuXHRcdGNvbnN0IGRhdGEgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5nZXRBY3Rpdml0eURhdGEoKTtcblx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShsb2NhdGlvbiwgZGF0YSk7XG5cdH1cblxuXHRhc3luYyBleHRyYWN0QWN0aXZpdHlEYXRhKGFjdGl2aXR5RGF0YVJlc291cmNlOiBVUkksIGxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZW50ID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoYWN0aXZpdHlEYXRhUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGFjdGl2aXR5RGF0YTogSVVzZXJEYXRhU3luY0FjdGl2aXR5RGF0YSA9IEpTT04ucGFyc2UoY29udGVudCk7XG5cblx0XHRpZiAoYWN0aXZpdHlEYXRhLnJlc291cmNlcykge1xuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBpbiBhY3Rpdml0eURhdGEucmVzb3VyY2VzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdmVyc2lvbiBvZiBhY3Rpdml0eURhdGEucmVzb3VyY2VzW3Jlc291cmNlXSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2Uud3JpdGVSZXNvdXJjZShyZXNvdXJjZSBhcyBTeW5jUmVzb3VyY2UsIHZlcnNpb24uY29udGVudCwgbmV3IERhdGUodmVyc2lvbi5jcmVhdGVkICogMTAwMCksIHVuZGVmaW5lZCwgbG9jYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGFjdGl2aXR5RGF0YS5jb2xsZWN0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBjb2xsZWN0aW9uIGluIGFjdGl2aXR5RGF0YS5jb2xsZWN0aW9ucykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIGluIGFjdGl2aXR5RGF0YS5jb2xsZWN0aW9uc1tjb2xsZWN0aW9uXS5yZXNvdXJjZXMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHZlcnNpb24gb2YgYWN0aXZpdHlEYXRhLmNvbGxlY3Rpb25zW2NvbGxlY3Rpb25dLnJlc291cmNlcz8uW3Jlc291cmNlXSA/PyBbXSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZS53cml0ZVJlc291cmNlKHJlc291cmNlIGFzIFN5bmNSZXNvdXJjZSwgdmVyc2lvbi5jb250ZW50LCBuZXcgRGF0ZSh2ZXJzaW9uLmNyZWF0ZWQgKiAxMDAwKSwgY29sbGVjdGlvbiwgbG9jYXRpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcGVyZm9ybUFjdGlvbjxUPihwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLCBhY3Rpb246IChzeW5jaHJvbmlzZXI6IElVc2VyRGF0YVN5bmNocm9uaXNlcikgPT4gUHJvbWlzZTxUIHwgdW5kZWZpbmVkPik6IFByb21pc2U8VCB8IG51bGw+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWN0aXZlUHJvZmlsZVN5bmNyb25pemVyID0gdGhpcy5hY3RpdmVQcm9maWxlU3luY2hyb25pemVycy5nZXQocHJvZmlsZS5pZCk7XG5cdFx0XHRpZiAoYWN0aXZlUHJvZmlsZVN5bmNyb25pemVyKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucGVyZm9ybUFjdGlvbldpdGhQcm9maWxlU3luY2hyb25pemVyKGFjdGl2ZVByb2ZpbGVTeW5jcm9uaXplclswXSwgYWN0aW9uLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdHJldHVybiBpc1VuZGVmaW5lZChyZXN1bHQpID8gbnVsbCA6IHJlc3VsdDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRQcm9maWxlU3luY2hyb25pemVyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvZmlsZVN5bmNocm9uaXplciwgcHJvZmlsZSwgdW5kZWZpbmVkKSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucGVyZm9ybUFjdGlvbldpdGhQcm9maWxlU3luY2hyb25pemVyKGRlZmF1bHRQcm9maWxlU3luY2hyb25pemVyLCBhY3Rpb24sIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0cmV0dXJuIGlzVW5kZWZpbmVkKHJlc3VsdCkgPyBudWxsIDogcmVzdWx0O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVNYW5pZmVzdFN5bmNocm9uaXplciA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhUHJvZmlsZXNNYW5pZmVzdFN5bmNocm9uaXNlciwgcHJvZmlsZSwgdW5kZWZpbmVkKSk7XG5cdFx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLm1hbmlmZXN0KG51bGwpO1xuXHRcdFx0Y29uc3Qgc3luY1Byb2ZpbGVzID0gKGF3YWl0IHVzZXJEYXRhUHJvZmlsZU1hbmlmZXN0U3luY2hyb25pemVyLmdldFJlbW90ZVN5bmNlZFByb2ZpbGVzKG1hbmlmZXN0Py5sYXRlc3Q/LnByb2ZpbGVzID8/IG51bGwpKSB8fCBbXTtcblx0XHRcdGNvbnN0IHN5bmNQcm9maWxlID0gc3luY1Byb2ZpbGVzLmZpbmQoc3luY1Byb2ZpbGUgPT4gc3luY1Byb2ZpbGUuaWQgPT09IHByb2ZpbGUuaWQpO1xuXHRcdFx0aWYgKHN5bmNQcm9maWxlKSB7XG5cdFx0XHRcdGNvbnN0IHByb2ZpbGVTeW5jaHJvbml6ZXIgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9maWxlU3luY2hyb25pemVyLCBwcm9maWxlLCBzeW5jUHJvZmlsZS5jb2xsZWN0aW9uKSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucGVyZm9ybUFjdGlvbldpdGhQcm9maWxlU3luY2hyb25pemVyKHByb2ZpbGVTeW5jaHJvbml6ZXIsIGFjdGlvbiwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRyZXR1cm4gaXNVbmRlZmluZWQocmVzdWx0KSA/IG51bGwgOiByZXN1bHQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwZXJmb3JtQWN0aW9uV2l0aFByb2ZpbGVTeW5jaHJvbml6ZXI8VD4ocHJvZmlsZVN5bmNocm9uaXplcjogUHJvZmlsZVN5bmNocm9uaXplciwgYWN0aW9uOiAoc3luY2hyb25pc2VyOiBJVXNlckRhdGFTeW5jaHJvbmlzZXIpID0+IFByb21pc2U8VCB8IHVuZGVmaW5lZD4sIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBQcm9taXNlPFQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhbGxTeW5jaHJvbml6ZXJzID0gWy4uLnByb2ZpbGVTeW5jaHJvbml6ZXIuZW5hYmxlZCwgLi4ucHJvZmlsZVN5bmNocm9uaXplci5kaXNhYmxlZC5yZWR1Y2U8KElVc2VyRGF0YVN5bmNocm9uaXNlciAmIElEaXNwb3NhYmxlKVtdPigoc3luY2hyb25pemVycywgc3luY1Jlc291cmNlKSA9PiB7XG5cdFx0XHRpZiAoc3luY1Jlc291cmNlICE9PSBTeW5jUmVzb3VyY2UuV29ya3NwYWNlU3RhdGUpIHtcblx0XHRcdFx0c3luY2hyb25pemVycy5wdXNoKGRpc3Bvc2FibGVzLmFkZChwcm9maWxlU3luY2hyb25pemVyLmNyZWF0ZVN5bmNocm9uaXplcihzeW5jUmVzb3VyY2UpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gc3luY2hyb25pemVycztcblx0XHR9LCBbXSldO1xuXHRcdGZvciAoY29uc3Qgc3luY2hyb25pemVyIG9mIGFsbFN5bmNocm9uaXplcnMpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFjdGlvbihzeW5jaHJvbml6ZXIpO1xuXHRcdFx0aWYgKCFpc1VuZGVmaW5lZChyZXN1bHQpKSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNldFN0YXR1cyhzdGF0dXM6IFN5bmNTdGF0dXMpOiB2b2lkIHtcblx0XHRjb25zdCBvbGRTdGF0dXMgPSB0aGlzLl9zdGF0dXM7XG5cdFx0aWYgKHRoaXMuX3N0YXR1cyAhPT0gc3RhdHVzKSB7XG5cdFx0XHR0aGlzLl9zdGF0dXMgPSBzdGF0dXM7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXR1cy5maXJlKHN0YXR1cyk7XG5cdFx0XHRpZiAob2xkU3RhdHVzID09PSBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cykge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUxhc3RTeW5jVGltZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29uZmxpY3RzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZsaWN0cyA9IHRoaXMuZ2V0QWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMoKS5tYXAoc3luY2hyb25pemVyID0+IHN5bmNocm9uaXplci5jb25mbGljdHMpLmZsYXQoKTtcblx0XHRpZiAoIWVxdWFscyh0aGlzLl9jb25mbGljdHMsIGNvbmZsaWN0cywgKGEsIGIpID0+IGEucHJvZmlsZS5pZCA9PT0gYi5wcm9maWxlLmlkICYmIGEuc3luY1Jlc291cmNlID09PSBiLnN5bmNSZXNvdXJjZSAmJiBlcXVhbHMoYS5jb25mbGljdHMsIGIuY29uZmxpY3RzLCAoYSwgYikgPT4gaXNFcXVhbChhLnByZXZpZXdSZXNvdXJjZSwgYi5wcmV2aWV3UmVzb3VyY2UpKSkpIHtcblx0XHRcdHRoaXMuX2NvbmZsaWN0cyA9IGNvbmZsaWN0cztcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29uZmxpY3RzLmZpcmUoY29uZmxpY3RzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUxhc3RTeW5jVGltZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zdGF0dXMgPT09IFN5bmNTdGF0dXMuSWRsZSkge1xuXHRcdFx0dGhpcy5fbGFzdFN5bmNUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKExBU1RfU1lOQ19USU1FX0tFWSwgdGhpcy5fbGFzdFN5bmNUaW1lLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxhc3RTeW5jVGltZS5maXJlKHRoaXMuX2xhc3RTeW5jVGltZSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0T3JDcmVhdGVBY3RpdmVQcm9maWxlU3luY2hyb25pemVyKHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsIHN5bmNQcm9maWxlOiBJU3luY1VzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCk6IFByb2ZpbGVTeW5jaHJvbml6ZXIge1xuXHRcdGxldCBhY3RpdmVQcm9maWxlU3luY2hyb25pemVyID0gdGhpcy5hY3RpdmVQcm9maWxlU3luY2hyb25pemVycy5nZXQocHJvZmlsZS5pZCk7XG5cdFx0aWYgKGFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXIgJiYgYWN0aXZlUHJvZmlsZVN5bmNocm9uaXplclswXS5jb2xsZWN0aW9uICE9PSBzeW5jUHJvZmlsZT8uY29sbGVjdGlvbikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdQcm9maWxlIHN5bmNocm9uaXplciBjb2xsZWN0aW9uIGRvZXMgbm90IG1hdGNoIHdpdGggdGhlIHJlbW90ZSBzeW5jIHByb2ZpbGUgY29sbGVjdGlvbicpO1xuXHRcdFx0YWN0aXZlUHJvZmlsZVN5bmNocm9uaXplclsxXS5kaXNwb3NlKCk7XG5cdFx0XHRhY3RpdmVQcm9maWxlU3luY2hyb25pemVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5hY3RpdmVQcm9maWxlU3luY2hyb25pemVycy5kZWxldGUocHJvZmlsZS5pZCk7XG5cdFx0fVxuXHRcdGlmICghYWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcikge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBwcm9maWxlU3luY2hyb25pemVyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvZmlsZVN5bmNocm9uaXplciwgcHJvZmlsZSwgc3luY1Byb2ZpbGU/LmNvbGxlY3Rpb24pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChwcm9maWxlU3luY2hyb25pemVyLm9uRGlkQ2hhbmdlU3RhdHVzKGUgPT4gdGhpcy5zZXRTdGF0dXMoZSkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChwcm9maWxlU3luY2hyb25pemVyLm9uRGlkQ2hhbmdlQ29uZmxpY3RzKGNvbmZsaWN0cyA9PiB0aGlzLnVwZGF0ZUNvbmZsaWN0cygpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocHJvZmlsZVN5bmNocm9uaXplci5vbkRpZENoYW5nZUxvY2FsKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VMb2NhbC5maXJlKGUpKSk7XG5cdFx0XHR0aGlzLmFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXJzLnNldChwcm9maWxlLmlkLCBhY3RpdmVQcm9maWxlU3luY2hyb25pemVyID0gW3Byb2ZpbGVTeW5jaHJvbml6ZXIsIGRpc3Bvc2FibGVzXSk7XG5cdFx0fVxuXHRcdHJldHVybiBhY3RpdmVQcm9maWxlU3luY2hyb25pemVyWzBdO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3RpdmVQcm9maWxlU3luY2hyb25pemVycygpOiBQcm9maWxlU3luY2hyb25pemVyW10ge1xuXHRcdGNvbnN0IHByb2ZpbGVTeW5jaHJvbml6ZXJzOiBQcm9maWxlU3luY2hyb25pemVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtwcm9maWxlU3luY2hyb25pemVyXSBvZiB0aGlzLmFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRwcm9maWxlU3luY2hyb25pemVycy5wdXNoKHByb2ZpbGVTeW5jaHJvbml6ZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvZmlsZVN5bmNocm9uaXplcnM7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyQWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5hY3RpdmVQcm9maWxlU3luY2hyb25pemVycy5mb3JFYWNoKChbLCBkaXNwb3NhYmxlXSkgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkpO1xuXHRcdHRoaXMuYWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgY2hlY2tFbmFibGVtZW50KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy51c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY1N0b3JlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBlbmFibGVkJyk7XG5cdFx0fVxuXHR9XG5cbn1cblxuXG5jbGFzcyBQcm9maWxlU3luY2hyb25pemVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfZW5hYmxlZDogW0lVc2VyRGF0YVN5bmNocm9uaXNlciwgbnVtYmVyLCBJRGlzcG9zYWJsZV1bXSA9IFtdO1xuXHRnZXQgZW5hYmxlZCgpOiBJVXNlckRhdGFTeW5jaHJvbmlzZXJbXSB7IHJldHVybiB0aGlzLl9lbmFibGVkLnNvcnQoKGEsIGIpID0+IGFbMV0gLSBiWzFdKS5tYXAoKFtzeW5jaHJvbml6ZXJdKSA9PiBzeW5jaHJvbml6ZXIpOyB9XG5cblx0Z2V0IGRpc2FibGVkKCk6IFN5bmNSZXNvdXJjZVtdIHsgcmV0dXJuIEFMTF9TWU5DX1JFU09VUkNFUy5maWx0ZXIoc3luY1Jlc291cmNlID0+ICF0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzUmVzb3VyY2VFbmFibGVkKHN5bmNSZXNvdXJjZSkpOyB9XG5cblx0cHJpdmF0ZSBfc3RhdHVzOiBTeW5jU3RhdHVzID0gU3luY1N0YXR1cy5JZGxlO1xuXHRnZXQgc3RhdHVzKCk6IFN5bmNTdGF0dXMgeyByZXR1cm4gdGhpcy5fc3RhdHVzOyB9XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlU3RhdHVzOiBFbWl0dGVyPFN5bmNTdGF0dXM+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U3luY1N0YXR1cz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RhdHVzOiBFdmVudDxTeW5jU3RhdHVzPiA9IHRoaXMuX29uRGlkQ2hhbmdlU3RhdHVzLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlTG9jYWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxTeW5jUmVzb3VyY2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxvY2FsID0gdGhpcy5fb25EaWRDaGFuZ2VMb2NhbC5ldmVudDtcblxuXHRwcml2YXRlIF9jb25mbGljdHM6IElVc2VyRGF0YVN5bmNSZXNvdXJjZUNvbmZsaWN0c1tdID0gW107XG5cdGdldCBjb25mbGljdHMoKTogSVVzZXJEYXRhU3luY1Jlc291cmNlQ29uZmxpY3RzW10geyByZXR1cm4gdGhpcy5fY29uZmxpY3RzOyB9XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlQ29uZmxpY3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVVzZXJEYXRhU3luY1Jlc291cmNlQ29uZmxpY3RzW10+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbmZsaWN0cyA9IHRoaXMuX29uRGlkQ2hhbmdlQ29uZmxpY3RzLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsXG5cdFx0cmVhZG9ubHkgY29sbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUmVzb3VyY2VFbmFibGVtZW50KChbc3luY1Jlc291cmNlLCBlbmFibGVtZW50XSkgPT4gdGhpcy5vbkRpZENoYW5nZVJlc291cmNlRW5hYmxlbWVudChzeW5jUmVzb3VyY2UsIGVuYWJsZW1lbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2VuYWJsZWQuc3BsaWNlKDAsIHRoaXMuX2VuYWJsZWQubGVuZ3RoKS5mb3JFYWNoKChbLCAsIGRpc3Bvc2FibGVdKSA9PiBkaXNwb3NhYmxlLmRpc3Bvc2UoKSkpKTtcblx0XHRmb3IgKGNvbnN0IHN5bmNSZXNvdXJjZSBvZiBBTExfU1lOQ19SRVNPVVJDRVMpIHtcblx0XHRcdGlmICh1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc1Jlc291cmNlRW5hYmxlZChzeW5jUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJTeW5jaHJvbml6ZXIoc3luY1Jlc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlUmVzb3VyY2VFbmFibGVtZW50KHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLCBlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdHRoaXMucmVnaXN0ZXJTeW5jaHJvbml6ZXIoc3luY1Jlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kZVJlZ2lzdGVyU3luY2hyb25pemVyKHN5bmNSZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHJlZ2lzdGVyU3luY2hyb25pemVyKHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2VuYWJsZWQuc29tZSgoW3N5bmNocm9uaXplcl0pID0+IHN5bmNocm9uaXplci5yZXNvdXJjZSA9PT0gc3luY1Jlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc3luY1Jlc291cmNlID09PSBTeW5jUmVzb3VyY2UuRXh0ZW5zaW9ucyAmJiAhdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1NraXBwaW5nIGV4dGVuc2lvbnMgc3luYyBiZWNhdXNlIGdhbGxlcnkgaXMgbm90IGNvbmZpZ3VyZWQnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHN5bmNSZXNvdXJjZSA9PT0gU3luY1Jlc291cmNlLlByb2ZpbGVzKSB7XG5cdFx0XHRpZiAoIXRoaXMucHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoc3luY1Jlc291cmNlID09PSBTeW5jUmVzb3VyY2UuV29ya3NwYWNlU3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHN5bmNSZXNvdXJjZSAhPT0gU3luY1Jlc291cmNlLlByb2ZpbGVzICYmIHRoaXMucHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/LltzeW5jUmVzb3VyY2VdKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFNraXBwaW5nIHN5bmNpbmcgJHtzeW5jUmVzb3VyY2V9IGluICR7dGhpcy5wcm9maWxlLm5hbWV9IGJlY2F1c2UgaXQgaXMgYWxyZWFkeSBzeW5jZWQgYnkgZGVmYXVsdCBwcm9maWxlYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHN5bmNocm9uaXplciA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmNyZWF0ZVN5bmNocm9uaXplcihzeW5jUmVzb3VyY2UpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3luY2hyb25pemVyLm9uRGlkQ2hhbmdlU3RhdHVzKCgpID0+IHRoaXMudXBkYXRlU3RhdHVzKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3luY2hyb25pemVyLm9uRGlkQ2hhbmdlQ29uZmxpY3RzKCgpID0+IHRoaXMudXBkYXRlQ29uZmxpY3RzKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3luY2hyb25pemVyLm9uRGlkQ2hhbmdlTG9jYWwoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VMb2NhbC5maXJlKHN5bmNSZXNvdXJjZSkpKTtcblx0XHRjb25zdCBvcmRlciA9IHRoaXMuZ2V0T3JkZXIoc3luY1Jlc291cmNlKTtcblx0XHR0aGlzLl9lbmFibGVkLnB1c2goW3N5bmNocm9uaXplciwgb3JkZXIsIGRpc3Bvc2FibGVzXSk7XG5cdH1cblxuXHRwcml2YXRlIGRlUmVnaXN0ZXJTeW5jaHJvbml6ZXIoc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2VuYWJsZWQuZmluZEluZGV4KChbc3luY2hyb25pemVyXSkgPT4gc3luY2hyb25pemVyLnJlc291cmNlID09PSBzeW5jUmVzb3VyY2UpO1xuXHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdGNvbnN0IFtbc3luY2hyb25pemVyLCAsIGRpc3Bvc2FibGVdXSA9IHRoaXMuX2VuYWJsZWQuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoKTtcblx0XHRcdHN5bmNocm9uaXplci5zdG9wKCkudGhlbihudWxsLCBlcnJvciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpKTtcblx0XHR9XG5cdH1cblxuXHRjcmVhdGVTeW5jaHJvbml6ZXIoc3luY1Jlc291cmNlOiBFeGNsdWRlPFN5bmNSZXNvdXJjZSwgU3luY1Jlc291cmNlLldvcmtzcGFjZVN0YXRlPik6IElVc2VyRGF0YVN5bmNocm9uaXNlciAmIElEaXNwb3NhYmxlIHtcblx0XHRzd2l0Y2ggKHN5bmNSZXNvdXJjZSkge1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuU2V0dGluZ3M6IHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzU3luY2hyb25pc2VyLCB0aGlzLnByb2ZpbGUsIHRoaXMuY29sbGVjdGlvbik7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5LZXliaW5kaW5nczogcmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoS2V5YmluZGluZ3NTeW5jaHJvbmlzZXIsIHRoaXMucHJvZmlsZSwgdGhpcy5jb2xsZWN0aW9uKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlNuaXBwZXRzOiByZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0c1N5bmNocm9uaXNlciwgdGhpcy5wcm9maWxlLCB0aGlzLmNvbGxlY3Rpb24pO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuUHJvbXB0czogcmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0c1N5bmNocm9uaXplciwgdGhpcy5wcm9maWxlLCB0aGlzLmNvbGxlY3Rpb24pO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuVGFza3M6IHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRhc2tzU3luY2hyb25pc2VyLCB0aGlzLnByb2ZpbGUsIHRoaXMuY29sbGVjdGlvbik7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5NY3A6IHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFN5bmNocm9uaXNlciwgdGhpcy5wcm9maWxlLCB0aGlzLmNvbGxlY3Rpb24pO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuR2xvYmFsU3RhdGU6IHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEdsb2JhbFN0YXRlU3luY2hyb25pc2VyLCB0aGlzLnByb2ZpbGUsIHRoaXMuY29sbGVjdGlvbik7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5FeHRlbnNpb25zOiByZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zU3luY2hyb25pc2VyLCB0aGlzLnByb2ZpbGUsIHRoaXMuY29sbGVjdGlvbik7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5Qcm9maWxlczogcmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlckRhdGFQcm9maWxlc01hbmlmZXN0U3luY2hyb25pc2VyLCB0aGlzLnByb2ZpbGUsIHRoaXMuY29sbGVjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3luYyhtYW5pZmVzdE9yTGF0ZXN0RGF0YTogSVVzZXJEYXRhTWFuaWZlc3QgfCBJVXNlckRhdGFTeW5jTGF0ZXN0RGF0YSB8IG51bGwsIHByZXZpZXc6IGJvb2xlYW4sIGV4ZWN1dGlvbklkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8W1N5bmNSZXNvdXJjZSwgVXNlckRhdGFTeW5jRXJyb3JdW10+IHtcblxuXHRcdC8vIFJldHVybiBpZiBjYW5jZWxsYXRpb24gaXMgcmVxdWVzdGVkXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3luY2hyb25pemVycyA9IHRoaXMuZW5hYmxlZDtcblx0XHRpZiAoIXN5bmNocm9uaXplcnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN5bmNFcnJvcnM6IFtTeW5jUmVzb3VyY2UsIFVzZXJEYXRhU3luY0Vycm9yXVtdID0gW107XG5cdFx0XHRjb25zdCBzeW5jSGVhZGVycyA9IGNyZWF0ZVN5bmNIZWFkZXJzKGV4ZWN1dGlvbklkKTtcblx0XHRcdGNvbnN0IHVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24gPSBwcmV2aWV3ID8gYXdhaXQgdGhpcy5nZXRVc2VyRGF0YVN5bmNDb25maWd1cmF0aW9uKG1hbmlmZXN0T3JMYXRlc3REYXRhKSA6IHRoaXMuZ2V0TG9jYWxVc2VyRGF0YVN5bmNDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHN5bmNocm9uaXNlciBvZiBzeW5jaHJvbml6ZXJzKSB7XG5cdFx0XHRcdC8vIFJldHVybiBpZiBjYW5jZWxsYXRpb24gaXMgcmVxdWVzdGVkXG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJldHVybiBpZiByZXNvdXJjZSBpcyBub3QgZW5hYmxlZFxuXHRcdFx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNSZXNvdXJjZUVuYWJsZWQoc3luY2hyb25pc2VyLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVmT3JVc2VyRGF0YSA9IGdldFJlZk9yVXNlckRhdGEobWFuaWZlc3RPckxhdGVzdERhdGEsIHRoaXMuY29sbGVjdGlvbiwgc3luY2hyb25pc2VyLnJlc291cmNlKSA/PyBudWxsO1xuXHRcdFx0XHRcdGF3YWl0IHN5bmNocm9uaXNlci5zeW5jKHJlZk9yVXNlckRhdGEsIHByZXZpZXcsIHVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24sIHN5bmNIZWFkZXJzKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGNvbnN0IHVzZXJEYXRhU3luY0Vycm9yID0gVXNlckRhdGFTeW5jRXJyb3IudG9Vc2VyRGF0YVN5bmNFcnJvcihlKTtcblx0XHRcdFx0XHRyZXBvcnRVc2VyRGF0YVN5bmNFcnJvcih1c2VyRGF0YVN5bmNFcnJvciwgZXhlY3V0aW9uSWQsIHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSwgdGhpcy50ZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRcdFx0XHRpZiAoY2FuQmFpbG91dChlKSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgdXNlckRhdGFTeW5jRXJyb3I7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gTG9nIGFuZCBhbmQgY29udGludWVcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGAke3N5bmNocm9uaXNlci5yZXNvdXJjZX06ICR7dG9FcnJvck1lc3NhZ2UoZSl9YCk7XG5cdFx0XHRcdFx0c3luY0Vycm9ycy5wdXNoKFtzeW5jaHJvbmlzZXIucmVzb3VyY2UsIHVzZXJEYXRhU3luY0Vycm9yXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHN5bmNFcnJvcnM7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgYXBwbHkoZXhlY3V0aW9uSWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc3luY0hlYWRlcnMgPSBjcmVhdGVTeW5jSGVhZGVycyhleGVjdXRpb25JZCk7XG5cdFx0Zm9yIChjb25zdCBzeW5jaHJvbmlzZXIgb2YgdGhpcy5lbmFibGVkKSB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgc3luY2hyb25pc2VyLmFwcGx5KGZhbHNlLCBzeW5jSGVhZGVycyk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGNvbnN0IHVzZXJEYXRhU3luY0Vycm9yID0gVXNlckRhdGFTeW5jRXJyb3IudG9Vc2VyRGF0YVN5bmNFcnJvcihlKTtcblx0XHRcdFx0cmVwb3J0VXNlckRhdGFTeW5jRXJyb3IodXNlckRhdGFTeW5jRXJyb3IsIGV4ZWN1dGlvbklkLCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsIHRoaXMudGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0XHRcdGlmIChjYW5CYWlsb3V0KGUpKSB7XG5cdFx0XHRcdFx0dGhyb3cgdXNlckRhdGFTeW5jRXJyb3I7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBMb2cgYW5kIGFuZCBjb250aW51ZVxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgJHtzeW5jaHJvbmlzZXIucmVzb3VyY2V9OiAke3RvRXJyb3JNZXNzYWdlKGUpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCBzeW5jaHJvbmlzZXIgb2YgdGhpcy5lbmFibGVkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoc3luY2hyb25pc2VyLnN0YXR1cyAhPT0gU3luY1N0YXR1cy5JZGxlKSB7XG5cdFx0XHRcdFx0YXdhaXQgc3luY2hyb25pc2VyLnN0b3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVzZXRMb2NhbCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHN5bmNocm9uaXNlciBvZiB0aGlzLmVuYWJsZWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHN5bmNocm9uaXNlci5yZXNldExvY2FsKCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgJHtzeW5jaHJvbmlzZXIucmVzb3VyY2V9OiAke3RvRXJyb3JNZXNzYWdlKGUpfWApO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRVc2VyRGF0YVN5bmNDb25maWd1cmF0aW9uKG1hbmlmZXN0T3JMYXRlc3REYXRhOiBJVXNlckRhdGFNYW5pZmVzdCB8IElVc2VyRGF0YVN5bmNMYXRlc3REYXRhIHwgbnVsbCk6IFByb21pc2U8SVVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24+IHtcblx0XHRpZiAoIXRoaXMucHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdFx0Y29uc3QgbG9jYWwgPSB0aGlzLmdldExvY2FsVXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbigpO1xuXHRcdGNvbnN0IHNldHRpbmdzU3luY2hyb25pemVyID0gdGhpcy5lbmFibGVkLmZpbmQoc3luY2hyb25pemVyID0+IHN5bmNocm9uaXplciBpbnN0YW5jZW9mIFNldHRpbmdzU3luY2hyb25pc2VyKTtcblx0XHRpZiAoc2V0dGluZ3NTeW5jaHJvbml6ZXIpIHtcblx0XHRcdGNvbnN0IHJlbW90ZSA9IGF3YWl0IHNldHRpbmdzU3luY2hyb25pemVyLmdldFJlbW90ZVVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24oZ2V0UmVmT3JVc2VyRGF0YShtYW5pZmVzdE9yTGF0ZXN0RGF0YSwgdGhpcy5jb2xsZWN0aW9uLCBTeW5jUmVzb3VyY2UuU2V0dGluZ3MpID8/IG51bGwpO1xuXHRcdFx0cmV0dXJuIHsgLi4ubG9jYWwsIC4uLnJlbW90ZSB9O1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYWw7XG5cdH1cblxuXHRwcml2YXRlIGdldExvY2FsVXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbigpOiBJVXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVVNFUl9EQVRBX1NZTkNfQ09ORklHVVJBVElPTl9TQ09QRSk7XG5cdH1cblxuXHRwcml2YXRlIHNldFN0YXR1cyhzdGF0dXM6IFN5bmNTdGF0dXMpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdHVzICE9PSBzdGF0dXMpIHtcblx0XHRcdHRoaXMuX3N0YXR1cyA9IHN0YXR1cztcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdHVzLmZpcmUoc3RhdHVzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0YXR1cygpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZUNvbmZsaWN0cygpO1xuXHRcdGlmICh0aGlzLmVuYWJsZWQuc29tZShzID0+IHMuc3RhdHVzID09PSBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cykpIHtcblx0XHRcdHJldHVybiB0aGlzLnNldFN0YXR1cyhTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmVuYWJsZWQuc29tZShzID0+IHMuc3RhdHVzID09PSBTeW5jU3RhdHVzLlN5bmNpbmcpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZXRTdGF0dXMoU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuc2V0U3RhdHVzKFN5bmNTdGF0dXMuSWRsZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbmZsaWN0cygpOiB2b2lkIHtcblx0XHRjb25zdCBjb25mbGljdHMgPSB0aGlzLmVuYWJsZWQuZmlsdGVyKHMgPT4gcy5zdGF0dXMgPT09IFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKVxuXHRcdFx0LmZpbHRlcihzID0+IHMuY29uZmxpY3RzLmNvbmZsaWN0cy5sZW5ndGggPiAwKVxuXHRcdFx0Lm1hcChzID0+IHMuY29uZmxpY3RzKTtcblx0XHRpZiAoIWVxdWFscyh0aGlzLl9jb25mbGljdHMsIGNvbmZsaWN0cywgKGEsIGIpID0+IGEuc3luY1Jlc291cmNlID09PSBiLnN5bmNSZXNvdXJjZSAmJiBlcXVhbHMoYS5jb25mbGljdHMsIGIuY29uZmxpY3RzLCAoYSwgYikgPT4gaXNFcXVhbChhLnByZXZpZXdSZXNvdXJjZSwgYi5wcmV2aWV3UmVzb3VyY2UpKSkpIHtcblx0XHRcdHRoaXMuX2NvbmZsaWN0cyA9IGNvbmZsaWN0cztcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29uZmxpY3RzLmZpcmUoY29uZmxpY3RzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldE9yZGVyKHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlKTogbnVtYmVyIHtcblx0XHRzd2l0Y2ggKHN5bmNSZXNvdXJjZSkge1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuU2V0dGluZ3M6IHJldHVybiAwO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3M6IHJldHVybiAxO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuU25pcHBldHM6IHJldHVybiAyO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuVGFza3M6IHJldHVybiAzO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuTWNwOiByZXR1cm4gNDtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlOiByZXR1cm4gNTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLkV4dGVuc2lvbnM6IHJldHVybiA2O1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuUHJvbXB0czogcmV0dXJuIDc7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5Qcm9maWxlczogcmV0dXJuIDg7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5Xb3Jrc3BhY2VTdGF0ZTogcmV0dXJuIDk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGNhbkJhaWxvdXQoZTogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRpZiAoZSBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY0Vycm9yKSB7XG5cdFx0c3dpdGNoIChlLmNvZGUpIHtcblx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLk1ldGhvZE5vdEZvdW5kOlxuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVG9vTGFyZ2U6XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ub29NYW55UmVxdWVzdHM6XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ub29NYW55UmVxdWVzdHNBbmRSZXRyeUFmdGVyOlxuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTG9jYWxUb29NYW55UmVxdWVzdHM6XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Mb2NhbFRvb01hbnlQcm9maWxlczpcblx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkdvbmU6XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5VcGdyYWRlUmVxdWlyZWQ6XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5JbmNvbXBhdGlibGVSZW1vdGVDb250ZW50OlxuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuSW5jb21wYXRpYmxlTG9jYWxDb250ZW50OlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiByZXBvcnRVc2VyRGF0YVN5bmNFcnJvcih1c2VyRGF0YVN5bmNFcnJvcjogVXNlckRhdGFTeW5jRXJyb3IsIGV4ZWN1dGlvbklkOiBzdHJpbmcsIHVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSk6IHZvaWQge1xuXHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8U3luY0Vycm9yRXZlbnQsIFN5bmNFcnJvckNsYXNzaWZpY2F0aW9uPignc3luYy9lcnJvcicsXG5cdFx0e1xuXHRcdFx0Y29kZTogdXNlckRhdGFTeW5jRXJyb3IuY29kZSxcblx0XHRcdHNlcnZlckNvZGU6IHVzZXJEYXRhU3luY0Vycm9yIGluc3RhbmNlb2YgVXNlckRhdGFTeW5jU3RvcmVFcnJvciA/IFN0cmluZyh1c2VyRGF0YVN5bmNFcnJvci5zZXJ2ZXJDb2RlKSA6IHVuZGVmaW5lZCxcblx0XHRcdHVybDogdXNlckRhdGFTeW5jRXJyb3IgaW5zdGFuY2VvZiBVc2VyRGF0YVN5bmNTdG9yZUVycm9yID8gdXNlckRhdGFTeW5jRXJyb3IudXJsIDogdW5kZWZpbmVkLFxuXHRcdFx0cmVzb3VyY2U6IHVzZXJEYXRhU3luY0Vycm9yLnJlc291cmNlLFxuXHRcdFx0ZXhlY3V0aW9uSWQsXG5cdFx0XHRzZXJ2aWNlOiB1c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY1N0b3JlIS51cmwudG9TdHJpbmcoKVxuXHRcdH0pO1xufVxuXG5mdW5jdGlvbiBnZXRSZWZPclVzZXJEYXRhKG1hbmlmZXN0T3JMYXRlc3REYXRhOiBJVXNlckRhdGFNYW5pZmVzdCB8IElVc2VyRGF0YVN5bmNMYXRlc3REYXRhIHwgbnVsbCwgY29sbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCByZXNvdXJjZTogU3luY1Jlc291cmNlKTogc3RyaW5nIHwgSVVzZXJEYXRhIHwgdW5kZWZpbmVkIHtcblx0aWYgKGlzVXNlckRhdGFNYW5pZmVzdChtYW5pZmVzdE9yTGF0ZXN0RGF0YSkpIHtcblx0XHRpZiAoY29sbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIG1hbmlmZXN0T3JMYXRlc3REYXRhPy5jb2xsZWN0aW9ucz8uW2NvbGxlY3Rpb25dPy5sYXRlc3Q/LltyZXNvdXJjZV07XG5cdFx0fVxuXHRcdHJldHVybiBtYW5pZmVzdE9yTGF0ZXN0RGF0YT8ubGF0ZXN0Py5bcmVzb3VyY2VdO1xuXHR9XG5cdGlmIChjb2xsZWN0aW9uKSB7XG5cdFx0cmV0dXJuIG1hbmlmZXN0T3JMYXRlc3REYXRhPy5jb2xsZWN0aW9ucz8uW2NvbGxlY3Rpb25dPy5yZXNvdXJjZXM/LltyZXNvdXJjZV07XG5cdH1cblx0cmV0dXJuIG1hbmlmZXN0T3JMYXRlc3REYXRhPy5yZXNvdXJjZXM/LltyZXNvdXJjZV07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYztBQUN2QixTQUE0Qix5QkFBeUIsd0JBQXdCO0FBQzdFLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVcsbUJBQW1CO0FBRXZDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQTJCLGdDQUFnQztBQUMzRCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDRDQUE0QztBQUNyRDtBQUFBLEVBQ0M7QUFBQSxFQUFvQjtBQUFBLEVBRXBCO0FBQUEsRUFBdUQ7QUFBQSxFQUErQztBQUFBLEVBQXFDO0FBQUEsRUFDM0k7QUFBQSxFQUFjO0FBQUEsRUFB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LGtCQUFrQixNQUFNO0FBQUEsTUFDbkYsVUFBVSxrQkFBa0I7QUFBQSxNQUM1QjtBQUFBLE1BQ0EsU0FBUyxtQ0FBbUMsa0JBQW1CLElBQUksU0FBUztBQUFBLElBQzdFO0FBQUEsRUFBQztBQUNIO0FBRUEsU0FBUyxpQkFBaUIsc0JBQTBFLFlBQWdDLFVBQXdEO0FBQzNMLE1BQUksbUJBQW1CLG9CQUFvQixHQUFHO0FBQzdDLFFBQUksWUFBWTtBQUNmLGFBQU8sc0JBQXNCLGNBQWMsVUFBVSxHQUFHLFNBQVMsUUFBUTtBQUFBLElBQzFFO0FBQ0EsV0FBTyxzQkFBc0IsU0FBUyxRQUFRO0FBQUEsRUFDL0M7QUFDQSxNQUFJLFlBQVk7QUFDZixXQUFPLHNCQUFzQixjQUFjLFVBQVUsR0FBRyxZQUFZLFFBQVE7QUFBQSxFQUM3RTtBQUNBLFNBQU8sc0JBQXNCLFlBQVksUUFBUTtBQUNsRDsiLAogICJuYW1lcyI6IFsiZXJyb3IiLCAidXNlckRhdGFTeW5jRXJyb3IiLCAiY29udGVudCIsICJzeW5jUHJvZmlsZSIsICJhIiwgImIiLCAic3luY2hyb25pemVyIl0KfQo=
