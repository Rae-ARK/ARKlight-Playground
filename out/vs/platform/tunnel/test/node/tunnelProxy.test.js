import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { TunnelProxy } from "../../node/tunnelProxy.js";
import { NodeSocket } from "../../../../base/parts/ipc/node/ipc.net.js";
import { SocketCloseEventType } from "../../../../base/parts/ipc/common/ipc.net.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
function mockTunnelProtocol(socket) {
  return {
    getSocket: () => new NodeSocket(socket),
    readEntireBuffer: () => VSBuffer.alloc(0),
    dispose: () => {
    }
  };
}
function createMockConnectFn(targetPort) {
  return async (_host, _port) => {
    const net = await import("net");
    const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    return mockTunnelProtocol(socket);
  };
}
class ManagedTestSocket extends Disposable {
  constructor(_socket) {
    super();
    this._socket = _socket;
    this._onData = this._register(new Emitter());
    this._onClose = this._register(new Emitter());
    this._onEnd = this._register(new Emitter());
    this._isDisposed = false;
    this._socket.on("data", (d) => this._onData.fire(VSBuffer.wrap(d)));
    this._socket.on("end", () => this._onEnd.fire());
    this._socket.on("close", (hadError) => this._onClose.fire({ type: SocketCloseEventType.NodeSocketCloseEvent, hadError, error: void 0 }));
    this._socket.on("error", () => {
    });
  }
  get isDisposed() {
    return this._isDisposed;
  }
  onData(listener) {
    return this._onData.event(listener);
  }
  onClose(listener) {
    return this._onClose.event(listener);
  }
  onEnd(listener) {
    return this._onEnd.event(listener);
  }
  write(buffer) {
    this._socket.write(buffer.buffer);
  }
  end() {
    this._socket.end();
  }
  drain() {
    return Promise.resolve();
  }
  traceSocketEvent() {
  }
  dispose() {
    this._isDisposed = true;
    this._socket.destroy();
    super.dispose();
  }
}
function createManagedConnectFn(targetPort, onSocket) {
  return async () => {
    const net = await import("net");
    const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    const managed = new ManagedTestSocket(socket);
    onSocket?.(managed);
    return {
      getSocket: () => managed,
      readEntireBuffer: () => VSBuffer.alloc(0),
      dispose: () => {
      }
    };
  };
}
async function proxyRequest(info, options) {
  const https = await import("https");
  return new Promise((resolve, reject) => {
    const authHeader = options.auth ? "Basic " + Buffer.from(`${info.credentials.username}:${info.credentials.password}`).toString("base64") : void 0;
    const req = https.request({
      hostname: "127.0.0.1",
      port: info.port,
      method: options.method ?? "GET",
      path: options.path,
      headers: {
        ...options.headers,
        ...authHeader ? { "Proxy-Authorization": authHeader } : {}
      },
      rejectUnauthorized: false
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString()
      }));
    });
    req.on("error", reject);
    req.end();
  });
}
async function proxyConnect(info, target, auth) {
  const tls = await import("tls");
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: "127.0.0.1",
      port: info.port,
      rejectUnauthorized: false
    }, () => {
      const authHeader = auth ? "Basic " + Buffer.from(`${info.credentials.username}:${info.credentials.password}`).toString("base64") : void 0;
      let request = `CONNECT ${target} HTTP/1.1\r
Host: ${target}\r
`;
      if (authHeader) {
        request += `Proxy-Authorization: ${authHeader}\r
`;
      }
      request += "\r\n";
      socket.write(request);
      let data = "";
      const onData = (chunk) => {
        data += chunk.toString();
        const headerEnd = data.indexOf("\r\n\r\n");
        if (headerEnd !== -1) {
          socket.removeListener("data", onData);
          const statusLine = data.substring(0, data.indexOf("\r\n"));
          const statusCode = parseInt(statusLine.split(" ")[1], 10);
          resolve({ statusCode, socket });
        }
      };
      socket.on("data", onData);
    });
    socket.on("error", reject);
  });
}
suite("TunnelProxy", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let targetServer;
  let targetPort;
  suiteSetup(async () => {
    const http = await import("http");
    targetServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(`ECHO ${req.method} ${req.url}`);
    });
    targetServer.listen(0, "127.0.0.1");
    await new Promise((resolve) => targetServer.once("listening", resolve));
    targetPort = targetServer.address().port;
  });
  suiteTeardown(() => {
    targetServer.close();
  });
  let proxy;
  let proxyInfo;
  setup(async () => {
    const connectFn = createMockConnectFn(targetPort);
    proxy = ds.add(new TunnelProxy(connectFn, new NullLogService()));
    proxyInfo = await proxy.start();
  });
  teardown(() => {
    proxy.dispose();
  });
  test("start returns a valid ITunnelProxyInfo", () => {
    assert.strictEqual(proxyInfo.host, "127.0.0.1");
    assert.strictEqual(typeof proxyInfo.port, "number");
    assert.ok(proxyInfo.port > 0 && proxyInfo.port < 65536);
    assert.strictEqual(proxyInfo.url, `https://127.0.0.1:${proxyInfo.port}`);
    assert.ok(proxyInfo.credentials.username.length > 0);
    assert.ok(proxyInfo.credentials.password.length > 0);
    assert.ok(proxyInfo.certFingerprint.startsWith("sha256/"));
  });
  test("server uses TLS", async () => {
    const tls = await import("tls");
    const socket = await new Promise((resolve, reject) => {
      const s = tls.connect({
        host: "127.0.0.1",
        port: proxyInfo.port,
        rejectUnauthorized: false
      }, () => resolve(s));
      s.on("error", reject);
    });
    assert.ok(socket.encrypted);
    const cert = socket.getPeerCertificate();
    assert.strictEqual(cert.subject?.CN, "TunnelProxy");
    socket.end();
  });
  test("rejects plain HTTP request without credentials (407)", async () => {
    const res = await proxyRequest(proxyInfo, {
      path: `http://127.0.0.1:${targetPort}/hello`,
      auth: false
    });
    assert.strictEqual(res.statusCode, 407);
  });
  test("rejects CONNECT without credentials (407)", async () => {
    const { statusCode, socket } = await proxyConnect(
      proxyInfo,
      `127.0.0.1:${targetPort}`,
      false
    );
    assert.strictEqual(statusCode, 407);
    socket.end();
  });
  test("forwards authenticated HTTP GET to target", async () => {
    const res = await proxyRequest(proxyInfo, {
      path: `http://127.0.0.1:${targetPort}/some/path`,
      auth: true
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body, `ECHO GET /some/path`);
  });
  test("forwards authenticated HTTP POST to target", async () => {
    const res = await proxyRequest(proxyInfo, {
      method: "POST",
      path: `http://127.0.0.1:${targetPort}/post`,
      auth: true
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body, "ECHO POST /post");
  });
  test("strips hop-by-hop headers from forwarded request", async () => {
    const http = await import("http");
    const headerServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(req.headers));
    });
    headerServer.listen(0, "127.0.0.1");
    await new Promise((resolve) => headerServer.once("listening", resolve));
    const headerPort = headerServer.address().port;
    try {
      const connectFn = createMockConnectFn(headerPort);
      const proxy2 = ds.add(new TunnelProxy(connectFn, new NullLogService()));
      const info2 = await proxy2.start();
      const res = await proxyRequest(info2, {
        path: `http://127.0.0.1:${headerPort}/`,
        auth: true,
        headers: {
          "Connection": "keep-alive, X-Custom-Hop",
          "Keep-Alive": "timeout=5",
          "Proxy-Connection": "keep-alive",
          "TE": "trailers",
          "Upgrade": "websocket",
          "X-Custom-Hop": "should-be-removed",
          "X-End-To-End": "should-survive"
        }
      });
      assert.strictEqual(res.statusCode, 200);
      const forwarded = JSON.parse(res.body);
      assert.strictEqual(forwarded["proxy-authorization"], void 0);
      assert.strictEqual(forwarded["proxy-connection"], void 0);
      assert.strictEqual(forwarded["keep-alive"], void 0);
      assert.strictEqual(forwarded["te"], void 0);
      assert.strictEqual(forwarded["upgrade"], void 0);
      assert.strictEqual(forwarded["x-custom-hop"], void 0);
      assert.strictEqual(forwarded["x-end-to-end"], "should-survive");
      proxy2.dispose();
    } finally {
      headerServer.close();
    }
  });
  test("returns 400 for malformed URL", async () => {
    const res = await proxyRequest(proxyInfo, {
      path: "not-a-valid-url",
      auth: true
    });
    assert.strictEqual(res.statusCode, 400);
  });
  test("reuses tunnel socket for multiple requests to the same host", async () => {
    const net = await import("net");
    let connectCount = 0;
    const countingConnect = async (_host, _port) => {
      connectCount++;
      const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      });
      return mockTunnelProtocol(socket);
    };
    const poolProxy = ds.add(new TunnelProxy(countingConnect, new NullLogService()));
    const poolInfo = await poolProxy.start();
    for (let i = 0; i < 3; i++) {
      const res = await proxyRequest(poolInfo, {
        path: `http://127.0.0.1:${targetPort}/req${i}`,
        auth: true
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body, `ECHO GET /req${i}`);
    }
    assert.strictEqual(connectCount, 1, `Expected 1 tunnel connection, got ${connectCount}`);
    poolProxy.dispose();
  });
  test("drainConnectionPool destroys pooled tunnel sockets", async () => {
    const net = await import("net");
    const remoteSockets = [];
    const connectFn = async () => {
      const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      });
      remoteSockets.push(socket);
      return mockTunnelProtocol(socket);
    };
    const p = ds.add(new TunnelProxy(connectFn, new NullLogService()));
    const info = await p.start();
    const res = await proxyRequest(info, { path: `http://127.0.0.1:${targetPort}/`, auth: true });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(remoteSockets.length, 1);
    assert.strictEqual(remoteSockets[0].destroyed, false);
    const closed = new Promise((resolve) => remoteSockets[0].once("close", () => resolve()));
    p.drainConnectionPool();
    await closed;
    assert.strictEqual(remoteSockets[0].destroyed, true);
    p.dispose();
  });
  test("a reset on a pooled tunnel socket does not escalate to an uncaught exception", async () => {
    const net = await import("net");
    const remoteSockets = [];
    const connectFn = async () => {
      const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      });
      remoteSockets.push(socket);
      return mockTunnelProtocol(socket);
    };
    const p = ds.add(new TunnelProxy(connectFn, new NullLogService()));
    const info = await p.start();
    const res = await proxyRequest(info, { path: `http://127.0.0.1:${targetPort}/`, auth: true });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(remoteSockets.length, 1);
    assert.doesNotThrow(() => remoteSockets[0].emit("error", new Error("simulated upstream reset")));
    p.dispose();
  });
  test("CONNECT establishes a tunnel to the target", async () => {
    const { statusCode, socket } = await proxyConnect(
      proxyInfo,
      `127.0.0.1:${targetPort}`,
      true
    );
    assert.strictEqual(statusCode, 200);
    socket.write(`GET /tunneled HTTP/1.1\r
Host: 127.0.0.1:${targetPort}\r
Connection: close\r
\r
`);
    const body = await new Promise((resolve, reject) => {
      const chunks = [];
      socket.on("data", (c) => chunks.push(c));
      socket.on("end", () => resolve(Buffer.concat(chunks).toString()));
      socket.on("error", reject);
    });
    assert.ok(body.includes("ECHO GET /tunneled"), `Expected tunneled echo, got: ${body}`);
  });
  test("CONNECT rejects invalid port 0", async () => {
    const { statusCode, socket } = await proxyConnect(proxyInfo, "127.0.0.1:0", true);
    assert.strictEqual(statusCode, 400);
    socket.end();
  });
  test("CONNECT rejects port > 65535", async () => {
    const { statusCode, socket } = await proxyConnect(proxyInfo, "127.0.0.1:99999", true);
    assert.strictEqual(statusCode, 400);
    socket.end();
  });
  test("fails the request when the tunnel connection fails", async () => {
    const failingConnect = async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:9999");
    };
    const failProxy = ds.add(new TunnelProxy(failingConnect, new NullLogService()));
    const failInfo = await failProxy.start();
    await assert.rejects(() => proxyRequest(failInfo, {
      path: "http://unreachable.example.com/path",
      auth: true
    }));
    const { statusCode, socket } = await proxyConnect(failInfo, "unreachable.example.com:443", true);
    assert.strictEqual(statusCode, 502);
    socket.end();
    failProxy.dispose();
  });
  test("dispose shuts down the server", async () => {
    const connectFn = createMockConnectFn(targetPort);
    const p = ds.add(new TunnelProxy(connectFn, new NullLogService()));
    const info = await p.start();
    p.dispose();
    await assert.rejects(
      () => proxyRequest(info, { path: `http://127.0.0.1:${targetPort}/`, auth: true }),
      /ECONNREFUSED/
    );
  });
  test("dispose terminates active CONNECT tunnels", async () => {
    const connectFn = createMockConnectFn(targetPort);
    const p = ds.add(new TunnelProxy(connectFn, new NullLogService()));
    const info = await p.start();
    const { statusCode, socket } = await proxyConnect(info, `127.0.0.1:${targetPort}`, true);
    assert.strictEqual(statusCode, 200);
    const closed = new Promise((resolve) => socket.once("close", () => resolve()));
    p.dispose();
    await closed;
  });
  test("dispose synchronously destroys the remote tunnel socket", async () => {
    const net = await import("net");
    const remoteSockets = [];
    const connectFn = async () => {
      const socket2 = net.createConnection({ host: "127.0.0.1", port: targetPort });
      await new Promise((resolve, reject) => {
        socket2.once("connect", resolve);
        socket2.once("error", reject);
      });
      remoteSockets.push(socket2);
      return mockTunnelProtocol(socket2);
    };
    const p = ds.add(new TunnelProxy(connectFn, new NullLogService()));
    const info = await p.start();
    const { statusCode, socket } = await proxyConnect(info, `127.0.0.1:${targetPort}`, true);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(remoteSockets.length, 1);
    p.dispose();
    assert.strictEqual(remoteSockets[0].destroyed, true);
    socket.end();
  });
  test("dispose terminates CONNECT sockets stuck waiting for the upstream tunnel", async () => {
    const tls = await import("tls");
    let connectCalled;
    const connectCalledPromise = new Promise((resolve) => {
      connectCalled = resolve;
    });
    const hangingConnect = () => {
      connectCalled();
      return new Promise(() => {
      });
    };
    const p = ds.add(new TunnelProxy(hangingConnect, new NullLogService()));
    const info = await p.start();
    const clientSocket = await new Promise((resolve, reject) => {
      const s = tls.connect({
        host: "127.0.0.1",
        port: info.port,
        rejectUnauthorized: false
      }, () => {
        const authHeader = "Basic " + Buffer.from(`${info.credentials.username}:${info.credentials.password}`).toString("base64");
        s.write(`CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r
Host: 127.0.0.1:${targetPort}\r
Proxy-Authorization: ${authHeader}\r
\r
`);
        resolve(s);
      });
      s.on("error", reject);
    });
    await connectCalledPromise;
    const closed = new Promise((resolve) => clientSocket.once("close", () => resolve()));
    p.dispose();
    await closed;
  });
  test("dispose terminates idle HTTPS keep-alive connections", async () => {
    const https = await import("https");
    const connectFn = createMockConnectFn(targetPort);
    const p = ds.add(new TunnelProxy(connectFn, new NullLogService()));
    const info = await p.start();
    const agent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });
    const responseSocket = await new Promise((resolve, reject) => {
      let socket;
      const req = https.request({
        agent,
        hostname: "127.0.0.1",
        port: info.port,
        method: "GET",
        path: `http://127.0.0.1:${targetPort}/keepalive`,
        headers: {
          "Proxy-Authorization": "Basic " + Buffer.from(`${info.credentials.username}:${info.credentials.password}`).toString("base64")
        }
      }, (res) => {
        res.on("data", () => {
        });
        res.on("end", () => resolve(socket));
      });
      req.on("socket", (s) => {
        socket = s;
      });
      req.on("error", reject);
      req.end();
    });
    const closed = new Promise((resolve) => responseSocket.once("close", () => resolve()));
    p.dispose();
    agent.destroy();
    await closed;
  });
  suite("managed (non-NodeSocket) transport", () => {
    let managedProxy;
    let managedInfo;
    setup(async () => {
      managedProxy = ds.add(new TunnelProxy(createManagedConnectFn(targetPort), new NullLogService()));
      managedInfo = await managedProxy.start();
    });
    teardown(() => {
      managedProxy.dispose();
    });
    test("forwards an authenticated HTTP GET through a managed socket", async () => {
      const res = await proxyRequest(managedInfo, {
        path: `http://127.0.0.1:${targetPort}/managed/path`,
        auth: true
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body, "ECHO GET /managed/path");
    });
    test("CONNECT tunnels bidirectional data through a managed socket", async () => {
      const { statusCode, socket } = await proxyConnect(managedInfo, `127.0.0.1:${targetPort}`, true);
      assert.strictEqual(statusCode, 200);
      socket.write(`GET /managed-tunnel HTTP/1.1\r
Host: 127.0.0.1:${targetPort}\r
Connection: close\r
\r
`);
      const body = await new Promise((resolve, reject) => {
        const chunks = [];
        socket.on("data", (c) => chunks.push(c));
        socket.on("end", () => resolve(Buffer.concat(chunks).toString()));
        socket.on("error", reject);
      });
      assert.ok(body.includes("ECHO GET /managed-tunnel"), `Expected tunneled echo, got: ${body}`);
    });
    test("dispose disposes the managed remote socket via the adapter", async () => {
      let captured;
      const p = ds.add(new TunnelProxy(createManagedConnectFn(targetPort, (s) => {
        captured = s;
      }), new NullLogService()));
      const info = await p.start();
      const { statusCode, socket } = await proxyConnect(info, `127.0.0.1:${targetPort}`, true);
      assert.strictEqual(statusCode, 200);
      assert.ok(captured);
      p.dispose();
      assert.strictEqual(captured.isDisposed, true);
      socket.end();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3R1bm5lbC90ZXN0L25vZGUvdHVubmVsUHJveHkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB0eXBlIHsgSW5jb21pbmdIdHRwSGVhZGVycywgU2VydmVyIH0gZnJvbSAnaHR0cCc7XG5pbXBvcnQgdHlwZSB7IEFkZHJlc3NJbmZvIH0gZnJvbSAnbmV0JztcbmltcG9ydCB0eXBlIHsgVExTU29ja2V0IH0gZnJvbSAndGxzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVHVubmVsQ29ubmVjdEZuLCBUdW5uZWxQcm94eSB9IGZyb20gJy4uLy4uL25vZGUvdHVubmVsUHJveHkuanMnO1xuaW1wb3J0IHsgSVR1bm5lbFByb3h5SW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi90dW5uZWxQcm94eS5qcyc7XG5pbXBvcnQgeyBOb2RlU29ja2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvbm9kZS9pcGMubmV0LmpzJztcbmltcG9ydCB7IElTb2NrZXQsIFNvY2tldENsb3NlRXZlbnQsIFNvY2tldENsb3NlRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5uZXQuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuLyoqXG4gKiBXcmFwIGEgcmF3IGBuZXQuU29ja2V0YCBpbiB0aGUgcHJvdG9jb2wtbGlrZSBzaGFwZSB0aGF0IGBUdW5uZWxQcm94eWBcbiAqIGV4cGVjdHMsIGVtdWxhdGluZyB0aGUgcmVtb3RlIGFnZW50LiBUaGUgdHVubmVsIGhhbmRzaGFrZSAodGhlIHJlbW90ZVxuICogY29uZmlybWluZyB0aGUgdGFyZ2V0IGlzIHJlYWNoYWJsZSkgaGFwcGVucyBpbnNpZGUgdGhlIHJlYWwgY29ubmVjdFxuICogZnVuY3Rpb24sIHdoaWNoIHRoZSBwcm94eSB0ZXN0cyByZXBsYWNlOyByZWFjaGluZyB0aGlzIGhlbHBlciB0aGVyZWZvcmVcbiAqIGFsd2F5cyByZXByZXNlbnRzIGEgc3VjY2Vzc2Z1bGx5IGVzdGFibGlzaGVkIHR1bm5lbCwgc28gbm8gc3RhdHVzIGlzXG4gKiBkZWxpdmVyZWQgaGVyZS4gQSBmYWlsZWQgdHVubmVsIGlzIHNpbXVsYXRlZCBieSBhIGNvbm5lY3QgZnVuY3Rpb24gdGhhdFxuICogcmVqZWN0cyBpbnN0ZWFkLlxuICovXG5mdW5jdGlvbiBtb2NrVHVubmVsUHJvdG9jb2woc29ja2V0OiBpbXBvcnQoJ25ldCcpLlNvY2tldCkge1xuXHRyZXR1cm4ge1xuXHRcdGdldFNvY2tldDogKCkgPT4gbmV3IE5vZGVTb2NrZXQoc29ja2V0KSxcblx0XHRyZWFkRW50aXJlQnVmZmVyOiAoKSA9PiBWU0J1ZmZlci5hbGxvYygwKSxcblx0XHRkaXNwb3NlOiAoKSA9PiB7IC8qIE5vZGVTb2NrZXQgb3ducyB0aGUgdW5kZXJseWluZyBzb2NrZXQgKi8gfSxcblx0fTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBtb2NrIHtAbGluayBJVHVubmVsQ29ubmVjdEZufSB0aGF0IGNvbm5lY3RzIHRvIGEgbG9jYWwgVENQXG4gKiBzZXJ2ZXIgaW5zdGVhZCBvZiBnb2luZyB0aHJvdWdoIHRoZSByZW1vdGUgYWdlbnQuIFJldHVybnMgYVxuICogYE5vZGVTb2NrZXRgIHdyYXBwZWQgaW4gdGhlIHByb3RvY29sLWxpa2Ugc2hhcGUgdGhhdCBgVHVubmVsUHJveHlgXG4gKiBleHBlY3RzLlxuICovXG5mdW5jdGlvbiBjcmVhdGVNb2NrQ29ubmVjdEZuKHRhcmdldFBvcnQ6IG51bWJlcik6IElUdW5uZWxDb25uZWN0Rm4ge1xuXHRyZXR1cm4gYXN5bmMgKF9ob3N0OiBzdHJpbmcsIF9wb3J0OiBudW1iZXIpID0+IHtcblx0XHRjb25zdCBuZXQgPSBhd2FpdCBpbXBvcnQoJ25ldCcpO1xuXHRcdGNvbnN0IHNvY2tldCA9IG5ldC5jcmVhdGVDb25uZWN0aW9uKHsgaG9zdDogJzEyNy4wLjAuMScsIHBvcnQ6IHRhcmdldFBvcnQgfSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0c29ja2V0Lm9uY2UoJ2Nvbm5lY3QnLCByZXNvbHZlKTtcblx0XHRcdHNvY2tldC5vbmNlKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIG1vY2tUdW5uZWxQcm90b2NvbChzb2NrZXQpO1xuXHR9O1xufVxuXG4vKipcbiAqIEEgZ2VuZXJpYyB7QGxpbmsgSVNvY2tldH0gdGhhdCBpcyAqKm5vdCoqIGEge0BsaW5rIE5vZGVTb2NrZXR9LCBiYWNrZWQgYnkgYVxuICogcmF3IGBuZXQuU29ja2V0YCwgdXNlZCB0byBlbXVsYXRlIGEgbWFuYWdlZCAvIGV4ZWMtc2VydmVyIHRyYW5zcG9ydC4gUmVhY2hpbmdcbiAqIGBUdW5uZWxQcm94eWAgdGhyb3VnaCB0aGlzIHNoYXBlIGV4ZXJjaXNlcyB0aGUgYFJlbW90ZVNvY2tldFN0cmVhbWAgYWRhcHRlclxuICogKHRoZSBwcm94eSBuZXZlciBzZWVzIGEgYG5ldC5Tb2NrZXRgKSByYXRoZXIgdGhhbiB0aGUgcmF3LXNvY2tldCBmYXN0IHBhdGguXG4gKi9cbmNsYXNzIE1hbmFnZWRUZXN0U29ja2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTb2NrZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFZTQnVmZmVyPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25DbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFNvY2tldENsb3NlRXZlbnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkVuZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdHByaXZhdGUgX2lzRGlzcG9zZWQgPSBmYWxzZTtcblx0Z2V0IGlzRGlzcG9zZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9pc0Rpc3Bvc2VkOyB9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfc29ja2V0OiBpbXBvcnQoJ25ldCcpLlNvY2tldCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc29ja2V0Lm9uKCdkYXRhJywgZCA9PiB0aGlzLl9vbkRhdGEuZmlyZShWU0J1ZmZlci53cmFwKGQpKSk7XG5cdFx0dGhpcy5fc29ja2V0Lm9uKCdlbmQnLCAoKSA9PiB0aGlzLl9vbkVuZC5maXJlKCkpO1xuXHRcdHRoaXMuX3NvY2tldC5vbignY2xvc2UnLCBoYWRFcnJvciA9PiB0aGlzLl9vbkNsb3NlLmZpcmUoeyB0eXBlOiBTb2NrZXRDbG9zZUV2ZW50VHlwZS5Ob2RlU29ja2V0Q2xvc2VFdmVudCwgaGFkRXJyb3IsIGVycm9yOiB1bmRlZmluZWQgfSkpO1xuXHRcdC8vIFN3YWxsb3cgdHJhbnNwb3J0IGVycm9yczsgdGhleSBzdXJmYWNlIHRvIHRoZSBwcm94eSBhcyBhIGNsb3NlIGV2ZW50LlxuXHRcdHRoaXMuX3NvY2tldC5vbignZXJyb3InLCAoKSA9PiB7IH0pO1xuXHR9XG5cblx0b25EYXRhKGxpc3RlbmVyOiAoZTogVlNCdWZmZXIpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7IHJldHVybiB0aGlzLl9vbkRhdGEuZXZlbnQobGlzdGVuZXIpOyB9XG5cdG9uQ2xvc2UobGlzdGVuZXI6IChlOiBTb2NrZXRDbG9zZUV2ZW50KSA9PiB2b2lkKTogSURpc3Bvc2FibGUgeyByZXR1cm4gdGhpcy5fb25DbG9zZS5ldmVudChsaXN0ZW5lcik7IH1cblx0b25FbmQobGlzdGVuZXI6ICgpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7IHJldHVybiB0aGlzLl9vbkVuZC5ldmVudChsaXN0ZW5lcik7IH1cblx0d3JpdGUoYnVmZmVyOiBWU0J1ZmZlcik6IHZvaWQgeyB0aGlzLl9zb2NrZXQud3JpdGUoYnVmZmVyLmJ1ZmZlcik7IH1cblx0ZW5kKCk6IHZvaWQgeyB0aGlzLl9zb2NrZXQuZW5kKCk7IH1cblx0ZHJhaW4oKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoKTsgfVxuXHR0cmFjZVNvY2tldEV2ZW50KCk6IHZvaWQgeyB9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9zb2NrZXQuZGVzdHJveSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIExpa2Uge0BsaW5rIGNyZWF0ZU1vY2tDb25uZWN0Rm59LCBidXQgcHJlc2VudHMgdGhlIHR1bm5lbCBhcyBhIGdlbmVyaWNcbiAqIHtAbGluayBJU29ja2V0fSAobWFuYWdlZCAvIGV4ZWMtc2VydmVyIHRyYW5zcG9ydCkgaW5zdGVhZCBvZiBhXG4gKiB7QGxpbmsgTm9kZVNvY2tldH0sIHNvIHRoZSBwcm94eSByb3V0ZXMgaXQgdGhyb3VnaCBpdHMgYFJlbW90ZVNvY2tldFN0cmVhbWBcbiAqIGFkYXB0ZXIuIFRoZSBwcm90b2NvbCdzIGBkaXNwb3NlYCBpcyBhIG5vLW9wIGJlY2F1c2UgdGhlIGFkYXB0ZXIgb3ducyB0aGVcbiAqIG1hbmFnZWQgc29ja2V0IGFuZCBkaXNwb3NlcyBpdCB3aGVuIHRoZSBzdHJlYW0gaXMgZGVzdHJveWVkLlxuICovXG5mdW5jdGlvbiBjcmVhdGVNYW5hZ2VkQ29ubmVjdEZuKHRhcmdldFBvcnQ6IG51bWJlciwgb25Tb2NrZXQ/OiAoc29ja2V0OiBNYW5hZ2VkVGVzdFNvY2tldCkgPT4gdm9pZCk6IElUdW5uZWxDb25uZWN0Rm4ge1xuXHRyZXR1cm4gYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG5ldCA9IGF3YWl0IGltcG9ydCgnbmV0Jyk7XG5cdFx0Y29uc3Qgc29ja2V0ID0gbmV0LmNyZWF0ZUNvbm5lY3Rpb24oeyBob3N0OiAnMTI3LjAuMC4xJywgcG9ydDogdGFyZ2V0UG9ydCB9KTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRzb2NrZXQub25jZSgnY29ubmVjdCcsIHJlc29sdmUpO1xuXHRcdFx0c29ja2V0Lm9uY2UoJ2Vycm9yJywgcmVqZWN0KTtcblx0XHR9KTtcblx0XHRjb25zdCBtYW5hZ2VkID0gbmV3IE1hbmFnZWRUZXN0U29ja2V0KHNvY2tldCk7XG5cdFx0b25Tb2NrZXQ/LihtYW5hZ2VkKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0U29ja2V0OiAoKSA9PiBtYW5hZ2VkLFxuXHRcdFx0cmVhZEVudGlyZUJ1ZmZlcjogKCkgPT4gVlNCdWZmZXIuYWxsb2MoMCksXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IC8qIHRoZSBhZGFwdGVyIG93bnMgYW5kIGRpc3Bvc2VzIHRoZSBtYW5hZ2VkIHNvY2tldCAqLyB9LFxuXHRcdH07XG5cdH07XG59XG5cbi8qKlxuICogTWFrZSBhbiBIVFRQUyByZXF1ZXN0IHRvIHRoZSBwcm94eSwgc2tpcHBpbmcgY2VydCB2ZXJpZmljYXRpb25cbiAqIChzZWxmLXNpZ25lZCkuIFJldHVybnMgdGhlIHJlc3BvbnNlIHN0YXR1cyBjb2RlIGFuZCBib2R5LlxuICovXG5hc3luYyBmdW5jdGlvbiBwcm94eVJlcXVlc3QoXG5cdGluZm86IElUdW5uZWxQcm94eUluZm8sXG5cdG9wdGlvbnM6IHsgbWV0aG9kPzogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IGF1dGg/OiBib29sZWFuOyBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB9LFxuKTogUHJvbWlzZTx7IHN0YXR1c0NvZGU6IG51bWJlcjsgaGVhZGVyczogSW5jb21pbmdIdHRwSGVhZGVyczsgYm9keTogc3RyaW5nIH0+IHtcblx0Y29uc3QgaHR0cHMgPSBhd2FpdCBpbXBvcnQoJ2h0dHBzJyk7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgYXV0aEhlYWRlciA9IG9wdGlvbnMuYXV0aFxuXHRcdFx0PyAnQmFzaWMgJyArIEJ1ZmZlci5mcm9tKGAke2luZm8uY3JlZGVudGlhbHMudXNlcm5hbWV9OiR7aW5mby5jcmVkZW50aWFscy5wYXNzd29yZH1gKS50b1N0cmluZygnYmFzZTY0Jylcblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgcmVxID0gaHR0cHMucmVxdWVzdCh7XG5cdFx0XHRob3N0bmFtZTogJzEyNy4wLjAuMScsXG5cdFx0XHRwb3J0OiBpbmZvLnBvcnQsXG5cdFx0XHRtZXRob2Q6IG9wdGlvbnMubWV0aG9kID8/ICdHRVQnLFxuXHRcdFx0cGF0aDogb3B0aW9ucy5wYXRoLFxuXHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHQuLi5vcHRpb25zLmhlYWRlcnMsXG5cdFx0XHRcdC4uLihhdXRoSGVhZGVyID8geyAnUHJveHktQXV0aG9yaXphdGlvbic6IGF1dGhIZWFkZXIgfSA6IHt9KSxcblx0XHRcdH0sXG5cdFx0XHRyZWplY3RVbmF1dGhvcml6ZWQ6IGZhbHNlLFxuXHRcdH0sIHJlcyA9PiB7XG5cdFx0XHRjb25zdCBjaHVua3M6IEJ1ZmZlcltdID0gW107XG5cdFx0XHRyZXMub24oJ2RhdGEnLCBjID0+IGNodW5rcy5wdXNoKGMpKTtcblx0XHRcdHJlcy5vbignZW5kJywgKCkgPT4gcmVzb2x2ZSh7XG5cdFx0XHRcdHN0YXR1c0NvZGU6IHJlcy5zdGF0dXNDb2RlISxcblx0XHRcdFx0aGVhZGVyczogcmVzLmhlYWRlcnMsXG5cdFx0XHRcdGJvZHk6IEJ1ZmZlci5jb25jYXQoY2h1bmtzKS50b1N0cmluZygpLFxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXHRcdHJlcS5vbignZXJyb3InLCByZWplY3QpO1xuXHRcdHJlcS5lbmQoKTtcblx0fSk7XG59XG5cbi8qKlxuICogT3BlbiBhIFRMUyBjb25uZWN0aW9uIHRvIHRoZSBwcm94eSwgc2VuZCBhIHJhdyBDT05ORUNUIHJlcXVlc3QsIGFuZFxuICogcmV0dXJuIHRoZSByZXNwb25zZSBzdGF0dXMgbGluZSBhbmQgdGhlIHVuZGVybHlpbmcgVExTIHNvY2tldCBmb3JcbiAqIGZ1cnRoZXIgSS9PLlxuICovXG5hc3luYyBmdW5jdGlvbiBwcm94eUNvbm5lY3QoXG5cdGluZm86IElUdW5uZWxQcm94eUluZm8sXG5cdHRhcmdldDogc3RyaW5nLFxuXHRhdXRoOiBib29sZWFuLFxuKTogUHJvbWlzZTx7IHN0YXR1c0NvZGU6IG51bWJlcjsgc29ja2V0OiBUTFNTb2NrZXQgfT4ge1xuXHRjb25zdCB0bHMgPSBhd2FpdCBpbXBvcnQoJ3RscycpO1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IHNvY2tldCA9IHRscy5jb25uZWN0KHtcblx0XHRcdGhvc3Q6ICcxMjcuMC4wLjEnLFxuXHRcdFx0cG9ydDogaW5mby5wb3J0LFxuXHRcdFx0cmVqZWN0VW5hdXRob3JpemVkOiBmYWxzZSxcblx0XHR9LCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRoSGVhZGVyID0gYXV0aFxuXHRcdFx0XHQ/ICdCYXNpYyAnICsgQnVmZmVyLmZyb20oYCR7aW5mby5jcmVkZW50aWFscy51c2VybmFtZX06JHtpbmZvLmNyZWRlbnRpYWxzLnBhc3N3b3JkfWApLnRvU3RyaW5nKCdiYXNlNjQnKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0bGV0IHJlcXVlc3QgPSBgQ09OTkVDVCAke3RhcmdldH0gSFRUUC8xLjFcXHJcXG5Ib3N0OiAke3RhcmdldH1cXHJcXG5gO1xuXHRcdFx0aWYgKGF1dGhIZWFkZXIpIHtcblx0XHRcdFx0cmVxdWVzdCArPSBgUHJveHktQXV0aG9yaXphdGlvbjogJHthdXRoSGVhZGVyfVxcclxcbmA7XG5cdFx0XHR9XG5cdFx0XHRyZXF1ZXN0ICs9ICdcXHJcXG4nO1xuXHRcdFx0c29ja2V0LndyaXRlKHJlcXVlc3QpO1xuXG5cdFx0XHRsZXQgZGF0YSA9ICcnO1xuXHRcdFx0Y29uc3Qgb25EYXRhID0gKGNodW5rOiBCdWZmZXIpID0+IHtcblx0XHRcdFx0ZGF0YSArPSBjaHVuay50b1N0cmluZygpO1xuXHRcdFx0XHRjb25zdCBoZWFkZXJFbmQgPSBkYXRhLmluZGV4T2YoJ1xcclxcblxcclxcbicpO1xuXHRcdFx0XHRpZiAoaGVhZGVyRW5kICE9PSAtMSkge1xuXHRcdFx0XHRcdHNvY2tldC5yZW1vdmVMaXN0ZW5lcignZGF0YScsIG9uRGF0YSk7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdHVzTGluZSA9IGRhdGEuc3Vic3RyaW5nKDAsIGRhdGEuaW5kZXhPZignXFxyXFxuJykpO1xuXHRcdFx0XHRcdGNvbnN0IHN0YXR1c0NvZGUgPSBwYXJzZUludChzdGF0dXNMaW5lLnNwbGl0KCcgJylbMV0sIDEwKTtcblx0XHRcdFx0XHRyZXNvbHZlKHsgc3RhdHVzQ29kZSwgc29ja2V0IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0c29ja2V0Lm9uKCdkYXRhJywgb25EYXRhKTtcblx0XHR9KTtcblx0XHRzb2NrZXQub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0fSk7XG59XG5cblxuc3VpdGUoJ1R1bm5lbFByb3h5JywgKCkgPT4ge1xuXG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHRhcmdldFNlcnZlcjogU2VydmVyO1xuXHRsZXQgdGFyZ2V0UG9ydDogbnVtYmVyO1xuXG5cdC8vIEEgc2ltcGxlIEhUVFAgc2VydmVyIHRoYXQgZWNob2VzIHRoZSByZXF1ZXN0IG1ldGhvZCArIFVSTCBiYWNrLlxuXHRzdWl0ZVNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBodHRwID0gYXdhaXQgaW1wb3J0KCdodHRwJyk7XG5cdFx0dGFyZ2V0U2VydmVyID0gaHR0cC5jcmVhdGVTZXJ2ZXIoKHJlcSwgcmVzKSA9PiB7XG5cdFx0XHRyZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ3RleHQvcGxhaW4nIH0pO1xuXHRcdFx0cmVzLmVuZChgRUNITyAke3JlcS5tZXRob2R9ICR7cmVxLnVybH1gKTtcblx0XHR9KTtcblx0XHR0YXJnZXRTZXJ2ZXIubGlzdGVuKDAsICcxMjcuMC4wLjEnKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHRhcmdldFNlcnZlci5vbmNlKCdsaXN0ZW5pbmcnLCByZXNvbHZlKSk7XG5cdFx0dGFyZ2V0UG9ydCA9ICh0YXJnZXRTZXJ2ZXIuYWRkcmVzcygpIGFzIEFkZHJlc3NJbmZvKS5wb3J0O1xuXHR9KTtcblxuXHRzdWl0ZVRlYXJkb3duKCgpID0+IHtcblx0XHR0YXJnZXRTZXJ2ZXIuY2xvc2UoKTtcblx0fSk7XG5cblx0bGV0IHByb3h5OiBUdW5uZWxQcm94eTtcblx0bGV0IHByb3h5SW5mbzogSVR1bm5lbFByb3h5SW5mbztcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdEZuID0gY3JlYXRlTW9ja0Nvbm5lY3RGbih0YXJnZXRQb3J0KTtcblx0XHRwcm94eSA9IGRzLmFkZChuZXcgVHVubmVsUHJveHkoY29ubmVjdEZuLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHByb3h5SW5mbyA9IGF3YWl0IHByb3h5LnN0YXJ0KCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRwcm94eS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBJVHVubmVsUHJveHlJbmZvIHNoYXBlIC0tLVxuXG5cdHRlc3QoJ3N0YXJ0IHJldHVybnMgYSB2YWxpZCBJVHVubmVsUHJveHlJbmZvJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm94eUluZm8uaG9zdCwgJzEyNy4wLjAuMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgcHJveHlJbmZvLnBvcnQsICdudW1iZXInKTtcblx0XHRhc3NlcnQub2socHJveHlJbmZvLnBvcnQgPiAwICYmIHByb3h5SW5mby5wb3J0IDwgNjU1MzYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm94eUluZm8udXJsLCBgaHR0cHM6Ly8xMjcuMC4wLjE6JHtwcm94eUluZm8ucG9ydH1gKTtcblx0XHRhc3NlcnQub2socHJveHlJbmZvLmNyZWRlbnRpYWxzLnVzZXJuYW1lLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5vayhwcm94eUluZm8uY3JlZGVudGlhbHMucGFzc3dvcmQubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHByb3h5SW5mby5jZXJ0RmluZ2VycHJpbnQuc3RhcnRzV2l0aCgnc2hhMjU2LycpKTtcblx0fSk7XG5cblx0Ly8gLS0tIFRMUyAtLS1cblxuXHR0ZXN0KCdzZXJ2ZXIgdXNlcyBUTFMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGxzID0gYXdhaXQgaW1wb3J0KCd0bHMnKTtcblx0XHRjb25zdCBzb2NrZXQgPSBhd2FpdCBuZXcgUHJvbWlzZTxUTFNTb2NrZXQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IHMgPSB0bHMuY29ubmVjdCh7XG5cdFx0XHRcdGhvc3Q6ICcxMjcuMC4wLjEnLFxuXHRcdFx0XHRwb3J0OiBwcm94eUluZm8ucG9ydCxcblx0XHRcdFx0cmVqZWN0VW5hdXRob3JpemVkOiBmYWxzZSxcblx0XHRcdH0sICgpID0+IHJlc29sdmUocykpO1xuXHRcdFx0cy5vbignZXJyb3InLCByZWplY3QpO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5vayhzb2NrZXQuZW5jcnlwdGVkKTtcblx0XHRjb25zdCBjZXJ0ID0gc29ja2V0LmdldFBlZXJDZXJ0aWZpY2F0ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZXJ0LnN1YmplY3Q/LkNOLCAnVHVubmVsUHJveHknKTtcblx0XHRzb2NrZXQuZW5kKCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBBdXRoZW50aWNhdGlvbiAtLS1cblxuXHR0ZXN0KCdyZWplY3RzIHBsYWluIEhUVFAgcmVxdWVzdCB3aXRob3V0IGNyZWRlbnRpYWxzICg0MDcpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHByb3h5UmVxdWVzdChwcm94eUluZm8sIHtcblx0XHRcdHBhdGg6IGBodHRwOi8vMTI3LjAuMC4xOiR7dGFyZ2V0UG9ydH0vaGVsbG9gLFxuXHRcdFx0YXV0aDogZmFsc2UsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXNDb2RlLCA0MDcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIENPTk5FQ1Qgd2l0aG91dCBjcmVkZW50aWFscyAoNDA3KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHN0YXR1c0NvZGUsIHNvY2tldCB9ID0gYXdhaXQgcHJveHlDb25uZWN0KFxuXHRcdFx0cHJveHlJbmZvLFxuXHRcdFx0YDEyNy4wLjAuMToke3RhcmdldFBvcnR9YCxcblx0XHRcdGZhbHNlLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXR1c0NvZGUsIDQwNyk7XG5cdFx0c29ja2V0LmVuZCgpO1xuXHR9KTtcblxuXHQvLyAtLS0gUGxhaW4gSFRUUCBmb3J3YXJkaW5nIC0tLVxuXG5cdHRlc3QoJ2ZvcndhcmRzIGF1dGhlbnRpY2F0ZWQgSFRUUCBHRVQgdG8gdGFyZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHByb3h5UmVxdWVzdChwcm94eUluZm8sIHtcblx0XHRcdHBhdGg6IGBodHRwOi8vMTI3LjAuMC4xOiR7dGFyZ2V0UG9ydH0vc29tZS9wYXRoYCxcblx0XHRcdGF1dGg6IHRydWUsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXNDb2RlLCAyMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuYm9keSwgYEVDSE8gR0VUIC9zb21lL3BhdGhgKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yd2FyZHMgYXV0aGVudGljYXRlZCBIVFRQIFBPU1QgdG8gdGFyZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHByb3h5UmVxdWVzdChwcm94eUluZm8sIHtcblx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0cGF0aDogYGh0dHA6Ly8xMjcuMC4wLjE6JHt0YXJnZXRQb3J0fS9wb3N0YCxcblx0XHRcdGF1dGg6IHRydWUsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXNDb2RlLCAyMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuYm9keSwgJ0VDSE8gUE9TVCAvcG9zdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgaG9wLWJ5LWhvcCBoZWFkZXJzIGZyb20gZm9yd2FyZGVkIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVXNlIGEgdGFyZ2V0IHRoYXQgZWNob2VzIGFsbCByZWNlaXZlZCBoZWFkZXJzIGFzIEpTT05cblx0XHRjb25zdCBodHRwID0gYXdhaXQgaW1wb3J0KCdodHRwJyk7XG5cdFx0Y29uc3QgaGVhZGVyU2VydmVyID0gaHR0cC5jcmVhdGVTZXJ2ZXIoKHJlcSwgcmVzKSA9PiB7XG5cdFx0XHRyZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuXHRcdFx0cmVzLmVuZChKU09OLnN0cmluZ2lmeShyZXEuaGVhZGVycykpO1xuXHRcdH0pO1xuXHRcdGhlYWRlclNlcnZlci5saXN0ZW4oMCwgJzEyNy4wLjAuMScpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gaGVhZGVyU2VydmVyLm9uY2UoJ2xpc3RlbmluZycsIHJlc29sdmUpKTtcblx0XHRjb25zdCBoZWFkZXJQb3J0ID0gKGhlYWRlclNlcnZlci5hZGRyZXNzKCkgYXMgQWRkcmVzc0luZm8pLnBvcnQ7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29ubmVjdEZuID0gY3JlYXRlTW9ja0Nvbm5lY3RGbihoZWFkZXJQb3J0KTtcblx0XHRcdGNvbnN0IHByb3h5MiA9IGRzLmFkZChuZXcgVHVubmVsUHJveHkoY29ubmVjdEZuLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgaW5mbzIgPSBhd2FpdCBwcm94eTIuc3RhcnQoKTtcblxuXHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgcHJveHlSZXF1ZXN0KGluZm8yLCB7XG5cdFx0XHRcdHBhdGg6IGBodHRwOi8vMTI3LjAuMC4xOiR7aGVhZGVyUG9ydH0vYCxcblx0XHRcdFx0YXV0aDogdHJ1ZSxcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdCdDb25uZWN0aW9uJzogJ2tlZXAtYWxpdmUsIFgtQ3VzdG9tLUhvcCcsXG5cdFx0XHRcdFx0J0tlZXAtQWxpdmUnOiAndGltZW91dD01Jyxcblx0XHRcdFx0XHQnUHJveHktQ29ubmVjdGlvbic6ICdrZWVwLWFsaXZlJyxcblx0XHRcdFx0XHQnVEUnOiAndHJhaWxlcnMnLFxuXHRcdFx0XHRcdCdVcGdyYWRlJzogJ3dlYnNvY2tldCcsXG5cdFx0XHRcdFx0J1gtQ3VzdG9tLUhvcCc6ICdzaG91bGQtYmUtcmVtb3ZlZCcsXG5cdFx0XHRcdFx0J1gtRW5kLVRvLUVuZCc6ICdzaG91bGQtc3Vydml2ZScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzQ29kZSwgMjAwKTtcblx0XHRcdGNvbnN0IGZvcndhcmRlZCA9IEpTT04ucGFyc2UocmVzLmJvZHkpO1xuXHRcdFx0Ly8gQWxsIGhvcC1ieS1ob3AgaGVhZGVycyBNVVNUL1NIT1VMRCBiZSByZW1vdmVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9yd2FyZGVkWydwcm94eS1hdXRob3JpemF0aW9uJ10sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9yd2FyZGVkWydwcm94eS1jb25uZWN0aW9uJ10sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9yd2FyZGVkWydrZWVwLWFsaXZlJ10sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9yd2FyZGVkWyd0ZSddLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcndhcmRlZFsndXBncmFkZSddLCB1bmRlZmluZWQpO1xuXHRcdFx0Ly8gSGVhZGVycyBuYW1lZCBpbiBDb25uZWN0aW9uIG11c3QgYWxzbyBiZSByZW1vdmVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9yd2FyZGVkWyd4LWN1c3RvbS1ob3AnXSwgdW5kZWZpbmVkKTtcblx0XHRcdC8vIE5vdGU6IGNvbm5lY3Rpb24gaXRzZWxmIGlzIHJlcGxhY2VkIGJ5IE5vZGUncyBodHRwLkFnZW50IHdpdGhcblx0XHRcdC8vIGl0cyBvd24gdmFsdWUgKGUuZy4gXCJrZWVwLWFsaXZlXCIpLCB3aGljaCBpcyBjb3JyZWN0IHBlciBSRkMgOTExMFxuXHRcdFx0Ly8gXHUyMDE0IHRoZSBwcm94eSByZXBsYWNlcyBpdCB3aXRoIGl0cyBvd24gY29ubmVjdGlvbiBvcHRpb25zLlxuXHRcdFx0Ly8gRW5kLXRvLWVuZCBoZWFkZXJzIG11c3Qgc3Vydml2ZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcndhcmRlZFsneC1lbmQtdG8tZW5kJ10sICdzaG91bGQtc3Vydml2ZScpO1xuXHRcdFx0cHJveHkyLmRpc3Bvc2UoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aGVhZGVyU2VydmVyLmNsb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIDQwMCBmb3IgbWFsZm9ybWVkIFVSTCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXMgPSBhd2FpdCBwcm94eVJlcXVlc3QocHJveHlJbmZvLCB7XG5cdFx0XHRwYXRoOiAnbm90LWEtdmFsaWQtdXJsJyxcblx0XHRcdGF1dGg6IHRydWUsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXNDb2RlLCA0MDApO1xuXHR9KTtcblxuXHQvLyAtLS0gQWdlbnQgY29ubmVjdGlvbiBwb29saW5nIC0tLVxuXG5cdHRlc3QoJ3JldXNlcyB0dW5uZWwgc29ja2V0IGZvciBtdWx0aXBsZSByZXF1ZXN0cyB0byB0aGUgc2FtZSBob3N0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG5ldCA9IGF3YWl0IGltcG9ydCgnbmV0Jyk7XG5cdFx0bGV0IGNvbm5lY3RDb3VudCA9IDA7XG5cdFx0Y29uc3QgY291bnRpbmdDb25uZWN0OiBJVHVubmVsQ29ubmVjdEZuID0gYXN5bmMgKF9ob3N0LCBfcG9ydCkgPT4ge1xuXHRcdFx0Y29ubmVjdENvdW50Kys7XG5cdFx0XHRjb25zdCBzb2NrZXQgPSBuZXQuY3JlYXRlQ29ubmVjdGlvbih7IGhvc3Q6ICcxMjcuMC4wLjEnLCBwb3J0OiB0YXJnZXRQb3J0IH0pO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRzb2NrZXQub25jZSgnY29ubmVjdCcsIHJlc29sdmUpO1xuXHRcdFx0XHRzb2NrZXQub25jZSgnZXJyb3InLCByZWplY3QpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gbW9ja1R1bm5lbFByb3RvY29sKHNvY2tldCk7XG5cdFx0fTtcblx0XHRjb25zdCBwb29sUHJveHkgPSBkcy5hZGQobmV3IFR1bm5lbFByb3h5KGNvdW50aW5nQ29ubmVjdCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBwb29sSW5mbyA9IGF3YWl0IHBvb2xQcm94eS5zdGFydCgpO1xuXG5cdFx0Ly8gU2VuZCB0aHJlZSBzZXF1ZW50aWFsIHJlcXVlc3RzIHRvIHRoZSBzYW1lIGhvc3Q6cG9ydFxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSB7XG5cdFx0XHRjb25zdCByZXMgPSBhd2FpdCBwcm94eVJlcXVlc3QocG9vbEluZm8sIHtcblx0XHRcdFx0cGF0aDogYGh0dHA6Ly8xMjcuMC4wLjE6JHt0YXJnZXRQb3J0fS9yZXEke2l9YCxcblx0XHRcdFx0YXV0aDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXNDb2RlLCAyMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5ib2R5LCBgRUNITyBHRVQgL3JlcSR7aX1gKTtcblx0XHR9XG5cblx0XHQvLyBUaGUgYWdlbnQgc2hvdWxkIGhhdmUgb3BlbmVkIG9ubHkgb25lIHR1bm5lbCBjb25uZWN0aW9uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3RDb3VudCwgMSwgYEV4cGVjdGVkIDEgdHVubmVsIGNvbm5lY3Rpb24sIGdvdCAke2Nvbm5lY3RDb3VudH1gKTtcblx0XHRwb29sUHJveHkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkcmFpbkNvbm5lY3Rpb25Qb29sIGRlc3Ryb3lzIHBvb2xlZCB0dW5uZWwgc29ja2V0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBuZXQgPSBhd2FpdCBpbXBvcnQoJ25ldCcpO1xuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUgdXBzdHJlYW0gbmV0LlNvY2tldCB0aGUgYWdlbnQgcG9vbHMgc28gd2UgY2FuXG5cdFx0Ly8gYXNzZXJ0IGl0IGlzIGRyb3BwZWQgd2hlbiB0aGUgdXBzdHJlYW0gZW5kcG9pbnQgY2hhbmdlcy5cblx0XHRjb25zdCByZW1vdGVTb2NrZXRzOiBpbXBvcnQoJ25ldCcpLlNvY2tldFtdID0gW107XG5cdFx0Y29uc3QgY29ubmVjdEZuOiBJVHVubmVsQ29ubmVjdEZuID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc29ja2V0ID0gbmV0LmNyZWF0ZUNvbm5lY3Rpb24oeyBob3N0OiAnMTI3LjAuMC4xJywgcG9ydDogdGFyZ2V0UG9ydCB9KTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0c29ja2V0Lm9uY2UoJ2Nvbm5lY3QnLCByZXNvbHZlKTtcblx0XHRcdFx0c29ja2V0Lm9uY2UoJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRcdH0pO1xuXHRcdFx0cmVtb3RlU29ja2V0cy5wdXNoKHNvY2tldCk7XG5cdFx0XHRyZXR1cm4gbW9ja1R1bm5lbFByb3RvY29sKHNvY2tldCk7XG5cdFx0fTtcblx0XHRjb25zdCBwID0gZHMuYWRkKG5ldyBUdW5uZWxQcm94eShjb25uZWN0Rm4sIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHAuc3RhcnQoKTtcblxuXHRcdC8vIE9uZSByZXF1ZXN0IHBvb2xzIG9uZSBrZWVwLWFsaXZlIHR1bm5lbCBzb2NrZXQuXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgcHJveHlSZXF1ZXN0KGluZm8sIHsgcGF0aDogYGh0dHA6Ly8xMjcuMC4wLjE6JHt0YXJnZXRQb3J0fS9gLCBhdXRoOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzQ29kZSwgMjAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3RlU29ja2V0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdGVTb2NrZXRzWzBdLmRlc3Ryb3llZCwgZmFsc2UpO1xuXG5cdFx0Ly8gU2ltdWxhdGluZyBhbiB1cHN0cmVhbSBlbmRwb2ludCBjaGFuZ2UgbXVzdCBkcm9wIHRoZSBub3ctc3RhbGVcblx0XHQvLyBwb29sZWQgc29ja2V0IHNvIGl0IGlzbid0IHJlc2V0IGxhdGVyIGJ5IHRoZSBkZWFkIGVuZHBvaW50LlxuXHRcdGNvbnN0IGNsb3NlZCA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gcmVtb3RlU29ja2V0c1swXS5vbmNlKCdjbG9zZScsICgpID0+IHJlc29sdmUoKSkpO1xuXHRcdHAuZHJhaW5Db25uZWN0aW9uUG9vbCgpO1xuXHRcdGF3YWl0IGNsb3NlZDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3RlU29ja2V0c1swXS5kZXN0cm95ZWQsIHRydWUpO1xuXG5cdFx0cC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgcmVzZXQgb24gYSBwb29sZWQgdHVubmVsIHNvY2tldCBkb2VzIG5vdCBlc2NhbGF0ZSB0byBhbiB1bmNhdWdodCBleGNlcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbmV0ID0gYXdhaXQgaW1wb3J0KCduZXQnKTtcblxuXHRcdC8vIENhcHR1cmUgdGhlIHBvb2xlZCB1cHN0cmVhbSBuZXQuU29ja2V0IHNvIHdlIGNhbiBzaW11bGF0ZSB0aGVcblx0XHQvLyB1cHN0cmVhbSBlbmRwb2ludCByZXNldHRpbmcgaXQuXG5cdFx0Y29uc3QgcmVtb3RlU29ja2V0czogaW1wb3J0KCduZXQnKS5Tb2NrZXRbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbm5lY3RGbjogSVR1bm5lbENvbm5lY3RGbiA9IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNvY2tldCA9IG5ldC5jcmVhdGVDb25uZWN0aW9uKHsgaG9zdDogJzEyNy4wLjAuMScsIHBvcnQ6IHRhcmdldFBvcnQgfSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdHNvY2tldC5vbmNlKCdjb25uZWN0JywgcmVzb2x2ZSk7XG5cdFx0XHRcdHNvY2tldC5vbmNlKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0XHR9KTtcblx0XHRcdHJlbW90ZVNvY2tldHMucHVzaChzb2NrZXQpO1xuXHRcdFx0cmV0dXJuIG1vY2tUdW5uZWxQcm90b2NvbChzb2NrZXQpO1xuXHRcdH07XG5cdFx0Y29uc3QgcCA9IGRzLmFkZChuZXcgVHVubmVsUHJveHkoY29ubmVjdEZuLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IGluZm8gPSBhd2FpdCBwLnN0YXJ0KCk7XG5cblx0XHRjb25zdCByZXMgPSBhd2FpdCBwcm94eVJlcXVlc3QoaW5mbywgeyBwYXRoOiBgaHR0cDovLzEyNy4wLjAuMToke3RhcmdldFBvcnR9L2AsIGF1dGg6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXNDb2RlLCAyMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdGVTb2NrZXRzLmxlbmd0aCwgMSk7XG5cblx0XHQvLyBXaGVuIHRoZSB1cHN0cmVhbSBlbmRwb2ludCBkaWVzLCB0aGUgcG9vbGVkIHNvY2tldCBpcyByZXNldC5cblx0XHQvLyBUaGUgcHJveHkgdGFrZXMgb3duZXJzaGlwIG9mIHRoZSByYXcgc29ja2V0IChkZXRhY2hpbmdcblx0XHQvLyBOb2RlU29ja2V0J3MgbGlzdGVuZXJzLCB3aGljaCB3b3VsZCBvdGhlcndpc2Ugcm91dGUgdGhlIGVycm9yXG5cdFx0Ly8gdGhyb3VnaCBvblVuZXhwZWN0ZWRFcnJvcikgYW5kIGF0dGFjaGVzIGl0cyBvd24gJ2Vycm9yJ1xuXHRcdC8vIGhhbmRsZXIsIHNvIHRoZSByZXNldCBpcyBjb250YWluZWQgcmF0aGVyIHRoYW4gdGhyb3duIG9yXG5cdFx0Ly8gcmVwb3J0ZWQgYXMgYW4gdW5leHBlY3RlZCBlcnJvci5cblx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHJlbW90ZVNvY2tldHNbMF0uZW1pdCgnZXJyb3InLCBuZXcgRXJyb3IoJ3NpbXVsYXRlZCB1cHN0cmVhbSByZXNldCcpKSk7XG5cblx0XHRwLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0Ly8gLS0tIENPTk5FQ1QgdHVubmVsaW5nIC0tLVxuXG5cdHRlc3QoJ0NPTk5FQ1QgZXN0YWJsaXNoZXMgYSB0dW5uZWwgdG8gdGhlIHRhcmdldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHN0YXR1c0NvZGUsIHNvY2tldCB9ID0gYXdhaXQgcHJveHlDb25uZWN0KFxuXHRcdFx0cHJveHlJbmZvLFxuXHRcdFx0YDEyNy4wLjAuMToke3RhcmdldFBvcnR9YCxcblx0XHRcdHRydWUsXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdHVzQ29kZSwgMjAwKTtcblxuXHRcdC8vIFNlbmQgYSByYXcgSFRUUCByZXF1ZXN0IHRocm91Z2ggdGhlIHR1bm5lbFxuXHRcdHNvY2tldC53cml0ZShgR0VUIC90dW5uZWxlZCBIVFRQLzEuMVxcclxcbkhvc3Q6IDEyNy4wLjAuMToke3RhcmdldFBvcnR9XFxyXFxuQ29ubmVjdGlvbjogY2xvc2VcXHJcXG5cXHJcXG5gKTtcblx0XHRjb25zdCBib2R5ID0gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCBjaHVua3M6IEJ1ZmZlcltdID0gW107XG5cdFx0XHRzb2NrZXQub24oJ2RhdGEnLCBjID0+IGNodW5rcy5wdXNoKGMpKTtcblx0XHRcdHNvY2tldC5vbignZW5kJywgKCkgPT4gcmVzb2x2ZShCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoKSkpO1xuXHRcdFx0c29ja2V0Lm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0Lm9rKGJvZHkuaW5jbHVkZXMoJ0VDSE8gR0VUIC90dW5uZWxlZCcpLCBgRXhwZWN0ZWQgdHVubmVsZWQgZWNobywgZ290OiAke2JvZHl9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NPTk5FQ1QgcmVqZWN0cyBpbnZhbGlkIHBvcnQgMCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHN0YXR1c0NvZGUsIHNvY2tldCB9ID0gYXdhaXQgcHJveHlDb25uZWN0KHByb3h5SW5mbywgJzEyNy4wLjAuMTowJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXR1c0NvZGUsIDQwMCk7XG5cdFx0c29ja2V0LmVuZCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdDT05ORUNUIHJlamVjdHMgcG9ydCA+IDY1NTM1JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc3RhdHVzQ29kZSwgc29ja2V0IH0gPSBhd2FpdCBwcm94eUNvbm5lY3QocHJveHlJbmZvLCAnMTI3LjAuMC4xOjk5OTk5JywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXR1c0NvZGUsIDQwMCk7XG5cdFx0c29ja2V0LmVuZCgpO1xuXHR9KTtcblxuXHQvLyAtLS0gRXJyb3IgaGFuZGxpbmcgLS0tXG5cblx0dGVzdCgnZmFpbHMgdGhlIHJlcXVlc3Qgd2hlbiB0aGUgdHVubmVsIGNvbm5lY3Rpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQSBmYWlsZWQgdHVubmVsIC0gd2hldGhlciB0aGUgcmVtb3RlIGFnZW50IGl0c2VsZiBpcyB1bnJlYWNoYWJsZSBvclxuXHRcdC8vIHRoZSByZW1vdGUgcmVwb3J0cyAodmlhIHRoZSBoYW5kc2hha2UpIHRoYXQgdGhlIHRhcmdldCBob3N0OnBvcnQgaXNcblx0XHQvLyB1bnJlYWNoYWJsZSAtIHN1cmZhY2VzIGhlcmUgYXMgYSByZWplY3RlZCBjb25uZWN0IGZ1bmN0aW9uLlxuXHRcdGNvbnN0IGZhaWxpbmdDb25uZWN0OiBJVHVubmVsQ29ubmVjdEZuID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdjb25uZWN0IEVDT05OUkVGVVNFRCAxMjcuMC4wLjE6OTk5OScpO1xuXHRcdH07XG5cdFx0Y29uc3QgZmFpbFByb3h5ID0gZHMuYWRkKG5ldyBUdW5uZWxQcm94eShmYWlsaW5nQ29ubmVjdCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBmYWlsSW5mbyA9IGF3YWl0IGZhaWxQcm94eS5zdGFydCgpO1xuXG5cdFx0Ly8gUGxhaW4gSFRUUCByZXF1ZXN0OiB0aGUgY2xpZW50IGNvbm5lY3Rpb24gaXMgcmVzZXQgKG5vIEhUVFBcblx0XHQvLyByZXNwb25zZSkgc28gdGhlIGJyb3dzZXIgc2hvd3MgaXRzIG5hdGl2ZSBlcnJvciBwYWdlLlxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHByb3h5UmVxdWVzdChmYWlsSW5mbywge1xuXHRcdFx0cGF0aDogJ2h0dHA6Ly91bnJlYWNoYWJsZS5leGFtcGxlLmNvbS9wYXRoJyxcblx0XHRcdGF1dGg6IHRydWUsXG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ09OTkVDVCBzaG91bGQgZmFpbCB3aXRoIGEgNTAyICh3aGljaCB0aGUgYnJvd3NlciBzdXJmYWNlcyBhcyBhXG5cdFx0Ly8gbmF0aXZlIHR1bm5lbCBlcnJvciBwYWdlKS5cblx0XHRjb25zdCB7IHN0YXR1c0NvZGUsIHNvY2tldCB9ID0gYXdhaXQgcHJveHlDb25uZWN0KGZhaWxJbmZvLCAndW5yZWFjaGFibGUuZXhhbXBsZS5jb206NDQzJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXR1c0NvZGUsIDUwMik7XG5cdFx0c29ja2V0LmVuZCgpO1xuXG5cdFx0ZmFpbFByb3h5LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0Ly8gLS0tIExpZmVjeWNsZSAtLS1cblxuXHR0ZXN0KCdkaXNwb3NlIHNodXRzIGRvd24gdGhlIHNlcnZlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uZWN0Rm4gPSBjcmVhdGVNb2NrQ29ubmVjdEZuKHRhcmdldFBvcnQpO1xuXHRcdGNvbnN0IHAgPSBkcy5hZGQobmV3IFR1bm5lbFByb3h5KGNvbm5lY3RGbiwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBpbmZvID0gYXdhaXQgcC5zdGFydCgpO1xuXHRcdHAuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gQ29ubmVjdGlvbiBzaG91bGQgYmUgcmVmdXNlZCBhZnRlciBkaXNwb3NlXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBwcm94eVJlcXVlc3QoaW5mbywgeyBwYXRoOiBgaHR0cDovLzEyNy4wLjAuMToke3RhcmdldFBvcnR9L2AsIGF1dGg6IHRydWUgfSksXG5cdFx0XHQvRUNPTk5SRUZVU0VELyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlIHRlcm1pbmF0ZXMgYWN0aXZlIENPTk5FQ1QgdHVubmVscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uZWN0Rm4gPSBjcmVhdGVNb2NrQ29ubmVjdEZuKHRhcmdldFBvcnQpO1xuXHRcdGNvbnN0IHAgPSBkcy5hZGQobmV3IFR1bm5lbFByb3h5KGNvbm5lY3RGbiwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBpbmZvID0gYXdhaXQgcC5zdGFydCgpO1xuXG5cdFx0Ly8gT3BlbiBhIENPTk5FQ1QgdHVubmVsIGFuZCBrZWVwIGl0IG9wZW4gKG5vIGVuZC9kZXN0cm95KS5cblx0XHRjb25zdCB7IHN0YXR1c0NvZGUsIHNvY2tldCB9ID0gYXdhaXQgcHJveHlDb25uZWN0KGluZm8sIGAxMjcuMC4wLjE6JHt0YXJnZXRQb3J0fWAsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0dXNDb2RlLCAyMDApO1xuXG5cdFx0Y29uc3QgY2xvc2VkID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzb2NrZXQub25jZSgnY2xvc2UnLCAoKSA9PiByZXNvbHZlKCkpKTtcblxuXHRcdHAuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gVGhlIHByZXZpb3VzbHktYWN0aXZlIENPTk5FQ1Qgc29ja2V0IG11c3QgYmUgZm9yY2UtY2xvc2VkIGJ5XG5cdFx0Ly8gZGlzcG9zZTsgd2l0aG91dCBleHBsaWNpdCB0ZWFyZG93biBvZiB0aGVzZSBzb2NrZXRzLFxuXHRcdC8vIGBzZXJ2ZXIuY2xvc2UoKWAgYWxvbmUgd291bGQgbGVhdmUgdGhlIHBvcnQgYm91bmQgaW5kZWZpbml0ZWx5LlxuXHRcdGF3YWl0IGNsb3NlZDtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSBzeW5jaHJvbm91c2x5IGRlc3Ryb3lzIHRoZSByZW1vdGUgdHVubmVsIHNvY2tldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBuZXQgPSBhd2FpdCBpbXBvcnQoJ25ldCcpO1xuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUgcmVtb3RlICh1cHN0cmVhbSkgbmV0LlNvY2tldCBoYW5kZWQgb3V0IGJ5IHRoZVxuXHRcdC8vIHR1bm5lbCBzbyB3ZSBjYW4gYXNzZXJ0IGRpc3Bvc2UgdGVhcnMgaXQgZG93biBkaXJlY3RseSwgcmF0aGVyXG5cdFx0Ly8gdGhhbiByZWx5aW5nIG9uIHRoZSBsb2NhbCBzb2NrZXQncyBhc3luYyAnY2xvc2UnIHRvIHByb3BhZ2F0ZS5cblx0XHRjb25zdCByZW1vdGVTb2NrZXRzOiBpbXBvcnQoJ25ldCcpLlNvY2tldFtdID0gW107XG5cdFx0Y29uc3QgY29ubmVjdEZuOiBJVHVubmVsQ29ubmVjdEZuID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc29ja2V0ID0gbmV0LmNyZWF0ZUNvbm5lY3Rpb24oeyBob3N0OiAnMTI3LjAuMC4xJywgcG9ydDogdGFyZ2V0UG9ydCB9KTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0c29ja2V0Lm9uY2UoJ2Nvbm5lY3QnLCByZXNvbHZlKTtcblx0XHRcdFx0c29ja2V0Lm9uY2UoJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRcdH0pO1xuXHRcdFx0cmVtb3RlU29ja2V0cy5wdXNoKHNvY2tldCk7XG5cdFx0XHRyZXR1cm4gbW9ja1R1bm5lbFByb3RvY29sKHNvY2tldCk7XG5cdFx0fTtcblx0XHRjb25zdCBwID0gZHMuYWRkKG5ldyBUdW5uZWxQcm94eShjb25uZWN0Rm4sIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHAuc3RhcnQoKTtcblxuXHRcdGNvbnN0IHsgc3RhdHVzQ29kZSwgc29ja2V0IH0gPSBhd2FpdCBwcm94eUNvbm5lY3QoaW5mbywgYDEyNy4wLjAuMToke3RhcmdldFBvcnR9YCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXR1c0NvZGUsIDIwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW90ZVNvY2tldHMubGVuZ3RoLCAxKTtcblxuXHRcdHAuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gVGhlIHJlbW90ZSBzb2NrZXQgbXVzdCBiZSBkZXN0cm95ZWQgYnkgdGhlIHRpbWUgZGlzcG9zZSByZXR1cm5zIFx1MjAxNFxuXHRcdC8vIG5vIGV4dHJhIGV2ZW50LWxvb3AgdHVybiByZXF1aXJlZC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3RlU29ja2V0c1swXS5kZXN0cm95ZWQsIHRydWUpO1xuXHRcdHNvY2tldC5lbmQoKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSB0ZXJtaW5hdGVzIENPTk5FQ1Qgc29ja2V0cyBzdHVjayB3YWl0aW5nIGZvciB0aGUgdXBzdHJlYW0gdHVubmVsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRscyA9IGF3YWl0IGltcG9ydCgndGxzJyk7XG5cblx0XHQvLyBNb2NrIGNvbm5lY3QgdGhhdCBuZXZlciByZXNvbHZlcyBcdTIwMTQgc2ltdWxhdGVzIGEgc2xvdy9odW5nXG5cdFx0Ly8gdXBzdHJlYW0gdHVubmVsLiBUaGUgQ09OTkVDVCBzb2NrZXQgc2l0cyBpbiBsaW1ibyBiZXR3ZWVuIHRoZVxuXHRcdC8vIGBjb25uZWN0YCBldmVudCBmaXJpbmcgYW5kIHRoZSB1cHN0cmVhbSByZXR1cm5pbmcsIGFuZCBtdXN0XG5cdFx0Ly8gc3RpbGwgYmUgdG9ybiBkb3duIGJ5IGRpc3Bvc2UuXG5cdFx0bGV0IGNvbm5lY3RDYWxsZWQ6ICgpID0+IHZvaWQ7XG5cdFx0Y29uc3QgY29ubmVjdENhbGxlZFByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHsgY29ubmVjdENhbGxlZCA9IHJlc29sdmU7IH0pO1xuXHRcdGNvbnN0IGhhbmdpbmdDb25uZWN0OiBJVHVubmVsQ29ubmVjdEZuID0gKCkgPT4ge1xuXHRcdFx0Y29ubmVjdENhbGxlZCgpO1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHsgLyogbmV2ZXIgcmVzb2x2ZXMgKi8gfSk7XG5cdFx0fTtcblx0XHRjb25zdCBwID0gZHMuYWRkKG5ldyBUdW5uZWxQcm94eShoYW5naW5nQ29ubmVjdCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBpbmZvID0gYXdhaXQgcC5zdGFydCgpO1xuXG5cdFx0Y29uc3QgY2xpZW50U29ja2V0ID0gYXdhaXQgbmV3IFByb21pc2U8VExTU29ja2V0PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCBzID0gdGxzLmNvbm5lY3Qoe1xuXHRcdFx0XHRob3N0OiAnMTI3LjAuMC4xJyxcblx0XHRcdFx0cG9ydDogaW5mby5wb3J0LFxuXHRcdFx0XHRyZWplY3RVbmF1dGhvcml6ZWQ6IGZhbHNlLFxuXHRcdFx0fSwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBhdXRoSGVhZGVyID0gJ0Jhc2ljICcgKyBCdWZmZXIuZnJvbShgJHtpbmZvLmNyZWRlbnRpYWxzLnVzZXJuYW1lfToke2luZm8uY3JlZGVudGlhbHMucGFzc3dvcmR9YCkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuXHRcdFx0XHRzLndyaXRlKGBDT05ORUNUIDEyNy4wLjAuMToke3RhcmdldFBvcnR9IEhUVFAvMS4xXFxyXFxuSG9zdDogMTI3LjAuMC4xOiR7dGFyZ2V0UG9ydH1cXHJcXG5Qcm94eS1BdXRob3JpemF0aW9uOiAke2F1dGhIZWFkZXJ9XFxyXFxuXFxyXFxuYCk7XG5cdFx0XHRcdHJlc29sdmUocyk7XG5cdFx0XHR9KTtcblx0XHRcdHMub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHR9KTtcblxuXHRcdC8vIFdhaXQgdW50aWwgdGhlIHByb3h5IGhhcyBlbnRlcmVkIHRoZSBoYW5naW5nIHVwc3RyZWFtIGNhbGwgc29cblx0XHQvLyB0aGUgc29ja2V0IGlzIHJlZ2lzdGVyZWQgaW4gX2Nvbm5lY3RTb2NrZXRzLlxuXHRcdGF3YWl0IGNvbm5lY3RDYWxsZWRQcm9taXNlO1xuXG5cdFx0Y29uc3QgY2xvc2VkID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBjbGllbnRTb2NrZXQub25jZSgnY2xvc2UnLCAoKSA9PiByZXNvbHZlKCkpKTtcblx0XHRwLmRpc3Bvc2UoKTtcblx0XHRhd2FpdCBjbG9zZWQ7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2UgdGVybWluYXRlcyBpZGxlIEhUVFBTIGtlZXAtYWxpdmUgY29ubmVjdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaHR0cHMgPSBhd2FpdCBpbXBvcnQoJ2h0dHBzJyk7XG5cdFx0Y29uc3QgY29ubmVjdEZuID0gY3JlYXRlTW9ja0Nvbm5lY3RGbih0YXJnZXRQb3J0KTtcblx0XHRjb25zdCBwID0gZHMuYWRkKG5ldyBUdW5uZWxQcm94eShjb25uZWN0Rm4sIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHAuc3RhcnQoKTtcblxuXHRcdC8vIFNlbmQgb25lIHJlcXVlc3Qgd2l0aCBrZWVwLWFsaXZlIHNvIHRoZSBjbGllbnQvc2VydmVyIHBhaXIgaG9sZHNcblx0XHQvLyB0aGUgVExTIGNvbm5lY3Rpb24gb3BlbiBhZnRlciB0aGUgcmVzcG9uc2UuIFdpdGhvdXRcblx0XHQvLyBgc2VydmVyLmNsb3NlQWxsQ29ubmVjdGlvbnMoKWAgb24gZGlzcG9zZSwgdGhpcyBzb2NrZXQgd291bGRcblx0XHQvLyBsaW5nZXIgdW50aWwgZWl0aGVyIHNpZGUgdGltZWQgb3V0LlxuXHRcdGNvbnN0IGFnZW50ID0gbmV3IGh0dHBzLkFnZW50KHsga2VlcEFsaXZlOiB0cnVlLCByZWplY3RVbmF1dGhvcml6ZWQ6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IHJlc3BvbnNlU29ja2V0ID0gYXdhaXQgbmV3IFByb21pc2U8VExTU29ja2V0PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRsZXQgc29ja2V0OiBUTFNTb2NrZXQgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCByZXEgPSBodHRwcy5yZXF1ZXN0KHtcblx0XHRcdFx0YWdlbnQsXG5cdFx0XHRcdGhvc3RuYW1lOiAnMTI3LjAuMC4xJyxcblx0XHRcdFx0cG9ydDogaW5mby5wb3J0LFxuXHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRwYXRoOiBgaHR0cDovLzEyNy4wLjAuMToke3RhcmdldFBvcnR9L2tlZXBhbGl2ZWAsXG5cdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHQnUHJveHktQXV0aG9yaXphdGlvbic6ICdCYXNpYyAnICsgQnVmZmVyLmZyb20oYCR7aW5mby5jcmVkZW50aWFscy51c2VybmFtZX06JHtpbmZvLmNyZWRlbnRpYWxzLnBhc3N3b3JkfWApLnRvU3RyaW5nKCdiYXNlNjQnKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHJlcyA9PiB7XG5cdFx0XHRcdHJlcy5vbignZGF0YScsICgpID0+IHsgLyogZHJhaW4gKi8gfSk7XG5cdFx0XHRcdHJlcy5vbignZW5kJywgKCkgPT4gcmVzb2x2ZShzb2NrZXQhKSk7XG5cdFx0XHR9KTtcblx0XHRcdHJlcS5vbignc29ja2V0JywgcyA9PiB7IHNvY2tldCA9IHMgYXMgVExTU29ja2V0OyB9KTtcblx0XHRcdHJlcS5vbignZXJyb3InLCByZWplY3QpO1xuXHRcdFx0cmVxLmVuZCgpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2xvc2VkID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiByZXNwb25zZVNvY2tldC5vbmNlKCdjbG9zZScsICgpID0+IHJlc29sdmUoKSkpO1xuXG5cdFx0cC5kaXNwb3NlKCk7XG5cdFx0YWdlbnQuZGVzdHJveSgpO1xuXG5cdFx0YXdhaXQgY2xvc2VkO1xuXHR9KTtcblxuXHQvLyAtLS0gTWFuYWdlZCAobm9uLU5vZGVTb2NrZXQpIHRyYW5zcG9ydCAtLS1cblx0Ly9cblx0Ly8gRXhlYy1zZXJ2ZXIgLyBtYW5hZ2VkIGNvbm5lY3Rpb25zIHlpZWxkIGEgZ2VuZXJpYyBJU29ja2V0IHdpdGggbm9cblx0Ly8gdW5kZXJseWluZyBuZXQuU29ja2V0LCBzbyB0aGUgcHJveHkgYnJpZGdlcyB0aGVtIHRocm91Z2ggaXRzXG5cdC8vIFJlbW90ZVNvY2tldFN0cmVhbSBEdXBsZXggYWRhcHRlciBpbnN0ZWFkIG9mIHRoZSByYXctc29ja2V0IGZhc3QgcGF0aC5cblx0c3VpdGUoJ21hbmFnZWQgKG5vbi1Ob2RlU29ja2V0KSB0cmFuc3BvcnQnLCAoKSA9PiB7XG5cblx0XHRsZXQgbWFuYWdlZFByb3h5OiBUdW5uZWxQcm94eTtcblx0XHRsZXQgbWFuYWdlZEluZm86IElUdW5uZWxQcm94eUluZm87XG5cblx0XHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VkUHJveHkgPSBkcy5hZGQobmV3IFR1bm5lbFByb3h5KGNyZWF0ZU1hbmFnZWRDb25uZWN0Rm4odGFyZ2V0UG9ydCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRtYW5hZ2VkSW5mbyA9IGF3YWl0IG1hbmFnZWRQcm94eS5zdGFydCgpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0bWFuYWdlZFByb3h5LmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvcndhcmRzIGFuIGF1dGhlbnRpY2F0ZWQgSFRUUCBHRVQgdGhyb3VnaCBhIG1hbmFnZWQgc29ja2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgcHJveHlSZXF1ZXN0KG1hbmFnZWRJbmZvLCB7XG5cdFx0XHRcdHBhdGg6IGBodHRwOi8vMTI3LjAuMC4xOiR7dGFyZ2V0UG9ydH0vbWFuYWdlZC9wYXRoYCxcblx0XHRcdFx0YXV0aDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXNDb2RlLCAyMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5ib2R5LCAnRUNITyBHRVQgL21hbmFnZWQvcGF0aCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ09OTkVDVCB0dW5uZWxzIGJpZGlyZWN0aW9uYWwgZGF0YSB0aHJvdWdoIGEgbWFuYWdlZCBzb2NrZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHN0YXR1c0NvZGUsIHNvY2tldCB9ID0gYXdhaXQgcHJveHlDb25uZWN0KG1hbmFnZWRJbmZvLCBgMTI3LjAuMC4xOiR7dGFyZ2V0UG9ydH1gLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0dXNDb2RlLCAyMDApO1xuXG5cdFx0XHQvLyBXcml0ZSBhIHJlcXVlc3QgdXAgdGhlIHR1bm5lbCBhbmQgcmVhZCB0aGUgZWNob2VkIHJlc3BvbnNlIGJhY2tcblx0XHRcdC8vIGRvd24gaXQsIHByb3ZpbmcgdGhlIGFkYXB0ZXIgYnJpZGdlcyBib3RoIGRpcmVjdGlvbnMuXG5cdFx0XHRzb2NrZXQud3JpdGUoYEdFVCAvbWFuYWdlZC10dW5uZWwgSFRUUC8xLjFcXHJcXG5Ib3N0OiAxMjcuMC4wLjE6JHt0YXJnZXRQb3J0fVxcclxcbkNvbm5lY3Rpb246IGNsb3NlXFxyXFxuXFxyXFxuYCk7XG5cdFx0XHRjb25zdCBib2R5ID0gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRcdFx0c29ja2V0Lm9uKCdkYXRhJywgYyA9PiBjaHVua3MucHVzaChjKSk7XG5cdFx0XHRcdHNvY2tldC5vbignZW5kJywgKCkgPT4gcmVzb2x2ZShCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoKSkpO1xuXHRcdFx0XHRzb2NrZXQub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGJvZHkuaW5jbHVkZXMoJ0VDSE8gR0VUIC9tYW5hZ2VkLXR1bm5lbCcpLCBgRXhwZWN0ZWQgdHVubmVsZWQgZWNobywgZ290OiAke2JvZHl9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NlIGRpc3Bvc2VzIHRoZSBtYW5hZ2VkIHJlbW90ZSBzb2NrZXQgdmlhIHRoZSBhZGFwdGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNhcHR1cmVkOiBNYW5hZ2VkVGVzdFNvY2tldCB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHAgPSBkcy5hZGQobmV3IFR1bm5lbFByb3h5KGNyZWF0ZU1hbmFnZWRDb25uZWN0Rm4odGFyZ2V0UG9ydCwgcyA9PiB7IGNhcHR1cmVkID0gczsgfSksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBpbmZvID0gYXdhaXQgcC5zdGFydCgpO1xuXG5cdFx0XHRjb25zdCB7IHN0YXR1c0NvZGUsIHNvY2tldCB9ID0gYXdhaXQgcHJveHlDb25uZWN0KGluZm8sIGAxMjcuMC4wLjE6JHt0YXJnZXRQb3J0fWAsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXR1c0NvZGUsIDIwMCk7XG5cdFx0XHRhc3NlcnQub2soY2FwdHVyZWQpO1xuXG5cdFx0XHRwLmRpc3Bvc2UoKTtcblxuXHRcdFx0Ly8gRGVzdHJveWluZyB0aGUgYWRhcHRlciAoUmVtb3RlU29ja2V0U3RyZWFtKSBvbiBkaXNwb3NlIG11c3QgZGlzcG9zZVxuXHRcdFx0Ly8gdGhlIHVuZGVybHlpbmcgbWFuYWdlZCBzb2NrZXQsIG1pcnJvcmluZyBob3cgdGhlIE5vZGVTb2NrZXQgcGF0aFxuXHRcdFx0Ly8gZGVzdHJveXMgdGhlIHJhdyBuZXQuU29ja2V0LlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkLmlzRGlzcG9zZWQsIHRydWUpO1xuXHRcdFx0c29ja2V0LmVuZCgpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBSW5CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQTJCLG1CQUFtQjtBQUU5QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFvQyw0QkFBNEI7QUFDaEUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQStCO0FBV3hDLFNBQVMsbUJBQW1CLFFBQThCO0FBQ3pELFNBQU87QUFBQSxJQUNOLFdBQVcsTUFBTSxJQUFJLFdBQVcsTUFBTTtBQUFBLElBQ3RDLGtCQUFrQixNQUFNLFNBQVMsTUFBTSxDQUFDO0FBQUEsSUFDeEMsU0FBUyxNQUFNO0FBQUEsSUFBOEM7QUFBQSxFQUM5RDtBQUNEO0FBUUEsU0FBUyxvQkFBb0IsWUFBc0M7QUFDbEUsU0FBTyxPQUFPLE9BQWUsVUFBa0I7QUFDOUMsVUFBTSxNQUFNLE1BQU0sT0FBTyxLQUFLO0FBQzlCLFVBQU0sU0FBUyxJQUFJLGlCQUFpQixFQUFFLE1BQU0sYUFBYSxNQUFNLFdBQVcsQ0FBQztBQUMzRSxVQUFNLElBQUksUUFBYyxDQUFDLFNB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QUMsQ0FBQztBQUMvRixvQkFBYyxNQUFNLGFBQWEsTUFBTTtBQUFBLElBQ3hDLENBQUM7QUFFRCxhQUFTLE1BQU07QUFDZCxtQkFBYSxRQUFRO0FBQUEsSUFDdEIsQ0FBQztBQUVELFNBQUssK0RBQStELFlBQVk7QUFDL0UsWUFBTSxNQUFNLE1BQU0sYUFBYSxhQUFhO0FBQUEsUUFDM0MsTUFBTSxvQkFBb0IsVUFBVTtBQUFBLFFBQ3BDLE1BQU07QUFBQSxNQUNQLENBQUM7QUFDRCxhQUFPLFlBQVksSUFBSSxZQUFZLEdBQUc7QUFDdEMsYUFBTyxZQUFZLElBQUksTUFBTSx3QkFBd0I7QUFBQSxJQUN0RCxDQUFDO0FBRUQsU0FBSywrREFBK0QsWUFBWTtBQUMvRSxZQUFNLEVBQUUsWUFBWSxPQUFPLElBQUksTUFBTSxhQUFhLGFBQWEsYUFBYSxVQUFVLElBQUksSUFBSTtBQUM5RixhQUFPLFlBQVksWUFBWSxHQUFHO0FBSWxDLGFBQU8sTUFBTTtBQUFBLGtCQUFtRCxVQUFVO0FBQUE7QUFBQTtBQUFBLENBQStCO0FBQ3pHLFlBQU0sT0FBTyxNQUFNLElBQUksUUFBZ0IsQ0FBQyxTQUFTLFdBQVc7QUFDM0QsY0FBTSxTQUFtQixDQUFDO0FBQzFCLGVBQU8sR0FBRyxRQUFRLE9BQUssT0FBTyxLQUFLLENBQUMsQ0FBQztBQUNyQyxlQUFPLEdBQUcsT0FBTyxNQUFNLFFBQVEsT0FBTyxPQUFPLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztBQUNoRSxlQUFPLEdBQUcsU0FBUyxNQUFNO0FBQUEsTUFDMUIsQ0FBQztBQUNELGFBQU8sR0FBRyxLQUFLLFNBQVMsMEJBQTBCLEdBQUcsZ0NBQWdDLElBQUksRUFBRTtBQUFBLElBQzVGLENBQUM7QUFFRCxTQUFLLDhEQUE4RCxZQUFZO0FBQzlFLFVBQUk7QUFDSixZQUFNLElBQUksR0FBRyxJQUFJLElBQUksWUFBWSx1QkFBdUIsWUFBWSxPQUFLO0FBQUUsbUJBQVc7QUFBQSxNQUFHLENBQUMsR0FBRyxJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQ2xILFlBQU0sT0FBTyxNQUFNLEVBQUUsTUFBTTtBQUUzQixZQUFNLEVBQUUsWUFBWSxPQUFPLElBQUksTUFBTSxhQUFhLE1BQU0sYUFBYSxVQUFVLElBQUksSUFBSTtBQUN2RixhQUFPLFlBQVksWUFBWSxHQUFHO0FBQ2xDLGFBQU8sR0FBRyxRQUFRO0FBRWxCLFFBQUUsUUFBUTtBQUtWLGFBQU8sWUFBWSxTQUFTLFlBQVksSUFBSTtBQUM1QyxhQUFPLElBQUk7QUFBQSxJQUNaLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJzb2NrZXQiXQp9Cg==
