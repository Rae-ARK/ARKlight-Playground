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
import * as nls from "../../../../nls.js";
import { Emitter } from "../../../../base/common/event.js";
import * as objects from "../../../../base/common/objects.js";
import { toAction } from "../../../../base/common/actions.js";
import * as errors from "../../../../base/common/errors.js";
import { createErrorWithActions } from "../../../../base/common/errorMessage.js";
import { formatPII, isUriString } from "../common/debugUtils.js";
import { IExtensionHostDebugService } from "../../../../platform/debug/common/extensionHostDebug.js";
import { URI } from "../../../../base/common/uri.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { Schemas } from "../../../../base/common/network.js";
let RawDebugSession = class {
  constructor(debugAdapter, dbgr, sessionId, name, extensionHostDebugService, openerService, notificationService, dialogSerivce) {
    this.dbgr = dbgr;
    this.sessionId = sessionId;
    this.name = name;
    this.extensionHostDebugService = extensionHostDebugService;
    this.openerService = openerService;
    this.notificationService = notificationService;
    this.dialogSerivce = dialogSerivce;
    this.allThreadsContinued = true;
    this._readyForBreakpoints = false;
    // shutdown
    this.debugAdapterStopped = false;
    this.inShutdown = false;
    this.terminated = false;
    this.firedAdapterExitEvent = false;
    // telemetry
    this.startTime = 0;
    this.didReceiveStoppedEvent = false;
    this.toDispose = new DisposableStore();
    // DAP events
    this._onDidInitialize = this.toDispose.add(new Emitter());
    this._onDidStop = this.toDispose.add(new Emitter());
    this._onDidContinued = this.toDispose.add(new Emitter());
    this._onDidTerminateDebugee = this.toDispose.add(new Emitter());
    this._onDidExitDebugee = this.toDispose.add(new Emitter());
    this._onDidThread = this.toDispose.add(new Emitter());
    this._onDidOutput = this.toDispose.add(new Emitter());
    this._onDidBreakpoint = this.toDispose.add(new Emitter());
    this._onDidLoadedSource = this.toDispose.add(new Emitter());
    this._onDidProgressStart = this.toDispose.add(new Emitter());
    this._onDidProgressUpdate = this.toDispose.add(new Emitter());
    this._onDidProgressEnd = this.toDispose.add(new Emitter());
    this._onDidInvalidated = this.toDispose.add(new Emitter());
    this._onDidInvalidateMemory = this.toDispose.add(new Emitter());
    this._onDidCustomEvent = this.toDispose.add(new Emitter());
    this._onDidEvent = this.toDispose.add(new Emitter());
    // DA events
    this._onDidExitAdapter = this.toDispose.add(new Emitter());
    this.stoppedSinceLastStep = false;
    this.debugAdapter = debugAdapter;
    this._capabilities = /* @__PURE__ */ Object.create(null);
    this.toDispose.add(this.debugAdapter.onError((err) => {
      this.shutdown(err);
    }));
    this.toDispose.add(this.debugAdapter.onExit((code) => {
      if (code !== 0) {
        this.shutdown(new Error(`exit code: ${code}`));
      } else {
        this.shutdown();
      }
    }));
    this.debugAdapter.onEvent((event) => {
      switch (event.event) {
        case "initialized":
          this._readyForBreakpoints = true;
          this._onDidInitialize.fire(event);
          break;
        case "loadedSource":
          this._onDidLoadedSource.fire(event);
          break;
        case "capabilities":
          if (event.body) {
            const capabilities = event.body.capabilities;
            this.mergeCapabilities(capabilities);
          }
          break;
        case "stopped":
          this.didReceiveStoppedEvent = true;
          this.stoppedSinceLastStep = true;
          this._onDidStop.fire(event);
          break;
        case "continued":
          this.allThreadsContinued = event.body.allThreadsContinued === false ? false : true;
          this._onDidContinued.fire(event);
          break;
        case "thread":
          this._onDidThread.fire(event);
          break;
        case "output":
          this._onDidOutput.fire(event);
          break;
        case "breakpoint":
          this._onDidBreakpoint.fire(event);
          break;
        case "terminated":
          this._onDidTerminateDebugee.fire(event);
          break;
        case "exited":
          this._onDidExitDebugee.fire(event);
          break;
        case "progressStart":
          this._onDidProgressStart.fire(event);
          break;
        case "progressUpdate":
          this._onDidProgressUpdate.fire(event);
          break;
        case "progressEnd":
          this._onDidProgressEnd.fire(event);
          break;
        case "invalidated":
          this._onDidInvalidated.fire(event);
          break;
        case "memory":
          this._onDidInvalidateMemory.fire(event);
          break;
        case "process":
          break;
        case "module":
          break;
        default:
          this._onDidCustomEvent.fire(event);
          break;
      }
      this._onDidEvent.fire(event);
    });
    this.debugAdapter.onRequest((request) => this.dispatchRequest(request));
  }
  get isInShutdown() {
    return this.inShutdown;
  }
  get onDidExitAdapter() {
    return this._onDidExitAdapter.event;
  }
  get capabilities() {
    return this._capabilities;
  }
  /**
   * DA is ready to accepts setBreakpoint requests.
   * Becomes true after "initialized" events has been received.
   */
  get readyForBreakpoints() {
    return this._readyForBreakpoints;
  }
  //---- DAP events
  get onDidInitialize() {
    return this._onDidInitialize.event;
  }
  get onDidStop() {
    return this._onDidStop.event;
  }
  get onDidContinued() {
    return this._onDidContinued.event;
  }
  get onDidTerminateDebugee() {
    return this._onDidTerminateDebugee.event;
  }
  get onDidExitDebugee() {
    return this._onDidExitDebugee.event;
  }
  get onDidThread() {
    return this._onDidThread.event;
  }
  get onDidOutput() {
    return this._onDidOutput.event;
  }
  get onDidBreakpoint() {
    return this._onDidBreakpoint.event;
  }
  get onDidLoadedSource() {
    return this._onDidLoadedSource.event;
  }
  get onDidCustomEvent() {
    return this._onDidCustomEvent.event;
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
  get onDidInvalidated() {
    return this._onDidInvalidated.event;
  }
  get onDidInvalidateMemory() {
    return this._onDidInvalidateMemory.event;
  }
  get onDidEvent() {
    return this._onDidEvent.event;
  }
  //---- DebugAdapter lifecycle
  /**
   * Starts the underlying debug adapter and tracks the session time for telemetry.
   */
  async start() {
    if (!this.debugAdapter) {
      return Promise.reject(new Error(nls.localize("noDebugAdapterStart", "No debug adapter, can not start debug session.")));
    }
    await this.debugAdapter.startSession();
    this.startTime = (/* @__PURE__ */ new Date()).getTime();
  }
  /**
   * Send client capabilities to the debug adapter and receive DA capabilities in return.
   */
  async initialize(args) {
    const response = await this.send("initialize", args, void 0, void 0, false);
    if (response) {
      this.mergeCapabilities(response.body);
    }
    return response;
  }
  /**
   * Terminate the debuggee and shutdown the adapter
   */
  disconnect(args) {
    const terminateDebuggee = this.capabilities.supportTerminateDebuggee ? args.terminateDebuggee : void 0;
    const suspendDebuggee = this.capabilities.supportTerminateDebuggee && this.capabilities.supportSuspendDebuggee ? args.suspendDebuggee : void 0;
    return this.shutdown(void 0, args.restart, terminateDebuggee, suspendDebuggee);
  }
  //---- DAP requests
  async launchOrAttach(config) {
    const response = await this.send(config.request, config, void 0, void 0, false);
    if (response) {
      this.mergeCapabilities(response.body);
    }
    return response;
  }
  /**
   * Try killing the debuggee softly...
   */
  terminate(restart = false) {
    if (this.capabilities.supportsTerminateRequest) {
      if (!this.terminated) {
        this.terminated = true;
        return this.send("terminate", { restart }, void 0);
      }
      return this.disconnect({ terminateDebuggee: true, restart });
    }
    return Promise.reject(new Error("terminated not supported"));
  }
  restart(args) {
    if (this.capabilities.supportsRestartRequest) {
      return this.send("restart", args);
    }
    return Promise.reject(new Error("restart not supported"));
  }
  async next(args) {
    this.stoppedSinceLastStep = false;
    const response = await this.send("next", args);
    if (!this.stoppedSinceLastStep) {
      this.fireSimulatedContinuedEvent(args.threadId);
    }
    return response;
  }
  async stepIn(args) {
    this.stoppedSinceLastStep = false;
    const response = await this.send("stepIn", args);
    if (!this.stoppedSinceLastStep) {
      this.fireSimulatedContinuedEvent(args.threadId);
    }
    return response;
  }
  async stepOut(args) {
    this.stoppedSinceLastStep = false;
    const response = await this.send("stepOut", args);
    if (!this.stoppedSinceLastStep) {
      this.fireSimulatedContinuedEvent(args.threadId);
    }
    return response;
  }
  async continue(args) {
    this.stoppedSinceLastStep = false;
    const response = await this.send("continue", args);
    if (response && response.body && response.body.allThreadsContinued !== void 0) {
      this.allThreadsContinued = response.body.allThreadsContinued;
    }
    if (!this.stoppedSinceLastStep) {
      this.fireSimulatedContinuedEvent(args.threadId, this.allThreadsContinued);
    }
    return response;
  }
  pause(args) {
    return this.send("pause", args);
  }
  terminateThreads(args) {
    if (this.capabilities.supportsTerminateThreadsRequest) {
      return this.send("terminateThreads", args);
    }
    return Promise.reject(new Error("terminateThreads not supported"));
  }
  setVariable(args) {
    if (this.capabilities.supportsSetVariable) {
      return this.send("setVariable", args);
    }
    return Promise.reject(new Error("setVariable not supported"));
  }
  setExpression(args) {
    if (this.capabilities.supportsSetExpression) {
      return this.send("setExpression", args);
    }
    return Promise.reject(new Error("setExpression not supported"));
  }
  async restartFrame(args, threadId) {
    if (this.capabilities.supportsRestartFrame) {
      this.stoppedSinceLastStep = false;
      const response = await this.send("restartFrame", args);
      if (!this.stoppedSinceLastStep) {
        this.fireSimulatedContinuedEvent(threadId);
      }
      return response;
    }
    return Promise.reject(new Error("restartFrame not supported"));
  }
  stepInTargets(args) {
    if (this.capabilities.supportsStepInTargetsRequest) {
      return this.send("stepInTargets", args);
    }
    return Promise.reject(new Error("stepInTargets not supported"));
  }
  completions(args, token) {
    if (this.capabilities.supportsCompletionsRequest) {
      return this.send("completions", args, token);
    }
    return Promise.reject(new Error("completions not supported"));
  }
  setBreakpoints(args) {
    return this.send("setBreakpoints", args);
  }
  setFunctionBreakpoints(args) {
    if (this.capabilities.supportsFunctionBreakpoints) {
      return this.send("setFunctionBreakpoints", args);
    }
    return Promise.reject(new Error("setFunctionBreakpoints not supported"));
  }
  dataBreakpointInfo(args) {
    if (this.capabilities.supportsDataBreakpoints) {
      return this.send("dataBreakpointInfo", args);
    }
    return Promise.reject(new Error("dataBreakpointInfo not supported"));
  }
  setDataBreakpoints(args) {
    if (this.capabilities.supportsDataBreakpoints) {
      return this.send("setDataBreakpoints", args);
    }
    return Promise.reject(new Error("setDataBreakpoints not supported"));
  }
  setExceptionBreakpoints(args) {
    return this.send("setExceptionBreakpoints", args);
  }
  breakpointLocations(args) {
    if (this.capabilities.supportsBreakpointLocationsRequest) {
      return this.send("breakpointLocations", args);
    }
    return Promise.reject(new Error("breakpointLocations is not supported"));
  }
  configurationDone() {
    if (this.capabilities.supportsConfigurationDoneRequest) {
      return this.send("configurationDone", null);
    }
    return Promise.reject(new Error("configurationDone not supported"));
  }
  stackTrace(args, token) {
    return this.send("stackTrace", args, token);
  }
  exceptionInfo(args) {
    if (this.capabilities.supportsExceptionInfoRequest) {
      return this.send("exceptionInfo", args);
    }
    return Promise.reject(new Error("exceptionInfo not supported"));
  }
  scopes(args, token) {
    return this.send("scopes", args, token);
  }
  variables(args, token) {
    return this.send("variables", args, token);
  }
  source(args) {
    return this.send("source", args);
  }
  locations(args) {
    return this.send("locations", args);
  }
  loadedSources(args) {
    if (this.capabilities.supportsLoadedSourcesRequest) {
      return this.send("loadedSources", args);
    }
    return Promise.reject(new Error("loadedSources not supported"));
  }
  threads() {
    return this.send("threads", null);
  }
  evaluate(args) {
    return this.send("evaluate", args);
  }
  async stepBack(args) {
    if (this.capabilities.supportsStepBack) {
      this.stoppedSinceLastStep = false;
      const response = await this.send("stepBack", args);
      if (!this.stoppedSinceLastStep) {
        this.fireSimulatedContinuedEvent(args.threadId);
      }
      return response;
    }
    return Promise.reject(new Error("stepBack not supported"));
  }
  async reverseContinue(args) {
    if (this.capabilities.supportsStepBack) {
      this.stoppedSinceLastStep = false;
      const response = await this.send("reverseContinue", args);
      if (!this.stoppedSinceLastStep) {
        this.fireSimulatedContinuedEvent(args.threadId);
      }
      return response;
    }
    return Promise.reject(new Error("reverseContinue not supported"));
  }
  gotoTargets(args) {
    if (this.capabilities.supportsGotoTargetsRequest) {
      return this.send("gotoTargets", args);
    }
    return Promise.reject(new Error("gotoTargets is not supported"));
  }
  async goto(args) {
    if (this.capabilities.supportsGotoTargetsRequest) {
      this.stoppedSinceLastStep = false;
      const response = await this.send("goto", args);
      if (!this.stoppedSinceLastStep) {
        this.fireSimulatedContinuedEvent(args.threadId);
      }
      return response;
    }
    return Promise.reject(new Error("goto is not supported"));
  }
  async setInstructionBreakpoints(args) {
    if (this.capabilities.supportsInstructionBreakpoints) {
      return await this.send("setInstructionBreakpoints", args);
    }
    return Promise.reject(new Error("setInstructionBreakpoints is not supported"));
  }
  async disassemble(args) {
    if (this.capabilities.supportsDisassembleRequest) {
      return await this.send("disassemble", args);
    }
    return Promise.reject(new Error("disassemble is not supported"));
  }
  async readMemory(args) {
    if (this.capabilities.supportsReadMemoryRequest) {
      return await this.send("readMemory", args);
    }
    return Promise.reject(new Error("readMemory is not supported"));
  }
  async writeMemory(args) {
    if (this.capabilities.supportsWriteMemoryRequest) {
      return await this.send("writeMemory", args);
    }
    return Promise.reject(new Error("writeMemory is not supported"));
  }
  cancel(args) {
    return this.send("cancel", args);
  }
  custom(request, args) {
    return this.send(request, args);
  }
  //---- private
  async shutdown(error, restart = false, terminateDebuggee = void 0, suspendDebuggee = void 0) {
    if (!this.inShutdown) {
      this.inShutdown = true;
      if (this.debugAdapter) {
        try {
          const args = { restart };
          if (typeof terminateDebuggee === "boolean") {
            args.terminateDebuggee = terminateDebuggee;
          }
          if (typeof suspendDebuggee === "boolean") {
            args.suspendDebuggee = suspendDebuggee;
          }
          await this.send("disconnect", args, void 0, error ? 200 : 2e3);
        } catch (e) {
        } finally {
          await this.stopAdapter(error);
        }
      } else {
        return this.stopAdapter(error);
      }
    }
  }
  async stopAdapter(error) {
    try {
      if (this.debugAdapter) {
        const da = this.debugAdapter;
        this.debugAdapter = null;
        await da.stopSession();
        this.debugAdapterStopped = true;
      }
    } finally {
      this.fireAdapterExitEvent(error);
    }
  }
  fireAdapterExitEvent(error) {
    if (!this.firedAdapterExitEvent) {
      this.firedAdapterExitEvent = true;
      const e = {
        emittedStopped: this.didReceiveStoppedEvent,
        sessionLengthInSeconds: ((/* @__PURE__ */ new Date()).getTime() - this.startTime) / 1e3
      };
      if (error && !this.debugAdapterStopped) {
        e.error = error;
      }
      this._onDidExitAdapter.fire(e);
    }
  }
  async dispatchRequest(request) {
    const response = {
      type: "response",
      seq: 0,
      command: request.command,
      request_seq: request.seq,
      success: true
    };
    const safeSendResponse = (response2) => this.debugAdapter && this.debugAdapter.sendResponse(response2);
    if (request.command === "launchVSCode") {
      try {
        let result = await this.launchVsCode(request.arguments);
        if (!result.success) {
          const { confirmed } = await this.dialogSerivce.confirm({
            type: Severity.Warning,
            message: nls.localize("canNotStart", "The debugger needs to open a new tab or window for the debuggee but the browser prevented this. You must give permission to continue."),
            primaryButton: nls.localize({ key: "continue", comment: ["&& denotes a mnemonic"] }, "&&Continue")
          });
          if (confirmed) {
            result = await this.launchVsCode(request.arguments);
          } else {
            response.success = false;
            safeSendResponse(response);
            await this.shutdown();
          }
        }
        response.body = {
          rendererDebugAddr: result.rendererDebugAddr
        };
        safeSendResponse(response);
      } catch (err) {
        response.success = false;
        response.message = err.message;
        safeSendResponse(response);
      }
    } else if (request.command === "runInTerminal") {
      try {
        const shellProcessId = await this.dbgr.runInTerminal(request.arguments, this.sessionId);
        const resp = response;
        resp.body = {};
        if (typeof shellProcessId === "number") {
          resp.body.shellProcessId = shellProcessId;
        }
        safeSendResponse(resp);
      } catch (err) {
        response.success = false;
        response.message = err.message;
        safeSendResponse(response);
      }
    } else if (request.command === "startDebugging") {
      try {
        const args = request.arguments;
        const config = {
          ...args.configuration,
          ...{
            request: args.request,
            type: this.dbgr.type,
            name: args.configuration.name || this.name
          }
        };
        const success = await this.dbgr.startDebugging(config, this.sessionId);
        if (success) {
          safeSendResponse(response);
        } else {
          response.success = false;
          response.message = "Failed to start debugging";
          safeSendResponse(response);
        }
      } catch (err) {
        response.success = false;
        response.message = err.message;
        safeSendResponse(response);
      }
    } else {
      response.success = false;
      response.message = `unknown request '${request.command}'`;
      safeSendResponse(response);
    }
  }
  launchVsCode(vscodeArgs) {
    const args = [];
    for (const arg of vscodeArgs.args) {
      const a2 = (arg.prefix || "") + (arg.path || "");
      const match = /^--(.+)=(.+)$/.exec(a2);
      if (match && match.length === 3) {
        const key = match[1];
        let value = match[2];
        if ((key === "file-uri" || key === "folder-uri") && !isUriString(arg.path)) {
          value = isUriString(value) ? value : URI.file(value).toString();
        }
        args.push(`--${key}=${value}`);
      } else {
        args.push(a2);
      }
    }
    if (vscodeArgs.env) {
      args.push(`--extensionEnvironment=${JSON.stringify(vscodeArgs.env)}`);
    }
    return this.extensionHostDebugService.openExtensionDevelopmentHostWindow(args, !!vscodeArgs.debugRenderer);
  }
  send(command, args, token, timeout, showErrors = true) {
    return new Promise((completeDispatch, errorDispatch) => {
      if (!this.debugAdapter) {
        if (this.inShutdown) {
          completeDispatch(void 0);
        } else {
          errorDispatch(new Error(nls.localize("noDebugAdapter", "No debugger available found. Can not send '{0}'.", command)));
        }
        return;
      }
      let cancelationListener;
      const requestId = this.debugAdapter.sendRequest(command, args, (response) => {
        cancelationListener?.dispose();
        if (response.success) {
          completeDispatch(response);
        } else {
          errorDispatch(response);
        }
      }, timeout);
      if (token) {
        cancelationListener = token.onCancellationRequested(() => {
          cancelationListener.dispose();
          if (this.capabilities.supportsCancelRequest) {
            this.cancel({ requestId });
          }
        });
      }
    }).then(void 0, (err) => Promise.reject(this.handleErrorResponse(err, showErrors)));
  }
  handleErrorResponse(errorResponse, showErrors) {
    if (errorResponse.command === "canceled" && errorResponse.message === "canceled") {
      return new errors.CancellationError();
    }
    const error = errorResponse?.body?.error;
    const errorMessage = errorResponse?.message || "";
    const userMessage = error ? formatPII(error.format, false, error.variables) : errorMessage;
    const url = error?.url;
    if (error && url) {
      const label = error.urlLabel ? error.urlLabel : nls.localize("moreInfo", "More Info");
      const uri = URI.parse(url);
      const actionId = uri.scheme === Schemas.command ? "debug.moreInfo.command" : "debug.moreInfo";
      return createErrorWithActions(userMessage, [toAction({ id: actionId, label, run: () => this.openerService.open(uri, { allowCommands: true }) })]);
    }
    if (showErrors && error && error.format && error.showUser) {
      this.notificationService.error(userMessage);
    }
    const result = new errors.ErrorNoTelemetry(userMessage);
    result.showUser = error?.showUser;
    return result;
  }
  mergeCapabilities(capabilities) {
    if (capabilities) {
      this._capabilities = objects.mixin(this._capabilities, capabilities);
    }
  }
  fireSimulatedContinuedEvent(threadId, allThreadsContinued = false) {
    this._onDidContinued.fire({
      type: "event",
      event: "continued",
      body: {
        threadId,
        allThreadsContinued
      },
      seq: void 0
    });
  }
  dispose() {
    this.toDispose.dispose();
  }
};
RawDebugSession = __decorateClass([
  __decorateParam(4, IExtensionHostDebugService),
  __decorateParam(5, IOpenerService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IDialogService)
], RawDebugSession);
export {
  RawDebugSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvcmF3RGVidWdTZXNzaW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCAqIGFzIG9iamVjdHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0ICogYXMgZXJyb3JzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVFcnJvcldpdGhBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IGZvcm1hdFBJSSwgaXNVcmlTdHJpbmcgfSBmcm9tICcuLi9jb21tb24vZGVidWdVdGlscy5qcyc7XG5pbXBvcnQgeyBJRGVidWdBZGFwdGVyLCBJQ29uZmlnLCBBZGFwdGVyRW5kRXZlbnQsIElEZWJ1Z2dlciB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZSwgSU9wZW5FeHRlbnNpb25XaW5kb3dSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWJ1Zy9jb21tb24vZXh0ZW5zaW9uSG9zdERlYnVnLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcblxuLyoqXG4gKiBUaGlzIGludGVyZmFjZSByZXByZXNlbnRzIGEgc2luZ2xlIGNvbW1hbmQgbGluZSBhcmd1bWVudCBzcGxpdCBpbnRvIGEgXCJwcmVmaXhcIiBhbmQgYSBcInBhdGhcIiBoYWxmLlxuICogVGhlIG9wdGlvbmFsIFwicHJlZml4XCIgY29udGFpbnMgYXJiaXRyYXJ5IHRleHQgYW5kIHRoZSBvcHRpb25hbCBcInBhdGhcIiBjb250YWlucyBhIGZpbGUgc3lzdGVtIHBhdGguXG4gKiBDb25jYXRlbmF0aW5nIGJvdGggcmVzdWx0cyBpbiB0aGUgb3JpZ2luYWwgY29tbWFuZCBsaW5lIGFyZ3VtZW50LlxuICovXG5pbnRlcmZhY2UgSUxhdW5jaFZTQ29kZUFyZ3VtZW50IHtcblx0cHJlZml4Pzogc3RyaW5nO1xuXHRwYXRoPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSUxhdW5jaFZTQ29kZUFyZ3VtZW50cyB7XG5cdGFyZ3M6IElMYXVuY2hWU0NvZGVBcmd1bWVudFtdO1xuXHRkZWJ1Z1JlbmRlcmVyPzogYm9vbGVhbjtcblx0ZW52PzogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfCBudWxsIH07XG59XG5cbi8qKlxuICogRW5jYXBzdWxhdGVzIHRoZSBEZWJ1Z0FkYXB0ZXIgbGlmZWN5Y2xlIGFuZCBzb21lIGlkaW9zeW5jcmFzaWVzIG9mIHRoZSBEZWJ1ZyBBZGFwdGVyIFByb3RvY29sLlxuICovXG5leHBvcnQgY2xhc3MgUmF3RGVidWdTZXNzaW9uIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgYWxsVGhyZWFkc0NvbnRpbnVlZCA9IHRydWU7XG5cdHByaXZhdGUgX3JlYWR5Rm9yQnJlYWtwb2ludHMgPSBmYWxzZTtcblx0cHJpdmF0ZSBfY2FwYWJpbGl0aWVzOiBEZWJ1Z1Byb3RvY29sLkNhcGFiaWxpdGllcztcblxuXHQvLyBzaHV0ZG93blxuXHRwcml2YXRlIGRlYnVnQWRhcHRlclN0b3BwZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBpblNodXRkb3duID0gZmFsc2U7XG5cdHByaXZhdGUgdGVybWluYXRlZCA9IGZhbHNlO1xuXHRwcml2YXRlIGZpcmVkQWRhcHRlckV4aXRFdmVudCA9IGZhbHNlO1xuXG5cdC8vIHRlbGVtZXRyeVxuXHRwcml2YXRlIHN0YXJ0VGltZSA9IDA7XG5cdHByaXZhdGUgZGlkUmVjZWl2ZVN0b3BwZWRFdmVudCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdG9EaXNwb3NlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdC8vIERBUCBldmVudHNcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbml0aWFsaXplID0gdGhpcy50b0Rpc3Bvc2UuYWRkKG5ldyBFbWl0dGVyPERlYnVnUHJvdG9jb2wuSW5pdGlhbGl6ZWRFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3RvcCA9IHRoaXMudG9EaXNwb3NlLmFkZChuZXcgRW1pdHRlcjxEZWJ1Z1Byb3RvY29sLlN0b3BwZWRFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ29udGludWVkID0gdGhpcy50b0Rpc3Bvc2UuYWRkKG5ldyBFbWl0dGVyPERlYnVnUHJvdG9jb2wuQ29udGludWVkRXZlbnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRlcm1pbmF0ZURlYnVnZWUgPSB0aGlzLnRvRGlzcG9zZS5hZGQobmV3IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5UZXJtaW5hdGVkRXZlbnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEV4aXREZWJ1Z2VlID0gdGhpcy50b0Rpc3Bvc2UuYWRkKG5ldyBFbWl0dGVyPERlYnVnUHJvdG9jb2wuRXhpdGVkRXZlbnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRocmVhZCA9IHRoaXMudG9EaXNwb3NlLmFkZChuZXcgRW1pdHRlcjxEZWJ1Z1Byb3RvY29sLlRocmVhZEV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRPdXRwdXQgPSB0aGlzLnRvRGlzcG9zZS5hZGQobmV3IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5PdXRwdXRFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQnJlYWtwb2ludCA9IHRoaXMudG9EaXNwb3NlLmFkZChuZXcgRW1pdHRlcjxEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnRFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTG9hZGVkU291cmNlID0gdGhpcy50b0Rpc3Bvc2UuYWRkKG5ldyBFbWl0dGVyPERlYnVnUHJvdG9jb2wuTG9hZGVkU291cmNlRXZlbnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFByb2dyZXNzU3RhcnQgPSB0aGlzLnRvRGlzcG9zZS5hZGQobmV3IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5Qcm9ncmVzc1N0YXJ0RXZlbnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFByb2dyZXNzVXBkYXRlID0gdGhpcy50b0Rpc3Bvc2UuYWRkKG5ldyBFbWl0dGVyPERlYnVnUHJvdG9jb2wuUHJvZ3Jlc3NVcGRhdGVFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUHJvZ3Jlc3NFbmQgPSB0aGlzLnRvRGlzcG9zZS5hZGQobmV3IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5Qcm9ncmVzc0VuZEV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbnZhbGlkYXRlZCA9IHRoaXMudG9EaXNwb3NlLmFkZChuZXcgRW1pdHRlcjxEZWJ1Z1Byb3RvY29sLkludmFsaWRhdGVkRXZlbnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEludmFsaWRhdGVNZW1vcnkgPSB0aGlzLnRvRGlzcG9zZS5hZGQobmV3IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5NZW1vcnlFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ3VzdG9tRXZlbnQgPSB0aGlzLnRvRGlzcG9zZS5hZGQobmV3IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5FdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRXZlbnQgPSB0aGlzLnRvRGlzcG9zZS5hZGQobmV3IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5FdmVudD4oKSk7XG5cblx0Ly8gREEgZXZlbnRzXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRXhpdEFkYXB0ZXIgPSB0aGlzLnRvRGlzcG9zZS5hZGQobmV3IEVtaXR0ZXI8QWRhcHRlckVuZEV2ZW50PigpKTtcblx0cHJpdmF0ZSBkZWJ1Z0FkYXB0ZXI6IElEZWJ1Z0FkYXB0ZXIgfCBudWxsO1xuXHRwcml2YXRlIHN0b3BwZWRTaW5jZUxhc3RTdGVwID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZGVidWdBZGFwdGVyOiBJRGVidWdBZGFwdGVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBkYmdyOiBJRGVidWdnZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5hbWU6IHN0cmluZyxcblx0XHRASUV4dGVuc2lvbkhvc3REZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlOiBJRXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJpdmNlOiBJRGlhbG9nU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5kZWJ1Z0FkYXB0ZXIgPSBkZWJ1Z0FkYXB0ZXI7XG5cdFx0dGhpcy5fY2FwYWJpbGl0aWVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHRcdHRoaXMudG9EaXNwb3NlLmFkZCh0aGlzLmRlYnVnQWRhcHRlci5vbkVycm9yKGVyciA9PiB7XG5cdFx0XHR0aGlzLnNodXRkb3duKGVycik7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy50b0Rpc3Bvc2UuYWRkKHRoaXMuZGVidWdBZGFwdGVyLm9uRXhpdChjb2RlID0+IHtcblx0XHRcdGlmIChjb2RlICE9PSAwKSB7XG5cdFx0XHRcdHRoaXMuc2h1dGRvd24obmV3IEVycm9yKGBleGl0IGNvZGU6ICR7Y29kZX1gKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBub3JtYWwgZXhpdFxuXHRcdFx0XHR0aGlzLnNodXRkb3duKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5kZWJ1Z0FkYXB0ZXIub25FdmVudChldmVudCA9PiB7XG5cdFx0XHRzd2l0Y2ggKGV2ZW50LmV2ZW50KSB7XG5cdFx0XHRcdGNhc2UgJ2luaXRpYWxpemVkJzpcblx0XHRcdFx0XHR0aGlzLl9yZWFkeUZvckJyZWFrcG9pbnRzID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZEluaXRpYWxpemUuZmlyZShldmVudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2xvYWRlZFNvdXJjZSc6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRMb2FkZWRTb3VyY2UuZmlyZSg8RGVidWdQcm90b2NvbC5Mb2FkZWRTb3VyY2VFdmVudD5ldmVudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2NhcGFiaWxpdGllcyc6XG5cdFx0XHRcdFx0aWYgKGV2ZW50LmJvZHkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNhcGFiaWxpdGllcyA9ICg8RGVidWdQcm90b2NvbC5DYXBhYmlsaXRpZXNFdmVudD5ldmVudCkuYm9keS5jYXBhYmlsaXRpZXM7XG5cdFx0XHRcdFx0XHR0aGlzLm1lcmdlQ2FwYWJpbGl0aWVzKGNhcGFiaWxpdGllcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdzdG9wcGVkJzpcblx0XHRcdFx0XHR0aGlzLmRpZFJlY2VpdmVTdG9wcGVkRXZlbnQgPSB0cnVlO1x0XHQvLyB0ZWxlbWV0cnk6IHJlbWVtYmVyIHRoYXQgZGVidWdnZXIgc3RvcHBlZCBzdWNjZXNzZnVsbHlcblx0XHRcdFx0XHR0aGlzLnN0b3BwZWRTaW5jZUxhc3RTdGVwID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFN0b3AuZmlyZSg8RGVidWdQcm90b2NvbC5TdG9wcGVkRXZlbnQ+ZXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdjb250aW51ZWQnOlxuXHRcdFx0XHRcdHRoaXMuYWxsVGhyZWFkc0NvbnRpbnVlZCA9ICg8RGVidWdQcm90b2NvbC5Db250aW51ZWRFdmVudD5ldmVudCkuYm9keS5hbGxUaHJlYWRzQ29udGludWVkID09PSBmYWxzZSA/IGZhbHNlIDogdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENvbnRpbnVlZC5maXJlKDxEZWJ1Z1Byb3RvY29sLkNvbnRpbnVlZEV2ZW50PmV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAndGhyZWFkJzpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFRocmVhZC5maXJlKDxEZWJ1Z1Byb3RvY29sLlRocmVhZEV2ZW50PmV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnb3V0cHV0Jzpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZE91dHB1dC5maXJlKDxEZWJ1Z1Byb3RvY29sLk91dHB1dEV2ZW50PmV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnYnJlYWtwb2ludCc6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRCcmVha3BvaW50LmZpcmUoPERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludEV2ZW50PmV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAndGVybWluYXRlZCc6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRUZXJtaW5hdGVEZWJ1Z2VlLmZpcmUoPERlYnVnUHJvdG9jb2wuVGVybWluYXRlZEV2ZW50PmV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnZXhpdGVkJzpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZEV4aXREZWJ1Z2VlLmZpcmUoPERlYnVnUHJvdG9jb2wuRXhpdGVkRXZlbnQ+ZXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdwcm9ncmVzc1N0YXJ0Jzpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFByb2dyZXNzU3RhcnQuZmlyZShldmVudCBhcyBEZWJ1Z1Byb3RvY29sLlByb2dyZXNzU3RhcnRFdmVudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3Byb2dyZXNzVXBkYXRlJzpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFByb2dyZXNzVXBkYXRlLmZpcmUoZXZlbnQgYXMgRGVidWdQcm90b2NvbC5Qcm9ncmVzc1VwZGF0ZUV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAncHJvZ3Jlc3NFbmQnOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkUHJvZ3Jlc3NFbmQuZmlyZShldmVudCBhcyBEZWJ1Z1Byb3RvY29sLlByb2dyZXNzRW5kRXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdpbnZhbGlkYXRlZCc6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRJbnZhbGlkYXRlZC5maXJlKGV2ZW50IGFzIERlYnVnUHJvdG9jb2wuSW52YWxpZGF0ZWRFdmVudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ21lbW9yeSc6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRJbnZhbGlkYXRlTWVtb3J5LmZpcmUoZXZlbnQgYXMgRGVidWdQcm90b2NvbC5NZW1vcnlFdmVudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3Byb2Nlc3MnOlxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdtb2R1bGUnOlxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ3VzdG9tRXZlbnQuZmlyZShldmVudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZEV2ZW50LmZpcmUoZXZlbnQpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5kZWJ1Z0FkYXB0ZXIub25SZXF1ZXN0KHJlcXVlc3QgPT4gdGhpcy5kaXNwYXRjaFJlcXVlc3QocmVxdWVzdCkpO1xuXHR9XG5cblx0Z2V0IGlzSW5TaHV0ZG93bigpIHtcblx0XHRyZXR1cm4gdGhpcy5pblNodXRkb3duO1xuXHR9XG5cblx0Z2V0IG9uRGlkRXhpdEFkYXB0ZXIoKTogRXZlbnQ8QWRhcHRlckVuZEV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkRXhpdEFkYXB0ZXIuZXZlbnQ7XG5cdH1cblxuXHRnZXQgY2FwYWJpbGl0aWVzKCk6IERlYnVnUHJvdG9jb2wuQ2FwYWJpbGl0aWVzIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FwYWJpbGl0aWVzO1xuXHR9XG5cblx0LyoqXG5cdCAqIERBIGlzIHJlYWR5IHRvIGFjY2VwdHMgc2V0QnJlYWtwb2ludCByZXF1ZXN0cy5cblx0ICogQmVjb21lcyB0cnVlIGFmdGVyIFwiaW5pdGlhbGl6ZWRcIiBldmVudHMgaGFzIGJlZW4gcmVjZWl2ZWQuXG5cdCAqL1xuXHRnZXQgcmVhZHlGb3JCcmVha3BvaW50cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVhZHlGb3JCcmVha3BvaW50cztcblx0fVxuXG5cdC8vLS0tLSBEQVAgZXZlbnRzXG5cblx0Z2V0IG9uRGlkSW5pdGlhbGl6ZSgpOiBFdmVudDxEZWJ1Z1Byb3RvY29sLkluaXRpYWxpemVkRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRJbml0aWFsaXplLmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRGlkU3RvcCgpOiBFdmVudDxEZWJ1Z1Byb3RvY29sLlN0b3BwZWRFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZFN0b3AuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRDb250aW51ZWQoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5Db250aW51ZWRFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZENvbnRpbnVlZC5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZFRlcm1pbmF0ZURlYnVnZWUoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5UZXJtaW5hdGVkRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRUZXJtaW5hdGVEZWJ1Z2VlLmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRGlkRXhpdERlYnVnZWUoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5FeGl0ZWRFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZEV4aXREZWJ1Z2VlLmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRGlkVGhyZWFkKCk6IEV2ZW50PERlYnVnUHJvdG9jb2wuVGhyZWFkRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRUaHJlYWQuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRPdXRwdXQoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5PdXRwdXRFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZE91dHB1dC5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZEJyZWFrcG9pbnQoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5CcmVha3BvaW50RXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRCcmVha3BvaW50LmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRGlkTG9hZGVkU291cmNlKCk6IEV2ZW50PERlYnVnUHJvdG9jb2wuTG9hZGVkU291cmNlRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRMb2FkZWRTb3VyY2UuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRDdXN0b21FdmVudCgpOiBFdmVudDxEZWJ1Z1Byb3RvY29sLkV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ3VzdG9tRXZlbnQuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRQcm9ncmVzc1N0YXJ0KCk6IEV2ZW50PERlYnVnUHJvdG9jb2wuUHJvZ3Jlc3NTdGFydEV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkUHJvZ3Jlc3NTdGFydC5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZFByb2dyZXNzVXBkYXRlKCk6IEV2ZW50PERlYnVnUHJvdG9jb2wuUHJvZ3Jlc3NVcGRhdGVFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZFByb2dyZXNzVXBkYXRlLmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRGlkUHJvZ3Jlc3NFbmQoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5Qcm9ncmVzc0VuZEV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkUHJvZ3Jlc3NFbmQuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRJbnZhbGlkYXRlZCgpOiBFdmVudDxEZWJ1Z1Byb3RvY29sLkludmFsaWRhdGVkRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRJbnZhbGlkYXRlZC5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZEludmFsaWRhdGVNZW1vcnkoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5NZW1vcnlFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZEludmFsaWRhdGVNZW1vcnkuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRFdmVudCgpOiBFdmVudDxEZWJ1Z1Byb3RvY29sLkV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkRXZlbnQuZXZlbnQ7XG5cdH1cblxuXHQvLy0tLS0gRGVidWdBZGFwdGVyIGxpZmVjeWNsZVxuXG5cdC8qKlxuXHQgKiBTdGFydHMgdGhlIHVuZGVybHlpbmcgZGVidWcgYWRhcHRlciBhbmQgdHJhY2tzIHRoZSBzZXNzaW9uIHRpbWUgZm9yIHRlbGVtZXRyeS5cblx0ICovXG5cdGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5kZWJ1Z0FkYXB0ZXIpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdub0RlYnVnQWRhcHRlclN0YXJ0JywgXCJObyBkZWJ1ZyBhZGFwdGVyLCBjYW4gbm90IHN0YXJ0IGRlYnVnIHNlc3Npb24uXCIpKSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5kZWJ1Z0FkYXB0ZXIuc3RhcnRTZXNzaW9uKCk7XG5cdFx0dGhpcy5zdGFydFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZW5kIGNsaWVudCBjYXBhYmlsaXRpZXMgdG8gdGhlIGRlYnVnIGFkYXB0ZXIgYW5kIHJlY2VpdmUgREEgY2FwYWJpbGl0aWVzIGluIHJldHVybi5cblx0ICovXG5cdGFzeW5jIGluaXRpYWxpemUoYXJnczogRGVidWdQcm90b2NvbC5Jbml0aWFsaXplUmVxdWVzdEFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5Jbml0aWFsaXplUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2VuZCgnaW5pdGlhbGl6ZScsIGFyZ3MsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0aWYgKHJlc3BvbnNlKSB7XG5cdFx0XHR0aGlzLm1lcmdlQ2FwYWJpbGl0aWVzKHJlc3BvbnNlLmJvZHkpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXNwb25zZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXJtaW5hdGUgdGhlIGRlYnVnZ2VlIGFuZCBzaHV0ZG93biB0aGUgYWRhcHRlclxuXHQgKi9cblx0ZGlzY29ubmVjdChhcmdzOiBEZWJ1Z1Byb3RvY29sLkRpc2Nvbm5lY3RBcmd1bWVudHMpOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IHRlcm1pbmF0ZURlYnVnZ2VlID0gdGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydFRlcm1pbmF0ZURlYnVnZ2VlID8gYXJncy50ZXJtaW5hdGVEZWJ1Z2dlZSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzdXNwZW5kRGVidWdnZWUgPSB0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0VGVybWluYXRlRGVidWdnZWUgJiYgdGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydFN1c3BlbmREZWJ1Z2dlZSA/IGFyZ3Muc3VzcGVuZERlYnVnZ2VlIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiB0aGlzLnNodXRkb3duKHVuZGVmaW5lZCwgYXJncy5yZXN0YXJ0LCB0ZXJtaW5hdGVEZWJ1Z2dlZSwgc3VzcGVuZERlYnVnZ2VlKTtcblx0fVxuXG5cdC8vLS0tLSBEQVAgcmVxdWVzdHNcblxuXHRhc3luYyBsYXVuY2hPckF0dGFjaChjb25maWc6IElDb25maWcpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2VuZChjb25maWcucmVxdWVzdCwgY29uZmlnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdGlmIChyZXNwb25zZSkge1xuXHRcdFx0dGhpcy5tZXJnZUNhcGFiaWxpdGllcyhyZXNwb25zZS5ib2R5KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzcG9uc2U7XG5cdH1cblxuXHQvKipcblx0ICogVHJ5IGtpbGxpbmcgdGhlIGRlYnVnZ2VlIHNvZnRseS4uLlxuXHQgKi9cblx0dGVybWluYXRlKHJlc3RhcnQgPSBmYWxzZSk6IFByb21pc2U8RGVidWdQcm90b2NvbC5UZXJtaW5hdGVSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c1Rlcm1pbmF0ZVJlcXVlc3QpIHtcblx0XHRcdGlmICghdGhpcy50ZXJtaW5hdGVkKSB7XG5cdFx0XHRcdHRoaXMudGVybWluYXRlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNlbmQoJ3Rlcm1pbmF0ZScsIHsgcmVzdGFydCB9LCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuZGlzY29ubmVjdCh7IHRlcm1pbmF0ZURlYnVnZ2VlOiB0cnVlLCByZXN0YXJ0IH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCd0ZXJtaW5hdGVkIG5vdCBzdXBwb3J0ZWQnKSk7XG5cdH1cblxuXHRyZXN0YXJ0KGFyZ3M6IERlYnVnUHJvdG9jb2wuUmVzdGFydEFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5SZXN0YXJ0UmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNSZXN0YXJ0UmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZCgncmVzdGFydCcsIGFyZ3MpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdyZXN0YXJ0IG5vdCBzdXBwb3J0ZWQnKSk7XG5cdH1cblxuXHRhc3luYyBuZXh0KGFyZ3M6IERlYnVnUHJvdG9jb2wuTmV4dEFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5OZXh0UmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLnN0b3BwZWRTaW5jZUxhc3RTdGVwID0gZmFsc2U7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnNlbmQoJ25leHQnLCBhcmdzKTtcblx0XHRpZiAoIXRoaXMuc3RvcHBlZFNpbmNlTGFzdFN0ZXApIHtcblx0XHRcdHRoaXMuZmlyZVNpbXVsYXRlZENvbnRpbnVlZEV2ZW50KGFyZ3MudGhyZWFkSWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzcG9uc2U7XG5cdH1cblxuXHRhc3luYyBzdGVwSW4oYXJnczogRGVidWdQcm90b2NvbC5TdGVwSW5Bcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU3RlcEluUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLnN0b3BwZWRTaW5jZUxhc3RTdGVwID0gZmFsc2U7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnNlbmQoJ3N0ZXBJbicsIGFyZ3MpO1xuXHRcdGlmICghdGhpcy5zdG9wcGVkU2luY2VMYXN0U3RlcCkge1xuXHRcdFx0dGhpcy5maXJlU2ltdWxhdGVkQ29udGludWVkRXZlbnQoYXJncy50aHJlYWRJZCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXNwb25zZTtcblx0fVxuXG5cdGFzeW5jIHN0ZXBPdXQoYXJnczogRGVidWdQcm90b2NvbC5TdGVwT3V0QXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlN0ZXBPdXRSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuc3RvcHBlZFNpbmNlTGFzdFN0ZXAgPSBmYWxzZTtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2VuZCgnc3RlcE91dCcsIGFyZ3MpO1xuXHRcdGlmICghdGhpcy5zdG9wcGVkU2luY2VMYXN0U3RlcCkge1xuXHRcdFx0dGhpcy5maXJlU2ltdWxhdGVkQ29udGludWVkRXZlbnQoYXJncy50aHJlYWRJZCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXNwb25zZTtcblx0fVxuXG5cdGFzeW5jIGNvbnRpbnVlKGFyZ3M6IERlYnVnUHJvdG9jb2wuQ29udGludWVBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuQ29udGludWVSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuc3RvcHBlZFNpbmNlTGFzdFN0ZXAgPSBmYWxzZTtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2VuZDxEZWJ1Z1Byb3RvY29sLkNvbnRpbnVlUmVzcG9uc2U+KCdjb250aW51ZScsIGFyZ3MpO1xuXHRcdGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5ib2R5ICYmIHJlc3BvbnNlLmJvZHkuYWxsVGhyZWFkc0NvbnRpbnVlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmFsbFRocmVhZHNDb250aW51ZWQgPSByZXNwb25zZS5ib2R5LmFsbFRocmVhZHNDb250aW51ZWQ7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5zdG9wcGVkU2luY2VMYXN0U3RlcCkge1xuXHRcdFx0dGhpcy5maXJlU2ltdWxhdGVkQ29udGludWVkRXZlbnQoYXJncy50aHJlYWRJZCwgdGhpcy5hbGxUaHJlYWRzQ29udGludWVkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzcG9uc2U7XG5cdH1cblxuXHRwYXVzZShhcmdzOiBEZWJ1Z1Byb3RvY29sLlBhdXNlQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlBhdXNlUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kKCdwYXVzZScsIGFyZ3MpO1xuXHR9XG5cblx0dGVybWluYXRlVGhyZWFkcyhhcmdzOiBEZWJ1Z1Byb3RvY29sLlRlcm1pbmF0ZVRocmVhZHNBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuVGVybWluYXRlVGhyZWFkc1Jlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzVGVybWluYXRlVGhyZWFkc1JlcXVlc3QpIHtcblx0XHRcdHJldHVybiB0aGlzLnNlbmQoJ3Rlcm1pbmF0ZVRocmVhZHMnLCBhcmdzKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcigndGVybWluYXRlVGhyZWFkcyBub3Qgc3VwcG9ydGVkJykpO1xuXHR9XG5cblx0c2V0VmFyaWFibGUoYXJnczogRGVidWdQcm90b2NvbC5TZXRWYXJpYWJsZUFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5TZXRWYXJpYWJsZVJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzU2V0VmFyaWFibGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnNlbmQ8RGVidWdQcm90b2NvbC5TZXRWYXJpYWJsZVJlc3BvbnNlPignc2V0VmFyaWFibGUnLCBhcmdzKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignc2V0VmFyaWFibGUgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdHNldEV4cHJlc3Npb24oYXJnczogRGVidWdQcm90b2NvbC5TZXRFeHByZXNzaW9uQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlNldEV4cHJlc3Npb25SZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c1NldEV4cHJlc3Npb24pIHtcblx0XHRcdHJldHVybiB0aGlzLnNlbmQ8RGVidWdQcm90b2NvbC5TZXRFeHByZXNzaW9uUmVzcG9uc2U+KCdzZXRFeHByZXNzaW9uJywgYXJncyk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ3NldEV4cHJlc3Npb24gbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdGFzeW5jIHJlc3RhcnRGcmFtZShhcmdzOiBEZWJ1Z1Byb3RvY29sLlJlc3RhcnRGcmFtZUFyZ3VtZW50cywgdGhyZWFkSWQ6IG51bWJlcik6IFByb21pc2U8RGVidWdQcm90b2NvbC5SZXN0YXJ0RnJhbWVSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c1Jlc3RhcnRGcmFtZSkge1xuXHRcdFx0dGhpcy5zdG9wcGVkU2luY2VMYXN0U3RlcCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnNlbmQoJ3Jlc3RhcnRGcmFtZScsIGFyZ3MpO1xuXHRcdFx0aWYgKCF0aGlzLnN0b3BwZWRTaW5jZUxhc3RTdGVwKSB7XG5cdFx0XHRcdHRoaXMuZmlyZVNpbXVsYXRlZENvbnRpbnVlZEV2ZW50KHRocmVhZElkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXNwb25zZTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcigncmVzdGFydEZyYW1lIG5vdCBzdXBwb3J0ZWQnKSk7XG5cdH1cblxuXHRzdGVwSW5UYXJnZXRzKGFyZ3M6IERlYnVnUHJvdG9jb2wuU3RlcEluVGFyZ2V0c0FyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5TdGVwSW5UYXJnZXRzUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNTdGVwSW5UYXJnZXRzUmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZCgnc3RlcEluVGFyZ2V0cycsIGFyZ3MpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdzdGVwSW5UYXJnZXRzIG5vdCBzdXBwb3J0ZWQnKSk7XG5cdH1cblxuXHRjb21wbGV0aW9ucyhhcmdzOiBEZWJ1Z1Byb3RvY29sLkNvbXBsZXRpb25zQXJndW1lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuQ29tcGxldGlvbnNSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbXBsZXRpb25zUmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZDxEZWJ1Z1Byb3RvY29sLkNvbXBsZXRpb25zUmVzcG9uc2U+KCdjb21wbGV0aW9ucycsIGFyZ3MsIHRva2VuKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignY29tcGxldGlvbnMgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdHNldEJyZWFrcG9pbnRzKGFyZ3M6IERlYnVnUHJvdG9jb2wuU2V0QnJlYWtwb2ludHNBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU2V0QnJlYWtwb2ludHNSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmQ8RGVidWdQcm90b2NvbC5TZXRCcmVha3BvaW50c1Jlc3BvbnNlPignc2V0QnJlYWtwb2ludHMnLCBhcmdzKTtcblx0fVxuXG5cdHNldEZ1bmN0aW9uQnJlYWtwb2ludHMoYXJnczogRGVidWdQcm90b2NvbC5TZXRGdW5jdGlvbkJyZWFrcG9pbnRzQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlNldEZ1bmN0aW9uQnJlYWtwb2ludHNSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c0Z1bmN0aW9uQnJlYWtwb2ludHMpIHtcblx0XHRcdHJldHVybiB0aGlzLnNlbmQ8RGVidWdQcm90b2NvbC5TZXRGdW5jdGlvbkJyZWFrcG9pbnRzUmVzcG9uc2U+KCdzZXRGdW5jdGlvbkJyZWFrcG9pbnRzJywgYXJncyk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ3NldEZ1bmN0aW9uQnJlYWtwb2ludHMgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdGRhdGFCcmVha3BvaW50SW5mbyhhcmdzOiBEZWJ1Z1Byb3RvY29sLkRhdGFCcmVha3BvaW50SW5mb0FyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5EYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c0RhdGFCcmVha3BvaW50cykge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZDxEZWJ1Z1Byb3RvY29sLkRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlPignZGF0YUJyZWFrcG9pbnRJbmZvJywgYXJncyk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ2RhdGFCcmVha3BvaW50SW5mbyBub3Qgc3VwcG9ydGVkJykpO1xuXHR9XG5cblx0c2V0RGF0YUJyZWFrcG9pbnRzKGFyZ3M6IERlYnVnUHJvdG9jb2wuU2V0RGF0YUJyZWFrcG9pbnRzQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlNldERhdGFCcmVha3BvaW50c1Jlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzRGF0YUJyZWFrcG9pbnRzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZW5kPERlYnVnUHJvdG9jb2wuU2V0RGF0YUJyZWFrcG9pbnRzUmVzcG9uc2U+KCdzZXREYXRhQnJlYWtwb2ludHMnLCBhcmdzKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignc2V0RGF0YUJyZWFrcG9pbnRzIG5vdCBzdXBwb3J0ZWQnKSk7XG5cdH1cblxuXHRzZXRFeGNlcHRpb25CcmVha3BvaW50cyhhcmdzOiBEZWJ1Z1Byb3RvY29sLlNldEV4Y2VwdGlvbkJyZWFrcG9pbnRzQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlNldEV4Y2VwdGlvbkJyZWFrcG9pbnRzUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kPERlYnVnUHJvdG9jb2wuU2V0RXhjZXB0aW9uQnJlYWtwb2ludHNSZXNwb25zZT4oJ3NldEV4Y2VwdGlvbkJyZWFrcG9pbnRzJywgYXJncyk7XG5cdH1cblxuXHRicmVha3BvaW50TG9jYXRpb25zKGFyZ3M6IERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludExvY2F0aW9uc0FyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5CcmVha3BvaW50TG9jYXRpb25zUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNCcmVha3BvaW50TG9jYXRpb25zUmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZCgnYnJlYWtwb2ludExvY2F0aW9ucycsIGFyZ3MpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdicmVha3BvaW50TG9jYXRpb25zIGlzIG5vdCBzdXBwb3J0ZWQnKSk7XG5cdH1cblxuXHRjb25maWd1cmF0aW9uRG9uZSgpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuQ29uZmlndXJhdGlvbkRvbmVSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbmZpZ3VyYXRpb25Eb25lUmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZCgnY29uZmlndXJhdGlvbkRvbmUnLCBudWxsKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignY29uZmlndXJhdGlvbkRvbmUgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdHN0YWNrVHJhY2UoYXJnczogRGVidWdQcm90b2NvbC5TdGFja1RyYWNlQXJndW1lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU3RhY2tUcmFjZVJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VuZDxEZWJ1Z1Byb3RvY29sLlN0YWNrVHJhY2VSZXNwb25zZT4oJ3N0YWNrVHJhY2UnLCBhcmdzLCB0b2tlbik7XG5cdH1cblxuXHRleGNlcHRpb25JbmZvKGFyZ3M6IERlYnVnUHJvdG9jb2wuRXhjZXB0aW9uSW5mb0FyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5FeGNlcHRpb25JbmZvUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNFeGNlcHRpb25JbmZvUmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZDxEZWJ1Z1Byb3RvY29sLkV4Y2VwdGlvbkluZm9SZXNwb25zZT4oJ2V4Y2VwdGlvbkluZm8nLCBhcmdzKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignZXhjZXB0aW9uSW5mbyBub3Qgc3VwcG9ydGVkJykpO1xuXHR9XG5cblx0c2NvcGVzKGFyZ3M6IERlYnVnUHJvdG9jb2wuU2NvcGVzQXJndW1lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU2NvcGVzUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kPERlYnVnUHJvdG9jb2wuU2NvcGVzUmVzcG9uc2U+KCdzY29wZXMnLCBhcmdzLCB0b2tlbik7XG5cdH1cblxuXHR2YXJpYWJsZXMoYXJnczogRGVidWdQcm90b2NvbC5WYXJpYWJsZXNBcmd1bWVudHMsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuVmFyaWFibGVzUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kPERlYnVnUHJvdG9jb2wuVmFyaWFibGVzUmVzcG9uc2U+KCd2YXJpYWJsZXMnLCBhcmdzLCB0b2tlbik7XG5cdH1cblxuXHRzb3VyY2UoYXJnczogRGVidWdQcm90b2NvbC5Tb3VyY2VBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU291cmNlUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kPERlYnVnUHJvdG9jb2wuU291cmNlUmVzcG9uc2U+KCdzb3VyY2UnLCBhcmdzKTtcblx0fVxuXG5cdGxvY2F0aW9ucyhhcmdzOiBEZWJ1Z1Byb3RvY29sLkxvY2F0aW9uc0FyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5Mb2NhdGlvbnNSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmQ8RGVidWdQcm90b2NvbC5Mb2NhdGlvbnNSZXNwb25zZT4oJ2xvY2F0aW9ucycsIGFyZ3MpO1xuXHR9XG5cblx0bG9hZGVkU291cmNlcyhhcmdzOiBEZWJ1Z1Byb3RvY29sLkxvYWRlZFNvdXJjZXNBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuTG9hZGVkU291cmNlc1Jlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzTG9hZGVkU291cmNlc1JlcXVlc3QpIHtcblx0XHRcdHJldHVybiB0aGlzLnNlbmQ8RGVidWdQcm90b2NvbC5Mb2FkZWRTb3VyY2VzUmVzcG9uc2U+KCdsb2FkZWRTb3VyY2VzJywgYXJncyk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ2xvYWRlZFNvdXJjZXMgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdHRocmVhZHMoKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlRocmVhZHNSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmQ8RGVidWdQcm90b2NvbC5UaHJlYWRzUmVzcG9uc2U+KCd0aHJlYWRzJywgbnVsbCk7XG5cdH1cblxuXHRldmFsdWF0ZShhcmdzOiBEZWJ1Z1Byb3RvY29sLkV2YWx1YXRlQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkV2YWx1YXRlUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kPERlYnVnUHJvdG9jb2wuRXZhbHVhdGVSZXNwb25zZT4oJ2V2YWx1YXRlJywgYXJncyk7XG5cdH1cblxuXHRhc3luYyBzdGVwQmFjayhhcmdzOiBEZWJ1Z1Byb3RvY29sLlN0ZXBCYWNrQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlN0ZXBCYWNrUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNTdGVwQmFjaykge1xuXHRcdFx0dGhpcy5zdG9wcGVkU2luY2VMYXN0U3RlcCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnNlbmQoJ3N0ZXBCYWNrJywgYXJncyk7XG5cdFx0XHRpZiAoIXRoaXMuc3RvcHBlZFNpbmNlTGFzdFN0ZXApIHtcblx0XHRcdFx0dGhpcy5maXJlU2ltdWxhdGVkQ29udGludWVkRXZlbnQoYXJncy50aHJlYWRJZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzcG9uc2U7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ3N0ZXBCYWNrIG5vdCBzdXBwb3J0ZWQnKSk7XG5cdH1cblxuXHRhc3luYyByZXZlcnNlQ29udGludWUoYXJnczogRGVidWdQcm90b2NvbC5SZXZlcnNlQ29udGludWVBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuUmV2ZXJzZUNvbnRpbnVlUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNTdGVwQmFjaykge1xuXHRcdFx0dGhpcy5zdG9wcGVkU2luY2VMYXN0U3RlcCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnNlbmQoJ3JldmVyc2VDb250aW51ZScsIGFyZ3MpO1xuXHRcdFx0aWYgKCF0aGlzLnN0b3BwZWRTaW5jZUxhc3RTdGVwKSB7XG5cdFx0XHRcdHRoaXMuZmlyZVNpbXVsYXRlZENvbnRpbnVlZEV2ZW50KGFyZ3MudGhyZWFkSWQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdyZXZlcnNlQ29udGludWUgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdGdvdG9UYXJnZXRzKGFyZ3M6IERlYnVnUHJvdG9jb2wuR290b1RhcmdldHNBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuR290b1RhcmdldHNSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c0dvdG9UYXJnZXRzUmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZCgnZ290b1RhcmdldHMnLCBhcmdzKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignZ290b1RhcmdldHMgaXMgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdGFzeW5jIGdvdG8oYXJnczogRGVidWdQcm90b2NvbC5Hb3RvQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkdvdG9SZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c0dvdG9UYXJnZXRzUmVxdWVzdCkge1xuXHRcdFx0dGhpcy5zdG9wcGVkU2luY2VMYXN0U3RlcCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnNlbmQoJ2dvdG8nLCBhcmdzKTtcblx0XHRcdGlmICghdGhpcy5zdG9wcGVkU2luY2VMYXN0U3RlcCkge1xuXHRcdFx0XHR0aGlzLmZpcmVTaW11bGF0ZWRDb250aW51ZWRFdmVudChhcmdzLnRocmVhZElkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXNwb25zZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdnb3RvIGlzIG5vdCBzdXBwb3J0ZWQnKSk7XG5cdH1cblxuXHRhc3luYyBzZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKGFyZ3M6IERlYnVnUHJvdG9jb2wuU2V0SW5zdHJ1Y3Rpb25CcmVha3BvaW50c0FyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5TZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5zZW5kKCdzZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzJywgYXJncyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignc2V0SW5zdHJ1Y3Rpb25CcmVha3BvaW50cyBpcyBub3Qgc3VwcG9ydGVkJykpO1xuXHR9XG5cblx0YXN5bmMgZGlzYXNzZW1ibGUoYXJnczogRGVidWdQcm90b2NvbC5EaXNhc3NlbWJsZUFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5EaXNhc3NlbWJsZVJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzRGlzYXNzZW1ibGVSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5zZW5kKCdkaXNhc3NlbWJsZScsIGFyZ3MpO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ2Rpc2Fzc2VtYmxlIGlzIG5vdCBzdXBwb3J0ZWQnKSk7XG5cdH1cblxuXHRhc3luYyByZWFkTWVtb3J5KGFyZ3M6IERlYnVnUHJvdG9jb2wuUmVhZE1lbW9yeUFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5SZWFkTWVtb3J5UmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNSZWFkTWVtb3J5UmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuc2VuZCgncmVhZE1lbW9yeScsIGFyZ3MpO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ3JlYWRNZW1vcnkgaXMgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdGFzeW5jIHdyaXRlTWVtb3J5KGFyZ3M6IERlYnVnUHJvdG9jb2wuV3JpdGVNZW1vcnlBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuV3JpdGVNZW1vcnlSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c1dyaXRlTWVtb3J5UmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuc2VuZCgnd3JpdGVNZW1vcnknLCBhcmdzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCd3cml0ZU1lbW9yeSBpcyBub3Qgc3VwcG9ydGVkJykpO1xuXHR9XG5cblx0Y2FuY2VsKGFyZ3M6IERlYnVnUHJvdG9jb2wuQ2FuY2VsQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkNhbmNlbFJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VuZCgnY2FuY2VsJywgYXJncyk7XG5cdH1cblxuXHRjdXN0b20ocmVxdWVzdDogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kKHJlcXVlc3QsIGFyZ3MpO1xuXHR9XG5cblx0Ly8tLS0tIHByaXZhdGVcblxuXHRwcml2YXRlIGFzeW5jIHNodXRkb3duKGVycm9yPzogRXJyb3IsIHJlc3RhcnQgPSBmYWxzZSwgdGVybWluYXRlRGVidWdnZWU6IGJvb2xlYW4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsIHN1c3BlbmREZWJ1Z2dlZTogYm9vbGVhbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pblNodXRkb3duKSB7XG5cdFx0XHR0aGlzLmluU2h1dGRvd24gPSB0cnVlO1xuXHRcdFx0aWYgKHRoaXMuZGVidWdBZGFwdGVyKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgYXJnczogRGVidWdQcm90b2NvbC5EaXNjb25uZWN0QXJndW1lbnRzID0geyByZXN0YXJ0IH07XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiB0ZXJtaW5hdGVEZWJ1Z2dlZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdFx0XHRhcmdzLnRlcm1pbmF0ZURlYnVnZ2VlID0gdGVybWluYXRlRGVidWdnZWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBzdXNwZW5kRGVidWdnZWUgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRcdFx0YXJncy5zdXNwZW5kRGVidWdnZWUgPSBzdXNwZW5kRGVidWdnZWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gaWYgdGhlcmUncyBhbiBlcnJvciwgdGhlIERBIGlzIHByb2JhYmx5IGFscmVhZHkgZ29uZSwgc28gZ2l2ZSBpdCBhIG11Y2ggc2hvcnRlciB0aW1lb3V0LlxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuc2VuZCgnZGlzY29ubmVjdCcsIGFyZ3MsIHVuZGVmaW5lZCwgZXJyb3IgPyAyMDAgOiAyMDAwKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdC8vIENhdGNoIHRoZSBwb3RlbnRpYWwgJ2Rpc2Nvbm5lY3QnIGVycm9yIC0gbm8gbmVlZCB0byBzaG93IGl0IHRvIHRoZSB1c2VyIHNpbmNlIHRoZSBhZGFwdGVyIGlzIHNodXR0aW5nIGRvd25cblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnN0b3BBZGFwdGVyKGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc3RvcEFkYXB0ZXIoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3RvcEFkYXB0ZXIoZXJyb3I/OiBFcnJvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5kZWJ1Z0FkYXB0ZXIpIHtcblx0XHRcdFx0Y29uc3QgZGEgPSB0aGlzLmRlYnVnQWRhcHRlcjtcblx0XHRcdFx0dGhpcy5kZWJ1Z0FkYXB0ZXIgPSBudWxsO1xuXHRcdFx0XHRhd2FpdCBkYS5zdG9wU2Vzc2lvbigpO1xuXHRcdFx0XHR0aGlzLmRlYnVnQWRhcHRlclN0b3BwZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmZpcmVBZGFwdGVyRXhpdEV2ZW50KGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZpcmVBZGFwdGVyRXhpdEV2ZW50KGVycm9yPzogRXJyb3IpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZmlyZWRBZGFwdGVyRXhpdEV2ZW50KSB7XG5cdFx0XHR0aGlzLmZpcmVkQWRhcHRlckV4aXRFdmVudCA9IHRydWU7XG5cblx0XHRcdGNvbnN0IGU6IEFkYXB0ZXJFbmRFdmVudCA9IHtcblx0XHRcdFx0ZW1pdHRlZFN0b3BwZWQ6IHRoaXMuZGlkUmVjZWl2ZVN0b3BwZWRFdmVudCxcblx0XHRcdFx0c2Vzc2lvbkxlbmd0aEluU2Vjb25kczogKG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gdGhpcy5zdGFydFRpbWUpIC8gMTAwMFxuXHRcdFx0fTtcblx0XHRcdGlmIChlcnJvciAmJiAhdGhpcy5kZWJ1Z0FkYXB0ZXJTdG9wcGVkKSB7XG5cdFx0XHRcdGUuZXJyb3IgPSBlcnJvcjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkRXhpdEFkYXB0ZXIuZmlyZShlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRpc3BhdGNoUmVxdWVzdChyZXF1ZXN0OiBEZWJ1Z1Byb3RvY29sLlJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IHJlc3BvbnNlOiBEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlID0ge1xuXHRcdFx0dHlwZTogJ3Jlc3BvbnNlJyxcblx0XHRcdHNlcTogMCxcblx0XHRcdGNvbW1hbmQ6IHJlcXVlc3QuY29tbWFuZCxcblx0XHRcdHJlcXVlc3Rfc2VxOiByZXF1ZXN0LnNlcSxcblx0XHRcdHN1Y2Nlc3M6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2FmZVNlbmRSZXNwb25zZSA9IChyZXNwb25zZTogRGVidWdQcm90b2NvbC5SZXNwb25zZSkgPT4gdGhpcy5kZWJ1Z0FkYXB0ZXIgJiYgdGhpcy5kZWJ1Z0FkYXB0ZXIuc2VuZFJlc3BvbnNlKHJlc3BvbnNlKTtcblxuXHRcdGlmIChyZXF1ZXN0LmNvbW1hbmQgPT09ICdsYXVuY2hWU0NvZGUnKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy5sYXVuY2hWc0NvZGUoPElMYXVuY2hWU0NvZGVBcmd1bWVudHM+cmVxdWVzdC5hcmd1bWVudHMpO1xuXHRcdFx0XHRpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VyaXZjZS5jb25maXJtKHtcblx0XHRcdFx0XHRcdHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2Nhbk5vdFN0YXJ0JywgXCJUaGUgZGVidWdnZXIgbmVlZHMgdG8gb3BlbiBhIG5ldyB0YWIgb3Igd2luZG93IGZvciB0aGUgZGVidWdnZWUgYnV0IHRoZSBicm93c2VyIHByZXZlbnRlZCB0aGlzLiBZb3UgbXVzdCBnaXZlIHBlcm1pc3Npb24gdG8gY29udGludWUuXCIpLFxuXHRcdFx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbmxzLmxvY2FsaXplKHsga2V5OiAnY29udGludWUnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDb250aW51ZVwiKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmIChjb25maXJtZWQpIHtcblx0XHRcdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMubGF1bmNoVnNDb2RlKDxJTGF1bmNoVlNDb2RlQXJndW1lbnRzPnJlcXVlc3QuYXJndW1lbnRzKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzcG9uc2Uuc3VjY2VzcyA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0c2FmZVNlbmRSZXNwb25zZShyZXNwb25zZSk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnNodXRkb3duKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3BvbnNlLmJvZHkgPSB7XG5cdFx0XHRcdFx0cmVuZGVyZXJEZWJ1Z0FkZHI6IHJlc3VsdC5yZW5kZXJlckRlYnVnQWRkcixcblx0XHRcdFx0fTtcblx0XHRcdFx0c2FmZVNlbmRSZXNwb25zZShyZXNwb25zZSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0cmVzcG9uc2Uuc3VjY2VzcyA9IGZhbHNlO1xuXHRcdFx0XHRyZXNwb25zZS5tZXNzYWdlID0gZXJyLm1lc3NhZ2U7XG5cdFx0XHRcdHNhZmVTZW5kUmVzcG9uc2UocmVzcG9uc2UpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocmVxdWVzdC5jb21tYW5kID09PSAncnVuSW5UZXJtaW5hbCcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNoZWxsUHJvY2Vzc0lkID0gYXdhaXQgdGhpcy5kYmdyLnJ1bkluVGVybWluYWwocmVxdWVzdC5hcmd1bWVudHMgYXMgRGVidWdQcm90b2NvbC5SdW5JblRlcm1pbmFsUmVxdWVzdEFyZ3VtZW50cywgdGhpcy5zZXNzaW9uSWQpO1xuXHRcdFx0XHRjb25zdCByZXNwID0gcmVzcG9uc2UgYXMgRGVidWdQcm90b2NvbC5SdW5JblRlcm1pbmFsUmVzcG9uc2U7XG5cdFx0XHRcdHJlc3AuYm9keSA9IHt9O1xuXHRcdFx0XHRpZiAodHlwZW9mIHNoZWxsUHJvY2Vzc0lkID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHJlc3AuYm9keS5zaGVsbFByb2Nlc3NJZCA9IHNoZWxsUHJvY2Vzc0lkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNhZmVTZW5kUmVzcG9uc2UocmVzcCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0cmVzcG9uc2Uuc3VjY2VzcyA9IGZhbHNlO1xuXHRcdFx0XHRyZXNwb25zZS5tZXNzYWdlID0gZXJyLm1lc3NhZ2U7XG5cdFx0XHRcdHNhZmVTZW5kUmVzcG9uc2UocmVzcG9uc2UpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocmVxdWVzdC5jb21tYW5kID09PSAnc3RhcnREZWJ1Z2dpbmcnKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBhcmdzID0gKHJlcXVlc3QuYXJndW1lbnRzIGFzIERlYnVnUHJvdG9jb2wuU3RhcnREZWJ1Z2dpbmdSZXF1ZXN0QXJndW1lbnRzKTtcblx0XHRcdFx0Y29uc3QgY29uZmlnOiBJQ29uZmlnID0ge1xuXHRcdFx0XHRcdC4uLmFyZ3MuY29uZmlndXJhdGlvbixcblx0XHRcdFx0XHQuLi57XG5cdFx0XHRcdFx0XHRyZXF1ZXN0OiBhcmdzLnJlcXVlc3QsXG5cdFx0XHRcdFx0XHR0eXBlOiB0aGlzLmRiZ3IudHlwZSxcblx0XHRcdFx0XHRcdG5hbWU6IGFyZ3MuY29uZmlndXJhdGlvbi5uYW1lIHx8IHRoaXMubmFtZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMuZGJnci5zdGFydERlYnVnZ2luZyhjb25maWcsIHRoaXMuc2Vzc2lvbklkKTtcblx0XHRcdFx0aWYgKHN1Y2Nlc3MpIHtcblx0XHRcdFx0XHRzYWZlU2VuZFJlc3BvbnNlKHJlc3BvbnNlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNwb25zZS5zdWNjZXNzID0gZmFsc2U7XG5cdFx0XHRcdFx0cmVzcG9uc2UubWVzc2FnZSA9ICdGYWlsZWQgdG8gc3RhcnQgZGVidWdnaW5nJztcblx0XHRcdFx0XHRzYWZlU2VuZFJlc3BvbnNlKHJlc3BvbnNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHJlc3BvbnNlLnN1Y2Nlc3MgPSBmYWxzZTtcblx0XHRcdFx0cmVzcG9uc2UubWVzc2FnZSA9IGVyci5tZXNzYWdlO1xuXHRcdFx0XHRzYWZlU2VuZFJlc3BvbnNlKHJlc3BvbnNlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzcG9uc2Uuc3VjY2VzcyA9IGZhbHNlO1xuXHRcdFx0cmVzcG9uc2UubWVzc2FnZSA9IGB1bmtub3duIHJlcXVlc3QgJyR7cmVxdWVzdC5jb21tYW5kfSdgO1xuXHRcdFx0c2FmZVNlbmRSZXNwb25zZShyZXNwb25zZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsYXVuY2hWc0NvZGUodnNjb2RlQXJnczogSUxhdW5jaFZTQ29kZUFyZ3VtZW50cyk6IFByb21pc2U8SU9wZW5FeHRlbnNpb25XaW5kb3dSZXN1bHQ+IHtcblxuXHRcdGNvbnN0IGFyZ3M6IHN0cmluZ1tdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGFyZyBvZiB2c2NvZGVBcmdzLmFyZ3MpIHtcblx0XHRcdGNvbnN0IGEyID0gKGFyZy5wcmVmaXggfHwgJycpICsgKGFyZy5wYXRoIHx8ICcnKTtcblx0XHRcdGNvbnN0IG1hdGNoID0gL14tLSguKyk9KC4rKSQvLmV4ZWMoYTIpO1xuXHRcdFx0aWYgKG1hdGNoICYmIG1hdGNoLmxlbmd0aCA9PT0gMykge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBtYXRjaFsxXTtcblx0XHRcdFx0bGV0IHZhbHVlID0gbWF0Y2hbMl07XG5cblx0XHRcdFx0aWYgKChrZXkgPT09ICdmaWxlLXVyaScgfHwga2V5ID09PSAnZm9sZGVyLXVyaScpICYmICFpc1VyaVN0cmluZyhhcmcucGF0aCkpIHtcblx0XHRcdFx0XHR2YWx1ZSA9IGlzVXJpU3RyaW5nKHZhbHVlKSA/IHZhbHVlIDogVVJJLmZpbGUodmFsdWUpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXJncy5wdXNoKGAtLSR7a2V5fT0ke3ZhbHVlfWApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXJncy5wdXNoKGEyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodnNjb2RlQXJncy5lbnYpIHtcblx0XHRcdGFyZ3MucHVzaChgLS1leHRlbnNpb25FbnZpcm9ubWVudD0ke0pTT04uc3RyaW5naWZ5KHZzY29kZUFyZ3MuZW52KX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlLm9wZW5FeHRlbnNpb25EZXZlbG9wbWVudEhvc3RXaW5kb3coYXJncywgISF2c2NvZGVBcmdzLmRlYnVnUmVuZGVyZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZW5kPFIgZXh0ZW5kcyBEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlPihjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IGFueSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbiwgdGltZW91dD86IG51bWJlciwgc2hvd0Vycm9ycyA9IHRydWUpOiBQcm9taXNlPFIgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8RGVidWdQcm90b2NvbC5SZXNwb25zZSB8IHVuZGVmaW5lZD4oKGNvbXBsZXRlRGlzcGF0Y2gsIGVycm9yRGlzcGF0Y2gpID0+IHtcblx0XHRcdGlmICghdGhpcy5kZWJ1Z0FkYXB0ZXIpIHtcblx0XHRcdFx0aWYgKHRoaXMuaW5TaHV0ZG93bikge1xuXHRcdFx0XHRcdC8vIFdlIGFyZSBpbiBzaHV0ZG93biBzaWxlbnRseSBjb21wbGV0ZVxuXHRcdFx0XHRcdGNvbXBsZXRlRGlzcGF0Y2godW5kZWZpbmVkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlcnJvckRpc3BhdGNoKG5ldyBFcnJvcihubHMubG9jYWxpemUoJ25vRGVidWdBZGFwdGVyJywgXCJObyBkZWJ1Z2dlciBhdmFpbGFibGUgZm91bmQuIENhbiBub3Qgc2VuZCAnezB9Jy5cIiwgY29tbWFuZCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjYW5jZWxhdGlvbkxpc3RlbmVyOiBJRGlzcG9zYWJsZTtcblx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9IHRoaXMuZGVidWdBZGFwdGVyLnNlbmRSZXF1ZXN0KGNvbW1hbmQsIGFyZ3MsIChyZXNwb25zZTogRGVidWdQcm90b2NvbC5SZXNwb25zZSkgPT4ge1xuXHRcdFx0XHRjYW5jZWxhdGlvbkxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cblx0XHRcdFx0aWYgKHJlc3BvbnNlLnN1Y2Nlc3MpIHtcblx0XHRcdFx0XHRjb21wbGV0ZURpc3BhdGNoKHJlc3BvbnNlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlcnJvckRpc3BhdGNoKHJlc3BvbnNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdGltZW91dCk7XG5cblx0XHRcdGlmICh0b2tlbikge1xuXHRcdFx0XHRjYW5jZWxhdGlvbkxpc3RlbmVyID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdGNhbmNlbGF0aW9uTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c0NhbmNlbFJlcXVlc3QpIHtcblx0XHRcdFx0XHRcdHRoaXMuY2FuY2VsKHsgcmVxdWVzdElkIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkudGhlbih1bmRlZmluZWQsIGVyciA9PiBQcm9taXNlLnJlamVjdCh0aGlzLmhhbmRsZUVycm9yUmVzcG9uc2UoZXJyLCBzaG93RXJyb3JzKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVFcnJvclJlc3BvbnNlKGVycm9yUmVzcG9uc2U6IERlYnVnUHJvdG9jb2wuUmVzcG9uc2UsIHNob3dFcnJvcnM6IGJvb2xlYW4pOiBFcnJvciB7XG5cblx0XHRpZiAoZXJyb3JSZXNwb25zZS5jb21tYW5kID09PSAnY2FuY2VsZWQnICYmIGVycm9yUmVzcG9uc2UubWVzc2FnZSA9PT0gJ2NhbmNlbGVkJykge1xuXHRcdFx0cmV0dXJuIG5ldyBlcnJvcnMuQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHRjb25zdCBlcnJvcjogRGVidWdQcm90b2NvbC5NZXNzYWdlIHwgdW5kZWZpbmVkID0gZXJyb3JSZXNwb25zZT8uYm9keT8uZXJyb3I7XG5cdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3JSZXNwb25zZT8ubWVzc2FnZSB8fCAnJztcblxuXHRcdGNvbnN0IHVzZXJNZXNzYWdlID0gZXJyb3IgPyBmb3JtYXRQSUkoZXJyb3IuZm9ybWF0LCBmYWxzZSwgZXJyb3IudmFyaWFibGVzKSA6IGVycm9yTWVzc2FnZTtcblx0XHRjb25zdCB1cmwgPSBlcnJvcj8udXJsO1xuXHRcdGlmIChlcnJvciAmJiB1cmwpIHtcblx0XHRcdGNvbnN0IGxhYmVsID0gZXJyb3IudXJsTGFiZWwgPyBlcnJvci51cmxMYWJlbCA6IG5scy5sb2NhbGl6ZSgnbW9yZUluZm8nLCBcIk1vcmUgSW5mb1wiKTtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSh1cmwpO1xuXHRcdFx0Ly8gVXNlIGEgc3VmZml4ZWQgaWQgaWYgdXJpIGludm9rZXMgYSBjb21tYW5kLCBzbyBkZWZhdWx0ICdPcGVuIGxhdW5jaC5qc29uJyBjb21tYW5kIGlzIHN1cHByZXNzZWQgb24gZGlhbG9nXG5cdFx0XHRjb25zdCBhY3Rpb25JZCA9IHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuY29tbWFuZCA/ICdkZWJ1Zy5tb3JlSW5mby5jb21tYW5kJyA6ICdkZWJ1Zy5tb3JlSW5mbyc7XG5cdFx0XHRyZXR1cm4gY3JlYXRlRXJyb3JXaXRoQWN0aW9ucyh1c2VyTWVzc2FnZSwgW3RvQWN0aW9uKHsgaWQ6IGFjdGlvbklkLCBsYWJlbCwgcnVuOiAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3Blbih1cmksIHsgYWxsb3dDb21tYW5kczogdHJ1ZSB9KSB9KV0pO1xuXHRcdH1cblx0XHRpZiAoc2hvd0Vycm9ycyAmJiBlcnJvciAmJiBlcnJvci5mb3JtYXQgJiYgZXJyb3Iuc2hvd1VzZXIpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcih1c2VyTWVzc2FnZSk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBlcnJvcnMuRXJyb3JOb1RlbGVtZXRyeSh1c2VyTWVzc2FnZSk7XG5cdFx0KHJlc3VsdCBhcyB7IHNob3dVc2VyPzogYm9vbGVhbiB9KS5zaG93VXNlciA9IGVycm9yPy5zaG93VXNlcjtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIG1lcmdlQ2FwYWJpbGl0aWVzKGNhcGFiaWxpdGllczogRGVidWdQcm90b2NvbC5DYXBhYmlsaXRpZXMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoY2FwYWJpbGl0aWVzKSB7XG5cdFx0XHR0aGlzLl9jYXBhYmlsaXRpZXMgPSBvYmplY3RzLm1peGluKHRoaXMuX2NhcGFiaWxpdGllcywgY2FwYWJpbGl0aWVzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZpcmVTaW11bGF0ZWRDb250aW51ZWRFdmVudCh0aHJlYWRJZDogbnVtYmVyLCBhbGxUaHJlYWRzQ29udGludWVkID0gZmFsc2UpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENvbnRpbnVlZC5maXJlKHtcblx0XHRcdHR5cGU6ICdldmVudCcsXG5cdFx0XHRldmVudDogJ2NvbnRpbnVlZCcsXG5cdFx0XHRib2R5OiB7XG5cdFx0XHRcdHRocmVhZElkLFxuXHRcdFx0XHRhbGxUaHJlYWRzQ29udGludWVkXG5cdFx0XHR9LFxuXHRcdFx0c2VxOiB1bmRlZmluZWQhXG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMudG9EaXNwb3NlLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBZ0IsZUFBZTtBQUMvQixZQUFZLGFBQWE7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsV0FBVyxtQkFBbUI7QUFFdkMsU0FBUyxrQ0FBOEQ7QUFDdkUsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQW9DO0FBRTdDLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWU7QUFxQmpCLElBQU0sa0JBQU4sTUFBNkM7QUFBQSxFQXlDbkQsWUFDQyxjQUNnQixNQUNDLFdBQ0EsTUFDNEIsMkJBQ1osZUFDTSxxQkFDTixlQUNoQztBQVBlO0FBQ0M7QUFDQTtBQUM0QjtBQUNaO0FBQ007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
