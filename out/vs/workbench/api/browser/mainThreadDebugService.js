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
import { DisposableMap, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { URI as uri } from "../../../base/common/uri.js";
import { IDebugService, IDebugVisualization, DataBreakpointSetType } from "../../contrib/debug/common/debug.js";
import {
  ExtHostContext,
  MainContext
} from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import severity from "../../../base/common/severity.js";
import { AbstractDebugAdapter } from "../../contrib/debug/common/abstractDebugAdapter.js";
import { convertToVSCPaths, convertToDAPaths, isSessionAttach } from "../../contrib/debug/common/debugUtils.js";
import { ErrorNoTelemetry } from "../../../base/common/errors.js";
import { IDebugVisualizerService } from "../../contrib/debug/common/debugVisualizers.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { Event } from "../../../base/common/event.js";
import { isDefined } from "../../../base/common/types.js";
let MainThreadDebugService = class {
  constructor(extHostContext, debugService, visualizerService) {
    this.debugService = debugService;
    this.visualizerService = visualizerService;
    this._toDispose = new DisposableStore();
    this._debugAdaptersHandleCounter = 1;
    this._visualizerHandles = /* @__PURE__ */ new Map();
    this._visualizerTreeHandles = /* @__PURE__ */ new Map();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDebugService);
    const sessionListeners = new DisposableMap();
    this._toDispose.add(sessionListeners);
    this._toDispose.add(debugService.onDidNewSession((session) => {
      this._proxy.$acceptDebugSessionStarted(this.getSessionDto(session));
      const store = sessionListeners.get(session);
      store?.add(session.onDidChangeName((name) => {
        this._proxy.$acceptDebugSessionNameChanged(this.getSessionDto(session), name);
      }));
    }));
    this._toDispose.add(debugService.onWillNewSession((session) => {
      let store = sessionListeners.get(session);
      if (!store) {
        store = new DisposableStore();
        sessionListeners.set(session, store);
      }
      store.add(session.onDidCustomEvent((event) => this._proxy.$acceptDebugSessionCustomEvent(this.getSessionDto(session), event)));
    }));
    this._toDispose.add(debugService.onDidEndSession(({ session, restart }) => {
      this._proxy.$acceptDebugSessionTerminated(this.getSessionDto(session));
      this._extHostKnownSessions.delete(session.getId());
      if (!restart) {
        sessionListeners.deleteAndDispose(session);
      }
      for (const [handle, value] of this._debugAdapters) {
        if (value.session === session) {
          this._debugAdapters.delete(handle);
        }
      }
    }));
    this._toDispose.add(debugService.getViewModel().onDidFocusSession((session) => {
      this._proxy.$acceptDebugSessionActiveChanged(this.getSessionDto(session));
    }));
    this._toDispose.add(toDisposable(() => {
      for (const [handle, da] of this._debugAdapters) {
        da.fireError(handle, new Error("Extension host shut down"));
      }
    }));
    this._debugAdapters = /* @__PURE__ */ new Map();
    this._debugConfigurationProviders = /* @__PURE__ */ new Map();
    this._debugAdapterDescriptorFactories = /* @__PURE__ */ new Map();
    this._extHostKnownSessions = /* @__PURE__ */ new Set();
    const viewModel = this.debugService.getViewModel();
    this._toDispose.add(Event.any(viewModel.onDidFocusStackFrame, viewModel.onDidFocusThread)(() => {
      const stackFrame = viewModel.focusedStackFrame;
      const thread = viewModel.focusedThread;
      if (stackFrame) {
        this._proxy.$acceptStackFrameFocus({
          kind: "stackFrame",
          threadId: stackFrame.thread.threadId,
          frameId: stackFrame.frameId,
          sessionId: stackFrame.thread.session.getId()
        });
      } else if (thread) {
        this._proxy.$acceptStackFrameFocus({
          kind: "thread",
          threadId: thread.threadId,
          sessionId: thread.session.getId()
        });
      } else {
        this._proxy.$acceptStackFrameFocus(void 0);
      }
    }));
    this.sendBreakpointsAndListen();
  }
  $registerDebugVisualizerTree(treeId, canEdit) {
    this._visualizerTreeHandles.set(treeId, this.visualizerService.registerTree(treeId, {
      disposeItem: (id) => this._proxy.$disposeVisualizedTree(id),
      getChildren: (e) => this._proxy.$getVisualizerTreeItemChildren(treeId, e),
      getTreeItem: (e) => this._proxy.$getVisualizerTreeItem(treeId, e),
      editItem: canEdit ? ((e, v) => this._proxy.$editVisualizerTreeItem(e, v)) : void 0
    }));
  }
  $unregisterDebugVisualizerTree(treeId) {
    this._visualizerTreeHandles.get(treeId)?.dispose();
    this._visualizerTreeHandles.delete(treeId);
  }
  $registerDebugVisualizer(extensionId, id) {
    const handle = this.visualizerService.register({
      extensionId: new ExtensionIdentifier(extensionId),
      id,
      disposeDebugVisualizers: (ids) => this._proxy.$disposeDebugVisualizers(ids),
      executeDebugVisualizerCommand: (id2) => this._proxy.$executeDebugVisualizerCommand(id2),
      provideDebugVisualizers: (context, token) => this._proxy.$provideDebugVisualizers(extensionId, id, context, token).then((r) => r.map(IDebugVisualization.deserialize)),
      resolveDebugVisualizer: (viz, token) => this._proxy.$resolveDebugVisualizer(viz.id, token)
    });
    this._visualizerHandles.set(`${extensionId}/${id}`, handle);
  }
  $unregisterDebugVisualizer(extensionId, id) {
    const key = `${extensionId}/${id}`;
    this._visualizerHandles.get(key)?.dispose();
    this._visualizerHandles.delete(key);
  }
  sendBreakpointsAndListen() {
    this._toDispose.add(this.debugService.getModel().onDidChangeBreakpoints((e) => {
      if (e && !e.sessionOnly) {
        const delta = {};
        if (e.added) {
          delta.added = this.convertToDto(e.added);
        }
        if (e.removed) {
          delta.removed = e.removed.map((x) => x.getId());
        }
        if (e.changed) {
          delta.changed = this.convertToDto(e.changed);
        }
        if (delta.added || delta.removed || delta.changed) {
          this._proxy.$acceptBreakpointsDelta(delta);
        }
      }
    }));
    const bps = this.debugService.getModel().getBreakpoints();
    const fbps = this.debugService.getModel().getFunctionBreakpoints();
    const dbps = this.debugService.getModel().getDataBreakpoints();
    if (bps.length > 0 || fbps.length > 0) {
      this._proxy.$acceptBreakpointsDelta({
        added: this.convertToDto(bps).concat(this.convertToDto(fbps)).concat(this.convertToDto(dbps))
      });
    }
  }
  dispose() {
    this._toDispose.dispose();
  }
  // interface IDebugAdapterProvider
  createDebugAdapter(session) {
    const handle = this._debugAdaptersHandleCounter++;
    const da = new ExtensionHostDebugAdapter(this, handle, this._proxy, session);
    this._debugAdapters.set(handle, da);
    return da;
  }
  substituteVariables(folder, config) {
    return Promise.resolve(this._proxy.$substituteVariables(folder ? folder.uri : void 0, config));
  }
  runInTerminal(args, sessionId) {
    return this._proxy.$runInTerminal(args, sessionId);
  }
  // RPC methods (MainThreadDebugServiceShape)
  $registerDebugTypes(debugTypes) {
    this._toDispose.add(this.debugService.getAdapterManager().registerDebugAdapterFactory(debugTypes, this));
  }
  $registerBreakpoints(DTOs) {
    for (const dto of DTOs) {
      if (dto.type === "sourceMulti") {
        const rawbps = dto.lines.map((l) => ({
          id: l.id,
          enabled: l.enabled,
          lineNumber: l.line + 1,
          column: l.character > 0 ? l.character + 1 : void 0,
          // a column value of 0 results in an omitted column attribute; see #46784
          condition: l.condition,
          hitCondition: l.hitCondition,
          logMessage: l.logMessage,
          mode: l.mode
        }));
        this.debugService.addBreakpoints(uri.revive(dto.uri), rawbps);
      } else if (dto.type === "function") {
        this.debugService.addFunctionBreakpoint({
          name: dto.functionName,
          mode: dto.mode,
          condition: dto.condition,
          hitCondition: dto.hitCondition,
          enabled: dto.enabled,
          logMessage: dto.logMessage
        }, dto.id);
      } else if (dto.type === "data") {
        this.debugService.addDataBreakpoint({
          description: dto.label,
          src: { type: DataBreakpointSetType.Variable, dataId: dto.dataId },
          canPersist: dto.canPersist,
          accessTypes: dto.accessTypes,
          accessType: dto.accessType,
          mode: dto.mode
        });
      }
    }
    return Promise.resolve();
  }
  $unregisterBreakpoints(breakpointIds, functionBreakpointIds, dataBreakpointIds) {
    breakpointIds.forEach((id) => this.debugService.removeBreakpoints(id));
    functionBreakpointIds.forEach((id) => this.debugService.removeFunctionBreakpoints(id));
    dataBreakpointIds.forEach((id) => this.debugService.removeDataBreakpoints(id));
    return Promise.resolve();
  }
  $registerDebugConfigurationProvider(debugType, providerTriggerKind, hasProvide, hasResolve, hasResolve2, handle) {
    const provider = {
      type: debugType,
      triggerKind: providerTriggerKind
    };
    if (hasProvide) {
      provider.provideDebugConfigurations = (folder, token) => {
        return this._proxy.$provideDebugConfigurations(handle, folder, token);
      };
    }
    if (hasResolve) {
      provider.resolveDebugConfiguration = (folder, config, token) => {
        return this._proxy.$resolveDebugConfiguration(handle, folder, config, token);
      };
    }
    if (hasResolve2) {
      provider.resolveDebugConfigurationWithSubstitutedVariables = (folder, config, token) => {
        return this._proxy.$resolveDebugConfigurationWithSubstitutedVariables(handle, folder, config, token);
      };
    }
    this._debugConfigurationProviders.set(handle, provider);
    this._toDispose.add(this.debugService.getConfigurationManager().registerDebugConfigurationProvider(provider));
    return Promise.resolve(void 0);
  }
  $unregisterDebugConfigurationProvider(handle) {
    const provider = this._debugConfigurationProviders.get(handle);
    if (provider) {
      this._debugConfigurationProviders.delete(handle);
      this.debugService.getConfigurationManager().unregisterDebugConfigurationProvider(provider);
    }
  }
  $registerDebugAdapterDescriptorFactory(debugType, handle) {
    const provider = {
      type: debugType,
      createDebugAdapterDescriptor: (session) => {
        return Promise.resolve(this._proxy.$provideDebugAdapter(handle, this.getSessionDto(session)));
      }
    };
    this._debugAdapterDescriptorFactories.set(handle, provider);
    this._toDispose.add(this.debugService.getAdapterManager().registerDebugAdapterDescriptorFactory(provider));
    return Promise.resolve(void 0);
  }
  $unregisterDebugAdapterDescriptorFactory(handle) {
    const provider = this._debugAdapterDescriptorFactories.get(handle);
    if (provider) {
      this._debugAdapterDescriptorFactories.delete(handle);
      this.debugService.getAdapterManager().unregisterDebugAdapterDescriptorFactory(provider);
    }
  }
  getSession(sessionId) {
    if (sessionId) {
      return this.debugService.getModel().getSession(sessionId, true);
    }
    return void 0;
  }
  async $startDebugging(folder, nameOrConfig, options) {
    const folderUri = folder ? uri.revive(folder) : void 0;
    const launch = this.debugService.getConfigurationManager().getLaunch(folderUri);
    const parentSession = this.getSession(options.parentSessionID);
    const saveBeforeStart = typeof options.suppressSaveBeforeStart === "boolean" ? !options.suppressSaveBeforeStart : void 0;
    const debugOptions = {
      noDebug: options.noDebug,
      parentSession,
      lifecycleManagedByParent: options.lifecycleManagedByParent,
      repl: options.repl,
      compact: options.compact,
      compoundRoot: parentSession?.compoundRoot,
      saveBeforeRestart: saveBeforeStart,
      testRun: options.testRun,
      suppressDebugStatusbar: options.suppressDebugStatusbar,
      suppressDebugToolbar: options.suppressDebugToolbar,
      suppressDebugView: options.suppressDebugView
    };
    try {
      return this.debugService.startDebugging(launch, nameOrConfig, debugOptions, saveBeforeStart);
    } catch (err) {
      throw new ErrorNoTelemetry(err && err.message ? err.message : "cannot start debugging");
    }
  }
  $setDebugSessionName(sessionId, name) {
    const session = this.debugService.getModel().getSession(sessionId);
    session?.setName(name);
  }
  $customDebugAdapterRequest(sessionId, request, args) {
    const session = this.debugService.getModel().getSession(sessionId, true);
    if (session) {
      return session.customRequest(request, args).then((response) => {
        if (response && response.success) {
          return response.body;
        } else {
          return Promise.reject(new ErrorNoTelemetry(response ? response.message : "custom request failed"));
        }
      });
    }
    return Promise.reject(new ErrorNoTelemetry("debug session not found"));
  }
  $getDebugProtocolBreakpoint(sessionId, breakpoinId) {
    const session = this.debugService.getModel().getSession(sessionId, true);
    if (session) {
      return Promise.resolve(session.getDebugProtocolBreakpoint(breakpoinId));
    }
    return Promise.reject(new ErrorNoTelemetry("debug session not found"));
  }
  $stopDebugging(sessionId) {
    if (sessionId) {
      const session = this.debugService.getModel().getSession(sessionId, true);
      if (session) {
        return this.debugService.stopSession(session, isSessionAttach(session));
      }
    } else {
      return this.debugService.stopSession(void 0);
    }
    return Promise.reject(new ErrorNoTelemetry("debug session not found"));
  }
  $appendDebugConsole(value) {
    const session = this.debugService.getViewModel().focusedSession;
    session?.appendToRepl({ output: value, sev: severity.Warning });
  }
  $acceptDAMessage(handle, message) {
    this.getDebugAdapter(handle).acceptMessage(convertToVSCPaths(message, false));
  }
  $acceptDAError(handle, name, message, stack) {
    this._debugAdapters.get(handle)?.fireError(handle, new Error(`${name}: ${message}
${stack}`));
  }
  $acceptDAExit(handle, code, signal) {
    this._debugAdapters.get(handle)?.fireExit(handle, code, signal);
  }
  getDebugAdapter(handle) {
    const adapter = this._debugAdapters.get(handle);
    if (!adapter) {
      throw new Error("Invalid debug adapter");
    }
    return adapter;
  }
  // dto helpers
  $sessionCached(sessionID) {
    this._extHostKnownSessions.add(sessionID);
  }
  getSessionDto(session) {
    if (session) {
      const sessionID = session.getId();
      if (this._extHostKnownSessions.has(sessionID)) {
        return sessionID;
      } else {
        return {
          id: sessionID,
          type: session.configuration.type,
          name: session.name,
          folderUri: session.root ? session.root.uri : void 0,
          configuration: session.configuration,
          parent: session.parentSession?.getId()
        };
      }
    }
    return void 0;
  }
  convertToDto(bps) {
    return bps.map((bp) => {
      if ("name" in bp) {
        const fbp = bp;
        return {
          type: "function",
          id: fbp.getId(),
          enabled: fbp.enabled,
          condition: fbp.condition,
          hitCondition: fbp.hitCondition,
          logMessage: fbp.logMessage,
          functionName: fbp.name
        };
      } else if ("src" in bp) {
        const dbp = bp;
        return {
          type: "data",
          id: dbp.getId(),
          dataId: dbp.src.type === DataBreakpointSetType.Variable ? dbp.src.dataId : dbp.src.address,
          enabled: dbp.enabled,
          condition: dbp.condition,
          hitCondition: dbp.hitCondition,
          logMessage: dbp.logMessage,
          accessType: dbp.accessType,
          label: dbp.description,
          canPersist: dbp.canPersist
        };
      } else if ("uri" in bp) {
        const sbp = bp;
        return {
          type: "source",
          id: sbp.getId(),
          enabled: sbp.enabled,
          condition: sbp.condition,
          hitCondition: sbp.hitCondition,
          logMessage: sbp.logMessage,
          uri: sbp.uri,
          line: sbp.lineNumber > 0 ? sbp.lineNumber - 1 : 0,
          character: typeof sbp.column === "number" && sbp.column > 0 ? sbp.column - 1 : 0
        };
      } else {
        return void 0;
      }
    }).filter(isDefined);
  }
};
MainThreadDebugService = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadDebugService),
  __decorateParam(1, IDebugService),
  __decorateParam(2, IDebugVisualizerService)
], MainThreadDebugService);
class ExtensionHostDebugAdapter extends AbstractDebugAdapter {
  constructor(_ds, _handle, _proxy, session) {
    super();
    this._ds = _ds;
    this._handle = _handle;
    this._proxy = _proxy;
    this.session = session;
  }
  fireError(handle, err) {
    this._onError.fire(err);
  }
  fireExit(handle, code, signal) {
    this._onExit.fire(code);
  }
  startSession() {
    return Promise.resolve(this._proxy.$startDASession(this._handle, this._ds.getSessionDto(this.session)));
  }
  sendMessage(message) {
    this._proxy.$sendDAMessage(this._handle, convertToDAPaths(message, true));
  }
  async stopSession() {
    await this.cancelPendingRequests();
    return Promise.resolve(this._proxy.$stopDASession(this._handle));
  }
}
export {
  MainThreadDebugService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkRGVidWdTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSBhcyB1cmksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSURlYnVnU2VydmljZSwgSUNvbmZpZywgSURlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyLCBJQnJlYWtwb2ludCwgSUZ1bmN0aW9uQnJlYWtwb2ludCwgSUJyZWFrcG9pbnREYXRhLCBJRGVidWdBZGFwdGVyLCBJRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnksIElEZWJ1Z1Nlc3Npb24sIElEZWJ1Z0FkYXB0ZXJGYWN0b3J5LCBJRGF0YUJyZWFrcG9pbnQsIElEZWJ1Z1Nlc3Npb25PcHRpb25zLCBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50LCBEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlclRyaWdnZXJLaW5kLCBJRGVidWdWaXN1YWxpemF0aW9uLCBEYXRhQnJlYWtwb2ludFNldFR5cGUgfSBmcm9tICcuLi8uLi9jb250cmliL2RlYnVnL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQge1xuXHRFeHRIb3N0Q29udGV4dCwgRXh0SG9zdERlYnVnU2VydmljZVNoYXBlLCBNYWluVGhyZWFkRGVidWdTZXJ2aWNlU2hhcGUsIERlYnVnU2Vzc2lvblVVSUQsIE1haW5Db250ZXh0LFxuXHRJQnJlYWtwb2ludHNEZWx0YUR0bywgSVNvdXJjZU11bHRpQnJlYWtwb2ludER0bywgSVNvdXJjZUJyZWFrcG9pbnREdG8sIElGdW5jdGlvbkJyZWFrcG9pbnREdG8sIElEZWJ1Z1Nlc3Npb25EdG8sIElEYXRhQnJlYWtwb2ludER0bywgSVN0YXJ0RGVidWdnaW5nT3B0aW9ucywgSURlYnVnQ29uZmlndXJhdGlvbiwgSVRocmVhZEZvY3VzRHRvLCBJU3RhY2tGcmFtZUZvY3VzRHRvXG59IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IGV4dEhvc3ROYW1lZEN1c3RvbWVyLCBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCBzZXZlcml0eSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdERlYnVnQWRhcHRlciB9IGZyb20gJy4uLy4uL2NvbnRyaWIvZGVidWcvY29tbW9uL2Fic3RyYWN0RGVidWdBZGFwdGVyLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBjb252ZXJ0VG9WU0NQYXRocywgY29udmVydFRvREFQYXRocywgaXNTZXNzaW9uQXR0YWNoIH0gZnJvbSAnLi4vLi4vY29udHJpYi9kZWJ1Zy9jb21tb24vZGVidWdVdGlscy5qcyc7XG5pbXBvcnQgeyBFcnJvck5vVGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElEZWJ1Z1Zpc3VhbGl6ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9kZWJ1Zy9jb21tb24vZGVidWdWaXN1YWxpemVycy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWREZWJ1Z1NlcnZpY2UpXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZERlYnVnU2VydmljZSBpbXBsZW1lbnRzIE1haW5UaHJlYWREZWJ1Z1NlcnZpY2VTaGFwZSwgSURlYnVnQWRhcHRlckZhY3Rvcnkge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0RGVidWdTZXJ2aWNlU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVidWdBZGFwdGVyczogTWFwPG51bWJlciwgRXh0ZW5zaW9uSG9zdERlYnVnQWRhcHRlcj47XG5cdHByaXZhdGUgX2RlYnVnQWRhcHRlcnNIYW5kbGVDb3VudGVyID0gMTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJzOiBNYXA8bnVtYmVyLCBJRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXI+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yaWVzOiBNYXA8bnVtYmVyLCBJRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3Rvcnk+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0S25vd25TZXNzaW9uczogU2V0PERlYnVnU2Vzc2lvblVVSUQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aXN1YWxpemVySGFuZGxlcyA9IG5ldyBNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlzdWFsaXplclRyZWVIYW5kbGVzID0gbmV3IE1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElEZWJ1Z1Zpc3VhbGl6ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlzdWFsaXplclNlcnZpY2U6IElEZWJ1Z1Zpc3VhbGl6ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3REZWJ1Z1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbkxpc3RlbmVycyA9IG5ldyBEaXNwb3NhYmxlTWFwPElEZWJ1Z1Nlc3Npb24sIERpc3Bvc2FibGVTdG9yZT4oKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHNlc3Npb25MaXN0ZW5lcnMpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQoZGVidWdTZXJ2aWNlLm9uRGlkTmV3U2Vzc2lvbihzZXNzaW9uID0+IHtcblx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHREZWJ1Z1Nlc3Npb25TdGFydGVkKHRoaXMuZ2V0U2Vzc2lvbkR0byhzZXNzaW9uKSk7XG5cdFx0XHRjb25zdCBzdG9yZSA9IHNlc3Npb25MaXN0ZW5lcnMuZ2V0KHNlc3Npb24pO1xuXHRcdFx0c3RvcmU/LmFkZChzZXNzaW9uLm9uRGlkQ2hhbmdlTmFtZShuYW1lID0+IHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdERlYnVnU2Vzc2lvbk5hbWVDaGFuZ2VkKHRoaXMuZ2V0U2Vzc2lvbkR0byhzZXNzaW9uKSwgbmFtZSk7XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHRcdC8vIE5lZWQgdG8gc3RhcnQgbGlzdGVuaW5nIGVhcmx5IHRvIG5ldyBzZXNzaW9uIGV2ZW50cyBiZWNhdXNlIGEgY3VzdG9tIGV2ZW50IGNhbiBjb21lIHdoaWxlIGEgc2Vzc2lvbiBpcyBpbml0aWFsaXNpbmdcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKGRlYnVnU2VydmljZS5vbldpbGxOZXdTZXNzaW9uKHNlc3Npb24gPT4ge1xuXHRcdFx0bGV0IHN0b3JlID0gc2Vzc2lvbkxpc3RlbmVycy5nZXQoc2Vzc2lvbik7XG5cdFx0XHRpZiAoIXN0b3JlKSB7XG5cdFx0XHRcdHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRzZXNzaW9uTGlzdGVuZXJzLnNldChzZXNzaW9uLCBzdG9yZSk7XG5cdFx0XHR9XG5cdFx0XHRzdG9yZS5hZGQoc2Vzc2lvbi5vbkRpZEN1c3RvbUV2ZW50KGV2ZW50ID0+IHRoaXMuX3Byb3h5LiRhY2NlcHREZWJ1Z1Nlc3Npb25DdXN0b21FdmVudCh0aGlzLmdldFNlc3Npb25EdG8oc2Vzc2lvbiksIGV2ZW50KSkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKGRlYnVnU2VydmljZS5vbkRpZEVuZFNlc3Npb24oKHsgc2Vzc2lvbiwgcmVzdGFydCB9KSA9PiB7XG5cdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0RGVidWdTZXNzaW9uVGVybWluYXRlZCh0aGlzLmdldFNlc3Npb25EdG8oc2Vzc2lvbikpO1xuXHRcdFx0dGhpcy5fZXh0SG9zdEtub3duU2Vzc2lvbnMuZGVsZXRlKHNlc3Npb24uZ2V0SWQoKSk7XG5cblx0XHRcdC8vIGtlZXAgdGhlIHNlc3Npb24gbGlzdGVuZXJzIGFyb3VuZCBzaW5jZSB3ZSBzdGlsbCB3aWxsIGdldCBldmVudHMgYWZ0ZXIgdGhleSByZXN0YXJ0XG5cdFx0XHRpZiAoIXJlc3RhcnQpIHtcblx0XHRcdFx0c2Vzc2lvbkxpc3RlbmVycy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb24pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBhbnkgcmVzdGFydGVkIHNlc3Npb24gd2lsbCBjcmVhdGUgYSBuZXcgREEsIHNvIGFsd2F5cyB0aHJvdyB0aGUgb2xkIG9uZSBhd2F5LlxuXHRcdFx0Zm9yIChjb25zdCBbaGFuZGxlLCB2YWx1ZV0gb2YgdGhpcy5fZGVidWdBZGFwdGVycykge1xuXHRcdFx0XHRpZiAodmFsdWUuc2Vzc2lvbiA9PT0gc2Vzc2lvbikge1xuXHRcdFx0XHRcdHRoaXMuX2RlYnVnQWRhcHRlcnMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHRcdFx0Ly8gYnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZChkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkub25EaWRGb2N1c1Nlc3Npb24oc2Vzc2lvbiA9PiB7XG5cdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0RGVidWdTZXNzaW9uQWN0aXZlQ2hhbmdlZCh0aGlzLmdldFNlc3Npb25EdG8oc2Vzc2lvbikpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IFtoYW5kbGUsIGRhXSBvZiB0aGlzLl9kZWJ1Z0FkYXB0ZXJzKSB7XG5cdFx0XHRcdGRhLmZpcmVFcnJvcihoYW5kbGUsIG5ldyBFcnJvcignRXh0ZW5zaW9uIGhvc3Qgc2h1dCBkb3duJykpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2RlYnVnQWRhcHRlcnMgPSBuZXcgTWFwKCk7XG5cdFx0dGhpcy5fZGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJzID0gbmV3IE1hcCgpO1xuXHRcdHRoaXMuX2RlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3JpZXMgPSBuZXcgTWFwKCk7XG5cdFx0dGhpcy5fZXh0SG9zdEtub3duU2Vzc2lvbnMgPSBuZXcgU2V0KCk7XG5cblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKEV2ZW50LmFueSh2aWV3TW9kZWwub25EaWRGb2N1c1N0YWNrRnJhbWUsIHZpZXdNb2RlbC5vbkRpZEZvY3VzVGhyZWFkKSgoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGFja0ZyYW1lID0gdmlld01vZGVsLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdFx0Y29uc3QgdGhyZWFkID0gdmlld01vZGVsLmZvY3VzZWRUaHJlYWQ7XG5cdFx0XHRpZiAoc3RhY2tGcmFtZSkge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0U3RhY2tGcmFtZUZvY3VzKHtcblx0XHRcdFx0XHRraW5kOiAnc3RhY2tGcmFtZScsXG5cdFx0XHRcdFx0dGhyZWFkSWQ6IHN0YWNrRnJhbWUudGhyZWFkLnRocmVhZElkLFxuXHRcdFx0XHRcdGZyYW1lSWQ6IHN0YWNrRnJhbWUuZnJhbWVJZCxcblx0XHRcdFx0XHRzZXNzaW9uSWQ6IHN0YWNrRnJhbWUudGhyZWFkLnNlc3Npb24uZ2V0SWQoKSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVN0YWNrRnJhbWVGb2N1c0R0byk7XG5cdFx0XHR9IGVsc2UgaWYgKHRocmVhZCkge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0U3RhY2tGcmFtZUZvY3VzKHtcblx0XHRcdFx0XHRraW5kOiAndGhyZWFkJyxcblx0XHRcdFx0XHR0aHJlYWRJZDogdGhyZWFkLnRocmVhZElkLFxuXHRcdFx0XHRcdHNlc3Npb25JZDogdGhyZWFkLnNlc3Npb24uZ2V0SWQoKSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVRocmVhZEZvY3VzRHRvKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRTdGFja0ZyYW1lRm9jdXModW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnNlbmRCcmVha3BvaW50c0FuZExpc3RlbigpO1xuXHR9XG5cblx0JHJlZ2lzdGVyRGVidWdWaXN1YWxpemVyVHJlZSh0cmVlSWQ6IHN0cmluZywgY2FuRWRpdDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3Zpc3VhbGl6ZXJUcmVlSGFuZGxlcy5zZXQodHJlZUlkLCB0aGlzLnZpc3VhbGl6ZXJTZXJ2aWNlLnJlZ2lzdGVyVHJlZSh0cmVlSWQsIHtcblx0XHRcdGRpc3Bvc2VJdGVtOiBpZCA9PiB0aGlzLl9wcm94eS4kZGlzcG9zZVZpc3VhbGl6ZWRUcmVlKGlkKSxcblx0XHRcdGdldENoaWxkcmVuOiBlID0+IHRoaXMuX3Byb3h5LiRnZXRWaXN1YWxpemVyVHJlZUl0ZW1DaGlsZHJlbih0cmVlSWQsIGUpLFxuXHRcdFx0Z2V0VHJlZUl0ZW06IGUgPT4gdGhpcy5fcHJveHkuJGdldFZpc3VhbGl6ZXJUcmVlSXRlbSh0cmVlSWQsIGUpLFxuXHRcdFx0ZWRpdEl0ZW06IGNhbkVkaXQgPyAoKGUsIHYpID0+IHRoaXMuX3Byb3h5LiRlZGl0VmlzdWFsaXplclRyZWVJdGVtKGUsIHYpKSA6IHVuZGVmaW5lZFxuXHRcdH0pKTtcblx0fVxuXG5cdCR1bnJlZ2lzdGVyRGVidWdWaXN1YWxpemVyVHJlZSh0cmVlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3Zpc3VhbGl6ZXJUcmVlSGFuZGxlcy5nZXQodHJlZUlkKT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Zpc3VhbGl6ZXJUcmVlSGFuZGxlcy5kZWxldGUodHJlZUlkKTtcblx0fVxuXG5cdCRyZWdpc3RlckRlYnVnVmlzdWFsaXplcihleHRlbnNpb25JZDogc3RyaW5nLCBpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy52aXN1YWxpemVyU2VydmljZS5yZWdpc3Rlcih7XG5cdFx0XHRleHRlbnNpb25JZDogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoZXh0ZW5zaW9uSWQpLFxuXHRcdFx0aWQsXG5cdFx0XHRkaXNwb3NlRGVidWdWaXN1YWxpemVyczogaWRzID0+IHRoaXMuX3Byb3h5LiRkaXNwb3NlRGVidWdWaXN1YWxpemVycyhpZHMpLFxuXHRcdFx0ZXhlY3V0ZURlYnVnVmlzdWFsaXplckNvbW1hbmQ6IGlkID0+IHRoaXMuX3Byb3h5LiRleGVjdXRlRGVidWdWaXN1YWxpemVyQ29tbWFuZChpZCksXG5cdFx0XHRwcm92aWRlRGVidWdWaXN1YWxpemVyczogKGNvbnRleHQsIHRva2VuKSA9PiB0aGlzLl9wcm94eS4kcHJvdmlkZURlYnVnVmlzdWFsaXplcnMoZXh0ZW5zaW9uSWQsIGlkLCBjb250ZXh0LCB0b2tlbikudGhlbihyID0+IHIubWFwKElEZWJ1Z1Zpc3VhbGl6YXRpb24uZGVzZXJpYWxpemUpKSxcblx0XHRcdHJlc29sdmVEZWJ1Z1Zpc3VhbGl6ZXI6ICh2aXosIHRva2VuKSA9PiB0aGlzLl9wcm94eS4kcmVzb2x2ZURlYnVnVmlzdWFsaXplcih2aXouaWQsIHRva2VuKSxcblx0XHR9KTtcblx0XHR0aGlzLl92aXN1YWxpemVySGFuZGxlcy5zZXQoYCR7ZXh0ZW5zaW9uSWR9LyR7aWR9YCwgaGFuZGxlKTtcblx0fVxuXG5cdCR1bnJlZ2lzdGVyRGVidWdWaXN1YWxpemVyKGV4dGVuc2lvbklkOiBzdHJpbmcsIGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBgJHtleHRlbnNpb25JZH0vJHtpZH1gO1xuXHRcdHRoaXMuX3Zpc3VhbGl6ZXJIYW5kbGVzLmdldChrZXkpPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fdmlzdWFsaXplckhhbmRsZXMuZGVsZXRlKGtleSk7XG5cdH1cblxuXHRwcml2YXRlIHNlbmRCcmVha3BvaW50c0FuZExpc3RlbigpOiB2b2lkIHtcblx0XHQvLyBzZXQgdXAgYSBoYW5kbGVyIHRvIHNlbmQgbW9yZVxuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5vbkRpZENoYW5nZUJyZWFrcG9pbnRzKGUgPT4ge1xuXHRcdFx0Ly8gSWdub3JlIHNlc3Npb24gb25seSBicmVha3BvaW50IGV2ZW50cyBzaW5jZSB0aGV5IHNob3VsZCBvbmx5IHJlZmxlY3QgaW4gdGhlIFVJXG5cdFx0XHRpZiAoZSAmJiAhZS5zZXNzaW9uT25seSkge1xuXHRcdFx0XHRjb25zdCBkZWx0YTogSUJyZWFrcG9pbnRzRGVsdGFEdG8gPSB7fTtcblx0XHRcdFx0aWYgKGUuYWRkZWQpIHtcblx0XHRcdFx0XHRkZWx0YS5hZGRlZCA9IHRoaXMuY29udmVydFRvRHRvKGUuYWRkZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLnJlbW92ZWQpIHtcblx0XHRcdFx0XHRkZWx0YS5yZW1vdmVkID0gZS5yZW1vdmVkLm1hcCh4ID0+IHguZ2V0SWQoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUuY2hhbmdlZCkge1xuXHRcdFx0XHRcdGRlbHRhLmNoYW5nZWQgPSB0aGlzLmNvbnZlcnRUb0R0byhlLmNoYW5nZWQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGRlbHRhLmFkZGVkIHx8IGRlbHRhLnJlbW92ZWQgfHwgZGVsdGEuY2hhbmdlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRCcmVha3BvaW50c0RlbHRhKGRlbHRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIHNlbmQgYWxsIGJyZWFrcG9pbnRzXG5cdFx0Y29uc3QgYnBzID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50cygpO1xuXHRcdGNvbnN0IGZicHMgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldEZ1bmN0aW9uQnJlYWtwb2ludHMoKTtcblx0XHRjb25zdCBkYnBzID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXREYXRhQnJlYWtwb2ludHMoKTtcblx0XHRpZiAoYnBzLmxlbmd0aCA+IDAgfHwgZmJwcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0QnJlYWtwb2ludHNEZWx0YSh7XG5cdFx0XHRcdGFkZGVkOiB0aGlzLmNvbnZlcnRUb0R0byhicHMpLmNvbmNhdCh0aGlzLmNvbnZlcnRUb0R0byhmYnBzKSkuY29uY2F0KHRoaXMuY29udmVydFRvRHRvKGRicHMpKVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8vIGludGVyZmFjZSBJRGVidWdBZGFwdGVyUHJvdmlkZXJcblxuXHRjcmVhdGVEZWJ1Z0FkYXB0ZXIoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbik6IElEZWJ1Z0FkYXB0ZXIge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2RlYnVnQWRhcHRlcnNIYW5kbGVDb3VudGVyKys7XG5cdFx0Y29uc3QgZGEgPSBuZXcgRXh0ZW5zaW9uSG9zdERlYnVnQWRhcHRlcih0aGlzLCBoYW5kbGUsIHRoaXMuX3Byb3h5LCBzZXNzaW9uKTtcblx0XHR0aGlzLl9kZWJ1Z0FkYXB0ZXJzLnNldChoYW5kbGUsIGRhKTtcblx0XHRyZXR1cm4gZGE7XG5cdH1cblxuXHRzdWJzdGl0dXRlVmFyaWFibGVzKGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCwgY29uZmlnOiBJQ29uZmlnKTogUHJvbWlzZTxJQ29uZmlnPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLl9wcm94eS4kc3Vic3RpdHV0ZVZhcmlhYmxlcyhmb2xkZXIgPyBmb2xkZXIudXJpIDogdW5kZWZpbmVkLCBjb25maWcpKTtcblx0fVxuXG5cdHJ1bkluVGVybWluYWwoYXJnczogRGVidWdQcm90b2NvbC5SdW5JblRlcm1pbmFsUmVxdWVzdEFyZ3VtZW50cywgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kcnVuSW5UZXJtaW5hbChhcmdzLCBzZXNzaW9uSWQpO1xuXHR9XG5cblx0Ly8gUlBDIG1ldGhvZHMgKE1haW5UaHJlYWREZWJ1Z1NlcnZpY2VTaGFwZSlcblxuXHRwdWJsaWMgJHJlZ2lzdGVyRGVidWdUeXBlcyhkZWJ1Z1R5cGVzOiBzdHJpbmdbXSkge1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0QWRhcHRlck1hbmFnZXIoKS5yZWdpc3RlckRlYnVnQWRhcHRlckZhY3RvcnkoZGVidWdUeXBlcywgdGhpcykpO1xuXHR9XG5cblx0cHVibGljICRyZWdpc3RlckJyZWFrcG9pbnRzKERUT3M6IEFycmF5PElTb3VyY2VNdWx0aUJyZWFrcG9pbnREdG8gfCBJRnVuY3Rpb25CcmVha3BvaW50RHRvIHwgSURhdGFCcmVha3BvaW50RHRvPik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Zm9yIChjb25zdCBkdG8gb2YgRFRPcykge1xuXHRcdFx0aWYgKGR0by50eXBlID09PSAnc291cmNlTXVsdGknKSB7XG5cdFx0XHRcdGNvbnN0IHJhd2JwcyA9IGR0by5saW5lcy5tYXAoKGwpOiBJQnJlYWtwb2ludERhdGEgPT4gKHtcblx0XHRcdFx0XHRpZDogbC5pZCxcblx0XHRcdFx0XHRlbmFibGVkOiBsLmVuYWJsZWQsXG5cdFx0XHRcdFx0bGluZU51bWJlcjogbC5saW5lICsgMSxcblx0XHRcdFx0XHRjb2x1bW46IGwuY2hhcmFjdGVyID4gMCA/IGwuY2hhcmFjdGVyICsgMSA6IHVuZGVmaW5lZCwgLy8gYSBjb2x1bW4gdmFsdWUgb2YgMCByZXN1bHRzIGluIGFuIG9taXR0ZWQgY29sdW1uIGF0dHJpYnV0ZTsgc2VlICM0Njc4NFxuXHRcdFx0XHRcdGNvbmRpdGlvbjogbC5jb25kaXRpb24sXG5cdFx0XHRcdFx0aGl0Q29uZGl0aW9uOiBsLmhpdENvbmRpdGlvbixcblx0XHRcdFx0XHRsb2dNZXNzYWdlOiBsLmxvZ01lc3NhZ2UsXG5cdFx0XHRcdFx0bW9kZTogbC5tb2RlLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmFkZEJyZWFrcG9pbnRzKHVyaS5yZXZpdmUoZHRvLnVyaSksIHJhd2Jwcyk7XG5cdFx0XHR9IGVsc2UgaWYgKGR0by50eXBlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmFkZEZ1bmN0aW9uQnJlYWtwb2ludCh7XG5cdFx0XHRcdFx0bmFtZTogZHRvLmZ1bmN0aW9uTmFtZSxcblx0XHRcdFx0XHRtb2RlOiBkdG8ubW9kZSxcblx0XHRcdFx0XHRjb25kaXRpb246IGR0by5jb25kaXRpb24sXG5cdFx0XHRcdFx0aGl0Q29uZGl0aW9uOiBkdG8uaGl0Q29uZGl0aW9uLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IGR0by5lbmFibGVkLFxuXHRcdFx0XHRcdGxvZ01lc3NhZ2U6IGR0by5sb2dNZXNzYWdlXG5cdFx0XHRcdH0sIGR0by5pZCk7XG5cdFx0XHR9IGVsc2UgaWYgKGR0by50eXBlID09PSAnZGF0YScpIHtcblx0XHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuYWRkRGF0YUJyZWFrcG9pbnQoe1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBkdG8ubGFiZWwsXG5cdFx0XHRcdFx0c3JjOiB7IHR5cGU6IERhdGFCcmVha3BvaW50U2V0VHlwZS5WYXJpYWJsZSwgZGF0YUlkOiBkdG8uZGF0YUlkIH0sXG5cdFx0XHRcdFx0Y2FuUGVyc2lzdDogZHRvLmNhblBlcnNpc3QsXG5cdFx0XHRcdFx0YWNjZXNzVHlwZXM6IGR0by5hY2Nlc3NUeXBlcyxcblx0XHRcdFx0XHRhY2Nlc3NUeXBlOiBkdG8uYWNjZXNzVHlwZSxcblx0XHRcdFx0XHRtb2RlOiBkdG8ubW9kZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0cHVibGljICR1bnJlZ2lzdGVyQnJlYWtwb2ludHMoYnJlYWtwb2ludElkczogc3RyaW5nW10sIGZ1bmN0aW9uQnJlYWtwb2ludElkczogc3RyaW5nW10sIGRhdGFCcmVha3BvaW50SWRzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGJyZWFrcG9pbnRJZHMuZm9yRWFjaChpZCA9PiB0aGlzLmRlYnVnU2VydmljZS5yZW1vdmVCcmVha3BvaW50cyhpZCkpO1xuXHRcdGZ1bmN0aW9uQnJlYWtwb2ludElkcy5mb3JFYWNoKGlkID0+IHRoaXMuZGVidWdTZXJ2aWNlLnJlbW92ZUZ1bmN0aW9uQnJlYWtwb2ludHMoaWQpKTtcblx0XHRkYXRhQnJlYWtwb2ludElkcy5mb3JFYWNoKGlkID0+IHRoaXMuZGVidWdTZXJ2aWNlLnJlbW92ZURhdGFCcmVha3BvaW50cyhpZCkpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdHB1YmxpYyAkcmVnaXN0ZXJEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcihkZWJ1Z1R5cGU6IHN0cmluZywgcHJvdmlkZXJUcmlnZ2VyS2luZDogRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJUcmlnZ2VyS2luZCwgaGFzUHJvdmlkZTogYm9vbGVhbiwgaGFzUmVzb2x2ZTogYm9vbGVhbiwgaGFzUmVzb2x2ZTI6IGJvb2xlYW4sIGhhbmRsZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCBwcm92aWRlcjogSURlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyID0ge1xuXHRcdFx0dHlwZTogZGVidWdUeXBlLFxuXHRcdFx0dHJpZ2dlcktpbmQ6IHByb3ZpZGVyVHJpZ2dlcktpbmRcblx0XHR9O1xuXHRcdGlmIChoYXNQcm92aWRlKSB7XG5cdFx0XHRwcm92aWRlci5wcm92aWRlRGVidWdDb25maWd1cmF0aW9ucyA9IChmb2xkZXIsIHRva2VuKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZURlYnVnQ29uZmlndXJhdGlvbnMoaGFuZGxlLCBmb2xkZXIsIHRva2VuKTtcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmIChoYXNSZXNvbHZlKSB7XG5cdFx0XHRwcm92aWRlci5yZXNvbHZlRGVidWdDb25maWd1cmF0aW9uID0gKGZvbGRlciwgY29uZmlnLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb24oaGFuZGxlLCBmb2xkZXIsIGNvbmZpZywgdG9rZW4pO1xuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKGhhc1Jlc29sdmUyKSB7XG5cdFx0XHRwcm92aWRlci5yZXNvbHZlRGVidWdDb25maWd1cmF0aW9uV2l0aFN1YnN0aXR1dGVkVmFyaWFibGVzID0gKGZvbGRlciwgY29uZmlnLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb25XaXRoU3Vic3RpdHV0ZWRWYXJpYWJsZXMoaGFuZGxlLCBmb2xkZXIsIGNvbmZpZywgdG9rZW4pO1xuXHRcdFx0fTtcblx0XHR9XG5cdFx0dGhpcy5fZGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJzLnNldChoYW5kbGUsIHByb3ZpZGVyKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuZGVidWdTZXJ2aWNlLmdldENvbmZpZ3VyYXRpb25NYW5hZ2VyKCkucmVnaXN0ZXJEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcihwcm92aWRlcikpO1xuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHVibGljICR1bnJlZ2lzdGVyRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2RlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuX2RlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVycy5kZWxldGUoaGFuZGxlKTtcblx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmdldENvbmZpZ3VyYXRpb25NYW5hZ2VyKCkudW5yZWdpc3RlckRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKHByb3ZpZGVyKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgJHJlZ2lzdGVyRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkoZGVidWdUeXBlOiBzdHJpbmcsIGhhbmRsZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCBwcm92aWRlcjogSURlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5ID0ge1xuXHRcdFx0dHlwZTogZGVidWdUeXBlLFxuXHRcdFx0Y3JlYXRlRGVidWdBZGFwdGVyRGVzY3JpcHRvcjogc2Vzc2lvbiA9PiB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5fcHJveHkuJHByb3ZpZGVEZWJ1Z0FkYXB0ZXIoaGFuZGxlLCB0aGlzLmdldFNlc3Npb25EdG8oc2Vzc2lvbikpKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX2RlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3JpZXMuc2V0KGhhbmRsZSwgcHJvdmlkZXIpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0QWRhcHRlck1hbmFnZXIoKS5yZWdpc3RlckRlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5KHByb3ZpZGVyKSk7XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgJHVucmVnaXN0ZXJEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeShoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3Rvcmllcy5nZXQoaGFuZGxlKTtcblx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuX2RlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3JpZXMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHR0aGlzLmRlYnVnU2VydmljZS5nZXRBZGFwdGVyTWFuYWdlcigpLnVucmVnaXN0ZXJEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeShwcm92aWRlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXNzaW9uKHNlc3Npb25JZDogRGVidWdTZXNzaW9uVVVJRCB8IHVuZGVmaW5lZCk6IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGlmIChzZXNzaW9uSWQpIHtcblx0XHRcdHJldHVybiB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb24oc2Vzc2lvbklkLCB0cnVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkc3RhcnREZWJ1Z2dpbmcoZm9sZGVyOiBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkLCBuYW1lT3JDb25maWc6IHN0cmluZyB8IElEZWJ1Z0NvbmZpZ3VyYXRpb24sIG9wdGlvbnM6IElTdGFydERlYnVnZ2luZ09wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSBmb2xkZXIgPyB1cmkucmV2aXZlKGZvbGRlcikgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbGF1bmNoID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Q29uZmlndXJhdGlvbk1hbmFnZXIoKS5nZXRMYXVuY2goZm9sZGVyVXJpKTtcblx0XHRjb25zdCBwYXJlbnRTZXNzaW9uID0gdGhpcy5nZXRTZXNzaW9uKG9wdGlvbnMucGFyZW50U2Vzc2lvbklEKTtcblx0XHRjb25zdCBzYXZlQmVmb3JlU3RhcnQgPSB0eXBlb2Ygb3B0aW9ucy5zdXBwcmVzc1NhdmVCZWZvcmVTdGFydCA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMuc3VwcHJlc3NTYXZlQmVmb3JlU3RhcnQgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZGVidWdPcHRpb25zOiBJRGVidWdTZXNzaW9uT3B0aW9ucyA9IHtcblx0XHRcdG5vRGVidWc6IG9wdGlvbnMubm9EZWJ1Zyxcblx0XHRcdHBhcmVudFNlc3Npb24sXG5cdFx0XHRsaWZlY3ljbGVNYW5hZ2VkQnlQYXJlbnQ6IG9wdGlvbnMubGlmZWN5Y2xlTWFuYWdlZEJ5UGFyZW50LFxuXHRcdFx0cmVwbDogb3B0aW9ucy5yZXBsLFxuXHRcdFx0Y29tcGFjdDogb3B0aW9ucy5jb21wYWN0LFxuXHRcdFx0Y29tcG91bmRSb290OiBwYXJlbnRTZXNzaW9uPy5jb21wb3VuZFJvb3QsXG5cdFx0XHRzYXZlQmVmb3JlUmVzdGFydDogc2F2ZUJlZm9yZVN0YXJ0LFxuXHRcdFx0dGVzdFJ1bjogb3B0aW9ucy50ZXN0UnVuLFxuXG5cdFx0XHRzdXBwcmVzc0RlYnVnU3RhdHVzYmFyOiBvcHRpb25zLnN1cHByZXNzRGVidWdTdGF0dXNiYXIsXG5cdFx0XHRzdXBwcmVzc0RlYnVnVG9vbGJhcjogb3B0aW9ucy5zdXBwcmVzc0RlYnVnVG9vbGJhcixcblx0XHRcdHN1cHByZXNzRGVidWdWaWV3OiBvcHRpb25zLnN1cHByZXNzRGVidWdWaWV3LFxuXHRcdH07XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiB0aGlzLmRlYnVnU2VydmljZS5zdGFydERlYnVnZ2luZyhsYXVuY2gsIG5hbWVPckNvbmZpZywgZGVidWdPcHRpb25zLCBzYXZlQmVmb3JlU3RhcnQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yTm9UZWxlbWV0cnkoZXJyICYmIGVyci5tZXNzYWdlID8gZXJyLm1lc3NhZ2UgOiAnY2Fubm90IHN0YXJ0IGRlYnVnZ2luZycpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyAkc2V0RGVidWdTZXNzaW9uTmFtZShzZXNzaW9uSWQ6IERlYnVnU2Vzc2lvblVVSUQsIG5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRzZXNzaW9uPy5zZXROYW1lKG5hbWUpO1xuXHR9XG5cblx0cHVibGljICRjdXN0b21EZWJ1Z0FkYXB0ZXJSZXF1ZXN0KHNlc3Npb25JZDogRGVidWdTZXNzaW9uVVVJRCwgcmVxdWVzdDogc3RyaW5nLCBhcmdzOiB1bmtub3duKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbihzZXNzaW9uSWQsIHRydWUpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvbi5jdXN0b21SZXF1ZXN0KHJlcXVlc3QsIGFyZ3MpLnRoZW4ocmVzcG9uc2UgPT4ge1xuXHRcdFx0XHRpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uuc3VjY2Vzcykge1xuXHRcdFx0XHRcdHJldHVybiByZXNwb25zZS5ib2R5O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3JOb1RlbGVtZXRyeShyZXNwb25zZSA/IHJlc3BvbnNlLm1lc3NhZ2UgOiAnY3VzdG9tIHJlcXVlc3QgZmFpbGVkJykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvck5vVGVsZW1ldHJ5KCdkZWJ1ZyBzZXNzaW9uIG5vdCBmb3VuZCcpKTtcblx0fVxuXG5cdHB1YmxpYyAkZ2V0RGVidWdQcm90b2NvbEJyZWFrcG9pbnQoc2Vzc2lvbklkOiBEZWJ1Z1Nlc3Npb25VVUlELCBicmVha3BvaW5JZDogc3RyaW5nKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9uKHNlc3Npb25JZCwgdHJ1ZSk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoc2Vzc2lvbi5nZXREZWJ1Z1Byb3RvY29sQnJlYWtwb2ludChicmVha3BvaW5JZCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yTm9UZWxlbWV0cnkoJ2RlYnVnIHNlc3Npb24gbm90IGZvdW5kJykpO1xuXHR9XG5cblx0cHVibGljICRzdG9wRGVidWdnaW5nKHNlc3Npb25JZDogRGVidWdTZXNzaW9uVVVJRCB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChzZXNzaW9uSWQpIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb24oc2Vzc2lvbklkLCB0cnVlKTtcblx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmRlYnVnU2VydmljZS5zdG9wU2Vzc2lvbihzZXNzaW9uLCBpc1Nlc3Npb25BdHRhY2goc2Vzc2lvbikpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XHQvLyBzdG9wIGFsbFxuXHRcdFx0cmV0dXJuIHRoaXMuZGVidWdTZXJ2aWNlLnN0b3BTZXNzaW9uKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3JOb1RlbGVtZXRyeSgnZGVidWcgc2Vzc2lvbiBub3QgZm91bmQnKSk7XG5cdH1cblxuXHRwdWJsaWMgJGFwcGVuZERlYnVnQ29uc29sZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gVXNlIHdhcm5pbmcgYXMgc2V2ZXJpdHkgdG8gZ2V0IHRoZSBvcmFuZ2UgY29sb3IgZm9yIG1lc3NhZ2VzIGNvbWluZyBmcm9tIHRoZSBkZWJ1ZyBleHRlbnNpb25cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdFx0c2Vzc2lvbj8uYXBwZW5kVG9SZXBsKHsgb3V0cHV0OiB2YWx1ZSwgc2V2OiBzZXZlcml0eS5XYXJuaW5nIH0pO1xuXHR9XG5cblx0cHVibGljICRhY2NlcHREQU1lc3NhZ2UoaGFuZGxlOiBudW1iZXIsIG1lc3NhZ2U6IERlYnVnUHJvdG9jb2wuUHJvdG9jb2xNZXNzYWdlKSB7XG5cdFx0dGhpcy5nZXREZWJ1Z0FkYXB0ZXIoaGFuZGxlKS5hY2NlcHRNZXNzYWdlKGNvbnZlcnRUb1ZTQ1BhdGhzKG1lc3NhZ2UsIGZhbHNlKSk7XG5cdH1cblxuXHRwdWJsaWMgJGFjY2VwdERBRXJyb3IoaGFuZGxlOiBudW1iZXIsIG5hbWU6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nLCBzdGFjazogc3RyaW5nKSB7XG5cdFx0Ly8gZG9uJ3QgdXNlIGdldERlYnVnQWRhcHRlciBzaW5jZSBhbiBlcnJvciBjYW4gYmUgZXhwZWN0ZWQgb24gYSBwb3N0LWNsb3NlXG5cdFx0dGhpcy5fZGVidWdBZGFwdGVycy5nZXQoaGFuZGxlKT8uZmlyZUVycm9yKGhhbmRsZSwgbmV3IEVycm9yKGAke25hbWV9OiAke21lc3NhZ2V9XFxuJHtzdGFja31gKSk7XG5cdH1cblxuXHRwdWJsaWMgJGFjY2VwdERBRXhpdChoYW5kbGU6IG51bWJlciwgY29kZTogbnVtYmVyLCBzaWduYWw6IHN0cmluZykge1xuXHRcdC8vIGRvbid0IHVzZSBnZXREZWJ1Z0FkYXB0ZXIgc2luY2UgYW4gZXJyb3IgY2FuIGJlIGV4cGVjdGVkIG9uIGEgcG9zdC1jbG9zZVxuXHRcdHRoaXMuX2RlYnVnQWRhcHRlcnMuZ2V0KGhhbmRsZSk/LmZpcmVFeGl0KGhhbmRsZSwgY29kZSwgc2lnbmFsKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVidWdBZGFwdGVyKGhhbmRsZTogbnVtYmVyKTogRXh0ZW5zaW9uSG9zdERlYnVnQWRhcHRlciB7XG5cdFx0Y29uc3QgYWRhcHRlciA9IHRoaXMuX2RlYnVnQWRhcHRlcnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFhZGFwdGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZGVidWcgYWRhcHRlcicpO1xuXHRcdH1cblx0XHRyZXR1cm4gYWRhcHRlcjtcblx0fVxuXG5cdC8vIGR0byBoZWxwZXJzXG5cblx0cHVibGljICRzZXNzaW9uQ2FjaGVkKHNlc3Npb25JRDogc3RyaW5nKSB7XG5cdFx0Ly8gcmVtZW1iZXIgdGhhdCB0aGUgRUggaGFzIGNhY2hlZCB0aGUgc2Vzc2lvbiBhbmQgd2UgZG8gbm90IGhhdmUgdG8gc2VuZCBpdCBhZ2FpblxuXHRcdHRoaXMuX2V4dEhvc3RLbm93blNlc3Npb25zLmFkZChzZXNzaW9uSUQpO1xuXHR9XG5cblxuXHRnZXRTZXNzaW9uRHRvKHNlc3Npb246IHVuZGVmaW5lZCk6IHVuZGVmaW5lZDtcblx0Z2V0U2Vzc2lvbkR0byhzZXNzaW9uOiBJRGVidWdTZXNzaW9uKTogSURlYnVnU2Vzc2lvbkR0bztcblx0Z2V0U2Vzc2lvbkR0byhzZXNzaW9uOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkKTogSURlYnVnU2Vzc2lvbkR0byB8IHVuZGVmaW5lZDtcblx0Z2V0U2Vzc2lvbkR0byhzZXNzaW9uOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkKTogSURlYnVnU2Vzc2lvbkR0byB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdGNvbnN0IHNlc3Npb25JRCA9IHNlc3Npb24uZ2V0SWQoKTtcblx0XHRcdGlmICh0aGlzLl9leHRIb3N0S25vd25TZXNzaW9ucy5oYXMoc2Vzc2lvbklEKSkge1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbklEO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gdGhpcy5fc2Vzc2lvbnMuYWRkKHNlc3Npb25JRCk7IFx0Ly8gIzY5NTM0OiBzZWUgJHNlc3Npb25DYWNoZWQgYWJvdmVcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogc2Vzc2lvbklELFxuXHRcdFx0XHRcdHR5cGU6IHNlc3Npb24uY29uZmlndXJhdGlvbi50eXBlLFxuXHRcdFx0XHRcdG5hbWU6IHNlc3Npb24ubmFtZSxcblx0XHRcdFx0XHRmb2xkZXJVcmk6IHNlc3Npb24ucm9vdCA/IHNlc3Npb24ucm9vdC51cmkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlndXJhdGlvbjogc2Vzc2lvbi5jb25maWd1cmF0aW9uLFxuXHRcdFx0XHRcdHBhcmVudDogc2Vzc2lvbi5wYXJlbnRTZXNzaW9uPy5nZXRJZCgpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBjb252ZXJ0VG9EdG8oYnBzOiAoUmVhZG9ubHlBcnJheTxJQnJlYWtwb2ludCB8IElGdW5jdGlvbkJyZWFrcG9pbnQgfCBJRGF0YUJyZWFrcG9pbnQgfCBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50PikpOiBBcnJheTxJU291cmNlQnJlYWtwb2ludER0byB8IElGdW5jdGlvbkJyZWFrcG9pbnREdG8gfCBJRGF0YUJyZWFrcG9pbnREdG8+IHtcblx0XHRyZXR1cm4gYnBzLm1hcChicCA9PiB7XG5cdFx0XHRpZiAoJ25hbWUnIGluIGJwKSB7XG5cdFx0XHRcdGNvbnN0IGZicDogSUZ1bmN0aW9uQnJlYWtwb2ludCA9IGJwO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICdmdW5jdGlvbicsXG5cdFx0XHRcdFx0aWQ6IGZicC5nZXRJZCgpLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IGZicC5lbmFibGVkLFxuXHRcdFx0XHRcdGNvbmRpdGlvbjogZmJwLmNvbmRpdGlvbixcblx0XHRcdFx0XHRoaXRDb25kaXRpb246IGZicC5oaXRDb25kaXRpb24sXG5cdFx0XHRcdFx0bG9nTWVzc2FnZTogZmJwLmxvZ01lc3NhZ2UsXG5cdFx0XHRcdFx0ZnVuY3Rpb25OYW1lOiBmYnAubmFtZVxuXHRcdFx0XHR9IHNhdGlzZmllcyBJRnVuY3Rpb25CcmVha3BvaW50RHRvO1xuXHRcdFx0fSBlbHNlIGlmICgnc3JjJyBpbiBicCkge1xuXHRcdFx0XHRjb25zdCBkYnA6IElEYXRhQnJlYWtwb2ludCA9IGJwO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICdkYXRhJyxcblx0XHRcdFx0XHRpZDogZGJwLmdldElkKCksXG5cdFx0XHRcdFx0ZGF0YUlkOiBkYnAuc3JjLnR5cGUgPT09IERhdGFCcmVha3BvaW50U2V0VHlwZS5WYXJpYWJsZSA/IGRicC5zcmMuZGF0YUlkIDogZGJwLnNyYy5hZGRyZXNzLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IGRicC5lbmFibGVkLFxuXHRcdFx0XHRcdGNvbmRpdGlvbjogZGJwLmNvbmRpdGlvbixcblx0XHRcdFx0XHRoaXRDb25kaXRpb246IGRicC5oaXRDb25kaXRpb24sXG5cdFx0XHRcdFx0bG9nTWVzc2FnZTogZGJwLmxvZ01lc3NhZ2UsXG5cdFx0XHRcdFx0YWNjZXNzVHlwZTogZGJwLmFjY2Vzc1R5cGUsXG5cdFx0XHRcdFx0bGFiZWw6IGRicC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRjYW5QZXJzaXN0OiBkYnAuY2FuUGVyc2lzdFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJRGF0YUJyZWFrcG9pbnREdG87XG5cdFx0XHR9IGVsc2UgaWYgKCd1cmknIGluIGJwKSB7XG5cdFx0XHRcdGNvbnN0IHNicDogSUJyZWFrcG9pbnQgPSBicDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiAnc291cmNlJyxcblx0XHRcdFx0XHRpZDogc2JwLmdldElkKCksXG5cdFx0XHRcdFx0ZW5hYmxlZDogc2JwLmVuYWJsZWQsXG5cdFx0XHRcdFx0Y29uZGl0aW9uOiBzYnAuY29uZGl0aW9uLFxuXHRcdFx0XHRcdGhpdENvbmRpdGlvbjogc2JwLmhpdENvbmRpdGlvbixcblx0XHRcdFx0XHRsb2dNZXNzYWdlOiBzYnAubG9nTWVzc2FnZSxcblx0XHRcdFx0XHR1cmk6IHNicC51cmksXG5cdFx0XHRcdFx0bGluZTogc2JwLmxpbmVOdW1iZXIgPiAwID8gc2JwLmxpbmVOdW1iZXIgLSAxIDogMCxcblx0XHRcdFx0XHRjaGFyYWN0ZXI6ICh0eXBlb2Ygc2JwLmNvbHVtbiA9PT0gJ251bWJlcicgJiYgc2JwLmNvbHVtbiA+IDApID8gc2JwLmNvbHVtbiAtIDEgOiAwLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJU291cmNlQnJlYWtwb2ludER0bztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cdH1cbn1cblxuLyoqXG4gKiBEZWJ1Z0FkYXB0ZXIgdGhhdCBjb21tdW5pY2F0ZXMgdmlhIGV4dGVuc2lvbiBwcm90b2NvbCB3aXRoIGFub3RoZXIgZGVidWcgYWRhcHRlci5cbiAqL1xuY2xhc3MgRXh0ZW5zaW9uSG9zdERlYnVnQWRhcHRlciBleHRlbmRzIEFic3RyYWN0RGVidWdBZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9kczogTWFpblRocmVhZERlYnVnU2VydmljZSwgcHJpdmF0ZSBfaGFuZGxlOiBudW1iZXIsIHByaXZhdGUgX3Byb3h5OiBFeHRIb3N0RGVidWdTZXJ2aWNlU2hhcGUsIHJlYWRvbmx5IHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0ZmlyZUVycm9yKGhhbmRsZTogbnVtYmVyLCBlcnI6IEVycm9yKSB7XG5cdFx0dGhpcy5fb25FcnJvci5maXJlKGVycik7XG5cdH1cblxuXHRmaXJlRXhpdChoYW5kbGU6IG51bWJlciwgY29kZTogbnVtYmVyLCBzaWduYWw6IHN0cmluZykge1xuXHRcdHRoaXMuX29uRXhpdC5maXJlKGNvZGUpO1xuXHR9XG5cblx0c3RhcnRTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5fcHJveHkuJHN0YXJ0REFTZXNzaW9uKHRoaXMuX2hhbmRsZSwgdGhpcy5fZHMuZ2V0U2Vzc2lvbkR0byh0aGlzLnNlc3Npb24pKSk7XG5cdH1cblxuXHRzZW5kTWVzc2FnZShtZXNzYWdlOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Byb3h5LiRzZW5kREFNZXNzYWdlKHRoaXMuX2hhbmRsZSwgY29udmVydFRvREFQYXRocyhtZXNzYWdlLCB0cnVlKSk7XG5cdH1cblxuXHRhc3luYyBzdG9wU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmNhbmNlbFBlbmRpbmdSZXF1ZXN0cygpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5fcHJveHkuJHN0b3BEQVNlc3Npb24odGhpcy5faGFuZGxlKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlLGlCQUE4QixvQkFBb0I7QUFDMUUsU0FBUyxPQUFPLFdBQTBCO0FBQzFDLFNBQVMsZUFBa1MscUJBQXFCLDZCQUE2QjtBQUM3VjtBQUFBLEVBQ0M7QUFBQSxFQUF5RjtBQUFBLE9BRW5GO0FBQ1AsU0FBUyw0QkFBNkM7QUFDdEQsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsbUJBQW1CLGtCQUFrQix1QkFBdUI7QUFDckUsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBR25CLElBQU0seUJBQU4sTUFBMEY7QUFBQSxFQVloRyxZQUNDLGdCQUNnQyxjQUNVLG1CQUN6QztBQUYrQjtBQUNVO0FBWjNDLFNBQWlCLGFB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
