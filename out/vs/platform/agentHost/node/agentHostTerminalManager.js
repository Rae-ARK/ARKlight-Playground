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
import { DeferredPromise, raceCancellablePromises, timeout } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { dirname, parse as pathParse } from "../../../base/common/path.js";
import * as platform from "../../../base/common/platform.js";
import { getSystemShell } from "../../../base/node/shell.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { AiAgentEnvValue, AiAgentEnvVar } from "../../chat/common/aiAgentEnv.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { getShellIntegrationInjection } from "../../terminal/node/terminalEnvironment.js";
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from "../common/agentHostCustomizationConfig.js";
import { ActionType } from "../common/state/protocol/actions.js";
import { TerminalClaimKind } from "../common/state/protocol/state.js";
import { isTerminalAction } from "../common/state/sessionActions.js";
import { ROOT_STATE_URI } from "../common/state/sessionState.js";
import { IAgentConfigurationService } from "./agentConfigurationService.js";
import { AgentHostHeadlessTerminal } from "./agentHostHeadlessTerminal.js";
import { isZsh } from "./agentHostShellUtils.js";
import { IAgentHostStateManager } from "./agentHostStateManager.js";
import { Osc633EventType, Osc633Parser } from "./osc633Parser.js";
const WAIT_FOR_PROMPT_TIMEOUT = 1e4;
const HEADLESS_TERMINAL_SCROLLBACK = 0;
const DSR_CURSOR_POSITION_QUERY = "\x1B[6n";
const DEC_DSR_CURSOR_POSITION_QUERY = "\x1B[?6n";
const OSC_FOREGROUND_COLOR_QUERY_ST = "\x1B]10;?\x1B\\";
const OSC_FOREGROUND_COLOR_QUERY_BEL = "\x1B]10;?\x07";
const OSC_BACKGROUND_COLOR_QUERY_ST = "\x1B]11;?\x1B\\";
const OSC_BACKGROUND_COLOR_QUERY_BEL = "\x1B]11;?\x07";
const TERMINAL_QUERIES_SUPPRESSED_FROM_CLIENT = [
  DEC_DSR_CURSOR_POSITION_QUERY,
  DSR_CURSOR_POSITION_QUERY,
  OSC_FOREGROUND_COLOR_QUERY_ST,
  OSC_FOREGROUND_COLOR_QUERY_BEL,
  OSC_BACKGROUND_COLOR_QUERY_ST,
  OSC_BACKGROUND_COLOR_QUERY_BEL
];
const TERMINAL_QUERY_SUPPRESSION_REGEX = /\x1b(?:\[\??6n|\]1[01];\?(?:\x07|\x1b\\))/g;
const TERMINAL_QUERY_PREFIXES_SUPPRESSED_FROM_CLIENT = [...new Set(TERMINAL_QUERIES_SUPPRESSED_FROM_CLIENT.flatMap((query) => {
  const prefixes = [];
  for (let i = 1; i < query.length; i++) {
    prefixes.push(query.substring(0, i));
  }
  return prefixes;
}))].sort((a, b) => b.length - a.length);
const IAgentHostTerminalManager = createDecorator("agentHostTerminalManager");
function removeTerminalQueriesSuppressedFromClient(data, state) {
  if (!state.pendingData && !data.includes("\x1B")) {
    return data;
  }
  const combinedData = state.pendingData + data;
  const pendingData = getTerminalQueryPrefixSuppressedFromClient(combinedData);
  const dataToFilter = pendingData ? combinedData.substring(0, combinedData.length - pendingData.length) : combinedData;
  state.pendingData = pendingData;
  return dataToFilter.replace(TERMINAL_QUERY_SUPPRESSION_REGEX, "");
}
function getTerminalQueryPrefixSuppressedFromClient(data) {
  for (const prefix of TERMINAL_QUERY_PREFIXES_SUPPRESSED_FROM_CLIENT) {
    if (data.endsWith(prefix)) {
      return prefix;
    }
  }
  return "";
}
function formatTerminalText(data, options) {
  if (options.forceBracketedPasteMode) {
    data = `\x1B[200~${data}\x1B[201~`;
  }
  data = data.replace(/\r?\n/g, "\r");
  if (options.shouldExecute && !data.endsWith("\r")) {
    data += "\r";
  }
  return data;
}
let nodePtyModule;
async function getNodePty() {
  if (!nodePtyModule) {
    nodePtyModule = await import("node-pty");
  }
  return nodePtyModule;
}
let AgentHostTerminalManager = class extends Disposable {
  constructor(_stateManager, _logService, _productService, _configurationService) {
    super();
    this._stateManager = _stateManager;
    this._logService = _logService;
    this._productService = _productService;
    this._configurationService = _configurationService;
    this._terminals = /* @__PURE__ */ new Map();
    this._outputTerminals = /* @__PURE__ */ new Map();
    this._register(this._stateManager.onDidEmitEnvelope((envelope) => {
      const action = envelope.action;
      if (!isTerminalAction(action)) {
        return;
      }
      const channel = envelope.channel;
      switch (action.type) {
        case ActionType.TerminalInput:
          this._writeInput(channel, action.data);
          break;
        case ActionType.TerminalResized:
          this._resize(channel, action.cols, action.rows);
          break;
        case ActionType.TerminalClaimed:
          this._setClaim(channel, action.claim);
          break;
        case ActionType.TerminalTitleChanged:
          this._setTitle(channel, action.title);
          break;
        case ActionType.TerminalCleared:
          this._clearContent(channel);
          break;
      }
    }));
  }
  /** Get metadata for all active terminals (for root state). */
  getTerminalInfos() {
    return [...this._terminals.values()].map((t) => ({
      resource: t.uri,
      title: t.title,
      claim: t.claim,
      exitCode: t.exitCode
    }));
  }
  /** Get the full state for a terminal (for subscribe snapshots). */
  getTerminalState(uri) {
    const outputTerminal = this._outputTerminals.get(uri);
    if (outputTerminal) {
      return {
        title: outputTerminal.title,
        content: outputTerminal.content,
        exitCode: outputTerminal.exitCode,
        claim: outputTerminal.claim,
        isPty: false
      };
    }
    const terminal = this._terminals.get(uri);
    if (!terminal) {
      return void 0;
    }
    return {
      title: terminal.title,
      cwd: terminal.cwd,
      cols: terminal.cols,
      rows: terminal.rows,
      content: terminal.content,
      exitCode: terminal.exitCode,
      claim: terminal.claim,
      supportsCommandDetection: terminal.commandTracker?.detectionAvailableEmitted,
      isPty: true
    };
  }
  /**
   * Create a new terminal backed by node-pty.
   * Spawns the user's default shell.
   */
  async createTerminal(params, options) {
    const uri = params.channel;
    if (this._terminals.has(uri)) {
      throw new Error(`Terminal already exists: ${uri}`);
    }
    const cwd = await this._resolveCwd(params.cwd, uri);
    const cols = params.cols ?? 80;
    const rows = params.rows ?? 24;
    const shell = options?.shell ?? await this.getDefaultShell();
    const name = platform.isWindows ? "cmd" : "xterm-256color";
    this._logService.info(`[TerminalManager] Creating terminal ${uri}: shell=${shell}, cwd=${cwd}, cols=${cols}, rows=${rows}`);
    const nonce = generateUuid();
    const env = { ...process.env };
    env[AiAgentEnvVar] = AiAgentEnvValue;
    if (options?.preventShellHistory) {
      env["VSCODE_PREVENT_SHELL_HISTORY"] = "1";
    }
    if (params.claim?.kind === TerminalClaimKind.Session && isZsh(shell)) {
      env["VSCODE_AGENT_ZSH_FIXUPS"] = "1";
    }
    if (options?.nonInteractive) {
      env["LC_ALL"] = "C.UTF-8";
      env["PAGER"] = "";
      env["GIT_PAGER"] = "";
      env["GH_PAGER"] = "";
      env["GIT_TERMINAL_PROMPT"] = "0";
      env["DEBIAN_FRONTEND"] = "noninteractive";
    }
    let shellArgs = [];
    if (platform.isMacintosh) {
      const shellName = pathParse(shell).name;
      if (shellName.match(/(zsh|bash)/)) {
        shellArgs = ["--login"];
      }
    }
    const injection = await getShellIntegrationInjection(
      { executable: shell, args: shellArgs, forceShellIntegration: true },
      {
        shellIntegration: { enabled: true, suggestEnabled: false, nonce },
        windowsUseConptyDll: false,
        environmentVariableCollections: void 0,
        workspaceFolder: void 0,
        isScreenReaderOptimized: false
      },
      void 0,
      this._logService,
      this._productService
    );
    let commandTracker;
    if (injection.type === "injection") {
      this._logService.info(`[TerminalManager] Shell integration injected for ${uri}`);
      if (injection.envMixin) {
        for (const [key, value] of Object.entries(injection.envMixin)) {
          if (value !== void 0) {
            env[key] = value;
          }
        }
      }
      if (injection.newArgs) {
        shellArgs = injection.newArgs;
      }
      if (injection.filesToCopy) {
        for (const f of injection.filesToCopy) {
          try {
            await fs.promises.mkdir(dirname(f.dest), { recursive: true });
            await fs.promises.copyFile(f.source, f.dest);
          } catch {
          }
        }
      }
      commandTracker = {
        parser: new Osc633Parser(),
        nonce,
        commandCounter: 0,
        detectionAvailableEmitted: false
      };
    } else {
      this._logService.info(`[TerminalManager] Shell integration not available for ${uri}: ${injection.reason}`);
    }
    const ptyProcess = await this._spawnPty(shell, shellArgs, {
      name,
      cwd,
      env,
      cols,
      rows
    });
    const store = new DisposableStore();
    const claim = params.claim ?? { kind: TerminalClaimKind.Client, clientId: "" };
    const onDataEmitter = store.add(new Emitter());
    const onExitEmitter = store.add(new Emitter());
    const onClaimChangedEmitter = store.add(new Emitter());
    const onCommandFinishedEmitter = store.add(new Emitter());
    const headlessTerminal = store.add(new AgentHostHeadlessTerminal({
      cols,
      rows,
      scrollback: HEADLESS_TERMINAL_SCROLLBACK,
      logService: this._logService
    }));
    const managed = {
      uri,
      store,
      pty: ptyProcess,
      onDataEmitter,
      onExitEmitter,
      onClaimChangedEmitter,
      onCommandFinishedEmitter,
      title: params.name ?? shell,
      cwd,
      cols,
      rows,
      content: [],
      contentSize: 0,
      claim,
      commandTracker,
      headlessTerminal,
      terminalQueryFilterState: { pendingData: "" }
    };
    this._terminals.set(uri, managed);
    store.add(headlessTerminal.onResponseData((data) => {
      this._logService.debug(`[TerminalManager] Writing headless terminal response for ${uri}: ${JSON.stringify(data)}`);
      try {
        ptyProcess.write(data);
      } catch (err) {
        this._logService.debug(`[TerminalManager] Failed to write headless terminal response for ${uri}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }));
    store.add(toDisposable(() => {
      try {
        ptyProcess.kill();
      } catch {
      }
    }));
    const onFirstData = new DeferredPromise();
    const dataListener = ptyProcess.onData((rawData) => {
      void managed.headlessTerminal?.writePtyData(rawData);
      this._handlePtyData(managed, rawData);
      onFirstData.complete();
    });
    store.add(toDisposable(() => dataListener.dispose()));
    const exitListener = ptyProcess.onExit((e) => {
      managed.exitCode = e.exitCode;
      managed.onExitEmitter.fire(e.exitCode);
      onFirstData.complete();
      this._stateManager.dispatchServerAction(uri, {
        type: ActionType.TerminalExited,
        exitCode: e.exitCode
      });
      this._broadcastTerminalList();
    });
    store.add(toDisposable(() => exitListener.dispose()));
    if (!platform.isWindows) {
      const titleInterval = setInterval(() => {
        const newTitle = ptyProcess.process;
        if (newTitle && newTitle !== managed.title) {
          managed.title = newTitle;
          this._stateManager.dispatchServerAction(uri, {
            type: ActionType.TerminalTitleChanged,
            title: newTitle
          });
          this._broadcastTerminalList();
        }
      }, 200);
      store.add(toDisposable(() => clearInterval(titleInterval)));
    }
    await raceCancellablePromises([onFirstData.p, timeout(WAIT_FOR_PROMPT_TIMEOUT)]);
    this._broadcastTerminalList();
  }
  async _spawnPty(file, args, options) {
    const nodePty = await getNodePty();
    return nodePty.spawn(file, args, options);
  }
  /** Send input data to a terminal's PTY process (from client-dispatched actions). */
  _writeInput(uri, data) {
    this.writeInput(uri, data);
  }
  /** Send input data to a terminal's PTY process. */
  writeInput(uri, data) {
    const terminal = this._terminals.get(uri);
    if (terminal && terminal.exitCode === void 0) {
      terminal.pty.write(data);
    }
  }
  /** Send formatted text to a terminal's PTY process. */
  async sendText(uri, data, options) {
    const terminal = this._terminals.get(uri);
    let forceBracketedPasteMode = false;
    if (options.bracketedPasteMode) {
      await terminal?.headlessTerminal?.whenPtyDataFlushed();
      forceBracketedPasteMode = !!terminal?.headlessTerminal?.isBracketedPasteMode();
    }
    this.writeInput(uri, formatTerminalText(data, { shouldExecute: options.shouldExecute, forceBracketedPasteMode }));
  }
  /** Register a callback for PTY data events on a terminal. */
  onData(uri, cb) {
    const terminal = this._terminals.get(uri);
    if (!terminal) {
      return toDisposable(() => {
      });
    }
    return terminal.onDataEmitter.event(cb);
  }
  /** Register a callback for PTY exit events on a terminal. */
  onExit(uri, cb) {
    const terminal = this._terminals.get(uri);
    if (!terminal) {
      return toDisposable(() => {
      });
    }
    return terminal.onExitEmitter.event(cb);
  }
  /** Register a callback for terminal claim changes. */
  onClaimChanged(uri, cb) {
    const terminal = this._terminals.get(uri);
    if (!terminal) {
      return toDisposable(() => {
      });
    }
    return terminal.onClaimChangedEmitter.event(cb);
  }
  /** Register a callback for command completion events (requires shell integration). */
  onCommandFinished(uri, cb) {
    const terminal = this._terminals.get(uri);
    if (!terminal) {
      return toDisposable(() => {
      });
    }
    return terminal.onCommandFinishedEmitter.event(cb);
  }
  createAltBufferPromise(uri, store) {
    const terminal = this._terminals.get(uri);
    if (!terminal?.headlessTerminal) {
      return new Promise(() => {
      });
    }
    return terminal.headlessTerminal.createAltBufferPromise(store);
  }
  /** Get accumulated scrollback content for a terminal as raw text. */
  getContent(uri) {
    const terminal = this._terminals.get(uri);
    if (!terminal) {
      return void 0;
    }
    return terminal.content.map((p) => p.type === "command" ? p.output : p.value).join("");
  }
  /** Get the current claim for a terminal. */
  getClaim(uri) {
    return this._terminals.get(uri)?.claim;
  }
  /** Check whether a terminal exists. */
  hasTerminal(uri) {
    return this._terminals.has(uri);
  }
  /** Whether the terminal has shell integration active for command detection. */
  supportsCommandDetection(uri) {
    const terminal = this._terminals.get(uri);
    return terminal?.commandTracker?.detectionAvailableEmitted ?? false;
  }
  /** Get the exit code for a terminal, or undefined if still running. */
  getExitCode(uri) {
    return this._terminals.get(uri)?.exitCode;
  }
  /** Resize a terminal. */
  _resize(uri, cols, rows) {
    const terminal = this._terminals.get(uri);
    if (terminal && terminal.exitCode === void 0) {
      terminal.cols = cols;
      terminal.rows = rows;
      terminal.pty.resize(cols, rows);
      terminal.headlessTerminal?.resize(cols, rows);
    }
  }
  /** Update a terminal's claim. */
  _setClaim(uri, claim) {
    const terminal = this._terminals.get(uri);
    if (terminal) {
      terminal.claim = claim;
      terminal.onClaimChangedEmitter.fire(claim);
      this._broadcastTerminalList();
    }
  }
  /** Update a terminal's title. */
  _setTitle(uri, title) {
    const terminal = this._terminals.get(uri);
    if (terminal) {
      terminal.title = title;
      this._broadcastTerminalList();
    }
  }
  /** Clear a terminal's scrollback buffer. */
  _clearContent(uri) {
    const terminal = this._terminals.get(uri);
    if (terminal) {
      terminal.content = [];
      terminal.contentSize = 0;
      terminal.headlessTerminal?.clear();
    }
  }
  /** Process raw PTY output: parse OSC 633 sequences, dispatch actions, track content. */
  _handlePtyData(managed, rawData) {
    const tracker = managed.commandTracker;
    const segments = tracker ? tracker.parser.parseSegments(rawData) : rawData.length > 0 ? [{ kind: "data", data: rawData }] : [];
    let pendingClientData = "";
    const flushClientData = () => {
      if (pendingClientData.length === 0) {
        return;
      }
      managed.onDataEmitter.fire(pendingClientData);
      this._stateManager.dispatchServerAction(managed.uri, {
        type: ActionType.TerminalData,
        data: pendingClientData
      });
      pendingClientData = "";
    };
    for (const segment of segments) {
      if (segment.kind === "event") {
        flushClientData();
        this._handleOsc633Event(managed, tracker, segment.event);
        continue;
      }
      const cleanedData = removeTerminalQueriesSuppressedFromClient(segment.data, managed.terminalQueryFilterState);
      if (cleanedData.length > 0) {
        this._appendToContent(managed, cleanedData);
        pendingClientData += cleanedData;
      }
    }
    flushClientData();
    this._trimContent(managed);
  }
  /** Handle a parsed OSC 633 event by dispatching the appropriate protocol actions. */
  _handleOsc633Event(managed, tracker, event) {
    if (!tracker.detectionAvailableEmitted) {
      tracker.detectionAvailableEmitted = true;
      this._stateManager.dispatchServerAction(managed.uri, {
        type: ActionType.TerminalCommandDetectionAvailable
      });
    }
    switch (event.type) {
      case Osc633EventType.CommandLine: {
        if (event.nonce === tracker.nonce) {
          tracker.pendingCommandLine = event.commandLine;
        }
        break;
      }
      case Osc633EventType.CommandExecuted: {
        const commandId = `cmd-${++tracker.commandCounter}`;
        const commandLine = tracker.pendingCommandLine ?? "";
        const timestamp = Date.now();
        tracker.pendingCommandLine = void 0;
        tracker.activeCommandId = commandId;
        tracker.activeCommandTimestamp = timestamp;
        managed.content.push({
          type: "command",
          commandId,
          commandLine,
          output: "",
          timestamp,
          isComplete: false
        });
        this._stateManager.dispatchServerAction(managed.uri, {
          type: ActionType.TerminalCommandExecuted,
          commandId,
          commandLine,
          timestamp
        });
        break;
      }
      case Osc633EventType.CommandFinished: {
        const finishedCommandId = tracker.activeCommandId;
        if (!finishedCommandId) {
          break;
        }
        const durationMs = tracker.activeCommandTimestamp !== void 0 ? Date.now() - tracker.activeCommandTimestamp : void 0;
        let commandLine = "";
        let commandOutput = "";
        for (const part of managed.content) {
          if (part.type === "command" && part.commandId === finishedCommandId) {
            part.isComplete = true;
            part.exitCode = event.exitCode;
            part.durationMs = durationMs;
            commandLine = part.commandLine;
            commandOutput = part.output;
            break;
          }
        }
        tracker.activeCommandId = void 0;
        tracker.activeCommandTimestamp = void 0;
        managed.onCommandFinishedEmitter.fire({
          commandId: finishedCommandId,
          exitCode: event.exitCode,
          command: commandLine,
          output: commandOutput
        });
        this._stateManager.dispatchServerAction(managed.uri, {
          type: ActionType.TerminalCommandFinished,
          commandId: finishedCommandId,
          exitCode: event.exitCode,
          durationMs
        });
        break;
      }
      case Osc633EventType.Property: {
        if (event.key === "Cwd") {
          managed.cwd = event.value;
          this._stateManager.dispatchServerAction(managed.uri, {
            type: ActionType.TerminalCwdChanged,
            cwd: event.value
          });
        }
        break;
      }
    }
  }
  /** Append cleaned data to the terminal's structured content array. */
  _appendToContent(managed, data) {
    const tail = managed.content.length > 0 ? managed.content[managed.content.length - 1] : void 0;
    if (tail?.type === "command" && !tail.isComplete) {
      tail.output += data;
      managed.contentSize += data.length;
    } else if (tail?.type === "unclassified") {
      tail.value += data;
      managed.contentSize += data.length;
    } else {
      managed.content.push({ type: "unclassified", value: data });
      managed.contentSize += data.length;
    }
  }
  _getContentPartSize(part) {
    return part.type === "command" ? part.output.length : part.value.length;
  }
  /** Trim content parts to stay within the rolling buffer limit. */
  _trimContent(managed) {
    const maxSize = 1e5;
    const targetSize = 8e4;
    if (managed.contentSize <= maxSize) {
      return;
    }
    while (managed.contentSize > targetSize && managed.content.length > 1) {
      const removed = managed.content.shift();
      managed.contentSize -= this._getContentPartSize(removed);
    }
    if (managed.contentSize > targetSize && managed.content.length > 0) {
      const head = managed.content[0];
      const excess = managed.contentSize - targetSize;
      if (head.type === "command") {
        head.output = head.output.slice(excess);
      } else {
        head.value = head.value.slice(excess);
      }
      managed.contentSize -= excess;
    }
  }
  /**
   * Create an output-only terminal channel. Unlike {@link createTerminal}
   * there is no PTY behind it: the owner appends plain-text output via
   * {@link appendOutputTerminalData}. The channel is not announced on the
   * root terminal list — clients discover it through the tool result's
   * terminal content block and subscribe to its URI.
   */
  createOutputTerminal(uri, options) {
    if (this._terminals.has(uri) || this._outputTerminals.has(uri)) {
      throw new Error(`Terminal already exists: ${uri}`);
    }
    this._outputTerminals.set(uri, {
      title: options.title,
      content: [],
      contentSize: 0,
      claim: options.claim
    });
  }
  /** Append plain-text data to an output-only terminal and stream it to subscribers. */
  appendOutputTerminalData(uri, data) {
    const terminal = this._outputTerminals.get(uri);
    if (!terminal || data.length === 0) {
      return;
    }
    this._appendToContent(terminal, data);
    this._trimContent(terminal);
    this._stateManager.dispatchServerAction(uri, {
      type: ActionType.TerminalData,
      data
    });
  }
  /** Clear an output-only terminal's content (e.g. when cumulative source output was rewritten). */
  resetOutputTerminal(uri) {
    const terminal = this._outputTerminals.get(uri);
    if (!terminal) {
      return;
    }
    terminal.content = [];
    terminal.contentSize = 0;
    this._stateManager.dispatchServerAction(uri, {
      type: ActionType.TerminalCleared
    });
  }
  /** Record the command's exit on an output-only terminal and notify subscribers. */
  finalizeOutputTerminal(uri, exitCode) {
    const terminal = this._outputTerminals.get(uri);
    if (!terminal || terminal.exitCode !== void 0) {
      return;
    }
    if (exitCode !== void 0) {
      terminal.exitCode = exitCode;
      this._stateManager.dispatchServerAction(uri, {
        type: ActionType.TerminalExited,
        exitCode
      });
    }
  }
  /** Dispose a terminal: kill the process and remove it. */
  disposeTerminal(uri) {
    if (this._outputTerminals.delete(uri)) {
      return;
    }
    const terminal = this._terminals.get(uri);
    if (terminal) {
      this._terminals.delete(uri);
      terminal.store.dispose();
      this._broadcastTerminalList();
    }
  }
  async getDefaultShell() {
    const configured = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.DefaultShell);
    if (configured) {
      try {
        await fs.promises.access(configured, fs.constants.X_OK);
        return configured;
      } catch (err) {
        this._logService.warn(`[TerminalManager] Configured defaultShell '${configured}' is not accessible, falling back to system shell: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return getSystemShell(platform.OS, process.env);
  }
  /**
   * Resolves the cwd string from {@link CreateTerminalParams} to an
   * accessible filesystem path, falling back to $HOME if the requested
   * directory is missing (otherwise node-pty exits silently with code 1).
   * Accepts either a `file://` URI string or a raw absolute filesystem path.
   */
  async _resolveCwd(cwd, terminalURI) {
    let resolved = cwd;
    if (cwd) {
      const parsed = URI.parse(cwd);
      if (parsed.scheme === "file" && parsed.fsPath && parsed.fsPath !== "/") {
        resolved = parsed.fsPath;
      } else {
        this._logService.warn(`[TerminalManager] Ignoring non-file cwd for ${terminalURI}: ${cwd}`);
      }
    }
    try {
      if (resolved) {
        const stat = await fs.promises.stat(resolved);
        if (stat.isDirectory()) {
          return resolved;
        }
      }
    } catch {
    }
    const fallback = process.env["HOME"] || process.env["USERPROFILE"] || process.cwd();
    this._logService.warn(`[TerminalManager] cwd '${resolved}' is not accessible, falling back to ${fallback}`);
    return fallback;
  }
  /** Dispatch root/terminalsChanged with the current terminal list. */
  _broadcastTerminalList() {
    this._stateManager.dispatchServerAction(ROOT_STATE_URI, {
      type: ActionType.RootTerminalsChanged,
      terminals: this.getTerminalInfos()
    });
  }
  dispose() {
    for (const terminal of this._terminals.values()) {
      terminal.store.dispose();
    }
    this._terminals.clear();
    super.dispose();
  }
};
AgentHostTerminalManager = __decorateClass([
  __decorateParam(0, IAgentHostStateManager),
  __decorateParam(1, ILogService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IAgentConfigurationService)
], AgentHostTerminalManager);
export {
  AgentHostTerminalManager,
  IAgentHostTerminalManager,
  formatTerminalText,
  removeTerminalQueriesSuppressedFromClient
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50SG9zdFRlcm1pbmFsTWFuYWdlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgcmFjZUNhbmNlbGxhYmxlUHJvbWlzZXMsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIHBhcnNlIGFzIHBhdGhQYXJzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZ2V0U3lzdGVtU2hlbGwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvc2hlbGwuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgQWlBZ2VudEVudlZhbHVlLCBBaUFnZW50RW52VmFyIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYWlBZ2VudEVudi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbiB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsL25vZGUvdGVybWluYWxFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb25maWdLZXksIGFnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWdTY2hlbWEgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q3VzdG9taXphdGlvbkNvbmZpZy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2FjdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBDcmVhdGVUZXJtaW5hbFBhcmFtcyB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENsYWltLCBUZXJtaW5hbENvbnRlbnRQYXJ0LCBUZXJtaW5hbEluZm8sIFRlcm1pbmFsU3RhdGUsIFRlcm1pbmFsQ2xhaW1LaW5kIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IGlzVGVybWluYWxBY3Rpb24gfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgUk9PVF9TVEFURV9VUkkgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEhlYWRsZXNzVGVybWluYWwgfSBmcm9tICcuL2FnZW50SG9zdEhlYWRsZXNzVGVybWluYWwuanMnO1xuaW1wb3J0IHsgaXNac2ggfSBmcm9tICcuL2FnZW50SG9zdFNoZWxsVXRpbHMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgT3NjNjMzRXZlbnQsIE9zYzYzM0V2ZW50VHlwZSwgT3NjNjMzUGFyc2VTZWdtZW50LCBPc2M2MzNQYXJzZXIgfSBmcm9tICcuL29zYzYzM1BhcnNlci5qcyc7XG5cbmNvbnN0IFdBSVRfRk9SX1BST01QVF9USU1FT1VUID0gMTBfMDAwO1xuY29uc3QgSEVBRExFU1NfVEVSTUlOQUxfU0NST0xMQkFDSyA9IDA7XG5jb25zdCBEU1JfQ1VSU09SX1BPU0lUSU9OX1FVRVJZID0gJ1xceDFiWzZuJztcbmNvbnN0IERFQ19EU1JfQ1VSU09SX1BPU0lUSU9OX1FVRVJZID0gJ1xceDFiWz82bic7XG5jb25zdCBPU0NfRk9SRUdST1VORF9DT0xPUl9RVUVSWV9TVCA9ICdcXHgxYl0xMDs/XFx4MWJcXFxcJztcbmNvbnN0IE9TQ19GT1JFR1JPVU5EX0NPTE9SX1FVRVJZX0JFTCA9ICdcXHgxYl0xMDs/XFx4MDcnO1xuY29uc3QgT1NDX0JBQ0tHUk9VTkRfQ09MT1JfUVVFUllfU1QgPSAnXFx4MWJdMTE7P1xceDFiXFxcXCc7XG5jb25zdCBPU0NfQkFDS0dST1VORF9DT0xPUl9RVUVSWV9CRUwgPSAnXFx4MWJdMTE7P1xceDA3JztcbmNvbnN0IFRFUk1JTkFMX1FVRVJJRVNfU1VQUFJFU1NFRF9GUk9NX0NMSUVOVCA9IFtcblx0REVDX0RTUl9DVVJTT1JfUE9TSVRJT05fUVVFUlksXG5cdERTUl9DVVJTT1JfUE9TSVRJT05fUVVFUlksXG5cdE9TQ19GT1JFR1JPVU5EX0NPTE9SX1FVRVJZX1NULFxuXHRPU0NfRk9SRUdST1VORF9DT0xPUl9RVUVSWV9CRUwsXG5cdE9TQ19CQUNLR1JPVU5EX0NPTE9SX1FVRVJZX1NULFxuXHRPU0NfQkFDS0dST1VORF9DT0xPUl9RVUVSWV9CRUwsXG5dO1xuY29uc3QgVEVSTUlOQUxfUVVFUllfU1VQUFJFU1NJT05fUkVHRVggPSAvXFx4MWIoPzpcXFtcXD8/Nm58XFxdMVswMV07XFw/KD86XFx4MDd8XFx4MWJcXFxcKSkvZztcbmNvbnN0IFRFUk1JTkFMX1FVRVJZX1BSRUZJWEVTX1NVUFBSRVNTRURfRlJPTV9DTElFTlQgPSBbLi4ubmV3IFNldChURVJNSU5BTF9RVUVSSUVTX1NVUFBSRVNTRURfRlJPTV9DTElFTlQuZmxhdE1hcChxdWVyeSA9PiB7XG5cdGNvbnN0IHByZWZpeGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGxldCBpID0gMTsgaSA8IHF1ZXJ5Lmxlbmd0aDsgaSsrKSB7XG5cdFx0cHJlZml4ZXMucHVzaChxdWVyeS5zdWJzdHJpbmcoMCwgaSkpO1xuXHR9XG5cdHJldHVybiBwcmVmaXhlcztcbn0pKV0uc29ydCgoYSwgYikgPT4gYi5sZW5ndGggLSBhLmxlbmd0aCk7XG5cbmV4cG9ydCBjb25zdCBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyID0gY3JlYXRlRGVjb3JhdG9yPElBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXI+KCdhZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXInKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQ29tbWFuZEZpbmlzaGVkRXZlbnQge1xuXHRjb21tYW5kSWQ6IHN0cmluZztcblx0ZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0Y29tbWFuZDogc3RyaW5nO1xuXHRvdXRwdXQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxRdWVyeUZpbHRlclN0YXRlIHtcblx0cGVuZGluZ0RhdGE6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VuZFRleHRPcHRpb25zIHtcblx0c2hvdWxkRXhlY3V0ZTogYm9vbGVhbjtcblx0LyoqXG5cdCAqIE1hdGNoIHdvcmtiZW5jaCB0ZXJtaW5hbCBzZW5kVGV4dDogd3JhcCBpbiBicmFja2V0ZWQgcGFzdGUgbWFya2VycyBvbmx5XG5cdCAqIHdoZW4gcmVxdWVzdGVkIGJ5IHRoZSBjYWxsZXIgYW5kIGVuYWJsZWQgYnkgdGhlIHRlcm1pbmFsLlxuXHQgKi9cblx0YnJhY2tldGVkUGFzdGVNb2RlPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRm9ybWF0VGVybWluYWxUZXh0T3B0aW9ucyB7XG5cdHNob3VsZEV4ZWN1dGU6IGJvb2xlYW47XG5cdGZvcmNlQnJhY2tldGVkUGFzdGVNb2RlPzogYm9vbGVhbjtcbn1cblxuLy8gUmV0dXJuIGltbWVkaWF0ZWx5IHdoZW4gbm8gcGFydGlhbCBxdWVyeSBpcyBidWZmZXJlZCBhbmQgdGhpcyBjaHVuayBjb250YWlucyBubyBlc2NhcGUgY2hhcmFjdGVyLlxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZVRlcm1pbmFsUXVlcmllc1N1cHByZXNzZWRGcm9tQ2xpZW50KGRhdGE6IHN0cmluZywgc3RhdGU6IElUZXJtaW5hbFF1ZXJ5RmlsdGVyU3RhdGUpOiBzdHJpbmcge1xuXHRpZiAoIXN0YXRlLnBlbmRpbmdEYXRhICYmICFkYXRhLmluY2x1ZGVzKCdcXHgxYicpKSB7XG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRjb25zdCBjb21iaW5lZERhdGEgPSBzdGF0ZS5wZW5kaW5nRGF0YSArIGRhdGE7XG5cdGNvbnN0IHBlbmRpbmdEYXRhID0gZ2V0VGVybWluYWxRdWVyeVByZWZpeFN1cHByZXNzZWRGcm9tQ2xpZW50KGNvbWJpbmVkRGF0YSk7XG5cdGNvbnN0IGRhdGFUb0ZpbHRlciA9IHBlbmRpbmdEYXRhID8gY29tYmluZWREYXRhLnN1YnN0cmluZygwLCBjb21iaW5lZERhdGEubGVuZ3RoIC0gcGVuZGluZ0RhdGEubGVuZ3RoKSA6IGNvbWJpbmVkRGF0YTtcblx0c3RhdGUucGVuZGluZ0RhdGEgPSBwZW5kaW5nRGF0YTtcblx0cmV0dXJuIGRhdGFUb0ZpbHRlci5yZXBsYWNlKFRFUk1JTkFMX1FVRVJZX1NVUFBSRVNTSU9OX1JFR0VYLCAnJyk7XG59XG5cbmZ1bmN0aW9uIGdldFRlcm1pbmFsUXVlcnlQcmVmaXhTdXBwcmVzc2VkRnJvbUNsaWVudChkYXRhOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRmb3IgKGNvbnN0IHByZWZpeCBvZiBURVJNSU5BTF9RVUVSWV9QUkVGSVhFU19TVVBQUkVTU0VEX0ZST01fQ0xJRU5UKSB7XG5cdFx0aWYgKGRhdGEuZW5kc1dpdGgocHJlZml4KSkge1xuXHRcdFx0cmV0dXJuIHByZWZpeDtcblx0XHR9XG5cdH1cblx0cmV0dXJuICcnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0VGVybWluYWxUZXh0KGRhdGE6IHN0cmluZywgb3B0aW9uczogSUZvcm1hdFRlcm1pbmFsVGV4dE9wdGlvbnMpOiBzdHJpbmcge1xuXHRpZiAob3B0aW9ucy5mb3JjZUJyYWNrZXRlZFBhc3RlTW9kZSkge1xuXHRcdGRhdGEgPSBgXFx4MWJbMjAwfiR7ZGF0YX1cXHgxYlsyMDF+YDtcblx0fVxuXHRkYXRhID0gZGF0YS5yZXBsYWNlKC9cXHI/XFxuL2csICdcXHInKTtcblx0aWYgKG9wdGlvbnMuc2hvdWxkRXhlY3V0ZSAmJiAhZGF0YS5lbmRzV2l0aCgnXFxyJykpIHtcblx0XHRkYXRhICs9ICdcXHInO1xuXHR9XG5cdHJldHVybiBkYXRhO1xufVxuXG4vKipcbiAqIFNlcnZpY2UgaW50ZXJmYWNlIGZvciB0ZXJtaW5hbCBtYW5hZ2VtZW50IGluIHRoZSBhZ2VudCBob3N0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGNyZWF0ZVRlcm1pbmFsKHBhcmFtczogQ3JlYXRlVGVybWluYWxQYXJhbXMsIG9wdGlvbnM/OiB7IHNoZWxsPzogc3RyaW5nOyBwcmV2ZW50U2hlbGxIaXN0b3J5PzogYm9vbGVhbjsgbm9uSW50ZXJhY3RpdmU/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+O1xuXHR3cml0ZUlucHV0KHVyaTogc3RyaW5nLCBkYXRhOiBzdHJpbmcpOiB2b2lkO1xuXHRzZW5kVGV4dCh1cmk6IHN0cmluZywgZGF0YTogc3RyaW5nLCBvcHRpb25zOiBJU2VuZFRleHRPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0b25EYXRhKHVyaTogc3RyaW5nLCBjYjogKGRhdGE6IHN0cmluZykgPT4gdm9pZCk6IElEaXNwb3NhYmxlO1xuXHRvbkV4aXQodXJpOiBzdHJpbmcsIGNiOiAoZXhpdENvZGU6IG51bWJlcikgPT4gdm9pZCk6IElEaXNwb3NhYmxlO1xuXHRvbkNsYWltQ2hhbmdlZCh1cmk6IHN0cmluZywgY2I6IChjbGFpbTogVGVybWluYWxDbGFpbSkgPT4gdm9pZCk6IElEaXNwb3NhYmxlO1xuXHRvbkNvbW1hbmRGaW5pc2hlZCh1cmk6IHN0cmluZywgY2I6IChldmVudDogSUNvbW1hbmRGaW5pc2hlZEV2ZW50KSA9PiB2b2lkKTogSURpc3Bvc2FibGU7XG5cdGNyZWF0ZUFsdEJ1ZmZlclByb21pc2UodXJpOiBzdHJpbmcsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiBQcm9taXNlPHZvaWQ+O1xuXHRnZXRDb250ZW50KHVyaTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXRDbGFpbSh1cmk6IHN0cmluZyk6IFRlcm1pbmFsQ2xhaW0gfCB1bmRlZmluZWQ7XG5cdGhhc1Rlcm1pbmFsKHVyaTogc3RyaW5nKTogYm9vbGVhbjtcblx0Z2V0RXhpdENvZGUodXJpOiBzdHJpbmcpOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHN1cHBvcnRzQ29tbWFuZERldGVjdGlvbih1cmk6IHN0cmluZyk6IGJvb2xlYW47XG5cdGRpc3Bvc2VUZXJtaW5hbCh1cmk6IHN0cmluZyk6IHZvaWQ7XG5cdGdldFRlcm1pbmFsSW5mb3MoKTogVGVybWluYWxJbmZvW107XG5cdGdldFRlcm1pbmFsU3RhdGUodXJpOiBzdHJpbmcpOiBUZXJtaW5hbFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRnZXREZWZhdWx0U2hlbGwoKTogUHJvbWlzZTxzdHJpbmc+O1xuXHRjcmVhdGVPdXRwdXRUZXJtaW5hbCh1cmk6IHN0cmluZywgb3B0aW9uczogeyB0aXRsZTogc3RyaW5nOyBjbGFpbTogVGVybWluYWxDbGFpbSB9KTogdm9pZDtcblx0YXBwZW5kT3V0cHV0VGVybWluYWxEYXRhKHVyaTogc3RyaW5nLCBkYXRhOiBzdHJpbmcpOiB2b2lkO1xuXHRyZXNldE91dHB1dFRlcm1pbmFsKHVyaTogc3RyaW5nKTogdm9pZDtcblx0ZmluYWxpemVPdXRwdXRUZXJtaW5hbCh1cmk6IHN0cmluZywgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQ7XG59XG5cbi8vIG5vZGUtcHR5IGlzIGxvYWRlZCBkeW5hbWljYWxseSB0byBhdm9pZCBidW5kbGluZyBpc3N1ZXMgaW4gbm9uLW5vZGUgZW52aXJvbm1lbnRzXG5sZXQgbm9kZVB0eU1vZHVsZTogdHlwZW9mIGltcG9ydCgnbm9kZS1wdHknKSB8IHVuZGVmaW5lZDtcbmFzeW5jIGZ1bmN0aW9uIGdldE5vZGVQdHkoKTogUHJvbWlzZTx0eXBlb2YgaW1wb3J0KCdub2RlLXB0eScpPiB7XG5cdGlmICghbm9kZVB0eU1vZHVsZSkge1xuXHRcdG5vZGVQdHlNb2R1bGUgPSBhd2FpdCBpbXBvcnQoJ25vZGUtcHR5Jyk7XG5cdH1cblx0cmV0dXJuIG5vZGVQdHlNb2R1bGU7XG59XG5cbi8qKiBQZXItdGVybWluYWwgY29tbWFuZCBkZXRlY3Rpb24gdHJhY2tpbmcgc3RhdGUuICovXG5pbnRlcmZhY2UgSUNvbW1hbmRUcmFja2VyIHtcblx0cmVhZG9ubHkgcGFyc2VyOiBPc2M2MzNQYXJzZXI7XG5cdHJlYWRvbmx5IG5vbmNlOiBzdHJpbmc7XG5cdGNvbW1hbmRDb3VudGVyOiBudW1iZXI7XG5cdGRldGVjdGlvbkF2YWlsYWJsZUVtaXR0ZWQ6IGJvb2xlYW47XG5cdHBlbmRpbmdDb21tYW5kTGluZT86IHN0cmluZztcblx0YWN0aXZlQ29tbWFuZElkPzogc3RyaW5nO1xuXHRhY3RpdmVDb21tYW5kVGltZXN0YW1wPzogbnVtYmVyO1xufVxuXG4vKiogUmVwcmVzZW50cyBhIHNpbmdsZSBtYW5hZ2VkIHRlcm1pbmFsIHdpdGggaXRzIFBUWSBwcm9jZXNzLiAqL1xuaW50ZXJmYWNlIElNYW5hZ2VkVGVybWluYWwge1xuXHRyZWFkb25seSB1cmk6IHN0cmluZztcblx0cmVhZG9ubHkgc3RvcmU6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgcHR5OiBpbXBvcnQoJ25vZGUtcHR5JykuSVB0eTtcblx0cmVhZG9ubHkgb25EYXRhRW1pdHRlcjogRW1pdHRlcjxzdHJpbmc+O1xuXHRyZWFkb25seSBvbkV4aXRFbWl0dGVyOiBFbWl0dGVyPG51bWJlcj47XG5cdHJlYWRvbmx5IG9uQ2xhaW1DaGFuZ2VkRW1pdHRlcjogRW1pdHRlcjxUZXJtaW5hbENsYWltPjtcblx0cmVhZG9ubHkgb25Db21tYW5kRmluaXNoZWRFbWl0dGVyOiBFbWl0dGVyPElDb21tYW5kRmluaXNoZWRFdmVudD47XG5cdHRpdGxlOiBzdHJpbmc7XG5cdGN3ZDogc3RyaW5nO1xuXHRjb2xzOiBudW1iZXI7XG5cdHJvd3M6IG51bWJlcjtcblx0Y29udGVudDogVGVybWluYWxDb250ZW50UGFydFtdO1xuXHRjb250ZW50U2l6ZTogbnVtYmVyO1xuXHRjbGFpbTogVGVybWluYWxDbGFpbTtcblx0ZXhpdENvZGU/OiBudW1iZXI7XG5cdGNvbW1hbmRUcmFja2VyPzogSUNvbW1hbmRUcmFja2VyO1xuXHRoZWFkbGVzc1Rlcm1pbmFsPzogQWdlbnRIb3N0SGVhZGxlc3NUZXJtaW5hbDtcblx0dGVybWluYWxRdWVyeUZpbHRlclN0YXRlOiBJVGVybWluYWxRdWVyeUZpbHRlclN0YXRlO1xufVxuXG4vKipcbiAqIEEgbGlnaHR3ZWlnaHQgb3V0cHV0LW9ubHkgdGVybWluYWwgY2hhbm5lbDogbm8gUFRZIGJlaGluZCBpdCwgcGxhaW4tdGV4dFxuICogY29udGVudCBhcHBlbmRlZCBieSBpdHMgb3duZXIgKGUuZy4gcnVudGltZS1leGVjdXRlZCBzaGVsbCB0b29scykuIFNlcnZlZFxuICogdG8gc3Vic2NyaWJlcnMgd2l0aCBgaXNQdHk6IGZhbHNlYCBzbyBjbGllbnRzIHNraXAgVlQgcGFyc2luZy5cbiAqL1xuaW50ZXJmYWNlIElPdXRwdXRUZXJtaW5hbCB7XG5cdHRpdGxlOiBzdHJpbmc7XG5cdGNvbnRlbnQ6IFRlcm1pbmFsQ29udGVudFBhcnRbXTtcblx0Y29udGVudFNpemU6IG51bWJlcjtcblx0Y2xhaW06IFRlcm1pbmFsQ2xhaW07XG5cdGV4aXRDb2RlPzogbnVtYmVyO1xufVxuXG4vKipcbiAqIE1hbmFnZXMgdGVybWluYWwgcHJvY2Vzc2VzIGZvciB0aGUgYWdlbnQgaG9zdC4gRWFjaCB0ZXJtaW5hbCBpcyBiYWNrZWQgYnlcbiAqIGEgbm9kZS1wdHkgaW5zdGFuY2UgYW5kIGlkZW50aWZpZWQgYnkgYSBwcm90b2NvbCBVUkkuXG4gKlxuICogTGlzdGVucyB0byB0aGUge0BsaW5rIEFnZW50SG9zdFN0YXRlTWFuYWdlcn0gZm9yIGNsaWVudC1kaXNwYXRjaGVkIHRlcm1pbmFsXG4gKiBhY3Rpb25zIChpbnB1dCwgcmVzaXplLCBjbGFpbSBjaGFuZ2VzKSBhbmQgZGlzcGF0Y2hlcyBzZXJ2ZXItb3JpZ2luYXRlZFxuICogUFRZIG91dHB1dCBiYWNrIHRocm91Z2ggdGhlIHN0YXRlIG1hbmFnZXIuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFscyA9IG5ldyBNYXA8c3RyaW5nLCBJTWFuYWdlZFRlcm1pbmFsPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vdXRwdXRUZXJtaW5hbHMgPSBuZXcgTWFwPHN0cmluZywgSU91dHB1dFRlcm1pbmFsPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFJlYWN0IHRvIGNsaWVudC1kaXNwYXRjaGVkIHRlcm1pbmFsIGFjdGlvbnMgZmxvd2luZyB0aHJvdWdoIHRoZSBzdGF0ZSBtYW5hZ2VyXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGVudmVsb3BlID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbjtcblx0XHRcdGlmICghaXNUZXJtaW5hbEFjdGlvbihhY3Rpb24pKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNoYW5uZWwgPSBlbnZlbG9wZS5jaGFubmVsO1xuXHRcdFx0c3dpdGNoIChhY3Rpb24udHlwZSkge1xuXHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuVGVybWluYWxJbnB1dDpcblx0XHRcdFx0XHR0aGlzLl93cml0ZUlucHV0KGNoYW5uZWwsIGFjdGlvbi5kYXRhKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlRlcm1pbmFsUmVzaXplZDpcblx0XHRcdFx0XHR0aGlzLl9yZXNpemUoY2hhbm5lbCwgYWN0aW9uLmNvbHMsIGFjdGlvbi5yb3dzKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlRlcm1pbmFsQ2xhaW1lZDpcblx0XHRcdFx0XHR0aGlzLl9zZXRDbGFpbShjaGFubmVsLCBhY3Rpb24uY2xhaW0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuVGVybWluYWxUaXRsZUNoYW5nZWQ6XG5cdFx0XHRcdFx0dGhpcy5fc2V0VGl0bGUoY2hhbm5lbCwgYWN0aW9uLnRpdGxlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlRlcm1pbmFsQ2xlYXJlZDpcblx0XHRcdFx0XHR0aGlzLl9jbGVhckNvbnRlbnQoY2hhbm5lbCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIEdldCBtZXRhZGF0YSBmb3IgYWxsIGFjdGl2ZSB0ZXJtaW5hbHMgKGZvciByb290IHN0YXRlKS4gKi9cblx0Z2V0VGVybWluYWxJbmZvcygpOiBUZXJtaW5hbEluZm9bXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl90ZXJtaW5hbHMudmFsdWVzKCldLm1hcCh0ID0+ICh7XG5cdFx0XHRyZXNvdXJjZTogdC51cmksXG5cdFx0XHR0aXRsZTogdC50aXRsZSxcblx0XHRcdGNsYWltOiB0LmNsYWltLFxuXHRcdFx0ZXhpdENvZGU6IHQuZXhpdENvZGUsXG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIEdldCB0aGUgZnVsbCBzdGF0ZSBmb3IgYSB0ZXJtaW5hbCAoZm9yIHN1YnNjcmliZSBzbmFwc2hvdHMpLiAqL1xuXHRnZXRUZXJtaW5hbFN0YXRlKHVyaTogc3RyaW5nKTogVGVybWluYWxTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgb3V0cHV0VGVybWluYWwgPSB0aGlzLl9vdXRwdXRUZXJtaW5hbHMuZ2V0KHVyaSk7XG5cdFx0aWYgKG91dHB1dFRlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0aXRsZTogb3V0cHV0VGVybWluYWwudGl0bGUsXG5cdFx0XHRcdGNvbnRlbnQ6IG91dHB1dFRlcm1pbmFsLmNvbnRlbnQsXG5cdFx0XHRcdGV4aXRDb2RlOiBvdXRwdXRUZXJtaW5hbC5leGl0Q29kZSxcblx0XHRcdFx0Y2xhaW06IG91dHB1dFRlcm1pbmFsLmNsYWltLFxuXHRcdFx0XHRpc1B0eTogZmFsc2UsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFscy5nZXQodXJpKTtcblx0XHRpZiAoIXRlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0dGl0bGU6IHRlcm1pbmFsLnRpdGxlLFxuXHRcdFx0Y3dkOiB0ZXJtaW5hbC5jd2QsXG5cdFx0XHRjb2xzOiB0ZXJtaW5hbC5jb2xzLFxuXHRcdFx0cm93czogdGVybWluYWwucm93cyxcblx0XHRcdGNvbnRlbnQ6IHRlcm1pbmFsLmNvbnRlbnQsXG5cdFx0XHRleGl0Q29kZTogdGVybWluYWwuZXhpdENvZGUsXG5cdFx0XHRjbGFpbTogdGVybWluYWwuY2xhaW0sXG5cdFx0XHRzdXBwb3J0c0NvbW1hbmREZXRlY3Rpb246IHRlcm1pbmFsLmNvbW1hbmRUcmFja2VyPy5kZXRlY3Rpb25BdmFpbGFibGVFbWl0dGVkLFxuXHRcdFx0aXNQdHk6IHRydWUsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBuZXcgdGVybWluYWwgYmFja2VkIGJ5IG5vZGUtcHR5LlxuXHQgKiBTcGF3bnMgdGhlIHVzZXIncyBkZWZhdWx0IHNoZWxsLlxuXHQgKi9cblx0YXN5bmMgY3JlYXRlVGVybWluYWwocGFyYW1zOiBDcmVhdGVUZXJtaW5hbFBhcmFtcywgb3B0aW9ucz86IHsgc2hlbGw/OiBzdHJpbmc7IHByZXZlbnRTaGVsbEhpc3Rvcnk/OiBib29sZWFuOyBub25JbnRlcmFjdGl2ZT86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHVyaSA9IHBhcmFtcy5jaGFubmVsO1xuXHRcdGlmICh0aGlzLl90ZXJtaW5hbHMuaGFzKHVyaSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVGVybWluYWwgYWxyZWFkeSBleGlzdHM6ICR7dXJpfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN3ZCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVDd2QocGFyYW1zLmN3ZCwgdXJpKTtcblx0XHRjb25zdCBjb2xzID0gcGFyYW1zLmNvbHMgPz8gODA7XG5cdFx0Y29uc3Qgcm93cyA9IHBhcmFtcy5yb3dzID8/IDI0O1xuXG5cdFx0Y29uc3Qgc2hlbGwgPSBvcHRpb25zPy5zaGVsbCA/PyBhd2FpdCB0aGlzLmdldERlZmF1bHRTaGVsbCgpO1xuXHRcdGNvbnN0IG5hbWUgPSBwbGF0Zm9ybS5pc1dpbmRvd3MgPyAnY21kJyA6ICd4dGVybS0yNTZjb2xvcic7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtUZXJtaW5hbE1hbmFnZXJdIENyZWF0aW5nIHRlcm1pbmFsICR7dXJpfTogc2hlbGw9JHtzaGVsbH0sIGN3ZD0ke2N3ZH0sIGNvbHM9JHtjb2xzfSwgcm93cz0ke3Jvd3N9YCk7XG5cblx0XHQvLyBTaGVsbCBpbnRlZ3JhdGlvbiBcdTIwMTQgaW5qZWN0IHNjcmlwdHMgc28gdGhlIHNoZWxsIGVtaXRzIE9TQyA2MzMgc2VxdWVuY2VzXG5cdFx0Y29uc3Qgbm9uY2UgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBlbnY6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7IC4uLnByb2Nlc3MuZW52IGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfTtcblx0XHQvLyBBdHRyaWJ1dGUgdGhlc2UgY29tbWFuZHMgdG8gVlMgQ29kZS4gQWxyZWFkeSBpbmhlcml0ZWQgZnJvbSB0aGUgYWdlbnRcblx0XHQvLyBob3N0IHByb2Nlc3M7IHNldCBoZXJlIGFzIGRlZmVuc2UgaW4gZGVwdGguXG5cdFx0ZW52W0FpQWdlbnRFbnZWYXJdID0gQWlBZ2VudEVudlZhbHVlO1xuXHRcdGlmIChvcHRpb25zPy5wcmV2ZW50U2hlbGxIaXN0b3J5KSB7XG5cdFx0XHQvLyBQaWNrZWQgdXAgYnkgdGhlIHNoZWxsIGludGVncmF0aW9uIHNjcmlwdHMgdG8gc2V0IEhJU1RDT05UUk9MPWlnbm9yZXNwYWNlXG5cdFx0XHQvLyAoYmFzaCkgLyBISVNUX0lHTk9SRV9TUEFDRSAoenNoKSwgb3Igc3VwcHJlc3MgUFNSZWFkTGluZSBoaXN0b3J5IChwd3NoKS5cblx0XHRcdC8vIENvbWJpbmVkIHdpdGggdGhlIGxlYWRpbmctc3BhY2UgcHJlZml4IGFwcGxpZWQgYXQgY29tbWFuZC13cml0ZSB0aW1lLCB0aGlzXG5cdFx0XHQvLyBwcmV2ZW50cyBhZ2VudC1leGVjdXRlZCBjb21tYW5kcyBmcm9tIHBvbGx1dGluZyB0aGUgdXNlcidzIHNoZWxsIGhpc3RvcnkuXG5cdFx0XHRlbnZbJ1ZTQ09ERV9QUkVWRU5UX1NIRUxMX0hJU1RPUlknXSA9ICcxJztcblx0XHR9XG5cdFx0Ly8gWnNoLXNwZWNpZmljIGZpeHVwcyBmb3IgYWdlbnQgdG9vbCB0ZXJtaW5hbHM6IGRpc2FibGUgYmFuZyBoaXN0b3J5XG5cdFx0Ly8gZXhwYW5zaW9uIGFuZCBlbmFibGUgaW5saW5lICMgY29tbWVudHMuXG5cdFx0aWYgKHBhcmFtcy5jbGFpbT8ua2luZCA9PT0gVGVybWluYWxDbGFpbUtpbmQuU2Vzc2lvbiAmJiBpc1pzaChzaGVsbCkpIHtcblx0XHRcdGVudlsnVlNDT0RFX0FHRU5UX1pTSF9GSVhVUFMnXSA9ICcxJztcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnM/Lm5vbkludGVyYWN0aXZlKSB7XG5cdFx0XHQvLyBTdXBwcmVzcyBwYWdpbmcgYW5kIGludGVyYWN0aXZlIHByb21wdHMgc28gdGhhdCB0b29sLXNwYXduZWRcblx0XHRcdC8vIHRlcm1pbmFscyBwcm9kdWNlIGNsZWFuLCBtYWNoaW5lLWZyaWVuZGx5IG91dHB1dC4gQW4gZW1wdHlcblx0XHRcdC8vIHN0cmluZyBkaXNhYmxlcyBwYWdpbmcgaW4gZ2l0LCBsZXNzLCBhbmQgbW9zdCBDTEkgdG9vbHMgYW5kXG5cdFx0XHQvLyBpcyBzYWZlIG9uIGFsbCBwbGF0Zm9ybXMgKHVubGlrZSAnY2F0JyB3aGljaCBpc24ndCBvbiBXaW5kb3dzIFBBVEgpLlxuXHRcdFx0ZW52WydMQ19BTEwnXSA9ICdDLlVURi04Jztcblx0XHRcdGVudlsnUEFHRVInXSA9ICcnO1xuXHRcdFx0ZW52WydHSVRfUEFHRVInXSA9ICcnO1xuXHRcdFx0ZW52WydHSF9QQUdFUiddID0gJyc7XG5cdFx0XHRlbnZbJ0dJVF9URVJNSU5BTF9QUk9NUFQnXSA9ICcwJztcblx0XHRcdGVudlsnREVCSUFOX0ZST05URU5EJ10gPSAnbm9uaW50ZXJhY3RpdmUnO1xuXHRcdH1cblx0XHRsZXQgc2hlbGxBcmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmIChwbGF0Zm9ybS5pc01hY2ludG9zaCkge1xuXHRcdFx0Y29uc3Qgc2hlbGxOYW1lID0gcGF0aFBhcnNlKHNoZWxsKS5uYW1lO1xuXHRcdFx0aWYgKHNoZWxsTmFtZS5tYXRjaCgvKHpzaHxiYXNoKS8pKSB7XG5cdFx0XHRcdHNoZWxsQXJncyA9IFsnLS1sb2dpbiddO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGluamVjdGlvbiA9IGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oXG5cdFx0XHR7IGV4ZWN1dGFibGU6IHNoZWxsLCBhcmdzOiBzaGVsbEFyZ3MsIGZvcmNlU2hlbGxJbnRlZ3JhdGlvbjogdHJ1ZSB9LFxuXHRcdFx0e1xuXHRcdFx0XHRzaGVsbEludGVncmF0aW9uOiB7IGVuYWJsZWQ6IHRydWUsIHN1Z2dlc3RFbmFibGVkOiBmYWxzZSwgbm9uY2UgfSxcblx0XHRcdFx0d2luZG93c1VzZUNvbnB0eURsbDogZmFsc2UsXG5cdFx0XHRcdGVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQ6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UsXG5cdFx0XHR0aGlzLl9wcm9kdWN0U2VydmljZSxcblx0XHQpO1xuXG5cdFx0bGV0IGNvbW1hbmRUcmFja2VyOiBJQ29tbWFuZFRyYWNrZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoaW5qZWN0aW9uLnR5cGUgPT09ICdpbmplY3Rpb24nKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtUZXJtaW5hbE1hbmFnZXJdIFNoZWxsIGludGVncmF0aW9uIGluamVjdGVkIGZvciAke3VyaX1gKTtcblx0XHRcdGlmIChpbmplY3Rpb24uZW52TWl4aW4pIHtcblx0XHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoaW5qZWN0aW9uLmVudk1peGluKSkge1xuXHRcdFx0XHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRlbnZba2V5XSA9IHZhbHVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGluamVjdGlvbi5uZXdBcmdzKSB7XG5cdFx0XHRcdHNoZWxsQXJncyA9IGluamVjdGlvbi5uZXdBcmdzO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGluamVjdGlvbi5maWxlc1RvQ29weSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGYgb2YgaW5qZWN0aW9uLmZpbGVzVG9Db3B5KSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKGRpcm5hbWUoZi5kZXN0KSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHRhd2FpdCBmcy5wcm9taXNlcy5jb3B5RmlsZShmLnNvdXJjZSwgZi5kZXN0KTtcblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdC8vIFN3YWxsb3cgXHUyMDE0IGFub3RoZXIgcHJvY2VzcyBtYXkgYmUgdXNpbmcgdGhlIHNhbWUgdGVtcCBkaXJcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbW1hbmRUcmFja2VyID0ge1xuXHRcdFx0XHRwYXJzZXI6IG5ldyBPc2M2MzNQYXJzZXIoKSxcblx0XHRcdFx0bm9uY2UsXG5cdFx0XHRcdGNvbW1hbmRDb3VudGVyOiAwLFxuXHRcdFx0XHRkZXRlY3Rpb25BdmFpbGFibGVFbWl0dGVkOiBmYWxzZSxcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1Rlcm1pbmFsTWFuYWdlcl0gU2hlbGwgaW50ZWdyYXRpb24gbm90IGF2YWlsYWJsZSBmb3IgJHt1cml9OiAke2luamVjdGlvbi5yZWFzb259YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHR5UHJvY2VzcyA9IGF3YWl0IHRoaXMuX3NwYXduUHR5KHNoZWxsLCBzaGVsbEFyZ3MsIHtcblx0XHRcdG5hbWUsXG5cdFx0XHRjd2QsXG5cdFx0XHRlbnYsXG5cdFx0XHRjb2xzLFxuXHRcdFx0cm93cyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNsYWltOiBUZXJtaW5hbENsYWltID0gcGFyYW1zLmNsYWltID8/IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuQ2xpZW50LCBjbGllbnRJZDogJycgfTtcblxuXHRcdGNvbnN0IG9uRGF0YUVtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBvbkV4aXRFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0Y29uc3Qgb25DbGFpbUNoYW5nZWRFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPFRlcm1pbmFsQ2xhaW0+KCkpO1xuXHRcdGNvbnN0IG9uQ29tbWFuZEZpbmlzaGVkRW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJQ29tbWFuZEZpbmlzaGVkRXZlbnQ+KCkpO1xuXHRcdGNvbnN0IGhlYWRsZXNzVGVybWluYWwgPSBzdG9yZS5hZGQobmV3IEFnZW50SG9zdEhlYWRsZXNzVGVybWluYWwoe1xuXHRcdFx0Y29scyxcblx0XHRcdHJvd3MsXG5cdFx0XHRzY3JvbGxiYWNrOiBIRUFETEVTU19URVJNSU5BTF9TQ1JPTExCQUNLLFxuXHRcdFx0bG9nU2VydmljZTogdGhpcy5fbG9nU2VydmljZSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBtYW5hZ2VkOiBJTWFuYWdlZFRlcm1pbmFsID0ge1xuXHRcdFx0dXJpLFxuXHRcdFx0c3RvcmUsXG5cdFx0XHRwdHk6IHB0eVByb2Nlc3MsXG5cdFx0XHRvbkRhdGFFbWl0dGVyLFxuXHRcdFx0b25FeGl0RW1pdHRlcixcblx0XHRcdG9uQ2xhaW1DaGFuZ2VkRW1pdHRlcixcblx0XHRcdG9uQ29tbWFuZEZpbmlzaGVkRW1pdHRlcixcblx0XHRcdHRpdGxlOiBwYXJhbXMubmFtZSA/PyBzaGVsbCxcblx0XHRcdGN3ZCxcblx0XHRcdGNvbHMsXG5cdFx0XHRyb3dzLFxuXHRcdFx0Y29udGVudDogW10sXG5cdFx0XHRjb250ZW50U2l6ZTogMCxcblx0XHRcdGNsYWltLFxuXHRcdFx0Y29tbWFuZFRyYWNrZXIsXG5cdFx0XHRoZWFkbGVzc1Rlcm1pbmFsLFxuXHRcdFx0dGVybWluYWxRdWVyeUZpbHRlclN0YXRlOiB7IHBlbmRpbmdEYXRhOiAnJyB9LFxuXHRcdH07XG5cblx0XHR0aGlzLl90ZXJtaW5hbHMuc2V0KHVyaSwgbWFuYWdlZCk7XG5cdFx0c3RvcmUuYWRkKGhlYWRsZXNzVGVybWluYWwub25SZXNwb25zZURhdGEoZGF0YSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbVGVybWluYWxNYW5hZ2VyXSBXcml0aW5nIGhlYWRsZXNzIHRlcm1pbmFsIHJlc3BvbnNlIGZvciAke3VyaX06ICR7SlNPTi5zdHJpbmdpZnkoZGF0YSl9YCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwdHlQcm9jZXNzLndyaXRlKGRhdGEpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtUZXJtaW5hbE1hbmFnZXJdIEZhaWxlZCB0byB3cml0ZSBoZWFkbGVzcyB0ZXJtaW5hbCByZXNwb25zZSBmb3IgJHt1cml9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBXaXJlIFBUWSBldmVudHMgXHUyMTkyIHByb3RvY29sIGV2ZW50c1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dHJ5IHsgcHR5UHJvY2Vzcy5raWxsKCk7IH0gY2F0Y2ggeyAvKiBhbHJlYWR5IGRlYWQgKi8gfVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG9uRmlyc3REYXRhID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGRhdGFMaXN0ZW5lciA9IHB0eVByb2Nlc3Mub25EYXRhKHJhd0RhdGEgPT4ge1xuXHRcdFx0dm9pZCBtYW5hZ2VkLmhlYWRsZXNzVGVybWluYWw/LndyaXRlUHR5RGF0YShyYXdEYXRhKTtcblx0XHRcdHRoaXMuX2hhbmRsZVB0eURhdGEobWFuYWdlZCwgcmF3RGF0YSk7XG5cdFx0XHRvbkZpcnN0RGF0YS5jb21wbGV0ZSgpO1xuXHRcdH0pO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gZGF0YUxpc3RlbmVyLmRpc3Bvc2UoKSkpO1xuXG5cdFx0Y29uc3QgZXhpdExpc3RlbmVyID0gcHR5UHJvY2Vzcy5vbkV4aXQoZSA9PiB7XG5cdFx0XHRtYW5hZ2VkLmV4aXRDb2RlID0gZS5leGl0Q29kZTtcblx0XHRcdG1hbmFnZWQub25FeGl0RW1pdHRlci5maXJlKGUuZXhpdENvZGUpO1xuXHRcdFx0b25GaXJzdERhdGEuY29tcGxldGUoKTtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbih1cmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbEV4aXRlZCxcblx0XHRcdFx0ZXhpdENvZGU6IGUuZXhpdENvZGUsXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2Jyb2FkY2FzdFRlcm1pbmFsTGlzdCgpO1xuXHRcdH0pO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gZXhpdExpc3RlbmVyLmRpc3Bvc2UoKSkpO1xuXG5cdFx0Ly8gUG9sbCBmb3IgdGl0bGUgY2hhbmdlcyAobm9uLVdpbmRvd3MpXG5cdFx0aWYgKCFwbGF0Zm9ybS5pc1dpbmRvd3MpIHtcblx0XHRcdGNvbnN0IHRpdGxlSW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG5ld1RpdGxlID0gcHR5UHJvY2Vzcy5wcm9jZXNzO1xuXHRcdFx0XHRpZiAobmV3VGl0bGUgJiYgbmV3VGl0bGUgIT09IG1hbmFnZWQudGl0bGUpIHtcblx0XHRcdFx0XHRtYW5hZ2VkLnRpdGxlID0gbmV3VGl0bGU7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHVyaSwge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbFRpdGxlQ2hhbmdlZCxcblx0XHRcdFx0XHRcdHRpdGxlOiBuZXdUaXRsZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0aGlzLl9icm9hZGNhc3RUZXJtaW5hbExpc3QoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgMjAwKTtcblx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY2xlYXJJbnRlcnZhbCh0aXRsZUludGVydmFsKSkpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHJhY2VDYW5jZWxsYWJsZVByb21pc2VzKFtvbkZpcnN0RGF0YS5wLCB0aW1lb3V0KFdBSVRfRk9SX1BST01QVF9USU1FT1VUKV0pO1xuXG5cdFx0dGhpcy5fYnJvYWRjYXN0VGVybWluYWxMaXN0KCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX3NwYXduUHR5KGZpbGU6IHN0cmluZywgYXJnczogc3RyaW5nW10sIG9wdGlvbnM6IGltcG9ydCgnbm9kZS1wdHknKS5JUHR5Rm9ya09wdGlvbnMgfCBpbXBvcnQoJ25vZGUtcHR5JykuSVdpbmRvd3NQdHlGb3JrT3B0aW9ucyk6IFByb21pc2U8aW1wb3J0KCdub2RlLXB0eScpLklQdHk+IHtcblx0XHRjb25zdCBub2RlUHR5ID0gYXdhaXQgZ2V0Tm9kZVB0eSgpO1xuXHRcdHJldHVybiBub2RlUHR5LnNwYXduKGZpbGUsIGFyZ3MsIG9wdGlvbnMpO1xuXHR9XG5cblx0LyoqIFNlbmQgaW5wdXQgZGF0YSB0byBhIHRlcm1pbmFsJ3MgUFRZIHByb2Nlc3MgKGZyb20gY2xpZW50LWRpc3BhdGNoZWQgYWN0aW9ucykuICovXG5cdHByaXZhdGUgX3dyaXRlSW5wdXQodXJpOiBzdHJpbmcsIGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMud3JpdGVJbnB1dCh1cmksIGRhdGEpO1xuXHR9XG5cblx0LyoqIFNlbmQgaW5wdXQgZGF0YSB0byBhIHRlcm1pbmFsJ3MgUFRZIHByb2Nlc3MuICovXG5cdHdyaXRlSW5wdXQodXJpOiBzdHJpbmcsIGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fdGVybWluYWxzLmdldCh1cmkpO1xuXHRcdGlmICh0ZXJtaW5hbCAmJiB0ZXJtaW5hbC5leGl0Q29kZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0ZXJtaW5hbC5wdHkud3JpdGUoZGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFNlbmQgZm9ybWF0dGVkIHRleHQgdG8gYSB0ZXJtaW5hbCdzIFBUWSBwcm9jZXNzLiAqL1xuXHRhc3luYyBzZW5kVGV4dCh1cmk6IHN0cmluZywgZGF0YTogc3RyaW5nLCBvcHRpb25zOiBJU2VuZFRleHRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl90ZXJtaW5hbHMuZ2V0KHVyaSk7XG5cdFx0bGV0IGZvcmNlQnJhY2tldGVkUGFzdGVNb2RlID0gZmFsc2U7XG5cdFx0aWYgKG9wdGlvbnMuYnJhY2tldGVkUGFzdGVNb2RlKSB7XG5cdFx0XHRhd2FpdCB0ZXJtaW5hbD8uaGVhZGxlc3NUZXJtaW5hbD8ud2hlblB0eURhdGFGbHVzaGVkKCk7XG5cdFx0XHRmb3JjZUJyYWNrZXRlZFBhc3RlTW9kZSA9ICEhdGVybWluYWw/LmhlYWRsZXNzVGVybWluYWw/LmlzQnJhY2tldGVkUGFzdGVNb2RlKCk7XG5cdFx0fVxuXHRcdHRoaXMud3JpdGVJbnB1dCh1cmksIGZvcm1hdFRlcm1pbmFsVGV4dChkYXRhLCB7IHNob3VsZEV4ZWN1dGU6IG9wdGlvbnMuc2hvdWxkRXhlY3V0ZSwgZm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGUgfSkpO1xuXHR9XG5cblx0LyoqIFJlZ2lzdGVyIGEgY2FsbGJhY2sgZm9yIFBUWSBkYXRhIGV2ZW50cyBvbiBhIHRlcm1pbmFsLiAqL1xuXHRvbkRhdGEodXJpOiBzdHJpbmcsIGNiOiAoZGF0YTogc3RyaW5nKSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fdGVybWluYWxzLmdldCh1cmkpO1xuXHRcdGlmICghdGVybWluYWwpIHtcblx0XHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRlcm1pbmFsLm9uRGF0YUVtaXR0ZXIuZXZlbnQoY2IpO1xuXHR9XG5cblx0LyoqIFJlZ2lzdGVyIGEgY2FsbGJhY2sgZm9yIFBUWSBleGl0IGV2ZW50cyBvbiBhIHRlcm1pbmFsLiAqL1xuXHRvbkV4aXQodXJpOiBzdHJpbmcsIGNiOiAoZXhpdENvZGU6IG51bWJlcikgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFscy5nZXQodXJpKTtcblx0XHRpZiAoIXRlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdFx0fVxuXHRcdHJldHVybiB0ZXJtaW5hbC5vbkV4aXRFbWl0dGVyLmV2ZW50KGNiKTtcblx0fVxuXG5cdC8qKiBSZWdpc3RlciBhIGNhbGxiYWNrIGZvciB0ZXJtaW5hbCBjbGFpbSBjaGFuZ2VzLiAqL1xuXHRvbkNsYWltQ2hhbmdlZCh1cmk6IHN0cmluZywgY2I6IChjbGFpbTogVGVybWluYWxDbGFpbSkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFscy5nZXQodXJpKTtcblx0XHRpZiAoIXRlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdFx0fVxuXHRcdHJldHVybiB0ZXJtaW5hbC5vbkNsYWltQ2hhbmdlZEVtaXR0ZXIuZXZlbnQoY2IpO1xuXHR9XG5cblx0LyoqIFJlZ2lzdGVyIGEgY2FsbGJhY2sgZm9yIGNvbW1hbmQgY29tcGxldGlvbiBldmVudHMgKHJlcXVpcmVzIHNoZWxsIGludGVncmF0aW9uKS4gKi9cblx0b25Db21tYW5kRmluaXNoZWQodXJpOiBzdHJpbmcsIGNiOiAoZXZlbnQ6IElDb21tYW5kRmluaXNoZWRFdmVudCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFscy5nZXQodXJpKTtcblx0XHRpZiAoIXRlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdFx0fVxuXHRcdHJldHVybiB0ZXJtaW5hbC5vbkNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIuZXZlbnQoY2IpO1xuXHR9XG5cblx0Y3JlYXRlQWx0QnVmZmVyUHJvbWlzZSh1cmk6IHN0cmluZywgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fdGVybWluYWxzLmdldCh1cmkpO1xuXHRcdGlmICghdGVybWluYWw/LmhlYWRsZXNzVGVybWluYWwpIHtcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZSgoKSA9PiB7IH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGVybWluYWwuaGVhZGxlc3NUZXJtaW5hbC5jcmVhdGVBbHRCdWZmZXJQcm9taXNlKHN0b3JlKTtcblx0fVxuXG5cdC8qKiBHZXQgYWNjdW11bGF0ZWQgc2Nyb2xsYmFjayBjb250ZW50IGZvciBhIHRlcm1pbmFsIGFzIHJhdyB0ZXh0LiAqL1xuXHRnZXRDb250ZW50KHVyaTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFscy5nZXQodXJpKTtcblx0XHRpZiAoIXRlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGVybWluYWwuY29udGVudC5tYXAocCA9PiBwLnR5cGUgPT09ICdjb21tYW5kJyA/IHAub3V0cHV0IDogcC52YWx1ZSkuam9pbignJyk7XG5cdH1cblxuXHQvKiogR2V0IHRoZSBjdXJyZW50IGNsYWltIGZvciBhIHRlcm1pbmFsLiAqL1xuXHRnZXRDbGFpbSh1cmk6IHN0cmluZyk6IFRlcm1pbmFsQ2xhaW0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbHMuZ2V0KHVyaSk/LmNsYWltO1xuXHR9XG5cblx0LyoqIENoZWNrIHdoZXRoZXIgYSB0ZXJtaW5hbCBleGlzdHMuICovXG5cdGhhc1Rlcm1pbmFsKHVyaTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFscy5oYXModXJpKTtcblx0fVxuXG5cdC8qKiBXaGV0aGVyIHRoZSB0ZXJtaW5hbCBoYXMgc2hlbGwgaW50ZWdyYXRpb24gYWN0aXZlIGZvciBjb21tYW5kIGRldGVjdGlvbi4gKi9cblx0c3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uKHVyaTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl90ZXJtaW5hbHMuZ2V0KHVyaSk7XG5cdFx0cmV0dXJuIHRlcm1pbmFsPy5jb21tYW5kVHJhY2tlcj8uZGV0ZWN0aW9uQXZhaWxhYmxlRW1pdHRlZCA/PyBmYWxzZTtcblx0fVxuXG5cdC8qKiBHZXQgdGhlIGV4aXQgY29kZSBmb3IgYSB0ZXJtaW5hbCwgb3IgdW5kZWZpbmVkIGlmIHN0aWxsIHJ1bm5pbmcuICovXG5cdGdldEV4aXRDb2RlKHVyaTogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxzLmdldCh1cmkpPy5leGl0Q29kZTtcblx0fVxuXG5cdC8qKiBSZXNpemUgYSB0ZXJtaW5hbC4gKi9cblx0cHJpdmF0ZSBfcmVzaXplKHVyaTogc3RyaW5nLCBjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fdGVybWluYWxzLmdldCh1cmkpO1xuXHRcdGlmICh0ZXJtaW5hbCAmJiB0ZXJtaW5hbC5leGl0Q29kZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0ZXJtaW5hbC5jb2xzID0gY29scztcblx0XHRcdHRlcm1pbmFsLnJvd3MgPSByb3dzO1xuXHRcdFx0dGVybWluYWwucHR5LnJlc2l6ZShjb2xzLCByb3dzKTtcblx0XHRcdHRlcm1pbmFsLmhlYWRsZXNzVGVybWluYWw/LnJlc2l6ZShjb2xzLCByb3dzKTtcblx0XHR9XG5cdH1cblxuXHQvKiogVXBkYXRlIGEgdGVybWluYWwncyBjbGFpbS4gKi9cblx0cHJpdmF0ZSBfc2V0Q2xhaW0odXJpOiBzdHJpbmcsIGNsYWltOiBUZXJtaW5hbENsYWltKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl90ZXJtaW5hbHMuZ2V0KHVyaSk7XG5cdFx0aWYgKHRlcm1pbmFsKSB7XG5cdFx0XHR0ZXJtaW5hbC5jbGFpbSA9IGNsYWltO1xuXHRcdFx0dGVybWluYWwub25DbGFpbUNoYW5nZWRFbWl0dGVyLmZpcmUoY2xhaW0pO1xuXHRcdFx0dGhpcy5fYnJvYWRjYXN0VGVybWluYWxMaXN0KCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFVwZGF0ZSBhIHRlcm1pbmFsJ3MgdGl0bGUuICovXG5cdHByaXZhdGUgX3NldFRpdGxlKHVyaTogc3RyaW5nLCB0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl90ZXJtaW5hbHMuZ2V0KHVyaSk7XG5cdFx0aWYgKHRlcm1pbmFsKSB7XG5cdFx0XHR0ZXJtaW5hbC50aXRsZSA9IHRpdGxlO1xuXHRcdFx0dGhpcy5fYnJvYWRjYXN0VGVybWluYWxMaXN0KCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIENsZWFyIGEgdGVybWluYWwncyBzY3JvbGxiYWNrIGJ1ZmZlci4gKi9cblx0cHJpdmF0ZSBfY2xlYXJDb250ZW50KHVyaTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl90ZXJtaW5hbHMuZ2V0KHVyaSk7XG5cdFx0aWYgKHRlcm1pbmFsKSB7XG5cdFx0XHR0ZXJtaW5hbC5jb250ZW50ID0gW107XG5cdFx0XHR0ZXJtaW5hbC5jb250ZW50U2l6ZSA9IDA7XG5cdFx0XHR0ZXJtaW5hbC5oZWFkbGVzc1Rlcm1pbmFsPy5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBQcm9jZXNzIHJhdyBQVFkgb3V0cHV0OiBwYXJzZSBPU0MgNjMzIHNlcXVlbmNlcywgZGlzcGF0Y2ggYWN0aW9ucywgdHJhY2sgY29udGVudC4gKi9cblx0cHJpdmF0ZSBfaGFuZGxlUHR5RGF0YShtYW5hZ2VkOiBJTWFuYWdlZFRlcm1pbmFsLCByYXdEYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB0cmFja2VyID0gbWFuYWdlZC5jb21tYW5kVHJhY2tlcjtcblxuXHRcdC8vIFdpdGhvdXQgY29tbWFuZCBkZXRlY3Rpb24gdGhlcmUgYXJlIG5vIE9TQyA2MzMgc2VxdWVuY2VzIHRvXG5cdFx0Ly8gaW50ZXJsZWF2ZSBcdTIwMTQgdGhlIHdob2xlIGNodW5rIGlzIGNvbW1hbmQgb3V0cHV0LiBXaXRoIGEgdHJhY2tlcixcblx0XHQvLyBwcm9jZXNzIGNsZWFuZWQtZGF0YSBhbmQgZXZlbnRzIGluIHN0cmVhbSBvcmRlciBzbyB0aGF0IG91dHB1dCB3aGljaFxuXHRcdC8vIGFycml2ZXMgYmVmb3JlIGEgQ29tbWFuZEZpbmlzaGVkIG1hcmtlciAoY29tbW9ubHkgaW4gdGhlIHNhbWUgUFRZXG5cdFx0Ly8gcmVhZCBmb3IgZmFzdCBjb21tYW5kcykgaXMgYXBwZW5kZWQgdG8gdGhlIGNvbW1hbmQncyBvdXRwdXQgQkVGT1JFIHRoZVxuXHRcdC8vIGZpbmlzaGVkIGV2ZW50IHNuYXBzaG90cyBpdC4gSGFuZGxpbmcgYWxsIGV2ZW50cyBmaXJzdCB3b3VsZCBlbWl0XG5cdFx0Ly8gQ29tbWFuZEZpbmlzaGVkIHdpdGggdGhlIG5vdC15ZXQtYXBwZW5kZWQgb3V0cHV0IG1pc3NpbmcuXG5cdFx0Y29uc3Qgc2VnbWVudHM6IE9zYzYzM1BhcnNlU2VnbWVudFtdID0gdHJhY2tlclxuXHRcdFx0PyB0cmFja2VyLnBhcnNlci5wYXJzZVNlZ21lbnRzKHJhd0RhdGEpXG5cdFx0XHQ6IChyYXdEYXRhLmxlbmd0aCA+IDAgPyBbeyBraW5kOiAnZGF0YScsIGRhdGE6IHJhd0RhdGEgfV0gOiBbXSk7XG5cblx0XHQvLyBQcmVzZXJ2ZSBPU0MgNjMzIHN0cmVhbSBvcmRlciB3aGVuIGVtaXR0aW5nIEFIUCBhY3Rpb25zOiBjb21tYW5kIGRhdGEgbXVzdCByZW1haW4gYmV0d2VlblxuXHRcdC8vIFRlcm1pbmFsQ29tbWFuZEV4ZWN1dGVkIGFuZCBUZXJtaW5hbENvbW1hbmRGaW5pc2hlZCwgbWF0Y2hpbmcgdGhlIEFIUCBjb250cmFjdCBhbmQgeHRlcm0uXG5cdFx0bGV0IHBlbmRpbmdDbGllbnREYXRhID0gJyc7XG5cdFx0Y29uc3QgZmx1c2hDbGllbnREYXRhID0gKCk6IHZvaWQgPT4ge1xuXHRcdFx0aWYgKHBlbmRpbmdDbGllbnREYXRhLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRtYW5hZ2VkLm9uRGF0YUVtaXR0ZXIuZmlyZShwZW5kaW5nQ2xpZW50RGF0YSk7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24obWFuYWdlZC51cmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbERhdGEsXG5cdFx0XHRcdGRhdGE6IHBlbmRpbmdDbGllbnREYXRhLFxuXHRcdFx0fSk7XG5cdFx0XHRwZW5kaW5nQ2xpZW50RGF0YSA9ICcnO1xuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IHNlZ21lbnQgb2Ygc2VnbWVudHMpIHtcblx0XHRcdGlmIChzZWdtZW50LmtpbmQgPT09ICdldmVudCcpIHtcblx0XHRcdFx0Zmx1c2hDbGllbnREYXRhKCk7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZU9zYzYzM0V2ZW50KG1hbmFnZWQsIHRyYWNrZXIhLCBzZWdtZW50LmV2ZW50KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFnZW50IEhvc3QncyBzZXJ2ZXItc2lkZSBoZWFkbGVzcyB0ZXJtaW5hbCBhbnN3ZXJzIENQUiBidXQgY2Fubm90IGFuc3dlclxuXHRcdFx0Ly8gT1NDIGNvbG9yIHF1ZXJpZXMuIEhpZGUgYm90aCBmcm9tIGNsaWVudCB4dGVybXMgc28gdGVybWluYWwgcmVzcG9uc2VzXG5cdFx0XHQvLyBjYW5ub3QgZmxvdyBiYWNrIG91dCBvZiBvcmRlciB0aHJvdWdoIEFnZW50SG9zdFB0eS5pbnB1dC5cblx0XHRcdGNvbnN0IGNsZWFuZWREYXRhID0gcmVtb3ZlVGVybWluYWxRdWVyaWVzU3VwcHJlc3NlZEZyb21DbGllbnQoc2VnbWVudC5kYXRhLCBtYW5hZ2VkLnRlcm1pbmFsUXVlcnlGaWx0ZXJTdGF0ZSk7XG5cdFx0XHRpZiAoY2xlYW5lZERhdGEubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9hcHBlbmRUb0NvbnRlbnQobWFuYWdlZCwgY2xlYW5lZERhdGEpO1xuXHRcdFx0XHRwZW5kaW5nQ2xpZW50RGF0YSArPSBjbGVhbmVkRGF0YTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmbHVzaENsaWVudERhdGEoKTtcblxuXHRcdC8vIFRyaW0gY29udGVudCBpZiB0b28gbGFyZ2Vcblx0XHR0aGlzLl90cmltQ29udGVudChtYW5hZ2VkKTtcblx0fVxuXG5cdC8qKiBIYW5kbGUgYSBwYXJzZWQgT1NDIDYzMyBldmVudCBieSBkaXNwYXRjaGluZyB0aGUgYXBwcm9wcmlhdGUgcHJvdG9jb2wgYWN0aW9ucy4gKi9cblx0cHJpdmF0ZSBfaGFuZGxlT3NjNjMzRXZlbnQobWFuYWdlZDogSU1hbmFnZWRUZXJtaW5hbCwgdHJhY2tlcjogSUNvbW1hbmRUcmFja2VyLCBldmVudDogT3NjNjMzRXZlbnQpOiB2b2lkIHtcblx0XHQvLyBFbWl0IFRlcm1pbmFsQ29tbWFuZERldGVjdGlvbkF2YWlsYWJsZSBvbiBmaXJzdCBzZXF1ZW5jZVxuXHRcdGlmICghdHJhY2tlci5kZXRlY3Rpb25BdmFpbGFibGVFbWl0dGVkKSB7XG5cdFx0XHR0cmFja2VyLmRldGVjdGlvbkF2YWlsYWJsZUVtaXR0ZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKG1hbmFnZWQudXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRGV0ZWN0aW9uQXZhaWxhYmxlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChldmVudC50eXBlKSB7XG5cdFx0XHRjYXNlIE9zYzYzM0V2ZW50VHlwZS5Db21tYW5kTGluZToge1xuXHRcdFx0XHQvLyBPbmx5IHRydXN0IGNvbW1hbmQgbGluZXMgd2l0aCBhIHZhbGlkIG5vbmNlXG5cdFx0XHRcdGlmIChldmVudC5ub25jZSA9PT0gdHJhY2tlci5ub25jZSkge1xuXHRcdFx0XHRcdHRyYWNrZXIucGVuZGluZ0NvbW1hbmRMaW5lID0gZXZlbnQuY29tbWFuZExpbmU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgT3NjNjMzRXZlbnRUeXBlLkNvbW1hbmRFeGVjdXRlZDoge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kSWQgPSBgY21kLSR7Kyt0cmFja2VyLmNvbW1hbmRDb3VudGVyfWA7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gdHJhY2tlci5wZW5kaW5nQ29tbWFuZExpbmUgPz8gJyc7XG5cdFx0XHRcdGNvbnN0IHRpbWVzdGFtcCA9IERhdGUubm93KCk7XG5cdFx0XHRcdHRyYWNrZXIucGVuZGluZ0NvbW1hbmRMaW5lID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0cmFja2VyLmFjdGl2ZUNvbW1hbmRJZCA9IGNvbW1hbmRJZDtcblx0XHRcdFx0dHJhY2tlci5hY3RpdmVDb21tYW5kVGltZXN0YW1wID0gdGltZXN0YW1wO1xuXG5cdFx0XHRcdC8vIFB1c2ggYSBuZXcgY29tbWFuZCBjb250ZW50IHBhcnRcblx0XHRcdFx0bWFuYWdlZC5jb250ZW50LnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kSWQsXG5cdFx0XHRcdFx0Y29tbWFuZExpbmUsXG5cdFx0XHRcdFx0b3V0cHV0OiAnJyxcblx0XHRcdFx0XHR0aW1lc3RhbXAsXG5cdFx0XHRcdFx0aXNDb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihtYW5hZ2VkLnVyaSwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRXhlY3V0ZWQsXG5cdFx0XHRcdFx0Y29tbWFuZElkLFxuXHRcdFx0XHRcdGNvbW1hbmRMaW5lLFxuXHRcdFx0XHRcdHRpbWVzdGFtcCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjYXNlIE9zYzYzM0V2ZW50VHlwZS5Db21tYW5kRmluaXNoZWQ6IHtcblx0XHRcdFx0Y29uc3QgZmluaXNoZWRDb21tYW5kSWQgPSB0cmFja2VyLmFjdGl2ZUNvbW1hbmRJZDtcblx0XHRcdFx0aWYgKCFmaW5pc2hlZENvbW1hbmRJZCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGR1cmF0aW9uTXMgPSB0cmFja2VyLmFjdGl2ZUNvbW1hbmRUaW1lc3RhbXAgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdD8gRGF0ZS5ub3coKSAtIHRyYWNrZXIuYWN0aXZlQ29tbWFuZFRpbWVzdGFtcFxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdC8vIE1hcmsgdGhlIGNvbW1hbmQgY29udGVudCBwYXJ0IGFzIGNvbXBsZXRlIGFuZCBjb2xsZWN0IG91dHB1dFxuXHRcdFx0XHRsZXQgY29tbWFuZExpbmUgPSAnJztcblx0XHRcdFx0bGV0IGNvbW1hbmRPdXRwdXQgPSAnJztcblx0XHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIG1hbmFnZWQuY29udGVudCkge1xuXHRcdFx0XHRcdGlmIChwYXJ0LnR5cGUgPT09ICdjb21tYW5kJyAmJiBwYXJ0LmNvbW1hbmRJZCA9PT0gZmluaXNoZWRDb21tYW5kSWQpIHtcblx0XHRcdFx0XHRcdHBhcnQuaXNDb21wbGV0ZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRwYXJ0LmV4aXRDb2RlID0gZXZlbnQuZXhpdENvZGU7XG5cdFx0XHRcdFx0XHRwYXJ0LmR1cmF0aW9uTXMgPSBkdXJhdGlvbk1zO1xuXHRcdFx0XHRcdFx0Y29tbWFuZExpbmUgPSBwYXJ0LmNvbW1hbmRMaW5lO1xuXHRcdFx0XHRcdFx0Y29tbWFuZE91dHB1dCA9IHBhcnQub3V0cHV0O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJhY2tlci5hY3RpdmVDb21tYW5kSWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRyYWNrZXIuYWN0aXZlQ29tbWFuZFRpbWVzdGFtcCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRtYW5hZ2VkLm9uQ29tbWFuZEZpbmlzaGVkRW1pdHRlci5maXJlKHtcblx0XHRcdFx0XHRjb21tYW5kSWQ6IGZpbmlzaGVkQ29tbWFuZElkLFxuXHRcdFx0XHRcdGV4aXRDb2RlOiBldmVudC5leGl0Q29kZSxcblx0XHRcdFx0XHRjb21tYW5kOiBjb21tYW5kTGluZSxcblx0XHRcdFx0XHRvdXRwdXQ6IGNvbW1hbmRPdXRwdXQsXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihtYW5hZ2VkLnVyaSwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRmluaXNoZWQsXG5cdFx0XHRcdFx0Y29tbWFuZElkOiBmaW5pc2hlZENvbW1hbmRJZCxcblx0XHRcdFx0XHRleGl0Q29kZTogZXZlbnQuZXhpdENvZGUsXG5cdFx0XHRcdFx0ZHVyYXRpb25Ncyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjYXNlIE9zYzYzM0V2ZW50VHlwZS5Qcm9wZXJ0eToge1xuXHRcdFx0XHRpZiAoZXZlbnQua2V5ID09PSAnQ3dkJykge1xuXHRcdFx0XHRcdG1hbmFnZWQuY3dkID0gZXZlbnQudmFsdWU7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKG1hbmFnZWQudXJpLCB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsQ3dkQ2hhbmdlZCxcblx0XHRcdFx0XHRcdGN3ZDogZXZlbnQudmFsdWUsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqIEFwcGVuZCBjbGVhbmVkIGRhdGEgdG8gdGhlIHRlcm1pbmFsJ3Mgc3RydWN0dXJlZCBjb250ZW50IGFycmF5LiAqL1xuXHRwcml2YXRlIF9hcHBlbmRUb0NvbnRlbnQobWFuYWdlZDogeyBjb250ZW50OiBUZXJtaW5hbENvbnRlbnRQYXJ0W107IGNvbnRlbnRTaXplOiBudW1iZXIgfSwgZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFpbCA9IG1hbmFnZWQuY29udGVudC5sZW5ndGggPiAwID8gbWFuYWdlZC5jb250ZW50W21hbmFnZWQuY29udGVudC5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblxuXHRcdGlmICh0YWlsPy50eXBlID09PSAnY29tbWFuZCcgJiYgIXRhaWwuaXNDb21wbGV0ZSkge1xuXHRcdFx0Ly8gQWN0aXZlIGNvbW1hbmQgXHUyMDE0IGFwcGVuZCB0byBpdHMgb3V0cHV0XG5cdFx0XHR0YWlsLm91dHB1dCArPSBkYXRhO1xuXHRcdFx0bWFuYWdlZC5jb250ZW50U2l6ZSArPSBkYXRhLmxlbmd0aDtcblx0XHR9IGVsc2UgaWYgKHRhaWw/LnR5cGUgPT09ICd1bmNsYXNzaWZpZWQnKSB7XG5cdFx0XHQvLyBFeHRlbmQgdGhlIGV4aXN0aW5nIHVuY2xhc3NpZmllZCBwYXJ0XG5cdFx0XHR0YWlsLnZhbHVlICs9IGRhdGE7XG5cdFx0XHRtYW5hZ2VkLmNvbnRlbnRTaXplICs9IGRhdGEubGVuZ3RoO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBTdGFydCBhIG5ldyB1bmNsYXNzaWZpZWQgcGFydFxuXHRcdFx0bWFuYWdlZC5jb250ZW50LnB1c2goeyB0eXBlOiAndW5jbGFzc2lmaWVkJywgdmFsdWU6IGRhdGEgfSk7XG5cdFx0XHRtYW5hZ2VkLmNvbnRlbnRTaXplICs9IGRhdGEubGVuZ3RoO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldENvbnRlbnRQYXJ0U2l6ZShwYXJ0OiBUZXJtaW5hbENvbnRlbnRQYXJ0KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gcGFydC50eXBlID09PSAnY29tbWFuZCcgPyBwYXJ0Lm91dHB1dC5sZW5ndGggOiBwYXJ0LnZhbHVlLmxlbmd0aDtcblx0fVxuXG5cdC8qKiBUcmltIGNvbnRlbnQgcGFydHMgdG8gc3RheSB3aXRoaW4gdGhlIHJvbGxpbmcgYnVmZmVyIGxpbWl0LiAqL1xuXHRwcml2YXRlIF90cmltQ29udGVudChtYW5hZ2VkOiB7IGNvbnRlbnQ6IFRlcm1pbmFsQ29udGVudFBhcnRbXTsgY29udGVudFNpemU6IG51bWJlciB9KTogdm9pZCB7XG5cdFx0Y29uc3QgbWF4U2l6ZSA9IDEwMF8wMDA7XG5cdFx0Y29uc3QgdGFyZ2V0U2l6ZSA9IDgwXzAwMDtcblx0XHRpZiAobWFuYWdlZC5jb250ZW50U2l6ZSA8PSBtYXhTaXplKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIERyb3Agd2hvbGUgcGFydHMgZnJvbSB0aGUgZnJvbnQgd2hpbGUgcG9zc2libGVcblx0XHR3aGlsZSAobWFuYWdlZC5jb250ZW50U2l6ZSA+IHRhcmdldFNpemUgJiYgbWFuYWdlZC5jb250ZW50Lmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IHJlbW92ZWQgPSBtYW5hZ2VkLmNvbnRlbnQuc2hpZnQoKSE7XG5cdFx0XHRtYW5hZ2VkLmNvbnRlbnRTaXplIC09IHRoaXMuX2dldENvbnRlbnRQYXJ0U2l6ZShyZW1vdmVkKTtcblx0XHR9XG5cdFx0Ly8gSWYgdGhlIHNpbmdsZSByZW1haW5pbmcgKG9yIGZpcnN0KSBwYXJ0IGlzIHN0aWxsIG92ZXIgYnVkZ2V0LCB0cmltIGl0cyB0ZXh0XG5cdFx0aWYgKG1hbmFnZWQuY29udGVudFNpemUgPiB0YXJnZXRTaXplICYmIG1hbmFnZWQuY29udGVudC5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBoZWFkID0gbWFuYWdlZC5jb250ZW50WzBdO1xuXHRcdFx0Y29uc3QgZXhjZXNzID0gbWFuYWdlZC5jb250ZW50U2l6ZSAtIHRhcmdldFNpemU7XG5cdFx0XHRpZiAoaGVhZC50eXBlID09PSAnY29tbWFuZCcpIHtcblx0XHRcdFx0aGVhZC5vdXRwdXQgPSBoZWFkLm91dHB1dC5zbGljZShleGNlc3MpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGVhZC52YWx1ZSA9IGhlYWQudmFsdWUuc2xpY2UoZXhjZXNzKTtcblx0XHRcdH1cblx0XHRcdG1hbmFnZWQuY29udGVudFNpemUgLT0gZXhjZXNzO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYW4gb3V0cHV0LW9ubHkgdGVybWluYWwgY2hhbm5lbC4gVW5saWtlIHtAbGluayBjcmVhdGVUZXJtaW5hbH1cblx0ICogdGhlcmUgaXMgbm8gUFRZIGJlaGluZCBpdDogdGhlIG93bmVyIGFwcGVuZHMgcGxhaW4tdGV4dCBvdXRwdXQgdmlhXG5cdCAqIHtAbGluayBhcHBlbmRPdXRwdXRUZXJtaW5hbERhdGF9LiBUaGUgY2hhbm5lbCBpcyBub3QgYW5ub3VuY2VkIG9uIHRoZVxuXHQgKiByb290IHRlcm1pbmFsIGxpc3QgXHUyMDE0IGNsaWVudHMgZGlzY292ZXIgaXQgdGhyb3VnaCB0aGUgdG9vbCByZXN1bHQnc1xuXHQgKiB0ZXJtaW5hbCBjb250ZW50IGJsb2NrIGFuZCBzdWJzY3JpYmUgdG8gaXRzIFVSSS5cblx0ICovXG5cdGNyZWF0ZU91dHB1dFRlcm1pbmFsKHVyaTogc3RyaW5nLCBvcHRpb25zOiB7IHRpdGxlOiBzdHJpbmc7IGNsYWltOiBUZXJtaW5hbENsYWltIH0pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdGVybWluYWxzLmhhcyh1cmkpIHx8IHRoaXMuX291dHB1dFRlcm1pbmFscy5oYXModXJpKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUZXJtaW5hbCBhbHJlYWR5IGV4aXN0czogJHt1cml9YCk7XG5cdFx0fVxuXHRcdHRoaXMuX291dHB1dFRlcm1pbmFscy5zZXQodXJpLCB7XG5cdFx0XHR0aXRsZTogb3B0aW9ucy50aXRsZSxcblx0XHRcdGNvbnRlbnQ6IFtdLFxuXHRcdFx0Y29udGVudFNpemU6IDAsXG5cdFx0XHRjbGFpbTogb3B0aW9ucy5jbGFpbSxcblx0XHR9KTtcblx0fVxuXG5cdC8qKiBBcHBlbmQgcGxhaW4tdGV4dCBkYXRhIHRvIGFuIG91dHB1dC1vbmx5IHRlcm1pbmFsIGFuZCBzdHJlYW0gaXQgdG8gc3Vic2NyaWJlcnMuICovXG5cdGFwcGVuZE91dHB1dFRlcm1pbmFsRGF0YSh1cmk6IHN0cmluZywgZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl9vdXRwdXRUZXJtaW5hbHMuZ2V0KHVyaSk7XG5cdFx0aWYgKCF0ZXJtaW5hbCB8fCBkYXRhLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hcHBlbmRUb0NvbnRlbnQodGVybWluYWwsIGRhdGEpO1xuXHRcdHRoaXMuX3RyaW1Db250ZW50KHRlcm1pbmFsKTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24odXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSxcblx0XHRcdGRhdGEsXG5cdFx0fSk7XG5cdH1cblxuXHQvKiogQ2xlYXIgYW4gb3V0cHV0LW9ubHkgdGVybWluYWwncyBjb250ZW50IChlLmcuIHdoZW4gY3VtdWxhdGl2ZSBzb3VyY2Ugb3V0cHV0IHdhcyByZXdyaXR0ZW4pLiAqL1xuXHRyZXNldE91dHB1dFRlcm1pbmFsKHVyaTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl9vdXRwdXRUZXJtaW5hbHMuZ2V0KHVyaSk7XG5cdFx0aWYgKCF0ZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0ZXJtaW5hbC5jb250ZW50ID0gW107XG5cdFx0dGVybWluYWwuY29udGVudFNpemUgPSAwO1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbih1cmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDbGVhcmVkLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqIFJlY29yZCB0aGUgY29tbWFuZCdzIGV4aXQgb24gYW4gb3V0cHV0LW9ubHkgdGVybWluYWwgYW5kIG5vdGlmeSBzdWJzY3JpYmVycy4gKi9cblx0ZmluYWxpemVPdXRwdXRUZXJtaW5hbCh1cmk6IHN0cmluZywgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fb3V0cHV0VGVybWluYWxzLmdldCh1cmkpO1xuXHRcdGlmICghdGVybWluYWwgfHwgdGVybWluYWwuZXhpdENvZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZXhpdENvZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGVybWluYWwuZXhpdENvZGUgPSBleGl0Q29kZTtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbih1cmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbEV4aXRlZCxcblx0XHRcdFx0ZXhpdENvZGUsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvKiogRGlzcG9zZSBhIHRlcm1pbmFsOiBraWxsIHRoZSBwcm9jZXNzIGFuZCByZW1vdmUgaXQuICovXG5cdGRpc3Bvc2VUZXJtaW5hbCh1cmk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9vdXRwdXRUZXJtaW5hbHMuZGVsZXRlKHVyaSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl90ZXJtaW5hbHMuZ2V0KHVyaSk7XG5cdFx0aWYgKHRlcm1pbmFsKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbHMuZGVsZXRlKHVyaSk7XG5cdFx0XHR0ZXJtaW5hbC5zdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9icm9hZGNhc3RUZXJtaW5hbExpc3QoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXREZWZhdWx0U2hlbGwoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjb25maWd1cmVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKGFnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWdTY2hlbWEsIEFnZW50SG9zdENvbmZpZ0tleS5EZWZhdWx0U2hlbGwpO1xuXHRcdGlmIChjb25maWd1cmVkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBmcy5wcm9taXNlcy5hY2Nlc3MoY29uZmlndXJlZCwgZnMuY29uc3RhbnRzLlhfT0spO1xuXHRcdFx0XHRyZXR1cm4gY29uZmlndXJlZDtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtUZXJtaW5hbE1hbmFnZXJdIENvbmZpZ3VyZWQgZGVmYXVsdFNoZWxsICcke2NvbmZpZ3VyZWR9JyBpcyBub3QgYWNjZXNzaWJsZSwgZmFsbGluZyBiYWNrIHRvIHN5c3RlbSBzaGVsbDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBnZXRTeXN0ZW1TaGVsbChwbGF0Zm9ybS5PUywgcHJvY2Vzcy5lbnYpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBjd2Qgc3RyaW5nIGZyb20ge0BsaW5rIENyZWF0ZVRlcm1pbmFsUGFyYW1zfSB0byBhblxuXHQgKiBhY2Nlc3NpYmxlIGZpbGVzeXN0ZW0gcGF0aCwgZmFsbGluZyBiYWNrIHRvICRIT01FIGlmIHRoZSByZXF1ZXN0ZWRcblx0ICogZGlyZWN0b3J5IGlzIG1pc3NpbmcgKG90aGVyd2lzZSBub2RlLXB0eSBleGl0cyBzaWxlbnRseSB3aXRoIGNvZGUgMSkuXG5cdCAqIEFjY2VwdHMgZWl0aGVyIGEgYGZpbGU6Ly9gIFVSSSBzdHJpbmcgb3IgYSByYXcgYWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRoLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUN3ZChjd2Q6IHN0cmluZyB8IHVuZGVmaW5lZCwgdGVybWluYWxVUkk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0bGV0IHJlc29sdmVkID0gY3dkO1xuXHRcdGlmIChjd2QpIHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IFVSSS5wYXJzZShjd2QpO1xuXHRcdFx0aWYgKHBhcnNlZC5zY2hlbWUgPT09ICdmaWxlJyAmJiBwYXJzZWQuZnNQYXRoICYmIHBhcnNlZC5mc1BhdGggIT09ICcvJykge1xuXHRcdFx0XHRyZXNvbHZlZCA9IHBhcnNlZC5mc1BhdGg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtUZXJtaW5hbE1hbmFnZXJdIElnbm9yaW5nIG5vbi1maWxlIGN3ZCBmb3IgJHt0ZXJtaW5hbFVSSX06ICR7Y3dkfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IGZzLnByb21pc2VzLnN0YXQocmVzb2x2ZWQpO1xuXHRcdFx0XHRpZiAoc3RhdC5pc0RpcmVjdG9yeSgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc29sdmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBmYWxsIHRocm91Z2ggdG8gZmFsbGJhY2tcblx0XHR9XG5cblx0XHRjb25zdCBmYWxsYmFjayA9IHByb2Nlc3MuZW52WydIT01FJ10gfHwgcHJvY2Vzcy5lbnZbJ1VTRVJQUk9GSUxFJ10gfHwgcHJvY2Vzcy5jd2QoKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtUZXJtaW5hbE1hbmFnZXJdIGN3ZCAnJHtyZXNvbHZlZH0nIGlzIG5vdCBhY2Nlc3NpYmxlLCBmYWxsaW5nIGJhY2sgdG8gJHtmYWxsYmFja31gKTtcblx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdH1cblxuXHQvKiogRGlzcGF0Y2ggcm9vdC90ZXJtaW5hbHNDaGFuZ2VkIHdpdGggdGhlIGN1cnJlbnQgdGVybWluYWwgbGlzdC4gKi9cblx0cHJpdmF0ZSBfYnJvYWRjYXN0VGVybWluYWxMaXN0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihST09UX1NUQVRFX1VSSSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290VGVybWluYWxzQ2hhbmdlZCxcblx0XHRcdHRlcm1pbmFsczogdGhpcy5nZXRUZXJtaW5hbEluZm9zKCksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgdGVybWluYWwgb2YgdGhpcy5fdGVybWluYWxzLnZhbHVlcygpKSB7XG5cdFx0XHR0ZXJtaW5hbC5zdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Rlcm1pbmFscy5jbGVhcigpO1xuXHRcdHN1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
