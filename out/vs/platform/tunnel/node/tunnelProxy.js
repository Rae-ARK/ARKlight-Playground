import { Duplex } from "stream";
import { findFreePortFaster } from "../../../base/node/ports.js";
import { NodeSocket } from "../../../base/parts/ipc/node/ipc.net.js";
import { SocketCloseEventType } from "../../../base/parts/ipc/common/ipc.net.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Limiter } from "../../../base/common/async.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { generateSelfSignedCert } from "./selfSignedCert.js";
const MAX_CONCURRENT_TUNNEL_CONNECTS = 6;
class TunnelProxy extends Disposable {
  constructor(_connectTunnel, _logService) {
    super();
    this._connectTunnel = _connectTunnel;
    this._logService = _logService;
    this._localPort = 0;
    /**
     * Sockets we took over from the HTTPS server via CONNECT. Once the
     * CONNECT handler runs the server no longer tracks them, so
     * `server.close()` and `server.closeAllConnections()` won't terminate
     * them — we have to destroy them ourselves on dispose to release the
     * listening port promptly.
     */
    this._connectSockets = /* @__PURE__ */ new Set();
    /**
     * The remote (tunnel) side of every active bridge — both CONNECT
     * tunnels and pooled plain-HTTP sockets. We destroy these explicitly
     * and synchronously on dispose rather than relying on the local
     * socket's async `'close'` to propagate `end()`; during shared-process
     * teardown the event loop may not get another turn to fire that
     * listener, which would leave the upstream tunnel socket dangling.
     */
    this._remoteSockets = /* @__PURE__ */ new Set();
    /**
     * Bounds how many tunnels we create concurrently through the remote
     * agent. Gates the setup (connect + handshake) only; once a tunnel is
     * established the slot is released and data piping proceeds unthrottled.
     */
    this._connectLimiter = this._register(new Limiter(MAX_CONCURRENT_TUNNEL_CONNECTS));
  }
  get localPort() {
    return this._localPort;
  }
  async start() {
    const crypto = await import("crypto");
    const http = await import("http");
    const https = await import("https");
    const username = crypto.randomBytes(16).toString("hex");
    const password = crypto.randomBytes(32).toString("hex");
    this._credentials = { username, password };
    this._expectedAuthHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
    const { key, cert, fingerprint } = await generateSelfSignedCert();
    this._certFingerprint = fingerprint;
    this._http = http;
    this._tunnelAgent = this._createTunnelAgent();
    const server = https.createServer({ key, cert }, (req, res) => this._onRequest(req, res));
    server.on("connect", (req, socket, head) => this._onConnect(req, socket, head));
    server.on("error", (err) => {
      this._logService.error("[TunnelProxy] Server error:", err);
    });
    this._server = server;
    const port = await findFreePortFaster(0, 2, 1e3, "127.0.0.1");
    server.listen(port, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    this._localPort = address.port;
    this._logService.info(`[TunnelProxy] Listening on https://127.0.0.1:${this._localPort}`);
    return {
      url: `https://127.0.0.1:${this._localPort}`,
      host: "127.0.0.1",
      port: this._localPort,
      credentials: this._credentials,
      certFingerprint: this._certFingerprint
    };
  }
  dispose() {
    for (const socket of this._connectSockets) {
      socket.destroy();
    }
    this._connectSockets.clear();
    for (const socket of this._remoteSockets) {
      socket.destroy();
    }
    this._remoteSockets.clear();
    this._tunnelAgent?.destroy();
    this._server?.closeAllConnections();
    this._server?.close();
    super.dispose();
  }
  /**
   * Verify the `Proxy-Authorization` header against our credentials.
   * Returns `true` if the request is authorized.
   */
  _checkAuth(authHeader) {
    return authHeader === this._expectedAuthHeader;
  }
  /**
   * Create an `http.Agent` that pools tunnel sockets by target
   * host:port. Node calls `createConnection` only when no pooled socket
   * is available for the target; otherwise it reuses an existing one.
   */
  _createTunnelAgent() {
    if (!this._http) {
      throw new Error("HTTP module not initialized");
    }
    const agent = new this._http.Agent({ keepAlive: true });
    agent.createConnection = (options, oncreate) => {
      const host = options.hostname || options.host || "";
      const port = Number(options.port) || 80;
      this._createTunnelSocket(host, port).then((socket) => oncreate?.(null, socket)).catch((err) => oncreate?.(err, null));
    };
    return agent;
  }
  /**
   * Drop every pooled keep-alive tunnel socket by recreating the
   * agent. Called when the upstream tunnel endpoint changes: the pooled
   * sockets all dial the now-stale endpoint, so they would be reset en
   * masse once it goes away. Recreating the agent closes the idle ones
   * gracefully and forces subsequent requests to dial the new endpoint.
   */
  drainConnectionPool() {
    if (!this._tunnelAgent) {
      return;
    }
    const oldAgent = this._tunnelAgent;
    this._tunnelAgent = this._createTunnelAgent();
    oldAgent?.destroy();
    this._logService.trace("[TunnelProxy] Upstream endpoint changed; drained pooled tunnel sockets");
  }
  /**
   * Handle HTTP CONNECT requests (used for HTTPS tunneling).
   * Parses `host:port` from the request URL, establishes a tunnel
   * through the remote agent, and pipes the sockets together.
   */
  async _onConnect(req, socket, head) {
    this._connectSockets.add(socket);
    socket.on("close", () => this._connectSockets.delete(socket));
    if (!this._checkAuth(req.headers["proxy-authorization"])) {
      socket.write(
        'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="TunnelProxy"\r\n\r\n'
      );
      socket.end();
      return;
    }
    const { host, port } = this._parseHostPort(req.url ?? "", 443);
    if (!host) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.end();
      return;
    }
    this._logService.trace(`[TunnelProxy] CONNECT ${host}:${port}`);
    try {
      socket.pause();
      const protocol = await this._connectLimiter.queue(() => this._connectTunnel(host, port));
      const { stream: remoteSocket, leftover } = this._takeRemoteStream(protocol);
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (leftover.byteLength > 0) {
        socket.write(leftover.buffer);
      }
      if (head.length > 0) {
        remoteSocket.write(head);
      }
      this._bridgeSockets(socket, remoteSocket);
    } catch (err) {
      this._logService.error(`[TunnelProxy] Failed to tunnel to ${host}:${port}:`, err);
      socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      socket.end();
    }
  }
  /**
   * Handle plain HTTP requests (GET, POST, etc. with absolute URLs).
   *
   * Chromium sends proxied HTTP requests with absolute-form URLs
   * (e.g. `GET http://example.com/page HTTP/1.1`) and reuses keep-alive
   * connections to the proxy for requests to **different** hosts.
   *
   * Each request is forwarded via `http.request` using a shared
   * `http.Agent` that pools tunnel sockets by host:port. The agent
   * calls `_createTunnelSocket` only when no pooled socket is available;
   * otherwise it reuses an existing tunnel connection.
   */
  async _onRequest(req, res) {
    if (!this._checkAuth(req.headers["proxy-authorization"])) {
      res.writeHead(407, { "Proxy-Authenticate": 'Basic realm="TunnelProxy"' });
      res.end();
      return;
    }
    let parsed;
    try {
      parsed = new URL(req.url ?? "");
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (parsed.protocol !== "http:") {
      this._logService.warn(`[TunnelProxy] Rejecting non-HTTP forwarded request: ${req.method} ${req.url}`);
      res.writeHead(400);
      res.end();
      return;
    }
    const host = parsed.hostname;
    const port = parseInt(parsed.port, 10) || 80;
    if (!host) {
      res.writeHead(400);
      res.end();
      return;
    }
    this._logService.trace(`[TunnelProxy] ${req.method} ${host}:${port}${parsed.pathname}`);
    try {
      const http = await import("http");
      const path = parsed.pathname + parsed.search;
      const headers = { ...req.headers };
      const connectionTokens = (headers["connection"] ?? "").toString().split(",").map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
      for (const token of connectionTokens) {
        delete headers[token];
      }
      delete headers["connection"];
      delete headers["keep-alive"];
      delete headers["proxy-authorization"];
      delete headers["proxy-connection"];
      delete headers["te"];
      delete headers["transfer-encoding"];
      delete headers["upgrade"];
      const proxyReq = http.request({
        agent: this._tunnelAgent,
        hostname: host,
        port,
        path,
        method: req.method,
        headers
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (err) => {
        this._logService.error(`[TunnelProxy] Proxy request error for ${host}:${port}:`, err);
        res.destroy();
      });
      req.pipe(proxyReq);
    } catch (err) {
      this._logService.error(`[TunnelProxy] Failed to tunnel to ${host}:${port}:`, err);
      res.destroy();
    }
  }
  /**
   * Create a `net.Socket`-compatible stream backed by a remote agent
   * tunnel. Called by the `http.Agent` when it needs a new connection
   * to a given host:port (i.e. no pooled socket is available).
   */
  async _createTunnelSocket(host, port) {
    const protocol = await this._connectLimiter.queue(() => this._connectTunnel(host, port));
    const { stream: tunnelStream, leftover } = this._takeRemoteStream(protocol);
    this._trackRemoteSocket(tunnelStream);
    if (leftover.byteLength > 0) {
      tunnelStream.unshift(leftover.buffer);
    }
    return tunnelStream;
  }
  /**
   * Take ownership of a freshly-connected tunnel's transport as a Node
   * {@link Duplex} stream, together with any bytes the protocol already
   * buffered during the handshake (the caller routes that leftover to the
   * appropriate side).
   *
   * Two transports occur in practice:
   * - {@link NodeSocket} (classic/websocket server): unwrap the raw
   *   `net.Socket` so we can rely on Node's native stream backpressure (via
   *   `pipe()` and the keep-alive `http.Agent`).
   * - a generic {@link ISocket} (managed / exec-server connection): there is
   *   no `net.Socket` underneath, so adapt the message-passing socket to a
   *   {@link Duplex} ({@link RemoteSocketStream}).
   */
  _takeRemoteStream(protocol) {
    const remoteSocket = protocol.getSocket();
    if (remoteSocket instanceof NodeSocket) {
      const socket = remoteSocket.socket;
      const leftover2 = protocol.readEntireBuffer();
      remoteSocket.dispose(false);
      protocol.dispose();
      return { stream: socket, leftover: leftover2 };
    }
    const leftover = protocol.readEntireBuffer();
    protocol.dispose();
    return { stream: new RemoteSocketStream(remoteSocket), leftover };
  }
  /**
   * Parse a `host:port` string. Falls back to `defaultPort` when the
   * port component is missing. Returns an empty host when the address
   * is empty or the port is outside the valid TCP range (1-65535), per
   * RFC 9110 section 9.3.6 ("A server MUST reject a CONNECT request that
   * targets an empty or invalid port number").
   */
  _parseHostPort(address, defaultPort) {
    let host;
    let port;
    const bracketMatch = /^\[(?<host>[^\]]+)\]:(?<port>\d+)$/.exec(address);
    if (bracketMatch?.groups) {
      host = bracketMatch.groups["host"];
      port = parseInt(bracketMatch.groups["port"], 10);
    } else {
      const bracketOnly = /^\[(?<host>[^\]]+)\]$/.exec(address);
      if (bracketOnly?.groups) {
        host = bracketOnly.groups["host"];
        port = defaultPort;
      } else {
        const lastColon = address.lastIndexOf(":");
        if (lastColon === -1) {
          host = address;
          port = defaultPort;
        } else {
          const maybePort = parseInt(address.substring(lastColon + 1), 10);
          if (isNaN(maybePort)) {
            host = address;
            port = defaultPort;
          } else {
            host = address.substring(0, lastColon);
            port = maybePort;
          }
        }
      }
    }
    if (port < 1 || port > 65535) {
      return { host: "", port: 0 };
    }
    return { host, port };
  }
  _bridgeSockets(localSocket, remoteSocket) {
    this._trackRemoteSocket(remoteSocket);
    remoteSocket.on("end", () => localSocket.end());
    remoteSocket.on("close", () => localSocket.end());
    remoteSocket.on("error", () => localSocket.destroy());
    localSocket.on("end", () => remoteSocket.end());
    localSocket.on("close", () => remoteSocket.end());
    localSocket.on("error", () => remoteSocket.destroy());
    remoteSocket.pipe(localSocket);
    localSocket.pipe(remoteSocket);
  }
  /**
   * Track a remote tunnel socket so {@link dispose} can tear it down
   * synchronously. The socket auto-removes itself once closed.
   */
  _trackRemoteSocket(socket) {
    this._remoteSockets.add(socket);
    socket.on("error", () => socket.destroy());
    socket.on("close", () => this._remoteSockets.delete(socket));
  }
}
class RemoteSocketStream extends Duplex {
  constructor(_socket) {
    super();
    this._socket = _socket;
    this._disposables = new DisposableStore();
    this._disposables.add(this._socket.onData((data) => this.push(data.buffer)));
    this._disposables.add(this._socket.onEnd(() => this.push(null)));
    this._disposables.add(this._socket.onClose((e) => {
      this.destroy(e?.type === SocketCloseEventType.NodeSocketCloseEvent ? e.error : void 0);
    }));
  }
  // The keep-alive http.Agent pools tunnel sockets and calls net.Socket-only
  // transport knobs on them (setKeepAlive/ref/unref, and setTimeout/setNoDelay
  // while wiring a request) when parking or reusing a connection. A generic
  // ISocket has no such knobs, so expose no-op shims to keep the agent happy;
  // otherwise freeing a pooled managed socket throws (e.g.
  // "socket.setKeepAlive is not a function").
  setKeepAlive() {
    return this;
  }
  setNoDelay() {
    return this;
  }
  setTimeout() {
    return this;
  }
  ref() {
    return this;
  }
  unref() {
    return this;
  }
  _read() {
  }
  _write(chunk, _encoding, callback) {
    this._socket.write(VSBuffer.wrap(chunk));
    this._socket.drain().then(() => callback(), (err) => callback(err));
  }
  _final(callback) {
    this._socket.end();
    callback();
  }
  _destroy(error, callback) {
    this._disposables.dispose();
    this._socket.dispose();
    callback(error);
  }
}
export {
  TunnelProxy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3R1bm5lbC9ub2RlL3R1bm5lbFByb3h5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQgeyBEdXBsZXggfSBmcm9tICdzdHJlYW0nO1xuaW1wb3J0IHR5cGUgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IHR5cGUgKiBhcyBodHRwcyBmcm9tICdodHRwcyc7XG5cbmltcG9ydCB7IGZpbmRGcmVlUG9ydEZhc3RlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9wb3J0cy5qcyc7XG5pbXBvcnQgeyBOb2RlU29ja2V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvbm9kZS9pcGMubmV0LmpzJztcbmltcG9ydCB7IElTb2NrZXQsIFNvY2tldENsb3NlRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5uZXQuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgTGltaXRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUdW5uZWxQcm94eUluZm8gfSBmcm9tICcuLi9jb21tb24vdHVubmVsUHJveHkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVTZWxmU2lnbmVkQ2VydCB9IGZyb20gJy4vc2VsZlNpZ25lZENlcnQuanMnO1xuXG4vKipcbiAqIE1heGltdW0gbnVtYmVyIG9mIHR1bm5lbCBjb25uZWN0aW9ucyB3ZSBlc3RhYmxpc2ggdGhyb3VnaCB0aGUgcmVtb3RlXG4gKiBhZ2VudCBhdCB0aGUgc2FtZSB0aW1lLiBFYWNoIG5ldyB0dW5uZWwgZGlhbHMgdGhlIGxvb3BiYWNrIGZvcndhcmRlcixcbiAqIHdoaWNoIG9wZW5zIGEgZnJlc2ggbXVsdGlwbGV4ZWQgY2hhbm5lbCB0byB0aGUgcmVtb3RlIChjcnlwdG8gK1xuICogcm91bmQtdHJpcHMpIG9uIGEgc2luZ2xlIGV2ZW50IGxvb3AuIEFuIGFkLWhlYXZ5IHBhZ2UgZmFucyBvdXQgZG96ZW5zXG4gKiBvZiBzaW11bHRhbmVvdXMgQ09OTkVDVHMgdG8gZGlzdGluY3QgaG9zdHM7IGxlZnQgdW5ib3VuZGVkLCB0aGF0XG4gKiBzdGFtcGVkZSBvdmVyZmxvd3MgdGhlIGZvcndhcmRlcidzIGFjY2VwdCBiYWNrbG9nIGFuZCBpdCBzdGFydHNcbiAqIHJlZnVzaW5nIChFQ09OTlJFRlVTRUQpIGFuZCByZXNldHRpbmcgKEVDT05OUkVTRVQpIGNvbm5lY3Rpb25zLiBUaGlzXG4gKiBjYXAgc21vb3RocyB0aGUgYnVyc3QgdG8gYSByYXRlIHRoZSBmb3J3YXJkZXIgY2FuIGFic29yYjsgZXhjZXNzXG4gKiByZXF1ZXN0cyBxdWV1ZSByYXRoZXIgdGhhbiBmYWlsLlxuICovXG5jb25zdCBNQVhfQ09OQ1VSUkVOVF9UVU5ORUxfQ09OTkVDVFMgPSA2O1xuXG4vKipcbiAqIEEgZnVuY3Rpb24gdGhhdCBvcGVucyBhIFRDUCB0dW5uZWwgdG8gYSBnaXZlbiBob3N0OnBvcnQgdGhyb3VnaCB0aGVcbiAqIHJlbW90ZSBhZ2VudC4gUmVzb2x2ZXMgb25seSBvbmNlIHRoZSByZW1vdGUgaGFzIGNvbmZpcm1lZCB0aGUgdGFyZ2V0IGlzXG4gKiByZWFjaGFibGUgKHZpYSB0aGUgdHVubmVsIGhhbmRzaGFrZSkgYW5kIHJlamVjdHMgb3RoZXJ3aXNlLiBSZXR1cm5zIGFuXG4gKiBvYmplY3Qgd2l0aCBgZ2V0U29ja2V0KClgLCBgcmVhZEVudGlyZUJ1ZmZlcigpYCwgYW5kIGBkaXNwb3NlKClgIFx1MjAxNCBhXG4gKiBzdWJzZXQgb2Yge0BsaW5rIGltcG9ydCgnLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5uZXQuanMnKS5QZXJzaXN0ZW50UHJvdG9jb2x9LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElUdW5uZWxDb25uZWN0Rm4ge1xuXHQoaG9zdDogc3RyaW5nLCBwb3J0OiBudW1iZXIpOiBQcm9taXNlPHsgZ2V0U29ja2V0KCk6IElTb2NrZXQ7IHJlYWRFbnRpcmVCdWZmZXIoKTogVlNCdWZmZXI7IGRpc3Bvc2UoKTogdm9pZCB9Pjtcbn1cblxuLyoqXG4gKiBBbiBIVFRQUyBwcm94eSBzZXJ2ZXIgdGhhdCByb3V0ZXMgVENQIGNvbm5lY3Rpb25zIHRocm91Z2ggdGhlIHJlbW90ZVxuICogYWdlbnQgdHVubmVsLlxuICpcbiAqIEhhbmRsZXM6XG4gKiAtICoqQ09OTkVDVCoqIHJlcXVlc3RzICh1c2VkIGJ5IENocm9taXVtIGZvciBIVFRQUykgXHUyMDE0IGVzdGFibGlzaGVzIGFcbiAqICAgcmF3IFRDUCB0dW5uZWwgdGhyb3VnaCB0aGUgcmVtb3RlIGFnZW50LlxuICogLSAqKlBsYWluIEhUVFAqKiByZXF1ZXN0cyAoR0VULCBQT1NULCBldGMuIHdpdGggYWJzb2x1dGUgVVJMcykgXHUyMDE0XG4gKiAgIGVzdGFibGlzaGVzIGEgdHVubmVsIGFuZCBmb3J3YXJkcyB0aGUgcmVxdWVzdC5cbiAqXG4gKiBUaGUgc2VydmVyIGJpbmRzIGV4Y2x1c2l2ZWx5IHRvIGAxMjcuMC4wLjFgIGFuZCBpcyBuZXZlciBleHBvc2VkIHRvXG4gKiB0aGUgbmV0d29yayBcdTIwMTQgdGhpcyBpcyB0aGUgcHJpbWFyeSBzZWN1cml0eSBib3VuZGFyeS4gVGhlIGFkZGl0aW9uYWxcbiAqIGxheWVycyBiZWxvdyBhcmUgZGVmZW5jZS1pbi1kZXB0aDpcbiAqXG4gKiAtICoqVExTKiogd2l0aCBhIHNlbGYtc2lnbmVkIGNlcnRpZmljYXRlIChnZW5lcmF0ZWQgaW4tbWVtb3J5KVxuICogICBwcmV2ZW50cyBvdGhlciBsb2NhbCBwcm9jZXNzZXMgZnJvbSBwYXNzaXZlbHkgc25pZmZpbmcgdHJhZmZpYy5cbiAqIC0gKipCYXNpYyBwcm94eSBhdXRoZW50aWNhdGlvbioqIHdpdGggcmFuZG9tbHkgZ2VuZXJhdGVkIGNyZWRlbnRpYWxzXG4gKiAgIHByZXZlbnRzIG90aGVyIGxvY2FsIHByb2Nlc3NlcyBmcm9tIGFjdGl2ZWx5IHVzaW5nIHRoZSBwcm94eS5cbiAqIC0gVGhlIGNlcnRpZmljYXRlICoqZmluZ2VycHJpbnQqKiBpcyByZXR1cm5lZCBmcm9tIHtAbGluayBzdGFydH0gc29cbiAqICAgdGhlIGNvbnN1bWVyJ3MgRWxlY3Ryb24gc2Vzc2lvbiBjYW4gcGluIGl0LlxuICpcbiAqIElmIGNlcnRpZmljYXRlIGdlbmVyYXRpb24gb3Igc2VydmVyIHN0YXJ0dXAgZmFpbHMgdGhlIHByb3h5IHNpbXBseVxuICogZG9lcyBub3Qgc3RhcnQgXHUyMDE0IHRoZSB3b3JzdCBvdXRjb21lIGlzIHRoYXQgdGhlIGJyb3dzZXIgdmlldyBmYWxsc1xuICogYmFjayB0byBub3QgaGF2aW5nIHJlbW90ZSBuZXR3b3JrIGFjY2Vzcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFR1bm5lbFByb3h5IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfc2VydmVyOiBodHRwcy5TZXJ2ZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2h0dHA6IHR5cGVvZiBodHRwIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90dW5uZWxBZ2VudDogaHR0cC5BZ2VudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbG9jYWxQb3J0OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9jcmVkZW50aWFsczogeyB1c2VybmFtZTogc3RyaW5nOyBwYXNzd29yZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2V4cGVjdGVkQXV0aEhlYWRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jZXJ0RmluZ2VycHJpbnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogU29ja2V0cyB3ZSB0b29rIG92ZXIgZnJvbSB0aGUgSFRUUFMgc2VydmVyIHZpYSBDT05ORUNULiBPbmNlIHRoZVxuXHQgKiBDT05ORUNUIGhhbmRsZXIgcnVucyB0aGUgc2VydmVyIG5vIGxvbmdlciB0cmFja3MgdGhlbSwgc29cblx0ICogYHNlcnZlci5jbG9zZSgpYCBhbmQgYHNlcnZlci5jbG9zZUFsbENvbm5lY3Rpb25zKClgIHdvbid0IHRlcm1pbmF0ZVxuXHQgKiB0aGVtIFx1MjAxNCB3ZSBoYXZlIHRvIGRlc3Ryb3kgdGhlbSBvdXJzZWx2ZXMgb24gZGlzcG9zZSB0byByZWxlYXNlIHRoZVxuXHQgKiBsaXN0ZW5pbmcgcG9ydCBwcm9tcHRseS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3RTb2NrZXRzID0gbmV3IFNldDxuZXQuU29ja2V0PigpO1xuXG5cdC8qKlxuXHQgKiBUaGUgcmVtb3RlICh0dW5uZWwpIHNpZGUgb2YgZXZlcnkgYWN0aXZlIGJyaWRnZSBcdTIwMTQgYm90aCBDT05ORUNUXG5cdCAqIHR1bm5lbHMgYW5kIHBvb2xlZCBwbGFpbi1IVFRQIHNvY2tldHMuIFdlIGRlc3Ryb3kgdGhlc2UgZXhwbGljaXRseVxuXHQgKiBhbmQgc3luY2hyb25vdXNseSBvbiBkaXNwb3NlIHJhdGhlciB0aGFuIHJlbHlpbmcgb24gdGhlIGxvY2FsXG5cdCAqIHNvY2tldCdzIGFzeW5jIGAnY2xvc2UnYCB0byBwcm9wYWdhdGUgYGVuZCgpYDsgZHVyaW5nIHNoYXJlZC1wcm9jZXNzXG5cdCAqIHRlYXJkb3duIHRoZSBldmVudCBsb29wIG1heSBub3QgZ2V0IGFub3RoZXIgdHVybiB0byBmaXJlIHRoYXRcblx0ICogbGlzdGVuZXIsIHdoaWNoIHdvdWxkIGxlYXZlIHRoZSB1cHN0cmVhbSB0dW5uZWwgc29ja2V0IGRhbmdsaW5nLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVtb3RlU29ja2V0cyA9IG5ldyBTZXQ8RHVwbGV4PigpO1xuXG5cdC8qKlxuXHQgKiBCb3VuZHMgaG93IG1hbnkgdHVubmVscyB3ZSBjcmVhdGUgY29uY3VycmVudGx5IHRocm91Z2ggdGhlIHJlbW90ZVxuXHQgKiBhZ2VudC4gR2F0ZXMgdGhlIHNldHVwIChjb25uZWN0ICsgaGFuZHNoYWtlKSBvbmx5OyBvbmNlIGEgdHVubmVsIGlzXG5cdCAqIGVzdGFibGlzaGVkIHRoZSBzbG90IGlzIHJlbGVhc2VkIGFuZCBkYXRhIHBpcGluZyBwcm9jZWVkcyB1bnRocm90dGxlZC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3RMaW1pdGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IExpbWl0ZXI8QXdhaXRlZDxSZXR1cm5UeXBlPElUdW5uZWxDb25uZWN0Rm4+Pj4oTUFYX0NPTkNVUlJFTlRfVFVOTkVMX0NPTk5FQ1RTKSk7XG5cblx0Z2V0IGxvY2FsUG9ydCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9sb2NhbFBvcnQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0VHVubmVsOiBJVHVubmVsQ29ubmVjdEZuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgc3RhcnQoKTogUHJvbWlzZTxJVHVubmVsUHJveHlJbmZvPiB7XG5cdFx0Y29uc3QgY3J5cHRvID0gYXdhaXQgaW1wb3J0KCdjcnlwdG8nKTtcblx0XHRjb25zdCBodHRwID0gYXdhaXQgaW1wb3J0KCdodHRwJyk7XG5cdFx0Y29uc3QgaHR0cHMgPSBhd2FpdCBpbXBvcnQoJ2h0dHBzJyk7XG5cblx0XHQvLyBHZW5lcmF0ZSByYW5kb20gY3JlZGVudGlhbHNcblx0XHRjb25zdCB1c2VybmFtZSA9IGNyeXB0by5yYW5kb21CeXRlcygxNikudG9TdHJpbmcoJ2hleCcpO1xuXHRcdGNvbnN0IHBhc3N3b3JkID0gY3J5cHRvLnJhbmRvbUJ5dGVzKDMyKS50b1N0cmluZygnaGV4Jyk7XG5cdFx0dGhpcy5fY3JlZGVudGlhbHMgPSB7IHVzZXJuYW1lLCBwYXNzd29yZCB9O1xuXHRcdHRoaXMuX2V4cGVjdGVkQXV0aEhlYWRlciA9ICdCYXNpYyAnICsgQnVmZmVyLmZyb20oYCR7dXNlcm5hbWV9OiR7cGFzc3dvcmR9YCkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuXG5cdFx0Ly8gR2VuZXJhdGUgYSBzZWxmLXNpZ25lZCBjZXJ0aWZpY2F0ZSBpbiBtZW1vcnlcblx0XHRjb25zdCB7IGtleSwgY2VydCwgZmluZ2VycHJpbnQgfSA9IGF3YWl0IGdlbmVyYXRlU2VsZlNpZ25lZENlcnQoKTtcblx0XHR0aGlzLl9jZXJ0RmluZ2VycHJpbnQgPSBmaW5nZXJwcmludDtcblxuXHRcdC8vIENyZWF0ZSBhbiBhZ2VudCB0aGF0IHBvb2xzIHR1bm5lbCBzb2NrZXRzIGJ5IGhvc3Q6cG9ydC5cblx0XHR0aGlzLl9odHRwID0gaHR0cDtcblx0XHR0aGlzLl90dW5uZWxBZ2VudCA9IHRoaXMuX2NyZWF0ZVR1bm5lbEFnZW50KCk7XG5cblx0XHQvLyBIVFRQUyBzZXJ2ZXI6IGhhbmRsZXMgcGxhaW4gSFRUUCByZXF1ZXN0cyAoYWJzb2x1dGUtZm9ybSBVUkxzIGZyb21cblx0XHQvLyBDaHJvbWl1bSB3aGVuIGNvbmZpZ3VyZWQgYXMgYSBwcm94eSkgYW5kIENPTk5FQ1QgdHVubmVscyBmb3IgSFRUUFMuXG5cdFx0Y29uc3Qgc2VydmVyID0gaHR0cHMuY3JlYXRlU2VydmVyKHsga2V5LCBjZXJ0IH0sIChyZXEsIHJlcykgPT4gdGhpcy5fb25SZXF1ZXN0KHJlcSwgcmVzKSk7XG5cdFx0c2VydmVyLm9uKCdjb25uZWN0JywgKHJlcSwgc29ja2V0LCBoZWFkKSA9PiB0aGlzLl9vbkNvbm5lY3QocmVxLCBzb2NrZXQgYXMgbmV0LlNvY2tldCwgaGVhZCkpO1xuXHRcdHNlcnZlci5vbignZXJyb3InLCBlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW1R1bm5lbFByb3h5XSBTZXJ2ZXIgZXJyb3I6JywgZXJyKTtcblx0XHR9KTtcblx0XHR0aGlzLl9zZXJ2ZXIgPSBzZXJ2ZXI7XG5cblx0XHRjb25zdCBwb3J0ID0gYXdhaXQgZmluZEZyZWVQb3J0RmFzdGVyKDAsIDIsIDEwMDAsICcxMjcuMC4wLjEnKTtcblx0XHRzZXJ2ZXIubGlzdGVuKHBvcnQsICcxMjcuMC4wLjEnKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRzZXJ2ZXIub25jZSgnbGlzdGVuaW5nJywgcmVzb2x2ZSk7XG5cdFx0XHRzZXJ2ZXIub25jZSgnZXJyb3InLCByZWplY3QpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGFkZHJlc3MgPSBzZXJ2ZXIuYWRkcmVzcygpIGFzIG5ldC5BZGRyZXNzSW5mbztcblx0XHR0aGlzLl9sb2NhbFBvcnQgPSBhZGRyZXNzLnBvcnQ7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbVHVubmVsUHJveHldIExpc3RlbmluZyBvbiBodHRwczovLzEyNy4wLjAuMToke3RoaXMuX2xvY2FsUG9ydH1gKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHR1cmw6IGBodHRwczovLzEyNy4wLjAuMToke3RoaXMuX2xvY2FsUG9ydH1gLFxuXHRcdFx0aG9zdDogJzEyNy4wLjAuMScsXG5cdFx0XHRwb3J0OiB0aGlzLl9sb2NhbFBvcnQsXG5cdFx0XHRjcmVkZW50aWFsczogdGhpcy5fY3JlZGVudGlhbHMsXG5cdFx0XHRjZXJ0RmluZ2VycHJpbnQ6IHRoaXMuX2NlcnRGaW5nZXJwcmludCxcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBBbnkgdHVubmVscyBzdGlsbCBxdWV1ZWQgYmVoaW5kIHRoZSBsaW1pdGVyIGFyZSBhYmFuZG9uZWQgaGVyZTpcblx0XHQvLyBkaXNwb3NpbmcgdGhlIGxpbWl0ZXIgZHJvcHMgdGhlIG91dHN0YW5kaW5nIHF1ZXVlIHdpdGhvdXQgc2V0dGxpbmdcblx0XHQvLyB0aG9zZSBwcm9taXNlcywgc28gdGhlaXIgYXdhaXRpbmcgYF9vbkNvbm5lY3RgL2BfY3JlYXRlVHVubmVsU29ja2V0YFxuXHRcdC8vIG5ldmVyIHJlc3VtZXMuIFRoYXQncyBmaW5lIFx1MjAxNCB3ZSBkZXN0cm95IGV2ZXJ5IHNvY2tldCBiZWxvdywgYW5kIHRoZVxuXHRcdC8vIGxvY2FsIHNvY2tldHMgdGhvc2UgaGFuZGxlcnMgd291bGQgaGF2ZSBzZXJ2ZWQgYXJlIHRvcm4gZG93biB0b28sIHNvXG5cdFx0Ly8gbm90aGluZyBpcyBsZWZ0IHdhaXRpbmcgb24gYSB0dW5uZWwgdGhhdCB3aWxsIG5ldmVyIGFycml2ZS5cblx0XHRmb3IgKGNvbnN0IHNvY2tldCBvZiB0aGlzLl9jb25uZWN0U29ja2V0cykge1xuXHRcdFx0c29ja2V0LmRlc3Ryb3koKTtcblx0XHR9XG5cdFx0dGhpcy5fY29ubmVjdFNvY2tldHMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHNvY2tldCBvZiB0aGlzLl9yZW1vdGVTb2NrZXRzKSB7XG5cdFx0XHRzb2NrZXQuZGVzdHJveSgpO1xuXHRcdH1cblx0XHR0aGlzLl9yZW1vdGVTb2NrZXRzLmNsZWFyKCk7XG5cdFx0dGhpcy5fdHVubmVsQWdlbnQ/LmRlc3Ryb3koKTtcblx0XHR0aGlzLl9zZXJ2ZXI/LmNsb3NlQWxsQ29ubmVjdGlvbnMoKTtcblx0XHR0aGlzLl9zZXJ2ZXI/LmNsb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFZlcmlmeSB0aGUgYFByb3h5LUF1dGhvcml6YXRpb25gIGhlYWRlciBhZ2FpbnN0IG91ciBjcmVkZW50aWFscy5cblx0ICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHJlcXVlc3QgaXMgYXV0aG9yaXplZC5cblx0ICovXG5cdHByaXZhdGUgX2NoZWNrQXV0aChhdXRoSGVhZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gYXV0aEhlYWRlciA9PT0gdGhpcy5fZXhwZWN0ZWRBdXRoSGVhZGVyO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhbiBgaHR0cC5BZ2VudGAgdGhhdCBwb29scyB0dW5uZWwgc29ja2V0cyBieSB0YXJnZXRcblx0ICogaG9zdDpwb3J0LiBOb2RlIGNhbGxzIGBjcmVhdGVDb25uZWN0aW9uYCBvbmx5IHdoZW4gbm8gcG9vbGVkIHNvY2tldFxuXHQgKiBpcyBhdmFpbGFibGUgZm9yIHRoZSB0YXJnZXQ7IG90aGVyd2lzZSBpdCByZXVzZXMgYW4gZXhpc3Rpbmcgb25lLlxuXHQgKi9cblx0cHJpdmF0ZSBfY3JlYXRlVHVubmVsQWdlbnQoKTogaHR0cC5BZ2VudCB7XG5cdFx0aWYgKCF0aGlzLl9odHRwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0hUVFAgbW9kdWxlIG5vdCBpbml0aWFsaXplZCcpO1xuXHRcdH1cblx0XHRjb25zdCBhZ2VudCA9IG5ldyB0aGlzLl9odHRwLkFnZW50KHsga2VlcEFsaXZlOiB0cnVlIH0pO1xuXHRcdGFnZW50LmNyZWF0ZUNvbm5lY3Rpb24gPSAob3B0aW9ucywgb25jcmVhdGUpID0+IHtcblx0XHRcdGNvbnN0IGhvc3QgPSBvcHRpb25zLmhvc3RuYW1lIHx8IG9wdGlvbnMuaG9zdCB8fCAnJztcblx0XHRcdGNvbnN0IHBvcnQgPSBOdW1iZXIob3B0aW9ucy5wb3J0KSB8fCA4MDtcblx0XHRcdHRoaXMuX2NyZWF0ZVR1bm5lbFNvY2tldChob3N0LCBwb3J0KVxuXHRcdFx0XHQudGhlbihzb2NrZXQgPT4gb25jcmVhdGU/LihudWxsLCBzb2NrZXQpKVxuXHRcdFx0XHQuY2F0Y2goZXJyID0+IG9uY3JlYXRlPy4oZXJyLCBudWxsISkpO1xuXHRcdH07XG5cdFx0cmV0dXJuIGFnZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIERyb3AgZXZlcnkgcG9vbGVkIGtlZXAtYWxpdmUgdHVubmVsIHNvY2tldCBieSByZWNyZWF0aW5nIHRoZVxuXHQgKiBhZ2VudC4gQ2FsbGVkIHdoZW4gdGhlIHVwc3RyZWFtIHR1bm5lbCBlbmRwb2ludCBjaGFuZ2VzOiB0aGUgcG9vbGVkXG5cdCAqIHNvY2tldHMgYWxsIGRpYWwgdGhlIG5vdy1zdGFsZSBlbmRwb2ludCwgc28gdGhleSB3b3VsZCBiZSByZXNldCBlblxuXHQgKiBtYXNzZSBvbmNlIGl0IGdvZXMgYXdheS4gUmVjcmVhdGluZyB0aGUgYWdlbnQgY2xvc2VzIHRoZSBpZGxlIG9uZXNcblx0ICogZ3JhY2VmdWxseSBhbmQgZm9yY2VzIHN1YnNlcXVlbnQgcmVxdWVzdHMgdG8gZGlhbCB0aGUgbmV3IGVuZHBvaW50LlxuXHQgKi9cblx0ZHJhaW5Db25uZWN0aW9uUG9vbCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3R1bm5lbEFnZW50KSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vdCBzdGFydGVkIHlldDsgbm90aGluZyBwb29sZWRcblx0XHR9XG5cdFx0Y29uc3Qgb2xkQWdlbnQgPSB0aGlzLl90dW5uZWxBZ2VudDtcblx0XHR0aGlzLl90dW5uZWxBZ2VudCA9IHRoaXMuX2NyZWF0ZVR1bm5lbEFnZW50KCk7XG5cdFx0b2xkQWdlbnQ/LmRlc3Ryb3koKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbVHVubmVsUHJveHldIFVwc3RyZWFtIGVuZHBvaW50IGNoYW5nZWQ7IGRyYWluZWQgcG9vbGVkIHR1bm5lbCBzb2NrZXRzJyk7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlIEhUVFAgQ09OTkVDVCByZXF1ZXN0cyAodXNlZCBmb3IgSFRUUFMgdHVubmVsaW5nKS5cblx0ICogUGFyc2VzIGBob3N0OnBvcnRgIGZyb20gdGhlIHJlcXVlc3QgVVJMLCBlc3RhYmxpc2hlcyBhIHR1bm5lbFxuXHQgKiB0aHJvdWdoIHRoZSByZW1vdGUgYWdlbnQsIGFuZCBwaXBlcyB0aGUgc29ja2V0cyB0b2dldGhlci5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX29uQ29ubmVjdChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCBzb2NrZXQ6IG5ldC5Tb2NrZXQsIGhlYWQ6IEJ1ZmZlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFRyYWNrIHRoZSBzb2NrZXQgZnJvbSB0aGUgbW9tZW50IHRoZSBDT05ORUNUIGV2ZW50IGZpcmVzIHNvXG5cdFx0Ly8gZGlzcG9zZSBjYW4gdGVhciBpdCBkb3duIGV2ZW4gYmVmb3JlIHRoZSB1cHN0cmVhbSB0dW5uZWxcblx0XHQvLyByZXR1cm5zIChvciBpZiBhdXRoL2hvc3QgdmFsaWRhdGlvbiBmYWlscykuIFRoZSBjbG9zZSBsaXN0ZW5lclxuXHRcdC8vIGF1dG8tcmVtb3ZlcyB3aGV0aGVyIHdlIGNsb3NlIGl0IGhlcmUgb3IgbGF0ZXIuXG5cdFx0dGhpcy5fY29ubmVjdFNvY2tldHMuYWRkKHNvY2tldCk7XG5cdFx0c29ja2V0Lm9uKCdjbG9zZScsICgpID0+IHRoaXMuX2Nvbm5lY3RTb2NrZXRzLmRlbGV0ZShzb2NrZXQpKTtcblxuXHRcdGlmICghdGhpcy5fY2hlY2tBdXRoKHJlcS5oZWFkZXJzWydwcm94eS1hdXRob3JpemF0aW9uJ10pKSB7XG5cdFx0XHRzb2NrZXQud3JpdGUoXG5cdFx0XHRcdCdIVFRQLzEuMSA0MDcgUHJveHkgQXV0aGVudGljYXRpb24gUmVxdWlyZWRcXHJcXG4nICtcblx0XHRcdFx0J1Byb3h5LUF1dGhlbnRpY2F0ZTogQmFzaWMgcmVhbG09XCJUdW5uZWxQcm94eVwiXFxyXFxuJyArXG5cdFx0XHRcdCdcXHJcXG4nXG5cdFx0XHQpO1xuXHRcdFx0c29ja2V0LmVuZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgaG9zdCwgcG9ydCB9ID0gdGhpcy5fcGFyc2VIb3N0UG9ydChyZXEudXJsID8/ICcnLCA0NDMpO1xuXHRcdGlmICghaG9zdCkge1xuXHRcdFx0c29ja2V0LndyaXRlKCdIVFRQLzEuMSA0MDAgQmFkIFJlcXVlc3RcXHJcXG5cXHJcXG4nKTtcblx0XHRcdHNvY2tldC5lbmQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbVHVubmVsUHJveHldIENPTk5FQ1QgJHtob3N0fToke3BvcnR9YCk7XG5cblx0XHR0cnkge1xuXHRcdFx0c29ja2V0LnBhdXNlKCk7XG5cblx0XHRcdGNvbnN0IHByb3RvY29sID0gYXdhaXQgdGhpcy5fY29ubmVjdExpbWl0ZXIucXVldWUoKCkgPT4gdGhpcy5fY29ubmVjdFR1bm5lbChob3N0LCBwb3J0KSk7XG5cdFx0XHRjb25zdCB7IHN0cmVhbTogcmVtb3RlU29ja2V0LCBsZWZ0b3ZlciB9ID0gdGhpcy5fdGFrZVJlbW90ZVN0cmVhbShwcm90b2NvbCk7XG5cblx0XHRcdHNvY2tldC53cml0ZSgnSFRUUC8xLjEgMjAwIENvbm5lY3Rpb24gRXN0YWJsaXNoZWRcXHJcXG5cXHJcXG4nKTtcblxuXHRcdFx0aWYgKGxlZnRvdmVyLmJ5dGVMZW5ndGggPiAwKSB7XG5cdFx0XHRcdHNvY2tldC53cml0ZShsZWZ0b3Zlci5idWZmZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaGVhZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlbW90ZVNvY2tldC53cml0ZShoZWFkKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fYnJpZGdlU29ja2V0cyhzb2NrZXQsIHJlbW90ZVNvY2tldCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbVHVubmVsUHJveHldIEZhaWxlZCB0byB0dW5uZWwgdG8gJHtob3N0fToke3BvcnR9OmAsIGVycik7XG5cdFx0XHRzb2NrZXQud3JpdGUoJ0hUVFAvMS4xIDUwMiBCYWQgR2F0ZXdheVxcclxcblxcclxcbicpO1xuXHRcdFx0c29ja2V0LmVuZCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGUgcGxhaW4gSFRUUCByZXF1ZXN0cyAoR0VULCBQT1NULCBldGMuIHdpdGggYWJzb2x1dGUgVVJMcykuXG5cdCAqXG5cdCAqIENocm9taXVtIHNlbmRzIHByb3hpZWQgSFRUUCByZXF1ZXN0cyB3aXRoIGFic29sdXRlLWZvcm0gVVJMc1xuXHQgKiAoZS5nLiBgR0VUIGh0dHA6Ly9leGFtcGxlLmNvbS9wYWdlIEhUVFAvMS4xYCkgYW5kIHJldXNlcyBrZWVwLWFsaXZlXG5cdCAqIGNvbm5lY3Rpb25zIHRvIHRoZSBwcm94eSBmb3IgcmVxdWVzdHMgdG8gKipkaWZmZXJlbnQqKiBob3N0cy5cblx0ICpcblx0ICogRWFjaCByZXF1ZXN0IGlzIGZvcndhcmRlZCB2aWEgYGh0dHAucmVxdWVzdGAgdXNpbmcgYSBzaGFyZWRcblx0ICogYGh0dHAuQWdlbnRgIHRoYXQgcG9vbHMgdHVubmVsIHNvY2tldHMgYnkgaG9zdDpwb3J0LiBUaGUgYWdlbnRcblx0ICogY2FsbHMgYF9jcmVhdGVUdW5uZWxTb2NrZXRgIG9ubHkgd2hlbiBubyBwb29sZWQgc29ja2V0IGlzIGF2YWlsYWJsZTtcblx0ICogb3RoZXJ3aXNlIGl0IHJldXNlcyBhbiBleGlzdGluZyB0dW5uZWwgY29ubmVjdGlvbi5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX29uUmVxdWVzdChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2NoZWNrQXV0aChyZXEuaGVhZGVyc1sncHJveHktYXV0aG9yaXphdGlvbiddKSkge1xuXHRcdFx0cmVzLndyaXRlSGVhZCg0MDcsIHsgJ1Byb3h5LUF1dGhlbnRpY2F0ZSc6ICdCYXNpYyByZWFsbT1cIlR1bm5lbFByb3h5XCInIH0pO1xuXHRcdFx0cmVzLmVuZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBwYXJzZWQ6IFVSTDtcblx0XHR0cnkge1xuXHRcdFx0cGFyc2VkID0gbmV3IFVSTChyZXEudXJsID8/ICcnKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJlcy53cml0ZUhlYWQoNDAwKTtcblx0XHRcdHJlcy5lbmQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBQbGFpbiBIVFRQIGZvcndhcmRpbmcgb25seSBcdTIwMTQgSFRUUFMgZ29lcyB0aHJvdWdoIENPTk5FQ1QuXG5cdFx0Ly8gSW4gcHJhY3RpY2UgZXZlcnkgSFRUUC8xLjEgY2xpZW50IChicm93c2VycyBpbmNsdWRlZCkgdXNlc1xuXHRcdC8vIENPTk5FQ1QgZm9yIEhUVFBTIHZpYSBhIHByb3h5LCBzbyBhbiBhYnNvbHV0ZS1mb3JtIGBodHRwczpgXG5cdFx0Ly8gVVJMIGhlcmUgc2hvdWxkIG5ldmVyIGhhcHBlbi4gUmVqZWN0IGxvdWRseSByYXRoZXIgdGhhblxuXHRcdC8vIHNpbGVudGx5IG1pc2ZvcndhcmQgaXQgYXMgcGxhaW50ZXh0IChgaHR0cC5yZXF1ZXN0YCB0byBlaXRoZXJcblx0XHQvLyB0aGUgVVJMJ3MgcG9ydCBvciBkZWZhdWx0IDgwIHdvdWxkIHByb2R1Y2UgY29uZnVzaW5nIGZhaWx1cmVzXG5cdFx0Ly8gb3Igd3JvbmcgY29udGVudCkuXG5cdFx0aWYgKHBhcnNlZC5wcm90b2NvbCAhPT0gJ2h0dHA6Jykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbVHVubmVsUHJveHldIFJlamVjdGluZyBub24tSFRUUCBmb3J3YXJkZWQgcmVxdWVzdDogJHtyZXEubWV0aG9kfSAke3JlcS51cmx9YCk7XG5cdFx0XHRyZXMud3JpdGVIZWFkKDQwMCk7XG5cdFx0XHRyZXMuZW5kKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaG9zdCA9IHBhcnNlZC5ob3N0bmFtZTtcblx0XHRjb25zdCBwb3J0ID0gcGFyc2VJbnQocGFyc2VkLnBvcnQsIDEwKSB8fCA4MDtcblxuXHRcdGlmICghaG9zdCkge1xuXHRcdFx0cmVzLndyaXRlSGVhZCg0MDApO1xuXHRcdFx0cmVzLmVuZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtUdW5uZWxQcm94eV0gJHtyZXEubWV0aG9kfSAke2hvc3R9OiR7cG9ydH0ke3BhcnNlZC5wYXRobmFtZX1gKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBodHRwID0gYXdhaXQgaW1wb3J0KCdodHRwJyk7XG5cdFx0XHRjb25zdCBwYXRoID0gcGFyc2VkLnBhdGhuYW1lICsgcGFyc2VkLnNlYXJjaDtcblx0XHRcdGNvbnN0IGhlYWRlcnMgPSB7IC4uLnJlcS5oZWFkZXJzIH07XG5cblx0XHRcdC8vIFN0cmlwIGhvcC1ieS1ob3AgaGVhZGVycyBwZXIgUkZDIDkxMTAgU2VjdGlvbiA3LjYuMS5cblx0XHRcdC8vIEFuIGludGVybWVkaWFyeSBNVVNUIHBhcnNlIHRoZSBDb25uZWN0aW9uIGhlYWRlciBhbmQgcmVtb3ZlIGFueVxuXHRcdFx0Ly8gZmllbGRzIG5hbWVkIGluIGl0LCB0aGVuIHJlbW92ZSBDb25uZWN0aW9uIGl0c2VsZi4gSXQgU0hPVUxEXG5cdFx0XHQvLyBhbHNvIHJlbW92ZSBvdGhlciBrbm93biBob3AtYnktaG9wIGhlYWRlcnMuXG5cdFx0XHRjb25zdCBjb25uZWN0aW9uVG9rZW5zID0gKGhlYWRlcnNbJ2Nvbm5lY3Rpb24nXSA/PyAnJylcblx0XHRcdFx0LnRvU3RyaW5nKClcblx0XHRcdFx0LnNwbGl0KCcsJylcblx0XHRcdFx0Lm1hcCh0ID0+IHQudHJpbSgpLnRvTG93ZXJDYXNlKCkpXG5cdFx0XHRcdC5maWx0ZXIodCA9PiB0Lmxlbmd0aCA+IDApO1xuXHRcdFx0Zm9yIChjb25zdCB0b2tlbiBvZiBjb25uZWN0aW9uVG9rZW5zKSB7XG5cdFx0XHRcdGRlbGV0ZSBoZWFkZXJzW3Rva2VuXTtcblx0XHRcdH1cblx0XHRcdGRlbGV0ZSBoZWFkZXJzWydjb25uZWN0aW9uJ107XG5cdFx0XHRkZWxldGUgaGVhZGVyc1sna2VlcC1hbGl2ZSddO1xuXHRcdFx0ZGVsZXRlIGhlYWRlcnNbJ3Byb3h5LWF1dGhvcml6YXRpb24nXTtcblx0XHRcdGRlbGV0ZSBoZWFkZXJzWydwcm94eS1jb25uZWN0aW9uJ107XG5cdFx0XHRkZWxldGUgaGVhZGVyc1sndGUnXTtcblx0XHRcdGRlbGV0ZSBoZWFkZXJzWyd0cmFuc2Zlci1lbmNvZGluZyddO1xuXHRcdFx0ZGVsZXRlIGhlYWRlcnNbJ3VwZ3JhZGUnXTtcblxuXHRcdFx0Y29uc3QgcHJveHlSZXEgPSBodHRwLnJlcXVlc3Qoe1xuXHRcdFx0XHRhZ2VudDogdGhpcy5fdHVubmVsQWdlbnQsXG5cdFx0XHRcdGhvc3RuYW1lOiBob3N0LFxuXHRcdFx0XHRwb3J0LFxuXHRcdFx0XHRwYXRoLFxuXHRcdFx0XHRtZXRob2Q6IHJlcS5tZXRob2QsXG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHR9LCBwcm94eVJlcyA9PiB7XG5cdFx0XHRcdHJlcy53cml0ZUhlYWQocHJveHlSZXMuc3RhdHVzQ29kZSEsIHByb3h5UmVzLmhlYWRlcnMpO1xuXHRcdFx0XHRwcm94eVJlcy5waXBlKHJlcyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cHJveHlSZXEub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW1R1bm5lbFByb3h5XSBQcm94eSByZXF1ZXN0IGVycm9yIGZvciAke2hvc3R9OiR7cG9ydH06YCwgZXJyKTtcblx0XHRcdFx0Ly8gUmVzZXQgdGhlIGNsaWVudCBjb25uZWN0aW9uIGluc3RlYWQgb2YgcmV0dXJuaW5nIGEgNTAyIGJvZHkuXG5cdFx0XHRcdC8vIENocm9taXVtIHJlbmRlcnMgYSA1MDIgYm9keSBhcyBhIHBhZ2UsIHdoZXJlYXMgYSB0cmFuc3BvcnRcblx0XHRcdFx0Ly8gcmVzZXQgdHJpZ2dlcnMgYGRpZC1mYWlsLWxvYWRgLCBzbyB0aGUgYnJvd3NlciBzaG93cyBpdHNcblx0XHRcdFx0Ly8gbmF0aXZlIFwiZmFpbGVkIHRvIGxvYWRcIiBlcnJvciBwYWdlIChjb25zaXN0ZW50IHdpdGggdGhlXG5cdFx0XHRcdC8vIEhUVFBTL0NPTk5FQ1QgcGF0aCkuXG5cdFx0XHRcdHJlcy5kZXN0cm95KCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmVxLnBpcGUocHJveHlSZXEpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW1R1bm5lbFByb3h5XSBGYWlsZWQgdG8gdHVubmVsIHRvICR7aG9zdH06JHtwb3J0fTpgLCBlcnIpO1xuXHRcdFx0Ly8gUmVzZXQgdGhlIGNsaWVudCBjb25uZWN0aW9uIHNvIHRoZSBicm93c2VyIHNob3dzIGl0cyBuYXRpdmVcblx0XHRcdC8vIFwiZmFpbGVkIHRvIGxvYWRcIiBwYWdlIHJhdGhlciB0aGFuIHJlbmRlcmluZyBhbiBIVFRQIGVycm9yLlxuXHRcdFx0cmVzLmRlc3Ryb3koKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgYG5ldC5Tb2NrZXRgLWNvbXBhdGlibGUgc3RyZWFtIGJhY2tlZCBieSBhIHJlbW90ZSBhZ2VudFxuXHQgKiB0dW5uZWwuIENhbGxlZCBieSB0aGUgYGh0dHAuQWdlbnRgIHdoZW4gaXQgbmVlZHMgYSBuZXcgY29ubmVjdGlvblxuXHQgKiB0byBhIGdpdmVuIGhvc3Q6cG9ydCAoaS5lLiBubyBwb29sZWQgc29ja2V0IGlzIGF2YWlsYWJsZSkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVUdW5uZWxTb2NrZXQoaG9zdDogc3RyaW5nLCBwb3J0OiBudW1iZXIpOiBQcm9taXNlPER1cGxleD4ge1xuXHRcdC8vIFRoZSBjb25uZWN0IGZ1bmN0aW9uIHJlc29sdmVzIG9ubHkgb25jZSB0aGUgcmVtb3RlIGhhcyBjb25maXJtZWQgdGhlXG5cdFx0Ly8gdGFyZ2V0IGlzIHJlYWNoYWJsZSAodmlhIHRoZSB0dW5uZWwgaGFuZHNoYWtlKSBhbmQgcmVqZWN0cyBvdGhlcndpc2UuXG5cdFx0Ly8gQSByZWplY3Rpb24gaGVyZSBsZXRzIHRoZSBodHRwLkFnZW50IGZhaWwgdGhlIHJlcXVlc3QgKHRoZSBjbGllbnRcblx0XHQvLyBjb25uZWN0aW9uIGlzIHJlc2V0KSByYXRoZXIgdGhhbiBoYW5naW5nIG9yIHNpbGVudGx5IHJldHVybmluZ1xuXHRcdC8vIG5vdGhpbmcuXG5cdFx0Y29uc3QgcHJvdG9jb2wgPSBhd2FpdCB0aGlzLl9jb25uZWN0TGltaXRlci5xdWV1ZSgoKSA9PiB0aGlzLl9jb25uZWN0VHVubmVsKGhvc3QsIHBvcnQpKTtcblx0XHRjb25zdCB7IHN0cmVhbTogdHVubmVsU3RyZWFtLCBsZWZ0b3ZlciB9ID0gdGhpcy5fdGFrZVJlbW90ZVN0cmVhbShwcm90b2NvbCk7XG5cblx0XHR0aGlzLl90cmFja1JlbW90ZVNvY2tldCh0dW5uZWxTdHJlYW0pO1xuXG5cdFx0aWYgKGxlZnRvdmVyLmJ5dGVMZW5ndGggPiAwKSB7XG5cdFx0XHR0dW5uZWxTdHJlYW0udW5zaGlmdChsZWZ0b3Zlci5idWZmZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0dW5uZWxTdHJlYW07XG5cdH1cblxuXHQvKipcblx0ICogVGFrZSBvd25lcnNoaXAgb2YgYSBmcmVzaGx5LWNvbm5lY3RlZCB0dW5uZWwncyB0cmFuc3BvcnQgYXMgYSBOb2RlXG5cdCAqIHtAbGluayBEdXBsZXh9IHN0cmVhbSwgdG9nZXRoZXIgd2l0aCBhbnkgYnl0ZXMgdGhlIHByb3RvY29sIGFscmVhZHlcblx0ICogYnVmZmVyZWQgZHVyaW5nIHRoZSBoYW5kc2hha2UgKHRoZSBjYWxsZXIgcm91dGVzIHRoYXQgbGVmdG92ZXIgdG8gdGhlXG5cdCAqIGFwcHJvcHJpYXRlIHNpZGUpLlxuXHQgKlxuXHQgKiBUd28gdHJhbnNwb3J0cyBvY2N1ciBpbiBwcmFjdGljZTpcblx0ICogLSB7QGxpbmsgTm9kZVNvY2tldH0gKGNsYXNzaWMvd2Vic29ja2V0IHNlcnZlcik6IHVud3JhcCB0aGUgcmF3XG5cdCAqICAgYG5ldC5Tb2NrZXRgIHNvIHdlIGNhbiByZWx5IG9uIE5vZGUncyBuYXRpdmUgc3RyZWFtIGJhY2twcmVzc3VyZSAodmlhXG5cdCAqICAgYHBpcGUoKWAgYW5kIHRoZSBrZWVwLWFsaXZlIGBodHRwLkFnZW50YCkuXG5cdCAqIC0gYSBnZW5lcmljIHtAbGluayBJU29ja2V0fSAobWFuYWdlZCAvIGV4ZWMtc2VydmVyIGNvbm5lY3Rpb24pOiB0aGVyZSBpc1xuXHQgKiAgIG5vIGBuZXQuU29ja2V0YCB1bmRlcm5lYXRoLCBzbyBhZGFwdCB0aGUgbWVzc2FnZS1wYXNzaW5nIHNvY2tldCB0byBhXG5cdCAqICAge0BsaW5rIER1cGxleH0gKHtAbGluayBSZW1vdGVTb2NrZXRTdHJlYW19KS5cblx0ICovXG5cdHByaXZhdGUgX3Rha2VSZW1vdGVTdHJlYW0ocHJvdG9jb2w6IHsgZ2V0U29ja2V0KCk6IElTb2NrZXQ7IHJlYWRFbnRpcmVCdWZmZXIoKTogVlNCdWZmZXI7IGRpc3Bvc2UoKTogdm9pZCB9KTogeyBzdHJlYW06IER1cGxleDsgbGVmdG92ZXI6IFZTQnVmZmVyIH0ge1xuXHRcdGNvbnN0IHJlbW90ZVNvY2tldCA9IHByb3RvY29sLmdldFNvY2tldCgpO1xuXG5cdFx0aWYgKHJlbW90ZVNvY2tldCBpbnN0YW5jZW9mIE5vZGVTb2NrZXQpIHtcblx0XHRcdC8vIFRha2Ugb3duZXJzaGlwIG9mIHRoZSByYXcgc29ja2V0LCBkZXRhY2hpbmcgTm9kZVNvY2tldCdzIG93blxuXHRcdFx0Ly8gbGlzdGVuZXJzLiBOb2RlU29ja2V0IGluc3RhbGxzIGFuICdlcnJvcicgbGlzdGVuZXIgdGhhdCByb3V0ZXNcblx0XHRcdC8vIGV2ZXJ5IG5vbi1FUElQRSBlcnJvciB0aHJvdWdoIG9uVW5leHBlY3RlZEVycm9yLCB3aGljaCB0aGUgaG9zdFxuXHRcdFx0Ly8gcHJvY2VzcyBsb2dzIGFzIGFuIFwidW5jYXVnaHQgZXhjZXB0aW9uXCIuIFdoZW4gdGhlIHVwc3RyZWFtIHR1bm5lbFxuXHRcdFx0Ly8gZW5kcG9pbnQgZGllcywgZXZlcnkgcG9vbGVkL2FjdGl2ZSB0dW5uZWwgc29ja2V0IGlzIHJlc2V0IGF0IG9uY2Vcblx0XHRcdC8vIC0gdGhhdCBFQ09OTlJFU0VUIGlzIGV4cGVjdGVkIHRlYXJkb3duIGhlcmUsIG5vdCBhbiB1bmV4cGVjdGVkXG5cdFx0XHQvLyBlcnJvci4gV2UgYnJpZGdlIHRoZSByYXcgc29ja2V0IG91cnNlbHZlcyAoYXR0YWNoaW5nIG91ciBvd25cblx0XHRcdC8vICdlcnJvcicgaGFuZGxlcnMpLCBzbyBOb2RlU29ja2V0J3Mgcm91dGluZyBtdXN0IGJlIHJlbW92ZWQuXG5cdFx0XHRjb25zdCBzb2NrZXQgPSByZW1vdGVTb2NrZXQuc29ja2V0O1xuXHRcdFx0Y29uc3QgbGVmdG92ZXIgPSBwcm90b2NvbC5yZWFkRW50aXJlQnVmZmVyKCk7XG5cdFx0XHRyZW1vdGVTb2NrZXQuZGlzcG9zZShmYWxzZSk7XG5cdFx0XHRwcm90b2NvbC5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4geyBzdHJlYW06IHNvY2tldCwgbGVmdG92ZXIgfTtcblx0XHR9XG5cblx0XHQvLyBHZW5lcmljIElTb2NrZXQgKGUuZy4gYSBtYW5hZ2VkL2V4ZWMtc2VydmVyIGNvbm5lY3Rpb24pLiBSZWFkIHRoZVxuXHRcdC8vIGJ1ZmZlcmVkIGxlZnRvdmVyIGFuZCBkZXRhY2ggdGhlIHByb3RvY29sJ3MgcmVhZGVyL3dyaXRlciBiZWZvcmUgdGhlXG5cdFx0Ly8gYWRhcHRlciBzdGFydHMgY29uc3VtaW5nIHRoZSBzb2NrZXQsIHNvIHN1YnNlcXVlbnQgbWVzc2FnZXMgcmVhY2ggdGhlXG5cdFx0Ly8gYWRhcHRlciBleGFjdGx5IG9uY2UuIFRoaXMgYWxsIHJ1bnMgc3luY2hyb25vdXNseSwgc28gbm8gbWVzc2FnZSBjYW5cblx0XHQvLyBhcnJpdmUgaW4gdGhlIGdhcCBhbmQgYmUgbG9zdC5cblx0XHRjb25zdCBsZWZ0b3ZlciA9IHByb3RvY29sLnJlYWRFbnRpcmVCdWZmZXIoKTtcblx0XHRwcm90b2NvbC5kaXNwb3NlKCk7XG5cdFx0cmV0dXJuIHsgc3RyZWFtOiBuZXcgUmVtb3RlU29ja2V0U3RyZWFtKHJlbW90ZVNvY2tldCksIGxlZnRvdmVyIH07XG5cdH1cblxuXHQvKipcblx0ICogUGFyc2UgYSBgaG9zdDpwb3J0YCBzdHJpbmcuIEZhbGxzIGJhY2sgdG8gYGRlZmF1bHRQb3J0YCB3aGVuIHRoZVxuXHQgKiBwb3J0IGNvbXBvbmVudCBpcyBtaXNzaW5nLiBSZXR1cm5zIGFuIGVtcHR5IGhvc3Qgd2hlbiB0aGUgYWRkcmVzc1xuXHQgKiBpcyBlbXB0eSBvciB0aGUgcG9ydCBpcyBvdXRzaWRlIHRoZSB2YWxpZCBUQ1AgcmFuZ2UgKDEtNjU1MzUpLCBwZXJcblx0ICogUkZDIDkxMTAgc2VjdGlvbiA5LjMuNiAoXCJBIHNlcnZlciBNVVNUIHJlamVjdCBhIENPTk5FQ1QgcmVxdWVzdCB0aGF0XG5cdCAqIHRhcmdldHMgYW4gZW1wdHkgb3IgaW52YWxpZCBwb3J0IG51bWJlclwiKS5cblx0ICovXG5cdHByaXZhdGUgX3BhcnNlSG9zdFBvcnQoYWRkcmVzczogc3RyaW5nLCBkZWZhdWx0UG9ydDogbnVtYmVyKTogeyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9IHtcblx0XHRsZXQgaG9zdDogc3RyaW5nO1xuXHRcdGxldCBwb3J0OiBudW1iZXI7XG5cblx0XHQvLyBIYW5kbGUgSVB2NiBicmFja2V0IG5vdGF0aW9uIFs6OjFdOnBvcnRcblx0XHRjb25zdCBicmFja2V0TWF0Y2ggPSAvXlxcWyg/PGhvc3Q+W15cXF1dKylcXF06KD88cG9ydD5cXGQrKSQvLmV4ZWMoYWRkcmVzcyk7XG5cdFx0aWYgKGJyYWNrZXRNYXRjaD8uZ3JvdXBzKSB7XG5cdFx0XHRob3N0ID0gYnJhY2tldE1hdGNoLmdyb3Vwc1snaG9zdCddO1xuXHRcdFx0cG9ydCA9IHBhcnNlSW50KGJyYWNrZXRNYXRjaC5ncm91cHNbJ3BvcnQnXSwgMTApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBicmFja2V0T25seSA9IC9eXFxbKD88aG9zdD5bXlxcXV0rKVxcXSQvLmV4ZWMoYWRkcmVzcyk7XG5cdFx0XHRpZiAoYnJhY2tldE9ubHk/Lmdyb3Vwcykge1xuXHRcdFx0XHRob3N0ID0gYnJhY2tldE9ubHkuZ3JvdXBzWydob3N0J107XG5cdFx0XHRcdHBvcnQgPSBkZWZhdWx0UG9ydDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGxhc3RDb2xvbiA9IGFkZHJlc3MubGFzdEluZGV4T2YoJzonKTtcblx0XHRcdFx0aWYgKGxhc3RDb2xvbiA9PT0gLTEpIHtcblx0XHRcdFx0XHRob3N0ID0gYWRkcmVzcztcblx0XHRcdFx0XHRwb3J0ID0gZGVmYXVsdFBvcnQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgbWF5YmVQb3J0ID0gcGFyc2VJbnQoYWRkcmVzcy5zdWJzdHJpbmcobGFzdENvbG9uICsgMSksIDEwKTtcblx0XHRcdFx0XHRpZiAoaXNOYU4obWF5YmVQb3J0KSkge1xuXHRcdFx0XHRcdFx0Ly8gTGlrZWx5IGFuIElQdjYgYWRkcmVzcyB3aXRob3V0IGJyYWNrZXRzXG5cdFx0XHRcdFx0XHRob3N0ID0gYWRkcmVzcztcblx0XHRcdFx0XHRcdHBvcnQgPSBkZWZhdWx0UG9ydDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aG9zdCA9IGFkZHJlc3Muc3Vic3RyaW5nKDAsIGxhc3RDb2xvbik7XG5cdFx0XHRcdFx0XHRwb3J0ID0gbWF5YmVQb3J0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFZhbGlkYXRlIHBvcnQgcmFuZ2Vcblx0XHRpZiAocG9ydCA8IDEgfHwgcG9ydCA+IDY1NTM1KSB7XG5cdFx0XHRyZXR1cm4geyBob3N0OiAnJywgcG9ydDogMCB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGhvc3QsIHBvcnQgfTtcblx0fVxuXG5cdHByaXZhdGUgX2JyaWRnZVNvY2tldHMobG9jYWxTb2NrZXQ6IG5ldC5Tb2NrZXQsIHJlbW90ZVNvY2tldDogRHVwbGV4KTogdm9pZCB7XG5cdFx0dGhpcy5fdHJhY2tSZW1vdGVTb2NrZXQocmVtb3RlU29ja2V0KTtcblx0XHRyZW1vdGVTb2NrZXQub24oJ2VuZCcsICgpID0+IGxvY2FsU29ja2V0LmVuZCgpKTtcblx0XHRyZW1vdGVTb2NrZXQub24oJ2Nsb3NlJywgKCkgPT4gbG9jYWxTb2NrZXQuZW5kKCkpO1xuXHRcdHJlbW90ZVNvY2tldC5vbignZXJyb3InLCAoKSA9PiBsb2NhbFNvY2tldC5kZXN0cm95KCkpO1xuXHRcdGxvY2FsU29ja2V0Lm9uKCdlbmQnLCAoKSA9PiByZW1vdGVTb2NrZXQuZW5kKCkpO1xuXHRcdGxvY2FsU29ja2V0Lm9uKCdjbG9zZScsICgpID0+IHJlbW90ZVNvY2tldC5lbmQoKSk7XG5cdFx0bG9jYWxTb2NrZXQub24oJ2Vycm9yJywgKCkgPT4gcmVtb3RlU29ja2V0LmRlc3Ryb3koKSk7XG5cblx0XHRyZW1vdGVTb2NrZXQucGlwZShsb2NhbFNvY2tldCk7XG5cdFx0bG9jYWxTb2NrZXQucGlwZShyZW1vdGVTb2NrZXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRyYWNrIGEgcmVtb3RlIHR1bm5lbCBzb2NrZXQgc28ge0BsaW5rIGRpc3Bvc2V9IGNhbiB0ZWFyIGl0IGRvd25cblx0ICogc3luY2hyb25vdXNseS4gVGhlIHNvY2tldCBhdXRvLXJlbW92ZXMgaXRzZWxmIG9uY2UgY2xvc2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBfdHJhY2tSZW1vdGVTb2NrZXQoc29ja2V0OiBEdXBsZXgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW1vdGVTb2NrZXRzLmFkZChzb2NrZXQpO1xuXG5cdFx0Ly8gT25jZSB3ZSBkZXRhY2ggTm9kZVNvY2tldCdzIGxpc3RlbmVycyAoc2VlIF90YWtlUmVtb3RlU3RyZWFtKVxuXHRcdC8vIHRoZSByYXcgc29ja2V0IGhhcyBubyAnZXJyb3InIGhhbmRsZXIgb2YgaXRzIG93bi4gQSBuZXQuU29ja2V0XG5cdFx0Ly8gdGhhdCBlbWl0cyAnZXJyb3InIHdpdGhvdXQgYSBsaXN0ZW5lciB0aHJvd3MgYXMgYSBnZW51aW5lXG5cdFx0Ly8gdW5jYXVnaHQgZXhjZXB0aW9uLCBzbyBldmVyeSBzb2NrZXQgd2Ugb3duIG11c3QgaGF2ZSBvbmUuXG5cdFx0Ly8gRGVzdHJveWluZyBvbiBlcnJvciB0ZWFycyB0aGUgc29ja2V0IGRvd24gcXVpZXRseSBhbmQgbGV0cyB0aGVcblx0XHQvLyBhZ2VudCBldmljdCBpdCBmcm9tIHRoZSBwb29sLiAoQ09OTkVDVCBicmlkZ2VzIGF0dGFjaCBhblxuXHRcdC8vIGFkZGl0aW9uYWwgaGFuZGxlciBpbiBfYnJpZGdlU29ja2V0czsgYSBzZWNvbmQgbGlzdGVuZXIgaXNcblx0XHQvLyBoYXJtbGVzcy4pXG5cdFx0c29ja2V0Lm9uKCdlcnJvcicsICgpID0+IHNvY2tldC5kZXN0cm95KCkpO1xuXHRcdHNvY2tldC5vbignY2xvc2UnLCAoKSA9PiB0aGlzLl9yZW1vdGVTb2NrZXRzLmRlbGV0ZShzb2NrZXQpKTtcblx0fVxufVxuXG4vKipcbiAqIEFkYXB0cyBhIGdlbmVyaWMge0BsaW5rIElTb2NrZXR9IChzdWNoIGFzIGEgbWFuYWdlZCAvIGV4ZWMtc2VydmVyXG4gKiBjb25uZWN0aW9uLCB3aGljaCBoYXMgbm8gdW5kZXJseWluZyBgbmV0LlNvY2tldGApIHRvIGEgTm9kZSB7QGxpbmsgRHVwbGV4fVxuICogc3RyZWFtLCBzbyB0aGUge0BsaW5rIFR1bm5lbFByb3h5fSBjYW4gcGlwZSBhbmQgcG9vbCBpdCBleGFjdGx5IGxpa2UgdGhlIHJhd1xuICogc29ja2V0IGl0IGV4dHJhY3RzIGZyb20gYSB7QGxpbmsgTm9kZVNvY2tldH0uXG4gKi9cbmNsYXNzIFJlbW90ZVNvY2tldFN0cmVhbSBleHRlbmRzIER1cGxleCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfc29ja2V0OiBJU29ja2V0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fc29ja2V0Lm9uRGF0YShkYXRhID0+IHRoaXMucHVzaChkYXRhLmJ1ZmZlcikpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fc29ja2V0Lm9uRW5kKCgpID0+IHRoaXMucHVzaChudWxsKSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9zb2NrZXQub25DbG9zZShlID0+IHtcblx0XHRcdC8vIFRoZSB0cmFuc3BvcnQgaXMgZnVsbHkgY2xvc2VkLCBzbyB0ZWFyIHRoZSBzdHJlYW0gZG93bjogdGhpcyBlbWl0c1xuXHRcdFx0Ly8gJ2Nsb3NlJyAocmVtb3ZpbmcgaXQgZnJvbSB0aGUgcHJveHkncyBzb2NrZXQgc2V0IGFuZCBldmljdGluZyBpdCBmcm9tXG5cdFx0XHQvLyB0aGUgaHR0cC5BZ2VudCBwb29sKSBhbmQgZGlzcG9zZXMgdGhlIHVuZGVybHlpbmcgSVNvY2tldCB2aWEgX2Rlc3Ryb3kuXG5cdFx0XHQvLyBBIGNsZWFuIGNsb3NlIGNhcnJpZXMgbm8gZXJyb3IuXG5cdFx0XHR0aGlzLmRlc3Ryb3koZT8udHlwZSA9PT0gU29ja2V0Q2xvc2VFdmVudFR5cGUuTm9kZVNvY2tldENsb3NlRXZlbnQgPyBlLmVycm9yIDogdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvLyBUaGUga2VlcC1hbGl2ZSBodHRwLkFnZW50IHBvb2xzIHR1bm5lbCBzb2NrZXRzIGFuZCBjYWxscyBuZXQuU29ja2V0LW9ubHlcblx0Ly8gdHJhbnNwb3J0IGtub2JzIG9uIHRoZW0gKHNldEtlZXBBbGl2ZS9yZWYvdW5yZWYsIGFuZCBzZXRUaW1lb3V0L3NldE5vRGVsYXlcblx0Ly8gd2hpbGUgd2lyaW5nIGEgcmVxdWVzdCkgd2hlbiBwYXJraW5nIG9yIHJldXNpbmcgYSBjb25uZWN0aW9uLiBBIGdlbmVyaWNcblx0Ly8gSVNvY2tldCBoYXMgbm8gc3VjaCBrbm9icywgc28gZXhwb3NlIG5vLW9wIHNoaW1zIHRvIGtlZXAgdGhlIGFnZW50IGhhcHB5O1xuXHQvLyBvdGhlcndpc2UgZnJlZWluZyBhIHBvb2xlZCBtYW5hZ2VkIHNvY2tldCB0aHJvd3MgKGUuZy5cblx0Ly8gXCJzb2NrZXQuc2V0S2VlcEFsaXZlIGlzIG5vdCBhIGZ1bmN0aW9uXCIpLlxuXHRzZXRLZWVwQWxpdmUoKTogdGhpcyB7IHJldHVybiB0aGlzOyB9XG5cdHNldE5vRGVsYXkoKTogdGhpcyB7IHJldHVybiB0aGlzOyB9XG5cdHNldFRpbWVvdXQoKTogdGhpcyB7IHJldHVybiB0aGlzOyB9XG5cdHJlZigpOiB0aGlzIHsgcmV0dXJuIHRoaXM7IH1cblx0dW5yZWYoKTogdGhpcyB7IHJldHVybiB0aGlzOyB9XG5cblx0b3ZlcnJpZGUgX3JlYWQoKTogdm9pZCB7XG5cdFx0Ly8gRGF0YSBpcyBkZWxpdmVyZWQgdGhyb3VnaCB0aGUgb25EYXRhIGxpc3RlbmVyOyBub3RoaW5nIHRvIHB1bGwgaGVyZS5cblx0fVxuXG5cdG92ZXJyaWRlIF93cml0ZShjaHVuazogQnVmZmVyLCBfZW5jb2Rpbmc6IEJ1ZmZlckVuY29kaW5nLCBjYWxsYmFjazogKGVycm9yPzogRXJyb3IgfCBudWxsKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGhpcy5fc29ja2V0LndyaXRlKFZTQnVmZmVyLndyYXAoY2h1bmspKTtcblx0XHQvLyBSZXNwZWN0IGJhY2twcmVzc3VyZTogZGVmZXIgY29tcGxldGlvbiB1bnRpbCB0aGUgc29ja2V0IGhhcyBkcmFpbmVkIGl0c1xuXHRcdC8vIGJ1ZmZlciBzbyBhIGZhc3QgcHJvZHVjZXIgY2Fubm90IHF1ZXVlIHVuYm91bmRlZCBkYXRhIG9uIGEgc2xvdyBtYW5hZ2VkIC9cblx0XHQvLyBleGVjLXNlcnZlciB0cmFuc3BvcnQuXG5cdFx0dGhpcy5fc29ja2V0LmRyYWluKCkudGhlbigoKSA9PiBjYWxsYmFjaygpLCBlcnIgPT4gY2FsbGJhY2soZXJyKSk7XG5cdH1cblxuXHRvdmVycmlkZSBfZmluYWwoY2FsbGJhY2s6IChlcnJvcj86IEVycm9yIHwgbnVsbCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRoaXMuX3NvY2tldC5lbmQoKTtcblx0XHRjYWxsYmFjaygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgX2Rlc3Ryb3koZXJyb3I6IEVycm9yIHwgbnVsbCwgY2FsbGJhY2s6IChlcnJvcj86IEVycm9yIHwgbnVsbCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zb2NrZXQuZGlzcG9zZSgpO1xuXHRcdGNhbGxiYWNrKGVycm9yKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxjQUFjO0FBSXZCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0JBQWtCO0FBQzNCLFNBQWtCLDRCQUE0QjtBQUM5QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUF1QjtBQUc1QyxTQUFTLDhCQUE4QjtBQWF2QyxNQUFNLGlDQUFpQztBQXNDaEMsTUFBTSxvQkFBb0IsV0FBVztBQUFBLEVBd0MzQyxZQUNrQixnQkFDQSxhQUNoQjtBQUNELFVBQU07QUFIVztBQUNBO0FBckNsQixTQUFRLGFBQXFCO0FBWTdCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFB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LElBQUksQ0FBQztBQUM5QyxnQkFBWSxHQUFHLFNBQVMsTUFBTSxhQUFhLElBQUksQ0FBQztBQUNoRCxnQkFBWSxHQUFHLFNBQVMsTUFBTSxhQUFhLFFBQVEsQ0FBQztBQUVwRCxpQkFBYSxLQUFLLFdBQVc7QUFDN0IsZ0JBQVksS0FBSyxZQUFZO0FBQUEsRUFDOUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsbUJBQW1CLFFBQXNCO0FBQ2hELFNBQUssZUFBZSxJQUFJLE1BQU07QUFVOUIsV0FBTyxHQUFHLFNBQVMsTUFBTSxPQUFPLFFBQVEsQ0FBQztBQUN6QyxXQUFPLEdBQUcsU0FBUyxNQUFNLEtBQUssZUFBZSxPQUFPLE1BQU0sQ0FBQztBQUFBLEVBQzVEO0FBQ0Q7QUFRQSxNQUFNLDJCQUEyQixPQUFPO0FBQUEsRUFJdkMsWUFBNkIsU0FBa0I7QUFDOUMsVUFBTTtBQURzQjtBQUY3QixTQUFpQixlQUFlLElBQUksZ0JBQWdCO0FBSW5ELFNBQUssYUFBYSxJQUFJLEtBQUssUUFBUSxPQUFPLFVBQVEsS0FBSyxLQUFLLEtBQUssTUFBTSxDQUFDLENBQUM7QUFDekUsU0FBSyxhQUFhLElBQUksS0FBSyxRQUFRLE1BQU0sTUFBTSxLQUFLLEtBQUssSUFBSSxDQUFDLENBQUM7QUFDL0QsU0FBSyxhQUFhLElBQUksS0FBSyxRQUFRLFFBQVEsT0FBSztBQUsvQyxXQUFLLFFBQVEsR0FBRyxTQUFTLHFCQUFxQix1QkFBdUIsRUFBRSxRQUFRLE1BQVM7QUFBQSxJQUN6RixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSxlQUFxQjtBQUFFLFdBQU87QUFBQSxFQUFNO0FBQUEsRUFDcEMsYUFBbUI7QUFBRSxXQUFPO0FBQUEsRUFBTTtBQUFBLEVBQ2xDLGFBQW1CO0FBQUUsV0FBTztBQUFBLEVBQU07QUFBQSxFQUNsQyxNQUFZO0FBQUUsV0FBTztBQUFBLEVBQU07QUFBQSxFQUMzQixRQUFjO0FBQUUsV0FBTztBQUFBLEVBQU07QUFBQSxFQUVwQixRQUFjO0FBQUEsRUFFdkI7QUFBQSxFQUVTLE9BQU8sT0FBZSxXQUEyQixVQUFnRDtBQUN6RyxTQUFLLFFBQVEsTUFBTSxTQUFTLEtBQUssS0FBSyxDQUFDO0FBSXZDLFNBQUssUUFBUSxNQUFNLEVBQUUsS0FBSyxNQUFNLFNBQVMsR0FBRyxTQUFPLFNBQVMsR0FBRyxDQUFDO0FBQUEsRUFDakU7QUFBQSxFQUVTLE9BQU8sVUFBZ0Q7QUFDL0QsU0FBSyxRQUFRLElBQUk7QUFDakIsYUFBUztBQUFBLEVBQ1Y7QUFBQSxFQUVTLFNBQVMsT0FBcUIsVUFBZ0Q7QUFDdEYsU0FBSyxhQUFhLFFBQVE7QUFDMUIsU0FBSyxRQUFRLFFBQVE7QUFDckIsYUFBUyxLQUFLO0FBQUEsRUFDZjtBQUNEOyIsCiAgIm5hbWVzIjogWyJsZWZ0b3ZlciJdCn0K
