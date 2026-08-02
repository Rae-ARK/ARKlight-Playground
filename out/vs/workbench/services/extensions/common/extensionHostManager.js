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
import { IntervalTimer } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import * as errors from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import * as nls from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { RemoteAuthorityResolverErrorCode, getRemoteAuthorityPrefix } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { ExtHostCustomersRegistry } from "./extHostCustomers.js";
import { extensionHostKindToString } from "./extensionHostKind.js";
import { ActivationKind } from "./extensions.js";
import { RPCProtocol, RequestInitiator } from "./rpcProtocol.js";
const LOG_EXTENSION_HOST_COMMUNICATION = false;
const LOG_USE_COLORS = true;
let ExtensionHostManager = class extends Disposable {
  constructor(extensionHost, initialActivationEvents, _internalExtensionService, _instantiationService, _environmentService, _telemetryService, _logService) {
    super();
    this._internalExtensionService = _internalExtensionService;
    this._instantiationService = _instantiationService;
    this._environmentService = _environmentService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this._onDidChangeResponsiveState = this._register(new Emitter());
    this.onDidChangeResponsiveState = this._onDidChangeResponsiveState.event;
    this._hasStarted = false;
    this._cachedActivationEvents = /* @__PURE__ */ new Map();
    this._resolvedActivationEvents = /* @__PURE__ */ new Set();
    this._rpcProtocol = null;
    this._customers = [];
    this._extensionHost = extensionHost;
    this.onDidExit = this._extensionHost.onExit;
    const startingTelemetryEvent = {
      time: Date.now(),
      action: "starting",
      kind: extensionHostKindToString(this.kind)
    };
    this._telemetryService.publicLog2("extensionHostStartup", startingTelemetryEvent);
    this._proxy = this._extensionHost.start().then(
      (protocol) => {
        const successTelemetryEvent = {
          time: Date.now(),
          action: "success",
          kind: extensionHostKindToString(this.kind)
        };
        this._telemetryService.publicLog2("extensionHostStartup", successTelemetryEvent);
        return this._createExtensionHostCustomers(this.kind, protocol);
      },
      (err) => {
        this._logService.error(`Error received from starting extension host (kind: ${extensionHostKindToString(this.kind)})`);
        this._logService.error(err);
        const failureTelemetryEvent = {
          time: Date.now(),
          action: "error",
          kind: extensionHostKindToString(this.kind)
        };
        if (err && err.name) {
          failureTelemetryEvent.errorName = err.name;
        }
        if (err && err.message) {
          failureTelemetryEvent.errorMessage = err.message;
        }
        if (err && err.stack) {
          failureTelemetryEvent.errorStack = err.stack;
        }
        this._telemetryService.publicLog2("extensionHostStartup", failureTelemetryEvent);
        return null;
      }
    );
    this._proxy.then(() => {
      this._hasStarted = true;
      initialActivationEvents.forEach((activationEvent) => this.activateByEvent(activationEvent, ActivationKind.Normal));
      this._register(registerLatencyTestProvider({
        measure: () => this.measure()
      }));
    });
  }
  get pid() {
    return this._extensionHost.pid;
  }
  get kind() {
    return this._extensionHost.runningLocation.kind;
  }
  get startup() {
    return this._extensionHost.startup;
  }
  get friendyName() {
    return friendlyExtHostName(this.kind, this.pid);
  }
  async disconnect() {
    await this._extensionHost?.disconnect?.();
  }
  dispose() {
    this._extensionHost?.dispose();
    this._rpcProtocol?.dispose();
    for (let i = 0, len = this._customers.length; i < len; i++) {
      const customer = this._customers[i];
      try {
        customer.dispose();
      } catch (err) {
        errors.onUnexpectedError(err);
      }
    }
    this._proxy = null;
    super.dispose();
  }
  async measure() {
    const proxy = await this._proxy;
    if (!proxy) {
      return null;
    }
    const latency = await this._measureLatency(proxy);
    const down = await this._measureDown(proxy);
    const up = await this._measureUp(proxy);
    return {
      remoteAuthority: this._extensionHost.remoteAuthority,
      latency,
      down,
      up
    };
  }
  get isReady() {
    return this._hasStarted;
  }
  async ready() {
    await this._proxy;
  }
  async _measureLatency(proxy) {
    const COUNT = 10;
    let sum = 0;
    for (let i = 0; i < COUNT; i++) {
      const sw = StopWatch.create();
      await proxy.test_latency(i);
      sw.stop();
      sum += sw.elapsed();
    }
    return sum / COUNT;
  }
  static _convert(byteCount, elapsedMillis) {
    return byteCount * 1e3 * 8 / elapsedMillis;
  }
  async _measureUp(proxy) {
    const SIZE = 10 * 1024 * 1024;
    const buff = VSBuffer.alloc(SIZE);
    const value = Math.ceil(Math.random() * 256);
    for (let i = 0; i < buff.byteLength; i++) {
      buff.writeUInt8(i, value);
    }
    const sw = StopWatch.create();
    await proxy.test_up(buff);
    sw.stop();
    return ExtensionHostManager._convert(SIZE, sw.elapsed());
  }
  async _measureDown(proxy) {
    const SIZE = 10 * 1024 * 1024;
    const sw = StopWatch.create();
    await proxy.test_down(SIZE);
    sw.stop();
    return ExtensionHostManager._convert(SIZE, sw.elapsed());
  }
  _createExtensionHostCustomers(kind, protocol) {
    let logger = null;
    if (LOG_EXTENSION_HOST_COMMUNICATION || this._environmentService.logExtensionHostCommunication) {
      logger = new RPCLogger(kind);
    } else if (TelemetryRPCLogger.isEnabled()) {
      logger = new TelemetryRPCLogger(this._telemetryService);
    }
    this._rpcProtocol = new RPCProtocol(protocol, logger);
    this._register(this._rpcProtocol.onDidChangeResponsiveState((responsiveState) => this._onDidChangeResponsiveState.fire(responsiveState)));
    let extensionHostProxy = null;
    let mainProxyIdentifiers = [];
    const extHostContext = {
      remoteAuthority: this._extensionHost.remoteAuthority,
      extensionHostKind: this.kind,
      getProxy: (identifier) => this._rpcProtocol.getProxy(identifier),
      set: (identifier, instance) => this._rpcProtocol.set(identifier, instance),
      dispose: () => this._rpcProtocol.dispose(),
      assertRegistered: (identifiers) => this._rpcProtocol.assertRegistered(identifiers),
      drain: () => this._rpcProtocol.drain(),
      //#region internal
      internalExtensionService: this._internalExtensionService,
      _setExtensionHostProxy: (value) => {
        extensionHostProxy = value;
      },
      _setAllMainProxyIdentifiers: (value) => {
        mainProxyIdentifiers = value;
      }
      //#endregion
    };
    const namedCustomers = ExtHostCustomersRegistry.getNamedCustomers();
    for (let i = 0, len = namedCustomers.length; i < len; i++) {
      const [id, ctor] = namedCustomers[i];
      try {
        const instance = this._instantiationService.createInstance(ctor, extHostContext);
        this._customers.push(instance);
        this._rpcProtocol.set(id, instance);
      } catch (err) {
        this._logService.error(`Cannot instantiate named customer: '${id.sid}'`);
        this._logService.error(err);
        errors.onUnexpectedError(err);
      }
    }
    const customers = ExtHostCustomersRegistry.getCustomers();
    for (const ctor of customers) {
      try {
        const instance = this._instantiationService.createInstance(ctor, extHostContext);
        this._customers.push(instance);
      } catch (err) {
        this._logService.error(err);
        errors.onUnexpectedError(err);
      }
    }
    if (!extensionHostProxy) {
      throw new Error(`Missing IExtensionHostProxy!`);
    }
    this._rpcProtocol.assertRegistered(mainProxyIdentifiers);
    return extensionHostProxy;
  }
  async activate(extension, reason) {
    const proxy = await this._proxy;
    if (!proxy) {
      return false;
    }
    return proxy.activate(extension, reason);
  }
  activateByEvent(activationEvent, activationKind) {
    if (!this._cachedActivationEvents.has(activationEvent)) {
      this._cachedActivationEvents.set(activationEvent, this._activateByEvent(activationEvent, activationKind));
    }
    return this._cachedActivationEvents.get(activationEvent);
  }
  activationEventIsDone(activationEvent) {
    return this._resolvedActivationEvents.has(activationEvent);
  }
  async _activateByEvent(activationEvent, activationKind) {
    if (!this._proxy) {
      return;
    }
    const proxy = await this._proxy;
    if (!proxy) {
      return;
    }
    if (!this._extensionHost.extensions.containsActivationEvent(activationEvent)) {
      this._resolvedActivationEvents.add(activationEvent);
      return;
    }
    await proxy.activateByEvent(activationEvent, activationKind);
    this._resolvedActivationEvents.add(activationEvent);
  }
  async getInspectPort(tryEnableInspector) {
    if (this._extensionHost) {
      if (tryEnableInspector) {
        await this._extensionHost.enableInspectPort();
      }
      const port = this._extensionHost.getInspectPort();
      if (port) {
        return port;
      }
    }
    return void 0;
  }
  async resolveAuthority(remoteAuthority, resolveAttempt) {
    const sw = StopWatch.create(false);
    const prefix = () => `[${extensionHostKindToString(this._extensionHost.runningLocation.kind)}${this._extensionHost.runningLocation.affinity}][resolveAuthority(${getRemoteAuthorityPrefix(remoteAuthority)},${resolveAttempt})][${sw.elapsed()}ms] `;
    const logInfo = (msg) => this._logService.info(`${prefix()}${msg}`);
    const logError = (msg, err = void 0) => this._logService.error(`${prefix()}${msg}`, err);
    logInfo(`obtaining proxy...`);
    const proxy = await this._proxy;
    if (!proxy) {
      logError(`no proxy`);
      return {
        type: "error",
        error: {
          message: `Cannot resolve authority`,
          code: RemoteAuthorityResolverErrorCode.Unknown,
          detail: void 0
        }
      };
    }
    logInfo(`invoking...`);
    const intervalLogger = new IntervalTimer();
    try {
      intervalLogger.cancelAndSet(() => logInfo("waiting..."), 1e3);
      const resolverResult = await proxy.resolveAuthority(remoteAuthority, resolveAttempt);
      intervalLogger.dispose();
      if (resolverResult.type === "ok") {
        logInfo(`returned ${resolverResult.value.authority.connectTo}`);
      } else {
        logError(`returned an error`, resolverResult.error);
      }
      return resolverResult;
    } catch (err) {
      intervalLogger.dispose();
      logError(`returned an error`, err);
      return {
        type: "error",
        error: {
          message: err.message,
          code: RemoteAuthorityResolverErrorCode.Unknown,
          detail: err
        }
      };
    }
  }
  async getCanonicalURI(remoteAuthority, uri) {
    const proxy = await this._proxy;
    if (!proxy) {
      throw new Error(`Cannot resolve canonical URI`);
    }
    return proxy.getCanonicalURI(remoteAuthority, uri);
  }
  async start(extensionRegistryVersionId, allExtensions, myExtensions) {
    const proxy = await this._proxy;
    if (!proxy) {
      return;
    }
    const deltaExtensions = this._extensionHost.extensions.set(extensionRegistryVersionId, allExtensions, myExtensions);
    return proxy.startExtensionHost(deltaExtensions);
  }
  async extensionTestsExecute() {
    const proxy = await this._proxy;
    if (!proxy) {
      throw new Error("Could not obtain Extension Host Proxy");
    }
    return proxy.extensionTestsExecute();
  }
  representsRunningLocation(runningLocation) {
    return this._extensionHost.runningLocation.equals(runningLocation);
  }
  async deltaExtensions(incomingExtensionsDelta) {
    const proxy = await this._proxy;
    if (!proxy) {
      return;
    }
    const outgoingExtensionsDelta = this._extensionHost.extensions.delta(incomingExtensionsDelta);
    if (!outgoingExtensionsDelta) {
      return;
    }
    return proxy.deltaExtensions(outgoingExtensionsDelta);
  }
  containsExtension(extensionId) {
    return this._extensionHost.extensions?.containsExtension(extensionId) ?? false;
  }
  async setRemoteEnvironment(env) {
    const proxy = await this._proxy;
    if (!proxy) {
      return;
    }
    return proxy.setRemoteEnvironment(env);
  }
};
ExtensionHostManager = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, ILogService)
], ExtensionHostManager);
function friendlyExtHostName(kind, pid) {
  if (pid) {
    return `${extensionHostKindToString(kind)} pid: ${pid}`;
  }
  return `${extensionHostKindToString(kind)}`;
}
const colorTables = [
  ["#2977B1", "#FC802D", "#34A13A", "#D3282F", "#9366BA"],
  ["#8B564C", "#E177C0", "#7F7F7F", "#BBBE3D", "#2EBECD"]
];
function prettyWithoutArrays(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === "object" && typeof data.toString === "function") {
    const result = data.toString();
    if (result !== "[object Object]") {
      return result;
    }
  }
  return data;
}
function pretty(data) {
  if (Array.isArray(data)) {
    return data.map(prettyWithoutArrays);
  }
  return prettyWithoutArrays(data);
}
class RPCLogger {
  constructor(_kind) {
    this._kind = _kind;
    this._totalIncoming = 0;
    this._totalOutgoing = 0;
  }
  _log(direction, totalLength, msgLength, req, initiator, str, data) {
    data = pretty(data);
    const colorTable = colorTables[initiator];
    const color = LOG_USE_COLORS ? colorTable[req % colorTable.length] : "#000000";
    let args = [`%c[${extensionHostKindToString(this._kind)}][${direction}]%c[${String(totalLength).padStart(7)}]%c[len: ${String(msgLength).padStart(5)}]%c${String(req).padStart(5)} - ${str}`, "color: darkgreen", "color: grey", "color: grey", `color: ${color}`];
    if (/\($/.test(str)) {
      args = args.concat(data);
      args.push(")");
    } else {
      args.push(data);
    }
    console.log.apply(console, args);
  }
  logIncoming(msgLength, req, initiator, str, data) {
    this._totalIncoming += msgLength;
    this._log("Ext \u2192 Win", this._totalIncoming, msgLength, req, initiator, str, data);
  }
  logOutgoing(msgLength, req, initiator, str, data) {
    this._totalOutgoing += msgLength;
    this._log("Win \u2192 Ext", this._totalOutgoing, msgLength, req, initiator, str, data);
  }
}
let TelemetryRPCLogger = class {
  constructor(_telemetryService) {
    this._telemetryService = _telemetryService;
    this._pendingRequests = /* @__PURE__ */ new Map();
  }
  static isEnabled() {
    return Math.random() < 1e-4;
  }
  logIncoming(msgLength, req, initiator, str) {
    if (initiator === RequestInitiator.LocalSide && /^receiveReply(Err)?:/.test(str)) {
      const requestStr = this._pendingRequests.get(req) ?? "unknown_reply";
      this._pendingRequests.delete(req);
      this._telemetryService.publicLog2("extensionhost.incoming", {
        type: `${str} ${requestStr}`,
        length: msgLength
      });
    }
    if (initiator === RequestInitiator.OtherSide && /^receiveRequest /.test(str)) {
      this._telemetryService.publicLog2("extensionhost.incoming", {
        type: `${str}`,
        length: msgLength
      });
    }
  }
  logOutgoing(msgLength, req, initiator, str) {
    if (initiator === RequestInitiator.LocalSide && str.startsWith("request: ")) {
      this._pendingRequests.set(req, str);
      this._telemetryService.publicLog2("extensionhost.outgoing", {
        type: str,
        length: msgLength
      });
    }
  }
};
TelemetryRPCLogger = __decorateClass([
  __decorateParam(0, ITelemetryService)
], TelemetryRPCLogger);
const providers = [];
function registerLatencyTestProvider(provider) {
  providers.push(provider);
  return {
    dispose: () => {
      for (let i = 0; i < providers.length; i++) {
        if (providers[i] === provider) {
          providers.splice(i, 1);
          return;
        }
      }
    }
  };
}
function getLatencyTestProviders() {
  return providers.slice(0);
}
registerAction2(class MeasureExtHostLatencyAction extends Action2 {
  constructor() {
    super({
      id: "editor.action.measureExtHostLatency",
      title: nls.localize2("measureExtHostLatency", "Measure Extension Host Latency"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const measurements = await Promise.all(getLatencyTestProviders().map((provider) => provider.measure()));
    editorService.openEditor({ resource: void 0, contents: measurements.map(MeasureExtHostLatencyAction._print).join("\n\n"), options: { pinned: true } });
  }
  static _print(m) {
    if (!m) {
      return "";
    }
    return `${m.remoteAuthority ? `Authority: ${m.remoteAuthority}
` : ``}Roundtrip latency: ${m.latency.toFixed(3)}ms
Up: ${MeasureExtHostLatencyAction._printSpeed(m.up)}
Down: ${MeasureExtHostLatencyAction._printSpeed(m.down)}
`;
  }
  static _printSpeed(n) {
    if (n <= 1024) {
      return `${n} bps`;
    }
    if (n < 1024 * 1024) {
      return `${(n / 1024).toFixed(1)} kbps`;
    }
    return `${(n / 1024 / 1024).toFixed(1)} Mbps`;
  }
});
export {
  ExtensionHostManager,
  friendlyExtHostName
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25Ib3N0TWFuYWdlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEludGVydmFsVGltZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgKiBhcyBlcnJvcnMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvckNvZGUsIGdldFJlbW90ZUF1dGhvcml0eVByZWZpeCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q3VzdG9tZXJzUmVnaXN0cnksIElJbnRlcm5hbEV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RLaW5kLCBleHRlbnNpb25Ib3N0S2luZFRvU3RyaW5nIH0gZnJvbSAnLi9leHRlbnNpb25Ib3N0S2luZC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uSG9zdE1hbmFnZXIgfSBmcm9tICcuL2V4dGVuc2lvbkhvc3RNYW5hZ2Vycy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb25EZWx0YSB9IGZyb20gJy4vZXh0ZW5zaW9uSG9zdFByb3RvY29sLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25Ib3N0UHJveHksIElSZXNvbHZlQXV0aG9yaXR5UmVzdWx0IH0gZnJvbSAnLi9leHRlbnNpb25Ib3N0UHJveHkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uIH0gZnJvbSAnLi9leHRlbnNpb25SdW5uaW5nTG9jYXRpb24uanMnO1xuaW1wb3J0IHsgQWN0aXZhdGlvbktpbmQsIEV4dGVuc2lvbkFjdGl2YXRpb25SZWFzb24sIEV4dGVuc2lvbkhvc3RTdGFydHVwLCBJRXh0ZW5zaW9uSG9zdCwgSUV4dGVuc2lvbkluc3BlY3RJbmZvLCBJSW50ZXJuYWxFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFByb3hpZWQsIFByb3h5SWRlbnRpZmllciB9IGZyb20gJy4vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IElSUENQcm90b2NvbExvZ2dlciwgUlBDUHJvdG9jb2wsIFJlcXVlc3RJbml0aWF0b3IsIFJlc3BvbnNpdmVTdGF0ZSB9IGZyb20gJy4vcnBjUHJvdG9jb2wuanMnO1xuXG4vLyBFbmFibGUgdG8gc2VlIGRldGFpbGVkIG1lc3NhZ2UgY29tbXVuaWNhdGlvbiBiZXR3ZWVuIHdpbmRvdyBhbmQgZXh0ZW5zaW9uIGhvc3RcbmNvbnN0IExPR19FWFRFTlNJT05fSE9TVF9DT01NVU5JQ0FUSU9OID0gZmFsc2U7XG5jb25zdCBMT0dfVVNFX0NPTE9SUyA9IHRydWU7XG5cbnR5cGUgRXh0ZW5zaW9uSG9zdFN0YXJ0dXBDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdhbGV4ZGltYSc7XG5cdGNvbW1lbnQ6ICdUaGUgc3RhcnR1cCBzdGF0ZSBvZiB0aGUgZXh0ZW5zaW9uIGhvc3QnO1xuXHR0aW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHRpbWUgcmVwb3J0ZWQgYnkgRGF0ZS5ub3coKS4nIH07XG5cdGFjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBhY3Rpb246IHN0YXJ0aW5nLCBzdWNjZXNzIG9yIGVycm9yLicgfTtcblx0a2luZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBleHRlbnNpb24gaG9zdCBraW5kOiBMb2NhbFByb2Nlc3MsIExvY2FsV2ViV29ya2VyIG9yIFJlbW90ZS4nIH07XG5cdGVycm9yTmFtZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgZXJyb3IgbmFtZS4nIH07XG5cdGVycm9yTWVzc2FnZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgZXJyb3IgbWVzc2FnZS4nIH07XG5cdGVycm9yU3RhY2s/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGVycm9yIHN0YWNrLicgfTtcbn07XG5cbnR5cGUgRXh0ZW5zaW9uSG9zdFN0YXJ0dXBFdmVudCA9IHtcblx0dGltZTogbnVtYmVyO1xuXHRhY3Rpb246ICdzdGFydGluZycgfCAnc3VjY2VzcycgfCAnZXJyb3InO1xuXHRraW5kOiBzdHJpbmc7XG5cdGVycm9yTmFtZT86IHN0cmluZztcblx0ZXJyb3JNZXNzYWdlPzogc3RyaW5nO1xuXHRlcnJvclN0YWNrPzogc3RyaW5nO1xufTtcblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbkhvc3RNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25Ib3N0TWFuYWdlciB7XG5cblx0cHVibGljIHJlYWRvbmx5IG9uRGlkRXhpdDogRXZlbnQ8W251bWJlciwgc3RyaW5nIHwgbnVsbF0+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUmVzcG9uc2l2ZVN0YXRlOiBFbWl0dGVyPFJlc3BvbnNpdmVTdGF0ZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxSZXNwb25zaXZlU3RhdGU+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VSZXNwb25zaXZlU3RhdGU6IEV2ZW50PFJlc3BvbnNpdmVTdGF0ZT4gPSB0aGlzLl9vbkRpZENoYW5nZVJlc3BvbnNpdmVTdGF0ZS5ldmVudDtcblxuXHQvKipcblx0ICogQSBtYXAgb2YgYWxyZWFkeSByZXF1ZXN0ZWQgYWN0aXZhdGlvbiBldmVudHMgdG8gc3BlZWQgdGhpbmdzIHVwIGlmIHRoZSBzYW1lIGFjdGl2YXRpb24gZXZlbnQgaXMgdHJpZ2dlcmVkIG11bHRpcGxlIHRpbWVzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGVkQWN0aXZhdGlvbkV2ZW50czogTWFwPHN0cmluZywgUHJvbWlzZTx2b2lkPj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVkQWN0aXZhdGlvbkV2ZW50czogU2V0PHN0cmluZz47XG5cdHByaXZhdGUgX3JwY1Byb3RvY29sOiBSUENQcm90b2NvbCB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbWVyczogSURpc3Bvc2FibGVbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uSG9zdDogSUV4dGVuc2lvbkhvc3Q7XG5cdHByaXZhdGUgX3Byb3h5OiBQcm9taXNlPElFeHRlbnNpb25Ib3N0UHJveHkgfCBudWxsPiB8IG51bGw7XG5cdHByaXZhdGUgX2hhc1N0YXJ0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwdWJsaWMgZ2V0IHBpZCgpOiBudW1iZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdC5waWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGtpbmQoKTogRXh0ZW5zaW9uSG9zdEtpbmQge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0LnJ1bm5pbmdMb2NhdGlvbi5raW5kO1xuXHR9XG5cblx0cHVibGljIGdldCBzdGFydHVwKCk6IEV4dGVuc2lvbkhvc3RTdGFydHVwIHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdC5zdGFydHVwO1xuXHR9XG5cblx0cHVibGljIGdldCBmcmllbmR5TmFtZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBmcmllbmRseUV4dEhvc3ROYW1lKHRoaXMua2luZCwgdGhpcy5waWQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0ZW5zaW9uSG9zdDogSUV4dGVuc2lvbkhvc3QsXG5cdFx0aW5pdGlhbEFjdGl2YXRpb25FdmVudHM6IHN0cmluZ1tdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ludGVybmFsRXh0ZW5zaW9uU2VydmljZTogSUludGVybmFsRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY2FjaGVkQWN0aXZhdGlvbkV2ZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPHZvaWQ+PigpO1xuXHRcdHRoaXMuX3Jlc29sdmVkQWN0aXZhdGlvbkV2ZW50cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdHRoaXMuX3JwY1Byb3RvY29sID0gbnVsbDtcblx0XHR0aGlzLl9jdXN0b21lcnMgPSBbXTtcblxuXHRcdHRoaXMuX2V4dGVuc2lvbkhvc3QgPSBleHRlbnNpb25Ib3N0O1xuXHRcdHRoaXMub25EaWRFeGl0ID0gdGhpcy5fZXh0ZW5zaW9uSG9zdC5vbkV4aXQ7XG5cblx0XHRjb25zdCBzdGFydGluZ1RlbGVtZXRyeUV2ZW50OiBFeHRlbnNpb25Ib3N0U3RhcnR1cEV2ZW50ID0ge1xuXHRcdFx0dGltZTogRGF0ZS5ub3coKSxcblx0XHRcdGFjdGlvbjogJ3N0YXJ0aW5nJyxcblx0XHRcdGtpbmQ6IGV4dGVuc2lvbkhvc3RLaW5kVG9TdHJpbmcodGhpcy5raW5kKVxuXHRcdH07XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEV4dGVuc2lvbkhvc3RTdGFydHVwRXZlbnQsIEV4dGVuc2lvbkhvc3RTdGFydHVwQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25Ib3N0U3RhcnR1cCcsIHN0YXJ0aW5nVGVsZW1ldHJ5RXZlbnQpO1xuXG5cdFx0dGhpcy5fcHJveHkgPSB0aGlzLl9leHRlbnNpb25Ib3N0LnN0YXJ0KCkudGhlbihcblx0XHRcdChwcm90b2NvbCkgPT4ge1xuXG5cdFx0XHRcdC8vIFRyYWNrIGhlYWx0aHkgZXh0ZW5zaW9uIGhvc3Qgc3RhcnR1cFxuXHRcdFx0XHRjb25zdCBzdWNjZXNzVGVsZW1ldHJ5RXZlbnQ6IEV4dGVuc2lvbkhvc3RTdGFydHVwRXZlbnQgPSB7XG5cdFx0XHRcdFx0dGltZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0XHRhY3Rpb246ICdzdWNjZXNzJyxcblx0XHRcdFx0XHRraW5kOiBleHRlbnNpb25Ib3N0S2luZFRvU3RyaW5nKHRoaXMua2luZClcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEV4dGVuc2lvbkhvc3RTdGFydHVwRXZlbnQsIEV4dGVuc2lvbkhvc3RTdGFydHVwQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25Ib3N0U3RhcnR1cCcsIHN1Y2Nlc3NUZWxlbWV0cnlFdmVudCk7XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZUV4dGVuc2lvbkhvc3RDdXN0b21lcnModGhpcy5raW5kLCBwcm90b2NvbCk7XG5cdFx0XHR9LFxuXHRcdFx0KGVycikgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciByZWNlaXZlZCBmcm9tIHN0YXJ0aW5nIGV4dGVuc2lvbiBob3N0IChraW5kOiAke2V4dGVuc2lvbkhvc3RLaW5kVG9TdHJpbmcodGhpcy5raW5kKX0pYCk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblxuXHRcdFx0XHQvLyBUcmFjayBlcnJvcnMgZHVyaW5nIGV4dGVuc2lvbiBob3N0IHN0YXJ0dXBcblx0XHRcdFx0Y29uc3QgZmFpbHVyZVRlbGVtZXRyeUV2ZW50OiBFeHRlbnNpb25Ib3N0U3RhcnR1cEV2ZW50ID0ge1xuXHRcdFx0XHRcdHRpbWU6IERhdGUubm93KCksXG5cdFx0XHRcdFx0YWN0aW9uOiAnZXJyb3InLFxuXHRcdFx0XHRcdGtpbmQ6IGV4dGVuc2lvbkhvc3RLaW5kVG9TdHJpbmcodGhpcy5raW5kKVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGlmIChlcnIgJiYgZXJyLm5hbWUpIHtcblx0XHRcdFx0XHRmYWlsdXJlVGVsZW1ldHJ5RXZlbnQuZXJyb3JOYW1lID0gZXJyLm5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVyciAmJiBlcnIubWVzc2FnZSkge1xuXHRcdFx0XHRcdGZhaWx1cmVUZWxlbWV0cnlFdmVudC5lcnJvck1lc3NhZ2UgPSBlcnIubWVzc2FnZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXJyICYmIGVyci5zdGFjaykge1xuXHRcdFx0XHRcdGZhaWx1cmVUZWxlbWV0cnlFdmVudC5lcnJvclN0YWNrID0gZXJyLnN0YWNrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFeHRlbnNpb25Ib3N0U3RhcnR1cEV2ZW50LCBFeHRlbnNpb25Ib3N0U3RhcnR1cENsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uSG9zdFN0YXJ0dXAnLCBmYWlsdXJlVGVsZW1ldHJ5RXZlbnQpO1xuXG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdCk7XG5cdFx0dGhpcy5fcHJveHkudGhlbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9oYXNTdGFydGVkID0gdHJ1ZTtcblx0XHRcdGluaXRpYWxBY3RpdmF0aW9uRXZlbnRzLmZvckVhY2goKGFjdGl2YXRpb25FdmVudCkgPT4gdGhpcy5hY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50LCBBY3RpdmF0aW9uS2luZC5Ob3JtYWwpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyTGF0ZW5jeVRlc3RQcm92aWRlcih7XG5cdFx0XHRcdG1lYXN1cmU6ICgpID0+IHRoaXMubWVhc3VyZSgpXG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZGlzY29ubmVjdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25Ib3N0Py5kaXNjb25uZWN0Py4oKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2V4dGVuc2lvbkhvc3Q/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9ycGNQcm90b2NvbD8uZGlzcG9zZSgpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX2N1c3RvbWVycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgY3VzdG9tZXIgPSB0aGlzLl9jdXN0b21lcnNbaV07XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjdXN0b21lci5kaXNwb3NlKCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0ZXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3Byb3h5ID0gbnVsbDtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbWVhc3VyZSgpOiBQcm9taXNlPEV4dEhvc3RMYXRlbmN5UmVzdWx0IHwgbnVsbD4ge1xuXHRcdGNvbnN0IHByb3h5ID0gYXdhaXQgdGhpcy5fcHJveHk7XG5cdFx0aWYgKCFwcm94eSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IGxhdGVuY3kgPSBhd2FpdCB0aGlzLl9tZWFzdXJlTGF0ZW5jeShwcm94eSk7XG5cdFx0Y29uc3QgZG93biA9IGF3YWl0IHRoaXMuX21lYXN1cmVEb3duKHByb3h5KTtcblx0XHRjb25zdCB1cCA9IGF3YWl0IHRoaXMuX21lYXN1cmVVcChwcm94eSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlbW90ZUF1dGhvcml0eTogdGhpcy5fZXh0ZW5zaW9uSG9zdC5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHRsYXRlbmN5LFxuXHRcdFx0ZG93bixcblx0XHRcdHVwXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNSZWFkeSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faGFzU3RhcnRlZDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZWFkeSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9wcm94eTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX21lYXN1cmVMYXRlbmN5KHByb3h5OiBJRXh0ZW5zaW9uSG9zdFByb3h5KTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRjb25zdCBDT1VOVCA9IDEwO1xuXG5cdFx0bGV0IHN1bSA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBDT1VOVDsgaSsrKSB7XG5cdFx0XHRjb25zdCBzdyA9IFN0b3BXYXRjaC5jcmVhdGUoKTtcblx0XHRcdGF3YWl0IHByb3h5LnRlc3RfbGF0ZW5jeShpKTtcblx0XHRcdHN3LnN0b3AoKTtcblx0XHRcdHN1bSArPSBzdy5lbGFwc2VkKCk7XG5cdFx0fVxuXHRcdHJldHVybiAoc3VtIC8gQ09VTlQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NvbnZlcnQoYnl0ZUNvdW50OiBudW1iZXIsIGVsYXBzZWRNaWxsaXM6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIChieXRlQ291bnQgKiAxMDAwICogOCkgLyBlbGFwc2VkTWlsbGlzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbWVhc3VyZVVwKHByb3h5OiBJRXh0ZW5zaW9uSG9zdFByb3h5KTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRjb25zdCBTSVpFID0gMTAgKiAxMDI0ICogMTAyNDsgLy8gMTBNQlxuXG5cdFx0Y29uc3QgYnVmZiA9IFZTQnVmZmVyLmFsbG9jKFNJWkUpO1xuXHRcdGNvbnN0IHZhbHVlID0gTWF0aC5jZWlsKE1hdGgucmFuZG9tKCkgKiAyNTYpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYnVmZi5ieXRlTGVuZ3RoOyBpKyspIHtcblx0XHRcdGJ1ZmYud3JpdGVVSW50OChpLCB2YWx1ZSk7XG5cdFx0fVxuXHRcdGNvbnN0IHN3ID0gU3RvcFdhdGNoLmNyZWF0ZSgpO1xuXHRcdGF3YWl0IHByb3h5LnRlc3RfdXAoYnVmZik7XG5cdFx0c3cuc3RvcCgpO1xuXHRcdHJldHVybiBFeHRlbnNpb25Ib3N0TWFuYWdlci5fY29udmVydChTSVpFLCBzdy5lbGFwc2VkKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbWVhc3VyZURvd24ocHJveHk6IElFeHRlbnNpb25Ib3N0UHJveHkpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IFNJWkUgPSAxMCAqIDEwMjQgKiAxMDI0OyAvLyAxME1CXG5cblx0XHRjb25zdCBzdyA9IFN0b3BXYXRjaC5jcmVhdGUoKTtcblx0XHRhd2FpdCBwcm94eS50ZXN0X2Rvd24oU0laRSk7XG5cdFx0c3cuc3RvcCgpO1xuXHRcdHJldHVybiBFeHRlbnNpb25Ib3N0TWFuYWdlci5fY29udmVydChTSVpFLCBzdy5lbGFwc2VkKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRXh0ZW5zaW9uSG9zdEN1c3RvbWVycyhraW5kOiBFeHRlbnNpb25Ib3N0S2luZCwgcHJvdG9jb2w6IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sKTogSUV4dGVuc2lvbkhvc3RQcm94eSB7XG5cblx0XHRsZXQgbG9nZ2VyOiBJUlBDUHJvdG9jb2xMb2dnZXIgfCBudWxsID0gbnVsbDtcblx0XHRpZiAoTE9HX0VYVEVOU0lPTl9IT1NUX0NPTU1VTklDQVRJT04gfHwgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmxvZ0V4dGVuc2lvbkhvc3RDb21tdW5pY2F0aW9uKSB7XG5cdFx0XHRsb2dnZXIgPSBuZXcgUlBDTG9nZ2VyKGtpbmQpO1xuXHRcdH0gZWxzZSBpZiAoVGVsZW1ldHJ5UlBDTG9nZ2VyLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRsb2dnZXIgPSBuZXcgVGVsZW1ldHJ5UlBDTG9nZ2VyKHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JwY1Byb3RvY29sID0gbmV3IFJQQ1Byb3RvY29sKHByb3RvY29sLCBsb2dnZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JwY1Byb3RvY29sLm9uRGlkQ2hhbmdlUmVzcG9uc2l2ZVN0YXRlKChyZXNwb25zaXZlU3RhdGU6IFJlc3BvbnNpdmVTdGF0ZSkgPT4gdGhpcy5fb25EaWRDaGFuZ2VSZXNwb25zaXZlU3RhdGUuZmlyZShyZXNwb25zaXZlU3RhdGUpKSk7XG5cdFx0bGV0IGV4dGVuc2lvbkhvc3RQcm94eTogSUV4dGVuc2lvbkhvc3RQcm94eSB8IG51bGwgPSBudWxsIGFzIElFeHRlbnNpb25Ib3N0UHJveHkgfCBudWxsO1xuXHRcdGxldCBtYWluUHJveHlJZGVudGlmaWVyczogUHJveHlJZGVudGlmaWVyPGFueT5bXSA9IFtdO1xuXHRcdGNvbnN0IGV4dEhvc3RDb250ZXh0OiBJSW50ZXJuYWxFeHRIb3N0Q29udGV4dCA9IHtcblx0XHRcdHJlbW90ZUF1dGhvcml0eTogdGhpcy5fZXh0ZW5zaW9uSG9zdC5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHRleHRlbnNpb25Ib3N0S2luZDogdGhpcy5raW5kLFxuXHRcdFx0Z2V0UHJveHk6IDxUPihpZGVudGlmaWVyOiBQcm94eUlkZW50aWZpZXI8VD4pOiBQcm94aWVkPFQ+ID0+IHRoaXMuX3JwY1Byb3RvY29sIS5nZXRQcm94eShpZGVudGlmaWVyKSxcblx0XHRcdHNldDogPFQsIFIgZXh0ZW5kcyBUPihpZGVudGlmaWVyOiBQcm94eUlkZW50aWZpZXI8VD4sIGluc3RhbmNlOiBSKTogUiA9PiB0aGlzLl9ycGNQcm90b2NvbCEuc2V0KGlkZW50aWZpZXIsIGluc3RhbmNlKSxcblx0XHRcdGRpc3Bvc2U6ICgpOiB2b2lkID0+IHRoaXMuX3JwY1Byb3RvY29sIS5kaXNwb3NlKCksXG5cdFx0XHRhc3NlcnRSZWdpc3RlcmVkOiAoaWRlbnRpZmllcnM6IFByb3h5SWRlbnRpZmllcjxhbnk+W10pOiB2b2lkID0+IHRoaXMuX3JwY1Byb3RvY29sIS5hc3NlcnRSZWdpc3RlcmVkKGlkZW50aWZpZXJzKSxcblx0XHRcdGRyYWluOiAoKTogUHJvbWlzZTx2b2lkPiA9PiB0aGlzLl9ycGNQcm90b2NvbCEuZHJhaW4oKSxcblxuXHRcdFx0Ly8jcmVnaW9uIGludGVybmFsXG5cdFx0XHRpbnRlcm5hbEV4dGVuc2lvblNlcnZpY2U6IHRoaXMuX2ludGVybmFsRXh0ZW5zaW9uU2VydmljZSxcblx0XHRcdF9zZXRFeHRlbnNpb25Ib3N0UHJveHk6ICh2YWx1ZTogSUV4dGVuc2lvbkhvc3RQcm94eSk6IHZvaWQgPT4ge1xuXHRcdFx0XHRleHRlbnNpb25Ib3N0UHJveHkgPSB2YWx1ZTtcblx0XHRcdH0sXG5cdFx0XHRfc2V0QWxsTWFpblByb3h5SWRlbnRpZmllcnM6ICh2YWx1ZTogUHJveHlJZGVudGlmaWVyPGFueT5bXSk6IHZvaWQgPT4ge1xuXHRcdFx0XHRtYWluUHJveHlJZGVudGlmaWVycyA9IHZhbHVlO1xuXHRcdFx0fSxcblx0XHRcdC8vI2VuZHJlZ2lvblxuXHRcdH07XG5cblx0XHQvLyBOYW1lZCBjdXN0b21lcnNcblx0XHRjb25zdCBuYW1lZEN1c3RvbWVycyA9IEV4dEhvc3RDdXN0b21lcnNSZWdpc3RyeS5nZXROYW1lZEN1c3RvbWVycygpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBuYW1lZEN1c3RvbWVycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgW2lkLCBjdG9yXSA9IG5hbWVkQ3VzdG9tZXJzW2ldO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShjdG9yLCBleHRIb3N0Q29udGV4dCk7XG5cdFx0XHRcdHRoaXMuX2N1c3RvbWVycy5wdXNoKGluc3RhbmNlKTtcblx0XHRcdFx0dGhpcy5fcnBjUHJvdG9jb2wuc2V0KGlkLCBpbnN0YW5jZSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgQ2Fubm90IGluc3RhbnRpYXRlIG5hbWVkIGN1c3RvbWVyOiAnJHtpZC5zaWR9J2ApO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdGVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEN1c3RvbWVyc1xuXHRcdGNvbnN0IGN1c3RvbWVycyA9IEV4dEhvc3RDdXN0b21lcnNSZWdpc3RyeS5nZXRDdXN0b21lcnMoKTtcblx0XHRmb3IgKGNvbnN0IGN0b3Igb2YgY3VzdG9tZXJzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKGN0b3IsIGV4dEhvc3RDb250ZXh0KTtcblx0XHRcdFx0dGhpcy5fY3VzdG9tZXJzLnB1c2goaW5zdGFuY2UpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0ZXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFleHRlbnNpb25Ib3N0UHJveHkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTWlzc2luZyBJRXh0ZW5zaW9uSG9zdFByb3h5IWApO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIHRoYXQgbm8gbmFtZWQgY3VzdG9tZXJzIGFyZSBtaXNzaW5nXG5cdFx0dGhpcy5fcnBjUHJvdG9jb2wuYXNzZXJ0UmVnaXN0ZXJlZChtYWluUHJveHlJZGVudGlmaWVycyk7XG5cblx0XHRyZXR1cm4gZXh0ZW5zaW9uSG9zdFByb3h5O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGFjdGl2YXRlKGV4dGVuc2lvbjogRXh0ZW5zaW9uSWRlbnRpZmllciwgcmVhc29uOiBFeHRlbnNpb25BY3RpdmF0aW9uUmVhc29uKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcHJveHkgPSBhd2FpdCB0aGlzLl9wcm94eTtcblx0XHRpZiAoIXByb3h5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBwcm94eS5hY3RpdmF0ZShleHRlbnNpb24sIHJlYXNvbik7XG5cdH1cblxuXHRwdWJsaWMgYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudDogc3RyaW5nLCBhY3RpdmF0aW9uS2luZDogQWN0aXZhdGlvbktpbmQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2NhY2hlZEFjdGl2YXRpb25FdmVudHMuaGFzKGFjdGl2YXRpb25FdmVudCkpIHtcblx0XHRcdHRoaXMuX2NhY2hlZEFjdGl2YXRpb25FdmVudHMuc2V0KGFjdGl2YXRpb25FdmVudCwgdGhpcy5fYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudCwgYWN0aXZhdGlvbktpbmQpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlZEFjdGl2YXRpb25FdmVudHMuZ2V0KGFjdGl2YXRpb25FdmVudCkhO1xuXHR9XG5cblx0cHVibGljIGFjdGl2YXRpb25FdmVudElzRG9uZShhY3RpdmF0aW9uRXZlbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlZEFjdGl2YXRpb25FdmVudHMuaGFzKGFjdGl2YXRpb25FdmVudCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50OiBzdHJpbmcsIGFjdGl2YXRpb25LaW5kOiBBY3RpdmF0aW9uS2luZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fcHJveHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcHJveHkgPSBhd2FpdCB0aGlzLl9wcm94eTtcblx0XHRpZiAoIXByb3h5KSB7XG5cdFx0XHQvLyB0aGlzIGNhc2UgaXMgYWxyZWFkeSBjb3ZlcmVkIGFib3ZlIGFuZCBsb2dnZWQuXG5cdFx0XHQvLyBpLmUuIHRoZSBleHRlbnNpb24gaG9zdCBjb3VsZCBub3QgYmUgc3RhcnRlZFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fZXh0ZW5zaW9uSG9zdC5leHRlbnNpb25zIS5jb250YWluc0FjdGl2YXRpb25FdmVudChhY3RpdmF0aW9uRXZlbnQpKSB7XG5cdFx0XHR0aGlzLl9yZXNvbHZlZEFjdGl2YXRpb25FdmVudHMuYWRkKGFjdGl2YXRpb25FdmVudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgcHJveHkuYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudCwgYWN0aXZhdGlvbktpbmQpO1xuXHRcdHRoaXMuX3Jlc29sdmVkQWN0aXZhdGlvbkV2ZW50cy5hZGQoYWN0aXZhdGlvbkV2ZW50KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRJbnNwZWN0UG9ydCh0cnlFbmFibGVJbnNwZWN0b3I6IGJvb2xlYW4pOiBQcm9taXNlPElFeHRlbnNpb25JbnNwZWN0SW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLl9leHRlbnNpb25Ib3N0KSB7XG5cdFx0XHRpZiAodHJ5RW5hYmxlSW5zcGVjdG9yKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvbkhvc3QuZW5hYmxlSW5zcGVjdFBvcnQoKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBvcnQgPSB0aGlzLl9leHRlbnNpb25Ib3N0LmdldEluc3BlY3RQb3J0KCk7XG5cdFx0XHRpZiAocG9ydCkge1xuXHRcdFx0XHRyZXR1cm4gcG9ydDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlc29sdmVBdXRob3JpdHkocmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcsIHJlc29sdmVBdHRlbXB0OiBudW1iZXIpOiBQcm9taXNlPElSZXNvbHZlQXV0aG9yaXR5UmVzdWx0PiB7XG5cdFx0Y29uc3Qgc3cgPSBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKTtcblx0XHRjb25zdCBwcmVmaXggPSAoKSA9PiBgWyR7ZXh0ZW5zaW9uSG9zdEtpbmRUb1N0cmluZyh0aGlzLl9leHRlbnNpb25Ib3N0LnJ1bm5pbmdMb2NhdGlvbi5raW5kKX0ke3RoaXMuX2V4dGVuc2lvbkhvc3QucnVubmluZ0xvY2F0aW9uLmFmZmluaXR5fV1bcmVzb2x2ZUF1dGhvcml0eSgke2dldFJlbW90ZUF1dGhvcml0eVByZWZpeChyZW1vdGVBdXRob3JpdHkpfSwke3Jlc29sdmVBdHRlbXB0fSldWyR7c3cuZWxhcHNlZCgpfW1zXSBgO1xuXHRcdGNvbnN0IGxvZ0luZm8gPSAobXNnOiBzdHJpbmcpID0+IHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtwcmVmaXgoKX0ke21zZ31gKTtcblx0XHRjb25zdCBsb2dFcnJvciA9IChtc2c6IHN0cmluZywgZXJyOiBhbnkgPSB1bmRlZmluZWQpID0+IHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYCR7cHJlZml4KCl9JHttc2d9YCwgZXJyKTtcblxuXHRcdGxvZ0luZm8oYG9idGFpbmluZyBwcm94eS4uLmApO1xuXHRcdGNvbnN0IHByb3h5ID0gYXdhaXQgdGhpcy5fcHJveHk7XG5cdFx0aWYgKCFwcm94eSkge1xuXHRcdFx0bG9nRXJyb3IoYG5vIHByb3h5YCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiAnZXJyb3InLFxuXHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdG1lc3NhZ2U6IGBDYW5ub3QgcmVzb2x2ZSBhdXRob3JpdHlgLFxuXHRcdFx0XHRcdGNvZGU6IFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3JDb2RlLlVua25vd24sXG5cdFx0XHRcdFx0ZGV0YWlsOiB1bmRlZmluZWRcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0bG9nSW5mbyhgaW52b2tpbmcuLi5gKTtcblx0XHRjb25zdCBpbnRlcnZhbExvZ2dlciA9IG5ldyBJbnRlcnZhbFRpbWVyKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGludGVydmFsTG9nZ2VyLmNhbmNlbEFuZFNldCgoKSA9PiBsb2dJbmZvKCd3YWl0aW5nLi4uJyksIDEwMDApO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZXJSZXN1bHQgPSBhd2FpdCBwcm94eS5yZXNvbHZlQXV0aG9yaXR5KHJlbW90ZUF1dGhvcml0eSwgcmVzb2x2ZUF0dGVtcHQpO1xuXHRcdFx0aW50ZXJ2YWxMb2dnZXIuZGlzcG9zZSgpO1xuXHRcdFx0aWYgKHJlc29sdmVyUmVzdWx0LnR5cGUgPT09ICdvaycpIHtcblx0XHRcdFx0bG9nSW5mbyhgcmV0dXJuZWQgJHtyZXNvbHZlclJlc3VsdC52YWx1ZS5hdXRob3JpdHkuY29ubmVjdFRvfWApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bG9nRXJyb3IoYHJldHVybmVkIGFuIGVycm9yYCwgcmVzb2x2ZXJSZXN1bHQuZXJyb3IpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc29sdmVyUmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aW50ZXJ2YWxMb2dnZXIuZGlzcG9zZSgpO1xuXHRcdFx0bG9nRXJyb3IoYHJldHVybmVkIGFuIGVycm9yYCwgZXJyKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0bWVzc2FnZTogZXJyLm1lc3NhZ2UsXG5cdFx0XHRcdFx0Y29kZTogUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvckNvZGUuVW5rbm93bixcblx0XHRcdFx0XHRkZXRhaWw6IGVyclxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRDYW5vbmljYWxVUkkocmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcsIHVyaTogVVJJKTogUHJvbWlzZTxVUkkgfCBudWxsPiB7XG5cdFx0Y29uc3QgcHJveHkgPSBhd2FpdCB0aGlzLl9wcm94eTtcblx0XHRpZiAoIXByb3h5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZXNvbHZlIGNhbm9uaWNhbCBVUklgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHByb3h5LmdldENhbm9uaWNhbFVSSShyZW1vdGVBdXRob3JpdHksIHVyaSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc3RhcnQoZXh0ZW5zaW9uUmVnaXN0cnlWZXJzaW9uSWQ6IG51bWJlciwgYWxsRXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIG15RXh0ZW5zaW9uczogRXh0ZW5zaW9uSWRlbnRpZmllcltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJveHkgPSBhd2FpdCB0aGlzLl9wcm94eTtcblx0XHRpZiAoIXByb3h5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRlbHRhRXh0ZW5zaW9ucyA9IHRoaXMuX2V4dGVuc2lvbkhvc3QuZXh0ZW5zaW9ucyEuc2V0KGV4dGVuc2lvblJlZ2lzdHJ5VmVyc2lvbklkLCBhbGxFeHRlbnNpb25zLCBteUV4dGVuc2lvbnMpO1xuXHRcdHJldHVybiBwcm94eS5zdGFydEV4dGVuc2lvbkhvc3QoZGVsdGFFeHRlbnNpb25zKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBleHRlbnNpb25UZXN0c0V4ZWN1dGUoKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRjb25zdCBwcm94eSA9IGF3YWl0IHRoaXMuX3Byb3h5O1xuXHRcdGlmICghcHJveHkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IG9idGFpbiBFeHRlbnNpb24gSG9zdCBQcm94eScpO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJveHkuZXh0ZW5zaW9uVGVzdHNFeGVjdXRlKCk7XG5cdH1cblxuXHRwdWJsaWMgcmVwcmVzZW50c1J1bm5pbmdMb2NhdGlvbihydW5uaW5nTG9jYXRpb246IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0LnJ1bm5pbmdMb2NhdGlvbi5lcXVhbHMocnVubmluZ0xvY2F0aW9uKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBkZWx0YUV4dGVuc2lvbnMoaW5jb21pbmdFeHRlbnNpb25zRGVsdGE6IElFeHRlbnNpb25EZXNjcmlwdGlvbkRlbHRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJveHkgPSBhd2FpdCB0aGlzLl9wcm94eTtcblx0XHRpZiAoIXByb3h5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG91dGdvaW5nRXh0ZW5zaW9uc0RlbHRhID0gdGhpcy5fZXh0ZW5zaW9uSG9zdC5leHRlbnNpb25zIS5kZWx0YShpbmNvbWluZ0V4dGVuc2lvbnNEZWx0YSk7XG5cdFx0aWYgKCFvdXRnb2luZ0V4dGVuc2lvbnNEZWx0YSkge1xuXHRcdFx0Ly8gVGhlIGV4dGVuc2lvbiBob3N0IGFscmVhZHkgaGFzIHRoaXMgdmVyc2lvbiBvZiB0aGUgZXh0ZW5zaW9ucy5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHByb3h5LmRlbHRhRXh0ZW5zaW9ucyhvdXRnb2luZ0V4dGVuc2lvbnNEZWx0YSk7XG5cdH1cblxuXHRwdWJsaWMgY29udGFpbnNFeHRlbnNpb24oZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdC5leHRlbnNpb25zPy5jb250YWluc0V4dGVuc2lvbihleHRlbnNpb25JZCkgPz8gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc2V0UmVtb3RlRW52aXJvbm1lbnQoZW52OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB8IG51bGwgfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb3h5ID0gYXdhaXQgdGhpcy5fcHJveHk7XG5cdFx0aWYgKCFwcm94eSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcm94eS5zZXRSZW1vdGVFbnZpcm9ubWVudChlbnYpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmcmllbmRseUV4dEhvc3ROYW1lKGtpbmQ6IEV4dGVuc2lvbkhvc3RLaW5kLCBwaWQ6IG51bWJlciB8IG51bGwpIHtcblx0aWYgKHBpZCkge1xuXHRcdHJldHVybiBgJHtleHRlbnNpb25Ib3N0S2luZFRvU3RyaW5nKGtpbmQpfSBwaWQ6ICR7cGlkfWA7XG5cdH1cblx0cmV0dXJuIGAke2V4dGVuc2lvbkhvc3RLaW5kVG9TdHJpbmcoa2luZCl9YDtcbn1cblxuY29uc3QgY29sb3JUYWJsZXMgPSBbXG5cdFsnIzI5NzdCMScsICcjRkM4MDJEJywgJyMzNEExM0EnLCAnI0QzMjgyRicsICcjOTM2NkJBJ10sXG5cdFsnIzhCNTY0QycsICcjRTE3N0MwJywgJyM3RjdGN0YnLCAnI0JCQkUzRCcsICcjMkVCRUNEJ11cbl07XG5cbmZ1bmN0aW9uIHByZXR0eVdpdGhvdXRBcnJheXMoZGF0YTogYW55KTogYW55IHtcblx0aWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcblx0XHRyZXR1cm4gZGF0YTtcblx0fVxuXHRpZiAoZGF0YSAmJiB0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIGRhdGEudG9TdHJpbmcgPT09ICdmdW5jdGlvbicpIHtcblx0XHRjb25zdCByZXN1bHQgPSBkYXRhLnRvU3RyaW5nKCk7XG5cdFx0aWYgKHJlc3VsdCAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBkYXRhO1xufVxuXG5mdW5jdGlvbiBwcmV0dHkoZGF0YTogYW55KTogYW55IHtcblx0aWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcblx0XHRyZXR1cm4gZGF0YS5tYXAocHJldHR5V2l0aG91dEFycmF5cyk7XG5cdH1cblx0cmV0dXJuIHByZXR0eVdpdGhvdXRBcnJheXMoZGF0YSk7XG59XG5cbmNsYXNzIFJQQ0xvZ2dlciBpbXBsZW1lbnRzIElSUENQcm90b2NvbExvZ2dlciB7XG5cblx0cHJpdmF0ZSBfdG90YWxJbmNvbWluZyA9IDA7XG5cdHByaXZhdGUgX3RvdGFsT3V0Z29pbmcgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2tpbmQ6IEV4dGVuc2lvbkhvc3RLaW5kXG5cdCkgeyB9XG5cblx0cHJpdmF0ZSBfbG9nKGRpcmVjdGlvbjogc3RyaW5nLCB0b3RhbExlbmd0aDogbnVtYmVyLCBtc2dMZW5ndGg6IG51bWJlciwgcmVxOiBudW1iZXIsIGluaXRpYXRvcjogUmVxdWVzdEluaXRpYXRvciwgc3RyOiBzdHJpbmcsIGRhdGE6IGFueSk6IHZvaWQge1xuXHRcdGRhdGEgPSBwcmV0dHkoZGF0YSk7XG5cblx0XHRjb25zdCBjb2xvclRhYmxlID0gY29sb3JUYWJsZXNbaW5pdGlhdG9yXTtcblx0XHRjb25zdCBjb2xvciA9IExPR19VU0VfQ09MT1JTID8gY29sb3JUYWJsZVtyZXEgJSBjb2xvclRhYmxlLmxlbmd0aF0gOiAnIzAwMDAwMCc7XG5cdFx0bGV0IGFyZ3MgPSBbYCVjWyR7ZXh0ZW5zaW9uSG9zdEtpbmRUb1N0cmluZyh0aGlzLl9raW5kKX1dWyR7ZGlyZWN0aW9ufV0lY1ske1N0cmluZyh0b3RhbExlbmd0aCkucGFkU3RhcnQoNyl9XSVjW2xlbjogJHtTdHJpbmcobXNnTGVuZ3RoKS5wYWRTdGFydCg1KX1dJWMke1N0cmluZyhyZXEpLnBhZFN0YXJ0KDUpfSAtICR7c3RyfWAsICdjb2xvcjogZGFya2dyZWVuJywgJ2NvbG9yOiBncmV5JywgJ2NvbG9yOiBncmV5JywgYGNvbG9yOiAke2NvbG9yfWBdO1xuXHRcdGlmICgvXFwoJC8udGVzdChzdHIpKSB7XG5cdFx0XHRhcmdzID0gYXJncy5jb25jYXQoZGF0YSk7XG5cdFx0XHRhcmdzLnB1c2goJyknKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXJncy5wdXNoKGRhdGEpO1xuXHRcdH1cblx0XHRjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBhcmdzIGFzIFtzdHJpbmcsIC4uLnN0cmluZ1tdXSk7XG5cdH1cblxuXHRsb2dJbmNvbWluZyhtc2dMZW5ndGg6IG51bWJlciwgcmVxOiBudW1iZXIsIGluaXRpYXRvcjogUmVxdWVzdEluaXRpYXRvciwgc3RyOiBzdHJpbmcsIGRhdGE/OiBhbnkpOiB2b2lkIHtcblx0XHR0aGlzLl90b3RhbEluY29taW5nICs9IG1zZ0xlbmd0aDtcblx0XHR0aGlzLl9sb2coJ0V4dCBcXHUyMTkyIFdpbicsIHRoaXMuX3RvdGFsSW5jb21pbmcsIG1zZ0xlbmd0aCwgcmVxLCBpbml0aWF0b3IsIHN0ciwgZGF0YSk7XG5cdH1cblxuXHRsb2dPdXRnb2luZyhtc2dMZW5ndGg6IG51bWJlciwgcmVxOiBudW1iZXIsIGluaXRpYXRvcjogUmVxdWVzdEluaXRpYXRvciwgc3RyOiBzdHJpbmcsIGRhdGE/OiBhbnkpOiB2b2lkIHtcblx0XHR0aGlzLl90b3RhbE91dGdvaW5nICs9IG1zZ0xlbmd0aDtcblx0XHR0aGlzLl9sb2coJ1dpbiBcXHUyMTkyIEV4dCcsIHRoaXMuX3RvdGFsT3V0Z29pbmcsIG1zZ0xlbmd0aCwgcmVxLCBpbml0aWF0b3IsIHN0ciwgZGF0YSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIFJQQ1RlbGVtZXRyeURhdGEge1xuXHR0eXBlOiBzdHJpbmc7XG5cdGxlbmd0aDogbnVtYmVyO1xufVxuXG50eXBlIFJQQ1RlbGVtZXRyeURhdGFDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdqcmlla2VuJztcblx0Y29tbWVudDogJ0luc2lnaHRzIGFib3V0IFJQQyBtZXNzYWdlIHNpemVzJztcblx0dHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSB0eXBlIG9mIHRoZSBSUEMgbWVzc2FnZScgfTtcblx0bGVuZ3RoOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGJ5dGUtbGVuZ3RoIG9mIHRoZSBSUEMgbWVzc2FnZScgfTtcbn07XG5cbmNsYXNzIFRlbGVtZXRyeVJQQ0xvZ2dlciBpbXBsZW1lbnRzIElSUENQcm90b2NvbExvZ2dlciB7XG5cblx0c3RhdGljIGlzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gTWF0aC5yYW5kb20oKSA8IDAuMDAwMTsgLy8gMC4wMSUgb2YgdXNlcnNcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdSZXF1ZXN0cyA9IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoQElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlKSB7IH1cblxuXHRsb2dJbmNvbWluZyhtc2dMZW5ndGg6IG51bWJlciwgcmVxOiBudW1iZXIsIGluaXRpYXRvcjogUmVxdWVzdEluaXRpYXRvciwgc3RyOiBzdHJpbmcpOiB2b2lkIHtcblxuXHRcdGlmIChpbml0aWF0b3IgPT09IFJlcXVlc3RJbml0aWF0b3IuTG9jYWxTaWRlICYmIC9ecmVjZWl2ZVJlcGx5KEVycik/Oi8udGVzdChzdHIpKSB7XG5cdFx0XHQvLyBsb2cgdGhlIHNpemUgb2YgcmVwbHkgbWVzc2FnZXNcblx0XHRcdGNvbnN0IHJlcXVlc3RTdHIgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZ2V0KHJlcSkgPz8gJ3Vua25vd25fcmVwbHknO1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLmRlbGV0ZShyZXEpO1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFJQQ1RlbGVtZXRyeURhdGEsIFJQQ1RlbGVtZXRyeURhdGFDbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbmhvc3QuaW5jb21pbmcnLCB7XG5cdFx0XHRcdHR5cGU6IGAke3N0cn0gJHtyZXF1ZXN0U3RyfWAsXG5cdFx0XHRcdGxlbmd0aDogbXNnTGVuZ3RoXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoaW5pdGlhdG9yID09PSBSZXF1ZXN0SW5pdGlhdG9yLk90aGVyU2lkZSAmJiAvXnJlY2VpdmVSZXF1ZXN0IC8udGVzdChzdHIpKSB7XG5cdFx0XHQvLyBpbmNvbWluZyByZXF1ZXN0XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UlBDVGVsZW1ldHJ5RGF0YSwgUlBDVGVsZW1ldHJ5RGF0YUNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uaG9zdC5pbmNvbWluZycsIHtcblx0XHRcdFx0dHlwZTogYCR7c3RyfWAsXG5cdFx0XHRcdGxlbmd0aDogbXNnTGVuZ3RoXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRsb2dPdXRnb2luZyhtc2dMZW5ndGg6IG51bWJlciwgcmVxOiBudW1iZXIsIGluaXRpYXRvcjogUmVxdWVzdEluaXRpYXRvciwgc3RyOiBzdHJpbmcpOiB2b2lkIHtcblxuXHRcdGlmIChpbml0aWF0b3IgPT09IFJlcXVlc3RJbml0aWF0b3IuTG9jYWxTaWRlICYmIHN0ci5zdGFydHNXaXRoKCdyZXF1ZXN0OiAnKSkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLnNldChyZXEsIHN0cik7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UlBDVGVsZW1ldHJ5RGF0YSwgUlBDVGVsZW1ldHJ5RGF0YUNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uaG9zdC5vdXRnb2luZycsIHtcblx0XHRcdFx0dHlwZTogc3RyLFxuXHRcdFx0XHRsZW5ndGg6IG1zZ0xlbmd0aFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBFeHRIb3N0TGF0ZW5jeVJlc3VsdCB7XG5cdHJlbW90ZUF1dGhvcml0eTogc3RyaW5nIHwgbnVsbDtcblx0dXA6IG51bWJlcjtcblx0ZG93bjogbnVtYmVyO1xuXHRsYXRlbmN5OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBFeHRIb3N0TGF0ZW5jeVByb3ZpZGVyIHtcblx0bWVhc3VyZSgpOiBQcm9taXNlPEV4dEhvc3RMYXRlbmN5UmVzdWx0IHwgbnVsbD47XG59XG5cbmNvbnN0IHByb3ZpZGVyczogRXh0SG9zdExhdGVuY3lQcm92aWRlcltdID0gW107XG5mdW5jdGlvbiByZWdpc3RlckxhdGVuY3lUZXN0UHJvdmlkZXIocHJvdmlkZXI6IEV4dEhvc3RMYXRlbmN5UHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdHByb3ZpZGVycy5wdXNoKHByb3ZpZGVyKTtcblx0cmV0dXJuIHtcblx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHByb3ZpZGVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAocHJvdmlkZXJzW2ldID09PSBwcm92aWRlcikge1xuXHRcdFx0XHRcdHByb3ZpZGVycy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xufVxuXG5mdW5jdGlvbiBnZXRMYXRlbmN5VGVzdFByb3ZpZGVycygpOiBFeHRIb3N0TGF0ZW5jeVByb3ZpZGVyW10ge1xuXHRyZXR1cm4gcHJvdmlkZXJzLnNsaWNlKDApO1xufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTWVhc3VyZUV4dEhvc3RMYXRlbmN5QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLm1lYXN1cmVFeHRIb3N0TGF0ZW5jeScsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignbWVhc3VyZUV4dEhvc3RMYXRlbmN5JywgXCJNZWFzdXJlIEV4dGVuc2lvbiBIb3N0IExhdGVuY3lcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG1lYXN1cmVtZW50cyA9IGF3YWl0IFByb21pc2UuYWxsKGdldExhdGVuY3lUZXN0UHJvdmlkZXJzKCkubWFwKHByb3ZpZGVyID0+IHByb3ZpZGVyLm1lYXN1cmUoKSkpO1xuXHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB1bmRlZmluZWQsIGNvbnRlbnRzOiBtZWFzdXJlbWVudHMubWFwKE1lYXN1cmVFeHRIb3N0TGF0ZW5jeUFjdGlvbi5fcHJpbnQpLmpvaW4oJ1xcblxcbicpLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3ByaW50KG06IEV4dEhvc3RMYXRlbmN5UmVzdWx0IHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0aWYgKCFtKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiBgJHttLnJlbW90ZUF1dGhvcml0eSA/IGBBdXRob3JpdHk6ICR7bS5yZW1vdGVBdXRob3JpdHl9XFxuYCA6IGBgfVJvdW5kdHJpcCBsYXRlbmN5OiAke20ubGF0ZW5jeS50b0ZpeGVkKDMpfW1zXFxuVXA6ICR7TWVhc3VyZUV4dEhvc3RMYXRlbmN5QWN0aW9uLl9wcmludFNwZWVkKG0udXApfVxcbkRvd246ICR7TWVhc3VyZUV4dEhvc3RMYXRlbmN5QWN0aW9uLl9wcmludFNwZWVkKG0uZG93bil9XFxuYDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9wcmludFNwZWVkKG46IG51bWJlcik6IHN0cmluZyB7XG5cdFx0aWYgKG4gPD0gMTAyNCkge1xuXHRcdFx0cmV0dXJuIGAke259IGJwc2A7XG5cdFx0fVxuXHRcdGlmIChuIDwgMTAyNCAqIDEwMjQpIHtcblx0XHRcdHJldHVybiBgJHsobiAvIDEwMjQpLnRvRml4ZWQoMSl9IGticHNgO1xuXHRcdH1cblx0XHRyZXR1cm4gYCR7KG4gLyAxMDI0IC8gMTAyNCkudG9GaXhlZCgxKX0gTWJwc2A7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQjtBQUN6QixZQUFZLFlBQVk7QUFDeEIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUErQjtBQUN4QyxTQUFTLGlCQUFpQjtBQUcxQixZQUFZLFNBQVM7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLHVCQUF1QjtBQUV6QyxTQUFTLDZCQUErQztBQUN4RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQyxnQ0FBZ0M7QUFDM0UsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxnQ0FBeUQ7QUFDbEUsU0FBNEIsaUNBQWlDO0FBSzdELFNBQVMsc0JBQXlJO0FBRWxKLFNBQTZCLGFBQWEsd0JBQXlDO0FBR25GLE1BQU0sbUNBQW1DO0FBQ3pDLE1BQU0saUJBQWlCO0FBc0JoQixJQUFNLHVCQUFOLGNBQW1DLFdBQTRDO0FBQUEsRUFrQ3JGLFlBQ0MsZUFDQSx5QkFDaUIsMkJBQ3VCLHVCQUNPLHFCQUNYLG1CQUNOLGFBQzdCO0FBQ0QsVUFBTTtBQU5XO0FBQ3VCO0FBQ087QUFDWDtBQUNOO0FBckMvQixTQUFpQiw4QkFBd0QsS0FBSyxVQUFVLElBQUksUUFBeUIsQ0FBQztBQUN0SCxTQUFnQiw2QkFBcUQsS0FBSyw0QkFBNEI7QUFXdEcsU0FBUSxjQUF1QjtBQTRCOUIsU0FBSywwQkFBMEIsb0JBQUksSUFBMkI7QUFDOUQsU0FBSyw0QkFBNEIsb0JBQUksSUFBWTtBQUNqRCxTQUFLLGVBQWU7QUFDcEIsU0FBSyxhQUFhLENBQUM7QUFFbkIsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxZQUFZLEtBQUssZUFBZTtBQUVyQyxVQUFNLHlCQUFvRDtBQUFBLE1BQ3pELE1BQU0sS0FBSyxJQUFJO0FBQUEsTUFDZixRQUFRO0FBQUEsTUFDUixNQUFNLDBCQUEwQixLQUFLLElBQUk7QUFBQSxJQUMxQztBQUNBLFNBQUssa0JBQWtCLFdBQTBFLHdCQUF3QixzQkFBc0I7QUFFL0ksU0FBSyxTQUFTLEtBQUssZUFBZSxNQUFNLEVBQUU7QUFBQSxNQUN6QyxDQUFDLGFBQWE7QUFHYixjQUFNLHdCQUFtRDtBQUFBLFVBQ3hELE1BQU0sS0FBSyxJQUFJO0FBQUEsVUFDZixRQUFRO0FBQUEsVUFDUixNQUFNLDBCQUEwQixLQUFLLElBQUk7QUFBQSxRQUMxQztBQUNBLGFBQUssa0JBQWtCLFdBQTBFLHdCQUF3QixxQkFBcUI7QUFFOUksZUFBTyxLQUFLLDhCQUE4QixLQUFLLE1BQU0sUUFBUTtBQUFBLE1BQzlEO0FBQUEsTUFDQSxDQUFDLFFBQVE7QUFDUixhQUFLLFlBQVksTUFBTSxzREFBc0QsMEJBQTBCLEtBQUssSUFBSSxDQUFDLEdBQUc7QUFDcEgsYUFBSyxZQUFZLE1BQU0sR0FBRztBQUcxQixjQUFNLHdCQUFtRDtBQUFBLFVBQ3hELE1BQU0sS0FBSyxJQUFJO0FBQUEsVUFDZixRQUFRO0FBQUEsVUFDUixNQUFNLDBCQUEwQixLQUFLLElBQUk7QUFBQSxRQUMxQztBQUVBLFlBQUksT0FBTyxJQUFJLE1BQU07QUFDcEIsZ0NBQXNCLFlBQVksSUFBSTtBQUFBLFFBQ3ZDO0FBQ0EsWUFBSSxPQUFPLElBQUksU0FBUztBQUN2QixnQ0FBc0IsZUFBZSxJQUFJO0FBQUEsUUFDMUM7QUFDQSxZQUFJLE9BQU8sSUFBSSxPQUFPO0FBQ3JCLGdDQUFzQixhQUFhLElBQUk7QUFBQSxRQUN4QztBQUNBLGFBQUssa0JBQWtCLFdBQTBFLHdCQUF3QixxQkFBcUI7QUFFOUksZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsU0FBSyxPQUFPLEtBQUssTUFBTTtBQUN0QixXQUFLLGNBQWM7QUFDbkIsOEJBQXdCLFFBQVEsQ0FBQyxvQkFBb0IsS0FBSyxnQkFBZ0IsaUJBQWlCLGVBQWUsTUFBTSxDQUFDO0FBQ2pILFdBQUssVUFBVSw0QkFBNEI7QUFBQSxRQUMxQyxTQUFTLE1BQU0sS0FBSyxRQUFRO0FBQUEsTUFDN0IsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBdEZBLElBQVcsTUFBcUI7QUFDL0IsV0FBTyxLQUFLLGVBQWU7QUFBQSxFQUM1QjtBQUFBLEVBRUEsSUFBVyxPQUEwQjtBQUNwQyxXQUFPLEtBQUssZUFBZSxnQkFBZ0I7QUFBQSxFQUM1QztBQUFBLEVBRUEsSUFBVyxVQUFnQztBQUMxQyxXQUFPLEtBQUssZUFBZTtBQUFBLEVBQzVCO0FBQUEsRUFFQSxJQUFXLGNBQXNCO0FBQ2hDLFdBQU8sb0JBQW9CLEtBQUssTUFBTSxLQUFLLEdBQUc7QUFBQSxFQUMvQztBQUFBLEVBMEVBLE1BQWEsYUFBNEI7QUFDeEMsVUFBTSxLQUFLLGdCQUFnQixhQUFhO0FBQUEsRUFDekM7QUFBQSxFQUVnQixVQUFnQjtBQUMvQixTQUFLLGdCQUFnQixRQUFRO0FBQzdCLFNBQUssY0FBYyxRQUFRO0FBRTNCLGFBQVMsSUFBSSxHQUFHLE1BQU0sS0FBSyxXQUFXLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDM0QsWUFBTSxXQUFXLEtBQUssV0FBVyxDQUFDO0FBQ2xDLFVBQUk7QUFDSCxpQkFBUyxRQUFRO0FBQUEsTUFDbEIsU0FBUyxLQUFLO0FBQ2IsZUFBTyxrQkFBa0IsR0FBRztBQUFBLE1BQzdCO0FBQUEsSUFDRDtBQUNBLFNBQUssU0FBUztBQUVkLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFBQSxFQUVBLE1BQWMsVUFBZ0Q7QUFDN0QsVUFBTSxRQUFRLE1BQU0sS0FBSztBQUN6QixRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxVQUFVLE1BQU0sS0FBSyxnQkFBZ0IsS0FBSztBQUNoRCxVQUFNLE9BQU8sTUFBTSxLQUFLLGFBQWEsS0FBSztBQUMxQyxVQUFNLEtBQUssTUFBTSxLQUFLLFdBQVcsS0FBSztBQUN0QyxXQUFPO0FBQUEsTUFDTixpQkFBaUIsS0FBSyxlQUFlO0FBQUEsTUFDckM7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxJQUFXLFVBQW1CO0FBQzdCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE1BQWEsUUFBdUI7QUFDbkMsVUFBTSxLQUFLO0FBQUEsRUFDWjtBQUFBLEVBRUEsTUFBYyxnQkFBZ0IsT0FBNkM7QUFDMUUsVUFBTSxRQUFRO0FBRWQsUUFBSSxNQUFNO0FBQ1YsYUFBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLEtBQUs7QUFDL0IsWUFBTSxLQUFLLFVBQVUsT0FBTztBQUM1QixZQUFNLE1BQU0sYUFBYSxDQUFDO0FBQzFCLFNBQUcsS0FBSztBQUNSLGFBQU8sR0FBRyxRQUFRO0FBQUEsSUFDbkI7QUFDQSxXQUFRLE1BQU07QUFBQSxFQUNmO0FBQUEsRUFFQSxPQUFlLFNBQVMsV0FBbUIsZUFBK0I7QUFDekUsV0FBUSxZQUFZLE1BQU8sSUFBSztBQUFBLEVBQ2pDO0FBQUEsRUFFQSxNQUFjLFdBQVcsT0FBNkM7QUFDckUsVUFBTSxPQUFPLEtBQUssT0FBTztBQUV6QixVQUFNLE9BQU8sU0FBUyxNQUFNLElBQUk7QUFDaEMsVUFBTSxRQUFRLEtBQUssS0FBSyxLQUFLLE9BQU8sSUFBSSxHQUFHO0FBQzNDLGFBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxZQUFZLEtBQUs7QUFDekMsV0FBSyxXQUFXLEdBQUcsS0FBSztBQUFBLElBQ3pCO0FBQ0EsVUFBTSxLQUFLLFVBQVUsT0FBTztBQUM1QixVQUFNLE1BQU0sUUFBUSxJQUFJO0FBQ3hCLE9BQUcsS0FBSztBQUNSLFdBQU8scUJBQXFCLFNBQVMsTUFBTSxHQUFHLFFBQVEsQ0FBQztBQUFBLEVBQ3hEO0FBQUEsRUFFQSxNQUFjLGFBQWEsT0FBNkM7QUFDdkUsVUFBTSxPQUFPLEtBQUssT0FBTztBQUV6QixVQUFNLEtBQUssVUFBVSxPQUFPO0FBQzVCLFVBQU0sTUFBTSxVQUFVLElBQUk7QUFDMUIsT0FBRyxLQUFLO0FBQ1IsV0FBTyxxQkFBcUIsU0FBUyxNQUFNLEdBQUcsUUFBUSxDQUFDO0FBQUEsRUFDeEQ7QUFBQSxFQUVRLDhCQUE4QixNQUF5QixVQUF3RDtBQUV0SCxRQUFJLFNBQW9DO0FBQ3hDLFFBQUksb0NBQW9DLEtBQUssb0JBQW9CLCtCQUErQjtBQUMvRixlQUFTLElBQUksVUFBVSxJQUFJO0FBQUEsSUFDNUIsV0FBVyxtQkFBbUIsVUFBVSxHQUFHO0FBQzFDLGVBQVMsSUFBSSxtQkFBbUIsS0FBSyxpQkFBaUI7QUFBQSxJQUN2RDtBQUVBLFNBQUssZUFBZSxJQUFJLFlBQVksVUFBVSxNQUFNO0FBQ3BELFNBQUssVUFBVSxLQUFLLGFBQWEsMkJBQTJCLENBQUMsb0JBQXFDLEtBQUssNEJBQTRCLEtBQUssZUFBZSxDQUFDLENBQUM7QUFDekosUUFBSSxxQkFBaUQ7QUFDckQsUUFBSSx1QkFBK0MsQ0FBQztBQUNwRCxVQUFNLGlCQUEwQztBQUFBLE1BQy9DLGlCQUFpQixLQUFLLGVBQWU7QUFBQSxNQUNyQyxtQkFBbUIsS0FBSztBQUFBLE1BQ3hCLFVBQVUsQ0FBSSxlQUErQyxLQUFLLGFBQWMsU0FBUyxVQUFVO0FBQUEsTUFDbkcsS0FBSyxDQUFpQixZQUFnQyxhQUFtQixLQUFLLGFBQWMsSUFBSSxZQUFZLFFBQVE7QUFBQSxNQUNwSCxTQUFTLE1BQVksS0FBSyxhQUFjLFFBQVE7QUFBQSxNQUNoRCxrQkFBa0IsQ0FBQyxnQkFBOEMsS0FBSyxhQUFjLGlCQUFpQixXQUFXO0FBQUEsTUFDaEgsT0FBTyxNQUFxQixLQUFLLGFBQWMsTUFBTTtBQUFBO0FBQUEsTUFHckQsMEJBQTBCLEtBQUs7QUFBQSxNQUMvQix3QkFBd0IsQ0FBQyxVQUFxQztBQUM3RCw2QkFBcUI7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsNkJBQTZCLENBQUMsVUFBd0M7QUFDckUsK0JBQXVCO0FBQUEsTUFDeEI7QUFBQTtBQUFBLElBRUQ7QUFHQSxVQUFNLGlCQUFpQix5QkFBeUIsa0JBQWtCO0FBQ2xFLGFBQVMsSUFBSSxHQUFHLE1BQU0sZUFBZSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQzFELFlBQU0sQ0FBQyxJQUFJLElBQUksSUFBSSxlQUFlLENBQUM7QUFDbkMsVUFBSTtBQUNILGNBQU0sV0FBVyxLQUFLLHNCQUFzQixlQUFlLE1BQU0sY0FBYztBQUMvRSxhQUFLLFdBQVcsS0FBSyxRQUFRO0FBQzdCLGFBQUssYUFBYSxJQUFJLElBQUksUUFBUTtBQUFBLE1BQ25DLFNBQVMsS0FBSztBQUNiLGFBQUssWUFBWSxNQUFNLHVDQUF1QyxHQUFHLEdBQUcsR0FBRztBQUN2RSxhQUFLLFlBQVksTUFBTSxHQUFHO0FBQzFCLGVBQU8sa0JBQWtCLEdBQUc7QUFBQSxNQUM3QjtBQUFBLElBQ0Q7QUFHQSxVQUFNLFlBQVkseUJBQXlCLGFBQWE7QUFDeEQsZUFBVyxRQUFRLFdBQVc7QUFDN0IsVUFBSTtBQUNILGNBQU0sV0FBVyxLQUFLLHNCQUFzQixlQUFlLE1BQU0sY0FBYztBQUMvRSxhQUFLLFdBQVcsS0FBSyxRQUFRO0FBQUEsTUFDOUIsU0FBUyxLQUFLO0FBQ2IsYUFBSyxZQUFZLE1BQU0sR0FBRztBQUMxQixlQUFPLGtCQUFrQixHQUFHO0FBQUEsTUFDN0I7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLG9CQUFvQjtBQUN4QixZQUFNLElBQUksTUFBTSw4QkFBOEI7QUFBQSxJQUMvQztBQUdBLFNBQUssYUFBYSxpQkFBaUIsb0JBQW9CO0FBRXZELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFhLFNBQVMsV0FBZ0MsUUFBcUQ7QUFDMUcsVUFBTSxRQUFRLE1BQU0sS0FBSztBQUN6QixRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxNQUFNLFNBQVMsV0FBVyxNQUFNO0FBQUEsRUFDeEM7QUFBQSxFQUVPLGdCQUFnQixpQkFBeUIsZ0JBQStDO0FBQzlGLFFBQUksQ0FBQyxLQUFLLHdCQUF3QixJQUFJLGVBQWUsR0FBRztBQUN2RCxXQUFLLHdCQUF3QixJQUFJLGlCQUFpQixLQUFLLGlCQUFpQixpQkFBaUIsY0FBYyxDQUFDO0FBQUEsSUFDekc7QUFDQSxXQUFPLEtBQUssd0JBQXdCLElBQUksZUFBZTtBQUFBLEVBQ3hEO0FBQUEsRUFFTyxzQkFBc0IsaUJBQWtDO0FBQzlELFdBQU8sS0FBSywwQkFBMEIsSUFBSSxlQUFlO0FBQUEsRUFDMUQ7QUFBQSxFQUVBLE1BQWMsaUJBQWlCLGlCQUF5QixnQkFBK0M7QUFDdEcsUUFBSSxDQUFDLEtBQUssUUFBUTtBQUNqQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFFBQVEsTUFBTSxLQUFLO0FBQ3pCLFFBQUksQ0FBQyxPQUFPO0FBR1g7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLEtBQUssZUFBZSxXQUFZLHdCQUF3QixlQUFlLEdBQUc7QUFDOUUsV0FBSywwQkFBMEIsSUFBSSxlQUFlO0FBQ2xEO0FBQUEsSUFDRDtBQUVBLFVBQU0sTUFBTSxnQkFBZ0IsaUJBQWlCLGNBQWM7QUFDM0QsU0FBSywwQkFBMEIsSUFBSSxlQUFlO0FBQUEsRUFDbkQ7QUFBQSxFQUVBLE1BQWEsZUFBZSxvQkFBeUU7QUFDcEcsUUFBSSxLQUFLLGdCQUFnQjtBQUN4QixVQUFJLG9CQUFvQjtBQUN2QixjQUFNLEtBQUssZUFBZSxrQkFBa0I7QUFBQSxNQUM3QztBQUNBLFlBQU0sT0FBTyxLQUFLLGVBQWUsZUFBZTtBQUNoRCxVQUFJLE1BQU07QUFDVCxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYSxpQkFBaUIsaUJBQXlCLGdCQUEwRDtBQUNoSCxVQUFNLEtBQUssVUFBVSxPQUFPLEtBQUs7QUFDakMsVUFBTSxTQUFTLE1BQU0sSUFBSSwwQkFBMEIsS0FBSyxlQUFlLGdCQUFnQixJQUFJLENBQUMsR0FBRyxLQUFLLGVBQWUsZ0JBQWdCLFFBQVEsc0JBQXNCLHlCQUF5QixlQUFlLENBQUMsSUFBSSxjQUFjLE1BQU0sR0FBRyxRQUFRLENBQUM7QUFDOU8sVUFBTSxVQUFVLENBQUMsUUFBZ0IsS0FBSyxZQUFZLEtBQUssR0FBRyxPQUFPLENBQUMsR0FBRyxHQUFHLEVBQUU7QUFDMUUsVUFBTSxXQUFXLENBQUMsS0FBYSxNQUFXLFdBQWMsS0FBSyxZQUFZLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxHQUFHLElBQUksR0FBRztBQUV2RyxZQUFRLG9CQUFvQjtBQUM1QixVQUFNLFFBQVEsTUFBTSxLQUFLO0FBQ3pCLFFBQUksQ0FBQyxPQUFPO0FBQ1gsZUFBUyxVQUFVO0FBQ25CLGFBQU87QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULE1BQU0saUNBQWlDO0FBQUEsVUFDdkMsUUFBUTtBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFlBQVEsYUFBYTtBQUNyQixVQUFNLGlCQUFpQixJQUFJLGNBQWM7QUFDekMsUUFBSTtBQUNILHFCQUFlLGFBQWEsTUFBTSxRQUFRLFlBQVksR0FBRyxHQUFJO0FBQzdELFlBQU0saUJBQWlCLE1BQU0sTUFBTSxpQkFBaUIsaUJBQWlCLGNBQWM7QUFDbkYscUJBQWUsUUFBUTtBQUN2QixVQUFJLGVBQWUsU0FBUyxNQUFNO0FBQ2pDLGdCQUFRLFlBQVksZUFBZSxNQUFNLFVBQVUsU0FBUyxFQUFFO0FBQUEsTUFDL0QsT0FBTztBQUNOLGlCQUFTLHFCQUFxQixlQUFlLEtBQUs7QUFBQSxNQUNuRDtBQUNBLGFBQU87QUFBQSxJQUNSLFNBQVMsS0FBSztBQUNiLHFCQUFlLFFBQVE7QUFDdkIsZUFBUyxxQkFBcUIsR0FBRztBQUNqQyxhQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsVUFDTixTQUFTLElBQUk7QUFBQSxVQUNiLE1BQU0saUNBQWlDO0FBQUEsVUFDdkMsUUFBUTtBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWEsZ0JBQWdCLGlCQUF5QixLQUErQjtBQUNwRixVQUFNLFFBQVEsTUFBTSxLQUFLO0FBQ3pCLFFBQUksQ0FBQyxPQUFPO0FBQ1gsWUFBTSxJQUFJLE1BQU0sOEJBQThCO0FBQUEsSUFDL0M7QUFDQSxXQUFPLE1BQU0sZ0JBQWdCLGlCQUFpQixHQUFHO0FBQUEsRUFDbEQ7QUFBQSxFQUVBLE1BQWEsTUFBTSw0QkFBb0MsZUFBd0MsY0FBb0Q7QUFDbEosVUFBTSxRQUFRLE1BQU0sS0FBSztBQUN6QixRQUFJLENBQUMsT0FBTztBQUNYO0FBQUEsSUFDRDtBQUNBLFVBQU0sa0JBQWtCLEtBQUssZUFBZSxXQUFZLElBQUksNEJBQTRCLGVBQWUsWUFBWTtBQUNuSCxXQUFPLE1BQU0sbUJBQW1CLGVBQWU7QUFBQSxFQUNoRDtBQUFBLEVBRUEsTUFBYSx3QkFBeUM7QUFDckQsVUFBTSxRQUFRLE1BQU0sS0FBSztBQUN6QixRQUFJLENBQUMsT0FBTztBQUNYLFlBQU0sSUFBSSxNQUFNLHVDQUF1QztBQUFBLElBQ3hEO0FBQ0EsV0FBTyxNQUFNLHNCQUFzQjtBQUFBLEVBQ3BDO0FBQUEsRUFFTywwQkFBMEIsaUJBQW9EO0FBQ3BGLFdBQU8sS0FBSyxlQUFlLGdCQUFnQixPQUFPLGVBQWU7QUFBQSxFQUNsRTtBQUFBLEVBRUEsTUFBYSxnQkFBZ0IseUJBQW9FO0FBQ2hHLFVBQU0sUUFBUSxNQUFNLEtBQUs7QUFDekIsUUFBSSxDQUFDLE9BQU87QUFDWDtBQUFBLElBQ0Q7QUFDQSxVQUFNLDBCQUEwQixLQUFLLGVBQWUsV0FBWSxNQUFNLHVCQUF1QjtBQUM3RixRQUFJLENBQUMseUJBQXlCO0FBRTdCO0FBQUEsSUFDRDtBQUNBLFdBQU8sTUFBTSxnQkFBZ0IsdUJBQXVCO0FBQUEsRUFDckQ7QUFBQSxFQUVPLGtCQUFrQixhQUEyQztBQUNuRSxXQUFPLEtBQUssZUFBZSxZQUFZLGtCQUFrQixXQUFXLEtBQUs7QUFBQSxFQUMxRTtBQUFBLEVBRUEsTUFBYSxxQkFBcUIsS0FBc0Q7QUFDdkYsVUFBTSxRQUFRLE1BQU0sS0FBSztBQUN6QixRQUFJLENBQUMsT0FBTztBQUNYO0FBQUEsSUFDRDtBQUVBLFdBQU8sTUFBTSxxQkFBcUIsR0FBRztBQUFBLEVBQ3RDO0FBQ0Q7QUE3WmEsdUJBQU47QUFBQSxFQXNDSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBekNVO0FBK1pOLFNBQVMsb0JBQW9CLE1BQXlCLEtBQW9CO0FBQ2hGLE1BQUksS0FBSztBQUNSLFdBQU8sR0FBRywwQkFBMEIsSUFBSSxDQUFDLFNBQVMsR0FBRztBQUFBLEVBQ3REO0FBQ0EsU0FBTyxHQUFHLDBCQUEwQixJQUFJLENBQUM7QUFDMUM7QUFFQSxNQUFNLGNBQWM7QUFBQSxFQUNuQixDQUFDLFdBQVcsV0FBVyxXQUFXLFdBQVcsU0FBUztBQUFBLEVBQ3RELENBQUMsV0FBVyxXQUFXLFdBQVcsV0FBVyxTQUFTO0FBQ3ZEO0FBRUEsU0FBUyxvQkFBb0IsTUFBZ0I7QUFDNUMsTUFBSSxNQUFNLFFBQVEsSUFBSSxHQUFHO0FBQ3hCLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxRQUFRLE9BQU8sU0FBUyxZQUFZLE9BQU8sS0FBSyxhQUFhLFlBQVk7QUFDNUUsVUFBTSxTQUFTLEtBQUssU0FBUztBQUM3QixRQUFJLFdBQVcsbUJBQW1CO0FBQ2pDLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsT0FBTyxNQUFnQjtBQUMvQixNQUFJLE1BQU0sUUFBUSxJQUFJLEdBQUc7QUFDeEIsV0FBTyxLQUFLLElBQUksbUJBQW1CO0FBQUEsRUFDcEM7QUFDQSxTQUFPLG9CQUFvQixJQUFJO0FBQ2hDO0FBRUEsTUFBTSxVQUF3QztBQUFBLEVBSzdDLFlBQ2tCLE9BQ2hCO0FBRGdCO0FBSmxCLFNBQVEsaUJBQWlCO0FBQ3pCLFNBQVEsaUJBQWlCO0FBQUEsRUFJckI7QUFBQSxFQUVJLEtBQUssV0FBbUIsYUFBcUIsV0FBbUIsS0FBYSxXQUE2QixLQUFhLE1BQWlCO0FBQy9JLFdBQU8sT0FBTyxJQUFJO0FBRWxCLFVBQU0sYUFBYSxZQUFZLFNBQVM7QUFDeEMsVUFBTSxRQUFRLGlCQUFpQixXQUFXLE1BQU0sV0FBVyxNQUFNLElBQUk7QUFDckUsUUFBSSxPQUFPLENBQUMsTUFBTSwwQkFBMEIsS0FBSyxLQUFLLENBQUMsS0FBSyxTQUFTLE9BQU8sT0FBTyxXQUFXLEVBQUUsU0FBUyxDQUFDLENBQUMsWUFBWSxPQUFPLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQyxNQUFNLE9BQU8sR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDLE1BQU0sR0FBRyxJQUFJLG9CQUFvQixlQUFlLGVBQWUsVUFBVSxLQUFLLEVBQUU7QUFDalEsUUFBSSxNQUFNLEtBQUssR0FBRyxHQUFHO0FBQ3BCLGFBQU8sS0FBSyxPQUFPLElBQUk7QUFDdkIsV0FBSyxLQUFLLEdBQUc7QUFBQSxJQUNkLE9BQU87QUFDTixXQUFLLEtBQUssSUFBSTtBQUFBLElBQ2Y7QUFDQSxZQUFRLElBQUksTUFBTSxTQUFTLElBQTZCO0FBQUEsRUFDekQ7QUFBQSxFQUVBLFlBQVksV0FBbUIsS0FBYSxXQUE2QixLQUFhLE1BQWtCO0FBQ3ZHLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssS0FBSyxrQkFBa0IsS0FBSyxnQkFBZ0IsV0FBVyxLQUFLLFdBQVcsS0FBSyxJQUFJO0FBQUEsRUFDdEY7QUFBQSxFQUVBLFlBQVksV0FBbUIsS0FBYSxXQUE2QixLQUFhLE1BQWtCO0FBQ3ZHLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssS0FBSyxrQkFBa0IsS0FBSyxnQkFBZ0IsV0FBVyxLQUFLLFdBQVcsS0FBSyxJQUFJO0FBQUEsRUFDdEY7QUFDRDtBQWNBLElBQU0scUJBQU4sTUFBdUQ7QUFBQSxFQVF0RCxZQUFnRCxtQkFBc0M7QUFBdEM7QUFGaEQsU0FBaUIsbUJBQW1CLG9CQUFJLElBQW9CO0FBQUEsRUFFNEI7QUFBQSxFQU54RixPQUFPLFlBQXFCO0FBQzNCLFdBQU8sS0FBSyxPQUFPLElBQUk7QUFBQSxFQUN4QjtBQUFBLEVBTUEsWUFBWSxXQUFtQixLQUFhLFdBQTZCLEtBQW1CO0FBRTNGLFFBQUksY0FBYyxpQkFBaUIsYUFBYSx1QkFBdUIsS0FBSyxHQUFHLEdBQUc7QUFFakYsWUFBTSxhQUFhLEtBQUssaUJBQWlCLElBQUksR0FBRyxLQUFLO0FBQ3JELFdBQUssaUJBQWlCLE9BQU8sR0FBRztBQUNoQyxXQUFLLGtCQUFrQixXQUE2RCwwQkFBMEI7QUFBQSxRQUM3RyxNQUFNLEdBQUcsR0FBRyxJQUFJLFVBQVU7QUFBQSxRQUMxQixRQUFRO0FBQUEsTUFDVCxDQUFDO0FBQUEsSUFDRjtBQUVBLFFBQUksY0FBYyxpQkFBaUIsYUFBYSxtQkFBbUIsS0FBSyxHQUFHLEdBQUc7QUFFN0UsV0FBSyxrQkFBa0IsV0FBNkQsMEJBQTBCO0FBQUEsUUFDN0csTUFBTSxHQUFHLEdBQUc7QUFBQSxRQUNaLFFBQVE7QUFBQSxNQUNULENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRUEsWUFBWSxXQUFtQixLQUFhLFdBQTZCLEtBQW1CO0FBRTNGLFFBQUksY0FBYyxpQkFBaUIsYUFBYSxJQUFJLFdBQVcsV0FBVyxHQUFHO0FBQzVFLFdBQUssaUJBQWlCLElBQUksS0FBSyxHQUFHO0FBQ2xDLFdBQUssa0JBQWtCLFdBQTZELDBCQUEwQjtBQUFBLFFBQzdHLE1BQU07QUFBQSxRQUNOLFFBQVE7QUFBQSxNQUNULENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUNEO0FBekNNLHFCQUFOO0FBQUEsRUFRYztBQUFBLEdBUlI7QUFzRE4sTUFBTSxZQUFzQyxDQUFDO0FBQzdDLFNBQVMsNEJBQTRCLFVBQStDO0FBQ25GLFlBQVUsS0FBSyxRQUFRO0FBQ3ZCLFNBQU87QUFBQSxJQUNOLFNBQVMsTUFBTTtBQUNkLGVBQVMsSUFBSSxHQUFHLElBQUksVUFBVSxRQUFRLEtBQUs7QUFDMUMsWUFBSSxVQUFVLENBQUMsTUFBTSxVQUFVO0FBQzlCLG9CQUFVLE9BQU8sR0FBRyxDQUFDO0FBQ3JCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUywwQkFBb0Q7QUFDNUQsU0FBTyxVQUFVLE1BQU0sQ0FBQztBQUN6QjtBQUVBLGdCQUFnQixNQUFNLG9DQUFvQyxRQUFRO0FBQUEsRUFFakUsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sSUFBSSxVQUFVLHlCQUF5QixnQ0FBZ0M7QUFBQSxNQUM5RSxVQUFVLFdBQVc7QUFBQSxNQUNyQixJQUFJO0FBQUEsSUFDTCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTRCO0FBRXJDLFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBRWpELFVBQU0sZUFBZSxNQUFNLFFBQVEsSUFBSSx3QkFBd0IsRUFBRSxJQUFJLGNBQVksU0FBUyxRQUFRLENBQUMsQ0FBQztBQUNwRyxrQkFBYyxXQUFXLEVBQUUsVUFBVSxRQUFXLFVBQVUsYUFBYSxJQUFJLDRCQUE0QixNQUFNLEVBQUUsS0FBSyxNQUFNLEdBQUcsU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFLENBQUM7QUFBQSxFQUN6SjtBQUFBLEVBRUEsT0FBZSxPQUFPLEdBQXdDO0FBQzdELFFBQUksQ0FBQyxHQUFHO0FBQ1AsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLEdBQUcsRUFBRSxrQkFBa0IsY0FBYyxFQUFFLGVBQWU7QUFBQSxJQUFPLEVBQUUsc0JBQXNCLEVBQUUsUUFBUSxRQUFRLENBQUMsQ0FBQztBQUFBLE1BQVcsNEJBQTRCLFlBQVksRUFBRSxFQUFFLENBQUM7QUFBQSxRQUFXLDRCQUE0QixZQUFZLEVBQUUsSUFBSSxDQUFDO0FBQUE7QUFBQSxFQUNuTztBQUFBLEVBRUEsT0FBZSxZQUFZLEdBQW1CO0FBQzdDLFFBQUksS0FBSyxNQUFNO0FBQ2QsYUFBTyxHQUFHLENBQUM7QUFBQSxJQUNaO0FBQ0EsUUFBSSxJQUFJLE9BQU8sTUFBTTtBQUNwQixhQUFPLElBQUksSUFBSSxNQUFNLFFBQVEsQ0FBQyxDQUFDO0FBQUEsSUFDaEM7QUFDQSxXQUFPLElBQUksSUFBSSxPQUFPLE1BQU0sUUFBUSxDQUFDLENBQUM7QUFBQSxFQUN2QztBQUNELENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
