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
import { createCancelablePromise, ThrottledDelayer } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Emitter } from "../../../base/common/event.js";
import { parse } from "../../../base/common/json.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { uppercaseFirstLetter } from "../../../base/common/strings.js";
import { isString, isUndefined } from "../../../base/common/types.js";
import { localize } from "../../../nls.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { FileOperationError, FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { getServiceMachineId } from "../../externalServices/common/serviceMachineId.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import {
  Change,
  getLastSyncResourceUri,
  IUserDataSyncLocalStoreService,
  IUserDataSyncLogService,
  IUserDataSyncEnablementService,
  IUserDataSyncStoreService,
  IUserDataSyncUtilService,
  MergeState,
  PREVIEW_DIR_NAME,
  SyncStatus,
  UserDataSyncError,
  UserDataSyncErrorCode,
  USER_DATA_SYNC_CONFIGURATION_SCOPE,
  USER_DATA_SYNC_SCHEME,
  getPathSegments,
  NON_EXISTING_RESOURCE_REF
} from "./userDataSync.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
function isRemoteUserData(thing) {
  if (thing && (thing.ref !== void 0 && typeof thing.ref === "string" && thing.ref !== "") && (thing.syncData !== void 0 && (thing.syncData === null || isSyncData(thing.syncData)))) {
    return true;
  }
  return false;
}
function isSyncData(thing) {
  if (thing && (thing.version !== void 0 && typeof thing.version === "number") && (thing.content !== void 0 && typeof thing.content === "string")) {
    if (Object.keys(thing).length === 2) {
      return true;
    }
    if (Object.keys(thing).length === 3 && (thing.machineId !== void 0 && typeof thing.machineId === "string")) {
      return true;
    }
  }
  return false;
}
function getSyncResourceLogLabel(syncResource, profile) {
  return `${uppercaseFirstLetter(syncResource)}${profile.isDefault ? "" : ` (${profile.name})`}`;
}
var SyncStrategy = /* @__PURE__ */ ((SyncStrategy2) => {
  SyncStrategy2["Preview"] = "preview";
  SyncStrategy2["Merge"] = "merge";
  SyncStrategy2["PullOrPush"] = "pull-push";
  return SyncStrategy2;
})(SyncStrategy || {});
let AbstractSynchroniser = class extends Disposable {
  constructor(syncResource, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService) {
    super();
    this.syncResource = syncResource;
    this.collection = collection;
    this.fileService = fileService;
    this.environmentService = environmentService;
    this.storageService = storageService;
    this.userDataSyncStoreService = userDataSyncStoreService;
    this.userDataSyncLocalStoreService = userDataSyncLocalStoreService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.telemetryService = telemetryService;
    this.logService = logService;
    this.configurationService = configurationService;
    this.syncPreviewPromise = null;
    this._status = SyncStatus.Idle;
    this._onDidChangStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangStatus.event;
    this._conflicts = [];
    this._onDidChangeConflicts = this._register(new Emitter());
    this.onDidChangeConflicts = this._onDidChangeConflicts.event;
    this.localChangeTriggerThrottler = this._register(new ThrottledDelayer(50));
    this._onDidChangeLocal = this._register(new Emitter());
    this.onDidChangeLocal = this._onDidChangeLocal.event;
    this.hasSyncResourceStateVersionChanged = false;
    this.syncHeaders = {};
    this.lastSyncUserDataStateKey = `${collection ? `${collection}.` : ""}${syncResource.syncResource}.lastSyncUserData`;
    this.resource = syncResource.syncResource;
    this.syncResourceLogLabel = getSyncResourceLogLabel(syncResource.syncResource, syncResource.profile);
    this.extUri = uriIdentityService.extUri;
    this.syncFolder = this.extUri.joinPath(environmentService.userDataSyncHome, ...getPathSegments(syncResource.profile.isDefault ? void 0 : syncResource.profile.id, syncResource.syncResource));
    this.syncPreviewFolder = this.extUri.joinPath(this.syncFolder, PREVIEW_DIR_NAME);
    this.lastSyncResource = getLastSyncResourceUri(syncResource.profile.isDefault ? void 0 : syncResource.profile.id, syncResource.syncResource, environmentService, this.extUri);
    this.currentMachineIdPromise = getServiceMachineId(environmentService, fileService, storageService);
  }
  get status() {
    return this._status;
  }
  get conflicts() {
    return { ...this.syncResource, conflicts: this._conflicts };
  }
  triggerLocalChange() {
    this.localChangeTriggerThrottler.trigger(() => this.doTriggerLocalChange());
  }
  async doTriggerLocalChange() {
    if (this.status === SyncStatus.HasConflicts) {
      this.logService.info(`${this.syncResourceLogLabel}: In conflicts state and local change detected. Syncing again...`);
      const preview = await this.syncPreviewPromise;
      this.syncPreviewPromise = null;
      const status = await this.performSync(preview.remoteUserData, preview.lastSyncUserData, "merge" /* Merge */, this.getUserDataSyncConfiguration());
      this.setStatus(status);
    } else {
      this.logService.trace(`${this.syncResourceLogLabel}: Checking for local changes...`);
      const lastSyncUserData = await this.getLastSyncUserData();
      const hasRemoteChanged = lastSyncUserData ? await this.hasRemoteChanged(lastSyncUserData) : true;
      if (hasRemoteChanged) {
        this._onDidChangeLocal.fire();
      }
    }
  }
  setStatus(status) {
    if (this._status !== status) {
      this._status = status;
      this._onDidChangStatus.fire(status);
    }
  }
  async sync(refOrUserData, preview = false, userDataSyncConfiguration = this.getUserDataSyncConfiguration(), headers = {}) {
    try {
      this.syncHeaders = { ...headers };
      if (this.status === SyncStatus.HasConflicts) {
        this.logService.info(`${this.syncResourceLogLabel}: Skipped synchronizing ${this.resource.toLowerCase()} as there are conflicts.`);
        return this.syncPreviewPromise;
      }
      if (this.status === SyncStatus.Syncing) {
        this.logService.info(`${this.syncResourceLogLabel}: Skipped synchronizing ${this.resource.toLowerCase()} as it is running already.`);
        return this.syncPreviewPromise;
      }
      this.logService.trace(`${this.syncResourceLogLabel}: Started synchronizing ${this.resource.toLowerCase()}...`);
      this.setStatus(SyncStatus.Syncing);
      let status = SyncStatus.Idle;
      try {
        const lastSyncUserData = await this.getLastSyncUserData();
        const remoteUserData = await this.getLatestRemoteUserData(refOrUserData, lastSyncUserData);
        status = await this.performSync(remoteUserData, lastSyncUserData, preview ? "preview" /* Preview */ : "merge" /* Merge */, userDataSyncConfiguration);
        if (status === SyncStatus.HasConflicts) {
          this.logService.info(`${this.syncResourceLogLabel}: Detected conflicts while synchronizing ${this.resource.toLowerCase()}.`);
        } else if (status === SyncStatus.Idle) {
          this.logService.trace(`${this.syncResourceLogLabel}: Finished synchronizing ${this.resource.toLowerCase()}.`);
        }
        return this.syncPreviewPromise || null;
      } finally {
        this.setStatus(status);
      }
    } finally {
      this.syncHeaders = {};
    }
  }
  async apply(force, headers = {}) {
    try {
      this.syncHeaders = { ...headers };
      const status = await this.doApply(force);
      this.setStatus(status);
      return this.syncPreviewPromise;
    } finally {
      this.syncHeaders = {};
    }
  }
  async replace(content) {
    const syncData = this.parseSyncData(content);
    if (!syncData) {
      return false;
    }
    await this.stop();
    try {
      this.logService.trace(`${this.syncResourceLogLabel}: Started resetting ${this.resource.toLowerCase()}...`);
      this.setStatus(SyncStatus.Syncing);
      const lastSyncUserData = await this.getLastSyncUserData();
      const remoteUserData = await this.getLatestRemoteUserData(null, lastSyncUserData);
      const isRemoteDataFromCurrentMachine = await this.isRemoteDataFromCurrentMachine(remoteUserData);
      const resourcePreviewResults = await this.generateSyncPreview({ ref: remoteUserData.ref, syncData }, lastSyncUserData, isRemoteDataFromCurrentMachine, this.getUserDataSyncConfiguration(), CancellationToken.None);
      const resourcePreviews = [];
      for (const resourcePreviewResult of resourcePreviewResults) {
        const acceptResult = await this.getAcceptResult(resourcePreviewResult, resourcePreviewResult.remoteResource, void 0, CancellationToken.None);
        const { remoteChange } = await this.getAcceptResult(resourcePreviewResult, resourcePreviewResult.previewResource, resourcePreviewResult.remoteContent, CancellationToken.None);
        resourcePreviews.push([resourcePreviewResult, { ...acceptResult, remoteChange: remoteChange !== Change.None ? remoteChange : Change.Modified }]);
      }
      await this.applyResult(remoteUserData, lastSyncUserData, resourcePreviews, false);
      this.logService.info(`${this.syncResourceLogLabel}: Finished resetting ${this.resource.toLowerCase()}.`);
    } finally {
      this.setStatus(SyncStatus.Idle);
    }
    return true;
  }
  async isRemoteDataFromCurrentMachine(remoteUserData) {
    const machineId = await this.currentMachineIdPromise;
    return !!remoteUserData.syncData?.machineId && remoteUserData.syncData.machineId === machineId;
  }
  async getLatestRemoteUserData(refOrLatestData, lastSyncUserData) {
    if (refOrLatestData === null) {
      return { ref: NON_EXISTING_RESOURCE_REF, syncData: null };
    }
    if (!isString(refOrLatestData)) {
      return this.toRemoteUserData(refOrLatestData);
    }
    if (lastSyncUserData?.ref === refOrLatestData) {
      return lastSyncUserData;
    }
    return this.getRemoteUserData(lastSyncUserData);
  }
  async performSync(remoteUserData, lastSyncUserData, strategy, userDataSyncConfiguration) {
    if (remoteUserData.syncData && remoteUserData.syncData.version > this.version) {
      throw new UserDataSyncError(localize({ key: "incompatible", comment: ["This is an error while syncing a resource that its local version is not compatible with its remote version."] }, "Cannot sync {0} as its local version {1} is not compatible with its remote version {2}", this.resource, this.version, remoteUserData.syncData.version), UserDataSyncErrorCode.IncompatibleLocalContent, this.resource);
    }
    try {
      return await this.doSync(remoteUserData, lastSyncUserData, strategy, userDataSyncConfiguration);
    } catch (e) {
      if (e instanceof UserDataSyncError) {
        switch (e.code) {
          case UserDataSyncErrorCode.LocalPreconditionFailed:
            this.logService.info(`${this.syncResourceLogLabel}: Failed to synchronize ${this.syncResourceLogLabel} as there is a new local version available. Synchronizing again...`);
            return this.performSync(remoteUserData, lastSyncUserData, strategy, userDataSyncConfiguration);
          case UserDataSyncErrorCode.Conflict:
          case UserDataSyncErrorCode.PreconditionFailed:
            this.logService.info(`${this.syncResourceLogLabel}: Failed to synchronize as there is a new remote version available. Synchronizing again...`);
            remoteUserData = await this.getRemoteUserData(null);
            lastSyncUserData = await this.getLastSyncUserData();
            return this.performSync(remoteUserData, lastSyncUserData, "merge" /* Merge */, userDataSyncConfiguration);
        }
      }
      throw e;
    }
  }
  async doSync(remoteUserData, lastSyncUserData, strategy, userDataSyncConfiguration) {
    try {
      const isRemoteDataFromCurrentMachine = await this.isRemoteDataFromCurrentMachine(remoteUserData);
      const acceptRemote = !isRemoteDataFromCurrentMachine && lastSyncUserData === null && this.getStoredLastSyncUserDataStateContent() !== void 0;
      const merge = strategy === "preview" /* Preview */ || strategy === "merge" /* Merge */ && !acceptRemote;
      const apply = strategy === "merge" /* Merge */ || strategy === "pull-push" /* PullOrPush */;
      if (!this.syncPreviewPromise) {
        this.syncPreviewPromise = createCancelablePromise((token) => this.doGenerateSyncResourcePreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine, merge, userDataSyncConfiguration, token));
      }
      let preview = await this.syncPreviewPromise;
      if (strategy === "merge" /* Merge */ && acceptRemote) {
        this.logService.info(`${this.syncResourceLogLabel}: Accepting remote because it was synced before and the last sync data is not available.`);
        for (const resourcePreview of preview.resourcePreviews) {
          preview = await this.accept(resourcePreview.remoteResource) || preview;
        }
      } else if (strategy === "pull-push" /* PullOrPush */) {
        for (const resourcePreview of preview.resourcePreviews) {
          if (resourcePreview.mergeState === MergeState.Accepted) {
            continue;
          }
          if (remoteUserData.ref === lastSyncUserData?.ref || isRemoteDataFromCurrentMachine) {
            preview = await this.accept(resourcePreview.localResource) ?? preview;
          } else {
            preview = await this.accept(resourcePreview.remoteResource) ?? preview;
          }
        }
      }
      this.updateConflicts(preview.resourcePreviews);
      if (preview.resourcePreviews.some(({ mergeState }) => mergeState === MergeState.Conflict)) {
        return SyncStatus.HasConflicts;
      }
      if (apply) {
        return await this.doApply(false);
      }
      return SyncStatus.Syncing;
    } catch (error) {
      this.syncPreviewPromise = null;
      throw error;
    }
  }
  async accept(resource, content) {
    await this.updateSyncResourcePreview(resource, async (resourcePreview) => {
      const acceptResult = await this.getAcceptResult(resourcePreview, resource, content, CancellationToken.None);
      resourcePreview.acceptResult = acceptResult;
      resourcePreview.mergeState = MergeState.Accepted;
      resourcePreview.localChange = acceptResult.localChange;
      resourcePreview.remoteChange = acceptResult.remoteChange;
      return resourcePreview;
    });
    return this.syncPreviewPromise;
  }
  async discard(resource) {
    await this.updateSyncResourcePreview(resource, async (resourcePreview) => {
      const mergeResult = await this.getMergeResult(resourcePreview, CancellationToken.None);
      await this.fileService.writeFile(resourcePreview.previewResource, VSBuffer.fromString(mergeResult.content || ""));
      resourcePreview.acceptResult = void 0;
      resourcePreview.mergeState = MergeState.Preview;
      resourcePreview.localChange = mergeResult.localChange;
      resourcePreview.remoteChange = mergeResult.remoteChange;
      return resourcePreview;
    });
    return this.syncPreviewPromise;
  }
  async updateSyncResourcePreview(resource, updateResourcePreview) {
    if (!this.syncPreviewPromise) {
      return;
    }
    let preview = await this.syncPreviewPromise;
    const index = preview.resourcePreviews.findIndex(({ localResource, remoteResource, previewResource }) => this.extUri.isEqual(localResource, resource) || this.extUri.isEqual(remoteResource, resource) || this.extUri.isEqual(previewResource, resource));
    if (index === -1) {
      return;
    }
    this.syncPreviewPromise = createCancelablePromise(async (token) => {
      const resourcePreviews = [...preview.resourcePreviews];
      resourcePreviews[index] = await updateResourcePreview(resourcePreviews[index]);
      return {
        ...preview,
        resourcePreviews
      };
    });
    preview = await this.syncPreviewPromise;
    this.updateConflicts(preview.resourcePreviews);
    if (preview.resourcePreviews.some(({ mergeState }) => mergeState === MergeState.Conflict)) {
      this.setStatus(SyncStatus.HasConflicts);
    } else {
      this.setStatus(SyncStatus.Syncing);
    }
  }
  async doApply(force) {
    if (!this.syncPreviewPromise) {
      return SyncStatus.Idle;
    }
    const preview = await this.syncPreviewPromise;
    if (preview.resourcePreviews.some(({ mergeState }) => mergeState === MergeState.Conflict)) {
      return SyncStatus.HasConflicts;
    }
    if (preview.resourcePreviews.some(({ mergeState }) => mergeState !== MergeState.Accepted)) {
      return SyncStatus.Syncing;
    }
    await this.applyResult(preview.remoteUserData, preview.lastSyncUserData, preview.resourcePreviews.map((resourcePreview) => [resourcePreview, resourcePreview.acceptResult]), force);
    this.syncPreviewPromise = null;
    await this.clearPreviewFolder();
    return SyncStatus.Idle;
  }
  async clearPreviewFolder() {
    try {
      await this.fileService.del(this.syncPreviewFolder, { recursive: true });
    } catch (error) {
    }
  }
  updateConflicts(resourcePreviews) {
    const conflicts = resourcePreviews.filter(({ mergeState }) => mergeState === MergeState.Conflict);
    if (!equals(this._conflicts, conflicts, (a, b) => this.extUri.isEqual(a.previewResource, b.previewResource))) {
      this._conflicts = conflicts;
      this._onDidChangeConflicts.fire(this.conflicts);
    }
  }
  async hasPreviouslySynced() {
    const lastSyncData = await this.getLastSyncUserData();
    return !!lastSyncData && lastSyncData.syncData !== null;
  }
  async resolvePreviewContent(uri) {
    const syncPreview = this.syncPreviewPromise ? await this.syncPreviewPromise : null;
    if (syncPreview) {
      for (const resourcePreview of syncPreview.resourcePreviews) {
        if (this.extUri.isEqual(resourcePreview.acceptedResource, uri)) {
          return resourcePreview.acceptResult ? resourcePreview.acceptResult.content : null;
        }
        if (this.extUri.isEqual(resourcePreview.remoteResource, uri)) {
          return resourcePreview.remoteContent;
        }
        if (this.extUri.isEqual(resourcePreview.localResource, uri)) {
          return resourcePreview.localContent;
        }
        if (this.extUri.isEqual(resourcePreview.baseResource, uri)) {
          return resourcePreview.baseContent;
        }
      }
    }
    return null;
  }
  async resetLocal() {
    this.storageService.remove(this.lastSyncUserDataStateKey, StorageScope.APPLICATION);
    try {
      await this.fileService.del(this.lastSyncResource);
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.error(error);
      }
    }
  }
  async doGenerateSyncResourcePreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine, merge, userDataSyncConfiguration, token) {
    const resourcePreviewResults = await this.generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine, userDataSyncConfiguration, token);
    const resourcePreviews = [];
    for (const resourcePreviewResult of resourcePreviewResults) {
      const acceptedResource = resourcePreviewResult.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" });
      if (resourcePreviewResult.localChange === Change.None && resourcePreviewResult.remoteChange === Change.None) {
        resourcePreviews.push({
          ...resourcePreviewResult,
          acceptedResource,
          acceptResult: { content: null, localChange: Change.None, remoteChange: Change.None },
          mergeState: MergeState.Accepted
        });
      } else {
        const mergeResult = merge ? await this.getMergeResult(resourcePreviewResult, token) : void 0;
        if (token.isCancellationRequested) {
          break;
        }
        await this.fileService.writeFile(resourcePreviewResult.previewResource, VSBuffer.fromString(mergeResult?.content || ""));
        const acceptResult = mergeResult && !mergeResult.hasConflicts ? await this.getAcceptResult(resourcePreviewResult, resourcePreviewResult.previewResource, void 0, token) : void 0;
        resourcePreviews.push({
          ...resourcePreviewResult,
          acceptResult,
          mergeState: mergeResult?.hasConflicts ? MergeState.Conflict : acceptResult ? MergeState.Accepted : MergeState.Preview,
          localChange: acceptResult ? acceptResult.localChange : mergeResult ? mergeResult.localChange : resourcePreviewResult.localChange,
          remoteChange: acceptResult ? acceptResult.remoteChange : mergeResult ? mergeResult.remoteChange : resourcePreviewResult.remoteChange
        });
      }
    }
    return { syncResource: this.resource, profile: this.syncResource.profile, remoteUserData, lastSyncUserData, resourcePreviews, isLastSyncFromCurrentMachine: isRemoteDataFromCurrentMachine };
  }
  async getLastSyncUserData() {
    const storedLastSyncUserDataStateContent = this.getStoredLastSyncUserDataStateContent();
    if (!storedLastSyncUserDataStateContent) {
      this.logService.info(`${this.syncResourceLogLabel}: Last sync data state does not exist.`);
      return null;
    }
    const lastSyncUserDataState = JSON.parse(storedLastSyncUserDataStateContent);
    const resourceSyncStateVersion = this.userDataSyncEnablementService.getResourceSyncStateVersion(this.resource);
    this.hasSyncResourceStateVersionChanged = !!lastSyncUserDataState.version && !!resourceSyncStateVersion && lastSyncUserDataState.version !== resourceSyncStateVersion;
    if (this.hasSyncResourceStateVersionChanged) {
      this.logService.info(`${this.syncResourceLogLabel}: Reset last sync state because last sync state version ${lastSyncUserDataState.version} is not compatible with current sync state version ${resourceSyncStateVersion}.`);
      await this.resetLocal();
      return null;
    }
    let syncData = void 0;
    let retrial = 1;
    while (syncData === void 0 && retrial++ < 6) {
      try {
        const lastSyncStoredRemoteUserData = await this.readLastSyncStoredRemoteUserData();
        if (lastSyncStoredRemoteUserData) {
          if (lastSyncStoredRemoteUserData.ref === lastSyncUserDataState.ref) {
            syncData = lastSyncStoredRemoteUserData.syncData;
          } else {
            this.logService.info(`${this.syncResourceLogLabel}: Last sync data stored locally is not same as the last sync state.`);
          }
        }
        break;
      } catch (error) {
        if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
          this.logService.info(`${this.syncResourceLogLabel}: Last sync resource does not exist locally.`);
          break;
        } else if (error instanceof UserDataSyncError) {
          throw error;
        } else {
          this.logService.error(error, retrial);
        }
      }
    }
    if (syncData === void 0) {
      try {
        const content = await this.userDataSyncStoreService.resolveResourceContent(this.resource, lastSyncUserDataState.ref, this.collection, this.syncHeaders);
        syncData = content === null ? null : this.parseSyncData(content);
        await this.writeLastSyncStoredRemoteUserData({ ref: lastSyncUserDataState.ref, syncData });
      } catch (error) {
        if (error instanceof UserDataSyncError && error.code === UserDataSyncErrorCode.NotFound) {
          this.logService.info(`${this.syncResourceLogLabel}: Last sync resource does not exist remotely.`);
        } else {
          throw error;
        }
      }
    }
    if (syncData === void 0) {
      return null;
    }
    return {
      ...lastSyncUserDataState,
      syncData
    };
  }
  async updateLastSyncUserData(lastSyncRemoteUserData, additionalProps = {}) {
    if (additionalProps["ref"] || additionalProps["version"]) {
      throw new Error("Cannot have core properties as additional");
    }
    const version = this.userDataSyncEnablementService.getResourceSyncStateVersion(this.resource);
    const lastSyncUserDataState = {
      ref: lastSyncRemoteUserData.ref,
      version,
      ...additionalProps
    };
    this.storageService.store(this.lastSyncUserDataStateKey, JSON.stringify(lastSyncUserDataState), StorageScope.APPLICATION, StorageTarget.MACHINE);
    await this.writeLastSyncStoredRemoteUserData(lastSyncRemoteUserData);
  }
  getStoredLastSyncUserDataStateContent() {
    return this.storageService.get(this.lastSyncUserDataStateKey, StorageScope.APPLICATION);
  }
  async readLastSyncStoredRemoteUserData() {
    const content = (await this.fileService.readFile(this.lastSyncResource)).value.toString();
    try {
      const lastSyncStoredRemoteUserData = content ? JSON.parse(content) : void 0;
      if (isRemoteUserData(lastSyncStoredRemoteUserData)) {
        return lastSyncStoredRemoteUserData;
      }
    } catch (e) {
      this.logService.error(e);
    }
    return void 0;
  }
  async writeLastSyncStoredRemoteUserData(lastSyncRemoteUserData) {
    await this.fileService.writeFile(this.lastSyncResource, VSBuffer.fromString(JSON.stringify(lastSyncRemoteUserData)));
  }
  async getRemoteUserData(lastSyncData) {
    const userData = await this.getUserData(lastSyncData);
    return this.toRemoteUserData(userData);
  }
  toRemoteUserData({ ref, content }) {
    let syncData = null;
    if (content !== null) {
      syncData = this.parseSyncData(content);
    }
    return { ref, syncData };
  }
  parseSyncData(content) {
    try {
      const syncData = JSON.parse(content);
      if (isSyncData(syncData)) {
        return syncData;
      }
    } catch (error) {
      this.logService.error(error);
    }
    throw new UserDataSyncError(localize("incompatible sync data", "Cannot parse sync data as it is not compatible with the current version."), UserDataSyncErrorCode.IncompatibleRemoteContent, this.resource);
  }
  async getUserData(lastSyncData) {
    const lastSyncUserData = lastSyncData ? { ref: lastSyncData.ref, content: lastSyncData.syncData ? JSON.stringify(lastSyncData.syncData) : null } : null;
    return this.userDataSyncStoreService.readResource(this.resource, lastSyncUserData, this.collection, this.syncHeaders);
  }
  async updateRemoteUserData(content, ref) {
    const machineId = await this.currentMachineIdPromise;
    const syncData = { version: this.version, machineId, content };
    try {
      ref = await this.userDataSyncStoreService.writeResource(this.resource, JSON.stringify(syncData), ref, this.collection, this.syncHeaders);
      return { ref, syncData };
    } catch (error) {
      if (error instanceof UserDataSyncError && error.code === UserDataSyncErrorCode.TooLarge) {
        error = new UserDataSyncError(error.message, error.code, this.resource);
      }
      throw error;
    }
  }
  async backupLocal(content) {
    const syncData = { version: this.version, content };
    return this.userDataSyncLocalStoreService.writeResource(this.resource, JSON.stringify(syncData), /* @__PURE__ */ new Date(), this.syncResource.profile.isDefault ? void 0 : this.syncResource.profile.id);
  }
  async stop() {
    if (this.status === SyncStatus.Idle) {
      return;
    }
    this.logService.trace(`${this.syncResourceLogLabel}: Stopping synchronizing ${this.resource.toLowerCase()}.`);
    if (this.syncPreviewPromise) {
      this.syncPreviewPromise.cancel();
      this.syncPreviewPromise = null;
    }
    this.updateConflicts([]);
    await this.clearPreviewFolder();
    this.setStatus(SyncStatus.Idle);
    this.logService.info(`${this.syncResourceLogLabel}: Stopped synchronizing ${this.resource.toLowerCase()}.`);
  }
  getUserDataSyncConfiguration() {
    return this.configurationService.getValue(USER_DATA_SYNC_CONFIGURATION_SCOPE);
  }
};
AbstractSynchroniser = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUserDataSyncStoreService),
  __decorateParam(6, IUserDataSyncLocalStoreService),
  __decorateParam(7, IUserDataSyncEnablementService),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, IUserDataSyncLogService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IUriIdentityService)
], AbstractSynchroniser);
let AbstractFileSynchroniser = class extends AbstractSynchroniser {
  constructor(file, syncResource, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService) {
    super(syncResource, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
    this.file = file;
    this._register(this.fileService.watch(this.extUri.dirname(file)));
    this._register(this.fileService.onDidFilesChange((e) => this.onFileChanges(e)));
  }
  async getLocalFileContent() {
    try {
      return await this.fileService.readFile(this.file);
    } catch (error) {
      return null;
    }
  }
  async updateLocalFileContent(newContent, oldContent, force) {
    try {
      if (oldContent) {
        await this.fileService.writeFile(this.file, VSBuffer.fromString(newContent), force ? void 0 : oldContent);
      } else {
        await this.fileService.createFile(this.file, VSBuffer.fromString(newContent), { overwrite: force });
      }
    } catch (e) {
      if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND || e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
        throw new UserDataSyncError(e.message, UserDataSyncErrorCode.LocalPreconditionFailed);
      } else {
        throw e;
      }
    }
  }
  async deleteLocalFile() {
    try {
      await this.fileService.del(this.file);
    } catch (e) {
      if (!(e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND)) {
        throw e;
      }
    }
  }
  onFileChanges(e) {
    if (!e.contains(this.file)) {
      return;
    }
    this.triggerLocalChange();
  }
};
AbstractFileSynchroniser = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IUserDataSyncStoreService),
  __decorateParam(7, IUserDataSyncLocalStoreService),
  __decorateParam(8, IUserDataSyncEnablementService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, IUserDataSyncLogService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IUriIdentityService)
], AbstractFileSynchroniser);
let AbstractJsonFileSynchroniser = class extends AbstractFileSynchroniser {
  constructor(file, syncResource, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, userDataSyncUtilService, configurationService, uriIdentityService) {
    super(file, syncResource, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
    this.userDataSyncUtilService = userDataSyncUtilService;
    this._formattingOptions = void 0;
  }
  hasErrors(content, isArray) {
    const parseErrors = [];
    const result = parse(content, parseErrors, { allowEmptyContent: true, allowTrailingComma: true });
    return parseErrors.length > 0 || !isUndefined(result) && isArray !== Array.isArray(result);
  }
  getFormattingOptions() {
    if (!this._formattingOptions) {
      this._formattingOptions = this.userDataSyncUtilService.resolveFormattingOptions(this.file);
    }
    return this._formattingOptions;
  }
};
AbstractJsonFileSynchroniser = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IUserDataSyncStoreService),
  __decorateParam(7, IUserDataSyncLocalStoreService),
  __decorateParam(8, IUserDataSyncEnablementService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, IUserDataSyncLogService),
  __decorateParam(11, IUserDataSyncUtilService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IUriIdentityService)
], AbstractJsonFileSynchroniser);
let AbstractInitializer = class {
  constructor(resource, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService) {
    this.resource = resource;
    this.userDataProfilesService = userDataProfilesService;
    this.environmentService = environmentService;
    this.logService = logService;
    this.fileService = fileService;
    this.storageService = storageService;
    this.extUri = uriIdentityService.extUri;
    this.lastSyncResource = getLastSyncResourceUri(void 0, this.resource, environmentService, this.extUri);
  }
  async initialize({ ref, content }) {
    if (!content) {
      this.logService.info("Remote content does not exist.", this.resource);
      return;
    }
    const syncData = this.parseSyncData(content);
    if (!syncData) {
      return;
    }
    try {
      await this.doInitialize({ ref, syncData });
    } catch (error) {
      this.logService.error(error);
    }
  }
  parseSyncData(content) {
    try {
      const syncData = JSON.parse(content);
      if (isSyncData(syncData)) {
        return syncData;
      }
    } catch (error) {
      this.logService.error(error);
    }
    this.logService.info("Cannot parse sync data as it is not compatible with the current version.", this.resource);
    return void 0;
  }
  async updateLastSyncUserData(lastSyncRemoteUserData, additionalProps = {}) {
    if (additionalProps["ref"] || additionalProps["version"]) {
      throw new Error("Cannot have core properties as additional");
    }
    const lastSyncUserDataState = {
      ref: lastSyncRemoteUserData.ref,
      version: void 0,
      ...additionalProps
    };
    this.storageService.store(`${this.resource}.lastSyncUserData`, JSON.stringify(lastSyncUserDataState), StorageScope.APPLICATION, StorageTarget.MACHINE);
    await this.fileService.writeFile(this.lastSyncResource, VSBuffer.fromString(JSON.stringify(lastSyncRemoteUserData)));
  }
};
AbstractInitializer = __decorateClass([
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IFileService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IUriIdentityService)
], AbstractInitializer);
export {
  AbstractFileSynchroniser,
  AbstractInitializer,
  AbstractJsonFileSynchroniser,
  AbstractSynchroniser,
  SyncStrategy,
  getSyncResourceLogLabel,
  isRemoteUserData,
  isSyncData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vYWJzdHJhY3RTeW5jaHJvbml6ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBUaHJvdHRsZWREZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHBhcnNlLCBQYXJzZUVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBGb3JtYXR0aW5nT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25Gb3JtYXR0ZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IHVwcGVyY2FzZUZpcnN0TGV0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZywgaXNVbmRlZmluZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUhlYWRlcnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEZpbGVDaGFuZ2VzRXZlbnQsIEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVDb250ZW50LCBJRmlsZVNlcnZpY2UsIHRvRmlsZU9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGdldFNlcnZpY2VNYWNoaW5lSWQgfSBmcm9tICcuLi8uLi9leHRlcm5hbFNlcnZpY2VzL2NvbW1vbi9zZXJ2aWNlTWFjaGluZUlkLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHtcblx0Q2hhbmdlLCBnZXRMYXN0U3luY1Jlc291cmNlVXJpLCBJUmVtb3RlVXNlckRhdGEsIElSZXNvdXJjZVByZXZpZXcgYXMgSUJhc2VSZXNvdXJjZVByZXZpZXcsIElTeW5jRGF0YSxcblx0SVVzZXJEYXRhU3luY1Jlc291cmNlUHJldmlldyBhcyBJQmFzZVN5bmNSZXNvdXJjZVByZXZpZXcsIElVc2VyRGF0YSwgSVVzZXJEYXRhU3luY1Jlc291cmNlSW5pdGlhbGl6ZXIsIElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSxcblx0SVVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24sIElVc2VyRGF0YVN5bmNocm9uaXNlciwgSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsIElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSxcblx0SVVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlLCBNZXJnZVN0YXRlLCBQUkVWSUVXX0RJUl9OQU1FLCBTeW5jUmVzb3VyY2UsIFN5bmNTdGF0dXMsIFVzZXJEYXRhU3luY0Vycm9yLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUsXG5cdFVTRVJfREFUQV9TWU5DX0NPTkZJR1VSQVRJT05fU0NPUEUsIFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgZ2V0UGF0aFNlZ21lbnRzLCBJVXNlckRhdGFTeW5jUmVzb3VyY2VDb25mbGljdHMsXG5cdElVc2VyRGF0YVN5bmNSZXNvdXJjZSwgSVVzZXJEYXRhU3luY1Jlc291cmNlUHJldmlldyxcblx0Tk9OX0VYSVNUSU5HX1JFU09VUkNFX1JFRixcbn0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNSZW1vdGVVc2VyRGF0YSh0aGluZzogYW55KTogdGhpbmcgaXMgSVJlbW90ZVVzZXJEYXRhIHtcblx0aWYgKHRoaW5nXG5cdFx0JiYgKHRoaW5nLnJlZiAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiB0aGluZy5yZWYgPT09ICdzdHJpbmcnICYmIHRoaW5nLnJlZiAhPT0gJycpXG5cdFx0JiYgKHRoaW5nLnN5bmNEYXRhICE9PSB1bmRlZmluZWQgJiYgKHRoaW5nLnN5bmNEYXRhID09PSBudWxsIHx8IGlzU3luY0RhdGEodGhpbmcuc3luY0RhdGEpKSkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3luY0RhdGEodGhpbmc6IGFueSk6IHRoaW5nIGlzIElTeW5jRGF0YSB7XG5cdGlmICh0aGluZ1xuXHRcdCYmICh0aGluZy52ZXJzaW9uICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIHRoaW5nLnZlcnNpb24gPT09ICdudW1iZXInKVxuXHRcdCYmICh0aGluZy5jb250ZW50ICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIHRoaW5nLmNvbnRlbnQgPT09ICdzdHJpbmcnKSkge1xuXG5cdFx0Ly8gYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuXHRcdGlmIChPYmplY3Qua2V5cyh0aGluZykubGVuZ3RoID09PSAyKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoT2JqZWN0LmtleXModGhpbmcpLmxlbmd0aCA9PT0gM1xuXHRcdFx0JiYgKHRoaW5nLm1hY2hpbmVJZCAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiB0aGluZy5tYWNoaW5lSWQgPT09ICdzdHJpbmcnKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3luY1Jlc291cmNlTG9nTGFiZWwoc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UsIHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7dXBwZXJjYXNlRmlyc3RMZXR0ZXIoc3luY1Jlc291cmNlKX0ke3Byb2ZpbGUuaXNEZWZhdWx0ID8gJycgOiBgICgke3Byb2ZpbGUubmFtZX0pYH1gO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNvdXJjZVByZXZpZXcge1xuXG5cdHJlYWRvbmx5IGJhc2VSZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBiYXNlQ29udGVudDogc3RyaW5nIHwgbnVsbDtcblxuXHRyZWFkb25seSByZW1vdGVSZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSByZW1vdGVDb250ZW50OiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSByZW1vdGVDaGFuZ2U6IENoYW5nZTtcblxuXHRyZWFkb25seSBsb2NhbFJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGxvY2FsQ29udGVudDogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgbG9jYWxDaGFuZ2U6IENoYW5nZTtcblxuXHRyZWFkb25seSBwcmV2aWV3UmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgYWNjZXB0ZWRSZXNvdXJjZTogVVJJO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBY2NlcHRSZXN1bHQge1xuXHRyZWFkb25seSBjb250ZW50OiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBsb2NhbENoYW5nZTogQ2hhbmdlO1xuXHRyZWFkb25seSByZW1vdGVDaGFuZ2U6IENoYW5nZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWVyZ2VSZXN1bHQgZXh0ZW5kcyBJQWNjZXB0UmVzdWx0IHtcblx0cmVhZG9ubHkgaGFzQ29uZmxpY3RzOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSUVkaXRhYmxlUmVzb3VyY2VQcmV2aWV3IGV4dGVuZHMgSUJhc2VSZXNvdXJjZVByZXZpZXcsIElSZXNvdXJjZVByZXZpZXcge1xuXHRsb2NhbENoYW5nZTogQ2hhbmdlO1xuXHRyZW1vdGVDaGFuZ2U6IENoYW5nZTtcblx0bWVyZ2VTdGF0ZTogTWVyZ2VTdGF0ZTtcblx0YWNjZXB0UmVzdWx0PzogSUFjY2VwdFJlc3VsdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3luY1Jlc291cmNlUHJldmlldyBleHRlbmRzIElCYXNlU3luY1Jlc291cmNlUHJldmlldyB7XG5cdHJlYWRvbmx5IHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGE7XG5cdHJlYWRvbmx5IGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSB8IG51bGw7XG5cdHJlYWRvbmx5IHJlc291cmNlUHJldmlld3M6IElFZGl0YWJsZVJlc291cmNlUHJldmlld1tdO1xufVxuXG5pbnRlcmZhY2UgSUxhc3RTeW5jVXNlckRhdGFTdGF0ZSB7XG5cdHJlYWRvbmx5IHJlZjogc3RyaW5nO1xuXHRyZWFkb25seSB2ZXJzaW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFtrZXk6IHN0cmluZ106IGFueTtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gU3luY1N0cmF0ZWd5IHtcblx0UHJldmlldyA9ICdwcmV2aWV3JywgLy8gTWVyZ2UgdGhlIGxvY2FsIGFuZCByZW1vdGUgZGF0YSB3aXRob3V0IGFwcGx5aW5nLlxuXHRNZXJnZSA9ICdtZXJnZScsIC8vIE1lcmdlIHRoZSBsb2NhbCBhbmQgcmVtb3RlIGRhdGEgYW5kIGFwcGx5LlxuXHRQdWxsT3JQdXNoID0gJ3B1bGwtcHVzaCcsIC8vIFB1bGwgdGhlIHJlbW90ZSBkYXRhIG9yIHB1c2ggdGhlIGxvY2FsIGRhdGEuXG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdFN5bmNocm9uaXNlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVXNlckRhdGFTeW5jaHJvbmlzZXIge1xuXG5cdHByaXZhdGUgc3luY1ByZXZpZXdQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTxJU3luY1Jlc291cmNlUHJldmlldz4gfCBudWxsID0gbnVsbDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgc3luY0ZvbGRlcjogVVJJO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgc3luY1ByZXZpZXdGb2xkZXI6IFVSSTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IGV4dFVyaTogSUV4dFVyaTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IGN1cnJlbnRNYWNoaW5lSWRQcm9taXNlOiBQcm9taXNlPHN0cmluZz47XG5cblx0cHJpdmF0ZSBfc3RhdHVzOiBTeW5jU3RhdHVzID0gU3luY1N0YXR1cy5JZGxlO1xuXHRnZXQgc3RhdHVzKCk6IFN5bmNTdGF0dXMgeyByZXR1cm4gdGhpcy5fc3RhdHVzOyB9XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdTdGF0dXM6IEVtaXR0ZXI8U3luY1N0YXR1cz4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxTeW5jU3RhdHVzPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTdGF0dXM6IEV2ZW50PFN5bmNTdGF0dXM+ID0gdGhpcy5fb25EaWRDaGFuZ1N0YXR1cy5ldmVudDtcblxuXHRwcml2YXRlIF9jb25mbGljdHM6IElCYXNlUmVzb3VyY2VQcmV2aWV3W10gPSBbXTtcblx0Z2V0IGNvbmZsaWN0cygpOiBJVXNlckRhdGFTeW5jUmVzb3VyY2VDb25mbGljdHMgeyByZXR1cm4geyAuLi50aGlzLnN5bmNSZXNvdXJjZSwgY29uZmxpY3RzOiB0aGlzLl9jb25mbGljdHMgfTsgfVxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUNvbmZsaWN0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElVc2VyRGF0YVN5bmNSZXNvdXJjZUNvbmZsaWN0cz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29uZmxpY3RzID0gdGhpcy5fb25EaWRDaGFuZ2VDb25mbGljdHMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsb2NhbENoYW5nZVRyaWdnZXJUaHJvdHRsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcjx2b2lkPig1MCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUxvY2FsOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTG9jYWw6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VMb2NhbC5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgbGFzdFN5bmNSZXNvdXJjZTogVVJJO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxhc3RTeW5jVXNlckRhdGFTdGF0ZUtleTogc3RyaW5nO1xuXHRwcml2YXRlIGhhc1N5bmNSZXNvdXJjZVN0YXRlVmVyc2lvbkNoYW5nZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IHN5bmNSZXNvdXJjZUxvZ0xhYmVsOiBzdHJpbmc7XG5cblx0cHJvdGVjdGVkIHN5bmNIZWFkZXJzOiBJSGVhZGVycyA9IHt9O1xuXG5cdHJlYWRvbmx5IHJlc291cmNlOiBTeW5jUmVzb3VyY2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgc3luY1Jlc291cmNlOiBJVXNlckRhdGFTeW5jUmVzb3VyY2UsXG5cdFx0cmVhZG9ubHkgY29sbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmxhc3RTeW5jVXNlckRhdGFTdGF0ZUtleSA9IGAke2NvbGxlY3Rpb24gPyBgJHtjb2xsZWN0aW9ufS5gIDogJyd9JHtzeW5jUmVzb3VyY2Uuc3luY1Jlc291cmNlfS5sYXN0U3luY1VzZXJEYXRhYDtcblx0XHR0aGlzLnJlc291cmNlID0gc3luY1Jlc291cmNlLnN5bmNSZXNvdXJjZTtcblx0XHR0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsID0gZ2V0U3luY1Jlc291cmNlTG9nTGFiZWwoc3luY1Jlc291cmNlLnN5bmNSZXNvdXJjZSwgc3luY1Jlc291cmNlLnByb2ZpbGUpO1xuXHRcdHRoaXMuZXh0VXJpID0gdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaTtcblx0XHR0aGlzLnN5bmNGb2xkZXIgPSB0aGlzLmV4dFVyaS5qb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFTeW5jSG9tZSwgLi4uZ2V0UGF0aFNlZ21lbnRzKHN5bmNSZXNvdXJjZS5wcm9maWxlLmlzRGVmYXVsdCA/IHVuZGVmaW5lZCA6IHN5bmNSZXNvdXJjZS5wcm9maWxlLmlkLCBzeW5jUmVzb3VyY2Uuc3luY1Jlc291cmNlKSk7XG5cdFx0dGhpcy5zeW5jUHJldmlld0ZvbGRlciA9IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY0ZvbGRlciwgUFJFVklFV19ESVJfTkFNRSk7XG5cdFx0dGhpcy5sYXN0U3luY1Jlc291cmNlID0gZ2V0TGFzdFN5bmNSZXNvdXJjZVVyaShzeW5jUmVzb3VyY2UucHJvZmlsZS5pc0RlZmF1bHQgPyB1bmRlZmluZWQgOiBzeW5jUmVzb3VyY2UucHJvZmlsZS5pZCwgc3luY1Jlc291cmNlLnN5bmNSZXNvdXJjZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLmV4dFVyaSk7XG5cdFx0dGhpcy5jdXJyZW50TWFjaGluZUlkUHJvbWlzZSA9IGdldFNlcnZpY2VNYWNoaW5lSWQoZW52aXJvbm1lbnRTZXJ2aWNlLCBmaWxlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHRyaWdnZXJMb2NhbENoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLmxvY2FsQ2hhbmdlVHJpZ2dlclRocm90dGxlci50cmlnZ2VyKCgpID0+IHRoaXMuZG9UcmlnZ2VyTG9jYWxDaGFuZ2UoKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZG9UcmlnZ2VyTG9jYWxDaGFuZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBTeW5jIGFnYWluIGlmIGN1cnJlbnQgc3RhdHVzIGlzIGluIGNvbmZsaWN0c1xuXHRcdGlmICh0aGlzLnN0YXR1cyA9PT0gU3luY1N0YXR1cy5IYXNDb25mbGljdHMpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBJbiBjb25mbGljdHMgc3RhdGUgYW5kIGxvY2FsIGNoYW5nZSBkZXRlY3RlZC4gU3luY2luZyBhZ2Fpbi4uLmApO1xuXHRcdFx0Y29uc3QgcHJldmlldyA9IGF3YWl0IHRoaXMuc3luY1ByZXZpZXdQcm9taXNlITtcblx0XHRcdHRoaXMuc3luY1ByZXZpZXdQcm9taXNlID0gbnVsbDtcblx0XHRcdGNvbnN0IHN0YXR1cyA9IGF3YWl0IHRoaXMucGVyZm9ybVN5bmMocHJldmlldy5yZW1vdGVVc2VyRGF0YSwgcHJldmlldy5sYXN0U3luY1VzZXJEYXRhLCBTeW5jU3RyYXRlZ3kuTWVyZ2UsIHRoaXMuZ2V0VXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbigpKTtcblx0XHRcdHRoaXMuc2V0U3RhdHVzKHN0YXR1cyk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgbG9jYWwgY2hhbmdlIGNhdXNlcyByZW1vdGUgY2hhbmdlXG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IENoZWNraW5nIGZvciBsb2NhbCBjaGFuZ2VzLi4uYCk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGhpcy5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCBoYXNSZW1vdGVDaGFuZ2VkID0gbGFzdFN5bmNVc2VyRGF0YSA/IGF3YWl0IHRoaXMuaGFzUmVtb3RlQ2hhbmdlZChsYXN0U3luY1VzZXJEYXRhKSA6IHRydWU7XG5cdFx0XHRpZiAoaGFzUmVtb3RlQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxvY2FsLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgc2V0U3RhdHVzKHN0YXR1czogU3luY1N0YXR1cyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0dXMgIT09IHN0YXR1cykge1xuXHRcdFx0dGhpcy5fc3RhdHVzID0gc3RhdHVzO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ1N0YXR1cy5maXJlKHN0YXR1cyk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3luYyhyZWZPclVzZXJEYXRhOiBzdHJpbmcgfCBJVXNlckRhdGEgfCBudWxsLCBwcmV2aWV3OiBib29sZWFuID0gZmFsc2UsIHVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb246IElVc2VyRGF0YVN5bmNDb25maWd1cmF0aW9uID0gdGhpcy5nZXRVc2VyRGF0YVN5bmNDb25maWd1cmF0aW9uKCksIGhlYWRlcnM6IElIZWFkZXJzID0ge30pOiBQcm9taXNlPElVc2VyRGF0YVN5bmNSZXNvdXJjZVByZXZpZXcgfCBudWxsPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuc3luY0hlYWRlcnMgPSB7IC4uLmhlYWRlcnMgfTtcblxuXHRcdFx0aWYgKHRoaXMuc3RhdHVzID09PSBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cykge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogU2tpcHBlZCBzeW5jaHJvbml6aW5nICR7dGhpcy5yZXNvdXJjZS50b0xvd2VyQ2FzZSgpfSBhcyB0aGVyZSBhcmUgY29uZmxpY3RzLmApO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zeW5jUHJldmlld1Byb21pc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnN0YXR1cyA9PT0gU3luY1N0YXR1cy5TeW5jaW5nKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBTa2lwcGVkIHN5bmNocm9uaXppbmcgJHt0aGlzLnJlc291cmNlLnRvTG93ZXJDYXNlKCl9IGFzIGl0IGlzIHJ1bm5pbmcgYWxyZWFkeS5gKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc3luY1ByZXZpZXdQcm9taXNlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFN0YXJ0ZWQgc3luY2hyb25pemluZyAke3RoaXMucmVzb3VyY2UudG9Mb3dlckNhc2UoKX0uLi5gKTtcblx0XHRcdHRoaXMuc2V0U3RhdHVzKFN5bmNTdGF0dXMuU3luY2luZyk7XG5cblx0XHRcdGxldCBzdGF0dXM6IFN5bmNTdGF0dXMgPSBTeW5jU3RhdHVzLklkbGU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGhpcy5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGhpcy5nZXRMYXRlc3RSZW1vdGVVc2VyRGF0YShyZWZPclVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhKTtcblx0XHRcdFx0c3RhdHVzID0gYXdhaXQgdGhpcy5wZXJmb3JtU3luYyhyZW1vdGVVc2VyRGF0YSwgbGFzdFN5bmNVc2VyRGF0YSwgcHJldmlldyA/IFN5bmNTdHJhdGVneS5QcmV2aWV3IDogU3luY1N0cmF0ZWd5Lk1lcmdlLCB1c2VyRGF0YVN5bmNDb25maWd1cmF0aW9uKTtcblx0XHRcdFx0aWYgKHN0YXR1cyA9PT0gU3luY1N0YXR1cy5IYXNDb25mbGljdHMpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogRGV0ZWN0ZWQgY29uZmxpY3RzIHdoaWxlIHN5bmNocm9uaXppbmcgJHt0aGlzLnJlc291cmNlLnRvTG93ZXJDYXNlKCl9LmApO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHN0YXR1cyA9PT0gU3luY1N0YXR1cy5JZGxlKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBGaW5pc2hlZCBzeW5jaHJvbml6aW5nICR7dGhpcy5yZXNvdXJjZS50b0xvd2VyQ2FzZSgpfS5gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5zeW5jUHJldmlld1Byb21pc2UgfHwgbnVsbDtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuc2V0U3RhdHVzKHN0YXR1cyk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuc3luY0hlYWRlcnMgPSB7fTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBhcHBseShmb3JjZTogYm9vbGVhbiwgaGVhZGVyczogSUhlYWRlcnMgPSB7fSk6IFByb21pc2U8SVN5bmNSZXNvdXJjZVByZXZpZXcgfCBudWxsPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuc3luY0hlYWRlcnMgPSB7IC4uLmhlYWRlcnMgfTtcblxuXHRcdFx0Y29uc3Qgc3RhdHVzID0gYXdhaXQgdGhpcy5kb0FwcGx5KGZvcmNlKTtcblx0XHRcdHRoaXMuc2V0U3RhdHVzKHN0YXR1cyk7XG5cblx0XHRcdHJldHVybiB0aGlzLnN5bmNQcmV2aWV3UHJvbWlzZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5zeW5jSGVhZGVycyA9IHt9O1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlcGxhY2UoY29udGVudDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgc3luY0RhdGEgPSB0aGlzLnBhcnNlU3luY0RhdGEoY29udGVudCk7XG5cdFx0aWYgKCFzeW5jRGF0YSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuc3RvcCgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogU3RhcnRlZCByZXNldHRpbmcgJHt0aGlzLnJlc291cmNlLnRvTG93ZXJDYXNlKCl9Li4uYCk7XG5cdFx0XHR0aGlzLnNldFN0YXR1cyhTeW5jU3RhdHVzLlN5bmNpbmcpO1xuXHRcdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRoaXMuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0aGlzLmdldExhdGVzdFJlbW90ZVVzZXJEYXRhKG51bGwsIGxhc3RTeW5jVXNlckRhdGEpO1xuXHRcdFx0Y29uc3QgaXNSZW1vdGVEYXRhRnJvbUN1cnJlbnRNYWNoaW5lID0gYXdhaXQgdGhpcy5pc1JlbW90ZURhdGFGcm9tQ3VycmVudE1hY2hpbmUocmVtb3RlVXNlckRhdGEpO1xuXG5cdFx0XHQvKiB1c2UgcmVwbGFjZSBzeW5jIGRhdGEgKi9cblx0XHRcdGNvbnN0IHJlc291cmNlUHJldmlld1Jlc3VsdHMgPSBhd2FpdCB0aGlzLmdlbmVyYXRlU3luY1ByZXZpZXcoeyByZWY6IHJlbW90ZVVzZXJEYXRhLnJlZiwgc3luY0RhdGEgfSwgbGFzdFN5bmNVc2VyRGF0YSwgaXNSZW1vdGVEYXRhRnJvbUN1cnJlbnRNYWNoaW5lLCB0aGlzLmdldFVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24oKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGNvbnN0IHJlc291cmNlUHJldmlld3M6IFtJUmVzb3VyY2VQcmV2aWV3LCBJQWNjZXB0UmVzdWx0XVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlUHJldmlld1Jlc3VsdCBvZiByZXNvdXJjZVByZXZpZXdSZXN1bHRzKSB7XG5cdFx0XHRcdC8qIEFjY2VwdCByZW1vdGUgcmVzb3VyY2UgKi9cblx0XHRcdFx0Y29uc3QgYWNjZXB0UmVzdWx0OiBJQWNjZXB0UmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRBY2NlcHRSZXN1bHQocmVzb3VyY2VQcmV2aWV3UmVzdWx0LCByZXNvdXJjZVByZXZpZXdSZXN1bHQucmVtb3RlUmVzb3VyY2UsIHVuZGVmaW5lZCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdC8qIGNvbXB1dGUgcmVtb3RlIGNoYW5nZSAqL1xuXHRcdFx0XHRjb25zdCB7IHJlbW90ZUNoYW5nZSB9ID0gYXdhaXQgdGhpcy5nZXRBY2NlcHRSZXN1bHQocmVzb3VyY2VQcmV2aWV3UmVzdWx0LCByZXNvdXJjZVByZXZpZXdSZXN1bHQucHJldmlld1Jlc291cmNlLCByZXNvdXJjZVByZXZpZXdSZXN1bHQucmVtb3RlQ29udGVudCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdHJlc291cmNlUHJldmlld3MucHVzaChbcmVzb3VyY2VQcmV2aWV3UmVzdWx0LCB7IC4uLmFjY2VwdFJlc3VsdCwgcmVtb3RlQ2hhbmdlOiByZW1vdGVDaGFuZ2UgIT09IENoYW5nZS5Ob25lID8gcmVtb3RlQ2hhbmdlIDogQ2hhbmdlLk1vZGlmaWVkIH1dKTtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5hcHBseVJlc3VsdChyZW1vdGVVc2VyRGF0YSwgbGFzdFN5bmNVc2VyRGF0YSwgcmVzb3VyY2VQcmV2aWV3cywgZmFsc2UpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IEZpbmlzaGVkIHJlc2V0dGluZyAke3RoaXMucmVzb3VyY2UudG9Mb3dlckNhc2UoKX0uYCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuc2V0U3RhdHVzKFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGlzUmVtb3RlRGF0YUZyb21DdXJyZW50TWFjaGluZShyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgbWFjaGluZUlkID0gYXdhaXQgdGhpcy5jdXJyZW50TWFjaGluZUlkUHJvbWlzZTtcblx0XHRyZXR1cm4gISFyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YT8ubWFjaGluZUlkICYmIHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhLm1hY2hpbmVJZCA9PT0gbWFjaGluZUlkO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldExhdGVzdFJlbW90ZVVzZXJEYXRhKHJlZk9yTGF0ZXN0RGF0YTogc3RyaW5nIHwgSVVzZXJEYXRhIHwgbnVsbCwgbGFzdFN5bmNVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhIHwgbnVsbCk6IFByb21pc2U8SVJlbW90ZVVzZXJEYXRhPiB7XG5cdFx0aWYgKHJlZk9yTGF0ZXN0RGF0YSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHsgcmVmOiBOT05fRVhJU1RJTkdfUkVTT1VSQ0VfUkVGLCBzeW5jRGF0YTogbnVsbCB9O1xuXHRcdH1cblxuXHRcdGlmICghaXNTdHJpbmcocmVmT3JMYXRlc3REYXRhKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudG9SZW1vdGVVc2VyRGF0YShyZWZPckxhdGVzdERhdGEpO1xuXHRcdH1cblxuXHRcdC8vIExhc3QgdGltZSBzeW5jZWQgcmVzb3VyY2UgYW5kIGxhdGVzdCByZXNvdXJjZSBvbiBzZXJ2ZXIgYXJlIHNhbWVcblx0XHRpZiAobGFzdFN5bmNVc2VyRGF0YT8ucmVmID09PSByZWZPckxhdGVzdERhdGEpIHtcblx0XHRcdHJldHVybiBsYXN0U3luY1VzZXJEYXRhO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmdldFJlbW90ZVVzZXJEYXRhKGxhc3RTeW5jVXNlckRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwZXJmb3JtU3luYyhyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCBzdHJhdGVneTogU3luY1N0cmF0ZWd5LCB1c2VyRGF0YVN5bmNDb25maWd1cmF0aW9uOiBJVXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbik6IFByb21pc2U8U3luY1N0YXR1cz4ge1xuXHRcdGlmIChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSAmJiByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YS52ZXJzaW9uID4gdGhpcy52ZXJzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jRXJyb3IobG9jYWxpemUoeyBrZXk6ICdpbmNvbXBhdGlibGUnLCBjb21tZW50OiBbJ1RoaXMgaXMgYW4gZXJyb3Igd2hpbGUgc3luY2luZyBhIHJlc291cmNlIHRoYXQgaXRzIGxvY2FsIHZlcnNpb24gaXMgbm90IGNvbXBhdGlibGUgd2l0aCBpdHMgcmVtb3RlIHZlcnNpb24uJ10gfSwgXCJDYW5ub3Qgc3luYyB7MH0gYXMgaXRzIGxvY2FsIHZlcnNpb24gezF9IGlzIG5vdCBjb21wYXRpYmxlIHdpdGggaXRzIHJlbW90ZSB2ZXJzaW9uIHsyfVwiLCB0aGlzLnJlc291cmNlLCB0aGlzLnZlcnNpb24sIHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhLnZlcnNpb24pLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuSW5jb21wYXRpYmxlTG9jYWxDb250ZW50LCB0aGlzLnJlc291cmNlKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZG9TeW5jKHJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhLCBzdHJhdGVneSwgdXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBVc2VyRGF0YVN5bmNFcnJvcikge1xuXHRcdFx0XHRzd2l0Y2ggKGUuY29kZSkge1xuXG5cdFx0XHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTG9jYWxQcmVjb25kaXRpb25GYWlsZWQ6XG5cdFx0XHRcdFx0XHQvLyBSZWplY3RlZCBhcyB0aGVyZSBpcyBhIG5ldyBsb2NhbCB2ZXJzaW9uLiBTeW5jaW5nIGFnYWluLi4uXG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogRmFpbGVkIHRvIHN5bmNocm9uaXplICR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH0gYXMgdGhlcmUgaXMgYSBuZXcgbG9jYWwgdmVyc2lvbiBhdmFpbGFibGUuIFN5bmNocm9uaXppbmcgYWdhaW4uLi5gKTtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLnBlcmZvcm1TeW5jKHJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhLCBzdHJhdGVneSwgdXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbik7XG5cblx0XHRcdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Db25mbGljdDpcblx0XHRcdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5QcmVjb25kaXRpb25GYWlsZWQ6XG5cdFx0XHRcdFx0XHQvLyBSZWplY3RlZCBhcyB0aGVyZSBpcyBhIG5ldyByZW1vdGUgdmVyc2lvbi4gU3luY2luZyBhZ2Fpbi4uLlxuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IEZhaWxlZCB0byBzeW5jaHJvbml6ZSBhcyB0aGVyZSBpcyBhIG5ldyByZW1vdGUgdmVyc2lvbiBhdmFpbGFibGUuIFN5bmNocm9uaXppbmcgYWdhaW4uLi5gKTtcblxuXHRcdFx0XHRcdFx0Ly8gQXZvaWQgY2FjaGUgYW5kIGdldCBsYXRlc3QgcmVtb3RlIHVzZXIgZGF0YSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy85MDYyNFxuXHRcdFx0XHRcdFx0cmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0aGlzLmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXG5cdFx0XHRcdFx0XHQvLyBHZXQgdGhlIGxhdGVzdCBsYXN0IHN5bmMgdXNlciBkYXRhLiBCZWNhdXNlIG11bHRpcGxlIHBhcmFsbGVsIHN5bmNzIChpbiBXZWIpIGNvdWxkIHNoYXJlIHNhbWUgbGFzdCBzeW5jIGRhdGFcblx0XHRcdFx0XHRcdC8vIGFuZCBvbmUgb2YgdGhlbSBzdWNjZXNzZnVsbHkgdXBkYXRlZCByZW1vdGUgYW5kIGxhc3Qgc3luYyBzdGF0ZS5cblx0XHRcdFx0XHRcdGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0aGlzLmdldExhc3RTeW5jVXNlckRhdGEoKTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMucGVyZm9ybVN5bmMocmVtb3RlVXNlckRhdGEsIGxhc3RTeW5jVXNlckRhdGEsIFN5bmNTdHJhdGVneS5NZXJnZSwgdXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRocm93IGU7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGRvU3luYyhyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCBzdHJhdGVneTogU3luY1N0cmF0ZWd5LCB1c2VyRGF0YVN5bmNDb25maWd1cmF0aW9uOiBJVXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbik6IFByb21pc2U8U3luY1N0YXR1cz4ge1xuXHRcdHRyeSB7XG5cblx0XHRcdGNvbnN0IGlzUmVtb3RlRGF0YUZyb21DdXJyZW50TWFjaGluZSA9IGF3YWl0IHRoaXMuaXNSZW1vdGVEYXRhRnJvbUN1cnJlbnRNYWNoaW5lKHJlbW90ZVVzZXJEYXRhKTtcblx0XHRcdGNvbnN0IGFjY2VwdFJlbW90ZSA9ICFpc1JlbW90ZURhdGFGcm9tQ3VycmVudE1hY2hpbmUgJiYgbGFzdFN5bmNVc2VyRGF0YSA9PT0gbnVsbCAmJiB0aGlzLmdldFN0b3JlZExhc3RTeW5jVXNlckRhdGFTdGF0ZUNvbnRlbnQoKSAhPT0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgbWVyZ2UgPSBzdHJhdGVneSA9PT0gU3luY1N0cmF0ZWd5LlByZXZpZXcgfHwgKHN0cmF0ZWd5ID09PSBTeW5jU3RyYXRlZ3kuTWVyZ2UgJiYgIWFjY2VwdFJlbW90ZSk7XG5cdFx0XHRjb25zdCBhcHBseSA9IHN0cmF0ZWd5ID09PSBTeW5jU3RyYXRlZ3kuTWVyZ2UgfHwgc3RyYXRlZ3kgPT09IFN5bmNTdHJhdGVneS5QdWxsT3JQdXNoO1xuXG5cdFx0XHQvLyBnZW5lcmF0ZSBvciB1c2UgZXhpc3RpbmcgcHJldmlld1xuXHRcdFx0aWYgKCF0aGlzLnN5bmNQcmV2aWV3UHJvbWlzZSkge1xuXHRcdFx0XHR0aGlzLnN5bmNQcmV2aWV3UHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHRoaXMuZG9HZW5lcmF0ZVN5bmNSZXNvdXJjZVByZXZpZXcocmVtb3RlVXNlckRhdGEsIGxhc3RTeW5jVXNlckRhdGEsIGlzUmVtb3RlRGF0YUZyb21DdXJyZW50TWFjaGluZSwgbWVyZ2UsIHVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24sIHRva2VuKSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBwcmV2aWV3ID0gYXdhaXQgdGhpcy5zeW5jUHJldmlld1Byb21pc2U7XG5cblx0XHRcdGlmIChzdHJhdGVneSA9PT0gU3luY1N0cmF0ZWd5Lk1lcmdlICYmIGFjY2VwdFJlbW90ZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogQWNjZXB0aW5nIHJlbW90ZSBiZWNhdXNlIGl0IHdhcyBzeW5jZWQgYmVmb3JlIGFuZCB0aGUgbGFzdCBzeW5jIGRhdGEgaXMgbm90IGF2YWlsYWJsZS5gKTtcblx0XHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZVByZXZpZXcgb2YgcHJldmlldy5yZXNvdXJjZVByZXZpZXdzKSB7XG5cdFx0XHRcdFx0cHJldmlldyA9IChhd2FpdCB0aGlzLmFjY2VwdChyZXNvdXJjZVByZXZpZXcucmVtb3RlUmVzb3VyY2UpKSB8fCBwcmV2aWV3O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGVsc2UgaWYgKHN0cmF0ZWd5ID09PSBTeW5jU3RyYXRlZ3kuUHVsbE9yUHVzaCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlUHJldmlldyBvZiBwcmV2aWV3LnJlc291cmNlUHJldmlld3MpIHtcblx0XHRcdFx0XHRpZiAocmVzb3VyY2VQcmV2aWV3Lm1lcmdlU3RhdGUgPT09IE1lcmdlU3RhdGUuQWNjZXB0ZWQpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocmVtb3RlVXNlckRhdGEucmVmID09PSBsYXN0U3luY1VzZXJEYXRhPy5yZWYgfHwgaXNSZW1vdGVEYXRhRnJvbUN1cnJlbnRNYWNoaW5lKSB7XG5cdFx0XHRcdFx0XHRwcmV2aWV3ID0gKGF3YWl0IHRoaXMuYWNjZXB0KHJlc291cmNlUHJldmlldy5sb2NhbFJlc291cmNlKSkgPz8gcHJldmlldztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cHJldmlldyA9IChhd2FpdCB0aGlzLmFjY2VwdChyZXNvdXJjZVByZXZpZXcucmVtb3RlUmVzb3VyY2UpKSA/PyBwcmV2aWV3O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnVwZGF0ZUNvbmZsaWN0cyhwcmV2aWV3LnJlc291cmNlUHJldmlld3MpO1xuXHRcdFx0aWYgKHByZXZpZXcucmVzb3VyY2VQcmV2aWV3cy5zb21lKCh7IG1lcmdlU3RhdGUgfSkgPT4gbWVyZ2VTdGF0ZSA9PT0gTWVyZ2VTdGF0ZS5Db25mbGljdCkpIHtcblx0XHRcdFx0cmV0dXJuIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYXBwbHkpIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZG9BcHBseShmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBTeW5jU3RhdHVzLlN5bmNpbmc7XG5cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHQvLyByZXNldCBwcmV2aWV3IG9uIGVycm9yXG5cdFx0XHR0aGlzLnN5bmNQcmV2aWV3UHJvbWlzZSA9IG51bGw7XG5cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFjY2VwdChyZXNvdXJjZTogVVJJLCBjb250ZW50Pzogc3RyaW5nIHwgbnVsbCk6IFByb21pc2U8SVN5bmNSZXNvdXJjZVByZXZpZXcgfCBudWxsPiB7XG5cdFx0YXdhaXQgdGhpcy51cGRhdGVTeW5jUmVzb3VyY2VQcmV2aWV3KHJlc291cmNlLCBhc3luYyAocmVzb3VyY2VQcmV2aWV3KSA9PiB7XG5cdFx0XHRjb25zdCBhY2NlcHRSZXN1bHQgPSBhd2FpdCB0aGlzLmdldEFjY2VwdFJlc3VsdChyZXNvdXJjZVByZXZpZXcsIHJlc291cmNlLCBjb250ZW50LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdHJlc291cmNlUHJldmlldy5hY2NlcHRSZXN1bHQgPSBhY2NlcHRSZXN1bHQ7XG5cdFx0XHRyZXNvdXJjZVByZXZpZXcubWVyZ2VTdGF0ZSA9IE1lcmdlU3RhdGUuQWNjZXB0ZWQ7XG5cdFx0XHRyZXNvdXJjZVByZXZpZXcubG9jYWxDaGFuZ2UgPSBhY2NlcHRSZXN1bHQubG9jYWxDaGFuZ2U7XG5cdFx0XHRyZXNvdXJjZVByZXZpZXcucmVtb3RlQ2hhbmdlID0gYWNjZXB0UmVzdWx0LnJlbW90ZUNoYW5nZTtcblx0XHRcdHJldHVybiByZXNvdXJjZVByZXZpZXc7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRoaXMuc3luY1ByZXZpZXdQcm9taXNlO1xuXHR9XG5cblx0YXN5bmMgZGlzY2FyZChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJU3luY1Jlc291cmNlUHJldmlldyB8IG51bGw+IHtcblx0XHRhd2FpdCB0aGlzLnVwZGF0ZVN5bmNSZXNvdXJjZVByZXZpZXcocmVzb3VyY2UsIGFzeW5jIChyZXNvdXJjZVByZXZpZXcpID0+IHtcblx0XHRcdGNvbnN0IG1lcmdlUmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRNZXJnZVJlc3VsdChyZXNvdXJjZVByZXZpZXcsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhtZXJnZVJlc3VsdC5jb250ZW50IHx8ICcnKSk7XG5cdFx0XHRyZXNvdXJjZVByZXZpZXcuYWNjZXB0UmVzdWx0ID0gdW5kZWZpbmVkO1xuXHRcdFx0cmVzb3VyY2VQcmV2aWV3Lm1lcmdlU3RhdGUgPSBNZXJnZVN0YXRlLlByZXZpZXc7XG5cdFx0XHRyZXNvdXJjZVByZXZpZXcubG9jYWxDaGFuZ2UgPSBtZXJnZVJlc3VsdC5sb2NhbENoYW5nZTtcblx0XHRcdHJlc291cmNlUHJldmlldy5yZW1vdGVDaGFuZ2UgPSBtZXJnZVJlc3VsdC5yZW1vdGVDaGFuZ2U7XG5cdFx0XHRyZXR1cm4gcmVzb3VyY2VQcmV2aWV3O1xuXHRcdH0pO1xuXHRcdHJldHVybiB0aGlzLnN5bmNQcmV2aWV3UHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlU3luY1Jlc291cmNlUHJldmlldyhyZXNvdXJjZTogVVJJLCB1cGRhdGVSZXNvdXJjZVByZXZpZXc6IChyZXNvdXJjZVByZXZpZXc6IElFZGl0YWJsZVJlc291cmNlUHJldmlldykgPT4gUHJvbWlzZTxJRWRpdGFibGVSZXNvdXJjZVByZXZpZXc+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnN5bmNQcmV2aWV3UHJvbWlzZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBwcmV2aWV3ID0gYXdhaXQgdGhpcy5zeW5jUHJldmlld1Byb21pc2U7XG5cdFx0Y29uc3QgaW5kZXggPSBwcmV2aWV3LnJlc291cmNlUHJldmlld3MuZmluZEluZGV4KCh7IGxvY2FsUmVzb3VyY2UsIHJlbW90ZVJlc291cmNlLCBwcmV2aWV3UmVzb3VyY2UgfSkgPT5cblx0XHRcdHRoaXMuZXh0VXJpLmlzRXF1YWwobG9jYWxSZXNvdXJjZSwgcmVzb3VyY2UpIHx8IHRoaXMuZXh0VXJpLmlzRXF1YWwocmVtb3RlUmVzb3VyY2UsIHJlc291cmNlKSB8fCB0aGlzLmV4dFVyaS5pc0VxdWFsKHByZXZpZXdSZXNvdXJjZSwgcmVzb3VyY2UpKTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zeW5jUHJldmlld1Byb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyB0b2tlbiA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZVByZXZpZXdzID0gWy4uLnByZXZpZXcucmVzb3VyY2VQcmV2aWV3c107XG5cdFx0XHRyZXNvdXJjZVByZXZpZXdzW2luZGV4XSA9IGF3YWl0IHVwZGF0ZVJlc291cmNlUHJldmlldyhyZXNvdXJjZVByZXZpZXdzW2luZGV4XSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5wcmV2aWV3LFxuXHRcdFx0XHRyZXNvdXJjZVByZXZpZXdzXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0cHJldmlldyA9IGF3YWl0IHRoaXMuc3luY1ByZXZpZXdQcm9taXNlO1xuXHRcdHRoaXMudXBkYXRlQ29uZmxpY3RzKHByZXZpZXcucmVzb3VyY2VQcmV2aWV3cyk7XG5cdFx0aWYgKHByZXZpZXcucmVzb3VyY2VQcmV2aWV3cy5zb21lKCh7IG1lcmdlU3RhdGUgfSkgPT4gbWVyZ2VTdGF0ZSA9PT0gTWVyZ2VTdGF0ZS5Db25mbGljdCkpIHtcblx0XHRcdHRoaXMuc2V0U3RhdHVzKFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZXRTdGF0dXMoU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvQXBwbHkoZm9yY2U6IGJvb2xlYW4pOiBQcm9taXNlPFN5bmNTdGF0dXM+IHtcblx0XHRpZiAoIXRoaXMuc3luY1ByZXZpZXdQcm9taXNlKSB7XG5cdFx0XHRyZXR1cm4gU3luY1N0YXR1cy5JZGxlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpZXcgPSBhd2FpdCB0aGlzLnN5bmNQcmV2aWV3UHJvbWlzZTtcblxuXHRcdC8vIGNoZWNrIGZvciBjb25mbGljdHNcblx0XHRpZiAocHJldmlldy5yZXNvdXJjZVByZXZpZXdzLnNvbWUoKHsgbWVyZ2VTdGF0ZSB9KSA9PiBtZXJnZVN0YXRlID09PSBNZXJnZVN0YXRlLkNvbmZsaWN0KSkge1xuXHRcdFx0cmV0dXJuIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzO1xuXHRcdH1cblxuXHRcdC8vIGNoZWNrIGlmIGFsbCBhcmUgYWNjZXB0ZWRcblx0XHRpZiAocHJldmlldy5yZXNvdXJjZVByZXZpZXdzLnNvbWUoKHsgbWVyZ2VTdGF0ZSB9KSA9PiBtZXJnZVN0YXRlICE9PSBNZXJnZVN0YXRlLkFjY2VwdGVkKSkge1xuXHRcdFx0cmV0dXJuIFN5bmNTdGF0dXMuU3luY2luZztcblx0XHR9XG5cblx0XHQvLyBhcHBseSBwcmV2aWV3XG5cdFx0YXdhaXQgdGhpcy5hcHBseVJlc3VsdChwcmV2aWV3LnJlbW90ZVVzZXJEYXRhLCBwcmV2aWV3Lmxhc3RTeW5jVXNlckRhdGEsIHByZXZpZXcucmVzb3VyY2VQcmV2aWV3cy5tYXAocmVzb3VyY2VQcmV2aWV3ID0+IChbcmVzb3VyY2VQcmV2aWV3LCByZXNvdXJjZVByZXZpZXcuYWNjZXB0UmVzdWx0IV0pKSwgZm9yY2UpO1xuXG5cdFx0Ly8gcmVzZXQgcHJldmlld1xuXHRcdHRoaXMuc3luY1ByZXZpZXdQcm9taXNlID0gbnVsbDtcblxuXHRcdC8vIHJlc2V0IHByZXZpZXcgZm9sZGVyXG5cdFx0YXdhaXQgdGhpcy5jbGVhclByZXZpZXdGb2xkZXIoKTtcblxuXHRcdHJldHVybiBTeW5jU3RhdHVzLklkbGU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNsZWFyUHJldmlld0ZvbGRlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwodGhpcy5zeW5jUHJldmlld0ZvbGRlciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHsgLyogSWdub3JlICovIH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29uZmxpY3RzKHJlc291cmNlUHJldmlld3M6IElFZGl0YWJsZVJlc291cmNlUHJldmlld1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmxpY3RzID0gcmVzb3VyY2VQcmV2aWV3cy5maWx0ZXIoKHsgbWVyZ2VTdGF0ZSB9KSA9PiBtZXJnZVN0YXRlID09PSBNZXJnZVN0YXRlLkNvbmZsaWN0KTtcblx0XHRpZiAoIWVxdWFscyh0aGlzLl9jb25mbGljdHMsIGNvbmZsaWN0cywgKGEsIGIpID0+IHRoaXMuZXh0VXJpLmlzRXF1YWwoYS5wcmV2aWV3UmVzb3VyY2UsIGIucHJldmlld1Jlc291cmNlKSkpIHtcblx0XHRcdHRoaXMuX2NvbmZsaWN0cyA9IGNvbmZsaWN0cztcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29uZmxpY3RzLmZpcmUodGhpcy5jb25mbGljdHMpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGhhc1ByZXZpb3VzbHlTeW5jZWQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgbGFzdFN5bmNEYXRhID0gYXdhaXQgdGhpcy5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0cmV0dXJuICEhbGFzdFN5bmNEYXRhICYmIGxhc3RTeW5jRGF0YS5zeW5jRGF0YSAhPT0gbnVsbCAvKiBgbnVsbGAgc3luYyBkYXRhIGltcGxpZXMgcmVzb3VyY2UgaXMgbm90IHN5bmNlZCAqLztcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyByZXNvbHZlUHJldmlld0NvbnRlbnQodXJpOiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0XHRjb25zdCBzeW5jUHJldmlldyA9IHRoaXMuc3luY1ByZXZpZXdQcm9taXNlID8gYXdhaXQgdGhpcy5zeW5jUHJldmlld1Byb21pc2UgOiBudWxsO1xuXHRcdGlmIChzeW5jUHJldmlldykge1xuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZVByZXZpZXcgb2Ygc3luY1ByZXZpZXcucmVzb3VyY2VQcmV2aWV3cykge1xuXHRcdFx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbChyZXNvdXJjZVByZXZpZXcuYWNjZXB0ZWRSZXNvdXJjZSwgdXJpKSkge1xuXHRcdFx0XHRcdHJldHVybiByZXNvdXJjZVByZXZpZXcuYWNjZXB0UmVzdWx0ID8gcmVzb3VyY2VQcmV2aWV3LmFjY2VwdFJlc3VsdC5jb250ZW50IDogbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbChyZXNvdXJjZVByZXZpZXcucmVtb3RlUmVzb3VyY2UsIHVyaSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwocmVzb3VyY2VQcmV2aWV3LmxvY2FsUmVzb3VyY2UsIHVyaSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzb3VyY2VQcmV2aWV3LmxvY2FsQ29udGVudDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbChyZXNvdXJjZVByZXZpZXcuYmFzZVJlc291cmNlLCB1cmkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc291cmNlUHJldmlldy5iYXNlQ29udGVudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGFzeW5jIHJlc2V0TG9jYWwoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUodGhpcy5sYXN0U3luY1VzZXJEYXRhU3RhdGVLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHRoaXMubGFzdFN5bmNSZXNvdXJjZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0dlbmVyYXRlU3luY1Jlc291cmNlUHJldmlldyhyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCBpc1JlbW90ZURhdGFGcm9tQ3VycmVudE1hY2hpbmU6IGJvb2xlYW4sIG1lcmdlOiBib29sZWFuLCB1c2VyRGF0YVN5bmNDb25maWd1cmF0aW9uOiBJVXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU3luY1Jlc291cmNlUHJldmlldz4ge1xuXHRcdGNvbnN0IHJlc291cmNlUHJldmlld1Jlc3VsdHMgPSBhd2FpdCB0aGlzLmdlbmVyYXRlU3luY1ByZXZpZXcocmVtb3RlVXNlckRhdGEsIGxhc3RTeW5jVXNlckRhdGEsIGlzUmVtb3RlRGF0YUZyb21DdXJyZW50TWFjaGluZSwgdXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbiwgdG9rZW4pO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VQcmV2aWV3czogSUVkaXRhYmxlUmVzb3VyY2VQcmV2aWV3W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlc291cmNlUHJldmlld1Jlc3VsdCBvZiByZXNvdXJjZVByZXZpZXdSZXN1bHRzKSB7XG5cdFx0XHRjb25zdCBhY2NlcHRlZFJlc291cmNlID0gcmVzb3VyY2VQcmV2aWV3UmVzdWx0LnByZXZpZXdSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KTtcblxuXHRcdFx0LyogTm8gY2hhbmdlIC0+IEFjY2VwdCAqL1xuXHRcdFx0aWYgKHJlc291cmNlUHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSA9PT0gQ2hhbmdlLk5vbmUgJiYgcmVzb3VyY2VQcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSA9PT0gQ2hhbmdlLk5vbmUpIHtcblx0XHRcdFx0cmVzb3VyY2VQcmV2aWV3cy5wdXNoKHtcblx0XHRcdFx0XHQuLi5yZXNvdXJjZVByZXZpZXdSZXN1bHQsXG5cdFx0XHRcdFx0YWNjZXB0ZWRSZXNvdXJjZSxcblx0XHRcdFx0XHRhY2NlcHRSZXN1bHQ6IHsgY29udGVudDogbnVsbCwgbG9jYWxDaGFuZ2U6IENoYW5nZS5Ob25lLCByZW1vdGVDaGFuZ2U6IENoYW5nZS5Ob25lIH0sXG5cdFx0XHRcdFx0bWVyZ2VTdGF0ZTogTWVyZ2VTdGF0ZS5BY2NlcHRlZFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0LyogQ2hhbmdlZCAtPiBBcHBseSA/IChNZXJnZSA/IENvbmZsaWN0IHwgQWNjZXB0KSA6IFByZXZpZXcgKi9cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHQvKiBNZXJnZSAqL1xuXHRcdFx0XHRjb25zdCBtZXJnZVJlc3VsdCA9IG1lcmdlID8gYXdhaXQgdGhpcy5nZXRNZXJnZVJlc3VsdChyZXNvdXJjZVByZXZpZXdSZXN1bHQsIHRva2VuKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2VQcmV2aWV3UmVzdWx0LnByZXZpZXdSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhtZXJnZVJlc3VsdD8uY29udGVudCB8fCAnJykpO1xuXG5cdFx0XHRcdC8qIENvbmZsaWN0IHwgQWNjZXB0ICovXG5cdFx0XHRcdGNvbnN0IGFjY2VwdFJlc3VsdCA9IG1lcmdlUmVzdWx0ICYmICFtZXJnZVJlc3VsdC5oYXNDb25mbGljdHNcblx0XHRcdFx0XHQvKiBBY2NlcHQgaWYgbWVyZ2VkIGFuZCB0aGVyZSBhcmUgbm8gY29uZmxpY3RzICovXG5cdFx0XHRcdFx0PyBhd2FpdCB0aGlzLmdldEFjY2VwdFJlc3VsdChyZXNvdXJjZVByZXZpZXdSZXN1bHQsIHJlc291cmNlUHJldmlld1Jlc3VsdC5wcmV2aWV3UmVzb3VyY2UsIHVuZGVmaW5lZCwgdG9rZW4pXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0cmVzb3VyY2VQcmV2aWV3cy5wdXNoKHtcblx0XHRcdFx0XHQuLi5yZXNvdXJjZVByZXZpZXdSZXN1bHQsXG5cdFx0XHRcdFx0YWNjZXB0UmVzdWx0LFxuXHRcdFx0XHRcdG1lcmdlU3RhdGU6IG1lcmdlUmVzdWx0Py5oYXNDb25mbGljdHMgPyBNZXJnZVN0YXRlLkNvbmZsaWN0IDogYWNjZXB0UmVzdWx0ID8gTWVyZ2VTdGF0ZS5BY2NlcHRlZCA6IE1lcmdlU3RhdGUuUHJldmlldyxcblx0XHRcdFx0XHRsb2NhbENoYW5nZTogYWNjZXB0UmVzdWx0ID8gYWNjZXB0UmVzdWx0LmxvY2FsQ2hhbmdlIDogbWVyZ2VSZXN1bHQgPyBtZXJnZVJlc3VsdC5sb2NhbENoYW5nZSA6IHJlc291cmNlUHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0XHRyZW1vdGVDaGFuZ2U6IGFjY2VwdFJlc3VsdCA/IGFjY2VwdFJlc3VsdC5yZW1vdGVDaGFuZ2UgOiBtZXJnZVJlc3VsdCA/IG1lcmdlUmVzdWx0LnJlbW90ZUNoYW5nZSA6IHJlc291cmNlUHJldmlld1Jlc3VsdC5yZW1vdGVDaGFuZ2Vcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgc3luY1Jlc291cmNlOiB0aGlzLnJlc291cmNlLCBwcm9maWxlOiB0aGlzLnN5bmNSZXNvdXJjZS5wcm9maWxlLCByZW1vdGVVc2VyRGF0YSwgbGFzdFN5bmNVc2VyRGF0YSwgcmVzb3VyY2VQcmV2aWV3cywgaXNMYXN0U3luY0Zyb21DdXJyZW50TWFjaGluZTogaXNSZW1vdGVEYXRhRnJvbUN1cnJlbnRNYWNoaW5lIH07XG5cdH1cblxuXHRhc3luYyBnZXRMYXN0U3luY1VzZXJEYXRhKCk6IFByb21pc2U8SVJlbW90ZVVzZXJEYXRhIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHN0b3JlZExhc3RTeW5jVXNlckRhdGFTdGF0ZUNvbnRlbnQgPSB0aGlzLmdldFN0b3JlZExhc3RTeW5jVXNlckRhdGFTdGF0ZUNvbnRlbnQoKTtcblxuXHRcdC8vIExhc3QgU3luYyBEYXRhIHN0YXRlIGRvZXMgbm90IGV4aXN0XG5cdFx0aWYgKCFzdG9yZWRMYXN0U3luY1VzZXJEYXRhU3RhdGVDb250ZW50KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogTGFzdCBzeW5jIGRhdGEgc3RhdGUgZG9lcyBub3QgZXhpc3QuYCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhU3RhdGU6IElMYXN0U3luY1VzZXJEYXRhU3RhdGUgPSBKU09OLnBhcnNlKHN0b3JlZExhc3RTeW5jVXNlckRhdGFTdGF0ZUNvbnRlbnQpO1xuXHRcdGNvbnN0IHJlc291cmNlU3luY1N0YXRlVmVyc2lvbiA9IHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuZ2V0UmVzb3VyY2VTeW5jU3RhdGVWZXJzaW9uKHRoaXMucmVzb3VyY2UpO1xuXHRcdHRoaXMuaGFzU3luY1Jlc291cmNlU3RhdGVWZXJzaW9uQ2hhbmdlZCA9ICEhbGFzdFN5bmNVc2VyRGF0YVN0YXRlLnZlcnNpb24gJiYgISFyZXNvdXJjZVN5bmNTdGF0ZVZlcnNpb24gJiYgbGFzdFN5bmNVc2VyRGF0YVN0YXRlLnZlcnNpb24gIT09IHJlc291cmNlU3luY1N0YXRlVmVyc2lvbjtcblx0XHRpZiAodGhpcy5oYXNTeW5jUmVzb3VyY2VTdGF0ZVZlcnNpb25DaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogUmVzZXQgbGFzdCBzeW5jIHN0YXRlIGJlY2F1c2UgbGFzdCBzeW5jIHN0YXRlIHZlcnNpb24gJHtsYXN0U3luY1VzZXJEYXRhU3RhdGUudmVyc2lvbn0gaXMgbm90IGNvbXBhdGlibGUgd2l0aCBjdXJyZW50IHN5bmMgc3RhdGUgdmVyc2lvbiAke3Jlc291cmNlU3luY1N0YXRlVmVyc2lvbn0uYCk7XG5cdFx0XHRhd2FpdCB0aGlzLnJlc2V0TG9jYWwoKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGxldCBzeW5jRGF0YTogSVN5bmNEYXRhIHwgbnVsbCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIEdldCBMYXN0IFN5bmMgRGF0YSBmcm9tIExvY2FsXG5cdFx0bGV0IHJldHJpYWwgPSAxO1xuXHRcdHdoaWxlIChzeW5jRGF0YSA9PT0gdW5kZWZpbmVkICYmIHJldHJpYWwrKyA8IDYgLyogUmV0cnkgNSB0aW1lcyAqLykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbGFzdFN5bmNTdG9yZWRSZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRoaXMucmVhZExhc3RTeW5jU3RvcmVkUmVtb3RlVXNlckRhdGEoKTtcblx0XHRcdFx0aWYgKGxhc3RTeW5jU3RvcmVkUmVtb3RlVXNlckRhdGEpIHtcblx0XHRcdFx0XHRpZiAobGFzdFN5bmNTdG9yZWRSZW1vdGVVc2VyRGF0YS5yZWYgPT09IGxhc3RTeW5jVXNlckRhdGFTdGF0ZS5yZWYpIHtcblx0XHRcdFx0XHRcdHN5bmNEYXRhID0gbGFzdFN5bmNTdG9yZWRSZW1vdGVVc2VyRGF0YS5zeW5jRGF0YTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IExhc3Qgc3luYyBkYXRhIHN0b3JlZCBsb2NhbGx5IGlzIG5vdCBzYW1lIGFzIHRoZSBsYXN0IHN5bmMgc3RhdGUuYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgRmlsZU9wZXJhdGlvbkVycm9yICYmIGVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogTGFzdCBzeW5jIHJlc291cmNlIGRvZXMgbm90IGV4aXN0IGxvY2FsbHkuYCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZXJyb3IgaW5zdGFuY2VvZiBVc2VyRGF0YVN5bmNFcnJvcikge1xuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIGxvZyBhbmQgcmV0cnlcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IsIHJldHJpYWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gR2V0IExhc3QgU3luYyBEYXRhIGZyb20gUmVtb3RlXG5cdFx0aWYgKHN5bmNEYXRhID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5yZXNvbHZlUmVzb3VyY2VDb250ZW50KHRoaXMucmVzb3VyY2UsIGxhc3RTeW5jVXNlckRhdGFTdGF0ZS5yZWYsIHRoaXMuY29sbGVjdGlvbiwgdGhpcy5zeW5jSGVhZGVycyk7XG5cdFx0XHRcdHN5bmNEYXRhID0gY29udGVudCA9PT0gbnVsbCA/IG51bGwgOiB0aGlzLnBhcnNlU3luY0RhdGEoY29udGVudCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMud3JpdGVMYXN0U3luY1N0b3JlZFJlbW90ZVVzZXJEYXRhKHsgcmVmOiBsYXN0U3luY1VzZXJEYXRhU3RhdGUucmVmLCBzeW5jRGF0YSB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY0Vycm9yICYmIGVycm9yLmNvZGUgPT09IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ob3RGb3VuZCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBMYXN0IHN5bmMgcmVzb3VyY2UgZG9lcyBub3QgZXhpc3QgcmVtb3RlbHkuYCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBMYXN0IFN5bmMgRGF0YSBOb3QgRm91bmRcblx0XHRpZiAoc3luY0RhdGEgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmxhc3RTeW5jVXNlckRhdGFTdGF0ZSxcblx0XHRcdHN5bmNEYXRhLFxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgdXBkYXRlTGFzdFN5bmNVc2VyRGF0YShsYXN0U3luY1JlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEsIGFkZGl0aW9uYWxQcm9wczogSVN0cmluZ0RpY3Rpb25hcnk8YW55PiA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGFkZGl0aW9uYWxQcm9wc1sncmVmJ10gfHwgYWRkaXRpb25hbFByb3BzWyd2ZXJzaW9uJ10pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IGhhdmUgY29yZSBwcm9wZXJ0aWVzIGFzIGFkZGl0aW9uYWwnKTtcblx0XHR9XG5cblx0XHRjb25zdCB2ZXJzaW9uID0gdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5nZXRSZXNvdXJjZVN5bmNTdGF0ZVZlcnNpb24odGhpcy5yZXNvdXJjZSk7XG5cdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YVN0YXRlOiBJTGFzdFN5bmNVc2VyRGF0YVN0YXRlID0ge1xuXHRcdFx0cmVmOiBsYXN0U3luY1JlbW90ZVVzZXJEYXRhLnJlZixcblx0XHRcdHZlcnNpb24sXG5cdFx0XHQuLi5hZGRpdGlvbmFsUHJvcHNcblx0XHR9O1xuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSh0aGlzLmxhc3RTeW5jVXNlckRhdGFTdGF0ZUtleSwgSlNPTi5zdHJpbmdpZnkobGFzdFN5bmNVc2VyRGF0YVN0YXRlKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdGF3YWl0IHRoaXMud3JpdGVMYXN0U3luY1N0b3JlZFJlbW90ZVVzZXJEYXRhKGxhc3RTeW5jUmVtb3RlVXNlckRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdG9yZWRMYXN0U3luY1VzZXJEYXRhU3RhdGVDb250ZW50KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMubGFzdFN5bmNVc2VyRGF0YVN0YXRlS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWFkTGFzdFN5bmNTdG9yZWRSZW1vdGVVc2VyRGF0YSgpOiBQcm9taXNlPElSZW1vdGVVc2VyRGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLmxhc3RTeW5jUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBsYXN0U3luY1N0b3JlZFJlbW90ZVVzZXJEYXRhID0gY29udGVudCA/IEpTT04ucGFyc2UoY29udGVudCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaXNSZW1vdGVVc2VyRGF0YShsYXN0U3luY1N0b3JlZFJlbW90ZVVzZXJEYXRhKSkge1xuXHRcdFx0XHRyZXR1cm4gbGFzdFN5bmNTdG9yZWRSZW1vdGVVc2VyRGF0YTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdyaXRlTGFzdFN5bmNTdG9yZWRSZW1vdGVVc2VyRGF0YShsYXN0U3luY1JlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0aGlzLmxhc3RTeW5jUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkobGFzdFN5bmNSZW1vdGVVc2VyRGF0YSkpKTtcblx0fVxuXG5cdGFzeW5jIGdldFJlbW90ZVVzZXJEYXRhKGxhc3RTeW5jRGF0YTogSVJlbW90ZVVzZXJEYXRhIHwgbnVsbCk6IFByb21pc2U8SVJlbW90ZVVzZXJEYXRhPiB7XG5cdFx0Y29uc3QgdXNlckRhdGEgPSBhd2FpdCB0aGlzLmdldFVzZXJEYXRhKGxhc3RTeW5jRGF0YSk7XG5cdFx0cmV0dXJuIHRoaXMudG9SZW1vdGVVc2VyRGF0YSh1c2VyRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIHRvUmVtb3RlVXNlckRhdGEoeyByZWYsIGNvbnRlbnQgfTogSVVzZXJEYXRhKTogSVJlbW90ZVVzZXJEYXRhIHtcblx0XHRsZXQgc3luY0RhdGE6IElTeW5jRGF0YSB8IG51bGwgPSBudWxsO1xuXHRcdGlmIChjb250ZW50ICE9PSBudWxsKSB7XG5cdFx0XHRzeW5jRGF0YSA9IHRoaXMucGFyc2VTeW5jRGF0YShjb250ZW50KTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgcmVmLCBzeW5jRGF0YSB9O1xuXHR9XG5cblx0cHJvdGVjdGVkIHBhcnNlU3luY0RhdGEoY29udGVudDogc3RyaW5nKTogSVN5bmNEYXRhIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3luY0RhdGE6IElTeW5jRGF0YSA9IEpTT04ucGFyc2UoY29udGVudCk7XG5cdFx0XHRpZiAoaXNTeW5jRGF0YShzeW5jRGF0YSkpIHtcblx0XHRcdFx0cmV0dXJuIHN5bmNEYXRhO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jRXJyb3IobG9jYWxpemUoJ2luY29tcGF0aWJsZSBzeW5jIGRhdGEnLCBcIkNhbm5vdCBwYXJzZSBzeW5jIGRhdGEgYXMgaXQgaXMgbm90IGNvbXBhdGlibGUgd2l0aCB0aGUgY3VycmVudCB2ZXJzaW9uLlwiKSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkluY29tcGF0aWJsZVJlbW90ZUNvbnRlbnQsIHRoaXMucmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRVc2VyRGF0YShsYXN0U3luY0RhdGE6IElSZW1vdGVVc2VyRGF0YSB8IG51bGwpOiBQcm9taXNlPElVc2VyRGF0YT4ge1xuXHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGE6IElVc2VyRGF0YSB8IG51bGwgPSBsYXN0U3luY0RhdGEgPyB7IHJlZjogbGFzdFN5bmNEYXRhLnJlZiwgY29udGVudDogbGFzdFN5bmNEYXRhLnN5bmNEYXRhID8gSlNPTi5zdHJpbmdpZnkobGFzdFN5bmNEYXRhLnN5bmNEYXRhKSA6IG51bGwgfSA6IG51bGw7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLnJlYWRSZXNvdXJjZSh0aGlzLnJlc291cmNlLCBsYXN0U3luY1VzZXJEYXRhLCB0aGlzLmNvbGxlY3Rpb24sIHRoaXMuc3luY0hlYWRlcnMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHVwZGF0ZVJlbW90ZVVzZXJEYXRhKGNvbnRlbnQ6IHN0cmluZywgcmVmOiBzdHJpbmcgfCBudWxsKTogUHJvbWlzZTxJUmVtb3RlVXNlckRhdGE+IHtcblx0XHRjb25zdCBtYWNoaW5lSWQgPSBhd2FpdCB0aGlzLmN1cnJlbnRNYWNoaW5lSWRQcm9taXNlO1xuXHRcdGNvbnN0IHN5bmNEYXRhOiBJU3luY0RhdGEgPSB7IHZlcnNpb246IHRoaXMudmVyc2lvbiwgbWFjaGluZUlkLCBjb250ZW50IH07XG5cdFx0dHJ5IHtcblx0XHRcdHJlZiA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLndyaXRlUmVzb3VyY2UodGhpcy5yZXNvdXJjZSwgSlNPTi5zdHJpbmdpZnkoc3luY0RhdGEpLCByZWYsIHRoaXMuY29sbGVjdGlvbiwgdGhpcy5zeW5jSGVhZGVycyk7XG5cdFx0XHRyZXR1cm4geyByZWYsIHN5bmNEYXRhIH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY0Vycm9yICYmIGVycm9yLmNvZGUgPT09IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ub29MYXJnZSkge1xuXHRcdFx0XHRlcnJvciA9IG5ldyBVc2VyRGF0YVN5bmNFcnJvcihlcnJvci5tZXNzYWdlLCBlcnJvci5jb2RlLCB0aGlzLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBiYWNrdXBMb2NhbChjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzeW5jRGF0YTogSVN5bmNEYXRhID0geyB2ZXJzaW9uOiB0aGlzLnZlcnNpb24sIGNvbnRlbnQgfTtcblx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZS53cml0ZVJlc291cmNlKHRoaXMucmVzb3VyY2UsIEpTT04uc3RyaW5naWZ5KHN5bmNEYXRhKSwgbmV3IERhdGUoKSwgdGhpcy5zeW5jUmVzb3VyY2UucHJvZmlsZS5pc0RlZmF1bHQgPyB1bmRlZmluZWQgOiB0aGlzLnN5bmNSZXNvdXJjZS5wcm9maWxlLmlkKTtcblx0fVxuXG5cdGFzeW5jIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuc3RhdHVzID09PSBTeW5jU3RhdHVzLklkbGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFN0b3BwaW5nIHN5bmNocm9uaXppbmcgJHt0aGlzLnJlc291cmNlLnRvTG93ZXJDYXNlKCl9LmApO1xuXHRcdGlmICh0aGlzLnN5bmNQcmV2aWV3UHJvbWlzZSkge1xuXHRcdFx0dGhpcy5zeW5jUHJldmlld1Byb21pc2UuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLnN5bmNQcmV2aWV3UHJvbWlzZSA9IG51bGw7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVDb25mbGljdHMoW10pO1xuXHRcdGF3YWl0IHRoaXMuY2xlYXJQcmV2aWV3Rm9sZGVyKCk7XG5cblx0XHR0aGlzLnNldFN0YXR1cyhTeW5jU3RhdHVzLklkbGUpO1xuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBTdG9wcGVkIHN5bmNocm9uaXppbmcgJHt0aGlzLnJlc291cmNlLnRvTG93ZXJDYXNlKCl9LmApO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRVc2VyRGF0YVN5bmNDb25maWd1cmF0aW9uKCk6IElVc2VyRGF0YVN5bmNDb25maWd1cmF0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShVU0VSX0RBVEFfU1lOQ19DT05GSUdVUkFUSU9OX1NDT1BFKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCByZWFkb25seSB2ZXJzaW9uOiBudW1iZXI7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZW5lcmF0ZVN5bmNQcmV2aWV3KHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEsIGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSB8IG51bGwsIGlzUmVtb3RlRGF0YUZyb21DdXJyZW50TWFjaGluZTogYm9vbGVhbiwgdXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbjogSVVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVJlc291cmNlUHJldmlld1tdPjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldE1lcmdlUmVzdWx0KHJlc291cmNlUHJldmlldzogSVJlc291cmNlUHJldmlldywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWVyZ2VSZXN1bHQ+O1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0QWNjZXB0UmVzdWx0KHJlc291cmNlUHJldmlldzogSVJlc291cmNlUHJldmlldywgcmVzb3VyY2U6IFVSSSwgY29udGVudDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWNjZXB0UmVzdWx0Pjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGFwcGx5UmVzdWx0KHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEsIGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSB8IG51bGwsIHJlc3VsdDogW0lSZXNvdXJjZVByZXZpZXcsIElBY2NlcHRSZXN1bHRdW10sIGZvcmNlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGhhc1JlbW90ZUNoYW5nZWQobGFzdFN5bmNVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhKTogUHJvbWlzZTxib29sZWFuPjtcblxuXHRhYnN0cmFjdCBoYXNMb2NhbERhdGEoKTogUHJvbWlzZTxib29sZWFuPjtcblx0YWJzdHJhY3QgcmVzb2x2ZUNvbnRlbnQodXJpOiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlUmVzb3VyY2VQcmV2aWV3IGV4dGVuZHMgSVJlc291cmNlUHJldmlldyB7XG5cdHJlYWRvbmx5IGZpbGVDb250ZW50OiBJRmlsZUNvbnRlbnQgfCBudWxsO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RGaWxlU3luY2hyb25pc2VyIGV4dGVuZHMgQWJzdHJhY3RTeW5jaHJvbmlzZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBmaWxlOiBVUkksXG5cdFx0c3luY1Jlc291cmNlOiBJVXNlckRhdGFTeW5jUmVzb3VyY2UsXG5cdFx0Y29sbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlIHVzZXJEYXRhU3luY1N0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlIHVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgbG9nU2VydmljZTogSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoc3luY1Jlc291cmNlLCBjb2xsZWN0aW9uLCBmaWxlU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgdXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLCB1c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSwgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGxvZ1NlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2godGhpcy5leHRVcmkuZGlybmFtZShmaWxlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHRoaXMub25GaWxlQ2hhbmdlcyhlKSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldExvY2FsRmlsZUNvbnRlbnQoKTogUHJvbWlzZTxJRmlsZUNvbnRlbnQgfCBudWxsPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRoaXMuZmlsZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyB1cGRhdGVMb2NhbEZpbGVDb250ZW50KG5ld0NvbnRlbnQ6IHN0cmluZywgb2xkQ29udGVudDogSUZpbGVDb250ZW50IHwgbnVsbCwgZm9yY2U6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKG9sZENvbnRlbnQpIHtcblx0XHRcdFx0Ly8gZmlsZSBleGlzdHMgYWxyZWFkeVxuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0aGlzLmZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCksIGZvcmNlID8gdW5kZWZpbmVkIDogb2xkQ29udGVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBmaWxlIGRvZXMgbm90IGV4aXN0XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlRmlsZSh0aGlzLmZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCksIHsgb3ZlcndyaXRlOiBmb3JjZSB9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoKGUgaW5zdGFuY2VvZiBGaWxlT3BlcmF0aW9uRXJyb3IgJiYgZS5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB8fFxuXHRcdFx0XHQoZSBpbnN0YW5jZW9mIEZpbGVPcGVyYXRpb25FcnJvciAmJiBlLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT0RJRklFRF9TSU5DRSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY0Vycm9yKGUubWVzc2FnZSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkxvY2FsUHJlY29uZGl0aW9uRmFpbGVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IGU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGRlbGV0ZUxvY2FsRmlsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwodGhpcy5maWxlKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoIShlIGluc3RhbmNlb2YgRmlsZU9wZXJhdGlvbkVycm9yICYmIGUuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkpIHtcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRmlsZUNoYW5nZXMoZTogRmlsZUNoYW5nZXNFdmVudCk6IHZvaWQge1xuXHRcdGlmICghZS5jb250YWlucyh0aGlzLmZpbGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMudHJpZ2dlckxvY2FsQ2hhbmdlKCk7XG5cdH1cblxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RKc29uRmlsZVN5bmNocm9uaXNlciBleHRlbmRzIEFic3RyYWN0RmlsZVN5bmNocm9uaXNlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZmlsZTogVVJJLFxuXHRcdHN5bmNSZXNvdXJjZTogSVVzZXJEYXRhU3luY1Jlc291cmNlLFxuXHRcdGNvbGxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jVXRpbFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlOiBJVXNlckRhdGFTeW5jVXRpbFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZmlsZSwgc3luY1Jlc291cmNlLCBjb2xsZWN0aW9uLCBmaWxlU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgdXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLCB1c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSwgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGxvZ1NlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGhhc0Vycm9ycyhjb250ZW50OiBzdHJpbmcsIGlzQXJyYXk6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRjb25zdCBwYXJzZUVycm9yczogUGFyc2VFcnJvcltdID0gW107XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2UoY29udGVudCwgcGFyc2VFcnJvcnMsIHsgYWxsb3dFbXB0eUNvbnRlbnQ6IHRydWUsIGFsbG93VHJhaWxpbmdDb21tYTogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gcGFyc2VFcnJvcnMubGVuZ3RoID4gMCB8fCAoIWlzVW5kZWZpbmVkKHJlc3VsdCkgJiYgaXNBcnJheSAhPT0gQXJyYXkuaXNBcnJheShyZXN1bHQpKTtcblx0fVxuXG5cdHByaXZhdGUgX2Zvcm1hdHRpbmdPcHRpb25zOiBQcm9taXNlPEZvcm1hdHRpbmdPcHRpb25zPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIGdldEZvcm1hdHRpbmdPcHRpb25zKCk6IFByb21pc2U8Rm9ybWF0dGluZ09wdGlvbnM+IHtcblx0XHRpZiAoIXRoaXMuX2Zvcm1hdHRpbmdPcHRpb25zKSB7XG5cdFx0XHR0aGlzLl9mb3JtYXR0aW5nT3B0aW9ucyA9IHRoaXMudXNlckRhdGFTeW5jVXRpbFNlcnZpY2UucmVzb2x2ZUZvcm1hdHRpbmdPcHRpb25zKHRoaXMuZmlsZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9mb3JtYXR0aW5nT3B0aW9ucztcblx0fVxuXG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdEluaXRpYWxpemVyIGltcGxlbWVudHMgSVVzZXJEYXRhU3luY1Jlc291cmNlSW5pdGlhbGl6ZXIge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBleHRVcmk6IElFeHRVcmk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGFzdFN5bmNSZXNvdXJjZTogVVJJO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHJlc291cmNlOiBTeW5jUmVzb3VyY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5leHRVcmkgPSB1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpO1xuXHRcdHRoaXMubGFzdFN5bmNSZXNvdXJjZSA9IGdldExhc3RTeW5jUmVzb3VyY2VVcmkodW5kZWZpbmVkLCB0aGlzLnJlc291cmNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMuZXh0VXJpKTtcblx0fVxuXG5cdGFzeW5jIGluaXRpYWxpemUoeyByZWYsIGNvbnRlbnQgfTogSVVzZXJEYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFjb250ZW50KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnUmVtb3RlIGNvbnRlbnQgZG9lcyBub3QgZXhpc3QuJywgdGhpcy5yZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3luY0RhdGEgPSB0aGlzLnBhcnNlU3luY0RhdGEoY29udGVudCk7XG5cdFx0aWYgKCFzeW5jRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvSW5pdGlhbGl6ZSh7IHJlZiwgc3luY0RhdGEgfSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZVN5bmNEYXRhKGNvbnRlbnQ6IHN0cmluZyk6IElTeW5jRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN5bmNEYXRhOiBJU3luY0RhdGEgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdFx0aWYgKGlzU3luY0RhdGEoc3luY0RhdGEpKSB7XG5cdFx0XHRcdHJldHVybiBzeW5jRGF0YTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0Nhbm5vdCBwYXJzZSBzeW5jIGRhdGEgYXMgaXQgaXMgbm90IGNvbXBhdGlibGUgd2l0aCB0aGUgY3VycmVudCB2ZXJzaW9uLicsIHRoaXMucmVzb3VyY2UpO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgdXBkYXRlTGFzdFN5bmNVc2VyRGF0YShsYXN0U3luY1JlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEsIGFkZGl0aW9uYWxQcm9wczogSVN0cmluZ0RpY3Rpb25hcnk8YW55PiA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGFkZGl0aW9uYWxQcm9wc1sncmVmJ10gfHwgYWRkaXRpb25hbFByb3BzWyd2ZXJzaW9uJ10pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IGhhdmUgY29yZSBwcm9wZXJ0aWVzIGFzIGFkZGl0aW9uYWwnKTtcblx0XHR9XG5cblx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhU3RhdGU6IElMYXN0U3luY1VzZXJEYXRhU3RhdGUgPSB7XG5cdFx0XHRyZWY6IGxhc3RTeW5jUmVtb3RlVXNlckRhdGEucmVmLFxuXHRcdFx0dmVyc2lvbjogdW5kZWZpbmVkLFxuXHRcdFx0Li4uYWRkaXRpb25hbFByb3BzXG5cdFx0fTtcblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoYCR7dGhpcy5yZXNvdXJjZX0ubGFzdFN5bmNVc2VyRGF0YWAsIEpTT04uc3RyaW5naWZ5KGxhc3RTeW5jVXNlckRhdGFTdGF0ZSksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0aGlzLmxhc3RTeW5jUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkobGFzdFN5bmNSZW1vdGVVc2VyRGF0YSkpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBkb0luaXRpYWxpemUocmVtb3RlVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSk6IFByb21pc2U8dm9pZD47XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxjQUFjO0FBQ3ZCLFNBQTRCLHlCQUF5Qix3QkFBd0I7QUFDN0UsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGFBQXlCO0FBRWxDLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsVUFBVSxtQkFBbUI7QUFHdEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FB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
