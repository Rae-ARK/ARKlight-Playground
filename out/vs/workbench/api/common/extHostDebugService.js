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
import { coalesce } from "../../../base/common/arrays.js";
import { asPromise } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable as DisposableCls, toDisposable } from "../../../base/common/lifecycle.js";
import { ThemeIcon as ThemeIconUtils } from "../../../base/common/themables.js";
import { URI } from "../../../base/common/uri.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { AbstractDebugAdapter } from "../../contrib/debug/common/abstractDebugAdapter.js";
import { DebugVisualizationType } from "../../contrib/debug/common/debug.js";
import { convertToDAPaths, convertToVSCPaths, isDebuggerMainContribution } from "../../contrib/debug/common/debugUtils.js";
import { MainContext } from "./extHost.protocol.js";
import { IExtHostCommands } from "./extHostCommands.js";
import { IExtHostConfiguration } from "./extHostConfiguration.js";
import { IExtHostEditorTabs } from "./extHostEditorTabs.js";
import { IExtHostExtensionService } from "./extHostExtensionService.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { IExtHostTesting } from "./extHostTesting.js";
import * as Convert from "./extHostTypeConverters.js";
import { DataBreakpoint, DebugAdapterExecutable, DebugAdapterInlineImplementation, DebugAdapterNamedPipeServer, DebugAdapterServer, DebugConsoleMode, DebugStackFrame, DebugThread, Disposable, FunctionBreakpoint, Location, Position, setBreakpointId, SourceBreakpoint, ThemeIcon } from "./extHostTypes.js";
import { IExtHostVariableResolverProvider } from "./extHostVariableResolverService.js";
import { IExtHostWorkspace } from "./extHostWorkspace.js";
const IExtHostDebugService = createDecorator("IExtHostDebugService");
let ExtHostDebugServiceBase = class extends DisposableCls {
  constructor(extHostRpcService, _workspaceService, _extensionService, _configurationService, _editorTabs, _variableResolver, _commands, _testing) {
    super();
    this._workspaceService = _workspaceService;
    this._extensionService = _extensionService;
    this._configurationService = _configurationService;
    this._editorTabs = _editorTabs;
    this._variableResolver = _variableResolver;
    this._commands = _commands;
    this._testing = _testing;
    this._debugSessions = /* @__PURE__ */ new Map();
    this._debugVisualizationTreeItemIdsCounter = 0;
    this._debugVisualizationProviders = /* @__PURE__ */ new Map();
    this._debugVisualizationTrees = /* @__PURE__ */ new Map();
    this._debugVisualizationTreeItemIds = /* @__PURE__ */ new WeakMap();
    this._debugVisualizationElements = /* @__PURE__ */ new Map();
    this._visualizers = /* @__PURE__ */ new Map();
    this._visualizerIdCounter = 0;
    this._configProviderHandleCounter = 0;
    this._configProviders = [];
    this._adapterFactoryHandleCounter = 0;
    this._adapterFactories = [];
    this._trackerFactoryHandleCounter = 0;
    this._trackerFactories = [];
    this._debugAdapters = /* @__PURE__ */ new Map();
    this._debugAdaptersTrackers = /* @__PURE__ */ new Map();
    this._onDidStartDebugSession = this._register(new Emitter());
    this._onDidTerminateDebugSession = this._register(new Emitter());
    this._onDidChangeActiveDebugSession = this._register(new Emitter());
    this._onDidReceiveDebugSessionCustomEvent = this._register(new Emitter());
    this._debugServiceProxy = extHostRpcService.getProxy(MainContext.MainThreadDebugService);
    this._onDidChangeBreakpoints = this._register(new Emitter());
    this._onDidChangeActiveStackItem = this._register(new Emitter());
    this._activeDebugConsole = new ExtHostDebugConsole(this._debugServiceProxy);
    this._breakpoints = /* @__PURE__ */ new Map();
    this._extensionService.getExtensionRegistry().then((extensionRegistry) => {
      this._register(extensionRegistry.onDidChange((_) => {
        this.registerAllDebugTypes(extensionRegistry);
      }));
      this.registerAllDebugTypes(extensionRegistry);
    });
    this._telemetryProxy = extHostRpcService.getProxy(MainContext.MainThreadTelemetry);
  }
  get onDidStartDebugSession() {
    return this._onDidStartDebugSession.event;
  }
  get onDidTerminateDebugSession() {
    return this._onDidTerminateDebugSession.event;
  }
  get onDidChangeActiveDebugSession() {
    return this._onDidChangeActiveDebugSession.event;
  }
  get activeDebugSession() {
    return this._activeDebugSession?.api;
  }
  get onDidReceiveDebugSessionCustomEvent() {
    return this._onDidReceiveDebugSessionCustomEvent.event;
  }
  get activeDebugConsole() {
    return this._activeDebugConsole.value;
  }
  async $getVisualizerTreeItem(treeId, element) {
    const context = this.hydrateVisualizationContext(element);
    if (!context) {
      return void 0;
    }
    const item = await this._debugVisualizationTrees.get(treeId)?.getTreeItem?.(context);
    return item ? this.convertVisualizerTreeItem(treeId, item) : void 0;
  }
  registerDebugVisualizationTree(manifest, id, provider) {
    const extensionId = ExtensionIdentifier.toKey(manifest.identifier);
    const key = this.extensionVisKey(extensionId, id);
    if (this._debugVisualizationProviders.has(key)) {
      throw new Error(`A debug visualization provider with id '${id}' is already registered`);
    }
    this._debugVisualizationTrees.set(key, provider);
    this._debugServiceProxy.$registerDebugVisualizerTree(key, !!provider.editItem);
    return toDisposable(() => {
      this._debugServiceProxy.$unregisterDebugVisualizerTree(key);
      this._debugVisualizationTrees.delete(id);
    });
  }
  async $getVisualizerTreeItemChildren(treeId, element) {
    const item = this._debugVisualizationElements.get(element)?.item;
    if (!item) {
      return [];
    }
    const children = await this._debugVisualizationTrees.get(treeId)?.getChildren?.(item);
    return children?.map((i) => this.convertVisualizerTreeItem(treeId, i)) || [];
  }
  async $editVisualizerTreeItem(element, value) {
    const e = this._debugVisualizationElements.get(element);
    if (!e) {
      return void 0;
    }
    const r = await this._debugVisualizationTrees.get(e.provider)?.editItem?.(e.item, value);
    return this.convertVisualizerTreeItem(e.provider, r || e.item);
  }
  $disposeVisualizedTree(element) {
    const root = this._debugVisualizationElements.get(element);
    if (!root) {
      return;
    }
    const queue = [root.children];
    for (const children of queue) {
      if (children) {
        for (const child of children) {
          queue.push(this._debugVisualizationElements.get(child)?.children);
          this._debugVisualizationElements.delete(child);
        }
      }
    }
  }
  convertVisualizerTreeItem(treeId, item) {
    let id = this._debugVisualizationTreeItemIds.get(item);
    if (!id) {
      id = this._debugVisualizationTreeItemIdsCounter++;
      this._debugVisualizationTreeItemIds.set(item, id);
      this._debugVisualizationElements.set(id, { provider: treeId, item });
    }
    return Convert.DebugTreeItem.from(item, id);
  }
  asDebugSourceUri(src, session) {
    const source = src;
    if (typeof source.sourceReference === "number" && source.sourceReference > 0) {
      let debug = `debug:${encodeURIComponent(source.path || "")}`;
      let sep = "?";
      if (session) {
        debug += `${sep}session=${encodeURIComponent(session.id)}`;
        sep = "&";
      }
      debug += `${sep}ref=${source.sourceReference}`;
      return URI.parse(debug);
    } else if (source.path) {
      return URI.file(source.path);
    } else {
      throw new Error(`cannot create uri from DAP 'source' object; properties 'path' and 'sourceReference' are both missing.`);
    }
  }
  registerAllDebugTypes(extensionRegistry) {
    const debugTypes = [];
    for (const ed of extensionRegistry.getAllExtensionDescriptions()) {
      if (ed.contributes) {
        const debuggers = ed.contributes["debuggers"];
        if (debuggers && debuggers.length > 0) {
          for (const dbg of debuggers) {
            if (isDebuggerMainContribution(dbg)) {
              debugTypes.push(dbg.type);
            }
          }
        }
      }
    }
    this._debugServiceProxy.$registerDebugTypes(debugTypes);
  }
  // extension debug API
  get activeStackItem() {
    return this._activeStackItem;
  }
  get onDidChangeActiveStackItem() {
    return this._onDidChangeActiveStackItem.event;
  }
  get onDidChangeBreakpoints() {
    return this._onDidChangeBreakpoints.event;
  }
  get breakpoints() {
    const result = [];
    this._breakpoints.forEach((bp) => result.push(bp));
    return result;
  }
  async $resolveDebugVisualizer(id, token) {
    const visualizer = this._visualizers.get(id);
    if (!visualizer) {
      throw new Error(`No debug visualizer found with id '${id}'`);
    }
    let { v, provider, extensionId } = visualizer;
    if (!v.visualization) {
      v = await provider.resolveDebugVisualization?.(v, token) || v;
      visualizer.v = v;
    }
    if (!v.visualization) {
      throw new Error(`No visualization returned from resolveDebugVisualization in '${provider}'`);
    }
    return this.serializeVisualization(extensionId, v.visualization);
  }
  async $executeDebugVisualizerCommand(id) {
    const visualizer = this._visualizers.get(id);
    if (!visualizer) {
      throw new Error(`No debug visualizer found with id '${id}'`);
    }
    const command = visualizer.v.visualization;
    if (command && "command" in command) {
      this._commands.executeCommand(command.command, ...command.arguments || []);
    }
  }
  hydrateVisualizationContext(context) {
    const session = this._debugSessions.get(context.sessionId);
    return session && {
      session: session.api,
      variable: context.variable,
      containerId: context.containerId,
      frameId: context.frameId,
      threadId: context.threadId
    };
  }
  async $provideDebugVisualizers(extensionId, id, context, token) {
    const contextHydrated = this.hydrateVisualizationContext(context);
    const key = this.extensionVisKey(extensionId, id);
    const provider = this._debugVisualizationProviders.get(key);
    if (!contextHydrated || !provider) {
      return [];
    }
    const visualizations = await provider.provideDebugVisualization(contextHydrated, token);
    if (!visualizations) {
      return [];
    }
    return visualizations.map((v) => {
      const id2 = ++this._visualizerIdCounter;
      this._visualizers.set(id2, { v, provider, extensionId });
      const icon = v.iconPath ? this.getIconPathOrClass(v.iconPath) : void 0;
      return {
        id: id2,
        name: v.name,
        iconClass: icon?.iconClass,
        iconPath: icon?.iconPath,
        visualization: this.serializeVisualization(extensionId, v.visualization)
      };
    });
  }
  $disposeDebugVisualizers(ids) {
    for (const id of ids) {
      this._visualizers.delete(id);
    }
  }
  registerDebugVisualizationProvider(manifest, id, provider) {
    if (!manifest.contributes?.debugVisualizers?.some((r) => r.id === id)) {
      throw new Error(`Extensions may only call registerDebugVisualizationProvider() for renderers they contribute (got ${id})`);
    }
    const extensionId = ExtensionIdentifier.toKey(manifest.identifier);
    const key = this.extensionVisKey(extensionId, id);
    if (this._debugVisualizationProviders.has(key)) {
      throw new Error(`A debug visualization provider with id '${id}' is already registered`);
    }
    this._debugVisualizationProviders.set(key, provider);
    this._debugServiceProxy.$registerDebugVisualizer(extensionId, id);
    return toDisposable(() => {
      this._debugServiceProxy.$unregisterDebugVisualizer(extensionId, id);
      this._debugVisualizationProviders.delete(id);
    });
  }
  addBreakpoints(breakpoints0) {
    const breakpoints = breakpoints0.filter((bp) => {
      const id = bp.id;
      if (!this._breakpoints.has(id)) {
        this._breakpoints.set(id, bp);
        return true;
      }
      return false;
    });
    this.fireBreakpointChanges(breakpoints, [], []);
    const dtos = [];
    const map = /* @__PURE__ */ new Map();
    for (const bp of breakpoints) {
      if (bp instanceof SourceBreakpoint) {
        let dto = map.get(bp.location.uri.toString());
        if (!dto) {
          dto = {
            type: "sourceMulti",
            uri: bp.location.uri,
            lines: []
          };
          map.set(bp.location.uri.toString(), dto);
          dtos.push(dto);
        }
        dto.lines.push({
          id: bp.id,
          enabled: bp.enabled,
          condition: bp.condition,
          hitCondition: bp.hitCondition,
          logMessage: bp.logMessage,
          line: bp.location.range.start.line,
          character: bp.location.range.start.character,
          mode: bp.mode
        });
      } else if (bp instanceof FunctionBreakpoint) {
        dtos.push({
          type: "function",
          id: bp.id,
          enabled: bp.enabled,
          hitCondition: bp.hitCondition,
          logMessage: bp.logMessage,
          condition: bp.condition,
          functionName: bp.functionName,
          mode: bp.mode
        });
      }
    }
    return this._debugServiceProxy.$registerBreakpoints(dtos);
  }
  removeBreakpoints(breakpoints0) {
    const breakpoints = breakpoints0.filter((b) => this._breakpoints.delete(b.id));
    this.fireBreakpointChanges([], breakpoints, []);
    const ids = breakpoints.filter((bp) => bp instanceof SourceBreakpoint).map((bp) => bp.id);
    const fids = breakpoints.filter((bp) => bp instanceof FunctionBreakpoint).map((bp) => bp.id);
    const dids = breakpoints.filter((bp) => bp instanceof DataBreakpoint).map((bp) => bp.id);
    return this._debugServiceProxy.$unregisterBreakpoints(ids, fids, dids);
  }
  startDebugging(folder, nameOrConfig, options) {
    const testRunMeta = options.testRun && this._testing.getMetadataForRun(options.testRun);
    return this._debugServiceProxy.$startDebugging(folder ? folder.uri : void 0, nameOrConfig, {
      parentSessionID: options.parentSession ? options.parentSession.id : void 0,
      lifecycleManagedByParent: options.lifecycleManagedByParent,
      repl: options.consoleMode === DebugConsoleMode.MergeWithParent ? "mergeWithParent" : "separate",
      noDebug: options.noDebug,
      compact: options.compact,
      suppressSaveBeforeStart: options.suppressSaveBeforeStart,
      testRun: testRunMeta && {
        runId: testRunMeta.runId,
        taskId: testRunMeta.taskId
      },
      // Check debugUI for back-compat, #147264
      // eslint-disable-next-line local/code-no-any-casts
      suppressDebugStatusbar: options.suppressDebugStatusbar ?? options.debugUI?.simple,
      // eslint-disable-next-line local/code-no-any-casts
      suppressDebugToolbar: options.suppressDebugToolbar ?? options.debugUI?.simple,
      // eslint-disable-next-line local/code-no-any-casts
      suppressDebugView: options.suppressDebugView ?? options.debugUI?.simple
    });
  }
  stopDebugging(session) {
    return this._debugServiceProxy.$stopDebugging(session ? session.id : void 0);
  }
  registerDebugConfigurationProvider(type, provider, trigger) {
    if (!provider) {
      return new Disposable(() => {
      });
    }
    const handle = this._configProviderHandleCounter++;
    this._configProviders.push({ type, handle, provider });
    this._debugServiceProxy.$registerDebugConfigurationProvider(
      type,
      trigger,
      !!provider.provideDebugConfigurations,
      !!provider.resolveDebugConfiguration,
      !!provider.resolveDebugConfigurationWithSubstitutedVariables,
      handle
    );
    return new Disposable(() => {
      this._configProviders = this._configProviders.filter((p) => p.provider !== provider);
      this._debugServiceProxy.$unregisterDebugConfigurationProvider(handle);
    });
  }
  registerDebugAdapterDescriptorFactory(extension, type, factory) {
    if (!factory) {
      return new Disposable(() => {
      });
    }
    if (!this.definesDebugType(extension, type)) {
      throw new Error(`a DebugAdapterDescriptorFactory can only be registered from the extension that defines the '${type}' debugger.`);
    }
    if (this.getAdapterDescriptorFactoryByType(type)) {
      throw new Error(`a DebugAdapterDescriptorFactory can only be registered once per a type.`);
    }
    const handle = this._adapterFactoryHandleCounter++;
    this._adapterFactories.push({ type, handle, factory });
    this._debugServiceProxy.$registerDebugAdapterDescriptorFactory(type, handle);
    return new Disposable(() => {
      this._adapterFactories = this._adapterFactories.filter((p) => p.factory !== factory);
      this._debugServiceProxy.$unregisterDebugAdapterDescriptorFactory(handle);
    });
  }
  registerDebugAdapterTrackerFactory(type, factory) {
    if (!factory) {
      return new Disposable(() => {
      });
    }
    const handle = this._trackerFactoryHandleCounter++;
    this._trackerFactories.push({ type, handle, factory });
    return new Disposable(() => {
      this._trackerFactories = this._trackerFactories.filter((p) => p.factory !== factory);
    });
  }
  // RPC methods (ExtHostDebugServiceShape)
  async $runInTerminal(args, sessionId) {
    return Promise.resolve(void 0);
  }
  async $substituteVariables(folderUri, config) {
    let ws;
    const folder = await this.getFolder(folderUri);
    if (folder) {
      ws = {
        uri: folder.uri,
        name: folder.name,
        index: folder.index
      };
    }
    const variableResolver = await this._variableResolver.getResolver();
    return variableResolver.resolveAsync(ws, config);
  }
  createDebugAdapter(adapter, session) {
    if (adapter instanceof DebugAdapterInlineImplementation) {
      return new DirectDebugAdapter(adapter.implementation);
    }
    return void 0;
  }
  createSignService() {
    return void 0;
  }
  async $startDASession(debugAdapterHandle, sessionDto) {
    const mythis = this;
    const session = await this.getSession(sessionDto);
    return this.getAdapterDescriptor(this.getAdapterDescriptorFactoryByType(session.type), session).then((daDescriptor) => {
      if (!daDescriptor) {
        throw new Error(`Couldn't find a debug adapter descriptor for debug type '${session.type}' (extension might have failed to activate)`);
      }
      const da = this.createDebugAdapter(daDescriptor, session);
      if (!da) {
        throw new Error(`Couldn't create a debug adapter for type '${session.type}'.`);
      }
      const debugAdapter = da;
      this._debugAdapters.set(debugAdapterHandle, debugAdapter);
      return this.getDebugAdapterTrackers(session).then((tracker) => {
        if (tracker) {
          this._debugAdaptersTrackers.set(debugAdapterHandle, tracker);
        }
        debugAdapter.onMessage(async (message) => {
          if (message.type === "request" && message.command === "handshake") {
            const request = message;
            const response = {
              type: "response",
              seq: 0,
              command: request.command,
              request_seq: request.seq,
              success: true
            };
            if (!this._signService) {
              this._signService = this.createSignService();
            }
            try {
              if (this._signService) {
                const signature = await this._signService.sign(request.arguments.value);
                response.body = {
                  signature
                };
                debugAdapter.sendResponse(response);
              } else {
                throw new Error("no signer");
              }
            } catch (e) {
              response.success = false;
              response.message = e.message;
              debugAdapter.sendResponse(response);
            }
          } else {
            if (tracker && tracker.onDidSendMessage) {
              tracker.onDidSendMessage(message);
            }
            try {
              message = convertToVSCPaths(message, true);
            } catch (e) {
              const type = message.type + "_" + (message.command ?? message.event ?? "");
              this._telemetryProxy.$publicLog2("debugProtocolMessageError", { type, from: session.type });
              throw e;
            }
            mythis._debugServiceProxy.$acceptDAMessage(debugAdapterHandle, message);
          }
        });
        debugAdapter.onError((err) => {
          if (tracker && tracker.onError) {
            tracker.onError(err);
          }
          this._debugServiceProxy.$acceptDAError(debugAdapterHandle, err.name, err.message, err.stack);
        });
        debugAdapter.onExit((code) => {
          if (tracker && tracker.onExit) {
            tracker.onExit(code ?? void 0, void 0);
          }
          this._debugServiceProxy.$acceptDAExit(debugAdapterHandle, code ?? void 0, void 0);
        });
        if (tracker && tracker.onWillStartSession) {
          tracker.onWillStartSession();
        }
        return debugAdapter.startSession();
      });
    });
  }
  $sendDAMessage(debugAdapterHandle, message) {
    message = convertToDAPaths(message, false);
    const tracker = this._debugAdaptersTrackers.get(debugAdapterHandle);
    if (tracker && tracker.onWillReceiveMessage) {
      tracker.onWillReceiveMessage(message);
    }
    const da = this._debugAdapters.get(debugAdapterHandle);
    da?.sendMessage(message);
  }
  $stopDASession(debugAdapterHandle) {
    const tracker = this._debugAdaptersTrackers.get(debugAdapterHandle);
    this._debugAdaptersTrackers.delete(debugAdapterHandle);
    if (tracker && tracker.onWillStopSession) {
      tracker.onWillStopSession();
    }
    const da = this._debugAdapters.get(debugAdapterHandle);
    this._debugAdapters.delete(debugAdapterHandle);
    if (da) {
      return da.stopSession();
    } else {
      return Promise.resolve(void 0);
    }
  }
  $acceptBreakpointsDelta(delta) {
    const a = [];
    const r = [];
    const c = [];
    if (delta.added) {
      for (const bpd of delta.added) {
        const id = bpd.id;
        if (id && !this._breakpoints.has(id)) {
          let bp;
          if (bpd.type === "function") {
            bp = new FunctionBreakpoint(bpd.functionName, bpd.enabled, bpd.condition, bpd.hitCondition, bpd.logMessage, bpd.mode);
          } else if (bpd.type === "data") {
            bp = new DataBreakpoint(bpd.label, bpd.dataId, bpd.canPersist, bpd.enabled, bpd.hitCondition, bpd.condition, bpd.logMessage, bpd.mode);
          } else {
            const uri = URI.revive(bpd.uri);
            bp = new SourceBreakpoint(new Location(uri, new Position(bpd.line, bpd.character)), bpd.enabled, bpd.condition, bpd.hitCondition, bpd.logMessage, bpd.mode);
          }
          setBreakpointId(bp, id);
          this._breakpoints.set(id, bp);
          a.push(bp);
        }
      }
    }
    if (delta.removed) {
      for (const id of delta.removed) {
        const bp = this._breakpoints.get(id);
        if (bp) {
          this._breakpoints.delete(id);
          r.push(bp);
        }
      }
    }
    if (delta.changed) {
      for (const bpd of delta.changed) {
        if (bpd.id) {
          const bp = this._breakpoints.get(bpd.id);
          if (bp) {
            if (bp instanceof FunctionBreakpoint && bpd.type === "function") {
              const fbp = bp;
              fbp.enabled = bpd.enabled;
              fbp.condition = bpd.condition;
              fbp.hitCondition = bpd.hitCondition;
              fbp.logMessage = bpd.logMessage;
              fbp.functionName = bpd.functionName;
            } else if (bp instanceof SourceBreakpoint && bpd.type === "source") {
              const sbp = bp;
              sbp.enabled = bpd.enabled;
              sbp.condition = bpd.condition;
              sbp.hitCondition = bpd.hitCondition;
              sbp.logMessage = bpd.logMessage;
              sbp.location = new Location(URI.revive(bpd.uri), new Position(bpd.line, bpd.character));
            }
            c.push(bp);
          }
        }
      }
    }
    this.fireBreakpointChanges(a, r, c);
  }
  async $acceptStackFrameFocus(focusDto) {
    let focus;
    if (focusDto) {
      const session = await this.getSession(focusDto.sessionId);
      if (focusDto.kind === "thread") {
        focus = new DebugThread(session.api, focusDto.threadId);
      } else {
        focus = new DebugStackFrame(session.api, focusDto.threadId, focusDto.frameId);
      }
    }
    this._activeStackItem = focus;
    this._onDidChangeActiveStackItem.fire(this._activeStackItem);
  }
  $provideDebugConfigurations(configProviderHandle, folderUri, token) {
    return asPromise(async () => {
      const provider = this.getConfigProviderByHandle(configProviderHandle);
      if (!provider) {
        throw new Error("no DebugConfigurationProvider found");
      }
      if (!provider.provideDebugConfigurations) {
        throw new Error("DebugConfigurationProvider has no method provideDebugConfigurations");
      }
      const folder = await this.getFolder(folderUri);
      return provider.provideDebugConfigurations(folder, token);
    }).then((debugConfigurations) => {
      if (!debugConfigurations) {
        throw new Error("nothing returned from DebugConfigurationProvider.provideDebugConfigurations");
      }
      return debugConfigurations;
    });
  }
  $resolveDebugConfiguration(configProviderHandle, folderUri, debugConfiguration, token) {
    return asPromise(async () => {
      const provider = this.getConfigProviderByHandle(configProviderHandle);
      if (!provider) {
        throw new Error("no DebugConfigurationProvider found");
      }
      if (!provider.resolveDebugConfiguration) {
        throw new Error("DebugConfigurationProvider has no method resolveDebugConfiguration");
      }
      const folder = await this.getFolder(folderUri);
      return provider.resolveDebugConfiguration(folder, debugConfiguration, token);
    });
  }
  $resolveDebugConfigurationWithSubstitutedVariables(configProviderHandle, folderUri, debugConfiguration, token) {
    return asPromise(async () => {
      const provider = this.getConfigProviderByHandle(configProviderHandle);
      if (!provider) {
        throw new Error("no DebugConfigurationProvider found");
      }
      if (!provider.resolveDebugConfigurationWithSubstitutedVariables) {
        throw new Error("DebugConfigurationProvider has no method resolveDebugConfigurationWithSubstitutedVariables");
      }
      const folder = await this.getFolder(folderUri);
      return provider.resolveDebugConfigurationWithSubstitutedVariables(folder, debugConfiguration, token);
    });
  }
  async $provideDebugAdapter(adapterFactoryHandle, sessionDto) {
    const adapterDescriptorFactory = this.getAdapterDescriptorFactoryByHandle(adapterFactoryHandle);
    if (!adapterDescriptorFactory) {
      return Promise.reject(new Error("no adapter descriptor factory found for handle"));
    }
    const session = await this.getSession(sessionDto);
    return this.getAdapterDescriptor(adapterDescriptorFactory, session).then((adapterDescriptor) => {
      if (!adapterDescriptor) {
        throw new Error(`Couldn't find a debug adapter descriptor for debug type '${session.type}'`);
      }
      return this.convertToDto(adapterDescriptor);
    });
  }
  async $acceptDebugSessionStarted(sessionDto) {
    const session = await this.getSession(sessionDto);
    this._onDidStartDebugSession.fire(session.api);
  }
  async $acceptDebugSessionTerminated(sessionDto) {
    const session = await this.getSession(sessionDto);
    if (session) {
      this._onDidTerminateDebugSession.fire(session.api);
      this._debugSessions.delete(session.id);
    }
  }
  async $acceptDebugSessionActiveChanged(sessionDto) {
    this._activeDebugSession = sessionDto ? await this.getSession(sessionDto) : void 0;
    this._onDidChangeActiveDebugSession.fire(this._activeDebugSession?.api);
  }
  async $acceptDebugSessionNameChanged(sessionDto, name) {
    const session = await this.getSession(sessionDto);
    session?._acceptNameChanged(name);
  }
  async $acceptDebugSessionCustomEvent(sessionDto, event) {
    const session = await this.getSession(sessionDto);
    const ee = {
      session: session.api,
      event: event.event,
      body: event.body
    };
    this._onDidReceiveDebugSessionCustomEvent.fire(ee);
  }
  // private & dto helpers
  convertToDto(x) {
    if (x instanceof DebugAdapterExecutable) {
      return this.convertExecutableToDto(x);
    } else if (x instanceof DebugAdapterServer) {
      return this.convertServerToDto(x);
    } else if (x instanceof DebugAdapterNamedPipeServer) {
      return this.convertPipeServerToDto(x);
    } else if (x instanceof DebugAdapterInlineImplementation) {
      return this.convertImplementationToDto(x);
    } else {
      throw new Error("convertToDto unexpected type");
    }
  }
  convertExecutableToDto(x) {
    return {
      type: "executable",
      command: x.command,
      args: x.args,
      options: x.options
    };
  }
  convertServerToDto(x) {
    return {
      type: "server",
      port: x.port,
      host: x.host
    };
  }
  convertPipeServerToDto(x) {
    return {
      type: "pipeServer",
      path: x.path
    };
  }
  convertImplementationToDto(x) {
    return {
      type: "implementation"
    };
  }
  getAdapterDescriptorFactoryByType(type) {
    const results = this._adapterFactories.filter((p) => p.type === type);
    if (results.length > 0) {
      return results[0].factory;
    }
    return void 0;
  }
  getAdapterDescriptorFactoryByHandle(handle) {
    const results = this._adapterFactories.filter((p) => p.handle === handle);
    if (results.length > 0) {
      return results[0].factory;
    }
    return void 0;
  }
  getConfigProviderByHandle(handle) {
    const results = this._configProviders.filter((p) => p.handle === handle);
    if (results.length > 0) {
      return results[0].provider;
    }
    return void 0;
  }
  definesDebugType(ed, type) {
    if (ed.contributes) {
      const debuggers = ed.contributes["debuggers"];
      if (debuggers && debuggers.length > 0) {
        for (const dbg of debuggers) {
          if (dbg.label && dbg.type) {
            if (dbg.type === type) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }
  getDebugAdapterTrackers(session) {
    const config = session.configuration;
    const type = config.type;
    const promises = this._trackerFactories.filter((tuple) => tuple.type === type || tuple.type === "*").map((tuple) => asPromise(() => tuple.factory.createDebugAdapterTracker(session.api)).then((p) => p, (err) => null));
    return Promise.race([
      Promise.all(promises).then((result) => {
        const trackers = coalesce(result);
        if (trackers.length > 0) {
          return new MultiTracker(trackers);
        }
        return void 0;
      }),
      new Promise((resolve) => setTimeout(() => resolve(void 0), 1e3))
    ]).catch((err) => {
      return void 0;
    });
  }
  async getAdapterDescriptor(adapterDescriptorFactory, session) {
    const serverPort = session.configuration.debugServer;
    if (typeof serverPort === "number") {
      return Promise.resolve(new DebugAdapterServer(serverPort));
    }
    if (adapterDescriptorFactory) {
      const extensionRegistry2 = await this._extensionService.getExtensionRegistry();
      return asPromise(() => adapterDescriptorFactory.createDebugAdapterDescriptor(session.api, this.daExecutableFromPackage(session, extensionRegistry2))).then((daDescriptor) => {
        if (daDescriptor) {
          return daDescriptor;
        }
        return void 0;
      });
    }
    const extensionRegistry = await this._extensionService.getExtensionRegistry();
    return Promise.resolve(this.daExecutableFromPackage(session, extensionRegistry));
  }
  daExecutableFromPackage(session, extensionRegistry) {
    return void 0;
  }
  fireBreakpointChanges(added, removed, changed) {
    if (added.length > 0 || removed.length > 0 || changed.length > 0) {
      this._onDidChangeBreakpoints.fire(Object.freeze({
        added,
        removed,
        changed
      }));
    }
  }
  async getSession(dto) {
    if (dto) {
      if (typeof dto === "string") {
        const ds = this._debugSessions.get(dto);
        if (ds) {
          return ds;
        }
      } else {
        let ds = this._debugSessions.get(dto.id);
        if (!ds) {
          const folder = await this.getFolder(dto.folderUri);
          const parent = dto.parent ? this._debugSessions.get(dto.parent) : void 0;
          ds = new ExtHostDebugSession(this._debugServiceProxy, dto.id, dto.type, dto.name, folder, dto.configuration, parent?.api);
          this._debugSessions.set(ds.id, ds);
          this._debugServiceProxy.$sessionCached(ds.id);
        }
        return ds;
      }
    }
    throw new Error("cannot find session");
  }
  getFolder(_folderUri) {
    if (_folderUri) {
      const folderURI = URI.revive(_folderUri);
      return this._workspaceService.resolveWorkspaceFolder(folderURI);
    }
    return Promise.resolve(void 0);
  }
  extensionVisKey(extensionId, id) {
    return `${extensionId}\0${id}`;
  }
  serializeVisualization(extensionId, viz) {
    if (!viz) {
      return void 0;
    }
    if ("title" in viz && "command" in viz) {
      return { type: DebugVisualizationType.Command };
    }
    if ("treeId" in viz) {
      return { type: DebugVisualizationType.Tree, id: `${extensionId}\0${viz.treeId}` };
    }
    throw new Error("Unsupported debug visualization type");
  }
  getIconPathOrClass(icon) {
    const iconPathOrIconClass = this.getIconUris(icon);
    let iconPath;
    let iconClass;
    if ("id" in iconPathOrIconClass) {
      iconClass = ThemeIconUtils.asClassName(iconPathOrIconClass);
    } else {
      iconPath = iconPathOrIconClass;
    }
    return {
      iconPath,
      iconClass
    };
  }
  getIconUris(iconPath) {
    if (iconPath instanceof ThemeIcon) {
      return { id: iconPath.id };
    }
    const dark = typeof iconPath === "object" && "dark" in iconPath ? iconPath.dark : iconPath;
    const light = typeof iconPath === "object" && "light" in iconPath ? iconPath.light : iconPath;
    return {
      dark: typeof dark === "string" ? URI.file(dark) : dark,
      light: typeof light === "string" ? URI.file(light) : light
    };
  }
};
ExtHostDebugServiceBase = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostWorkspace),
  __decorateParam(2, IExtHostExtensionService),
  __decorateParam(3, IExtHostConfiguration),
  __decorateParam(4, IExtHostEditorTabs),
  __decorateParam(5, IExtHostVariableResolverProvider),
  __decorateParam(6, IExtHostCommands),
  __decorateParam(7, IExtHostTesting)
], ExtHostDebugServiceBase);
class ExtHostDebugSession {
  constructor(_debugServiceProxy, _id, _type, _name, _workspaceFolder, _configuration, _parentSession) {
    this._debugServiceProxy = _debugServiceProxy;
    this._id = _id;
    this._type = _type;
    this._name = _name;
    this._workspaceFolder = _workspaceFolder;
    this._configuration = _configuration;
    this._parentSession = _parentSession;
  }
  get api() {
    const that = this;
    return this.apiSession ??= Object.freeze({
      id: that._id,
      type: that._type,
      get name() {
        return that._name;
      },
      set name(name) {
        that._name = name;
        that._debugServiceProxy.$setDebugSessionName(that._id, name);
      },
      parentSession: that._parentSession,
      workspaceFolder: that._workspaceFolder,
      configuration: that._configuration,
      customRequest(command, args) {
        return that._debugServiceProxy.$customDebugAdapterRequest(that._id, command, args);
      },
      getDebugProtocolBreakpoint(breakpoint) {
        return that._debugServiceProxy.$getDebugProtocolBreakpoint(that._id, breakpoint.id);
      }
    });
  }
  get id() {
    return this._id;
  }
  get type() {
    return this._type;
  }
  _acceptNameChanged(name) {
    this._name = name;
  }
  get configuration() {
    return this._configuration;
  }
}
class ExtHostDebugConsole {
  constructor(proxy) {
    this.value = Object.freeze({
      append(value) {
        proxy.$appendDebugConsole(value);
      },
      appendLine(value) {
        this.append(value + "\n");
      }
    });
  }
}
class MultiTracker {
  constructor(trackers) {
    this.trackers = trackers;
  }
  onWillStartSession() {
    this.trackers.forEach((t) => t.onWillStartSession ? t.onWillStartSession() : void 0);
  }
  onWillReceiveMessage(message) {
    this.trackers.forEach((t) => t.onWillReceiveMessage ? t.onWillReceiveMessage(message) : void 0);
  }
  onDidSendMessage(message) {
    this.trackers.forEach((t) => t.onDidSendMessage ? t.onDidSendMessage(message) : void 0);
  }
  onWillStopSession() {
    this.trackers.forEach((t) => t.onWillStopSession ? t.onWillStopSession() : void 0);
  }
  onError(error) {
    this.trackers.forEach((t) => t.onError ? t.onError(error) : void 0);
  }
  onExit(code, signal) {
    this.trackers.forEach((t) => t.onExit ? t.onExit(code, signal) : void 0);
  }
}
class DirectDebugAdapter extends AbstractDebugAdapter {
  constructor(implementation) {
    super();
    this.implementation = implementation;
    implementation.onDidSendMessage((message) => {
      this.acceptMessage(message);
    });
  }
  startSession() {
    return Promise.resolve(void 0);
  }
  sendMessage(message) {
    this.implementation.handleMessage(message);
  }
  stopSession() {
    this.implementation.dispose();
    return Promise.resolve(void 0);
  }
}
let WorkerExtHostDebugService = class extends ExtHostDebugServiceBase {
  constructor(extHostRpcService, workspaceService, extensionService, configurationService, editorTabs, variableResolver, commands, testing) {
    super(extHostRpcService, workspaceService, extensionService, configurationService, editorTabs, variableResolver, commands, testing);
  }
};
WorkerExtHostDebugService = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostWorkspace),
  __decorateParam(2, IExtHostExtensionService),
  __decorateParam(3, IExtHostConfiguration),
  __decorateParam(4, IExtHostEditorTabs),
  __decorateParam(5, IExtHostVariableResolverProvider),
  __decorateParam(6, IExtHostCommands),
  __decorateParam(7, IExtHostTesting)
], WorkerExtHostDebugService);
export {
  ExtHostDebugConsole,
  ExtHostDebugServiceBase,
  ExtHostDebugSession,
  IExtHostDebugService,
  WorkerExtHostDebugService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3REZWJ1Z1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgYXNQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIGFzIERpc3Bvc2FibGVDbHMsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gYXMgVGhlbWVJY29uVXRpbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU2lnblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zaWduL2NvbW1vbi9zaWduLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VGb2xkZXJEYXRhIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3REZWJ1Z0FkYXB0ZXIgfSBmcm9tICcuLi8uLi9jb250cmliL2RlYnVnL2NvbW1vbi9hYnN0cmFjdERlYnVnQWRhcHRlci5qcyc7XG5pbXBvcnQgeyBEZWJ1Z1Zpc3VhbGl6YXRpb25UeXBlLCBJQWRhcHRlckRlc2NyaXB0b3IsIElDb25maWcsIElEZWJ1Z0FkYXB0ZXIsIElEZWJ1Z0FkYXB0ZXJFeGVjdXRhYmxlLCBJRGVidWdBZGFwdGVySW1wbCwgSURlYnVnQWRhcHRlck5hbWVkUGlwZVNlcnZlciwgSURlYnVnQWRhcHRlclNlcnZlciwgSURlYnVnZ2VyQ29udHJpYnV0aW9uLCBJRGVidWdWaXN1YWxpemF0aW9uLCBJRGVidWdWaXN1YWxpemF0aW9uQ29udGV4dCwgSURlYnVnVmlzdWFsaXphdGlvblRyZWVJdGVtLCBNYWluVGhyZWFkRGVidWdWaXN1YWxpemF0aW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi9kZWJ1Zy9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgY29udmVydFRvREFQYXRocywgY29udmVydFRvVlNDUGF0aHMsIGlzRGVidWdnZXJNYWluQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi9kZWJ1Zy9jb21tb24vZGVidWdVdGlscy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBEdG8gfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgRGVidWdTZXNzaW9uVVVJRCwgRXh0SG9zdERlYnVnU2VydmljZVNoYXBlLCBJQnJlYWtwb2ludHNEZWx0YUR0bywgSURlYnVnU2Vzc2lvbkR0bywgSUZ1bmN0aW9uQnJlYWtwb2ludER0bywgSVNvdXJjZU11bHRpQnJlYWtwb2ludER0bywgSVN0YWNrRnJhbWVGb2N1c0R0bywgSVRocmVhZEZvY3VzRHRvLCBNYWluQ29udGV4dCwgTWFpblRocmVhZERlYnVnU2VydmljZVNoYXBlLCBNYWluVGhyZWFkVGVsZW1ldHJ5U2hhcGUgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb21tYW5kcyB9IGZyb20gJy4vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4vZXh0SG9zdENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RFZGl0b3JUYWJzIH0gZnJvbSAnLi9leHRIb3N0RWRpdG9yVGFicy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RFeHRlbnNpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RUZXN0aW5nIH0gZnJvbSAnLi9leHRIb3N0VGVzdGluZy5qcyc7XG5pbXBvcnQgKiBhcyBDb252ZXJ0IGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IEJyZWFrcG9pbnQsIERhdGFCcmVha3BvaW50LCBEZWJ1Z0FkYXB0ZXJFeGVjdXRhYmxlLCBEZWJ1Z0FkYXB0ZXJJbmxpbmVJbXBsZW1lbnRhdGlvbiwgRGVidWdBZGFwdGVyTmFtZWRQaXBlU2VydmVyLCBEZWJ1Z0FkYXB0ZXJTZXJ2ZXIsIERlYnVnQ29uc29sZU1vZGUsIERlYnVnU3RhY2tGcmFtZSwgRGVidWdUaHJlYWQsIERpc3Bvc2FibGUsIEZ1bmN0aW9uQnJlYWtwb2ludCwgTG9jYXRpb24sIFBvc2l0aW9uLCBzZXRCcmVha3BvaW50SWQsIFNvdXJjZUJyZWFrcG9pbnQsIFRoZW1lSWNvbiB9IGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VmFyaWFibGVSZXNvbHZlclByb3ZpZGVyIH0gZnJvbSAnLi9leHRIb3N0VmFyaWFibGVSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RXb3Jrc3BhY2UgfSBmcm9tICcuL2V4dEhvc3RXb3Jrc3BhY2UuanMnO1xuXG5leHBvcnQgY29uc3QgSUV4dEhvc3REZWJ1Z1NlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUV4dEhvc3REZWJ1Z1NlcnZpY2U+KCdJRXh0SG9zdERlYnVnU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRIb3N0RGVidWdTZXJ2aWNlIGV4dGVuZHMgRXh0SG9zdERlYnVnU2VydmljZVNoYXBlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRTdGFydERlYnVnU2Vzc2lvbjogRXZlbnQ8dnNjb2RlLkRlYnVnU2Vzc2lvbj47XG5cdHJlYWRvbmx5IG9uRGlkVGVybWluYXRlRGVidWdTZXNzaW9uOiBFdmVudDx2c2NvZGUuRGVidWdTZXNzaW9uPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVEZWJ1Z1Nlc3Npb246IEV2ZW50PHZzY29kZS5EZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQ+O1xuXHRhY3RpdmVEZWJ1Z1Nlc3Npb246IHZzY29kZS5EZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQ7XG5cdGFjdGl2ZURlYnVnQ29uc29sZTogdnNjb2RlLkRlYnVnQ29uc29sZTtcblx0cmVhZG9ubHkgb25EaWRSZWNlaXZlRGVidWdTZXNzaW9uQ3VzdG9tRXZlbnQ6IEV2ZW50PHZzY29kZS5EZWJ1Z1Nlc3Npb25DdXN0b21FdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQnJlYWtwb2ludHM6IEV2ZW50PHZzY29kZS5CcmVha3BvaW50c0NoYW5nZUV2ZW50Pjtcblx0YnJlYWtwb2ludHM6IHZzY29kZS5CcmVha3BvaW50W107XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlU3RhY2tJdGVtOiBFdmVudDx2c2NvZGUuRGVidWdUaHJlYWQgfCB2c2NvZGUuRGVidWdTdGFja0ZyYW1lIHwgdW5kZWZpbmVkPjtcblx0YWN0aXZlU3RhY2tJdGVtOiB2c2NvZGUuRGVidWdUaHJlYWQgfCB2c2NvZGUuRGVidWdTdGFja0ZyYW1lIHwgdW5kZWZpbmVkO1xuXG5cdGFkZEJyZWFrcG9pbnRzKGJyZWFrcG9pbnRzMDogcmVhZG9ubHkgdnNjb2RlLkJyZWFrcG9pbnRbXSk6IFByb21pc2U8dm9pZD47XG5cdHJlbW92ZUJyZWFrcG9pbnRzKGJyZWFrcG9pbnRzMDogcmVhZG9ubHkgdnNjb2RlLkJyZWFrcG9pbnRbXSk6IFByb21pc2U8dm9pZD47XG5cdHN0YXJ0RGVidWdnaW5nKGZvbGRlcjogdnNjb2RlLldvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCwgbmFtZU9yQ29uZmlnOiBzdHJpbmcgfCB2c2NvZGUuRGVidWdDb25maWd1cmF0aW9uLCBvcHRpb25zOiB2c2NvZGUuRGVidWdTZXNzaW9uT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj47XG5cdHN0b3BEZWJ1Z2dpbmcoc2Vzc2lvbj86IHZzY29kZS5EZWJ1Z1Nlc3Npb24pOiBQcm9taXNlPHZvaWQ+O1xuXHRyZWdpc3RlckRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKHR5cGU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlciwgdHJpZ2dlcjogdnNjb2RlLkRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyVHJpZ2dlcktpbmQpOiB2c2NvZGUuRGlzcG9zYWJsZTtcblx0cmVnaXN0ZXJEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeShleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdHlwZTogc3RyaW5nLCBmYWN0b3J5OiB2c2NvZGUuRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkpOiB2c2NvZGUuRGlzcG9zYWJsZTtcblx0cmVnaXN0ZXJEZWJ1Z0FkYXB0ZXJUcmFja2VyRmFjdG9yeSh0eXBlOiBzdHJpbmcsIGZhY3Rvcnk6IHZzY29kZS5EZWJ1Z0FkYXB0ZXJUcmFja2VyRmFjdG9yeSk6IHZzY29kZS5EaXNwb3NhYmxlO1xuXHRyZWdpc3RlckRlYnVnVmlzdWFsaXphdGlvblByb3ZpZGVyPFQgZXh0ZW5kcyB2c2NvZGUuRGVidWdWaXN1YWxpemF0aW9uPihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWQ6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5EZWJ1Z1Zpc3VhbGl6YXRpb25Qcm92aWRlcjxUPik6IHZzY29kZS5EaXNwb3NhYmxlO1xuXHRyZWdpc3RlckRlYnVnVmlzdWFsaXphdGlvblRyZWU8VCBleHRlbmRzIHZzY29kZS5EZWJ1Z1RyZWVJdGVtPihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWQ6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5EZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlPFQ+KTogdnNjb2RlLkRpc3Bvc2FibGU7XG5cdGFzRGVidWdTb3VyY2VVcmkoc291cmNlOiB2c2NvZGUuRGVidWdQcm90b2NvbFNvdXJjZSwgc2Vzc2lvbj86IHZzY29kZS5EZWJ1Z1Nlc3Npb24pOiB2c2NvZGUuVXJpO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRXh0SG9zdERlYnVnU2VydmljZUJhc2UgZXh0ZW5kcyBEaXNwb3NhYmxlQ2xzIGltcGxlbWVudHMgSUV4dEhvc3REZWJ1Z1NlcnZpY2UsIEV4dEhvc3REZWJ1Z1NlcnZpY2VTaGFwZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfY29uZmlnUHJvdmlkZXJIYW5kbGVDb3VudGVyOiBudW1iZXI7XG5cdHByaXZhdGUgX2NvbmZpZ1Byb3ZpZGVyczogQ29uZmlnUHJvdmlkZXJUdXBsZVtdO1xuXG5cdHByaXZhdGUgX2FkYXB0ZXJGYWN0b3J5SGFuZGxlQ291bnRlcjogbnVtYmVyO1xuXHRwcml2YXRlIF9hZGFwdGVyRmFjdG9yaWVzOiBEZXNjcmlwdG9yRmFjdG9yeVR1cGxlW107XG5cblx0cHJpdmF0ZSBfdHJhY2tlckZhY3RvcnlIYW5kbGVDb3VudGVyOiBudW1iZXI7XG5cdHByaXZhdGUgX3RyYWNrZXJGYWN0b3JpZXM6IFRyYWNrZXJGYWN0b3J5VHVwbGVbXTtcblxuXHRwcml2YXRlIF9kZWJ1Z1NlcnZpY2VQcm94eTogTWFpblRocmVhZERlYnVnU2VydmljZVNoYXBlO1xuXHRwcml2YXRlIF9kZWJ1Z1Nlc3Npb25zOiBNYXA8RGVidWdTZXNzaW9uVVVJRCwgRXh0SG9zdERlYnVnU2Vzc2lvbj4gPSBuZXcgTWFwPERlYnVnU2Vzc2lvblVVSUQsIEV4dEhvc3REZWJ1Z1Nlc3Npb24+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdGFydERlYnVnU2Vzc2lvbjogRW1pdHRlcjx2c2NvZGUuRGVidWdTZXNzaW9uPjtcblx0Z2V0IG9uRGlkU3RhcnREZWJ1Z1Nlc3Npb24oKTogRXZlbnQ8dnNjb2RlLkRlYnVnU2Vzc2lvbj4geyByZXR1cm4gdGhpcy5fb25EaWRTdGFydERlYnVnU2Vzc2lvbi5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVGVybWluYXRlRGVidWdTZXNzaW9uOiBFbWl0dGVyPHZzY29kZS5EZWJ1Z1Nlc3Npb24+O1xuXHRnZXQgb25EaWRUZXJtaW5hdGVEZWJ1Z1Nlc3Npb24oKTogRXZlbnQ8dnNjb2RlLkRlYnVnU2Vzc2lvbj4geyByZXR1cm4gdGhpcy5fb25EaWRUZXJtaW5hdGVEZWJ1Z1Nlc3Npb24uZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZURlYnVnU2Vzc2lvbjogRW1pdHRlcjx2c2NvZGUuRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkPjtcblx0Z2V0IG9uRGlkQ2hhbmdlQWN0aXZlRGVidWdTZXNzaW9uKCk6IEV2ZW50PHZzY29kZS5EZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlRGVidWdTZXNzaW9uLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSBfYWN0aXZlRGVidWdTZXNzaW9uOiBFeHRIb3N0RGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRnZXQgYWN0aXZlRGVidWdTZXNzaW9uKCk6IHZzY29kZS5EZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fYWN0aXZlRGVidWdTZXNzaW9uPy5hcGk7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlY2VpdmVEZWJ1Z1Nlc3Npb25DdXN0b21FdmVudDogRW1pdHRlcjx2c2NvZGUuRGVidWdTZXNzaW9uQ3VzdG9tRXZlbnQ+O1xuXHRnZXQgb25EaWRSZWNlaXZlRGVidWdTZXNzaW9uQ3VzdG9tRXZlbnQoKTogRXZlbnQ8dnNjb2RlLkRlYnVnU2Vzc2lvbkN1c3RvbUV2ZW50PiB7IHJldHVybiB0aGlzLl9vbkRpZFJlY2VpdmVEZWJ1Z1Nlc3Npb25DdXN0b21FdmVudC5ldmVudDsgfVxuXG5cdHByaXZhdGUgX2FjdGl2ZURlYnVnQ29uc29sZTogRXh0SG9zdERlYnVnQ29uc29sZTtcblx0Z2V0IGFjdGl2ZURlYnVnQ29uc29sZSgpOiB2c2NvZGUuRGVidWdDb25zb2xlIHsgcmV0dXJuIHRoaXMuX2FjdGl2ZURlYnVnQ29uc29sZS52YWx1ZTsgfVxuXG5cdHByaXZhdGUgX2JyZWFrcG9pbnRzOiBNYXA8c3RyaW5nLCB2c2NvZGUuQnJlYWtwb2ludD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VCcmVha3BvaW50czogRW1pdHRlcjx2c2NvZGUuQnJlYWtwb2ludHNDaGFuZ2VFdmVudD47XG5cblx0cHJpdmF0ZSBfYWN0aXZlU3RhY2tJdGVtOiB2c2NvZGUuRGVidWdUaHJlYWQgfCB2c2NvZGUuRGVidWdTdGFja0ZyYW1lIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZVN0YWNrSXRlbTogRW1pdHRlcjx2c2NvZGUuRGVidWdUaHJlYWQgfCB2c2NvZGUuRGVidWdTdGFja0ZyYW1lIHwgdW5kZWZpbmVkPjtcblxuXHRwcml2YXRlIF9kZWJ1Z0FkYXB0ZXJzOiBNYXA8bnVtYmVyLCBJRGVidWdBZGFwdGVyPjtcblx0cHJpdmF0ZSBfZGVidWdBZGFwdGVyc1RyYWNrZXJzOiBNYXA8bnVtYmVyLCB2c2NvZGUuRGVidWdBZGFwdGVyVHJhY2tlcj47XG5cblx0cHJpdmF0ZSBfZGVidWdWaXN1YWxpemF0aW9uVHJlZUl0ZW1JZHNDb3VudGVyID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVidWdWaXN1YWxpemF0aW9uUHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIHZzY29kZS5EZWJ1Z1Zpc3VhbGl6YXRpb25Qcm92aWRlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVidWdWaXN1YWxpemF0aW9uVHJlZXMgPSBuZXcgTWFwPHN0cmluZywgdnNjb2RlLkRlYnVnVmlzdWFsaXphdGlvblRyZWU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnVmlzdWFsaXphdGlvblRyZWVJdGVtSWRzID0gbmV3IFdlYWtNYXA8dnNjb2RlLkRlYnVnVHJlZUl0ZW0sIG51bWJlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVidWdWaXN1YWxpemF0aW9uRWxlbWVudHMgPSBuZXcgTWFwPG51bWJlciwgeyBwcm92aWRlcjogc3RyaW5nOyBpdGVtOiB2c2NvZGUuRGVidWdUcmVlSXRlbTsgY2hpbGRyZW4/OiBudW1iZXJbXSB9PigpO1xuXG5cdHByaXZhdGUgX3NpZ25TZXJ2aWNlOiBJU2lnblNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdmlzdWFsaXplcnMgPSBuZXcgTWFwPG51bWJlciwgeyB2OiB2c2NvZGUuRGVidWdWaXN1YWxpemF0aW9uOyBwcm92aWRlcjogdnNjb2RlLkRlYnVnVmlzdWFsaXphdGlvblByb3ZpZGVyOyBleHRlbnNpb25JZDogc3RyaW5nIH0+KCk7XG5cdHByaXZhdGUgX3Zpc3VhbGl6ZXJJZENvdW50ZXIgPSAwO1xuXG5cdHByaXZhdGUgX3RlbGVtZXRyeVByb3h5OiBNYWluVGhyZWFkVGVsZW1ldHJ5U2hhcGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjU2VydmljZTogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdFdvcmtzcGFjZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3dvcmtzcGFjZVNlcnZpY2U6IElFeHRIb3N0V29ya3NwYWNlLFxuXHRcdEBJRXh0SG9zdEV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdENvbmZpZ3VyYXRpb24gcHJvdGVjdGVkIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUV4dEhvc3RDb25maWd1cmF0aW9uLFxuXHRcdEBJRXh0SG9zdEVkaXRvclRhYnMgcHJvdGVjdGVkIHJlYWRvbmx5IF9lZGl0b3JUYWJzOiBJRXh0SG9zdEVkaXRvclRhYnMsXG5cdFx0QElFeHRIb3N0VmFyaWFibGVSZXNvbHZlclByb3ZpZGVyIHByaXZhdGUgcmVhZG9ubHkgX3ZhcmlhYmxlUmVzb2x2ZXI6IElFeHRIb3N0VmFyaWFibGVSZXNvbHZlclByb3ZpZGVyLFxuXHRcdEBJRXh0SG9zdENvbW1hbmRzIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRzOiBJRXh0SG9zdENvbW1hbmRzLFxuXHRcdEBJRXh0SG9zdFRlc3RpbmcgcHJpdmF0ZSByZWFkb25seSBfdGVzdGluZzogSUV4dEhvc3RUZXN0aW5nLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fY29uZmlnUHJvdmlkZXJIYW5kbGVDb3VudGVyID0gMDtcblx0XHR0aGlzLl9jb25maWdQcm92aWRlcnMgPSBbXTtcblxuXHRcdHRoaXMuX2FkYXB0ZXJGYWN0b3J5SGFuZGxlQ291bnRlciA9IDA7XG5cdFx0dGhpcy5fYWRhcHRlckZhY3RvcmllcyA9IFtdO1xuXG5cdFx0dGhpcy5fdHJhY2tlckZhY3RvcnlIYW5kbGVDb3VudGVyID0gMDtcblx0XHR0aGlzLl90cmFja2VyRmFjdG9yaWVzID0gW107XG5cblx0XHR0aGlzLl9kZWJ1Z0FkYXB0ZXJzID0gbmV3IE1hcCgpO1xuXHRcdHRoaXMuX2RlYnVnQWRhcHRlcnNUcmFja2VycyA9IG5ldyBNYXAoKTtcblxuXHRcdHRoaXMuX29uRGlkU3RhcnREZWJ1Z1Nlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2c2NvZGUuRGVidWdTZXNzaW9uPigpKTtcblx0XHR0aGlzLl9vbkRpZFRlcm1pbmF0ZURlYnVnU2Vzc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZzY29kZS5EZWJ1Z1Nlc3Npb24+KCkpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlRGVidWdTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dnNjb2RlLkRlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZD4oKSk7XG5cdFx0dGhpcy5fb25EaWRSZWNlaXZlRGVidWdTZXNzaW9uQ3VzdG9tRXZlbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2c2NvZGUuRGVidWdTZXNzaW9uQ3VzdG9tRXZlbnQ+KCkpO1xuXG5cdFx0dGhpcy5fZGVidWdTZXJ2aWNlUHJveHkgPSBleHRIb3N0UnBjU2VydmljZS5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkRGVidWdTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2c2NvZGUuQnJlYWtwb2ludHNDaGFuZ2VFdmVudD4oKSk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZVN0YWNrSXRlbSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZzY29kZS5EZWJ1Z1RocmVhZCB8IHZzY29kZS5EZWJ1Z1N0YWNrRnJhbWUgfCB1bmRlZmluZWQ+KCkpO1xuXG5cdFx0dGhpcy5fYWN0aXZlRGVidWdDb25zb2xlID0gbmV3IEV4dEhvc3REZWJ1Z0NvbnNvbGUodGhpcy5fZGVidWdTZXJ2aWNlUHJveHkpO1xuXG5cdFx0dGhpcy5fYnJlYWtwb2ludHMgPSBuZXcgTWFwPHN0cmluZywgdnNjb2RlLkJyZWFrcG9pbnQ+KCk7XG5cblx0XHR0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvblJlZ2lzdHJ5KCkudGhlbigoZXh0ZW5zaW9uUmVnaXN0cnk6IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnkpID0+IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGV4dGVuc2lvblJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlKF8gPT4ge1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyQWxsRGVidWdUeXBlcyhleHRlbnNpb25SZWdpc3RyeSk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyQWxsRGVidWdUeXBlcyhleHRlbnNpb25SZWdpc3RyeSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl90ZWxlbWV0cnlQcm94eSA9IGV4dEhvc3RScGNTZXJ2aWNlLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRUZWxlbWV0cnkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRnZXRWaXN1YWxpemVyVHJlZUl0ZW0odHJlZUlkOiBzdHJpbmcsIGVsZW1lbnQ6IElEZWJ1Z1Zpc3VhbGl6YXRpb25Db250ZXh0KTogUHJvbWlzZTxJRGVidWdWaXN1YWxpemF0aW9uVHJlZUl0ZW0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5oeWRyYXRlVmlzdWFsaXphdGlvbkNvbnRleHQoZWxlbWVudCk7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW0gPSBhd2FpdCB0aGlzLl9kZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlcy5nZXQodHJlZUlkKT8uZ2V0VHJlZUl0ZW0/Lihjb250ZXh0KTtcblx0XHRyZXR1cm4gaXRlbSA/IHRoaXMuY29udmVydFZpc3VhbGl6ZXJUcmVlSXRlbSh0cmVlSWQsIGl0ZW0pIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyRGVidWdWaXN1YWxpemF0aW9uVHJlZTxUIGV4dGVuZHMgdnNjb2RlLkRlYnVnVHJlZUl0ZW0+KG1hbmlmZXN0OiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlkOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuRGVidWdWaXN1YWxpemF0aW9uVHJlZTxUPik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBleHRlbnNpb25JZCA9IEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkobWFuaWZlc3QuaWRlbnRpZmllcik7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5leHRlbnNpb25WaXNLZXkoZXh0ZW5zaW9uSWQsIGlkKTtcblx0XHRpZiAodGhpcy5fZGVidWdWaXN1YWxpemF0aW9uUHJvdmlkZXJzLmhhcyhrZXkpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEEgZGVidWcgdmlzdWFsaXphdGlvbiBwcm92aWRlciB3aXRoIGlkICcke2lkfScgaXMgYWxyZWFkeSByZWdpc3RlcmVkYCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGVidWdWaXN1YWxpemF0aW9uVHJlZXMuc2V0KGtleSwgcHJvdmlkZXIpO1xuXHRcdHRoaXMuX2RlYnVnU2VydmljZVByb3h5LiRyZWdpc3RlckRlYnVnVmlzdWFsaXplclRyZWUoa2V5LCAhIXByb3ZpZGVyLmVkaXRJdGVtKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2RlYnVnU2VydmljZVByb3h5LiR1bnJlZ2lzdGVyRGVidWdWaXN1YWxpemVyVHJlZShrZXkpO1xuXHRcdFx0dGhpcy5fZGVidWdWaXN1YWxpemF0aW9uVHJlZXMuZGVsZXRlKGlkKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkZ2V0VmlzdWFsaXplclRyZWVJdGVtQ2hpbGRyZW4odHJlZUlkOiBzdHJpbmcsIGVsZW1lbnQ6IG51bWJlcik6IFByb21pc2U8SURlYnVnVmlzdWFsaXphdGlvblRyZWVJdGVtW10+IHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5fZGVidWdWaXN1YWxpemF0aW9uRWxlbWVudHMuZ2V0KGVsZW1lbnQpPy5pdGVtO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgdGhpcy5fZGVidWdWaXN1YWxpemF0aW9uVHJlZXMuZ2V0KHRyZWVJZCk/LmdldENoaWxkcmVuPy4oaXRlbSk7XG5cdFx0cmV0dXJuIGNoaWxkcmVuPy5tYXAoaSA9PiB0aGlzLmNvbnZlcnRWaXN1YWxpemVyVHJlZUl0ZW0odHJlZUlkLCBpKSkgfHwgW107XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGVkaXRWaXN1YWxpemVyVHJlZUl0ZW0oZWxlbWVudDogbnVtYmVyLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTxJRGVidWdWaXN1YWxpemF0aW9uVHJlZUl0ZW0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBlID0gdGhpcy5fZGVidWdWaXN1YWxpemF0aW9uRWxlbWVudHMuZ2V0KGVsZW1lbnQpO1xuXHRcdGlmICghZSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRjb25zdCByID0gYXdhaXQgdGhpcy5fZGVidWdWaXN1YWxpemF0aW9uVHJlZXMuZ2V0KGUucHJvdmlkZXIpPy5lZGl0SXRlbT8uKGUuaXRlbSwgdmFsdWUpO1xuXHRcdHJldHVybiB0aGlzLmNvbnZlcnRWaXN1YWxpemVyVHJlZUl0ZW0oZS5wcm92aWRlciwgciB8fCBlLml0ZW0pO1xuXHR9XG5cblx0cHVibGljICRkaXNwb3NlVmlzdWFsaXplZFRyZWUoZWxlbWVudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgcm9vdCA9IHRoaXMuX2RlYnVnVmlzdWFsaXphdGlvbkVsZW1lbnRzLmdldChlbGVtZW50KTtcblx0XHRpZiAoIXJvb3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBxdWV1ZSA9IFtyb290LmNoaWxkcmVuXTtcblx0XHRmb3IgKGNvbnN0IGNoaWxkcmVuIG9mIHF1ZXVlKSB7XG5cdFx0XHRpZiAoY2hpbGRyZW4pIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuXHRcdFx0XHRcdHF1ZXVlLnB1c2godGhpcy5fZGVidWdWaXN1YWxpemF0aW9uRWxlbWVudHMuZ2V0KGNoaWxkKT8uY2hpbGRyZW4pO1xuXHRcdFx0XHRcdHRoaXMuX2RlYnVnVmlzdWFsaXphdGlvbkVsZW1lbnRzLmRlbGV0ZShjaGlsZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNvbnZlcnRWaXN1YWxpemVyVHJlZUl0ZW0odHJlZUlkOiBzdHJpbmcsIGl0ZW06IHZzY29kZS5EZWJ1Z1RyZWVJdGVtKTogSURlYnVnVmlzdWFsaXphdGlvblRyZWVJdGVtIHtcblx0XHRsZXQgaWQgPSB0aGlzLl9kZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlSXRlbUlkcy5nZXQoaXRlbSk7XG5cdFx0aWYgKCFpZCkge1xuXHRcdFx0aWQgPSB0aGlzLl9kZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlSXRlbUlkc0NvdW50ZXIrKztcblx0XHRcdHRoaXMuX2RlYnVnVmlzdWFsaXphdGlvblRyZWVJdGVtSWRzLnNldChpdGVtLCBpZCk7XG5cdFx0XHR0aGlzLl9kZWJ1Z1Zpc3VhbGl6YXRpb25FbGVtZW50cy5zZXQoaWQsIHsgcHJvdmlkZXI6IHRyZWVJZCwgaXRlbSB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gQ29udmVydC5EZWJ1Z1RyZWVJdGVtLmZyb20oaXRlbSwgaWQpO1xuXHR9XG5cblx0cHVibGljIGFzRGVidWdTb3VyY2VVcmkoc3JjOiB2c2NvZGUuRGVidWdQcm90b2NvbFNvdXJjZSwgc2Vzc2lvbj86IHZzY29kZS5EZWJ1Z1Nlc3Npb24pOiBVUkkge1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3Qgc291cmNlID0gPGFueT5zcmM7XG5cblx0XHRpZiAodHlwZW9mIHNvdXJjZS5zb3VyY2VSZWZlcmVuY2UgPT09ICdudW1iZXInICYmIHNvdXJjZS5zb3VyY2VSZWZlcmVuY2UgPiAwKSB7XG5cdFx0XHQvLyBzcmMgY2FuIGJlIHJldHJpZXZlZCB2aWEgREFQJ3MgXCJzb3VyY2VcIiByZXF1ZXN0XG5cblx0XHRcdGxldCBkZWJ1ZyA9IGBkZWJ1Zzoke2VuY29kZVVSSUNvbXBvbmVudChzb3VyY2UucGF0aCB8fCAnJyl9YDtcblx0XHRcdGxldCBzZXAgPSAnPyc7XG5cblx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdGRlYnVnICs9IGAke3NlcH1zZXNzaW9uPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHNlc3Npb24uaWQpfWA7XG5cdFx0XHRcdHNlcCA9ICcmJztcblx0XHRcdH1cblxuXHRcdFx0ZGVidWcgKz0gYCR7c2VwfXJlZj0ke3NvdXJjZS5zb3VyY2VSZWZlcmVuY2V9YDtcblxuXHRcdFx0cmV0dXJuIFVSSS5wYXJzZShkZWJ1Zyk7XG5cdFx0fSBlbHNlIGlmIChzb3VyY2UucGF0aCkge1xuXHRcdFx0Ly8gc3JjIGlzIGp1c3QgYSBsb2NhbCBmaWxlIHBhdGhcblx0XHRcdHJldHVybiBVUkkuZmlsZShzb3VyY2UucGF0aCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgY2Fubm90IGNyZWF0ZSB1cmkgZnJvbSBEQVAgJ3NvdXJjZScgb2JqZWN0OyBwcm9wZXJ0aWVzICdwYXRoJyBhbmQgJ3NvdXJjZVJlZmVyZW5jZScgYXJlIGJvdGggbWlzc2luZy5gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQWxsRGVidWdUeXBlcyhleHRlbnNpb25SZWdpc3RyeTogRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeSkge1xuXG5cdFx0Y29uc3QgZGVidWdUeXBlczogc3RyaW5nW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgZWQgb2YgZXh0ZW5zaW9uUmVnaXN0cnkuZ2V0QWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKCkpIHtcblx0XHRcdGlmIChlZC5jb250cmlidXRlcykge1xuXHRcdFx0XHRjb25zdCBkZWJ1Z2dlcnMgPSA8SURlYnVnZ2VyQ29udHJpYnV0aW9uW10+ZWQuY29udHJpYnV0ZXNbJ2RlYnVnZ2VycyddO1xuXHRcdFx0XHRpZiAoZGVidWdnZXJzICYmIGRlYnVnZ2Vycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBkYmcgb2YgZGVidWdnZXJzKSB7XG5cdFx0XHRcdFx0XHRpZiAoaXNEZWJ1Z2dlck1haW5Db250cmlidXRpb24oZGJnKSkge1xuXHRcdFx0XHRcdFx0XHRkZWJ1Z1R5cGVzLnB1c2goZGJnLnR5cGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2RlYnVnU2VydmljZVByb3h5LiRyZWdpc3RlckRlYnVnVHlwZXMoZGVidWdUeXBlcyk7XG5cdH1cblxuXHQvLyBleHRlbnNpb24gZGVidWcgQVBJXG5cblxuXHRnZXQgYWN0aXZlU3RhY2tJdGVtKCk6IHZzY29kZS5EZWJ1Z1RocmVhZCB8IHZzY29kZS5EZWJ1Z1N0YWNrRnJhbWUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmVTdGFja0l0ZW07XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VBY3RpdmVTdGFja0l0ZW0oKTogRXZlbnQ8dnNjb2RlLkRlYnVnVGhyZWFkIHwgdnNjb2RlLkRlYnVnU3RhY2tGcmFtZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZVN0YWNrSXRlbS5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZUJyZWFrcG9pbnRzKCk6IEV2ZW50PHZzY29kZS5CcmVha3BvaW50c0NoYW5nZUV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZXZlbnQ7XG5cdH1cblxuXHRnZXQgYnJlYWtwb2ludHMoKTogdnNjb2RlLkJyZWFrcG9pbnRbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiB2c2NvZGUuQnJlYWtwb2ludFtdID0gW107XG5cdFx0dGhpcy5fYnJlYWtwb2ludHMuZm9yRWFjaChicCA9PiByZXN1bHQucHVzaChicCkpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJHJlc29sdmVEZWJ1Z1Zpc3VhbGl6ZXIoaWQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNYWluVGhyZWFkRGVidWdWaXN1YWxpemF0aW9uPiB7XG5cdFx0Y29uc3QgdmlzdWFsaXplciA9IHRoaXMuX3Zpc3VhbGl6ZXJzLmdldChpZCk7XG5cdFx0aWYgKCF2aXN1YWxpemVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGRlYnVnIHZpc3VhbGl6ZXIgZm91bmQgd2l0aCBpZCAnJHtpZH0nYCk7XG5cdFx0fVxuXG5cdFx0bGV0IHsgdiwgcHJvdmlkZXIsIGV4dGVuc2lvbklkIH0gPSB2aXN1YWxpemVyO1xuXHRcdGlmICghdi52aXN1YWxpemF0aW9uKSB7XG5cdFx0XHR2ID0gYXdhaXQgcHJvdmlkZXIucmVzb2x2ZURlYnVnVmlzdWFsaXphdGlvbj8uKHYsIHRva2VuKSB8fCB2O1xuXHRcdFx0dmlzdWFsaXplci52ID0gdjtcblx0XHR9XG5cblx0XHRpZiAoIXYudmlzdWFsaXphdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyB2aXN1YWxpemF0aW9uIHJldHVybmVkIGZyb20gcmVzb2x2ZURlYnVnVmlzdWFsaXphdGlvbiBpbiAnJHtwcm92aWRlcn0nYCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc2VyaWFsaXplVmlzdWFsaXphdGlvbihleHRlbnNpb25JZCwgdi52aXN1YWxpemF0aW9uKSE7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGV4ZWN1dGVEZWJ1Z1Zpc3VhbGl6ZXJDb21tYW5kKGlkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2aXN1YWxpemVyID0gdGhpcy5fdmlzdWFsaXplcnMuZ2V0KGlkKTtcblx0XHRpZiAoIXZpc3VhbGl6ZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gZGVidWcgdmlzdWFsaXplciBmb3VuZCB3aXRoIGlkICcke2lkfSdgKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kID0gdmlzdWFsaXplci52LnZpc3VhbGl6YXRpb247XG5cdFx0aWYgKGNvbW1hbmQgJiYgJ2NvbW1hbmQnIGluIGNvbW1hbmQpIHtcblx0XHRcdHRoaXMuX2NvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmQuY29tbWFuZCwgLi4uKGNvbW1hbmQuYXJndW1lbnRzIHx8IFtdKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoeWRyYXRlVmlzdWFsaXphdGlvbkNvbnRleHQoY29udGV4dDogSURlYnVnVmlzdWFsaXphdGlvbkNvbnRleHQpOiB2c2NvZGUuRGVidWdWaXN1YWxpemF0aW9uQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2RlYnVnU2Vzc2lvbnMuZ2V0KGNvbnRleHQuc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gc2Vzc2lvbiAmJiB7XG5cdFx0XHRzZXNzaW9uOiBzZXNzaW9uLmFwaSxcblx0XHRcdHZhcmlhYmxlOiBjb250ZXh0LnZhcmlhYmxlLFxuXHRcdFx0Y29udGFpbmVySWQ6IGNvbnRleHQuY29udGFpbmVySWQsXG5cdFx0XHRmcmFtZUlkOiBjb250ZXh0LmZyYW1lSWQsXG5cdFx0XHR0aHJlYWRJZDogY29udGV4dC50aHJlYWRJZCxcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRwcm92aWRlRGVidWdWaXN1YWxpemVycyhleHRlbnNpb25JZDogc3RyaW5nLCBpZDogc3RyaW5nLCBjb250ZXh0OiBJRGVidWdWaXN1YWxpemF0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRGVidWdWaXN1YWxpemF0aW9uLlNlcmlhbGl6ZWRbXT4ge1xuXHRcdGNvbnN0IGNvbnRleHRIeWRyYXRlZCA9IHRoaXMuaHlkcmF0ZVZpc3VhbGl6YXRpb25Db250ZXh0KGNvbnRleHQpO1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuZXh0ZW5zaW9uVmlzS2V5KGV4dGVuc2lvbklkLCBpZCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9kZWJ1Z1Zpc3VhbGl6YXRpb25Qcm92aWRlcnMuZ2V0KGtleSk7XG5cdFx0aWYgKCFjb250ZXh0SHlkcmF0ZWQgfHwgIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gW107IC8vIHByb2JhYmx5IGVuZGVkIGluIHRoZSBtZWFudGltZVxuXHRcdH1cblxuXHRcdGNvbnN0IHZpc3VhbGl6YXRpb25zID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZURlYnVnVmlzdWFsaXphdGlvbihjb250ZXh0SHlkcmF0ZWQsIHRva2VuKTtcblxuXHRcdGlmICghdmlzdWFsaXphdGlvbnMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdmlzdWFsaXphdGlvbnMubWFwKHYgPT4ge1xuXHRcdFx0Y29uc3QgaWQgPSArK3RoaXMuX3Zpc3VhbGl6ZXJJZENvdW50ZXI7XG5cdFx0XHR0aGlzLl92aXN1YWxpemVycy5zZXQoaWQsIHsgdiwgcHJvdmlkZXIsIGV4dGVuc2lvbklkIH0pO1xuXHRcdFx0Y29uc3QgaWNvbiA9IHYuaWNvblBhdGggPyB0aGlzLmdldEljb25QYXRoT3JDbGFzcyh2Lmljb25QYXRoKSA6IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRuYW1lOiB2Lm5hbWUsXG5cdFx0XHRcdGljb25DbGFzczogaWNvbj8uaWNvbkNsYXNzLFxuXHRcdFx0XHRpY29uUGF0aDogaWNvbj8uaWNvblBhdGgsXG5cdFx0XHRcdHZpc3VhbGl6YXRpb246IHRoaXMuc2VyaWFsaXplVmlzdWFsaXphdGlvbihleHRlbnNpb25JZCwgdi52aXN1YWxpemF0aW9uKSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgJGRpc3Bvc2VEZWJ1Z1Zpc3VhbGl6ZXJzKGlkczogbnVtYmVyW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuXHRcdFx0dGhpcy5fdmlzdWFsaXplcnMuZGVsZXRlKGlkKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJEZWJ1Z1Zpc3VhbGl6YXRpb25Qcm92aWRlcjxUIGV4dGVuZHMgdnNjb2RlLkRlYnVnVmlzdWFsaXphdGlvbj4obWFuaWZlc3Q6IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWQ6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5EZWJ1Z1Zpc3VhbGl6YXRpb25Qcm92aWRlcjxUPik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRpZiAoIW1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5kZWJ1Z1Zpc3VhbGl6ZXJzPy5zb21lKHIgPT4gci5pZCA9PT0gaWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEV4dGVuc2lvbnMgbWF5IG9ubHkgY2FsbCByZWdpc3RlckRlYnVnVmlzdWFsaXphdGlvblByb3ZpZGVyKCkgZm9yIHJlbmRlcmVycyB0aGV5IGNvbnRyaWJ1dGUgKGdvdCAke2lkfSlgKTtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25JZCA9IEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkobWFuaWZlc3QuaWRlbnRpZmllcik7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5leHRlbnNpb25WaXNLZXkoZXh0ZW5zaW9uSWQsIGlkKTtcblx0XHRpZiAodGhpcy5fZGVidWdWaXN1YWxpemF0aW9uUHJvdmlkZXJzLmhhcyhrZXkpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEEgZGVidWcgdmlzdWFsaXphdGlvbiBwcm92aWRlciB3aXRoIGlkICcke2lkfScgaXMgYWxyZWFkeSByZWdpc3RlcmVkYCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGVidWdWaXN1YWxpemF0aW9uUHJvdmlkZXJzLnNldChrZXksIHByb3ZpZGVyKTtcblx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kcmVnaXN0ZXJEZWJ1Z1Zpc3VhbGl6ZXIoZXh0ZW5zaW9uSWQsIGlkKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2RlYnVnU2VydmljZVByb3h5LiR1bnJlZ2lzdGVyRGVidWdWaXN1YWxpemVyKGV4dGVuc2lvbklkLCBpZCk7XG5cdFx0XHR0aGlzLl9kZWJ1Z1Zpc3VhbGl6YXRpb25Qcm92aWRlcnMuZGVsZXRlKGlkKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhZGRCcmVha3BvaW50cyhicmVha3BvaW50czA6IHZzY29kZS5CcmVha3BvaW50W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBmaWx0ZXIgb25seSBuZXcgYnJlYWtwb2ludHNcblx0XHRjb25zdCBicmVha3BvaW50cyA9IGJyZWFrcG9pbnRzMC5maWx0ZXIoYnAgPT4ge1xuXHRcdFx0Y29uc3QgaWQgPSBicC5pZDtcblx0XHRcdGlmICghdGhpcy5fYnJlYWtwb2ludHMuaGFzKGlkKSkge1xuXHRcdFx0XHR0aGlzLl9icmVha3BvaW50cy5zZXQoaWQsIGJwKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cblx0XHQvLyBzZW5kIG5vdGlmaWNhdGlvbiBmb3IgYWRkZWQgYnJlYWtwb2ludHNcblx0XHR0aGlzLmZpcmVCcmVha3BvaW50Q2hhbmdlcyhicmVha3BvaW50cywgW10sIFtdKTtcblxuXHRcdC8vIGNvbnZlcnQgYWRkZWQgYnJlYWtwb2ludHMgdG8gRFRPc1xuXHRcdGNvbnN0IGR0b3M6IEFycmF5PElTb3VyY2VNdWx0aUJyZWFrcG9pbnREdG8gfCBJRnVuY3Rpb25CcmVha3BvaW50RHRvPiA9IFtdO1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBNYXA8c3RyaW5nLCBJU291cmNlTXVsdGlCcmVha3BvaW50RHRvPigpO1xuXHRcdGZvciAoY29uc3QgYnAgb2YgYnJlYWtwb2ludHMpIHtcblx0XHRcdGlmIChicCBpbnN0YW5jZW9mIFNvdXJjZUJyZWFrcG9pbnQpIHtcblx0XHRcdFx0bGV0IGR0byA9IG1hcC5nZXQoYnAubG9jYXRpb24udXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRpZiAoIWR0bykge1xuXHRcdFx0XHRcdGR0byA9IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzb3VyY2VNdWx0aScsXG5cdFx0XHRcdFx0XHR1cmk6IGJwLmxvY2F0aW9uLnVyaSxcblx0XHRcdFx0XHRcdGxpbmVzOiBbXVxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElTb3VyY2VNdWx0aUJyZWFrcG9pbnREdG87XG5cdFx0XHRcdFx0bWFwLnNldChicC5sb2NhdGlvbi51cmkudG9TdHJpbmcoKSwgZHRvKTtcblx0XHRcdFx0XHRkdG9zLnB1c2goZHRvKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkdG8ubGluZXMucHVzaCh7XG5cdFx0XHRcdFx0aWQ6IGJwLmlkLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IGJwLmVuYWJsZWQsXG5cdFx0XHRcdFx0Y29uZGl0aW9uOiBicC5jb25kaXRpb24sXG5cdFx0XHRcdFx0aGl0Q29uZGl0aW9uOiBicC5oaXRDb25kaXRpb24sXG5cdFx0XHRcdFx0bG9nTWVzc2FnZTogYnAubG9nTWVzc2FnZSxcblx0XHRcdFx0XHRsaW5lOiBicC5sb2NhdGlvbi5yYW5nZS5zdGFydC5saW5lLFxuXHRcdFx0XHRcdGNoYXJhY3RlcjogYnAubG9jYXRpb24ucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLFxuXHRcdFx0XHRcdG1vZGU6IGJwLm1vZGUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChicCBpbnN0YW5jZW9mIEZ1bmN0aW9uQnJlYWtwb2ludCkge1xuXHRcdFx0XHRkdG9zLnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6ICdmdW5jdGlvbicsXG5cdFx0XHRcdFx0aWQ6IGJwLmlkLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IGJwLmVuYWJsZWQsXG5cdFx0XHRcdFx0aGl0Q29uZGl0aW9uOiBicC5oaXRDb25kaXRpb24sXG5cdFx0XHRcdFx0bG9nTWVzc2FnZTogYnAubG9nTWVzc2FnZSxcblx0XHRcdFx0XHRjb25kaXRpb246IGJwLmNvbmRpdGlvbixcblx0XHRcdFx0XHRmdW5jdGlvbk5hbWU6IGJwLmZ1bmN0aW9uTmFtZSxcblx0XHRcdFx0XHRtb2RlOiBicC5tb2RlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBzZW5kIERUT3MgdG8gVlMgQ29kZVxuXHRcdHJldHVybiB0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kcmVnaXN0ZXJCcmVha3BvaW50cyhkdG9zKTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVCcmVha3BvaW50cyhicmVha3BvaW50czA6IHZzY29kZS5CcmVha3BvaW50W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyByZW1vdmUgZnJvbSBhcnJheVxuXHRcdGNvbnN0IGJyZWFrcG9pbnRzID0gYnJlYWtwb2ludHMwLmZpbHRlcihiID0+IHRoaXMuX2JyZWFrcG9pbnRzLmRlbGV0ZShiLmlkKSk7XG5cblx0XHQvLyBzZW5kIG5vdGlmaWNhdGlvblxuXHRcdHRoaXMuZmlyZUJyZWFrcG9pbnRDaGFuZ2VzKFtdLCBicmVha3BvaW50cywgW10pO1xuXG5cdFx0Ly8gdW5yZWdpc3RlciB3aXRoIFZTIENvZGVcblx0XHRjb25zdCBpZHMgPSBicmVha3BvaW50cy5maWx0ZXIoYnAgPT4gYnAgaW5zdGFuY2VvZiBTb3VyY2VCcmVha3BvaW50KS5tYXAoYnAgPT4gYnAuaWQpO1xuXHRcdGNvbnN0IGZpZHMgPSBicmVha3BvaW50cy5maWx0ZXIoYnAgPT4gYnAgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQpLm1hcChicCA9PiBicC5pZCk7XG5cdFx0Y29uc3QgZGlkcyA9IGJyZWFrcG9pbnRzLmZpbHRlcihicCA9PiBicCBpbnN0YW5jZW9mIERhdGFCcmVha3BvaW50KS5tYXAoYnAgPT4gYnAuaWQpO1xuXHRcdHJldHVybiB0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kdW5yZWdpc3RlckJyZWFrcG9pbnRzKGlkcywgZmlkcywgZGlkcyk7XG5cdH1cblxuXHRwdWJsaWMgc3RhcnREZWJ1Z2dpbmcoZm9sZGVyOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkLCBuYW1lT3JDb25maWc6IHN0cmluZyB8IHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb24sIG9wdGlvbnM6IHZzY29kZS5EZWJ1Z1Nlc3Npb25PcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgdGVzdFJ1bk1ldGEgPSBvcHRpb25zLnRlc3RSdW4gJiYgdGhpcy5fdGVzdGluZy5nZXRNZXRhZGF0YUZvclJ1bihvcHRpb25zLnRlc3RSdW4pO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2RlYnVnU2VydmljZVByb3h5LiRzdGFydERlYnVnZ2luZyhmb2xkZXIgPyBmb2xkZXIudXJpIDogdW5kZWZpbmVkLCBuYW1lT3JDb25maWcsIHtcblx0XHRcdHBhcmVudFNlc3Npb25JRDogb3B0aW9ucy5wYXJlbnRTZXNzaW9uID8gb3B0aW9ucy5wYXJlbnRTZXNzaW9uLmlkIDogdW5kZWZpbmVkLFxuXHRcdFx0bGlmZWN5Y2xlTWFuYWdlZEJ5UGFyZW50OiBvcHRpb25zLmxpZmVjeWNsZU1hbmFnZWRCeVBhcmVudCxcblx0XHRcdHJlcGw6IG9wdGlvbnMuY29uc29sZU1vZGUgPT09IERlYnVnQ29uc29sZU1vZGUuTWVyZ2VXaXRoUGFyZW50ID8gJ21lcmdlV2l0aFBhcmVudCcgOiAnc2VwYXJhdGUnLFxuXHRcdFx0bm9EZWJ1Zzogb3B0aW9ucy5ub0RlYnVnLFxuXHRcdFx0Y29tcGFjdDogb3B0aW9ucy5jb21wYWN0LFxuXHRcdFx0c3VwcHJlc3NTYXZlQmVmb3JlU3RhcnQ6IG9wdGlvbnMuc3VwcHJlc3NTYXZlQmVmb3JlU3RhcnQsXG5cdFx0XHR0ZXN0UnVuOiB0ZXN0UnVuTWV0YSAmJiB7XG5cdFx0XHRcdHJ1bklkOiB0ZXN0UnVuTWV0YS5ydW5JZCxcblx0XHRcdFx0dGFza0lkOiB0ZXN0UnVuTWV0YS50YXNrSWQsXG5cdFx0XHR9LFxuXG5cdFx0XHQvLyBDaGVjayBkZWJ1Z1VJIGZvciBiYWNrLWNvbXBhdCwgIzE0NzI2NFxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRzdXBwcmVzc0RlYnVnU3RhdHVzYmFyOiBvcHRpb25zLnN1cHByZXNzRGVidWdTdGF0dXNiYXIgPz8gKG9wdGlvbnMgYXMgYW55KS5kZWJ1Z1VJPy5zaW1wbGUsXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHN1cHByZXNzRGVidWdUb29sYmFyOiBvcHRpb25zLnN1cHByZXNzRGVidWdUb29sYmFyID8/IChvcHRpb25zIGFzIGFueSkuZGVidWdVST8uc2ltcGxlLFxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRzdXBwcmVzc0RlYnVnVmlldzogb3B0aW9ucy5zdXBwcmVzc0RlYnVnVmlldyA/PyAob3B0aW9ucyBhcyBhbnkpLmRlYnVnVUk/LnNpbXBsZSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBzdG9wRGVidWdnaW5nKHNlc3Npb24/OiB2c2NvZGUuRGVidWdTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlYnVnU2VydmljZVByb3h5LiRzdG9wRGVidWdnaW5nKHNlc3Npb24gPyBzZXNzaW9uLmlkIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlckRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKHR5cGU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlciwgdHJpZ2dlcjogdnNjb2RlLkRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyVHJpZ2dlcktpbmQpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT4geyB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9jb25maWdQcm92aWRlckhhbmRsZUNvdW50ZXIrKztcblx0XHR0aGlzLl9jb25maWdQcm92aWRlcnMucHVzaCh7IHR5cGUsIGhhbmRsZSwgcHJvdmlkZXIgfSk7XG5cblx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kcmVnaXN0ZXJEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcih0eXBlLCB0cmlnZ2VyLFxuXHRcdFx0ISFwcm92aWRlci5wcm92aWRlRGVidWdDb25maWd1cmF0aW9ucyxcblx0XHRcdCEhcHJvdmlkZXIucmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbixcblx0XHRcdCEhcHJvdmlkZXIucmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbldpdGhTdWJzdGl0dXRlZFZhcmlhYmxlcyxcblx0XHRcdGhhbmRsZSk7XG5cblx0XHRyZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29uZmlnUHJvdmlkZXJzID0gdGhpcy5fY29uZmlnUHJvdmlkZXJzLmZpbHRlcihwID0+IHAucHJvdmlkZXIgIT09IHByb3ZpZGVyKTtcdFx0Ly8gcmVtb3ZlXG5cdFx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kdW5yZWdpc3RlckRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKGhhbmRsZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeShleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdHlwZTogc3RyaW5nLCBmYWN0b3J5OiB2c2NvZGUuRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cblx0XHRpZiAoIWZhY3RvcnkpIHtcblx0XHRcdHJldHVybiBuZXcgRGlzcG9zYWJsZSgoKSA9PiB7IH0pO1xuXHRcdH1cblxuXHRcdC8vIGEgRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkgY2FuIG9ubHkgYmUgcmVnaXN0ZXJlZCBpbiB0aGUgZXh0ZW5zaW9uIHRoYXQgY29udHJpYnV0ZXMgdGhlIGRlYnVnZ2VyXG5cdFx0aWYgKCF0aGlzLmRlZmluZXNEZWJ1Z1R5cGUoZXh0ZW5zaW9uLCB0eXBlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBhIERlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5IGNhbiBvbmx5IGJlIHJlZ2lzdGVyZWQgZnJvbSB0aGUgZXh0ZW5zaW9uIHRoYXQgZGVmaW5lcyB0aGUgJyR7dHlwZX0nIGRlYnVnZ2VyLmApO1xuXHRcdH1cblxuXHRcdC8vIG1ha2Ugc3VyZSB0aGF0IG9ubHkgb25lIGZhY3RvcnkgZm9yIHRoaXMgdHlwZSBpcyByZWdpc3RlcmVkXG5cdFx0aWYgKHRoaXMuZ2V0QWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5QnlUeXBlKHR5cGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGEgRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkgY2FuIG9ubHkgYmUgcmVnaXN0ZXJlZCBvbmNlIHBlciBhIHR5cGUuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRhcHRlckZhY3RvcnlIYW5kbGVDb3VudGVyKys7XG5cdFx0dGhpcy5fYWRhcHRlckZhY3Rvcmllcy5wdXNoKHsgdHlwZSwgaGFuZGxlLCBmYWN0b3J5IH0pO1xuXG5cdFx0dGhpcy5fZGVidWdTZXJ2aWNlUHJveHkuJHJlZ2lzdGVyRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkodHlwZSwgaGFuZGxlKTtcblxuXHRcdHJldHVybiBuZXcgRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9hZGFwdGVyRmFjdG9yaWVzID0gdGhpcy5fYWRhcHRlckZhY3Rvcmllcy5maWx0ZXIocCA9PiBwLmZhY3RvcnkgIT09IGZhY3RvcnkpO1x0XHQvLyByZW1vdmVcblx0XHRcdHRoaXMuX2RlYnVnU2VydmljZVByb3h5LiR1bnJlZ2lzdGVyRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkoaGFuZGxlKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlckRlYnVnQWRhcHRlclRyYWNrZXJGYWN0b3J5KHR5cGU6IHN0cmluZywgZmFjdG9yeTogdnNjb2RlLkRlYnVnQWRhcHRlclRyYWNrZXJGYWN0b3J5KTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXG5cdFx0aWYgKCFmYWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT4geyB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl90cmFja2VyRmFjdG9yeUhhbmRsZUNvdW50ZXIrKztcblx0XHR0aGlzLl90cmFja2VyRmFjdG9yaWVzLnB1c2goeyB0eXBlLCBoYW5kbGUsIGZhY3RvcnkgfSk7XG5cblx0XHRyZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdHJhY2tlckZhY3RvcmllcyA9IHRoaXMuX3RyYWNrZXJGYWN0b3JpZXMuZmlsdGVyKHAgPT4gcC5mYWN0b3J5ICE9PSBmYWN0b3J5KTtcdFx0Ly8gcmVtb3ZlXG5cdFx0fSk7XG5cdH1cblxuXHQvLyBSUEMgbWV0aG9kcyAoRXh0SG9zdERlYnVnU2VydmljZVNoYXBlKVxuXG5cdHB1YmxpYyBhc3luYyAkcnVuSW5UZXJtaW5hbChhcmdzOiBEZWJ1Z1Byb3RvY29sLlJ1bkluVGVybWluYWxSZXF1ZXN0QXJndW1lbnRzLCBzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRzdWJzdGl0dXRlVmFyaWFibGVzKGZvbGRlclVyaTogVXJpQ29tcG9uZW50cyB8IHVuZGVmaW5lZCwgY29uZmlnOiBJQ29uZmlnKTogUHJvbWlzZTxJQ29uZmlnPiB7XG5cdFx0bGV0IHdzOiBJV29ya3NwYWNlRm9sZGVyRGF0YSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBmb2xkZXIgPSBhd2FpdCB0aGlzLmdldEZvbGRlcihmb2xkZXJVcmkpO1xuXHRcdGlmIChmb2xkZXIpIHtcblx0XHRcdHdzID0ge1xuXHRcdFx0XHR1cmk6IGZvbGRlci51cmksXG5cdFx0XHRcdG5hbWU6IGZvbGRlci5uYW1lLFxuXHRcdFx0XHRpbmRleDogZm9sZGVyLmluZGV4LFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y29uc3QgdmFyaWFibGVSZXNvbHZlciA9IGF3YWl0IHRoaXMuX3ZhcmlhYmxlUmVzb2x2ZXIuZ2V0UmVzb2x2ZXIoKTtcblx0XHRyZXR1cm4gdmFyaWFibGVSZXNvbHZlci5yZXNvbHZlQXN5bmMod3MsIGNvbmZpZyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlRGVidWdBZGFwdGVyKGFkYXB0ZXI6IHZzY29kZS5EZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yLCBzZXNzaW9uOiBFeHRIb3N0RGVidWdTZXNzaW9uKTogQWJzdHJhY3REZWJ1Z0FkYXB0ZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmIChhZGFwdGVyIGluc3RhbmNlb2YgRGVidWdBZGFwdGVySW5saW5lSW1wbGVtZW50YXRpb24pIHtcblx0XHRcdHJldHVybiBuZXcgRGlyZWN0RGVidWdBZGFwdGVyKGFkYXB0ZXIuaW1wbGVtZW50YXRpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZVNpZ25TZXJ2aWNlKCk6IElTaWduU2VydmljZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkc3RhcnREQVNlc3Npb24oZGVidWdBZGFwdGVySGFuZGxlOiBudW1iZXIsIHNlc3Npb25EdG86IElEZWJ1Z1Nlc3Npb25EdG8pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBteXRoaXMgPSB0aGlzO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuZ2V0U2Vzc2lvbihzZXNzaW9uRHRvKTtcblxuXHRcdHJldHVybiB0aGlzLmdldEFkYXB0ZXJEZXNjcmlwdG9yKHRoaXMuZ2V0QWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5QnlUeXBlKHNlc3Npb24udHlwZSksIHNlc3Npb24pLnRoZW4oZGFEZXNjcmlwdG9yID0+IHtcblxuXHRcdFx0aWYgKCFkYURlc2NyaXB0b3IpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb3VsZG4ndCBmaW5kIGEgZGVidWcgYWRhcHRlciBkZXNjcmlwdG9yIGZvciBkZWJ1ZyB0eXBlICcke3Nlc3Npb24udHlwZX0nIChleHRlbnNpb24gbWlnaHQgaGF2ZSBmYWlsZWQgdG8gYWN0aXZhdGUpYCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRhID0gdGhpcy5jcmVhdGVEZWJ1Z0FkYXB0ZXIoZGFEZXNjcmlwdG9yLCBzZXNzaW9uKTtcblx0XHRcdGlmICghZGEpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb3VsZG4ndCBjcmVhdGUgYSBkZWJ1ZyBhZGFwdGVyIGZvciB0eXBlICcke3Nlc3Npb24udHlwZX0nLmApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWJ1Z0FkYXB0ZXIgPSBkYTtcblxuXHRcdFx0dGhpcy5fZGVidWdBZGFwdGVycy5zZXQoZGVidWdBZGFwdGVySGFuZGxlLCBkZWJ1Z0FkYXB0ZXIpO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5nZXREZWJ1Z0FkYXB0ZXJUcmFja2VycyhzZXNzaW9uKS50aGVuKHRyYWNrZXIgPT4ge1xuXG5cdFx0XHRcdGlmICh0cmFja2VyKSB7XG5cdFx0XHRcdFx0dGhpcy5fZGVidWdBZGFwdGVyc1RyYWNrZXJzLnNldChkZWJ1Z0FkYXB0ZXJIYW5kbGUsIHRyYWNrZXIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZGVidWdBZGFwdGVyLm9uTWVzc2FnZShhc3luYyBtZXNzYWdlID0+IHtcblxuXHRcdFx0XHRcdGlmIChtZXNzYWdlLnR5cGUgPT09ICdyZXF1ZXN0JyAmJiAoPERlYnVnUHJvdG9jb2wuUmVxdWVzdD5tZXNzYWdlKS5jb21tYW5kID09PSAnaGFuZHNoYWtlJykge1xuXG5cdFx0XHRcdFx0XHRjb25zdCByZXF1ZXN0ID0gPERlYnVnUHJvdG9jb2wuUmVxdWVzdD5tZXNzYWdlO1xuXG5cdFx0XHRcdFx0XHRjb25zdCByZXNwb25zZTogRGVidWdQcm90b2NvbC5SZXNwb25zZSA9IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3Jlc3BvbnNlJyxcblx0XHRcdFx0XHRcdFx0c2VxOiAwLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiByZXF1ZXN0LmNvbW1hbmQsXG5cdFx0XHRcdFx0XHRcdHJlcXVlc3Rfc2VxOiByZXF1ZXN0LnNlcSxcblx0XHRcdFx0XHRcdFx0c3VjY2VzczogdHJ1ZVxuXHRcdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdFx0aWYgKCF0aGlzLl9zaWduU2VydmljZSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9zaWduU2VydmljZSA9IHRoaXMuY3JlYXRlU2lnblNlcnZpY2UoKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMuX3NpZ25TZXJ2aWNlKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3Qgc2lnbmF0dXJlID0gYXdhaXQgdGhpcy5fc2lnblNlcnZpY2Uuc2lnbihyZXF1ZXN0LmFyZ3VtZW50cy52YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0cmVzcG9uc2UuYm9keSA9IHtcblx0XHRcdFx0XHRcdFx0XHRcdHNpZ25hdHVyZTogc2lnbmF0dXJlXG5cdFx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0XHRkZWJ1Z0FkYXB0ZXIuc2VuZFJlc3BvbnNlKHJlc3BvbnNlKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vIHNpZ25lcicpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3BvbnNlLnN1Y2Nlc3MgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0cmVzcG9uc2UubWVzc2FnZSA9IGUubWVzc2FnZTtcblx0XHRcdFx0XHRcdFx0ZGVidWdBZGFwdGVyLnNlbmRSZXNwb25zZShyZXNwb25zZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlmICh0cmFja2VyICYmIHRyYWNrZXIub25EaWRTZW5kTWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0XHR0cmFja2VyLm9uRGlkU2VuZE1lc3NhZ2UobWVzc2FnZSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIERBIC0+IFZTIENvZGVcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdC8vIFRyeSB0byBjYXRjaCBkZXRhaWxzIGZvciAjMjMzMTY3XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2UgPSBjb252ZXJ0VG9WU0NQYXRocyhtZXNzYWdlLCB0cnVlKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdFx0XHRcdGNvbnN0IHR5cGUgPSBtZXNzYWdlLnR5cGUgKyAnXycgKyAoKG1lc3NhZ2UgYXMgYW55KS5jb21tYW5kID8/IChtZXNzYWdlIGFzIGFueSkuZXZlbnQgPz8gJycpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlQcm94eS4kcHVibGljTG9nMjxEZWJ1Z1Byb3RvY29sTWVzc2FnZUVycm9yRXZlbnQsIERlYnVnUHJvdG9jb2xNZXNzYWdlRXJyb3JDbGFzc2lmaWNhdGlvbj4oJ2RlYnVnUHJvdG9jb2xNZXNzYWdlRXJyb3InLCB7IHR5cGUsIGZyb206IHNlc3Npb24udHlwZSB9KTtcblx0XHRcdFx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0bXl0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kYWNjZXB0REFNZXNzYWdlKGRlYnVnQWRhcHRlckhhbmRsZSwgbWVzc2FnZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVidWdBZGFwdGVyLm9uRXJyb3IoZXJyID0+IHtcblx0XHRcdFx0XHRpZiAodHJhY2tlciAmJiB0cmFja2VyLm9uRXJyb3IpIHtcblx0XHRcdFx0XHRcdHRyYWNrZXIub25FcnJvcihlcnIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kYWNjZXB0REFFcnJvcihkZWJ1Z0FkYXB0ZXJIYW5kbGUsIGVyci5uYW1lLCBlcnIubWVzc2FnZSwgZXJyLnN0YWNrKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlYnVnQWRhcHRlci5vbkV4aXQoKGNvZGU6IG51bWJlciB8IG51bGwpID0+IHtcblx0XHRcdFx0XHRpZiAodHJhY2tlciAmJiB0cmFja2VyLm9uRXhpdCkge1xuXHRcdFx0XHRcdFx0dHJhY2tlci5vbkV4aXQoY29kZSA/PyB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX2RlYnVnU2VydmljZVByb3h5LiRhY2NlcHREQUV4aXQoZGVidWdBZGFwdGVySGFuZGxlLCBjb2RlID8/IHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKHRyYWNrZXIgJiYgdHJhY2tlci5vbldpbGxTdGFydFNlc3Npb24pIHtcblx0XHRcdFx0XHR0cmFja2VyLm9uV2lsbFN0YXJ0U2Vzc2lvbigpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGRlYnVnQWRhcHRlci5zdGFydFNlc3Npb24oKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljICRzZW5kREFNZXNzYWdlKGRlYnVnQWRhcHRlckhhbmRsZTogbnVtYmVyLCBtZXNzYWdlOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSk6IHZvaWQge1xuXG5cdFx0Ly8gVlMgQ29kZSAtPiBEQVxuXHRcdG1lc3NhZ2UgPSBjb252ZXJ0VG9EQVBhdGhzKG1lc3NhZ2UsIGZhbHNlKTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSB0aGlzLl9kZWJ1Z0FkYXB0ZXJzVHJhY2tlcnMuZ2V0KGRlYnVnQWRhcHRlckhhbmRsZSk7XHQvLyBUT0RPQEFXOiBzYW1lIGhhbmRsZT9cblx0XHRpZiAodHJhY2tlciAmJiB0cmFja2VyLm9uV2lsbFJlY2VpdmVNZXNzYWdlKSB7XG5cdFx0XHR0cmFja2VyLm9uV2lsbFJlY2VpdmVNZXNzYWdlKG1lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhID0gdGhpcy5fZGVidWdBZGFwdGVycy5nZXQoZGVidWdBZGFwdGVySGFuZGxlKTtcblx0XHRkYT8uc2VuZE1lc3NhZ2UobWVzc2FnZSk7XG5cdH1cblxuXHRwdWJsaWMgJHN0b3BEQVNlc3Npb24oZGVidWdBZGFwdGVySGFuZGxlOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSB0aGlzLl9kZWJ1Z0FkYXB0ZXJzVHJhY2tlcnMuZ2V0KGRlYnVnQWRhcHRlckhhbmRsZSk7XG5cdFx0dGhpcy5fZGVidWdBZGFwdGVyc1RyYWNrZXJzLmRlbGV0ZShkZWJ1Z0FkYXB0ZXJIYW5kbGUpO1xuXHRcdGlmICh0cmFja2VyICYmIHRyYWNrZXIub25XaWxsU3RvcFNlc3Npb24pIHtcblx0XHRcdHRyYWNrZXIub25XaWxsU3RvcFNlc3Npb24oKTtcblx0XHR9XG5cblx0XHRjb25zdCBkYSA9IHRoaXMuX2RlYnVnQWRhcHRlcnMuZ2V0KGRlYnVnQWRhcHRlckhhbmRsZSk7XG5cdFx0dGhpcy5fZGVidWdBZGFwdGVycy5kZWxldGUoZGVidWdBZGFwdGVySGFuZGxlKTtcblx0XHRpZiAoZGEpIHtcblx0XHRcdHJldHVybiBkYS5zdG9wU2Vzc2lvbigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHZvaWQgMCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljICRhY2NlcHRCcmVha3BvaW50c0RlbHRhKGRlbHRhOiBJQnJlYWtwb2ludHNEZWx0YUR0byk6IHZvaWQge1xuXG5cdFx0Y29uc3QgYTogdnNjb2RlLkJyZWFrcG9pbnRbXSA9IFtdO1xuXHRcdGNvbnN0IHI6IHZzY29kZS5CcmVha3BvaW50W10gPSBbXTtcblx0XHRjb25zdCBjOiB2c2NvZGUuQnJlYWtwb2ludFtdID0gW107XG5cblx0XHRpZiAoZGVsdGEuYWRkZWQpIHtcblx0XHRcdGZvciAoY29uc3QgYnBkIG9mIGRlbHRhLmFkZGVkKSB7XG5cdFx0XHRcdGNvbnN0IGlkID0gYnBkLmlkO1xuXHRcdFx0XHRpZiAoaWQgJiYgIXRoaXMuX2JyZWFrcG9pbnRzLmhhcyhpZCkpIHtcblx0XHRcdFx0XHRsZXQgYnA6IEJyZWFrcG9pbnQ7XG5cdFx0XHRcdFx0aWYgKGJwZC50eXBlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0XHRicCA9IG5ldyBGdW5jdGlvbkJyZWFrcG9pbnQoYnBkLmZ1bmN0aW9uTmFtZSwgYnBkLmVuYWJsZWQsIGJwZC5jb25kaXRpb24sIGJwZC5oaXRDb25kaXRpb24sIGJwZC5sb2dNZXNzYWdlLCBicGQubW9kZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChicGQudHlwZSA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRcdFx0XHRicCA9IG5ldyBEYXRhQnJlYWtwb2ludChicGQubGFiZWwsIGJwZC5kYXRhSWQsIGJwZC5jYW5QZXJzaXN0LCBicGQuZW5hYmxlZCwgYnBkLmhpdENvbmRpdGlvbiwgYnBkLmNvbmRpdGlvbiwgYnBkLmxvZ01lc3NhZ2UsIGJwZC5tb2RlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShicGQudXJpKTtcblx0XHRcdFx0XHRcdGJwID0gbmV3IFNvdXJjZUJyZWFrcG9pbnQobmV3IExvY2F0aW9uKHVyaSwgbmV3IFBvc2l0aW9uKGJwZC5saW5lLCBicGQuY2hhcmFjdGVyKSksIGJwZC5lbmFibGVkLCBicGQuY29uZGl0aW9uLCBicGQuaGl0Q29uZGl0aW9uLCBicGQubG9nTWVzc2FnZSwgYnBkLm1vZGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzZXRCcmVha3BvaW50SWQoYnAsIGlkKTtcblx0XHRcdFx0XHR0aGlzLl9icmVha3BvaW50cy5zZXQoaWQsIGJwKTtcblx0XHRcdFx0XHRhLnB1c2goYnApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGRlbHRhLnJlbW92ZWQpIHtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgZGVsdGEucmVtb3ZlZCkge1xuXHRcdFx0XHRjb25zdCBicCA9IHRoaXMuX2JyZWFrcG9pbnRzLmdldChpZCk7XG5cdFx0XHRcdGlmIChicCkge1xuXHRcdFx0XHRcdHRoaXMuX2JyZWFrcG9pbnRzLmRlbGV0ZShpZCk7XG5cdFx0XHRcdFx0ci5wdXNoKGJwKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkZWx0YS5jaGFuZ2VkKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGJwZCBvZiBkZWx0YS5jaGFuZ2VkKSB7XG5cdFx0XHRcdGlmIChicGQuaWQpIHtcblx0XHRcdFx0XHRjb25zdCBicCA9IHRoaXMuX2JyZWFrcG9pbnRzLmdldChicGQuaWQpO1xuXHRcdFx0XHRcdGlmIChicCkge1xuXHRcdFx0XHRcdFx0aWYgKGJwIGluc3RhbmNlb2YgRnVuY3Rpb25CcmVha3BvaW50ICYmIGJwZC50eXBlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmYnAgPSA8YW55PmJwO1xuXHRcdFx0XHRcdFx0XHRmYnAuZW5hYmxlZCA9IGJwZC5lbmFibGVkO1xuXHRcdFx0XHRcdFx0XHRmYnAuY29uZGl0aW9uID0gYnBkLmNvbmRpdGlvbjtcblx0XHRcdFx0XHRcdFx0ZmJwLmhpdENvbmRpdGlvbiA9IGJwZC5oaXRDb25kaXRpb247XG5cdFx0XHRcdFx0XHRcdGZicC5sb2dNZXNzYWdlID0gYnBkLmxvZ01lc3NhZ2U7XG5cdFx0XHRcdFx0XHRcdGZicC5mdW5jdGlvbk5hbWUgPSBicGQuZnVuY3Rpb25OYW1lO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChicCBpbnN0YW5jZW9mIFNvdXJjZUJyZWFrcG9pbnQgJiYgYnBkLnR5cGUgPT09ICdzb3VyY2UnKSB7XG5cdFx0XHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzYnAgPSA8YW55PmJwO1xuXHRcdFx0XHRcdFx0XHRzYnAuZW5hYmxlZCA9IGJwZC5lbmFibGVkO1xuXHRcdFx0XHRcdFx0XHRzYnAuY29uZGl0aW9uID0gYnBkLmNvbmRpdGlvbjtcblx0XHRcdFx0XHRcdFx0c2JwLmhpdENvbmRpdGlvbiA9IGJwZC5oaXRDb25kaXRpb247XG5cdFx0XHRcdFx0XHRcdHNicC5sb2dNZXNzYWdlID0gYnBkLmxvZ01lc3NhZ2U7XG5cdFx0XHRcdFx0XHRcdHNicC5sb2NhdGlvbiA9IG5ldyBMb2NhdGlvbihVUkkucmV2aXZlKGJwZC51cmkpLCBuZXcgUG9zaXRpb24oYnBkLmxpbmUsIGJwZC5jaGFyYWN0ZXIpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGMucHVzaChicCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5maXJlQnJlYWtwb2ludENoYW5nZXMoYSwgciwgYyk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGFjY2VwdFN0YWNrRnJhbWVGb2N1cyhmb2N1c0R0bzogSVRocmVhZEZvY3VzRHRvIHwgSVN0YWNrRnJhbWVGb2N1c0R0byB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBmb2N1czogdnNjb2RlLkRlYnVnVGhyZWFkIHwgdnNjb2RlLkRlYnVnU3RhY2tGcmFtZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZm9jdXNEdG8pIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLmdldFNlc3Npb24oZm9jdXNEdG8uc2Vzc2lvbklkKTtcblx0XHRcdGlmIChmb2N1c0R0by5raW5kID09PSAndGhyZWFkJykge1xuXHRcdFx0XHRmb2N1cyA9IG5ldyBEZWJ1Z1RocmVhZChzZXNzaW9uLmFwaSwgZm9jdXNEdG8udGhyZWFkSWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9jdXMgPSBuZXcgRGVidWdTdGFja0ZyYW1lKHNlc3Npb24uYXBpLCBmb2N1c0R0by50aHJlYWRJZCwgZm9jdXNEdG8uZnJhbWVJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWN0aXZlU3RhY2tJdGVtID0gZm9jdXM7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVTdGFja0l0ZW0uZmlyZSh0aGlzLl9hY3RpdmVTdGFja0l0ZW0pO1xuXHR9XG5cblx0cHVibGljICRwcm92aWRlRGVidWdDb25maWd1cmF0aW9ucyhjb25maWdQcm92aWRlckhhbmRsZTogbnVtYmVyLCBmb2xkZXJVcmk6IFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLkRlYnVnQ29uZmlndXJhdGlvbltdPiB7XG5cdFx0cmV0dXJuIGFzUHJvbWlzZShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuZ2V0Q29uZmlnUHJvdmlkZXJCeUhhbmRsZShjb25maWdQcm92aWRlckhhbmRsZSk7XG5cdFx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignbm8gRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIgZm91bmQnKTtcblx0XHRcdH1cblx0XHRcdGlmICghcHJvdmlkZXIucHJvdmlkZURlYnVnQ29uZmlndXJhdGlvbnMpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlciBoYXMgbm8gbWV0aG9kIHByb3ZpZGVEZWJ1Z0NvbmZpZ3VyYXRpb25zJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmb2xkZXIgPSBhd2FpdCB0aGlzLmdldEZvbGRlcihmb2xkZXJVcmkpO1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVyLnByb3ZpZGVEZWJ1Z0NvbmZpZ3VyYXRpb25zKGZvbGRlciwgdG9rZW4pO1xuXHRcdH0pLnRoZW4oZGVidWdDb25maWd1cmF0aW9ucyA9PiB7XG5cdFx0XHRpZiAoIWRlYnVnQ29uZmlndXJhdGlvbnMpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdub3RoaW5nIHJldHVybmVkIGZyb20gRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIucHJvdmlkZURlYnVnQ29uZmlndXJhdGlvbnMnKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBkZWJ1Z0NvbmZpZ3VyYXRpb25zO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljICRyZXNvbHZlRGVidWdDb25maWd1cmF0aW9uKGNvbmZpZ1Byb3ZpZGVySGFuZGxlOiBudW1iZXIsIGZvbGRlclVyaTogVXJpQ29tcG9uZW50cyB8IHVuZGVmaW5lZCwgZGVidWdDb25maWd1cmF0aW9uOiB2c2NvZGUuRGVidWdDb25maWd1cmF0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb24gfCBudWxsIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIGFzUHJvbWlzZShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuZ2V0Q29uZmlnUHJvdmlkZXJCeUhhbmRsZShjb25maWdQcm92aWRlckhhbmRsZSk7XG5cdFx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignbm8gRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIgZm91bmQnKTtcblx0XHRcdH1cblx0XHRcdGlmICghcHJvdmlkZXIucmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0RlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyIGhhcyBubyBtZXRob2QgcmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbicpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZm9sZGVyID0gYXdhaXQgdGhpcy5nZXRGb2xkZXIoZm9sZGVyVXJpKTtcblx0XHRcdHJldHVybiBwcm92aWRlci5yZXNvbHZlRGVidWdDb25maWd1cmF0aW9uKGZvbGRlciwgZGVidWdDb25maWd1cmF0aW9uLCB0b2tlbik7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgJHJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb25XaXRoU3Vic3RpdHV0ZWRWYXJpYWJsZXMoY29uZmlnUHJvdmlkZXJIYW5kbGU6IG51bWJlciwgZm9sZGVyVXJpOiBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkLCBkZWJ1Z0NvbmZpZ3VyYXRpb246IHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLkRlYnVnQ29uZmlndXJhdGlvbiB8IG51bGwgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gYXNQcm9taXNlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5nZXRDb25maWdQcm92aWRlckJ5SGFuZGxlKGNvbmZpZ1Byb3ZpZGVySGFuZGxlKTtcblx0XHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdubyBEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlciBmb3VuZCcpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFwcm92aWRlci5yZXNvbHZlRGVidWdDb25maWd1cmF0aW9uV2l0aFN1YnN0aXR1dGVkVmFyaWFibGVzKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIgaGFzIG5vIG1ldGhvZCByZXNvbHZlRGVidWdDb25maWd1cmF0aW9uV2l0aFN1YnN0aXR1dGVkVmFyaWFibGVzJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmb2xkZXIgPSBhd2FpdCB0aGlzLmdldEZvbGRlcihmb2xkZXJVcmkpO1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVyLnJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb25XaXRoU3Vic3RpdHV0ZWRWYXJpYWJsZXMoZm9sZGVyLCBkZWJ1Z0NvbmZpZ3VyYXRpb24sIHRva2VuKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkcHJvdmlkZURlYnVnQWRhcHRlcihhZGFwdGVyRmFjdG9yeUhhbmRsZTogbnVtYmVyLCBzZXNzaW9uRHRvOiBJRGVidWdTZXNzaW9uRHRvKTogUHJvbWlzZTxEdG88SUFkYXB0ZXJEZXNjcmlwdG9yPj4ge1xuXHRcdGNvbnN0IGFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeSA9IHRoaXMuZ2V0QWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5QnlIYW5kbGUoYWRhcHRlckZhY3RvcnlIYW5kbGUpO1xuXHRcdGlmICghYWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdubyBhZGFwdGVyIGRlc2NyaXB0b3IgZmFjdG9yeSBmb3VuZCBmb3IgaGFuZGxlJykpO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5nZXRTZXNzaW9uKHNlc3Npb25EdG8pO1xuXHRcdHJldHVybiB0aGlzLmdldEFkYXB0ZXJEZXNjcmlwdG9yKGFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeSwgc2Vzc2lvbikudGhlbihhZGFwdGVyRGVzY3JpcHRvciA9PiB7XG5cdFx0XHRpZiAoIWFkYXB0ZXJEZXNjcmlwdG9yKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ291bGRuJ3QgZmluZCBhIGRlYnVnIGFkYXB0ZXIgZGVzY3JpcHRvciBmb3IgZGVidWcgdHlwZSAnJHtzZXNzaW9uLnR5cGV9J2ApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuY29udmVydFRvRHRvKGFkYXB0ZXJEZXNjcmlwdG9yKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkYWNjZXB0RGVidWdTZXNzaW9uU3RhcnRlZChzZXNzaW9uRHRvOiBJRGVidWdTZXNzaW9uRHRvKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuZ2V0U2Vzc2lvbihzZXNzaW9uRHRvKTtcblx0XHR0aGlzLl9vbkRpZFN0YXJ0RGVidWdTZXNzaW9uLmZpcmUoc2Vzc2lvbi5hcGkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRhY2NlcHREZWJ1Z1Nlc3Npb25UZXJtaW5hdGVkKHNlc3Npb25EdG86IElEZWJ1Z1Nlc3Npb25EdG8pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5nZXRTZXNzaW9uKHNlc3Npb25EdG8pO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFRlcm1pbmF0ZURlYnVnU2Vzc2lvbi5maXJlKHNlc3Npb24uYXBpKTtcblx0XHRcdHRoaXMuX2RlYnVnU2Vzc2lvbnMuZGVsZXRlKHNlc3Npb24uaWQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkYWNjZXB0RGVidWdTZXNzaW9uQWN0aXZlQ2hhbmdlZChzZXNzaW9uRHRvOiBJRGVidWdTZXNzaW9uRHRvIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fYWN0aXZlRGVidWdTZXNzaW9uID0gc2Vzc2lvbkR0byA/IGF3YWl0IHRoaXMuZ2V0U2Vzc2lvbihzZXNzaW9uRHRvKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZURlYnVnU2Vzc2lvbi5maXJlKHRoaXMuX2FjdGl2ZURlYnVnU2Vzc2lvbj8uYXBpKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkYWNjZXB0RGVidWdTZXNzaW9uTmFtZUNoYW5nZWQoc2Vzc2lvbkR0bzogSURlYnVnU2Vzc2lvbkR0bywgbmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuZ2V0U2Vzc2lvbihzZXNzaW9uRHRvKTtcblx0XHRzZXNzaW9uPy5fYWNjZXB0TmFtZUNoYW5nZWQobmFtZSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGFjY2VwdERlYnVnU2Vzc2lvbkN1c3RvbUV2ZW50KHNlc3Npb25EdG86IElEZWJ1Z1Nlc3Npb25EdG8sIGV2ZW50OiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5nZXRTZXNzaW9uKHNlc3Npb25EdG8pO1xuXHRcdGNvbnN0IGVlOiB2c2NvZGUuRGVidWdTZXNzaW9uQ3VzdG9tRXZlbnQgPSB7XG5cdFx0XHRzZXNzaW9uOiBzZXNzaW9uLmFwaSxcblx0XHRcdGV2ZW50OiBldmVudC5ldmVudCxcblx0XHRcdGJvZHk6IGV2ZW50LmJvZHlcblx0XHR9O1xuXHRcdHRoaXMuX29uRGlkUmVjZWl2ZURlYnVnU2Vzc2lvbkN1c3RvbUV2ZW50LmZpcmUoZWUpO1xuXHR9XG5cblx0Ly8gcHJpdmF0ZSAmIGR0byBoZWxwZXJzXG5cblx0cHJpdmF0ZSBjb252ZXJ0VG9EdG8oeDogdnNjb2RlLkRlYnVnQWRhcHRlckRlc2NyaXB0b3IpOiBEdG88SUFkYXB0ZXJEZXNjcmlwdG9yPiB7XG5cdFx0aWYgKHggaW5zdGFuY2VvZiBEZWJ1Z0FkYXB0ZXJFeGVjdXRhYmxlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb252ZXJ0RXhlY3V0YWJsZVRvRHRvKHgpO1xuXHRcdH0gZWxzZSBpZiAoeCBpbnN0YW5jZW9mIERlYnVnQWRhcHRlclNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29udmVydFNlcnZlclRvRHRvKHgpO1xuXHRcdH0gZWxzZSBpZiAoeCBpbnN0YW5jZW9mIERlYnVnQWRhcHRlck5hbWVkUGlwZVNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29udmVydFBpcGVTZXJ2ZXJUb0R0byh4KTtcblx0XHR9IGVsc2UgaWYgKHggaW5zdGFuY2VvZiBEZWJ1Z0FkYXB0ZXJJbmxpbmVJbXBsZW1lbnRhdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29udmVydEltcGxlbWVudGF0aW9uVG9EdG8oeCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignY29udmVydFRvRHRvIHVuZXhwZWN0ZWQgdHlwZScpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBjb252ZXJ0RXhlY3V0YWJsZVRvRHRvKHg6IERlYnVnQWRhcHRlckV4ZWN1dGFibGUpOiBJRGVidWdBZGFwdGVyRXhlY3V0YWJsZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6ICdleGVjdXRhYmxlJyxcblx0XHRcdGNvbW1hbmQ6IHguY29tbWFuZCxcblx0XHRcdGFyZ3M6IHguYXJncyxcblx0XHRcdG9wdGlvbnM6IHgub3B0aW9uc1xuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgY29udmVydFNlcnZlclRvRHRvKHg6IERlYnVnQWRhcHRlclNlcnZlcik6IElEZWJ1Z0FkYXB0ZXJTZXJ2ZXIge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnc2VydmVyJyxcblx0XHRcdHBvcnQ6IHgucG9ydCxcblx0XHRcdGhvc3Q6IHguaG9zdFxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgY29udmVydFBpcGVTZXJ2ZXJUb0R0byh4OiBEZWJ1Z0FkYXB0ZXJOYW1lZFBpcGVTZXJ2ZXIpOiBJRGVidWdBZGFwdGVyTmFtZWRQaXBlU2VydmVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ3BpcGVTZXJ2ZXInLFxuXHRcdFx0cGF0aDogeC5wYXRoXG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBjb252ZXJ0SW1wbGVtZW50YXRpb25Ub0R0byh4OiBEZWJ1Z0FkYXB0ZXJJbmxpbmVJbXBsZW1lbnRhdGlvbik6IElEZWJ1Z0FkYXB0ZXJJbXBsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ2ltcGxlbWVudGF0aW9uJyxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnlCeVR5cGUodHlwZTogc3RyaW5nKTogdnNjb2RlLkRlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXN1bHRzID0gdGhpcy5fYWRhcHRlckZhY3Rvcmllcy5maWx0ZXIocCA9PiBwLnR5cGUgPT09IHR5cGUpO1xuXHRcdGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiByZXN1bHRzWzBdLmZhY3Rvcnk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldEFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeUJ5SGFuZGxlKGhhbmRsZTogbnVtYmVyKTogdnNjb2RlLkRlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXN1bHRzID0gdGhpcy5fYWRhcHRlckZhY3Rvcmllcy5maWx0ZXIocCA9PiBwLmhhbmRsZSA9PT0gaGFuZGxlKTtcblx0XHRpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0c1swXS5mYWN0b3J5O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb25maWdQcm92aWRlckJ5SGFuZGxlKGhhbmRsZTogbnVtYmVyKTogdnNjb2RlLkRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXN1bHRzID0gdGhpcy5fY29uZmlnUHJvdmlkZXJzLmZpbHRlcihwID0+IHAuaGFuZGxlID09PSBoYW5kbGUpO1xuXHRcdGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiByZXN1bHRzWzBdLnByb3ZpZGVyO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBkZWZpbmVzRGVidWdUeXBlKGVkOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHR5cGU6IHN0cmluZykge1xuXHRcdGlmIChlZC5jb250cmlidXRlcykge1xuXHRcdFx0Y29uc3QgZGVidWdnZXJzID0gZWQuY29udHJpYnV0ZXNbJ2RlYnVnZ2VycyddO1xuXHRcdFx0aWYgKGRlYnVnZ2VycyAmJiBkZWJ1Z2dlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGRiZyBvZiBkZWJ1Z2dlcnMpIHtcblx0XHRcdFx0XHQvLyBvbmx5IGRlYnVnZ2VyIGNvbnRyaWJ1dGlvbnMgd2l0aCBhIFwibGFiZWxcIiBhcmUgY29uc2lkZXJlZCBhIFwiZGVmaW5pbmdcIiBkZWJ1Z2dlciBjb250cmlidXRpb25cblx0XHRcdFx0XHRpZiAoZGJnLmxhYmVsICYmIGRiZy50eXBlKSB7XG5cdFx0XHRcdFx0XHRpZiAoZGJnLnR5cGUgPT09IHR5cGUpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVidWdBZGFwdGVyVHJhY2tlcnMoc2Vzc2lvbjogRXh0SG9zdERlYnVnU2Vzc2lvbik6IFByb21pc2U8dnNjb2RlLkRlYnVnQWRhcHRlclRyYWNrZXIgfCB1bmRlZmluZWQ+IHtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IHNlc3Npb24uY29uZmlndXJhdGlvbjtcblx0XHRjb25zdCB0eXBlID0gY29uZmlnLnR5cGU7XG5cblx0XHRjb25zdCBwcm9taXNlcyA9IHRoaXMuX3RyYWNrZXJGYWN0b3JpZXNcblx0XHRcdC5maWx0ZXIodHVwbGUgPT4gdHVwbGUudHlwZSA9PT0gdHlwZSB8fCB0dXBsZS50eXBlID09PSAnKicpXG5cdFx0XHQubWFwKHR1cGxlID0+IGFzUHJvbWlzZTx2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLkRlYnVnQWRhcHRlclRyYWNrZXI+PigoKSA9PiB0dXBsZS5mYWN0b3J5LmNyZWF0ZURlYnVnQWRhcHRlclRyYWNrZXIoc2Vzc2lvbi5hcGkpKS50aGVuKHAgPT4gcCwgZXJyID0+IG51bGwpKTtcblxuXHRcdHJldHVybiBQcm9taXNlLnJhY2UoW1xuXHRcdFx0UHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0Y29uc3QgdHJhY2tlcnMgPSBjb2FsZXNjZShyZXN1bHQpO1x0Ly8gZmlsdGVyIG51bGxcblx0XHRcdFx0aWYgKHRyYWNrZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IE11bHRpVHJhY2tlcih0cmFja2Vycyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0pLFxuXHRcdFx0bmV3IFByb21pc2U8dW5kZWZpbmVkPihyZXNvbHZlID0+IHNldFRpbWVvdXQoKCkgPT4gcmVzb2x2ZSh1bmRlZmluZWQpLCAxMDAwKSksXG5cdFx0XSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdC8vIGlnbm9yZSBlcnJvcnNcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEFkYXB0ZXJEZXNjcmlwdG9yKGFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeTogdnNjb2RlLkRlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5IHwgdW5kZWZpbmVkLCBzZXNzaW9uOiBFeHRIb3N0RGVidWdTZXNzaW9uKTogUHJvbWlzZTx2c2NvZGUuRGVidWdBZGFwdGVyRGVzY3JpcHRvciB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Ly8gYSBcImRlYnVnU2VydmVyXCIgYXR0cmlidXRlIGluIHRoZSBsYXVuY2ggY29uZmlnIHRha2VzIHByZWNlZGVuY2Vcblx0XHRjb25zdCBzZXJ2ZXJQb3J0ID0gc2Vzc2lvbi5jb25maWd1cmF0aW9uLmRlYnVnU2VydmVyO1xuXHRcdGlmICh0eXBlb2Ygc2VydmVyUG9ydCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobmV3IERlYnVnQWRhcHRlclNlcnZlcihzZXJ2ZXJQb3J0KSk7XG5cdFx0fVxuXG5cdFx0aWYgKGFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeSkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uUmVnaXN0cnkgPSBhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvblJlZ2lzdHJ5KCk7XG5cdFx0XHRyZXR1cm4gYXNQcm9taXNlKCgpID0+IGFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeS5jcmVhdGVEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yKHNlc3Npb24uYXBpLCB0aGlzLmRhRXhlY3V0YWJsZUZyb21QYWNrYWdlKHNlc3Npb24sIGV4dGVuc2lvblJlZ2lzdHJ5KSkpLnRoZW4oZGFEZXNjcmlwdG9yID0+IHtcblx0XHRcdFx0aWYgKGRhRGVzY3JpcHRvcikge1xuXHRcdFx0XHRcdHJldHVybiBkYURlc2NyaXB0b3I7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIGZhbGxiYWNrOiB1c2UgZXhlY3V0YWJsZSBpbmZvcm1hdGlvbiBmcm9tIHBhY2thZ2UuanNvblxuXHRcdGNvbnN0IGV4dGVuc2lvblJlZ2lzdHJ5ID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb25SZWdpc3RyeSgpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5kYUV4ZWN1dGFibGVGcm9tUGFja2FnZShzZXNzaW9uLCBleHRlbnNpb25SZWdpc3RyeSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGRhRXhlY3V0YWJsZUZyb21QYWNrYWdlKHNlc3Npb246IEV4dEhvc3REZWJ1Z1Nlc3Npb24sIGV4dGVuc2lvblJlZ2lzdHJ5OiBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5KTogRGVidWdBZGFwdGVyRXhlY3V0YWJsZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZmlyZUJyZWFrcG9pbnRDaGFuZ2VzKGFkZGVkOiB2c2NvZGUuQnJlYWtwb2ludFtdLCByZW1vdmVkOiB2c2NvZGUuQnJlYWtwb2ludFtdLCBjaGFuZ2VkOiB2c2NvZGUuQnJlYWtwb2ludFtdKSB7XG5cdFx0aWYgKGFkZGVkLmxlbmd0aCA+IDAgfHwgcmVtb3ZlZC5sZW5ndGggPiAwIHx8IGNoYW5nZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VCcmVha3BvaW50cy5maXJlKE9iamVjdC5mcmVlemUoe1xuXHRcdFx0XHRhZGRlZCxcblx0XHRcdFx0cmVtb3ZlZCxcblx0XHRcdFx0Y2hhbmdlZCxcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFNlc3Npb24oZHRvOiBJRGVidWdTZXNzaW9uRHRvKTogUHJvbWlzZTxFeHRIb3N0RGVidWdTZXNzaW9uPiB7XG5cdFx0aWYgKGR0bykge1xuXHRcdFx0aWYgKHR5cGVvZiBkdG8gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbnN0IGRzID0gdGhpcy5fZGVidWdTZXNzaW9ucy5nZXQoZHRvKTtcblx0XHRcdFx0aWYgKGRzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGRzO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZXQgZHMgPSB0aGlzLl9kZWJ1Z1Nlc3Npb25zLmdldChkdG8uaWQpO1xuXHRcdFx0XHRpZiAoIWRzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZm9sZGVyID0gYXdhaXQgdGhpcy5nZXRGb2xkZXIoZHRvLmZvbGRlclVyaSk7XG5cdFx0XHRcdFx0Y29uc3QgcGFyZW50ID0gZHRvLnBhcmVudCA/IHRoaXMuX2RlYnVnU2Vzc2lvbnMuZ2V0KGR0by5wYXJlbnQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGRzID0gbmV3IEV4dEhvc3REZWJ1Z1Nlc3Npb24odGhpcy5fZGVidWdTZXJ2aWNlUHJveHksIGR0by5pZCwgZHRvLnR5cGUsIGR0by5uYW1lLCBmb2xkZXIsIGR0by5jb25maWd1cmF0aW9uLCBwYXJlbnQ/LmFwaSk7XG5cdFx0XHRcdFx0dGhpcy5fZGVidWdTZXNzaW9ucy5zZXQoZHMuaWQsIGRzKTtcblx0XHRcdFx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kc2Vzc2lvbkNhY2hlZChkcy5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGRzO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Nhbm5vdCBmaW5kIHNlc3Npb24nKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Rm9sZGVyKF9mb2xkZXJVcmk6IFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoX2ZvbGRlclVyaSkge1xuXHRcdFx0Y29uc3QgZm9sZGVyVVJJID0gVVJJLnJldml2ZShfZm9sZGVyVXJpKTtcblx0XHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VTZXJ2aWNlLnJlc29sdmVXb3Jrc3BhY2VGb2xkZXIoZm9sZGVyVVJJKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBleHRlbnNpb25WaXNLZXkoZXh0ZW5zaW9uSWQ6IHN0cmluZywgaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiBgJHtleHRlbnNpb25JZH1cXDAke2lkfWA7XG5cdH1cblxuXHRwcml2YXRlIHNlcmlhbGl6ZVZpc3VhbGl6YXRpb24oZXh0ZW5zaW9uSWQ6IHN0cmluZywgdml6OiB2c2NvZGUuRGVidWdWaXN1YWxpemF0aW9uWyd2aXN1YWxpemF0aW9uJ10pOiBNYWluVGhyZWFkRGVidWdWaXN1YWxpemF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXZpeikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoJ3RpdGxlJyBpbiB2aXogJiYgJ2NvbW1hbmQnIGluIHZpeikge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogRGVidWdWaXN1YWxpemF0aW9uVHlwZS5Db21tYW5kIH07XG5cdFx0fVxuXG5cdFx0aWYgKCd0cmVlSWQnIGluIHZpeikge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogRGVidWdWaXN1YWxpemF0aW9uVHlwZS5UcmVlLCBpZDogYCR7ZXh0ZW5zaW9uSWR9XFwwJHt2aXoudHJlZUlkfWAgfTtcblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIGRlYnVnIHZpc3VhbGl6YXRpb24gdHlwZScpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRJY29uUGF0aE9yQ2xhc3MoaWNvbjogdnNjb2RlLkRlYnVnVmlzdWFsaXphdGlvblsnaWNvblBhdGgnXSkge1xuXHRcdGNvbnN0IGljb25QYXRoT3JJY29uQ2xhc3MgPSB0aGlzLmdldEljb25VcmlzKGljb24pO1xuXHRcdGxldCBpY29uUGF0aDogeyBkYXJrOiBVUkk7IGxpZ2h0PzogVVJJIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGljb25DbGFzczogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmICgnaWQnIGluIGljb25QYXRoT3JJY29uQ2xhc3MpIHtcblx0XHRcdGljb25DbGFzcyA9IFRoZW1lSWNvblV0aWxzLmFzQ2xhc3NOYW1lKGljb25QYXRoT3JJY29uQ2xhc3MpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpY29uUGF0aCA9IGljb25QYXRoT3JJY29uQ2xhc3M7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGljb25QYXRoLFxuXHRcdFx0aWNvbkNsYXNzXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SWNvblVyaXMoaWNvblBhdGg6IHZzY29kZS5EZWJ1Z1Zpc3VhbGl6YXRpb25bJ2ljb25QYXRoJ10pOiB7IGRhcms6IFVSSTsgbGlnaHQ/OiBVUkkgfSB8IHsgaWQ6IHN0cmluZyB9IHtcblx0XHRpZiAoaWNvblBhdGggaW5zdGFuY2VvZiBUaGVtZUljb24pIHtcblx0XHRcdHJldHVybiB7IGlkOiBpY29uUGF0aC5pZCB9O1xuXHRcdH1cblx0XHRjb25zdCBkYXJrID0gdHlwZW9mIGljb25QYXRoID09PSAnb2JqZWN0JyAmJiAnZGFyaycgaW4gaWNvblBhdGggPyBpY29uUGF0aC5kYXJrIDogaWNvblBhdGg7XG5cdFx0Y29uc3QgbGlnaHQgPSB0eXBlb2YgaWNvblBhdGggPT09ICdvYmplY3QnICYmICdsaWdodCcgaW4gaWNvblBhdGggPyBpY29uUGF0aC5saWdodCA6IGljb25QYXRoO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkYXJrOiAodHlwZW9mIGRhcmsgPT09ICdzdHJpbmcnID8gVVJJLmZpbGUoZGFyaykgOiBkYXJrKSBhcyBVUkksXG5cdFx0XHRsaWdodDogKHR5cGVvZiBsaWdodCA9PT0gJ3N0cmluZycgPyBVUkkuZmlsZShsaWdodCkgOiBsaWdodCkgYXMgVVJJLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3REZWJ1Z1Nlc3Npb24ge1xuXHRwcml2YXRlIGFwaVNlc3Npb24/OiB2c2NvZGUuRGVidWdTZXNzaW9uO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9kZWJ1Z1NlcnZpY2VQcm94eTogTWFpblRocmVhZERlYnVnU2VydmljZVNoYXBlLFxuXHRcdHByaXZhdGUgX2lkOiBEZWJ1Z1Nlc3Npb25VVUlELFxuXHRcdHByaXZhdGUgX3R5cGU6IHN0cmluZyxcblx0XHRwcml2YXRlIF9uYW1lOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBfd29ya3NwYWNlRm9sZGVyOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgX2NvbmZpZ3VyYXRpb246IHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb24sXG5cdFx0cHJpdmF0ZSBfcGFyZW50U2Vzc2lvbjogdnNjb2RlLkRlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCkge1xuXHR9XG5cblx0cHVibGljIGdldCBhcGkoKTogdnNjb2RlLkRlYnVnU2Vzc2lvbiB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0cmV0dXJuIHRoaXMuYXBpU2Vzc2lvbiA/Pz0gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRpZDogdGhhdC5faWQsXG5cdFx0XHR0eXBlOiB0aGF0Ll90eXBlLFxuXHRcdFx0Z2V0IG5hbWUoKSB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9uYW1lO1xuXHRcdFx0fSxcblx0XHRcdHNldCBuYW1lKG5hbWU6IHN0cmluZykge1xuXHRcdFx0XHR0aGF0Ll9uYW1lID0gbmFtZTtcblx0XHRcdFx0dGhhdC5fZGVidWdTZXJ2aWNlUHJveHkuJHNldERlYnVnU2Vzc2lvbk5hbWUodGhhdC5faWQsIG5hbWUpO1xuXHRcdFx0fSxcblx0XHRcdHBhcmVudFNlc3Npb246IHRoYXQuX3BhcmVudFNlc3Npb24sXG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHRoYXQuX3dvcmtzcGFjZUZvbGRlcixcblx0XHRcdGNvbmZpZ3VyYXRpb246IHRoYXQuX2NvbmZpZ3VyYXRpb24sXG5cdFx0XHRjdXN0b21SZXF1ZXN0KGNvbW1hbmQ6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX2RlYnVnU2VydmljZVByb3h5LiRjdXN0b21EZWJ1Z0FkYXB0ZXJSZXF1ZXN0KHRoYXQuX2lkLCBjb21tYW5kLCBhcmdzKTtcblx0XHRcdH0sXG5cdFx0XHRnZXREZWJ1Z1Byb3RvY29sQnJlYWtwb2ludChicmVha3BvaW50OiB2c2NvZGUuQnJlYWtwb2ludCk6IFByb21pc2U8dnNjb2RlLkRlYnVnUHJvdG9jb2xCcmVha3BvaW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9kZWJ1Z1NlcnZpY2VQcm94eS4kZ2V0RGVidWdQcm90b2NvbEJyZWFrcG9pbnQodGhhdC5faWQsIGJyZWFrcG9pbnQuaWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldCBpZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9pZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdHlwZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl90eXBlO1xuXHR9XG5cblx0X2FjY2VwdE5hbWVDaGFuZ2VkKG5hbWU6IHN0cmluZykge1xuXHRcdHRoaXMuX25hbWUgPSBuYW1lO1xuXHR9XG5cblx0cHVibGljIGdldCBjb25maWd1cmF0aW9uKCk6IHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0RGVidWdDb25zb2xlIHtcblxuXHRyZWFkb25seSB2YWx1ZTogdnNjb2RlLkRlYnVnQ29uc29sZTtcblxuXHRjb25zdHJ1Y3Rvcihwcm94eTogTWFpblRocmVhZERlYnVnU2VydmljZVNoYXBlKSB7XG5cblx0XHR0aGlzLnZhbHVlID0gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRhcHBlbmQodmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0XHRwcm94eS4kYXBwZW5kRGVidWdDb25zb2xlKHZhbHVlKTtcblx0XHRcdH0sXG5cdFx0XHRhcHBlbmRMaW5lKHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdFx0dGhpcy5hcHBlbmQodmFsdWUgKyAnXFxuJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIENvbmZpZ1Byb3ZpZGVyVHVwbGUge1xuXHR0eXBlOiBzdHJpbmc7XG5cdGhhbmRsZTogbnVtYmVyO1xuXHRwcm92aWRlcjogdnNjb2RlLkRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyO1xufVxuXG5pbnRlcmZhY2UgRGVzY3JpcHRvckZhY3RvcnlUdXBsZSB7XG5cdHR5cGU6IHN0cmluZztcblx0aGFuZGxlOiBudW1iZXI7XG5cdGZhY3Rvcnk6IHZzY29kZS5EZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeTtcbn1cblxuaW50ZXJmYWNlIFRyYWNrZXJGYWN0b3J5VHVwbGUge1xuXHR0eXBlOiBzdHJpbmc7XG5cdGhhbmRsZTogbnVtYmVyO1xuXHRmYWN0b3J5OiB2c2NvZGUuRGVidWdBZGFwdGVyVHJhY2tlckZhY3Rvcnk7XG59XG5cbmNsYXNzIE11bHRpVHJhY2tlciBpbXBsZW1lbnRzIHZzY29kZS5EZWJ1Z0FkYXB0ZXJUcmFja2VyIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHRyYWNrZXJzOiB2c2NvZGUuRGVidWdBZGFwdGVyVHJhY2tlcltdKSB7XG5cdH1cblxuXHRvbldpbGxTdGFydFNlc3Npb24oKTogdm9pZCB7XG5cdFx0dGhpcy50cmFja2Vycy5mb3JFYWNoKHQgPT4gdC5vbldpbGxTdGFydFNlc3Npb24gPyB0Lm9uV2lsbFN0YXJ0U2Vzc2lvbigpIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdG9uV2lsbFJlY2VpdmVNZXNzYWdlKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuXHRcdHRoaXMudHJhY2tlcnMuZm9yRWFjaCh0ID0+IHQub25XaWxsUmVjZWl2ZU1lc3NhZ2UgPyB0Lm9uV2lsbFJlY2VpdmVNZXNzYWdlKG1lc3NhZ2UpIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdG9uRGlkU2VuZE1lc3NhZ2UobWVzc2FnZTogYW55KTogdm9pZCB7XG5cdFx0dGhpcy50cmFja2Vycy5mb3JFYWNoKHQgPT4gdC5vbkRpZFNlbmRNZXNzYWdlID8gdC5vbkRpZFNlbmRNZXNzYWdlKG1lc3NhZ2UpIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdG9uV2lsbFN0b3BTZXNzaW9uKCk6IHZvaWQge1xuXHRcdHRoaXMudHJhY2tlcnMuZm9yRWFjaCh0ID0+IHQub25XaWxsU3RvcFNlc3Npb24gPyB0Lm9uV2lsbFN0b3BTZXNzaW9uKCkgOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0b25FcnJvcihlcnJvcjogRXJyb3IpOiB2b2lkIHtcblx0XHR0aGlzLnRyYWNrZXJzLmZvckVhY2godCA9PiB0Lm9uRXJyb3IgPyB0Lm9uRXJyb3IoZXJyb3IpIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdG9uRXhpdChjb2RlOiBudW1iZXIsIHNpZ25hbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy50cmFja2Vycy5mb3JFYWNoKHQgPT4gdC5vbkV4aXQgPyB0Lm9uRXhpdChjb2RlLCBzaWduYWwpIDogdW5kZWZpbmVkKTtcblx0fVxufVxuXG4vKlxuICogQ2FsbCBkaXJlY3RseSBpbnRvIGEgZGVidWcgYWRhcHRlciBpbXBsZW1lbnRhdGlvblxuICovXG5jbGFzcyBEaXJlY3REZWJ1Z0FkYXB0ZXIgZXh0ZW5kcyBBYnN0cmFjdERlYnVnQWRhcHRlciB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBpbXBsZW1lbnRhdGlvbjogdnNjb2RlLkRlYnVnQWRhcHRlcikge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpbXBsZW1lbnRhdGlvbi5vbkRpZFNlbmRNZXNzYWdlKChtZXNzYWdlOiB2c2NvZGUuRGVidWdQcm90b2NvbE1lc3NhZ2UpID0+IHtcblx0XHRcdHRoaXMuYWNjZXB0TWVzc2FnZShtZXNzYWdlIGFzIERlYnVnUHJvdG9jb2wuUHJvdG9jb2xNZXNzYWdlKTtcblx0XHR9KTtcblx0fVxuXG5cdHN0YXJ0U2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZW5kTWVzc2FnZShtZXNzYWdlOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSk6IHZvaWQge1xuXHRcdHRoaXMuaW1wbGVtZW50YXRpb24uaGFuZGxlTWVzc2FnZShtZXNzYWdlKTtcblx0fVxuXG5cdHN0b3BTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuaW1wbGVtZW50YXRpb24uZGlzcG9zZSgpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBXb3JrZXJFeHRIb3N0RGVidWdTZXJ2aWNlIGV4dGVuZHMgRXh0SG9zdERlYnVnU2VydmljZUJhc2Uge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dEhvc3RScGNTZXJ2aWNlIGV4dEhvc3RScGNTZXJ2aWNlOiBJRXh0SG9zdFJwY1NlcnZpY2UsXG5cdFx0QElFeHRIb3N0V29ya3NwYWNlIHdvcmtzcGFjZVNlcnZpY2U6IElFeHRIb3N0V29ya3NwYWNlLFxuXHRcdEBJRXh0SG9zdEV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdENvbmZpZ3VyYXRpb24gY29uZmlndXJhdGlvblNlcnZpY2U6IElFeHRIb3N0Q29uZmlndXJhdGlvbixcblx0XHRASUV4dEhvc3RFZGl0b3JUYWJzIGVkaXRvclRhYnM6IElFeHRIb3N0RWRpdG9yVGFicyxcblx0XHRASUV4dEhvc3RWYXJpYWJsZVJlc29sdmVyUHJvdmlkZXIgdmFyaWFibGVSZXNvbHZlcjogSUV4dEhvc3RWYXJpYWJsZVJlc29sdmVyUHJvdmlkZXIsXG5cdFx0QElFeHRIb3N0Q29tbWFuZHMgY29tbWFuZHM6IElFeHRIb3N0Q29tbWFuZHMsXG5cdFx0QElFeHRIb3N0VGVzdGluZyB0ZXN0aW5nOiBJRXh0SG9zdFRlc3RpbmcsXG5cdCkge1xuXHRcdHN1cGVyKGV4dEhvc3RScGNTZXJ2aWNlLCB3b3Jrc3BhY2VTZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZWRpdG9yVGFicywgdmFyaWFibGVSZXNvbHZlciwgY29tbWFuZHMsIHRlc3RpbmcpO1xuXHR9XG59XG5cbi8vIENvbGxlY3RpbmcgaW5mbyBmb3IgIzIzMzE2NyBzcGVjaWZpY2FsbHlcbnR5cGUgRGVidWdQcm90b2NvbE1lc3NhZ2VFcnJvckNsYXNzaWZpY2F0aW9uID0ge1xuXHRmcm9tOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHR5cGUgb2YgdGhlIGRlYnVnIGFkYXB0ZXIgdGhhdCB0aGUgZXZlbnQgaXMgZnJvbS4nIH07XG5cdHR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgdHlwZSBvZiB0aGUgZXZlbnQgdGhhdCB3YXMgbWFsZm9ybWVkLicgfTtcblx0b3duZXI6ICdyb2Jsb3VyZW5zJztcblx0Y29tbWVudDogJ1NlbnQgdG8gY29sbGVjdCBkZXRhaWxzIGFib3V0IG1pc2JlaGF2aW5nIGRlYnVnIGV4dGVuc2lvbnMuJztcbn07XG5cbnR5cGUgRGVidWdQcm90b2NvbE1lc3NhZ2VFcnJvckV2ZW50ID0ge1xuXHRmcm9tOiBzdHJpbmc7XG5cdHR5cGU6IHN0cmluZztcbn07XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxjQUFjLGVBQWUsb0JBQW9CO0FBQzFELFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLDJCQUFrRDtBQUMzRCxTQUFTLHVCQUF1QjtBQUdoQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDhCQUE0UztBQUNyVCxTQUFTLGtCQUFrQixtQkFBbUIsa0NBQWtDO0FBR2hGLFNBQXNMLG1CQUEwRTtBQUNoUSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxZQUFZLGFBQWE7QUFDekIsU0FBcUIsZ0JBQWdCLHdCQUF3QixrQ0FBa0MsNkJBQTZCLG9CQUFvQixrQkFBa0IsaUJBQWlCLGFBQWEsWUFBWSxvQkFBb0IsVUFBVSxVQUFVLGlCQUFpQixrQkFBa0IsaUJBQWlCO0FBQ3hTLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMseUJB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
