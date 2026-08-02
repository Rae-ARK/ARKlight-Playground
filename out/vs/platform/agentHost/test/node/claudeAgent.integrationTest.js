import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { URI } from "../../../../base/common/uri.js";
import { Schemas } from "../../../../base/common/network.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { FileService } from "../../../files/common/fileService.js";
import { IFileService } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import { GITHUB_COPILOT_PROTECTED_RESOURCE } from "../../common/agentService.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ResponsePartKind, ToolResultContentType, ChatInputResponseKind, ChatInputAnswerState, ChatInputAnswerValueKind } from "../../common/state/sessionState.js";
import { ISessionDataService } from "../../common/sessionDataService.js";
import { AgentConfigurationService, IAgentConfigurationService } from "../../node/agentConfigurationService.js";
import { IAgentHostGitHubEndpointService } from "../../node/agentHostGitHubEndpointService.js";
import { createTestGitHubEndpointService } from "./testGitHubEndpointService.js";
import { AgentHostStateManager, IAgentHostStateManager } from "../../node/agentHostStateManager.js";
import { IAgentHostGitService } from "../../common/agentHostGitService.js";
import { ClaudeAgent } from "../../node/claude/claudeAgent.js";
import { IClaudeAgentSdkService } from "../../node/claude/claudeAgentSdkService.js";
import { IAgentPluginManager } from "../../common/agentPluginManager.js";
import { ClaudeProxyService, IClaudeProxyService } from "../../node/claude/claudeProxyService.js";
import { ICopilotApiService } from "../../node/shared/copilotApiService.js";
import { createNoopGitService, createSessionDataService } from "../common/sessionTestHelpers.js";
import {
  makeContentBlockStartText,
  makeContentBlockStartToolUse,
  makeContentBlockStop,
  makeInputJsonDelta,
  makeMessageStart,
  makeMessageStop,
  makeStreamEvent,
  makeTextDelta,
  makeUserToolResultMessage
} from "./claudeMapSessionEventsTestUtils.js";
function claudeFileEnvServices(disposables) {
  const fileService = disposables.add(new FileService(new NullLogService()));
  disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
  const env = { userHome: URI.file("/mock-home") };
  return [
    [IFileService, fileService],
    [INativeEnvironmentService, env]
  ];
}
const ANTHROPIC_MODEL = {
  id: "claude-opus-4.6",
  name: "Claude Opus 4.6",
  vendor: "Anthropic",
  supported_endpoints: ["/v1/messages"],
  object: "model",
  version: "4.6",
  is_chat_default: false,
  is_chat_fallback: false,
  model_picker_category: "",
  model_picker_enabled: true,
  preview: false,
  billing: { is_premium: false, multiplier: 1, restricted_to: [] },
  capabilities: {
    family: "test",
    limits: { max_context_window_tokens: 2e5, max_output_tokens: 8192, max_prompt_tokens: 2e5 },
    object: "model_capabilities",
    supports: { parallel_tool_calls: true, streaming: true, tool_calls: true, vision: false },
    tokenizer: "o200k_base",
    type: "chat"
  },
  policy: { state: "enabled", terms: "" }
};
const TEST_UUID = "11111111-2222-3333-4444-555555555555";
function makeMessage(model) {
  return {
    id: "msg_int_test",
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text: "", citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    container: null,
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      server_tool_use: null,
      service_tier: null
    }
  };
}
function makeCannedStream(model) {
  const message = makeMessage(model);
  const contentBlockStart = {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "", citations: [] }
  };
  const contentBlockDelta = {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "hello" }
  };
  const messageDelta = {
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null, stop_details: null, container: null },
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null
    }
  };
  return [
    { type: "message_start", message },
    contentBlockStart,
    contentBlockDelta,
    { type: "content_block_stop", index: 0 },
    messageDelta,
    { type: "message_stop" }
  ];
}
function makeSystemInitMessage(sessionId) {
  return {
    type: "system",
    subtype: "init",
    apiKeySource: "user",
    claude_code_version: "0.0.0-test",
    cwd: "/workspace",
    tools: [],
    mcp_servers: [],
    model: "claude-test",
    permissionMode: "default",
    slash_commands: [],
    output_style: "default",
    skills: [],
    plugins: [],
    uuid: TEST_UUID,
    session_id: sessionId
  };
}
function makeResultSuccess(sessionId) {
  return {
    type: "result",
    subtype: "success",
    duration_ms: 0,
    duration_api_ms: 0,
    is_error: false,
    num_turns: 1,
    result: "",
    stop_reason: "end_turn",
    total_cost_usd: 0,
    usage: {
      cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      inference_geo: "unknown",
      input_tokens: 0,
      iterations: [],
      output_tokens: 0,
      server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 },
      service_tier: "standard",
      speed: "standard"
    },
    modelUsage: {},
    permission_denials: [],
    uuid: TEST_UUID,
    session_id: sessionId
  };
}
class StubCopilotApiService {
  constructor() {
    this.streamEvents = [];
    this.availableModels = [ANTHROPIC_MODEL];
    this.messagesCallCount = { count: 0 };
  }
  async resolveRestrictedTelemetryContext() {
    return { restrictedTelemetryEnabled: false, trackingId: void 0, telemetryEndpoint: void 0 };
  }
  async resolveApiEndpoint() {
    return void 0;
  }
  messages(token, request, options) {
    this.messagesCallCount.count++;
    if (request.stream) {
      return this._stream(options);
    }
    return Promise.reject(new Error("non-streaming not used in integration test"));
  }
  async *_stream(options) {
    for (const ev of this.streamEvents) {
      if (options?.signal?.aborted) {
        const err = new Error("Aborted");
        err.name = "AbortError";
        throw err;
      }
      yield ev;
    }
  }
  async countTokens() {
    throw new Error("countTokens not used in integration test");
  }
  async models() {
    return this.availableModels;
  }
  async responses() {
    throw new Error("responses not used in Claude integration tests");
  }
  async utilityChatCompletion() {
    throw new Error("utilityChatCompletion not used in Claude integration tests");
  }
}
function isCanUseToolMarker(item) {
  return item.kind === "canUseTool";
}
function isElicitationMarker(item) {
  return item.kind === "elicitation";
}
class ProxyRoundTripSdkService {
  constructor() {
    this.capturedStartupOptions = [];
    this.proxyRoundTrips = [];
    /**
     * Items the produced WarmQuery's Query will yield in order. SDK
     * messages flow through unchanged; {@link CanUseToolMarker} entries
     * pause the iterator and invoke the captured
     * `Options.canUseTool` closure (mirroring what the real SDK
     * subprocess does between assistant `tool_use` and the synthetic
     * `user` `tool_result` it follows up with).
     */
    this.queryMessages = [];
    /** Records the {@link PermissionResult} returned by each `canUseTool` invocation in {@link queryMessages} order. */
    this.canUseToolResults = [];
    this.elicitationResults = [];
    this.warmQueries = [];
  }
  async listSessions() {
    return [];
  }
  async canLoadWithoutDownload() {
    return true;
  }
  async getSessionInfo(_sessionId) {
    return void 0;
  }
  async getSessionMessages(_sessionId, _options) {
    return [];
  }
  async listSubagents(_sessionId) {
    return [];
  }
  async getSubagentMessages(_sessionId, _agentId) {
    return [];
  }
  async forkSession(sessionId) {
    return { sessionId: `forked-${sessionId}` };
  }
  async deleteSession() {
  }
  async createSdkMcpServer() {
    throw new Error("not implemented in integration test fake");
  }
  async tool() {
    throw new Error("not implemented in integration test fake");
  }
  async query(_params) {
    throw new Error("query not used in proxy round-trip integration test");
  }
  async startup(params) {
    this.capturedStartupOptions.push(params.options);
    const settings = params.options.settings;
    const settingsEnv = settings && typeof settings === "object" && settings.env ? settings.env : {};
    const baseUrl = settingsEnv["ANTHROPIC_BASE_URL"];
    const bearer = settingsEnv["ANTHROPIC_AUTH_TOKEN"];
    if (!baseUrl || !bearer) {
      throw new Error("ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN missing from settings.env");
    }
    const result = await postSseToProxy(`${baseUrl}/v1/messages`, bearer, {
      model: "claude-opus-4-6",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
      max_tokens: 4096
    });
    this.proxyRoundTrips.push(result);
    const warm = new RoundTripWarmQuery(this);
    this.warmQueries.push(warm);
    return warm;
  }
}
class RoundTripWarmQuery {
  constructor(_sdk) {
    this._sdk = _sdk;
    this.asyncDisposeCount = 0;
    this.closeCount = 0;
  }
  query(prompt) {
    if (typeof prompt === "string") {
      throw new Error("integration test: agent host always passes an AsyncIterable");
    }
    return new RoundTripQuery(prompt, this._sdk);
  }
  close() {
    this.closeCount++;
  }
  async [Symbol.asyncDispose]() {
    this.asyncDisposeCount++;
  }
}
class RoundTripQuery {
  constructor(prompt, _sdk) {
    this._sdk = _sdk;
    this._index = 0;
    const it = prompt[Symbol.asyncIterator]();
    this._drainer = (async () => {
      while (true) {
        const r = await it.next();
        if (r.done) {
          return;
        }
      }
    })();
  }
  [Symbol.asyncIterator]() {
    return this;
  }
  async next() {
    while (this._index < this._sdk.queryMessages.length) {
      const item = this._sdk.queryMessages[this._index++];
      if (isCanUseToolMarker(item)) {
        const startup = this._sdk.capturedStartupOptions[0];
        if (!startup?.canUseTool) {
          throw new Error("integration test: canUseTool marker but Options.canUseTool not wired");
        }
        const result = await startup.canUseTool(item.toolName, item.input, {
          signal: new AbortController().signal,
          toolUseID: item.toolUseID,
          requestId: item.toolUseID
        });
        this._sdk.canUseToolResults.push(result);
        continue;
      }
      if (isElicitationMarker(item)) {
        const startup = this._sdk.capturedStartupOptions[0];
        if (!startup?.onElicitation) {
          throw new Error("integration test: elicitation marker but Options.onElicitation not wired");
        }
        const result = await startup.onElicitation(item.request, { signal: new AbortController().signal });
        this._sdk.elicitationResults.push(result);
        continue;
      }
      return { done: false, value: item };
    }
    await this._drainer;
    return { done: true, value: void 0 };
  }
  async return() {
    return { done: true, value: void 0 };
  }
  async throw(err) {
    throw err;
  }
  async interrupt() {
    return void 0;
  }
  setPermissionMode() {
    throw new Error("not modeled");
  }
  setMcpPermissionModeOverride() {
    throw new Error("not modeled");
  }
  setModel() {
    throw new Error("not modeled");
  }
  setMaxThinkingTokens() {
    throw new Error("not modeled");
  }
  applyFlagSettings() {
    throw new Error("not modeled");
  }
  initializationResult() {
    throw new Error("not modeled");
  }
  reinitialize() {
    throw new Error("not modeled");
  }
  supportedCommands() {
    throw new Error("not modeled");
  }
  supportedModels() {
    throw new Error("not modeled");
  }
  supportedAgents() {
    throw new Error("not modeled");
  }
  mcpServerStatus() {
    throw new Error("not modeled");
  }
  getContextUsage() {
    throw new Error("not modeled");
  }
  usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET() {
    throw new Error("not modeled");
  }
  reloadPlugins() {
    throw new Error("not modeled");
  }
  accountInfo() {
    throw new Error("not modeled");
  }
  rewindFiles() {
    throw new Error("not modeled");
  }
  readFile() {
    throw new Error("not modeled");
  }
  seedReadState() {
    throw new Error("not modeled");
  }
  reconnectMcpServer() {
    throw new Error("not modeled");
  }
  toggleMcpServer() {
    throw new Error("not modeled");
  }
  setMcpServers() {
    throw new Error("not modeled");
  }
  streamInput() {
    throw new Error("not modeled");
  }
  stopTask() {
    throw new Error("not modeled");
  }
  reloadSkills() {
    throw new Error("not modeled");
  }
  backgroundTasks() {
    throw new Error("not modeled");
  }
  close() {
  }
  [Symbol.asyncDispose]() {
    return Promise.resolve();
  }
}
let _httpModule;
async function getHttp() {
  if (!_httpModule) {
    _httpModule = await import("http");
  }
  return _httpModule;
}
async function postSseToProxy(url, bearer, payload) {
  const httpMod = await getHttp();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(payload);
    const req = httpMod.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${bearer}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body).toString(),
        "Accept": "text/event-stream",
        "anthropic-version": "2023-06-01"
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode ?? 0,
          contentType: typeof res.headers["content-type"] === "string" ? res.headers["content-type"] : void 0,
          events: parseSseFrames(raw)
        });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
