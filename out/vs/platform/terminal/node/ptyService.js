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
import { execFile, exec } from "child_process";
import { AutoOpenBarrier, ProcessTimeRunOnceScheduler, Promises, Queue, timeout } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { isWindows, OS } from "../../../base/common/platform.js";
import { getSystemShell } from "../../../base/node/shell.js";
import { LogLevel } from "../../log/common/log.js";
import { RequestStore } from "../common/requestStore.js";
import { TitleEventSource, ProcessPropertyType, PosixShellType } from "../common/terminal.js";
import { TerminalDataBufferer } from "../common/terminalDataBuffering.js";
import { escapeNonWindowsPath } from "../common/terminalEnvironment.js";
import { sanitizeEnvForLogging } from "./terminalEnvironment.js";
import { TerminalProcess } from "./terminalProcess.js";
import { localize } from "../../../nls.js";
import { ignoreProcessNames } from "./childProcessMonitor.js";
import { ErrorNoTelemetry } from "../../../base/common/errors.js";
import { ShellIntegrationAddon } from "../common/xterm/shellIntegrationAddon.js";
import { formatMessageForTerminal } from "../common/terminalStrings.js";
import { join } from "../../../base/common/path.js";
import { memoize } from "../../../base/common/decorators.js";
import * as performance from "../../../base/common/performance.js";
import pkg from "@xterm/headless";
import { AutoRepliesPtyServiceContribution } from "./terminalContrib/autoReplies/autoRepliesContribController.js";
import { hasKey, isFunction, isNumber, isString } from "../../../base/common/types.js";
import { getWindowsBuildNumberAsync } from "../../../base/node/windowsVersion.js";
const { Terminal: XtermTerminal } = pkg;
function sanitizeArgsForLogging(fnName, args) {
  if (fnName === "createProcess" && args.length > 5) {
    const sanitizedArgs = [...args];
    if (args[5] && typeof args[5] === "object") {
      sanitizedArgs[5] = sanitizeEnvForLogging(args[5]);
    }
    if (args[6] && typeof args[6] === "object") {
      sanitizedArgs[6] = sanitizeEnvForLogging(args[6]);
    }
    return sanitizedArgs;
  }
  return args;
}
function traceRpc(_target, key, descriptor) {
  if (!isFunction(descriptor.value)) {
    throw new Error("not supported");
  }
  const fnKey = "value";
  const fn = descriptor.value;
  descriptor[fnKey] = async function(...args) {
    if (this.traceRpcArgs.logService.getLevel() === LogLevel.Trace) {
      const sanitizedArgs = sanitizeArgsForLogging(fn.name, args);
      this.traceRpcArgs.logService.trace(`[RPC Request] PtyService#${fn.name}(${sanitizedArgs.map((e) => JSON.stringify(e)).join(", ")})`);
    }
    if (this.traceRpcArgs.simulatedLatency) {
      await timeout(this.traceRpcArgs.simulatedLatency);
    }
    let result;
    try {
      result = await fn.apply(this, args);
    } catch (e) {
      this.traceRpcArgs.logService.error(`[RPC Response] PtyService#${fn.name}`, e);
      throw e;
    }
    if (this.traceRpcArgs.logService.getLevel() === LogLevel.Trace) {
      this.traceRpcArgs.logService.trace(`[RPC Response] PtyService#${fn.name}`, result);
    }
    return result;
  };
}
let SerializeAddon;
let Unicode11Addon;
class PtyService extends Disposable {
  constructor(_logService, _productService, _reconnectConstants, _simulatedLatency) {
    super();
    this._logService = _logService;
    this._productService = _productService;
    this._reconnectConstants = _reconnectConstants;
    this._simulatedLatency = _simulatedLatency;
    this._ptys = /* @__PURE__ */ new Map();
    this._workspaceLayoutInfos = /* @__PURE__ */ new Map();
    this._revivedPtyIdMap = /* @__PURE__ */ new Map();
    this._lastPtyId = 0;
    this._onHeartbeat = this._register(new Emitter());
    this.onHeartbeat = this._traceEvent("_onHeartbeat", this._onHeartbeat.event);
    this._onProcessData = this._register(new Emitter());
    this.onProcessData = this._traceEvent("_onProcessData", this._onProcessData.event);
    this._onProcessReplay = this._register(new Emitter());
    this.onProcessReplay = this._traceEvent("_onProcessReplay", this._onProcessReplay.event);
    this._onProcessReady = this._register(new Emitter());
    this.onProcessReady = this._traceEvent("_onProcessReady", this._onProcessReady.event);
    this._onProcessExit = this._register(new Emitter());
    this.onProcessExit = this._traceEvent("_onProcessExit", this._onProcessExit.event);
    this._onProcessOrphanQuestion = this._register(new Emitter());
    this.onProcessOrphanQuestion = this._traceEvent("_onProcessOrphanQuestion", this._onProcessOrphanQuestion.event);
    this._onDidRequestDetach = this._register(new Emitter());
    this.onDidRequestDetach = this._traceEvent("_onDidRequestDetach", this._onDidRequestDetach.event);
    this._onDidChangeProperty = this._register(new Emitter());
    this.onDidChangeProperty = this._traceEvent("_onDidChangeProperty", this._onDidChangeProperty.event);
    this._register(toDisposable(() => {
      for (const pty of this._ptys.values()) {
        pty.shutdown(true);
      }
      this._ptys.clear();
    }));
    this._detachInstanceRequestStore = this._register(new RequestStore(void 0, this._logService));
    this._register(this._detachInstanceRequestStore.onCreateRequest(this._onDidRequestDetach.fire, this._onDidRequestDetach));
    this._autoRepliesContribution = new AutoRepliesPtyServiceContribution(this._logService);
    this._contributions = [this._autoRepliesContribution];
  }
  async installAutoReply(match, reply) {
    await this._autoRepliesContribution.installAutoReply(match, reply);
  }
  async uninstallAllAutoReplies() {
    await this._autoRepliesContribution.uninstallAllAutoReplies();
  }
  _traceEvent(name, event) {
    event((e) => {
      if (this._logService.getLevel() === LogLevel.Trace) {
        this._logService.trace(`[RPC Event] PtyService#${name}.fire(${JSON.stringify(e)})`);
      }
    });
    return event;
  }
  get traceRpcArgs() {
    return {
      logService: this._logService,
      simulatedLatency: this._simulatedLatency
    };
  }
  async refreshIgnoreProcessNames(names) {
    ignoreProcessNames.length = 0;
    ignoreProcessNames.push(...names);
  }
  async requestDetachInstance(workspaceId, instanceId) {
    return this._detachInstanceRequestStore.createRequest({ workspaceId, instanceId });
  }
  async acceptDetachInstanceReply(requestId, persistentProcessId) {
    let processDetails = void 0;
    const pty = this._ptys.get(persistentProcessId);
    if (pty) {
      processDetails = await this._buildProcessDetails(persistentProcessId, pty);
    }
    this._detachInstanceRequestStore.acceptReply(requestId, processDetails);
  }
  async freePortKillProcess(port) {
    const stdout = await new Promise((resolve, reject) => {
      exec(isWindows ? `netstat -ano | findstr "${port}"` : `lsof -nP -iTCP -sTCP:LISTEN | grep ${port}`, {}, (err, stdout2) => {
        if (err) {
          return reject("Problem occurred when listing active processes");
        }
        resolve(stdout2);
      });
    });
    const processesForPort = stdout.split(/\r?\n/).filter((s) => !!s.trim());
    if (processesForPort.length >= 1) {
      const capturePid = /\s+(\d+)(?:\s+|$)/;
      const processId = processesForPort[0].match(capturePid)?.[1];
      if (processId) {
        try {
          process.kill(Number.parseInt(processId));
        } catch {
        }
      } else {
        throw new Error(`Processes for port ${port} were not found`);
      }
      return { port, processId };
    }
    throw new Error(`Could not kill process with port ${port}`);
  }
  async serializeTerminalState(ids) {
    const promises = [];
    for (const [persistentProcessId, persistentProcess] of this._ptys.entries()) {
      if (persistentProcess.hasWrittenData && ids.indexOf(persistentProcessId) !== -1) {
        promises.push(Promises.withAsyncBody(async (r) => {
          r({
            id: persistentProcessId,
            shellLaunchConfig: persistentProcess.shellLaunchConfig,
            processDetails: await this._buildProcessDetails(persistentProcessId, persistentProcess),
            processLaunchConfig: persistentProcess.processLaunchOptions,
            unicodeVersion: persistentProcess.unicodeVersion,
            replayEvent: await persistentProcess.serializeNormalBuffer(),
            timestamp: Date.now()
          });
        }));
      }
    }
    const serialized = {
      version: 1,
      state: await Promise.all(promises)
    };
    return JSON.stringify(serialized);
  }
  async reviveTerminalProcesses(workspaceId, state, dateTimeFormatLocale) {
    const promises = [];
    for (const terminal of state) {
      promises.push(this._reviveTerminalProcess(workspaceId, terminal));
    }
    await Promise.all(promises);
  }
  async _reviveTerminalProcess(workspaceId, terminal) {
    const restoreMessage = localize("terminal-history-restored", "History restored");
    let postRestoreMessage = "";
    if (isWindows) {
      const lastReplayEvent = terminal.replayEvent.events.length > 0 ? terminal.replayEvent.events.at(-1) : void 0;
      if (lastReplayEvent) {
        postRestoreMessage += "\r\n".repeat(lastReplayEvent.rows - 1) + `\x1B[H`;
      }
    }
    const newId = await this.createProcess(
      {
        ...terminal.shellLaunchConfig,
        cwd: terminal.processDetails.cwd,
        color: terminal.processDetails.color,
        icon: terminal.processDetails.icon,
        name: terminal.processDetails.titleSource === TitleEventSource.Api ? terminal.processDetails.title : void 0,
        initialText: terminal.replayEvent.events[0].data + formatMessageForTerminal(restoreMessage, { loudFormatting: true }) + postRestoreMessage
      },
      terminal.processDetails.cwd,
      terminal.replayEvent.events[0].cols,
      terminal.replayEvent.events[0].rows,
      terminal.unicodeVersion,
      terminal.processLaunchConfig.env,
      terminal.processLaunchConfig.executableEnv,
      terminal.processLaunchConfig.options,
      true,
      terminal.processDetails.workspaceId,
      terminal.processDetails.workspaceName,
      true,
      terminal.replayEvent.events[0].data
    );
    const oldId = this._getRevivingProcessId(workspaceId, terminal.id);
    this._revivedPtyIdMap.set(oldId, { newId, state: terminal });
    this._logService.info(`Revived process, old id ${oldId} -> new id ${newId}`);
  }
  async shutdownAll() {
    this.dispose();
  }
  async createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, executableEnv, options, shouldPersist, workspaceId, workspaceName, isReviving, rawReviveBuffer) {
    if (shellLaunchConfig.attachPersistentProcess) {
      throw new Error("Attempt to create a process when attach object was provided");
    }
    const id = ++this._lastPtyId;
    const process2 = new TerminalProcess(shellLaunchConfig, cwd, cols, rows, env, executableEnv, options, this._logService, this._productService);
    const processLaunchOptions = {
      env,
      executableEnv,
      options
    };
    const persistentProcess = new PersistentTerminalProcess(id, process2, workspaceId, workspaceName, shouldPersist, cols, rows, processLaunchOptions, unicodeVersion, this._reconnectConstants, this._logService, isReviving && isString(shellLaunchConfig.initialText) ? shellLaunchConfig.initialText : void 0, rawReviveBuffer, shellLaunchConfig.icon, shellLaunchConfig.color, shellLaunchConfig.name, shellLaunchConfig.fixedDimensions);
    process2.onProcessExit((event) => {
      for (const contrib of this._contributions) {
        contrib.handleProcessDispose(id);
      }
      persistentProcess.dispose();
      this._ptys.delete(id);
      this._onProcessExit.fire({ id, event });
    });
    persistentProcess.onProcessData((event) => this._onProcessData.fire({ id, event }));
    persistentProcess.onProcessReplay((event) => this._onProcessReplay.fire({ id, event }));
    persistentProcess.onProcessReady((event) => this._onProcessReady.fire({ id, event }));
    persistentProcess.onProcessOrphanQuestion(() => this._onProcessOrphanQuestion.fire({ id }));
    persistentProcess.onDidChangeProperty((property) => this._onDidChangeProperty.fire({ id, property }));
    persistentProcess.onPersistentProcessReady(() => {
      for (const contrib of this._contributions) {
        contrib.handleProcessReady(id, process2);
      }
    });
    this._ptys.set(id, persistentProcess);
    return id;
  }
  async attachToProcess(id) {
    try {
      await this._throwIfNoPty(id).attach();
      this._logService.info(`Persistent process reconnection "${id}"`);
    } catch (e) {
      this._logService.warn(`Persistent process reconnection "${id}" failed`, e.message);
      throw e;
    }
  }
  async updateTitle(id, title, titleSource) {
    this._throwIfNoPty(id).setTitle(title, titleSource);
  }
  async updateIcon(id, userInitiated, icon, color) {
    this._throwIfNoPty(id).setIcon(userInitiated, icon, color);
  }
  async clearBuffer(id) {
    this._throwIfNoPty(id).clearBuffer();
  }
  async refreshProperty(id, type) {
    return this._throwIfNoPty(id).refreshProperty(type);
  }
  async updateProperty(id, type, value) {
    return this._throwIfNoPty(id).updateProperty(type, value);
  }
  async detachFromProcess(id, forcePersist) {
    return this._throwIfNoPty(id).detach(forcePersist);
  }
  async reduceConnectionGraceTime() {
    for (const pty of this._ptys.values()) {
      pty.reduceGraceTime();
    }
  }
  async listProcesses() {
    const persistentProcesses = Array.from(this._ptys.entries()).filter(([_, pty]) => pty.shouldPersistTerminal);
    this._logService.info(`Listing ${persistentProcesses.length} persistent terminals, ${this._ptys.size} total terminals`);
    const promises = persistentProcesses.map(async ([id, terminalProcessData]) => this._buildProcessDetails(id, terminalProcessData));
    const allTerminals = await Promise.all(promises);
    return allTerminals.filter((entry) => entry.isOrphan);
  }
  async getPerformanceMarks() {
    return performance.getMarks();
  }
  async start(id) {
    const pty = this._ptys.get(id);
    return pty ? pty.start() : { message: `Could not find pty with id "${id}"` };
  }
  async shutdown(id, immediate) {
    return this._ptys.get(id)?.shutdown(immediate);
  }
  async input(id, data) {
    const pty = this._throwIfNoPty(id);
    if (pty) {
      for (const contrib of this._contributions) {
        contrib.handleProcessInput(id, data);
      }
      pty.input(data);
    }
  }
  async sendSignal(id, signal) {
    return this._throwIfNoPty(id).sendSignal(signal);
  }
  async processBinary(id, data) {
    return this._throwIfNoPty(id).writeBinary(data);
  }
  async resize(id, cols, rows, pixelWidth, pixelHeight) {
    const pty = this._throwIfNoPty(id);
    if (pty) {
      for (const contrib of this._contributions) {
        contrib.handleProcessResize(id, cols, rows, pixelWidth, pixelHeight);
      }
      pty.resize(cols, rows, pixelWidth, pixelHeight);
    }
  }
  async getInitialCwd(id) {
    return this._throwIfNoPty(id).getInitialCwd();
  }
  async getCwd(id) {
    return this._throwIfNoPty(id).getCwd();
  }
  async acknowledgeDataEvent(id, charCount) {
    return this._throwIfNoPty(id).acknowledgeDataEvent(charCount);
  }
  async setUnicodeVersion(id, version) {
    return this._throwIfNoPty(id).setUnicodeVersion(version);
  }
  async setNextCommandId(id, commandLine, commandId) {
    return this._throwIfNoPty(id).setNextCommandId(commandLine, commandId);
  }
  async getLatency() {
    return [];
  }
  async orphanQuestionReply(id) {
    return this._throwIfNoPty(id).orphanQuestionReply();
  }
  async getDefaultSystemShell(osOverride = OS) {
    return getSystemShell(osOverride, process.env);
  }
  async getEnvironment() {
    return { ...process.env };
  }
  async getWslPath(original, direction) {
    if (direction === "win-to-unix") {
      if (!isWindows) {
        return original;
      }
      if (await getWindowsBuildNumberAsync() < 17063) {
        return original.replace(/\\/g, "/");
      }
      const wslExecutable = await this._getWSLExecutablePath();
      if (!wslExecutable) {
        return original;
      }
      return new Promise((c) => {
        const proc = execFile(wslExecutable, ["-e", "wslpath", original], {}, (error, stdout, stderr) => {
          c(error ? original : escapeNonWindowsPath(stdout.trim(), PosixShellType.Bash));
        });
        proc.stdin.end();
      });
    }
    if (direction === "unix-to-win") {
      if (isWindows) {
        if (await getWindowsBuildNumberAsync() < 17063) {
          return original;
        }
        const wslExecutable = await this._getWSLExecutablePath();
        if (!wslExecutable) {
          return original;
        }
        return new Promise((c) => {
          const proc = execFile(wslExecutable, ["-e", "wslpath", "-w", original], {}, (error, stdout, stderr) => {
            c(error ? original : stdout.trim());
          });
          proc.stdin.end();
        });
      }
    }
    return original;
  }
  async _getWSLExecutablePath() {
    const useWSLexe = await getWindowsBuildNumberAsync() >= 16299;
    const is32ProcessOn64Windows = process.env.hasOwnProperty("PROCESSOR_ARCHITEW6432");
    const systemRoot = process.env["SystemRoot"];
    if (systemRoot) {
      return join(systemRoot, is32ProcessOn64Windows ? "Sysnative" : "System32", useWSLexe ? "wsl.exe" : "bash.exe");
    }
    return void 0;
  }
  async getRevivedPtyNewId(workspaceId, id) {
    try {
      return this._revivedPtyIdMap.get(this._getRevivingProcessId(workspaceId, id))?.newId;
    } catch (e) {
      this._logService.warn(`Couldn't find terminal ID ${workspaceId}-${id}`, e.message);
    }
    return void 0;
  }
  async setTerminalLayoutInfo(args) {
    this._workspaceLayoutInfos.set(args.workspaceId, args);
  }
  async getTerminalLayoutInfo(args) {
    performance.mark("code/willGetTerminalLayoutInfo");
    const layout = this._workspaceLayoutInfos.get(args.workspaceId);
    if (layout) {
      const doneSet = /* @__PURE__ */ new Set();
      const expandedTabs = await Promise.all(layout.tabs.map(async (tab) => this._expandTerminalTab(args.workspaceId, tab, doneSet)));
      const tabs = expandedTabs.filter((t) => t.terminals.length > 0);
      const expandedBackground = (await Promise.all(layout.background?.map((b) => this._expandTerminalInstance(args.workspaceId, b, doneSet)) ?? [])).filter((b) => b.terminal !== null).map((b) => b.terminal);
      performance.mark("code/didGetTerminalLayoutInfo");
      return { tabs, background: expandedBackground };
    }
    performance.mark("code/didGetTerminalLayoutInfo");
    return void 0;
  }
  async _expandTerminalTab(workspaceId, tab, doneSet) {
    const expandedTerminals = await Promise.all(tab.terminals.map((t) => this._expandTerminalInstance(workspaceId, t, doneSet)));
    const filtered = expandedTerminals.filter((term) => term.terminal !== null);
    return {
      isActive: tab.isActive,
      activePersistentProcessId: tab.activePersistentProcessId,
      terminals: filtered
    };
  }
  async _expandTerminalInstance(workspaceId, t, doneSet) {
    const hasLayout = !isNumber(t);
    const ptyId = hasLayout ? t.terminal : t;
    try {
      const oldId = this._getRevivingProcessId(workspaceId, ptyId);
      const revivedPtyId = this._revivedPtyIdMap.get(oldId)?.newId;
      this._logService.info(`Expanding terminal instance, old id ${oldId} -> new id ${revivedPtyId}`);
      this._revivedPtyIdMap.delete(oldId);
      const persistentProcessId = revivedPtyId ?? ptyId;
      if (doneSet.has(persistentProcessId)) {
        throw new Error(`Terminal ${persistentProcessId} has already been expanded`);
      }
      doneSet.add(persistentProcessId);
      const persistentProcess = this._throwIfNoPty(persistentProcessId);
      const processDetails = persistentProcess && await this._buildProcessDetails(ptyId, persistentProcess, revivedPtyId !== void 0);
      return {
        terminal: { ...processDetails, id: persistentProcessId },
        relativeSize: hasLayout ? t.relativeSize : 0
      };
    } catch (e) {
      this._logService.warn(`Couldn't get layout info, a terminal was probably disconnected`, e.message);
      this._logService.debug("Reattach to wrong terminal debug info - layout info by id", t);
      this._logService.debug("Reattach to wrong terminal debug info - _revivePtyIdMap", Array.from(this._revivedPtyIdMap.values()));
      this._logService.debug("Reattach to wrong terminal debug info - _ptys ids", Array.from(this._ptys.keys()));
      return {
        terminal: null,
        relativeSize: hasLayout ? t.relativeSize : 0
      };
    }
  }
  _getRevivingProcessId(workspaceId, ptyId) {
    return `${workspaceId}-${ptyId}`;
  }
  async _buildProcessDetails(id, persistentProcess, wasRevived = false) {
    performance.mark(`code/willBuildProcessDetails/${id}`);
    const [cwd, isOrphan] = await Promise.all([persistentProcess.getCwd(), wasRevived ? true : persistentProcess.isOrphaned()]);
    const result = {
      id,
      title: persistentProcess.title,
      titleSource: persistentProcess.titleSource,
      pid: persistentProcess.pid,
      workspaceId: persistentProcess.workspaceId,
      workspaceName: persistentProcess.workspaceName,
      cwd,
      isOrphan,
      icon: persistentProcess.icon,
      color: persistentProcess.color,
      fixedDimensions: persistentProcess.fixedDimensions,
      environmentVariableCollections: persistentProcess.processLaunchOptions.options.environmentVariableCollections,
      reconnectionProperties: persistentProcess.shellLaunchConfig.reconnectionProperties,
      waitOnExit: persistentProcess.shellLaunchConfig.waitOnExit,
      hideFromUser: persistentProcess.shellLaunchConfig.hideFromUser,
      isFeatureTerminal: persistentProcess.shellLaunchConfig.isFeatureTerminal,
      type: persistentProcess.shellLaunchConfig.type,
      hasChildProcesses: persistentProcess.hasChildProcesses,
      shellIntegrationNonce: persistentProcess.processLaunchOptions.options.shellIntegration.nonce,
      tabActions: persistentProcess.shellLaunchConfig.tabActions
    };
    performance.mark(`code/didBuildProcessDetails/${id}`);
    return result;
  }
  _throwIfNoPty(id) {
    const pty = this._ptys.get(id);
    if (!pty) {
      throw new ErrorNoTelemetry(`Could not find pty ${id} on pty host`);
    }
    return pty;
  }
}
__decorateClass([
  traceRpc
], PtyService.prototype, "installAutoReply", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "uninstallAllAutoReplies", 1);
__decorateClass([
  memoize
], PtyService.prototype, "traceRpcArgs", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "refreshIgnoreProcessNames", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "requestDetachInstance", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "acceptDetachInstanceReply", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "freePortKillProcess", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "serializeTerminalState", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "reviveTerminalProcesses", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "shutdownAll", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "createProcess", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "attachToProcess", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "updateTitle", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "updateIcon", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "clearBuffer", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "refreshProperty", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "updateProperty", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "detachFromProcess", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "reduceConnectionGraceTime", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "listProcesses", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getPerformanceMarks", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "start", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "shutdown", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "input", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "sendSignal", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "processBinary", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "resize", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getInitialCwd", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getCwd", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "acknowledgeDataEvent", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "setUnicodeVersion", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "setNextCommandId", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getLatency", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "orphanQuestionReply", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getDefaultSystemShell", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getEnvironment", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getWslPath", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getRevivedPtyNewId", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "setTerminalLayoutInfo", 1);
__decorateClass([
  traceRpc
], PtyService.prototype, "getTerminalLayoutInfo", 1);
var InteractionState = /* @__PURE__ */ ((InteractionState2) => {
  InteractionState2["None"] = "None";
  InteractionState2["ReplayOnly"] = "ReplayOnly";
  InteractionState2["Session"] = "Session";
  return InteractionState2;
})(InteractionState || {});
class PersistentTerminalProcess extends Disposable {
  constructor(_persistentProcessId, _terminalProcess, workspaceId, workspaceName, shouldPersistTerminal, cols, rows, processLaunchOptions, unicodeVersion, reconnectConstants, _logService, reviveBuffer, rawReviveBuffer, _icon, _color, name, fixedDimensions) {
    super();
    this._persistentProcessId = _persistentProcessId;
    this._terminalProcess = _terminalProcess;
    this.workspaceId = workspaceId;
    this.workspaceName = workspaceName;
    this.shouldPersistTerminal = shouldPersistTerminal;
    this.processLaunchOptions = processLaunchOptions;
    this.unicodeVersion = unicodeVersion;
    this._logService = _logService;
    this._icon = _icon;
    this._color = _color;
    this._pendingCommands = /* @__PURE__ */ new Map();
    this._isStarted = false;
    this._orphanRequestQueue = new Queue();
    this._onProcessReplay = this._register(new Emitter());
    this.onProcessReplay = this._onProcessReplay.event;
    this._onProcessReady = this._register(new Emitter());
    this.onProcessReady = this._onProcessReady.event;
    this._onPersistentProcessReady = this._register(new Emitter());
    /** Fired when the persistent process has a ready process and has finished its replay. */
    this.onPersistentProcessReady = this._onPersistentProcessReady.event;
    this._onProcessData = this._register(new Emitter());
    this.onProcessData = this._onProcessData.event;
    this._onProcessOrphanQuestion = this._register(new Emitter());
    this.onProcessOrphanQuestion = this._onProcessOrphanQuestion.event;
    this._onDidChangeProperty = this._register(new Emitter());
    this.onDidChangeProperty = this._onDidChangeProperty.event;
    this._inReplay = false;
    this._pid = -1;
    this._cwd = "";
    this._titleSource = TitleEventSource.Process;
    this._interactionState = new MutationLogger(`Persistent process "${this._persistentProcessId}" interaction state`, "None" /* None */, this._logService);
    this._wasRevived = reviveBuffer !== void 0;
    this._serializer = new XtermSerializer(
      cols,
      rows,
      reconnectConstants.scrollback,
      unicodeVersion,
      reviveBuffer,
      processLaunchOptions.options.shellIntegration.nonce,
      shouldPersistTerminal ? rawReviveBuffer : void 0,
      this._logService
    );
    if (name) {
      this.setTitle(name, TitleEventSource.Api);
    }
    this._fixedDimensions = fixedDimensions;
    this._orphanQuestionBarrier = null;
    this._orphanQuestionReplyTime = 0;
    this._disconnectRunner1 = this._register(new ProcessTimeRunOnceScheduler(() => {
      this._logService.info(`Persistent process "${this._persistentProcessId}": The reconnection grace time of ${printTime(reconnectConstants.graceTime)} has expired, shutting down pid "${this._pid}"`);
      this.shutdown(true);
    }, reconnectConstants.graceTime));
    this._disconnectRunner2 = this._register(new ProcessTimeRunOnceScheduler(() => {
      this._logService.info(`Persistent process "${this._persistentProcessId}": The short reconnection grace time of ${printTime(reconnectConstants.shortGraceTime)} has expired, shutting down pid ${this._pid}`);
      this.shutdown(true);
    }, reconnectConstants.shortGraceTime));
    this._register(this._terminalProcess.onProcessExit(() => this._bufferer.stopBuffering(this._persistentProcessId)));
    this._register(this._terminalProcess.onProcessReady((e) => {
      this._pid = e.pid;
      this._cwd = e.cwd;
      this._onProcessReady.fire(e);
    }));
    this._register(this._terminalProcess.onDidChangeProperty((e) => {
      this._onDidChangeProperty.fire(e);
    }));
    this._bufferer = new TerminalDataBufferer((_, data) => this._onProcessData.fire(data));
    this._register(this._bufferer.startBuffering(this._persistentProcessId, this._terminalProcess.onProcessData));
    this._register(this.onProcessData((e) => this._serializer.handleData(e)));
  }
  get pid() {
    return this._pid;
  }
  get shellLaunchConfig() {
    return this._terminalProcess.shellLaunchConfig;
  }
  get hasWrittenData() {
    return this._interactionState.value !== "None" /* None */;
  }
  get title() {
    return this._title || this._terminalProcess.currentTitle;
  }
  get titleSource() {
    return this._titleSource;
  }
  get icon() {
    return this._icon;
  }
  get color() {
    return this._color;
  }
  get fixedDimensions() {
    return this._fixedDimensions;
  }
  get hasChildProcesses() {
    return this._terminalProcess.hasChildProcesses;
  }
  setTitle(title, titleSource) {
    if (titleSource === TitleEventSource.Api) {
      this._interactionState.setValue("Session" /* Session */, "setTitle");
      this._serializer.freeRawReviveBuffer();
    }
    this._title = title;
    this._titleSource = titleSource;
  }
  setIcon(userInitiated, icon, color) {
    if (!this._icon || hasKey(icon, { id: true }) && hasKey(this._icon, { id: true }) && icon.id !== this._icon.id || !this.color || color !== this._color) {
      this._serializer.freeRawReviveBuffer();
      if (userInitiated) {
        this._interactionState.setValue("Session" /* Session */, "setIcon");
      }
    }
    this._icon = icon;
    this._color = color;
  }
  _setFixedDimensions(fixedDimensions) {
    this._fixedDimensions = fixedDimensions;
  }
  async attach() {
    if (!this._disconnectRunner1.isScheduled() && !this._disconnectRunner2.isScheduled()) {
      this._logService.warn(`Persistent process "${this._persistentProcessId}": Process had no disconnect runners but was an orphan`);
    }
    this._disconnectRunner1.cancel();
    this._disconnectRunner2.cancel();
  }
  async detach(forcePersist) {
    if (this.shouldPersistTerminal && (this._interactionState.value !== "None" /* None */ || forcePersist)) {
      this._disconnectRunner1.schedule();
    } else {
      this.shutdown(true);
    }
  }
  serializeNormalBuffer() {
    return this._serializer.generateReplayEvent(true, this._interactionState.value !== "Session" /* Session */);
  }
  async refreshProperty(type) {
    return this._terminalProcess.refreshProperty(type);
  }
  async updateProperty(type, value) {
    if (type === ProcessPropertyType.FixedDimensions) {
      return this._setFixedDimensions(value);
    }
  }
  async start() {
    if (!this._isStarted) {
      const result = await this._terminalProcess.start();
      if (result && hasKey(result, { message: true })) {
        return result;
      }
      this._isStarted = true;
      if (this._wasRevived) {
        this.triggerReplay();
      } else {
        this._onPersistentProcessReady.fire();
      }
      return result;
    }
    this._onProcessReady.fire({ pid: this._pid, cwd: this._cwd, windowsPty: this._terminalProcess.getWindowsPty() });
    this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: this._terminalProcess.currentTitle });
    this._onDidChangeProperty.fire({ type: ProcessPropertyType.ShellType, value: this._terminalProcess.shellType });
    this.triggerReplay();
    return void 0;
  }
  shutdown(immediate) {
    return this._terminalProcess.shutdown(immediate);
  }
  input(data) {
    this._interactionState.setValue("Session" /* Session */, "input");
    this._serializer.freeRawReviveBuffer();
    if (this._inReplay) {
      return;
    }
    return this._terminalProcess.input(data);
  }
  sendSignal(signal) {
    if (this._inReplay) {
      return;
    }
    return this._terminalProcess.sendSignal(signal);
  }
  writeBinary(data) {
    return this._terminalProcess.processBinary(data);
  }
  resize(cols, rows, pixelWidth, pixelHeight) {
    if (this._inReplay) {
      return;
    }
    this._serializer.handleResize(cols, rows);
    this._bufferer.flushBuffer(this._persistentProcessId);
    return this._terminalProcess.resize(cols, rows, pixelWidth, pixelHeight);
  }
  async clearBuffer() {
    this._serializer.clearBuffer();
    this._terminalProcess.clearBuffer();
  }
  setUnicodeVersion(version) {
    this.unicodeVersion = version;
    this._serializer.setUnicodeVersion?.(version);
  }
  async setNextCommandId(commandLine, commandId) {
    this._serializer.setNextCommandId?.(commandLine, commandId);
  }
  acknowledgeDataEvent(charCount) {
    if (this._inReplay) {
      return;
    }
    return this._terminalProcess.acknowledgeDataEvent(charCount);
  }
  getInitialCwd() {
    return this._terminalProcess.getInitialCwd();
  }
  getCwd() {
    return this._terminalProcess.getCwd();
  }
  async triggerReplay() {
    if (this._interactionState.value === "None" /* None */) {
      this._interactionState.setValue("ReplayOnly" /* ReplayOnly */, "triggerReplay");
    }
    const ev = await this._serializer.generateReplayEvent();
    let dataLength = 0;
    for (const e of ev.events) {
      dataLength += e.data.length;
    }
    this._logService.info(`Persistent process "${this._persistentProcessId}": Replaying ${dataLength} chars and ${ev.events.length} size events`);
    this._onProcessReplay.fire(ev);
    this._terminalProcess.clearUnacknowledgedChars();
    this._onPersistentProcessReady.fire();
  }
  sendCommandResult(reqId, isError, serializedPayload) {
    const data = this._pendingCommands.get(reqId);
    if (!data) {
      return;
    }
    this._pendingCommands.delete(reqId);
  }
  orphanQuestionReply() {
    this._orphanQuestionReplyTime = Date.now();
    if (this._orphanQuestionBarrier) {
      const barrier = this._orphanQuestionBarrier;
      this._orphanQuestionBarrier = null;
      barrier.open();
    }
  }
  reduceGraceTime() {
    if (this._disconnectRunner2.isScheduled()) {
      return;
    }
    if (this._disconnectRunner1.isScheduled()) {
      this._disconnectRunner2.schedule();
    }
  }
  async isOrphaned() {
    return await this._orphanRequestQueue.queue(async () => this._isOrphaned());
  }
  async _isOrphaned() {
    if (this._disconnectRunner1.isScheduled() || this._disconnectRunner2.isScheduled()) {
      return true;
    }
    if (!this._orphanQuestionBarrier) {
      this._orphanQuestionBarrier = new AutoOpenBarrier(4e3);
      this._orphanQuestionReplyTime = 0;
      this._onProcessOrphanQuestion.fire();
    }
    await this._orphanQuestionBarrier.wait();
    return Date.now() - this._orphanQuestionReplyTime > 500;
  }
}
class MutationLogger {
  constructor(_name, _value, _logService) {
    this._name = _name;
    this._value = _value;
    this._logService = _logService;
    this._log("initialized");
  }
  get value() {
    return this._value;
  }
  setValue(value, reason) {
    if (this._value !== value) {
      this._value = value;
      this._log(reason);
    }
  }
  _log(reason) {
    this._logService.debug(`MutationLogger "${this._name}" set to "${this._value}", reason: ${reason}`);
  }
}
class XtermSerializer {
  constructor(cols, rows, scrollback, unicodeVersion, reviveBufferWithRestoreMessage, shellIntegrationNonce, _rawReviveBuffer, logService) {
    this._rawReviveBuffer = _rawReviveBuffer;
    this._xterm = new XtermTerminal({
      cols,
      rows,
      scrollback,
      allowProposedApi: true
    });
    if (reviveBufferWithRestoreMessage) {
      this._xterm.writeln(reviveBufferWithRestoreMessage);
    }
    this.setUnicodeVersion(unicodeVersion);
    this._shellIntegrationAddon = new ShellIntegrationAddon(shellIntegrationNonce, true, void 0, void 0, logService);
    this._xterm.loadAddon(this._shellIntegrationAddon);
  }
  freeRawReviveBuffer() {
    this._rawReviveBuffer = void 0;
  }
  handleData(data) {
    this._xterm.write(data);
  }
  handleResize(cols, rows) {
    this._xterm.resize(cols, rows);
  }
  clearBuffer() {
    this._xterm.clear();
  }
  setNextCommandId(commandLine, commandId) {
    this._shellIntegrationAddon.setNextCommandId(commandLine, commandId);
  }
  async generateReplayEvent(normalBufferOnly, restoreToLastReviveBuffer) {
    const serialize = new (await this._getSerializeConstructor())();
    this._xterm.loadAddon(serialize);
    const options = {
      scrollback: this._xterm.options.scrollback
    };
    if (normalBufferOnly) {
      options.excludeAltBuffer = true;
      options.excludeModes = true;
    }
    let serialized;
    if (restoreToLastReviveBuffer && this._rawReviveBuffer) {
      serialized = this._rawReviveBuffer;
    } else {
      serialized = serialize.serialize(options);
    }
    return {
      events: [
        {
          cols: this._xterm.cols,
          rows: this._xterm.rows,
          data: serialized
        }
      ],
      commands: this._shellIntegrationAddon.serialize()
    };
  }
  async setUnicodeVersion(version) {
    if (this._xterm.unicode.activeVersion === version) {
      return;
    }
    if (version === "11") {
      this._unicodeAddon = new (await this._getUnicode11Constructor())();
      this._xterm.loadAddon(this._unicodeAddon);
    } else {
      this._unicodeAddon?.dispose();
      this._unicodeAddon = void 0;
    }
    this._xterm.unicode.activeVersion = version;
  }
  async _getUnicode11Constructor() {
    if (!Unicode11Addon) {
      Unicode11Addon = (await import("@xterm/addon-unicode11")).Unicode11Addon;
    }
    return Unicode11Addon;
  }
  async _getSerializeConstructor() {
    if (!SerializeAddon) {
      SerializeAddon = (await import("@xterm/addon-serialize")).SerializeAddon;
    }
    return SerializeAddon;
  }
}
function printTime(ms) {
  let h = 0;
  let m = 0;
  let s = 0;
  if (ms >= 1e3) {
    s = Math.floor(ms / 1e3);
    ms -= s * 1e3;
  }
  if (s >= 60) {
    m = Math.floor(s / 60);
    s -= m * 60;
  }
  if (m >= 60) {
    h = Math.floor(m / 60);
    m -= h * 60;
  }
  const _h = h ? `${h}h` : ``;
  const _m = m ? `${m}m` : ``;
  const _s = s ? `${s}s` : ``;
  const _ms = ms ? `${ms}ms` : ``;
  return `${_h}${_m}${_s}${_ms}`;
}
export {
  PtyService,
  traceRpc
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvcHR5U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGV4ZWNGaWxlLCBleGVjIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBBdXRvT3BlbkJhcnJpZXIsIFByb2Nlc3NUaW1lUnVuT25jZVNjaGVkdWxlciwgUHJvbWlzZXMsIFF1ZXVlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NFbnZpcm9ubWVudCwgaXNXaW5kb3dzLCBPcGVyYXRpbmdTeXN0ZW0sIE9TIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdldFN5c3RlbVNoZWxsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3NoZWxsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFJlcXVlc3RTdG9yZSB9IGZyb20gJy4uL2NvbW1vbi9yZXF1ZXN0U3RvcmUuanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NEYXRhRXZlbnQsIElQcm9jZXNzUmVhZHlFdmVudCwgSVB0eVNlcnZpY2UsIElSYXdUZXJtaW5hbEluc3RhbmNlTGF5b3V0SW5mbywgSVJlY29ubmVjdENvbnN0YW50cywgSVNoZWxsTGF1bmNoQ29uZmlnLCBJVGVybWluYWxJbnN0YW5jZUxheW91dEluZm9CeUlkLCBJVGVybWluYWxMYXVuY2hFcnJvciwgSVRlcm1pbmFsc0xheW91dEluZm8sIElUZXJtaW5hbFRhYkxheW91dEluZm9CeUlkLCBUZXJtaW5hbEljb24sIElQcm9jZXNzUHJvcGVydHksIFRpdGxlRXZlbnRTb3VyY2UsIFByb2Nlc3NQcm9wZXJ0eVR5cGUsIElQcm9jZXNzUHJvcGVydHlNYXAsIElGaXhlZFRlcm1pbmFsRGltZW5zaW9ucywgSVBlcnNpc3RlbnRUZXJtaW5hbFByb2Nlc3NMYXVuY2hDb25maWcsIElDcm9zc1ZlcnNpb25TZXJpYWxpemVkVGVybWluYWxTdGF0ZSwgSVNlcmlhbGl6ZWRUZXJtaW5hbFN0YXRlLCBJVGVybWluYWxQcm9jZXNzT3B0aW9ucywgSVB0eUhvc3RMYXRlbmN5TWVhc3VyZW1lbnQsIHR5cGUgSVB0eVNlcnZpY2VDb250cmlidXRpb24sIFBvc2l4U2hlbGxUeXBlLCBJVGVybWluYWxMYXVuY2hSZXN1bHQgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxEYXRhQnVmZmVyZXIgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxEYXRhQnVmZmVyaW5nLmpzJztcbmltcG9ydCB7IGVzY2FwZU5vbldpbmRvd3NQYXRoIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsRW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHR5cGUgeyBJU2VyaWFsaXplT3B0aW9ucywgU2VyaWFsaXplQWRkb24gYXMgWHRlcm1TZXJpYWxpemVBZGRvbiB9IGZyb20gJ0B4dGVybS9hZGRvbi1zZXJpYWxpemUnO1xuaW1wb3J0IHR5cGUgeyBVbmljb2RlMTFBZGRvbiBhcyBYdGVybVVuaWNvZGUxMUFkZG9uIH0gZnJvbSAnQHh0ZXJtL2FkZG9uLXVuaWNvZGUxMSc7XG5pbXBvcnQgeyBJR2V0VGVybWluYWxMYXlvdXRJbmZvQXJncywgSVByb2Nlc3NEZXRhaWxzLCBJU2V0VGVybWluYWxMYXlvdXRJbmZvQXJncywgSVRlcm1pbmFsVGFiTGF5b3V0SW5mb0R0byB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbFByb2Nlc3MuanMnO1xuaW1wb3J0IHsgc2FuaXRpemVFbnZGb3JMb2dnaW5nIH0gZnJvbSAnLi90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsUHJvY2VzcyB9IGZyb20gJy4vdGVybWluYWxQcm9jZXNzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGlnbm9yZVByb2Nlc3NOYW1lcyB9IGZyb20gJy4vY2hpbGRQcm9jZXNzTW9uaXRvci5qcyc7XG5pbXBvcnQgeyBFcnJvck5vVGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFNoZWxsSW50ZWdyYXRpb25BZGRvbiB9IGZyb20gJy4uL2NvbW1vbi94dGVybS9zaGVsbEludGVncmF0aW9uQWRkb24uanMnO1xuaW1wb3J0IHsgZm9ybWF0TWVzc2FnZUZvclRlcm1pbmFsIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsU3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJUHR5SG9zdFByb2Nlc3NSZXBsYXlFdmVudCB9IGZyb20gJy4uL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IG1lbW9pemUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCAqIGFzIHBlcmZvcm1hbmNlIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCBwa2cgZnJvbSAnQHh0ZXJtL2hlYWRsZXNzJztcbmltcG9ydCB7IEF1dG9SZXBsaWVzUHR5U2VydmljZUNvbnRyaWJ1dGlvbiB9IGZyb20gJy4vdGVybWluYWxDb250cmliL2F1dG9SZXBsaWVzL2F1dG9SZXBsaWVzQ29udHJpYkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgaGFzS2V5LCBpc0Z1bmN0aW9uLCBpc051bWJlciwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBnZXRXaW5kb3dzQnVpbGROdW1iZXJBc3luYyB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS93aW5kb3dzVmVyc2lvbi5qcyc7XG5cbnR5cGUgWHRlcm1UZXJtaW5hbCA9IHBrZy5UZXJtaW5hbDtcbmNvbnN0IHsgVGVybWluYWw6IFh0ZXJtVGVybWluYWwgfSA9IHBrZztcblxuLyoqXG4gKiBTYW5pdGl6ZXMgYXJndW1lbnRzIGZvciBsb2dnaW5nLCBzcGVjaWZpY2FsbHkgaGFuZGxpbmcgZW52IG9iamVjdHMgaW4gY3JlYXRlUHJvY2VzcyBjYWxscy5cbiAqL1xuZnVuY3Rpb24gc2FuaXRpemVBcmdzRm9yTG9nZ2luZyhmbk5hbWU6IHN0cmluZywgYXJnczogdW5rbm93bltdKTogdW5rbm93bltdIHtcblx0Ly8gY3JlYXRlUHJvY2VzcyBzaWduYXR1cmU6IHNoZWxsTGF1bmNoQ29uZmlnLCBjd2QsIGNvbHMsIHJvd3MsIHVuaWNvZGVWZXJzaW9uLCBlbnYgKGluZGV4IDUpLCBleGVjdXRhYmxlRW52IChpbmRleCA2KSwgLi4uXG5cdGlmIChmbk5hbWUgPT09ICdjcmVhdGVQcm9jZXNzJyAmJiBhcmdzLmxlbmd0aCA+IDUpIHtcblx0XHRjb25zdCBzYW5pdGl6ZWRBcmdzID0gWy4uLmFyZ3NdO1xuXHRcdGlmIChhcmdzWzVdICYmIHR5cGVvZiBhcmdzWzVdID09PSAnb2JqZWN0Jykge1xuXHRcdFx0c2FuaXRpemVkQXJnc1s1XSA9IHNhbml0aXplRW52Rm9yTG9nZ2luZyhhcmdzWzVdIGFzIElQcm9jZXNzRW52aXJvbm1lbnQpO1xuXHRcdH1cblx0XHRpZiAoYXJnc1s2XSAmJiB0eXBlb2YgYXJnc1s2XSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdHNhbml0aXplZEFyZ3NbNl0gPSBzYW5pdGl6ZUVudkZvckxvZ2dpbmcoYXJnc1s2XSBhcyBJUHJvY2Vzc0Vudmlyb25tZW50KTtcblx0XHR9XG5cdFx0cmV0dXJuIHNhbml0aXplZEFyZ3M7XG5cdH1cblx0cmV0dXJuIGFyZ3M7XG59XG5cbmludGVyZmFjZSBJVHJhY2VScGNBcmdzIHtcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG5cdHNpbXVsYXRlZExhdGVuY3k6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRyYWNlUnBjKF90YXJnZXQ6IE9iamVjdCwga2V5OiBzdHJpbmcsIGRlc2NyaXB0b3I6IFByb3BlcnR5RGVzY3JpcHRvcikge1xuXHRpZiAoIWlzRnVuY3Rpb24oZGVzY3JpcHRvci52YWx1ZSkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBzdXBwb3J0ZWQnKTtcblx0fVxuXHRjb25zdCBmbktleSA9ICd2YWx1ZSc7XG5cdGNvbnN0IGZuID0gZGVzY3JpcHRvci52YWx1ZTtcblx0ZGVzY3JpcHRvcltmbktleV0gPSBhc3luYyBmdW5jdGlvbiA8VFRoaXMgZXh0ZW5kcyB7IHRyYWNlUnBjQXJnczogSVRyYWNlUnBjQXJncyB9Pih0aGlzOiBUVGhpcywgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0aWYgKHRoaXMudHJhY2VScGNBcmdzLmxvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSA9PT0gTG9nTGV2ZWwuVHJhY2UpIHtcblx0XHRcdGNvbnN0IHNhbml0aXplZEFyZ3MgPSBzYW5pdGl6ZUFyZ3NGb3JMb2dnaW5nKGZuLm5hbWUsIGFyZ3MpO1xuXHRcdFx0dGhpcy50cmFjZVJwY0FyZ3MubG9nU2VydmljZS50cmFjZShgW1JQQyBSZXF1ZXN0XSBQdHlTZXJ2aWNlIyR7Zm4ubmFtZX0oJHtzYW5pdGl6ZWRBcmdzLm1hcChlID0+IEpTT04uc3RyaW5naWZ5KGUpKS5qb2luKCcsICcpfSlgKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudHJhY2VScGNBcmdzLnNpbXVsYXRlZExhdGVuY3kpIHtcblx0XHRcdGF3YWl0IHRpbWVvdXQodGhpcy50cmFjZVJwY0FyZ3Muc2ltdWxhdGVkTGF0ZW5jeSk7XG5cdFx0fVxuXHRcdGxldCByZXN1bHQ6IHVua25vd247XG5cdFx0dHJ5IHtcblx0XHRcdHJlc3VsdCA9IGF3YWl0IGZuLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMudHJhY2VScGNBcmdzLmxvZ1NlcnZpY2UuZXJyb3IoYFtSUEMgUmVzcG9uc2VdIFB0eVNlcnZpY2UjJHtmbi5uYW1lfWAsIGUpO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudHJhY2VScGNBcmdzLmxvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSA9PT0gTG9nTGV2ZWwuVHJhY2UpIHtcblx0XHRcdHRoaXMudHJhY2VScGNBcmdzLmxvZ1NlcnZpY2UudHJhY2UoYFtSUEMgUmVzcG9uc2VdIFB0eVNlcnZpY2UjJHtmbi5uYW1lfWAsIHJlc3VsdCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH07XG59XG5cbnR5cGUgV29ya3NwYWNlSWQgPSBzdHJpbmc7XG5cbmxldCBTZXJpYWxpemVBZGRvbjogdHlwZW9mIFh0ZXJtU2VyaWFsaXplQWRkb247XG5sZXQgVW5pY29kZTExQWRkb246IHR5cGVvZiBYdGVybVVuaWNvZGUxMUFkZG9uO1xuXG5leHBvcnQgY2xhc3MgUHR5U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHR5U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3B0eXM6IE1hcDxudW1iZXIsIFBlcnNpc3RlbnRUZXJtaW5hbFByb2Nlc3M+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VMYXlvdXRJbmZvcyA9IG5ldyBNYXA8V29ya3NwYWNlSWQsIElTZXRUZXJtaW5hbExheW91dEluZm9BcmdzPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZXRhY2hJbnN0YW5jZVJlcXVlc3RTdG9yZTogUmVxdWVzdFN0b3JlPElQcm9jZXNzRGV0YWlscyB8IHVuZGVmaW5lZCwgeyB3b3Jrc3BhY2VJZDogc3RyaW5nOyBpbnN0YW5jZUlkOiBudW1iZXIgfT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jldml2ZWRQdHlJZE1hcDogTWFwPHN0cmluZywgeyBuZXdJZDogbnVtYmVyOyBzdGF0ZTogSVNlcmlhbGl6ZWRUZXJtaW5hbFN0YXRlIH0+ID0gbmV3IE1hcCgpO1xuXG5cdC8vICNyZWdpb24gUHR5IHNlcnZpY2UgY29udHJpYnV0aW9uIFJQQyBjYWxsc1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dG9SZXBsaWVzQ29udHJpYnV0aW9uOiBBdXRvUmVwbGllc1B0eVNlcnZpY2VDb250cmlidXRpb247XG5cdEB0cmFjZVJwY1xuXHRhc3luYyBpbnN0YWxsQXV0b1JlcGx5KG1hdGNoOiBzdHJpbmcsIHJlcGx5OiBzdHJpbmcpIHtcblx0XHRhd2FpdCB0aGlzLl9hdXRvUmVwbGllc0NvbnRyaWJ1dGlvbi5pbnN0YWxsQXV0b1JlcGx5KG1hdGNoLCByZXBseSk7XG5cdH1cblx0QHRyYWNlUnBjXG5cdGFzeW5jIHVuaW5zdGFsbEFsbEF1dG9SZXBsaWVzKCkge1xuXHRcdGF3YWl0IHRoaXMuX2F1dG9SZXBsaWVzQ29udHJpYnV0aW9uLnVuaW5zdGFsbEFsbEF1dG9SZXBsaWVzKCk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udHJpYnV0aW9uczogSVB0eVNlcnZpY2VDb250cmlidXRpb25bXTtcblxuXHRwcml2YXRlIF9sYXN0UHR5SWQ6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25IZWFydGJlYXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25IZWFydGJlYXQgPSB0aGlzLl90cmFjZUV2ZW50KCdfb25IZWFydGJlYXQnLCB0aGlzLl9vbkhlYXJ0YmVhdC5ldmVudCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzRGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaWQ6IG51bWJlcjsgZXZlbnQ6IElQcm9jZXNzRGF0YUV2ZW50IHwgc3RyaW5nIH0+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NEYXRhID0gdGhpcy5fdHJhY2VFdmVudCgnX29uUHJvY2Vzc0RhdGEnLCB0aGlzLl9vblByb2Nlc3NEYXRhLmV2ZW50KTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzUmVwbGF5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBpZDogbnVtYmVyOyBldmVudDogSVB0eUhvc3RQcm9jZXNzUmVwbGF5RXZlbnQgfT4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc1JlcGxheSA9IHRoaXMuX3RyYWNlRXZlbnQoJ19vblByb2Nlc3NSZXBsYXknLCB0aGlzLl9vblByb2Nlc3NSZXBsYXkuZXZlbnQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NSZWFkeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaWQ6IG51bWJlcjsgZXZlbnQ6IElQcm9jZXNzUmVhZHlFdmVudCB9PigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzUmVhZHkgPSB0aGlzLl90cmFjZUV2ZW50KCdfb25Qcm9jZXNzUmVhZHknLCB0aGlzLl9vblByb2Nlc3NSZWFkeS5ldmVudCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc0V4aXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGlkOiBudW1iZXI7IGV2ZW50OiBudW1iZXIgfCB1bmRlZmluZWQgfT4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc0V4aXQgPSB0aGlzLl90cmFjZUV2ZW50KCdfb25Qcm9jZXNzRXhpdCcsIHRoaXMuX29uUHJvY2Vzc0V4aXQuZXZlbnQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NPcnBoYW5RdWVzdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaWQ6IG51bWJlciB9PigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzT3JwaGFuUXVlc3Rpb24gPSB0aGlzLl90cmFjZUV2ZW50KCdfb25Qcm9jZXNzT3JwaGFuUXVlc3Rpb24nLCB0aGlzLl9vblByb2Nlc3NPcnBoYW5RdWVzdGlvbi5ldmVudCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdERldGFjaCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVxdWVzdElkOiBudW1iZXI7IHdvcmtzcGFjZUlkOiBzdHJpbmc7IGluc3RhbmNlSWQ6IG51bWJlciB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0RGV0YWNoID0gdGhpcy5fdHJhY2VFdmVudCgnX29uRGlkUmVxdWVzdERldGFjaCcsIHRoaXMuX29uRGlkUmVxdWVzdERldGFjaC5ldmVudCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUHJvcGVydHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGlkOiBudW1iZXI7IHByb3BlcnR5OiBJUHJvY2Vzc1Byb3BlcnR5IH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVByb3BlcnR5ID0gdGhpcy5fdHJhY2VFdmVudCgnX29uRGlkQ2hhbmdlUHJvcGVydHknLCB0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmV2ZW50KTtcblxuXHRwcml2YXRlIF90cmFjZUV2ZW50PFQ+KG5hbWU6IHN0cmluZywgZXZlbnQ6IEV2ZW50PFQ+KTogRXZlbnQ8VD4ge1xuXHRcdGV2ZW50KGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSA9PT0gTG9nTGV2ZWwuVHJhY2UpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1JQQyBFdmVudF0gUHR5U2VydmljZSMke25hbWV9LmZpcmUoJHtKU09OLnN0cmluZ2lmeShlKX0pYCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGV2ZW50O1xuXHR9XG5cblx0QG1lbW9pemVcblx0Z2V0IHRyYWNlUnBjQXJncygpOiBJVHJhY2VScGNBcmdzIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bG9nU2VydmljZTogdGhpcy5fbG9nU2VydmljZSxcblx0XHRcdHNpbXVsYXRlZExhdGVuY3k6IHRoaXMuX3NpbXVsYXRlZExhdGVuY3lcblx0XHR9O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZWNvbm5lY3RDb25zdGFudHM6IElSZWNvbm5lY3RDb25zdGFudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2ltdWxhdGVkTGF0ZW5jeTogbnVtYmVyXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBwdHkgb2YgdGhpcy5fcHR5cy52YWx1ZXMoKSkge1xuXHRcdFx0XHRwdHkuc2h1dGRvd24odHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wdHlzLmNsZWFyKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGV0YWNoSW5zdGFuY2VSZXF1ZXN0U3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVxdWVzdFN0b3JlKHVuZGVmaW5lZCwgdGhpcy5fbG9nU2VydmljZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RldGFjaEluc3RhbmNlUmVxdWVzdFN0b3JlLm9uQ3JlYXRlUmVxdWVzdCh0aGlzLl9vbkRpZFJlcXVlc3REZXRhY2guZmlyZSwgdGhpcy5fb25EaWRSZXF1ZXN0RGV0YWNoKSk7XG5cblx0XHR0aGlzLl9hdXRvUmVwbGllc0NvbnRyaWJ1dGlvbiA9IG5ldyBBdXRvUmVwbGllc1B0eVNlcnZpY2VDb250cmlidXRpb24odGhpcy5fbG9nU2VydmljZSk7XG5cblx0XHR0aGlzLl9jb250cmlidXRpb25zID0gW3RoaXMuX2F1dG9SZXBsaWVzQ29udHJpYnV0aW9uXTtcblxuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIHJlZnJlc2hJZ25vcmVQcm9jZXNzTmFtZXMobmFtZXM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWdub3JlUHJvY2Vzc05hbWVzLmxlbmd0aCA9IDA7XG5cdFx0aWdub3JlUHJvY2Vzc05hbWVzLnB1c2goLi4ubmFtZXMpO1xuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIHJlcXVlc3REZXRhY2hJbnN0YW5jZSh3b3Jrc3BhY2VJZDogc3RyaW5nLCBpbnN0YW5jZUlkOiBudW1iZXIpOiBQcm9taXNlPElQcm9jZXNzRGV0YWlscyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9kZXRhY2hJbnN0YW5jZVJlcXVlc3RTdG9yZS5jcmVhdGVSZXF1ZXN0KHsgd29ya3NwYWNlSWQsIGluc3RhbmNlSWQgfSk7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgYWNjZXB0RGV0YWNoSW5zdGFuY2VSZXBseShyZXF1ZXN0SWQ6IG51bWJlciwgcGVyc2lzdGVudFByb2Nlc3NJZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHByb2Nlc3NEZXRhaWxzOiBJUHJvY2Vzc0RldGFpbHMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcHR5ID0gdGhpcy5fcHR5cy5nZXQocGVyc2lzdGVudFByb2Nlc3NJZCk7XG5cdFx0aWYgKHB0eSkge1xuXHRcdFx0cHJvY2Vzc0RldGFpbHMgPSBhd2FpdCB0aGlzLl9idWlsZFByb2Nlc3NEZXRhaWxzKHBlcnNpc3RlbnRQcm9jZXNzSWQsIHB0eSk7XG5cdFx0fVxuXHRcdHRoaXMuX2RldGFjaEluc3RhbmNlUmVxdWVzdFN0b3JlLmFjY2VwdFJlcGx5KHJlcXVlc3RJZCwgcHJvY2Vzc0RldGFpbHMpO1xuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIGZyZWVQb3J0S2lsbFByb2Nlc3MocG9ydDogc3RyaW5nKTogUHJvbWlzZTx7IHBvcnQ6IHN0cmluZzsgcHJvY2Vzc0lkOiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHN0ZG91dCA9IGF3YWl0IG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0ZXhlYyhpc1dpbmRvd3MgPyBgbmV0c3RhdCAtYW5vIHwgZmluZHN0ciBcIiR7cG9ydH1cImAgOiBgbHNvZiAtblAgLWlUQ1AgLXNUQ1A6TElTVEVOIHwgZ3JlcCAke3BvcnR9YCwge30sIChlcnIsIHN0ZG91dCkgPT4ge1xuXHRcdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlamVjdCgnUHJvYmxlbSBvY2N1cnJlZCB3aGVuIGxpc3RpbmcgYWN0aXZlIHByb2Nlc3NlcycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc29sdmUoc3Rkb3V0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdGNvbnN0IHByb2Nlc3Nlc0ZvclBvcnQgPSBzdGRvdXQuc3BsaXQoL1xccj9cXG4vKS5maWx0ZXIocyA9PiAhIXMudHJpbSgpKTtcblx0XHRpZiAocHJvY2Vzc2VzRm9yUG9ydC5sZW5ndGggPj0gMSkge1xuXHRcdFx0Y29uc3QgY2FwdHVyZVBpZCA9IC9cXHMrKFxcZCspKD86XFxzK3wkKS87XG5cdFx0XHRjb25zdCBwcm9jZXNzSWQgPSBwcm9jZXNzZXNGb3JQb3J0WzBdLm1hdGNoKGNhcHR1cmVQaWQpPy5bMV07XG5cdFx0XHRpZiAocHJvY2Vzc0lkKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cHJvY2Vzcy5raWxsKE51bWJlci5wYXJzZUludChwcm9jZXNzSWQpKTtcblx0XHRcdFx0fSBjYXRjaCB7IH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgUHJvY2Vzc2VzIGZvciBwb3J0ICR7cG9ydH0gd2VyZSBub3QgZm91bmRgKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHBvcnQsIHByb2Nlc3NJZCB9O1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBraWxsIHByb2Nlc3Mgd2l0aCBwb3J0ICR7cG9ydH1gKTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBzZXJpYWxpemVUZXJtaW5hbFN0YXRlKGlkczogbnVtYmVyW10pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPElTZXJpYWxpemVkVGVybWluYWxTdGF0ZT5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW3BlcnNpc3RlbnRQcm9jZXNzSWQsIHBlcnNpc3RlbnRQcm9jZXNzXSBvZiB0aGlzLl9wdHlzLmVudHJpZXMoKSkge1xuXHRcdFx0Ly8gT25seSBzZXJpYWxpemUgcGVyc2lzdGVudCBwcm9jZXNzZXMgdGhhdCBoYXZlIGhhZCBkYXRhIHdyaXR0ZW4gb3IgcGVyZm9ybWVkIGEgcmVwbGF5XG5cdFx0XHRpZiAocGVyc2lzdGVudFByb2Nlc3MuaGFzV3JpdHRlbkRhdGEgJiYgaWRzLmluZGV4T2YocGVyc2lzdGVudFByb2Nlc3NJZCkgIT09IC0xKSB7XG5cdFx0XHRcdHByb21pc2VzLnB1c2goUHJvbWlzZXMud2l0aEFzeW5jQm9keTxJU2VyaWFsaXplZFRlcm1pbmFsU3RhdGU+KGFzeW5jIHIgPT4ge1xuXHRcdFx0XHRcdHIoe1xuXHRcdFx0XHRcdFx0aWQ6IHBlcnNpc3RlbnRQcm9jZXNzSWQsXG5cdFx0XHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZzogcGVyc2lzdGVudFByb2Nlc3Muc2hlbGxMYXVuY2hDb25maWcsXG5cdFx0XHRcdFx0XHRwcm9jZXNzRGV0YWlsczogYXdhaXQgdGhpcy5fYnVpbGRQcm9jZXNzRGV0YWlscyhwZXJzaXN0ZW50UHJvY2Vzc0lkLCBwZXJzaXN0ZW50UHJvY2VzcyksXG5cdFx0XHRcdFx0XHRwcm9jZXNzTGF1bmNoQ29uZmlnOiBwZXJzaXN0ZW50UHJvY2Vzcy5wcm9jZXNzTGF1bmNoT3B0aW9ucyxcblx0XHRcdFx0XHRcdHVuaWNvZGVWZXJzaW9uOiBwZXJzaXN0ZW50UHJvY2Vzcy51bmljb2RlVmVyc2lvbixcblx0XHRcdFx0XHRcdHJlcGxheUV2ZW50OiBhd2FpdCBwZXJzaXN0ZW50UHJvY2Vzcy5zZXJpYWxpemVOb3JtYWxCdWZmZXIoKSxcblx0XHRcdFx0XHRcdHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHNlcmlhbGl6ZWQ6IElDcm9zc1ZlcnNpb25TZXJpYWxpemVkVGVybWluYWxTdGF0ZSA9IHtcblx0XHRcdHZlcnNpb246IDEsXG5cdFx0XHRzdGF0ZTogYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpXG5cdFx0fTtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoc2VyaWFsaXplZCk7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgcmV2aXZlVGVybWluYWxQcm9jZXNzZXMod29ya3NwYWNlSWQ6IHN0cmluZywgc3RhdGU6IElTZXJpYWxpemVkVGVybWluYWxTdGF0ZVtdLCBkYXRlVGltZUZvcm1hdExvY2FsZTogc3RyaW5nKSB7XG5cdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdGVybWluYWwgb2Ygc3RhdGUpIHtcblx0XHRcdHByb21pc2VzLnB1c2godGhpcy5fcmV2aXZlVGVybWluYWxQcm9jZXNzKHdvcmtzcGFjZUlkLCB0ZXJtaW5hbCkpO1xuXHRcdH1cblx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXZpdmVUZXJtaW5hbFByb2Nlc3Mod29ya3NwYWNlSWQ6IHN0cmluZywgdGVybWluYWw6IElTZXJpYWxpemVkVGVybWluYWxTdGF0ZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc3RvcmVNZXNzYWdlID0gbG9jYWxpemUoJ3Rlcm1pbmFsLWhpc3RvcnktcmVzdG9yZWQnLCBcIkhpc3RvcnkgcmVzdG9yZWRcIik7XG5cblx0XHQvLyBDb25wdHkgdjEuMjIrIHVzZXMgcGFzc3Rocm91Z2ggYW5kIGRvZXNuJ3QgcmVwcmludCB0aGUgYnVmZmVyIG9mdGVuLCB0aGlzIG1lYW5zIHRoYXQgd2hlblxuXHRcdC8vIHRoZSB0ZXJtaW5hbCBpcyByZXZpdmVkLCB0aGUgY3Vyc29yIHdvdWxkIGJlIGF0IHRoZSBib3R0b20gb2YgdGhlIGJ1ZmZlciB0aGVuIHdoZW5cblx0XHQvLyBQU1JlYWRMaW5lIHJlcXVlc3RzIGBHZXRDb25zb2xlQ3Vyc29ySW5mb2AgaXQgd2lsbCBiZSBoYW5kbGVkIGJ5IGNvbnB0eSBpdHNlbGYgYnkgZGVzaWduLlxuXHRcdC8vIFRoaXMgY2F1c2VzIHRoZSBjdXJzb3IgdG8gbW92ZSB0byB0aGUgdG9wIGludG8gdGhlIHJlcGxheWVkIHRlcm1pbmFsIGNvbnRlbnRzLiBUbyBhdm9pZFxuXHRcdC8vIHRoaXMsIHRoZSBwb3N0IHJlc3RvcmUgbWVzc2FnZSB3aWxsIHByaW50IG5ldyBsaW5lcyB0byBnZXQgYSBjbGVhciB2aWV3cG9ydCBhbmQgcHV0IHRoZVxuXHRcdC8vIGN1cnNvciBiYWNrIGF0IHRvIHRvcCBsZWZ0LlxuXHRcdGxldCBwb3N0UmVzdG9yZU1lc3NhZ2UgPSAnJztcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRjb25zdCBsYXN0UmVwbGF5RXZlbnQgPSB0ZXJtaW5hbC5yZXBsYXlFdmVudC5ldmVudHMubGVuZ3RoID4gMCA/IHRlcm1pbmFsLnJlcGxheUV2ZW50LmV2ZW50cy5hdCgtMSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAobGFzdFJlcGxheUV2ZW50KSB7XG5cdFx0XHRcdHBvc3RSZXN0b3JlTWVzc2FnZSArPSAnXFxyXFxuJy5yZXBlYXQobGFzdFJlcGxheUV2ZW50LnJvd3MgLSAxKSArIGBcXHgxYltIYDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUT0RPOiBXZSBtYXkgYXQgc29tZSBwb2ludCB3YW50IHRvIHNob3cgZGF0ZSBpbmZvcm1hdGlvbiBpbiBhIGhvdmVyIHZpYSBhIGN1c3RvbSBzZXF1ZW5jZTpcblx0XHQvLyAgIG5ldyBEYXRlKHRlcm1pbmFsLnRpbWVzdGFtcCkudG9Mb2NhbGVEYXRlU3RyaW5nKGRhdGVUaW1lRm9ybWF0TG9jYWxlKVxuXHRcdC8vICAgbmV3IERhdGUodGVybWluYWwudGltZXN0YW1wKS50b0xvY2FsZVRpbWVTdHJpbmcoZGF0ZVRpbWVGb3JtYXRMb2NhbGUpXG5cdFx0Y29uc3QgbmV3SWQgPSBhd2FpdCB0aGlzLmNyZWF0ZVByb2Nlc3MoXG5cdFx0XHR7XG5cdFx0XHRcdC4uLnRlcm1pbmFsLnNoZWxsTGF1bmNoQ29uZmlnLFxuXHRcdFx0XHRjd2Q6IHRlcm1pbmFsLnByb2Nlc3NEZXRhaWxzLmN3ZCxcblx0XHRcdFx0Y29sb3I6IHRlcm1pbmFsLnByb2Nlc3NEZXRhaWxzLmNvbG9yLFxuXHRcdFx0XHRpY29uOiB0ZXJtaW5hbC5wcm9jZXNzRGV0YWlscy5pY29uLFxuXHRcdFx0XHRuYW1lOiB0ZXJtaW5hbC5wcm9jZXNzRGV0YWlscy50aXRsZVNvdXJjZSA9PT0gVGl0bGVFdmVudFNvdXJjZS5BcGkgPyB0ZXJtaW5hbC5wcm9jZXNzRGV0YWlscy50aXRsZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aW5pdGlhbFRleHQ6IHRlcm1pbmFsLnJlcGxheUV2ZW50LmV2ZW50c1swXS5kYXRhICsgZm9ybWF0TWVzc2FnZUZvclRlcm1pbmFsKHJlc3RvcmVNZXNzYWdlLCB7IGxvdWRGb3JtYXR0aW5nOiB0cnVlIH0pICsgcG9zdFJlc3RvcmVNZXNzYWdlXG5cdFx0XHR9LFxuXHRcdFx0dGVybWluYWwucHJvY2Vzc0RldGFpbHMuY3dkLFxuXHRcdFx0dGVybWluYWwucmVwbGF5RXZlbnQuZXZlbnRzWzBdLmNvbHMsXG5cdFx0XHR0ZXJtaW5hbC5yZXBsYXlFdmVudC5ldmVudHNbMF0ucm93cyxcblx0XHRcdHRlcm1pbmFsLnVuaWNvZGVWZXJzaW9uLFxuXHRcdFx0dGVybWluYWwucHJvY2Vzc0xhdW5jaENvbmZpZy5lbnYsXG5cdFx0XHR0ZXJtaW5hbC5wcm9jZXNzTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGVFbnYsXG5cdFx0XHR0ZXJtaW5hbC5wcm9jZXNzTGF1bmNoQ29uZmlnLm9wdGlvbnMsXG5cdFx0XHR0cnVlLFxuXHRcdFx0dGVybWluYWwucHJvY2Vzc0RldGFpbHMud29ya3NwYWNlSWQsXG5cdFx0XHR0ZXJtaW5hbC5wcm9jZXNzRGV0YWlscy53b3Jrc3BhY2VOYW1lLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHRlcm1pbmFsLnJlcGxheUV2ZW50LmV2ZW50c1swXS5kYXRhXG5cdFx0KTtcblx0XHQvLyBEb24ndCBzdGFydCB0aGUgcHJvY2VzcyBoZXJlIGFzIHRoZXJlJ3Mgbm8gdGVybWluYWwgdG8gYW5zd2VyIENQUlxuXHRcdGNvbnN0IG9sZElkID0gdGhpcy5fZ2V0UmV2aXZpbmdQcm9jZXNzSWQod29ya3NwYWNlSWQsIHRlcm1pbmFsLmlkKTtcblx0XHR0aGlzLl9yZXZpdmVkUHR5SWRNYXAuc2V0KG9sZElkLCB7IG5ld0lkLCBzdGF0ZTogdGVybWluYWwgfSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBSZXZpdmVkIHByb2Nlc3MsIG9sZCBpZCAke29sZElkfSAtPiBuZXcgaWQgJHtuZXdJZH1gKTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBzaHV0ZG93bkFsbCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBjcmVhdGVQcm9jZXNzKFxuXHRcdHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsXG5cdFx0Y3dkOiBzdHJpbmcsXG5cdFx0Y29sczogbnVtYmVyLFxuXHRcdHJvd3M6IG51bWJlcixcblx0XHR1bmljb2RlVmVyc2lvbjogJzYnIHwgJzExJyxcblx0XHRlbnY6IElQcm9jZXNzRW52aXJvbm1lbnQsXG5cdFx0ZXhlY3V0YWJsZUVudjogSVByb2Nlc3NFbnZpcm9ubWVudCxcblx0XHRvcHRpb25zOiBJVGVybWluYWxQcm9jZXNzT3B0aW9ucyxcblx0XHRzaG91bGRQZXJzaXN0OiBib29sZWFuLFxuXHRcdHdvcmtzcGFjZUlkOiBzdHJpbmcsXG5cdFx0d29ya3NwYWNlTmFtZTogc3RyaW5nLFxuXHRcdGlzUmV2aXZpbmc/OiBib29sZWFuLFxuXHRcdHJhd1Jldml2ZUJ1ZmZlcj86IHN0cmluZ1xuXHQpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGlmIChzaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBdHRlbXB0IHRvIGNyZWF0ZSBhIHByb2Nlc3Mgd2hlbiBhdHRhY2ggb2JqZWN0IHdhcyBwcm92aWRlZCcpO1xuXHRcdH1cblx0XHRjb25zdCBpZCA9ICsrdGhpcy5fbGFzdFB0eUlkO1xuXHRcdGNvbnN0IHByb2Nlc3MgPSBuZXcgVGVybWluYWxQcm9jZXNzKHNoZWxsTGF1bmNoQ29uZmlnLCBjd2QsIGNvbHMsIHJvd3MsIGVudiwgZXhlY3V0YWJsZUVudiwgb3B0aW9ucywgdGhpcy5fbG9nU2VydmljZSwgdGhpcy5fcHJvZHVjdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2Nlc3NMYXVuY2hPcHRpb25zOiBJUGVyc2lzdGVudFRlcm1pbmFsUHJvY2Vzc0xhdW5jaENvbmZpZyA9IHtcblx0XHRcdGVudixcblx0XHRcdGV4ZWN1dGFibGVFbnYsXG5cdFx0XHRvcHRpb25zXG5cdFx0fTtcblx0XHRjb25zdCBwZXJzaXN0ZW50UHJvY2VzcyA9IG5ldyBQZXJzaXN0ZW50VGVybWluYWxQcm9jZXNzKGlkLCBwcm9jZXNzLCB3b3Jrc3BhY2VJZCwgd29ya3NwYWNlTmFtZSwgc2hvdWxkUGVyc2lzdCwgY29scywgcm93cywgcHJvY2Vzc0xhdW5jaE9wdGlvbnMsIHVuaWNvZGVWZXJzaW9uLCB0aGlzLl9yZWNvbm5lY3RDb25zdGFudHMsIHRoaXMuX2xvZ1NlcnZpY2UsIGlzUmV2aXZpbmcgJiYgaXNTdHJpbmcoc2hlbGxMYXVuY2hDb25maWcuaW5pdGlhbFRleHQpID8gc2hlbGxMYXVuY2hDb25maWcuaW5pdGlhbFRleHQgOiB1bmRlZmluZWQsIHJhd1Jldml2ZUJ1ZmZlciwgc2hlbGxMYXVuY2hDb25maWcuaWNvbiwgc2hlbGxMYXVuY2hDb25maWcuY29sb3IsIHNoZWxsTGF1bmNoQ29uZmlnLm5hbWUsIHNoZWxsTGF1bmNoQ29uZmlnLmZpeGVkRGltZW5zaW9ucyk7XG5cdFx0cHJvY2Vzcy5vblByb2Nlc3NFeGl0KGV2ZW50ID0+IHtcblx0XHRcdGZvciAoY29uc3QgY29udHJpYiBvZiB0aGlzLl9jb250cmlidXRpb25zKSB7XG5cdFx0XHRcdGNvbnRyaWIuaGFuZGxlUHJvY2Vzc0Rpc3Bvc2UoaWQpO1xuXHRcdFx0fVxuXHRcdFx0cGVyc2lzdGVudFByb2Nlc3MuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fcHR5cy5kZWxldGUoaWQpO1xuXHRcdFx0dGhpcy5fb25Qcm9jZXNzRXhpdC5maXJlKHsgaWQsIGV2ZW50IH0pO1xuXHRcdH0pO1xuXHRcdHBlcnNpc3RlbnRQcm9jZXNzLm9uUHJvY2Vzc0RhdGEoZXZlbnQgPT4gdGhpcy5fb25Qcm9jZXNzRGF0YS5maXJlKHsgaWQsIGV2ZW50IH0pKTtcblx0XHRwZXJzaXN0ZW50UHJvY2Vzcy5vblByb2Nlc3NSZXBsYXkoZXZlbnQgPT4gdGhpcy5fb25Qcm9jZXNzUmVwbGF5LmZpcmUoeyBpZCwgZXZlbnQgfSkpO1xuXHRcdHBlcnNpc3RlbnRQcm9jZXNzLm9uUHJvY2Vzc1JlYWR5KGV2ZW50ID0+IHRoaXMuX29uUHJvY2Vzc1JlYWR5LmZpcmUoeyBpZCwgZXZlbnQgfSkpO1xuXHRcdHBlcnNpc3RlbnRQcm9jZXNzLm9uUHJvY2Vzc09ycGhhblF1ZXN0aW9uKCgpID0+IHRoaXMuX29uUHJvY2Vzc09ycGhhblF1ZXN0aW9uLmZpcmUoeyBpZCB9KSk7XG5cdFx0cGVyc2lzdGVudFByb2Nlc3Mub25EaWRDaGFuZ2VQcm9wZXJ0eShwcm9wZXJ0eSA9PiB0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmZpcmUoeyBpZCwgcHJvcGVydHkgfSkpO1xuXHRcdHBlcnNpc3RlbnRQcm9jZXNzLm9uUGVyc2lzdGVudFByb2Nlc3NSZWFkeSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWIgb2YgdGhpcy5fY29udHJpYnV0aW9ucykge1xuXHRcdFx0XHRjb250cmliLmhhbmRsZVByb2Nlc3NSZWFkeShpZCwgcHJvY2Vzcyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fcHR5cy5zZXQoaWQsIHBlcnNpc3RlbnRQcm9jZXNzKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgYXR0YWNoVG9Qcm9jZXNzKGlkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fdGhyb3dJZk5vUHR5KGlkKS5hdHRhY2goKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgUGVyc2lzdGVudCBwcm9jZXNzIHJlY29ubmVjdGlvbiBcIiR7aWR9XCJgKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFBlcnNpc3RlbnQgcHJvY2VzcyByZWNvbm5lY3Rpb24gXCIke2lkfVwiIGZhaWxlZGAsIGUubWVzc2FnZSk7XG5cdFx0XHR0aHJvdyBlO1xuXHRcdH1cblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyB1cGRhdGVUaXRsZShpZDogbnVtYmVyLCB0aXRsZTogc3RyaW5nLCB0aXRsZVNvdXJjZTogVGl0bGVFdmVudFNvdXJjZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3Rocm93SWZOb1B0eShpZCkuc2V0VGl0bGUodGl0bGUsIHRpdGxlU291cmNlKTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyB1cGRhdGVJY29uKGlkOiBudW1iZXIsIHVzZXJJbml0aWF0ZWQ6IGJvb2xlYW4sIGljb246IFVSSSB8IHsgbGlnaHQ6IFVSSTsgZGFyazogVVJJIH0gfCB7IGlkOiBzdHJpbmc7IGNvbG9yPzogeyBpZDogc3RyaW5nIH0gfSwgY29sb3I/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl90aHJvd0lmTm9QdHkoaWQpLnNldEljb24odXNlckluaXRpYXRlZCwgaWNvbiwgY29sb3IpO1xuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIGNsZWFyQnVmZmVyKGlkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl90aHJvd0lmTm9QdHkoaWQpLmNsZWFyQnVmZmVyKCk7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgcmVmcmVzaFByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPihpZDogbnVtYmVyLCB0eXBlOiBUKTogUHJvbWlzZTxJUHJvY2Vzc1Byb3BlcnR5TWFwW1RdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rocm93SWZOb1B0eShpZCkucmVmcmVzaFByb3BlcnR5KHR5cGUpO1xuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIHVwZGF0ZVByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPihpZDogbnVtYmVyLCB0eXBlOiBULCB2YWx1ZTogSVByb2Nlc3NQcm9wZXJ0eU1hcFtUXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl90aHJvd0lmTm9QdHkoaWQpLnVwZGF0ZVByb3BlcnR5KHR5cGUsIHZhbHVlKTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBkZXRhY2hGcm9tUHJvY2VzcyhpZDogbnVtYmVyLCBmb3JjZVBlcnNpc3Q/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rocm93SWZOb1B0eShpZCkuZGV0YWNoKGZvcmNlUGVyc2lzdCk7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgcmVkdWNlQ29ubmVjdGlvbkdyYWNlVGltZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHB0eSBvZiB0aGlzLl9wdHlzLnZhbHVlcygpKSB7XG5cdFx0XHRwdHkucmVkdWNlR3JhY2VUaW1lKCk7XG5cdFx0fVxuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIGxpc3RQcm9jZXNzZXMoKTogUHJvbWlzZTxJUHJvY2Vzc0RldGFpbHNbXT4ge1xuXHRcdGNvbnN0IHBlcnNpc3RlbnRQcm9jZXNzZXMgPSBBcnJheS5mcm9tKHRoaXMuX3B0eXMuZW50cmllcygpKS5maWx0ZXIoKFtfLCBwdHldKSA9PiBwdHkuc2hvdWxkUGVyc2lzdFRlcm1pbmFsKTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgTGlzdGluZyAke3BlcnNpc3RlbnRQcm9jZXNzZXMubGVuZ3RofSBwZXJzaXN0ZW50IHRlcm1pbmFscywgJHt0aGlzLl9wdHlzLnNpemV9IHRvdGFsIHRlcm1pbmFsc2ApO1xuXHRcdGNvbnN0IHByb21pc2VzID0gcGVyc2lzdGVudFByb2Nlc3Nlcy5tYXAoYXN5bmMgKFtpZCwgdGVybWluYWxQcm9jZXNzRGF0YV0pID0+IHRoaXMuX2J1aWxkUHJvY2Vzc0RldGFpbHMoaWQsIHRlcm1pbmFsUHJvY2Vzc0RhdGEpKTtcblx0XHRjb25zdCBhbGxUZXJtaW5hbHMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdFx0cmV0dXJuIGFsbFRlcm1pbmFscy5maWx0ZXIoZW50cnkgPT4gZW50cnkuaXNPcnBoYW4pO1xuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIGdldFBlcmZvcm1hbmNlTWFya3MoKTogUHJvbWlzZTxwZXJmb3JtYW5jZS5QZXJmb3JtYW5jZU1hcmtbXT4ge1xuXHRcdHJldHVybiBwZXJmb3JtYW5jZS5nZXRNYXJrcygpO1xuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIHN0YXJ0KGlkOiBudW1iZXIpOiBQcm9taXNlPElUZXJtaW5hbExhdW5jaEVycm9yIHwgSVRlcm1pbmFsTGF1bmNoUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcHR5ID0gdGhpcy5fcHR5cy5nZXQoaWQpO1xuXHRcdHJldHVybiBwdHkgPyBwdHkuc3RhcnQoKSA6IHsgbWVzc2FnZTogYENvdWxkIG5vdCBmaW5kIHB0eSB3aXRoIGlkIFwiJHtpZH1cImAgfTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBzaHV0ZG93bihpZDogbnVtYmVyLCBpbW1lZGlhdGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBEb24ndCB0aHJvdyBpZiB0aGUgcHR5IGlzIGFscmVhZHkgc2h1dGRvd25cblx0XHRyZXR1cm4gdGhpcy5fcHR5cy5nZXQoaWQpPy5zaHV0ZG93bihpbW1lZGlhdGUpO1xuXHR9XG5cdEB0cmFjZVJwY1xuXHRhc3luYyBpbnB1dChpZDogbnVtYmVyLCBkYXRhOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwdHkgPSB0aGlzLl90aHJvd0lmTm9QdHkoaWQpO1xuXHRcdGlmIChwdHkpIHtcblx0XHRcdGZvciAoY29uc3QgY29udHJpYiBvZiB0aGlzLl9jb250cmlidXRpb25zKSB7XG5cdFx0XHRcdGNvbnRyaWIuaGFuZGxlUHJvY2Vzc0lucHV0KGlkLCBkYXRhKTtcblx0XHRcdH1cblx0XHRcdHB0eS5pbnB1dChkYXRhKTtcblx0XHR9XG5cdH1cblx0QHRyYWNlUnBjXG5cdGFzeW5jIHNlbmRTaWduYWwoaWQ6IG51bWJlciwgc2lnbmFsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGhyb3dJZk5vUHR5KGlkKS5zZW5kU2lnbmFsKHNpZ25hbCk7XG5cdH1cblx0QHRyYWNlUnBjXG5cdGFzeW5jIHByb2Nlc3NCaW5hcnkoaWQ6IG51bWJlciwgZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rocm93SWZOb1B0eShpZCkud3JpdGVCaW5hcnkoZGF0YSk7XG5cdH1cblx0QHRyYWNlUnBjXG5cdGFzeW5jIHJlc2l6ZShpZDogbnVtYmVyLCBjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlciwgcGl4ZWxXaWR0aD86IG51bWJlciwgcGl4ZWxIZWlnaHQ/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwdHkgPSB0aGlzLl90aHJvd0lmTm9QdHkoaWQpO1xuXHRcdGlmIChwdHkpIHtcblx0XHRcdGZvciAoY29uc3QgY29udHJpYiBvZiB0aGlzLl9jb250cmlidXRpb25zKSB7XG5cdFx0XHRcdGNvbnRyaWIuaGFuZGxlUHJvY2Vzc1Jlc2l6ZShpZCwgY29scywgcm93cywgcGl4ZWxXaWR0aCwgcGl4ZWxIZWlnaHQpO1xuXHRcdFx0fVxuXHRcdFx0cHR5LnJlc2l6ZShjb2xzLCByb3dzLCBwaXhlbFdpZHRoLCBwaXhlbEhlaWdodCk7XG5cdFx0fVxuXHR9XG5cdEB0cmFjZVJwY1xuXHRhc3luYyBnZXRJbml0aWFsQ3dkKGlkOiBudW1iZXIpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl90aHJvd0lmTm9QdHkoaWQpLmdldEluaXRpYWxDd2QoKTtcblx0fVxuXHRAdHJhY2VScGNcblx0YXN5bmMgZ2V0Q3dkKGlkOiBudW1iZXIpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl90aHJvd0lmTm9QdHkoaWQpLmdldEN3ZCgpO1xuXHR9XG5cdEB0cmFjZVJwY1xuXHRhc3luYyBhY2tub3dsZWRnZURhdGFFdmVudChpZDogbnVtYmVyLCBjaGFyQ291bnQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl90aHJvd0lmTm9QdHkoaWQpLmFja25vd2xlZGdlRGF0YUV2ZW50KGNoYXJDb3VudCk7XG5cdH1cblx0QHRyYWNlUnBjXG5cdGFzeW5jIHNldFVuaWNvZGVWZXJzaW9uKGlkOiBudW1iZXIsIHZlcnNpb246ICc2JyB8ICcxMScpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGhyb3dJZk5vUHR5KGlkKS5zZXRVbmljb2RlVmVyc2lvbih2ZXJzaW9uKTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBzZXROZXh0Q29tbWFuZElkKGlkOiBudW1iZXIsIGNvbW1hbmRMaW5lOiBzdHJpbmcsIGNvbW1hbmRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rocm93SWZOb1B0eShpZCkuc2V0TmV4dENvbW1hbmRJZChjb21tYW5kTGluZSwgY29tbWFuZElkKTtcblx0fVxuXHRAdHJhY2VScGNcblx0YXN5bmMgZ2V0TGF0ZW5jeSgpOiBQcm9taXNlPElQdHlIb3N0TGF0ZW5jeU1lYXN1cmVtZW50W10+IHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0QHRyYWNlUnBjXG5cdGFzeW5jIG9ycGhhblF1ZXN0aW9uUmVwbHkoaWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl90aHJvd0lmTm9QdHkoaWQpLm9ycGhhblF1ZXN0aW9uUmVwbHkoKTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBnZXREZWZhdWx0U3lzdGVtU2hlbGwob3NPdmVycmlkZTogT3BlcmF0aW5nU3lzdGVtID0gT1MpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiBnZXRTeXN0ZW1TaGVsbChvc092ZXJyaWRlLCBwcm9jZXNzLmVudik7XG5cdH1cblxuXHRAdHJhY2VScGNcblx0YXN5bmMgZ2V0RW52aXJvbm1lbnQoKTogUHJvbWlzZTxJUHJvY2Vzc0Vudmlyb25tZW50PiB7XG5cdFx0cmV0dXJuIHsgLi4ucHJvY2Vzcy5lbnYgfTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBnZXRXc2xQYXRoKG9yaWdpbmFsOiBzdHJpbmcsIGRpcmVjdGlvbjogJ3VuaXgtdG8td2luJyB8ICd3aW4tdG8tdW5peCcgfCB1bmtub3duKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAoZGlyZWN0aW9uID09PSAnd2luLXRvLXVuaXgnKSB7XG5cdFx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0XHRyZXR1cm4gb3JpZ2luYWw7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYXdhaXQgZ2V0V2luZG93c0J1aWxkTnVtYmVyQXN5bmMoKSA8IDE3MDYzKSB7XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbC5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB3c2xFeGVjdXRhYmxlID0gYXdhaXQgdGhpcy5fZ2V0V1NMRXhlY3V0YWJsZVBhdGgoKTtcblx0XHRcdGlmICghd3NsRXhlY3V0YWJsZSkge1xuXHRcdFx0XHRyZXR1cm4gb3JpZ2luYWw7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPihjID0+IHtcblx0XHRcdFx0Y29uc3QgcHJvYyA9IGV4ZWNGaWxlKHdzbEV4ZWN1dGFibGUsIFsnLWUnLCAnd3NscGF0aCcsIG9yaWdpbmFsXSwge30sIChlcnJvciwgc3Rkb3V0LCBzdGRlcnIpID0+IHtcblx0XHRcdFx0XHRjKGVycm9yID8gb3JpZ2luYWwgOiBlc2NhcGVOb25XaW5kb3dzUGF0aChzdGRvdXQudHJpbSgpLCBQb3NpeFNoZWxsVHlwZS5CYXNoKSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRwcm9jLnN0ZGluIS5lbmQoKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAoZGlyZWN0aW9uID09PSAndW5peC10by13aW4nKSB7XG5cdFx0XHQvLyBUaGUgYmFja2VuZCBpcyBXaW5kb3dzLCBmb3IgZXhhbXBsZSBhIGxvY2FsIFdpbmRvd3Mgd29ya3NwYWNlIHdpdGggYSB3c2wgc2Vzc2lvbiBpblxuXHRcdFx0Ly8gdGhlIHRlcm1pbmFsLlxuXHRcdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0XHRpZiAoYXdhaXQgZ2V0V2luZG93c0J1aWxkTnVtYmVyQXN5bmMoKSA8IDE3MDYzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHdzbEV4ZWN1dGFibGUgPSBhd2FpdCB0aGlzLl9nZXRXU0xFeGVjdXRhYmxlUGF0aCgpO1xuXHRcdFx0XHRpZiAoIXdzbEV4ZWN1dGFibGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gb3JpZ2luYWw7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4oYyA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcHJvYyA9IGV4ZWNGaWxlKHdzbEV4ZWN1dGFibGUsIFsnLWUnLCAnd3NscGF0aCcsICctdycsIG9yaWdpbmFsXSwge30sIChlcnJvciwgc3Rkb3V0LCBzdGRlcnIpID0+IHtcblx0XHRcdFx0XHRcdGMoZXJyb3IgPyBvcmlnaW5hbCA6IHN0ZG91dC50cmltKCkpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHByb2Muc3RkaW4hLmVuZCgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gRmFsbGJhY2sganVzdCBpbiBjYXNlXG5cdFx0cmV0dXJuIG9yaWdpbmFsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0V1NMRXhlY3V0YWJsZVBhdGgoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB1c2VXU0xleGUgPSBhd2FpdCBnZXRXaW5kb3dzQnVpbGROdW1iZXJBc3luYygpID49IDE2Mjk5O1xuXHRcdGNvbnN0IGlzMzJQcm9jZXNzT242NFdpbmRvd3MgPSBwcm9jZXNzLmVudi5oYXNPd25Qcm9wZXJ0eSgnUFJPQ0VTU09SX0FSQ0hJVEVXNjQzMicpO1xuXHRcdGNvbnN0IHN5c3RlbVJvb3QgPSBwcm9jZXNzLmVudlsnU3lzdGVtUm9vdCddO1xuXHRcdGlmIChzeXN0ZW1Sb290KSB7XG5cdFx0XHRyZXR1cm4gam9pbihzeXN0ZW1Sb290LCBpczMyUHJvY2Vzc09uNjRXaW5kb3dzID8gJ1N5c25hdGl2ZScgOiAnU3lzdGVtMzInLCB1c2VXU0xleGUgPyAnd3NsLmV4ZScgOiAnYmFzaC5leGUnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBnZXRSZXZpdmVkUHR5TmV3SWQod29ya3NwYWNlSWQ6IHN0cmluZywgaWQ6IG51bWJlcik6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiB0aGlzLl9yZXZpdmVkUHR5SWRNYXAuZ2V0KHRoaXMuX2dldFJldml2aW5nUHJvY2Vzc0lkKHdvcmtzcGFjZUlkLCBpZCkpPy5uZXdJZDtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYENvdWxkbid0IGZpbmQgdGVybWluYWwgSUQgJHt3b3Jrc3BhY2VJZH0tJHtpZH1gLCBlLm1lc3NhZ2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0QHRyYWNlUnBjXG5cdGFzeW5jIHNldFRlcm1pbmFsTGF5b3V0SW5mbyhhcmdzOiBJU2V0VGVybWluYWxMYXlvdXRJbmZvQXJncyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3dvcmtzcGFjZUxheW91dEluZm9zLnNldChhcmdzLndvcmtzcGFjZUlkLCBhcmdzKTtcblx0fVxuXG5cdEB0cmFjZVJwY1xuXHRhc3luYyBnZXRUZXJtaW5hbExheW91dEluZm8oYXJnczogSUdldFRlcm1pbmFsTGF5b3V0SW5mb0FyZ3MpOiBQcm9taXNlPElUZXJtaW5hbHNMYXlvdXRJbmZvIHwgdW5kZWZpbmVkPiB7XG5cdFx0cGVyZm9ybWFuY2UubWFyaygnY29kZS93aWxsR2V0VGVybWluYWxMYXlvdXRJbmZvJyk7XG5cdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5fd29ya3NwYWNlTGF5b3V0SW5mb3MuZ2V0KGFyZ3Mud29ya3NwYWNlSWQpO1xuXHRcdGlmIChsYXlvdXQpIHtcblx0XHRcdGNvbnN0IGRvbmVTZXQ6IFNldDxudW1iZXI+ID0gbmV3IFNldCgpO1xuXHRcdFx0Y29uc3QgZXhwYW5kZWRUYWJzID0gYXdhaXQgUHJvbWlzZS5hbGwobGF5b3V0LnRhYnMubWFwKGFzeW5jIHRhYiA9PiB0aGlzLl9leHBhbmRUZXJtaW5hbFRhYihhcmdzLndvcmtzcGFjZUlkLCB0YWIsIGRvbmVTZXQpKSk7XG5cdFx0XHRjb25zdCB0YWJzID0gZXhwYW5kZWRUYWJzLmZpbHRlcih0ID0+IHQudGVybWluYWxzLmxlbmd0aCA+IDApO1xuXHRcdFx0Y29uc3QgZXhwYW5kZWRCYWNrZ3JvdW5kID0gKGF3YWl0IFByb21pc2UuYWxsKGxheW91dC5iYWNrZ3JvdW5kPy5tYXAoYiA9PiB0aGlzLl9leHBhbmRUZXJtaW5hbEluc3RhbmNlKGFyZ3Mud29ya3NwYWNlSWQsIGIsIGRvbmVTZXQpKSA/PyBbXSkpLmZpbHRlcihiID0+IGIudGVybWluYWwgIT09IG51bGwpLm1hcChiID0+IGIudGVybWluYWwpO1xuXHRcdFx0cGVyZm9ybWFuY2UubWFyaygnY29kZS9kaWRHZXRUZXJtaW5hbExheW91dEluZm8nKTtcblx0XHRcdHJldHVybiB7IHRhYnMsIGJhY2tncm91bmQ6IGV4cGFuZGVkQmFja2dyb3VuZCB9O1xuXHRcdH1cblx0XHRwZXJmb3JtYW5jZS5tYXJrKCdjb2RlL2RpZEdldFRlcm1pbmFsTGF5b3V0SW5mbycpO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9leHBhbmRUZXJtaW5hbFRhYih3b3Jrc3BhY2VJZDogc3RyaW5nLCB0YWI6IElUZXJtaW5hbFRhYkxheW91dEluZm9CeUlkLCBkb25lU2V0OiBTZXQ8bnVtYmVyPik6IFByb21pc2U8SVRlcm1pbmFsVGFiTGF5b3V0SW5mb0R0bz4ge1xuXHRcdGNvbnN0IGV4cGFuZGVkVGVybWluYWxzID0gKGF3YWl0IFByb21pc2UuYWxsKHRhYi50ZXJtaW5hbHMubWFwKHQgPT4gdGhpcy5fZXhwYW5kVGVybWluYWxJbnN0YW5jZSh3b3Jrc3BhY2VJZCwgdCwgZG9uZVNldCkpKSk7XG5cdFx0Y29uc3QgZmlsdGVyZWQgPSBleHBhbmRlZFRlcm1pbmFscy5maWx0ZXIodGVybSA9PiB0ZXJtLnRlcm1pbmFsICE9PSBudWxsKSBhcyBJUmF3VGVybWluYWxJbnN0YW5jZUxheW91dEluZm88SVByb2Nlc3NEZXRhaWxzPltdO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpc0FjdGl2ZTogdGFiLmlzQWN0aXZlLFxuXHRcdFx0YWN0aXZlUGVyc2lzdGVudFByb2Nlc3NJZDogdGFiLmFjdGl2ZVBlcnNpc3RlbnRQcm9jZXNzSWQsXG5cdFx0XHR0ZXJtaW5hbHM6IGZpbHRlcmVkXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2V4cGFuZFRlcm1pbmFsSW5zdGFuY2Uod29ya3NwYWNlSWQ6IHN0cmluZywgdDogSVRlcm1pbmFsSW5zdGFuY2VMYXlvdXRJbmZvQnlJZCB8IG51bWJlciwgZG9uZVNldDogU2V0PG51bWJlcj4pOiBQcm9taXNlPElSYXdUZXJtaW5hbEluc3RhbmNlTGF5b3V0SW5mbzxJUHJvY2Vzc0RldGFpbHMgfCBudWxsPj4ge1xuXHRcdGNvbnN0IGhhc0xheW91dCA9ICFpc051bWJlcih0KTtcblx0XHRjb25zdCBwdHlJZCA9IGhhc0xheW91dCA/IHQudGVybWluYWwgOiB0O1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBvbGRJZCA9IHRoaXMuX2dldFJldml2aW5nUHJvY2Vzc0lkKHdvcmtzcGFjZUlkLCBwdHlJZCk7XG5cdFx0XHRjb25zdCByZXZpdmVkUHR5SWQgPSB0aGlzLl9yZXZpdmVkUHR5SWRNYXAuZ2V0KG9sZElkKT8ubmV3SWQ7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEV4cGFuZGluZyB0ZXJtaW5hbCBpbnN0YW5jZSwgb2xkIGlkICR7b2xkSWR9IC0+IG5ldyBpZCAke3Jldml2ZWRQdHlJZH1gKTtcblx0XHRcdHRoaXMuX3Jldml2ZWRQdHlJZE1hcC5kZWxldGUob2xkSWQpO1xuXHRcdFx0Y29uc3QgcGVyc2lzdGVudFByb2Nlc3NJZCA9IHJldml2ZWRQdHlJZCA/PyBwdHlJZDtcblx0XHRcdGlmIChkb25lU2V0LmhhcyhwZXJzaXN0ZW50UHJvY2Vzc0lkKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRlcm1pbmFsICR7cGVyc2lzdGVudFByb2Nlc3NJZH0gaGFzIGFscmVhZHkgYmVlbiBleHBhbmRlZGApO1xuXHRcdFx0fVxuXHRcdFx0ZG9uZVNldC5hZGQocGVyc2lzdGVudFByb2Nlc3NJZCk7XG5cdFx0XHRjb25zdCBwZXJzaXN0ZW50UHJvY2VzcyA9IHRoaXMuX3Rocm93SWZOb1B0eShwZXJzaXN0ZW50UHJvY2Vzc0lkKTtcblx0XHRcdGNvbnN0IHByb2Nlc3NEZXRhaWxzID0gcGVyc2lzdGVudFByb2Nlc3MgJiYgYXdhaXQgdGhpcy5fYnVpbGRQcm9jZXNzRGV0YWlscyhwdHlJZCwgcGVyc2lzdGVudFByb2Nlc3MsIHJldml2ZWRQdHlJZCAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRlcm1pbmFsOiB7IC4uLnByb2Nlc3NEZXRhaWxzLCBpZDogcGVyc2lzdGVudFByb2Nlc3NJZCB9LFxuXHRcdFx0XHRyZWxhdGl2ZVNpemU6IGhhc0xheW91dCA/IHQucmVsYXRpdmVTaXplIDogMFxuXHRcdFx0fTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYENvdWxkbid0IGdldCBsYXlvdXQgaW5mbywgYSB0ZXJtaW5hbCB3YXMgcHJvYmFibHkgZGlzY29ubmVjdGVkYCwgZS5tZXNzYWdlKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ1JlYXR0YWNoIHRvIHdyb25nIHRlcm1pbmFsIGRlYnVnIGluZm8gLSBsYXlvdXQgaW5mbyBieSBpZCcsIHQpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnUmVhdHRhY2ggdG8gd3JvbmcgdGVybWluYWwgZGVidWcgaW5mbyAtIF9yZXZpdmVQdHlJZE1hcCcsIEFycmF5LmZyb20odGhpcy5fcmV2aXZlZFB0eUlkTWFwLnZhbHVlcygpKSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdSZWF0dGFjaCB0byB3cm9uZyB0ZXJtaW5hbCBkZWJ1ZyBpbmZvIC0gX3B0eXMgaWRzJywgQXJyYXkuZnJvbSh0aGlzLl9wdHlzLmtleXMoKSkpO1xuXHRcdFx0Ly8gdGhpcyB3aWxsIGJlIGZpbHRlcmVkIG91dCBhbmQgbm90IHJlY29ubmVjdGVkXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0ZXJtaW5hbDogbnVsbCxcblx0XHRcdFx0cmVsYXRpdmVTaXplOiBoYXNMYXlvdXQgPyB0LnJlbGF0aXZlU2l6ZSA6IDBcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmV2aXZpbmdQcm9jZXNzSWQod29ya3NwYWNlSWQ6IHN0cmluZywgcHR5SWQ6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3dvcmtzcGFjZUlkfS0ke3B0eUlkfWA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9idWlsZFByb2Nlc3NEZXRhaWxzKGlkOiBudW1iZXIsIHBlcnNpc3RlbnRQcm9jZXNzOiBQZXJzaXN0ZW50VGVybWluYWxQcm9jZXNzLCB3YXNSZXZpdmVkOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPElQcm9jZXNzRGV0YWlscz4ge1xuXHRcdHBlcmZvcm1hbmNlLm1hcmsoYGNvZGUvd2lsbEJ1aWxkUHJvY2Vzc0RldGFpbHMvJHtpZH1gKTtcblx0XHQvLyBJZiB0aGUgcHJvY2VzcyB3YXMganVzdCByZXZpdmVkLCBkb24ndCBkbyB0aGUgb3JwaGFuIGNoZWNrIGFzIGl0IHdpbGxcblx0XHQvLyB0YWtlIHNvbWUgdGltZVxuXHRcdGNvbnN0IFtjd2QsIGlzT3JwaGFuXSA9IGF3YWl0IFByb21pc2UuYWxsKFtwZXJzaXN0ZW50UHJvY2Vzcy5nZXRDd2QoKSwgd2FzUmV2aXZlZCA/IHRydWUgOiBwZXJzaXN0ZW50UHJvY2Vzcy5pc09ycGhhbmVkKCldKTtcblx0XHRjb25zdCByZXN1bHQgPSB7XG5cdFx0XHRpZCxcblx0XHRcdHRpdGxlOiBwZXJzaXN0ZW50UHJvY2Vzcy50aXRsZSxcblx0XHRcdHRpdGxlU291cmNlOiBwZXJzaXN0ZW50UHJvY2Vzcy50aXRsZVNvdXJjZSxcblx0XHRcdHBpZDogcGVyc2lzdGVudFByb2Nlc3MucGlkLFxuXHRcdFx0d29ya3NwYWNlSWQ6IHBlcnNpc3RlbnRQcm9jZXNzLndvcmtzcGFjZUlkLFxuXHRcdFx0d29ya3NwYWNlTmFtZTogcGVyc2lzdGVudFByb2Nlc3Mud29ya3NwYWNlTmFtZSxcblx0XHRcdGN3ZCxcblx0XHRcdGlzT3JwaGFuLFxuXHRcdFx0aWNvbjogcGVyc2lzdGVudFByb2Nlc3MuaWNvbixcblx0XHRcdGNvbG9yOiBwZXJzaXN0ZW50UHJvY2Vzcy5jb2xvcixcblx0XHRcdGZpeGVkRGltZW5zaW9uczogcGVyc2lzdGVudFByb2Nlc3MuZml4ZWREaW1lbnNpb25zLFxuXHRcdFx0ZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zOiBwZXJzaXN0ZW50UHJvY2Vzcy5wcm9jZXNzTGF1bmNoT3B0aW9ucy5vcHRpb25zLmVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9ucyxcblx0XHRcdHJlY29ubmVjdGlvblByb3BlcnRpZXM6IHBlcnNpc3RlbnRQcm9jZXNzLnNoZWxsTGF1bmNoQ29uZmlnLnJlY29ubmVjdGlvblByb3BlcnRpZXMsXG5cdFx0XHR3YWl0T25FeGl0OiBwZXJzaXN0ZW50UHJvY2Vzcy5zaGVsbExhdW5jaENvbmZpZy53YWl0T25FeGl0LFxuXHRcdFx0aGlkZUZyb21Vc2VyOiBwZXJzaXN0ZW50UHJvY2Vzcy5zaGVsbExhdW5jaENvbmZpZy5oaWRlRnJvbVVzZXIsXG5cdFx0XHRpc0ZlYXR1cmVUZXJtaW5hbDogcGVyc2lzdGVudFByb2Nlc3Muc2hlbGxMYXVuY2hDb25maWcuaXNGZWF0dXJlVGVybWluYWwsXG5cdFx0XHR0eXBlOiBwZXJzaXN0ZW50UHJvY2Vzcy5zaGVsbExhdW5jaENvbmZpZy50eXBlLFxuXHRcdFx0aGFzQ2hpbGRQcm9jZXNzZXM6IHBlcnNpc3RlbnRQcm9jZXNzLmhhc0NoaWxkUHJvY2Vzc2VzLFxuXHRcdFx0c2hlbGxJbnRlZ3JhdGlvbk5vbmNlOiBwZXJzaXN0ZW50UHJvY2Vzcy5wcm9jZXNzTGF1bmNoT3B0aW9ucy5vcHRpb25zLnNoZWxsSW50ZWdyYXRpb24ubm9uY2UsXG5cdFx0XHR0YWJBY3Rpb25zOiBwZXJzaXN0ZW50UHJvY2Vzcy5zaGVsbExhdW5jaENvbmZpZy50YWJBY3Rpb25zXG5cdFx0fTtcblx0XHRwZXJmb3JtYW5jZS5tYXJrKGBjb2RlL2RpZEJ1aWxkUHJvY2Vzc0RldGFpbHMvJHtpZH1gKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfdGhyb3dJZk5vUHR5KGlkOiBudW1iZXIpOiBQZXJzaXN0ZW50VGVybWluYWxQcm9jZXNzIHtcblx0XHRjb25zdCBwdHkgPSB0aGlzLl9wdHlzLmdldChpZCk7XG5cdFx0aWYgKCFwdHkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvck5vVGVsZW1ldHJ5KGBDb3VsZCBub3QgZmluZCBwdHkgJHtpZH0gb24gcHR5IGhvc3RgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHB0eTtcblx0fVxufVxuXG5jb25zdCBlbnVtIEludGVyYWN0aW9uU3RhdGUge1xuXHQvKiogVGhlIHRlcm1pbmFsIGhhcyBub3QgYmVlbiBpbnRlcmFjdGVkIHdpdGguICovXG5cdE5vbmUgPSAnTm9uZScsXG5cdC8qKiBUaGUgdGVybWluYWwgaGFzIG9ubHkgYmVlbiBpbnRlcmFjdGVkIHdpdGggYnkgdGhlIHJlcGxheSBtZWNoYW5pc20uICovXG5cdFJlcGxheU9ubHkgPSAnUmVwbGF5T25seScsXG5cdC8qKiBUaGUgdGVybWluYWwgaGFzIGJlZW4gZGlyZWN0bHkgaW50ZXJhY3RlZCB3aXRoIHRoaXMgc2Vzc2lvbi4gKi9cblx0U2Vzc2lvbiA9ICdTZXNzaW9uJ1xufVxuXG5jbGFzcyBQZXJzaXN0ZW50VGVybWluYWxQcm9jZXNzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYnVmZmVyZXI6IFRlcm1pbmFsRGF0YUJ1ZmZlcmVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdDb21tYW5kcyA9IG5ldyBNYXA8bnVtYmVyLCB7IHJlc29sdmU6IChkYXRhOiB1bmtub3duKSA9PiB2b2lkOyByZWplY3Q6IChlcnI6IHVua25vd24pID0+IHZvaWQgfT4oKTtcblxuXHRwcml2YXRlIF9pc1N0YXJ0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfaW50ZXJhY3Rpb25TdGF0ZTogTXV0YXRpb25Mb2dnZXI8SW50ZXJhY3Rpb25TdGF0ZT47XG5cblx0cHJpdmF0ZSBfb3JwaGFuUXVlc3Rpb25CYXJyaWVyOiBBdXRvT3BlbkJhcnJpZXIgfCBudWxsO1xuXHRwcml2YXRlIF9vcnBoYW5RdWVzdGlvblJlcGx5VGltZTogbnVtYmVyO1xuXHRwcml2YXRlIF9vcnBoYW5SZXF1ZXN0UXVldWUgPSBuZXcgUXVldWU8Ym9vbGVhbj4oKTtcblx0cHJpdmF0ZSBfZGlzY29ubmVjdFJ1bm5lcjE6IFByb2Nlc3NUaW1lUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSBfZGlzY29ubmVjdFJ1bm5lcjI6IFByb2Nlc3NUaW1lUnVuT25jZVNjaGVkdWxlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NSZXBsYXkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUHR5SG9zdFByb2Nlc3NSZXBsYXlFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc1JlcGxheSA9IHRoaXMuX29uUHJvY2Vzc1JlcGxheS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzUmVhZHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUHJvY2Vzc1JlYWR5RXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NSZWFkeSA9IHRoaXMuX29uUHJvY2Vzc1JlYWR5LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblBlcnNpc3RlbnRQcm9jZXNzUmVhZHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0LyoqIEZpcmVkIHdoZW4gdGhlIHBlcnNpc3RlbnQgcHJvY2VzcyBoYXMgYSByZWFkeSBwcm9jZXNzIGFuZCBoYXMgZmluaXNoZWQgaXRzIHJlcGxheS4gKi9cblx0cmVhZG9ubHkgb25QZXJzaXN0ZW50UHJvY2Vzc1JlYWR5ID0gdGhpcy5fb25QZXJzaXN0ZW50UHJvY2Vzc1JlYWR5LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NEYXRhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzRGF0YSA9IHRoaXMuX29uUHJvY2Vzc0RhdGEuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc09ycGhhblF1ZXN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc09ycGhhblF1ZXN0aW9uID0gdGhpcy5fb25Qcm9jZXNzT3JwaGFuUXVlc3Rpb24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUHJvcGVydHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUHJvY2Vzc1Byb3BlcnR5PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm9wZXJ0eSA9IHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfaW5SZXBsYXkgPSBmYWxzZTtcblxuXHRwcml2YXRlIF9waWQgPSAtMTtcblx0cHJpdmF0ZSBfY3dkID0gJyc7XG5cdHByaXZhdGUgX3RpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3RpdGxlU291cmNlOiBUaXRsZUV2ZW50U291cmNlID0gVGl0bGVFdmVudFNvdXJjZS5Qcm9jZXNzO1xuXHRwcml2YXRlIF9zZXJpYWxpemVyOiBJVGVybWluYWxTZXJpYWxpemVyO1xuXHRwcml2YXRlIF93YXNSZXZpdmVkOiBib29sZWFuO1xuXHRwcml2YXRlIF9maXhlZERpbWVuc2lvbnM6IElGaXhlZFRlcm1pbmFsRGltZW5zaW9ucyB8IHVuZGVmaW5lZDtcblxuXHRnZXQgcGlkKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9waWQ7IH1cblx0Z2V0IHNoZWxsTGF1bmNoQ29uZmlnKCk6IElTaGVsbExhdW5jaENvbmZpZyB7IHJldHVybiB0aGlzLl90ZXJtaW5hbFByb2Nlc3Muc2hlbGxMYXVuY2hDb25maWc7IH1cblx0Z2V0IGhhc1dyaXR0ZW5EYXRhKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faW50ZXJhY3Rpb25TdGF0ZS52YWx1ZSAhPT0gSW50ZXJhY3Rpb25TdGF0ZS5Ob25lOyB9XG5cdGdldCB0aXRsZSgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fdGl0bGUgfHwgdGhpcy5fdGVybWluYWxQcm9jZXNzLmN1cnJlbnRUaXRsZTsgfVxuXHRnZXQgdGl0bGVTb3VyY2UoKTogVGl0bGVFdmVudFNvdXJjZSB7IHJldHVybiB0aGlzLl90aXRsZVNvdXJjZTsgfVxuXHRnZXQgaWNvbigpOiBUZXJtaW5hbEljb24gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5faWNvbjsgfVxuXHRnZXQgY29sb3IoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2NvbG9yOyB9XG5cdGdldCBmaXhlZERpbWVuc2lvbnMoKTogSUZpeGVkVGVybWluYWxEaW1lbnNpb25zIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2ZpeGVkRGltZW5zaW9uczsgfVxuXHRnZXQgaGFzQ2hpbGRQcm9jZXNzZXMoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl90ZXJtaW5hbFByb2Nlc3MuaGFzQ2hpbGRQcm9jZXNzZXM7IH1cblxuXHRzZXRUaXRsZSh0aXRsZTogc3RyaW5nLCB0aXRsZVNvdXJjZTogVGl0bGVFdmVudFNvdXJjZSk6IHZvaWQge1xuXHRcdGlmICh0aXRsZVNvdXJjZSA9PT0gVGl0bGVFdmVudFNvdXJjZS5BcGkpIHtcblx0XHRcdHRoaXMuX2ludGVyYWN0aW9uU3RhdGUuc2V0VmFsdWUoSW50ZXJhY3Rpb25TdGF0ZS5TZXNzaW9uLCAnc2V0VGl0bGUnKTtcblx0XHRcdHRoaXMuX3NlcmlhbGl6ZXIuZnJlZVJhd1Jldml2ZUJ1ZmZlcigpO1xuXHRcdH1cblx0XHR0aGlzLl90aXRsZSA9IHRpdGxlO1xuXHRcdHRoaXMuX3RpdGxlU291cmNlID0gdGl0bGVTb3VyY2U7XG5cdH1cblxuXHRzZXRJY29uKHVzZXJJbml0aWF0ZWQ6IGJvb2xlYW4sIGljb246IFRlcm1pbmFsSWNvbiwgY29sb3I/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2ljb24gfHwgaGFzS2V5KGljb24sIHsgaWQ6IHRydWUgfSkgJiYgaGFzS2V5KHRoaXMuX2ljb24sIHsgaWQ6IHRydWUgfSkgJiYgaWNvbi5pZCAhPT0gdGhpcy5faWNvbi5pZCB8fFxuXHRcdFx0IXRoaXMuY29sb3IgfHwgY29sb3IgIT09IHRoaXMuX2NvbG9yKSB7XG5cblx0XHRcdHRoaXMuX3NlcmlhbGl6ZXIuZnJlZVJhd1Jldml2ZUJ1ZmZlcigpO1xuXHRcdFx0aWYgKHVzZXJJbml0aWF0ZWQpIHtcblx0XHRcdFx0dGhpcy5faW50ZXJhY3Rpb25TdGF0ZS5zZXRWYWx1ZShJbnRlcmFjdGlvblN0YXRlLlNlc3Npb24sICdzZXRJY29uJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2ljb24gPSBpY29uO1xuXHRcdHRoaXMuX2NvbG9yID0gY29sb3I7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRGaXhlZERpbWVuc2lvbnMoZml4ZWREaW1lbnNpb25zPzogSUZpeGVkVGVybWluYWxEaW1lbnNpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5fZml4ZWREaW1lbnNpb25zID0gZml4ZWREaW1lbnNpb25zO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfcGVyc2lzdGVudFByb2Nlc3NJZDogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsUHJvY2VzczogVGVybWluYWxQcm9jZXNzLFxuXHRcdHJlYWRvbmx5IHdvcmtzcGFjZUlkOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgd29ya3NwYWNlTmFtZTogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IHNob3VsZFBlcnNpc3RUZXJtaW5hbDogYm9vbGVhbixcblx0XHRjb2xzOiBudW1iZXIsXG5cdFx0cm93czogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IHByb2Nlc3NMYXVuY2hPcHRpb25zOiBJUGVyc2lzdGVudFRlcm1pbmFsUHJvY2Vzc0xhdW5jaENvbmZpZyxcblx0XHRwdWJsaWMgdW5pY29kZVZlcnNpb246ICc2JyB8ICcxMScsXG5cdFx0cmVjb25uZWN0Q29uc3RhbnRzOiBJUmVjb25uZWN0Q29uc3RhbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHJldml2ZUJ1ZmZlcjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHJhd1Jldml2ZUJ1ZmZlcjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgX2ljb24/OiBUZXJtaW5hbEljb24sXG5cdFx0cHJpdmF0ZSBfY29sb3I/OiBzdHJpbmcsXG5cdFx0bmFtZT86IHN0cmluZyxcblx0XHRmaXhlZERpbWVuc2lvbnM/OiBJRml4ZWRUZXJtaW5hbERpbWVuc2lvbnNcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9pbnRlcmFjdGlvblN0YXRlID0gbmV3IE11dGF0aW9uTG9nZ2VyKGBQZXJzaXN0ZW50IHByb2Nlc3MgXCIke3RoaXMuX3BlcnNpc3RlbnRQcm9jZXNzSWR9XCIgaW50ZXJhY3Rpb24gc3RhdGVgLCBJbnRlcmFjdGlvblN0YXRlLk5vbmUsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuX3dhc1Jldml2ZWQgPSByZXZpdmVCdWZmZXIgIT09IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zZXJpYWxpemVyID0gbmV3IFh0ZXJtU2VyaWFsaXplcihcblx0XHRcdGNvbHMsXG5cdFx0XHRyb3dzLFxuXHRcdFx0cmVjb25uZWN0Q29uc3RhbnRzLnNjcm9sbGJhY2ssXG5cdFx0XHR1bmljb2RlVmVyc2lvbixcblx0XHRcdHJldml2ZUJ1ZmZlcixcblx0XHRcdHByb2Nlc3NMYXVuY2hPcHRpb25zLm9wdGlvbnMuc2hlbGxJbnRlZ3JhdGlvbi5ub25jZSxcblx0XHRcdHNob3VsZFBlcnNpc3RUZXJtaW5hbCA/IHJhd1Jldml2ZUJ1ZmZlciA6IHVuZGVmaW5lZCxcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Vcblx0XHQpO1xuXHRcdGlmIChuYW1lKSB7XG5cdFx0XHR0aGlzLnNldFRpdGxlKG5hbWUsIFRpdGxlRXZlbnRTb3VyY2UuQXBpKTtcblx0XHR9XG5cdFx0dGhpcy5fZml4ZWREaW1lbnNpb25zID0gZml4ZWREaW1lbnNpb25zO1xuXHRcdHRoaXMuX29ycGhhblF1ZXN0aW9uQmFycmllciA9IG51bGw7XG5cdFx0dGhpcy5fb3JwaGFuUXVlc3Rpb25SZXBseVRpbWUgPSAwO1xuXHRcdHRoaXMuX2Rpc2Nvbm5lY3RSdW5uZXIxID0gdGhpcy5fcmVnaXN0ZXIobmV3IFByb2Nlc3NUaW1lUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFBlcnNpc3RlbnQgcHJvY2VzcyBcIiR7dGhpcy5fcGVyc2lzdGVudFByb2Nlc3NJZH1cIjogVGhlIHJlY29ubmVjdGlvbiBncmFjZSB0aW1lIG9mICR7cHJpbnRUaW1lKHJlY29ubmVjdENvbnN0YW50cy5ncmFjZVRpbWUpfSBoYXMgZXhwaXJlZCwgc2h1dHRpbmcgZG93biBwaWQgXCIke3RoaXMuX3BpZH1cImApO1xuXHRcdFx0dGhpcy5zaHV0ZG93bih0cnVlKTtcblx0XHR9LCByZWNvbm5lY3RDb25zdGFudHMuZ3JhY2VUaW1lKSk7XG5cdFx0dGhpcy5fZGlzY29ubmVjdFJ1bm5lcjIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUHJvY2Vzc1RpbWVSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgUGVyc2lzdGVudCBwcm9jZXNzIFwiJHt0aGlzLl9wZXJzaXN0ZW50UHJvY2Vzc0lkfVwiOiBUaGUgc2hvcnQgcmVjb25uZWN0aW9uIGdyYWNlIHRpbWUgb2YgJHtwcmludFRpbWUocmVjb25uZWN0Q29uc3RhbnRzLnNob3J0R3JhY2VUaW1lKX0gaGFzIGV4cGlyZWQsIHNodXR0aW5nIGRvd24gcGlkICR7dGhpcy5fcGlkfWApO1xuXHRcdFx0dGhpcy5zaHV0ZG93bih0cnVlKTtcblx0XHR9LCByZWNvbm5lY3RDb25zdGFudHMuc2hvcnRHcmFjZVRpbWUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFByb2Nlc3Mub25Qcm9jZXNzRXhpdCgoKSA9PiB0aGlzLl9idWZmZXJlci5zdG9wQnVmZmVyaW5nKHRoaXMuX3BlcnNpc3RlbnRQcm9jZXNzSWQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxQcm9jZXNzLm9uUHJvY2Vzc1JlYWR5KGUgPT4ge1xuXHRcdFx0dGhpcy5fcGlkID0gZS5waWQ7XG5cdFx0XHR0aGlzLl9jd2QgPSBlLmN3ZDtcblx0XHRcdHRoaXMuX29uUHJvY2Vzc1JlYWR5LmZpcmUoZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsUHJvY2Vzcy5vbkRpZENoYW5nZVByb3BlcnR5KGUgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKGUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIERhdGEgYnVmZmVyaW5nIHRvIHJlZHVjZSB0aGUgYW1vdW50IG9mIG1lc3NhZ2VzIGdvaW5nIHRvIHRoZSByZW5kZXJlclxuXHRcdHRoaXMuX2J1ZmZlcmVyID0gbmV3IFRlcm1pbmFsRGF0YUJ1ZmZlcmVyKChfLCBkYXRhKSA9PiB0aGlzLl9vblByb2Nlc3NEYXRhLmZpcmUoZGF0YSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2J1ZmZlcmVyLnN0YXJ0QnVmZmVyaW5nKHRoaXMuX3BlcnNpc3RlbnRQcm9jZXNzSWQsIHRoaXMuX3Rlcm1pbmFsUHJvY2Vzcy5vblByb2Nlc3NEYXRhKSk7XG5cblx0XHQvLyBEYXRhIHJlY29yZGluZyBmb3IgcmVjb25uZWN0XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vblByb2Nlc3NEYXRhKGUgPT4gdGhpcy5fc2VyaWFsaXplci5oYW5kbGVEYXRhKGUpKSk7XG5cdH1cblxuXHRhc3luYyBhdHRhY2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9kaXNjb25uZWN0UnVubmVyMS5pc1NjaGVkdWxlZCgpICYmICF0aGlzLl9kaXNjb25uZWN0UnVubmVyMi5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFBlcnNpc3RlbnQgcHJvY2VzcyBcIiR7dGhpcy5fcGVyc2lzdGVudFByb2Nlc3NJZH1cIjogUHJvY2VzcyBoYWQgbm8gZGlzY29ubmVjdCBydW5uZXJzIGJ1dCB3YXMgYW4gb3JwaGFuYCk7XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc2Nvbm5lY3RSdW5uZXIxLmNhbmNlbCgpO1xuXHRcdHRoaXMuX2Rpc2Nvbm5lY3RSdW5uZXIyLmNhbmNlbCgpO1xuXHR9XG5cblx0YXN5bmMgZGV0YWNoKGZvcmNlUGVyc2lzdD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBLZWVwIHRoZSBwcm9jZXNzIGFyb3VuZCBpZiBpdCB3YXMgaW5kaWNhdGVkIHRvIHBlcnNpc3QgYW5kIGl0IGhhcyBoYWQgc29tZSBpdGVyYWN0aW9uIG9yXG5cdFx0Ly8gd2FzIHJlcGxheWVkXG5cdFx0aWYgKHRoaXMuc2hvdWxkUGVyc2lzdFRlcm1pbmFsICYmICh0aGlzLl9pbnRlcmFjdGlvblN0YXRlLnZhbHVlICE9PSBJbnRlcmFjdGlvblN0YXRlLk5vbmUgfHwgZm9yY2VQZXJzaXN0KSkge1xuXHRcdFx0dGhpcy5fZGlzY29ubmVjdFJ1bm5lcjEuc2NoZWR1bGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zaHV0ZG93bih0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRzZXJpYWxpemVOb3JtYWxCdWZmZXIoKTogUHJvbWlzZTxJUHR5SG9zdFByb2Nlc3NSZXBsYXlFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXJpYWxpemVyLmdlbmVyYXRlUmVwbGF5RXZlbnQodHJ1ZSwgdGhpcy5faW50ZXJhY3Rpb25TdGF0ZS52YWx1ZSAhPT0gSW50ZXJhY3Rpb25TdGF0ZS5TZXNzaW9uKTtcblx0fVxuXG5cdGFzeW5jIHJlZnJlc2hQcm9wZXJ0eTxUIGV4dGVuZHMgUHJvY2Vzc1Byb3BlcnR5VHlwZT4odHlwZTogVCk6IFByb21pc2U8SVByb2Nlc3NQcm9wZXJ0eU1hcFtUXT4ge1xuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbFByb2Nlc3MucmVmcmVzaFByb3BlcnR5KHR5cGUpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlUHJvcGVydHk8VCBleHRlbmRzIFByb2Nlc3NQcm9wZXJ0eVR5cGU+KHR5cGU6IFQsIHZhbHVlOiBJUHJvY2Vzc1Byb3BlcnR5TWFwW1RdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHR5cGUgPT09IFByb2Nlc3NQcm9wZXJ0eVR5cGUuRml4ZWREaW1lbnNpb25zKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2V0Rml4ZWREaW1lbnNpb25zKHZhbHVlIGFzIElQcm9jZXNzUHJvcGVydHlNYXBbUHJvY2Vzc1Byb3BlcnR5VHlwZS5GaXhlZERpbWVuc2lvbnNdKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzdGFydCgpOiBQcm9taXNlPElUZXJtaW5hbExhdW5jaEVycm9yIHwgSVRlcm1pbmFsTGF1bmNoUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9pc1N0YXJ0ZWQpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsUHJvY2Vzcy5zdGFydCgpO1xuXHRcdFx0aWYgKHJlc3VsdCAmJiBoYXNLZXkocmVzdWx0LCB7IG1lc3NhZ2U6IHRydWUgfSkpIHtcblx0XHRcdFx0Ly8gaXQncyBhIHRlcm1pbmFsIGxhdW5jaCBlcnJvclxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faXNTdGFydGVkID0gdHJ1ZTtcblxuXHRcdFx0Ly8gSWYgdGhlIHByb2Nlc3Mgd2FzIHJldml2ZWQsIHRyaWdnZXIgYSByZXBsYXkgb24gZmlyc3Qgc3RhcnQuIEFuIGFsdGVybmF0aXZlIGFwcHJvYWNoXG5cdFx0XHQvLyBjb3VsZCBiZSB0byBzdGFydCBpdCBvbiB0aGUgcHR5IGhvc3QgYmVmb3JlIGF0dGFjaGluZyBidXQgdGhpcyBmYWlscyBvbiBXaW5kb3dzIGFzXG5cdFx0XHQvLyBjb25wdHkncyBpbmhlcml0IGN1cnNvciBvcHRpb24gd2hpY2ggaXMgcmVxdWlyZWQsIGVuZHMgdXAgc2VuZGluZyBEU1IgQ1BSIHdoaWNoXG5cdFx0XHQvLyBjYXVzZXMgY29uaG9zdCB0byBoYW5nIHdoZW4gbm8gcmVzcG9uc2UgaXMgcmVjZWl2ZWQgZnJvbSB0aGUgdGVybWluYWwgKHdoaWNoIHdvdWxkbid0XG5cdFx0XHQvLyBiZSBhdHRhY2hlZCB5ZXQpLiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3Rlcm1pbmFsL2lzc3Vlcy8xMTIxM1xuXHRcdFx0aWYgKHRoaXMuX3dhc1Jldml2ZWQpIHtcblx0XHRcdFx0dGhpcy50cmlnZ2VyUmVwbGF5KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9vblBlcnNpc3RlbnRQcm9jZXNzUmVhZHkuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHR0aGlzLl9vblByb2Nlc3NSZWFkeS5maXJlKHsgcGlkOiB0aGlzLl9waWQsIGN3ZDogdGhpcy5fY3dkLCB3aW5kb3dzUHR5OiB0aGlzLl90ZXJtaW5hbFByb2Nlc3MuZ2V0V2luZG93c1B0eSgpIH0pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuVGl0bGUsIHZhbHVlOiB0aGlzLl90ZXJtaW5hbFByb2Nlc3MuY3VycmVudFRpdGxlIH0pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuU2hlbGxUeXBlLCB2YWx1ZTogdGhpcy5fdGVybWluYWxQcm9jZXNzLnNoZWxsVHlwZSB9KTtcblx0XHR0aGlzLnRyaWdnZXJSZXBsYXkoKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHNodXRkb3duKGltbWVkaWF0ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbFByb2Nlc3Muc2h1dGRvd24oaW1tZWRpYXRlKTtcblx0fVxuXHRpbnB1dChkYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnRlcmFjdGlvblN0YXRlLnNldFZhbHVlKEludGVyYWN0aW9uU3RhdGUuU2Vzc2lvbiwgJ2lucHV0Jyk7XG5cdFx0dGhpcy5fc2VyaWFsaXplci5mcmVlUmF3UmV2aXZlQnVmZmVyKCk7XG5cdFx0aWYgKHRoaXMuX2luUmVwbGF5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbFByb2Nlc3MuaW5wdXQoZGF0YSk7XG5cdH1cblx0c2VuZFNpZ25hbChzaWduYWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pblJlcGxheSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxQcm9jZXNzLnNlbmRTaWduYWwoc2lnbmFsKTtcblx0fVxuXHR3cml0ZUJpbmFyeShkYXRhOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxQcm9jZXNzLnByb2Nlc3NCaW5hcnkoZGF0YSk7XG5cdH1cblx0cmVzaXplKGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyLCBwaXhlbFdpZHRoPzogbnVtYmVyLCBwaXhlbEhlaWdodD86IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pblJlcGxheSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZXJpYWxpemVyLmhhbmRsZVJlc2l6ZShjb2xzLCByb3dzKTtcblxuXHRcdC8vIEJ1ZmZlcmVkIGV2ZW50cyBzaG91bGQgZmx1c2ggd2hlbiBhIHJlc2l6ZSBvY2N1cnNcblx0XHR0aGlzLl9idWZmZXJlci5mbHVzaEJ1ZmZlcih0aGlzLl9wZXJzaXN0ZW50UHJvY2Vzc0lkKTtcblxuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbFByb2Nlc3MucmVzaXplKGNvbHMsIHJvd3MsIHBpeGVsV2lkdGgsIHBpeGVsSGVpZ2h0KTtcblx0fVxuXHRhc3luYyBjbGVhckJ1ZmZlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9zZXJpYWxpemVyLmNsZWFyQnVmZmVyKCk7XG5cdFx0dGhpcy5fdGVybWluYWxQcm9jZXNzLmNsZWFyQnVmZmVyKCk7XG5cdH1cblx0c2V0VW5pY29kZVZlcnNpb24odmVyc2lvbjogJzYnIHwgJzExJyk6IHZvaWQge1xuXHRcdHRoaXMudW5pY29kZVZlcnNpb24gPSB2ZXJzaW9uO1xuXHRcdHRoaXMuX3NlcmlhbGl6ZXIuc2V0VW5pY29kZVZlcnNpb24/Lih2ZXJzaW9uKTtcblx0XHQvLyBUT0RPOiBQYXNzIGluIHVuaWNvZGUgdmVyc2lvbiBpbiBjdG9yXG5cdH1cblxuXHRhc3luYyBzZXROZXh0Q29tbWFuZElkKGNvbW1hbmRMaW5lOiBzdHJpbmcsIGNvbW1hbmRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fc2VyaWFsaXplci5zZXROZXh0Q29tbWFuZElkPy4oY29tbWFuZExpbmUsIGNvbW1hbmRJZCk7XG5cdH1cblxuXHRhY2tub3dsZWRnZURhdGFFdmVudChjaGFyQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pblJlcGxheSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxQcm9jZXNzLmFja25vd2xlZGdlRGF0YUV2ZW50KGNoYXJDb3VudCk7XG5cdH1cblx0Z2V0SW5pdGlhbEN3ZCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbFByb2Nlc3MuZ2V0SW5pdGlhbEN3ZCgpO1xuXHR9XG5cdGdldEN3ZCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbFByb2Nlc3MuZ2V0Q3dkKCk7XG5cdH1cblxuXHRhc3luYyB0cmlnZ2VyUmVwbGF5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9pbnRlcmFjdGlvblN0YXRlLnZhbHVlID09PSBJbnRlcmFjdGlvblN0YXRlLk5vbmUpIHtcblx0XHRcdHRoaXMuX2ludGVyYWN0aW9uU3RhdGUuc2V0VmFsdWUoSW50ZXJhY3Rpb25TdGF0ZS5SZXBsYXlPbmx5LCAndHJpZ2dlclJlcGxheScpO1xuXHRcdH1cblx0XHRjb25zdCBldiA9IGF3YWl0IHRoaXMuX3NlcmlhbGl6ZXIuZ2VuZXJhdGVSZXBsYXlFdmVudCgpO1xuXHRcdGxldCBkYXRhTGVuZ3RoID0gMDtcblx0XHRmb3IgKGNvbnN0IGUgb2YgZXYuZXZlbnRzKSB7XG5cdFx0XHRkYXRhTGVuZ3RoICs9IGUuZGF0YS5sZW5ndGg7XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgUGVyc2lzdGVudCBwcm9jZXNzIFwiJHt0aGlzLl9wZXJzaXN0ZW50UHJvY2Vzc0lkfVwiOiBSZXBsYXlpbmcgJHtkYXRhTGVuZ3RofSBjaGFycyBhbmQgJHtldi5ldmVudHMubGVuZ3RofSBzaXplIGV2ZW50c2ApO1xuXHRcdHRoaXMuX29uUHJvY2Vzc1JlcGxheS5maXJlKGV2KTtcblx0XHR0aGlzLl90ZXJtaW5hbFByb2Nlc3MuY2xlYXJVbmFja25vd2xlZGdlZENoYXJzKCk7XG5cdFx0dGhpcy5fb25QZXJzaXN0ZW50UHJvY2Vzc1JlYWR5LmZpcmUoKTtcblx0fVxuXG5cdHNlbmRDb21tYW5kUmVzdWx0KHJlcUlkOiBudW1iZXIsIGlzRXJyb3I6IGJvb2xlYW4sIHNlcmlhbGl6ZWRQYXlsb2FkOiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX3BlbmRpbmdDb21tYW5kcy5nZXQocmVxSWQpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nQ29tbWFuZHMuZGVsZXRlKHJlcUlkKTtcblx0fVxuXG5cdG9ycGhhblF1ZXN0aW9uUmVwbHkoKTogdm9pZCB7XG5cdFx0dGhpcy5fb3JwaGFuUXVlc3Rpb25SZXBseVRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdGlmICh0aGlzLl9vcnBoYW5RdWVzdGlvbkJhcnJpZXIpIHtcblx0XHRcdGNvbnN0IGJhcnJpZXIgPSB0aGlzLl9vcnBoYW5RdWVzdGlvbkJhcnJpZXI7XG5cdFx0XHR0aGlzLl9vcnBoYW5RdWVzdGlvbkJhcnJpZXIgPSBudWxsO1xuXHRcdFx0YmFycmllci5vcGVuKCk7XG5cdFx0fVxuXHR9XG5cblx0cmVkdWNlR3JhY2VUaW1lKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaXNjb25uZWN0UnVubmVyMi5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHQvLyB3ZSBhcmUgZGlzY29ubmVjdGVkIGFuZCBhbHJlYWR5IHJ1bm5pbmcgdGhlIHNob3J0IHJlY29ubmVjdGlvbiB0aW1lclxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZGlzY29ubmVjdFJ1bm5lcjEuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0Ly8gd2UgYXJlIGRpc2Nvbm5lY3RlZCBhbmQgcnVubmluZyB0aGUgbG9uZyByZWNvbm5lY3Rpb24gdGltZXJcblx0XHRcdHRoaXMuX2Rpc2Nvbm5lY3RSdW5uZXIyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgaXNPcnBoYW5lZCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fb3JwaGFuUmVxdWVzdFF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHRoaXMuX2lzT3JwaGFuZWQoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pc09ycGhhbmVkKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdC8vIFRoZSBwcm9jZXNzIGlzIGFscmVhZHkga25vd24gdG8gYmUgb3JwaGFuZWRcblx0XHRpZiAodGhpcy5fZGlzY29ubmVjdFJ1bm5lcjEuaXNTY2hlZHVsZWQoKSB8fCB0aGlzLl9kaXNjb25uZWN0UnVubmVyMi5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBBc2sgd2hldGhlciB0aGUgcmVuZGVyZXIocykgd2hldGhlciB0aGUgcHJvY2VzcyBpcyBvcnBoYW5lZCBhbmQgYXdhaXQgdGhlIHJlcGx5XG5cdFx0aWYgKCF0aGlzLl9vcnBoYW5RdWVzdGlvbkJhcnJpZXIpIHtcblx0XHRcdC8vIHRoZSBiYXJyaWVyIG9wZW5zIGFmdGVyIDQgc2Vjb25kcyB3aXRoIG9yIHdpdGhvdXQgYSByZXBseVxuXHRcdFx0dGhpcy5fb3JwaGFuUXVlc3Rpb25CYXJyaWVyID0gbmV3IEF1dG9PcGVuQmFycmllcig0MDAwKTtcblx0XHRcdHRoaXMuX29ycGhhblF1ZXN0aW9uUmVwbHlUaW1lID0gMDtcblx0XHRcdHRoaXMuX29uUHJvY2Vzc09ycGhhblF1ZXN0aW9uLmZpcmUoKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9vcnBoYW5RdWVzdGlvbkJhcnJpZXIud2FpdCgpO1xuXHRcdHJldHVybiAoRGF0ZS5ub3coKSAtIHRoaXMuX29ycGhhblF1ZXN0aW9uUmVwbHlUaW1lID4gNTAwKTtcblx0fVxufVxuXG5jbGFzcyBNdXRhdGlvbkxvZ2dlcjxUPiB7XG5cdGdldCB2YWx1ZSgpOiBUIHsgcmV0dXJuIHRoaXMuX3ZhbHVlOyB9XG5cdHNldFZhbHVlKHZhbHVlOiBULCByZWFzb246IHN0cmluZykge1xuXHRcdGlmICh0aGlzLl92YWx1ZSAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuX3ZhbHVlID0gdmFsdWU7XG5cdFx0XHR0aGlzLl9sb2cocmVhc29uKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9uYW1lOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBfdmFsdWU6IFQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fbG9nKCdpbml0aWFsaXplZCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9nKHJlYXNvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgTXV0YXRpb25Mb2dnZXIgXCIke3RoaXMuX25hbWV9XCIgc2V0IHRvIFwiJHt0aGlzLl92YWx1ZX1cIiwgcmVhc29uOiAke3JlYXNvbn1gKTtcblx0fVxufVxuXG5jbGFzcyBYdGVybVNlcmlhbGl6ZXIgaW1wbGVtZW50cyBJVGVybWluYWxTZXJpYWxpemVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBfeHRlcm06IFh0ZXJtVGVybWluYWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NoZWxsSW50ZWdyYXRpb25BZGRvbjogU2hlbGxJbnRlZ3JhdGlvbkFkZG9uO1xuXHRwcml2YXRlIF91bmljb2RlQWRkb24/OiBYdGVybVVuaWNvZGUxMUFkZG9uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbHM6IG51bWJlcixcblx0XHRyb3dzOiBudW1iZXIsXG5cdFx0c2Nyb2xsYmFjazogbnVtYmVyLFxuXHRcdHVuaWNvZGVWZXJzaW9uOiAnNicgfCAnMTEnLFxuXHRcdHJldml2ZUJ1ZmZlcldpdGhSZXN0b3JlTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHNoZWxsSW50ZWdyYXRpb25Ob25jZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgX3Jhd1Jldml2ZUJ1ZmZlcjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX3h0ZXJtID0gbmV3IFh0ZXJtVGVybWluYWwoe1xuXHRcdFx0Y29scyxcblx0XHRcdHJvd3MsXG5cdFx0XHRzY3JvbGxiYWNrLFxuXHRcdFx0YWxsb3dQcm9wb3NlZEFwaTogdHJ1ZVxuXHRcdH0pO1xuXHRcdGlmIChyZXZpdmVCdWZmZXJXaXRoUmVzdG9yZU1lc3NhZ2UpIHtcblx0XHRcdHRoaXMuX3h0ZXJtLndyaXRlbG4ocmV2aXZlQnVmZmVyV2l0aFJlc3RvcmVNZXNzYWdlKTtcblx0XHR9XG5cdFx0dGhpcy5zZXRVbmljb2RlVmVyc2lvbih1bmljb2RlVmVyc2lvbik7XG5cdFx0dGhpcy5fc2hlbGxJbnRlZ3JhdGlvbkFkZG9uID0gbmV3IFNoZWxsSW50ZWdyYXRpb25BZGRvbihzaGVsbEludGVncmF0aW9uTm9uY2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBsb2dTZXJ2aWNlKTtcblx0XHR0aGlzLl94dGVybS5sb2FkQWRkb24odGhpcy5fc2hlbGxJbnRlZ3JhdGlvbkFkZG9uKTtcblx0fVxuXG5cdGZyZWVSYXdSZXZpdmVCdWZmZXIoKTogdm9pZCB7XG5cdFx0Ly8gRnJlZSB0aGUgbWVtb3J5IG9mIHRoZSB0ZXJtaW5hbCBpZiBpdCB3aWxsIG5lZWQgdG8gYmUgcmUtc2VyaWFsaXplZFxuXHRcdHRoaXMuX3Jhd1Jldml2ZUJ1ZmZlciA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGhhbmRsZURhdGEoZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5feHRlcm0ud3JpdGUoZGF0YSk7XG5cdH1cblxuXHRoYW5kbGVSZXNpemUoY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl94dGVybS5yZXNpemUoY29scywgcm93cyk7XG5cdH1cblxuXHRjbGVhckJ1ZmZlcigpOiB2b2lkIHtcblx0XHR0aGlzLl94dGVybS5jbGVhcigpO1xuXHR9XG5cblx0c2V0TmV4dENvbW1hbmRJZChjb21tYW5kTGluZTogc3RyaW5nLCBjb21tYW5kSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3NoZWxsSW50ZWdyYXRpb25BZGRvbi5zZXROZXh0Q29tbWFuZElkKGNvbW1hbmRMaW5lLCBjb21tYW5kSWQpO1xuXHR9XG5cblx0YXN5bmMgZ2VuZXJhdGVSZXBsYXlFdmVudChub3JtYWxCdWZmZXJPbmx5PzogYm9vbGVhbiwgcmVzdG9yZVRvTGFzdFJldml2ZUJ1ZmZlcj86IGJvb2xlYW4pOiBQcm9taXNlPElQdHlIb3N0UHJvY2Vzc1JlcGxheUV2ZW50PiB7XG5cdFx0Y29uc3Qgc2VyaWFsaXplID0gbmV3IChhd2FpdCB0aGlzLl9nZXRTZXJpYWxpemVDb25zdHJ1Y3RvcigpKTtcblx0XHR0aGlzLl94dGVybS5sb2FkQWRkb24oc2VyaWFsaXplKTtcblx0XHRjb25zdCBvcHRpb25zOiBJU2VyaWFsaXplT3B0aW9ucyA9IHtcblx0XHRcdHNjcm9sbGJhY2s6IHRoaXMuX3h0ZXJtLm9wdGlvbnMuc2Nyb2xsYmFja1xuXHRcdH07XG5cdFx0aWYgKG5vcm1hbEJ1ZmZlck9ubHkpIHtcblx0XHRcdG9wdGlvbnMuZXhjbHVkZUFsdEJ1ZmZlciA9IHRydWU7XG5cdFx0XHRvcHRpb25zLmV4Y2x1ZGVNb2RlcyA9IHRydWU7XG5cdFx0fVxuXHRcdGxldCBzZXJpYWxpemVkOiBzdHJpbmc7XG5cdFx0aWYgKHJlc3RvcmVUb0xhc3RSZXZpdmVCdWZmZXIgJiYgdGhpcy5fcmF3UmV2aXZlQnVmZmVyKSB7XG5cdFx0XHRzZXJpYWxpemVkID0gdGhpcy5fcmF3UmV2aXZlQnVmZmVyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzZXJpYWxpemVkID0gc2VyaWFsaXplLnNlcmlhbGl6ZShvcHRpb25zKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGV2ZW50czogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29sczogdGhpcy5feHRlcm0uY29scyxcblx0XHRcdFx0XHRyb3dzOiB0aGlzLl94dGVybS5yb3dzLFxuXHRcdFx0XHRcdGRhdGE6IHNlcmlhbGl6ZWRcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGNvbW1hbmRzOiB0aGlzLl9zaGVsbEludGVncmF0aW9uQWRkb24uc2VyaWFsaXplKClcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgc2V0VW5pY29kZVZlcnNpb24odmVyc2lvbjogJzYnIHwgJzExJyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl94dGVybS51bmljb2RlLmFjdGl2ZVZlcnNpb24gPT09IHZlcnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHZlcnNpb24gPT09ICcxMScpIHtcblx0XHRcdHRoaXMuX3VuaWNvZGVBZGRvbiA9IG5ldyAoYXdhaXQgdGhpcy5fZ2V0VW5pY29kZTExQ29uc3RydWN0b3IoKSk7XG5cdFx0XHR0aGlzLl94dGVybS5sb2FkQWRkb24odGhpcy5fdW5pY29kZUFkZG9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdW5pY29kZUFkZG9uPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl91bmljb2RlQWRkb24gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX3h0ZXJtLnVuaWNvZGUuYWN0aXZlVmVyc2lvbiA9IHZlcnNpb247XG5cdH1cblxuXHRhc3luYyBfZ2V0VW5pY29kZTExQ29uc3RydWN0b3IoKTogUHJvbWlzZTx0eXBlb2YgVW5pY29kZTExQWRkb24+IHtcblx0XHRpZiAoIVVuaWNvZGUxMUFkZG9uKSB7XG5cdFx0XHRVbmljb2RlMTFBZGRvbiA9IChhd2FpdCBpbXBvcnQoJ0B4dGVybS9hZGRvbi11bmljb2RlMTEnKSkuVW5pY29kZTExQWRkb247XG5cdFx0fVxuXHRcdHJldHVybiBVbmljb2RlMTFBZGRvbjtcblx0fVxuXG5cdGFzeW5jIF9nZXRTZXJpYWxpemVDb25zdHJ1Y3RvcigpOiBQcm9taXNlPHR5cGVvZiBTZXJpYWxpemVBZGRvbj4ge1xuXHRcdGlmICghU2VyaWFsaXplQWRkb24pIHtcblx0XHRcdFNlcmlhbGl6ZUFkZG9uID0gKGF3YWl0IGltcG9ydCgnQHh0ZXJtL2FkZG9uLXNlcmlhbGl6ZScpKS5TZXJpYWxpemVBZGRvbjtcblx0XHR9XG5cdFx0cmV0dXJuIFNlcmlhbGl6ZUFkZG9uO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHByaW50VGltZShtczogbnVtYmVyKTogc3RyaW5nIHtcblx0bGV0IGggPSAwO1xuXHRsZXQgbSA9IDA7XG5cdGxldCBzID0gMDtcblx0aWYgKG1zID49IDEwMDApIHtcblx0XHRzID0gTWF0aC5mbG9vcihtcyAvIDEwMDApO1xuXHRcdG1zIC09IHMgKiAxMDAwO1xuXHR9XG5cdGlmIChzID49IDYwKSB7XG5cdFx0bSA9IE1hdGguZmxvb3IocyAvIDYwKTtcblx0XHRzIC09IG0gKiA2MDtcblx0fVxuXHRpZiAobSA+PSA2MCkge1xuXHRcdGggPSBNYXRoLmZsb29yKG0gLyA2MCk7XG5cdFx0bSAtPSBoICogNjA7XG5cdH1cblx0Y29uc3QgX2ggPSBoID8gYCR7aH1oYCA6IGBgO1xuXHRjb25zdCBfbSA9IG0gPyBgJHttfW1gIDogYGA7XG5cdGNvbnN0IF9zID0gcyA/IGAke3N9c2AgOiBgYDtcblx0Y29uc3QgX21zID0gbXMgPyBgJHttc31tc2AgOiBgYDtcblx0cmV0dXJuIGAke19ofSR7X219JHtfc30ke19tc31gO1xufVxuXG5pbnRlcmZhY2UgSVRlcm1pbmFsU2VyaWFsaXplciB7XG5cdGhhbmRsZURhdGEoZGF0YTogc3RyaW5nKTogdm9pZDtcblx0ZnJlZVJhd1Jldml2ZUJ1ZmZlcigpOiB2b2lkO1xuXHRoYW5kbGVSZXNpemUoY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIpOiB2b2lkO1xuXHRjbGVhckJ1ZmZlcigpOiB2b2lkO1xuXHRnZW5lcmF0ZVJlcGxheUV2ZW50KG5vcm1hbEJ1ZmZlck9ubHk/OiBib29sZWFuLCByZXN0b3JlVG9MYXN0UmV2aXZlQnVmZmVyPzogYm9vbGVhbik6IFByb21pc2U8SVB0eUhvc3RQcm9jZXNzUmVwbGF5RXZlbnQ+O1xuXHRzZXRVbmljb2RlVmVyc2lvbj8odmVyc2lvbjogJzYnIHwgJzExJyk6IHZvaWQ7XG5cdHNldE5leHRDb21tYW5kSWQ/KGNvbW1hbmRMaW5lOiBzdHJpbmcsIGNvbW1hbmRJZDogc3RyaW5nKTogdm9pZDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFVBQVUsWUFBWTtBQUMvQixTQUFTLGlCQUFpQiw2QkFBNkIsVUFBVSxPQUFPLGVBQWU7QUFDdkYsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFNBQThCLFdBQTRCLFVBQVU7QUFFcEUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBc0IsZ0JBQWdCO0FBQ3RDLFNBQVMsb0JBQW9CO0FBQzdC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QXVCLFVBQVU7QUFBQSxJQUNqRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sa0JBQWtCLFNBQW9DO0FBQzNELFFBQUksS0FBSyxPQUFPLFFBQVEsa0JBQWtCLFNBQVM7QUFDbEQ7QUFBQSxJQUNEO0FBQ0EsUUFBSSxZQUFZLE1BQU07QUFDckIsV0FBSyxnQkFBZ0IsS0FBSyxNQUFNLEtBQUsseUJBQXlCO0FBQzlELFdBQUssT0FBTyxVQUFVLEtBQUssYUFBYTtBQUFBLElBQ3pDLE9BQU87QUFDTixXQUFLLGVBQWUsUUFBUTtBQUM1QixXQUFLLGdCQUFnQjtBQUFBLElBQ3RCO0FBQ0EsU0FBSyxPQUFPLFFBQVEsZ0JBQWdCO0FBQUEsRUFDckM7QUFBQSxFQUVBLE1BQU0sMkJBQTJEO0FBQ2hFLFFBQUksQ0FBQyxnQkFBZ0I7QUFDcEIsd0JBQWtCLE1BQU0sT0FBTyx3QkFBd0IsR0FBRztBQUFBLElBQzNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sMkJBQTJEO0FBQ2hFLFFBQUksQ0FBQyxnQkFBZ0I7QUFDcEIsd0JBQWtCLE1BQU0sT0FBTyx3QkFBd0IsR0FBRztBQUFBLElBQzNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLFNBQVMsVUFBVSxJQUFvQjtBQUN0QyxNQUFJLElBQUk7QUFDUixNQUFJLElBQUk7QUFDUixNQUFJLElBQUk7QUFDUixNQUFJLE1BQU0sS0FBTTtBQUNmLFFBQUksS0FBSyxNQUFNLEtBQUssR0FBSTtBQUN4QixVQUFNLElBQUk7QUFBQSxFQUNYO0FBQ0EsTUFBSSxLQUFLLElBQUk7QUFDWixRQUFJLEtBQUssTUFBTSxJQUFJLEVBQUU7QUFDckIsU0FBSyxJQUFJO0FBQUEsRUFDVjtBQUNBLE1BQUksS0FBSyxJQUFJO0FBQ1osUUFBSSxLQUFLLE1BQU0sSUFBSSxFQUFFO0FBQ3JCLFNBQUssSUFBSTtBQUFBLEVBQ1Y7QUFDQSxRQUFNLEtBQUssSUFBSSxHQUFHLENBQUMsTUFBTTtBQUN6QixRQUFNLEtBQUssSUFBSSxHQUFHLENBQUMsTUFBTTtBQUN6QixRQUFNLEtBQUssSUFBSSxHQUFHLENBQUMsTUFBTTtBQUN6QixRQUFNLE1BQU0sS0FBSyxHQUFHLEVBQUUsT0FBTztBQUM3QixTQUFPLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsR0FBRztBQUM3QjsiLAogICJuYW1lcyI6IFsic3Rkb3V0IiwgInByb2Nlc3MiLCAiSW50ZXJhY3Rpb25TdGF0ZSJdCn0K
