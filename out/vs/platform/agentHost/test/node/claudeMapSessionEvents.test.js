import assert from "assert";
import * as sinon from "sinon";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ResponsePartKind, ToolResultContentType } from "../../common/state/sessionState.js";
import { STREAMING_TOOL_DISPLAY_INTERVAL_MS } from "../../common/streamingToolCallDisplay.js";
import { ToolCallConfirmationReason, ToolCallContributorKind } from "../../common/state/protocol/state.js";
import { ClaudeMapperState, mapSDKMessageToAgentSignals } from "../../node/claude/claudeMapSessionEvents.js";
import { CLAUDE_USER_DECLINED_MESSAGE } from "../../node/claude/claudeToolDenial.js";
import { encodeForwardedChatError, PROXY_ERROR_PREFIX } from "../../node/shared/forwardedChatError.js";
import { SubagentRegistry } from "../../node/claude/claudeSubagentRegistry.js";
import {
  makeAssistantMessage,
  makeContentBlockStartText,
  makeContentBlockStartThinking,
  makeContentBlockStartToolUse,
  makeContentBlockStop,
  makeInputJsonDelta,
  makeMessageStart,
  makeMessageStop,
  makeResultError,
  makeResultSuccess,
  makeStreamEvent,
  makeTextDelta,
  makeThinkingDelta,
  makeUserToolResultMessage
} from "./claudeMapSessionEventsTestUtils.js";
suite("claudeMapSessionEvents \u2014 direct mapper tests", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const SESSION = URI.parse("agent-session://test/abc");
  const SESSION_STR = SESSION.toString();
  const SESSION_ID = "sid-1";
  const TURN_ID = "turn-1";
  let clock;
  teardown(() => {
    clock?.restore();
    clock = void 0;
  });
  class CapturingLogService extends NullLogService {
    constructor() {
      super(...arguments);
      this.warns = [];
    }
    warn(message, ...args) {
      this.warns.push([message, ...args.map((a) => String(a))].join(" "));
    }
  }
  function r() {
    return disposables.add(new SubagentRegistry());
  }
  test("message_start emits no signals", () => {
    const signals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeMessageStart()),
      SESSION,
      TURN_ID,
      new ClaudeMapperState(),
      new NullLogService(),
      r()
    );
    assert.deepStrictEqual(signals, []);
  });
  test("error_during_execution result emits a ChatError carrying duration and _meta", () => {
    const marker = encodeForwardedChatError({ fetchError: { type: "quotaExceeded", capiError: { code: "quota_exceeded", message: "You have exceeded your monthly quota" } } });
    const signals = mapSDKMessageToAgentSignals(
      makeResultError(SESSION_ID, [`CAPI request failed: 402 Payment Required \u2014 quota ${marker}`]),
      SESSION,
      TURN_ID,
      new ClaudeMapperState(),
      new NullLogService(),
      r(),
      void 0,
      123
    );
    const errorSignal = signals.find((s) => s.kind === "action" && s.action.type === ActionType.ChatError);
    assert.ok(errorSignal && errorSignal.kind === "action" && errorSignal.action.type === ActionType.ChatError);
    assert.strictEqual(errorSignal.action.duration, 123);
    const error = errorSignal.action.error;
    const meta = error._meta;
    assert.strictEqual(meta?.chatError?.fetchError?.type, "quotaExceeded");
    assert.ok(!error.message.includes(PROXY_ERROR_PREFIX), "proxy marker should be stripped from the human-readable message");
  });
  test("successful result is_error with a proxy marker emits a ChatError carrying _meta", () => {
    const marker = encodeForwardedChatError({ fetchError: { type: "quotaExceeded", capiError: { code: "quota_exceeded" } } });
    const result = makeResultSuccess(SESSION_ID);
    const signals = mapSDKMessageToAgentSignals(
      { ...result, is_error: true, result: `quota ${marker}` },
      SESSION,
      TURN_ID,
      new ClaudeMapperState(),
      new NullLogService(),
      r()
    );
    const errorSignal = signals.find((s) => s.kind === "action" && s.action.type === ActionType.ChatError);
    assert.ok(errorSignal && errorSignal.kind === "action" && errorSignal.action.type === ActionType.ChatError);
    const meta = errorSignal.action.error._meta;
    assert.strictEqual(meta?.chatError?.fetchError?.type, "quotaExceeded");
  });
  test("text content block: start emits ChatResponsePart, deltas emit ChatDelta", () => {
    const out = [];
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    const push = (msgs) => out.push(...msgs);
    push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeMessageStart()), SESSION, TURN_ID, state, log, resolver));
    push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartText(0)), SESSION, TURN_ID, state, log, resolver));
    push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, "Hello, ")), SESSION, TURN_ID, state, log, resolver));
    push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, "world!")), SESSION, TURN_ID, state, log, resolver));
    push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStop(0)), SESSION, TURN_ID, state, log, resolver));
    assert.strictEqual(out.length, 3);
    const start = out[0];
    assert.ok(start.kind === "action" && start.action.type === ActionType.ChatResponsePart);
    assert.strictEqual(start.resource.toString(), SESSION_STR);
    assert.strictEqual(start.action.turnId, TURN_ID);
    assert.strictEqual(start.action.part.kind, ResponsePartKind.Markdown);
    const partId = start.action.part.id;
    assert.ok(partId.length > 0);
    assert.deepStrictEqual(out.slice(1), [
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatDelta,
          turnId: TURN_ID,
          partId,
          content: "Hello, "
        }
      },
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatDelta,
          turnId: TURN_ID,
          partId,
          content: "world!"
        }
      }
    ]);
  });
  test("thinking content block: start emits Reasoning part, deltas emit ChatReasoning", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const startSignals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartThinking(0)),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.strictEqual(startSignals.length, 1);
    const start = startSignals[0];
    assert.ok(start.kind === "action" && start.action.type === ActionType.ChatResponsePart);
    assert.strictEqual(start.action.part.kind, ResponsePartKind.Reasoning);
    const partId = start.action.part.id;
    const deltaSignals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeThinkingDelta(0, "pondering")),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(deltaSignals, [{
      kind: "action",
      resource: SESSION,
      action: {
        type: ActionType.ChatReasoning,
        turnId: TURN_ID,
        partId,
        content: "pondering"
      }
    }]);
  });
  test("Test 8 \u2014 content_block_start tool_use emits ChatToolCallStart with displayName", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const signals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_1", "Read")),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(signals, [{
      kind: "action",
      resource: SESSION,
      action: {
        type: ActionType.ChatToolCallStart,
        turnId: TURN_ID,
        toolCallId: "tu_1",
        toolName: "Read",
        displayName: "Read file"
      }
    }]);
    assert.deepStrictEqual(log.warns, []);
  });
  test("Test 8b \u2014 content_block_start for an mcp__client__* tool sets the Client contributor", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const CLIENT_ID = "client-abc";
    const signals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_c", "mcp__client__problems")),
      SESSION,
      TURN_ID,
      state,
      log,
      r(),
      () => CLIENT_ID
    );
    assert.deepStrictEqual(signals, [{
      kind: "action",
      resource: SESSION,
      action: {
        type: ActionType.ChatToolCallStart,
        turnId: TURN_ID,
        toolCallId: "tu_c",
        toolName: "problems",
        displayName: "problems",
        contributor: { kind: ToolCallContributorKind.Client, clientId: CLIENT_ID }
      }
    }]);
    assert.deepStrictEqual(log.warns, []);
  });
  test("Test 10b \u2014 a tool denied by the user maps to result.error.code = denied", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_d", "Bash")), SESSION, TURN_ID, state, log, resolver);
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStop(0)), SESSION, TURN_ID, state, log, resolver);
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "tu_d", CLAUDE_USER_DECLINED_MESSAGE, { isError: true }),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    const signal = signals[0];
    if (signal.kind !== "action" || signal.action.type !== ActionType.ChatToolCallComplete) {
      throw new Error(`expected a ChatToolCallComplete action, got ${signal.kind}`);
    }
    assert.strictEqual(signal.action.result.success, false);
    assert.deepStrictEqual(signal.action.result.error, { message: CLAUDE_USER_DECLINED_MESSAGE, code: "denied" });
  });
  test("Test 9 \u2014 input_json_delta emits ChatToolCallDelta scoped to the open tool_use block", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_1", "Read")), SESSION, TURN_ID, state, log, resolver);
    const signals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '{"file_pa')),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(signals, [{
      kind: "action",
      resource: SESSION,
      action: {
        type: ActionType.ChatToolCallDelta,
        turnId: TURN_ID,
        toolCallId: "tu_1",
        content: '{"file_pa'
      }
    }]);
  });
  test("file-edit input deltas emit compact rich invocation messages", () => {
    clock = sinon.useFakeTimers({ toFake: ["performance"] });
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_write", "Write")), SESSION, TURN_ID, state, log, resolver);
    const first = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '{"file_path":"/src/new.ts","content":"one\\ntwo')),
      SESSION,
      TURN_ID,
      state,
      log,
      resolver
    );
    clock.tick(STREAMING_TOOL_DISPLAY_INTERVAL_MS);
    const second = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '\\nthree\\nfour\\nfive"')),
      SESSION,
      TURN_ID,
      state,
      log,
      resolver
    );
    assert.deepStrictEqual([...first, ...second], [
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatToolCallDelta,
          turnId: TURN_ID,
          toolCallId: "tu_write",
          content: "",
          invocationMessage: { markdown: "Creating [new.ts](file:///src/new.ts) (2 lines)" }
        }
      },
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatToolCallDelta,
          turnId: TURN_ID,
          toolCallId: "tu_write",
          content: "",
          invocationMessage: { markdown: "Creating [new.ts](file:///src/new.ts) (5 lines)" }
        }
      }
    ]);
  });
  test("content_block_stop flushes the final rich file-edit message held back by the throttle", () => {
    clock = sinon.useFakeTimers({ toFake: ["performance"] });
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_write", "Write")), SESSION, TURN_ID, state, log, resolver);
    const first = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '{"file_path":"/src/new.ts","content":"one')),
      SESSION,
      TURN_ID,
      state,
      log,
      resolver
    );
    const withinInterval = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '\\ntwo"}')),
      SESSION,
      TURN_ID,
      state,
      log,
      resolver
    );
    const stopped = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStop(0)),
      SESSION,
      TURN_ID,
      state,
      log,
      resolver
    );
    assert.deepStrictEqual({
      first: first.map((signal) => signal.kind === "action" ? signal.action : void 0),
      withinInterval,
      stopped: stopped.map((signal) => signal.kind === "action" ? signal.action : void 0)
    }, {
      first: [{
        type: ActionType.ChatToolCallDelta,
        turnId: TURN_ID,
        toolCallId: "tu_write",
        content: "",
        invocationMessage: { markdown: "Creating [new.ts](file:///src/new.ts) (1 line)" }
      }],
      withinInterval: [],
      stopped: [{
        type: ActionType.ChatToolCallDelta,
        turnId: TURN_ID,
        toolCallId: "tu_write",
        content: "",
        invocationMessage: { markdown: "Creating [new.ts](file:///src/new.ts) (2 lines)" }
      }, {
        type: ActionType.ChatToolCallReady,
        turnId: TURN_ID,
        toolCallId: "tu_write",
        invocationMessage: { markdown: "Editing [new.ts](file:///src/new.ts)" },
        toolInput: '{\n  "file_path": "/src/new.ts",\n  "content": "one\\ntwo"\n}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      }]
    });
  });
  test("client tools with Claude built-in names preserve client semantics throughout the lifecycle", () => {
    const state = new ClaudeMapperState();
    const resolver = r();
    const start = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_client_write", "mcp__client__Write")),
      SESSION,
      TURN_ID,
      state,
      new NullLogService(),
      resolver,
      () => "client-1"
    );
    const delta = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '{"value":"client input"}')),
      SESSION,
      TURN_ID,
      state,
      new NullLogService(),
      resolver
    );
    const ready = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStop(0)),
      SESSION,
      TURN_ID,
      state,
      new NullLogService(),
      resolver
    );
    const complete = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "tu_client_write", "done"),
      SESSION,
      "turn-2-irrelevant",
      state,
      new NullLogService(),
      resolver
    );
    assert.deepStrictEqual([...start, ...delta, ...ready, ...complete], [
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: TURN_ID,
          toolCallId: "tu_client_write",
          toolName: "Write",
          displayName: "Write",
          contributor: { kind: ToolCallContributorKind.Client, clientId: "client-1" }
        }
      },
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatToolCallDelta,
          turnId: TURN_ID,
          toolCallId: "tu_client_write",
          content: '{"value":"client input"}'
        }
      },
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: TURN_ID,
          toolCallId: "tu_client_write",
          invocationMessage: "Write",
          toolInput: '{\n  "value": "client input"\n}',
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      },
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: TURN_ID,
          toolCallId: "tu_client_write",
          result: {
            success: true,
            pastTenseMessage: "Write",
            content: [{ type: ToolResultContentType.Text, text: "done" }]
          }
        }
      }
    ]);
  });
  test("Test 9.5 \u2014 content_block_stop emits ChatToolCallReady so auto-allowed tools leave Streaming", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_b", "Bash")), SESSION, TURN_ID, state, log, resolver);
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '{"command":"git status"}')), SESSION, TURN_ID, state, log, resolver);
    const signals = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStop(0)), SESSION, TURN_ID, state, log, resolver);
    assert.deepStrictEqual(signals, [{
      kind: "action",
      resource: SESSION,
      action: {
        type: ActionType.ChatToolCallReady,
        turnId: TURN_ID,
        toolCallId: "tu_b",
        invocationMessage: { markdown: "Running `git status`" },
        toolInput: "git status",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: { toolKind: "terminal" }
      }
    }]);
    assert.deepStrictEqual(log.warns, []);
  });
  test("Test 10 \u2014 synthetic user tool_result emits ChatToolCallComplete with the originating turnId", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_1", "Read")), SESSION, TURN_ID, state, log, resolver);
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStop(0)), SESSION, TURN_ID, state, log, resolver);
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "tu_1", "file contents"),
      SESSION,
      "turn-2-irrelevant",
      state,
      log,
      r()
    );
    assert.deepStrictEqual(signals, [{
      kind: "action",
      resource: SESSION,
      action: {
        type: ActionType.ChatToolCallComplete,
        turnId: TURN_ID,
        toolCallId: "tu_1",
        result: {
          success: true,
          pastTenseMessage: "Read file",
          content: [{ type: ToolResultContentType.Text, text: "file contents" }]
        }
      }
    }]);
    assert.deepStrictEqual(log.warns, []);
  });
  test("Test 11 \u2014 tool_result for unknown tool_use_id emits no signal and warns", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "unknown-id", "orphan content"),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(signals, []);
    assert.strictEqual(log.warns.length, 1);
    assert.ok(log.warns[0].includes("tool_result for unknown tool_use_id unknown-id"));
  });
  test("tool_result with is_error: true reports success=false", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_err", "Bash")), SESSION, TURN_ID, state, log, resolver);
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "tu_err", "permission denied", { isError: true }),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.strictEqual(signals.length, 1);
    const complete = signals[0];
    assert.ok(complete.kind === "action" && complete.action.type === ActionType.ChatToolCallComplete);
    assert.strictEqual(complete.action.result.success, false);
    assert.strictEqual(complete.action.result.error?.code, void 0);
  });
  test("tool_result content as TextBlock array unwraps to ToolResultTextContent[]", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_2", "Read")), SESSION, TURN_ID, state, log, resolver);
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "tu_2", [
        { type: "text", text: "first" },
        { type: "text", text: "second" }
      ]),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    const complete = signals[0];
    assert.ok(complete.kind === "action" && complete.action.type === ActionType.ChatToolCallComplete);
    assert.deepStrictEqual(complete.action.result.content, [
      { type: ToolResultContentType.Text, text: "first" },
      { type: ToolResultContentType.Text, text: "second" }
    ]);
  });
  test("Phase 8 \u2014 cached file edit is appended to ChatToolCallComplete.result.content", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_edit", "Write")), SESSION, TURN_ID, state, log, resolver);
    const fileEdit = {
      type: ToolResultContentType.FileEdit,
      before: { uri: "file:///tmp/a", content: { uri: "session-db://abc/before" } },
      after: { uri: "file:///tmp/a", content: { uri: "session-db://abc/after" } },
      diff: { added: 3, removed: 1 }
    };
    state.cacheFileEdit("tu_edit", fileEdit);
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "tu_edit", "wrote file"),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    const complete = signals[0];
    assert.ok(complete.kind === "action" && complete.action.type === ActionType.ChatToolCallComplete);
    assert.deepStrictEqual(complete.action.result.content, [
      { type: ToolResultContentType.Text, text: "wrote file" },
      fileEdit
    ]);
  });
  test("Phase 8 \u2014 no cached edit leaves content text-only (no regression)", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_read", "Read")), SESSION, TURN_ID, state, log, resolver);
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "tu_read", "file contents"),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    const complete = signals[0];
    assert.ok(complete.kind === "action" && complete.action.type === ActionType.ChatToolCallComplete);
    assert.deepStrictEqual(complete.action.result.content, [
      { type: ToolResultContentType.Text, text: "file contents" }
    ]);
  });
  test("Phase 8 \u2014 takeFileEdit returns undefined on cache miss and consumes on hit", () => {
    const state = new ClaudeMapperState();
    assert.strictEqual(state.takeFileEdit("absent"), void 0);
    const fileEdit = {
      type: ToolResultContentType.FileEdit,
      before: { uri: "file:///tmp/x", content: { uri: "session-db://x/before" } },
      after: { uri: "file:///tmp/x", content: { uri: "session-db://x/after" } },
      diff: void 0
    };
    state.cacheFileEdit("tu_x", fileEdit);
    assert.strictEqual(state.takeFileEdit("tu_x"), fileEdit);
    assert.strictEqual(state.takeFileEdit("tu_x"), void 0);
  });
  test("canonical assistant envelope drops tool_use blocks silently (partial stream owns ChatToolCallStart)", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const signals = mapSDKMessageToAgentSignals(
      makeAssistantMessage(SESSION_ID, [
        { type: "text", text: "final", citations: null },
        { type: "tool_use", id: "tu_a", name: "Bash", input: {} }
      ]),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(signals, []);
    assert.deepStrictEqual(log.warns, []);
  });
  test("canonical assistant envelope without tool_use emits nothing and does not warn", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const signals = mapSDKMessageToAgentSignals(
      makeAssistantMessage(SESSION_ID, [{ type: "text", text: "final answer", citations: null }]),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(signals, []);
    assert.deepStrictEqual(log.warns, []);
  });
  test("result success emits ChatUsage (with model); ChatTurnComplete now lives on the pipeline, not the mapper", () => {
    const result = makeResultSuccess(SESSION_ID);
    result.usage.input_tokens = 12;
    result.usage.output_tokens = 34;
    result.usage.cache_read_input_tokens = 5;
    result.modelUsage = {
      "claude-test": {
        inputTokens: 12,
        outputTokens: 34,
        cacheReadInputTokens: 5,
        cacheCreationInputTokens: 0,
        webSearchRequests: 0,
        costUSD: 0,
        contextWindow: 2e5,
        maxOutputTokens: 8192
      }
    };
    const signals = mapSDKMessageToAgentSignals(result, SESSION, TURN_ID, new ClaudeMapperState(), new NullLogService(), r());
    assert.deepStrictEqual(signals, [
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatUsage,
          turnId: TURN_ID,
          usage: {
            inputTokens: 12,
            outputTokens: 34,
            cacheReadTokens: 5,
            model: "claude-test"
          }
        }
      }
    ]);
  });
  test("result success does not derive credits from total_cost_usd", () => {
    const result = makeResultSuccess(SESSION_ID);
    result.total_cost_usd = 0.1234;
    const signals = mapSDKMessageToAgentSignals(result, SESSION, TURN_ID, new ClaudeMapperState(), new NullLogService(), r());
    assert.strictEqual(signals.length, 1);
    const usage = signals[0];
    assert.ok(usage.kind === "action" && usage.action.type === ActionType.ChatUsage);
    assert.strictEqual(usage.action.usage._meta, void 0);
  });
  test("result success without modelUsage omits the model field on ChatUsage", () => {
    const result = makeResultSuccess(SESSION_ID);
    result.modelUsage = {};
    const signals = mapSDKMessageToAgentSignals(result, SESSION, TURN_ID, new ClaudeMapperState(), new NullLogService(), r());
    assert.strictEqual(signals.length, 1);
    const usage = signals[0];
    assert.ok(usage.kind === "action" && usage.action.type === ActionType.ChatUsage);
    assert.strictEqual(usage.action.usage.model, void 0);
  });
  test("result drains pending tool_use entries that never received a tool_result and warns once per orphan", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const TOOL_USE_ID = "toolu_orphan_1";
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, TOOL_USE_ID, "Read")),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    const resultSignals = mapSDKMessageToAgentSignals(
      makeResultSuccess(SESSION_ID),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.strictEqual(resultSignals.length, 1);
    assert.strictEqual(log.warns.length, 1);
    assert.ok(log.warns[0].includes(TOOL_USE_ID), `expected warn to mention orphan id, got: ${log.warns[0]}`);
    assert.ok(log.warns[0].includes("Read"), `expected warn to mention tool name, got: ${log.warns[0]}`);
    const lateSignals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, TOOL_USE_ID, "late content"),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(lateSignals, []);
    assert.strictEqual(log.warns.length, 2);
    assert.ok(log.warns[1].includes(`tool_result for unknown tool_use_id ${TOOL_USE_ID}`));
  });
  test("message_stop and unknown stream events emit nothing", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const stop = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeMessageStop()),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(stop, []);
  });
  test("multi-block ordering: text @0 then thinking @1 keep distinct part ids and route deltas correctly", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    const text0 = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartText(0)), SESSION, TURN_ID, state, log, resolver);
    const think1 = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartThinking(1)), SESSION, TURN_ID, state, log, resolver);
    const text0Start = text0[0];
    const think1Start = think1[0];
    assert.ok(text0Start.kind === "action" && text0Start.action.type === ActionType.ChatResponsePart);
    assert.ok(think1Start.kind === "action" && think1Start.action.type === ActionType.ChatResponsePart);
    assert.strictEqual(text0Start.action.part.kind, ResponsePartKind.Markdown);
    assert.strictEqual(think1Start.action.part.kind, ResponsePartKind.Reasoning);
    const textPartId = text0Start.action.part.id;
    const thinkPartId = think1Start.action.part.id;
    assert.notStrictEqual(textPartId, thinkPartId);
    const dText = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, "A")), SESSION, TURN_ID, state, log, resolver);
    const dThink = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeThinkingDelta(1, "B")), SESSION, TURN_ID, state, log, resolver);
    assert.ok(dText[0].kind === "action" && dText[0].action.type === ActionType.ChatDelta);
    assert.strictEqual(dText[0].action.partId, textPartId);
    assert.ok(dThink[0].kind === "action" && dThink[0].action.type === ActionType.ChatReasoning);
    assert.strictEqual(dThink[0].action.partId, thinkPartId);
  });
  test("two SDK messages within one turn at the same content-block index produce distinct part ids", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeMessageStart("msg_a")), SESSION, TURN_ID, state, log, resolver);
    const thinkStart = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartThinking(0)), SESSION, TURN_ID, state, log, resolver);
    const thinkDelta = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeThinkingDelta(0, "plan")), SESSION, TURN_ID, state, log, resolver);
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeMessageStart("msg_b")), SESSION, TURN_ID, state, log, resolver);
    const textStart = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartText(0)), SESSION, TURN_ID, state, log, resolver);
    const textDelta = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, "done")), SESSION, TURN_ID, state, log, resolver);
    const thinkStartSignal = thinkStart[0];
    const textStartSignal = textStart[0];
    assert.ok(thinkStartSignal.kind === "action" && thinkStartSignal.action.type === ActionType.ChatResponsePart);
    assert.ok(textStartSignal.kind === "action" && textStartSignal.action.type === ActionType.ChatResponsePart);
    assert.strictEqual(thinkStartSignal.action.part.kind, ResponsePartKind.Reasoning);
    assert.strictEqual(textStartSignal.action.part.kind, ResponsePartKind.Markdown);
    const thinkPartId = thinkStartSignal.action.part.id;
    const textPartId = textStartSignal.action.part.id;
    assert.notStrictEqual(thinkPartId, textPartId, "text@0 in second message must not collide with thinking@0 in first message");
    const thinkDeltaSignal = thinkDelta[0];
    const textDeltaSignal = textDelta[0];
    assert.ok(thinkDeltaSignal.kind === "action" && thinkDeltaSignal.action.type === ActionType.ChatReasoning);
    assert.strictEqual(thinkDeltaSignal.action.partId, thinkPartId);
    assert.ok(textDeltaSignal.kind === "action" && textDeltaSignal.action.type === ActionType.ChatDelta);
    assert.strictEqual(textDeltaSignal.action.partId, textPartId);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY2xhdWRlTWFwU2Vzc2lvbkV2ZW50cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgdHlwZSB7IEFnZW50U2lnbmFsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IFJlc3BvbnNlUGFydEtpbmQsIFRvb2xSZXN1bHRDb250ZW50VHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgU1RSRUFNSU5HX1RPT0xfRElTUExBWV9JTlRFUlZBTF9NUyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdHJlYW1pbmdUb29sQ2FsbERpc3BsYXkuanMnO1xuaW1wb3J0IHsgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IENsYXVkZU1hcHBlclN0YXRlLCBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVNYXBTZXNzaW9uRXZlbnRzLmpzJztcbmltcG9ydCB7IENMQVVERV9VU0VSX0RFQ0xJTkVEX01FU1NBR0UgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVUb29sRGVuaWFsLmpzJztcbmltcG9ydCB7IGVuY29kZUZvcndhcmRlZENoYXRFcnJvciwgUFJPWFlfRVJST1JfUFJFRklYIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvZm9yd2FyZGVkQ2hhdEVycm9yLmpzJztcbmltcG9ydCB7IFN1YmFnZW50UmVnaXN0cnkgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVTdWJhZ2VudFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7XG5cdG1ha2VBc3Npc3RhbnRNZXNzYWdlLFxuXHRtYWtlQ29udGVudEJsb2NrU3RhcnRUZXh0LFxuXHRtYWtlQ29udGVudEJsb2NrU3RhcnRUaGlua2luZyxcblx0bWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSxcblx0bWFrZUNvbnRlbnRCbG9ja1N0b3AsXG5cdG1ha2VJbnB1dEpzb25EZWx0YSxcblx0bWFrZU1lc3NhZ2VTdGFydCxcblx0bWFrZU1lc3NhZ2VTdG9wLFxuXHRtYWtlUmVzdWx0RXJyb3IsXG5cdG1ha2VSZXN1bHRTdWNjZXNzLFxuXHRtYWtlU3RyZWFtRXZlbnQsXG5cdG1ha2VUZXh0RGVsdGEsXG5cdG1ha2VUaGlua2luZ0RlbHRhLFxuXHRtYWtlVXNlclRvb2xSZXN1bHRNZXNzYWdlLFxufSBmcm9tICcuL2NsYXVkZU1hcFNlc3Npb25FdmVudHNUZXN0VXRpbHMuanMnO1xuXG4vKipcbiAqIERpcmVjdCB1bml0IHRlc3RzIGZvciB7QGxpbmsgbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzfS5cbiAqXG4gKiBUaGUgbWFwcGVyIHRha2VzIGEgcGVyLXNlc3Npb24ge0BsaW5rIENsYXVkZU1hcHBlclN0YXRlfSBhbmQgaXNcbiAqIGV4ZXJjaXNlZCBoZXJlIGFzIGEgc3RhbmQtYWxvbmUgZnVuY3Rpb24uIFRoZSBpbnRlZ3JhdGVkXG4gKiBgY2xhdWRlQWdlbnQudGVzdC50c2Agc3VpdGUgc3RpbGwgZHJpdmVzIHRoZSBtYXBwZXIgZW5kLXRvLWVuZFxuICogYWxvbmdzaWRlIHRoZSBTREsgZW52ZWxvcGUgcGx1bWJpbmcuXG4gKi9cbnN1aXRlKCdjbGF1ZGVNYXBTZXNzaW9uRXZlbnRzIFx1MjAxNCBkaXJlY3QgbWFwcGVyIHRlc3RzJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgU0VTU0lPTiA9IFVSSS5wYXJzZSgnYWdlbnQtc2Vzc2lvbjovL3Rlc3QvYWJjJyk7XG5cdGNvbnN0IFNFU1NJT05fU1RSID0gU0VTU0lPTi50b1N0cmluZygpO1xuXHRjb25zdCBTRVNTSU9OX0lEID0gJ3NpZC0xJztcblx0Y29uc3QgVFVSTl9JRCA9ICd0dXJuLTEnO1xuXHRsZXQgY2xvY2s6IHNpbm9uLlNpbm9uRmFrZVRpbWVycyB8IHVuZGVmaW5lZDtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0Y2xvY2s/LnJlc3RvcmUoKTtcblx0XHRjbG9jayA9IHVuZGVmaW5lZDtcblx0fSk7XG5cblx0LyoqXG5cdCAqIENhcHR1cmVzIGB3YXJuYCBjYWxscyBzbyBkZWZlbnNlLWluLWRlcHRoIHRlc3RzIGNhbiBhc3NlcnQgdGhlXG5cdCAqIG1hcHBlciBsb2dnZWQgdGhlIGRyb3BwZWQgZGlhZ25vc3RpYy5cblx0ICovXG5cdGNsYXNzIENhcHR1cmluZ0xvZ1NlcnZpY2UgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7XG5cdFx0cmVhZG9ubHkgd2FybnM6IHN0cmluZ1tdID0gW107XG5cdFx0b3ZlcnJpZGUgd2FybihtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdFx0dGhpcy53YXJucy5wdXNoKFttZXNzYWdlLCAuLi5hcmdzLm1hcChhID0+IFN0cmluZyhhKSldLmpvaW4oJyAnKSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZyZXNoIHJlYWwge0BsaW5rIFN1YmFnZW50UmVnaXN0cnl9IHNvIHRoZSBwZXItdGVzdCByZWdpc3RyeSBjYW5cblx0ICogcmVjb3JkIHN1YmFnZW50IHN0YXRlIHdyaXRlcyB0aGUgbWFwcGVyIG1ha2VzIChQaGFzZSAxMjogc3Bhd25pbmdcblx0ICogZW50cmllcywgaW5uZXItdG9vbFx1MjE5MnBhcmVudCBlZGdlcywgZXRjKS4gVGVzdHMgdGhhdCBkb24ndCB0b3VjaFxuXHQgKiBzdWJhZ2VudCBwYXRocyBzaW1wbHkgcGFzcyBgcigpYCB0aHJvdWdoIHRvIHNhdGlzZnkgdGhlIG1hcHBlclxuXHQgKiBzaWduYXR1cmUuXG5cdCAqL1xuXHRmdW5jdGlvbiByKCk6IFN1YmFnZW50UmVnaXN0cnkge1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IFN1YmFnZW50UmVnaXN0cnkoKSk7XG5cdH1cblxuXHR0ZXN0KCdtZXNzYWdlX3N0YXJ0IGVtaXRzIG5vIHNpZ25hbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlTWVzc2FnZVN0YXJ0KCkpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0cigpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZ25hbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZXJyb3JfZHVyaW5nX2V4ZWN1dGlvbiByZXN1bHQgZW1pdHMgYSBDaGF0RXJyb3IgY2FycnlpbmcgZHVyYXRpb24gYW5kIF9tZXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcmtlciA9IGVuY29kZUZvcndhcmRlZENoYXRFcnJvcih7IGZldGNoRXJyb3I6IHsgdHlwZTogJ3F1b3RhRXhjZWVkZWQnLCBjYXBpRXJyb3I6IHsgY29kZTogJ3F1b3RhX2V4Y2VlZGVkJywgbWVzc2FnZTogJ1lvdSBoYXZlIGV4Y2VlZGVkIHlvdXIgbW9udGhseSBxdW90YScgfSB9IH0pO1xuXHRcdGNvbnN0IHNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlUmVzdWx0RXJyb3IoU0VTU0lPTl9JRCwgW2BDQVBJIHJlcXVlc3QgZmFpbGVkOiA0MDIgUGF5bWVudCBSZXF1aXJlZCBcXHUyMDE0IHF1b3RhICR7bWFya2VyfWBdKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0bmV3IENsYXVkZU1hcHBlclN0YXRlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdHIoKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdDEyMyxcblx0XHQpO1xuXG5cdFx0Y29uc3QgZXJyb3JTaWduYWwgPSBzaWduYWxzLmZpbmQocyA9PiBzLmtpbmQgPT09ICdhY3Rpb24nICYmIHMuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKTtcblx0XHRhc3NlcnQub2soZXJyb3JTaWduYWwgJiYgZXJyb3JTaWduYWwua2luZCA9PT0gJ2FjdGlvbicgJiYgZXJyb3JTaWduYWwuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JTaWduYWwuYWN0aW9uLmR1cmF0aW9uLCAxMjMpO1xuXHRcdGNvbnN0IGVycm9yID0gZXJyb3JTaWduYWwuYWN0aW9uLmVycm9yO1xuXHRcdGNvbnN0IG1ldGEgPSBlcnJvci5fbWV0YSBhcyB7IGNoYXRFcnJvcj86IHsgZmV0Y2hFcnJvcj86IHsgdHlwZT86IHN0cmluZyB9IH0gfSB8IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWV0YT8uY2hhdEVycm9yPy5mZXRjaEVycm9yPy50eXBlLCAncXVvdGFFeGNlZWRlZCcpO1xuXHRcdGFzc2VydC5vayghZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhQUk9YWV9FUlJPUl9QUkVGSVgpLCAncHJveHkgbWFya2VyIHNob3VsZCBiZSBzdHJpcHBlZCBmcm9tIHRoZSBodW1hbi1yZWFkYWJsZSBtZXNzYWdlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1Y2Nlc3NmdWwgcmVzdWx0IGlzX2Vycm9yIHdpdGggYSBwcm94eSBtYXJrZXIgZW1pdHMgYSBDaGF0RXJyb3IgY2FycnlpbmcgX21ldGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFya2VyID0gZW5jb2RlRm9yd2FyZGVkQ2hhdEVycm9yKHsgZmV0Y2hFcnJvcjogeyB0eXBlOiAncXVvdGFFeGNlZWRlZCcsIGNhcGlFcnJvcjogeyBjb2RlOiAncXVvdGFfZXhjZWVkZWQnIH0gfSB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBtYWtlUmVzdWx0U3VjY2VzcyhTRVNTSU9OX0lEKTtcblx0XHRjb25zdCBzaWduYWxzID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0eyAuLi5yZXN1bHQsIGlzX2Vycm9yOiB0cnVlLCByZXN1bHQ6IGBxdW90YSAke21hcmtlcn1gIH0sXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRyKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IGVycm9yU2lnbmFsID0gc2lnbmFscy5maW5kKHMgPT4gcy5raW5kID09PSAnYWN0aW9uJyAmJiBzLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRFcnJvcik7XG5cdFx0YXNzZXJ0Lm9rKGVycm9yU2lnbmFsICYmIGVycm9yU2lnbmFsLmtpbmQgPT09ICdhY3Rpb24nICYmIGVycm9yU2lnbmFsLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRFcnJvcik7XG5cdFx0Y29uc3QgbWV0YSA9IGVycm9yU2lnbmFsLmFjdGlvbi5lcnJvci5fbWV0YSBhcyB7IGNoYXRFcnJvcj86IHsgZmV0Y2hFcnJvcj86IHsgdHlwZT86IHN0cmluZyB9IH0gfSB8IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWV0YT8uY2hhdEVycm9yPy5mZXRjaEVycm9yPy50eXBlLCAncXVvdGFFeGNlZWRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXh0IGNvbnRlbnQgYmxvY2s6IHN0YXJ0IGVtaXRzIENoYXRSZXNwb25zZVBhcnQsIGRlbHRhcyBlbWl0IENoYXREZWx0YScsICgpID0+IHtcblx0XHRjb25zdCBvdXQ6IEFnZW50U2lnbmFsW10gPSBbXTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gcigpO1xuXHRcdGNvbnN0IHB1c2ggPSAobXNnczogQWdlbnRTaWduYWxbXSkgPT4gb3V0LnB1c2goLi4ubXNncyk7XG5cblx0XHRwdXNoKG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZU1lc3NhZ2VTdGFydCgpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpKTtcblx0XHRwdXNoKG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VGV4dCgwKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKSk7XG5cdFx0cHVzaChtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VUZXh0RGVsdGEoMCwgJ0hlbGxvLCAnKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKSk7XG5cdFx0cHVzaChtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VUZXh0RGVsdGEoMCwgJ3dvcmxkIScpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpKTtcblx0XHRwdXNoKG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0b3AoMCkpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcikpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dC5sZW5ndGgsIDMpO1xuXHRcdGNvbnN0IHN0YXJ0ID0gb3V0WzBdO1xuXHRcdGFzc2VydC5vayhzdGFydC5raW5kID09PSAnYWN0aW9uJyAmJiBzdGFydC5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQucmVzb3VyY2UudG9TdHJpbmcoKSwgU0VTU0lPTl9TVFIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydC5hY3Rpb24udHVybklkLCBUVVJOX0lEKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQuYWN0aW9uLnBhcnQua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bik7XG5cdFx0Y29uc3QgcGFydElkID0gc3RhcnQuYWN0aW9uLnBhcnQuaWQ7XG5cdFx0YXNzZXJ0Lm9rKHBhcnRJZC5sZW5ndGggPiAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3V0LnNsaWNlKDEpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRyZXNvdXJjZTogU0VTU0lPTixcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0RGVsdGEsXG5cdFx0XHRcdFx0dHVybklkOiBUVVJOX0lELFxuXHRcdFx0XHRcdHBhcnRJZCxcblx0XHRcdFx0XHRjb250ZW50OiAnSGVsbG8sICcsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0cmVzb3VyY2U6IFNFU1NJT04sXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdERlbHRhLFxuXHRcdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0XHRwYXJ0SWQsXG5cdFx0XHRcdFx0Y29udGVudDogJ3dvcmxkIScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGlua2luZyBjb250ZW50IGJsb2NrOiBzdGFydCBlbWl0cyBSZWFzb25pbmcgcGFydCwgZGVsdGFzIGVtaXQgQ2hhdFJlYXNvbmluZycsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXG5cblx0XHRjb25zdCBzdGFydFNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VGhpbmtpbmcoMCkpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydFNpZ25hbHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBzdGFydCA9IHN0YXJ0U2lnbmFsc1swXTtcblx0XHRhc3NlcnQub2soc3RhcnQua2luZCA9PT0gJ2FjdGlvbicgJiYgc3RhcnQuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0LmFjdGlvbi5wYXJ0LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nKTtcblx0XHRjb25zdCBwYXJ0SWQgPSBzdGFydC5hY3Rpb24ucGFydC5pZDtcblxuXHRcdGNvbnN0IGRlbHRhU2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlVGhpbmtpbmdEZWx0YSgwLCAncG9uZGVyaW5nJykpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVsdGFTaWduYWxzLCBbe1xuXHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRyZXNvdXJjZTogU0VTU0lPTixcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZWFzb25pbmcsXG5cdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0cGFydElkLFxuXHRcdFx0XHRjb250ZW50OiAncG9uZGVyaW5nJyxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHQvLyAjcmVnaW9uIFBoYXNlIDcgXHUwMEE3My4zIHRvb2xfdXNlIC8gdG9vbF9yZXN1bHQgXHUyMDE0IFRlc3RzIDgvOS8xMC8xMVxuXG5cdHRlc3QoJ1Rlc3QgOCBcdTIwMTQgY29udGVudF9ibG9ja19zdGFydCB0b29sX3VzZSBlbWl0cyBDaGF0VG9vbENhbGxTdGFydCB3aXRoIGRpc3BsYXlOYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBDYXB0dXJpbmdMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblxuXG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsICd0dV8xJywgJ1JlYWQnKSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cigpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZ25hbHMsIFt7XG5cdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdHJlc291cmNlOiBTRVNTSU9OLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3R1XzEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ1JlYWQnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1JlYWQgZmlsZScsXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy53YXJucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IDhiIFx1MjAxNCBjb250ZW50X2Jsb2NrX3N0YXJ0IGZvciBhbiBtY3BfX2NsaWVudF9fKiB0b29sIHNldHMgdGhlIENsaWVudCBjb250cmlidXRvcicsICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uOiB0aGUgbWFwcGVyIHVzZWQgdG8gZW1pdCBhbiBpbnZhbGlkIGB0b29sQ2xpZW50SWRgIGZpZWxkXG5cdFx0Ly8gb24gdGhlIENoYXRUb29sQ2FsbFN0YXJ0IGFjdGlvbi4gQmVjYXVzZSB0aGUgc3ByZWFkIGJ5cGFzc2VkXG5cdFx0Ly8gVHlwZVNjcmlwdCdzIGV4Y2Vzcy1wcm9wZXJ0eSBjaGVjayBhbmQgdGhlIHJlZHVjZXIgcmVhZHNcblx0XHQvLyBgYWN0aW9uLmNvbnRyaWJ1dG9yYCwgdGhlIGNvbnRyaWJ1dG9yIGNhbWUgdGhyb3VnaCBhcyBgdW5kZWZpbmVkYCxcblx0XHQvLyBzbyB0aGUgd29ya2JlbmNoIHJvdXRlZCBjbGllbnQgdG9vbHMgdG8gdGhlIHNlcnZlci10b29sIHBhdGggYW5kXG5cdFx0Ly8gbmV2ZXIgZXhlY3V0ZWQgdGhlbSBcdTIwMTQgdGhlIGluLXByb2Nlc3MgTUNQIGhhbmRsZXIgaHVuZyBmb3JldmVyLlxuXHRcdGNvbnN0IGxvZyA9IG5ldyBDYXB0dXJpbmdMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblx0XHRjb25zdCBDTElFTlRfSUQgPSAnY2xpZW50LWFiYyc7XG5cblx0XHRjb25zdCBzaWduYWxzID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMCwgJ3R1X2MnLCAnbWNwX19jbGllbnRfX3Byb2JsZW1zJykpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHRcdCgpID0+IENMSUVOVF9JRCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWduYWxzLCBbe1xuXHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRyZXNvdXJjZTogU0VTU0lPTixcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6IFRVUk5fSUQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0dV9jJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdwcm9ibGVtcycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAncHJvYmxlbXMnLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiBDTElFTlRfSUQgfSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLndhcm5zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3QgMTBiIFx1MjAxNCBhIHRvb2wgZGVuaWVkIGJ5IHRoZSB1c2VyIG1hcHMgdG8gcmVzdWx0LmVycm9yLmNvZGUgPSBkZW5pZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblx0XHRjb25zdCByZXNvbHZlciA9IHIoKTtcblxuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgwLCAndHVfZCcsICdCYXNoJykpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RvcCgwKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKTtcblxuXHRcdGNvbnN0IHNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlVXNlclRvb2xSZXN1bHRNZXNzYWdlKFNFU1NJT05fSUQsICd0dV9kJywgQ0xBVURFX1VTRVJfREVDTElORURfTUVTU0FHRSwgeyBpc0Vycm9yOiB0cnVlIH0pLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3Qgc2lnbmFsID0gc2lnbmFsc1swXTtcblx0XHRpZiAoc2lnbmFsLmtpbmQgIT09ICdhY3Rpb24nIHx8IHNpZ25hbC5hY3Rpb24udHlwZSAhPT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBleHBlY3RlZCBhIENoYXRUb29sQ2FsbENvbXBsZXRlIGFjdGlvbiwgZ290ICR7c2lnbmFsLmtpbmR9YCk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaWduYWwuYWN0aW9uLnJlc3VsdC5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWduYWwuYWN0aW9uLnJlc3VsdC5lcnJvciwgeyBtZXNzYWdlOiBDTEFVREVfVVNFUl9ERUNMSU5FRF9NRVNTQUdFLCBjb2RlOiAnZGVuaWVkJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnVGVzdCA5IFx1MjAxNCBpbnB1dF9qc29uX2RlbHRhIGVtaXRzIENoYXRUb29sQ2FsbERlbHRhIHNjb3BlZCB0byB0aGUgb3BlbiB0b29sX3VzZSBibG9jaycsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gcigpO1xuXG5cdFx0Ly8gT3BlbiB0aGUgYmxvY2sgZmlyc3Qgc28gdGhlIHBlci1tZXNzYWdlIG1hcCBrbm93cyBhYm91dCBpbmRleCAwLlxuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgwLCAndHVfMScsICdSZWFkJykpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cblx0XHRjb25zdCBzaWduYWxzID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VJbnB1dEpzb25EZWx0YSgwLCAne1wiZmlsZV9wYScpKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRsb2csXG5cdFx0XHRyKCksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lnbmFscywgW3tcblx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0cmVzb3VyY2U6IFNFU1NJT04sXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSxcblx0XHRcdFx0dHVybklkOiBUVVJOX0lELFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndHVfMScsXG5cdFx0XHRcdGNvbnRlbnQ6ICd7XCJmaWxlX3BhJyxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlLWVkaXQgaW5wdXQgZGVsdGFzIGVtaXQgY29tcGFjdCByaWNoIGludm9jYXRpb24gbWVzc2FnZXMnLCAoKSA9PiB7XG5cdFx0Y2xvY2sgPSBzaW5vbi51c2VGYWtlVGltZXJzKHsgdG9GYWtlOiBbJ3BlcmZvcm1hbmNlJ10gfSk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblx0XHRjb25zdCByZXNvbHZlciA9IHIoKTtcblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMCwgJ3R1X3dyaXRlJywgJ1dyaXRlJykpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cblx0XHRjb25zdCBmaXJzdCA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlSW5wdXRKc29uRGVsdGEoMCwgJ3tcImZpbGVfcGF0aFwiOlwiL3NyYy9uZXcudHNcIixcImNvbnRlbnRcIjpcIm9uZVxcXFxudHdvJykpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHJlc29sdmVyLFxuXHRcdCk7XG5cdFx0Y2xvY2sudGljayhTVFJFQU1JTkdfVE9PTF9ESVNQTEFZX0lOVEVSVkFMX01TKTtcblx0XHRjb25zdCBzZWNvbmQgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUlucHV0SnNvbkRlbHRhKDAsICdcXFxcbnRocmVlXFxcXG5mb3VyXFxcXG5maXZlXCInKSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cmVzb2x2ZXIsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmZpcnN0LCAuLi5zZWNvbmRdLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRyZXNvdXJjZTogU0VTU0lPTixcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSxcblx0XHRcdFx0XHR0dXJuSWQ6IFRVUk5fSUQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3R1X3dyaXRlJyxcblx0XHRcdFx0XHRjb250ZW50OiAnJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogeyBtYXJrZG93bjogJ0NyZWF0aW5nIFtuZXcudHNdKGZpbGU6Ly8vc3JjL25ldy50cykgKDIgbGluZXMpJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRcdHJlc291cmNlOiBTRVNTSU9OLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLFxuXHRcdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndHVfd3JpdGUnLFxuXHRcdFx0XHRcdGNvbnRlbnQ6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB7IG1hcmtkb3duOiAnQ3JlYXRpbmcgW25ldy50c10oZmlsZTovLy9zcmMvbmV3LnRzKSAoNSBsaW5lcyknIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250ZW50X2Jsb2NrX3N0b3AgZmx1c2hlcyB0aGUgZmluYWwgcmljaCBmaWxlLWVkaXQgbWVzc2FnZSBoZWxkIGJhY2sgYnkgdGhlIHRocm90dGxlJywgKCkgPT4ge1xuXHRcdGNsb2NrID0gc2lub24udXNlRmFrZVRpbWVycyh7IHRvRmFrZTogWydwZXJmb3JtYW5jZSddIH0pO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cdFx0Y29uc3QgcmVzb2x2ZXIgPSByKCk7XG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsICd0dV93cml0ZScsICdXcml0ZScpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUlucHV0SnNvbkRlbHRhKDAsICd7XCJmaWxlX3BhdGhcIjpcIi9zcmMvbmV3LnRzXCIsXCJjb250ZW50XCI6XCJvbmUnKSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cmVzb2x2ZXIsXG5cdFx0KTtcblx0XHRjb25zdCB3aXRoaW5JbnRlcnZhbCA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlSW5wdXRKc29uRGVsdGEoMCwgJ1xcXFxudHdvXCJ9JykpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHJlc29sdmVyLFxuXHRcdCk7XG5cdFx0Y29uc3Qgc3RvcHBlZCA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RvcCgwKSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cmVzb2x2ZXIsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zmlyc3Q6IGZpcnN0Lm1hcChzaWduYWwgPT4gc2lnbmFsLmtpbmQgPT09ICdhY3Rpb24nID8gc2lnbmFsLmFjdGlvbiA6IHVuZGVmaW5lZCksXG5cdFx0XHR3aXRoaW5JbnRlcnZhbCxcblx0XHRcdHN0b3BwZWQ6IHN0b3BwZWQubWFwKHNpZ25hbCA9PiBzaWduYWwua2luZCA9PT0gJ2FjdGlvbicgPyBzaWduYWwuYWN0aW9uIDogdW5kZWZpbmVkKSxcblx0XHR9LCB7XG5cdFx0XHRmaXJzdDogW3tcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSxcblx0XHRcdFx0dHVybklkOiBUVVJOX0lELFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndHVfd3JpdGUnLFxuXHRcdFx0XHRjb250ZW50OiAnJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHsgbWFya2Rvd246ICdDcmVhdGluZyBbbmV3LnRzXShmaWxlOi8vL3NyYy9uZXcudHMpICgxIGxpbmUpJyB9LFxuXHRcdFx0fV0sXG5cdFx0XHR3aXRoaW5JbnRlcnZhbDogW10sXG5cdFx0XHRzdG9wcGVkOiBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLFxuXHRcdFx0XHR0dXJuSWQ6IFRVUk5fSUQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0dV93cml0ZScsXG5cdFx0XHRcdGNvbnRlbnQ6ICcnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogeyBtYXJrZG93bjogJ0NyZWF0aW5nIFtuZXcudHNdKGZpbGU6Ly8vc3JjL25ldy50cykgKDIgbGluZXMpJyB9LFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6IFRVUk5fSUQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0dV93cml0ZScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB7IG1hcmtkb3duOiAnRWRpdGluZyBbbmV3LnRzXShmaWxlOi8vL3NyYy9uZXcudHMpJyB9LFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XFxuICBcImZpbGVfcGF0aFwiOiBcIi9zcmMvbmV3LnRzXCIsXFxuICBcImNvbnRlbnRcIjogXCJvbmVcXFxcbnR3b1wiXFxufScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsaWVudCB0b29scyB3aXRoIENsYXVkZSBidWlsdC1pbiBuYW1lcyBwcmVzZXJ2ZSBjbGllbnQgc2VtYW50aWNzIHRocm91Z2hvdXQgdGhlIGxpZmVjeWNsZScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gcigpO1xuXHRcdGNvbnN0IHN0YXJ0ID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMCwgJ3R1X2NsaWVudF93cml0ZScsICdtY3BfX2NsaWVudF9fV3JpdGUnKSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRyZXNvbHZlcixcblx0XHRcdCgpID0+ICdjbGllbnQtMScsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGRlbHRhID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VJbnB1dEpzb25EZWx0YSgwLCAne1widmFsdWVcIjpcImNsaWVudCBpbnB1dFwifScpKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdHJlc29sdmVyLFxuXHRcdCk7XG5cdFx0Y29uc3QgcmVhZHkgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0b3AoMCkpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0cmVzb2x2ZXIsXG5cdFx0KTtcblx0XHRjb25zdCBjb21wbGV0ZSA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2UoU0VTU0lPTl9JRCwgJ3R1X2NsaWVudF93cml0ZScsICdkb25lJyksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0J3R1cm4tMi1pcnJlbGV2YW50Jyxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRyZXNvbHZlcixcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uc3RhcnQsIC4uLmRlbHRhLCAuLi5yZWFkeSwgLi4uY29tcGxldGVdLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRyZXNvdXJjZTogU0VTU0lPTixcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0XHR0dXJuSWQ6IFRVUk5fSUQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3R1X2NsaWVudF93cml0ZScsXG5cdFx0XHRcdFx0dG9vbE5hbWU6ICdXcml0ZScsXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdXcml0ZScsXG5cdFx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC0xJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRcdHJlc291cmNlOiBTRVNTSU9OLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLFxuXHRcdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndHVfY2xpZW50X3dyaXRlJyxcblx0XHRcdFx0XHRjb250ZW50OiAne1widmFsdWVcIjpcImNsaWVudCBpbnB1dFwifScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0cmVzb3VyY2U6IFNFU1NJT04sXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdFx0dHVybklkOiBUVVJOX0lELFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0dV9jbGllbnRfd3JpdGUnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUnLFxuXHRcdFx0XHRcdHRvb2xJbnB1dDogJ3tcXG4gIFwidmFsdWVcIjogXCJjbGllbnQgaW5wdXRcIlxcbn0nLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRcdHJlc291cmNlOiBTRVNTSU9OLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndHVfY2xpZW50X3dyaXRlJyxcblx0XHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnV3JpdGUnLFxuXHRcdFx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdkb25lJyB9XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnVGVzdCA5LjUgXHUyMDE0IGNvbnRlbnRfYmxvY2tfc3RvcCBlbWl0cyBDaGF0VG9vbENhbGxSZWFkeSBzbyBhdXRvLWFsbG93ZWQgdG9vbHMgbGVhdmUgU3RyZWFtaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBDYXB0dXJpbmdMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblx0XHRjb25zdCByZXNvbHZlciA9IHIoKTtcblxuXHRcdC8vIERyaXZlIGEgQmFzaCB0b29sX3VzZSB0aHJvdWdoIHN0YXJ0IFx1MjE5MiBpbnB1dCBkZWx0YXMgXHUyMTkyIHN0b3AuIFRoZVxuXHRcdC8vIGZpeDogYGNvbnRlbnRfYmxvY2tfc3RvcGAgbXVzdCBlbWl0IGBDaGF0VG9vbENhbGxSZWFkeWAgd2l0aFxuXHRcdC8vIGBjb25maXJtZWQ6IE5vdE5lZWRlZGAsIHRoZSBwYXJzZWQgaW5wdXQgYXMgYHRvb2xJbnB1dGAsIHRoZVxuXHRcdC8vIHJpY2ggYGludm9jYXRpb25NZXNzYWdlYCwgYW5kIGBfbWV0YS50b29sS2luZGAgXHUyMDE0IG90aGVyd2lzZSBhblxuXHRcdC8vIGF1dG8tYWxsb3dlZCB0b29sIChTREsgc2tpcHMgYGNhblVzZVRvb2xgKSBzdGF5cyBpbiBTdHJlYW1pbmdcblx0XHQvLyBhbmQgdGhlIHJlZHVjZXIgZHJvcHMgdGhlIHN1YnNlcXVlbnQgQ29tcGxldGUuXG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsICd0dV9iJywgJ0Jhc2gnKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKTtcblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VJbnB1dEpzb25EZWx0YSgwLCAne1wiY29tbWFuZFwiOlwiZ2l0IHN0YXR1c1wifScpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXHRcdGNvbnN0IHNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdG9wKDApKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWduYWxzLCBbe1xuXHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRyZXNvdXJjZTogU0VTU0lPTixcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6IFRVUk5fSUQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0dV9iJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHsgbWFya2Rvd246ICdSdW5uaW5nIGBnaXQgc3RhdHVzYCcgfSxcblx0XHRcdFx0dG9vbElucHV0OiAnZ2l0IHN0YXR1cycsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cud2FybnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnVGVzdCAxMCBcdTIwMTQgc3ludGhldGljIHVzZXIgdG9vbF9yZXN1bHQgZW1pdHMgQ2hhdFRvb2xDYWxsQ29tcGxldGUgd2l0aCB0aGUgb3JpZ2luYXRpbmcgdHVybklkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBDYXB0dXJpbmdMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblx0XHRjb25zdCByZXNvbHZlciA9IHIoKTtcblxuXHRcdC8vIERyaXZlIHRoZSB0b29sX3VzZSB0aHJvdWdoIHN0YXRlLCBzaW11bGF0aW5nIHRoZSBtdWx0aS1tZXNzYWdlXG5cdFx0Ly8gZmxvdzogdGhlIHRvb2xfdXNlIGxhbmRzIG9uIFRVUk5fSUQsIGNvbnRlbnRfYmxvY2tfc3RvcCBkcmFpbnNcblx0XHQvLyB0aGUgcGVyLW1lc3NhZ2UgbWFwLCB0aGVuIGEgc3ludGhldGljIHVzZXIgbWVzc2FnZSBpbiB0aGUgbmV4dFxuXHRcdC8vIChzZXBhcmF0ZSkgdHVybiBjYXJyaWVzIHRoZSB0b29sX3Jlc3VsdC4gQ3Jvc3MtbWVzc2FnZSBsb29rdXBcblx0XHQvLyBtdXN0IHJlY292ZXIgdGhlIG9yaWdpbmFsIHR1cm5JZC5cblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMCwgJ3R1XzEnLCAnUmVhZCcpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0b3AoMCkpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cblx0XHRjb25zdCBzaWduYWxzID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVVzZXJUb29sUmVzdWx0TWVzc2FnZShTRVNTSU9OX0lELCAndHVfMScsICdmaWxlIGNvbnRlbnRzJyksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0J3R1cm4tMi1pcnJlbGV2YW50Jyxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cigpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZ25hbHMsIFt7XG5cdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdHJlc291cmNlOiBTRVNTSU9OLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3R1XzEnLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSZWFkIGZpbGUnLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnZmlsZSBjb250ZW50cycgfV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy53YXJucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IDExIFx1MjAxNCB0b29sX3Jlc3VsdCBmb3IgdW5rbm93biB0b29sX3VzZV9pZCBlbWl0cyBubyBzaWduYWwgYW5kIHdhcm5zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBDYXB0dXJpbmdMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblxuXG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2UoU0VTU0lPTl9JRCwgJ3Vua25vd24taWQnLCAnb3JwaGFuIGNvbnRlbnQnKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRsb2csXG5cdFx0XHRyKCksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lnbmFscywgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2cud2FybnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQub2sobG9nLndhcm5zWzBdLmluY2x1ZGVzKCd0b29sX3Jlc3VsdCBmb3IgdW5rbm93biB0b29sX3VzZV9pZCB1bmtub3duLWlkJykpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b29sX3Jlc3VsdCB3aXRoIGlzX2Vycm9yOiB0cnVlIHJlcG9ydHMgc3VjY2Vzcz1mYWxzZScsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gcigpO1xuXG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsICd0dV9lcnInLCAnQmFzaCcpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2UoU0VTU0lPTl9JRCwgJ3R1X2VycicsICdwZXJtaXNzaW9uIGRlbmllZCcsIHsgaXNFcnJvcjogdHJ1ZSB9KSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRsb2csXG5cdFx0XHRyKCksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaWduYWxzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgY29tcGxldGUgPSBzaWduYWxzWzBdO1xuXHRcdGFzc2VydC5vayhjb21wbGV0ZS5raW5kID09PSAnYWN0aW9uJyAmJiBjb21wbGV0ZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlLmFjdGlvbi5yZXN1bHQuc3VjY2VzcywgZmFsc2UpO1xuXHRcdC8vIEEgZ2VudWluZSBmYWlsdXJlIHdob3NlIG1lc3NhZ2UgaXMgbm90IG9uZSBvZiB0aGUga25vd24gZGVueSBzdHJpbmdzXG5cdFx0Ly8gbXVzdCBOT1QgYmUgY2xhc3NpZmllZCBhcyBhIGNhbmNlbGxhdGlvbjogbm8gYGVycm9yLmNvZGVgIGlzIHNldCwgc29cblx0XHQvLyB0ZWxlbWV0cnkgcmVwb3J0cyBgZXJyb3JgIHJhdGhlciB0aGFuIGB1c2VyQ2FuY2VsbGVkYC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGUuYWN0aW9uLnJlc3VsdC5lcnJvcj8uY29kZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgndG9vbF9yZXN1bHQgY29udGVudCBhcyBUZXh0QmxvY2sgYXJyYXkgdW53cmFwcyB0byBUb29sUmVzdWx0VGV4dENvbnRlbnRbXScsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gcigpO1xuXG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsICd0dV8yJywgJ1JlYWQnKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKTtcblxuXHRcdGNvbnN0IHNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlVXNlclRvb2xSZXN1bHRNZXNzYWdlKFNFU1NJT05fSUQsICd0dV8yJywgW1xuXHRcdFx0XHR7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2ZpcnN0JyB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ3NlY29uZCcgfSxcblx0XHRcdF0pLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgY29tcGxldGUgPSBzaWduYWxzWzBdO1xuXHRcdGFzc2VydC5vayhjb21wbGV0ZS5raW5kID09PSAnYWN0aW9uJyAmJiBjb21wbGV0ZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wbGV0ZS5hY3Rpb24ucmVzdWx0LmNvbnRlbnQsIFtcblx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdmaXJzdCcgfSxcblx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdzZWNvbmQnIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIFBoYXNlIDggXHUyMDE0IGZpbGUtZWRpdCBjYWNoZVxuXG5cdHRlc3QoJ1BoYXNlIDggXHUyMDE0IGNhY2hlZCBmaWxlIGVkaXQgaXMgYXBwZW5kZWQgdG8gQ2hhdFRvb2xDYWxsQ29tcGxldGUucmVzdWx0LmNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblx0XHRjb25zdCByZXNvbHZlciA9IHIoKTtcblxuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgwLCAndHVfZWRpdCcsICdXcml0ZScpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXG5cdFx0Y29uc3QgZmlsZUVkaXQgPSB7XG5cdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQgYXMgY29uc3QsXG5cdFx0XHRiZWZvcmU6IHsgdXJpOiAnZmlsZTovLy90bXAvYScsIGNvbnRlbnQ6IHsgdXJpOiAnc2Vzc2lvbi1kYjovL2FiYy9iZWZvcmUnIH0gfSxcblx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vdG1wL2EnLCBjb250ZW50OiB7IHVyaTogJ3Nlc3Npb24tZGI6Ly9hYmMvYWZ0ZXInIH0gfSxcblx0XHRcdGRpZmY6IHsgYWRkZWQ6IDMsIHJlbW92ZWQ6IDEgfSxcblx0XHR9O1xuXHRcdHN0YXRlLmNhY2hlRmlsZUVkaXQoJ3R1X2VkaXQnLCBmaWxlRWRpdCk7XG5cblx0XHRjb25zdCBzaWduYWxzID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVVzZXJUb29sUmVzdWx0TWVzc2FnZShTRVNTSU9OX0lELCAndHVfZWRpdCcsICd3cm90ZSBmaWxlJyksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cigpLFxuXHRcdCk7XG5cblx0XHRjb25zdCBjb21wbGV0ZSA9IHNpZ25hbHNbMF07XG5cdFx0YXNzZXJ0Lm9rKGNvbXBsZXRlLmtpbmQgPT09ICdhY3Rpb24nICYmIGNvbXBsZXRlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbXBsZXRlLmFjdGlvbi5yZXN1bHQuY29udGVudCwgW1xuXHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ3dyb3RlIGZpbGUnIH0sXG5cdFx0XHRmaWxlRWRpdCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnUGhhc2UgOCBcdTIwMTQgbm8gY2FjaGVkIGVkaXQgbGVhdmVzIGNvbnRlbnQgdGV4dC1vbmx5IChubyByZWdyZXNzaW9uKScsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gcigpO1xuXG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsICd0dV9yZWFkJywgJ1JlYWQnKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKTtcblxuXHRcdGNvbnN0IHNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlVXNlclRvb2xSZXN1bHRNZXNzYWdlKFNFU1NJT05fSUQsICd0dV9yZWFkJywgJ2ZpbGUgY29udGVudHMnKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRsb2csXG5cdFx0XHRyKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IGNvbXBsZXRlID0gc2lnbmFsc1swXTtcblx0XHRhc3NlcnQub2soY29tcGxldGUua2luZCA9PT0gJ2FjdGlvbicgJiYgY29tcGxldGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tcGxldGUuYWN0aW9uLnJlc3VsdC5jb250ZW50LCBbXG5cdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnZmlsZSBjb250ZW50cycgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnUGhhc2UgOCBcdTIwMTQgdGFrZUZpbGVFZGl0IHJldHVybnMgdW5kZWZpbmVkIG9uIGNhY2hlIG1pc3MgYW5kIGNvbnN1bWVzIG9uIGhpdCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnRha2VGaWxlRWRpdCgnYWJzZW50JyksIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBmaWxlRWRpdCA9IHtcblx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCBhcyBjb25zdCxcblx0XHRcdGJlZm9yZTogeyB1cmk6ICdmaWxlOi8vL3RtcC94JywgY29udGVudDogeyB1cmk6ICdzZXNzaW9uLWRiOi8veC9iZWZvcmUnIH0gfSxcblx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vdG1wL3gnLCBjb250ZW50OiB7IHVyaTogJ3Nlc3Npb24tZGI6Ly94L2FmdGVyJyB9IH0sXG5cdFx0XHRkaWZmOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHRzdGF0ZS5jYWNoZUZpbGVFZGl0KCd0dV94JywgZmlsZUVkaXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50YWtlRmlsZUVkaXQoJ3R1X3gnKSwgZmlsZUVkaXQpO1xuXHRcdC8vIFNlY29uZCB0YWtlIGlzIGEgbWlzcyBcdTIwMTQgdGhlIGVudHJ5IHdhcyBjb25zdW1lZC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudGFrZUZpbGVFZGl0KCd0dV94JyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHR0ZXN0KCdjYW5vbmljYWwgYXNzaXN0YW50IGVudmVsb3BlIGRyb3BzIHRvb2xfdXNlIGJsb2NrcyBzaWxlbnRseSAocGFydGlhbCBzdHJlYW0gb3ducyBDaGF0VG9vbENhbGxTdGFydCknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IENhcHR1cmluZ0xvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXG5cblx0XHRjb25zdCBzaWduYWxzID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZUFzc2lzdGFudE1lc3NhZ2UoU0VTU0lPTl9JRCwgW1xuXHRcdFx0XHR7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2ZpbmFsJywgY2l0YXRpb25zOiBudWxsIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3Rvb2xfdXNlJywgaWQ6ICd0dV9hJywgbmFtZTogJ0Jhc2gnLCBpbnB1dDoge30gfSxcblx0XHRcdF0pLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWduYWxzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cud2FybnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnY2Fub25pY2FsIGFzc2lzdGFudCBlbnZlbG9wZSB3aXRob3V0IHRvb2xfdXNlIGVtaXRzIG5vdGhpbmcgYW5kIGRvZXMgbm90IHdhcm4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IENhcHR1cmluZ0xvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXG5cblx0XHRjb25zdCBzaWduYWxzID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZUFzc2lzdGFudE1lc3NhZ2UoU0VTU0lPTl9JRCwgW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnZmluYWwgYW5zd2VyJywgY2l0YXRpb25zOiBudWxsIH1dKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRsb2csXG5cdFx0XHRyKCksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lnbmFscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLndhcm5zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3VsdCBzdWNjZXNzIGVtaXRzIENoYXRVc2FnZSAod2l0aCBtb2RlbCk7IENoYXRUdXJuQ29tcGxldGUgbm93IGxpdmVzIG9uIHRoZSBwaXBlbGluZSwgbm90IHRoZSBtYXBwZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbWFrZVJlc3VsdFN1Y2Nlc3MoU0VTU0lPTl9JRCk7XG5cdFx0cmVzdWx0LnVzYWdlLmlucHV0X3Rva2VucyA9IDEyO1xuXHRcdHJlc3VsdC51c2FnZS5vdXRwdXRfdG9rZW5zID0gMzQ7XG5cdFx0cmVzdWx0LnVzYWdlLmNhY2hlX3JlYWRfaW5wdXRfdG9rZW5zID0gNTtcblx0XHRyZXN1bHQubW9kZWxVc2FnZSA9IHtcblx0XHRcdCdjbGF1ZGUtdGVzdCc6IHtcblx0XHRcdFx0aW5wdXRUb2tlbnM6IDEyLFxuXHRcdFx0XHRvdXRwdXRUb2tlbnM6IDM0LFxuXHRcdFx0XHRjYWNoZVJlYWRJbnB1dFRva2VuczogNSxcblx0XHRcdFx0Y2FjaGVDcmVhdGlvbklucHV0VG9rZW5zOiAwLFxuXHRcdFx0XHR3ZWJTZWFyY2hSZXF1ZXN0czogMCxcblx0XHRcdFx0Y29zdFVTRDogMCxcblx0XHRcdFx0Y29udGV4dFdpbmRvdzogMjAwXzAwMCxcblx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiA4MTkyLFxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhyZXN1bHQsIFNFU1NJT04sIFRVUk5fSUQsIG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgcigpKTtcblxuXHRcdC8vIFBpcGVsaW5lIChQaGFzZSA5IHJlZmFjdG9yKSBvd25zIHRoZSBwcm90b2NvbC1UdXJuIGJvdW5kYXJ5OyBpdFxuXHRcdC8vIGZpcmVzIENoYXRUdXJuQ29tcGxldGUgdmlhIGBvblR1cm5Db21wbGV0ZWAgb25seSBvbiB0aGUgRklOQUxcblx0XHQvLyByZXN1bHQgb2YgYSB0dXJuIChpbnRlcm1lZGlhdGUgcmVzdWx0cyBkdXJpbmcgc3RlZXJpbmcgcHJlZW1wdCBkb1xuXHRcdC8vIE5PVCBjbG9zZSB0aGUgcHJvdG9jb2wgVHVybikuIFRoZSBtYXBwZXIgdGhlcmVmb3JlIGVtaXRzIG9ubHlcblx0XHQvLyBDaGF0VXNhZ2UgZm9yIGByZXN1bHRgIG1lc3NhZ2VzLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lnbmFscywgW1xuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0cmVzb3VyY2U6IFNFU1NJT04sXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFVzYWdlLFxuXHRcdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0XHR1c2FnZToge1xuXHRcdFx0XHRcdFx0aW5wdXRUb2tlbnM6IDEyLFxuXHRcdFx0XHRcdFx0b3V0cHV0VG9rZW5zOiAzNCxcblx0XHRcdFx0XHRcdGNhY2hlUmVhZFRva2VuczogNSxcblx0XHRcdFx0XHRcdG1vZGVsOiAnY2xhdWRlLXRlc3QnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN1bHQgc3VjY2VzcyBkb2VzIG5vdCBkZXJpdmUgY3JlZGl0cyBmcm9tIHRvdGFsX2Nvc3RfdXNkJywgKCkgPT4ge1xuXHRcdC8vIFBlci10dXJuIGNyZWRpdHMgY29tZSBmcm9tIENBUEkgYGNvcGlsb3RfdXNhZ2VgIHZpYSB0aGUgcHJveHksIG5vdFxuXHRcdC8vIGZyb20gdGhlIFNESydzIEFudGhyb3BpYy1saXN0LXByaWNlIGB0b3RhbF9jb3N0X3VzZGAuIFRoZSBtYXBwZXJcblx0XHQvLyBtdXN0IG5ldmVyIGF0dGFjaCBhIGBfbWV0YS5jb3N0YCAoaXQgd291bGQgbWlzbGFiZWwgVVNEIGFzIGNyZWRpdHMpLlxuXHRcdGNvbnN0IHJlc3VsdCA9IG1ha2VSZXN1bHRTdWNjZXNzKFNFU1NJT05fSUQpO1xuXHRcdHJlc3VsdC50b3RhbF9jb3N0X3VzZCA9IDAuMTIzNDtcblxuXHRcdGNvbnN0IHNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMocmVzdWx0LCBTRVNTSU9OLCBUVVJOX0lELCBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHIoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2lnbmFscy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHVzYWdlID0gc2lnbmFsc1swXTtcblx0XHRhc3NlcnQub2sodXNhZ2Uua2luZCA9PT0gJ2FjdGlvbicgJiYgdXNhZ2UuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFVzYWdlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNhZ2UuYWN0aW9uLnVzYWdlLl9tZXRhLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN1bHQgc3VjY2VzcyB3aXRob3V0IG1vZGVsVXNhZ2Ugb21pdHMgdGhlIG1vZGVsIGZpZWxkIG9uIENoYXRVc2FnZScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBtYWtlUmVzdWx0U3VjY2VzcyhTRVNTSU9OX0lEKTtcblx0XHRyZXN1bHQubW9kZWxVc2FnZSA9IHt9O1xuXG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhyZXN1bHQsIFNFU1NJT04sIFRVUk5fSUQsIG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgcigpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaWduYWxzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgdXNhZ2UgPSBzaWduYWxzWzBdO1xuXHRcdGFzc2VydC5vayh1c2FnZS5raW5kID09PSAnYWN0aW9uJyAmJiB1c2FnZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VXNhZ2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1c2FnZS5hY3Rpb24udXNhZ2UubW9kZWwsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3VsdCBkcmFpbnMgcGVuZGluZyB0b29sX3VzZSBlbnRyaWVzIHRoYXQgbmV2ZXIgcmVjZWl2ZWQgYSB0b29sX3Jlc3VsdCBhbmQgd2FybnMgb25jZSBwZXIgb3JwaGFuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBDYXB0dXJpbmdMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblxuXHRcdGNvbnN0IFRPT0xfVVNFX0lEID0gJ3Rvb2x1X29ycGhhbl8xJztcblxuXHRcdC8vIE9wZW4gYSB0b29sX3VzZSBibG9jayB0aGF0IHdpbGwgbmV2ZXIgYmUgcGFpcmVkIHdpdGggYSB0b29sX3Jlc3VsdC5cblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgwLCBUT09MX1VTRV9JRCwgJ1JlYWQnKSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cigpLFxuXHRcdCk7XG5cblx0XHQvLyBUdXJuIGVuZHMgd2l0aCBubyB0b29sX3Jlc3VsdCBmb3IgdGhlIHRvb2xfdXNlLlxuXHRcdGNvbnN0IHJlc3VsdFNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlUmVzdWx0U3VjY2VzcyhTRVNTSU9OX0lEKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRsb2csXG5cdFx0XHRyKCksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRTaWduYWxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvZy53YXJucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5vayhsb2cud2FybnNbMF0uaW5jbHVkZXMoVE9PTF9VU0VfSUQpLCBgZXhwZWN0ZWQgd2FybiB0byBtZW50aW9uIG9ycGhhbiBpZCwgZ290OiAke2xvZy53YXJuc1swXX1gKTtcblx0XHRhc3NlcnQub2sobG9nLndhcm5zWzBdLmluY2x1ZGVzKCdSZWFkJyksIGBleHBlY3RlZCB3YXJuIHRvIG1lbnRpb24gdG9vbCBuYW1lLCBnb3Q6ICR7bG9nLndhcm5zWzBdfWApO1xuXG5cdFx0Ly8gQSBsYXRlLWFycml2aW5nIHRvb2xfcmVzdWx0IGZvciB0aGUgb3JwaGFuIG11c3Qgbm93IGJlIHRyZWF0ZWRcblx0XHQvLyBhcyB1bmtub3duIFx1MjAxNCBwcm92aW5nIHRoZSBjcm9zcy1tZXNzYWdlIHN0YXRlIHdhcyBhY3R1YWxseSBjbGVhcmVkLlxuXHRcdGNvbnN0IGxhdGVTaWduYWxzID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVVzZXJUb29sUmVzdWx0TWVzc2FnZShTRVNTSU9OX0lELCBUT09MX1VTRV9JRCwgJ2xhdGUgY29udGVudCcpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXRlU2lnbmFscywgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2cud2FybnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2sobG9nLndhcm5zWzFdLmluY2x1ZGVzKGB0b29sX3Jlc3VsdCBmb3IgdW5rbm93biB0b29sX3VzZV9pZCAke1RPT0xfVVNFX0lEfWApKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdtZXNzYWdlX3N0b3AgYW5kIHVua25vd24gc3RyZWFtIGV2ZW50cyBlbWl0IG5vdGhpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblxuXG5cdFx0Y29uc3Qgc3RvcCA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlTWVzc2FnZVN0b3AoKSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cigpLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdG9wLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpLWJsb2NrIG9yZGVyaW5nOiB0ZXh0IEAwIHRoZW4gdGhpbmtpbmcgQDEga2VlcCBkaXN0aW5jdCBwYXJ0IGlkcyBhbmQgcm91dGUgZGVsdGFzIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gcigpO1xuXG5cdFx0Y29uc3QgdGV4dDAgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRleHQoMCkpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cdFx0Y29uc3QgdGhpbmsxID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUaGlua2luZygxKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKTtcblxuXHRcdGNvbnN0IHRleHQwU3RhcnQgPSB0ZXh0MFswXTtcblx0XHRjb25zdCB0aGluazFTdGFydCA9IHRoaW5rMVswXTtcblx0XHRhc3NlcnQub2sodGV4dDBTdGFydC5raW5kID09PSAnYWN0aW9uJyAmJiB0ZXh0MFN0YXJ0LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQpO1xuXHRcdGFzc2VydC5vayh0aGluazFTdGFydC5raW5kID09PSAnYWN0aW9uJyAmJiB0aGluazFTdGFydC5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dDBTdGFydC5hY3Rpb24ucGFydC5raW5kLCBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpbmsxU3RhcnQuYWN0aW9uLnBhcnQua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcpO1xuXHRcdGNvbnN0IHRleHRQYXJ0SWQgPSB0ZXh0MFN0YXJ0LmFjdGlvbi5wYXJ0LmlkO1xuXHRcdGNvbnN0IHRoaW5rUGFydElkID0gdGhpbmsxU3RhcnQuYWN0aW9uLnBhcnQuaWQ7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRleHRQYXJ0SWQsIHRoaW5rUGFydElkKTtcblxuXHRcdGNvbnN0IGRUZXh0ID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlVGV4dERlbHRhKDAsICdBJykpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cdFx0Y29uc3QgZFRoaW5rID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlVGhpbmtpbmdEZWx0YSgxLCAnQicpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXG5cdFx0YXNzZXJ0Lm9rKGRUZXh0WzBdLmtpbmQgPT09ICdhY3Rpb24nICYmIGRUZXh0WzBdLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXREZWx0YSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRUZXh0WzBdLmFjdGlvbi5wYXJ0SWQsIHRleHRQYXJ0SWQpO1xuXHRcdGFzc2VydC5vayhkVGhpbmtbMF0ua2luZCA9PT0gJ2FjdGlvbicgJiYgZFRoaW5rWzBdLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZWFzb25pbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkVGhpbmtbMF0uYWN0aW9uLnBhcnRJZCwgdGhpbmtQYXJ0SWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gU0RLIG1lc3NhZ2VzIHdpdGhpbiBvbmUgdHVybiBhdCB0aGUgc2FtZSBjb250ZW50LWJsb2NrIGluZGV4IHByb2R1Y2UgZGlzdGluY3QgcGFydCBpZHMnLCAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogcHJlLXRvb2wgbWVzc2FnZSBoYWQgdGhpbmtpbmdAMDsgcG9zdC10b29sLXJlc3VsdFxuXHRcdC8vIG1lc3NhZ2UgaGFzIHRleHRAMC4gU2FtZSB0dXJuSWQsIHNhbWUgY29udGVudC1ibG9jayBpbmRleC5cblx0XHQvLyBUaGUgQW50aHJvcGljIFNESyByZXNldHMgYGV2ZW50LmluZGV4YCBvbiBlYWNoIG1lc3NhZ2Vfc3RhcnQsXG5cdFx0Ly8gc28gdGhlIHBhcnQgaWQgbXVzdCBpbmNsdWRlIHRoZSBTREsgbWVzc2FnZSBpZCB0byBhdm9pZFxuXHRcdC8vIGNvbGxpc2lvbiB3aXRoIHRoZSBlYXJsaWVyIFJlYXNvbmluZyBwYXJ0ICh3aGljaCB3b3VsZCBjYXVzZVxuXHRcdC8vIHRoZSByZWR1Y2VyIHRvIGRyb3AgdGhlIG5ldyBNYXJrZG93biBwYXJ0IGFzIGEgZHVwbGljYXRlKS5cblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gcigpO1xuXG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlTWVzc2FnZVN0YXJ0KCdtc2dfYScpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXHRcdGNvbnN0IHRoaW5rU3RhcnQgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRoaW5raW5nKDApKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXHRcdGNvbnN0IHRoaW5rRGVsdGEgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VUaGlua2luZ0RlbHRhKDAsICdwbGFuJykpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VNZXNzYWdlU3RhcnQoJ21zZ19iJykpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cdFx0Y29uc3QgdGV4dFN0YXJ0ID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUZXh0KDApKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXHRcdGNvbnN0IHRleHREZWx0YSA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZVRleHREZWx0YSgwLCAnZG9uZScpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXG5cdFx0Y29uc3QgdGhpbmtTdGFydFNpZ25hbCA9IHRoaW5rU3RhcnRbMF07XG5cdFx0Y29uc3QgdGV4dFN0YXJ0U2lnbmFsID0gdGV4dFN0YXJ0WzBdO1xuXHRcdGFzc2VydC5vayh0aGlua1N0YXJ0U2lnbmFsLmtpbmQgPT09ICdhY3Rpb24nICYmIHRoaW5rU3RhcnRTaWduYWwuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCk7XG5cdFx0YXNzZXJ0Lm9rKHRleHRTdGFydFNpZ25hbC5raW5kID09PSAnYWN0aW9uJyAmJiB0ZXh0U3RhcnRTaWduYWwuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaW5rU3RhcnRTaWduYWwuYWN0aW9uLnBhcnQua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0U3RhcnRTaWduYWwuYWN0aW9uLnBhcnQua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bik7XG5cdFx0Y29uc3QgdGhpbmtQYXJ0SWQgPSB0aGlua1N0YXJ0U2lnbmFsLmFjdGlvbi5wYXJ0LmlkO1xuXHRcdGNvbnN0IHRleHRQYXJ0SWQgPSB0ZXh0U3RhcnRTaWduYWwuYWN0aW9uLnBhcnQuaWQ7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRoaW5rUGFydElkLCB0ZXh0UGFydElkLCAndGV4dEAwIGluIHNlY29uZCBtZXNzYWdlIG11c3Qgbm90IGNvbGxpZGUgd2l0aCB0aGlua2luZ0AwIGluIGZpcnN0IG1lc3NhZ2UnKTtcblxuXHRcdGNvbnN0IHRoaW5rRGVsdGFTaWduYWwgPSB0aGlua0RlbHRhWzBdO1xuXHRcdGNvbnN0IHRleHREZWx0YVNpZ25hbCA9IHRleHREZWx0YVswXTtcblx0XHRhc3NlcnQub2sodGhpbmtEZWx0YVNpZ25hbC5raW5kID09PSAnYWN0aW9uJyAmJiB0aGlua0RlbHRhU2lnbmFsLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZWFzb25pbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlua0RlbHRhU2lnbmFsLmFjdGlvbi5wYXJ0SWQsIHRoaW5rUGFydElkKTtcblx0XHRhc3NlcnQub2sodGV4dERlbHRhU2lnbmFsLmtpbmQgPT09ICdhY3Rpb24nICYmIHRleHREZWx0YVNpZ25hbC5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RGVsdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0RGVsdGFTaWduYWwuYWN0aW9uLnBhcnRJZCwgdGV4dFBhcnRJZCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFrQiw2QkFBNkI7QUFDeEQsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyw0QkFBNEIsK0JBQStCO0FBQ3BFLFNBQVMsbUJBQW1CLG1DQUFtQztBQUMvRCxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLDBCQUEwQiwwQkFBMEI7QUFDN0QsU0FBUyx3QkFBd0I7QUFDakM7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFVUCxNQUFNLHFEQUFnRCxNQUFNO0FBRTNELFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsUUFBTSxVQUFVLElBQUksTUFBTSwwQkFBMEI7QUFDcEQsUUFBTSxjQUFjLFFBQVEsU0FBUztBQUNyQyxRQUFNLGFBQWE7QUFDbkIsUUFBTSxVQUFVO0FBQ2hCLE1BQUk7QUFFSixXQUFTLE1BQU07QUFDZCxXQUFPLFFBQVE7QUFDZixZQUFRO0FBQUEsRUFDVCxDQUFDO0FBQUEsRUFNRCxNQUFNLDRCQUE0QixlQUFlO0FBQUEsSUFBakQ7QUFBQTtBQUNDLFdBQVMsUUFBa0IsQ0FBQztBQUFBO0FBQUEsSUFDbkIsS0FBSyxZQUFvQixNQUF1QjtBQUN4RCxXQUFLLE1BQU0sS0FBSyxDQUFDLFNBQVMsR0FBRyxLQUFLLElBQUksT0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxHQUFHLENBQUM7QUFBQSxJQUNqRTtBQUFBLEVBQ0Q7QUFTQSxXQUFTLElBQXNCO0FBQzlCLFdBQU8sWUFBWSxJQUFJLElBQUksaUJBQWlCLENBQUM7QUFBQSxFQUM5QztBQUVBLE9BQUssa0NBQWtDLE1BQU07QUFDNUMsVUFBTSxVQUFVO0FBQUEsTUFDZixnQkFBZ0IsWUFBWSxpQkFBaUIsQ0FBQztBQUFBLE1BQzlDO0FBQUEsTUFDQTtBQUFBLE1BQ0EsSUFBSSxrQkFBa0I7QUFBQSxNQUN0QixJQUFJLGVBQWU7QUFBQSxNQUNuQixFQUFFO0FBQUEsSUFDSDtBQUVBLFdBQU8sZ0JBQWdCLFNBQVMsQ0FBQyxDQUFDO0FBQUEsRUFDbkMsQ0FBQztBQUVELE9BQUssK0VBQStFLE1BQU07QUFDekYsVUFBTSxTQUFTLHlCQUF5QixFQUFFLFlBQVksRUFBRSxNQUFNLGlCQUFpQixXQUFXLEVBQUUsTUFBTSxrQkFBa0IsU0FBUyx1Q0FBdUMsRUFBRSxFQUFFLENBQUM7QUFDekssVUFBTSxVQUFVO0FBQUEsTUFDZixnQkFBZ0IsWUFBWSxDQUFDLDBEQUEwRCxNQUFNLEVBQUUsQ0FBQztBQUFBLE1BQ2hHO0FBQUEsTUFDQTtBQUFBLE1BQ0EsSUFBSSxrQkFBa0I7QUFBQSxNQUN0QixJQUFJLGVBQWU7QUFBQSxNQUNuQixFQUFFO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBRUEsVUFBTSxjQUFjLFFBQVEsS0FBSyxPQUFLLEVBQUUsU0FBUyxZQUFZLEVBQUUsT0FBTyxTQUFTLFdBQVcsU0FBUztBQUNuRyxXQUFPLEdBQUcsZUFBZSxZQUFZLFNBQVMsWUFBWSxZQUFZLE9BQU8sU0FBUyxXQUFXLFNBQVM7QUFDMUcsV0FBTyxZQUFZLFlBQVksT0FBTyxVQUFVLEdBQUc7QUFDbkQsVUFBTSxRQUFRLFlBQVksT0FBTztBQUNqQyxVQUFNLE9BQU8sTUFBTTtBQUNuQixXQUFPLFlBQVksTUFBTSxXQUFXLFlBQVksTUFBTSxlQUFlO0FBQ3JFLFdBQU8sR0FBRyxDQUFDLE1BQU0sUUFBUSxTQUFTLGtCQUFrQixHQUFHLGlFQUFpRTtBQUFBLEVBQ3pILENBQUM7QUFFRCxPQUFLLG1GQUFtRixNQUFNO0FBQzdGLFVBQU0sU0FBUyx5QkFBeUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxpQkFBaUIsV0FBVyxFQUFFLE1BQU0saUJBQWlCLEVBQUUsRUFBRSxDQUFDO0FBQ3hILFVBQU0sU0FBUyxrQkFBa0IsVUFBVTtBQUMzQyxVQUFNLFVBQVU7QUFBQSxNQUNmLEVBQUUsR0FBRyxRQUFRLFVBQVUsTUFBTSxRQUFRLFNBQVMsTUFBTSxHQUFHO0FBQUEsTUFDdkQ7QUFBQSxNQUNBO0FBQUEsTUFDQSxJQUFJLGtCQUFrQjtBQUFBLE1BQ3RCLElBQUksZUFBZTtBQUFBLE1BQ25CLEVBQUU7QUFBQSxJQUNIO0FBRUEsVUFBTSxjQUFjLFFBQVEsS0FBSyxPQUFLLEVBQUUsU0FBUyxZQUFZLEVBQUUsT0FBTyxTQUFTLFdBQVcsU0FBUztBQUNuRyxXQUFPLEdBQUcsZUFBZSxZQUFZLFNBQVMsWUFBWSxZQUFZLE9BQU8sU0FBUyxXQUFXLFNBQVM7QUFDMUcsVUFBTSxPQUFPLFlBQVksT0FBTyxNQUFNO0FBQ3RDLFdBQU8sWUFBWSxNQUFNLFdBQVcsWUFBWSxNQUFNLGVBQWU7QUFBQSxFQUN0RSxDQUFDO0FBRUQsT0FBSywyRUFBMkUsTUFBTTtBQUNyRixVQUFNLE1BQXFCLENBQUM7QUFDNUIsVUFBTSxNQUFNLElBQUksZUFBZTtBQUMvQixVQUFNLFFBQVEsSUFBSSxrQkFBa0I7QUFDcEMsVUFBTSxXQUFXLEVBQUU7QUFDbkIsVUFBTSxPQUFPLENBQUMsU0FBd0IsSUFBSSxLQUFLLEdBQUcsSUFBSTtBQUV0RCxTQUFLLDRCQUE0QixnQkFBZ0IsWUFBWSxpQkFBaUIsQ0FBQyxHQUFHLFNBQVMsU0FBUyxPQUFPLEtBQUssUUFBUSxDQUFDO0FBQ3pILFNBQUssNEJBQTRCLGdCQUFnQixZQUFZLDBCQUEwQixDQUFDLENBQUMsR0FBRyxTQUFTLFNBQVMsT0FBTyxLQUFLLFFBQVEsQ0FBQztBQUNuSSxTQUFLLDRCQUE0QixnQkFBZ0IsWUFBWSxjQUFjLEdBQUcsU0FBUyxDQUFDLEdBQUcsU0FBUyxTQUFTLE9BQU8sS0FBSyxRQUFRLENBQUM7QUFDbEksU0FBSyw0QkFBNEIsZ0JBQWdCLFlBQVksY0FBYyxHQUFHLFFBQVEsQ0FBQyxHQUFHLFNBQVMsU0FBUyxPQUFPLEtBQUssUUFBUSxDQUFDO0FBQ2pJLFNBQUssNEJBQTRCLGdCQUFnQixZQUFZLHFCQUFxQixDQUFDLENBQUMsR0FBRyxTQUFTLFNBQVMsT0FBTyxLQUFLLFFBQVEsQ0FBQztBQUU5SCxXQUFPLFlBQVksSUFBSSxRQUFRLENBQUM7QUFDaEMsVUFBTSxRQUFRLElBQUksQ0FBQztBQUNuQixXQUFPLEdBQUcsTUFBTSxTQUFTLFlBQVksTUFBTSxPQUFPLFNBQVMsV0FBVyxnQkFBZ0I7QUFDdEYsV0FBTyxZQUFZLE1BQU0sU0FBUyxTQUFTLEdBQUcsV0FBVztBQUN6RCxXQUFPLFlBQVksTUFBTSxPQUFPLFFBQVEsT0FBTztBQUMvQyxXQUFPLFlBQVksTUFBTSxPQUFPLEtBQUssTUFBTSxpQkFBaUIsUUFBUTtBQUNwRSxVQUFNLFNBQVMsTUFBTSxPQUFPLEtBQUs7QUFDakMsV0FBTyxHQUFHLE9BQU8sU0FBUyxDQUFDO0FBRTNCLFdBQU8sZ0JBQWdCLElBQUksTUFBTSxDQUFDLEdBQUc7QUFBQSxNQUNwQztBQUFBLFFBQ0MsTUFBTTtBQUFBLFFBQ04sVUFBVTtBQUFBLFFBQ1YsUUFBUTtBQUFBLFVBQ1AsTUFBTSxXQUFXO0FBQUEsVUFDakIsUUFBUTtBQUFBLFVBQ1I7QUFBQSxVQUNBLFNBQVM7QUFBQSxRQUNWO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLFVBQVU7QUFBQSxRQUNWLFFBQVE7QUFBQSxVQUNQLE1BQU0sV0FBVztBQUFBLFVBQ2pCLFFBQVE7QUFBQSxVQUNSO0FBQUEsVUFDQSxTQUFTO0FBQUEsUUFDVjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlGQUFpRixNQUFNO0FBQzNGLFVBQU0sTUFBTSxJQUFJLGVBQWU7QUFDL0IsVUFBTSxRQUFRLElBQUksa0JBQWtCO0FBR3BDLFVBQU0sZUFBZTtBQUFBLE1BQ3BCLGdCQUFnQixZQUFZLDhCQUE4QixDQUFDLENBQUM7QUFBQSxNQUM1RDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsRUFBRTtBQUFBLElBQ0g7QUFDQSxXQUFPLFlBQVksYUFBYSxRQUFRLENBQUM7QUFDekMsVUFBTSxRQUFRLGFBQWEsQ0FBQztBQUM1QixXQUFPLEdBQUcsTUFBTSxTQUFTLFlBQVksTUFBTSxPQUFPLFNBQVMsV0FBVyxnQkFBZ0I7QUFDdEYsV0FBTyxZQUFZLE1BQU0sT0FBTyxLQUFLLE1BQU0saUJBQWlCLFNBQVM7QUFDckUsVUFBTSxTQUFTLE1BQU0sT0FBTyxLQUFLO0FBRWpDLFVBQU0sZUFBZTtBQUFBLE1BQ3BCLGdCQUFnQixZQUFZLGtCQUFrQixHQUFHLFdBQVcsQ0FBQztBQUFBLE1BQzdEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxFQUFFO0FBQUEsSUFDSDtBQUNBLFdBQU8sZ0JBQWdCLGNBQWMsQ0FBQztBQUFBLE1BQ3JDLE1BQU07QUFBQSxNQUNOLFVBQVU7QUFBQSxNQUNWLFFBQVE7QUFBQSxRQUNQLE1BQU0sV0FBVztBQUFBLFFBQ2pCLFFBQVE7QUFBQSxRQUNSO0FBQUEsUUFDQSxTQUFTO0FBQUEsTUFDVjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBSUQsT0FBSyx1RkFBa0YsTUFBTTtBQUM1RixVQUFNLE1BQU0sSUFBSSxvQkFBb0I7QUFDcEMsVUFBTSxRQUFRLElBQUksa0JBQWtCO0FBR3BDLFVBQU0sVUFBVTtBQUFBLE1BQ2YsZ0JBQWdCLFlBQVksNkJBQTZCLEdBQUcsUUFBUSxNQUFNLENBQUM7QUFBQSxNQUMzRTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsRUFBRTtBQUFBLElBQ0g7QUFFQSxXQUFPLGdCQUFnQixTQUFTLENBQUM7QUFBQSxNQUNoQyxNQUFNO0FBQUEsTUFDTixVQUFVO0FBQUEsTUFDVixRQUFRO0FBQUEsUUFDUCxNQUFNLFdBQVc7QUFBQSxRQUNqQixRQUFRO0FBQUEsUUFDUixZQUFZO0FBQUEsUUFDWixVQUFVO0FBQUEsUUFDVixhQUFhO0FBQUEsTUFDZDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsV0FBTyxnQkFBZ0IsSUFBSSxPQUFPLENBQUMsQ0FBQztBQUFBLEVBQ3JDLENBQUM7QUFFRCxPQUFLLDZGQUF3RixNQUFNO0FBT2xHLFVBQU0sTUFBTSxJQUFJLG9CQUFvQjtBQUNwQyxVQUFNLFFBQVEsSUFBSSxrQkFBa0I7QUFDcEMsVUFBTSxZQUFZO0FBRWxCLFVBQU0sVUFBVTtBQUFBLE1BQ2YsZ0JBQWdCLFlBQVksNkJBQTZCLEdBQUcsUUFBUSx1QkFBdUIsQ0FBQztBQUFBLE1BQzVGO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxFQUFFO0FBQUEsTUFDRixNQUFNO0FBQUEsSUFDUDtBQUVBLFdBQU8sZ0JBQWdCLFNBQVMsQ0FBQztBQUFBLE1BQ2hDLE1BQU07QUFBQSxNQUNOLFVBQVU7QUFBQSxNQUNWLFFBQVE7QUFBQSxRQUNQLE1BQU0sV0FBVztBQUFBLFFBQ2pCLFFBQVE7QUFBQSxRQUNSLFlBQVk7QUFBQSxRQUNaLFVBQVU7QUFBQSxRQUNWLGFBQWE7QUFBQSxRQUNiLGFBQWEsRUFBRSxNQUFNLHdCQUF3QixRQUFRLFVBQVUsVUFBVTtBQUFBLE1BQzFFO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixXQUFPLGdCQUFnQixJQUFJLE9BQU8sQ0FBQyxDQUFDO0FBQUEsRUFDckMsQ0FBQztBQUVELE9BQUssZ0ZBQTJFLE1BQU07QUFDckYsVUFBTSxNQUFNLElBQUksZUFBZTtBQUMvQixVQUFNLFFBQVEsSUFBSSxrQkFBa0I7QUFDcEMsVUFBTSxXQUFXLEVBQUU7QUFFbkIsZ0NBQTRCLGdCQUFnQixZQUFZLDZCQUE2QixHQUFHLFFBQVEsTUFBTSxDQUFDLEdBQUcsU0FBUyxTQUFTLE9BQU8sS0FBSyxRQUFRO0FBQ2hKLGdDQUE0QixnQkFBZ0IsWUFBWSxxQkFBcUIsQ0FBQyxDQUFDLEdBQUcsU0FBUyxTQUFTLE9BQU8sS0FBSyxRQUFRO0FBRXhILFVBQU0sVUFBVTtBQUFBLE1BQ2YsMEJBQTBCLFlBQVksUUFBUSw4QkFBOEIsRUFBRSxTQUFTLEtBQUssQ0FBQztBQUFBLE1BQzdGO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxFQUFFO0FBQUEsSUFDSDtBQUVBLFVBQU0sU0FBUyxRQUFRLENBQUM7QUFDeEIsUUFBSSxPQUFPLFNBQVMsWUFBWSxPQUFPLE9BQU8sU0FBUyxXQUFXLHNCQUFzQjtBQUN2RixZQUFNLElBQUksTUFBTSwrQ0FBK0MsT0FBTyxJQUFJLEVBQUU7QUFBQSxJQUM3RTtBQUNBLFdBQU8sWUFBWSxPQUFPLE9BQU8sT0FBTyxTQUFTLEtBQUs7QUFDdEQsV0FBTyxnQkFBZ0IsT0FBTyxPQUFPLE9BQU8sT0FBTyxFQUFFLFNBQVMsOEJBQThCLE1BQU0sU0FBUyxDQUFDO0FBQUEsRUFDN0csQ0FBQztBQUVELE9BQUssNEZBQXVGLE1BQU07QUFDakcsVUFBTSxNQUFNLElBQUksZUFBZTtBQUMvQixVQUFNLFFBQVEsSUFBSSxrQkFBa0I7QUFDcEMsVUFBTSxXQUFXLEVBQUU7QUFHbkIsZ0NBQTRCLGdCQUFnQixZQUFZLDZCQUE2QixHQUFHLFFBQVEsTUFBTSxDQUFDLEdBQUcsU0FBUyxTQUFTLE9BQU8sS0FBSyxRQUFRO0FBRWhKLFVBQU0sVUFBVTtBQUFBLE1BQ2YsZ0JBQWdCLFlBQVksbUJBQW1CLEdBQUcsV0FBVyxDQUFDO0FBQUEsTUFDOUQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEVBQUU7QUFBQSxJQUNIO0FBRUEsV0FBTyxnQkFBZ0IsU0FBUyxDQUFDO0FBQUEsTUFDaEMsTUFBTTtBQUFBLE1BQ04sVUFBVTtBQUFBLE1BQ1YsUUFBUTtBQUFBLFFBQ1AsTUFBTSxXQUFXO0FBQUEsUUFDakIsUUFBUTtBQUFBLFFBQ1IsWUFBWTtBQUFBLFFBQ1osU0FBUztBQUFBLE1BQ1Y7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUVELE9BQUssZ0VBQWdFLE1BQU07QUFDMUUsWUFBUSxNQUFNLGNBQWMsRUFBRSxRQUFRLENBQUMsYUFBYSxFQUFFLENBQUM7QUFDdkQsVUFBTSxNQUFNLElBQUksZUFBZTtBQUMvQixVQUFNLFFBQVEsSUFBSSxrQkFBa0I7QUFDcEMsVUFBTSxXQUFXLEVBQUU7QUFDbkIsZ0NBQTRCLGdCQUFnQixZQUFZLDZCQUE2QixHQUFHLFlBQVksT0FBTyxDQUFDLEdBQUcsU0FBUyxTQUFTLE9BQU8sS0FBSyxRQUFRO0FBRXJKLFVBQU0sUUFBUTtBQUFBLE1BQ2IsZ0JBQWdCLFlBQVksbUJBQW1CLEdBQUcsaURBQWlELENBQUM7QUFBQSxNQUNwRztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0EsVUFBTSxLQUFLLGtDQUFrQztBQUM3QyxVQUFNLFNBQVM7QUFBQSxNQUNkLGdCQUFnQixZQUFZLG1CQUFtQixHQUFHLHlCQUF5QixDQUFDO0FBQUEsTUFDNUU7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUVBLFdBQU8sZ0JBQWdCLENBQUMsR0FBRyxPQUFPLEdBQUcsTUFBTSxHQUFHO0FBQUEsTUFDN0M7QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLFVBQVU7QUFBQSxRQUNWLFFBQVE7QUFBQSxVQUNQLE1BQU0sV0FBVztBQUFBLFVBQ2pCLFFBQVE7QUFBQSxVQUNSLFlBQVk7QUFBQSxVQUNaLFNBQVM7QUFBQSxVQUNULG1CQUFtQixFQUFFLFVBQVUsa0RBQWtEO0FBQUEsUUFDbEY7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTTtBQUFBLFFBQ04sVUFBVTtBQUFBLFFBQ1YsUUFBUTtBQUFBLFVBQ1AsTUFBTSxXQUFXO0FBQUEsVUFDakIsUUFBUTtBQUFBLFVBQ1IsWUFBWTtBQUFBLFVBQ1osU0FBUztBQUFBLFVBQ1QsbUJBQW1CLEVBQUUsVUFBVSxrREFBa0Q7QUFBQSxRQUNsRjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHlGQUF5RixNQUFNO0FBQ25HLFlBQVEsTUFBTSxjQUFjLEVBQUUsUUFBUSxDQUFDLGFBQWEsRUFBRSxDQUFDO0FBQ3ZELFVBQU0sTUFBTSxJQUFJLGVBQWU7QUFDL0IsVUFBTSxRQUFRLElBQUksa0JBQWtCO0FBQ3BDLFVBQU0sV0FBVyxFQUFFO0FBQ25CLGdDQUE0QixnQkFBZ0IsWUFBWSw2QkFBNkIsR0FBRyxZQUFZLE9BQU8sQ0FBQyxHQUFHLFNBQVMsU0FBUyxPQUFPLEtBQUssUUFBUTtBQUVySixVQUFNLFFBQVE7QUFBQSxNQUNiLGdCQUFnQixZQUFZLG1CQUFtQixHQUFHLDJDQUEyQyxDQUFDO0FBQUEsTUFDOUY7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0saUJBQWlCO0FBQUEsTUFDdEIsZ0JBQWdCLFlBQVksbUJBQW1CLEdBQUcsVUFBVSxDQUFDO0FBQUEsTUFDN0Q7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0sVUFBVTtBQUFBLE1BQ2YsZ0JBQWdCLFlBQVkscUJBQXFCLENBQUMsQ0FBQztBQUFBLE1BQ25EO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFFQSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLE9BQU8sTUFBTSxJQUFJLFlBQVUsT0FBTyxTQUFTLFdBQVcsT0FBTyxTQUFTLE1BQVM7QUFBQSxNQUMvRTtBQUFBLE1BQ0EsU0FBUyxRQUFRLElBQUksWUFBVSxPQUFPLFNBQVMsV0FBVyxPQUFPLFNBQVMsTUFBUztBQUFBLElBQ3BGLEdBQUc7QUFBQSxNQUNGLE9BQU8sQ0FBQztBQUFBLFFBQ1AsTUFBTSxXQUFXO0FBQUEsUUFDakIsUUFBUTtBQUFBLFFBQ1IsWUFBWTtBQUFBLFFBQ1osU0FBUztBQUFBLFFBQ1QsbUJBQW1CLEVBQUUsVUFBVSxpREFBaUQ7QUFBQSxNQUNqRixDQUFDO0FBQUEsTUFDRCxnQkFBZ0IsQ0FBQztBQUFBLE1BQ2pCLFNBQVMsQ0FBQztBQUFBLFFBQ1QsTUFBTSxXQUFXO0FBQUEsUUFDakIsUUFBUTtBQUFBLFFBQ1IsWUFBWTtBQUFBLFFBQ1osU0FBUztBQUFBLFFBQ1QsbUJBQW1CLEVBQUUsVUFBVSxrREFBa0Q7QUFBQSxNQUNsRixHQUFHO0FBQUEsUUFDRixNQUFNLFdBQVc7QUFBQSxRQUNqQixRQUFRO0FBQUEsUUFDUixZQUFZO0FBQUEsUUFDWixtQkFBbUIsRUFBRSxVQUFVLHVDQUF1QztBQUFBLFFBQ3RFLFdBQVc7QUFBQSxRQUNYLFdBQVcsMkJBQTJCO0FBQUEsTUFDdkMsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOEZBQThGLE1BQU07QUFDeEcsVUFBTSxRQUFRLElBQUksa0JBQWtCO0FBQ3BDLFVBQU0sV0FBVyxFQUFFO0FBQ25CLFVBQU0sUUFBUTtBQUFBLE1BQ2IsZ0JBQWdCLFlBQVksNkJBQTZCLEdBQUcsbUJBQW1CLG9CQUFvQixDQUFDO0FBQUEsTUFDcEc7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsSUFBSSxlQUFlO0FBQUEsTUFDbkI7QUFBQSxNQUNBLE1BQU07QUFBQSxJQUNQO0FBRUEsVUFBTSxRQUFRO0FBQUEsTUFDYixnQkFBZ0IsWUFBWSxtQkFBbUIsR0FBRywwQkFBMEIsQ0FBQztBQUFBLE1BQzdFO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLElBQUksZUFBZTtBQUFBLE1BQ25CO0FBQUEsSUFDRDtBQUNBLFVBQU0sUUFBUTtBQUFBLE1BQ2IsZ0JBQWdCLFlBQVkscUJBQXFCLENBQUMsQ0FBQztBQUFBLE1BQ25EO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLElBQUksZUFBZTtBQUFBLE1BQ25CO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVztBQUFBLE1BQ2hCLDBCQUEwQixZQUFZLG1CQUFtQixNQUFNO0FBQUEsTUFDL0Q7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsSUFBSSxlQUFlO0FBQUEsTUFDbkI7QUFBQSxJQUNEO0FBRUEsV0FBTyxnQkFBZ0IsQ0FBQyxHQUFHLE9BQU8sR0FBRyxPQUFPLEdBQUcsT0FBTyxHQUFHLFFBQVEsR0FBRztBQUFBLE1BQ25FO0FBQUEsUUFDQyxNQUFNO0FBQUEsUUFDTixVQUFVO0FBQUEsUUFDVixRQUFRO0FBQUEsVUFDUCxNQUFNLFdBQVc7QUFBQSxVQUNqQixRQUFRO0FBQUEsVUFDUixZQUFZO0FBQUEsVUFDWixVQUFVO0FBQUEsVUFDVixhQUFhO0FBQUEsVUFDYixhQUFhLEVBQUUsTUFBTSx3QkFBd0IsUUFBUSxVQUFVLFdBQVc7QUFBQSxRQUMzRTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNO0FBQUEsUUFDTixVQUFVO0FBQUEsUUFDVixRQUFRO0FBQUEsVUFDUCxNQUFNLFdBQVc7QUFBQSxVQUNqQixRQUFRO0FBQUEsVUFDUixZQUFZO0FBQUEsVUFDWixTQUFTO0FBQUEsUUFDVjtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNO0FBQUEsUUFDTixVQUFVO0FBQUEsUUFDVixRQUFRO0FBQUEsVUFDUCxNQUFNLFdBQVc7QUFBQSxVQUNqQixRQUFRO0FBQUEsVUFDUixZQUFZO0FBQUEsVUFDWixtQkFBbUI7QUFBQSxVQUNuQixXQUFXO0FBQUEsVUFDWCxXQUFXLDJCQUEyQjtBQUFBLFFBQ3ZDO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLFVBQVU7QUFBQSxRQUNWLFFBQVE7QUFBQSxVQUNQLE1BQU0sV0FBVztBQUFBLFVBQ2pCLFFBQVE7QUFBQSxVQUNSLFlBQVk7QUFBQSxVQUNaLFFBQVE7QUFBQSxZQUNQLFNBQVM7QUFBQSxZQUNULGtCQUFrQjtBQUFBLFlBQ2xCLFNBQVMsQ0FBQyxFQUFFLE1BQU0sc0JBQXNCLE1BQU0sTUFBTSxPQUFPLENBQUM7QUFBQSxVQUM3RDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxvR0FBK0YsTUFBTTtBQUN6RyxVQUFNLE1BQU0sSUFBSSxvQkFBb0I7QUFDcEMsVUFBTSxRQUFRLElBQUksa0JBQWtCO0FBQ3BDLFVBQU0sV0FBVyxFQUFFO0FBUW5CLGdDQUE0QixnQkFBZ0IsWUFBWSw2QkFBNkIsR0FBRyxRQUFRLE1BQU0sQ0FBQyxHQUFHLFNBQVMsU0FBUyxPQUFPLEtBQUssUUFBUTtBQUNoSixnQ0FBNEIsZ0JBQWdCLFlBQVksbUJBQW1CLEdBQUcsMEJBQTBCLENBQUMsR0FBRyxTQUFTLFNBQVMsT0FBTyxLQUFLLFFBQVE7QUFDbEosVUFBTSxVQUFVLDRCQUE0QixnQkFBZ0IsWUFBWSxxQkFBcUIsQ0FBQyxDQUFDLEdBQUcsU0FBUyxTQUFTLE9BQU8sS0FBSyxRQUFRO0FBRXhJLFdBQU8sZ0JBQWdCLFNBQVMsQ0FBQztBQUFBLE1BQ2hDLE1BQU07QUFBQSxNQUNOLFVBQVU7QUFBQSxNQUNWLFFBQVE7QUFBQSxRQUNQLE1BQU0sV0FBVztBQUFBLFFBQ2pCLFFBQVE7QUFBQSxRQUNSLFlBQVk7QUFBQSxRQUNaLG1CQUFtQixFQUFFLFVBQVUsdUJBQXVCO0FBQUEsUUFDdEQsV0FBVztBQUFBLFFBQ1gsV0FBVywyQkFBMkI7QUFBQSxRQUN0QyxPQUFPLEVBQUUsVUFBVSxXQUFXO0FBQUEsTUFDL0I7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFdBQU8sZ0JBQWdCLElBQUksT0FBTyxDQUFDLENBQUM7QUFBQSxFQUNyQyxDQUFDO0FBRUQsT0FBSyxvR0FBK0YsTUFBTTtBQUN6RyxVQUFNLE1BQU0sSUFBSSxvQkFBb0I7QUFDcEMsVUFBTSxRQUFRLElBQUksa0JBQWtCO0FBQ3BDLFVBQU0sV0FBVyxFQUFFO0FBT25CLGdDQUE0QixnQkFBZ0IsWUFBWSw2QkFBNkIsR0FBRyxRQUFRLE1BQU0sQ0FBQyxHQUFHLFNBQVMsU0FBUyxPQUFPLEtBQUssUUFBUTtBQUNoSixnQ0FBNEIsZ0JBQWdCLFlBQVkscUJBQXFCLENBQUMsQ0FBQyxHQUFHLFNBQVMsU0FBUyxPQUFPLEtBQUssUUFBUTtBQUV4SCxVQUFNLFVBQVU7QUFBQSxNQUNmLDBCQUEwQixZQUFZLFFBQVEsZUFBZTtBQUFBLE1BQzdEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxFQUFFO0FBQUEsSUFDSDtBQUVBLFdBQU8sZ0JBQWdCLFNBQVMsQ0FBQztBQUFBLE1BQ2hDLE1BQU07QUFBQSxNQUNOLFVBQVU7QUFBQSxNQUNWLFFBQVE7QUFBQSxRQUNQLE1BQU0sV0FBVztBQUFBLFFBQ2pCLFFBQVE7QUFBQSxRQUNSLFlBQVk7QUFBQSxRQUNaLFFBQVE7QUFBQSxVQUNQLFNBQVM7QUFBQSxVQUNULGtCQUFrQjtBQUFBLFVBQ2xCLFNBQVMsQ0FBQyxFQUFFLE1BQU0sc0JBQXNCLE1BQU0sTUFBTSxnQkFBZ0IsQ0FBQztBQUFBLFFBQ3RFO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsV0FBTyxnQkFBZ0IsSUFBSSxPQUFPLENBQUMsQ0FBQztBQUFBLEVBQ3JDLENBQUM7QUFFRCxPQUFLLGdGQUEyRSxNQUFNO0FBQ3JGLFVBQU0sTUFBTSxJQUFJLG9CQUFvQjtBQUNwQyxVQUFNLFFBQVEsSUFBSSxrQkFBa0I7QUFHcEMsVUFBTSxVQUFVO0FBQUEsTUFDZiwwQkFBMEIsWUFBWSxjQUFjLGdCQUFnQjtBQUFBLE1BQ3BFO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxFQUFFO0FBQUEsSUFDSDtBQUVBLFdBQU8sZ0JBQWdCLFNBQVMsQ0FBQyxDQUFDO0FBQ2xDLFdBQU8sWUFBWSxJQUFJLE1BQU0sUUFBUSxDQUFDO0FBQ3RDLFdBQU8sR0FBRyxJQUFJLE1BQU0sQ0FBQyxFQUFFLFNBQVMsZ0RBQWdELENBQUM7QUFBQSxFQUNsRixDQUFDO0FBRUQsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxVQUFNLE1BQU0sSUFBSSxlQUFlO0FBQy9CLFVBQU0sUUFBUSxJQUFJLGtCQUFrQjtBQUNwQyxVQUFNLFdBQVcsRUFBRTtBQUVuQixnQ0FBNEIsZ0JBQWdCLFlBQVksNkJBQTZCLEdBQUcsVUFBVSxNQUFNLENBQUMsR0FBRyxTQUFTLFNBQVMsT0FBTyxLQUFLLFFBQVE7QUFFbEosVUFBTSxVQUFVO0FBQUEsTUFDZiwwQkFBMEIsWUFBWSxVQUFVLHFCQUFxQixFQUFFLFNBQVMsS0FBSyxDQUFDO0FBQUEsTUFDdEY7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEVBQUU7QUFBQSxJQUNIO0FBRUEsV0FBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLFVBQU0sV0FBVyxRQUFRLENBQUM7QUFDMUIsV0FBTyxHQUFHLFNBQVMsU0FBUyxZQUFZLFNBQVMsT0FBTyxTQUFTLFdBQVcsb0JBQW9CO0FBQ2hHLFdBQU8sWUFBWSxTQUFTLE9BQU8sT0FBTyxTQUFTLEtBQUs7QUFJeEQsV0FBTyxZQUFZLFNBQVMsT0FBTyxPQUFPLE9BQU8sTUFBTSxNQUFTO0FBQUEsRUFDakUsQ0FBQztBQUVELE9BQUssNkVBQTZFLE1BQU07QUFDdkYsVUFBTSxNQUFNLElBQUksZUFBZTtBQUMvQixVQUFNLFFBQVEsSUFBSSxrQkFBa0I7QUFDcEMsVUFBTSxXQUFXLEVBQUU7QUFFbkIsZ0NBQTRCLGdCQUFnQixZQUFZLDZCQUE2QixHQUFHLFFBQVEsTUFBTSxDQUFDLEdBQUcsU0FBUyxTQUFTLE9BQU8sS0FBSyxRQUFRO0FBRWhKLFVBQU0sVUFBVTtBQUFBLE1BQ2YsMEJBQTBCLFlBQVksUUFBUTtBQUFBLFFBQzdDLEVBQUUsTUFBTSxRQUFRLE1BQU0sUUFBUTtBQUFBLFFBQzlCLEVBQUUsTUFBTSxRQUFRLE1BQU0sU0FBUztBQUFBLE1BQ2hDLENBQUM7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxFQUFFO0FBQUEsSUFDSDtBQUVBLFVBQU0sV0FBVyxRQUFRLENBQUM7QUFDMUIsV0FBTyxHQUFHLFNBQVMsU0FBUyxZQUFZLFNBQVMsT0FBTyxTQUFTLFdBQVcsb0JBQW9CO0FBQ2hHLFdBQU8sZ0JBQWdCLFNBQVMsT0FBTyxPQUFPLFNBQVM7QUFBQSxNQUN0RCxFQUFFLE1BQU0sc0JBQXNCLE1BQU0sTUFBTSxRQUFRO0FBQUEsTUFDbEQsRUFBRSxNQUFNLHNCQUFzQixNQUFNLE1BQU0sU0FBUztBQUFBLElBQ3BELENBQUM7QUFBQSxFQUNGLENBQUM7QUFNRCxPQUFLLHNGQUFpRixNQUFNO0FBQzNGLFVBQU0sTUFBTSxJQUFJLGVBQWU7QUFDL0IsVUFBTSxRQUFRLElBQUksa0JBQWtCO0FBQ3BDLFVBQU0sV0FBVyxFQUFFO0FBRW5CLGdDQUE0QixnQkFBZ0IsWUFBWSw2QkFBNkIsR0FBRyxXQUFXLE9BQU8sQ0FBQyxHQUFHLFNBQVMsU0FBUyxPQUFPLEtBQUssUUFBUTtBQUVwSixVQUFNLFdBQVc7QUFBQSxNQUNoQixNQUFNLHNCQUFzQjtBQUFBLE1BQzVCLFFBQVEsRUFBRSxLQUFLLGlCQUFpQixTQUFTLEVBQUUsS0FBSywwQkFBMEIsRUFBRTtBQUFBLE1BQzVFLE9BQU8sRUFBRSxLQUFLLGlCQUFpQixTQUFTLEVBQUUsS0FBSyx5QkFBeUIsRUFBRTtBQUFBLE1BQzFFLE1BQU0sRUFBRSxPQUFPLEdBQUcsU0FBUyxFQUFFO0FBQUEsSUFDOUI7QUFDQSxVQUFNLGNBQWMsV0FBVyxRQUFRO0FBRXZDLFVBQU0sVUFBVTtBQUFBLE1BQ2YsMEJBQTBCLFlBQVksV0FBVyxZQUFZO0FBQUEsTUFDN0Q7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEVBQUU7QUFBQSxJQUNIO0FBRUEsVUFBTSxXQUFXLFFBQVEsQ0FBQztBQUMxQixXQUFPLEdBQUcsU0FBUyxTQUFTLFlBQVksU0FBUyxPQUFPLFNBQVMsV0FBVyxvQkFBb0I7QUFDaEcsV0FBTyxnQkFBZ0IsU0FBUyxPQUFPLE9BQU8sU0FBUztBQUFBLE1BQ3RELEVBQUUsTUFBTSxzQkFBc0IsTUFBTSxNQUFNLGFBQWE7QUFBQSxNQUN2RDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMEVBQXFFLE1BQU07QUFDL0UsVUFBTSxNQUFNLElBQUksZUFBZTtBQUMvQixVQUFNLFFBQVEsSUFBSSxrQkFBa0I7QUFDcEMsVUFBTSxXQUFXLEVBQUU7QUFFbkIsZ0NBQTRCLGdCQUFnQixZQUFZLDZCQUE2QixHQUFHLFdBQVcsTUFBTSxDQUFDLEdBQUcsU0FBUyxTQUFTLE9BQU8sS0FBSyxRQUFRO0FBRW5KLFVBQU0sVUFBVTtBQUFBLE1BQ2YsMEJBQTBCLFlBQVksV0FBVyxlQUFlO0FBQUEsTUFDaEU7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEVBQUU7QUFBQSxJQUNIO0FBRUEsVUFBTSxXQUFXLFFBQVEsQ0FBQztBQUMxQixXQUFPLEdBQUcsU0FBUyxTQUFTLFlBQVksU0FBUyxPQUFPLFNBQVMsV0FBVyxvQkFBb0I7QUFDaEcsV0FBTyxnQkFBZ0IsU0FBUyxPQUFPLE9BQU8sU0FBUztBQUFBLE1BQ3RELEVBQUUsTUFBTSxzQkFBc0IsTUFBTSxNQUFNLGdCQUFnQjtBQUFBLElBQzNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1GQUE4RSxNQUFNO0FBQ3hGLFVBQU0sUUFBUSxJQUFJLGtCQUFrQjtBQUVwQyxXQUFPLFlBQVksTUFBTSxhQUFhLFFBQVEsR0FBRyxNQUFTO0FBRTFELFVBQU0sV0FBVztBQUFBLE1BQ2hCLE1BQU0sc0JBQXNCO0FBQUEsTUFDNUIsUUFBUSxFQUFFLEtBQUssaUJBQWlCLFNBQVMsRUFBRSxLQUFLLHdCQUF3QixFQUFFO0FBQUEsTUFDMUUsT0FBTyxFQUFFLEtBQUssaUJBQWlCLFNBQVMsRUFBRSxLQUFLLHVCQUF1QixFQUFFO0FBQUEsTUFDeEUsTUFBTTtBQUFBLElBQ1A7QUFDQSxVQUFNLGNBQWMsUUFBUSxRQUFRO0FBQ3BDLFdBQU8sWUFBWSxNQUFNLGFBQWEsTUFBTSxHQUFHLFFBQVE7QUFFdkQsV0FBTyxZQUFZLE1BQU0sYUFBYSxNQUFNLEdBQUcsTUFBUztBQUFBLEVBQ3pELENBQUM7QUFJRCxPQUFLLHVHQUF1RyxNQUFNO0FBQ2pILFVBQU0sTUFBTSxJQUFJLG9CQUFvQjtBQUNwQyxVQUFNLFFBQVEsSUFBSSxrQkFBa0I7QUFHcEMsVUFBTSxVQUFVO0FBQUEsTUFDZixxQkFBcUIsWUFBWTtBQUFBLFFBQ2hDLEVBQUUsTUFBTSxRQUFRLE1BQU0sU0FBUyxXQUFXLEtBQUs7QUFBQSxRQUMvQyxFQUFFLE1BQU0sWUFBWSxJQUFJLFFBQVEsTUFBTSxRQUFRLE9BQU8sQ0FBQyxFQUFFO0FBQUEsTUFDekQsQ0FBQztBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEVBQUU7QUFBQSxJQUNIO0FBRUEsV0FBTyxnQkFBZ0IsU0FBUyxDQUFDLENBQUM7QUFDbEMsV0FBTyxnQkFBZ0IsSUFBSSxPQUFPLENBQUMsQ0FBQztBQUFBLEVBQ3JDLENBQUM7QUFFRCxPQUFLLGlGQUFpRixNQUFNO0FBQzNGLFVBQU0sTUFBTSxJQUFJLG9CQUFvQjtBQUNwQyxVQUFNLFFBQVEsSUFBSSxrQkFBa0I7QUFHcEMsVUFBTSxVQUFVO0FBQUEsTUFDZixxQkFBcUIsWUFBWSxDQUFDLEVBQUUsTUFBTSxRQUFRLE1BQU0sZ0JBQWdCLFdBQVcsS0FBSyxDQUFDLENBQUM7QUFBQSxNQUMxRjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsRUFBRTtBQUFBLElBQ0g7QUFFQSxXQUFPLGdCQUFnQixTQUFTLENBQUMsQ0FBQztBQUNsQyxXQUFPLGdCQUFnQixJQUFJLE9BQU8sQ0FBQyxDQUFDO0FBQUEsRUFDckMsQ0FBQztBQUVELE9BQUssMkdBQTJHLE1BQU07QUFDckgsVUFBTSxTQUFTLGtCQUFrQixVQUFVO0FBQzNDLFdBQU8sTUFBTSxlQUFlO0FBQzVCLFdBQU8sTUFBTSxnQkFBZ0I7QUFDN0IsV0FBTyxNQUFNLDBCQUEwQjtBQUN2QyxXQUFPLGFBQWE7QUFBQSxNQUNuQixlQUFlO0FBQUEsUUFDZCxhQUFhO0FBQUEsUUFDYixjQUFjO0FBQUEsUUFDZCxzQkFBc0I7QUFBQSxRQUN0QiwwQkFBMEI7QUFBQSxRQUMxQixtQkFBbUI7QUFBQSxRQUNuQixTQUFTO0FBQUEsUUFDVCxlQUFlO0FBQUEsUUFDZixpQkFBaUI7QUFBQSxNQUNsQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFVBQVUsNEJBQTRCLFFBQVEsU0FBUyxTQUFTLElBQUksa0JBQWtCLEdBQUcsSUFBSSxlQUFlLEdBQUcsRUFBRSxDQUFDO0FBT3hILFdBQU8sZ0JBQWdCLFNBQVM7QUFBQSxNQUMvQjtBQUFBLFFBQ0MsTUFBTTtBQUFBLFFBQ04sVUFBVTtBQUFBLFFBQ1YsUUFBUTtBQUFBLFVBQ1AsTUFBTSxXQUFXO0FBQUEsVUFDakIsUUFBUTtBQUFBLFVBQ1IsT0FBTztBQUFBLFlBQ04sYUFBYTtBQUFBLFlBQ2IsY0FBYztBQUFBLFlBQ2QsaUJBQWlCO0FBQUEsWUFDakIsT0FBTztBQUFBLFVBQ1I7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOERBQThELE1BQU07QUFJeEUsVUFBTSxTQUFTLGtCQUFrQixVQUFVO0FBQzNDLFdBQU8saUJBQWlCO0FBRXhCLFVBQU0sVUFBVSw0QkFBNEIsUUFBUSxTQUFTLFNBQVMsSUFBSSxrQkFBa0IsR0FBRyxJQUFJLGVBQWUsR0FBRyxFQUFFLENBQUM7QUFFeEgsV0FBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLFVBQU0sUUFBUSxRQUFRLENBQUM7QUFDdkIsV0FBTyxHQUFHLE1BQU0sU0FBUyxZQUFZLE1BQU0sT0FBTyxTQUFTLFdBQVcsU0FBUztBQUMvRSxXQUFPLFlBQVksTUFBTSxPQUFPLE1BQU0sT0FBTyxNQUFTO0FBQUEsRUFDdkQsQ0FBQztBQUVELE9BQUssd0VBQXdFLE1BQU07QUFDbEYsVUFBTSxTQUFTLGtCQUFrQixVQUFVO0FBQzNDLFdBQU8sYUFBYSxDQUFDO0FBRXJCLFVBQU0sVUFBVSw0QkFBNEIsUUFBUSxTQUFTLFNBQVMsSUFBSSxrQkFBa0IsR0FBRyxJQUFJLGVBQWUsR0FBRyxFQUFFLENBQUM7QUFFeEgsV0FBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLFVBQU0sUUFBUSxRQUFRLENBQUM7QUFDdkIsV0FBTyxHQUFHLE1BQU0sU0FBUyxZQUFZLE1BQU0sT0FBTyxTQUFTLFdBQVcsU0FBUztBQUMvRSxXQUFPLFlBQVksTUFBTSxPQUFPLE1BQU0sT0FBTyxNQUFTO0FBQUEsRUFDdkQsQ0FBQztBQUVELE9BQUssc0dBQXNHLE1BQU07QUFDaEgsVUFBTSxNQUFNLElBQUksb0JBQW9CO0FBQ3BDLFVBQU0sUUFBUSxJQUFJLGtCQUFrQjtBQUVwQyxVQUFNLGNBQWM7QUFHcEI7QUFBQSxNQUNDLGdCQUFnQixZQUFZLDZCQUE2QixHQUFHLGFBQWEsTUFBTSxDQUFDO0FBQUEsTUFDaEY7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEVBQUU7QUFBQSxJQUNIO0FBR0EsVUFBTSxnQkFBZ0I7QUFBQSxNQUNyQixrQkFBa0IsVUFBVTtBQUFBLE1BQzVCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxFQUFFO0FBQUEsSUFDSDtBQUVBLFdBQU8sWUFBWSxjQUFjLFFBQVEsQ0FBQztBQUMxQyxXQUFPLFlBQVksSUFBSSxNQUFNLFFBQVEsQ0FBQztBQUN0QyxXQUFPLEdBQUcsSUFBSSxNQUFNLENBQUMsRUFBRSxTQUFTLFdBQVcsR0FBRyw0Q0FBNEMsSUFBSSxNQUFNLENBQUMsQ0FBQyxFQUFFO0FBQ3hHLFdBQU8sR0FBRyxJQUFJLE1BQU0sQ0FBQyxFQUFFLFNBQVMsTUFBTSxHQUFHLDRDQUE0QyxJQUFJLE1BQU0sQ0FBQyxDQUFDLEVBQUU7QUFJbkcsVUFBTSxjQUFjO0FBQUEsTUFDbkIsMEJBQTBCLFlBQVksYUFBYSxjQUFjO0FBQUEsTUFDakU7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEVBQUU7QUFBQSxJQUNIO0FBRUEsV0FBTyxnQkFBZ0IsYUFBYSxDQUFDLENBQUM7QUFDdEMsV0FBTyxZQUFZLElBQUksTUFBTSxRQUFRLENBQUM7QUFDdEMsV0FBTyxHQUFHLElBQUksTUFBTSxDQUFDLEVBQUUsU0FBUyx1Q0FBdUMsV0FBVyxFQUFFLENBQUM7QUFBQSxFQUN0RixDQUFDO0FBR0QsT0FBSyx1REFBdUQsTUFBTTtBQUNqRSxVQUFNLE1BQU0sSUFBSSxlQUFlO0FBQy9CLFVBQU0sUUFBUSxJQUFJLGtCQUFrQjtBQUdwQyxVQUFNLE9BQU87QUFBQSxNQUNaLGdCQUFnQixZQUFZLGdCQUFnQixDQUFDO0FBQUEsTUFDN0M7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEVBQUU7QUFBQSxJQUNIO0FBQ0EsV0FBTyxnQkFBZ0IsTUFBTSxDQUFDLENBQUM7QUFBQSxFQUNoQyxDQUFDO0FBRUQsT0FBSyxvR0FBb0csTUFBTTtBQUM5RyxVQUFNLE1BQU0sSUFBSSxlQUFlO0FBQy9CLFVBQU0sUUFBUSxJQUFJLGtCQUFrQjtBQUNwQyxVQUFNLFdBQVcsRUFBRTtBQUVuQixVQUFNLFFBQVEsNEJBQTRCLGdCQUFnQixZQUFZLDBCQUEwQixDQUFDLENBQUMsR0FBRyxTQUFTLFNBQVMsT0FBTyxLQUFLLFFBQVE7QUFDM0ksVUFBTSxTQUFTLDRCQUE0QixnQkFBZ0IsWUFBWSw4QkFBOEIsQ0FBQyxDQUFDLEdBQUcsU0FBUyxTQUFTLE9BQU8sS0FBSyxRQUFRO0FBRWhKLFVBQU0sYUFBYSxNQUFNLENBQUM7QUFDMUIsVUFBTSxjQUFjLE9BQU8sQ0FBQztBQUM1QixXQUFPLEdBQUcsV0FBVyxTQUFTLFlBQVksV0FBVyxPQUFPLFNBQVMsV0FBVyxnQkFBZ0I7QUFDaEcsV0FBTyxHQUFHLFlBQVksU0FBUyxZQUFZLFlBQVksT0FBTyxTQUFTLFdBQVcsZ0JBQWdCO0FBQ2xHLFdBQU8sWUFBWSxXQUFXLE9BQU8sS0FBSyxNQUFNLGlCQUFpQixRQUFRO0FBQ3pFLFdBQU8sWUFBWSxZQUFZLE9BQU8sS0FBSyxNQUFNLGlCQUFpQixTQUFTO0FBQzNFLFVBQU0sYUFBYSxXQUFXLE9BQU8sS0FBSztBQUMxQyxVQUFNLGNBQWMsWUFBWSxPQUFPLEtBQUs7QUFDNUMsV0FBTyxlQUFlLFlBQVksV0FBVztBQUU3QyxVQUFNLFFBQVEsNEJBQTRCLGdCQUFnQixZQUFZLGNBQWMsR0FBRyxHQUFHLENBQUMsR0FBRyxTQUFTLFNBQVMsT0FBTyxLQUFLLFFBQVE7QUFDcEksVUFBTSxTQUFTLDRCQUE0QixnQkFBZ0IsWUFBWSxrQkFBa0IsR0FBRyxHQUFHLENBQUMsR0FBRyxTQUFTLFNBQVMsT0FBTyxLQUFLLFFBQVE7QUFFekksV0FBTyxHQUFHLE1BQU0sQ0FBQyxFQUFFLFNBQVMsWUFBWSxNQUFNLENBQUMsRUFBRSxPQUFPLFNBQVMsV0FBVyxTQUFTO0FBQ3JGLFdBQU8sWUFBWSxNQUFNLENBQUMsRUFBRSxPQUFPLFFBQVEsVUFBVTtBQUNyRCxXQUFPLEdBQUcsT0FBTyxDQUFDLEVBQUUsU0FBUyxZQUFZLE9BQU8sQ0FBQyxFQUFFLE9BQU8sU0FBUyxXQUFXLGFBQWE7QUFDM0YsV0FBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLE9BQU8sUUFBUSxXQUFXO0FBQUEsRUFDeEQsQ0FBQztBQUVELE9BQUssOEZBQThGLE1BQU07QUFPeEcsVUFBTSxNQUFNLElBQUksZUFBZTtBQUMvQixVQUFNLFFBQVEsSUFBSSxrQkFBa0I7QUFDcEMsVUFBTSxXQUFXLEVBQUU7QUFFbkIsZ0NBQTRCLGdCQUFnQixZQUFZLGlCQUFpQixPQUFPLENBQUMsR0FBRyxTQUFTLFNBQVMsT0FBTyxLQUFLLFFBQVE7QUFDMUgsVUFBTSxhQUFhLDRCQUE0QixnQkFBZ0IsWUFBWSw4QkFBOEIsQ0FBQyxDQUFDLEdBQUcsU0FBUyxTQUFTLE9BQU8sS0FBSyxRQUFRO0FBQ3BKLFVBQU0sYUFBYSw0QkFBNEIsZ0JBQWdCLFlBQVksa0JBQWtCLEdBQUcsTUFBTSxDQUFDLEdBQUcsU0FBUyxTQUFTLE9BQU8sS0FBSyxRQUFRO0FBRWhKLGdDQUE0QixnQkFBZ0IsWUFBWSxpQkFBaUIsT0FBTyxDQUFDLEdBQUcsU0FBUyxTQUFTLE9BQU8sS0FBSyxRQUFRO0FBQzFILFVBQU0sWUFBWSw0QkFBNEIsZ0JBQWdCLFlBQVksMEJBQTBCLENBQUMsQ0FBQyxHQUFHLFNBQVMsU0FBUyxPQUFPLEtBQUssUUFBUTtBQUMvSSxVQUFNLFlBQVksNEJBQTRCLGdCQUFnQixZQUFZLGNBQWMsR0FBRyxNQUFNLENBQUMsR0FBRyxTQUFTLFNBQVMsT0FBTyxLQUFLLFFBQVE7QUFFM0ksVUFBTSxtQkFBbUIsV0FBVyxDQUFDO0FBQ3JDLFVBQU0sa0JBQWtCLFVBQVUsQ0FBQztBQUNuQyxXQUFPLEdBQUcsaUJBQWlCLFNBQVMsWUFBWSxpQkFBaUIsT0FBTyxTQUFTLFdBQVcsZ0JBQWdCO0FBQzVHLFdBQU8sR0FBRyxnQkFBZ0IsU0FBUyxZQUFZLGdCQUFnQixPQUFPLFNBQVMsV0FBVyxnQkFBZ0I7QUFDMUcsV0FBTyxZQUFZLGlCQUFpQixPQUFPLEtBQUssTUFBTSxpQkFBaUIsU0FBUztBQUNoRixXQUFPLFlBQVksZ0JBQWdCLE9BQU8sS0FBSyxNQUFNLGlCQUFpQixRQUFRO0FBQzlFLFVBQU0sY0FBYyxpQkFBaUIsT0FBTyxLQUFLO0FBQ2pELFVBQU0sYUFBYSxnQkFBZ0IsT0FBTyxLQUFLO0FBQy9DLFdBQU8sZUFBZSxhQUFhLFlBQVksNEVBQTRFO0FBRTNILFVBQU0sbUJBQW1CLFdBQVcsQ0FBQztBQUNyQyxVQUFNLGtCQUFrQixVQUFVLENBQUM7QUFDbkMsV0FBTyxHQUFHLGlCQUFpQixTQUFTLFlBQVksaUJBQWlCLE9BQU8sU0FBUyxXQUFXLGFBQWE7QUFDekcsV0FBTyxZQUFZLGlCQUFpQixPQUFPLFFBQVEsV0FBVztBQUM5RCxXQUFPLEdBQUcsZ0JBQWdCLFNBQVMsWUFBWSxnQkFBZ0IsT0FBTyxTQUFTLFdBQVcsU0FBUztBQUNuRyxXQUFPLFlBQVksZ0JBQWdCLE9BQU8sUUFBUSxVQUFVO0FBQUEsRUFDN0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
