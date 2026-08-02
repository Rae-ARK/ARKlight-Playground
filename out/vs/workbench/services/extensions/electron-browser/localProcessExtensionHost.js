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
import { timeout } from "../../../../base/common/async.js";
import { encodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import * as objects from "../../../../base/common/objects.js";
import * as platform from "../../../../base/common/platform.js";
import { removeDangerousEnvVariables } from "../../../../base/common/processes.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { BufferedEmitter } from "../../../../base/parts/ipc/common/ipc.net.js";
import { acquirePort } from "../../../../base/parts/ipc/electron-browser/ipc.mp.js";
import * as nls from "../../../../nls.js";
import { IExtensionHostDebugService } from "../../../../platform/debug/common/extensionHostDebug.js";
import { extensionHostGraceTimeMs, IExtensionHostStarter } from "../../../../platform/extensions/common/extensionHostStarter.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService, ILoggerService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IWorkbenchAssignmentService } from "../../assignment/common/assignmentService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isLoggingOnly } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService, WorkbenchState, isUntitledWorkspace } from "../../../../platform/workspace/common/workspace.js";
import { INativeWorkbenchEnvironmentService } from "../../environment/electron-browser/environmentService.js";
import { IShellEnvironmentService } from "../../environment/electron-browser/shellEnvironmentService.js";
import { MessagePortExtHostConnection, writeExtHostConnection } from "../common/extensionHostEnv.js";
import { createMessageOfType, MessageType, NativeLogMarkers, UIKind, isMessageOfType } from "../common/extensionHostProtocol.js";
import { ExtensionHostStartup, resolveEnabledApiProposalsFallbackExperiment } from "../common/extensions.js";
import { IHostService } from "../../host/browser/host.js";
import { ILifecycleService } from "../../lifecycle/common/lifecycle.js";
import { parseExtensionDevOptions } from "../common/extensionDevOptions.js";
import { IDefaultLogLevelsService } from "../../log/common/defaultLogLevels.js";
class ExtensionHostProcess {
  constructor(id, _extensionHostStarter) {
    this._extensionHostStarter = _extensionHostStarter;
    this._id = id;
  }
  get onStdout() {
    return this._extensionHostStarter.onDynamicStdout(this._id);
  }
  get onStderr() {
    return this._extensionHostStarter.onDynamicStderr(this._id);
  }
  get onMessage() {
    return this._extensionHostStarter.onDynamicMessage(this._id);
  }
  get onExit() {
    return this._extensionHostStarter.onDynamicExit(this._id);
  }
  start(opts) {
    return this._extensionHostStarter.start(this._id, opts);
  }
  enableInspectPort() {
    return this._extensionHostStarter.enableInspectPort(this._id);
  }
  waitForExit(maxWaitTimeMs) {
    return this._extensionHostStarter.waitForExit(this._id, maxWaitTimeMs);
  }
  kill() {
    return this._extensionHostStarter.kill(this._id);
  }
}
let NativeLocalProcessExtensionHost = class extends Disposable {
  constructor(runningLocation, startup, _initDataProvider, _contextService, _notificationService, _nativeHostService, _lifecycleService, _environmentService, _userDataProfilesService, _telemetryService, _logService, _loggerService, _labelService, _extensionHostDebugService, _hostService, _productService, _shellEnvironmentService, _extensionHostStarter, _defaultLogLevelsService, _workbenchAssignmentService) {
    super();
    this.runningLocation = runningLocation;
    this.startup = startup;
    this._initDataProvider = _initDataProvider;
    this._contextService = _contextService;
    this._notificationService = _notificationService;
    this._nativeHostService = _nativeHostService;
    this._lifecycleService = _lifecycleService;
    this._environmentService = _environmentService;
    this._userDataProfilesService = _userDataProfilesService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this._loggerService = _loggerService;
    this._labelService = _labelService;
    this._extensionHostDebugService = _extensionHostDebugService;
    this._hostService = _hostService;
    this._productService = _productService;
    this._shellEnvironmentService = _shellEnvironmentService;
    this._extensionHostStarter = _extensionHostStarter;
    this._defaultLogLevelsService = _defaultLogLevelsService;
    this._workbenchAssignmentService = _workbenchAssignmentService;
    this.pid = null;
    this.remoteAuthority = null;
    this.extensions = null;
    this._onExit = this._register(new Emitter());
    this.onExit = this._onExit.event;
    this._onDidSetInspectPort = this._register(new Emitter());
    const devOpts = parseExtensionDevOptions(this._environmentService);
    this._isExtensionDevHost = devOpts.isExtensionDevHost;
    this._isExtensionDevDebug = devOpts.isExtensionDevDebug;
    this._isExtensionDevDebugBrk = devOpts.isExtensionDevDebugBrk;
    this._isExtensionDevTestFromCli = devOpts.isExtensionDevTestFromCli;
    this._terminating = false;
    this._mainProcessHandlesExtHostShutdown = false;
    this._inspectListener = null;
    this._extensionHostProcess = null;
    this._messageProtocol = null;
    this._register(this._lifecycleService.onWillShutdown((e) => this._onWillShutdown(e)));
    this._register(this._extensionHostDebugService.onClose((event) => {
      if (this._isExtensionDevHost && this._environmentService.debugExtensionHost.debugId === event.sessionId) {
        this._nativeHostService.closeWindow();
      }
    }));
    this._register(this._extensionHostDebugService.onReload((event) => {
      if (this._isExtensionDevHost && this._environmentService.debugExtensionHost.debugId === event.sessionId) {
        this._hostService.reload();
      }
    }));
  }
  dispose() {
    if (!this._terminating) {
      this._terminating = true;
    }
    super.dispose();
    this._messageProtocol = null;
  }
  async disconnect() {
    this._terminating = true;
    if (this._messageProtocol) {
      try {
        const protocol = await Promise.race([
          this._messageProtocol.then((protocol2) => protocol2, () => void 0),
          timeout(1e3).then(() => void 0)
        ]);
        protocol?.send(createMessageOfType(MessageType.Terminate));
      } catch {
      }
    }
    if (this._extensionHostProcess && !this._mainProcessHandlesExtHostShutdown) {
      this._extensionHostProcess.waitForExit(extensionHostGraceTimeMs).catch(() => {
      });
    }
    this._messageProtocol = null;
  }
  start() {
    if (this._terminating) {
      throw new CancellationError();
    }
    if (!this._messageProtocol) {
      this._messageProtocol = this._start();
    }
    return this._messageProtocol;
  }
  async _start() {
    const [extensionHostCreationResult, portNumber, processEnv] = await Promise.all([
      this._extensionHostStarter.createExtensionHost(),
      this._tryFindDebugPort(),
      this._shellEnvironmentService.getShellEnv()
    ]);
    this._extensionHostProcess = new ExtensionHostProcess(extensionHostCreationResult.id, this._extensionHostStarter);
    const env = objects.mixin(processEnv, {
      VSCODE_ESM_ENTRYPOINT: "vs/workbench/api/node/extensionHostProcess",
      VSCODE_HANDLES_UNCAUGHT_ERRORS: true
    });
    if (this._environmentService.debugExtensionHost.env) {
      objects.mixin(env, this._environmentService.debugExtensionHost.env);
    }
    removeDangerousEnvVariables(env);
    if (this._isExtensionDevHost) {
      delete env["VSCODE_CODE_CACHE_PATH"];
    }
    const opts = {
      responseWindowId: this._nativeHostService.windowId,
      responseChannel: "vscode:startExtensionHostMessagePortResult",
      responseNonce: generateUuid(),
      env,
      // We only detach the extension host on windows. Linux and Mac orphan by default
      // and detach under Linux and Mac create another process group.
      // We detach because we have noticed that when the renderer exits, its child processes
      // (i.e. extension host) are taken down in a brutal fashion by the OS
      detached: !!platform.isWindows,
      execArgv: void 0,
      silent: true
    };
    const inspectHost = "127.0.0.1";
    if (portNumber !== 0) {
      opts.execArgv = [
        "--nolazy",
        (this._isExtensionDevDebugBrk ? "--inspect-brk=" : "--inspect=") + `${inspectHost}:${portNumber}`
      ];
    } else {
      opts.execArgv = ["--inspect-port=0"];
    }
    if (this._environmentService.extensionTestsLocationURI) {
      opts.execArgv.unshift("--expose-gc");
    }
    if (this._environmentService.args["prof-v8-extensions"]) {
      opts.execArgv.unshift("--prof");
    }
    opts.execArgv.unshift("--dns-result-order=ipv4first", "--experimental-network-inspection");
    const onStdout = this._register(this._handleProcessOutputStream(this._extensionHostProcess.onStdout));
    const onStderr = this._register(this._handleProcessOutputStream(this._extensionHostProcess.onStderr));
    const onOutput = Event.any(
      Event.map(onStdout.event, (o) => ({ data: `%c${o}`, format: [""] })),
      Event.map(onStderr.event, (o) => ({ data: `%c${o}`, format: ["color: red"] }))
    );
    if (this._environmentService.args["enable-smoke-test-driver"]) {
      this._register(onStdout.event((line) => this._logService.info(`[Extension Host (stdout)] ${line.replace(/\r?\n$/, "")}`)));
      this._register(onStderr.event((line) => this._logService.error(`[Extension Host (stderr)] ${line.replace(/\r?\n$/, "")}`)));
    }
    const onDebouncedOutput = Event.debounce(onOutput, (r, o) => {
      return r ? { data: r.data + o.data, format: [...r.format, ...o.format] } : { data: o.data, format: o.format };
    }, 100);
    this._register(onDebouncedOutput((output) => {
      const inspectorUrlMatch = output.data && output.data.match(/ws:\/\/([^\s]+):(\d+)\/([^\s]+)/);
      if (inspectorUrlMatch) {
        const [, host, port, auth] = inspectorUrlMatch;
        const devtoolsUrl = `devtools://devtools/bundled/js_app.html?v8only=true&ws=${host}:${port}/${auth}`;
        if (!this._environmentService.isBuilt && !this._isExtensionDevTestFromCli) {
          console.debug(`%c[Extension Host] %cdebugger inspector at ${devtoolsUrl}`, "color: blue", "color:");
        }
        if (!this._inspectListener || !this._inspectListener.devtoolsUrl) {
          this._inspectListener = { host, port: Number(port), devtoolsUrl };
          this._onDidSetInspectPort.fire();
        }
      } else {
        if (!this._isExtensionDevTestFromCli) {
          console.group("Extension Host");
          console.log(output.data, ...output.format);
          console.groupEnd();
        }
      }
    }));
    this._register(this._extensionHostProcess.onExit(({ code, signal }) => this._onExtHostProcessExit(code, signal)));
    if (portNumber) {
      if (this._isExtensionDevHost && this._isExtensionDevDebug && this._environmentService.debugExtensionHost.debugId) {
        this._extensionHostDebugService.attachSession(this._environmentService.debugExtensionHost.debugId, portNumber);
      }
      this._inspectListener = { port: portNumber, host: inspectHost };
      this._onDidSetInspectPort.fire();
    }
    let startupTimeoutHandle;
    if (!this._environmentService.isBuilt && !this._environmentService.remoteAuthority || this._isExtensionDevHost) {
      startupTimeoutHandle = setTimeout(() => {
        this._logService.error(`[LocalProcessExtensionHost]: Extension host did not start in 10 seconds (debugBrk: ${this._isExtensionDevDebugBrk})`);
        const msg = this._isExtensionDevDebugBrk ? nls.localize("extensionHost.startupFailDebug", "Extension host did not start in 10 seconds, it might be stopped on the first line and needs a debugger to continue.") : nls.localize("extensionHost.startupFail", "Extension host did not start in 10 seconds, that might be a problem.");
        this._notificationService.prompt(
          Severity.Warning,
          msg,
          [{
            label: nls.localize("reloadWindow", "Reload Window"),
            run: () => this._hostService.reload()
          }],
          {
            sticky: true,
            priority: NotificationPriority.URGENT
          }
        );
      }, 1e4);
    }
    const protocol = await this._establishProtocol(this._extensionHostProcess, opts);
    await this._performHandshake(protocol);
    clearTimeout(startupTimeoutHandle);
    return protocol;
  }
  /**
   * Find a free port if extension host debugging is enabled.
   */
  async _tryFindDebugPort() {
    if (typeof this._environmentService.debugExtensionHost.port !== "number") {
      return 0;
    }
    const expected = this._environmentService.debugExtensionHost.port;
    const port = await this._nativeHostService.findFreePort(
      expected,
      10,
      5e3,
      2048
      /* skip 2048 ports between attempts */
    );
    if (!this._isExtensionDevTestFromCli) {
      if (!port) {
        console.warn("%c[Extension Host] %cCould not find a free port for debugging", "color: blue", "color:");
      } else {
        if (port !== expected) {
          console.warn(`%c[Extension Host] %cProvided debugging port ${expected} is not free, using ${port} instead.`, "color: blue", "color:");
        }
        if (this._isExtensionDevDebugBrk) {
          console.warn(`%c[Extension Host] %cSTOPPED on first line for debugging on port ${port}`, "color: blue", "color:");
        } else {
          console.debug(`%c[Extension Host] %cdebugger listening on port ${port}`, "color: blue", "color:");
        }
      }
    }
    return port || 0;
  }
  _establishProtocol(extensionHostProcess, opts) {
    writeExtHostConnection(new MessagePortExtHostConnection(), opts.env);
    const portPromise = acquirePort(void 0, opts.responseChannel, opts.responseNonce);
    return new Promise((resolve, reject) => {
      const handle = setTimeout(() => {
        reject("The local extension host took longer than 60s to connect.");
      }, 60 * 1e3);
      portPromise.then((port) => {
        this._register(toDisposable(() => {
          port.close();
          port.onmessage = null;
        }));
        clearTimeout(handle);
        const onMessage = new BufferedEmitter();
        port.onmessage = ((e) => {
          if (e.data) {
            onMessage.fire(VSBuffer.wrap(e.data));
          }
        });
        port.start();
        resolve({
          onMessage: onMessage.event,
          send: (message) => port.postMessage(message.buffer)
        });
      });
      const sw = StopWatch.create(false);
      extensionHostProcess.start(opts).then(({ pid }) => {
        if (pid) {
          this.pid = pid;
        }
        this._logService.info(`Started local extension host with pid ${pid}.`);
        const duration = sw.elapsed();
        if (platform.isCI) {
          this._logService.info(`IExtensionHostStarter.start() took ${duration} ms.`);
        }
      }, (err) => {
        reject(err);
      });
    });
  }
  _performHandshake(protocol) {
    return new Promise((resolve, reject) => {
      let timeoutHandle;
      const installTimeoutCheck = () => {
        timeoutHandle = setTimeout(() => {
          reject("The local extension host took longer than 60s to send its ready message.");
        }, 60 * 1e3);
      };
      const uninstallTimeoutCheck = () => {
        clearTimeout(timeoutHandle);
      };
      installTimeoutCheck();
      const disposable = protocol.onMessage((msg) => {
        if (isMessageOfType(msg, MessageType.Ready)) {
          uninstallTimeoutCheck();
          this._createExtHostInitData().then((data) => {
            installTimeoutCheck();
            protocol.send(VSBuffer.fromString(JSON.stringify(data)));
          });
          return;
        }
        if (isMessageOfType(msg, MessageType.Initialized)) {
          uninstallTimeoutCheck();
          disposable.dispose();
          resolve();
          return;
        }
        console.error(`received unexpected message during handshake phase from the extension host: `, msg);
      });
    });
  }
  async _createExtHostInitData() {
    const initData = await this._initDataProvider.getInitData();
    this.extensions = initData.extensions;
    const workspace = this._contextService.getWorkspace();
    const enabledApiProposalsFallback = await resolveEnabledApiProposalsFallbackExperiment(this._workbenchAssignmentService, this._productService.quality);
    return {
      commit: this._productService.commit,
      version: this._productService.version,
      quality: this._productService.quality,
      date: this._productService.date,
      parentPid: 0,
      enabledApiProposalsFallback,
      environment: {
        isExtensionDevelopmentDebug: this._isExtensionDevDebug,
        appRoot: this._environmentService.appRoot ? URI.file(this._environmentService.appRoot) : void 0,
        appName: this._productService.nameLong,
        appHost: (this._environmentService.isSessionsWindow ? this._productService.agentsTelemetryAppName : void 0) || this._productService.embedderIdentifier || "desktop",
        appUriScheme: this._productService.urlProtocol,
        isExtensionTelemetryLoggingOnly: isLoggingOnly(this._productService, this._environmentService),
        isPortable: this._environmentService.isPortable,
        appLanguage: platform.language,
        extensionDevelopmentLocationURI: this._environmentService.extensionDevelopmentLocationURI,
        extensionTestsLocationURI: this._environmentService.extensionTestsLocationURI,
        globalStorageHome: this._userDataProfilesService.defaultProfile.globalStorageHome,
        workspaceStorageHome: this._environmentService.workspaceStorageHome,
        extensionLogLevel: this._defaultLogLevelsService.defaultLogLevels.extensions,
        isSessionsWindow: this._environmentService.isSessionsWindow
      },
      workspace: this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? void 0 : {
        configuration: workspace.configuration ?? void 0,
        id: workspace.id,
        name: this._labelService.getWorkspaceLabel(workspace),
        isUntitled: workspace.configuration ? isUntitledWorkspace(workspace.configuration, this._environmentService) : false,
        transient: workspace.transient
      },
      remote: {
        authority: this._environmentService.remoteAuthority,
        connectionData: null,
        isRemote: false
      },
      consoleForward: {
        includeStack: !this._isExtensionDevTestFromCli && (this._isExtensionDevHost || !this._environmentService.isBuilt || this._productService.quality !== "stable" || this._environmentService.verbose),
        logNative: !this._isExtensionDevTestFromCli && this._isExtensionDevHost
      },
      extensions: this.extensions.toSnapshot(),
      telemetryInfo: {
        sessionId: this._telemetryService.sessionId,
        machineId: this._telemetryService.machineId,
        sqmId: this._telemetryService.sqmId,
        devDeviceId: this._telemetryService.devDeviceId ?? this._telemetryService.machineId,
        firstSessionDate: this._telemetryService.firstSessionDate,
        msftInternal: this._telemetryService.msftInternal
      },
      remoteExtensionTips: this._productService.remoteExtensionTips,
      virtualWorkspaceExtensionTips: this._productService.virtualWorkspaceExtensionTips,
      logLevel: this._logService.getLevel(),
      loggers: [...this._loggerService.getRegisteredLoggers()],
      logsLocation: this._environmentService.extHostLogsPath,
      autoStart: this.startup === ExtensionHostStartup.EagerAutoStart,
      uiKind: UIKind.Desktop,
      handle: this._environmentService.window.handle ? encodeBase64(this._environmentService.window.handle) : void 0
    };
  }
  _onExtHostProcessExit(code, signal) {
    if (this._terminating) {
      return;
    }
    this._onExit.fire([code, signal]);
  }
  _handleProcessOutputStream(stream) {
    let last = "";
    let isOmitting = false;
    const event = new Emitter();
    stream((chunk) => {
      last += chunk;
      const lines = last.split(/\r?\n/g);
      last = lines.pop();
      if (last.length > 1e4) {
        lines.push(last);
        last = "";
      }
      for (const line of lines) {
        if (isOmitting) {
          if (line === NativeLogMarkers.End) {
            isOmitting = false;
          }
        } else if (line === NativeLogMarkers.Start) {
          isOmitting = true;
        } else if (line.length) {
          event.fire(line + "\n");
        }
      }
    }, void 0, this._store);
    return event;
  }
  async enableInspectPort() {
    if (!!this._inspectListener) {
      return true;
    }
    if (!this._extensionHostProcess) {
      return false;
    }
    const result = await this._extensionHostProcess.enableInspectPort();
    if (!result) {
      return false;
    }
    await Promise.race([Event.toPromise(this._onDidSetInspectPort.event), timeout(1e3)]);
    return !!this._inspectListener;
  }
  getInspectPort() {
    return this._inspectListener ?? void 0;
  }
  _onWillShutdown(event) {
    this._mainProcessHandlesExtHostShutdown = true;
    if (this._isExtensionDevHost && !this._isExtensionDevTestFromCli && !this._isExtensionDevDebug && this._environmentService.debugExtensionHost.debugId) {
      this._extensionHostDebugService.terminateSession(this._environmentService.debugExtensionHost.debugId);
      event.join(timeout(
        100
        /* wait a bit for IPC to get delivered */
      ), { id: "join.extensionDevelopment", label: nls.localize("join.extensionDevelopment", "Terminating extension debug session") });
    }
  }
};
NativeLocalProcessExtensionHost = __decorateClass([
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, INativeHostService),
  __decorateParam(6, ILifecycleService),
  __decorateParam(7, INativeWorkbenchEnvironmentService),
  __decorateParam(8, IUserDataProfilesService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, ILogService),
  __decorateParam(11, ILoggerService),
  __decorateParam(12, ILabelService),
  __decorateParam(13, IExtensionHostDebugService),
  __decorateParam(14, IHostService),
  __decorateParam(15, IProductService),
  __decorateParam(16, IShellEnvironmentService),
  __decorateParam(17, IExtensionHostStarter),
  __decorateParam(18, IDefaultLogLevelsService),
  __decorateParam(19, IWorkbenchAssignmentService)
], NativeLocalProcessExtensionHost);
export {
  ExtensionHostProcess,
  NativeLocalProcessExtensionHost
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2VsZWN0cm9uLWJyb3dzZXIvbG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBlbmNvZGVCYXNlNjQsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIG9iamVjdHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyByZW1vdmVEYW5nZXJvdXNFbnZWYXJpYWJsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9jZXNzZXMuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBCdWZmZXJlZEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLm5ldC5qcyc7XG5pbXBvcnQgeyBhY3F1aXJlUG9ydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2VsZWN0cm9uLWJyb3dzZXIvaXBjLm1wLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkhvc3REZWJ1Z1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWJ1Zy9jb21tb24vZXh0ZW5zaW9uSG9zdERlYnVnLmpzJztcbmltcG9ydCB7IGV4dGVuc2lvbkhvc3RHcmFjZVRpbWVNcywgSUV4dGVuc2lvbkhvc3RQcm9jZXNzT3B0aW9ucywgSUV4dGVuc2lvbkhvc3RTdGFydGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uSG9zdFN0YXJ0ZXIuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgSUxvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgTm90aWZpY2F0aW9uUHJpb3JpdHksIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBpc0xvZ2dpbmdPbmx5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFdvcmtiZW5jaFN0YXRlLCBpc1VudGl0bGVkV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2VsZWN0cm9uLWJyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTaGVsbEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2VsZWN0cm9uLWJyb3dzZXIvc2hlbGxFbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWVzc2FnZVBvcnRFeHRIb3N0Q29ubmVjdGlvbiwgd3JpdGVFeHRIb3N0Q29ubmVjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25Ib3N0RW52LmpzJztcbmltcG9ydCB7IGNyZWF0ZU1lc3NhZ2VPZlR5cGUsIElFeHRlbnNpb25Ib3N0SW5pdERhdGEsIE1lc3NhZ2VUeXBlLCBOYXRpdmVMb2dNYXJrZXJzLCBVSUtpbmQsIGlzTWVzc2FnZU9mVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25Ib3N0UHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgTG9jYWxQcm9jZXNzUnVubmluZ0xvY2F0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25Ib3N0RXh0ZW5zaW9ucywgRXh0ZW5zaW9uSG9zdFN0YXJ0dXAsIElFeHRlbnNpb25Ib3N0LCBJRXh0ZW5zaW9uSW5zcGVjdEluZm8sIHJlc29sdmVFbmFibGVkQXBpUHJvcG9zYWxzRmFsbGJhY2tFeHBlcmltZW50IH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIFdpbGxTaHV0ZG93bkV2ZW50IH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcGFyc2VFeHRlbnNpb25EZXZPcHRpb25zIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbkRldk9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRMb2dMZXZlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9kZWZhdWx0TG9nTGV2ZWxzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdEluaXREYXRhIHtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uczogRXh0ZW5zaW9uSG9zdEV4dGVuc2lvbnM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIge1xuXHRnZXRJbml0RGF0YSgpOiBQcm9taXNlPElMb2NhbFByb2Nlc3NFeHRlbnNpb25Ib3N0SW5pdERhdGE+O1xufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uSG9zdFByb2Nlc3Mge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lkOiBzdHJpbmc7XG5cblx0cHVibGljIGdldCBvblN0ZG91dCgpOiBFdmVudDxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdFN0YXJ0ZXIub25EeW5hbWljU3Rkb3V0KHRoaXMuX2lkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25TdGRlcnIoKTogRXZlbnQ8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4dGVuc2lvbkhvc3RTdGFydGVyLm9uRHluYW1pY1N0ZGVycih0aGlzLl9pZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uTWVzc2FnZSgpOiBFdmVudDx1bmtub3duPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4dGVuc2lvbkhvc3RTdGFydGVyLm9uRHluYW1pY01lc3NhZ2UodGhpcy5faWQpO1xuXHR9XG5cblx0cHVibGljIGdldCBvbkV4aXQoKTogRXZlbnQ8eyBjb2RlOiBudW1iZXI7IHNpZ25hbDogc3RyaW5nIH0+IHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdFN0YXJ0ZXIub25EeW5hbWljRXhpdCh0aGlzLl9pZCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbkhvc3RTdGFydGVyOiBJRXh0ZW5zaW9uSG9zdFN0YXJ0ZXIsXG5cdCkge1xuXHRcdHRoaXMuX2lkID0gaWQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhcnQob3B0czogSUV4dGVuc2lvbkhvc3RQcm9jZXNzT3B0aW9ucyk6IFByb21pc2U8eyBwaWQ6IG51bWJlciB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4dGVuc2lvbkhvc3RTdGFydGVyLnN0YXJ0KHRoaXMuX2lkLCBvcHRzKTtcblx0fVxuXG5cdHB1YmxpYyBlbmFibGVJbnNwZWN0UG9ydCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdFN0YXJ0ZXIuZW5hYmxlSW5zcGVjdFBvcnQodGhpcy5faWQpO1xuXHR9XG5cblx0cHVibGljIHdhaXRGb3JFeGl0KG1heFdhaXRUaW1lTXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0U3RhcnRlci53YWl0Rm9yRXhpdCh0aGlzLl9pZCwgbWF4V2FpdFRpbWVNcyk7XG5cdH1cblxuXHRwdWJsaWMga2lsbCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdFN0YXJ0ZXIua2lsbCh0aGlzLl9pZCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5hdGl2ZUxvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3QgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkhvc3Qge1xuXG5cdHB1YmxpYyBwaWQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXHRwdWJsaWMgcmVhZG9ubHkgcmVtb3RlQXV0aG9yaXR5ID0gbnVsbDtcblx0cHVibGljIGV4dGVuc2lvbnM6IEV4dGVuc2lvbkhvc3RFeHRlbnNpb25zIHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25FeGl0OiBFbWl0dGVyPFtudW1iZXIsIHN0cmluZ10+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8W251bWJlciwgc3RyaW5nXT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkV4aXQ6IEV2ZW50PFtudW1iZXIsIHN0cmluZ10+ID0gdGhpcy5fb25FeGl0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2V0SW5zcGVjdFBvcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzRXh0ZW5zaW9uRGV2SG9zdDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNFeHRlbnNpb25EZXZEZWJ1ZzogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNFeHRlbnNpb25EZXZEZWJ1Z0JyazogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNFeHRlbnNpb25EZXZUZXN0RnJvbUNsaTogYm9vbGVhbjtcblxuXHQvLyBTdGF0ZVxuXHRwcml2YXRlIF90ZXJtaW5hdGluZzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfbWFpblByb2Nlc3NIYW5kbGVzRXh0SG9zdFNodXRkb3duOiBib29sZWFuO1xuXG5cdC8vIFJlc291cmNlcywgaW4gb3JkZXIgdGhleSBnZXQgYWNxdWlyZWQvY3JlYXRlZCB3aGVuIC5zdGFydCgpIGlzIGNhbGxlZDpcblx0cHJpdmF0ZSBfaW5zcGVjdExpc3RlbmVyOiBJRXh0ZW5zaW9uSW5zcGVjdEluZm8gfCBudWxsO1xuXHRwcml2YXRlIF9leHRlbnNpb25Ib3N0UHJvY2VzczogRXh0ZW5zaW9uSG9zdFByb2Nlc3MgfCBudWxsO1xuXHRwcml2YXRlIF9tZXNzYWdlUHJvdG9jb2w6IFByb21pc2U8SU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2w+IHwgbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcnVubmluZ0xvY2F0aW9uOiBMb2NhbFByb2Nlc3NSdW5uaW5nTG9jYXRpb24sXG5cdFx0cHVibGljIHJlYWRvbmx5IHN0YXJ0dXA6IEV4dGVuc2lvbkhvc3RTdGFydHVwLkVhZ2VyQXV0b1N0YXJ0IHwgRXh0ZW5zaW9uSG9zdFN0YXJ0dXAuRWFnZXJNYW51YWxTdGFydCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pbml0RGF0YVByb3ZpZGVyOiBJTG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlcixcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTG9nZ2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbkhvc3REZWJ1Z1NlcnZpY2U6IElFeHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElTaGVsbEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zaGVsbEVudmlyb25tZW50U2VydmljZTogSVNoZWxsRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uSG9zdFN0YXJ0ZXIgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uSG9zdFN0YXJ0ZXI6IElFeHRlbnNpb25Ib3N0U3RhcnRlcixcblx0XHRASURlZmF1bHRMb2dMZXZlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRMb2dMZXZlbHNTZXJ2aWNlOiBJRGVmYXVsdExvZ0xldmVsc1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3JrYmVuY2hBc3NpZ25tZW50U2VydmljZTogSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IGRldk9wdHMgPSBwYXJzZUV4dGVuc2lvbkRldk9wdGlvbnModGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHR0aGlzLl9pc0V4dGVuc2lvbkRldkhvc3QgPSBkZXZPcHRzLmlzRXh0ZW5zaW9uRGV2SG9zdDtcblx0XHR0aGlzLl9pc0V4dGVuc2lvbkRldkRlYnVnID0gZGV2T3B0cy5pc0V4dGVuc2lvbkRldkRlYnVnO1xuXHRcdHRoaXMuX2lzRXh0ZW5zaW9uRGV2RGVidWdCcmsgPSBkZXZPcHRzLmlzRXh0ZW5zaW9uRGV2RGVidWdCcms7XG5cdFx0dGhpcy5faXNFeHRlbnNpb25EZXZUZXN0RnJvbUNsaSA9IGRldk9wdHMuaXNFeHRlbnNpb25EZXZUZXN0RnJvbUNsaTtcblxuXHRcdHRoaXMuX3Rlcm1pbmF0aW5nID0gZmFsc2U7XG5cdFx0dGhpcy5fbWFpblByb2Nlc3NIYW5kbGVzRXh0SG9zdFNodXRkb3duID0gZmFsc2U7XG5cblx0XHR0aGlzLl9pbnNwZWN0TGlzdGVuZXIgPSBudWxsO1xuXHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzID0gbnVsbDtcblx0XHR0aGlzLl9tZXNzYWdlUHJvdG9jb2wgPSBudWxsO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlmZWN5Y2xlU2VydmljZS5vbldpbGxTaHV0ZG93bihlID0+IHRoaXMuX29uV2lsbFNodXRkb3duKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZS5vbkNsb3NlKGV2ZW50ID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc0V4dGVuc2lvbkRldkhvc3QgJiYgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmRlYnVnRXh0ZW5zaW9uSG9zdC5kZWJ1Z0lkID09PSBldmVudC5zZXNzaW9uSWQpIHtcblx0XHRcdFx0dGhpcy5fbmF0aXZlSG9zdFNlcnZpY2UuY2xvc2VXaW5kb3coKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZS5vblJlbG9hZChldmVudCA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNFeHRlbnNpb25EZXZIb3N0ICYmIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5kZWJ1Z0V4dGVuc2lvbkhvc3QuZGVidWdJZCA9PT0gZXZlbnQuc2Vzc2lvbklkKSB7XG5cdFx0XHRcdHRoaXMuX2hvc3RTZXJ2aWNlLnJlbG9hZCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdGVybWluYXRpbmcpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmF0aW5nID0gdHJ1ZTtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX21lc3NhZ2VQcm90b2NvbCA9IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZGlzY29ubmVjdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl90ZXJtaW5hdGluZyA9IHRydWU7XG5cblx0XHQvLyBTZW5kIHRoZSBUZXJtaW5hdGUgbWVzc2FnZSBzbyB0aGUgZXh0ZW5zaW9uIGhvc3QgY2FuIHJ1blxuXHRcdC8vIGRlYWN0aXZhdGlvbiBoYW5kbGVycyBhbmQgZXhpdCBncmFjZWZ1bGx5LlxuXHRcdGlmICh0aGlzLl9tZXNzYWdlUHJvdG9jb2wpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHByb3RvY29sID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdFx0XHR0aGlzLl9tZXNzYWdlUHJvdG9jb2wudGhlbihwcm90b2NvbCA9PiBwcm90b2NvbCwgKCkgPT4gdW5kZWZpbmVkKSxcblx0XHRcdFx0XHR0aW1lb3V0KDEwMDApLnRoZW4oKCkgPT4gdW5kZWZpbmVkKVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0cHJvdG9jb2w/LnNlbmQoY3JlYXRlTWVzc2FnZU9mVHlwZShNZXNzYWdlVHlwZS5UZXJtaW5hdGUpKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgLSBleHRlbnNpb24gaG9zdCBtYXkgaGF2ZSBhbHJlYWR5IGV4aXRlZFxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZvciB0aGUgcmVzdGFydCBjYXNlIHdoZXJlIHRoZSBtYWluIHByb2Nlc3MgZG9lcyBub3QgaGFuZGxlIHRoZVxuXHRcdC8vIGV4dGVuc2lvbiBob3N0IHNodXRkb3duLCBzaWduYWwgdGhlIG1haW4gcHJvY2VzcyB0byBzdGFydCB0aGUgZ3JhY2Vcblx0XHQvLyB0aW1lciAoZmlyZS1hbmQtZm9yZ2V0KS4gQWZ0ZXIgdGhlIHRpbWVvdXQgdGhlIGV4dGVuc2lvbiBob3N0IHdpbGxcblx0XHQvLyBiZSBmb3JjZWZ1bGx5IGtpbGxlZCBpZiBpdCBoYXNuJ3QgZXhpdGVkIG9uIGl0cyBvd24uIEZvciBhbGxcblx0XHQvLyB3aW5kb3ctbGlmZWN5Y2xlIHNodXRkb3duIHJlYXNvbnMgKGNsb3NlL3F1aXQvcmVsb2FkL2xvYWQpLCB0aGVcblx0XHQvLyBtYWluIHByb2Nlc3MgYWxyZWFkeSBoYW5kbGVzIHRoaXMgdmlhXG5cdFx0Ly8gV2luZG93VXRpbGl0eVByb2Nlc3MucmVnaXN0ZXJXaW5kb3dMaXN0ZW5lcnMuXG5cdFx0aWYgKHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzICYmICF0aGlzLl9tYWluUHJvY2Vzc0hhbmRsZXNFeHRIb3N0U2h1dGRvd24pIHtcblx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzLndhaXRGb3JFeGl0KGV4dGVuc2lvbkhvc3RHcmFjZVRpbWVNcykuY2F0Y2goKCkgPT4geyAvKiBiZXN0LWVmZm9ydCAqLyB9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9tZXNzYWdlUHJvdG9jb2wgPSBudWxsO1xuXHR9XG5cblx0cHVibGljIHN0YXJ0KCk6IFByb21pc2U8SU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2w+IHtcblx0XHRpZiAodGhpcy5fdGVybWluYXRpbmcpIHtcblx0XHRcdC8vIC50ZXJtaW5hdGUoKSB3YXMgY2FsbGVkXG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX21lc3NhZ2VQcm90b2NvbCkge1xuXHRcdFx0dGhpcy5fbWVzc2FnZVByb3RvY29sID0gdGhpcy5fc3RhcnQoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fbWVzc2FnZVByb3RvY29sO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RhcnQoKTogUHJvbWlzZTxJTWVzc2FnZVBhc3NpbmdQcm90b2NvbD4ge1xuXHRcdGNvbnN0IFtleHRlbnNpb25Ib3N0Q3JlYXRpb25SZXN1bHQsIHBvcnROdW1iZXIsIHByb2Nlc3NFbnZdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdFN0YXJ0ZXIuY3JlYXRlRXh0ZW5zaW9uSG9zdCgpLFxuXHRcdFx0dGhpcy5fdHJ5RmluZERlYnVnUG9ydCgpLFxuXHRcdFx0dGhpcy5fc2hlbGxFbnZpcm9ubWVudFNlcnZpY2UuZ2V0U2hlbGxFbnYoKSxcblx0XHRdKTtcblxuXHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzID0gbmV3IEV4dGVuc2lvbkhvc3RQcm9jZXNzKGV4dGVuc2lvbkhvc3RDcmVhdGlvblJlc3VsdC5pZCwgdGhpcy5fZXh0ZW5zaW9uSG9zdFN0YXJ0ZXIpO1xuXG5cdFx0Y29uc3QgZW52ID0gb2JqZWN0cy5taXhpbihwcm9jZXNzRW52LCB7XG5cdFx0XHRWU0NPREVfRVNNX0VOVFJZUE9JTlQ6ICd2cy93b3JrYmVuY2gvYXBpL25vZGUvZXh0ZW5zaW9uSG9zdFByb2Nlc3MnLFxuXHRcdFx0VlNDT0RFX0hBTkRMRVNfVU5DQVVHSFRfRVJST1JTOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRpZiAodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmRlYnVnRXh0ZW5zaW9uSG9zdC5lbnYpIHtcblx0XHRcdG9iamVjdHMubWl4aW4oZW52LCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZGVidWdFeHRlbnNpb25Ib3N0LmVudik7XG5cdFx0fVxuXG5cdFx0cmVtb3ZlRGFuZ2Vyb3VzRW52VmFyaWFibGVzKGVudik7XG5cblx0XHRpZiAodGhpcy5faXNFeHRlbnNpb25EZXZIb3N0KSB7XG5cdFx0XHQvLyBVbnNldCBgVlNDT0RFX0NPREVfQ0FDSEVfUEFUSGAgd2hlbiBkZXZlbG9waW5nIGV4dGVuc2lvbnMgYmVjYXVzZSBpdCBtaWdodFxuXHRcdFx0Ly8gYmUgdGhhdCBkZXBlbmRlbmNpZXMsIHRoYXQgb3RoZXJ3aXNlIHdvdWxkIGJlIGNhY2hlZCwgZ2V0IG1vZGlmaWVkLlxuXHRcdFx0ZGVsZXRlIGVudlsnVlNDT0RFX0NPREVfQ0FDSEVfUEFUSCddO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdHM6IElFeHRlbnNpb25Ib3N0UHJvY2Vzc09wdGlvbnMgPSB7XG5cdFx0XHRyZXNwb25zZVdpbmRvd0lkOiB0aGlzLl9uYXRpdmVIb3N0U2VydmljZS53aW5kb3dJZCxcblx0XHRcdHJlc3BvbnNlQ2hhbm5lbDogJ3ZzY29kZTpzdGFydEV4dGVuc2lvbkhvc3RNZXNzYWdlUG9ydFJlc3VsdCcsXG5cdFx0XHRyZXNwb25zZU5vbmNlOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdGVudixcblx0XHRcdC8vIFdlIG9ubHkgZGV0YWNoIHRoZSBleHRlbnNpb24gaG9zdCBvbiB3aW5kb3dzLiBMaW51eCBhbmQgTWFjIG9ycGhhbiBieSBkZWZhdWx0XG5cdFx0XHQvLyBhbmQgZGV0YWNoIHVuZGVyIExpbnV4IGFuZCBNYWMgY3JlYXRlIGFub3RoZXIgcHJvY2VzcyBncm91cC5cblx0XHRcdC8vIFdlIGRldGFjaCBiZWNhdXNlIHdlIGhhdmUgbm90aWNlZCB0aGF0IHdoZW4gdGhlIHJlbmRlcmVyIGV4aXRzLCBpdHMgY2hpbGQgcHJvY2Vzc2VzXG5cdFx0XHQvLyAoaS5lLiBleHRlbnNpb24gaG9zdCkgYXJlIHRha2VuIGRvd24gaW4gYSBicnV0YWwgZmFzaGlvbiBieSB0aGUgT1Ncblx0XHRcdGRldGFjaGVkOiAhIXBsYXRmb3JtLmlzV2luZG93cyxcblx0XHRcdGV4ZWNBcmd2OiB1bmRlZmluZWQgYXMgc3RyaW5nW10gfCB1bmRlZmluZWQsXG5cdFx0XHRzaWxlbnQ6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW5zcGVjdEhvc3QgPSAnMTI3LjAuMC4xJztcblx0XHRpZiAocG9ydE51bWJlciAhPT0gMCkge1xuXHRcdFx0b3B0cy5leGVjQXJndiA9IFtcblx0XHRcdFx0Jy0tbm9sYXp5Jyxcblx0XHRcdFx0KHRoaXMuX2lzRXh0ZW5zaW9uRGV2RGVidWdCcmsgPyAnLS1pbnNwZWN0LWJyaz0nIDogJy0taW5zcGVjdD0nKSArIGAke2luc3BlY3RIb3N0fToke3BvcnROdW1iZXJ9YFxuXHRcdFx0XTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3B0cy5leGVjQXJndiA9IFsnLS1pbnNwZWN0LXBvcnQ9MCddO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSkge1xuXHRcdFx0b3B0cy5leGVjQXJndi51bnNoaWZ0KCctLWV4cG9zZS1nYycpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1sncHJvZi12OC1leHRlbnNpb25zJ10pIHtcblx0XHRcdG9wdHMuZXhlY0FyZ3YudW5zaGlmdCgnLS1wcm9mJyk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVmcyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTg5ODA1XG5cdFx0Ly9cblx0XHQvLyBFbmFibGUgZXhwZXJpbWVudGFsIG5ldHdvcmsgaW5zcGVjdGlvblxuXHRcdC8vIGluc3BlY3RvciBhZ2VudCBpcyBhbHdheXMgc2V0dXAgaGVuY2UgYWRkIHRoaXMgZmxhZ1xuXHRcdC8vIHVuY29uZGl0aW9uYWxseS5cblx0XHRvcHRzLmV4ZWNBcmd2LnVuc2hpZnQoJy0tZG5zLXJlc3VsdC1vcmRlcj1pcHY0Zmlyc3QnLCAnLS1leHBlcmltZW50YWwtbmV0d29yay1pbnNwZWN0aW9uJyk7XG5cblx0XHQvLyBDYXRjaCBhbGwgb3V0cHV0IGNvbWluZyBmcm9tIHRoZSBleHRlbnNpb24gaG9zdCBwcm9jZXNzXG5cdFx0dHlwZSBPdXRwdXQgPSB7IGRhdGE6IHN0cmluZzsgZm9ybWF0OiBzdHJpbmdbXSB9O1xuXHRcdGNvbnN0IG9uU3Rkb3V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faGFuZGxlUHJvY2Vzc091dHB1dFN0cmVhbSh0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2Vzcy5vblN0ZG91dCkpO1xuXHRcdGNvbnN0IG9uU3RkZXJyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faGFuZGxlUHJvY2Vzc091dHB1dFN0cmVhbSh0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2Vzcy5vblN0ZGVycikpO1xuXHRcdGNvbnN0IG9uT3V0cHV0ID0gRXZlbnQuYW55KFxuXHRcdFx0RXZlbnQubWFwKG9uU3Rkb3V0LmV2ZW50LCBvID0+ICh7IGRhdGE6IGAlYyR7b31gLCBmb3JtYXQ6IFsnJ10gfSkpLFxuXHRcdFx0RXZlbnQubWFwKG9uU3RkZXJyLmV2ZW50LCBvID0+ICh7IGRhdGE6IGAlYyR7b31gLCBmb3JtYXQ6IFsnY29sb3I6IHJlZCddIH0pKVxuXHRcdCk7XG5cblx0XHQvLyBQZXJzaXN0IHRoZSByYXcgZXh0ZW5zaW9uIGhvc3QgcHJvY2VzcyBvdXRwdXQgKHN0ZG91dC9zdGRlcnIpIHRvIHRoZVxuXHRcdC8vIHJlbmRlcmVyIGxvZy4gVGhlIG91dHB1dCBpcyBvdGhlcndpc2Ugb25seSBmb3J3YXJkZWQgKGRlYm91bmNlZCkgdG8gdGhlXG5cdFx0Ly8gcmVuZGVyZXIgRGV2VG9vbHMgY29uc29sZS4gQSBuYXRpdmUgY3Jhc2ggb2YgdGhlIGV4dGVuc2lvbiBob3N0IHByb2Nlc3Ncblx0XHQvLyAtIGUuZy4gYSBmYXVsdHkgbmF0aXZlIGFkZG9uIC0gcHJpbnRzIHRvIHRoZSBwcm9jZXNzJyBzdGRlcnIgYnV0IG5ldmVyXG5cdFx0Ly8gcmVhY2hlcyB0aGUgSmF2YVNjcmlwdCBsYXllciwgc28gaXQgaGFzIG5vIEpTIHN0YWNrIGFuZCAoZm9yIHV0aWxpdHlcblx0XHQvLyBwcm9jZXNzZXMpIGZyZXF1ZW50bHkgcHJvZHVjZXMgbm8gY3Jhc2ggZHVtcDsgaXQgYWxzbyBjYW5ub3QgZ28gdGhyb3VnaFxuXHRcdC8vIHRoZSBleHRlbnNpb24gaG9zdCdzIG93biBsb2cgc2VydmljZSwgd2hpY2ggbGl2ZXMgaW4gdGhlIGR5aW5nIHByb2Nlc3MuXG5cdFx0Ly8gQ2FwdHVyaW5nIHRoZSByYXcgb3V0cHV0IGZyb20gdGhlIChzdXJ2aXZpbmcpIHJlbmRlcmVyIGtlZXBzIHN1Y2hcblx0XHQvLyBjcmFzaGVzIGRpYWdub3NhYmxlIGZyb20gdGhlIGxvZ3MuIEdhdGVkIHRvIHNtb2tlIHRlc3RzXG5cdFx0Ly8gKGAtLWVuYWJsZS1zbW9rZS10ZXN0LWRyaXZlcmApIHNvIGl0IGRvZXMgbm90IGFmZmVjdCByZWd1bGFyIHNlc3Npb25zLlxuXHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1snZW5hYmxlLXNtb2tlLXRlc3QtZHJpdmVyJ10pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG9uU3Rkb3V0LmV2ZW50KGxpbmUgPT4gdGhpcy5fbG9nU2VydmljZS5pbmZvKGBbRXh0ZW5zaW9uIEhvc3QgKHN0ZG91dCldICR7bGluZS5yZXBsYWNlKC9cXHI/XFxuJC8sICcnKX1gKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIob25TdGRlcnIuZXZlbnQobGluZSA9PiB0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbRXh0ZW5zaW9uIEhvc3QgKHN0ZGVycildICR7bGluZS5yZXBsYWNlKC9cXHI/XFxuJC8sICcnKX1gKSkpO1xuXHRcdH1cblxuXHRcdC8vIERlYm91bmNlIGFsbCBvdXRwdXQsIHNvIHdlIGNhbiByZW5kZXIgaXQgaW4gdGhlIENocm9tZSBjb25zb2xlIGFzIGEgZ3JvdXBcblx0XHRjb25zdCBvbkRlYm91bmNlZE91dHB1dCA9IEV2ZW50LmRlYm91bmNlPE91dHB1dD4ob25PdXRwdXQsIChyLCBvKSA9PiB7XG5cdFx0XHRyZXR1cm4gclxuXHRcdFx0XHQ/IHsgZGF0YTogci5kYXRhICsgby5kYXRhLCBmb3JtYXQ6IFsuLi5yLmZvcm1hdCwgLi4uby5mb3JtYXRdIH1cblx0XHRcdFx0OiB7IGRhdGE6IG8uZGF0YSwgZm9ybWF0OiBvLmZvcm1hdCB9O1xuXHRcdH0sIDEwMCk7XG5cblx0XHQvLyBQcmludCBvdXQgZXh0ZW5zaW9uIGhvc3Qgb3V0cHV0XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EZWJvdW5jZWRPdXRwdXQob3V0cHV0ID0+IHtcblx0XHRcdGNvbnN0IGluc3BlY3RvclVybE1hdGNoID0gb3V0cHV0LmRhdGEgJiYgb3V0cHV0LmRhdGEubWF0Y2goL3dzOlxcL1xcLyhbXlxcc10rKTooXFxkKylcXC8oW15cXHNdKykvKTtcblx0XHRcdGlmIChpbnNwZWN0b3JVcmxNYXRjaCkge1xuXHRcdFx0XHRjb25zdCBbLCBob3N0LCBwb3J0LCBhdXRoXSA9IGluc3BlY3RvclVybE1hdGNoO1xuXHRcdFx0XHRjb25zdCBkZXZ0b29sc1VybCA9IGBkZXZ0b29sczovL2RldnRvb2xzL2J1bmRsZWQvanNfYXBwLmh0bWw/djhvbmx5PXRydWUmd3M9JHtob3N0fToke3BvcnR9LyR7YXV0aH1gO1xuXHRcdFx0XHRpZiAoIXRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc0J1aWx0ICYmICF0aGlzLl9pc0V4dGVuc2lvbkRldlRlc3RGcm9tQ2xpKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5kZWJ1ZyhgJWNbRXh0ZW5zaW9uIEhvc3RdICVjZGVidWdnZXIgaW5zcGVjdG9yIGF0ICR7ZGV2dG9vbHNVcmx9YCwgJ2NvbG9yOiBibHVlJywgJ2NvbG9yOicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghdGhpcy5faW5zcGVjdExpc3RlbmVyIHx8ICF0aGlzLl9pbnNwZWN0TGlzdGVuZXIuZGV2dG9vbHNVcmwpIHtcblx0XHRcdFx0XHR0aGlzLl9pbnNwZWN0TGlzdGVuZXIgPSB7IGhvc3QsIHBvcnQ6IE51bWJlcihwb3J0KSwgZGV2dG9vbHNVcmwgfTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFNldEluc3BlY3RQb3J0LmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9pc0V4dGVuc2lvbkRldlRlc3RGcm9tQ2xpKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5ncm91cCgnRXh0ZW5zaW9uIEhvc3QnKTtcblx0XHRcdFx0XHRjb25zb2xlLmxvZyhvdXRwdXQuZGF0YSwgLi4ub3V0cHV0LmZvcm1hdCk7XG5cdFx0XHRcdFx0Y29uc29sZS5ncm91cEVuZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTGlmZWN5Y2xlXG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2Vzcy5vbkV4aXQoKHsgY29kZSwgc2lnbmFsIH0pID0+IHRoaXMuX29uRXh0SG9zdFByb2Nlc3NFeGl0KGNvZGUsIHNpZ25hbCkpKTtcblxuXHRcdC8vIE5vdGlmeSBkZWJ1Z2dlciB0aGF0IHdlIGFyZSByZWFkeSB0byBhdHRhY2ggdG8gdGhlIHByb2Nlc3MgaWYgd2UgcnVuIGEgZGV2ZWxvcG1lbnQgZXh0ZW5zaW9uXG5cdFx0aWYgKHBvcnROdW1iZXIpIHtcblx0XHRcdGlmICh0aGlzLl9pc0V4dGVuc2lvbkRldkhvc3QgJiYgdGhpcy5faXNFeHRlbnNpb25EZXZEZWJ1ZyAmJiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZGVidWdFeHRlbnNpb25Ib3N0LmRlYnVnSWQpIHtcblx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZS5hdHRhY2hTZXNzaW9uKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5kZWJ1Z0V4dGVuc2lvbkhvc3QuZGVidWdJZCwgcG9ydE51bWJlcik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9pbnNwZWN0TGlzdGVuZXIgPSB7IHBvcnQ6IHBvcnROdW1iZXIsIGhvc3Q6IGluc3BlY3RIb3N0IH07XG5cdFx0XHR0aGlzLl9vbkRpZFNldEluc3BlY3RQb3J0LmZpcmUoKTtcblx0XHR9XG5cblx0XHQvLyBIZWxwIGluIGNhc2Ugd2UgZmFpbCB0byBzdGFydCBpdFxuXHRcdGxldCBzdGFydHVwVGltZW91dEhhbmRsZTogVGltZW91dCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIXRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc0J1aWx0ICYmICF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5IHx8IHRoaXMuX2lzRXh0ZW5zaW9uRGV2SG9zdCkge1xuXHRcdFx0c3RhcnR1cFRpbWVvdXRIYW5kbGUgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0xvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3RdOiBFeHRlbnNpb24gaG9zdCBkaWQgbm90IHN0YXJ0IGluIDEwIHNlY29uZHMgKGRlYnVnQnJrOiAke3RoaXMuX2lzRXh0ZW5zaW9uRGV2RGVidWdCcmt9KWApO1xuXG5cdFx0XHRcdGNvbnN0IG1zZyA9IHRoaXMuX2lzRXh0ZW5zaW9uRGV2RGVidWdCcmtcblx0XHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uSG9zdC5zdGFydHVwRmFpbERlYnVnJywgXCJFeHRlbnNpb24gaG9zdCBkaWQgbm90IHN0YXJ0IGluIDEwIHNlY29uZHMsIGl0IG1pZ2h0IGJlIHN0b3BwZWQgb24gdGhlIGZpcnN0IGxpbmUgYW5kIG5lZWRzIGEgZGVidWdnZXIgdG8gY29udGludWUuXCIpXG5cdFx0XHRcdFx0OiBubHMubG9jYWxpemUoJ2V4dGVuc2lvbkhvc3Quc3RhcnR1cEZhaWwnLCBcIkV4dGVuc2lvbiBob3N0IGRpZCBub3Qgc3RhcnQgaW4gMTAgc2Vjb25kcywgdGhhdCBtaWdodCBiZSBhIHByb2JsZW0uXCIpO1xuXG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFNldmVyaXR5Lldhcm5pbmcsIG1zZyxcblx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgncmVsb2FkV2luZG93JywgXCJSZWxvYWQgV2luZG93XCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9ob3N0U2VydmljZS5yZWxvYWQoKVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHN0aWNreTogdHJ1ZSxcblx0XHRcdFx0XHRcdHByaW9yaXR5OiBOb3RpZmljYXRpb25Qcmlvcml0eS5VUkdFTlRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHR9LCAxMDAwMCk7XG5cdFx0fVxuXG5cdFx0Ly8gSW5pdGlhbGl6ZSBleHRlbnNpb24gaG9zdCBwcm9jZXNzIHdpdGggaGFuZCBzaGFrZXNcblx0XHRjb25zdCBwcm90b2NvbCA9IGF3YWl0IHRoaXMuX2VzdGFibGlzaFByb3RvY29sKHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzLCBvcHRzKTtcblx0XHRhd2FpdCB0aGlzLl9wZXJmb3JtSGFuZHNoYWtlKHByb3RvY29sKTtcblx0XHRjbGVhclRpbWVvdXQoc3RhcnR1cFRpbWVvdXRIYW5kbGUpO1xuXHRcdHJldHVybiBwcm90b2NvbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kIGEgZnJlZSBwb3J0IGlmIGV4dGVuc2lvbiBob3N0IGRlYnVnZ2luZyBpcyBlbmFibGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfdHJ5RmluZERlYnVnUG9ydCgpOiBQcm9taXNlPG51bWJlcj4ge1xuXG5cdFx0aWYgKHR5cGVvZiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZGVidWdFeHRlbnNpb25Ib3N0LnBvcnQgIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5kZWJ1Z0V4dGVuc2lvbkhvc3QucG9ydDtcblx0XHRjb25zdCBwb3J0ID0gYXdhaXQgdGhpcy5fbmF0aXZlSG9zdFNlcnZpY2UuZmluZEZyZWVQb3J0KGV4cGVjdGVkLCAxMCAvKiB0cnkgMTAgcG9ydHMgKi8sIDUwMDAgLyogdHJ5IHVwIHRvIDUgc2Vjb25kcyAqLywgMjA0OCAvKiBza2lwIDIwNDggcG9ydHMgYmV0d2VlbiBhdHRlbXB0cyAqLyk7XG5cblx0XHRpZiAoIXRoaXMuX2lzRXh0ZW5zaW9uRGV2VGVzdEZyb21DbGkpIHtcblx0XHRcdGlmICghcG9ydCkge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oJyVjW0V4dGVuc2lvbiBIb3N0XSAlY0NvdWxkIG5vdCBmaW5kIGEgZnJlZSBwb3J0IGZvciBkZWJ1Z2dpbmcnLCAnY29sb3I6IGJsdWUnLCAnY29sb3I6Jyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAocG9ydCAhPT0gZXhwZWN0ZWQpIHtcblx0XHRcdFx0XHRjb25zb2xlLndhcm4oYCVjW0V4dGVuc2lvbiBIb3N0XSAlY1Byb3ZpZGVkIGRlYnVnZ2luZyBwb3J0ICR7ZXhwZWN0ZWR9IGlzIG5vdCBmcmVlLCB1c2luZyAke3BvcnR9IGluc3RlYWQuYCwgJ2NvbG9yOiBibHVlJywgJ2NvbG9yOicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLl9pc0V4dGVuc2lvbkRldkRlYnVnQnJrKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKGAlY1tFeHRlbnNpb24gSG9zdF0gJWNTVE9QUEVEIG9uIGZpcnN0IGxpbmUgZm9yIGRlYnVnZ2luZyBvbiBwb3J0ICR7cG9ydH1gLCAnY29sb3I6IGJsdWUnLCAnY29sb3I6Jyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc29sZS5kZWJ1ZyhgJWNbRXh0ZW5zaW9uIEhvc3RdICVjZGVidWdnZXIgbGlzdGVuaW5nIG9uIHBvcnQgJHtwb3J0fWAsICdjb2xvcjogYmx1ZScsICdjb2xvcjonKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBwb3J0IHx8IDA7XG5cdH1cblxuXHRwcml2YXRlIF9lc3RhYmxpc2hQcm90b2NvbChleHRlbnNpb25Ib3N0UHJvY2VzczogRXh0ZW5zaW9uSG9zdFByb2Nlc3MsIG9wdHM6IElFeHRlbnNpb25Ib3N0UHJvY2Vzc09wdGlvbnMpOiBQcm9taXNlPElNZXNzYWdlUGFzc2luZ1Byb3RvY29sPiB7XG5cblx0XHR3cml0ZUV4dEhvc3RDb25uZWN0aW9uKG5ldyBNZXNzYWdlUG9ydEV4dEhvc3RDb25uZWN0aW9uKCksIG9wdHMuZW52KTtcblxuXHRcdC8vIEdldCByZWFkeSB0byBhY3F1aXJlIHRoZSBtZXNzYWdlIHBvcnQgZnJvbSB0aGUgc2hhcmVkIHByb2Nlc3Mgd29ya2VyXG5cdFx0Y29uc3QgcG9ydFByb21pc2UgPSBhY3F1aXJlUG9ydCh1bmRlZmluZWQgLyogd2UgdHJpZ2dlciB0aGUgcmVxdWVzdCB2aWEgc2VydmljZSBjYWxsISAqLywgb3B0cy5yZXNwb25zZUNoYW5uZWwsIG9wdHMucmVzcG9uc2VOb25jZSk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2w+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblxuXHRcdFx0Y29uc3QgaGFuZGxlID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHJlamVjdCgnVGhlIGxvY2FsIGV4dGVuc2lvbiBob3N0IHRvb2sgbG9uZ2VyIHRoYW4gNjBzIHRvIGNvbm5lY3QuJyk7XG5cdFx0XHR9LCA2MCAqIDEwMDApO1xuXG5cdFx0XHRwb3J0UHJvbWlzZS50aGVuKChwb3J0KSA9PiB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gQ2xvc2UgdGhlIG1lc3NhZ2UgcG9ydCB3aGVuIHRoZSBleHRlbnNpb24gaG9zdCBpcyBkaXNwb3NlZFxuXHRcdFx0XHRcdHBvcnQuY2xvc2UoKTtcblx0XHRcdFx0XHRwb3J0Lm9ubWVzc2FnZSA9IG51bGw7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KGhhbmRsZSk7XG5cblx0XHRcdFx0Y29uc3Qgb25NZXNzYWdlID0gbmV3IEJ1ZmZlcmVkRW1pdHRlcjxWU0J1ZmZlcj4oKTtcblx0XHRcdFx0cG9ydC5vbm1lc3NhZ2UgPSAoKGUpID0+IHtcblx0XHRcdFx0XHRpZiAoZS5kYXRhKSB7XG5cdFx0XHRcdFx0XHRvbk1lc3NhZ2UuZmlyZShWU0J1ZmZlci53cmFwKGUuZGF0YSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHBvcnQuc3RhcnQoKTtcblxuXHRcdFx0XHRyZXNvbHZlKHtcblx0XHRcdFx0XHRvbk1lc3NhZ2U6IG9uTWVzc2FnZS5ldmVudCxcblx0XHRcdFx0XHRzZW5kOiBtZXNzYWdlID0+IHBvcnQucG9zdE1lc3NhZ2UobWVzc2FnZS5idWZmZXIpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBOb3cgdGhhdCB0aGUgbWVzc2FnZSBwb3J0IGxpc3RlbmVyIGlzIGluc3RhbGxlZCwgc3RhcnQgdGhlIGV4dCBob3N0IHByb2Nlc3Ncblx0XHRcdGNvbnN0IHN3ID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cdFx0XHRleHRlbnNpb25Ib3N0UHJvY2Vzcy5zdGFydChvcHRzKS50aGVuKCh7IHBpZCB9KSA9PiB7XG5cdFx0XHRcdGlmIChwaWQpIHtcblx0XHRcdFx0XHR0aGlzLnBpZCA9IHBpZDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFN0YXJ0ZWQgbG9jYWwgZXh0ZW5zaW9uIGhvc3Qgd2l0aCBwaWQgJHtwaWR9LmApO1xuXHRcdFx0XHRjb25zdCBkdXJhdGlvbiA9IHN3LmVsYXBzZWQoKTtcblx0XHRcdFx0aWYgKHBsYXRmb3JtLmlzQ0kpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYElFeHRlbnNpb25Ib3N0U3RhcnRlci5zdGFydCgpIHRvb2sgJHtkdXJhdGlvbn0gbXMuYCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIChlcnIpID0+IHtcblx0XHRcdFx0Ly8gU3RhcnRpbmcgdGhlIGV4dCBob3N0IHByb2Nlc3MgcmVzdWx0ZWQgaW4gYW4gZXJyb3Jcblx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3BlcmZvcm1IYW5kc2hha2UocHJvdG9jb2w6IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gMSkgd2FpdCBmb3IgdGhlIGluY29taW5nIGByZWFkeWAgZXZlbnQgYW5kIHNlbmQgdGhlIGluaXRpYWxpemF0aW9uIGRhdGEuXG5cdFx0Ly8gMikgd2FpdCBmb3IgdGhlIGluY29taW5nIGBpbml0aWFsaXplZGAgZXZlbnQuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblxuXHRcdFx0bGV0IHRpbWVvdXRIYW5kbGU6IFRpbWVvdXQ7XG5cdFx0XHRjb25zdCBpbnN0YWxsVGltZW91dENoZWNrID0gKCkgPT4ge1xuXHRcdFx0XHR0aW1lb3V0SGFuZGxlID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0cmVqZWN0KCdUaGUgbG9jYWwgZXh0ZW5zaW9uIGhvc3QgdG9vayBsb25nZXIgdGhhbiA2MHMgdG8gc2VuZCBpdHMgcmVhZHkgbWVzc2FnZS4nKTtcblx0XHRcdFx0fSwgNjAgKiAxMDAwKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCB1bmluc3RhbGxUaW1lb3V0Q2hlY2sgPSAoKSA9PiB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0SGFuZGxlKTtcblx0XHRcdH07XG5cblx0XHRcdC8vIFdhaXQgNjBzIGZvciB0aGUgcmVhZHkgbWVzc2FnZVxuXHRcdFx0aW5zdGFsbFRpbWVvdXRDaGVjaygpO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gcHJvdG9jb2wub25NZXNzYWdlKG1zZyA9PiB7XG5cblx0XHRcdFx0aWYgKGlzTWVzc2FnZU9mVHlwZShtc2csIE1lc3NhZ2VUeXBlLlJlYWR5KSkge1xuXG5cdFx0XHRcdFx0Ly8gMSkgRXh0ZW5zaW9uIEhvc3QgaXMgcmVhZHkgdG8gcmVjZWl2ZSBtZXNzYWdlcywgaW5pdGlhbGl6ZSBpdFxuXHRcdFx0XHRcdHVuaW5zdGFsbFRpbWVvdXRDaGVjaygpO1xuXG5cdFx0XHRcdFx0dGhpcy5fY3JlYXRlRXh0SG9zdEluaXREYXRhKCkudGhlbihkYXRhID0+IHtcblxuXHRcdFx0XHRcdFx0Ly8gV2FpdCA2MHMgZm9yIHRoZSBpbml0aWFsaXplZCBtZXNzYWdlXG5cdFx0XHRcdFx0XHRpbnN0YWxsVGltZW91dENoZWNrKCk7XG5cblx0XHRcdFx0XHRcdHByb3RvY29sLnNlbmQoVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShkYXRhKSkpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc01lc3NhZ2VPZlR5cGUobXNnLCBNZXNzYWdlVHlwZS5Jbml0aWFsaXplZCkpIHtcblxuXHRcdFx0XHRcdC8vIDIpIEV4dGVuc2lvbiBIb3N0IGlzIGluaXRpYWxpemVkXG5cdFx0XHRcdFx0dW5pbnN0YWxsVGltZW91dENoZWNrKCk7XG5cblx0XHRcdFx0XHQvLyBzdG9wIGxpc3RlbmluZyBmb3IgbWVzc2FnZXMgaGVyZVxuXHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0XHRcdFx0Ly8gcmVsZWFzZSB0aGlzIHByb21pc2Vcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc29sZS5lcnJvcihgcmVjZWl2ZWQgdW5leHBlY3RlZCBtZXNzYWdlIGR1cmluZyBoYW5kc2hha2UgcGhhc2UgZnJvbSB0aGUgZXh0ZW5zaW9uIGhvc3Q6IGAsIG1zZyk7XG5cdFx0XHR9KTtcblxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlRXh0SG9zdEluaXREYXRhKCk6IFByb21pc2U8SUV4dGVuc2lvbkhvc3RJbml0RGF0YT4ge1xuXHRcdGNvbnN0IGluaXREYXRhID0gYXdhaXQgdGhpcy5faW5pdERhdGFQcm92aWRlci5nZXRJbml0RGF0YSgpO1xuXHRcdHRoaXMuZXh0ZW5zaW9ucyA9IGluaXREYXRhLmV4dGVuc2lvbnM7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0Y29uc3QgZW5hYmxlZEFwaVByb3Bvc2Fsc0ZhbGxiYWNrID0gYXdhaXQgcmVzb2x2ZUVuYWJsZWRBcGlQcm9wb3NhbHNGYWxsYmFja0V4cGVyaW1lbnQodGhpcy5fd29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnF1YWxpdHkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb21taXQ6IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmNvbW1pdCxcblx0XHRcdHZlcnNpb246IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnZlcnNpb24sXG5cdFx0XHRxdWFsaXR5OiB0aGlzLl9wcm9kdWN0U2VydmljZS5xdWFsaXR5LFxuXHRcdFx0ZGF0ZTogdGhpcy5fcHJvZHVjdFNlcnZpY2UuZGF0ZSxcblx0XHRcdHBhcmVudFBpZDogMCxcblx0XHRcdGVuYWJsZWRBcGlQcm9wb3NhbHNGYWxsYmFjayxcblx0XHRcdGVudmlyb25tZW50OiB7XG5cdFx0XHRcdGlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnREZWJ1ZzogdGhpcy5faXNFeHRlbnNpb25EZXZEZWJ1Zyxcblx0XHRcdFx0YXBwUm9vdDogdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFwcFJvb3QgPyBVUkkuZmlsZSh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXBwUm9vdCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGFwcE5hbWU6IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLm5hbWVMb25nLFxuXHRcdFx0XHRhcHBIb3N0OiAodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cgPyB0aGlzLl9wcm9kdWN0U2VydmljZS5hZ2VudHNUZWxlbWV0cnlBcHBOYW1lIDogdW5kZWZpbmVkKSB8fCB0aGlzLl9wcm9kdWN0U2VydmljZS5lbWJlZGRlcklkZW50aWZpZXIgfHwgJ2Rlc2t0b3AnLFxuXHRcdFx0XHRhcHBVcmlTY2hlbWU6IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnVybFByb3RvY29sLFxuXHRcdFx0XHRpc0V4dGVuc2lvblRlbGVtZXRyeUxvZ2dpbmdPbmx5OiBpc0xvZ2dpbmdPbmx5KHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UpLFxuXHRcdFx0XHRpc1BvcnRhYmxlOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNQb3J0YWJsZSxcblx0XHRcdFx0YXBwTGFuZ3VhZ2U6IHBsYXRmb3JtLmxhbmd1YWdlLFxuXHRcdFx0XHRleHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSSxcblx0XHRcdFx0ZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSTogdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkksXG5cdFx0XHRcdGdsb2JhbFN0b3JhZ2VIb21lOiB0aGlzLl91c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5nbG9iYWxTdG9yYWdlSG9tZSxcblx0XHRcdFx0d29ya3NwYWNlU3RvcmFnZUhvbWU6IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS53b3Jrc3BhY2VTdG9yYWdlSG9tZSxcblx0XHRcdFx0ZXh0ZW5zaW9uTG9nTGV2ZWw6IHRoaXMuX2RlZmF1bHRMb2dMZXZlbHNTZXJ2aWNlLmRlZmF1bHRMb2dMZXZlbHMuZXh0ZW5zaW9ucyxcblx0XHRcdFx0aXNTZXNzaW9uc1dpbmRvdzogdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3dcblx0XHRcdH0sXG5cdFx0XHR3b3Jrc3BhY2U6IHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZID8gdW5kZWZpbmVkIDoge1xuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiA/PyB1bmRlZmluZWQsXG5cdFx0XHRcdGlkOiB3b3Jrc3BhY2UuaWQsXG5cdFx0XHRcdG5hbWU6IHRoaXMuX2xhYmVsU2VydmljZS5nZXRXb3Jrc3BhY2VMYWJlbCh3b3Jrc3BhY2UpLFxuXHRcdFx0XHRpc1VudGl0bGVkOiB3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiA/IGlzVW50aXRsZWRXb3Jrc3BhY2Uod29ya3NwYWNlLmNvbmZpZ3VyYXRpb24sIHRoaXMuX2Vudmlyb25tZW50U2VydmljZSkgOiBmYWxzZSxcblx0XHRcdFx0dHJhbnNpZW50OiB3b3Jrc3BhY2UudHJhbnNpZW50XG5cdFx0XHR9LFxuXHRcdFx0cmVtb3RlOiB7XG5cdFx0XHRcdGF1dGhvcml0eTogdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0Y29ubmVjdGlvbkRhdGE6IG51bGwsXG5cdFx0XHRcdGlzUmVtb3RlOiBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdGNvbnNvbGVGb3J3YXJkOiB7XG5cdFx0XHRcdGluY2x1ZGVTdGFjazogIXRoaXMuX2lzRXh0ZW5zaW9uRGV2VGVzdEZyb21DbGkgJiYgKHRoaXMuX2lzRXh0ZW5zaW9uRGV2SG9zdCB8fCAhdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHQgfHwgdGhpcy5fcHJvZHVjdFNlcnZpY2UucXVhbGl0eSAhPT0gJ3N0YWJsZScgfHwgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnZlcmJvc2UpLFxuXHRcdFx0XHRsb2dOYXRpdmU6ICF0aGlzLl9pc0V4dGVuc2lvbkRldlRlc3RGcm9tQ2xpICYmIHRoaXMuX2lzRXh0ZW5zaW9uRGV2SG9zdFxuXHRcdFx0fSxcblx0XHRcdGV4dGVuc2lvbnM6IHRoaXMuZXh0ZW5zaW9ucy50b1NuYXBzaG90KCksXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiB7XG5cdFx0XHRcdHNlc3Npb25JZDogdGhpcy5fdGVsZW1ldHJ5U2VydmljZS5zZXNzaW9uSWQsXG5cdFx0XHRcdG1hY2hpbmVJZDogdGhpcy5fdGVsZW1ldHJ5U2VydmljZS5tYWNoaW5lSWQsXG5cdFx0XHRcdHNxbUlkOiB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnNxbUlkLFxuXHRcdFx0XHRkZXZEZXZpY2VJZDogdGhpcy5fdGVsZW1ldHJ5U2VydmljZS5kZXZEZXZpY2VJZCA/PyB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLm1hY2hpbmVJZCxcblx0XHRcdFx0Zmlyc3RTZXNzaW9uRGF0ZTogdGhpcy5fdGVsZW1ldHJ5U2VydmljZS5maXJzdFNlc3Npb25EYXRlLFxuXHRcdFx0XHRtc2Z0SW50ZXJuYWw6IHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UubXNmdEludGVybmFsXG5cdFx0XHR9LFxuXHRcdFx0cmVtb3RlRXh0ZW5zaW9uVGlwczogdGhpcy5fcHJvZHVjdFNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uVGlwcyxcblx0XHRcdHZpcnR1YWxXb3Jrc3BhY2VFeHRlbnNpb25UaXBzOiB0aGlzLl9wcm9kdWN0U2VydmljZS52aXJ0dWFsV29ya3NwYWNlRXh0ZW5zaW9uVGlwcyxcblx0XHRcdGxvZ0xldmVsOiB0aGlzLl9sb2dTZXJ2aWNlLmdldExldmVsKCksXG5cdFx0XHRsb2dnZXJzOiBbLi4udGhpcy5fbG9nZ2VyU2VydmljZS5nZXRSZWdpc3RlcmVkTG9nZ2VycygpXSxcblx0XHRcdGxvZ3NMb2NhdGlvbjogdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmV4dEhvc3RMb2dzUGF0aCxcblx0XHRcdGF1dG9TdGFydDogKHRoaXMuc3RhcnR1cCA9PT0gRXh0ZW5zaW9uSG9zdFN0YXJ0dXAuRWFnZXJBdXRvU3RhcnQpLFxuXHRcdFx0dWlLaW5kOiBVSUtpbmQuRGVza3RvcCxcblx0XHRcdGhhbmRsZTogdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLndpbmRvdy5oYW5kbGUgPyBlbmNvZGVCYXNlNjQodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLndpbmRvdy5oYW5kbGUpIDogdW5kZWZpbmVkXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX29uRXh0SG9zdFByb2Nlc3NFeGl0KGNvZGU6IG51bWJlciwgc2lnbmFsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdGVybWluYXRpbmcpIHtcblx0XHRcdC8vIEV4cGVjdGVkIHRlcm1pbmF0aW9uIHBhdGggKHdlIGFza2VkIHRoZSBwcm9jZXNzIHRvIHRlcm1pbmF0ZSlcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkV4aXQuZmlyZShbY29kZSwgc2lnbmFsXSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVQcm9jZXNzT3V0cHV0U3RyZWFtKHN0cmVhbTogRXZlbnQ8c3RyaW5nPikge1xuXHRcdGxldCBsYXN0ID0gJyc7XG5cdFx0bGV0IGlzT21pdHRpbmcgPSBmYWxzZTtcblx0XHRjb25zdCBldmVudCA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0XHRzdHJlYW0oKGNodW5rKSA9PiB7XG5cdFx0XHQvLyBub3QgYSBmYW5jeSBhcHByb2FjaCwgYnV0IHRoaXMgaXMgdGhlIHNhbWUgYXBwcm9hY2ggdXNlZCBieSB0aGUgc3BsaXQyXG5cdFx0XHQvLyBtb2R1bGUgd2hpY2ggaXMgd2VsbC1vcHRpbWl6ZWQgKGh0dHBzOi8vZ2l0aHViLmNvbS9tY29sbGluYS9zcGxpdDIpXG5cdFx0XHRsYXN0ICs9IGNodW5rO1xuXHRcdFx0Y29uc3QgbGluZXMgPSBsYXN0LnNwbGl0KC9cXHI/XFxuL2cpO1xuXHRcdFx0bGFzdCA9IGxpbmVzLnBvcCgpITtcblxuXHRcdFx0Ly8gcHJvdGVjdGVkIGFnYWluc3QgYW4gZXh0ZW5zaW9uIHNwYW1taW5nIGFuZCBsZWFraW5nIG1lbW9yeSBpZiBubyBuZXcgbGluZSBpcyB3cml0dGVuLlxuXHRcdFx0aWYgKGxhc3QubGVuZ3RoID4gMTBfMDAwKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobGFzdCk7XG5cdFx0XHRcdGxhc3QgPSAnJztcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRcdGlmIChpc09taXR0aW5nKSB7XG5cdFx0XHRcdFx0aWYgKGxpbmUgPT09IE5hdGl2ZUxvZ01hcmtlcnMuRW5kKSB7XG5cdFx0XHRcdFx0XHRpc09taXR0aW5nID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGxpbmUgPT09IE5hdGl2ZUxvZ01hcmtlcnMuU3RhcnQpIHtcblx0XHRcdFx0XHRpc09taXR0aW5nID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIGlmIChsaW5lLmxlbmd0aCkge1xuXHRcdFx0XHRcdGV2ZW50LmZpcmUobGluZSArICdcXG4nKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIHVuZGVmaW5lZCwgdGhpcy5fc3RvcmUpO1xuXG5cdFx0cmV0dXJuIGV2ZW50O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGVuYWJsZUluc3BlY3RQb3J0KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghIXRoaXMuX2luc3BlY3RMaXN0ZW5lcikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2Vzcykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzLmVuYWJsZUluc3BlY3RQb3J0KCk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlLnJhY2UoW0V2ZW50LnRvUHJvbWlzZSh0aGlzLl9vbkRpZFNldEluc3BlY3RQb3J0LmV2ZW50KSwgdGltZW91dCgxMDAwKV0pO1xuXHRcdHJldHVybiAhIXRoaXMuX2luc3BlY3RMaXN0ZW5lcjtcblx0fVxuXG5cdHB1YmxpYyBnZXRJbnNwZWN0UG9ydCgpOiBJRXh0ZW5zaW9uSW5zcGVjdEluZm8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9pbnNwZWN0TGlzdGVuZXIgPz8gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25XaWxsU2h1dGRvd24oZXZlbnQ6IFdpbGxTaHV0ZG93bkV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fbWFpblByb2Nlc3NIYW5kbGVzRXh0SG9zdFNodXRkb3duID0gdHJ1ZTtcblxuXHRcdC8vIElmIHRoZSBleHRlbnNpb24gZGV2ZWxvcG1lbnQgaG9zdCB3YXMgc3RhcnRlZCB3aXRob3V0IGRlYnVnZ2VyIGF0dGFjaGVkIHdlIG5lZWRcblx0XHQvLyB0byBjb21tdW5pY2F0ZSB0aGlzIGJhY2sgdG8gdGhlIG1haW4gc2lkZSB0byB0ZXJtaW5hdGUgdGhlIGRlYnVnIHNlc3Npb25cblx0XHRpZiAodGhpcy5faXNFeHRlbnNpb25EZXZIb3N0ICYmICF0aGlzLl9pc0V4dGVuc2lvbkRldlRlc3RGcm9tQ2xpICYmICF0aGlzLl9pc0V4dGVuc2lvbkRldkRlYnVnICYmIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5kZWJ1Z0V4dGVuc2lvbkhvc3QuZGVidWdJZCkge1xuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZS50ZXJtaW5hdGVTZXNzaW9uKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5kZWJ1Z0V4dGVuc2lvbkhvc3QuZGVidWdJZCk7XG5cdFx0XHRldmVudC5qb2luKHRpbWVvdXQoMTAwIC8qIHdhaXQgYSBiaXQgZm9yIElQQyB0byBnZXQgZGVsaXZlcmVkICovKSwgeyBpZDogJ2pvaW4uZXh0ZW5zaW9uRGV2ZWxvcG1lbnQnLCBsYWJlbDogbmxzLmxvY2FsaXplKCdqb2luLmV4dGVuc2lvbkRldmVsb3BtZW50JywgXCJUZXJtaW5hdGluZyBleHRlbnNpb24gZGVidWcgc2Vzc2lvblwiKSB9KTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsY0FBYyxnQkFBZ0I7QUFDdkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxZQUFZLGFBQWE7QUFDekIsWUFBWSxjQUFjO0FBQzFCLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUU3QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixZQUFZLFNBQVM7QUFDckIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywwQkFBd0QsNkJBQTZCO0FBQzlGLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0Isc0JBQXNCLGdCQUFnQjtBQUNyRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQixnQkFBZ0IsMkJBQTJCO0FBQzlFLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsOEJBQThCLDhCQUE4QjtBQUNyRSxTQUFTLHFCQUE2QyxhQUFhLGtCQUFrQixRQUFRLHVCQUF1QjtBQUVwSCxTQUFrQyxzQkFBNkQsb0RBQW9EO0FB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