function parseSseFrames(raw) {
  const out = [];
  for (const block of raw.split("\n\n")) {
    if (!block.trim()) {
      continue;
    }
    let event = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) {
        event = line.slice("event: ".length).trim();
      } else if (line.startsWith("data: ")) {
        data = line.slice("data: ".length);
      }
    }
    if (event && data) {
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = data;
      }
      out.push({ type: event, data: parsed });
    }
  }
  return out;
}
suite("ClaudeAgent integration (proxy-backed)", function() {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("agent \u2192 proxy \u2192 CAPI \u2192 SSE \u2192 agent: end-to-end pipeline with real proxy and stubbed CAPI", async () => {
    const capi = new StubCopilotApiService();
    capi.streamEvents = makeCannedStream("claude-opus-4.6");
    const realProxy = disposables.add(new ClaudeProxyService(new NullLogService(), capi));
    const sdk = new ProxyRoundTripSdkService();
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const services = new ServiceCollection(
      [ILogService, logService],
      [ICopilotApiService, capi],
      [IClaudeProxyService, realProxy],
      [ISessionDataService, createSessionDataService()],
      [IClaudeAgentSdkService, sdk],
      [IAgentPluginManager, {
        _serviceBrand: void 0,
        basePath: URI.from({ scheme: "inmemory", path: "/agentPlugins" }),
        async syncCustomizations(_clientId, _customizations) {
          return [];
        }
      }],
      [IAgentConfigurationService, configService],
      [IAgentHostStateManager, stateManager],
      [IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
      [IAgentHostGitService, createNoopGitService()],
      ...claudeFileEnvServices(disposables)
    );
    const instantiationService = disposables.add(new InstantiationService(services));
    const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));
    const accepted = await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, "gh-int-test-token");
    assert.strictEqual(accepted, true);
    const created = await agent.createSession({ workingDirectories: [URI.file("/integration-cwd")] });
    assert.strictEqual(sdk.capturedStartupOptions.length, 0, "createSession does not touch the SDK");
    const sessionId = created.session.path.replace(/^\//, "");
    sdk.queryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
    await agent.chats.sendMessage(created.session, "hi", void 0, void 0, "turn-1");
    const startup = sdk.capturedStartupOptions[0];
    const round = sdk.proxyRoundTrips[0];
    const startupSettings = startup.settings;
    const settingsEnv = startupSettings && typeof startupSettings === "object" && startupSettings.env ? startupSettings.env : {};
    assert.deepStrictEqual({
      startupCallCount: sdk.capturedStartupOptions.length,
      roundTripCount: sdk.proxyRoundTrips.length,
      capiCallCount: capi.messagesCallCount.count,
      startupCwd: startup.cwd,
      startupSessionId: startup.sessionId,
      startupExecutable: startup.executable,
      subprocessElectronRunAsNode: startup.env?.["ELECTRON_RUN_AS_NODE"],
      subprocessNodeOptions: startup.env?.["NODE_OPTIONS"],
      subprocessAnthropicApiKey: startup.env?.["ANTHROPIC_API_KEY"],
      settingsBaseUrlIsLoopback: typeof settingsEnv["ANTHROPIC_BASE_URL"] === "string" && settingsEnv["ANTHROPIC_BASE_URL"].startsWith("http://127.0.0.1:"),
      settingsBearerHasNonceAndSession: typeof settingsEnv["ANTHROPIC_AUTH_TOKEN"] === "string" && settingsEnv["ANTHROPIC_AUTH_TOKEN"].split(".").length === 2 && settingsEnv["ANTHROPIC_AUTH_TOKEN"].endsWith(`.${sessionId}`),
      httpStatus: round.status,
      httpContentType: round.contentType,
      eventTypes: round.events.map((e) => e.type)
    }, {
      startupCallCount: 1,
      roundTripCount: 1,
      capiCallCount: 1,
      startupCwd: URI.file("/integration-cwd").fsPath,
      startupSessionId: sessionId,
      startupExecutable: process.execPath,
      subprocessElectronRunAsNode: "1",
      subprocessNodeOptions: void 0,
      subprocessAnthropicApiKey: void 0,
      settingsBaseUrlIsLoopback: true,
      settingsBearerHasNonceAndSession: true,
      httpStatus: 200,
      httpContentType: "text/event-stream",
      eventTypes: [
        "message_start",
        "content_block_start",
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop"
      ]
    });
    await agent.disposeSession(created.session);
    assert.strictEqual(sdk.warmQueries[0].asyncDisposeCount, 1, "WarmQuery is asyncDisposed on session dispose");
  });
  test("proxy rejects a request whose bearer carries a wrong nonce (auth contract)", async () => {
    const capi = new StubCopilotApiService();
    const realProxy = disposables.add(new ClaudeProxyService(new NullLogService(), capi));
    const handle = await realProxy.start("gh-int-test-token");
    try {
      const result = await postSseToProxy(
        `${handle.baseUrl}/v1/messages`,
        "wrong-nonce.session-x",
        { model: "claude-opus-4-6", messages: [], stream: true }
      );
      assert.strictEqual(result.status, 401);
      assert.strictEqual(capi.messagesCallCount.count, 0, "auth check fires before any upstream call");
    } finally {
      handle.dispose();
    }
  });
  test("Phase 7 \xA75.3 \u2014 canUseTool / onElicitation closures wired through to Options on materialize", async () => {
    const capi = new StubCopilotApiService();
    capi.streamEvents = makeCannedStream("claude-opus-4.6");
    const realProxy = disposables.add(new ClaudeProxyService(new NullLogService(), capi));
    const sdk = new ProxyRoundTripSdkService();
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const services = new ServiceCollection(
      [ILogService, logService],
      [ICopilotApiService, capi],
      [IClaudeProxyService, realProxy],
      [ISessionDataService, createSessionDataService()],
      [IClaudeAgentSdkService, sdk],
      [IAgentPluginManager, {
        _serviceBrand: void 0,
        basePath: URI.from({ scheme: "inmemory", path: "/agentPlugins" }),
        async syncCustomizations(_clientId, _customizations) {
          return [];
        }
      }],
      [IAgentConfigurationService, configService],
      [IAgentHostStateManager, stateManager],
      [IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
      [IAgentHostGitService, createNoopGitService()],
      ...claudeFileEnvServices(disposables)
    );
    const instantiationService = disposables.add(new InstantiationService(services));
    const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));
    await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, "gh-int-test-token");
    const created = await agent.createSession({ workingDirectories: [URI.file("/integration-cwd")] });
    const sessionId = created.session.path.replace(/^\//, "");
    sdk.queryMessages = [
      makeSystemInitMessage(sessionId),
      {
        kind: "elicitation",
        request: { serverName: "mcp-test", message: "pick a side", mode: "form", requestedSchema: { type: "object", properties: { side: { type: "string" } } } }
      },
      makeResultSuccess(sessionId)
    ];
    const inputRequested = new DeferredPromise();
    disposables.add(agent.onDidSessionProgress((s) => {
      if (s.kind === "action" && s.action.type === ActionType.ChatInputRequested) {
        inputRequested.complete(s.action.request);
      }
    }));
    const sendPromise = agent.chats.sendMessage(created.session, "hi", void 0, void 0, "turn-1");
    const inputRequest = await inputRequested.p;
    const startup = sdk.capturedStartupOptions[0];
    assert.ok(typeof startup.canUseTool === "function", "canUseTool was wired into Options");
    assert.ok(typeof startup.onElicitation === "function", "onElicitation was wired into Options");
    agent.respondToUserInputRequest(inputRequest.id, ChatInputResponseKind.Accept, {
      side: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "left" } }
    });
    await sendPromise;
    assert.deepStrictEqual({
      elicitResult: sdk.elicitationResults[0],
      permissionMode: startup.permissionMode
    }, {
      elicitResult: { action: "accept", content: { side: "left" } },
      permissionMode: "default"
    });
  });
  test("Phase 7 \xA75.3 \u2014 Read tool round-trip: SDK tool_use \u2192 pending_confirmation \u2192 respondToPermissionRequest(true) \u2192 tool_result \u2192 continuation", async () => {
    const capi = new StubCopilotApiService();
    capi.streamEvents = makeCannedStream("claude-opus-4.6");
    const realProxy = disposables.add(new ClaudeProxyService(new NullLogService(), capi));
    const sdk = new ProxyRoundTripSdkService();
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const services = new ServiceCollection(
      [ILogService, logService],
      [ICopilotApiService, capi],
      [IClaudeProxyService, realProxy],
      [ISessionDataService, createSessionDataService()],
      [IClaudeAgentSdkService, sdk],
      [IAgentPluginManager, {
        _serviceBrand: void 0,
        basePath: URI.from({ scheme: "inmemory", path: "/agentPlugins" }),
        async syncCustomizations(_clientId, _customizations) {
          return [];
        }
      }],
      [IAgentConfigurationService, configService],
      [IAgentHostStateManager, stateManager],
      [IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
      [IAgentHostGitService, createNoopGitService()],
      ...claudeFileEnvServices(disposables)
    );
    const instantiationService = disposables.add(new InstantiationService(services));
    const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));
    await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, "gh-int-test-token");
    const created = await agent.createSession({ workingDirectories: [URI.file("/integration-cwd")] });
    const sessionId = created.session.path.replace(/^\//, "");
    const TOOL_USE_ID = "tu_int_read_1";
    sdk.queryMessages = [
      makeSystemInitMessage(sessionId),
      makeStreamEvent(sessionId, makeMessageStart("msg_int_1")),
      makeStreamEvent(sessionId, makeContentBlockStartText(0)),
      makeStreamEvent(sessionId, makeTextDelta(0, "reading")),
      makeStreamEvent(sessionId, makeContentBlockStop(0)),
      makeStreamEvent(sessionId, makeContentBlockStartToolUse(1, TOOL_USE_ID, "Read")),
      makeStreamEvent(sessionId, makeInputJsonDelta(1, '{"file_path":"/tmp/x"}')),
      makeStreamEvent(sessionId, makeContentBlockStop(1)),
      makeStreamEvent(sessionId, makeMessageStop()),
      { kind: "canUseTool", toolName: "Read", input: { file_path: "/tmp/x" }, toolUseID: TOOL_USE_ID },
      makeUserToolResultMessage(sessionId, TOOL_USE_ID, "file contents"),
      makeStreamEvent(sessionId, makeMessageStart("msg_int_2")),
      makeStreamEvent(sessionId, makeContentBlockStartText(0)),
      makeStreamEvent(sessionId, makeTextDelta(0, "done")),
      makeStreamEvent(sessionId, makeContentBlockStop(0)),
      makeStreamEvent(sessionId, makeMessageStop()),
      makeResultSuccess(sessionId)
    ];
    const signals = [];
    disposables.add(agent.onDidSessionProgress((s) => {
      signals.push(s);
      if (s.kind === "pending_confirmation" && s.state.toolCallId === TOOL_USE_ID) {
        agent.respondToPermissionRequest(TOOL_USE_ID, true);
      }
    }));
    await agent.chats.sendMessage(created.session, "please read /tmp/x", void 0, void 0, "turn-1");
    const summary = signals.map((s) => {
      if (s.kind === "pending_confirmation") {
        return {
          kind: s.kind,
          toolCallId: s.state.toolCallId,
          toolName: s.state.toolName,
          permissionKind: s.permissionKind,
          permissionPath: s.permissionPath
        };
      }
      if (s.kind === "action") {
        const a = s.action;
        switch (a.type) {
          case ActionType.ChatResponsePart:
            return { kind: "action", type: a.type, partKind: a.part.kind, content: a.part.kind === ResponsePartKind.Markdown ? a.part.content : void 0 };
          case ActionType.ChatDelta:
            return { kind: "action", type: a.type, content: a.content };
          case ActionType.ChatToolCallStart:
            return { kind: "action", type: a.type, toolCallId: a.toolCallId, toolName: a.toolName };
          case ActionType.ChatToolCallDelta:
            return { kind: "action", type: a.type, toolCallId: a.toolCallId, content: a.content };
          case ActionType.ChatToolCallComplete:
            return { kind: "action", type: a.type, toolCallId: a.toolCallId, success: a.result.success, content: a.result.content };
          case ActionType.ChatUsage:
            return { kind: "action", type: a.type };
          case ActionType.ChatTurnComplete:
            return { kind: "action", type: a.type };
          default:
            return { kind: "action", type: a.type };
        }
      }
      return { kind: s.kind };
    });
    assert.deepStrictEqual({
      summary,
      canUseToolResults: sdk.canUseToolResults
    }, {
      summary: [
        { kind: "action", type: ActionType.ChatResponsePart, partKind: ResponsePartKind.Markdown, content: "" },
        { kind: "action", type: ActionType.ChatDelta, content: "reading" },
        { kind: "action", type: ActionType.ChatToolCallStart, toolCallId: TOOL_USE_ID, toolName: "Read" },
        { kind: "action", type: ActionType.ChatToolCallDelta, toolCallId: TOOL_USE_ID, content: '{"file_path":"/tmp/x"}' },
        // Phase 8.5 — mapper emits `ChatToolCallReady` at
        // `content_block_stop` so auto-allowed tools transition out of
        // `Streaming`; `sessionPermissions` then emits a second Ready
        // for the pending_confirmation card below.
        { kind: "action", type: ActionType.ChatToolCallReady },
        { kind: "pending_confirmation", toolCallId: TOOL_USE_ID, toolName: "Read", permissionKind: "read", permissionPath: "/tmp/x" },
        { kind: "action", type: ActionType.ChatToolCallComplete, toolCallId: TOOL_USE_ID, success: true, content: [{ type: ToolResultContentType.Text, text: "file contents" }] },
        { kind: "action", type: ActionType.ChatResponsePart, partKind: ResponsePartKind.Markdown, content: "" },
        { kind: "action", type: ActionType.ChatDelta, content: "done" },
        { kind: "action", type: ActionType.ChatUsage },
        { kind: "action", type: ActionType.ChatTurnComplete }
      ],
      canUseToolResults: [
        { behavior: "allow", updatedInput: { file_path: "/tmp/x" } }
      ]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY2xhdWRlQWdlbnQuaW50ZWdyYXRpb25UZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBJbnRlZ3JhdGlvbiB0ZXN0IGZvciBQaGFzZSA2IENsYXVkZUFnZW50LlxuICpcbiAqIFdpcmVzIHRvZ2V0aGVyOlxuICogIC0gUmVhbCB7QGxpbmsgQ2xhdWRlUHJveHlTZXJ2aWNlfSBib3VuZCB0byBhIHJlYWwgbG9vcGJhY2sgSFRUUCBsaXN0ZW5lci5cbiAqICAtIFN0dWJiZWQge0BsaW5rIElDb3BpbG90QXBpU2VydmljZX0gdGhhdCB5aWVsZHMgYSBjYW5uZWQgQW50aHJvcGljXG4gKiAgICBgTWVzc2FnZVN0cmVhbUV2ZW50YCBzZXF1ZW5jZS5cbiAqICAtIFJlYWwge0BsaW5rIENsYXVkZUFnZW50fSBkcml2aW5nIHRoZSBtYXRlcmlhbGl6ZSBsaWZlY3ljbGUuXG4gKiAgLSBSZWNvcmRpbmcge0BsaW5rIElDbGF1ZGVBZ2VudFNka1NlcnZpY2V9IHRoYXQsIG9uIGBzdGFydHVwKClgLFxuICogICAgcGVyZm9ybXMgYSByZWFsIEhUVFAgcm91bmQtdHJpcCBhZ2FpbnN0IHRoZSBwcm94eSB1c2luZyB0aGVcbiAqICAgIGBPcHRpb25zLnNldHRpbmdzLmVudi5BTlRIUk9QSUNfQkFTRV9VUkxgIC9cbiAqICAgIGBPcHRpb25zLnNldHRpbmdzLmVudi5BTlRIUk9QSUNfQVVUSF9UT0tFTmAgaXQgcmVjZWl2ZWQgXHUyMDE0IGV4YWN0bHlcbiAqICAgIHdoYXQgdGhlIHJlYWwgQ2xhdWRlIFNESyBzdWJwcm9jZXNzIHdvdWxkIGRvIHdoZW4gZm9ya2VkLlxuICpcbiAqIFRoZSB0ZXN0IGRvZXMgTk9UIGZvcmsgdGhlIGJ1bmRsZWQgYEBhbnRocm9waWMtYWkvY2xhdWRlLWFnZW50LXNka2BcbiAqIHN1YnByb2Nlc3MuIFRoYXQgZm9yayBpcyBleGVyY2lzZWQgbGl2ZSBieSB0aGUgUGhhc2UgNiBzbW9rZSBydW5cbiAqIChgc21va2UubWRgKS4gV2hhdCB0aGlzIHRlc3QgZ3VhcmFudGVlcyBpbiBDSSBpcyB0aGUgY3Jvc3MtY29tcG9uZW50XG4gKiB3aXJpbmcgdGhhdCBjb25uZWN0cyB0aGUgdHdvOlxuICogIC0gVGhlIGFnZW50IGNvbnN0cnVjdHMgYEJlYXJlciA8bm9uY2U+LjxzZXNzaW9uSWQ+YCBpbiBhIGZvcm1hdCB0aGVcbiAqICAgIHJlYWwgcHJveHkncyBhdXRoIHBhcnNlciBhY2NlcHRzLlxuICogIC0gVGhlIGFnZW50IHBhc3NlcyB0aGUgcHJveHkncyBhY3R1YWwgYGJhc2VVcmxgIHRocm91Z2hcbiAqICAgIGBPcHRpb25zLnNldHRpbmdzLmVudmAuXG4gKiAgLSBUaGUgcHJveHkncyBTU0UgZW5jb2Rpbmcgcm91bmQtdHJpcHMgdGhlIGNhbm5lZCB1cHN0cmVhbSBzdHJlYW0uXG4gKiAgLSBUaGUgYWdlbnQncyBzdHJpcC1lbnYgY29udHJhY3Qgb24gYE9wdGlvbnMuZW52YFxuICogICAgKGBOT0RFX09QVElPTlM9PT11bmRlZmluZWRgLCBgRUxFQ1RST05fUlVOX0FTX05PREU9PT0nMSdgKSBpc1xuICogICAgY2FwdHVyZWQgYnkgd2hhdCB0aGUgU0RLIHNlcnZpY2UgcmVjZWl2ZXMuXG4gKiAgLSBEaXNwb3NpbmcgdGhlIGFnZW50IGRpc3Bvc2VzIHRoZSBwcm94eSBoYW5kbGUgYW5kIHRoZSBXYXJtUXVlcnlcbiAqICAgIChubyBvcnBoYW4gcmVzb3VyY2VzKS5cbiAqL1xuXG5pbXBvcnQgdHlwZSBBbnRocm9waWMgZnJvbSAnQGFudGhyb3BpYy1haS9zZGsnO1xuaW1wb3J0IHR5cGUgeyBHZXRTZXNzaW9uTWVzc2FnZXNPcHRpb25zLCBPcHRpb25zLCBQZXJtaXNzaW9uUmVzdWx0LCBRdWVyeSwgU0RLQ29udHJvbEludGVycnVwdFJlc3BvbnNlLCBTREtNZXNzYWdlLCBTREtSZXN1bHRTdWNjZXNzLCBTREtTZXNzaW9uSW5mbywgU0RLU3lzdGVtTWVzc2FnZSwgU0RLVXNlck1lc3NhZ2UsIFNlc3Npb25NZXNzYWdlLCBXYXJtUXVlcnkgfSBmcm9tICdAYW50aHJvcGljLWFpL2NsYXVkZS1hZ2VudC1zZGsnO1xuaW1wb3J0IHR5cGUgeyBDQ0FNb2RlbCB9IGZyb20gJ0B2c2NvZGUvY29waWxvdC1hcGknO1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyB0eXBlIEFnZW50U2lnbmFsLCBHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgUmVzcG9uc2VQYXJ0S2luZCwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIENoYXRJbnB1dEFuc3dlclN0YXRlLCBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQsIHR5cGUgQ2hhdElucHV0UmVxdWVzdCwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkRhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZSB9IGZyb20gJy4vdGVzdEdpdEh1YkVuZHBvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENsYXVkZUFnZW50IH0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlQWdlbnQuanMnO1xuaW1wb3J0IHsgSUNsYXVkZUFnZW50U2RrU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZUFnZW50U2RrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW5NYW5hZ2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50UGx1Z2luTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVQcm94eVNlcnZpY2UsIElDbGF1ZGVQcm94eVNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVQcm94eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvcGlsb3RBcGlTZXJ2aWNlLCB0eXBlIElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvY29waWxvdEFwaVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlTm9vcEdpdFNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHtcblx0bWFrZUNvbnRlbnRCbG9ja1N0YXJ0VGV4dCxcblx0bWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSxcblx0bWFrZUNvbnRlbnRCbG9ja1N0b3AsXG5cdG1ha2VJbnB1dEpzb25EZWx0YSxcblx0bWFrZU1lc3NhZ2VTdGFydCxcblx0bWFrZU1lc3NhZ2VTdG9wLFxuXHRtYWtlU3RyZWFtRXZlbnQsXG5cdG1ha2VUZXh0RGVsdGEsXG5cdG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2UsXG59IGZyb20gJy4vY2xhdWRlTWFwU2Vzc2lvbkV2ZW50c1Rlc3RVdGlscy5qcyc7XG5cbi8vICNyZWdpb24gVGVzdCBmaXh0dXJlc1xuXG4vKipcbiAqIFRoZSB7QGxpbmsgSUZpbGVTZXJ2aWNlfSArIHtAbGluayBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlfSBwYWlyIHRoZVxuICogUGhhc2UgMTYgY3VzdG9taXphdGlvbiBkaXNrIHNjYW4gLyB3YXRjaGVyIG5lZWRzIGF0IHNlc3Npb24gY29uc3RydWN0aW9uXG4gKiB0aW1lLiBOb3RoaW5nIGlzIHNlZWRlZCB1bmRlciBgdXNlckhvbWVgLCBzbyB0aGUgc2NhbiBpcyBkZXRlcm1pbmlzdGljYWxseVxuICogZW1wdHkgXHUyMDE0IHRoZXNlIG9ubHkgZXhpc3Qgc28gYG5ldyBDbGF1ZGVBZ2VudFNlc3Npb25gIGNhbiByZWFkIGB1c2VySG9tZWBcbiAqIGFuZCBzdGFydCBpdHMgd2F0Y2hlciB3aXRob3V0IHRocm93aW5nLlxuICovXG5mdW5jdGlvbiBjbGF1ZGVGaWxlRW52U2VydmljZXMoZGlzcG9zYWJsZXM6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4pOiBbdHlwZW9mIElGaWxlU2VydmljZSB8IHR5cGVvZiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCBJRmlsZVNlcnZpY2UgfCBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlXVtdIHtcblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRjb25zdCBlbnY6IFBhcnRpYWw8SU5hdGl2ZUVudmlyb25tZW50U2VydmljZT4gPSB7IHVzZXJIb21lOiBVUkkuZmlsZSgnL21vY2staG9tZScpIH07XG5cdHJldHVybiBbXG5cdFx0W0lGaWxlU2VydmljZSwgZmlsZVNlcnZpY2VdLFxuXHRcdFtJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCBlbnYgYXMgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZV0sXG5cdF07XG59XG5cbmNvbnN0IEFOVEhST1BJQ19NT0RFTDogQ0NBTW9kZWwgPSB7XG5cdGlkOiAnY2xhdWRlLW9wdXMtNC42Jyxcblx0bmFtZTogJ0NsYXVkZSBPcHVzIDQuNicsXG5cdHZlbmRvcjogJ0FudGhyb3BpYycsXG5cdHN1cHBvcnRlZF9lbmRwb2ludHM6IFsnL3YxL21lc3NhZ2VzJ10sXG5cdG9iamVjdDogJ21vZGVsJyxcblx0dmVyc2lvbjogJzQuNicsXG5cdGlzX2NoYXRfZGVmYXVsdDogZmFsc2UsXG5cdGlzX2NoYXRfZmFsbGJhY2s6IGZhbHNlLFxuXHRtb2RlbF9waWNrZXJfY2F0ZWdvcnk6ICcnLFxuXHRtb2RlbF9waWNrZXJfZW5hYmxlZDogdHJ1ZSxcblx0cHJldmlldzogZmFsc2UsXG5cdGJpbGxpbmc6IHsgaXNfcHJlbWl1bTogZmFsc2UsIG11bHRpcGxpZXI6IDEsIHJlc3RyaWN0ZWRfdG86IFtdIH0sXG5cdGNhcGFiaWxpdGllczoge1xuXHRcdGZhbWlseTogJ3Rlc3QnLFxuXHRcdGxpbWl0czogeyBtYXhfY29udGV4dF93aW5kb3dfdG9rZW5zOiAyMDBfMDAwLCBtYXhfb3V0cHV0X3Rva2VuczogODE5MiwgbWF4X3Byb21wdF90b2tlbnM6IDIwMF8wMDAgfSxcblx0XHRvYmplY3Q6ICdtb2RlbF9jYXBhYmlsaXRpZXMnLFxuXHRcdHN1cHBvcnRzOiB7IHBhcmFsbGVsX3Rvb2xfY2FsbHM6IHRydWUsIHN0cmVhbWluZzogdHJ1ZSwgdG9vbF9jYWxsczogdHJ1ZSwgdmlzaW9uOiBmYWxzZSB9LFxuXHRcdHRva2VuaXplcjogJ28yMDBrX2Jhc2UnLFxuXHRcdHR5cGU6ICdjaGF0Jyxcblx0fSxcblx0cG9saWN5OiB7IHN0YXRlOiAnZW5hYmxlZCcsIHRlcm1zOiAnJyB9LFxufTtcblxuY29uc3QgVEVTVF9VVUlEID0gJzExMTExMTExLTIyMjItMzMzMy00NDQ0LTU1NTU1NTU1NTU1NSc7XG5cbmZ1bmN0aW9uIG1ha2VNZXNzYWdlKG1vZGVsOiBzdHJpbmcpOiBBbnRocm9waWMuTWVzc2FnZSB7XG5cdHJldHVybiB7XG5cdFx0aWQ6ICdtc2dfaW50X3Rlc3QnLFxuXHRcdHR5cGU6ICdtZXNzYWdlJyxcblx0XHRyb2xlOiAnYXNzaXN0YW50Jyxcblx0XHRtb2RlbCxcblx0XHRjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICcnLCBjaXRhdGlvbnM6IG51bGwgfV0sXG5cdFx0c3RvcF9yZWFzb246ICdlbmRfdHVybicsXG5cdFx0c3RvcF9zZXF1ZW5jZTogbnVsbCxcblx0XHRzdG9wX2RldGFpbHM6IG51bGwsXG5cdFx0Y29udGFpbmVyOiBudWxsLFxuXHRcdHVzYWdlOiB7XG5cdFx0XHRpbnB1dF90b2tlbnM6IDEsXG5cdFx0XHRvdXRwdXRfdG9rZW5zOiAxLFxuXHRcdFx0Y2FjaGVfY3JlYXRpb246IG51bGwsXG5cdFx0XHRjYWNoZV9jcmVhdGlvbl9pbnB1dF90b2tlbnM6IG51bGwsXG5cdFx0XHRjYWNoZV9yZWFkX2lucHV0X3Rva2VuczogbnVsbCxcblx0XHRcdGluZmVyZW5jZV9nZW86IG51bGwsXG5cdFx0XHRzZXJ2ZXJfdG9vbF91c2U6IG51bGwsXG5cdFx0XHRzZXJ2aWNlX3RpZXI6IG51bGwsXG5cdFx0fSxcblx0fTtcbn1cblxuLyoqIENhbm5lZCBBbnRocm9waWMgYE1lc3NhZ2VTdHJlYW1FdmVudGAgc2VxdWVuY2UgZm9yIHRoZSBgbWVzc2FnZXNgIHN0dWIuICovXG5mdW5jdGlvbiBtYWtlQ2FubmVkU3RyZWFtKG1vZGVsOiBzdHJpbmcpOiBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50W10ge1xuXHRjb25zdCBtZXNzYWdlID0gbWFrZU1lc3NhZ2UobW9kZWwpO1xuXHRjb25zdCBjb250ZW50QmxvY2tTdGFydDogQW50aHJvcGljLlJhd0NvbnRlbnRCbG9ja1N0YXJ0RXZlbnQgPSB7XG5cdFx0dHlwZTogJ2NvbnRlbnRfYmxvY2tfc3RhcnQnLFxuXHRcdGluZGV4OiAwLFxuXHRcdGNvbnRlbnRfYmxvY2s6IHsgdHlwZTogJ3RleHQnLCB0ZXh0OiAnJywgY2l0YXRpb25zOiBbXSB9LFxuXHR9O1xuXHRjb25zdCBjb250ZW50QmxvY2tEZWx0YTogQW50aHJvcGljLlJhd0NvbnRlbnRCbG9ja0RlbHRhRXZlbnQgPSB7XG5cdFx0dHlwZTogJ2NvbnRlbnRfYmxvY2tfZGVsdGEnLFxuXHRcdGluZGV4OiAwLFxuXHRcdGRlbHRhOiB7IHR5cGU6ICd0ZXh0X2RlbHRhJywgdGV4dDogJ2hlbGxvJyB9LFxuXHR9O1xuXHRjb25zdCBtZXNzYWdlRGVsdGE6IEFudGhyb3BpYy5SYXdNZXNzYWdlRGVsdGFFdmVudCA9IHtcblx0XHR0eXBlOiAnbWVzc2FnZV9kZWx0YScsXG5cdFx0ZGVsdGE6IHsgc3RvcF9yZWFzb246ICdlbmRfdHVybicsIHN0b3Bfc2VxdWVuY2U6IG51bGwsIHN0b3BfZGV0YWlsczogbnVsbCwgY29udGFpbmVyOiBudWxsIH0sXG5cdFx0dXNhZ2U6IHtcblx0XHRcdGlucHV0X3Rva2VuczogMSxcblx0XHRcdG91dHB1dF90b2tlbnM6IDEsXG5cdFx0XHRjYWNoZV9jcmVhdGlvbl9pbnB1dF90b2tlbnM6IG51bGwsXG5cdFx0XHRjYWNoZV9yZWFkX2lucHV0X3Rva2VuczogbnVsbCxcblx0XHRcdHNlcnZlcl90b29sX3VzZTogbnVsbCxcblx0XHR9LFxuXHR9O1xuXHRyZXR1cm4gW1xuXHRcdHsgdHlwZTogJ21lc3NhZ2Vfc3RhcnQnLCBtZXNzYWdlIH0sXG5cdFx0Y29udGVudEJsb2NrU3RhcnQsXG5cdFx0Y29udGVudEJsb2NrRGVsdGEsXG5cdFx0eyB0eXBlOiAnY29udGVudF9ibG9ja19zdG9wJywgaW5kZXg6IDAgfSxcblx0XHRtZXNzYWdlRGVsdGEsXG5cdFx0eyB0eXBlOiAnbWVzc2FnZV9zdG9wJyB9LFxuXHRdO1xufVxuXG5mdW5jdGlvbiBtYWtlU3lzdGVtSW5pdE1lc3NhZ2Uoc2Vzc2lvbklkOiBzdHJpbmcpOiBTREtTeXN0ZW1NZXNzYWdlIHtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiAnc3lzdGVtJyxcblx0XHRzdWJ0eXBlOiAnaW5pdCcsXG5cdFx0YXBpS2V5U291cmNlOiAndXNlcicsXG5cdFx0Y2xhdWRlX2NvZGVfdmVyc2lvbjogJzAuMC4wLXRlc3QnLFxuXHRcdGN3ZDogJy93b3Jrc3BhY2UnLFxuXHRcdHRvb2xzOiBbXSxcblx0XHRtY3Bfc2VydmVyczogW10sXG5cdFx0bW9kZWw6ICdjbGF1ZGUtdGVzdCcsXG5cdFx0cGVybWlzc2lvbk1vZGU6ICdkZWZhdWx0Jyxcblx0XHRzbGFzaF9jb21tYW5kczogW10sXG5cdFx0b3V0cHV0X3N0eWxlOiAnZGVmYXVsdCcsXG5cdFx0c2tpbGxzOiBbXSxcblx0XHRwbHVnaW5zOiBbXSxcblx0XHR1dWlkOiBURVNUX1VVSUQsXG5cdFx0c2Vzc2lvbl9pZDogc2Vzc2lvbklkLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlUmVzdWx0U3VjY2VzcyhzZXNzaW9uSWQ6IHN0cmluZyk6IFNES1Jlc3VsdFN1Y2Nlc3Mge1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6ICdyZXN1bHQnLFxuXHRcdHN1YnR5cGU6ICdzdWNjZXNzJyxcblx0XHRkdXJhdGlvbl9tczogMCxcblx0XHRkdXJhdGlvbl9hcGlfbXM6IDAsXG5cdFx0aXNfZXJyb3I6IGZhbHNlLFxuXHRcdG51bV90dXJuczogMSxcblx0XHRyZXN1bHQ6ICcnLFxuXHRcdHN0b3BfcmVhc29uOiAnZW5kX3R1cm4nLFxuXHRcdHRvdGFsX2Nvc3RfdXNkOiAwLFxuXHRcdHVzYWdlOiB7XG5cdFx0XHRjYWNoZV9jcmVhdGlvbjogeyBlcGhlbWVyYWxfMWhfaW5wdXRfdG9rZW5zOiAwLCBlcGhlbWVyYWxfNW1faW5wdXRfdG9rZW5zOiAwIH0sXG5cdFx0XHRjYWNoZV9jcmVhdGlvbl9pbnB1dF90b2tlbnM6IDAsXG5cdFx0XHRjYWNoZV9yZWFkX2lucHV0X3Rva2VuczogMCxcblx0XHRcdGluZmVyZW5jZV9nZW86ICd1bmtub3duJyxcblx0XHRcdGlucHV0X3Rva2VuczogMCxcblx0XHRcdGl0ZXJhdGlvbnM6IFtdLFxuXHRcdFx0b3V0cHV0X3Rva2VuczogMCxcblx0XHRcdHNlcnZlcl90b29sX3VzZTogeyB3ZWJfZmV0Y2hfcmVxdWVzdHM6IDAsIHdlYl9zZWFyY2hfcmVxdWVzdHM6IDAgfSxcblx0XHRcdHNlcnZpY2VfdGllcjogJ3N0YW5kYXJkJyxcblx0XHRcdHNwZWVkOiAnc3RhbmRhcmQnLFxuXHRcdH0sXG5cdFx0bW9kZWxVc2FnZToge30sXG5cdFx0cGVybWlzc2lvbl9kZW5pYWxzOiBbXSxcblx0XHR1dWlkOiBURVNUX1VVSUQsXG5cdFx0c2Vzc2lvbl9pZDogc2Vzc2lvbklkLFxuXHR9O1xufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gU3R1YmJlZCBDQVBJXG5cbmNsYXNzIFN0dWJDb3BpbG90QXBpU2VydmljZSBpbXBsZW1lbnRzIElDb3BpbG90QXBpU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHN0cmVhbUV2ZW50czogQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudFtdID0gW107XG5cdGF2YWlsYWJsZU1vZGVsczogQ0NBTW9kZWxbXSA9IFtBTlRIUk9QSUNfTU9ERUxdO1xuXG5cdHJlYWRvbmx5IG1lc3NhZ2VzQ2FsbENvdW50ID0geyBjb3VudDogMCB9O1xuXG5cdGFzeW5jIHJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCgpIHsgcmV0dXJuIHsgcmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IGZhbHNlLCB0cmFja2luZ0lkOiB1bmRlZmluZWQsIHRlbGVtZXRyeUVuZHBvaW50OiB1bmRlZmluZWQgfTsgfVxuXHRhc3luYyByZXNvbHZlQXBpRW5kcG9pbnQoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRtZXNzYWdlcyhcblx0XHR0b2tlbjogc3RyaW5nLFxuXHRcdHJlcXVlc3Q6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zU3RyZWFtaW5nLFxuXHRcdG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcblx0KTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD47XG5cdG1lc3NhZ2VzKFxuXHRcdHRva2VuOiBzdHJpbmcsXG5cdFx0cmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNOb25TdHJlYW1pbmcsXG5cdFx0b3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxuXHQpOiBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPjtcblx0bWVzc2FnZXMoXG5cdFx0dG9rZW46IHN0cmluZyxcblx0XHRyZXF1ZXN0OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtcyxcblx0XHRvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+IHwgUHJvbWlzZTxBbnRocm9waWMuTWVzc2FnZT4ge1xuXHRcdHRoaXMubWVzc2FnZXNDYWxsQ291bnQuY291bnQrKztcblx0XHRpZiAocmVxdWVzdC5zdHJlYW0pIHtcblx0XHRcdHJldHVybiB0aGlzLl9zdHJlYW0ob3B0aW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ25vbi1zdHJlYW1pbmcgbm90IHVzZWQgaW4gaW50ZWdyYXRpb24gdGVzdCcpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgKl9zdHJlYW0oXG5cdFx0b3B0aW9uczogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdCk6IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+IHtcblx0XHRmb3IgKGNvbnN0IGV2IG9mIHRoaXMuc3RyZWFtRXZlbnRzKSB7XG5cdFx0XHRpZiAob3B0aW9ucz8uc2lnbmFsPy5hYm9ydGVkKSB7XG5cdFx0XHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcignQWJvcnRlZCcpO1xuXHRcdFx0XHQoZXJyIGFzIHsgbmFtZTogc3RyaW5nIH0pLm5hbWUgPSAnQWJvcnRFcnJvcic7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHRcdHlpZWxkIGV2O1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNvdW50VG9rZW5zKCk6IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2VUb2tlbnNDb3VudD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignY291bnRUb2tlbnMgbm90IHVzZWQgaW4gaW50ZWdyYXRpb24gdGVzdCcpO1xuXHR9XG5cblx0YXN5bmMgbW9kZWxzKCk6IFByb21pc2U8Q0NBTW9kZWxbXT4ge1xuXHRcdHJldHVybiB0aGlzLmF2YWlsYWJsZU1vZGVscztcblx0fVxuXG5cdGFzeW5jIHJlc3BvbnNlcygpOiBQcm9taXNlPFJlc3BvbnNlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdyZXNwb25zZXMgbm90IHVzZWQgaW4gQ2xhdWRlIGludGVncmF0aW9uIHRlc3RzJyk7XG5cdH1cblxuXHRhc3luYyB1dGlsaXR5Q2hhdENvbXBsZXRpb24oKTogUHJvbWlzZTxuZXZlcj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcigndXRpbGl0eUNoYXRDb21wbGV0aW9uIG5vdCB1c2VkIGluIENsYXVkZSBpbnRlZ3JhdGlvbiB0ZXN0cycpO1xuXHR9XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBSZWNvcmRpbmcgU0RLIHNlcnZpY2UgdGhhdCByb3VuZC10cmlwcyB0aHJvdWdoIHRoZSByZWFsIHByb3h5XG5cbmludGVyZmFjZSBJUHJveHlSb3VuZFRyaXBSZXN1bHQge1xuXHRyZWFkb25seSBzdGF0dXM6IG51bWJlcjtcblx0cmVhZG9ubHkgY29udGVudFR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZXZlbnRzOiByZWFkb25seSB7IHJlYWRvbmx5IHR5cGU6IHN0cmluZzsgcmVhZG9ubHkgZGF0YTogdW5rbm93biB9W107XG59XG5cbi8qKlxuICogTWFya2VyIGVudHJ5IHRoZSB0ZXN0IGNhbiBpbnRlcmxlYXZlIGluc2lkZVxuICoge0BsaW5rIFByb3h5Um91bmRUcmlwU2RrU2VydmljZS5xdWVyeU1lc3NhZ2VzfSBiZXR3ZWVuIFNESyBtZXNzYWdlcy5cbiAqIFdoZW4ge0BsaW5rIFJvdW5kVHJpcFF1ZXJ5Lm5leHR9IGVuY291bnRlcnMgYSBtYXJrZXIsIGl0IGludm9rZXMgdGhlXG4gKiBjYXB0dXJlZCB7QGxpbmsgT3B0aW9ucy5jYW5Vc2VUb29sfSBjbG9zdXJlIGFuZCB3YWl0cyBmb3IgaXQgdG9cbiAqIHJlc29sdmUgYmVmb3JlIHByb2NlZWRpbmcgdG8gdGhlIG5leHQgZW50cnksIG1pcnJvcmluZyB0aGUgcmVhbCBTREtcbiAqIHN1YnByb2Nlc3MncyBiZWhhdmlvdXIgYXJvdW5kIGFuIGFzc2lzdGFudCBgdG9vbF91c2VgIFx1MjE5MiBzeW50aGV0aWNcbiAqIHVzZXIgYHRvb2xfcmVzdWx0YCByb3VuZC10cmlwLlxuICovXG5pbnRlcmZhY2UgQ2FuVXNlVG9vbE1hcmtlciB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdjYW5Vc2VUb29sJztcblx0cmVhZG9ubHkgdG9vbE5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaW5wdXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRyZWFkb25seSB0b29sVXNlSUQ6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEVsaWNpdGF0aW9uTWFya2VyIHtcblx0cmVhZG9ubHkga2luZDogJ2VsaWNpdGF0aW9uJztcblx0cmVhZG9ubHkgcmVxdWVzdDogUGFyYW1ldGVyczxOb25OdWxsYWJsZTxPcHRpb25zWydvbkVsaWNpdGF0aW9uJ10+PlswXTtcbn1cblxudHlwZSBRdWVyeVN0cmVhbUl0ZW0gPSBTREtNZXNzYWdlIHwgQ2FuVXNlVG9vbE1hcmtlciB8IEVsaWNpdGF0aW9uTWFya2VyO1xuXG5mdW5jdGlvbiBpc0NhblVzZVRvb2xNYXJrZXIoaXRlbTogUXVlcnlTdHJlYW1JdGVtKTogaXRlbSBpcyBDYW5Vc2VUb29sTWFya2VyIHtcblx0cmV0dXJuIChpdGVtIGFzIENhblVzZVRvb2xNYXJrZXIpLmtpbmQgPT09ICdjYW5Vc2VUb29sJztcbn1cblxuZnVuY3Rpb24gaXNFbGljaXRhdGlvbk1hcmtlcihpdGVtOiBRdWVyeVN0cmVhbUl0ZW0pOiBpdGVtIGlzIEVsaWNpdGF0aW9uTWFya2VyIHtcblx0cmV0dXJuIChpdGVtIGFzIEVsaWNpdGF0aW9uTWFya2VyKS5raW5kID09PSAnZWxpY2l0YXRpb24nO1xufVxuXG4vKipcbiAqIFRlc3QgZG91YmxlIGZvciB7QGxpbmsgSUNsYXVkZUFnZW50U2RrU2VydmljZX0uIE9uIGBzdGFydHVwKClgLCBwZXJmb3Jtc1xuICogYSByZWFsIEhUVFAgYFBPU1QgL3YxL21lc3NhZ2VzYCBhZ2FpbnN0IHRoZSBwcm94eSBVUkwgdGhlIGFnZW50IHBhc3NlZFxuICogdmlhIGBPcHRpb25zLnNldHRpbmdzLmVudmAsIHVzaW5nIHRoZSBiZWFyZXIgdGhlIGFnZW50IGNvbnN0cnVjdGVkLlxuICogVGhpcyBzdGFuZHMgaW4gZm9yIHRoZSBTREsgc3VicHJvY2VzcydzIGZpcnN0IG1vZGVsIGNhbGwgc28gd2UgY2FuXG4gKiBhc3NlcnQgdGhlIGFnZW50IFx1MjE5MiBwcm94eSBcdTIxOTIgQ0FQSSByb3VuZC10cmlwIHdvcmtzIHdpdGhvdXQgZm9ya2luZ1xuICogYEBhbnRocm9waWMtYWkvY2xhdWRlLWFnZW50LXNka2AncyBidW5kbGVkIENMSS5cbiAqL1xuY2xhc3MgUHJveHlSb3VuZFRyaXBTZGtTZXJ2aWNlIGltcGxlbWVudHMgSUNsYXVkZUFnZW50U2RrU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGNhcHR1cmVkU3RhcnR1cE9wdGlvbnM6IE9wdGlvbnNbXSA9IFtdO1xuXHRyZWFkb25seSBwcm94eVJvdW5kVHJpcHM6IElQcm94eVJvdW5kVHJpcFJlc3VsdFtdID0gW107XG5cblx0LyoqXG5cdCAqIEl0ZW1zIHRoZSBwcm9kdWNlZCBXYXJtUXVlcnkncyBRdWVyeSB3aWxsIHlpZWxkIGluIG9yZGVyLiBTREtcblx0ICogbWVzc2FnZXMgZmxvdyB0aHJvdWdoIHVuY2hhbmdlZDsge0BsaW5rIENhblVzZVRvb2xNYXJrZXJ9IGVudHJpZXNcblx0ICogcGF1c2UgdGhlIGl0ZXJhdG9yIGFuZCBpbnZva2UgdGhlIGNhcHR1cmVkXG5cdCAqIGBPcHRpb25zLmNhblVzZVRvb2xgIGNsb3N1cmUgKG1pcnJvcmluZyB3aGF0IHRoZSByZWFsIFNES1xuXHQgKiBzdWJwcm9jZXNzIGRvZXMgYmV0d2VlbiBhc3Npc3RhbnQgYHRvb2xfdXNlYCBhbmQgdGhlIHN5bnRoZXRpY1xuXHQgKiBgdXNlcmAgYHRvb2xfcmVzdWx0YCBpdCBmb2xsb3dzIHVwIHdpdGgpLlxuXHQgKi9cblx0cXVlcnlNZXNzYWdlczogUXVlcnlTdHJlYW1JdGVtW10gPSBbXTtcblxuXHQvKiogUmVjb3JkcyB0aGUge0BsaW5rIFBlcm1pc3Npb25SZXN1bHR9IHJldHVybmVkIGJ5IGVhY2ggYGNhblVzZVRvb2xgIGludm9jYXRpb24gaW4ge0BsaW5rIHF1ZXJ5TWVzc2FnZXN9IG9yZGVyLiAqL1xuXHRyZWFkb25seSBjYW5Vc2VUb29sUmVzdWx0czogKFBlcm1pc3Npb25SZXN1bHQgfCBudWxsKVtdID0gW107XG5cdHJlYWRvbmx5IGVsaWNpdGF0aW9uUmVzdWx0czogQXdhaXRlZDxSZXR1cm5UeXBlPE5vbk51bGxhYmxlPE9wdGlvbnNbJ29uRWxpY2l0YXRpb24nXT4+PltdID0gW107XG5cblx0cmVhZG9ubHkgd2FybVF1ZXJpZXM6IFJvdW5kVHJpcFdhcm1RdWVyeVtdID0gW107XG5cblx0YXN5bmMgbGlzdFNlc3Npb25zKCk6IFByb21pc2U8cmVhZG9ubHkgU0RLU2Vzc2lvbkluZm9bXT4ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIGNhbkxvYWRXaXRob3V0RG93bmxvYWQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyBnZXRTZXNzaW9uSW5mbyhfc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPFNES1Nlc3Npb25JbmZvIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGdldFNlc3Npb25NZXNzYWdlcyhfc2Vzc2lvbklkOiBzdHJpbmcsIF9vcHRpb25zPzogR2V0U2Vzc2lvbk1lc3NhZ2VzT3B0aW9ucyk6IFByb21pc2U8cmVhZG9ubHkgU2Vzc2lvbk1lc3NhZ2VbXT4ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIGxpc3RTdWJhZ2VudHMoX3Nlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBzdHJpbmdbXT4ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIGdldFN1YmFnZW50TWVzc2FnZXMoX3Nlc3Npb25JZDogc3RyaW5nLCBfYWdlbnRJZDogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBTZXNzaW9uTWVzc2FnZVtdPiB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0YXN5bmMgZm9ya1Nlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHsgc2Vzc2lvbklkOiBzdHJpbmcgfT4ge1xuXHRcdHJldHVybiB7IHNlc3Npb25JZDogYGZvcmtlZC0ke3Nlc3Npb25JZH1gIH07XG5cdH1cblxuXHRhc3luYyBkZWxldGVTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4geyAvKiBub3QgZXhlcmNpc2VkIGJ5IHRoZSBwcm94eSByb3VuZC10cmlwICovIH1cblxuXHRhc3luYyBjcmVhdGVTZGtNY3BTZXJ2ZXIoKTogUHJvbWlzZTxuZXZlcj4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCBpbiBpbnRlZ3JhdGlvbiB0ZXN0IGZha2UnKTsgfVxuXHRhc3luYyB0b29sKCk6IFByb21pc2U8bmV2ZXI+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQgaW4gaW50ZWdyYXRpb24gdGVzdCBmYWtlJyk7IH1cblxuXHRhc3luYyBxdWVyeShfcGFyYW1zOiB7IHByb21wdDogc3RyaW5nIHwgQXN5bmNJdGVyYWJsZTxTREtVc2VyTWVzc2FnZT47IG9wdGlvbnM/OiBPcHRpb25zIH0pOiBQcm9taXNlPFF1ZXJ5PiB7IHRocm93IG5ldyBFcnJvcigncXVlcnkgbm90IHVzZWQgaW4gcHJveHkgcm91bmQtdHJpcCBpbnRlZ3JhdGlvbiB0ZXN0Jyk7IH1cblxuXHRhc3luYyBzdGFydHVwKHBhcmFtczogeyBvcHRpb25zOiBPcHRpb25zOyBpbml0aWFsaXplVGltZW91dE1zPzogbnVtYmVyIH0pOiBQcm9taXNlPFdhcm1RdWVyeT4ge1xuXHRcdHRoaXMuY2FwdHVyZWRTdGFydHVwT3B0aW9ucy5wdXNoKHBhcmFtcy5vcHRpb25zKTtcblx0XHRjb25zdCBzZXR0aW5ncyA9IHBhcmFtcy5vcHRpb25zLnNldHRpbmdzO1xuXHRcdGNvbnN0IHNldHRpbmdzRW52ID0gKHNldHRpbmdzICYmIHR5cGVvZiBzZXR0aW5ncyA9PT0gJ29iamVjdCcgJiYgc2V0dGluZ3MuZW52KSA/IHNldHRpbmdzLmVudiA6IHt9O1xuXHRcdGNvbnN0IGJhc2VVcmwgPSBzZXR0aW5nc0VudlsnQU5USFJPUElDX0JBU0VfVVJMJ107XG5cdFx0Y29uc3QgYmVhcmVyID0gc2V0dGluZ3NFbnZbJ0FOVEhST1BJQ19BVVRIX1RPS0VOJ107XG5cdFx0aWYgKCFiYXNlVXJsIHx8ICFiZWFyZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQU5USFJPUElDX0JBU0VfVVJMIC8gQU5USFJPUElDX0FVVEhfVE9LRU4gbWlzc2luZyBmcm9tIHNldHRpbmdzLmVudicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBvc3RTc2VUb1Byb3h5KGAke2Jhc2VVcmx9L3YxL21lc3NhZ2VzYCwgYmVhcmVyLCB7XG5cdFx0XHRtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsXG5cdFx0XHRtZXNzYWdlczogW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnaGknIH1dLFxuXHRcdFx0c3RyZWFtOiB0cnVlLFxuXHRcdFx0bWF4X3Rva2VuczogNDA5Nixcblx0XHR9KTtcblx0XHR0aGlzLnByb3h5Um91bmRUcmlwcy5wdXNoKHJlc3VsdCk7XG5cblx0XHRjb25zdCB3YXJtID0gbmV3IFJvdW5kVHJpcFdhcm1RdWVyeSh0aGlzKTtcblx0XHR0aGlzLndhcm1RdWVyaWVzLnB1c2god2FybSk7XG5cdFx0cmV0dXJuIHdhcm07XG5cdH1cbn1cblxuY2xhc3MgUm91bmRUcmlwV2FybVF1ZXJ5IGltcGxlbWVudHMgV2FybVF1ZXJ5IHtcblx0YXN5bmNEaXNwb3NlQ291bnQgPSAwO1xuXHRjbG9zZUNvdW50ID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9zZGs6IFByb3h5Um91bmRUcmlwU2RrU2VydmljZSkgeyB9XG5cblx0cXVlcnkocHJvbXB0OiBzdHJpbmcgfCBBc3luY0l0ZXJhYmxlPFNES1VzZXJNZXNzYWdlPik6IFF1ZXJ5IHtcblx0XHRpZiAodHlwZW9mIHByb21wdCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignaW50ZWdyYXRpb24gdGVzdDogYWdlbnQgaG9zdCBhbHdheXMgcGFzc2VzIGFuIEFzeW5jSXRlcmFibGUnKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSb3VuZFRyaXBRdWVyeShwcm9tcHQsIHRoaXMuX3Nkayk7XG5cdH1cblxuXHRjbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNsb3NlQ291bnQrKztcblx0fVxuXG5cdGFzeW5jIFtTeW1ib2wuYXN5bmNEaXNwb3NlXSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmFzeW5jRGlzcG9zZUNvdW50Kys7XG5cdH1cbn1cblxuY2xhc3MgUm91bmRUcmlwUXVlcnkgaW1wbGVtZW50cyBBc3luY0dlbmVyYXRvcjxTREtNZXNzYWdlLCB2b2lkPiB7XG5cdHByaXZhdGUgX2luZGV4ID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfZHJhaW5lcjogUHJvbWlzZTx2b2lkPjtcblxuXHRjb25zdHJ1Y3Rvcihwcm9tcHQ6IEFzeW5jSXRlcmFibGU8U0RLVXNlck1lc3NhZ2U+LCBwcml2YXRlIHJlYWRvbmx5IF9zZGs6IFByb3h5Um91bmRUcmlwU2RrU2VydmljZSkge1xuXHRcdC8vIERyYWluIHRoZSBwcm9tcHQgaXRlcmFibGUgaW4gdGhlIGJhY2tncm91bmQgc28gdGhlIGFnZW50J3Ncblx0XHQvLyBgX3BlbmRpbmdQcm9tcHREZWZlcnJlZC5jb21wbGV0ZSgpYCBhY3R1YWxseSBwdW1wcyB0aGUgcXVldWUuXG5cdFx0Y29uc3QgaXQgPSBwcm9tcHRbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCk7XG5cdFx0dGhpcy5fZHJhaW5lciA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjb25zdCByID0gYXdhaXQgaXQubmV4dCgpO1xuXHRcdFx0XHRpZiAoci5kb25lKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkoKTtcblx0fVxuXG5cdFtTeW1ib2wuYXN5bmNJdGVyYXRvcl0oKTogQXN5bmNHZW5lcmF0b3I8U0RLTWVzc2FnZSwgdm9pZD4ge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0YXN5bmMgbmV4dCgpOiBQcm9taXNlPEl0ZXJhdG9yUmVzdWx0PFNES01lc3NhZ2UsIHZvaWQ+PiB7XG5cdFx0d2hpbGUgKHRoaXMuX2luZGV4IDwgdGhpcy5fc2RrLnF1ZXJ5TWVzc2FnZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gdGhpcy5fc2RrLnF1ZXJ5TWVzc2FnZXNbdGhpcy5faW5kZXgrK107XG5cdFx0XHRpZiAoaXNDYW5Vc2VUb29sTWFya2VyKGl0ZW0pKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0dXAgPSB0aGlzLl9zZGsuY2FwdHVyZWRTdGFydHVwT3B0aW9uc1swXTtcblx0XHRcdFx0aWYgKCFzdGFydHVwPy5jYW5Vc2VUb29sKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdpbnRlZ3JhdGlvbiB0ZXN0OiBjYW5Vc2VUb29sIG1hcmtlciBidXQgT3B0aW9ucy5jYW5Vc2VUb29sIG5vdCB3aXJlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN0YXJ0dXAuY2FuVXNlVG9vbChpdGVtLnRvb2xOYW1lLCBpdGVtLmlucHV0LCB7XG5cdFx0XHRcdFx0c2lnbmFsOiBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsLFxuXHRcdFx0XHRcdHRvb2xVc2VJRDogaXRlbS50b29sVXNlSUQsXG5cdFx0XHRcdFx0cmVxdWVzdElkOiBpdGVtLnRvb2xVc2VJRCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX3Nkay5jYW5Vc2VUb29sUmVzdWx0cy5wdXNoKHJlc3VsdCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzRWxpY2l0YXRpb25NYXJrZXIoaXRlbSkpIHtcblx0XHRcdFx0Y29uc3Qgc3RhcnR1cCA9IHRoaXMuX3Nkay5jYXB0dXJlZFN0YXJ0dXBPcHRpb25zWzBdO1xuXHRcdFx0XHRpZiAoIXN0YXJ0dXA/Lm9uRWxpY2l0YXRpb24pIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ludGVncmF0aW9uIHRlc3Q6IGVsaWNpdGF0aW9uIG1hcmtlciBidXQgT3B0aW9ucy5vbkVsaWNpdGF0aW9uIG5vdCB3aXJlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN0YXJ0dXAub25FbGljaXRhdGlvbihpdGVtLnJlcXVlc3QsIHsgc2lnbmFsOiBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsIH0pO1xuXHRcdFx0XHR0aGlzLl9zZGsuZWxpY2l0YXRpb25SZXN1bHRzLnB1c2gocmVzdWx0KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBkb25lOiBmYWxzZSwgdmFsdWU6IGl0ZW0gfTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZHJhaW5lcjtcblx0XHRyZXR1cm4geyBkb25lOiB0cnVlLCB2YWx1ZTogdW5kZWZpbmVkIH07XG5cdH1cblxuXHRhc3luYyByZXR1cm4oKTogUHJvbWlzZTxJdGVyYXRvclJlc3VsdDxTREtNZXNzYWdlLCB2b2lkPj4ge1xuXHRcdHJldHVybiB7IGRvbmU6IHRydWUsIHZhbHVlOiB1bmRlZmluZWQgfTtcblx0fVxuXG5cdGFzeW5jIHRocm93KGVycjogdW5rbm93bik6IFByb21pc2U8SXRlcmF0b3JSZXN1bHQ8U0RLTWVzc2FnZSwgdm9pZD4+IHtcblx0XHR0aHJvdyBlcnI7XG5cdH1cblxuXHRhc3luYyBpbnRlcnJ1cHQoKTogUHJvbWlzZTxTREtDb250cm9sSW50ZXJydXB0UmVzcG9uc2UgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdHNldFBlcm1pc3Npb25Nb2RlKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHNldE1jcFBlcm1pc3Npb25Nb2RlT3ZlcnJpZGUoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0c2V0TW9kZWwoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0c2V0TWF4VGhpbmtpbmdUb2tlbnMoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0YXBwbHlGbGFnU2V0dGluZ3MoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0aW5pdGlhbGl6YXRpb25SZXN1bHQoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0cmVpbml0aWFsaXplKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHN1cHBvcnRlZENvbW1hbmRzKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHN1cHBvcnRlZE1vZGVscygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRzdXBwb3J0ZWRBZ2VudHMoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0bWNwU2VydmVyU3RhdHVzKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdGdldENvbnRleHRVc2FnZSgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHR1c2FnZV9FWFBFUklNRU5UQUxfTUFZX0NIQU5HRV9ET19OT1RfUkVMWV9PTl9USElTX0FQSV9ZRVQoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0cmVsb2FkUGx1Z2lucygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRhY2NvdW50SW5mbygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRyZXdpbmRGaWxlcygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRyZWFkRmlsZSgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRzZWVkUmVhZFN0YXRlKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHJlY29ubmVjdE1jcFNlcnZlcigpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHR0b2dnbGVNY3BTZXJ2ZXIoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0c2V0TWNwU2VydmVycygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRzdHJlYW1JbnB1dCgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRzdG9wVGFzaygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRyZWxvYWRTa2lsbHMoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0YmFja2dyb3VuZFRhc2tzKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdGNsb3NlKCk6IHZvaWQgeyAvKiBuby1vcCAqLyB9XG5cdFtTeW1ib2wuYXN5bmNEaXNwb3NlXSgpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpOyB9XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBIVFRQIGhlbHBlcnNcblxubGV0IF9odHRwTW9kdWxlOiB0eXBlb2YgaHR0cCB8IHVuZGVmaW5lZDtcbmFzeW5jIGZ1bmN0aW9uIGdldEh0dHAoKTogUHJvbWlzZTx0eXBlb2YgaHR0cD4ge1xuXHRpZiAoIV9odHRwTW9kdWxlKSB7XG5cdFx0X2h0dHBNb2R1bGUgPSBhd2FpdCBpbXBvcnQoJ2h0dHAnKTtcblx0fVxuXHRyZXR1cm4gX2h0dHBNb2R1bGU7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBvc3RTc2VUb1Byb3h5KFxuXHR1cmw6IHN0cmluZyxcblx0YmVhcmVyOiBzdHJpbmcsXG5cdHBheWxvYWQ6IG9iamVjdCxcbik6IFByb21pc2U8SVByb3h5Um91bmRUcmlwUmVzdWx0PiB7XG5cdGNvbnN0IGh0dHBNb2QgPSBhd2FpdCBnZXRIdHRwKCk7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgdSA9IG5ldyBVUkwodXJsKTtcblx0XHRjb25zdCBib2R5ID0gSlNPTi5zdHJpbmdpZnkocGF5bG9hZCk7XG5cdFx0Y29uc3QgcmVxID0gaHR0cE1vZC5yZXF1ZXN0KHtcblx0XHRcdGhvc3RuYW1lOiB1Lmhvc3RuYW1lLFxuXHRcdFx0cG9ydDogdS5wb3J0LFxuXHRcdFx0cGF0aDogdS5wYXRobmFtZSArIHUuc2VhcmNoLFxuXHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2JlYXJlcn1gLFxuXHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHQnQ29udGVudC1MZW5ndGgnOiBCdWZmZXIuYnl0ZUxlbmd0aChib2R5KS50b1N0cmluZygpLFxuXHRcdFx0XHQnQWNjZXB0JzogJ3RleHQvZXZlbnQtc3RyZWFtJyxcblx0XHRcdFx0J2FudGhyb3BpYy12ZXJzaW9uJzogJzIwMjMtMDYtMDEnLFxuXHRcdFx0fSxcblx0XHR9LCByZXMgPT4ge1xuXHRcdFx0Y29uc3QgY2h1bmtzOiBCdWZmZXJbXSA9IFtdO1xuXHRcdFx0cmVzLm9uKCdkYXRhJywgYyA9PiBjaHVua3MucHVzaChCdWZmZXIuaXNCdWZmZXIoYykgPyBjIDogQnVmZmVyLmZyb20oYykpKTtcblx0XHRcdHJlcy5vbignZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByYXcgPSBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoJ3V0ZjgnKTtcblx0XHRcdFx0cmVzb2x2ZSh7XG5cdFx0XHRcdFx0c3RhdHVzOiByZXMuc3RhdHVzQ29kZSA/PyAwLFxuXHRcdFx0XHRcdGNvbnRlbnRUeXBlOiB0eXBlb2YgcmVzLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID09PSAnc3RyaW5nJyA/IHJlcy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRldmVudHM6IHBhcnNlU3NlRnJhbWVzKHJhdyksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXMub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHR9KTtcblx0XHRyZXEub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRyZXEud3JpdGUoYm9keSk7XG5cdFx0cmVxLmVuZCgpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gcGFyc2VTc2VGcmFtZXMocmF3OiBzdHJpbmcpOiB7IHR5cGU6IHN0cmluZzsgZGF0YTogdW5rbm93biB9W10ge1xuXHRjb25zdCBvdXQ6IHsgdHlwZTogc3RyaW5nOyBkYXRhOiB1bmtub3duIH1bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGJsb2NrIG9mIHJhdy5zcGxpdCgnXFxuXFxuJykpIHtcblx0XHRpZiAoIWJsb2NrLnRyaW0oKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGxldCBldmVudCA9ICcnO1xuXHRcdGxldCBkYXRhID0gJyc7XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGJsb2NrLnNwbGl0KCdcXG4nKSkge1xuXHRcdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnZXZlbnQ6ICcpKSB7XG5cdFx0XHRcdGV2ZW50ID0gbGluZS5zbGljZSgnZXZlbnQ6ICcubGVuZ3RoKS50cmltKCk7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmUuc3RhcnRzV2l0aCgnZGF0YTogJykpIHtcblx0XHRcdFx0ZGF0YSA9IGxpbmUuc2xpY2UoJ2RhdGE6ICcubGVuZ3RoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGV2ZW50ICYmIGRhdGEpIHtcblx0XHRcdGxldCBwYXJzZWQ6IHVua25vd247XG5cdFx0XHR0cnkgeyBwYXJzZWQgPSBKU09OLnBhcnNlKGRhdGEpOyB9IGNhdGNoIHsgcGFyc2VkID0gZGF0YTsgfVxuXHRcdFx0b3V0LnB1c2goeyB0eXBlOiBldmVudCwgZGF0YTogcGFyc2VkIH0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gb3V0O1xufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gU3VpdGVcblxuc3VpdGUoJ0NsYXVkZUFnZW50IGludGVncmF0aW9uIChwcm94eS1iYWNrZWQpJywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYWdlbnQgXHUyMTkyIHByb3h5IFx1MjE5MiBDQVBJIFx1MjE5MiBTU0UgXHUyMTkyIGFnZW50OiBlbmQtdG8tZW5kIHBpcGVsaW5lIHdpdGggcmVhbCBwcm94eSBhbmQgc3R1YmJlZCBDQVBJJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoaXMgaXMgdGhlIFBoYXNlIDYgXHUwMEE3NS4yIGludGVncmF0aW9uIHRlc3Q6IHJlYWwgQ2xhdWRlUHJveHlTZXJ2aWNlXG5cdFx0Ly8gKyByZWFsIENsYXVkZUFnZW50ICsgc3R1YmJlZCBJQ29waWxvdEFwaVNlcnZpY2UgKyByZWNvcmRpbmcgU0RLXG5cdFx0Ly8gc2VydmljZSB0aGF0IHBlcmZvcm1zIGEgcmVhbCBIVFRQIHJvdW5kLXRyaXAgb24gdGhlIHByb3h5IGZyb21cblx0XHQvLyBpbnNpZGUgYHN0YXJ0dXAoKWAuIENhdGNoZXMgcmVncmVzc2lvbnMgaW4gYW55IG9mOlxuXHRcdC8vICAgLSBBZ2VudCdzIGBPcHRpb25zLnNldHRpbmdzLmVudmAgd2lyaW5nIChCQVNFX1VSTCAvIEFVVEhfVE9LRU4pLlxuXHRcdC8vICAgLSBQcm94eSdzIGBCZWFyZXIgPG5vbmNlPi48c2Vzc2lvbklkPmAgcGFyc2VyLlxuXHRcdC8vICAgLSBQcm94eSdzIG1vZGVsLWlkIHJld3JpdGUgKFNESyBcdTIxOTQgZW5kcG9pbnQgZm9ybWF0KS5cblx0XHQvLyAgIC0gUHJveHkncyBTU0UgZnJhbWUgZW5jb2RpbmcuXG5cdFx0Ly8gICAtIEFnZW50J3MgYE9wdGlvbnMuZW52YCBzdHJpcCBjb250cmFjdC5cblx0XHRjb25zdCBjYXBpID0gbmV3IFN0dWJDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNhcGkuc3RyZWFtRXZlbnRzID0gbWFrZUNhbm5lZFN0cmVhbSgnY2xhdWRlLW9wdXMtNC42Jyk7XG5cblx0XHRjb25zdCByZWFsUHJveHkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENsYXVkZVByb3h5U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY2FwaSkpO1xuXHRcdGNvbnN0IHNkayA9IG5ldyBQcm94eVJvdW5kVHJpcFNka1NlcnZpY2UoKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTG9nU2VydmljZSwgbG9nU2VydmljZV0sXG5cdFx0XHRbSUNvcGlsb3RBcGlTZXJ2aWNlLCBjYXBpXSxcblx0XHRcdFtJQ2xhdWRlUHJveHlTZXJ2aWNlLCByZWFsUHJveHldLFxuXHRcdFx0W0lTZXNzaW9uRGF0YVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZSgpXSxcblx0XHRcdFtJQ2xhdWRlQWdlbnRTZGtTZXJ2aWNlLCBzZGtdLFxuXHRcdFx0W0lBZ2VudFBsdWdpbk1hbmFnZXIsIHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRiYXNlUGF0aDogVVJJLmZyb20oeyBzY2hlbWU6ICdpbm1lbW9yeScsIHBhdGg6ICcvYWdlbnRQbHVnaW5zJyB9KSxcblx0XHRcdFx0YXN5bmMgc3luY0N1c3RvbWl6YXRpb25zKF9jbGllbnRJZDogc3RyaW5nLCBfY3VzdG9taXphdGlvbnM6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSkgeyByZXR1cm4gW107IH0sXG5cdFx0XHR9XSxcblx0XHRcdFtJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlnU2VydmljZV0sXG5cdFx0XHRbSUFnZW50SG9zdFN0YXRlTWFuYWdlciwgc3RhdGVNYW5hZ2VyXSxcblx0XHRcdFtJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLCBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKCldLFxuXHRcdFx0W0lBZ2VudEhvc3RHaXRTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpXSxcblx0XHRcdC4uLmNsYXVkZUZpbGVFbnZTZXJ2aWNlcyhkaXNwb3NhYmxlcyksXG5cdFx0KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMpKTtcblx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGF1ZGVBZ2VudCkpO1xuXG5cdFx0Ly8gQXV0aGVudGljYXRlIFx1MjAxNCBib290cyB0aGUgcHJveHkgYW5kIHNuYXBzaG90cyB0aGUgbW9kZWwgbGlzdC5cblx0XHRjb25zdCBhY2NlcHRlZCA9IGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZShHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UucmVzb3VyY2UsICdnaC1pbnQtdGVzdC10b2tlbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2NlcHRlZCwgdHJ1ZSk7XG5cblx0XHQvLyBDcmVhdGUgYSBwcm92aXNpb25hbCBzZXNzaW9uIFx1MjAxNCBubyBTREsgY29udGFjdCB5ZXQuXG5cdFx0Y29uc3QgY3JlYXRlZCA9IGF3YWl0IGFnZW50LmNyZWF0ZVNlc3Npb24oeyB3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL2ludGVncmF0aW9uLWN3ZCcpXSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2RrLmNhcHR1cmVkU3RhcnR1cE9wdGlvbnMubGVuZ3RoLCAwLCAnY3JlYXRlU2Vzc2lvbiBkb2VzIG5vdCB0b3VjaCB0aGUgU0RLJyk7XG5cblx0XHQvLyBTdGFnZSBhIHRyYW5zY3JpcHQgb24gdGhlIFNESyBzbyBgc2VuZE1lc3NhZ2VgIHJlc29sdmVzLlxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IGNyZWF0ZWQuc2Vzc2lvbi5wYXRoLnJlcGxhY2UoL15cXC8vLCAnJyk7XG5cdFx0c2RrLnF1ZXJ5TWVzc2FnZXMgPSBbbWFrZVN5c3RlbUluaXRNZXNzYWdlKHNlc3Npb25JZCksIG1ha2VSZXN1bHRTdWNjZXNzKHNlc3Npb25JZCldO1xuXG5cdFx0Ly8gRmlyc3Qgc2VuZCBtYXRlcmlhbGl6ZXMgXHUyMDE0IGRyaXZlcyBgc3RhcnR1cCgpYCwgd2hpY2ggcGVyZm9ybXNcblx0XHQvLyB0aGUgcmVhbCBIVFRQIHJvdW5kLXRyaXAgb24gdGhlIHJlYWwgcHJveHkuXG5cdFx0YXdhaXQgYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoY3JlYXRlZC5zZXNzaW9uLCAnaGknLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ3R1cm4tMScpO1xuXG5cdFx0Ly8gU25hcHNob3Qgd2hhdCBmbG93ZWQgdGhyb3VnaCB0aGUgaW50ZWdyYXRpb24gaW4gYSBzaW5nbGVcblx0XHQvLyBhc3NlcnRpb24gc28gdGhlIGZhaWx1cmUgc3VyZmFjZSBpcyB0aGUgd2hvbGUgcGlwZWxpbmUuXG5cdFx0Y29uc3Qgc3RhcnR1cCA9IHNkay5jYXB0dXJlZFN0YXJ0dXBPcHRpb25zWzBdO1xuXHRcdGNvbnN0IHJvdW5kID0gc2RrLnByb3h5Um91bmRUcmlwc1swXTtcblx0XHRjb25zdCBzdGFydHVwU2V0dGluZ3MgPSBzdGFydHVwLnNldHRpbmdzO1xuXHRcdGNvbnN0IHNldHRpbmdzRW52ID0gKHN0YXJ0dXBTZXR0aW5ncyAmJiB0eXBlb2Ygc3RhcnR1cFNldHRpbmdzID09PSAnb2JqZWN0JyAmJiBzdGFydHVwU2V0dGluZ3MuZW52KSA/IHN0YXJ0dXBTZXR0aW5ncy5lbnYgOiB7fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0dXBDYWxsQ291bnQ6IHNkay5jYXB0dXJlZFN0YXJ0dXBPcHRpb25zLmxlbmd0aCxcblx0XHRcdHJvdW5kVHJpcENvdW50OiBzZGsucHJveHlSb3VuZFRyaXBzLmxlbmd0aCxcblx0XHRcdGNhcGlDYWxsQ291bnQ6IGNhcGkubWVzc2FnZXNDYWxsQ291bnQuY291bnQsXG5cdFx0XHRzdGFydHVwQ3dkOiBzdGFydHVwLmN3ZCxcblx0XHRcdHN0YXJ0dXBTZXNzaW9uSWQ6IHN0YXJ0dXAuc2Vzc2lvbklkLFxuXHRcdFx0c3RhcnR1cEV4ZWN1dGFibGU6IHN0YXJ0dXAuZXhlY3V0YWJsZSxcblx0XHRcdHN1YnByb2Nlc3NFbGVjdHJvblJ1bkFzTm9kZTogc3RhcnR1cC5lbnY/LlsnRUxFQ1RST05fUlVOX0FTX05PREUnXSxcblx0XHRcdHN1YnByb2Nlc3NOb2RlT3B0aW9uczogc3RhcnR1cC5lbnY/LlsnTk9ERV9PUFRJT05TJ10sXG5cdFx0XHRzdWJwcm9jZXNzQW50aHJvcGljQXBpS2V5OiBzdGFydHVwLmVudj8uWydBTlRIUk9QSUNfQVBJX0tFWSddLFxuXHRcdFx0c2V0dGluZ3NCYXNlVXJsSXNMb29wYmFjazogdHlwZW9mIHNldHRpbmdzRW52WydBTlRIUk9QSUNfQkFTRV9VUkwnXSA9PT0gJ3N0cmluZydcblx0XHRcdFx0JiYgc2V0dGluZ3NFbnZbJ0FOVEhST1BJQ19CQVNFX1VSTCddLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8xMjcuMC4wLjE6JyksXG5cdFx0XHRzZXR0aW5nc0JlYXJlckhhc05vbmNlQW5kU2Vzc2lvbjogdHlwZW9mIHNldHRpbmdzRW52WydBTlRIUk9QSUNfQVVUSF9UT0tFTiddID09PSAnc3RyaW5nJ1xuXHRcdFx0XHQmJiBzZXR0aW5nc0VudlsnQU5USFJPUElDX0FVVEhfVE9LRU4nXS5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMlxuXHRcdFx0XHQmJiBzZXR0aW5nc0VudlsnQU5USFJPUElDX0FVVEhfVE9LRU4nXS5lbmRzV2l0aChgLiR7c2Vzc2lvbklkfWApLFxuXHRcdFx0aHR0cFN0YXR1czogcm91bmQuc3RhdHVzLFxuXHRcdFx0aHR0cENvbnRlbnRUeXBlOiByb3VuZC5jb250ZW50VHlwZSxcblx0XHRcdGV2ZW50VHlwZXM6IHJvdW5kLmV2ZW50cy5tYXAoZSA9PiBlLnR5cGUpLFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0dXBDYWxsQ291bnQ6IDEsXG5cdFx0XHRyb3VuZFRyaXBDb3VudDogMSxcblx0XHRcdGNhcGlDYWxsQ291bnQ6IDEsXG5cdFx0XHRzdGFydHVwQ3dkOiBVUkkuZmlsZSgnL2ludGVncmF0aW9uLWN3ZCcpLmZzUGF0aCxcblx0XHRcdHN0YXJ0dXBTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHN0YXJ0dXBFeGVjdXRhYmxlOiBwcm9jZXNzLmV4ZWNQYXRoLFxuXHRcdFx0c3VicHJvY2Vzc0VsZWN0cm9uUnVuQXNOb2RlOiAnMScsXG5cdFx0XHRzdWJwcm9jZXNzTm9kZU9wdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdHN1YnByb2Nlc3NBbnRocm9waWNBcGlLZXk6IHVuZGVmaW5lZCxcblx0XHRcdHNldHRpbmdzQmFzZVVybElzTG9vcGJhY2s6IHRydWUsXG5cdFx0XHRzZXR0aW5nc0JlYXJlckhhc05vbmNlQW5kU2Vzc2lvbjogdHJ1ZSxcblx0XHRcdGh0dHBTdGF0dXM6IDIwMCxcblx0XHRcdGh0dHBDb250ZW50VHlwZTogJ3RleHQvZXZlbnQtc3RyZWFtJyxcblx0XHRcdGV2ZW50VHlwZXM6IFtcblx0XHRcdFx0J21lc3NhZ2Vfc3RhcnQnLFxuXHRcdFx0XHQnY29udGVudF9ibG9ja19zdGFydCcsXG5cdFx0XHRcdCdjb250ZW50X2Jsb2NrX2RlbHRhJyxcblx0XHRcdFx0J2NvbnRlbnRfYmxvY2tfc3RvcCcsXG5cdFx0XHRcdCdtZXNzYWdlX2RlbHRhJyxcblx0XHRcdFx0J21lc3NhZ2Vfc3RvcCcsXG5cdFx0XHRdLFxuXHRcdH0pO1xuXG5cdFx0Ly8gQ2xlYW51cDogZGlzcG9zZSB0aGUgYWdlbnQgYW5kIGFzc2VydCB0aGUgV2FybVF1ZXJ5IHdhc1xuXHRcdC8vIGNsb3NlZCB2aWEgU3ltYm9sLmFzeW5jRGlzcG9zZSAobm8gb3JwaGFuIHN1YnByb2Nlc3MpLlxuXHRcdGF3YWl0IGFnZW50LmRpc3Bvc2VTZXNzaW9uKGNyZWF0ZWQuc2Vzc2lvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNkay53YXJtUXVlcmllc1swXS5hc3luY0Rpc3Bvc2VDb3VudCwgMSwgJ1dhcm1RdWVyeSBpcyBhc3luY0Rpc3Bvc2VkIG9uIHNlc3Npb24gZGlzcG9zZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm94eSByZWplY3RzIGEgcmVxdWVzdCB3aG9zZSBiZWFyZXIgY2FycmllcyBhIHdyb25nIG5vbmNlIChhdXRoIGNvbnRyYWN0KScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBDb21wYW5pb24gdGVzdCB0aGF0IGxvY2tzIHRoZSBwcm94eSdzIGF1dGggY29udHJhY3QgZnJvbVxuXHRcdC8vIG91dHNpZGUgdGhlIGFnZW50LiBJZiB0aGUgYWdlbnQgZXZlciBkcmlmdHMgYXdheSBmcm9tXG5cdFx0Ly8gYEJlYXJlciA8bm9uY2U+LjxzZXNzaW9uSWQ+YCwgdGhlIHJvdW5kLXRyaXAgaW4gdGhlIHRlc3Rcblx0XHQvLyBhYm92ZSBmYWlscyBcdTIwMTQgYnV0IHRoaXMgdGVzdCBndWFyYW50ZWVzIHRoZSBwcm94eSBpdHNlbGZcblx0XHQvLyByZWplY3RzIGZvcmdlZCBiZWFyZXJzIHJlZ2FyZGxlc3Mgb2YgdGhlIGFnZW50LlxuXHRcdGNvbnN0IGNhcGkgPSBuZXcgU3R1YkNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVhbFByb3h5ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDbGF1ZGVQcm94eVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGNhcGkpKTtcblx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCByZWFsUHJveHkuc3RhcnQoJ2doLWludC10ZXN0LXRva2VuJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBvc3RTc2VUb1Byb3h5KFxuXHRcdFx0XHRgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLFxuXHRcdFx0XHQnd3Jvbmctbm9uY2Uuc2Vzc2lvbi14Jyxcblx0XHRcdFx0eyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsIG1lc3NhZ2VzOiBbXSwgc3RyZWFtOiB0cnVlIH0sXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsIDQwMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwaS5tZXNzYWdlc0NhbGxDb3VudC5jb3VudCwgMCwgJ2F1dGggY2hlY2sgZmlyZXMgYmVmb3JlIGFueSB1cHN0cmVhbSBjYWxsJyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdQaGFzZSA3IFx1MDBBNzUuMyBcdTIwMTQgY2FuVXNlVG9vbCAvIG9uRWxpY2l0YXRpb24gY2xvc3VyZXMgd2lyZWQgdGhyb3VnaCB0byBPcHRpb25zIG9uIG1hdGVyaWFsaXplJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFBoYXNlIDcgXHUwMEE3NS4zLiBUaGUgUGhhc2UtNiByb3VuZC10cmlwIGFib3ZlIGV4ZXJjaXNlZCB0aGVcblx0XHQvLyBwcm94eSAvIENBUEkgLyBzZXR0aW5ncy1lbnYgd2lyaW5nOyB0aGlzIHRlc3QgcGlucyB0aGVcblx0XHQvLyBQaGFzZS03IGNhbGxiYWNrIHN1cmZhY2UgXHUyMDE0IGBjYW5Vc2VUb29sYCBhbmQgYG9uRWxpY2l0YXRpb25gXG5cdFx0Ly8gbXVzdCBib3RoIGJlIHByZXNlbnQgaW4gdGhlIE9wdGlvbnMgdGhlIFNESyBzZXJ2aWNlIHJlY2VpdmVzXG5cdFx0Ly8gZnJvbSBgX21hdGVyaWFsaXplUHJvdmlzaW9uYWxgIGFuZCBiZWhhdmUgcGVyIFx1MDBBNzMuNCAvIFx1MDBBNzMuNy5cblx0XHQvLyBXZSBkb24ndCBuZWVkIGEgZnVsbCBTREsgbWVzc2FnZSBzdHJlYW0gd2l0aCB0b29sX3VzZSBibG9ja3Ncblx0XHQvLyB0byB2YWxpZGF0ZSB0aGUgd2lyaW5nIFx1MjAxNCB0aGUgdW5pdCBzdWl0ZXMgaW5cblx0XHQvLyBgY2xhdWRlQWdlbnQudGVzdC50c2AgY292ZXIgdGhlIGluLXByb2Nlc3MgdG9vbCByb3VuZC10cmlwXG5cdFx0Ly8gZXhoYXVzdGl2ZWx5LiBXaGF0IHRoaXMgaW50ZWdyYXRpb24gYWRkczogdGhlIGNsb3N1cmVzXG5cdFx0Ly8gc3Vydml2ZSB0aGUgbWF0ZXJpYWxpemUgXHUyMTkyIFNESyBib3VuZGFyeSBpbnRhY3Qgd2hlbiB0aGUgcmVhbFxuXHRcdC8vIHByb3h5IGlzIGluIHRoZSBsb29wLlxuXHRcdGNvbnN0IGNhcGkgPSBuZXcgU3R1YkNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y2FwaS5zdHJlYW1FdmVudHMgPSBtYWtlQ2FubmVkU3RyZWFtKCdjbGF1ZGUtb3B1cy00LjYnKTtcblx0XHRjb25zdCByZWFsUHJveHkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENsYXVkZVByb3h5U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY2FwaSkpO1xuXHRcdGNvbnN0IHNkayA9IG5ldyBQcm94eVJvdW5kVHJpcFNka1NlcnZpY2UoKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTG9nU2VydmljZSwgbG9nU2VydmljZV0sXG5cdFx0XHRbSUNvcGlsb3RBcGlTZXJ2aWNlLCBjYXBpXSxcblx0XHRcdFtJQ2xhdWRlUHJveHlTZXJ2aWNlLCByZWFsUHJveHldLFxuXHRcdFx0W0lTZXNzaW9uRGF0YVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZSgpXSxcblx0XHRcdFtJQ2xhdWRlQWdlbnRTZGtTZXJ2aWNlLCBzZGtdLFxuXHRcdFx0W0lBZ2VudFBsdWdpbk1hbmFnZXIsIHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRiYXNlUGF0aDogVVJJLmZyb20oeyBzY2hlbWU6ICdpbm1lbW9yeScsIHBhdGg6ICcvYWdlbnRQbHVnaW5zJyB9KSxcblx0XHRcdFx0YXN5bmMgc3luY0N1c3RvbWl6YXRpb25zKF9jbGllbnRJZDogc3RyaW5nLCBfY3VzdG9taXphdGlvbnM6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSkgeyByZXR1cm4gW107IH0sXG5cdFx0XHR9XSxcblx0XHRcdFtJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlnU2VydmljZV0sXG5cdFx0XHRbSUFnZW50SG9zdFN0YXRlTWFuYWdlciwgc3RhdGVNYW5hZ2VyXSxcblx0XHRcdFtJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLCBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKCldLFxuXHRcdFx0W0lBZ2VudEhvc3RHaXRTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpXSxcblx0XHRcdC4uLmNsYXVkZUZpbGVFbnZTZXJ2aWNlcyhkaXNwb3NhYmxlcyksXG5cdFx0KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMpKTtcblx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGF1ZGVBZ2VudCkpO1xuXG5cdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRS5yZXNvdXJjZSwgJ2doLWludC10ZXN0LXRva2VuJyk7XG5cdFx0Y29uc3QgY3JlYXRlZCA9IGF3YWl0IGFnZW50LmNyZWF0ZVNlc3Npb24oeyB3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL2ludGVncmF0aW9uLWN3ZCcpXSB9KTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBjcmVhdGVkLnNlc3Npb24ucGF0aC5yZXBsYWNlKC9eXFwvLywgJycpO1xuXHRcdHNkay5xdWVyeU1lc3NhZ2VzID0gW1xuXHRcdFx0bWFrZVN5c3RlbUluaXRNZXNzYWdlKHNlc3Npb25JZCksXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdlbGljaXRhdGlvbicsXG5cdFx0XHRcdHJlcXVlc3Q6IHsgc2VydmVyTmFtZTogJ21jcC10ZXN0JywgbWVzc2FnZTogJ3BpY2sgYSBzaWRlJywgbW9kZTogJ2Zvcm0nLCByZXF1ZXN0ZWRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHsgc2lkZTogeyB0eXBlOiAnc3RyaW5nJyB9IH0gfSB9LFxuXHRcdFx0fSxcblx0XHRcdG1ha2VSZXN1bHRTdWNjZXNzKHNlc3Npb25JZCksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGlucHV0UmVxdWVzdGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTxDaGF0SW5wdXRSZXF1ZXN0PigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZ2VudC5vbkRpZFNlc3Npb25Qcm9ncmVzcyhzID0+IHtcblx0XHRcdGlmIChzLmtpbmQgPT09ICdhY3Rpb24nICYmIHMuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkKSB7XG5cdFx0XHRcdGlucHV0UmVxdWVzdGVkLmNvbXBsZXRlKHMuYWN0aW9uLnJlcXVlc3QpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlbmRQcm9taXNlID0gYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoY3JlYXRlZC5zZXNzaW9uLCAnaGknLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ3R1cm4tMScpO1xuXHRcdGNvbnN0IGlucHV0UmVxdWVzdCA9IGF3YWl0IGlucHV0UmVxdWVzdGVkLnA7XG5cblx0XHRjb25zdCBzdGFydHVwID0gc2RrLmNhcHR1cmVkU3RhcnR1cE9wdGlvbnNbMF07XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBzdGFydHVwLmNhblVzZVRvb2wgPT09ICdmdW5jdGlvbicsICdjYW5Vc2VUb29sIHdhcyB3aXJlZCBpbnRvIE9wdGlvbnMnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHN0YXJ0dXAub25FbGljaXRhdGlvbiA9PT0gJ2Z1bmN0aW9uJywgJ29uRWxpY2l0YXRpb24gd2FzIHdpcmVkIGludG8gT3B0aW9ucycpO1xuXG5cdFx0YWdlbnQucmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdChpbnB1dFJlcXVlc3QuaWQsIENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsIHtcblx0XHRcdHNpZGU6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnbGVmdCcgfSB9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlbmRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlbGljaXRSZXN1bHQ6IHNkay5lbGljaXRhdGlvblJlc3VsdHNbMF0sXG5cdFx0XHRwZXJtaXNzaW9uTW9kZTogc3RhcnR1cC5wZXJtaXNzaW9uTW9kZSxcblx0XHR9LCB7XG5cdFx0XHRlbGljaXRSZXN1bHQ6IHsgYWN0aW9uOiAnYWNjZXB0JywgY29udGVudDogeyBzaWRlOiAnbGVmdCcgfSB9LFxuXHRcdFx0cGVybWlzc2lvbk1vZGU6ICdkZWZhdWx0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnUGhhc2UgNyBcdTAwQTc1LjMgXHUyMDE0IFJlYWQgdG9vbCByb3VuZC10cmlwOiBTREsgdG9vbF91c2UgXHUyMTkyIHBlbmRpbmdfY29uZmlybWF0aW9uIFx1MjE5MiByZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdCh0cnVlKSBcdTIxOTIgdG9vbF9yZXN1bHQgXHUyMTkyIGNvbnRpbnVhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHQvLyBcdTAwQTc1LjMgb2YgdGhlIFBoYXNlLTcgcGxhbjogZHJpdmUgYSBvbmUtdG9vbCByb3VuZC10cmlwIGVuZC10by1lbmRcblx0XHQvLyB0aHJvdWdoIGEgbWF0ZXJpYWxpemVkIGFnZW50IGJhY2tlZCBieSB0aGUgcmVhbCBwcm94eS4gVW5pdFxuXHRcdC8vIHRlc3RzIGluIGBjbGF1ZGVBZ2VudC50ZXN0LnRzYCBhbHJlYWR5IGNvdmVyIHRoZSBpbi1wcm9jZXNzXG5cdFx0Ly8gYF9oYW5kbGVDYW5Vc2VUb29sYCBtZWNoYW5pY3M7IHdoYXQgdGhpcyB0ZXN0IHBpbnMgaXMgdGhlXG5cdFx0Ly8gYWdlbnQgXHUyMTkyIG1hcHBlciBcdTIxOTIgcHJvZ3Jlc3MtZXZlbnQgb3JkZXJpbmcgd2hlbiB0aGUgU0RLIGZpeHR1cmVcblx0XHQvLyBpbnZva2VzIHRoZSBjYXB0dXJlZCBgT3B0aW9ucy5jYW5Vc2VUb29sYCBtaWQtc3RyZWFtIHRoZSBzYW1lXG5cdFx0Ly8gd2F5IHRoZSByZWFsIHN1YnByb2Nlc3Mgd291bGQuXG5cdFx0Y29uc3QgY2FwaSA9IG5ldyBTdHViQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjYXBpLnN0cmVhbUV2ZW50cyA9IG1ha2VDYW5uZWRTdHJlYW0oJ2NsYXVkZS1vcHVzLTQuNicpO1xuXHRcdGNvbnN0IHJlYWxQcm94eSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2xhdWRlUHJveHlTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBjYXBpKSk7XG5cdFx0Y29uc3Qgc2RrID0gbmV3IFByb3h5Um91bmRUcmlwU2RrU2VydmljZSgpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlXSxcblx0XHRcdFtJQ29waWxvdEFwaVNlcnZpY2UsIGNhcGldLFxuXHRcdFx0W0lDbGF1ZGVQcm94eVNlcnZpY2UsIHJlYWxQcm94eV0sXG5cdFx0XHRbSVNlc3Npb25EYXRhU2VydmljZSwgY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKCldLFxuXHRcdFx0W0lDbGF1ZGVBZ2VudFNka1NlcnZpY2UsIHNka10sXG5cdFx0XHRbSUFnZW50UGx1Z2luTWFuYWdlciwge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGJhc2VQYXRoOiBVUkkuZnJvbSh7IHNjaGVtZTogJ2lubWVtb3J5JywgcGF0aDogJy9hZ2VudFBsdWdpbnMnIH0pLFxuXHRcdFx0XHRhc3luYyBzeW5jQ3VzdG9taXphdGlvbnMoX2NsaWVudElkOiBzdHJpbmcsIF9jdXN0b21pemF0aW9uczogQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdKSB7IHJldHVybiBbXTsgfSxcblx0XHRcdH1dLFxuXHRcdFx0W0lBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWdTZXJ2aWNlXSxcblx0XHRcdFtJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCBzdGF0ZU1hbmFnZXJdLFxuXHRcdFx0W0lBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UsIGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UoKV0sXG5cdFx0XHRbSUFnZW50SG9zdEdpdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCldLFxuXHRcdFx0Li4uY2xhdWRlRmlsZUVudlNlcnZpY2VzKGRpc3Bvc2FibGVzKSxcblx0XHQpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcykpO1xuXHRcdGNvbnN0IGFnZW50ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENsYXVkZUFnZW50KSk7XG5cblx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoR0lUSFVCX0NPUElMT1RfUFJPVEVDVEVEX1JFU09VUkNFLnJlc291cmNlLCAnZ2gtaW50LXRlc3QtdG9rZW4nKTtcblx0XHRjb25zdCBjcmVhdGVkID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7IHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvaW50ZWdyYXRpb24tY3dkJyldIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IGNyZWF0ZWQuc2Vzc2lvbi5wYXRoLnJlcGxhY2UoL15cXC8vLCAnJyk7XG5cblx0XHQvLyBDYW5uZWQgdHVybjogYXNzaXN0YW50IHNheXMgXCJyZWFkaW5nXCIsIGNhbGxzIGBSZWFkYCwgdGhlIFNES1xuXHRcdC8vIGludm9rZXMgYGNhblVzZVRvb2xgLCB0aGVuIGEgc3ludGhldGljIHVzZXIgYHRvb2xfcmVzdWx0YFxuXHRcdC8vIGFycml2ZXMgZm9sbG93ZWQgYnkgYW4gYXNzaXN0YW50IGNvbnRpbnVhdGlvbiBhbmQgYHJlc3VsdGAuXG5cdFx0Y29uc3QgVE9PTF9VU0VfSUQgPSAndHVfaW50X3JlYWRfMSc7XG5cdFx0c2RrLnF1ZXJ5TWVzc2FnZXMgPSBbXG5cdFx0XHRtYWtlU3lzdGVtSW5pdE1lc3NhZ2Uoc2Vzc2lvbklkKSxcblx0XHRcdG1ha2VTdHJlYW1FdmVudChzZXNzaW9uSWQsIG1ha2VNZXNzYWdlU3RhcnQoJ21zZ19pbnRfMScpKSxcblx0XHRcdG1ha2VTdHJlYW1FdmVudChzZXNzaW9uSWQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRleHQoMCkpLFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KHNlc3Npb25JZCwgbWFrZVRleHREZWx0YSgwLCAncmVhZGluZycpKSxcblx0XHRcdG1ha2VTdHJlYW1FdmVudChzZXNzaW9uSWQsIG1ha2VDb250ZW50QmxvY2tTdG9wKDApKSxcblx0XHRcdG1ha2VTdHJlYW1FdmVudChzZXNzaW9uSWQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMSwgVE9PTF9VU0VfSUQsICdSZWFkJykpLFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KHNlc3Npb25JZCwgbWFrZUlucHV0SnNvbkRlbHRhKDEsICd7XCJmaWxlX3BhdGhcIjpcIi90bXAveFwifScpKSxcblx0XHRcdG1ha2VTdHJlYW1FdmVudChzZXNzaW9uSWQsIG1ha2VDb250ZW50QmxvY2tTdG9wKDEpKSxcblx0XHRcdG1ha2VTdHJlYW1FdmVudChzZXNzaW9uSWQsIG1ha2VNZXNzYWdlU3RvcCgpKSxcblx0XHRcdHsga2luZDogJ2NhblVzZVRvb2wnLCB0b29sTmFtZTogJ1JlYWQnLCBpbnB1dDogeyBmaWxlX3BhdGg6ICcvdG1wL3gnIH0sIHRvb2xVc2VJRDogVE9PTF9VU0VfSUQgfSxcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2Uoc2Vzc2lvbklkLCBUT09MX1VTRV9JRCwgJ2ZpbGUgY29udGVudHMnKSxcblx0XHRcdG1ha2VTdHJlYW1FdmVudChzZXNzaW9uSWQsIG1ha2VNZXNzYWdlU3RhcnQoJ21zZ19pbnRfMicpKSxcblx0XHRcdG1ha2VTdHJlYW1FdmVudChzZXNzaW9uSWQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRleHQoMCkpLFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KHNlc3Npb25JZCwgbWFrZVRleHREZWx0YSgwLCAnZG9uZScpKSxcblx0XHRcdG1ha2VTdHJlYW1FdmVudChzZXNzaW9uSWQsIG1ha2VDb250ZW50QmxvY2tTdG9wKDApKSxcblx0XHRcdG1ha2VTdHJlYW1FdmVudChzZXNzaW9uSWQsIG1ha2VNZXNzYWdlU3RvcCgpKSxcblx0XHRcdG1ha2VSZXN1bHRTdWNjZXNzKHNlc3Npb25JZCksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHNpZ25hbHM6IEFnZW50U2lnbmFsW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWdlbnQub25EaWRTZXNzaW9uUHJvZ3Jlc3MocyA9PiB7XG5cdFx0XHRzaWduYWxzLnB1c2gocyk7XG5cdFx0XHRpZiAocy5raW5kID09PSAncGVuZGluZ19jb25maXJtYXRpb24nICYmIHMuc3RhdGUudG9vbENhbGxJZCA9PT0gVE9PTF9VU0VfSUQpIHtcblx0XHRcdFx0YWdlbnQucmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QoVE9PTF9VU0VfSUQsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKGNyZWF0ZWQuc2Vzc2lvbiwgJ3BsZWFzZSByZWFkIC90bXAveCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAndHVybi0xJyk7XG5cblx0XHQvLyBTbmFwc2hvdCB0aGUgYWdlbnQtc2lkZSBlbWlzc2lvbiBzdHJlYW0gYXMgYSBzaW5nbGUgc2hhcGUgc29cblx0XHQvLyB0aGUgZmFpbHVyZSBzdXJmYWNlIGlzIHRoZSB3aG9sZSBwaXBlbGluZS5cblx0XHRjb25zdCBzdW1tYXJ5ID0gc2lnbmFscy5tYXAocyA9PiB7XG5cdFx0XHRpZiAocy5raW5kID09PSAncGVuZGluZ19jb25maXJtYXRpb24nKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0a2luZDogcy5raW5kLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IHMuc3RhdGUudG9vbENhbGxJZCxcblx0XHRcdFx0XHR0b29sTmFtZTogcy5zdGF0ZS50b29sTmFtZSxcblx0XHRcdFx0XHRwZXJtaXNzaW9uS2luZDogcy5wZXJtaXNzaW9uS2luZCxcblx0XHRcdFx0XHRwZXJtaXNzaW9uUGF0aDogcy5wZXJtaXNzaW9uUGF0aCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGlmIChzLmtpbmQgPT09ICdhY3Rpb24nKSB7XG5cdFx0XHRcdGNvbnN0IGEgPSBzLmFjdGlvbjtcblx0XHRcdFx0c3dpdGNoIChhLnR5cGUpIHtcblx0XHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydDpcblx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdhY3Rpb24nLCB0eXBlOiBhLnR5cGUsIHBhcnRLaW5kOiBhLnBhcnQua2luZCwgY29udGVudDogYS5wYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24gPyBhLnBhcnQuY29udGVudCA6IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0RGVsdGE6XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYWN0aW9uJywgdHlwZTogYS50eXBlLCBjb250ZW50OiBhLmNvbnRlbnQgfTtcblx0XHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQ6XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYWN0aW9uJywgdHlwZTogYS50eXBlLCB0b29sQ2FsbElkOiBhLnRvb2xDYWxsSWQsIHRvb2xOYW1lOiBhLnRvb2xOYW1lIH07XG5cdFx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2FjdGlvbicsIHR5cGU6IGEudHlwZSwgdG9vbENhbGxJZDogYS50b29sQ2FsbElkLCBjb250ZW50OiBhLmNvbnRlbnQgfTtcblx0XHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGU6XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYWN0aW9uJywgdHlwZTogYS50eXBlLCB0b29sQ2FsbElkOiBhLnRvb2xDYWxsSWQsIHN1Y2Nlc3M6IGEucmVzdWx0LnN1Y2Nlc3MsIGNvbnRlbnQ6IGEucmVzdWx0LmNvbnRlbnQgfTtcblx0XHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFVzYWdlOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2FjdGlvbicsIHR5cGU6IGEudHlwZSB9O1xuXHRcdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2FjdGlvbicsIHR5cGU6IGEudHlwZSB9O1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYWN0aW9uJywgdHlwZTogYS50eXBlIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGtpbmQ6IHMua2luZCB9O1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdW1tYXJ5LFxuXHRcdFx0Y2FuVXNlVG9vbFJlc3VsdHM6IHNkay5jYW5Vc2VUb29sUmVzdWx0cyxcblx0XHR9LCB7XG5cdFx0XHRzdW1tYXJ5OiBbXG5cdFx0XHRcdHsga2luZDogJ2FjdGlvbicsIHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCwgcGFydEtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICcnIH0sXG5cdFx0XHRcdHsga2luZDogJ2FjdGlvbicsIHR5cGU6IEFjdGlvblR5cGUuQ2hhdERlbHRhLCBjb250ZW50OiAncmVhZGluZycgfSxcblx0XHRcdFx0eyBraW5kOiAnYWN0aW9uJywgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdG9vbENhbGxJZDogVE9PTF9VU0VfSUQsIHRvb2xOYW1lOiAnUmVhZCcgfSxcblx0XHRcdFx0eyBraW5kOiAnYWN0aW9uJywgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSwgdG9vbENhbGxJZDogVE9PTF9VU0VfSUQsIGNvbnRlbnQ6ICd7XCJmaWxlX3BhdGhcIjpcIi90bXAveFwifScgfSxcblx0XHRcdFx0Ly8gUGhhc2UgOC41IFx1MjAxNCBtYXBwZXIgZW1pdHMgYENoYXRUb29sQ2FsbFJlYWR5YCBhdFxuXHRcdFx0XHQvLyBgY29udGVudF9ibG9ja19zdG9wYCBzbyBhdXRvLWFsbG93ZWQgdG9vbHMgdHJhbnNpdGlvbiBvdXQgb2Zcblx0XHRcdFx0Ly8gYFN0cmVhbWluZ2A7IGBzZXNzaW9uUGVybWlzc2lvbnNgIHRoZW4gZW1pdHMgYSBzZWNvbmQgUmVhZHlcblx0XHRcdFx0Ly8gZm9yIHRoZSBwZW5kaW5nX2NvbmZpcm1hdGlvbiBjYXJkIGJlbG93LlxuXHRcdFx0XHR7IGtpbmQ6ICdhY3Rpb24nLCB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5IH0sXG5cdFx0XHRcdHsga2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgdG9vbENhbGxJZDogVE9PTF9VU0VfSUQsIHRvb2xOYW1lOiAnUmVhZCcsIHBlcm1pc3Npb25LaW5kOiAncmVhZCcsIHBlcm1pc3Npb25QYXRoOiAnL3RtcC94JyB9LFxuXHRcdFx0XHR7IGtpbmQ6ICdhY3Rpb24nLCB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0b29sQ2FsbElkOiBUT09MX1VTRV9JRCwgc3VjY2VzczogdHJ1ZSwgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdmaWxlIGNvbnRlbnRzJyB9XSB9LFxuXHRcdFx0XHR7IGtpbmQ6ICdhY3Rpb24nLCB0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsIHBhcnRLaW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnJyB9LFxuXHRcdFx0XHR7IGtpbmQ6ICdhY3Rpb24nLCB0eXBlOiBBY3Rpb25UeXBlLkNoYXREZWx0YSwgY29udGVudDogJ2RvbmUnIH0sXG5cdFx0XHRcdHsga2luZDogJ2FjdGlvbicsIHR5cGU6IEFjdGlvblR5cGUuQ2hhdFVzYWdlIH0sXG5cdFx0XHRcdHsga2luZDogJ2FjdGlvbicsIHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSB9LFxuXHRcdFx0XSxcblx0XHRcdGNhblVzZVRvb2xSZXN1bHRzOiBbXG5cdFx0XHRcdHsgYmVoYXZpb3I6ICdhbGxvdycsIHVwZGF0ZWRJbnB1dDogeyBmaWxlX3BhdGg6ICcvdG1wL3gnIH0gfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbi8vICNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICJBQXNDQSxPQUFPLFlBQVk7QUFFbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZUFBZTtBQUV4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQTJCLHlDQUF5QztBQUNwRSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFrQix1QkFBdUIsdUJBQXVCLHNCQUFzQixnQ0FBdUY7QUFDdEwsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkIsa0NBQWtDO0FBQ3RFLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsdUJBQXVCLDhCQUE4QjtBQUM5RCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFvQiwyQkFBMkI7QUFDeEQsU0FBUywwQkFBaUU7QUFDMUUsU0FBUyxzQkFBc0IsZ0NBQWdDO0FBQy9EO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQVdQLFNBQVMsc0JBQXNCLGFBQWlKO0FBQy9LLFFBQU0sY0FBYyxZQUFZLElBQUksSUFBSSxZQUFZLElBQUksZUFBZSxDQUFDLENBQUM7QUFDekUsY0FBWSxJQUFJLFlBQVksaUJBQWlCLFFBQVEsTUFBTSxZQUFZLElBQUksSUFBSSwyQkFBMkIs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LEVBQUUsTUFBTSxVQUFVLE1BQU0sRUFBRSxLQUFLO0FBQUEsVUFDdkM7QUFDQyxtQkFBTyxFQUFFLE1BQU0sVUFBVSxNQUFNLEVBQUUsS0FBSztBQUFBLFFBQ3hDO0FBQUEsTUFDRDtBQUNBLGFBQU8sRUFBRSxNQUFNLEVBQUUsS0FBSztBQUFBLElBQ3ZCLENBQUM7QUFFRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQSxtQkFBbUIsSUFBSTtBQUFBLElBQ3hCLEdBQUc7QUFBQSxNQUNGLFNBQVM7QUFBQSxRQUNSLEVBQUUsTUFBTSxVQUFVLE1BQU0sV0FBVyxrQkFBa0IsVUFBVSxpQkFBaUIsVUFBVSxTQUFTLEdBQUc7QUFBQSxRQUN0RyxFQUFFLE1BQU0sVUFBVSxNQUFNLFdBQVcsV0FBVyxTQUFTLFVBQVU7QUFBQSxRQUNqRSxFQUFFLE1BQU0sVUFBVSxNQUFNLFdBQVcsbUJBQW1CLFlBQVksYUFBYSxVQUFVLE9BQU87QUFBQSxRQUNoRyxFQUFFLE1BQU0sVUFBVSxNQUFNLFdBQVcsbUJBQW1CLFlBQVksYUFBYSxTQUFTLHlCQUF5QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsUUFLakgsRUFBRSxNQUFNLFVBQVUsTUFBTSxXQUFXLGtCQUFrQjtBQUFBLFFBQ3JELEVBQUUsTUFBTSx3QkFBd0IsWUFBWSxhQUFhLFVBQVUsUUFBUSxnQkFBZ0IsUUFBUSxnQkFBZ0IsU0FBUztBQUFBLFFBQzVILEVBQUUsTUFBTSxVQUFVLE1BQU0sV0FBVyxzQkFBc0IsWUFBWSxhQUFhLFNBQVMsTUFBTSxTQUFTLENBQUMsRUFBRSxNQUFNLHNCQUFzQixNQUFNLE1BQU0sZ0JBQWdCLENBQUMsRUFBRTtBQUFBLFFBQ3hLLEVBQUUsTUFBTSxVQUFVLE1BQU0sV0FBVyxrQkFBa0IsVUFBVSxpQkFBaUIsVUFBVSxTQUFTLEdBQUc7QUFBQSxRQUN0RyxFQUFFLE1BQU0sVUFBVSxNQUFNLFdBQVcsV0FBVyxTQUFTLE9BQU87QUFBQSxRQUM5RCxFQUFFLE1BQU0sVUFBVSxNQUFNLFdBQVcsVUFBVTtBQUFBLFFBQzdDLEVBQUUsTUFBTSxVQUFVLE1BQU0sV0FBVyxpQkFBaUI7QUFBQSxNQUNyRDtBQUFBLE1BQ0EsbUJBQW1CO0FBQUEsUUFDbEIsRUFBRSxVQUFVLFNBQVMsY0FBYyxFQUFFLFdBQVcsU0FBUyxFQUFFO0FBQUEsTUFDNUQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
