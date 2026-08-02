import assert from "assert";
import { encodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogger } from "../../../../platform/log/common/log.js";
import { DynamicAuthProvider, TokenStore } from "../../common/extHostAuthentication.js";
function jwt(claims) {
  const segment = (value) => encodeBase64(VSBuffer.fromString(JSON.stringify(value)));
  return `${segment({ alg: "none", typ: "JWT" })}.${segment(claims)}.signature`;
}
suite("TokenStore", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createStore(initialTokens) {
    const persistence = {
      onDidChange: disposables.add(new Emitter()).event,
      set: () => {
      }
    };
    return disposables.add(new TokenStore(persistence, initialTokens, new NullLogger()));
  }
  test("derives session scopes from the stored token.scope, falling back to JWT claims only when scope is absent", () => {
    const store = createStore([
      // Explicit empty scope must win over the scopes embedded in the JWT claims.
      { access_token: jwt({ sub: "a", scope: "menu:read orders:create orders:cancel" }), token_type: "Bearer", scope: "", created_at: 0 },
      // Absent scope (undefined) falls back to the JWT claims.
      { access_token: jwt({ sub: "b", scope: "menu:read orders:create" }), token_type: "Bearer", created_at: 0 },
      // A non-empty scope is authoritative over the JWT claims.
      { access_token: jwt({ sub: "c", scope: "ignored:claim" }), token_type: "Bearer", scope: "read write", created_at: 0 }
    ]);
    assert.deepStrictEqual(
      store.sessions.map((session) => session.scopes),
      [[], ["menu:read", "orders:create"], ["read", "write"]]
    );
  });
});
suite("DynamicAuthProvider", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class TestDynamicAuthProvider extends DynamicAuthProvider {
    constructor() {
      super(...arguments);
      this.generateNewClientIdCalls = 0;
    }
    async _generateNewClientId() {
      this.generateNewClientIdCalls++;
    }
  }
  test("does not rotate the client while silently refreshing a token", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls++;
      return new Response(JSON.stringify({ error: "invalid_client" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    };
    const loggerService = new class extends mock() {
      createLogger() {
        return new NullLogger();
      }
    }();
    const proxy = new class extends mock() {
      $setSessionsForDynamicAuthProvider() {
        return Promise.resolve();
      }
    }();
    const provider = disposables.add(new TestDynamicAuthProvider(
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      loggerService,
      proxy,
      URI.parse("https://mcp.example.com"),
      {
        issuer: "https://mcp.example.com",
        response_types_supported: ["code"],
        token_endpoint: "https://mcp.example.com/token"
      },
      { resource: "https://mcp.example.com/resource" },
      "client-id",
      void 0,
      disposables.add(new Emitter()),
      [{
        access_token: jwt({ sub: "account" }),
        token_type: "Bearer",
        scope: "",
        expires_in: 1,
        refresh_token: "refresh-token",
        created_at: 0
      }],
      fetcher
    ));
    const sessions = await provider.getSessions([], { silent: true });
    assert.deepStrictEqual({
      sessions,
      fetchCalls,
      generateNewClientIdCalls: provider.generateNewClientIdCalls,
      clientId: provider.clientId
    }, {
      sessions: [],
      fetchCalls: 1,
      generateNewClientIdCalls: 0,
      clientId: "client-id"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RBdXRoZW50aWNhdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5jb2RlQmFzZTY0LCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyLCBJTG9nZ2VyU2VydmljZSwgTnVsbExvZ2dlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblByb3ZpZGVyU2Vzc2lvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgRHluYW1pY0F1dGhQcm92aWRlciwgSUF1dGhvcml6YXRpb25Ub2tlbiwgVG9rZW5TdG9yZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0QXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZEF1dGhlbnRpY2F0aW9uU2hhcGUgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEluaXREYXRhU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0SW5pdERhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFByb2dyZXNzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VXJsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFVybHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RXaW5kb3cgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFdpbmRvdy5qcyc7XG5cbi8qKiBCdWlsZHMgYSBzdHJ1Y3R1cmFsbHktdmFsaWQgSldUIGNhcnJ5aW5nIHRoZSBnaXZlbiBjbGFpbXMuICovXG5mdW5jdGlvbiBqd3QoY2xhaW1zOiBvYmplY3QpOiBzdHJpbmcge1xuXHRjb25zdCBzZWdtZW50ID0gKHZhbHVlOiBvYmplY3QpID0+IGVuY29kZUJhc2U2NChWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHZhbHVlKSkpO1xuXHRyZXR1cm4gYCR7c2VnbWVudCh7IGFsZzogJ25vbmUnLCB0eXA6ICdKV1QnIH0pfS4ke3NlZ21lbnQoY2xhaW1zKX0uc2lnbmF0dXJlYDtcbn1cblxuc3VpdGUoJ1Rva2VuU3RvcmUnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTdG9yZShpbml0aWFsVG9rZW5zOiBJQXV0aG9yaXphdGlvblRva2VuW10pOiBUb2tlblN0b3JlIHtcblx0XHRjb25zdCBwZXJzaXN0ZW5jZSA9IHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SUF1dGhvcml6YXRpb25Ub2tlbltdPigpKS5ldmVudCxcblx0XHRcdHNldDogKCkgPT4geyB9XG5cdFx0fTtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBUb2tlblN0b3JlKHBlcnNpc3RlbmNlLCBpbml0aWFsVG9rZW5zLCBuZXcgTnVsbExvZ2dlcigpKSk7XG5cdH1cblxuXHQvLyBSZWdyZXNzaW9uIGZvciB0aGUgTUNQIHNpZ24taW4gbG9vcDogYW4gZXhwbGljaXQgZW1wdHkgYHRva2VuLnNjb3BlYCBtdXN0IGRlcml2ZSBlbXB0eSBzZXNzaW9uIHNjb3Blcywgbm90IHRoZSBncmFudGVkIHNjb3BlcyBmcm9tIHRoZSBKV1QgY2xhaW1zLCBlbHNlIGVtcHR5LXNjb3BlIGxvb2t1cHMgbmV2ZXIgbWF0Y2ggdGhlaXIgb3duIHNlc3Npb24uXG5cdHRlc3QoJ2Rlcml2ZXMgc2Vzc2lvbiBzY29wZXMgZnJvbSB0aGUgc3RvcmVkIHRva2VuLnNjb3BlLCBmYWxsaW5nIGJhY2sgdG8gSldUIGNsYWltcyBvbmx5IHdoZW4gc2NvcGUgaXMgYWJzZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlU3RvcmUoW1xuXHRcdFx0Ly8gRXhwbGljaXQgZW1wdHkgc2NvcGUgbXVzdCB3aW4gb3ZlciB0aGUgc2NvcGVzIGVtYmVkZGVkIGluIHRoZSBKV1QgY2xhaW1zLlxuXHRcdFx0eyBhY2Nlc3NfdG9rZW46IGp3dCh7IHN1YjogJ2EnLCBzY29wZTogJ21lbnU6cmVhZCBvcmRlcnM6Y3JlYXRlIG9yZGVyczpjYW5jZWwnIH0pLCB0b2tlbl90eXBlOiAnQmVhcmVyJywgc2NvcGU6ICcnLCBjcmVhdGVkX2F0OiAwIH0sXG5cdFx0XHQvLyBBYnNlbnQgc2NvcGUgKHVuZGVmaW5lZCkgZmFsbHMgYmFjayB0byB0aGUgSldUIGNsYWltcy5cblx0XHRcdHsgYWNjZXNzX3Rva2VuOiBqd3QoeyBzdWI6ICdiJywgc2NvcGU6ICdtZW51OnJlYWQgb3JkZXJzOmNyZWF0ZScgfSksIHRva2VuX3R5cGU6ICdCZWFyZXInLCBjcmVhdGVkX2F0OiAwIH0sXG5cdFx0XHQvLyBBIG5vbi1lbXB0eSBzY29wZSBpcyBhdXRob3JpdGF0aXZlIG92ZXIgdGhlIEpXVCBjbGFpbXMuXG5cdFx0XHR7IGFjY2Vzc190b2tlbjogand0KHsgc3ViOiAnYycsIHNjb3BlOiAnaWdub3JlZDpjbGFpbScgfSksIHRva2VuX3R5cGU6ICdCZWFyZXInLCBzY29wZTogJ3JlYWQgd3JpdGUnLCBjcmVhdGVkX2F0OiAwIH0sXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0c3RvcmUuc2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gc2Vzc2lvbi5zY29wZXMpLFxuXHRcdFx0W1tdLCBbJ21lbnU6cmVhZCcsICdvcmRlcnM6Y3JlYXRlJ10sIFsncmVhZCcsICd3cml0ZSddXVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdEeW5hbWljQXV0aFByb3ZpZGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y2xhc3MgVGVzdER5bmFtaWNBdXRoUHJvdmlkZXIgZXh0ZW5kcyBEeW5hbWljQXV0aFByb3ZpZGVyIHtcblx0XHRnZW5lcmF0ZU5ld0NsaWVudElkQ2FsbHMgPSAwO1xuXG5cdFx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9nZW5lcmF0ZU5ld0NsaWVudElkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0dGhpcy5nZW5lcmF0ZU5ld0NsaWVudElkQ2FsbHMrKztcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdkb2VzIG5vdCByb3RhdGUgdGhlIGNsaWVudCB3aGlsZSBzaWxlbnRseSByZWZyZXNoaW5nIGEgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGZldGNoQ2FsbHMgPSAwO1xuXHRcdGNvbnN0IGZldGNoZXI6IHR5cGVvZiBmZXRjaCA9IGFzeW5jICgpID0+IHtcblx0XHRcdGZldGNoQ2FsbHMrKztcblx0XHRcdHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ2ludmFsaWRfY2xpZW50JyB9KSwge1xuXHRcdFx0XHRzdGF0dXM6IDQwMCxcblx0XHRcdFx0aGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sXG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdGNvbnN0IGxvZ2dlclNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMb2dnZXJTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGNyZWF0ZUxvZ2dlcigpOiBJTG9nZ2VyIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBOdWxsTG9nZ2VyKCk7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IHByb3h5ID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkQXV0aGVudGljYXRpb25TaGFwZT4oKSB7XG5cdFx0XHRvdmVycmlkZSAkc2V0U2Vzc2lvbnNGb3JEeW5hbWljQXV0aFByb3ZpZGVyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RHluYW1pY0F1dGhQcm92aWRlcihcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RXaW5kb3c+KCkgeyB9KCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0VXJsc1NlcnZpY2U+KCkgeyB9KCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlPigpIHsgfSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdFByb2dyZXNzPigpIHsgfSgpLFxuXHRcdFx0bG9nZ2VyU2VydmljZSxcblx0XHRcdHByb3h5LFxuXHRcdFx0VVJJLnBhcnNlKCdodHRwczovL21jcC5leGFtcGxlLmNvbScpLFxuXHRcdFx0e1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL21jcC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ10sXG5cdFx0XHRcdHRva2VuX2VuZHBvaW50OiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20vdG9rZW4nLFxuXHRcdFx0fSxcblx0XHRcdHsgcmVzb3VyY2U6ICdodHRwczovL21jcC5leGFtcGxlLmNvbS9yZXNvdXJjZScgfSxcblx0XHRcdCdjbGllbnQtaWQnLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyKCkpLFxuXHRcdFx0W3tcblx0XHRcdFx0YWNjZXNzX3Rva2VuOiBqd3QoeyBzdWI6ICdhY2NvdW50JyB9KSxcblx0XHRcdFx0dG9rZW5fdHlwZTogJ0JlYXJlcicsXG5cdFx0XHRcdHNjb3BlOiAnJyxcblx0XHRcdFx0ZXhwaXJlc19pbjogMSxcblx0XHRcdFx0cmVmcmVzaF90b2tlbjogJ3JlZnJlc2gtdG9rZW4nLFxuXHRcdFx0XHRjcmVhdGVkX2F0OiAwLFxuXHRcdFx0fV0sXG5cdFx0XHRmZXRjaGVyLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBwcm92aWRlci5nZXRTZXNzaW9ucyhbXSwgeyBzaWxlbnQ6IHRydWUgfSBzYXRpc2ZpZXMgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXJTZXNzaW9uT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlc3Npb25zLFxuXHRcdFx0ZmV0Y2hDYWxscyxcblx0XHRcdGdlbmVyYXRlTmV3Q2xpZW50SWRDYWxsczogcHJvdmlkZXIuZ2VuZXJhdGVOZXdDbGllbnRJZENhbGxzLFxuXHRcdFx0Y2xpZW50SWQ6IHByb3ZpZGVyLmNsaWVudElkLFxuXHRcdH0sIHtcblx0XHRcdHNlc3Npb25zOiBbXSxcblx0XHRcdGZldGNoQ2FsbHM6IDEsXG5cdFx0XHRnZW5lcmF0ZU5ld0NsaWVudElkQ2FsbHM6IDAsXG5cdFx0XHRjbGllbnRJZDogJ2NsaWVudC1pZCcsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxjQUFjLGdCQUFnQjtBQUN2QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFrQyxrQkFBa0I7QUFFcEQsU0FBUyxxQkFBMEMsa0JBQWtCO0FBUXJFLFNBQVMsSUFBSSxRQUF3QjtBQUNwQyxRQUFNLFVBQVUsQ0FBQyxVQUFrQixhQUFhLFNBQVMsV0FBVyxLQUFLLFVBQVUsS0FBSyxDQUFDLENBQUM7QUFDMUYsU0FBTyxHQUFHLFFBQVEsRUFBRSxLQUFLLFFBQVEsS0FBSyxNQUFNLENBQUMsQ0FBQyxJQUFJLFFBQVEsTUFBTSxDQUFDO0FBQ2xFO0FBRUEsTUFBTSxjQUFjLE1BQU07QUFFekIsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxXQUFTLFlBQVksZUFBa0Q7QUFDdEUsVUFBTSxj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
