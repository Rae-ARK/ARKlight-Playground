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
import { createCancelablePromise, disposableTimeout, ThrottledDelayer, timeout } from "../../../base/common/async.js";
import { toLocalISOString } from "../../../base/common/date.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { isWeb } from "../../../base/common/platform.js";
import { isEqual } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IMeteredConnectionService } from "../../meteredConnection/common/meteredConnection.js";
import { IProductService } from "../../product/common/productService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, UserDataAutoSyncError, UserDataSyncError, UserDataSyncErrorCode } from "./userDataSync.js";
import { IUserDataSyncAccountService } from "./userDataSyncAccount.js";
import { IUserDataSyncMachinesService } from "./userDataSyncMachines.js";
const disableMachineEventuallyKey = "sync.disableMachineEventually";
const sessionIdKey = "sync.sessionId";
const storeUrlKey = "sync.storeUrl";
const productQualityKey = "sync.productQuality";
let UserDataAutoSyncService = class extends Disposable {
  constructor(productService, userDataSyncStoreManagementService, userDataSyncStoreService, userDataSyncEnablementService, userDataSyncService, logService, userDataSyncAccountService, telemetryService, userDataSyncMachinesService, storageService, meteredConnectionService) {
    super();
    this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
    this.userDataSyncStoreService = userDataSyncStoreService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.userDataSyncService = userDataSyncService;
    this.logService = logService;
    this.userDataSyncAccountService = userDataSyncAccountService;
    this.telemetryService = telemetryService;
    this.userDataSyncMachinesService = userDataSyncMachinesService;
    this.storageService = storageService;
    this.meteredConnectionService = meteredConnectionService;
    this.autoSync = this._register(new MutableDisposable());
    this.successiveFailures = 0;
    this.lastSyncTriggerTime = void 0;
    this.suspendUntilRestart = false;
    this._onError = this._register(new Emitter());
    this.onError = this._onError.event;
    this.sources = [];
    this.syncTriggerDelayer = this._register(new ThrottledDelayer(this.getSyncTriggerDelayTime()));
    this.lastSyncUrl = this.syncUrl;
    this.syncUrl = userDataSyncStoreManagementService.userDataSyncStore?.url;
    this.previousProductQuality = this.productQuality;
    this.productQuality = productService.quality;
    if (this.syncUrl) {
      this.logService.info("[AutoSync] Using settings sync service", this.syncUrl.toString());
      this._register(userDataSyncStoreManagementService.onDidChangeUserDataSyncStore(() => {
        if (!isEqual(this.syncUrl, userDataSyncStoreManagementService.userDataSyncStore?.url)) {
          this.lastSyncUrl = this.syncUrl;
          this.syncUrl = userDataSyncStoreManagementService.userDataSyncStore?.url;
          if (this.syncUrl) {
            this.logService.info("[AutoSync] Using settings sync service", this.syncUrl.toString());
          }
        }
      }));
      if (this.userDataSyncEnablementService.isEnabled()) {
        this.logService.info("[AutoSync] Enabled.");
      } else {
        this.logService.info("[AutoSync] Disabled.");
      }
      this.updateAutoSync();
      if (this.hasToDisableMachineEventually()) {
        this.disableMachineEventually();
      }
      this._register(userDataSyncAccountService.onDidChangeAccount(() => this.updateAutoSync()));
      this._register(userDataSyncStoreService.onDidChangeDonotMakeRequestsUntil(() => this.updateAutoSync()));
      this._register(userDataSyncService.onDidChangeLocal((source) => this.triggerSync([source])));
      this._register(Event.filter(this.userDataSyncEnablementService.onDidChangeResourceEnablement, ([, enabled]) => enabled)(() => this.triggerSync(["resourceEnablement"])));
      this._register(this.userDataSyncStoreManagementService.onDidChangeUserDataSyncStore(() => this.triggerSync(["userDataSyncStoreChanged"])));
      this._register(meteredConnectionService.onDidChangeIsConnectionMetered(() => this.updateAutoSync()));
    }
  }
  get syncUrl() {
    const value = this.storageService.get(storeUrlKey, StorageScope.APPLICATION);
    return value ? URI.parse(value) : void 0;
  }
  set syncUrl(syncUrl) {
    if (syncUrl) {
      this.storageService.store(storeUrlKey, syncUrl.toString(), StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(storeUrlKey, StorageScope.APPLICATION);
    }
  }
  get productQuality() {
    return this.storageService.get(productQualityKey, StorageScope.APPLICATION);
  }
  set productQuality(productQuality) {
    if (productQuality) {
      this.storageService.store(productQualityKey, productQuality, StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(productQualityKey, StorageScope.APPLICATION);
    }
  }
  updateAutoSync() {
    const { enabled, message } = this.isAutoSyncEnabled();
    if (enabled) {
      if (this.autoSync.value === void 0) {
        this.autoSync.value = new AutoSync(this.lastSyncUrl, 1e3 * 60 * 5, this.userDataSyncStoreManagementService, this.userDataSyncStoreService, this.userDataSyncService, this.userDataSyncMachinesService, this.logService, this.telemetryService, this.storageService);
        this.autoSync.value.register(this.autoSync.value.onDidStartSync(() => this.lastSyncTriggerTime = (/* @__PURE__ */ new Date()).getTime()));
        this.autoSync.value.register(this.autoSync.value.onDidFinishSync((e) => this.onDidFinishSync(e)));
        if (this.startAutoSync()) {
          this.autoSync.value.start();
        }
      }
    } else {
      this.syncTriggerDelayer.cancel();
      if (this.autoSync.value !== void 0) {
        if (message) {
          this.logService.info(message);
        }
        this.autoSync.clear();
      } else if (message && this.userDataSyncEnablementService.isEnabled()) {
        this.logService.info(message);
      }
    }
  }
  // For tests purpose only
  startAutoSync() {
    return true;
  }
  isAutoSyncEnabled() {
    if (!this.userDataSyncEnablementService.isEnabled()) {
      return { enabled: false, message: "[AutoSync] Disabled." };
    }
    if (!this.userDataSyncAccountService.account) {
      return { enabled: false, message: "[AutoSync] Suspended until auth token is available." };
    }
    if (this.userDataSyncStoreService.donotMakeRequestsUntil) {
      return { enabled: false, message: `[AutoSync] Suspended until ${toLocalISOString(this.userDataSyncStoreService.donotMakeRequestsUntil)} because server is not accepting requests until then.` };
    }
    if (this.suspendUntilRestart) {
      return { enabled: false, message: "[AutoSync] Suspended until restart." };
    }
    if (this.meteredConnectionService.isConnectionMetered) {
      return { enabled: false, message: "[AutoSync] Suspended because connection is metered." };
    }
    return { enabled: true };
  }
  async turnOn() {
    this.stopDisableMachineEventually();
    this.lastSyncUrl = this.syncUrl;
    this.updateEnablement(true);
  }
  async turnOff(everywhere, softTurnOffOnError, donotRemoveMachine) {
    try {
      if (this.userDataSyncAccountService.account && !donotRemoveMachine) {
        await this.userDataSyncMachinesService.removeCurrentMachine();
      }
      this.updateEnablement(false);
      this.storageService.remove(sessionIdKey, StorageScope.APPLICATION);
      if (everywhere) {
        await this.userDataSyncService.reset();
      } else {
        await this.userDataSyncService.resetLocal();
      }
    } catch (error) {
      this.logService.error(error);
      if (softTurnOffOnError) {
        this.updateEnablement(false);
      } else {
        throw error;
      }
    }
  }
  updateEnablement(enabled) {
    if (this.userDataSyncEnablementService.isEnabled() !== enabled) {
      this.userDataSyncEnablementService.setEnablement(enabled);
      this.updateAutoSync();
    }
  }
  hasProductQualityChanged() {
    return !!this.previousProductQuality && !!this.productQuality && this.previousProductQuality !== this.productQuality;
  }
  async onDidFinishSync(error) {
    this.logService.debug("[AutoSync] Sync Finished");
    if (!error) {
      this.successiveFailures = 0;
      return;
    }
    const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);
    if (userDataSyncError.code === UserDataSyncErrorCode.SessionExpired) {
      await this.turnOff(
        false,
        true
        /* force soft turnoff on error */
      );
      this.logService.info("[AutoSync] Turned off sync because current session is expired");
    } else if (userDataSyncError.code === UserDataSyncErrorCode.TurnedOff) {
      await this.turnOff(
        false,
        true
        /* force soft turnoff on error */
      );
      this.logService.info("[AutoSync] Turned off sync because sync is turned off in the cloud");
    } else if (userDataSyncError.code === UserDataSyncErrorCode.LocalTooManyRequests) {
      this.suspendUntilRestart = true;
      this.logService.info("[AutoSync] Suspended sync because of making too many requests to server");
      this.updateAutoSync();
    } else if (userDataSyncError.code === UserDataSyncErrorCode.TooManyRequests) {
      await this.turnOff(
        false,
        true,
        true
        /* do not disable machine because disabling a machine makes request to server and can fail with TooManyRequests */
      );
      this.disableMachineEventually();
      this.logService.info("[AutoSync] Turned off sync because of making too many requests to server");
    } else if (userDataSyncError.code === UserDataSyncErrorCode.MethodNotFound) {
      await this.turnOff(
        false,
        true
        /* force soft turnoff on error */
      );
      this.logService.info("[AutoSync] Turned off sync because current client is making requests to server that are not supported");
    } else if (userDataSyncError.code === UserDataSyncErrorCode.UpgradeRequired || userDataSyncError.code === UserDataSyncErrorCode.Gone) {
      await this.turnOff(
        false,
        true,
        true
        /* do not disable machine because disabling a machine makes request to server and can fail with upgrade required or gone */
      );
      this.disableMachineEventually();
      this.logService.info("[AutoSync] Turned off sync because current client is not compatible with server. Requires client upgrade.");
    } else if (userDataSyncError.code === UserDataSyncErrorCode.IncompatibleLocalContent) {
      await this.turnOff(
        false,
        true
        /* force soft turnoff on error */
      );
      this.logService.info(`[AutoSync] Turned off sync because server has ${userDataSyncError.resource} content with newer version than of client. Requires client upgrade.`);
    } else if (userDataSyncError.code === UserDataSyncErrorCode.IncompatibleRemoteContent) {
      await this.turnOff(
        false,
        true
        /* force soft turnoff on error */
      );
      this.logService.info(`[AutoSync] Turned off sync because server has ${userDataSyncError.resource} content with older version than of client. Requires server reset.`);
    } else if (userDataSyncError.code === UserDataSyncErrorCode.ServiceChanged || userDataSyncError.code === UserDataSyncErrorCode.DefaultServiceChanged) {
      if (isWeb && userDataSyncError.code === UserDataSyncErrorCode.DefaultServiceChanged && !this.hasProductQualityChanged()) {
        await this.turnOff(
          false,
          true
          /* force soft turnoff on error */
        );
        this.logService.info("[AutoSync] Turned off sync because default sync service is changed.");
      } else {
        await this.turnOff(
          false,
          true,
          true
          /* do not disable machine */
        );
        await this.turnOn();
        this.logService.info("[AutoSync] Sync Service changed. Turned off auto sync, reset local state and turned on auto sync.");
      }
    } else {
      this.logService.error(userDataSyncError);
      this.successiveFailures++;
    }
    this._onError.fire(userDataSyncError);
  }
  async disableMachineEventually() {
    this.storageService.store(disableMachineEventuallyKey, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
    await timeout(1e3 * 60 * 10);
    if (!this.hasToDisableMachineEventually()) {
      return;
    }
    this.stopDisableMachineEventually();
    if (!this.userDataSyncEnablementService.isEnabled() && this.userDataSyncAccountService.account) {
      await this.userDataSyncMachinesService.removeCurrentMachine();
    }
  }
  hasToDisableMachineEventually() {
    return this.storageService.getBoolean(disableMachineEventuallyKey, StorageScope.APPLICATION, false);
  }
  stopDisableMachineEventually() {
    this.storageService.remove(disableMachineEventuallyKey, StorageScope.APPLICATION);
  }
  async triggerSync(sources, options) {
    if (this.autoSync.value === void 0) {
      return this.syncTriggerDelayer.cancel();
    }
    if (options?.skipIfSyncedRecently && this.lastSyncTriggerTime && (/* @__PURE__ */ new Date()).getTime() - this.lastSyncTriggerTime < 1e4) {
      this.logService.debug("[AutoSync] Skipping because sync was triggered recently.", sources);
      return;
    }
    this.sources.push(...sources);
    return this.syncTriggerDelayer.trigger(async () => {
      this.logService.trace("[AutoSync] Activity sources", ...this.sources);
      this.sources = [];
      if (this.autoSync.value) {
        await this.autoSync.value.sync("Activity", !!options?.disableCache);
      }
    }, this.successiveFailures ? Math.min(this.getSyncTriggerDelayTime() * this.successiveFailures, 6e4) : options?.immediately ? 0 : this.getSyncTriggerDelayTime());
  }
  getSyncTriggerDelayTime() {
    if (this.lastSyncTriggerTime && (/* @__PURE__ */ new Date()).getTime() - this.lastSyncTriggerTime > 1e4) {
      this.logService.debug("[AutoSync] Sync immediately because last sync was triggered more than 10 seconds ago.");
      return 0;
    }
    return 3e3;
  }
};
UserDataAutoSyncService = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IUserDataSyncStoreManagementService),
  __decorateParam(2, IUserDataSyncStoreService),
  __decorateParam(3, IUserDataSyncEnablementService),
  __decorateParam(4, IUserDataSyncService),
  __decorateParam(5, IUserDataSyncLogService),
  __decorateParam(6, IUserDataSyncAccountService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IUserDataSyncMachinesService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IMeteredConnectionService)
], UserDataAutoSyncService);
const _AutoSync = class _AutoSync extends Disposable {
  constructor(lastSyncUrl, interval, userDataSyncStoreManagementService, userDataSyncStoreService, userDataSyncService, userDataSyncMachinesService, logService, telemetryService, storageService) {
    super();
    this.lastSyncUrl = lastSyncUrl;
    this.interval = interval;
    this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
    this.userDataSyncStoreService = userDataSyncStoreService;
    this.userDataSyncService = userDataSyncService;
    this.userDataSyncMachinesService = userDataSyncMachinesService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this.storageService = storageService;
    this.intervalHandler = this._register(new MutableDisposable());
    this._onDidStartSync = this._register(new Emitter());
    this.onDidStartSync = this._onDidStartSync.event;
    this._onDidFinishSync = this._register(new Emitter());
    this.onDidFinishSync = this._onDidFinishSync.event;
    this.manifest = null;
  }
  start() {
    this._register(this.onDidFinishSync(() => this.waitUntilNextIntervalAndSync()));
    this._register(toDisposable(() => {
      if (this.syncPromise) {
        this.syncPromise.cancel();
        this.logService.info("[AutoSync] Cancelled sync that is in progress");
        this.syncPromise = void 0;
      }
      this.syncTask?.stop();
      this.logService.info("[AutoSync] Stopped");
    }));
    this.sync(_AutoSync.INTERVAL_SYNCING, false);
  }
  waitUntilNextIntervalAndSync() {
    this.intervalHandler.value = disposableTimeout(() => {
      this.sync(_AutoSync.INTERVAL_SYNCING, false);
      this.intervalHandler.value = void 0;
    }, this.interval);
  }
  sync(reason, disableCache) {
    const syncPromise = createCancelablePromise(async (token) => {
      if (this.syncPromise) {
        try {
          this.logService.debug("[AutoSync] Waiting until sync is finished.");
          await this.syncPromise;
        } catch (error) {
          if (isCancellationError(error)) {
            return;
          }
        }
      }
      return this.doSync(reason, disableCache, token);
    });
    this.syncPromise = syncPromise;
    this.syncPromise.finally(() => this.syncPromise = void 0);
    return this.syncPromise;
  }
  hasSyncServiceChanged() {
    return this.lastSyncUrl !== void 0 && !isEqual(this.lastSyncUrl, this.userDataSyncStoreManagementService.userDataSyncStore?.url);
  }
  async hasDefaultServiceChanged() {
    const previous = await this.userDataSyncStoreManagementService.getPreviousUserDataSyncStore();
    const current = this.userDataSyncStoreManagementService.userDataSyncStore;
    return !!current && !!previous && (!isEqual(current.defaultUrl, previous.defaultUrl) || !isEqual(current.insidersUrl, previous.insidersUrl) || !isEqual(current.stableUrl, previous.stableUrl));
  }
  async doSync(reason, disableCache, token) {
    this.logService.info(`[AutoSync] Triggered by ${reason}`);
    this._onDidStartSync.fire();
    let error;
    try {
      await this.createAndRunSyncTask(disableCache, token);
    } catch (e) {
      this.logService.error(e);
      error = e;
      if (UserDataSyncError.toUserDataSyncError(e).code === UserDataSyncErrorCode.MethodNotFound) {
        try {
          this.logService.info("[AutoSync] Client is making invalid requests. Cleaning up data...");
          await this.userDataSyncService.cleanUpRemoteData();
          this.logService.info("[AutoSync] Retrying sync...");
          await this.createAndRunSyncTask(disableCache, token);
          error = void 0;
        } catch (e1) {
          this.logService.error(e1);
          error = e1;
        }
      }
    }
    this._onDidFinishSync.fire(error);
  }
  async createAndRunSyncTask(disableCache, token) {
    this.syncTask = await this.userDataSyncService.createSyncTask(this.manifest, disableCache);
    if (token.isCancellationRequested) {
      return;
    }
    this.manifest = this.syncTask.manifest;
    if (this.manifest === null && await this.userDataSyncService.hasPreviouslySynced()) {
      if (this.hasSyncServiceChanged()) {
        if (await this.hasDefaultServiceChanged()) {
          throw new UserDataAutoSyncError(localize("default service changed", "Cannot sync because default service has changed"), UserDataSyncErrorCode.DefaultServiceChanged);
        } else {
          throw new UserDataAutoSyncError(localize("service changed", "Cannot sync because sync service has changed"), UserDataSyncErrorCode.ServiceChanged);
        }
      } else {
        throw new UserDataAutoSyncError(localize("turned off", "Cannot sync because syncing is turned off in the cloud"), UserDataSyncErrorCode.TurnedOff);
      }
    }
    const sessionId = this.storageService.get(sessionIdKey, StorageScope.APPLICATION);
    if (sessionId && this.manifest && sessionId !== this.manifest.session) {
      if (this.hasSyncServiceChanged()) {
        if (await this.hasDefaultServiceChanged()) {
          throw new UserDataAutoSyncError(localize("default service changed", "Cannot sync because default service has changed"), UserDataSyncErrorCode.DefaultServiceChanged);
        } else {
          throw new UserDataAutoSyncError(localize("service changed", "Cannot sync because sync service has changed"), UserDataSyncErrorCode.ServiceChanged);
        }
      } else {
        throw new UserDataAutoSyncError(localize("session expired", "Cannot sync because current session is expired"), UserDataSyncErrorCode.SessionExpired);
      }
    }
    const machines = await this.userDataSyncMachinesService.getMachines(this.manifest || void 0);
    if (token.isCancellationRequested) {
      return;
    }
    const currentMachine = machines.find((machine) => machine.isCurrent);
    if (currentMachine?.disabled) {
      throw new UserDataAutoSyncError(localize("turned off machine", "Cannot sync because syncing is turned off on this machine from another machine."), UserDataSyncErrorCode.TurnedOff);
    }
    const startTime = (/* @__PURE__ */ new Date()).getTime();
    await this.syncTask.run();
    this.telemetryService.publicLog2("settingsSync:sync", { duration: (/* @__PURE__ */ new Date()).getTime() - startTime });
    if (this.manifest === null) {
      try {
        this.manifest = await this.userDataSyncStoreService.manifest(null);
      } catch (error) {
        throw new UserDataAutoSyncError(toErrorMessage(error), error instanceof UserDataSyncError ? error.code : UserDataSyncErrorCode.Unknown);
      }
    }
    if (this.manifest && this.manifest.session !== sessionId) {
      this.storageService.store(sessionIdKey, this.manifest.session, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    if (token.isCancellationRequested) {
      return;
    }
    if (!currentMachine) {
      await this.userDataSyncMachinesService.addCurrentMachine(this.manifest || void 0);
    }
  }
  register(t) {
    return super._register(t);
  }
};
_AutoSync.INTERVAL_SYNCING = "Interval";
let AutoSync = _AutoSync;
export {
  UserDataAutoSyncService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFBdXRvU3luY1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIGRpc3Bvc2FibGVUaW1lb3V0LCBUaHJvdHRsZWREZWxheWVyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgdG9Mb2NhbElTT1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL21ldGVyZWRDb25uZWN0aW9uL2NvbW1vbi9tZXRlcmVkQ29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jVGFzaywgSVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLCBJVXNlckRhdGFNYW5pZmVzdCwgSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsIElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSwgSVVzZXJEYXRhU3luY1NlcnZpY2UsIElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLCBVc2VyRGF0YUF1dG9TeW5jRXJyb3IsIFVzZXJEYXRhU3luY0Vycm9yLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUsIFN5bmNPcHRpb25zIH0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi91c2VyRGF0YVN5bmNBY2NvdW50LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UgfSBmcm9tICcuL3VzZXJEYXRhU3luY01hY2hpbmVzLmpzJztcblxuY29uc3QgZGlzYWJsZU1hY2hpbmVFdmVudHVhbGx5S2V5ID0gJ3N5bmMuZGlzYWJsZU1hY2hpbmVFdmVudHVhbGx5JztcbmNvbnN0IHNlc3Npb25JZEtleSA9ICdzeW5jLnNlc3Npb25JZCc7XG5jb25zdCBzdG9yZVVybEtleSA9ICdzeW5jLnN0b3JlVXJsJztcbmNvbnN0IHByb2R1Y3RRdWFsaXR5S2V5ID0gJ3N5bmMucHJvZHVjdFF1YWxpdHknO1xuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFBdXRvU3luY1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhdXRvU3luYyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxBdXRvU3luYz4oKSk7XG5cdHByaXZhdGUgc3VjY2Vzc2l2ZUZhaWx1cmVzOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIGxhc3RTeW5jVHJpZ2dlclRpbWU6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBzeW5jVHJpZ2dlckRlbGF5ZXI6IFRocm90dGxlZERlbGF5ZXI8dm9pZD47XG5cdHByaXZhdGUgc3VzcGVuZFVudGlsUmVzdGFydDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRXJyb3I6IEVtaXR0ZXI8VXNlckRhdGFTeW5jRXJyb3I+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VXNlckRhdGFTeW5jRXJyb3I+KCkpO1xuXHRyZWFkb25seSBvbkVycm9yOiBFdmVudDxVc2VyRGF0YVN5bmNFcnJvcj4gPSB0aGlzLl9vbkVycm9yLmV2ZW50O1xuXG5cdHByaXZhdGUgbGFzdFN5bmNVcmw6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgc3luY1VybCgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoc3RvcmVVcmxLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0cmV0dXJuIHZhbHVlID8gVVJJLnBhcnNlKHZhbHVlKSA6IHVuZGVmaW5lZDtcblx0fVxuXHRwcml2YXRlIHNldCBzeW5jVXJsKHN5bmNVcmw6IFVSSSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmIChzeW5jVXJsKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHN0b3JlVXJsS2V5LCBzeW5jVXJsLnRvU3RyaW5nKCksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoc3RvcmVVcmxLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwcmV2aW91c1Byb2R1Y3RRdWFsaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IHByb2R1Y3RRdWFsaXR5KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHByb2R1Y3RRdWFsaXR5S2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHR9XG5cdHByaXZhdGUgc2V0IHByb2R1Y3RRdWFsaXR5KHByb2R1Y3RRdWFsaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAocHJvZHVjdFF1YWxpdHkpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUocHJvZHVjdFF1YWxpdHlLZXksIHByb2R1Y3RRdWFsaXR5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKHByb2R1Y3RRdWFsaXR5S2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1N0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jQWNjb3VudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNBY2NvdW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZTogSVVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1ldGVyZWRDb25uZWN0aW9uU2VydmljZTogSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnN5bmNUcmlnZ2VyRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZWREZWxheWVyPHZvaWQ+KHRoaXMuZ2V0U3luY1RyaWdnZXJEZWxheVRpbWUoKSkpO1xuXG5cdFx0dGhpcy5sYXN0U3luY1VybCA9IHRoaXMuc3luY1VybDtcblx0XHR0aGlzLnN5bmNVcmwgPSB1c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY1N0b3JlPy51cmw7XG5cblx0XHR0aGlzLnByZXZpb3VzUHJvZHVjdFF1YWxpdHkgPSB0aGlzLnByb2R1Y3RRdWFsaXR5O1xuXHRcdHRoaXMucHJvZHVjdFF1YWxpdHkgPSBwcm9kdWN0U2VydmljZS5xdWFsaXR5O1xuXG5cdFx0aWYgKHRoaXMuc3luY1VybCkge1xuXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW0F1dG9TeW5jXSBVc2luZyBzZXR0aW5ncyBzeW5jIHNlcnZpY2UnLCB0aGlzLnN5bmNVcmwudG9TdHJpbmcoKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih1c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVXNlckRhdGFTeW5jU3RvcmUoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWlzRXF1YWwodGhpcy5zeW5jVXJsLCB1c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY1N0b3JlPy51cmwpKSB7XG5cdFx0XHRcdFx0dGhpcy5sYXN0U3luY1VybCA9IHRoaXMuc3luY1VybDtcblx0XHRcdFx0XHR0aGlzLnN5bmNVcmwgPSB1c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY1N0b3JlPy51cmw7XG5cdFx0XHRcdFx0aWYgKHRoaXMuc3luY1VybCkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tBdXRvU3luY10gVXNpbmcgc2V0dGluZ3Mgc3luYyBzZXJ2aWNlJywgdGhpcy5zeW5jVXJsLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRpZiAodGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW0F1dG9TeW5jXSBFbmFibGVkLicpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tBdXRvU3luY10gRGlzYWJsZWQuJyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZUF1dG9TeW5jKCk7XG5cblx0XHRcdGlmICh0aGlzLmhhc1RvRGlzYWJsZU1hY2hpbmVFdmVudHVhbGx5KCkpIHtcblx0XHRcdFx0dGhpcy5kaXNhYmxlTWFjaGluZUV2ZW50dWFsbHkoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodXNlckRhdGFTeW5jQWNjb3VudFNlcnZpY2Uub25EaWRDaGFuZ2VBY2NvdW50KCgpID0+IHRoaXMudXBkYXRlQXV0b1N5bmMoKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLm9uRGlkQ2hhbmdlRG9ub3RNYWtlUmVxdWVzdHNVbnRpbCgoKSA9PiB0aGlzLnVwZGF0ZUF1dG9TeW5jKCkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhU3luY1NlcnZpY2Uub25EaWRDaGFuZ2VMb2NhbChzb3VyY2UgPT4gdGhpcy50cmlnZ2VyU3luYyhbc291cmNlXSkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcih0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUmVzb3VyY2VFbmFibGVtZW50LCAoWywgZW5hYmxlZF0pID0+IGVuYWJsZWQpKCgpID0+IHRoaXMudHJpZ2dlclN5bmMoWydyZXNvdXJjZUVuYWJsZW1lbnQnXSkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVVzZXJEYXRhU3luY1N0b3JlKCgpID0+IHRoaXMudHJpZ2dlclN5bmMoWyd1c2VyRGF0YVN5bmNTdG9yZUNoYW5nZWQnXSkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG1ldGVyZWRDb25uZWN0aW9uU2VydmljZS5vbkRpZENoYW5nZUlzQ29ubmVjdGlvbk1ldGVyZWQoKCkgPT4gdGhpcy51cGRhdGVBdXRvU3luYygpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBdXRvU3luYygpOiB2b2lkIHtcblx0XHRjb25zdCB7IGVuYWJsZWQsIG1lc3NhZ2UgfSA9IHRoaXMuaXNBdXRvU3luY0VuYWJsZWQoKTtcblx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0aWYgKHRoaXMuYXV0b1N5bmMudmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLmF1dG9TeW5jLnZhbHVlID0gbmV3IEF1dG9TeW5jKHRoaXMubGFzdFN5bmNVcmwsIDEwMDAgKiA2MCAqIDUgLyogNSBtaXV0ZXMgKi8sIHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSwgdGhpcy51c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIHRoaXMudXNlckRhdGFTeW5jU2VydmljZSwgdGhpcy51c2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdFx0dGhpcy5hdXRvU3luYy52YWx1ZS5yZWdpc3Rlcih0aGlzLmF1dG9TeW5jLnZhbHVlLm9uRGlkU3RhcnRTeW5jKCgpID0+IHRoaXMubGFzdFN5bmNUcmlnZ2VyVGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpKSk7XG5cdFx0XHRcdHRoaXMuYXV0b1N5bmMudmFsdWUucmVnaXN0ZXIodGhpcy5hdXRvU3luYy52YWx1ZS5vbkRpZEZpbmlzaFN5bmMoZSA9PiB0aGlzLm9uRGlkRmluaXNoU3luYyhlKSkpO1xuXHRcdFx0XHRpZiAodGhpcy5zdGFydEF1dG9TeW5jKCkpIHtcblx0XHRcdFx0XHR0aGlzLmF1dG9TeW5jLnZhbHVlLnN0YXJ0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zeW5jVHJpZ2dlckRlbGF5ZXIuY2FuY2VsKCk7XG5cdFx0XHRpZiAodGhpcy5hdXRvU3luYy52YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlmIChtZXNzYWdlKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8obWVzc2FnZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5hdXRvU3luYy5jbGVhcigpO1xuXHRcdFx0fVxuXG5cdFx0XHQvKiBsb2cgbWVzc2FnZSB3aGVuIGF1dG8gc3luYyBpcyBub3QgZGlzYWJsZWQgYnkgdXNlciAqL1xuXHRcdFx0ZWxzZSBpZiAobWVzc2FnZSAmJiB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKG1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIEZvciB0ZXN0cyBwdXJwb3NlIG9ubHlcblx0cHJvdGVjdGVkIHN0YXJ0QXV0b1N5bmMoKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cblx0cHJpdmF0ZSBpc0F1dG9TeW5jRW5hYmxlZCgpOiB7IGVuYWJsZWQ6IGJvb2xlYW47IG1lc3NhZ2U/OiBzdHJpbmcgfSB7XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm4geyBlbmFibGVkOiBmYWxzZSwgbWVzc2FnZTogJ1tBdXRvU3luY10gRGlzYWJsZWQuJyB9O1xuXHRcdH1cblx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jQWNjb3VudFNlcnZpY2UuYWNjb3VudCkge1xuXHRcdFx0cmV0dXJuIHsgZW5hYmxlZDogZmFsc2UsIG1lc3NhZ2U6ICdbQXV0b1N5bmNdIFN1c3BlbmRlZCB1bnRpbCBhdXRoIHRva2VuIGlzIGF2YWlsYWJsZS4nIH07XG5cdFx0fVxuXHRcdGlmICh0aGlzLnVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5kb25vdE1ha2VSZXF1ZXN0c1VudGlsKSB7XG5cdFx0XHRyZXR1cm4geyBlbmFibGVkOiBmYWxzZSwgbWVzc2FnZTogYFtBdXRvU3luY10gU3VzcGVuZGVkIHVudGlsICR7dG9Mb2NhbElTT1N0cmluZyh0aGlzLnVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5kb25vdE1ha2VSZXF1ZXN0c1VudGlsKX0gYmVjYXVzZSBzZXJ2ZXIgaXMgbm90IGFjY2VwdGluZyByZXF1ZXN0cyB1bnRpbCB0aGVuLmAgfTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuc3VzcGVuZFVudGlsUmVzdGFydCkge1xuXHRcdFx0cmV0dXJuIHsgZW5hYmxlZDogZmFsc2UsIG1lc3NhZ2U6ICdbQXV0b1N5bmNdIFN1c3BlbmRlZCB1bnRpbCByZXN0YXJ0LicgfTtcblx0XHR9XG5cdFx0aWYgKHRoaXMubWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlLmlzQ29ubmVjdGlvbk1ldGVyZWQpIHtcblx0XHRcdHJldHVybiB7IGVuYWJsZWQ6IGZhbHNlLCBtZXNzYWdlOiAnW0F1dG9TeW5jXSBTdXNwZW5kZWQgYmVjYXVzZSBjb25uZWN0aW9uIGlzIG1ldGVyZWQuJyB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyBlbmFibGVkOiB0cnVlIH07XG5cdH1cblxuXHRhc3luYyB0dXJuT24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zdG9wRGlzYWJsZU1hY2hpbmVFdmVudHVhbGx5KCk7XG5cdFx0dGhpcy5sYXN0U3luY1VybCA9IHRoaXMuc3luY1VybDtcblx0XHR0aGlzLnVwZGF0ZUVuYWJsZW1lbnQodHJ1ZSk7XG5cdH1cblxuXHRhc3luYyB0dXJuT2ZmKGV2ZXJ5d2hlcmU6IGJvb2xlYW4sIHNvZnRUdXJuT2ZmT25FcnJvcj86IGJvb2xlYW4sIGRvbm90UmVtb3ZlTWFjaGluZT86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXG5cdFx0XHQvLyBSZW1vdmUgbWFjaGluZVxuXHRcdFx0aWYgKHRoaXMudXNlckRhdGFTeW5jQWNjb3VudFNlcnZpY2UuYWNjb3VudCAmJiAhZG9ub3RSZW1vdmVNYWNoaW5lKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlLnJlbW92ZUN1cnJlbnRNYWNoaW5lKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIERpc2FibGUgQXV0byBTeW5jXG5cdFx0XHR0aGlzLnVwZGF0ZUVuYWJsZW1lbnQoZmFsc2UpO1xuXG5cdFx0XHQvLyBSZXNldCBTZXNzaW9uXG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShzZXNzaW9uSWRLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cblx0XHRcdC8vIFJlc2V0XG5cdFx0XHRpZiAoZXZlcnl3aGVyZSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UucmVzZXQoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU2VydmljZS5yZXNldExvY2FsKCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRpZiAoc29mdFR1cm5PZmZPbkVycm9yKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRW5hYmxlbWVudChmYWxzZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUVuYWJsZW1lbnQoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpICE9PSBlbmFibGVkKSB7XG5cdFx0XHR0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLnNldEVuYWJsZW1lbnQoZW5hYmxlZCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUF1dG9TeW5jKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYXNQcm9kdWN0UXVhbGl0eUNoYW5nZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5wcmV2aW91c1Byb2R1Y3RRdWFsaXR5ICYmICEhdGhpcy5wcm9kdWN0UXVhbGl0eSAmJiB0aGlzLnByZXZpb3VzUHJvZHVjdFF1YWxpdHkgIT09IHRoaXMucHJvZHVjdFF1YWxpdHk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkRmluaXNoU3luYyhlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tBdXRvU3luY10gU3luYyBGaW5pc2hlZCcpO1xuXHRcdGlmICghZXJyb3IpIHtcblx0XHRcdC8vIFN5bmMgZmluaXNoZWQgd2l0aG91dCBlcnJvcnNcblx0XHRcdHRoaXMuc3VjY2Vzc2l2ZUZhaWx1cmVzID0gMDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBFcnJvciB3aGlsZSBzeW5jaW5nXG5cdFx0Y29uc3QgdXNlckRhdGFTeW5jRXJyb3IgPSBVc2VyRGF0YVN5bmNFcnJvci50b1VzZXJEYXRhU3luY0Vycm9yKGVycm9yKTtcblxuXHRcdC8vIFNlc3Npb24gZ290IGV4cGlyZWRcblx0XHRpZiAodXNlckRhdGFTeW5jRXJyb3IuY29kZSA9PT0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLlNlc3Npb25FeHBpcmVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnR1cm5PZmYoZmFsc2UsIHRydWUgLyogZm9yY2Ugc29mdCB0dXJub2ZmIG9uIGVycm9yICovKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbQXV0b1N5bmNdIFR1cm5lZCBvZmYgc3luYyBiZWNhdXNlIGN1cnJlbnQgc2Vzc2lvbiBpcyBleHBpcmVkJyk7XG5cdFx0fVxuXG5cdFx0Ly8gVHVybmVkIG9mZiBmcm9tIGFub3RoZXIgZGV2aWNlXG5cdFx0ZWxzZSBpZiAodXNlckRhdGFTeW5jRXJyb3IuY29kZSA9PT0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLlR1cm5lZE9mZikge1xuXHRcdFx0YXdhaXQgdGhpcy50dXJuT2ZmKGZhbHNlLCB0cnVlIC8qIGZvcmNlIHNvZnQgdHVybm9mZiBvbiBlcnJvciAqLyk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW0F1dG9TeW5jXSBUdXJuZWQgb2ZmIHN5bmMgYmVjYXVzZSBzeW5jIGlzIHR1cm5lZCBvZmYgaW4gdGhlIGNsb3VkJyk7XG5cdFx0fVxuXG5cdFx0Ly8gRXhjZWVkZWQgUmF0ZSBMaW1pdCBvbiBDbGllbnRcblx0XHRlbHNlIGlmICh1c2VyRGF0YVN5bmNFcnJvci5jb2RlID09PSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTG9jYWxUb29NYW55UmVxdWVzdHMpIHtcblx0XHRcdHRoaXMuc3VzcGVuZFVudGlsUmVzdGFydCA9IHRydWU7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW0F1dG9TeW5jXSBTdXNwZW5kZWQgc3luYyBiZWNhdXNlIG9mIG1ha2luZyB0b28gbWFueSByZXF1ZXN0cyB0byBzZXJ2ZXInKTtcblx0XHRcdHRoaXMudXBkYXRlQXV0b1N5bmMoKTtcblx0XHR9XG5cblx0XHQvLyBFeGNlZWRlZCBSYXRlIExpbWl0IG9uIFNlcnZlclxuXHRcdGVsc2UgaWYgKHVzZXJEYXRhU3luY0Vycm9yLmNvZGUgPT09IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ub29NYW55UmVxdWVzdHMpIHtcblx0XHRcdGF3YWl0IHRoaXMudHVybk9mZihmYWxzZSwgdHJ1ZSAvKiBmb3JjZSBzb2Z0IHR1cm5vZmYgb24gZXJyb3IgKi8sXG5cdFx0XHRcdHRydWUgLyogZG8gbm90IGRpc2FibGUgbWFjaGluZSBiZWNhdXNlIGRpc2FibGluZyBhIG1hY2hpbmUgbWFrZXMgcmVxdWVzdCB0byBzZXJ2ZXIgYW5kIGNhbiBmYWlsIHdpdGggVG9vTWFueVJlcXVlc3RzICovKTtcblx0XHRcdHRoaXMuZGlzYWJsZU1hY2hpbmVFdmVudHVhbGx5KCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW0F1dG9TeW5jXSBUdXJuZWQgb2ZmIHN5bmMgYmVjYXVzZSBvZiBtYWtpbmcgdG9vIG1hbnkgcmVxdWVzdHMgdG8gc2VydmVyJyk7XG5cdFx0fVxuXG5cdFx0Ly8gTWV0aG9kIE5vdCBGb3VuZFxuXHRcdGVsc2UgaWYgKHVzZXJEYXRhU3luY0Vycm9yLmNvZGUgPT09IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5NZXRob2ROb3RGb3VuZCkge1xuXHRcdFx0YXdhaXQgdGhpcy50dXJuT2ZmKGZhbHNlLCB0cnVlIC8qIGZvcmNlIHNvZnQgdHVybm9mZiBvbiBlcnJvciAqLyk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW0F1dG9TeW5jXSBUdXJuZWQgb2ZmIHN5bmMgYmVjYXVzZSBjdXJyZW50IGNsaWVudCBpcyBtYWtpbmcgcmVxdWVzdHMgdG8gc2VydmVyIHRoYXQgYXJlIG5vdCBzdXBwb3J0ZWQnKTtcblx0XHR9XG5cblx0XHQvLyBVcGdyYWRlIFJlcXVpcmVkIG9yIEdvbmVcblx0XHRlbHNlIGlmICh1c2VyRGF0YVN5bmNFcnJvci5jb2RlID09PSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVXBncmFkZVJlcXVpcmVkIHx8IHVzZXJEYXRhU3luY0Vycm9yLmNvZGUgPT09IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Hb25lKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnR1cm5PZmYoZmFsc2UsIHRydWUgLyogZm9yY2Ugc29mdCB0dXJub2ZmIG9uIGVycm9yICovLFxuXHRcdFx0XHR0cnVlIC8qIGRvIG5vdCBkaXNhYmxlIG1hY2hpbmUgYmVjYXVzZSBkaXNhYmxpbmcgYSBtYWNoaW5lIG1ha2VzIHJlcXVlc3QgdG8gc2VydmVyIGFuZCBjYW4gZmFpbCB3aXRoIHVwZ3JhZGUgcmVxdWlyZWQgb3IgZ29uZSAqLyk7XG5cdFx0XHR0aGlzLmRpc2FibGVNYWNoaW5lRXZlbnR1YWxseSgpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tBdXRvU3luY10gVHVybmVkIG9mZiBzeW5jIGJlY2F1c2UgY3VycmVudCBjbGllbnQgaXMgbm90IGNvbXBhdGlibGUgd2l0aCBzZXJ2ZXIuIFJlcXVpcmVzIGNsaWVudCB1cGdyYWRlLicpO1xuXHRcdH1cblxuXHRcdC8vIEluY29tcGF0aWJsZSBMb2NhbCBDb250ZW50XG5cdFx0ZWxzZSBpZiAodXNlckRhdGFTeW5jRXJyb3IuY29kZSA9PT0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLkluY29tcGF0aWJsZUxvY2FsQ29udGVudCkge1xuXHRcdFx0YXdhaXQgdGhpcy50dXJuT2ZmKGZhbHNlLCB0cnVlIC8qIGZvcmNlIHNvZnQgdHVybm9mZiBvbiBlcnJvciAqLyk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgW0F1dG9TeW5jXSBUdXJuZWQgb2ZmIHN5bmMgYmVjYXVzZSBzZXJ2ZXIgaGFzICR7dXNlckRhdGFTeW5jRXJyb3IucmVzb3VyY2V9IGNvbnRlbnQgd2l0aCBuZXdlciB2ZXJzaW9uIHRoYW4gb2YgY2xpZW50LiBSZXF1aXJlcyBjbGllbnQgdXBncmFkZS5gKTtcblx0XHR9XG5cblx0XHQvLyBJbmNvbXBhdGlibGUgUmVtb3RlIENvbnRlbnRcblx0XHRlbHNlIGlmICh1c2VyRGF0YVN5bmNFcnJvci5jb2RlID09PSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuSW5jb21wYXRpYmxlUmVtb3RlQ29udGVudCkge1xuXHRcdFx0YXdhaXQgdGhpcy50dXJuT2ZmKGZhbHNlLCB0cnVlIC8qIGZvcmNlIHNvZnQgdHVybm9mZiBvbiBlcnJvciAqLyk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgW0F1dG9TeW5jXSBUdXJuZWQgb2ZmIHN5bmMgYmVjYXVzZSBzZXJ2ZXIgaGFzICR7dXNlckRhdGFTeW5jRXJyb3IucmVzb3VyY2V9IGNvbnRlbnQgd2l0aCBvbGRlciB2ZXJzaW9uIHRoYW4gb2YgY2xpZW50LiBSZXF1aXJlcyBzZXJ2ZXIgcmVzZXQuYCk7XG5cdFx0fVxuXG5cdFx0Ly8gU2VydmljZSBjaGFuZ2VkXG5cdFx0ZWxzZSBpZiAodXNlckRhdGFTeW5jRXJyb3IuY29kZSA9PT0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLlNlcnZpY2VDaGFuZ2VkIHx8IHVzZXJEYXRhU3luY0Vycm9yLmNvZGUgPT09IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5EZWZhdWx0U2VydmljZUNoYW5nZWQpIHtcblxuXHRcdFx0Ly8gQ2hlY2sgaWYgZGVmYXVsdCBzZXR0aW5ncyBzeW5jIHNlcnZpY2UgaGFzIGNoYW5nZWQgaW4gd2ViIHdpdGhvdXQgY2hhbmdpbmcgdGhlIHByb2R1Y3QgcXVhbGl0eVxuXHRcdFx0Ly8gVGhlbiB0dXJuIG9mZiBzZXR0aW5ncyBzeW5jIGFuZCBhc2sgdXNlciB0byB0dXJuIG9uIGFnYWluXG5cdFx0XHRpZiAoaXNXZWIgJiYgdXNlckRhdGFTeW5jRXJyb3IuY29kZSA9PT0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLkRlZmF1bHRTZXJ2aWNlQ2hhbmdlZCAmJiAhdGhpcy5oYXNQcm9kdWN0UXVhbGl0eUNoYW5nZWQoKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnR1cm5PZmYoZmFsc2UsIHRydWUgLyogZm9yY2Ugc29mdCB0dXJub2ZmIG9uIGVycm9yICovKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tBdXRvU3luY10gVHVybmVkIG9mZiBzeW5jIGJlY2F1c2UgZGVmYXVsdCBzeW5jIHNlcnZpY2UgaXMgY2hhbmdlZC4nKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2VydmljZSBoYXMgY2hhbmdlZCBieSB0aGUgdXNlci4gU28gdHVybiBvZmYgYW5kIHR1cm4gb24gc3luYy5cblx0XHRcdC8vIFNob3cgYSBwcm9tcHQgdG8gdGhlIHVzZXIgYWJvdXQgc2VydmljZSBjaGFuZ2UuXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy50dXJuT2ZmKGZhbHNlLCB0cnVlIC8qIGZvcmNlIHNvZnQgdHVybm9mZiBvbiBlcnJvciAqLywgdHJ1ZSAvKiBkbyBub3QgZGlzYWJsZSBtYWNoaW5lICovKTtcblx0XHRcdFx0YXdhaXQgdGhpcy50dXJuT24oKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tBdXRvU3luY10gU3luYyBTZXJ2aWNlIGNoYW5nZWQuIFR1cm5lZCBvZmYgYXV0byBzeW5jLCByZXNldCBsb2NhbCBzdGF0ZSBhbmQgdHVybmVkIG9uIGF1dG8gc3luYy4nKTtcblx0XHRcdH1cblxuXHRcdH1cblxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKHVzZXJEYXRhU3luY0Vycm9yKTtcblx0XHRcdHRoaXMuc3VjY2Vzc2l2ZUZhaWx1cmVzKys7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25FcnJvci5maXJlKHVzZXJEYXRhU3luY0Vycm9yKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGlzYWJsZU1hY2hpbmVFdmVudHVhbGx5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoZGlzYWJsZU1hY2hpbmVFdmVudHVhbGx5S2V5LCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMDAwICogNjAgKiAxMCk7XG5cblx0XHQvLyBSZXR1cm4gaWYgZ290IHN0b3BwZWQgbWVhbndoaWxlLlxuXHRcdGlmICghdGhpcy5oYXNUb0Rpc2FibGVNYWNoaW5lRXZlbnR1YWxseSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zdG9wRGlzYWJsZU1hY2hpbmVFdmVudHVhbGx5KCk7XG5cblx0XHQvLyBkaXNhYmxlIG9ubHkgaWYgc3luYyBpcyBkaXNhYmxlZFxuXHRcdGlmICghdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSAmJiB0aGlzLnVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlLmFjY291bnQpIHtcblx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlLnJlbW92ZUN1cnJlbnRNYWNoaW5lKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYXNUb0Rpc2FibGVNYWNoaW5lRXZlbnR1YWxseSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKGRpc2FibGVNYWNoaW5lRXZlbnR1YWxseUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIHN0b3BEaXNhYmxlTWFjaGluZUV2ZW50dWFsbHkoKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoZGlzYWJsZU1hY2hpbmVFdmVudHVhbGx5S2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHR9XG5cblx0cHJpdmF0ZSBzb3VyY2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRhc3luYyB0cmlnZ2VyU3luYyhzb3VyY2VzOiBzdHJpbmdbXSwgb3B0aW9ucz86IFN5bmNPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuYXV0b1N5bmMudmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc3luY1RyaWdnZXJEZWxheWVyLmNhbmNlbCgpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy5za2lwSWZTeW5jZWRSZWNlbnRseSAmJiB0aGlzLmxhc3RTeW5jVHJpZ2dlclRpbWUgJiYgbmV3IERhdGUoKS5nZXRUaW1lKCkgLSB0aGlzLmxhc3RTeW5jVHJpZ2dlclRpbWUgPCAxMF8wMDApIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0F1dG9TeW5jXSBTa2lwcGluZyBiZWNhdXNlIHN5bmMgd2FzIHRyaWdnZXJlZCByZWNlbnRseS4nLCBzb3VyY2VzKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnNvdXJjZXMucHVzaCguLi5zb3VyY2VzKTtcblx0XHRyZXR1cm4gdGhpcy5zeW5jVHJpZ2dlckRlbGF5ZXIudHJpZ2dlcihhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tBdXRvU3luY10gQWN0aXZpdHkgc291cmNlcycsIC4uLnRoaXMuc291cmNlcyk7XG5cdFx0XHR0aGlzLnNvdXJjZXMgPSBbXTtcblx0XHRcdGlmICh0aGlzLmF1dG9TeW5jLnZhbHVlKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuYXV0b1N5bmMudmFsdWUuc3luYygnQWN0aXZpdHknLCAhIW9wdGlvbnM/LmRpc2FibGVDYWNoZSk7XG5cdFx0XHR9XG5cdFx0fSwgdGhpcy5zdWNjZXNzaXZlRmFpbHVyZXNcblx0XHRcdD8gTWF0aC5taW4odGhpcy5nZXRTeW5jVHJpZ2dlckRlbGF5VGltZSgpICogdGhpcy5zdWNjZXNzaXZlRmFpbHVyZXMsIDYwXzAwMCkgLyogRGVsYXkgbGluZWFybHkgdW50aWwgbWF4IDEgbWludXRlICovXG5cdFx0XHQ6IG9wdGlvbnM/LmltbWVkaWF0ZWx5ID8gMCA6IHRoaXMuZ2V0U3luY1RyaWdnZXJEZWxheVRpbWUoKSk7XG5cblx0fVxuXG5cdHByb3RlY3RlZCBnZXRTeW5jVHJpZ2dlckRlbGF5VGltZSgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLmxhc3RTeW5jVHJpZ2dlclRpbWUgJiYgbmV3IERhdGUoKS5nZXRUaW1lKCkgLSB0aGlzLmxhc3RTeW5jVHJpZ2dlclRpbWUgPiAxMF8wMDApIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0F1dG9TeW5jXSBTeW5jIGltbWVkaWF0ZWx5IGJlY2F1c2UgbGFzdCBzeW5jIHdhcyB0cmlnZ2VyZWQgbW9yZSB0aGFuIDEwIHNlY29uZHMgYWdvLicpO1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdHJldHVybiAzXzAwMDsgLyogRGVib3VuY2UgZm9yIDMgc2Vjb25kcyBpZiB0aGVyZSBhcmUgbm8gZmFpbHVyZXMgKi9cblx0fVxuXG59XG5cbmNsYXNzIEF1dG9TeW5jIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSU5URVJWQUxfU1lOQ0lORyA9ICdJbnRlcnZhbCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpbnRlcnZhbEhhbmRsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3RhcnRTeW5jID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU3RhcnRTeW5jID0gdGhpcy5fb25EaWRTdGFydFN5bmMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGaW5pc2hTeW5jID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RXJyb3IgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZpbmlzaFN5bmMgPSB0aGlzLl9vbkRpZEZpbmlzaFN5bmMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBtYW5pZmVzdDogSVVzZXJEYXRhTWFuaWZlc3QgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBzeW5jVGFzazogSVVzZXJEYXRhU3luY1Rhc2sgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3luY1Byb21pc2U6IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGFzdFN5bmNVcmw6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGludGVydmFsOiBudW1iZXIgLyogaW4gbWlsbGlzZWNvbmRzICovLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZTogSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZTogSVVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0c3RhcnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZEZpbmlzaFN5bmMoKCkgPT4gdGhpcy53YWl0VW50aWxOZXh0SW50ZXJ2YWxBbmRTeW5jKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuc3luY1Byb21pc2UpIHtcblx0XHRcdFx0dGhpcy5zeW5jUHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tBdXRvU3luY10gQ2FuY2VsbGVkIHN5bmMgdGhhdCBpcyBpbiBwcm9ncmVzcycpO1xuXHRcdFx0XHR0aGlzLnN5bmNQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zeW5jVGFzaz8uc3RvcCgpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tBdXRvU3luY10gU3RvcHBlZCcpO1xuXHRcdH0pKTtcblx0XHR0aGlzLnN5bmMoQXV0b1N5bmMuSU5URVJWQUxfU1lOQ0lORywgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSB3YWl0VW50aWxOZXh0SW50ZXJ2YWxBbmRTeW5jKCk6IHZvaWQge1xuXHRcdHRoaXMuaW50ZXJ2YWxIYW5kbGVyLnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5zeW5jKEF1dG9TeW5jLklOVEVSVkFMX1NZTkNJTkcsIGZhbHNlKTtcblx0XHRcdHRoaXMuaW50ZXJ2YWxIYW5kbGVyLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdH0sIHRoaXMuaW50ZXJ2YWwpO1xuXHR9XG5cblx0c3luYyhyZWFzb246IHN0cmluZywgZGlzYWJsZUNhY2hlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc3luY1Byb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyB0b2tlbiA9PiB7XG5cdFx0XHRpZiAodGhpcy5zeW5jUHJvbWlzZSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIFdhaXQgdW50aWwgZXhpc3Rpbmcgc3luYyBpcyBmaW5pc2hlZFxuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0F1dG9TeW5jXSBXYWl0aW5nIHVudGlsIHN5bmMgaXMgZmluaXNoZWQuJyk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5zeW5jUHJvbWlzZTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRcdFx0XHRcdC8vIENhbmNlbGxlZCA9PiBEaXNwb3NlZC4gRG9ub3QgY29udGludWUgc3luYy5cblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmRvU3luYyhyZWFzb24sIGRpc2FibGVDYWNoZSwgdG9rZW4pO1xuXHRcdH0pO1xuXHRcdHRoaXMuc3luY1Byb21pc2UgPSBzeW5jUHJvbWlzZTtcblx0XHR0aGlzLnN5bmNQcm9taXNlLmZpbmFsbHkoKCkgPT4gdGhpcy5zeW5jUHJvbWlzZSA9IHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHRoaXMuc3luY1Byb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGhhc1N5bmNTZXJ2aWNlQ2hhbmdlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5sYXN0U3luY1VybCAhPT0gdW5kZWZpbmVkICYmICFpc0VxdWFsKHRoaXMubGFzdFN5bmNVcmwsIHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZT8udXJsKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFzRGVmYXVsdFNlcnZpY2VDaGFuZ2VkKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHByZXZpb3VzID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLmdldFByZXZpb3VzVXNlckRhdGFTeW5jU3RvcmUoKTtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy51c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY1N0b3JlO1xuXHRcdC8vIGNoZWNrIGlmIGRlZmF1bHRzIGNoYW5nZWRcblx0XHRyZXR1cm4gISFjdXJyZW50ICYmICEhcHJldmlvdXMgJiZcblx0XHRcdCghaXNFcXVhbChjdXJyZW50LmRlZmF1bHRVcmwsIHByZXZpb3VzLmRlZmF1bHRVcmwpIHx8XG5cdFx0XHRcdCFpc0VxdWFsKGN1cnJlbnQuaW5zaWRlcnNVcmwsIHByZXZpb3VzLmluc2lkZXJzVXJsKSB8fFxuXHRcdFx0XHQhaXNFcXVhbChjdXJyZW50LnN0YWJsZVVybCwgcHJldmlvdXMuc3RhYmxlVXJsKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU3luYyhyZWFzb246IHN0cmluZywgZGlzYWJsZUNhY2hlOiBib29sZWFuLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgW0F1dG9TeW5jXSBUcmlnZ2VyZWQgYnkgJHtyZWFzb259YCk7XG5cblx0XHR0aGlzLl9vbkRpZFN0YXJ0U3luYy5maXJlKCk7XG5cblx0XHRsZXQgZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNyZWF0ZUFuZFJ1blN5bmNUYXNrKGRpc2FibGVDYWNoZSwgdG9rZW4pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlKTtcblx0XHRcdGVycm9yID0gZTtcblx0XHRcdGlmIChVc2VyRGF0YVN5bmNFcnJvci50b1VzZXJEYXRhU3luY0Vycm9yKGUpLmNvZGUgPT09IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5NZXRob2ROb3RGb3VuZCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbQXV0b1N5bmNdIENsaWVudCBpcyBtYWtpbmcgaW52YWxpZCByZXF1ZXN0cy4gQ2xlYW5pbmcgdXAgZGF0YS4uLicpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU2VydmljZS5jbGVhblVwUmVtb3RlRGF0YSgpO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbQXV0b1N5bmNdIFJldHJ5aW5nIHN5bmMuLi4nKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNyZWF0ZUFuZFJ1blN5bmNUYXNrKGRpc2FibGVDYWNoZSwgdG9rZW4pO1xuXHRcdFx0XHRcdGVycm9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9IGNhdGNoIChlMSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlMSk7XG5cdFx0XHRcdFx0ZXJyb3IgPSBlMTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkRmluaXNoU3luYy5maXJlKGVycm9yKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlQW5kUnVuU3luY1Rhc2soZGlzYWJsZUNhY2hlOiBib29sZWFuLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnN5bmNUYXNrID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLmNyZWF0ZVN5bmNUYXNrKHRoaXMubWFuaWZlc3QsIGRpc2FibGVDYWNoZSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubWFuaWZlc3QgPSB0aGlzLnN5bmNUYXNrLm1hbmlmZXN0O1xuXG5cdFx0Ly8gU2VydmVyIGhhcyBubyBkYXRhIGJ1dCB0aGlzIG1hY2hpbmUgd2FzIHN5bmNlZCBiZWZvcmVcblx0XHRpZiAodGhpcy5tYW5pZmVzdCA9PT0gbnVsbCAmJiBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UuaGFzUHJldmlvdXNseVN5bmNlZCgpKSB7XG5cdFx0XHRpZiAodGhpcy5oYXNTeW5jU2VydmljZUNoYW5nZWQoKSkge1xuXHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5oYXNEZWZhdWx0U2VydmljZUNoYW5nZWQoKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBVc2VyRGF0YUF1dG9TeW5jRXJyb3IobG9jYWxpemUoJ2RlZmF1bHQgc2VydmljZSBjaGFuZ2VkJywgXCJDYW5ub3Qgc3luYyBiZWNhdXNlIGRlZmF1bHQgc2VydmljZSBoYXMgY2hhbmdlZFwiKSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkRlZmF1bHRTZXJ2aWNlQ2hhbmdlZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhQXV0b1N5bmNFcnJvcihsb2NhbGl6ZSgnc2VydmljZSBjaGFuZ2VkJywgXCJDYW5ub3Qgc3luYyBiZWNhdXNlIHN5bmMgc2VydmljZSBoYXMgY2hhbmdlZFwiKSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlNlcnZpY2VDaGFuZ2VkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gU3luYyB3YXMgdHVybmVkIG9mZiBpbiB0aGUgY2xvdWRcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhQXV0b1N5bmNFcnJvcihsb2NhbGl6ZSgndHVybmVkIG9mZicsIFwiQ2Fubm90IHN5bmMgYmVjYXVzZSBzeW5jaW5nIGlzIHR1cm5lZCBvZmYgaW4gdGhlIGNsb3VkXCIpLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVHVybmVkT2ZmKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChzZXNzaW9uSWRLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0Ly8gU2VydmVyIHNlc3Npb24gaXMgZGlmZmVyZW50IGZyb20gY2xpZW50IHNlc3Npb25cblx0XHRpZiAoc2Vzc2lvbklkICYmIHRoaXMubWFuaWZlc3QgJiYgc2Vzc2lvbklkICE9PSB0aGlzLm1hbmlmZXN0LnNlc3Npb24pIHtcblx0XHRcdGlmICh0aGlzLmhhc1N5bmNTZXJ2aWNlQ2hhbmdlZCgpKSB7XG5cdFx0XHRcdGlmIChhd2FpdCB0aGlzLmhhc0RlZmF1bHRTZXJ2aWNlQ2hhbmdlZCgpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhQXV0b1N5bmNFcnJvcihsb2NhbGl6ZSgnZGVmYXVsdCBzZXJ2aWNlIGNoYW5nZWQnLCBcIkNhbm5vdCBzeW5jIGJlY2F1c2UgZGVmYXVsdCBzZXJ2aWNlIGhhcyBjaGFuZ2VkXCIpLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuRGVmYXVsdFNlcnZpY2VDaGFuZ2VkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFBdXRvU3luY0Vycm9yKGxvY2FsaXplKCdzZXJ2aWNlIGNoYW5nZWQnLCBcIkNhbm5vdCBzeW5jIGJlY2F1c2Ugc3luYyBzZXJ2aWNlIGhhcyBjaGFuZ2VkXCIpLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuU2VydmljZUNoYW5nZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFBdXRvU3luY0Vycm9yKGxvY2FsaXplKCdzZXNzaW9uIGV4cGlyZWQnLCBcIkNhbm5vdCBzeW5jIGJlY2F1c2UgY3VycmVudCBzZXNzaW9uIGlzIGV4cGlyZWRcIiksIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5TZXNzaW9uRXhwaXJlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFjaGluZXMgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZS5nZXRNYWNoaW5lcyh0aGlzLm1hbmlmZXN0IHx8IHVuZGVmaW5lZCk7XG5cdFx0Ly8gUmV0dXJuIGlmIGNhbmNlbGxhdGlvbiBpcyByZXF1ZXN0ZWRcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50TWFjaGluZSA9IG1hY2hpbmVzLmZpbmQobWFjaGluZSA9PiBtYWNoaW5lLmlzQ3VycmVudCk7XG5cdFx0Ly8gQ2hlY2sgaWYgc3luYyB3YXMgdHVybmVkIG9mZiBmcm9tIG90aGVyIG1hY2hpbmVcblx0XHRpZiAoY3VycmVudE1hY2hpbmU/LmRpc2FibGVkKSB7XG5cdFx0XHQvLyBUaHJvdyBUdXJuZWRPZmYgZXJyb3Jcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YUF1dG9TeW5jRXJyb3IobG9jYWxpemUoJ3R1cm5lZCBvZmYgbWFjaGluZScsIFwiQ2Fubm90IHN5bmMgYmVjYXVzZSBzeW5jaW5nIGlzIHR1cm5lZCBvZmYgb24gdGhpcyBtYWNoaW5lIGZyb20gYW5vdGhlciBtYWNoaW5lLlwiKSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlR1cm5lZE9mZik7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnRUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cdFx0YXdhaXQgdGhpcy5zeW5jVGFzay5ydW4oKTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7XG5cdFx0XHRkdXJhdGlvbjogbnVtYmVyO1xuXHRcdH0sIHtcblx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0Y29tbWVudDogJ1JlcG9ydCB3aGVuIHJ1bm5pbmcgYSBzeW5jIG9wZXJhdGlvbic7XG5cdFx0XHRkdXJhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RpbWUgdGFrZW4gdG8gcnVuIHN5bmMgb3BlcmF0aW9uJyB9O1xuXHRcdH0+KCdzZXR0aW5nc1N5bmM6c3luYycsIHsgZHVyYXRpb246IG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gc3RhcnRUaW1lIH0pO1xuXG5cdFx0Ly8gQWZ0ZXIgc3luY2luZywgZ2V0IHRoZSBtYW5pZmVzdCBpZiBpdCB3YXMgbm90IGF2YWlsYWJsZSBiZWZvcmVcblx0XHRpZiAodGhpcy5tYW5pZmVzdCA9PT0gbnVsbCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5tYW5pZmVzdCA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLm1hbmlmZXN0KG51bGwpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhQXV0b1N5bmNFcnJvcih0b0Vycm9yTWVzc2FnZShlcnJvciksIGVycm9yIGluc3RhbmNlb2YgVXNlckRhdGFTeW5jRXJyb3IgPyBlcnJvci5jb2RlIDogVXNlckRhdGFTeW5jRXJyb3JDb2RlLlVua25vd24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBsb2NhbCBzZXNzaW9uIGlkXG5cdFx0aWYgKHRoaXMubWFuaWZlc3QgJiYgdGhpcy5tYW5pZmVzdC5zZXNzaW9uICE9PSBzZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoc2Vzc2lvbklkS2V5LCB0aGlzLm1hbmlmZXN0LnNlc3Npb24sIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9XG5cblx0XHQvLyBSZXR1cm4gaWYgY2FuY2VsbGF0aW9uIGlzIHJlcXVlc3RlZFxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBjdXJyZW50IG1hY2hpbmVcblx0XHRpZiAoIWN1cnJlbnRNYWNoaW5lKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZS5hZGRDdXJyZW50TWFjaGluZSh0aGlzLm1hbmlmZXN0IHx8IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cmVnaXN0ZXI8VCBleHRlbmRzIElEaXNwb3NhYmxlPih0OiBUKTogVCB7XG5cdFx0cmV0dXJuIHN1cGVyLl9yZWdpc3Rlcih0KTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQTRCLHlCQUF5QixtQkFBbUIsa0JBQWtCLGVBQWU7QUFFekcsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUF5QixtQkFBbUIsb0JBQW9CO0FBQ3pFLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQXlFLHlCQUF5QixnQ0FBZ0Msc0JBQXNCLHFDQUFxQywyQkFBMkIsdUJBQXVCLG1CQUFtQiw2QkFBMEM7QUFDNVMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxvQ0FBb0M7QUFFN0MsTUFBTSw4QkFBOEI7QUFDcEMsTUFBTSxlQUFlO0FBQ3JCLE1BQU0sY0FBYztBQUNwQixNQUFNLG9CQUFvQjtBQUVuQixJQUFNLDBCQUFOLGNBQXNDLFdBQStDO0FBQUEsRUFzQzNGLFlBQ2tCLGdCQUNxQyxvQ0FDViwwQkFDSywrQkFDVixxQkFDRyxZQUNJLDRCQUNWLGtCQUNXLDZCQUNiLGdCQUNVLDBCQUMzQztBQUNELFVBQU07QUFYZ0Q7QUFDVjtBQUNLO0FBQ1Y7QUFDRztBQUNJO0FBQ1Y7QUFDVztBQUNiO0FBQ1U7QUE3QzdDLFNBQWlC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
