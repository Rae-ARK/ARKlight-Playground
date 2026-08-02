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
import * as fs from "fs";
import { exec } from "child_process";
import { timeout } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import * as path from "../../../base/common/path.js";
import { isLinux, isMacintosh, isWindows } from "../../../base/common/platform.js";
import { findExecutable } from "../../../base/node/processes.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { ILogService, LogLevel } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { FlowControlConstants, ProcessPropertyType, PosixShellType, GeneralShellType } from "../common/terminal.js";
import { ChildProcessMonitor } from "./childProcessMonitor.js";
import { getShellIntegrationInjection, sanitizeEnvForLogging } from "./terminalEnvironment.js";
import { WindowsShellHelper } from "./windowsShellHelper.js";
import { spawn } from "node-pty";
import { isNumber } from "../../../base/common/types.js";
import { getWindowsBuildNumberSync } from "../../../base/node/windowsVersion.js";
var ShutdownConstants = /* @__PURE__ */ ((ShutdownConstants2) => {
  ShutdownConstants2[ShutdownConstants2["DataFlushTimeout"] = 250] = "DataFlushTimeout";
  ShutdownConstants2[ShutdownConstants2["MaximumShutdownTime"] = 5e3] = "MaximumShutdownTime";
  return ShutdownConstants2;
})(ShutdownConstants || {});
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["KillSpawnThrottleInterval"] = 250] = "KillSpawnThrottleInterval";
  Constants2[Constants2["KillSpawnSpacingDuration"] = 50] = "KillSpawnSpacingDuration";
  return Constants2;
})(Constants || {});
const posixShellTypeMap = /* @__PURE__ */ new Map([
  ["bash", PosixShellType.Bash],
  ["csh", PosixShellType.Csh],
  ["fish", PosixShellType.Fish],
  ["ksh", PosixShellType.Ksh],
  ["sh", PosixShellType.Sh],
  ["zsh", PosixShellType.Zsh]
]);
const generalShellTypeMap = /* @__PURE__ */ new Map([
  ["claude", GeneralShellType.Claude],
  ["codex", GeneralShellType.Codex],
  ["commandcode", GeneralShellType.CommandCode],
  ["copilot", GeneralShellType.Copilot],
  ["gemini", GeneralShellType.Gemini],
  ["pwsh", GeneralShellType.PowerShell],
  ["powershell", GeneralShellType.PowerShell],
  ["python", GeneralShellType.Python],
  ["julia", GeneralShellType.Julia],
  ["nu", GeneralShellType.NuShell],
  ["node", GeneralShellType.Node],
  ["xonsh", GeneralShellType.Xonsh]
]);
let TerminalProcess = class extends Disposable {
  constructor(shellLaunchConfig, cwd, cols, rows, env, _executableEnv, _options, _logService, _productService) {
    super();
    this.shellLaunchConfig = shellLaunchConfig;
    this._executableEnv = _executableEnv;
    this._options = _options;
    this._logService = _logService;
    this._productService = _productService;
    this.id = 0;
    this.shouldPersist = false;
    this._properties = {
      cwd: "",
      initialCwd: "",
      fixedDimensions: { cols: void 0, rows: void 0 },
      title: "",
      shellType: void 0,
      hasChildProcesses: true,
      resolvedShellLaunchConfig: {},
      overrideDimensions: void 0,
      failedShellIntegrationActivation: false,
      usedShellIntegrationInjection: void 0,
      shellIntegrationInjectionFailureReason: void 0
    };
    this._currentTitle = "";
    this._isPtyPaused = false;
    this._unacknowledgedCharCount = 0;
    this._onProcessData = this._register(new Emitter());
    this.onProcessData = this._onProcessData.event;
    this._onProcessReady = this._register(new Emitter());
    this.onProcessReady = this._onProcessReady.event;
    this._onDidChangeProperty = this._register(new Emitter());
    this.onDidChangeProperty = this._onDidChangeProperty.event;
    this._onProcessExit = this._register(new Emitter());
    this.onProcessExit = this._onProcessExit.event;
    let name;
    if (isWindows) {
      name = path.basename(this.shellLaunchConfig.executable || "");
    } else {
      name = "xterm-256color";
    }
    this._initialCwd = cwd;
    this._properties[ProcessPropertyType.InitialCwd] = this._initialCwd;
    this._properties[ProcessPropertyType.Cwd] = this._initialCwd;
    const useConpty = process.platform === "win32" && getWindowsBuildNumberSync() >= 18309;
    const useConptyDll = useConpty && this._options.windowsUseConptyDll;
    this._ptyOptions = {
      name,
      cwd,
      // TODO: When node-pty is updated this cast can be removed
      env,
      cols,
      rows,
      useConpty,
      useConptyDll,
      // This option will force conpty to not redraw the whole viewport on launch
      conptyInheritCursor: useConpty && !!shellLaunchConfig.initialText
    };
    if (isWindows) {
      if (useConpty && cols === 0 && rows === 0 && this.shellLaunchConfig.executable?.endsWith("Git\\bin\\bash.exe")) {
        this._delayedResizer = this._register(new DelayedResizer());
        this._register(this._delayedResizer.onTrigger((dimensions) => {
          this._delayedResizer?.dispose();
          this._delayedResizer = void 0;
          if (dimensions.cols && dimensions.rows) {
            this.resize(dimensions.cols, dimensions.rows);
          }
        }));
      }
      this._register(this.onProcessReady((e) => {
        this._windowsShellHelper = this._register(new WindowsShellHelper(e.pid));
        this._register(this._windowsShellHelper.onShellTypeChanged((e2) => this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: e2 })));
        this._register(this._windowsShellHelper.onShellNameChanged((e2) => this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: e2 })));
      }));
    }
    this._register(toDisposable(() => {
      if (this._titleInterval) {
        clearInterval(this._titleInterval);
        this._titleInterval = void 0;
      }
    }));
    this._register(toDisposable(() => {
      this._ptyProcess = void 0;
      this._processStartupComplete = void 0;
    }));
  }
  get exitMessage() {
    return this._exitMessage;
  }
  get currentTitle() {
    return this._windowsShellHelper?.shellTitle || this._currentTitle;
  }
  get shellType() {
    return isWindows ? this._windowsShellHelper?.shellType : posixShellTypeMap.get(this._currentTitle) || generalShellTypeMap.get(this._currentTitle);
  }
  get hasChildProcesses() {
    return this._childProcessMonitor?.hasChildProcesses || false;
  }
  async start() {
    const results = await Promise.all([this._validateCwd(), this._validateExecutable()]);
    const firstError = results.find((r) => r !== void 0);
    if (firstError) {
      return firstError;
    }
    const injection = await getShellIntegrationInjection(this.shellLaunchConfig, this._options, this._ptyOptions.env, this._logService, this._productService);
    if (injection.type === "injection") {
      this._onDidChangeProperty.fire({ type: ProcessPropertyType.UsedShellIntegrationInjection, value: true });
      if (injection.envMixin) {
        for (const [key, value] of Object.entries(injection.envMixin)) {
          this._ptyOptions.env ||= {};
          this._ptyOptions.env[key] = value;
        }
      }
      if (injection.filesToCopy) {
        for (const f of injection.filesToCopy) {
          try {
            await fs.promises.mkdir(path.dirname(f.dest), { recursive: true });
            await fs.promises.copyFile(f.source, f.dest);
          } catch {
          }
        }
      }
    } else {
      this._onDidChangeProperty.fire({ type: ProcessPropertyType.FailedShellIntegrationActivation, value: true });
      this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellIntegrationInjectionFailureReason, value: injection.reason });
      if (this._options.shellIntegration.nonce) {
        this._ptyOptions.env ||= {};
        this._ptyOptions.env["VSCODE_NONCE"] = this._options.shellIntegration.nonce;
      }
    }
    try {
      const injectionConfig = injection.type === "injection" ? injection : void 0;
      await this.setupPtyProcess(this.shellLaunchConfig, this._ptyOptions, injectionConfig);
      if (injectionConfig?.newArgs) {
        return { injectedArgs: injectionConfig.newArgs };
      }
      return void 0;
    } catch (err) {
      this._logService.trace("node-pty.node-pty.IPty#spawn native exception", err);
      const errorMessage = err.message;
      if (errorMessage?.includes("Cannot launch conpty")) {
        return { message: localize("conptyLaunchFailed", "A native exception occurred during launch (Cannot launch conpty). Winpty has been removed, see {0} for more details. You can also try enabling the `{1}` setting.", "https://code.visualstudio.com/updates/v1_109#_removal-of-winpty-support", "terminal.integrated.windowsUseConptyDll") };
      }
      return { message: `A native exception occurred during launch (${errorMessage})` };
    }
  }
  async _validateCwd() {
    try {
      const result = await fs.promises.stat(this._initialCwd);
      if (!result.isDirectory()) {
        return { message: localize("launchFail.cwdNotDirectory", 'Starting directory (cwd) "{0}" is not a directory', this._initialCwd.toString()) };
      }
    } catch (err) {
      if (err?.code === "ENOENT") {
        return { message: localize("launchFail.cwdDoesNotExist", 'Starting directory (cwd) "{0}" does not exist', this._initialCwd.toString()) };
      }
    }
    this._onDidChangeProperty.fire({ type: ProcessPropertyType.InitialCwd, value: this._initialCwd });
    return void 0;
  }
  async _validateExecutable() {
    const slc = this.shellLaunchConfig;
    if (!slc.executable) {
      throw new Error("IShellLaunchConfig.executable not set");
    }
    const cwd = slc.cwd instanceof URI ? slc.cwd.path : slc.cwd;
    const envPaths = slc.env && slc.env.PATH ? slc.env.PATH.split(path.delimiter) : void 0;
    const executable = await findExecutable(slc.executable, cwd, envPaths, this._executableEnv);
    if (!executable) {
      return { message: localize("launchFail.executableDoesNotExist", 'Path to shell executable "{0}" does not exist', slc.executable) };
    }
    try {
      const result = await fs.promises.stat(executable);
      if (!result.isFile() && !result.isSymbolicLink()) {
        return { message: localize("launchFail.executableIsNotFileOrSymlink", 'Path to shell executable "{0}" is not a file or a symlink', slc.executable) };
      }
      slc.executable = executable;
    } catch (err) {
      if (err?.code === "EACCES") {
      } else {
        throw err;
      }
    }
    return void 0;
  }
  async setupPtyProcess(shellLaunchConfig, options, shellIntegrationInjection) {
    const args = shellIntegrationInjection?.newArgs || shellLaunchConfig.args || [];
    await this._throttleKillSpawn();
    const sanitizedOptions = { ...options, env: sanitizeEnvForLogging(options.env) };
    this._logService.trace("node-pty.IPty#spawn", shellLaunchConfig.executable, args, sanitizedOptions);
    const ptyProcess = spawn(shellLaunchConfig.executable, args, options);
    this._ptyProcess = ptyProcess;
    this._childProcessMonitor = this._register(new ChildProcessMonitor(ptyProcess.pid, this._logService));
    this._register(this._childProcessMonitor.onDidChangeHasChildProcesses((value) => this._onDidChangeProperty.fire({ type: ProcessPropertyType.HasChildProcesses, value })));
    this._processStartupComplete = new Promise((c) => {
      this._register(this.onProcessReady(() => c()));
    });
    this._register(ptyProcess.onData((data) => {
      this._unacknowledgedCharCount += data.length;
      if (!this._isPtyPaused && this._unacknowledgedCharCount > FlowControlConstants.HighWatermarkChars) {
        this._logService.trace(`Flow control: Pause (${this._unacknowledgedCharCount} > ${FlowControlConstants.HighWatermarkChars})`);
        this._isPtyPaused = true;
        ptyProcess.pause();
      }
      this._logService.trace("node-pty.IPty#onData", data);
      this._onProcessData.fire(data);
      if (this._closeTimeout) {
        this._queueProcessExit();
      }
      this._windowsShellHelper?.checkShell();
      this._childProcessMonitor?.handleOutput();
    }));
    this._register(ptyProcess.onExit((e) => {
      this._exitCode = e.exitCode;
      this._queueProcessExit();
    }));
    if (ptyProcess.pid > 0) {
      this._sendProcessId(ptyProcess.pid);
    } else {
      const dataListener = ptyProcess.onData(() => {
        dataListener.dispose();
        this._childProcessMonitor?.setPid(ptyProcess.pid);
        this._sendProcessId(ptyProcess.pid);
      });
      this._register(dataListener);
    }
    this._setupTitlePolling(ptyProcess);
  }
  _setupTitlePolling(ptyProcess) {
    setTimeout(() => this._sendProcessTitle(ptyProcess));
    if (!isWindows) {
      this._titleInterval = setInterval(() => {
        if (this._currentTitle !== ptyProcess.process) {
          this._sendProcessTitle(ptyProcess);
        }
      }, 200);
    }
  }
  // Allow any trailing data events to be sent before the exit event is sent.
  // See https://github.com/microsoft/node-pty/issues/72
  _queueProcessExit() {
    if (this._logService.getLevel() === LogLevel.Trace) {
      this._logService.trace("TerminalProcess#_queueProcessExit", new Error().stack?.replace(/^Error/, ""));
    }
    if (this._closeTimeout) {
      clearTimeout(this._closeTimeout);
    }
    this._closeTimeout = setTimeout(() => {
      this._closeTimeout = void 0;
      this._kill();
    }, 250 /* DataFlushTimeout */);
  }
  async _kill() {
    await this._processStartupComplete;
    if (this._store.isDisposed) {
      return;
    }
    try {
      if (this._ptyProcess) {
        await this._throttleKillSpawn();
        this._logService.trace("node-pty.IPty#kill");
        this._ptyProcess.kill();
      }
    } catch (ex) {
    }
    this._onProcessExit.fire(this._exitCode || 0);
    this.dispose();
  }
  async _throttleKillSpawn() {
    if (!isWindows || !hasConptyOption(this._ptyOptions) || !this._ptyOptions.useConpty) {
      return;
    }
    if (this._ptyOptions.useConptyDll) {
      return;
    }
    while (Date.now() - TerminalProcess._lastKillOrStart < 250 /* KillSpawnThrottleInterval */) {
      this._logService.trace("Throttling kill/spawn call");
      await timeout(250 /* KillSpawnThrottleInterval */ - (Date.now() - TerminalProcess._lastKillOrStart) + 50 /* KillSpawnSpacingDuration */);
    }
    TerminalProcess._lastKillOrStart = Date.now();
  }
  _sendProcessId(pid) {
    this._onProcessReady.fire({
      pid,
      cwd: this._initialCwd,
      windowsPty: this.getWindowsPty()
    });
  }
  _sendProcessTitle(ptyProcess) {
    if (this._store.isDisposed) {
      return;
    }
    this._currentTitle = ptyProcess.process ?? "";
    this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: this._currentTitle });
    let sanitizedTitle = this.currentTitle.replace(/ \(figterm\)$/g, "");
    if (!isWindows) {
      sanitizedTitle = path.basename(sanitizedTitle);
    }
    if (sanitizedTitle.toLowerCase().startsWith("python")) {
      this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: GeneralShellType.Python });
    } else if (sanitizedTitle.toLowerCase().startsWith("julia")) {
      this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: GeneralShellType.Julia });
    } else {
      const shellTypeValue = posixShellTypeMap.get(sanitizedTitle) || generalShellTypeMap.get(sanitizedTitle);
      this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: shellTypeValue });
    }
  }
  shutdown(immediate) {
    if (this._logService.getLevel() === LogLevel.Trace) {
      this._logService.trace("TerminalProcess#shutdown", new Error().stack?.replace(/^Error/, ""));
    }
    if (immediate && !isWindows) {
      this._kill();
    } else {
      if (!this._closeTimeout && !this._store.isDisposed) {
        this._queueProcessExit();
        setTimeout(() => {
          if (this._closeTimeout && !this._store.isDisposed) {
            this._closeTimeout = void 0;
            this._kill();
          }
        }, 5e3 /* MaximumShutdownTime */);
      }
    }
  }
  input(data, isBinary = false) {
    this._logService.trace("node-pty.IPty#write", data, isBinary);
    if (isBinary) {
      this._ptyProcess.write(Buffer.from(data, "binary"));
    } else {
      this._ptyProcess.write(data);
    }
    this._childProcessMonitor?.handleInput();
  }
  sendSignal(signal) {
    if (this._store.isDisposed || !this._ptyProcess) {
      return;
    }
    this._ptyProcess.kill(signal);
  }
  async processBinary(data) {
    this.input(data, true);
  }
  async refreshProperty(type) {
    switch (type) {
      case ProcessPropertyType.Cwd: {
        const newCwd = await this.getCwd();
        if (newCwd !== this._properties.cwd) {
          this._properties.cwd = newCwd;
          this._onDidChangeProperty.fire({ type: ProcessPropertyType.Cwd, value: this._properties.cwd });
        }
        return newCwd;
      }
      case ProcessPropertyType.InitialCwd: {
        const initialCwd = await this.getInitialCwd();
        if (initialCwd !== this._properties.initialCwd) {
          this._properties.initialCwd = initialCwd;
          this._onDidChangeProperty.fire({ type: ProcessPropertyType.InitialCwd, value: this._properties.initialCwd });
        }
        return initialCwd;
      }
      case ProcessPropertyType.Title:
        return this.currentTitle;
      default:
        return this.shellType;
    }
  }
  async updateProperty(type, value) {
    if (type === ProcessPropertyType.FixedDimensions) {
      this._properties.fixedDimensions = value;
    }
  }
  resize(cols, rows, pixelWidth, pixelHeight) {
    if (this._store.isDisposed) {
      return;
    }
    if (!isNumber(cols) || !isNumber(rows)) {
      return;
    }
    if (this._ptyProcess) {
      cols = Math.max(cols, 1);
      rows = Math.max(rows, 1);
      if (this._delayedResizer) {
        this._delayedResizer.cols = cols;
        this._delayedResizer.rows = rows;
        return;
      }
      this._logService.trace("node-pty.IPty#resize", cols, rows);
      try {
        const pixelSize = pixelWidth !== void 0 && pixelHeight !== void 0 ? { width: pixelWidth, height: pixelHeight } : void 0;
        this._ptyProcess.resize(cols, rows, pixelSize);
      } catch (e) {
        this._logService.trace("node-pty.IPty#resize exception " + e.message);
        if (this._exitCode !== void 0 && e.message !== "ioctl(2) failed, EBADF" && e.message !== "Cannot resize a pty that has already exited") {
          throw e;
        }
      }
    }
  }
  clearBuffer() {
    this._ptyProcess?.clear();
  }
  acknowledgeDataEvent(charCount) {
    this._unacknowledgedCharCount = Math.max(this._unacknowledgedCharCount - charCount, 0);
    this._logService.trace(`Flow control: Ack ${charCount} chars (unacknowledged: ${this._unacknowledgedCharCount})`);
    if (this._isPtyPaused && this._unacknowledgedCharCount < FlowControlConstants.LowWatermarkChars) {
      this._logService.trace(`Flow control: Resume (${this._unacknowledgedCharCount} < ${FlowControlConstants.LowWatermarkChars})`);
      this._ptyProcess?.resume();
      this._isPtyPaused = false;
    }
  }
  clearUnacknowledgedChars() {
    this._unacknowledgedCharCount = 0;
    this._logService.trace(`Flow control: Cleared all unacknowledged chars, forcing resume`);
    if (this._isPtyPaused) {
      this._ptyProcess?.resume();
      this._isPtyPaused = false;
    }
  }
  async setUnicodeVersion(version) {
  }
  getInitialCwd() {
    return Promise.resolve(this._initialCwd);
  }
  async getCwd() {
    if (isMacintosh) {
      return new Promise((resolve) => {
        if (!this._ptyProcess) {
          resolve(this._initialCwd);
          return;
        }
        this._logService.trace("node-pty.IPty#pid");
        exec("lsof -OPln -p " + this._ptyProcess.pid + " | grep cwd", { env: { ...process.env, LANG: "en_US.UTF-8" } }, (error, stdout, stderr) => {
          if (!error && stdout !== "") {
            resolve(stdout.substring(stdout.indexOf("/"), stdout.length - 1));
          } else {
            this._logService.error("lsof did not run successfully, it may not be on the $PATH?", error, stdout, stderr);
            resolve(this._initialCwd);
          }
        });
      });
    }
    if (isLinux) {
      if (!this._ptyProcess) {
        return this._initialCwd;
      }
      this._logService.trace("node-pty.IPty#pid");
      try {
        return await fs.promises.readlink(`/proc/${this._ptyProcess.pid}/cwd`);
      } catch (error) {
        return this._initialCwd;
      }
    }
    return this._initialCwd;
  }
  getWindowsPty() {
    return isWindows ? {
      backend: "conpty",
      buildNumber: getWindowsBuildNumberSync()
    } : void 0;
  }
};
TerminalProcess._lastKillOrStart = 0;
TerminalProcess = __decorateClass([
  __decorateParam(7, ILogService),
  __decorateParam(8, IProductService)
], TerminalProcess);
class DelayedResizer extends Disposable {
  constructor() {
    super();
    this._onTrigger = this._register(new Emitter());
    this._timeout = setTimeout(() => {
      this._onTrigger.fire({ rows: this.rows, cols: this.cols });
    }, 1e3);
    this._register(toDisposable(() => clearTimeout(this._timeout)));
  }
  get onTrigger() {
    return this._onTrigger.event;
  }
}
function hasConptyOption(obj) {
  return "useConpty" in obj;
}
export {
  TerminalProcess
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvdGVybWluYWxQcm9jZXNzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHsgZXhlYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0Vudmlyb25tZW50LCBpc0xpbnV4LCBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZmluZEV4ZWN1dGFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcHJvY2Vzc2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBGbG93Q29udHJvbENvbnN0YW50cywgSVNoZWxsTGF1bmNoQ29uZmlnLCBJVGVybWluYWxDaGlsZFByb2Nlc3MsIElUZXJtaW5hbExhdW5jaEVycm9yLCBJUHJvY2Vzc1Byb3BlcnR5LCBJUHJvY2Vzc1Byb3BlcnR5TWFwLCBQcm9jZXNzUHJvcGVydHlUeXBlLCBUZXJtaW5hbFNoZWxsVHlwZSwgSVByb2Nlc3NSZWFkeUV2ZW50LCBJVGVybWluYWxQcm9jZXNzT3B0aW9ucywgUG9zaXhTaGVsbFR5cGUsIElQcm9jZXNzUmVhZHlXaW5kb3dzUHR5LCBHZW5lcmFsU2hlbGxUeXBlLCBJVGVybWluYWxMYXVuY2hSZXN1bHQgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgQ2hpbGRQcm9jZXNzTW9uaXRvciB9IGZyb20gJy4vY2hpbGRQcm9jZXNzTW9uaXRvci5qcyc7XG5pbXBvcnQgeyBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uLCBJU2hlbGxJbnRlZ3JhdGlvbkNvbmZpZ0luamVjdGlvbiwgc2FuaXRpemVFbnZGb3JMb2dnaW5nIH0gZnJvbSAnLi90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IFdpbmRvd3NTaGVsbEhlbHBlciB9IGZyb20gJy4vd2luZG93c1NoZWxsSGVscGVyLmpzJztcbmltcG9ydCB7IElQdHksIElQdHlGb3JrT3B0aW9ucywgSVdpbmRvd3NQdHlGb3JrT3B0aW9ucywgc3Bhd24gfSBmcm9tICdub2RlLXB0eSc7XG5pbXBvcnQgeyBpc051bWJlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGdldFdpbmRvd3NCdWlsZE51bWJlclN5bmMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvd2luZG93c1ZlcnNpb24uanMnO1xuXG5jb25zdCBlbnVtIFNodXRkb3duQ29uc3RhbnRzIHtcblx0LyoqXG5cdCAqIFRoZSBhbW91bnQgb2YgbXMgdGhhdCBtdXN0IHBhc3MgYmV0d2VlbiBkYXRhIGV2ZW50cyBhZnRlciBleGl0IGlzIHF1ZXVlZCBiZWZvcmUgdGhlIGFjdHVhbFxuXHQgKiBraWxsIGNhbGwgaXMgdHJpZ2dlcmVkLiBUaGlzIGRhdGEgZmx1c2ggbWVjaGFuaXNtIHdvcmtzIGFyb3VuZCBhbiBbaXNzdWUgaW4gbm9kZS1wdHldWzFdXG5cdCAqIHdoZXJlIG5vdCBhbGwgZGF0YSBpcyBmbHVzaGVkIHdoaWNoIGNhdXNlcyBwcm9ibGVtcyBmb3IgdGFzayBwcm9ibGVtIG1hdGNoZXJzLiBBZGRpdGlvbmFsbHlcblx0ICogb24gV2luZG93cyB1bmRlciBjb25wdHksIGtpbGxpbmcgYSBwcm9jZXNzIHdoaWxlIGRhdGEgaXMgYmVpbmcgb3V0cHV0IHdpbGwgY2F1c2UgdGhlIFtjb25ob3N0XG5cdCAqIGZsdXNoIHRvIGhhbmcgdGhlIHB0eSBob3N0XVsyXSBiZWNhdXNlIFtjb25ob3N0IHNob3VsZCBiZSBob3N0ZWQgb24gYW5vdGhlciB0aHJlYWRdWzNdLlxuXHQgKlxuXHQgKiBbMV06IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvbm9kZS1wdHkvaXNzdWVzLzcyXG5cdCAqIFsyXTogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzcxOTY2XG5cdCAqIFszXTogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC9ub2RlLXB0eS9wdWxsLzQxNVxuXHQgKi9cblx0RGF0YUZsdXNoVGltZW91dCA9IDI1MCxcblx0LyoqXG5cdCAqIFRoZSBtYXhpbXVtIG1zIHRvIGFsbG93IGFmdGVyIGRpc3Bvc2UgaXMgY2FsbGVkIGJlY2F1c2UgZm9yY2VmdWxseSBraWxsaW5nIHRoZSBwcm9jZXNzLlxuXHQgKi9cblx0TWF4aW11bVNodXRkb3duVGltZSA9IDUwMDBcbn1cblxuY29uc3QgZW51bSBDb25zdGFudHMge1xuXHQvKipcblx0ICogVGhlIG1pbmltdW0gZHVyYXRpb24gYmV0d2VlbiBraWxsIGFuZCBzcGF3biBjYWxscyBvbiBXaW5kb3dzL2NvbnB0eSBhcyBhIG1pdGlnYXRpb24gZm9yIGFcblx0ICogaGFuZyBpc3N1ZS4gU2VlOlxuXHQgKiAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy83MTk2NlxuXHQgKiAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTc5NTZcblx0ICogLSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTIxMzM2XG5cdCAqL1xuXHRLaWxsU3Bhd25UaHJvdHRsZUludGVydmFsID0gMjUwLFxuXHQvKipcblx0ICogVGhlIGFtb3VudCBvZiB0aW1lIHRvIHdhaXQgd2hlbiBhIGNhbGwgaXMgdGhyb3R0bGVkIGJleW9uZCB0aGUgZXhhY3QgYW1vdW50LCB0aGlzIGlzIHVzZWQgdG9cblx0ICogdHJ5IHByZXZlbnQgZWFybHkgdGltZW91dHMgY2F1c2luZyBhIGtpbGwvc3Bhd24gY2FsbCB0byBoYXBwZW4gYXQgZG91YmxlIHRoZSByZWd1bGFyXG5cdCAqIGludGVydmFsLlxuXHQgKi9cblx0S2lsbFNwYXduU3BhY2luZ0R1cmF0aW9uID0gNTAsXG59XG5cbmNvbnN0IHBvc2l4U2hlbGxUeXBlTWFwID0gbmV3IE1hcDxzdHJpbmcsIFBvc2l4U2hlbGxUeXBlPihbXG5cdFsnYmFzaCcsIFBvc2l4U2hlbGxUeXBlLkJhc2hdLFxuXHRbJ2NzaCcsIFBvc2l4U2hlbGxUeXBlLkNzaF0sXG5cdFsnZmlzaCcsIFBvc2l4U2hlbGxUeXBlLkZpc2hdLFxuXHRbJ2tzaCcsIFBvc2l4U2hlbGxUeXBlLktzaF0sXG5cdFsnc2gnLCBQb3NpeFNoZWxsVHlwZS5TaF0sXG5cdFsnenNoJywgUG9zaXhTaGVsbFR5cGUuWnNoXVxuXSk7XG5cbmNvbnN0IGdlbmVyYWxTaGVsbFR5cGVNYXAgPSBuZXcgTWFwPHN0cmluZywgR2VuZXJhbFNoZWxsVHlwZT4oW1xuXHRbJ2NsYXVkZScsIEdlbmVyYWxTaGVsbFR5cGUuQ2xhdWRlXSxcblx0Wydjb2RleCcsIEdlbmVyYWxTaGVsbFR5cGUuQ29kZXhdLFxuXHRbJ2NvbW1hbmRjb2RlJywgR2VuZXJhbFNoZWxsVHlwZS5Db21tYW5kQ29kZV0sXG5cdFsnY29waWxvdCcsIEdlbmVyYWxTaGVsbFR5cGUuQ29waWxvdF0sXG5cdFsnZ2VtaW5pJywgR2VuZXJhbFNoZWxsVHlwZS5HZW1pbmldLFxuXHRbJ3B3c2gnLCBHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGxdLFxuXHRbJ3Bvd2Vyc2hlbGwnLCBHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGxdLFxuXHRbJ3B5dGhvbicsIEdlbmVyYWxTaGVsbFR5cGUuUHl0aG9uXSxcblx0WydqdWxpYScsIEdlbmVyYWxTaGVsbFR5cGUuSnVsaWFdLFxuXHRbJ251JywgR2VuZXJhbFNoZWxsVHlwZS5OdVNoZWxsXSxcblx0Wydub2RlJywgR2VuZXJhbFNoZWxsVHlwZS5Ob2RlXSxcblx0Wyd4b25zaCcsIEdlbmVyYWxTaGVsbFR5cGUuWG9uc2hdLFxuXSk7XG5leHBvcnQgY2xhc3MgVGVybWluYWxQcm9jZXNzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXJtaW5hbENoaWxkUHJvY2VzcyB7XG5cdHJlYWRvbmx5IGlkID0gMDtcblx0cmVhZG9ubHkgc2hvdWxkUGVyc2lzdCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX3Byb3BlcnRpZXM6IElQcm9jZXNzUHJvcGVydHlNYXAgPSB7XG5cdFx0Y3dkOiAnJyxcblx0XHRpbml0aWFsQ3dkOiAnJyxcblx0XHRmaXhlZERpbWVuc2lvbnM6IHsgY29sczogdW5kZWZpbmVkLCByb3dzOiB1bmRlZmluZWQgfSxcblx0XHR0aXRsZTogJycsXG5cdFx0c2hlbGxUeXBlOiB1bmRlZmluZWQsXG5cdFx0aGFzQ2hpbGRQcm9jZXNzZXM6IHRydWUsXG5cdFx0cmVzb2x2ZWRTaGVsbExhdW5jaENvbmZpZzoge30sXG5cdFx0b3ZlcnJpZGVEaW1lbnNpb25zOiB1bmRlZmluZWQsXG5cdFx0ZmFpbGVkU2hlbGxJbnRlZ3JhdGlvbkFjdGl2YXRpb246IGZhbHNlLFxuXHRcdHVzZWRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uOiB1bmRlZmluZWQsXG5cdFx0c2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb246IHVuZGVmaW5lZCxcblx0fTtcblx0cHJpdmF0ZSBzdGF0aWMgX2xhc3RLaWxsT3JTdGFydCA9IDA7XG5cdHByaXZhdGUgX2V4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2V4aXRNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Nsb3NlVGltZW91dDogVGltZW91dCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHR5UHJvY2VzczogSVB0eSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3VycmVudFRpdGxlOiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBfcHJvY2Vzc1N0YXJ0dXBDb21wbGV0ZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfd2luZG93c1NoZWxsSGVscGVyOiBXaW5kb3dzU2hlbGxIZWxwZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NoaWxkUHJvY2Vzc01vbml0b3I6IENoaWxkUHJvY2Vzc01vbml0b3IgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3RpdGxlSW50ZXJ2YWw6IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RlbGF5ZWRSZXNpemVyOiBEZWxheWVkUmVzaXplciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5pdGlhbEN3ZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wdHlPcHRpb25zOiBJUHR5Rm9ya09wdGlvbnMgfCBJV2luZG93c1B0eUZvcmtPcHRpb25zO1xuXG5cdHByaXZhdGUgX2lzUHR5UGF1c2VkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3VuYWNrbm93bGVkZ2VkQ2hhckNvdW50OiBudW1iZXIgPSAwO1xuXHRnZXQgZXhpdE1lc3NhZ2UoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2V4aXRNZXNzYWdlOyB9XG5cblx0Z2V0IGN1cnJlbnRUaXRsZSgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fd2luZG93c1NoZWxsSGVscGVyPy5zaGVsbFRpdGxlIHx8IHRoaXMuX2N1cnJlbnRUaXRsZTsgfVxuXHRnZXQgc2hlbGxUeXBlKCk6IFRlcm1pbmFsU2hlbGxUeXBlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIGlzV2luZG93cyA/IHRoaXMuX3dpbmRvd3NTaGVsbEhlbHBlcj8uc2hlbGxUeXBlIDogcG9zaXhTaGVsbFR5cGVNYXAuZ2V0KHRoaXMuX2N1cnJlbnRUaXRsZSkgfHwgZ2VuZXJhbFNoZWxsVHlwZU1hcC5nZXQodGhpcy5fY3VycmVudFRpdGxlKTsgfVxuXHRnZXQgaGFzQ2hpbGRQcm9jZXNzZXMoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9jaGlsZFByb2Nlc3NNb25pdG9yPy5oYXNDaGlsZFByb2Nlc3NlcyB8fCBmYWxzZTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc0RhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NEYXRhID0gdGhpcy5fb25Qcm9jZXNzRGF0YS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzUmVhZHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUHJvY2Vzc1JlYWR5RXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NSZWFkeSA9IHRoaXMuX29uUHJvY2Vzc1JlYWR5LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVByb3BlcnR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVByb2Nlc3NQcm9wZXJ0eT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvcGVydHkgPSB0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NFeGl0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzRXhpdCA9IHRoaXMuX29uUHJvY2Vzc0V4aXQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyxcblx0XHRjd2Q6IHN0cmluZyxcblx0XHRjb2xzOiBudW1iZXIsXG5cdFx0cm93czogbnVtYmVyLFxuXHRcdGVudjogSVByb2Nlc3NFbnZpcm9ubWVudCxcblx0XHQvKipcblx0XHQgKiBlbnZpcm9ubWVudCB1c2VkIGZvciBgZmluZEV4ZWN1dGFibGVgXG5cdFx0ICovXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXhlY3V0YWJsZUVudjogSVByb2Nlc3NFbnZpcm9ubWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJVGVybWluYWxQcm9jZXNzT3B0aW9ucyxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0bGV0IG5hbWU6IHN0cmluZztcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRuYW1lID0gcGF0aC5iYXNlbmFtZSh0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUgfHwgJycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBVc2luZyAneHRlcm0tMjU2Y29sb3InIGhlcmUgaGVscHMgZW5zdXJlIHRoYXQgdGhlIG1ham9yaXR5IG9mIExpbnV4IGRpc3RyaWJ1dGlvbnMgd2lsbCB1c2UgYVxuXHRcdFx0Ly8gY29sb3IgcHJvbXB0IGFzIGRlZmluZWQgaW4gdGhlIGRlZmF1bHQgfi8uYmFzaHJjIGZpbGUuXG5cdFx0XHRuYW1lID0gJ3h0ZXJtLTI1NmNvbG9yJztcblx0XHR9XG5cdFx0dGhpcy5faW5pdGlhbEN3ZCA9IGN3ZDtcblx0XHR0aGlzLl9wcm9wZXJ0aWVzW1Byb2Nlc3NQcm9wZXJ0eVR5cGUuSW5pdGlhbEN3ZF0gPSB0aGlzLl9pbml0aWFsQ3dkO1xuXHRcdHRoaXMuX3Byb3BlcnRpZXNbUHJvY2Vzc1Byb3BlcnR5VHlwZS5Dd2RdID0gdGhpcy5faW5pdGlhbEN3ZDtcblx0XHRjb25zdCB1c2VDb25wdHkgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInICYmIGdldFdpbmRvd3NCdWlsZE51bWJlclN5bmMoKSA+PSAxODMwOTtcblx0XHRjb25zdCB1c2VDb25wdHlEbGwgPSB1c2VDb25wdHkgJiYgdGhpcy5fb3B0aW9ucy53aW5kb3dzVXNlQ29ucHR5RGxsO1xuXHRcdHRoaXMuX3B0eU9wdGlvbnMgPSB7XG5cdFx0XHRuYW1lLFxuXHRcdFx0Y3dkLFxuXHRcdFx0Ly8gVE9ETzogV2hlbiBub2RlLXB0eSBpcyB1cGRhdGVkIHRoaXMgY2FzdCBjYW4gYmUgcmVtb3ZlZFxuXHRcdFx0ZW52OiBlbnYgYXMgeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSxcblx0XHRcdGNvbHMsXG5cdFx0XHRyb3dzLFxuXHRcdFx0dXNlQ29ucHR5LFxuXHRcdFx0dXNlQ29ucHR5RGxsLFxuXHRcdFx0Ly8gVGhpcyBvcHRpb24gd2lsbCBmb3JjZSBjb25wdHkgdG8gbm90IHJlZHJhdyB0aGUgd2hvbGUgdmlld3BvcnQgb24gbGF1bmNoXG5cdFx0XHRjb25wdHlJbmhlcml0Q3Vyc29yOiB1c2VDb25wdHkgJiYgISFzaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dFxuXHRcdH07XG5cdFx0Ly8gRGVsYXkgcmVzaXplcyB0byBhdm9pZCBjb25wdHkgbm90IHJlc3BlY3RpbmcgdmVyeSBlYXJseSByZXNpemUgY2FsbHNcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRpZiAodXNlQ29ucHR5ICYmIGNvbHMgPT09IDAgJiYgcm93cyA9PT0gMCAmJiB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGU/LmVuZHNXaXRoKCdHaXRcXFxcYmluXFxcXGJhc2guZXhlJykpIHtcblx0XHRcdFx0dGhpcy5fZGVsYXllZFJlc2l6ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllZFJlc2l6ZXIoKSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RlbGF5ZWRSZXNpemVyLm9uVHJpZ2dlcihkaW1lbnNpb25zID0+IHtcblx0XHRcdFx0XHR0aGlzLl9kZWxheWVkUmVzaXplcj8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMuX2RlbGF5ZWRSZXNpemVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChkaW1lbnNpb25zLmNvbHMgJiYgZGltZW5zaW9ucy5yb3dzKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnJlc2l6ZShkaW1lbnNpb25zLmNvbHMsIGRpbWVuc2lvbnMucm93cyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBXaW5kb3dzU2hlbGxIZWxwZXIgaXMgdXNlZCB0byBmZXRjaCB0aGUgcHJvY2VzcyB0aXRsZSBhbmQgc2hlbGwgdHlwZVxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vblByb2Nlc3NSZWFkeShlID0+IHtcblx0XHRcdFx0dGhpcy5fd2luZG93c1NoZWxsSGVscGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFdpbmRvd3NTaGVsbEhlbHBlcihlLnBpZCkpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93aW5kb3dzU2hlbGxIZWxwZXIub25TaGVsbFR5cGVDaGFuZ2VkKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5TaGVsbFR5cGUsIHZhbHVlOiBlIH0pKSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dpbmRvd3NTaGVsbEhlbHBlci5vblNoZWxsTmFtZUNoYW5nZWQoZSA9PiB0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmZpcmUoeyB0eXBlOiBQcm9jZXNzUHJvcGVydHlUeXBlLlRpdGxlLCB2YWx1ZTogZSB9KSkpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3RpdGxlSW50ZXJ2YWwpIHtcblx0XHRcdFx0Y2xlYXJJbnRlcnZhbCh0aGlzLl90aXRsZUludGVydmFsKTtcblx0XHRcdFx0dGhpcy5fdGl0bGVJbnRlcnZhbCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX3B0eVByb2Nlc3MgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9wcm9jZXNzU3RhcnR1cENvbXBsZXRlID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8SVRlcm1pbmFsTGF1bmNoRXJyb3IgfCBJVGVybWluYWxMYXVuY2hSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwoW3RoaXMuX3ZhbGlkYXRlQ3dkKCksIHRoaXMuX3ZhbGlkYXRlRXhlY3V0YWJsZSgpXSk7XG5cdFx0Y29uc3QgZmlyc3RFcnJvciA9IHJlc3VsdHMuZmluZChyID0+IHIgIT09IHVuZGVmaW5lZCk7XG5cdFx0aWYgKGZpcnN0RXJyb3IpIHtcblx0XHRcdHJldHVybiBmaXJzdEVycm9yO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluamVjdGlvbiA9IGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24odGhpcy5zaGVsbExhdW5jaENvbmZpZywgdGhpcy5fb3B0aW9ucywgdGhpcy5fcHR5T3B0aW9ucy5lbnYsIHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlKTtcblx0XHRpZiAoaW5qZWN0aW9uLnR5cGUgPT09ICdpbmplY3Rpb24nKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmZpcmUoeyB0eXBlOiBQcm9jZXNzUHJvcGVydHlUeXBlLlVzZWRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uLCB2YWx1ZTogdHJ1ZSB9KTtcblx0XHRcdGlmIChpbmplY3Rpb24uZW52TWl4aW4pIHtcblx0XHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoaW5qZWN0aW9uLmVudk1peGluKSkge1xuXHRcdFx0XHRcdHRoaXMuX3B0eU9wdGlvbnMuZW52IHx8PSB7fTtcblx0XHRcdFx0XHR0aGlzLl9wdHlPcHRpb25zLmVudltrZXldID0gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChpbmplY3Rpb24uZmlsZXNUb0NvcHkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBmIG9mIGluamVjdGlvbi5maWxlc1RvQ29weSkge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBmcy5wcm9taXNlcy5ta2RpcihwYXRoLmRpcm5hbWUoZi5kZXN0KSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHRhd2FpdCBmcy5wcm9taXNlcy5jb3B5RmlsZShmLnNvdXJjZSwgZi5kZXN0KTtcblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdC8vIFN3YWxsb3cgZXJyb3IsIHRoaXMgc2hvdWxkIG9ubHkgaGFwcGVuIHdoZW4gbXVsdGlwbGUgdXNlcnMgYXJlIG9uIHRoZSBzYW1lXG5cdFx0XHRcdFx0XHQvLyBtYWNoaW5lLiBTaW5jZSB0aGUgc2hlbGwgaW50ZWdyYXRpb24gc2NyaXB0cyByYXJlbHkgY2hhbmdlLCBwbHVzIHRoZSBvdGhlciB1c2VyXG5cdFx0XHRcdFx0XHQvLyBzaG91bGQgYmUgdXNpbmcgdGhlIHNhbWUgdmVyc2lvbiBvZiB0aGUgc2VydmVyIGluIHRoaXMgY2FzZSwgYXNzdW1lIHRoZSBzY3JpcHQgaXNcblx0XHRcdFx0XHRcdC8vIGZpbmUgaWYgY29weSBmYWlscyBhbmQgc3dhbGxvdyB0aGUgZXJyb3IuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuRmFpbGVkU2hlbGxJbnRlZ3JhdGlvbkFjdGl2YXRpb24sIHZhbHVlOiB0cnVlIH0pO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5TaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbiwgdmFsdWU6IGluamVjdGlvbi5yZWFzb24gfSk7XG5cdFx0XHQvLyBFdmVuIGlmIHNoZWxsIGludGVncmF0aW9uIGluamVjdGlvbiBmYWlsZWQsIHN0aWxsIHNldCB0aGUgbm9uY2UgaWYgb25lIHdhcyBwcm92aWRlZFxuXHRcdFx0Ly8gVGhpcyBhbGxvd3MgZXh0ZW5zaW9ucyB0byB1c2Ugc2hlbGwgaW50ZWdyYXRpb24gd2l0aCBjdXN0b20gc2hlbGxzXG5cdFx0XHRpZiAodGhpcy5fb3B0aW9ucy5zaGVsbEludGVncmF0aW9uLm5vbmNlKSB7XG5cdFx0XHRcdHRoaXMuX3B0eU9wdGlvbnMuZW52IHx8PSB7fTtcblx0XHRcdFx0dGhpcy5fcHR5T3B0aW9ucy5lbnZbJ1ZTQ09ERV9OT05DRSddID0gdGhpcy5fb3B0aW9ucy5zaGVsbEludGVncmF0aW9uLm5vbmNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpbmplY3Rpb25Db25maWc6IElTaGVsbEludGVncmF0aW9uQ29uZmlnSW5qZWN0aW9uIHwgdW5kZWZpbmVkID0gaW5qZWN0aW9uLnR5cGUgPT09ICdpbmplY3Rpb24nID8gaW5qZWN0aW9uIDogdW5kZWZpbmVkO1xuXHRcdFx0YXdhaXQgdGhpcy5zZXR1cFB0eVByb2Nlc3ModGhpcy5zaGVsbExhdW5jaENvbmZpZywgdGhpcy5fcHR5T3B0aW9ucywgaW5qZWN0aW9uQ29uZmlnKTtcblx0XHRcdGlmIChpbmplY3Rpb25Db25maWc/Lm5ld0FyZ3MpIHtcblx0XHRcdFx0cmV0dXJuIHsgaW5qZWN0ZWRBcmdzOiBpbmplY3Rpb25Db25maWcubmV3QXJncyB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ25vZGUtcHR5Lm5vZGUtcHR5LklQdHkjc3Bhd24gbmF0aXZlIGV4Y2VwdGlvbicsIGVycik7XG5cdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnIubWVzc2FnZTtcblx0XHRcdGlmIChlcnJvck1lc3NhZ2U/LmluY2x1ZGVzKCdDYW5ub3QgbGF1bmNoIGNvbnB0eScpKSB7XG5cdFx0XHRcdHJldHVybiB7IG1lc3NhZ2U6IGxvY2FsaXplKCdjb25wdHlMYXVuY2hGYWlsZWQnLCBcIkEgbmF0aXZlIGV4Y2VwdGlvbiBvY2N1cnJlZCBkdXJpbmcgbGF1bmNoIChDYW5ub3QgbGF1bmNoIGNvbnB0eSkuIFdpbnB0eSBoYXMgYmVlbiByZW1vdmVkLCBzZWUgezB9IGZvciBtb3JlIGRldGFpbHMuIFlvdSBjYW4gYWxzbyB0cnkgZW5hYmxpbmcgdGhlIGB7MX1gIHNldHRpbmcuXCIsICdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS91cGRhdGVzL3YxXzEwOSNfcmVtb3ZhbC1vZi13aW5wdHktc3VwcG9ydCcsICd0ZXJtaW5hbC5pbnRlZ3JhdGVkLndpbmRvd3NVc2VDb25wdHlEbGwnKSB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgbWVzc2FnZTogYEEgbmF0aXZlIGV4Y2VwdGlvbiBvY2N1cnJlZCBkdXJpbmcgbGF1bmNoICgke2Vycm9yTWVzc2FnZX0pYCB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3ZhbGlkYXRlQ3dkKCk6IFByb21pc2U8dW5kZWZpbmVkIHwgSVRlcm1pbmFsTGF1bmNoRXJyb3I+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZnMucHJvbWlzZXMuc3RhdCh0aGlzLl9pbml0aWFsQ3dkKTtcblx0XHRcdGlmICghcmVzdWx0LmlzRGlyZWN0b3J5KCkpIHtcblx0XHRcdFx0cmV0dXJuIHsgbWVzc2FnZTogbG9jYWxpemUoJ2xhdW5jaEZhaWwuY3dkTm90RGlyZWN0b3J5JywgXCJTdGFydGluZyBkaXJlY3RvcnkgKGN3ZCkgXFxcInswfVxcXCIgaXMgbm90IGEgZGlyZWN0b3J5XCIsIHRoaXMuX2luaXRpYWxDd2QudG9TdHJpbmcoKSkgfTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChlcnI/LmNvZGUgPT09ICdFTk9FTlQnKSB7XG5cdFx0XHRcdHJldHVybiB7IG1lc3NhZ2U6IGxvY2FsaXplKCdsYXVuY2hGYWlsLmN3ZERvZXNOb3RFeGlzdCcsIFwiU3RhcnRpbmcgZGlyZWN0b3J5IChjd2QpIFxcXCJ7MH1cXFwiIGRvZXMgbm90IGV4aXN0XCIsIHRoaXMuX2luaXRpYWxDd2QudG9TdHJpbmcoKSkgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5Jbml0aWFsQ3dkLCB2YWx1ZTogdGhpcy5faW5pdGlhbEN3ZCB9KTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdmFsaWRhdGVFeGVjdXRhYmxlKCk6IFByb21pc2U8dW5kZWZpbmVkIHwgSVRlcm1pbmFsTGF1bmNoRXJyb3I+IHtcblx0XHRjb25zdCBzbGMgPSB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnO1xuXHRcdGlmICghc2xjLmV4ZWN1dGFibGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSVNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUgbm90IHNldCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN3ZCA9IHNsYy5jd2QgaW5zdGFuY2VvZiBVUkkgPyBzbGMuY3dkLnBhdGggOiBzbGMuY3dkO1xuXHRcdGNvbnN0IGVudlBhdGhzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCA9IChzbGMuZW52ICYmIHNsYy5lbnYuUEFUSCkgPyBzbGMuZW52LlBBVEguc3BsaXQocGF0aC5kZWxpbWl0ZXIpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGV4ZWN1dGFibGUgPSBhd2FpdCBmaW5kRXhlY3V0YWJsZShzbGMuZXhlY3V0YWJsZSwgY3dkLCBlbnZQYXRocywgdGhpcy5fZXhlY3V0YWJsZUVudik7XG5cdFx0aWYgKCFleGVjdXRhYmxlKSB7XG5cdFx0XHRyZXR1cm4geyBtZXNzYWdlOiBsb2NhbGl6ZSgnbGF1bmNoRmFpbC5leGVjdXRhYmxlRG9lc05vdEV4aXN0JywgXCJQYXRoIHRvIHNoZWxsIGV4ZWN1dGFibGUgXFxcInswfVxcXCIgZG9lcyBub3QgZXhpc3RcIiwgc2xjLmV4ZWN1dGFibGUpIH07XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZzLnByb21pc2VzLnN0YXQoZXhlY3V0YWJsZSk7XG5cdFx0XHRpZiAoIXJlc3VsdC5pc0ZpbGUoKSAmJiAhcmVzdWx0LmlzU3ltYm9saWNMaW5rKCkpIHtcblx0XHRcdFx0cmV0dXJuIHsgbWVzc2FnZTogbG9jYWxpemUoJ2xhdW5jaEZhaWwuZXhlY3V0YWJsZUlzTm90RmlsZU9yU3ltbGluaycsIFwiUGF0aCB0byBzaGVsbCBleGVjdXRhYmxlIFxcXCJ7MH1cXFwiIGlzIG5vdCBhIGZpbGUgb3IgYSBzeW1saW5rXCIsIHNsYy5leGVjdXRhYmxlKSB9O1xuXHRcdFx0fVxuXHRcdFx0Ly8gU2V0IHRoZSBleGVjdXRhYmxlIGV4cGxpY2l0bHkgaGVyZSBzbyB0aGF0IG5vZGUtcHR5IGRvZXNuJ3QgbmVlZCB0byBzZWFyY2ggdGhlXG5cdFx0XHQvLyAkUEFUSCB0b28uXG5cdFx0XHRzbGMuZXhlY3V0YWJsZSA9IGV4ZWN1dGFibGU7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoZXJyPy5jb2RlID09PSAnRUFDQ0VTJykge1xuXHRcdFx0XHQvLyBTd2FsbG93XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNldHVwUHR5UHJvY2Vzcyhcblx0XHRzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLFxuXHRcdG9wdGlvbnM6IElQdHlGb3JrT3B0aW9ucyxcblx0XHRzaGVsbEludGVncmF0aW9uSW5qZWN0aW9uOiBJU2hlbGxJbnRlZ3JhdGlvbkNvbmZpZ0luamVjdGlvbiB8IHVuZGVmaW5lZFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhcmdzID0gc2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbj8ubmV3QXJncyB8fCBzaGVsbExhdW5jaENvbmZpZy5hcmdzIHx8IFtdO1xuXHRcdGF3YWl0IHRoaXMuX3Rocm90dGxlS2lsbFNwYXduKCk7XG5cdFx0Y29uc3Qgc2FuaXRpemVkT3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgZW52OiBzYW5pdGl6ZUVudkZvckxvZ2dpbmcob3B0aW9ucy5lbnYgYXMgSVByb2Nlc3NFbnZpcm9ubWVudCB8IHVuZGVmaW5lZCkgfTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdub2RlLXB0eS5JUHR5I3NwYXduJywgc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSwgYXJncywgc2FuaXRpemVkT3B0aW9ucyk7XG5cdFx0Y29uc3QgcHR5UHJvY2VzcyA9IHNwYXduKHNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUhLCBhcmdzLCBvcHRpb25zKTtcblx0XHR0aGlzLl9wdHlQcm9jZXNzID0gcHR5UHJvY2Vzcztcblx0XHR0aGlzLl9jaGlsZFByb2Nlc3NNb25pdG9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IENoaWxkUHJvY2Vzc01vbml0b3IocHR5UHJvY2Vzcy5waWQsIHRoaXMuX2xvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGlsZFByb2Nlc3NNb25pdG9yLm9uRGlkQ2hhbmdlSGFzQ2hpbGRQcm9jZXNzZXModmFsdWUgPT4gdGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5IYXNDaGlsZFByb2Nlc3NlcywgdmFsdWUgfSkpKTtcblx0XHR0aGlzLl9wcm9jZXNzU3RhcnR1cENvbXBsZXRlID0gbmV3IFByb21pc2U8dm9pZD4oYyA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uUHJvY2Vzc1JlYWR5KCgpID0+IGMoKSkpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHB0eVByb2Nlc3Mub25EYXRhKGRhdGEgPT4ge1xuXHRcdFx0Ly8gSGFuZGxlIGZsb3cgY29udHJvbFxuXHRcdFx0dGhpcy5fdW5hY2tub3dsZWRnZWRDaGFyQ291bnQgKz0gZGF0YS5sZW5ndGg7XG5cdFx0XHRpZiAoIXRoaXMuX2lzUHR5UGF1c2VkICYmIHRoaXMuX3VuYWNrbm93bGVkZ2VkQ2hhckNvdW50ID4gRmxvd0NvbnRyb2xDb25zdGFudHMuSGlnaFdhdGVybWFya0NoYXJzKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYEZsb3cgY29udHJvbDogUGF1c2UgKCR7dGhpcy5fdW5hY2tub3dsZWRnZWRDaGFyQ291bnR9ID4gJHtGbG93Q29udHJvbENvbnN0YW50cy5IaWdoV2F0ZXJtYXJrQ2hhcnN9KWApO1xuXHRcdFx0XHR0aGlzLl9pc1B0eVBhdXNlZCA9IHRydWU7XG5cdFx0XHRcdHB0eVByb2Nlc3MucGF1c2UoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVmaXJlIHRoZSBkYXRhIGV2ZW50XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdub2RlLXB0eS5JUHR5I29uRGF0YScsIGRhdGEpO1xuXHRcdFx0dGhpcy5fb25Qcm9jZXNzRGF0YS5maXJlKGRhdGEpO1xuXHRcdFx0aWYgKHRoaXMuX2Nsb3NlVGltZW91dCkge1xuXHRcdFx0XHR0aGlzLl9xdWV1ZVByb2Nlc3NFeGl0KCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl93aW5kb3dzU2hlbGxIZWxwZXI/LmNoZWNrU2hlbGwoKTtcblx0XHRcdHRoaXMuX2NoaWxkUHJvY2Vzc01vbml0b3I/LmhhbmRsZU91dHB1dCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihwdHlQcm9jZXNzLm9uRXhpdChlID0+IHtcblx0XHRcdHRoaXMuX2V4aXRDb2RlID0gZS5leGl0Q29kZTtcblx0XHRcdHRoaXMuX3F1ZXVlUHJvY2Vzc0V4aXQoKTtcblx0XHR9KSk7XG5cdFx0Ly8gbm9kZS1wdHkgPj0gMS4yLjAtYmV0YS4xMSBkZWZlcnMgY29ucHR5TmF0aXZlLmNvbm5lY3QoKSBvbiBXaW5kb3dzLCBzb1xuXHRcdC8vIHB0eVByb2Nlc3MucGlkIG1heSBiZSAwIGltbWVkaWF0ZWx5IGFmdGVyIHNwYXduLiBJbiB0aGF0IGNhc2Ugd2Ugd2FpdFxuXHRcdC8vIGZvciB0aGUgZmlyc3QgZGF0YSBldmVudCB3aGljaCBvbmx5IGZpcmVzIGFmdGVyIHRoZSBjb25uZWN0aW9uIGNvbXBsZXRlc1xuXHRcdC8vIGFuZCB0aGUgcmVhbCBwaWQgaXMgYXZhaWxhYmxlLiBTZWUgbWljcm9zb2Z0L25vZGUtcHR5Izg4NS5cblx0XHRpZiAocHR5UHJvY2Vzcy5waWQgPiAwKSB7XG5cdFx0XHR0aGlzLl9zZW5kUHJvY2Vzc0lkKHB0eVByb2Nlc3MucGlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZGF0YUxpc3RlbmVyID0gcHR5UHJvY2Vzcy5vbkRhdGEoKCkgPT4ge1xuXHRcdFx0XHRkYXRhTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9jaGlsZFByb2Nlc3NNb25pdG9yPy5zZXRQaWQocHR5UHJvY2Vzcy5waWQpO1xuXHRcdFx0XHR0aGlzLl9zZW5kUHJvY2Vzc0lkKHB0eVByb2Nlc3MucGlkKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZGF0YUxpc3RlbmVyKTtcblx0XHR9XG5cdFx0dGhpcy5fc2V0dXBUaXRsZVBvbGxpbmcocHR5UHJvY2Vzcyk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXR1cFRpdGxlUG9sbGluZyhwdHlQcm9jZXNzOiBJUHR5KSB7XG5cdFx0Ly8gU2VuZCBpbml0aWFsIHRpbWVvdXQgYXN5bmMgdG8gZ2l2ZSBldmVudCBsaXN0ZW5lcnMgYSBjaGFuY2UgdG8gaW5pdFxuXHRcdHNldFRpbWVvdXQoKCkgPT4gdGhpcy5fc2VuZFByb2Nlc3NUaXRsZShwdHlQcm9jZXNzKSk7XG5cdFx0Ly8gU2V0dXAgcG9sbGluZyBmb3Igbm9uLVdpbmRvd3MsIGZvciBXaW5kb3dzIGBwcm9jZXNzYCBkb2Vzbid0IGNoYW5nZVxuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHR0aGlzLl90aXRsZUludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fY3VycmVudFRpdGxlICE9PSBwdHlQcm9jZXNzLnByb2Nlc3MpIHtcblx0XHRcdFx0XHR0aGlzLl9zZW5kUHJvY2Vzc1RpdGxlKHB0eVByb2Nlc3MpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAyMDApO1xuXHRcdH1cblx0fVxuXG5cdC8vIEFsbG93IGFueSB0cmFpbGluZyBkYXRhIGV2ZW50cyB0byBiZSBzZW50IGJlZm9yZSB0aGUgZXhpdCBldmVudCBpcyBzZW50LlxuXHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC9ub2RlLXB0eS9pc3N1ZXMvNzJcblx0cHJpdmF0ZSBfcXVldWVQcm9jZXNzRXhpdCgpIHtcblx0XHRpZiAodGhpcy5fbG9nU2VydmljZS5nZXRMZXZlbCgpID09PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnVGVybWluYWxQcm9jZXNzI19xdWV1ZVByb2Nlc3NFeGl0JywgbmV3IEVycm9yKCkuc3RhY2s/LnJlcGxhY2UoL15FcnJvci8sICcnKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jbG9zZVRpbWVvdXQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9jbG9zZVRpbWVvdXQpO1xuXHRcdH1cblx0XHR0aGlzLl9jbG9zZVRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2Nsb3NlVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2tpbGwoKTtcblx0XHR9LCBTaHV0ZG93bkNvbnN0YW50cy5EYXRhRmx1c2hUaW1lb3V0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2tpbGwoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gV2FpdCB0byBraWxsIHRvIHByb2Nlc3MgdW50aWwgdGhlIHN0YXJ0IHVwIGNvZGUgaGFzIHJ1bi4gVGhpcyBwcmV2ZW50cyB1cyBmcm9tIGZpcmluZyBhIHByb2Nlc3MgZXhpdCBiZWZvcmUgYVxuXHRcdC8vIHByb2Nlc3Mgc3RhcnQuXG5cdFx0YXdhaXQgdGhpcy5fcHJvY2Vzc1N0YXJ0dXBDb21wbGV0ZTtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBBdHRlbXB0IHRvIGtpbGwgdGhlIHB0eSwgaXQgbWF5IGhhdmUgYWxyZWFkeSBiZWVuIGtpbGxlZCBhdCB0aGlzXG5cdFx0Ly8gcG9pbnQgYnV0IHdlIHdhbnQgdG8gbWFrZSBzdXJlXG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0aGlzLl9wdHlQcm9jZXNzKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Rocm90dGxlS2lsbFNwYXduKCk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ25vZGUtcHR5LklQdHkja2lsbCcpO1xuXHRcdFx0XHR0aGlzLl9wdHlQcm9jZXNzLmtpbGwoKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0Ly8gU3dhbGxvdywgdGhlIHB0eSBoYXMgYWxyZWFkeSBiZWVuIGtpbGxlZFxuXHRcdH1cblx0XHR0aGlzLl9vblByb2Nlc3NFeGl0LmZpcmUodGhpcy5fZXhpdENvZGUgfHwgMCk7XG5cdFx0dGhpcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF90aHJvdHRsZUtpbGxTcGF3bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBPbmx5IHRocm90dGxlIG9uIFdpbmRvd3MvY29ucHR5XG5cdFx0aWYgKCFpc1dpbmRvd3MgfHwgIWhhc0NvbnB0eU9wdGlvbih0aGlzLl9wdHlPcHRpb25zKSB8fCAhdGhpcy5fcHR5T3B0aW9ucy51c2VDb25wdHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRG9uJ3QgdGhyb3R0bGUgd2hlbiB1c2luZyBjb25wdHkuZGxsIGFzIGl0IHNlZW1zIHRvIGhhdmUgYmVlbiBmaXhlZCBpbiBsYXRlciB2ZXJzaW9uc1xuXHRcdGlmICh0aGlzLl9wdHlPcHRpb25zLnVzZUNvbnB0eURsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBVc2UgYSBsb29wIHRvIGVuc3VyZSBtdWx0aXBsZSBjYWxscyBpbiBhIHNpbmdsZSBpbnRlcnZhbCBzcGFjZSBvdXRcblx0XHR3aGlsZSAoRGF0ZS5ub3coKSAtIFRlcm1pbmFsUHJvY2Vzcy5fbGFzdEtpbGxPclN0YXJ0IDwgQ29uc3RhbnRzLktpbGxTcGF3blRocm90dGxlSW50ZXJ2YWwpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1Rocm90dGxpbmcga2lsbC9zcGF3biBjYWxsJyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KENvbnN0YW50cy5LaWxsU3Bhd25UaHJvdHRsZUludGVydmFsIC0gKERhdGUubm93KCkgLSBUZXJtaW5hbFByb2Nlc3MuX2xhc3RLaWxsT3JTdGFydCkgKyBDb25zdGFudHMuS2lsbFNwYXduU3BhY2luZ0R1cmF0aW9uKTtcblx0XHR9XG5cdFx0VGVybWluYWxQcm9jZXNzLl9sYXN0S2lsbE9yU3RhcnQgPSBEYXRlLm5vdygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZFByb2Nlc3NJZChwaWQ6IG51bWJlcikge1xuXHRcdHRoaXMuX29uUHJvY2Vzc1JlYWR5LmZpcmUoe1xuXHRcdFx0cGlkLFxuXHRcdFx0Y3dkOiB0aGlzLl9pbml0aWFsQ3dkLFxuXHRcdFx0d2luZG93c1B0eTogdGhpcy5nZXRXaW5kb3dzUHR5KClcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmRQcm9jZXNzVGl0bGUocHR5UHJvY2VzczogSVB0eSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEhBQ0s6IFRoZSBub2RlLXB0eSBBUEkgY2FuIHJldHVybiB1bmRlZmluZWQgc29tZWhvdyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjIyMzIzXG5cdFx0dGhpcy5fY3VycmVudFRpdGxlID0gKHB0eVByb2Nlc3MucHJvY2VzcyA/PyAnJyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5UaXRsZSwgdmFsdWU6IHRoaXMuX2N1cnJlbnRUaXRsZSB9KTtcblx0XHQvLyBJZiBmaWcgaXMgaW5zdGFsbGVkIGl0IG1heSBjaGFuZ2UgdGhlIHRpdGxlIG9mIHRoZSBwcm9jZXNzXG5cdFx0bGV0IHNhbml0aXplZFRpdGxlID0gdGhpcy5jdXJyZW50VGl0bGUucmVwbGFjZSgvIFxcKGZpZ3Rlcm1cXCkkL2csICcnKTtcblx0XHQvLyBFbnN1cmUgYW55IHByZWZpeGVkIHBhdGggaXMgcmVtb3ZlZCBzbyB0aGF0IHRoZSBleGVjdXRhYmxlIG5hbWUgc2luY2Ugd2UgdXNlIHRoaXMgdG9cblx0XHQvLyBkZXRlY3QgdGhlIHNoZWxsIHR5cGVcblx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0c2FuaXRpemVkVGl0bGUgPSBwYXRoLmJhc2VuYW1lKHNhbml0aXplZFRpdGxlKTtcblx0XHR9XG5cblx0XHRpZiAoc2FuaXRpemVkVGl0bGUudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKCdweXRob24nKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5TaGVsbFR5cGUsIHZhbHVlOiBHZW5lcmFsU2hlbGxUeXBlLlB5dGhvbiB9KTtcblx0XHR9IGVsc2UgaWYgKHNhbml0aXplZFRpdGxlLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnanVsaWEnKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5TaGVsbFR5cGUsIHZhbHVlOiBHZW5lcmFsU2hlbGxUeXBlLkp1bGlhIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzaGVsbFR5cGVWYWx1ZSA9IHBvc2l4U2hlbGxUeXBlTWFwLmdldChzYW5pdGl6ZWRUaXRsZSkgfHwgZ2VuZXJhbFNoZWxsVHlwZU1hcC5nZXQoc2FuaXRpemVkVGl0bGUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5TaGVsbFR5cGUsIHZhbHVlOiBzaGVsbFR5cGVWYWx1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRzaHV0ZG93bihpbW1lZGlhdGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbG9nU2VydmljZS5nZXRMZXZlbCgpID09PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnVGVybWluYWxQcm9jZXNzI3NodXRkb3duJywgbmV3IEVycm9yKCkuc3RhY2s/LnJlcGxhY2UoL15FcnJvci8sICcnKSk7XG5cdFx0fVxuXHRcdC8vIGRvbid0IGZvcmNlIGltbWVkaWF0ZSBkaXNwb3NhbCBvZiB0aGUgdGVybWluYWwgcHJvY2Vzc2VzIG9uIFdpbmRvd3MgYXMgYW4gYWRkaXRpb25hbFxuXHRcdC8vIG1pdGlnYXRpb24gZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy83MTk2NiB3aGljaCBjYXVzZXMgdGhlIHB0eSBob3N0XG5cdFx0Ly8gdG8gYmVjb21lIHVucmVzcG9uc2l2ZSwgZGlzY29ubmVjdGluZyBhbGwgdGVybWluYWxzIGFjcm9zcyBhbGwgd2luZG93cy5cblx0XHRpZiAoaW1tZWRpYXRlICYmICFpc1dpbmRvd3MpIHtcblx0XHRcdHRoaXMuX2tpbGwoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKCF0aGlzLl9jbG9zZVRpbWVvdXQgJiYgIXRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0dGhpcy5fcXVldWVQcm9jZXNzRXhpdCgpO1xuXHRcdFx0XHQvLyBBbGxvdyBhIG1heGltdW0gYW1vdW50IG9mIHRpbWUgZm9yIHRoZSBwcm9jZXNzIHRvIGV4aXQsIG90aGVyd2lzZSBmb3JjZSBraWxsIGl0XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9jbG9zZVRpbWVvdXQgJiYgIXRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2Nsb3NlVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHRoaXMuX2tpbGwoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIFNodXRkb3duQ29uc3RhbnRzLk1heGltdW1TaHV0ZG93blRpbWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlucHV0KGRhdGE6IHN0cmluZywgaXNCaW5hcnk6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ25vZGUtcHR5LklQdHkjd3JpdGUnLCBkYXRhLCBpc0JpbmFyeSk7XG5cdFx0aWYgKGlzQmluYXJ5KSB7XG5cdFx0XHR0aGlzLl9wdHlQcm9jZXNzIS53cml0ZShCdWZmZXIuZnJvbShkYXRhLCAnYmluYXJ5JykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9wdHlQcm9jZXNzIS53cml0ZShkYXRhKTtcblx0XHR9XG5cdFx0dGhpcy5fY2hpbGRQcm9jZXNzTW9uaXRvcj8uaGFuZGxlSW5wdXQoKTtcblx0fVxuXG5cdHNlbmRTaWduYWwoc2lnbmFsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCB8fCAhdGhpcy5fcHR5UHJvY2Vzcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wdHlQcm9jZXNzLmtpbGwoc2lnbmFsKTtcblx0fVxuXG5cdGFzeW5jIHByb2Nlc3NCaW5hcnkoZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5pbnB1dChkYXRhLCB0cnVlKTtcblx0fVxuXG5cdGFzeW5jIHJlZnJlc2hQcm9wZXJ0eTxUIGV4dGVuZHMgUHJvY2Vzc1Byb3BlcnR5VHlwZT4odHlwZTogVCk6IFByb21pc2U8SVByb2Nlc3NQcm9wZXJ0eU1hcFtUXT4ge1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBQcm9jZXNzUHJvcGVydHlUeXBlLkN3ZDoge1xuXHRcdFx0XHRjb25zdCBuZXdDd2QgPSBhd2FpdCB0aGlzLmdldEN3ZCgpO1xuXHRcdFx0XHRpZiAobmV3Q3dkICE9PSB0aGlzLl9wcm9wZXJ0aWVzLmN3ZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3BlcnRpZXMuY3dkID0gbmV3Q3dkO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuQ3dkLCB2YWx1ZTogdGhpcy5fcHJvcGVydGllcy5jd2QgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ld0N3ZCBhcyBJUHJvY2Vzc1Byb3BlcnR5TWFwW1RdO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBQcm9jZXNzUHJvcGVydHlUeXBlLkluaXRpYWxDd2Q6IHtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbEN3ZCA9IGF3YWl0IHRoaXMuZ2V0SW5pdGlhbEN3ZCgpO1xuXHRcdFx0XHRpZiAoaW5pdGlhbEN3ZCAhPT0gdGhpcy5fcHJvcGVydGllcy5pbml0aWFsQ3dkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJvcGVydGllcy5pbml0aWFsQ3dkID0gaW5pdGlhbEN3ZDtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmZpcmUoeyB0eXBlOiBQcm9jZXNzUHJvcGVydHlUeXBlLkluaXRpYWxDd2QsIHZhbHVlOiB0aGlzLl9wcm9wZXJ0aWVzLmluaXRpYWxDd2QgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGluaXRpYWxDd2QgYXMgSVByb2Nlc3NQcm9wZXJ0eU1hcFtUXTtcblx0XHRcdH1cblx0XHRcdGNhc2UgUHJvY2Vzc1Byb3BlcnR5VHlwZS5UaXRsZTpcblx0XHRcdFx0cmV0dXJuIHRoaXMuY3VycmVudFRpdGxlIGFzIElQcm9jZXNzUHJvcGVydHlNYXBbVF07XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5zaGVsbFR5cGUgYXMgSVByb2Nlc3NQcm9wZXJ0eU1hcFtUXTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB1cGRhdGVQcm9wZXJ0eTxUIGV4dGVuZHMgUHJvY2Vzc1Byb3BlcnR5VHlwZT4odHlwZTogVCwgdmFsdWU6IElQcm9jZXNzUHJvcGVydHlNYXBbVF0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodHlwZSA9PT0gUHJvY2Vzc1Byb3BlcnR5VHlwZS5GaXhlZERpbWVuc2lvbnMpIHtcblx0XHRcdHRoaXMuX3Byb3BlcnRpZXMuZml4ZWREaW1lbnNpb25zID0gdmFsdWUgYXMgSVByb2Nlc3NQcm9wZXJ0eU1hcFtQcm9jZXNzUHJvcGVydHlUeXBlLkZpeGVkRGltZW5zaW9uc107XG5cdFx0fVxuXHR9XG5cblx0cmVzaXplKGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyLCBwaXhlbFdpZHRoPzogbnVtYmVyLCBwaXhlbEhlaWdodD86IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghaXNOdW1iZXIoY29scykgfHwgIWlzTnVtYmVyKHJvd3MpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEVuc3VyZSB0aGF0IGNvbHMgYW5kIHJvd3MgYXJlIGFsd2F5cyA+PSAxLCB0aGlzIHByZXZlbnRzIGEgbmF0aXZlIGV4Y2VwdGlvbiBpbiB3aW5wdHkuXG5cdFx0Ly8gVE9ETzogSGFuZGxlIHRoaXMgZGlyZWN0bHkgb24gbm9kZS1wdHkgaW5zdGVhZDogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC9ub2RlLXB0eS9pc3N1ZXMvODc3XG5cdFx0aWYgKHRoaXMuX3B0eVByb2Nlc3MpIHtcblx0XHRcdGNvbHMgPSBNYXRoLm1heChjb2xzLCAxKTtcblx0XHRcdHJvd3MgPSBNYXRoLm1heChyb3dzLCAxKTtcblxuXHRcdFx0Ly8gRGVsYXkgcmVzaXplIGlmIG5lZWRlZFxuXHRcdFx0aWYgKHRoaXMuX2RlbGF5ZWRSZXNpemVyKSB7XG5cdFx0XHRcdHRoaXMuX2RlbGF5ZWRSZXNpemVyLmNvbHMgPSBjb2xzO1xuXHRcdFx0XHR0aGlzLl9kZWxheWVkUmVzaXplci5yb3dzID0gcm93cztcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdub2RlLXB0eS5JUHR5I3Jlc2l6ZScsIGNvbHMsIHJvd3MpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcGl4ZWxTaXplID0gcGl4ZWxXaWR0aCAhPT0gdW5kZWZpbmVkICYmIHBpeGVsSGVpZ2h0ICE9PSB1bmRlZmluZWRcblx0XHRcdFx0XHQ/IHsgd2lkdGg6IHBpeGVsV2lkdGgsIGhlaWdodDogcGl4ZWxIZWlnaHQgfVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9wdHlQcm9jZXNzLnJlc2l6ZShjb2xzLCByb3dzLCBwaXhlbFNpemUpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvLyBTd2FsbG93IGVycm9yIGlmIHRoZSBwdHkgaGFzIGFscmVhZHkgZXhpdGVkXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ25vZGUtcHR5LklQdHkjcmVzaXplIGV4Y2VwdGlvbiAnICsgZS5tZXNzYWdlKTtcblx0XHRcdFx0aWYgKHRoaXMuX2V4aXRDb2RlICE9PSB1bmRlZmluZWQgJiZcblx0XHRcdFx0XHRlLm1lc3NhZ2UgIT09ICdpb2N0bCgyKSBmYWlsZWQsIEVCQURGJyAmJlxuXHRcdFx0XHRcdGUubWVzc2FnZSAhPT0gJ0Nhbm5vdCByZXNpemUgYSBwdHkgdGhhdCBoYXMgYWxyZWFkeSBleGl0ZWQnKSB7XG5cdFx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNsZWFyQnVmZmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3B0eVByb2Nlc3M/LmNsZWFyKCk7XG5cdH1cblxuXHRhY2tub3dsZWRnZURhdGFFdmVudChjaGFyQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIFByZXZlbnQgbG93ZXIgdGhhbiAwIHRvIGhlYWwgZnJvbSBlcnJvcnNcblx0XHR0aGlzLl91bmFja25vd2xlZGdlZENoYXJDb3VudCA9IE1hdGgubWF4KHRoaXMuX3VuYWNrbm93bGVkZ2VkQ2hhckNvdW50IC0gY2hhckNvdW50LCAwKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBGbG93IGNvbnRyb2w6IEFjayAke2NoYXJDb3VudH0gY2hhcnMgKHVuYWNrbm93bGVkZ2VkOiAke3RoaXMuX3VuYWNrbm93bGVkZ2VkQ2hhckNvdW50fSlgKTtcblx0XHRpZiAodGhpcy5faXNQdHlQYXVzZWQgJiYgdGhpcy5fdW5hY2tub3dsZWRnZWRDaGFyQ291bnQgPCBGbG93Q29udHJvbENvbnN0YW50cy5Mb3dXYXRlcm1hcmtDaGFycykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgRmxvdyBjb250cm9sOiBSZXN1bWUgKCR7dGhpcy5fdW5hY2tub3dsZWRnZWRDaGFyQ291bnR9IDwgJHtGbG93Q29udHJvbENvbnN0YW50cy5Mb3dXYXRlcm1hcmtDaGFyc30pYCk7XG5cdFx0XHR0aGlzLl9wdHlQcm9jZXNzPy5yZXN1bWUoKTtcblx0XHRcdHRoaXMuX2lzUHR5UGF1c2VkID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXJVbmFja25vd2xlZGdlZENoYXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VuYWNrbm93bGVkZ2VkQ2hhckNvdW50ID0gMDtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBGbG93IGNvbnRyb2w6IENsZWFyZWQgYWxsIHVuYWNrbm93bGVkZ2VkIGNoYXJzLCBmb3JjaW5nIHJlc3VtZWApO1xuXHRcdGlmICh0aGlzLl9pc1B0eVBhdXNlZCkge1xuXHRcdFx0dGhpcy5fcHR5UHJvY2Vzcz8ucmVzdW1lKCk7XG5cdFx0XHR0aGlzLl9pc1B0eVBhdXNlZCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldFVuaWNvZGVWZXJzaW9uKHZlcnNpb246ICc2JyB8ICcxMScpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBOby1vcFxuXHR9XG5cblx0Z2V0SW5pdGlhbEN3ZCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5faW5pdGlhbEN3ZCk7XG5cdH1cblxuXHRhc3luYyBnZXRDd2QoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdC8vIEZyb20gQmlnIFN1ciAoZGFyd2luIHYyMCkgdGhlcmUgaXMgYSBzcGF3biBibG9ja2luZyB0aHJlYWQgaXNzdWUgb24gRWxlY3Ryb24sXG5cdFx0XHQvLyB0aGlzIGlzIGZpeGVkIGluIFZTIENvZGUncyBpbnRlcm5hbCBFbGVjdHJvbi5cblx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9NaWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDU0NDZcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX3B0eVByb2Nlc3MpIHtcblx0XHRcdFx0XHRyZXNvbHZlKHRoaXMuX2luaXRpYWxDd2QpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdub2RlLXB0eS5JUHR5I3BpZCcpO1xuXHRcdFx0XHRleGVjKCdsc29mIC1PUGxuIC1wICcgKyB0aGlzLl9wdHlQcm9jZXNzLnBpZCArICcgfCBncmVwIGN3ZCcsIHsgZW52OiB7IC4uLnByb2Nlc3MuZW52LCBMQU5HOiAnZW5fVVMuVVRGLTgnIH0gfSwgKGVycm9yLCBzdGRvdXQsIHN0ZGVycikgPT4ge1xuXHRcdFx0XHRcdGlmICghZXJyb3IgJiYgc3Rkb3V0ICE9PSAnJykge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZShzdGRvdXQuc3Vic3RyaW5nKHN0ZG91dC5pbmRleE9mKCcvJyksIHN0ZG91dC5sZW5ndGggLSAxKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ2xzb2YgZGlkIG5vdCBydW4gc3VjY2Vzc2Z1bGx5LCBpdCBtYXkgbm90IGJlIG9uIHRoZSAkUEFUSD8nLCBlcnJvciwgc3Rkb3V0LCBzdGRlcnIpO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSh0aGlzLl9pbml0aWFsQ3dkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzTGludXgpIHtcblx0XHRcdGlmICghdGhpcy5fcHR5UHJvY2Vzcykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faW5pdGlhbEN3ZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ25vZGUtcHR5LklQdHkjcGlkJyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgZnMucHJvbWlzZXMucmVhZGxpbmsoYC9wcm9jLyR7dGhpcy5fcHR5UHJvY2Vzcy5waWR9L2N3ZGApO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2luaXRpYWxDd2Q7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2luaXRpYWxDd2Q7XG5cdH1cblxuXHRnZXRXaW5kb3dzUHR5KCk6IElQcm9jZXNzUmVhZHlXaW5kb3dzUHR5IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gaXNXaW5kb3dzID8ge1xuXHRcdFx0YmFja2VuZDogJ2NvbnB0eScsXG5cdFx0XHRidWlsZE51bWJlcjogZ2V0V2luZG93c0J1aWxkTnVtYmVyU3luYygpXG5cdFx0fSA6IHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIFRyYWNrcyB0aGUgbGF0ZXN0IHJlc2l6ZSBldmVudCB0byBiZSB0cmlnZ2VyIGF0IGEgbGF0ZXIgcG9pbnQuXG4gKi9cbmNsYXNzIERlbGF5ZWRSZXNpemVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJvd3M6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0Y29sczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90aW1lb3V0OiBUaW1lb3V0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uVHJpZ2dlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcm93cz86IG51bWJlcjsgY29scz86IG51bWJlciB9PigpKTtcblx0Z2V0IG9uVHJpZ2dlcigpOiBFdmVudDx7IHJvd3M/OiBudW1iZXI7IGNvbHM/OiBudW1iZXIgfT4geyByZXR1cm4gdGhpcy5fb25UcmlnZ2VyLmV2ZW50OyB9XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl90aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vblRyaWdnZXIuZmlyZSh7IHJvd3M6IHRoaXMucm93cywgY29sczogdGhpcy5jb2xzIH0pO1xuXHRcdH0sIDEwMDApO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBjbGVhclRpbWVvdXQodGhpcy5fdGltZW91dCkpKTtcblx0fVxufVxuXG5mdW5jdGlvbiBoYXNDb25wdHlPcHRpb24ob2JqOiBJUHR5Rm9ya09wdGlvbnMgfCBJV2luZG93c1B0eUZvcmtPcHRpb25zKTogb2JqIGlzIElXaW5kb3dzUHR5Rm9ya09wdGlvbnMge1xuXHRyZXR1cm4gJ3VzZUNvbnB0eScgaW4gb2JqO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsWUFBWSxVQUFVO0FBQ3RCLFNBQThCLFNBQVMsYUFBYSxpQkFBaUI7QUFDckUsU0FBUyxzQkFBc0I7QUFDL0IsU0FB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QixrQkFBTjtBQUFBLEVBMkRKO0FBQUEsRUFDQTtBQUFBLEdBNURVO0FBMGpCYixNQUFNLHVCQUF1QixXQUFXO0FBQUEsRUFRdkMsY0FBYztBQUNiLFVBQU07QUFKUCxTQUFpQixhQUFhLEtBQUssVUFBVSxJQUFJLFFBQTBDLENBQUM7QUFLM0YsU0FBSyxXQUFXLFdBQVcsTUFBTTtBQUNoQyxXQUFLLFdBQVcsS0FBSyxFQUFFLE1BQU0sS0FBSyxNQUFNLE1BQU0sS0FBSyxLQUFLLENBQUM7QUFBQSxJQUMxRCxHQUFHLEdBQUk7QUFDUCxTQUFLLFVBQVUsYUFBYSxNQUFNLGFBQWEsS0FBSyxRQUFRLENBQUMsQ0FBQztBQUFBLEVBQy9EO0FBQUEsRUFSQSxJQUFJLFlBQXFEO0FBQUUsV0FBTyxLQUFLLFdBQVc7QUFBQSxFQUFPO0FBUzFGO0FBRUEsU0FBUyxnQkFBZ0IsS0FBOEU7QUFDdEcsU0FBTyxlQUFlO0FBQ3ZCOyIsCiAgIm5hbWVzIjogWyJTaHV0ZG93bkNvbnN0YW50cyIsICJDb25zdGFudHMiLCAiZSJdCn0K
