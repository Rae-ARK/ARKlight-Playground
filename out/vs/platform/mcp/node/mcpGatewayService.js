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
import { DeferredPromise } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { JsonRpcProtocol } from "../../../base/common/jsonRpcProtocol.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { ILoggerService } from "../../log/common/log.js";
import { isInitializeMessage, McpGatewaySession } from "./mcpGatewaySession.js";
let McpGatewayService = class extends Disposable {
  constructor(loggerService) {
    super();
    /** All active routes keyed by their route UUID */
    this._routes = /* @__PURE__ */ new Map();
    /** Maps gatewayId → set of route UUIDs belonging to that gateway */
    this._gatewayRoutes = /* @__PURE__ */ new Map();
    /** Maps gatewayId → serverId → routeId for reverse lookup */
    this._gatewayServerRoutes = /* @__PURE__ */ new Map();
    /** Maps gatewayId to clientId for tracking ownership */
    this._gatewayToClient = /* @__PURE__ */ new Map();
    /** Per-gateway disposables (e.g. event listeners) */
    this._gatewayDisposables = /* @__PURE__ */ new Map();
    this._logger = this._register(loggerService.createLogger("mcpGateway", { name: "MCP Gateway", logLevel: "always" }));
    this._logger.info("[McpGatewayService] Initialized");
  }
  async createGateway(clientId, toolInvoker) {
    await this._ensureServer();
    if (this._port === void 0) {
      throw new Error("[McpGatewayService] Server failed to start, port is undefined");
    }
    if (!toolInvoker) {
      throw new Error("[McpGatewayService] Tool invoker is required to create gateway");
    }
    const gatewayId = generateUuid();
    const routeIds = /* @__PURE__ */ new Set();
    const serverRouteMap = /* @__PURE__ */ new Map();
    this._gatewayRoutes.set(gatewayId, routeIds);
    this._gatewayServerRoutes.set(gatewayId, serverRouteMap);
    const disposables = new DisposableStore();
    this._gatewayDisposables.set(gatewayId, disposables);
    try {
      const serverDescriptors = toolInvoker.listServers();
      const servers = [];
      for (const descriptor of serverDescriptors) {
        const serverInfo = this._createRouteForServer(gatewayId, descriptor.id, descriptor.label, toolInvoker, routeIds, serverRouteMap);
        servers.push(serverInfo);
      }
      if (clientId) {
        this._gatewayToClient.set(gatewayId, clientId);
        this._logger.info(`[McpGatewayService] Created gateway ${gatewayId} with ${servers.length} server(s) for client ${clientId}`);
      } else {
        this._logger.warn(`[McpGatewayService] Created gateway ${gatewayId} with ${servers.length} server(s) without client tracking`);
      }
      const onDidChangeServers = disposables.add(new Emitter());
      disposables.add(toolInvoker.onDidChangeServers((newDescriptors) => {
        this._refreshGatewayServers(gatewayId, newDescriptors, toolInvoker, routeIds, serverRouteMap, onDidChangeServers);
      }));
      return {
        servers,
        onDidChangeServers: onDidChangeServers.event,
        gatewayId
      };
    } catch (error) {
      this._cleanupGateway(gatewayId);
      throw error;
    }
  }
  _refreshGatewayServers(gatewayId, newDescriptors, toolInvoker, routeIds, serverRouteMap, onDidChangeServers) {
    if (!this._gatewayRoutes.has(gatewayId)) {
      return;
    }
    const newServerIds = new Set(newDescriptors.map((d) => d.id));
    const existingServerIds = new Set(serverRouteMap.keys());
    for (const serverId of existingServerIds) {
      if (!newServerIds.has(serverId)) {
        const routeId = serverRouteMap.get(serverId);
        if (routeId) {
          this._disposeRoute(routeId);
          routeIds.delete(routeId);
          serverRouteMap.delete(serverId);
        }
      }
    }
    for (const descriptor of newDescriptors) {
      if (!existingServerIds.has(descriptor.id)) {
        this._createRouteForServer(gatewayId, descriptor.id, descriptor.label, toolInvoker, routeIds, serverRouteMap);
        continue;
      }
      const routeId = serverRouteMap.get(descriptor.id);
      const route = routeId ? this._routes.get(routeId) : void 0;
      if (route && route.label !== descriptor.label) {
        route.label = descriptor.label;
      }
    }
    const updatedServers = this._getGatewayServers(gatewayId);
    this._logger.info(`[McpGatewayService] Gateway ${gatewayId} servers changed: ${updatedServers.length} server(s)`);
    onDidChangeServers.fire(updatedServers);
  }
  _cleanupGateway(gatewayId) {
    const routeIds = this._gatewayRoutes.get(gatewayId);
    if (routeIds) {
      for (const routeId of routeIds) {
        this._disposeRoute(routeId);
      }
    }
    this._gatewayRoutes.delete(gatewayId);
    this._gatewayServerRoutes.delete(gatewayId);
    this._gatewayToClient.delete(gatewayId);
    this._gatewayDisposables.get(gatewayId)?.dispose();
    this._gatewayDisposables.delete(gatewayId);
  }
  _createRouteForServer(gatewayId, serverId, label, toolInvoker, routeIds, serverRouteMap) {
    const routeId = generateUuid();
    const singleServerInvoker = {
      onDidChangeTools: toolInvoker.onDidChangeTools,
      onDidChangeResources: toolInvoker.onDidChangeResources,
      listTools: () => toolInvoker.listToolsForServer(serverId),
      callTool: (name, args) => toolInvoker.callToolForServer(serverId, name, args),
      listResources: () => toolInvoker.listResourcesForServer(serverId),
      readResource: (uri) => toolInvoker.readResourceForServer(serverId, uri),
      listResourceTemplates: () => toolInvoker.listResourceTemplatesForServer(serverId)
    };
    const route = new McpGatewayRoute(routeId, this._logger, singleServerInvoker, label);
    this._routes.set(routeId, route);
    routeIds.add(routeId);
    serverRouteMap.set(serverId, routeId);
    const address = URI.parse(`http://127.0.0.1:${this._port}/gateway/${routeId}`);
    this._logger.info(`[McpGatewayService] Created route ${routeId} for server '${label}' (${serverId}) at ${address}`);
    return { label, address };
  }
  _getGatewayServers(gatewayId) {
    const serverRouteMap = this._gatewayServerRoutes.get(gatewayId);
    if (!serverRouteMap) {
      return [];
    }
    const servers = [];
    for (const [_serverId, routeId] of serverRouteMap) {
      const route = this._routes.get(routeId);
      if (route) {
        servers.push({
          label: route.label,
          address: URI.parse(`http://127.0.0.1:${this._port}/gateway/${routeId}`)
        });
      }
    }
    return servers;
  }
  _disposeRoute(routeId) {
    const route = this._routes.get(routeId);
    if (route) {
      route.dispose();
      this._routes.delete(routeId);
      this._logger.info(`[McpGatewayService] Disposed route: ${routeId}`);
    }
  }
  async disposeGateway(gatewayId) {
    if (!this._gatewayRoutes.has(gatewayId)) {
      this._logger.warn(`[McpGatewayService] Attempted to dispose unknown gateway: ${gatewayId}`);
      return;
    }
    this._cleanupGateway(gatewayId);
    this._logger.info(`[McpGatewayService] Disposed gateway: ${gatewayId} (remaining routes: ${this._routes.size})`);
    if (this._routes.size === 0) {
      this._stopServer();
    }
  }
  disposeGatewaysForClient(clientId) {
    const gatewaysToDispose = [];
    for (const [gatewayId, ownerClientId] of this._gatewayToClient) {
      if (ownerClientId === clientId) {
        gatewaysToDispose.push(gatewayId);
      }
    }
    if (gatewaysToDispose.length > 0) {
      this._logger.info(`[McpGatewayService] Disposing ${gatewaysToDispose.length} gateway(s) for disconnected client ${clientId}`);
      for (const gatewayId of gatewaysToDispose) {
        this._cleanupGateway(gatewayId);
      }
      if (this._routes.size === 0) {
        this._stopServer();
      }
    }
  }
  async _ensureServer() {
    if (this._server?.listening) {
      return;
    }
    if (this._serverStartPromise) {
      return this._serverStartPromise;
    }
    this._serverStartPromise = this._startServer();
    try {
      await this._serverStartPromise;
    } finally {
      this._serverStartPromise = void 0;
    }
  }
  async _startServer() {
    const { createServer } = await import("http");
    const deferredPromise = new DeferredPromise();
    this._server = createServer((req, res) => {
      this._handleRequest(req, res);
    });
    const portTimeout = setTimeout(() => {
      deferredPromise.error(new Error("[McpGatewayService] Timeout waiting for server to start"));
    }, 5e3);
    this._server.on("listening", () => {
      const address = this._server.address();
      if (typeof address === "string") {
        this._port = parseInt(address);
      } else if (address instanceof Object) {
        this._port = address.port;
      } else {
        clearTimeout(portTimeout);
        deferredPromise.error(new Error("[McpGatewayService] Unable to determine port"));
        return;
      }
      clearTimeout(portTimeout);
      this._logger.info(`[McpGatewayService] Server started on port ${this._port}`);
      deferredPromise.complete();
    });
    this._server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        this._logger.warn("[McpGatewayService] Port in use, retrying with random port...");
        this._server.listen(0, "127.0.0.1");
        return;
      }
      clearTimeout(portTimeout);
      this._logger.error(`[McpGatewayService] Server error: ${err}`);
      deferredPromise.error(err);
    });
    this._server.listen(0, "127.0.0.1");
    return deferredPromise.p;
  }
  _stopServer() {
    if (!this._server) {
      return;
    }
    this._logger.info("[McpGatewayService] Stopping server (no more routes)");
    this._server.close((err) => {
      if (err) {
        this._logger.error(`[McpGatewayService] Error closing server: ${err}`);
      } else {
        this._logger.info("[McpGatewayService] Server stopped");
      }
    });
    this._server = void 0;
    this._port = void 0;
  }
  _handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathParts = url.pathname.split("/").filter(Boolean);
    this._logger.debug(`[McpGatewayService] ${req.method} ${url.pathname} (active routes: ${this._routes.size})`);
    if (pathParts.length >= 2 && pathParts[0] === "gateway") {
      const routeId = pathParts[1];
      const route = this._routes.get(routeId);
      if (route) {
        route.handleRequest(req, res);
        return;
      }
    }
    this._logger.warn(`[McpGatewayService] ${req.method} ${url.pathname}: route not found`);
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Gateway not found" }));
  }
  dispose() {
    this._logger.info(`[McpGatewayService] Disposing service (routes: ${this._routes.size})`);
    this._stopServer();
    for (const route of this._routes.values()) {
      route.dispose();
    }
    this._routes.clear();
    this._gatewayRoutes.clear();
    this._gatewayServerRoutes.clear();
    this._gatewayToClient.clear();
    for (const disposables of this._gatewayDisposables.values()) {
      disposables.dispose();
    }
    this._gatewayDisposables.clear();
    super.dispose();
  }
};
McpGatewayService = __decorateClass([
  __decorateParam(0, ILoggerService)
], McpGatewayService);
const _McpGatewayRoute = class _McpGatewayRoute extends Disposable {
  constructor(routeId, _logger, _serverInvoker, label = "") {
    super();
    this.routeId = routeId;
    this._logger = _logger;
    this._serverInvoker = _serverInvoker;
    this.label = label;
    this._sessions = /* @__PURE__ */ new Map();
  }
  handleRequest(req, res) {
    this._logger.debug(`[McpGateway][route ${this.routeId}] ${req.method} request (sessions: ${this._sessions.size})`);
    if (req.method === "POST") {
      void this._handlePost(req, res);
      return;
    }
    if (req.method === "GET") {
      this._handleGet(req, res);
      return;
    }
    if (req.method === "DELETE") {
      this._handleDelete(req, res);
      return;
    }
    this._respondHttpError(res, 405, "Method not allowed");
  }
  dispose() {
    this._logger.info(`[McpGateway][route ${this.routeId}] Disposing route (sessions: ${this._sessions.size})`);
    for (const session of this._sessions.values()) {
      session.dispose();
    }
    this._sessions.clear();
    super.dispose();
  }
  _handleDelete(req, res) {
    const sessionId = this._getSessionId(req);
    if (!sessionId) {
      this._respondHttpError(res, 400, "Missing Mcp-Session-Id header");
      return;
    }
    const session = this._sessions.get(sessionId);
    if (!session) {
      this._respondHttpError(res, 404, "Session not found");
      return;
    }
    this._logger.info(`[McpGateway][route ${this.routeId}] Deleting session ${sessionId}`);
    session.dispose();
    this._sessions.delete(sessionId);
    res.writeHead(204);
    res.end();
  }
  _handleGet(req, res) {
    const sessionId = this._getSessionId(req);
    if (!sessionId) {
      this._respondHttpError(res, 400, "Missing Mcp-Session-Id header");
      return;
    }
    const session = this._sessions.get(sessionId);
    if (!session) {
      this._respondHttpError(res, 404, "Session not found");
      return;
    }
    this._logger.info(`[McpGateway][route ${this.routeId}] SSE connection requested for session ${sessionId}`);
    session.attachSseClient(req, res);
  }
  async _handlePost(req, res) {
    const body = await this._readRequestBody(req);
    if (body === void 0) {
      this._respondHttpError(res, 413, "Payload too large");
      return;
    }
    this._logger.debug(`[McpGateway][route ${this.routeId}] Handling POST`);
    let message;
    try {
      message = JSON.parse(body);
    } catch (error) {
      this._logger.warn(`[McpGateway][route ${this.routeId}] JSON parse error: ${error instanceof Error ? error.message : String(error)}`);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(JsonRpcProtocol.createParseError("Parse error", error instanceof Error ? error.message : String(error))));
      return;
    }
    const headerSessionId = this._getSessionId(req);
    const session = this._resolveSessionForPost(headerSessionId, message, res);
    if (!session) {
      return;
    }
    try {
      const responses = await session.handleIncoming(message);
      const headers = {
        "Content-Type": "application/json",
        "Mcp-Session-Id": session.id
      };
      if (responses.length === 0) {
        this._logger.debug(`[McpGateway][route ${this.routeId}] POST response: 202 (no content)`);
        res.writeHead(202, headers);
        res.end();
        return;
      }
      const responseBody = JSON.stringify(Array.isArray(message) ? responses : responses[0]);
      this._logger.debug(`[McpGateway][route ${this.routeId}] POST response: 200, body: ${responseBody}`);
      res.writeHead(200, headers);
      res.end(responseBody);
    } catch (error) {
      this._logger.error("[McpGatewayService] Failed handling gateway request", error);
      this._respondHttpError(res, 500, "Internal server error");
    }
  }
  _resolveSessionForPost(headerSessionId, message, res) {
    if (headerSessionId) {
      const existing = this._sessions.get(headerSessionId);
      if (!existing) {
        this._logger.warn(`[McpGateway][route ${this.routeId}] Session not found: ${headerSessionId}`);
        this._respondHttpError(res, 404, "Session not found");
        return void 0;
      }
      return existing;
    }
    if (!isInitializeMessage(message)) {
      this._respondHttpError(res, 400, "Missing Mcp-Session-Id header");
      return void 0;
    }
    const sessionId = generateUuid();
    this._logger.info(`[McpGateway][route ${this.routeId}] Creating new session ${sessionId}`);
    const session = new McpGatewaySession(sessionId, this._logger, () => {
      this._sessions.delete(sessionId);
    }, this._serverInvoker);
    this._sessions.set(sessionId, session);
    return session;
  }
  _respondHttpError(res, statusCode, error) {
    this._logger.debug(`[McpGateway][route ${this.routeId}] HTTP error response: ${statusCode} ${error}`);
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: statusCode, message: error } }));
  }
  _getSessionId(req) {
    const value = req.headers[_McpGatewayRoute.SessionHeaderName];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }
  async _readRequestBody(req) {
    const chunks = [];
    let size = 0;
    const maxBytes = 1024 * 1024;
    for await (const chunk of req) {
      const asBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += asBuffer.byteLength;
      if (size > maxBytes) {
        return void 0;
      }
      chunks.push(asBuffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
};
_McpGatewayRoute.SessionHeaderName = "mcp-session-id";
let McpGatewayRoute = _McpGatewayRoute;
export {
  McpGatewayService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL21jcC9ub2RlL21jcEdhdGV3YXlTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEpzb25ScGNNZXNzYWdlLCBKc29uUnBjUHJvdG9jb2wgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uUnBjUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElMb2dnZXIsIElMb2dnZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU1jcEdhdGV3YXlJbmZvLCBJTWNwR2F0ZXdheVNlcnZlckRlc2NyaXB0b3IsIElNY3BHYXRld2F5U2VydmVySW5mbywgSU1jcEdhdGV3YXlTZXJ2aWNlLCBJTWNwR2F0ZXdheVNpbmdsZVNlcnZlckludm9rZXIsIElNY3BHYXRld2F5VG9vbEludm9rZXIgfSBmcm9tICcuLi9jb21tb24vbWNwR2F0ZXdheS5qcyc7XG5pbXBvcnQgeyBpc0luaXRpYWxpemVNZXNzYWdlLCBNY3BHYXRld2F5U2Vzc2lvbiB9IGZyb20gJy4vbWNwR2F0ZXdheVNlc3Npb24uanMnO1xuXG4vKipcbiAqIE5vZGUuanMgaW1wbGVtZW50YXRpb24gb2YgdGhlIE1DUCBHYXRld2F5IFNlcnZpY2UuXG4gKlxuICogQ3JlYXRlcyBhbmQgbWFuYWdlcyBhbiBIVFRQIHNlcnZlciBvbiBsb2NhbGhvc3QgdGhhdCBwcm92aWRlcyBNQ1AgZ2F0ZXdheSBlbmRwb2ludHMuXG4gKiBUaGUgc2VydmVyIGlzIHNoYXJlZCBhbW9uZyBhbGwgZ2F0ZXdheXMgYW5kIHVzZXMgcmVmLWNvdW50aW5nIGZvciBsaWZlY3ljbGUgbWFuYWdlbWVudC5cbiAqL1xuZXhwb3J0IGNsYXNzIE1jcEdhdGV3YXlTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNY3BHYXRld2F5U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3NlcnZlcjogaHR0cC5TZXJ2ZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3BvcnQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0LyoqIEFsbCBhY3RpdmUgcm91dGVzIGtleWVkIGJ5IHRoZWlyIHJvdXRlIFVVSUQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcm91dGVzID0gbmV3IE1hcDxzdHJpbmcsIE1jcEdhdGV3YXlSb3V0ZT4oKTtcblx0LyoqIE1hcHMgZ2F0ZXdheUlkIFx1MjE5MiBzZXQgb2Ygcm91dGUgVVVJRHMgYmVsb25naW5nIHRvIHRoYXQgZ2F0ZXdheSAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9nYXRld2F5Um91dGVzID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuXHQvKiogTWFwcyBnYXRld2F5SWQgXHUyMTkyIHNlcnZlcklkIFx1MjE5MiByb3V0ZUlkIGZvciByZXZlcnNlIGxvb2t1cCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9nYXRld2F5U2VydmVyUm91dGVzID0gbmV3IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIHN0cmluZz4+KCk7XG5cdC8qKiBNYXBzIGdhdGV3YXlJZCB0byBjbGllbnRJZCBmb3IgdHJhY2tpbmcgb3duZXJzaGlwICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2dhdGV3YXlUb0NsaWVudCA9IG5ldyBNYXA8c3RyaW5nLCB1bmtub3duPigpO1xuXHQvKiogUGVyLWdhdGV3YXkgZGlzcG9zYWJsZXMgKGUuZy4gZXZlbnQgbGlzdGVuZXJzKSAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9nYXRld2F5RGlzcG9zYWJsZXMgPSBuZXcgTWFwPHN0cmluZywgRGlzcG9zYWJsZVN0b3JlPigpO1xuXHRwcml2YXRlIF9zZXJ2ZXJTdGFydFByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlcjogSUxvZ2dlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ2dlclNlcnZpY2UgbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbG9nZ2VyID0gdGhpcy5fcmVnaXN0ZXIobG9nZ2VyU2VydmljZS5jcmVhdGVMb2dnZXIoJ21jcEdhdGV3YXknLCB7IG5hbWU6ICdNQ1AgR2F0ZXdheScsIGxvZ0xldmVsOiAnYWx3YXlzJyB9KSk7XG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oJ1tNY3BHYXRld2F5U2VydmljZV0gSW5pdGlhbGl6ZWQnKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUdhdGV3YXkoY2xpZW50SWQ6IHVua25vd24sIHRvb2xJbnZva2VyPzogSU1jcEdhdGV3YXlUb29sSW52b2tlcik6IFByb21pc2U8SU1jcEdhdGV3YXlJbmZvPiB7XG5cdFx0Ly8gRW5zdXJlIHNlcnZlciBpcyBydW5uaW5nXG5cdFx0YXdhaXQgdGhpcy5fZW5zdXJlU2VydmVyKCk7XG5cblx0XHRpZiAodGhpcy5fcG9ydCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1tNY3BHYXRld2F5U2VydmljZV0gU2VydmVyIGZhaWxlZCB0byBzdGFydCwgcG9ydCBpcyB1bmRlZmluZWQnKTtcblx0XHR9XG5cblx0XHRpZiAoIXRvb2xJbnZva2VyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1tNY3BHYXRld2F5U2VydmljZV0gVG9vbCBpbnZva2VyIGlzIHJlcXVpcmVkIHRvIGNyZWF0ZSBnYXRld2F5Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ2F0ZXdheUlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3Qgcm91dGVJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBzZXJ2ZXJSb3V0ZU1hcCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0dGhpcy5fZ2F0ZXdheVJvdXRlcy5zZXQoZ2F0ZXdheUlkLCByb3V0ZUlkcyk7XG5cdFx0dGhpcy5fZ2F0ZXdheVNlcnZlclJvdXRlcy5zZXQoZ2F0ZXdheUlkLCBzZXJ2ZXJSb3V0ZU1hcCk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9nYXRld2F5RGlzcG9zYWJsZXMuc2V0KGdhdGV3YXlJZCwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIENyZWF0ZSBpbml0aWFsIHNlcnZlciByb3V0ZXNcblx0XHRcdGNvbnN0IHNlcnZlckRlc2NyaXB0b3JzID0gdG9vbEludm9rZXIubGlzdFNlcnZlcnMoKTtcblx0XHRcdGNvbnN0IHNlcnZlcnM6IElNY3BHYXRld2F5U2VydmVySW5mb1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGRlc2NyaXB0b3Igb2Ygc2VydmVyRGVzY3JpcHRvcnMpIHtcblx0XHRcdFx0Y29uc3Qgc2VydmVySW5mbyA9IHRoaXMuX2NyZWF0ZVJvdXRlRm9yU2VydmVyKGdhdGV3YXlJZCwgZGVzY3JpcHRvci5pZCwgZGVzY3JpcHRvci5sYWJlbCwgdG9vbEludm9rZXIsIHJvdXRlSWRzLCBzZXJ2ZXJSb3V0ZU1hcCk7XG5cdFx0XHRcdHNlcnZlcnMucHVzaChzZXJ2ZXJJbmZvKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVHJhY2sgY2xpZW50IG93bmVyc2hpcFxuXHRcdFx0aWYgKGNsaWVudElkKSB7XG5cdFx0XHRcdHRoaXMuX2dhdGV3YXlUb0NsaWVudC5zZXQoZ2F0ZXdheUlkLCBjbGllbnRJZCk7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBbTWNwR2F0ZXdheVNlcnZpY2VdIENyZWF0ZWQgZ2F0ZXdheSAke2dhdGV3YXlJZH0gd2l0aCAke3NlcnZlcnMubGVuZ3RofSBzZXJ2ZXIocykgZm9yIGNsaWVudCAke2NsaWVudElkfWApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyLndhcm4oYFtNY3BHYXRld2F5U2VydmljZV0gQ3JlYXRlZCBnYXRld2F5ICR7Z2F0ZXdheUlkfSB3aXRoICR7c2VydmVycy5sZW5ndGh9IHNlcnZlcihzKSB3aXRob3V0IGNsaWVudCB0cmFja2luZ2ApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBMaXN0ZW4gZm9yIHNlcnZlciBjaGFuZ2VzIHRvIGR5bmFtaWNhbGx5IGFkZC9yZW1vdmUgcm91dGVzXG5cdFx0XHRjb25zdCBvbkRpZENoYW5nZVNlcnZlcnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8cmVhZG9ubHkgSU1jcEdhdGV3YXlTZXJ2ZXJJbmZvW10+KCkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xJbnZva2VyLm9uRGlkQ2hhbmdlU2VydmVycyhuZXdEZXNjcmlwdG9ycyA9PiB7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hHYXRld2F5U2VydmVycyhnYXRld2F5SWQsIG5ld0Rlc2NyaXB0b3JzLCB0b29sSW52b2tlciwgcm91dGVJZHMsIHNlcnZlclJvdXRlTWFwLCBvbkRpZENoYW5nZVNlcnZlcnMpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzZXJ2ZXJzLFxuXHRcdFx0XHRvbkRpZENoYW5nZVNlcnZlcnM6IG9uRGlkQ2hhbmdlU2VydmVycy5ldmVudCxcblx0XHRcdFx0Z2F0ZXdheUlkLFxuXHRcdFx0fTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gQ2xlYW4gdXAgcGFydGlhbGx5LWNyZWF0ZWQgc3RhdGUgb24gZmFpbHVyZVxuXHRcdFx0dGhpcy5fY2xlYW51cEdhdGV3YXkoZ2F0ZXdheUlkKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hHYXRld2F5U2VydmVycyhcblx0XHRnYXRld2F5SWQ6IHN0cmluZyxcblx0XHRuZXdEZXNjcmlwdG9yczogcmVhZG9ubHkgSU1jcEdhdGV3YXlTZXJ2ZXJEZXNjcmlwdG9yW10sXG5cdFx0dG9vbEludm9rZXI6IElNY3BHYXRld2F5VG9vbEludm9rZXIsXG5cdFx0cm91dGVJZHM6IFNldDxzdHJpbmc+LFxuXHRcdHNlcnZlclJvdXRlTWFwOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuXHRcdG9uRGlkQ2hhbmdlU2VydmVyczogRW1pdHRlcjxyZWFkb25seSBJTWNwR2F0ZXdheVNlcnZlckluZm9bXT4sXG5cdCk6IHZvaWQge1xuXHRcdC8vIEJhaWwgb3V0IGlmIHRoZSBnYXRld2F5IGhhcyBiZWVuIGRpc3Bvc2VkXG5cdFx0aWYgKCF0aGlzLl9nYXRld2F5Um91dGVzLmhhcyhnYXRld2F5SWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3U2VydmVySWRzID0gbmV3IFNldChuZXdEZXNjcmlwdG9ycy5tYXAoZCA9PiBkLmlkKSk7XG5cdFx0Y29uc3QgZXhpc3RpbmdTZXJ2ZXJJZHMgPSBuZXcgU2V0KHNlcnZlclJvdXRlTWFwLmtleXMoKSk7XG5cblx0XHQvLyBSZW1vdmUgcm91dGVzIGZvciBzZXJ2ZXJzIHRoYXQgYXJlIGdvbmVcblx0XHRmb3IgKGNvbnN0IHNlcnZlcklkIG9mIGV4aXN0aW5nU2VydmVySWRzKSB7XG5cdFx0XHRpZiAoIW5ld1NlcnZlcklkcy5oYXMoc2VydmVySWQpKSB7XG5cdFx0XHRcdGNvbnN0IHJvdXRlSWQgPSBzZXJ2ZXJSb3V0ZU1hcC5nZXQoc2VydmVySWQpO1xuXHRcdFx0XHRpZiAocm91dGVJZCkge1xuXHRcdFx0XHRcdHRoaXMuX2Rpc3Bvc2VSb3V0ZShyb3V0ZUlkKTtcblx0XHRcdFx0XHRyb3V0ZUlkcy5kZWxldGUocm91dGVJZCk7XG5cdFx0XHRcdFx0c2VydmVyUm91dGVNYXAuZGVsZXRlKHNlcnZlcklkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCByb3V0ZXMgZm9yIG5ldyBzZXJ2ZXJzLCBhbmQgdXBkYXRlIGxhYmVscyBmb3IgZXhpc3Rpbmcgb25lcy5cblx0XHRmb3IgKGNvbnN0IGRlc2NyaXB0b3Igb2YgbmV3RGVzY3JpcHRvcnMpIHtcblx0XHRcdGlmICghZXhpc3RpbmdTZXJ2ZXJJZHMuaGFzKGRlc2NyaXB0b3IuaWQpKSB7XG5cdFx0XHRcdHRoaXMuX2NyZWF0ZVJvdXRlRm9yU2VydmVyKGdhdGV3YXlJZCwgZGVzY3JpcHRvci5pZCwgZGVzY3JpcHRvci5sYWJlbCwgdG9vbEludm9rZXIsIHJvdXRlSWRzLCBzZXJ2ZXJSb3V0ZU1hcCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByb3V0ZUlkID0gc2VydmVyUm91dGVNYXAuZ2V0KGRlc2NyaXB0b3IuaWQpO1xuXHRcdFx0Y29uc3Qgcm91dGUgPSByb3V0ZUlkID8gdGhpcy5fcm91dGVzLmdldChyb3V0ZUlkKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChyb3V0ZSAmJiByb3V0ZS5sYWJlbCAhPT0gZGVzY3JpcHRvci5sYWJlbCkge1xuXHRcdFx0XHRyb3V0ZS5sYWJlbCA9IGRlc2NyaXB0b3IubGFiZWw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXBkYXRlZFNlcnZlcnMgPSB0aGlzLl9nZXRHYXRld2F5U2VydmVycyhnYXRld2F5SWQpO1xuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBbTWNwR2F0ZXdheVNlcnZpY2VdIEdhdGV3YXkgJHtnYXRld2F5SWR9IHNlcnZlcnMgY2hhbmdlZDogJHt1cGRhdGVkU2VydmVycy5sZW5ndGh9IHNlcnZlcihzKWApO1xuXHRcdG9uRGlkQ2hhbmdlU2VydmVycy5maXJlKHVwZGF0ZWRTZXJ2ZXJzKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFudXBHYXRld2F5KGdhdGV3YXlJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgcm91dGVJZHMgPSB0aGlzLl9nYXRld2F5Um91dGVzLmdldChnYXRld2F5SWQpO1xuXHRcdGlmIChyb3V0ZUlkcykge1xuXHRcdFx0Zm9yIChjb25zdCByb3V0ZUlkIG9mIHJvdXRlSWRzKSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VSb3V0ZShyb3V0ZUlkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fZ2F0ZXdheVJvdXRlcy5kZWxldGUoZ2F0ZXdheUlkKTtcblx0XHR0aGlzLl9nYXRld2F5U2VydmVyUm91dGVzLmRlbGV0ZShnYXRld2F5SWQpO1xuXHRcdHRoaXMuX2dhdGV3YXlUb0NsaWVudC5kZWxldGUoZ2F0ZXdheUlkKTtcblx0XHR0aGlzLl9nYXRld2F5RGlzcG9zYWJsZXMuZ2V0KGdhdGV3YXlJZCk/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9nYXRld2F5RGlzcG9zYWJsZXMuZGVsZXRlKGdhdGV3YXlJZCk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVSb3V0ZUZvclNlcnZlcihcblx0XHRnYXRld2F5SWQ6IHN0cmluZyxcblx0XHRzZXJ2ZXJJZDogc3RyaW5nLFxuXHRcdGxhYmVsOiBzdHJpbmcsXG5cdFx0dG9vbEludm9rZXI6IElNY3BHYXRld2F5VG9vbEludm9rZXIsXG5cdFx0cm91dGVJZHM6IFNldDxzdHJpbmc+LFxuXHRcdHNlcnZlclJvdXRlTWFwOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuXHQpOiBJTWNwR2F0ZXdheVNlcnZlckluZm8ge1xuXHRcdGNvbnN0IHJvdXRlSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblxuXHRcdC8vIENyZWF0ZSBhIHNpbmdsZS1zZXJ2ZXIgaW52b2tlciB0aGF0IGRlbGVnYXRlcyB0byB0aGUgYWdncmVnYXRpbmcgaW52b2tlclxuXHRcdGNvbnN0IHNpbmdsZVNlcnZlckludm9rZXI6IElNY3BHYXRld2F5U2luZ2xlU2VydmVySW52b2tlciA9IHtcblx0XHRcdG9uRGlkQ2hhbmdlVG9vbHM6IHRvb2xJbnZva2VyLm9uRGlkQ2hhbmdlVG9vbHMsXG5cdFx0XHRvbkRpZENoYW5nZVJlc291cmNlczogdG9vbEludm9rZXIub25EaWRDaGFuZ2VSZXNvdXJjZXMsXG5cdFx0XHRsaXN0VG9vbHM6ICgpID0+IHRvb2xJbnZva2VyLmxpc3RUb29sc0ZvclNlcnZlcihzZXJ2ZXJJZCksXG5cdFx0XHRjYWxsVG9vbDogKG5hbWUsIGFyZ3MpID0+IHRvb2xJbnZva2VyLmNhbGxUb29sRm9yU2VydmVyKHNlcnZlcklkLCBuYW1lLCBhcmdzKSxcblx0XHRcdGxpc3RSZXNvdXJjZXM6ICgpID0+IHRvb2xJbnZva2VyLmxpc3RSZXNvdXJjZXNGb3JTZXJ2ZXIoc2VydmVySWQpLFxuXHRcdFx0cmVhZFJlc291cmNlOiB1cmkgPT4gdG9vbEludm9rZXIucmVhZFJlc291cmNlRm9yU2VydmVyKHNlcnZlcklkLCB1cmkpLFxuXHRcdFx0bGlzdFJlc291cmNlVGVtcGxhdGVzOiAoKSA9PiB0b29sSW52b2tlci5saXN0UmVzb3VyY2VUZW1wbGF0ZXNGb3JTZXJ2ZXIoc2VydmVySWQpLFxuXHRcdH07XG5cblx0XHRjb25zdCByb3V0ZSA9IG5ldyBNY3BHYXRld2F5Um91dGUocm91dGVJZCwgdGhpcy5fbG9nZ2VyLCBzaW5nbGVTZXJ2ZXJJbnZva2VyLCBsYWJlbCk7XG5cdFx0dGhpcy5fcm91dGVzLnNldChyb3V0ZUlkLCByb3V0ZSk7XG5cdFx0cm91dGVJZHMuYWRkKHJvdXRlSWQpO1xuXHRcdHNlcnZlclJvdXRlTWFwLnNldChzZXJ2ZXJJZCwgcm91dGVJZCk7XG5cblx0XHRjb25zdCBhZGRyZXNzID0gVVJJLnBhcnNlKGBodHRwOi8vMTI3LjAuMC4xOiR7dGhpcy5fcG9ydH0vZ2F0ZXdheS8ke3JvdXRlSWR9YCk7XG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oYFtNY3BHYXRld2F5U2VydmljZV0gQ3JlYXRlZCByb3V0ZSAke3JvdXRlSWR9IGZvciBzZXJ2ZXIgJyR7bGFiZWx9JyAoJHtzZXJ2ZXJJZH0pIGF0ICR7YWRkcmVzc31gKTtcblxuXHRcdHJldHVybiB7IGxhYmVsLCBhZGRyZXNzIH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRHYXRld2F5U2VydmVycyhnYXRld2F5SWQ6IHN0cmluZyk6IElNY3BHYXRld2F5U2VydmVySW5mb1tdIHtcblx0XHRjb25zdCBzZXJ2ZXJSb3V0ZU1hcCA9IHRoaXMuX2dhdGV3YXlTZXJ2ZXJSb3V0ZXMuZ2V0KGdhdGV3YXlJZCk7XG5cdFx0aWYgKCFzZXJ2ZXJSb3V0ZU1hcCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBzZXJ2ZXJzOiBJTWNwR2F0ZXdheVNlcnZlckluZm9bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW19zZXJ2ZXJJZCwgcm91dGVJZF0gb2Ygc2VydmVyUm91dGVNYXApIHtcblx0XHRcdGNvbnN0IHJvdXRlID0gdGhpcy5fcm91dGVzLmdldChyb3V0ZUlkKTtcblx0XHRcdGlmIChyb3V0ZSkge1xuXHRcdFx0XHRzZXJ2ZXJzLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiByb3V0ZS5sYWJlbCxcblx0XHRcdFx0XHRhZGRyZXNzOiBVUkkucGFyc2UoYGh0dHA6Ly8xMjcuMC4wLjE6JHt0aGlzLl9wb3J0fS9nYXRld2F5LyR7cm91dGVJZH1gKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBzZXJ2ZXJzO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZVJvdXRlKHJvdXRlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHJvdXRlID0gdGhpcy5fcm91dGVzLmdldChyb3V0ZUlkKTtcblx0XHRpZiAocm91dGUpIHtcblx0XHRcdHJvdXRlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3JvdXRlcy5kZWxldGUocm91dGVJZCk7XG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgW01jcEdhdGV3YXlTZXJ2aWNlXSBEaXNwb3NlZCByb3V0ZTogJHtyb3V0ZUlkfWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGRpc3Bvc2VHYXRld2F5KGdhdGV3YXlJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9nYXRld2F5Um91dGVzLmhhcyhnYXRld2F5SWQpKSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIud2FybihgW01jcEdhdGV3YXlTZXJ2aWNlXSBBdHRlbXB0ZWQgdG8gZGlzcG9zZSB1bmtub3duIGdhdGV3YXk6ICR7Z2F0ZXdheUlkfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NsZWFudXBHYXRld2F5KGdhdGV3YXlJZCk7XG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oYFtNY3BHYXRld2F5U2VydmljZV0gRGlzcG9zZWQgZ2F0ZXdheTogJHtnYXRld2F5SWR9IChyZW1haW5pbmcgcm91dGVzOiAke3RoaXMuX3JvdXRlcy5zaXplfSlgKTtcblxuXHRcdC8vIElmIG5vIG1vcmUgcm91dGVzLCBzaHV0IGRvd24gdGhlIHNlcnZlclxuXHRcdGlmICh0aGlzLl9yb3V0ZXMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc3RvcFNlcnZlcigpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VHYXRld2F5c0ZvckNsaWVudChjbGllbnRJZDogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IGdhdGV3YXlzVG9EaXNwb3NlOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBbZ2F0ZXdheUlkLCBvd25lckNsaWVudElkXSBvZiB0aGlzLl9nYXRld2F5VG9DbGllbnQpIHtcblx0XHRcdGlmIChvd25lckNsaWVudElkID09PSBjbGllbnRJZCkge1xuXHRcdFx0XHRnYXRld2F5c1RvRGlzcG9zZS5wdXNoKGdhdGV3YXlJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGdhdGV3YXlzVG9EaXNwb3NlLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBbTWNwR2F0ZXdheVNlcnZpY2VdIERpc3Bvc2luZyAke2dhdGV3YXlzVG9EaXNwb3NlLmxlbmd0aH0gZ2F0ZXdheShzKSBmb3IgZGlzY29ubmVjdGVkIGNsaWVudCAke2NsaWVudElkfWApO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGdhdGV3YXlJZCBvZiBnYXRld2F5c1RvRGlzcG9zZSkge1xuXHRcdFx0XHR0aGlzLl9jbGVhbnVwR2F0ZXdheShnYXRld2F5SWQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiBubyBtb3JlIHJvdXRlcywgc2h1dCBkb3duIHRoZSBzZXJ2ZXJcblx0XHRcdGlmICh0aGlzLl9yb3V0ZXMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9zdG9wU2VydmVyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlU2VydmVyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zZXJ2ZXI/Lmxpc3RlbmluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHNlcnZlciBpcyBhbHJlYWR5IHN0YXJ0aW5nLCB3YWl0IGZvciBpdFxuXHRcdGlmICh0aGlzLl9zZXJ2ZXJTdGFydFByb21pc2UpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZXJ2ZXJTdGFydFByb21pc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VydmVyU3RhcnRQcm9taXNlID0gdGhpcy5fc3RhcnRTZXJ2ZXIoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fc2VydmVyU3RhcnRQcm9taXNlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9zZXJ2ZXJTdGFydFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RhcnRTZXJ2ZXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyBjcmVhdGVTZXJ2ZXIgfSA9IGF3YWl0IGltcG9ydCgnaHR0cCcpOyAvLyBMYXp5IGR1ZSB0byBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvaXNzdWVzLzU5Njg2XG5cdFx0Y29uc3QgZGVmZXJyZWRQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdFx0dGhpcy5fc2VydmVyID0gY3JlYXRlU2VydmVyKChyZXEsIHJlcykgPT4ge1xuXHRcdFx0dGhpcy5faGFuZGxlUmVxdWVzdChyZXEsIHJlcyk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBwb3J0VGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0ZGVmZXJyZWRQcm9taXNlLmVycm9yKG5ldyBFcnJvcignW01jcEdhdGV3YXlTZXJ2aWNlXSBUaW1lb3V0IHdhaXRpbmcgZm9yIHNlcnZlciB0byBzdGFydCcpKTtcblx0XHR9LCA1MDAwKTtcblxuXHRcdHRoaXMuX3NlcnZlci5vbignbGlzdGVuaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWRkcmVzcyA9IHRoaXMuX3NlcnZlciEuYWRkcmVzcygpO1xuXHRcdFx0aWYgKHR5cGVvZiBhZGRyZXNzID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHR0aGlzLl9wb3J0ID0gcGFyc2VJbnQoYWRkcmVzcyk7XG5cdFx0XHR9IGVsc2UgaWYgKGFkZHJlc3MgaW5zdGFuY2VvZiBPYmplY3QpIHtcblx0XHRcdFx0dGhpcy5fcG9ydCA9IGFkZHJlc3MucG9ydDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dChwb3J0VGltZW91dCk7XG5cdFx0XHRcdGRlZmVycmVkUHJvbWlzZS5lcnJvcihuZXcgRXJyb3IoJ1tNY3BHYXRld2F5U2VydmljZV0gVW5hYmxlIHRvIGRldGVybWluZSBwb3J0JykpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNsZWFyVGltZW91dChwb3J0VGltZW91dCk7XG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgW01jcEdhdGV3YXlTZXJ2aWNlXSBTZXJ2ZXIgc3RhcnRlZCBvbiBwb3J0ICR7dGhpcy5fcG9ydH1gKTtcblx0XHRcdGRlZmVycmVkUHJvbWlzZS5jb21wbGV0ZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fc2VydmVyLm9uKCdlcnJvcicsIChlcnI6IE5vZGVKUy5FcnJub0V4Y2VwdGlvbikgPT4ge1xuXHRcdFx0aWYgKGVyci5jb2RlID09PSAnRUFERFJJTlVTRScpIHtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyLndhcm4oJ1tNY3BHYXRld2F5U2VydmljZV0gUG9ydCBpbiB1c2UsIHJldHJ5aW5nIHdpdGggcmFuZG9tIHBvcnQuLi4nKTtcblx0XHRcdFx0Ly8gVHJ5IHdpdGggYSByYW5kb20gcG9ydFxuXHRcdFx0XHR0aGlzLl9zZXJ2ZXIhLmxpc3RlbigwLCAnMTI3LjAuMC4xJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNsZWFyVGltZW91dChwb3J0VGltZW91dCk7XG5cdFx0XHR0aGlzLl9sb2dnZXIuZXJyb3IoYFtNY3BHYXRld2F5U2VydmljZV0gU2VydmVyIGVycm9yOiAke2Vycn1gKTtcblx0XHRcdGRlZmVycmVkUHJvbWlzZS5lcnJvcihlcnIpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gVXNlIGR5bmFtaWMgcG9ydCBhc3NpZ25tZW50IChwb3J0IDApXG5cdFx0dGhpcy5fc2VydmVyLmxpc3RlbigwLCAnMTI3LjAuMC4xJyk7XG5cblx0XHRyZXR1cm4gZGVmZXJyZWRQcm9taXNlLnA7XG5cdH1cblxuXHRwcml2YXRlIF9zdG9wU2VydmVyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oJ1tNY3BHYXRld2F5U2VydmljZV0gU3RvcHBpbmcgc2VydmVyIChubyBtb3JlIHJvdXRlcyknKTtcblxuXHRcdHRoaXMuX3NlcnZlci5jbG9zZShlcnIgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dnZXIuZXJyb3IoYFtNY3BHYXRld2F5U2VydmljZV0gRXJyb3IgY2xvc2luZyBzZXJ2ZXI6ICR7ZXJyfWApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oJ1tNY3BHYXRld2F5U2VydmljZV0gU2VydmVyIHN0b3BwZWQnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3NlcnZlciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9wb3J0ID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlUmVxdWVzdChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiB2b2lkIHtcblx0XHRjb25zdCB1cmwgPSBuZXcgVVJMKHJlcS51cmwhLCBgaHR0cDovLyR7cmVxLmhlYWRlcnMuaG9zdH1gKTtcblx0XHRjb25zdCBwYXRoUGFydHMgPSB1cmwucGF0aG5hbWUuc3BsaXQoJy8nKS5maWx0ZXIoQm9vbGVhbik7XG5cblx0XHR0aGlzLl9sb2dnZXIuZGVidWcoYFtNY3BHYXRld2F5U2VydmljZV0gJHtyZXEubWV0aG9kfSAke3VybC5wYXRobmFtZX0gKGFjdGl2ZSByb3V0ZXM6ICR7dGhpcy5fcm91dGVzLnNpemV9KWApO1xuXG5cdFx0Ly8gRXhwZWN0ZWQgcGF0aDogL2dhdGV3YXkve3JvdXRlSWR9XG5cdFx0aWYgKHBhdGhQYXJ0cy5sZW5ndGggPj0gMiAmJiBwYXRoUGFydHNbMF0gPT09ICdnYXRld2F5Jykge1xuXHRcdFx0Y29uc3Qgcm91dGVJZCA9IHBhdGhQYXJ0c1sxXTtcblx0XHRcdGNvbnN0IHJvdXRlID0gdGhpcy5fcm91dGVzLmdldChyb3V0ZUlkKTtcblxuXHRcdFx0aWYgKHJvdXRlKSB7XG5cdFx0XHRcdHJvdXRlLmhhbmRsZVJlcXVlc3QocmVxLCByZXMpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTm90IGZvdW5kXG5cdFx0dGhpcy5fbG9nZ2VyLndhcm4oYFtNY3BHYXRld2F5U2VydmljZV0gJHtyZXEubWV0aG9kfSAke3VybC5wYXRobmFtZX06IHJvdXRlIG5vdCBmb3VuZGApO1xuXHRcdHJlcy53cml0ZUhlYWQoNDA0LCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG5cdFx0cmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnR2F0ZXdheSBub3QgZm91bmQnIH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oYFtNY3BHYXRld2F5U2VydmljZV0gRGlzcG9zaW5nIHNlcnZpY2UgKHJvdXRlczogJHt0aGlzLl9yb3V0ZXMuc2l6ZX0pYCk7XG5cdFx0dGhpcy5fc3RvcFNlcnZlcigpO1xuXHRcdGZvciAoY29uc3Qgcm91dGUgb2YgdGhpcy5fcm91dGVzLnZhbHVlcygpKSB7XG5cdFx0XHRyb3V0ZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3JvdXRlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2dhdGV3YXlSb3V0ZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9nYXRld2F5U2VydmVyUm91dGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fZ2F0ZXdheVRvQ2xpZW50LmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCBkaXNwb3NhYmxlcyBvZiB0aGlzLl9nYXRld2F5RGlzcG9zYWJsZXMudmFsdWVzKCkpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fZ2F0ZXdheURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIHNpbmdsZSBNQ1AgZ2F0ZXdheSByb3V0ZSBmb3Igb25lIE1DUCBzZXJ2ZXIuXG4gKi9cbmNsYXNzIE1jcEdhdGV3YXlSb3V0ZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBNY3BHYXRld2F5U2Vzc2lvbj4oKTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTZXNzaW9uSGVhZGVyTmFtZSA9ICdtY3Atc2Vzc2lvbi1pZCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHJvdXRlSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXI6IElMb2dnZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2VydmVySW52b2tlcjogSU1jcEdhdGV3YXlTaW5nbGVTZXJ2ZXJJbnZva2VyLFxuXHRcdHB1YmxpYyBsYWJlbDogc3RyaW5nID0gJycsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRoYW5kbGVSZXF1ZXN0KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ2dlci5kZWJ1ZyhgW01jcEdhdGV3YXldW3JvdXRlICR7dGhpcy5yb3V0ZUlkfV0gJHtyZXEubWV0aG9kfSByZXF1ZXN0IChzZXNzaW9uczogJHt0aGlzLl9zZXNzaW9ucy5zaXplfSlgKTtcblxuXHRcdGlmIChyZXEubWV0aG9kID09PSAnUE9TVCcpIHtcblx0XHRcdHZvaWQgdGhpcy5faGFuZGxlUG9zdChyZXEsIHJlcyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHJlcS5tZXRob2QgPT09ICdHRVQnKSB7XG5cdFx0XHR0aGlzLl9oYW5kbGVHZXQocmVxLCByZXMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChyZXEubWV0aG9kID09PSAnREVMRVRFJykge1xuXHRcdFx0dGhpcy5faGFuZGxlRGVsZXRlKHJlcSwgcmVzKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXNwb25kSHR0cEVycm9yKHJlcywgNDA1LCAnTWV0aG9kIG5vdCBhbGxvd2VkJyk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgW01jcEdhdGV3YXldW3JvdXRlICR7dGhpcy5yb3V0ZUlkfV0gRGlzcG9zaW5nIHJvdXRlIChzZXNzaW9uczogJHt0aGlzLl9zZXNzaW9ucy5zaXplfSlgKTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fc2Vzc2lvbnMudmFsdWVzKCkpIHtcblx0XHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9ucy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZURlbGV0ZShyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLl9nZXRTZXNzaW9uSWQocmVxKTtcblx0XHRpZiAoIXNlc3Npb25JZCkge1xuXHRcdFx0dGhpcy5fcmVzcG9uZEh0dHBFcnJvcihyZXMsIDQwMCwgJ01pc3NpbmcgTWNwLVNlc3Npb24tSWQgaGVhZGVyJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fcmVzcG9uZEh0dHBFcnJvcihyZXMsIDQwNCwgJ1Nlc3Npb24gbm90IGZvdW5kJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oYFtNY3BHYXRld2F5XVtyb3V0ZSAke3RoaXMucm91dGVJZH1dIERlbGV0aW5nIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbnMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0cmVzLndyaXRlSGVhZCgyMDQpO1xuXHRcdHJlcy5lbmQoKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUdldChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLl9nZXRTZXNzaW9uSWQocmVxKTtcblx0XHRpZiAoIXNlc3Npb25JZCkge1xuXHRcdFx0dGhpcy5fcmVzcG9uZEh0dHBFcnJvcihyZXMsIDQwMCwgJ01pc3NpbmcgTWNwLVNlc3Npb24tSWQgaGVhZGVyJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fcmVzcG9uZEh0dHBFcnJvcihyZXMsIDQwNCwgJ1Nlc3Npb24gbm90IGZvdW5kJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oYFtNY3BHYXRld2F5XVtyb3V0ZSAke3RoaXMucm91dGVJZH1dIFNTRSBjb25uZWN0aW9uIHJlcXVlc3RlZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcblx0XHRzZXNzaW9uLmF0dGFjaFNzZUNsaWVudChyZXEsIHJlcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVQb3N0KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGJvZHkgPSBhd2FpdCB0aGlzLl9yZWFkUmVxdWVzdEJvZHkocmVxKTtcblx0XHRpZiAoYm9keSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9yZXNwb25kSHR0cEVycm9yKHJlcywgNDEzLCAnUGF5bG9hZCB0b28gbGFyZ2UnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dnZXIuZGVidWcoYFtNY3BHYXRld2F5XVtyb3V0ZSAke3RoaXMucm91dGVJZH1dIEhhbmRsaW5nIFBPU1RgKTtcblxuXHRcdGxldCBtZXNzYWdlOiBKc29uUnBjTWVzc2FnZSB8IEpzb25ScGNNZXNzYWdlW107XG5cdFx0dHJ5IHtcblx0XHRcdG1lc3NhZ2UgPSBKU09OLnBhcnNlKGJvZHkpIGFzIEpzb25ScGNNZXNzYWdlIHwgSnNvblJwY01lc3NhZ2VbXTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLndhcm4oYFtNY3BHYXRld2F5XVtyb3V0ZSAke3RoaXMucm91dGVJZH1dIEpTT04gcGFyc2UgZXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0cmVzLndyaXRlSGVhZCg0MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcblx0XHRcdHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoSnNvblJwY1Byb3RvY29sLmNyZWF0ZVBhcnNlRXJyb3IoJ1BhcnNlIGVycm9yJywgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpKSkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlclNlc3Npb25JZCA9IHRoaXMuX2dldFNlc3Npb25JZChyZXEpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9yZXNvbHZlU2Vzc2lvbkZvclBvc3QoaGVhZGVyU2Vzc2lvbklkLCBtZXNzYWdlLCByZXMpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNwb25zZXMgPSBhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKG1lc3NhZ2UpO1xuXG5cdFx0XHRjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHQnTWNwLVNlc3Npb24tSWQnOiBzZXNzaW9uLmlkLFxuXHRcdFx0fTtcblxuXHRcdFx0aWYgKHJlc3BvbnNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyLmRlYnVnKGBbTWNwR2F0ZXdheV1bcm91dGUgJHt0aGlzLnJvdXRlSWR9XSBQT1NUIHJlc3BvbnNlOiAyMDIgKG5vIGNvbnRlbnQpYCk7XG5cdFx0XHRcdHJlcy53cml0ZUhlYWQoMjAyLCBoZWFkZXJzKTtcblx0XHRcdFx0cmVzLmVuZCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc3BvbnNlQm9keSA9IEpTT04uc3RyaW5naWZ5KEFycmF5LmlzQXJyYXkobWVzc2FnZSkgPyByZXNwb25zZXMgOiByZXNwb25zZXNbMF0pO1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmRlYnVnKGBbTWNwR2F0ZXdheV1bcm91dGUgJHt0aGlzLnJvdXRlSWR9XSBQT1NUIHJlc3BvbnNlOiAyMDAsIGJvZHk6ICR7cmVzcG9uc2VCb2R5fWApO1xuXHRcdFx0cmVzLndyaXRlSGVhZCgyMDAsIGhlYWRlcnMpO1xuXHRcdFx0cmVzLmVuZChyZXNwb25zZUJvZHkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIuZXJyb3IoJ1tNY3BHYXRld2F5U2VydmljZV0gRmFpbGVkIGhhbmRsaW5nIGdhdGV3YXkgcmVxdWVzdCcsIGVycm9yKTtcblx0XHRcdHRoaXMuX3Jlc3BvbmRIdHRwRXJyb3IocmVzLCA1MDAsICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlU2Vzc2lvbkZvclBvc3QoaGVhZGVyU2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIG1lc3NhZ2U6IEpzb25ScGNNZXNzYWdlIHwgSnNvblJwY01lc3NhZ2VbXSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogTWNwR2F0ZXdheVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGlmIChoZWFkZXJTZXNzaW9uSWQpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KGhlYWRlclNlc3Npb25JZCk7XG5cdFx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci53YXJuKGBbTWNwR2F0ZXdheV1bcm91dGUgJHt0aGlzLnJvdXRlSWR9XSBTZXNzaW9uIG5vdCBmb3VuZDogJHtoZWFkZXJTZXNzaW9uSWR9YCk7XG5cdFx0XHRcdHRoaXMuX3Jlc3BvbmRIdHRwRXJyb3IocmVzLCA0MDQsICdTZXNzaW9uIG5vdCBmb3VuZCcpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0aWYgKCFpc0luaXRpYWxpemVNZXNzYWdlKG1lc3NhZ2UpKSB7XG5cdFx0XHR0aGlzLl9yZXNwb25kSHR0cEVycm9yKHJlcywgNDAwLCAnTWlzc2luZyBNY3AtU2Vzc2lvbi1JZCBoZWFkZXInKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oYFtNY3BHYXRld2F5XVtyb3V0ZSAke3RoaXMucm91dGVJZH1dIENyZWF0aW5nIG5ldyBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgTWNwR2F0ZXdheVNlc3Npb24oc2Vzc2lvbklkLCB0aGlzLl9sb2dnZXIsICgpID0+IHtcblx0XHRcdHRoaXMuX3Nlc3Npb25zLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdH0sIHRoaXMuX3NlcnZlckludm9rZXIpO1xuXHRcdHRoaXMuX3Nlc3Npb25zLnNldChzZXNzaW9uSWQsIHNlc3Npb24pO1xuXHRcdHJldHVybiBzZXNzaW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzcG9uZEh0dHBFcnJvcihyZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UsIHN0YXR1c0NvZGU6IG51bWJlciwgZXJyb3I6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ2dlci5kZWJ1ZyhgW01jcEdhdGV3YXldW3JvdXRlICR7dGhpcy5yb3V0ZUlkfV0gSFRUUCBlcnJvciByZXNwb25zZTogJHtzdGF0dXNDb2RlfSAke2Vycm9yfWApO1xuXHRcdHJlcy53cml0ZUhlYWQoc3RhdHVzQ29kZSwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuXHRcdHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBqc29ucnBjOiAnMi4wJywgZXJyb3I6IHsgY29kZTogc3RhdHVzQ29kZSwgbWVzc2FnZTogZXJyb3IgfSB9IHNhdGlzZmllcyBKc29uUnBjTWVzc2FnZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2Vzc2lvbklkKHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZhbHVlID0gcmVxLmhlYWRlcnNbTWNwR2F0ZXdheVJvdXRlLlNlc3Npb25IZWFkZXJOYW1lXTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZVswXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkUmVxdWVzdEJvZHkocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY2h1bmtzOiBCdWZmZXJbXSA9IFtdO1xuXHRcdGxldCBzaXplID0gMDtcblx0XHRjb25zdCBtYXhCeXRlcyA9IDEwMjQgKiAxMDI0O1xuXG5cdFx0Zm9yIGF3YWl0IChjb25zdCBjaHVuayBvZiByZXEpIHtcblx0XHRcdGNvbnN0IGFzQnVmZmVyID0gQnVmZmVyLmlzQnVmZmVyKGNodW5rKSA/IGNodW5rIDogQnVmZmVyLmZyb20oY2h1bmspO1xuXHRcdFx0c2l6ZSArPSBhc0J1ZmZlci5ieXRlTGVuZ3RoO1xuXHRcdFx0aWYgKHNpemUgPiBtYXhCeXRlcykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y2h1bmtzLnB1c2goYXNCdWZmZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoJ3V0ZjgnKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBeUIsdUJBQXVCO0FBQ2hELFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQWtCLHNCQUFzQjtBQUV4QyxTQUFTLHFCQUFxQix5QkFBeUI7QUFRaEQsSUFBTSxv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
