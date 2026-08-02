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
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, dispose, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { isMacintosh, isWindows, OperatingSystem, OS } from "../../../../base/common/platform.js";
import { localize } from "../../../../nls.js";
import { formatMessageForTerminal } from "../../../../platform/terminal/common/terminalStrings.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { getRemoteAuthority } from "../../../../platform/remote/common/remoteHosts.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { NaiveCwdDetectionCapability } from "../../../../platform/terminal/common/capabilities/naiveCwdDetectionCapability.js";
import { TerminalCapabilityStore } from "../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { FlowControlConstants, ITerminalLogService, ProcessPropertyType, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { TerminalRecorder } from "../../../../platform/terminal/common/terminalRecorder.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { EnvironmentVariableInfoChangesActive, EnvironmentVariableInfoStale } from "./environmentVariableInfo.js";
import { ITerminalConfigurationService, ITerminalInstanceService, ITerminalService } from "./terminal.js";
import { IEnvironmentVariableService } from "../common/environmentVariable.js";
import { MergedEnvironmentVariableCollection } from "../../../../platform/terminal/common/environmentVariableCollection.js";
import { serializeEnvironmentVariableCollections } from "../../../../platform/terminal/common/environmentVariableShared.js";
import { ITerminalProfileResolverService, ProcessState } from "../common/terminal.js";
import * as terminalEnvironment from "../common/terminalEnvironment.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { TaskSettingId } from "../../tasks/common/tasks.js";
import Severity from "../../../../base/common/severity.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { getActiveWindow, runWhenWindowIdle } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { shouldUseEnvironmentVariableCollection } from "../../../../platform/terminal/common/terminalEnvironment.js";
import { TerminalContribSettingId } from "../terminalContribExports.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { isString } from "../../../../base/common/types.js";
var ProcessConstants = /* @__PURE__ */ ((ProcessConstants2) => {
  ProcessConstants2[ProcessConstants2["ErrorLaunchThresholdDuration"] = 500] = "ErrorLaunchThresholdDuration";
  ProcessConstants2[ProcessConstants2["LatencyMeasuringInterval"] = 1e3] = "LatencyMeasuringInterval";
  return ProcessConstants2;
})(ProcessConstants || {});
var ProcessType = /* @__PURE__ */ ((ProcessType2) => {
  ProcessType2[ProcessType2["Process"] = 0] = "Process";
  ProcessType2[ProcessType2["PsuedoTerminal"] = 1] = "PsuedoTerminal";
  return ProcessType2;
})(ProcessType || {});
let TerminalProcessManager = class extends Disposable {
  constructor(_instanceId, cwd, environmentVariableCollections, shellIntegrationNonce, _historyService, _instantiationService, _logService, _workspaceContextService, _configurationResolverService, _workbenchEnvironmentService, _productService, _remoteAgentService, _pathService, _environmentVariableService, _terminalConfigurationService, _terminalProfileResolverService, _configurationService, _terminalInstanceService, _telemetryService, _notificationService, _accessibilityService, _terminalService) {
    super();
    this._instanceId = _instanceId;
    this._historyService = _historyService;
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._workspaceContextService = _workspaceContextService;
    this._configurationResolverService = _configurationResolverService;
    this._workbenchEnvironmentService = _workbenchEnvironmentService;
    this._productService = _productService;
    this._remoteAgentService = _remoteAgentService;
    this._pathService = _pathService;
    this._environmentVariableService = _environmentVariableService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._configurationService = _configurationService;
    this._terminalInstanceService = _terminalInstanceService;
    this._telemetryService = _telemetryService;
    this._notificationService = _notificationService;
    this._accessibilityService = _accessibilityService;
    this._terminalService = _terminalService;
    this.processState = ProcessState.Uninitialized;
    this.capabilities = this._register(new TerminalCapabilityStore());
    this.processReadyTimestamp = 0;
    this._isDisposed = false;
    this._process = null;
    this._processType = 0 /* Process */;
    this._preLaunchInputQueue = [];
    this._environmentVariableCollectionListener = this._register(new MutableDisposable());
    this._hasWrittenData = false;
    this._hasChildProcesses = false;
    this._ptyListenersAttached = false;
    this._isDisconnected = false;
    this._dimensions = { cols: 0, rows: 0 };
    this._onPtyDisconnect = this._register(new Emitter());
    this.onPtyDisconnect = this._onPtyDisconnect.event;
    this._onPtyReconnect = this._register(new Emitter());
    this.onPtyReconnect = this._onPtyReconnect.event;
    this._onProcessReady = this._register(new Emitter());
    this.onProcessReady = this._onProcessReady.event;
    this._onProcessStateChange = this._register(new Emitter());
    this.onProcessStateChange = this._onProcessStateChange.event;
    this._onBeforeProcessData = this._register(new Emitter());
    this.onBeforeProcessData = this._onBeforeProcessData.event;
    this._onProcessData = this._register(new Emitter());
    this.onProcessData = this._onProcessData.event;
    this._onProcessReplayComplete = this._register(new Emitter());
    this.onProcessReplayComplete = this._onProcessReplayComplete.event;
    this._onDidChangeProperty = this._register(new Emitter());
    this.onDidChangeProperty = this._onDidChangeProperty.event;
    this._onEnvironmentVariableInfoChange = this._register(new Emitter());
    this.onEnvironmentVariableInfoChanged = this._onEnvironmentVariableInfoChange.event;
    this._onProcessExit = this._register(new Emitter());
    this.onProcessExit = this._onProcessExit.event;
    this._onRestoreCommands = this._register(new Emitter());
    this.onRestoreCommands = this._onRestoreCommands.event;
    this._cwdWorkspaceFolder = terminalEnvironment.getWorkspaceForTerminal(cwd, this._workspaceContextService, this._historyService);
    this.ptyProcessReady = this._createPtyProcessReadyPromise();
    this._ackDataBufferer = new AckDataBufferer((e) => this._process?.acknowledgeDataEvent(e));
    this._dataFilter = this._register(this._instantiationService.createInstance(SeamlessRelaunchDataFilter));
    this._register(this._dataFilter.onProcessData((ev) => {
      const data = isString(ev) ? ev : ev.data;
      const beforeProcessDataEvent = { data };
      this._onBeforeProcessData.fire(beforeProcessDataEvent);
      if (beforeProcessDataEvent.data && beforeProcessDataEvent.data.length > 0) {
        if (!isString(ev)) {
          ev.data = beforeProcessDataEvent.data;
        }
        this._onProcessData.fire(!isString(ev) ? ev : { data: beforeProcessDataEvent.data, trackCommit: false });
      }
    }));
    if (cwd && typeof cwd === "object") {
      this.remoteAuthority = getRemoteAuthority(cwd);
    } else {
      this.remoteAuthority = this._workbenchEnvironmentService.remoteAuthority;
    }
    if (environmentVariableCollections) {
      this._extEnvironmentVariableCollection = new MergedEnvironmentVariableCollection(environmentVariableCollections);
      this._environmentVariableCollectionListener.value = this._environmentVariableService.onDidChangeCollections((newCollection) => this._onEnvironmentVariableCollectionChange(newCollection));
      this.environmentVariableInfo = this._instantiationService.createInstance(EnvironmentVariableInfoChangesActive, this._extEnvironmentVariableCollection);
      this._onEnvironmentVariableInfoChange.fire(this.environmentVariableInfo);
    }
    this.shellIntegrationNonce = shellIntegrationNonce ?? generateUuid();
  }
  get persistentProcessId() {
    return this._process?.id;
  }
  get shouldPersist() {
    return !!this.reconnectionProperties || (this._process ? this._process.shouldPersist : false);
  }
  get hasWrittenData() {
    return this._hasWrittenData;
  }
  get hasChildProcesses() {
    return this._hasChildProcesses;
  }
  get reconnectionProperties() {
    return this._shellLaunchConfig?.attachPersistentProcess?.reconnectionProperties || this._shellLaunchConfig?.reconnectionProperties || void 0;
  }
  get extEnvironmentVariableCollection() {
    return this._extEnvironmentVariableCollection;
  }
  get processTraits() {
    return this._processTraits;
  }
  async freePortKillProcess(port) {
    try {
      if (this._process?.freePortKillProcess) {
        await this._process?.freePortKillProcess(port);
      }
    } catch (e) {
      this._notificationService.notify({ message: localize("killportfailure", "Could not kill process listening on port {0}, command exited with error {1}", port, e), severity: Severity.Warning });
    }
  }
  dispose(immediate = false) {
    this._isDisposed = true;
    if (this._process) {
      this._setProcessState(ProcessState.KilledByUser);
      this._process.shutdown(immediate);
      this._process = null;
    }
    if (this._processListeners) {
      dispose(this._processListeners);
      this._processListeners = void 0;
    }
    super.dispose();
  }
  _createPtyProcessReadyPromise() {
    return new Promise((c) => {
      const listener = Event.once(this.onProcessReady)(() => {
        this._logService.debug(`Terminal process ready (shellProcessId: ${this.shellProcessId})`);
        this._store.delete(listener);
        c(void 0);
      });
      this._store.add(listener);
    });
  }
  async detachFromProcess(forcePersist) {
    await this._process?.detach?.(forcePersist);
    this._process = null;
  }
  async createProcess(shellLaunchConfig, cols, rows, reset = true) {
    this._shellLaunchConfig = shellLaunchConfig;
    this._dimensions.cols = cols;
    this._dimensions.rows = rows;
    let newProcess;
    if (shellLaunchConfig.customPtyImplementation) {
      this._processType = 1 /* PsuedoTerminal */;
      newProcess = shellLaunchConfig.customPtyImplementation(this._instanceId, cols, rows);
    } else {
      const backend = await this._terminalInstanceService.getBackend(this.remoteAuthority);
      if (!backend) {
        throw new Error(`No terminal backend registered for remote authority '${this.remoteAuthority}'`);
      }
      this.backend = backend;
      const envForResolver = { ...await this._terminalProfileResolverService.getEnvironment(this.remoteAuthority) };
      terminalEnvironment.mergeEnvironments(envForResolver, await backend.getShellEnvironment());
      const variableResolver = terminalEnvironment.createVariableResolver(this._cwdWorkspaceFolder, envForResolver, this._configurationResolverService);
      this.userHome = this._pathService.resolvedUserHome?.fsPath;
      this.os = OS;
      if (!!this.remoteAuthority) {
        const userHomeUri = await this._pathService.userHome();
        this.userHome = userHomeUri.path;
        const remoteEnv = await this._remoteAgentService.getEnvironment();
        if (!remoteEnv) {
          throw new Error(`Failed to get remote environment for remote authority "${this.remoteAuthority}"`);
        }
        this.userHome = remoteEnv.userHome.path;
        this.os = remoteEnv.os;
        const env = await this._resolveEnvironment(backend, variableResolver, shellLaunchConfig);
        const shouldPersist = (this._configurationService.getValue(TaskSettingId.Reconnection) && shellLaunchConfig.reconnectionProperties || !shellLaunchConfig.isFeatureTerminal) && this._terminalConfigurationService.config.enablePersistentSessions && !shellLaunchConfig.isTransient;
        if (shellLaunchConfig.attachPersistentProcess) {
          const result2 = await backend.attachToProcess(shellLaunchConfig.attachPersistentProcess.id);
          if (result2) {
            newProcess = result2;
          } else {
            this._logService.warn(`Attach to process failed for terminal`, shellLaunchConfig.attachPersistentProcess);
            shellLaunchConfig.attachPersistentProcess = void 0;
          }
        }
        if (!newProcess) {
          await this._terminalProfileResolverService.resolveShellLaunchConfig(shellLaunchConfig, {
            remoteAuthority: this.remoteAuthority,
            os: this.os
          });
          const options = {
            shellIntegration: {
              enabled: this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled),
              suggestEnabled: this._configurationService.getValue(TerminalContribSettingId.SuggestEnabled),
              nonce: this.shellIntegrationNonce
            },
            windowsUseConptyDll: this._terminalConfigurationService.config.windowsUseConptyDll ?? false,
            environmentVariableCollections: this._extEnvironmentVariableCollection?.collections ? serializeEnvironmentVariableCollections(this._extEnvironmentVariableCollection.collections) : void 0,
            workspaceFolder: this._cwdWorkspaceFolder,
            isScreenReaderOptimized: this._accessibilityService.isScreenReaderOptimized()
          };
          try {
            newProcess = await backend.createProcess(
              shellLaunchConfig,
              "",
              // TODO: Fix cwd
              cols,
              rows,
              this._terminalConfigurationService.config.unicodeVersion,
              env,
              // TODO:
              options,
              shouldPersist
            );
          } catch (e) {
            if (e?.message === "Could not fetch remote environment") {
              this._logService.trace(`Could not fetch remote environment, silently failing`);
              return void 0;
            }
            throw e;
          }
        }
        if (!this._isDisposed) {
          this._setupPtyHostListeners(backend);
        }
      } else {
        if (shellLaunchConfig.attachPersistentProcess) {
          const result2 = shellLaunchConfig.attachPersistentProcess.findRevivedId ? await backend.attachToRevivedProcess(shellLaunchConfig.attachPersistentProcess.id) : await backend.attachToProcess(shellLaunchConfig.attachPersistentProcess.id);
          if (result2) {
            newProcess = result2;
          } else {
            this._logService.warn(`Attach to process failed for terminal`, shellLaunchConfig.attachPersistentProcess);
            shellLaunchConfig.attachPersistentProcess = void 0;
          }
        }
        if (!newProcess) {
          newProcess = await this._launchLocalProcess(backend, shellLaunchConfig, cols, rows, this.userHome, variableResolver);
        }
        if (!this._isDisposed) {
          this._setupPtyHostListeners(backend);
        }
      }
    }
    if (this._isDisposed) {
      newProcess.shutdown(false);
      return void 0;
    }
    this._process = newProcess;
    this._setProcessState(ProcessState.Launching);
    if (this.os === OperatingSystem.Linux || this.os === OperatingSystem.Macintosh) {
      this.capabilities.add(TerminalCapability.NaiveCwdDetection, new NaiveCwdDetectionCapability(this._process));
    }
    this._dataFilter.newProcess(this._process, reset);
    if (this._processListeners) {
      dispose(this._processListeners);
    }
    this._processListeners = [
      newProcess.onProcessReady((e) => {
        this._logService.debug("onProcessReady", e);
        this._processTraits = e;
        this.shellProcessId = e.pid;
        this._initialCwd = e.cwd;
        this.processReadyTimestamp = Date.now();
        this._onDidChangeProperty.fire({ type: ProcessPropertyType.InitialCwd, value: this._initialCwd });
        this._onProcessReady.fire(e);
        if (this._preLaunchInputQueue.length > 0 && this._process) {
          this._logService.debug("sending prelaunch input queue", this._preLaunchInputQueue);
          newProcess.input(this._preLaunchInputQueue.join(""));
          this._preLaunchInputQueue.length = 0;
        }
      }),
      newProcess.onProcessExit((exitCode) => this._onExit(exitCode)),
      newProcess.onDidChangeProperty(({ type, value }) => {
        switch (type) {
          case ProcessPropertyType.HasChildProcesses:
            this._hasChildProcesses = value;
            break;
          case ProcessPropertyType.FailedShellIntegrationActivation:
            this._telemetryService?.publicLog2("terminal/shellIntegrationActivationFailureCustomArgs");
            break;
        }
        this._onDidChangeProperty.fire({ type, value });
      })
    ];
    if (newProcess.onProcessReplayComplete) {
      this._processListeners.push(newProcess.onProcessReplayComplete(() => this._onProcessReplayComplete.fire()));
    }
    if (newProcess.onRestoreCommands) {
      this._processListeners.push(newProcess.onRestoreCommands((e) => this._onRestoreCommands.fire(e)));
    }
    setTimeout(() => {
      if (this.processState === ProcessState.Launching) {
        this._setProcessState(ProcessState.Running);
      }
    }, 500 /* ErrorLaunchThresholdDuration */);
    const result = await newProcess.start();
    if (result) {
      return result;
    }
    runWhenWindowIdle(getActiveWindow(), () => {
      this.backend?.getLatency().then((measurements) => {
        this._logService.info(`Latency measurements for ${this.remoteAuthority ?? "local"} backend
${measurements.map((e) => `${e.label}: ${e.latency.toFixed(2)}ms`).join("\n")}`);
      });
    });
    return void 0;
  }
  async relaunch(shellLaunchConfig, cols, rows, reset) {
    this.ptyProcessReady = this._createPtyProcessReadyPromise();
    this._logService.trace(`Relaunching terminal instance ${this._instanceId}`);
    if (this._isDisconnected) {
      this._isDisconnected = false;
      this._onPtyReconnect.fire();
    }
    this._hasWrittenData = false;
    return this.createProcess(shellLaunchConfig, cols, rows, reset);
  }
  // Fetch any extension environment additions and apply them
  async _resolveEnvironment(backend, variableResolver, shellLaunchConfig) {
    const workspaceFolder = terminalEnvironment.getWorkspaceForTerminal(shellLaunchConfig.cwd, this._workspaceContextService, this._historyService);
    const platformKey = isWindows ? "windows" : isMacintosh ? "osx" : "linux";
    const envFromConfigValue = this._configurationService.getValue(`terminal.integrated.env.${platformKey}`);
    this._logService.debug(`Resolving environment (useShellEnvironment=${shellLaunchConfig.useShellEnvironment}, platformKey=${platformKey}, envFromConfig=${envFromConfigValue ? Object.keys(envFromConfigValue).join(",") : "none"})`);
    let baseEnv;
    if (shellLaunchConfig.useShellEnvironment) {
      const shellEnv = await backend.getShellEnvironment();
      if (!shellEnv) {
        throw new BugIndicatingError("Cannot fetch shell environment to use");
      }
      this._logService.debug(`Shell environment resolved with ${Object.keys(shellEnv).length} variables: ${Object.keys(shellEnv).sort().join(", ")}`);
      baseEnv = shellEnv;
    } else {
      baseEnv = await this._terminalProfileResolverService.getEnvironment(this.remoteAuthority);
      this._logService.debug(`Profile environment resolved with ${Object.keys(baseEnv).length} variables`);
    }
    const env = await terminalEnvironment.createTerminalEnvironment(shellLaunchConfig, envFromConfigValue, variableResolver, this._productService.version, this._terminalConfigurationService.config.detectLocale, baseEnv);
    this._logService.debug(`Terminal environment created with ${Object.keys(env).length} variables: ${Object.keys(env).sort().join(", ")}`);
    this._environmentVariableCollectionListener.clear();
    if (!this._isDisposed && shouldUseEnvironmentVariableCollection(shellLaunchConfig)) {
      this._extEnvironmentVariableCollection = this._environmentVariableService.mergedCollection;
      this._environmentVariableCollectionListener.value = this._environmentVariableService.onDidChangeCollections((newCollection) => this._onEnvironmentVariableCollectionChange(newCollection));
      await this._extEnvironmentVariableCollection.applyToProcessEnvironment(env, { workspaceFolder }, variableResolver);
      if (this._extEnvironmentVariableCollection.getVariableMap({ workspaceFolder }).size) {
        this.environmentVariableInfo = this._instantiationService.createInstance(EnvironmentVariableInfoChangesActive, this._extEnvironmentVariableCollection);
        this._onEnvironmentVariableInfoChange.fire(this.environmentVariableInfo);
      }
    }
    return env;
  }
  async _launchLocalProcess(backend, shellLaunchConfig, cols, rows, userHome, variableResolver) {
    await this._terminalProfileResolverService.resolveShellLaunchConfig(shellLaunchConfig, {
      remoteAuthority: void 0,
      os: OS
    });
    const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot(Schemas.file);
    const initialCwd = await terminalEnvironment.getCwd(
      shellLaunchConfig,
      userHome,
      variableResolver,
      activeWorkspaceRootUri,
      this._terminalConfigurationService.config.cwd,
      this._logService
    );
    const env = await this._resolveEnvironment(backend, variableResolver, shellLaunchConfig);
    const options = {
      shellIntegration: {
        enabled: this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled),
        suggestEnabled: this._configurationService.getValue(TerminalContribSettingId.SuggestEnabled),
        nonce: this.shellIntegrationNonce
      },
      windowsUseConptyDll: this._terminalConfigurationService.config.windowsUseConptyDll ?? false,
      environmentVariableCollections: this._extEnvironmentVariableCollection ? serializeEnvironmentVariableCollections(this._extEnvironmentVariableCollection.collections) : void 0,
      workspaceFolder: this._cwdWorkspaceFolder,
      isScreenReaderOptimized: this._accessibilityService.isScreenReaderOptimized()
    };
    const shouldPersist = (this._configurationService.getValue(TaskSettingId.Reconnection) && shellLaunchConfig.reconnectionProperties || !shellLaunchConfig.isFeatureTerminal) && this._terminalConfigurationService.config.enablePersistentSessions && !shellLaunchConfig.isTransient;
    return await backend.createProcess(shellLaunchConfig, initialCwd, cols, rows, this._terminalConfigurationService.config.unicodeVersion, env, options, shouldPersist);
  }
  _setupPtyHostListeners(backend) {
    if (this._ptyListenersAttached) {
      return;
    }
    this._ptyListenersAttached = true;
    this._register(backend.onPtyHostUnresponsive(() => {
      this._isDisconnected = true;
      this._onPtyDisconnect.fire();
    }));
    this._ptyResponsiveListener = backend.onPtyHostResponsive(() => {
      this._isDisconnected = false;
      this._onPtyReconnect.fire();
    });
    this._register(toDisposable(() => this._ptyResponsiveListener?.dispose()));
    this._register(backend.onPtyHostRestart(async () => {
      if (!this._isDisconnected) {
        this._isDisconnected = true;
        this._onPtyDisconnect.fire();
      }
      this._ptyResponsiveListener?.dispose();
      this._ptyResponsiveListener = void 0;
      if (this._shellLaunchConfig) {
        if (this._shellLaunchConfig.isFeatureTerminal && !this.reconnectionProperties) {
          this._onExit(-1);
        } else {
          const message = localize("ptyHostRelaunch", "Restarting the terminal because the connection to the shell process was lost...");
          let postRestartMessage = "";
          if (this.os === OperatingSystem.Windows && this._dimensions.rows > 0) {
            postRestartMessage = "\r\n".repeat(this._dimensions.rows - 1) + `\x1B[H`;
          }
          this._onProcessData.fire({ data: formatMessageForTerminal(message, { loudFormatting: true }) + postRestartMessage, trackCommit: false });
          await this.relaunch(this._shellLaunchConfig, this._dimensions.cols, this._dimensions.rows, false);
        }
      }
    }));
    this._register(toDisposable(() => {
      this.ptyProcessReady = void 0;
    }));
  }
  async getBackendOS() {
    let os = OS;
    if (!!this.remoteAuthority) {
      const remoteEnv = await this._remoteAgentService.getEnvironment();
      if (!remoteEnv) {
        throw new Error(`Failed to get remote environment for remote authority "${this.remoteAuthority}"`);
      }
      os = remoteEnv.os;
    }
    return os;
  }
  setDimensions(cols, rows, sync, pixelWidth, pixelHeight) {
    if (sync) {
      this._resize(cols, rows, pixelWidth, pixelHeight);
      return;
    }
    if (this._store.isDisposed) {
      return Promise.resolve();
    }
    if (!this.ptyProcessReady) {
      throw new Error("TerminalProcessManager.setDimensions called before initialization");
    }
    return this.ptyProcessReady.then(() => this._resize(cols, rows, pixelWidth, pixelHeight));
  }
  async setUnicodeVersion(version) {
    return this._process?.setUnicodeVersion(version);
  }
  async setNextCommandId(commandLine, commandId) {
    await this.ptyProcessReady;
    const process = this._process;
    if (!process?.id) {
      return;
    }
    await this._terminalService.setNextCommandId(process.id, commandLine, commandId);
  }
  _resize(cols, rows, pixelWidth, pixelHeight) {
    if (!this._process) {
      return;
    }
    try {
      this._process.resize(cols, rows, pixelWidth, pixelHeight);
    } catch (error) {
      if (error.code !== "EPIPE" && error.code !== "ERR_IPC_CHANNEL_CLOSED") {
        throw error;
      }
    }
    this._dimensions.cols = cols;
    this._dimensions.rows = rows;
  }
  async write(data) {
    await this.ptyProcessReady;
    this._dataFilter.disableSeamlessRelaunch();
    this._hasWrittenData = true;
    if (this.shellProcessId || this._processType === 1 /* PsuedoTerminal */) {
      if (this._process) {
        this._process.input(data);
      }
    } else {
      this._logService.debug("queueing data in prelaunch input queue", data);
      this._preLaunchInputQueue.push(data);
    }
  }
  async sendSignal(signal) {
    await this.ptyProcessReady;
    if (this._process) {
      this._process.sendSignal(signal);
    }
  }
  async processBinary(data) {
    await this.ptyProcessReady;
    this._dataFilter.disableSeamlessRelaunch();
    this._hasWrittenData = true;
    this._process?.processBinary(data);
  }
  get initialCwd() {
    return this._initialCwd ?? "";
  }
  async refreshProperty(type) {
    if (!this._process) {
      throw new Error("Cannot refresh property when process is not set");
    }
    return this._process.refreshProperty(type);
  }
  async updateProperty(type, value) {
    return this._process?.updateProperty(type, value);
  }
  acknowledgeDataEvent(charCount) {
    this._ackDataBufferer.ack(charCount);
  }
  _onExit(exitCode) {
    this._process = null;
    if (this.processState === ProcessState.Launching) {
      this._setProcessState(ProcessState.KilledDuringLaunch);
    }
    if (this.processState === ProcessState.Running) {
      this._setProcessState(ProcessState.KilledByProcess);
    }
    this._onProcessExit.fire(exitCode);
  }
  _setProcessState(state) {
    this.processState = state;
    this._onProcessStateChange.fire();
  }
  _onEnvironmentVariableCollectionChange(newCollection) {
    const diff = this._extEnvironmentVariableCollection.diff(newCollection, { workspaceFolder: this._cwdWorkspaceFolder });
    if (diff === void 0) {
      if (this.environmentVariableInfo instanceof EnvironmentVariableInfoStale) {
        this.environmentVariableInfo = this._instantiationService.createInstance(EnvironmentVariableInfoChangesActive, this._extEnvironmentVariableCollection);
        this._onEnvironmentVariableInfoChange.fire(this.environmentVariableInfo);
      }
      return;
    }
    this.environmentVariableInfo = this._instantiationService.createInstance(EnvironmentVariableInfoStale, diff, this._instanceId, newCollection);
    this._onEnvironmentVariableInfoChange.fire(this.environmentVariableInfo);
  }
  async clearBuffer() {
    this._process?.clearBuffer?.();
  }
};
TerminalProcessManager = __decorateClass([
  __decorateParam(4, IHistoryService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ITerminalLogService),
  __decorateParam(7, IWorkspaceContextService),
  __decorateParam(8, IConfigurationResolverService),
  __decorateParam(9, IWorkbenchEnvironmentService),
  __decorateParam(10, IProductService),
  __decorateParam(11, IRemoteAgentService),
  __decorateParam(12, IPathService),
  __decorateParam(13, IEnvironmentVariableService),
  __decorateParam(14, ITerminalConfigurationService),
  __decorateParam(15, ITerminalProfileResolverService),
  __decorateParam(16, IConfigurationService),
  __decorateParam(17, ITerminalInstanceService),
  __decorateParam(18, ITelemetryService),
  __decorateParam(19, INotificationService),
  __decorateParam(20, IAccessibilityService),
  __decorateParam(21, ITerminalService)
], TerminalProcessManager);
class AckDataBufferer {
  constructor(_callback) {
    this._callback = _callback;
    this._unsentCharCount = 0;
  }
  ack(charCount) {
    this._unsentCharCount += charCount;
    while (this._unsentCharCount > FlowControlConstants.CharCountAckSize) {
      this._unsentCharCount -= FlowControlConstants.CharCountAckSize;
      this._callback(FlowControlConstants.CharCountAckSize);
    }
  }
}
var SeamlessRelaunchConstants = /* @__PURE__ */ ((SeamlessRelaunchConstants2) => {
  SeamlessRelaunchConstants2[SeamlessRelaunchConstants2["RecordTerminalDuration"] = 1e4] = "RecordTerminalDuration";
  SeamlessRelaunchConstants2[SeamlessRelaunchConstants2["SwapWaitMaximumDuration"] = 3e3] = "SwapWaitMaximumDuration";
  return SeamlessRelaunchConstants2;
})(SeamlessRelaunchConstants || {});
let SeamlessRelaunchDataFilter = class extends Disposable {
  constructor(_logService) {
    super();
    this._logService = _logService;
    this._firstDisposable = this._register(new MutableDisposable());
    this._secondDisposable = this._register(new MutableDisposable());
    this._dataListener = this._register(new MutableDisposable());
    this._disableSeamlessRelaunch = false;
    this._onProcessData = this._register(new Emitter());
  }
  get onProcessData() {
    return this._onProcessData.event;
  }
  newProcess(process, reset) {
    this._dataListener.clear();
    this._activeProcess?.shutdown(false);
    this._activeProcess = process;
    if (!this._firstRecorder || !reset || this._disableSeamlessRelaunch) {
      [this._firstRecorder, this._firstDisposable.value] = this._createRecorder(process);
      if (this._disableSeamlessRelaunch && reset) {
        this._onProcessData.fire("\x1Bc");
      }
      this._dataListener.value = process.onProcessData((e) => this._onProcessData.fire(e));
      this._disableSeamlessRelaunch = false;
      return;
    }
    if (this._secondRecorder) {
      this.triggerSwap();
    }
    this._swapTimeout = mainWindow.setTimeout(() => this.triggerSwap(), 3e3 /* SwapWaitMaximumDuration */);
    this._dataListener.clear();
    this._firstDisposable.clear();
    const recorder = this._createRecorder(process);
    [this._secondRecorder, this._secondDisposable.value] = recorder;
  }
  /**
   * Disables seamless relaunch for the active process
   */
  disableSeamlessRelaunch() {
    this._disableSeamlessRelaunch = true;
    this._stopRecording();
    this.triggerSwap();
  }
  /**
   * Trigger the swap of the processes if needed (eg. timeout, input)
   */
  triggerSwap() {
    if (this._swapTimeout) {
      mainWindow.clearTimeout(this._swapTimeout);
      this._swapTimeout = void 0;
    }
    if (!this._firstRecorder) {
      return;
    }
    if (!this._secondRecorder) {
      this._firstRecorder = void 0;
      this._firstDisposable.clear();
      return;
    }
    const firstData = this._getDataFromRecorder(this._firstRecorder);
    const secondData = this._getDataFromRecorder(this._secondRecorder);
    if (firstData === secondData) {
      this._logService.trace(`Seamless terminal relaunch - identical content`);
    } else {
      this._logService.trace(`Seamless terminal relaunch - resetting content`);
      this._onProcessData.fire({ data: `\x1Bc${secondData}`, trackCommit: false });
    }
    this._dataListener.value = this._activeProcess.onProcessData((e) => this._onProcessData.fire(e));
    this._firstRecorder = this._secondRecorder;
    this._firstDisposable.value = this._secondDisposable.value;
    this._secondRecorder = void 0;
  }
  _stopRecording() {
    if (this._swapTimeout) {
      return;
    }
    this._firstRecorder = void 0;
    this._firstDisposable.clear();
    this._secondRecorder = void 0;
    this._secondDisposable.clear();
  }
  _createRecorder(process) {
    const recorder = new TerminalRecorder(0, 0);
    const disposable = process.onProcessData((e) => recorder.handleData(isString(e) ? e : e.data));
    return [recorder, disposable];
  }
  _getDataFromRecorder(recorder) {
    return recorder.generateReplayEventSync().events.filter((e) => !!e.data).map((e) => e.data).join("");
  }
};
SeamlessRelaunchDataFilter = __decorateClass([
  __decorateParam(0, ITerminalLogService)
], SeamlessRelaunchDataFilter);
export {
  TerminalProcessManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxQcm9jZXNzTWFuYWdlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NFbnZpcm9ubWVudCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cywgT3BlcmF0aW5nU3lzdGVtLCBPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBmb3JtYXRNZXNzYWdlRm9yVGVybWluYWwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWxTdHJpbmdzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRSZW1vdGVBdXRob3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUhvc3RzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVNlcmlhbGl6ZWRDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSwgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgTmFpdmVDd2REZXRlY3Rpb25DYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9uYWl2ZUN3ZERldGVjdGlvbkNhcGFiaWxpdHkuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL3Rlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLmpzJztcbmltcG9ydCB7IEZsb3dDb250cm9sQ29uc3RhbnRzLCBJVGVybWluYWxMYXVuY2hSZXN1bHQsIElQcm9jZXNzRGF0YUV2ZW50LCBJUHJvY2Vzc1Byb3BlcnR5LCBJUHJvY2Vzc1Byb3BlcnR5TWFwLCBJUHJvY2Vzc1JlYWR5RXZlbnQsIElSZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzLCBJU2hlbGxMYXVuY2hDb25maWcsIElUZXJtaW5hbEJhY2tlbmQsIElUZXJtaW5hbENoaWxkUHJvY2VzcywgSVRlcm1pbmFsRGltZW5zaW9ucywgSVRlcm1pbmFsRW52aXJvbm1lbnQsIElUZXJtaW5hbExhdW5jaEVycm9yLCBJVGVybWluYWxMb2dTZXJ2aWNlLCBJVGVybWluYWxQcm9jZXNzT3B0aW9ucywgUHJvY2Vzc1Byb3BlcnR5VHlwZSwgVGVybWluYWxTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxSZWNvcmRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbFJlY29yZGVyLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IEVudmlyb25tZW50VmFyaWFibGVJbmZvQ2hhbmdlc0FjdGl2ZSwgRW52aXJvbm1lbnRWYXJpYWJsZUluZm9TdGFsZSB9IGZyb20gJy4vZW52aXJvbm1lbnRWYXJpYWJsZUluZm8uanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsIElUZXJtaW5hbEluc3RhbmNlU2VydmljZSwgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50VmFyaWFibGVJbmZvLCBJRW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZS5qcyc7XG5pbXBvcnQgeyBNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZVNoYXJlZC5qcyc7XG5pbXBvcnQgeyBJQmVmb3JlUHJvY2Vzc0RhdGFFdmVudCwgSVRlcm1pbmFsUHJvY2Vzc01hbmFnZXIsIElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsIFByb2Nlc3NTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgKiBhcyB0ZXJtaW5hbEVudmlyb25tZW50IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaGlzdG9yeS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGFza1NldHRpbmdJZCB9IGZyb20gJy4uLy4uL3Rhc2tzL2NvbW1vbi90YXNrcy5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24sIElNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aXZlV2luZG93LCBydW5XaGVuV2luZG93SWRsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgc2hvdWxkVXNlRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWxFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbnRyaWJTZXR0aW5nSWQgfSBmcm9tICcuLi90ZXJtaW5hbENvbnRyaWJFeHBvcnRzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB0eXBlIHsgTWF5YmVQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbmNvbnN0IGVudW0gUHJvY2Vzc0NvbnN0YW50cyB7XG5cdC8qKlxuXHQgKiBUaGUgYW1vdW50IG9mIHRpbWUgdG8gY29uc2lkZXIgdGVybWluYWwgZXJyb3JzIHRvIGJlIHJlbGF0ZWQgdG8gdGhlIGxhdW5jaC5cblx0ICovXG5cdEVycm9yTGF1bmNoVGhyZXNob2xkRHVyYXRpb24gPSA1MDAsXG5cdC8qKlxuXHQgKiBUaGUgbWluaW11bSBhbW91bnQgb2YgdGltZSBiZXR3ZWVuIGxhdGVuY3kgcmVxdWVzdHMuXG5cdCAqL1xuXHRMYXRlbmN5TWVhc3VyaW5nSW50ZXJ2YWwgPSAxMDAwLFxufVxuXG5jb25zdCBlbnVtIFByb2Nlc3NUeXBlIHtcblx0UHJvY2Vzcyxcblx0UHN1ZWRvVGVybWluYWxcbn1cblxuLyoqXG4gKiBIb2xkcyBhbGwgc3RhdGUgcmVsYXRlZCB0byB0aGUgY3JlYXRpb24gYW5kIG1hbmFnZW1lbnQgb2YgdGVybWluYWwgcHJvY2Vzc2VzLlxuICpcbiAqIEludGVybmFsIGRlZmluaXRpb25zOlxuICogLSBQcm9jZXNzOiBUaGUgcHJvY2VzcyBsYXVuY2hlZCB3aXRoIHRoZSB0ZXJtaW5hbFByb2Nlc3MudHMgZmlsZSwgb3IgdGhlIHB0eSBhcyBhIHdob2xlXG4gKiAtIFB0eSBQcm9jZXNzOiBUaGUgcHNldWRvdGVybWluYWwgcGFyZW50IHByb2Nlc3MgKG9yIHRoZSBjb25wdHkgYWdlbnQgcHJvY2VzcylcbiAqIC0gU2hlbGwgUHJvY2VzczogVGhlIHBzZXVkb3Rlcm1pbmFsIGNoaWxkIHByb2Nlc3MgKGllLiB0aGUgc2hlbGwpXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyIHtcblx0cHJvY2Vzc1N0YXRlOiBQcm9jZXNzU3RhdGUgPSBQcm9jZXNzU3RhdGUuVW5pbml0aWFsaXplZDtcblx0cHR5UHJvY2Vzc1JlYWR5OiBQcm9taXNlPHZvaWQ+O1xuXHRzaGVsbFByb2Nlc3NJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSByZW1vdGVBdXRob3JpdHk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0b3M6IE9wZXJhdGluZ1N5c3RlbSB8IHVuZGVmaW5lZDtcblx0dXNlckhvbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0ZW52aXJvbm1lbnRWYXJpYWJsZUluZm86IElFbnZpcm9ubWVudFZhcmlhYmxlSW5mbyB8IHVuZGVmaW5lZDtcblx0YmFja2VuZDogSVRlcm1pbmFsQmFja2VuZCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlKCkpO1xuXHRyZWFkb25seSBzaGVsbEludGVncmF0aW9uTm9uY2U6IHN0cmluZztcblx0cHJvY2Vzc1JlYWR5VGltZXN0YW1wOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgX2lzRGlzcG9zZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfcHJvY2VzczogSVRlcm1pbmFsQ2hpbGRQcm9jZXNzIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX3Byb2Nlc3NUeXBlOiBQcm9jZXNzVHlwZSA9IFByb2Nlc3NUeXBlLlByb2Nlc3M7XG5cdHByaXZhdGUgX3ByZUxhdW5jaElucHV0UXVldWU6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgX2luaXRpYWxDd2Q6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZXh0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb246IElNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25MaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdHByaXZhdGUgX2Fja0RhdGFCdWZmZXJlcjogQWNrRGF0YUJ1ZmZlcmVyO1xuXHRwcml2YXRlIF9oYXNXcml0dGVuRGF0YTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9oYXNDaGlsZFByb2Nlc3NlczogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9wdHlSZXNwb25zaXZlTGlzdGVuZXI6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wdHlMaXN0ZW5lcnNBdHRhY2hlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9kYXRhRmlsdGVyOiBTZWFtbGVzc1JlbGF1bmNoRGF0YUZpbHRlcjtcblx0cHJpdmF0ZSBfcHJvY2Vzc0xpc3RlbmVycz86IElEaXNwb3NhYmxlW107XG5cdHByaXZhdGUgX2lzRGlzY29ubmVjdGVkOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfcHJvY2Vzc1RyYWl0czogSVByb2Nlc3NSZWFkeUV2ZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zaGVsbExhdW5jaENvbmZpZz86IElTaGVsbExhdW5jaENvbmZpZztcblx0cHJpdmF0ZSBfZGltZW5zaW9uczogSVRlcm1pbmFsRGltZW5zaW9ucyA9IHsgY29sczogMCwgcm93czogMCB9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHR5RGlzY29ubmVjdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblB0eURpc2Nvbm5lY3QgPSB0aGlzLl9vblB0eURpc2Nvbm5lY3QuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHR5UmVjb25uZWN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uUHR5UmVjb25uZWN0ID0gdGhpcy5fb25QdHlSZWNvbm5lY3QuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzUmVhZHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUHJvY2Vzc1JlYWR5RXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NSZWFkeSA9IHRoaXMuX29uUHJvY2Vzc1JlYWR5LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NTdGF0ZUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NTdGF0ZUNoYW5nZSA9IHRoaXMuX29uUHJvY2Vzc1N0YXRlQ2hhbmdlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkJlZm9yZVByb2Nlc3NEYXRhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJlZm9yZVByb2Nlc3NEYXRhRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkJlZm9yZVByb2Nlc3NEYXRhID0gdGhpcy5fb25CZWZvcmVQcm9jZXNzRGF0YS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzRGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQcm9jZXNzRGF0YUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzRGF0YSA9IHRoaXMuX29uUHJvY2Vzc0RhdGEuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc1JlcGxheUNvbXBsZXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc1JlcGxheUNvbXBsZXRlID0gdGhpcy5fb25Qcm9jZXNzUmVwbGF5Q29tcGxldGUuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUHJvcGVydHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUHJvY2Vzc1Byb3BlcnR5PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm9wZXJ0eSA9IHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRW52aXJvbm1lbnRWYXJpYWJsZUluZm9DaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRW52aXJvbm1lbnRWYXJpYWJsZUluZm8+KCkpO1xuXHRyZWFkb25seSBvbkVudmlyb25tZW50VmFyaWFibGVJbmZvQ2hhbmdlZCA9IHRoaXMuX29uRW52aXJvbm1lbnRWYXJpYWJsZUluZm9DaGFuZ2UuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc0V4aXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxudW1iZXIgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NFeGl0ID0gdGhpcy5fb25Qcm9jZXNzRXhpdC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25SZXN0b3JlQ29tbWFuZHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2VyaWFsaXplZENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5PigpKTtcblx0cmVhZG9ubHkgb25SZXN0b3JlQ29tbWFuZHMgPSB0aGlzLl9vblJlc3RvcmVDb21tYW5kcy5ldmVudDtcblx0cHJpdmF0ZSBfY3dkV29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBwZXJzaXN0ZW50UHJvY2Vzc0lkKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9wcm9jZXNzPy5pZDsgfVxuXHRnZXQgc2hvdWxkUGVyc2lzdCgpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5yZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzIHx8ICh0aGlzLl9wcm9jZXNzID8gdGhpcy5fcHJvY2Vzcy5zaG91bGRQZXJzaXN0IDogZmFsc2UpOyB9XG5cdGdldCBoYXNXcml0dGVuRGF0YSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2hhc1dyaXR0ZW5EYXRhOyB9XG5cdGdldCBoYXNDaGlsZFByb2Nlc3NlcygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2hhc0NoaWxkUHJvY2Vzc2VzOyB9XG5cdGdldCByZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzKCk6IElSZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnPy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcz8ucmVjb25uZWN0aW9uUHJvcGVydGllcyB8fCB0aGlzLl9zaGVsbExhdW5jaENvbmZpZz8ucmVjb25uZWN0aW9uUHJvcGVydGllcyB8fCB1bmRlZmluZWQ7IH1cblx0Z2V0IGV4dEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKCk6IElNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9leHRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbjsgfVxuXHRnZXQgcHJvY2Vzc1RyYWl0cygpOiBJUHJvY2Vzc1JlYWR5RXZlbnQgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fcHJvY2Vzc1RyYWl0czsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbmNlSWQ6IG51bWJlcixcblx0XHRjd2Q6IHN0cmluZyB8IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRlbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnM6IFJlYWRvbmx5TWFwPHN0cmluZywgSUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uPiB8IHVuZGVmaW5lZCxcblx0XHRzaGVsbEludGVncmF0aW9uTm9uY2U6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASUhpc3RvcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlTZXJ2aWNlOiBJSGlzdG9yeVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElUZXJtaW5hbExvZ1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3BhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZTogSUVudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2U6IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxJbnN0YW5jZVNlcnZpY2U6IElUZXJtaW5hbEluc3RhbmNlU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jd2RXb3Jrc3BhY2VGb2xkZXIgPSB0ZXJtaW5hbEVudmlyb25tZW50LmdldFdvcmtzcGFjZUZvclRlcm1pbmFsKGN3ZCwgdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHRoaXMuX2hpc3RvcnlTZXJ2aWNlKTtcblx0XHR0aGlzLnB0eVByb2Nlc3NSZWFkeSA9IHRoaXMuX2NyZWF0ZVB0eVByb2Nlc3NSZWFkeVByb21pc2UoKTtcblx0XHR0aGlzLl9hY2tEYXRhQnVmZmVyZXIgPSBuZXcgQWNrRGF0YUJ1ZmZlcmVyKGUgPT4gdGhpcy5fcHJvY2Vzcz8uYWNrbm93bGVkZ2VEYXRhRXZlbnQoZSkpO1xuXHRcdHRoaXMuX2RhdGFGaWx0ZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZWFtbGVzc1JlbGF1bmNoRGF0YUZpbHRlcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RhdGFGaWx0ZXIub25Qcm9jZXNzRGF0YShldiA9PiB7XG5cdFx0XHRjb25zdCBkYXRhID0gKGlzU3RyaW5nKGV2KSA/IGV2IDogZXYuZGF0YSk7XG5cdFx0XHRjb25zdCBiZWZvcmVQcm9jZXNzRGF0YUV2ZW50OiBJQmVmb3JlUHJvY2Vzc0RhdGFFdmVudCA9IHsgZGF0YSB9O1xuXHRcdFx0dGhpcy5fb25CZWZvcmVQcm9jZXNzRGF0YS5maXJlKGJlZm9yZVByb2Nlc3NEYXRhRXZlbnQpO1xuXHRcdFx0aWYgKGJlZm9yZVByb2Nlc3NEYXRhRXZlbnQuZGF0YSAmJiBiZWZvcmVQcm9jZXNzRGF0YUV2ZW50LmRhdGEubGVuZ3RoID4gMCkge1xuXHRcdFx0XHQvLyBUaGlzIGV2ZW50IGlzIHVzZWQgYnkgdGhlIGNhbGxlciBzbyB0aGUgb2JqZWN0IG11c3QgYmUgcmV1c2VkXG5cdFx0XHRcdGlmICghaXNTdHJpbmcoZXYpKSB7XG5cdFx0XHRcdFx0ZXYuZGF0YSA9IGJlZm9yZVByb2Nlc3NEYXRhRXZlbnQuZGF0YTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9vblByb2Nlc3NEYXRhLmZpcmUoIWlzU3RyaW5nKGV2KSA/IGV2IDogeyBkYXRhOiBiZWZvcmVQcm9jZXNzRGF0YUV2ZW50LmRhdGEsIHRyYWNrQ29tbWl0OiBmYWxzZSB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoY3dkICYmIHR5cGVvZiBjd2QgPT09ICdvYmplY3QnKSB7XG5cdFx0XHR0aGlzLnJlbW90ZUF1dGhvcml0eSA9IGdldFJlbW90ZUF1dGhvcml0eShjd2QpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlbW90ZUF1dGhvcml0eSA9IHRoaXMuX3dvcmtiZW5jaEVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0fVxuXG5cdFx0aWYgKGVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9ucykge1xuXHRcdFx0dGhpcy5fZXh0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24gPSBuZXcgTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zKTtcblx0XHRcdHRoaXMuX2Vudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uTGlzdGVuZXIudmFsdWUgPSB0aGlzLl9lbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZS5vbkRpZENoYW5nZUNvbGxlY3Rpb25zKG5ld0NvbGxlY3Rpb24gPT4gdGhpcy5fb25FbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbkNoYW5nZShuZXdDb2xsZWN0aW9uKSk7XG5cdFx0XHR0aGlzLmVudmlyb25tZW50VmFyaWFibGVJbmZvID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW52aXJvbm1lbnRWYXJpYWJsZUluZm9DaGFuZ2VzQWN0aXZlLCB0aGlzLl9leHRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbik7XG5cdFx0XHR0aGlzLl9vbkVudmlyb25tZW50VmFyaWFibGVJbmZvQ2hhbmdlLmZpcmUodGhpcy5lbnZpcm9ubWVudFZhcmlhYmxlSW5mbyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zaGVsbEludGVncmF0aW9uTm9uY2UgPSBzaGVsbEludGVncmF0aW9uTm9uY2UgPz8gZ2VuZXJhdGVVdWlkKCk7XG5cdH1cblxuXHRhc3luYyBmcmVlUG9ydEtpbGxQcm9jZXNzKHBvcnQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5fcHJvY2Vzcz8uZnJlZVBvcnRLaWxsUHJvY2Vzcykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9wcm9jZXNzPy5mcmVlUG9ydEtpbGxQcm9jZXNzKHBvcnQpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHsgbWVzc2FnZTogbG9jYWxpemUoJ2tpbGxwb3J0ZmFpbHVyZScsICdDb3VsZCBub3Qga2lsbCBwcm9jZXNzIGxpc3RlbmluZyBvbiBwb3J0IHswfSwgY29tbWFuZCBleGl0ZWQgd2l0aCBlcnJvciB7MX0nLCBwb3J0LCBlKSwgc2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcgfSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZShpbW1lZGlhdGU6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdGlmICh0aGlzLl9wcm9jZXNzKSB7XG5cdFx0XHQvLyBJZiB0aGUgcHJvY2VzcyB3YXMgc3RpbGwgY29ubmVjdGVkIHRoaXMgZGlzcG9zZSBjYW1lIGZyb21cblx0XHRcdC8vIHdpdGhpbiBWUyBDb2RlLCBub3QgdGhlIHByb2Nlc3MsIHNvIG1hcmsgdGhlIHByb2Nlc3MgYXNcblx0XHRcdC8vIGtpbGxlZCBieSB0aGUgdXNlci5cblx0XHRcdHRoaXMuX3NldFByb2Nlc3NTdGF0ZShQcm9jZXNzU3RhdGUuS2lsbGVkQnlVc2VyKTtcblx0XHRcdHRoaXMuX3Byb2Nlc3Muc2h1dGRvd24oaW1tZWRpYXRlKTtcblx0XHRcdHRoaXMuX3Byb2Nlc3MgPSBudWxsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcHJvY2Vzc0xpc3RlbmVycykge1xuXHRcdFx0ZGlzcG9zZSh0aGlzLl9wcm9jZXNzTGlzdGVuZXJzKTtcblx0XHRcdHRoaXMuX3Byb2Nlc3NMaXN0ZW5lcnMgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVB0eVByb2Nlc3NSZWFkeVByb21pc2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oYyA9PiB7XG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IEV2ZW50Lm9uY2UodGhpcy5vblByb2Nlc3NSZWFkeSkoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBUZXJtaW5hbCBwcm9jZXNzIHJlYWR5IChzaGVsbFByb2Nlc3NJZDogJHt0aGlzLnNoZWxsUHJvY2Vzc0lkfSlgKTtcblx0XHRcdFx0dGhpcy5fc3RvcmUuZGVsZXRlKGxpc3RlbmVyKTtcblx0XHRcdFx0Yyh1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQobGlzdGVuZXIpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZGV0YWNoRnJvbVByb2Nlc3MoZm9yY2VQZXJzaXN0PzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3Byb2Nlc3M/LmRldGFjaD8uKGZvcmNlUGVyc2lzdCk7XG5cdFx0dGhpcy5fcHJvY2VzcyA9IG51bGw7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVQcm9jZXNzKFxuXHRcdHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsXG5cdFx0Y29sczogbnVtYmVyLFxuXHRcdHJvd3M6IG51bWJlcixcblx0XHRyZXNldDogYm9vbGVhbiA9IHRydWVcblx0KTogUHJvbWlzZTxJVGVybWluYWxMYXVuY2hFcnJvciB8IElUZXJtaW5hbExhdW5jaFJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnID0gc2hlbGxMYXVuY2hDb25maWc7XG5cdFx0dGhpcy5fZGltZW5zaW9ucy5jb2xzID0gY29scztcblx0XHR0aGlzLl9kaW1lbnNpb25zLnJvd3MgPSByb3dzO1xuXG5cdFx0bGV0IG5ld1Byb2Nlc3M6IElUZXJtaW5hbENoaWxkUHJvY2VzcyB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChzaGVsbExhdW5jaENvbmZpZy5jdXN0b21QdHlJbXBsZW1lbnRhdGlvbikge1xuXHRcdFx0dGhpcy5fcHJvY2Vzc1R5cGUgPSBQcm9jZXNzVHlwZS5Qc3VlZG9UZXJtaW5hbDtcblx0XHRcdG5ld1Byb2Nlc3MgPSBzaGVsbExhdW5jaENvbmZpZy5jdXN0b21QdHlJbXBsZW1lbnRhdGlvbih0aGlzLl9pbnN0YW5jZUlkLCBjb2xzLCByb3dzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgYmFja2VuZCA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmdldEJhY2tlbmQodGhpcy5yZW1vdGVBdXRob3JpdHkpO1xuXHRcdFx0aWYgKCFiYWNrZW5kKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gdGVybWluYWwgYmFja2VuZCByZWdpc3RlcmVkIGZvciByZW1vdGUgYXV0aG9yaXR5ICcke3RoaXMucmVtb3RlQXV0aG9yaXR5fSdgKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuYmFja2VuZCA9IGJhY2tlbmQ7XG5cblx0XHRcdC8vIENyZWF0ZSB2YXJpYWJsZSByZXNvbHZlclxuXHRcdFx0Ly8gU3RhcnQgd2l0aCB0aGUgZnVsbCBiYXNlIGVudmlyb25tZW50IHNvIHRoYXQgYWxsIHN0YW5kYXJkIHZhcmlhYmxlcyAoZS5nLiBQQVRIKSBhcmVcblx0XHRcdC8vIGF2YWlsYWJsZSwgdGhlbiBvdmVybGF5IHRoZSBzaGVsbCBlbnZpcm9ubWVudCBvbiB0b3Agc28gdGhhdCBsYXVuY2ggY29uZmlndXJhdGlvblxuXHRcdFx0Ly8gdmFyaWFibGVzIGFuZCBzaGVsbC1wcm9maWxlIG1vZGlmaWNhdGlvbnMgdGFrZSBwcmVjZWRlbmNlLlxuXHRcdFx0Y29uc3QgZW52Rm9yUmVzb2x2ZXIgPSB7IC4uLmF3YWl0IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZS5nZXRFbnZpcm9ubWVudCh0aGlzLnJlbW90ZUF1dGhvcml0eSkgfTtcblx0XHRcdHRlcm1pbmFsRW52aXJvbm1lbnQubWVyZ2VFbnZpcm9ubWVudHMoZW52Rm9yUmVzb2x2ZXIsIGF3YWl0IGJhY2tlbmQuZ2V0U2hlbGxFbnZpcm9ubWVudCgpKTtcblx0XHRcdGNvbnN0IHZhcmlhYmxlUmVzb2x2ZXIgPSB0ZXJtaW5hbEVudmlyb25tZW50LmNyZWF0ZVZhcmlhYmxlUmVzb2x2ZXIodGhpcy5fY3dkV29ya3NwYWNlRm9sZGVyLCBlbnZGb3JSZXNvbHZlciwgdGhpcy5fY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSk7XG5cblx0XHRcdC8vIHJlc29sdmVkVXNlckhvbWUgaXMgbmVlZGVkIGhlcmUgYXMgcmVtb3RlIHJlc29sdmVycyBjYW4gbGF1bmNoIGxvY2FsIHRlcm1pbmFscyBiZWZvcmVcblx0XHRcdC8vIHRoZXkncmUgY29ubmVjdGVkIHRvIHRoZSByZW1vdGUuXG5cdFx0XHR0aGlzLnVzZXJIb21lID0gdGhpcy5fcGF0aFNlcnZpY2UucmVzb2x2ZWRVc2VySG9tZT8uZnNQYXRoO1xuXHRcdFx0dGhpcy5vcyA9IE9TO1xuXHRcdFx0aWYgKCEhdGhpcy5yZW1vdGVBdXRob3JpdHkpIHtcblxuXHRcdFx0XHRjb25zdCB1c2VySG9tZVVyaSA9IGF3YWl0IHRoaXMuX3BhdGhTZXJ2aWNlLnVzZXJIb21lKCk7XG5cdFx0XHRcdHRoaXMudXNlckhvbWUgPSB1c2VySG9tZVVyaS5wYXRoO1xuXHRcdFx0XHRjb25zdCByZW1vdGVFbnYgPSBhd2FpdCB0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKTtcblx0XHRcdFx0aWYgKCFyZW1vdGVFbnYpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBnZXQgcmVtb3RlIGVudmlyb25tZW50IGZvciByZW1vdGUgYXV0aG9yaXR5IFwiJHt0aGlzLnJlbW90ZUF1dGhvcml0eX1cImApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMudXNlckhvbWUgPSByZW1vdGVFbnYudXNlckhvbWUucGF0aDtcblx0XHRcdFx0dGhpcy5vcyA9IHJlbW90ZUVudi5vcztcblxuXHRcdFx0XHQvLyB0aGlzIGlzIGEgY29weSBvZiB3aGF0IHRoZSBtZXJnZWQgZW52aXJvbm1lbnQgY29sbGVjdGlvbiBpcyBvbiB0aGUgcmVtb3RlIHNpZGVcblx0XHRcdFx0Y29uc3QgZW52ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUVudmlyb25tZW50KGJhY2tlbmQsIHZhcmlhYmxlUmVzb2x2ZXIsIHNoZWxsTGF1bmNoQ29uZmlnKTtcblx0XHRcdFx0Y29uc3Qgc2hvdWxkUGVyc2lzdCA9ICgodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGFza1NldHRpbmdJZC5SZWNvbm5lY3Rpb24pICYmIHNoZWxsTGF1bmNoQ29uZmlnLnJlY29ubmVjdGlvblByb3BlcnRpZXMpIHx8ICFzaGVsbExhdW5jaENvbmZpZy5pc0ZlYXR1cmVUZXJtaW5hbCkgJiYgdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuZW5hYmxlUGVyc2lzdGVudFNlc3Npb25zICYmICFzaGVsbExhdW5jaENvbmZpZy5pc1RyYW5zaWVudDtcblx0XHRcdFx0aWYgKHNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYmFja2VuZC5hdHRhY2hUb1Byb2Nlc3Moc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MuaWQpO1xuXHRcdFx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHRcdG5ld1Byb2Nlc3MgPSByZXN1bHQ7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIFdhcm4gYW5kIGp1c3QgY3JlYXRlIGEgbmV3IHRlcm1pbmFsIGlmIGF0dGFjaCBmYWlsZWQgZm9yIHNvbWUgcmVhc29uXG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYEF0dGFjaCB0byBwcm9jZXNzIGZhaWxlZCBmb3IgdGVybWluYWxgLCBzaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcyk7XG5cdFx0XHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2VzcyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFuZXdQcm9jZXNzKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVTaGVsbExhdW5jaENvbmZpZyhzaGVsbExhdW5jaENvbmZpZywge1xuXHRcdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB0aGlzLnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0XHRcdG9zOiB0aGlzLm9zXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Y29uc3Qgb3B0aW9uczogSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMgPSB7XG5cdFx0XHRcdFx0XHRzaGVsbEludGVncmF0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25FbmFibGVkKSxcblx0XHRcdFx0XHRcdFx0c3VnZ2VzdEVuYWJsZWQ6IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsQ29udHJpYlNldHRpbmdJZC5TdWdnZXN0RW5hYmxlZCksXG5cdFx0XHRcdFx0XHRcdG5vbmNlOiB0aGlzLnNoZWxsSW50ZWdyYXRpb25Ob25jZVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHdpbmRvd3NVc2VDb25wdHlEbGw6IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLndpbmRvd3NVc2VDb25wdHlEbGwgPz8gZmFsc2UsXG5cdFx0XHRcdFx0XHRlbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnM6IHRoaXMuX2V4dEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uPy5jb2xsZWN0aW9ucyA/IHNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9ucyh0aGlzLl9leHRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbi5jb2xsZWN0aW9ucykgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHRoaXMuX2N3ZFdvcmtzcGFjZUZvbGRlcixcblx0XHRcdFx0XHRcdGlzU2NyZWVuUmVhZGVyT3B0aW1pemVkOiB0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0bmV3UHJvY2VzcyA9IGF3YWl0IGJhY2tlbmQuY3JlYXRlUHJvY2Vzcyhcblx0XHRcdFx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWcsXG5cdFx0XHRcdFx0XHRcdCcnLCAvLyBUT0RPOiBGaXggY3dkXG5cdFx0XHRcdFx0XHRcdGNvbHMsXG5cdFx0XHRcdFx0XHRcdHJvd3MsXG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnVuaWNvZGVWZXJzaW9uLFxuXHRcdFx0XHRcdFx0XHRlbnYsIC8vIFRPRE86XG5cdFx0XHRcdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHRcdFx0XHRcdHNob3VsZFBlcnNpc3Rcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0aWYgKGU/Lm1lc3NhZ2UgPT09ICdDb3VsZCBub3QgZmV0Y2ggcmVtb3RlIGVudmlyb25tZW50Jykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBDb3VsZCBub3QgZmV0Y2ggcmVtb3RlIGVudmlyb25tZW50LCBzaWxlbnRseSBmYWlsaW5nYCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9zZXR1cFB0eUhvc3RMaXN0ZW5lcnMoYmFja2VuZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChzaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcykge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzLmZpbmRSZXZpdmVkSWQgPyBhd2FpdCBiYWNrZW5kLmF0dGFjaFRvUmV2aXZlZFByb2Nlc3Moc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MuaWQpIDogYXdhaXQgYmFja2VuZC5hdHRhY2hUb1Byb2Nlc3Moc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MuaWQpO1xuXHRcdFx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHRcdG5ld1Byb2Nlc3MgPSByZXN1bHQ7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIFdhcm4gYW5kIGp1c3QgY3JlYXRlIGEgbmV3IHRlcm1pbmFsIGlmIGF0dGFjaCBmYWlsZWQgZm9yIHNvbWUgcmVhc29uXG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYEF0dGFjaCB0byBwcm9jZXNzIGZhaWxlZCBmb3IgdGVybWluYWxgLCBzaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcyk7XG5cdFx0XHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2VzcyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFuZXdQcm9jZXNzKSB7XG5cdFx0XHRcdFx0bmV3UHJvY2VzcyA9IGF3YWl0IHRoaXMuX2xhdW5jaExvY2FsUHJvY2VzcyhiYWNrZW5kLCBzaGVsbExhdW5jaENvbmZpZywgY29scywgcm93cywgdGhpcy51c2VySG9tZSwgdmFyaWFibGVSZXNvbHZlcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCF0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0dXBQdHlIb3N0TGlzdGVuZXJzKGJhY2tlbmQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIHByb2Nlc3Mgd2FzIGRpc3Bvc2VkIGR1cmluZyBpdHMgY3JlYXRpb24sIHNodXQgaXQgZG93biBhbmQgcmV0dXJuIGZhaWx1cmVcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0bmV3UHJvY2Vzcy5zaHV0ZG93bihmYWxzZSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Byb2Nlc3MgPSBuZXdQcm9jZXNzO1xuXHRcdHRoaXMuX3NldFByb2Nlc3NTdGF0ZShQcm9jZXNzU3RhdGUuTGF1bmNoaW5nKTtcblxuXHRcdC8vIEFkZCBhbnkgY2FwYWJpbGl0aWVzIGluaGVyZW50IHRvIHRoZSBiYWNrZW5kXG5cdFx0aWYgKHRoaXMub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eCB8fCB0aGlzLm9zID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKSB7XG5cdFx0XHR0aGlzLmNhcGFiaWxpdGllcy5hZGQoVGVybWluYWxDYXBhYmlsaXR5Lk5haXZlQ3dkRGV0ZWN0aW9uLCBuZXcgTmFpdmVDd2REZXRlY3Rpb25DYXBhYmlsaXR5KHRoaXMuX3Byb2Nlc3MpKTtcblx0XHR9XG5cblx0XHR0aGlzLl9kYXRhRmlsdGVyLm5ld1Byb2Nlc3ModGhpcy5fcHJvY2VzcywgcmVzZXQpO1xuXG5cdFx0aWYgKHRoaXMuX3Byb2Nlc3NMaXN0ZW5lcnMpIHtcblx0XHRcdGRpc3Bvc2UodGhpcy5fcHJvY2Vzc0xpc3RlbmVycyk7XG5cdFx0fVxuXHRcdHRoaXMuX3Byb2Nlc3NMaXN0ZW5lcnMgPSBbXG5cdFx0XHRuZXdQcm9jZXNzLm9uUHJvY2Vzc1JlYWR5KChlOiBJUHJvY2Vzc1JlYWR5RXZlbnQpID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1Zygnb25Qcm9jZXNzUmVhZHknLCBlKTtcblx0XHRcdFx0dGhpcy5fcHJvY2Vzc1RyYWl0cyA9IGU7XG5cdFx0XHRcdHRoaXMuc2hlbGxQcm9jZXNzSWQgPSBlLnBpZDtcblx0XHRcdFx0dGhpcy5faW5pdGlhbEN3ZCA9IGUuY3dkO1xuXHRcdFx0XHR0aGlzLnByb2Nlc3NSZWFkeVRpbWVzdGFtcCA9IERhdGUubm93KCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuSW5pdGlhbEN3ZCwgdmFsdWU6IHRoaXMuX2luaXRpYWxDd2QgfSk7XG5cdFx0XHRcdHRoaXMuX29uUHJvY2Vzc1JlYWR5LmZpcmUoZSk7XG5cblx0XHRcdFx0aWYgKHRoaXMuX3ByZUxhdW5jaElucHV0UXVldWUubGVuZ3RoID4gMCAmJiB0aGlzLl9wcm9jZXNzKSB7XG5cdFx0XHRcdFx0Ly8gU2VuZCBhbnkgcXVldWVkIGRhdGEgdGhhdCdzIHdhaXRpbmdcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdzZW5kaW5nIHByZWxhdW5jaCBpbnB1dCBxdWV1ZScsIHRoaXMuX3ByZUxhdW5jaElucHV0UXVldWUpO1xuXHRcdFx0XHRcdG5ld1Byb2Nlc3MuaW5wdXQodGhpcy5fcHJlTGF1bmNoSW5wdXRRdWV1ZS5qb2luKCcnKSk7XG5cdFx0XHRcdFx0dGhpcy5fcHJlTGF1bmNoSW5wdXRRdWV1ZS5sZW5ndGggPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRcdG5ld1Byb2Nlc3Mub25Qcm9jZXNzRXhpdChleGl0Q29kZSA9PiB0aGlzLl9vbkV4aXQoZXhpdENvZGUpKSxcblx0XHRcdG5ld1Byb2Nlc3Mub25EaWRDaGFuZ2VQcm9wZXJ0eSgoeyB0eXBlLCB2YWx1ZSB9KSA9PiB7XG5cdFx0XHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgUHJvY2Vzc1Byb3BlcnR5VHlwZS5IYXNDaGlsZFByb2Nlc3Nlczpcblx0XHRcdFx0XHRcdHRoaXMuX2hhc0NoaWxkUHJvY2Vzc2VzID0gdmFsdWUgYXMgSVByb2Nlc3NQcm9wZXJ0eU1hcFtQcm9jZXNzUHJvcGVydHlUeXBlLkhhc0NoaWxkUHJvY2Vzc2VzXTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgUHJvY2Vzc1Byb3BlcnR5VHlwZS5GYWlsZWRTaGVsbEludGVncmF0aW9uQWN0aXZhdGlvbjpcblx0XHRcdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2U/LnB1YmxpY0xvZzI8e30sIHsgb3duZXI6ICdtZWdhbnJvZ2dlJzsgY29tbWVudDogJ0luZGljYXRlcyBzaGVsbCBpbnRlZ3JhdGlvbiB3YXMgbm90IGFjdGl2YXRlZCBiZWNhdXNlIG9mIGN1c3RvbSBhcmdzJyB9PigndGVybWluYWwvc2hlbGxJbnRlZ3JhdGlvbkFjdGl2YXRpb25GYWlsdXJlQ3VzdG9tQXJncycpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZSwgdmFsdWUgfSk7XG5cdFx0XHR9KVxuXHRcdF07XG5cdFx0aWYgKG5ld1Byb2Nlc3Mub25Qcm9jZXNzUmVwbGF5Q29tcGxldGUpIHtcblx0XHRcdHRoaXMuX3Byb2Nlc3NMaXN0ZW5lcnMucHVzaChuZXdQcm9jZXNzLm9uUHJvY2Vzc1JlcGxheUNvbXBsZXRlKCgpID0+IHRoaXMuX29uUHJvY2Vzc1JlcGxheUNvbXBsZXRlLmZpcmUoKSkpO1xuXHRcdH1cblx0XHRpZiAobmV3UHJvY2Vzcy5vblJlc3RvcmVDb21tYW5kcykge1xuXHRcdFx0dGhpcy5fcHJvY2Vzc0xpc3RlbmVycy5wdXNoKG5ld1Byb2Nlc3Mub25SZXN0b3JlQ29tbWFuZHMoZSA9PiB0aGlzLl9vblJlc3RvcmVDb21tYW5kcy5maXJlKGUpKSk7XG5cdFx0fVxuXHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMucHJvY2Vzc1N0YXRlID09PSBQcm9jZXNzU3RhdGUuTGF1bmNoaW5nKSB7XG5cdFx0XHRcdHRoaXMuX3NldFByb2Nlc3NTdGF0ZShQcm9jZXNzU3RhdGUuUnVubmluZyk7XG5cdFx0XHR9XG5cdFx0fSwgUHJvY2Vzc0NvbnN0YW50cy5FcnJvckxhdW5jaFRocmVzaG9sZER1cmF0aW9uKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG5ld1Byb2Nlc3Muc3RhcnQoKTtcblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHQvLyBFcnJvclxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHQvLyBSZXBvcnQgdGhlIGxhdGVuY3kgdG8gdGhlIHB0eSBob3N0IHdoZW4gaWRsZVxuXHRcdHJ1bldoZW5XaW5kb3dJZGxlKGdldEFjdGl2ZVdpbmRvdygpLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmJhY2tlbmQ/LmdldExhdGVuY3koKS50aGVuKG1lYXN1cmVtZW50cyA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgTGF0ZW5jeSBtZWFzdXJlbWVudHMgZm9yICR7dGhpcy5yZW1vdGVBdXRob3JpdHkgPz8gJ2xvY2FsJ30gYmFja2VuZFxcbiR7bWVhc3VyZW1lbnRzLm1hcChlID0+IGAke2UubGFiZWx9OiAke2UubGF0ZW5jeS50b0ZpeGVkKDIpfW1zYCkuam9pbignXFxuJyl9YCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyByZWxhdW5jaChzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLCBjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlciwgcmVzZXQ6IGJvb2xlYW4pOiBQcm9taXNlPElUZXJtaW5hbExhdW5jaEVycm9yIHwgSVRlcm1pbmFsTGF1bmNoUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5wdHlQcm9jZXNzUmVhZHkgPSB0aGlzLl9jcmVhdGVQdHlQcm9jZXNzUmVhZHlQcm9taXNlKCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgUmVsYXVuY2hpbmcgdGVybWluYWwgaW5zdGFuY2UgJHt0aGlzLl9pbnN0YW5jZUlkfWApO1xuXG5cdFx0Ly8gRmlyZSByZWNvbm5lY3QgaWYgbmVlZGVkIHRvIGVuc3VyZSB0aGUgdGVybWluYWwgaXMgdXNhYmxlIGFnYWluXG5cdFx0aWYgKHRoaXMuX2lzRGlzY29ubmVjdGVkKSB7XG5cdFx0XHR0aGlzLl9pc0Rpc2Nvbm5lY3RlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fb25QdHlSZWNvbm5lY3QuZmlyZSgpO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIGRhdGEgd3JpdHRlbiBmbGFnIHRvIHJlLWVuYWJsZSBzZWFtbGVzcyByZWxhdW5jaCBpZiB0aGlzIHJlbGF1bmNoIHdhcyBtYW51YWxseVxuXHRcdC8vIHRyaWdnZXJlZFxuXHRcdHRoaXMuX2hhc1dyaXR0ZW5EYXRhID0gZmFsc2U7XG5cblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVQcm9jZXNzKHNoZWxsTGF1bmNoQ29uZmlnLCBjb2xzLCByb3dzLCByZXNldCk7XG5cdH1cblxuXHQvLyBGZXRjaCBhbnkgZXh0ZW5zaW9uIGVudmlyb25tZW50IGFkZGl0aW9ucyBhbmQgYXBwbHkgdGhlbVxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlRW52aXJvbm1lbnQoYmFja2VuZDogSVRlcm1pbmFsQmFja2VuZCwgdmFyaWFibGVSZXNvbHZlcjogdGVybWluYWxFbnZpcm9ubWVudC5WYXJpYWJsZVJlc29sdmVyIHwgdW5kZWZpbmVkLCBzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnKTogUHJvbWlzZTxJUHJvY2Vzc0Vudmlyb25tZW50PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGVybWluYWxFbnZpcm9ubWVudC5nZXRXb3Jrc3BhY2VGb3JUZXJtaW5hbChzaGVsbExhdW5jaENvbmZpZy5jd2QsIHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCB0aGlzLl9oaXN0b3J5U2VydmljZSk7XG5cdFx0Y29uc3QgcGxhdGZvcm1LZXkgPSBpc1dpbmRvd3MgPyAnd2luZG93cycgOiAoaXNNYWNpbnRvc2ggPyAnb3N4JyA6ICdsaW51eCcpO1xuXHRcdGNvbnN0IGVudkZyb21Db25maWdWYWx1ZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElUZXJtaW5hbEVudmlyb25tZW50IHwgdW5kZWZpbmVkPihgdGVybWluYWwuaW50ZWdyYXRlZC5lbnYuJHtwbGF0Zm9ybUtleX1gKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSZXNvbHZpbmcgZW52aXJvbm1lbnQgKHVzZVNoZWxsRW52aXJvbm1lbnQ9JHtzaGVsbExhdW5jaENvbmZpZy51c2VTaGVsbEVudmlyb25tZW50fSwgcGxhdGZvcm1LZXk9JHtwbGF0Zm9ybUtleX0sIGVudkZyb21Db25maWc9JHtlbnZGcm9tQ29uZmlnVmFsdWUgPyBPYmplY3Qua2V5cyhlbnZGcm9tQ29uZmlnVmFsdWUpLmpvaW4oJywnKSA6ICdub25lJ30pYCk7XG5cblx0XHRsZXQgYmFzZUVudjogSVByb2Nlc3NFbnZpcm9ubWVudDtcblx0XHRpZiAoc2hlbGxMYXVuY2hDb25maWcudXNlU2hlbGxFbnZpcm9ubWVudCkge1xuXHRcdFx0Y29uc3Qgc2hlbGxFbnYgPSBhd2FpdCBiYWNrZW5kLmdldFNoZWxsRW52aXJvbm1lbnQoKTtcblx0XHRcdGlmICghc2hlbGxFbnYpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignQ2Fubm90IGZldGNoIHNoZWxsIGVudmlyb25tZW50IHRvIHVzZScpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgU2hlbGwgZW52aXJvbm1lbnQgcmVzb2x2ZWQgd2l0aCAke09iamVjdC5rZXlzKHNoZWxsRW52KS5sZW5ndGh9IHZhcmlhYmxlczogJHtPYmplY3Qua2V5cyhzaGVsbEVudikuc29ydCgpLmpvaW4oJywgJyl9YCk7XG5cdFx0XHRiYXNlRW52ID0gc2hlbGxFbnY7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJhc2VFbnYgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UuZ2V0RW52aXJvbm1lbnQodGhpcy5yZW1vdGVBdXRob3JpdHkpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUHJvZmlsZSBlbnZpcm9ubWVudCByZXNvbHZlZCB3aXRoICR7T2JqZWN0LmtleXMoYmFzZUVudikubGVuZ3RofSB2YXJpYWJsZXNgKTtcblx0XHR9XG5cdFx0Y29uc3QgZW52ID0gYXdhaXQgdGVybWluYWxFbnZpcm9ubWVudC5jcmVhdGVUZXJtaW5hbEVudmlyb25tZW50KHNoZWxsTGF1bmNoQ29uZmlnLCBlbnZGcm9tQ29uZmlnVmFsdWUsIHZhcmlhYmxlUmVzb2x2ZXIsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmRldGVjdExvY2FsZSwgYmFzZUVudik7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgVGVybWluYWwgZW52aXJvbm1lbnQgY3JlYXRlZCB3aXRoICR7T2JqZWN0LmtleXMoZW52KS5sZW5ndGh9IHZhcmlhYmxlczogJHtPYmplY3Qua2V5cyhlbnYpLnNvcnQoKS5qb2luKCcsICcpfWApO1xuXHRcdHRoaXMuX2Vudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uTGlzdGVuZXIuY2xlYXIoKTtcblx0XHRpZiAoIXRoaXMuX2lzRGlzcG9zZWQgJiYgc2hvdWxkVXNlRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oc2hlbGxMYXVuY2hDb25maWcpKSB7XG5cdFx0XHR0aGlzLl9leHRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiA9IHRoaXMuX2Vudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlLm1lcmdlZENvbGxlY3Rpb247XG5cblx0XHRcdHRoaXMuX2Vudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uTGlzdGVuZXIudmFsdWUgPSB0aGlzLl9lbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZS5vbkRpZENoYW5nZUNvbGxlY3Rpb25zKG5ld0NvbGxlY3Rpb24gPT4gdGhpcy5fb25FbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbkNoYW5nZShuZXdDb2xsZWN0aW9uKSk7XG5cdFx0XHQvLyBGb3IgcmVtb3RlIHRlcm1pbmFscywgdGhpcyBpcyBhIGNvcHkgb2YgdGhlIG1lcmdlZEVudmlyb25tZW50Q29sbGVjdGlvbiBjcmVhdGVkIG9uXG5cdFx0XHQvLyB0aGUgcmVtb3RlIHNpZGUuIFNpbmNlIHRoZSBlbnZpcm9ubWVudCBjb2xsZWN0aW9uIGlzIHN5bmNlZCBiZXR3ZWVuIHRoZSByZW1vdGUgYW5kXG5cdFx0XHQvLyBsb2NhbCBzaWRlcyBpbW1lZGlhdGVseSB0aGlzIGlzIGEgZmFpcmx5IHNhZmUgd2F5IG9mIGVuYWJsaW5nIHRoZSBlbnYgdmFyIGRpZmZpbmcgYW5kXG5cdFx0XHQvLyBpbmZvIHdpZGdldC4gV2hpbGUgdGVjaG5pY2FsbHkgdGhlc2UgY291bGQgZGlmZmVyIGR1ZSB0byB0aGUgc2xpZ2h0IGNoYW5nZSBvZiBhIHJhY2Vcblx0XHRcdC8vIGNvbmRpdGlvbiwgdGhlIGNoYW5jZSBpcyBtaW5pbWFsIHBsdXMgdGhlIGltcGFjdCBvbiB0aGUgdXNlciBpcyBhbHNvIG5vdCB0aGF0IGdyZWF0XG5cdFx0XHQvLyBpZiBpdCBoYXBwZW5zIC0gaXQncyBub3Qgd29ydGggYWRkaW5nIHBsdW1iaW5nIHRvIHN5bmMgYmFjayB0aGUgcmVzb2x2ZWQgY29sbGVjdGlvbi5cblx0XHRcdGF3YWl0IHRoaXMuX2V4dEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uLmFwcGx5VG9Qcm9jZXNzRW52aXJvbm1lbnQoZW52LCB7IHdvcmtzcGFjZUZvbGRlciB9LCB2YXJpYWJsZVJlc29sdmVyKTtcblx0XHRcdGlmICh0aGlzLl9leHRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbi5nZXRWYXJpYWJsZU1hcCh7IHdvcmtzcGFjZUZvbGRlciB9KS5zaXplKSB7XG5cdFx0XHRcdHRoaXMuZW52aXJvbm1lbnRWYXJpYWJsZUluZm8gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbnZpcm9ubWVudFZhcmlhYmxlSW5mb0NoYW5nZXNBY3RpdmUsIHRoaXMuX2V4dEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKTtcblx0XHRcdFx0dGhpcy5fb25FbnZpcm9ubWVudFZhcmlhYmxlSW5mb0NoYW5nZS5maXJlKHRoaXMuZW52aXJvbm1lbnRWYXJpYWJsZUluZm8pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZW52O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbGF1bmNoTG9jYWxQcm9jZXNzKFxuXHRcdGJhY2tlbmQ6IElUZXJtaW5hbEJhY2tlbmQsXG5cdFx0c2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyxcblx0XHRjb2xzOiBudW1iZXIsXG5cdFx0cm93czogbnVtYmVyLFxuXHRcdHVzZXJIb21lOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0dmFyaWFibGVSZXNvbHZlcjogdGVybWluYWxFbnZpcm9ubWVudC5WYXJpYWJsZVJlc29sdmVyIHwgdW5kZWZpbmVkXG5cdCk6IFByb21pc2U8SVRlcm1pbmFsQ2hpbGRQcm9jZXNzPiB7XG5cdFx0YXdhaXQgdGhpcy5fdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVTaGVsbExhdW5jaENvbmZpZyhzaGVsbExhdW5jaENvbmZpZywge1xuXHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB1bmRlZmluZWQsXG5cdFx0XHRvczogT1Ncblx0XHR9KTtcblx0XHRjb25zdCBhY3RpdmVXb3Jrc3BhY2VSb290VXJpID0gdGhpcy5faGlzdG9yeVNlcnZpY2UuZ2V0TGFzdEFjdGl2ZVdvcmtzcGFjZVJvb3QoU2NoZW1hcy5maWxlKTtcblxuXHRcdGNvbnN0IGluaXRpYWxDd2QgPSBhd2FpdCB0ZXJtaW5hbEVudmlyb25tZW50LmdldEN3ZChcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLFxuXHRcdFx0dXNlckhvbWUsXG5cdFx0XHR2YXJpYWJsZVJlc29sdmVyLFxuXHRcdFx0YWN0aXZlV29ya3NwYWNlUm9vdFVyaSxcblx0XHRcdHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmN3ZCxcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Vcblx0XHQpO1xuXG5cdFx0Y29uc3QgZW52ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUVudmlyb25tZW50KGJhY2tlbmQsIHZhcmlhYmxlUmVzb2x2ZXIsIHNoZWxsTGF1bmNoQ29uZmlnKTtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IElUZXJtaW5hbFByb2Nlc3NPcHRpb25zID0ge1xuXHRcdFx0c2hlbGxJbnRlZ3JhdGlvbjoge1xuXHRcdFx0XHRlbmFibGVkOiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5TaGVsbEludGVncmF0aW9uRW5hYmxlZCksXG5cdFx0XHRcdHN1Z2dlc3RFbmFibGVkOiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbENvbnRyaWJTZXR0aW5nSWQuU3VnZ2VzdEVuYWJsZWQpLFxuXHRcdFx0XHRub25jZTogdGhpcy5zaGVsbEludGVncmF0aW9uTm9uY2Vcblx0XHRcdH0sXG5cdFx0XHR3aW5kb3dzVXNlQ29ucHR5RGxsOiB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy53aW5kb3dzVXNlQ29ucHR5RGxsID8/IGZhbHNlLFxuXHRcdFx0ZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zOiB0aGlzLl9leHRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiA/IHNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9ucyh0aGlzLl9leHRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbi5jb2xsZWN0aW9ucykgOiB1bmRlZmluZWQsXG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHRoaXMuX2N3ZFdvcmtzcGFjZUZvbGRlcixcblx0XHRcdGlzU2NyZWVuUmVhZGVyT3B0aW1pemVkOiB0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpXG5cdFx0fTtcblx0XHRjb25zdCBzaG91bGRQZXJzaXN0ID0gKCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUYXNrU2V0dGluZ0lkLlJlY29ubmVjdGlvbikgJiYgc2hlbGxMYXVuY2hDb25maWcucmVjb25uZWN0aW9uUHJvcGVydGllcykgfHwgIXNoZWxsTGF1bmNoQ29uZmlnLmlzRmVhdHVyZVRlcm1pbmFsKSAmJiB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5lbmFibGVQZXJzaXN0ZW50U2Vzc2lvbnMgJiYgIXNoZWxsTGF1bmNoQ29uZmlnLmlzVHJhbnNpZW50O1xuXHRcdHJldHVybiBhd2FpdCBiYWNrZW5kLmNyZWF0ZVByb2Nlc3Moc2hlbGxMYXVuY2hDb25maWcsIGluaXRpYWxDd2QsIGNvbHMsIHJvd3MsIHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnVuaWNvZGVWZXJzaW9uLCBlbnYsIG9wdGlvbnMsIHNob3VsZFBlcnNpc3QpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0dXBQdHlIb3N0TGlzdGVuZXJzKGJhY2tlbmQ6IElUZXJtaW5hbEJhY2tlbmQpIHtcblx0XHRpZiAodGhpcy5fcHR5TGlzdGVuZXJzQXR0YWNoZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcHR5TGlzdGVuZXJzQXR0YWNoZWQgPSB0cnVlO1xuXG5cdFx0Ly8gTWFyayB0aGUgcHJvY2VzcyBhcyBkaXNjb25uZWN0ZWQgaXMgdGhlIHB0eSBob3N0IGlzIHVucmVzcG9uc2l2ZSwgdGhlIHJlc3BvbnNpdmUgZXZlbnRcblx0XHQvLyB3aWxsIGZpcmUgb25seSB3aGVuIHRoZSBwdHkgaG9zdCB3YXMgYWxyZWFkeSB1bnJlc3BvbnNpdmVcblx0XHR0aGlzLl9yZWdpc3RlcihiYWNrZW5kLm9uUHR5SG9zdFVucmVzcG9uc2l2ZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9pc0Rpc2Nvbm5lY3RlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9vblB0eURpc2Nvbm5lY3QuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9wdHlSZXNwb25zaXZlTGlzdGVuZXIgPSBiYWNrZW5kLm9uUHR5SG9zdFJlc3BvbnNpdmUoKCkgPT4ge1xuXHRcdFx0dGhpcy5faXNEaXNjb25uZWN0ZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX29uUHR5UmVjb25uZWN0LmZpcmUoKTtcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fcHR5UmVzcG9uc2l2ZUxpc3RlbmVyPy5kaXNwb3NlKCkpKTtcblxuXHRcdC8vIFdoZW4gdGhlIHB0eSBob3N0IHJlc3RhcnRzLCByZWNvbm5lY3QgaXMgbm8gbG9uZ2VyIHBvc3NpYmxlIHNvIGRpc3Bvc2UgdGhlIHJlc3BvbnNpdmVcblx0XHQvLyBsaXN0ZW5lclxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJhY2tlbmQub25QdHlIb3N0UmVzdGFydChhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBXaGVuIHRoZSBwdHkgaG9zdCByZXN0YXJ0cywgcmVjb25uZWN0IGlzIG5vIGxvbmdlciBwb3NzaWJsZVxuXHRcdFx0aWYgKCF0aGlzLl9pc0Rpc2Nvbm5lY3RlZCkge1xuXHRcdFx0XHR0aGlzLl9pc0Rpc2Nvbm5lY3RlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX29uUHR5RGlzY29ubmVjdC5maXJlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wdHlSZXNwb25zaXZlTGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3B0eVJlc3BvbnNpdmVMaXN0ZW5lciA9IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0aGlzLl9zaGVsbExhdW5jaENvbmZpZykge1xuXHRcdFx0XHRpZiAodGhpcy5fc2hlbGxMYXVuY2hDb25maWcuaXNGZWF0dXJlVGVybWluYWwgJiYgIXRoaXMucmVjb25uZWN0aW9uUHJvcGVydGllcykge1xuXHRcdFx0XHRcdC8vIEluZGljYXRlIHRoZSBwcm9jZXNzIGlzIGV4aXRlZCAoYW5kIGdvbmUgZm9yZXZlcikgb25seSBmb3IgZmVhdHVyZSB0ZXJtaW5hbHNcblx0XHRcdFx0XHQvLyBzbyB0aGV5IGNhbiByZWFjdCB0byB0aGUgZXhpdCwgdGhpcyBpcyBwYXJ0aWN1bGFybHkgaW1wb3J0YW50IGZvciB0YXNrcyBzb1xuXHRcdFx0XHRcdC8vIHRoYXQgaXQga25vd3MgdGhhdCB0aGUgcHJvY2VzcyBpcyBub3Qgc3RpbGwgYWN0aXZlLiBOb3RlIHRoYXQgdGhpcyBpcyBub3Rcblx0XHRcdFx0XHQvLyBkb25lIGZvciByZWd1bGFyIHRlcm1pbmFscyBiZWNhdXNlIG90aGVyd2lzZSB0aGUgdGVybWluYWwgaW5zdGFuY2Ugd291bGQgYmVcblx0XHRcdFx0XHQvLyBkaXNwb3NlZC5cblx0XHRcdFx0XHR0aGlzLl9vbkV4aXQoLTEpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEZvciBub3JtYWwgdGVybWluYWxzIHdyaXRlIGEgbWVzc2FnZSBpbmRpY2F0aW5nIHdoYXQgaGFwcGVuZWQgYW5kIHJlbGF1bmNoXG5cdFx0XHRcdFx0Ly8gdXNpbmcgdGhlIHByZXZpb3VzIHNoZWxsTGF1bmNoQ29uZmlnXG5cdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKCdwdHlIb3N0UmVsYXVuY2gnLCBcIlJlc3RhcnRpbmcgdGhlIHRlcm1pbmFsIGJlY2F1c2UgdGhlIGNvbm5lY3Rpb24gdG8gdGhlIHNoZWxsIHByb2Nlc3Mgd2FzIGxvc3QuLi5cIik7XG5cdFx0XHRcdFx0Ly8gQWxpZ24gd2l0aCB0aGUgcHR5IHNlcnZpY2UncyByZXZpdmUgbG9naWMgKF9yZXZpdmVUZXJtaW5hbFByb2Nlc3MgaW4gc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvcHR5U2VydmljZS50cylcblx0XHRcdFx0XHQvLyB0byBoZWRnZSBhZ2FpbnN0IFBTUmVhZExpbmUgYEdldENvbnNvbGVDdXJzb3JJbmZvYCBhbmQgY3Vyc29yIGhhbmRsaW5nIGZyb20gY29ucHR5LlxuXHRcdFx0XHRcdGxldCBwb3N0UmVzdGFydE1lc3NhZ2UgPSAnJztcblx0XHRcdFx0XHRpZiAodGhpcy5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgJiYgdGhpcy5fZGltZW5zaW9ucy5yb3dzID4gMCkge1xuXHRcdFx0XHRcdFx0cG9zdFJlc3RhcnRNZXNzYWdlID0gJ1xcclxcbicucmVwZWF0KHRoaXMuX2RpbWVuc2lvbnMucm93cyAtIDEpICsgYFxceDFiW0hgO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9vblByb2Nlc3NEYXRhLmZpcmUoeyBkYXRhOiBmb3JtYXRNZXNzYWdlRm9yVGVybWluYWwobWVzc2FnZSwgeyBsb3VkRm9ybWF0dGluZzogdHJ1ZSB9KSArIHBvc3RSZXN0YXJ0TWVzc2FnZSwgdHJhY2tDb21taXQ6IGZhbHNlIH0pO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucmVsYXVuY2godGhpcy5fc2hlbGxMYXVuY2hDb25maWcsIHRoaXMuX2RpbWVuc2lvbnMuY29scywgdGhpcy5fZGltZW5zaW9ucy5yb3dzLCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMucHR5UHJvY2Vzc1JlYWR5ID0gdW5kZWZpbmVkITtcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBnZXRCYWNrZW5kT1MoKTogUHJvbWlzZTxPcGVyYXRpbmdTeXN0ZW0+IHtcblx0XHRsZXQgb3MgPSBPUztcblx0XHRpZiAoISF0aGlzLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0Y29uc3QgcmVtb3RlRW52ID0gYXdhaXQgdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCk7XG5cdFx0XHRpZiAoIXJlbW90ZUVudikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBnZXQgcmVtb3RlIGVudmlyb25tZW50IGZvciByZW1vdGUgYXV0aG9yaXR5IFwiJHt0aGlzLnJlbW90ZUF1dGhvcml0eX1cImApO1xuXHRcdFx0fVxuXHRcdFx0b3MgPSByZW1vdGVFbnYub3M7XG5cdFx0fVxuXHRcdHJldHVybiBvcztcblx0fVxuXG5cdHNldERpbWVuc2lvbnMoY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIsIHN5bmM/OiB1bmRlZmluZWQsIHBpeGVsV2lkdGg/OiBudW1iZXIsIHBpeGVsSGVpZ2h0PzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPjtcblx0c2V0RGltZW5zaW9ucyhjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlciwgc3luYzogZmFsc2UsIHBpeGVsV2lkdGg/OiBudW1iZXIsIHBpeGVsSGVpZ2h0PzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPjtcblx0c2V0RGltZW5zaW9ucyhjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlciwgc3luYzogdHJ1ZSwgcGl4ZWxXaWR0aD86IG51bWJlciwgcGl4ZWxIZWlnaHQ/OiBudW1iZXIpOiB2b2lkO1xuXHRzZXREaW1lbnNpb25zKGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyLCBzeW5jPzogYm9vbGVhbiwgcGl4ZWxXaWR0aD86IG51bWJlciwgcGl4ZWxIZWlnaHQ/OiBudW1iZXIpOiBNYXliZVByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChzeW5jKSB7XG5cdFx0XHR0aGlzLl9yZXNpemUoY29scywgcm93cywgcGl4ZWxXaWR0aCwgcGl4ZWxIZWlnaHQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlc2l6aW5nIGEgZGlzcG9zZWQgcHR5IGlzIGEgY29udHJhY3R1YWwgbm8tb3Agc28gcmUtZW50cmFudCByZXNpemVzXG5cdFx0Ly8gZHVyaW5nIHRoZSBzeW5jaHJvbm91cyB0ZWFyZG93biBzdGFjayAoIzMxNTI4MikgYXJlIHNpbGVudGx5IGRyb3BwZWQuXG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnB0eVByb2Nlc3NSZWFkeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyLnNldERpbWVuc2lvbnMgY2FsbGVkIGJlZm9yZSBpbml0aWFsaXphdGlvbicpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5wdHlQcm9jZXNzUmVhZHkudGhlbigoKSA9PiB0aGlzLl9yZXNpemUoY29scywgcm93cywgcGl4ZWxXaWR0aCwgcGl4ZWxIZWlnaHQpKTtcblx0fVxuXG5cdGFzeW5jIHNldFVuaWNvZGVWZXJzaW9uKHZlcnNpb246ICc2JyB8ICcxMScpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvY2Vzcz8uc2V0VW5pY29kZVZlcnNpb24odmVyc2lvbik7XG5cdH1cblxuXHRhc3luYyBzZXROZXh0Q29tbWFuZElkKGNvbW1hbmRMaW5lOiBzdHJpbmcsIGNvbW1hbmRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5wdHlQcm9jZXNzUmVhZHk7XG5cdFx0Y29uc3QgcHJvY2VzcyA9IHRoaXMuX3Byb2Nlc3M7XG5cdFx0aWYgKCFwcm9jZXNzPy5pZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0TmV4dENvbW1hbmRJZChwcm9jZXNzLmlkLCBjb21tYW5kTGluZSwgY29tbWFuZElkKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc2l6ZShjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlciwgcGl4ZWxXaWR0aD86IG51bWJlciwgcGl4ZWxIZWlnaHQ/OiBudW1iZXIpIHtcblx0XHRpZiAoIXRoaXMuX3Byb2Nlc3MpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVGhlIGNoaWxkIHByb2Nlc3MgY291bGQgYWxyZWFkeSBiZSB0ZXJtaW5hdGVkXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX3Byb2Nlc3MucmVzaXplKGNvbHMsIHJvd3MsIHBpeGVsV2lkdGgsIHBpeGVsSGVpZ2h0KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gV2UgdHJpZWQgdG8gd3JpdGUgdG8gYSBjbG9zZWQgcGlwZSAvIGNoYW5uZWwuXG5cdFx0XHRpZiAoZXJyb3IuY29kZSAhPT0gJ0VQSVBFJyAmJiBlcnJvci5jb2RlICE9PSAnRVJSX0lQQ19DSEFOTkVMX0NMT1NFRCcpIHtcblx0XHRcdFx0dGhyb3cgKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fZGltZW5zaW9ucy5jb2xzID0gY29scztcblx0XHR0aGlzLl9kaW1lbnNpb25zLnJvd3MgPSByb3dzO1xuXHR9XG5cblx0YXN5bmMgd3JpdGUoZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5wdHlQcm9jZXNzUmVhZHk7XG5cdFx0dGhpcy5fZGF0YUZpbHRlci5kaXNhYmxlU2VhbWxlc3NSZWxhdW5jaCgpO1xuXHRcdHRoaXMuX2hhc1dyaXR0ZW5EYXRhID0gdHJ1ZTtcblx0XHRpZiAodGhpcy5zaGVsbFByb2Nlc3NJZCB8fCB0aGlzLl9wcm9jZXNzVHlwZSA9PT0gUHJvY2Vzc1R5cGUuUHN1ZWRvVGVybWluYWwpIHtcblx0XHRcdGlmICh0aGlzLl9wcm9jZXNzKSB7XG5cdFx0XHRcdC8vIFNlbmQgZGF0YSBpZiB0aGUgcHR5IGlzIHJlYWR5XG5cdFx0XHRcdHRoaXMuX3Byb2Nlc3MuaW5wdXQoZGF0YSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIElmIHRoZSBwdHkgaXMgbm90IHJlYWR5LCBxdWV1ZSB0aGUgZGF0YSByZWNlaXZlZCB0byBzZW5kIGxhdGVyXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdxdWV1ZWluZyBkYXRhIGluIHByZWxhdW5jaCBpbnB1dCBxdWV1ZScsIGRhdGEpO1xuXHRcdFx0dGhpcy5fcHJlTGF1bmNoSW5wdXRRdWV1ZS5wdXNoKGRhdGEpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNlbmRTaWduYWwoc2lnbmFsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnB0eVByb2Nlc3NSZWFkeTtcblx0XHRpZiAodGhpcy5fcHJvY2Vzcykge1xuXHRcdFx0dGhpcy5fcHJvY2Vzcy5zZW5kU2lnbmFsKHNpZ25hbCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcHJvY2Vzc0JpbmFyeShkYXRhOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnB0eVByb2Nlc3NSZWFkeTtcblx0XHR0aGlzLl9kYXRhRmlsdGVyLmRpc2FibGVTZWFtbGVzc1JlbGF1bmNoKCk7XG5cdFx0dGhpcy5faGFzV3JpdHRlbkRhdGEgPSB0cnVlO1xuXHRcdHRoaXMuX3Byb2Nlc3M/LnByb2Nlc3NCaW5hcnkoZGF0YSk7XG5cdH1cblxuXHRnZXQgaW5pdGlhbEN3ZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9pbml0aWFsQ3dkID8/ICcnO1xuXHR9XG5cblx0YXN5bmMgcmVmcmVzaFByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPih0eXBlOiBUKTogUHJvbWlzZTxJUHJvY2Vzc1Byb3BlcnR5TWFwW1RdPiB7XG5cdFx0aWYgKCF0aGlzLl9wcm9jZXNzKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCByZWZyZXNoIHByb3BlcnR5IHdoZW4gcHJvY2VzcyBpcyBub3Qgc2V0Jyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm9jZXNzLnJlZnJlc2hQcm9wZXJ0eSh0eXBlKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPih0eXBlOiBULCB2YWx1ZTogSVByb2Nlc3NQcm9wZXJ0eU1hcFtUXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm9jZXNzPy51cGRhdGVQcm9wZXJ0eSh0eXBlLCB2YWx1ZSk7XG5cdH1cblxuXHRhY2tub3dsZWRnZURhdGFFdmVudChjaGFyQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2Fja0RhdGFCdWZmZXJlci5hY2soY2hhckNvdW50KTtcblx0fVxuXG5cdHByaXZhdGUgX29uRXhpdChleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJvY2VzcyA9IG51bGw7XG5cdFx0Ly8gSWYgdGhlIHByb2Nlc3MgaXMgbWFya2VkIGFzIGxhdW5jaGluZyB0aGVuIG1hcmsgdGhlIHByb2Nlc3MgYXMga2lsbGVkXG5cdFx0Ly8gZHVyaW5nIGxhdW5jaC4gVGhpcyB0eXBpY2FsbHkgbWVhbnMgdGhhdCB0aGVyZSBpcyBhIHByb2JsZW0gd2l0aCB0aGVcblx0XHQvLyBzaGVsbCBhbmQgYXJncy5cblx0XHRpZiAodGhpcy5wcm9jZXNzU3RhdGUgPT09IFByb2Nlc3NTdGF0ZS5MYXVuY2hpbmcpIHtcblx0XHRcdHRoaXMuX3NldFByb2Nlc3NTdGF0ZShQcm9jZXNzU3RhdGUuS2lsbGVkRHVyaW5nTGF1bmNoKTtcblx0XHR9XG5cblx0XHQvLyBJZiBUZXJtaW5hbEluc3RhbmNlIGRpZCBub3Qga25vdyBhYm91dCB0aGUgcHJvY2VzcyBleGl0IHRoZW4gaXQgd2FzXG5cdFx0Ly8gdHJpZ2dlcmVkIGJ5IHRoZSBwcm9jZXNzLCBub3Qgb24gVlMgQ29kZSdzIHNpZGUuXG5cdFx0aWYgKHRoaXMucHJvY2Vzc1N0YXRlID09PSBQcm9jZXNzU3RhdGUuUnVubmluZykge1xuXHRcdFx0dGhpcy5fc2V0UHJvY2Vzc1N0YXRlKFByb2Nlc3NTdGF0ZS5LaWxsZWRCeVByb2Nlc3MpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uUHJvY2Vzc0V4aXQuZmlyZShleGl0Q29kZSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRQcm9jZXNzU3RhdGUoc3RhdGU6IFByb2Nlc3NTdGF0ZSkge1xuXHRcdHRoaXMucHJvY2Vzc1N0YXRlID0gc3RhdGU7XG5cdFx0dGhpcy5fb25Qcm9jZXNzU3RhdGVDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25FbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbkNoYW5nZShuZXdDb2xsZWN0aW9uOiBJTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBkaWZmID0gdGhpcy5fZXh0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24hLmRpZmYobmV3Q29sbGVjdGlvbiwgeyB3b3Jrc3BhY2VGb2xkZXI6IHRoaXMuX2N3ZFdvcmtzcGFjZUZvbGRlciB9KTtcblx0XHRpZiAoZGlmZiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBJZiB0aGVyZSBhcmUgbm8gbG9uZ2VyIGRpZmZlcmVuY2VzLCByZW1vdmUgdGhlIHN0YWxlIGluZm8gaW5kaWNhdG9yXG5cdFx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFZhcmlhYmxlSW5mbyBpbnN0YW5jZW9mIEVudmlyb25tZW50VmFyaWFibGVJbmZvU3RhbGUpIHtcblx0XHRcdFx0dGhpcy5lbnZpcm9ubWVudFZhcmlhYmxlSW5mbyA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVudmlyb25tZW50VmFyaWFibGVJbmZvQ2hhbmdlc0FjdGl2ZSwgdGhpcy5fZXh0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24hKTtcblx0XHRcdFx0dGhpcy5fb25FbnZpcm9ubWVudFZhcmlhYmxlSW5mb0NoYW5nZS5maXJlKHRoaXMuZW52aXJvbm1lbnRWYXJpYWJsZUluZm8pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmVudmlyb25tZW50VmFyaWFibGVJbmZvID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW52aXJvbm1lbnRWYXJpYWJsZUluZm9TdGFsZSwgZGlmZiwgdGhpcy5faW5zdGFuY2VJZCwgbmV3Q29sbGVjdGlvbik7XG5cdFx0dGhpcy5fb25FbnZpcm9ubWVudFZhcmlhYmxlSW5mb0NoYW5nZS5maXJlKHRoaXMuZW52aXJvbm1lbnRWYXJpYWJsZUluZm8pO1xuXHR9XG5cblx0YXN5bmMgY2xlYXJCdWZmZXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcHJvY2Vzcz8uY2xlYXJCdWZmZXI/LigpO1xuXHR9XG59XG5cbmNsYXNzIEFja0RhdGFCdWZmZXJlciB7XG5cdHByaXZhdGUgX3Vuc2VudENoYXJDb3VudDogbnVtYmVyID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jYWxsYmFjazogKGNoYXJDb3VudDogbnVtYmVyKSA9PiB2b2lkXG5cdCkge1xuXHR9XG5cblx0YWNrKGNoYXJDb3VudDogbnVtYmVyKSB7XG5cdFx0dGhpcy5fdW5zZW50Q2hhckNvdW50ICs9IGNoYXJDb3VudDtcblx0XHR3aGlsZSAodGhpcy5fdW5zZW50Q2hhckNvdW50ID4gRmxvd0NvbnRyb2xDb25zdGFudHMuQ2hhckNvdW50QWNrU2l6ZSkge1xuXHRcdFx0dGhpcy5fdW5zZW50Q2hhckNvdW50IC09IEZsb3dDb250cm9sQ29uc3RhbnRzLkNoYXJDb3VudEFja1NpemU7XG5cdFx0XHR0aGlzLl9jYWxsYmFjayhGbG93Q29udHJvbENvbnN0YW50cy5DaGFyQ291bnRBY2tTaXplKTtcblx0XHR9XG5cdH1cbn1cblxuY29uc3QgZW51bSBTZWFtbGVzc1JlbGF1bmNoQ29uc3RhbnRzIHtcblx0LyoqXG5cdCAqIEhvdyBsb25nIHRvIHJlY29yZCBkYXRhIGV2ZW50cyBmb3IgbmV3IHRlcm1pbmFscy5cblx0ICovXG5cdFJlY29yZFRlcm1pbmFsRHVyYXRpb24gPSAxMDAwMCxcblx0LyoqXG5cdCAqIFRoZSBtYXhpbXVtIGR1cmF0aW9uIGFmdGVyIGEgcmVsYXVuY2ggb2NjdXJzIHRvIHRyaWdnZXIgYSBzd2FwLlxuXHQgKi9cblx0U3dhcFdhaXRNYXhpbXVtRHVyYXRpb24gPSAzMDAwXG59XG5cbi8qKlxuICogRmlsdGVycyBkYXRhIGV2ZW50cyBmcm9tIHRoZSBwcm9jZXNzIGFuZCBzdXBwb3J0cyBzZWFtbGVzc2x5IHJlc3RhcnRpbmcgc3dhcHBpbmcgb3V0IHRoZSBwcm9jZXNzXG4gKiB3aXRoIGFub3RoZXIsIGRlbGF5aW5nIHRoZSBzd2FwIGluIG91dHB1dCBpbiBvcmRlciB0byBtaW5pbWl6ZSBmbGlja2VyaW5nL2NsZWFyaW5nIG9mIHRoZVxuICogdGVybWluYWwuXG4gKi9cbmNsYXNzIFNlYW1sZXNzUmVsYXVuY2hEYXRhRmlsdGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX2ZpcnN0UmVjb3JkZXI/OiBUZXJtaW5hbFJlY29yZGVyO1xuXHRwcml2YXRlIF9zZWNvbmRSZWNvcmRlcj86IFRlcm1pbmFsUmVjb3JkZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpcnN0RGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vjb25kRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGF0YUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9hY3RpdmVQcm9jZXNzPzogSVRlcm1pbmFsQ2hpbGRQcm9jZXNzO1xuXHRwcml2YXRlIF9kaXNhYmxlU2VhbWxlc3NSZWxhdW5jaDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX3N3YXBUaW1lb3V0PzogbnVtYmVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc0RhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmcgfCBJUHJvY2Vzc0RhdGFFdmVudD4oKSk7XG5cdGdldCBvblByb2Nlc3NEYXRhKCk6IEV2ZW50PHN0cmluZyB8IElQcm9jZXNzRGF0YUV2ZW50PiB7IHJldHVybiB0aGlzLl9vblByb2Nlc3NEYXRhLmV2ZW50OyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXJtaW5hbExvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSVRlcm1pbmFsTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0bmV3UHJvY2Vzcyhwcm9jZXNzOiBJVGVybWluYWxDaGlsZFByb2Nlc3MsIHJlc2V0OiBib29sZWFuKSB7XG5cdFx0Ly8gU3RvcCBsaXN0ZW5pbmcgdG8gdGhlIG9sZCBwcm9jZXNzIGFuZCB0cmlnZ2VyIGRlbGF5ZWQgc2h1dGRvd24gKGZvciBoYW5nIGlzc3VlICM3MTk2Nilcblx0XHR0aGlzLl9kYXRhTGlzdGVuZXIuY2xlYXIoKTtcblx0XHR0aGlzLl9hY3RpdmVQcm9jZXNzPy5zaHV0ZG93bihmYWxzZSk7XG5cblx0XHR0aGlzLl9hY3RpdmVQcm9jZXNzID0gcHJvY2VzcztcblxuXHRcdC8vIFN0YXJ0IGZpcmluZyBldmVudHMgaW1tZWRpYXRlbHkgaWY6XG5cdFx0Ly8gLSB0aGVyZSdzIG5vIHJlY29yZGVyLCB3aGljaCBtZWFucyBpdCdzIGEgbmV3IHRlcm1pbmFsXG5cdFx0Ly8gLSB0aGlzIGlzIG5vdCBhIHJlc2V0LCBzbyBzZWFtbGVzcyByZWxhdW5jaCBpc24ndCBuZWNlc3Nhcnlcblx0XHQvLyAtIHNlYW1sZXNzIHJlbGF1bmNoIGlzIGRpc2FibGVkIGJlY2F1c2UgdGhlIHRlcm1pbmFsIGhhcyBhY2NlcHRlZCBpbnB1dFxuXHRcdGlmICghdGhpcy5fZmlyc3RSZWNvcmRlciB8fCAhcmVzZXQgfHwgdGhpcy5fZGlzYWJsZVNlYW1sZXNzUmVsYXVuY2gpIHtcblx0XHRcdFt0aGlzLl9maXJzdFJlY29yZGVyLCB0aGlzLl9maXJzdERpc3Bvc2FibGUudmFsdWVdID0gdGhpcy5fY3JlYXRlUmVjb3JkZXIocHJvY2Vzcyk7XG5cdFx0XHRpZiAodGhpcy5fZGlzYWJsZVNlYW1sZXNzUmVsYXVuY2ggJiYgcmVzZXQpIHtcblx0XHRcdFx0dGhpcy5fb25Qcm9jZXNzRGF0YS5maXJlKCdcXHgxYmMnKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2RhdGFMaXN0ZW5lci52YWx1ZSA9IHByb2Nlc3Mub25Qcm9jZXNzRGF0YShlID0+IHRoaXMuX29uUHJvY2Vzc0RhdGEuZmlyZShlKSk7XG5cdFx0XHR0aGlzLl9kaXNhYmxlU2VhbWxlc3NSZWxhdW5jaCA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRyaWdnZXIgYSBzd2FwIGlmIHRoZXJlIHdhcyBhIHJlY2VudCByZWxhdW5jaFxuXHRcdGlmICh0aGlzLl9zZWNvbmRSZWNvcmRlcikge1xuXHRcdFx0dGhpcy50cmlnZ2VyU3dhcCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N3YXBUaW1lb3V0ID0gbWFpbldpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHRoaXMudHJpZ2dlclN3YXAoKSwgU2VhbWxlc3NSZWxhdW5jaENvbnN0YW50cy5Td2FwV2FpdE1heGltdW1EdXJhdGlvbik7XG5cblx0XHQvLyBQYXVzZSBhbGwgb3V0Z29pbmcgZGF0YSBldmVudHNcblx0XHR0aGlzLl9kYXRhTGlzdGVuZXIuY2xlYXIoKTtcblxuXHRcdHRoaXMuX2ZpcnN0RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdGNvbnN0IHJlY29yZGVyID0gdGhpcy5fY3JlYXRlUmVjb3JkZXIocHJvY2Vzcyk7XG5cdFx0W3RoaXMuX3NlY29uZFJlY29yZGVyLCB0aGlzLl9zZWNvbmREaXNwb3NhYmxlLnZhbHVlXSA9IHJlY29yZGVyO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc2FibGVzIHNlYW1sZXNzIHJlbGF1bmNoIGZvciB0aGUgYWN0aXZlIHByb2Nlc3Ncblx0ICovXG5cdGRpc2FibGVTZWFtbGVzc1JlbGF1bmNoKCkge1xuXHRcdHRoaXMuX2Rpc2FibGVTZWFtbGVzc1JlbGF1bmNoID0gdHJ1ZTtcblx0XHR0aGlzLl9zdG9wUmVjb3JkaW5nKCk7XG5cdFx0dGhpcy50cmlnZ2VyU3dhcCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRyaWdnZXIgdGhlIHN3YXAgb2YgdGhlIHByb2Nlc3NlcyBpZiBuZWVkZWQgKGVnLiB0aW1lb3V0LCBpbnB1dClcblx0ICovXG5cdHRyaWdnZXJTd2FwKCkge1xuXHRcdC8vIENsZWFyIHRoZSBzd2FwIHRpbWVvdXQgaWYgaXQgZXhpc3RzXG5cdFx0aWYgKHRoaXMuX3N3YXBUaW1lb3V0KSB7XG5cdFx0XHRtYWluV2luZG93LmNsZWFyVGltZW91dCh0aGlzLl9zd2FwVGltZW91dCk7XG5cdFx0XHR0aGlzLl9zd2FwVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBEbyBub3RoaW5nIGlmIHRoZXJlJ3Mgbm90aGluZyBiZWluZyByZWNvcmRlclxuXHRcdGlmICghdGhpcy5fZmlyc3RSZWNvcmRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBDbGVhciB0aGUgZmlyc3QgcmVjb3JkZXIgaWYgbm8gc2Vjb25kIHByb2Nlc3Mgd2FzIGF0dGFjaGVkIGJlZm9yZSB0aGUgc3dhcCB0cmlnZ2VyXG5cdFx0aWYgKCF0aGlzLl9zZWNvbmRSZWNvcmRlcikge1xuXHRcdFx0dGhpcy5fZmlyc3RSZWNvcmRlciA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2ZpcnN0RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIGRhdGEgZm9yIGVhY2ggcmVjb3JkZXJcblx0XHRjb25zdCBmaXJzdERhdGEgPSB0aGlzLl9nZXREYXRhRnJvbVJlY29yZGVyKHRoaXMuX2ZpcnN0UmVjb3JkZXIpO1xuXHRcdGNvbnN0IHNlY29uZERhdGEgPSB0aGlzLl9nZXREYXRhRnJvbVJlY29yZGVyKHRoaXMuX3NlY29uZFJlY29yZGVyKTtcblxuXHRcdC8vIFJlLXdyaXRlIHRoZSB0ZXJtaW5hbCBpZiB0aGUgZGF0YSBkaWZmZXJzXG5cdFx0aWYgKGZpcnN0RGF0YSA9PT0gc2Vjb25kRGF0YSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgU2VhbWxlc3MgdGVybWluYWwgcmVsYXVuY2ggLSBpZGVudGljYWwgY29udGVudGApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBTZWFtbGVzcyB0ZXJtaW5hbCByZWxhdW5jaCAtIHJlc2V0dGluZyBjb250ZW50YCk7XG5cdFx0XHQvLyBGaXJlIGZ1bGwgcmVzZXQgKFJJUykgZm9sbG93ZWQgYnkgdGhlIG5ldyBkYXRhIHNvIHRoZSB1cGRhdGUgaGFwcGVucyBpbiB0aGUgc2FtZSBmcmFtZVxuXHRcdFx0dGhpcy5fb25Qcm9jZXNzRGF0YS5maXJlKHsgZGF0YTogYFxceDFiYyR7c2Vjb25kRGF0YX1gLCB0cmFja0NvbW1pdDogZmFsc2UgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IHVwIHRoZSBuZXcgZGF0YSBsaXN0ZW5lclxuXHRcdHRoaXMuX2RhdGFMaXN0ZW5lci52YWx1ZSA9IHRoaXMuX2FjdGl2ZVByb2Nlc3MhLm9uUHJvY2Vzc0RhdGEoZSA9PiB0aGlzLl9vblByb2Nlc3NEYXRhLmZpcmUoZSkpO1xuXG5cdFx0Ly8gUmVwbGFjZSBmaXJzdCByZWNvcmRlciB3aXRoIHNlY29uZFxuXHRcdHRoaXMuX2ZpcnN0UmVjb3JkZXIgPSB0aGlzLl9zZWNvbmRSZWNvcmRlcjtcblx0XHR0aGlzLl9maXJzdERpc3Bvc2FibGUudmFsdWUgPSB0aGlzLl9zZWNvbmREaXNwb3NhYmxlLnZhbHVlO1xuXHRcdHRoaXMuX3NlY29uZFJlY29yZGVyID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcFJlY29yZGluZygpIHtcblx0XHQvLyBDb250aW51ZSByZWNvcmRpbmcgaWYgYSBzd2FwIGlzIGNvbWluZ1xuXHRcdGlmICh0aGlzLl9zd2FwVGltZW91dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBTdG9wIHJlY29yZGluZ1xuXHRcdHRoaXMuX2ZpcnN0UmVjb3JkZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZmlyc3REaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0dGhpcy5fc2Vjb25kUmVjb3JkZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2Vjb25kRGlzcG9zYWJsZS5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUmVjb3JkZXIocHJvY2VzczogSVRlcm1pbmFsQ2hpbGRQcm9jZXNzKTogW1Rlcm1pbmFsUmVjb3JkZXIsIElEaXNwb3NhYmxlXSB7XG5cdFx0Y29uc3QgcmVjb3JkZXIgPSBuZXcgVGVybWluYWxSZWNvcmRlcigwLCAwKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gcHJvY2Vzcy5vblByb2Nlc3NEYXRhKGUgPT4gcmVjb3JkZXIuaGFuZGxlRGF0YShpc1N0cmluZyhlKSA/IGUgOiBlLmRhdGEpKTtcblx0XHRyZXR1cm4gW3JlY29yZGVyLCBkaXNwb3NhYmxlXTtcblx0fVxuXG5cdHByaXZhdGUgX2dldERhdGFGcm9tUmVjb3JkZXIocmVjb3JkZXI6IFRlcm1pbmFsUmVjb3JkZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiByZWNvcmRlci5nZW5lcmF0ZVJlcGxheUV2ZW50U3luYygpLmV2ZW50cy5maWx0ZXIoZSA9PiAhIWUuZGF0YSkubWFwKGUgPT4gZS5kYXRhKS5qb2luKCcnKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksU0FBc0IsbUJBQW1CLG9CQUFvQjtBQUNsRixTQUFTLGVBQWU7QUFDeEIsU0FBOEIsYUFBYSxXQUFXLGlCQUFpQixVQUFVO0FBRWpGLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQWdELDBCQUEwQjtBQUMxRSxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHNCQUFrUixxQkFBOEMscUJBQXFCLHlCQUF5QjtBQUN2WCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdDQUFrRDtBQUMzRCxTQUFTLHNDQUFzQyxvQ0FBb0M7QUFDbkYsU0FBUywrQkFBK0IsMEJBQTBCLHdCQUF3QjtBQUMxRixTQUFtQyxtQ0FBbUM7QUFDdEUsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUywrQ0FBK0M7QUFDeEQsU0FBMkQsaUNBQWlDLG9CQUFvQjtBQUNoSCxZQUFZLHlCQUF5QjtBQUNyQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLG9DQUFvQztBQUM3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YyxZQUFZO0FBQzdCLFdBQUssWUFBWSxNQUFNLGdEQUFnRDtBQUFBLElBQ3hFLE9BQU87QUFDTixXQUFLLFlBQVksTUFBTSxnREFBZ0Q7QUFFdkUsV0FBSyxlQUFlLEtBQUssRUFBRSxNQUFNLFFBQVEsVUFBVSxJQUFJLGFBQWEsTUFBTSxDQUFDO0FBQUEsSUFDNUU7QUFHQSxTQUFLLGNBQWMsUUFBUSxLQUFLLGVBQWdCLGNBQWMsT0FBSyxLQUFLLGVBQWUsS0FBSyxDQUFDLENBQUM7QUFHOUYsU0FBSyxpQkFBaUIsS0FBSztBQUMzQixTQUFLLGlCQUFpQixRQUFRLEtBQUssa0JBQWtCO0FBQ3JELFNBQUssa0JBQWtCO0FBQUEsRUFDeEI7QUFBQSxFQUVRLGlCQUFpQjtBQUV4QixRQUFJLEtBQUssY0FBYztBQUN0QjtBQUFBLElBQ0Q7QUFFQSxTQUFLLGlCQUFpQjtBQUN0QixTQUFLLGlCQUFpQixNQUFNO0FBQzVCLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssa0JBQWtCLE1BQU07QUFBQSxFQUM5QjtBQUFBLEVBRVEsZ0JBQWdCLFNBQWlFO0FBQ3hGLFVBQU0sV0FBVyxJQUFJLGlCQUFpQixHQUFHLENBQUM7QUFDMUMsVUFBTSxhQUFhLFFBQVEsY0FBYyxPQUFLLFNBQVMsV0FBVyxTQUFTLENBQUMsSUFBSSxJQUFJLEVBQUUsSUFBSSxDQUFDO0FBQzNGLFdBQU8sQ0FBQyxVQUFVLFVBQVU7QUFBQSxFQUM3QjtBQUFBLEVBRVEscUJBQXFCLFVBQW9DO0FBQ2hFLFdBQU8sU0FBUyx3QkFBd0IsRUFBRSxPQUFPLE9BQU8sT0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxPQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRTtBQUFBLEVBQ2hHO0FBQ0Q7QUFqSU0sNkJBQU47QUFBQSxFQWVHO0FBQUEsR0FmRzsiLAogICJuYW1lcyI6IFsiUHJvY2Vzc0NvbnN0YW50cyIsICJQcm9jZXNzVHlwZSIsICJyZXN1bHQiLCAiU2VhbWxlc3NSZWxhdW5jaENvbnN0YW50cyJdCn0K
