import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { createCodexSessionMapState, extractUserInputText, mapAgentMessageDelta, mapCommandExecutionOutputDelta, mapFileChangePatchUpdated, mapItemCompleted, mapItemStarted, mapMcpToolCallProgress, mapReasoningSummaryPartAdded, mapReasoningSummaryTextDelta, mapReasoningTextDelta, mapTokenUsageUpdated, mapTurnCompleted, mapTurnStarted, resetCodexTurnMapState, turnStateFromStatus } from "../../../node/codex/codexMapAppServerEvents.js";
import { ActionType } from "../../../common/state/sessionActions.js";
import { chatReducer } from "../../../common/state/protocol/reducers.js";
import { ChatOriginKind, MessageKind, ResponsePartKind, SessionStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType, TurnState } from "../../../common/state/sessionState.js";
import { ActiveClientToolSet } from "../../../node/activeClientState.js";
function markdownPartContent(action) {
  return action?.type === ActionType.ChatResponsePart && action.part.kind === ResponsePartKind.Markdown ? action.part.content : void 0;
}
suite("codexMapAppServerEvents", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("turn/started emits ChatTurnStarted with user message text", () => {
    const state = createCodexSessionMapState();
    const actions = mapTurnStarted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [{
          type: "userMessage",
          id: "item_user",
          clientId: null,
          content: [{ type: "text", text: "hello", text_elements: [] }]
        }],
        itemsView: { type: "full" },
        status: "inProgress",
        error: null,
        startedAt: 1752012321,
        completedAt: null,
        durationMs: null
      }
    }, "fallback");
    assert.strictEqual(state.currentTurnId, "turn_a");
    assert.deepStrictEqual(actions, [{
      type: ActionType.ChatTurnStarted,
      turnId: "turn_a",
      startedAt: "2025-07-08T22:05:21.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    }]);
  });
  test("turn/started falls back to provided text when items has no userMessage", () => {
    const state = createCodexSessionMapState();
    const actions = mapTurnStarted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_b",
        items: [],
        itemsView: { type: "full" },
        status: "inProgress",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }
    }, "the prompt");
    assert.strictEqual(actions[0].message.text, "the prompt");
  });
  test("turn/started uses a current timestamp when Codex omits startedAt", () => {
    const before = (/* @__PURE__ */ new Date()).toISOString();
    const actions = mapTurnStarted(createCodexSessionMapState(), {
      threadId: "thr_1",
      turn: {
        id: "turn_c",
        items: [],
        itemsView: { type: "full" },
        status: "inProgress",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }
    }, "prompt");
    const startedAt = actions[0].type === ActionType.ChatTurnStarted ? actions[0].startedAt : void 0;
    assert.ok(typeof startedAt === "string" && startedAt >= before && startedAt <= (/* @__PURE__ */ new Date()).toISOString());
  });
  test("item/started for agentMessage seeds a markdown part", () => {
    const state = createCodexSessionMapState();
    const actions = mapItemStarted(state, {
      item: { type: "agentMessage", id: "item_x", text: "", phase: null, memoryCitation: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    assert.strictEqual(actions.length, 1);
    const a = actions[0];
    assert.strictEqual(a.type, ActionType.ChatResponsePart);
    assert.strictEqual(a.turnId, "turn_a");
    assert.strictEqual(a.part.kind, ResponsePartKind.Markdown);
    assert.strictEqual(typeof a.part.id, "string");
    assert.ok(a.part.id.length > 0);
    assert.strictEqual(state.itemToPartId.get("item_x"), a.part.id);
  });
  test("item/started for non-agentMessage item is ignored (Phase 2)", () => {
    const state = createCodexSessionMapState();
    const actions = mapItemStarted(state, {
      item: { type: "plan", id: "item_p", text: "plan text" },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    assert.deepStrictEqual(actions, []);
    assert.strictEqual(state.itemToPartId.size, 0);
  });
  test("item/agentMessage/delta emits ChatDelta for known itemId", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: { type: "agentMessage", id: "item_x", text: "", phase: null, memoryCitation: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const partId = state.itemToPartId.get("item_x");
    const actions = mapAgentMessageDelta(state, {
      threadId: "thr_1",
      turnId: "turn_a",
      itemId: "item_x",
      delta: "chunk"
    });
    assert.deepStrictEqual(actions, [{
      type: ActionType.ChatDelta,
      turnId: "turn_a",
      partId,
      content: "chunk"
    }]);
  });
  test("item/agentMessage/delta for unknown itemId is dropped", () => {
    const state = createCodexSessionMapState();
    const actions = mapAgentMessageDelta(state, {
      threadId: "thr_1",
      turnId: "turn_a",
      itemId: "unknown",
      delta: "orphan"
    });
    assert.deepStrictEqual(actions, []);
  });
  test("item/reasoning summary events seed a reasoning part and stream deltas", () => {
    const state = createCodexSessionMapState();
    const start = mapReasoningSummaryPartAdded(state, {
      threadId: "thr_1",
      turnId: "turn_a",
      itemId: "rs_1",
      summaryIndex: 0
    });
    const partId = state.itemToReasoningPartId.get("rs_1:summary:0");
    const delta = mapReasoningSummaryTextDelta(state, {
      threadId: "thr_1",
      turnId: "turn_a",
      itemId: "rs_1",
      summaryIndex: 0,
      delta: "thinking"
    });
    assert.deepStrictEqual({
      start: start.map((action) => action.type),
      partKind: start[0]?.type === ActionType.ChatResponsePart ? start[0].part.kind : void 0,
      delta
    }, {
      start: [ActionType.ChatResponsePart],
      partKind: ResponsePartKind.Reasoning,
      delta: [{ type: ActionType.ChatReasoning, turnId: "turn_a", partId, content: "thinking" }]
    });
  });
  test("item/reasoning text delta creates a reasoning part when start was missed", () => {
    const state = createCodexSessionMapState();
    const actions = mapReasoningTextDelta(state, {
      threadId: "thr_1",
      turnId: "turn_a",
      itemId: "rs_2",
      contentIndex: 1,
      delta: "raw thought"
    });
    const partId = state.itemToReasoningPartId.get("rs_2:text:1");
    assert.deepStrictEqual({
      types: actions.map((action) => action.type),
      partKind: actions[0]?.type === ActionType.ChatResponsePart ? actions[0].part.kind : void 0,
      delta: actions[1]
    }, {
      types: [ActionType.ChatResponsePart, ActionType.ChatReasoning],
      partKind: ResponsePartKind.Reasoning,
      delta: { type: ActionType.ChatReasoning, turnId: "turn_a", partId, content: "raw thought" }
    });
  });
  test("thread/tokenUsage/updated emits ChatUsage for the turn", () => {
    const actions = mapTokenUsageUpdated({
      threadId: "thr_1",
      turnId: "turn_a",
      tokenUsage: {
        last: { inputTokens: 10, cachedInputTokens: 4, outputTokens: 6, reasoningOutputTokens: 2, totalTokens: 16 },
        total: { inputTokens: 100, cachedInputTokens: 40, outputTokens: 60, reasoningOutputTokens: 20, totalTokens: 160 },
        modelContextWindow: 2e5
      }
    });
    assert.deepStrictEqual(actions, [{
      type: ActionType.ChatUsage,
      turnId: "turn_a",
      usage: {
        inputTokens: 10,
        outputTokens: 6,
        cacheReadTokens: 4,
        _meta: { reasoningOutputTokens: 2, modelContextWindow: 2e5 }
      }
    }]);
  });
  test("item/completed for agentMessage clears the mapping", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: { type: "agentMessage", id: "item_x", text: "", phase: null, memoryCitation: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    assert.strictEqual(state.itemToPartId.size, 1);
    mapItemCompleted(state, {
      item: { type: "agentMessage", id: "item_x", text: "final", phase: null, memoryCitation: null },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.strictEqual(state.itemToPartId.size, 0);
  });
  test("second agentMessage in a turn is seeded with a leading block separator", () => {
    const state = createCodexSessionMapState();
    const first = mapItemStarted(state, {
      item: { type: "agentMessage", id: "m1", text: "Consolidating the recommendation and tradeoffs.", phase: null, memoryCitation: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const second = mapItemStarted(state, {
      item: { type: "agentMessage", id: "m2", text: "## Conclusion", phase: null, memoryCitation: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    assert.deepStrictEqual({
      first: markdownPartContent(first[0]),
      second: markdownPartContent(second[0])
    }, {
      first: "Consolidating the recommendation and tradeoffs.",
      second: "\n\n## Conclusion"
    });
  });
  test("agentMessage block separator counter resets per turn", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, { item: { type: "agentMessage", id: "m1", text: "a", phase: null, memoryCitation: null }, threadId: "thr_1", turnId: "turn_a", startedAtMs: 0 });
    mapItemStarted(state, { item: { type: "agentMessage", id: "m2", text: "b", phase: null, memoryCitation: null }, threadId: "thr_1", turnId: "turn_a", startedAtMs: 0 });
    resetCodexTurnMapState(state);
    const firstOfNextTurn = mapItemStarted(state, { item: { type: "agentMessage", id: "m3", text: "c", phase: null, memoryCitation: null }, threadId: "thr_1", turnId: "turn_b", startedAtMs: 0 });
    assert.strictEqual(markdownPartContent(firstOfNextTurn[0]), "c");
  });
  test("adjacent agentMessages keep a Markdown heading on its own line after coalescing", () => {
    const state = createCodexSessionMapState();
    let chat = {
      resource: "ahp-chat://test",
      title: "Test",
      status: SessionStatus.Idle,
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      origin: { kind: ChatOriginKind.User },
      turns: [],
      activeTurn: void 0
    };
    const apply = (actions) => {
      for (const action of actions) {
        chat = chatReducer(chat, action);
      }
    };
    apply(mapTurnStarted(state, {
      threadId: "thr_1",
      turn: { id: "turn_a", items: [], itemsView: { type: "full" }, status: "inProgress", error: null, startedAt: null, completedAt: null, durationMs: null }
    }, "prompt"));
    apply(mapItemStarted(state, { item: { type: "agentMessage", id: "m1", text: "", phase: null, memoryCitation: null }, threadId: "thr_1", turnId: "turn_a", startedAtMs: 0 }));
    apply(mapAgentMessageDelta(state, { threadId: "thr_1", turnId: "turn_a", itemId: "m1", delta: "Consolidating the recommendation and tradeoffs." }));
    apply(mapItemStarted(state, { item: { type: "agentMessage", id: "m2", text: "", phase: null, memoryCitation: null }, threadId: "thr_1", turnId: "turn_a", startedAtMs: 0 }));
    apply(mapAgentMessageDelta(state, { threadId: "thr_1", turnId: "turn_a", itemId: "m2", delta: "## Conclusion\n\nDone." }));
    const joined = (chat.activeTurn?.responseParts ?? []).map((part) => part.kind === ResponsePartKind.Markdown ? part.content : "").join("");
    assert.strictEqual(joined, "Consolidating the recommendation and tradeoffs.\n\n## Conclusion\n\nDone.");
  });
  test("item/started for commandExecution emits ChatToolCallStart + Delta + Ready and registers tool-call entry", () => {
    const state = createCodexSessionMapState();
    const actions = mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_1",
        command: "ls -la",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    assert.strictEqual(actions.length, 3);
    const start = actions[0];
    const delta = actions[1];
    const ready = actions[2];
    assert.strictEqual(start.type, ActionType.ChatToolCallStart);
    assert.strictEqual(delta.type, ActionType.ChatToolCallDelta);
    assert.strictEqual(ready.type, ActionType.ChatToolCallReady);
    const entry = state.itemToToolCall.get("cmd_1");
    assert.ok(entry);
    assert.strictEqual(entry.toolCallId, start.toolCallId);
    assert.strictEqual(entry.turnId, "turn_a");
    assert.strictEqual(delta.content, "ls -la");
    assert.strictEqual(ready.confirmed, ToolCallConfirmationReason.NotNeeded);
    assert.deepStrictEqual(start._meta, { toolKind: "terminal" });
  });
  test("commandExecution unwraps the OS shell wrapper for display (start + completed)", () => {
    const state = createCodexSessionMapState();
    const started = mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_wrap",
        command: "/bin/zsh -lc 'touch ~/foo'",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const delta = started[1];
    const ready = started[2];
    const deferred = mapItemCompleted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_wrap",
        command: "/bin/zsh -lc 'touch ~/foo'",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "completed",
        commandActions: [],
        aggregatedOutput: "",
        exitCode: 0,
        durationMs: 4
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    const flushed = mapTurnCompleted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }
    });
    const complete = flushed[0];
    assert.deepStrictEqual({
      deferred,
      delta: delta.content,
      invocationMessage: ready.invocationMessage,
      toolInput: ready.toolInput,
      pastTenseMessage: complete.result.pastTenseMessage
    }, {
      deferred: [],
      delta: "touch ~/foo",
      invocationMessage: "touch ~/foo",
      toolInput: "touch ~/foo",
      pastTenseMessage: "Ran `touch ~/foo`"
    });
  });
  test("commandExecution coalesces a sandbox pre-flight with its approved re-run into one box", () => {
    const state = createCodexSessionMapState();
    const preStarted = mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_preflight",
        command: "curl -s https://example.com",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("cmd_preflight").toolCallId;
    const preCompleted = mapItemCompleted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_preflight",
        command: "curl -s https://example.com",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "completed",
        commandActions: [],
        aggregatedOutput: "",
        exitCode: 0,
        durationMs: 4
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    const escStarted = mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_escalated",
        command: "curl -s https://example.com",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const escCompleted = mapItemCompleted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_escalated",
        command: "curl -s https://example.com",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "completed",
        commandActions: [],
        aggregatedOutput: "Example Domain",
        exitCode: 0,
        durationMs: 40
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    const startCount = (actions) => actions.filter((a) => a.type === ActionType.ChatToolCallStart).length;
    assert.deepStrictEqual({
      // exactly one box opened (pre-flight's), escalation reuses it
      starts: startCount(preStarted) + startCount(escStarted),
      // pre-flight completion deferred, escalation start emits nothing
      preCompleted,
      escStarted,
      // single completion carries the escalation's real output
      escComplete: escCompleted[0]
    }, {
      starts: 1,
      preCompleted: [],
      escStarted: [],
      escComplete: {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn_a",
        toolCallId,
        result: {
          success: true,
          pastTenseMessage: "Ran `curl -s https://example.com`",
          content: [{ type: ToolResultContentType.Text, text: "Example Domain" }],
          error: void 0
        }
      }
    });
  });
  test("item/commandExecution/outputDelta streams running tool content", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_output",
        command: "echo hi",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("cmd_output").toolCallId;
    const first = mapCommandExecutionOutputDelta(state, { threadId: "thr_1", turnId: "turn_a", itemId: "cmd_output", delta: "hi" });
    const second = mapCommandExecutionOutputDelta(state, { threadId: "thr_1", turnId: "turn_a", itemId: "cmd_output", delta: "\n" });
    assert.deepStrictEqual({ first, second }, {
      first: [{ type: ActionType.ChatToolCallContentChanged, turnId: "turn_a", toolCallId, content: [{ type: ToolResultContentType.Text, text: "hi" }] }],
      second: [{ type: ActionType.ChatToolCallContentChanged, turnId: "turn_a", toolCallId, content: [{ type: ToolResultContentType.Text, text: "hi\n" }] }]
    });
  });
  test("item/completed for commandExecution emits ChatToolCallComplete with aggregated output", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_2",
        command: "echo hi",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("cmd_2").toolCallId;
    const actions = mapItemCompleted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_2",
        command: "echo hi",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "completed",
        commandActions: [],
        aggregatedOutput: "hi\n",
        exitCode: 0,
        durationMs: 12
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.strictEqual(actions.length, 1);
    const complete = actions[0];
    assert.strictEqual(complete.type, ActionType.ChatToolCallComplete);
    assert.strictEqual(complete.toolCallId, toolCallId);
    assert.strictEqual(complete.result.success, true);
    assert.deepStrictEqual(complete.result.content, [{ type: ToolResultContentType.Text, text: "hi\n" }]);
    assert.strictEqual(state.itemToToolCall.size, 0);
  });
  test("item/completed for commandExecution with non-zero exit reports failure", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_3",
        command: "false",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const actions = mapItemCompleted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_3",
        command: "false",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "completed",
        commandActions: [],
        aggregatedOutput: "",
        exitCode: 1,
        durationMs: 3
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    const complete = actions[0];
    assert.strictEqual(complete.result.success, false);
    assert.strictEqual(complete.result.error?.message, "Exit code 1");
  });
  test("webSearch item maps to search tool call lifecycle", () => {
    const state = createCodexSessionMapState();
    const startActions = mapItemStarted(state, {
      item: {
        type: "webSearch",
        id: "web_1",
        query: "vscode tests",
        action: { type: "search", query: "vscode tests", queries: null }
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("web_1").toolCallId;
    const completeActions = mapItemCompleted(state, {
      item: {
        type: "webSearch",
        id: "web_1",
        query: "vscode tests",
        action: { type: "search", query: "vscode tests", queries: null }
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.deepStrictEqual({
      startTypes: startActions.map((action) => action.type),
      startMeta: startActions[0]?.type === ActionType.ChatToolCallStart ? startActions[0]._meta : void 0,
      delta: startActions[1],
      ready: startActions[2],
      complete: completeActions,
      remainingToolCalls: state.itemToToolCall.size
    }, {
      startTypes: [ActionType.ChatToolCallStart, ActionType.ChatToolCallDelta, ActionType.ChatToolCallReady],
      startMeta: { toolKind: "search" },
      delta: { type: ActionType.ChatToolCallDelta, turnId: "turn_a", toolCallId, content: "vscode tests" },
      ready: { type: ActionType.ChatToolCallReady, turnId: "turn_a", toolCallId, invocationMessage: "vscode tests", toolInput: "vscode tests", confirmed: ToolCallConfirmationReason.NotNeeded, _meta: { toolKind: "search" } },
      complete: [{ type: ActionType.ChatToolCallComplete, turnId: "turn_a", toolCallId, result: { success: true, pastTenseMessage: "Searched vscode tests" } }],
      remainingToolCalls: 0
    });
  });
  test("fileChange item maps to file edit tool call lifecycle", () => {
    const state = createCodexSessionMapState();
    const changes = [{ path: "src/a.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-old\n+new" }];
    const startActions = mapItemStarted(state, {
      item: { type: "fileChange", id: "file_1", changes, status: "inProgress" },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("file_1").toolCallId;
    const patchActions = mapFileChangePatchUpdated(state, { threadId: "thr_1", turnId: "turn_a", itemId: "file_1", changes: [{ path: "src/b.ts", kind: { type: "add" }, diff: "+hello" }] });
    const completeActions = mapItemCompleted(state, {
      item: { type: "fileChange", id: "file_1", changes, status: "completed" },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.deepStrictEqual({
      startTypes: startActions.map((action) => action.type),
      delta: startActions[1],
      ready: startActions[2],
      initialContent: startActions[3],
      patchActions,
      completeActions,
      remainingToolCalls: state.itemToToolCall.size
    }, {
      startTypes: [ActionType.ChatToolCallStart, ActionType.ChatToolCallDelta, ActionType.ChatToolCallReady, ActionType.ChatToolCallContentChanged],
      delta: { type: ActionType.ChatToolCallDelta, turnId: "turn_a", toolCallId, content: "update: src/a.ts" },
      ready: { type: ActionType.ChatToolCallReady, turnId: "turn_a", toolCallId, invocationMessage: "update: src/a.ts", toolInput: "update: src/a.ts", confirmed: ToolCallConfirmationReason.NotNeeded },
      initialContent: { type: ActionType.ChatToolCallContentChanged, turnId: "turn_a", toolCallId, content: [{ type: ToolResultContentType.Text, text: "update: src/a.ts\n@@ -1 +1 @@\n-old\n+new" }] },
      patchActions: [{ type: ActionType.ChatToolCallContentChanged, turnId: "turn_a", toolCallId, content: [{ type: ToolResultContentType.Text, text: "add: src/b.ts\n+hello" }] }],
      completeActions: [{ type: ActionType.ChatToolCallComplete, turnId: "turn_a", toolCallId, result: { success: true, pastTenseMessage: "Applied file changes", content: [{ type: ToolResultContentType.Text, text: "update: src/a.ts\n@@ -1 +1 @@\n-old\n+new" }] } }],
      remainingToolCalls: 0
    });
  });
  test("mcpToolCall item maps to tool call lifecycle with progress", () => {
    const state = createCodexSessionMapState();
    const startActions = mapItemStarted(state, {
      item: { type: "mcpToolCall", id: "mcp_1", server: "github", tool: "search", status: "inProgress", arguments: { query: "vscode" }, mcpAppResourceUri: void 0, pluginId: null, result: null, error: null, durationMs: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("mcp_1").toolCallId;
    const progressActions = mapMcpToolCallProgress(state, { threadId: "thr_1", turnId: "turn_a", itemId: "mcp_1", message: "Searching" });
    const completeActions = mapItemCompleted(state, {
      item: { type: "mcpToolCall", id: "mcp_1", server: "github", tool: "search", status: "completed", arguments: { query: "vscode" }, mcpAppResourceUri: void 0, pluginId: null, result: { content: ["done"], structuredContent: { count: 1 }, _meta: null }, error: null, durationMs: 5 },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.deepStrictEqual({
      startTypes: startActions.map((action) => action.type),
      delta: startActions[1],
      ready: startActions[2],
      progressActions,
      completeActions,
      remainingToolCalls: state.itemToToolCall.size
    }, {
      startTypes: [ActionType.ChatToolCallStart, ActionType.ChatToolCallDelta, ActionType.ChatToolCallReady],
      delta: { type: ActionType.ChatToolCallDelta, turnId: "turn_a", toolCallId, content: '{\n  "query": "vscode"\n}' },
      ready: { type: ActionType.ChatToolCallReady, turnId: "turn_a", toolCallId, invocationMessage: "Calling github.search", toolInput: '{\n  "query": "vscode"\n}', confirmed: ToolCallConfirmationReason.NotNeeded },
      progressActions: [{ type: ActionType.ChatToolCallContentChanged, turnId: "turn_a", toolCallId, content: [{ type: ToolResultContentType.Text, text: "Searching" }] }],
      completeActions: [{ type: ActionType.ChatToolCallComplete, turnId: "turn_a", toolCallId, result: { success: true, pastTenseMessage: "Called github.search", content: [{ type: ToolResultContentType.Text, text: 'done\n{\n  "count": 1\n}' }] } }],
      remainingToolCalls: 0
    });
  });
  test("mcpToolCall start carries an MCP contributor when the server has a customization", () => {
    const state = createCodexSessionMapState();
    state.mcpCustomizationIds.set("github", "cust-gh");
    const startActions = mapItemStarted(state, {
      item: {
        type: "mcpToolCall",
        id: "mcp_c",
        server: "github",
        tool: "search",
        status: "inProgress",
        arguments: {},
        mcpAppResourceUri: void 0,
        pluginId: null,
        result: null,
        error: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const start = startActions[0];
    if (start.type !== ActionType.ChatToolCallStart) {
      throw new Error("expected a ChatToolCallStart action");
    }
    assert.deepStrictEqual(start.contributor, { kind: ToolCallContributorKind.MCP, customizationId: "cust-gh" });
  });
  test("mcpToolCall start carries no contributor when the server has no customization", () => {
    const state = createCodexSessionMapState();
    const startActions = mapItemStarted(state, {
      item: {
        type: "mcpToolCall",
        id: "mcp_n",
        server: "github",
        tool: "search",
        status: "inProgress",
        arguments: {},
        mcpAppResourceUri: void 0,
        pluginId: null,
        result: null,
        error: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const start = startActions[0];
    if (start.type !== ActionType.ChatToolCallStart) {
      throw new Error("expected a ChatToolCallStart action");
    }
    assert.strictEqual(start.contributor, void 0);
  });
  test("a host-declined commandExecution reports result.error.code = denied", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_d",
        command: "rm file",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const entry = state.itemToToolCall.get("cmd_d");
    if (!entry) {
      throw new Error("expected a tracked tool call");
    }
    state.declinedToolCalls.add(entry.toolCallId);
    const actions = mapItemCompleted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_d",
        command: "rm file",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "failed",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: 1
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    const complete = actions[0];
    if (complete.type !== ActionType.ChatToolCallComplete) {
      throw new Error("expected a ChatToolCallComplete action");
    }
    assert.strictEqual(complete.result.success, false);
    assert.strictEqual(complete.result.error?.code, "denied");
  });
  test("a host-declined mcpToolCall reports result.error.code = denied", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "mcpToolCall",
        id: "mcp_d",
        server: "github",
        tool: "search",
        status: "inProgress",
        arguments: {},
        mcpAppResourceUri: void 0,
        pluginId: null,
        result: null,
        error: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const entry = state.itemToToolCall.get("mcp_d");
    if (!entry) {
      throw new Error("expected a tracked tool call");
    }
    state.declinedToolCalls.add(entry.toolCallId);
    const actions = mapItemCompleted(state, {
      item: {
        type: "mcpToolCall",
        id: "mcp_d",
        server: "github",
        tool: "search",
        status: "failed",
        arguments: {},
        mcpAppResourceUri: void 0,
        pluginId: null,
        result: null,
        error: null,
        durationMs: 1
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    const complete = actions[0];
    if (complete.type !== ActionType.ChatToolCallComplete) {
      throw new Error("expected a ChatToolCallComplete action");
    }
    assert.strictEqual(complete.result.success, false);
    assert.strictEqual(complete.result.error?.code, "denied");
  });
  test("collabAgentToolCall spawnAgent start renders compactly (no prompt dump \u2014 the peer chat shows it)", () => {
    const state = createCodexSessionMapState();
    const startActions = mapItemStarted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_1",
        tool: "spawnAgent",
        status: "inProgress",
        senderThreadId: "thr_1",
        receiverThreadIds: [],
        prompt: "Investigate the failing test",
        model: "gpt-5.5",
        reasoningEffort: null,
        agentsStates: {}
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("collab_1").toolCallId;
    assert.deepStrictEqual({
      actions: startActions,
      entryToolName: state.itemToToolCall.get("collab_1").toolName
    }, {
      actions: [
        { type: ActionType.ChatToolCallStart, turnId: "turn_a", toolCallId, toolName: "codex.spawnAgent", displayName: "Spawn agent" },
        { type: ActionType.ChatToolCallReady, turnId: "turn_a", toolCallId, invocationMessage: "Spawning agent", confirmed: ToolCallConfirmationReason.NotNeeded }
      ],
      entryToolName: "codex.spawnAgent"
    });
  });
  test("collabAgentToolCall sendInput start still carries the prompt (only spawnAgent is compacted)", () => {
    const state = createCodexSessionMapState();
    const startActions = mapItemStarted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_si",
        tool: "sendInput",
        status: "inProgress",
        senderThreadId: "thr_1",
        receiverThreadIds: ["sub_1"],
        prompt: "Also check the CHANGELOG",
        model: null,
        reasoningEffort: null,
        agentsStates: {}
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("collab_si").toolCallId;
    assert.deepStrictEqual(startActions, [
      { type: ActionType.ChatToolCallStart, turnId: "turn_a", toolCallId, toolName: "codex.sendInput", displayName: "Send input to agent" },
      { type: ActionType.ChatToolCallDelta, turnId: "turn_a", toolCallId, content: "Also check the CHANGELOG" },
      { type: ActionType.ChatToolCallReady, turnId: "turn_a", toolCallId, invocationMessage: "Sending input to agent", toolInput: "Also check the CHANGELOG", confirmed: ToolCallConfirmationReason.NotNeeded }
    ]);
  });
  test("collabAgentToolCall spawnAgent completed renders the subagent result as tool output", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_2",
        tool: "spawnAgent",
        status: "inProgress",
        senderThreadId: "thr_1",
        receiverThreadIds: ["sub_1"],
        prompt: "Investigate the failing test",
        model: "gpt-5.5",
        reasoningEffort: null,
        agentsStates: {}
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("collab_2").toolCallId;
    const actions = mapItemCompleted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_2",
        tool: "spawnAgent",
        status: "completed",
        senderThreadId: "thr_1",
        receiverThreadIds: ["sub_1"],
        prompt: "Investigate the failing test",
        model: "gpt-5.5",
        reasoningEffort: null,
        agentsStates: { sub_1: { status: "completed", message: "Found the bug in foo.ts" } }
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.deepStrictEqual({ actions, remainingToolCalls: state.itemToToolCall.size }, {
      actions: [{
        type: ActionType.ChatToolCallComplete,
        turnId: "turn_a",
        toolCallId,
        result: {
          success: true,
          pastTenseMessage: "Spawned agent",
          content: [{ type: ToolResultContentType.Text, text: "Completed \u2014 Found the bug in foo.ts" }]
        }
      }],
      remainingToolCalls: 0
    });
  });
  test("collabAgentToolCall wait aggregates results from multiple subagents", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_wait",
        tool: "wait",
        status: "inProgress",
        senderThreadId: "thr_1",
        receiverThreadIds: ["sub_1", "sub_2"],
        prompt: null,
        model: null,
        reasoningEffort: null,
        agentsStates: {}
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("collab_wait").toolCallId;
    const actions = mapItemCompleted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_wait",
        tool: "wait",
        status: "completed",
        senderThreadId: "thr_1",
        receiverThreadIds: ["sub_1", "sub_2"],
        prompt: null,
        model: null,
        reasoningEffort: null,
        agentsStates: {
          sub_1: { status: "completed", message: "Migration finished" },
          sub_2: { status: "running", message: "Still analysing" }
        }
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.deepStrictEqual(actions, [{
      type: ActionType.ChatToolCallComplete,
      turnId: "turn_a",
      toolCallId,
      result: {
        success: true,
        pastTenseMessage: "Finished waiting",
        content: [{ type: ToolResultContentType.Text, text: "Agent 1: Completed \u2014 Migration finished\nAgent 2: Running \u2014 Still analysing" }]
      }
    }]);
  });
  test("collabAgentToolCall failure reports the errored subagent state", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_fail",
        tool: "spawnAgent",
        status: "inProgress",
        senderThreadId: "thr_1",
        receiverThreadIds: ["sub_1"],
        prompt: "Refactor the parser",
        model: "gpt-5.5",
        reasoningEffort: null,
        agentsStates: {}
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("collab_fail").toolCallId;
    const actions = mapItemCompleted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_fail",
        tool: "spawnAgent",
        status: "failed",
        senderThreadId: "thr_1",
        receiverThreadIds: ["sub_1"],
        prompt: "Refactor the parser",
        model: "gpt-5.5",
        reasoningEffort: null,
        agentsStates: { sub_1: { status: "errored", message: "Model unavailable" } }
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.deepStrictEqual(actions, [{
      type: ActionType.ChatToolCallComplete,
      turnId: "turn_a",
      toolCallId,
      result: {
        success: false,
        pastTenseMessage: "Spawn agent failed",
        content: [{ type: ToolResultContentType.Text, text: "Errored \u2014 Model unavailable" }],
        error: { message: "Collab agent failed" }
      }
    }]);
  });
  test("dynamicToolCall item carries a Client contributor when a client owns the tool", () => {
    const toolSet = new ActiveClientToolSet();
    toolSet.set("win-7", [{ name: "get_magic_word" }]);
    const state = createCodexSessionMapState(/* @__PURE__ */ new Set(), toolSet);
    const startActions = mapItemStarted(state, {
      item: { type: "dynamicToolCall", id: "dyn_2", namespace: null, tool: "get_magic_word", arguments: {}, status: "inProgress", contentItems: null, success: null, durationMs: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const start = startActions[0];
    assert.deepStrictEqual({
      type: start.type,
      toolName: start.toolName,
      contributor: start.contributor
    }, {
      type: ActionType.ChatToolCallStart,
      toolName: "get_magic_word",
      contributor: { kind: ToolCallContributorKind.Client, clientId: "win-7" }
    });
  });
  test("dynamicToolCall item omits the Client contributor for a server tool", () => {
    const toolSet = new ActiveClientToolSet();
    toolSet.set("win-7", [{ name: "get_magic_word" }]);
    const state = createCodexSessionMapState(/* @__PURE__ */ new Set(["addComment"]), toolSet);
    const startActions = mapItemStarted(state, {
      item: { type: "dynamicToolCall", id: "dyn_3", namespace: null, tool: "addComment", arguments: {}, status: "inProgress", contentItems: null, success: null, durationMs: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const start = startActions[0];
    assert.deepStrictEqual({
      type: start.type,
      toolName: start.toolName,
      contributor: start.contributor
    }, {
      type: ActionType.ChatToolCallStart,
      toolName: "addComment",
      contributor: void 0
    });
  });
  test("dynamicToolCall item maps to tool call lifecycle", () => {
    const state = createCodexSessionMapState();
    const startActions = mapItemStarted(state, {
      item: { type: "dynamicToolCall", id: "dyn_1", namespace: "client", tool: "lookup", arguments: { symbol: "A" }, status: "inProgress", contentItems: null, success: null, durationMs: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("dyn_1").toolCallId;
    const completeActions = mapItemCompleted(state, {
      item: { type: "dynamicToolCall", id: "dyn_1", namespace: "client", tool: "lookup", arguments: { symbol: "A" }, status: "completed", contentItems: [{ type: "inputText", text: "Found A" }, { type: "inputImage", imageUrl: "https://example.test/a.png" }], success: true, durationMs: 5 },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.deepStrictEqual({
      startTypes: startActions.map((action) => action.type),
      delta: startActions[1],
      ready: startActions[2],
      completeActions,
      remainingToolCalls: state.itemToToolCall.size
    }, {
      startTypes: [ActionType.ChatToolCallStart, ActionType.ChatToolCallDelta, ActionType.ChatToolCallReady],
      delta: { type: ActionType.ChatToolCallDelta, turnId: "turn_a", toolCallId, content: '{\n  "symbol": "A"\n}' },
      ready: { type: ActionType.ChatToolCallReady, turnId: "turn_a", toolCallId, invocationMessage: "Calling client.lookup", toolInput: '{\n  "symbol": "A"\n}', confirmed: ToolCallConfirmationReason.NotNeeded },
      completeActions: [{ type: ActionType.ChatToolCallComplete, turnId: "turn_a", toolCallId, result: { success: true, pastTenseMessage: "Called client.lookup", content: [{ type: ToolResultContentType.Text, text: "Found A\nhttps://example.test/a.png" }] } }],
      remainingToolCalls: 0
    });
  });
  test("turn/completed with status=completed emits ChatTurnComplete", () => {
    const state = createCodexSessionMapState();
    state.currentTurnId = "turn_a";
    const actions = mapTurnCompleted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: 1752012321,
        completedAt: 17520123235e-1,
        durationMs: 2500
      }
    });
    assert.deepStrictEqual(actions, [{ type: ActionType.ChatTurnComplete, turnId: "turn_a", duration: 2500 }]);
    assert.strictEqual(state.currentTurnId, void 0);
  });
  test("turn/completed completes orphaned tool calls before completing the turn", () => {
    const state = createCodexSessionMapState();
    state.itemToToolCall.set("cmd_1", { toolCallId: "tc_1", turnId: "turn_a", toolName: "shell", output: "partial output" });
    const actions = mapTurnCompleted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }
    }, 321);
    const completeAction = actions[1];
    const { duration: completeDuration, ...completeRest } = completeAction;
    assert.deepStrictEqual({ actions: [actions[0], completeRest], remainingToolCalls: state.itemToToolCall.size }, {
      actions: [
        { type: ActionType.ChatToolCallComplete, turnId: "turn_a", toolCallId: "tc_1", result: { success: false, pastTenseMessage: "Stopped shell", content: [{ type: ToolResultContentType.Text, text: "partial output" }], error: { message: "Turn completed before the tool reported completion" } } },
        { type: ActionType.ChatTurnComplete, turnId: "turn_a" }
      ],
      remainingToolCalls: 0
    });
    assert.strictEqual(completeDuration, 321);
  });
  test("turn/completed with status=failed emits ChatError + ChatTurnComplete", () => {
    const state = createCodexSessionMapState();
    const actions = mapTurnCompleted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [],
        itemsView: { type: "full" },
        status: "failed",
        error: { message: "boom" },
        startedAt: null,
        completedAt: null,
        durationMs: null
      }
    });
    assert.deepStrictEqual(actions, [
      { type: ActionType.ChatError, turnId: "turn_a", duration: 0, error: { errorType: "CodexError", message: "boom" } },
      { type: ActionType.ChatTurnComplete, turnId: "turn_a", duration: 0 }
    ]);
  });
  test("turn/completed with status=interrupted emits ChatTurnCancelled", () => {
    const state = createCodexSessionMapState();
    const actions = mapTurnCompleted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [],
        itemsView: { type: "full" },
        status: "interrupted",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }
    });
    assert.deepStrictEqual(actions, [{ type: ActionType.ChatTurnCancelled, turnId: "turn_a", duration: 0 }]);
  });
  test("turnStateFromStatus maps strings correctly", () => {
    assert.strictEqual(turnStateFromStatus("completed"), TurnState.Complete);
    assert.strictEqual(turnStateFromStatus("interrupted"), TurnState.Cancelled);
    assert.strictEqual(turnStateFromStatus("failed"), TurnState.Error);
    assert.strictEqual(turnStateFromStatus("weird"), TurnState.Complete);
  });
  test("extractUserInputText joins text inputs and ignores non-text", () => {
    assert.strictEqual(
      extractUserInputText([
        { type: "text", text: "first", text_elements: [] },
        { type: "image", url: "http://x/y.png" },
        { type: "text", text: "second", text_elements: [] },
        { type: "mention", name: "foo", path: "/foo" }
      ]),
      "first\n\nsecond"
    );
    assert.strictEqual(extractUserInputText([]), "");
    assert.strictEqual(extractUserInputText([{ type: "image", url: "http://x/y.png" }]), "");
  });
  test("resetCodexTurnMapState clears item maps but preserves currentTurnId", () => {
    const state = createCodexSessionMapState();
    state.currentTurnId = "turn_a";
    state.itemToPartId.set("i1", "p1");
    state.itemToToolCall.set("i2", { toolCallId: "tc", turnId: "turn_a", toolName: "shell", output: "" });
    state.itemToReasoningPartId.set("i3", "r1");
    state.declinedToolCalls.add("tc-stale");
    resetCodexTurnMapState(state);
    assert.deepStrictEqual({
      currentTurnId: state.currentTurnId,
      parts: state.itemToPartId.size,
      toolCalls: state.itemToToolCall.size,
      reasoning: state.itemToReasoningPartId.size,
      declined: state.declinedToolCalls.size
    }, { currentTurnId: "turn_a", parts: 0, toolCalls: 0, reasoning: 0, declined: 0 });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29kZXgvY29kZXhNYXBBcHBTZXJ2ZXJFdmVudHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUsIGV4dHJhY3RVc2VySW5wdXRUZXh0LCBtYXBBZ2VudE1lc3NhZ2VEZWx0YSwgbWFwQ29tbWFuZEV4ZWN1dGlvbk91dHB1dERlbHRhLCBtYXBGaWxlQ2hhbmdlUGF0Y2hVcGRhdGVkLCBtYXBJdGVtQ29tcGxldGVkLCBtYXBJdGVtU3RhcnRlZCwgbWFwTWNwVG9vbENhbGxQcm9ncmVzcywgbWFwUmVhc29uaW5nU3VtbWFyeVBhcnRBZGRlZCwgbWFwUmVhc29uaW5nU3VtbWFyeVRleHREZWx0YSwgbWFwUmVhc29uaW5nVGV4dERlbHRhLCBtYXBUb2tlblVzYWdlVXBkYXRlZCwgbWFwVHVybkNvbXBsZXRlZCwgbWFwVHVyblN0YXJ0ZWQsIHJlc2V0Q29kZXhUdXJuTWFwU3RhdGUsIHR1cm5TdGF0ZUZyb21TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvZGV4L2NvZGV4TWFwQXBwU2VydmVyRXZlbnRzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQ2hhdEFjdGlvbiwgdHlwZSBTZXNzaW9uQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IGNoYXRSZWR1Y2VyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3JlZHVjZXJzLmpzJztcbmltcG9ydCB7IENoYXRPcmlnaW5LaW5kLCBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgU2Vzc2lvblN0YXR1cywgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIFR1cm5TdGF0ZSwgdHlwZSBDaGF0U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFjdGl2ZUNsaWVudFRvb2xTZXQgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FjdGl2ZUNsaWVudFN0YXRlLmpzJztcblxuLyoqIEV4dHJhY3RzIHRoZSBjb250ZW50IG9mIGEgTWFya2Rvd24gcmVzcG9uc2UgcGFydCBlbWl0dGVkIGJ5IGEgbWFwcGVyIGFjdGlvbi4gKi9cbmZ1bmN0aW9uIG1hcmtkb3duUGFydENvbnRlbnQoYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbiB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBhY3Rpb24/LnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCAmJiBhY3Rpb24ucGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duXG5cdFx0PyBhY3Rpb24ucGFydC5jb250ZW50XG5cdFx0OiB1bmRlZmluZWQ7XG59XG5cbnN1aXRlKCdjb2RleE1hcEFwcFNlcnZlckV2ZW50cycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd0dXJuL3N0YXJ0ZWQgZW1pdHMgQ2hhdFR1cm5TdGFydGVkIHdpdGggdXNlciBtZXNzYWdlIHRleHQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBUdXJuU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsXG5cdFx0XHR0dXJuOiB7XG5cdFx0XHRcdGlkOiAndHVybl9hJyxcblx0XHRcdFx0aXRlbXM6IFt7XG5cdFx0XHRcdFx0dHlwZTogJ3VzZXJNZXNzYWdlJyxcblx0XHRcdFx0XHRpZDogJ2l0ZW1fdXNlcicsXG5cdFx0XHRcdFx0Y2xpZW50SWQ6IG51bGwsXG5cdFx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnaGVsbG8nLCB0ZXh0X2VsZW1lbnRzOiBbXSB9XSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnaW5Qcm9ncmVzcycgYXMgbmV2ZXIsXG5cdFx0XHRcdGVycm9yOiBudWxsLFxuXHRcdFx0XHRzdGFydGVkQXQ6IDFfNzUyXzAxMl8zMjEsXG5cdFx0XHRcdGNvbXBsZXRlZEF0OiBudWxsLFxuXHRcdFx0XHRkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSxcblx0XHR9LCAnZmFsbGJhY2snKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuY3VycmVudFR1cm5JZCwgJ3R1cm5fYScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucywgW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybl9hJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDctMDhUMjI6MDU6MjEuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R1cm4vc3RhcnRlZCBmYWxscyBiYWNrIHRvIHByb3ZpZGVkIHRleHQgd2hlbiBpdGVtcyBoYXMgbm8gdXNlck1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBUdXJuU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsXG5cdFx0XHR0dXJuOiB7XG5cdFx0XHRcdGlkOiAndHVybl9iJyxcblx0XHRcdFx0aXRlbXM6IFtdLFxuXHRcdFx0XHRpdGVtc1ZpZXc6IHsgdHlwZTogJ2Z1bGwnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXR1czogJ2luUHJvZ3Jlc3MnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCxcblx0XHRcdFx0c3RhcnRlZEF0OiBudWxsLFxuXHRcdFx0XHRjb21wbGV0ZWRBdDogbnVsbCxcblx0XHRcdFx0ZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0sXG5cdFx0fSwgJ3RoZSBwcm9tcHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGFjdGlvbnNbMF0gYXMgeyBtZXNzYWdlOiB7IHRleHQ6IHN0cmluZyB9IH0pLm1lc3NhZ2UudGV4dCwgJ3RoZSBwcm9tcHQnKTtcblx0fSk7XG5cblx0dGVzdCgndHVybi9zdGFydGVkIHVzZXMgYSBjdXJyZW50IHRpbWVzdGFtcCB3aGVuIENvZGV4IG9taXRzIHN0YXJ0ZWRBdCcsICgpID0+IHtcblx0XHRjb25zdCBiZWZvcmUgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcFR1cm5TdGFydGVkKGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCksIHtcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLFxuXHRcdFx0dHVybjoge1xuXHRcdFx0XHRpZDogJ3R1cm5fYycsXG5cdFx0XHRcdGl0ZW1zOiBbXSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdpblByb2dyZXNzJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogbnVsbCxcblx0XHRcdFx0Y29tcGxldGVkQXQ6IG51bGwsXG5cdFx0XHRcdGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9LFxuXHRcdH0sICdwcm9tcHQnKTtcblxuXHRcdGNvbnN0IHN0YXJ0ZWRBdCA9IGFjdGlvbnNbMF0udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQgPyBhY3Rpb25zWzBdLnN0YXJ0ZWRBdCA6IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQub2sodHlwZW9mIHN0YXJ0ZWRBdCA9PT0gJ3N0cmluZycgJiYgc3RhcnRlZEF0ID49IGJlZm9yZSAmJiBzdGFydGVkQXQgPD0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnaXRlbS9zdGFydGVkIGZvciBhZ2VudE1lc3NhZ2Ugc2VlZHMgYSBtYXJrZG93biBwYXJ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnaXRlbV94JywgdGV4dDogJycsIHBoYXNlOiBudWxsLCBtZW1vcnlDaXRhdGlvbjogbnVsbCB9LFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuX2EnLFxuXHRcdFx0c3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBhID0gYWN0aW9uc1swXSBhcyB7IHR5cGU6IEFjdGlvblR5cGU7IHR1cm5JZDogc3RyaW5nOyBwYXJ0OiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQ7IGlkOiBzdHJpbmc7IGNvbnRlbnQ6IHN0cmluZyB9IH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEudHlwZSwgQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS50dXJuSWQsICd0dXJuX2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS5wYXJ0LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgYS5wYXJ0LmlkLCAnc3RyaW5nJyk7XG5cdFx0YXNzZXJ0Lm9rKGEucGFydC5pZC5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuaXRlbVRvUGFydElkLmdldCgnaXRlbV94JyksIGEucGFydC5pZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2l0ZW0vc3RhcnRlZCBmb3Igbm9uLWFnZW50TWVzc2FnZSBpdGVtIGlzIGlnbm9yZWQgKFBoYXNlIDIpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ3BsYW4nLCBpZDogJ2l0ZW1fcCcsIHRleHQ6ICdwbGFuIHRleHQnIH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm5fYScsXG5cdFx0XHRzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuaXRlbVRvUGFydElkLnNpemUsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdpdGVtL2FnZW50TWVzc2FnZS9kZWx0YSBlbWl0cyBDaGF0RGVsdGEgZm9yIGtub3duIGl0ZW1JZCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0bWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnaXRlbV94JywgdGV4dDogJycsIHBoYXNlOiBudWxsLCBtZW1vcnlDaXRhdGlvbjogbnVsbCB9LFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBhcnRJZCA9IHN0YXRlLml0ZW1Ub1BhcnRJZC5nZXQoJ2l0ZW1feCcpITtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwQWdlbnRNZXNzYWdlRGVsdGEoc3RhdGUsIHtcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLFxuXHRcdFx0dHVybklkOiAndHVybl9hJyxcblx0XHRcdGl0ZW1JZDogJ2l0ZW1feCcsXG5cdFx0XHRkZWx0YTogJ2NodW5rJyxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMsIFt7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXREZWx0YSxcblx0XHRcdHR1cm5JZDogJ3R1cm5fYScsXG5cdFx0XHRwYXJ0SWQsXG5cdFx0XHRjb250ZW50OiAnY2h1bmsnLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnaXRlbS9hZ2VudE1lc3NhZ2UvZGVsdGEgZm9yIHVua25vd24gaXRlbUlkIGlzIGRyb3BwZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBBZ2VudE1lc3NhZ2VEZWx0YShzdGF0ZSwge1xuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGl0ZW1JZDogJ3Vua25vd24nLCBkZWx0YTogJ29ycGhhbicsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2l0ZW0vcmVhc29uaW5nIHN1bW1hcnkgZXZlbnRzIHNlZWQgYSByZWFzb25pbmcgcGFydCBhbmQgc3RyZWFtIGRlbHRhcycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBtYXBSZWFzb25pbmdTdW1tYXJ5UGFydEFkZGVkKHN0YXRlLCB7XG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgaXRlbUlkOiAncnNfMScsIHN1bW1hcnlJbmRleDogMCxcblx0XHR9KTtcblx0XHRjb25zdCBwYXJ0SWQgPSBzdGF0ZS5pdGVtVG9SZWFzb25pbmdQYXJ0SWQuZ2V0KCdyc18xOnN1bW1hcnk6MCcpO1xuXHRcdGNvbnN0IGRlbHRhID0gbWFwUmVhc29uaW5nU3VtbWFyeVRleHREZWx0YShzdGF0ZSwge1xuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGl0ZW1JZDogJ3JzXzEnLCBzdW1tYXJ5SW5kZXg6IDAsIGRlbHRhOiAndGhpbmtpbmcnLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhcnQ6IHN0YXJ0Lm1hcChhY3Rpb24gPT4gYWN0aW9uLnR5cGUpLFxuXHRcdFx0cGFydEtpbmQ6IHN0YXJ0WzBdPy50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQgPyBzdGFydFswXS5wYXJ0LmtpbmQgOiB1bmRlZmluZWQsXG5cdFx0XHRkZWx0YSxcblx0XHR9LCB7XG5cdFx0XHRzdGFydDogW0FjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydF0sXG5cdFx0XHRwYXJ0S2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsXG5cdFx0XHRkZWx0YTogW3sgdHlwZTogQWN0aW9uVHlwZS5DaGF0UmVhc29uaW5nLCB0dXJuSWQ6ICd0dXJuX2EnLCBwYXJ0SWQsIGNvbnRlbnQ6ICd0aGlua2luZycgfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2l0ZW0vcmVhc29uaW5nIHRleHQgZGVsdGEgY3JlYXRlcyBhIHJlYXNvbmluZyBwYXJ0IHdoZW4gc3RhcnQgd2FzIG1pc3NlZCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcFJlYXNvbmluZ1RleHREZWx0YShzdGF0ZSwge1xuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGl0ZW1JZDogJ3JzXzInLCBjb250ZW50SW5kZXg6IDEsIGRlbHRhOiAncmF3IHRob3VnaHQnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBhcnRJZCA9IHN0YXRlLml0ZW1Ub1JlYXNvbmluZ1BhcnRJZC5nZXQoJ3JzXzI6dGV4dDoxJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0eXBlczogYWN0aW9ucy5tYXAoYWN0aW9uID0+IGFjdGlvbi50eXBlKSxcblx0XHRcdHBhcnRLaW5kOiBhY3Rpb25zWzBdPy50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQgPyBhY3Rpb25zWzBdLnBhcnQua2luZCA6IHVuZGVmaW5lZCxcblx0XHRcdGRlbHRhOiBhY3Rpb25zWzFdLFxuXHRcdH0sIHtcblx0XHRcdHR5cGVzOiBbQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LCBBY3Rpb25UeXBlLkNoYXRSZWFzb25pbmddLFxuXHRcdFx0cGFydEtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nLFxuXHRcdFx0ZGVsdGE6IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0UmVhc29uaW5nLCB0dXJuSWQ6ICd0dXJuX2EnLCBwYXJ0SWQsIGNvbnRlbnQ6ICdyYXcgdGhvdWdodCcgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGhyZWFkL3Rva2VuVXNhZ2UvdXBkYXRlZCBlbWl0cyBDaGF0VXNhZ2UgZm9yIHRoZSB0dXJuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBUb2tlblVzYWdlVXBkYXRlZCh7XG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm5fYScsXG5cdFx0XHR0b2tlblVzYWdlOiB7XG5cdFx0XHRcdGxhc3Q6IHsgaW5wdXRUb2tlbnM6IDEwLCBjYWNoZWRJbnB1dFRva2VuczogNCwgb3V0cHV0VG9rZW5zOiA2LCByZWFzb25pbmdPdXRwdXRUb2tlbnM6IDIsIHRvdGFsVG9rZW5zOiAxNiB9LFxuXHRcdFx0XHR0b3RhbDogeyBpbnB1dFRva2VuczogMTAwLCBjYWNoZWRJbnB1dFRva2VuczogNDAsIG91dHB1dFRva2VuczogNjAsIHJlYXNvbmluZ091dHB1dFRva2VuczogMjAsIHRvdGFsVG9rZW5zOiAxNjAgfSxcblx0XHRcdFx0bW9kZWxDb250ZXh0V2luZG93OiAyMDAwMDAsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucywgW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFVzYWdlLFxuXHRcdFx0dHVybklkOiAndHVybl9hJyxcblx0XHRcdHVzYWdlOiB7XG5cdFx0XHRcdGlucHV0VG9rZW5zOiAxMCxcblx0XHRcdFx0b3V0cHV0VG9rZW5zOiA2LFxuXHRcdFx0XHRjYWNoZVJlYWRUb2tlbnM6IDQsXG5cdFx0XHRcdF9tZXRhOiB7IHJlYXNvbmluZ091dHB1dFRva2VuczogMiwgbW9kZWxDb250ZXh0V2luZG93OiAyMDAwMDAgfSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpdGVtL2NvbXBsZXRlZCBmb3IgYWdlbnRNZXNzYWdlIGNsZWFycyB0aGUgbWFwcGluZycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0bWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnaXRlbV94JywgdGV4dDogJycsIHBoYXNlOiBudWxsLCBtZW1vcnlDaXRhdGlvbjogbnVsbCB9LFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5pdGVtVG9QYXJ0SWQuc2l6ZSwgMSk7XG5cdFx0bWFwSXRlbUNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbTogeyB0eXBlOiAnYWdlbnRNZXNzYWdlJywgaWQ6ICdpdGVtX3gnLCB0ZXh0OiAnZmluYWwnLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSxcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBjb21wbGV0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5pdGVtVG9QYXJ0SWQuc2l6ZSwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlY29uZCBhZ2VudE1lc3NhZ2UgaW4gYSB0dXJuIGlzIHNlZWRlZCB3aXRoIGEgbGVhZGluZyBibG9jayBzZXBhcmF0b3InLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGNvbnN0IGZpcnN0ID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnbTEnLCB0ZXh0OiAnQ29uc29saWRhdGluZyB0aGUgcmVjb21tZW5kYXRpb24gYW5kIHRyYWRlb2Zmcy4nLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSxcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCBzZWNvbmQgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbTogeyB0eXBlOiAnYWdlbnRNZXNzYWdlJywgaWQ6ICdtMicsIHRleHQ6ICcjIyBDb25jbHVzaW9uJywgcGhhc2U6IG51bGwsIG1lbW9yeUNpdGF0aW9uOiBudWxsIH0sXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmaXJzdDogbWFya2Rvd25QYXJ0Q29udGVudChmaXJzdFswXSksXG5cdFx0XHRzZWNvbmQ6IG1hcmtkb3duUGFydENvbnRlbnQoc2Vjb25kWzBdKSxcblx0XHR9LCB7XG5cdFx0XHRmaXJzdDogJ0NvbnNvbGlkYXRpbmcgdGhlIHJlY29tbWVuZGF0aW9uIGFuZCB0cmFkZW9mZnMuJyxcblx0XHRcdHNlY29uZDogJ1xcblxcbiMjIENvbmNsdXNpb24nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudE1lc3NhZ2UgYmxvY2sgc2VwYXJhdG9yIGNvdW50ZXIgcmVzZXRzIHBlciB0dXJuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRtYXBJdGVtU3RhcnRlZChzdGF0ZSwgeyBpdGVtOiB7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ20xJywgdGV4dDogJ2EnLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSwgdGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwIH0pO1xuXHRcdG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7IGl0ZW06IHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnbTInLCB0ZXh0OiAnYicsIHBoYXNlOiBudWxsLCBtZW1vcnlDaXRhdGlvbjogbnVsbCB9LCB0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAgfSk7XG5cdFx0Ly8gQSBuZXcgdHVybiByZXNldHMgdGhlIGNvdW50ZXIsIHNvIGl0cyBmaXJzdCBhZ2VudE1lc3NhZ2UgaXMgdW5zZWVkZWQuXG5cdFx0cmVzZXRDb2RleFR1cm5NYXBTdGF0ZShzdGF0ZSk7XG5cdFx0Y29uc3QgZmlyc3RPZk5leHRUdXJuID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHsgaXRlbTogeyB0eXBlOiAnYWdlbnRNZXNzYWdlJywgaWQ6ICdtMycsIHRleHQ6ICdjJywgcGhhc2U6IG51bGwsIG1lbW9yeUNpdGF0aW9uOiBudWxsIH0sIHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2InLCBzdGFydGVkQXRNczogMCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Rvd25QYXJ0Q29udGVudChmaXJzdE9mTmV4dFR1cm5bMF0pLCAnYycpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGphY2VudCBhZ2VudE1lc3NhZ2VzIGtlZXAgYSBNYXJrZG93biBoZWFkaW5nIG9uIGl0cyBvd24gbGluZSBhZnRlciBjb2FsZXNjaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRsZXQgY2hhdDogQ2hhdFN0YXRlID0ge1xuXHRcdFx0cmVzb3VyY2U6ICdhaHAtY2hhdDovL3Rlc3QnLFxuXHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Vc2VyIH0sXG5cdFx0XHR0dXJuczogW10sXG5cdFx0XHRhY3RpdmVUdXJuOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHRjb25zdCBhcHBseSA9IChhY3Rpb25zOiByZWFkb25seSAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10pID0+IHtcblx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdFx0Y2hhdCA9IGNoYXRSZWR1Y2VyKGNoYXQsIGFjdGlvbiBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGFwcGx5KG1hcFR1cm5TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJyxcblx0XHRcdHR1cm46IHsgaWQ6ICd0dXJuX2EnLCBpdGVtczogW10sIGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlciwgc3RhdHVzOiAnaW5Qcm9ncmVzcycgYXMgbmV2ZXIsIGVycm9yOiBudWxsLCBzdGFydGVkQXQ6IG51bGwsIGNvbXBsZXRlZEF0OiBudWxsLCBkdXJhdGlvbk1zOiBudWxsIH0sXG5cdFx0fSwgJ3Byb21wdCcpKTtcblx0XHQvLyBQcmVhbWJsZSBtZXNzYWdlLCB0aGVuIHRoZSBmaW5hbC1hbnN3ZXIgbWVzc2FnZTsgdHdvIGRpc3RpbmN0IGl0ZW1zLlxuXHRcdGFwcGx5KG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7IGl0ZW06IHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnbTEnLCB0ZXh0OiAnJywgcGhhc2U6IG51bGwsIG1lbW9yeUNpdGF0aW9uOiBudWxsIH0sIHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCB9KSk7XG5cdFx0YXBwbHkobWFwQWdlbnRNZXNzYWdlRGVsdGEoc3RhdGUsIHsgdGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGl0ZW1JZDogJ20xJywgZGVsdGE6ICdDb25zb2xpZGF0aW5nIHRoZSByZWNvbW1lbmRhdGlvbiBhbmQgdHJhZGVvZmZzLicgfSkpO1xuXHRcdGFwcGx5KG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7IGl0ZW06IHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnbTInLCB0ZXh0OiAnJywgcGhhc2U6IG51bGwsIG1lbW9yeUNpdGF0aW9uOiBudWxsIH0sIHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCB9KSk7XG5cdFx0YXBwbHkobWFwQWdlbnRNZXNzYWdlRGVsdGEoc3RhdGUsIHsgdGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGl0ZW1JZDogJ20yJywgZGVsdGE6ICcjIyBDb25jbHVzaW9uXFxuXFxuRG9uZS4nIH0pKTtcblxuXHRcdC8vIEFkamFjZW50IG1hcmtkb3duIHBhcnRzIGFyZSBjb2FsZXNjZWQgYnkgcGxhaW4gY29uY2F0ZW5hdGlvbiwgc28gdGhlXG5cdFx0Ly8gam9pbmVkIHRleHQgbXVzdCBrZWVwIGAjIyBDb25jbHVzaW9uYCBhdCB0aGUgc3RhcnQgb2YgYSBsaW5lLlxuXHRcdGNvbnN0IGpvaW5lZCA9IChjaGF0LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMgPz8gW10pXG5cdFx0XHQubWFwKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duID8gcGFydC5jb250ZW50IDogJycpXG5cdFx0XHQuam9pbignJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGpvaW5lZCwgJ0NvbnNvbGlkYXRpbmcgdGhlIHJlY29tbWVuZGF0aW9uIGFuZCB0cmFkZW9mZnMuXFxuXFxuIyMgQ29uY2x1c2lvblxcblxcbkRvbmUuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2l0ZW0vc3RhcnRlZCBmb3IgY29tbWFuZEV4ZWN1dGlvbiBlbWl0cyBDaGF0VG9vbENhbGxTdGFydCArIERlbHRhICsgUmVhZHkgYW5kIHJlZ2lzdGVycyB0b29sLWNhbGwgZW50cnknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kXzEnLFxuXHRcdFx0XHRjb21tYW5kOiAnbHMgLWxhJywgY3dkOiAnL3RtcCcsIHByb2Nlc3NJZDogbnVsbCxcblx0XHRcdFx0c291cmNlOiAnYWdlbnQnIGFzIG5ldmVyLCBzdGF0dXM6ICdpblByb2dyZXNzJyBhcyBuZXZlcixcblx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiBudWxsLFxuXHRcdFx0XHRleGl0Q29kZTogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAzKTtcblx0XHRjb25zdCBzdGFydCA9IGFjdGlvbnNbMF07XG5cdFx0Y29uc3QgZGVsdGEgPSBhY3Rpb25zWzFdO1xuXHRcdGNvbnN0IHJlYWR5ID0gYWN0aW9uc1syXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQudHlwZSwgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbHRhLnR5cGUsIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkeS50eXBlLCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5KTtcblx0XHRjb25zdCBlbnRyeSA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldCgnY21kXzEnKTtcblx0XHRhc3NlcnQub2soZW50cnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeSEudG9vbENhbGxJZCwgKHN0YXJ0IGFzIHsgdG9vbENhbGxJZDogc3RyaW5nIH0pLnRvb2xDYWxsSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeSEudHVybklkLCAndHVybl9hJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChkZWx0YSBhcyB7IGNvbnRlbnQ6IHN0cmluZyB9KS5jb250ZW50LCAnbHMgLWxhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZWFkeSBhcyB7IGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24gfSkuY29uZmlybWVkLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKHN0YXJ0IGFzIHsgX21ldGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9KS5fbWV0YSwgeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnY29tbWFuZEV4ZWN1dGlvbiB1bndyYXBzIHRoZSBPUyBzaGVsbCB3cmFwcGVyIGZvciBkaXNwbGF5IChzdGFydCArIGNvbXBsZXRlZCknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGNvbnN0IHN0YXJ0ZWQgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kX3dyYXAnLFxuXHRcdFx0XHRjb21tYW5kOiAnL2Jpbi96c2ggLWxjIFxcJ3RvdWNoIH4vZm9vXFwnJywgY3dkOiAnL3RtcCcsIHByb2Nlc3NJZDogbnVsbCxcblx0XHRcdFx0c291cmNlOiAnYWdlbnQnIGFzIG5ldmVyLCBzdGF0dXM6ICdpblByb2dyZXNzJyBhcyBuZXZlcixcblx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiBudWxsLFxuXHRcdFx0XHRleGl0Q29kZTogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZGVsdGEgPSBzdGFydGVkWzFdIGFzIHsgY29udGVudDogc3RyaW5nIH07XG5cdFx0Y29uc3QgcmVhZHkgPSBzdGFydGVkWzJdIGFzIHsgaW52b2NhdGlvbk1lc3NhZ2U6IHN0cmluZzsgdG9vbElucHV0OiBzdHJpbmcgfTtcblx0XHQvLyBBIHN1Y2Nlc3NmdWwgbm8tb3V0cHV0IGNvbW1hbmQgaXMgZGVmZXJyZWQgdG8gY29hbGVzY2UgYSBwb3NzaWJsZVxuXHRcdC8vIHNhbmRib3ggcHJlLWZsaWdodCByZS1ydW47IHdpdGggbm8gcmUtcnVuIGl0IGZsdXNoZXMgYXQgdHVybiBlbmQuXG5cdFx0Y29uc3QgZGVmZXJyZWQgPSBtYXBJdGVtQ29tcGxldGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdjbWRfd3JhcCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICcvYmluL3pzaCAtbGMgXFwndG91Y2ggfi9mb29cXCcnLCBjd2Q6ICcvdG1wJywgcHJvY2Vzc0lkOiBudWxsLFxuXHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGNvbW1hbmRBY3Rpb25zOiBbXSwgYWdncmVnYXRlZE91dHB1dDogJycsXG5cdFx0XHRcdGV4aXRDb2RlOiAwLCBkdXJhdGlvbk1zOiA0LFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBjb21wbGV0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGZsdXNoZWQgPSBtYXBUdXJuQ29tcGxldGVkKHN0YXRlLCB7XG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJyxcblx0XHRcdHR1cm46IHtcblx0XHRcdFx0aWQ6ICd0dXJuX2EnLFxuXHRcdFx0XHRpdGVtczogW10sIGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsIHN0YXJ0ZWRBdDogbnVsbCwgY29tcGxldGVkQXQ6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9LFxuXHRcdH0gYXMgbmV2ZXIpO1xuXHRcdGNvbnN0IGNvbXBsZXRlID0gZmx1c2hlZFswXSBhcyB7IHJlc3VsdDogeyBwYXN0VGVuc2VNZXNzYWdlOiBzdHJpbmcgfSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGVmZXJyZWQsXG5cdFx0XHRkZWx0YTogZGVsdGEuY29udGVudCxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiByZWFkeS5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdHRvb2xJbnB1dDogcmVhZHkudG9vbElucHV0LFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogY29tcGxldGUucmVzdWx0LnBhc3RUZW5zZU1lc3NhZ2UsXG5cdFx0fSwge1xuXHRcdFx0ZGVmZXJyZWQ6IFtdLFxuXHRcdFx0ZGVsdGE6ICd0b3VjaCB+L2ZvbycsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ3RvdWNoIH4vZm9vJyxcblx0XHRcdHRvb2xJbnB1dDogJ3RvdWNoIH4vZm9vJyxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gYHRvdWNoIH4vZm9vYCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbW1hbmRFeGVjdXRpb24gY29hbGVzY2VzIGEgc2FuZGJveCBwcmUtZmxpZ2h0IHdpdGggaXRzIGFwcHJvdmVkIHJlLXJ1biBpbnRvIG9uZSBib3gnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdC8vIFByZS1mbGlnaHQ6IGNvZGV4IHJ1bnMgdGhlIGNvbW1hbmQgaW4gdGhlIHNhbmRib3ggZmlyc3Q7IGl0IHByb2R1Y2VzXG5cdFx0Ly8gbm8gb3V0cHV0IGFuZCBjb21wbGV0ZXMgc3VjY2Vzc2Z1bGx5LlxuXHRcdGNvbnN0IHByZVN0YXJ0ZWQgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kX3ByZWZsaWdodCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICdjdXJsIC1zIGh0dHBzOi8vZXhhbXBsZS5jb20nLCBjd2Q6ICcvdG1wJywgcHJvY2Vzc0lkOiBudWxsLFxuXHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2luUHJvZ3Jlc3MnIGFzIG5ldmVyLFxuXHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6IG51bGwsIGV4aXRDb2RlOiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KCdjbWRfcHJlZmxpZ2h0JykhLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgcHJlQ29tcGxldGVkID0gbWFwSXRlbUNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kX3ByZWZsaWdodCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICdjdXJsIC1zIGh0dHBzOi8vZXhhbXBsZS5jb20nLCBjd2Q6ICcvdG1wJywgcHJvY2Vzc0lkOiBudWxsLFxuXHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGNvbW1hbmRBY3Rpb25zOiBbXSwgYWdncmVnYXRlZE91dHB1dDogJycsIGV4aXRDb2RlOiAwLCBkdXJhdGlvbk1zOiA0LFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBjb21wbGV0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdC8vIEVzY2FsYXRpb246IHNhbWUgY29tbWFuZCByZS1ydW4gdW5kZXIgYW4gYXBwcm92YWwgcHJvbXB0LCBuZXcgaXRlbSBpZC5cblx0XHRjb25zdCBlc2NTdGFydGVkID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmRFeGVjdXRpb24nLCBpZDogJ2NtZF9lc2NhbGF0ZWQnLFxuXHRcdFx0XHRjb21tYW5kOiAnY3VybCAtcyBodHRwczovL2V4YW1wbGUuY29tJywgY3dkOiAnL3RtcCcsIHByb2Nlc3NJZDogbnVsbCxcblx0XHRcdFx0c291cmNlOiAnYWdlbnQnIGFzIG5ldmVyLCBzdGF0dXM6ICdpblByb2dyZXNzJyBhcyBuZXZlcixcblx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiBudWxsLCBleGl0Q29kZTogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZXNjQ29tcGxldGVkID0gbWFwSXRlbUNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kX2VzY2FsYXRlZCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICdjdXJsIC1zIGh0dHBzOi8vZXhhbXBsZS5jb20nLCBjd2Q6ICcvdG1wJywgcHJvY2Vzc0lkOiBudWxsLFxuXHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGNvbW1hbmRBY3Rpb25zOiBbXSwgYWdncmVnYXRlZE91dHB1dDogJ0V4YW1wbGUgRG9tYWluJywgZXhpdENvZGU6IDAsIGR1cmF0aW9uTXM6IDQwLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBjb21wbGV0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHN0YXJ0Q291bnQgPSAoYWN0aW9uczogcmVhZG9ubHkgdW5rbm93bltdKSA9PiBhY3Rpb25zLmZpbHRlcihhID0+IChhIGFzIHsgdHlwZTogQWN0aW9uVHlwZSB9KS50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0KS5sZW5ndGg7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHQvLyBleGFjdGx5IG9uZSBib3ggb3BlbmVkIChwcmUtZmxpZ2h0J3MpLCBlc2NhbGF0aW9uIHJldXNlcyBpdFxuXHRcdFx0c3RhcnRzOiBzdGFydENvdW50KHByZVN0YXJ0ZWQpICsgc3RhcnRDb3VudChlc2NTdGFydGVkKSxcblx0XHRcdC8vIHByZS1mbGlnaHQgY29tcGxldGlvbiBkZWZlcnJlZCwgZXNjYWxhdGlvbiBzdGFydCBlbWl0cyBub3RoaW5nXG5cdFx0XHRwcmVDb21wbGV0ZWQsXG5cdFx0XHRlc2NTdGFydGVkLFxuXHRcdFx0Ly8gc2luZ2xlIGNvbXBsZXRpb24gY2FycmllcyB0aGUgZXNjYWxhdGlvbidzIHJlYWwgb3V0cHV0XG5cdFx0XHRlc2NDb21wbGV0ZTogZXNjQ29tcGxldGVkWzBdLFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0czogMSxcblx0XHRcdHByZUNvbXBsZXRlZDogW10sXG5cdFx0XHRlc2NTdGFydGVkOiBbXSxcblx0XHRcdGVzY0NvbXBsZXRlOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm5fYScsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBgY3VybCAtcyBodHRwczovL2V4YW1wbGUuY29tYCcsXG5cdFx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdFeGFtcGxlIERvbWFpbicgfV0sXG5cdFx0XHRcdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2l0ZW0vY29tbWFuZEV4ZWN1dGlvbi9vdXRwdXREZWx0YSBzdHJlYW1zIHJ1bm5pbmcgdG9vbCBjb250ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kX291dHB1dCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhpJywgY3dkOiAnL3RtcCcsIHByb2Nlc3NJZDogbnVsbCxcblx0XHRcdFx0c291cmNlOiAnYWdlbnQnIGFzIG5ldmVyLCBzdGF0dXM6ICdpblByb2dyZXNzJyBhcyBuZXZlcixcblx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiBudWxsLFxuXHRcdFx0XHRleGl0Q29kZTogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldCgnY21kX291dHB1dCcpIS50b29sQ2FsbElkO1xuXHRcdGNvbnN0IGZpcnN0ID0gbWFwQ29tbWFuZEV4ZWN1dGlvbk91dHB1dERlbHRhKHN0YXRlLCB7IHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBpdGVtSWQ6ICdjbWRfb3V0cHV0JywgZGVsdGE6ICdoaScgfSk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbWFwQ29tbWFuZEV4ZWN1dGlvbk91dHB1dERlbHRhKHN0YXRlLCB7IHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBpdGVtSWQ6ICdjbWRfb3V0cHV0JywgZGVsdGE6ICdcXG4nIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBmaXJzdCwgc2Vjb25kIH0sIHtcblx0XHRcdGZpcnN0OiBbeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2hpJyB9XSB9XSxcblx0XHRcdHNlY29uZDogW3sgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZCwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdoaVxcbicgfV0gfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2l0ZW0vY29tcGxldGVkIGZvciBjb21tYW5kRXhlY3V0aW9uIGVtaXRzIENoYXRUb29sQ2FsbENvbXBsZXRlIHdpdGggYWdncmVnYXRlZCBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdjbWRfMicsXG5cdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhpJywgY3dkOiAnL3RtcCcsIHByb2Nlc3NJZDogbnVsbCxcblx0XHRcdFx0c291cmNlOiAnYWdlbnQnIGFzIG5ldmVyLCBzdGF0dXM6ICdpblByb2dyZXNzJyBhcyBuZXZlcixcblx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiBudWxsLFxuXHRcdFx0XHRleGl0Q29kZTogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldCgnY21kXzInKSEudG9vbENhbGxJZDtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwSXRlbUNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kXzInLFxuXHRcdFx0XHRjb21tYW5kOiAnZWNobyBoaScsIGN3ZDogJy90bXAnLCBwcm9jZXNzSWQ6IG51bGwsXG5cdFx0XHRcdHNvdXJjZTogJ2FnZW50JyBhcyBuZXZlciwgc3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiAnaGlcXG4nLFxuXHRcdFx0XHRleGl0Q29kZTogMCwgZHVyYXRpb25NczogMTIsXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGNvbXBsZXRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBjb21wbGV0ZSA9IGFjdGlvbnNbMF0gYXMgeyB0eXBlOiBBY3Rpb25UeXBlOyB0b29sQ2FsbElkOiBzdHJpbmc7IHJlc3VsdDogeyBzdWNjZXNzOiBib29sZWFuOyBjb250ZW50PzogeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGU7IHRleHQ6IHN0cmluZyB9W10gfSB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0ZS50eXBlLCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGUudG9vbENhbGxJZCwgdG9vbENhbGxJZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlLnJlc3VsdC5zdWNjZXNzLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbXBsZXRlLnJlc3VsdC5jb250ZW50LCBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2hpXFxuJyB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNpemUsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdpdGVtL2NvbXBsZXRlZCBmb3IgY29tbWFuZEV4ZWN1dGlvbiB3aXRoIG5vbi16ZXJvIGV4aXQgcmVwb3J0cyBmYWlsdXJlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kXzMnLFxuXHRcdFx0XHRjb21tYW5kOiAnZmFsc2UnLCBjd2Q6ICcvdG1wJywgcHJvY2Vzc0lkOiBudWxsLFxuXHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2luUHJvZ3Jlc3MnIGFzIG5ldmVyLFxuXHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6IG51bGwsXG5cdFx0XHRcdGV4aXRDb2RlOiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwSXRlbUNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kXzMnLFxuXHRcdFx0XHRjb21tYW5kOiAnZmFsc2UnLCBjd2Q6ICcvdG1wJywgcHJvY2Vzc0lkOiBudWxsLFxuXHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGNvbW1hbmRBY3Rpb25zOiBbXSwgYWdncmVnYXRlZE91dHB1dDogJycsXG5cdFx0XHRcdGV4aXRDb2RlOiAxLCBkdXJhdGlvbk1zOiAzLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBjb21wbGV0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbXBsZXRlID0gYWN0aW9uc1swXSBhcyB7IHJlc3VsdDogeyBzdWNjZXNzOiBib29sZWFuOyBlcnJvcj86IHsgbWVzc2FnZTogc3RyaW5nIH0gfSB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0ZS5yZXN1bHQuc3VjY2VzcywgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0ZS5yZXN1bHQuZXJyb3I/Lm1lc3NhZ2UsICdFeGl0IGNvZGUgMScpO1xuXHR9KTtcblxuXHR0ZXN0KCd3ZWJTZWFyY2ggaXRlbSBtYXBzIHRvIHNlYXJjaCB0b29sIGNhbGwgbGlmZWN5Y2xlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRjb25zdCBzdGFydEFjdGlvbnMgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnd2ViU2VhcmNoJywgaWQ6ICd3ZWJfMScsIHF1ZXJ5OiAndnNjb2RlIHRlc3RzJyxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6ICdzZWFyY2gnLCBxdWVyeTogJ3ZzY29kZSB0ZXN0cycsIHF1ZXJpZXM6IG51bGwgfSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldCgnd2ViXzEnKSEudG9vbENhbGxJZDtcblx0XHRjb25zdCBjb21wbGV0ZUFjdGlvbnMgPSBtYXBJdGVtQ29tcGxldGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICd3ZWJTZWFyY2gnLCBpZDogJ3dlYl8xJywgcXVlcnk6ICd2c2NvZGUgdGVzdHMnLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogJ3NlYXJjaCcsIHF1ZXJ5OiAndnNjb2RlIHRlc3RzJywgcXVlcmllczogbnVsbCB9LFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBjb21wbGV0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhcnRUeXBlczogc3RhcnRBY3Rpb25zLm1hcChhY3Rpb24gPT4gYWN0aW9uLnR5cGUpLFxuXHRcdFx0c3RhcnRNZXRhOiBzdGFydEFjdGlvbnNbMF0/LnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQgPyBzdGFydEFjdGlvbnNbMF0uX21ldGEgOiB1bmRlZmluZWQsXG5cdFx0XHRkZWx0YTogc3RhcnRBY3Rpb25zWzFdLFxuXHRcdFx0cmVhZHk6IHN0YXJ0QWN0aW9uc1syXSxcblx0XHRcdGNvbXBsZXRlOiBjb21wbGV0ZUFjdGlvbnMsXG5cdFx0XHRyZW1haW5pbmdUb29sQ2FsbHM6IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNpemUsXG5cdFx0fSwge1xuXHRcdFx0c3RhcnRUeXBlczogW0FjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHldLFxuXHRcdFx0c3RhcnRNZXRhOiB7IHRvb2xLaW5kOiAnc2VhcmNoJyB9LFxuXHRcdFx0ZGVsdGE6IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgY29udGVudDogJ3ZzY29kZSB0ZXN0cycgfSxcblx0XHRcdHJlYWR5OiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGludm9jYXRpb25NZXNzYWdlOiAndnNjb2RlIHRlc3RzJywgdG9vbElucHV0OiAndnNjb2RlIHRlc3RzJywgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsIF9tZXRhOiB7IHRvb2xLaW5kOiAnc2VhcmNoJyB9IH0sXG5cdFx0XHRjb21wbGV0ZTogW3sgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgcmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdTZWFyY2hlZCB2c2NvZGUgdGVzdHMnIH0gfV0sXG5cdFx0XHRyZW1haW5pbmdUb29sQ2FsbHM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbGVDaGFuZ2UgaXRlbSBtYXBzIHRvIGZpbGUgZWRpdCB0b29sIGNhbGwgbGlmZWN5Y2xlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRjb25zdCBjaGFuZ2VzID0gW3sgcGF0aDogJ3NyYy9hLnRzJywga2luZDogeyB0eXBlOiAndXBkYXRlJywgbW92ZV9wYXRoOiBudWxsIH0sIGRpZmY6ICdAQCAtMSArMSBAQFxcbi1vbGRcXG4rbmV3JyB9XSBhcyBjb25zdDtcblx0XHRjb25zdCBzdGFydEFjdGlvbnMgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbTogeyB0eXBlOiAnZmlsZUNoYW5nZScsIGlkOiAnZmlsZV8xJywgY2hhbmdlcywgc3RhdHVzOiAnaW5Qcm9ncmVzcycgfSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KCdmaWxlXzEnKSEudG9vbENhbGxJZDtcblx0XHRjb25zdCBwYXRjaEFjdGlvbnMgPSBtYXBGaWxlQ2hhbmdlUGF0Y2hVcGRhdGVkKHN0YXRlLCB7IHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBpdGVtSWQ6ICdmaWxlXzEnLCBjaGFuZ2VzOiBbeyBwYXRoOiAnc3JjL2IudHMnLCBraW5kOiB7IHR5cGU6ICdhZGQnIH0sIGRpZmY6ICcraGVsbG8nIH1dIH0pO1xuXHRcdGNvbnN0IGNvbXBsZXRlQWN0aW9ucyA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2ZpbGVDaGFuZ2UnLCBpZDogJ2ZpbGVfMScsIGNoYW5nZXMsIHN0YXR1czogJ2NvbXBsZXRlZCcgfSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBjb21wbGV0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhcnRUeXBlczogc3RhcnRBY3Rpb25zLm1hcChhY3Rpb24gPT4gYWN0aW9uLnR5cGUpLFxuXHRcdFx0ZGVsdGE6IHN0YXJ0QWN0aW9uc1sxXSxcblx0XHRcdHJlYWR5OiBzdGFydEFjdGlvbnNbMl0sXG5cdFx0XHRpbml0aWFsQ29udGVudDogc3RhcnRBY3Rpb25zWzNdLFxuXHRcdFx0cGF0Y2hBY3Rpb25zLFxuXHRcdFx0Y29tcGxldGVBY3Rpb25zLFxuXHRcdFx0cmVtYWluaW5nVG9vbENhbGxzOiBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5zaXplLFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0VHlwZXM6IFtBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkXSxcblx0XHRcdGRlbHRhOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGNvbnRlbnQ6ICd1cGRhdGU6IHNyYy9hLnRzJyB9LFxuXHRcdFx0cmVhZHk6IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgaW52b2NhdGlvbk1lc3NhZ2U6ICd1cGRhdGU6IHNyYy9hLnRzJywgdG9vbElucHV0OiAndXBkYXRlOiBzcmMvYS50cycsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0sXG5cdFx0XHRpbml0aWFsQ29udGVudDogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ3VwZGF0ZTogc3JjL2EudHNcXG5AQCAtMSArMSBAQFxcbi1vbGRcXG4rbmV3JyB9XSB9LFxuXHRcdFx0cGF0Y2hBY3Rpb25zOiBbeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2FkZDogc3JjL2IudHNcXG4raGVsbG8nIH1dIH1dLFxuXHRcdFx0Y29tcGxldGVBY3Rpb25zOiBbeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLCByZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ0FwcGxpZWQgZmlsZSBjaGFuZ2VzJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICd1cGRhdGU6IHNyYy9hLnRzXFxuQEAgLTEgKzEgQEBcXG4tb2xkXFxuK25ldycgfV0gfSB9XSxcblx0XHRcdHJlbWFpbmluZ1Rvb2xDYWxsczogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWNwVG9vbENhbGwgaXRlbSBtYXBzIHRvIHRvb2wgY2FsbCBsaWZlY3ljbGUgd2l0aCBwcm9ncmVzcycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3Qgc3RhcnRBY3Rpb25zID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ21jcFRvb2xDYWxsJywgaWQ6ICdtY3BfMScsIHNlcnZlcjogJ2dpdGh1YicsIHRvb2w6ICdzZWFyY2gnLCBzdGF0dXM6ICdpblByb2dyZXNzJywgYXJndW1lbnRzOiB7IHF1ZXJ5OiAndnNjb2RlJyB9LCBtY3BBcHBSZXNvdXJjZVVyaTogdW5kZWZpbmVkLCBwbHVnaW5JZDogbnVsbCwgcmVzdWx0OiBudWxsLCBlcnJvcjogbnVsbCwgZHVyYXRpb25NczogbnVsbCB9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoJ21jcF8xJykhLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NBY3Rpb25zID0gbWFwTWNwVG9vbENhbGxQcm9ncmVzcyhzdGF0ZSwgeyB0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgaXRlbUlkOiAnbWNwXzEnLCBtZXNzYWdlOiAnU2VhcmNoaW5nJyB9KTtcblx0XHRjb25zdCBjb21wbGV0ZUFjdGlvbnMgPSBtYXBJdGVtQ29tcGxldGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7IHR5cGU6ICdtY3BUb29sQ2FsbCcsIGlkOiAnbWNwXzEnLCBzZXJ2ZXI6ICdnaXRodWInLCB0b29sOiAnc2VhcmNoJywgc3RhdHVzOiAnY29tcGxldGVkJywgYXJndW1lbnRzOiB7IHF1ZXJ5OiAndnNjb2RlJyB9LCBtY3BBcHBSZXNvdXJjZVVyaTogdW5kZWZpbmVkLCBwbHVnaW5JZDogbnVsbCwgcmVzdWx0OiB7IGNvbnRlbnQ6IFsnZG9uZSddLCBzdHJ1Y3R1cmVkQ29udGVudDogeyBjb3VudDogMSB9LCBfbWV0YTogbnVsbCB9LCBlcnJvcjogbnVsbCwgZHVyYXRpb25NczogNSB9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGNvbXBsZXRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGFydFR5cGVzOiBzdGFydEFjdGlvbnMubWFwKGFjdGlvbiA9PiBhY3Rpb24udHlwZSksXG5cdFx0XHRkZWx0YTogc3RhcnRBY3Rpb25zWzFdLFxuXHRcdFx0cmVhZHk6IHN0YXJ0QWN0aW9uc1syXSxcblx0XHRcdHByb2dyZXNzQWN0aW9ucyxcblx0XHRcdGNvbXBsZXRlQWN0aW9ucyxcblx0XHRcdHJlbWFpbmluZ1Rvb2xDYWxsczogc3RhdGUuaXRlbVRvVG9vbENhbGwuc2l6ZSxcblx0XHR9LCB7XG5cdFx0XHRzdGFydFR5cGVzOiBbQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSwgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeV0sXG5cdFx0XHRkZWx0YTogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLCBjb250ZW50OiAne1xcbiAgXCJxdWVyeVwiOiBcInZzY29kZVwiXFxufScgfSxcblx0XHRcdHJlYWR5OiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGludm9jYXRpb25NZXNzYWdlOiAnQ2FsbGluZyBnaXRodWIuc2VhcmNoJywgdG9vbElucHV0OiAne1xcbiAgXCJxdWVyeVwiOiBcInZzY29kZVwiXFxufScsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0sXG5cdFx0XHRwcm9ncmVzc0FjdGlvbnM6IFt7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWQsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnU2VhcmNoaW5nJyB9XSB9XSxcblx0XHRcdGNvbXBsZXRlQWN0aW9uczogW3sgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgcmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdDYWxsZWQgZ2l0aHViLnNlYXJjaCcsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnZG9uZVxcbntcXG4gIFwiY291bnRcIjogMVxcbn0nIH1dIH0gfV0sXG5cdFx0XHRyZW1haW5pbmdUb29sQ2FsbHM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21jcFRvb2xDYWxsIHN0YXJ0IGNhcnJpZXMgYW4gTUNQIGNvbnRyaWJ1dG9yIHdoZW4gdGhlIHNlcnZlciBoYXMgYSBjdXN0b21pemF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRzdGF0ZS5tY3BDdXN0b21pemF0aW9uSWRzLnNldCgnZ2l0aHViJywgJ2N1c3QtZ2gnKTtcblx0XHRjb25zdCBzdGFydEFjdGlvbnMgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnbWNwVG9vbENhbGwnLCBpZDogJ21jcF9jJywgc2VydmVyOiAnZ2l0aHViJywgdG9vbDogJ3NlYXJjaCcsXG5cdFx0XHRcdHN0YXR1czogJ2luUHJvZ3Jlc3MnLCBhcmd1bWVudHM6IHt9LCBtY3BBcHBSZXNvdXJjZVVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRwbHVnaW5JZDogbnVsbCwgcmVzdWx0OiBudWxsLCBlcnJvcjogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBzdGFydEFjdGlvbnNbMF07XG5cdFx0aWYgKHN0YXJ0LnR5cGUgIT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignZXhwZWN0ZWQgYSBDaGF0VG9vbENhbGxTdGFydCBhY3Rpb24nKTtcblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGFydC5jb250cmlidXRvciwgeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ2N1c3QtZ2gnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtY3BUb29sQ2FsbCBzdGFydCBjYXJyaWVzIG5vIGNvbnRyaWJ1dG9yIHdoZW4gdGhlIHNlcnZlciBoYXMgbm8gY3VzdG9taXphdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Ly8gbWNwQ3VzdG9taXphdGlvbklkcyBpcyBlbXB0eTogdGhlIGFnZW50IGhhcyBub3QgYXBwbGllZCBhbiBNQ1Bcblx0XHQvLyBpbnZlbnRvcnkgeWV0LCBzbyB0aGUgc3RhcnQgbXVzdCBub3Qgc3RhbXAgYSAoYm9ndXMpIE1DUCBjb250cmlidXRvciBcdTIwMTRcblx0XHQvLyB0aGUgdG9vbCB0aGVuIHJlcG9ydHMgdGhlIGRlZmF1bHQgYGFnZW50SG9zdGAgc291cmNlLlxuXHRcdGNvbnN0IHN0YXJ0QWN0aW9ucyA9IG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdtY3BUb29sQ2FsbCcsIGlkOiAnbWNwX24nLCBzZXJ2ZXI6ICdnaXRodWInLCB0b29sOiAnc2VhcmNoJyxcblx0XHRcdFx0c3RhdHVzOiAnaW5Qcm9ncmVzcycsIGFyZ3VtZW50czoge30sIG1jcEFwcFJlc291cmNlVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBsdWdpbklkOiBudWxsLCByZXN1bHQ6IG51bGwsIGVycm9yOiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCBzdGFydCA9IHN0YXJ0QWN0aW9uc1swXTtcblx0XHRpZiAoc3RhcnQudHlwZSAhPT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdleHBlY3RlZCBhIENoYXRUb29sQ2FsbFN0YXJ0IGFjdGlvbicpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQuY29udHJpYnV0b3IsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgaG9zdC1kZWNsaW5lZCBjb21tYW5kRXhlY3V0aW9uIHJlcG9ydHMgcmVzdWx0LmVycm9yLmNvZGUgPSBkZW5pZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdjbWRfZCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICdybSBmaWxlJywgY3dkOiAnL3RtcCcsIHByb2Nlc3NJZDogbnVsbCxcblx0XHRcdFx0c291cmNlOiAnYWdlbnQnIGFzIG5ldmVyLCBzdGF0dXM6ICdpblByb2dyZXNzJyBhcyBuZXZlcixcblx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiBudWxsLFxuXHRcdFx0XHRleGl0Q29kZTogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW50cnkgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoJ2NtZF9kJyk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdleHBlY3RlZCBhIHRyYWNrZWQgdG9vbCBjYWxsJyk7XG5cdFx0fVxuXHRcdC8vIFRoZSBob3N0IGRlY2xpbmVkIHRoZSBhcHByb3ZhbCAocmVjb3JkZWQgYnkgcmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QpLlxuXHRcdHN0YXRlLmRlY2xpbmVkVG9vbENhbGxzLmFkZChlbnRyeS50b29sQ2FsbElkKTtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwSXRlbUNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kX2QnLFxuXHRcdFx0XHRjb21tYW5kOiAncm0gZmlsZScsIGN3ZDogJy90bXAnLCBwcm9jZXNzSWQ6IG51bGwsXG5cdFx0XHRcdHNvdXJjZTogJ2FnZW50JyBhcyBuZXZlciwgc3RhdHVzOiAnZmFpbGVkJyBhcyBuZXZlcixcblx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiBudWxsLFxuXHRcdFx0XHRleGl0Q29kZTogbnVsbCwgZHVyYXRpb25NczogMSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgY29tcGxldGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCBjb21wbGV0ZSA9IGFjdGlvbnNbMF07XG5cdFx0aWYgKGNvbXBsZXRlLnR5cGUgIT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignZXhwZWN0ZWQgYSBDaGF0VG9vbENhbGxDb21wbGV0ZSBhY3Rpb24nKTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlLnJlc3VsdC5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlLnJlc3VsdC5lcnJvcj8uY29kZSwgJ2RlbmllZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGhvc3QtZGVjbGluZWQgbWNwVG9vbENhbGwgcmVwb3J0cyByZXN1bHQuZXJyb3IuY29kZSA9IGRlbmllZCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0bWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ21jcFRvb2xDYWxsJywgaWQ6ICdtY3BfZCcsIHNlcnZlcjogJ2dpdGh1YicsIHRvb2w6ICdzZWFyY2gnLFxuXHRcdFx0XHRzdGF0dXM6ICdpblByb2dyZXNzJywgYXJndW1lbnRzOiB7fSwgbWNwQXBwUmVzb3VyY2VVcmk6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGx1Z2luSWQ6IG51bGwsIHJlc3VsdDogbnVsbCwgZXJyb3I6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVudHJ5ID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KCdtY3BfZCcpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignZXhwZWN0ZWQgYSB0cmFja2VkIHRvb2wgY2FsbCcpO1xuXHRcdH1cblx0XHQvLyBUaGUgaG9zdCBkZWNsaW5lZCB0aGUgYXBwcm92YWwgKHJlY29yZGVkIGJ5IHJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KS5cblx0XHQvLyBUaGUgZGVjbGluZSBpcyBkcmFpbmVkIG9uY2UgaW4gdGhlIHNoYXJlZCBjb21wbGV0aW9uIHByb2xvZ3VlLCBzbyBhXG5cdFx0Ly8gbm9uLWNvbW1hbmQgdG9vbCB0eXBlIGlzIGNsYXNzaWZpZWQgYXMgYSBkZW5pYWwganVzdCBsaWtlIGEgY29tbWFuZC5cblx0XHRzdGF0ZS5kZWNsaW5lZFRvb2xDYWxscy5hZGQoZW50cnkudG9vbENhbGxJZCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ21jcFRvb2xDYWxsJywgaWQ6ICdtY3BfZCcsIHNlcnZlcjogJ2dpdGh1YicsIHRvb2w6ICdzZWFyY2gnLFxuXHRcdFx0XHRzdGF0dXM6ICdmYWlsZWQnLCBhcmd1bWVudHM6IHt9LCBtY3BBcHBSZXNvdXJjZVVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRwbHVnaW5JZDogbnVsbCwgcmVzdWx0OiBudWxsLCBlcnJvcjogbnVsbCwgZHVyYXRpb25NczogMSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgY29tcGxldGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCBjb21wbGV0ZSA9IGFjdGlvbnNbMF07XG5cdFx0aWYgKGNvbXBsZXRlLnR5cGUgIT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignZXhwZWN0ZWQgYSBDaGF0VG9vbENhbGxDb21wbGV0ZSBhY3Rpb24nKTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlLnJlc3VsdC5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlLnJlc3VsdC5lcnJvcj8uY29kZSwgJ2RlbmllZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xsYWJBZ2VudFRvb2xDYWxsIHNwYXduQWdlbnQgc3RhcnQgcmVuZGVycyBjb21wYWN0bHkgKG5vIHByb21wdCBkdW1wIFx1MjAxNCB0aGUgcGVlciBjaGF0IHNob3dzIGl0KScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3Qgc3RhcnRBY3Rpb25zID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbGxhYkFnZW50VG9vbENhbGwnLCBpZDogJ2NvbGxhYl8xJywgdG9vbDogJ3NwYXduQWdlbnQnLFxuXHRcdFx0XHRzdGF0dXM6ICdpblByb2dyZXNzJywgc2VuZGVyVGhyZWFkSWQ6ICd0aHJfMScsIHJlY2VpdmVyVGhyZWFkSWRzOiBbXSxcblx0XHRcdFx0cHJvbXB0OiAnSW52ZXN0aWdhdGUgdGhlIGZhaWxpbmcgdGVzdCcsIG1vZGVsOiAnZ3B0LTUuNScsXG5cdFx0XHRcdHJlYXNvbmluZ0VmZm9ydDogbnVsbCwgYWdlbnRzU3RhdGVzOiB7fSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldCgnY29sbGFiXzEnKSEudG9vbENhbGxJZDtcblx0XHQvLyBzcGF3bkFnZW50IG9wZW5zIGEgcmVhZC1vbmx5IHBlZXIgY2hhdCAodGhlIGhvc3QgYXR0YWNoZXMgdGhlXG5cdFx0Ly8gc3ViYWdlbnQtZGlzY292ZXJ5IGJsb2NrIHRvIHRoaXMgdG9vbCBjYWxsKSwgc28gdGhlIHJhdyBwcm9tcHQgaXNcblx0XHQvLyBkZWxpYmVyYXRlbHkgTk9UIGR1bXBlZCBpbnRvIHRoZSB0b29sIGJveC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjdGlvbnM6IHN0YXJ0QWN0aW9ucyxcblx0XHRcdGVudHJ5VG9vbE5hbWU6IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldCgnY29sbGFiXzEnKSEudG9vbE5hbWUsXG5cdFx0fSwge1xuXHRcdFx0YWN0aW9uczogW1xuXHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIHRvb2xOYW1lOiAnY29kZXguc3Bhd25BZ2VudCcsIGRpc3BsYXlOYW1lOiAnU3Bhd24gYWdlbnQnIH0sXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgaW52b2NhdGlvbk1lc3NhZ2U6ICdTcGF3bmluZyBhZ2VudCcsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0sXG5cdFx0XHRdLFxuXHRcdFx0ZW50cnlUb29sTmFtZTogJ2NvZGV4LnNwYXduQWdlbnQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xsYWJBZ2VudFRvb2xDYWxsIHNlbmRJbnB1dCBzdGFydCBzdGlsbCBjYXJyaWVzIHRoZSBwcm9tcHQgKG9ubHkgc3Bhd25BZ2VudCBpcyBjb21wYWN0ZWQpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRjb25zdCBzdGFydEFjdGlvbnMgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29sbGFiQWdlbnRUb29sQ2FsbCcsIGlkOiAnY29sbGFiX3NpJywgdG9vbDogJ3NlbmRJbnB1dCcsXG5cdFx0XHRcdHN0YXR1czogJ2luUHJvZ3Jlc3MnLCBzZW5kZXJUaHJlYWRJZDogJ3Rocl8xJywgcmVjZWl2ZXJUaHJlYWRJZHM6IFsnc3ViXzEnXSxcblx0XHRcdFx0cHJvbXB0OiAnQWxzbyBjaGVjayB0aGUgQ0hBTkdFTE9HJywgbW9kZWw6IG51bGwsXG5cdFx0XHRcdHJlYXNvbmluZ0VmZm9ydDogbnVsbCwgYWdlbnRzU3RhdGVzOiB7fSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldCgnY29sbGFiX3NpJykhLnRvb2xDYWxsSWQ7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGFydEFjdGlvbnMsIFtcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgdG9vbE5hbWU6ICdjb2RleC5zZW5kSW5wdXQnLCBkaXNwbGF5TmFtZTogJ1NlbmQgaW5wdXQgdG8gYWdlbnQnIH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGNvbnRlbnQ6ICdBbHNvIGNoZWNrIHRoZSBDSEFOR0VMT0cnIH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGludm9jYXRpb25NZXNzYWdlOiAnU2VuZGluZyBpbnB1dCB0byBhZ2VudCcsIHRvb2xJbnB1dDogJ0Fsc28gY2hlY2sgdGhlIENIQU5HRUxPRycsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGxhYkFnZW50VG9vbENhbGwgc3Bhd25BZ2VudCBjb21wbGV0ZWQgcmVuZGVycyB0aGUgc3ViYWdlbnQgcmVzdWx0IGFzIHRvb2wgb3V0cHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29sbGFiQWdlbnRUb29sQ2FsbCcsIGlkOiAnY29sbGFiXzInLCB0b29sOiAnc3Bhd25BZ2VudCcsXG5cdFx0XHRcdHN0YXR1czogJ2luUHJvZ3Jlc3MnLCBzZW5kZXJUaHJlYWRJZDogJ3Rocl8xJywgcmVjZWl2ZXJUaHJlYWRJZHM6IFsnc3ViXzEnXSxcblx0XHRcdFx0cHJvbXB0OiAnSW52ZXN0aWdhdGUgdGhlIGZhaWxpbmcgdGVzdCcsIG1vZGVsOiAnZ3B0LTUuNScsXG5cdFx0XHRcdHJlYXNvbmluZ0VmZm9ydDogbnVsbCwgYWdlbnRzU3RhdGVzOiB7fSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldCgnY29sbGFiXzInKSEudG9vbENhbGxJZDtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwSXRlbUNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29sbGFiQWdlbnRUb29sQ2FsbCcsIGlkOiAnY29sbGFiXzInLCB0b29sOiAnc3Bhd25BZ2VudCcsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsIHNlbmRlclRocmVhZElkOiAndGhyXzEnLCByZWNlaXZlclRocmVhZElkczogWydzdWJfMSddLFxuXHRcdFx0XHRwcm9tcHQ6ICdJbnZlc3RpZ2F0ZSB0aGUgZmFpbGluZyB0ZXN0JywgbW9kZWw6ICdncHQtNS41Jyxcblx0XHRcdFx0cmVhc29uaW5nRWZmb3J0OiBudWxsLFxuXHRcdFx0XHRhZ2VudHNTdGF0ZXM6IHsgc3ViXzE6IHsgc3RhdHVzOiAnY29tcGxldGVkJywgbWVzc2FnZTogJ0ZvdW5kIHRoZSBidWcgaW4gZm9vLnRzJyB9IH0sXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGNvbXBsZXRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFjdGlvbnMsIHJlbWFpbmluZ1Rvb2xDYWxsczogc3RhdGUuaXRlbVRvVG9vbENhbGwuc2l6ZSB9LCB7XG5cdFx0XHRhY3Rpb25zOiBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdTcGF3bmVkIGFnZW50Jyxcblx0XHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ0NvbXBsZXRlZCBcdTIwMTQgRm91bmQgdGhlIGJ1ZyBpbiBmb28udHMnIH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0sXG5cdFx0XHRyZW1haW5pbmdUb29sQ2FsbHM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGxhYkFnZW50VG9vbENhbGwgd2FpdCBhZ2dyZWdhdGVzIHJlc3VsdHMgZnJvbSBtdWx0aXBsZSBzdWJhZ2VudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdjb2xsYWJBZ2VudFRvb2xDYWxsJywgaWQ6ICdjb2xsYWJfd2FpdCcsIHRvb2w6ICd3YWl0Jyxcblx0XHRcdFx0c3RhdHVzOiAnaW5Qcm9ncmVzcycsIHNlbmRlclRocmVhZElkOiAndGhyXzEnLCByZWNlaXZlclRocmVhZElkczogWydzdWJfMScsICdzdWJfMiddLFxuXHRcdFx0XHRwcm9tcHQ6IG51bGwsIG1vZGVsOiBudWxsLCByZWFzb25pbmdFZmZvcnQ6IG51bGwsIGFnZW50c1N0YXRlczoge30sXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoJ2NvbGxhYl93YWl0JykhLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbGxhYkFnZW50VG9vbENhbGwnLCBpZDogJ2NvbGxhYl93YWl0JywgdG9vbDogJ3dhaXQnLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnLCBzZW5kZXJUaHJlYWRJZDogJ3Rocl8xJywgcmVjZWl2ZXJUaHJlYWRJZHM6IFsnc3ViXzEnLCAnc3ViXzInXSxcblx0XHRcdFx0cHJvbXB0OiBudWxsLCBtb2RlbDogbnVsbCwgcmVhc29uaW5nRWZmb3J0OiBudWxsLFxuXHRcdFx0XHRhZ2VudHNTdGF0ZXM6IHtcblx0XHRcdFx0XHRzdWJfMTogeyBzdGF0dXM6ICdjb21wbGV0ZWQnLCBtZXNzYWdlOiAnTWlncmF0aW9uIGZpbmlzaGVkJyB9LFxuXHRcdFx0XHRcdHN1Yl8yOiB7IHN0YXR1czogJ3J1bm5pbmcnLCBtZXNzYWdlOiAnU3RpbGwgYW5hbHlzaW5nJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBjb21wbGV0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucywgW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0ZpbmlzaGVkIHdhaXRpbmcnLFxuXHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ0FnZW50IDE6IENvbXBsZXRlZCBcdTIwMTQgTWlncmF0aW9uIGZpbmlzaGVkXFxuQWdlbnQgMjogUnVubmluZyBcdTIwMTQgU3RpbGwgYW5hbHlzaW5nJyB9XSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xsYWJBZ2VudFRvb2xDYWxsIGZhaWx1cmUgcmVwb3J0cyB0aGUgZXJyb3JlZCBzdWJhZ2VudCBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0bWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbGxhYkFnZW50VG9vbENhbGwnLCBpZDogJ2NvbGxhYl9mYWlsJywgdG9vbDogJ3NwYXduQWdlbnQnLFxuXHRcdFx0XHRzdGF0dXM6ICdpblByb2dyZXNzJywgc2VuZGVyVGhyZWFkSWQ6ICd0aHJfMScsIHJlY2VpdmVyVGhyZWFkSWRzOiBbJ3N1Yl8xJ10sXG5cdFx0XHRcdHByb21wdDogJ1JlZmFjdG9yIHRoZSBwYXJzZXInLCBtb2RlbDogJ2dwdC01LjUnLCByZWFzb25pbmdFZmZvcnQ6IG51bGwsIGFnZW50c1N0YXRlczoge30sXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoJ2NvbGxhYl9mYWlsJykhLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbGxhYkFnZW50VG9vbENhbGwnLCBpZDogJ2NvbGxhYl9mYWlsJywgdG9vbDogJ3NwYXduQWdlbnQnLFxuXHRcdFx0XHRzdGF0dXM6ICdmYWlsZWQnLCBzZW5kZXJUaHJlYWRJZDogJ3Rocl8xJywgcmVjZWl2ZXJUaHJlYWRJZHM6IFsnc3ViXzEnXSxcblx0XHRcdFx0cHJvbXB0OiAnUmVmYWN0b3IgdGhlIHBhcnNlcicsIG1vZGVsOiAnZ3B0LTUuNScsIHJlYXNvbmluZ0VmZm9ydDogbnVsbCxcblx0XHRcdFx0YWdlbnRzU3RhdGVzOiB7IHN1Yl8xOiB7IHN0YXR1czogJ2Vycm9yZWQnLCBtZXNzYWdlOiAnTW9kZWwgdW5hdmFpbGFibGUnIH0gfSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgY29tcGxldGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMsIFt7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnU3Bhd24gYWdlbnQgZmFpbGVkJyxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdFcnJvcmVkIFx1MjAxNCBNb2RlbCB1bmF2YWlsYWJsZScgfV0sXG5cdFx0XHRcdGVycm9yOiB7IG1lc3NhZ2U6ICdDb2xsYWIgYWdlbnQgZmFpbGVkJyB9LFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2R5bmFtaWNUb29sQ2FsbCBpdGVtIGNhcnJpZXMgYSBDbGllbnQgY29udHJpYnV0b3Igd2hlbiBhIGNsaWVudCBvd25zIHRoZSB0b29sJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xTZXQgPSBuZXcgQWN0aXZlQ2xpZW50VG9vbFNldCgpO1xuXHRcdHRvb2xTZXQuc2V0KCd3aW4tNycsIFt7IG5hbWU6ICdnZXRfbWFnaWNfd29yZCcgfV0pO1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUobmV3IFNldCgpLCB0b29sU2V0KTtcblx0XHRjb25zdCBzdGFydEFjdGlvbnMgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbTogeyB0eXBlOiAnZHluYW1pY1Rvb2xDYWxsJywgaWQ6ICdkeW5fMicsIG5hbWVzcGFjZTogbnVsbCwgdG9vbDogJ2dldF9tYWdpY193b3JkJywgYXJndW1lbnRzOiB7fSwgc3RhdHVzOiAnaW5Qcm9ncmVzcycsIGNvbnRlbnRJdGVtczogbnVsbCwgc3VjY2VzczogbnVsbCwgZHVyYXRpb25NczogbnVsbCB9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHN0YXJ0ID0gc3RhcnRBY3Rpb25zWzBdIGFzIHsgdHlwZTogQWN0aW9uVHlwZTsgdG9vbE5hbWU6IHN0cmluZzsgY29udHJpYnV0b3I/OiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kOyBjbGllbnRJZDogc3RyaW5nIH0gfTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHR5cGU6IHN0YXJ0LnR5cGUsXG5cdFx0XHR0b29sTmFtZTogc3RhcnQudG9vbE5hbWUsXG5cdFx0XHRjb250cmlidXRvcjogc3RhcnQuY29udHJpYnV0b3IsXG5cdFx0fSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdHRvb2xOYW1lOiAnZ2V0X21hZ2ljX3dvcmQnLFxuXHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ3dpbi03JyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkeW5hbWljVG9vbENhbGwgaXRlbSBvbWl0cyB0aGUgQ2xpZW50IGNvbnRyaWJ1dG9yIGZvciBhIHNlcnZlciB0b29sJywgKCkgPT4ge1xuXHRcdC8vIEEgc2VydmVyIHRvb2wgaXMgcmVnaXN0ZXJlZCB1bmRlciBpdHMgYmFyZSBuYW1lIGFuZCBleGVjdXRlc1xuXHRcdC8vIGluLXByb2Nlc3MsIHNvIGl0IG11c3Qgbm90IGNhcnJ5IGEgQ2xpZW50IGNvbnRyaWJ1dG9yIGV2ZW4gd2hlbiBhXG5cdFx0Ly8gd29ya2JlbmNoIGNsaWVudCBvd25zIHRoZSAob3RoZXIpIGNsaWVudCB0b29scy5cblx0XHRjb25zdCB0b29sU2V0ID0gbmV3IEFjdGl2ZUNsaWVudFRvb2xTZXQoKTtcblx0XHR0b29sU2V0LnNldCgnd2luLTcnLCBbeyBuYW1lOiAnZ2V0X21hZ2ljX3dvcmQnIH1dKTtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKG5ldyBTZXQoWydhZGRDb21tZW50J10pLCB0b29sU2V0KTtcblx0XHRjb25zdCBzdGFydEFjdGlvbnMgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbTogeyB0eXBlOiAnZHluYW1pY1Rvb2xDYWxsJywgaWQ6ICdkeW5fMycsIG5hbWVzcGFjZTogbnVsbCwgdG9vbDogJ2FkZENvbW1lbnQnLCBhcmd1bWVudHM6IHt9LCBzdGF0dXM6ICdpblByb2dyZXNzJywgY29udGVudEl0ZW1zOiBudWxsLCBzdWNjZXNzOiBudWxsLCBkdXJhdGlvbk1zOiBudWxsIH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBzdGFydEFjdGlvbnNbMF0gYXMgeyB0eXBlOiBBY3Rpb25UeXBlOyB0b29sTmFtZTogc3RyaW5nOyBjb250cmlidXRvcj86IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQ7IGNsaWVudElkOiBzdHJpbmcgfSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dHlwZTogc3RhcnQudHlwZSxcblx0XHRcdHRvb2xOYW1lOiBzdGFydC50b29sTmFtZSxcblx0XHRcdGNvbnRyaWJ1dG9yOiBzdGFydC5jb250cmlidXRvcixcblx0XHR9LCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0dG9vbE5hbWU6ICdhZGRDb21tZW50Jyxcblx0XHRcdGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2R5bmFtaWNUb29sQ2FsbCBpdGVtIG1hcHMgdG8gdG9vbCBjYWxsIGxpZmVjeWNsZScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3Qgc3RhcnRBY3Rpb25zID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2R5bmFtaWNUb29sQ2FsbCcsIGlkOiAnZHluXzEnLCBuYW1lc3BhY2U6ICdjbGllbnQnLCB0b29sOiAnbG9va3VwJywgYXJndW1lbnRzOiB7IHN5bWJvbDogJ0EnIH0sIHN0YXR1czogJ2luUHJvZ3Jlc3MnLCBjb250ZW50SXRlbXM6IG51bGwsIHN1Y2Nlc3M6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwgfSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KCdkeW5fMScpIS50b29sQ2FsbElkO1xuXHRcdGNvbnN0IGNvbXBsZXRlQWN0aW9ucyA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2R5bmFtaWNUb29sQ2FsbCcsIGlkOiAnZHluXzEnLCBuYW1lc3BhY2U6ICdjbGllbnQnLCB0b29sOiAnbG9va3VwJywgYXJndW1lbnRzOiB7IHN5bWJvbDogJ0EnIH0sIHN0YXR1czogJ2NvbXBsZXRlZCcsIGNvbnRlbnRJdGVtczogW3sgdHlwZTogJ2lucHV0VGV4dCcsIHRleHQ6ICdGb3VuZCBBJyB9LCB7IHR5cGU6ICdpbnB1dEltYWdlJywgaW1hZ2VVcmw6ICdodHRwczovL2V4YW1wbGUudGVzdC9hLnBuZycgfV0sIHN1Y2Nlc3M6IHRydWUsIGR1cmF0aW9uTXM6IDUgfSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBjb21wbGV0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhcnRUeXBlczogc3RhcnRBY3Rpb25zLm1hcChhY3Rpb24gPT4gYWN0aW9uLnR5cGUpLFxuXHRcdFx0ZGVsdGE6IHN0YXJ0QWN0aW9uc1sxXSxcblx0XHRcdHJlYWR5OiBzdGFydEFjdGlvbnNbMl0sXG5cdFx0XHRjb21wbGV0ZUFjdGlvbnMsXG5cdFx0XHRyZW1haW5pbmdUb29sQ2FsbHM6IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNpemUsXG5cdFx0fSwge1xuXHRcdFx0c3RhcnRUeXBlczogW0FjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHldLFxuXHRcdFx0ZGVsdGE6IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgY29udGVudDogJ3tcXG4gIFwic3ltYm9sXCI6IFwiQVwiXFxufScgfSxcblx0XHRcdHJlYWR5OiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGludm9jYXRpb25NZXNzYWdlOiAnQ2FsbGluZyBjbGllbnQubG9va3VwJywgdG9vbElucHV0OiAne1xcbiAgXCJzeW1ib2xcIjogXCJBXCJcXG59JywgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQgfSxcblx0XHRcdGNvbXBsZXRlQWN0aW9uczogW3sgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgcmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdDYWxsZWQgY2xpZW50Lmxvb2t1cCcsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnRm91bmQgQVxcbmh0dHBzOi8vZXhhbXBsZS50ZXN0L2EucG5nJyB9XSB9IH1dLFxuXHRcdFx0cmVtYWluaW5nVG9vbENhbGxzOiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0dXJuL2NvbXBsZXRlZCB3aXRoIHN0YXR1cz1jb21wbGV0ZWQgZW1pdHMgQ2hhdFR1cm5Db21wbGV0ZScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0c3RhdGUuY3VycmVudFR1cm5JZCA9ICd0dXJuX2EnO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBUdXJuQ29tcGxldGVkKHN0YXRlLCB7XG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJyxcblx0XHRcdHR1cm46IHtcblx0XHRcdFx0aWQ6ICd0dXJuX2EnLFxuXHRcdFx0XHRpdGVtczogW10sIGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsIHN0YXJ0ZWRBdDogMV83NTJfMDEyXzMyMSwgY29tcGxldGVkQXQ6IDFfNzUyXzAxMl8zMjMuNSwgZHVyYXRpb25NczogMjUwMCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm5fYScsIGR1cmF0aW9uOiAyNTAwIH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuY3VycmVudFR1cm5JZCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgndHVybi9jb21wbGV0ZWQgY29tcGxldGVzIG9ycGhhbmVkIHRvb2wgY2FsbHMgYmVmb3JlIGNvbXBsZXRpbmcgdGhlIHR1cm4nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNldCgnY21kXzEnLCB7IHRvb2xDYWxsSWQ6ICd0Y18xJywgdHVybklkOiAndHVybl9hJywgdG9vbE5hbWU6ICdzaGVsbCcsIG91dHB1dDogJ3BhcnRpYWwgb3V0cHV0JyB9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwVHVybkNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsXG5cdFx0XHR0dXJuOiB7XG5cdFx0XHRcdGlkOiAndHVybl9hJywgaXRlbXM6IFtdLCBpdGVtc1ZpZXc6IHsgdHlwZTogJ2Z1bGwnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGVycm9yOiBudWxsLCBzdGFydGVkQXQ6IG51bGwsIGNvbXBsZXRlZEF0OiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSxcblx0XHR9LCAzMjEpO1xuXHRcdGNvbnN0IGNvbXBsZXRlQWN0aW9uID0gYWN0aW9uc1sxXSBhcyB7IHR5cGU6IEFjdGlvblR5cGU7IHR1cm5JZDogc3RyaW5nOyBkdXJhdGlvbjogbnVtYmVyIH07XG5cdFx0Y29uc3QgeyBkdXJhdGlvbjogY29tcGxldGVEdXJhdGlvbiwgLi4uY29tcGxldGVSZXN0IH0gPSBjb21wbGV0ZUFjdGlvbjtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYWN0aW9uczogW2FjdGlvbnNbMF0sIGNvbXBsZXRlUmVzdF0sIHJlbWFpbmluZ1Rvb2xDYWxsczogc3RhdGUuaXRlbVRvVG9vbENhbGwuc2l6ZSB9LCB7XG5cdFx0XHRhY3Rpb25zOiBbXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZDogJ3RjXzEnLCByZXN1bHQ6IHsgc3VjY2VzczogZmFsc2UsIHBhc3RUZW5zZU1lc3NhZ2U6ICdTdG9wcGVkIHNoZWxsJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdwYXJ0aWFsIG91dHB1dCcgfV0sIGVycm9yOiB7IG1lc3NhZ2U6ICdUdXJuIGNvbXBsZXRlZCBiZWZvcmUgdGhlIHRvb2wgcmVwb3J0ZWQgY29tcGxldGlvbicgfSB9IH0sXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuX2EnIH0sXG5cdFx0XHRdLFxuXHRcdFx0cmVtYWluaW5nVG9vbENhbGxzOiAwLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0ZUR1cmF0aW9uLCAzMjEpO1xuXHR9KTtcblxuXHR0ZXN0KCd0dXJuL2NvbXBsZXRlZCB3aXRoIHN0YXR1cz1mYWlsZWQgZW1pdHMgQ2hhdEVycm9yICsgQ2hhdFR1cm5Db21wbGV0ZScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcFR1cm5Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLFxuXHRcdFx0dHVybjoge1xuXHRcdFx0XHRpZDogJ3R1cm5fYScsIGl0ZW1zOiBbXSwgaXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdmYWlsZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogeyBtZXNzYWdlOiAnYm9vbScgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhcnRlZEF0OiBudWxsLCBjb21wbGV0ZWRBdDogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yLCB0dXJuSWQ6ICd0dXJuX2EnLCBkdXJhdGlvbjogMCwgZXJyb3I6IHsgZXJyb3JUeXBlOiAnQ29kZXhFcnJvcicsIG1lc3NhZ2U6ICdib29tJyB9IH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybl9hJywgZHVyYXRpb246IDAgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndHVybi9jb21wbGV0ZWQgd2l0aCBzdGF0dXM9aW50ZXJydXB0ZWQgZW1pdHMgQ2hhdFR1cm5DYW5jZWxsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBUdXJuQ29tcGxldGVkKHN0YXRlLCB7XG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJyxcblx0XHRcdHR1cm46IHtcblx0XHRcdFx0aWQ6ICd0dXJuX2EnLCBpdGVtczogW10sIGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnaW50ZXJydXB0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCwgc3RhcnRlZEF0OiBudWxsLCBjb21wbGV0ZWRBdDogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLCB0dXJuSWQ6ICd0dXJuX2EnLCBkdXJhdGlvbjogMCB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R1cm5TdGF0ZUZyb21TdGF0dXMgbWFwcyBzdHJpbmdzIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVyblN0YXRlRnJvbVN0YXR1cygnY29tcGxldGVkJyksIFR1cm5TdGF0ZS5Db21wbGV0ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5TdGF0ZUZyb21TdGF0dXMoJ2ludGVycnVwdGVkJyksIFR1cm5TdGF0ZS5DYW5jZWxsZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuU3RhdGVGcm9tU3RhdHVzKCdmYWlsZWQnKSwgVHVyblN0YXRlLkVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVyblN0YXRlRnJvbVN0YXR1cygnd2VpcmQnKSwgVHVyblN0YXRlLkNvbXBsZXRlKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdFVzZXJJbnB1dFRleHQgam9pbnMgdGV4dCBpbnB1dHMgYW5kIGlnbm9yZXMgbm9uLXRleHQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0ZXh0cmFjdFVzZXJJbnB1dFRleHQoW1xuXHRcdFx0XHR7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2ZpcnN0JywgdGV4dF9lbGVtZW50czogW10gfSxcblx0XHRcdFx0eyB0eXBlOiAnaW1hZ2UnLCB1cmw6ICdodHRwOi8veC95LnBuZycgfSxcblx0XHRcdFx0eyB0eXBlOiAndGV4dCcsIHRleHQ6ICdzZWNvbmQnLCB0ZXh0X2VsZW1lbnRzOiBbXSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZW50aW9uJywgbmFtZTogJ2ZvbycsIHBhdGg6ICcvZm9vJyB9LFxuXHRcdFx0XSksXG5cdFx0XHQnZmlyc3RcXG5cXG5zZWNvbmQnLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3RVc2VySW5wdXRUZXh0KFtdKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRyYWN0VXNlcklucHV0VGV4dChbeyB0eXBlOiAnaW1hZ2UnLCB1cmw6ICdodHRwOi8veC95LnBuZycgfV0pLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc2V0Q29kZXhUdXJuTWFwU3RhdGUgY2xlYXJzIGl0ZW0gbWFwcyBidXQgcHJlc2VydmVzIGN1cnJlbnRUdXJuSWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdHN0YXRlLmN1cnJlbnRUdXJuSWQgPSAndHVybl9hJztcblx0XHRzdGF0ZS5pdGVtVG9QYXJ0SWQuc2V0KCdpMScsICdwMScpO1xuXHRcdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNldCgnaTInLCB7IHRvb2xDYWxsSWQ6ICd0YycsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xOYW1lOiAnc2hlbGwnLCBvdXRwdXQ6ICcnIH0pO1xuXHRcdHN0YXRlLml0ZW1Ub1JlYXNvbmluZ1BhcnRJZC5zZXQoJ2kzJywgJ3IxJyk7XG5cdFx0c3RhdGUuZGVjbGluZWRUb29sQ2FsbHMuYWRkKCd0Yy1zdGFsZScpO1xuXHRcdHJlc2V0Q29kZXhUdXJuTWFwU3RhdGUoc3RhdGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3VycmVudFR1cm5JZDogc3RhdGUuY3VycmVudFR1cm5JZCxcblx0XHRcdHBhcnRzOiBzdGF0ZS5pdGVtVG9QYXJ0SWQuc2l6ZSxcblx0XHRcdHRvb2xDYWxsczogc3RhdGUuaXRlbVRvVG9vbENhbGwuc2l6ZSxcblx0XHRcdHJlYXNvbmluZzogc3RhdGUuaXRlbVRvUmVhc29uaW5nUGFydElkLnNpemUsXG5cdFx0XHRkZWNsaW5lZDogc3RhdGUuZGVjbGluZWRUb29sQ2FsbHMuc2l6ZSxcblx0XHR9LCB7IGN1cnJlbnRUdXJuSWQ6ICd0dXJuX2EnLCBwYXJ0czogMCwgdG9vbENhbGxzOiAwLCByZWFzb25pbmc6IDAsIGRlY2xpbmVkOiAwIH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNEJBQTRCLHNCQUFzQixzQkFBc0IsZ0NBQWdDLDJCQUEyQixrQkFBa0IsZ0JBQWdCLHdCQUF3Qiw4QkFBOEIsOEJBQThCLHVCQUF1QixzQkFBc0Isa0JBQWtCLGdCQUFnQix3QkFBd0IsMkJBQTJCO0FBQ3BZLFNBQVMsa0JBQXVEO0FBQ2hFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCLGFBQWEsa0JBQWtCLGVBQWUsNEJBQTRCLHlCQUF5Qix1QkFBdUIsaUJBQWlDO0FBQ3BMLFNBQVMsMkJBQTJCO0FBR3BDLFNBQVMsb0JBQW9CLFFBQW9FO0FBQ2hHLFNBQU8sUUFBUSxTQUFTLFdBQVcsb0JBQW9CLE9BQU8sS0FBSyxTQUFTLGlCQUFpQixXQUMxRixPQUFPLEtBQUssVUFDWjtBQUNKO0FBRUEsTUFBTSwyQkFBMkIsTUFBTTtBQUV0QywwQ0FBd0M7QUFFeEMsT0FBSyw2REFBNkQsTUFBTTtBQUN2RSxVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLFVBQU0sVUFBVSxlQUFlLE9BQU87QUFBQSxNQUNyQyxVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLENBQUM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLElBQUk7QUFBQSxVQUNKLFVBQVU7QUFBQSxVQUNWLFNBQVMsQ0FBQyxFQUFFLE1BQU0sUUFBUSxNQUFNLFNBQVMsZUFBZSxDQUFDLEVBQUUsQ0FBQztBQUFBLFFBQzdELENBQUM7QUFBQSxRQUNELFdBQVcsRUFBRSxNQUFNLE9BQU87QUFBQSxRQUMxQixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxXQUFXO0FBQUEsUUFDWCxhQUFhO0FBQUEsUUFDYixZQUFZO0FBQUEsTUFDYjtBQUFBLElB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
