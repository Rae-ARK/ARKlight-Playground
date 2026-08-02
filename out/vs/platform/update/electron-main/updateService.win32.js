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
import { spawn } from "child_process";
import { app } from "electron";
import { unlinkSync } from "fs";
import { mkdir, readFile, unlink } from "fs/promises";
import { release, tmpdir } from "os";
import { Delayer, ProcessTimeRunOnceScheduler, timeout } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { memoize } from "../../../base/common/decorators.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { hash } from "../../../base/common/hash.js";
import * as path from "../../../base/common/path.js";
import { basename } from "../../../base/common/path.js";
import { transform } from "../../../base/common/stream.js";
import { URI } from "../../../base/common/uri.js";
import { checksum } from "../../../base/node/crypto.js";
import * as pfs from "../../../base/node/pfs.js";
import { killTree } from "../../../base/node/processes.js";
import { getWindowsRelease } from "../../../base/node/windowsVersion.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { IFileService } from "../../files/common/files.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { IMeteredConnectionService } from "../../meteredConnection/common/meteredConnection.js";
import { INativeHostMainService } from "../../native/electron-main/nativeHostMainService.js";
import { IProductService } from "../../product/common/productService.js";
import { asJson, IRequestService } from "../../request/common/request.js";
import { IApplicationStorageMainService } from "../../storage/electron-main/storageMainService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { DisablementReason, State, StateType, UpdateType } from "../common/update.js";
import { AbstractUpdateService, createUpdateURL, getUpdateRequestHeaders } from "./abstractUpdateService.js";
import { getWin32UpdateType } from "./win32UpdateType.js";
let _updateType = void 0;
function getUpdateType() {
  if (typeof _updateType === "undefined") {
    _updateType = getWin32UpdateType();
  }
  return _updateType;
}
let Win32UpdateService = class extends AbstractUpdateService {
  constructor(lifecycleMainService, configurationService, telemetryService, environmentMainService, requestService, logService, fileService, nativeHostMainService, productService, applicationStorageMainService, meteredConnectionService) {
    super(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService, telemetryService, applicationStorageMainService, meteredConnectionService, true);
    this.fileService = fileService;
    this.nativeHostMainService = nativeHostMainService;
    this.readyMutexName = `${productService.win32MutexName}-ready`;
    this.updatingMutexName = `${productService.win32MutexName}-updating`;
    this.setupMutexName = `${productService.win32MutexName}setup`;
    lifecycleMainService.setRelaunchHandler(this);
  }
  get cachePath() {
    const result = path.join(tmpdir(), `vscode-${this.productService.quality}-${this.productService.target}-${process.arch}`);
    return mkdir(result, { recursive: true }).then(() => result);
  }
  get mutex() {
    return import("@vscode/windows-mutex");
  }
  handleRelaunch(options) {
    if (options?.addArgs || options?.removeArgs) {
      return false;
    }
    if (this.state.type !== StateType.Ready || !this.availableUpdate) {
      return false;
    }
    this.logService.trace("update#handleRelaunch(): running raw#quitAndInstall()");
    this.doQuitAndInstall();
    return true;
  }
  async initialize() {
    if (this.productService.win32VersionedUpdate) {
      const cachePath = await this.cachePath;
      app.setPath("appUpdate", cachePath);
      await this.unlink(path.join(cachePath, "session-ending.flag"));
    }
    const osRelease = await getWindowsRelease();
    const osNodeRelease = release();
    this.telemetryService.publicLog2("windowsUpdateInit", { osRelease, osNodeRelease });
    if (this.productService.target === "user" && await this.nativeHostMainService.isAdmin(void 0)) {
      this.setState(State.Disabled(DisablementReason.RunningAsAdmin));
      this.logService.info("update#ctor - updates are disabled due to running as Admin in user setup");
      return;
    }
    await super.initialize();
  }
  async postInitialize() {
    if (!this.productService.win32VersionedUpdate) {
      return;
    }
    const exePath = app.getPath("exe");
    const exeDir = path.dirname(exePath);
    const updatingVersionPath = path.join(exeDir, "updating_version");
    if (await pfs.Promises.exists(updatingVersionPath)) {
      try {
        const updatingVersion = (await readFile(updatingVersionPath, "utf8")).trim();
        this.logService.info(`update#doCheckForUpdates - application was updating to version ${updatingVersion}`);
        const updatePackagePath = await this.getUpdatePackagePath(updatingVersion);
        if (await pfs.Promises.exists(updatePackagePath)) {
          await this._applySpecificUpdate(updatePackagePath, updatingVersion);
          this.logService.info(`update#doCheckForUpdates - successfully applied update to version ${updatingVersion}`);
        }
      } catch (e) {
        this.logService.error(`update#doCheckForUpdates - could not read ${updatingVersionPath}`, e);
      } finally {
      }
    } else {
      await this.collectGarbage();
    }
  }
  async collectGarbage() {
    if (!this.productService.win32VersionedUpdate) {
      return;
    }
    const fastUpdatesEnabled = this.configurationService.getValue("update.enableWindowsBackgroundUpdates");
    if (!fastUpdatesEnabled || this.productService.target !== "user" || !this.productService.commit) {
      return;
    }
    const exePath = app.getPath("exe");
    const exeDir = path.dirname(exePath);
    const versionedResourcesFolder = this.productService.commit.substring(0, 10);
    const innoUpdater = path.join(exeDir, versionedResourcesFolder, "tools", "inno_updater.exe");
    const exeName = basename(exePath);
    await new Promise((resolve) => {
      const child = spawn(innoUpdater, ["--gc", exePath, versionedResourcesFolder, exeName], {
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true,
        timeout: 2 * 60 * 1e3
      });
      child.once("error", (err) => {
        this.logService.error("update#collectGarbage - failed to spawn inno_updater", err);
        resolve();
      });
      child.once("exit", () => resolve());
    });
  }
  buildUpdateFeedUrl(quality, commit, options) {
    let platform = `win32-${process.arch}`;
    if (getUpdateType() === UpdateType.Archive) {
      platform += "-archive";
    } else if (this.productService.target === "user") {
      platform += "-user";
    }
    return createUpdateURL(this.productService.updateUrl, platform, quality, commit, options);
  }
  doCheckForUpdates(explicit, pendingCommit) {
    if (!this.quality) {
      return;
    }
    const internalOrg = this.getInternalOrg();
    const background = !explicit && !internalOrg;
    const url = this.buildUpdateFeedUrl(this.quality, pendingCommit ?? this.productService.commit, { background, internalOrg });
    if (this.state.type !== StateType.Overwriting) {
      this.setState(State.CheckingForUpdates(explicit));
    }
    this.checkCancellationTokenSource?.dispose(true);
    const cts = this.checkCancellationTokenSource = new CancellationTokenSource();
    const token = cts.token;
    const headers = getUpdateRequestHeaders(this.productService.version);
    const promise = this.requestService.request({ url, headers, callSite: "updateService.win32.checkForUpdates" }, token).then(asJson).then((update) => {
      const updateType = getUpdateType();
      if (token.isCancellationRequested) {
        return Promise.resolve(null);
      }
      if (!update || !update.url || !update.version || !update.productVersion) {
        if (this.state.type === StateType.Overwriting) {
          this._overwrite = false;
          this.setState(State.Ready(this.state.update, this.state.explicit, false));
        } else {
          this.setState(State.Idle(updateType, void 0, explicit || void 0));
        }
        return Promise.resolve(null);
      }
      if (updateType === UpdateType.Archive) {
        this.setState(State.AvailableForDownload(update));
        return Promise.resolve(null);
      }
      if (!explicit && this.meteredConnectionService.isConnectionMetered) {
        this.logService.info("update#doCheckForUpdates - update available but skipping download because connection is metered");
        this.setState(State.AvailableForDownload(update));
        return Promise.resolve(null);
      }
      const startTime = Date.now();
      this.setState(State.Downloading(update, explicit, this._overwrite, 0, void 0, startTime));
      return this.cleanup(update.version).then(() => {
        return this.getUpdatePackagePath(update.version).then((updatePackagePath) => {
          return pfs.Promises.exists(updatePackagePath).then((exists) => {
            if (exists) {
              return Promise.resolve(updatePackagePath);
            }
            const downloadPath = `${updatePackagePath}.tmp`;
            return this.requestService.request({ url: update.url, callSite: "updateService.win32.downloadUpdate" }, token).then((context) => {
              const contentLengthHeader = context.res.headers["content-length"];
              const contentLength = typeof contentLengthHeader === "string" ? contentLengthHeader : void 0;
              const totalBytes = contentLength ? parseInt(contentLength, 10) : void 0;
              let downloadedBytes = 0;
              const progressDelayer = new Delayer(500);
              const progressStream = transform(
                context.stream,
                {
                  data: (data) => {
                    downloadedBytes += data.byteLength;
                    progressDelayer.trigger(() => {
                      this.setState(State.Downloading(update, explicit, this._overwrite, downloadedBytes, totalBytes, startTime));
                    });
                    return data;
                  }
                },
                (chunks) => VSBuffer.concat(chunks)
              );
              return this.fileService.writeFile(URI.file(downloadPath), progressStream).finally(() => progressDelayer.dispose());
            }).then(update.sha256hash ? () => checksum(downloadPath, update.sha256hash) : () => void 0).then(() => pfs.Promises.rename(
              downloadPath,
              updatePackagePath,
              false
              /* no retry */
            )).then(() => updatePackagePath);
          });
        }).then((packagePath) => {
          if (token.isCancellationRequested) {
            return;
          }
          this.availableUpdate = { packagePath };
          this.saveUpdateMetadata(update);
          this.setState(State.Downloaded(update, explicit, this._overwrite));
          const fastUpdatesEnabled = this.configurationService.getValue("update.enableWindowsBackgroundUpdates");
          if (fastUpdatesEnabled && this.productService.target === "user") {
            this.doApplyUpdate();
          } else {
            this.setState(State.Ready(update, explicit, this._overwrite));
          }
        });
      });
    }).then(void 0, (err) => {
      if (token.isCancellationRequested || isCancellationError(err)) {
        return;
      }
      this.telemetryService.publicLog2("update:error", { messageHash: String(hash(String(err))) });
      this.logService.error(err);
      const message = explicit ? err.message || err : void 0;
      if (this.state.type === StateType.Overwriting) {
        this._overwrite = false;
        this.setState(State.Ready(this.state.update, this.state.explicit, false));
      } else {
        this.setState(State.Idle(getUpdateType(), message));
      }
    });
    this.checkPromise = promise;
    promise.finally(() => {
      if (this.checkCancellationTokenSource === cts) {
        this.checkCancellationTokenSource = void 0;
      }
      if (this.checkPromise === promise) {
        this.checkPromise = void 0;
      }
      cts.dispose();
    });
  }
  async doDownloadUpdate(state) {
    if (state.update.url) {
      this.nativeHostMainService.openExternal(void 0, state.update.url);
    }
    this.setState(State.Idle(getUpdateType()));
  }
  async getUpdatePackagePath(version) {
    const cachePath = await this.cachePath;
    return path.join(cachePath, `CodeSetup-${this.productService.quality}-${version}.exe`);
  }
  async cleanup(exceptVersion = null) {
    const filter = exceptVersion ? (one) => !new RegExp(`${this.productService.quality}-${exceptVersion}\\.exe$`).test(one) : () => true;
    const cachePath = await this.cachePath;
    const versions = await pfs.Promises.readdir(cachePath);
    const promises = versions.filter(filter).map((one) => this.unlink(path.join(cachePath, one)));
    await Promise.all(promises);
  }
  async doApplyUpdate() {
    if (this.state.type !== StateType.Downloaded) {
      return Promise.resolve(void 0);
    }
    if (!this.availableUpdate) {
      return Promise.resolve(void 0);
    }
    const update = this.state.update;
    const explicit = this.state.explicit;
    this.setState(State.Updating(update, explicit));
    const cachePath = await this.cachePath;
    const sessionEndFlagPath = path.join(cachePath, "session-ending.flag");
    const cancelFilePath = path.join(cachePath, `cancel.flag`);
    const progressFilePath = path.join(cachePath, `update-progress`);
    this.availableUpdate.updateFilePath = path.join(cachePath, `CodeSetup-${this.productService.quality}-${update.version}.flag`);
    this.availableUpdate.cancelFilePath = cancelFilePath;
    const mutex = await this.mutex;
    const skippedSpawn = this.isInstallerActive(mutex);
    if (skippedSpawn) {
      this.logService.info("update#doApplyUpdate: another instance is already running setup, waiting for it to finish");
    } else {
      await this.unlink(cancelFilePath);
      await this.unlink(progressFilePath);
      await pfs.Promises.writeFile(this.availableUpdate.updateFilePath, "flag");
      const child = spawn(
        this.availableUpdate.packagePath,
        [
          "/verysilent",
          "/log",
          `/update="${this.availableUpdate.updateFilePath}"`,
          `/progress="${progressFilePath}"`,
          `/sessionend="${sessionEndFlagPath}"`,
          `/cancel="${cancelFilePath}"`,
          "/nocloseapplications",
          "/mergetasks=runcode,!desktopicon,!quicklaunchicon"
        ],
        {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
          windowsVerbatimArguments: true,
          env: { ...process.env, __COMPAT_LAYER: "RunAsInvoker" }
        }
      );
      this.availableUpdate.updateProcess = child;
      child.once("exit", () => {
        this.availableUpdate = void 0;
        this.setState(State.Idle(getUpdateType()));
      });
    }
    this.updateCancellationTokenSource?.dispose(true);
    const cts = this.updateCancellationTokenSource = new CancellationTokenSource();
    const token = cts.token;
    const poll = async () => {
      let seenRunning = skippedSpawn;
      while (this.state.type === StateType.Updating && !token.isCancellationRequested) {
        if (mutex.isActive(this.readyMutexName)) {
          this.setState(State.Ready(update, explicit, this._overwrite));
          return;
        }
        if (this.isInstallerActive(mutex)) {
          seenRunning = true;
        } else if (seenRunning) {
          if (!this.availableUpdate?.updateProcess) {
            this.availableUpdate = void 0;
            this.setState(State.Idle(getUpdateType()));
          }
          return;
        }
        try {
          const progressContent = await readFile(progressFilePath, "utf8");
          if (!token.isCancellationRequested) {
            const [currentStr, maxStr] = progressContent.split(",");
            const currentProgress = parseInt(currentStr, 10);
            const maxProgress = parseInt(maxStr, 10);
            if (!isNaN(currentProgress) && !isNaN(maxProgress) && this.state.type === StateType.Updating) {
              if (this.state.currentProgress !== currentProgress || this.state.maxProgress !== maxProgress) {
                this.setState(State.Updating(update, explicit, currentProgress, maxProgress));
              }
            }
          }
        } catch {
        }
        await timeout(500);
      }
    };
    const cancelTimeout = new ProcessTimeRunOnceScheduler(() => {
      this.logService.warn("update#doApplyUpdate: polling timed out waiting for update to be ready");
      this.setState(State.Idle(getUpdateType(), "Update did not complete within expected time"));
    }, 60 * 60 * 1e3);
    cancelTimeout.schedule();
    poll().finally(() => {
      cancelTimeout.dispose();
      if (this.updateCancellationTokenSource === cts) {
        this.updateCancellationTokenSource = void 0;
      }
      cts.dispose();
    });
  }
  async cancelUpdate() {
    const hadInFlightCheck = !!this.checkCancellationTokenSource;
    const hadPendingUpdate = !!this.availableUpdate;
    this.checkCancellationTokenSource?.dispose(true);
    this.checkCancellationTokenSource = void 0;
    if (hadInFlightCheck) {
      try {
        await this.checkPromise;
      } catch {
      }
      await this.cleanupTempFiles();
    }
    await this.cancelPendingUpdate();
    if (hadInFlightCheck || hadPendingUpdate) {
      this.collectGarbage().catch((err) => this.logService.error("update#collectGarbage - failed to collect garbage", err));
    }
  }
  async cleanupTempFiles() {
    try {
      const cachePath = await this.cachePath;
      const files = await pfs.Promises.readdir(cachePath);
      await Promise.all(files.filter((file) => file.endsWith(".tmp")).map((file) => this.unlink(path.join(cachePath, file))));
    } catch (err) {
      this.logService.warn("update#cleanupTempFiles: failed to remove temporary download files", err);
    }
  }
  async cancelPendingUpdate() {
    if (!this.availableUpdate) {
      return;
    }
    const { updateProcess, updateFilePath, cancelFilePath } = this.availableUpdate;
    if (!updateProcess && this.isInstallerActive(await this.mutex)) {
      throw new Error("Cannot cancel pending update: another instance is still running setup");
    }
    this.updateCancellationTokenSource?.dispose(true);
    this.updateCancellationTokenSource = void 0;
    if (updateProcess && updateProcess.exitCode === null) {
      this.logService.trace("update#cancelPendingUpdate: cancelling pending update");
      updateProcess.removeAllListeners();
      const exitPromise = new Promise((resolve) => updateProcess.once("exit", () => resolve(true)));
      if (cancelFilePath) {
        try {
          await pfs.Promises.writeFile(cancelFilePath, "cancel");
        } catch (err) {
          this.logService.warn("update#cancelPendingUpdate: failed to write cancel file", err);
        }
      }
      const pid = updateProcess.pid;
      const exited = await Promise.race([exitPromise, timeout(30 * 1e3).then(() => false)]);
      if (pid && !exited) {
        this.logService.trace("update#cancelPendingUpdate: process did not exit gracefully, killing process tree");
        await killTree(pid, true);
      }
    }
    await this.unlink(updateFilePath);
    await this.unlink(cancelFilePath);
    this.availableUpdate = void 0;
  }
  doQuitAndInstall() {
    if (this.state.type !== StateType.Ready && this.state.type !== StateType.Restarting || !this.availableUpdate) {
      return;
    }
    this.logService.trace("update#quitAndInstall(): running raw#quitAndInstall()");
    if (this.availableUpdate.updateFilePath) {
      try {
        unlinkSync(this.availableUpdate.updateFilePath);
      } catch {
      }
    } else {
      spawn(this.availableUpdate.packagePath, ["/silent", "/log", "/mergetasks=runcode,!desktopicon,!quicklaunchicon"], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
        env: { ...process.env, __COMPAT_LAYER: "RunAsInvoker" }
      });
    }
  }
  async saveUpdateMetadata(update) {
    try {
      const cachePath = await this.cachePath;
      const metadataPath = path.join(cachePath, "update-metadata.json");
      await pfs.Promises.writeFile(metadataPath, JSON.stringify(update));
    } catch (e) {
      this.logService.error("update#saveUpdateMetadata: failed to save", e);
    }
  }
  async loadUpdateMetadata() {
    try {
      const cachePath = await this.cachePath;
      const metadataPath = path.join(cachePath, "update-metadata.json");
      if (await pfs.Promises.exists(metadataPath)) {
        const content = await readFile(metadataPath, "utf8");
        return JSON.parse(content);
      }
    } catch (e) {
      this.logService.error("update#loadUpdateMetadata: failed to load", e);
    }
    return void 0;
  }
  getUpdateType() {
    return getUpdateType();
  }
  async _applySpecificUpdate(packagePath, commit) {
    if (this.state.type !== StateType.Idle) {
      return;
    }
    const fastUpdatesEnabled = this.configurationService.getValue("update.enableWindowsBackgroundUpdates");
    const update = await this.loadUpdateMetadata() ?? { version: commit ?? "unknown", productVersion: "unknown" };
    this.setState(State.Downloading(update, true, false));
    this.availableUpdate = { packagePath };
    this.setState(State.Downloaded(update, true, false));
    if (fastUpdatesEnabled && this.productService.target === "user") {
      this.doApplyUpdate();
    } else {
      this.setState(State.Ready(update, true, false));
    }
  }
  isInstallerActive(mutex) {
    return mutex.isActive(this.updatingMutexName) || mutex.isActive(this.setupMutexName);
  }
  async unlink(path2) {
    if (path2) {
      try {
        await unlink(path2);
      } catch (err) {
        const error = err;
        if (error && error.code === "ENOENT") {
          return;
        } else {
          this.logService.warn(`update#unlink: failed to unlink ${basename(path2)}`, err);
        }
      }
    }
  }
};
__decorateClass([
  memoize
], Win32UpdateService.prototype, "cachePath", 1);
__decorateClass([
  memoize
], Win32UpdateService.prototype, "mutex", 1);
Win32UpdateService = __decorateClass([
  __decorateParam(0, ILifecycleMainService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IEnvironmentMainService),
  __decorateParam(4, IRequestService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IFileService),
  __decorateParam(7, INativeHostMainService),
  __decorateParam(8, IProductService),
  __decorateParam(9, IApplicationStorageMainService),
  __decorateParam(10, IMeteredConnectionService)
], Win32UpdateService);
export {
  Win32UpdateService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VwZGF0ZS9lbGVjdHJvbi1tYWluL3VwZGF0ZVNlcnZpY2Uud2luMzIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGlsZFByb2Nlc3MsIHNwYXduIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBhcHAgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyB1bmxpbmtTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgbWtkaXIsIHJlYWRGaWxlLCB1bmxpbmsgfSBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgeyByZWxlYXNlLCB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBEZWxheWVyLCBQcm9jZXNzVGltZVJ1bk9uY2VTY2hlZHVsZXIsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgdHJhbnNmb3JtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyZWFtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBjaGVja3N1bSB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9jcnlwdG8uanMnO1xuaW1wb3J0ICogYXMgcGZzIGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsga2lsbFRyZWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcHJvY2Vzc2VzLmpzJztcbmltcG9ydCB7IGdldFdpbmRvd3NSZWxlYXNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3dpbmRvd3NWZXJzaW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9lbGVjdHJvbi1tYWluL2Vudmlyb25tZW50TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVNYWluU2VydmljZSwgSVJlbGF1bmNoSGFuZGxlciwgSVJlbGF1bmNoT3B0aW9ucyB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9lbGVjdHJvbi1tYWluL2xpZmVjeWNsZU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL21ldGVyZWRDb25uZWN0aW9uL2NvbW1vbi9tZXRlcmVkQ29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbmF0aXZlL2VsZWN0cm9uLW1haW4vbmF0aXZlSG9zdE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFzSnNvbiwgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2VsZWN0cm9uLW1haW4vc3RvcmFnZU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQXZhaWxhYmxlRm9yRG93bmxvYWQsIERpc2FibGVtZW50UmVhc29uLCBJVXBkYXRlLCBTdGF0ZSwgU3RhdGVUeXBlLCBVcGRhdGVUeXBlIH0gZnJvbSAnLi4vY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFVwZGF0ZVNlcnZpY2UsIGNyZWF0ZVVwZGF0ZVVSTCwgZ2V0VXBkYXRlUmVxdWVzdEhlYWRlcnMsIElVcGRhdGVVUkxPcHRpb25zLCBVcGRhdGVFcnJvckNsYXNzaWZpY2F0aW9uIH0gZnJvbSAnLi9hYnN0cmFjdFVwZGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0V2luMzJVcGRhdGVUeXBlIH0gZnJvbSAnLi93aW4zMlVwZGF0ZVR5cGUuanMnO1xuXG5pbnRlcmZhY2UgSUF2YWlsYWJsZVVwZGF0ZSB7XG5cdHBhY2thZ2VQYXRoOiBzdHJpbmc7XG5cdHVwZGF0ZUZpbGVQYXRoPzogc3RyaW5nO1xuXHQvKiogRmlsZSBwYXRoIHVzZWQgdG8gc2lnbmFsIHRoZSBJbm5vIFNldHVwIGluc3RhbGxlciB0byBjYW5jZWwgKi9cblx0Y2FuY2VsRmlsZVBhdGg/OiBzdHJpbmc7XG5cdC8qKiBUaGUgSW5ubyBTZXR1cCBwcm9jZXNzIHRoYXQgaXMgYXBwbHlpbmcgdGhlIHVwZGF0ZSBpbiB0aGUgYmFja2dyb3VuZCAqL1xuXHR1cGRhdGVQcm9jZXNzPzogQ2hpbGRQcm9jZXNzO1xufVxuXG5sZXQgX3VwZGF0ZVR5cGU6IFVwZGF0ZVR5cGUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5mdW5jdGlvbiBnZXRVcGRhdGVUeXBlKCk6IFVwZGF0ZVR5cGUge1xuXHRpZiAodHlwZW9mIF91cGRhdGVUeXBlID09PSAndW5kZWZpbmVkJykge1xuXHRcdF91cGRhdGVUeXBlID0gZ2V0V2luMzJVcGRhdGVUeXBlKCk7XG5cdH1cblxuXHRyZXR1cm4gX3VwZGF0ZVR5cGU7XG59XG5cbmV4cG9ydCBjbGFzcyBXaW4zMlVwZGF0ZVNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdFVwZGF0ZVNlcnZpY2UgaW1wbGVtZW50cyBJUmVsYXVuY2hIYW5kbGVyIHtcblxuXHRwcml2YXRlIGF2YWlsYWJsZVVwZGF0ZTogSUF2YWlsYWJsZVVwZGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB1cGRhdGVDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdC8qKiBDYW5jZWxzIGFuIGluLWZsaWdodCBjaGVjay9kb3dubG9hZCBjaGFpbiAoZS5nLiB3aGVuIHVwZGF0ZXMgYXJlIGRpc2FibGVkIGF0IHJ1bnRpbWUpLiAqL1xuXHRwcml2YXRlIGNoZWNrQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgdW5kZWZpbmVkO1xuXHQvKiogU2V0dGxlcyB3aGVuIHRoZSBpbi1mbGlnaHQgY2hlY2svZG93bmxvYWQgY2hhaW4gaGFzIGZ1bGx5IHVud291bmQ7IHVzZWQgYnkgdGhlIGNhbmNlbCBwYXRoLiAqL1xuXHRwcml2YXRlIGNoZWNrUHJvbWlzZTogUHJvbWlzZTx1bmtub3duPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlYWR5TXV0ZXhOYW1lOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgdXBkYXRpbmdNdXRleE5hbWU6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBzZXR1cE11dGV4TmFtZTogc3RyaW5nO1xuXG5cdEBtZW1vaXplXG5cdGdldCBjYWNoZVBhdGgoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwYXRoLmpvaW4odG1wZGlyKCksIGB2c2NvZGUtJHt0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHl9LSR7dGhpcy5wcm9kdWN0U2VydmljZS50YXJnZXR9LSR7cHJvY2Vzcy5hcmNofWApO1xuXHRcdHJldHVybiBta2RpcihyZXN1bHQsIHsgcmVjdXJzaXZlOiB0cnVlIH0pLnRoZW4oKCkgPT4gcmVzdWx0KTtcblx0fVxuXG5cdEBtZW1vaXplXG5cdHByaXZhdGUgZ2V0IG11dGV4KCk6IFByb21pc2U8dHlwZW9mIGltcG9ydCgnQHZzY29kZS93aW5kb3dzLW11dGV4Jyk+IHtcblx0XHRyZXR1cm4gaW1wb3J0KCdAdnNjb2RlL3dpbmRvd3MtbXV0ZXgnKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgbGlmZWN5Y2xlTWFpblNlcnZpY2U6IElMaWZlY3ljbGVNYWluU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRNYWluU2VydmljZSBlbnZpcm9ubWVudE1haW5TZXJ2aWNlOiBJRW52aXJvbm1lbnRNYWluU2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdE1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmF0aXZlSG9zdE1haW5TZXJ2aWNlOiBJTmF0aXZlSG9zdE1haW5TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlIGFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlOiBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UsXG5cdFx0QElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UgbWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlOiBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihsaWZlY3ljbGVNYWluU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGVudmlyb25tZW50TWFpblNlcnZpY2UsIHJlcXVlc3RTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwgYXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UsIG1ldGVyZWRDb25uZWN0aW9uU2VydmljZSwgdHJ1ZSk7XG5cblx0XHR0aGlzLnJlYWR5TXV0ZXhOYW1lID0gYCR7cHJvZHVjdFNlcnZpY2Uud2luMzJNdXRleE5hbWV9LXJlYWR5YDtcblx0XHR0aGlzLnVwZGF0aW5nTXV0ZXhOYW1lID0gYCR7cHJvZHVjdFNlcnZpY2Uud2luMzJNdXRleE5hbWV9LXVwZGF0aW5nYDtcblx0XHR0aGlzLnNldHVwTXV0ZXhOYW1lID0gYCR7cHJvZHVjdFNlcnZpY2Uud2luMzJNdXRleE5hbWV9c2V0dXBgO1xuXG5cdFx0bGlmZWN5Y2xlTWFpblNlcnZpY2Uuc2V0UmVsYXVuY2hIYW5kbGVyKHRoaXMpO1xuXHR9XG5cblx0aGFuZGxlUmVsYXVuY2gob3B0aW9ucz86IElSZWxhdW5jaE9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRpZiAob3B0aW9ucz8uYWRkQXJncyB8fCBvcHRpb25zPy5yZW1vdmVBcmdzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIHdlIGNhbm5vdCBhcHBseSBhbiB1cGRhdGUgYW5kIHJlc3RhcnQgd2l0aCBkaWZmZXJlbnQgYXJnc1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnN0YXRlLnR5cGUgIT09IFN0YXRlVHlwZS5SZWFkeSB8fCAhdGhpcy5hdmFpbGFibGVVcGRhdGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gd2Ugb25seSBoYW5kbGUgdGhlIHJlbGF1bmNoIHdoZW4gd2UgaGF2ZSBhIHBlbmRpbmcgdXBkYXRlXG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd1cGRhdGUjaGFuZGxlUmVsYXVuY2goKTogcnVubmluZyByYXcjcXVpdEFuZEluc3RhbGwoKScpO1xuXHRcdHRoaXMuZG9RdWl0QW5kSW5zdGFsbCgpO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5wcm9kdWN0U2VydmljZS53aW4zMlZlcnNpb25lZFVwZGF0ZSkge1xuXHRcdFx0Y29uc3QgY2FjaGVQYXRoID0gYXdhaXQgdGhpcy5jYWNoZVBhdGg7XG5cdFx0XHRhcHAuc2V0UGF0aCgnYXBwVXBkYXRlJywgY2FjaGVQYXRoKTtcblx0XHRcdGF3YWl0IHRoaXMudW5saW5rKHBhdGguam9pbihjYWNoZVBhdGgsICdzZXNzaW9uLWVuZGluZy5mbGFnJykpO1xuXHRcdH1cblxuXHRcdC8vIFNlbmQgdGVsZW1ldHJ5XG5cdFx0dHlwZSBXaW5kb3dzVXBkYXRlSW5pdEV2ZW50ID0ge1xuXHRcdFx0b3NSZWxlYXNlOiBzdHJpbmc7XG5cdFx0XHRvc05vZGVSZWxlYXNlOiBzdHJpbmc7XG5cdFx0fTtcblx0XHR0eXBlIFdpbmRvd3NVcGRhdGVJbml0Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvc1JlbGVhc2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgV2luZG93cyBPUyByZWxlYXNlIHZlcnNpb24gZnJvbSByZWdpc3RyeS4nIH07XG5cdFx0XHRvc05vZGVSZWxlYXNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIFdpbmRvd3MgT1MgcmVsZWFzZSB2ZXJzaW9uIGZyb20gb3MucmVsZWFzZSgpLicgfTtcblx0XHRcdG93bmVyOiAnZG1pdHJpdic7XG5cdFx0XHRjb21tZW50OiAnVHJhY2tzIFdpbmRvd3MgT1MgcmVsZWFzZSBpbmZvcm1hdGlvbiBkdXJpbmcgdXBkYXRlIGluaXRpYWxpemF0aW9uLic7XG5cdFx0fTtcblx0XHRjb25zdCBvc1JlbGVhc2UgPSBhd2FpdCBnZXRXaW5kb3dzUmVsZWFzZSgpO1xuXHRcdGNvbnN0IG9zTm9kZVJlbGVhc2UgPSByZWxlYXNlKCk7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V2luZG93c1VwZGF0ZUluaXRFdmVudCwgV2luZG93c1VwZGF0ZUluaXRDbGFzc2lmaWNhdGlvbj4oJ3dpbmRvd3NVcGRhdGVJbml0JywgeyBvc1JlbGVhc2UsIG9zTm9kZVJlbGVhc2UgfSk7XG5cblx0XHRpZiAodGhpcy5wcm9kdWN0U2VydmljZS50YXJnZXQgPT09ICd1c2VyJyAmJiBhd2FpdCB0aGlzLm5hdGl2ZUhvc3RNYWluU2VydmljZS5pc0FkbWluKHVuZGVmaW5lZCkpIHtcblx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuRGlzYWJsZWQoRGlzYWJsZW1lbnRSZWFzb24uUnVubmluZ0FzQWRtaW4pKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCd1cGRhdGUjY3RvciAtIHVwZGF0ZXMgYXJlIGRpc2FibGVkIGR1ZSB0byBydW5uaW5nIGFzIEFkbWluIGluIHVzZXIgc2V0dXAnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBzdXBlci5pbml0aWFsaXplKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgcG9zdEluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnByb2R1Y3RTZXJ2aWNlLndpbjMyVmVyc2lvbmVkVXBkYXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIENoZWNrIGZvciBwZW5kaW5nIHVwZGF0ZSBmcm9tIHByZXZpb3VzIHNlc3Npb25cblx0XHQvLyBUaGlzIGNhbiBoYXBwZW4gaWYgdGhlIGFwcCBpcyBxdWl0IHJpZ2h0IGFmdGVyIHRoZSB1cGRhdGUgaGFzIGJlZW5cblx0XHQvLyBkb3dubG9hZGVkIGFuZCBiZWZvcmUgdGhlIHVwZGF0ZSBoYXMgYmVlbiBhcHBsaWVkLlxuXHRcdGNvbnN0IGV4ZVBhdGggPSBhcHAuZ2V0UGF0aCgnZXhlJyk7XG5cdFx0Y29uc3QgZXhlRGlyID0gcGF0aC5kaXJuYW1lKGV4ZVBhdGgpO1xuXHRcdGNvbnN0IHVwZGF0aW5nVmVyc2lvblBhdGggPSBwYXRoLmpvaW4oZXhlRGlyLCAndXBkYXRpbmdfdmVyc2lvbicpO1xuXHRcdGlmIChhd2FpdCBwZnMuUHJvbWlzZXMuZXhpc3RzKHVwZGF0aW5nVmVyc2lvblBhdGgpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB1cGRhdGluZ1ZlcnNpb24gPSAoYXdhaXQgcmVhZEZpbGUodXBkYXRpbmdWZXJzaW9uUGF0aCwgJ3V0ZjgnKSkudHJpbSgpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgdXBkYXRlI2RvQ2hlY2tGb3JVcGRhdGVzIC0gYXBwbGljYXRpb24gd2FzIHVwZGF0aW5nIHRvIHZlcnNpb24gJHt1cGRhdGluZ1ZlcnNpb259YCk7XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZVBhY2thZ2VQYXRoID0gYXdhaXQgdGhpcy5nZXRVcGRhdGVQYWNrYWdlUGF0aCh1cGRhdGluZ1ZlcnNpb24pO1xuXHRcdFx0XHRpZiAoYXdhaXQgcGZzLlByb21pc2VzLmV4aXN0cyh1cGRhdGVQYWNrYWdlUGF0aCkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9hcHBseVNwZWNpZmljVXBkYXRlKHVwZGF0ZVBhY2thZ2VQYXRoLCB1cGRhdGluZ1ZlcnNpb24pO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGB1cGRhdGUjZG9DaGVja0ZvclVwZGF0ZXMgLSBzdWNjZXNzZnVsbHkgYXBwbGllZCB1cGRhdGUgdG8gdmVyc2lvbiAke3VwZGF0aW5nVmVyc2lvbn1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYHVwZGF0ZSNkb0NoZWNrRm9yVXBkYXRlcyAtIGNvdWxkIG5vdCByZWFkICR7dXBkYXRpbmdWZXJzaW9uUGF0aH1gLCBlKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdC8vIHVwZGF0aW5nVmVyc2lvblBhdGggd2lsbCBiZSBkZWxldGVkIGJ5IGlubm8gc2V0dXAuXG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuY29sbGVjdEdhcmJhZ2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbGxlY3RHYXJiYWdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5wcm9kdWN0U2VydmljZS53aW4zMlZlcnNpb25lZFVwZGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZhc3RVcGRhdGVzRW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3VwZGF0ZS5lbmFibGVXaW5kb3dzQmFja2dyb3VuZFVwZGF0ZXMnKTtcblx0XHQvLyBHQyBmb3IgYmFja2dyb3VuZCB1cGRhdGVzIGluIHN5c3RlbSBzZXR1cCBoYXBwZW5zIHZpYSBpbm5vX3NldHVwIHNpbmNlIGl0IHJlcXVpcmVzIGVsZXZhdGVkIHBlcm1pc3Npb25zLlxuXHRcdGlmICghZmFzdFVwZGF0ZXNFbmFibGVkIHx8IHRoaXMucHJvZHVjdFNlcnZpY2UudGFyZ2V0ICE9PSAndXNlcicgfHwgIXRoaXMucHJvZHVjdFNlcnZpY2UuY29tbWl0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhlUGF0aCA9IGFwcC5nZXRQYXRoKCdleGUnKTtcblx0XHRjb25zdCBleGVEaXIgPSBwYXRoLmRpcm5hbWUoZXhlUGF0aCk7XG5cdFx0Y29uc3QgdmVyc2lvbmVkUmVzb3VyY2VzRm9sZGVyID0gdGhpcy5wcm9kdWN0U2VydmljZS5jb21taXQuc3Vic3RyaW5nKDAsIDEwKTtcblx0XHRjb25zdCBpbm5vVXBkYXRlciA9IHBhdGguam9pbihleGVEaXIsIHZlcnNpb25lZFJlc291cmNlc0ZvbGRlciwgJ3Rvb2xzJywgJ2lubm9fdXBkYXRlci5leGUnKTtcblx0XHRjb25zdCBleGVOYW1lID0gYmFzZW5hbWUoZXhlUGF0aCk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBjaGlsZCA9IHNwYXduKGlubm9VcGRhdGVyLCBbJy0tZ2MnLCBleGVQYXRoLCB2ZXJzaW9uZWRSZXNvdXJjZXNGb2xkZXIsIGV4ZU5hbWVdLCB7XG5cdFx0XHRcdHN0ZGlvOiBbJ2lnbm9yZScsICdpZ25vcmUnLCAnaWdub3JlJ10sXG5cdFx0XHRcdHdpbmRvd3NIaWRlOiB0cnVlLFxuXHRcdFx0XHR0aW1lb3V0OiAyICogNjAgKiAxMDAwXG5cdFx0XHR9KTtcblx0XHRcdC8vIFJlc29sdmUgb24gJ2Vycm9yJyB0b28gKG1pc3NpbmcgaW5ub191cGRhdGVyIC8gcGVybWlzc2lvbiBkZW5pZWQpIHNvIHRoZSBhd2FpdGVkIHByb21pc2UgYWx3YXlzIHNldHRsZXMuXG5cdFx0XHRjaGlsZC5vbmNlKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcigndXBkYXRlI2NvbGxlY3RHYXJiYWdlIC0gZmFpbGVkIHRvIHNwYXduIGlubm9fdXBkYXRlcicsIGVycik7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pO1xuXHRcdFx0Y2hpbGQub25jZSgnZXhpdCcsICgpID0+IHJlc29sdmUoKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYnVpbGRVcGRhdGVGZWVkVXJsKHF1YWxpdHk6IHN0cmluZywgY29tbWl0OiBzdHJpbmcsIG9wdGlvbnM/OiBJVXBkYXRlVVJMT3B0aW9ucyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHBsYXRmb3JtID0gYHdpbjMyLSR7cHJvY2Vzcy5hcmNofWA7XG5cblx0XHRpZiAoZ2V0VXBkYXRlVHlwZSgpID09PSBVcGRhdGVUeXBlLkFyY2hpdmUpIHtcblx0XHRcdHBsYXRmb3JtICs9ICctYXJjaGl2ZSc7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnByb2R1Y3RTZXJ2aWNlLnRhcmdldCA9PT0gJ3VzZXInKSB7XG5cdFx0XHRwbGF0Zm9ybSArPSAnLXVzZXInO1xuXHRcdH1cblxuXHRcdHJldHVybiBjcmVhdGVVcGRhdGVVUkwodGhpcy5wcm9kdWN0U2VydmljZS51cGRhdGVVcmwhLCBwbGF0Zm9ybSwgcXVhbGl0eSwgY29tbWl0LCBvcHRpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBkb0NoZWNrRm9yVXBkYXRlcyhleHBsaWNpdDogYm9vbGVhbiwgcGVuZGluZ0NvbW1pdD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5xdWFsaXR5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW50ZXJuYWxPcmcgPSB0aGlzLmdldEludGVybmFsT3JnKCk7XG5cdFx0Y29uc3QgYmFja2dyb3VuZCA9ICFleHBsaWNpdCAmJiAhaW50ZXJuYWxPcmc7XG5cdFx0Y29uc3QgdXJsID0gdGhpcy5idWlsZFVwZGF0ZUZlZWRVcmwodGhpcy5xdWFsaXR5LCBwZW5kaW5nQ29tbWl0ID8/IHRoaXMucHJvZHVjdFNlcnZpY2UuY29tbWl0ISwgeyBiYWNrZ3JvdW5kLCBpbnRlcm5hbE9yZyB9KTtcblxuXHRcdC8vIE9ubHkgc2V0IENoZWNraW5nRm9yVXBkYXRlcyBpZiB3ZSdyZSBub3QgYWxyZWFkeSBpbiBPdmVyd3JpdGluZyBzdGF0ZVxuXHRcdGlmICh0aGlzLnN0YXRlLnR5cGUgIT09IFN0YXRlVHlwZS5PdmVyd3JpdGluZykge1xuXHRcdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5DaGVja2luZ0ZvclVwZGF0ZXMoZXhwbGljaXQpKTtcblx0XHR9XG5cblx0XHQvLyBUcmFjayB0aGlzIGNoZWNrL2Rvd25sb2FkIGNoYWluIHNvIGl0IGNhbiBiZSBjYW5jZWxsZWQgaWYgdXBkYXRlcyBhcmUgZGlzYWJsZWQgYXQgcnVudGltZS5cblx0XHR0aGlzLmNoZWNrQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U/LmRpc3Bvc2UodHJ1ZSk7XG5cdFx0Y29uc3QgY3RzID0gdGhpcy5jaGVja0NhbmNlbGxhdGlvblRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0Y29uc3QgdG9rZW4gPSBjdHMudG9rZW47XG5cblx0XHRjb25zdCBoZWFkZXJzID0gZ2V0VXBkYXRlUmVxdWVzdEhlYWRlcnModGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uKTtcblx0XHRjb25zdCBwcm9taXNlID0gdGhpcy5yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KHsgdXJsLCBoZWFkZXJzLCBjYWxsU2l0ZTogJ3VwZGF0ZVNlcnZpY2Uud2luMzIuY2hlY2tGb3JVcGRhdGVzJyB9LCB0b2tlbilcblx0XHRcdC50aGVuPElVcGRhdGUgfCBudWxsPihhc0pzb24pXG5cdFx0XHQudGhlbih1cGRhdGUgPT4ge1xuXHRcdFx0XHRjb25zdCB1cGRhdGVUeXBlID0gZ2V0VXBkYXRlVHlwZSgpO1xuXG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIXVwZGF0ZSB8fCAhdXBkYXRlLnVybCB8fCAhdXBkYXRlLnZlcnNpb24gfHwgIXVwZGF0ZS5wcm9kdWN0VmVyc2lvbikge1xuXHRcdFx0XHRcdC8vIElmIHdlIHdlcmUgY2hlY2tpbmcgZm9yIGFuIG92ZXJ3cml0ZSB1cGRhdGUgYW5kIGZvdW5kIG5vdGhpbmcgbmV3ZXIsXG5cdFx0XHRcdFx0Ly8gcmVzdG9yZSB0aGUgUmVhZHkgc3RhdGUgd2l0aCB0aGUgcGVuZGluZyB1cGRhdGVcblx0XHRcdFx0XHRpZiAodGhpcy5zdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuT3ZlcndyaXRpbmcpIHtcblx0XHRcdFx0XHRcdHRoaXMuX292ZXJ3cml0ZSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5SZWFkeSh0aGlzLnN0YXRlLnVwZGF0ZSwgdGhpcy5zdGF0ZS5leHBsaWNpdCwgZmFsc2UpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5JZGxlKHVwZGF0ZVR5cGUsIHVuZGVmaW5lZCwgZXhwbGljaXQgfHwgdW5kZWZpbmVkKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodXBkYXRlVHlwZSA9PT0gVXBkYXRlVHlwZS5BcmNoaXZlKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5BdmFpbGFibGVGb3JEb3dubG9hZCh1cGRhdGUpKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gV2hlbiBjb25uZWN0aW9uIGlzIG1ldGVyZWQgYW5kIHRoaXMgaXMgbm90IGFuIGV4cGxpY2l0IGNoZWNrLFxuXHRcdFx0XHQvLyBzaG93IHVwZGF0ZSBpcyBhdmFpbGFibGUgYnV0IGRvbid0IHN0YXJ0IGRvd25sb2FkaW5nXG5cdFx0XHRcdGlmICghZXhwbGljaXQgJiYgdGhpcy5tZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UuaXNDb25uZWN0aW9uTWV0ZXJlZCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCd1cGRhdGUjZG9DaGVja0ZvclVwZGF0ZXMgLSB1cGRhdGUgYXZhaWxhYmxlIGJ1dCBza2lwcGluZyBkb3dubG9hZCBiZWNhdXNlIGNvbm5lY3Rpb24gaXMgbWV0ZXJlZCcpO1xuXHRcdFx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuQXZhaWxhYmxlRm9yRG93bmxvYWQodXBkYXRlKSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuRG93bmxvYWRpbmcodXBkYXRlLCBleHBsaWNpdCwgdGhpcy5fb3ZlcndyaXRlLCAwLCB1bmRlZmluZWQsIHN0YXJ0VGltZSkpO1xuXG5cdFx0XHRcdHJldHVybiB0aGlzLmNsZWFudXAodXBkYXRlLnZlcnNpb24pLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmdldFVwZGF0ZVBhY2thZ2VQYXRoKHVwZGF0ZS52ZXJzaW9uKS50aGVuKHVwZGF0ZVBhY2thZ2VQYXRoID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiBwZnMuUHJvbWlzZXMuZXhpc3RzKHVwZGF0ZVBhY2thZ2VQYXRoKS50aGVuKGV4aXN0cyA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChleGlzdHMpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVwZGF0ZVBhY2thZ2VQYXRoKTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGRvd25sb2FkUGF0aCA9IGAke3VwZGF0ZVBhY2thZ2VQYXRofS50bXBgO1xuXG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3QoeyB1cmw6IHVwZGF0ZS51cmwsIGNhbGxTaXRlOiAndXBkYXRlU2VydmljZS53aW4zMi5kb3dubG9hZFVwZGF0ZScgfSwgdG9rZW4pXG5cdFx0XHRcdFx0XHRcdFx0LnRoZW4oY29udGV4dCA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBHZXQgdG90YWwgc2l6ZSBmcm9tIENvbnRlbnQtTGVuZ3RoIGhlYWRlclxuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgY29udGVudExlbmd0aEhlYWRlciA9IGNvbnRleHQucmVzLmhlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ107XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBjb250ZW50TGVuZ3RoID0gdHlwZW9mIGNvbnRlbnRMZW5ndGhIZWFkZXIgPT09ICdzdHJpbmcnID8gY29udGVudExlbmd0aEhlYWRlciA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHRvdGFsQnl0ZXMgPSBjb250ZW50TGVuZ3RoID8gcGFyc2VJbnQoY29udGVudExlbmd0aCwgMTApIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBUcmFjayBkb3dubG9hZGVkIGJ5dGVzIGFuZCB1cGRhdGUgc3RhdGUgcGVyaW9kaWNhbGx5IHVzaW5nIERlbGF5ZXJcblx0XHRcdFx0XHRcdFx0XHRcdGxldCBkb3dubG9hZGVkQnl0ZXMgPSAwO1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgcHJvZ3Jlc3NEZWxheWVyID0gbmV3IERlbGF5ZXI8dm9pZD4oNTAwKTtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHByb2dyZXNzU3RyZWFtID0gdHJhbnNmb3JtPFZTQnVmZmVyLCBWU0J1ZmZlcj4oXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRleHQuc3RyZWFtLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGF0YTogZGF0YSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkb3dubG9hZGVkQnl0ZXMgKz0gZGF0YS5ieXRlTGVuZ3RoO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0cHJvZ3Jlc3NEZWxheWVyLnRyaWdnZXIoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLkRvd25sb2FkaW5nKHVwZGF0ZSwgZXhwbGljaXQsIHRoaXMuX292ZXJ3cml0ZSwgZG93bmxvYWRlZEJ5dGVzLCB0b3RhbEJ5dGVzLCBzdGFydFRpbWUpKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGRhdGE7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjaHVua3MgPT4gVlNCdWZmZXIuY29uY2F0KGNodW5rcylcblx0XHRcdFx0XHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZShkb3dubG9hZFBhdGgpLCBwcm9ncmVzc1N0cmVhbSlcblx0XHRcdFx0XHRcdFx0XHRcdFx0LmZpbmFsbHkoKCkgPT4gcHJvZ3Jlc3NEZWxheWVyLmRpc3Bvc2UoKSk7XG5cdFx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdFx0XHQudGhlbih1cGRhdGUuc2hhMjU2aGFzaCA/ICgpID0+IGNoZWNrc3VtKGRvd25sb2FkUGF0aCwgdXBkYXRlLnNoYTI1Nmhhc2gpIDogKCkgPT4gdW5kZWZpbmVkKVxuXHRcdFx0XHRcdFx0XHRcdC50aGVuKCgpID0+IHBmcy5Qcm9taXNlcy5yZW5hbWUoZG93bmxvYWRQYXRoLCB1cGRhdGVQYWNrYWdlUGF0aCwgZmFsc2UgLyogbm8gcmV0cnkgKi8pKVxuXHRcdFx0XHRcdFx0XHRcdC50aGVuKCgpID0+IHVwZGF0ZVBhY2thZ2VQYXRoKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pLnRoZW4ocGFja2FnZVBhdGggPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dGhpcy5hdmFpbGFibGVVcGRhdGUgPSB7IHBhY2thZ2VQYXRoIH07XG5cdFx0XHRcdFx0XHR0aGlzLnNhdmVVcGRhdGVNZXRhZGF0YSh1cGRhdGUpO1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5Eb3dubG9hZGVkKHVwZGF0ZSwgZXhwbGljaXQsIHRoaXMuX292ZXJ3cml0ZSkpO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBmYXN0VXBkYXRlc0VuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd1cGRhdGUuZW5hYmxlV2luZG93c0JhY2tncm91bmRVcGRhdGVzJyk7XG5cdFx0XHRcdFx0XHRpZiAoZmFzdFVwZGF0ZXNFbmFibGVkICYmIHRoaXMucHJvZHVjdFNlcnZpY2UudGFyZ2V0ID09PSAndXNlcicpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5kb0FwcGx5VXBkYXRlKCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLlJlYWR5KHVwZGF0ZSwgZXhwbGljaXQsIHRoaXMuX292ZXJ3cml0ZSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pXG5cdFx0XHQudGhlbih1bmRlZmluZWQsIGVyciA9PiB7XG5cdFx0XHRcdC8vIFRoZSBjaGFpbiB3YXMgY2FuY2VsbGVkIGJlY2F1c2UgdXBkYXRlcyBhcmUgYmVpbmcgZGlzYWJsZWQ7IGxlYXZlIHN0YXRlIHRvIHRoZSBkaXNhYmxlIGZsb3cuXG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCBpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7IG1lc3NhZ2VIYXNoOiBzdHJpbmcgfSwgVXBkYXRlRXJyb3JDbGFzc2lmaWNhdGlvbj4oJ3VwZGF0ZTplcnJvcicsIHsgbWVzc2FnZUhhc2g6IFN0cmluZyhoYXNoKFN0cmluZyhlcnIpKSkgfSk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnIpO1xuXG5cdFx0XHRcdC8vIG9ubHkgc2hvdyBtZXNzYWdlIHdoZW4gZXhwbGljaXRseSBjaGVja2luZyBmb3IgdXBkYXRlc1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBleHBsaWNpdCA/IChlcnIubWVzc2FnZSB8fCBlcnIpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdC8vIElmIHdlIHdlcmUgY2hlY2tpbmcgZm9yIGFuIG92ZXJ3cml0ZSB1cGRhdGUgYW5kIGl0IGZhaWxlZCxcblx0XHRcdFx0Ly8gcmVzdG9yZSB0aGUgUmVhZHkgc3RhdGUgd2l0aCB0aGUgcGVuZGluZyB1cGRhdGVcblx0XHRcdFx0aWYgKHRoaXMuc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLk92ZXJ3cml0aW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fb3ZlcndyaXRlID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5SZWFkeSh0aGlzLnN0YXRlLnVwZGF0ZSwgdGhpcy5zdGF0ZS5leHBsaWNpdCwgZmFsc2UpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLklkbGUoZ2V0VXBkYXRlVHlwZSgpLCBtZXNzYWdlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0dGhpcy5jaGVja1Byb21pc2UgPSBwcm9taXNlO1xuXG5cdFx0cHJvbWlzZS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmNoZWNrQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPT09IGN0cykge1xuXHRcdFx0XHR0aGlzLmNoZWNrQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5jaGVja1Byb21pc2UgPT09IHByb21pc2UpIHtcblx0XHRcdFx0dGhpcy5jaGVja1Byb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGRvRG93bmxvYWRVcGRhdGUoc3RhdGU6IEF2YWlsYWJsZUZvckRvd25sb2FkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHN0YXRlLnVwZGF0ZS51cmwpIHtcblx0XHRcdHRoaXMubmF0aXZlSG9zdE1haW5TZXJ2aWNlLm9wZW5FeHRlcm5hbCh1bmRlZmluZWQsIHN0YXRlLnVwZGF0ZS51cmwpO1xuXHRcdH1cblx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLklkbGUoZ2V0VXBkYXRlVHlwZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFVwZGF0ZVBhY2thZ2VQYXRoKHZlcnNpb246IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY2FjaGVQYXRoID0gYXdhaXQgdGhpcy5jYWNoZVBhdGg7XG5cdFx0cmV0dXJuIHBhdGguam9pbihjYWNoZVBhdGgsIGBDb2RlU2V0dXAtJHt0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHl9LSR7dmVyc2lvbn0uZXhlYCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNsZWFudXAoZXhjZXB0VmVyc2lvbjogc3RyaW5nIHwgbnVsbCA9IG51bGwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmaWx0ZXIgPSBleGNlcHRWZXJzaW9uID8gKG9uZTogc3RyaW5nKSA9PiAhKG5ldyBSZWdFeHAoYCR7dGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5fS0ke2V4Y2VwdFZlcnNpb259XFxcXC5leGUkYCkudGVzdChvbmUpKSA6ICgpID0+IHRydWU7XG5cblx0XHRjb25zdCBjYWNoZVBhdGggPSBhd2FpdCB0aGlzLmNhY2hlUGF0aDtcblx0XHRjb25zdCB2ZXJzaW9ucyA9IGF3YWl0IHBmcy5Qcm9taXNlcy5yZWFkZGlyKGNhY2hlUGF0aCk7XG5cblx0XHRjb25zdCBwcm9taXNlcyA9IHZlcnNpb25zLmZpbHRlcihmaWx0ZXIpLm1hcChvbmUgPT4gdGhpcy51bmxpbmsocGF0aC5qb2luKGNhY2hlUGF0aCwgb25lKSkpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBkb0FwcGx5VXBkYXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnN0YXRlLnR5cGUgIT09IFN0YXRlVHlwZS5Eb3dubG9hZGVkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmF2YWlsYWJsZVVwZGF0ZSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVwZGF0ZSA9IHRoaXMuc3RhdGUudXBkYXRlO1xuXHRcdGNvbnN0IGV4cGxpY2l0ID0gdGhpcy5zdGF0ZS5leHBsaWNpdDtcblx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLlVwZGF0aW5nKHVwZGF0ZSwgZXhwbGljaXQpKTtcblxuXHRcdGNvbnN0IGNhY2hlUGF0aCA9IGF3YWl0IHRoaXMuY2FjaGVQYXRoO1xuXHRcdGNvbnN0IHNlc3Npb25FbmRGbGFnUGF0aCA9IHBhdGguam9pbihjYWNoZVBhdGgsICdzZXNzaW9uLWVuZGluZy5mbGFnJyk7XG5cdFx0Y29uc3QgY2FuY2VsRmlsZVBhdGggPSBwYXRoLmpvaW4oY2FjaGVQYXRoLCBgY2FuY2VsLmZsYWdgKTtcblx0XHRjb25zdCBwcm9ncmVzc0ZpbGVQYXRoID0gcGF0aC5qb2luKGNhY2hlUGF0aCwgYHVwZGF0ZS1wcm9ncmVzc2ApO1xuXHRcdHRoaXMuYXZhaWxhYmxlVXBkYXRlLnVwZGF0ZUZpbGVQYXRoID0gcGF0aC5qb2luKGNhY2hlUGF0aCwgYENvZGVTZXR1cC0ke3RoaXMucHJvZHVjdFNlcnZpY2UucXVhbGl0eX0tJHt1cGRhdGUudmVyc2lvbn0uZmxhZ2ApO1xuXHRcdHRoaXMuYXZhaWxhYmxlVXBkYXRlLmNhbmNlbEZpbGVQYXRoID0gY2FuY2VsRmlsZVBhdGg7XG5cblx0XHRjb25zdCBtdXRleCA9IGF3YWl0IHRoaXMubXV0ZXg7XG5cdFx0Y29uc3Qgc2tpcHBlZFNwYXduID0gdGhpcy5pc0luc3RhbGxlckFjdGl2ZShtdXRleCk7XG5cblx0XHQvLyBTa2lwIHRoZSBzcGF3biBpZiBhbm90aGVyIElubm8gU2V0dXAgaXMgYWxyZWFkeSBydW5uaW5nIGZvciB0aGlzIHByb2R1Y3QgKGJhY2tncm91bmQgdXBkYXRlIG9yIGEgbWFudWFsIGluc3RhbGxlcik7XG5cdFx0Ly8gb3RoZXJ3aXNlIElubm8ncyBcIlNldHVwIGlzIGFscmVhZHkgcnVubmluZ1wiIG1vZGFsIHBvcHMgdXAuIFRoZSBgLXJlYWR5YCBtdXRleCBwb2xsIGJlbG93IHN0aWxsIGFkdmFuY2VzIG91ciBzdGF0ZSB3aGVuIGl0IGZpbmlzaGVzLlxuXHRcdGlmIChza2lwcGVkU3Bhd24pIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCd1cGRhdGUjZG9BcHBseVVwZGF0ZTogYW5vdGhlciBpbnN0YW5jZSBpcyBhbHJlYWR5IHJ1bm5pbmcgc2V0dXAsIHdhaXRpbmcgZm9yIGl0IHRvIGZpbmlzaCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVubGluayhjYW5jZWxGaWxlUGF0aCk7XG5cdFx0XHRhd2FpdCB0aGlzLnVubGluayhwcm9ncmVzc0ZpbGVQYXRoKTtcblx0XHRcdGF3YWl0IHBmcy5Qcm9taXNlcy53cml0ZUZpbGUodGhpcy5hdmFpbGFibGVVcGRhdGUudXBkYXRlRmlsZVBhdGgsICdmbGFnJyk7XG5cblx0XHRcdGNvbnN0IGNoaWxkID0gc3Bhd24odGhpcy5hdmFpbGFibGVVcGRhdGUucGFja2FnZVBhdGgsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnL3ZlcnlzaWxlbnQnLFxuXHRcdFx0XHRcdCcvbG9nJyxcblx0XHRcdFx0XHRgL3VwZGF0ZT1cIiR7dGhpcy5hdmFpbGFibGVVcGRhdGUudXBkYXRlRmlsZVBhdGh9XCJgLFxuXHRcdFx0XHRcdGAvcHJvZ3Jlc3M9XCIke3Byb2dyZXNzRmlsZVBhdGh9XCJgLFxuXHRcdFx0XHRcdGAvc2Vzc2lvbmVuZD1cIiR7c2Vzc2lvbkVuZEZsYWdQYXRofVwiYCxcblx0XHRcdFx0XHRgL2NhbmNlbD1cIiR7Y2FuY2VsRmlsZVBhdGh9XCJgLFxuXHRcdFx0XHRcdCcvbm9jbG9zZWFwcGxpY2F0aW9ucycsXG5cdFx0XHRcdFx0Jy9tZXJnZXRhc2tzPXJ1bmNvZGUsIWRlc2t0b3BpY29uLCFxdWlja2xhdW5jaGljb24nXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkZXRhY2hlZDogdHJ1ZSxcblx0XHRcdFx0XHRzdGRpbzogWydpZ25vcmUnLCAnaWdub3JlJywgJ2lnbm9yZSddLFxuXHRcdFx0XHRcdHdpbmRvd3NWZXJiYXRpbUFyZ3VtZW50czogdHJ1ZSxcblx0XHRcdFx0XHRlbnY6IHsgLi4ucHJvY2Vzcy5lbnYsIF9fQ09NUEFUX0xBWUVSOiAnUnVuQXNJbnZva2VyJyB9XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdC8vIFRyYWNrIHRoZSBwcm9jZXNzIHNvIHdlIGNhbiBjYW5jZWwgaXQgaWYgbmVlZGVkXG5cdFx0XHR0aGlzLmF2YWlsYWJsZVVwZGF0ZS51cGRhdGVQcm9jZXNzID0gY2hpbGQ7XG5cblx0XHRcdGNoaWxkLm9uY2UoJ2V4aXQnLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuYXZhaWxhYmxlVXBkYXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLklkbGUoZ2V0VXBkYXRlVHlwZSgpKSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUNhbmNlbGxhdGlvblRva2VuU291cmNlPy5kaXNwb3NlKHRydWUpO1xuXHRcdGNvbnN0IGN0cyA9IHRoaXMudXBkYXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCB0b2tlbiA9IGN0cy50b2tlbjtcblxuXHRcdGNvbnN0IHBvbGwgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBJZiB3ZSBza2lwcGVkIHRoZSBzcGF3biwgdGhlIGZvcmVpZ24gaW5zdGFsbGVyIHdhcyBhY3RpdmUgd2hlbiB3ZSBzdGFydGVkOyB0cmVhdCB0aGF0IGFzIGhhdmluZyBzZWVuIGl0IHJ1blxuXHRcdFx0Ly8gc28gYSBxdWljayBleGl0IChjYW5jZWwvZmFpbCkgYmVmb3JlIHRoZSBmaXJzdCBwb2xsIGl0ZXJhdGlvbiBzdGlsbCBkcm9wcyB1cyB0byBJZGxlLlxuXHRcdFx0bGV0IHNlZW5SdW5uaW5nID0gc2tpcHBlZFNwYXduO1xuXHRcdFx0d2hpbGUgKHRoaXMuc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLlVwZGF0aW5nICYmICF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRpZiAobXV0ZXguaXNBY3RpdmUodGhpcy5yZWFkeU11dGV4TmFtZSkpIHtcblx0XHRcdFx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLlJlYWR5KHVwZGF0ZSwgZXhwbGljaXQsIHRoaXMuX292ZXJ3cml0ZSkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIElubm8gZ29uZSB3aXRob3V0IGAtcmVhZHlgID0+IGluc3RhbGwgY2FuY2VsbGVkL2ZhaWxlZDsgZHJvcCB0byBJZGxlLlxuXHRcdFx0XHRpZiAodGhpcy5pc0luc3RhbGxlckFjdGl2ZShtdXRleCkpIHtcblx0XHRcdFx0XHRzZWVuUnVubmluZyA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoc2VlblJ1bm5pbmcpIHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuYXZhaWxhYmxlVXBkYXRlPy51cGRhdGVQcm9jZXNzKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmF2YWlsYWJsZVVwZGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuSWRsZShnZXRVcGRhdGVUeXBlKCkpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBwcm9ncmVzc0NvbnRlbnQgPSBhd2FpdCByZWFkRmlsZShwcm9ncmVzc0ZpbGVQYXRoLCAndXRmOCcpO1xuXHRcdFx0XHRcdGlmICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IFtjdXJyZW50U3RyLCBtYXhTdHJdID0gcHJvZ3Jlc3NDb250ZW50LnNwbGl0KCcsJyk7XG5cdFx0XHRcdFx0XHRjb25zdCBjdXJyZW50UHJvZ3Jlc3MgPSBwYXJzZUludChjdXJyZW50U3RyLCAxMCk7XG5cdFx0XHRcdFx0XHRjb25zdCBtYXhQcm9ncmVzcyA9IHBhcnNlSW50KG1heFN0ciwgMTApO1xuXHRcdFx0XHRcdFx0aWYgKCFpc05hTihjdXJyZW50UHJvZ3Jlc3MpICYmICFpc05hTihtYXhQcm9ncmVzcykgJiYgdGhpcy5zdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuVXBkYXRpbmcpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMuc3RhdGUuY3VycmVudFByb2dyZXNzICE9PSBjdXJyZW50UHJvZ3Jlc3MgfHwgdGhpcy5zdGF0ZS5tYXhQcm9ncmVzcyAhPT0gbWF4UHJvZ3Jlc3MpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLlVwZGF0aW5nKHVwZGF0ZSwgZXhwbGljaXQsIGN1cnJlbnRQcm9ncmVzcywgbWF4UHJvZ3Jlc3MpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Ly8gUHJvZ3Jlc3MgZmlsZSBtYXkgbm90IGV4aXN0IHlldCBvciBiZSBsb2NrZWQsIGlnbm9yZVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgdGltZW91dCg1MDApO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBjYW5jZWxUaW1lb3V0ID0gbmV3IFByb2Nlc3NUaW1lUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybigndXBkYXRlI2RvQXBwbHlVcGRhdGU6IHBvbGxpbmcgdGltZWQgb3V0IHdhaXRpbmcgZm9yIHVwZGF0ZSB0byBiZSByZWFkeScpO1xuXHRcdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5JZGxlKGdldFVwZGF0ZVR5cGUoKSwgJ1VwZGF0ZSBkaWQgbm90IGNvbXBsZXRlIHdpdGhpbiBleHBlY3RlZCB0aW1lJykpO1xuXHRcdH0sIDYwICogNjAgKiAxMDAwKTtcblxuXHRcdC8vIFBvbGwgZm9yIHByb2dyZXNzIGFuZCByZWFkeSBtdXRleCBmb3IgMSBob3VyLlxuXHRcdGNhbmNlbFRpbWVvdXQuc2NoZWR1bGUoKTtcblx0XHRwb2xsKCkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRjYW5jZWxUaW1lb3V0LmRpc3Bvc2UoKTtcblx0XHRcdGlmICh0aGlzLnVwZGF0ZUNhbmNlbGxhdGlvblRva2VuU291cmNlID09PSBjdHMpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgY2FuY2VsVXBkYXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIEFib3J0IGFuIGluLWZsaWdodCBjaGVjay9kb3dubG9hZCBzbyBpdCBuZXZlciByZWFjaGVzIHRoZSBiYWNrZ3JvdW5kIGluc3RhbGxlci5cblx0XHRjb25zdCBoYWRJbkZsaWdodENoZWNrID0gISF0aGlzLmNoZWNrQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U7XG5cdFx0Y29uc3QgaGFkUGVuZGluZ1VwZGF0ZSA9ICEhdGhpcy5hdmFpbGFibGVVcGRhdGU7XG5cdFx0dGhpcy5jaGVja0NhbmNlbGxhdGlvblRva2VuU291cmNlPy5kaXNwb3NlKHRydWUpO1xuXHRcdHRoaXMuY2hlY2tDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIE9ubHkgY2xlYW4gdXAgaWYgYSBjaGVjay9kb3dubG9hZCB3YXMgaW4gZmxpZ2h0OyBhdm9pZHMgY3JlYXRpbmcgdGhlIGNhY2hlIGRpciB3aGVuIGp1c3QgZGlzYWJsZWQuXG5cdFx0aWYgKGhhZEluRmxpZ2h0Q2hlY2spIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY2hlY2tQcm9taXNlO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIHRoZSBjaGFpbiBzd2FsbG93cyBpdHMgb3duIGVycm9yczsgaWdub3JlXG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLmNsZWFudXBUZW1wRmlsZXMoKTtcblx0XHR9XG5cblx0XHQvLyBUZWFyIGRvd24gYW55IHBlbmRpbmcgKGRvd25sb2FkZWQvYXBwbHlpbmcpIHVwZGF0ZS5cblx0XHRhd2FpdCB0aGlzLmNhbmNlbFBlbmRpbmdVcGRhdGUoKTtcblxuXHRcdC8vIFJlY2xhaW0gYSBwYXJ0aWFsIHZlcnNpb25lZC1yZXNvdXJjZSBmb2xkZXIgYSBjYW5jZWxsZWQgdXBkYXRlIG1heSBsZWF2ZTsgb25seSBhZnRlciByZWFsIHRlYXJkb3duLlxuXHRcdGlmIChoYWRJbkZsaWdodENoZWNrIHx8IGhhZFBlbmRpbmdVcGRhdGUpIHtcblx0XHRcdHRoaXMuY29sbGVjdEdhcmJhZ2UoKS5jYXRjaChlcnIgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKCd1cGRhdGUjY29sbGVjdEdhcmJhZ2UgLSBmYWlsZWQgdG8gY29sbGVjdCBnYXJiYWdlJywgZXJyKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjbGVhbnVwVGVtcEZpbGVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjYWNoZVBhdGggPSBhd2FpdCB0aGlzLmNhY2hlUGF0aDtcblx0XHRcdGNvbnN0IGZpbGVzID0gYXdhaXQgcGZzLlByb21pc2VzLnJlYWRkaXIoY2FjaGVQYXRoKTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGZpbGVzLmZpbHRlcihmaWxlID0+IGZpbGUuZW5kc1dpdGgoJy50bXAnKSkubWFwKGZpbGUgPT4gdGhpcy51bmxpbmsocGF0aC5qb2luKGNhY2hlUGF0aCwgZmlsZSkpKSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybigndXBkYXRlI2NsZWFudXBUZW1wRmlsZXM6IGZhaWxlZCB0byByZW1vdmUgdGVtcG9yYXJ5IGRvd25sb2FkIGZpbGVzJywgZXJyKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgY2FuY2VsUGVuZGluZ1VwZGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuYXZhaWxhYmxlVXBkYXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB1cGRhdGVQcm9jZXNzLCB1cGRhdGVGaWxlUGF0aCwgY2FuY2VsRmlsZVBhdGggfSA9IHRoaXMuYXZhaWxhYmxlVXBkYXRlO1xuXG5cdFx0Ly8gQW5vdGhlciBpbnN0YW5jZSBvd25zIHRoZSBpbnN0YWxsZXI6IGFib3J0IGlmIGl0J3Mgc3RpbGwgcnVubmluZyBzbyB3ZSBkb24ndCBzdGFydCBhIG5ld1xuXHRcdC8vIHVwZGF0ZSBjeWNsZSBvbiB0b3Agb2YgaXQ7IGtlZXAgYGF2YWlsYWJsZVVwZGF0ZWAgc28gcXVpdC1hbmQtaW5zdGFsbCBjYW4gc3RpbGwgY29tcGxldGUuXG5cdFx0aWYgKCF1cGRhdGVQcm9jZXNzICYmIHRoaXMuaXNJbnN0YWxsZXJBY3RpdmUoYXdhaXQgdGhpcy5tdXRleCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IGNhbmNlbCBwZW5kaW5nIHVwZGF0ZTogYW5vdGhlciBpbnN0YW5jZSBpcyBzdGlsbCBydW5uaW5nIHNldHVwJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FuY2VsIHRoZSBwb2xsaW5nIGxvb3Bcblx0XHR0aGlzLnVwZGF0ZUNhbmNlbGxhdGlvblRva2VuU291cmNlPy5kaXNwb3NlKHRydWUpO1xuXHRcdHRoaXMudXBkYXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAodXBkYXRlUHJvY2VzcyAmJiB1cGRhdGVQcm9jZXNzLmV4aXRDb2RlID09PSBudWxsKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3VwZGF0ZSNjYW5jZWxQZW5kaW5nVXBkYXRlOiBjYW5jZWxsaW5nIHBlbmRpbmcgdXBkYXRlJyk7XG5cblx0XHRcdC8vIFJlbW92ZSBhbGwgbGlzdGVuZXJzIHRvIHByZXZlbnQgdGhlIGV4aXQgaGFuZGxlciBmcm9tIGNoYW5naW5nIHN0YXRlXG5cdFx0XHR1cGRhdGVQcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycygpO1xuXHRcdFx0Y29uc3QgZXhpdFByb21pc2UgPSBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IHVwZGF0ZVByb2Nlc3Mub25jZSgnZXhpdCcsICgpID0+IHJlc29sdmUodHJ1ZSkpKTtcblxuXHRcdFx0Ly8gV3JpdGUgdGhlIGNhbmNlbCBmaWxlIHRvIHNpZ25hbCBJbm5vIFNldHVwIHRvIGV4aXQgZ3JhY2VmdWxseVxuXHRcdFx0aWYgKGNhbmNlbEZpbGVQYXRoKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgcGZzLlByb21pc2VzLndyaXRlRmlsZShjYW5jZWxGaWxlUGF0aCwgJ2NhbmNlbCcpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybigndXBkYXRlI2NhbmNlbFBlbmRpbmdVcGRhdGU6IGZhaWxlZCB0byB3cml0ZSBjYW5jZWwgZmlsZScsIGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIHByb2Nlc3MgdG8gZXhpdCBncmFjZWZ1bGx5LCB0aGVuIGZvcmNlLWtpbGwgaWYgbmVlZGVkXG5cdFx0XHRjb25zdCBwaWQgPSB1cGRhdGVQcm9jZXNzLnBpZDtcblx0XHRcdGNvbnN0IGV4aXRlZCA9IGF3YWl0IFByb21pc2UucmFjZShbZXhpdFByb21pc2UsIHRpbWVvdXQoMzAgKiAxMDAwKS50aGVuKCgpID0+IGZhbHNlKV0pO1xuXHRcdFx0aWYgKHBpZCAmJiAhZXhpdGVkKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgndXBkYXRlI2NhbmNlbFBlbmRpbmdVcGRhdGU6IHByb2Nlc3MgZGlkIG5vdCBleGl0IGdyYWNlZnVsbHksIGtpbGxpbmcgcHJvY2VzcyB0cmVlJyk7XG5cdFx0XHRcdGF3YWl0IGtpbGxUcmVlKHBpZCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYW4gdXAgdGhlIGZsYWcgZmlsZVxuXHRcdGF3YWl0IHRoaXMudW5saW5rKHVwZGF0ZUZpbGVQYXRoKTtcblxuXHRcdC8vIENsZWFuIHVwIHRoZSBjYW5jZWwgZmlsZVxuXHRcdGF3YWl0IHRoaXMudW5saW5rKGNhbmNlbEZpbGVQYXRoKTtcblxuXHRcdHRoaXMuYXZhaWxhYmxlVXBkYXRlID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGRvUXVpdEFuZEluc3RhbGwoKTogdm9pZCB7XG5cdFx0aWYgKCh0aGlzLnN0YXRlLnR5cGUgIT09IFN0YXRlVHlwZS5SZWFkeSAmJiB0aGlzLnN0YXRlLnR5cGUgIT09IFN0YXRlVHlwZS5SZXN0YXJ0aW5nKSB8fCAhdGhpcy5hdmFpbGFibGVVcGRhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3VwZGF0ZSNxdWl0QW5kSW5zdGFsbCgpOiBydW5uaW5nIHJhdyNxdWl0QW5kSW5zdGFsbCgpJyk7XG5cblx0XHRpZiAodGhpcy5hdmFpbGFibGVVcGRhdGUudXBkYXRlRmlsZVBhdGgpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHVubGlua1N5bmModGhpcy5hdmFpbGFibGVVcGRhdGUudXBkYXRlRmlsZVBhdGgpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRzcGF3bih0aGlzLmF2YWlsYWJsZVVwZGF0ZS5wYWNrYWdlUGF0aCwgWycvc2lsZW50JywgJy9sb2cnLCAnL21lcmdldGFza3M9cnVuY29kZSwhZGVza3RvcGljb24sIXF1aWNrbGF1bmNoaWNvbiddLCB7XG5cdFx0XHRcdGRldGFjaGVkOiB0cnVlLFxuXHRcdFx0XHRzdGRpbzogWydpZ25vcmUnLCAnaWdub3JlJywgJ2lnbm9yZSddLFxuXHRcdFx0XHRlbnY6IHsgLi4ucHJvY2Vzcy5lbnYsIF9fQ09NUEFUX0xBWUVSOiAnUnVuQXNJbnZva2VyJyB9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNhdmVVcGRhdGVNZXRhZGF0YSh1cGRhdGU6IElVcGRhdGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY2FjaGVQYXRoID0gYXdhaXQgdGhpcy5jYWNoZVBhdGg7XG5cdFx0XHRjb25zdCBtZXRhZGF0YVBhdGggPSBwYXRoLmpvaW4oY2FjaGVQYXRoLCAndXBkYXRlLW1ldGFkYXRhLmpzb24nKTtcblx0XHRcdGF3YWl0IHBmcy5Qcm9taXNlcy53cml0ZUZpbGUobWV0YWRhdGFQYXRoLCBKU09OLnN0cmluZ2lmeSh1cGRhdGUpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ3VwZGF0ZSNzYXZlVXBkYXRlTWV0YWRhdGE6IGZhaWxlZCB0byBzYXZlJywgZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsb2FkVXBkYXRlTWV0YWRhdGEoKTogUHJvbWlzZTxJVXBkYXRlIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNhY2hlUGF0aCA9IGF3YWl0IHRoaXMuY2FjaGVQYXRoO1xuXHRcdFx0Y29uc3QgbWV0YWRhdGFQYXRoID0gcGF0aC5qb2luKGNhY2hlUGF0aCwgJ3VwZGF0ZS1tZXRhZGF0YS5qc29uJyk7XG5cdFx0XHRpZiAoYXdhaXQgcGZzLlByb21pc2VzLmV4aXN0cyhtZXRhZGF0YVBhdGgpKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCByZWFkRmlsZShtZXRhZGF0YVBhdGgsICd1dGY4Jyk7XG5cdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcigndXBkYXRlI2xvYWRVcGRhdGVNZXRhZGF0YTogZmFpbGVkIHRvIGxvYWQnLCBlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRVcGRhdGVUeXBlKCk6IFVwZGF0ZVR5cGUge1xuXHRcdHJldHVybiBnZXRVcGRhdGVUeXBlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBfYXBwbHlTcGVjaWZpY1VwZGF0ZShwYWNrYWdlUGF0aDogc3RyaW5nLCBjb21taXQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zdGF0ZS50eXBlICE9PSBTdGF0ZVR5cGUuSWRsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZhc3RVcGRhdGVzRW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3VwZGF0ZS5lbmFibGVXaW5kb3dzQmFja2dyb3VuZFVwZGF0ZXMnKTtcblx0XHRjb25zdCB1cGRhdGU6IElVcGRhdGUgPSBhd2FpdCB0aGlzLmxvYWRVcGRhdGVNZXRhZGF0YSgpID8/IHsgdmVyc2lvbjogY29tbWl0ID8/ICd1bmtub3duJywgcHJvZHVjdFZlcnNpb246ICd1bmtub3duJyB9O1xuXG5cdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5Eb3dubG9hZGluZyh1cGRhdGUsIHRydWUsIGZhbHNlKSk7XG5cdFx0dGhpcy5hdmFpbGFibGVVcGRhdGUgPSB7IHBhY2thZ2VQYXRoIH07XG5cdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5Eb3dubG9hZGVkKHVwZGF0ZSwgdHJ1ZSwgZmFsc2UpKTtcblxuXHRcdGlmIChmYXN0VXBkYXRlc0VuYWJsZWQgJiYgdGhpcy5wcm9kdWN0U2VydmljZS50YXJnZXQgPT09ICd1c2VyJykge1xuXHRcdFx0dGhpcy5kb0FwcGx5VXBkYXRlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuUmVhZHkodXBkYXRlLCB0cnVlLCBmYWxzZSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNJbnN0YWxsZXJBY3RpdmUobXV0ZXg6IHR5cGVvZiBpbXBvcnQoJ0B2c2NvZGUvd2luZG93cy1tdXRleCcpKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIG11dGV4LmlzQWN0aXZlKHRoaXMudXBkYXRpbmdNdXRleE5hbWUpIHx8IG11dGV4LmlzQWN0aXZlKHRoaXMuc2V0dXBNdXRleE5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1bmxpbmsocGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHBhdGgpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHVubGluayhwYXRoKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRjb25zdCBlcnJvciA9IGVyciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb247XG5cdFx0XHRcdGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSAnRU5PRU5UJykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgdXBkYXRlI3VubGluazogZmFpbGVkIHRvIHVubGluayAke2Jhc2VuYW1lKHBhdGgpfWAsIGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBdUIsYUFBYTtBQUNwQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxPQUFPLFVBQVUsY0FBYztBQUN4QyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFNBQVMsNkJBQTZCLGVBQWU7QUFDOUQsU0FBUyxnQkFBZ0I7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
