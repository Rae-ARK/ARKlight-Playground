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
import { Emitter } from "../../../base/common/event.js";
import { MainContext } from "./extHost.protocol.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { URI } from "../../../base/common/uri.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { DisposableStore, Disposable, MutableDisposable } from "../../../base/common/lifecycle.js";
import { Disposable as VSCodeDisposable, EnvironmentVariableMutatorType } from "./extHostTypes.js";
import { localize } from "../../../nls.js";
import { NotSupportedError } from "../../../base/common/errors.js";
import { serializeEnvironmentDescriptionMap, serializeEnvironmentVariableCollection } from "../../../platform/terminal/common/environmentVariableShared.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { ProcessPropertyType, WindowsShellType } from "../../../platform/terminal/common/terminal.js";
import { TerminalDataBufferer } from "../../../platform/terminal/common/terminalDataBuffering.js";
import { ThemeColor } from "../../../base/common/themables.js";
import { Promises } from "../../../base/common/async.js";
import { TerminalCompletionList, TerminalQuickFix, ViewColumn } from "./extHostTypeConverters.js";
import { IExtHostCommands } from "./extHostCommands.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { isWindows } from "../../../base/common/platform.js";
import { hasKey } from "../../../base/common/types.js";
import { isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
const IExtHostTerminalService = createDecorator("IExtHostTerminalService");
class ExtHostTerminal extends Disposable {
  constructor(_proxy, _id, _creationOptions, _name) {
    super();
    this._proxy = _proxy;
    this._id = _id;
    this._creationOptions = _creationOptions;
    this._name = _name;
    this._disposed = false;
    this._state = { isInteractedWith: false, shell: void 0 };
    this.isOpen = false;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this._creationOptions = Object.freeze(this._creationOptions);
    this._pidPromise = new Promise((c) => this._pidPromiseComplete = c);
    const that = this;
    this.value = {
      get name() {
        return that._name || "";
      },
      get processId() {
        return that._pidPromise;
      },
      get creationOptions() {
        return that._creationOptions;
      },
      get exitStatus() {
        return that._exitStatus;
      },
      get state() {
        return that._state;
      },
      get selection() {
        return that._selection;
      },
      get shellIntegration() {
        return that.shellIntegration;
      },
      sendText(text, shouldExecute = true) {
        that._checkDisposed();
        that._proxy.$sendText(that._id, text, shouldExecute);
      },
      show(preserveFocus) {
        that._checkDisposed();
        that._proxy.$show(that._id, preserveFocus);
      },
      hide() {
        that._checkDisposed();
        that._proxy.$hide(that._id);
      },
      dispose() {
        if (!that._disposed) {
          that._disposed = true;
          that._proxy.$dispose(that._id);
        }
      },
      get dimensions() {
        if (that._cols === void 0 || that._rows === void 0) {
          return void 0;
        }
        return {
          columns: that._cols,
          rows: that._rows
        };
      }
    };
  }
  dispose() {
    this._onWillDispose.fire();
    super.dispose();
  }
  async create(options, internalOptions) {
    if (typeof this._id !== "string") {
      throw new Error("Terminal has already been created");
    }
    await this._proxy.$createTerminal(this._id, {
      name: options.name,
      shellPath: options.shellPath ?? void 0,
      shellArgs: options.shellArgs ?? void 0,
      cwd: options.cwd ?? internalOptions?.cwd ?? void 0,
      env: options.env ?? void 0,
      icon: asTerminalIcon(options.iconPath) ?? void 0,
      color: ThemeColor.isThemeColor(options.color) ? options.color.id : void 0,
      initialText: options.message ?? void 0,
      strictEnv: options.strictEnv ?? void 0,
      hideFromUser: options.hideFromUser ?? void 0,
      forceShellIntegration: internalOptions?.forceShellIntegration ?? void 0,
      isFeatureTerminal: internalOptions?.isFeatureTerminal ?? void 0,
      isExtensionOwnedTerminal: true,
      useShellEnvironment: internalOptions?.useShellEnvironment ?? void 0,
      location: internalOptions?.location || this._serializeParentTerminal(options.location, internalOptions?.resolvedExtHostIdentifier),
      isTransient: options.isTransient ?? void 0,
      shellIntegrationNonce: options.shellIntegrationNonce ?? void 0,
      titleTemplate: options.titleTemplate ?? void 0
    });
  }
  async createExtensionTerminal(location, internalOptions, parentTerminal, iconPath, color, shellIntegrationNonce, titleTemplate) {
    if (typeof this._id !== "string") {
      throw new Error("Terminal has already been created");
    }
    await this._proxy.$createTerminal(this._id, {
      name: this._name,
      isExtensionCustomPtyTerminal: true,
      icon: iconPath,
      color: ThemeColor.isThemeColor(color) ? color.id : void 0,
      location: internalOptions?.location || this._serializeParentTerminal(location, parentTerminal),
      isTransient: true,
      shellIntegrationNonce: shellIntegrationNonce ?? void 0,
      titleTemplate: titleTemplate ?? void 0
    });
    if (typeof this._id === "string") {
      throw new Error("Terminal creation failed");
    }
    return this._id;
  }
  _serializeParentTerminal(location, parentTerminal) {
    if (typeof location === "object") {
      if (hasKey(location, { parentTerminal: true }) && location.parentTerminal && parentTerminal) {
        return { parentTerminal };
      }
      if (hasKey(location, { viewColumn: true })) {
        return { viewColumn: ViewColumn.from(location.viewColumn), preserveFocus: location.preserveFocus };
      }
      return void 0;
    }
    return location;
  }
  _checkDisposed() {
    if (this._disposed) {
      throw new Error("Terminal has already been disposed");
    }
  }
  set name(name) {
    this._name = name;
  }
  setExitStatus(code, reason) {
    this._exitStatus = Object.freeze({ code, reason });
  }
  setDimensions(cols, rows) {
    if (cols === this._cols && rows === this._rows) {
      return false;
    }
    if (cols === 0 || rows === 0) {
      return false;
    }
    this._cols = cols;
    this._rows = rows;
    return true;
  }
  setInteractedWith() {
    if (!this._state.isInteractedWith) {
      this._state = {
        ...this._state,
        isInteractedWith: true
      };
      return true;
    }
    return false;
  }
  setShellType(shellType) {
    if (this._state.shell !== shellType) {
      this._state = {
        ...this._state,
        shell: shellType
      };
      return true;
    }
    return false;
  }
  setSelection(selection) {
    this._selection = selection;
  }
  _setProcessId(processId) {
    if (this._pidPromiseComplete) {
      this._pidPromiseComplete(processId);
      this._pidPromiseComplete = void 0;
    } else {
      this._pidPromise.then((pid) => {
        if (pid !== processId) {
          this._pidPromise = Promise.resolve(processId);
        }
      });
    }
  }
}
class ExtHostPseudoterminal {
  constructor(_pty) {
    this._pty = _pty;
    this.id = 0;
    this.shouldPersist = false;
    this._onProcessData = new Emitter();
    this.onProcessData = this._onProcessData.event;
    this._onProcessReady = new Emitter();
    this._onDidChangeProperty = new Emitter();
    this.onDidChangeProperty = this._onDidChangeProperty.event;
    this._onProcessExit = new Emitter();
    this.onProcessExit = this._onProcessExit.event;
  }
  get onProcessReady() {
    return this._onProcessReady.event;
  }
  refreshProperty(property) {
    throw new Error(`refreshProperty is not suppported in extension owned terminals. property: ${property}`);
  }
  updateProperty(property, value) {
    throw new Error(`updateProperty is not suppported in extension owned terminals. property: ${property}, value: ${value}`);
  }
  async start() {
    return void 0;
  }
  shutdown() {
    this._pty.close();
  }
  input(data) {
    this._pty.handleInput?.(data);
  }
  sendSignal(signal) {
  }
  resize(cols, rows) {
    this._pty.setDimensions?.({ columns: cols, rows });
  }
  clearBuffer() {
  }
  async processBinary(data) {
  }
  acknowledgeDataEvent(charCount) {
  }
  async setUnicodeVersion(version) {
  }
  getInitialCwd() {
    return Promise.resolve("");
  }
  getCwd() {
    return Promise.resolve("");
  }
  startSendingEvents(initialDimensions) {
    this._pty.onDidWrite((e) => this._onProcessData.fire(e));
    this._pty.onDidClose?.((e = void 0) => {
      this._onProcessExit.fire(e === void 0 ? void 0 : e);
    });
    this._pty.onDidOverrideDimensions?.((e) => {
      if (e) {
        this._onDidChangeProperty.fire({ type: ProcessPropertyType.OverrideDimensions, value: { cols: e.columns, rows: e.rows } });
      }
    });
    this._pty.onDidChangeName?.((title) => {
      this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: title });
    });
    this._pty.open(initialDimensions ? initialDimensions : void 0);
    if (initialDimensions) {
      this._pty.setDimensions?.(initialDimensions);
    }
    this._onProcessReady.fire({ pid: -1, cwd: "", windowsPty: void 0 });
  }
}
let nextLinkId = 1;
let BaseExtHostTerminalService = class extends Disposable {
  constructor(supportsProcesses, _extHostCommands, extHostRpc) {
    super();
    this._extHostCommands = _extHostCommands;
    this._terminals = [];
    this._terminalProcesses = /* @__PURE__ */ new Map();
    this._terminalProcessDisposables = {};
    this._extensionTerminalAwaitingStart = {};
    this._getTerminalPromises = {};
    this._environmentVariableCollections = /* @__PURE__ */ new Map();
    this._lastQuickFixCommands = this._register(new MutableDisposable());
    this._linkProviders = /* @__PURE__ */ new Set();
    this._completionProviders = /* @__PURE__ */ new Map();
    this._profileProviders = /* @__PURE__ */ new Map();
    this._quickFixProviders = /* @__PURE__ */ new Map();
    this._terminalLinkCache = /* @__PURE__ */ new Map();
    this._terminalLinkCancellationSource = /* @__PURE__ */ new Map();
    this._onDidCloseTerminal = new Emitter();
    this.onDidCloseTerminal = this._onDidCloseTerminal.event;
    this._onDidOpenTerminal = new Emitter();
    this.onDidOpenTerminal = this._onDidOpenTerminal.event;
    this._onDidChangeActiveTerminal = new Emitter();
    this.onDidChangeActiveTerminal = this._onDidChangeActiveTerminal.event;
    this._onDidChangeTerminalDimensions = new Emitter();
    this.onDidChangeTerminalDimensions = this._onDidChangeTerminalDimensions.event;
    this._onDidChangeTerminalState = new Emitter();
    this.onDidChangeTerminalState = this._onDidChangeTerminalState.event;
    this._onDidChangeShell = new Emitter();
    this.onDidChangeShell = this._onDidChangeShell.event;
    this._onDidWriteTerminalData = new Emitter({
      onWillAddFirstListener: () => this._proxy.$startSendingDataEvents(),
      onDidRemoveLastListener: () => this._proxy.$stopSendingDataEvents()
    });
    this.onDidWriteTerminalData = this._onDidWriteTerminalData.event;
    this._onDidExecuteCommand = new Emitter({
      onWillAddFirstListener: () => this._proxy.$startSendingCommandEvents(),
      onDidRemoveLastListener: () => this._proxy.$stopSendingCommandEvents()
    });
    this.onDidExecuteTerminalCommand = this._onDidExecuteCommand.event;
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadTerminalService);
    this._bufferer = new TerminalDataBufferer(this._proxy.$sendProcessData);
    this._proxy.$registerProcessSupport(supportsProcesses);
    this._extHostCommands.registerArgumentProcessor({
      processArgument: (arg) => {
        const deserialize = (arg2) => {
          return this.getTerminalById(arg2.instanceId)?.value;
        };
        switch (arg?.$mid) {
          case MarshalledId.TerminalContext:
            return deserialize(arg);
          default: {
            if (Array.isArray(arg)) {
              for (let i = 0; i < arg.length; i++) {
                if (arg[i].$mid === MarshalledId.TerminalContext) {
                  arg[i] = deserialize(arg[i]);
                } else {
                  break;
                }
              }
            }
            return arg;
          }
        }
      }
    });
    this._register({
      dispose: () => {
        for (const [_, terminalProcess] of this._terminalProcesses) {
          terminalProcess.shutdown(true);
        }
      }
    });
  }
  get activeTerminal() {
    return this._activeTerminal?.value;
  }
  get terminals() {
    return this._terminals.map((term) => term.value);
  }
  getDefaultShell(useAutomationShell) {
    const profile = useAutomationShell ? this._defaultAutomationProfile : this._defaultProfile;
    return profile?.path || "";
  }
  getDefaultShellArgs(useAutomationShell) {
    const profile = useAutomationShell ? this._defaultAutomationProfile : this._defaultProfile;
    return profile?.args || [];
  }
  createExtensionTerminal(options, internalOptions) {
    const terminal = new ExtHostTerminal(this._proxy, generateUuid(), options, options.name);
    const p = new ExtHostPseudoterminal(options.pty);
    terminal.createExtensionTerminal(options.location, internalOptions, this._serializeParentTerminal(options, internalOptions).resolvedExtHostIdentifier, asTerminalIcon(options.iconPath), asTerminalColor(options.color), options.shellIntegrationNonce, options.titleTemplate).then((id) => {
      const disposable = this._setupExtHostProcessListeners(id, p);
      this._terminalProcessDisposables[id] = disposable;
    });
    this._terminals.push(terminal);
    return terminal.value;
  }
  _serializeParentTerminal(options, internalOptions) {
    internalOptions = internalOptions ? internalOptions : {};
    if (options.location && typeof options.location === "object" && hasKey(options.location, { parentTerminal: true })) {
      const parentTerminal = options.location.parentTerminal;
      if (parentTerminal) {
        const parentExtHostTerminal = this._terminals.find((t) => t.value === parentTerminal);
        if (parentExtHostTerminal) {
          internalOptions.resolvedExtHostIdentifier = parentExtHostTerminal._id;
        }
      }
    } else if (options.location && typeof options.location !== "object") {
      internalOptions.location = options.location;
    } else if (internalOptions.location && typeof internalOptions.location === "object" && hasKey(internalOptions.location, { splitActiveTerminal: true })) {
      internalOptions.location = { splitActiveTerminal: true };
    }
    return internalOptions;
  }
  attachPtyToTerminal(id, pty) {
    const terminal = this.getTerminalById(id);
    if (!terminal) {
      throw new Error(`Cannot resolve terminal with id ${id} for virtual process`);
    }
    const p = new ExtHostPseudoterminal(pty);
    const disposable = this._setupExtHostProcessListeners(id, p);
    this._terminalProcessDisposables[id] = disposable;
  }
  async $acceptActiveTerminalChanged(id) {
    const original = this._activeTerminal;
    if (id === null) {
      this._activeTerminal = void 0;
      if (original !== this._activeTerminal) {
        this._onDidChangeActiveTerminal.fire(this._activeTerminal);
      }
      return;
    }
    const terminal = this.getTerminalById(id);
    if (terminal) {
      this._activeTerminal = terminal;
      if (original !== this._activeTerminal) {
        this._onDidChangeActiveTerminal.fire(this._activeTerminal.value);
      }
    }
  }
  async $acceptTerminalProcessData(id, data) {
    const terminal = this.getTerminalById(id);
    if (terminal) {
      this._onDidWriteTerminalData.fire({ terminal: terminal.value, data });
    }
  }
  async $acceptTerminalDimensions(id, cols, rows) {
    const terminal = this.getTerminalById(id);
    if (terminal) {
      if (terminal.setDimensions(cols, rows)) {
        this._onDidChangeTerminalDimensions.fire({
          terminal: terminal.value,
          dimensions: terminal.value.dimensions
        });
      }
    }
  }
  async $acceptDidExecuteCommand(id, command) {
    const terminal = this.getTerminalById(id);
    if (terminal) {
      this._onDidExecuteCommand.fire({ terminal: terminal.value, ...command });
    }
  }
  async $acceptTerminalMaximumDimensions(id, cols, rows) {
    this._terminalProcesses.get(id)?.resize(cols, rows);
  }
  async $acceptTerminalTitleChange(id, name) {
    const terminal = this.getTerminalById(id);
    if (terminal) {
      terminal.name = name;
    }
  }
  async $acceptTerminalClosed(id, exitCode, exitReason) {
    this._terminalLinkCache.delete(id);
    const cancellationSource = this._terminalLinkCancellationSource.get(id);
    if (cancellationSource) {
      this._terminalLinkCancellationSource.delete(id);
      cancellationSource.dispose(true);
    }
    const index = this._getTerminalObjectIndexById(this._terminals, id);
    if (index !== null) {
      const terminal = this._terminals.splice(index, 1)[0];
      terminal.setExitStatus(exitCode, exitReason);
      this._onDidCloseTerminal.fire(terminal.value);
    }
  }
  $acceptTerminalOpened(id, extHostTerminalId, name, shellLaunchConfigDto) {
    if (extHostTerminalId) {
      const index = this._getTerminalObjectIndexById(this._terminals, extHostTerminalId);
      if (index !== null) {
        this._terminals[index]._id = id;
        this._onDidOpenTerminal.fire(this.terminals[index]);
        this._terminals[index].isOpen = true;
        return;
      }
    }
    const creationOptions = {
      name: shellLaunchConfigDto.name,
      shellPath: shellLaunchConfigDto.executable,
      shellArgs: shellLaunchConfigDto.args,
      cwd: typeof shellLaunchConfigDto.cwd === "string" ? shellLaunchConfigDto.cwd : URI.revive(shellLaunchConfigDto.cwd),
      env: shellLaunchConfigDto.env,
      hideFromUser: shellLaunchConfigDto.hideFromUser,
      titleTemplate: shellLaunchConfigDto.titleTemplate
    };
    const terminal = new ExtHostTerminal(this._proxy, id, creationOptions, name);
    this._terminals.push(terminal);
    this._onDidOpenTerminal.fire(terminal.value);
    terminal.isOpen = true;
  }
  async $acceptTerminalProcessId(id, processId) {
    const terminal = this.getTerminalById(id);
    terminal?._setProcessId(processId);
  }
  async $startExtensionTerminal(id, initialDimensions) {
    const terminal = this.getTerminalById(id);
    if (!terminal) {
      return { message: localize("launchFail.idMissingOnExtHost", "Could not find the terminal with id {0} on the extension host", id) };
    }
    if (!terminal.isOpen) {
      await new Promise((r) => {
        const listener = this.onDidOpenTerminal(async (e) => {
          if (e === terminal.value) {
            listener.dispose();
            r();
          }
        });
      });
    }
    const terminalProcess = this._terminalProcesses.get(id);
    if (terminalProcess) {
      terminalProcess.startSendingEvents(initialDimensions);
    } else {
      this._extensionTerminalAwaitingStart[id] = { initialDimensions };
    }
    return void 0;
  }
  _setupExtHostProcessListeners(id, p) {
    const disposables = new DisposableStore();
    disposables.add(p.onProcessReady((e) => this._proxy.$sendProcessReady(id, e.pid, e.cwd, e.windowsPty)));
    disposables.add(p.onDidChangeProperty((property) => this._proxy.$sendProcessProperty(id, property)));
    this._bufferer.startBuffering(id, p.onProcessData);
    disposables.add(p.onProcessExit((exitCode) => this._onProcessExit(id, exitCode)));
    this._terminalProcesses.set(id, p);
    const awaitingStart = this._extensionTerminalAwaitingStart[id];
    if (awaitingStart && p instanceof ExtHostPseudoterminal) {
      p.startSendingEvents(awaitingStart.initialDimensions);
      delete this._extensionTerminalAwaitingStart[id];
    }
    return disposables;
  }
  $acceptProcessAckDataEvent(id, charCount) {
    this._terminalProcesses.get(id)?.acknowledgeDataEvent(charCount);
  }
  $acceptProcessInput(id, data) {
    this._terminalProcesses.get(id)?.input(data);
  }
  $acceptTerminalInteraction(id) {
    const terminal = this.getTerminalById(id);
    if (terminal?.setInteractedWith()) {
      this._onDidChangeTerminalState.fire(terminal.value);
    }
  }
  $acceptTerminalSelection(id, selection) {
    this.getTerminalById(id)?.setSelection(selection);
  }
  $acceptProcessResize(id, cols, rows) {
    try {
      this._terminalProcesses.get(id)?.resize(cols, rows);
    } catch (error) {
      if (error.code !== "EPIPE" && error.code !== "ERR_IPC_CHANNEL_CLOSED") {
        throw error;
      }
    }
  }
  $acceptProcessShutdown(id, immediate) {
    this._terminalProcesses.get(id)?.shutdown(immediate);
  }
  $acceptProcessRequestInitialCwd(id) {
    this._terminalProcesses.get(id)?.getInitialCwd().then((initialCwd) => this._proxy.$sendProcessProperty(id, { type: ProcessPropertyType.InitialCwd, value: initialCwd }));
  }
  $acceptProcessRequestCwd(id) {
    this._terminalProcesses.get(id)?.getCwd().then((cwd) => this._proxy.$sendProcessProperty(id, { type: ProcessPropertyType.Cwd, value: cwd }));
  }
  $acceptProcessRequestLatency(id) {
    return Promise.resolve(id);
  }
  registerProfileProvider(extension, id, provider) {
    if (this._profileProviders.has(id)) {
      throw new Error(`Terminal profile provider "${id}" already registered`);
    }
    this._profileProviders.set(id, { provider, extension });
    this._proxy.$registerProfileProvider(id, extension.identifier.value);
    return new VSCodeDisposable(() => {
      this._profileProviders.delete(id);
      this._proxy.$unregisterProfileProvider(id);
    });
  }
  registerTerminalCompletionProvider(extension, provider, ...triggerCharacters) {
    if (this._completionProviders.has(extension.identifier.value)) {
      throw new Error(`Terminal completion provider "${extension.identifier.value}" already registered`);
    }
    this._completionProviders.set(extension.identifier.value, provider);
    this._proxy.$registerCompletionProvider(extension.identifier.value, extension.identifier.value, ...triggerCharacters);
    return new VSCodeDisposable(() => {
      this._completionProviders.delete(extension.identifier.value);
      this._proxy.$unregisterCompletionProvider(extension.identifier.value);
    });
  }
  async $provideTerminalCompletions(id, options) {
    const token = new CancellationTokenSource().token;
    if (token.isCancellationRequested || !this.activeTerminal) {
      return void 0;
    }
    const provider = this._completionProviders.get(id);
    if (!provider) {
      return;
    }
    const completions = await provider.provideTerminalCompletions(this.activeTerminal, options, token);
    if (completions === null || completions === void 0) {
      return void 0;
    }
    const pathSeparator = !isWindows || this.activeTerminal.state?.shell === WindowsShellType.GitBash ? "/" : "\\";
    return TerminalCompletionList.from(completions, pathSeparator);
  }
  $acceptTerminalShellType(id, shellType) {
    const terminal = this.getTerminalById(id);
    if (terminal?.setShellType(shellType)) {
      this._onDidChangeTerminalState.fire(terminal.value);
    }
  }
  registerTerminalQuickFixProvider(id, extensionId, provider) {
    if (this._quickFixProviders.has(id)) {
      throw new Error(`Terminal quick fix provider "${id}" is already registered`);
    }
    this._quickFixProviders.set(id, provider);
    this._proxy.$registerQuickFixProvider(id, extensionId);
    return new VSCodeDisposable(() => {
      this._quickFixProviders.delete(id);
      this._proxy.$unregisterQuickFixProvider(id);
    });
  }
  async $provideTerminalQuickFixes(id, matchResult) {
    const token = new CancellationTokenSource().token;
    if (token.isCancellationRequested) {
      return;
    }
    const provider = this._quickFixProviders.get(id);
    if (!provider) {
      return;
    }
    const quickFixes = await provider.provideTerminalQuickFixes(matchResult, token);
    if (quickFixes === null || Array.isArray(quickFixes) && quickFixes.length === 0) {
      return void 0;
    }
    const store = new DisposableStore();
    this._lastQuickFixCommands.value = store;
    if (!Array.isArray(quickFixes)) {
      return quickFixes ? TerminalQuickFix.from(quickFixes, this._extHostCommands.converter, store) : void 0;
    }
    const result = [];
    for (const fix of quickFixes) {
      const converted = TerminalQuickFix.from(fix, this._extHostCommands.converter, store);
      if (converted) {
        result.push(converted);
      }
    }
    return result;
  }
  async $createContributedProfileTerminal(id, options) {
    const token = new CancellationTokenSource().token;
    const profileProviderData = this._profileProviders.get(id);
    if (!profileProviderData) {
      throw new Error(`No terminal profile provider registered for id "${id}"`);
    }
    let profile = await profileProviderData.provider.provideTerminalProfile(token);
    if (token.isCancellationRequested) {
      return;
    }
    if (profile && !hasKey(profile, { options: true })) {
      profile = { options: profile };
    }
    if (!profile || !hasKey(profile, { options: true })) {
      throw new Error(`No terminal profile options provided for id "${id}"`);
    }
    const hasTerminalTitleProposal = isProposedApiEnabled(profileProviderData.extension, "terminalTitle");
    if (!hasTerminalTitleProposal && profile.options.titleTemplate !== void 0) {
      console.error(`[${profileProviderData.extension.identifier.value}] \`titleTemplate\` returned from TerminalProfileProvider is ignored because the \`terminalTitle\` proposed API is not enabled.`);
      profile = { options: { ...profile.options, titleTemplate: void 0 } };
    }
    if (!hasTerminalTitleProposal && options.titleTemplate !== void 0) {
      console.error(`[${profileProviderData.extension.identifier.value}] \`titleTemplate\` passed to createContributedTerminalProfile is ignored because the \`terminalTitle\` proposed API is not enabled.`);
    }
    const profileOptions = hasTerminalTitleProposal && options.titleTemplate && !profile.options.titleTemplate ? { ...profile.options, titleTemplate: options.titleTemplate } : profile.options;
    if (hasKey(profileOptions, { pty: true })) {
      this.createExtensionTerminal(profileOptions, options);
      return;
    }
    this.createTerminalFromOptions(profileOptions, options);
  }
  registerLinkProvider(provider) {
    this._linkProviders.add(provider);
    if (this._linkProviders.size === 1) {
      this._proxy.$startLinkProvider();
    }
    return new VSCodeDisposable(() => {
      this._linkProviders.delete(provider);
      if (this._linkProviders.size === 0) {
        this._proxy.$stopLinkProvider();
      }
    });
  }
  async $provideLinks(terminalId, line) {
    const terminal = this.getTerminalById(terminalId);
    if (!terminal) {
      return [];
    }
    this._terminalLinkCache.delete(terminalId);
    const oldToken = this._terminalLinkCancellationSource.get(terminalId);
    oldToken?.dispose(true);
    const cancellationSource = new CancellationTokenSource();
    this._terminalLinkCancellationSource.set(terminalId, cancellationSource);
    const result = [];
    const context = { terminal: terminal.value, line };
    const promises = [];
    for (const provider of this._linkProviders) {
      promises.push(Promises.withAsyncBody(async (r) => {
        const cancelSubscription = cancellationSource.token.onCancellationRequested(() => r({ provider, links: [] }));
        try {
          const links = await provider.provideTerminalLinks(context, cancellationSource.token) || [];
          if (!cancellationSource.token.isCancellationRequested) {
            r({ provider, links });
          }
        } finally {
          cancelSubscription.dispose();
        }
      }));
    }
    const provideResults = await Promise.all(promises);
    if (cancellationSource.token.isCancellationRequested) {
      return [];
    }
    const cacheLinkMap = /* @__PURE__ */ new Map();
    for (const provideResult of provideResults) {
      if (provideResult && provideResult.links.length > 0) {
        result.push(...provideResult.links.map((providerLink) => {
          const link = {
            id: nextLinkId++,
            startIndex: providerLink.startIndex,
            length: providerLink.length,
            label: providerLink.tooltip
          };
          cacheLinkMap.set(link.id, {
            provider: provideResult.provider,
            link: providerLink
          });
          return link;
        }));
      }
    }
    this._terminalLinkCache.set(terminalId, cacheLinkMap);
    return result;
  }
  $activateLink(terminalId, linkId) {
    const cachedLink = this._terminalLinkCache.get(terminalId)?.get(linkId);
    if (!cachedLink) {
      return;
    }
    cachedLink.provider.handleTerminalLink(cachedLink.link);
  }
  _onProcessExit(id, exitCode) {
    this._bufferer.stopBuffering(id);
    this._terminalProcesses.delete(id);
    delete this._extensionTerminalAwaitingStart[id];
    const processDiposable = this._terminalProcessDisposables[id];
    if (processDiposable) {
      processDiposable.dispose();
      delete this._terminalProcessDisposables[id];
    }
    this._proxy.$sendProcessExit(id, exitCode);
  }
  getTerminalById(id) {
    return this._getTerminalObjectById(this._terminals, id);
  }
  getTerminalIdByApiObject(terminal) {
    const index = this._terminals.findIndex((item) => {
      return item.value === terminal;
    });
    return index >= 0 ? index : null;
  }
  _getTerminalObjectById(array, id) {
    const index = this._getTerminalObjectIndexById(array, id);
    return index !== null ? array[index] : null;
  }
  _getTerminalObjectIndexById(array, id) {
    const index = array.findIndex((item) => {
      return item._id === id;
    });
    return index >= 0 ? index : null;
  }
  getEnvironmentVariableCollection(extension) {
    let collection = this._environmentVariableCollections.get(extension.identifier.value);
    if (!collection) {
      collection = this._register(new UnifiedEnvironmentVariableCollection());
      this._setEnvironmentVariableCollection(extension.identifier.value, collection);
    }
    return collection.getScopedEnvironmentVariableCollection(void 0);
  }
  _syncEnvironmentVariableCollection(extensionIdentifier, collection) {
    const serialized = serializeEnvironmentVariableCollection(collection.map);
    const serializedDescription = serializeEnvironmentDescriptionMap(collection.descriptionMap);
    this._proxy.$setEnvironmentVariableCollection(extensionIdentifier, collection.persistent, serialized.length === 0 ? void 0 : serialized, serializedDescription);
  }
  $initEnvironmentVariableCollections(collections) {
    collections.forEach((entry) => {
      const extensionIdentifier = entry[0];
      const collection = this._register(new UnifiedEnvironmentVariableCollection(entry[1]));
      this._setEnvironmentVariableCollection(extensionIdentifier, collection);
    });
  }
  $acceptDefaultProfile(profile, automationProfile) {
    const oldProfile = this._defaultProfile;
    this._defaultProfile = profile;
    this._defaultAutomationProfile = automationProfile;
    if (oldProfile?.path !== profile.path) {
      this._onDidChangeShell.fire(profile.path);
    }
  }
  _setEnvironmentVariableCollection(extensionIdentifier, collection) {
    this._environmentVariableCollections.set(extensionIdentifier, collection);
    this._register(collection.onDidChangeCollection(() => {
      this._syncEnvironmentVariableCollection(extensionIdentifier, collection);
    }));
  }
};
BaseExtHostTerminalService = __decorateClass([
  __decorateParam(1, IExtHostCommands),
  __decorateParam(2, IExtHostRpcService)
], BaseExtHostTerminalService);
class UnifiedEnvironmentVariableCollection extends Disposable {
  constructor(serialized) {
    super();
    this.map = /* @__PURE__ */ new Map();
    this.scopedCollections = /* @__PURE__ */ new Map();
    this.descriptionMap = /* @__PURE__ */ new Map();
    this._persistent = true;
    this._onDidChangeCollection = this._register(new Emitter());
    this.map = new Map(serialized);
  }
  get persistent() {
    return this._persistent;
  }
  set persistent(value) {
    this._persistent = value;
    this._onDidChangeCollection.fire();
  }
  get onDidChangeCollection() {
    return this._onDidChangeCollection && this._onDidChangeCollection.event;
  }
  getScopedEnvironmentVariableCollection(scope) {
    const scopedCollectionKey = this.getScopeKey(scope);
    let scopedCollection = this.scopedCollections.get(scopedCollectionKey);
    if (!scopedCollection) {
      scopedCollection = new ScopedEnvironmentVariableCollection(this, scope);
      this.scopedCollections.set(scopedCollectionKey, scopedCollection);
      this._register(scopedCollection.onDidChangeCollection(() => this._onDidChangeCollection.fire()));
    }
    return scopedCollection;
  }
  replace(variable, value, options, scope) {
    this._setIfDiffers(variable, { value, type: EnvironmentVariableMutatorType.Replace, options: options ?? { applyAtProcessCreation: true }, scope });
  }
  append(variable, value, options, scope) {
    this._setIfDiffers(variable, { value, type: EnvironmentVariableMutatorType.Append, options: options ?? { applyAtProcessCreation: true }, scope });
  }
  prepend(variable, value, options, scope) {
    this._setIfDiffers(variable, { value, type: EnvironmentVariableMutatorType.Prepend, options: options ?? { applyAtProcessCreation: true }, scope });
  }
  _setIfDiffers(variable, mutator) {
    if (mutator.options && mutator.options.applyAtProcessCreation === false && !mutator.options.applyAtShellIntegration) {
      throw new Error("EnvironmentVariableMutatorOptions must apply at either process creation or shell integration");
    }
    const key = this.getKey(variable, mutator.scope);
    const current = this.map.get(key);
    const newOptions = mutator.options ? {
      applyAtProcessCreation: mutator.options.applyAtProcessCreation ?? false,
      applyAtShellIntegration: mutator.options.applyAtShellIntegration ?? false
    } : {
      applyAtProcessCreation: true
    };
    if (!current || current.value !== mutator.value || current.type !== mutator.type || current.options?.applyAtProcessCreation !== newOptions.applyAtProcessCreation || current.options?.applyAtShellIntegration !== newOptions.applyAtShellIntegration || current.scope?.workspaceFolder?.index !== mutator.scope?.workspaceFolder?.index) {
      const key2 = this.getKey(variable, mutator.scope);
      const value = {
        variable,
        ...mutator,
        options: newOptions
      };
      this.map.set(key2, value);
      this._onDidChangeCollection.fire();
    }
  }
  get(variable, scope) {
    const key = this.getKey(variable, scope);
    const value = this.map.get(key);
    return value ? convertMutator(value) : void 0;
  }
  getKey(variable, scope) {
    const scopeKey = this.getScopeKey(scope);
    return scopeKey.length ? `${variable}:::${scopeKey}` : variable;
  }
  getScopeKey(scope) {
    return this.getWorkspaceKey(scope?.workspaceFolder) ?? "";
  }
  getWorkspaceKey(workspaceFolder) {
    return workspaceFolder ? workspaceFolder.uri.toString() : void 0;
  }
  getVariableMap(scope) {
    const map = /* @__PURE__ */ new Map();
    for (const [_, value] of this.map) {
      if (this.getScopeKey(value.scope) === this.getScopeKey(scope)) {
        map.set(value.variable, convertMutator(value));
      }
    }
    return map;
  }
  delete(variable, scope) {
    const key = this.getKey(variable, scope);
    this.map.delete(key);
    this._onDidChangeCollection.fire();
  }
  clear(scope) {
    if (scope?.workspaceFolder) {
      for (const [key, mutator] of this.map) {
        if (mutator.scope?.workspaceFolder?.index === scope.workspaceFolder.index) {
          this.map.delete(key);
        }
      }
      this.clearDescription(scope);
    } else {
      this.map.clear();
      this.descriptionMap.clear();
    }
    this._onDidChangeCollection.fire();
  }
  setDescription(description, scope) {
    const key = this.getScopeKey(scope);
    const current = this.descriptionMap.get(key);
    if (!current || current.description !== description) {
      let descriptionStr;
      if (typeof description === "string") {
        descriptionStr = description;
      } else {
        descriptionStr = description?.value.split("\n\n")[0];
      }
      const value = { description: descriptionStr, scope };
      this.descriptionMap.set(key, value);
      this._onDidChangeCollection.fire();
    }
  }
  getDescription(scope) {
    const key = this.getScopeKey(scope);
    return this.descriptionMap.get(key)?.description;
  }
  clearDescription(scope) {
    const key = this.getScopeKey(scope);
    this.descriptionMap.delete(key);
  }
}
class ScopedEnvironmentVariableCollection {
  constructor(collection, scope) {
    this.collection = collection;
    this.scope = scope;
    this._onDidChangeCollection = new Emitter();
  }
  get persistent() {
    return this.collection.persistent;
  }
  set persistent(value) {
    this.collection.persistent = value;
  }
  get onDidChangeCollection() {
    return this._onDidChangeCollection && this._onDidChangeCollection.event;
  }
  getScoped(scope) {
    return this.collection.getScopedEnvironmentVariableCollection(scope);
  }
  replace(variable, value, options) {
    this.collection.replace(variable, value, options, this.scope);
  }
  append(variable, value, options) {
    this.collection.append(variable, value, options, this.scope);
  }
  prepend(variable, value, options) {
    this.collection.prepend(variable, value, options, this.scope);
  }
  get(variable) {
    return this.collection.get(variable, this.scope);
  }
  forEach(callback, thisArg) {
    this.collection.getVariableMap(this.scope).forEach((value, variable) => callback.call(thisArg, variable, value, this), this.scope);
  }
  [Symbol.iterator]() {
    return this.collection.getVariableMap(this.scope).entries();
  }
  delete(variable) {
    this.collection.delete(variable, this.scope);
    this._onDidChangeCollection.fire(void 0);
  }
  clear() {
    this.collection.clear(this.scope);
  }
  set description(description) {
    this.collection.setDescription(description, this.scope);
  }
  get description() {
    return this.collection.getDescription(this.scope);
  }
}
let WorkerExtHostTerminalService = class extends BaseExtHostTerminalService {
  constructor(extHostCommands, extHostRpc, initData) {
    super(false, extHostCommands, extHostRpc);
    this._hasRemoteAuthority = !!initData.remote.authority;
  }
  createTerminal(name, shellPath, shellArgs) {
    if (!this._hasRemoteAuthority) {
      throw new NotSupportedError();
    }
    return this.createTerminalFromOptions({ name, shellPath, shellArgs });
  }
  createTerminalFromOptions(options, internalOptions) {
    if (!this._hasRemoteAuthority) {
      throw new NotSupportedError();
    }
    const terminal = new ExtHostTerminal(this._proxy, generateUuid(), options, options.name);
    this._terminals.push(terminal);
    terminal.create(options, this._serializeParentTerminal(options, internalOptions));
    return terminal.value;
  }
};
WorkerExtHostTerminalService = __decorateClass([
  __decorateParam(0, IExtHostCommands),
  __decorateParam(1, IExtHostRpcService),
  __decorateParam(2, IExtHostInitDataService)
], WorkerExtHostTerminalService);
function asTerminalIcon(iconPath) {
  if (!iconPath || typeof iconPath === "string") {
    return void 0;
  }
  if (!hasKey(iconPath, { id: true })) {
    return iconPath;
  }
  return {
    id: iconPath.id,
    color: iconPath.color
  };
}
function asTerminalColor(color) {
  return ThemeColor.isThemeColor(color) ? color : void 0;
}
function convertMutator(mutator) {
  const newMutator = { ...mutator };
  delete newMutator.scope;
  newMutator.options = newMutator.options ?? void 0;
  return newMutator;
}
export {
  BaseExtHostTerminalService,
  ExtHostTerminal,
  IExtHostTerminalService,
  WorkerExtHostTerminalService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUZXJtaW5hbFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0VGVybWluYWxTZXJ2aWNlU2hhcGUsIE1haW5Db250ZXh0LCBNYWluVGhyZWFkVGVybWluYWxTZXJ2aWNlU2hhcGUsIElUZXJtaW5hbERpbWVuc2lvbnNEdG8sIElUZXJtaW5hbExpbmtEdG8sIEV4dEhvc3RUZXJtaW5hbElkZW50aWZpZXIsIElDb21tYW5kRHRvLCBJVGVybWluYWxRdWlja0ZpeE9wZW5lckR0bywgSVRlcm1pbmFsUXVpY2tGaXhUZXJtaW5hbENvbW1hbmREdG8sIFRlcm1pbmFsQ29tbWFuZE1hdGNoUmVzdWx0RHRvLCBJVGVybWluYWxDb21tYW5kRHRvLCBJVGVybWluYWxDb21wbGV0aW9uQ29udGV4dER0bywgVGVybWluYWxDb21wbGV0aW9uTGlzdER0byB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgYXMgVlNDb2RlRGlzcG9zYWJsZSwgRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLCBUZXJtaW5hbEV4aXRSZWFzb24sIFRlcm1pbmFsQ29tcGxldGlvbkl0ZW0gfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE5vdFN1cHBvcnRlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IHNlcmlhbGl6ZUVudmlyb25tZW50RGVzY3JpcHRpb25NYXAsIHNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGVTaGFyZWQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25EZXNjcmlwdGlvbiwgSUVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yLCBJU2VyaWFsaXphYmxlRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZS5qcyc7XG5pbXBvcnQgeyBJQ3JlYXRlQ29udHJpYnV0ZWRUZXJtaW5hbFByb2ZpbGVPcHRpb25zLCBJUHJvY2Vzc1JlYWR5RXZlbnQsIElTaGVsbExhdW5jaENvbmZpZ0R0bywgSVRlcm1pbmFsQ2hpbGRQcm9jZXNzLCBJVGVybWluYWxMYXVuY2hFcnJvciwgSVRlcm1pbmFsUHJvZmlsZSwgVGVybWluYWxJY29uLCBUZXJtaW5hbExvY2F0aW9uLCBJUHJvY2Vzc1Byb3BlcnR5LCBQcm9jZXNzUHJvcGVydHlUeXBlLCBJUHJvY2Vzc1Byb3BlcnR5TWFwLCBUZXJtaW5hbFNoZWxsVHlwZSwgV2luZG93c1NoZWxsVHlwZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbERhdGFCdWZmZXJlciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbERhdGFCdWZmZXJpbmcuanMnO1xuaW1wb3J0IHsgVGhlbWVDb2xvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVkaXRvckdyb3VwQ29sdW1uIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cENvbHVtbi5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbXBsZXRpb25MaXN0LCBUZXJtaW5hbFF1aWNrRml4LCBWaWV3Q29sdW1uIH0gZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb21tYW5kcyB9IGZyb20gJy4vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0SW5pdERhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IElTZXJpYWxpemVkVGVybWluYWxJbnN0YW5jZUNvbnRleHQgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRIb3N0VGVybWluYWxTZXJ2aWNlIGV4dGVuZHMgRXh0SG9zdFRlcm1pbmFsU2VydmljZVNoYXBlLCBJRGlzcG9zYWJsZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGFjdGl2ZVRlcm1pbmFsOiB2c2NvZGUuVGVybWluYWwgfCB1bmRlZmluZWQ7XG5cdHRlcm1pbmFsczogdnNjb2RlLlRlcm1pbmFsW107XG5cblx0cmVhZG9ubHkgb25EaWRDbG9zZVRlcm1pbmFsOiBFdmVudDx2c2NvZGUuVGVybWluYWw+O1xuXHRyZWFkb25seSBvbkRpZE9wZW5UZXJtaW5hbDogRXZlbnQ8dnNjb2RlLlRlcm1pbmFsPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVUZXJtaW5hbDogRXZlbnQ8dnNjb2RlLlRlcm1pbmFsIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUZXJtaW5hbERpbWVuc2lvbnM6IEV2ZW50PHZzY29kZS5UZXJtaW5hbERpbWVuc2lvbnNDaGFuZ2VFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVGVybWluYWxTdGF0ZTogRXZlbnQ8dnNjb2RlLlRlcm1pbmFsPjtcblx0cmVhZG9ubHkgb25EaWRXcml0ZVRlcm1pbmFsRGF0YTogRXZlbnQ8dnNjb2RlLlRlcm1pbmFsRGF0YVdyaXRlRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZEV4ZWN1dGVUZXJtaW5hbENvbW1hbmQ6IEV2ZW50PHZzY29kZS5UZXJtaW5hbEV4ZWN1dGVkQ29tbWFuZD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2hlbGw6IEV2ZW50PHN0cmluZz47XG5cblx0Y3JlYXRlVGVybWluYWwobmFtZT86IHN0cmluZywgc2hlbGxQYXRoPzogc3RyaW5nLCBzaGVsbEFyZ3M/OiByZWFkb25seSBzdHJpbmdbXSB8IHN0cmluZyk6IHZzY29kZS5UZXJtaW5hbDtcblx0Y3JlYXRlVGVybWluYWxGcm9tT3B0aW9ucyhvcHRpb25zOiB2c2NvZGUuVGVybWluYWxPcHRpb25zLCBpbnRlcm5hbE9wdGlvbnM/OiBJVGVybWluYWxJbnRlcm5hbE9wdGlvbnMpOiB2c2NvZGUuVGVybWluYWw7XG5cdGNyZWF0ZUV4dGVuc2lvblRlcm1pbmFsKG9wdGlvbnM6IHZzY29kZS5FeHRlbnNpb25UZXJtaW5hbE9wdGlvbnMpOiB2c2NvZGUuVGVybWluYWw7XG5cdGF0dGFjaFB0eVRvVGVybWluYWwoaWQ6IG51bWJlciwgcHR5OiB2c2NvZGUuUHNldWRvdGVybWluYWwpOiB2b2lkO1xuXHRnZXREZWZhdWx0U2hlbGwodXNlQXV0b21hdGlvblNoZWxsOiBib29sZWFuKTogc3RyaW5nO1xuXHRnZXREZWZhdWx0U2hlbGxBcmdzKHVzZUF1dG9tYXRpb25TaGVsbDogYm9vbGVhbik6IHN0cmluZ1tdIHwgc3RyaW5nO1xuXHRyZWdpc3RlckxpbmtQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLlRlcm1pbmFsTGlua1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGU7XG5cdHJlZ2lzdGVyUHJvZmlsZVByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpZDogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLlRlcm1pbmFsUHJvZmlsZVByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGU7XG5cdHJlZ2lzdGVyVGVybWluYWxRdWlja0ZpeFByb3ZpZGVyKGlkOiBzdHJpbmcsIGV4dGVuc2lvbklkOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuVGVybWluYWxRdWlja0ZpeFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGU7XG5cdGdldEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogSUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uO1xuXHRnZXRUZXJtaW5hbEJ5SWQoaWQ6IG51bWJlcik6IEV4dEhvc3RUZXJtaW5hbCB8IG51bGw7XG5cdGdldFRlcm1pbmFsSWRCeUFwaU9iamVjdChhcGlUZXJtaW5hbDogdnNjb2RlLlRlcm1pbmFsKTogbnVtYmVyIHwgbnVsbDtcblx0cmVnaXN0ZXJUZXJtaW5hbENvbXBsZXRpb25Qcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgcHJvdmlkZXI6IHZzY29kZS5UZXJtaW5hbENvbXBsZXRpb25Qcm92aWRlcjx2c2NvZGUuVGVybWluYWxDb21wbGV0aW9uSXRlbT4sIC4uLnRyaWdnZXJDaGFyYWN0ZXJzOiBzdHJpbmdbXSk6IHZzY29kZS5EaXNwb3NhYmxlO1xufVxuXG5pbnRlcmZhY2UgSUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIGV4dGVuZHMgdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIHtcblx0Z2V0U2NvcGVkKHNjb3BlOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZVNjb3BlKTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXJtaW5hbEludGVybmFsT3B0aW9ucyB7XG5cdGN3ZD86IHN0cmluZyB8IFVSSTtcblx0aXNGZWF0dXJlVGVybWluYWw/OiBib29sZWFuO1xuXHRmb3JjZVNoZWxsSW50ZWdyYXRpb24/OiBib29sZWFuO1xuXHR1c2VTaGVsbEVudmlyb25tZW50PzogYm9vbGVhbjtcblx0cmVzb2x2ZWRFeHRIb3N0SWRlbnRpZmllcj86IEV4dEhvc3RUZXJtaW5hbElkZW50aWZpZXI7XG5cdC8qKlxuXHQgKiBUaGlzIGxvY2F0aW9uIGlzIGRpZmZlcmVudCBmcm9tIHRoZSBBUEkgbG9jYXRpb24gYmVjYXVzZSBpdCBjYW4gaW5jbHVkZSBzcGxpdEFjdGl2ZVRlcm1pbmFsLFxuXHQgKiBhIHByb3BlcnR5IHdlIHJlc29sdmUgaW50ZXJuYWxseVxuXHQgKi9cblx0bG9jYXRpb24/OiBUZXJtaW5hbExvY2F0aW9uIHwgeyB2aWV3Q29sdW1uOiBudW1iZXI7IHByZXNlcnZlU3RhdGU/OiBib29sZWFuIH0gfCB7IHNwbGl0QWN0aXZlVGVybWluYWw6IGJvb2xlYW4gfTtcbn1cblxuZXhwb3J0IGNvbnN0IElFeHRIb3N0VGVybWluYWxTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElFeHRIb3N0VGVybWluYWxTZXJ2aWNlPignSUV4dEhvc3RUZXJtaW5hbFNlcnZpY2UnKTtcblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RUZXJtaW5hbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9kaXNwb3NlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9waWRQcm9taXNlOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgX2NvbHM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcGlkUHJvbWlzZUNvbXBsZXRlOiAoKHZhbHVlOiBudW1iZXIgfCB1bmRlZmluZWQpID0+IHVua25vd24pIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yb3dzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2V4aXRTdGF0dXM6IHZzY29kZS5UZXJtaW5hbEV4aXRTdGF0dXMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3N0YXRlOiB2c2NvZGUuVGVybWluYWxTdGF0ZSA9IHsgaXNJbnRlcmFjdGVkV2l0aDogZmFsc2UsIHNoZWxsOiB1bmRlZmluZWQgfTtcblx0cHJpdmF0ZSBfc2VsZWN0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0c2hlbGxJbnRlZ3JhdGlvbjogdnNjb2RlLlRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgaXNPcGVuOiBib29sZWFuID0gZmFsc2U7XG5cblx0cmVhZG9ubHkgdmFsdWU6IHZzY29kZS5UZXJtaW5hbDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uV2lsbERpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25XaWxsRGlzcG9zZSA9IHRoaXMuX29uV2lsbERpc3Bvc2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfcHJveHk6IE1haW5UaHJlYWRUZXJtaW5hbFNlcnZpY2VTaGFwZSxcblx0XHRwdWJsaWMgX2lkOiBFeHRIb3N0VGVybWluYWxJZGVudGlmaWVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NyZWF0aW9uT3B0aW9uczogdnNjb2RlLlRlcm1pbmFsT3B0aW9ucyB8IHZzY29kZS5FeHRlbnNpb25UZXJtaW5hbE9wdGlvbnMsXG5cdFx0cHJpdmF0ZSBfbmFtZT86IHN0cmluZyxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2NyZWF0aW9uT3B0aW9ucyA9IE9iamVjdC5mcmVlemUodGhpcy5fY3JlYXRpb25PcHRpb25zKTtcblx0XHR0aGlzLl9waWRQcm9taXNlID0gbmV3IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPihjID0+IHRoaXMuX3BpZFByb21pc2VDb21wbGV0ZSA9IGMpO1xuXG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy52YWx1ZSA9IHtcblx0XHRcdGdldCBuYW1lKCk6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9uYW1lIHx8ICcnO1xuXHRcdFx0fSxcblx0XHRcdGdldCBwcm9jZXNzSWQoKTogUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX3BpZFByb21pc2U7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGNyZWF0aW9uT3B0aW9ucygpOiBSZWFkb25seTx2c2NvZGUuVGVybWluYWxPcHRpb25zIHwgdnNjb2RlLkV4dGVuc2lvblRlcm1pbmFsT3B0aW9ucz4ge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fY3JlYXRpb25PcHRpb25zO1xuXHRcdFx0fSxcblx0XHRcdGdldCBleGl0U3RhdHVzKCk6IHZzY29kZS5UZXJtaW5hbEV4aXRTdGF0dXMgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fZXhpdFN0YXR1cztcblx0XHRcdH0sXG5cdFx0XHRnZXQgc3RhdGUoKTogdnNjb2RlLlRlcm1pbmFsU3RhdGUge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fc3RhdGU7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHNlbGVjdGlvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fc2VsZWN0aW9uO1xuXHRcdFx0fSxcblx0XHRcdGdldCBzaGVsbEludGVncmF0aW9uKCk6IHZzY29kZS5UZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5zaGVsbEludGVncmF0aW9uO1xuXHRcdFx0fSxcblx0XHRcdHNlbmRUZXh0KHRleHQ6IHN0cmluZywgc2hvdWxkRXhlY3V0ZTogYm9vbGVhbiA9IHRydWUpOiB2b2lkIHtcblx0XHRcdFx0dGhhdC5fY2hlY2tEaXNwb3NlZCgpO1xuXHRcdFx0XHR0aGF0Ll9wcm94eS4kc2VuZFRleHQodGhhdC5faWQsIHRleHQsIHNob3VsZEV4ZWN1dGUpO1xuXHRcdFx0fSxcblx0XHRcdHNob3cocHJlc2VydmVGb2N1czogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0XHR0aGF0Ll9jaGVja0Rpc3Bvc2VkKCk7XG5cdFx0XHRcdHRoYXQuX3Byb3h5LiRzaG93KHRoYXQuX2lkLCBwcmVzZXJ2ZUZvY3VzKTtcblx0XHRcdH0sXG5cdFx0XHRoaWRlKCk6IHZvaWQge1xuXHRcdFx0XHR0aGF0Ll9jaGVja0Rpc3Bvc2VkKCk7XG5cdFx0XHRcdHRoYXQuX3Byb3h5LiRoaWRlKHRoYXQuX2lkKTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdFx0XHRpZiAoIXRoYXQuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0dGhhdC5fZGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHRoYXQuX3Byb3h5LiRkaXNwb3NlKHRoYXQuX2lkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGdldCBkaW1lbnNpb25zKCk6IHZzY29kZS5UZXJtaW5hbERpbWVuc2lvbnMgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRpZiAodGhhdC5fY29scyA9PT0gdW5kZWZpbmVkIHx8IHRoYXQuX3Jvd3MgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjb2x1bW5zOiB0aGF0Ll9jb2xzLFxuXHRcdFx0XHRcdHJvd3M6IHRoYXQuX3Jvd3Ncblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmZpcmUoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgY3JlYXRlKFxuXHRcdG9wdGlvbnM6IHZzY29kZS5UZXJtaW5hbE9wdGlvbnMsXG5cdFx0aW50ZXJuYWxPcHRpb25zPzogSVRlcm1pbmFsSW50ZXJuYWxPcHRpb25zLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodHlwZW9mIHRoaXMuX2lkICE9PSAnc3RyaW5nJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUZXJtaW5hbCBoYXMgYWxyZWFkeSBiZWVuIGNyZWF0ZWQnKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fcHJveHkuJGNyZWF0ZVRlcm1pbmFsKHRoaXMuX2lkLCB7XG5cdFx0XHRuYW1lOiBvcHRpb25zLm5hbWUsXG5cdFx0XHRzaGVsbFBhdGg6IG9wdGlvbnMuc2hlbGxQYXRoID8/IHVuZGVmaW5lZCxcblx0XHRcdHNoZWxsQXJnczogb3B0aW9ucy5zaGVsbEFyZ3MgPz8gdW5kZWZpbmVkLFxuXHRcdFx0Y3dkOiBvcHRpb25zLmN3ZCA/PyBpbnRlcm5hbE9wdGlvbnM/LmN3ZCA/PyB1bmRlZmluZWQsXG5cdFx0XHRlbnY6IG9wdGlvbnMuZW52ID8/IHVuZGVmaW5lZCxcblx0XHRcdGljb246IGFzVGVybWluYWxJY29uKG9wdGlvbnMuaWNvblBhdGgpID8/IHVuZGVmaW5lZCxcblx0XHRcdGNvbG9yOiBUaGVtZUNvbG9yLmlzVGhlbWVDb2xvcihvcHRpb25zLmNvbG9yKSA/IG9wdGlvbnMuY29sb3IuaWQgOiB1bmRlZmluZWQsXG5cdFx0XHRpbml0aWFsVGV4dDogb3B0aW9ucy5tZXNzYWdlID8/IHVuZGVmaW5lZCxcblx0XHRcdHN0cmljdEVudjogb3B0aW9ucy5zdHJpY3RFbnYgPz8gdW5kZWZpbmVkLFxuXHRcdFx0aGlkZUZyb21Vc2VyOiBvcHRpb25zLmhpZGVGcm9tVXNlciA/PyB1bmRlZmluZWQsXG5cdFx0XHRmb3JjZVNoZWxsSW50ZWdyYXRpb246IGludGVybmFsT3B0aW9ucz8uZm9yY2VTaGVsbEludGVncmF0aW9uID8/IHVuZGVmaW5lZCxcblx0XHRcdGlzRmVhdHVyZVRlcm1pbmFsOiBpbnRlcm5hbE9wdGlvbnM/LmlzRmVhdHVyZVRlcm1pbmFsID8/IHVuZGVmaW5lZCxcblx0XHRcdGlzRXh0ZW5zaW9uT3duZWRUZXJtaW5hbDogdHJ1ZSxcblx0XHRcdHVzZVNoZWxsRW52aXJvbm1lbnQ6IGludGVybmFsT3B0aW9ucz8udXNlU2hlbGxFbnZpcm9ubWVudCA/PyB1bmRlZmluZWQsXG5cdFx0XHRsb2NhdGlvbjogaW50ZXJuYWxPcHRpb25zPy5sb2NhdGlvbiB8fCB0aGlzLl9zZXJpYWxpemVQYXJlbnRUZXJtaW5hbChvcHRpb25zLmxvY2F0aW9uLCBpbnRlcm5hbE9wdGlvbnM/LnJlc29sdmVkRXh0SG9zdElkZW50aWZpZXIpLFxuXHRcdFx0aXNUcmFuc2llbnQ6IG9wdGlvbnMuaXNUcmFuc2llbnQgPz8gdW5kZWZpbmVkLFxuXHRcdFx0c2hlbGxJbnRlZ3JhdGlvbk5vbmNlOiBvcHRpb25zLnNoZWxsSW50ZWdyYXRpb25Ob25jZSA/PyB1bmRlZmluZWQsXG5cdFx0XHR0aXRsZVRlbXBsYXRlOiBvcHRpb25zLnRpdGxlVGVtcGxhdGUgPz8gdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9XG5cblxuXHRwdWJsaWMgYXN5bmMgY3JlYXRlRXh0ZW5zaW9uVGVybWluYWwobG9jYXRpb24/OiBUZXJtaW5hbExvY2F0aW9uIHwgdnNjb2RlLlRlcm1pbmFsRWRpdG9yTG9jYXRpb25PcHRpb25zIHwgdnNjb2RlLlRlcm1pbmFsU3BsaXRMb2NhdGlvbk9wdGlvbnMsIGludGVybmFsT3B0aW9ucz86IElUZXJtaW5hbEludGVybmFsT3B0aW9ucywgcGFyZW50VGVybWluYWw/OiBFeHRIb3N0VGVybWluYWxJZGVudGlmaWVyLCBpY29uUGF0aD86IFRlcm1pbmFsSWNvbiwgY29sb3I/OiBUaGVtZUNvbG9yLCBzaGVsbEludGVncmF0aW9uTm9uY2U/OiBzdHJpbmcsIHRpdGxlVGVtcGxhdGU/OiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5faWQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Rlcm1pbmFsIGhhcyBhbHJlYWR5IGJlZW4gY3JlYXRlZCcpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9wcm94eS4kY3JlYXRlVGVybWluYWwodGhpcy5faWQsIHtcblx0XHRcdG5hbWU6IHRoaXMuX25hbWUsXG5cdFx0XHRpc0V4dGVuc2lvbkN1c3RvbVB0eVRlcm1pbmFsOiB0cnVlLFxuXHRcdFx0aWNvbjogaWNvblBhdGgsXG5cdFx0XHRjb2xvcjogVGhlbWVDb2xvci5pc1RoZW1lQ29sb3IoY29sb3IpID8gY29sb3IuaWQgOiB1bmRlZmluZWQsXG5cdFx0XHRsb2NhdGlvbjogaW50ZXJuYWxPcHRpb25zPy5sb2NhdGlvbiB8fCB0aGlzLl9zZXJpYWxpemVQYXJlbnRUZXJtaW5hbChsb2NhdGlvbiwgcGFyZW50VGVybWluYWwpLFxuXHRcdFx0aXNUcmFuc2llbnQ6IHRydWUsXG5cdFx0XHRzaGVsbEludGVncmF0aW9uTm9uY2U6IHNoZWxsSW50ZWdyYXRpb25Ob25jZSA/PyB1bmRlZmluZWQsXG5cdFx0XHR0aXRsZVRlbXBsYXRlOiB0aXRsZVRlbXBsYXRlID8/IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHQvLyBBdCB0aGlzIHBvaW50LCB0aGUgaWQgaGFzIGJlZW4gc2V0IHZpYSBgJGFjY2VwdFRlcm1pbmFsT3BlbmVkYFxuXHRcdGlmICh0eXBlb2YgdGhpcy5faWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Rlcm1pbmFsIGNyZWF0aW9uIGZhaWxlZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faWQ7XG5cdH1cblxuXHRwcml2YXRlIF9zZXJpYWxpemVQYXJlbnRUZXJtaW5hbChsb2NhdGlvbj86IFRlcm1pbmFsTG9jYXRpb24gfCB2c2NvZGUuVGVybWluYWxFZGl0b3JMb2NhdGlvbk9wdGlvbnMgfCB2c2NvZGUuVGVybWluYWxTcGxpdExvY2F0aW9uT3B0aW9ucywgcGFyZW50VGVybWluYWw/OiBFeHRIb3N0VGVybWluYWxJZGVudGlmaWVyKTogVGVybWluYWxMb2NhdGlvbiB8IHsgdmlld0NvbHVtbjogRWRpdG9yR3JvdXBDb2x1bW47IHByZXNlcnZlRm9jdXM/OiBib29sZWFuIH0gfCB7IHBhcmVudFRlcm1pbmFsOiBFeHRIb3N0VGVybWluYWxJZGVudGlmaWVyIH0gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2YgbG9jYXRpb24gPT09ICdvYmplY3QnKSB7XG5cdFx0XHRpZiAoaGFzS2V5KGxvY2F0aW9uLCB7IHBhcmVudFRlcm1pbmFsOiB0cnVlIH0pICYmIGxvY2F0aW9uLnBhcmVudFRlcm1pbmFsICYmIHBhcmVudFRlcm1pbmFsKSB7XG5cdFx0XHRcdHJldHVybiB7IHBhcmVudFRlcm1pbmFsIH07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChoYXNLZXkobG9jYXRpb24sIHsgdmlld0NvbHVtbjogdHJ1ZSB9KSkge1xuXHRcdFx0XHRyZXR1cm4geyB2aWV3Q29sdW1uOiBWaWV3Q29sdW1uLmZyb20obG9jYXRpb24udmlld0NvbHVtbiksIHByZXNlcnZlRm9jdXM6IGxvY2F0aW9uLnByZXNlcnZlRm9jdXMgfTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbG9jYXRpb247XG5cdH1cblxuXHRwcml2YXRlIF9jaGVja0Rpc3Bvc2VkKCkge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUZXJtaW5hbCBoYXMgYWxyZWFkeSBiZWVuIGRpc3Bvc2VkJyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldCBuYW1lKG5hbWU6IHN0cmluZykge1xuXHRcdHRoaXMuX25hbWUgPSBuYW1lO1xuXHR9XG5cblx0cHVibGljIHNldEV4aXRTdGF0dXMoY29kZTogbnVtYmVyIHwgdW5kZWZpbmVkLCByZWFzb246IFRlcm1pbmFsRXhpdFJlYXNvbikge1xuXHRcdHRoaXMuX2V4aXRTdGF0dXMgPSBPYmplY3QuZnJlZXplKHsgY29kZSwgcmVhc29uIH0pO1xuXHR9XG5cblx0cHVibGljIHNldERpbWVuc2lvbnMoY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAoY29scyA9PT0gdGhpcy5fY29scyAmJiByb3dzID09PSB0aGlzLl9yb3dzKSB7XG5cdFx0XHQvLyBOb3RoaW5nIGNoYW5nZWRcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGNvbHMgPT09IDAgfHwgcm93cyA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9jb2xzID0gY29scztcblx0XHR0aGlzLl9yb3dzID0gcm93cztcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBzZXRJbnRlcmFjdGVkV2l0aCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3N0YXRlLmlzSW50ZXJhY3RlZFdpdGgpIHtcblx0XHRcdHRoaXMuX3N0YXRlID0ge1xuXHRcdFx0XHQuLi50aGlzLl9zdGF0ZSxcblx0XHRcdFx0aXNJbnRlcmFjdGVkV2l0aDogdHJ1ZVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2hlbGxUeXBlKHNoZWxsVHlwZTogVGVybWluYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblxuXHRcdGlmICh0aGlzLl9zdGF0ZS5zaGVsbCAhPT0gc2hlbGxUeXBlKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IHtcblx0XHRcdFx0Li4udGhpcy5fc3RhdGUsXG5cdFx0XHRcdHNoZWxsOiBzaGVsbFR5cGVcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHNldFNlbGVjdGlvbihzZWxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGlvbiA9IHNlbGVjdGlvbjtcblx0fVxuXG5cdHB1YmxpYyBfc2V0UHJvY2Vzc0lkKHByb2Nlc3NJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Ly8gVGhlIGV2ZW50IG1heSBmaXJlIDIgdGltZXMgd2hlbiB0aGUgcGFuZWwgaXMgcmVzdG9yZWRcblx0XHRpZiAodGhpcy5fcGlkUHJvbWlzZUNvbXBsZXRlKSB7XG5cdFx0XHR0aGlzLl9waWRQcm9taXNlQ29tcGxldGUocHJvY2Vzc0lkKTtcblx0XHRcdHRoaXMuX3BpZFByb21pc2VDb21wbGV0ZSA9IHVuZGVmaW5lZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gUmVjcmVhdGUgdGhlIHByb21pc2UgaWYgdGhpcyBpcyB0aGUgbnRoIHByb2Nlc3NJZCBzZXQgKGUuZy4gcmV1c2VkIHRhc2sgdGVybWluYWxzKVxuXHRcdFx0dGhpcy5fcGlkUHJvbWlzZS50aGVuKHBpZCA9PiB7XG5cdFx0XHRcdGlmIChwaWQgIT09IHByb2Nlc3NJZCkge1xuXHRcdFx0XHRcdHRoaXMuX3BpZFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUocHJvY2Vzc0lkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEV4dEhvc3RQc2V1ZG90ZXJtaW5hbCBpbXBsZW1lbnRzIElUZXJtaW5hbENoaWxkUHJvY2VzcyB7XG5cdHJlYWRvbmx5IGlkID0gMDtcblx0cmVhZG9ubHkgc2hvdWxkUGVyc2lzdCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc0RhdGEgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdHB1YmxpYyByZWFkb25seSBvblByb2Nlc3NEYXRhOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25Qcm9jZXNzRGF0YS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzUmVhZHkgPSBuZXcgRW1pdHRlcjxJUHJvY2Vzc1JlYWR5RXZlbnQ+KCk7XG5cdHB1YmxpYyBnZXQgb25Qcm9jZXNzUmVhZHkoKTogRXZlbnQ8SVByb2Nlc3NSZWFkeUV2ZW50PiB7IHJldHVybiB0aGlzLl9vblByb2Nlc3NSZWFkeS5ldmVudDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVByb3BlcnR5ID0gbmV3IEVtaXR0ZXI8SVByb2Nlc3NQcm9wZXJ0eT4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvcGVydHkgPSB0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NFeGl0ID0gbmV3IEVtaXR0ZXI8bnVtYmVyIHwgdW5kZWZpbmVkPigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Qcm9jZXNzRXhpdDogRXZlbnQ8bnVtYmVyIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uUHJvY2Vzc0V4aXQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfcHR5OiB2c2NvZGUuUHNldWRvdGVybWluYWwpIHsgfVxuXG5cdHJlZnJlc2hQcm9wZXJ0eTxUIGV4dGVuZHMgUHJvY2Vzc1Byb3BlcnR5VHlwZT4ocHJvcGVydHk6IFByb2Nlc3NQcm9wZXJ0eVR5cGUpOiBQcm9taXNlPElQcm9jZXNzUHJvcGVydHlNYXBbVF0+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYHJlZnJlc2hQcm9wZXJ0eSBpcyBub3Qgc3VwcHBvcnRlZCBpbiBleHRlbnNpb24gb3duZWQgdGVybWluYWxzLiBwcm9wZXJ0eTogJHtwcm9wZXJ0eX1gKTtcblx0fVxuXG5cdHVwZGF0ZVByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPihwcm9wZXJ0eTogUHJvY2Vzc1Byb3BlcnR5VHlwZSwgdmFsdWU6IElQcm9jZXNzUHJvcGVydHlNYXBbVF0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYHVwZGF0ZVByb3BlcnR5IGlzIG5vdCBzdXBwcG9ydGVkIGluIGV4dGVuc2lvbiBvd25lZCB0ZXJtaW5hbHMuIHByb3BlcnR5OiAke3Byb3BlcnR5fSwgdmFsdWU6ICR7dmFsdWV9YCk7XG5cdH1cblxuXHRhc3luYyBzdGFydCgpOiBQcm9taXNlPHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRzaHV0ZG93bigpOiB2b2lkIHtcblx0XHR0aGlzLl9wdHkuY2xvc2UoKTtcblx0fVxuXG5cdGlucHV0KGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3B0eS5oYW5kbGVJbnB1dD8uKGRhdGEpO1xuXHR9XG5cblx0c2VuZFNpZ25hbChzaWduYWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdC8vIEV4dGVuc2lvbiBvd25lZCB0ZXJtaW5hbHMgZG9uJ3Qgc3VwcG9ydCBzZW5kaW5nIHNpZ25hbHMgZGlyZWN0bHkgdG8gcHJvY2Vzc2VzXG5cdFx0Ly8gVGhpcyBjb3VsZCBiZSBleHRlbmRlZCBpbiB0aGUgZnV0dXJlIGlmIHRoZSBwc2V1ZG90ZXJtaW5hbCBBUEkgaXMgZW5oYW5jZWRcblx0fVxuXG5cdHJlc2l6ZShjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3B0eS5zZXREaW1lbnNpb25zPy4oeyBjb2x1bW5zOiBjb2xzLCByb3dzIH0pO1xuXHR9XG5cblx0Y2xlYXJCdWZmZXIoKTogdm9pZCB7XG5cdFx0Ly8gbm8tb3Bcblx0fVxuXG5cdGFzeW5jIHByb2Nlc3NCaW5hcnkoZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gTm8tb3AsIHByb2Nlc3NCaW5hcnkgaXMgbm90IHN1cHBvcnRlZCBpbiBleHRlbnNpb24gb3duZWQgdGVybWluYWxzLlxuXHR9XG5cblx0YWNrbm93bGVkZ2VEYXRhRXZlbnQoY2hhckNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBOby1vcCwgZmxvdyBjb250cm9sIGlzIG5vdCBzdXBwb3J0ZWQgaW4gZXh0ZW5zaW9uIG93bmVkIHRlcm1pbmFscy4gSWYgdGhpcyBpcyBldmVyXG5cdFx0Ly8gaW1wbGVtZW50ZWQgaXQgd2lsbCBuZWVkIG5ldyBwYXVzZSBhbmQgcmVzdW1lIFZTIENvZGUgQVBJcy5cblx0fVxuXG5cdGFzeW5jIHNldFVuaWNvZGVWZXJzaW9uKHZlcnNpb246ICc2JyB8ICcxMScpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBOby1vcCwgeHRlcm0taGVhZGxlc3MgaXNuJ3QgdXNlZCBmb3IgZXh0ZW5zaW9uIG93bmVkIHRlcm1pbmFscy5cblx0fVxuXG5cdGdldEluaXRpYWxDd2QoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCcnKTtcblx0fVxuXG5cdGdldEN3ZCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoJycpO1xuXHR9XG5cblx0c3RhcnRTZW5kaW5nRXZlbnRzKGluaXRpYWxEaW1lbnNpb25zOiBJVGVybWluYWxEaW1lbnNpb25zRHRvIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Ly8gQXR0YWNoIHRoZSBsaXN0ZW5lcnNcblx0XHR0aGlzLl9wdHkub25EaWRXcml0ZShlID0+IHRoaXMuX29uUHJvY2Vzc0RhdGEuZmlyZShlKSk7XG5cdFx0dGhpcy5fcHR5Lm9uRGlkQ2xvc2U/LigoZTogbnVtYmVyIHwgdm9pZCA9IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0dGhpcy5fb25Qcm9jZXNzRXhpdC5maXJlKGUgPT09IHZvaWQgMCA/IHVuZGVmaW5lZCA6IGUpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3B0eS5vbkRpZE92ZXJyaWRlRGltZW5zaW9ucz8uKGUgPT4ge1xuXHRcdFx0aWYgKGUpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5PdmVycmlkZURpbWVuc2lvbnMsIHZhbHVlOiB7IGNvbHM6IGUuY29sdW1ucywgcm93czogZS5yb3dzIH0gfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fcHR5Lm9uRGlkQ2hhbmdlTmFtZT8uKHRpdGxlID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuVGl0bGUsIHZhbHVlOiB0aXRsZSB9KTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3B0eS5vcGVuKGluaXRpYWxEaW1lbnNpb25zID8gaW5pdGlhbERpbWVuc2lvbnMgOiB1bmRlZmluZWQpO1xuXG5cdFx0aWYgKGluaXRpYWxEaW1lbnNpb25zKSB7XG5cdFx0XHR0aGlzLl9wdHkuc2V0RGltZW5zaW9ucz8uKGluaXRpYWxEaW1lbnNpb25zKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vblByb2Nlc3NSZWFkeS5maXJlKHsgcGlkOiAtMSwgY3dkOiAnJywgd2luZG93c1B0eTogdW5kZWZpbmVkIH0pO1xuXHR9XG59XG5cbmxldCBuZXh0TGlua0lkID0gMTtcblxuaW50ZXJmYWNlIElDYWNoZWRMaW5rRW50cnkge1xuXHRwcm92aWRlcjogdnNjb2RlLlRlcm1pbmFsTGlua1Byb3ZpZGVyO1xuXHRsaW5rOiB2c2NvZGUuVGVybWluYWxMaW5rO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQmFzZUV4dEhvc3RUZXJtaW5hbFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dEhvc3RUZXJtaW5hbFNlcnZpY2UsIEV4dEhvc3RUZXJtaW5hbFNlcnZpY2VTaGFwZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCBfcHJveHk6IE1haW5UaHJlYWRUZXJtaW5hbFNlcnZpY2VTaGFwZTtcblx0cHJvdGVjdGVkIF9hY3RpdmVUZXJtaW5hbDogRXh0SG9zdFRlcm1pbmFsIHwgdW5kZWZpbmVkO1xuXHRwcm90ZWN0ZWQgX3Rlcm1pbmFsczogRXh0SG9zdFRlcm1pbmFsW10gPSBbXTtcblx0cHJvdGVjdGVkIF90ZXJtaW5hbFByb2Nlc3NlczogTWFwPG51bWJlciwgSVRlcm1pbmFsQ2hpbGRQcm9jZXNzPiA9IG5ldyBNYXAoKTtcblx0cHJvdGVjdGVkIF90ZXJtaW5hbFByb2Nlc3NEaXNwb3NhYmxlczogeyBbaWQ6IG51bWJlcl06IElEaXNwb3NhYmxlIH0gPSB7fTtcblx0cHJvdGVjdGVkIF9leHRlbnNpb25UZXJtaW5hbEF3YWl0aW5nU3RhcnQ6IHsgW2lkOiBudW1iZXJdOiB7IGluaXRpYWxEaW1lbnNpb25zOiBJVGVybWluYWxEaW1lbnNpb25zRHRvIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQgfSA9IHt9O1xuXHRwcm90ZWN0ZWQgX2dldFRlcm1pbmFsUHJvbWlzZXM6IHsgW2lkOiBudW1iZXJdOiBQcm9taXNlPEV4dEhvc3RUZXJtaW5hbCB8IHVuZGVmaW5lZD4gfSA9IHt9O1xuXHRwcm90ZWN0ZWQgX2Vudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uczogTWFwPHN0cmluZywgVW5pZmllZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uPiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSBfZGVmYXVsdFByb2ZpbGU6IElUZXJtaW5hbFByb2ZpbGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RlZmF1bHRBdXRvbWF0aW9uUHJvZmlsZTogSVRlcm1pbmFsUHJvZmlsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGFzdFF1aWNrRml4Q29tbWFuZHM6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9idWZmZXJlcjogVGVybWluYWxEYXRhQnVmZmVyZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmtQcm92aWRlcnM6IFNldDx2c2NvZGUuVGVybWluYWxMaW5rUHJvdmlkZXI+ID0gbmV3IFNldCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21wbGV0aW9uUHJvdmlkZXJzOiBNYXA8c3RyaW5nLCB2c2NvZGUuVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXI8dnNjb2RlLlRlcm1pbmFsQ29tcGxldGlvbkl0ZW0+PiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvZmlsZVByb3ZpZGVyczogTWFwPHN0cmluZywgeyBwcm92aWRlcjogdnNjb2RlLlRlcm1pbmFsUHJvZmlsZVByb3ZpZGVyOyBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiB9PiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcXVpY2tGaXhQcm92aWRlcnM6IE1hcDxzdHJpbmcsIHZzY29kZS5UZXJtaW5hbFF1aWNrRml4UHJvdmlkZXI+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbExpbmtDYWNoZTogTWFwPG51bWJlciwgTWFwPG51bWJlciwgSUNhY2hlZExpbmtFbnRyeT4+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbExpbmtDYW5jZWxsYXRpb25Tb3VyY2U6IE1hcDxudW1iZXIsIENhbmNlbGxhdGlvblRva2VuU291cmNlPiA9IG5ldyBNYXAoKTtcblxuXHRwdWJsaWMgZ2V0IGFjdGl2ZVRlcm1pbmFsKCk6IHZzY29kZS5UZXJtaW5hbCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9hY3RpdmVUZXJtaW5hbD8udmFsdWU7IH1cblx0cHVibGljIGdldCB0ZXJtaW5hbHMoKTogdnNjb2RlLlRlcm1pbmFsW10geyByZXR1cm4gdGhpcy5fdGVybWluYWxzLm1hcCh0ZXJtID0+IHRlcm0udmFsdWUpOyB9XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENsb3NlVGVybWluYWwgPSBuZXcgRW1pdHRlcjx2c2NvZGUuVGVybWluYWw+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xvc2VUZXJtaW5hbCA9IHRoaXMuX29uRGlkQ2xvc2VUZXJtaW5hbC5ldmVudDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZE9wZW5UZXJtaW5hbCA9IG5ldyBFbWl0dGVyPHZzY29kZS5UZXJtaW5hbD4oKTtcblx0cmVhZG9ubHkgb25EaWRPcGVuVGVybWluYWwgPSB0aGlzLl9vbkRpZE9wZW5UZXJtaW5hbC5ldmVudDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZVRlcm1pbmFsID0gbmV3IEVtaXR0ZXI8dnNjb2RlLlRlcm1pbmFsIHwgdW5kZWZpbmVkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZVRlcm1pbmFsID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVUZXJtaW5hbC5ldmVudDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRlcm1pbmFsRGltZW5zaW9ucyA9IG5ldyBFbWl0dGVyPHZzY29kZS5UZXJtaW5hbERpbWVuc2lvbnNDaGFuZ2VFdmVudD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUZXJtaW5hbERpbWVuc2lvbnMgPSB0aGlzLl9vbkRpZENoYW5nZVRlcm1pbmFsRGltZW5zaW9ucy5ldmVudDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRlcm1pbmFsU3RhdGUgPSBuZXcgRW1pdHRlcjx2c2NvZGUuVGVybWluYWw+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVGVybWluYWxTdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlVGVybWluYWxTdGF0ZS5ldmVudDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNoZWxsID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNoZWxsID0gdGhpcy5fb25EaWRDaGFuZ2VTaGVsbC5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkV3JpdGVUZXJtaW5hbERhdGEgPSBuZXcgRW1pdHRlcjx2c2NvZGUuVGVybWluYWxEYXRhV3JpdGVFdmVudD4oe1xuXHRcdG9uV2lsbEFkZEZpcnN0TGlzdGVuZXI6ICgpID0+IHRoaXMuX3Byb3h5LiRzdGFydFNlbmRpbmdEYXRhRXZlbnRzKCksXG5cdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI6ICgpID0+IHRoaXMuX3Byb3h5LiRzdG9wU2VuZGluZ0RhdGFFdmVudHMoKVxuXHR9KTtcblx0cmVhZG9ubHkgb25EaWRXcml0ZVRlcm1pbmFsRGF0YSA9IHRoaXMuX29uRGlkV3JpdGVUZXJtaW5hbERhdGEuZXZlbnQ7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRFeGVjdXRlQ29tbWFuZCA9IG5ldyBFbWl0dGVyPHZzY29kZS5UZXJtaW5hbEV4ZWN1dGVkQ29tbWFuZD4oe1xuXHRcdG9uV2lsbEFkZEZpcnN0TGlzdGVuZXI6ICgpID0+IHRoaXMuX3Byb3h5LiRzdGFydFNlbmRpbmdDb21tYW5kRXZlbnRzKCksXG5cdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI6ICgpID0+IHRoaXMuX3Byb3h5LiRzdG9wU2VuZGluZ0NvbW1hbmRFdmVudHMoKVxuXHR9KTtcblx0cmVhZG9ubHkgb25EaWRFeGVjdXRlVGVybWluYWxDb21tYW5kID0gdGhpcy5fb25EaWRFeGVjdXRlQ29tbWFuZC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRzdXBwb3J0c1Byb2Nlc3NlczogYm9vbGVhbixcblx0XHRASUV4dEhvc3RDb21tYW5kcyBwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0Q29tbWFuZHM6IElFeHRIb3N0Q29tbWFuZHMsXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RScGMuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZFRlcm1pbmFsU2VydmljZSk7XG5cdFx0dGhpcy5fYnVmZmVyZXIgPSBuZXcgVGVybWluYWxEYXRhQnVmZmVyZXIodGhpcy5fcHJveHkuJHNlbmRQcm9jZXNzRGF0YSk7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyUHJvY2Vzc1N1cHBvcnQoc3VwcG9ydHNQcm9jZXNzZXMpO1xuXHRcdHRoaXMuX2V4dEhvc3RDb21tYW5kcy5yZWdpc3RlckFyZ3VtZW50UHJvY2Vzc29yKHtcblx0XHRcdHByb2Nlc3NBcmd1bWVudDogYXJnID0+IHtcblx0XHRcdFx0Y29uc3QgZGVzZXJpYWxpemUgPSAoYXJnOiBJU2VyaWFsaXplZFRlcm1pbmFsSW5zdGFuY2VDb250ZXh0KSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0VGVybWluYWxCeUlkKGFyZy5pbnN0YW5jZUlkKT8udmFsdWU7XG5cdFx0XHRcdH07XG5cdFx0XHRcdHN3aXRjaCAoYXJnPy4kbWlkKSB7XG5cdFx0XHRcdFx0Y2FzZSBNYXJzaGFsbGVkSWQuVGVybWluYWxDb250ZXh0OiByZXR1cm4gZGVzZXJpYWxpemUoYXJnKTtcblx0XHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0XHQvLyBEbyBhcnJheSB0cmFuc2Zvcm1hdGlvbiBpbiBwbGFjZSBhcyB0aGlzIGlzIGEgaG90IHBhdGhcblx0XHRcdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KGFyZykpIHtcblx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhcmcubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoYXJnW2ldLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5UZXJtaW5hbENvbnRleHQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGFyZ1tpXSA9IGRlc2VyaWFsaXplKGFyZ1tpXSk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdC8vIFByb2JhYmx5IHNvbWV0aGluZyBlbHNlLCBzbyBleGl0IGVhcmx5XG5cdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtfLCB0ZXJtaW5hbFByb2Nlc3NdIG9mIHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc2VzKSB7XG5cdFx0XHRcdFx0dGVybWluYWxQcm9jZXNzLnNodXRkb3duKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYWJzdHJhY3QgY3JlYXRlVGVybWluYWwobmFtZT86IHN0cmluZywgc2hlbGxQYXRoPzogc3RyaW5nLCBzaGVsbEFyZ3M/OiBzdHJpbmdbXSB8IHN0cmluZyk6IHZzY29kZS5UZXJtaW5hbDtcblx0cHVibGljIGFic3RyYWN0IGNyZWF0ZVRlcm1pbmFsRnJvbU9wdGlvbnMob3B0aW9uczogdnNjb2RlLlRlcm1pbmFsT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSVRlcm1pbmFsSW50ZXJuYWxPcHRpb25zKTogdnNjb2RlLlRlcm1pbmFsO1xuXG5cdHB1YmxpYyBnZXREZWZhdWx0U2hlbGwodXNlQXV0b21hdGlvblNoZWxsOiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRjb25zdCBwcm9maWxlID0gdXNlQXV0b21hdGlvblNoZWxsID8gdGhpcy5fZGVmYXVsdEF1dG9tYXRpb25Qcm9maWxlIDogdGhpcy5fZGVmYXVsdFByb2ZpbGU7XG5cdFx0cmV0dXJuIHByb2ZpbGU/LnBhdGggfHwgJyc7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVmYXVsdFNoZWxsQXJncyh1c2VBdXRvbWF0aW9uU2hlbGw6IGJvb2xlYW4pOiBzdHJpbmdbXSB8IHN0cmluZyB7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IHVzZUF1dG9tYXRpb25TaGVsbCA/IHRoaXMuX2RlZmF1bHRBdXRvbWF0aW9uUHJvZmlsZSA6IHRoaXMuX2RlZmF1bHRQcm9maWxlO1xuXHRcdHJldHVybiBwcm9maWxlPy5hcmdzIHx8IFtdO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZUV4dGVuc2lvblRlcm1pbmFsKG9wdGlvbnM6IHZzY29kZS5FeHRlbnNpb25UZXJtaW5hbE9wdGlvbnMsIGludGVybmFsT3B0aW9ucz86IElUZXJtaW5hbEludGVybmFsT3B0aW9ucyk6IHZzY29kZS5UZXJtaW5hbCB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSBuZXcgRXh0SG9zdFRlcm1pbmFsKHRoaXMuX3Byb3h5LCBnZW5lcmF0ZVV1aWQoKSwgb3B0aW9ucywgb3B0aW9ucy5uYW1lKTtcblx0XHRjb25zdCBwID0gbmV3IEV4dEhvc3RQc2V1ZG90ZXJtaW5hbChvcHRpb25zLnB0eSk7XG5cdFx0dGVybWluYWwuY3JlYXRlRXh0ZW5zaW9uVGVybWluYWwob3B0aW9ucy5sb2NhdGlvbiwgaW50ZXJuYWxPcHRpb25zLCB0aGlzLl9zZXJpYWxpemVQYXJlbnRUZXJtaW5hbChvcHRpb25zLCBpbnRlcm5hbE9wdGlvbnMpLnJlc29sdmVkRXh0SG9zdElkZW50aWZpZXIsIGFzVGVybWluYWxJY29uKG9wdGlvbnMuaWNvblBhdGgpLCBhc1Rlcm1pbmFsQ29sb3Iob3B0aW9ucy5jb2xvciksIG9wdGlvbnMuc2hlbGxJbnRlZ3JhdGlvbk5vbmNlLCBvcHRpb25zLnRpdGxlVGVtcGxhdGUpLnRoZW4oaWQgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuX3NldHVwRXh0SG9zdFByb2Nlc3NMaXN0ZW5lcnMoaWQsIHApO1xuXHRcdFx0dGhpcy5fdGVybWluYWxQcm9jZXNzRGlzcG9zYWJsZXNbaWRdID0gZGlzcG9zYWJsZTtcblx0XHR9KTtcblx0XHR0aGlzLl90ZXJtaW5hbHMucHVzaCh0ZXJtaW5hbCk7XG5cdFx0cmV0dXJuIHRlcm1pbmFsLnZhbHVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zZXJpYWxpemVQYXJlbnRUZXJtaW5hbChvcHRpb25zOiB2c2NvZGUuVGVybWluYWxPcHRpb25zLCBpbnRlcm5hbE9wdGlvbnM/OiBJVGVybWluYWxJbnRlcm5hbE9wdGlvbnMpOiBJVGVybWluYWxJbnRlcm5hbE9wdGlvbnMge1xuXHRcdGludGVybmFsT3B0aW9ucyA9IGludGVybmFsT3B0aW9ucyA/IGludGVybmFsT3B0aW9ucyA6IHt9O1xuXHRcdGlmIChvcHRpb25zLmxvY2F0aW9uICYmIHR5cGVvZiBvcHRpb25zLmxvY2F0aW9uID09PSAnb2JqZWN0JyAmJiBoYXNLZXkob3B0aW9ucy5sb2NhdGlvbiwgeyBwYXJlbnRUZXJtaW5hbDogdHJ1ZSB9KSkge1xuXHRcdFx0Y29uc3QgcGFyZW50VGVybWluYWwgPSBvcHRpb25zLmxvY2F0aW9uLnBhcmVudFRlcm1pbmFsO1xuXHRcdFx0aWYgKHBhcmVudFRlcm1pbmFsKSB7XG5cdFx0XHRcdGNvbnN0IHBhcmVudEV4dEhvc3RUZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFscy5maW5kKHQgPT4gdC52YWx1ZSA9PT0gcGFyZW50VGVybWluYWwpO1xuXHRcdFx0XHRpZiAocGFyZW50RXh0SG9zdFRlcm1pbmFsKSB7XG5cdFx0XHRcdFx0aW50ZXJuYWxPcHRpb25zLnJlc29sdmVkRXh0SG9zdElkZW50aWZpZXIgPSBwYXJlbnRFeHRIb3N0VGVybWluYWwuX2lkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChvcHRpb25zLmxvY2F0aW9uICYmIHR5cGVvZiBvcHRpb25zLmxvY2F0aW9uICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0aW50ZXJuYWxPcHRpb25zLmxvY2F0aW9uID0gb3B0aW9ucy5sb2NhdGlvbjtcblx0XHR9IGVsc2UgaWYgKGludGVybmFsT3B0aW9ucy5sb2NhdGlvbiAmJiB0eXBlb2YgaW50ZXJuYWxPcHRpb25zLmxvY2F0aW9uID09PSAnb2JqZWN0JyAmJiBoYXNLZXkoaW50ZXJuYWxPcHRpb25zLmxvY2F0aW9uLCB7IHNwbGl0QWN0aXZlVGVybWluYWw6IHRydWUgfSkpIHtcblx0XHRcdGludGVybmFsT3B0aW9ucy5sb2NhdGlvbiA9IHsgc3BsaXRBY3RpdmVUZXJtaW5hbDogdHJ1ZSB9O1xuXHRcdH1cblx0XHRyZXR1cm4gaW50ZXJuYWxPcHRpb25zO1xuXHR9XG5cblx0cHVibGljIGF0dGFjaFB0eVRvVGVybWluYWwoaWQ6IG51bWJlciwgcHR5OiB2c2NvZGUuUHNldWRvdGVybWluYWwpOiB2b2lkIHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuZ2V0VGVybWluYWxCeUlkKGlkKTtcblx0XHRpZiAoIXRlcm1pbmFsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZXNvbHZlIHRlcm1pbmFsIHdpdGggaWQgJHtpZH0gZm9yIHZpcnR1YWwgcHJvY2Vzc2ApO1xuXHRcdH1cblx0XHRjb25zdCBwID0gbmV3IEV4dEhvc3RQc2V1ZG90ZXJtaW5hbChwdHkpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLl9zZXR1cEV4dEhvc3RQcm9jZXNzTGlzdGVuZXJzKGlkLCBwKTtcblx0XHR0aGlzLl90ZXJtaW5hbFByb2Nlc3NEaXNwb3NhYmxlc1tpZF0gPSBkaXNwb3NhYmxlO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRhY2NlcHRBY3RpdmVUZXJtaW5hbENoYW5nZWQoaWQ6IG51bWJlciB8IG51bGwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IHRoaXMuX2FjdGl2ZVRlcm1pbmFsO1xuXHRcdGlmIChpZCA9PT0gbnVsbCkge1xuXHRcdFx0dGhpcy5fYWN0aXZlVGVybWluYWwgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAob3JpZ2luYWwgIT09IHRoaXMuX2FjdGl2ZVRlcm1pbmFsKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlVGVybWluYWwuZmlyZSh0aGlzLl9hY3RpdmVUZXJtaW5hbCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5nZXRUZXJtaW5hbEJ5SWQoaWQpO1xuXHRcdGlmICh0ZXJtaW5hbCkge1xuXHRcdFx0dGhpcy5fYWN0aXZlVGVybWluYWwgPSB0ZXJtaW5hbDtcblx0XHRcdGlmIChvcmlnaW5hbCAhPT0gdGhpcy5fYWN0aXZlVGVybWluYWwpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVUZXJtaW5hbC5maXJlKHRoaXMuX2FjdGl2ZVRlcm1pbmFsLnZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGFjY2VwdFRlcm1pbmFsUHJvY2Vzc0RhdGEoaWQ6IG51bWJlciwgZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLmdldFRlcm1pbmFsQnlJZChpZCk7XG5cdFx0aWYgKHRlcm1pbmFsKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFdyaXRlVGVybWluYWxEYXRhLmZpcmUoeyB0ZXJtaW5hbDogdGVybWluYWwudmFsdWUsIGRhdGEgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jICRhY2NlcHRUZXJtaW5hbERpbWVuc2lvbnMoaWQ6IG51bWJlciwgY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuZ2V0VGVybWluYWxCeUlkKGlkKTtcblx0XHRpZiAodGVybWluYWwpIHtcblx0XHRcdGlmICh0ZXJtaW5hbC5zZXREaW1lbnNpb25zKGNvbHMsIHJvd3MpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVGVybWluYWxEaW1lbnNpb25zLmZpcmUoe1xuXHRcdFx0XHRcdHRlcm1pbmFsOiB0ZXJtaW5hbC52YWx1ZSxcblx0XHRcdFx0XHRkaW1lbnNpb25zOiB0ZXJtaW5hbC52YWx1ZS5kaW1lbnNpb25zIGFzIHZzY29kZS5UZXJtaW5hbERpbWVuc2lvbnNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jICRhY2NlcHREaWRFeGVjdXRlQ29tbWFuZChpZDogbnVtYmVyLCBjb21tYW5kOiBJVGVybWluYWxDb21tYW5kRHRvKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLmdldFRlcm1pbmFsQnlJZChpZCk7XG5cdFx0aWYgKHRlcm1pbmFsKSB7XG5cdFx0XHR0aGlzLl9vbkRpZEV4ZWN1dGVDb21tYW5kLmZpcmUoeyB0ZXJtaW5hbDogdGVybWluYWwudmFsdWUsIC4uLmNvbW1hbmQgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jICRhY2NlcHRUZXJtaW5hbE1heGltdW1EaW1lbnNpb25zKGlkOiBudW1iZXIsIGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gRXh0ZW5zaW9uIHB0eSB0ZXJtaW5hbCBvbmx5IC0gd2hlbiB2aXJ0dWFsIHByb2Nlc3MgcmVzaXplIGZpcmVzIGl0IG1lYW5zIHRoYXQgdGhlXG5cdFx0Ly8gdGVybWluYWwncyBtYXhpbXVtIGRpbWVuc2lvbnMgY2hhbmdlZFxuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc2VzLmdldChpZCk/LnJlc2l6ZShjb2xzLCByb3dzKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkYWNjZXB0VGVybWluYWxUaXRsZUNoYW5nZShpZDogbnVtYmVyLCBuYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuZ2V0VGVybWluYWxCeUlkKGlkKTtcblx0XHRpZiAodGVybWluYWwpIHtcblx0XHRcdHRlcm1pbmFsLm5hbWUgPSBuYW1lO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkYWNjZXB0VGVybWluYWxDbG9zZWQoaWQ6IG51bWJlciwgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZCwgZXhpdFJlYXNvbjogVGVybWluYWxFeGl0UmVhc29uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gUmVsZWFzZSBhbnkgY2FjaGVkIHRlcm1pbmFsIGxpbmtzIGFuZCBjYW5jZWwgaW4tZmxpZ2h0IGxpbmsgcHJvdmlkZXJzIGZvciB0aGlzIHRlcm1pbmFsXG5cdFx0dGhpcy5fdGVybWluYWxMaW5rQ2FjaGUuZGVsZXRlKGlkKTtcblx0XHRjb25zdCBjYW5jZWxsYXRpb25Tb3VyY2UgPSB0aGlzLl90ZXJtaW5hbExpbmtDYW5jZWxsYXRpb25Tb3VyY2UuZ2V0KGlkKTtcblx0XHRpZiAoY2FuY2VsbGF0aW9uU291cmNlKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbExpbmtDYW5jZWxsYXRpb25Tb3VyY2UuZGVsZXRlKGlkKTtcblx0XHRcdGNhbmNlbGxhdGlvblNvdXJjZS5kaXNwb3NlKHRydWUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fZ2V0VGVybWluYWxPYmplY3RJbmRleEJ5SWQodGhpcy5fdGVybWluYWxzLCBpZCk7XG5cdFx0aWYgKGluZGV4ICE9PSBudWxsKSB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFscy5zcGxpY2UoaW5kZXgsIDEpWzBdO1xuXHRcdFx0dGVybWluYWwuc2V0RXhpdFN0YXR1cyhleGl0Q29kZSwgZXhpdFJlYXNvbik7XG5cdFx0XHR0aGlzLl9vbkRpZENsb3NlVGVybWluYWwuZmlyZSh0ZXJtaW5hbC52YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljICRhY2NlcHRUZXJtaW5hbE9wZW5lZChpZDogbnVtYmVyLCBleHRIb3N0VGVybWluYWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBuYW1lOiBzdHJpbmcsIHNoZWxsTGF1bmNoQ29uZmlnRHRvOiBJU2hlbGxMYXVuY2hDb25maWdEdG8pOiB2b2lkIHtcblx0XHRpZiAoZXh0SG9zdFRlcm1pbmFsSWQpIHtcblx0XHRcdC8vIFJlc29sdmUgd2l0aCB0aGUgcmVuZGVyZXIgZ2VuZXJhdGVkIGlkXG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2dldFRlcm1pbmFsT2JqZWN0SW5kZXhCeUlkKHRoaXMuX3Rlcm1pbmFscywgZXh0SG9zdFRlcm1pbmFsSWQpO1xuXHRcdFx0aWYgKGluZGV4ICE9PSBudWxsKSB7XG5cdFx0XHRcdC8vIFRoZSB0ZXJtaW5hbCBoYXMgYWxyZWFkeSBiZWVuIGNyZWF0ZWQgKHZpYSBjcmVhdGVUZXJtaW5hbCopLCBvbmx5IGZpcmUgdGhlIGV2ZW50XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsc1tpbmRleF0uX2lkID0gaWQ7XG5cdFx0XHRcdHRoaXMuX29uRGlkT3BlblRlcm1pbmFsLmZpcmUodGhpcy50ZXJtaW5hbHNbaW5kZXhdKTtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxzW2luZGV4XS5pc09wZW4gPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3JlYXRpb25PcHRpb25zOiB2c2NvZGUuVGVybWluYWxPcHRpb25zID0ge1xuXHRcdFx0bmFtZTogc2hlbGxMYXVuY2hDb25maWdEdG8ubmFtZSxcblx0XHRcdHNoZWxsUGF0aDogc2hlbGxMYXVuY2hDb25maWdEdG8uZXhlY3V0YWJsZSxcblx0XHRcdHNoZWxsQXJnczogc2hlbGxMYXVuY2hDb25maWdEdG8uYXJncyxcblx0XHRcdGN3ZDogdHlwZW9mIHNoZWxsTGF1bmNoQ29uZmlnRHRvLmN3ZCA9PT0gJ3N0cmluZycgPyBzaGVsbExhdW5jaENvbmZpZ0R0by5jd2QgOiBVUkkucmV2aXZlKHNoZWxsTGF1bmNoQ29uZmlnRHRvLmN3ZCksXG5cdFx0XHRlbnY6IHNoZWxsTGF1bmNoQ29uZmlnRHRvLmVudixcblx0XHRcdGhpZGVGcm9tVXNlcjogc2hlbGxMYXVuY2hDb25maWdEdG8uaGlkZUZyb21Vc2VyLFxuXHRcdFx0dGl0bGVUZW1wbGF0ZTogc2hlbGxMYXVuY2hDb25maWdEdG8udGl0bGVUZW1wbGF0ZVxuXHRcdH07XG5cdFx0Y29uc3QgdGVybWluYWwgPSBuZXcgRXh0SG9zdFRlcm1pbmFsKHRoaXMuX3Byb3h5LCBpZCwgY3JlYXRpb25PcHRpb25zLCBuYW1lKTtcblx0XHR0aGlzLl90ZXJtaW5hbHMucHVzaCh0ZXJtaW5hbCk7XG5cdFx0dGhpcy5fb25EaWRPcGVuVGVybWluYWwuZmlyZSh0ZXJtaW5hbC52YWx1ZSk7XG5cdFx0dGVybWluYWwuaXNPcGVuID0gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkYWNjZXB0VGVybWluYWxQcm9jZXNzSWQoaWQ6IG51bWJlciwgcHJvY2Vzc0lkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuZ2V0VGVybWluYWxCeUlkKGlkKTtcblx0XHR0ZXJtaW5hbD8uX3NldFByb2Nlc3NJZChwcm9jZXNzSWQpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRzdGFydEV4dGVuc2lvblRlcm1pbmFsKGlkOiBudW1iZXIsIGluaXRpYWxEaW1lbnNpb25zOiBJVGVybWluYWxEaW1lbnNpb25zRHRvIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJVGVybWluYWxMYXVuY2hFcnJvciB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIE1ha2Ugc3VyZSB0aGUgRXh0SG9zdFRlcm1pbmFsIGV4aXN0cyBzbyBvbkRpZE9wZW5UZXJtaW5hbCBoYXMgZmlyZWQgYmVmb3JlIHdlIGNhbGxcblx0XHQvLyBQc2V1ZG90ZXJtaW5hbC5zdGFydFxuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5nZXRUZXJtaW5hbEJ5SWQoaWQpO1xuXHRcdGlmICghdGVybWluYWwpIHtcblx0XHRcdHJldHVybiB7IG1lc3NhZ2U6IGxvY2FsaXplKCdsYXVuY2hGYWlsLmlkTWlzc2luZ09uRXh0SG9zdCcsIFwiQ291bGQgbm90IGZpbmQgdGhlIHRlcm1pbmFsIHdpdGggaWQgezB9IG9uIHRoZSBleHRlbnNpb24gaG9zdFwiLCBpZCkgfTtcblx0XHR9XG5cblx0XHQvLyBXYWl0IGZvciBvbkRpZE9wZW5UZXJtaW5hbCB0byBmaXJlXG5cdFx0aWYgKCF0ZXJtaW5hbC5pc09wZW4pIHtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuXHRcdFx0XHQvLyBFbnN1cmUgb3BlbiBpcyBjYWxsZWQgYWZ0ZXIgb25EaWRPcGVuVGVybWluYWxcblx0XHRcdFx0Y29uc3QgbGlzdGVuZXIgPSB0aGlzLm9uRGlkT3BlblRlcm1pbmFsKGFzeW5jIGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlID09PSB0ZXJtaW5hbC52YWx1ZSkge1xuXHRcdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXJtaW5hbFByb2Nlc3MgPSB0aGlzLl90ZXJtaW5hbFByb2Nlc3Nlcy5nZXQoaWQpO1xuXHRcdGlmICh0ZXJtaW5hbFByb2Nlc3MpIHtcblx0XHRcdCh0ZXJtaW5hbFByb2Nlc3MgYXMgRXh0SG9zdFBzZXVkb3Rlcm1pbmFsKS5zdGFydFNlbmRpbmdFdmVudHMoaW5pdGlhbERpbWVuc2lvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBEZWZlciBzdGFydFNlbmRpbmdFdmVudHMgY2FsbCB0byB3aGVuIF9zZXR1cEV4dEhvc3RQcm9jZXNzTGlzdGVuZXJzIGlzIGNhbGxlZFxuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uVGVybWluYWxBd2FpdGluZ1N0YXJ0W2lkXSA9IHsgaW5pdGlhbERpbWVuc2lvbnMgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zZXR1cEV4dEhvc3RQcm9jZXNzTGlzdGVuZXJzKGlkOiBudW1iZXIsIHA6IElUZXJtaW5hbENoaWxkUHJvY2Vzcyk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocC5vblByb2Nlc3NSZWFkeShlID0+IHRoaXMuX3Byb3h5LiRzZW5kUHJvY2Vzc1JlYWR5KGlkLCBlLnBpZCwgZS5jd2QsIGUud2luZG93c1B0eSkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocC5vbkRpZENoYW5nZVByb3BlcnR5KHByb3BlcnR5ID0+IHRoaXMuX3Byb3h5LiRzZW5kUHJvY2Vzc1Byb3BlcnR5KGlkLCBwcm9wZXJ0eSkpKTtcblxuXHRcdC8vIEJ1ZmZlciBkYXRhIGV2ZW50cyB0byByZWR1Y2UgdGhlIGFtb3VudCBvZiBtZXNzYWdlcyBnb2luZyB0byB0aGUgcmVuZGVyZXJcblx0XHR0aGlzLl9idWZmZXJlci5zdGFydEJ1ZmZlcmluZyhpZCwgcC5vblByb2Nlc3NEYXRhKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocC5vblByb2Nlc3NFeGl0KGV4aXRDb2RlID0+IHRoaXMuX29uUHJvY2Vzc0V4aXQoaWQsIGV4aXRDb2RlKSkpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc2VzLnNldChpZCwgcCk7XG5cblx0XHRjb25zdCBhd2FpdGluZ1N0YXJ0ID0gdGhpcy5fZXh0ZW5zaW9uVGVybWluYWxBd2FpdGluZ1N0YXJ0W2lkXTtcblx0XHRpZiAoYXdhaXRpbmdTdGFydCAmJiBwIGluc3RhbmNlb2YgRXh0SG9zdFBzZXVkb3Rlcm1pbmFsKSB7XG5cdFx0XHRwLnN0YXJ0U2VuZGluZ0V2ZW50cyhhd2FpdGluZ1N0YXJ0LmluaXRpYWxEaW1lbnNpb25zKTtcblx0XHRcdGRlbGV0ZSB0aGlzLl9leHRlbnNpb25UZXJtaW5hbEF3YWl0aW5nU3RhcnRbaWRdO1xuXHRcdH1cblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0UHJvY2Vzc0Fja0RhdGFFdmVudChpZDogbnVtYmVyLCBjaGFyQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc2VzLmdldChpZCk/LmFja25vd2xlZGdlRGF0YUV2ZW50KGNoYXJDb3VudCk7XG5cdH1cblxuXHRwdWJsaWMgJGFjY2VwdFByb2Nlc3NJbnB1dChpZDogbnVtYmVyLCBkYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl90ZXJtaW5hbFByb2Nlc3Nlcy5nZXQoaWQpPy5pbnB1dChkYXRhKTtcblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0VGVybWluYWxJbnRlcmFjdGlvbihpZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLmdldFRlcm1pbmFsQnlJZChpZCk7XG5cdFx0aWYgKHRlcm1pbmFsPy5zZXRJbnRlcmFjdGVkV2l0aCgpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRlcm1pbmFsU3RhdGUuZmlyZSh0ZXJtaW5hbC52YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljICRhY2NlcHRUZXJtaW5hbFNlbGVjdGlvbihpZDogbnVtYmVyLCBzZWxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuZ2V0VGVybWluYWxCeUlkKGlkKT8uc2V0U2VsZWN0aW9uKHNlbGVjdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgJGFjY2VwdFByb2Nlc3NSZXNpemUoaWQ6IG51bWJlciwgY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fdGVybWluYWxQcm9jZXNzZXMuZ2V0KGlkKT8ucmVzaXplKGNvbHMsIHJvd3MpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBXZSB0cmllZCB0byB3cml0ZSB0byBhIGNsb3NlZCBwaXBlIC8gY2hhbm5lbC5cblx0XHRcdGlmIChlcnJvci5jb2RlICE9PSAnRVBJUEUnICYmIGVycm9yLmNvZGUgIT09ICdFUlJfSVBDX0NIQU5ORUxfQ0xPU0VEJykge1xuXHRcdFx0XHR0aHJvdyAoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0UHJvY2Vzc1NodXRkb3duKGlkOiBudW1iZXIsIGltbWVkaWF0ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc2VzLmdldChpZCk/LnNodXRkb3duKGltbWVkaWF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgJGFjY2VwdFByb2Nlc3NSZXF1ZXN0SW5pdGlhbEN3ZChpZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fdGVybWluYWxQcm9jZXNzZXMuZ2V0KGlkKT8uZ2V0SW5pdGlhbEN3ZCgpLnRoZW4oaW5pdGlhbEN3ZCA9PiB0aGlzLl9wcm94eS4kc2VuZFByb2Nlc3NQcm9wZXJ0eShpZCwgeyB0eXBlOiBQcm9jZXNzUHJvcGVydHlUeXBlLkluaXRpYWxDd2QsIHZhbHVlOiBpbml0aWFsQ3dkIH0pKTtcblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0UHJvY2Vzc1JlcXVlc3RDd2QoaWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc2VzLmdldChpZCk/LmdldEN3ZCgpLnRoZW4oY3dkID0+IHRoaXMuX3Byb3h5LiRzZW5kUHJvY2Vzc1Byb3BlcnR5KGlkLCB7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuQ3dkLCB2YWx1ZTogY3dkIH0pKTtcblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0UHJvY2Vzc1JlcXVlc3RMYXRlbmN5KGlkOiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoaWQpO1xuXHR9XG5cblxuXHRwdWJsaWMgcmVnaXN0ZXJQcm9maWxlUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlkOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuVGVybWluYWxQcm9maWxlUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuX3Byb2ZpbGVQcm92aWRlcnMuaGFzKGlkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUZXJtaW5hbCBwcm9maWxlIHByb3ZpZGVyIFwiJHtpZH1cIiBhbHJlYWR5IHJlZ2lzdGVyZWRgKTtcblx0XHR9XG5cdFx0dGhpcy5fcHJvZmlsZVByb3ZpZGVycy5zZXQoaWQsIHsgcHJvdmlkZXIsIGV4dGVuc2lvbiB9KTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJQcm9maWxlUHJvdmlkZXIoaWQsIGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlKTtcblx0XHRyZXR1cm4gbmV3IFZTQ29kZURpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcHJvZmlsZVByb3ZpZGVycy5kZWxldGUoaWQpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHVucmVnaXN0ZXJQcm9maWxlUHJvdmlkZXIoaWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHByb3ZpZGVyOiB2c2NvZGUuVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXI8VGVybWluYWxDb21wbGV0aW9uSXRlbT4sIC4uLnRyaWdnZXJDaGFyYWN0ZXJzOiBzdHJpbmdbXSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5fY29tcGxldGlvblByb3ZpZGVycy5oYXMoZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRlcm1pbmFsIGNvbXBsZXRpb24gcHJvdmlkZXIgXCIke2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfVwiIGFscmVhZHkgcmVnaXN0ZXJlZGApO1xuXHRcdH1cblx0XHR0aGlzLl9jb21wbGV0aW9uUHJvdmlkZXJzLnNldChleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSwgcHJvdmlkZXIpO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckNvbXBsZXRpb25Qcm92aWRlcihleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUsIC4uLnRyaWdnZXJDaGFyYWN0ZXJzKTtcblx0XHRyZXR1cm4gbmV3IFZTQ29kZURpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29tcGxldGlvblByb3ZpZGVycy5kZWxldGUoZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHVucmVnaXN0ZXJDb21wbGV0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRwcm92aWRlVGVybWluYWxDb21wbGV0aW9ucyhpZDogc3RyaW5nLCBvcHRpb25zOiBJVGVybWluYWxDb21wbGV0aW9uQ29udGV4dER0byk6IFByb21pc2U8VGVybWluYWxDb21wbGV0aW9uTGlzdER0byB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRva2VuID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkudG9rZW47XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICF0aGlzLmFjdGl2ZVRlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fY29tcGxldGlvblByb3ZpZGVycy5nZXQoaWQpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVUZXJtaW5hbENvbXBsZXRpb25zKHRoaXMuYWN0aXZlVGVybWluYWwsIG9wdGlvbnMsIHRva2VuKTtcblx0XHRpZiAoY29tcGxldGlvbnMgPT09IG51bGwgfHwgY29tcGxldGlvbnMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcGF0aFNlcGFyYXRvciA9ICFpc1dpbmRvd3MgfHwgdGhpcy5hY3RpdmVUZXJtaW5hbC5zdGF0ZT8uc2hlbGwgPT09IFdpbmRvd3NTaGVsbFR5cGUuR2l0QmFzaCA/ICcvJyA6ICdcXFxcJztcblx0XHRyZXR1cm4gVGVybWluYWxDb21wbGV0aW9uTGlzdC5mcm9tKGNvbXBsZXRpb25zLCBwYXRoU2VwYXJhdG9yKTtcblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0VGVybWluYWxTaGVsbFR5cGUoaWQ6IG51bWJlciwgc2hlbGxUeXBlOiBUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5nZXRUZXJtaW5hbEJ5SWQoaWQpO1xuXHRcdGlmICh0ZXJtaW5hbD8uc2V0U2hlbGxUeXBlKHNoZWxsVHlwZSkpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVGVybWluYWxTdGF0ZS5maXJlKHRlcm1pbmFsLnZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJUZXJtaW5hbFF1aWNrRml4UHJvdmlkZXIoaWQ6IHN0cmluZywgZXh0ZW5zaW9uSWQ6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5UZXJtaW5hbFF1aWNrRml4UHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuX3F1aWNrRml4UHJvdmlkZXJzLmhhcyhpZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVGVybWluYWwgcXVpY2sgZml4IHByb3ZpZGVyIFwiJHtpZH1cIiBpcyBhbHJlYWR5IHJlZ2lzdGVyZWRgKTtcblx0XHR9XG5cdFx0dGhpcy5fcXVpY2tGaXhQcm92aWRlcnMuc2V0KGlkLCBwcm92aWRlcik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyUXVpY2tGaXhQcm92aWRlcihpZCwgZXh0ZW5zaW9uSWQpO1xuXHRcdHJldHVybiBuZXcgVlNDb2RlRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9xdWlja0ZpeFByb3ZpZGVycy5kZWxldGUoaWQpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHVucmVnaXN0ZXJRdWlja0ZpeFByb3ZpZGVyKGlkKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkcHJvdmlkZVRlcm1pbmFsUXVpY2tGaXhlcyhpZDogc3RyaW5nLCBtYXRjaFJlc3VsdDogVGVybWluYWxDb21tYW5kTWF0Y2hSZXN1bHREdG8pOiBQcm9taXNlPChJVGVybWluYWxRdWlja0ZpeFRlcm1pbmFsQ29tbWFuZER0byB8IElUZXJtaW5hbFF1aWNrRml4T3BlbmVyRHRvIHwgSUNvbW1hbmREdG8pW10gfCBJVGVybWluYWxRdWlja0ZpeFRlcm1pbmFsQ29tbWFuZER0byB8IElUZXJtaW5hbFF1aWNrRml4T3BlbmVyRHRvIHwgSUNvbW1hbmREdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB0b2tlbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpLnRva2VuO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3F1aWNrRml4UHJvdmlkZXJzLmdldChpZCk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBxdWlja0ZpeGVzID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZVRlcm1pbmFsUXVpY2tGaXhlcyhtYXRjaFJlc3VsdCwgdG9rZW4pO1xuXHRcdGlmIChxdWlja0ZpeGVzID09PSBudWxsIHx8IChBcnJheS5pc0FycmF5KHF1aWNrRml4ZXMpICYmIHF1aWNrRml4ZXMubGVuZ3RoID09PSAwKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9sYXN0UXVpY2tGaXhDb21tYW5kcy52YWx1ZSA9IHN0b3JlO1xuXG5cdFx0Ly8gU2luZ2xlXG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHF1aWNrRml4ZXMpKSB7XG5cdFx0XHRyZXR1cm4gcXVpY2tGaXhlcyA/IFRlcm1pbmFsUXVpY2tGaXguZnJvbShxdWlja0ZpeGVzLCB0aGlzLl9leHRIb3N0Q29tbWFuZHMuY29udmVydGVyLCBzdG9yZSkgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gTWFueVxuXHRcdGNvbnN0IHJlc3VsdCA9IFtdO1xuXHRcdGZvciAoY29uc3QgZml4IG9mIHF1aWNrRml4ZXMpIHtcblx0XHRcdGNvbnN0IGNvbnZlcnRlZCA9IFRlcm1pbmFsUXVpY2tGaXguZnJvbShmaXgsIHRoaXMuX2V4dEhvc3RDb21tYW5kcy5jb252ZXJ0ZXIsIHN0b3JlKTtcblx0XHRcdGlmIChjb252ZXJ0ZWQpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goY29udmVydGVkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkY3JlYXRlQ29udHJpYnV0ZWRQcm9maWxlVGVybWluYWwoaWQ6IHN0cmluZywgb3B0aW9uczogSUNyZWF0ZUNvbnRyaWJ1dGVkVGVybWluYWxQcm9maWxlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRva2VuID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkudG9rZW47XG5cdFx0Y29uc3QgcHJvZmlsZVByb3ZpZGVyRGF0YSA9IHRoaXMuX3Byb2ZpbGVQcm92aWRlcnMuZ2V0KGlkKTtcblx0XHRpZiAoIXByb2ZpbGVQcm92aWRlckRhdGEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gdGVybWluYWwgcHJvZmlsZSBwcm92aWRlciByZWdpc3RlcmVkIGZvciBpZCBcIiR7aWR9XCJgKTtcblx0XHR9XG5cdFx0bGV0IHByb2ZpbGUgPSBhd2FpdCBwcm9maWxlUHJvdmlkZXJEYXRhLnByb3ZpZGVyLnByb3ZpZGVUZXJtaW5hbFByb2ZpbGUodG9rZW4pO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocHJvZmlsZSAmJiAhaGFzS2V5KHByb2ZpbGUsIHsgb3B0aW9uczogdHJ1ZSB9KSkge1xuXHRcdFx0cHJvZmlsZSA9IHsgb3B0aW9uczogcHJvZmlsZSB9O1xuXHRcdH1cblxuXHRcdGlmICghcHJvZmlsZSB8fCAhaGFzS2V5KHByb2ZpbGUsIHsgb3B0aW9uczogdHJ1ZSB9KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyB0ZXJtaW5hbCBwcm9maWxlIG9wdGlvbnMgcHJvdmlkZWQgZm9yIGlkIFwiJHtpZH1cImApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1Rlcm1pbmFsVGl0bGVQcm9wb3NhbCA9IGlzUHJvcG9zZWRBcGlFbmFibGVkKHByb2ZpbGVQcm92aWRlckRhdGEuZXh0ZW5zaW9uLCAndGVybWluYWxUaXRsZScpO1xuXHRcdGlmICghaGFzVGVybWluYWxUaXRsZVByb3Bvc2FsICYmIHByb2ZpbGUub3B0aW9ucy50aXRsZVRlbXBsYXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYFske3Byb2ZpbGVQcm92aWRlckRhdGEuZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9XSBcXGB0aXRsZVRlbXBsYXRlXFxgIHJldHVybmVkIGZyb20gVGVybWluYWxQcm9maWxlUHJvdmlkZXIgaXMgaWdub3JlZCBiZWNhdXNlIHRoZSBcXGB0ZXJtaW5hbFRpdGxlXFxgIHByb3Bvc2VkIEFQSSBpcyBub3QgZW5hYmxlZC5gKTtcblx0XHRcdHByb2ZpbGUgPSB7IG9wdGlvbnM6IHsgLi4ucHJvZmlsZS5vcHRpb25zLCB0aXRsZVRlbXBsYXRlOiB1bmRlZmluZWQgfSB9O1xuXHRcdH1cblx0XHQvLyBvcHRpb25zLnRpdGxlVGVtcGxhdGUgaXMgbm90IGV4cGxpY2l0bHkgc3RyaXBwZWQgaGVyZSBiZWNhdXNlIHRoZSBwcm9maWxlT3B0aW9uc1xuXHRcdC8vIGFzc2lnbm1lbnQgYmVsb3cgb25seSBhcHBsaWVzIGl0IHdoZW4gaGFzVGVybWluYWxUaXRsZVByb3Bvc2FsIGlzIHRydWUuXG5cdFx0aWYgKCFoYXNUZXJtaW5hbFRpdGxlUHJvcG9zYWwgJiYgb3B0aW9ucy50aXRsZVRlbXBsYXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYFske3Byb2ZpbGVQcm92aWRlckRhdGEuZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9XSBcXGB0aXRsZVRlbXBsYXRlXFxgIHBhc3NlZCB0byBjcmVhdGVDb250cmlidXRlZFRlcm1pbmFsUHJvZmlsZSBpcyBpZ25vcmVkIGJlY2F1c2UgdGhlIFxcYHRlcm1pbmFsVGl0bGVcXGAgcHJvcG9zZWQgQVBJIGlzIG5vdCBlbmFibGVkLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2ZpbGVPcHRpb25zID0gaGFzVGVybWluYWxUaXRsZVByb3Bvc2FsICYmIG9wdGlvbnMudGl0bGVUZW1wbGF0ZSAmJiAhcHJvZmlsZS5vcHRpb25zLnRpdGxlVGVtcGxhdGVcblx0XHRcdD8geyAuLi5wcm9maWxlLm9wdGlvbnMsIHRpdGxlVGVtcGxhdGU6IG9wdGlvbnMudGl0bGVUZW1wbGF0ZSB9XG5cdFx0XHQ6IHByb2ZpbGUub3B0aW9ucztcblxuXHRcdGlmIChoYXNLZXkocHJvZmlsZU9wdGlvbnMsIHsgcHR5OiB0cnVlIH0pKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZUV4dGVuc2lvblRlcm1pbmFsKHByb2ZpbGVPcHRpb25zLCBvcHRpb25zKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jcmVhdGVUZXJtaW5hbEZyb21PcHRpb25zKHByb2ZpbGVPcHRpb25zLCBvcHRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlckxpbmtQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLlRlcm1pbmFsTGlua1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdHRoaXMuX2xpbmtQcm92aWRlcnMuYWRkKHByb3ZpZGVyKTtcblx0XHRpZiAodGhpcy5fbGlua1Byb3ZpZGVycy5zaXplID09PSAxKSB7XG5cdFx0XHR0aGlzLl9wcm94eS4kc3RhcnRMaW5rUHJvdmlkZXIoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBWU0NvZGVEaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2xpbmtQcm92aWRlcnMuZGVsZXRlKHByb3ZpZGVyKTtcblx0XHRcdGlmICh0aGlzLl9saW5rUHJvdmlkZXJzLnNpemUgPT09IDApIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJHN0b3BMaW5rUHJvdmlkZXIoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkcHJvdmlkZUxpbmtzKHRlcm1pbmFsSWQ6IG51bWJlciwgbGluZTogc3RyaW5nKTogUHJvbWlzZTxJVGVybWluYWxMaW5rRHRvW10+IHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuZ2V0VGVybWluYWxCeUlkKHRlcm1pbmFsSWQpO1xuXHRcdGlmICghdGVybWluYWwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBEaXNjYXJkIGFueSBjYWNoZWQgbGlua3MgdGhlIHRlcm1pbmFsIGhhcyBiZWVuIGhvbGRpbmcsIGN1cnJlbnRseSBhbGwgbGlua3MgYXJlIHJlbGVhc2VkXG5cdFx0Ly8gd2hlbiBuZXcgbGlua3MgYXJlIHByb3ZpZGVkLlxuXHRcdHRoaXMuX3Rlcm1pbmFsTGlua0NhY2hlLmRlbGV0ZSh0ZXJtaW5hbElkKTtcblxuXHRcdGNvbnN0IG9sZFRva2VuID0gdGhpcy5fdGVybWluYWxMaW5rQ2FuY2VsbGF0aW9uU291cmNlLmdldCh0ZXJtaW5hbElkKTtcblx0XHRvbGRUb2tlbj8uZGlzcG9zZSh0cnVlKTtcblx0XHRjb25zdCBjYW5jZWxsYXRpb25Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl90ZXJtaW5hbExpbmtDYW5jZWxsYXRpb25Tb3VyY2Uuc2V0KHRlcm1pbmFsSWQsIGNhbmNlbGxhdGlvblNvdXJjZSk7XG5cblx0XHRjb25zdCByZXN1bHQ6IElUZXJtaW5hbExpbmtEdG9bXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRleHQ6IHZzY29kZS5UZXJtaW5hbExpbmtDb250ZXh0ID0geyB0ZXJtaW5hbDogdGVybWluYWwudmFsdWUsIGxpbmUgfTtcblx0XHRjb25zdCBwcm9taXNlczogdnNjb2RlLlByb3ZpZGVyUmVzdWx0PHsgcHJvdmlkZXI6IHZzY29kZS5UZXJtaW5hbExpbmtQcm92aWRlcjsgbGlua3M6IHZzY29kZS5UZXJtaW5hbExpbmtbXSB9PltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuX2xpbmtQcm92aWRlcnMpIHtcblx0XHRcdHByb21pc2VzLnB1c2goUHJvbWlzZXMud2l0aEFzeW5jQm9keShhc3luYyByID0+IHtcblx0XHRcdFx0Y29uc3QgY2FuY2VsU3Vic2NyaXB0aW9uID0gY2FuY2VsbGF0aW9uU291cmNlLnRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHIoeyBwcm92aWRlciwgbGlua3M6IFtdIH0pKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBsaW5rcyA9IChhd2FpdCBwcm92aWRlci5wcm92aWRlVGVybWluYWxMaW5rcyhjb250ZXh0LCBjYW5jZWxsYXRpb25Tb3VyY2UudG9rZW4pKSB8fCBbXTtcblx0XHRcdFx0XHRpZiAoIWNhbmNlbGxhdGlvblNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cih7IHByb3ZpZGVyLCBsaW5rcyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0Y2FuY2VsU3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVSZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXG5cdFx0aWYgKGNhbmNlbGxhdGlvblNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhY2hlTGlua01hcCA9IG5ldyBNYXA8bnVtYmVyLCBJQ2FjaGVkTGlua0VudHJ5PigpO1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZVJlc3VsdCBvZiBwcm92aWRlUmVzdWx0cykge1xuXHRcdFx0aWYgKHByb3ZpZGVSZXN1bHQgJiYgcHJvdmlkZVJlc3VsdC5saW5rcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKC4uLnByb3ZpZGVSZXN1bHQubGlua3MubWFwKHByb3ZpZGVyTGluayA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbGluayA9IHtcblx0XHRcdFx0XHRcdGlkOiBuZXh0TGlua0lkKyssXG5cdFx0XHRcdFx0XHRzdGFydEluZGV4OiBwcm92aWRlckxpbmsuc3RhcnRJbmRleCxcblx0XHRcdFx0XHRcdGxlbmd0aDogcHJvdmlkZXJMaW5rLmxlbmd0aCxcblx0XHRcdFx0XHRcdGxhYmVsOiBwcm92aWRlckxpbmsudG9vbHRpcFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0Y2FjaGVMaW5rTWFwLnNldChsaW5rLmlkLCB7XG5cdFx0XHRcdFx0XHRwcm92aWRlcjogcHJvdmlkZVJlc3VsdC5wcm92aWRlcixcblx0XHRcdFx0XHRcdGxpbms6IHByb3ZpZGVyTGlua1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJldHVybiBsaW5rO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGVybWluYWxMaW5rQ2FjaGUuc2V0KHRlcm1pbmFsSWQsIGNhY2hlTGlua01hcCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0JGFjdGl2YXRlTGluayh0ZXJtaW5hbElkOiBudW1iZXIsIGxpbmtJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY2FjaGVkTGluayA9IHRoaXMuX3Rlcm1pbmFsTGlua0NhY2hlLmdldCh0ZXJtaW5hbElkKT8uZ2V0KGxpbmtJZCk7XG5cdFx0aWYgKCFjYWNoZWRMaW5rKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNhY2hlZExpbmsucHJvdmlkZXIuaGFuZGxlVGVybWluYWxMaW5rKGNhY2hlZExpbmsubGluayk7XG5cdH1cblxuXHRwcml2YXRlIF9vblByb2Nlc3NFeGl0KGlkOiBudW1iZXIsIGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9idWZmZXJlci5zdG9wQnVmZmVyaW5nKGlkKTtcblxuXHRcdC8vIFJlbW92ZSBwcm9jZXNzIHJlZmVyZW5jZVxuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc2VzLmRlbGV0ZShpZCk7XG5cdFx0ZGVsZXRlIHRoaXMuX2V4dGVuc2lvblRlcm1pbmFsQXdhaXRpbmdTdGFydFtpZF07XG5cblx0XHQvLyBDbGVhbiB1cCBwcm9jZXNzIGRpc3Bvc2FibGVzXG5cdFx0Y29uc3QgcHJvY2Vzc0RpcG9zYWJsZSA9IHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc0Rpc3Bvc2FibGVzW2lkXTtcblx0XHRpZiAocHJvY2Vzc0RpcG9zYWJsZSkge1xuXHRcdFx0cHJvY2Vzc0RpcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRkZWxldGUgdGhpcy5fdGVybWluYWxQcm9jZXNzRGlzcG9zYWJsZXNbaWRdO1xuXHRcdH1cblx0XHQvLyBTZW5kIGV4aXQgZXZlbnQgdG8gbWFpbiBzaWRlXG5cdFx0dGhpcy5fcHJveHkuJHNlbmRQcm9jZXNzRXhpdChpZCwgZXhpdENvZGUpO1xuXHR9XG5cblx0cHVibGljIGdldFRlcm1pbmFsQnlJZChpZDogbnVtYmVyKTogRXh0SG9zdFRlcm1pbmFsIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldFRlcm1pbmFsT2JqZWN0QnlJZCh0aGlzLl90ZXJtaW5hbHMsIGlkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUZXJtaW5hbElkQnlBcGlPYmplY3QodGVybWluYWw6IHZzY29kZS5UZXJtaW5hbCk6IG51bWJlciB8IG51bGwge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fdGVybWluYWxzLmZpbmRJbmRleChpdGVtID0+IHtcblx0XHRcdHJldHVybiBpdGVtLnZhbHVlID09PSB0ZXJtaW5hbDtcblx0XHR9KTtcblx0XHRyZXR1cm4gaW5kZXggPj0gMCA/IGluZGV4IDogbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRlcm1pbmFsT2JqZWN0QnlJZDxUIGV4dGVuZHMgRXh0SG9zdFRlcm1pbmFsPihhcnJheTogVFtdLCBpZDogbnVtYmVyKTogVCB8IG51bGwge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fZ2V0VGVybWluYWxPYmplY3RJbmRleEJ5SWQoYXJyYXksIGlkKTtcblx0XHRyZXR1cm4gaW5kZXggIT09IG51bGwgPyBhcnJheVtpbmRleF0gOiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGVybWluYWxPYmplY3RJbmRleEJ5SWQ8VCBleHRlbmRzIEV4dEhvc3RUZXJtaW5hbD4oYXJyYXk6IFRbXSwgaWQ6IEV4dEhvc3RUZXJtaW5hbElkZW50aWZpZXIpOiBudW1iZXIgfCBudWxsIHtcblx0XHRjb25zdCBpbmRleCA9IGFycmF5LmZpbmRJbmRleChpdGVtID0+IHtcblx0XHRcdHJldHVybiBpdGVtLl9pZCA9PT0gaWQ7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGluZGV4ID49IDAgPyBpbmRleCA6IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBJRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24ge1xuXHRcdGxldCBjb2xsZWN0aW9uID0gdGhpcy5fZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zLmdldChleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0aWYgKCFjb2xsZWN0aW9uKSB7XG5cdFx0XHRjb2xsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IFVuaWZpZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbigpKTtcblx0XHRcdHRoaXMuX3NldEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlLCBjb2xsZWN0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbGxlY3Rpb24uZ2V0U2NvcGVkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24odW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX3N5bmNFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihleHRlbnNpb25JZGVudGlmaWVyOiBzdHJpbmcsIGNvbGxlY3Rpb246IFVuaWZpZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSBzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihjb2xsZWN0aW9uLm1hcCk7XG5cdFx0Y29uc3Qgc2VyaWFsaXplZERlc2NyaXB0aW9uID0gc2VyaWFsaXplRW52aXJvbm1lbnREZXNjcmlwdGlvbk1hcChjb2xsZWN0aW9uLmRlc2NyaXB0aW9uTWFwKTtcblx0XHR0aGlzLl9wcm94eS4kc2V0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oZXh0ZW5zaW9uSWRlbnRpZmllciwgY29sbGVjdGlvbi5wZXJzaXN0ZW50LCBzZXJpYWxpemVkLmxlbmd0aCA9PT0gMCA/IHVuZGVmaW5lZCA6IHNlcmlhbGl6ZWQsIHNlcmlhbGl6ZWREZXNjcmlwdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgJGluaXRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnMoY29sbGVjdGlvbnM6IFtzdHJpbmcsIElTZXJpYWxpemFibGVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbl1bXSk6IHZvaWQge1xuXHRcdGNvbGxlY3Rpb25zLmZvckVhY2goZW50cnkgPT4ge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWRlbnRpZmllciA9IGVudHJ5WzBdO1xuXHRcdFx0Y29uc3QgY29sbGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBVbmlmaWVkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oZW50cnlbMV0pKTtcblx0XHRcdHRoaXMuX3NldEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKGV4dGVuc2lvbklkZW50aWZpZXIsIGNvbGxlY3Rpb24pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljICRhY2NlcHREZWZhdWx0UHJvZmlsZShwcm9maWxlOiBJVGVybWluYWxQcm9maWxlLCBhdXRvbWF0aW9uUHJvZmlsZTogSVRlcm1pbmFsUHJvZmlsZSk6IHZvaWQge1xuXHRcdGNvbnN0IG9sZFByb2ZpbGUgPSB0aGlzLl9kZWZhdWx0UHJvZmlsZTtcblx0XHR0aGlzLl9kZWZhdWx0UHJvZmlsZSA9IHByb2ZpbGU7XG5cdFx0dGhpcy5fZGVmYXVsdEF1dG9tYXRpb25Qcm9maWxlID0gYXV0b21hdGlvblByb2ZpbGU7XG5cdFx0aWYgKG9sZFByb2ZpbGU/LnBhdGggIT09IHByb2ZpbGUucGF0aCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTaGVsbC5maXJlKHByb2ZpbGUucGF0aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nLCBjb2xsZWN0aW9uOiBVbmlmaWVkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9lbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnMuc2V0KGV4dGVuc2lvbklkZW50aWZpZXIsIGNvbGxlY3Rpb24pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbGxlY3Rpb24ub25EaWRDaGFuZ2VDb2xsZWN0aW9uKCgpID0+IHtcblx0XHRcdC8vIFdoZW4gYW55IGNvbGxlY3Rpb24gdmFsdWUgY2hhbmdlcyBzZW5kIHRoaXMgaW1tZWRpYXRlbHksIHRoaXMgaXMgZG9uZSB0byBlbnN1cmVcblx0XHRcdC8vIGZvbGxvd2luZyBjYWxscyB0byBjcmVhdGVUZXJtaW5hbCB3aWxsIGJlIGNyZWF0ZWQgd2l0aCB0aGUgbmV3IGVudmlyb25tZW50LiBJdCB3aWxsXG5cdFx0XHQvLyByZXN1bHQgaW4gbW9yZSBub2lzZSBieSBzZW5kaW5nIG11bHRpcGxlIHVwZGF0ZXMgd2hlbiBjYWxsZWQgYnV0IGNvbGxlY3Rpb25zIGFyZVxuXHRcdFx0Ly8gZXhwZWN0ZWQgdG8gYmUgc21hbGwuXG5cdFx0XHR0aGlzLl9zeW5jRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oZXh0ZW5zaW9uSWRlbnRpZmllciwgY29sbGVjdGlvbik7XG5cdFx0fSkpO1xuXHR9XG59XG5cbi8qKlxuICogVW5pZmllZCBlbnZpcm9ubWVudCB2YXJpYWJsZSBjb2xsZWN0aW9uIGNhcnJ5aW5nIGluZm9ybWF0aW9uIGZvciBhbGwgc2NvcGVzLCBmb3IgYSBzcGVjaWZpYyBleHRlbnNpb24uXG4gKi9cbmNsYXNzIFVuaWZpZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBtYXA6IE1hcDxzdHJpbmcsIElFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvcj4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2NvcGVkQ29sbGVjdGlvbnM6IE1hcDxzdHJpbmcsIFNjb3BlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uPiA9IG5ldyBNYXAoKTtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb25NYXA6IE1hcDxzdHJpbmcsIElFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbkRlc2NyaXB0aW9uPiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSBfcGVyc2lzdGVudDogYm9vbGVhbiA9IHRydWU7XG5cblx0cHVibGljIGdldCBwZXJzaXN0ZW50KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fcGVyc2lzdGVudDsgfVxuXHRwdWJsaWMgc2V0IHBlcnNpc3RlbnQodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9wZXJzaXN0ZW50ID0gdmFsdWU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb2xsZWN0aW9uLmZpcmUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VDb2xsZWN0aW9uOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvbkRpZENoYW5nZUNvbGxlY3Rpb24oKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VDb2xsZWN0aW9uICYmIHRoaXMuX29uRGlkQ2hhbmdlQ29sbGVjdGlvbi5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNlcmlhbGl6ZWQ/OiBJU2VyaWFsaXphYmxlRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25cblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm1hcCA9IG5ldyBNYXAoc2VyaWFsaXplZCk7XG5cdH1cblxuXHRnZXRTY29wZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSB8IHVuZGVmaW5lZCk6IElFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB7XG5cdFx0Y29uc3Qgc2NvcGVkQ29sbGVjdGlvbktleSA9IHRoaXMuZ2V0U2NvcGVLZXkoc2NvcGUpO1xuXHRcdGxldCBzY29wZWRDb2xsZWN0aW9uID0gdGhpcy5zY29wZWRDb2xsZWN0aW9ucy5nZXQoc2NvcGVkQ29sbGVjdGlvbktleSk7XG5cdFx0aWYgKCFzY29wZWRDb2xsZWN0aW9uKSB7XG5cdFx0XHRzY29wZWRDb2xsZWN0aW9uID0gbmV3IFNjb3BlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKHRoaXMsIHNjb3BlKTtcblx0XHRcdHRoaXMuc2NvcGVkQ29sbGVjdGlvbnMuc2V0KHNjb3BlZENvbGxlY3Rpb25LZXksIHNjb3BlZENvbGxlY3Rpb24pO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoc2NvcGVkQ29sbGVjdGlvbi5vbkRpZENoYW5nZUNvbGxlY3Rpb24oKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VDb2xsZWN0aW9uLmZpcmUoKSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2NvcGVkQ29sbGVjdGlvbjtcblx0fVxuXG5cdHJlcGxhY2UodmFyaWFibGU6IHN0cmluZywgdmFsdWU6IHN0cmluZywgb3B0aW9uczogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgc2NvcGU6IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlU2NvcGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRJZkRpZmZlcnModmFyaWFibGUsIHsgdmFsdWUsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5SZXBsYWNlLCBvcHRpb25zOiBvcHRpb25zID8/IHsgYXBwbHlBdFByb2Nlc3NDcmVhdGlvbjogdHJ1ZSB9LCBzY29wZSB9KTtcblx0fVxuXG5cdGFwcGVuZCh2YXJpYWJsZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCBvcHRpb25zOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3NldElmRGlmZmVycyh2YXJpYWJsZSwgeyB2YWx1ZSwgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgb3B0aW9uczogb3B0aW9ucyA/PyB7IGFwcGx5QXRQcm9jZXNzQ3JlYXRpb246IHRydWUgfSwgc2NvcGUgfSk7XG5cdH1cblxuXHRwcmVwZW5kKHZhcmlhYmxlOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIG9wdGlvbnM6IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIHNjb3BlOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZVNjb3BlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0SWZEaWZmZXJzKHZhcmlhYmxlLCB7IHZhbHVlLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUHJlcGVuZCwgb3B0aW9uczogb3B0aW9ucyA/PyB7IGFwcGx5QXRQcm9jZXNzQ3JlYXRpb246IHRydWUgfSwgc2NvcGUgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRJZkRpZmZlcnModmFyaWFibGU6IHN0cmluZywgbXV0YXRvcjogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yICYgeyBzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSB8IHVuZGVmaW5lZCB9KTogdm9pZCB7XG5cdFx0aWYgKG11dGF0b3Iub3B0aW9ucyAmJiBtdXRhdG9yLm9wdGlvbnMuYXBwbHlBdFByb2Nlc3NDcmVhdGlvbiA9PT0gZmFsc2UgJiYgIW11dGF0b3Iub3B0aW9ucy5hcHBseUF0U2hlbGxJbnRlZ3JhdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvck9wdGlvbnMgbXVzdCBhcHBseSBhdCBlaXRoZXIgcHJvY2VzcyBjcmVhdGlvbiBvciBzaGVsbCBpbnRlZ3JhdGlvbicpO1xuXHRcdH1cblx0XHRjb25zdCBrZXkgPSB0aGlzLmdldEtleSh2YXJpYWJsZSwgbXV0YXRvci5zY29wZSk7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMubWFwLmdldChrZXkpO1xuXHRcdGNvbnN0IG5ld09wdGlvbnMgPSBtdXRhdG9yLm9wdGlvbnMgPyB7XG5cdFx0XHRhcHBseUF0UHJvY2Vzc0NyZWF0aW9uOiBtdXRhdG9yLm9wdGlvbnMuYXBwbHlBdFByb2Nlc3NDcmVhdGlvbiA/PyBmYWxzZSxcblx0XHRcdGFwcGx5QXRTaGVsbEludGVncmF0aW9uOiBtdXRhdG9yLm9wdGlvbnMuYXBwbHlBdFNoZWxsSW50ZWdyYXRpb24gPz8gZmFsc2UsXG5cdFx0fSA6IHtcblx0XHRcdGFwcGx5QXRQcm9jZXNzQ3JlYXRpb246IHRydWVcblx0XHR9O1xuXHRcdGlmIChcblx0XHRcdCFjdXJyZW50IHx8XG5cdFx0XHRjdXJyZW50LnZhbHVlICE9PSBtdXRhdG9yLnZhbHVlIHx8XG5cdFx0XHRjdXJyZW50LnR5cGUgIT09IG11dGF0b3IudHlwZSB8fFxuXHRcdFx0Y3VycmVudC5vcHRpb25zPy5hcHBseUF0UHJvY2Vzc0NyZWF0aW9uICE9PSBuZXdPcHRpb25zLmFwcGx5QXRQcm9jZXNzQ3JlYXRpb24gfHxcblx0XHRcdGN1cnJlbnQub3B0aW9ucz8uYXBwbHlBdFNoZWxsSW50ZWdyYXRpb24gIT09IG5ld09wdGlvbnMuYXBwbHlBdFNoZWxsSW50ZWdyYXRpb24gfHxcblx0XHRcdGN1cnJlbnQuc2NvcGU/LndvcmtzcGFjZUZvbGRlcj8uaW5kZXggIT09IG11dGF0b3Iuc2NvcGU/LndvcmtzcGFjZUZvbGRlcj8uaW5kZXhcblx0XHQpIHtcblx0XHRcdGNvbnN0IGtleSA9IHRoaXMuZ2V0S2V5KHZhcmlhYmxlLCBtdXRhdG9yLnNjb3BlKTtcblx0XHRcdGNvbnN0IHZhbHVlOiBJRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3IgPSB7XG5cdFx0XHRcdHZhcmlhYmxlLFxuXHRcdFx0XHQuLi5tdXRhdG9yLFxuXHRcdFx0XHRvcHRpb25zOiBuZXdPcHRpb25zXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5tYXAuc2V0KGtleSwgdmFsdWUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb2xsZWN0aW9uLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRnZXQodmFyaWFibGU6IHN0cmluZywgc2NvcGU6IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlU2NvcGUgfCB1bmRlZmluZWQpOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuZ2V0S2V5KHZhcmlhYmxlLCBzY29wZSk7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLm1hcC5nZXQoa2V5KTtcblx0XHQvLyBUT0RPOiBTZXQgb3B0aW9ucyB0byBkZWZhdWx0cyBpZiBuZWVkZWRcblx0XHRyZXR1cm4gdmFsdWUgPyBjb252ZXJ0TXV0YXRvcih2YWx1ZSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldEtleSh2YXJpYWJsZTogc3RyaW5nLCBzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IHNjb3BlS2V5ID0gdGhpcy5nZXRTY29wZUtleShzY29wZSk7XG5cdFx0cmV0dXJuIHNjb3BlS2V5Lmxlbmd0aCA/IGAke3ZhcmlhYmxlfTo6OiR7c2NvcGVLZXl9YCA6IHZhcmlhYmxlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTY29wZUtleShzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0V29ya3NwYWNlS2V5KHNjb3BlPy53b3Jrc3BhY2VGb2xkZXIpID8/ICcnO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXb3Jrc3BhY2VLZXkod29ya3NwYWNlRm9sZGVyOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gd29ya3NwYWNlRm9sZGVyID8gd29ya3NwYWNlRm9sZGVyLnVyaS50b1N0cmluZygpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGdldFZhcmlhYmxlTWFwKHNjb3BlOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZVNjb3BlIHwgdW5kZWZpbmVkKTogTWFwPHN0cmluZywgdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yPiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IE1hcDxzdHJpbmcsIHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvcj4oKTtcblx0XHRmb3IgKGNvbnN0IFtfLCB2YWx1ZV0gb2YgdGhpcy5tYXApIHtcblx0XHRcdGlmICh0aGlzLmdldFNjb3BlS2V5KHZhbHVlLnNjb3BlKSA9PT0gdGhpcy5nZXRTY29wZUtleShzY29wZSkpIHtcblx0XHRcdFx0bWFwLnNldCh2YWx1ZS52YXJpYWJsZSwgY29udmVydE11dGF0b3IodmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1hcDtcblx0fVxuXG5cdGRlbGV0ZSh2YXJpYWJsZTogc3RyaW5nLCBzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuZ2V0S2V5KHZhcmlhYmxlLCBzY29wZSk7XG5cdFx0dGhpcy5tYXAuZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb2xsZWN0aW9uLmZpcmUoKTtcblx0fVxuXG5cdGNsZWFyKHNjb3BlOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZVNjb3BlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHNjb3BlPy53b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgbXV0YXRvcl0gb2YgdGhpcy5tYXApIHtcblx0XHRcdFx0aWYgKG11dGF0b3Iuc2NvcGU/LndvcmtzcGFjZUZvbGRlcj8uaW5kZXggPT09IHNjb3BlLndvcmtzcGFjZUZvbGRlci5pbmRleCkge1xuXHRcdFx0XHRcdHRoaXMubWFwLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNsZWFyRGVzY3JpcHRpb24oc2NvcGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1hcC5jbGVhcigpO1xuXHRcdFx0dGhpcy5kZXNjcmlwdGlvbk1hcC5jbGVhcigpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbGxlY3Rpb24uZmlyZSgpO1xuXHR9XG5cblx0c2V0RGVzY3JpcHRpb24oZGVzY3JpcHRpb246IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCwgc2NvcGU6IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlU2NvcGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLmdldFNjb3BlS2V5KHNjb3BlKTtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5kZXNjcmlwdGlvbk1hcC5nZXQoa2V5KTtcblx0XHRpZiAoIWN1cnJlbnQgfHwgY3VycmVudC5kZXNjcmlwdGlvbiAhPT0gZGVzY3JpcHRpb24pIHtcblx0XHRcdGxldCBkZXNjcmlwdGlvblN0cjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHR5cGVvZiBkZXNjcmlwdGlvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0ZGVzY3JpcHRpb25TdHIgPSBkZXNjcmlwdGlvbjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIE9ubHkgdGFrZSB0aGUgZGVzY3JpcHRpb24gYmVmb3JlIHRoZSBmaXJzdCBgXFxuXFxuYCwgc28gdGhhdCB0aGUgZGVzY3JpcHRpb24gZG9lc24ndCBtZXNzIHVwIHRoZSBVSVxuXHRcdFx0XHRkZXNjcmlwdGlvblN0ciA9IGRlc2NyaXB0aW9uPy52YWx1ZS5zcGxpdCgnXFxuXFxuJylbMF07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2YWx1ZTogSUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uRGVzY3JpcHRpb24gPSB7IGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvblN0ciwgc2NvcGUgfTtcblx0XHRcdHRoaXMuZGVzY3JpcHRpb25NYXAuc2V0KGtleSwgdmFsdWUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb2xsZWN0aW9uLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVzY3JpcHRpb24oc2NvcGU6IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlU2NvcGUgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuZ2V0U2NvcGVLZXkoc2NvcGUpO1xuXHRcdHJldHVybiB0aGlzLmRlc2NyaXB0aW9uTWFwLmdldChrZXkpPy5kZXNjcmlwdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJEZXNjcmlwdGlvbihzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuZ2V0U2NvcGVLZXkoc2NvcGUpO1xuXHRcdHRoaXMuZGVzY3JpcHRpb25NYXAuZGVsZXRlKGtleSk7XG5cdH1cbn1cblxuY2xhc3MgU2NvcGVkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24gaW1wbGVtZW50cyBJRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24ge1xuXHRwdWJsaWMgZ2V0IHBlcnNpc3RlbnQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmNvbGxlY3Rpb24ucGVyc2lzdGVudDsgfVxuXHRwdWJsaWMgc2V0IHBlcnNpc3RlbnQodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLmNvbGxlY3Rpb24ucGVyc2lzdGVudCA9IHZhbHVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbGxlY3Rpb24gPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRnZXQgb25EaWRDaGFuZ2VDb2xsZWN0aW9uKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQ29sbGVjdGlvbiAmJiB0aGlzLl9vbkRpZENoYW5nZUNvbGxlY3Rpb24uZXZlbnQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbGxlY3Rpb246IFVuaWZpZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNjb3BlOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZVNjb3BlIHwgdW5kZWZpbmVkXG5cdCkge1xuXHR9XG5cblx0Z2V0U2NvcGVkKHNjb3BlOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZVNjb3BlIHwgdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHRoaXMuY29sbGVjdGlvbi5nZXRTY29wZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihzY29wZSk7XG5cdH1cblxuXHRyZXBsYWNlKHZhcmlhYmxlOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIG9wdGlvbnM/OiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JPcHRpb25zIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5jb2xsZWN0aW9uLnJlcGxhY2UodmFyaWFibGUsIHZhbHVlLCBvcHRpb25zLCB0aGlzLnNjb3BlKTtcblx0fVxuXG5cdGFwcGVuZCh2YXJpYWJsZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCBvcHRpb25zPzogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuY29sbGVjdGlvbi5hcHBlbmQodmFyaWFibGUsIHZhbHVlLCBvcHRpb25zLCB0aGlzLnNjb3BlKTtcblx0fVxuXG5cdHByZXBlbmQodmFyaWFibGU6IHN0cmluZywgdmFsdWU6IHN0cmluZywgb3B0aW9ucz86IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvck9wdGlvbnMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmNvbGxlY3Rpb24ucHJlcGVuZCh2YXJpYWJsZSwgdmFsdWUsIG9wdGlvbnMsIHRoaXMuc2NvcGUpO1xuXHR9XG5cblx0Z2V0KHZhcmlhYmxlOiBzdHJpbmcpOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3IgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNvbGxlY3Rpb24uZ2V0KHZhcmlhYmxlLCB0aGlzLnNjb3BlKTtcblx0fVxuXG5cdGZvckVhY2goY2FsbGJhY2s6ICh2YXJpYWJsZTogc3RyaW5nLCBtdXRhdG9yOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3IsIGNvbGxlY3Rpb246IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbikgPT4gdW5rbm93biwgdGhpc0FyZz86IHVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLmNvbGxlY3Rpb24uZ2V0VmFyaWFibGVNYXAodGhpcy5zY29wZSkuZm9yRWFjaCgodmFsdWUsIHZhcmlhYmxlKSA9PiBjYWxsYmFjay5jYWxsKHRoaXNBcmcsIHZhcmlhYmxlLCB2YWx1ZSwgdGhpcyksIHRoaXMuc2NvcGUpO1xuXHR9XG5cblx0W1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmFibGVJdGVyYXRvcjxbdmFyaWFibGU6IHN0cmluZywgbXV0YXRvcjogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yXT4ge1xuXHRcdHJldHVybiB0aGlzLmNvbGxlY3Rpb24uZ2V0VmFyaWFibGVNYXAodGhpcy5zY29wZSkuZW50cmllcygpO1xuXHR9XG5cblx0ZGVsZXRlKHZhcmlhYmxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmNvbGxlY3Rpb24uZGVsZXRlKHZhcmlhYmxlLCB0aGlzLnNjb3BlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbGxlY3Rpb24uZmlyZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jb2xsZWN0aW9uLmNsZWFyKHRoaXMuc2NvcGUpO1xuXHR9XG5cblx0c2V0IGRlc2NyaXB0aW9uKGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLmNvbGxlY3Rpb24uc2V0RGVzY3JpcHRpb24oZGVzY3JpcHRpb24sIHRoaXMuc2NvcGUpO1xuXHR9XG5cblx0Z2V0IGRlc2NyaXB0aW9uKCk6IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY29sbGVjdGlvbi5nZXREZXNjcmlwdGlvbih0aGlzLnNjb3BlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgV29ya2VyRXh0SG9zdFRlcm1pbmFsU2VydmljZSBleHRlbmRzIEJhc2VFeHRIb3N0VGVybWluYWxTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNSZW1vdGVBdXRob3JpdHk6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0Q29tbWFuZHMgZXh0SG9zdENvbW1hbmRzOiBJRXh0SG9zdENvbW1hbmRzLFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdEluaXREYXRhU2VydmljZSBpbml0RGF0YTogSUV4dEhvc3RJbml0RGF0YVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZmFsc2UsIGV4dEhvc3RDb21tYW5kcywgZXh0SG9zdFJwYyk7XG5cdFx0dGhpcy5faGFzUmVtb3RlQXV0aG9yaXR5ID0gISFpbml0RGF0YS5yZW1vdGUuYXV0aG9yaXR5O1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZVRlcm1pbmFsKG5hbWU/OiBzdHJpbmcsIHNoZWxsUGF0aD86IHN0cmluZywgc2hlbGxBcmdzPzogc3RyaW5nW10gfCBzdHJpbmcpOiB2c2NvZGUuVGVybWluYWwge1xuXHRcdGlmICghdGhpcy5faGFzUmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHR0aHJvdyBuZXcgTm90U3VwcG9ydGVkRXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY3JlYXRlVGVybWluYWxGcm9tT3B0aW9ucyh7IG5hbWUsIHNoZWxsUGF0aCwgc2hlbGxBcmdzIH0pO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZVRlcm1pbmFsRnJvbU9wdGlvbnMob3B0aW9uczogdnNjb2RlLlRlcm1pbmFsT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSVRlcm1pbmFsSW50ZXJuYWxPcHRpb25zKTogdnNjb2RlLlRlcm1pbmFsIHtcblx0XHRpZiAoIXRoaXMuX2hhc1JlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0dGhyb3cgbmV3IE5vdFN1cHBvcnRlZEVycm9yKCk7XG5cdFx0fVxuXHRcdGNvbnN0IHRlcm1pbmFsID0gbmV3IEV4dEhvc3RUZXJtaW5hbCh0aGlzLl9wcm94eSwgZ2VuZXJhdGVVdWlkKCksIG9wdGlvbnMsIG9wdGlvbnMubmFtZSk7XG5cdFx0dGhpcy5fdGVybWluYWxzLnB1c2godGVybWluYWwpO1xuXHRcdHRlcm1pbmFsLmNyZWF0ZShvcHRpb25zLCB0aGlzLl9zZXJpYWxpemVQYXJlbnRUZXJtaW5hbChvcHRpb25zLCBpbnRlcm5hbE9wdGlvbnMpKTtcblx0XHRyZXR1cm4gdGVybWluYWwudmFsdWU7XG5cdH1cbn1cblxuZnVuY3Rpb24gYXNUZXJtaW5hbEljb24oaWNvblBhdGg/OiB2c2NvZGUuVXJpIHwgeyBsaWdodDogdnNjb2RlLlVyaTsgZGFyazogdnNjb2RlLlVyaSB9IHwgdnNjb2RlLlRoZW1lSWNvbik6IFRlcm1pbmFsSWNvbiB8IHVuZGVmaW5lZCB7XG5cdGlmICghaWNvblBhdGggfHwgdHlwZW9mIGljb25QYXRoID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRpZiAoIWhhc0tleShpY29uUGF0aCwgeyBpZDogdHJ1ZSB9KSkge1xuXHRcdHJldHVybiBpY29uUGF0aDtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0aWQ6IGljb25QYXRoLmlkLFxuXHRcdGNvbG9yOiBpY29uUGF0aC5jb2xvciBhcyBUaGVtZUNvbG9yXG5cdH07XG59XG5cbmZ1bmN0aW9uIGFzVGVybWluYWxDb2xvcihjb2xvcj86IHZzY29kZS5UaGVtZUNvbG9yKTogVGhlbWVDb2xvciB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBUaGVtZUNvbG9yLmlzVGhlbWVDb2xvcihjb2xvcikgPyBjb2xvciBhcyBUaGVtZUNvbG9yIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0TXV0YXRvcihtdXRhdG9yOiBJRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3IpOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3Ige1xuXHRjb25zdCBuZXdNdXRhdG9yID0geyAuLi5tdXRhdG9yIH07XG5cdGRlbGV0ZSBuZXdNdXRhdG9yLnNjb3BlO1xuXHRuZXdNdXRhdG9yLm9wdGlvbnMgPSBuZXdNdXRhdG9yLm9wdGlvbnMgPz8gdW5kZWZpbmVkO1xuXHRyZXR1cm4gbmV3TXV0YXRvciBhcyB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3I7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQWdCLGVBQWU7QUFDL0IsU0FBc0MsbUJBQW9UO0FBQzFWLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFzQixpQkFBaUIsWUFBWSx5QkFBeUI7QUFDNUUsU0FBUyxjQUFjLGtCQUFrQixzQ0FBa0Y7QUFFM0gsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQ0FBb0MsOENBQThDO0FBQzNGLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQStNLHFCQUE2RCx3QkFBd0I7QUFDcFMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyx3QkFBd0Isa0JBQWtCLGtCQUFrQjtBQUNyRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGNBQWM7QUFDdkIsU0FBUyw0QkFBNEI7QUFrRDlCLE1BQU0sMEJBQTBCLGdCQUF5Qyx5QkFBeUI7QUFFbEcsTUFBTSx3QkFBd0IsV0FBVztBQUFBLEVBbUIvQyxZQUNTLFFBQ0QsS0FDVSxrQkFDVCxPQUNQO0FBQ0QsVUFBTTtBQUxFO0FBQ0Q7QUFDVTtBQUNUO0FBdEJULFNBQVEsWUFBcUI7QUFNN0IsU0FBUSxTQUErQixFQUFFLGtCQUFrQixPQUFPLE9BQU8sT0FBVTtBQUtuRixTQUFPLFNBQWtCO0FBSXpCLFNBQW1CLGlCQUFpQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDdEUsU0FBUyxnQkFBZ0IsS0FBSyxlQUFlO0FBVTVDLFNBQUssbUJBQW1CLE9BQU8sT0FBTyxLQUFLLGdCQUFnQjtBQUMzRCxTQUFLLGNBQWMsSUFBSSxRQUE0QixPQUFLLEtBQUssc0JBQXNCLENBQUM7QUFFcEYsVUFBTSxPQUFPO0FBQ2IsU0FBSyxRQUFRO0FBQUEsTUFDWixJQUFJLE9BQWU7QUFDbEIsZUFBTyxLQUFLLFNBQVM7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsSUFBSSxZQUF5QztBQUM1QyxlQUFPLEtBQUs7QUFBQSxNQUNiO0FBQUEsTUFDQSxJQUFJLGtCQUFzRjtBQUN6RixlQUFPLEtBQUs7QUFBQSxNQUNiO0FBQUEsTUFDQSxJQUFJLGFBQW9EO0FBQ3ZELGVBQU8sS0FBSztBQUFBLE1BQ2I7QUFBQSxNQUNBLElBQUksUUFBOEI7QUFDakMsZUFBTyxLQUFLO0FBQUEsTUFDYjtBQUFBLE1BQ0EsSUFBSSxZQUFnQztBQUNuQyxlQUFPLEtBQUs7QUFBQSxNQUNiO0FBQUEsTUFDQSxJQUFJLG1CQUFnRTtBQUNuRSxlQUFPLEtBQUs7QUFBQSxNQUNiO0FBQUEsTUFDQSxTQUFTLE1BQWMsZ0JBQXlCLE1BQVk7QUFDM0QsYUFBSyxlQUFlO0FBQ3BCLGFBQUssT0FBTyxVQUFVLEtBQUssS0FBSyxNQUFNLGFBQWE7QUFBQSxNQUNwRDtBQUFBLE1BQ0EsS0FBSyxlQUE4QjtBQUNsQyxhQUFLLGVBQWU7QUFDcEIsYUFBSyxPQUFPLE1BQU0sS0FBSyxLQUFLLGFBQWE7QUFBQSxNQUMxQztBQUFBLE1BQ0EsT0FBYTtBQUNaLGFBQUssZUFBZTtBQUNwQixhQUFLLE9BQU8sTUFBTSxLQUFLLEdBQUc7QUFBQSxNQUMzQjtBQUFBLE1BQ0EsVUFBZ0I7QUFDZixZQUFJLENBQUMsS0FBSyxXQUFXO0FBQ3BCLGVBQUssWUFBWTtBQUNqQixlQUFLLE9BQU8sU0FBUyxLQUFLLEdBQUc7QUFBQSxRQUM5QjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksYUFBb0Q7QUFDdkQsWUFBSSxLQUFLLFVBQVUsVUFBYSxLQUFLLFVBQVUsUUFBVztBQUN6RCxpQkFBTztBQUFBLFFBQ1I7QUFDQSxlQUFPO0FBQUEsVUFDTixTQUFTLEtBQUs7QUFBQSxVQUNkLE1BQU0sS0FBSztBQUFBLFFBQ1o7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFNBQUssZUFBZSxLQUFLO0FBQ3pCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFBQSxFQUVBLE1BQWEsT0FDWixTQUNBLGlCQUNnQjtBQUNoQixRQUFJLE9BQU8sS0FBSyxRQUFRLFVBQVU7QUFDakMsWUFBTSxJQUFJLE1BQU0sbUNBQW1DO0FBQUEsSUFDcEQ7QUFDQSxVQUFNLEtBQUssT0FBTyxnQkFBZ0IsS0FBSyxLQUFLO0FBQUEsTUFDM0MsTUFBTSxRQUFRO0FBQUEsTUFDZCxXQUFXLFFBQVEsYUFBYTtBQUFBLE1BQ2hDLFdBQVcsUUFBUSxhQUFhO0FBQUEsTUFDaEMsS0FBSyxRQUFRLE9BQU8saUJBQWlCLE9BQU87QUFBQSxNQUM1QyxLQUFLLFFBQVEsT0FBTztBQUFBLE1BQ3BCLE1BQU0sZUFBZSxRQUFRLFFBQVEsS0FBSztBQUFBLE1BQzFDLE9BQU8sV0FBVyxhQUFhLFFBQVEsS0FBSyxJQUFJLFFBQVEsTUFBTSxLQUFLO0FBQUEsTUFDbkUsYUFBYSxRQUFRLFdBQVc7QUFBQSxNQUNoQyxXQUFXLFFBQVEsYUFBYTtBQUFBLE1BQ2hDLGNBQWMsUUFBUSxnQkFBZ0I7QUFBQSxNQUN0Qyx1QkFBdUIsaUJBQWlCLHlCQUF5QjtBQUFBLE1BQ2pFLG1CQUFtQixpQkFBaUIscUJBQXFCO0FBQUEsTUFDekQsMEJBQTBCO0FBQUEsTUFDMUIscUJBQXFCLGlCQUFpQix1QkFBdUI7QUFBQSxNQUM3RCxVQUFVLGlCQUFpQixZQUFZLEtBQUsseUJBQXlCLFFBQVEsVUFBVSxpQkFBaUIseUJBQXlCO0FBQUEsTUFDakksYUFBYSxRQUFRLGVBQWU7QUFBQSxNQUNwQyx1QkFBdUIsUUFBUSx5QkFBeUI7QUFBQSxNQUN4RCxlQUFlLFFBQVEsaUJBQWlCO0FBQUEsSUFDekMsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUdBLE1BQWEsd0JBQXdCLFVBQTBHLGlCQUE0QyxnQkFBNEMsVUFBeUIsT0FBb0IsdUJBQWdDLGVBQXlDO0FBQzVWLFFBQUksT0FBTyxLQUFLLFFBQVEsVUFBVTtBQUNqQyxZQUFNLElBQUksTUFBTSxtQ0FBbUM7QUFBQSxJQUNwRDtBQUNBLFVBQU0sS0FBSyxPQUFPLGdCQUFnQixLQUFLLEtBQUs7QUFBQSxNQUMzQyxNQUFNLEtBQUs7QUFBQSxNQUNYLDhCQUE4QjtBQUFBLE1BQzlCLE1BQU07QUFBQSxNQUNOLE9BQU8sV0FBVyxhQUFhLEtBQUssSUFBSSxNQUFNLEtBQUs7QUFBQSxNQUNuRCxVQUFVLGlCQUFpQixZQUFZLEtBQUsseUJBQXlCLFVBQVUsY0FBYztBQUFBLE1BQzdGLGFBQWE7QUFBQSxNQUNiLHVCQUF1Qix5QkFBeUI7QUFBQSxNQUNoRCxlQUFlLGlCQUFpQjtBQUFBLElBQ2pDLENBQUM7QUFFRCxRQUFJLE9BQU8sS0FBSyxRQUFRLFVBQVU7QUFDakMsWUFBTSxJQUFJLE1BQU0sMEJBQTBCO0FBQUEsSUFDM0M7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFUSx5QkFBeUIsVUFBMEcsZ0JBQXVMO0FBQ2pVLFFBQUksT0FBTyxhQUFhLFVBQVU7QUFDakMsVUFBSSxPQUFPLFVBQVUsRUFBRSxnQkFBZ0IsS0FBSyxDQUFDLEtBQUssU0FBUyxrQkFBa0IsZ0JBQWdCO0FBQzVGLGVBQU8sRUFBRSxlQUFlO0FBQUEsTUFDekI7QUFFQSxVQUFJLE9BQU8sVUFBVSxFQUFFLFlBQVksS0FBSyxDQUFDLEdBQUc7QUFDM0MsZUFBTyxFQUFFLFlBQVksV0FBVyxLQUFLLFNBQVMsVUFBVSxHQUFHLGVBQWUsU0FBUyxjQUFjO0FBQUEsTUFDbEc7QUFFQSxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxpQkFBaUI7QUFDeEIsUUFBSSxLQUFLLFdBQVc7QUFDbkIsWUFBTSxJQUFJLE1BQU0sb0NBQW9DO0FBQUEsSUFDckQ7QUFBQSxFQUNEO0FBQUEsRUFFQSxJQUFXLEtBQUssTUFBYztBQUM3QixTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQUEsRUFFTyxjQUFjLE1BQTBCLFFBQTRCO0FBQzFFLFNBQUssY0FBYyxPQUFPLE9BQU8sRUFBRSxNQUFNLE9BQU8sQ0FBQztBQUFBLEVBQ2xEO0FBQUEsRUFFTyxjQUFjLE1BQWMsTUFBdUI7QUFDekQsUUFBSSxTQUFTLEtBQUssU0FBUyxTQUFTLEtBQUssT0FBTztBQUUvQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksU0FBUyxLQUFLLFNBQVMsR0FBRztBQUM3QixhQUFPO0FBQUEsSUFDUjtBQUNBLFNBQUssUUFBUTtBQUNiLFNBQUssUUFBUTtBQUNiLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxvQkFBNkI7QUFDbkMsUUFBSSxDQUFDLEtBQUssT0FBTyxrQkFBa0I7QUFDbEMsV0FBSyxTQUFTO0FBQUEsUUFDYixHQUFHLEtBQUs7QUFBQSxRQUNSLGtCQUFrQjtBQUFBLE1BQ25CO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sYUFBYSxXQUFtRDtBQUV0RSxRQUFJLEtBQUssT0FBTyxVQUFVLFdBQVc7QUFDcEMsV0FBSyxTQUFTO0FBQUEsUUFDYixHQUFHLEtBQUs7QUFBQSxRQUNSLE9BQU87QUFBQSxNQUNSO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sYUFBYSxXQUFxQztBQUN4RCxTQUFLLGFBQWE7QUFBQSxFQUNuQjtBQUFBLEVBRU8sY0FBYyxXQUFxQztBQUV6RCxRQUFJLEtBQUsscUJBQXFCO0FBQzdCLFdBQUssb0JBQW9CLFNBQVM7QUFDbEMsV0FBSyxzQkFBc0I7QUFBQSxJQUM1QixPQUFPO0FBRU4sV0FBSyxZQUFZLEtBQUssU0FBTztBQUM1QixZQUFJLFFBQVEsV0FBVztBQUN0QixlQUFLLGNBQWMsUUFBUSxRQUFRLFNBQVM7QUFBQSxRQUM3QztBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLHNCQUF1RDtBQUFBLEVBYTVELFlBQTZCLE1BQTZCO0FBQTdCO0FBWjdCLFNBQVMsS0FBSztBQUNkLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQWlCLGlCQUFpQixJQUFJLFFBQWdCO0FBQ3RELFNBQWdCLGdCQUErQixLQUFLLGVBQWU7QUFDbkUsU0FBaUIsa0JBQWtCLElBQUksUUFBNEI7QUFFbkUsU0FBaUIsdUJBQXVCLElBQUksUUFBMEI7QUFDdEUsU0FBZ0Isc0JBQXNCLEtBQUsscUJBQXFCO0FBQ2hFLFNBQWlCLGlCQUFpQixJQUFJLFFBQTRCO0FBQ2xFLFNBQWdCLGdCQUEyQyxLQUFLLGVBQWU7QUFBQSxFQUVuQjtBQUFBLEVBTjVELElBQVcsaUJBQTRDO0FBQUUsV0FBTyxLQUFLLGdCQUFnQjtBQUFBLEVBQU87QUFBQSxFQVE1RixnQkFBK0MsVUFBZ0U7QUFDOUcsVUFBTSxJQUFJLE1BQU0sNkVBQTZFLFFBQVEsRUFBRTtBQUFBLEVBQ3hHO0FBQUEsRUFFQSxlQUE4QyxVQUErQixPQUE4QztBQUMxSCxVQUFNLElBQUksTUFBTSw0RUFBNEUsUUFBUSxZQUFZLEtBQUssRUFBRTtBQUFBLEVBQ3hIO0FBQUEsRUFFQSxNQUFNLFFBQTRCO0FBQ2pDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxXQUFpQjtBQUNoQixTQUFLLEtBQUssTUFBTTtBQUFBLEVBQ2pCO0FBQUEsRUFFQSxNQUFNLE1BQW9CO0FBQ3pCLFNBQUssS0FBSyxjQUFjLElBQUk7QUFBQSxFQUM3QjtBQUFBLEVBRUEsV0FBVyxRQUFzQjtBQUFBLEVBR2pDO0FBQUEsRUFFQSxPQUFPLE1BQWMsTUFBb0I7QUFDeEMsU0FBSyxLQUFLLGdCQUFnQixFQUFFLFNBQVMsTUFBTSxLQUFLLENBQUM7QUFBQSxFQUNsRDtBQUFBLEVBRUEsY0FBb0I7QUFBQSxFQUVwQjtBQUFBLEVBRUEsTUFBTSxjQUFjLE1BQTZCO0FBQUEsRUFFakQ7QUFBQSxFQUVBLHFCQUFxQixXQUF5QjtBQUFBLEVBRzlDO0FBQUEsRUFFQSxNQUFNLGtCQUFrQixTQUFvQztBQUFBLEVBRTVEO0FBQUEsRUFFQSxnQkFBaUM7QUFDaEMsV0FBTyxRQUFRLFFBQVEsRUFBRTtBQUFBLEVBQzFCO0FBQUEsRUFFQSxTQUEwQjtBQUN6QixXQUFPLFFBQVEsUUFBUSxFQUFFO0FBQUEsRUFDMUI7QUFBQSxFQUVBLG1CQUFtQixtQkFBNkQ7QUFFL0UsU0FBSyxLQUFLLFdBQVcsT0FBSyxLQUFLLGVBQWUsS0FBSyxDQUFDLENBQUM7QUFDckQsU0FBSyxLQUFLLGFBQWEsQ0FBQyxJQUFtQixXQUFjO0FBQ3hELFdBQUssZUFBZSxLQUFLLE1BQU0sU0FBUyxTQUFZLENBQUM7QUFBQSxJQUN0RCxDQUFDO0FBQ0QsU0FBSyxLQUFLLDBCQUEwQixPQUFLO0FBQ3hDLFVBQUksR0FBRztBQUNOLGFBQUsscUJBQXFCLEtBQUssRUFBRSxNQUFNLG9CQUFvQixvQkFBb0IsT0FBTyxFQUFFLE1BQU0sRUFBRSxTQUFTLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUFBLE1BQzFIO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSyxLQUFLLGtCQUFrQixXQUFTO0FBQ3BDLFdBQUsscUJBQXFCLEtBQUssRUFBRSxNQUFNLG9CQUFvQixPQUFPLE9BQU8sTUFBTSxDQUFDO0FBQUEsSUFDakYsQ0FBQztBQUVELFNBQUssS0FBSyxLQUFLLG9CQUFvQixvQkFBb0IsTUFBUztBQUVoRSxRQUFJLG1CQUFtQjtBQUN0QixXQUFLLEtBQUssZ0JBQWdCLGlCQUFpQjtBQUFBLElBQzVDO0FBRUEsU0FBSyxnQkFBZ0IsS0FBSyxFQUFFLEtBQUssSUFBSSxLQUFLLElBQUksWUFBWSxPQUFVLENBQUM7QUFBQSxFQUN0RTtBQUNEO0FBRUEsSUFBSSxhQUFhO0FBT1YsSUFBZSw2QkFBZixjQUFrRCxXQUEyRTtBQUFBLEVBbURuSSxZQUNDLG1CQUNtQyxrQkFDZixZQUNuQjtBQUNELFVBQU07QUFINkI7QUEvQ3BDLFNBQVUsYUFBZ0MsQ0FBQztBQUMzQyxTQUFVLHFCQUF5RCxvQkFBSSxJQUFJO0FBQzNFLFNBQVUsOEJBQTZELENBQUM7QUFDeEUsU0FBVSxrQ0FBMkgsQ0FBQztBQUN0SSxTQUFVLHVCQUErRSxDQUFDO0FBQzFGLFNBQVUsa0NBQXFGLG9CQUFJLElBQUk7QUFHdkcsU0FBaUIsd0JBQXdELEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBRy9HLFNBQWlCLGlCQUFtRCxvQkFBSSxJQUFJO0FBQzVFLFNBQWlCLHVCQUFzRyxvQkFBSSxJQUFJO0FBQy9ILFNBQWlCLG9CQUFpSCxvQkFBSSxJQUFJO0FBQzFJLFNBQWlCLHFCQUFtRSxvQkFBSSxJQUFJO0FBQzVGLFNBQWlCLHFCQUFpRSxvQkFBSSxJQUFJO0FBQzFGLFNBQWlCLGtDQUF3RSxvQkFBSSxJQUFJO0FBS2pHLFNBQW1CLHNCQUFzQixJQUFJLFFBQXlCO0FBQ3RFLFNBQVMscUJBQXFCLEtBQUssb0JBQW9CO0FBQ3ZELFNBQW1CLHFCQUFxQixJQUFJLFFBQXlCO0FBQ3JFLFNBQVMsb0JBQW9CLEtBQUssbUJBQW1CO0FBQ3JELFNBQW1CLDZCQUE2QixJQUFJLFFBQXFDO0FBQ3pGLFNBQVMsNEJBQTRCLEtBQUssMkJBQTJCO0FBQ3JFLFNBQW1CLGlDQUFpQyxJQUFJLFFBQThDO0FBQ3RHLFNBQVMsZ0NBQWdDLEtBQUssK0JBQStCO0FBQzdFLFNBQW1CLDRCQUE0QixJQUFJLFFBQXlCO0FBQzVFLFNBQVMsMkJBQTJCLEtBQUssMEJBQTBCO0FBQ25FLFNBQW1CLG9CQUFvQixJQUFJLFFBQWdCO0FBQzNELFNBQVMsbUJBQW1CLEtBQUssa0JBQWtCO0FBRW5ELFNBQW1CLDBCQUEwQixJQUFJLFFBQXVDO0FBQUEsTUFDdkYsd0JBQXdCLE1BQU0sS0FBSyxPQUFPLHdCQUF3QjtBQUFBLE1BQ2xFLHlCQUF5QixNQUFNLEtBQUssT0FBTyx1QkFBdUI7QUFBQSxJQUNuRSxDQUFDO0FBQ0QsU0FBUyx5QkFBeUIsS0FBSyx3QkFBd0I7QUFDL0QsU0FBbUIsdUJBQXVCLElBQUksUUFBd0M7QUFBQSxNQUNyRix3QkFBd0IsTUFBTSxLQUFLLE9BQU8sMkJBQTJCO0FBQUEsTUFDckUseUJBQXlCLE1BQU0sS0FBSyxPQUFPLDBCQUEwQjtBQUFBLElBQ3RFLENBQUM7QUFDRCxTQUFTLDhCQUE4QixLQUFLLHFCQUFxQjtBQVFoRSxTQUFLLFNBQVMsV0FBVyxTQUFTLFlBQVkseUJBQXlCO0FBQ3ZFLFNBQUssWUFBWSxJQUFJLHFCQUFxQixLQUFLLE9BQU8sZ0JBQWdCO0FBQ3RFLFNBQUssT0FBTyx3QkFBd0IsaUJBQWlCO0FBQ3JELFNBQUssaUJBQWlCLDBCQUEwQjtBQUFBLE1BQy9DLGlCQUFpQixTQUFPO0FBQ3ZCLGNBQU0sY0FBYyxDQUFDQSxTQUE0QztBQUNoRSxpQkFBTyxLQUFLLGdCQUFnQkEsS0FBSSxVQUFVLEdBQUc7QUFBQSxRQUM5QztBQUNBLGdCQUFRLEtBQUssTUFBTTtBQUFBLFVBQ2xCLEtBQUssYUFBYTtBQUFpQixtQkFBTyxZQUFZLEdBQUc7QUFBQSxVQUN6RCxTQUFTO0FBRVIsZ0JBQUksTUFBTSxRQUFRLEdBQUcsR0FBRztBQUN2Qix1QkFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLFFBQVEsS0FBSztBQUNwQyxvQkFBSSxJQUFJLENBQUMsRUFBRSxTQUFTLGFBQWEsaUJBQWlCO0FBQ2pELHNCQUFJLENBQUMsSUFBSSxZQUFZLElBQUksQ0FBQyxDQUFDO0FBQUEsZ0JBQzVCLE9BQU87QUFFTjtBQUFBLGdCQUNEO0FBQUEsY0FDRDtBQUFBLFlBQ0Q7QUFDQSxtQkFBTztBQUFBLFVBQ1I7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssVUFBVTtBQUFBLE1BQ2QsU0FBUyxNQUFNO0FBQ2QsbUJBQVcsQ0FBQyxHQUFHLGVBQWUsS0FBSyxLQUFLLG9CQUFvQjtBQUMzRCwwQkFBZ0IsU0FBUyxJQUFJO0FBQUEsUUFDOUI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBbkVBLElBQVcsaUJBQThDO0FBQUUsV0FBTyxLQUFLLGlCQUFpQjtBQUFBLEVBQU87QUFBQSxFQUMvRixJQUFXLFlBQStCO0FBQUUsV0FBTyxLQUFLLFdBQVcsSUFBSSxVQUFRLEtBQUssS0FBSztBQUFBLEVBQUc7QUFBQSxFQXVFckYsZ0JBQWdCLG9CQUFxQztBQUMzRCxVQUFNLFVBQVUscUJBQXFCLEtBQUssNEJBQTRCLEtBQUs7QUFDM0UsV0FBTyxTQUFTLFFBQVE7QUFBQSxFQUN6QjtBQUFBLEVBRU8sb0JBQW9CLG9CQUFnRDtBQUMxRSxVQUFNLFVBQVUscUJBQXFCLEtBQUssNEJBQTRCLEtBQUs7QUFDM0UsV0FBTyxTQUFTLFFBQVEsQ0FBQztBQUFBLEVBQzFCO0FBQUEsRUFFTyx3QkFBd0IsU0FBMEMsaUJBQTZEO0FBQ3JJLFVBQU0sV0FBVyxJQUFJLGdCQUFnQixLQUFLLFFBQVEsYUFBYSxHQUFHLFNBQVMsUUFBUSxJQUFJO0FBQ3ZGLFVBQU0sSUFBSSxJQUFJLHNCQUFzQixRQUFRLEdBQUc7QUFDL0MsYUFBUyx3QkFBd0IsUUFBUSxVQUFVLGlCQUFpQixLQUFLLHlCQUF5QixTQUFTLGVBQWUsRUFBRSwyQkFBMkIsZUFBZSxRQUFRLFFBQVEsR0FBRyxnQkFBZ0IsUUFBUSxLQUFLLEdBQUcsUUFBUSx1QkFBdUIsUUFBUSxhQUFhLEVBQUUsS0FBSyxRQUFNO0FBQ3pSLFlBQU0sYUFBYSxLQUFLLDhCQUE4QixJQUFJLENBQUM7QUFDM0QsV0FBSyw0QkFBNEIsRUFBRSxJQUFJO0FBQUEsSUFDeEMsQ0FBQztBQUNELFNBQUssV0FBVyxLQUFLLFFBQVE7QUFDN0IsV0FBTyxTQUFTO0FBQUEsRUFDakI7QUFBQSxFQUVVLHlCQUF5QixTQUFpQyxpQkFBc0U7QUFDekksc0JBQWtCLGtCQUFrQixrQkFBa0IsQ0FBQztBQUN2RCxRQUFJLFFBQVEsWUFBWSxPQUFPLFFBQVEsYUFBYSxZQUFZLE9BQU8sUUFBUSxVQUFVLEVBQUUsZ0JBQWdCLEtBQUssQ0FBQyxHQUFHO0FBQ25ILFlBQU0saUJBQWlCLFFBQVEsU0FBUztBQUN4QyxVQUFJLGdCQUFnQjtBQUNuQixjQUFNLHdCQUF3QixLQUFLLFdBQVcsS0FBSyxPQUFLLEVBQUUsVUFBVSxjQUFjO0FBQ2xGLFlBQUksdUJBQXVCO0FBQzFCLDBCQUFnQiw0QkFBNEIsc0JBQXNCO0FBQUEsUUFDbkU7QUFBQSxNQUNEO0FBQUEsSUFDRCxXQUFXLFFBQVEsWUFBWSxPQUFPLFFBQVEsYUFBYSxVQUFVO0FBQ3BFLHNCQUFnQixXQUFXLFFBQVE7QUFBQSxJQUNwQyxXQUFXLGdCQUFnQixZQUFZLE9BQU8sZ0JBQWdCLGFBQWEsWUFBWSxPQUFPLGdCQUFnQixVQUFVLEVBQUUscUJBQXFCLEtBQUssQ0FBQyxHQUFHO0FBQ3ZKLHNCQUFnQixXQUFXLEVBQUUscUJBQXFCLEtBQUs7QUFBQSxJQUN4RDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxvQkFBb0IsSUFBWSxLQUFrQztBQUN4RSxVQUFNLFdBQVcsS0FBSyxnQkFBZ0IsRUFBRTtBQUN4QyxRQUFJLENBQUMsVUFBVTtBQUNkLFlBQU0sSUFBSSxNQUFNLG1DQUFtQyxFQUFFLHNCQUFzQjtBQUFBLElBQzVFO0FBQ0EsVUFBTSxJQUFJLElBQUksc0JBQXNCLEdBQUc7QUFDdkMsVUFBTSxhQUFhLEtBQUssOEJBQThCLElBQUksQ0FBQztBQUMzRCxTQUFLLDRCQUE0QixFQUFFLElBQUk7QUFBQSxFQUN4QztBQUFBLEVBRUEsTUFBYSw2QkFBNkIsSUFBa0M7QUFDM0UsVUFBTSxXQUFXLEtBQUs7QUFDdEIsUUFBSSxPQUFPLE1BQU07QUFDaEIsV0FBSyxrQkFBa0I7QUFDdkIsVUFBSSxhQUFhLEtBQUssaUJBQWlCO0FBQ3RDLGFBQUssMkJBQTJCLEtBQUssS0FBSyxlQUFlO0FBQUEsTUFDMUQ7QUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVcsS0FBSyxnQkFBZ0IsRUFBRTtBQUN4QyxRQUFJLFVBQVU7QUFDYixXQUFLLGtCQUFrQjtBQUN2QixVQUFJLGFBQWEsS0FBSyxpQkFBaUI7QUFDdEMsYUFBSywyQkFBMkIsS0FBSyxLQUFLLGdCQUFnQixLQUFLO0FBQUEsTUFDaEU7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYSwyQkFBMkIsSUFBWSxNQUE2QjtBQUNoRixVQUFNLFdBQVcsS0FBSyxnQkFBZ0IsRUFBRTtBQUN4QyxRQUFJLFVBQVU7QUFDYixXQUFLLHdCQUF3QixLQUFLLEVBQUUsVUFBVSxTQUFTLE9BQU8sS0FBSyxDQUFDO0FBQUEsSUFDckU7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFhLDBCQUEwQixJQUFZLE1BQWMsTUFBNkI7QUFDN0YsVUFBTSxXQUFXLEtBQUssZ0JBQWdCLEVBQUU7QUFDeEMsUUFBSSxVQUFVO0FBQ2IsVUFBSSxTQUFTLGNBQWMsTUFBTSxJQUFJLEdBQUc7QUFDdkMsYUFBSywrQkFBK0IsS0FBSztBQUFBLFVBQ3hDLFVBQVUsU0FBUztBQUFBLFVBQ25CLFlBQVksU0FBUyxNQUFNO0FBQUEsUUFDNUIsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYSx5QkFBeUIsSUFBWSxTQUE2QztBQUM5RixVQUFNLFdBQVcsS0FBSyxnQkFBZ0IsRUFBRTtBQUN4QyxRQUFJLFVBQVU7QUFDYixXQUFLLHFCQUFxQixLQUFLLEVBQUUsVUFBVSxTQUFTLE9BQU8sR0FBRyxRQUFRLENBQUM7QUFBQSxJQUN4RTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWEsaUNBQWlDLElBQVksTUFBYyxNQUE2QjtBQUdwRyxTQUFLLG1CQUFtQixJQUFJLEVBQUUsR0FBRyxPQUFPLE1BQU0sSUFBSTtBQUFBLEVBQ25EO0FBQUEsRUFFQSxNQUFhLDJCQUEyQixJQUFZLE1BQTZCO0FBQ2hGLFVBQU0sV0FBVyxLQUFLLGdCQUFnQixFQUFFO0FBQ3hDLFFBQUksVUFBVTtBQUNiLGVBQVMsT0FBTztBQUFBLElBQ2pCO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYSxzQkFBc0IsSUFBWSxVQUE4QixZQUErQztBQUUzSCxTQUFLLG1CQUFtQixPQUFPLEVBQUU7QUFDakMsVUFBTSxxQkFBcUIsS0FBSyxnQ0FBZ0MsSUFBSSxFQUFFO0FBQ3RFLFFBQUksb0JBQW9CO0FBQ3ZCLFdBQUssZ0NBQWdDLE9BQU8sRUFBRTtBQUM5Qyx5QkFBbUIsUUFBUSxJQUFJO0FBQUEsSUFDaEM7QUFFQSxVQUFNLFFBQVEsS0FBSyw0QkFBNEIsS0FBSyxZQUFZLEVBQUU7QUFDbEUsUUFBSSxVQUFVLE1BQU07QUFDbkIsWUFBTSxXQUFXLEtBQUssV0FBVyxPQUFPLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFDbkQsZUFBUyxjQUFjLFVBQVUsVUFBVTtBQUMzQyxXQUFLLG9CQUFvQixLQUFLLFNBQVMsS0FBSztBQUFBLElBQzdDO0FBQUEsRUFDRDtBQUFBLEVBRU8sc0JBQXNCLElBQVksbUJBQXVDLE1BQWMsc0JBQW1EO0FBQ2hKLFFBQUksbUJBQW1CO0FBRXRCLFlBQU0sUUFBUSxLQUFLLDRCQUE0QixLQUFLLFlBQVksaUJBQWlCO0FBQ2pGLFVBQUksVUFBVSxNQUFNO0FBRW5CLGFBQUssV0FBVyxLQUFLLEVBQUUsTUFBTTtBQUM3QixhQUFLLG1CQUFtQixLQUFLLEtBQUssVUFBVSxLQUFLLENBQUM7QUFDbEQsYUFBSyxXQUFXLEtBQUssRUFBRSxTQUFTO0FBQ2hDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLGtCQUEwQztBQUFBLE1BQy9DLE1BQU0scUJBQXFCO0FBQUEsTUFDM0IsV0FBVyxxQkFBcUI7QUFBQSxNQUNoQyxXQUFXLHFCQUFxQjtBQUFBLE1BQ2hDLEtBQUssT0FBTyxxQkFBcUIsUUFBUSxXQUFXLHFCQUFxQixNQUFNLElBQUksT0FBTyxxQkFBcUIsR0FBRztBQUFBLE1BQ2xILEtBQUsscUJBQXFCO0FBQUEsTUFDMUIsY0FBYyxxQkFBcUI7QUFBQSxNQUNuQyxlQUFlLHFCQUFxQjtBQUFBLElBQ3JDO0FBQ0EsVUFBTSxXQUFXLElBQUksZ0JBQWdCLEtBQUssUUFBUSxJQUFJLGlCQUFpQixJQUFJO0FBQzNFLFNBQUssV0FBVyxLQUFLLFFBQVE7QUFDN0IsU0FBSyxtQkFBbUIsS0FBSyxTQUFTLEtBQUs7QUFDM0MsYUFBUyxTQUFTO0FBQUEsRUFDbkI7QUFBQSxFQUVBLE1BQWEseUJBQXlCLElBQVksV0FBa0M7QUFDbkYsVUFBTSxXQUFXLEtBQUssZ0JBQWdCLEVBQUU7QUFDeEMsY0FBVSxjQUFjLFNBQVM7QUFBQSxFQUNsQztBQUFBLEVBRUEsTUFBYSx3QkFBd0IsSUFBWSxtQkFBa0c7QUFHbEosVUFBTSxXQUFXLEtBQUssZ0JBQWdCLEVBQUU7QUFDeEMsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPLEVBQUUsU0FBUyxTQUFTLGlDQUFpQyxpRUFBaUUsRUFBRSxFQUFFO0FBQUEsSUFDbEk7QUFHQSxRQUFJLENBQUMsU0FBUyxRQUFRO0FBQ3JCLFlBQU0sSUFBSSxRQUFjLE9BQUs7QUFFNUIsY0FBTSxXQUFXLEtBQUssa0JBQWtCLE9BQU0sTUFBSztBQUNsRCxjQUFJLE1BQU0sU0FBUyxPQUFPO0FBQ3pCLHFCQUFTLFFBQVE7QUFDakIsY0FBRTtBQUFBLFVBQ0g7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGO0FBRUEsVUFBTSxrQkFBa0IsS0FBSyxtQkFBbUIsSUFBSSxFQUFFO0FBQ3RELFFBQUksaUJBQWlCO0FBQ3BCLE1BQUMsZ0JBQTBDLG1CQUFtQixpQkFBaUI7QUFBQSxJQUNoRixPQUFPO0FBRU4sV0FBSyxnQ0FBZ0MsRUFBRSxJQUFJLEVBQUUsa0JBQWtCO0FBQUEsSUFDaEU7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVUsOEJBQThCLElBQVksR0FBdUM7QUFDMUYsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLGdCQUFZLElBQUksRUFBRSxlQUFlLE9BQUssS0FBSyxPQUFPLGtCQUFrQixJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxVQUFVLENBQUMsQ0FBQztBQUNwRyxnQkFBWSxJQUFJLEVBQUUsb0JBQW9CLGNBQVksS0FBSyxPQUFPLHFCQUFxQixJQUFJLFFBQVEsQ0FBQyxDQUFDO0FBR2pHLFNBQUssVUFBVSxlQUFlLElBQUksRUFBRSxhQUFhO0FBQ2pELGdCQUFZLElBQUksRUFBRSxjQUFjLGNBQVksS0FBSyxlQUFlLElBQUksUUFBUSxDQUFDLENBQUM7QUFDOUUsU0FBSyxtQkFBbUIsSUFBSSxJQUFJLENBQUM7QUFFakMsVUFBTSxnQkFBZ0IsS0FBSyxnQ0FBZ0MsRUFBRTtBQUM3RCxRQUFJLGlCQUFpQixhQUFhLHVCQUF1QjtBQUN4RCxRQUFFLG1CQUFtQixjQUFjLGlCQUFpQjtBQUNwRCxhQUFPLEtBQUssZ0NBQWdDLEVBQUU7QUFBQSxJQUMvQztBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTywyQkFBMkIsSUFBWSxXQUF5QjtBQUN0RSxTQUFLLG1CQUFtQixJQUFJLEVBQUUsR0FBRyxxQkFBcUIsU0FBUztBQUFBLEVBQ2hFO0FBQUEsRUFFTyxvQkFBb0IsSUFBWSxNQUFvQjtBQUMxRCxTQUFLLG1CQUFtQixJQUFJLEVBQUUsR0FBRyxNQUFNLElBQUk7QUFBQSxFQUM1QztBQUFBLEVBRU8sMkJBQTJCLElBQWtCO0FBQ25ELFVBQU0sV0FBVyxLQUFLLGdCQUFnQixFQUFFO0FBQ3hDLFFBQUksVUFBVSxrQkFBa0IsR0FBRztBQUNsQyxXQUFLLDBCQUEwQixLQUFLLFNBQVMsS0FBSztBQUFBLElBQ25EO0FBQUEsRUFDRDtBQUFBLEVBRU8seUJBQXlCLElBQVksV0FBcUM7QUFDaEYsU0FBSyxnQkFBZ0IsRUFBRSxHQUFHLGFBQWEsU0FBUztBQUFBLEVBQ2pEO0FBQUEsRUFFTyxxQkFBcUIsSUFBWSxNQUFjLE1BQW9CO0FBQ3pFLFFBQUk7QUFDSCxXQUFLLG1CQUFtQixJQUFJLEVBQUUsR0FBRyxPQUFPLE1BQU0sSUFBSTtBQUFBLElBQ25ELFNBQVMsT0FBTztBQUVmLFVBQUksTUFBTSxTQUFTLFdBQVcsTUFBTSxTQUFTLDBCQUEwQjtBQUN0RSxjQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyx1QkFBdUIsSUFBWSxXQUEwQjtBQUNuRSxTQUFLLG1CQUFtQixJQUFJLEVBQUUsR0FBRyxTQUFTLFNBQVM7QUFBQSxFQUNwRDtBQUFBLEVBRU8sZ0NBQWdDLElBQWtCO0FBQ3hELFNBQUssbUJBQW1CLElBQUksRUFBRSxHQUFHLGNBQWMsRUFBRSxLQUFLLGdCQUFjLEtBQUssT0FBTyxxQkFBcUIsSUFBSSxFQUFFLE1BQU0sb0JBQW9CLFlBQVksT0FBTyxXQUFXLENBQUMsQ0FBQztBQUFBLEVBQ3RLO0FBQUEsRUFFTyx5QkFBeUIsSUFBa0I7QUFDakQsU0FBSyxtQkFBbUIsSUFBSSxFQUFFLEdBQUcsT0FBTyxFQUFFLEtBQUssU0FBTyxLQUFLLE9BQU8scUJBQXFCLElBQUksRUFBRSxNQUFNLG9CQUFvQixLQUFLLE9BQU8sSUFBSSxDQUFDLENBQUM7QUFBQSxFQUMxSTtBQUFBLEVBRU8sNkJBQTZCLElBQTZCO0FBQ2hFLFdBQU8sUUFBUSxRQUFRLEVBQUU7QUFBQSxFQUMxQjtBQUFBLEVBR08sd0JBQXdCLFdBQWtDLElBQVksVUFBNkQ7QUFDekksUUFBSSxLQUFLLGtCQUFrQixJQUFJLEVBQUUsR0FBRztBQUNuQyxZQUFNLElBQUksTUFBTSw4QkFBOEIsRUFBRSxzQkFBc0I7QUFBQSxJQUN2RTtBQUNBLFNBQUssa0JBQWtCLElBQUksSUFBSSxFQUFFLFVBQVUsVUFBVSxDQUFDO0FBQ3RELFNBQUssT0FBTyx5QkFBeUIsSUFBSSxVQUFVLFdBQVcsS0FBSztBQUNuRSxXQUFPLElBQUksaUJBQWlCLE1BQU07QUFDakMsV0FBSyxrQkFBa0IsT0FBTyxFQUFFO0FBQ2hDLFdBQUssT0FBTywyQkFBMkIsRUFBRTtBQUFBLElBQzFDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFTyxtQ0FBbUMsV0FBa0MsYUFBd0UsbUJBQWdEO0FBQ25NLFFBQUksS0FBSyxxQkFBcUIsSUFBSSxVQUFVLFdBQVcsS0FBSyxHQUFHO0FBQzlELFlBQU0sSUFBSSxNQUFNLGlDQUFpQyxVQUFVLFdBQVcsS0FBSyxzQkFBc0I7QUFBQSxJQUNsRztBQUNBLFNBQUsscUJBQXFCLElBQUksVUFBVSxXQUFXLE9BQU8sUUFBUTtBQUNsRSxTQUFLLE9BQU8sNEJBQTRCLFVBQVUsV0FBVyxPQUFPLFVBQVUsV0FBVyxPQUFPLEdBQUcsaUJBQWlCO0FBQ3BILFdBQU8sSUFBSSxpQkFBaUIsTUFBTTtBQUNqQyxXQUFLLHFCQUFxQixPQUFPLFVBQVUsV0FBVyxLQUFLO0FBQzNELFdBQUssT0FBTyw4QkFBOEIsVUFBVSxXQUFXLEtBQUs7QUFBQSxJQUNyRSxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYSw0QkFBNEIsSUFBWSxTQUF3RjtBQUM1SSxVQUFNLFFBQVEsSUFBSSx3QkFBd0IsRUFBRTtBQUM1QyxRQUFJLE1BQU0sMkJBQTJCLENBQUMsS0FBSyxnQkFBZ0I7QUFDMUQsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFdBQVcsS0FBSyxxQkFBcUIsSUFBSSxFQUFFO0FBQ2pELFFBQUksQ0FBQyxVQUFVO0FBQ2Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxjQUFjLE1BQU0sU0FBUywyQkFBMkIsS0FBSyxnQkFBZ0IsU0FBUyxLQUFLO0FBQ2pHLFFBQUksZ0JBQWdCLFFBQVEsZ0JBQWdCLFFBQVc7QUFDdEQsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLGdCQUFnQixDQUFDLGFBQWEsS0FBSyxlQUFlLE9BQU8sVUFBVSxpQkFBaUIsVUFBVSxNQUFNO0FBQzFHLFdBQU8sdUJBQXVCLEtBQUssYUFBYSxhQUFhO0FBQUEsRUFDOUQ7QUFBQSxFQUVPLHlCQUF5QixJQUFZLFdBQWdEO0FBQzNGLFVBQU0sV0FBVyxLQUFLLGdCQUFnQixFQUFFO0FBQ3hDLFFBQUksVUFBVSxhQUFhLFNBQVMsR0FBRztBQUN0QyxXQUFLLDBCQUEwQixLQUFLLFNBQVMsS0FBSztBQUFBLElBQ25EO0FBQUEsRUFDRDtBQUFBLEVBRU8saUNBQWlDLElBQVksYUFBcUIsVUFBOEQ7QUFDdEksUUFBSSxLQUFLLG1CQUFtQixJQUFJLEVBQUUsR0FBRztBQUNwQyxZQUFNLElBQUksTUFBTSxnQ0FBZ0MsRUFBRSx5QkFBeUI7QUFBQSxJQUM1RTtBQUNBLFNBQUssbUJBQW1CLElBQUksSUFBSSxRQUFRO0FBQ3hDLFNBQUssT0FBTywwQkFBMEIsSUFBSSxXQUFXO0FBQ3JELFdBQU8sSUFBSSxpQkFBaUIsTUFBTTtBQUNqQyxXQUFLLG1CQUFtQixPQUFPLEVBQUU7QUFDakMsV0FBSyxPQUFPLDRCQUE0QixFQUFFO0FBQUEsSUFDM0MsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWEsMkJBQTJCLElBQVksYUFBc087QUFDelIsVUFBTSxRQUFRLElBQUksd0JBQXdCLEVBQUU7QUFDNUMsUUFBSSxNQUFNLHlCQUF5QjtBQUNsQztBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVcsS0FBSyxtQkFBbUIsSUFBSSxFQUFFO0FBQy9DLFFBQUksQ0FBQyxVQUFVO0FBQ2Q7QUFBQSxJQUNEO0FBQ0EsVUFBTSxhQUFhLE1BQU0sU0FBUywwQkFBMEIsYUFBYSxLQUFLO0FBQzlFLFFBQUksZUFBZSxRQUFTLE1BQU0sUUFBUSxVQUFVLEtBQUssV0FBVyxXQUFXLEdBQUk7QUFDbEYsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsU0FBSyxzQkFBc0IsUUFBUTtBQUduQyxRQUFJLENBQUMsTUFBTSxRQUFRLFVBQVUsR0FBRztBQUMvQixhQUFPLGFBQWEsaUJBQWlCLEtBQUssWUFBWSxLQUFLLGlCQUFpQixXQUFXLEtBQUssSUFBSTtBQUFBLElBQ2pHO0FBR0EsVUFBTSxTQUFTLENBQUM7QUFDaEIsZUFBVyxPQUFPLFlBQVk7QUFDN0IsWUFBTSxZQUFZLGlCQUFpQixLQUFLLEtBQUssS0FBSyxpQkFBaUIsV0FBVyxLQUFLO0FBQ25GLFVBQUksV0FBVztBQUNkLGVBQU8sS0FBSyxTQUFTO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWEsa0NBQWtDLElBQVksU0FBa0U7QUFDNUgsVUFBTSxRQUFRLElBQUksd0JBQXdCLEVBQUU7QUFDNUMsVUFBTSxzQkFBc0IsS0FBSyxrQkFBa0IsSUFBSSxFQUFFO0FBQ3pELFFBQUksQ0FBQyxxQkFBcUI7QUFDekIsWUFBTSxJQUFJLE1BQU0sbURBQW1ELEVBQUUsR0FBRztBQUFBLElBQ3pFO0FBQ0EsUUFBSSxVQUFVLE1BQU0sb0JBQW9CLFNBQVMsdUJBQXVCLEtBQUs7QUFDN0UsUUFBSSxNQUFNLHlCQUF5QjtBQUNsQztBQUFBLElBQ0Q7QUFDQSxRQUFJLFdBQVcsQ0FBQyxPQUFPLFNBQVMsRUFBRSxTQUFTLEtBQUssQ0FBQyxHQUFHO0FBQ25ELGdCQUFVLEVBQUUsU0FBUyxRQUFRO0FBQUEsSUFDOUI7QUFFQSxRQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sU0FBUyxFQUFFLFNBQVMsS0FBSyxDQUFDLEdBQUc7QUFDcEQsWUFBTSxJQUFJLE1BQU0sZ0RBQWdELEVBQUUsR0FBRztBQUFBLElBQ3RFO0FBRUEsVUFBTSwyQkFBMkIscUJBQXFCLG9CQUFvQixXQUFXLGVBQWU7QUFDcEcsUUFBSSxDQUFDLDRCQUE0QixRQUFRLFFBQVEsa0JBQWtCLFFBQVc7QUFDN0UsY0FBUSxNQUFNLElBQUksb0JBQW9CLFVBQVUsV0FBVyxLQUFLLGlJQUFpSTtBQUNqTSxnQkFBVSxFQUFFLFNBQVMsRUFBRSxHQUFHLFFBQVEsU0FBUyxlQUFlLE9BQVUsRUFBRTtBQUFBLElBQ3ZFO0FBR0EsUUFBSSxDQUFDLDRCQUE0QixRQUFRLGtCQUFrQixRQUFXO0FBQ3JFLGNBQVEsTUFBTSxJQUFJLG9CQUFvQixVQUFVLFdBQVcsS0FBSyxzSUFBc0k7QUFBQSxJQUN2TTtBQUVBLFVBQU0saUJBQWlCLDRCQUE0QixRQUFRLGlCQUFpQixDQUFDLFFBQVEsUUFBUSxnQkFDMUYsRUFBRSxHQUFHLFFBQVEsU0FBUyxlQUFlLFFBQVEsY0FBYyxJQUMzRCxRQUFRO0FBRVgsUUFBSSxPQUFPLGdCQUFnQixFQUFFLEtBQUssS0FBSyxDQUFDLEdBQUc7QUFDMUMsV0FBSyx3QkFBd0IsZ0JBQWdCLE9BQU87QUFDcEQ7QUFBQSxJQUNEO0FBQ0EsU0FBSywwQkFBMEIsZ0JBQWdCLE9BQU87QUFBQSxFQUN2RDtBQUFBLEVBRU8scUJBQXFCLFVBQTBEO0FBQ3JGLFNBQUssZUFBZSxJQUFJLFFBQVE7QUFDaEMsUUFBSSxLQUFLLGVBQWUsU0FBUyxHQUFHO0FBQ25DLFdBQUssT0FBTyxtQkFBbUI7QUFBQSxJQUNoQztBQUNBLFdBQU8sSUFBSSxpQkFBaUIsTUFBTTtBQUNqQyxXQUFLLGVBQWUsT0FBTyxRQUFRO0FBQ25DLFVBQUksS0FBSyxlQUFlLFNBQVMsR0FBRztBQUNuQyxhQUFLLE9BQU8sa0JBQWtCO0FBQUEsTUFDL0I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFhLGNBQWMsWUFBb0IsTUFBMkM7QUFDekYsVUFBTSxXQUFXLEtBQUssZ0JBQWdCLFVBQVU7QUFDaEQsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPLENBQUM7QUFBQSxJQUNUO0FBSUEsU0FBSyxtQkFBbUIsT0FBTyxVQUFVO0FBRXpDLFVBQU0sV0FBVyxLQUFLLGdDQUFnQyxJQUFJLFVBQVU7QUFDcEUsY0FBVSxRQUFRLElBQUk7QUFDdEIsVUFBTSxxQkFBcUIsSUFBSSx3QkFBd0I7QUFDdkQsU0FBSyxnQ0FBZ0MsSUFBSSxZQUFZLGtCQUFrQjtBQUV2RSxVQUFNLFNBQTZCLENBQUM7QUFDcEMsVUFBTSxVQUFzQyxFQUFFLFVBQVUsU0FBUyxPQUFPLEtBQUs7QUFDN0UsVUFBTSxXQUE2RyxDQUFDO0FBRXBILGVBQVcsWUFBWSxLQUFLLGdCQUFnQjtBQUMzQyxlQUFTLEtBQUssU0FBUyxjQUFjLE9BQU0sTUFBSztBQUMvQyxjQUFNLHFCQUFxQixtQkFBbUIsTUFBTSx3QkFBd0IsTUFBTSxFQUFFLEVBQUUsVUFBVSxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUcsWUFBSTtBQUNILGdCQUFNLFFBQVMsTUFBTSxTQUFTLHFCQUFxQixTQUFTLG1CQUFtQixLQUFLLEtBQU0sQ0FBQztBQUMzRixjQUFJLENBQUMsbUJBQW1CLE1BQU0seUJBQXlCO0FBQ3RELGNBQUUsRUFBRSxVQUFVLE1BQU0sQ0FBQztBQUFBLFVBQ3RCO0FBQUEsUUFDRCxVQUFFO0FBQ0QsNkJBQW1CLFFBQVE7QUFBQSxRQUM1QjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUVBLFVBQU0saUJBQWlCLE1BQU0sUUFBUSxJQUFJLFFBQVE7QUFFakQsUUFBSSxtQkFBbUIsTUFBTSx5QkFBeUI7QUFDckQsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFVBQU0sZUFBZSxvQkFBSSxJQUE4QjtBQUN2RCxlQUFXLGlCQUFpQixnQkFBZ0I7QUFDM0MsVUFBSSxpQkFBaUIsY0FBYyxNQUFNLFNBQVMsR0FBRztBQUNwRCxlQUFPLEtBQUssR0FBRyxjQUFjLE1BQU0sSUFBSSxrQkFBZ0I7QUFDdEQsZ0JBQU0sT0FBTztBQUFBLFlBQ1osSUFBSTtBQUFBLFlBQ0osWUFBWSxhQUFhO0FBQUEsWUFDekIsUUFBUSxhQUFhO0FBQUEsWUFDckIsT0FBTyxhQUFhO0FBQUEsVUFDckI7QUFDQSx1QkFBYSxJQUFJLEtBQUssSUFBSTtBQUFBLFlBQ3pCLFVBQVUsY0FBYztBQUFBLFlBQ3hCLE1BQU07QUFBQSxVQUNQLENBQUM7QUFDRCxpQkFBTztBQUFBLFFBQ1IsQ0FBQyxDQUFDO0FBQUEsTUFDSDtBQUFBLElBQ0Q7QUFFQSxTQUFLLG1CQUFtQixJQUFJLFlBQVksWUFBWTtBQUVwRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsY0FBYyxZQUFvQixRQUFzQjtBQUN2RCxVQUFNLGFBQWEsS0FBSyxtQkFBbUIsSUFBSSxVQUFVLEdBQUcsSUFBSSxNQUFNO0FBQ3RFLFFBQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsSUFDRDtBQUNBLGVBQVcsU0FBUyxtQkFBbUIsV0FBVyxJQUFJO0FBQUEsRUFDdkQ7QUFBQSxFQUVRLGVBQWUsSUFBWSxVQUFvQztBQUN0RSxTQUFLLFVBQVUsY0FBYyxFQUFFO0FBRy9CLFNBQUssbUJBQW1CLE9BQU8sRUFBRTtBQUNqQyxXQUFPLEtBQUssZ0NBQWdDLEVBQUU7QUFHOUMsVUFBTSxtQkFBbUIsS0FBSyw0QkFBNEIsRUFBRTtBQUM1RCxRQUFJLGtCQUFrQjtBQUNyQix1QkFBaUIsUUFBUTtBQUN6QixhQUFPLEtBQUssNEJBQTRCLEVBQUU7QUFBQSxJQUMzQztBQUVBLFNBQUssT0FBTyxpQkFBaUIsSUFBSSxRQUFRO0FBQUEsRUFDMUM7QUFBQSxFQUVPLGdCQUFnQixJQUFvQztBQUMxRCxXQUFPLEtBQUssdUJBQXVCLEtBQUssWUFBWSxFQUFFO0FBQUEsRUFDdkQ7QUFBQSxFQUVPLHlCQUF5QixVQUEwQztBQUN6RSxVQUFNLFFBQVEsS0FBSyxXQUFXLFVBQVUsVUFBUTtBQUMvQyxhQUFPLEtBQUssVUFBVTtBQUFBLElBQ3ZCLENBQUM7QUFDRCxXQUFPLFNBQVMsSUFBSSxRQUFRO0FBQUEsRUFDN0I7QUFBQSxFQUVRLHVCQUFrRCxPQUFZLElBQXNCO0FBQzNGLFVBQU0sUUFBUSxLQUFLLDRCQUE0QixPQUFPLEVBQUU7QUFDeEQsV0FBTyxVQUFVLE9BQU8sTUFBTSxLQUFLLElBQUk7QUFBQSxFQUN4QztBQUFBLEVBRVEsNEJBQXVELE9BQVksSUFBOEM7QUFDeEgsVUFBTSxRQUFRLE1BQU0sVUFBVSxVQUFRO0FBQ3JDLGFBQU8sS0FBSyxRQUFRO0FBQUEsSUFDckIsQ0FBQztBQUNELFdBQU8sU0FBUyxJQUFJLFFBQVE7QUFBQSxFQUM3QjtBQUFBLEVBRU8saUNBQWlDLFdBQWtFO0FBQ3pHLFFBQUksYUFBYSxLQUFLLGdDQUFnQyxJQUFJLFVBQVUsV0FBVyxLQUFLO0FBQ3BGLFFBQUksQ0FBQyxZQUFZO0FBQ2hCLG1CQUFhLEtBQUssVUFBVSxJQUFJLHFDQUFxQyxDQUFDO0FBQ3RFLFdBQUssa0NBQWtDLFVBQVUsV0FBVyxPQUFPLFVBQVU7QUFBQSxJQUM5RTtBQUNBLFdBQU8sV0FBVyx1Q0FBdUMsTUFBUztBQUFBLEVBQ25FO0FBQUEsRUFFUSxtQ0FBbUMscUJBQTZCLFlBQXdEO0FBQy9ILFVBQU0sYUFBYSx1Q0FBdUMsV0FBVyxHQUFHO0FBQ3hFLFVBQU0sd0JBQXdCLG1DQUFtQyxXQUFXLGNBQWM7QUFDMUYsU0FBSyxPQUFPLGtDQUFrQyxxQkFBcUIsV0FBVyxZQUFZLFdBQVcsV0FBVyxJQUFJLFNBQVksWUFBWSxxQkFBcUI7QUFBQSxFQUNsSztBQUFBLEVBRU8sb0NBQW9DLGFBQTJFO0FBQ3JILGdCQUFZLFFBQVEsV0FBUztBQUM1QixZQUFNLHNCQUFzQixNQUFNLENBQUM7QUFDbkMsWUFBTSxhQUFhLEtBQUssVUFBVSxJQUFJLHFDQUFxQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQ3BGLFdBQUssa0NBQWtDLHFCQUFxQixVQUFVO0FBQUEsSUFDdkUsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVPLHNCQUFzQixTQUEyQixtQkFBMkM7QUFDbEcsVUFBTSxhQUFhLEtBQUs7QUFDeEIsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyw0QkFBNEI7QUFDakMsUUFBSSxZQUFZLFNBQVMsUUFBUSxNQUFNO0FBQ3RDLFdBQUssa0JBQWtCLEtBQUssUUFBUSxJQUFJO0FBQUEsSUFDekM7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQ0FBa0MscUJBQTZCLFlBQXdEO0FBQzlILFNBQUssZ0NBQWdDLElBQUkscUJBQXFCLFVBQVU7QUFDeEUsU0FBSyxVQUFVLFdBQVcsc0JBQXNCLE1BQU07QUFLckQsV0FBSyxtQ0FBbUMscUJBQXFCLFVBQVU7QUFBQSxJQUN4RSxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQ0Q7QUEzb0JzQiw2QkFBZjtBQUFBLEVBcURKO0FBQUEsRUFDQTtBQUFBLEdBdERtQjtBQWdwQnRCLE1BQU0sNkNBQTZDLFdBQVc7QUFBQSxFQWU3RCxZQUNDLFlBQ0M7QUFDRCxVQUFNO0FBakJQLFNBQVMsTUFBZ0Qsb0JBQUksSUFBSTtBQUNqRSxTQUFpQixvQkFBc0Usb0JBQUksSUFBSTtBQUMvRixTQUFTLGlCQUF5RSxvQkFBSSxJQUFJO0FBQzFGLFNBQVEsY0FBdUI7QUFRL0IsU0FBbUIseUJBQXdDLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQU81RixTQUFLLE1BQU0sSUFBSSxJQUFJLFVBQVU7QUFBQSxFQUM5QjtBQUFBLEVBZEEsSUFBVyxhQUFzQjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQWE7QUFBQSxFQUM1RCxJQUFXLFdBQVcsT0FBZ0I7QUFDckMsU0FBSyxjQUFjO0FBQ25CLFNBQUssdUJBQXVCLEtBQUs7QUFBQSxFQUNsQztBQUFBLEVBR0EsSUFBSSx3QkFBcUM7QUFBRSxXQUFPLEtBQUssMEJBQTBCLEtBQUssdUJBQXVCO0FBQUEsRUFBTztBQUFBLEVBU3BILHVDQUF1QyxPQUFvRjtBQUMxSCxVQUFNLHNCQUFzQixLQUFLLFlBQVksS0FBSztBQUNsRCxRQUFJLG1CQUFtQixLQUFLLGtCQUFrQixJQUFJLG1CQUFtQjtBQUNyRSxRQUFJLENBQUMsa0JBQWtCO0FBQ3RCLHlCQUFtQixJQUFJLG9DQUFvQyxNQUFNLEtBQUs7QUFDdEUsV0FBSyxrQkFBa0IsSUFBSSxxQkFBcUIsZ0JBQWdCO0FBQ2hFLFdBQUssVUFBVSxpQkFBaUIsc0JBQXNCLE1BQU0sS0FBSyx1QkFBdUIsS0FBSyxDQUFDLENBQUM7QUFBQSxJQUNoRztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxRQUFRLFVBQWtCLE9BQWUsU0FBK0QsT0FBMEQ7QUFDakssU0FBSyxjQUFjLFVBQVUsRUFBRSxPQUFPLE1BQU0sK0JBQStCLFNBQVMsU0FBUyxXQUFXLEVBQUUsd0JBQXdCLEtBQUssR0FBRyxNQUFNLENBQUM7QUFBQSxFQUNsSjtBQUFBLEVBRUEsT0FBTyxVQUFrQixPQUFlLFNBQStELE9BQTBEO0FBQ2hLLFNBQUssY0FBYyxVQUFVLEVBQUUsT0FBTyxNQUFNLCtCQUErQixRQUFRLFNBQVMsV0FBVyxFQUFFLHdCQUF3QixLQUFLLEdBQUcsTUFBTSxDQUFDO0FBQUEsRUFDako7QUFBQSxFQUVBLFFBQVEsVUFBa0IsT0FBZSxTQUErRCxPQUEwRDtBQUNqSyxTQUFLLGNBQWMsVUFBVSxFQUFFLE9BQU8sTUFBTSwrQkFBK0IsU0FBUyxTQUFTLFdBQVcsRUFBRSx3QkFBd0IsS0FBSyxHQUFHLE1BQU0sQ0FBQztBQUFBLEVBQ2xKO0FBQUEsRUFFUSxjQUFjLFVBQWtCLFNBQTJHO0FBQ2xKLFFBQUksUUFBUSxXQUFXLFFBQVEsUUFBUSwyQkFBMkIsU0FBUyxDQUFDLFFBQVEsUUFBUSx5QkFBeUI7QUFDcEgsWUFBTSxJQUFJLE1BQU0sOEZBQThGO0FBQUEsSUFDL0c7QUFDQSxVQUFNLE1BQU0sS0FBSyxPQUFPLFVBQVUsUUFBUSxLQUFLO0FBQy9DLFVBQU0sVUFBVSxLQUFLLElBQUksSUFBSSxHQUFHO0FBQ2hDLFVBQU0sYUFBYSxRQUFRLFVBQVU7QUFBQSxNQUNwQyx3QkFBd0IsUUFBUSxRQUFRLDBCQUEwQjtBQUFBLE1BQ2xFLHlCQUF5QixRQUFRLFFBQVEsMkJBQTJCO0FBQUEsSUFDckUsSUFBSTtBQUFBLE1BQ0gsd0JBQXdCO0FBQUEsSUFDekI7QUFDQSxRQUNDLENBQUMsV0FDRCxRQUFRLFVBQVUsUUFBUSxTQUMxQixRQUFRLFNBQVMsUUFBUSxRQUN6QixRQUFRLFNBQVMsMkJBQTJCLFdBQVcsMEJBQ3ZELFFBQVEsU0FBUyw0QkFBNEIsV0FBVywyQkFDeEQsUUFBUSxPQUFPLGlCQUFpQixVQUFVLFFBQVEsT0FBTyxpQkFBaUIsT0FDekU7QUFDRCxZQUFNQyxPQUFNLEtBQUssT0FBTyxVQUFVLFFBQVEsS0FBSztBQUMvQyxZQUFNLFFBQXFDO0FBQUEsUUFDMUM7QUFBQSxRQUNBLEdBQUc7QUFBQSxRQUNILFNBQVM7QUFBQSxNQUNWO0FBQ0EsV0FBSyxJQUFJLElBQUlBLE1BQUssS0FBSztBQUN2QixXQUFLLHVCQUF1QixLQUFLO0FBQUEsSUFDbEM7QUFBQSxFQUNEO0FBQUEsRUFFQSxJQUFJLFVBQWtCLE9BQW1HO0FBQ3hILFVBQU0sTUFBTSxLQUFLLE9BQU8sVUFBVSxLQUFLO0FBQ3ZDLFVBQU0sUUFBUSxLQUFLLElBQUksSUFBSSxHQUFHO0FBRTlCLFdBQU8sUUFBUSxlQUFlLEtBQUssSUFBSTtBQUFBLEVBQ3hDO0FBQUEsRUFFUSxPQUFPLFVBQWtCLE9BQW9EO0FBQ3BGLFVBQU0sV0FBVyxLQUFLLFlBQVksS0FBSztBQUN2QyxXQUFPLFNBQVMsU0FBUyxHQUFHLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUN4RDtBQUFBLEVBRVEsWUFBWSxPQUE0RDtBQUMvRSxXQUFPLEtBQUssZ0JBQWdCLE9BQU8sZUFBZSxLQUFLO0FBQUEsRUFDeEQ7QUFBQSxFQUVRLGdCQUFnQixpQkFBeUU7QUFDaEcsV0FBTyxrQkFBa0IsZ0JBQWdCLElBQUksU0FBUyxJQUFJO0FBQUEsRUFDM0Q7QUFBQSxFQUVPLGVBQWUsT0FBb0c7QUFDekgsVUFBTSxNQUFNLG9CQUFJLElBQStDO0FBQy9ELGVBQVcsQ0FBQyxHQUFHLEtBQUssS0FBSyxLQUFLLEtBQUs7QUFDbEMsVUFBSSxLQUFLLFlBQVksTUFBTSxLQUFLLE1BQU0sS0FBSyxZQUFZLEtBQUssR0FBRztBQUM5RCxZQUFJLElBQUksTUFBTSxVQUFVLGVBQWUsS0FBSyxDQUFDO0FBQUEsTUFDOUM7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQU8sVUFBa0IsT0FBMEQ7QUFDbEYsVUFBTSxNQUFNLEtBQUssT0FBTyxVQUFVLEtBQUs7QUFDdkMsU0FBSyxJQUFJLE9BQU8sR0FBRztBQUNuQixTQUFLLHVCQUF1QixLQUFLO0FBQUEsRUFDbEM7QUFBQSxFQUVBLE1BQU0sT0FBMEQ7QUFDL0QsUUFBSSxPQUFPLGlCQUFpQjtBQUMzQixpQkFBVyxDQUFDLEtBQUssT0FBTyxLQUFLLEtBQUssS0FBSztBQUN0QyxZQUFJLFFBQVEsT0FBTyxpQkFBaUIsVUFBVSxNQUFNLGdCQUFnQixPQUFPO0FBQzFFLGVBQUssSUFBSSxPQUFPLEdBQUc7QUFBQSxRQUNwQjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLGlCQUFpQixLQUFLO0FBQUEsSUFDNUIsT0FBTztBQUNOLFdBQUssSUFBSSxNQUFNO0FBQ2YsV0FBSyxlQUFlLE1BQU07QUFBQSxJQUMzQjtBQUNBLFNBQUssdUJBQXVCLEtBQUs7QUFBQSxFQUNsQztBQUFBLEVBRUEsZUFBZSxhQUF5RCxPQUEwRDtBQUNqSSxVQUFNLE1BQU0sS0FBSyxZQUFZLEtBQUs7QUFDbEMsVUFBTSxVQUFVLEtBQUssZUFBZSxJQUFJLEdBQUc7QUFDM0MsUUFBSSxDQUFDLFdBQVcsUUFBUSxnQkFBZ0IsYUFBYTtBQUNwRCxVQUFJO0FBQ0osVUFBSSxPQUFPLGdCQUFnQixVQUFVO0FBQ3BDLHlCQUFpQjtBQUFBLE1BQ2xCLE9BQU87QUFFTix5QkFBaUIsYUFBYSxNQUFNLE1BQU0sTUFBTSxFQUFFLENBQUM7QUFBQSxNQUNwRDtBQUNBLFlBQU0sUUFBbUQsRUFBRSxhQUFhLGdCQUFnQixNQUFNO0FBQzlGLFdBQUssZUFBZSxJQUFJLEtBQUssS0FBSztBQUNsQyxXQUFLLHVCQUF1QixLQUFLO0FBQUEsSUFDbEM7QUFBQSxFQUNEO0FBQUEsRUFFTyxlQUFlLE9BQWdHO0FBQ3JILFVBQU0sTUFBTSxLQUFLLFlBQVksS0FBSztBQUNsQyxXQUFPLEtBQUssZUFBZSxJQUFJLEdBQUcsR0FBRztBQUFBLEVBQ3RDO0FBQUEsRUFFUSxpQkFBaUIsT0FBMEQ7QUFDbEYsVUFBTSxNQUFNLEtBQUssWUFBWSxLQUFLO0FBQ2xDLFNBQUssZUFBZSxPQUFPLEdBQUc7QUFBQSxFQUMvQjtBQUNEO0FBRUEsTUFBTSxvQ0FBOEU7QUFBQSxFQVNuRixZQUNrQixZQUNBLE9BQ2hCO0FBRmdCO0FBQ0E7QUFMbEIsU0FBbUIseUJBQXlCLElBQUksUUFBYztBQUFBLEVBTzlEO0FBQUEsRUFaQSxJQUFXLGFBQXNCO0FBQUUsV0FBTyxLQUFLLFdBQVc7QUFBQSxFQUFZO0FBQUEsRUFDdEUsSUFBVyxXQUFXLE9BQWdCO0FBQ3JDLFNBQUssV0FBVyxhQUFhO0FBQUEsRUFDOUI7QUFBQSxFQUdBLElBQUksd0JBQXFDO0FBQUUsV0FBTyxLQUFLLDBCQUEwQixLQUFLLHVCQUF1QjtBQUFBLEVBQU87QUFBQSxFQVFwSCxVQUFVLE9BQW9EO0FBQzdELFdBQU8sS0FBSyxXQUFXLHVDQUF1QyxLQUFLO0FBQUEsRUFDcEU7QUFBQSxFQUVBLFFBQVEsVUFBa0IsT0FBZSxTQUFzRTtBQUM5RyxTQUFLLFdBQVcsUUFBUSxVQUFVLE9BQU8sU0FBUyxLQUFLLEtBQUs7QUFBQSxFQUM3RDtBQUFBLEVBRUEsT0FBTyxVQUFrQixPQUFlLFNBQXNFO0FBQzdHLFNBQUssV0FBVyxPQUFPLFVBQVUsT0FBTyxTQUFTLEtBQUssS0FBSztBQUFBLEVBQzVEO0FBQUEsRUFFQSxRQUFRLFVBQWtCLE9BQWUsU0FBc0U7QUFDOUcsU0FBSyxXQUFXLFFBQVEsVUFBVSxPQUFPLFNBQVMsS0FBSyxLQUFLO0FBQUEsRUFDN0Q7QUFBQSxFQUVBLElBQUksVUFBaUU7QUFDcEUsV0FBTyxLQUFLLFdBQVcsSUFBSSxVQUFVLEtBQUssS0FBSztBQUFBLEVBQ2hEO0FBQUEsRUFFQSxRQUFRLFVBQXVJLFNBQXlCO0FBQ3ZLLFNBQUssV0FBVyxlQUFlLEtBQUssS0FBSyxFQUFFLFFBQVEsQ0FBQyxPQUFPLGFBQWEsU0FBUyxLQUFLLFNBQVMsVUFBVSxPQUFPLElBQUksR0FBRyxLQUFLLEtBQUs7QUFBQSxFQUNsSTtBQUFBLEVBRUEsQ0FBQyxPQUFPLFFBQVEsSUFBc0Y7QUFDckcsV0FBTyxLQUFLLFdBQVcsZUFBZSxLQUFLLEtBQUssRUFBRSxRQUFRO0FBQUEsRUFDM0Q7QUFBQSxFQUVBLE9BQU8sVUFBd0I7QUFDOUIsU0FBSyxXQUFXLE9BQU8sVUFBVSxLQUFLLEtBQUs7QUFDM0MsU0FBSyx1QkFBdUIsS0FBSyxNQUFTO0FBQUEsRUFDM0M7QUFBQSxFQUVBLFFBQWM7QUFDYixTQUFLLFdBQVcsTUFBTSxLQUFLLEtBQUs7QUFBQSxFQUNqQztBQUFBLEVBRUEsSUFBSSxZQUFZLGFBQXlEO0FBQ3hFLFNBQUssV0FBVyxlQUFlLGFBQWEsS0FBSyxLQUFLO0FBQUEsRUFDdkQ7QUFBQSxFQUVBLElBQUksY0FBMEQ7QUFDN0QsV0FBTyxLQUFLLFdBQVcsZUFBZSxLQUFLLEtBQUs7QUFBQSxFQUNqRDtBQUNEO0FBRU8sSUFBTSwrQkFBTixjQUEyQywyQkFBMkI7QUFBQSxFQUk1RSxZQUNtQixpQkFDRSxZQUNLLFVBQ3hCO0FBQ0QsVUFBTSxPQUFPLGlCQUFpQixVQUFVO0FBQ3hDLFNBQUssc0JBQXNCLENBQUMsQ0FBQyxTQUFTLE9BQU87QUFBQSxFQUM5QztBQUFBLEVBRU8sZUFBZSxNQUFlLFdBQW9CLFdBQWdEO0FBQ3hHLFFBQUksQ0FBQyxLQUFLLHFCQUFxQjtBQUM5QixZQUFNLElBQUksa0JBQWtCO0FBQUEsSUFDN0I7QUFDQSxXQUFPLEtBQUssMEJBQTBCLEVBQUUsTUFBTSxXQUFXLFVBQVUsQ0FBQztBQUFBLEVBQ3JFO0FBQUEsRUFFTywwQkFBMEIsU0FBaUMsaUJBQTZEO0FBQzlILFFBQUksQ0FBQyxLQUFLLHFCQUFxQjtBQUM5QixZQUFNLElBQUksa0JBQWtCO0FBQUEsSUFDN0I7QUFDQSxVQUFNLFdBQVcsSUFBSSxnQkFBZ0IsS0FBSyxRQUFRLGFBQWEsR0FBRyxTQUFTLFFBQVEsSUFBSTtBQUN2RixTQUFLLFdBQVcsS0FBSyxRQUFRO0FBQzdCLGFBQVMsT0FBTyxTQUFTLEtBQUsseUJBQXlCLFNBQVMsZUFBZSxDQUFDO0FBQ2hGLFdBQU8sU0FBUztBQUFBLEVBQ2pCO0FBQ0Q7QUE3QmEsK0JBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBVO0FBK0JiLFNBQVMsZUFBZSxVQUE4RztBQUNySSxNQUFJLENBQUMsWUFBWSxPQUFPLGFBQWEsVUFBVTtBQUM5QyxXQUFPO0FBQUEsRUFDUjtBQUVBLE1BQUksQ0FBQyxPQUFPLFVBQVUsRUFBRSxJQUFJLEtBQUssQ0FBQyxHQUFHO0FBQ3BDLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTztBQUFBLElBQ04sSUFBSSxTQUFTO0FBQUEsSUFDYixPQUFPLFNBQVM7QUFBQSxFQUNqQjtBQUNEO0FBRUEsU0FBUyxnQkFBZ0IsT0FBbUQ7QUFDM0UsU0FBTyxXQUFXLGFBQWEsS0FBSyxJQUFJLFFBQXNCO0FBQy9EO0FBRUEsU0FBUyxlQUFlLFNBQXlFO0FBQ2hHLFFBQU0sYUFBYSxFQUFFLEdBQUcsUUFBUTtBQUNoQyxTQUFPLFdBQVc7QUFDbEIsYUFBVyxVQUFVLFdBQVcsV0FBVztBQUMzQyxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbImFyZyIsICJrZXkiXQp9Cg==
