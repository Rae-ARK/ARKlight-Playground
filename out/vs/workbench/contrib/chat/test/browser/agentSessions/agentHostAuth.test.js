import assert from "assert";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { Event } from "../../../../../../base/common/event.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IAuthenticationMcpAccessService } from "../../../../../services/authentication/browser/authenticationMcpAccessService.js";
import { IAuthenticationMcpService } from "../../../../../services/authentication/browser/authenticationMcpService.js";
import { IAuthenticationMcpUsageService } from "../../../../../services/authentication/browser/authenticationMcpUsageService.js";
import { IAuthenticationService } from "../../../../../services/authentication/common/authentication.js";
import { IDynamicAuthenticationProviderStorageService } from "../../../../../services/authentication/common/dynamicAuthenticationProviderStorage.js";
import { CHAT_SETUP_ACTION_ID } from "../../../browser/actions/chatActions.js";
import { authenticateProtectedResources, resolveAuthenticationInteractively, resolveTokenForResource, AgentHostAuthTokenCache, agentHostMcpServerId, resolveMcpServerAuthentication } from "../../../browser/agentSessions/agentHost/agentHostAuth.js";
class TestCommandService extends mock() {
  constructor() {
    super(...arguments);
    this.calls = [];
    this.result = { success: true, dialogSkipped: false };
  }
  async executeCommand(commandId, ...args) {
    this.calls.push({ commandId, args });
    this.onExecute?.();
    return this.result;
  }
}
function createAuthInstantiationService(disposables, authenticationService, commandService = new TestCommandService()) {
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.stub(IAuthenticationService, authenticationService);
  instantiationService.stub(ICommandService, commandService);
  instantiationService.stub(ILogService, new NullLogService());
  return instantiationService;
}
function createMockAuthService(overrides) {
  return {
    getOrActivateProviderIdForServer: overrides.getOrActivateProviderIdForServer ?? (() => Promise.resolve(void 0)),
    getSessions: overrides.getSessions ?? (() => Promise.resolve([])),
    createSession: overrides.createSession ?? (() => Promise.reject(new Error("Unexpected createSession call"))),
    createDynamicAuthenticationProvider: overrides.createDynamicAuthenticationProvider ?? (() => Promise.resolve(void 0)),
    getProvider: overrides.getProvider ?? (() => {
      throw new Error("Unexpected getProvider call");
    }),
    isDynamicAuthenticationProvider: overrides.isDynamicAuthenticationProvider ?? (() => false),
    unregisterAuthenticationProvider: overrides.unregisterAuthenticationProvider ?? (() => {
    })
  };
}
suite("agentHostMcpServerId", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("is stable for the same authority, server name and resource url", () => {
    const a = agentHostMcpServerId("remote-host", "GitHub", "https://api.githubcopilot.com/mcp/");
    const b = agentHostMcpServerId("remote-host", "GitHub", "https://api.githubcopilot.com/mcp/");
    assert.strictEqual(a, b);
    assert.strictEqual(a, "agent-host-mcp:remote-host/GitHub/https%3A%2F%2Fapi.githubcopilot.com%2Fmcp%2F");
  });
  test("differs when authority, name or url differ", () => {
    const base = agentHostMcpServerId("host-1", "GitHub", "https://a.example/mcp");
    const keys = /* @__PURE__ */ new Set([
      base,
      agentHostMcpServerId("host-2", "GitHub", "https://a.example/mcp"),
      agentHostMcpServerId("host-1", "Other", "https://a.example/mcp"),
      agentHostMcpServerId("host-1", "GitHub", "https://b.example/mcp")
    ]);
    assert.strictEqual(keys.size, 4);
  });
});
suite("resolveTokenForResource", () => {
  const log = new NullLogService();
  const resource = URI.parse("https://api.example.com");
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns undefined when no authorization servers provided", async () => {
    const authService = createMockAuthService({});
    const token = await resolveTokenForResource(resource, [], ["read"], authService, log, "test");
    assert.strictEqual(token, void 0);
  });
  test("returns undefined when no provider matches the server", async () => {
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve(void 0)
    });
    const token = await resolveTokenForResource(resource, ["https://auth.example.com"], ["read"], authService, log, "test");
    assert.strictEqual(token, void 0);
  });
  test("returns token from exact scope match", async () => {
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        if (scopes && scopes.length === 1 && scopes[0] === "read") {
          return Promise.resolve([{ scopes: ["read"], accessToken: "exact-token" }]);
        }
        return Promise.resolve([]);
      }
    });
    const token = await resolveTokenForResource(resource, ["https://auth.example.com"], ["read"], authService, log, "test");
    assert.strictEqual(token, "exact-token");
  });
  test("falls back to narrowest superset session when exact match fails", async () => {
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        if (scopes !== void 0) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          { scopes: ["read", "write", "admin"], accessToken: "wide-token" },
          { scopes: ["read", "write"], accessToken: "narrow-token" }
        ]);
      }
    });
    const token = await resolveTokenForResource(resource, ["https://auth.example.com"], ["read"], authService, log, "test");
    assert.strictEqual(token, "narrow-token");
  });
  test("returns undefined when no session has matching scopes", async () => {
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        if (scopes !== void 0) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          { scopes: ["write"], accessToken: "wrong-token" }
        ]);
      }
    });
    const token = await resolveTokenForResource(resource, ["https://auth.example.com"], ["read"], authService, log, "test");
    assert.strictEqual(token, void 0);
  });
  test("tries multiple authorization servers in order", async () => {
    const calls = [];
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: (serverUri) => {
        calls.push(serverUri.toString());
        if (serverUri.toString() === "https://auth2.example.com/") {
          return Promise.resolve("provider-2");
        }
        return Promise.resolve(void 0);
      },
      getSessions: () => Promise.resolve([{ scopes: ["read"], accessToken: "server2-token" }])
    });
    const token = await resolveTokenForResource(
      resource,
      ["https://auth1.example.com", "https://auth2.example.com"],
      ["read"],
      authService,
      log,
      "test"
    );
    assert.strictEqual(token, "server2-token");
    assert.strictEqual(calls.length, 2);
  });
});
suite("AgentHostAuthTokenCache", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("forwards the first token and skips it after completion", async () => {
    const cache = new AgentHostAuthTokenCache();
    let authenticateCalls = 0;
    const authenticate = async () => {
      authenticateCalls++;
    };
    const results = [
      await cache.authenticate("https://api.example.com", ["read"], "tok1", authenticate),
      await cache.authenticate("https://api.example.com", ["read"], "tok1", authenticate)
    ];
    assert.deepStrictEqual({ results, authenticateCalls }, { results: [true, false], authenticateCalls: 1 });
  });
  test("same-token callers await the in-flight authentication", async () => {
    const cache = new AgentHostAuthTokenCache();
    const authentication = new DeferredPromise();
    let authenticateCalls = 0;
    const authenticate = async () => {
      authenticateCalls++;
      await authentication.p;
    };
    let secondSettled = false;
    const first = cache.authenticate("https://api.example.com", ["read"], "tok1", authenticate);
    const second = cache.authenticate("https://api.example.com", ["read"], "tok1", authenticate).then((result) => {
      secondSettled = true;
      return result;
    });
    await Promise.resolve();
    const beforeCompletion = { authenticateCalls, secondSettled };
    authentication.complete();
    assert.deepStrictEqual({
      beforeCompletion,
      results: await Promise.all([first, second]),
      authenticateCalls
    }, {
      beforeCompletion: { authenticateCalls: 1, secondSettled: false },
      results: [true, false],
      authenticateCalls: 1
    });
  });
  test("different tokens are serialized for the same resource and scopes", async () => {
    const cache = new AgentHostAuthTokenCache();
    const firstAuthentication = new DeferredPromise();
    const calls = [];
    const first = cache.authenticate("https://api.example.com", ["read"], "tok1", async () => {
      calls.push("tok1");
      await firstAuthentication.p;
    });
    const second = cache.authenticate("https://api.example.com", ["read"], "tok2", async () => {
      calls.push("tok2");
    });
    await Promise.resolve();
    const beforeCompletion = [...calls];
    firstAuthentication.complete();
    await Promise.all([first, second]);
    assert.deepStrictEqual({ beforeCompletion, calls }, { beforeCompletion: ["tok1"], calls: ["tok1", "tok2"] });
  });
  test("a completed token waits for a newer in-flight authentication", async () => {
    const cache = new AgentHostAuthTokenCache();
    const newerAuthentication = new DeferredPromise();
    const calls = [];
    await cache.authenticate("https://api.example.com", ["read"], "tok1", async () => {
      calls.push("tok1");
    });
    const newer = cache.authenticate("https://api.example.com", ["read"], "tok2", async () => {
      calls.push("tok2");
      await newerAuthentication.p;
    });
    let olderSettled = false;
    const older = cache.authenticate("https://api.example.com", ["read"], "tok1", async () => {
      calls.push("tok1");
    }).then((result) => {
      olderSettled = true;
      return result;
    });
    await Promise.resolve();
    const beforeCompletion = { calls: [...calls], olderSettled };
    newerAuthentication.complete();
    assert.deepStrictEqual({
      beforeCompletion,
      results: await Promise.all([newer, older]),
      calls
    }, {
      beforeCompletion: { calls: ["tok1", "tok2"], olderSettled: false },
      results: [true, true],
      calls: ["tok1", "tok2", "tok1"]
    });
  });
  test("clear cancels queued authentication from the previous generation", async () => {
    const cache = new AgentHostAuthTokenCache();
    const firstAuthentication = new DeferredPromise();
    const calls = [];
    const first = cache.authenticate("https://api.example.com", ["read"], "tok1", async () => {
      calls.push("tok1");
      await firstAuthentication.p;
    });
    const queued = cache.authenticate("https://api.example.com", ["read"], "tok2", async () => {
      calls.push("tok2");
    });
    cache.clear();
    await cache.authenticate("https://api.example.com", ["read"], "tok3", async () => {
      calls.push("tok3");
    });
    firstAuthentication.complete();
    await assert.rejects(first);
    await assert.rejects(queued);
    assert.deepStrictEqual(calls, ["tok1", "tok3"]);
  });
  test("scoped clear does not cancel unrelated in-flight authentication", async () => {
    const cache = new AgentHostAuthTokenCache();
    const unrelatedAuthentication = new DeferredPromise();
    let unrelatedCalls = 0;
    const unrelated = cache.authenticate("https://other.example.com", ["read"], "other-token", async () => {
      unrelatedCalls++;
      await unrelatedAuthentication.p;
    });
    cache.clear("https://api.example.com", ["read"]);
    unrelatedAuthentication.complete();
    assert.deepStrictEqual({
      result: await unrelated,
      unrelatedCalls,
      repeated: await cache.authenticate("https://other.example.com", ["read"], "other-token", async () => {
        unrelatedCalls++;
      })
    }, {
      result: true,
      unrelatedCalls: 1,
      repeated: false
    });
  });
  test("tokens for distinct scopes and resources are tracked independently", async () => {
    const cache = new AgentHostAuthTokenCache();
    let authenticateCalls = 0;
    const authenticate = async () => {
      authenticateCalls++;
    };
    await Promise.all([
      cache.authenticate("https://api.example.com", ["read"], "read-token", authenticate),
      cache.authenticate("https://api.example.com", ["write"], "write-token", authenticate),
      cache.authenticate("https://other.example.com", ["read"], "read-token", authenticate)
    ]);
    assert.strictEqual(authenticateCalls, 3);
  });
  test("failed authentication is not cached", async () => {
    const cache = new AgentHostAuthTokenCache();
    let authenticateCalls = 0;
    await assert.rejects(cache.authenticate("https://api.example.com", ["read"], "tok1", async () => {
      authenticateCalls++;
      throw new Error("failed");
    }), /failed/);
    await cache.authenticate("https://api.example.com", ["read"], "tok1", async () => {
      authenticateCalls++;
    });
    assert.strictEqual(authenticateCalls, 2);
  });
  test("clear forgets every completed token", async () => {
    const cache = new AgentHostAuthTokenCache();
    let authenticateCalls = 0;
    const authenticate = async () => {
      authenticateCalls++;
    };
    await cache.authenticate("https://api.example.com", ["read"], "tok1", authenticate);
    await cache.authenticate("https://other.example.com", ["read"], "tok2", authenticate);
    cache.clear();
    await cache.authenticate("https://api.example.com", ["read"], "tok1", authenticate);
    await cache.authenticate("https://other.example.com", ["read"], "tok2", authenticate);
    assert.strictEqual(authenticateCalls, 4);
  });
});
suite("resolveMcpServerAuthentication", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("uses challenge scopes without replacing the protected resource scope catalog", async () => {
    const requestedScopes = [];
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        requestedScopes.push(scopes);
        return Promise.resolve([]);
      }
    });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, authService);
    instantiationService.stub(IAuthenticationMcpAccessService, {});
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => void 0
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {});
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {});
    instantiationService.stub(ILogService, new NullLogService());
    const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
      resource: "https://mcp.example.com",
      authorization_servers: ["https://auth.example.com"],
      scopes_supported: ["repo", "read:org", "notifications"]
    }, {
      allowInteraction: false,
      logPrefix: "[AgentHost]",
      mcpServerId: "server-id",
      mcpServerName: "Example",
      mcpServerUrl: "https://mcp.example.com",
      scopes: ["notifications"],
      authenticate: async () => {
      }
    });
    assert.deepStrictEqual({ result, requestedScopes }, {
      result: false,
      requestedScopes: [["notifications"]]
    });
  });
  test("uses supported scopes when the challenge does not specify scopes", async () => {
    const requestedScopes = [];
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        requestedScopes.push(scopes ?? []);
        return Promise.resolve([]);
      }
    });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, authService);
    instantiationService.stub(IAuthenticationMcpAccessService, {});
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => void 0
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {});
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {});
    instantiationService.stub(ILogService, new NullLogService());
    const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
      resource: "https://mcp.slack.com",
      resource_name: "Slack API",
      authorization_servers: ["https://mcp.slack.com"],
      scopes_supported: ["search:read.public", "chat:write"]
    }, {
      allowInteraction: false,
      logPrefix: "[AgentHost]",
      mcpServerId: "slack",
      mcpServerName: "Slack",
      mcpServerUrl: "https://mcp.slack.com",
      scopes: [],
      authenticate: async () => {
      }
    });
    assert.deepStrictEqual({ result, requestedScopes }, {
      result: false,
      requestedScopes: [["search:read.public", "chat:write"]]
    });
  });
  test("does not eagerly request GitHub MCP supported scopes", async () => {
    const requestedScopes = [];
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        requestedScopes.push(scopes ?? []);
        return Promise.resolve([]);
      }
    });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, authService);
    instantiationService.stub(IAuthenticationMcpAccessService, {});
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => void 0
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {});
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {});
    instantiationService.stub(ILogService, new NullLogService());
    const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
      resource: "https://api.githubcopilot.com/mcp",
      resource_name: "GitHub MCP Server",
      authorization_servers: ["https://github.com/login/oauth"],
      scopes_supported: ["repo", "notifications"]
    }, {
      allowInteraction: false,
      logPrefix: "[AgentHost]",
      mcpServerId: "github",
      mcpServerName: "GitHub",
      mcpServerUrl: "https://api.githubcopilot.com/mcp",
      scopes: [],
      authenticate: async () => {
      }
    });
    assert.deepStrictEqual({ result, requestedScopes }, {
      result: false,
      requestedScopes: [[]]
    });
  });
  test("does not create a dynamic provider silently without a persisted registration", async () => {
    const warnings = [];
    const providerCreations = [];
    const metadataRequests = [];
    const logService = new class extends NullLogService {
      warn(message) {
        warnings.push(message);
      }
    }();
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, createMockAuthService({
      createDynamicAuthenticationProvider: async (authorizationServer) => {
        providerCreations.push(authorizationServer.toString(true));
        return void 0;
      }
    }));
    instantiationService.stub(IAuthenticationMcpAccessService, {});
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => void 0
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {});
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
      getClientRegistration: () => Promise.resolve(void 0)
    });
    instantiationService.stub(ILogService, logService);
    const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
      resource: "https://mcp.example.com",
      authorization_servers: ["https://auth.example.com"]
    }, {
      allowInteraction: false,
      logPrefix: "[AgentHost]",
      mcpServerId: "server-id",
      mcpServerName: "Example",
      mcpServerUrl: "https://mcp.example.com",
      scopes: [],
      authorizationServerMetadataFetcher: async (authorizationServer) => {
        metadataRequests.push(authorizationServer);
        throw new Error("Unexpected metadata request");
      },
      authenticate: async () => {
      }
    });
    assert.deepStrictEqual({ result, warnings, metadataRequests, providerCreations }, {
      result: false,
      warnings: [],
      metadataRequests: [],
      providerCreations: []
    });
  });
  test("restores a persisted dynamically registered provider without user interaction", async () => {
    const dynamicProviderId = "https://mcp.notion.com/ https://mcp.notion.com/mcp";
    const providerCreations = [];
    const sessionRequests = [];
    const authenticateRequests = [];
    const authService = createMockAuthService({
      createDynamicAuthenticationProvider: async (_authorizationServer, _metadata, _resource, clientId, clientSecret) => {
        providerCreations.push({ clientId, clientSecret });
        return { id: dynamicProviderId };
      },
      getSessions: (_providerId, _scopes, options) => {
        sessionRequests.push({ silent: options.silent });
        return Promise.resolve([{
          id: "notion-session",
          scopes: [],
          accessToken: "notion-token",
          account: { id: "account-id", label: "Notion Account" }
        }]);
      }
    });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, authService);
    instantiationService.stub(IAuthenticationMcpAccessService, {
      isAccessAllowedForUrl: () => true
    });
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => "Notion Account"
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {
      addAccountUsage: () => {
      }
    });
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
      getClientRegistration: () => Promise.resolve({ clientId: "notion-client-id", clientSecret: "notion-client-secret" })
    });
    instantiationService.stub(ILogService, new NullLogService());
    const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
      resource: "https://mcp.notion.com/mcp",
      authorization_servers: ["https://mcp.notion.com"]
    }, {
      allowInteraction: false,
      logPrefix: "[AgentHost]",
      mcpServerId: "notion",
      mcpServerName: "notion",
      mcpServerUrl: "https://mcp.notion.com/mcp",
      scopes: [],
      authorizationServerMetadataFetcher: async (authorizationServer) => ({
        metadata: {
          issuer: authorizationServer,
          response_types_supported: ["code"]
        },
        discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
        errors: []
      }),
      authenticate: async (request) => {
        authenticateRequests.push(request);
      }
    });
    assert.deepStrictEqual({ result, providerCreations, sessionRequests, authenticateRequests }, {
      result: true,
      providerCreations: [{ clientId: "notion-client-id", clientSecret: "notion-client-secret" }],
      sessionRequests: [{ silent: true }],
      authenticateRequests: [{
        resource: "https://mcp.notion.com/mcp",
        scopes: [],
        token: "notion-token"
      }]
    });
  });
  test("serializes authentication transactions for different configured clients", async () => {
    const dynamicProviderId = "https://mcp.example.com/ https://mcp.example.com/resource";
    const firstSessionStarted = new DeferredPromise();
    const firstSessionGate = new DeferredPromise();
    const providerCreations = [];
    const sessionRequests = [];
    const authenticateRequests = [];
    let activeClient;
    let providerActive = false;
    const authService = createMockAuthService({
      isDynamicAuthenticationProvider: (providerId) => providerId === dynamicProviderId && providerActive,
      createDynamicAuthenticationProvider: async (_authorizationServer, _metadata, _resource, clientId) => {
        activeClient = clientId;
        providerActive = true;
        providerCreations.push(clientId ?? "");
        return { id: dynamicProviderId };
      },
      unregisterAuthenticationProvider: () => {
        providerActive = false;
      },
      getSessions: async () => {
        const clientId = activeClient ?? "";
        sessionRequests.push(clientId);
        if (clientId === "first-client") {
          firstSessionStarted.complete();
          await firstSessionGate.p;
        }
        return [{
          id: `${clientId}-session`,
          scopes: [],
          accessToken: `${clientId}-token`,
          account: { id: "account-id", label: "MCP Account" }
        }];
      }
    });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, authService);
    instantiationService.stub(IAuthenticationMcpAccessService, {
      isAccessAllowedForUrl: () => true
    });
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => "MCP Account"
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {
      addAccountUsage: () => {
      }
    });
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
      getClientRegistration: () => Promise.resolve(activeClient ? { clientId: activeClient } : void 0),
      removeDynamicProvider: async () => {
        activeClient = void 0;
      }
    });
    instantiationService.stub(ILogService, new NullLogService());
    const protectedResource = {
      resource: "https://mcp.example.com/resource",
      authorization_servers: ["https://mcp.example.com"]
    };
    const options = (clientId) => ({
      allowInteraction: true,
      logPrefix: "[AgentHost]",
      mcpServerId: "example",
      mcpServerName: "Example",
      mcpServerUrl: "https://mcp.example.com/resource",
      oauthClient: { clientId },
      scopes: [],
      authorizationServerMetadataFetcher: async (authorizationServer) => ({
        metadata: {
          issuer: authorizationServer,
          response_types_supported: ["code"]
        },
        discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
        errors: []
      }),
      authenticate: async (request) => {
        authenticateRequests.push(request.token);
      }
    });
    const first = instantiationService.invokeFunction(resolveMcpServerAuthentication, protectedResource, options("first-client"));
    const second = instantiationService.invokeFunction(resolveMcpServerAuthentication, protectedResource, options("second-client"));
    await firstSessionStarted.p;
    const beforeResolution = {
      providerCreations: [...providerCreations],
      sessionRequests: [...sessionRequests]
    };
    firstSessionGate.complete();
    const results = await Promise.all([first, second]);
    assert.deepStrictEqual({
      beforeResolution,
      results,
      providerCreations,
      sessionRequests,
      authenticateRequests
    }, {
      beforeResolution: {
        providerCreations: ["first-client"],
        sessionRequests: ["first-client"]
      },
      results: [true, true],
      providerCreations: ["first-client", "second-client"],
      sessionRequests: ["first-client", "second-client"],
      authenticateRequests: ["first-client-token", "second-client-token"]
    });
  });
  test("restores a persisted configured provider without user interaction", async () => {
    const dynamicProviderId = "https://mcp.slack.com/ https://mcp.slack.com";
    const providerCreations = [];
    const authenticateRequests = [];
    let isProviderActive = false;
    const authService = createMockAuthService({
      isDynamicAuthenticationProvider: (providerId) => providerId === dynamicProviderId && isProviderActive,
      createDynamicAuthenticationProvider: async (_authorizationServer, _metadata, _resource, clientId) => {
        providerCreations.push(clientId ?? "");
        isProviderActive = true;
        return { id: dynamicProviderId };
      },
      getSessions: () => Promise.resolve([{
        id: "slack-session",
        scopes: ["search:read.public"],
        accessToken: "slack-token",
        account: { id: "account-id", label: "Slack Account" }
      }])
    });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, authService);
    instantiationService.stub(IAuthenticationMcpAccessService, {
      isAccessAllowedForUrl: () => true
    });
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => "Slack Account"
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {
      addAccountUsage: () => {
      }
    });
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
      getClientRegistration: () => Promise.resolve({ clientId: "slack-client-id" })
    });
    instantiationService.stub(ILogService, new NullLogService());
    const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
      resource: "https://mcp.slack.com",
      authorization_servers: ["https://mcp.slack.com"],
      scopes_supported: ["search:read.public"]
    }, {
      allowInteraction: false,
      logPrefix: "[AgentHost]",
      mcpServerId: "slack",
      mcpServerName: "Slack",
      mcpServerUrl: "https://mcp.slack.com",
      oauthClient: { clientId: "slack-client-id" },
      scopes: [],
      authorizationServerMetadataFetcher: async (authorizationServer) => ({
        metadata: {
          issuer: authorizationServer,
          response_types_supported: ["code"]
        },
        discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
        errors: []
      }),
      authenticate: async (request) => {
        authenticateRequests.push(request);
      }
    });
    assert.deepStrictEqual({ result, providerCreations, authenticateRequests }, {
      result: true,
      providerCreations: ["slack-client-id"],
      authenticateRequests: [{
        resource: "https://mcp.slack.com",
        scopes: ["search:read.public"],
        token: "slack-token"
      }]
    });
  });
  test("uses configured public and confidential clients when creating a dynamic provider", async () => {
    const dynamicProviderId = "https://mcp.slack.com/ https://mcp.slack.com";
    const providerCreations = [];
    const sessionRequests = [];
    const sessionCreations = [];
    const authenticateRequests = [];
    const removedProviders = [];
    let registeredClient;
    let getSessionsCall = 0;
    const provider = {
      id: dynamicProviderId,
      label: "Slack",
      supportsMultipleAccounts: false,
      onDidChangeSessions: Event.None,
      getSessions: () => Promise.reject(new Error("Unexpected provider getSessions call")),
      createSession: () => Promise.reject(new Error("Unexpected provider createSession call")),
      removeSession: () => Promise.reject(new Error("Unexpected provider removeSession call"))
    };
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.reject(new Error("Configured clients must not use a built-in provider")),
      getSessions: (_providerId, _scopes, options) => {
        sessionRequests.push({ clientId: options.clientId, clientSecret: options.clientSecret });
        getSessionsCall++;
        return Promise.resolve(getSessionsCall === 1 ? [{
          scopes: ["search:read.public"],
          accessToken: "public-token",
          account: { id: "account-id", label: "Slack Account" }
        }] : []);
      },
      createSession: (_providerId, _scopes, options) => {
        sessionCreations.push({ clientId: options.clientId, clientSecret: options.clientSecret });
        return Promise.resolve({
          id: "confidential-session",
          accessToken: "confidential-token",
          account: { id: "account-id", label: "Slack Account" },
          scopes: ["search:read.public"]
        });
      },
      createDynamicAuthenticationProvider: async (authorizationServer, _metadata, resource, clientId, clientSecret) => {
        providerCreations.push({
          authorizationServer: authorizationServer.toString(true),
          resource: resource?.resource,
          clientId,
          clientSecret
        });
        registeredClient = { clientId, clientSecret };
        return { id: dynamicProviderId };
      },
      getProvider: () => provider,
      isDynamicAuthenticationProvider: (providerId) => providerId === dynamicProviderId && registeredClient !== void 0,
      unregisterAuthenticationProvider: (providerId) => {
        removedProviders.push(providerId);
        registeredClient = void 0;
      }
    });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, authService);
    instantiationService.stub(IAuthenticationMcpAccessService, {
      isAccessAllowedForUrl: () => true,
      updateAllowedMcpServers: () => {
      }
    });
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => "Slack Account",
      updateAccountPreference: () => {
      }
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {
      addAccountUsage: () => {
      }
    });
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
      getClientRegistration: () => Promise.resolve(registeredClient),
      removeDynamicProvider: async (providerId) => {
        removedProviders.push(providerId);
      }
    });
    instantiationService.stub(ILogService, new NullLogService());
    const results = [];
    for (const oauthClient of [
      { clientId: "public-client-id" },
      { clientId: "confidential-client-id", clientSecret: "confidential-client-secret" }
    ]) {
      results.push(await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
        resource: "https://mcp.slack.com",
        authorization_servers: ["https://mcp.slack.com"],
        scopes_supported: ["search:read.public"]
      }, {
        allowInteraction: true,
        logPrefix: "[AgentHost]",
        mcpServerId: "slack",
        mcpServerName: "Slack",
        mcpServerUrl: "https://mcp.slack.com",
        oauthClient,
        scopes: ["search:read.public"],
        authorizationServerMetadataFetcher: async (authorizationServer) => ({
          metadata: {
            issuer: authorizationServer,
            response_types_supported: ["code"]
          },
          discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
          errors: []
        }),
        authenticate: async (request) => {
          authenticateRequests.push(request);
        }
      }));
    }
    assert.deepStrictEqual({
      results,
      providerCreations,
      sessionRequests,
      sessionCreations,
      authenticateRequests,
      removedProviders
    }, {
      results: [true, true],
      providerCreations: [
        {
          authorizationServer: "https://mcp.slack.com/",
          resource: "https://mcp.slack.com",
          clientId: "public-client-id",
          clientSecret: void 0
        },
        {
          authorizationServer: "https://mcp.slack.com/",
          resource: "https://mcp.slack.com",
          clientId: "confidential-client-id",
          clientSecret: "confidential-client-secret"
        }
      ],
      sessionRequests: [
        { clientId: "public-client-id", clientSecret: void 0 },
        { clientId: "confidential-client-id", clientSecret: "confidential-client-secret" }
      ],
      sessionCreations: [
        { clientId: "confidential-client-id", clientSecret: "confidential-client-secret" }
      ],
      authenticateRequests: [
        {
          resource: "https://mcp.slack.com",
          scopes: ["search:read.public"],
          token: "public-token"
        },
        {
          resource: "https://mcp.slack.com",
          scopes: ["search:read.public"],
          token: "confidential-token"
        }
      ],
      removedProviders: [dynamicProviderId, dynamicProviderId]
    });
  });
});
suite("authenticateProtectedResources", () => {
  const protectedResource = {
    resource: "https://api.example.com",
    authorization_servers: ["https://auth.example.com"],
    scopes_supported: ["read"]
  };
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("skips authenticate when the cached token is unchanged", async () => {
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        if (scopes) {
          return Promise.resolve([{ scopes: ["read"], accessToken: "cached-token" }]);
        }
        return Promise.resolve([]);
      }
    });
    const cache = new AgentHostAuthTokenCache();
    const requests = [];
    const agents = [{ protectedResources: [protectedResource] }];
    const instantiationService = createAuthInstantiationService(disposables, authService);
    await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
      authTokenCache: cache,
      logPrefix: "[AgentHost]",
      authenticate: async (request) => {
        requests.push(request);
      }
    });
    await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
      authTokenCache: cache,
      logPrefix: "[AgentHost]",
      authenticate: async (request) => {
        requests.push(request);
      }
    });
    assert.deepStrictEqual(requests, [{ resource: protectedResource.resource, scopes: ["read"], token: "cached-token" }]);
  });
});
suite("resolveAuthenticationInteractively", () => {
  const protectedResource = {
    resource: "https://api.example.com",
    authorization_servers: ["https://auth.example.com"],
    scopes_supported: ["read"]
  };
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("uses an existing token before prompting and dedupes repeated checks", async () => {
    let createSessionCalls = 0;
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        if (scopes) {
          return Promise.resolve([{ scopes: ["read"], accessToken: "existing-token" }]);
        }
        return Promise.resolve([]);
      },
      createSession: async () => {
        createSessionCalls++;
        return { accessToken: "new-token" };
      }
    });
    const requests = [];
    const cache = new AgentHostAuthTokenCache();
    const instantiationService = createAuthInstantiationService(disposables, authService);
    const options = {
      authTokenCache: cache,
      logPrefix: "[AgentHost]",
      authenticate: async (request) => {
        requests.push(request);
      }
    };
    const results = [
      await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], options),
      await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], options)
    ];
    assert.deepStrictEqual({ results, requests, createSessionCalls }, {
      results: [true, true],
      requests: [{ resource: protectedResource.resource, scopes: ["read"], token: "existing-token" }],
      createSessionCalls: 0
    });
  });
  test("uses the product sign-in flow and forwards its token", async () => {
    let signedIn = false;
    const commandService = new TestCommandService();
    commandService.onExecute = () => signedIn = true;
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: () => Promise.resolve(signedIn ? [{ scopes: ["read"], accessToken: "signed-in-token" }] : [])
    });
    const requests = [];
    const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
    const success = await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], {
      authTokenCache: new AgentHostAuthTokenCache(),
      logPrefix: "[AgentHost]",
      authenticate: async (request) => {
        requests.push(request);
      }
    });
    assert.deepStrictEqual({ success, commandCalls: commandService.calls, requests }, {
      success: true,
      commandCalls: [{
        commandId: CHAT_SETUP_ACTION_ID,
        args: [void 0, {
          forceSignInDialog: true,
          additionalScopes: ["read"],
          dialogTitle: "Sign in to use GitHub Copilot",
          disableChatViewReveal: true,
          returnResult: true
        }]
      }],
      requests: [{ resource: protectedResource.resource, scopes: ["read"], token: "signed-in-token" }]
    });
  });
  test("does not fall back to direct provider login when product sign-in is canceled", async () => {
    const commandService = new TestCommandService();
    commandService.result = { success: void 0, dialogSkipped: false };
    let createSessionCalls = 0;
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: () => Promise.resolve([]),
      createSession: async () => {
        createSessionCalls++;
        return { accessToken: "unexpected-token" };
      }
    });
    const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
    const success = await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], {
      logPrefix: "[AgentHost]",
      authenticate: async () => {
      }
    });
    assert.deepStrictEqual({ success, createSessionCalls }, { success: false, createSessionCalls: 0 });
  });
  test("propagates product sign-in failures", async () => {
    const commandService = new TestCommandService();
    commandService.result = { success: false, dialogSkipped: false, error: new Error("Bad credentials") };
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: () => Promise.resolve([])
    });
    const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
    await assert.rejects(instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], {
      logPrefix: "[AgentHost]",
      authenticate: async () => {
      }
    }), /Bad credentials/);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0QXV0aC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHR5cGUgUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IHR5cGUgQWdlbnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25TZXJ2aWNlLCB0eXBlIElBdXRoZW50aWNhdGlvblByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBDSEFUX1NFVFVQX0FDVElPTl9JRCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBhdXRoZW50aWNhdGVQcm90ZWN0ZWRSZXNvdXJjZXMsIHJlc29sdmVBdXRoZW50aWNhdGlvbkludGVyYWN0aXZlbHksIHJlc29sdmVUb2tlbkZvclJlc291cmNlLCBBZ2VudEhvc3RBdXRoVG9rZW5DYWNoZSwgYWdlbnRIb3N0TWNwU2VydmVySWQsIHJlc29sdmVNY3BTZXJ2ZXJBdXRoZW50aWNhdGlvbiwgdHlwZSBJQWdlbnRIb3N0QXV0aGVudGljYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RBdXRoLmpzJztcblxuY2xhc3MgVGVzdENvbW1hbmRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJQ29tbWFuZFNlcnZpY2U+KCkge1xuXHRyZWFkb25seSBjYWxsczogeyBjb21tYW5kSWQ6IHN0cmluZzsgYXJnczogdW5rbm93bltdIH1bXSA9IFtdO1xuXHRyZXN1bHQ6IHVua25vd24gPSB7IHN1Y2Nlc3M6IHRydWUsIGRpYWxvZ1NraXBwZWQ6IGZhbHNlIH07XG5cdG9uRXhlY3V0ZTogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIGFzeW5jIGV4ZWN1dGVDb21tYW5kPFIgPSB1bmtub3duPihjb21tYW5kSWQ6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTxSIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKHsgY29tbWFuZElkLCBhcmdzIH0pO1xuXHRcdHRoaXMub25FeGVjdXRlPy4oKTtcblx0XHRyZXR1cm4gdGhpcy5yZXN1bHQgYXMgUjtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVBdXRoSW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXM6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4sIGF1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgY29tbWFuZFNlcnZpY2UgPSBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCkpOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2Uge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvblNlcnZpY2UsIGF1dGhlbnRpY2F0aW9uU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCBjb21tYW5kU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrQXV0aFNlcnZpY2Uob3ZlcnJpZGVzOiB7XG5cdGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyPzogKHNlcnZlclVyaTogVVJJLCByZXNvdXJjZVVyaTogVVJJKSA9PiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdGdldFNlc3Npb25zPzogKHByb3ZpZGVySWQ6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgb3B0aW9uczogYW55LCBhY3RpdmF0ZTogYm9vbGVhbikgPT4gUHJvbWlzZTxyZWFkb25seSB7IHNjb3Blczogc3RyaW5nW107IGFjY2Vzc1Rva2VuOiBzdHJpbmcgfVtdPjtcblx0Y3JlYXRlU2Vzc2lvbj86IChwcm92aWRlcklkOiBzdHJpbmcsIHNjb3Blczogc3RyaW5nW10sIG9wdGlvbnM6IGFueSkgPT4gUHJvbWlzZTx7IGFjY2Vzc1Rva2VuOiBzdHJpbmcgfT47XG5cdGNyZWF0ZUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyPzogKC4uLmFyZ3M6IFBhcmFtZXRlcnM8SUF1dGhlbnRpY2F0aW9uU2VydmljZVsnY3JlYXRlRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXInXT4pID0+IFByb21pc2U8eyByZWFkb25seSBpZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+O1xuXHRnZXRQcm92aWRlcj86IElBdXRoZW50aWNhdGlvblNlcnZpY2VbJ2dldFByb3ZpZGVyJ107XG5cdGlzRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXI/OiAocHJvdmlkZXJJZDogc3RyaW5nKSA9PiBib29sZWFuO1xuXHR1bnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcj86IChwcm92aWRlcklkOiBzdHJpbmcpID0+IHZvaWQ7XG59KTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSB7XG5cdHJldHVybiB7XG5cdFx0Z2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXI6IG92ZXJyaWRlcy5nZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlciA/PyAoKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCkpLFxuXHRcdGdldFNlc3Npb25zOiBvdmVycmlkZXMuZ2V0U2Vzc2lvbnMgPz8gKCgpID0+IFByb21pc2UucmVzb2x2ZShbXSkpLFxuXHRcdGNyZWF0ZVNlc3Npb246IG92ZXJyaWRlcy5jcmVhdGVTZXNzaW9uID8/ICgoKSA9PiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgY3JlYXRlU2Vzc2lvbiBjYWxsJykpKSxcblx0XHRjcmVhdGVEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcjogb3ZlcnJpZGVzLmNyZWF0ZUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyID8/ICgoKSA9PiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKSksXG5cdFx0Z2V0UHJvdmlkZXI6IG92ZXJyaWRlcy5nZXRQcm92aWRlciA/PyAoKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgZ2V0UHJvdmlkZXIgY2FsbCcpOyB9KSxcblx0XHRpc0R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyOiBvdmVycmlkZXMuaXNEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlciA/PyAoKCkgPT4gZmFsc2UpLFxuXHRcdHVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyOiBvdmVycmlkZXMudW5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgPz8gKCgpID0+IHsgfSksXG5cdH0gYXMgdW5rbm93biBhcyBJQXV0aGVudGljYXRpb25TZXJ2aWNlO1xufVxuXG5zdWl0ZSgnYWdlbnRIb3N0TWNwU2VydmVySWQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaXMgc3RhYmxlIGZvciB0aGUgc2FtZSBhdXRob3JpdHksIHNlcnZlciBuYW1lIGFuZCByZXNvdXJjZSB1cmwnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIGtleSBtdXN0IG5vdCBkZXBlbmQgb24gdGhlIChwZXItc2Vzc2lvbiAvIHBlci1zeW5jKSBjdXN0b21pemF0aW9uIGlkLCBzbyByZW1lbWJlcmVkXG5cdFx0Ly8gYXV0aCBzdXJ2aXZlcyByZWxvYWRzLiBTYW1lIGlucHV0cyBtdXN0IGFsd2F5cyBwcm9kdWNlIHRoZSBzYW1lIGtleS5cblx0XHRjb25zdCBhID0gYWdlbnRIb3N0TWNwU2VydmVySWQoJ3JlbW90ZS1ob3N0JywgJ0dpdEh1YicsICdodHRwczovL2FwaS5naXRodWJjb3BpbG90LmNvbS9tY3AvJyk7XG5cdFx0Y29uc3QgYiA9IGFnZW50SG9zdE1jcFNlcnZlcklkKCdyZW1vdGUtaG9zdCcsICdHaXRIdWInLCAnaHR0cHM6Ly9hcGkuZ2l0aHViY29waWxvdC5jb20vbWNwLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLCBiKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYSwgJ2FnZW50LWhvc3QtbWNwOnJlbW90ZS1ob3N0L0dpdEh1Yi9odHRwcyUzQSUyRiUyRmFwaS5naXRodWJjb3BpbG90LmNvbSUyRm1jcCUyRicpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmZXJzIHdoZW4gYXV0aG9yaXR5LCBuYW1lIG9yIHVybCBkaWZmZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZSA9IGFnZW50SG9zdE1jcFNlcnZlcklkKCdob3N0LTEnLCAnR2l0SHViJywgJ2h0dHBzOi8vYS5leGFtcGxlL21jcCcpO1xuXHRcdGNvbnN0IGtleXMgPSBuZXcgU2V0KFtcblx0XHRcdGJhc2UsXG5cdFx0XHRhZ2VudEhvc3RNY3BTZXJ2ZXJJZCgnaG9zdC0yJywgJ0dpdEh1YicsICdodHRwczovL2EuZXhhbXBsZS9tY3AnKSxcblx0XHRcdGFnZW50SG9zdE1jcFNlcnZlcklkKCdob3N0LTEnLCAnT3RoZXInLCAnaHR0cHM6Ly9hLmV4YW1wbGUvbWNwJyksXG5cdFx0XHRhZ2VudEhvc3RNY3BTZXJ2ZXJJZCgnaG9zdC0xJywgJ0dpdEh1YicsICdodHRwczovL2IuZXhhbXBsZS9tY3AnKSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoa2V5cy5zaXplLCA0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3Jlc29sdmVUb2tlbkZvclJlc291cmNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIGF1dGhvcml6YXRpb24gc2VydmVycyBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7fSk7XG5cdFx0Y29uc3QgdG9rZW4gPSBhd2FpdCByZXNvbHZlVG9rZW5Gb3JSZXNvdXJjZShyZXNvdXJjZSwgW10sIFsncmVhZCddLCBhdXRoU2VydmljZSwgbG9nLCAndGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2tlbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyBwcm92aWRlciBtYXRjaGVzIHRoZSBzZXJ2ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0aFNlcnZpY2UgPSBjcmVhdGVNb2NrQXV0aFNlcnZpY2Uoe1xuXHRcdFx0Z2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXI6ICgpID0+IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRva2VuID0gYXdhaXQgcmVzb2x2ZVRva2VuRm9yUmVzb3VyY2UocmVzb3VyY2UsIFsnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJ10sIFsncmVhZCddLCBhdXRoU2VydmljZSwgbG9nLCAndGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2tlbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB0b2tlbiBmcm9tIGV4YWN0IHNjb3BlIG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dGhTZXJ2aWNlID0gY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoJ3Byb3ZpZGVyLTEnKSxcblx0XHRcdGdldFNlc3Npb25zOiAoX3Byb3ZpZGVySWQsIHNjb3BlcykgPT4ge1xuXHRcdFx0XHRpZiAoc2NvcGVzICYmIHNjb3Blcy5sZW5ndGggPT09IDEgJiYgc2NvcGVzWzBdID09PSAncmVhZCcpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFt7IHNjb3BlczogWydyZWFkJ10sIGFjY2Vzc1Rva2VuOiAnZXhhY3QtdG9rZW4nIH1dKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9rZW4gPSBhd2FpdCByZXNvbHZlVG9rZW5Gb3JSZXNvdXJjZShyZXNvdXJjZSwgWydodHRwczovL2F1dGguZXhhbXBsZS5jb20nXSwgWydyZWFkJ10sIGF1dGhTZXJ2aWNlLCBsb2csICd0ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRva2VuLCAnZXhhY3QtdG9rZW4nKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBuYXJyb3dlc3Qgc3VwZXJzZXQgc2Vzc2lvbiB3aGVuIGV4YWN0IG1hdGNoIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dGhTZXJ2aWNlID0gY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoJ3Byb3ZpZGVyLTEnKSxcblx0XHRcdGdldFNlc3Npb25zOiAoX3Byb3ZpZGVySWQsIHNjb3BlcykgPT4ge1xuXHRcdFx0XHRpZiAoc2NvcGVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHQvLyBFeGFjdCBtYXRjaCByZXR1cm5zIGVtcHR5XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQWxsIHNlc3Npb25zIFx1MjAxNCByZXR1cm4gdHdvIHN1cGVyc2V0IG9wdGlvbnNcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXG5cdFx0XHRcdFx0eyBzY29wZXM6IFsncmVhZCcsICd3cml0ZScsICdhZG1pbiddLCBhY2Nlc3NUb2tlbjogJ3dpZGUtdG9rZW4nIH0sXG5cdFx0XHRcdFx0eyBzY29wZXM6IFsncmVhZCcsICd3cml0ZSddLCBhY2Nlc3NUb2tlbjogJ25hcnJvdy10b2tlbicgfSxcblx0XHRcdFx0XSk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRva2VuID0gYXdhaXQgcmVzb2x2ZVRva2VuRm9yUmVzb3VyY2UocmVzb3VyY2UsIFsnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJ10sIFsncmVhZCddLCBhdXRoU2VydmljZSwgbG9nLCAndGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2tlbiwgJ25hcnJvdy10b2tlbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIHNlc3Npb24gaGFzIG1hdGNoaW5nIHNjb3BlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7XG5cdFx0XHRnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCdwcm92aWRlci0xJyksXG5cdFx0XHRnZXRTZXNzaW9uczogKF9wcm92aWRlcklkLCBzY29wZXMpID0+IHtcblx0XHRcdFx0aWYgKHNjb3BlcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gTm8gc2Vzc2lvbiBjb250YWlucyB0aGUgJ3JlYWQnIHNjb3BlXG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW1xuXHRcdFx0XHRcdHsgc2NvcGVzOiBbJ3dyaXRlJ10sIGFjY2Vzc1Rva2VuOiAnd3JvbmctdG9rZW4nIH0sXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCB0b2tlbiA9IGF3YWl0IHJlc29sdmVUb2tlbkZvclJlc291cmNlKHJlc291cmNlLCBbJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSddLCBbJ3JlYWQnXSwgYXV0aFNlcnZpY2UsIGxvZywgJ3Rlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9rZW4sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyaWVzIG11bHRpcGxlIGF1dGhvcml6YXRpb24gc2VydmVycyBpbiBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7XG5cdFx0XHRnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcjogKHNlcnZlclVyaSkgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKHNlcnZlclVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKHNlcnZlclVyaS50b1N0cmluZygpID09PSAnaHR0cHM6Ly9hdXRoMi5leGFtcGxlLmNvbS8nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgncHJvdmlkZXItMicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRTZXNzaW9uczogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKFt7IHNjb3BlczogWydyZWFkJ10sIGFjY2Vzc1Rva2VuOiAnc2VydmVyMi10b2tlbicgfV0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRva2VuID0gYXdhaXQgcmVzb2x2ZVRva2VuRm9yUmVzb3VyY2UoXG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdFsnaHR0cHM6Ly9hdXRoMS5leGFtcGxlLmNvbScsICdodHRwczovL2F1dGgyLmV4YW1wbGUuY29tJ10sXG5cdFx0XHRbJ3JlYWQnXSwgYXV0aFNlcnZpY2UsIGxvZywgJ3Rlc3QnLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRva2VuLCAnc2VydmVyMi10b2tlbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscy5sZW5ndGgsIDIpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZm9yd2FyZHMgdGhlIGZpcnN0IHRva2VuIGFuZCBza2lwcyBpdCBhZnRlciBjb21wbGV0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlKCk7XG5cdFx0bGV0IGF1dGhlbnRpY2F0ZUNhbGxzID0gMDtcblx0XHRjb25zdCBhdXRoZW50aWNhdGUgPSBhc3luYyAoKSA9PiB7IGF1dGhlbnRpY2F0ZUNhbGxzKys7IH07XG5cblx0XHRjb25zdCByZXN1bHRzID0gW1xuXHRcdFx0YXdhaXQgY2FjaGUuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5leGFtcGxlLmNvbScsIFsncmVhZCddLCAndG9rMScsIGF1dGhlbnRpY2F0ZSksXG5cdFx0XHRhd2FpdCBjYWNoZS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJywgWydyZWFkJ10sICd0b2sxJywgYXV0aGVudGljYXRlKSxcblx0XHRdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlc3VsdHMsIGF1dGhlbnRpY2F0ZUNhbGxzIH0sIHsgcmVzdWx0czogW3RydWUsIGZhbHNlXSwgYXV0aGVudGljYXRlQ2FsbHM6IDEgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NhbWUtdG9rZW4gY2FsbGVycyBhd2FpdCB0aGUgaW4tZmxpZ2h0IGF1dGhlbnRpY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlKCk7XG5cdFx0Y29uc3QgYXV0aGVudGljYXRpb24gPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0bGV0IGF1dGhlbnRpY2F0ZUNhbGxzID0gMDtcblx0XHRjb25zdCBhdXRoZW50aWNhdGUgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRhdXRoZW50aWNhdGVDYWxscysrO1xuXHRcdFx0YXdhaXQgYXV0aGVudGljYXRpb24ucDtcblx0XHR9O1xuXHRcdGxldCBzZWNvbmRTZXR0bGVkID0gZmFsc2U7XG5cblx0XHRjb25zdCBmaXJzdCA9IGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazEnLCBhdXRoZW50aWNhdGUpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazEnLCBhdXRoZW50aWNhdGUpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdHNlY29uZFNldHRsZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRjb25zdCBiZWZvcmVDb21wbGV0aW9uID0geyBhdXRoZW50aWNhdGVDYWxscywgc2Vjb25kU2V0dGxlZCB9O1xuXHRcdGF1dGhlbnRpY2F0aW9uLmNvbXBsZXRlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJlZm9yZUNvbXBsZXRpb24sXG5cdFx0XHRyZXN1bHRzOiBhd2FpdCBQcm9taXNlLmFsbChbZmlyc3QsIHNlY29uZF0pLFxuXHRcdFx0YXV0aGVudGljYXRlQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0YmVmb3JlQ29tcGxldGlvbjogeyBhdXRoZW50aWNhdGVDYWxsczogMSwgc2Vjb25kU2V0dGxlZDogZmFsc2UgfSxcblx0XHRcdHJlc3VsdHM6IFt0cnVlLCBmYWxzZV0sXG5cdFx0XHRhdXRoZW50aWNhdGVDYWxsczogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZmVyZW50IHRva2VucyBhcmUgc2VyaWFsaXplZCBmb3IgdGhlIHNhbWUgcmVzb3VyY2UgYW5kIHNjb3BlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYWNoZSA9IG5ldyBBZ2VudEhvc3RBdXRoVG9rZW5DYWNoZSgpO1xuXHRcdGNvbnN0IGZpcnN0QXV0aGVudGljYXRpb24gPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBmaXJzdCA9IGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjYWxscy5wdXNoKCd0b2sxJyk7XG5cdFx0XHRhd2FpdCBmaXJzdEF1dGhlbnRpY2F0aW9uLnA7XG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gY2FjaGUuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5leGFtcGxlLmNvbScsIFsncmVhZCddLCAndG9rMicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNhbGxzLnB1c2goJ3RvazInKTtcblx0XHR9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRjb25zdCBiZWZvcmVDb21wbGV0aW9uID0gWy4uLmNhbGxzXTtcblx0XHRmaXJzdEF1dGhlbnRpY2F0aW9uLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2ZpcnN0LCBzZWNvbmRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBiZWZvcmVDb21wbGV0aW9uLCBjYWxscyB9LCB7IGJlZm9yZUNvbXBsZXRpb246IFsndG9rMSddLCBjYWxsczogWyd0b2sxJywgJ3RvazInXSB9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBjb21wbGV0ZWQgdG9rZW4gd2FpdHMgZm9yIGEgbmV3ZXIgaW4tZmxpZ2h0IGF1dGhlbnRpY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlKCk7XG5cdFx0Y29uc3QgbmV3ZXJBdXRoZW50aWNhdGlvbiA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRhd2FpdCBjYWNoZS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJywgWydyZWFkJ10sICd0b2sxJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2FsbHMucHVzaCgndG9rMScpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IG5ld2VyID0gY2FjaGUuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5leGFtcGxlLmNvbScsIFsncmVhZCddLCAndG9rMicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNhbGxzLnB1c2goJ3RvazInKTtcblx0XHRcdGF3YWl0IG5ld2VyQXV0aGVudGljYXRpb24ucDtcblx0XHR9KTtcblx0XHRsZXQgb2xkZXJTZXR0bGVkID0gZmFsc2U7XG5cdFx0Y29uc3Qgb2xkZXIgPSBjYWNoZS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJywgWydyZWFkJ10sICd0b2sxJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2FsbHMucHVzaCgndG9rMScpO1xuXHRcdH0pLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdG9sZGVyU2V0dGxlZCA9IHRydWU7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGNvbnN0IGJlZm9yZUNvbXBsZXRpb24gPSB7IGNhbGxzOiBbLi4uY2FsbHNdLCBvbGRlclNldHRsZWQgfTtcblx0XHRuZXdlckF1dGhlbnRpY2F0aW9uLmNvbXBsZXRlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJlZm9yZUNvbXBsZXRpb24sXG5cdFx0XHRyZXN1bHRzOiBhd2FpdCBQcm9taXNlLmFsbChbbmV3ZXIsIG9sZGVyXSksXG5cdFx0XHRjYWxscyxcblx0XHR9LCB7XG5cdFx0XHRiZWZvcmVDb21wbGV0aW9uOiB7IGNhbGxzOiBbJ3RvazEnLCAndG9rMiddLCBvbGRlclNldHRsZWQ6IGZhbHNlIH0sXG5cdFx0XHRyZXN1bHRzOiBbdHJ1ZSwgdHJ1ZV0sXG5cdFx0XHRjYWxsczogWyd0b2sxJywgJ3RvazInLCAndG9rMSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhciBjYW5jZWxzIHF1ZXVlZCBhdXRoZW50aWNhdGlvbiBmcm9tIHRoZSBwcmV2aW91cyBnZW5lcmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlKCk7XG5cdFx0Y29uc3QgZmlyc3RBdXRoZW50aWNhdGlvbiA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBmaXJzdCA9IGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjYWxscy5wdXNoKCd0b2sxJyk7XG5cdFx0XHRhd2FpdCBmaXJzdEF1dGhlbnRpY2F0aW9uLnA7XG5cdFx0fSk7XG5cdFx0Y29uc3QgcXVldWVkID0gY2FjaGUuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5leGFtcGxlLmNvbScsIFsncmVhZCddLCAndG9rMicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNhbGxzLnB1c2goJ3RvazInKTtcblx0XHR9KTtcblx0XHRjYWNoZS5jbGVhcigpO1xuXHRcdGF3YWl0IGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjYWxscy5wdXNoKCd0b2szJyk7XG5cdFx0fSk7XG5cdFx0Zmlyc3RBdXRoZW50aWNhdGlvbi5jb21wbGV0ZSgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoZmlyc3QpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHF1ZXVlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWyd0b2sxJywgJ3RvazMnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3BlZCBjbGVhciBkb2VzIG5vdCBjYW5jZWwgdW5yZWxhdGVkIGluLWZsaWdodCBhdXRoZW50aWNhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYWNoZSA9IG5ldyBBZ2VudEhvc3RBdXRoVG9rZW5DYWNoZSgpO1xuXHRcdGNvbnN0IHVucmVsYXRlZEF1dGhlbnRpY2F0aW9uID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGxldCB1bnJlbGF0ZWRDYWxscyA9IDA7XG5cdFx0Y29uc3QgdW5yZWxhdGVkID0gY2FjaGUuYXV0aGVudGljYXRlKCdodHRwczovL290aGVyLmV4YW1wbGUuY29tJywgWydyZWFkJ10sICdvdGhlci10b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRcdHVucmVsYXRlZENhbGxzKys7XG5cdFx0XHRhd2FpdCB1bnJlbGF0ZWRBdXRoZW50aWNhdGlvbi5wO1xuXHRcdH0pO1xuXHRcdGNhY2hlLmNsZWFyKCdodHRwczovL2FwaS5leGFtcGxlLmNvbScsIFsncmVhZCddKTtcblx0XHR1bnJlbGF0ZWRBdXRoZW50aWNhdGlvbi5jb21wbGV0ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQ6IGF3YWl0IHVucmVsYXRlZCxcblx0XHRcdHVucmVsYXRlZENhbGxzLFxuXHRcdFx0cmVwZWF0ZWQ6IGF3YWl0IGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9vdGhlci5leGFtcGxlLmNvbScsIFsncmVhZCddLCAnb3RoZXItdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHVucmVsYXRlZENhbGxzKys7XG5cdFx0XHR9KSxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IHRydWUsXG5cdFx0XHR1bnJlbGF0ZWRDYWxsczogMSxcblx0XHRcdHJlcGVhdGVkOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndG9rZW5zIGZvciBkaXN0aW5jdCBzY29wZXMgYW5kIHJlc291cmNlcyBhcmUgdHJhY2tlZCBpbmRlcGVuZGVudGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlKCk7XG5cdFx0bGV0IGF1dGhlbnRpY2F0ZUNhbGxzID0gMDtcblx0XHRjb25zdCBhdXRoZW50aWNhdGUgPSBhc3luYyAoKSA9PiB7IGF1dGhlbnRpY2F0ZUNhbGxzKys7IH07XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRjYWNoZS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJywgWydyZWFkJ10sICdyZWFkLXRva2VuJywgYXV0aGVudGljYXRlKSxcblx0XHRcdGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3dyaXRlJ10sICd3cml0ZS10b2tlbicsIGF1dGhlbnRpY2F0ZSksXG5cdFx0XHRjYWNoZS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vb3RoZXIuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3JlYWQtdG9rZW4nLCBhdXRoZW50aWNhdGUpLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF1dGhlbnRpY2F0ZUNhbGxzLCAzKTtcblx0fSk7XG5cblx0dGVzdCgnZmFpbGVkIGF1dGhlbnRpY2F0aW9uIGlzIG5vdCBjYWNoZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2FjaGUgPSBuZXcgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUoKTtcblx0XHRsZXQgYXV0aGVudGljYXRlQ2FsbHMgPSAwO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhdXRoZW50aWNhdGVDYWxscysrO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdmYWlsZWQnKTtcblx0XHR9KSwgL2ZhaWxlZC8pO1xuXHRcdGF3YWl0IGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhdXRoZW50aWNhdGVDYWxscysrO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF1dGhlbnRpY2F0ZUNhbGxzLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXIgZm9yZ2V0cyBldmVyeSBjb21wbGV0ZWQgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2FjaGUgPSBuZXcgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUoKTtcblx0XHRsZXQgYXV0aGVudGljYXRlQ2FsbHMgPSAwO1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0ZSA9IGFzeW5jICgpID0+IHsgYXV0aGVudGljYXRlQ2FsbHMrKzsgfTtcblx0XHRhd2FpdCBjYWNoZS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJywgWydyZWFkJ10sICd0b2sxJywgYXV0aGVudGljYXRlKTtcblx0XHRhd2FpdCBjYWNoZS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vb3RoZXIuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazInLCBhdXRoZW50aWNhdGUpO1xuXHRcdGNhY2hlLmNsZWFyKCk7XG5cdFx0YXdhaXQgY2FjaGUuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5leGFtcGxlLmNvbScsIFsncmVhZCddLCAndG9rMScsIGF1dGhlbnRpY2F0ZSk7XG5cdFx0YXdhaXQgY2FjaGUuYXV0aGVudGljYXRlKCdodHRwczovL290aGVyLmV4YW1wbGUuY29tJywgWydyZWFkJ10sICd0b2syJywgYXV0aGVudGljYXRlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdXRoZW50aWNhdGVDYWxscywgNCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdyZXNvbHZlTWNwU2VydmVyQXV0aGVudGljYXRpb24nLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd1c2VzIGNoYWxsZW5nZSBzY29wZXMgd2l0aG91dCByZXBsYWNpbmcgdGhlIHByb3RlY3RlZCByZXNvdXJjZSBzY29wZSBjYXRhbG9nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcXVlc3RlZFNjb3BlczogKHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0Y29uc3QgYXV0aFNlcnZpY2UgPSBjcmVhdGVNb2NrQXV0aFNlcnZpY2Uoe1xuXHRcdFx0Z2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXI6ICgpID0+IFByb21pc2UucmVzb2x2ZSgncHJvdmlkZXItMScpLFxuXHRcdFx0Z2V0U2Vzc2lvbnM6IChfcHJvdmlkZXJJZCwgc2NvcGVzKSA9PiB7XG5cdFx0XHRcdHJlcXVlc3RlZFNjb3Blcy5wdXNoKHNjb3Blcyk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgYXV0aFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSwge1xuXHRcdFx0Z2V0QWNjb3VudFByZWZlcmVuY2U6ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXNvbHZlTWNwU2VydmVyQXV0aGVudGljYXRpb24sIHtcblx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20nLFxuXHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSddLFxuXHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZXBvJywgJ3JlYWQ6b3JnJywgJ25vdGlmaWNhdGlvbnMnXSxcblx0XHR9LCB7XG5cdFx0XHRhbGxvd0ludGVyYWN0aW9uOiBmYWxzZSxcblx0XHRcdGxvZ1ByZWZpeDogJ1tBZ2VudEhvc3RdJyxcblx0XHRcdG1jcFNlcnZlcklkOiAnc2VydmVyLWlkJyxcblx0XHRcdG1jcFNlcnZlck5hbWU6ICdFeGFtcGxlJyxcblx0XHRcdG1jcFNlcnZlclVybDogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tJyxcblx0XHRcdHNjb3BlczogWydub3RpZmljYXRpb25zJ10sXG5cdFx0XHRhdXRoZW50aWNhdGU6IGFzeW5jICgpID0+IHsgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXN1bHQsIHJlcXVlc3RlZFNjb3BlcyB9LCB7XG5cdFx0XHRyZXN1bHQ6IGZhbHNlLFxuXHRcdFx0cmVxdWVzdGVkU2NvcGVzOiBbWydub3RpZmljYXRpb25zJ11dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHN1cHBvcnRlZCBzY29wZXMgd2hlbiB0aGUgY2hhbGxlbmdlIGRvZXMgbm90IHNwZWNpZnkgc2NvcGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcXVlc3RlZFNjb3BlczogKHJlYWRvbmx5IHN0cmluZ1tdKVtdID0gW107XG5cdFx0Y29uc3QgYXV0aFNlcnZpY2UgPSBjcmVhdGVNb2NrQXV0aFNlcnZpY2Uoe1xuXHRcdFx0Z2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXI6ICgpID0+IFByb21pc2UucmVzb2x2ZSgncHJvdmlkZXItMScpLFxuXHRcdFx0Z2V0U2Vzc2lvbnM6IChfcHJvdmlkZXJJZCwgc2NvcGVzKSA9PiB7XG5cdFx0XHRcdHJlcXVlc3RlZFNjb3Blcy5wdXNoKHNjb3BlcyA/PyBbXSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgYXV0aFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSwge1xuXHRcdFx0Z2V0QWNjb3VudFByZWZlcmVuY2U6ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXNvbHZlTWNwU2VydmVyQXV0aGVudGljYXRpb24sIHtcblx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3Auc2xhY2suY29tJyxcblx0XHRcdHJlc291cmNlX25hbWU6ICdTbGFjayBBUEknLFxuXHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbSddLFxuXHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydzZWFyY2g6cmVhZC5wdWJsaWMnLCAnY2hhdDp3cml0ZSddLFxuXHRcdH0sIHtcblx0XHRcdGFsbG93SW50ZXJhY3Rpb246IGZhbHNlLFxuXHRcdFx0bG9nUHJlZml4OiAnW0FnZW50SG9zdF0nLFxuXHRcdFx0bWNwU2VydmVySWQ6ICdzbGFjaycsXG5cdFx0XHRtY3BTZXJ2ZXJOYW1lOiAnU2xhY2snLFxuXHRcdFx0bWNwU2VydmVyVXJsOiAnaHR0cHM6Ly9tY3Auc2xhY2suY29tJyxcblx0XHRcdHNjb3BlczogW10sXG5cdFx0XHRhdXRoZW50aWNhdGU6IGFzeW5jICgpID0+IHsgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXN1bHQsIHJlcXVlc3RlZFNjb3BlcyB9LCB7XG5cdFx0XHRyZXN1bHQ6IGZhbHNlLFxuXHRcdFx0cmVxdWVzdGVkU2NvcGVzOiBbWydzZWFyY2g6cmVhZC5wdWJsaWMnLCAnY2hhdDp3cml0ZSddXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZWFnZXJseSByZXF1ZXN0IEdpdEh1YiBNQ1Agc3VwcG9ydGVkIHNjb3BlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0ZWRTY29wZXM6IChyZWFkb25seSBzdHJpbmdbXSlbXSA9IFtdO1xuXHRcdGNvbnN0IGF1dGhTZXJ2aWNlID0gY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoJ3Byb3ZpZGVyLTEnKSxcblx0XHRcdGdldFNlc3Npb25zOiAoX3Byb3ZpZGVySWQsIHNjb3BlcykgPT4ge1xuXHRcdFx0XHRyZXF1ZXN0ZWRTY29wZXMucHVzaChzY29wZXMgPz8gW10pO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvblNlcnZpY2UsIGF1dGhTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UsIHtcblx0XHRcdGdldEFjY291bnRQcmVmZXJlbmNlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLCB7fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmVzb2x2ZU1jcFNlcnZlckF1dGhlbnRpY2F0aW9uLCB7XG5cdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1YmNvcGlsb3QuY29tL21jcCcsXG5cdFx0XHRyZXNvdXJjZV9uYW1lOiAnR2l0SHViIE1DUCBTZXJ2ZXInLFxuXHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9sb2dpbi9vYXV0aCddLFxuXHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZXBvJywgJ25vdGlmaWNhdGlvbnMnXSxcblx0XHR9LCB7XG5cdFx0XHRhbGxvd0ludGVyYWN0aW9uOiBmYWxzZSxcblx0XHRcdGxvZ1ByZWZpeDogJ1tBZ2VudEhvc3RdJyxcblx0XHRcdG1jcFNlcnZlcklkOiAnZ2l0aHViJyxcblx0XHRcdG1jcFNlcnZlck5hbWU6ICdHaXRIdWInLFxuXHRcdFx0bWNwU2VydmVyVXJsOiAnaHR0cHM6Ly9hcGkuZ2l0aHViY29waWxvdC5jb20vbWNwJyxcblx0XHRcdHNjb3BlczogW10sXG5cdFx0XHRhdXRoZW50aWNhdGU6IGFzeW5jICgpID0+IHsgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXN1bHQsIHJlcXVlc3RlZFNjb3BlcyB9LCB7XG5cdFx0XHRyZXN1bHQ6IGZhbHNlLFxuXHRcdFx0cmVxdWVzdGVkU2NvcGVzOiBbW11dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBjcmVhdGUgYSBkeW5hbWljIHByb3ZpZGVyIHNpbGVudGx5IHdpdGhvdXQgYSBwZXJzaXN0ZWQgcmVnaXN0cmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdhcm5pbmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHByb3ZpZGVyQ3JlYXRpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IG1ldGFkYXRhUmVxdWVzdHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIE51bGxMb2dTZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIHdhcm4obWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRcdHdhcm5pbmdzLnB1c2gobWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25TZXJ2aWNlLCBjcmVhdGVNb2NrQXV0aFNlcnZpY2Uoe1xuXHRcdFx0Y3JlYXRlRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXI6IGFzeW5jIGF1dGhvcml6YXRpb25TZXJ2ZXIgPT4ge1xuXHRcdFx0XHRwcm92aWRlckNyZWF0aW9ucy5wdXNoKGF1dGhvcml6YXRpb25TZXJ2ZXIudG9TdHJpbmcodHJ1ZSkpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLCB7fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLCB7XG5cdFx0XHRnZXRBY2NvdW50UHJlZmVyZW5jZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLCB7fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZSwge1xuXHRcdFx0Z2V0Q2xpZW50UmVnaXN0cmF0aW9uOiAoKSA9PiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHJlc29sdmVNY3BTZXJ2ZXJBdXRoZW50aWNhdGlvbiwge1xuXHRcdFx0cmVzb3VyY2U6ICdodHRwczovL21jcC5leGFtcGxlLmNvbScsXG5cdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFsnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJ10sXG5cdFx0fSwge1xuXHRcdFx0YWxsb3dJbnRlcmFjdGlvbjogZmFsc2UsXG5cdFx0XHRsb2dQcmVmaXg6ICdbQWdlbnRIb3N0XScsXG5cdFx0XHRtY3BTZXJ2ZXJJZDogJ3NlcnZlci1pZCcsXG5cdFx0XHRtY3BTZXJ2ZXJOYW1lOiAnRXhhbXBsZScsXG5cdFx0XHRtY3BTZXJ2ZXJVcmw6ICdodHRwczovL21jcC5leGFtcGxlLmNvbScsXG5cdFx0XHRzY29wZXM6IFtdLFxuXHRcdFx0YXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhRmV0Y2hlcjogYXN5bmMgYXV0aG9yaXphdGlvblNlcnZlciA9PiB7XG5cdFx0XHRcdG1ldGFkYXRhUmVxdWVzdHMucHVzaChhdXRob3JpemF0aW9uU2VydmVyKTtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIG1ldGFkYXRhIHJlcXVlc3QnKTtcblx0XHRcdH0sXG5cdFx0XHRhdXRoZW50aWNhdGU6IGFzeW5jICgpID0+IHsgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXN1bHQsIHdhcm5pbmdzLCBtZXRhZGF0YVJlcXVlc3RzLCBwcm92aWRlckNyZWF0aW9ucyB9LCB7XG5cdFx0XHRyZXN1bHQ6IGZhbHNlLFxuXHRcdFx0d2FybmluZ3M6IFtdLFxuXHRcdFx0bWV0YWRhdGFSZXF1ZXN0czogW10sXG5cdFx0XHRwcm92aWRlckNyZWF0aW9uczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIGEgcGVyc2lzdGVkIGR5bmFtaWNhbGx5IHJlZ2lzdGVyZWQgcHJvdmlkZXIgd2l0aG91dCB1c2VyIGludGVyYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGR5bmFtaWNQcm92aWRlcklkID0gJ2h0dHBzOi8vbWNwLm5vdGlvbi5jb20vIGh0dHBzOi8vbWNwLm5vdGlvbi5jb20vbWNwJztcblx0XHRjb25zdCBwcm92aWRlckNyZWF0aW9uczogeyBjbGllbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkOyBjbGllbnRTZWNyZXQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0XHRjb25zdCBzZXNzaW9uUmVxdWVzdHM6IHsgc2lsZW50OiBib29sZWFuIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0ZVJlcXVlc3RzOiB7IHJlc291cmNlOiBzdHJpbmc7IHNjb3Blcz86IHJlYWRvbmx5IHN0cmluZ1tdOyB0b2tlbjogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGF1dGhTZXJ2aWNlID0gY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGNyZWF0ZUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyOiBhc3luYyAoX2F1dGhvcml6YXRpb25TZXJ2ZXIsIF9tZXRhZGF0YSwgX3Jlc291cmNlLCBjbGllbnRJZCwgY2xpZW50U2VjcmV0KSA9PiB7XG5cdFx0XHRcdHByb3ZpZGVyQ3JlYXRpb25zLnB1c2goeyBjbGllbnRJZCwgY2xpZW50U2VjcmV0IH0pO1xuXHRcdFx0XHRyZXR1cm4geyBpZDogZHluYW1pY1Byb3ZpZGVySWQgfTtcblx0XHRcdH0sXG5cdFx0XHRnZXRTZXNzaW9uczogKF9wcm92aWRlcklkLCBfc2NvcGVzLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdHNlc3Npb25SZXF1ZXN0cy5wdXNoKHsgc2lsZW50OiBvcHRpb25zLnNpbGVudCB9KTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbe1xuXHRcdFx0XHRcdGlkOiAnbm90aW9uLXNlc3Npb24nLFxuXHRcdFx0XHRcdHNjb3BlczogW10sXG5cdFx0XHRcdFx0YWNjZXNzVG9rZW46ICdub3Rpb24tdG9rZW4nLFxuXHRcdFx0XHRcdGFjY291bnQ6IHsgaWQ6ICdhY2NvdW50LWlkJywgbGFiZWw6ICdOb3Rpb24gQWNjb3VudCcgfSxcblx0XHRcdFx0fV0pO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgYXV0aFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSwge1xuXHRcdFx0aXNBY2Nlc3NBbGxvd2VkRm9yVXJsOiAoKSA9PiB0cnVlLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSwge1xuXHRcdFx0Z2V0QWNjb3VudFByZWZlcmVuY2U6ICgpID0+ICdOb3Rpb24gQWNjb3VudCcsXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UsIHtcblx0XHRcdGFkZEFjY291bnRVc2FnZTogKCkgPT4geyB9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UsIHtcblx0XHRcdGdldENsaWVudFJlZ2lzdHJhdGlvbjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHsgY2xpZW50SWQ6ICdub3Rpb24tY2xpZW50LWlkJywgY2xpZW50U2VjcmV0OiAnbm90aW9uLWNsaWVudC1zZWNyZXQnIH0pLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHJlc29sdmVNY3BTZXJ2ZXJBdXRoZW50aWNhdGlvbiwge1xuXHRcdFx0cmVzb3VyY2U6ICdodHRwczovL21jcC5ub3Rpb24uY29tL21jcCcsXG5cdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFsnaHR0cHM6Ly9tY3Aubm90aW9uLmNvbSddLFxuXHRcdH0sIHtcblx0XHRcdGFsbG93SW50ZXJhY3Rpb246IGZhbHNlLFxuXHRcdFx0bG9nUHJlZml4OiAnW0FnZW50SG9zdF0nLFxuXHRcdFx0bWNwU2VydmVySWQ6ICdub3Rpb24nLFxuXHRcdFx0bWNwU2VydmVyTmFtZTogJ25vdGlvbicsXG5cdFx0XHRtY3BTZXJ2ZXJVcmw6ICdodHRwczovL21jcC5ub3Rpb24uY29tL21jcCcsXG5cdFx0XHRzY29wZXM6IFtdLFxuXHRcdFx0YXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhRmV0Y2hlcjogYXN5bmMgYXV0aG9yaXphdGlvblNlcnZlciA9PiAoe1xuXHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdGlzc3VlcjogYXV0aG9yaXphdGlvblNlcnZlcixcblx0XHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNjb3ZlcnlVcmw6IGAke2F1dGhvcml6YXRpb25TZXJ2ZXJ9Ly53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyYCxcblx0XHRcdFx0ZXJyb3JzOiBbXSxcblx0XHRcdH0pLFxuXHRcdFx0YXV0aGVudGljYXRlOiBhc3luYyByZXF1ZXN0ID0+IHtcblx0XHRcdFx0YXV0aGVudGljYXRlUmVxdWVzdHMucHVzaChyZXF1ZXN0KTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzdWx0LCBwcm92aWRlckNyZWF0aW9ucywgc2Vzc2lvblJlcXVlc3RzLCBhdXRoZW50aWNhdGVSZXF1ZXN0cyB9LCB7XG5cdFx0XHRyZXN1bHQ6IHRydWUsXG5cdFx0XHRwcm92aWRlckNyZWF0aW9uczogW3sgY2xpZW50SWQ6ICdub3Rpb24tY2xpZW50LWlkJywgY2xpZW50U2VjcmV0OiAnbm90aW9uLWNsaWVudC1zZWNyZXQnIH1dLFxuXHRcdFx0c2Vzc2lvblJlcXVlc3RzOiBbeyBzaWxlbnQ6IHRydWUgfV0sXG5cdFx0XHRhdXRoZW50aWNhdGVSZXF1ZXN0czogW3tcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL21jcC5ub3Rpb24uY29tL21jcCcsXG5cdFx0XHRcdHNjb3BlczogW10sXG5cdFx0XHRcdHRva2VuOiAnbm90aW9uLXRva2VuJyxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJpYWxpemVzIGF1dGhlbnRpY2F0aW9uIHRyYW5zYWN0aW9ucyBmb3IgZGlmZmVyZW50IGNvbmZpZ3VyZWQgY2xpZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkeW5hbWljUHJvdmlkZXJJZCA9ICdodHRwczovL21jcC5leGFtcGxlLmNvbS8gaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20vcmVzb3VyY2UnO1xuXHRcdGNvbnN0IGZpcnN0U2Vzc2lvblN0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgZmlyc3RTZXNzaW9uR2F0ZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBwcm92aWRlckNyZWF0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBzZXNzaW9uUmVxdWVzdHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgYXV0aGVudGljYXRlUmVxdWVzdHM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGFjdGl2ZUNsaWVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBwcm92aWRlckFjdGl2ZSA9IGZhbHNlO1xuXHRcdGNvbnN0IGF1dGhTZXJ2aWNlID0gY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGlzRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXI6IHByb3ZpZGVySWQgPT4gcHJvdmlkZXJJZCA9PT0gZHluYW1pY1Byb3ZpZGVySWQgJiYgcHJvdmlkZXJBY3RpdmUsXG5cdFx0XHRjcmVhdGVEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcjogYXN5bmMgKF9hdXRob3JpemF0aW9uU2VydmVyLCBfbWV0YWRhdGEsIF9yZXNvdXJjZSwgY2xpZW50SWQpID0+IHtcblx0XHRcdFx0YWN0aXZlQ2xpZW50ID0gY2xpZW50SWQ7XG5cdFx0XHRcdHByb3ZpZGVyQWN0aXZlID0gdHJ1ZTtcblx0XHRcdFx0cHJvdmlkZXJDcmVhdGlvbnMucHVzaChjbGllbnRJZCA/PyAnJyk7XG5cdFx0XHRcdHJldHVybiB7IGlkOiBkeW5hbWljUHJvdmlkZXJJZCB9O1xuXHRcdFx0fSxcblx0XHRcdHVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyOiAoKSA9PiB7XG5cdFx0XHRcdHByb3ZpZGVyQWN0aXZlID0gZmFsc2U7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0U2Vzc2lvbnM6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY2xpZW50SWQgPSBhY3RpdmVDbGllbnQgPz8gJyc7XG5cdFx0XHRcdHNlc3Npb25SZXF1ZXN0cy5wdXNoKGNsaWVudElkKTtcblx0XHRcdFx0aWYgKGNsaWVudElkID09PSAnZmlyc3QtY2xpZW50Jykge1xuXHRcdFx0XHRcdGZpcnN0U2Vzc2lvblN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0XHRhd2FpdCBmaXJzdFNlc3Npb25HYXRlLnA7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0aWQ6IGAke2NsaWVudElkfS1zZXNzaW9uYCxcblx0XHRcdFx0XHRzY29wZXM6IFtdLFxuXHRcdFx0XHRcdGFjY2Vzc1Rva2VuOiBgJHtjbGllbnRJZH0tdG9rZW5gLFxuXHRcdFx0XHRcdGFjY291bnQ6IHsgaWQ6ICdhY2NvdW50LWlkJywgbGFiZWw6ICdNQ1AgQWNjb3VudCcgfSxcblx0XHRcdFx0fV07XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25TZXJ2aWNlLCBhdXRoU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLCB7XG5cdFx0XHRpc0FjY2Vzc0FsbG93ZWRGb3JVcmw6ICgpID0+IHRydWUsXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLCB7XG5cdFx0XHRnZXRBY2NvdW50UHJlZmVyZW5jZTogKCkgPT4gJ01DUCBBY2NvdW50Jyxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSwge1xuXHRcdFx0YWRkQWNjb3VudFVzYWdlOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZSwge1xuXHRcdFx0Z2V0Q2xpZW50UmVnaXN0cmF0aW9uOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoYWN0aXZlQ2xpZW50ID8geyBjbGllbnRJZDogYWN0aXZlQ2xpZW50IH0gOiB1bmRlZmluZWQpLFxuXHRcdFx0cmVtb3ZlRHluYW1pY1Byb3ZpZGVyOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGFjdGl2ZUNsaWVudCA9IHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHByb3RlY3RlZFJlc291cmNlID0ge1xuXHRcdFx0cmVzb3VyY2U6ICdodHRwczovL21jcC5leGFtcGxlLmNvbS9yZXNvdXJjZScsXG5cdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFsnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20nXSxcblx0XHR9O1xuXHRcdGNvbnN0IG9wdGlvbnMgPSAoY2xpZW50SWQ6IHN0cmluZykgPT4gKHtcblx0XHRcdGFsbG93SW50ZXJhY3Rpb246IHRydWUsXG5cdFx0XHRsb2dQcmVmaXg6ICdbQWdlbnRIb3N0XScsXG5cdFx0XHRtY3BTZXJ2ZXJJZDogJ2V4YW1wbGUnLFxuXHRcdFx0bWNwU2VydmVyTmFtZTogJ0V4YW1wbGUnLFxuXHRcdFx0bWNwU2VydmVyVXJsOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20vcmVzb3VyY2UnLFxuXHRcdFx0b2F1dGhDbGllbnQ6IHsgY2xpZW50SWQgfSxcblx0XHRcdHNjb3BlczogW10sXG5cdFx0XHRhdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGFGZXRjaGVyOiBhc3luYyAoYXV0aG9yaXphdGlvblNlcnZlcjogc3RyaW5nKSA9PiAoe1xuXHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdGlzc3VlcjogYXV0aG9yaXphdGlvblNlcnZlcixcblx0XHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNjb3ZlcnlVcmw6IGAke2F1dGhvcml6YXRpb25TZXJ2ZXJ9Ly53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyYCxcblx0XHRcdFx0ZXJyb3JzOiBbXSxcblx0XHRcdH0pLFxuXHRcdFx0YXV0aGVudGljYXRlOiBhc3luYyAocmVxdWVzdDogeyB0b2tlbjogc3RyaW5nIH0pID0+IHtcblx0XHRcdFx0YXV0aGVudGljYXRlUmVxdWVzdHMucHVzaChyZXF1ZXN0LnRva2VuKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBmaXJzdCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHJlc29sdmVNY3BTZXJ2ZXJBdXRoZW50aWNhdGlvbiwgcHJvdGVjdGVkUmVzb3VyY2UsIG9wdGlvbnMoJ2ZpcnN0LWNsaWVudCcpKTtcblx0XHRjb25zdCBzZWNvbmQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXNvbHZlTWNwU2VydmVyQXV0aGVudGljYXRpb24sIHByb3RlY3RlZFJlc291cmNlLCBvcHRpb25zKCdzZWNvbmQtY2xpZW50JykpO1xuXHRcdGF3YWl0IGZpcnN0U2Vzc2lvblN0YXJ0ZWQucDtcblx0XHRjb25zdCBiZWZvcmVSZXNvbHV0aW9uID0ge1xuXHRcdFx0cHJvdmlkZXJDcmVhdGlvbnM6IFsuLi5wcm92aWRlckNyZWF0aW9uc10sXG5cdFx0XHRzZXNzaW9uUmVxdWVzdHM6IFsuLi5zZXNzaW9uUmVxdWVzdHNdLFxuXHRcdH07XG5cdFx0Zmlyc3RTZXNzaW9uR2F0ZS5jb21wbGV0ZSgpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChbZmlyc3QsIHNlY29uZF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmVSZXNvbHV0aW9uLFxuXHRcdFx0cmVzdWx0cyxcblx0XHRcdHByb3ZpZGVyQ3JlYXRpb25zLFxuXHRcdFx0c2Vzc2lvblJlcXVlc3RzLFxuXHRcdFx0YXV0aGVudGljYXRlUmVxdWVzdHMsXG5cdFx0fSwge1xuXHRcdFx0YmVmb3JlUmVzb2x1dGlvbjoge1xuXHRcdFx0XHRwcm92aWRlckNyZWF0aW9uczogWydmaXJzdC1jbGllbnQnXSxcblx0XHRcdFx0c2Vzc2lvblJlcXVlc3RzOiBbJ2ZpcnN0LWNsaWVudCddLFxuXHRcdFx0fSxcblx0XHRcdHJlc3VsdHM6IFt0cnVlLCB0cnVlXSxcblx0XHRcdHByb3ZpZGVyQ3JlYXRpb25zOiBbJ2ZpcnN0LWNsaWVudCcsICdzZWNvbmQtY2xpZW50J10sXG5cdFx0XHRzZXNzaW9uUmVxdWVzdHM6IFsnZmlyc3QtY2xpZW50JywgJ3NlY29uZC1jbGllbnQnXSxcblx0XHRcdGF1dGhlbnRpY2F0ZVJlcXVlc3RzOiBbJ2ZpcnN0LWNsaWVudC10b2tlbicsICdzZWNvbmQtY2xpZW50LXRva2VuJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIGEgcGVyc2lzdGVkIGNvbmZpZ3VyZWQgcHJvdmlkZXIgd2l0aG91dCB1c2VyIGludGVyYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGR5bmFtaWNQcm92aWRlcklkID0gJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbS8gaHR0cHM6Ly9tY3Auc2xhY2suY29tJztcblx0XHRjb25zdCBwcm92aWRlckNyZWF0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBhdXRoZW50aWNhdGVSZXF1ZXN0czogeyByZXNvdXJjZTogc3RyaW5nOyBzY29wZXM/OiByZWFkb25seSBzdHJpbmdbXTsgdG9rZW46IHN0cmluZyB9W10gPSBbXTtcblx0XHRsZXQgaXNQcm92aWRlckFjdGl2ZSA9IGZhbHNlO1xuXHRcdGNvbnN0IGF1dGhTZXJ2aWNlID0gY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGlzRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXI6IHByb3ZpZGVySWQgPT4gcHJvdmlkZXJJZCA9PT0gZHluYW1pY1Byb3ZpZGVySWQgJiYgaXNQcm92aWRlckFjdGl2ZSxcblx0XHRcdGNyZWF0ZUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyOiBhc3luYyAoX2F1dGhvcml6YXRpb25TZXJ2ZXIsIF9tZXRhZGF0YSwgX3Jlc291cmNlLCBjbGllbnRJZCkgPT4ge1xuXHRcdFx0XHRwcm92aWRlckNyZWF0aW9ucy5wdXNoKGNsaWVudElkID8/ICcnKTtcblx0XHRcdFx0aXNQcm92aWRlckFjdGl2ZSA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB7IGlkOiBkeW5hbWljUHJvdmlkZXJJZCB9O1xuXHRcdFx0fSxcblx0XHRcdGdldFNlc3Npb25zOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoW3tcblx0XHRcdFx0aWQ6ICdzbGFjay1zZXNzaW9uJyxcblx0XHRcdFx0c2NvcGVzOiBbJ3NlYXJjaDpyZWFkLnB1YmxpYyddLFxuXHRcdFx0XHRhY2Nlc3NUb2tlbjogJ3NsYWNrLXRva2VuJyxcblx0XHRcdFx0YWNjb3VudDogeyBpZDogJ2FjY291bnQtaWQnLCBsYWJlbDogJ1NsYWNrIEFjY291bnQnIH0sXG5cdFx0XHR9XSksXG5cdFx0fSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvblNlcnZpY2UsIGF1dGhTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UsIHtcblx0XHRcdGlzQWNjZXNzQWxsb3dlZEZvclVybDogKCkgPT4gdHJ1ZSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UsIHtcblx0XHRcdGdldEFjY291bnRQcmVmZXJlbmNlOiAoKSA9PiAnU2xhY2sgQWNjb3VudCcsXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UsIHtcblx0XHRcdGFkZEFjY291bnRVc2FnZTogKCkgPT4geyB9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UsIHtcblx0XHRcdGdldENsaWVudFJlZ2lzdHJhdGlvbjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHsgY2xpZW50SWQ6ICdzbGFjay1jbGllbnQtaWQnIH0pLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHJlc29sdmVNY3BTZXJ2ZXJBdXRoZW50aWNhdGlvbiwge1xuXHRcdFx0cmVzb3VyY2U6ICdodHRwczovL21jcC5zbGFjay5jb20nLFxuXHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbSddLFxuXHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydzZWFyY2g6cmVhZC5wdWJsaWMnXSxcblx0XHR9LCB7XG5cdFx0XHRhbGxvd0ludGVyYWN0aW9uOiBmYWxzZSxcblx0XHRcdGxvZ1ByZWZpeDogJ1tBZ2VudEhvc3RdJyxcblx0XHRcdG1jcFNlcnZlcklkOiAnc2xhY2snLFxuXHRcdFx0bWNwU2VydmVyTmFtZTogJ1NsYWNrJyxcblx0XHRcdG1jcFNlcnZlclVybDogJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbScsXG5cdFx0XHRvYXV0aENsaWVudDogeyBjbGllbnRJZDogJ3NsYWNrLWNsaWVudC1pZCcgfSxcblx0XHRcdHNjb3BlczogW10sXG5cdFx0XHRhdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGFGZXRjaGVyOiBhc3luYyBhdXRob3JpemF0aW9uU2VydmVyID0+ICh7XG5cdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0aXNzdWVyOiBhdXRob3JpemF0aW9uU2VydmVyLFxuXHRcdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRpc2NvdmVyeVVybDogYCR7YXV0aG9yaXphdGlvblNlcnZlcn0vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXJgLFxuXHRcdFx0XHRlcnJvcnM6IFtdLFxuXHRcdFx0fSksXG5cdFx0XHRhdXRoZW50aWNhdGU6IGFzeW5jIHJlcXVlc3QgPT4ge1xuXHRcdFx0XHRhdXRoZW50aWNhdGVSZXF1ZXN0cy5wdXNoKHJlcXVlc3QpO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXN1bHQsIHByb3ZpZGVyQ3JlYXRpb25zLCBhdXRoZW50aWNhdGVSZXF1ZXN0cyB9LCB7XG5cdFx0XHRyZXN1bHQ6IHRydWUsXG5cdFx0XHRwcm92aWRlckNyZWF0aW9uczogWydzbGFjay1jbGllbnQtaWQnXSxcblx0XHRcdGF1dGhlbnRpY2F0ZVJlcXVlc3RzOiBbe1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbScsXG5cdFx0XHRcdHNjb3BlczogWydzZWFyY2g6cmVhZC5wdWJsaWMnXSxcblx0XHRcdFx0dG9rZW46ICdzbGFjay10b2tlbicsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBjb25maWd1cmVkIHB1YmxpYyBhbmQgY29uZmlkZW50aWFsIGNsaWVudHMgd2hlbiBjcmVhdGluZyBhIGR5bmFtaWMgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZHluYW1pY1Byb3ZpZGVySWQgPSAnaHR0cHM6Ly9tY3Auc2xhY2suY29tLyBodHRwczovL21jcC5zbGFjay5jb20nO1xuXHRcdGNvbnN0IHByb3ZpZGVyQ3JlYXRpb25zOiB7IGF1dGhvcml6YXRpb25TZXJ2ZXI6IHN0cmluZzsgcmVzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZDsgY2xpZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgY2xpZW50U2VjcmV0OiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0Y29uc3Qgc2Vzc2lvblJlcXVlc3RzOiB7IGNsaWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGNsaWVudFNlY3JldDogc3RyaW5nIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHNlc3Npb25DcmVhdGlvbnM6IHsgY2xpZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgY2xpZW50U2VjcmV0OiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0Y29uc3QgYXV0aGVudGljYXRlUmVxdWVzdHM6IHsgcmVzb3VyY2U6IHN0cmluZzsgc2NvcGVzPzogcmVhZG9ubHkgc3RyaW5nW107IHRva2VuOiBzdHJpbmcgfVtdID0gW107XG5cdFx0Y29uc3QgcmVtb3ZlZFByb3ZpZGVyczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgcmVnaXN0ZXJlZENsaWVudDogeyBjbGllbnRJZD86IHN0cmluZzsgY2xpZW50U2VjcmV0Pzogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGdldFNlc3Npb25zQ2FsbCA9IDA7XG5cdFx0Y29uc3QgcHJvdmlkZXI6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyID0ge1xuXHRcdFx0aWQ6IGR5bmFtaWNQcm92aWRlcklkLFxuXHRcdFx0bGFiZWw6ICdTbGFjaycsXG5cdFx0XHRzdXBwb3J0c011bHRpcGxlQWNjb3VudHM6IGZhbHNlLFxuXHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uczogRXZlbnQuTm9uZSxcblx0XHRcdGdldFNlc3Npb25zOiAoKSA9PiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgcHJvdmlkZXIgZ2V0U2Vzc2lvbnMgY2FsbCcpKSxcblx0XHRcdGNyZWF0ZVNlc3Npb246ICgpID0+IFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignVW5leHBlY3RlZCBwcm92aWRlciBjcmVhdGVTZXNzaW9uIGNhbGwnKSksXG5cdFx0XHRyZW1vdmVTZXNzaW9uOiAoKSA9PiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgcHJvdmlkZXIgcmVtb3ZlU2Vzc2lvbiBjYWxsJykpLFxuXHRcdH07XG5cdFx0Y29uc3QgYXV0aFNlcnZpY2UgPSBjcmVhdGVNb2NrQXV0aFNlcnZpY2Uoe1xuXHRcdFx0Z2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXI6ICgpID0+IFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignQ29uZmlndXJlZCBjbGllbnRzIG11c3Qgbm90IHVzZSBhIGJ1aWx0LWluIHByb3ZpZGVyJykpLFxuXHRcdFx0Z2V0U2Vzc2lvbnM6IChfcHJvdmlkZXJJZCwgX3Njb3Blcywgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRzZXNzaW9uUmVxdWVzdHMucHVzaCh7IGNsaWVudElkOiBvcHRpb25zLmNsaWVudElkLCBjbGllbnRTZWNyZXQ6IG9wdGlvbnMuY2xpZW50U2VjcmV0IH0pO1xuXHRcdFx0XHRnZXRTZXNzaW9uc0NhbGwrKztcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShnZXRTZXNzaW9uc0NhbGwgPT09IDEgPyBbe1xuXHRcdFx0XHRcdHNjb3BlczogWydzZWFyY2g6cmVhZC5wdWJsaWMnXSxcblx0XHRcdFx0XHRhY2Nlc3NUb2tlbjogJ3B1YmxpYy10b2tlbicsXG5cdFx0XHRcdFx0YWNjb3VudDogeyBpZDogJ2FjY291bnQtaWQnLCBsYWJlbDogJ1NsYWNrIEFjY291bnQnIH0sXG5cdFx0XHRcdH1dIDogW10pO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVNlc3Npb246IChfcHJvdmlkZXJJZCwgX3Njb3Blcywgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRzZXNzaW9uQ3JlYXRpb25zLnB1c2goeyBjbGllbnRJZDogb3B0aW9ucy5jbGllbnRJZCwgY2xpZW50U2VjcmV0OiBvcHRpb25zLmNsaWVudFNlY3JldCB9KTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdFx0aWQ6ICdjb25maWRlbnRpYWwtc2Vzc2lvbicsXG5cdFx0XHRcdFx0YWNjZXNzVG9rZW46ICdjb25maWRlbnRpYWwtdG9rZW4nLFxuXHRcdFx0XHRcdGFjY291bnQ6IHsgaWQ6ICdhY2NvdW50LWlkJywgbGFiZWw6ICdTbGFjayBBY2NvdW50JyB9LFxuXHRcdFx0XHRcdHNjb3BlczogWydzZWFyY2g6cmVhZC5wdWJsaWMnXSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXI6IGFzeW5jIChhdXRob3JpemF0aW9uU2VydmVyLCBfbWV0YWRhdGEsIHJlc291cmNlLCBjbGllbnRJZCwgY2xpZW50U2VjcmV0KSA9PiB7XG5cdFx0XHRcdHByb3ZpZGVyQ3JlYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXI6IGF1dGhvcml6YXRpb25TZXJ2ZXIudG9TdHJpbmcodHJ1ZSksXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHJlc291cmNlPy5yZXNvdXJjZSxcblx0XHRcdFx0XHRjbGllbnRJZCxcblx0XHRcdFx0XHRjbGllbnRTZWNyZXQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZWdpc3RlcmVkQ2xpZW50ID0geyBjbGllbnRJZCwgY2xpZW50U2VjcmV0IH07XG5cdFx0XHRcdHJldHVybiB7IGlkOiBkeW5hbWljUHJvdmlkZXJJZCB9O1xuXHRcdFx0fSxcblx0XHRcdGdldFByb3ZpZGVyOiAoKSA9PiBwcm92aWRlcixcblx0XHRcdGlzRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXI6IHByb3ZpZGVySWQgPT4gcHJvdmlkZXJJZCA9PT0gZHluYW1pY1Byb3ZpZGVySWQgJiYgcmVnaXN0ZXJlZENsaWVudCAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0dW5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXI6IHByb3ZpZGVySWQgPT4ge1xuXHRcdFx0XHRyZW1vdmVkUHJvdmlkZXJzLnB1c2gocHJvdmlkZXJJZCk7XG5cdFx0XHRcdHJlZ2lzdGVyZWRDbGllbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25TZXJ2aWNlLCBhdXRoU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLCB7XG5cdFx0XHRpc0FjY2Vzc0FsbG93ZWRGb3JVcmw6ICgpID0+IHRydWUsXG5cdFx0XHR1cGRhdGVBbGxvd2VkTWNwU2VydmVyczogKCkgPT4geyB9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSwge1xuXHRcdFx0Z2V0QWNjb3VudFByZWZlcmVuY2U6ICgpID0+ICdTbGFjayBBY2NvdW50Jyxcblx0XHRcdHVwZGF0ZUFjY291bnRQcmVmZXJlbmNlOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UsIHtcblx0XHRcdGFkZEFjY291bnRVc2FnZTogKCkgPT4geyB9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UsIHtcblx0XHRcdGdldENsaWVudFJlZ2lzdHJhdGlvbjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHJlZ2lzdGVyZWRDbGllbnQpLFxuXHRcdFx0cmVtb3ZlRHluYW1pY1Byb3ZpZGVyOiBhc3luYyBwcm92aWRlcklkID0+IHtcblx0XHRcdFx0cmVtb3ZlZFByb3ZpZGVycy5wdXNoKHByb3ZpZGVySWQpO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCByZXN1bHRzOiBib29sZWFuW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IG9hdXRoQ2xpZW50IG9mIFtcblx0XHRcdHsgY2xpZW50SWQ6ICdwdWJsaWMtY2xpZW50LWlkJyB9LFxuXHRcdFx0eyBjbGllbnRJZDogJ2NvbmZpZGVudGlhbC1jbGllbnQtaWQnLCBjbGllbnRTZWNyZXQ6ICdjb25maWRlbnRpYWwtY2xpZW50LXNlY3JldCcgfSxcblx0XHRdKSB7XG5cdFx0XHRyZXN1bHRzLnB1c2goYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmVzb2x2ZU1jcFNlcnZlckF1dGhlbnRpY2F0aW9uLCB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3Auc2xhY2suY29tJyxcblx0XHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbSddLFxuXHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3NlYXJjaDpyZWFkLnB1YmxpYyddLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhbGxvd0ludGVyYWN0aW9uOiB0cnVlLFxuXHRcdFx0XHRsb2dQcmVmaXg6ICdbQWdlbnRIb3N0XScsXG5cdFx0XHRcdG1jcFNlcnZlcklkOiAnc2xhY2snLFxuXHRcdFx0XHRtY3BTZXJ2ZXJOYW1lOiAnU2xhY2snLFxuXHRcdFx0XHRtY3BTZXJ2ZXJVcmw6ICdodHRwczovL21jcC5zbGFjay5jb20nLFxuXHRcdFx0XHRvYXV0aENsaWVudCxcblx0XHRcdFx0c2NvcGVzOiBbJ3NlYXJjaDpyZWFkLnB1YmxpYyddLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGFGZXRjaGVyOiBhc3luYyBhdXRob3JpemF0aW9uU2VydmVyID0+ICh7XG5cdFx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdGlzc3VlcjogYXV0aG9yaXphdGlvblNlcnZlcixcblx0XHRcdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRkaXNjb3ZlcnlVcmw6IGAke2F1dGhvcml6YXRpb25TZXJ2ZXJ9Ly53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyYCxcblx0XHRcdFx0XHRlcnJvcnM6IFtdLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0YXV0aGVudGljYXRlOiBhc3luYyByZXF1ZXN0ID0+IHtcblx0XHRcdFx0XHRhdXRoZW50aWNhdGVSZXF1ZXN0cy5wdXNoKHJlcXVlc3QpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0cyxcblx0XHRcdHByb3ZpZGVyQ3JlYXRpb25zLFxuXHRcdFx0c2Vzc2lvblJlcXVlc3RzLFxuXHRcdFx0c2Vzc2lvbkNyZWF0aW9ucyxcblx0XHRcdGF1dGhlbnRpY2F0ZVJlcXVlc3RzLFxuXHRcdFx0cmVtb3ZlZFByb3ZpZGVycyxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHRzOiBbdHJ1ZSwgdHJ1ZV0sXG5cdFx0XHRwcm92aWRlckNyZWF0aW9uczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlcjogJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbS8nLFxuXHRcdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3Auc2xhY2suY29tJyxcblx0XHRcdFx0XHRjbGllbnRJZDogJ3B1YmxpYy1jbGllbnQtaWQnLFxuXHRcdFx0XHRcdGNsaWVudFNlY3JldDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlcjogJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbS8nLFxuXHRcdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3Auc2xhY2suY29tJyxcblx0XHRcdFx0XHRjbGllbnRJZDogJ2NvbmZpZGVudGlhbC1jbGllbnQtaWQnLFxuXHRcdFx0XHRcdGNsaWVudFNlY3JldDogJ2NvbmZpZGVudGlhbC1jbGllbnQtc2VjcmV0Jyxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHRzZXNzaW9uUmVxdWVzdHM6IFtcblx0XHRcdFx0eyBjbGllbnRJZDogJ3B1YmxpYy1jbGllbnQtaWQnLCBjbGllbnRTZWNyZXQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IGNsaWVudElkOiAnY29uZmlkZW50aWFsLWNsaWVudC1pZCcsIGNsaWVudFNlY3JldDogJ2NvbmZpZGVudGlhbC1jbGllbnQtc2VjcmV0JyB9LFxuXHRcdFx0XSxcblx0XHRcdHNlc3Npb25DcmVhdGlvbnM6IFtcblx0XHRcdFx0eyBjbGllbnRJZDogJ2NvbmZpZGVudGlhbC1jbGllbnQtaWQnLCBjbGllbnRTZWNyZXQ6ICdjb25maWRlbnRpYWwtY2xpZW50LXNlY3JldCcgfSxcblx0XHRcdF0sXG5cdFx0XHRhdXRoZW50aWNhdGVSZXF1ZXN0czogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL21jcC5zbGFjay5jb20nLFxuXHRcdFx0XHRcdHNjb3BlczogWydzZWFyY2g6cmVhZC5wdWJsaWMnXSxcblx0XHRcdFx0XHR0b2tlbjogJ3B1YmxpYy10b2tlbicsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbScsXG5cdFx0XHRcdFx0c2NvcGVzOiBbJ3NlYXJjaDpyZWFkLnB1YmxpYyddLFxuXHRcdFx0XHRcdHRva2VuOiAnY29uZmlkZW50aWFsLXRva2VuJyxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHRyZW1vdmVkUHJvdmlkZXJzOiBbZHluYW1pY1Byb3ZpZGVySWQsIGR5bmFtaWNQcm92aWRlcklkXSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2F1dGhlbnRpY2F0ZVByb3RlY3RlZFJlc291cmNlcycsICgpID0+IHtcblxuXHRjb25zdCBwcm90ZWN0ZWRSZXNvdXJjZTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSA9IHtcblx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJyxcblx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFsnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJ10sXG5cdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZWFkJ10sXG5cdH07XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdza2lwcyBhdXRoZW50aWNhdGUgd2hlbiB0aGUgY2FjaGVkIHRva2VuIGlzIHVuY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7XG5cdFx0XHRnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCdwcm92aWRlci0xJyksXG5cdFx0XHRnZXRTZXNzaW9uczogKF9wcm92aWRlcklkLCBzY29wZXMpID0+IHtcblx0XHRcdFx0aWYgKHNjb3Blcykge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW3sgc2NvcGVzOiBbJ3JlYWQnXSwgYWNjZXNzVG9rZW46ICdjYWNoZWQtdG9rZW4nIH1dKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBjYWNoZSA9IG5ldyBBZ2VudEhvc3RBdXRoVG9rZW5DYWNoZSgpO1xuXHRcdGNvbnN0IHJlcXVlc3RzOiB7IHJlc291cmNlOiBzdHJpbmc7IHNjb3Blcz86IHJlYWRvbmx5IHN0cmluZ1tdOyB0b2tlbjogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGFnZW50cyA9IFt7IHByb3RlY3RlZFJlc291cmNlczogW3Byb3RlY3RlZFJlc291cmNlXSB9XSBhcyB1bmtub3duIGFzIHJlYWRvbmx5IEFnZW50SW5mb1tdO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlQXV0aEluc3RhbnRpYXRpb25TZXJ2aWNlKGRpc3Bvc2FibGVzLCBhdXRoU2VydmljZSk7XG5cblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhdXRoZW50aWNhdGVQcm90ZWN0ZWRSZXNvdXJjZXMsIGFnZW50cywge1xuXHRcdFx0YXV0aFRva2VuQ2FjaGU6IGNhY2hlLFxuXHRcdFx0bG9nUHJlZml4OiAnW0FnZW50SG9zdF0nLFxuXHRcdFx0YXV0aGVudGljYXRlOiBhc3luYyByZXF1ZXN0ID0+IHtcblx0XHRcdFx0cmVxdWVzdHMucHVzaChyZXF1ZXN0KTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXV0aGVudGljYXRlUHJvdGVjdGVkUmVzb3VyY2VzLCBhZ2VudHMsIHtcblx0XHRcdGF1dGhUb2tlbkNhY2hlOiBjYWNoZSxcblx0XHRcdGxvZ1ByZWZpeDogJ1tBZ2VudEhvc3RdJyxcblx0XHRcdGF1dGhlbnRpY2F0ZTogYXN5bmMgcmVxdWVzdCA9PiB7XG5cdFx0XHRcdHJlcXVlc3RzLnB1c2gocmVxdWVzdCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXF1ZXN0cywgW3sgcmVzb3VyY2U6IHByb3RlY3RlZFJlc291cmNlLnJlc291cmNlLCBzY29wZXM6IFsncmVhZCddLCB0b2tlbjogJ2NhY2hlZC10b2tlbicgfV0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgncmVzb2x2ZUF1dGhlbnRpY2F0aW9uSW50ZXJhY3RpdmVseScsICgpID0+IHtcblxuXHRjb25zdCBwcm90ZWN0ZWRSZXNvdXJjZTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSA9IHtcblx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJyxcblx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFsnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJ10sXG5cdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZWFkJ10sXG5cdH07XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd1c2VzIGFuIGV4aXN0aW5nIHRva2VuIGJlZm9yZSBwcm9tcHRpbmcgYW5kIGRlZHVwZXMgcmVwZWF0ZWQgY2hlY2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBjcmVhdGVTZXNzaW9uQ2FsbHMgPSAwO1xuXHRcdGNvbnN0IGF1dGhTZXJ2aWNlID0gY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoJ3Byb3ZpZGVyLTEnKSxcblx0XHRcdGdldFNlc3Npb25zOiAoX3Byb3ZpZGVySWQsIHNjb3BlcykgPT4ge1xuXHRcdFx0XHRpZiAoc2NvcGVzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbeyBzY29wZXM6IFsncmVhZCddLCBhY2Nlc3NUb2tlbjogJ2V4aXN0aW5nLXRva2VuJyB9XSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVTZXNzaW9uOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNyZWF0ZVNlc3Npb25DYWxscysrO1xuXHRcdFx0XHRyZXR1cm4geyBhY2Nlc3NUb2tlbjogJ25ldy10b2tlbicgfTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVxdWVzdHM6IHsgcmVzb3VyY2U6IHN0cmluZzsgc2NvcGVzPzogcmVhZG9ubHkgc3RyaW5nW107IHRva2VuOiBzdHJpbmcgfVtdID0gW107XG5cdFx0Y29uc3QgY2FjaGUgPSBuZXcgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUF1dGhJbnN0YW50aWF0aW9uU2VydmljZShkaXNwb3NhYmxlcywgYXV0aFNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogSUFnZW50SG9zdEF1dGhlbnRpY2F0aW9uT3B0aW9ucyA9IHtcblx0XHRcdGF1dGhUb2tlbkNhY2hlOiBjYWNoZSxcblx0XHRcdGxvZ1ByZWZpeDogJ1tBZ2VudEhvc3RdJyxcblx0XHRcdGF1dGhlbnRpY2F0ZTogYXN5bmMgcmVxdWVzdCA9PiB7XG5cdFx0XHRcdHJlcXVlc3RzLnB1c2gocmVxdWVzdCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0cyA9IFtcblx0XHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHJlc29sdmVBdXRoZW50aWNhdGlvbkludGVyYWN0aXZlbHksIFtwcm90ZWN0ZWRSZXNvdXJjZV0sIG9wdGlvbnMpLFxuXHRcdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmVzb2x2ZUF1dGhlbnRpY2F0aW9uSW50ZXJhY3RpdmVseSwgW3Byb3RlY3RlZFJlc291cmNlXSwgb3B0aW9ucyksXG5cdFx0XTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXN1bHRzLCByZXF1ZXN0cywgY3JlYXRlU2Vzc2lvbkNhbGxzIH0sIHtcblx0XHRcdHJlc3VsdHM6IFt0cnVlLCB0cnVlXSxcblx0XHRcdHJlcXVlc3RzOiBbeyByZXNvdXJjZTogcHJvdGVjdGVkUmVzb3VyY2UucmVzb3VyY2UsIHNjb3BlczogWydyZWFkJ10sIHRva2VuOiAnZXhpc3RpbmctdG9rZW4nIH1dLFxuXHRcdFx0Y3JlYXRlU2Vzc2lvbkNhbGxzOiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHRoZSBwcm9kdWN0IHNpZ24taW4gZmxvdyBhbmQgZm9yd2FyZHMgaXRzIHRva2VuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzaWduZWRJbiA9IGZhbHNlO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gbmV3IFRlc3RDb21tYW5kU2VydmljZSgpO1xuXHRcdGNvbW1hbmRTZXJ2aWNlLm9uRXhlY3V0ZSA9ICgpID0+IHNpZ25lZEluID0gdHJ1ZTtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7XG5cdFx0XHRnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCdwcm92aWRlci0xJyksXG5cdFx0XHRnZXRTZXNzaW9uczogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHNpZ25lZEluID8gW3sgc2NvcGVzOiBbJ3JlYWQnXSwgYWNjZXNzVG9rZW46ICdzaWduZWQtaW4tdG9rZW4nIH1dIDogW10pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlcXVlc3RzOiB7IHJlc291cmNlOiBzdHJpbmc7IHNjb3Blcz86IHJlYWRvbmx5IHN0cmluZ1tdOyB0b2tlbjogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlQXV0aEluc3RhbnRpYXRpb25TZXJ2aWNlKGRpc3Bvc2FibGVzLCBhdXRoU2VydmljZSwgY29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc3VjY2VzcyA9IGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHJlc29sdmVBdXRoZW50aWNhdGlvbkludGVyYWN0aXZlbHksIFtwcm90ZWN0ZWRSZXNvdXJjZV0sIHtcblx0XHRcdGF1dGhUb2tlbkNhY2hlOiBuZXcgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUoKSxcblx0XHRcdGxvZ1ByZWZpeDogJ1tBZ2VudEhvc3RdJyxcblx0XHRcdGF1dGhlbnRpY2F0ZTogYXN5bmMgcmVxdWVzdCA9PiB7XG5cdFx0XHRcdHJlcXVlc3RzLnB1c2gocmVxdWVzdCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHN1Y2Nlc3MsIGNvbW1hbmRDYWxsczogY29tbWFuZFNlcnZpY2UuY2FsbHMsIHJlcXVlc3RzIH0sIHtcblx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRjb21tYW5kQ2FsbHM6IFt7XG5cdFx0XHRcdGNvbW1hbmRJZDogQ0hBVF9TRVRVUF9BQ1RJT05fSUQsXG5cdFx0XHRcdGFyZ3M6IFt1bmRlZmluZWQsIHtcblx0XHRcdFx0XHRmb3JjZVNpZ25JbkRpYWxvZzogdHJ1ZSxcblx0XHRcdFx0XHRhZGRpdGlvbmFsU2NvcGVzOiBbJ3JlYWQnXSxcblx0XHRcdFx0XHRkaWFsb2dUaXRsZTogJ1NpZ24gaW4gdG8gdXNlIEdpdEh1YiBDb3BpbG90Jyxcblx0XHRcdFx0XHRkaXNhYmxlQ2hhdFZpZXdSZXZlYWw6IHRydWUsXG5cdFx0XHRcdFx0cmV0dXJuUmVzdWx0OiB0cnVlLFxuXHRcdFx0XHR9XSxcblx0XHRcdH1dLFxuXHRcdFx0cmVxdWVzdHM6IFt7IHJlc291cmNlOiBwcm90ZWN0ZWRSZXNvdXJjZS5yZXNvdXJjZSwgc2NvcGVzOiBbJ3JlYWQnXSwgdG9rZW46ICdzaWduZWQtaW4tdG9rZW4nIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBmYWxsIGJhY2sgdG8gZGlyZWN0IHByb3ZpZGVyIGxvZ2luIHdoZW4gcHJvZHVjdCBzaWduLWluIGlzIGNhbmNlbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gbmV3IFRlc3RDb21tYW5kU2VydmljZSgpO1xuXHRcdGNvbW1hbmRTZXJ2aWNlLnJlc3VsdCA9IHsgc3VjY2VzczogdW5kZWZpbmVkLCBkaWFsb2dTa2lwcGVkOiBmYWxzZSB9O1xuXHRcdGxldCBjcmVhdGVTZXNzaW9uQ2FsbHMgPSAwO1xuXHRcdGNvbnN0IGF1dGhTZXJ2aWNlID0gY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoJ3Byb3ZpZGVyLTEnKSxcblx0XHRcdGdldFNlc3Npb25zOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoW10pLFxuXHRcdFx0Y3JlYXRlU2Vzc2lvbjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjcmVhdGVTZXNzaW9uQ2FsbHMrKztcblx0XHRcdFx0cmV0dXJuIHsgYWNjZXNzVG9rZW46ICd1bmV4cGVjdGVkLXRva2VuJyB9O1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUF1dGhJbnN0YW50aWF0aW9uU2VydmljZShkaXNwb3NhYmxlcywgYXV0aFNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXNvbHZlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5LCBbcHJvdGVjdGVkUmVzb3VyY2VdLCB7XG5cdFx0XHRsb2dQcmVmaXg6ICdbQWdlbnRIb3N0XScsXG5cdFx0XHRhdXRoZW50aWNhdGU6IGFzeW5jICgpID0+IHsgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzdWNjZXNzLCBjcmVhdGVTZXNzaW9uQ2FsbHMgfSwgeyBzdWNjZXNzOiBmYWxzZSwgY3JlYXRlU2Vzc2lvbkNhbGxzOiAwIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9wYWdhdGVzIHByb2R1Y3Qgc2lnbi1pbiBmYWlsdXJlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoKTtcblx0XHRjb21tYW5kU2VydmljZS5yZXN1bHQgPSB7IHN1Y2Nlc3M6IGZhbHNlLCBkaWFsb2dTa2lwcGVkOiBmYWxzZSwgZXJyb3I6IG5ldyBFcnJvcignQmFkIGNyZWRlbnRpYWxzJykgfTtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7XG5cdFx0XHRnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCdwcm92aWRlci0xJyksXG5cdFx0XHRnZXRTZXNzaW9uczogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKFtdKSxcblx0XHR9KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUF1dGhJbnN0YW50aWF0aW9uU2VydmljZShkaXNwb3NhYmxlcywgYXV0aFNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHJlc29sdmVBdXRoZW50aWNhdGlvbkludGVyYWN0aXZlbHksIFtwcm90ZWN0ZWRSZXNvdXJjZV0sIHtcblx0XHRcdGxvZ1ByZWZpeDogJ1tBZ2VudEhvc3RdJyxcblx0XHRcdGF1dGhlbnRpY2F0ZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdH0pLCAvQmFkIGNyZWRlbnRpYWxzLyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxhQUFhO0FBRXRCLFNBQVMsV0FBVztBQUVwQixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLDhCQUE0RDtBQUNyRSxTQUFTLG9EQUFvRDtBQUM3RCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdDQUFnQyxvQ0FBb0MseUJBQXlCLHlCQUF5QixzQkFBc0Isc0NBQTRFO0FBRWpPLE1BQU0sMkJBQTJCLEtBQXNCLEVBQUU7QUFBQSxFQUF6RDtBQUFBO0FBQ0MsU0FBUyxRQUFrRCxDQUFDO0FBQzVELGtCQUFrQixFQUFFLFNBQVMsTUFBTSxlQUFlLE1BQU07QUFBQTtBQUFBLEVBR3hELE1BQWUsZUFBNEIsY0FBc0IsTUFBeUM7QUFDekcsU0FBSyxNQUFNLEtBQUssRUFBRSxXQUFXLEtBQUssQ0FBQztBQUNuQyxTQUFLLFlBQVk7QUFDakIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUNEO0FBRUEsU0FBUywrQkFBK0IsYUFBMkMsdUJBQStDLGlCQUFpQixJQUFJLG1CQUFtQixHQUE2QjtBQUN0TSxRQUFNLHVCQUF1QixZQUFZLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUMzRSx1QkFBcUIsS0FBSyx3QkFBd0IscUJBQXFCO0FBQ3ZFLHVCQUFxQixLQUFLLGlCQUFpQixjQUFjO0FBQ3pELHVCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDM0QsU0FBTztBQUNSO0FBRUEsU0FBUyxzQkFBc0IsV0FRSjtBQUMxQixTQUFPO0FBQUEsSUFDTixrQ0FBa0MsVUFBVSxxQ0FBcUMsTUFBTSxRQUFRLFFBQVEsTUFBUztBQUFBLElBQ2hILGFBQWEsVUFBVSxnQkFBZ0IsTUFBTSxRQUFRLFFBQVEsQ0FBQyxDQUFDO0FBQUEsSUFDL0QsZUFBZSxVQUFVLGtCQUFrQixNQUFNLFFBQVEsT0FBTyxJQUFJLE1BQU0sK0JBQStCLENBQUM7QUFBQSxJQUMxRyxxQ0FBcUMsVUFBVSx3Q0FBd0MsTUFBTSxRQUFRLFFBQVEsTUFBUztBQUFBLElBQ3RILGFBQWEsVUFBVSxnQkFBZ0IsTUFBTTtBQUFFLFlBQU0sSUFBSSxNQUFNLDZCQUE2QjtBQUFBLElBQUc7QUFBQSxJQUMvRixpQ0FBaUMsVUFBVSxvQ0FBb0MsTUFBTTtBQUFBLElBQ3JGLGtDQUFrQyxVQUFVLHFDQUFxQyxNQUFNO0FBQUEsSUFBRTtBQUFBLEVBQzFGO0FBQ0Q7QUFFQSxNQUFNLHdCQUF3QixNQUFNO0FBRW5DLDBDQUF3QztBQUV4QyxPQUFLLGtFQUFrRSxNQUFNO0FBRzVFLFVBQU0sSUFBSSxxQkFBcUIsZUFBZSxVQUFVLG9DQUFvQztBQUM1RixVQUFNLElBQUkscUJBQXFCLGVBQWUsVUFBVSxvQ0FBb0M7QUFDNUYsV0FBTyxZQUFZLEdBQUcsQ0FBQztBQUN2QixXQUFPLFlBQVksR0FBRyxnRkFBZ0Y7QUFBQSxFQUN2RyxDQUFDO0FBRUQsT0FBSyw4Q0FBOEMsTUFBTTtBQUN4RCxVQUFNLE9BQU8scUJBQXFCLFVBQVUsVUFBVSx1QkFBdUI7QUFDN0UsVUFBTSxPQUFPLG9CQUFJLElBQUk7QUFBQSxNQUNwQjtBQUFBLE1BQ0EscUJBQXFCLFVBQVUsVUFBVSx1QkFBdUI7QUFBQSxNQUNoRSxxQkFBcUIsVUFBVSxTQUFTLHVCQUF1QjtBQUFBLE1BQy9ELHFCQUFxQixVQUFVLFVBQVUsdUJBQXVCO0FBQUEsSUFDakUsQ0FBQztBQUNELFdBQU8sWUFBWSxLQUFLLE1BQU0sQ0FBQztBQUFBLEVBQ2hDLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSwyQkFBMkIsTUFBTTtBQUV0QyxRQUFNLE1BQU0sSUFBSSxlQUFlO0FBQy9CLFFBQU0sV0FBVyxJQUFJLE1BQU0seUJBQXlCO0FBRXBELDBDQUF3QztBQUV4QyxPQUFLLDREQUE0RCxZQUFZO0FBQzVFLFVBQU0sY0FBYyxzQkFBc0IsQ0FBQyxDQUFDO0FBQzVDLFVBQU0sUUFBUSxNQUFNLHdCQUF3QixVQUFVLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxhQUFhLEtBQUssTUFBTTtBQUM1RixXQUFPLFlBQVksT0FBTyxNQUFTO0FBQUEsRUFDcEMsQ0FBQztBQUVELE9BQUsseURBQXlELFlBQVk7QUFDekUsVUFBTSxjQUFjLHNCQUFzQjtBQUFBLE1BQ3pDLGtDQUFrQyxNQUFNLFFBQVEsUUFBUSxNQUFTO0FBQUEsSUFDbEUsQ0FBQztBQUNELFVBQU0sUUFBUSxNQUFNLHdCQUF3QixVQUFVLENBQUMsMEJBQTBCLEdBQUcsQ0FBQyxNQUFNLEdBQUcsYUFBYSxLQUFLLE1BQU07QUFDdEgsV0FBTyxZQUFZLE9BQU8sTUFBUztBQUFBLEVBQ3BDLENBQUM7QUFFRCxPQUFLLHdDQUF3QyxZQUFZO0FBQ3hELFVBQU0sY0FBYyxzQkFBc0I7QUFBQSxNQUN6QyxrQ0FBa0MsTUFBTSxRQUFRLFFBQVEsWUFBWTtBQUFBLE1BQ3BFLGFBQWEsQ0FBQyxhQUFhLFdBQVc7QUFDckMsWUFBSSxVQUFVLE9BQU8sV0FBVyxLQUFLLE9BQU8sQ0FBQyxNQUFNLFFBQVE7QUFDMUQsaUJBQU8sUUFBUSxRQUFRLENBQUMsRUFBRSxRQUFRLENBQUMsTUFBTSxHQUFHLGFBQWEsY0FBYyxDQUFDLENBQUM7QUFBQSxRQUMxRTtBQUNBLGVBQU8sUUFBUSxRQUFRLENBQUMsQ0FBQztBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxRQUFRLE1BQU0sd0JBQXdCLFVBQVUsQ0FBQywwQkFBMEIsR0FBRyxDQUFDLE1BQU0sR0FBRyxhQUFhLEtBQUssTUFBTTtBQUN0SCxXQUFPLFlBQVksT0FBTyxhQUFhO0FBQUEsRUFDeEMsQ0FBQztBQUVELE9BQUssbUVBQW1FLFlBQVk7QUFDbkYsVUFBTSxjQUFjLHNCQUFzQjtBQUFBLE1BQ3pDLGtDQUFrQyxNQUFNLFFBQVEsUUFBUSxZQUFZO0FBQUEsTUFDcEUsYUFBYSxDQUFDLGFBQWEsV0FBVztBQUNyQyxZQUFJLFdBQVcsUUFBVztBQUV6QixpQkFBTyxRQUFRLFFBQVEsQ0FBQyxDQUFDO0FBQUEsUUFDMUI7QUFFQSxlQUFPLFFBQVEsUUFBUTtBQUFBLFVBQ3RCLEVBQUUsUUFBUSxDQUFDLFFBQVEsU0FBUyxPQUFPLEdBQUcsYUFBYSxhQUFhO0FBQUEsVUFDaEUsRUFBRSxRQUFRLENBQUMsUUFBUSxPQUFPLEdBQUcsYUFBYSxlQUFlO0FBQUEsUUFDMUQsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFFBQVEsTUFBTSx3QkFBd0IsVUFBVSxDQUFDLDBCQUEwQixHQUFHLENBQUMsTUFBTSxHQUFHLGFBQWEsS0FBSyxNQUFNO0FBQ3RILFdBQU8sWUFBWSxPQUFPLGNBQWM7QUFBQSxFQUN6QyxDQUFDO0FBRUQsT0FBSyx5REFBeUQsWUFBWTtBQUN6RSxVQUFNLGNBQWMsc0JBQXNCO0FBQUEsTUFDekMsa0NBQWtDLE1BQU0sUUFBUSxRQUFRLFlBQVk7QUFBQSxNQUNwRSxhQUFhLENBQUMsYUFBYSxXQUFXO0FBQ3JDLFlBQUksV0FBVyxRQUFXO0FBQ3pCLGlCQUFPLFFBQVEsUUFBUSxDQUFDLENBQUM7QUFBQSxRQUMxQjtBQUVBLGVBQU8sUUFBUSxRQUFRO0FBQUEsVUFDdEIsRUFBRSxRQUFRLENBQUMsT0FBTyxHQUFHLGFBQWEsY0FBYztBQUFBLFFBQ2pELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxRQUFRLE1BQU0sd0JBQXdCLFVBQVUsQ0FBQywwQkFBMEIsR0FBRyxDQUFDLE1BQU0sR0FBRyxhQUFhLEtBQUssTUFBTTtBQUN0SCxXQUFPLFlBQVksT0FBTyxNQUFTO0FBQUEsRUFDcEMsQ0FBQztBQUVELE9BQUssaURBQWlELFlBQVk7QUFDakUsVUFBTSxRQUFrQixDQUFDO0FBQ3pCLFVBQU0sY0FBYyxzQkFBc0I7QUFBQSxNQUN6QyxrQ0FBa0MsQ0FBQyxjQUFjO0FBQ2hELGNBQU0sS0FBSyxVQUFVLFNBQVMsQ0FBQztBQUMvQixZQUFJLFVBQVUsU0FBUyxNQUFNLDhCQUE4QjtBQUMxRCxpQkFBTyxRQUFRLFFBQVEsWUFBWTtBQUFBLFFBQ3BDO0FBQ0EsZUFBTyxRQUFRLFFBQVEsTUFBUztBQUFBLE1BQ2pDO0FBQUEsTUFDQSxhQUFhLE1BQU0sUUFBUSxRQUFRLENBQUMsRUFBRSxRQUFRLENBQUMsTUFBTSxHQUFHLGFBQWEsZ0JBQWdCLENBQUMsQ0FBQztBQUFBLElBQ3hGLENBQUM7QUFDRCxVQUFNLFFBQVEsTUFBTTtBQUFBLE1BQ25CO0FBQUEsTUFDQSxDQUFDLDZCQUE2QiwyQkFBMkI7QUFBQSxNQUN6RCxDQUFDLE1BQU07QUFBQSxNQUFHO0FBQUEsTUFBYTtBQUFBLE1BQUs7QUFBQSxJQUM3QjtBQUNBLFdBQU8sWUFBWSxPQUFPLGVBQWU7QUFDekMsV0FBTyxZQUFZLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDbkMsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLDJCQUEyQixNQUFNO0FBRXRDLDBDQUF3QztBQUV4QyxPQUFLLDBEQUEwRCxZQUFZO0FBQzFFLFVBQU0sUUFBUSxJQUFJLHdCQUF3QjtBQUMxQyxRQUFJLG9CQUFvQjtBQUN4QixVQUFNLGVBQWUsWUFBWTtBQUFFO0FBQUEsSUFBcUI7QUFFeEQsVUFBTSxVQUFVO0FBQUEsTUFDZixNQUFNLE1BQU0sYUFBYSwyQkFBMkIsQ0FBQyxNQUFNLEdBQUcsUUFBUSxZQUFZO0FBQUEsTUFDbEYsTUFBTSxNQUFNLGFBQWEsMkJBQTJCLENBQUMsTUFBTSxHQUFHLFFBQVEsWUFBWTtBQUFBLElBQ25GO0FBRUEsV0FBTyxnQkFBZ0IsRUFBRSxTQUFTLGtCQUFrQixHQUFHLEVBQUUsU0FBUyxDQUFDLE1BQU0sS0FBSyxHQUFHLG1CQUFtQixFQUFFLENBQUM7QUFBQSxFQUN4RyxDQUFDO0FBRUQsT0FBSyx5REFBeUQsWUFBWTtBQUN6RSxVQUFNLFFBQVEsSUFBSSx3QkFBd0I7QUFDMUMsVUFBTSxpQkFBaUIsSUFBSSxnQkFBc0I7QUFDakQsUUFBSSxvQkFBb0I7QUFDeEIsVUFBTSxlQUFlLFlBQVk7QUFDaEM7QUFDQSxZQUFNLGVBQWU7QUFBQSxJQUN0QjtBQUNBLFFBQUksZ0JBQWdCO0FBRXBCLFVBQU0sUUFBUSxNQUFNLGFBQWEsMkJBQTJCLENBQUMsTUFBTSxHQUFHLFFBQVEsWUFBWTtBQUMxRixVQUFNLFNBQVMsTUFBTSxhQUFhLDJCQUEyQixDQUFDLE1BQU0sR0FBRyxRQUFRLFlBQVksRUFBRSxLQUFLLFlBQVU7QUFDM0csc0JBQWdCO0FBQ2hCLGFBQU87QUFBQSxJQUNSLENBQUM7QUFDRCxVQUFNLFFBQVEsUUFBUTtBQUN0QixVQUFNLG1CQUFtQixFQUFFLG1CQUFtQixjQUFjO0FBQzVELG1CQUFlLFNBQVM7QUFFeEIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsU0FBUyxNQUFNLFFBQVEsSUFBSSxDQUFDLE9BQU8sTUFBTSxDQUFDO0FBQUEsTUFDMUM7QUFBQSxJQUNELEdBQUc7QUFBQSxNQUNGLGtCQUFrQixFQUFFLG1CQUFtQixHQUFHLGVBQWUsTUFBTTtBQUFBLE1BQy9ELFNBQVMsQ0FBQyxNQUFNLEtBQUs7QUFBQSxNQUNyQixtQkFBbUI7QUFBQSxJQUNwQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxvRUFBb0UsWUFBWTtBQUNwRixVQUFNLFFBQVEsSUFBSSx3QkFBd0I7QUFDMUMsVUFBTSxzQkFBc0IsSUFBSSxnQkFBc0I7QUFDdEQsVUFBTSxRQUFrQixDQUFDO0FBRXpCLFVBQU0sUUFBUSxNQUFNLGFBQWEsMkJBQTJCLENBQUMsTUFBTSxHQUFHLFFBQVEsWUFBWTtBQUN6RixZQUFNLEtBQUssTUFBTTtBQUNqQixZQUFNLG9CQUFvQjtBQUFBLElBQzNCLENBQUM7QUFDRCxVQUFNLFNBQVMsTUFBTSxhQUFhLDJCQUEyQixDQUFDLE1BQU0sR0FBRyxRQUFRLFlBQVk7QUFDMUYsWUFBTSxLQUFLLE1BQU07QUFBQSxJQUNsQixDQUFDO0FBQ0QsVUFBTSxRQUFRLFFBQVE7QUFDdEIsVUFBTSxtQkFBbUIsQ0FBQyxHQUFHLEtBQUs7QUFDbEMsd0JBQW9CLFNBQVM7QUFDN0IsVUFBTSxRQUFRLElBQUksQ0FBQyxPQUFPLE1BQU0sQ0FBQztBQUVqQyxXQUFPLGdCQUFnQixFQUFFLGtCQUFrQixNQUFNLEdBQUcsRUFBRSxrQkFBa0IsQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDLFFBQVEsTUFBTSxFQUFFLENBQUM7QUFBQSxFQUM1RyxDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsWUFBWTtBQUNoRixVQUFNLFFBQVEsSUFBSSx3QkFBd0I7QUFDMUMsVUFBTSxzQkFBc0IsSUFBSSxnQkFBc0I7QUFDdEQsVUFBTSxRQUFrQixDQUFDO0FBQ3pCLFVBQU0sTUFBTSxhQUFhLDJCQUEyQixDQUFDLE1BQU0sR0FBRyxRQUFRLFlBQVk7QUFDakYsWUFBTSxLQUFLLE1BQU07QUFBQSxJQUNsQixDQUFDO0FBQ0QsVUFBTSxRQUFRLE1BQU0sYUFBYSwyQkFBMkIsQ0FBQyxNQUFNLEdBQUcsUUFBUSxZQUFZO0FBQ3pGLFlBQU0sS0FBSyxNQUFNO0FBQ2pCLFlBQU0sb0JBQW9CO0FBQUEsSUFDM0IsQ0FBQztBQUNELFFBQUksZUFBZTtBQUNuQixVQUFNLFFBQVEsTUFBTSxhQUFhLDJCQUEyQixDQUFDLE1BQU0sR0FBRyxRQUFRLFlBQVk7QUFDekYsWUFBTSxLQUFLLE1BQU07QUFBQSxJQUNsQixDQUFDLEVBQUUsS0FBSyxZQUFVO0FBQ2pCLHFCQUFlO0FBQ2YsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUNELFVBQU0sUUFBUSxRQUFRO0FBQ3RCLFVBQU0sbUJBQW1CLEVBQUUsT0FBTyxDQUFDLEdBQUcsS0FBSyxHQUFHLGFBQWE7QUFDM0Qsd0JBQW9CLFNBQVM7QUFFN0IsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsU0FBUyxNQUFNLFFBQVEsSUFBSSxDQUFDLE9BQU8sS0FBSyxDQUFDO0FBQUEsTUFDekM7QUFBQSxJQUNELEdBQUc7QUFBQSxNQUNGLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxRQUFRLE1BQU0sR0FBRyxjQUFjLE1BQU07QUFBQSxNQUNqRSxTQUFTLENBQUMsTUFBTSxJQUFJO0FBQUEsTUFDcEIsT0FBTyxDQUFDLFFBQVEsUUFBUSxNQUFNO0FBQUEsSUFDL0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0VBQW9FLFlBQVk7QUFDcEYsVUFBTSxRQUFRLElBQUksd0JBQXdCO0FBQzFDLFVBQU0sc0JBQXNCLElBQUksZ0JBQXNCO0FBQ3RELFVBQU0sUUFBa0IsQ0FBQztBQUN6QixVQUFNLFFBQVEsTUFBTSxhQUFhLDJCQUEyQixDQUFDLE1BQU0sR0FBRyxRQUFRLFlBQVk7QUFDekYsWUFBTSxLQUFLLE1BQU07QUFDakIsWUFBTSxvQkFBb0I7QUFBQSxJQUMzQixDQUFDO0FBQ0QsVUFBTSxTQUFTLE1BQU0sYUFBYSwyQkFBMkIsQ0FBQyxNQUFNLEdBQUcsUUFBUSxZQUFZO0FBQzFGLFlBQU0sS0FBSyxNQUFNO0FBQUEsSUFDbEIsQ0FBQztBQUNELFVBQU0sTUFBTTtBQUNaLFVBQU0sTUFBTSxhQUFhLDJCQUEyQixDQUFDLE1BQU0sR0FBRyxRQUFRLFlBQVk7QUFDakYsWUFBTSxLQUFLLE1BQU07QUFBQSxJQUNsQixDQUFDO0FBQ0Qsd0JBQW9CLFNBQVM7QUFFN0IsVUFBTSxPQUFPLFFBQVEsS0FBSztBQUMxQixVQUFNLE9BQU8sUUFBUSxNQUFNO0FBQzNCLFdBQU8sZ0JBQWdCLE9BQU8sQ0FBQyxRQUFRLE1BQU0sQ0FBQztBQUFBLEVBQy9DLENBQUM7QUFFRCxPQUFLLG1FQUFtRSxZQUFZO0FBQ25GLFVBQU0sUUFBUSxJQUFJLHdCQUF3QjtBQUMxQyxVQUFNLDBCQUEwQixJQUFJLGdCQUFzQjtBQUMxRCxRQUFJLGlCQUFpQjtBQUNyQixVQUFNLFlBQVksTUFBTSxhQUFhLDZCQUE2QixDQUFDLE1BQU0sR0FBRyxlQUFlLFlBQVk7QUFDdEc7QUFDQSxZQUFNLHdCQUF3QjtBQUFBLElBQy9CLENBQUM7QUFDRCxVQUFNLE1BQU0sMkJBQTJCLENBQUMsTUFBTSxDQUFDO0FBQy9DLDRCQUF3QixTQUFTO0FBRWpDLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsUUFBUSxNQUFNO0FBQUEsTUFDZDtBQUFBLE1BQ0EsVUFBVSxNQUFNLE1BQU0sYUFBYSw2QkFBNkIsQ0FBQyxNQUFNLEdBQUcsZUFBZSxZQUFZO0FBQ3BHO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixHQUFHO0FBQUEsTUFDRixRQUFRO0FBQUEsTUFDUixnQkFBZ0I7QUFBQSxNQUNoQixVQUFVO0FBQUEsSUFDWCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzRUFBc0UsWUFBWTtBQUN0RixVQUFNLFFBQVEsSUFBSSx3QkFBd0I7QUFDMUMsUUFBSSxvQkFBb0I7QUFDeEIsVUFBTSxlQUFlLFlBQVk7QUFBRTtBQUFBLElBQXFCO0FBRXhELFVBQU0sUUFBUSxJQUFJO0FBQUEsTUFDakIsTUFBTSxhQUFhLDJCQUEyQixDQUFDLE1BQU0sR0FBRyxjQUFjLFlBQVk7QUFBQSxNQUNsRixNQUFNLGFBQWEsMkJBQTJCLENBQUMsT0FBTyxHQUFHLGVBQWUsWUFBWTtBQUFBLE1BQ3BGLE1BQU0sYUFBYSw2QkFBNkIsQ0FBQyxNQUFNLEdBQUcsY0FBYyxZQUFZO0FBQUEsSUFDckYsQ0FBQztBQUVELFdBQU8sWUFBWSxtQkFBbUIsQ0FBQztBQUFBLEVBQ3hDLENBQUM7QUFFRCxPQUFLLHVDQUF1QyxZQUFZO0FBQ3ZELFVBQU0sUUFBUSxJQUFJLHdCQUF3QjtBQUMxQyxRQUFJLG9CQUFvQjtBQUN4QixVQUFNLE9BQU8sUUFBUSxNQUFNLGFBQWEsMkJBQTJCLENBQUMsTUFBTSxHQUFHLFFBQVEsWUFBWTtBQUNoRztBQUNBLFlBQU0sSUFBSSxNQUFNLFFBQVE7QUFBQSxJQUN6QixDQUFDLEdBQUcsUUFBUTtBQUNaLFVBQU0sTUFBTSxhQUFhLDJCQUEyQixDQUFDLE1BQU0sR0FBRyxRQUFRLFlBQVk7QUFDakY7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPLFlBQVksbUJBQW1CLENBQUM7QUFBQSxFQUN4QyxDQUFDO0FBRUQsT0FBSyx1Q0FBdUMsWUFBWTtBQUN2RCxVQUFNLFFBQVEsSUFBSSx3QkFBd0I7QUFDMUMsUUFBSSxvQkFBb0I7QUFDeEIsVUFBTSxlQUFlLFlBQVk7QUFBRTtBQUFBLElBQXFCO0FBQ3hELFVBQU0sTUFBTSxhQUFhLDJCQUEyQixDQUFDLE1BQU0sR0FBRyxRQUFRLFlBQVk7QUFDbEYsVUFBTSxNQUFNLGFBQWEsNkJBQTZCLENBQUMsTUFBTSxHQUFHLFFBQVEsWUFBWTtBQUNwRixVQUFNLE1BQU07QUFDWixVQUFNLE1BQU0sYUFBYSwyQkFBMkIsQ0FBQyxNQUFNLEdBQUcsUUFBUSxZQUFZO0FBQ2xGLFVBQU0sTUFBTSxhQUFhLDZCQUE2QixDQUFDLE1BQU0sR0FBRyxRQUFRLFlBQVk7QUFFcEYsV0FBTyxZQUFZLG1CQUFtQixDQUFDO0FBQUEsRUFDeEMsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLGtDQUFrQyxNQUFNO0FBRTdDLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsT0FBSyxnRkFBZ0YsWUFBWTtBQUNoRyxVQUFNLGtCQUFxRCxDQUFDO0FBQzVELFVBQU0sY0FBYyxzQkFBc0I7QUFBQSxNQUN6QyxrQ0FBa0MsTUFBTSxRQUFRLFFBQVEsWUFBWTtBQUFBLE1BQ3BFLGFBQWEsQ0FBQyxhQUFhLFdBQVc7QUFDckMsd0JBQWdCLEtBQUssTUFBTTtBQUMzQixlQUFPLFFBQVEsUUFBUSxDQUFDLENBQUM7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sdUJBQXVCLFlBQVksSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQzNFLHlCQUFxQixLQUFLLHdCQUF3QixXQUFXO0FBQzdELHlCQUFxQixLQUFLLGlDQUFpQyxDQUFDLENBQUM7QUFDN0QseUJBQXFCLEtBQUssMkJBQTJCO0FBQUEsTUFDcEQsc0JBQXNCLE1BQU07QUFBQSxJQUM3QixDQUFDO0FBQ0QseUJBQXFCLEtBQUssZ0NBQWdDLENBQUMsQ0FBQztBQUM1RCx5QkFBcUIsS0FBSyw4Q0FBOEMsQ0FBQyxDQUFDO0FBQzFFLHlCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFFM0QsVUFBTSxTQUFTLE1BQU0scUJBQXFCLGVBQWUsZ0NBQWdDO0FBQUEsTUFDeEYsVUFBVTtBQUFBLE1BQ1YsdUJBQXVCLENBQUMsMEJBQTBCO0FBQUEsTUFDbEQsa0JBQWtCLENBQUMsUUFBUSxZQUFZLGVBQWU7QUFBQSxJQUN2RCxHQUFHO0FBQUEsTUFDRixrQkFBa0I7QUFBQSxNQUNsQixXQUFXO0FBQUEsTUFDWCxhQUFhO0FBQUEsTUFDYixlQUFlO0FBQUEsTUFDZixjQUFjO0FBQUEsTUFDZCxRQUFRLENBQUMsZUFBZTtBQUFBLE1BQ3hCLGNBQWMsWUFBWTtBQUFBLE1BQUU7QUFBQSxJQUM3QixDQUFDO0FBRUQsV0FBTyxnQkFBZ0IsRUFBRSxRQUFRLGdCQUFnQixHQUFHO0FBQUEsTUFDbkQsUUFBUTtBQUFBLE1BQ1IsaUJBQWlCLENBQUMsQ0FBQyxlQUFlLENBQUM7QUFBQSxJQUNwQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxvRUFBb0UsWUFBWTtBQUNwRixVQUFNLGtCQUF5QyxDQUFDO0FBQ2hELFVBQU0sY0FBYyxzQkFBc0I7QUFBQSxNQUN6QyxrQ0FBa0MsTUFBTSxRQUFRLFFBQVEsWUFBWTtBQUFBLE1BQ3BFLGFBQWEsQ0FBQyxhQUFhLFdBQVc7QUFDckMsd0JBQWdCLEtBQUssVUFBVSxDQUFDLENBQUM7QUFDakMsZUFBTyxRQUFRLFFBQVEsQ0FBQyxDQUFDO0FBQUEsTUFDMUI7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLHVCQUF1QixZQUFZLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUMzRSx5QkFBcUIsS0FBSyx3QkFBd0IsV0FBVztBQUM3RCx5QkFBcUIsS0FBSyxpQ0FBaUMsQ0FBQyxDQUFDO0FBQzdELHlCQUFxQixLQUFLLDJCQUEyQjtBQUFBLE1BQ3BELHNCQUFzQixNQUFNO0FBQUEsSUFDN0IsQ0FBQztBQUNELHlCQUFxQixLQUFLLGdDQUFnQyxDQUFDLENBQUM7QUFDNUQseUJBQXFCLEtBQUssOENBQThDLENBQUMsQ0FBQztBQUMxRSx5QkFBcUIsS0FBSyxhQUFhLElBQUksZUFBZSxDQUFDO0FBRTNELFVBQU0sU0FBUyxNQUFNLHFCQUFxQixlQUFlLGdDQUFnQztBQUFBLE1BQ3hGLFVBQVU7QUFBQSxNQUNWLGVBQWU7QUFBQSxNQUNmLHVCQUF1QixDQUFDLHVCQUF1QjtBQUFBLE1BQy9DLGtCQUFrQixDQUFDLHNCQUFzQixZQUFZO0FBQUEsSUFDdEQsR0FBRztBQUFBLE1BQ0Ysa0JBQWtCO0FBQUEsTUFDbEIsV0FBVztBQUFBLE1BQ1gsYUFBYTtBQUFBLE1BQ2IsZUFBZTtBQUFBLE1BQ2YsY0FBYztBQUFBLE1BQ2QsUUFBUSxDQUFDO0FBQUEsTUFDVCxjQUFjLFlBQVk7QUFBQSxNQUFFO0FBQUEsSUFDN0IsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLEVBQUUsUUFBUSxnQkFBZ0IsR0FBRztBQUFBLE1BQ25ELFFBQVE7QUFBQSxNQUNSLGlCQUFpQixDQUFDLENBQUMsc0JBQXNCLFlBQVksQ0FBQztBQUFBLElBQ3ZELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdEQUF3RCxZQUFZO0FBQ3hFLFVBQU0sa0JBQXlDLENBQUM7QUFDaEQsVUFBTSxjQUFjLHNCQUFzQjtBQUFBLE1BQ3pDLGtDQUFrQyxNQUFNLFFBQVEsUUFBUSxZQUFZO0FBQUEsTUFDcEUsYUFBYSxDQUFDLGFBQWEsV0FBVztBQUNyQyx3QkFBZ0IsS0FBSyxVQUFVLENBQUMsQ0FBQztBQUNqQyxlQUFPLFFBQVEsUUFBUSxDQUFDLENBQUM7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sdUJBQXVCLFlBQVksSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQzNFLHlCQUFxQixLQUFLLHdCQUF3QixXQUFXO0FBQzdELHlCQUFxQixLQUFLLGlDQUFpQyxDQUFDLENBQUM7QUFDN0QseUJBQXFCLEtBQUssMkJBQTJCO0FBQUEsTUFDcEQsc0JBQXNCLE1BQU07QUFBQSxJQUM3QixDQUFDO0FBQ0QseUJBQXFCLEtBQUssZ0NBQWdDLENBQUMsQ0FBQztBQUM1RCx5QkFBcUIsS0FBSyw4Q0FBOEMsQ0FBQyxDQUFDO0FBQzFFLHlCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFFM0QsVUFBTSxTQUFTLE1BQU0scUJBQXFCLGVBQWUsZ0NBQWdDO0FBQUEsTUFDeEYsVUFBVTtBQUFBLE1BQ1YsZUFBZTtBQUFBLE1BQ2YsdUJBQXVCLENBQUMsZ0NBQWdDO0FBQUEsTUFDeEQsa0JBQWtCLENBQUMsUUFBUSxlQUFlO0FBQUEsSUFDM0MsR0FBRztBQUFBLE1BQ0Ysa0JBQWtCO0FBQUEsTUFDbEIsV0FBVztBQUFBLE1BQ1gsYUFBYTtBQUFBLE1BQ2IsZUFBZTtBQUFBLE1BQ2YsY0FBYztBQUFBLE1BQ2QsUUFBUSxDQUFDO0FBQUEsTUFDVCxjQUFjLFlBQVk7QUFBQSxNQUFFO0FBQUEsSUFDN0IsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLEVBQUUsUUFBUSxnQkFBZ0IsR0FBRztBQUFBLE1BQ25ELFFBQVE7QUFBQSxNQUNSLGlCQUFpQixDQUFDLENBQUMsQ0FBQztBQUFBLElBQ3JCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGdGQUFnRixZQUFZO0FBQ2hHLFVBQU0sV0FBcUIsQ0FBQztBQUM1QixVQUFNLG9CQUE4QixDQUFDO0FBQ3JDLFVBQU0sbUJBQTZCLENBQUM7QUFDcEMsVUFBTSxhQUFhLElBQUksY0FBYyxlQUFlO0FBQUEsTUFDMUMsS0FBSyxTQUF1QjtBQUNwQyxpQkFBUyxLQUFLLE9BQU87QUFBQSxNQUN0QjtBQUFBLElBQ0QsRUFBRTtBQUNGLFVBQU0sdUJBQXVCLFlBQVksSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQzNFLHlCQUFxQixLQUFLLHdCQUF3QixzQkFBc0I7QUFBQSxNQUN2RSxxQ0FBcUMsT0FBTSx3QkFBdUI7QUFDakUsMEJBQWtCLEtBQUssb0JBQW9CLFNBQVMsSUFBSSxDQUFDO0FBQ3pELGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRix5QkFBcUIsS0FBSyxpQ0FBaUMsQ0FBQyxDQUFDO0FBQzdELHlCQUFxQixLQUFLLDJCQUEyQjtBQUFBLE1BQ3BELHNCQUFzQixNQUFNO0FBQUEsSUFDN0IsQ0FBQztBQUNELHlCQUFxQixLQUFLLGdDQUFnQyxDQUFDLENBQUM7QUFDNUQseUJBQXFCLEtBQUssOENBQThDO0FBQUEsTUFDdkUsdUJBQXVCLE1BQU0sUUFBUSxRQUFRLE1BQVM7QUFBQSxJQUN2RCxDQUFDO0FBQ0QseUJBQXFCLEtBQUssYUFBYSxVQUFVO0FBRWpELFVBQU0sU0FBUyxNQUFNLHFCQUFxQixlQUFlLGdDQUFnQztBQUFBLE1BQ3hGLFVBQVU7QUFBQSxNQUNWLHVCQUF1QixDQUFDLDBCQUEwQjtBQUFBLElBQ25ELEdBQUc7QUFBQSxNQUNGLGtCQUFrQjtBQUFBLE1BQ2xCLFdBQVc7QUFBQSxNQUNYLGFBQWE7QUFBQSxNQUNiLGVBQWU7QUFBQSxNQUNmLGNBQWM7QUFBQSxNQUNkLFFBQVEsQ0FBQztBQUFBLE1BQ1Qsb0NBQW9DLE9BQU0sd0JBQXVCO0FBQ2hFLHlCQUFpQixLQUFLLG1CQUFtQjtBQUN6QyxjQUFNLElBQUksTUFBTSw2QkFBNkI7QUFBQSxNQUM5QztBQUFBLE1BQ0EsY0FBYyxZQUFZO0FBQUEsTUFBRTtBQUFBLElBQzdCLENBQUM7QUFFRCxXQUFPLGdCQUFnQixFQUFFLFFBQVEsVUFBVSxrQkFBa0Isa0JBQWtCLEdBQUc7QUFBQSxNQUNqRixRQUFRO0FBQUEsTUFDUixVQUFVLENBQUM7QUFBQSxNQUNYLGtCQUFrQixDQUFDO0FBQUEsTUFDbkIsbUJBQW1CLENBQUM7QUFBQSxJQUNyQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpRkFBaUYsWUFBWTtBQUNqRyxVQUFNLG9CQUFvQjtBQUMxQixVQUFNLG9CQUEwRixDQUFDO0FBQ2pHLFVBQU0sa0JBQXFELENBQUM7QUFDNUQsVUFBTSx1QkFBMEYsQ0FBQztBQUNqRyxVQUFNLGNBQWMsc0JBQXNCO0FBQUEsTUFDekMscUNBQXFDLE9BQU8sc0JBQXNCLFdBQVcsV0FBVyxVQUFVLGlCQUFpQjtBQUNsSCwwQkFBa0IsS0FBSyxFQUFFLFVBQVUsYUFBYSxDQUFDO0FBQ2pELGVBQU8sRUFBRSxJQUFJLGtCQUFrQjtBQUFBLE1BQ2hDO0FBQUEsTUFDQSxhQUFhLENBQUMsYUFBYSxTQUFTLFlBQVk7QUFDL0Msd0JBQWdCLEtBQUssRUFBRSxRQUFRLFFBQVEsT0FBTyxDQUFDO0FBQy9DLGVBQU8sUUFBUSxRQUFRLENBQUM7QUFBQSxVQUN2QixJQUFJO0FBQUEsVUFDSixRQUFRLENBQUM7QUFBQSxVQUNULGFBQWE7QUFBQSxVQUNiLFNBQVMsRUFBRSxJQUFJLGNBQWMsT0FBTyxpQkFBaUI7QUFBQSxRQUN0RCxDQUFDLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSx1QkFBdUIsWUFBWSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDM0UseUJBQXFCLEtBQUssd0JBQXdCLFdBQVc7QUFDN0QseUJBQXFCLEtBQUssaUNBQWlDO0FBQUEsTUFDMUQsdUJBQXVCLE1BQU07QUFBQSxJQUM5QixDQUFDO0FBQ0QseUJBQXFCLEtBQUssMkJBQTJCO0FBQUEsTUFDcEQsc0JBQXNCLE1BQU07QUFBQSxJQUM3QixDQUFDO0FBQ0QseUJBQXFCLEtBQUssZ0NBQWdDO0FBQUEsTUFDekQsaUJBQWlCLE1BQU07QUFBQSxNQUFFO0FBQUEsSUFDMUIsQ0FBQztBQUNELHlCQUFxQixLQUFLLDhDQUE4QztBQUFBLE1BQ3ZFLHVCQUF1QixNQUFNLFFBQVEsUUFBUSxFQUFFLFVBQVUsb0JBQW9CLGNBQWMsdUJBQXVCLENBQUM7QUFBQSxJQUNwSCxDQUFDO0FBQ0QseUJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUUzRCxVQUFNLFNBQVMsTUFBTSxxQkFBcUIsZUFBZSxnQ0FBZ0M7QUFBQSxNQUN4RixVQUFVO0FBQUEsTUFDVix1QkFBdUIsQ0FBQyx3QkFBd0I7QUFBQSxJQUNqRCxHQUFHO0FBQUEsTUFDRixrQkFBa0I7QUFBQSxNQUNsQixXQUFXO0FBQUEsTUFDWCxhQUFhO0FBQUEsTUFDYixlQUFlO0FBQUEsTUFDZixjQUFjO0FBQUEsTUFDZCxRQUFRLENBQUM7QUFBQSxNQUNULG9DQUFvQyxPQUFNLHlCQUF3QjtBQUFBLFFBQ2pFLFVBQVU7QUFBQSxVQUNULFFBQVE7QUFBQSxVQUNSLDBCQUEwQixDQUFDLE1BQU07QUFBQSxRQUNsQztBQUFBLFFBQ0EsY0FBYyxHQUFHLG1CQUFtQjtBQUFBLFFBQ3BDLFFBQVEsQ0FBQztBQUFBLE1BQ1Y7QUFBQSxNQUNBLGNBQWMsT0FBTSxZQUFXO0FBQzlCLDZCQUFxQixLQUFLLE9BQU87QUFBQSxNQUNsQztBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLEVBQUUsUUFBUSxtQkFBbUIsaUJBQWlCLHFCQUFxQixHQUFHO0FBQUEsTUFDNUYsUUFBUTtBQUFBLE1BQ1IsbUJBQW1CLENBQUMsRUFBRSxVQUFVLG9CQUFvQixjQUFjLHVCQUF1QixDQUFDO0FBQUEsTUFDMUYsaUJBQWlCLENBQUMsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLE1BQ2xDLHNCQUFzQixDQUFDO0FBQUEsUUFDdEIsVUFBVTtBQUFBLFFBQ1YsUUFBUSxDQUFDO0FBQUEsUUFDVCxPQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywyRUFBMkUsWUFBWTtBQUMzRixVQUFNLG9CQUFvQjtBQUMxQixVQUFNLHNCQUFzQixJQUFJLGdCQUFzQjtBQUN0RCxVQUFNLG1CQUFtQixJQUFJLGdCQUFzQjtBQUNuRCxVQUFNLG9CQUE4QixDQUFDO0FBQ3JDLFVBQU0sa0JBQTRCLENBQUM7QUFDbkMsVUFBTSx1QkFBaUMsQ0FBQztBQUN4QyxRQUFJO0FBQ0osUUFBSSxpQkFBaUI7QUFDckIsVUFBTSxjQUFjLHNCQUFzQjtBQUFBLE1BQ3pDLGlDQUFpQyxnQkFBYyxlQUFlLHFCQUFxQjtBQUFBLE1BQ25GLHFDQUFxQyxPQUFPLHNCQUFzQixXQUFXLFdBQVcsYUFBYTtBQUNwRyx1QkFBZTtBQUNmLHlCQUFpQjtBQUNqQiwwQkFBa0IsS0FBSyxZQUFZLEVBQUU7QUFDckMsZUFBTyxFQUFFLElBQUksa0JBQWtCO0FBQUEsTUFDaEM7QUFBQSxNQUNBLGtDQUFrQyxNQUFNO0FBQ3ZDLHlCQUFpQjtBQUFBLE1BQ2xCO0FBQUEsTUFDQSxhQUFhLFlBQVk7QUFDeEIsY0FBTSxXQUFXLGdCQUFnQjtBQUNqQyx3QkFBZ0IsS0FBSyxRQUFRO0FBQzdCLFlBQUksYUFBYSxnQkFBZ0I7QUFDaEMsOEJBQW9CLFNBQVM7QUFDN0IsZ0JBQU0saUJBQWlCO0FBQUEsUUFDeEI7QUFDQSxlQUFPLENBQUM7QUFBQSxVQUNQLElBQUksR0FBRyxRQUFRO0FBQUEsVUFDZixRQUFRLENBQUM7QUFBQSxVQUNULGFBQWEsR0FBRyxRQUFRO0FBQUEsVUFDeEIsU0FBUyxFQUFFLElBQUksY0FBYyxPQUFPLGNBQWM7QUFBQSxRQUNuRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sdUJBQXVCLFlBQVksSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQzNFLHlCQUFxQixLQUFLLHdCQUF3QixXQUFXO0FBQzdELHlCQUFxQixLQUFLLGlDQUFpQztBQUFBLE1BQzFELHVCQUF1QixNQUFNO0FBQUEsSUFDOUIsQ0FBQztBQUNELHlCQUFxQixLQUFLLDJCQUEyQjtBQUFBLE1BQ3BELHNCQUFzQixNQUFNO0FBQUEsSUFDN0IsQ0FBQztBQUNELHlCQUFxQixLQUFLLGdDQUFnQztBQUFBLE1BQ3pELGlCQUFpQixNQUFNO0FBQUEsTUFBRTtBQUFBLElBQzFCLENBQUM7QUFDRCx5QkFBcUIsS0FBSyw4Q0FBOEM7QUFBQSxNQUN2RSx1QkFBdUIsTUFBTSxRQUFRLFFBQVEsZUFBZSxFQUFFLFVBQVUsYUFBYSxJQUFJLE1BQVM7QUFBQSxNQUNsRyx1QkFBdUIsWUFBWTtBQUNsQyx1QkFBZTtBQUFBLE1BQ2hCO0FBQUEsSUFDRCxDQUFDO0FBQ0QseUJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUMzRCxVQUFNLG9CQUFvQjtBQUFBLE1BQ3pCLFVBQVU7QUFBQSxNQUNWLHVCQUF1QixDQUFDLHlCQUF5QjtBQUFBLElBQ2xEO0FBQ0EsVUFBTSxVQUFVLENBQUMsY0FBc0I7QUFBQSxNQUN0QyxrQkFBa0I7QUFBQSxNQUNsQixXQUFXO0FBQUEsTUFDWCxhQUFhO0FBQUEsTUFDYixlQUFlO0FBQUEsTUFDZixjQUFjO0FBQUEsTUFDZCxhQUFhLEVBQUUsU0FBUztBQUFBLE1BQ3hCLFFBQVEsQ0FBQztBQUFBLE1BQ1Qsb0NBQW9DLE9BQU8seUJBQWlDO0FBQUEsUUFDM0UsVUFBVTtBQUFBLFVBQ1QsUUFBUTtBQUFBLFVBQ1IsMEJBQTBCLENBQUMsTUFBTTtBQUFBLFFBQ2xDO0FBQUEsUUFDQSxjQUFjLEdBQUcsbUJBQW1CO0FBQUEsUUFDcEMsUUFBUSxDQUFDO0FBQUEsTUFDVjtBQUFBLE1BQ0EsY0FBYyxPQUFPLFlBQStCO0FBQ25ELDZCQUFxQixLQUFLLFFBQVEsS0FBSztBQUFBLE1BQ3hDO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxxQkFBcUIsZUFBZSxnQ0FBZ0MsbUJBQW1CLFFBQVEsY0FBYyxDQUFDO0FBQzVILFVBQU0sU0FBUyxxQkFBcUIsZUFBZSxnQ0FBZ0MsbUJBQW1CLFFBQVEsZUFBZSxDQUFDO0FBQzlILFVBQU0sb0JBQW9CO0FBQzFCLFVBQU0sbUJBQW1CO0FBQUEsTUFDeEIsbUJBQW1CLENBQUMsR0FBRyxpQkFBaUI7QUFBQSxNQUN4QyxpQkFBaUIsQ0FBQyxHQUFHLGVBQWU7QUFBQSxJQUNyQztBQUNBLHFCQUFpQixTQUFTO0FBQzFCLFVBQU0sVUFBVSxNQUFNLFFBQVEsSUFBSSxDQUFDLE9BQU8sTUFBTSxDQUFDO0FBRWpELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixrQkFBa0I7QUFBQSxRQUNqQixtQkFBbUIsQ0FBQyxjQUFjO0FBQUEsUUFDbEMsaUJBQWlCLENBQUMsY0FBYztBQUFBLE1BQ2pDO0FBQUEsTUFDQSxTQUFTLENBQUMsTUFBTSxJQUFJO0FBQUEsTUFDcEIsbUJBQW1CLENBQUMsZ0JBQWdCLGVBQWU7QUFBQSxNQUNuRCxpQkFBaUIsQ0FBQyxnQkFBZ0IsZUFBZTtBQUFBLE1BQ2pELHNCQUFzQixDQUFDLHNCQUFzQixxQkFBcUI7QUFBQSxJQUNuRSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxRUFBcUUsWUFBWTtBQUNyRixVQUFNLG9CQUFvQjtBQUMxQixVQUFNLG9CQUE4QixDQUFDO0FBQ3JDLFVBQU0sdUJBQTBGLENBQUM7QUFDakcsUUFBSSxtQkFBbUI7QUFDdkIsVUFBTSxjQUFjLHNCQUFzQjtBQUFBLE1BQ3pDLGlDQUFpQyxnQkFBYyxlQUFlLHFCQUFxQjtBQUFBLE1BQ25GLHFDQUFxQyxPQUFPLHNCQUFzQixXQUFXLFdBQVcsYUFBYTtBQUNwRywwQkFBa0IsS0FBSyxZQUFZLEVBQUU7QUFDckMsMkJBQW1CO0FBQ25CLGVBQU8sRUFBRSxJQUFJLGtCQUFrQjtBQUFBLE1BQ2hDO0FBQUEsTUFDQSxhQUFhLE1BQU0sUUFBUSxRQUFRLENBQUM7QUFBQSxRQUNuQyxJQUFJO0FBQUEsUUFDSixRQUFRLENBQUMsb0JBQW9CO0FBQUEsUUFDN0IsYUFBYTtBQUFBLFFBQ2IsU0FBUyxFQUFFLElBQUksY0FBYyxPQUFPLGdCQUFnQjtBQUFBLE1BQ3JELENBQUMsQ0FBQztBQUFBLElBQ0gsQ0FBQztBQUNELFVBQU0sdUJBQXVCLFlBQVksSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQzNFLHlCQUFxQixLQUFLLHdCQUF3QixXQUFXO0FBQzdELHlCQUFxQixLQUFLLGlDQUFpQztBQUFBLE1BQzFELHVCQUF1QixNQUFNO0FBQUEsSUFDOUIsQ0FBQztBQUNELHlCQUFxQixLQUFLLDJCQUEyQjtBQUFBLE1BQ3BELHNCQUFzQixNQUFNO0FBQUEsSUFDN0IsQ0FBQztBQUNELHlCQUFxQixLQUFLLGdDQUFnQztBQUFBLE1BQ3pELGlCQUFpQixNQUFNO0FBQUEsTUFBRTtBQUFBLElBQzFCLENBQUM7QUFDRCx5QkFBcUIsS0FBSyw4Q0FBOEM7QUFBQSxNQUN2RSx1QkFBdUIsTUFBTSxRQUFRLFFBQVEsRUFBRSxVQUFVLGtCQUFrQixDQUFDO0FBQUEsSUFDN0UsQ0FBQztBQUNELHlCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFFM0QsVUFBTSxTQUFTLE1BQU0scUJBQXFCLGVBQWUsZ0NBQWdDO0FBQUEsTUFDeEYsVUFBVTtBQUFBLE1BQ1YsdUJBQXVCLENBQUMsdUJBQXVCO0FBQUEsTUFDL0Msa0JBQWtCLENBQUMsb0JBQW9CO0FBQUEsSUFDeEMsR0FBRztBQUFBLE1BQ0Ysa0JBQWtCO0FBQUEsTUFDbEIsV0FBVztBQUFBLE1BQ1gsYUFBYTtBQUFBLE1BQ2IsZUFBZTtBQUFBLE1BQ2YsY0FBYztBQUFBLE1BQ2QsYUFBYSxFQUFFLFVBQVUsa0JBQWtCO0FBQUEsTUFDM0MsUUFBUSxDQUFDO0FBQUEsTUFDVCxvQ0FBb0MsT0FBTSx5QkFBd0I7QUFBQSxRQUNqRSxVQUFVO0FBQUEsVUFDVCxRQUFRO0FBQUEsVUFDUiwwQkFBMEIsQ0FBQyxNQUFNO0FBQUEsUUFDbEM7QUFBQSxRQUNBLGNBQWMsR0FBRyxtQkFBbUI7QUFBQSxRQUNwQyxRQUFRLENBQUM7QUFBQSxNQUNWO0FBQUEsTUFDQSxjQUFjLE9BQU0sWUFBVztBQUM5Qiw2QkFBcUIsS0FBSyxPQUFPO0FBQUEsTUFDbEM7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPLGdCQUFnQixFQUFFLFFBQVEsbUJBQW1CLHFCQUFxQixHQUFHO0FBQUEsTUFDM0UsUUFBUTtBQUFBLE1BQ1IsbUJBQW1CLENBQUMsaUJBQWlCO0FBQUEsTUFDckMsc0JBQXNCLENBQUM7QUFBQSxRQUN0QixVQUFVO0FBQUEsUUFDVixRQUFRLENBQUMsb0JBQW9CO0FBQUEsUUFDN0IsT0FBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0ZBQW9GLFlBQVk7QUFDcEcsVUFBTSxvQkFBb0I7QUFDMUIsVUFBTSxvQkFBcUosQ0FBQztBQUM1SixVQUFNLGtCQUF3RixDQUFDO0FBQy9GLFVBQU0sbUJBQXlGLENBQUM7QUFDaEcsVUFBTSx1QkFBMEYsQ0FBQztBQUNqRyxVQUFNLG1CQUE2QixDQUFDO0FBQ3BDLFFBQUk7QUFDSixRQUFJLGtCQUFrQjtBQUN0QixVQUFNLFdBQW9DO0FBQUEsTUFDekMsSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLE1BQ1AsMEJBQTBCO0FBQUEsTUFDMUIscUJBQXFCLE1BQU07QUFBQSxNQUMzQixhQUFhLE1BQU0sUUFBUSxPQUFPLElBQUksTUFBTSxzQ0FBc0MsQ0FBQztBQUFBLE1BQ25GLGVBQWUsTUFBTSxRQUFRLE9BQU8sSUFBSSxNQUFNLHdDQUF3QyxDQUFDO0FBQUEsTUFDdkYsZUFBZSxNQUFNLFFBQVEsT0FBTyxJQUFJLE1BQU0sd0NBQXdDLENBQUM7QUFBQSxJQUN4RjtBQUNBLFVBQU0sY0FBYyxzQkFBc0I7QUFBQSxNQUN6QyxrQ0FBa0MsTUFBTSxRQUFRLE9BQU8sSUFBSSxNQUFNLHFEQUFxRCxDQUFDO0FBQUEsTUFDdkgsYUFBYSxDQUFDLGFBQWEsU0FBUyxZQUFZO0FBQy9DLHdCQUFnQixLQUFLLEVBQUUsVUFBVSxRQUFRLFVBQVUsY0FBYyxRQUFRLGFBQWEsQ0FBQztBQUN2RjtBQUNBLGVBQU8sUUFBUSxRQUFRLG9CQUFvQixJQUFJLENBQUM7QUFBQSxVQUMvQyxRQUFRLENBQUMsb0JBQW9CO0FBQUEsVUFDN0IsYUFBYTtBQUFBLFVBQ2IsU0FBUyxFQUFFLElBQUksY0FBYyxPQUFPLGdCQUFnQjtBQUFBLFFBQ3JELENBQUMsSUFBSSxDQUFDLENBQUM7QUFBQSxNQUNSO0FBQUEsTUFDQSxlQUFlLENBQUMsYUFBYSxTQUFTLFlBQVk7QUFDakQseUJBQWlCLEtBQUssRUFBRSxVQUFVLFFBQVEsVUFBVSxjQUFjLFFBQVEsYUFBYSxDQUFDO0FBQ3hGLGVBQU8sUUFBUSxRQUFRO0FBQUEsVUFDdEIsSUFBSTtBQUFBLFVBQ0osYUFBYTtBQUFBLFVBQ2IsU0FBUyxFQUFFLElBQUksY0FBYyxPQUFPLGdCQUFnQjtBQUFBLFVBQ3BELFFBQVEsQ0FBQyxvQkFBb0I7QUFBQSxRQUM5QixDQUFDO0FBQUEsTUFDRjtBQUFBLE1BQ0EscUNBQXFDLE9BQU8scUJBQXFCLFdBQVcsVUFBVSxVQUFVLGlCQUFpQjtBQUNoSCwwQkFBa0IsS0FBSztBQUFBLFVBQ3RCLHFCQUFxQixvQkFBb0IsU0FBUyxJQUFJO0FBQUEsVUFDdEQsVUFBVSxVQUFVO0FBQUEsVUFDcEI7QUFBQSxVQUNBO0FBQUEsUUFDRCxDQUFDO0FBQ0QsMkJBQW1CLEVBQUUsVUFBVSxhQUFhO0FBQzVDLGVBQU8sRUFBRSxJQUFJLGtCQUFrQjtBQUFBLE1BQ2hDO0FBQUEsTUFDQSxhQUFhLE1BQU07QUFBQSxNQUNuQixpQ0FBaUMsZ0JBQWMsZUFBZSxxQkFBcUIscUJBQXFCO0FBQUEsTUFDeEcsa0NBQWtDLGdCQUFjO0FBQy9DLHlCQUFpQixLQUFLLFVBQVU7QUFDaEMsMkJBQW1CO0FBQUEsTUFDcEI7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLHVCQUF1QixZQUFZLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUMzRSx5QkFBcUIsS0FBSyx3QkFBd0IsV0FBVztBQUM3RCx5QkFBcUIsS0FBSyxpQ0FBaUM7QUFBQSxNQUMxRCx1QkFBdUIsTUFBTTtBQUFBLE1BQzdCLHlCQUF5QixNQUFNO0FBQUEsTUFBRTtBQUFBLElBQ2xDLENBQUM7QUFDRCx5QkFBcUIsS0FBSywyQkFBMkI7QUFBQSxNQUNwRCxzQkFBc0IsTUFBTTtBQUFBLE1BQzVCLHlCQUF5QixNQUFNO0FBQUEsTUFBRTtBQUFBLElBQ2xDLENBQUM7QUFDRCx5QkFBcUIsS0FBSyxnQ0FBZ0M7QUFBQSxNQUN6RCxpQkFBaUIsTUFBTTtBQUFBLE1BQUU7QUFBQSxJQUMxQixDQUFDO0FBQ0QseUJBQXFCLEtBQUssOENBQThDO0FBQUEsTUFDdkUsdUJBQXVCLE1BQU0sUUFBUSxRQUFRLGdCQUFnQjtBQUFBLE1BQzdELHVCQUF1QixPQUFNLGVBQWM7QUFDMUMseUJBQWlCLEtBQUssVUFBVTtBQUFBLE1BQ2pDO0FBQUEsSUFDRCxDQUFDO0FBQ0QseUJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUUzRCxVQUFNLFVBQXFCLENBQUM7QUFDNUIsZUFBVyxlQUFlO0FBQUEsTUFDekIsRUFBRSxVQUFVLG1CQUFtQjtBQUFBLE1BQy9CLEVBQUUsVUFBVSwwQkFBMEIsY0FBYyw2QkFBNkI7QUFBQSxJQUNsRixHQUFHO0FBQ0YsY0FBUSxLQUFLLE1BQU0scUJBQXFCLGVBQWUsZ0NBQWdDO0FBQUEsUUFDdEYsVUFBVTtBQUFBLFFBQ1YsdUJBQXVCLENBQUMsdUJBQXVCO0FBQUEsUUFDL0Msa0JBQWtCLENBQUMsb0JBQW9CO0FBQUEsTUFDeEMsR0FBRztBQUFBLFFBQ0Ysa0JBQWtCO0FBQUEsUUFDbEIsV0FBVztBQUFBLFFBQ1gsYUFBYTtBQUFBLFFBQ2IsZUFBZTtBQUFBLFFBQ2YsY0FBYztBQUFBLFFBQ2Q7QUFBQSxRQUNBLFFBQVEsQ0FBQyxvQkFBb0I7QUFBQSxRQUM3QixvQ0FBb0MsT0FBTSx5QkFBd0I7QUFBQSxVQUNqRSxVQUFVO0FBQUEsWUFDVCxRQUFRO0FBQUEsWUFDUiwwQkFBMEIsQ0FBQyxNQUFNO0FBQUEsVUFDbEM7QUFBQSxVQUNBLGNBQWMsR0FBRyxtQkFBbUI7QUFBQSxVQUNwQyxRQUFRLENBQUM7QUFBQSxRQUNWO0FBQUEsUUFDQSxjQUFjLE9BQU0sWUFBVztBQUM5QiwrQkFBcUIsS0FBSyxPQUFPO0FBQUEsUUFDbEM7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFFQSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUc7QUFBQSxNQUNGLFNBQVMsQ0FBQyxNQUFNLElBQUk7QUFBQSxNQUNwQixtQkFBbUI7QUFBQSxRQUNsQjtBQUFBLFVBQ0MscUJBQXFCO0FBQUEsVUFDckIsVUFBVTtBQUFBLFVBQ1YsVUFBVTtBQUFBLFVBQ1YsY0FBYztBQUFBLFFBQ2Y7QUFBQSxRQUNBO0FBQUEsVUFDQyxxQkFBcUI7QUFBQSxVQUNyQixVQUFVO0FBQUEsVUFDVixVQUFVO0FBQUEsVUFDVixjQUFjO0FBQUEsUUFDZjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGlCQUFpQjtBQUFBLFFBQ2hCLEVBQUUsVUFBVSxvQkFBb0IsY0FBYyxPQUFVO0FBQUEsUUFDeEQsRUFBRSxVQUFVLDBCQUEwQixjQUFjLDZCQUE2QjtBQUFBLE1BQ2xGO0FBQUEsTUFDQSxrQkFBa0I7QUFBQSxRQUNqQixFQUFFLFVBQVUsMEJBQTBCLGNBQWMsNkJBQTZCO0FBQUEsTUFDbEY7QUFBQSxNQUNBLHNCQUFzQjtBQUFBLFFBQ3JCO0FBQUEsVUFDQyxVQUFVO0FBQUEsVUFDVixRQUFRLENBQUMsb0JBQW9CO0FBQUEsVUFDN0IsT0FBTztBQUFBLFFBQ1I7QUFBQSxRQUNBO0FBQUEsVUFDQyxVQUFVO0FBQUEsVUFDVixRQUFRLENBQUMsb0JBQW9CO0FBQUEsVUFDN0IsT0FBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsTUFDQSxrQkFBa0IsQ0FBQyxtQkFBbUIsaUJBQWlCO0FBQUEsSUFDeEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLGtDQUFrQyxNQUFNO0FBRTdDLFFBQU0sb0JBQStDO0FBQUEsSUFDcEQsVUFBVTtBQUFBLElBQ1YsdUJBQXVCLENBQUMsMEJBQTBCO0FBQUEsSUFDbEQsa0JBQWtCLENBQUMsTUFBTTtBQUFBLEVBQzFCO0FBRUEsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxPQUFLLHlEQUF5RCxZQUFZO0FBQ3pFLFVBQU0sY0FBYyxzQkFBc0I7QUFBQSxNQUN6QyxrQ0FBa0MsTUFBTSxRQUFRLFFBQVEsWUFBWTtBQUFBLE1BQ3BFLGFBQWEsQ0FBQyxhQUFhLFdBQVc7QUFDckMsWUFBSSxRQUFRO0FBQ1gsaUJBQU8sUUFBUSxRQUFRLENBQUMsRUFBRSxRQUFRLENBQUMsTUFBTSxHQUFHLGFBQWEsZUFBZSxDQUFDLENBQUM7QUFBQSxRQUMzRTtBQUVBLGVBQU8sUUFBUSxRQUFRLENBQUMsQ0FBQztBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxRQUFRLElBQUksd0JBQXdCO0FBQzFDLFVBQU0sV0FBOEUsQ0FBQztBQUNyRixVQUFNLFNBQVMsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLGlCQUFpQixFQUFFLENBQUM7QUFDM0QsVUFBTSx1QkFBdUIsK0JBQStCLGFBQWEsV0FBVztBQUVwRixVQUFNLHFCQUFxQixlQUFlLGdDQUFnQyxRQUFRO0FBQUEsTUFDakYsZ0JBQWdCO0FBQUEsTUFDaEIsV0FBVztBQUFBLE1BQ1gsY0FBYyxPQUFNLFlBQVc7QUFDOUIsaUJBQVMsS0FBSyxPQUFPO0FBQUEsTUFDdEI7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLHFCQUFxQixlQUFlLGdDQUFnQyxRQUFRO0FBQUEsTUFDakYsZ0JBQWdCO0FBQUEsTUFDaEIsV0FBVztBQUFBLE1BQ1gsY0FBYyxPQUFNLFlBQVc7QUFDOUIsaUJBQVMsS0FBSyxPQUFPO0FBQUEsTUFDdEI7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPLGdCQUFnQixVQUFVLENBQUMsRUFBRSxVQUFVLGtCQUFrQixVQUFVLFFBQVEsQ0FBQyxNQUFNLEdBQUcsT0FBTyxlQUFlLENBQUMsQ0FBQztBQUFBLEVBQ3JILENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxzQ0FBc0MsTUFBTTtBQUVqRCxRQUFNLG9CQUErQztBQUFBLElBQ3BELFVBQVU7QUFBQSxJQUNWLHVCQUF1QixDQUFDLDBCQUEwQjtBQUFBLElBQ2xELGtCQUFrQixDQUFDLE1BQU07QUFBQSxFQUMxQjtBQUVBLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsT0FBSyx1RUFBdUUsWUFBWTtBQUN2RixRQUFJLHFCQUFxQjtBQUN6QixVQUFNLGNBQWMsc0JBQXNCO0FBQUEsTUFDekMsa0NBQWtDLE1BQU0sUUFBUSxRQUFRLFlBQVk7QUFBQSxNQUNwRSxhQUFhLENBQUMsYUFBYSxXQUFXO0FBQ3JDLFlBQUksUUFBUTtBQUNYLGlCQUFPLFFBQVEsUUFBUSxDQUFDLEVBQUUsUUFBUSxDQUFDLE1BQU0sR0FBRyxhQUFhLGlCQUFpQixDQUFDLENBQUM7QUFBQSxRQUM3RTtBQUVBLGVBQU8sUUFBUSxRQUFRLENBQUMsQ0FBQztBQUFBLE1BQzFCO0FBQUEsTUFDQSxlQUFlLFlBQVk7QUFDMUI7QUFDQSxlQUFPLEVBQUUsYUFBYSxZQUFZO0FBQUEsTUFDbkM7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFdBQThFLENBQUM7QUFDckYsVUFBTSxRQUFRLElBQUksd0JBQXdCO0FBQzFDLFVBQU0sdUJBQXVCLCtCQUErQixhQUFhLFdBQVc7QUFFcEYsVUFBTSxVQUEyQztBQUFBLE1BQ2hELGdCQUFnQjtBQUFBLE1BQ2hCLFdBQVc7QUFBQSxNQUNYLGNBQWMsT0FBTSxZQUFXO0FBQzlCLGlCQUFTLEtBQUssT0FBTztBQUFBLE1BQ3RCO0FBQUEsSUFDRDtBQUNBLFVBQU0sVUFBVTtBQUFBLE1BQ2YsTUFBTSxxQkFBcUIsZUFBZSxvQ0FBb0MsQ0FBQyxpQkFBaUIsR0FBRyxPQUFPO0FBQUEsTUFDMUcsTUFBTSxxQkFBcUIsZUFBZSxvQ0FBb0MsQ0FBQyxpQkFBaUIsR0FBRyxPQUFPO0FBQUEsSUFDM0c7QUFFQSxXQUFPLGdCQUFnQixFQUFFLFNBQVMsVUFBVSxtQkFBbUIsR0FBRztBQUFBLE1BQ2pFLFNBQVMsQ0FBQyxNQUFNLElBQUk7QUFBQSxNQUNwQixVQUFVLENBQUMsRUFBRSxVQUFVLGtCQUFrQixVQUFVLFFBQVEsQ0FBQyxNQUFNLEdBQUcsT0FBTyxpQkFBaUIsQ0FBQztBQUFBLE1BQzlGLG9CQUFvQjtBQUFBLElBQ3JCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdEQUF3RCxZQUFZO0FBQ3hFLFFBQUksV0FBVztBQUNmLFVBQU0saUJBQWlCLElBQUksbUJBQW1CO0FBQzlDLG1CQUFlLFlBQVksTUFBTSxXQUFXO0FBQzVDLFVBQU0sY0FBYyxzQkFBc0I7QUFBQSxNQUN6QyxrQ0FBa0MsTUFBTSxRQUFRLFFBQVEsWUFBWTtBQUFBLE1BQ3BFLGFBQWEsTUFBTSxRQUFRLFFBQVEsV0FBVyxDQUFDLEVBQUUsUUFBUSxDQUFDLE1BQU0sR0FBRyxhQUFhLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDO0FBQUEsSUFDMUcsQ0FBQztBQUNELFVBQU0sV0FBOEUsQ0FBQztBQUNyRixVQUFNLHVCQUF1QiwrQkFBK0IsYUFBYSxhQUFhLGNBQWM7QUFFcEcsVUFBTSxVQUFVLE1BQU0scUJBQXFCLGVBQWUsb0NBQW9DLENBQUMsaUJBQWlCLEdBQUc7QUFBQSxNQUNsSCxnQkFBZ0IsSUFBSSx3QkFBd0I7QUFBQSxNQUM1QyxXQUFXO0FBQUEsTUFDWCxjQUFjLE9BQU0sWUFBVztBQUM5QixpQkFBUyxLQUFLLE9BQU87QUFBQSxNQUN0QjtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLEVBQUUsU0FBUyxjQUFjLGVBQWUsT0FBTyxTQUFTLEdBQUc7QUFBQSxNQUNqRixTQUFTO0FBQUEsTUFDVCxjQUFjLENBQUM7QUFBQSxRQUNkLFdBQVc7QUFBQSxRQUNYLE1BQU0sQ0FBQyxRQUFXO0FBQUEsVUFDakIsbUJBQW1CO0FBQUEsVUFDbkIsa0JBQWtCLENBQUMsTUFBTTtBQUFBLFVBQ3pCLGFBQWE7QUFBQSxVQUNiLHVCQUF1QjtBQUFBLFVBQ3ZCLGNBQWM7QUFBQSxRQUNmLENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxNQUNELFVBQVUsQ0FBQyxFQUFFLFVBQVUsa0JBQWtCLFVBQVUsUUFBUSxDQUFDLE1BQU0sR0FBRyxPQUFPLGtCQUFrQixDQUFDO0FBQUEsSUFDaEcsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssZ0ZBQWdGLFlBQVk7QUFDaEcsVUFBTSxpQkFBaUIsSUFBSSxtQkFBbUI7QUFDOUMsbUJBQWUsU0FBUyxFQUFFLFNBQVMsUUFBVyxlQUFlLE1BQU07QUFDbkUsUUFBSSxxQkFBcUI7QUFDekIsVUFBTSxjQUFjLHNCQUFzQjtBQUFBLE1BQ3pDLGtDQUFrQyxNQUFNLFFBQVEsUUFBUSxZQUFZO0FBQUEsTUFDcEUsYUFBYSxNQUFNLFFBQVEsUUFBUSxDQUFDLENBQUM7QUFBQSxNQUNyQyxlQUFlLFlBQVk7QUFDMUI7QUFDQSxlQUFPLEVBQUUsYUFBYSxtQkFBbUI7QUFBQSxNQUMxQztBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sdUJBQXVCLCtCQUErQixhQUFhLGFBQWEsY0FBYztBQUVwRyxVQUFNLFVBQVUsTUFBTSxxQkFBcUIsZUFBZSxvQ0FBb0MsQ0FBQyxpQkFBaUIsR0FBRztBQUFBLE1BQ2xILFdBQVc7QUFBQSxNQUNYLGNBQWMsWUFBWTtBQUFBLE1BQUU7QUFBQSxJQUM3QixDQUFDO0FBRUQsV0FBTyxnQkFBZ0IsRUFBRSxTQUFTLG1CQUFtQixHQUFHLEVBQUUsU0FBUyxPQUFPLG9CQUFvQixFQUFFLENBQUM7QUFBQSxFQUNsRyxDQUFDO0FBRUQsT0FBSyx1Q0FBdUMsWUFBWTtBQUN2RCxVQUFNLGlCQUFpQixJQUFJLG1CQUFtQjtBQUM5QyxtQkFBZSxTQUFTLEVBQUUsU0FBUyxPQUFPLGVBQWUsT0FBTyxPQUFPLElBQUksTUFBTSxpQkFBaUIsRUFBRTtBQUNwRyxVQUFNLGNBQWMsc0JBQXNCO0FBQUEsTUFDekMsa0NBQWtDLE1BQU0sUUFBUSxRQUFRLFlBQVk7QUFBQSxNQUNwRSxhQUFhLE1BQU0sUUFBUSxRQUFRLENBQUMsQ0FBQztBQUFBLElBQ3RDLENBQUM7QUFDRCxVQUFNLHVCQUF1QiwrQkFBK0IsYUFBYSxhQUFhLGNBQWM7QUFFcEcsVUFBTSxPQUFPLFFBQVEscUJBQXFCLGVBQWUsb0NBQW9DLENBQUMsaUJBQWlCLEdBQUc7QUFBQSxNQUNqSCxXQUFXO0FBQUEsTUFDWCxjQUFjLFlBQVk7QUFBQSxNQUFFO0FBQUEsSUFDN0IsQ0FBQyxHQUFHLGlCQUFpQjtBQUFBLEVBQ3RCLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
