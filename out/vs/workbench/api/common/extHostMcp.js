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
import { DeferredPromise, raceCancellationError, Sequencer, timeout } from "../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { CancellationError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { AUTH_SCOPE_SEPARATOR, fetchAuthorizationServerMetadata, fetchResourceMetadata, getDefaultMetadataForUrl, parseWWWAuthenticateHeader, scopesMatch } from "../../../base/common/oauth.js";
import { SSEParser } from "../../../base/common/sseParser.js";
import { URI } from "../../../base/common/uri.js";
import { vArray, vNumber, vObj, vObjAny, vOptionalProp, vString } from "../../../base/common/validation.js";
import { ConfigurationTarget } from "../../../platform/configuration/common/configuration.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { canLog, ILogService, LogLevel } from "../../../platform/log/common/log.js";
import product from "../../../platform/product/common/product.js";
import { StorageScope } from "../../../platform/storage/common/storage.js";
import { extensionPrefixedIdentifier, McpConnectionState, McpServerLaunch, McpServerStaticToolAvailability, McpServerTransportType, UserInteractionRequiredError } from "../../contrib/mcp/common/mcpTypes.js";
import { MCP } from "../../contrib/mcp/common/modelContextProtocol.js";
import { checkProposedApiEnabled, isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { MainContext, IAuthResourceMetadataSource, IAuthServerMetadataSource } from "./extHost.protocol.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import * as Convert from "./extHostTypeConverters.js";
import { McpToolAvailability } from "./extHostTypes.js";
import { IExtHostVariableResolverProvider } from "./extHostVariableResolverService.js";
import { IExtHostWorkspace } from "./extHostWorkspace.js";
const IExtHostMpcService = createDecorator("IExtHostMpcService");
const serverDataValidation = vObj({
  label: vString(),
  version: vOptionalProp(vString()),
  metadata: vOptionalProp(vObj({
    capabilities: vOptionalProp(vObjAny()),
    serverInfo: vOptionalProp(vObjAny()),
    tools: vOptionalProp(vArray(vObj({
      availability: vNumber(),
      definition: vObjAny()
    })))
  })),
  authentication: vOptionalProp(vObj({
    providerId: vString(),
    scopes: vArray(vString())
  }))
});
let ExtHostMcpService = class extends Disposable {
  constructor(extHostRpc, _logService, _extHostInitData, _workspaceService, _variableResolver) {
    super();
    this._logService = _logService;
    this._extHostInitData = _extHostInitData;
    this._workspaceService = _workspaceService;
    this._variableResolver = _variableResolver;
    this._initialProviderPromises = /* @__PURE__ */ new Set();
    this._sseEventSources = this._register(new DisposableMap());
    this._unresolvedMcpServers = /* @__PURE__ */ new Map();
    // MCP server definitions synced from main thread
    this._onDidChangeMcpServerDefinitions = this._register(new Emitter());
    this.onDidChangeMcpServerDefinitions = this._onDidChangeMcpServerDefinitions.event;
    this._mcpServerDefinitions = [];
    // Active gateways with their server emitters for dynamic updates
    this._activeGateways = /* @__PURE__ */ new Map();
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadMcp);
  }
  /** Returns all MCP server definitions known to the editor. */
  get mcpServerDefinitions() {
    return this._mcpServerDefinitions;
  }
  /** Called by main thread to notify that MCP server definitions have changed. */
  $onDidChangeMcpServerDefinitions(servers) {
    this._mcpServerDefinitions = servers.map((dto) => Convert.McpServerDefinition.to(dto));
    this._onDidChangeMcpServerDefinitions.fire();
  }
  $startMcp(id, opts) {
    this._startMcp(id, McpServerLaunch.fromSerialized(opts.launch), opts.defaultCwd && URI.revive(opts.defaultCwd), opts.errorOnUserInteraction);
  }
  _startMcp(id, launch, _defaultCwd, errorOnUserInteraction) {
    if (launch.type === McpServerTransportType.HTTP) {
      this._sseEventSources.set(id, new McpHTTPHandle(id, launch, this._proxy, this._logService, errorOnUserInteraction));
      return;
    }
    throw new Error("not implemented");
  }
  async $substituteVariables(_workspaceFolder, value) {
    const folderURI = URI.revive(_workspaceFolder);
    const folder = folderURI && await this._workspaceService.resolveWorkspaceFolder(folderURI);
    const variableResolver = await this._variableResolver.getResolver();
    return variableResolver.resolveAsync(folder && {
      uri: folder.uri,
      name: folder.name,
      index: folder.index
    }, value);
  }
  $stopMcp(id) {
    this._sseEventSources.get(id)?.close().then(() => this._didClose(id));
  }
  _didClose(id) {
    this._sseEventSources.deleteAndDispose(id);
  }
  $sendMessage(id, message) {
    this._sseEventSources.get(id)?.send(message);
  }
  async $waitForInitialCollectionProviders() {
    await Promise.all(this._initialProviderPromises);
  }
  async $resolveMcpLaunch(collectionId, label) {
    const rec = this._unresolvedMcpServers.get(collectionId);
    if (!rec) {
      return;
    }
    const server = rec.servers.find((s) => s.label === label);
    if (!server) {
      return;
    }
    if (!rec.provider.resolveMcpServerDefinition) {
      return Convert.McpServerDefinition.from(server);
    }
    const resolved = await rec.provider.resolveMcpServerDefinition(server, CancellationToken.None);
    return resolved ? Convert.McpServerDefinition.from(resolved) : void 0;
  }
  /** {@link vscode.lm.registerMcpServerDefinitionProvider} */
  registerMcpConfigurationProvider(extension, id, provider) {
    const store = new DisposableStore();
    const metadata = extension.contributes?.mcpServerDefinitionProviders?.find((m) => m.id === id);
    if (!metadata) {
      throw new Error(`MCP configuration providers must be registered in the contributes.mcpServerDefinitionProviders array within your package.json, but "${id}" was not`);
    }
    const mcp = {
      id: extensionPrefixedIdentifier(extension.identifier, id),
      isTrustedByDefault: true,
      label: metadata?.label ?? extension.displayName ?? extension.name,
      scope: StorageScope.WORKSPACE,
      canResolveLaunch: typeof provider.resolveMcpServerDefinition === "function",
      extensionId: extension.identifier.value,
      configTarget: this._extHostInitData.remote.isRemote ? ConfigurationTarget.USER_REMOTE : ConfigurationTarget.USER
    };
    const update = async () => {
      const list = await provider.provideMcpServerDefinitions(CancellationToken.None);
      this._unresolvedMcpServers.set(mcp.id, { servers: list ?? [], provider });
      const servers = [];
      for (const item of list ?? []) {
        let id2 = ExtensionIdentifier.toKey(extension.identifier) + "/" + item.label;
        if (servers.some((s) => s.id === id2)) {
          let i = 2;
          while (servers.some((s) => s.id === id2 + i)) {
            i++;
          }
          id2 = id2 + i;
        }
        serverDataValidation.validateOrThrow(item);
        if (item.authentication) {
          checkProposedApiEnabled(extension, "mcpToolDefinitions");
        }
        let staticMetadata;
        const castAs2 = item;
        if (isProposedApiEnabled(extension, "mcpToolDefinitions") && castAs2.metadata) {
          staticMetadata = {
            capabilities: castAs2.metadata.capabilities,
            instructions: castAs2.metadata.instructions,
            serverInfo: castAs2.metadata.serverInfo,
            tools: castAs2.metadata.tools?.map((t) => ({
              availability: t.availability === McpToolAvailability.Dynamic ? McpServerStaticToolAvailability.Dynamic : McpServerStaticToolAvailability.Initial,
              definition: t.definition
            }))
          };
        }
        servers.push({
          id: id2,
          label: item.label,
          cacheNonce: item.version || "$$NONE",
          staticMetadata,
          launch: Convert.McpServerDefinition.from(item)
        });
      }
      this._proxy.$upsertMcpCollection(mcp, servers);
    };
    store.add(toDisposable(() => {
      this._unresolvedMcpServers.delete(mcp.id);
      this._proxy.$deleteMcpCollection(mcp.id);
    }));
    if (provider.onDidChangeMcpServerDefinitions) {
      store.add(provider.onDidChangeMcpServerDefinitions(update));
    }
    if (provider.onDidChangeServerDefinitions) {
      store.add(provider.onDidChangeServerDefinitions(update));
    }
    if (provider.onDidChange) {
      store.add(provider.onDidChange(update));
    }
    const promise = new Promise((resolve) => {
      setTimeout(() => update().finally(() => {
        this._initialProviderPromises.delete(promise);
        resolve();
      }), 0);
    });
    this._initialProviderPromises.add(promise);
    return store;
  }
  /** {@link vscode.lm.startMcpGateway} */
  async startMcpGateway(chatSessionResource) {
    const result = await this._proxy.$startMcpGateway(chatSessionResource?.toJSON());
    if (!result) {
      return void 0;
    }
    const gatewayId = result.gatewayId;
    const servers = result.servers.map((s) => ({
      label: s.label,
      address: URI.revive(s.address)
    }));
    const onDidChangeServers = new Emitter();
    this._activeGateways.set(gatewayId, { servers, onDidChangeServers });
    return {
      get servers() {
        return servers;
      },
      onDidChangeServers: onDidChangeServers.event,
      dispose: () => {
        this._activeGateways.delete(gatewayId);
        onDidChangeServers.dispose();
        this._proxy.$disposeMcpGateway(gatewayId);
      }
    };
  }
  /** Called by main thread to notify that a gateway's server set has changed. */
  $onDidChangeGatewayServers(gatewayId, newServers) {
    const gateway = this._activeGateways.get(gatewayId);
    if (!gateway) {
      return;
    }
    const servers = newServers.map((s) => ({
      label: s.label,
      address: URI.revive(s.address)
    }));
    gateway.servers.length = 0;
    gateway.servers.push(...servers);
    gateway.onDidChangeServers.fire(servers);
  }
};
ExtHostMcpService = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IExtHostInitDataService),
  __decorateParam(3, IExtHostWorkspace),
  __decorateParam(4, IExtHostVariableResolverProvider)
], ExtHostMcpService);
function stringifyError(err) {
  if (!(err instanceof Error)) {
    return String(err);
  }
  let msg = String(err);
  let cause = err.cause;
  for (let depth = 0; cause !== void 0 && depth < 5; depth++) {
    msg += `: ${cause instanceof Error ? cause.message || String(cause) : String(cause)}`;
    cause = cause instanceof Error ? cause.cause : void 0;
  }
  return msg;
}
var HttpMode = /* @__PURE__ */ ((HttpMode2) => {
  HttpMode2[HttpMode2["Unknown"] = 0] = "Unknown";
  HttpMode2[HttpMode2["Http"] = 1] = "Http";
  HttpMode2[HttpMode2["SSE"] = 2] = "SSE";
  return HttpMode2;
})(HttpMode || {});
const MAX_FOLLOW_REDIRECTS = 5;
const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308];
const ALLOWED_REDIRECT_PROTOCOLS = /* @__PURE__ */ new Set(["http:", "https:"]);
const CROSS_ORIGIN_STRIPPED_HEADERS = /* @__PURE__ */ new Set(["authorization", "cookie", "proxy-authorization", "mcp-session-id"]);
function setHostHeader(headers, name, value) {
  for (const configuredName of Object.keys(headers)) {
    if (configuredName.toLowerCase() === name.toLowerCase()) {
      delete headers[configuredName];
    }
  }
  headers[name] = value;
}
class McpHTTPHandle extends Disposable {
  constructor(_id, _launch, _proxy, _logService, _errorOnUserInteraction) {
    super();
    this._id = _id;
    this._launch = _launch;
    this._proxy = _proxy;
    this._logService = _logService;
    this._errorOnUserInteraction = _errorOnUserInteraction;
    this._requestSequencer = new Sequencer();
    this._postEndpoint = new DeferredPromise();
    this._mode = { value: 0 /* Unknown */ };
    this._cts = new CancellationTokenSource();
    this._abortCtrl = new AbortController();
    this._didSendClose = false;
    this._register(toDisposable(() => {
      this._abortCtrl.abort();
      this._cts.dispose(true);
    }));
    this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Running });
  }
  async send(message) {
    try {
      if (this._mode.value === 0 /* Unknown */) {
        await this._requestSequencer.queue(() => this._send(message));
      } else {
        await this._send(message);
      }
    } catch (err) {
      const msg = `Error sending message to ${this._launch.uri}: ${stringifyError(err)}`;
      this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: msg });
    }
  }
  async close() {
    if (this._mode.value === 1 /* Http */ && this._mode.sessionId && !this._didSendClose) {
      this._didSendClose = true;
      try {
        await this._closeSession(this._mode.sessionId);
      } catch {
      }
    }
    this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Stopped });
  }
  async _closeSession(sessionId) {
    const headers = {
      ...Object.fromEntries(this._launch.headers),
      "Mcp-Session-Id": sessionId
    };
    try {
      await this._addAuthHeader(headers, { errorOnUserInteraction: true });
    } catch (e) {
      this._log(LogLevel.Debug, `Skipping session close: authentication no longer available`);
      return;
    }
    await this._fetch(
      this._launch.uri.toString(true),
      {
        method: "DELETE",
        headers
      }
    );
  }
  _send(message) {
    if (this._mode.value === 2 /* SSE */) {
      return this._sendLegacySSE(this._mode.endpoint, message);
    } else {
      return this._sendStreamableHttp(message, this._mode.value === 1 /* Http */ ? this._mode.sessionId : void 0);
    }
  }
  /**
   * Sends a streamable-HTTP request.
   * 1. Posts to the endpoint
   * 2. Updates internal state as needed. Falls back to SSE if appropriate.
   * 3. If the response body is empty, JSON, or a JSON stream, handle it appropriately.
   */
  async _sendStreamableHttp(message, sessionId) {
    const asBytes = new TextEncoder().encode(message);
    const headers = {
      ...Object.fromEntries(this._launch.headers),
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json"
    };
    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId;
    }
    await this._addAuthHeader(headers);
    const res = await this._fetchWithAuthRetry(
      this._launch.uri.toString(true),
      {
        method: "POST",
        headers,
        body: asBytes
      },
      headers
    );
    const wasUnknown = this._mode.value === 0 /* Unknown */;
    const nextSessionId = res.headers.get("Mcp-Session-Id");
    if (nextSessionId) {
      this._mode = { value: 1 /* Http */, sessionId: nextSessionId };
    }
    if (this._mode.value === 0 /* Unknown */ && // We care about 4xx errors...
    res.status >= 400 && res.status < 500 && !isAuthStatusCode(res.status)) {
      this._log(LogLevel.Info, `${res.status} status sending message to ${this._launch.uri}, will attempt to fall back to legacy SSE`);
      this._sseFallbackWithMessage(message);
      return;
    }
    if (res.status >= 300) {
      const retryWithSessionId = this._mode.value === 1 /* Http */ && !!this._mode.sessionId && (res.status === 400 || res.status === 404);
      this._proxy.$onDidChangeState(this._id, {
        state: McpConnectionState.Kind.Error,
        message: `${res.status} status sending message to ${this._launch.uri}: ${await this._getErrText(res)}` + (retryWithSessionId ? `; will retry with new session ID` : ""),
        shouldRetry: retryWithSessionId
      });
      return;
    }
    if (this._mode.value === 0 /* Unknown */) {
      this._mode = { value: 1 /* Http */, sessionId: void 0 };
    }
    if (wasUnknown) {
      this._attachStreamableBackchannel();
    }
    await this._handleSuccessfulStreamableHttp(res, message);
  }
  async _sseFallbackWithMessage(message) {
    const endpoint = await this._attachSSE();
    if (endpoint) {
      this._mode = { value: 2 /* SSE */, endpoint };
      await this._sendLegacySSE(endpoint, message);
    }
  }
  async _handleSuccessfulStreamableHttp(res, message) {
    if (res.status === 202) {
      return;
    }
    const contentType = res.headers.get("Content-Type")?.toLowerCase() || "";
    if (contentType.startsWith("text/event-stream")) {
      const parser = new SSEParser((event) => {
        if (event.type === "message") {
          this._proxy.$onDidReceiveMessage(this._id, event.data);
        } else if (event.type === "endpoint") {
          this._log(LogLevel.Warning, `Received SSE endpoint from a POST to ${this._launch.uri}, will fall back to legacy SSE`);
          this._sseFallbackWithMessage(message);
          throw new CancellationError();
        }
      });
      try {
        await this._doSSE(parser, res);
      } catch (err) {
        this._log(LogLevel.Warning, `Error reading SSE stream: ${stringifyError(err)}`);
      }
    } else if (contentType.startsWith("application/json")) {
      this._proxy.$onDidReceiveMessage(this._id, await res.text());
    } else {
      const responseBody = await res.text();
      if (isJSON(responseBody)) {
        this._proxy.$onDidReceiveMessage(this._id, responseBody);
      } else {
        this._log(LogLevel.Warning, `Unexpected ${res.status} response for request: ${responseBody}`);
      }
    }
  }
  /**
   * Attaches the SSE backchannel that streamable HTTP servers can use
   * for async notifications. This is a "MAY" support, so if the server gives
   * us a 4xx code, we'll stop trying to connect..
   */
  async _attachStreamableBackchannel() {
    let lastEventId;
    let canReconnectAt;
    for (let retry = 0; !this._store.isDisposed; retry++) {
      if (canReconnectAt !== void 0) {
        await timeout(Math.max(0, canReconnectAt - Date.now()), this._cts.token);
        canReconnectAt = void 0;
      } else {
        await timeout(Math.min(retry * 1e3, 3e4), this._cts.token);
      }
      let res;
      try {
        const headers = {
          ...Object.fromEntries(this._launch.headers),
          "Accept": "text/event-stream"
        };
        await this._addAuthHeader(headers);
        if (this._mode.value === 1 /* Http */ && this._mode.sessionId !== void 0) {
          headers["Mcp-Session-Id"] = this._mode.sessionId;
        }
        if (lastEventId) {
          headers["Last-Event-ID"] = lastEventId;
        }
        res = await this._fetchWithAuthRetry(
          this._launch.uri.toString(true),
          {
            method: "GET",
            headers
          },
          headers
        );
      } catch (e) {
        this._log(LogLevel.Info, `Error connecting to ${this._launch.uri} for async notifications, will retry`);
        continue;
      }
      if (res.status >= 400) {
        this._log(LogLevel.Debug, `${res.status} status connecting to ${this._launch.uri} for async notifications; they will be disabled: ${await this._getErrText(res)}`);
        return;
      }
      if (res.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
        retry = 0;
      }
      const parser = new SSEParser((event) => {
        if (event.retry) {
          canReconnectAt = Date.now() + event.retry;
        }
        if (event.type === "message" && event.data) {
          this._proxy.$onDidReceiveMessage(this._id, event.data);
        }
        if (event.id) {
          lastEventId = event.id;
        }
      });
      try {
        await this._doSSE(parser, res);
      } catch (e) {
        this._log(LogLevel.Info, `Error reading from async stream, we will reconnect: ${e}`);
      }
    }
  }
  /**
   * Starts a legacy SSE attachment, where the SSE response is the session lifetime.
   * Unlike `_attachStreamableBackchannel`, this fails the server if it disconnects.
   */
  async _attachSSE() {
    const postEndpoint = new DeferredPromise();
    const headers = {
      ...Object.fromEntries(this._launch.headers),
      "Accept": "text/event-stream"
    };
    await this._addAuthHeader(headers);
    let res;
    try {
      res = await this._fetchWithAuthRetry(
        this._launch.uri.toString(true),
        {
          method: "GET",
          headers
        },
        headers
      );
      if (res.status >= 300) {
        this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: `${res.status} status connecting to ${this._launch.uri} as SSE: ${await this._getErrText(res)}` });
        return;
      }
    } catch (e) {
      this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: `Error connecting to ${this._launch.uri} as SSE: ${e}` });
      return;
    }
    const parser = new SSEParser((event) => {
      if (event.type === "message") {
        this._proxy.$onDidReceiveMessage(this._id, event.data);
      } else if (event.type === "endpoint") {
        postEndpoint.complete(new URL(event.data, this._launch.uri.toString(true)).toString());
      }
    });
    this._register(toDisposable(() => postEndpoint.cancel()));
    this._doSSE(parser, res).catch((err) => {
      this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: `Error reading SSE stream: ${stringifyError(err)}` });
    });
    return postEndpoint.p;
  }
  /**
   * Sends a legacy SSE message to the server. The response is always empty and
   * is otherwise received in {@link _attachSSE}'s loop.
   */
  async _sendLegacySSE(url, message) {
    const asBytes = new TextEncoder().encode(message);
    const headers = {
      ...Object.fromEntries(this._launch.headers),
      "Content-Type": "application/json"
    };
    await this._addAuthHeader(headers);
    const res = await this._fetch(url, {
      method: "POST",
      headers,
      body: asBytes
    });
    if (res.status >= 300) {
      this._log(LogLevel.Warning, `${res.status} status sending message to ${this._postEndpoint}: ${await this._getErrText(res)}`);
    }
  }
  /** Generic handle to pipe a response into an SSE parser. */
  async _doSSE(parser, res) {
    if (!res.body) {
      return;
    }
    const reader = res.body.getReader();
    let chunk;
    do {
      try {
        chunk = await raceCancellationError(reader.read(), this._cts.token);
      } catch (err) {
        reader.cancel();
        if (this._store.isDisposed) {
          return;
        } else {
          throw err;
        }
      }
      if (chunk.value) {
        parser.feed(chunk.value);
      }
    } while (!chunk.done);
  }
  async _addAuthHeader(headers, options) {
    const errorOnUserInteraction = options?.errorOnUserInteraction ?? this._errorOnUserInteraction;
    if (this._authMetadata) {
      try {
        const authDetails = {
          authorizationServer: this._authMetadata.authorizationServer.toJSON(),
          authorizationServerMetadata: this._authMetadata.serverMetadata,
          resourceMetadata: this._authMetadata.resourceMetadata,
          scopes: this._authMetadata.scopes,
          clientId: this._launch.oauth?.clientId,
          enterpriseManaged: this._launch.oauth?.enterpriseManaged
        };
        const token = await this._proxy.$getTokenFromServerMetadata(
          this._id,
          authDetails,
          {
            errorOnUserInteraction,
            forceNewRegistration: options?.forceNewRegistration
          }
        );
        if (token) {
          setHostHeader(headers, "Authorization", `Bearer ${token}`);
        }
      } catch (e) {
        if (UserInteractionRequiredError.is(e)) {
          this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Stopped, reason: "needs-user-interaction" });
          throw new CancellationError();
        }
        this._log(LogLevel.Warning, `Error getting token from server metadata: ${String(e)}`);
      }
    }
    if (this._launch.authentication) {
      try {
        this._log(LogLevel.Debug, `Using provided authentication config: providerId=${this._launch.authentication.providerId}, scopes=${this._launch.authentication.scopes.join(", ")}`);
        const token = await this._proxy.$getTokenForProviderId(
          this._id,
          this._launch.authentication.providerId,
          this._launch.authentication.scopes,
          {
            errorOnUserInteraction,
            forceNewRegistration: options?.forceNewRegistration,
            clientId: this._launch.oauth?.clientId
          }
        );
        if (token) {
          setHostHeader(headers, "Authorization", `Bearer ${token}`);
          this._log(LogLevel.Info, "Successfully obtained token from provided authentication config");
        }
      } catch (e) {
        if (UserInteractionRequiredError.is(e)) {
          this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Stopped, reason: "needs-user-interaction" });
          throw new CancellationError();
        }
        this._log(LogLevel.Warning, `Error getting token from provided authentication config: ${String(e)}`);
      }
    }
    return headers;
  }
  _log(level, message) {
    if (!this._store.isDisposed) {
      this._proxy.$onDidPublishLog(this._id, level, message);
    }
  }
  async _getErrText(res) {
    try {
      return await res.text();
    } catch {
      return res.statusText;
    }
  }
  /**
   * Helper method to perform fetch with authentication retry logic.
   * If the initial request returns an auth error and we don't have auth metadata,
   * it will populate the auth metadata and retry once.
   * If we already have auth metadata, check if the scopes changed and update them.
   */
  async _fetchWithAuthRetry(mcpUrl, init, headers) {
    const doFetch = () => this._fetch(mcpUrl, init);
    let res = await doFetch();
    if (isAuthStatusCode(res.status)) {
      if (!this._authMetadata) {
        this._authMetadata = await createAuthMetadata(mcpUrl, res.headers, {
          sameOriginHeaders: {
            ...Object.fromEntries(this._launch.headers),
            "MCP-Protocol-Version": MCP.LATEST_PROTOCOL_VERSION
          },
          fetch: (url, init2) => this._fetch(url, init2),
          log: (level, message) => this._log(level, message)
        });
        this._proxy.$logMcpAuthSetup(this._authMetadata.telemetry);
        await this._addAuthHeader(headers);
        if (headers["Authorization"]) {
          init.headers = headers;
          res = await doFetch();
        }
      } else {
        if (this._authMetadata.update(res.headers)) {
          await this._addAuthHeader(headers);
          if (headers["Authorization"]) {
            init.headers = headers;
            res = await doFetch();
          }
        }
      }
    }
    if (headers["Authorization"] && isAuthStatusCode(res.status)) {
      const errorText = await this._getErrText(res);
      this._log(LogLevel.Info, `Received ${res.status} status with Authorization header, retrying with new auth registration. Error details: ${errorText || "no additional details"}`);
      await this._addAuthHeader(headers, { forceNewRegistration: true });
      res = await doFetch();
    }
    return res;
  }
  async _fetch(url, init) {
    setHostHeader(init.headers, "user-agent", `${product.nameLong}/${product.version}`);
    if (canLog(this._logService.getLevel(), LogLevel.Trace)) {
      const traceObj = { ...init, headers: { ...init.headers } };
      if (traceObj.body) {
        traceObj.body = new TextDecoder().decode(traceObj.body);
      }
      if (traceObj.headers?.Authorization) {
        traceObj.headers.Authorization = "***";
      }
      this._log(LogLevel.Trace, `Fetching ${url} with options: ${JSON.stringify(traceObj)}`);
    }
    let currentUrl = url;
    let response;
    for (let redirectCount = 0; redirectCount < MAX_FOLLOW_REDIRECTS; redirectCount++) {
      response = await this._fetchInternal(currentUrl, {
        ...init,
        signal: this._abortCtrl.signal,
        redirect: "manual"
      });
      if (!REDIRECT_STATUS_CODES.includes(response.status)) {
        break;
      }
      const location = response.headers.get("location");
      if (!location) {
        break;
      }
      const currentUrlParsed = new URL(currentUrl);
      const nextUrlParsed = new URL(location, currentUrl);
      if (!ALLOWED_REDIRECT_PROTOCOLS.has(nextUrlParsed.protocol)) {
        throw new Error(`MCP server redirected to a non-http(s) target (${nextUrlParsed.protocol}), which is not allowed`);
      }
      if (currentUrlParsed.origin !== nextUrlParsed.origin) {
        for (const name of Object.keys(init.headers)) {
          if (CROSS_ORIGIN_STRIPPED_HEADERS.has(name.toLowerCase())) {
            delete init.headers[name];
          }
        }
      }
      const nextUrl = nextUrlParsed.toString();
      this._log(LogLevel.Trace, `Redirect (${response.status}) from ${currentUrl} to ${nextUrl}`);
      currentUrl = nextUrl;
      if (response.status === 303 || (response.status === 301 || response.status === 302) && init.method === "POST") {
        init.method = "GET";
        delete init.body;
      }
    }
    if (canLog(this._logService.getLevel(), LogLevel.Trace)) {
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      this._log(LogLevel.Trace, `Fetched ${currentUrl}: ${JSON.stringify({
        status: response.status,
        headers
      })}`);
    }
    return response;
  }
  _fetchInternal(url, init) {
    return fetch(url, init);
  }
}
function isJSON(str) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}
function isAuthStatusCode(status) {
  return status === 401 || status === 403;
}
class AuthMetadata {
  constructor(authorizationServer, serverMetadata, resourceMetadata, scopes, telemetry, _log) {
    this.authorizationServer = authorizationServer;
    this.serverMetadata = serverMetadata;
    this.resourceMetadata = resourceMetadata;
    this.telemetry = telemetry;
    this._log = _log;
    this._scopes = scopes;
  }
  get scopes() {
    return this._scopes;
  }
  update(responseHeaders) {
    const scopesChallenge = this._parseScopesFromResponse(responseHeaders);
    if (!scopesMatch(scopesChallenge, this._scopes)) {
      this._log(LogLevel.Info, `Scopes changed from ${JSON.stringify(this._scopes)} to ${JSON.stringify(scopesChallenge)}, updating`);
      this._scopes = scopesChallenge;
      return true;
    }
    return false;
  }
  _parseScopesFromResponse(responseHeaders) {
    const authHeader = responseHeaders.get("WWW-Authenticate");
    if (!authHeader) {
      return void 0;
    }
    const challenges = parseWWWAuthenticateHeader(authHeader);
    for (const challenge of challenges) {
      if (challenge.scheme === "Bearer" && challenge.params["scope"]) {
        const scopes = challenge.params["scope"].split(AUTH_SCOPE_SEPARATOR).filter((s) => s.trim().length);
        if (scopes.length) {
          this._log(LogLevel.Info, `Found scope challenge in WWW-Authenticate header: ${challenge.params["scope"]}`);
          return scopes;
        }
      }
    }
    return void 0;
  }
}
async function createAuthMetadata(resourceUrl, initialResponseHeaders, options) {
  const { sameOriginHeaders, fetch: fetch2, log } = options;
  let resourceMetadataSource = IAuthResourceMetadataSource.None;
  let serverMetadataSource;
  const { resourceMetadataChallenge, scopesChallenge: scopesChallengeFromHeader } = parseWWWAuthenticateHeaderForChallenges(initialResponseHeaders.get("WWW-Authenticate") ?? void 0, log);
  let serverMetadataUrl;
  let resource;
  let scopesChallenge = scopesChallengeFromHeader;
  try {
    const { metadata, discoveryUrl, errors } = await fetchResourceMetadata(resourceUrl, resourceMetadataChallenge, {
      sameOriginHeaders,
      fetch: (url, init) => fetch2(url, init)
    });
    for (const err of errors) {
      log(LogLevel.Warning, `Error fetching resource metadata: ${err}`);
    }
    log(LogLevel.Info, `Discovered resource metadata at ${discoveryUrl}`);
    resourceMetadataSource = resourceMetadataChallenge ? IAuthResourceMetadataSource.Header : IAuthResourceMetadataSource.WellKnown;
    serverMetadataUrl = metadata.authorization_servers?.[0];
    if (!serverMetadataUrl) {
      log(LogLevel.Warning, `No authorization_servers found in resource metadata ${discoveryUrl} - Is this resource metadata configured correctly?`);
    } else {
      log(LogLevel.Info, `Using auth server metadata url: ${serverMetadataUrl}`);
      serverMetadataSource = IAuthServerMetadataSource.ResourceMetadata;
    }
    scopesChallenge ??= metadata.scopes_supported;
    resource = metadata;
  } catch (e) {
    log(LogLevel.Warning, `Could not fetch resource metadata: ${String(e)}`);
  }
  const baseUrl = new URL(resourceUrl).origin;
  let additionalHeaders = {};
  if (!serverMetadataUrl) {
    serverMetadataUrl = baseUrl;
    if (sameOriginHeaders) {
      additionalHeaders = sameOriginHeaders;
    }
  }
  try {
    log(LogLevel.Debug, `Fetching auth server metadata for: ${serverMetadataUrl} ...`);
    const { metadata, discoveryUrl, errors } = await fetchAuthorizationServerMetadata(serverMetadataUrl, {
      additionalHeaders,
      fetch: (url, init) => fetch2(url, init)
    });
    for (const err of errors) {
      log(LogLevel.Warning, `Error fetching authorization server metadata: ${err}`);
    }
    log(LogLevel.Info, `Discovered authorization server metadata at ${discoveryUrl}`);
    serverMetadataSource ??= IAuthServerMetadataSource.WellKnown;
    return new AuthMetadata(
      URI.parse(serverMetadataUrl),
      metadata,
      resource,
      scopesChallenge,
      { resourceMetadataSource, serverMetadataSource },
      log
    );
  } catch (e) {
    log(LogLevel.Warning, `Error populating auth server metadata for ${serverMetadataUrl}: ${String(e)}`);
  }
  const defaultMetadata = getDefaultMetadataForUrl(new URL(baseUrl));
  log(LogLevel.Info, "Using default auth metadata");
  return new AuthMetadata(
    URI.parse(baseUrl),
    defaultMetadata,
    resource,
    scopesChallenge,
    { resourceMetadataSource, serverMetadataSource: IAuthServerMetadataSource.Default },
    log
  );
}
function parseWWWAuthenticateHeaderForChallenges(wwwAuthenticateValue, log) {
  if (!wwwAuthenticateValue) {
    return {};
  }
  let resourceMetadataChallenge;
  let scopesChallenge;
  const challenges = parseWWWAuthenticateHeader(wwwAuthenticateValue);
  for (const challenge of challenges) {
    if (challenge.scheme === "Bearer") {
      if (!resourceMetadataChallenge && challenge.params["resource_metadata"]) {
        resourceMetadataChallenge = challenge.params["resource_metadata"];
        log(LogLevel.Debug, `Found resource_metadata challenge in WWW-Authenticate header: ${resourceMetadataChallenge}`);
      }
      if (!scopesChallenge && challenge.params["scope"]) {
        const scopes = challenge.params["scope"].split(AUTH_SCOPE_SEPARATOR).filter((s) => s.trim().length);
        if (scopes.length) {
          log(LogLevel.Debug, `Found scope challenge in WWW-Authenticate header: ${challenge.params["scope"]}`);
          scopesChallenge = scopes;
        }
      }
      if (resourceMetadataChallenge && scopesChallenge) {
        break;
      }
    }
  }
  return { resourceMetadataChallenge, scopesChallenge };
}
export {
  ExtHostMcpService,
  IExtHostMpcService,
  McpHTTPHandle,
  createAuthMetadata
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RNY3AudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgcmFjZUNhbmNlbGxhdGlvbkVycm9yLCBTZXF1ZW5jZXIsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQVVUSF9TQ09QRV9TRVBBUkFUT1IsIGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhLCBmZXRjaFJlc291cmNlTWV0YWRhdGEsIGdldERlZmF1bHRNZXRhZGF0YUZvclVybCwgSUF1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhLCBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhLCBwYXJzZVdXV0F1dGhlbnRpY2F0ZUhlYWRlciwgc2NvcGVzTWF0Y2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYXV0aC5qcyc7XG5pbXBvcnQgeyBTU0VQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zc2VQYXJzZXIuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHZBcnJheSwgdk51bWJlciwgdk9iaiwgdk9iakFueSwgdk9wdGlvbmFsUHJvcCwgdlN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3ZhbGlkYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGNhbkxvZywgSUxvZ1NlcnZpY2UsIExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGV4dGVuc2lvblByZWZpeGVkSWRlbnRpZmllciwgTWNwQ29sbGVjdGlvbkRlZmluaXRpb24sIE1jcENvbm5lY3Rpb25TdGF0ZSwgTWNwU2VydmVyRGVmaW5pdGlvbiwgTWNwU2VydmVyTGF1bmNoLCBNY3BTZXJ2ZXJTdGF0aWNNZXRhZGF0YSwgTWNwU2VydmVyU3RhdGljVG9vbEF2YWlsYWJpbGl0eSwgTWNwU2VydmVyVHJhbnNwb3J0SFRUUCwgTWNwU2VydmVyVHJhbnNwb3J0VHlwZSwgVXNlckludGVyYWN0aW9uUmVxdWlyZWRFcnJvciB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBNQ1AgfSBmcm9tICcuLi8uLi9jb250cmliL21jcC9jb21tb24vbW9kZWxDb250ZXh0UHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgY2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQsIGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0TWNwU2hhcGUsIElNY3BBdXRoZW50aWNhdGlvbkRldGFpbHMsIElBdXRoTWV0YWRhdGFTb3VyY2UsIElTdGFydE1jcE9wdGlvbnMsIE1haW5Db250ZXh0LCBNYWluVGhyZWFkTWNwU2hhcGUsIElBdXRoUmVzb3VyY2VNZXRhZGF0YVNvdXJjZSwgSUF1dGhTZXJ2ZXJNZXRhZGF0YVNvdXJjZSB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEluaXREYXRhU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdEluaXREYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcbmltcG9ydCAqIGFzIENvbnZlcnQgZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0IHsgTWNwSHR0cFNlcnZlckRlZmluaXRpb24sIE1jcFN0ZGlvU2VydmVyRGVmaW5pdGlvbiwgTWNwVG9vbEF2YWlsYWJpbGl0eSB9IGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VmFyaWFibGVSZXNvbHZlclByb3ZpZGVyIH0gZnJvbSAnLi9leHRIb3N0VmFyaWFibGVSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RXb3Jrc3BhY2UgfSBmcm9tICcuL2V4dEhvc3RXb3Jrc3BhY2UuanMnO1xuXG5leHBvcnQgY29uc3QgSUV4dEhvc3RNcGNTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElFeHRIb3N0TXBjU2VydmljZT4oJ0lFeHRIb3N0TXBjU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRIb3N0TXBjU2VydmljZSBleHRlbmRzIEV4dEhvc3RNY3BTaGFwZSB7XG5cdHJlZ2lzdGVyTWNwQ29uZmlndXJhdGlvblByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpZDogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLk1jcFNlcnZlckRlZmluaXRpb25Qcm92aWRlcik6IElEaXNwb3NhYmxlO1xuXG5cdC8qKiBFdmVudCB0aGF0IGZpcmVzIHdoZW4gdGhlIHNldCBvZiBNQ1Agc2VydmVyIGRlZmluaXRpb25zIGNoYW5nZXMuICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWNwU2VydmVyRGVmaW5pdGlvbnM6IEV2ZW50PHZvaWQ+O1xuXG5cdC8qKiBSZXR1cm5zIGFsbCBNQ1Agc2VydmVyIGRlZmluaXRpb25zIGtub3duIHRvIHRoZSBlZGl0b3IuICovXG5cdHJlYWRvbmx5IG1jcFNlcnZlckRlZmluaXRpb25zOiByZWFkb25seSB2c2NvZGUuTWNwU2VydmVyRGVmaW5pdGlvbltdO1xuXG5cdC8qKiBTdGFydHMgYW4gTUNQIGdhdGV3YXkgdGhhdCBleHBvc2VzIE1DUCBzZXJ2ZXJzIHZpYSBIVFRQIGVuZHBvaW50cy4gKi9cblx0c3RhcnRNY3BHYXRld2F5KGNoYXRTZXNzaW9uUmVzb3VyY2U/OiBVUkkpOiBQcm9taXNlPHZzY29kZS5NY3BHYXRld2F5IHwgdW5kZWZpbmVkPjtcbn1cblxuY29uc3Qgc2VydmVyRGF0YVZhbGlkYXRpb24gPSB2T2JqKHtcblx0bGFiZWw6IHZTdHJpbmcoKSxcblx0dmVyc2lvbjogdk9wdGlvbmFsUHJvcCh2U3RyaW5nKCkpLFxuXHRtZXRhZGF0YTogdk9wdGlvbmFsUHJvcCh2T2JqKHtcblx0XHRjYXBhYmlsaXRpZXM6IHZPcHRpb25hbFByb3Aodk9iakFueSgpKSxcblx0XHRzZXJ2ZXJJbmZvOiB2T3B0aW9uYWxQcm9wKHZPYmpBbnkoKSksXG5cdFx0dG9vbHM6IHZPcHRpb25hbFByb3AodkFycmF5KHZPYmooe1xuXHRcdFx0YXZhaWxhYmlsaXR5OiB2TnVtYmVyKCksXG5cdFx0XHRkZWZpbml0aW9uOiB2T2JqQW55KCksXG5cdFx0fSkpKSxcblx0fSkpLFxuXHRhdXRoZW50aWNhdGlvbjogdk9wdGlvbmFsUHJvcCh2T2JqKHtcblx0XHRwcm92aWRlcklkOiB2U3RyaW5nKCksXG5cdFx0c2NvcGVzOiB2QXJyYXkodlN0cmluZygpKSxcblx0fSkpXG59KTtcblxuLy8gQ2FuIGJlIHZhbGlkYXRlZCB3aXRoOlxuLy8gZGVjbGFyZSBjb25zdCBfc2VydmVyRGF0YVZhbGlkYXRpb25UZXN0OiB2c2NvZGUuTWNwU3RkaW9TZXJ2ZXJEZWZpbml0aW9uIHwgdnNjb2RlLk1jcEh0dHBTZXJ2ZXJEZWZpbml0aW9uO1xuLy8gY29uc3QgX3NlcnZlckRhdGFWYWxpZGF0aW9uUHJvZDogVmFsaWRhdG9yVHlwZTx0eXBlb2Ygc2VydmVyRGF0YVZhbGlkYXRpb24+ID0gX3NlcnZlckRhdGFWYWxpZGF0aW9uVGVzdDtcblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RNY3BTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRIb3N0TXBjU2VydmljZSB7XG5cdHByb3RlY3RlZCBfcHJveHk6IE1haW5UaHJlYWRNY3BTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5pdGlhbFByb3ZpZGVyUHJvbWlzZXMgPSBuZXcgU2V0PFByb21pc2U8dm9pZD4+KCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBfc3NlRXZlbnRTb3VyY2VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyLCBNY3BIVFRQSGFuZGxlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdW5yZXNvbHZlZE1jcFNlcnZlcnMgPSBuZXcgTWFwPC8qIGNvbGxlY3Rpb25JZCAqLyBzdHJpbmcsIHtcblx0XHRwcm92aWRlcjogdnNjb2RlLk1jcFNlcnZlckRlZmluaXRpb25Qcm92aWRlcjtcblx0XHRzZXJ2ZXJzOiB2c2NvZGUuTWNwU2VydmVyRGVmaW5pdGlvbltdO1xuXHR9PigpO1xuXG5cdC8vIE1DUCBzZXJ2ZXIgZGVmaW5pdGlvbnMgc3luY2VkIGZyb20gbWFpbiB0aHJlYWRcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNY3BTZXJ2ZXJEZWZpbml0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1jcFNlcnZlckRlZmluaXRpb25zOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlTWNwU2VydmVyRGVmaW5pdGlvbnMuZXZlbnQ7XG5cdHByaXZhdGUgX21jcFNlcnZlckRlZmluaXRpb25zOiByZWFkb25seSB2c2NvZGUuTWNwU2VydmVyRGVmaW5pdGlvbltdID0gW107XG5cblx0Ly8gQWN0aXZlIGdhdGV3YXlzIHdpdGggdGhlaXIgc2VydmVyIGVtaXR0ZXJzIGZvciBkeW5hbWljIHVwZGF0ZXNcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlR2F0ZXdheXMgPSBuZXcgTWFwPHN0cmluZywge1xuXHRcdHNlcnZlcnM6IHZzY29kZS5NY3BHYXRld2F5U2VydmVyW107XG5cdFx0b25EaWRDaGFuZ2VTZXJ2ZXJzOiBFbWl0dGVyPHJlYWRvbmx5IHZzY29kZS5NY3BHYXRld2F5U2VydmVyW10+O1xuXHR9PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdEluaXREYXRhU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0SW5pdERhdGE6IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdFdvcmtzcGFjZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3dvcmtzcGFjZVNlcnZpY2U6IElFeHRIb3N0V29ya3NwYWNlLFxuXHRcdEBJRXh0SG9zdFZhcmlhYmxlUmVzb2x2ZXJQcm92aWRlciBwcml2YXRlIHJlYWRvbmx5IF92YXJpYWJsZVJlc29sdmVyOiBJRXh0SG9zdFZhcmlhYmxlUmVzb2x2ZXJQcm92aWRlcixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RScGMuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZE1jcCk7XG5cdH1cblxuXHQvKiogUmV0dXJucyBhbGwgTUNQIHNlcnZlciBkZWZpbml0aW9ucyBrbm93biB0byB0aGUgZWRpdG9yLiAqL1xuXHRnZXQgbWNwU2VydmVyRGVmaW5pdGlvbnMoKTogcmVhZG9ubHkgdnNjb2RlLk1jcFNlcnZlckRlZmluaXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX21jcFNlcnZlckRlZmluaXRpb25zO1xuXHR9XG5cblx0LyoqIENhbGxlZCBieSBtYWluIHRocmVhZCB0byBub3RpZnkgdGhhdCBNQ1Agc2VydmVyIGRlZmluaXRpb25zIGhhdmUgY2hhbmdlZC4gKi9cblx0JG9uRGlkQ2hhbmdlTWNwU2VydmVyRGVmaW5pdGlvbnMoc2VydmVyczogTWNwU2VydmVyRGVmaW5pdGlvbi5TZXJpYWxpemVkW10pOiB2b2lkIHtcblx0XHR0aGlzLl9tY3BTZXJ2ZXJEZWZpbml0aW9ucyA9IHNlcnZlcnMubWFwKGR0byA9PiBDb252ZXJ0Lk1jcFNlcnZlckRlZmluaXRpb24udG8oZHRvKSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VNY3BTZXJ2ZXJEZWZpbml0aW9ucy5maXJlKCk7XG5cdH1cblxuXHQkc3RhcnRNY3AoaWQ6IG51bWJlciwgb3B0czogSVN0YXJ0TWNwT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXJ0TWNwKGlkLCBNY3BTZXJ2ZXJMYXVuY2guZnJvbVNlcmlhbGl6ZWQob3B0cy5sYXVuY2gpLCBvcHRzLmRlZmF1bHRDd2QgJiYgVVJJLnJldml2ZShvcHRzLmRlZmF1bHRDd2QpLCBvcHRzLmVycm9yT25Vc2VySW50ZXJhY3Rpb24pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zdGFydE1jcChpZDogbnVtYmVyLCBsYXVuY2g6IE1jcFNlcnZlckxhdW5jaCwgX2RlZmF1bHRDd2Q/OiBVUkksIGVycm9yT25Vc2VySW50ZXJhY3Rpb24/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGxhdW5jaC50eXBlID09PSBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLkhUVFApIHtcblx0XHRcdHRoaXMuX3NzZUV2ZW50U291cmNlcy5zZXQoaWQsIG5ldyBNY3BIVFRQSGFuZGxlKGlkLCBsYXVuY2gsIHRoaXMuX3Byb3h5LCB0aGlzLl9sb2dTZXJ2aWNlLCBlcnJvck9uVXNlckludGVyYWN0aW9uKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdGFzeW5jICRzdWJzdGl0dXRlVmFyaWFibGVzPFQ+KF93b3Jrc3BhY2VGb2xkZXI6IFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQsIHZhbHVlOiBUKTogUHJvbWlzZTxUPiB7XG5cdFx0Y29uc3QgZm9sZGVyVVJJID0gVVJJLnJldml2ZShfd29ya3NwYWNlRm9sZGVyKTtcblx0XHRjb25zdCBmb2xkZXIgPSBmb2xkZXJVUkkgJiYgYXdhaXQgdGhpcy5fd29ya3NwYWNlU2VydmljZS5yZXNvbHZlV29ya3NwYWNlRm9sZGVyKGZvbGRlclVSSSk7XG5cdFx0Y29uc3QgdmFyaWFibGVSZXNvbHZlciA9IGF3YWl0IHRoaXMuX3ZhcmlhYmxlUmVzb2x2ZXIuZ2V0UmVzb2x2ZXIoKTtcblx0XHRyZXR1cm4gdmFyaWFibGVSZXNvbHZlci5yZXNvbHZlQXN5bmMoZm9sZGVyICYmIHtcblx0XHRcdHVyaTogZm9sZGVyLnVyaSxcblx0XHRcdG5hbWU6IGZvbGRlci5uYW1lLFxuXHRcdFx0aW5kZXg6IGZvbGRlci5pbmRleCxcblx0XHR9LCB2YWx1ZSkgYXMgVDtcblx0fVxuXG5cdCRzdG9wTWNwKGlkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9zc2VFdmVudFNvdXJjZXMuZ2V0KGlkKVxuXHRcdFx0Py5jbG9zZSgpXG5cdFx0XHQudGhlbigoKSA9PiB0aGlzLl9kaWRDbG9zZShpZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlkQ2xvc2UoaWQ6IG51bWJlcikge1xuXHRcdHRoaXMuX3NzZUV2ZW50U291cmNlcy5kZWxldGVBbmREaXNwb3NlKGlkKTtcblx0fVxuXG5cdCRzZW5kTWVzc2FnZShpZDogbnVtYmVyLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9zc2VFdmVudFNvdXJjZXMuZ2V0KGlkKT8uc2VuZChtZXNzYWdlKTtcblx0fVxuXG5cdGFzeW5jICR3YWl0Rm9ySW5pdGlhbENvbGxlY3Rpb25Qcm92aWRlcnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwodGhpcy5faW5pdGlhbFByb3ZpZGVyUHJvbWlzZXMpO1xuXHR9XG5cblx0YXN5bmMgJHJlc29sdmVNY3BMYXVuY2goY29sbGVjdGlvbklkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcpOiBQcm9taXNlPE1jcFNlcnZlckxhdW5jaC5TZXJpYWxpemVkIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVjID0gdGhpcy5fdW5yZXNvbHZlZE1jcFNlcnZlcnMuZ2V0KGNvbGxlY3Rpb25JZCk7XG5cdFx0aWYgKCFyZWMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXJ2ZXIgPSByZWMuc2VydmVycy5maW5kKHMgPT4gcy5sYWJlbCA9PT0gbGFiZWwpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghcmVjLnByb3ZpZGVyLnJlc29sdmVNY3BTZXJ2ZXJEZWZpbml0aW9uKSB7XG5cdFx0XHRyZXR1cm4gQ29udmVydC5NY3BTZXJ2ZXJEZWZpbml0aW9uLmZyb20oc2VydmVyKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHJlYy5wcm92aWRlci5yZXNvbHZlTWNwU2VydmVyRGVmaW5pdGlvbihzZXJ2ZXIsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdHJldHVybiByZXNvbHZlZCA/IENvbnZlcnQuTWNwU2VydmVyRGVmaW5pdGlvbi5mcm9tKHJlc29sdmVkKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiB7QGxpbmsgdnNjb2RlLmxtLnJlZ2lzdGVyTWNwU2VydmVyRGVmaW5pdGlvblByb3ZpZGVyfSAqL1xuXHRwdWJsaWMgcmVnaXN0ZXJNY3BDb25maWd1cmF0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlkOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuTWNwU2VydmVyRGVmaW5pdGlvblByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBleHRlbnNpb24uY29udHJpYnV0ZXM/Lm1jcFNlcnZlckRlZmluaXRpb25Qcm92aWRlcnM/LmZpbmQobSA9PiBtLmlkID09PSBpZCk7XG5cdFx0aWYgKCFtZXRhZGF0YSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNQ1AgY29uZmlndXJhdGlvbiBwcm92aWRlcnMgbXVzdCBiZSByZWdpc3RlcmVkIGluIHRoZSBjb250cmlidXRlcy5tY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXJzIGFycmF5IHdpdGhpbiB5b3VyIHBhY2thZ2UuanNvbiwgYnV0IFwiJHtpZH1cIiB3YXMgbm90YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWNwOiBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbi5Gcm9tRXh0SG9zdCA9IHtcblx0XHRcdGlkOiBleHRlbnNpb25QcmVmaXhlZElkZW50aWZpZXIoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGlkKSxcblx0XHRcdGlzVHJ1c3RlZEJ5RGVmYXVsdDogdHJ1ZSxcblx0XHRcdGxhYmVsOiBtZXRhZGF0YT8ubGFiZWwgPz8gZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5uYW1lLFxuXHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsXG5cdFx0XHRjYW5SZXNvbHZlTGF1bmNoOiB0eXBlb2YgcHJvdmlkZXIucmVzb2x2ZU1jcFNlcnZlckRlZmluaXRpb24gPT09ICdmdW5jdGlvbicsXG5cdFx0XHRleHRlbnNpb25JZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUsXG5cdFx0XHRjb25maWdUYXJnZXQ6IHRoaXMuX2V4dEhvc3RJbml0RGF0YS5yZW1vdGUuaXNSZW1vdGUgPyBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFIDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdH07XG5cblx0XHRjb25zdCB1cGRhdGUgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZU1jcFNlcnZlckRlZmluaXRpb25zKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0dGhpcy5fdW5yZXNvbHZlZE1jcFNlcnZlcnMuc2V0KG1jcC5pZCwgeyBzZXJ2ZXJzOiBsaXN0ID8/IFtdLCBwcm92aWRlciB9KTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyczogTWNwU2VydmVyRGVmaW5pdGlvbi5TZXJpYWxpemVkW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBsaXN0ID8/IFtdKSB7XG5cdFx0XHRcdGxldCBpZCA9IEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uLmlkZW50aWZpZXIpICsgJy8nICsgaXRlbS5sYWJlbDtcblx0XHRcdFx0aWYgKHNlcnZlcnMuc29tZShzID0+IHMuaWQgPT09IGlkKSkge1xuXHRcdFx0XHRcdGxldCBpID0gMjtcblx0XHRcdFx0XHR3aGlsZSAoc2VydmVycy5zb21lKHMgPT4gcy5pZCA9PT0gaWQgKyBpKSkgeyBpKys7IH1cblx0XHRcdFx0XHRpZCA9IGlkICsgaTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHNlcnZlckRhdGFWYWxpZGF0aW9uLnZhbGlkYXRlT3JUaHJvdyhpdGVtKTtcblx0XHRcdFx0aWYgKChpdGVtIGFzIHZzY29kZS5NY3BIdHRwU2VydmVyRGVmaW5pdGlvbjIpLmF1dGhlbnRpY2F0aW9uKSB7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbWNwVG9vbERlZmluaXRpb25zJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgc3RhdGljTWV0YWRhdGE6IE1jcFNlcnZlclN0YXRpY01ldGFkYXRhIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBjYXN0QXMyID0gaXRlbSBhcyBNY3BTdGRpb1NlcnZlckRlZmluaXRpb24gfCBNY3BIdHRwU2VydmVyRGVmaW5pdGlvbjtcblx0XHRcdFx0aWYgKGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ21jcFRvb2xEZWZpbml0aW9ucycpICYmIGNhc3RBczIubWV0YWRhdGEpIHtcblx0XHRcdFx0XHRzdGF0aWNNZXRhZGF0YSA9IHtcblx0XHRcdFx0XHRcdGNhcGFiaWxpdGllczogY2FzdEFzMi5tZXRhZGF0YS5jYXBhYmlsaXRpZXMgYXMgTUNQLlNlcnZlckNhcGFiaWxpdGllcyxcblx0XHRcdFx0XHRcdGluc3RydWN0aW9uczogY2FzdEFzMi5tZXRhZGF0YS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0XHRzZXJ2ZXJJbmZvOiBjYXN0QXMyLm1ldGFkYXRhLnNlcnZlckluZm8gYXMgTUNQLkltcGxlbWVudGF0aW9uLFxuXHRcdFx0XHRcdFx0dG9vbHM6IGNhc3RBczIubWV0YWRhdGEudG9vbHM/Lm1hcCh0ID0+ICh7XG5cdFx0XHRcdFx0XHRcdGF2YWlsYWJpbGl0eTogdC5hdmFpbGFiaWxpdHkgPT09IE1jcFRvb2xBdmFpbGFiaWxpdHkuRHluYW1pYyA/IE1jcFNlcnZlclN0YXRpY1Rvb2xBdmFpbGFiaWxpdHkuRHluYW1pYyA6IE1jcFNlcnZlclN0YXRpY1Rvb2xBdmFpbGFiaWxpdHkuSW5pdGlhbCxcblx0XHRcdFx0XHRcdFx0ZGVmaW5pdGlvbjogdC5kZWZpbml0aW9uIGFzIE1DUC5Ub29sLFxuXHRcdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzZXJ2ZXJzLnB1c2goe1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0XHRcdGNhY2hlTm9uY2U6IGl0ZW0udmVyc2lvbiB8fCAnJCROT05FJyxcblx0XHRcdFx0XHRzdGF0aWNNZXRhZGF0YSxcblx0XHRcdFx0XHRsYXVuY2g6IENvbnZlcnQuTWNwU2VydmVyRGVmaW5pdGlvbi5mcm9tKGl0ZW0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcHJveHkuJHVwc2VydE1jcENvbGxlY3Rpb24obWNwLCBzZXJ2ZXJzKTtcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl91bnJlc29sdmVkTWNwU2VydmVycy5kZWxldGUobWNwLmlkKTtcblx0XHRcdHRoaXMuX3Byb3h5LiRkZWxldGVNY3BDb2xsZWN0aW9uKG1jcC5pZCk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHByb3ZpZGVyLm9uRGlkQ2hhbmdlTWNwU2VydmVyRGVmaW5pdGlvbnMpIHtcblx0XHRcdHN0b3JlLmFkZChwcm92aWRlci5vbkRpZENoYW5nZU1jcFNlcnZlckRlZmluaXRpb25zKHVwZGF0ZSkpO1xuXHRcdH1cblx0XHQvLyB0b2RvQGNvbm5vcjQzMTI6IHByb3Bvc2VkIEFQSSBiYWNrLWNvbXBhdFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGlmICgocHJvdmlkZXIgYXMgYW55KS5vbkRpZENoYW5nZVNlcnZlckRlZmluaXRpb25zKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHN0b3JlLmFkZCgocHJvdmlkZXIgYXMgYW55KS5vbkRpZENoYW5nZVNlcnZlckRlZmluaXRpb25zKHVwZGF0ZSkpO1xuXHRcdH1cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRpZiAoKHByb3ZpZGVyIGFzIGFueSkub25EaWRDaGFuZ2UpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0c3RvcmUuYWRkKChwcm92aWRlciBhcyBhbnkpLm9uRGlkQ2hhbmdlKHVwZGF0ZSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4gdXBkYXRlKCkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2luaXRpYWxQcm92aWRlclByb21pc2VzLmRlbGV0ZShwcm9taXNlKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSksIDApO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5faW5pdGlhbFByb3ZpZGVyUHJvbWlzZXMuYWRkKHByb21pc2UpO1xuXG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG5cblx0LyoqIHtAbGluayB2c2NvZGUubG0uc3RhcnRNY3BHYXRld2F5fSAqL1xuXHRwdWJsaWMgYXN5bmMgc3RhcnRNY3BHYXRld2F5KGNoYXRTZXNzaW9uUmVzb3VyY2U/OiBVUkkpOiBQcm9taXNlPHZzY29kZS5NY3BHYXRld2F5IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJveHkuJHN0YXJ0TWNwR2F0ZXdheShjaGF0U2Vzc2lvblJlc291cmNlPy50b0pTT04oKSk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ2F0ZXdheUlkID0gcmVzdWx0LmdhdGV3YXlJZDtcblx0XHRjb25zdCBzZXJ2ZXJzOiB2c2NvZGUuTWNwR2F0ZXdheVNlcnZlcltdID0gcmVzdWx0LnNlcnZlcnMubWFwKHMgPT4gKHtcblx0XHRcdGxhYmVsOiBzLmxhYmVsLFxuXHRcdFx0YWRkcmVzczogVVJJLnJldml2ZShzLmFkZHJlc3MpLFxuXHRcdH0pKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZVNlcnZlcnMgPSBuZXcgRW1pdHRlcjxyZWFkb25seSB2c2NvZGUuTWNwR2F0ZXdheVNlcnZlcltdPigpO1xuXG5cdFx0dGhpcy5fYWN0aXZlR2F0ZXdheXMuc2V0KGdhdGV3YXlJZCwgeyBzZXJ2ZXJzLCBvbkRpZENoYW5nZVNlcnZlcnMgfSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0IHNlcnZlcnMoKSB7IHJldHVybiBzZXJ2ZXJzOyB9LFxuXHRcdFx0b25EaWRDaGFuZ2VTZXJ2ZXJzOiBvbkRpZENoYW5nZVNlcnZlcnMuZXZlbnQsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUdhdGV3YXlzLmRlbGV0ZShnYXRld2F5SWQpO1xuXHRcdFx0XHRvbkRpZENoYW5nZVNlcnZlcnMuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kZGlzcG9zZU1jcEdhdGV3YXkoZ2F0ZXdheUlkKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0LyoqIENhbGxlZCBieSBtYWluIHRocmVhZCB0byBub3RpZnkgdGhhdCBhIGdhdGV3YXkncyBzZXJ2ZXIgc2V0IGhhcyBjaGFuZ2VkLiAqL1xuXHQkb25EaWRDaGFuZ2VHYXRld2F5U2VydmVycyhnYXRld2F5SWQ6IHN0cmluZywgbmV3U2VydmVyczogeyBsYWJlbDogc3RyaW5nOyBhZGRyZXNzOiBVcmlDb21wb25lbnRzIH1bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGdhdGV3YXkgPSB0aGlzLl9hY3RpdmVHYXRld2F5cy5nZXQoZ2F0ZXdheUlkKTtcblx0XHRpZiAoIWdhdGV3YXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXJ2ZXJzOiB2c2NvZGUuTWNwR2F0ZXdheVNlcnZlcltdID0gbmV3U2VydmVycy5tYXAocyA9PiAoe1xuXHRcdFx0bGFiZWw6IHMubGFiZWwsXG5cdFx0XHRhZGRyZXNzOiBVUkkucmV2aXZlKHMuYWRkcmVzcyksXG5cdFx0fSkpO1xuXHRcdGdhdGV3YXkuc2VydmVycy5sZW5ndGggPSAwO1xuXHRcdGdhdGV3YXkuc2VydmVycy5wdXNoKC4uLnNlcnZlcnMpO1xuXHRcdGdhdGV3YXkub25EaWRDaGFuZ2VTZXJ2ZXJzLmZpcmUoc2VydmVycyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gc3RyaW5naWZ5RXJyb3IoZXJyOiB1bmtub3duKTogc3RyaW5nIHtcblx0aWYgKCEoZXJyIGluc3RhbmNlb2YgRXJyb3IpKSB7XG5cdFx0cmV0dXJuIFN0cmluZyhlcnIpO1xuXHR9XG5cdGxldCBtc2cgPSBTdHJpbmcoZXJyKTtcblx0bGV0IGNhdXNlOiB1bmtub3duID0gZXJyLmNhdXNlO1xuXHRmb3IgKGxldCBkZXB0aCA9IDA7IGNhdXNlICE9PSB1bmRlZmluZWQgJiYgZGVwdGggPCA1OyBkZXB0aCsrKSB7XG5cdFx0bXNnICs9IGA6ICR7Y2F1c2UgaW5zdGFuY2VvZiBFcnJvciA/IChjYXVzZS5tZXNzYWdlIHx8IFN0cmluZyhjYXVzZSkpIDogU3RyaW5nKGNhdXNlKX1gO1xuXHRcdGNhdXNlID0gY2F1c2UgaW5zdGFuY2VvZiBFcnJvciA/IGNhdXNlLmNhdXNlIDogdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBtc2c7XG59XG5cbmNvbnN0IGVudW0gSHR0cE1vZGUge1xuXHRVbmtub3duLFxuXHRIdHRwLFxuXHRTU0UsXG59XG5cbnR5cGUgSHR0cE1vZGVUID1cblx0fCB7IHZhbHVlOiBIdHRwTW9kZS5Vbmtub3duIH1cblx0fCB7IHZhbHVlOiBIdHRwTW9kZS5IdHRwOyBzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9XG5cdHwgeyB2YWx1ZTogSHR0cE1vZGUuU1NFOyBlbmRwb2ludDogc3RyaW5nIH07XG5cbmNvbnN0IE1BWF9GT0xMT1dfUkVESVJFQ1RTID0gNTtcbmNvbnN0IFJFRElSRUNUX1NUQVRVU19DT0RFUyA9IFszMDEsIDMwMiwgMzAzLCAzMDcsIDMwOF07XG4vLyBNQ1Agc2VydmVyIFVSTHMgYXJlIHJlc3RyaWN0ZWQgdG8gaHR0cChzKSBhdCBjb25maWd1cmF0aW9uIHRpbWU7IHRoZSByZWRpcmVjdFxuLy8gcGF0aCBtdXN0IGVuZm9yY2UgdGhlIHNhbWUgc28gYSBMb2NhdGlvbiBoZWFkZXIgY2Fubm90IHJlYWNoIHVuaXg6Ly8sIHBpcGU6Ly8sXG4vLyBmaWxlOi8vLCBldGMuXG5jb25zdCBBTExPV0VEX1JFRElSRUNUX1BST1RPQ09MUyA9IG5ldyBTZXQoWydodHRwOicsICdodHRwczonXSk7XG4vLyBDcmVkZW50aWFsLWJlYXJpbmcgaGVhZGVycyB0aGF0IG11c3Qgbm90IGJlIHJlcGxheWVkIHRvIGEgZGlmZmVyZW50IG9yaWdpblxuLy8gYWZ0ZXIgYSByZWRpcmVjdCAobWF0Y2hlcyBicm93c2VyIGZldGNoIC8gY3VybCBiZWhhdmlvcikuIENvbXBhcmVkIGNhc2UtaW5zZW5zaXRpdmVseS5cbmNvbnN0IENST1NTX09SSUdJTl9TVFJJUFBFRF9IRUFERVJTID0gbmV3IFNldChbJ2F1dGhvcml6YXRpb24nLCAnY29va2llJywgJ3Byb3h5LWF1dGhvcml6YXRpb24nLCAnbWNwLXNlc3Npb24taWQnXSk7XG5cbmZ1bmN0aW9uIHNldEhvc3RIZWFkZXIoaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiwgbmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdGZvciAoY29uc3QgY29uZmlndXJlZE5hbWUgb2YgT2JqZWN0LmtleXMoaGVhZGVycykpIHtcblx0XHRpZiAoY29uZmlndXJlZE5hbWUudG9Mb3dlckNhc2UoKSA9PT0gbmFtZS50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0XHRkZWxldGUgaGVhZGVyc1tjb25maWd1cmVkTmFtZV07XG5cdFx0fVxuXHR9XG5cdGhlYWRlcnNbbmFtZV0gPSB2YWx1ZTtcbn1cblxuLyoqXG4gKiBJbXBsZW1lbnRhdGlvbiBvZiBib3RoIE1DUCBIVFRQIFN0cmVhbWluZyBhcyB3ZWxsIGFzIGxlZ2FjeSBTU0UuXG4gKlxuICogVGhlIGZpcnN0IHJlcXVlc3Qgd2lsbCBQT1NUIHRvIHRoZSBlbmRwb2ludCwgYXNzdW1pbmcgSFRUUCBzdHJlYW1pbmcuIElmIHRoZVxuICogc2VydmVyIGlzIGxlZ2FjeSBTU0UsIGl0IHNob3VsZCByZXR1cm4gc29tZSA0eHggc3RhdHVzIGluIHRoYXQgY2FzZSxcbiAqIGFuZCB3ZSdsbCBhdXRvbWF0aWNhbGx5IGZhbGwgYmFjayB0byBTU0UgYW5kIHJlc1xuICovXG5leHBvcnQgY2xhc3MgTWNwSFRUUEhhbmRsZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0U2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wb3N0RW5kcG9pbnQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHsgdXJsOiBzdHJpbmc7IHRyYW5zcG9ydDogTWNwU2VydmVyVHJhbnNwb3J0SFRUUCB9PigpO1xuXHRwcml2YXRlIF9tb2RlOiBIdHRwTW9kZVQgPSB7IHZhbHVlOiBIdHRwTW9kZS5Vbmtub3duIH07XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hYm9ydEN0cmwgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdHByaXZhdGUgX2F1dGhNZXRhZGF0YT86IEF1dGhNZXRhZGF0YTtcblx0cHJpdmF0ZSBfZGlkU2VuZENsb3NlID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaWQ6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sYXVuY2g6IE1jcFNlcnZlclRyYW5zcG9ydEhUVFAsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IE1haW5UaHJlYWRNY3BTaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lcnJvck9uVXNlckludGVyYWN0aW9uPzogYm9vbGVhbixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9hYm9ydEN0cmwuYWJvcnQoKTtcblx0XHRcdHRoaXMuX2N0cy5kaXNwb3NlKHRydWUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VTdGF0ZSh0aGlzLl9pZCwgeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuUnVubmluZyB9KTtcblx0fVxuXG5cdGFzeW5jIHNlbmQobWVzc2FnZTogc3RyaW5nKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0aGlzLl9tb2RlLnZhbHVlID09PSBIdHRwTW9kZS5Vbmtub3duKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3JlcXVlc3RTZXF1ZW5jZXIucXVldWUoKCkgPT4gdGhpcy5fc2VuZChtZXNzYWdlKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zZW5kKG1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc3QgbXNnID0gYEVycm9yIHNlbmRpbmcgbWVzc2FnZSB0byAke3RoaXMuX2xhdW5jaC51cml9OiAke3N0cmluZ2lmeUVycm9yKGVycil9YDtcblx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZVN0YXRlKHRoaXMuX2lkLCB7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvciwgbWVzc2FnZTogbXNnIH0pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNsb3NlKCkge1xuXHRcdGlmICh0aGlzLl9tb2RlLnZhbHVlID09PSBIdHRwTW9kZS5IdHRwICYmIHRoaXMuX21vZGUuc2Vzc2lvbklkICYmICF0aGlzLl9kaWRTZW5kQ2xvc2UpIHtcblx0XHRcdHRoaXMuX2RpZFNlbmRDbG9zZSA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jbG9zZVNlc3Npb24odGhpcy5fbW9kZS5zZXNzaW9uSWQpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZWQgLS0gYWxyZWFkeSBsb2dnZWRcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VTdGF0ZSh0aGlzLl9pZCwgeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Nsb3NlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZykge1xuXHRcdGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdFx0XHQuLi5PYmplY3QuZnJvbUVudHJpZXModGhpcy5fbGF1bmNoLmhlYWRlcnMpLFxuXHRcdFx0J01jcC1TZXNzaW9uLUlkJzogc2Vzc2lvbklkLFxuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fYWRkQXV0aEhlYWRlcihoZWFkZXJzLCB7IGVycm9yT25Vc2VySW50ZXJhY3Rpb246IHRydWUgfSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Ly8gSWYgYXV0aCBpcyBubyBsb25nZXIgYXZhaWxhYmxlIChlLmcuIHVzZXIgc2lnbmVkIG91dCksIHNraXAgdGhlIGNsb3NlIHJlcXVlc3Rcblx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5EZWJ1ZywgYFNraXBwaW5nIHNlc3Npb24gY2xvc2U6IGF1dGhlbnRpY2F0aW9uIG5vIGxvbmdlciBhdmFpbGFibGVgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBubyBmZXRjaCB3aXRoIHJldHJ5IGhlcmUgLS0gZG9uJ3QgdHJ5IHRvIGF1dGggaWYgd2UgZ2V0IGFuIGF1dGggZmFpbHVyZVxuXHRcdGF3YWl0IHRoaXMuX2ZldGNoKFxuXHRcdFx0dGhpcy5fbGF1bmNoLnVyaS50b1N0cmluZyh0cnVlKSxcblx0XHRcdHtcblx0XHRcdFx0bWV0aG9kOiAnREVMRVRFJyxcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdH0sXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmQobWVzc2FnZTogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMuX21vZGUudmFsdWUgPT09IEh0dHBNb2RlLlNTRSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NlbmRMZWdhY3lTU0UodGhpcy5fbW9kZS5lbmRwb2ludCwgbWVzc2FnZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZW5kU3RyZWFtYWJsZUh0dHAobWVzc2FnZSwgdGhpcy5fbW9kZS52YWx1ZSA9PT0gSHR0cE1vZGUuSHR0cCA/IHRoaXMuX21vZGUuc2Vzc2lvbklkIDogdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2VuZHMgYSBzdHJlYW1hYmxlLUhUVFAgcmVxdWVzdC5cblx0ICogMS4gUG9zdHMgdG8gdGhlIGVuZHBvaW50XG5cdCAqIDIuIFVwZGF0ZXMgaW50ZXJuYWwgc3RhdGUgYXMgbmVlZGVkLiBGYWxscyBiYWNrIHRvIFNTRSBpZiBhcHByb3ByaWF0ZS5cblx0ICogMy4gSWYgdGhlIHJlc3BvbnNlIGJvZHkgaXMgZW1wdHksIEpTT04sIG9yIGEgSlNPTiBzdHJlYW0sIGhhbmRsZSBpdCBhcHByb3ByaWF0ZWx5LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfc2VuZFN0cmVhbWFibGVIdHRwKG1lc3NhZ2U6IHN0cmluZywgc2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBhc0J5dGVzID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKG1lc3NhZ2UpIGFzIFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+O1xuXHRcdGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdFx0XHQuLi5PYmplY3QuZnJvbUVudHJpZXModGhpcy5fbGF1bmNoLmhlYWRlcnMpLFxuXHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdEFjY2VwdDogJ3RleHQvZXZlbnQtc3RyZWFtLCBhcHBsaWNhdGlvbi9qc29uJyxcblx0XHR9O1xuXHRcdGlmIChzZXNzaW9uSWQpIHtcblx0XHRcdGhlYWRlcnNbJ01jcC1TZXNzaW9uLUlkJ10gPSBzZXNzaW9uSWQ7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2FkZEF1dGhIZWFkZXIoaGVhZGVycyk7XG5cblx0XHRjb25zdCByZXMgPSBhd2FpdCB0aGlzLl9mZXRjaFdpdGhBdXRoUmV0cnkoXG5cdFx0XHR0aGlzLl9sYXVuY2gudXJpLnRvU3RyaW5nKHRydWUpLFxuXHRcdFx0e1xuXHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0Ym9keTogYXNCeXRlcyxcblx0XHRcdH0sXG5cdFx0XHRoZWFkZXJzXG5cdFx0KTtcblxuXHRcdGNvbnN0IHdhc1Vua25vd24gPSB0aGlzLl9tb2RlLnZhbHVlID09PSBIdHRwTW9kZS5Vbmtub3duO1xuXG5cdFx0Ly8gTWNwLVNlc3Npb24tSWQgaXMgdGhlIHN0cm9uZ2VzdCBzaWduYWwgdGhhdCB3ZSdyZSBpbiBzdHJlYW1hYmxlIEhUVFAgbW9kZVxuXHRcdGNvbnN0IG5leHRTZXNzaW9uSWQgPSByZXMuaGVhZGVycy5nZXQoJ01jcC1TZXNzaW9uLUlkJyk7XG5cdFx0aWYgKG5leHRTZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX21vZGUgPSB7IHZhbHVlOiBIdHRwTW9kZS5IdHRwLCBzZXNzaW9uSWQ6IG5leHRTZXNzaW9uSWQgfTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbW9kZS52YWx1ZSA9PT0gSHR0cE1vZGUuVW5rbm93biAmJlxuXHRcdFx0Ly8gV2UgY2FyZSBhYm91dCA0eHggZXJyb3JzLi4uXG5cdFx0XHRyZXMuc3RhdHVzID49IDQwMCAmJiByZXMuc3RhdHVzIDwgNTAwXG5cdFx0XHQvLyAuLi5leGNlcHQgZm9yIGF1dGggZXJyb3JzXG5cdFx0XHQmJiAhaXNBdXRoU3RhdHVzQ29kZShyZXMuc3RhdHVzKVxuXHRcdCkge1xuXHRcdFx0dGhpcy5fbG9nKExvZ0xldmVsLkluZm8sIGAke3Jlcy5zdGF0dXN9IHN0YXR1cyBzZW5kaW5nIG1lc3NhZ2UgdG8gJHt0aGlzLl9sYXVuY2gudXJpfSwgd2lsbCBhdHRlbXB0IHRvIGZhbGwgYmFjayB0byBsZWdhY3kgU1NFYCk7XG5cdFx0XHR0aGlzLl9zc2VGYWxsYmFja1dpdGhNZXNzYWdlKG1lc3NhZ2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChyZXMuc3RhdHVzID49IDMwMCkge1xuXHRcdFx0Ly8gXCJXaGVuIGEgY2xpZW50IHJlY2VpdmVzIEhUVFAgNDA0IGluIHJlc3BvbnNlIHRvIGEgcmVxdWVzdCBjb250YWluaW5nIGFuIE1jcC1TZXNzaW9uLUlkLCBpdCBNVVNUIHN0YXJ0IGEgbmV3IHNlc3Npb24gYnkgc2VuZGluZyBhIG5ldyBJbml0aWFsaXplUmVxdWVzdCB3aXRob3V0IGEgc2Vzc2lvbiBJRCBhdHRhY2hlZFwiXG5cdFx0XHQvLyBUaG91Z2ggdGhpcyBzYXlzIG9ubHkgNDA0LCBzb21lIHNlcnZlcnMgc2VuZCA0MDBzIGFzIHdlbGwsIGluY2x1ZGluZyB0aGVpciBleGFtcGxlXG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbW9kZWxjb250ZXh0cHJvdG9jb2wvdHlwZXNjcmlwdC1zZGsvaXNzdWVzLzM4OVxuXHRcdFx0Y29uc3QgcmV0cnlXaXRoU2Vzc2lvbklkID0gdGhpcy5fbW9kZS52YWx1ZSA9PT0gSHR0cE1vZGUuSHR0cCAmJiAhIXRoaXMuX21vZGUuc2Vzc2lvbklkICYmIChyZXMuc3RhdHVzID09PSA0MDAgfHwgcmVzLnN0YXR1cyA9PT0gNDA0KTtcblxuXHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlU3RhdGUodGhpcy5faWQsIHtcblx0XHRcdFx0c3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBgJHtyZXMuc3RhdHVzfSBzdGF0dXMgc2VuZGluZyBtZXNzYWdlIHRvICR7dGhpcy5fbGF1bmNoLnVyaX06ICR7YXdhaXQgdGhpcy5fZ2V0RXJyVGV4dChyZXMpfWAgKyAocmV0cnlXaXRoU2Vzc2lvbklkID8gYDsgd2lsbCByZXRyeSB3aXRoIG5ldyBzZXNzaW9uIElEYCA6ICcnKSxcblx0XHRcdFx0c2hvdWxkUmV0cnk6IHJldHJ5V2l0aFNlc3Npb25JZCxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9tb2RlLnZhbHVlID09PSBIdHRwTW9kZS5Vbmtub3duKSB7XG5cdFx0XHR0aGlzLl9tb2RlID0geyB2YWx1ZTogSHR0cE1vZGUuSHR0cCwgc2Vzc2lvbklkOiB1bmRlZmluZWQgfTtcblx0XHR9XG5cdFx0aWYgKHdhc1Vua25vd24pIHtcblx0XHRcdHRoaXMuX2F0dGFjaFN0cmVhbWFibGVCYWNrY2hhbm5lbCgpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX2hhbmRsZVN1Y2Nlc3NmdWxTdHJlYW1hYmxlSHR0cChyZXMsIG1lc3NhZ2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3NlRmFsbGJhY2tXaXRoTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHRjb25zdCBlbmRwb2ludCA9IGF3YWl0IHRoaXMuX2F0dGFjaFNTRSgpO1xuXHRcdGlmIChlbmRwb2ludCkge1xuXHRcdFx0dGhpcy5fbW9kZSA9IHsgdmFsdWU6IEh0dHBNb2RlLlNTRSwgZW5kcG9pbnQgfTtcblx0XHRcdGF3YWl0IHRoaXMuX3NlbmRMZWdhY3lTU0UoZW5kcG9pbnQsIG1lc3NhZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVN1Y2Nlc3NmdWxTdHJlYW1hYmxlSHR0cChyZXM6IENvbW1vblJlc3BvbnNlLCBtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHRpZiAocmVzLnN0YXR1cyA9PT0gMjAyKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vIGJvZHlcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZW50VHlwZSA9IHJlcy5oZWFkZXJzLmdldCgnQ29udGVudC1UeXBlJyk/LnRvTG93ZXJDYXNlKCkgfHwgJyc7XG5cdFx0aWYgKGNvbnRlbnRUeXBlLnN0YXJ0c1dpdGgoJ3RleHQvZXZlbnQtc3RyZWFtJykpIHtcblx0XHRcdGNvbnN0IHBhcnNlciA9IG5ldyBTU0VQYXJzZXIoZXZlbnQgPT4ge1xuXHRcdFx0XHRpZiAoZXZlbnQudHlwZSA9PT0gJ21lc3NhZ2UnKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkUmVjZWl2ZU1lc3NhZ2UodGhpcy5faWQsIGV2ZW50LmRhdGEpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGV2ZW50LnR5cGUgPT09ICdlbmRwb2ludCcpIHtcblx0XHRcdFx0XHQvLyBBbiBTU0Ugc2VydmVyIHRoYXQgZGlkbid0IGNvcnJlY3RseSByZXR1cm4gYSA0eHggc3RhdHVzIHdoZW4gd2UgUE9TVGVkXG5cdFx0XHRcdFx0dGhpcy5fbG9nKExvZ0xldmVsLldhcm5pbmcsIGBSZWNlaXZlZCBTU0UgZW5kcG9pbnQgZnJvbSBhIFBPU1QgdG8gJHt0aGlzLl9sYXVuY2gudXJpfSwgd2lsbCBmYWxsIGJhY2sgdG8gbGVnYWN5IFNTRWApO1xuXHRcdFx0XHRcdHRoaXMuX3NzZUZhbGxiYWNrV2l0aE1lc3NhZ2UobWVzc2FnZSk7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7IC8vIGp1c3QgdG8gZW5kIHRoZSBTU0Ugc3RyZWFtXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9kb1NTRShwYXJzZXIsIHJlcyk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nKExvZ0xldmVsLldhcm5pbmcsIGBFcnJvciByZWFkaW5nIFNTRSBzdHJlYW06ICR7c3RyaW5naWZ5RXJyb3IoZXJyKX1gKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGNvbnRlbnRUeXBlLnN0YXJ0c1dpdGgoJ2FwcGxpY2F0aW9uL2pzb24nKSkge1xuXHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkUmVjZWl2ZU1lc3NhZ2UodGhpcy5faWQsIGF3YWl0IHJlcy50ZXh0KCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCByZXNwb25zZUJvZHkgPSBhd2FpdCByZXMudGV4dCgpO1xuXHRcdFx0aWYgKGlzSlNPTihyZXNwb25zZUJvZHkpKSB7IC8vIHRyeSB0byByZWFkIGFzIEpTT04gZXZlbiBpZiB0aGUgc2VydmVyIGRpZG4ndCBzZXQgdGhlIGNvbnRlbnQgdHlwZVxuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRSZWNlaXZlTWVzc2FnZSh0aGlzLl9pZCwgcmVzcG9uc2VCb2R5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5XYXJuaW5nLCBgVW5leHBlY3RlZCAke3Jlcy5zdGF0dXN9IHJlc3BvbnNlIGZvciByZXF1ZXN0OiAke3Jlc3BvbnNlQm9keX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQXR0YWNoZXMgdGhlIFNTRSBiYWNrY2hhbm5lbCB0aGF0IHN0cmVhbWFibGUgSFRUUCBzZXJ2ZXJzIGNhbiB1c2Vcblx0ICogZm9yIGFzeW5jIG5vdGlmaWNhdGlvbnMuIFRoaXMgaXMgYSBcIk1BWVwiIHN1cHBvcnQsIHNvIGlmIHRoZSBzZXJ2ZXIgZ2l2ZXNcblx0ICogdXMgYSA0eHggY29kZSwgd2UnbGwgc3RvcCB0cnlpbmcgdG8gY29ubmVjdC4uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9hdHRhY2hTdHJlYW1hYmxlQmFja2NoYW5uZWwoKSB7XG5cdFx0bGV0IGxhc3RFdmVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNhblJlY29ubmVjdEF0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgcmV0cnkgPSAwOyAhdGhpcy5fc3RvcmUuaXNEaXNwb3NlZDsgcmV0cnkrKykge1xuXHRcdFx0aWYgKGNhblJlY29ubmVjdEF0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dChNYXRoLm1heCgwLCBjYW5SZWNvbm5lY3RBdCAtIERhdGUubm93KCkpLCB0aGlzLl9jdHMudG9rZW4pO1xuXHRcdFx0XHRjYW5SZWNvbm5lY3RBdCA9IHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoTWF0aC5taW4ocmV0cnkgKiAxMDAwLCAzMF8wMDApLCB0aGlzLl9jdHMudG9rZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcmVzOiBDb21tb25SZXNwb25zZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdFx0XHRcdFx0Li4uT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMuX2xhdW5jaC5oZWFkZXJzKSxcblx0XHRcdFx0XHQnQWNjZXB0JzogJ3RleHQvZXZlbnQtc3RyZWFtJyxcblx0XHRcdFx0fTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fYWRkQXV0aEhlYWRlcihoZWFkZXJzKTtcblxuXHRcdFx0XHRpZiAodGhpcy5fbW9kZS52YWx1ZSA9PT0gSHR0cE1vZGUuSHR0cCAmJiB0aGlzLl9tb2RlLnNlc3Npb25JZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0aGVhZGVyc1snTWNwLVNlc3Npb24tSWQnXSA9IHRoaXMuX21vZGUuc2Vzc2lvbklkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsYXN0RXZlbnRJZCkge1xuXHRcdFx0XHRcdGhlYWRlcnNbJ0xhc3QtRXZlbnQtSUQnXSA9IGxhc3RFdmVudElkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVzID0gYXdhaXQgdGhpcy5fZmV0Y2hXaXRoQXV0aFJldHJ5KFxuXHRcdFx0XHRcdHRoaXMuX2xhdW5jaC51cmkudG9TdHJpbmcodHJ1ZSksXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRoZWFkZXJzXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5JbmZvLCBgRXJyb3IgY29ubmVjdGluZyB0byAke3RoaXMuX2xhdW5jaC51cml9IGZvciBhc3luYyBub3RpZmljYXRpb25zLCB3aWxsIHJldHJ5YCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzLnN0YXR1cyA+PSA0MDApIHtcblx0XHRcdFx0dGhpcy5fbG9nKExvZ0xldmVsLkRlYnVnLCBgJHtyZXMuc3RhdHVzfSBzdGF0dXMgY29ubmVjdGluZyB0byAke3RoaXMuX2xhdW5jaC51cml9IGZvciBhc3luYyBub3RpZmljYXRpb25zOyB0aGV5IHdpbGwgYmUgZGlzYWJsZWQ6ICR7YXdhaXQgdGhpcy5fZ2V0RXJyVGV4dChyZXMpfWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9ubHkgcmVzZXQgdGhlIHJldHJ5IGNvdW50ZXIgaWYgd2UgZGVmaW5pdGVseSBnZXQgYW4gZXZlbnQgc3RyZWFtIHRvIGF2b2lkXG5cdFx0XHQvLyBzcGFtbWluZyBzZXJ2ZXJzIHRoYXQgKGluY29ycmVjdGx5KSBkb24ndCByZXR1cm4gb25lIGZyb20gdGhpcyBlbmRwb2ludC5cblx0XHRcdGlmIChyZXMuaGVhZGVycy5nZXQoJ2NvbnRlbnQtdHlwZScpPy50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCd0ZXh0L2V2ZW50LXN0cmVhbScpKSB7XG5cdFx0XHRcdHJldHJ5ID0gMDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGFyc2VyID0gbmV3IFNTRVBhcnNlcihldmVudCA9PiB7XG5cdFx0XHRcdGlmIChldmVudC5yZXRyeSkge1xuXHRcdFx0XHRcdGNhblJlY29ubmVjdEF0ID0gRGF0ZS5ub3coKSArIGV2ZW50LnJldHJ5O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChldmVudC50eXBlID09PSAnbWVzc2FnZScgJiYgZXZlbnQuZGF0YSkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZFJlY2VpdmVNZXNzYWdlKHRoaXMuX2lkLCBldmVudC5kYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXZlbnQuaWQpIHtcblx0XHRcdFx0XHRsYXN0RXZlbnRJZCA9IGV2ZW50LmlkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZG9TU0UocGFyc2VyLCByZXMpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLl9sb2coTG9nTGV2ZWwuSW5mbywgYEVycm9yIHJlYWRpbmcgZnJvbSBhc3luYyBzdHJlYW0sIHdlIHdpbGwgcmVjb25uZWN0OiAke2V9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN0YXJ0cyBhIGxlZ2FjeSBTU0UgYXR0YWNobWVudCwgd2hlcmUgdGhlIFNTRSByZXNwb25zZSBpcyB0aGUgc2Vzc2lvbiBsaWZldGltZS5cblx0ICogVW5saWtlIGBfYXR0YWNoU3RyZWFtYWJsZUJhY2tjaGFubmVsYCwgdGhpcyBmYWlscyB0aGUgc2VydmVyIGlmIGl0IGRpc2Nvbm5lY3RzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYXR0YWNoU1NFKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcG9zdEVuZHBvaW50ID0gbmV3IERlZmVycmVkUHJvbWlzZTxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0XHRcdC4uLk9iamVjdC5mcm9tRW50cmllcyh0aGlzLl9sYXVuY2guaGVhZGVycyksXG5cdFx0XHQnQWNjZXB0JzogJ3RleHQvZXZlbnQtc3RyZWFtJyxcblx0XHR9O1xuXHRcdGF3YWl0IHRoaXMuX2FkZEF1dGhIZWFkZXIoaGVhZGVycyk7XG5cblx0XHRsZXQgcmVzOiBDb21tb25SZXNwb25zZTtcblx0XHR0cnkge1xuXHRcdFx0cmVzID0gYXdhaXQgdGhpcy5fZmV0Y2hXaXRoQXV0aFJldHJ5KFxuXHRcdFx0XHR0aGlzLl9sYXVuY2gudXJpLnRvU3RyaW5nKHRydWUpLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRoZWFkZXJzXG5cdFx0XHQpO1xuXHRcdFx0aWYgKHJlcy5zdGF0dXMgPj0gMzAwKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZVN0YXRlKHRoaXMuX2lkLCB7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvciwgbWVzc2FnZTogYCR7cmVzLnN0YXR1c30gc3RhdHVzIGNvbm5lY3RpbmcgdG8gJHt0aGlzLl9sYXVuY2gudXJpfSBhcyBTU0U6ICR7YXdhaXQgdGhpcy5fZ2V0RXJyVGV4dChyZXMpfWAgfSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VTdGF0ZSh0aGlzLl9pZCwgeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IsIG1lc3NhZ2U6IGBFcnJvciBjb25uZWN0aW5nIHRvICR7dGhpcy5fbGF1bmNoLnVyaX0gYXMgU1NFOiAke2V9YCB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJzZXIgPSBuZXcgU1NFUGFyc2VyKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC50eXBlID09PSAnbWVzc2FnZScpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkUmVjZWl2ZU1lc3NhZ2UodGhpcy5faWQsIGV2ZW50LmRhdGEpO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC50eXBlID09PSAnZW5kcG9pbnQnKSB7XG5cdFx0XHRcdHBvc3RFbmRwb2ludC5jb21wbGV0ZShuZXcgVVJMKGV2ZW50LmRhdGEsIHRoaXMuX2xhdW5jaC51cmkudG9TdHJpbmcodHJ1ZSkpLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHBvc3RFbmRwb2ludC5jYW5jZWwoKSkpO1xuXHRcdHRoaXMuX2RvU1NFKHBhcnNlciwgcmVzKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlU3RhdGUodGhpcy5faWQsIHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yLCBtZXNzYWdlOiBgRXJyb3IgcmVhZGluZyBTU0Ugc3RyZWFtOiAke3N0cmluZ2lmeUVycm9yKGVycil9YCB9KTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwb3N0RW5kcG9pbnQucDtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZW5kcyBhIGxlZ2FjeSBTU0UgbWVzc2FnZSB0byB0aGUgc2VydmVyLiBUaGUgcmVzcG9uc2UgaXMgYWx3YXlzIGVtcHR5IGFuZFxuXHQgKiBpcyBvdGhlcndpc2UgcmVjZWl2ZWQgaW4ge0BsaW5rIF9hdHRhY2hTU0V9J3MgbG9vcC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRMZWdhY3lTU0UodXJsOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZykge1xuXHRcdGNvbnN0IGFzQnl0ZXMgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUobWVzc2FnZSkgYXMgVWludDhBcnJheTxBcnJheUJ1ZmZlcj47XG5cdFx0Y29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0XHRcdC4uLk9iamVjdC5mcm9tRW50cmllcyh0aGlzLl9sYXVuY2guaGVhZGVycyksXG5cdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdH07XG5cdFx0YXdhaXQgdGhpcy5fYWRkQXV0aEhlYWRlcihoZWFkZXJzKTtcblx0XHRjb25zdCByZXMgPSBhd2FpdCB0aGlzLl9mZXRjaCh1cmwsIHtcblx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0aGVhZGVycyxcblx0XHRcdGJvZHk6IGFzQnl0ZXMsXG5cdFx0fSk7XG5cblx0XHRpZiAocmVzLnN0YXR1cyA+PSAzMDApIHtcblx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5XYXJuaW5nLCBgJHtyZXMuc3RhdHVzfSBzdGF0dXMgc2VuZGluZyBtZXNzYWdlIHRvICR7dGhpcy5fcG9zdEVuZHBvaW50fTogJHthd2FpdCB0aGlzLl9nZXRFcnJUZXh0KHJlcyl9YCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEdlbmVyaWMgaGFuZGxlIHRvIHBpcGUgYSByZXNwb25zZSBpbnRvIGFuIFNTRSBwYXJzZXIuICovXG5cdHByaXZhdGUgYXN5bmMgX2RvU1NFKHBhcnNlcjogU1NFUGFyc2VyLCByZXM6IENvbW1vblJlc3BvbnNlKSB7XG5cdFx0aWYgKCFyZXMuYm9keSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlYWRlciA9IHJlcy5ib2R5LmdldFJlYWRlcigpO1xuXHRcdGxldCBjaHVuazogUmVhZGFibGVTdHJlYW1SZWFkUmVzdWx0PFVpbnQ4QXJyYXk+O1xuXHRcdGRvIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNodW5rID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKHJlYWRlci5yZWFkKCksIHRoaXMuX2N0cy50b2tlbik7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0cmVhZGVyLmNhbmNlbCgpO1xuXHRcdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGNodW5rLnZhbHVlKSB7XG5cdFx0XHRcdHBhcnNlci5mZWVkKGNodW5rLnZhbHVlKTtcblx0XHRcdH1cblx0XHR9IHdoaWxlICghY2h1bmsuZG9uZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hZGRBdXRoSGVhZGVyKGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIG9wdGlvbnM/OiB7IGZvcmNlTmV3UmVnaXN0cmF0aW9uPzogYm9vbGVhbjsgZXJyb3JPblVzZXJJbnRlcmFjdGlvbj86IGJvb2xlYW4gfSkge1xuXHRcdGNvbnN0IGVycm9yT25Vc2VySW50ZXJhY3Rpb24gPSBvcHRpb25zPy5lcnJvck9uVXNlckludGVyYWN0aW9uID8/IHRoaXMuX2Vycm9yT25Vc2VySW50ZXJhY3Rpb247XG5cdFx0aWYgKHRoaXMuX2F1dGhNZXRhZGF0YSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgYXV0aERldGFpbHM6IElNY3BBdXRoZW50aWNhdGlvbkRldGFpbHMgPSB7XG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlcjogdGhpcy5fYXV0aE1ldGFkYXRhLmF1dGhvcml6YXRpb25TZXJ2ZXIudG9KU09OKCksXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhOiB0aGlzLl9hdXRoTWV0YWRhdGEuc2VydmVyTWV0YWRhdGEsXG5cdFx0XHRcdFx0cmVzb3VyY2VNZXRhZGF0YTogdGhpcy5fYXV0aE1ldGFkYXRhLnJlc291cmNlTWV0YWRhdGEsXG5cdFx0XHRcdFx0c2NvcGVzOiB0aGlzLl9hdXRoTWV0YWRhdGEuc2NvcGVzLFxuXHRcdFx0XHRcdGNsaWVudElkOiB0aGlzLl9sYXVuY2gub2F1dGg/LmNsaWVudElkLFxuXHRcdFx0XHRcdGVudGVycHJpc2VNYW5hZ2VkOiB0aGlzLl9sYXVuY2gub2F1dGg/LmVudGVycHJpc2VNYW5hZ2VkLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCB0b2tlbiA9IGF3YWl0IHRoaXMuX3Byb3h5LiRnZXRUb2tlbkZyb21TZXJ2ZXJNZXRhZGF0YShcblx0XHRcdFx0XHR0aGlzLl9pZCxcblx0XHRcdFx0XHRhdXRoRGV0YWlscyxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlcnJvck9uVXNlckludGVyYWN0aW9uLFxuXHRcdFx0XHRcdFx0Zm9yY2VOZXdSZWdpc3RyYXRpb246IG9wdGlvbnM/LmZvcmNlTmV3UmVnaXN0cmF0aW9uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICh0b2tlbikge1xuXHRcdFx0XHRcdHNldEhvc3RIZWFkZXIoaGVhZGVycywgJ0F1dGhvcml6YXRpb24nLCBgQmVhcmVyICR7dG9rZW59YCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IuaXMoZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VTdGF0ZSh0aGlzLl9pZCwgeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCwgcmVhc29uOiAnbmVlZHMtdXNlci1pbnRlcmFjdGlvbicgfSk7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbG9nKExvZ0xldmVsLldhcm5pbmcsIGBFcnJvciBnZXR0aW5nIHRva2VuIGZyb20gc2VydmVyIG1ldGFkYXRhOiAke1N0cmluZyhlKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuX2xhdW5jaC5hdXRoZW50aWNhdGlvbikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5fbG9nKExvZ0xldmVsLkRlYnVnLCBgVXNpbmcgcHJvdmlkZWQgYXV0aGVudGljYXRpb24gY29uZmlnOiBwcm92aWRlcklkPSR7dGhpcy5fbGF1bmNoLmF1dGhlbnRpY2F0aW9uLnByb3ZpZGVySWR9LCBzY29wZXM9JHt0aGlzLl9sYXVuY2guYXV0aGVudGljYXRpb24uc2NvcGVzLmpvaW4oJywgJyl9YCk7XG5cdFx0XHRcdGNvbnN0IHRva2VuID0gYXdhaXQgdGhpcy5fcHJveHkuJGdldFRva2VuRm9yUHJvdmlkZXJJZChcblx0XHRcdFx0XHR0aGlzLl9pZCxcblx0XHRcdFx0XHR0aGlzLl9sYXVuY2guYXV0aGVudGljYXRpb24ucHJvdmlkZXJJZCxcblx0XHRcdFx0XHR0aGlzLl9sYXVuY2guYXV0aGVudGljYXRpb24uc2NvcGVzLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVycm9yT25Vc2VySW50ZXJhY3Rpb24sXG5cdFx0XHRcdFx0XHRmb3JjZU5ld1JlZ2lzdHJhdGlvbjogb3B0aW9ucz8uZm9yY2VOZXdSZWdpc3RyYXRpb24sXG5cdFx0XHRcdFx0XHRjbGllbnRJZDogdGhpcy5fbGF1bmNoLm9hdXRoPy5jbGllbnRJZCxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHRcdGlmICh0b2tlbikge1xuXHRcdFx0XHRcdHNldEhvc3RIZWFkZXIoaGVhZGVycywgJ0F1dGhvcml6YXRpb24nLCBgQmVhcmVyICR7dG9rZW59YCk7XG5cdFx0XHRcdFx0dGhpcy5fbG9nKExvZ0xldmVsLkluZm8sICdTdWNjZXNzZnVsbHkgb2J0YWluZWQgdG9rZW4gZnJvbSBwcm92aWRlZCBhdXRoZW50aWNhdGlvbiBjb25maWcnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRpZiAoVXNlckludGVyYWN0aW9uUmVxdWlyZWRFcnJvci5pcyhlKSkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZVN0YXRlKHRoaXMuX2lkLCB7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdG9wcGVkLCByZWFzb246ICduZWVkcy11c2VyLWludGVyYWN0aW9uJyB9KTtcblx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2coTG9nTGV2ZWwuV2FybmluZywgYEVycm9yIGdldHRpbmcgdG9rZW4gZnJvbSBwcm92aWRlZCBhdXRoZW50aWNhdGlvbiBjb25maWc6ICR7U3RyaW5nKGUpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaGVhZGVycztcblx0fVxuXG5cdHByaXZhdGUgX2xvZyhsZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2U6IHN0cmluZykge1xuXHRcdGlmICghdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkUHVibGlzaExvZyh0aGlzLl9pZCwgbGV2ZWwsIG1lc3NhZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldEVyclRleHQocmVzOiBDb21tb25SZXNwb25zZSkge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgcmVzLnRleHQoKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiByZXMuc3RhdHVzVGV4dDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSGVscGVyIG1ldGhvZCB0byBwZXJmb3JtIGZldGNoIHdpdGggYXV0aGVudGljYXRpb24gcmV0cnkgbG9naWMuXG5cdCAqIElmIHRoZSBpbml0aWFsIHJlcXVlc3QgcmV0dXJucyBhbiBhdXRoIGVycm9yIGFuZCB3ZSBkb24ndCBoYXZlIGF1dGggbWV0YWRhdGEsXG5cdCAqIGl0IHdpbGwgcG9wdWxhdGUgdGhlIGF1dGggbWV0YWRhdGEgYW5kIHJldHJ5IG9uY2UuXG5cdCAqIElmIHdlIGFscmVhZHkgaGF2ZSBhdXRoIG1ldGFkYXRhLCBjaGVjayBpZiB0aGUgc2NvcGVzIGNoYW5nZWQgYW5kIHVwZGF0ZSB0aGVtLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZmV0Y2hXaXRoQXV0aFJldHJ5KG1jcFVybDogc3RyaW5nLCBpbml0OiBNaW5pbWFsUmVxdWVzdEluaXQsIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPENvbW1vblJlc3BvbnNlPiB7XG5cdFx0Y29uc3QgZG9GZXRjaCA9ICgpID0+IHRoaXMuX2ZldGNoKG1jcFVybCwgaW5pdCk7XG5cblx0XHRsZXQgcmVzID0gYXdhaXQgZG9GZXRjaCgpO1xuXHRcdGlmIChpc0F1dGhTdGF0dXNDb2RlKHJlcy5zdGF0dXMpKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2F1dGhNZXRhZGF0YSkge1xuXHRcdFx0XHR0aGlzLl9hdXRoTWV0YWRhdGEgPSBhd2FpdCBjcmVhdGVBdXRoTWV0YWRhdGEobWNwVXJsLCByZXMuaGVhZGVycywge1xuXHRcdFx0XHRcdHNhbWVPcmlnaW5IZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQuLi5PYmplY3QuZnJvbUVudHJpZXModGhpcy5fbGF1bmNoLmhlYWRlcnMpLFxuXHRcdFx0XHRcdFx0J01DUC1Qcm90b2NvbC1WZXJzaW9uJzogTUNQLkxBVEVTVF9QUk9UT0NPTF9WRVJTSU9OXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRmZXRjaDogKHVybCwgaW5pdCkgPT4gdGhpcy5fZmV0Y2godXJsLCBpbml0IGFzIE1pbmltYWxSZXF1ZXN0SW5pdCksXG5cdFx0XHRcdFx0bG9nOiAobGV2ZWwsIG1lc3NhZ2UpID0+IHRoaXMuX2xvZyhsZXZlbCwgbWVzc2FnZSlcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRsb2dNY3BBdXRoU2V0dXAodGhpcy5fYXV0aE1ldGFkYXRhLnRlbGVtZXRyeSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2FkZEF1dGhIZWFkZXIoaGVhZGVycyk7XG5cdFx0XHRcdGlmIChoZWFkZXJzWydBdXRob3JpemF0aW9uJ10pIHtcblx0XHRcdFx0XHQvLyBVcGRhdGUgdGhlIGhlYWRlcnMgaW4gdGhlIGluaXQgb2JqZWN0XG5cdFx0XHRcdFx0aW5pdC5oZWFkZXJzID0gaGVhZGVycztcblx0XHRcdFx0XHRyZXMgPSBhd2FpdCBkb0ZldGNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFdlIGhhdmUgYXV0aCBtZXRhZGF0YSwgYnV0IGdvdCBhbiBhdXRoIGVycm9yLiBDaGVjayBpZiB0aGUgc2NvcGVzIGNoYW5nZWQuXG5cdFx0XHRcdGlmICh0aGlzLl9hdXRoTWV0YWRhdGEudXBkYXRlKHJlcy5oZWFkZXJzKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2FkZEF1dGhIZWFkZXIoaGVhZGVycyk7XG5cdFx0XHRcdFx0aWYgKGhlYWRlcnNbJ0F1dGhvcml6YXRpb24nXSkge1xuXHRcdFx0XHRcdFx0Ly8gVXBkYXRlIHRoZSBoZWFkZXJzIGluIHRoZSBpbml0IG9iamVjdFxuXHRcdFx0XHRcdFx0aW5pdC5oZWFkZXJzID0gaGVhZGVycztcblx0XHRcdFx0XHRcdHJlcyA9IGF3YWl0IGRvRmV0Y2goKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gSWYgd2UgaGF2ZSBhbiBBdXRob3JpemF0aW9uIGhlYWRlciBhbmQgc3RpbGwgZ2V0IGFuIGF1dGggZXJyb3IsIHdlIHNob3VsZCByZXRyeSB3aXRoIGEgbmV3IGF1dGggcmVnaXN0cmF0aW9uXG5cdFx0aWYgKGhlYWRlcnNbJ0F1dGhvcml6YXRpb24nXSAmJiBpc0F1dGhTdGF0dXNDb2RlKHJlcy5zdGF0dXMpKSB7XG5cdFx0XHRjb25zdCBlcnJvclRleHQgPSBhd2FpdCB0aGlzLl9nZXRFcnJUZXh0KHJlcyk7XG5cdFx0XHR0aGlzLl9sb2coTG9nTGV2ZWwuSW5mbywgYFJlY2VpdmVkICR7cmVzLnN0YXR1c30gc3RhdHVzIHdpdGggQXV0aG9yaXphdGlvbiBoZWFkZXIsIHJldHJ5aW5nIHdpdGggbmV3IGF1dGggcmVnaXN0cmF0aW9uLiBFcnJvciBkZXRhaWxzOiAke2Vycm9yVGV4dCB8fCAnbm8gYWRkaXRpb25hbCBkZXRhaWxzJ31gKTtcblx0XHRcdGF3YWl0IHRoaXMuX2FkZEF1dGhIZWFkZXIoaGVhZGVycywgeyBmb3JjZU5ld1JlZ2lzdHJhdGlvbjogdHJ1ZSB9KTtcblx0XHRcdHJlcyA9IGF3YWl0IGRvRmV0Y2goKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoKHVybDogc3RyaW5nLCBpbml0OiBNaW5pbWFsUmVxdWVzdEluaXQpOiBQcm9taXNlPENvbW1vblJlc3BvbnNlPiB7XG5cdFx0c2V0SG9zdEhlYWRlcihpbml0LmhlYWRlcnMsICd1c2VyLWFnZW50JywgYCR7cHJvZHVjdC5uYW1lTG9uZ30vJHtwcm9kdWN0LnZlcnNpb259YCk7XG5cblx0XHRpZiAoY2FuTG9nKHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSwgTG9nTGV2ZWwuVHJhY2UpKSB7XG5cdFx0XHRjb25zdCB0cmFjZU9iajogYW55ID0geyAuLi5pbml0LCBoZWFkZXJzOiB7IC4uLmluaXQuaGVhZGVycyB9IH07XG5cdFx0XHRpZiAodHJhY2VPYmouYm9keSkge1xuXHRcdFx0XHR0cmFjZU9iai5ib2R5ID0gbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKHRyYWNlT2JqLmJvZHkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRyYWNlT2JqLmhlYWRlcnM/LkF1dGhvcml6YXRpb24pIHtcblx0XHRcdFx0dHJhY2VPYmouaGVhZGVycy5BdXRob3JpemF0aW9uID0gJyoqKic7IC8vIGRvbid0IGxvZyB0aGUgYXV0aCBoZWFkZXJcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5UcmFjZSwgYEZldGNoaW5nICR7dXJsfSB3aXRoIG9wdGlvbnM6ICR7SlNPTi5zdHJpbmdpZnkodHJhY2VPYmopfWApO1xuXHRcdH1cblxuXHRcdGxldCBjdXJyZW50VXJsID0gdXJsO1xuXHRcdGxldCByZXNwb25zZSE6IENvbW1vblJlc3BvbnNlO1xuXHRcdGZvciAobGV0IHJlZGlyZWN0Q291bnQgPSAwOyByZWRpcmVjdENvdW50IDwgTUFYX0ZPTExPV19SRURJUkVDVFM7IHJlZGlyZWN0Q291bnQrKykge1xuXHRcdFx0cmVzcG9uc2UgPSBhd2FpdCB0aGlzLl9mZXRjaEludGVybmFsKGN1cnJlbnRVcmwsIHtcblx0XHRcdFx0Li4uaW5pdCxcblx0XHRcdFx0c2lnbmFsOiB0aGlzLl9hYm9ydEN0cmwuc2lnbmFsLFxuXHRcdFx0XHRyZWRpcmVjdDogJ21hbnVhbCdcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBDaGVjayBmb3IgcmVkaXJlY3Qgc3RhdHVzIGNvZGVzICgzMDEsIDMwMiwgMzAzLCAzMDcsIDMwOClcblx0XHRcdGlmICghUkVESVJFQ1RfU1RBVFVTX0NPREVTLmluY2x1ZGVzKHJlc3BvbnNlLnN0YXR1cykpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxvY2F0aW9uID0gcmVzcG9uc2UuaGVhZGVycy5nZXQoJ2xvY2F0aW9uJyk7XG5cdFx0XHRpZiAoIWxvY2F0aW9uKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdXJyZW50VXJsUGFyc2VkID0gbmV3IFVSTChjdXJyZW50VXJsKTtcblx0XHRcdGNvbnN0IG5leHRVcmxQYXJzZWQgPSBuZXcgVVJMKGxvY2F0aW9uLCBjdXJyZW50VXJsKTtcblxuXHRcdFx0Ly8gT25seSBmb2xsb3cgcmVkaXJlY3RzIHRvIGh0dHAocykuIEJsb2NrcyBhIG1hbGljaW91cyBMb2NhdGlvbiBoZWFkZXIgZnJvbVxuXHRcdFx0Ly8gcmVhY2hpbmcgdGhlIHVuaXg6Ly8gLyBwaXBlOi8vIHNvY2tldCBkaXNwYXRjaGVyIG9yIG90aGVyIGxvY2FsIHNjaGVtZXMuXG5cdFx0XHQvLyBGYWlsIGNsb3NlZCBzbyB0aGUgY29ubmVjdGlvbiBlcnJvcnMgZGV0ZXJtaW5pc3RpY2FsbHkgcmF0aGVyIHRoYW4gdGhlXG5cdFx0XHQvLyBjYWxsZXIgdHJlYXRpbmcgdGhlIDN4eCByZXNwb25zZSBhcyBmaW5hbC5cblx0XHRcdGlmICghQUxMT1dFRF9SRURJUkVDVF9QUk9UT0NPTFMuaGFzKG5leHRVcmxQYXJzZWQucHJvdG9jb2wpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTUNQIHNlcnZlciByZWRpcmVjdGVkIHRvIGEgbm9uLWh0dHAocykgdGFyZ2V0ICgke25leHRVcmxQYXJzZWQucHJvdG9jb2x9KSwgd2hpY2ggaXMgbm90IGFsbG93ZWRgKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT24gYSBjcm9zcy1vcmlnaW4gcmVkaXJlY3QsIHN0cmlwIGNyZWRlbnRpYWwtYmVhcmluZyBoZWFkZXJzIHNvIHRva2VucyBhbmRcblx0XHRcdC8vIHNlc3Npb24gaWRzIGNvbmZpZ3VyZWQgZm9yIHRoZSBvcmlnaW5hbCBvcmlnaW4gYXJlIG5vdCByZXBsYXllZCB0byBhbm90aGVyIGhvc3QuXG5cdFx0XHRpZiAoY3VycmVudFVybFBhcnNlZC5vcmlnaW4gIT09IG5leHRVcmxQYXJzZWQub3JpZ2luKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgbmFtZSBvZiBPYmplY3Qua2V5cyhpbml0LmhlYWRlcnMpKSB7XG5cdFx0XHRcdFx0aWYgKENST1NTX09SSUdJTl9TVFJJUFBFRF9IRUFERVJTLmhhcyhuYW1lLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRcdFx0XHRkZWxldGUgaW5pdC5oZWFkZXJzW25hbWVdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBuZXh0VXJsID0gbmV4dFVybFBhcnNlZC50b1N0cmluZygpO1xuXHRcdFx0dGhpcy5fbG9nKExvZ0xldmVsLlRyYWNlLCBgUmVkaXJlY3QgKCR7cmVzcG9uc2Uuc3RhdHVzfSkgZnJvbSAke2N1cnJlbnRVcmx9IHRvICR7bmV4dFVybH1gKTtcblx0XHRcdGN1cnJlbnRVcmwgPSBuZXh0VXJsO1xuXHRcdFx0Ly8gUGVyIGZldGNoIHNwZWMsIGZvciAzMDMgYWx3YXlzIHVzZSBHRVQsIGtlZXAgbWV0aG9kIHVubGVzcyBvcmlnaW5hbCB3YXMgUE9TVCBhbmQgMzAxLzMwMiwgdGhlbiBHRVQuXG5cdFx0XHRpZiAocmVzcG9uc2Uuc3RhdHVzID09PSAzMDMgfHwgKChyZXNwb25zZS5zdGF0dXMgPT09IDMwMSB8fCByZXNwb25zZS5zdGF0dXMgPT09IDMwMikgJiYgaW5pdC5tZXRob2QgPT09ICdQT1NUJykpIHtcblx0XHRcdFx0aW5pdC5tZXRob2QgPSAnR0VUJztcblx0XHRcdFx0ZGVsZXRlIGluaXQuYm9keTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY2FuTG9nKHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSwgTG9nTGV2ZWwuVHJhY2UpKSB7XG5cdFx0XHRjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cdFx0XHRyZXNwb25zZS5oZWFkZXJzLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHsgaGVhZGVyc1trZXldID0gdmFsdWU7IH0pO1xuXHRcdFx0dGhpcy5fbG9nKExvZ0xldmVsLlRyYWNlLCBgRmV0Y2hlZCAke2N1cnJlbnRVcmx9OiAke0pTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0c3RhdHVzOiByZXNwb25zZS5zdGF0dXMsXG5cdFx0XHRcdGhlYWRlcnM6IGhlYWRlcnMsXG5cdFx0XHR9KX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzcG9uc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2ZldGNoSW50ZXJuYWwodXJsOiBzdHJpbmcsIGluaXQ/OiBDb21tb25SZXF1ZXN0SW5pdCk6IFByb21pc2U8Q29tbW9uUmVzcG9uc2U+IHtcblx0XHRyZXR1cm4gZmV0Y2godXJsLCBpbml0KTtcblx0fVxufVxuXG5pbnRlcmZhY2UgTWluaW1hbFJlcXVlc3RJbml0IHtcblx0bWV0aG9kOiBzdHJpbmc7XG5cdGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cdGJvZHk/OiBVaW50OEFycmF5PEFycmF5QnVmZmVyPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb21tb25SZXF1ZXN0SW5pdCBleHRlbmRzIE1pbmltYWxSZXF1ZXN0SW5pdCB7XG5cdHNpZ25hbD86IEFib3J0U2lnbmFsO1xuXHRyZWRpcmVjdD86IFJlcXVlc3RSZWRpcmVjdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb21tb25SZXNwb25zZSB7XG5cdHN0YXR1czogbnVtYmVyO1xuXHRzdGF0dXNUZXh0OiBzdHJpbmc7XG5cdGhlYWRlcnM6IEhlYWRlcnM7XG5cdGJvZHk/OiBSZWFkYWJsZVN0cmVhbSB8IG51bGw7XG5cdHVybDogc3RyaW5nO1xuXHRqc29uKCk6IFByb21pc2U8YW55Pjtcblx0dGV4dCgpOiBQcm9taXNlPHN0cmluZz47XG59XG5cbmZ1bmN0aW9uIGlzSlNPTihzdHI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHR0cnkge1xuXHRcdEpTT04ucGFyc2Uoc3RyKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc0F1dGhTdGF0dXNDb2RlKHN0YXR1czogbnVtYmVyKTogYm9vbGVhbiB7XG5cdHJldHVybiBzdGF0dXMgPT09IDQwMSB8fCBzdGF0dXMgPT09IDQwMztcbn1cblxuXG4vLyNyZWdpb24gQXV0aE1ldGFkYXRhXG5cbi8qKlxuICogTG9nZ2VyIGNhbGxiYWNrIHR5cGUgZm9yIEF1dGhNZXRhZGF0YSBvcGVyYXRpb25zLlxuICovXG5leHBvcnQgdHlwZSBBdXRoTWV0YWRhdGFMb2dnZXIgPSAobGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQ7XG5cbi8qKlxuICogSW50ZXJmYWNlIGZvciBhdXRoZW50aWNhdGlvbiBtZXRhZGF0YSB0aGF0IGNhbiBiZSB1cGRhdGVkIHdoZW4gc2NvcGVzIGNoYW5nZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQXV0aE1ldGFkYXRhIHtcblx0cmVhZG9ubHkgYXV0aG9yaXphdGlvblNlcnZlcjogVVJJO1xuXHRyZWFkb25seSBzZXJ2ZXJNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YTtcblx0cmVhZG9ubHkgcmVzb3VyY2VNZXRhZGF0YTogSUF1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzY29wZXM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHQvKiogVGVsZW1ldHJ5IGRhdGEgYWJvdXQgaG93IGF1dGggbWV0YWRhdGEgd2FzIGRpc2NvdmVyZWQgKi9cblx0cmVhZG9ubHkgdGVsZW1ldHJ5OiBJQXV0aE1ldGFkYXRhU291cmNlO1xuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBzY29wZXMgYmFzZWQgb24gdGhlIFdXVy1BdXRoZW50aWNhdGUgaGVhZGVyIGluIHRoZSByZXNwb25zZS5cblx0ICogQHBhcmFtIHJlc3BvbnNlIFRoZSBIVFRQIHJlc3BvbnNlIGNvbnRhaW5pbmcgcG90ZW50aWFsIHNjb3BlIGNoYWxsZW5nZXNcblx0ICogQHJldHVybnMgdHJ1ZSBpZiBzY29wZXMgd2VyZSB1cGRhdGVkLCBmYWxzZSBvdGhlcndpc2Vcblx0ICovXG5cdHVwZGF0ZShyZXNwb25zZUhlYWRlcnM6IEhlYWRlcnMpOiBib29sZWFuO1xufVxuXG4vKipcbiAqIENvbmNyZXRlIGltcGxlbWVudGF0aW9uIG9mIElBdXRoTWV0YWRhdGEgdGhhdCBtYW5hZ2VzIE9BdXRoIGF1dGhlbnRpY2F0aW9uIG1ldGFkYXRhLlxuICogQ29uc3VtZXJzIHNob3VsZCB1c2Uge0BsaW5rIGNyZWF0ZUF1dGhNZXRhZGF0YX0gdG8gY3JlYXRlIGluc3RhbmNlcy5cbiAqL1xuY2xhc3MgQXV0aE1ldGFkYXRhIGltcGxlbWVudHMgSUF1dGhNZXRhZGF0YSB7XG5cdHByaXZhdGUgX3Njb3Blczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGF1dGhvcml6YXRpb25TZXJ2ZXI6IFVSSSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlc291cmNlTWV0YWRhdGE6IElBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSB8IHVuZGVmaW5lZCxcblx0XHRzY29wZXM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSB0ZWxlbWV0cnk6IElBdXRoTWV0YWRhdGFTb3VyY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nOiBBdXRoTWV0YWRhdGFMb2dnZXIsXG5cdCkge1xuXHRcdHRoaXMuX3Njb3BlcyA9IHNjb3Blcztcblx0fVxuXG5cdGdldCBzY29wZXMoKTogc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zY29wZXM7XG5cdH1cblxuXHR1cGRhdGUocmVzcG9uc2VIZWFkZXJzOiBIZWFkZXJzKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2NvcGVzQ2hhbGxlbmdlID0gdGhpcy5fcGFyc2VTY29wZXNGcm9tUmVzcG9uc2UocmVzcG9uc2VIZWFkZXJzKTtcblx0XHRpZiAoIXNjb3Blc01hdGNoKHNjb3Blc0NoYWxsZW5nZSwgdGhpcy5fc2NvcGVzKSkge1xuXHRcdFx0dGhpcy5fbG9nKExvZ0xldmVsLkluZm8sIGBTY29wZXMgY2hhbmdlZCBmcm9tICR7SlNPTi5zdHJpbmdpZnkodGhpcy5fc2NvcGVzKX0gdG8gJHtKU09OLnN0cmluZ2lmeShzY29wZXNDaGFsbGVuZ2UpfSwgdXBkYXRpbmdgKTtcblx0XHRcdHRoaXMuX3Njb3BlcyA9IHNjb3Blc0NoYWxsZW5nZTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9wYXJzZVNjb3Blc0Zyb21SZXNwb25zZShyZXNwb25zZUhlYWRlcnM6IEhlYWRlcnMpOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXV0aEhlYWRlciA9IHJlc3BvbnNlSGVhZGVycy5nZXQoJ1dXVy1BdXRoZW50aWNhdGUnKTtcblx0XHRpZiAoIWF1dGhIZWFkZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNoYWxsZW5nZXMgPSBwYXJzZVdXV0F1dGhlbnRpY2F0ZUhlYWRlcihhdXRoSGVhZGVyKTtcblx0XHRmb3IgKGNvbnN0IGNoYWxsZW5nZSBvZiBjaGFsbGVuZ2VzKSB7XG5cdFx0XHRpZiAoY2hhbGxlbmdlLnNjaGVtZSA9PT0gJ0JlYXJlcicgJiYgY2hhbGxlbmdlLnBhcmFtc1snc2NvcGUnXSkge1xuXHRcdFx0XHRjb25zdCBzY29wZXMgPSBjaGFsbGVuZ2UucGFyYW1zWydzY29wZSddLnNwbGl0KEFVVEhfU0NPUEVfU0VQQVJBVE9SKS5maWx0ZXIocyA9PiBzLnRyaW0oKS5sZW5ndGgpO1xuXHRcdFx0XHRpZiAoc2NvcGVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5JbmZvLCBgRm91bmQgc2NvcGUgY2hhbGxlbmdlIGluIFdXVy1BdXRoZW50aWNhdGUgaGVhZGVyOiAke2NoYWxsZW5nZS5wYXJhbXNbJ3Njb3BlJ119YCk7XG5cdFx0XHRcdFx0cmV0dXJuIHNjb3Blcztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogT3B0aW9ucyBmb3IgY3JlYXRpbmcgQXV0aE1ldGFkYXRhLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDcmVhdGVBdXRoTWV0YWRhdGFPcHRpb25zIHtcblx0LyoqIEhlYWRlcnMgdG8gaW5jbHVkZSB3aGVuIGZldGNoaW5nIG1ldGFkYXRhIGZyb20gdGhlIHNhbWUgb3JpZ2luIGFzIHRoZSByZXNvdXJjZSBzZXJ2ZXIgKi9cblx0c2FtZU9yaWdpbkhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHQvKiogRmV0Y2ggZnVuY3Rpb24gdG8gdXNlIGZvciBIVFRQIHJlcXVlc3RzICovXG5cdGZldGNoOiAodXJsOiBzdHJpbmcsIGluaXQ6IE1pbmltYWxSZXF1ZXN0SW5pdCkgPT4gUHJvbWlzZTxDb21tb25SZXNwb25zZT47XG5cdC8qKiBMb2dnZXIgZnVuY3Rpb24gZm9yIGRpYWdub3N0aWMgb3V0cHV0ICovXG5cdGxvZzogQXV0aE1ldGFkYXRhTG9nZ2VyO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYW4gQXV0aE1ldGFkYXRhIGluc3RhbmNlIGJ5IGRpc2NvdmVyaW5nIE9BdXRoIG1ldGFkYXRhIGZyb20gdGhlIHNlcnZlci5cbiAqXG4gKiBUaGlzIGZ1bmN0aW9uOlxuICogMS4gUGFyc2VzIHRoZSBXV1ctQXV0aGVudGljYXRlIGhlYWRlciBmb3IgcmVzb3VyY2VfbWV0YWRhdGEgYW5kIHNjb3BlIGNoYWxsZW5nZXNcbiAqIDIuIEZldGNoZXMgT0F1dGggcHJvdGVjdGVkIHJlc291cmNlIG1ldGFkYXRhIGZyb20gd2VsbC1rbm93biBVUklzIG9yIHRoZSBjaGFsbGVuZ2UgVVJMXG4gKiAzLiBGZXRjaGVzIGF1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhXG4gKiA0LiBGYWxscyBiYWNrIHRvIGRlZmF1bHQgbWV0YWRhdGEgaWYgZGlzY292ZXJ5IGZhaWxzXG4gKlxuICogQHBhcmFtIHJlc291cmNlVXJsIFRoZSByZXNvdXJjZSBzZXJ2ZXIgVVJMXG4gKiBAcGFyYW0gd3d3QXV0aGVudGljYXRlVmFsdWUgVGhlIHZhbHVlIG9mIHRoZSBXV1ctQXV0aGVudGljYXRlIGhlYWRlciBmcm9tIHRoZSBvcmlnaW5hbCBIVFRQIHJlc3BvbnNlXG4gKiBAcGFyYW0gb3B0aW9ucyBDb25maWd1cmF0aW9uIG9wdGlvbnMgaW5jbHVkaW5nIGhlYWRlcnMsIGZldGNoIGZ1bmN0aW9uLCBhbmQgbG9nZ2VyXG4gKiBAcmV0dXJucyBBIG5ldyBBdXRoTWV0YWRhdGEgaW5zdGFuY2VcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUF1dGhNZXRhZGF0YShcblx0cmVzb3VyY2VVcmw6IHN0cmluZyxcblx0aW5pdGlhbFJlc3BvbnNlSGVhZGVyczogSGVhZGVycyxcblx0b3B0aW9uczogSUNyZWF0ZUF1dGhNZXRhZGF0YU9wdGlvbnNcbik6IFByb21pc2U8QXV0aE1ldGFkYXRhPiB7XG5cdGNvbnN0IHsgc2FtZU9yaWdpbkhlYWRlcnMsIGZldGNoLCBsb2cgfSA9IG9wdGlvbnM7XG5cblx0Ly8gVHJhY2sgZGlzY292ZXJ5IHNvdXJjZXMgZm9yIHRlbGVtZXRyeVxuXHRsZXQgcmVzb3VyY2VNZXRhZGF0YVNvdXJjZSA9IElBdXRoUmVzb3VyY2VNZXRhZGF0YVNvdXJjZS5Ob25lO1xuXHRsZXQgc2VydmVyTWV0YWRhdGFTb3VyY2U6IElBdXRoU2VydmVyTWV0YWRhdGFTb3VyY2UgfCB1bmRlZmluZWQ7XG5cblx0Ly8gUGFyc2UgdGhlIFdXVy1BdXRoZW50aWNhdGUgaGVhZGVyIGZvciByZXNvdXJjZV9tZXRhZGF0YSBhbmQgc2NvcGUgY2hhbGxlbmdlc1xuXHRjb25zdCB7IHJlc291cmNlTWV0YWRhdGFDaGFsbGVuZ2UsIHNjb3Blc0NoYWxsZW5nZTogc2NvcGVzQ2hhbGxlbmdlRnJvbUhlYWRlciB9ID0gcGFyc2VXV1dBdXRoZW50aWNhdGVIZWFkZXJGb3JDaGFsbGVuZ2VzKGluaXRpYWxSZXNwb25zZUhlYWRlcnMuZ2V0KCdXV1ctQXV0aGVudGljYXRlJykgPz8gdW5kZWZpbmVkLCBsb2cpO1xuXG5cdC8vIEZldGNoIHRoZSByZXNvdXJjZSBtZXRhZGF0YSBlaXRoZXIgZnJvbSB0aGUgY2hhbGxlbmdlIFVSTCBvciBmcm9tIHdlbGwta25vd24gVVJJc1xuXHRsZXQgc2VydmVyTWV0YWRhdGFVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IHJlc291cmNlOiBJQXV0aG9yaXphdGlvblByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgfCB1bmRlZmluZWQ7XG5cdGxldCBzY29wZXNDaGFsbGVuZ2UgPSBzY29wZXNDaGFsbGVuZ2VGcm9tSGVhZGVyO1xuXG5cdHRyeSB7XG5cdFx0Y29uc3QgeyBtZXRhZGF0YSwgZGlzY292ZXJ5VXJsLCBlcnJvcnMgfSA9IGF3YWl0IGZldGNoUmVzb3VyY2VNZXRhZGF0YShyZXNvdXJjZVVybCwgcmVzb3VyY2VNZXRhZGF0YUNoYWxsZW5nZSwge1xuXHRcdFx0c2FtZU9yaWdpbkhlYWRlcnMsXG5cdFx0XHRmZXRjaDogKHVybCwgaW5pdCkgPT4gZmV0Y2godXJsLCBpbml0IGFzIE1pbmltYWxSZXF1ZXN0SW5pdClcblx0XHR9KTtcblx0XHRmb3IgKGNvbnN0IGVyciBvZiBlcnJvcnMpIHtcblx0XHRcdGxvZyhMb2dMZXZlbC5XYXJuaW5nLCBgRXJyb3IgZmV0Y2hpbmcgcmVzb3VyY2UgbWV0YWRhdGE6ICR7ZXJyfWApO1xuXHRcdH1cblx0XHRsb2coTG9nTGV2ZWwuSW5mbywgYERpc2NvdmVyZWQgcmVzb3VyY2UgbWV0YWRhdGEgYXQgJHtkaXNjb3ZlcnlVcmx9YCk7XG5cblx0XHQvLyBEZXRlcm1pbmUgaWYgcmVzb3VyY2UgbWV0YWRhdGEgY2FtZSBmcm9tIGhlYWRlciBvciB3ZWxsLWtub3duXG5cdFx0cmVzb3VyY2VNZXRhZGF0YVNvdXJjZSA9IHJlc291cmNlTWV0YWRhdGFDaGFsbGVuZ2UgPyBJQXV0aFJlc291cmNlTWV0YWRhdGFTb3VyY2UuSGVhZGVyIDogSUF1dGhSZXNvdXJjZU1ldGFkYXRhU291cmNlLldlbGxLbm93bjtcblxuXHRcdC8vIFRPRE86QFR5bGVyTGVvbmhhcmR0IHN1cHBvcnQgbXVsdGlwbGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXJzXG5cdFx0Ly8gQ29uc2lkZXIgdXNpbmcgb25lIHRoYXQgaGFzIGFuIGF1dGggcHJvdmlkZXIgZmlyc3QsIG92ZXIgdGhlIGR5bmFtaWMgZmxvd1xuXHRcdHNlcnZlck1ldGFkYXRhVXJsID0gbWV0YWRhdGEuYXV0aG9yaXphdGlvbl9zZXJ2ZXJzPy5bMF07XG5cdFx0aWYgKCFzZXJ2ZXJNZXRhZGF0YVVybCkge1xuXHRcdFx0bG9nKExvZ0xldmVsLldhcm5pbmcsIGBObyBhdXRob3JpemF0aW9uX3NlcnZlcnMgZm91bmQgaW4gcmVzb3VyY2UgbWV0YWRhdGEgJHtkaXNjb3ZlcnlVcmx9IC0gSXMgdGhpcyByZXNvdXJjZSBtZXRhZGF0YSBjb25maWd1cmVkIGNvcnJlY3RseT9gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9nKExvZ0xldmVsLkluZm8sIGBVc2luZyBhdXRoIHNlcnZlciBtZXRhZGF0YSB1cmw6ICR7c2VydmVyTWV0YWRhdGFVcmx9YCk7XG5cdFx0XHRzZXJ2ZXJNZXRhZGF0YVNvdXJjZSA9IElBdXRoU2VydmVyTWV0YWRhdGFTb3VyY2UuUmVzb3VyY2VNZXRhZGF0YTtcblx0XHR9XG5cdFx0c2NvcGVzQ2hhbGxlbmdlID8/PSBtZXRhZGF0YS5zY29wZXNfc3VwcG9ydGVkO1xuXHRcdHJlc291cmNlID0gbWV0YWRhdGE7XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHRsb2coTG9nTGV2ZWwuV2FybmluZywgYENvdWxkIG5vdCBmZXRjaCByZXNvdXJjZSBtZXRhZGF0YTogJHtTdHJpbmcoZSl9YCk7XG5cdH1cblxuXHRjb25zdCBiYXNlVXJsID0gbmV3IFVSTChyZXNvdXJjZVVybCkub3JpZ2luO1xuXG5cdC8vIElmIHdlIGFyZSBub3QgZ2l2ZW4gYSByZXNvdXJjZV9tZXRhZGF0YSwgc2VlIGlmIHRoZSB3ZWxsLWtub3duIHNlcnZlciBtZXRhZGF0YSBpcyBhdmFpbGFibGVcblx0Ly8gb24gdGhlIGJhc2UgdXJsLlxuXHRsZXQgYWRkaXRpb25hbEhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblx0aWYgKCFzZXJ2ZXJNZXRhZGF0YVVybCkge1xuXHRcdHNlcnZlck1ldGFkYXRhVXJsID0gYmFzZVVybDtcblx0XHQvLyBNYWludGFpbiB0aGUgc2FtZSBvcmlnaW4gaGVhZGVycyB3aGVuIHRhbGtpbmcgdG8gdGhlIHJlc291cmNlIG9yaWdpbi5cblx0XHRpZiAoc2FtZU9yaWdpbkhlYWRlcnMpIHtcblx0XHRcdGFkZGl0aW9uYWxIZWFkZXJzID0gc2FtZU9yaWdpbkhlYWRlcnM7XG5cdFx0fVxuXHR9XG5cblx0dHJ5IHtcblx0XHRsb2coTG9nTGV2ZWwuRGVidWcsIGBGZXRjaGluZyBhdXRoIHNlcnZlciBtZXRhZGF0YSBmb3I6ICR7c2VydmVyTWV0YWRhdGFVcmx9IC4uLmApO1xuXHRcdGNvbnN0IHsgbWV0YWRhdGEsIGRpc2NvdmVyeVVybCwgZXJyb3JzIH0gPSBhd2FpdCBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShzZXJ2ZXJNZXRhZGF0YVVybCwge1xuXHRcdFx0YWRkaXRpb25hbEhlYWRlcnMsXG5cdFx0XHRmZXRjaDogKHVybCwgaW5pdCkgPT4gZmV0Y2godXJsLCBpbml0IGFzIE1pbmltYWxSZXF1ZXN0SW5pdClcblx0XHR9KTtcblx0XHRmb3IgKGNvbnN0IGVyciBvZiBlcnJvcnMpIHtcblx0XHRcdGxvZyhMb2dMZXZlbC5XYXJuaW5nLCBgRXJyb3IgZmV0Y2hpbmcgYXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGE6ICR7ZXJyfWApO1xuXHRcdH1cblx0XHRsb2coTG9nTGV2ZWwuSW5mbywgYERpc2NvdmVyZWQgYXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgYXQgJHtkaXNjb3ZlcnlVcmx9YCk7XG5cblx0XHQvLyBJZiBzZXJ2ZXJNZXRhZGF0YVNvdXJjZSBpcyBub3QgeWV0IGRlZmluZWQsIGl0IG1lYW5zIHdlIGZlbGwgYmFjayB0byBiYXNlVXJsXG5cdFx0Ly8gYW5kIHN1Y2Nlc3NmdWxseSBmZXRjaGVkIGZyb20gd2VsbC1rbm93blxuXHRcdHNlcnZlck1ldGFkYXRhU291cmNlID8/PSBJQXV0aFNlcnZlck1ldGFkYXRhU291cmNlLldlbGxLbm93bjtcblxuXHRcdHJldHVybiBuZXcgQXV0aE1ldGFkYXRhKFxuXHRcdFx0VVJJLnBhcnNlKHNlcnZlck1ldGFkYXRhVXJsKSxcblx0XHRcdG1ldGFkYXRhLFxuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRzY29wZXNDaGFsbGVuZ2UsXG5cdFx0XHR7IHJlc291cmNlTWV0YWRhdGFTb3VyY2UsIHNlcnZlck1ldGFkYXRhU291cmNlIH0sXG5cdFx0XHRsb2dcblx0XHQpO1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0bG9nKExvZ0xldmVsLldhcm5pbmcsIGBFcnJvciBwb3B1bGF0aW5nIGF1dGggc2VydmVyIG1ldGFkYXRhIGZvciAke3NlcnZlck1ldGFkYXRhVXJsfTogJHtTdHJpbmcoZSl9YCk7XG5cdH1cblxuXHQvLyBJZiB0aGVyZSdzIG5vIHdlbGwta25vd24gc2VydmVyIG1ldGFkYXRhLCB0aGVuIHVzZSB0aGUgZGVmYXVsdCB2YWx1ZXMgYmFzZWQgb2ZmIG9mIHRoZSB1cmwuXG5cdGNvbnN0IGRlZmF1bHRNZXRhZGF0YSA9IGdldERlZmF1bHRNZXRhZGF0YUZvclVybChuZXcgVVJMKGJhc2VVcmwpKTtcblx0bG9nKExvZ0xldmVsLkluZm8sICdVc2luZyBkZWZhdWx0IGF1dGggbWV0YWRhdGEnKTtcblx0cmV0dXJuIG5ldyBBdXRoTWV0YWRhdGEoXG5cdFx0VVJJLnBhcnNlKGJhc2VVcmwpLFxuXHRcdGRlZmF1bHRNZXRhZGF0YSxcblx0XHRyZXNvdXJjZSxcblx0XHRzY29wZXNDaGFsbGVuZ2UsXG5cdFx0eyByZXNvdXJjZU1ldGFkYXRhU291cmNlLCBzZXJ2ZXJNZXRhZGF0YVNvdXJjZTogSUF1dGhTZXJ2ZXJNZXRhZGF0YVNvdXJjZS5EZWZhdWx0IH0sXG5cdFx0bG9nXG5cdCk7XG59XG5cbi8qKlxuICogUGFyc2VzIHRoZSBXV1ctQXV0aGVudGljYXRlIGhlYWRlciBmb3IgcmVzb3VyY2VfbWV0YWRhdGEgYW5kIHNjb3BlIGNoYWxsZW5nZXMuXG4gKi9cbmZ1bmN0aW9uIHBhcnNlV1dXQXV0aGVudGljYXRlSGVhZGVyRm9yQ2hhbGxlbmdlcyhcblx0d3d3QXV0aGVudGljYXRlVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0bG9nOiBBdXRoTWV0YWRhdGFMb2dnZXJcbik6IHsgcmVzb3VyY2VNZXRhZGF0YUNoYWxsZW5nZT86IHN0cmluZzsgc2NvcGVzQ2hhbGxlbmdlPzogc3RyaW5nW10gfSB7XG5cdGlmICghd3d3QXV0aGVudGljYXRlVmFsdWUpIHtcblx0XHRyZXR1cm4ge307XG5cdH1cblx0bGV0IHJlc291cmNlTWV0YWRhdGFDaGFsbGVuZ2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IHNjb3Blc0NoYWxsZW5nZTogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3QgY2hhbGxlbmdlcyA9IHBhcnNlV1dXQXV0aGVudGljYXRlSGVhZGVyKHd3d0F1dGhlbnRpY2F0ZVZhbHVlKTtcblx0Zm9yIChjb25zdCBjaGFsbGVuZ2Ugb2YgY2hhbGxlbmdlcykge1xuXHRcdGlmIChjaGFsbGVuZ2Uuc2NoZW1lID09PSAnQmVhcmVyJykge1xuXHRcdFx0aWYgKCFyZXNvdXJjZU1ldGFkYXRhQ2hhbGxlbmdlICYmIGNoYWxsZW5nZS5wYXJhbXNbJ3Jlc291cmNlX21ldGFkYXRhJ10pIHtcblx0XHRcdFx0cmVzb3VyY2VNZXRhZGF0YUNoYWxsZW5nZSA9IGNoYWxsZW5nZS5wYXJhbXNbJ3Jlc291cmNlX21ldGFkYXRhJ107XG5cdFx0XHRcdGxvZyhMb2dMZXZlbC5EZWJ1ZywgYEZvdW5kIHJlc291cmNlX21ldGFkYXRhIGNoYWxsZW5nZSBpbiBXV1ctQXV0aGVudGljYXRlIGhlYWRlcjogJHtyZXNvdXJjZU1ldGFkYXRhQ2hhbGxlbmdlfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzY29wZXNDaGFsbGVuZ2UgJiYgY2hhbGxlbmdlLnBhcmFtc1snc2NvcGUnXSkge1xuXHRcdFx0XHRjb25zdCBzY29wZXMgPSBjaGFsbGVuZ2UucGFyYW1zWydzY29wZSddLnNwbGl0KEFVVEhfU0NPUEVfU0VQQVJBVE9SKS5maWx0ZXIocyA9PiBzLnRyaW0oKS5sZW5ndGgpO1xuXHRcdFx0XHRpZiAoc2NvcGVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGxvZyhMb2dMZXZlbC5EZWJ1ZywgYEZvdW5kIHNjb3BlIGNoYWxsZW5nZSBpbiBXV1ctQXV0aGVudGljYXRlIGhlYWRlcjogJHtjaGFsbGVuZ2UucGFyYW1zWydzY29wZSddfWApO1xuXHRcdFx0XHRcdHNjb3Blc0NoYWxsZW5nZSA9IHNjb3Blcztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc291cmNlTWV0YWRhdGFDaGFsbGVuZ2UgJiYgc2NvcGVzQ2hhbGxlbmdlKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4geyByZXNvdXJjZU1ldGFkYXRhQ2hhbGxlbmdlLCBzY29wZXNDaGFsbGVuZ2UgfTtcbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMs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
