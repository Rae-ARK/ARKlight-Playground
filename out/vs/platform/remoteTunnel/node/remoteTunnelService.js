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
import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREVENT_SLEEP, LOGGER_NAME, LOG_ID, TunnelStates, INACTIVE_TUNNEL_MODE } from "../common/remoteTunnel.js";
import { Emitter } from "../../../base/common/event.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { INativeEnvironmentService } from "../../environment/common/environment.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { ILoggerService, LogLevelToString } from "../../log/common/log.js";
import { dirname, join } from "../../../base/common/path.js";
import { spawn } from "child_process";
import { IProductService } from "../../product/common/productService.js";
import { isMacintosh, isWindows } from "../../../base/common/platform.js";
import { createCancelablePromise, Delayer } from "../../../base/common/async.js";
import { ISharedProcessLifecycleService } from "../../lifecycle/node/sharedProcessLifecycleService.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { localize } from "../../../nls.js";
import { hostname, homedir } from "os";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { isString } from "../../../base/common/types.js";
import { StreamSplitter } from "../../../base/node/nodeStreams.js";
import { joinPath } from "../../../base/common/resources.js";
const restartTunnelOnConfigurationChanges = [
  CONFIGURATION_KEY_HOST_NAME,
  CONFIGURATION_KEY_PREVENT_SLEEP
];
const TUNNEL_ACCESS_SESSION = "remoteTunnelSession";
const TUNNEL_ACCESS_IS_SERVICE = "remoteTunnelIsService";
let RemoteTunnelService = class extends Disposable {
  constructor(telemetryService, productService, environmentService, loggerService, sharedProcessLifecycleService, configurationService, storageService) {
    super();
    this.telemetryService = telemetryService;
    this.productService = productService;
    this.environmentService = environmentService;
    this.configurationService = configurationService;
    this.storageService = storageService;
    this._onDidTokenFailedEmitter = this._register(new Emitter());
    this.onDidTokenFailed = this._onDidTokenFailedEmitter.event;
    this._onDidChangeTunnelStatusEmitter = this._register(new Emitter());
    this.onDidChangeTunnelStatus = this._onDidChangeTunnelStatusEmitter.event;
    this._onDidChangeModeEmitter = this._register(new Emitter());
    this.onDidChangeMode = this._onDidChangeModeEmitter.event;
    /**
     * "Mode" in the terminal state we want to get to -- started, stopped, and
     * the attributes associated with each.
     *
     * At any given time, work may be ongoing to get `_tunnelStatus` into a
     * state that reflects the desired `mode`.
     */
    this._mode = INACTIVE_TUNNEL_MODE;
    this._initialized = false;
    this.defaultOnOutput = (a, isErr) => {
      if (isErr) {
        this._logger.error(a);
      } else {
        this._logger.info(a);
      }
    };
    this._logger = this._register(loggerService.createLogger(joinPath(environmentService.logsHome, `${LOG_ID}.log`), { id: LOG_ID, name: LOGGER_NAME }));
    this._startTunnelProcessDelayer = this._register(new Delayer(100));
    this._register(this._logger.onDidChangeLogLevel((l) => this._logger.info("Log level changed to " + LogLevelToString(l))));
    this._register(sharedProcessLifecycleService.onWillShutdown(() => {
      this._tunnelProcess?.cancel();
      this._tunnelProcess = void 0;
      this.dispose();
    }));
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (restartTunnelOnConfigurationChanges.some((c) => e.affectsConfiguration(c))) {
        this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
      }
    }));
    this._mode = this._restoreMode();
    this._tunnelStatus = TunnelStates.uninitialized;
  }
  async getTunnelStatus() {
    return this._tunnelStatus;
  }
  setTunnelStatus(tunnelStatus) {
    this._tunnelStatus = tunnelStatus;
    this._onDidChangeTunnelStatusEmitter.fire(tunnelStatus);
  }
  setMode(mode) {
    if (isSameMode(this._mode, mode)) {
      return;
    }
    this._mode = mode;
    this._storeMode(mode);
    this._onDidChangeModeEmitter.fire(this._mode);
    if (mode.active) {
      this._logger.info(`Session updated: ${mode.session.accountLabel} (${mode.session.providerId}) (service=${mode.asService})`);
      if (mode.session.token) {
        this._logger.info(`Session token updated: ${mode.session.accountLabel} (${mode.session.providerId})`);
      }
    } else {
      this._logger.info(`Session reset`);
    }
  }
  getMode() {
    return Promise.resolve(this._mode);
  }
  async initialize(mode) {
    if (this._initialized) {
      return this._tunnelStatus;
    }
    this._initialized = true;
    this.setMode(mode);
    try {
      await this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
    } catch (e) {
      this._logger.error(e);
    }
    return this._tunnelStatus;
  }
  getTunnelCommandLocation() {
    if (!this._tunnelCommand) {
      let binParentLocation;
      if (isMacintosh) {
        binParentLocation = this.environmentService.appRoot;
      } else if (isWindows) {
        if (this.productService.win32VersionedUpdate) {
          binParentLocation = dirname(dirname(dirname(this.environmentService.appRoot)));
        } else {
          binParentLocation = dirname(dirname(this.environmentService.appRoot));
        }
      } else {
        binParentLocation = dirname(dirname(this.environmentService.appRoot));
      }
      this._tunnelCommand = join(binParentLocation, "bin", `${this.productService.tunnelApplicationName}${isWindows ? ".exe" : ""}`);
    }
    return this._tunnelCommand;
  }
  async startTunnel(mode) {
    if (isSameMode(this._mode, mode) && this._tunnelStatus.type !== "disconnected") {
      return this._tunnelStatus;
    }
    this.setMode(mode);
    try {
      await this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
    } catch (e) {
      this._logger.error(e);
    }
    return this._tunnelStatus;
  }
  async stopTunnel() {
    if (this._tunnelProcess) {
      this._tunnelProcess.cancel();
      this._tunnelProcess = void 0;
    }
    if (this._mode.active) {
      const needsServiceUninstall = this._mode.asService;
      this.setMode(INACTIVE_TUNNEL_MODE);
      try {
        if (needsServiceUninstall) {
          this.runCodeTunnelCommand("uninstallService", ["service", "uninstall"]);
        }
      } catch (e) {
        this._logger.error(e);
      }
    }
    try {
      await this.runCodeTunnelCommand("stop", ["kill"]);
    } catch (e) {
      this._logger.error(e);
    }
    this.setTunnelStatus(TunnelStates.disconnected());
  }
  async updateTunnelProcess() {
    const tunnelName = this._getTunnelName();
    this.telemetryService.publicLog2("remoteTunnel.enablement", {
      enabled: this._mode.active,
      service: this._mode.active && this._mode.asService,
      tunnelName
    });
    if (this._tunnelProcess) {
      this._tunnelProcess.cancel();
      this._tunnelProcess = void 0;
    }
    let output = "";
    let isServiceInstalled = false;
    const onOutput = (a, isErr) => {
      if (isErr) {
        this._logger.error(a);
      } else {
        output += a;
      }
      if (!this.environmentService.isBuilt && a.startsWith("   Compiling")) {
        this.setTunnelStatus(TunnelStates.connecting(localize("remoteTunnelService.building", "Building CLI from sources")));
      }
    };
    const statusProcess = this.runCodeTunnelCommand("status", ["status"], onOutput);
    this._tunnelProcess = statusProcess;
    try {
      await statusProcess;
      if (this._tunnelProcess !== statusProcess) {
        return;
      }
      let status;
      try {
        status = JSON.parse(output.trim().split("\n").find((l) => l.startsWith("{")));
      } catch (e) {
        this._logger.error(`Could not parse status output: ${JSON.stringify(output.trim())}`);
        this.setTunnelStatus(TunnelStates.disconnected());
        return;
      }
      isServiceInstalled = status.service_installed;
      this._logger.info(status.tunnel ? "Other tunnel running, attaching..." : "No other tunnel running");
      if (!status.tunnel && !this._mode.active) {
        this.setTunnelStatus(TunnelStates.disconnected());
        return;
      }
    } catch (e) {
      this._logger.error(e);
      this.setTunnelStatus(TunnelStates.disconnected());
      return;
    } finally {
      if (this._tunnelProcess === statusProcess) {
        this._tunnelProcess = void 0;
      }
    }
    const session = this._mode.active ? this._mode.session : void 0;
    if (session && session.token) {
      const token = session.token;
      this.setTunnelStatus(TunnelStates.connecting(localize({ key: "remoteTunnelService.authorizing", comment: ["{0} is a user account name, {1} a provider name (e.g. Github)"] }, "Connecting as {0} ({1})", session.accountLabel, session.providerId)));
      const onLoginOutput = (a, isErr) => {
        a = a.replaceAll(token, "*".repeat(4));
        onOutput(a, isErr);
      };
      const loginProcess = this.runCodeTunnelCommand("login", ["user", "login", "--provider", session.providerId, "--log", LogLevelToString(this._logger.getLevel())], onLoginOutput, { VSCODE_CLI_ACCESS_TOKEN: token });
      this._tunnelProcess = loginProcess;
      try {
        await loginProcess;
        if (this._tunnelProcess !== loginProcess) {
          return;
        }
      } catch (e) {
        this._logger.error(e);
        this._tunnelProcess = void 0;
        this._onDidTokenFailedEmitter.fire(session);
        this.setTunnelStatus(TunnelStates.disconnected(session));
        return;
      }
    }
    const hostName = this._getTunnelName();
    if (hostName) {
      this.setTunnelStatus(TunnelStates.connecting(localize({ key: "remoteTunnelService.openTunnelWithName", comment: ["{0} is a tunnel name"] }, "Opening tunnel {0}", hostName)));
    } else {
      this.setTunnelStatus(TunnelStates.connecting(localize("remoteTunnelService.openTunnel", "Opening tunnel")));
    }
    const args = ["--accept-server-license-terms", "--log", LogLevelToString(this._logger.getLevel())];
    if (hostName) {
      args.push("--name", hostName);
    } else {
      args.push("--random-name");
    }
    let serviceInstallFailed = false;
    if (this._mode.active && this._mode.asService && !isServiceInstalled) {
      serviceInstallFailed = await this.installTunnelService(args) === false;
    }
    return this.serverOrAttachTunnel(session, args, serviceInstallFailed);
  }
  async installTunnelService(args) {
    let status;
    try {
      status = await this.runCodeTunnelCommand("serviceInstall", ["service", "install", ...args]);
    } catch (e) {
      this._logger.error(e);
      status = 1;
    }
    if (status !== 0) {
      const msg = localize("remoteTunnelService.serviceInstallFailed", "Failed to install tunnel as a service, starting in session...");
      this._logger.warn(msg);
      this.setTunnelStatus(TunnelStates.connecting(msg));
      return false;
    }
    return true;
  }
  async serverOrAttachTunnel(session, args, serviceInstallFailed) {
    args.push("--parent-process-id", String(process.pid));
    if (this._preventSleep()) {
      args.push("--no-sleep");
    }
    let isAttached = false;
    const serveCommand = this.runCodeTunnelCommand("tunnel", args, (message, isErr) => {
      if (isErr) {
        this._logger.error(message);
      } else {
        this._logger.info(message);
      }
      if (message.includes("Connected to an existing tunnel process")) {
        isAttached = true;
      }
      const m = message.match(/Open this link in your browser (https:\/\/([^\/\s]+)\/([^\/\s]+)\/([^\/\s]+))/);
      if (m) {
        const info = { link: m[1], domain: m[2], tunnelName: m[4], isAttached };
        this.telemetryService.publicLog2("remoteTunnel.connected", {
          tunnelName: info.tunnelName,
          isAttached: info.isAttached
        });
        this.setTunnelStatus(TunnelStates.connected(info, serviceInstallFailed));
      } else if (message.match(/error refreshing token/)) {
        serveCommand.cancel();
        this._onDidTokenFailedEmitter.fire(session);
        this.setTunnelStatus(TunnelStates.disconnected(session));
      }
    });
    this._tunnelProcess = serveCommand;
    serveCommand.finally(() => {
      if (serveCommand === this._tunnelProcess) {
        this._logger.info(`tunnel process terminated`);
        this._tunnelProcess = void 0;
        this._mode = INACTIVE_TUNNEL_MODE;
        this.setTunnelStatus(TunnelStates.disconnected());
      }
    });
  }
  runCodeTunnelCommand(logLabel, commandArgs, onOutput = this.defaultOnOutput, env) {
    return createCancelablePromise((token) => {
      return new Promise((resolve, reject) => {
        if (token.isCancellationRequested) {
          resolve(-1);
        }
        let tunnelProcess;
        const stdio = ["ignore", "pipe", "pipe"];
        token.onCancellationRequested(() => {
          if (tunnelProcess) {
            this._logger.info(`${logLabel} terminating(${tunnelProcess.pid})`);
            tunnelProcess.kill();
          }
        });
        if (!this.environmentService.isBuilt) {
          onOutput("Building tunnel CLI from sources and run\n", false);
          onOutput(`${logLabel} Spawning: cargo run -- tunnel ${commandArgs.join(" ")}
`, false);
          tunnelProcess = spawn("cargo", ["run", "--", "tunnel", ...commandArgs], { cwd: join(this.environmentService.appRoot, "cli"), stdio, env: { ...process.env, RUST_BACKTRACE: "1", ...env } });
        } else {
          onOutput("Running tunnel CLI\n", false);
          const tunnelCommand = this.getTunnelCommandLocation();
          onOutput(`${logLabel} Spawning: ${tunnelCommand} tunnel ${commandArgs.join(" ")}
`, false);
          tunnelProcess = spawn(tunnelCommand, ["tunnel", ...commandArgs], { cwd: homedir(), stdio, env: { ...process.env, ...env } });
        }
        tunnelProcess.stdout.pipe(new StreamSplitter("\n")).on("data", (data) => {
          if (tunnelProcess) {
            const message = data.toString();
            onOutput(message, false);
          }
        });
        tunnelProcess.stderr.pipe(new StreamSplitter("\n")).on("data", (data) => {
          if (tunnelProcess) {
            const message = data.toString();
            onOutput(message, true);
          }
        });
        tunnelProcess.on("exit", (e) => {
          if (tunnelProcess) {
            onOutput(`${logLabel} exit(${tunnelProcess.pid}): + ${e} `, false);
            tunnelProcess = void 0;
            resolve(e || 0);
          }
        });
        tunnelProcess.on("error", (e) => {
          if (tunnelProcess) {
            onOutput(`${logLabel} error(${tunnelProcess.pid}): + ${e} `, true);
            tunnelProcess = void 0;
            reject();
          }
        });
      });
    });
  }
  async getTunnelName() {
    return this._getTunnelName();
  }
  _preventSleep() {
    return !!this.configurationService.getValue(CONFIGURATION_KEY_PREVENT_SLEEP);
  }
  _getTunnelName() {
    let name = this.configurationService.getValue(CONFIGURATION_KEY_HOST_NAME) || hostname();
    name = name.replace(/^-+/g, "").replace(/[^\w-]/g, "").substring(0, 20);
    return name || void 0;
  }
  _restoreMode() {
    try {
      const tunnelAccessSession = this.storageService.get(TUNNEL_ACCESS_SESSION, StorageScope.APPLICATION);
      const asService = this.storageService.getBoolean(TUNNEL_ACCESS_IS_SERVICE, StorageScope.APPLICATION, false);
      if (tunnelAccessSession) {
        const session = JSON.parse(tunnelAccessSession);
        if (session && isString(session.accountLabel) && isString(session.sessionId) && isString(session.providerId)) {
          return { active: true, session, asService };
        }
        this._logger.error("Problems restoring session from storage, invalid format", session);
      }
    } catch (e) {
      this._logger.error("Problems restoring session from storage", e);
    }
    return INACTIVE_TUNNEL_MODE;
  }
  _storeMode(mode) {
    if (mode.active) {
      const sessionWithoutToken = {
        providerId: mode.session.providerId,
        sessionId: mode.session.sessionId,
        accountLabel: mode.session.accountLabel
      };
      this.storageService.store(TUNNEL_ACCESS_SESSION, JSON.stringify(sessionWithoutToken), StorageScope.APPLICATION, StorageTarget.MACHINE);
      this.storageService.store(TUNNEL_ACCESS_IS_SERVICE, mode.asService, StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(TUNNEL_ACCESS_SESSION, StorageScope.APPLICATION);
      this.storageService.remove(TUNNEL_ACCESS_IS_SERVICE, StorageScope.APPLICATION);
    }
  }
};
RemoteTunnelService = __decorateClass([
  __decorateParam(0, ITelemetryService),
  __decorateParam(1, IProductService),
  __decorateParam(2, INativeEnvironmentService),
  __decorateParam(3, ILoggerService),
  __decorateParam(4, ISharedProcessLifecycleService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IStorageService)
], RemoteTunnelService);
function isSameSession(a1, a2) {
  if (a1 && a2) {
    return a1.sessionId === a2.sessionId && a1.providerId === a2.providerId && a1.token === a2.token;
  }
  return a1 === a2;
}
const isSameMode = (a, b) => {
  if (a.active !== b.active) {
    return false;
  } else if (a.active && b.active) {
    return a.asService === b.asService && isSameSession(a.session, b.session);
  } else {
    return true;
  }
};
export {
  RemoteTunnelService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3JlbW90ZVR1bm5lbC9ub2RlL3JlbW90ZVR1bm5lbFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDT05GSUdVUkFUSU9OX0tFWV9IT1NUX05BTUUsIENPTkZJR1VSQVRJT05fS0VZX1BSRVZFTlRfU0xFRVAsIENvbm5lY3Rpb25JbmZvLCBJUmVtb3RlVHVubmVsU2Vzc2lvbiwgSVJlbW90ZVR1bm5lbFNlcnZpY2UsIExPR0dFUl9OQU1FLCBMT0dfSUQsIFR1bm5lbFN0YXRlcywgVHVubmVsU3RhdHVzLCBUdW5uZWxNb2RlLCBJTkFDVElWRV9UVU5ORUxfTU9ERSwgQWN0aXZlVHVubmVsTW9kZSB9IGZyb20gJy4uL2NvbW1vbi9yZW1vdGVUdW5uZWwuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElMb2dnZXIsIElMb2dnZXJTZXJ2aWNlLCBMb2dMZXZlbFRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgam9pbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgQ2hpbGRQcm9jZXNzLCBTdGRpb09wdGlvbnMsIHNwYXduIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVNoYXJlZFByb2Nlc3NMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL25vZGUvc2hhcmVkUHJvY2Vzc0xpZmVjeWNsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBob3N0bmFtZSwgaG9tZWRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFN0cmVhbVNwbGl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL25vZGVTdHJlYW1zLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcblxudHlwZSBSZW1vdGVUdW5uZWxFbmFibGVtZW50Q2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnYWVzY2hsaSc7XG5cdGNvbW1lbnQ6ICdSZXBvcnRpbmcgd2hlbiBSZW1vdGUgVHVubmVsIGFjY2VzcyBpcyB0dXJuZWQgb24gb3Igb2ZmJztcblx0ZW5hYmxlZD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdGbGFnIGluZGljYXRpbmcgaWYgUmVtb3RlIFR1bm5lbCBBY2Nlc3MgaXMgZW5hYmxlZCBvciBub3QnIH07XG5cdHNlcnZpY2U/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRmxhZyBpbmRpY2F0aW5nIGlmIFJlbW90ZSBUdW5uZWwgQWNjZXNzIGlzIGluc3RhbGxlZCBhcyBhIHNlcnZpY2UnIH07XG5cdHR1bm5lbE5hbWU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG5hbWUgb2YgdGhlIHR1bm5lbCBiZWluZyBlbmFibGVkIG9yIGRpc2FibGVkJyB9O1xufTtcblxudHlwZSBSZW1vdGVUdW5uZWxFbmFibGVtZW50RXZlbnQgPSB7XG5cdGVuYWJsZWQ6IGJvb2xlYW47XG5cdHNlcnZpY2U6IGJvb2xlYW47XG5cdHR1bm5lbE5hbWU/OiBzdHJpbmc7XG59O1xuXG50eXBlIFJlbW90ZVR1bm5lbENvbm5lY3RlZENsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2Flc2NobGknO1xuXHRjb21tZW50OiAnUmVwb3J0aW5nIHdoZW4gYSBSZW1vdGUgVHVubmVsIGNvbm5lY3Rpb24gaXMgZXN0YWJsaXNoZWQnO1xuXHR0dW5uZWxOYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG5hbWUgb2YgdGhlIGNvbm5lY3RlZCB0dW5uZWwnIH07XG5cdGlzQXR0YWNoZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBjb25uZWN0aW9uIGlzIGF0dGFjaGVkIHRvIGFuIGV4aXN0aW5nIHR1bm5lbCBwcm9jZXNzJyB9O1xufTtcblxudHlwZSBSZW1vdGVUdW5uZWxDb25uZWN0ZWRFdmVudCA9IHtcblx0dHVubmVsTmFtZTogc3RyaW5nO1xuXHRpc0F0dGFjaGVkOiBib29sZWFuO1xufTtcblxuY29uc3QgcmVzdGFydFR1bm5lbE9uQ29uZmlndXJhdGlvbkNoYW5nZXM6IHJlYWRvbmx5IHN0cmluZ1tdID0gW1xuXHRDT05GSUdVUkFUSU9OX0tFWV9IT1NUX05BTUUsXG5cdENPTkZJR1VSQVRJT05fS0VZX1BSRVZFTlRfU0xFRVAsXG5dO1xuXG4vLyBUaGlzIGlzIHRoZSBzZXNzaW9uIHVzZWQgcnVuIHRoZSB0dW5uZWwgYWNjZXNzLlxuLy8gaWYgc2V0LCB0aGUgcmVtb3RlIHR1bm5lbCBhY2Nlc3MgaXMgY3VycmVudGx5IGVuYWJsZWQuXG4vLyBpZiBub3Qgc2V0LCB0aGUgcmVtb3RlIHR1bm5lbCBhY2Nlc3MgaXMgY3VycmVudGx5IGRpc2FibGVkLlxuY29uc3QgVFVOTkVMX0FDQ0VTU19TRVNTSU9OID0gJ3JlbW90ZVR1bm5lbFNlc3Npb24nO1xuLy8gQm9vbGVhbiBpbmRpY2F0aW5nIHdoZXRoZXIgdGhlIHR1bm5lbCBzaG91bGQgYmUgaW5zdGFsbGVkIGFzIGEgc2VydmljZS5cbmNvbnN0IFRVTk5FTF9BQ0NFU1NfSVNfU0VSVklDRSA9ICdyZW1vdGVUdW5uZWxJc1NlcnZpY2UnO1xuXG4vKipcbiAqIFRoaXMgc2VydmljZSBydW5zIG9uIHRoZSBzaGFyZWQgc2VydmljZS4gSXQgaXMgcnVubmluZyB0aGUgYGNvZGUtdHVubmVsYCBjb21tYW5kXG4gKiB0byBtYWtlIHRoZSBjdXJyZW50IG1hY2hpbmUgYXZhaWxhYmxlIGZvciByZW1vdGUgYWNjZXNzLlxuICovXG5leHBvcnQgY2xhc3MgUmVtb3RlVHVubmVsU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUmVtb3RlVHVubmVsU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRUb2tlbkZhaWxlZEVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUmVtb3RlVHVubmVsU2Vzc2lvbiB8IHVuZGVmaW5lZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFRva2VuRmFpbGVkID0gdGhpcy5fb25EaWRUb2tlbkZhaWxlZEVtaXR0ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VUdW5uZWxTdGF0dXNFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VHVubmVsU3RhdHVzPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVHVubmVsU3RhdHVzID0gdGhpcy5fb25EaWRDaGFuZ2VUdW5uZWxTdGF0dXNFbWl0dGVyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTW9kZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxUdW5uZWxNb2RlPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZSA9IHRoaXMuX29uRGlkQ2hhbmdlTW9kZUVtaXR0ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbG9nZ2VyOiBJTG9nZ2VyO1xuXG5cdC8qKlxuXHQgKiBcIk1vZGVcIiBpbiB0aGUgdGVybWluYWwgc3RhdGUgd2Ugd2FudCB0byBnZXQgdG8gLS0gc3RhcnRlZCwgc3RvcHBlZCwgYW5kXG5cdCAqIHRoZSBhdHRyaWJ1dGVzIGFzc29jaWF0ZWQgd2l0aCBlYWNoLlxuXHQgKlxuXHQgKiBBdCBhbnkgZ2l2ZW4gdGltZSwgd29yayBtYXkgYmUgb25nb2luZyB0byBnZXQgYF90dW5uZWxTdGF0dXNgIGludG8gYVxuXHQgKiBzdGF0ZSB0aGF0IHJlZmxlY3RzIHRoZSBkZXNpcmVkIGBtb2RlYC5cblx0ICovXG5cdHByaXZhdGUgX21vZGU6IFR1bm5lbE1vZGUgPSBJTkFDVElWRV9UVU5ORUxfTU9ERTtcblxuXHRwcml2YXRlIF90dW5uZWxQcm9jZXNzOiBDYW5jZWxhYmxlUHJvbWlzZTxhbnk+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3R1bm5lbFN0YXR1czogVHVubmVsU3RhdHVzO1xuXHRwcml2YXRlIF9zdGFydFR1bm5lbFByb2Nlc3NEZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXG5cdHByaXZhdGUgX3R1bm5lbENvbW1hbmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9pbml0aWFsaXplZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nZ2VyU2VydmljZSBsb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0XHRASVNoYXJlZFByb2Nlc3NMaWZlY3ljbGVTZXJ2aWNlIHNoYXJlZFByb2Nlc3NMaWZlY3ljbGVTZXJ2aWNlOiBJU2hhcmVkUHJvY2Vzc0xpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9sb2dnZXIgPSB0aGlzLl9yZWdpc3Rlcihsb2dnZXJTZXJ2aWNlLmNyZWF0ZUxvZ2dlcihqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UubG9nc0hvbWUsIGAke0xPR19JRH0ubG9nYCksIHsgaWQ6IExPR19JRCwgbmFtZTogTE9HR0VSX05BTUUgfSkpO1xuXHRcdHRoaXMuX3N0YXJ0VHVubmVsUHJvY2Vzc0RlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcigxMDApKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xvZ2dlci5vbkRpZENoYW5nZUxvZ0xldmVsKGwgPT4gdGhpcy5fbG9nZ2VyLmluZm8oJ0xvZyBsZXZlbCBjaGFuZ2VkIHRvICcgKyBMb2dMZXZlbFRvU3RyaW5nKGwpKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2hhcmVkUHJvY2Vzc0xpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oKCkgPT4ge1xuXHRcdFx0dGhpcy5fdHVubmVsUHJvY2Vzcz8uY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl90dW5uZWxQcm9jZXNzID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKHJlc3RhcnRUdW5uZWxPbkNvbmZpZ3VyYXRpb25DaGFuZ2VzLnNvbWUoYyA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKGMpKSkge1xuXHRcdFx0XHR0aGlzLl9zdGFydFR1bm5lbFByb2Nlc3NEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy51cGRhdGVUdW5uZWxQcm9jZXNzKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX21vZGUgPSB0aGlzLl9yZXN0b3JlTW9kZSgpO1xuXHRcdHRoaXMuX3R1bm5lbFN0YXR1cyA9IFR1bm5lbFN0YXRlcy51bmluaXRpYWxpemVkO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldFR1bm5lbFN0YXR1cygpOiBQcm9taXNlPFR1bm5lbFN0YXR1cz4ge1xuXHRcdHJldHVybiB0aGlzLl90dW5uZWxTdGF0dXM7XG5cdH1cblxuXHRwcml2YXRlIHNldFR1bm5lbFN0YXR1cyh0dW5uZWxTdGF0dXM6IFR1bm5lbFN0YXR1cykge1xuXHRcdHRoaXMuX3R1bm5lbFN0YXR1cyA9IHR1bm5lbFN0YXR1cztcblx0XHR0aGlzLl9vbkRpZENoYW5nZVR1bm5lbFN0YXR1c0VtaXR0ZXIuZmlyZSh0dW5uZWxTdGF0dXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRNb2RlKG1vZGU6IFR1bm5lbE1vZGUpIHtcblx0XHRpZiAoaXNTYW1lTW9kZSh0aGlzLl9tb2RlLCBtb2RlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX21vZGUgPSBtb2RlO1xuXHRcdHRoaXMuX3N0b3JlTW9kZShtb2RlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVFbWl0dGVyLmZpcmUodGhpcy5fbW9kZSk7XG5cdFx0aWYgKG1vZGUuYWN0aXZlKSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgU2Vzc2lvbiB1cGRhdGVkOiAke21vZGUuc2Vzc2lvbi5hY2NvdW50TGFiZWx9ICgke21vZGUuc2Vzc2lvbi5wcm92aWRlcklkfSkgKHNlcnZpY2U9JHttb2RlLmFzU2VydmljZX0pYCk7XG5cdFx0XHRpZiAobW9kZS5zZXNzaW9uLnRva2VuKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBTZXNzaW9uIHRva2VuIHVwZGF0ZWQ6ICR7bW9kZS5zZXNzaW9uLmFjY291bnRMYWJlbH0gKCR7bW9kZS5zZXNzaW9uLnByb3ZpZGVySWR9KWApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgU2Vzc2lvbiByZXNldGApO1xuXHRcdH1cblx0fVxuXG5cdGdldE1vZGUoKTogUHJvbWlzZTxUdW5uZWxNb2RlPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLl9tb2RlKTtcblx0fVxuXG5cdGFzeW5jIGluaXRpYWxpemUobW9kZTogVHVubmVsTW9kZSk6IFByb21pc2U8VHVubmVsU3RhdHVzPiB7XG5cdFx0aWYgKHRoaXMuX2luaXRpYWxpemVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdHVubmVsU3RhdHVzO1xuXHRcdH1cblx0XHR0aGlzLl9pbml0aWFsaXplZCA9IHRydWU7XG5cdFx0dGhpcy5zZXRNb2RlKG1vZGUpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9zdGFydFR1bm5lbFByb2Nlc3NEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy51cGRhdGVUdW5uZWxQcm9jZXNzKCkpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX2xvZ2dlci5lcnJvcihlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3R1bm5lbFN0YXR1cztcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdE9uT3V0cHV0ID0gKGE6IHN0cmluZywgaXNFcnI6IGJvb2xlYW4pID0+IHtcblx0XHRpZiAoaXNFcnIpIHtcblx0XHRcdHRoaXMuX2xvZ2dlci5lcnJvcihhKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYSk7XG5cdFx0fVxuXHR9O1xuXG5cdHByaXZhdGUgZ2V0VHVubmVsQ29tbWFuZExvY2F0aW9uKCkge1xuXHRcdGlmICghdGhpcy5fdHVubmVsQ29tbWFuZCkge1xuXHRcdFx0bGV0IGJpblBhcmVudExvY2F0aW9uO1xuXHRcdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdC8vIGFwcFJvb3QgPSAvQXBwbGljYXRpb25zL1Zpc3VhbCBTdHVkaW8gQ29kZSAtIEluc2lkZXJzLmFwcC9Db250ZW50cy9SZXNvdXJjZXMvYXBwXG5cdFx0XHRcdC8vIGJpbiA9IC9BcHBsaWNhdGlvbnMvVmlzdWFsIFN0dWRpbyBDb2RlIC0gSW5zaWRlcnMuYXBwL0NvbnRlbnRzL1Jlc291cmNlcy9hcHAvYmluXG5cdFx0XHRcdGJpblBhcmVudExvY2F0aW9uID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYXBwUm9vdDtcblx0XHRcdH0gZWxzZSBpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRcdGlmICh0aGlzLnByb2R1Y3RTZXJ2aWNlLndpbjMyVmVyc2lvbmVkVXBkYXRlKSB7XG5cdFx0XHRcdFx0Ly8gYXBwUm9vdCA9IEM6XFxVc2Vyc1xcPG5hbWU+XFxBcHBEYXRhXFxMb2NhbFxcUHJvZ3JhbXNcXE1pY3Jvc29mdCBWUyBDb2RlIEluc2lkZXJzXFw8dmVyc2lvbj5cXHJlc291cmNlc1xcYXBwXG5cdFx0XHRcdFx0Ly8gYmluID0gQzpcXFVzZXJzXFw8bmFtZT5cXEFwcERhdGFcXExvY2FsXFxQcm9ncmFtc1xcTWljcm9zb2Z0IFZTIENvZGUgSW5zaWRlcnNcXGJpblxuXHRcdFx0XHRcdGJpblBhcmVudExvY2F0aW9uID0gZGlybmFtZShkaXJuYW1lKGRpcm5hbWUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYXBwUm9vdCkpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBhcHBSb290ID0gQzpcXFVzZXJzXFw8bmFtZT5cXEFwcERhdGFcXExvY2FsXFxQcm9ncmFtc1xcTWljcm9zb2Z0IFZTIENvZGUgSW5zaWRlcnNcXHJlc291cmNlc1xcYXBwXG5cdFx0XHRcdFx0Ly8gYmluID0gQzpcXFVzZXJzXFw8bmFtZT5cXEFwcERhdGFcXExvY2FsXFxQcm9ncmFtc1xcTWljcm9zb2Z0IFZTIENvZGUgSW5zaWRlcnNcXGJpblxuXHRcdFx0XHRcdGJpblBhcmVudExvY2F0aW9uID0gZGlybmFtZShkaXJuYW1lKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmFwcFJvb3QpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gYXBwUm9vdCA9IC91c3Ivc2hhcmUvY29kZS1pbnNpZGVycy9yZXNvdXJjZXMvYXBwXG5cdFx0XHRcdC8vIGJpbiA9IC91c3Ivc2hhcmUvY29kZS1pbnNpZGVycy9iaW5cblx0XHRcdFx0YmluUGFyZW50TG9jYXRpb24gPSBkaXJuYW1lKGRpcm5hbWUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYXBwUm9vdCkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdHVubmVsQ29tbWFuZCA9IGpvaW4oYmluUGFyZW50TG9jYXRpb24sICdiaW4nLCBgJHt0aGlzLnByb2R1Y3RTZXJ2aWNlLnR1bm5lbEFwcGxpY2F0aW9uTmFtZX0ke2lzV2luZG93cyA/ICcuZXhlJyA6ICcnfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdHVubmVsQ29tbWFuZDtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0VHVubmVsKG1vZGU6IEFjdGl2ZVR1bm5lbE1vZGUpOiBQcm9taXNlPFR1bm5lbFN0YXR1cz4ge1xuXHRcdGlmIChpc1NhbWVNb2RlKHRoaXMuX21vZGUsIG1vZGUpICYmIHRoaXMuX3R1bm5lbFN0YXR1cy50eXBlICE9PSAnZGlzY29ubmVjdGVkJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3R1bm5lbFN0YXR1cztcblx0XHR9XG5cblx0XHR0aGlzLnNldE1vZGUobW9kZSk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fc3RhcnRUdW5uZWxQcm9jZXNzRGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMudXBkYXRlVHVubmVsUHJvY2VzcygpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIuZXJyb3IoZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90dW5uZWxTdGF0dXM7XG5cdH1cblxuXG5cdGFzeW5jIHN0b3BUdW5uZWwoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3R1bm5lbFByb2Nlc3MpIHtcblx0XHRcdHRoaXMuX3R1bm5lbFByb2Nlc3MuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl90dW5uZWxQcm9jZXNzID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9tb2RlLmFjdGl2ZSkge1xuXHRcdFx0Ly8gQmUgY2FyZWZ1bCB0byBvbmx5IHVuaW5zdGFsbCB0aGUgc2VydmljZSBpZiB3ZSdyZSB0aGUgb25lcyB3aG8gaW5zdGFsbGVkIGl0OlxuXHRcdFx0Y29uc3QgbmVlZHNTZXJ2aWNlVW5pbnN0YWxsID0gdGhpcy5fbW9kZS5hc1NlcnZpY2U7XG5cdFx0XHR0aGlzLnNldE1vZGUoSU5BQ1RJVkVfVFVOTkVMX01PREUpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAobmVlZHNTZXJ2aWNlVW5pbnN0YWxsKSB7XG5cdFx0XHRcdFx0dGhpcy5ydW5Db2RlVHVubmVsQ29tbWFuZCgndW5pbnN0YWxsU2VydmljZScsIFsnc2VydmljZScsICd1bmluc3RhbGwnXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyLmVycm9yKGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJ1bkNvZGVUdW5uZWxDb21tYW5kKCdzdG9wJywgWydraWxsJ10pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX2xvZ2dlci5lcnJvcihlKTtcblx0XHR9XG5cblx0XHR0aGlzLnNldFR1bm5lbFN0YXR1cyhUdW5uZWxTdGF0ZXMuZGlzY29ubmVjdGVkKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVUdW5uZWxQcm9jZXNzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHR1bm5lbE5hbWUgPSB0aGlzLl9nZXRUdW5uZWxOYW1lKCk7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UmVtb3RlVHVubmVsRW5hYmxlbWVudEV2ZW50LCBSZW1vdGVUdW5uZWxFbmFibGVtZW50Q2xhc3NpZmljYXRpb24+KCdyZW1vdGVUdW5uZWwuZW5hYmxlbWVudCcsIHtcblx0XHRcdGVuYWJsZWQ6IHRoaXMuX21vZGUuYWN0aXZlLFxuXHRcdFx0c2VydmljZTogdGhpcy5fbW9kZS5hY3RpdmUgJiYgdGhpcy5fbW9kZS5hc1NlcnZpY2UsXG5cdFx0XHR0dW5uZWxOYW1lLFxuXHRcdH0pO1xuXG5cdFx0aWYgKHRoaXMuX3R1bm5lbFByb2Nlc3MpIHtcblx0XHRcdHRoaXMuX3R1bm5lbFByb2Nlc3MuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl90dW5uZWxQcm9jZXNzID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCBvdXRwdXQgPSAnJztcblx0XHRsZXQgaXNTZXJ2aWNlSW5zdGFsbGVkID0gZmFsc2U7XG5cdFx0Y29uc3Qgb25PdXRwdXQgPSAoYTogc3RyaW5nLCBpc0VycjogYm9vbGVhbikgPT4ge1xuXHRcdFx0aWYgKGlzRXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci5lcnJvcihhKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dHB1dCArPSBhO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0J1aWx0ICYmIGEuc3RhcnRzV2l0aCgnICAgQ29tcGlsaW5nJykpIHtcblx0XHRcdFx0dGhpcy5zZXRUdW5uZWxTdGF0dXMoVHVubmVsU3RhdGVzLmNvbm5lY3RpbmcobG9jYWxpemUoJ3JlbW90ZVR1bm5lbFNlcnZpY2UuYnVpbGRpbmcnLCAnQnVpbGRpbmcgQ0xJIGZyb20gc291cmNlcycpKSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHN0YXR1c1Byb2Nlc3MgPSB0aGlzLnJ1bkNvZGVUdW5uZWxDb21tYW5kKCdzdGF0dXMnLCBbJ3N0YXR1cyddLCBvbk91dHB1dCk7XG5cdFx0dGhpcy5fdHVubmVsUHJvY2VzcyA9IHN0YXR1c1Byb2Nlc3M7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHN0YXR1c1Byb2Nlc3M7XG5cdFx0XHRpZiAodGhpcy5fdHVubmVsUHJvY2VzcyAhPT0gc3RhdHVzUHJvY2Vzcykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIHNwbGl0IGFuZCBmaW5kIHRoZSBsaW5lLCBzaW5jZSBpbiBkZXYgYnVpbGRzIGFkZGl0aW9uYWwgbm9pc2UgaXNcblx0XHRcdC8vIGFkZGVkIGJ5IGNhcmdvIHRvIHRoZSBvdXRwdXQuXG5cdFx0XHRsZXQgc3RhdHVzOiB7XG5cdFx0XHRcdHNlcnZpY2VfaW5zdGFsbGVkOiBib29sZWFuO1xuXHRcdFx0XHR0dW5uZWw6IG9iamVjdCB8IG51bGw7XG5cdFx0XHR9O1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzdGF0dXMgPSBKU09OLnBhcnNlKG91dHB1dC50cmltKCkuc3BsaXQoJ1xcbicpLmZpbmQobCA9PiBsLnN0YXJ0c1dpdGgoJ3snKSkhKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyLmVycm9yKGBDb3VsZCBub3QgcGFyc2Ugc3RhdHVzIG91dHB1dDogJHtKU09OLnN0cmluZ2lmeShvdXRwdXQudHJpbSgpKX1gKTtcblx0XHRcdFx0dGhpcy5zZXRUdW5uZWxTdGF0dXMoVHVubmVsU3RhdGVzLmRpc2Nvbm5lY3RlZCgpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpc1NlcnZpY2VJbnN0YWxsZWQgPSBzdGF0dXMuc2VydmljZV9pbnN0YWxsZWQ7XG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhzdGF0dXMudHVubmVsID8gJ090aGVyIHR1bm5lbCBydW5uaW5nLCBhdHRhY2hpbmcuLi4nIDogJ05vIG90aGVyIHR1bm5lbCBydW5uaW5nJyk7XG5cblx0XHRcdC8vIElmIGEgdHVubmVsIGlzIHJ1bm5pbmcgYnV0IHRoZSBtb2RlIGlzbid0IFwiYWN0aXZlXCIsIHdlJ2xsIHN0aWxsIGF0dGFjaFxuXHRcdFx0Ly8gdG8gdGhlIHR1bm5lbCB0byBzaG93IGl0cyBzdGF0ZSBpbiB0aGUgVUkuIElmIG5laXRoZXIgYXJlIHRydWUsIGRpc2Nvbm5lY3Rcblx0XHRcdGlmICghc3RhdHVzLnR1bm5lbCAmJiAhdGhpcy5fbW9kZS5hY3RpdmUpIHtcblx0XHRcdFx0dGhpcy5zZXRUdW5uZWxTdGF0dXMoVHVubmVsU3RhdGVzLmRpc2Nvbm5lY3RlZCgpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX2xvZ2dlci5lcnJvcihlKTtcblx0XHRcdHRoaXMuc2V0VHVubmVsU3RhdHVzKFR1bm5lbFN0YXRlcy5kaXNjb25uZWN0ZWQoKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmICh0aGlzLl90dW5uZWxQcm9jZXNzID09PSBzdGF0dXNQcm9jZXNzKSB7XG5cdFx0XHRcdHRoaXMuX3R1bm5lbFByb2Nlc3MgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX21vZGUuYWN0aXZlID8gdGhpcy5fbW9kZS5zZXNzaW9uIDogdW5kZWZpbmVkO1xuXHRcdGlmIChzZXNzaW9uICYmIHNlc3Npb24udG9rZW4pIHtcblx0XHRcdGNvbnN0IHRva2VuID0gc2Vzc2lvbi50b2tlbjtcblx0XHRcdHRoaXMuc2V0VHVubmVsU3RhdHVzKFR1bm5lbFN0YXRlcy5jb25uZWN0aW5nKGxvY2FsaXplKHsga2V5OiAncmVtb3RlVHVubmVsU2VydmljZS5hdXRob3JpemluZycsIGNvbW1lbnQ6IFsnezB9IGlzIGEgdXNlciBhY2NvdW50IG5hbWUsIHsxfSBhIHByb3ZpZGVyIG5hbWUgKGUuZy4gR2l0aHViKSddIH0sICdDb25uZWN0aW5nIGFzIHswfSAoezF9KScsIHNlc3Npb24uYWNjb3VudExhYmVsLCBzZXNzaW9uLnByb3ZpZGVySWQpKSk7XG5cdFx0XHRjb25zdCBvbkxvZ2luT3V0cHV0ID0gKGE6IHN0cmluZywgaXNFcnI6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0YSA9IGEucmVwbGFjZUFsbCh0b2tlbiwgJyonLnJlcGVhdCg0KSk7XG5cdFx0XHRcdG9uT3V0cHV0KGEsIGlzRXJyKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBsb2dpblByb2Nlc3MgPSB0aGlzLnJ1bkNvZGVUdW5uZWxDb21tYW5kKCdsb2dpbicsIFsndXNlcicsICdsb2dpbicsICctLXByb3ZpZGVyJywgc2Vzc2lvbi5wcm92aWRlcklkLCAnLS1sb2cnLCBMb2dMZXZlbFRvU3RyaW5nKHRoaXMuX2xvZ2dlci5nZXRMZXZlbCgpKV0sIG9uTG9naW5PdXRwdXQsIHsgVlNDT0RFX0NMSV9BQ0NFU1NfVE9LRU46IHRva2VuIH0pO1xuXHRcdFx0dGhpcy5fdHVubmVsUHJvY2VzcyA9IGxvZ2luUHJvY2Vzcztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGxvZ2luUHJvY2Vzcztcblx0XHRcdFx0aWYgKHRoaXMuX3R1bm5lbFByb2Nlc3MgIT09IGxvZ2luUHJvY2Vzcykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLl9sb2dnZXIuZXJyb3IoZSk7XG5cdFx0XHRcdHRoaXMuX3R1bm5lbFByb2Nlc3MgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX29uRGlkVG9rZW5GYWlsZWRFbWl0dGVyLmZpcmUoc2Vzc2lvbik7XG5cdFx0XHRcdHRoaXMuc2V0VHVubmVsU3RhdHVzKFR1bm5lbFN0YXRlcy5kaXNjb25uZWN0ZWQoc2Vzc2lvbikpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaG9zdE5hbWUgPSB0aGlzLl9nZXRUdW5uZWxOYW1lKCk7XG5cdFx0aWYgKGhvc3ROYW1lKSB7XG5cdFx0XHR0aGlzLnNldFR1bm5lbFN0YXR1cyhUdW5uZWxTdGF0ZXMuY29ubmVjdGluZyhsb2NhbGl6ZSh7IGtleTogJ3JlbW90ZVR1bm5lbFNlcnZpY2Uub3BlblR1bm5lbFdpdGhOYW1lJywgY29tbWVudDogWyd7MH0gaXMgYSB0dW5uZWwgbmFtZSddIH0sICdPcGVuaW5nIHR1bm5lbCB7MH0nLCBob3N0TmFtZSkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZXRUdW5uZWxTdGF0dXMoVHVubmVsU3RhdGVzLmNvbm5lY3RpbmcobG9jYWxpemUoJ3JlbW90ZVR1bm5lbFNlcnZpY2Uub3BlblR1bm5lbCcsICdPcGVuaW5nIHR1bm5lbCcpKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGFyZ3MgPSBbJy0tYWNjZXB0LXNlcnZlci1saWNlbnNlLXRlcm1zJywgJy0tbG9nJywgTG9nTGV2ZWxUb1N0cmluZyh0aGlzLl9sb2dnZXIuZ2V0TGV2ZWwoKSldO1xuXHRcdGlmIChob3N0TmFtZSkge1xuXHRcdFx0YXJncy5wdXNoKCctLW5hbWUnLCBob3N0TmFtZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFyZ3MucHVzaCgnLS1yYW5kb20tbmFtZScpO1xuXHRcdH1cblxuXHRcdGxldCBzZXJ2aWNlSW5zdGFsbEZhaWxlZCA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLl9tb2RlLmFjdGl2ZSAmJiB0aGlzLl9tb2RlLmFzU2VydmljZSAmJiAhaXNTZXJ2aWNlSW5zdGFsbGVkKSB7XG5cdFx0XHQvLyBJIHRob3VnaHQgYWJvdXQgY2FsbGluZyBgY29kZSB0dW5uZWwga2lsbGAgaGVyZSwgYnV0IGhhdmluZyBtdWx0aXBsZVxuXHRcdFx0Ly8gdHVubmVsIHByb2Nlc3NlcyBydW5uaW5nIGlzIHByZXR0eSBtdWNoIGlkZW1wb3RlbnQuIElmIHRoZXJlJ3Ncblx0XHRcdC8vIGFub3RoZXIgdHVubmVsIHByb2Nlc3MgcnVubmluZywgdGhlIHNlcnZpY2UgcHJvY2VzcyB3aWxsXG5cdFx0XHQvLyB0YWtlIG92ZXIgd2hlbiBpdCBleGl0cywgbm8gaGFyZCBmZWVsaW5ncy5cblx0XHRcdHNlcnZpY2VJbnN0YWxsRmFpbGVkID0gYXdhaXQgdGhpcy5pbnN0YWxsVHVubmVsU2VydmljZShhcmdzKSA9PT0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc2VydmVyT3JBdHRhY2hUdW5uZWwoc2Vzc2lvbiwgYXJncywgc2VydmljZUluc3RhbGxGYWlsZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbnN0YWxsVHVubmVsU2VydmljZShhcmdzOiByZWFkb25seSBzdHJpbmdbXSkge1xuXHRcdGxldCBzdGF0dXM6IG51bWJlcjtcblx0XHR0cnkge1xuXHRcdFx0c3RhdHVzID0gYXdhaXQgdGhpcy5ydW5Db2RlVHVubmVsQ29tbWFuZCgnc2VydmljZUluc3RhbGwnLCBbJ3NlcnZpY2UnLCAnaW5zdGFsbCcsIC4uLmFyZ3NdKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIuZXJyb3IoZSk7XG5cdFx0XHRzdGF0dXMgPSAxO1xuXHRcdH1cblxuXHRcdGlmIChzdGF0dXMgIT09IDApIHtcblx0XHRcdGNvbnN0IG1zZyA9IGxvY2FsaXplKCdyZW1vdGVUdW5uZWxTZXJ2aWNlLnNlcnZpY2VJbnN0YWxsRmFpbGVkJywgJ0ZhaWxlZCB0byBpbnN0YWxsIHR1bm5lbCBhcyBhIHNlcnZpY2UsIHN0YXJ0aW5nIGluIHNlc3Npb24uLi4nKTtcblx0XHRcdHRoaXMuX2xvZ2dlci53YXJuKG1zZyk7XG5cdFx0XHR0aGlzLnNldFR1bm5lbFN0YXR1cyhUdW5uZWxTdGF0ZXMuY29ubmVjdGluZyhtc2cpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2VydmVyT3JBdHRhY2hUdW5uZWwoc2Vzc2lvbjogSVJlbW90ZVR1bm5lbFNlc3Npb24gfCB1bmRlZmluZWQsIGFyZ3M6IHN0cmluZ1tdLCBzZXJ2aWNlSW5zdGFsbEZhaWxlZDogYm9vbGVhbikge1xuXHRcdGFyZ3MucHVzaCgnLS1wYXJlbnQtcHJvY2Vzcy1pZCcsIFN0cmluZyhwcm9jZXNzLnBpZCkpO1xuXG5cdFx0aWYgKHRoaXMuX3ByZXZlbnRTbGVlcCgpKSB7XG5cdFx0XHRhcmdzLnB1c2goJy0tbm8tc2xlZXAnKTtcblx0XHR9XG5cblx0XHRsZXQgaXNBdHRhY2hlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHNlcnZlQ29tbWFuZCA9IHRoaXMucnVuQ29kZVR1bm5lbENvbW1hbmQoJ3R1bm5lbCcsIGFyZ3MsIChtZXNzYWdlOiBzdHJpbmcsIGlzRXJyOiBib29sZWFuKSA9PiB7XG5cdFx0XHRpZiAoaXNFcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyLmVycm9yKG1lc3NhZ2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8obWVzc2FnZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtZXNzYWdlLmluY2x1ZGVzKCdDb25uZWN0ZWQgdG8gYW4gZXhpc3RpbmcgdHVubmVsIHByb2Nlc3MnKSkge1xuXHRcdFx0XHRpc0F0dGFjaGVkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbSA9IG1lc3NhZ2UubWF0Y2goL09wZW4gdGhpcyBsaW5rIGluIHlvdXIgYnJvd3NlciAoaHR0cHM6XFwvXFwvKFteXFwvXFxzXSspXFwvKFteXFwvXFxzXSspXFwvKFteXFwvXFxzXSspKS8pO1xuXHRcdFx0aWYgKG0pIHtcblx0XHRcdFx0Y29uc3QgaW5mbzogQ29ubmVjdGlvbkluZm8gPSB7IGxpbms6IG1bMV0sIGRvbWFpbjogbVsyXSwgdHVubmVsTmFtZTogbVs0XSwgaXNBdHRhY2hlZCB9O1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxSZW1vdGVUdW5uZWxDb25uZWN0ZWRFdmVudCwgUmVtb3RlVHVubmVsQ29ubmVjdGVkQ2xhc3NpZmljYXRpb24+KCdyZW1vdGVUdW5uZWwuY29ubmVjdGVkJywge1xuXHRcdFx0XHRcdHR1bm5lbE5hbWU6IGluZm8udHVubmVsTmFtZSxcblx0XHRcdFx0XHRpc0F0dGFjaGVkOiBpbmZvLmlzQXR0YWNoZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLnNldFR1bm5lbFN0YXR1cyhUdW5uZWxTdGF0ZXMuY29ubmVjdGVkKGluZm8sIHNlcnZpY2VJbnN0YWxsRmFpbGVkKSk7XG5cdFx0XHR9IGVsc2UgaWYgKG1lc3NhZ2UubWF0Y2goL2Vycm9yIHJlZnJlc2hpbmcgdG9rZW4vKSkge1xuXHRcdFx0XHRzZXJ2ZUNvbW1hbmQuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkVG9rZW5GYWlsZWRFbWl0dGVyLmZpcmUoc2Vzc2lvbik7XG5cdFx0XHRcdHRoaXMuc2V0VHVubmVsU3RhdHVzKFR1bm5lbFN0YXRlcy5kaXNjb25uZWN0ZWQoc2Vzc2lvbikpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3R1bm5lbFByb2Nlc3MgPSBzZXJ2ZUNvbW1hbmQ7XG5cdFx0c2VydmVDb21tYW5kLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0aWYgKHNlcnZlQ29tbWFuZCA9PT0gdGhpcy5fdHVubmVsUHJvY2Vzcykge1xuXHRcdFx0XHQvLyBwcm9jZXNzIGV4aXRlZCB1bmV4cGVjdGVkbHlcblx0XHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYHR1bm5lbCBwcm9jZXNzIHRlcm1pbmF0ZWRgKTtcblx0XHRcdFx0dGhpcy5fdHVubmVsUHJvY2VzcyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fbW9kZSA9IElOQUNUSVZFX1RVTk5FTF9NT0RFO1xuXG5cdFx0XHRcdHRoaXMuc2V0VHVubmVsU3RhdHVzKFR1bm5lbFN0YXRlcy5kaXNjb25uZWN0ZWQoKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJ1bkNvZGVUdW5uZWxDb21tYW5kKGxvZ0xhYmVsOiBzdHJpbmcsIGNvbW1hbmRBcmdzOiBzdHJpbmdbXSwgb25PdXRwdXQ6IChtZXNzYWdlOiBzdHJpbmcsIGlzRXJyb3I6IGJvb2xlYW4pID0+IHZvaWQgPSB0aGlzLmRlZmF1bHRPbk91dHB1dCwgZW52PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IENhbmNlbGFibGVQcm9taXNlPG51bWJlcj4ge1xuXHRcdHJldHVybiBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZTxudW1iZXI+KHRva2VuID0+IHtcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJlc29sdmUoLTEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCB0dW5uZWxQcm9jZXNzOiBDaGlsZFByb2Nlc3MgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHN0ZGlvOiBTdGRpb09wdGlvbnMgPSBbJ2lnbm9yZScsICdwaXBlJywgJ3BpcGUnXTtcblxuXHRcdFx0XHR0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHR1bm5lbFByb2Nlc3MpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKGAke2xvZ0xhYmVsfSB0ZXJtaW5hdGluZygke3R1bm5lbFByb2Nlc3MucGlkfSlgKTtcblx0XHRcdFx0XHRcdHR1bm5lbFByb2Nlc3Mua2lsbCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCkge1xuXHRcdFx0XHRcdG9uT3V0cHV0KCdCdWlsZGluZyB0dW5uZWwgQ0xJIGZyb20gc291cmNlcyBhbmQgcnVuXFxuJywgZmFsc2UpO1xuXHRcdFx0XHRcdG9uT3V0cHV0KGAke2xvZ0xhYmVsfSBTcGF3bmluZzogY2FyZ28gcnVuIC0tIHR1bm5lbCAke2NvbW1hbmRBcmdzLmpvaW4oJyAnKX1cXG5gLCBmYWxzZSk7XG5cdFx0XHRcdFx0dHVubmVsUHJvY2VzcyA9IHNwYXduKCdjYXJnbycsIFsncnVuJywgJy0tJywgJ3R1bm5lbCcsIC4uLmNvbW1hbmRBcmdzXSwgeyBjd2Q6IGpvaW4odGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYXBwUm9vdCwgJ2NsaScpLCBzdGRpbywgZW52OiB7IC4uLnByb2Nlc3MuZW52LCBSVVNUX0JBQ0tUUkFDRTogJzEnLCAuLi5lbnYgfSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRvbk91dHB1dCgnUnVubmluZyB0dW5uZWwgQ0xJXFxuJywgZmFsc2UpO1xuXHRcdFx0XHRcdGNvbnN0IHR1bm5lbENvbW1hbmQgPSB0aGlzLmdldFR1bm5lbENvbW1hbmRMb2NhdGlvbigpO1xuXHRcdFx0XHRcdG9uT3V0cHV0KGAke2xvZ0xhYmVsfSBTcGF3bmluZzogJHt0dW5uZWxDb21tYW5kfSB0dW5uZWwgJHtjb21tYW5kQXJncy5qb2luKCcgJyl9XFxuYCwgZmFsc2UpO1xuXHRcdFx0XHRcdHR1bm5lbFByb2Nlc3MgPSBzcGF3bih0dW5uZWxDb21tYW5kLCBbJ3R1bm5lbCcsIC4uLmNvbW1hbmRBcmdzXSwgeyBjd2Q6IGhvbWVkaXIoKSwgc3RkaW8sIGVudjogeyAuLi5wcm9jZXNzLmVudiwgLi4uZW52IH0gfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0dW5uZWxQcm9jZXNzLnN0ZG91dCEucGlwZShuZXcgU3RyZWFtU3BsaXR0ZXIoJ1xcbicpKS5vbignZGF0YScsIGRhdGEgPT4ge1xuXHRcdFx0XHRcdGlmICh0dW5uZWxQcm9jZXNzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gZGF0YS50b1N0cmluZygpO1xuXHRcdFx0XHRcdFx0b25PdXRwdXQobWVzc2FnZSwgZmFsc2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHR1bm5lbFByb2Nlc3Muc3RkZXJyIS5waXBlKG5ldyBTdHJlYW1TcGxpdHRlcignXFxuJykpLm9uKCdkYXRhJywgZGF0YSA9PiB7XG5cdFx0XHRcdFx0aWYgKHR1bm5lbFByb2Nlc3MpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBkYXRhLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0XHRvbk91dHB1dChtZXNzYWdlLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0dW5uZWxQcm9jZXNzLm9uKCdleGl0JywgZSA9PiB7XG5cdFx0XHRcdFx0aWYgKHR1bm5lbFByb2Nlc3MpIHtcblx0XHRcdFx0XHRcdG9uT3V0cHV0KGAke2xvZ0xhYmVsfSBleGl0KCR7dHVubmVsUHJvY2Vzcy5waWR9KTogKyAke2V9IGAsIGZhbHNlKTtcblx0XHRcdFx0XHRcdHR1bm5lbFByb2Nlc3MgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKGUgfHwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dHVubmVsUHJvY2Vzcy5vbignZXJyb3InLCBlID0+IHtcblx0XHRcdFx0XHRpZiAodHVubmVsUHJvY2Vzcykge1xuXHRcdFx0XHRcdFx0b25PdXRwdXQoYCR7bG9nTGFiZWx9IGVycm9yKCR7dHVubmVsUHJvY2Vzcy5waWR9KTogKyAke2V9IGAsIHRydWUpO1xuXHRcdFx0XHRcdFx0dHVubmVsUHJvY2VzcyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHJlamVjdCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRUdW5uZWxOYW1lKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldFR1bm5lbE5hbWUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3ByZXZlbnRTbGVlcCgpIHtcblx0XHRyZXR1cm4gISF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENPTkZJR1VSQVRJT05fS0VZX1BSRVZFTlRfU0xFRVApO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VHVubmVsTmFtZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGxldCBuYW1lID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KENPTkZJR1VSQVRJT05fS0VZX0hPU1RfTkFNRSkgfHwgaG9zdG5hbWUoKTtcblx0XHRuYW1lID0gbmFtZS5yZXBsYWNlKC9eLSsvZywgJycpLnJlcGxhY2UoL1teXFx3LV0vZywgJycpLnN1YnN0cmluZygwLCAyMCk7XG5cdFx0cmV0dXJuIG5hbWUgfHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzdG9yZU1vZGUoKTogVHVubmVsTW9kZSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHR1bm5lbEFjY2Vzc1Nlc3Npb24gPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChUVU5ORUxfQUNDRVNTX1NFU1NJT04sIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRjb25zdCBhc1NlcnZpY2UgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oVFVOTkVMX0FDQ0VTU19JU19TRVJWSUNFLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKTtcblx0XHRcdGlmICh0dW5uZWxBY2Nlc3NTZXNzaW9uKSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBKU09OLnBhcnNlKHR1bm5lbEFjY2Vzc1Nlc3Npb24pIGFzIElSZW1vdGVUdW5uZWxTZXNzaW9uO1xuXHRcdFx0XHRpZiAoc2Vzc2lvbiAmJiBpc1N0cmluZyhzZXNzaW9uLmFjY291bnRMYWJlbCkgJiYgaXNTdHJpbmcoc2Vzc2lvbi5zZXNzaW9uSWQpICYmIGlzU3RyaW5nKHNlc3Npb24ucHJvdmlkZXJJZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBhY3RpdmU6IHRydWUsIHNlc3Npb24sIGFzU2VydmljZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci5lcnJvcignUHJvYmxlbXMgcmVzdG9yaW5nIHNlc3Npb24gZnJvbSBzdG9yYWdlLCBpbnZhbGlkIGZvcm1hdCcsIHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX2xvZ2dlci5lcnJvcignUHJvYmxlbXMgcmVzdG9yaW5nIHNlc3Npb24gZnJvbSBzdG9yYWdlJywgZSk7XG5cdFx0fVxuXHRcdHJldHVybiBJTkFDVElWRV9UVU5ORUxfTU9ERTtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3JlTW9kZShtb2RlOiBUdW5uZWxNb2RlKTogdm9pZCB7XG5cdFx0aWYgKG1vZGUuYWN0aXZlKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uV2l0aG91dFRva2VuID0ge1xuXHRcdFx0XHRwcm92aWRlcklkOiBtb2RlLnNlc3Npb24ucHJvdmlkZXJJZCwgc2Vzc2lvbklkOiBtb2RlLnNlc3Npb24uc2Vzc2lvbklkLCBhY2NvdW50TGFiZWw6IG1vZGUuc2Vzc2lvbi5hY2NvdW50TGFiZWxcblx0XHRcdH07XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFRVTk5FTF9BQ0NFU1NfU0VTU0lPTiwgSlNPTi5zdHJpbmdpZnkoc2Vzc2lvbldpdGhvdXRUb2tlbiksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVFVOTkVMX0FDQ0VTU19JU19TRVJWSUNFLCBtb2RlLmFzU2VydmljZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShUVU5ORUxfQUNDRVNTX1NFU1NJT04sIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShUVU5ORUxfQUNDRVNTX0lTX1NFUlZJQ0UsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGlzU2FtZVNlc3Npb24oYTE6IElSZW1vdGVUdW5uZWxTZXNzaW9uIHwgdW5kZWZpbmVkLCBhMjogSVJlbW90ZVR1bm5lbFNlc3Npb24gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKGExICYmIGEyKSB7XG5cdFx0cmV0dXJuIGExLnNlc3Npb25JZCA9PT0gYTIuc2Vzc2lvbklkICYmIGExLnByb3ZpZGVySWQgPT09IGEyLnByb3ZpZGVySWQgJiYgYTEudG9rZW4gPT09IGEyLnRva2VuO1xuXHR9XG5cdHJldHVybiBhMSA9PT0gYTI7XG59XG5cbmNvbnN0IGlzU2FtZU1vZGUgPSAoYTogVHVubmVsTW9kZSwgYjogVHVubmVsTW9kZSkgPT4ge1xuXHRpZiAoYS5hY3RpdmUgIT09IGIuYWN0aXZlKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9IGVsc2UgaWYgKGEuYWN0aXZlICYmIGIuYWN0aXZlKSB7XG5cdFx0cmV0dXJuIGEuYXNTZXJ2aWNlID09PSBiLmFzU2VydmljZSAmJiBpc1NhbWVTZXNzaW9uKGEuc2Vzc2lvbiwgYi5zZXNzaW9uKTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyw2QkFBNkIsaUNBQTZGLGFBQWEsUUFBUSxjQUF3Qyw0QkFBOEM7QUFDOU8sU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUNBQWlDO0FBQzFD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
