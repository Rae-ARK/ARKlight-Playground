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
import * as os from "os";
import { IntervalTimer, Throttler, timeout } from "../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { isMacintosh, isWindows } from "../../../base/common/platform.js";
import { getWindowsReleaseSync } from "../../../base/node/windowsVersion.js";
import { IMeteredConnectionService } from "../../meteredConnection/common/meteredConnection.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { ILifecycleMainService, LifecycleMainPhase } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { IRequestService } from "../../request/common/request.js";
import { StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { IApplicationStorageMainService } from "../../storage/electron-main/storageMainService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { DisablementReason, State, StateType, UpdateType } from "../common/update.js";
const LAST_KNOWN_VERSION_STORAGE_KEY = "abstractUpdateService/lastKnownVersion";
function createUpdateURL(baseUpdateUrl, platform, quality, commit, options) {
  const url = new URL(`${baseUpdateUrl}/api/update/${platform}/${quality}/${commit}`);
  if (options?.background) {
    url.searchParams.set("bg", "true");
  }
  url.searchParams.set("u", options?.internalOrg ?? "none");
  return url.toString();
}
function getUpdateRequestHeaders(productVersion) {
  if (isMacintosh) {
    const darwinVersion = os.release();
    return {
      "User-Agent": `Code/${productVersion} Darwin/${darwinVersion}`
    };
  }
  if (isWindows) {
    const match = getWindowsReleaseSync().match(/^(\d+\.\d+)/);
    if (match) {
      return {
        "User-Agent": `Code/${productVersion} Electron/${process.versions.electron} Windows NT ${match[1]}`
      };
    }
  }
  return void 0;
}
function isCancellableState(type) {
  switch (type) {
    case StateType.CheckingForUpdates:
    case StateType.AvailableForDownload:
    case StateType.Downloading:
    case StateType.Downloaded:
    case StateType.Updating:
    case StateType.Ready:
    case StateType.Overwriting:
      return true;
    default:
      return false;
  }
}
let AbstractUpdateService = class extends Disposable {
  constructor(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService, telemetryService, applicationStorageMainService, meteredConnectionService, supportsUpdateOverwrite) {
    super();
    this.lifecycleMainService = lifecycleMainService;
    this.configurationService = configurationService;
    this.environmentMainService = environmentMainService;
    this.requestService = requestService;
    this.logService = logService;
    this.productService = productService;
    this.telemetryService = telemetryService;
    this.applicationStorageMainService = applicationStorageMainService;
    this.meteredConnectionService = meteredConnectionService;
    this.supportsUpdateOverwrite = supportsUpdateOverwrite;
    this._state = State.Uninitialized;
    this._overwrite = false;
    this._hasCheckedForOverwriteOnQuit = false;
    this.overwriteUpdatesCheckInterval = this._register(new IntervalTimer());
    this._internalOrg = void 0;
    /** Disabled for a non-reversible reason (e.g. not built, missing config); ignores `update.mode` changes. */
    this._disabledPermanently = false;
    /** Whether one-time platform init (e.g. background update GC, pending update resume) has run. */
    this._postInitialized = false;
    /** Cancels the pending scheduled update check, if any. */
    this.scheduler = this._register(new MutableDisposable());
    /** Serializes reconfiguration so overlapping `update.mode` changes settle on the latest value. */
    this.reconfigureThrottler = this._register(new Throttler());
    this._onStateChange = this._register(new Emitter());
    this.onStateChange = this._onStateChange.event;
    lifecycleMainService.when(LifecycleMainPhase.AfterWindowOpen).finally(() => this.initialize());
  }
  get state() {
    return this._state;
  }
  setState(state) {
    if (state.type === StateType.Updating) {
      this.logService.trace("update#setState", state.type);
    } else {
      this.logService.info("update#setState", state.type);
    }
    this._state = state;
    this._onStateChange.fire(state);
    if (state.type === StateType.Idle && (state.error || state.notAvailable)) {
      this._state = State.Idle(state.updateType);
    }
    if (this.supportsUpdateOverwrite) {
      if (state.type === StateType.Ready) {
        this.overwriteUpdatesCheckInterval.cancelAndSet(() => this.checkForOverwriteUpdates(), 5 * 60 * 1e3);
      } else {
        this.overwriteUpdatesCheckInterval.cancel();
      }
    }
  }
  /**
   * This must be called before any other call. This is a performance
   * optimization, to avoid using extra CPU cycles before first window open.
   * https://github.com/microsoft/vscode/issues/89784
   */
  async initialize() {
    if (!this.environmentMainService.isBuilt) {
      this.setDisabledPermanently(DisablementReason.NotBuilt);
      return;
    }
    await this.trackVersionChange();
    if (this.environmentMainService.disableUpdates) {
      this.setDisabledPermanently(DisablementReason.DisabledByEnvironment);
      this.logService.info("update#ctor - updates are disabled by the environment");
      return;
    }
    if (!this.productService.updateUrl || !this.productService.commit) {
      this.setDisabledPermanently(DisablementReason.MissingConfiguration);
      this.logService.info("update#ctor - updates are disabled as there is no update URL");
      return;
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("update.mode")) {
        this.reconfigure().catch((err) => this.logService.error("update#reconfigure - failed to apply update mode change", err));
      }
    }));
    await this.reconfigure();
  }
  /**
   * Evaluates the current `update.mode` setting (and its policy) and brings the service into the matching state.
   * Runs on startup and on every change, enabling or disabling updates without a restart.
   */
  reconfigure() {
    return this.reconfigureThrottler.queue(() => this.doReconfigure());
  }
  async doReconfigure() {
    if (this._disabledPermanently) {
      return;
    }
    const updateMode = this.configurationService.getValue("update.mode");
    const updateModeInspection = this.configurationService.inspect("update.mode");
    const policyDisablesUpdates = updateModeInspection.policyValue !== void 0 && !this.getProductQuality(updateModeInspection.policyValue);
    const quality = this.getProductQuality(updateMode);
    if (!quality) {
      const reason = policyDisablesUpdates ? DisablementReason.Policy : DisablementReason.ManuallyDisabled;
      if (this._state.type === StateType.Disabled && this._state.reason === reason) {
        return;
      }
      await this.disable(reason);
      return;
    }
    if (!this.buildUpdateFeedUrl(quality, this.productService.commit)) {
      this.setDisabledPermanently(DisablementReason.InvalidConfiguration);
      this.logService.info("update#ctor - updates are disabled as the update URL is badly formed");
      return;
    }
    this.quality = quality;
    if (this._state.type === StateType.Disabled || this._state.type === StateType.Uninitialized) {
      this.setState(State.Idle(this.getUpdateType()));
    }
    if (!this._postInitialized) {
      this._postInitialized = true;
      await this.postInitialize();
    }
    this.scheduleAccordingToMode(updateMode);
  }
  /**
   * Disables updates for a reversible reason (user preference or policy), cancelling the scheduled check loop
   * and any in-flight or pending update before moving to Disabled.
   */
  async disable(reason) {
    this.scheduler.clear();
    if (isCancellableState(this._state.type)) {
      this.setState(State.Cancelling);
    }
    try {
      await this.cancelUpdate();
    } catch (err) {
      this.logService.warn("update#disable - failed to cancel pending update", err);
    }
    this.quality = void 0;
    if (reason === DisablementReason.Policy) {
      this.logService.info("update#disable - updates are disabled by policy");
    } else {
      this.logService.info("update#disable - updates are disabled by user preference");
    }
    this.setState(State.Disabled(reason));
  }
  /** Disables updates for a non-reversible reason; subsequent `update.mode` changes are ignored. */
  setDisabledPermanently(reason) {
    this._disabledPermanently = true;
    this.scheduler.clear();
    this.setState(State.Disabled(reason));
  }
  scheduleAccordingToMode(updateMode) {
    this.scheduler.clear();
    if (updateMode === "manual") {
      this.logService.info("update#ctor - manual checks only; automatic updates are disabled by user preference");
      return;
    }
    if (updateMode === "start") {
      this.logService.info("update#ctor - startup checks only; automatic updates are disabled by user preference");
      this.scheduleCheckForUpdates(30 * 1e3, false);
    } else {
      this.scheduleCheckForUpdates(30 * 1e3, true);
    }
  }
  async trackVersionChange() {
    await this.applicationStorageMainService.whenReady;
    let from;
    const raw = this.applicationStorageMainService.get(LAST_KNOWN_VERSION_STORAGE_KEY, StorageScope.APPLICATION);
    if (typeof raw === "string") {
      try {
        from = JSON.parse(raw);
      } catch (error) {
      }
    }
    const to = {
      version: this.productService.version,
      commit: this.productService.commit,
      timestamp: Date.now()
    };
    if (from?.commit === to.commit) {
      return;
    }
    this.applicationStorageMainService.store(LAST_KNOWN_VERSION_STORAGE_KEY, JSON.stringify(to), StorageScope.APPLICATION, StorageTarget.MACHINE);
    if (!from) {
      return;
    }
    this.telemetryService.publicLog2("update:versionChanged", {
      fromVersion: from.version,
      fromCommit: from.commit,
      fromVersionTime: from.timestamp,
      toVersion: to.version,
      toCommit: to.commit,
      timeToUpdateMs: to.timestamp - from.timestamp,
      updateMode: this.configurationService.getValue("update.mode")
    });
  }
  getProductQuality(updateMode) {
    return updateMode === "none" ? void 0 : this.productService.quality;
  }
  scheduleCheckForUpdates(delay = 60 * 60 * 1e3, repeat = true) {
    const promise = timeout(delay);
    this.scheduler.value = toDisposable(() => promise.cancel());
    promise.then(() => this.checkForUpdates(false)).then(() => {
      if (repeat) {
        this.scheduleCheckForUpdates(60 * 60 * 1e3, true);
      }
    }).catch((err) => {
      if (!isCancellationError(err)) {
        this.logService.error(err);
      }
    });
  }
  async checkForUpdates(explicit) {
    this.logService.trace("update#checkForUpdates, state = ", this.state.type);
    if (this.state.type !== StateType.Idle) {
      return;
    }
    this.doCheckForUpdates(explicit);
  }
  async downloadUpdate(explicit) {
    this.logService.trace("update#downloadUpdate, state = ", this.state.type);
    if (this.state.type !== StateType.AvailableForDownload) {
      return;
    }
    if (!explicit && this.meteredConnectionService.isConnectionMetered) {
      this.logService.info("update#downloadUpdate - skipping download because connection is metered");
      return;
    }
    await this.doDownloadUpdate(this.state);
  }
  async doDownloadUpdate(state) {
  }
  async applyUpdate() {
    this.logService.trace("update#applyUpdate, state = ", this.state.type);
    if (this.state.type !== StateType.Downloaded) {
      return;
    }
    await this.doApplyUpdate();
  }
  async doApplyUpdate() {
  }
  async quitAndInstall() {
    this.logService.trace("update#quitAndInstall, state = ", this.state.type);
    if (this.state.type !== StateType.Ready) {
      return void 0;
    }
    if (this.supportsUpdateOverwrite && !this._hasCheckedForOverwriteOnQuit) {
      this._hasCheckedForOverwriteOnQuit = true;
      const didOverwrite = await this.checkForOverwriteUpdates(true);
      if (didOverwrite) {
        this.logService.info("update#quitAndInstall(): overwrite update detected, postponing quitAndInstall");
        return;
      }
    }
    const readyState = this.state;
    this.setState(State.Restarting(this.state.update));
    this.logService.trace("update#quitAndInstall(): before lifecycle quit()");
    this.lifecycleMainService.quit(
      true
      /* will restart */
    ).then((vetod) => {
      this.logService.trace(`update#quitAndInstall(): after lifecycle quit() with veto: ${vetod}`);
      if (vetod) {
        this.logService.info("update#quitAndInstall(): quit was vetoed, restoring Ready state");
        this.setState(readyState);
        return;
      }
      this.logService.trace("update#quitAndInstall(): running raw#quitAndInstall()");
      this.doQuitAndInstall();
    });
    return Promise.resolve(void 0);
  }
  async checkForOverwriteUpdates(explicit = false) {
    if (this._state.type !== StateType.Ready) {
      return false;
    }
    const pendingUpdateCommit = this._state.update.version;
    if (!pendingUpdateCommit || pendingUpdateCommit === "unknown") {
      return false;
    }
    let isLatest;
    try {
      const cts = new CancellationTokenSource();
      const timeoutPromise = timeout(2e3).then(() => {
        cts.cancel();
        return void 0;
      });
      isLatest = await Promise.race([this.isLatestVersion(pendingUpdateCommit, cts.token), timeoutPromise]);
      cts.dispose();
    } catch (error) {
      this.logService.warn("update#checkForOverwriteUpdates(): failed to check for updates, proceeding with restart");
      this.logService.warn(error);
      return false;
    }
    if (isLatest === false && this._state.type === StateType.Ready) {
      this.logService.info("update#readyStateCheck: newer update available, restarting update machinery");
      try {
        await this.cancelPendingUpdate();
      } catch (error) {
        this.logService.error("update#checkForOverwriteUpdates(): failed to cancel pending update, aborting overwrite");
        this.logService.error(error);
        return false;
      }
      this._overwrite = true;
      this.setState(State.Overwriting(this._state.update, explicit));
      this.doCheckForUpdates(explicit, pendingUpdateCommit);
      return true;
    }
    return false;
  }
  async isLatestVersion(commit, token = CancellationToken.None) {
    if (!this.quality) {
      return void 0;
    }
    const mode = this.configurationService.getValue("update.mode");
    if (mode === "none") {
      return void 0;
    }
    const url = this.buildUpdateFeedUrl(this.quality, commit ?? this.productService.commit, { internalOrg: this.getInternalOrg() });
    if (!url) {
      return void 0;
    }
    const headers = getUpdateRequestHeaders(this.productService.version);
    this.logService.trace("update#isLatestVersion() - checking update server", { url, headers });
    try {
      const context = await this.requestService.request({ url, headers, callSite: "updateService.isLatestVersion" }, token);
      const statusCode = context.res.statusCode;
      this.logService.trace("update#isLatestVersion() - response", { statusCode });
      return statusCode === 204;
    } catch (error) {
      this.logService.error("update#isLatestVersion(): failed to check for updates");
      this.logService.error(error);
      return void 0;
    }
  }
  async _applySpecificUpdate(packagePath) {
  }
  async setInternalOrg(internalOrg) {
    if (this._internalOrg === internalOrg) {
      return;
    }
    this.logService.info("update#setInternalOrg", internalOrg);
    this._internalOrg = internalOrg;
  }
  getInternalOrg() {
    return this._internalOrg;
  }
  getUpdateType() {
    return UpdateType.Archive;
  }
  doQuitAndInstall() {
  }
  async postInitialize() {
  }
  async cancelPendingUpdate() {
  }
  /**
   * Aborts in-flight or pending update work when updates are being disabled at runtime. The default cancels a
   * pending update; platform services override this to also abort in-flight checks/downloads.
   */
  async cancelUpdate() {
    await this.cancelPendingUpdate();
  }
};
AbstractUpdateService = __decorateClass([
  __decorateParam(0, ILifecycleMainService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IEnvironmentMainService),
  __decorateParam(3, IRequestService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IProductService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IApplicationStorageMainService),
  __decorateParam(8, IMeteredConnectionService)
], AbstractUpdateService);
export {
  AbstractUpdateService,
  createUpdateURL,
  getUpdateRequestHeaders
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VwZGF0ZS9lbGVjdHJvbi1tYWluL2Fic3RyYWN0VXBkYXRlU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBJbnRlcnZhbFRpbWVyLCBUaHJvdHRsZXIsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBnZXRXaW5kb3dzUmVsZWFzZVN5bmMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvd2luZG93c1ZlcnNpb24uanMnO1xuaW1wb3J0IHsgSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL21ldGVyZWRDb25uZWN0aW9uL2NvbW1vbi9tZXRlcmVkQ29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvZWxlY3Ryb24tbWFpbi9lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVNYWluU2VydmljZSwgTGlmZWN5Y2xlTWFpblBoYXNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2VsZWN0cm9uLW1haW4vbGlmZWN5Y2xlTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9lbGVjdHJvbi1tYWluL3N0b3JhZ2VNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEF2YWlsYWJsZUZvckRvd25sb2FkLCBEaXNhYmxlbWVudFJlYXNvbiwgSVVwZGF0ZVNlcnZpY2UsIFN0YXRlLCBTdGF0ZVR5cGUsIFVwZGF0ZVR5cGUgfSBmcm9tICcuLi9jb21tb24vdXBkYXRlLmpzJztcblxuY29uc3QgTEFTVF9LTk9XTl9WRVJTSU9OX1NUT1JBR0VfS0VZID0gJ2Fic3RyYWN0VXBkYXRlU2VydmljZS9sYXN0S25vd25WZXJzaW9uJztcblxuZXhwb3J0IGludGVyZmFjZSBJVXBkYXRlVVJMT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGJhY2tncm91bmQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBpbnRlcm5hbE9yZz86IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVVwZGF0ZVVSTChiYXNlVXBkYXRlVXJsOiBzdHJpbmcsIHBsYXRmb3JtOiBzdHJpbmcsIHF1YWxpdHk6IHN0cmluZywgY29tbWl0OiBzdHJpbmcsIG9wdGlvbnM/OiBJVXBkYXRlVVJMT3B0aW9ucyk6IHN0cmluZyB7XG5cdGNvbnN0IHVybCA9IG5ldyBVUkwoYCR7YmFzZVVwZGF0ZVVybH0vYXBpL3VwZGF0ZS8ke3BsYXRmb3JtfS8ke3F1YWxpdHl9LyR7Y29tbWl0fWApO1xuXG5cdGlmIChvcHRpb25zPy5iYWNrZ3JvdW5kKSB7XG5cdFx0dXJsLnNlYXJjaFBhcmFtcy5zZXQoJ2JnJywgJ3RydWUnKTtcblx0fVxuXG5cdHVybC5zZWFyY2hQYXJhbXMuc2V0KCd1Jywgb3B0aW9ucz8uaW50ZXJuYWxPcmcgPz8gJ25vbmUnKTtcblxuXHRyZXR1cm4gdXJsLnRvU3RyaW5nKCk7XG59XG5cbi8qKlxuICogQnVpbGRzIGNvbW1vbiBoZWFkZXJzIGZvciB1cGRhdGUgcmVxdWVzdHMsIGluY2x1ZGluZyB0aG9zZSBpc3N1ZWRcbiAqIHZpYSBFbGVjdHJvbidzIGF1dG8tdXBkYXRlciAoZS5nLiBzZXRGZWVkVVJMKHsgdXJsLCBoZWFkZXJzIH0pKSBhbmRcbiAqIG1hbnVhbCBIVFRQIHJlcXVlc3RzIHRoYXQgYnlwYXNzIHRoZSBhdXRvLXVwZGF0ZXIuIFRoZSBoZWFkZXJzIGluY2x1ZGVcbiAqIE9TIHZlcnNpb24gaW5mb3JtYXRpb24gd2hpY2ggdGhlIHVwZGF0ZSBzZXJ2ZXIgdXNlcyBmb3IgRU9MIGRldGVjdGlvbi5cbiAqXG4gKiBPbiBtYWNPUywgdGhlIFVzZXItQWdlbnQgaW5jbHVkZXMgdGhlIERhcndpbiBrZXJuZWwgdmVyc2lvbi5cbiAqIE9uIFdpbmRvd3MsIHRoZSBVc2VyLUFnZW50IGluY2x1ZGVzIGFjY3VyYXRlIFdpbmRvd3MgdmVyc2lvbiBmcm9tIHRoZSByZWdpc3RyeS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFVwZGF0ZVJlcXVlc3RIZWFkZXJzKHByb2R1Y3RWZXJzaW9uOiBzdHJpbmcpOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkIHtcblx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0Y29uc3QgZGFyd2luVmVyc2lvbiA9IG9zLnJlbGVhc2UoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0J1VzZXItQWdlbnQnOiBgQ29kZS8ke3Byb2R1Y3RWZXJzaW9ufSBEYXJ3aW4vJHtkYXJ3aW5WZXJzaW9ufWBcblx0XHR9O1xuXHR9XG5cblx0aWYgKGlzV2luZG93cykge1xuXHRcdGNvbnN0IG1hdGNoID0gZ2V0V2luZG93c1JlbGVhc2VTeW5jKCkubWF0Y2goL14oXFxkK1xcLlxcZCspLyk7XG5cdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQnVXNlci1BZ2VudCc6IGBDb2RlLyR7cHJvZHVjdFZlcnNpb259IEVsZWN0cm9uLyR7cHJvY2Vzcy52ZXJzaW9ucy5lbGVjdHJvbn0gV2luZG93cyBOVCAke21hdGNoWzFdfWBcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IHR5cGUgVXBkYXRlRXJyb3JDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdqb2FvbW9yZW5vJztcblx0bWVzc2FnZUhhc2g6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaGFzaCBvZiB0aGUgZXJyb3IgbWVzc2FnZS4nIH07XG5cdGNvbW1lbnQ6ICdUaGlzIGlzIHVzZWQgdG8ga25vdyBob3cgb2Z0ZW4gVlMgQ29kZSB1cGRhdGVzIGhhdmUgZmFpbGVkLic7XG59O1xuXG4vKipcbiAqIFN0YXRlcyByZXByZXNlbnRpbmcgaW4tZmxpZ2h0IG9yIHBlbmRpbmcgdXBkYXRlIHdvcmsgdGhhdCB0YWtlcyB0aW1lIHRvIHRlYXIgZG93biB3aGVuIHVwZGF0ZXNcbiAqIGFyZSBkaXNhYmxlZCBhdCBydW50aW1lLiBVc2VkIHRvIGRlY2lkZSB3aGV0aGVyIHRvIHN1cmZhY2UgYSB0cmFuc2llbnQgYENhbmNlbGxpbmdgIHN0YXRlLlxuICovXG5mdW5jdGlvbiBpc0NhbmNlbGxhYmxlU3RhdGUodHlwZTogU3RhdGVUeXBlKTogYm9vbGVhbiB7XG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgU3RhdGVUeXBlLkNoZWNraW5nRm9yVXBkYXRlczpcblx0XHRjYXNlIFN0YXRlVHlwZS5BdmFpbGFibGVGb3JEb3dubG9hZDpcblx0XHRjYXNlIFN0YXRlVHlwZS5Eb3dubG9hZGluZzpcblx0XHRjYXNlIFN0YXRlVHlwZS5Eb3dubG9hZGVkOlxuXHRcdGNhc2UgU3RhdGVUeXBlLlVwZGF0aW5nOlxuXHRcdGNhc2UgU3RhdGVUeXBlLlJlYWR5OlxuXHRcdGNhc2UgU3RhdGVUeXBlLk92ZXJ3cml0aW5nOlxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RVcGRhdGVTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElVcGRhdGVTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgcXVhbGl0eTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3N0YXRlOiBTdGF0ZSA9IFN0YXRlLlVuaW5pdGlhbGl6ZWQ7XG5cdHByb3RlY3RlZCBfb3ZlcndyaXRlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2hhc0NoZWNrZWRGb3JPdmVyd3JpdGVPblF1aXQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBvdmVyd3JpdGVVcGRhdGVzQ2hlY2tJbnRlcnZhbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnRlcnZhbFRpbWVyKCkpO1xuXHRwcml2YXRlIF9pbnRlcm5hbE9yZzogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdC8qKiBEaXNhYmxlZCBmb3IgYSBub24tcmV2ZXJzaWJsZSByZWFzb24gKGUuZy4gbm90IGJ1aWx0LCBtaXNzaW5nIGNvbmZpZyk7IGlnbm9yZXMgYHVwZGF0ZS5tb2RlYCBjaGFuZ2VzLiAqL1xuXHRwcml2YXRlIF9kaXNhYmxlZFBlcm1hbmVudGx5OiBib29sZWFuID0gZmFsc2U7XG5cdC8qKiBXaGV0aGVyIG9uZS10aW1lIHBsYXRmb3JtIGluaXQgKGUuZy4gYmFja2dyb3VuZCB1cGRhdGUgR0MsIHBlbmRpbmcgdXBkYXRlIHJlc3VtZSkgaGFzIHJ1bi4gKi9cblx0cHJpdmF0ZSBfcG9zdEluaXRpYWxpemVkOiBib29sZWFuID0gZmFsc2U7XG5cdC8qKiBDYW5jZWxzIHRoZSBwZW5kaW5nIHNjaGVkdWxlZCB1cGRhdGUgY2hlY2ssIGlmIGFueS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBzY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHQvKiogU2VyaWFsaXplcyByZWNvbmZpZ3VyYXRpb24gc28gb3ZlcmxhcHBpbmcgYHVwZGF0ZS5tb2RlYCBjaGFuZ2VzIHNldHRsZSBvbiB0aGUgbGF0ZXN0IHZhbHVlLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlY29uZmlndXJlVGhyb3R0bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlcigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblN0YXRlQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U3RhdGU+KCkpO1xuXHRyZWFkb25seSBvblN0YXRlQ2hhbmdlOiBFdmVudDxTdGF0ZT4gPSB0aGlzLl9vblN0YXRlQ2hhbmdlLmV2ZW50O1xuXG5cdGdldCBzdGF0ZSgpOiBTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXRlO1xuXHR9XG5cblx0cHJvdGVjdGVkIHNldFN0YXRlKHN0YXRlOiBTdGF0ZSk6IHZvaWQge1xuXHRcdGlmIChzdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuVXBkYXRpbmcpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgndXBkYXRlI3NldFN0YXRlJywgc3RhdGUudHlwZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCd1cGRhdGUjc2V0U3RhdGUnLCBzdGF0ZS50eXBlKTtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLl9vblN0YXRlQ2hhbmdlLmZpcmUoc3RhdGUpO1xuXG5cdFx0Ly8gQ2xlYXIgdHJhbnNpZW50IG9uZS10aW1lIHByb3BlcnRpZXMgZnJvbSBJZGxlIHN0YXRlIGFmdGVyIGRlbGl2ZXJpbmcgdGhlIGV2ZW50LlxuXHRcdC8vIFRoaXMgcHJldmVudHMgbmV3IHdpbmRvd3MgZnJvbSBzZWVpbmcgc3RhbGUgZXJyb3Ivbm90QXZhaWxhYmxlIG1lc3NhZ2VzLlxuXHRcdGlmIChzdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuSWRsZSAmJiAoc3RhdGUuZXJyb3IgfHwgc3RhdGUubm90QXZhaWxhYmxlKSkge1xuXHRcdFx0dGhpcy5fc3RhdGUgPSBTdGF0ZS5JZGxlKHN0YXRlLnVwZGF0ZVR5cGUpO1xuXHRcdH1cblxuXHRcdC8vIFNjaGVkdWxlIDUtbWludXRlIGNoZWNrcyB3aGVuIGluIFJlYWR5IHN0YXRlIGFuZCBvdmVyd3JpdGUgaXMgc3VwcG9ydGVkXG5cdFx0aWYgKHRoaXMuc3VwcG9ydHNVcGRhdGVPdmVyd3JpdGUpIHtcblx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuUmVhZHkpIHtcblx0XHRcdFx0dGhpcy5vdmVyd3JpdGVVcGRhdGVzQ2hlY2tJbnRlcnZhbC5jYW5jZWxBbmRTZXQoKCkgPT4gdGhpcy5jaGVja0Zvck92ZXJ3cml0ZVVwZGF0ZXMoKSwgNSAqIDYwICogMTAwMCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm92ZXJ3cml0ZVVwZGF0ZXNDaGVja0ludGVydmFsLmNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGxpZmVjeWNsZU1haW5TZXJ2aWNlOiBJTGlmZWN5Y2xlTWFpblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVudmlyb25tZW50TWFpblNlcnZpY2UgcHJvdGVjdGVkIGVudmlyb25tZW50TWFpblNlcnZpY2U6IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcHJvdGVjdGVkIHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByb3RlY3RlZCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElBcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgYXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2U6IElBcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSxcblx0XHRASU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlOiBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBzdXBwb3J0c1VwZGF0ZU92ZXJ3cml0ZTogYm9vbGVhbixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGxpZmVjeWNsZU1haW5TZXJ2aWNlLndoZW4oTGlmZWN5Y2xlTWFpblBoYXNlLkFmdGVyV2luZG93T3Blbilcblx0XHRcdC5maW5hbGx5KCgpID0+IHRoaXMuaW5pdGlhbGl6ZSgpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGlzIG11c3QgYmUgY2FsbGVkIGJlZm9yZSBhbnkgb3RoZXIgY2FsbC4gVGhpcyBpcyBhIHBlcmZvcm1hbmNlXG5cdCAqIG9wdGltaXphdGlvbiwgdG8gYXZvaWQgdXNpbmcgZXh0cmEgQ1BVIGN5Y2xlcyBiZWZvcmUgZmlyc3Qgd2luZG93IG9wZW4uXG5cdCAqIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy84OTc4NFxuXHQgKi9cblx0cHJvdGVjdGVkIGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuaXNCdWlsdCkge1xuXHRcdFx0dGhpcy5zZXREaXNhYmxlZFBlcm1hbmVudGx5KERpc2FibGVtZW50UmVhc29uLk5vdEJ1aWx0KTtcblx0XHRcdHJldHVybjsgLy8gdXBkYXRlcyBhcmUgbmV2ZXIgZW5hYmxlZCB3aGVuIHJ1bm5pbmcgb3V0IG9mIHNvdXJjZXNcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnRyYWNrVmVyc2lvbkNoYW5nZSgpO1xuXG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5kaXNhYmxlVXBkYXRlcykge1xuXHRcdFx0dGhpcy5zZXREaXNhYmxlZFBlcm1hbmVudGx5KERpc2FibGVtZW50UmVhc29uLkRpc2FibGVkQnlFbnZpcm9ubWVudCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygndXBkYXRlI2N0b3IgLSB1cGRhdGVzIGFyZSBkaXNhYmxlZCBieSB0aGUgZW52aXJvbm1lbnQnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMucHJvZHVjdFNlcnZpY2UudXBkYXRlVXJsIHx8ICF0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdCkge1xuXHRcdFx0dGhpcy5zZXREaXNhYmxlZFBlcm1hbmVudGx5KERpc2FibGVtZW50UmVhc29uLk1pc3NpbmdDb25maWd1cmF0aW9uKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCd1cGRhdGUjY3RvciAtIHVwZGF0ZXMgYXJlIGRpc2FibGVkIGFzIHRoZXJlIGlzIG5vIHVwZGF0ZSBVUkwnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZWFjdCB0byBydW50aW1lIGB1cGRhdGUubW9kZWAvcG9saWN5IGNoYW5nZXMgc28gc3dpdGNoaW5nIHRvL2Zyb20gYG5vbmVgIGFwcGxpZXMgd2l0aG91dCBhIHJlc3RhcnQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbigndXBkYXRlLm1vZGUnKSkge1xuXHRcdFx0XHR0aGlzLnJlY29uZmlndXJlKCkuY2F0Y2goZXJyID0+IHRoaXMubG9nU2VydmljZS5lcnJvcigndXBkYXRlI3JlY29uZmlndXJlIC0gZmFpbGVkIHRvIGFwcGx5IHVwZGF0ZSBtb2RlIGNoYW5nZScsIGVycikpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEFwcGx5IHRoZSBjdXJyZW50bHkgY29uZmlndXJlZCB1cGRhdGUgbW9kZS5cblx0XHRhd2FpdCB0aGlzLnJlY29uZmlndXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogRXZhbHVhdGVzIHRoZSBjdXJyZW50IGB1cGRhdGUubW9kZWAgc2V0dGluZyAoYW5kIGl0cyBwb2xpY3kpIGFuZCBicmluZ3MgdGhlIHNlcnZpY2UgaW50byB0aGUgbWF0Y2hpbmcgc3RhdGUuXG5cdCAqIFJ1bnMgb24gc3RhcnR1cCBhbmQgb24gZXZlcnkgY2hhbmdlLCBlbmFibGluZyBvciBkaXNhYmxpbmcgdXBkYXRlcyB3aXRob3V0IGEgcmVzdGFydC5cblx0ICovXG5cdHByaXZhdGUgcmVjb25maWd1cmUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMucmVjb25maWd1cmVUaHJvdHRsZXIucXVldWUoKCkgPT4gdGhpcy5kb1JlY29uZmlndXJlKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1JlY29uZmlndXJlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9kaXNhYmxlZFBlcm1hbmVudGx5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXBkYXRlTW9kZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J25vbmUnIHwgJ21hbnVhbCcgfCAnc3RhcnQnIHwgJ2RlZmF1bHQnPigndXBkYXRlLm1vZGUnKTtcblx0XHRjb25zdCB1cGRhdGVNb2RlSW5zcGVjdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDwnbm9uZScgfCAnbWFudWFsJyB8ICdzdGFydCcgfCAnZGVmYXVsdCc+KCd1cGRhdGUubW9kZScpO1xuXHRcdGNvbnN0IHBvbGljeURpc2FibGVzVXBkYXRlcyA9IHVwZGF0ZU1vZGVJbnNwZWN0aW9uLnBvbGljeVZhbHVlICE9PSB1bmRlZmluZWQgJiYgIXRoaXMuZ2V0UHJvZHVjdFF1YWxpdHkodXBkYXRlTW9kZUluc3BlY3Rpb24ucG9saWN5VmFsdWUpO1xuXHRcdGNvbnN0IHF1YWxpdHkgPSB0aGlzLmdldFByb2R1Y3RRdWFsaXR5KHVwZGF0ZU1vZGUpO1xuXG5cdFx0aWYgKCFxdWFsaXR5KSB7XG5cdFx0XHRjb25zdCByZWFzb24gPSBwb2xpY3lEaXNhYmxlc1VwZGF0ZXMgPyBEaXNhYmxlbWVudFJlYXNvbi5Qb2xpY3kgOiBEaXNhYmxlbWVudFJlYXNvbi5NYW51YWxseURpc2FibGVkO1xuXG5cdFx0XHQvLyBTa2lwIGlmIGFscmVhZHkgZGlzYWJsZWQgZm9yIHRoaXMgcmVhc29uLCBzbyBhIHJlcGVhdGVkIHdyaXRlIG9yIHBvbGljeSByZWZyZXNoIGlzIGEgbm8tb3AuXG5cdFx0XHRpZiAodGhpcy5fc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLkRpc2FibGVkICYmIHRoaXMuX3N0YXRlLnJlYXNvbiA9PT0gcmVhc29uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5kaXNhYmxlKHJlYXNvbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmJ1aWxkVXBkYXRlRmVlZFVybChxdWFsaXR5LCB0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdCEpKSB7XG5cdFx0XHR0aGlzLnNldERpc2FibGVkUGVybWFuZW50bHkoRGlzYWJsZW1lbnRSZWFzb24uSW52YWxpZENvbmZpZ3VyYXRpb24pO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ3VwZGF0ZSNjdG9yIC0gdXBkYXRlcyBhcmUgZGlzYWJsZWQgYXMgdGhlIHVwZGF0ZSBVUkwgaXMgYmFkbHkgZm9ybWVkJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5xdWFsaXR5ID0gcXVhbGl0eTtcblxuXHRcdC8vIE1vdmUgdG8gSWRsZSBzbyBvbmUtdGltZSBwbGF0Zm9ybSBpbml0ICh3aGljaCBtYXkgcmVzdW1lIGEgcGVuZGluZyB1cGRhdGUpIGNhbiBhY3Q7IGl0IHJlcXVpcmVzIElkbGUuXG5cdFx0aWYgKHRoaXMuX3N0YXRlLnR5cGUgPT09IFN0YXRlVHlwZS5EaXNhYmxlZCB8fCB0aGlzLl9zdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuVW5pbml0aWFsaXplZCkge1xuXHRcdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5JZGxlKHRoaXMuZ2V0VXBkYXRlVHlwZSgpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gT25lLXRpbWUgcGxhdGZvcm0gaW5pdCwgZ2F0ZWQgYmVoaW5kIHVwZGF0ZXMgYmVpbmcgZW5hYmxlZCBzbyBhIHBlbmRpbmcgdXBkYXRlIGlzIG5ldmVyIHJlc3VtZWQgdW5kZXIgYG5vbmVgLlxuXHRcdGlmICghdGhpcy5fcG9zdEluaXRpYWxpemVkKSB7XG5cdFx0XHR0aGlzLl9wb3N0SW5pdGlhbGl6ZWQgPSB0cnVlO1xuXHRcdFx0YXdhaXQgdGhpcy5wb3N0SW5pdGlhbGl6ZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2NoZWR1bGVBY2NvcmRpbmdUb01vZGUodXBkYXRlTW9kZSk7XG5cdH1cblxuXHQvKipcblx0ICogRGlzYWJsZXMgdXBkYXRlcyBmb3IgYSByZXZlcnNpYmxlIHJlYXNvbiAodXNlciBwcmVmZXJlbmNlIG9yIHBvbGljeSksIGNhbmNlbGxpbmcgdGhlIHNjaGVkdWxlZCBjaGVjayBsb29wXG5cdCAqIGFuZCBhbnkgaW4tZmxpZ2h0IG9yIHBlbmRpbmcgdXBkYXRlIGJlZm9yZSBtb3ZpbmcgdG8gRGlzYWJsZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGRpc2FibGUocmVhc29uOiBEaXNhYmxlbWVudFJlYXNvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc2NoZWR1bGVyLmNsZWFyKCk7XG5cblx0XHQvLyBTaG93IGEgdHJhbnNpZW50IENhbmNlbGxpbmcgc3RhdGUgb25seSB3aGVuIHRoZXJlIGlzIGluLWZsaWdodCBvciBwZW5kaW5nIHdvcmsgdG8gdGVhciBkb3duLlxuXHRcdGlmIChpc0NhbmNlbGxhYmxlU3RhdGUodGhpcy5fc3RhdGUudHlwZSkpIHtcblx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuQ2FuY2VsbGluZyk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuY2FuY2VsVXBkYXRlKCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybigndXBkYXRlI2Rpc2FibGUgLSBmYWlsZWQgdG8gY2FuY2VsIHBlbmRpbmcgdXBkYXRlJywgZXJyKTtcblx0XHR9XG5cblx0XHR0aGlzLnF1YWxpdHkgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAocmVhc29uID09PSBEaXNhYmxlbWVudFJlYXNvbi5Qb2xpY3kpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCd1cGRhdGUjZGlzYWJsZSAtIHVwZGF0ZXMgYXJlIGRpc2FibGVkIGJ5IHBvbGljeScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygndXBkYXRlI2Rpc2FibGUgLSB1cGRhdGVzIGFyZSBkaXNhYmxlZCBieSB1c2VyIHByZWZlcmVuY2UnKTtcblx0XHR9XG5cblx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLkRpc2FibGVkKHJlYXNvbikpO1xuXHR9XG5cblx0LyoqIERpc2FibGVzIHVwZGF0ZXMgZm9yIGEgbm9uLXJldmVyc2libGUgcmVhc29uOyBzdWJzZXF1ZW50IGB1cGRhdGUubW9kZWAgY2hhbmdlcyBhcmUgaWdub3JlZC4gKi9cblx0cHJpdmF0ZSBzZXREaXNhYmxlZFBlcm1hbmVudGx5KHJlYXNvbjogRGlzYWJsZW1lbnRSZWFzb24pOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNhYmxlZFBlcm1hbmVudGx5ID0gdHJ1ZTtcblx0XHR0aGlzLnNjaGVkdWxlci5jbGVhcigpO1xuXHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuRGlzYWJsZWQocmVhc29uKSk7XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlQWNjb3JkaW5nVG9Nb2RlKHVwZGF0ZU1vZGU6ICdub25lJyB8ICdtYW51YWwnIHwgJ3N0YXJ0JyB8ICdkZWZhdWx0Jyk6IHZvaWQge1xuXHRcdHRoaXMuc2NoZWR1bGVyLmNsZWFyKCk7XG5cblx0XHRpZiAodXBkYXRlTW9kZSA9PT0gJ21hbnVhbCcpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCd1cGRhdGUjY3RvciAtIG1hbnVhbCBjaGVja3Mgb25seTsgYXV0b21hdGljIHVwZGF0ZXMgYXJlIGRpc2FibGVkIGJ5IHVzZXIgcHJlZmVyZW5jZScpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh1cGRhdGVNb2RlID09PSAnc3RhcnQnKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygndXBkYXRlI2N0b3IgLSBzdGFydHVwIGNoZWNrcyBvbmx5OyBhdXRvbWF0aWMgdXBkYXRlcyBhcmUgZGlzYWJsZWQgYnkgdXNlciBwcmVmZXJlbmNlJyk7XG5cblx0XHRcdC8vIENoZWNrIGZvciB1cGRhdGVzIG9ubHkgb25jZSBhZnRlciAzMCBzZWNvbmRzXG5cdFx0XHR0aGlzLnNjaGVkdWxlQ2hlY2tGb3JVcGRhdGVzKDMwICogMTAwMCwgZmFsc2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBTdGFydCBjaGVja2luZyBmb3IgdXBkYXRlcyBhZnRlciAzMCBzZWNvbmRzXG5cdFx0XHR0aGlzLnNjaGVkdWxlQ2hlY2tGb3JVcGRhdGVzKDMwICogMTAwMCwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0cmFja1ZlcnNpb25DaGFuZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5hcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZS53aGVuUmVhZHk7XG5cblx0XHRpbnRlcmZhY2UgSUxhc3RLbm93blZlcnNpb24ge1xuXHRcdFx0cmVhZG9ubHkgdmVyc2lvbjogc3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgY29tbWl0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRyZWFkb25seSB0aW1lc3RhbXA6IG51bWJlcjtcblx0XHR9XG5cblx0XHRsZXQgZnJvbTogSUxhc3RLbm93blZlcnNpb24gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5hcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZS5nZXQoTEFTVF9LTk9XTl9WRVJTSU9OX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmICh0eXBlb2YgcmF3ID09PSAnc3RyaW5nJykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZnJvbSA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHRvOiBJTGFzdEtub3duVmVyc2lvbiA9IHtcblx0XHRcdHZlcnNpb246IHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbixcblx0XHRcdGNvbW1pdDogdGhpcy5wcm9kdWN0U2VydmljZS5jb21taXQsXG5cdFx0XHR0aW1lc3RhbXA6IERhdGUubm93KCksXG5cdFx0fTtcblxuXHRcdGlmIChmcm9tPy5jb21taXQgPT09IHRvLmNvbW1pdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuYXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2Uuc3RvcmUoTEFTVF9LTk9XTl9WRVJTSU9OX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeSh0byksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGlmICghZnJvbSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHR5cGUgVmVyc2lvbkNoYW5nZUV2ZW50ID0ge1xuXHRcdFx0ZnJvbVZlcnNpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGZyb21Db21taXQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGZyb21WZXJzaW9uVGltZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0dG9WZXJzaW9uOiBzdHJpbmc7XG5cdFx0XHR0b0NvbW1pdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0dGltZVRvVXBkYXRlTXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdHVwZGF0ZU1vZGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHR9O1xuXG5cdFx0dHlwZSBWZXJzaW9uQ2hhbmdlQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2RtaXRyaXYnO1xuXHRcdFx0Y29tbWVudDogJ0ZpcmVkIHdoZW4gVlMgQ29kZSBkZXRlY3RzIGEgdmVyc2lvbiBjaGFuZ2Ugb24gc3RhcnR1cC4nO1xuXHRcdFx0ZnJvbVZlcnNpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgcHJldmlvdXMgdmVyc2lvbiBvZiBWUyBDb2RlLicgfTtcblx0XHRcdGZyb21Db21taXQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY29tbWl0IGhhc2ggb2YgdGhlIHByZXZpb3VzIHZlcnNpb24uJyB9O1xuXHRcdFx0ZnJvbVZlcnNpb25UaW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGltZXN0YW1wIHdoZW4gdGhlIHByZXZpb3VzIHZlcnNpb24gd2FzIGZpcnN0IGRldGVjdGVkLicgfTtcblx0XHRcdHRvVmVyc2lvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBjdXJyZW50IHZlcnNpb24gb2YgVlMgQ29kZS4nIH07XG5cdFx0XHR0b0NvbW1pdDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBjb21taXQgaGFzaCBvZiB0aGUgY3VycmVudCB2ZXJzaW9uLicgfTtcblx0XHRcdHRpbWVUb1VwZGF0ZU1zOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTWlsbGlzZWNvbmRzIGJldHdlZW4gdGhlIHByZXZpb3VzIHZlcnNpb24gaW5zdGFsbCBhbmQgdGhpcyB2ZXJzaW9uIGluc3RhbGwuJyB9O1xuXHRcdFx0dXBkYXRlTW9kZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB1cGRhdGUgbW9kZSBjb25maWd1cmVkIGJ5IHRoZSB1c2VyLicgfTtcblx0XHR9O1xuXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8VmVyc2lvbkNoYW5nZUV2ZW50LCBWZXJzaW9uQ2hhbmdlQ2xhc3NpZmljYXRpb24+KCd1cGRhdGU6dmVyc2lvbkNoYW5nZWQnLCB7XG5cdFx0XHRmcm9tVmVyc2lvbjogZnJvbS52ZXJzaW9uLFxuXHRcdFx0ZnJvbUNvbW1pdDogZnJvbS5jb21taXQsXG5cdFx0XHRmcm9tVmVyc2lvblRpbWU6IGZyb20udGltZXN0YW1wLFxuXHRcdFx0dG9WZXJzaW9uOiB0by52ZXJzaW9uLFxuXHRcdFx0dG9Db21taXQ6IHRvLmNvbW1pdCxcblx0XHRcdHRpbWVUb1VwZGF0ZU1zOiB0by50aW1lc3RhbXAgLSBmcm9tLnRpbWVzdGFtcCxcblx0XHRcdHVwZGF0ZU1vZGU6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPigndXBkYXRlLm1vZGUnKSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHJvZHVjdFF1YWxpdHkodXBkYXRlTW9kZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdXBkYXRlTW9kZSA9PT0gJ25vbmUnID8gdW5kZWZpbmVkIDogdGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5O1xuXHR9XG5cblx0cHJpdmF0ZSBzY2hlZHVsZUNoZWNrRm9yVXBkYXRlcyhkZWxheSA9IDYwICogNjAgKiAxMDAwLCByZXBlYXQgPSB0cnVlKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8dm9pZD4gPSB0aW1lb3V0KGRlbGF5KTtcblx0XHR0aGlzLnNjaGVkdWxlci52YWx1ZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiBwcm9taXNlLmNhbmNlbCgpKTtcblxuXHRcdHByb21pc2Vcblx0XHRcdC50aGVuKCgpID0+IHRoaXMuY2hlY2tGb3JVcGRhdGVzKGZhbHNlKSlcblx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0aWYgKHJlcGVhdCkge1xuXHRcdFx0XHRcdC8vIENoZWNrIGFnYWluIGFmdGVyIDEgaG91clxuXHRcdFx0XHRcdHRoaXMuc2NoZWR1bGVDaGVja0ZvclVwZGF0ZXMoNjAgKiA2MCAqIDEwMDAsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdFx0LmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgY2hlY2tGb3JVcGRhdGVzKGV4cGxpY2l0OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd1cGRhdGUjY2hlY2tGb3JVcGRhdGVzLCBzdGF0ZSA9ICcsIHRoaXMuc3RhdGUudHlwZSk7XG5cblx0XHRpZiAodGhpcy5zdGF0ZS50eXBlICE9PSBTdGF0ZVR5cGUuSWRsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZG9DaGVja0ZvclVwZGF0ZXMoZXhwbGljaXQpO1xuXHR9XG5cblx0YXN5bmMgZG93bmxvYWRVcGRhdGUoZXhwbGljaXQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3VwZGF0ZSNkb3dubG9hZFVwZGF0ZSwgc3RhdGUgPSAnLCB0aGlzLnN0YXRlLnR5cGUpO1xuXG5cdFx0aWYgKHRoaXMuc3RhdGUudHlwZSAhPT0gU3RhdGVUeXBlLkF2YWlsYWJsZUZvckRvd25sb2FkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFleHBsaWNpdCAmJiB0aGlzLm1ldGVyZWRDb25uZWN0aW9uU2VydmljZS5pc0Nvbm5lY3Rpb25NZXRlcmVkKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygndXBkYXRlI2Rvd25sb2FkVXBkYXRlIC0gc2tpcHBpbmcgZG93bmxvYWQgYmVjYXVzZSBjb25uZWN0aW9uIGlzIG1ldGVyZWQnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmRvRG93bmxvYWRVcGRhdGUodGhpcy5zdGF0ZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZG9Eb3dubG9hZFVwZGF0ZShzdGF0ZTogQXZhaWxhYmxlRm9yRG93bmxvYWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBub29wXG5cdH1cblxuXHRhc3luYyBhcHBseVVwZGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3VwZGF0ZSNhcHBseVVwZGF0ZSwgc3RhdGUgPSAnLCB0aGlzLnN0YXRlLnR5cGUpO1xuXG5cdFx0aWYgKHRoaXMuc3RhdGUudHlwZSAhPT0gU3RhdGVUeXBlLkRvd25sb2FkZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmRvQXBwbHlVcGRhdGUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBkb0FwcGx5VXBkYXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdGFzeW5jIHF1aXRBbmRJbnN0YWxsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgndXBkYXRlI3F1aXRBbmRJbnN0YWxsLCBzdGF0ZSA9ICcsIHRoaXMuc3RhdGUudHlwZSk7XG5cblx0XHRpZiAodGhpcy5zdGF0ZS50eXBlICE9PSBTdGF0ZVR5cGUuUmVhZHkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc3VwcG9ydHNVcGRhdGVPdmVyd3JpdGUgJiYgIXRoaXMuX2hhc0NoZWNrZWRGb3JPdmVyd3JpdGVPblF1aXQpIHtcblx0XHRcdHRoaXMuX2hhc0NoZWNrZWRGb3JPdmVyd3JpdGVPblF1aXQgPSB0cnVlO1xuXHRcdFx0Y29uc3QgZGlkT3ZlcndyaXRlID0gYXdhaXQgdGhpcy5jaGVja0Zvck92ZXJ3cml0ZVVwZGF0ZXModHJ1ZSk7XG5cblx0XHRcdGlmIChkaWRPdmVyd3JpdGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ3VwZGF0ZSNxdWl0QW5kSW5zdGFsbCgpOiBvdmVyd3JpdGUgdXBkYXRlIGRldGVjdGVkLCBwb3N0cG9uaW5nIHF1aXRBbmRJbnN0YWxsJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZW1lbWJlciB0aGUgUmVhZHkgc3RhdGUgc28gd2UgY2FuIHJlc3RvcmUgaXQgaWYgdGhlIHF1aXQgaXMgdmV0b2VkXG5cdFx0Y29uc3QgcmVhZHlTdGF0ZSA9IHRoaXMuc3RhdGU7XG5cblx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLlJlc3RhcnRpbmcodGhpcy5zdGF0ZS51cGRhdGUpKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3VwZGF0ZSNxdWl0QW5kSW5zdGFsbCgpOiBiZWZvcmUgbGlmZWN5Y2xlIHF1aXQoKScpO1xuXG5cdFx0dGhpcy5saWZlY3ljbGVNYWluU2VydmljZS5xdWl0KHRydWUgLyogd2lsbCByZXN0YXJ0ICovKS50aGVuKHZldG9kID0+IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgdXBkYXRlI3F1aXRBbmRJbnN0YWxsKCk6IGFmdGVyIGxpZmVjeWNsZSBxdWl0KCkgd2l0aCB2ZXRvOiAke3ZldG9kfWApO1xuXHRcdFx0aWYgKHZldG9kKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCd1cGRhdGUjcXVpdEFuZEluc3RhbGwoKTogcXVpdCB3YXMgdmV0b2VkLCByZXN0b3JpbmcgUmVhZHkgc3RhdGUnKTtcblx0XHRcdFx0dGhpcy5zZXRTdGF0ZShyZWFkeVN0YXRlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3VwZGF0ZSNxdWl0QW5kSW5zdGFsbCgpOiBydW5uaW5nIHJhdyNxdWl0QW5kSW5zdGFsbCgpJyk7XG5cdFx0XHR0aGlzLmRvUXVpdEFuZEluc3RhbGwoKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2hlY2tGb3JPdmVyd3JpdGVVcGRhdGVzKGV4cGxpY2l0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodGhpcy5fc3RhdGUudHlwZSAhPT0gU3RhdGVUeXBlLlJlYWR5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVuZGluZ1VwZGF0ZUNvbW1pdCA9IHRoaXMuX3N0YXRlLnVwZGF0ZS52ZXJzaW9uO1xuXG5cdFx0aWYgKCFwZW5kaW5nVXBkYXRlQ29tbWl0IHx8IHBlbmRpbmdVcGRhdGVDb21taXQgPT09ICd1bmtub3duJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGxldCBpc0xhdGVzdDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdGNvbnN0IHRpbWVvdXRQcm9taXNlID0gdGltZW91dCgyMDAwKS50aGVuKCgpID0+IHsgY3RzLmNhbmNlbCgpOyByZXR1cm4gdW5kZWZpbmVkOyB9KTtcblx0XHRcdGlzTGF0ZXN0ID0gYXdhaXQgUHJvbWlzZS5yYWNlKFt0aGlzLmlzTGF0ZXN0VmVyc2lvbihwZW5kaW5nVXBkYXRlQ29tbWl0LCBjdHMudG9rZW4pLCB0aW1lb3V0UHJvbWlzZV0pO1xuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ3VwZGF0ZSNjaGVja0Zvck92ZXJ3cml0ZVVwZGF0ZXMoKTogZmFpbGVkIHRvIGNoZWNrIGZvciB1cGRhdGVzLCBwcm9jZWVkaW5nIHdpdGggcmVzdGFydCcpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oZXJyb3IpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChpc0xhdGVzdCA9PT0gZmFsc2UgJiYgdGhpcy5fc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLlJlYWR5KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygndXBkYXRlI3JlYWR5U3RhdGVDaGVjazogbmV3ZXIgdXBkYXRlIGF2YWlsYWJsZSwgcmVzdGFydGluZyB1cGRhdGUgbWFjaGluZXJ5Jyk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY2FuY2VsUGVuZGluZ1VwZGF0ZSgpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCd1cGRhdGUjY2hlY2tGb3JPdmVyd3JpdGVVcGRhdGVzKCk6IGZhaWxlZCB0byBjYW5jZWwgcGVuZGluZyB1cGRhdGUsIGFib3J0aW5nIG92ZXJ3cml0ZScpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX292ZXJ3cml0ZSA9IHRydWU7XG5cdFx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLk92ZXJ3cml0aW5nKHRoaXMuX3N0YXRlLnVwZGF0ZSwgZXhwbGljaXQpKTtcblx0XHRcdHRoaXMuZG9DaGVja0ZvclVwZGF0ZXMoZXhwbGljaXQsIHBlbmRpbmdVcGRhdGVDb21taXQpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0YXN5bmMgaXNMYXRlc3RWZXJzaW9uKGNvbW1pdD86IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8Ym9vbGVhbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5xdWFsaXR5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdub25lJyB8ICdtYW51YWwnIHwgJ3N0YXJ0JyB8ICdkZWZhdWx0Jz4oJ3VwZGF0ZS5tb2RlJyk7XG5cblx0XHRpZiAobW9kZSA9PT0gJ25vbmUnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVybCA9IHRoaXMuYnVpbGRVcGRhdGVGZWVkVXJsKHRoaXMucXVhbGl0eSwgY29tbWl0ID8/IHRoaXMucHJvZHVjdFNlcnZpY2UuY29tbWl0ISwgeyBpbnRlcm5hbE9yZzogdGhpcy5nZXRJbnRlcm5hbE9yZygpIH0pO1xuXG5cdFx0aWYgKCF1cmwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVycyA9IGdldFVwZGF0ZVJlcXVlc3RIZWFkZXJzKHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbik7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd1cGRhdGUjaXNMYXRlc3RWZXJzaW9uKCkgLSBjaGVja2luZyB1cGRhdGUgc2VydmVyJywgeyB1cmwsIGhlYWRlcnMgfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7IHVybCwgaGVhZGVycywgY2FsbFNpdGU6ICd1cGRhdGVTZXJ2aWNlLmlzTGF0ZXN0VmVyc2lvbicgfSwgdG9rZW4pO1xuXHRcdFx0Y29uc3Qgc3RhdHVzQ29kZSA9IGNvbnRleHQucmVzLnN0YXR1c0NvZGU7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3VwZGF0ZSNpc0xhdGVzdFZlcnNpb24oKSAtIHJlc3BvbnNlJywgeyBzdGF0dXNDb2RlIH0pO1xuXHRcdFx0Ly8gVGhlIHVwZGF0ZSBzZXJ2ZXIgcmVwbGllcyB3aXRoIDIwNCAoTm8gQ29udGVudCkgd2hlbiBubyB1cGRhdGUgaXMgYXZhaWxhYmxlLlxuXHRcdFx0cmV0dXJuIHN0YXR1c0NvZGUgPT09IDIwNDtcblxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ3VwZGF0ZSNpc0xhdGVzdFZlcnNpb24oKTogZmFpbGVkIHRvIGNoZWNrIGZvciB1cGRhdGVzJyk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBfYXBwbHlTcGVjaWZpY1VwZGF0ZShwYWNrYWdlUGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gbm9vcFxuXHR9XG5cblx0YXN5bmMgc2V0SW50ZXJuYWxPcmcoaW50ZXJuYWxPcmc6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9pbnRlcm5hbE9yZyA9PT0gaW50ZXJuYWxPcmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygndXBkYXRlI3NldEludGVybmFsT3JnJywgaW50ZXJuYWxPcmcpO1xuXHRcdHRoaXMuX2ludGVybmFsT3JnID0gaW50ZXJuYWxPcmc7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0SW50ZXJuYWxPcmcoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5faW50ZXJuYWxPcmc7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0VXBkYXRlVHlwZSgpOiBVcGRhdGVUeXBlIHtcblx0XHRyZXR1cm4gVXBkYXRlVHlwZS5BcmNoaXZlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGRvUXVpdEFuZEluc3RhbGwoKTogdm9pZCB7XG5cdFx0Ly8gbm9vcFxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHBvc3RJbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBjYW5jZWxQZW5kaW5nVXBkYXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdC8qKlxuXHQgKiBBYm9ydHMgaW4tZmxpZ2h0IG9yIHBlbmRpbmcgdXBkYXRlIHdvcmsgd2hlbiB1cGRhdGVzIGFyZSBiZWluZyBkaXNhYmxlZCBhdCBydW50aW1lLiBUaGUgZGVmYXVsdCBjYW5jZWxzIGFcblx0ICogcGVuZGluZyB1cGRhdGU7IHBsYXRmb3JtIHNlcnZpY2VzIG92ZXJyaWRlIHRoaXMgdG8gYWxzbyBhYm9ydCBpbi1mbGlnaHQgY2hlY2tzL2Rvd25sb2Fkcy5cblx0ICovXG5cdHByb3RlY3RlZCBhc3luYyBjYW5jZWxVcGRhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5jYW5jZWxQZW5kaW5nVXBkYXRlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgYnVpbGRVcGRhdGVGZWVkVXJsKHF1YWxpdHk6IHN0cmluZywgY29tbWl0OiBzdHJpbmcsIG9wdGlvbnM/OiBJVXBkYXRlVVJMT3B0aW9ucyk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGRvQ2hlY2tGb3JVcGRhdGVzKGV4cGxpY2l0OiBib29sZWFuLCBwZW5kaW5nQ29tbWl0Pzogc3RyaW5nKTogdm9pZDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxRQUFRO0FBQ3BCLFNBQTRCLGVBQWUsV0FBVyxlQUFlO0FBQ3JFLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBeUIsbUJBQW1CLG9CQUFvQjtBQUN6RSxTQUFTLGFBQWEsaUJBQWlCO0FBQ3ZDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsdUJBQXVCLDBCQUEwQjtBQUMxRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGNBQWMscUJBQXFCO0FBQzVDLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQStCLG1CQUFtQyxPQUFPLFdBQVcsa0JBQWtCO0FBRXRHLE1BQU0saUNBQWlDO0FBT2hDLFNBQVMsZ0JBQWdCLGVBQXVCLFVBQWtCLFNB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
