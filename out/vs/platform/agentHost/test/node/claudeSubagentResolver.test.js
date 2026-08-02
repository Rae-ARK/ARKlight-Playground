import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType } from "../../common/state/protocol/state.js";
import { buildSubagentSessionUri } from "../../common/state/sessionState.js";
import { scanTranscriptForAgentIds, SUBAGENT_ID_SUFFIX_REGEX, SubagentRegistry } from "../../node/claude/claudeSubagentRegistry.js";
import {
  extractSpawningPromptFromTranscript,
  fetchParentTurns,
  getSubagentTranscript,
  NativeStrategy,
  PromptMatchStrategy,
  resolveAgentIdViaChain,
  TextSuffixStrategy
} from "../../node/claude/claudeSubagentResolver.js";
class FakeSdkService {
  constructor() {
    this.sessionMessages = /* @__PURE__ */ new Map();
    this.subagentIds = /* @__PURE__ */ new Map();
    this.subagentMessages = /* @__PURE__ */ new Map();
    this.getSessionMessagesCalls = [];
    this.listSubagentsCalls = [];
    this.getSubagentMessagesCalls = [];
  }
  async listSessions() {
    return [];
  }
  async canLoadWithoutDownload() {
    return true;
  }
  async getSessionInfo(_id) {
    return void 0;
  }
  async startup(_p) {
    throw new Error("not used");
  }
  async query(_params) {
    throw new Error("not used");
  }
  async getSessionMessages(sessionId, options) {
    this.getSessionMessagesCalls.push({ sessionId, options });
    if (this.getSessionMessagesRejection) {
      throw this.getSessionMessagesRejection;
    }
    return this.sessionMessages.get(sessionId) ?? [];
  }
  async listSubagents(sessionId, _options) {
    this.listSubagentsCalls.push(sessionId);
    if (this.listSubagentsRejection) {
      throw this.listSubagentsRejection;
    }
    return this.subagentIds.get(sessionId) ?? [];
  }
  async getSubagentMessages(sessionId, agentId, _options) {
    this.getSubagentMessagesCalls.push({ sessionId, agentId });
    if (this.getSubagentMessagesRejection) {
      throw this.getSubagentMessagesRejection;
    }
    return this.subagentMessages.get(`${sessionId}::${agentId}`) ?? [];
  }
  async forkSession() {
    throw new Error("not implemented in test fake");
  }
  async deleteSession() {
    throw new Error("not implemented in test fake");
  }
  async createSdkMcpServer() {
    throw new Error("not implemented in test fake");
  }
  async tool() {
    throw new Error("not implemented in test fake");
  }
}
function makeAgentToolCallTurn(toolCallId, opts) {
  return {
    id: "turn-" + toolCallId,
    message: { text: "", origin: { kind: MessageKind.User } },
    responseParts: [{
      kind: ResponsePartKind.ToolCall,
      toolCall: {
        toolCallId,
        toolName: opts.toolName ?? "Task",
        displayName: "Task",
        status: opts.status ?? ToolCallStatus.Completed,
        confirmed: ToolCallConfirmationReason.NotNeeded,
        invocationMessage: "invoking task",
        toolInput: opts.prompt !== void 0 ? JSON.stringify({ prompt: opts.prompt, description: "d" }) : void 0,
        success: true,
        pastTenseMessage: "task done",
        content: opts.suffixText !== void 0 ? [{ type: ToolResultContentType.Text, text: opts.suffixText }] : void 0
      }
    }],
    state: 0,
    startedAt: "1970-01-01T00:00:00.001Z",
    duration: 2,
    usage: void 0
  };
}
suite("claudeSubagentResolver \u2014 SUBAGENT_ID_SUFFIX_REGEX", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches canonical and drifted formats; rejects unrelated text", () => {
    const results = [
      "agentId: abc123 (use SendMessage with to: 'abc123') ...",
      "agentId:   abc123\n",
      // multiple spaces
      "  agentId: abc123",
      // leading whitespace
      "AgentId: ABC123",
      // mixed case rejected? — regex is case-insensitive
      "noise\nagentId: xyz789 trailing",
      // multi-line, anchored to line start
      "agentid:abc",
      // missing space after colon — rejected
      "description: not an agent id"
    ].map((input) => {
      const m = SUBAGENT_ID_SUFFIX_REGEX.exec(input);
      return m ? m[1] : void 0;
    });
    assert.deepStrictEqual(results, [
      "abc123",
      "abc123",
      "abc123",
      "ABC123",
      "xyz789",
      void 0,
      void 0
    ]);
  });
});
suite("claudeSubagentResolver \u2014 TextSuffixStrategy", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("hits when parent transcript carries the synthetic suffix; misses otherwise", async () => {
    const sdk = new FakeSdkService();
    const strat = new TextSuffixStrategy(sdk, new NullLogService());
    const parentUri = URI.parse("copilot:/parent-sid");
    const ctx = {
      parentUri,
      parentSessionId: "parent-sid",
      parentTranscript: [
        makeAgentToolCallTurn("toolu_hit", { suffixText: "whatever\nagentId: a7b3c1d2\n(trailing)" }),
        makeAgentToolCallTurn("toolu_no_suffix", { suffixText: "just text, no marker" })
      ],
      token: CancellationToken.None
    };
    assert.deepStrictEqual({
      hit: await strat.lookup("toolu_hit", ctx),
      miss: await strat.lookup("toolu_no_suffix", ctx),
      unknown: await strat.lookup("toolu_unknown", ctx)
    }, { hit: "a7b3c1d2", miss: void 0, unknown: void 0 });
  });
});
suite("claudeSubagentResolver \u2014 PromptMatchStrategy", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("finds the agent whose first user message matches the parent Agent.tool_use.input.prompt; rejects malformed input", async () => {
    const sdk = new FakeSdkService();
    const parentUri = URI.parse("copilot:/parent-sid");
    sdk.subagentIds.set("parent-sid", ["agentother", "agenttarget"]);
    sdk.subagentMessages.set("parent-sid::agentother", [{
      type: "user",
      message: { content: [{ type: "text", text: "different prompt" }] }
    }]);
    sdk.subagentMessages.set("parent-sid::agenttarget", [{
      type: "user",
      message: { content: "do the thing" }
    }]);
    const strat = new PromptMatchStrategy(sdk, new NullLogService());
    const ctx = {
      parentUri,
      parentSessionId: "parent-sid",
      parentTranscript: [
        makeAgentToolCallTurn("toolu_target", { prompt: "do the thing" }),
        makeAgentToolCallTurn("toolu_malformed", { prompt: void 0 })
        // missing toolInput
      ],
      token: CancellationToken.None
    };
    assert.deepStrictEqual({
      matched: await strat.lookup("toolu_target", ctx),
      malformed: await strat.lookup("toolu_malformed", ctx),
      unknownToolCall: await strat.lookup("toolu_does_not_exist", ctx)
    }, {
      matched: "agenttarget",
      malformed: void 0,
      unknownToolCall: void 0
    });
  });
});
suite("claudeSubagentResolver \u2014 NativeStrategy", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("placeholder returns undefined", async () => {
    const strat = new NativeStrategy();
    assert.strictEqual(await strat.lookup(), void 0);
  });
});
suite("claudeSubagentResolver \u2014 scanTranscriptForAgentIds", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("extracts every (toolCallId, agentId) pair in one pass; skips unrelated tools", () => {
    const transcript = [
      makeAgentToolCallTurn("toolu_a", { suffixText: "agentId: agenta1" }),
      makeAgentToolCallTurn("toolu_b", { suffixText: "no marker" }),
      makeAgentToolCallTurn("toolu_c", { suffixText: "agentId: agentc1", toolName: "Bash" }),
      // non-subagent tool
      makeAgentToolCallTurn("toolu_d", { suffixText: "agentId: agentd1", toolName: "Agent" })
    ];
    const pairs = scanTranscriptForAgentIds(transcript);
    assert.deepStrictEqual([...pairs.entries()].sort(), [
      ["toolu_a", "agenta1"],
      ["toolu_d", "agentd1"]
    ]);
  });
});
suite("claudeSubagentResolver \u2014 getSubagentTranscript", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("cache hit on registry short-circuits SDK fetch; cache miss runs strategy chain and writes resolved agentId back to the registry; subsequent reads hit the cache", async () => {
    const sdk = new FakeSdkService();
    const log = new NullLogService();
    const parentUri = URI.parse("copilot:/parent-sid");
    const registry = disposables.add(new SubagentRegistry());
    registry.primeFromTranscript([
      makeAgentToolCallTurn("toolu_a", { suffixText: "agentId: agentprimeda" })
    ]);
    registry.recordSpawn("toolu_b", { agentId: "agentliveb" });
    sdk.subagentMessages.set("parent-sid::agentprimeda", []);
    sdk.subagentMessages.set("parent-sid::agentliveb", []);
    const subagentUriA = URI.parse(buildSubagentSessionUri(parentUri, "toolu_a"));
    const subagentUriB = URI.parse(buildSubagentSessionUri(parentUri, "toolu_b"));
    await getSubagentTranscript(subagentUriA, registry, sdk, log, CancellationToken.None);
    await getSubagentTranscript(subagentUriB, registry, sdk, log, CancellationToken.None);
    assert.deepStrictEqual({
      fetchedAgentIds: sdk.getSubagentMessagesCalls.map((c) => c.agentId),
      spawnA: registry.getSpawn("toolu_a")?.agentId,
      spawnB: registry.getSpawn("toolu_b")?.agentId
    }, {
      fetchedAgentIds: ["agentprimeda", "agentliveb"],
      spawnA: "agentprimeda",
      spawnB: "agentliveb"
    });
  });
  test("unresolvable agentId returns [] (no SDK fetch attempted) and SDK fetch failure returns [] with warn-log", async () => {
    const sdk = new FakeSdkService();
    const log = new NullLogService();
    const parentUri = URI.parse("copilot:/parent-sid");
    const registry = disposables.add(new SubagentRegistry());
    const noResolve = await getSubagentTranscript(
      URI.parse(buildSubagentSessionUri(parentUri, "toolu_unknown")),
      registry,
      sdk,
      log,
      CancellationToken.None
    );
    registry.recordSpawn("toolu_known", { agentId: "agent-x" });
    sdk.getSubagentMessagesRejection = new Error("boom");
    const onError = await getSubagentTranscript(
      URI.parse(buildSubagentSessionUri(parentUri, "toolu_known")),
      registry,
      sdk,
      log,
      CancellationToken.None
    );
    assert.deepStrictEqual({
      noResolve,
      onError,
      fetchAttempts: sdk.getSubagentMessagesCalls.map((c) => c.agentId)
    }, {
      noResolve: [],
      onError: [],
      fetchAttempts: ["agent-x"]
      // only the cached-hit attempted
    });
  });
});
suite("claudeSubagentResolver \u2014 resolveAgentIdViaChain (free function)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function makeStrategy(name, returns, onCall) {
    return {
      name,
      lookup: async () => {
        onCall?.();
        return returns;
      }
    };
  }
  const ctx = (token = CancellationToken.None) => ({
    parentUri: URI.parse("copilot:/p"),
    parentSessionId: "p",
    token
  });
  function makeDeps(strategies) {
    const cache = /* @__PURE__ */ new Map();
    const cacheReads = [];
    const cacheWrites = [];
    return {
      strategies,
      cacheReads,
      cacheWrites,
      cacheGet: (id) => {
        cacheReads.push(id);
        return cache.get(id);
      },
      cacheSet: (id, agentId) => {
        cacheWrites.push({ id, agentId });
        cache.set(id, agentId);
      },
      seedCache: (id, agentId) => cache.set(id, agentId)
    };
  }
  test("cache hit short-circuits before any strategy runs", async () => {
    const calls = [];
    const deps = makeDeps([
      makeStrategy("s1", "should-not-fire", () => calls.push("s1"))
    ]);
    deps.seedCache("toolu", "cached-agent");
    const out = await resolveAgentIdViaChain("toolu", ctx(), deps);
    assert.deepStrictEqual({ out, calls, cacheWrites: deps.cacheWrites }, {
      out: "cached-agent",
      calls: [],
      cacheWrites: []
    });
  });
  test("chain ordering: first non-undefined hit wins, later strategies skipped, cache populated", async () => {
    const calls = [];
    const deps = makeDeps([
      makeStrategy("s1", void 0, () => calls.push("s1")),
      makeStrategy("s2", "agent-from-s2", () => calls.push("s2")),
      makeStrategy("s3", "agent-from-s3", () => calls.push("s3"))
    ]);
    const out = await resolveAgentIdViaChain("toolu", ctx(), deps);
    assert.deepStrictEqual({ out, calls, cacheWrites: deps.cacheWrites }, {
      out: "agent-from-s2",
      calls: ["s1", "s2"],
      cacheWrites: [{ id: "toolu", agentId: "agent-from-s2" }]
    });
  });
  test("full miss returns undefined and writes nothing", async () => {
    const deps = makeDeps([
      makeStrategy("s1", void 0),
      makeStrategy("s2", void 0)
    ]);
    const out = await resolveAgentIdViaChain("toolu", ctx(), deps);
    assert.deepStrictEqual({ out, cacheWrites: deps.cacheWrites }, {
      out: void 0,
      cacheWrites: []
    });
  });
  test("cancellation between strategies stops the chain", async () => {
    const tokenSource = new CancellationTokenSource();
    const calls = [];
    const deps = makeDeps([
      makeStrategy("s1", void 0, () => {
        calls.push("s1");
        tokenSource.cancel();
      }),
      makeStrategy("s2", "never-reached", () => calls.push("s2"))
    ]);
    const out = await resolveAgentIdViaChain("toolu", ctx(tokenSource.token), deps);
    assert.deepStrictEqual({ out, calls, cacheWrites: deps.cacheWrites }, {
      out: void 0,
      calls: ["s1"],
      cacheWrites: []
    });
  });
});
suite("claudeSubagentResolver \u2014 extractSpawningPromptFromTranscript", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns prompt for matching subagent tool; rejects malformed/streaming/wrong-tool", () => {
    const transcript = [
      makeAgentToolCallTurn("toolu_match", { prompt: "do the thing" }),
      makeAgentToolCallTurn("toolu_streaming", { prompt: "unfinished", status: void 0 }),
      makeAgentToolCallTurn("toolu_wrong_tool", { prompt: "p", toolName: "Read" }),
      makeAgentToolCallTurn("toolu_bad_json", {})
    ];
    transcript[1].responseParts[0].toolCall.status = ToolCallStatus.Streaming;
    transcript[3].responseParts[0].toolCall.toolInput = "{not json";
    assert.deepStrictEqual({
      match: extractSpawningPromptFromTranscript(transcript, "toolu_match"),
      streaming: extractSpawningPromptFromTranscript(transcript, "toolu_streaming"),
      wrongTool: extractSpawningPromptFromTranscript(transcript, "toolu_wrong_tool"),
      badJson: extractSpawningPromptFromTranscript(transcript, "toolu_bad_json"),
      missing: extractSpawningPromptFromTranscript(transcript, "toolu_unknown")
    }, {
      match: "do the thing",
      streaming: void 0,
      wrongTool: void 0,
      badJson: void 0,
      missing: void 0
    });
  });
});
suite("claudeSubagentResolver \u2014 fetchParentTurns", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns ctx.parentTranscript without calling SDK; falls through to SDK; logs and returns undefined on SDK error", async () => {
    const sdk = new FakeSdkService();
    const log = new NullLogService();
    const baseCtx = (overrides) => ({
      parentSessionId: "sess-1",
      parentUri: URI.parse("file:///parent"),
      token: CancellationToken.None,
      ...overrides
    });
    const cached = [];
    const fromCache = await fetchParentTurns(sdk, log, baseCtx({ parentTranscript: cached }), "L");
    const fromSdk = await fetchParentTurns(sdk, log, baseCtx({}), "L");
    sdk.getSessionMessagesRejection = new Error("boom");
    const onError = await fetchParentTurns(sdk, log, baseCtx({}), "L");
    assert.deepStrictEqual({
      fromCacheIsCached: fromCache === cached,
      fromCacheCallCount: 0,
      fromSdkIsArray: Array.isArray(fromSdk),
      onError,
      totalSdkCalls: sdk.getSessionMessagesCalls.length
    }, {
      fromCacheIsCached: true,
      fromCacheCallCount: 0,
      fromSdkIsArray: true,
      onError: void 0,
      totalSdkCalls: 2
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY2xhdWRlU3ViYWdlbnRSZXNvbHZlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgeyBHZXRTZXNzaW9uTWVzc2FnZXNPcHRpb25zLCBHZXRTdWJhZ2VudE1lc3NhZ2VzT3B0aW9ucywgTGlzdFN1YmFnZW50c09wdGlvbnMsIE9wdGlvbnMsIFF1ZXJ5LCBTREtTZXNzaW9uSW5mbywgU0RLVXNlck1lc3NhZ2UsIFNlc3Npb25NZXNzYWdlLCBXYXJtUXVlcnkgfSBmcm9tICdAYW50aHJvcGljLWFpL2NsYXVkZS1hZ2VudC1zZGsnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbFN0YXR1cywgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElDbGF1ZGVBZ2VudFNka1NlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVBZ2VudFNka1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgc2NhblRyYW5zY3JpcHRGb3JBZ2VudElkcywgU1VCQUdFTlRfSURfU1VGRklYX1JFR0VYLCBTdWJhZ2VudFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlU3ViYWdlbnRSZWdpc3RyeS5qcyc7XG5pbXBvcnQge1xuXHRleHRyYWN0U3Bhd25pbmdQcm9tcHRGcm9tVHJhbnNjcmlwdCxcblx0ZmV0Y2hQYXJlbnRUdXJucyxcblx0Z2V0U3ViYWdlbnRUcmFuc2NyaXB0LFxuXHR0eXBlIElTdWJhZ2VudExvb2t1cENvbnRleHQsXG5cdHR5cGUgSVN1YmFnZW50TG9va3VwU3RyYXRlZ3ksXG5cdE5hdGl2ZVN0cmF0ZWd5LFxuXHRQcm9tcHRNYXRjaFN0cmF0ZWd5LFxuXHRyZXNvbHZlQWdlbnRJZFZpYUNoYWluLFxuXHRUZXh0U3VmZml4U3RyYXRlZ3ksXG59IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZVN1YmFnZW50UmVzb2x2ZXIuanMnO1xuXG5jbGFzcyBGYWtlU2RrU2VydmljZSBpbXBsZW1lbnRzIElDbGF1ZGVBZ2VudFNka1NlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRzZXNzaW9uTWVzc2FnZXMgPSBuZXcgTWFwPHN0cmluZywgcmVhZG9ubHkgU2Vzc2lvbk1lc3NhZ2VbXT4oKTtcblx0c3ViYWdlbnRJZHMgPSBuZXcgTWFwPHN0cmluZywgcmVhZG9ubHkgc3RyaW5nW10+KCk7XG5cdHN1YmFnZW50TWVzc2FnZXMgPSBuZXcgTWFwPHN0cmluZywgcmVhZG9ubHkgU2Vzc2lvbk1lc3NhZ2VbXT4oKTtcblxuXHRsaXN0U2Vzc2lvbnNSZWplY3Rpb246IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRnZXRTZXNzaW9uTWVzc2FnZXNSZWplY3Rpb246IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRsaXN0U3ViYWdlbnRzUmVqZWN0aW9uOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0Z2V0U3ViYWdlbnRNZXNzYWdlc1JlamVjdGlvbjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cblx0Z2V0U2Vzc2lvbk1lc3NhZ2VzQ2FsbHM6IHsgc2Vzc2lvbklkOiBzdHJpbmc7IG9wdGlvbnM6IHVua25vd24gfVtdID0gW107XG5cdGxpc3RTdWJhZ2VudHNDYWxsczogc3RyaW5nW10gPSBbXTtcblx0Z2V0U3ViYWdlbnRNZXNzYWdlc0NhbGxzOiB7IHNlc3Npb25JZDogc3RyaW5nOyBhZ2VudElkOiBzdHJpbmcgfVtdID0gW107XG5cblx0YXN5bmMgbGlzdFNlc3Npb25zKCk6IFByb21pc2U8cmVhZG9ubHkgU0RLU2Vzc2lvbkluZm9bXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgY2FuTG9hZFdpdGhvdXREb3dubG9hZCgpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIHRydWU7IH1cblx0YXN5bmMgZ2V0U2Vzc2lvbkluZm8oX2lkOiBzdHJpbmcpOiBQcm9taXNlPFNES1Nlc3Npb25JbmZvIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgc3RhcnR1cChfcDogeyBvcHRpb25zOiBPcHRpb25zOyBpbml0aWFsaXplVGltZW91dE1zPzogbnVtYmVyIH0pOiBQcm9taXNlPFdhcm1RdWVyeT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCB1c2VkJyk7IH1cblx0YXN5bmMgcXVlcnkoX3BhcmFtczogeyBwcm9tcHQ6IHN0cmluZyB8IEFzeW5jSXRlcmFibGU8U0RLVXNlck1lc3NhZ2U+OyBvcHRpb25zPzogT3B0aW9ucyB9KTogUHJvbWlzZTxRdWVyeT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCB1c2VkJyk7IH1cblx0YXN5bmMgZ2V0U2Vzc2lvbk1lc3NhZ2VzKHNlc3Npb25JZDogc3RyaW5nLCBvcHRpb25zPzogR2V0U2Vzc2lvbk1lc3NhZ2VzT3B0aW9ucyk6IFByb21pc2U8cmVhZG9ubHkgU2Vzc2lvbk1lc3NhZ2VbXT4ge1xuXHRcdHRoaXMuZ2V0U2Vzc2lvbk1lc3NhZ2VzQ2FsbHMucHVzaCh7IHNlc3Npb25JZCwgb3B0aW9ucyB9KTtcblx0XHRpZiAodGhpcy5nZXRTZXNzaW9uTWVzc2FnZXNSZWplY3Rpb24pIHsgdGhyb3cgdGhpcy5nZXRTZXNzaW9uTWVzc2FnZXNSZWplY3Rpb247IH1cblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uTWVzc2FnZXMuZ2V0KHNlc3Npb25JZCkgPz8gW107XG5cdH1cblx0YXN5bmMgbGlzdFN1YmFnZW50cyhzZXNzaW9uSWQ6IHN0cmluZywgX29wdGlvbnM/OiBMaXN0U3ViYWdlbnRzT3B0aW9ucyk6IFByb21pc2U8cmVhZG9ubHkgc3RyaW5nW10+IHtcblx0XHR0aGlzLmxpc3RTdWJhZ2VudHNDYWxscy5wdXNoKHNlc3Npb25JZCk7XG5cdFx0aWYgKHRoaXMubGlzdFN1YmFnZW50c1JlamVjdGlvbikgeyB0aHJvdyB0aGlzLmxpc3RTdWJhZ2VudHNSZWplY3Rpb247IH1cblx0XHRyZXR1cm4gdGhpcy5zdWJhZ2VudElkcy5nZXQoc2Vzc2lvbklkKSA/PyBbXTtcblx0fVxuXHRhc3luYyBnZXRTdWJhZ2VudE1lc3NhZ2VzKHNlc3Npb25JZDogc3RyaW5nLCBhZ2VudElkOiBzdHJpbmcsIF9vcHRpb25zPzogR2V0U3ViYWdlbnRNZXNzYWdlc09wdGlvbnMpOiBQcm9taXNlPHJlYWRvbmx5IFNlc3Npb25NZXNzYWdlW10+IHtcblx0XHR0aGlzLmdldFN1YmFnZW50TWVzc2FnZXNDYWxscy5wdXNoKHsgc2Vzc2lvbklkLCBhZ2VudElkIH0pO1xuXHRcdGlmICh0aGlzLmdldFN1YmFnZW50TWVzc2FnZXNSZWplY3Rpb24pIHsgdGhyb3cgdGhpcy5nZXRTdWJhZ2VudE1lc3NhZ2VzUmVqZWN0aW9uOyB9XG5cdFx0cmV0dXJuIHRoaXMuc3ViYWdlbnRNZXNzYWdlcy5nZXQoYCR7c2Vzc2lvbklkfTo6JHthZ2VudElkfWApID8/IFtdO1xuXHR9XG5cdGFzeW5jIGZvcmtTZXNzaW9uKCk6IFByb21pc2U8bmV2ZXI+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQgaW4gdGVzdCBmYWtlJyk7IH1cblx0YXN5bmMgZGVsZXRlU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQgaW4gdGVzdCBmYWtlJyk7IH1cblx0YXN5bmMgY3JlYXRlU2RrTWNwU2VydmVyKCk6IFByb21pc2U8bmV2ZXI+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQgaW4gdGVzdCBmYWtlJyk7IH1cblx0YXN5bmMgdG9vbCgpOiBQcm9taXNlPG5ldmVyPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkIGluIHRlc3QgZmFrZScpOyB9XG59XG5cbmZ1bmN0aW9uIG1ha2VBZ2VudFRvb2xDYWxsVHVybih0b29sQ2FsbElkOiBzdHJpbmcsIG9wdHM6IHsgcHJvbXB0Pzogc3RyaW5nOyBzdWZmaXhUZXh0Pzogc3RyaW5nOyB0b29sTmFtZT86IHN0cmluZzsgc3RhdHVzPzogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkIH0pOiBUdXJuIHtcblx0cmV0dXJuIHtcblx0XHRpZDogJ3R1cm4tJyArIHRvb2xDYWxsSWQsXG5cdFx0bWVzc2FnZTogeyB0ZXh0OiAnJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdHJlc3BvbnNlUGFydHM6IFt7XG5cdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbE5hbWU6IG9wdHMudG9vbE5hbWUgPz8gJ1Rhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rhc2snLFxuXHRcdFx0XHRzdGF0dXM6IG9wdHMuc3RhdHVzID8/IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnaW52b2tpbmcgdGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dDogb3B0cy5wcm9tcHQgIT09IHVuZGVmaW5lZCA/IEpTT04uc3RyaW5naWZ5KHsgcHJvbXB0OiBvcHRzLnByb21wdCwgZGVzY3JpcHRpb246ICdkJyB9KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ3Rhc2sgZG9uZScsXG5cdFx0XHRcdGNvbnRlbnQ6IG9wdHMuc3VmZml4VGV4dCAhPT0gdW5kZWZpbmVkID8gW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IG9wdHMuc3VmZml4VGV4dCB9XSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0fV0sXG5cdFx0c3RhdGU6IDAgYXMgdW5rbm93biBhcyBUdXJuWydzdGF0ZSddLFxuXHRcdHN0YXJ0ZWRBdDogJzE5NzAtMDEtMDFUMDA6MDA6MDAuMDAxWicsXG5cdFx0ZHVyYXRpb246IDIsXG5cdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0fSBhcyBUdXJuO1xufVxuXG5zdWl0ZSgnY2xhdWRlU3ViYWdlbnRSZXNvbHZlciBcdTIwMTQgU1VCQUdFTlRfSURfU1VGRklYX1JFR0VYJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXRjaGVzIGNhbm9uaWNhbCBhbmQgZHJpZnRlZCBmb3JtYXRzOyByZWplY3RzIHVucmVsYXRlZCB0ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBbXG5cdFx0XHQnYWdlbnRJZDogYWJjMTIzICh1c2UgU2VuZE1lc3NhZ2Ugd2l0aCB0bzogXFwnYWJjMTIzXFwnKSAuLi4nLFxuXHRcdFx0J2FnZW50SWQ6ICAgYWJjMTIzXFxuJywgLy8gbXVsdGlwbGUgc3BhY2VzXG5cdFx0XHQnICBhZ2VudElkOiBhYmMxMjMnLCAvLyBsZWFkaW5nIHdoaXRlc3BhY2Vcblx0XHRcdCdBZ2VudElkOiBBQkMxMjMnLCAvLyBtaXhlZCBjYXNlIHJlamVjdGVkPyBcdTIwMTQgcmVnZXggaXMgY2FzZS1pbnNlbnNpdGl2ZVxuXHRcdFx0J25vaXNlXFxuYWdlbnRJZDogeHl6Nzg5IHRyYWlsaW5nJywgLy8gbXVsdGktbGluZSwgYW5jaG9yZWQgdG8gbGluZSBzdGFydFxuXHRcdFx0J2FnZW50aWQ6YWJjJywgLy8gbWlzc2luZyBzcGFjZSBhZnRlciBjb2xvbiBcdTIwMTQgcmVqZWN0ZWRcblx0XHRcdCdkZXNjcmlwdGlvbjogbm90IGFuIGFnZW50IGlkJyxcblx0XHRdLm1hcChpbnB1dCA9PiB7XG5cdFx0XHRjb25zdCBtID0gU1VCQUdFTlRfSURfU1VGRklYX1JFR0VYLmV4ZWMoaW5wdXQpO1xuXHRcdFx0cmV0dXJuIG0gPyBtWzFdIDogdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cywgW1xuXHRcdFx0J2FiYzEyMycsXG5cdFx0XHQnYWJjMTIzJyxcblx0XHRcdCdhYmMxMjMnLFxuXHRcdFx0J0FCQzEyMycsXG5cdFx0XHQneHl6Nzg5Jyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRdKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NsYXVkZVN1YmFnZW50UmVzb2x2ZXIgXHUyMDE0IFRleHRTdWZmaXhTdHJhdGVneScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaGl0cyB3aGVuIHBhcmVudCB0cmFuc2NyaXB0IGNhcnJpZXMgdGhlIHN5bnRoZXRpYyBzdWZmaXg7IG1pc3NlcyBvdGhlcndpc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2RrID0gbmV3IEZha2VTZGtTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RyYXQgPSBuZXcgVGV4dFN1ZmZpeFN0cmF0ZWd5KHNkaywgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHBhcmVudFVyaSA9IFVSSS5wYXJzZSgnY29waWxvdDovcGFyZW50LXNpZCcpO1xuXHRcdGNvbnN0IGN0eDogSVN1YmFnZW50TG9va3VwQ29udGV4dCA9IHtcblx0XHRcdHBhcmVudFVyaSxcblx0XHRcdHBhcmVudFNlc3Npb25JZDogJ3BhcmVudC1zaWQnLFxuXHRcdFx0cGFyZW50VHJhbnNjcmlwdDogW1xuXHRcdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X2hpdCcsIHsgc3VmZml4VGV4dDogJ3doYXRldmVyXFxuYWdlbnRJZDogYTdiM2MxZDJcXG4odHJhaWxpbmcpJyB9KSxcblx0XHRcdFx0bWFrZUFnZW50VG9vbENhbGxUdXJuKCd0b29sdV9ub19zdWZmaXgnLCB7IHN1ZmZpeFRleHQ6ICdqdXN0IHRleHQsIG5vIG1hcmtlcicgfSksXG5cdFx0XHRdLFxuXHRcdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhpdDogYXdhaXQgc3RyYXQubG9va3VwKCd0b29sdV9oaXQnLCBjdHgpLFxuXHRcdFx0bWlzczogYXdhaXQgc3RyYXQubG9va3VwKCd0b29sdV9ub19zdWZmaXgnLCBjdHgpLFxuXHRcdFx0dW5rbm93bjogYXdhaXQgc3RyYXQubG9va3VwKCd0b29sdV91bmtub3duJywgY3R4KSxcblx0XHR9LCB7IGhpdDogJ2E3YjNjMWQyJywgbWlzczogdW5kZWZpbmVkLCB1bmtub3duOiB1bmRlZmluZWQgfSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjbGF1ZGVTdWJhZ2VudFJlc29sdmVyIFx1MjAxNCBQcm9tcHRNYXRjaFN0cmF0ZWd5JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdmaW5kcyB0aGUgYWdlbnQgd2hvc2UgZmlyc3QgdXNlciBtZXNzYWdlIG1hdGNoZXMgdGhlIHBhcmVudCBBZ2VudC50b29sX3VzZS5pbnB1dC5wcm9tcHQ7IHJlamVjdHMgbWFsZm9ybWVkIGlucHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNkayA9IG5ldyBGYWtlU2RrU2VydmljZSgpO1xuXHRcdGNvbnN0IHBhcmVudFVyaSA9IFVSSS5wYXJzZSgnY29waWxvdDovcGFyZW50LXNpZCcpO1xuXHRcdHNkay5zdWJhZ2VudElkcy5zZXQoJ3BhcmVudC1zaWQnLCBbJ2FnZW50b3RoZXInLCAnYWdlbnR0YXJnZXQnXSk7XG5cdFx0c2RrLnN1YmFnZW50TWVzc2FnZXMuc2V0KCdwYXJlbnQtc2lkOjphZ2VudG90aGVyJywgW3tcblx0XHRcdHR5cGU6ICd1c2VyJyxcblx0XHRcdG1lc3NhZ2U6IHsgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnZGlmZmVyZW50IHByb21wdCcgfV0gfSxcblx0XHR9IGFzIHVua25vd24gYXMgU2Vzc2lvbk1lc3NhZ2VdKTtcblx0XHRzZGsuc3ViYWdlbnRNZXNzYWdlcy5zZXQoJ3BhcmVudC1zaWQ6OmFnZW50dGFyZ2V0JywgW3tcblx0XHRcdHR5cGU6ICd1c2VyJyxcblx0XHRcdG1lc3NhZ2U6IHsgY29udGVudDogJ2RvIHRoZSB0aGluZycgfSxcblx0XHR9IGFzIHVua25vd24gYXMgU2Vzc2lvbk1lc3NhZ2VdKTtcblxuXHRcdGNvbnN0IHN0cmF0ID0gbmV3IFByb21wdE1hdGNoU3RyYXRlZ3koc2RrLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY3R4OiBJU3ViYWdlbnRMb29rdXBDb250ZXh0ID0ge1xuXHRcdFx0cGFyZW50VXJpLFxuXHRcdFx0cGFyZW50U2Vzc2lvbklkOiAncGFyZW50LXNpZCcsXG5cdFx0XHRwYXJlbnRUcmFuc2NyaXB0OiBbXG5cdFx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfdGFyZ2V0JywgeyBwcm9tcHQ6ICdkbyB0aGUgdGhpbmcnIH0pLFxuXHRcdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X21hbGZvcm1lZCcsIHsgcHJvbXB0OiB1bmRlZmluZWQgfSksIC8vIG1pc3NpbmcgdG9vbElucHV0XG5cdFx0XHRdLFxuXHRcdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWF0Y2hlZDogYXdhaXQgc3RyYXQubG9va3VwKCd0b29sdV90YXJnZXQnLCBjdHgpLFxuXHRcdFx0bWFsZm9ybWVkOiBhd2FpdCBzdHJhdC5sb29rdXAoJ3Rvb2x1X21hbGZvcm1lZCcsIGN0eCksXG5cdFx0XHR1bmtub3duVG9vbENhbGw6IGF3YWl0IHN0cmF0Lmxvb2t1cCgndG9vbHVfZG9lc19ub3RfZXhpc3QnLCBjdHgpLFxuXHRcdH0sIHtcblx0XHRcdG1hdGNoZWQ6ICdhZ2VudHRhcmdldCcsXG5cdFx0XHRtYWxmb3JtZWQ6IHVuZGVmaW5lZCxcblx0XHRcdHVua25vd25Ub29sQ2FsbDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnY2xhdWRlU3ViYWdlbnRSZXNvbHZlciBcdTIwMTQgTmF0aXZlU3RyYXRlZ3knLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3BsYWNlaG9sZGVyIHJldHVybnMgdW5kZWZpbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0cmF0ID0gbmV3IE5hdGl2ZVN0cmF0ZWd5KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHN0cmF0Lmxvb2t1cCgpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnY2xhdWRlU3ViYWdlbnRSZXNvbHZlciBcdTIwMTQgc2NhblRyYW5zY3JpcHRGb3JBZ2VudElkcycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZXh0cmFjdHMgZXZlcnkgKHRvb2xDYWxsSWQsIGFnZW50SWQpIHBhaXIgaW4gb25lIHBhc3M7IHNraXBzIHVucmVsYXRlZCB0b29scycsICgpID0+IHtcblx0XHRjb25zdCB0cmFuc2NyaXB0OiByZWFkb25seSBUdXJuW10gPSBbXG5cdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X2EnLCB7IHN1ZmZpeFRleHQ6ICdhZ2VudElkOiBhZ2VudGExJyB9KSxcblx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfYicsIHsgc3VmZml4VGV4dDogJ25vIG1hcmtlcicgfSksXG5cdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X2MnLCB7IHN1ZmZpeFRleHQ6ICdhZ2VudElkOiBhZ2VudGMxJywgdG9vbE5hbWU6ICdCYXNoJyB9KSwgLy8gbm9uLXN1YmFnZW50IHRvb2xcblx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfZCcsIHsgc3VmZml4VGV4dDogJ2FnZW50SWQ6IGFnZW50ZDEnLCB0b29sTmFtZTogJ0FnZW50JyB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHBhaXJzID0gc2NhblRyYW5zY3JpcHRGb3JBZ2VudElkcyh0cmFuc2NyaXB0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5wYWlycy5lbnRyaWVzKCldLnNvcnQoKSwgW1xuXHRcdFx0Wyd0b29sdV9hJywgJ2FnZW50YTEnXSxcblx0XHRcdFsndG9vbHVfZCcsICdhZ2VudGQxJ10sXG5cdFx0XSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjbGF1ZGVTdWJhZ2VudFJlc29sdmVyIFx1MjAxNCBnZXRTdWJhZ2VudFRyYW5zY3JpcHQnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY2FjaGUgaGl0IG9uIHJlZ2lzdHJ5IHNob3J0LWNpcmN1aXRzIFNESyBmZXRjaDsgY2FjaGUgbWlzcyBydW5zIHN0cmF0ZWd5IGNoYWluIGFuZCB3cml0ZXMgcmVzb2x2ZWQgYWdlbnRJZCBiYWNrIHRvIHRoZSByZWdpc3RyeTsgc3Vic2VxdWVudCByZWFkcyBoaXQgdGhlIGNhY2hlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNkayA9IG5ldyBGYWtlU2RrU2VydmljZSgpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHBhcmVudFVyaSA9IFVSSS5wYXJzZSgnY29waWxvdDovcGFyZW50LXNpZCcpO1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdWJhZ2VudFJlZ2lzdHJ5KCkpO1xuXG5cdFx0Ly8gUHJpbWluZyBwb3B1bGF0ZXMgdGhlIHJlZ2lzdHJ5IHdpdGggb25lICh0b29sQ2FsbElkLCBhZ2VudElkKSBwYWlyIHZpYSB0aGUgc3VmZml4IHNjYW4uXG5cdFx0cmVnaXN0cnkucHJpbWVGcm9tVHJhbnNjcmlwdChbXG5cdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X2EnLCB7IHN1ZmZpeFRleHQ6ICdhZ2VudElkOiBhZ2VudHByaW1lZGEnIH0pLFxuXHRcdF0pO1xuXHRcdC8vIExpdmUgd3JpdGUgKGNhblVzZVRvb2wgYnJpZGdlIGRvZXMgdGhpcyBpbiBwcm9kdWN0aW9uKS5cblx0XHRyZWdpc3RyeS5yZWNvcmRTcGF3bigndG9vbHVfYicsIHsgYWdlbnRJZDogJ2FnZW50bGl2ZWInIH0pO1xuXG5cdFx0c2RrLnN1YmFnZW50TWVzc2FnZXMuc2V0KCdwYXJlbnQtc2lkOjphZ2VudHByaW1lZGEnLCBbXSk7XG5cdFx0c2RrLnN1YmFnZW50TWVzc2FnZXMuc2V0KCdwYXJlbnQtc2lkOjphZ2VudGxpdmViJywgW10pO1xuXG5cdFx0Y29uc3Qgc3ViYWdlbnRVcmlBID0gVVJJLnBhcnNlKGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKHBhcmVudFVyaSwgJ3Rvb2x1X2EnKSk7XG5cdFx0Y29uc3Qgc3ViYWdlbnRVcmlCID0gVVJJLnBhcnNlKGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKHBhcmVudFVyaSwgJ3Rvb2x1X2InKSk7XG5cdFx0YXdhaXQgZ2V0U3ViYWdlbnRUcmFuc2NyaXB0KHN1YmFnZW50VXJpQSwgcmVnaXN0cnksIHNkaywgbG9nLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhd2FpdCBnZXRTdWJhZ2VudFRyYW5zY3JpcHQoc3ViYWdlbnRVcmlCLCByZWdpc3RyeSwgc2RrLCBsb2csIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmZXRjaGVkQWdlbnRJZHM6IHNkay5nZXRTdWJhZ2VudE1lc3NhZ2VzQ2FsbHMubWFwKGMgPT4gYy5hZ2VudElkKSxcblx0XHRcdHNwYXduQTogcmVnaXN0cnkuZ2V0U3Bhd24oJ3Rvb2x1X2EnKT8uYWdlbnRJZCxcblx0XHRcdHNwYXduQjogcmVnaXN0cnkuZ2V0U3Bhd24oJ3Rvb2x1X2InKT8uYWdlbnRJZCxcblx0XHR9LCB7XG5cdFx0XHRmZXRjaGVkQWdlbnRJZHM6IFsnYWdlbnRwcmltZWRhJywgJ2FnZW50bGl2ZWInXSxcblx0XHRcdHNwYXduQTogJ2FnZW50cHJpbWVkYScsXG5cdFx0XHRzcGF3bkI6ICdhZ2VudGxpdmViJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndW5yZXNvbHZhYmxlIGFnZW50SWQgcmV0dXJucyBbXSAobm8gU0RLIGZldGNoIGF0dGVtcHRlZCkgYW5kIFNESyBmZXRjaCBmYWlsdXJlIHJldHVybnMgW10gd2l0aCB3YXJuLWxvZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZGsgPSBuZXcgRmFrZVNka1NlcnZpY2UoKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBwYXJlbnRVcmkgPSBVUkkucGFyc2UoJ2NvcGlsb3Q6L3BhcmVudC1zaWQnKTtcblx0XHRjb25zdCByZWdpc3RyeSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU3ViYWdlbnRSZWdpc3RyeSgpKTtcblxuXHRcdC8vIE5vIHByaW1lLCBubyBzcGF3biByZWNvcmQgXHUyMDE0IHN0cmF0ZWdpZXMgYWxsIHJldHVybiB1bmRlZmluZWQgZm9yIGFuIHVua25vd24gaWQuXG5cdFx0Y29uc3Qgbm9SZXNvbHZlID0gYXdhaXQgZ2V0U3ViYWdlbnRUcmFuc2NyaXB0KFxuXHRcdFx0VVJJLnBhcnNlKGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKHBhcmVudFVyaSwgJ3Rvb2x1X3Vua25vd24nKSksXG5cdFx0XHRyZWdpc3RyeSwgc2RrLCBsb2csIENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdC8vIENhY2hlZCBzcGF3biBidXQgU0RLIHJlamVjdHMgXHUyMDE0IHJldHVybnMgW10uXG5cdFx0cmVnaXN0cnkucmVjb3JkU3Bhd24oJ3Rvb2x1X2tub3duJywgeyBhZ2VudElkOiAnYWdlbnQteCcgfSk7XG5cdFx0c2RrLmdldFN1YmFnZW50TWVzc2FnZXNSZWplY3Rpb24gPSBuZXcgRXJyb3IoJ2Jvb20nKTtcblx0XHRjb25zdCBvbkVycm9yID0gYXdhaXQgZ2V0U3ViYWdlbnRUcmFuc2NyaXB0KFxuXHRcdFx0VVJJLnBhcnNlKGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKHBhcmVudFVyaSwgJ3Rvb2x1X2tub3duJykpLFxuXHRcdFx0cmVnaXN0cnksIHNkaywgbG9nLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG5vUmVzb2x2ZSxcblx0XHRcdG9uRXJyb3IsXG5cdFx0XHRmZXRjaEF0dGVtcHRzOiBzZGsuZ2V0U3ViYWdlbnRNZXNzYWdlc0NhbGxzLm1hcChjID0+IGMuYWdlbnRJZCksXG5cdFx0fSwge1xuXHRcdFx0bm9SZXNvbHZlOiBbXSxcblx0XHRcdG9uRXJyb3I6IFtdLFxuXHRcdFx0ZmV0Y2hBdHRlbXB0czogWydhZ2VudC14J10sIC8vIG9ubHkgdGhlIGNhY2hlZC1oaXQgYXR0ZW1wdGVkXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjbGF1ZGVTdWJhZ2VudFJlc29sdmVyIFx1MjAxNCByZXNvbHZlQWdlbnRJZFZpYUNoYWluIChmcmVlIGZ1bmN0aW9uKScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gbWFrZVN0cmF0ZWd5KG5hbWU6IHN0cmluZywgcmV0dXJuczogc3RyaW5nIHwgdW5kZWZpbmVkLCBvbkNhbGw/OiAoKSA9PiB2b2lkKTogSVN1YmFnZW50TG9va3VwU3RyYXRlZ3kge1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lLFxuXHRcdFx0bG9va3VwOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdG9uQ2FsbD8uKCk7XG5cdFx0XHRcdHJldHVybiByZXR1cm5zO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0Y29uc3QgY3R4ID0gKHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IElTdWJhZ2VudExvb2t1cENvbnRleHQgPT4gKHtcblx0XHRwYXJlbnRVcmk6IFVSSS5wYXJzZSgnY29waWxvdDovcCcpLFxuXHRcdHBhcmVudFNlc3Npb25JZDogJ3AnLFxuXHRcdHRva2VuLFxuXHR9KTtcblxuXHRmdW5jdGlvbiBtYWtlRGVwcyhzdHJhdGVnaWVzOiByZWFkb25seSBJU3ViYWdlbnRMb29rdXBTdHJhdGVneVtdKToge1xuXHRcdHN0cmF0ZWdpZXM6IHJlYWRvbmx5IElTdWJhZ2VudExvb2t1cFN0cmF0ZWd5W107XG5cdFx0Y2FjaGVHZXQ6IChpZDogc3RyaW5nKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y2FjaGVTZXQ6IChpZDogc3RyaW5nLCBhZ2VudElkOiBzdHJpbmcpID0+IHZvaWQ7XG5cdFx0Y2FjaGVSZWFkczogc3RyaW5nW107XG5cdFx0Y2FjaGVXcml0ZXM6IHsgaWQ6IHN0cmluZzsgYWdlbnRJZDogc3RyaW5nIH1bXTtcblx0XHRzZWVkQ2FjaGUoaWQ6IHN0cmluZywgYWdlbnRJZDogc3RyaW5nKTogdm9pZDtcblx0fSB7XG5cdFx0Y29uc3QgY2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IGNhY2hlUmVhZHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY2FjaGVXcml0ZXM6IHsgaWQ6IHN0cmluZzsgYWdlbnRJZDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzdHJhdGVnaWVzLFxuXHRcdFx0Y2FjaGVSZWFkcyxcblx0XHRcdGNhY2hlV3JpdGVzLFxuXHRcdFx0Y2FjaGVHZXQ6IGlkID0+IHsgY2FjaGVSZWFkcy5wdXNoKGlkKTsgcmV0dXJuIGNhY2hlLmdldChpZCk7IH0sXG5cdFx0XHRjYWNoZVNldDogKGlkLCBhZ2VudElkKSA9PiB7IGNhY2hlV3JpdGVzLnB1c2goeyBpZCwgYWdlbnRJZCB9KTsgY2FjaGUuc2V0KGlkLCBhZ2VudElkKTsgfSxcblx0XHRcdHNlZWRDYWNoZTogKGlkLCBhZ2VudElkKSA9PiBjYWNoZS5zZXQoaWQsIGFnZW50SWQpLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdjYWNoZSBoaXQgc2hvcnQtY2lyY3VpdHMgYmVmb3JlIGFueSBzdHJhdGVneSBydW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGRlcHMgPSBtYWtlRGVwcyhbXG5cdFx0XHRtYWtlU3RyYXRlZ3koJ3MxJywgJ3Nob3VsZC1ub3QtZmlyZScsICgpID0+IGNhbGxzLnB1c2goJ3MxJykpLFxuXHRcdF0pO1xuXHRcdGRlcHMuc2VlZENhY2hlKCd0b29sdScsICdjYWNoZWQtYWdlbnQnKTtcblxuXHRcdGNvbnN0IG91dCA9IGF3YWl0IHJlc29sdmVBZ2VudElkVmlhQ2hhaW4oJ3Rvb2x1JywgY3R4KCksIGRlcHMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG91dCwgY2FsbHMsIGNhY2hlV3JpdGVzOiBkZXBzLmNhY2hlV3JpdGVzIH0sIHtcblx0XHRcdG91dDogJ2NhY2hlZC1hZ2VudCcsXG5cdFx0XHRjYWxsczogW10sXG5cdFx0XHRjYWNoZVdyaXRlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYWluIG9yZGVyaW5nOiBmaXJzdCBub24tdW5kZWZpbmVkIGhpdCB3aW5zLCBsYXRlciBzdHJhdGVnaWVzIHNraXBwZWQsIGNhY2hlIHBvcHVsYXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBkZXBzID0gbWFrZURlcHMoW1xuXHRcdFx0bWFrZVN0cmF0ZWd5KCdzMScsIHVuZGVmaW5lZCwgKCkgPT4gY2FsbHMucHVzaCgnczEnKSksXG5cdFx0XHRtYWtlU3RyYXRlZ3koJ3MyJywgJ2FnZW50LWZyb20tczInLCAoKSA9PiBjYWxscy5wdXNoKCdzMicpKSxcblx0XHRcdG1ha2VTdHJhdGVneSgnczMnLCAnYWdlbnQtZnJvbS1zMycsICgpID0+IGNhbGxzLnB1c2goJ3MzJykpLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3V0ID0gYXdhaXQgcmVzb2x2ZUFnZW50SWRWaWFDaGFpbigndG9vbHUnLCBjdHgoKSwgZGVwcyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgb3V0LCBjYWxscywgY2FjaGVXcml0ZXM6IGRlcHMuY2FjaGVXcml0ZXMgfSwge1xuXHRcdFx0b3V0OiAnYWdlbnQtZnJvbS1zMicsXG5cdFx0XHRjYWxsczogWydzMScsICdzMiddLFxuXHRcdFx0Y2FjaGVXcml0ZXM6IFt7IGlkOiAndG9vbHUnLCBhZ2VudElkOiAnYWdlbnQtZnJvbS1zMicgfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1bGwgbWlzcyByZXR1cm5zIHVuZGVmaW5lZCBhbmQgd3JpdGVzIG5vdGhpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGVwcyA9IG1ha2VEZXBzKFtcblx0XHRcdG1ha2VTdHJhdGVneSgnczEnLCB1bmRlZmluZWQpLFxuXHRcdFx0bWFrZVN0cmF0ZWd5KCdzMicsIHVuZGVmaW5lZCksXG5cdFx0XSk7XG5cblx0XHRjb25zdCBvdXQgPSBhd2FpdCByZXNvbHZlQWdlbnRJZFZpYUNoYWluKCd0b29sdScsIGN0eCgpLCBkZXBzKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBvdXQsIGNhY2hlV3JpdGVzOiBkZXBzLmNhY2hlV3JpdGVzIH0sIHtcblx0XHRcdG91dDogdW5kZWZpbmVkLFxuXHRcdFx0Y2FjaGVXcml0ZXM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxsYXRpb24gYmV0d2VlbiBzdHJhdGVnaWVzIHN0b3BzIHRoZSBjaGFpbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGRlcHMgPSBtYWtlRGVwcyhbXG5cdFx0XHRtYWtlU3RyYXRlZ3koJ3MxJywgdW5kZWZpbmVkLCAoKSA9PiB7IGNhbGxzLnB1c2goJ3MxJyk7IHRva2VuU291cmNlLmNhbmNlbCgpOyB9KSxcblx0XHRcdG1ha2VTdHJhdGVneSgnczInLCAnbmV2ZXItcmVhY2hlZCcsICgpID0+IGNhbGxzLnB1c2goJ3MyJykpLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3V0ID0gYXdhaXQgcmVzb2x2ZUFnZW50SWRWaWFDaGFpbigndG9vbHUnLCBjdHgodG9rZW5Tb3VyY2UudG9rZW4pLCBkZXBzKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBvdXQsIGNhbGxzLCBjYWNoZVdyaXRlczogZGVwcy5jYWNoZVdyaXRlcyB9LCB7XG5cdFx0XHRvdXQ6IHVuZGVmaW5lZCxcblx0XHRcdGNhbGxzOiBbJ3MxJ10sXG5cdFx0XHRjYWNoZVdyaXRlczogW10sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjbGF1ZGVTdWJhZ2VudFJlc29sdmVyIFx1MjAxNCBleHRyYWN0U3Bhd25pbmdQcm9tcHRGcm9tVHJhbnNjcmlwdCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyBwcm9tcHQgZm9yIG1hdGNoaW5nIHN1YmFnZW50IHRvb2w7IHJlamVjdHMgbWFsZm9ybWVkL3N0cmVhbWluZy93cm9uZy10b29sJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zY3JpcHQ6IHJlYWRvbmx5IFR1cm5bXSA9IFtcblx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfbWF0Y2gnLCB7IHByb21wdDogJ2RvIHRoZSB0aGluZycgfSksXG5cdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X3N0cmVhbWluZycsIHsgcHJvbXB0OiAndW5maW5pc2hlZCcsIHN0YXR1czogdW5kZWZpbmVkIH0pLFxuXHRcdFx0bWFrZUFnZW50VG9vbENhbGxUdXJuKCd0b29sdV93cm9uZ190b29sJywgeyBwcm9tcHQ6ICdwJywgdG9vbE5hbWU6ICdSZWFkJyB9KSxcblx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfYmFkX2pzb24nLCB7fSksXG5cdFx0XTtcblx0XHQvLyBNdXRhdGUgdGhlIHN0cmVhbWluZyB0dXJuIGludG8gYWN0dWFsIHN0cmVhbWluZyBzdGF0dXMgKGhlbHBlciBkZWZhdWx0cyB0byBDb21wbGV0ZWQpLlxuXHRcdCh0cmFuc2NyaXB0WzFdLnJlc3BvbnNlUGFydHNbMF0gYXMgeyB0b29sQ2FsbDogeyBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzIH0gfSkudG9vbENhbGwuc3RhdHVzID0gVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nO1xuXHRcdC8vIE11dGF0ZSBiYWQtanNvbiB0dXJuIHRvIGhhdmUgbm9uLXN0cmluZyB0b29sSW5wdXQuXG5cdFx0KHRyYW5zY3JpcHRbM10ucmVzcG9uc2VQYXJ0c1swXSBhcyB7IHRvb2xDYWxsOiB7IHRvb2xJbnB1dDogdW5rbm93biB9IH0pLnRvb2xDYWxsLnRvb2xJbnB1dCA9ICd7bm90IGpzb24nO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtYXRjaDogZXh0cmFjdFNwYXduaW5nUHJvbXB0RnJvbVRyYW5zY3JpcHQodHJhbnNjcmlwdCwgJ3Rvb2x1X21hdGNoJyksXG5cdFx0XHRzdHJlYW1pbmc6IGV4dHJhY3RTcGF3bmluZ1Byb21wdEZyb21UcmFuc2NyaXB0KHRyYW5zY3JpcHQsICd0b29sdV9zdHJlYW1pbmcnKSxcblx0XHRcdHdyb25nVG9vbDogZXh0cmFjdFNwYXduaW5nUHJvbXB0RnJvbVRyYW5zY3JpcHQodHJhbnNjcmlwdCwgJ3Rvb2x1X3dyb25nX3Rvb2wnKSxcblx0XHRcdGJhZEpzb246IGV4dHJhY3RTcGF3bmluZ1Byb21wdEZyb21UcmFuc2NyaXB0KHRyYW5zY3JpcHQsICd0b29sdV9iYWRfanNvbicpLFxuXHRcdFx0bWlzc2luZzogZXh0cmFjdFNwYXduaW5nUHJvbXB0RnJvbVRyYW5zY3JpcHQodHJhbnNjcmlwdCwgJ3Rvb2x1X3Vua25vd24nKSxcblx0XHR9LCB7XG5cdFx0XHRtYXRjaDogJ2RvIHRoZSB0aGluZycsXG5cdFx0XHRzdHJlYW1pbmc6IHVuZGVmaW5lZCxcblx0XHRcdHdyb25nVG9vbDogdW5kZWZpbmVkLFxuXHRcdFx0YmFkSnNvbjogdW5kZWZpbmVkLFxuXHRcdFx0bWlzc2luZzogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnY2xhdWRlU3ViYWdlbnRSZXNvbHZlciBcdTIwMTQgZmV0Y2hQYXJlbnRUdXJucycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyBjdHgucGFyZW50VHJhbnNjcmlwdCB3aXRob3V0IGNhbGxpbmcgU0RLOyBmYWxscyB0aHJvdWdoIHRvIFNESzsgbG9ncyBhbmQgcmV0dXJucyB1bmRlZmluZWQgb24gU0RLIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNkayA9IG5ldyBGYWtlU2RrU2VydmljZSgpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGJhc2VDdHggPSAob3ZlcnJpZGVzOiBQYXJ0aWFsPElTdWJhZ2VudExvb2t1cENvbnRleHQ+KTogSVN1YmFnZW50TG9va3VwQ29udGV4dCA9PiAoe1xuXHRcdFx0cGFyZW50U2Vzc2lvbklkOiAnc2Vzcy0xJyxcblx0XHRcdHBhcmVudFVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3BhcmVudCcpLFxuXHRcdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQuLi5vdmVycmlkZXMsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBjYWNoZWQ6IHJlYWRvbmx5IFR1cm5bXSA9IFtdO1xuXHRcdGNvbnN0IGZyb21DYWNoZSA9IGF3YWl0IGZldGNoUGFyZW50VHVybnMoc2RrLCBsb2csIGJhc2VDdHgoeyBwYXJlbnRUcmFuc2NyaXB0OiBjYWNoZWQgfSksICdMJyk7XG5cdFx0Y29uc3QgZnJvbVNkayA9IGF3YWl0IGZldGNoUGFyZW50VHVybnMoc2RrLCBsb2csIGJhc2VDdHgoe30pLCAnTCcpO1xuXHRcdHNkay5nZXRTZXNzaW9uTWVzc2FnZXNSZWplY3Rpb24gPSBuZXcgRXJyb3IoJ2Jvb20nKTtcblx0XHRjb25zdCBvbkVycm9yID0gYXdhaXQgZmV0Y2hQYXJlbnRUdXJucyhzZGssIGxvZywgYmFzZUN0eCh7fSksICdMJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZyb21DYWNoZUlzQ2FjaGVkOiBmcm9tQ2FjaGUgPT09IGNhY2hlZCxcblx0XHRcdGZyb21DYWNoZUNhbGxDb3VudDogMCxcblx0XHRcdGZyb21TZGtJc0FycmF5OiBBcnJheS5pc0FycmF5KGZyb21TZGspLFxuXHRcdFx0b25FcnJvcixcblx0XHRcdHRvdGFsU2RrQ2FsbHM6IHNkay5nZXRTZXNzaW9uTWVzc2FnZXNDYWxscy5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0ZnJvbUNhY2hlSXNDYWNoZWQ6IHRydWUsXG5cdFx0XHRmcm9tQ2FjaGVDYWxsQ291bnQ6IDAsXG5cdFx0XHRmcm9tU2RrSXNBcnJheTogdHJ1ZSxcblx0XHRcdG9uRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdHRvdGFsU2RrQ2FsbHM6IDIsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGFBQWEsa0JBQWtCLDRCQUE0Qixn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
