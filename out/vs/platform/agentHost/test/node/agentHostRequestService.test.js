import assert from "assert";
import { streamToBuffer } from "../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostClientProxyChannel, createAgentHostClientProxyConnection } from "../../common/agentHostClientProxyChannel.js";
import { AgentHostRequestService } from "../../node/agentHostRequestService.js";
import { NetworkDiagnosticsService } from "../../node/networkDiagnosticsService.js";
class TestProxyResolver {
  constructor() {
    this.fetchImpl = () => Promise.resolve(new Response());
  }
  register(_clientId, _connection) {
    return Disposable.None;
  }
  resolveProxy(_url) {
    return Promise.resolve("http://proxy.example:8080");
  }
  fetch(input, init) {
    this.lastInput = input;
    this.lastInit = init;
    return this.fetchImpl(input, init);
  }
}
suite("AgentHostRequestService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createService(proxyResolver) {
    const environmentService = {
      args: { "force-disable-user-env": true }
    };
    return disposables.add(new AgentHostRequestService(
      new TestConfigurationService(),
      environmentService,
      new NullLogService(),
      proxyResolver
    ));
  }
  test("uses resolver fetch and streams the response", async () => {
    const proxyResolver = new TestProxyResolver();
    proxyResolver.fetchImpl = () => Promise.resolve(new Response("response body", {
      status: 201,
      headers: { "content-type": "text/plain", "x-test": "value" }
    }));
    const service = createService(proxyResolver);
    const context = await service.request({
      url: "https://example.com/resource",
      type: "POST",
      headers: { "x-request": "header" },
      data: "request body",
      callSite: "agentHostRequestService.test"
    }, CancellationToken.None);
    const body = (await streamToBuffer(context.stream)).toString();
    assert.deepStrictEqual({
      input: proxyResolver.lastInput,
      method: proxyResolver.lastInit?.method,
      requestHeader: new Headers(proxyResolver.lastInit?.headers).get("x-request"),
      requestBody: proxyResolver.lastInit?.body,
      statusCode: context.res.statusCode,
      responseHeader: context.res.headers["x-test"],
      body
    }, {
      input: "https://example.com/resource",
      method: "POST",
      requestHeader: "header",
      requestBody: "request body",
      statusCode: 201,
      responseHeader: "value",
      body: "response body"
    });
  });
  test("forwards cancellation to resolver fetch", async () => {
    const proxyResolver = new TestProxyResolver();
    proxyResolver.fetchImpl = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
    const service = createService(proxyResolver);
    const cancellation = disposables.add(new CancellationTokenSource());
    const request = service.request({
      url: "https://example.com/slow",
      callSite: "agentHostRequestService.test.cancellation"
    }, cancellation.token);
    cancellation.cancel();
    await assert.rejects(request, isCancellationError);
  });
  test("retries idempotent requests on transient errors", async () => {
    const proxyResolver = new TestProxyResolver();
    let attempts = 0;
    proxyResolver.fetchImpl = async () => {
      attempts++;
      if (attempts < 3) {
        const error = new Error("Connection refused");
        error.code = "ECONNREFUSED";
        throw error;
      }
      return new Response("ok");
    };
    const service = createService(proxyResolver);
    const context = await service.request({
      url: "https://example.com/retry",
      type: "GET",
      callSite: "agentHostRequestService.test.retry"
    }, CancellationToken.None);
    const body = (await streamToBuffer(context.stream)).toString();
    assert.deepStrictEqual({ attempts, body }, { attempts: 3, body: "ok" });
  });
  test("does not retry non-idempotent requests", async () => {
    const proxyResolver = new TestProxyResolver();
    let attempts = 0;
    proxyResolver.fetchImpl = async () => {
      attempts++;
      const error = new Error("Connection refused");
      error.code = "ECONNREFUSED";
      throw error;
    };
    const service = createService(proxyResolver);
    await assert.rejects(() => service.request({
      url: "https://example.com/no-retry",
      type: "POST",
      callSite: "agentHostRequestService.test.noRetry"
    }, CancellationToken.None), /Connection refused/);
    assert.strictEqual(attempts, 1);
  });
  test("forwards proxy and authorization lookups through the client channel", async () => {
    const calls = [];
    const requestService = {
      resolveProxy: async (url) => {
        calls.push(["resolveProxy", url]);
        return "PROXY proxy.example:8080";
      },
      lookupAuthorization: async (authInfo2) => {
        calls.push(["lookupAuthorization", authInfo2]);
        return { username: "user", password: "password" };
      },
      lookupKerberosAuthorization: async (url) => {
        calls.push(["lookupKerberosAuthorization", url]);
        return "Negotiate token";
      }
    };
    const server = new AgentHostClientProxyChannel(requestService);
    const channel = {
      call: (command, arg) => server.call(void 0, command, arg),
      listen: () => Event.None
    };
    const connection = createAgentHostClientProxyConnection(channel);
    const authInfo = { scheme: "basic", host: "proxy.example", port: 8080, realm: "proxy", isProxy: true, attempt: 1 };
    const results = [
      await connection.resolveProxy("https://example.com"),
      await connection.lookupAuthorization(authInfo),
      await connection.lookupKerberosAuthorization("http://proxy.example:8080")
    ];
    assert.deepStrictEqual({ calls, results }, {
      calls: [
        ["resolveProxy", "https://example.com"],
        ["lookupAuthorization", authInfo],
        ["lookupKerberosAuthorization", "http://proxy.example:8080"]
      ],
      results: [
        "PROXY proxy.example:8080",
        { username: "user", password: "password" },
        "Negotiate token"
      ]
    });
  });
});
suite("NetworkDiagnosticsService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("includes nested proxy response errors", async () => {
    const proxyError = new Error("Proxy response (407)");
    const fetchError = new TypeError("fetch failed", { cause: new Error("dispatcher failed", { cause: proxyError }) });
    const requestService = {
      _serviceBrand: void 0,
      onDidCompleteRequest: Event.None,
      request: async () => {
        throw fetchError;
      },
      resolveProxy: async () => void 0,
      lookupAuthorization: async () => void 0,
      lookupKerberosAuthorization: async () => void 0,
      loadCertificates: async () => []
    };
    const proxyResolver = new TestProxyResolver();
    const service = new NetworkDiagnosticsService(
      requestService,
      proxyResolver,
      new TestConfigurationService(),
      { version: "test" },
      new NullLogService()
    );
    const result = await service.fetch("https://localhost");
    assert.strictEqual(result.error, "fetch failed: dispatcher failed: Proxy response (407)");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0UmVxdWVzdFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHN0cmVhbVRvQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdXRoSW5mbywgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRQcm94eUNoYW5uZWwsIGNyZWF0ZUFnZW50SG9zdENsaWVudFByb3h5Q29ubmVjdGlvbiwgdHlwZSBJQWdlbnRIb3N0Q2xpZW50UHJveHlDb25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENsaWVudFByb3h5Q2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0UHJveHlSZXNvbHZlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0UHJveHlSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0UmVxdWVzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTmV0d29ya0RpYWdub3N0aWNzU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvbmV0d29ya0RpYWdub3N0aWNzU2VydmljZS5qcyc7XG5cbmNsYXNzIFRlc3RQcm94eVJlc29sdmVyIGltcGxlbWVudHMgSUFnZW50SG9zdFByb3h5UmVzb2x2ZXIge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRsYXN0SW5wdXQ6IHN0cmluZyB8IFVSTCB8IFJlcXVlc3QgfCB1bmRlZmluZWQ7XG5cdGxhc3RJbml0OiBSZXF1ZXN0SW5pdCB8IHVuZGVmaW5lZDtcblx0ZmV0Y2hJbXBsOiB0eXBlb2YgZ2xvYmFsVGhpcy5mZXRjaCA9ICgpID0+IFByb21pc2UucmVzb2x2ZShuZXcgUmVzcG9uc2UoKSk7XG5cblx0cmVnaXN0ZXIoX2NsaWVudElkOiBzdHJpbmcsIF9jb25uZWN0aW9uOiBJQWdlbnRIb3N0Q2xpZW50UHJveHlDb25uZWN0aW9uKSB7XG5cdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0fVxuXG5cdHJlc29sdmVQcm94eShfdXJsOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoJ2h0dHA6Ly9wcm94eS5leGFtcGxlOjgwODAnKTtcblx0fVxuXG5cdGZldGNoKGlucHV0OiBzdHJpbmcgfCBVUkwgfCBSZXF1ZXN0LCBpbml0PzogUmVxdWVzdEluaXQpOiBQcm9taXNlPFJlc3BvbnNlPiB7XG5cdFx0dGhpcy5sYXN0SW5wdXQgPSBpbnB1dDtcblx0XHR0aGlzLmxhc3RJbml0ID0gaW5pdDtcblx0XHRyZXR1cm4gdGhpcy5mZXRjaEltcGwoaW5wdXQsIGluaXQpO1xuXHR9XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RSZXF1ZXN0U2VydmljZScsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKHByb3h5UmVzb2x2ZXI6IFRlc3RQcm94eVJlc29sdmVyKTogQWdlbnRIb3N0UmVxdWVzdFNlcnZpY2Uge1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHtcblx0XHRcdGFyZ3M6IHsgJ2ZvcmNlLWRpc2FibGUtdXNlci1lbnYnOiB0cnVlIH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2U7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0UmVxdWVzdFNlcnZpY2UoXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRlbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdHByb3h5UmVzb2x2ZXIsXG5cdFx0KSk7XG5cdH1cblxuXHR0ZXN0KCd1c2VzIHJlc29sdmVyIGZldGNoIGFuZCBzdHJlYW1zIHRoZSByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm94eVJlc29sdmVyID0gbmV3IFRlc3RQcm94eVJlc29sdmVyKCk7XG5cdFx0cHJveHlSZXNvbHZlci5mZXRjaEltcGwgPSAoKSA9PiBQcm9taXNlLnJlc29sdmUobmV3IFJlc3BvbnNlKCdyZXNwb25zZSBib2R5Jywge1xuXHRcdFx0c3RhdHVzOiAyMDEsXG5cdFx0XHRoZWFkZXJzOiB7ICdjb250ZW50LXR5cGUnOiAndGV4dC9wbGFpbicsICd4LXRlc3QnOiAndmFsdWUnIH0sXG5cdFx0fSkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKHByb3h5UmVzb2x2ZXIpO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3Jlc291cmNlJyxcblx0XHRcdHR5cGU6ICdQT1NUJyxcblx0XHRcdGhlYWRlcnM6IHsgJ3gtcmVxdWVzdCc6ICdoZWFkZXInIH0sXG5cdFx0XHRkYXRhOiAncmVxdWVzdCBib2R5Jyxcblx0XHRcdGNhbGxTaXRlOiAnYWdlbnRIb3N0UmVxdWVzdFNlcnZpY2UudGVzdCcsXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgYm9keSA9IChhd2FpdCBzdHJlYW1Ub0J1ZmZlcihjb250ZXh0LnN0cmVhbSkpLnRvU3RyaW5nKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlucHV0OiBwcm94eVJlc29sdmVyLmxhc3RJbnB1dCxcblx0XHRcdG1ldGhvZDogcHJveHlSZXNvbHZlci5sYXN0SW5pdD8ubWV0aG9kLFxuXHRcdFx0cmVxdWVzdEhlYWRlcjogbmV3IEhlYWRlcnMocHJveHlSZXNvbHZlci5sYXN0SW5pdD8uaGVhZGVycykuZ2V0KCd4LXJlcXVlc3QnKSxcblx0XHRcdHJlcXVlc3RCb2R5OiBwcm94eVJlc29sdmVyLmxhc3RJbml0Py5ib2R5LFxuXHRcdFx0c3RhdHVzQ29kZTogY29udGV4dC5yZXMuc3RhdHVzQ29kZSxcblx0XHRcdHJlc3BvbnNlSGVhZGVyOiBjb250ZXh0LnJlcy5oZWFkZXJzWyd4LXRlc3QnXSxcblx0XHRcdGJvZHksXG5cdFx0fSwge1xuXHRcdFx0aW5wdXQ6ICdodHRwczovL2V4YW1wbGUuY29tL3Jlc291cmNlJyxcblx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0cmVxdWVzdEhlYWRlcjogJ2hlYWRlcicsXG5cdFx0XHRyZXF1ZXN0Qm9keTogJ3JlcXVlc3QgYm9keScsXG5cdFx0XHRzdGF0dXNDb2RlOiAyMDEsXG5cdFx0XHRyZXNwb25zZUhlYWRlcjogJ3ZhbHVlJyxcblx0XHRcdGJvZHk6ICdyZXNwb25zZSBib2R5Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZm9yd2FyZHMgY2FuY2VsbGF0aW9uIHRvIHJlc29sdmVyIGZldGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3h5UmVzb2x2ZXIgPSBuZXcgVGVzdFByb3h5UmVzb2x2ZXIoKTtcblx0XHRwcm94eVJlc29sdmVyLmZldGNoSW1wbCA9IChfaW5wdXQsIGluaXQpID0+IG5ldyBQcm9taXNlKChfcmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRpbml0Py5zaWduYWw/LmFkZEV2ZW50TGlzdGVuZXIoJ2Fib3J0JywgKCkgPT4gcmVqZWN0KG5ldyBET01FeGNlcHRpb24oJ0Fib3J0ZWQnLCAnQWJvcnRFcnJvcicpKSk7XG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UocHJveHlSZXNvbHZlcik7XG5cdFx0Y29uc3QgY2FuY2VsbGF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHRcdGNvbnN0IHJlcXVlc3QgPSBzZXJ2aWNlLnJlcXVlc3Qoe1xuXHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zbG93Jyxcblx0XHRcdGNhbGxTaXRlOiAnYWdlbnRIb3N0UmVxdWVzdFNlcnZpY2UudGVzdC5jYW5jZWxsYXRpb24nLFxuXHRcdH0sIGNhbmNlbGxhdGlvbi50b2tlbik7XG5cdFx0Y2FuY2VsbGF0aW9uLmNhbmNlbCgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVxdWVzdCwgaXNDYW5jZWxsYXRpb25FcnJvcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHJpZXMgaWRlbXBvdGVudCByZXF1ZXN0cyBvbiB0cmFuc2llbnQgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3h5UmVzb2x2ZXIgPSBuZXcgVGVzdFByb3h5UmVzb2x2ZXIoKTtcblx0XHRsZXQgYXR0ZW1wdHMgPSAwO1xuXHRcdHByb3h5UmVzb2x2ZXIuZmV0Y2hJbXBsID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXR0ZW1wdHMrKztcblx0XHRcdGlmIChhdHRlbXB0cyA8IDMpIHtcblx0XHRcdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gcmVmdXNlZCcpIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcblx0XHRcdFx0ZXJyb3IuY29kZSA9ICdFQ09OTlJFRlVTRUQnO1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgUmVzcG9uc2UoJ29rJyk7XG5cdFx0fTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShwcm94eVJlc29sdmVyKTtcblxuXHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCBzZXJ2aWNlLnJlcXVlc3Qoe1xuXHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9yZXRyeScsXG5cdFx0XHR0eXBlOiAnR0VUJyxcblx0XHRcdGNhbGxTaXRlOiAnYWdlbnRIb3N0UmVxdWVzdFNlcnZpY2UudGVzdC5yZXRyeScsXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgYm9keSA9IChhd2FpdCBzdHJlYW1Ub0J1ZmZlcihjb250ZXh0LnN0cmVhbSkpLnRvU3RyaW5nKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYXR0ZW1wdHMsIGJvZHkgfSwgeyBhdHRlbXB0czogMywgYm9keTogJ29rJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmV0cnkgbm9uLWlkZW1wb3RlbnQgcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJveHlSZXNvbHZlciA9IG5ldyBUZXN0UHJveHlSZXNvbHZlcigpO1xuXHRcdGxldCBhdHRlbXB0cyA9IDA7XG5cdFx0cHJveHlSZXNvbHZlci5mZXRjaEltcGwgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRhdHRlbXB0cysrO1xuXHRcdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gcmVmdXNlZCcpIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcblx0XHRcdGVycm9yLmNvZGUgPSAnRUNPTk5SRUZVU0VEJztcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH07XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UocHJveHlSZXNvbHZlcik7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLnJlcXVlc3Qoe1xuXHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9uby1yZXRyeScsXG5cdFx0XHR0eXBlOiAnUE9TVCcsXG5cdFx0XHRjYWxsU2l0ZTogJ2FnZW50SG9zdFJlcXVlc3RTZXJ2aWNlLnRlc3Qubm9SZXRyeScsXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksIC9Db25uZWN0aW9uIHJlZnVzZWQvKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdHRlbXB0cywgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIHByb3h5IGFuZCBhdXRob3JpemF0aW9uIGxvb2t1cHMgdGhyb3VnaCB0aGUgY2xpZW50IGNoYW5uZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2FsbHM6IHVua25vd25bXSA9IFtdO1xuXHRcdGNvbnN0IHJlcXVlc3RTZXJ2aWNlID0ge1xuXHRcdFx0cmVzb2x2ZVByb3h5OiBhc3luYyAodXJsOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y2FsbHMucHVzaChbJ3Jlc29sdmVQcm94eScsIHVybF0pO1xuXHRcdFx0XHRyZXR1cm4gJ1BST1hZIHByb3h5LmV4YW1wbGU6ODA4MCc7XG5cdFx0XHR9LFxuXHRcdFx0bG9va3VwQXV0aG9yaXphdGlvbjogYXN5bmMgKGF1dGhJbmZvOiBBdXRoSW5mbykgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKFsnbG9va3VwQXV0aG9yaXphdGlvbicsIGF1dGhJbmZvXSk7XG5cdFx0XHRcdHJldHVybiB7IHVzZXJuYW1lOiAndXNlcicsIHBhc3N3b3JkOiAncGFzc3dvcmQnIH07XG5cdFx0XHR9LFxuXHRcdFx0bG9va3VwS2VyYmVyb3NBdXRob3JpemF0aW9uOiBhc3luYyAodXJsOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y2FsbHMucHVzaChbJ2xvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbicsIHVybF0pO1xuXHRcdFx0XHRyZXR1cm4gJ05lZ290aWF0ZSB0b2tlbic7XG5cdFx0XHR9LFxuXHRcdH0gYXMgSVJlcXVlc3RTZXJ2aWNlO1xuXHRcdGNvbnN0IHNlcnZlciA9IG5ldyBBZ2VudEhvc3RDbGllbnRQcm94eUNoYW5uZWwocmVxdWVzdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNoYW5uZWw6IElDaGFubmVsID0ge1xuXHRcdFx0Y2FsbDogKGNvbW1hbmQsIGFyZykgPT4gc2VydmVyLmNhbGwodW5kZWZpbmVkLCBjb21tYW5kLCBhcmcpLFxuXHRcdFx0bGlzdGVuOiAoKSA9PiBFdmVudC5Ob25lLFxuXHRcdH07XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGNyZWF0ZUFnZW50SG9zdENsaWVudFByb3h5Q29ubmVjdGlvbihjaGFubmVsKTtcblx0XHRjb25zdCBhdXRoSW5mbzogQXV0aEluZm8gPSB7IHNjaGVtZTogJ2Jhc2ljJywgaG9zdDogJ3Byb3h5LmV4YW1wbGUnLCBwb3J0OiA4MDgwLCByZWFsbTogJ3Byb3h5JywgaXNQcm94eTogdHJ1ZSwgYXR0ZW1wdDogMSB9O1xuXG5cdFx0Y29uc3QgcmVzdWx0cyA9IFtcblx0XHRcdGF3YWl0IGNvbm5lY3Rpb24ucmVzb2x2ZVByb3h5KCdodHRwczovL2V4YW1wbGUuY29tJyksXG5cdFx0XHRhd2FpdCBjb25uZWN0aW9uLmxvb2t1cEF1dGhvcml6YXRpb24oYXV0aEluZm8pLFxuXHRcdFx0YXdhaXQgY29ubmVjdGlvbi5sb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb24oJ2h0dHA6Ly9wcm94eS5leGFtcGxlOjgwODAnKSxcblx0XHRdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNhbGxzLCByZXN1bHRzIH0sIHtcblx0XHRcdGNhbGxzOiBbXG5cdFx0XHRcdFsncmVzb2x2ZVByb3h5JywgJ2h0dHBzOi8vZXhhbXBsZS5jb20nXSxcblx0XHRcdFx0Wydsb29rdXBBdXRob3JpemF0aW9uJywgYXV0aEluZm9dLFxuXHRcdFx0XHRbJ2xvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbicsICdodHRwOi8vcHJveHkuZXhhbXBsZTo4MDgwJ10sXG5cdFx0XHRdLFxuXHRcdFx0cmVzdWx0czogW1xuXHRcdFx0XHQnUFJPWFkgcHJveHkuZXhhbXBsZTo4MDgwJyxcblx0XHRcdFx0eyB1c2VybmFtZTogJ3VzZXInLCBwYXNzd29yZDogJ3Bhc3N3b3JkJyB9LFxuXHRcdFx0XHQnTmVnb3RpYXRlIHRva2VuJyxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdOZXR3b3JrRGlhZ25vc3RpY3NTZXJ2aWNlJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdpbmNsdWRlcyBuZXN0ZWQgcHJveHkgcmVzcG9uc2UgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3h5RXJyb3IgPSBuZXcgRXJyb3IoJ1Byb3h5IHJlc3BvbnNlICg0MDcpJyk7XG5cdFx0Y29uc3QgZmV0Y2hFcnJvciA9IG5ldyBUeXBlRXJyb3IoJ2ZldGNoIGZhaWxlZCcsIHsgY2F1c2U6IG5ldyBFcnJvcignZGlzcGF0Y2hlciBmYWlsZWQnLCB7IGNhdXNlOiBwcm94eUVycm9yIH0pIH0pO1xuXHRcdGNvbnN0IHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UgPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRvbkRpZENvbXBsZXRlUmVxdWVzdDogRXZlbnQuTm9uZSxcblx0XHRcdHJlcXVlc3Q6IGFzeW5jICgpID0+IHsgdGhyb3cgZmV0Y2hFcnJvcjsgfSxcblx0XHRcdHJlc29sdmVQcm94eTogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0bG9va3VwQXV0aG9yaXphdGlvbjogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0bG9va3VwS2VyYmVyb3NBdXRob3JpemF0aW9uOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRsb2FkQ2VydGlmaWNhdGVzOiBhc3luYyAoKSA9PiBbXSxcblx0XHR9O1xuXHRcdGNvbnN0IHByb3h5UmVzb2x2ZXIgPSBuZXcgVGVzdFByb3h5UmVzb2x2ZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IE5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UoXG5cdFx0XHRyZXF1ZXN0U2VydmljZSxcblx0XHRcdHByb3h5UmVzb2x2ZXIsXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHR7IHZlcnNpb246ICd0ZXN0JyB9IGFzIElQcm9kdWN0U2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZldGNoKCdodHRwczovL2xvY2FsaG9zdCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lcnJvciwgJ2ZldGNoIGZhaWxlZDogZGlzcGF0Y2hlciBmYWlsZWQ6IFByb3h5IHJlc3BvbnNlICg0MDcpJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLHNCQUFzQjtBQUcvQixTQUFTLDZCQUE2Qiw0Q0FBa0Y7QUFFeEgsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQ0FBaUM7QUFFMUMsTUFBTSxrQkFBcUQ7QUFBQSxFQUEzRDtB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
