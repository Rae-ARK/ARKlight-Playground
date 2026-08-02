import assert from "assert";
import * as net from "net";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import {
  LoopbackProxyServer,
  readProxyRequestBody
} from "../../node/shared/loopbackProxyServer.js";
class TestProxyServer extends LoopbackProxyServer {
  constructor(name = "TestProxyServer") {
    super(name, new NullLogService());
    this.createStateCalls = 0;
    this.requestHandler = async (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    };
  }
  createState() {
    this.createStateCalls++;
    return { value: "" };
  }
  handleRequest(req, res, runtime) {
    return this.requestHandler(req, res, runtime);
  }
  writeInternalError(res) {
    if (this.internalErrorWriter) {
      this.internalErrorWriter(res);
      return;
    }
    super.writeInternalError(res);
  }
  /** Test-only public wrapper around the protected {@link acquire}. */
  async startHandle(value) {
    const { runtime, release } = await this.acquire();
    if (value !== void 0) {
      runtime.state.value = value;
    }
    return {
      baseUrl: runtime.baseUrl,
      nonce: runtime.nonce,
      runtime,
      dispose: release
    };
  }
}
class SeededTestProxyServer extends LoopbackProxyServer {
  constructor(name = "SeededTestProxyServer") {
    super(name, new NullLogService());
    this.seeds = [];
    this.requestHandler = async (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    };
  }
  createState(seed) {
    this.seeds.push(seed);
    return { value: seed };
  }
  handleRequest(req, res, runtime) {
    return this.requestHandler(req, res, runtime);
  }
  /** Test-only public wrapper around the protected {@link acquire}. */
  async startHandle(seed) {
    const { runtime, release } = await this.acquire(seed);
    return {
      baseUrl: runtime.baseUrl,
      nonce: runtime.nonce,
      runtime,
      dispose: release
    };
  }
}
let _httpModule;
async function getHttp() {
  if (!_httpModule) {
    _httpModule = await import("http");
  }
  return _httpModule;
}
function fetchHttp(url, init, onResponse) {
  return getHttp().then((httpMod) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpMod.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: init?.method ?? "GET",
      headers: init?.headers
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let parsed;
        try {
          parsed = body ? JSON.parse(body) : void 0;
        } catch {
          parsed = void 0;
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body, parsed });
      });
      res.on("error", reject);
      onResponse?.(res, () => req.destroy());
    });
    req.on("error", reject);
    if (init?.body !== void 0) {
      req.write(init.body);
    }
    req.end();
  }));
}
async function isConnectionRefused(url) {
  try {
    await fetchHttp(url);
    return false;
  } catch (err) {
    const code = err.code;
    return code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ECONNABORTED";
  }
}
suite("LoopbackProxyServer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("Lifecycle & binding", () => {
    test("startHandle() returns a loopback baseUrl and 256-bit hex nonce", async () => {
      const service = new TestProxyServer();
      const handle = await service.startHandle();
      try {
        assert.match(handle.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
        assert.match(handle.nonce, /^[0-9a-f]{64}$/);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("binds only on the IPv4 loopback interface", async () => {
      const service = new TestProxyServer();
      const handle = await service.startHandle();
      try {
        assert.match(handle.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
        const port = Number(new URL(handle.baseUrl).port);
        const refusedOnIpv6 = await new Promise((resolve) => {
          const socket = net.connect({ host: "::1", port });
          socket.once("connect", () => {
            socket.destroy();
            resolve(false);
          });
          socket.once("error", () => {
            socket.destroy();
            resolve(true);
          });
        });
        assert.strictEqual(refusedOnIpv6, true, "server should not be reachable on ::1");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("serves real requests via handleRequest", async () => {
      const service = new TestProxyServer();
      service.requestHandler = async (_req, res) => {
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ hello: "world" }));
      };
      const handle = await service.startHandle();
      try {
        const res = await fetchHttp(`${handle.baseUrl}/anything`);
        assert.strictEqual(res.status, 201);
        assert.deepStrictEqual(res.parsed, { hello: "world" });
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("handleRequest receives the runtime with baseUrl, nonce and state", async () => {
      const service = new TestProxyServer();
      let seen;
      service.requestHandler = async (_req, res, runtime) => {
        seen = runtime;
        res.writeHead(200);
        res.end();
      };
      const handle = await service.startHandle("payload");
      try {
        await fetchHttp(`${handle.baseUrl}/`);
        assert.strictEqual(seen, handle.runtime);
        assert.strictEqual(seen?.baseUrl, handle.baseUrl);
        assert.strictEqual(seen?.nonce, handle.nonce);
        assert.strictEqual(seen?.state.value, "payload");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("Refcounting", () => {
    test("concurrent acquires share a single bind and one state object", async () => {
      const service = new TestProxyServer();
      const [h1, h2] = await Promise.all([
        service.startHandle("a"),
        service.startHandle("b")
      ]);
      try {
        assert.strictEqual(h1.baseUrl, h2.baseUrl);
        assert.strictEqual(h1.nonce, h2.nonce);
        assert.strictEqual(h1.runtime.state, h2.runtime.state, "state is shared by reference");
        assert.strictEqual(service.createStateCalls, 1);
      } finally {
        h1.dispose();
        h2.dispose();
        service.dispose();
      }
    });
    test("disposing one handle while another is alive keeps the server up", async () => {
      const service = new TestProxyServer();
      const h1 = await service.startHandle();
      const h2 = await service.startHandle();
      h1.dispose();
      try {
        const res = await fetchHttp(`${h2.baseUrl}/`);
        assert.strictEqual(res.status, 200);
      } finally {
        h2.dispose();
        service.dispose();
      }
    });
    test("disposing the last handle tears the server down", async () => {
      const service = new TestProxyServer();
      const handle = await service.startHandle();
      const baseUrl = handle.baseUrl;
      assert.strictEqual((await fetchHttp(`${baseUrl}/`)).status, 200);
      handle.dispose();
      assert.strictEqual(await isConnectionRefused(`${baseUrl}/`), true);
      service.dispose();
    });
    test("startHandle() after refcount-0 teardown rebinds with a fresh nonce and new state", async () => {
      const service = new TestProxyServer();
      const h1 = await service.startHandle();
      const nonce1 = h1.nonce;
      h1.dispose();
      const h2 = await service.startHandle();
      try {
        assert.notStrictEqual(h2.nonce, nonce1);
        assert.match(h2.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
        assert.strictEqual(service.createStateCalls, 2, "state is rebuilt per bind");
      } finally {
        h2.dispose();
        service.dispose();
      }
    });
  });
  suite("Seeding", () => {
    test("acquire seeds createState so the state is born valid with no placeholder window", async () => {
      const service = new SeededTestProxyServer();
      let firstRequestValue;
      service.requestHandler = async (_req, res, runtime) => {
        firstRequestValue = runtime.state.value;
        res.writeHead(200);
        res.end();
      };
      const handle = await service.startHandle("token-1");
      try {
        await fetchHttp(`${handle.baseUrl}/`);
        assert.deepStrictEqual(
          { seeds: service.seeds, state: handle.runtime.state.value, firstRequestValue },
          { seeds: ["token-1"], state: "token-1", firstRequestValue: "token-1" }
        );
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("concurrent acquires build state once from the seed that wins the bind", async () => {
      const service = new SeededTestProxyServer();
      const [h1, h2] = await Promise.all([
        service.startHandle("token-1"),
        service.startHandle("token-2")
      ]);
      try {
        assert.deepStrictEqual(
          { seeds: service.seeds, shared: h1.runtime.state === h2.runtime.state, value: h1.runtime.state.value },
          { seeds: ["token-1"], shared: true, value: "token-1" }
        );
      } finally {
        h1.dispose();
        h2.dispose();
        service.dispose();
      }
    });
    test("rebinding after refcount-0 teardown re-seeds createState with the new value", async () => {
      const service = new SeededTestProxyServer();
      const h1 = await service.startHandle("token-1");
      h1.dispose();
      const h2 = await service.startHandle("token-2");
      try {
        assert.deepStrictEqual(
          { seeds: service.seeds, value: h2.runtime.state.value },
          { seeds: ["token-1", "token-2"], value: "token-2" }
        );
      } finally {
        h2.dispose();
        service.dispose();
      }
    });
  });
  suite("Dispose semantics", () => {
    test("explicit dispose() tears down regardless of live handles", async () => {
      const service = new TestProxyServer();
      const handle = await service.startHandle();
      const baseUrl = handle.baseUrl;
      service.dispose();
      assert.strictEqual(await isConnectionRefused(`${baseUrl}/`), true);
      handle.dispose();
    });
    test("dispose() while a bind is in flight rejects the pending acquire", async () => {
      const service = new TestProxyServer();
      const startPromise = service.startHandle();
      service.dispose();
      await assert.rejects(() => startPromise, /disposed/);
    });
    test("acquire after dispose() rejects", async () => {
      const service = new TestProxyServer();
      service.dispose();
      await assert.rejects(() => service.startHandle(), /disposed/);
    });
    test("dispose() is idempotent", async () => {
      const service = new TestProxyServer();
      const handle = await service.startHandle();
      handle.dispose();
      service.dispose();
      service.dispose();
      handle.dispose();
    });
    test("error message is prefixed with the proxy name", async () => {
      const service = new TestProxyServer("MyCustomProxy");
      service.dispose();
      await assert.rejects(() => service.startHandle(), /MyCustomProxy has been disposed/);
    });
  });
  suite("Unhandled errors", () => {
    test("throw before headers \u2192 default internal-error envelope (500)", async () => {
      const service = new TestProxyServer();
      service.requestHandler = async () => {
        throw new Error("boom");
      };
      const handle = await service.startHandle();
      try {
        const res = await fetchHttp(`${handle.baseUrl}/`);
        assert.strictEqual(res.status, 500);
        assert.deepStrictEqual(res.parsed, { error: { type: "api_error", message: "Internal proxy error" } });
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("throw before headers \u2192 subclass writeInternalError override is used", async () => {
      const service = new TestProxyServer();
      service.internalErrorWriter = (res) => {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ custom: true }));
      };
      service.requestHandler = async () => {
        throw new Error("boom");
      };
      const handle = await service.startHandle();
      try {
        const res = await fetchHttp(`${handle.baseUrl}/`);
        assert.strictEqual(res.status, 503);
        assert.deepStrictEqual(res.parsed, { custom: true });
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("throw after headers are sent \u2192 response is ended without crashing", async () => {
      const service = new TestProxyServer();
      service.requestHandler = async (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.write("partial");
        throw new Error("boom after headers");
      };
      const handle = await service.startHandle();
      try {
        const res = await fetchHttp(`${handle.baseUrl}/`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body, "partial");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("In-flight abort", () => {
    test("dispose() aborts in-flight requests and destroys their sockets", async () => {
      const service = new TestProxyServer();
      let aborted = false;
      let entered;
      const handlerEntered = new Promise((resolve) => {
        entered = resolve;
      });
      service.requestHandler = async (_req, res, runtime) => {
        const entry = { ac: new AbortController(), res, clientGone: false };
        runtime.inFlight.add(entry);
        res.on("close", () => {
          entry.clientGone = true;
          entry.ac.abort();
        });
        try {
          entered();
          await new Promise((resolve) => {
            entry.ac.signal.addEventListener("abort", () => {
              aborted = true;
              if (!entry.clientGone && !res.writableEnded) {
                res.destroy();
              }
              resolve();
            });
          });
        } finally {
          runtime.inFlight.delete(entry);
        }
      };
      const handle = await service.startHandle();
      const reqError = fetchHttp(`${handle.baseUrl}/`).catch((err) => err);
      await handlerEntered;
      service.dispose();
      const result = await reqError;
      assert.ok(result instanceof Error, "client request should error when the socket is destroyed");
      assert.strictEqual(aborted, true, "in-flight AbortController should have fired");
      handle.dispose();
    });
  });
  suite("readProxyRequestBody", () => {
    test("reads the full request body as UTF-8", async () => {
      const service = new TestProxyServer();
      let received;
      service.requestHandler = async (req, res) => {
        received = await readProxyRequestBody(req);
        res.writeHead(200);
        res.end();
      };
      const handle = await service.startHandle();
      try {
        const payload = JSON.stringify({ greeting: "h\xE9llo \u{1F30D}", n: 42 });
        await fetchHttp(`${handle.baseUrl}/`, { method: "POST", body: payload });
        assert.strictEqual(received, payload);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("resolves to an empty string for a body-less request", async () => {
      const service = new TestProxyServer();
      let received;
      service.requestHandler = async (req, res) => {
        received = await readProxyRequestBody(req);
        res.writeHead(200);
        res.end();
      };
      const handle = await service.startHandle();
      try {
        await fetchHttp(`${handle.baseUrl}/`, { method: "POST" });
        assert.strictEqual(received, "");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvbG9vcGJhY2tQcm94eVNlcnZlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHtcblx0SUxvb3BiYWNrUHJveHlSdW50aW1lLFxuXHRJUHJveHlJbkZsaWdodCxcblx0TG9vcGJhY2tQcm94eVNlcnZlcixcblx0cmVhZFByb3h5UmVxdWVzdEJvZHksXG59IGZyb20gJy4uLy4uL25vZGUvc2hhcmVkL2xvb3BiYWNrUHJveHlTZXJ2ZXIuanMnO1xuXG4vLyAjcmVnaW9uIFRlc3Qgc3ViY2xhc3NcblxuaW50ZXJmYWNlIElUZXN0U3RhdGUge1xuXHR2YWx1ZTogc3RyaW5nO1xufVxuXG50eXBlIFJlcXVlc3RIYW5kbGVyID0gKFxuXHRyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLFxuXHRyZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UsXG5cdHJ1bnRpbWU6IElMb29wYmFja1Byb3h5UnVudGltZTxJVGVzdFN0YXRlPixcbikgPT4gUHJvbWlzZTx2b2lkPjtcblxuLyoqXG4gKiBNaW5pbWFsIGNvbmNyZXRlIHByb3h5IHVzZWQgdG8gZHJpdmUgdGhlIHNoYXJlZCB7QGxpbmsgTG9vcGJhY2tQcm94eVNlcnZlcn1cbiAqIGxpZmVjeWNsZSBpbiBpc29sYXRpb24uIFRoZSByZXF1ZXN0IGhhbmRsZXIgYW5kIGludGVybmFsLWVycm9yIHdyaXRlciBhcmVcbiAqIHN3YXBwYWJsZSBwZXIgdGVzdDsgYGNyZWF0ZVN0YXRlYCBpcyBjb3VudGVkIHNvIHdlIGNhbiBhc3NlcnQgb25lIHN0YXRlIHBlclxuICogYmluZC5cbiAqL1xuY2xhc3MgVGVzdFByb3h5U2VydmVyIGV4dGVuZHMgTG9vcGJhY2tQcm94eVNlcnZlcjxJVGVzdFN0YXRlPiB7XG5cblx0Y3JlYXRlU3RhdGVDYWxscyA9IDA7XG5cblx0cmVxdWVzdEhhbmRsZXI6IFJlcXVlc3RIYW5kbGVyID0gYXN5bmMgKF9yZXEsIHJlcykgPT4ge1xuXHRcdHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAndGV4dC9wbGFpbicgfSk7XG5cdFx0cmVzLmVuZCgnb2snKTtcblx0fTtcblxuXHRpbnRlcm5hbEVycm9yV3JpdGVyOiAoKHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IobmFtZSA9ICdUZXN0UHJveHlTZXJ2ZXInKSB7XG5cdFx0c3VwZXIobmFtZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZVN0YXRlKCk6IElUZXN0U3RhdGUge1xuXHRcdHRoaXMuY3JlYXRlU3RhdGVDYWxscysrO1xuXHRcdHJldHVybiB7IHZhbHVlOiAnJyB9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGhhbmRsZVJlcXVlc3QoXG5cdFx0cmVxOiBodHRwLkluY29taW5nTWVzc2FnZSxcblx0XHRyZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UsXG5cdFx0cnVudGltZTogSUxvb3BiYWNrUHJveHlSdW50aW1lPElUZXN0U3RhdGU+LFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5yZXF1ZXN0SGFuZGxlcihyZXEsIHJlcywgcnVudGltZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgd3JpdGVJbnRlcm5hbEVycm9yKHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmludGVybmFsRXJyb3JXcml0ZXIpIHtcblx0XHRcdHRoaXMuaW50ZXJuYWxFcnJvcldyaXRlcihyZXMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzdXBlci53cml0ZUludGVybmFsRXJyb3IocmVzKTtcblx0fVxuXG5cdC8qKiBUZXN0LW9ubHkgcHVibGljIHdyYXBwZXIgYXJvdW5kIHRoZSBwcm90ZWN0ZWQge0BsaW5rIGFjcXVpcmV9LiAqL1xuXHRhc3luYyBzdGFydEhhbmRsZSh2YWx1ZT86IHN0cmluZyk6IFByb21pc2U8SVRlc3RIYW5kbGU+IHtcblx0XHRjb25zdCB7IHJ1bnRpbWUsIHJlbGVhc2UgfSA9IGF3YWl0IHRoaXMuYWNxdWlyZSgpO1xuXHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRydW50aW1lLnN0YXRlLnZhbHVlID0gdmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRiYXNlVXJsOiBydW50aW1lLmJhc2VVcmwsXG5cdFx0XHRub25jZTogcnVudGltZS5ub25jZSxcblx0XHRcdHJ1bnRpbWUsXG5cdFx0XHRkaXNwb3NlOiByZWxlYXNlLFxuXHRcdH07XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUZXN0SGFuZGxlIHtcblx0cmVhZG9ubHkgYmFzZVVybDogc3RyaW5nO1xuXHRyZWFkb25seSBub25jZTogc3RyaW5nO1xuXHRyZWFkb25seSBydW50aW1lOiBJTG9vcGJhY2tQcm94eVJ1bnRpbWU8SVRlc3RTdGF0ZT47XG5cdGRpc3Bvc2UoKTogdm9pZDtcbn1cblxuLyoqXG4gKiBDb25jcmV0ZSBwcm94eSB3aG9zZSBwZXItYmluZCBzdGF0ZSBpcyBzZWVkZWQgYXQgYGFjcXVpcmUoKWAgdGltZSwgdXNlZCB0b1xuICogZXhlcmNpc2UgdGhlIHNlZWQgXHUyMTkyIHtAbGluayBMb29wYmFja1Byb3h5U2VydmVyLmNyZWF0ZVN0YXRlfSBmbG93LiBFdmVyeSBzZWVkXG4gKiB0aHJlYWRlZCBpbnRvIGBjcmVhdGVTdGF0ZWAgaXMgcmVjb3JkZWQgc28gdGVzdHMgY2FuIGFzc2VydCB3aGVuIFx1MjAxNCBhbmQgd2l0aFxuICogd2hpY2ggdmFsdWUgXHUyMDE0IHRoZSBzdGF0ZSB3YXMgYnVpbHQuXG4gKi9cbmNsYXNzIFNlZWRlZFRlc3RQcm94eVNlcnZlciBleHRlbmRzIExvb3BiYWNrUHJveHlTZXJ2ZXI8SVRlc3RTdGF0ZSwgc3RyaW5nPiB7XG5cblx0cmVhZG9ubHkgc2VlZHM6IHN0cmluZ1tdID0gW107XG5cblx0cmVxdWVzdEhhbmRsZXI6IFJlcXVlc3RIYW5kbGVyID0gYXN5bmMgKF9yZXEsIHJlcykgPT4ge1xuXHRcdHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAndGV4dC9wbGFpbicgfSk7XG5cdFx0cmVzLmVuZCgnb2snKTtcblx0fTtcblxuXHRjb25zdHJ1Y3RvcihuYW1lID0gJ1NlZWRlZFRlc3RQcm94eVNlcnZlcicpIHtcblx0XHRzdXBlcihuYW1lLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlU3RhdGUoc2VlZDogc3RyaW5nKTogSVRlc3RTdGF0ZSB7XG5cdFx0dGhpcy5zZWVkcy5wdXNoKHNlZWQpO1xuXHRcdHJldHVybiB7IHZhbHVlOiBzZWVkIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgaGFuZGxlUmVxdWVzdChcblx0XHRyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLFxuXHRcdHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSxcblx0XHRydW50aW1lOiBJTG9vcGJhY2tQcm94eVJ1bnRpbWU8SVRlc3RTdGF0ZT4sXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnJlcXVlc3RIYW5kbGVyKHJlcSwgcmVzLCBydW50aW1lKTtcblx0fVxuXG5cdC8qKiBUZXN0LW9ubHkgcHVibGljIHdyYXBwZXIgYXJvdW5kIHRoZSBwcm90ZWN0ZWQge0BsaW5rIGFjcXVpcmV9LiAqL1xuXHRhc3luYyBzdGFydEhhbmRsZShzZWVkOiBzdHJpbmcpOiBQcm9taXNlPElUZXN0SGFuZGxlPiB7XG5cdFx0Y29uc3QgeyBydW50aW1lLCByZWxlYXNlIH0gPSBhd2FpdCB0aGlzLmFjcXVpcmUoc2VlZCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGJhc2VVcmw6IHJ1bnRpbWUuYmFzZVVybCxcblx0XHRcdG5vbmNlOiBydW50aW1lLm5vbmNlLFxuXHRcdFx0cnVudGltZSxcblx0XHRcdGRpc3Bvc2U6IHJlbGVhc2UsXG5cdFx0fTtcblx0fVxufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gSFRUUCBoZWxwZXJzXG5cbmxldCBfaHR0cE1vZHVsZTogdHlwZW9mIGh0dHAgfCB1bmRlZmluZWQ7XG5hc3luYyBmdW5jdGlvbiBnZXRIdHRwKCk6IFByb21pc2U8dHlwZW9mIGh0dHA+IHtcblx0aWYgKCFfaHR0cE1vZHVsZSkge1xuXHRcdF9odHRwTW9kdWxlID0gYXdhaXQgaW1wb3J0KCdodHRwJyk7XG5cdH1cblx0cmV0dXJuIF9odHRwTW9kdWxlO1xufVxuXG5pbnRlcmZhY2UgSUZldGNoUmVzdWx0IHtcblx0c3RhdHVzOiBudW1iZXI7XG5cdGhlYWRlcnM6IGh0dHAuSW5jb21pbmdIdHRwSGVhZGVycztcblx0Ym9keTogc3RyaW5nO1xuXHRwYXJzZWQ6IHVua25vd247XG59XG5cbmZ1bmN0aW9uIGZldGNoSHR0cChcblx0dXJsOiBzdHJpbmcsXG5cdGluaXQ/OiB7IG1ldGhvZD86IHN0cmluZzsgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47IGJvZHk/OiBzdHJpbmcgfSxcblx0b25SZXNwb25zZT86IChyZXM6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCBhYm9ydDogKCkgPT4gdm9pZCkgPT4gdm9pZCxcbik6IFByb21pc2U8SUZldGNoUmVzdWx0PiB7XG5cdHJldHVybiBnZXRIdHRwKCkudGhlbihodHRwTW9kID0+IG5ldyBQcm9taXNlPElGZXRjaFJlc3VsdD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IHUgPSBuZXcgVVJMKHVybCk7XG5cdFx0Y29uc3QgcmVxID0gaHR0cE1vZC5yZXF1ZXN0KHtcblx0XHRcdGhvc3RuYW1lOiB1Lmhvc3RuYW1lLFxuXHRcdFx0cG9ydDogdS5wb3J0LFxuXHRcdFx0cGF0aDogdS5wYXRobmFtZSArIHUuc2VhcmNoLFxuXHRcdFx0bWV0aG9kOiBpbml0Py5tZXRob2QgPz8gJ0dFVCcsXG5cdFx0XHRoZWFkZXJzOiBpbml0Py5oZWFkZXJzLFxuXHRcdH0sIHJlcyA9PiB7XG5cdFx0XHRjb25zdCBjaHVua3M6IEJ1ZmZlcltdID0gW107XG5cdFx0XHRyZXMub24oJ2RhdGEnLCBjID0+IGNodW5rcy5wdXNoKEJ1ZmZlci5pc0J1ZmZlcihjKSA/IGMgOiBCdWZmZXIuZnJvbShjKSkpO1xuXHRcdFx0cmVzLm9uKCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGJvZHkgPSBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoJ3V0ZjgnKTtcblx0XHRcdFx0bGV0IHBhcnNlZDogdW5rbm93bjtcblx0XHRcdFx0dHJ5IHsgcGFyc2VkID0gYm9keSA/IEpTT04ucGFyc2UoYm9keSkgOiB1bmRlZmluZWQ7IH0gY2F0Y2ggeyBwYXJzZWQgPSB1bmRlZmluZWQ7IH1cblx0XHRcdFx0cmVzb2x2ZSh7IHN0YXR1czogcmVzLnN0YXR1c0NvZGUgPz8gMCwgaGVhZGVyczogcmVzLmhlYWRlcnMsIGJvZHksIHBhcnNlZCB9KTtcblx0XHRcdH0pO1xuXHRcdFx0cmVzLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0XHRvblJlc3BvbnNlPy4ocmVzLCAoKSA9PiByZXEuZGVzdHJveSgpKTtcblx0XHR9KTtcblx0XHRyZXEub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRpZiAoaW5pdD8uYm9keSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXEud3JpdGUoaW5pdC5ib2R5KTtcblx0XHR9XG5cdFx0cmVxLmVuZCgpO1xuXHR9KSk7XG59XG5cbi8qKiBSZXNvbHZlcyBgdHJ1ZWAgaWYgdGhlIGNvbm5lY3Rpb24gd2FzIHJlZnVzZWQgKHNlcnZlciB0b3JuIGRvd24pLiAqL1xuYXN5bmMgZnVuY3Rpb24gaXNDb25uZWN0aW9uUmVmdXNlZCh1cmw6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHR0cnkge1xuXHRcdGF3YWl0IGZldGNoSHR0cCh1cmwpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0Y29uc3QgY29kZSA9IChlcnIgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uKS5jb2RlO1xuXHRcdHJldHVybiBjb2RlID09PSAnRUNPTk5SRUZVU0VEJyB8fCBjb2RlID09PSAnRUNPTk5SRVNFVCcgfHwgY29kZSA9PT0gJ0VDT05OQUJPUlRFRCc7XG5cdH1cbn1cblxuLy8gI2VuZHJlZ2lvblxuXG5zdWl0ZSgnTG9vcGJhY2tQcm94eVNlcnZlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyAjcmVnaW9uIExpZmVjeWNsZSAmIGJpbmRpbmdcblxuXHRzdWl0ZSgnTGlmZWN5Y2xlICYgYmluZGluZycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3N0YXJ0SGFuZGxlKCkgcmV0dXJucyBhIGxvb3BiYWNrIGJhc2VVcmwgYW5kIDI1Ni1iaXQgaGV4IG5vbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UHJveHlTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnRIYW5kbGUoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFzc2VydC5tYXRjaChoYW5kbGUuYmFzZVVybCwgL15odHRwOlxcL1xcLzEyN1xcLjBcXC4wXFwuMTpcXGQrJC8pO1xuXHRcdFx0XHRhc3NlcnQubWF0Y2goaGFuZGxlLm5vbmNlLCAvXlswLTlhLWZdezY0fSQvKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYmluZHMgb25seSBvbiB0aGUgSVB2NCBsb29wYmFjayBpbnRlcmZhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0Lm1hdGNoKGhhbmRsZS5iYXNlVXJsLCAvXmh0dHA6XFwvXFwvMTI3XFwuMFxcLjBcXC4xOlxcZCskLyk7XG5cdFx0XHRcdC8vIEJpbmRpbmcgdG8gMTI3LjAuMC4xIG11c3QgTk9UIGFsc28gbGlzdGVuIG9uIHRoZSBJUHY2XG5cdFx0XHRcdC8vIGxvb3BiYWNrICg6OjEpOyBhIGNvbm5lY3Rpb24gdGhlcmUgc2hvdWxkIGJlIHJlZnVzZWQuXG5cdFx0XHRcdGNvbnN0IHBvcnQgPSBOdW1iZXIobmV3IFVSTChoYW5kbGUuYmFzZVVybCkucG9ydCk7XG5cdFx0XHRcdGNvbnN0IHJlZnVzZWRPbklwdjYgPSBhd2FpdCBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRjb25zdCBzb2NrZXQgPSBuZXQuY29ubmVjdCh7IGhvc3Q6ICc6OjEnLCBwb3J0IH0pO1xuXHRcdFx0XHRcdHNvY2tldC5vbmNlKCdjb25uZWN0JywgKCkgPT4geyBzb2NrZXQuZGVzdHJveSgpOyByZXNvbHZlKGZhbHNlKTsgfSk7XG5cdFx0XHRcdFx0c29ja2V0Lm9uY2UoJ2Vycm9yJywgKCkgPT4geyBzb2NrZXQuZGVzdHJveSgpOyByZXNvbHZlKHRydWUpOyB9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWZ1c2VkT25JcHY2LCB0cnVlLCAnc2VydmVyIHNob3VsZCBub3QgYmUgcmVhY2hhYmxlIG9uIDo6MScpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXJ2ZXMgcmVhbCByZXF1ZXN0cyB2aWEgaGFuZGxlUmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFByb3h5U2VydmVyKCk7XG5cdFx0XHRzZXJ2aWNlLnJlcXVlc3RIYW5kbGVyID0gYXN5bmMgKF9yZXEsIHJlcykgPT4ge1xuXHRcdFx0XHRyZXMud3JpdGVIZWFkKDIwMSwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuXHRcdFx0XHRyZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgaGVsbG86ICd3b3JsZCcgfSkpO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnRIYW5kbGUoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSHR0cChgJHtoYW5kbGUuYmFzZVVybH0vYW55dGhpbmdgKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDIwMSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzLnBhcnNlZCwgeyBoZWxsbzogJ3dvcmxkJyB9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlUmVxdWVzdCByZWNlaXZlcyB0aGUgcnVudGltZSB3aXRoIGJhc2VVcmwsIG5vbmNlIGFuZCBzdGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFByb3h5U2VydmVyKCk7XG5cdFx0XHRsZXQgc2VlbjogSUxvb3BiYWNrUHJveHlSdW50aW1lPElUZXN0U3RhdGU+IHwgdW5kZWZpbmVkO1xuXHRcdFx0c2VydmljZS5yZXF1ZXN0SGFuZGxlciA9IGFzeW5jIChfcmVxLCByZXMsIHJ1bnRpbWUpID0+IHtcblx0XHRcdFx0c2VlbiA9IHJ1bnRpbWU7XG5cdFx0XHRcdHJlcy53cml0ZUhlYWQoMjAwKTtcblx0XHRcdFx0cmVzLmVuZCgpO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnRIYW5kbGUoJ3BheWxvYWQnKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGZldGNoSHR0cChgJHtoYW5kbGUuYmFzZVVybH0vYCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWVuLCBoYW5kbGUucnVudGltZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWVuPy5iYXNlVXJsLCBoYW5kbGUuYmFzZVVybCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWVuPy5ub25jZSwgaGFuZGxlLm5vbmNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlZW4/LnN0YXRlLnZhbHVlLCAncGF5bG9hZCcpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIFJlZmNvdW50aW5nXG5cblx0c3VpdGUoJ1JlZmNvdW50aW5nJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY29uY3VycmVudCBhY3F1aXJlcyBzaGFyZSBhIHNpbmdsZSBiaW5kIGFuZCBvbmUgc3RhdGUgb2JqZWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UHJveHlTZXJ2ZXIoKTtcblx0XHRcdC8vIElzc3VlIGJvdGggYmVmb3JlIHRoZSBmaXJzdCBiaW5kIHJlc29sdmVzOyB0aGV5IG11c3Qgc2hhcmVcblx0XHRcdC8vIHRoZSBydW50aW1lIHJhdGhlciB0aGFuIGVhY2ggYmluZGluZyBhIHNlcnZlci5cblx0XHRcdGNvbnN0IFtoMSwgaDJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRzZXJ2aWNlLnN0YXJ0SGFuZGxlKCdhJyksXG5cdFx0XHRcdHNlcnZpY2Uuc3RhcnRIYW5kbGUoJ2InKSxcblx0XHRcdF0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGgxLmJhc2VVcmwsIGgyLmJhc2VVcmwpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaDEubm9uY2UsIGgyLm5vbmNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGgxLnJ1bnRpbWUuc3RhdGUsIGgyLnJ1bnRpbWUuc3RhdGUsICdzdGF0ZSBpcyBzaGFyZWQgYnkgcmVmZXJlbmNlJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNyZWF0ZVN0YXRlQ2FsbHMsIDEpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aDEuZGlzcG9zZSgpO1xuXHRcdFx0XHRoMi5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zaW5nIG9uZSBoYW5kbGUgd2hpbGUgYW5vdGhlciBpcyBhbGl2ZSBrZWVwcyB0aGUgc2VydmVyIHVwJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UHJveHlTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IGgxID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgpO1xuXHRcdFx0Y29uc3QgaDIgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0SGFuZGxlKCk7XG5cdFx0XHRoMS5kaXNwb3NlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEh0dHAoYCR7aDIuYmFzZVVybH0vYCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCAyMDApO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aDIuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2luZyB0aGUgbGFzdCBoYW5kbGUgdGVhcnMgdGhlIHNlcnZlciBkb3duJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UHJveHlTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnRIYW5kbGUoKTtcblx0XHRcdGNvbnN0IGJhc2VVcmwgPSBoYW5kbGUuYmFzZVVybDtcblx0XHRcdC8vIFJlYWNoYWJsZSB3aGlsZSBoZWxkLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmZXRjaEh0dHAoYCR7YmFzZVVybH0vYCkpLnN0YXR1cywgMjAwKTtcblx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgaXNDb25uZWN0aW9uUmVmdXNlZChgJHtiYXNlVXJsfS9gKSwgdHJ1ZSk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0YXJ0SGFuZGxlKCkgYWZ0ZXIgcmVmY291bnQtMCB0ZWFyZG93biByZWJpbmRzIHdpdGggYSBmcmVzaCBub25jZSBhbmQgbmV3IHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UHJveHlTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IGgxID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgpO1xuXHRcdFx0Y29uc3Qgbm9uY2UxID0gaDEubm9uY2U7XG5cdFx0XHRoMS5kaXNwb3NlKCk7XG5cblx0XHRcdGNvbnN0IGgyID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGgyLm5vbmNlLCBub25jZTEpO1xuXHRcdFx0XHRhc3NlcnQubWF0Y2goaDIuYmFzZVVybCwgL15odHRwOlxcL1xcLzEyN1xcLjBcXC4wXFwuMTpcXGQrJC8pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jcmVhdGVTdGF0ZUNhbGxzLCAyLCAnc3RhdGUgaXMgcmVidWlsdCBwZXIgYmluZCcpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aDIuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gU2VlZGluZ1xuXG5cdHN1aXRlKCdTZWVkaW5nJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnYWNxdWlyZSBzZWVkcyBjcmVhdGVTdGF0ZSBzbyB0aGUgc3RhdGUgaXMgYm9ybiB2YWxpZCB3aXRoIG5vIHBsYWNlaG9sZGVyIHdpbmRvdycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgU2VlZGVkVGVzdFByb3h5U2VydmVyKCk7XG5cdFx0XHQvLyBDYXB0dXJlIHRoZSBzdGF0ZSB0aGUgdmVyeSBmaXJzdCBkaXNwYXRjaGVkIHJlcXVlc3Qgb2JzZXJ2ZXMgdG9cblx0XHRcdC8vIHByb3ZlIG5vIGVtcHR5L3BsYWNlaG9sZGVyIHZhbHVlIGlzIGV2ZXIgdmlzaWJsZSBvbiB0aGUgd2lyZS5cblx0XHRcdGxldCBmaXJzdFJlcXVlc3RWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0c2VydmljZS5yZXF1ZXN0SGFuZGxlciA9IGFzeW5jIChfcmVxLCByZXMsIHJ1bnRpbWUpID0+IHtcblx0XHRcdFx0Zmlyc3RSZXF1ZXN0VmFsdWUgPSBydW50aW1lLnN0YXRlLnZhbHVlO1xuXHRcdFx0XHRyZXMud3JpdGVIZWFkKDIwMCk7XG5cdFx0XHRcdHJlcy5lbmQoKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0SGFuZGxlKCd0b2tlbi0xJyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBmZXRjaEh0dHAoYCR7aGFuZGxlLmJhc2VVcmx9L2ApO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHsgc2VlZHM6IHNlcnZpY2Uuc2VlZHMsIHN0YXRlOiBoYW5kbGUucnVudGltZS5zdGF0ZS52YWx1ZSwgZmlyc3RSZXF1ZXN0VmFsdWUgfSxcblx0XHRcdFx0XHR7IHNlZWRzOiBbJ3Rva2VuLTEnXSwgc3RhdGU6ICd0b2tlbi0xJywgZmlyc3RSZXF1ZXN0VmFsdWU6ICd0b2tlbi0xJyB9LFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb25jdXJyZW50IGFjcXVpcmVzIGJ1aWxkIHN0YXRlIG9uY2UgZnJvbSB0aGUgc2VlZCB0aGF0IHdpbnMgdGhlIGJpbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFNlZWRlZFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0Ly8gQm90aCBhcmUgaXNzdWVkIGJlZm9yZSB0aGUgZmlyc3QgYmluZCByZXNvbHZlczsgdGhlIGZpcnN0IGNhbGxlclxuXHRcdFx0Ly8gd2lucyB0aGUgYmluZCByYWNlIHNvIGNyZWF0ZVN0YXRlIHJ1bnMgb25jZSB3aXRoIGl0cyBzZWVkLCB3aGlsZVxuXHRcdFx0Ly8gdGhlIHNlY29uZCBqdXN0IGpvaW5zIHRoZSBzaGFyZWQgcnVudGltZS5cblx0XHRcdGNvbnN0IFtoMSwgaDJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRzZXJ2aWNlLnN0YXJ0SGFuZGxlKCd0b2tlbi0xJyksXG5cdFx0XHRcdHNlcnZpY2Uuc3RhcnRIYW5kbGUoJ3Rva2VuLTInKSxcblx0XHRcdF0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHR7IHNlZWRzOiBzZXJ2aWNlLnNlZWRzLCBzaGFyZWQ6IGgxLnJ1bnRpbWUuc3RhdGUgPT09IGgyLnJ1bnRpbWUuc3RhdGUsIHZhbHVlOiBoMS5ydW50aW1lLnN0YXRlLnZhbHVlIH0sXG5cdFx0XHRcdFx0eyBzZWVkczogWyd0b2tlbi0xJ10sIHNoYXJlZDogdHJ1ZSwgdmFsdWU6ICd0b2tlbi0xJyB9LFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aDEuZGlzcG9zZSgpO1xuXHRcdFx0XHRoMi5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmViaW5kaW5nIGFmdGVyIHJlZmNvdW50LTAgdGVhcmRvd24gcmUtc2VlZHMgY3JlYXRlU3RhdGUgd2l0aCB0aGUgbmV3IHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBTZWVkZWRUZXN0UHJveHlTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IGgxID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgndG9rZW4tMScpO1xuXHRcdFx0aDEuZGlzcG9zZSgpO1xuXG5cdFx0XHRjb25zdCBoMiA9IGF3YWl0IHNlcnZpY2Uuc3RhcnRIYW5kbGUoJ3Rva2VuLTInKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0eyBzZWVkczogc2VydmljZS5zZWVkcywgdmFsdWU6IGgyLnJ1bnRpbWUuc3RhdGUudmFsdWUgfSxcblx0XHRcdFx0XHR7IHNlZWRzOiBbJ3Rva2VuLTEnLCAndG9rZW4tMiddLCB2YWx1ZTogJ3Rva2VuLTInIH0sXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoMi5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBEaXNwb3NlIHNlbWFudGljc1xuXG5cdHN1aXRlKCdEaXNwb3NlIHNlbWFudGljcycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2V4cGxpY2l0IGRpc3Bvc2UoKSB0ZWFycyBkb3duIHJlZ2FyZGxlc3Mgb2YgbGl2ZSBoYW5kbGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UHJveHlTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnRIYW5kbGUoKTtcblx0XHRcdGNvbnN0IGJhc2VVcmwgPSBoYW5kbGUuYmFzZVVybDtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0Ly8gSGFuZGxlIGlzIHN0aWxsIFwiaGVsZFwiIGJ5IHRoZSBjYWxsZXIsIGJ1dCB0aGUgc2VydmljZSBpcyBnb25lLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGlzQ29ubmVjdGlvblJlZnVzZWQoYCR7YmFzZVVybH0vYCksIHRydWUpO1xuXHRcdFx0Ly8gUmVsZWFzaW5nIHRoZSBub3ctc3RhbGUgaGFuZGxlIG11c3QgYmUgYSBzYWZlIG5vLW9wLlxuXHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2UoKSB3aGlsZSBhIGJpbmQgaXMgaW4gZmxpZ2h0IHJlamVjdHMgdGhlIHBlbmRpbmcgYWNxdWlyZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFByb3h5U2VydmVyKCk7XG5cdFx0XHRjb25zdCBzdGFydFByb21pc2UgPSBzZXJ2aWNlLnN0YXJ0SGFuZGxlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHN0YXJ0UHJvbWlzZSwgL2Rpc3Bvc2VkLyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhY3F1aXJlIGFmdGVyIGRpc3Bvc2UoKSByZWplY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UHJveHlTZXJ2ZXIoKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gc2VydmljZS5zdGFydEhhbmRsZSgpLCAvZGlzcG9zZWQvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2UoKSBpcyBpZGVtcG90ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UHJveHlTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnRIYW5kbGUoKTtcblx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0Ly8gUmUtZGlzcG9zaW5nIHRoZSByZWxlYXNlZCBoYW5kbGUgaXMgYWxzbyBhIG5vLW9wLlxuXHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Vycm9yIG1lc3NhZ2UgaXMgcHJlZml4ZWQgd2l0aCB0aGUgcHJveHkgbmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFByb3h5U2VydmVyKCdNeUN1c3RvbVByb3h5Jyk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2Uuc3RhcnRIYW5kbGUoKSwgL015Q3VzdG9tUHJveHkgaGFzIGJlZW4gZGlzcG9zZWQvKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gVW5oYW5kbGVkIGVycm9yc1xuXG5cdHN1aXRlKCdVbmhhbmRsZWQgZXJyb3JzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgndGhyb3cgYmVmb3JlIGhlYWRlcnMgXHUyMTkyIGRlZmF1bHQgaW50ZXJuYWwtZXJyb3IgZW52ZWxvcGUgKDUwMCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0c2VydmljZS5yZXF1ZXN0SGFuZGxlciA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdib29tJyk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hIdHRwKGAke2hhbmRsZS5iYXNlVXJsfS9gKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDUwMCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzLnBhcnNlZCwgeyBlcnJvcjogeyB0eXBlOiAnYXBpX2Vycm9yJywgbWVzc2FnZTogJ0ludGVybmFsIHByb3h5IGVycm9yJyB9IH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0aHJvdyBiZWZvcmUgaGVhZGVycyBcdTIxOTIgc3ViY2xhc3Mgd3JpdGVJbnRlcm5hbEVycm9yIG92ZXJyaWRlIGlzIHVzZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0c2VydmljZS5pbnRlcm5hbEVycm9yV3JpdGVyID0gcmVzID0+IHtcblx0XHRcdFx0cmVzLndyaXRlSGVhZCg1MDMsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcblx0XHRcdFx0cmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGN1c3RvbTogdHJ1ZSB9KSk7XG5cdFx0XHR9O1xuXHRcdFx0c2VydmljZS5yZXF1ZXN0SGFuZGxlciA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdib29tJyk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hIdHRwKGAke2hhbmRsZS5iYXNlVXJsfS9gKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDUwMyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzLnBhcnNlZCwgeyBjdXN0b206IHRydWUgfSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93IGFmdGVyIGhlYWRlcnMgYXJlIHNlbnQgXHUyMTkyIHJlc3BvbnNlIGlzIGVuZGVkIHdpdGhvdXQgY3Jhc2hpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0c2VydmljZS5yZXF1ZXN0SGFuZGxlciA9IGFzeW5jIChfcmVxLCByZXMpID0+IHtcblx0XHRcdFx0cmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICd0ZXh0L3BsYWluJyB9KTtcblx0XHRcdFx0cmVzLndyaXRlKCdwYXJ0aWFsJyk7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignYm9vbSBhZnRlciBoZWFkZXJzJyk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hIdHRwKGAke2hhbmRsZS5iYXNlVXJsfS9gKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDIwMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuYm9keSwgJ3BhcnRpYWwnKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBJbi1mbGlnaHQgYWJvcnRcblxuXHRzdWl0ZSgnSW4tZmxpZ2h0IGFib3J0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZGlzcG9zZSgpIGFib3J0cyBpbi1mbGlnaHQgcmVxdWVzdHMgYW5kIGRlc3Ryb3lzIHRoZWlyIHNvY2tldHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0bGV0IGFib3J0ZWQgPSBmYWxzZTtcblx0XHRcdGxldCBlbnRlcmVkITogKCkgPT4gdm9pZDtcblx0XHRcdGNvbnN0IGhhbmRsZXJFbnRlcmVkID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7IGVudGVyZWQgPSByZXNvbHZlOyB9KTtcblxuXHRcdFx0c2VydmljZS5yZXF1ZXN0SGFuZGxlciA9IGFzeW5jIChfcmVxLCByZXMsIHJ1bnRpbWUpID0+IHtcblx0XHRcdFx0Y29uc3QgZW50cnk6IElQcm94eUluRmxpZ2h0ID0geyBhYzogbmV3IEFib3J0Q29udHJvbGxlcigpLCByZXMsIGNsaWVudEdvbmU6IGZhbHNlIH07XG5cdFx0XHRcdHJ1bnRpbWUuaW5GbGlnaHQuYWRkKGVudHJ5KTtcblx0XHRcdFx0cmVzLm9uKCdjbG9zZScsICgpID0+IHsgZW50cnkuY2xpZW50R29uZSA9IHRydWU7IGVudHJ5LmFjLmFib3J0KCk7IH0pO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGVudGVyZWQoKTtcblx0XHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRcdGVudHJ5LmFjLnNpZ25hbC5hZGRFdmVudExpc3RlbmVyKCdhYm9ydCcsICgpID0+IHtcblx0XHRcdFx0XHRcdFx0YWJvcnRlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdC8vIFNlcnZpY2UtZHJpdmVuIGFib3J0OiBzb2NrZXQgc3RpbGwgb3BlbiBcdTIxOTIgZGVzdHJveS5cblx0XHRcdFx0XHRcdFx0aWYgKCFlbnRyeS5jbGllbnRHb25lICYmICFyZXMud3JpdGFibGVFbmRlZCkge1xuXHRcdFx0XHRcdFx0XHRcdHJlcy5kZXN0cm95KCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0cnVudGltZS5pbkZsaWdodC5kZWxldGUoZW50cnkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0SGFuZGxlKCk7XG5cdFx0XHRjb25zdCByZXFFcnJvciA9IGZldGNoSHR0cChgJHtoYW5kbGUuYmFzZVVybH0vYCkuY2F0Y2goKGVycjogTm9kZUpTLkVycm5vRXhjZXB0aW9uKSA9PiBlcnIpO1xuXG5cdFx0XHRhd2FpdCBoYW5kbGVyRW50ZXJlZDtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXFFcnJvcjtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQgaW5zdGFuY2VvZiBFcnJvciwgJ2NsaWVudCByZXF1ZXN0IHNob3VsZCBlcnJvciB3aGVuIHRoZSBzb2NrZXQgaXMgZGVzdHJveWVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWJvcnRlZCwgdHJ1ZSwgJ2luLWZsaWdodCBBYm9ydENvbnRyb2xsZXIgc2hvdWxkIGhhdmUgZmlyZWQnKTtcblx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIHJlYWRQcm94eVJlcXVlc3RCb2R5XG5cblx0c3VpdGUoJ3JlYWRQcm94eVJlcXVlc3RCb2R5JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVhZHMgdGhlIGZ1bGwgcmVxdWVzdCBib2R5IGFzIFVURi04JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UHJveHlTZXJ2ZXIoKTtcblx0XHRcdGxldCByZWNlaXZlZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0c2VydmljZS5yZXF1ZXN0SGFuZGxlciA9IGFzeW5jIChyZXEsIHJlcykgPT4ge1xuXHRcdFx0XHRyZWNlaXZlZCA9IGF3YWl0IHJlYWRQcm94eVJlcXVlc3RCb2R5KHJlcSk7XG5cdFx0XHRcdHJlcy53cml0ZUhlYWQoMjAwKTtcblx0XHRcdFx0cmVzLmVuZCgpO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnRIYW5kbGUoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBheWxvYWQgPSBKU09OLnN0cmluZ2lmeSh7IGdyZWV0aW5nOiAnaFx1MDBFOWxsbyBcdUQ4M0NcdURGMEQnLCBuOiA0MiB9KTtcblx0XHRcdFx0YXdhaXQgZmV0Y2hIdHRwKGAke2hhbmRsZS5iYXNlVXJsfS9gLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiBwYXlsb2FkIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVjZWl2ZWQsIHBheWxvYWQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlcyB0byBhbiBlbXB0eSBzdHJpbmcgZm9yIGEgYm9keS1sZXNzIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0bGV0IHJlY2VpdmVkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRzZXJ2aWNlLnJlcXVlc3RIYW5kbGVyID0gYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG5cdFx0XHRcdHJlY2VpdmVkID0gYXdhaXQgcmVhZFByb3h5UmVxdWVzdEJvZHkocmVxKTtcblx0XHRcdFx0cmVzLndyaXRlSGVhZCgyMDApO1xuXHRcdFx0XHRyZXMuZW5kKCk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZmV0Y2hIdHRwKGAke2hhbmRsZS5iYXNlVXJsfS9gLCB7IG1ldGhvZDogJ1BPU1QnIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVjZWl2ZWQsICcnKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixZQUFZLFNBQVM7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0I7QUFBQSxFQUdDO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFvQlAsTUFBTSx3QkFBd0Isb0JBQWdDO0FBQUEsRUFXN0QsWUFBWSxPQUFPLG1CQUFtQjtBQUNyQyxVQUFNLE1BQU0sSUFBSSxlQUFlLENBQUM7QUFWakMsNEJBQW1CO0FBRW5CLDBCQUFpQyxPQUFPLE1BQU0sUUFBUTtBQUNyRCxVQUFJLFVBQVUsS0FBSyxFQUFFLGdCQUFnQixhQUFhLENBQUM7QUFDbkQsVUFBSSxJQUFJLElBQUk7QUFBQSxJQUNiO0FBQUEsRUFNQTtBQUFBLEVBRVUsY0FBMEI7QUFDbkMsU0FBSztBQUNMLFdBQU8sRUFBRSxPQUFPLEdBQUc7QUFBQSxFQUNwQjtBQUFBLEVBRW1CLGNBQ2xCLEtBQ0EsS0FDQSxTQUNnQjtBQUNoQixXQUFPLEtBQUssZUFBZSxLQUFLLEtBQUssT0FBTztBQUFBLEVBQzdDO0FBQUEsRUFFbUIsbUJBQW1CLEtBQWdDO0FBQ3JFLFFBQUksS0FBSyxxQkFBcUI7QUFDN0IsV0FBSyxvQkFBb0IsR0FBRztBQUM1QjtBQUFBLElBQ0Q7QUFDQSxVQUFNLG1CQUFtQixHQUFHO0FBQUEsRUFDN0I7QUFBQTtBQUFBLEVBR0EsTUFBTSxZQUFZLE9BQXNDO0FBQ3ZELFVBQU0sRUFBRSxTQUFTLFFBQVEsSUFBSSxNQUFNLEtBQUssUUFBUTtBQUNoRCxRQUFJLFVBQVUsUUFBVztBQUN4QixjQUFR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
