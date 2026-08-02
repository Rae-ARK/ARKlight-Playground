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
import { getActiveWindow } from "../../../../base/browser/dom.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { distinct } from "../../../../base/common/arrays.js";
import { Queue, RunOnceScheduler, raceTimeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { canceled } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, dispose } from "../../../../base/common/lifecycle.js";
import { mixin } from "../../../../base/common/objects.js";
import * as platform from "../../../../base/common/platform.js";
import * as resources from "../../../../base/common/resources.js";
import Severity from "../../../../base/common/severity.js";
import { isDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { FocusMode } from "../../../../platform/native/common/native.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ICustomEndpointTelemetryService, ITelemetryService, TelemetryLevel } from "../../../../platform/telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ViewContainerLocation } from "../../../common/views.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { ITestResultService } from "../../testing/common/testResultService.js";
import { ITestService } from "../../testing/common/testService.js";
import { IDebugService, State, VIEWLET_ID, isFrameDeemphasized } from "../common/debug.js";
import { ExpressionContainer, MemoryRegion, Thread } from "../common/debugModel.js";
import { Source } from "../common/debugSource.js";
import { filterExceptionsFromTelemetry } from "../common/debugUtils.js";
import { ReplModel } from "../common/replModel.js";
import { RawDebugSession } from "./rawDebugSession.js";
const TRIGGERED_BREAKPOINT_MAX_DELAY = 1500;
let DebugSession = class {
  constructor(id, _configuration, root, model, options, debugService, telemetryService, hostService, configurationService, paneCompositeService, workspaceContextService, productService, notificationService, lifecycleService, uriIdentityService, instantiationService, customEndpointTelemetryService, workbenchEnvironmentService, logService, testService, testResultService, accessibilityService) {
    this.id = id;
    this._configuration = _configuration;
    this.root = root;
    this.model = model;
    this.debugService = debugService;
    this.telemetryService = telemetryService;
    this.hostService = hostService;
    this.configurationService = configurationService;
    this.paneCompositeService = paneCompositeService;
    this.workspaceContextService = workspaceContextService;
    this.productService = productService;
    this.notificationService = notificationService;
    this.uriIdentityService = uriIdentityService;
    this.instantiationService = instantiationService;
    this.customEndpointTelemetryService = customEndpointTelemetryService;
    this.workbenchEnvironmentService = workbenchEnvironmentService;
    this.logService = logService;
    this.testService = testService;
    this.accessibilityService = accessibilityService;
    // used in tests
    this.initialized = false;
    this.sources = /* @__PURE__ */ new Map();
    this.threads = /* @__PURE__ */ new Map();
    this.threadIds = [];
    this.cancellationMap = /* @__PURE__ */ new Map();
    this.rawListeners = new DisposableStore();
    this.globalDisposables = new DisposableStore();
    this.fetchThreadsScheduler = new Lazy(() => {
      const inst = new RunOnceScheduler(() => {
        this.fetchThreads();
      }, 100);
      this.rawListeners.add(inst);
      return inst;
    });
    this.stoppedDetails = [];
    this.statusQueue = this.rawListeners.add(new ThreadStatusScheduler());
    this._onDidChangeState = new Emitter();
    this._onDidEndAdapter = new Emitter();
    this._onDidLoadedSource = new Emitter();
    this._onDidCustomEvent = new Emitter();
    this._onDidProgressStart = new Emitter();
    this._onDidProgressUpdate = new Emitter();
    this._onDidProgressEnd = new Emitter();
    this._onDidInvalidMemory = new Emitter();
    this._onDidChangeREPLElements = new Emitter();
    this._onDidChangeName = new Emitter();
    this._options = options || {};
    this.parentSession = this._options.parentSession;
    if (this.hasSeparateRepl()) {
      this.repl = new ReplModel(this.configurationService);
    } else {
      this.repl = this.parentSession.repl;
    }
    const toDispose = this.globalDisposables;
    const replListener = toDispose.add(new MutableDisposable());
    replListener.value = this.repl.onDidChangeElements((e) => this._onDidChangeREPLElements.fire(e));
    if (lifecycleService) {
      toDispose.add(lifecycleService.onWillShutdown(() => {
        this.shutdown();
        dispose(toDispose);
      }));
    }
    this.correlatedTestRun = options?.testRun ? testResultService.getResult(options.testRun.runId) : this.parentSession?.correlatedTestRun;
    if (this.correlatedTestRun) {
      toDispose.add(this.correlatedTestRun.onComplete(() => this.terminate()));
    }
    const compoundRoot = this._options.compoundRoot;
    if (compoundRoot) {
      toDispose.add(compoundRoot.onDidSessionStop(() => this.terminate()));
    }
    this.passFocusScheduler = new RunOnceScheduler(() => {
      if (this.debugService.getModel().getSessions().some((s) => s.state === State.Stopped) || this.getAllThreads().some((t) => t.stopped)) {
        if (typeof this.lastContinuedThreadId === "number") {
          const thread = this.debugService.getViewModel().focusedThread;
          if (thread && thread.threadId === this.lastContinuedThreadId && !thread.stopped) {
            const toFocusThreadId = this.getStoppedDetails()?.threadId;
            const toFocusThread = typeof toFocusThreadId === "number" ? this.getThread(toFocusThreadId) : void 0;
            this.debugService.focusStackFrame(void 0, toFocusThread);
          }
        } else {
          const session = this.debugService.getViewModel().focusedSession;
          if (session && session.getId() === this.getId() && session.state !== State.Stopped) {
            this.debugService.focusStackFrame(void 0);
          }
        }
      }
    }, 800);
    const parent = this._options.parentSession;
    if (parent) {
      toDispose.add(parent.onDidEndAdapter(() => {
        if (!this.hasSeparateRepl() && this.raw?.isInShutdown === false) {
          this.repl = this.repl.clone();
          replListener.value = this.repl.onDidChangeElements((e) => this._onDidChangeREPLElements.fire(e));
          this.parentSession = void 0;
        }
      }));
    }
  }
  getId() {
    return this.id;
  }
  setSubId(subId) {
    this._subId = subId;
  }
  getMemory(memoryReference) {
    return new MemoryRegion(memoryReference, this);
  }
  get subId() {
    return this._subId;
  }
  get configuration() {
    return this._configuration.resolved;
  }
  get unresolvedConfiguration() {
    return this._configuration.unresolved;
  }
  get lifecycleManagedByParent() {
    return !!this._options.lifecycleManagedByParent;
  }
  get compact() {
    return !!this._options.compact;
  }
  get saveBeforeRestart() {
    return this._options.saveBeforeRestart ?? !this._options?.parentSession;
  }
  get compoundRoot() {
    return this._options.compoundRoot;
  }
  get suppressDebugStatusbar() {
    return this._options.suppressDebugStatusbar ?? false;
  }
  get suppressDebugToolbar() {
    return this._options.suppressDebugToolbar ?? false;
  }
  get suppressDebugView() {
    return this._options.suppressDebugView ?? false;
  }
  get autoExpandLazyVariables() {
    const screenReaderOptimized = this.accessibilityService.isScreenReaderOptimized();
    const value = this.configurationService.getValue("debug").autoExpandLazyVariables;
    return value === "auto" && screenReaderOptimized || value === "on";
  }
  setConfiguration(configuration) {
    this._configuration = configuration;
  }
  getLabel() {
    const includeRoot = this.workspaceContextService.getWorkspace().folders.length > 1;
    return includeRoot && this.root ? `${this.name} (${resources.basenameOrAuthority(this.root.uri)})` : this.name;
  }
  setName(name) {
    this._name = name;
    this._onDidChangeName.fire(name);
  }
  get name() {
    return this._name || this.configuration.name;
  }
  get state() {
    if (!this.initialized) {
      return State.Initializing;
    }
    if (!this.raw) {
      return State.Inactive;
    }
    const focusedThread = this.debugService.getViewModel().focusedThread;
    if (focusedThread && focusedThread.session === this) {
      return focusedThread.stopped ? State.Stopped : State.Running;
    }
    if (this.getAllThreads().some((t) => t.stopped)) {
      return State.Stopped;
    }
    return State.Running;
  }
  get capabilities() {
    return this.raw ? this.raw.capabilities : /* @__PURE__ */ Object.create(null);
  }
  //---- events
  get onDidChangeState() {
    return this._onDidChangeState.event;
  }
  get onDidEndAdapter() {
    return this._onDidEndAdapter.event;
  }
  get onDidChangeReplElements() {
    return this._onDidChangeREPLElements.event;
  }
  get onDidChangeName() {
    return this._onDidChangeName.event;
  }
  //---- DAP events
  get onDidCustomEvent() {
    return this._onDidCustomEvent.event;
  }
  get onDidLoadedSource() {
    return this._onDidLoadedSource.event;
  }
  get onDidProgressStart() {
    return this._onDidProgressStart.event;
  }
  get onDidProgressUpdate() {
    return this._onDidProgressUpdate.event;
  }
  get onDidProgressEnd() {
    return this._onDidProgressEnd.event;
  }
  get onDidInvalidateMemory() {
    return this._onDidInvalidMemory.event;
  }
  //---- DAP requests
  /**
   * create and initialize a new debug adapter for this session
   */
  async initialize(dbgr) {
    if (this.raw) {
      await this.shutdown();
    }
    try {
      const debugAdapter = await dbgr.createDebugAdapter(this);
      this.raw = this.instantiationService.createInstance(RawDebugSession, debugAdapter, dbgr, this.id, this.configuration.name);
      await this.raw.start();
      this.registerListeners();
      await this.raw.initialize({
        clientID: "vscode",
        clientName: this.productService.nameLong,
        adapterID: this.configuration.type,
        pathFormat: "path",
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsVariableType: true,
        // #8858
        supportsVariablePaging: true,
        // #9537
        supportsRunInTerminalRequest: true,
        // #10574
        locale: platform.language,
        // #169114
        supportsProgressReporting: true,
        // #92253
        supportsInvalidatedEvent: true,
        // #106745
        supportsMemoryReferences: true,
        //#129684
        supportsArgsCanBeInterpretedByShell: true,
        // #149910
        supportsMemoryEvent: true,
        // #133643
        supportsStartDebuggingRequest: true,
        supportsANSIStyling: true
      });
      this.initialized = true;
      this._onDidChangeState.fire();
      this.rememberedCapabilities = this.raw.capabilities;
      this.debugService.setExceptionBreakpointsForSession(this, this.raw && this.raw.capabilities.exceptionBreakpointFilters || []);
      this.debugService.getModel().registerBreakpointModes(this.configuration.type, this.raw.capabilities.breakpointModes || []);
    } catch (err) {
      this.initialized = true;
      this._onDidChangeState.fire();
      await this.shutdown();
      throw err;
    }
  }
  /**
   * launch or attach to the debuggee
   */
  async launchOrAttach(config) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "launch or attach"));
    }
    if (this.parentSession && this.parentSession.state === State.Inactive) {
      throw canceled();
    }
    config.__sessionId = this.getId();
    try {
      await this.raw.launchOrAttach(config);
    } catch (err) {
      this.shutdown();
      throw err;
    }
  }
  /**
   * Terminate any linked test run.
   */
  cancelCorrelatedTestRun() {
    if (this.correlatedTestRun && !this.correlatedTestRun.completedAt) {
      this.didTerminateTestRun = true;
      this.testService.cancelTestRun(this.correlatedTestRun.id);
    }
  }
  /**
   * terminate the current debug adapter session
   */
  async terminate(restart = false) {
    if (!this.raw) {
      this.onDidExitAdapter();
    }
    this.cancelAllRequests();
    if (this._options.lifecycleManagedByParent && this.parentSession) {
      await this.parentSession.terminate(restart);
    } else if (this.correlatedTestRun && !this.correlatedTestRun.completedAt && !this.didTerminateTestRun) {
      this.cancelCorrelatedTestRun();
    } else if (this.raw) {
      if (this.raw.capabilities.supportsTerminateRequest && this._configuration.resolved.request === "launch") {
        await this.raw.terminate(restart);
      } else {
        await this.raw.disconnect({ restart, terminateDebuggee: true });
      }
    }
    if (!restart) {
      this._options.compoundRoot?.sessionStopped();
    }
  }
  /**
   * end the current debug adapter session
   */
  async disconnect(restart = false, suspend = false) {
    if (!this.raw) {
      this.onDidExitAdapter();
    }
    this.cancelAllRequests();
    if (this._options.lifecycleManagedByParent && this.parentSession) {
      await this.parentSession.disconnect(restart, suspend);
    } else if (this.raw) {
      await this.raw.disconnect({ restart, terminateDebuggee: false, suspendDebuggee: suspend });
    }
    if (!restart) {
      this._options.compoundRoot?.sessionStopped();
    }
  }
  /**
   * restart debug adapter session
   */
  async restart() {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "restart"));
    }
    this.cancelAllRequests();
    if (this._options.lifecycleManagedByParent && this.parentSession) {
      await this.parentSession.restart();
    } else {
      await this.raw.restart({ arguments: this.configuration });
    }
  }
  async sendBreakpoints(modelUri, breakpointsToSend, sourceModified) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "breakpoints"));
    }
    if (!this.raw.readyForBreakpoints) {
      return Promise.resolve(void 0);
    }
    const rawSource = this.getRawSource(modelUri);
    if (breakpointsToSend.length && !rawSource.adapterData) {
      rawSource.adapterData = breakpointsToSend[0].adapterData;
    }
    if (rawSource.path) {
      rawSource.path = normalizeDriveLetter(rawSource.path);
    }
    const response = await this.raw.setBreakpoints({
      source: rawSource,
      lines: breakpointsToSend.map((bp) => bp.sessionAgnosticData.lineNumber),
      breakpoints: breakpointsToSend.map((bp) => bp.toDAP()),
      sourceModified
    });
    if (response?.body) {
      const data = /* @__PURE__ */ new Map();
      for (let i = 0; i < breakpointsToSend.length; i++) {
        data.set(breakpointsToSend[i].getId(), response.body.breakpoints[i]);
      }
      this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
    }
  }
  async sendFunctionBreakpoints(fbpts) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "function breakpoints"));
    }
    if (this.raw.readyForBreakpoints) {
      const response = await this.raw.setFunctionBreakpoints({ breakpoints: fbpts.map((bp) => bp.toDAP()) });
      if (response?.body) {
        const data = /* @__PURE__ */ new Map();
        for (let i = 0; i < fbpts.length; i++) {
          data.set(fbpts[i].getId(), response.body.breakpoints[i]);
        }
        this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
      }
    }
  }
  async sendExceptionBreakpoints(exbpts) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "exception breakpoints"));
    }
    if (this.raw.readyForBreakpoints) {
      const args = this.capabilities.supportsExceptionFilterOptions ? {
        filters: [],
        filterOptions: exbpts.map((exb) => {
          if (exb.condition) {
            return { filterId: exb.filter, condition: exb.condition };
          }
          return { filterId: exb.filter };
        })
      } : { filters: exbpts.map((exb) => exb.filter) };
      const response = await this.raw.setExceptionBreakpoints(args);
      if (response?.body && response.body.breakpoints) {
        const data = /* @__PURE__ */ new Map();
        for (let i = 0; i < exbpts.length; i++) {
          data.set(exbpts[i].getId(), response.body.breakpoints[i]);
        }
        this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
      }
    }
  }
  dataBytesBreakpointInfo(address, bytes) {
    if (this.raw?.capabilities.supportsDataBreakpointBytes === false) {
      throw new Error(localize("sessionDoesNotSupporBytesBreakpoints", "Session does not support breakpoints with bytes"));
    }
    return this._dataBreakpointInfo({ name: address, bytes, asAddress: true });
  }
  dataBreakpointInfo(name, variablesReference, frameId) {
    return this._dataBreakpointInfo({ name, variablesReference, frameId });
  }
  async _dataBreakpointInfo(args) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "data breakpoints info"));
    }
    if (!this.raw.readyForBreakpoints) {
      throw new Error(localize("sessionNotReadyForBreakpoints", "Session is not ready for breakpoints"));
    }
    const response = await this.raw.dataBreakpointInfo(args);
    return response?.body;
  }
  async sendDataBreakpoints(dataBreakpoints) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "data breakpoints"));
    }
    if (this.raw.readyForBreakpoints) {
      const converted = await Promise.all(dataBreakpoints.map(async (bp) => {
        try {
          const dap = await bp.toDAP(this);
          return { dap, bp };
        } catch (e) {
          return { bp, message: e.message };
        }
      }));
      const response = await this.raw.setDataBreakpoints({ breakpoints: converted.map((d) => d.dap).filter(isDefined) });
      if (response?.body) {
        const data = /* @__PURE__ */ new Map();
        let i = 0;
        for (const dap of converted) {
          if (!dap.dap) {
            data.set(dap.bp.getId(), dap.message);
          } else if (i < response.body.breakpoints.length) {
            data.set(dap.bp.getId(), response.body.breakpoints[i++]);
          }
        }
        this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
      }
    }
  }
  async sendInstructionBreakpoints(instructionBreakpoints) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "instruction breakpoints"));
    }
    if (this.raw.readyForBreakpoints) {
      const response = await this.raw.setInstructionBreakpoints({ breakpoints: instructionBreakpoints.map((ib) => ib.toDAP()) });
      if (response?.body) {
        const data = /* @__PURE__ */ new Map();
        for (let i = 0; i < instructionBreakpoints.length; i++) {
          data.set(instructionBreakpoints[i].getId(), response.body.breakpoints[i]);
        }
        this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
      }
    }
  }
  async breakpointsLocations(uri, lineNumber) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "breakpoints locations"));
    }
    const source = this.getRawSource(uri);
    const response = await this.raw.breakpointLocations({ source, line: lineNumber });
    if (!response || !response.body || !response.body.breakpoints) {
      return [];
    }
    const positions = response.body.breakpoints.map((bp) => ({ lineNumber: bp.line, column: bp.column || 1 }));
    return distinct(positions, (p) => `${p.lineNumber}:${p.column}`);
  }
  getDebugProtocolBreakpoint(breakpointId) {
    return this.model.getDebugProtocolBreakpoint(breakpointId, this.getId());
  }
  customRequest(request, args) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", request));
    }
    return this.raw.custom(request, args);
  }
  stackTrace(threadId, startFrame, levels, token) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "stackTrace"));
    }
    const sessionToken = this.getNewCancellationToken(threadId, token);
    return this.raw.stackTrace({ threadId, startFrame, levels }, sessionToken);
  }
  async exceptionInfo(threadId) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "exceptionInfo"));
    }
    const response = await this.raw.exceptionInfo({ threadId });
    if (response) {
      return {
        id: response.body.exceptionId,
        description: response.body.description,
        breakMode: response.body.breakMode,
        details: response.body.details
      };
    }
    return void 0;
  }
  scopes(frameId, threadId) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "scopes"));
    }
    const token = this.getNewCancellationToken(threadId);
    return this.raw.scopes({ frameId }, token);
  }
  variables(variablesReference, threadId, filter, start, count) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "variables"));
    }
    const token = threadId ? this.getNewCancellationToken(threadId) : void 0;
    return this.raw.variables({ variablesReference, filter, start, count }, token);
  }
  evaluate(expression, frameId, context, location) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "evaluate"));
    }
    return this.raw.evaluate({ expression, frameId, context, line: location?.line, column: location?.column, source: location?.source });
  }
  async restartFrame(frameId, threadId) {
    await this.waitForTriggeredBreakpoints();
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "restartFrame"));
    }
    await this.raw.restartFrame({ frameId }, threadId);
  }
  setLastSteppingGranularity(threadId, granularity) {
    const thread = this.getThread(threadId);
    if (thread) {
      thread.lastSteppingGranularity = granularity;
    }
  }
  async next(threadId, granularity) {
    await this.waitForTriggeredBreakpoints();
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "next"));
    }
    this.setLastSteppingGranularity(threadId, granularity);
    await this.raw.next({ threadId, granularity });
  }
  async stepIn(threadId, targetId, granularity) {
    await this.waitForTriggeredBreakpoints();
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "stepIn"));
    }
    this.setLastSteppingGranularity(threadId, granularity);
    await this.raw.stepIn({ threadId, targetId, granularity });
  }
  async stepOut(threadId, granularity) {
    await this.waitForTriggeredBreakpoints();
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "stepOut"));
    }
    this.setLastSteppingGranularity(threadId, granularity);
    await this.raw.stepOut({ threadId, granularity });
  }
  async stepBack(threadId, granularity) {
    await this.waitForTriggeredBreakpoints();
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "stepBack"));
    }
    this.setLastSteppingGranularity(threadId, granularity);
    await this.raw.stepBack({ threadId, granularity });
  }
  async continue(threadId) {
    await this.waitForTriggeredBreakpoints();
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "continue"));
    }
    await this.raw.continue({ threadId });
  }
  async reverseContinue(threadId) {
    await this.waitForTriggeredBreakpoints();
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "reverse continue"));
    }
    await this.raw.reverseContinue({ threadId });
  }
  async pause(threadId) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "pause"));
    }
    await this.raw.pause({ threadId });
  }
  async terminateThreads(threadIds) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "terminateThreads"));
    }
    await this.raw.terminateThreads({ threadIds });
  }
  setVariable(variablesReference, name, value) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "setVariable"));
    }
    return this.raw.setVariable({ variablesReference, name, value });
  }
  setExpression(frameId, expression, value) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "setExpression"));
    }
    return this.raw.setExpression({ expression, value, frameId });
  }
  gotoTargets(source, line, column) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "gotoTargets"));
    }
    return this.raw.gotoTargets({ source, line, column });
  }
  goto(threadId, targetId) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "goto"));
    }
    return this.raw.goto({ threadId, targetId });
  }
  loadSource(resource) {
    if (!this.raw) {
      return Promise.reject(new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "loadSource")));
    }
    const source = this.getSourceForUri(resource);
    let rawSource;
    if (source) {
      rawSource = source.raw;
    } else {
      const data = Source.getEncodedDebugData(resource);
      rawSource = { path: data.path, sourceReference: data.sourceReference };
    }
    return this.raw.source({ sourceReference: rawSource.sourceReference || 0, source: rawSource });
  }
  async getLoadedSources() {
    if (!this.raw) {
      return Promise.reject(new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "getLoadedSources")));
    }
    const response = await this.raw.loadedSources({});
    if (response?.body && response.body.sources) {
      return response.body.sources.map((src) => this.getSource(src));
    } else {
      return [];
    }
  }
  async completions(frameId, threadId, text, position, token) {
    if (!this.raw) {
      return Promise.reject(new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "completions")));
    }
    const sessionCancelationToken = this.getNewCancellationToken(threadId, token);
    return this.raw.completions({
      frameId,
      text,
      column: position.column,
      line: position.lineNumber
    }, sessionCancelationToken);
  }
  async stepInTargets(frameId) {
    if (!this.raw) {
      return Promise.reject(new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "stepInTargets")));
    }
    const response = await this.raw.stepInTargets({ frameId });
    return response?.body.targets;
  }
  async cancel(progressId) {
    if (!this.raw) {
      return Promise.reject(new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "cancel")));
    }
    return this.raw.cancel({ progressId });
  }
  async disassemble(memoryReference, offset, instructionOffset, instructionCount) {
    if (!this.raw) {
      return Promise.reject(new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "disassemble")));
    }
    const response = await this.raw.disassemble({ memoryReference, offset, instructionOffset, instructionCount, resolveSymbols: true });
    return response?.body?.instructions;
  }
  readMemory(memoryReference, offset, count) {
    if (!this.raw) {
      return Promise.reject(new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "readMemory")));
    }
    return this.raw.readMemory({ count, memoryReference, offset });
  }
  writeMemory(memoryReference, offset, data, allowPartial) {
    if (!this.raw) {
      return Promise.reject(new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "disassemble")));
    }
    return this.raw.writeMemory({ memoryReference, offset, allowPartial, data });
  }
  async resolveLocationReference(locationReference) {
    if (!this.raw) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "locations"));
    }
    const location = await this.raw.locations({ locationReference });
    if (!location?.body) {
      throw new Error(localize("noDebugAdapter", "No debugger available, can not send '{0}'", "locations"));
    }
    const source = this.getSource(location.body.source);
    return { column: 1, ...location.body, source };
  }
  //---- threads
  getThread(threadId) {
    return this.threads.get(threadId);
  }
  getAllThreads() {
    const result = [];
    this.threadIds.forEach((threadId) => {
      const thread = this.threads.get(threadId);
      if (thread) {
        result.push(thread);
      }
    });
    return result;
  }
  clearThreads(removeThreads, reference = void 0) {
    if (reference !== void 0 && reference !== null) {
      const thread = this.threads.get(reference);
      if (thread) {
        thread.clearCallStack();
        thread.stoppedDetails = void 0;
        thread.stopped = false;
        if (removeThreads) {
          this.threads.delete(reference);
        }
      }
    } else {
      this.threads.forEach((thread) => {
        thread.clearCallStack();
        thread.stoppedDetails = void 0;
        thread.stopped = false;
      });
      if (removeThreads) {
        this.threads.clear();
        this.threadIds = [];
        ExpressionContainer.allValues.clear();
      }
    }
  }
  getStoppedDetails() {
    return this.stoppedDetails.length >= 1 ? this.stoppedDetails[0] : void 0;
  }
  rawUpdate(data) {
    this.threadIds = [];
    data.threads.forEach((thread) => {
      this.threadIds.push(thread.id);
      if (!this.threads.has(thread.id)) {
        this.threads.set(thread.id, new Thread(this, thread.name, thread.id));
      } else if (thread.name) {
        const oldThread = this.threads.get(thread.id);
        if (oldThread) {
          oldThread.name = thread.name;
        }
      }
    });
    this.threads.forEach((t) => {
      if (this.threadIds.indexOf(t.threadId) === -1) {
        this.threads.delete(t.threadId);
      }
    });
    const stoppedDetails = data.stoppedDetails;
    if (stoppedDetails) {
      if (stoppedDetails.allThreadsStopped) {
        this.threads.forEach((thread) => {
          thread.stoppedDetails = thread.threadId === stoppedDetails.threadId ? stoppedDetails : { reason: thread.stoppedDetails?.reason };
          thread.stopped = true;
          thread.clearCallStack();
        });
      } else {
        const thread = typeof stoppedDetails.threadId === "number" ? this.threads.get(stoppedDetails.threadId) : void 0;
        if (thread) {
          thread.stoppedDetails = stoppedDetails;
          thread.clearCallStack();
          thread.stopped = true;
        }
      }
    }
  }
  waitForTriggeredBreakpoints() {
    if (!this._waitToResume) {
      return;
    }
    return raceTimeout(
      this._waitToResume,
      TRIGGERED_BREAKPOINT_MAX_DELAY
    );
  }
  async fetchThreads(stoppedDetails) {
    if (this.raw) {
      const response = await this.raw.threads();
      if (response?.body && response.body.threads) {
        this.model.rawUpdate({
          sessionId: this.getId(),
          threads: response.body.threads,
          stoppedDetails
        });
      }
    }
  }
  initializeForTest(raw) {
    this.raw = raw;
    this.registerListeners();
  }
  //---- private
  registerListeners() {
    if (!this.raw) {
      return;
    }
    this.rawListeners.add(this.raw.onDidInitialize(async () => {
      aria.status(
        this.configuration.noDebug ? localize("debuggingStartedNoDebug", "Started running without debugging.") : localize("debuggingStarted", "Debugging started.")
      );
      const sendConfigurationDone = async () => {
        if (this.raw && this.raw.capabilities.supportsConfigurationDoneRequest) {
          try {
            await this.raw.configurationDone();
          } catch (e) {
            this.notificationService.error(e);
            this.raw?.disconnect({});
          }
        }
        return void 0;
      };
      try {
        await this.debugService.sendAllBreakpoints(this);
      } finally {
        await sendConfigurationDone();
        await this.fetchThreads();
      }
    }));
    const statusQueue = this.statusQueue;
    this.rawListeners.add(this.raw.onDidStop((event) => this.handleStop(event.body)));
    this.rawListeners.add(this.raw.onDidThread((event) => {
      statusQueue.cancel([event.body.threadId]);
      if (event.body.reason === "started") {
        if (!this.fetchThreadsScheduler.value.isScheduled()) {
          this.fetchThreadsScheduler.value.schedule();
        }
      } else if (event.body.reason === "exited") {
        this.model.clearThreads(this.getId(), true, event.body.threadId);
        const viewModel = this.debugService.getViewModel();
        const focusedThread = viewModel.focusedThread;
        this.passFocusScheduler.cancel();
        if (focusedThread && event.body.threadId === focusedThread.threadId) {
          this.debugService.focusStackFrame(void 0, void 0, viewModel.focusedSession, { explicit: false });
        }
      }
    }));
    this.rawListeners.add(this.raw.onDidTerminateDebugee(async (event) => {
      aria.status(localize("debuggingStopped", "Debugging stopped."));
      if (event.body && event.body.restart) {
        await this.debugService.restartSession(this, event.body.restart);
      } else if (this.raw) {
        await this.raw.disconnect({ terminateDebuggee: false });
      }
    }));
    this.rawListeners.add(this.raw.onDidContinued(async (event) => {
      const allThreads = event.body.allThreadsContinued !== false;
      let affectedThreads;
      if (!allThreads) {
        affectedThreads = [event.body.threadId];
        if (this.threadIds.includes(event.body.threadId)) {
          affectedThreads = [event.body.threadId];
        } else {
          this.fetchThreadsScheduler.rawValue?.cancel();
          affectedThreads = this.fetchThreads().then(() => [event.body.threadId]);
        }
      } else if (this.fetchThreadsScheduler.value.isScheduled()) {
        this.fetchThreadsScheduler.value.cancel();
        affectedThreads = this.fetchThreads().then(() => this.threadIds);
      } else {
        affectedThreads = this.threadIds;
      }
      statusQueue.cancel(allThreads ? void 0 : [event.body.threadId]);
      await statusQueue.run(affectedThreads, (threadId) => {
        this.stoppedDetails = this.stoppedDetails.filter((sd) => sd.threadId !== threadId);
        const tokens = this.cancellationMap.get(threadId);
        this.cancellationMap.delete(threadId);
        tokens?.forEach((t) => t.dispose(true));
        this.model.clearThreads(this.getId(), false, threadId);
        return Promise.resolve();
      });
      this.lastContinuedThreadId = allThreads ? void 0 : event.body.threadId;
      this.passFocusScheduler.schedule();
      this._onDidChangeState.fire();
    }));
    const outputQueue = new Queue();
    this.rawListeners.add(this.raw.onDidOutput(async (event) => {
      const outputSeverity = event.body.category === "stderr" ? Severity.Error : event.body.category === "console" ? Severity.Warning : Severity.Info;
      if (event.body.variablesReference) {
        const source = event.body.source && event.body.line ? {
          lineNumber: event.body.line,
          column: event.body.column ? event.body.column : 1,
          source: this.getSource(event.body.source)
        } : void 0;
        const container = new ExpressionContainer(this, void 0, event.body.variablesReference, generateUuid());
        const children = container.getChildren();
        outputQueue.queue(async () => {
          const resolved = await children;
          if (resolved.length === 1) {
            this.appendToRepl({ output: event.body.output, expression: resolved[0], sev: outputSeverity, source }, event.body.category === "important");
            return;
          }
          resolved.forEach((child) => {
            child.name = null;
            this.appendToRepl({ output: "", expression: child, sev: outputSeverity, source }, event.body.category === "important");
          });
        });
        return;
      }
      outputQueue.queue(async () => {
        if (!event.body || !this.raw) {
          return;
        }
        if (event.body.category === "telemetry") {
          const telemetryEndpoint = this.raw.dbgr.getCustomTelemetryEndpoint();
          if (telemetryEndpoint && this.telemetryService.telemetryLevel !== TelemetryLevel.NONE) {
            let data = event.body.data;
            if (!telemetryEndpoint.sendErrorTelemetry && event.body.data) {
              data = filterExceptionsFromTelemetry(event.body.data);
            }
            this.customEndpointTelemetryService.publicLog(telemetryEndpoint, event.body.output, data);
          }
          return;
        }
        const source = event.body.source && event.body.line ? {
          lineNumber: event.body.line,
          column: event.body.column ? event.body.column : 1,
          source: this.getSource(event.body.source)
        } : void 0;
        if (event.body.group === "start" || event.body.group === "startCollapsed") {
          const expanded = event.body.group === "start";
          this.repl.startGroup(this, event.body.output || "", expanded, source);
          return;
        }
        if (event.body.group === "end") {
          this.repl.endGroup();
          if (!event.body.output) {
            return;
          }
        }
        if (typeof event.body.output === "string") {
          this.appendToRepl({ output: event.body.output, sev: outputSeverity, source }, event.body.category === "important");
        }
      });
    }));
    this.rawListeners.add(this.raw.onDidBreakpoint((event) => {
      const id = event.body && event.body.breakpoint ? event.body.breakpoint.id : void 0;
      const breakpoint = this.model.getBreakpoints().find((bp) => bp.getIdFromAdapter(this.getId()) === id);
      const functionBreakpoint = this.model.getFunctionBreakpoints().find((bp) => bp.getIdFromAdapter(this.getId()) === id);
      const dataBreakpoint = this.model.getDataBreakpoints().find((dbp) => dbp.getIdFromAdapter(this.getId()) === id);
      const exceptionBreakpoint = this.model.getExceptionBreakpoints().find((excbp) => excbp.getIdFromAdapter(this.getId()) === id);
      if (event.body.reason === "new" && event.body.breakpoint.source && event.body.breakpoint.line) {
        const source = this.getSource(event.body.breakpoint.source);
        const bps = this.model.addBreakpoints(source.uri, [{
          column: event.body.breakpoint.column,
          enabled: true,
          lineNumber: event.body.breakpoint.line
        }], false);
        if (bps.length === 1) {
          const data = /* @__PURE__ */ new Map([[bps[0].getId(), event.body.breakpoint]]);
          this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
        }
      }
      if (event.body.reason === "removed") {
        if (breakpoint) {
          this.model.removeBreakpoints([breakpoint]);
        }
        if (functionBreakpoint) {
          this.model.removeFunctionBreakpoints(functionBreakpoint.getId());
        }
        if (dataBreakpoint) {
          this.model.removeDataBreakpoints(dataBreakpoint.getId());
        }
      }
      if (event.body.reason === "changed") {
        if (breakpoint) {
          if (!breakpoint.column) {
            event.body.breakpoint.column = void 0;
          }
          const data = /* @__PURE__ */ new Map([[breakpoint.getId(), event.body.breakpoint]]);
          this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
        }
        if (functionBreakpoint) {
          const data = /* @__PURE__ */ new Map([[functionBreakpoint.getId(), event.body.breakpoint]]);
          this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
        }
        if (dataBreakpoint) {
          const data = /* @__PURE__ */ new Map([[dataBreakpoint.getId(), event.body.breakpoint]]);
          this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
        }
        if (exceptionBreakpoint) {
          const data = /* @__PURE__ */ new Map([[exceptionBreakpoint.getId(), event.body.breakpoint]]);
          this.model.setBreakpointSessionData(this.getId(), this.capabilities, data);
        }
      }
    }));
    this.rawListeners.add(this.raw.onDidLoadedSource((event) => {
      this._onDidLoadedSource.fire({
        reason: event.body.reason,
        source: this.getSource(event.body.source)
      });
    }));
    this.rawListeners.add(this.raw.onDidCustomEvent((event) => {
      this._onDidCustomEvent.fire(event);
    }));
    this.rawListeners.add(this.raw.onDidProgressStart((event) => {
      this._onDidProgressStart.fire(event);
    }));
    this.rawListeners.add(this.raw.onDidProgressUpdate((event) => {
      this._onDidProgressUpdate.fire(event);
    }));
    this.rawListeners.add(this.raw.onDidProgressEnd((event) => {
      this._onDidProgressEnd.fire(event);
    }));
    this.rawListeners.add(this.raw.onDidInvalidateMemory((event) => {
      this._onDidInvalidMemory.fire(event);
    }));
    this.rawListeners.add(this.raw.onDidInvalidated(async (event) => {
      const areas = event.body.areas || ["all"];
      if (areas.includes("threads") || areas.includes("stacks") || areas.includes("all")) {
        this.cancelAllRequests();
        this.model.clearThreads(this.getId(), true);
        const details = this.stoppedDetails.slice();
        this.stoppedDetails.length = 0;
        if (details.length) {
          await Promise.all(details.map((d) => this.handleStop(d)));
        } else if (!this.fetchThreadsScheduler.value.isScheduled()) {
          this.fetchThreadsScheduler.value.schedule();
        }
      }
      const viewModel = this.debugService.getViewModel();
      if (viewModel.focusedSession === this) {
        viewModel.updateViews();
      }
    }));
    this.rawListeners.add(this.raw.onDidExitAdapter((event) => this.onDidExitAdapter(event)));
  }
  async handleStop(event) {
    this.passFocusScheduler.cancel();
    this.stoppedDetails.push(event);
    if (event.hitBreakpointIds) {
      this._waitToResume = this.enableDependentBreakpoints(event.hitBreakpointIds);
    }
    this.statusQueue.run(
      this.fetchThreads(event).then(() => event.threadId === void 0 ? this.threadIds : [event.threadId]),
      async (threadId, token) => {
        const hasLotsOfThreads = event.threadId === void 0 && this.threadIds.length > 10;
        const focusedThread = this.debugService.getViewModel().focusedThread;
        const focusedThreadDoesNotExist = focusedThread !== void 0 && focusedThread.session === this && !this.threads.has(focusedThread.threadId);
        if (focusedThreadDoesNotExist) {
          this.debugService.focusStackFrame(void 0, void 0);
        }
        const thread = typeof threadId === "number" ? this.getThread(threadId) : void 0;
        if (thread) {
          const promises = this.model.refreshTopOfCallstack(
            thread,
            /* fetchFullStack= */
            !hasLotsOfThreads
          );
          const focus = async () => {
            if (focusedThreadDoesNotExist || !event.preserveFocusHint && thread.getCallStack().length) {
              const focusedStackFrame2 = this.debugService.getViewModel().focusedStackFrame;
              if (!focusedStackFrame2 || focusedStackFrame2.thread.session === this) {
                const preserveFocus = !this.configurationService.getValue("debug").focusEditorOnBreak;
                await this.debugService.focusStackFrame(void 0, thread, void 0, { preserveFocus });
              }
              if (thread.stoppedDetails && !token.isCancellationRequested) {
                if (thread.stoppedDetails.reason === "breakpoint" && this.configurationService.getValue("debug").openDebug === "openOnDebugBreak" && !this.suppressDebugView) {
                  await this.paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar);
                }
                if (this.configurationService.getValue("debug").focusWindowOnBreak && !this.workbenchEnvironmentService.extensionTestsLocationURI) {
                  const activeWindow = getActiveWindow();
                  if (!activeWindow.document.hasFocus()) {
                    await this.hostService.focus(mainWindow, {
                      mode: FocusMode.Force
                      /* Application may not be active */
                    });
                  }
                }
              }
            }
          };
          await promises.topCallStack;
          if (!event.hitBreakpointIds) {
            this._waitToResume = this.enableDependentBreakpoints(thread);
          }
          if (token.isCancellationRequested) {
            return;
          }
          focus();
          await promises.wholeCallStack;
          if (token.isCancellationRequested) {
            return;
          }
          const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
          if (!focusedStackFrame || isFrameDeemphasized(focusedStackFrame)) {
            focus();
          }
        }
        this._onDidChangeState.fire();
      }
    );
  }
  async enableDependentBreakpoints(hitBreakpointIdsOrThread) {
    let breakpoints;
    if (Array.isArray(hitBreakpointIdsOrThread)) {
      breakpoints = this.model.getBreakpoints().filter((bp) => hitBreakpointIdsOrThread.includes(bp.getIdFromAdapter(this.id)));
    } else {
      const frame = hitBreakpointIdsOrThread.getTopStackFrame();
      if (frame === void 0) {
        return;
      }
      if (hitBreakpointIdsOrThread.stoppedDetails && hitBreakpointIdsOrThread.stoppedDetails.reason !== "breakpoint") {
        return;
      }
      breakpoints = this.getBreakpointsAtPosition(frame.source.uri, frame.range.startLineNumber, frame.range.endLineNumber, frame.range.startColumn, frame.range.endColumn);
    }
    const urisToResend = /* @__PURE__ */ new Set();
    this.model.getBreakpoints({ triggeredOnly: true, enabledOnly: true }).forEach((bp) => {
      breakpoints.forEach((cbp) => {
        if (bp.enabled && bp.triggeredBy === cbp.getId()) {
          bp.setSessionDidTrigger(this.getId());
          urisToResend.add(bp.uri.toString());
        }
      });
    });
    const results = [];
    urisToResend.forEach((uri) => results.push(this.debugService.sendBreakpoints(URI.parse(uri), void 0, this)));
    return Promise.all(results);
  }
  getBreakpointsAtPosition(uri, startLineNumber, endLineNumber, startColumn, endColumn) {
    return this.model.getBreakpoints({ uri }).filter((bp) => {
      if (bp.lineNumber < startLineNumber || bp.lineNumber > endLineNumber) {
        return false;
      }
      if (bp.column && (bp.column < startColumn || bp.column > endColumn)) {
        return false;
      }
      return true;
    });
  }
  onDidExitAdapter(event) {
    this.initialized = true;
    this.model.setBreakpointSessionData(this.getId(), this.capabilities, void 0);
    this.shutdown();
    this._onDidEndAdapter.fire(event);
  }
  // Disconnects and clears state. Session can be initialized again for a new connection.
  shutdown() {
    this.rawListeners.clear();
    if (this.raw) {
      this.raw.disconnect({});
      this.raw.dispose();
      this.raw = void 0;
    }
    this.passFocusScheduler.cancel();
    this.passFocusScheduler.dispose();
    this.model.clearThreads(this.getId(), true);
    this.sources.clear();
    this.threads.clear();
    this.threadIds = [];
    this.stoppedDetails = [];
    this._onDidChangeState.fire();
  }
  dispose() {
    this.cancelAllRequests();
    this.rawListeners.dispose();
    this.globalDisposables.dispose();
    this._onDidChangeState.dispose();
    this._onDidEndAdapter.dispose();
    this._onDidLoadedSource.dispose();
    this._onDidCustomEvent.dispose();
    this._onDidProgressStart.dispose();
    this._onDidProgressUpdate.dispose();
    this._onDidProgressEnd.dispose();
    this._onDidInvalidMemory.dispose();
    this._onDidChangeREPLElements.dispose();
    this._onDidChangeName.dispose();
    this._waitToResume = void 0;
  }
  //---- sources
  getSourceForUri(uri) {
    return this.sources.get(this.uriIdentityService.asCanonicalUri(uri).toString());
  }
  getSource(raw) {
    let source = new Source(raw, this.getId(), this.uriIdentityService, this.logService);
    const uriKey = source.uri.toString();
    const found = this.sources.get(uriKey);
    if (found) {
      source = found;
      source.raw = mixin(source.raw, raw);
      if (source.raw && raw) {
        source.raw.presentationHint = raw.presentationHint;
      }
    } else {
      this.sources.set(uriKey, source);
    }
    return source;
  }
  getRawSource(uri) {
    const source = this.getSourceForUri(uri);
    if (source) {
      return source.raw;
    } else {
      const data = Source.getEncodedDebugData(uri);
      return { name: data.name, path: data.path, sourceReference: data.sourceReference };
    }
  }
  getNewCancellationToken(threadId, token) {
    const tokenSource = new CancellationTokenSource(token);
    const tokens = this.cancellationMap.get(threadId) || [];
    tokens.push(tokenSource);
    this.cancellationMap.set(threadId, tokens);
    return tokenSource.token;
  }
  cancelAllRequests() {
    this.cancellationMap.forEach((tokens) => tokens.forEach((t) => t.dispose(true)));
    this.cancellationMap.clear();
  }
  // REPL
  getReplElements() {
    return this.repl.getReplElements();
  }
  hasSeparateRepl() {
    return !this.parentSession || this._options.repl !== "mergeWithParent";
  }
  removeReplExpressions() {
    this.repl.removeReplExpressions();
  }
  async addReplExpression(stackFrame, expression) {
    await this.repl.addReplExpression(this, stackFrame, expression);
    this.debugService.getViewModel().updateViews();
  }
  appendToRepl(data, isImportant) {
    this.repl.appendToRepl(this, data);
    if (isImportant) {
      this.notificationService.notify({ message: data.output.toString(), severity: data.sev, source: this.name });
    }
  }
};
DebugSession = __decorateClass([
  __decorateParam(5, IDebugService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IHostService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IPaneCompositePartService),
  __decorateParam(10, IWorkspaceContextService),
  __decorateParam(11, IProductService),
  __decorateParam(12, INotificationService),
  __decorateParam(13, ILifecycleService),
  __decorateParam(14, IUriIdentityService),
  __decorateParam(15, IInstantiationService),
  __decorateParam(16, ICustomEndpointTelemetryService),
  __decorateParam(17, IWorkbenchEnvironmentService),
  __decorateParam(18, ILogService),
  __decorateParam(19, ITestService),
  __decorateParam(20, ITestResultService),
  __decorateParam(21, IAccessibilityService)
], DebugSession);
class ThreadStatusScheduler extends Disposable {
  constructor() {
    super(...arguments);
    /**
     * An array of set of thread IDs. When a 'stopped' event is encountered, the
     * editor refreshes its thread IDs. In the meantime, the thread may change
     * state it again. So the editor puts a Set into this array when it starts
     * the refresh, and checks it after the refresh is finished, to see if
     * any of the threads it looked up should now be invalidated.
     */
    this.pendingCancellations = [];
    /**
     * Cancellation tokens for currently-running operations on threads.
     */
    this.threadOps = this._register(new DisposableMap());
  }
  /**
   * Runs the operation.
   * If thread is undefined it affects all threads.
   */
  async run(threadIdsP, operation) {
    const cancelledWhileLookingUpThreads = /* @__PURE__ */ new Set();
    this.pendingCancellations.push(cancelledWhileLookingUpThreads);
    const threadIds = await threadIdsP;
    for (let i = 0; i < this.pendingCancellations.length; i++) {
      const s = this.pendingCancellations[i];
      if (s === cancelledWhileLookingUpThreads) {
        this.pendingCancellations.splice(i, 1);
        break;
      } else {
        for (const threadId of threadIds) {
          s.add(threadId);
        }
      }
    }
    if (cancelledWhileLookingUpThreads.has(void 0)) {
      return;
    }
    await Promise.all(threadIds.map((threadId) => {
      if (cancelledWhileLookingUpThreads.has(threadId)) {
        return;
      }
      this.threadOps.get(threadId)?.cancel();
      const cts = new CancellationTokenSource();
      this.threadOps.set(threadId, cts);
      return operation(threadId, cts.token);
    }));
  }
  /**
   * Cancels all ongoing state operations on the given threads.
   * If threads is undefined it cancel all threads.
   */
  cancel(threadIds) {
    if (!threadIds) {
      for (const [_, op] of this.threadOps) {
        op.cancel();
      }
      this.threadOps.clearAndDisposeAll();
      for (const s of this.pendingCancellations) {
        s.add(void 0);
      }
    } else {
      for (const threadId of threadIds) {
        this.threadOps.get(threadId)?.cancel();
        this.threadOps.deleteAndDispose(threadId);
        for (const s of this.pendingCancellations) {
          s.add(threadId);
        }
      }
    }
  }
}
export {
  DebugSession,
  ThreadStatusScheduler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdTZXNzaW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBhcmlhIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgUXVldWUsIFJ1bk9uY2VTY2hlZHVsZXIsIHJhY2VUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGNhbmNlbGVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplRHJpdmVMZXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBtaXhpbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEZvY3VzTW9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbUVuZHBvaW50VGVsZW1ldHJ5U2VydmljZSwgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgTGl2ZVRlc3RSZXN1bHQgfSBmcm9tICcuLi8uLi90ZXN0aW5nL2NvbW1vbi90ZXN0UmVzdWx0LmpzJztcbmltcG9ydCB7IElUZXN0UmVzdWx0U2VydmljZSB9IGZyb20gJy4uLy4uL3Rlc3RpbmcvY29tbW9uL3Rlc3RSZXN1bHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Rlc3RpbmcvY29tbW9uL3Rlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFkYXB0ZXJFbmRFdmVudCwgSUJyZWFrcG9pbnQsIElDb25maWcsIElEYXRhQnJlYWtwb2ludCwgSURhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlLCBJRGVidWdDb25maWd1cmF0aW9uLCBJRGVidWdMb2NhdGlvblJlZmVyZW5jZWQsIElEZWJ1Z1NlcnZpY2UsIElEZWJ1Z1Nlc3Npb24sIElEZWJ1Z1Nlc3Npb25PcHRpb25zLCBJRGVidWdnZXIsIElFeGNlcHRpb25CcmVha3BvaW50LCBJRXhjZXB0aW9uSW5mbywgSUZ1bmN0aW9uQnJlYWtwb2ludCwgSUluc3RydWN0aW9uQnJlYWtwb2ludCwgSU1lbW9yeVJlZ2lvbiwgSVJhd01vZGVsVXBkYXRlLCBJUmF3U3RvcHBlZERldGFpbHMsIElSZXBsRWxlbWVudCwgSVN0YWNrRnJhbWUsIElUaHJlYWQsIExvYWRlZFNvdXJjZUV2ZW50LCBTdGF0ZSwgVklFV0xFVF9JRCwgaXNGcmFtZURlZW1waGFzaXplZCB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0NvbXBvdW5kUm9vdCB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z0NvbXBvdW5kUm9vdC5qcyc7XG5pbXBvcnQgeyBEZWJ1Z01vZGVsLCBFeHByZXNzaW9uQ29udGFpbmVyLCBNZW1vcnlSZWdpb24sIFRocmVhZCB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z01vZGVsLmpzJztcbmltcG9ydCB7IFNvdXJjZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1NvdXJjZS5qcyc7XG5pbXBvcnQgeyBmaWx0ZXJFeGNlcHRpb25zRnJvbVRlbGVtZXRyeSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1V0aWxzLmpzJztcbmltcG9ydCB7IElOZXdSZXBsRWxlbWVudERhdGEsIFJlcGxNb2RlbCB9IGZyb20gJy4uL2NvbW1vbi9yZXBsTW9kZWwuanMnO1xuaW1wb3J0IHsgUmF3RGVidWdTZXNzaW9uIH0gZnJvbSAnLi9yYXdEZWJ1Z1Nlc3Npb24uanMnO1xuXG5jb25zdCBUUklHR0VSRURfQlJFQUtQT0lOVF9NQVhfREVMQVkgPSAxNTAwO1xuXG5leHBvcnQgY2xhc3MgRGVidWdTZXNzaW9uIGltcGxlbWVudHMgSURlYnVnU2Vzc2lvbiB7XG5cdHBhcmVudFNlc3Npb246IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQ7XG5cdHJlbWVtYmVyZWRDYXBhYmlsaXRpZXM/OiBEZWJ1Z1Byb3RvY29sLkNhcGFiaWxpdGllcztcblxuXHRwcml2YXRlIF9zdWJJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyYXc6IFJhd0RlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZDsgLy8gdXNlZCBpbiB0ZXN0c1xuXHRwcml2YXRlIGluaXRpYWxpemVkID0gZmFsc2U7XG5cdHByaXZhdGUgX29wdGlvbnM6IElEZWJ1Z1Nlc3Npb25PcHRpb25zO1xuXG5cdHByaXZhdGUgc291cmNlcyA9IG5ldyBNYXA8c3RyaW5nLCBTb3VyY2U+KCk7XG5cdHByaXZhdGUgdGhyZWFkcyA9IG5ldyBNYXA8bnVtYmVyLCBUaHJlYWQ+KCk7XG5cdHByaXZhdGUgdGhyZWFkSWRzOiBudW1iZXJbXSA9IFtdO1xuXHRwcml2YXRlIGNhbmNlbGxhdGlvbk1hcCA9IG5ldyBNYXA8bnVtYmVyLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZVtdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJhd0xpc3RlbmVycyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBnbG9iYWxEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBmZXRjaFRocmVhZHNTY2hlZHVsZXIgPSBuZXcgTGF6eSgoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdCA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdHRoaXMuZmV0Y2hUaHJlYWRzKCk7XG5cdFx0fSwgMTAwKTtcblx0XHR0aGlzLnJhd0xpc3RlbmVycy5hZGQoaW5zdCk7XG5cdFx0cmV0dXJuIGluc3Q7XG5cdH0pO1xuXHRwcml2YXRlIHBhc3NGb2N1c1NjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSBsYXN0Q29udGludWVkVGhyZWFkSWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZXBsOiBSZXBsTW9kZWw7XG5cdHByaXZhdGUgc3RvcHBlZERldGFpbHM6IElSYXdTdG9wcGVkRGV0YWlsc1tdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgc3RhdHVzUXVldWUgPSB0aGlzLnJhd0xpc3RlbmVycy5hZGQobmV3IFRocmVhZFN0YXR1c1NjaGVkdWxlcigpKTtcblxuXHQvKiogVGVzdCBydW4gdGhpcyBkZWJ1ZyBzZXNzaW9uIHdhcyBzcGF3bmVkIGJ5ICovXG5cdHB1YmxpYyByZWFkb25seSBjb3JyZWxhdGVkVGVzdFJ1bj86IExpdmVUZXN0UmVzdWx0O1xuXHQvKiogV2hldGhlciB3ZSB0ZXJtaW5hdGVkIHRoZSBjb3JyZWxhdGVkIHJ1biB5ZXQuIFVzZWQgc28gYSAybmQgdGVybWluYXRlIHJlcXVlc3QgZ29lcyB0aHJvdWdoIHRvIHRoZSB1bmRlcmx5aW5nIHNlc3Npb24uICovXG5cdHByaXZhdGUgZGlkVGVybWluYXRlVGVzdFJ1bj86IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTdGF0ZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRW5kQWRhcHRlciA9IG5ldyBFbWl0dGVyPEFkYXB0ZXJFbmRFdmVudCB8IHVuZGVmaW5lZD4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZExvYWRlZFNvdXJjZSA9IG5ldyBFbWl0dGVyPExvYWRlZFNvdXJjZUV2ZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEN1c3RvbUV2ZW50ID0gbmV3IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5FdmVudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRQcm9ncmVzc1N0YXJ0ID0gbmV3IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5Qcm9ncmVzc1N0YXJ0RXZlbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUHJvZ3Jlc3NVcGRhdGUgPSBuZXcgRW1pdHRlcjxEZWJ1Z1Byb3RvY29sLlByb2dyZXNzVXBkYXRlRXZlbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUHJvZ3Jlc3NFbmQgPSBuZXcgRW1pdHRlcjxEZWJ1Z1Byb3RvY29sLlByb2dyZXNzRW5kRXZlbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW52YWxpZE1lbW9yeSA9IG5ldyBFbWl0dGVyPERlYnVnUHJvdG9jb2wuTWVtb3J5RXZlbnQ+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSRVBMRWxlbWVudHMgPSBuZXcgRW1pdHRlcjxJUmVwbEVsZW1lbnQgfCB1bmRlZmluZWQ+KCk7XG5cblx0cHJpdmF0ZSBfbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU5hbWUgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cblx0LyoqXG5cdCAqIFByb21pc2Ugc2V0IHdoaWxlIGVuYWJsaW5nIGRlcGVuZGVudCBicmVha3BvaW50cyB0byBibG9jayB0aGUgZGVidWdnZXJcblx0ICogZnJvbSBjb250aW51aW5nIGZyb20gYSBzdG9wcGVkIHN0YXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBfd2FpdFRvUmVzdW1lPzogUHJvbWlzZTx1bmtub3duPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBfY29uZmlndXJhdGlvbjogeyByZXNvbHZlZDogSUNvbmZpZzsgdW5yZXNvbHZlZDogSUNvbmZpZyB8IHVuZGVmaW5lZCB9LFxuXHRcdHB1YmxpYyByb290OiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgbW9kZWw6IERlYnVnTW9kZWwsXG5cdFx0b3B0aW9uczogSURlYnVnU2Vzc2lvbk9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwYW5lQ29tcG9zaXRlU2VydmljZTogSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDdXN0b21FbmRwb2ludFRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjdXN0b21FbmRwb2ludFRlbGVtZXRyeVNlcnZpY2U6IElDdXN0b21FbmRwb2ludFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElUZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdFx0QElUZXN0UmVzdWx0U2VydmljZSB0ZXN0UmVzdWx0U2VydmljZTogSVRlc3RSZXN1bHRTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9vcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblx0XHR0aGlzLnBhcmVudFNlc3Npb24gPSB0aGlzLl9vcHRpb25zLnBhcmVudFNlc3Npb247XG5cdFx0aWYgKHRoaXMuaGFzU2VwYXJhdGVSZXBsKCkpIHtcblx0XHRcdHRoaXMucmVwbCA9IG5ldyBSZXBsTW9kZWwodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVwbCA9ICh0aGlzLnBhcmVudFNlc3Npb24gYXMgRGVidWdTZXNzaW9uKS5yZXBsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvRGlzcG9zZSA9IHRoaXMuZ2xvYmFsRGlzcG9zYWJsZXM7XG5cdFx0Y29uc3QgcmVwbExpc3RlbmVyID0gdG9EaXNwb3NlLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0cmVwbExpc3RlbmVyLnZhbHVlID0gdGhpcy5yZXBsLm9uRGlkQ2hhbmdlRWxlbWVudHMoKGUpID0+IHRoaXMuX29uRGlkQ2hhbmdlUkVQTEVsZW1lbnRzLmZpcmUoZSkpO1xuXHRcdGlmIChsaWZlY3ljbGVTZXJ2aWNlKSB7XG5cdFx0XHR0b0Rpc3Bvc2UuYWRkKGxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNodXRkb3duKCk7XG5cdFx0XHRcdGRpc3Bvc2UodG9EaXNwb3NlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBDYXN0IGhlcmUsIGl0J3Mgbm90IHBvc3NpYmxlIHRvIHJlZmVyZW5jZSBhIGh5ZHJhdGVkIHJlc3VsdCBpbiB0aGlzIGNvZGUgcGF0aC5cblx0XHR0aGlzLmNvcnJlbGF0ZWRUZXN0UnVuID0gb3B0aW9ucz8udGVzdFJ1blxuXHRcdFx0PyAodGVzdFJlc3VsdFNlcnZpY2UuZ2V0UmVzdWx0KG9wdGlvbnMudGVzdFJ1bi5ydW5JZCkgYXMgTGl2ZVRlc3RSZXN1bHQpXG5cdFx0XHQ6IHRoaXMucGFyZW50U2Vzc2lvbj8uY29ycmVsYXRlZFRlc3RSdW47XG5cblx0XHRpZiAodGhpcy5jb3JyZWxhdGVkVGVzdFJ1bikge1xuXHRcdFx0Ly8gTGlzdGVuIHRvIHRoZSB0ZXN0IGNvbXBsZXRpbmcgYmVjYXVzZSB0aGUgdXNlciBtaWdodCBoYXZlIHRha2VuIHRoZSBjYW5jZWwgYWN0aW9uIHJhdGhlciB0aGFuIHN0b3BwaW5nIHRoZSBzZXNzaW9uLlxuXHRcdFx0dG9EaXNwb3NlLmFkZCh0aGlzLmNvcnJlbGF0ZWRUZXN0UnVuLm9uQ29tcGxldGUoKCkgPT4gdGhpcy50ZXJtaW5hdGUoKSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbXBvdW5kUm9vdCA9IHRoaXMuX29wdGlvbnMuY29tcG91bmRSb290O1xuXHRcdGlmIChjb21wb3VuZFJvb3QpIHtcblx0XHRcdHRvRGlzcG9zZS5hZGQoY29tcG91bmRSb290Lm9uRGlkU2Vzc2lvblN0b3AoKCkgPT4gdGhpcy50ZXJtaW5hdGUoKSkpO1xuXHRcdH1cblx0XHR0aGlzLnBhc3NGb2N1c1NjaGVkdWxlciA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdC8vIElmIHRoZXJlIGlzIHNvbWUgc2Vzc2lvbiBvciB0aHJlYWQgdGhhdCBpcyBzdG9wcGVkIHBhc3MgZm9jdXMgdG8gaXRcblx0XHRcdGlmICh0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb25zKCkuc29tZShzID0+IHMuc3RhdGUgPT09IFN0YXRlLlN0b3BwZWQpIHx8IHRoaXMuZ2V0QWxsVGhyZWFkcygpLnNvbWUodCA9PiB0LnN0b3BwZWQpKSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgdGhpcy5sYXN0Q29udGludWVkVGhyZWFkSWQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGhyZWFkID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFRocmVhZDtcblx0XHRcdFx0XHRpZiAodGhyZWFkICYmIHRocmVhZC50aHJlYWRJZCA9PT0gdGhpcy5sYXN0Q29udGludWVkVGhyZWFkSWQgJiYgIXRocmVhZC5zdG9wcGVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0b0ZvY3VzVGhyZWFkSWQgPSB0aGlzLmdldFN0b3BwZWREZXRhaWxzKCk/LnRocmVhZElkO1xuXHRcdFx0XHRcdFx0Y29uc3QgdG9Gb2N1c1RocmVhZCA9IHR5cGVvZiB0b0ZvY3VzVGhyZWFkSWQgPT09ICdudW1iZXInID8gdGhpcy5nZXRUaHJlYWQodG9Gb2N1c1RocmVhZElkKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmZvY3VzU3RhY2tGcmFtZSh1bmRlZmluZWQsIHRvRm9jdXNUaHJlYWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdFx0XHRcdFx0aWYgKHNlc3Npb24gJiYgc2Vzc2lvbi5nZXRJZCgpID09PSB0aGlzLmdldElkKCkgJiYgc2Vzc2lvbi5zdGF0ZSAhPT0gU3RhdGUuU3RvcHBlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZm9jdXNTdGFja0ZyYW1lKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSwgODAwKTtcblxuXHRcdGNvbnN0IHBhcmVudCA9IHRoaXMuX29wdGlvbnMucGFyZW50U2Vzc2lvbjtcblx0XHRpZiAocGFyZW50KSB7XG5cdFx0XHR0b0Rpc3Bvc2UuYWRkKHBhcmVudC5vbkRpZEVuZEFkYXB0ZXIoKCkgPT4ge1xuXHRcdFx0XHQvLyBjb3B5IHRoZSBwYXJlbnQgcmVwbCBhbmQgZ2V0IGEgbmV3IGRldGFjaGVkIHJlcGwgZm9yIHRoaXMgY2hpbGQsIGFuZFxuXHRcdFx0XHQvLyByZW1vdmUgaXRzIHBhcmVudCwgaWYgaXQncyBzdGlsbCBydW5uaW5nXG5cdFx0XHRcdGlmICghdGhpcy5oYXNTZXBhcmF0ZVJlcGwoKSAmJiB0aGlzLnJhdz8uaXNJblNodXRkb3duID09PSBmYWxzZSkge1xuXHRcdFx0XHRcdHRoaXMucmVwbCA9IHRoaXMucmVwbC5jbG9uZSgpO1xuXHRcdFx0XHRcdHJlcGxMaXN0ZW5lci52YWx1ZSA9IHRoaXMucmVwbC5vbkRpZENoYW5nZUVsZW1lbnRzKChlKSA9PiB0aGlzLl9vbkRpZENoYW5nZVJFUExFbGVtZW50cy5maXJlKGUpKTtcblx0XHRcdFx0XHR0aGlzLnBhcmVudFNlc3Npb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlkO1xuXHR9XG5cblx0c2V0U3ViSWQoc3ViSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3N1YklkID0gc3ViSWQ7XG5cdH1cblxuXHRnZXRNZW1vcnkobWVtb3J5UmVmZXJlbmNlOiBzdHJpbmcpOiBJTWVtb3J5UmVnaW9uIHtcblx0XHRyZXR1cm4gbmV3IE1lbW9yeVJlZ2lvbihtZW1vcnlSZWZlcmVuY2UsIHRoaXMpO1xuXHR9XG5cblx0Z2V0IHN1YklkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3N1YklkO1xuXHR9XG5cblx0Z2V0IGNvbmZpZ3VyYXRpb24oKTogSUNvbmZpZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24ucmVzb2x2ZWQ7XG5cdH1cblxuXHRnZXQgdW5yZXNvbHZlZENvbmZpZ3VyYXRpb24oKTogSUNvbmZpZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24udW5yZXNvbHZlZDtcblx0fVxuXG5cdGdldCBsaWZlY3ljbGVNYW5hZ2VkQnlQYXJlbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fb3B0aW9ucy5saWZlY3ljbGVNYW5hZ2VkQnlQYXJlbnQ7XG5cdH1cblxuXHRnZXQgY29tcGFjdCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl9vcHRpb25zLmNvbXBhY3Q7XG5cdH1cblxuXHRnZXQgc2F2ZUJlZm9yZVJlc3RhcnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX29wdGlvbnMuc2F2ZUJlZm9yZVJlc3RhcnQgPz8gIXRoaXMuX29wdGlvbnM/LnBhcmVudFNlc3Npb247XG5cdH1cblxuXHRnZXQgY29tcG91bmRSb290KCk6IERlYnVnQ29tcG91bmRSb290IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW9ucy5jb21wb3VuZFJvb3Q7XG5cdH1cblxuXHRnZXQgc3VwcHJlc3NEZWJ1Z1N0YXR1c2JhcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW9ucy5zdXBwcmVzc0RlYnVnU3RhdHVzYmFyID8/IGZhbHNlO1xuXHR9XG5cblx0Z2V0IHN1cHByZXNzRGVidWdUb29sYmFyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9vcHRpb25zLnN1cHByZXNzRGVidWdUb29sYmFyID8/IGZhbHNlO1xuXHR9XG5cblx0Z2V0IHN1cHByZXNzRGVidWdWaWV3KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9vcHRpb25zLnN1cHByZXNzRGVidWdWaWV3ID8/IGZhbHNlO1xuXHR9XG5cblxuXHRnZXQgYXV0b0V4cGFuZExhenlWYXJpYWJsZXMoKTogYm9vbGVhbiB7XG5cdFx0Ly8gVGhpcyB0aW55IGhlbHBlciBhdm9pZHMgY29udmVydGluZyB0aGUgZW50aXJlIGRlYnVnIG1vZGVsIHRvIHVzZSBzZXJ2aWNlIGluamVjdGlvblxuXHRcdGNvbnN0IHNjcmVlblJlYWRlck9wdGltaXplZCA9IHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKTtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuYXV0b0V4cGFuZExhenlWYXJpYWJsZXM7XG5cdFx0cmV0dXJuIHZhbHVlID09PSAnYXV0bycgJiYgc2NyZWVuUmVhZGVyT3B0aW1pemVkIHx8IHZhbHVlID09PSAnb24nO1xuXHR9XG5cblx0c2V0Q29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uOiB7IHJlc29sdmVkOiBJQ29uZmlnOyB1bnJlc29sdmVkOiBJQ29uZmlnIHwgdW5kZWZpbmVkIH0pIHtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uID0gY29uZmlndXJhdGlvbjtcblx0fVxuXG5cdGdldExhYmVsKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgaW5jbHVkZVJvb3QgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubGVuZ3RoID4gMTtcblx0XHRyZXR1cm4gaW5jbHVkZVJvb3QgJiYgdGhpcy5yb290ID8gYCR7dGhpcy5uYW1lfSAoJHtyZXNvdXJjZXMuYmFzZW5hbWVPckF1dGhvcml0eSh0aGlzLnJvb3QudXJpKX0pYCA6IHRoaXMubmFtZTtcblx0fVxuXG5cdHNldE5hbWUobmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbmFtZSA9IG5hbWU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VOYW1lLmZpcmUobmFtZSk7XG5cdH1cblxuXHRnZXQgbmFtZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9uYW1lIHx8IHRoaXMuY29uZmlndXJhdGlvbi5uYW1lO1xuXHR9XG5cblx0Z2V0IHN0YXRlKCk6IFN0YXRlIHtcblx0XHRpZiAoIXRoaXMuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdHJldHVybiBTdGF0ZS5Jbml0aWFsaXppbmc7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5yYXcpIHtcblx0XHRcdHJldHVybiBTdGF0ZS5JbmFjdGl2ZTtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1c2VkVGhyZWFkID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFRocmVhZDtcblx0XHRpZiAoZm9jdXNlZFRocmVhZCAmJiBmb2N1c2VkVGhyZWFkLnNlc3Npb24gPT09IHRoaXMpIHtcblx0XHRcdHJldHVybiBmb2N1c2VkVGhyZWFkLnN0b3BwZWQgPyBTdGF0ZS5TdG9wcGVkIDogU3RhdGUuUnVubmluZztcblx0XHR9XG5cdFx0aWYgKHRoaXMuZ2V0QWxsVGhyZWFkcygpLnNvbWUodCA9PiB0LnN0b3BwZWQpKSB7XG5cdFx0XHRyZXR1cm4gU3RhdGUuU3RvcHBlZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gU3RhdGUuUnVubmluZztcblx0fVxuXG5cdGdldCBjYXBhYmlsaXRpZXMoKTogRGVidWdQcm90b2NvbC5DYXBhYmlsaXRpZXMge1xuXHRcdHJldHVybiB0aGlzLnJhdyA/IHRoaXMucmF3LmNhcGFiaWxpdGllcyA6IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdH1cblxuXHQvLy0tLS0gZXZlbnRzXG5cdGdldCBvbkRpZENoYW5nZVN0YXRlKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZEVuZEFkYXB0ZXIoKTogRXZlbnQ8QWRhcHRlckVuZEV2ZW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkRW5kQWRhcHRlci5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZVJlcGxFbGVtZW50cygpOiBFdmVudDxJUmVwbEVsZW1lbnQgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VSRVBMRWxlbWVudHMuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VOYW1lKCk6IEV2ZW50PHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZENoYW5nZU5hbWUuZXZlbnQ7XG5cdH1cblxuXHQvLy0tLS0gREFQIGV2ZW50c1xuXG5cdGdldCBvbkRpZEN1c3RvbUV2ZW50KCk6IEV2ZW50PERlYnVnUHJvdG9jb2wuRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDdXN0b21FdmVudC5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZExvYWRlZFNvdXJjZSgpOiBFdmVudDxMb2FkZWRTb3VyY2VFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZExvYWRlZFNvdXJjZS5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZFByb2dyZXNzU3RhcnQoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5Qcm9ncmVzc1N0YXJ0RXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRQcm9ncmVzc1N0YXJ0LmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRGlkUHJvZ3Jlc3NVcGRhdGUoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5Qcm9ncmVzc1VwZGF0ZUV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkUHJvZ3Jlc3NVcGRhdGUuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRQcm9ncmVzc0VuZCgpOiBFdmVudDxEZWJ1Z1Byb3RvY29sLlByb2dyZXNzRW5kRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRQcm9ncmVzc0VuZC5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZEludmFsaWRhdGVNZW1vcnkoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5NZW1vcnlFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZEludmFsaWRNZW1vcnkuZXZlbnQ7XG5cdH1cblxuXHQvLy0tLS0gREFQIHJlcXVlc3RzXG5cblx0LyoqXG5cdCAqIGNyZWF0ZSBhbmQgaW5pdGlhbGl6ZSBhIG5ldyBkZWJ1ZyBhZGFwdGVyIGZvciB0aGlzIHNlc3Npb25cblx0ICovXG5cdGFzeW5jIGluaXRpYWxpemUoZGJncjogSURlYnVnZ2VyKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRpZiAodGhpcy5yYXcpIHtcblx0XHRcdC8vIGlmIHRoZXJlIHdhcyBhbHJlYWR5IGEgY29ubmVjdGlvbiBtYWtlIHN1cmUgdG8gcmVtb3ZlIG9sZCBsaXN0ZW5lcnNcblx0XHRcdGF3YWl0IHRoaXMuc2h1dGRvd24oKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGVidWdBZGFwdGVyID0gYXdhaXQgZGJnci5jcmVhdGVEZWJ1Z0FkYXB0ZXIodGhpcyk7XG5cdFx0XHR0aGlzLnJhdyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmF3RGVidWdTZXNzaW9uLCBkZWJ1Z0FkYXB0ZXIsIGRiZ3IsIHRoaXMuaWQsIHRoaXMuY29uZmlndXJhdGlvbi5uYW1lKTtcblxuXHRcdFx0YXdhaXQgdGhpcy5yYXcuc3RhcnQoKTtcblx0XHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0XHRcdGF3YWl0IHRoaXMucmF3LmluaXRpYWxpemUoe1xuXHRcdFx0XHRjbGllbnRJRDogJ3ZzY29kZScsXG5cdFx0XHRcdGNsaWVudE5hbWU6IHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcsXG5cdFx0XHRcdGFkYXB0ZXJJRDogdGhpcy5jb25maWd1cmF0aW9uLnR5cGUsXG5cdFx0XHRcdHBhdGhGb3JtYXQ6ICdwYXRoJyxcblx0XHRcdFx0bGluZXNTdGFydEF0MTogdHJ1ZSxcblx0XHRcdFx0Y29sdW1uc1N0YXJ0QXQxOiB0cnVlLFxuXHRcdFx0XHRzdXBwb3J0c1ZhcmlhYmxlVHlwZTogdHJ1ZSwgLy8gIzg4NThcblx0XHRcdFx0c3VwcG9ydHNWYXJpYWJsZVBhZ2luZzogdHJ1ZSwgLy8gIzk1Mzdcblx0XHRcdFx0c3VwcG9ydHNSdW5JblRlcm1pbmFsUmVxdWVzdDogdHJ1ZSwgLy8gIzEwNTc0XG5cdFx0XHRcdGxvY2FsZTogcGxhdGZvcm0ubGFuZ3VhZ2UsIC8vICMxNjkxMTRcblx0XHRcdFx0c3VwcG9ydHNQcm9ncmVzc1JlcG9ydGluZzogdHJ1ZSwgLy8gIzkyMjUzXG5cdFx0XHRcdHN1cHBvcnRzSW52YWxpZGF0ZWRFdmVudDogdHJ1ZSwgLy8gIzEwNjc0NVxuXHRcdFx0XHRzdXBwb3J0c01lbW9yeVJlZmVyZW5jZXM6IHRydWUsIC8vIzEyOTY4NFxuXHRcdFx0XHRzdXBwb3J0c0FyZ3NDYW5CZUludGVycHJldGVkQnlTaGVsbDogdHJ1ZSwgLy8gIzE0OTkxMFxuXHRcdFx0XHRzdXBwb3J0c01lbW9yeUV2ZW50OiB0cnVlLCAvLyAjMTMzNjQzXG5cdFx0XHRcdHN1cHBvcnRzU3RhcnREZWJ1Z2dpbmdSZXF1ZXN0OiB0cnVlLFxuXHRcdFx0XHRzdXBwb3J0c0FOU0lTdHlsaW5nOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuaW5pdGlhbGl6ZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5maXJlKCk7XG5cdFx0XHR0aGlzLnJlbWVtYmVyZWRDYXBhYmlsaXRpZXMgPSB0aGlzLnJhdy5jYXBhYmlsaXRpZXM7XG5cdFx0XHR0aGlzLmRlYnVnU2VydmljZS5zZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24odGhpcywgKHRoaXMucmF3ICYmIHRoaXMucmF3LmNhcGFiaWxpdGllcy5leGNlcHRpb25CcmVha3BvaW50RmlsdGVycykgfHwgW10pO1xuXHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5yZWdpc3RlckJyZWFrcG9pbnRNb2Rlcyh0aGlzLmNvbmZpZ3VyYXRpb24udHlwZSwgdGhpcy5yYXcuY2FwYWJpbGl0aWVzLmJyZWFrcG9pbnRNb2RlcyB8fCBbXSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmluaXRpYWxpemVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZmlyZSgpO1xuXHRcdFx0YXdhaXQgdGhpcy5zaHV0ZG93bigpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBsYXVuY2ggb3IgYXR0YWNoIHRvIHRoZSBkZWJ1Z2dlZVxuXHQgKi9cblx0YXN5bmMgbGF1bmNoT3JBdHRhY2goY29uZmlnOiBJQ29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub0RlYnVnQWRhcHRlcicsIFwiTm8gZGVidWdnZXIgYXZhaWxhYmxlLCBjYW4gbm90IHNlbmQgJ3swfSdcIiwgJ2xhdW5jaCBvciBhdHRhY2gnKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnBhcmVudFNlc3Npb24gJiYgdGhpcy5wYXJlbnRTZXNzaW9uLnN0YXRlID09PSBTdGF0ZS5JbmFjdGl2ZSkge1xuXHRcdFx0dGhyb3cgY2FuY2VsZWQoKTtcblx0XHR9XG5cblx0XHQvLyBfX3Nlc3Npb25JRCBvbmx5IHVzZWQgZm9yIEVIIGRlYnVnZ2luZyAoYnV0IHdlIGFkZCBpdCBhbHdheXMgZm9yIG5vdy4uLilcblx0XHRjb25maWcuX19zZXNzaW9uSWQgPSB0aGlzLmdldElkKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMucmF3LmxhdW5jaE9yQXR0YWNoKGNvbmZpZyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLnNodXRkb3duKCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRlcm1pbmF0ZSBhbnkgbGlua2VkIHRlc3QgcnVuLlxuXHQgKi9cblx0Y2FuY2VsQ29ycmVsYXRlZFRlc3RSdW4oKSB7XG5cdFx0aWYgKHRoaXMuY29ycmVsYXRlZFRlc3RSdW4gJiYgIXRoaXMuY29ycmVsYXRlZFRlc3RSdW4uY29tcGxldGVkQXQpIHtcblx0XHRcdHRoaXMuZGlkVGVybWluYXRlVGVzdFJ1biA9IHRydWU7XG5cdFx0XHR0aGlzLnRlc3RTZXJ2aWNlLmNhbmNlbFRlc3RSdW4odGhpcy5jb3JyZWxhdGVkVGVzdFJ1bi5pZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIHRlcm1pbmF0ZSB0aGUgY3VycmVudCBkZWJ1ZyBhZGFwdGVyIHNlc3Npb25cblx0ICovXG5cdGFzeW5jIHRlcm1pbmF0ZShyZXN0YXJ0ID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMucmF3KSB7XG5cdFx0XHQvLyBBZGFwdGVyIHdlbnQgZG93biBidXQgaXQgZGlkIG5vdCBzZW5kIGEgJ3Rlcm1pbmF0ZWQnIGV2ZW50LCBzaW11bGF0ZSBsaWtlIHRoZSBldmVudCBoYXMgYmVlbiBzZW50XG5cdFx0XHR0aGlzLm9uRGlkRXhpdEFkYXB0ZXIoKTtcblx0XHR9XG5cblx0XHR0aGlzLmNhbmNlbEFsbFJlcXVlc3RzKCk7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMubGlmZWN5Y2xlTWFuYWdlZEJ5UGFyZW50ICYmIHRoaXMucGFyZW50U2Vzc2lvbikge1xuXHRcdFx0YXdhaXQgdGhpcy5wYXJlbnRTZXNzaW9uLnRlcm1pbmF0ZShyZXN0YXJ0KTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuY29ycmVsYXRlZFRlc3RSdW4gJiYgIXRoaXMuY29ycmVsYXRlZFRlc3RSdW4uY29tcGxldGVkQXQgJiYgIXRoaXMuZGlkVGVybWluYXRlVGVzdFJ1bikge1xuXHRcdFx0dGhpcy5jYW5jZWxDb3JyZWxhdGVkVGVzdFJ1bigpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5yYXcpIHtcblx0XHRcdGlmICh0aGlzLnJhdy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNUZXJtaW5hdGVSZXF1ZXN0ICYmIHRoaXMuX2NvbmZpZ3VyYXRpb24ucmVzb2x2ZWQucmVxdWVzdCA9PT0gJ2xhdW5jaCcpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5yYXcudGVybWluYXRlKHJlc3RhcnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5yYXcuZGlzY29ubmVjdCh7IHJlc3RhcnQsIHRlcm1pbmF0ZURlYnVnZ2VlOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghcmVzdGFydCkge1xuXHRcdFx0dGhpcy5fb3B0aW9ucy5jb21wb3VuZFJvb3Q/LnNlc3Npb25TdG9wcGVkKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIGVuZCB0aGUgY3VycmVudCBkZWJ1ZyBhZGFwdGVyIHNlc3Npb25cblx0ICovXG5cdGFzeW5jIGRpc2Nvbm5lY3QocmVzdGFydCA9IGZhbHNlLCBzdXNwZW5kID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMucmF3KSB7XG5cdFx0XHQvLyBBZGFwdGVyIHdlbnQgZG93biBidXQgaXQgZGlkIG5vdCBzZW5kIGEgJ3Rlcm1pbmF0ZWQnIGV2ZW50LCBzaW11bGF0ZSBsaWtlIHRoZSBldmVudCBoYXMgYmVlbiBzZW50XG5cdFx0XHR0aGlzLm9uRGlkRXhpdEFkYXB0ZXIoKTtcblx0XHR9XG5cblx0XHR0aGlzLmNhbmNlbEFsbFJlcXVlc3RzKCk7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMubGlmZWN5Y2xlTWFuYWdlZEJ5UGFyZW50ICYmIHRoaXMucGFyZW50U2Vzc2lvbikge1xuXHRcdFx0YXdhaXQgdGhpcy5wYXJlbnRTZXNzaW9uLmRpc2Nvbm5lY3QocmVzdGFydCwgc3VzcGVuZCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnJhdykge1xuXHRcdFx0Ly8gVE9ETyB0ZXJtaW5hdGVEZWJ1Z2dlZSBzaG91bGQgYmUgdW5kZWZpbmVkIGJ5IGRlZmF1bHQ/XG5cdFx0XHRhd2FpdCB0aGlzLnJhdy5kaXNjb25uZWN0KHsgcmVzdGFydCwgdGVybWluYXRlRGVidWdnZWU6IGZhbHNlLCBzdXNwZW5kRGVidWdnZWU6IHN1c3BlbmQgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFyZXN0YXJ0KSB7XG5cdFx0XHR0aGlzLl9vcHRpb25zLmNvbXBvdW5kUm9vdD8uc2Vzc2lvblN0b3BwZWQoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogcmVzdGFydCBkZWJ1ZyBhZGFwdGVyIHNlc3Npb25cblx0ICovXG5cdGFzeW5jIHJlc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub0RlYnVnQWRhcHRlcicsIFwiTm8gZGVidWdnZXIgYXZhaWxhYmxlLCBjYW4gbm90IHNlbmQgJ3swfSdcIiwgJ3Jlc3RhcnQnKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jYW5jZWxBbGxSZXF1ZXN0cygpO1xuXHRcdGlmICh0aGlzLl9vcHRpb25zLmxpZmVjeWNsZU1hbmFnZWRCeVBhcmVudCAmJiB0aGlzLnBhcmVudFNlc3Npb24pIHtcblx0XHRcdGF3YWl0IHRoaXMucGFyZW50U2Vzc2lvbi5yZXN0YXJ0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMucmF3LnJlc3RhcnQoeyBhcmd1bWVudHM6IHRoaXMuY29uZmlndXJhdGlvbiB9KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzZW5kQnJlYWtwb2ludHMobW9kZWxVcmk6IFVSSSwgYnJlYWtwb2ludHNUb1NlbmQ6IElCcmVha3BvaW50W10sIHNvdXJjZU1vZGlmaWVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub0RlYnVnQWRhcHRlcicsIFwiTm8gZGVidWdnZXIgYXZhaWxhYmxlLCBjYW4gbm90IHNlbmQgJ3swfSdcIiwgJ2JyZWFrcG9pbnRzJykpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5yYXcucmVhZHlGb3JCcmVha3BvaW50cykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhd1NvdXJjZSA9IHRoaXMuZ2V0UmF3U291cmNlKG1vZGVsVXJpKTtcblx0XHRpZiAoYnJlYWtwb2ludHNUb1NlbmQubGVuZ3RoICYmICFyYXdTb3VyY2UuYWRhcHRlckRhdGEpIHtcblx0XHRcdHJhd1NvdXJjZS5hZGFwdGVyRGF0YSA9IGJyZWFrcG9pbnRzVG9TZW5kWzBdLmFkYXB0ZXJEYXRhO1xuXHRcdH1cblx0XHQvLyBOb3JtYWxpemUgYWxsIGRyaXZlIGxldHRlcnMgZ29pbmcgb3V0IGZyb20gdnNjb2RlIHRvIGRlYnVnIGFkYXB0ZXJzIHNvIHdlIGFyZSBjb25zaXN0ZW50IHdpdGggb3VyIHJlc29sdmluZyAjNDM5NTlcblx0XHRpZiAocmF3U291cmNlLnBhdGgpIHtcblx0XHRcdHJhd1NvdXJjZS5wYXRoID0gbm9ybWFsaXplRHJpdmVMZXR0ZXIocmF3U291cmNlLnBhdGgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yYXcuc2V0QnJlYWtwb2ludHMoe1xuXHRcdFx0c291cmNlOiByYXdTb3VyY2UsXG5cdFx0XHRsaW5lczogYnJlYWtwb2ludHNUb1NlbmQubWFwKGJwID0+IGJwLnNlc3Npb25BZ25vc3RpY0RhdGEubGluZU51bWJlciksXG5cdFx0XHRicmVha3BvaW50czogYnJlYWtwb2ludHNUb1NlbmQubWFwKGJwID0+IGJwLnRvREFQKCkpLFxuXHRcdFx0c291cmNlTW9kaWZpZWRcblx0XHR9KTtcblx0XHRpZiAocmVzcG9uc2U/LmJvZHkpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSBuZXcgTWFwPHN0cmluZywgRGVidWdQcm90b2NvbC5CcmVha3BvaW50PigpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBicmVha3BvaW50c1RvU2VuZC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRkYXRhLnNldChicmVha3BvaW50c1RvU2VuZFtpXS5nZXRJZCgpLCByZXNwb25zZS5ib2R5LmJyZWFrcG9pbnRzW2ldKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5tb2RlbC5zZXRCcmVha3BvaW50U2Vzc2lvbkRhdGEodGhpcy5nZXRJZCgpLCB0aGlzLmNhcGFiaWxpdGllcywgZGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoZmJwdHM6IElGdW5jdGlvbkJyZWFrcG9pbnRbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5yYXcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsICdmdW5jdGlvbiBicmVha3BvaW50cycpKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5yYXcucmVhZHlGb3JCcmVha3BvaW50cykge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJhdy5zZXRGdW5jdGlvbkJyZWFrcG9pbnRzKHsgYnJlYWtwb2ludHM6IGZicHRzLm1hcChicCA9PiBicC50b0RBUCgpKSB9KTtcblx0XHRcdGlmIChyZXNwb25zZT8uYm9keSkge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gbmV3IE1hcDxzdHJpbmcsIERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludD4oKTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmYnB0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGRhdGEuc2V0KGZicHRzW2ldLmdldElkKCksIHJlc3BvbnNlLmJvZHkuYnJlYWtwb2ludHNbaV0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMubW9kZWwuc2V0QnJlYWtwb2ludFNlc3Npb25EYXRhKHRoaXMuZ2V0SWQoKSwgdGhpcy5jYXBhYmlsaXRpZXMsIGRhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNlbmRFeGNlcHRpb25CcmVha3BvaW50cyhleGJwdHM6IElFeGNlcHRpb25CcmVha3BvaW50W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMucmF3KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vRGVidWdBZGFwdGVyJywgXCJObyBkZWJ1Z2dlciBhdmFpbGFibGUsIGNhbiBub3Qgc2VuZCAnezB9J1wiLCAnZXhjZXB0aW9uIGJyZWFrcG9pbnRzJykpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnJhdy5yZWFkeUZvckJyZWFrcG9pbnRzKSB7XG5cdFx0XHRjb25zdCBhcmdzOiBEZWJ1Z1Byb3RvY29sLlNldEV4Y2VwdGlvbkJyZWFrcG9pbnRzQXJndW1lbnRzID0gdGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNFeGNlcHRpb25GaWx0ZXJPcHRpb25zID8ge1xuXHRcdFx0XHRmaWx0ZXJzOiBbXSxcblx0XHRcdFx0ZmlsdGVyT3B0aW9uczogZXhicHRzLm1hcChleGIgPT4ge1xuXHRcdFx0XHRcdGlmIChleGIuY29uZGl0aW9uKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBmaWx0ZXJJZDogZXhiLmZpbHRlciwgY29uZGl0aW9uOiBleGIuY29uZGl0aW9uIH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHsgZmlsdGVySWQ6IGV4Yi5maWx0ZXIgfTtcblx0XHRcdFx0fSlcblx0XHRcdH0gOiB7IGZpbHRlcnM6IGV4YnB0cy5tYXAoZXhiID0+IGV4Yi5maWx0ZXIpIH07XG5cblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yYXcuc2V0RXhjZXB0aW9uQnJlYWtwb2ludHMoYXJncyk7XG5cdFx0XHRpZiAocmVzcG9uc2U/LmJvZHkgJiYgcmVzcG9uc2UuYm9keS5icmVha3BvaW50cykge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gbmV3IE1hcDxzdHJpbmcsIERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludD4oKTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBleGJwdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRkYXRhLnNldChleGJwdHNbaV0uZ2V0SWQoKSwgcmVzcG9uc2UuYm9keS5icmVha3BvaW50c1tpXSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLm1vZGVsLnNldEJyZWFrcG9pbnRTZXNzaW9uRGF0YSh0aGlzLmdldElkKCksIHRoaXMuY2FwYWJpbGl0aWVzLCBkYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRkYXRhQnl0ZXNCcmVha3BvaW50SW5mbyhhZGRyZXNzOiBzdHJpbmcsIGJ5dGVzOiBudW1iZXIpOiBQcm9taXNlPElEYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLnJhdz8uY2FwYWJpbGl0aWVzLnN1cHBvcnRzRGF0YUJyZWFrcG9pbnRCeXRlcyA9PT0gZmFsc2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnc2Vzc2lvbkRvZXNOb3RTdXBwb3JCeXRlc0JyZWFrcG9pbnRzJywgXCJTZXNzaW9uIGRvZXMgbm90IHN1cHBvcnQgYnJlYWtwb2ludHMgd2l0aCBieXRlc1wiKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2RhdGFCcmVha3BvaW50SW5mbyh7IG5hbWU6IGFkZHJlc3MsIGJ5dGVzLCBhc0FkZHJlc3M6IHRydWUgfSk7XG5cdH1cblxuXHRkYXRhQnJlYWtwb2ludEluZm8obmFtZTogc3RyaW5nLCB2YXJpYWJsZXNSZWZlcmVuY2U/OiBudW1iZXIsIGZyYW1lSWQ/OiBudW1iZXIpOiBQcm9taXNlPHsgZGF0YUlkOiBzdHJpbmcgfCBudWxsOyBkZXNjcmlwdGlvbjogc3RyaW5nOyBjYW5QZXJzaXN0PzogYm9vbGVhbiB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2RhdGFCcmVha3BvaW50SW5mbyh7IG5hbWUsIHZhcmlhYmxlc1JlZmVyZW5jZSwgZnJhbWVJZCB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RhdGFCcmVha3BvaW50SW5mbyhhcmdzOiBEZWJ1Z1Byb3RvY29sLkRhdGFCcmVha3BvaW50SW5mb0FyZ3VtZW50cyk6IFByb21pc2U8eyBkYXRhSWQ6IHN0cmluZyB8IG51bGw7IGRlc2NyaXB0aW9uOiBzdHJpbmc7IGNhblBlcnNpc3Q/OiBib29sZWFuIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMucmF3KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vRGVidWdBZGFwdGVyJywgXCJObyBkZWJ1Z2dlciBhdmFpbGFibGUsIGNhbiBub3Qgc2VuZCAnezB9J1wiLCAnZGF0YSBicmVha3BvaW50cyBpbmZvJykpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMucmF3LnJlYWR5Rm9yQnJlYWtwb2ludHMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnc2Vzc2lvbk5vdFJlYWR5Rm9yQnJlYWtwb2ludHMnLCBcIlNlc3Npb24gaXMgbm90IHJlYWR5IGZvciBicmVha3BvaW50c1wiKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJhdy5kYXRhQnJlYWtwb2ludEluZm8oYXJncyk7XG5cdFx0cmV0dXJuIHJlc3BvbnNlPy5ib2R5O1xuXHR9XG5cblx0YXN5bmMgc2VuZERhdGFCcmVha3BvaW50cyhkYXRhQnJlYWtwb2ludHM6IElEYXRhQnJlYWtwb2ludFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub0RlYnVnQWRhcHRlcicsIFwiTm8gZGVidWdnZXIgYXZhaWxhYmxlLCBjYW4gbm90IHNlbmQgJ3swfSdcIiwgJ2RhdGEgYnJlYWtwb2ludHMnKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucmF3LnJlYWR5Rm9yQnJlYWtwb2ludHMpIHtcblx0XHRcdGNvbnN0IGNvbnZlcnRlZCA9IGF3YWl0IFByb21pc2UuYWxsKGRhdGFCcmVha3BvaW50cy5tYXAoYXN5bmMgYnAgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGRhcCA9IGF3YWl0IGJwLnRvREFQKHRoaXMpO1xuXHRcdFx0XHRcdHJldHVybiB7IGRhcCwgYnAgfTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdHJldHVybiB7IGJwLCBtZXNzYWdlOiBlLm1lc3NhZ2UgfTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJhdy5zZXREYXRhQnJlYWtwb2ludHMoeyBicmVha3BvaW50czogY29udmVydGVkLm1hcChkID0+IGQuZGFwKS5maWx0ZXIoaXNEZWZpbmVkKSB9KTtcblx0XHRcdGlmIChyZXNwb25zZT8uYm9keSkge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gbmV3IE1hcDxzdHJpbmcsIERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludD4oKTtcblx0XHRcdFx0bGV0IGkgPSAwO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGRhcCBvZiBjb252ZXJ0ZWQpIHtcblx0XHRcdFx0XHRpZiAoIWRhcC5kYXApIHtcblx0XHRcdFx0XHRcdGRhdGEuc2V0KGRhcC5icC5nZXRJZCgpLCBkYXAubWVzc2FnZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpIDwgcmVzcG9uc2UuYm9keS5icmVha3BvaW50cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGRhdGEuc2V0KGRhcC5icC5nZXRJZCgpLCByZXNwb25zZS5ib2R5LmJyZWFrcG9pbnRzW2krK10pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLm1vZGVsLnNldEJyZWFrcG9pbnRTZXNzaW9uRGF0YSh0aGlzLmdldElkKCksIHRoaXMuY2FwYWJpbGl0aWVzLCBkYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBzZW5kSW5zdHJ1Y3Rpb25CcmVha3BvaW50cyhpbnN0cnVjdGlvbkJyZWFrcG9pbnRzOiBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMucmF3KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vRGVidWdBZGFwdGVyJywgXCJObyBkZWJ1Z2dlciBhdmFpbGFibGUsIGNhbiBub3Qgc2VuZCAnezB9J1wiLCAnaW5zdHJ1Y3Rpb24gYnJlYWtwb2ludHMnKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucmF3LnJlYWR5Rm9yQnJlYWtwb2ludHMpIHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yYXcuc2V0SW5zdHJ1Y3Rpb25CcmVha3BvaW50cyh7IGJyZWFrcG9pbnRzOiBpbnN0cnVjdGlvbkJyZWFrcG9pbnRzLm1hcChpYiA9PiBpYi50b0RBUCgpKSB9KTtcblx0XHRcdGlmIChyZXNwb25zZT8uYm9keSkge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gbmV3IE1hcDxzdHJpbmcsIERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludD4oKTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpbnN0cnVjdGlvbkJyZWFrcG9pbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0ZGF0YS5zZXQoaW5zdHJ1Y3Rpb25CcmVha3BvaW50c1tpXS5nZXRJZCgpLCByZXNwb25zZS5ib2R5LmJyZWFrcG9pbnRzW2ldKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLm1vZGVsLnNldEJyZWFrcG9pbnRTZXNzaW9uRGF0YSh0aGlzLmdldElkKCksIHRoaXMuY2FwYWJpbGl0aWVzLCBkYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBicmVha3BvaW50c0xvY2F0aW9ucyh1cmk6IFVSSSwgbGluZU51bWJlcjogbnVtYmVyKTogUHJvbWlzZTxJUG9zaXRpb25bXT4ge1xuXHRcdGlmICghdGhpcy5yYXcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsICdicmVha3BvaW50cyBsb2NhdGlvbnMnKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc291cmNlID0gdGhpcy5nZXRSYXdTb3VyY2UodXJpKTtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmF3LmJyZWFrcG9pbnRMb2NhdGlvbnMoeyBzb3VyY2UsIGxpbmU6IGxpbmVOdW1iZXIgfSk7XG5cdFx0aWYgKCFyZXNwb25zZSB8fCAhcmVzcG9uc2UuYm9keSB8fCAhcmVzcG9uc2UuYm9keS5icmVha3BvaW50cykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvc2l0aW9ucyA9IHJlc3BvbnNlLmJvZHkuYnJlYWtwb2ludHMubWFwKGJwID0+ICh7IGxpbmVOdW1iZXI6IGJwLmxpbmUsIGNvbHVtbjogYnAuY29sdW1uIHx8IDEgfSkpO1xuXG5cdFx0cmV0dXJuIGRpc3RpbmN0KHBvc2l0aW9ucywgcCA9PiBgJHtwLmxpbmVOdW1iZXJ9OiR7cC5jb2x1bW59YCk7XG5cdH1cblxuXHRnZXREZWJ1Z1Byb3RvY29sQnJlYWtwb2ludChicmVha3BvaW50SWQ6IHN0cmluZyk6IERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0RGVidWdQcm90b2NvbEJyZWFrcG9pbnQoYnJlYWtwb2ludElkLCB0aGlzLmdldElkKCkpO1xuXHR9XG5cblx0Y3VzdG9tUmVxdWVzdChyZXF1ZXN0OiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8RGVidWdQcm90b2NvbC5SZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5yYXcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsIHJlcXVlc3QpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5yYXcuY3VzdG9tKHJlcXVlc3QsIGFyZ3MpO1xuXHR9XG5cblx0c3RhY2tUcmFjZSh0aHJlYWRJZDogbnVtYmVyLCBzdGFydEZyYW1lOiBudW1iZXIsIGxldmVsczogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU3RhY2tUcmFjZVJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub0RlYnVnQWRhcHRlcicsIFwiTm8gZGVidWdnZXIgYXZhaWxhYmxlLCBjYW4gbm90IHNlbmQgJ3swfSdcIiwgJ3N0YWNrVHJhY2UnKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblRva2VuID0gdGhpcy5nZXROZXdDYW5jZWxsYXRpb25Ub2tlbih0aHJlYWRJZCwgdG9rZW4pO1xuXHRcdHJldHVybiB0aGlzLnJhdy5zdGFja1RyYWNlKHsgdGhyZWFkSWQsIHN0YXJ0RnJhbWUsIGxldmVscyB9LCBzZXNzaW9uVG9rZW4pO1xuXHR9XG5cblx0YXN5bmMgZXhjZXB0aW9uSW5mbyh0aHJlYWRJZDogbnVtYmVyKTogUHJvbWlzZTxJRXhjZXB0aW9uSW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5yYXcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsICdleGNlcHRpb25JbmZvJykpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yYXcuZXhjZXB0aW9uSW5mbyh7IHRocmVhZElkIH0pO1xuXHRcdGlmIChyZXNwb25zZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IHJlc3BvbnNlLmJvZHkuZXhjZXB0aW9uSWQsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiByZXNwb25zZS5ib2R5LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRicmVha01vZGU6IHJlc3BvbnNlLmJvZHkuYnJlYWtNb2RlLFxuXHRcdFx0XHRkZXRhaWxzOiByZXNwb25zZS5ib2R5LmRldGFpbHNcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHNjb3BlcyhmcmFtZUlkOiBudW1iZXIsIHRocmVhZElkOiBudW1iZXIpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU2NvcGVzUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMucmF3KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vRGVidWdBZGFwdGVyJywgXCJObyBkZWJ1Z2dlciBhdmFpbGFibGUsIGNhbiBub3Qgc2VuZCAnezB9J1wiLCAnc2NvcGVzJykpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5nZXROZXdDYW5jZWxsYXRpb25Ub2tlbih0aHJlYWRJZCk7XG5cdFx0cmV0dXJuIHRoaXMucmF3LnNjb3Blcyh7IGZyYW1lSWQgfSwgdG9rZW4pO1xuXHR9XG5cblx0dmFyaWFibGVzKHZhcmlhYmxlc1JlZmVyZW5jZTogbnVtYmVyLCB0aHJlYWRJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBmaWx0ZXI6ICdpbmRleGVkJyB8ICduYW1lZCcgfCB1bmRlZmluZWQsIHN0YXJ0OiBudW1iZXIgfCB1bmRlZmluZWQsIGNvdW50OiBudW1iZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuVmFyaWFibGVzUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMucmF3KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vRGVidWdBZGFwdGVyJywgXCJObyBkZWJ1Z2dlciBhdmFpbGFibGUsIGNhbiBub3Qgc2VuZCAnezB9J1wiLCAndmFyaWFibGVzJykpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VuID0gdGhyZWFkSWQgPyB0aGlzLmdldE5ld0NhbmNlbGxhdGlvblRva2VuKHRocmVhZElkKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gdGhpcy5yYXcudmFyaWFibGVzKHsgdmFyaWFibGVzUmVmZXJlbmNlLCBmaWx0ZXIsIHN0YXJ0LCBjb3VudCB9LCB0b2tlbik7XG5cdH1cblxuXHRldmFsdWF0ZShleHByZXNzaW9uOiBzdHJpbmcsIGZyYW1lSWQ6IG51bWJlciwgY29udGV4dD86IHN0cmluZywgbG9jYXRpb24/OiB7IGxpbmU6IG51bWJlcjsgY29sdW1uOiBudW1iZXI7IHNvdXJjZTogRGVidWdQcm90b2NvbC5Tb3VyY2UgfSk6IFByb21pc2U8RGVidWdQcm90b2NvbC5FdmFsdWF0ZVJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub0RlYnVnQWRhcHRlcicsIFwiTm8gZGVidWdnZXIgYXZhaWxhYmxlLCBjYW4gbm90IHNlbmQgJ3swfSdcIiwgJ2V2YWx1YXRlJykpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJhdy5ldmFsdWF0ZSh7IGV4cHJlc3Npb24sIGZyYW1lSWQsIGNvbnRleHQsIGxpbmU6IGxvY2F0aW9uPy5saW5lLCBjb2x1bW46IGxvY2F0aW9uPy5jb2x1bW4sIHNvdXJjZTogbG9jYXRpb24/LnNvdXJjZSB9KTtcblx0fVxuXG5cdGFzeW5jIHJlc3RhcnRGcmFtZShmcmFtZUlkOiBudW1iZXIsIHRocmVhZElkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLndhaXRGb3JUcmlnZ2VyZWRCcmVha3BvaW50cygpO1xuXHRcdGlmICghdGhpcy5yYXcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsICdyZXN0YXJ0RnJhbWUnKSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5yYXcucmVzdGFydEZyYW1lKHsgZnJhbWVJZCB9LCB0aHJlYWRJZCk7XG5cdH1cblxuXHRwcml2YXRlIHNldExhc3RTdGVwcGluZ0dyYW51bGFyaXR5KHRocmVhZElkOiBudW1iZXIsIGdyYW51bGFyaXR5PzogRGVidWdQcm90b2NvbC5TdGVwcGluZ0dyYW51bGFyaXR5KSB7XG5cdFx0Y29uc3QgdGhyZWFkID0gdGhpcy5nZXRUaHJlYWQodGhyZWFkSWQpO1xuXHRcdGlmICh0aHJlYWQpIHtcblx0XHRcdHRocmVhZC5sYXN0U3RlcHBpbmdHcmFudWxhcml0eSA9IGdyYW51bGFyaXR5O1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIG5leHQodGhyZWFkSWQ6IG51bWJlciwgZ3JhbnVsYXJpdHk/OiBEZWJ1Z1Byb3RvY29sLlN0ZXBwaW5nR3JhbnVsYXJpdHkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLndhaXRGb3JUcmlnZ2VyZWRCcmVha3BvaW50cygpO1xuXHRcdGlmICghdGhpcy5yYXcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsICduZXh0JykpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0TGFzdFN0ZXBwaW5nR3JhbnVsYXJpdHkodGhyZWFkSWQsIGdyYW51bGFyaXR5KTtcblx0XHRhd2FpdCB0aGlzLnJhdy5uZXh0KHsgdGhyZWFkSWQsIGdyYW51bGFyaXR5IH0pO1xuXHR9XG5cblx0YXN5bmMgc3RlcEluKHRocmVhZElkOiBudW1iZXIsIHRhcmdldElkPzogbnVtYmVyLCBncmFudWxhcml0eT86IERlYnVnUHJvdG9jb2wuU3RlcHBpbmdHcmFudWxhcml0eSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMud2FpdEZvclRyaWdnZXJlZEJyZWFrcG9pbnRzKCk7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub0RlYnVnQWRhcHRlcicsIFwiTm8gZGVidWdnZXIgYXZhaWxhYmxlLCBjYW4gbm90IHNlbmQgJ3swfSdcIiwgJ3N0ZXBJbicpKTtcblx0XHR9XG5cblx0XHR0aGlzLnNldExhc3RTdGVwcGluZ0dyYW51bGFyaXR5KHRocmVhZElkLCBncmFudWxhcml0eSk7XG5cdFx0YXdhaXQgdGhpcy5yYXcuc3RlcEluKHsgdGhyZWFkSWQsIHRhcmdldElkLCBncmFudWxhcml0eSB9KTtcblx0fVxuXG5cdGFzeW5jIHN0ZXBPdXQodGhyZWFkSWQ6IG51bWJlciwgZ3JhbnVsYXJpdHk/OiBEZWJ1Z1Byb3RvY29sLlN0ZXBwaW5nR3JhbnVsYXJpdHkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLndhaXRGb3JUcmlnZ2VyZWRCcmVha3BvaW50cygpO1xuXHRcdGlmICghdGhpcy5yYXcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsICdzdGVwT3V0JykpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0TGFzdFN0ZXBwaW5nR3JhbnVsYXJpdHkodGhyZWFkSWQsIGdyYW51bGFyaXR5KTtcblx0XHRhd2FpdCB0aGlzLnJhdy5zdGVwT3V0KHsgdGhyZWFkSWQsIGdyYW51bGFyaXR5IH0pO1xuXHR9XG5cblx0YXN5bmMgc3RlcEJhY2sodGhyZWFkSWQ6IG51bWJlciwgZ3JhbnVsYXJpdHk/OiBEZWJ1Z1Byb3RvY29sLlN0ZXBwaW5nR3JhbnVsYXJpdHkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLndhaXRGb3JUcmlnZ2VyZWRCcmVha3BvaW50cygpO1xuXHRcdGlmICghdGhpcy5yYXcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsICdzdGVwQmFjaycpKTtcblx0XHR9XG5cblx0XHR0aGlzLnNldExhc3RTdGVwcGluZ0dyYW51bGFyaXR5KHRocmVhZElkLCBncmFudWxhcml0eSk7XG5cdFx0YXdhaXQgdGhpcy5yYXcuc3RlcEJhY2soeyB0aHJlYWRJZCwgZ3JhbnVsYXJpdHkgfSk7XG5cdH1cblxuXHRhc3luYyBjb250aW51ZSh0aHJlYWRJZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy53YWl0Rm9yVHJpZ2dlcmVkQnJlYWtwb2ludHMoKTtcblx0XHRpZiAoIXRoaXMucmF3KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vRGVidWdBZGFwdGVyJywgXCJObyBkZWJ1Z2dlciBhdmFpbGFibGUsIGNhbiBub3Qgc2VuZCAnezB9J1wiLCAnY29udGludWUnKSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5yYXcuY29udGludWUoeyB0aHJlYWRJZCB9KTtcblx0fVxuXG5cdGFzeW5jIHJldmVyc2VDb250aW51ZSh0aHJlYWRJZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy53YWl0Rm9yVHJpZ2dlcmVkQnJlYWtwb2ludHMoKTtcblx0XHRpZiAoIXRoaXMucmF3KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vRGVidWdBZGFwdGVyJywgXCJObyBkZWJ1Z2dlciBhdmFpbGFibGUsIGNhbiBub3Qgc2VuZCAnezB9J1wiLCAncmV2ZXJzZSBjb250aW51ZScpKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnJhdy5yZXZlcnNlQ29udGludWUoeyB0aHJlYWRJZCB9KTtcblx0fVxuXG5cdGFzeW5jIHBhdXNlKHRocmVhZElkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMucmF3KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vRGVidWdBZGFwdGVyJywgXCJObyBkZWJ1Z2dlciBhdmFpbGFibGUsIGNhbiBub3Qgc2VuZCAnezB9J1wiLCAncGF1c2UnKSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5yYXcucGF1c2UoeyB0aHJlYWRJZCB9KTtcblx0fVxuXG5cdGFzeW5jIHRlcm1pbmF0ZVRocmVhZHModGhyZWFkSWRzPzogbnVtYmVyW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMucmF3KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vRGVidWdBZGFwdGVyJywgXCJObyBkZWJ1Z2dlciBhdmFpbGFibGUsIGNhbiBub3Qgc2VuZCAnezB9J1wiLCAndGVybWluYXRlVGhyZWFkcycpKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnJhdy50ZXJtaW5hdGVUaHJlYWRzKHsgdGhyZWFkSWRzIH0pO1xuXHR9XG5cblx0c2V0VmFyaWFibGUodmFyaWFibGVzUmVmZXJlbmNlOiBudW1iZXIsIG5hbWU6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5TZXRWYXJpYWJsZVJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub0RlYnVnQWRhcHRlcicsIFwiTm8gZGVidWdnZXIgYXZhaWxhYmxlLCBjYW4gbm90IHNlbmQgJ3swfSdcIiwgJ3NldFZhcmlhYmxlJykpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJhdy5zZXRWYXJpYWJsZSh7IHZhcmlhYmxlc1JlZmVyZW5jZSwgbmFtZSwgdmFsdWUgfSk7XG5cdH1cblxuXHRzZXRFeHByZXNzaW9uKGZyYW1lSWQ6IG51bWJlciwgZXhwcmVzc2lvbjogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlNldEV4cHJlc3Npb25SZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5yYXcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsICdzZXRFeHByZXNzaW9uJykpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJhdy5zZXRFeHByZXNzaW9uKHsgZXhwcmVzc2lvbiwgdmFsdWUsIGZyYW1lSWQgfSk7XG5cdH1cblxuXHRnb3RvVGFyZ2V0cyhzb3VyY2U6IERlYnVnUHJvdG9jb2wuU291cmNlLCBsaW5lOiBudW1iZXIsIGNvbHVtbj86IG51bWJlcik6IFByb21pc2U8RGVidWdQcm90b2NvbC5Hb3RvVGFyZ2V0c1Jlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub0RlYnVnQWRhcHRlcicsIFwiTm8gZGVidWdnZXIgYXZhaWxhYmxlLCBjYW4gbm90IHNlbmQgJ3swfSdcIiwgJ2dvdG9UYXJnZXRzJykpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJhdy5nb3RvVGFyZ2V0cyh7IHNvdXJjZSwgbGluZSwgY29sdW1uIH0pO1xuXHR9XG5cblx0Z290byh0aHJlYWRJZDogbnVtYmVyLCB0YXJnZXRJZDogbnVtYmVyKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkdvdG9SZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5yYXcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsICdnb3RvJykpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJhdy5nb3RvKHsgdGhyZWFkSWQsIHRhcmdldElkIH0pO1xuXHR9XG5cblx0bG9hZFNvdXJjZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlNvdXJjZVJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsICdsb2FkU291cmNlJykpKTtcblx0XHR9XG5cblx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLmdldFNvdXJjZUZvclVyaShyZXNvdXJjZSk7XG5cdFx0bGV0IHJhd1NvdXJjZTogRGVidWdQcm90b2NvbC5Tb3VyY2U7XG5cdFx0aWYgKHNvdXJjZSkge1xuXHRcdFx0cmF3U291cmNlID0gc291cmNlLnJhdztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gY3JlYXRlIGEgU291cmNlXG5cdFx0XHRjb25zdCBkYXRhID0gU291cmNlLmdldEVuY29kZWREZWJ1Z0RhdGEocmVzb3VyY2UpO1xuXHRcdFx0cmF3U291cmNlID0geyBwYXRoOiBkYXRhLnBhdGgsIHNvdXJjZVJlZmVyZW5jZTogZGF0YS5zb3VyY2VSZWZlcmVuY2UgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5yYXcuc291cmNlKHsgc291cmNlUmVmZXJlbmNlOiByYXdTb3VyY2Uuc291cmNlUmVmZXJlbmNlIHx8IDAsIHNvdXJjZTogcmF3U291cmNlIH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0TG9hZGVkU291cmNlcygpOiBQcm9taXNlPFNvdXJjZVtdPiB7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsICdnZXRMb2FkZWRTb3VyY2VzJykpKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmF3LmxvYWRlZFNvdXJjZXMoe30pO1xuXHRcdGlmIChyZXNwb25zZT8uYm9keSAmJiByZXNwb25zZS5ib2R5LnNvdXJjZXMpIHtcblx0XHRcdHJldHVybiByZXNwb25zZS5ib2R5LnNvdXJjZXMubWFwKHNyYyA9PiB0aGlzLmdldFNvdXJjZShzcmMpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNvbXBsZXRpb25zKGZyYW1lSWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgdGhyZWFkSWQ6IG51bWJlciwgdGV4dDogc3RyaW5nLCBwb3NpdGlvbjogUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RGVidWdQcm90b2NvbC5Db21wbGV0aW9uc1Jlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsICdjb21wbGV0aW9ucycpKSk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25DYW5jZWxhdGlvblRva2VuID0gdGhpcy5nZXROZXdDYW5jZWxsYXRpb25Ub2tlbih0aHJlYWRJZCwgdG9rZW4pO1xuXG5cdFx0cmV0dXJuIHRoaXMucmF3LmNvbXBsZXRpb25zKHtcblx0XHRcdGZyYW1lSWQsXG5cdFx0XHR0ZXh0LFxuXHRcdFx0Y29sdW1uOiBwb3NpdGlvbi5jb2x1bW4sXG5cdFx0XHRsaW5lOiBwb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdH0sIHNlc3Npb25DYW5jZWxhdGlvblRva2VuKTtcblx0fVxuXG5cdGFzeW5jIHN0ZXBJblRhcmdldHMoZnJhbWVJZDogbnVtYmVyKTogUHJvbWlzZTx7IGlkOiBudW1iZXI7IGxhYmVsOiBzdHJpbmcgfVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsICdzdGVwSW5UYXJnZXRzJykpKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmF3LnN0ZXBJblRhcmdldHMoeyBmcmFtZUlkIH0pO1xuXHRcdHJldHVybiByZXNwb25zZT8uYm9keS50YXJnZXRzO1xuXHR9XG5cblx0YXN5bmMgY2FuY2VsKHByb2dyZXNzSWQ6IHN0cmluZyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5DYW5jZWxSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5yYXcpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IobG9jYWxpemUoJ25vRGVidWdBZGFwdGVyJywgXCJObyBkZWJ1Z2dlciBhdmFpbGFibGUsIGNhbiBub3Qgc2VuZCAnezB9J1wiLCAnY2FuY2VsJykpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5yYXcuY2FuY2VsKHsgcHJvZ3Jlc3NJZCB9KTtcblx0fVxuXG5cdGFzeW5jIGRpc2Fzc2VtYmxlKG1lbW9yeVJlZmVyZW5jZTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlciwgaW5zdHJ1Y3Rpb25PZmZzZXQ6IG51bWJlciwgaW5zdHJ1Y3Rpb25Db3VudDogbnVtYmVyKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkRpc2Fzc2VtYmxlZEluc3RydWN0aW9uW10gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMucmF3KSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKGxvY2FsaXplKCdub0RlYnVnQWRhcHRlcicsIFwiTm8gZGVidWdnZXIgYXZhaWxhYmxlLCBjYW4gbm90IHNlbmQgJ3swfSdcIiwgJ2Rpc2Fzc2VtYmxlJykpKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucmF3LmRpc2Fzc2VtYmxlKHsgbWVtb3J5UmVmZXJlbmNlLCBvZmZzZXQsIGluc3RydWN0aW9uT2Zmc2V0LCBpbnN0cnVjdGlvbkNvdW50LCByZXNvbHZlU3ltYm9sczogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gcmVzcG9uc2U/LmJvZHk/Lmluc3RydWN0aW9ucztcblx0fVxuXG5cdHJlYWRNZW1vcnkobWVtb3J5UmVmZXJlbmNlOiBzdHJpbmcsIG9mZnNldDogbnVtYmVyLCBjb3VudDogbnVtYmVyKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlJlYWRNZW1vcnlSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5yYXcpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IobG9jYWxpemUoJ25vRGVidWdBZGFwdGVyJywgXCJObyBkZWJ1Z2dlciBhdmFpbGFibGUsIGNhbiBub3Qgc2VuZCAnezB9J1wiLCAncmVhZE1lbW9yeScpKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucmF3LnJlYWRNZW1vcnkoeyBjb3VudCwgbWVtb3J5UmVmZXJlbmNlLCBvZmZzZXQgfSk7XG5cdH1cblxuXHR3cml0ZU1lbW9yeShtZW1vcnlSZWZlcmVuY2U6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIsIGRhdGE6IHN0cmluZywgYWxsb3dQYXJ0aWFsPzogYm9vbGVhbik6IFByb21pc2U8RGVidWdQcm90b2NvbC5Xcml0ZU1lbW9yeVJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihsb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSwgY2FuIG5vdCBzZW5kICd7MH0nXCIsICdkaXNhc3NlbWJsZScpKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucmF3LndyaXRlTWVtb3J5KHsgbWVtb3J5UmVmZXJlbmNlLCBvZmZzZXQsIGFsbG93UGFydGlhbCwgZGF0YSB9KTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVMb2NhdGlvblJlZmVyZW5jZShsb2NhdGlvblJlZmVyZW5jZTogbnVtYmVyKTogUHJvbWlzZTxJRGVidWdMb2NhdGlvblJlZmVyZW5jZWQ+IHtcblx0XHRpZiAoIXRoaXMucmF3KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vRGVidWdBZGFwdGVyJywgXCJObyBkZWJ1Z2dlciBhdmFpbGFibGUsIGNhbiBub3Qgc2VuZCAnezB9J1wiLCAnbG9jYXRpb25zJykpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvY2F0aW9uID0gYXdhaXQgdGhpcy5yYXcubG9jYXRpb25zKHsgbG9jYXRpb25SZWZlcmVuY2UgfSk7XG5cdFx0aWYgKCFsb2NhdGlvbj8uYm9keSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub0RlYnVnQWRhcHRlcicsIFwiTm8gZGVidWdnZXIgYXZhaWxhYmxlLCBjYW4gbm90IHNlbmQgJ3swfSdcIiwgJ2xvY2F0aW9ucycpKTtcblx0XHR9XG5cblx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLmdldFNvdXJjZShsb2NhdGlvbi5ib2R5LnNvdXJjZSk7XG5cdFx0cmV0dXJuIHsgY29sdW1uOiAxLCAuLi5sb2NhdGlvbi5ib2R5LCBzb3VyY2UgfTtcblx0fVxuXG5cdC8vLS0tLSB0aHJlYWRzXG5cblx0Z2V0VGhyZWFkKHRocmVhZElkOiBudW1iZXIpOiBUaHJlYWQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnRocmVhZHMuZ2V0KHRocmVhZElkKTtcblx0fVxuXG5cdGdldEFsbFRocmVhZHMoKTogSVRocmVhZFtdIHtcblx0XHRjb25zdCByZXN1bHQ6IElUaHJlYWRbXSA9IFtdO1xuXHRcdHRoaXMudGhyZWFkSWRzLmZvckVhY2goKHRocmVhZElkKSA9PiB7XG5cdFx0XHRjb25zdCB0aHJlYWQgPSB0aGlzLnRocmVhZHMuZ2V0KHRocmVhZElkKTtcblx0XHRcdGlmICh0aHJlYWQpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2godGhyZWFkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Y2xlYXJUaHJlYWRzKHJlbW92ZVRocmVhZHM6IGJvb2xlYW4sIHJlZmVyZW5jZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHJlZmVyZW5jZSAhPT0gdW5kZWZpbmVkICYmIHJlZmVyZW5jZSAhPT0gbnVsbCkge1xuXHRcdFx0Y29uc3QgdGhyZWFkID0gdGhpcy50aHJlYWRzLmdldChyZWZlcmVuY2UpO1xuXHRcdFx0aWYgKHRocmVhZCkge1xuXHRcdFx0XHR0aHJlYWQuY2xlYXJDYWxsU3RhY2soKTtcblx0XHRcdFx0dGhyZWFkLnN0b3BwZWREZXRhaWxzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aHJlYWQuc3RvcHBlZCA9IGZhbHNlO1xuXG5cdFx0XHRcdGlmIChyZW1vdmVUaHJlYWRzKSB7XG5cdFx0XHRcdFx0dGhpcy50aHJlYWRzLmRlbGV0ZShyZWZlcmVuY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudGhyZWFkcy5mb3JFYWNoKHRocmVhZCA9PiB7XG5cdFx0XHRcdHRocmVhZC5jbGVhckNhbGxTdGFjaygpO1xuXHRcdFx0XHR0aHJlYWQuc3RvcHBlZERldGFpbHMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRocmVhZC5zdG9wcGVkID0gZmFsc2U7XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHJlbW92ZVRocmVhZHMpIHtcblx0XHRcdFx0dGhpcy50aHJlYWRzLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMudGhyZWFkSWRzID0gW107XG5cdFx0XHRcdEV4cHJlc3Npb25Db250YWluZXIuYWxsVmFsdWVzLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0U3RvcHBlZERldGFpbHMoKTogSVJhd1N0b3BwZWREZXRhaWxzIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5zdG9wcGVkRGV0YWlscy5sZW5ndGggPj0gMSA/IHRoaXMuc3RvcHBlZERldGFpbHNbMF0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyYXdVcGRhdGUoZGF0YTogSVJhd01vZGVsVXBkYXRlKTogdm9pZCB7XG5cdFx0dGhpcy50aHJlYWRJZHMgPSBbXTtcblx0XHRkYXRhLnRocmVhZHMuZm9yRWFjaCh0aHJlYWQgPT4ge1xuXHRcdFx0dGhpcy50aHJlYWRJZHMucHVzaCh0aHJlYWQuaWQpO1xuXHRcdFx0aWYgKCF0aGlzLnRocmVhZHMuaGFzKHRocmVhZC5pZCkpIHtcblx0XHRcdFx0Ly8gQSBuZXcgdGhyZWFkIGNhbWUgaW4sIGluaXRpYWxpemUgaXQuXG5cdFx0XHRcdHRoaXMudGhyZWFkcy5zZXQodGhyZWFkLmlkLCBuZXcgVGhyZWFkKHRoaXMsIHRocmVhZC5uYW1lLCB0aHJlYWQuaWQpKTtcblx0XHRcdH0gZWxzZSBpZiAodGhyZWFkLm5hbWUpIHtcblx0XHRcdFx0Ly8gSnVzdCB0aGUgdGhyZWFkIG5hbWUgZ290IHVwZGF0ZWQgIzE4MjQ0XG5cdFx0XHRcdGNvbnN0IG9sZFRocmVhZCA9IHRoaXMudGhyZWFkcy5nZXQodGhyZWFkLmlkKTtcblx0XHRcdFx0aWYgKG9sZFRocmVhZCkge1xuXHRcdFx0XHRcdG9sZFRocmVhZC5uYW1lID0gdGhyZWFkLm5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLnRocmVhZHMuZm9yRWFjaCh0ID0+IHtcblx0XHRcdC8vIFJlbW92ZSBhbGwgb2xkIHRocmVhZHMgd2hpY2ggYXJlIG5vIGxvbmdlciBwYXJ0IG9mIHRoZSB1cGRhdGUgIzc1OTgwXG5cdFx0XHRpZiAodGhpcy50aHJlYWRJZHMuaW5kZXhPZih0LnRocmVhZElkKSA9PT0gLTEpIHtcblx0XHRcdFx0dGhpcy50aHJlYWRzLmRlbGV0ZSh0LnRocmVhZElkKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHN0b3BwZWREZXRhaWxzID0gZGF0YS5zdG9wcGVkRGV0YWlscztcblx0XHRpZiAoc3RvcHBlZERldGFpbHMpIHtcblx0XHRcdC8vIFNldCB0aGUgYXZhaWxhYmlsaXR5IG9mIHRoZSB0aHJlYWRzJyBjYWxsc3RhY2tzIGRlcGVuZGluZyBvblxuXHRcdFx0Ly8gd2hldGhlciB0aGUgdGhyZWFkIGlzIHN0b3BwZWQgb3Igbm90XG5cdFx0XHRpZiAoc3RvcHBlZERldGFpbHMuYWxsVGhyZWFkc1N0b3BwZWQpIHtcblx0XHRcdFx0dGhpcy50aHJlYWRzLmZvckVhY2godGhyZWFkID0+IHtcblx0XHRcdFx0XHR0aHJlYWQuc3RvcHBlZERldGFpbHMgPSB0aHJlYWQudGhyZWFkSWQgPT09IHN0b3BwZWREZXRhaWxzLnRocmVhZElkID8gc3RvcHBlZERldGFpbHMgOiB7IHJlYXNvbjogdGhyZWFkLnN0b3BwZWREZXRhaWxzPy5yZWFzb24gfTtcblx0XHRcdFx0XHR0aHJlYWQuc3RvcHBlZCA9IHRydWU7XG5cdFx0XHRcdFx0dGhyZWFkLmNsZWFyQ2FsbFN0YWNrKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdGhyZWFkID0gdHlwZW9mIHN0b3BwZWREZXRhaWxzLnRocmVhZElkID09PSAnbnVtYmVyJyA/IHRoaXMudGhyZWFkcy5nZXQoc3RvcHBlZERldGFpbHMudGhyZWFkSWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodGhyZWFkKSB7XG5cdFx0XHRcdFx0Ly8gT25lIHRocmVhZCBpcyBzdG9wcGVkLCBvbmx5IHVwZGF0ZSB0aGF0IHRocmVhZC5cblx0XHRcdFx0XHR0aHJlYWQuc3RvcHBlZERldGFpbHMgPSBzdG9wcGVkRGV0YWlscztcblx0XHRcdFx0XHR0aHJlYWQuY2xlYXJDYWxsU3RhY2soKTtcblx0XHRcdFx0XHR0aHJlYWQuc3RvcHBlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHdhaXRGb3JUcmlnZ2VyZWRCcmVha3BvaW50cygpIHtcblx0XHRpZiAoIXRoaXMuX3dhaXRUb1Jlc3VtZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiByYWNlVGltZW91dChcblx0XHRcdHRoaXMuX3dhaXRUb1Jlc3VtZSxcblx0XHRcdFRSSUdHRVJFRF9CUkVBS1BPSU5UX01BWF9ERUxBWVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGZldGNoVGhyZWFkcyhzdG9wcGVkRGV0YWlscz86IElSYXdTdG9wcGVkRGV0YWlscyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnJhdykge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnJhdy50aHJlYWRzKCk7XG5cdFx0XHRpZiAocmVzcG9uc2U/LmJvZHkgJiYgcmVzcG9uc2UuYm9keS50aHJlYWRzKSB7XG5cdFx0XHRcdHRoaXMubW9kZWwucmF3VXBkYXRlKHtcblx0XHRcdFx0XHRzZXNzaW9uSWQ6IHRoaXMuZ2V0SWQoKSxcblx0XHRcdFx0XHR0aHJlYWRzOiByZXNwb25zZS5ib2R5LnRocmVhZHMsXG5cdFx0XHRcdFx0c3RvcHBlZERldGFpbHNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aW5pdGlhbGl6ZUZvclRlc3QocmF3OiBSYXdEZWJ1Z1Nlc3Npb24pOiB2b2lkIHtcblx0XHR0aGlzLnJhdyA9IHJhdztcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHQvLy0tLS0gcHJpdmF0ZVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnJhdykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmF3TGlzdGVuZXJzLmFkZCh0aGlzLnJhdy5vbkRpZEluaXRpYWxpemUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXJpYS5zdGF0dXMoXG5cdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvbi5ub0RlYnVnXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZGVidWdnaW5nU3RhcnRlZE5vRGVidWcnLCBcIlN0YXJ0ZWQgcnVubmluZyB3aXRob3V0IGRlYnVnZ2luZy5cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdkZWJ1Z2dpbmdTdGFydGVkJywgXCJEZWJ1Z2dpbmcgc3RhcnRlZC5cIilcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHNlbmRDb25maWd1cmF0aW9uRG9uZSA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMucmF3ICYmIHRoaXMucmF3LmNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbmZpZ3VyYXRpb25Eb25lUmVxdWVzdCkge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnJhdy5jb25maWd1cmF0aW9uRG9uZSgpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdC8vIERpc2Nvbm5lY3QgdGhlIGRlYnVnIHNlc3Npb24gb24gY29uZmlndXJhdGlvbiBkb25lIGVycm9yICMxMDU5NlxuXHRcdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0XHRcdFx0dGhpcy5yYXc/LmRpc2Nvbm5lY3Qoe30pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBTZW5kIGFsbCBicmVha3BvaW50c1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kZWJ1Z1NlcnZpY2Uuc2VuZEFsbEJyZWFrcG9pbnRzKHRoaXMpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgc2VuZENvbmZpZ3VyYXRpb25Eb25lKCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmV0Y2hUaHJlYWRzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cblx0XHRjb25zdCBzdGF0dXNRdWV1ZSA9IHRoaXMuc3RhdHVzUXVldWU7XG5cdFx0dGhpcy5yYXdMaXN0ZW5lcnMuYWRkKHRoaXMucmF3Lm9uRGlkU3RvcChldmVudCA9PiB0aGlzLmhhbmRsZVN0b3AoZXZlbnQuYm9keSkpKTtcblxuXHRcdHRoaXMucmF3TGlzdGVuZXJzLmFkZCh0aGlzLnJhdy5vbkRpZFRocmVhZChldmVudCA9PiB7XG5cdFx0XHRzdGF0dXNRdWV1ZS5jYW5jZWwoW2V2ZW50LmJvZHkudGhyZWFkSWRdKTtcblx0XHRcdGlmIChldmVudC5ib2R5LnJlYXNvbiA9PT0gJ3N0YXJ0ZWQnKSB7XG5cdFx0XHRcdGlmICghdGhpcy5mZXRjaFRocmVhZHNTY2hlZHVsZXIudmFsdWUuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuZmV0Y2hUaHJlYWRzU2NoZWR1bGVyLnZhbHVlLnNjaGVkdWxlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuYm9keS5yZWFzb24gPT09ICdleGl0ZWQnKSB7XG5cdFx0XHRcdHRoaXMubW9kZWwuY2xlYXJUaHJlYWRzKHRoaXMuZ2V0SWQoKSwgdHJ1ZSwgZXZlbnQuYm9keS50aHJlYWRJZCk7XG5cdFx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpO1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkVGhyZWFkID0gdmlld01vZGVsLmZvY3VzZWRUaHJlYWQ7XG5cdFx0XHRcdHRoaXMucGFzc0ZvY3VzU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0XHRpZiAoZm9jdXNlZFRocmVhZCAmJiBldmVudC5ib2R5LnRocmVhZElkID09PSBmb2N1c2VkVGhyZWFkLnRocmVhZElkKSB7XG5cdFx0XHRcdFx0Ly8gRGUtZm9jdXMgdGhlIHRocmVhZCBpbiBjYXNlIGl0IHdhcyBmb2N1c2VkXG5cdFx0XHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZm9jdXNTdGFja0ZyYW1lKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB2aWV3TW9kZWwuZm9jdXNlZFNlc3Npb24sIHsgZXhwbGljaXQ6IGZhbHNlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5yYXdMaXN0ZW5lcnMuYWRkKHRoaXMucmF3Lm9uRGlkVGVybWluYXRlRGVidWdlZShhc3luYyBldmVudCA9PiB7XG5cdFx0XHRhcmlhLnN0YXR1cyhsb2NhbGl6ZSgnZGVidWdnaW5nU3RvcHBlZCcsIFwiRGVidWdnaW5nIHN0b3BwZWQuXCIpKTtcblx0XHRcdGlmIChldmVudC5ib2R5ICYmIGV2ZW50LmJvZHkucmVzdGFydCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRlYnVnU2VydmljZS5yZXN0YXJ0U2Vzc2lvbih0aGlzLCBldmVudC5ib2R5LnJlc3RhcnQpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnJhdykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnJhdy5kaXNjb25uZWN0KHsgdGVybWluYXRlRGVidWdnZWU6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMucmF3TGlzdGVuZXJzLmFkZCh0aGlzLnJhdy5vbkRpZENvbnRpbnVlZChhc3luYyBldmVudCA9PiB7XG5cdFx0XHRjb25zdCBhbGxUaHJlYWRzID0gZXZlbnQuYm9keS5hbGxUaHJlYWRzQ29udGludWVkICE9PSBmYWxzZTtcblxuXHRcdFx0bGV0IGFmZmVjdGVkVGhyZWFkczogbnVtYmVyW10gfCBQcm9taXNlPG51bWJlcltdPjtcblx0XHRcdGlmICghYWxsVGhyZWFkcykge1xuXHRcdFx0XHRhZmZlY3RlZFRocmVhZHMgPSBbZXZlbnQuYm9keS50aHJlYWRJZF07XG5cdFx0XHRcdGlmICh0aGlzLnRocmVhZElkcy5pbmNsdWRlcyhldmVudC5ib2R5LnRocmVhZElkKSkge1xuXHRcdFx0XHRcdGFmZmVjdGVkVGhyZWFkcyA9IFtldmVudC5ib2R5LnRocmVhZElkXTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmZldGNoVGhyZWFkc1NjaGVkdWxlci5yYXdWYWx1ZT8uY2FuY2VsKCk7XG5cdFx0XHRcdFx0YWZmZWN0ZWRUaHJlYWRzID0gdGhpcy5mZXRjaFRocmVhZHMoKS50aGVuKCgpID0+IFtldmVudC5ib2R5LnRocmVhZElkXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodGhpcy5mZXRjaFRocmVhZHNTY2hlZHVsZXIudmFsdWUuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHR0aGlzLmZldGNoVGhyZWFkc1NjaGVkdWxlci52YWx1ZS5jYW5jZWwoKTtcblx0XHRcdFx0YWZmZWN0ZWRUaHJlYWRzID0gdGhpcy5mZXRjaFRocmVhZHMoKS50aGVuKCgpID0+IHRoaXMudGhyZWFkSWRzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFmZmVjdGVkVGhyZWFkcyA9IHRoaXMudGhyZWFkSWRzO1xuXHRcdFx0fVxuXG5cdFx0XHRzdGF0dXNRdWV1ZS5jYW5jZWwoYWxsVGhyZWFkcyA/IHVuZGVmaW5lZCA6IFtldmVudC5ib2R5LnRocmVhZElkXSk7XG5cdFx0XHRhd2FpdCBzdGF0dXNRdWV1ZS5ydW4oYWZmZWN0ZWRUaHJlYWRzLCB0aHJlYWRJZCA9PiB7XG5cdFx0XHRcdHRoaXMuc3RvcHBlZERldGFpbHMgPSB0aGlzLnN0b3BwZWREZXRhaWxzLmZpbHRlcihzZCA9PiBzZC50aHJlYWRJZCAhPT0gdGhyZWFkSWQpO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSB0aGlzLmNhbmNlbGxhdGlvbk1hcC5nZXQodGhyZWFkSWQpO1xuXHRcdFx0XHR0aGlzLmNhbmNlbGxhdGlvbk1hcC5kZWxldGUodGhyZWFkSWQpO1xuXHRcdFx0XHR0b2tlbnM/LmZvckVhY2godCA9PiB0LmRpc3Bvc2UodHJ1ZSkpO1xuXHRcdFx0XHR0aGlzLm1vZGVsLmNsZWFyVGhyZWFkcyh0aGlzLmdldElkKCksIGZhbHNlLCB0aHJlYWRJZCk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBXZSBuZWVkIHRvIHBhc3MgZm9jdXMgdG8gb3RoZXIgc2Vzc2lvbnMgLyB0aHJlYWRzIHdpdGggYSB0aW1lb3V0IGluIGNhc2UgYSBxdWljayBzdG9wIGV2ZW50IG9jY3VycyAjMTMwMzIxXG5cdFx0XHR0aGlzLmxhc3RDb250aW51ZWRUaHJlYWRJZCA9IGFsbFRocmVhZHMgPyB1bmRlZmluZWQgOiBldmVudC5ib2R5LnRocmVhZElkO1xuXHRcdFx0dGhpcy5wYXNzRm9jdXNTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG91dHB1dFF1ZXVlID0gbmV3IFF1ZXVlPHZvaWQ+KCk7XG5cdFx0dGhpcy5yYXdMaXN0ZW5lcnMuYWRkKHRoaXMucmF3Lm9uRGlkT3V0cHV0KGFzeW5jIGV2ZW50ID0+IHtcblx0XHRcdGNvbnN0IG91dHB1dFNldmVyaXR5ID0gZXZlbnQuYm9keS5jYXRlZ29yeSA9PT0gJ3N0ZGVycicgPyBTZXZlcml0eS5FcnJvciA6IGV2ZW50LmJvZHkuY2F0ZWdvcnkgPT09ICdjb25zb2xlJyA/IFNldmVyaXR5Lldhcm5pbmcgOiBTZXZlcml0eS5JbmZvO1xuXG5cdFx0XHQvLyBXaGVuIGEgdmFyaWFibGVzIGV2ZW50IGlzIHJlY2VpdmVkLCBleGVjdXRlIGltbWVkaWF0ZWx5IHRvIG9idGFpbiB0aGUgdmFyaWFibGVzIHZhbHVlICMxMjY5Njdcblx0XHRcdGlmIChldmVudC5ib2R5LnZhcmlhYmxlc1JlZmVyZW5jZSkge1xuXHRcdFx0XHRjb25zdCBzb3VyY2UgPSBldmVudC5ib2R5LnNvdXJjZSAmJiBldmVudC5ib2R5LmxpbmUgPyB7XG5cdFx0XHRcdFx0bGluZU51bWJlcjogZXZlbnQuYm9keS5saW5lLFxuXHRcdFx0XHRcdGNvbHVtbjogZXZlbnQuYm9keS5jb2x1bW4gPyBldmVudC5ib2R5LmNvbHVtbiA6IDEsXG5cdFx0XHRcdFx0c291cmNlOiB0aGlzLmdldFNvdXJjZShldmVudC5ib2R5LnNvdXJjZSlcblx0XHRcdFx0fSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gbmV3IEV4cHJlc3Npb25Db250YWluZXIodGhpcywgdW5kZWZpbmVkLCBldmVudC5ib2R5LnZhcmlhYmxlc1JlZmVyZW5jZSwgZ2VuZXJhdGVVdWlkKCkpO1xuXHRcdFx0XHRjb25zdCBjaGlsZHJlbiA9IGNvbnRhaW5lci5nZXRDaGlsZHJlbigpO1xuXHRcdFx0XHQvLyB3ZSBzaG91bGQgcHV0IGFwcGVuZFRvUmVwbCBpbnRvIHF1ZXVlIHRvIG1ha2Ugc3VyZSB0aGUgbG9ncyB0byBiZSBkaXNwbGF5ZWQgaW4gY29ycmVjdCBvcmRlclxuXHRcdFx0XHQvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyNjk2NyNpc3N1ZWNvbW1lbnQtODc0OTU0MjY5XG5cdFx0XHRcdG91dHB1dFF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IGNoaWxkcmVuO1xuXHRcdFx0XHRcdC8vIEZvciBzaW5nbGUgbG9nZ2VkIHZhcmlhYmxlcywgdHJ5IHRvIHVzZSB0aGUgb3V0cHV0IGlmIHdlIGNhbiBzb1xuXHRcdFx0XHRcdC8vIHByZXNlbnQgYSBiZXR0ZXIgKGkuZS4gQU5TSS1hd2FyZSkgcmVwcmVzZW50YXRpb24gb2YgdGhlIG91dHB1dFxuXHRcdFx0XHRcdGlmIChyZXNvbHZlZC5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdHRoaXMuYXBwZW5kVG9SZXBsKHsgb3V0cHV0OiBldmVudC5ib2R5Lm91dHB1dCwgZXhwcmVzc2lvbjogcmVzb2x2ZWRbMF0sIHNldjogb3V0cHV0U2V2ZXJpdHksIHNvdXJjZSB9LCBldmVudC5ib2R5LmNhdGVnb3J5ID09PSAnaW1wb3J0YW50Jyk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmVzb2x2ZWQuZm9yRWFjaCgoY2hpbGQpID0+IHtcblx0XHRcdFx0XHRcdC8vIFNpbmNlIHdlIGNhbiBub3QgZGlzcGxheSBtdWx0aXBsZSB0cmVlcyBpbiBhIHJvdywgd2UgYXJlIGRpc3BsYXlpbmcgdGhlc2UgdmFyaWFibGVzIG9uZSBhZnRlciB0aGUgb3RoZXIgKGlnbm9yaW5nIHRoZWlyIG5hbWVzKVxuXHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdFx0XHQoPGFueT5jaGlsZCkubmFtZSA9IG51bGw7XG5cdFx0XHRcdFx0XHR0aGlzLmFwcGVuZFRvUmVwbCh7IG91dHB1dDogJycsIGV4cHJlc3Npb246IGNoaWxkLCBzZXY6IG91dHB1dFNldmVyaXR5LCBzb3VyY2UgfSwgZXZlbnQuYm9keS5jYXRlZ29yeSA9PT0gJ2ltcG9ydGFudCcpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0b3V0cHV0UXVldWUucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWV2ZW50LmJvZHkgfHwgIXRoaXMucmF3KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGV2ZW50LmJvZHkuY2F0ZWdvcnkgPT09ICd0ZWxlbWV0cnknKSB7XG5cdFx0XHRcdFx0Ly8gb25seSBsb2cgdGVsZW1ldHJ5IGV2ZW50cyBmcm9tIGRlYnVnIGFkYXB0ZXIgaWYgdGhlIGRlYnVnIGV4dGVuc2lvbiBwcm92aWRlZCB0aGUgdGVsZW1ldHJ5IGtleVxuXHRcdFx0XHRcdC8vIGFuZCB0aGUgdXNlciBvcHRlZCBpbiB0ZWxlbWV0cnlcblx0XHRcdFx0XHRjb25zdCB0ZWxlbWV0cnlFbmRwb2ludCA9IHRoaXMucmF3LmRiZ3IuZ2V0Q3VzdG9tVGVsZW1ldHJ5RW5kcG9pbnQoKTtcblx0XHRcdFx0XHRpZiAodGVsZW1ldHJ5RW5kcG9pbnQgJiYgdGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnRlbGVtZXRyeUxldmVsICE9PSBUZWxlbWV0cnlMZXZlbC5OT05FKSB7XG5cdFx0XHRcdFx0XHQvLyBfX0dEUFJfX1RPRE9fXyBXZSdyZSBzZW5kaW5nIGV2ZW50cyBpbiB0aGUgbmFtZSBvZiB0aGUgZGVidWcgZXh0ZW5zaW9uIGFuZCB3ZSBjYW4gbm90IGVuc3VyZSB0aGF0IHRob3NlIGFyZSBkZWNsYXJlZCBjb3JyZWN0bHkuXG5cdFx0XHRcdFx0XHRsZXQgZGF0YSA9IGV2ZW50LmJvZHkuZGF0YTtcblx0XHRcdFx0XHRcdGlmICghdGVsZW1ldHJ5RW5kcG9pbnQuc2VuZEVycm9yVGVsZW1ldHJ5ICYmIGV2ZW50LmJvZHkuZGF0YSkge1xuXHRcdFx0XHRcdFx0XHRkYXRhID0gZmlsdGVyRXhjZXB0aW9uc0Zyb21UZWxlbWV0cnkoZXZlbnQuYm9keS5kYXRhKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dGhpcy5jdXN0b21FbmRwb2ludFRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nKHRlbGVtZXRyeUVuZHBvaW50LCBldmVudC5ib2R5Lm91dHB1dCwgZGF0YSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRvIGFwcGVuZCBvdXRwdXQgaW4gdGhlIGNvcnJlY3Qgb3JkZXIgYnkgcHJvcGVybHkgd2FpdGluZyBvbiBwcmVpdm91cyBwcm9taXNlcyAjMzM4MjJcblx0XHRcdFx0Y29uc3Qgc291cmNlID0gZXZlbnQuYm9keS5zb3VyY2UgJiYgZXZlbnQuYm9keS5saW5lID8ge1xuXHRcdFx0XHRcdGxpbmVOdW1iZXI6IGV2ZW50LmJvZHkubGluZSxcblx0XHRcdFx0XHRjb2x1bW46IGV2ZW50LmJvZHkuY29sdW1uID8gZXZlbnQuYm9keS5jb2x1bW4gOiAxLFxuXHRcdFx0XHRcdHNvdXJjZTogdGhpcy5nZXRTb3VyY2UoZXZlbnQuYm9keS5zb3VyY2UpXG5cdFx0XHRcdH0gOiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0aWYgKGV2ZW50LmJvZHkuZ3JvdXAgPT09ICdzdGFydCcgfHwgZXZlbnQuYm9keS5ncm91cCA9PT0gJ3N0YXJ0Q29sbGFwc2VkJykge1xuXHRcdFx0XHRcdGNvbnN0IGV4cGFuZGVkID0gZXZlbnQuYm9keS5ncm91cCA9PT0gJ3N0YXJ0Jztcblx0XHRcdFx0XHR0aGlzLnJlcGwuc3RhcnRHcm91cCh0aGlzLCBldmVudC5ib2R5Lm91dHB1dCB8fCAnJywgZXhwYW5kZWQsIHNvdXJjZSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChldmVudC5ib2R5Lmdyb3VwID09PSAnZW5kJykge1xuXHRcdFx0XHRcdHRoaXMucmVwbC5lbmRHcm91cCgpO1xuXHRcdFx0XHRcdGlmICghZXZlbnQuYm9keS5vdXRwdXQpIHtcblx0XHRcdFx0XHRcdC8vIE9ubHkgcmV0dXJuIGlmIHRoZSBlbmQgZXZlbnQgZG9lcyBub3QgaGF2ZSBhZGRpdGlvbmFsIG91dHB1dCBpbiBpdFxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0eXBlb2YgZXZlbnQuYm9keS5vdXRwdXQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0dGhpcy5hcHBlbmRUb1JlcGwoeyBvdXRwdXQ6IGV2ZW50LmJvZHkub3V0cHV0LCBzZXY6IG91dHB1dFNldmVyaXR5LCBzb3VyY2UgfSwgZXZlbnQuYm9keS5jYXRlZ29yeSA9PT0gJ2ltcG9ydGFudCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnJhd0xpc3RlbmVycy5hZGQodGhpcy5yYXcub25EaWRCcmVha3BvaW50KGV2ZW50ID0+IHtcblx0XHRcdGNvbnN0IGlkID0gZXZlbnQuYm9keSAmJiBldmVudC5ib2R5LmJyZWFrcG9pbnQgPyBldmVudC5ib2R5LmJyZWFrcG9pbnQuaWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBicmVha3BvaW50ID0gdGhpcy5tb2RlbC5nZXRCcmVha3BvaW50cygpLmZpbmQoYnAgPT4gYnAuZ2V0SWRGcm9tQWRhcHRlcih0aGlzLmdldElkKCkpID09PSBpZCk7XG5cdFx0XHRjb25zdCBmdW5jdGlvbkJyZWFrcG9pbnQgPSB0aGlzLm1vZGVsLmdldEZ1bmN0aW9uQnJlYWtwb2ludHMoKS5maW5kKGJwID0+IGJwLmdldElkRnJvbUFkYXB0ZXIodGhpcy5nZXRJZCgpKSA9PT0gaWQpO1xuXHRcdFx0Y29uc3QgZGF0YUJyZWFrcG9pbnQgPSB0aGlzLm1vZGVsLmdldERhdGFCcmVha3BvaW50cygpLmZpbmQoZGJwID0+IGRicC5nZXRJZEZyb21BZGFwdGVyKHRoaXMuZ2V0SWQoKSkgPT09IGlkKTtcblx0XHRcdGNvbnN0IGV4Y2VwdGlvbkJyZWFrcG9pbnQgPSB0aGlzLm1vZGVsLmdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzKCkuZmluZChleGNicCA9PiBleGNicC5nZXRJZEZyb21BZGFwdGVyKHRoaXMuZ2V0SWQoKSkgPT09IGlkKTtcblxuXHRcdFx0aWYgKGV2ZW50LmJvZHkucmVhc29uID09PSAnbmV3JyAmJiBldmVudC5ib2R5LmJyZWFrcG9pbnQuc291cmNlICYmIGV2ZW50LmJvZHkuYnJlYWtwb2ludC5saW5lKSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZSA9IHRoaXMuZ2V0U291cmNlKGV2ZW50LmJvZHkuYnJlYWtwb2ludC5zb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBicHMgPSB0aGlzLm1vZGVsLmFkZEJyZWFrcG9pbnRzKHNvdXJjZS51cmksIFt7XG5cdFx0XHRcdFx0Y29sdW1uOiBldmVudC5ib2R5LmJyZWFrcG9pbnQuY29sdW1uLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0bGluZU51bWJlcjogZXZlbnQuYm9keS5icmVha3BvaW50LmxpbmUsXG5cdFx0XHRcdH1dLCBmYWxzZSk7XG5cdFx0XHRcdGlmIChicHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGF0YSA9IG5ldyBNYXA8c3RyaW5nLCBEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnQ+KFtbYnBzWzBdLmdldElkKCksIGV2ZW50LmJvZHkuYnJlYWtwb2ludF1dKTtcblx0XHRcdFx0XHR0aGlzLm1vZGVsLnNldEJyZWFrcG9pbnRTZXNzaW9uRGF0YSh0aGlzLmdldElkKCksIHRoaXMuY2FwYWJpbGl0aWVzLCBkYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXZlbnQuYm9keS5yZWFzb24gPT09ICdyZW1vdmVkJykge1xuXHRcdFx0XHRpZiAoYnJlYWtwb2ludCkge1xuXHRcdFx0XHRcdHRoaXMubW9kZWwucmVtb3ZlQnJlYWtwb2ludHMoW2JyZWFrcG9pbnRdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZnVuY3Rpb25CcmVha3BvaW50KSB7XG5cdFx0XHRcdFx0dGhpcy5tb2RlbC5yZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKGZ1bmN0aW9uQnJlYWtwb2ludC5nZXRJZCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZGF0YUJyZWFrcG9pbnQpIHtcblx0XHRcdFx0XHR0aGlzLm1vZGVsLnJlbW92ZURhdGFCcmVha3BvaW50cyhkYXRhQnJlYWtwb2ludC5nZXRJZCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXZlbnQuYm9keS5yZWFzb24gPT09ICdjaGFuZ2VkJykge1xuXHRcdFx0XHRpZiAoYnJlYWtwb2ludCkge1xuXHRcdFx0XHRcdGlmICghYnJlYWtwb2ludC5jb2x1bW4pIHtcblx0XHRcdFx0XHRcdGV2ZW50LmJvZHkuYnJlYWtwb2ludC5jb2x1bW4gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSBuZXcgTWFwPHN0cmluZywgRGVidWdQcm90b2NvbC5CcmVha3BvaW50PihbW2JyZWFrcG9pbnQuZ2V0SWQoKSwgZXZlbnQuYm9keS5icmVha3BvaW50XV0pO1xuXHRcdFx0XHRcdHRoaXMubW9kZWwuc2V0QnJlYWtwb2ludFNlc3Npb25EYXRhKHRoaXMuZ2V0SWQoKSwgdGhpcy5jYXBhYmlsaXRpZXMsIGRhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmdW5jdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdFx0XHRjb25zdCBkYXRhID0gbmV3IE1hcDxzdHJpbmcsIERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludD4oW1tmdW5jdGlvbkJyZWFrcG9pbnQuZ2V0SWQoKSwgZXZlbnQuYm9keS5icmVha3BvaW50XV0pO1xuXHRcdFx0XHRcdHRoaXMubW9kZWwuc2V0QnJlYWtwb2ludFNlc3Npb25EYXRhKHRoaXMuZ2V0SWQoKSwgdGhpcy5jYXBhYmlsaXRpZXMsIGRhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChkYXRhQnJlYWtwb2ludCkge1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSBuZXcgTWFwPHN0cmluZywgRGVidWdQcm90b2NvbC5CcmVha3BvaW50PihbW2RhdGFCcmVha3BvaW50LmdldElkKCksIGV2ZW50LmJvZHkuYnJlYWtwb2ludF1dKTtcblx0XHRcdFx0XHR0aGlzLm1vZGVsLnNldEJyZWFrcG9pbnRTZXNzaW9uRGF0YSh0aGlzLmdldElkKCksIHRoaXMuY2FwYWJpbGl0aWVzLCBkYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXhjZXB0aW9uQnJlYWtwb2ludCkge1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSBuZXcgTWFwPHN0cmluZywgRGVidWdQcm90b2NvbC5CcmVha3BvaW50PihbW2V4Y2VwdGlvbkJyZWFrcG9pbnQuZ2V0SWQoKSwgZXZlbnQuYm9keS5icmVha3BvaW50XV0pO1xuXHRcdFx0XHRcdHRoaXMubW9kZWwuc2V0QnJlYWtwb2ludFNlc3Npb25EYXRhKHRoaXMuZ2V0SWQoKSwgdGhpcy5jYXBhYmlsaXRpZXMsIGRhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5yYXdMaXN0ZW5lcnMuYWRkKHRoaXMucmF3Lm9uRGlkTG9hZGVkU291cmNlKGV2ZW50ID0+IHtcblx0XHRcdHRoaXMuX29uRGlkTG9hZGVkU291cmNlLmZpcmUoe1xuXHRcdFx0XHRyZWFzb246IGV2ZW50LmJvZHkucmVhc29uLFxuXHRcdFx0XHRzb3VyY2U6IHRoaXMuZ2V0U291cmNlKGV2ZW50LmJvZHkuc291cmNlKVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5yYXdMaXN0ZW5lcnMuYWRkKHRoaXMucmF3Lm9uRGlkQ3VzdG9tRXZlbnQoZXZlbnQgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDdXN0b21FdmVudC5maXJlKGV2ZW50KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnJhd0xpc3RlbmVycy5hZGQodGhpcy5yYXcub25EaWRQcm9ncmVzc1N0YXJ0KGV2ZW50ID0+IHtcblx0XHRcdHRoaXMuX29uRGlkUHJvZ3Jlc3NTdGFydC5maXJlKGV2ZW50KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5yYXdMaXN0ZW5lcnMuYWRkKHRoaXMucmF3Lm9uRGlkUHJvZ3Jlc3NVcGRhdGUoZXZlbnQgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRQcm9ncmVzc1VwZGF0ZS5maXJlKGV2ZW50KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5yYXdMaXN0ZW5lcnMuYWRkKHRoaXMucmF3Lm9uRGlkUHJvZ3Jlc3NFbmQoZXZlbnQgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRQcm9ncmVzc0VuZC5maXJlKGV2ZW50KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5yYXdMaXN0ZW5lcnMuYWRkKHRoaXMucmF3Lm9uRGlkSW52YWxpZGF0ZU1lbW9yeShldmVudCA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZEludmFsaWRNZW1vcnkuZmlyZShldmVudCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMucmF3TGlzdGVuZXJzLmFkZCh0aGlzLnJhdy5vbkRpZEludmFsaWRhdGVkKGFzeW5jIGV2ZW50ID0+IHtcblx0XHRcdGNvbnN0IGFyZWFzID0gZXZlbnQuYm9keS5hcmVhcyB8fCBbJ2FsbCddO1xuXHRcdFx0Ly8gSWYgaW52YWxpZGF0ZWQgZXZlbnQgb25seSByZXF1aXJlcyB0byB1cGRhdGUgdmFyaWFibGVzIG9yIHdhdGNoLCBkbyB0aGF0LCBvdGhlcndpc2UgcmVmZXRjaCB0aHJlYWRzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDY3NDVcblx0XHRcdGlmIChhcmVhcy5pbmNsdWRlcygndGhyZWFkcycpIHx8IGFyZWFzLmluY2x1ZGVzKCdzdGFja3MnKSB8fCBhcmVhcy5pbmNsdWRlcygnYWxsJykpIHtcblx0XHRcdFx0dGhpcy5jYW5jZWxBbGxSZXF1ZXN0cygpO1xuXHRcdFx0XHR0aGlzLm1vZGVsLmNsZWFyVGhyZWFkcyh0aGlzLmdldElkKCksIHRydWUpO1xuXG5cdFx0XHRcdGNvbnN0IGRldGFpbHMgPSB0aGlzLnN0b3BwZWREZXRhaWxzLnNsaWNlKCk7XG5cdFx0XHRcdHRoaXMuc3RvcHBlZERldGFpbHMubGVuZ3RoID0gMDtcblx0XHRcdFx0aWYgKGRldGFpbHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZGV0YWlscy5tYXAoZCA9PiB0aGlzLmhhbmRsZVN0b3AoZCkpKTtcblx0XHRcdFx0fSBlbHNlIGlmICghdGhpcy5mZXRjaFRocmVhZHNTY2hlZHVsZXIudmFsdWUuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHRcdC8vIHRocmVhZHMgYXJlIGZldGNoZWQgYXMgYSBzaWRlLWVmZmVjdCBvZiBwcm9jZXNzaW5nIHRoZSBzdG9wcGVkXG5cdFx0XHRcdFx0Ly8gZXZlbnQocyksIGJ1dCBpZiB0aGVyZSBhcmUgbm9uZSwgc2NoZWR1bGUgYSB0aHJlYWQgdXBkYXRlIG1hbnVhbGx5ICgjMjgyNzc3KVxuXHRcdFx0XHRcdHRoaXMuZmV0Y2hUaHJlYWRzU2NoZWR1bGVyLnZhbHVlLnNjaGVkdWxlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCk7XG5cdFx0XHRpZiAodmlld01vZGVsLmZvY3VzZWRTZXNzaW9uID09PSB0aGlzKSB7XG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVWaWV3cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMucmF3TGlzdGVuZXJzLmFkZCh0aGlzLnJhdy5vbkRpZEV4aXRBZGFwdGVyKGV2ZW50ID0+IHRoaXMub25EaWRFeGl0QWRhcHRlcihldmVudCkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlU3RvcChldmVudDogSVJhd1N0b3BwZWREZXRhaWxzKSB7XG5cdFx0dGhpcy5wYXNzRm9jdXNTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy5zdG9wcGVkRGV0YWlscy5wdXNoKGV2ZW50KTtcblxuXHRcdC8vIGRvIHRoaXMgdmVyeSBlYWdlcmx5IGlmIHdlIGhhdmUgaGl0QnJlYWtwb2ludElkcywgc2luY2UgaXQgbWF5IHRha2UgYVxuXHRcdC8vIG1vbWVudCBmb3IgYnJlYWtwb2ludHMgdG8gc2V0IGFuZCB3ZSB3YW50IHRvIGRvIG91ciBiZXN0IHRvIG5vdCBtaXNzXG5cdFx0Ly8gYW55dGhpbmdcblx0XHRpZiAoZXZlbnQuaGl0QnJlYWtwb2ludElkcykge1xuXHRcdFx0dGhpcy5fd2FpdFRvUmVzdW1lID0gdGhpcy5lbmFibGVEZXBlbmRlbnRCcmVha3BvaW50cyhldmVudC5oaXRCcmVha3BvaW50SWRzKTtcblx0XHR9XG5cblx0XHR0aGlzLnN0YXR1c1F1ZXVlLnJ1bihcblx0XHRcdHRoaXMuZmV0Y2hUaHJlYWRzKGV2ZW50KS50aGVuKCgpID0+IGV2ZW50LnRocmVhZElkID09PSB1bmRlZmluZWQgPyB0aGlzLnRocmVhZElkcyA6IFtldmVudC50aHJlYWRJZF0pLFxuXHRcdFx0YXN5bmMgKHRocmVhZElkLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCBoYXNMb3RzT2ZUaHJlYWRzID0gZXZlbnQudGhyZWFkSWQgPT09IHVuZGVmaW5lZCAmJiB0aGlzLnRocmVhZElkcy5sZW5ndGggPiAxMDtcblxuXHRcdFx0XHQvLyBJZiB0aGUgZm9jdXMgZm9yIHRoZSBjdXJyZW50IHNlc3Npb24gaXMgb24gYSBub24tZXhpc3RlbnQgdGhyZWFkLCBjbGVhciB0aGUgZm9jdXMuXG5cdFx0XHRcdGNvbnN0IGZvY3VzZWRUaHJlYWQgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkVGhyZWFkO1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkVGhyZWFkRG9lc05vdEV4aXN0ID0gZm9jdXNlZFRocmVhZCAhPT0gdW5kZWZpbmVkICYmIGZvY3VzZWRUaHJlYWQuc2Vzc2lvbiA9PT0gdGhpcyAmJiAhdGhpcy50aHJlYWRzLmhhcyhmb2N1c2VkVGhyZWFkLnRocmVhZElkKTtcblx0XHRcdFx0aWYgKGZvY3VzZWRUaHJlYWREb2VzTm90RXhpc3QpIHtcblx0XHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5mb2N1c1N0YWNrRnJhbWUodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdGhyZWFkID0gdHlwZW9mIHRocmVhZElkID09PSAnbnVtYmVyJyA/IHRoaXMuZ2V0VGhyZWFkKHRocmVhZElkKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHRocmVhZCkge1xuXHRcdFx0XHRcdC8vIENhbGwgZmV0Y2ggY2FsbCBzdGFjayB0d2ljZSwgdGhlIGZpcnN0IG9ubHkgcmV0dXJuIHRoZSB0b3Agc3RhY2sgZnJhbWUuXG5cdFx0XHRcdFx0Ly8gU2Vjb25kIHJldHJpZXZlcyB0aGUgcmVzdCBvZiB0aGUgY2FsbCBzdGFjay4gRm9yIHBlcmZvcm1hbmNlIHJlYXNvbnMgIzI1NjA1XG5cdFx0XHRcdFx0Ly8gU2Vjb25kIGNhbGwgaXMgb25seSBkb25lIGlmIHRoZXJlJ3MgZmV3IHRocmVhZHMgdGhhdCBzdG9wcGVkIGluIHRoaXMgZXZlbnQuXG5cdFx0XHRcdFx0Y29uc3QgcHJvbWlzZXMgPSB0aGlzLm1vZGVsLnJlZnJlc2hUb3BPZkNhbGxzdGFjayg8VGhyZWFkPnRocmVhZCwgLyogZmV0Y2hGdWxsU3RhY2s9ICovIWhhc0xvdHNPZlRocmVhZHMpO1xuXHRcdFx0XHRcdGNvbnN0IGZvY3VzID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGZvY3VzZWRUaHJlYWREb2VzTm90RXhpc3QgfHwgKCFldmVudC5wcmVzZXJ2ZUZvY3VzSGludCAmJiB0aHJlYWQuZ2V0Q2FsbFN0YWNrKCkubGVuZ3RoKSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmb2N1c2VkU3RhY2tGcmFtZSA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdFx0XHRcdFx0XHRpZiAoIWZvY3VzZWRTdGFja0ZyYW1lIHx8IGZvY3VzZWRTdGFja0ZyYW1lLnRocmVhZC5zZXNzaW9uID09PSB0aGlzKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gT25seSB0YWtlIGZvY3VzIGlmIG5vdGhpbmcgaXMgZm9jdXNlZCwgb3IgaWYgdGhlIGZvY3VzIGlzIGFscmVhZHkgb24gdGhlIGN1cnJlbnQgc2Vzc2lvblxuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHByZXNlcnZlRm9jdXMgPSAhdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5mb2N1c0VkaXRvck9uQnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5kZWJ1Z1NlcnZpY2UuZm9jdXNTdGFja0ZyYW1lKHVuZGVmaW5lZCwgdGhyZWFkLCB1bmRlZmluZWQsIHsgcHJlc2VydmVGb2N1cyB9KTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGlmICh0aHJlYWQuc3RvcHBlZERldGFpbHMgJiYgIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHRocmVhZC5zdG9wcGVkRGV0YWlscy5yZWFzb24gPT09ICdicmVha3BvaW50JyAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLm9wZW5EZWJ1ZyA9PT0gJ29wZW5PbkRlYnVnQnJlYWsnICYmICF0aGlzLnN1cHByZXNzRGVidWdWaWV3KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLm9wZW5QYW5lQ29tcG9zaXRlKFZJRVdMRVRfSUQsIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5mb2N1c1dpbmRvd09uQnJlYWsgJiYgIXRoaXMud29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGFjdGl2ZVdpbmRvdyA9IGdldEFjdGl2ZVdpbmRvdygpO1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKCFhY3RpdmVXaW5kb3cuZG9jdW1lbnQuaGFzRm9jdXMoKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmhvc3RTZXJ2aWNlLmZvY3VzKG1haW5XaW5kb3csIHsgbW9kZTogRm9jdXNNb2RlLkZvcmNlIC8qIEFwcGxpY2F0aW9uIG1heSBub3QgYmUgYWN0aXZlICovIH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRhd2FpdCBwcm9taXNlcy50b3BDYWxsU3RhY2s7XG5cblx0XHRcdFx0XHRpZiAoIWV2ZW50LmhpdEJyZWFrcG9pbnRJZHMpIHsgLy8gaWYgaGl0QnJlYWtwb2ludElkcyBhcmUgcHJlc2VudCwgdGhpcyBpcyBoYW5kbGVkIGVhcmxpZXIgb25cblx0XHRcdFx0XHRcdHRoaXMuX3dhaXRUb1Jlc3VtZSA9IHRoaXMuZW5hYmxlRGVwZW5kZW50QnJlYWtwb2ludHModGhyZWFkKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRmb2N1cygpO1xuXG5cdFx0XHRcdFx0YXdhaXQgcHJvbWlzZXMud2hvbGVDYWxsU3RhY2s7XG5cdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgZm9jdXNlZFN0YWNrRnJhbWUgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRcdFx0XHRpZiAoIWZvY3VzZWRTdGFja0ZyYW1lIHx8IGlzRnJhbWVEZWVtcGhhc2l6ZWQoZm9jdXNlZFN0YWNrRnJhbWUpKSB7XG5cdFx0XHRcdFx0XHQvLyBUaGUgdG9wIHN0YWNrIGZyYW1lIGNhbiBiZSBkZWVtcGhlc2l6ZWQgc28gdHJ5IHRvIGZvY3VzIGFnYWluICM2ODYxNlxuXHRcdFx0XHRcdFx0Zm9jdXMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5maXJlKCk7XG5cdFx0XHR9LFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGVuYWJsZURlcGVuZGVudEJyZWFrcG9pbnRzKGhpdEJyZWFrcG9pbnRJZHNPclRocmVhZDogVGhyZWFkIHwgbnVtYmVyW10pIHtcblx0XHRsZXQgYnJlYWtwb2ludHM6IElCcmVha3BvaW50W107XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoaGl0QnJlYWtwb2ludElkc09yVGhyZWFkKSkge1xuXHRcdFx0YnJlYWtwb2ludHMgPSB0aGlzLm1vZGVsLmdldEJyZWFrcG9pbnRzKCkuZmlsdGVyKGJwID0+IGhpdEJyZWFrcG9pbnRJZHNPclRocmVhZC5pbmNsdWRlcyhicC5nZXRJZEZyb21BZGFwdGVyKHRoaXMuaWQpISkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBmcmFtZSA9IGhpdEJyZWFrcG9pbnRJZHNPclRocmVhZC5nZXRUb3BTdGFja0ZyYW1lKCk7XG5cdFx0XHRpZiAoZnJhbWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChoaXRCcmVha3BvaW50SWRzT3JUaHJlYWQuc3RvcHBlZERldGFpbHMgJiYgaGl0QnJlYWtwb2ludElkc09yVGhyZWFkLnN0b3BwZWREZXRhaWxzLnJlYXNvbiAhPT0gJ2JyZWFrcG9pbnQnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YnJlYWtwb2ludHMgPSB0aGlzLmdldEJyZWFrcG9pbnRzQXRQb3NpdGlvbihmcmFtZS5zb3VyY2UudXJpLCBmcmFtZS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGZyYW1lLnJhbmdlLmVuZExpbmVOdW1iZXIsIGZyYW1lLnJhbmdlLnN0YXJ0Q29sdW1uLCBmcmFtZS5yYW5nZS5lbmRDb2x1bW4pO1xuXHRcdH1cblxuXHRcdC8vIGZpbmQgdGhlIGN1cnJlbnQgYnJlYWtwb2ludHNcblxuXHRcdC8vIGNoZWNrIGlmIHRoZSBjdXJyZW50IGJyZWFrcG9pbnRzIGFyZSBkZXBlbmRlbmNpZXMsIGFuZCBpZiBzbyBjb2xsZWN0IGFuZCBzZW5kIHRoZSBkZXBlbmRlbnRzIHRvIERBXG5cdFx0Y29uc3QgdXJpc1RvUmVzZW5kID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dGhpcy5tb2RlbC5nZXRCcmVha3BvaW50cyh7IHRyaWdnZXJlZE9ubHk6IHRydWUsIGVuYWJsZWRPbmx5OiB0cnVlIH0pLmZvckVhY2goYnAgPT4ge1xuXHRcdFx0YnJlYWtwb2ludHMuZm9yRWFjaChjYnAgPT4ge1xuXHRcdFx0XHRpZiAoYnAuZW5hYmxlZCAmJiBicC50cmlnZ2VyZWRCeSA9PT0gY2JwLmdldElkKCkpIHtcblx0XHRcdFx0XHRicC5zZXRTZXNzaW9uRGlkVHJpZ2dlcih0aGlzLmdldElkKCkpO1xuXHRcdFx0XHRcdHVyaXNUb1Jlc2VuZC5hZGQoYnAudXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdHM6IFByb21pc2U8YW55PltdID0gW107XG5cdFx0dXJpc1RvUmVzZW5kLmZvckVhY2goKHVyaSkgPT4gcmVzdWx0cy5wdXNoKHRoaXMuZGVidWdTZXJ2aWNlLnNlbmRCcmVha3BvaW50cyhVUkkucGFyc2UodXJpKSwgdW5kZWZpbmVkLCB0aGlzKSkpO1xuXHRcdHJldHVybiBQcm9taXNlLmFsbChyZXN1bHRzKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QnJlYWtwb2ludHNBdFBvc2l0aW9uKHVyaTogVVJJLCBzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlcik6IElCcmVha3BvaW50W10ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldEJyZWFrcG9pbnRzKHsgdXJpOiB1cmkgfSkuZmlsdGVyKGJwID0+IHtcblx0XHRcdGlmIChicC5saW5lTnVtYmVyIDwgc3RhcnRMaW5lTnVtYmVyIHx8IGJwLmxpbmVOdW1iZXIgPiBlbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGJwLmNvbHVtbiAmJiAoYnAuY29sdW1uIDwgc3RhcnRDb2x1bW4gfHwgYnAuY29sdW1uID4gZW5kQ29sdW1uKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRFeGl0QWRhcHRlcihldmVudD86IEFkYXB0ZXJFbmRFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuaW5pdGlhbGl6ZWQgPSB0cnVlO1xuXHRcdHRoaXMubW9kZWwuc2V0QnJlYWtwb2ludFNlc3Npb25EYXRhKHRoaXMuZ2V0SWQoKSwgdGhpcy5jYXBhYmlsaXRpZXMsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5zaHV0ZG93bigpO1xuXHRcdHRoaXMuX29uRGlkRW5kQWRhcHRlci5maXJlKGV2ZW50KTtcblx0fVxuXG5cdC8vIERpc2Nvbm5lY3RzIGFuZCBjbGVhcnMgc3RhdGUuIFNlc3Npb24gY2FuIGJlIGluaXRpYWxpemVkIGFnYWluIGZvciBhIG5ldyBjb25uZWN0aW9uLlxuXHRwcml2YXRlIHNodXRkb3duKCk6IHZvaWQge1xuXHRcdHRoaXMucmF3TGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMucmF3KSB7XG5cdFx0XHQvLyBTZW5kIG91dCBkaXNjb25uZWN0IGFuZCBpbW1lZGlhdGx5IGRpc3Bvc2UgKGRvIG5vdCB3YWl0IGZvciByZXNwb25zZSkgIzEyNzQxOFxuXHRcdFx0dGhpcy5yYXcuZGlzY29ubmVjdCh7fSk7XG5cdFx0XHR0aGlzLnJhdy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnJhdyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5wYXNzRm9jdXNTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy5wYXNzRm9jdXNTY2hlZHVsZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMubW9kZWwuY2xlYXJUaHJlYWRzKHRoaXMuZ2V0SWQoKSwgdHJ1ZSk7XG5cdFx0dGhpcy5zb3VyY2VzLmNsZWFyKCk7XG5cdFx0dGhpcy50aHJlYWRzLmNsZWFyKCk7XG5cdFx0dGhpcy50aHJlYWRJZHMgPSBbXTtcblx0XHR0aGlzLnN0b3BwZWREZXRhaWxzID0gW107XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5maXJlKCk7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpIHtcblx0XHR0aGlzLmNhbmNlbEFsbFJlcXVlc3RzKCk7XG5cdFx0dGhpcy5yYXdMaXN0ZW5lcnMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZ2xvYmFsRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkRW5kQWRhcHRlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRMb2FkZWRTb3VyY2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ3VzdG9tRXZlbnQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkUHJvZ3Jlc3NTdGFydC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRQcm9ncmVzc1VwZGF0ZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRQcm9ncmVzc0VuZC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRJbnZhbGlkTWVtb3J5LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVJFUExFbGVtZW50cy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VOYW1lLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl93YWl0VG9SZXN1bWUgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLy0tLS0gc291cmNlc1xuXG5cdGdldFNvdXJjZUZvclVyaSh1cmk6IFVSSSk6IFNvdXJjZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc291cmNlcy5nZXQodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuYXNDYW5vbmljYWxVcmkodXJpKS50b1N0cmluZygpKTtcblx0fVxuXG5cdGdldFNvdXJjZShyYXc/OiBEZWJ1Z1Byb3RvY29sLlNvdXJjZSk6IFNvdXJjZSB7XG5cdFx0bGV0IHNvdXJjZSA9IG5ldyBTb3VyY2UocmF3LCB0aGlzLmdldElkKCksIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHVyaUtleSA9IHNvdXJjZS51cmkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBmb3VuZCA9IHRoaXMuc291cmNlcy5nZXQodXJpS2V5KTtcblx0XHRpZiAoZm91bmQpIHtcblx0XHRcdHNvdXJjZSA9IGZvdW5kO1xuXHRcdFx0Ly8gbWVyZ2UgYXR0cmlidXRlcyBvZiBuZXcgaW50byBleGlzdGluZ1xuXHRcdFx0c291cmNlLnJhdyA9IG1peGluKHNvdXJjZS5yYXcsIHJhdyk7XG5cdFx0XHRpZiAoc291cmNlLnJhdyAmJiByYXcpIHtcblx0XHRcdFx0Ly8gQWx3YXlzIHRha2UgdGhlIGxhdGVzdCBwcmVzZW50YXRpb24gaGludCBmcm9tIGFkYXB0ZXIgIzQyMTM5XG5cdFx0XHRcdHNvdXJjZS5yYXcucHJlc2VudGF0aW9uSGludCA9IHJhdy5wcmVzZW50YXRpb25IaW50O1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNvdXJjZXMuc2V0KHVyaUtleSwgc291cmNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc291cmNlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSYXdTb3VyY2UodXJpOiBVUkkpOiBEZWJ1Z1Byb3RvY29sLlNvdXJjZSB7XG5cdFx0Y29uc3Qgc291cmNlID0gdGhpcy5nZXRTb3VyY2VGb3JVcmkodXJpKTtcblx0XHRpZiAoc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gc291cmNlLnJhdztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZGF0YSA9IFNvdXJjZS5nZXRFbmNvZGVkRGVidWdEYXRhKHVyaSk7XG5cdFx0XHRyZXR1cm4geyBuYW1lOiBkYXRhLm5hbWUsIHBhdGg6IGRhdGEucGF0aCwgc291cmNlUmVmZXJlbmNlOiBkYXRhLnNvdXJjZVJlZmVyZW5jZSB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0TmV3Q2FuY2VsbGF0aW9uVG9rZW4odGhyZWFkSWQ6IG51bWJlciwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IENhbmNlbGxhdGlvblRva2VuIHtcblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0b2tlbik7XG5cdFx0Y29uc3QgdG9rZW5zID0gdGhpcy5jYW5jZWxsYXRpb25NYXAuZ2V0KHRocmVhZElkKSB8fCBbXTtcblx0XHR0b2tlbnMucHVzaCh0b2tlblNvdXJjZSk7XG5cdFx0dGhpcy5jYW5jZWxsYXRpb25NYXAuc2V0KHRocmVhZElkLCB0b2tlbnMpO1xuXG5cdFx0cmV0dXJuIHRva2VuU291cmNlLnRva2VuO1xuXHR9XG5cblx0cHJpdmF0ZSBjYW5jZWxBbGxSZXF1ZXN0cygpOiB2b2lkIHtcblx0XHR0aGlzLmNhbmNlbGxhdGlvbk1hcC5mb3JFYWNoKHRva2VucyA9PiB0b2tlbnMuZm9yRWFjaCh0ID0+IHQuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdHRoaXMuY2FuY2VsbGF0aW9uTWFwLmNsZWFyKCk7XG5cdH1cblxuXHQvLyBSRVBMXG5cblx0Z2V0UmVwbEVsZW1lbnRzKCk6IElSZXBsRWxlbWVudFtdIHtcblx0XHRyZXR1cm4gdGhpcy5yZXBsLmdldFJlcGxFbGVtZW50cygpO1xuXHR9XG5cblx0aGFzU2VwYXJhdGVSZXBsKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5wYXJlbnRTZXNzaW9uIHx8IHRoaXMuX29wdGlvbnMucmVwbCAhPT0gJ21lcmdlV2l0aFBhcmVudCc7XG5cdH1cblxuXHRyZW1vdmVSZXBsRXhwcmVzc2lvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5yZXBsLnJlbW92ZVJlcGxFeHByZXNzaW9ucygpO1xuXHR9XG5cblx0YXN5bmMgYWRkUmVwbEV4cHJlc3Npb24oc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUgfCB1bmRlZmluZWQsIGV4cHJlc3Npb246IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMucmVwbC5hZGRSZXBsRXhwcmVzc2lvbih0aGlzLCBzdGFja0ZyYW1lLCBleHByZXNzaW9uKTtcblx0XHQvLyBFdmFsdWF0ZSBhbGwgd2F0Y2ggZXhwcmVzc2lvbnMgYW5kIGZldGNoIHZhcmlhYmxlcyBhZ2FpbiBzaW5jZSByZXBsIGV2YWx1YXRpb24gbWlnaHQgaGF2ZSBjaGFuZ2VkIHNvbWUuXG5cdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkudXBkYXRlVmlld3MoKTtcblx0fVxuXG5cdGFwcGVuZFRvUmVwbChkYXRhOiBJTmV3UmVwbEVsZW1lbnREYXRhLCBpc0ltcG9ydGFudD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnJlcGwuYXBwZW5kVG9SZXBsKHRoaXMsIGRhdGEpO1xuXHRcdGlmIChpc0ltcG9ydGFudCkge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7IG1lc3NhZ2U6IGRhdGEub3V0cHV0LnRvU3RyaW5nKCksIHNldmVyaXR5OiBkYXRhLnNldiwgc291cmNlOiB0aGlzLm5hbWUgfSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogS2VlcHMgdHJhY2sgb2YgZXZlbnRzIGZvciB0aHJlYWRzLCBhbmQgY2FuY2VscyBhbnkgcHJldmlvdXMgb3BlcmF0aW9ucyBmb3JcbiAqIGEgdGhyZWFkIHdoZW4gdGhlIHRocmVhZCBnb2VzIGludG8gYSBuZXcgc3RhdGUuIEN1cnJlbnRseSwgdGhlIG9wZXJhdGlvbnMgYSB0aHJlYWQgaGFzIGFyZTpcbiAqXG4gKiAtIHN0YXJ0ZWRcbiAqIC0gc3RvcHBlZFxuICogLSBjb250aW51ZVxuICogLSBleGl0ZWRcbiAqXG4gKiBJbiBlYWNoIGNhc2UsIHRoZSBuZXcgc3RhdGUgcHJlZW1wdHMgdGhlIG9sZCBzdGF0ZSwgc28gd2UgZG9uJ3QgbmVlZCB0b1xuICogcXVldWUgd29yaywganVzdCBjYW5jZWwgb2xkIHdvcmsuIEl0J3MgdXAgdG8gdGhlIGNhbGxlciB0byBtYWtlIHN1cmUgdGhhdFxuICogbm8gVUkgZWZmZWN0cyBoYXBwZW4gYXQgdGhlIHBvaW50IHdoZW4gdGhlIGB0b2tlbmAgaXMgY2FuY2VsbGVkLlxuICovXG5leHBvcnQgY2xhc3MgVGhyZWFkU3RhdHVzU2NoZWR1bGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdC8qKlxuXHQgKiBBbiBhcnJheSBvZiBzZXQgb2YgdGhyZWFkIElEcy4gV2hlbiBhICdzdG9wcGVkJyBldmVudCBpcyBlbmNvdW50ZXJlZCwgdGhlXG5cdCAqIGVkaXRvciByZWZyZXNoZXMgaXRzIHRocmVhZCBJRHMuIEluIHRoZSBtZWFudGltZSwgdGhlIHRocmVhZCBtYXkgY2hhbmdlXG5cdCAqIHN0YXRlIGl0IGFnYWluLiBTbyB0aGUgZWRpdG9yIHB1dHMgYSBTZXQgaW50byB0aGlzIGFycmF5IHdoZW4gaXQgc3RhcnRzXG5cdCAqIHRoZSByZWZyZXNoLCBhbmQgY2hlY2tzIGl0IGFmdGVyIHRoZSByZWZyZXNoIGlzIGZpbmlzaGVkLCB0byBzZWUgaWZcblx0ICogYW55IG9mIHRoZSB0aHJlYWRzIGl0IGxvb2tlZCB1cCBzaG91bGQgbm93IGJlIGludmFsaWRhdGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBwZW5kaW5nQ2FuY2VsbGF0aW9uczogU2V0PG51bWJlciB8IHVuZGVmaW5lZD5bXSA9IFtdO1xuXG5cdC8qKlxuXHQgKiBDYW5jZWxsYXRpb24gdG9rZW5zIGZvciBjdXJyZW50bHktcnVubmluZyBvcGVyYXRpb25zIG9uIHRocmVhZHMuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IHRocmVhZE9wcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXG5cdC8qKlxuXHQgKiBSdW5zIHRoZSBvcGVyYXRpb24uXG5cdCAqIElmIHRocmVhZCBpcyB1bmRlZmluZWQgaXQgYWZmZWN0cyBhbGwgdGhyZWFkcy5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBydW4odGhyZWFkSWRzUDogUHJvbWlzZTxudW1iZXJbXT4gfCBudW1iZXJbXSwgb3BlcmF0aW9uOiAodGhyZWFkSWQ6IG51bWJlciwgY3Q6IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPHVua25vd24+KSB7XG5cdFx0Y29uc3QgY2FuY2VsbGVkV2hpbGVMb29raW5nVXBUaHJlYWRzID0gbmV3IFNldDxudW1iZXIgfCB1bmRlZmluZWQ+KCk7XG5cdFx0dGhpcy5wZW5kaW5nQ2FuY2VsbGF0aW9ucy5wdXNoKGNhbmNlbGxlZFdoaWxlTG9va2luZ1VwVGhyZWFkcyk7XG5cdFx0Y29uc3QgdGhyZWFkSWRzID0gYXdhaXQgdGhyZWFkSWRzUDtcblxuXHRcdC8vIE5vdyB0aGF0IHdlIGdvdCBvdXIgdGhyZWFkcyxcblx0XHQvLyAxLiBSZW1vdmUgb3VyIHBlbmRpbmcgc2V0LCBhbmRcblx0XHQvLyAyLiBDYW5jZWwgYW55IHNsb3dlciBjYWxsZXJzIHdobyBtaWdodCBhbHNvIGhhdmUgZm91bmQgdGhpcyB0aHJlYWRcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucGVuZGluZ0NhbmNlbGxhdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHMgPSB0aGlzLnBlbmRpbmdDYW5jZWxsYXRpb25zW2ldO1xuXHRcdFx0aWYgKHMgPT09IGNhbmNlbGxlZFdoaWxlTG9va2luZ1VwVGhyZWFkcykge1xuXHRcdFx0XHR0aGlzLnBlbmRpbmdDYW5jZWxsYXRpb25zLnNwbGljZShpLCAxKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHRocmVhZElkIG9mIHRocmVhZElkcykge1xuXHRcdFx0XHRcdHMuYWRkKHRocmVhZElkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjYW5jZWxsZWRXaGlsZUxvb2tpbmdVcFRocmVhZHMuaGFzKHVuZGVmaW5lZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbCh0aHJlYWRJZHMubWFwKHRocmVhZElkID0+IHtcblx0XHRcdGlmIChjYW5jZWxsZWRXaGlsZUxvb2tpbmdVcFRocmVhZHMuaGFzKHRocmVhZElkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRocmVhZE9wcy5nZXQodGhyZWFkSWQpPy5jYW5jZWwoKTtcblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0dGhpcy50aHJlYWRPcHMuc2V0KHRocmVhZElkLCBjdHMpO1xuXHRcdFx0cmV0dXJuIG9wZXJhdGlvbih0aHJlYWRJZCwgY3RzLnRva2VuKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FuY2VscyBhbGwgb25nb2luZyBzdGF0ZSBvcGVyYXRpb25zIG9uIHRoZSBnaXZlbiB0aHJlYWRzLlxuXHQgKiBJZiB0aHJlYWRzIGlzIHVuZGVmaW5lZCBpdCBjYW5jZWwgYWxsIHRocmVhZHMuXG5cdCAqL1xuXHRwdWJsaWMgY2FuY2VsKHRocmVhZElkcz86IHJlYWRvbmx5IG51bWJlcltdKSB7XG5cdFx0aWYgKCF0aHJlYWRJZHMpIHtcblx0XHRcdGZvciAoY29uc3QgW18sIG9wXSBvZiB0aGlzLnRocmVhZE9wcykge1xuXHRcdFx0XHRvcC5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudGhyZWFkT3BzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHRcdFx0Zm9yIChjb25zdCBzIG9mIHRoaXMucGVuZGluZ0NhbmNlbGxhdGlvbnMpIHtcblx0XHRcdFx0cy5hZGQodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCB0aHJlYWRJZCBvZiB0aHJlYWRJZHMpIHtcblx0XHRcdFx0dGhpcy50aHJlYWRPcHMuZ2V0KHRocmVhZElkKT8uY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMudGhyZWFkT3BzLmRlbGV0ZUFuZERpc3Bvc2UodGhyZWFkSWQpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHMgb2YgdGhpcy5wZW5kaW5nQ2FuY2VsbGF0aW9ucykge1xuXHRcdFx0XHRcdHMuYWRkKHRocmVhZElkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxZQUFZLFVBQVU7QUFDdEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxPQUFPLGtCQUFrQixtQkFBbUI7QUFDckQsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsWUFBWSxlQUFlLGlCQUFpQixtQkFBbUIsZUFBZTtBQUN2RixTQUFTLGFBQWE7QUFDdEIsWUFBWSxjQUFjO0FBQzFCLFlBQVksZUFBZTtBQUMzQixPQUFPLGNBQWM7QUFDckIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUNBQWlDLG1CQUFtQixzQkFBc0I7QUFDbkYsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FBa0Q7QUFDM0QsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQ0FBaUM7QUFFMUMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBNkksZUFBNlAsT0FBTyxZQUFZLDJCQUEyQjtBQUV4YixTQUFxQixxQkFBcUIsY0FBYyxjQUFjO0FBQ3RFLFNBQVMsY0FBYztBQUN2QixTQUFTLHFDQUFxQztBQUM5QyxTQUE4QixpQkFBaUI7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VSxJQUFJLGNBQStDLENBQUM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNaEcsTUFBYSxJQUFJLFlBQTBDLFdBQTBFO0FBQ3BJLFVBQU0saUNBQWlDLG9CQUFJLElBQXdCO0FBQ25FLFNBQUsscUJBQXFCLEtBQUssOEJBQThCO0FBQzdELFVBQU0sWUFBWSxNQUFNO0FBS3hCLGFBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxxQkFBcUIsUUFBUSxLQUFLO0FBQzFELFlBQU0sSUFBSSxLQUFLLHFCQUFxQixDQUFDO0FBQ3JDLFVBQUksTUFBTSxnQ0FBZ0M7QUFDekMsYUFBSyxxQkFBcUIsT0FBTyxHQUFHLENBQUM7QUFDckM7QUFBQSxNQUNELE9BQU87QUFDTixtQkFBVyxZQUFZLFdBQVc7QUFDakMsWUFBRSxJQUFJLFFBQVE7QUFBQSxRQUNmO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLCtCQUErQixJQUFJLE1BQVMsR0FBRztBQUNsRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQVEsSUFBSSxVQUFVLElBQUksY0FBWTtBQUMzQyxVQUFJLCtCQUErQixJQUFJLFFBQVEsR0FBRztBQUNqRDtBQUFBLE1BQ0Q7QUFDQSxXQUFLLFVBQVUsSUFBSSxRQUFRLEdBQUcsT0FBTztBQUNyQyxZQUFNLE1BQU0sSUFBSSx3QkFBd0I7QUFDeEMsV0FBSyxVQUFVLElBQUksVUFBVSxHQUFHO0FBQ2hDLGFBQU8sVUFBVSxVQUFVLElBQUksS0FBSztBQUFBLElBQ3JDLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTU8sT0FBTyxXQUErQjtBQUM1QyxRQUFJLENBQUMsV0FBVztBQUNmLGlCQUFXLENBQUMsR0FBRyxFQUFFLEtBQUssS0FBSyxXQUFXO0FBQ3JDLFdBQUcsT0FBTztBQUFBLE1BQ1g7QUFDQSxXQUFLLFVBQVUsbUJBQW1CO0FBQ2xDLGlCQUFXLEtBQUssS0FBSyxzQkFBc0I7QUFDMUMsVUFBRSxJQUFJLE1BQVM7QUFBQSxNQUNoQjtBQUFBLElBQ0QsT0FBTztBQUNOLGlCQUFXLFlBQVksV0FBVztBQUNqQyxhQUFLLFVBQVUsSUFBSSxRQUFRLEdBQUcsT0FBTztBQUNyQyxhQUFLLFVBQVUsaUJBQWlCLFFBQVE7QUFDeEMsbUJBQVcsS0FBSyxLQUFLLHNCQUFzQjtBQUMxQyxZQUFFLElBQUksUUFBUTtBQUFBLFFBQ2Y7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDsiLAogICJuYW1lcyI6IFsiZm9jdXNlZFN0YWNrRnJhbWUiXQp9Cg==
