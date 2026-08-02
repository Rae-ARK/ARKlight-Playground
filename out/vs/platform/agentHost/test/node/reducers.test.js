import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { changesetReducer, chatReducer, sessionReducer } from "../../common/state/protocol/reducers.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ChangesetStatus, ChangesetOperationStatus, CustomizationLoadStatus, MessageKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, ChatOriginKind, SessionLifecycle, SessionStatus, ToolCallConfirmationReason, ToolCallRiskAssessmentKind, ToolCallRiskAssessmentStatus, ResponsePartKind, ToolCallStatus, TurnState } from "../../common/state/sessionState.js";
import { CustomizationType, ToolCallContributorKind } from "../../common/state/protocol/state.js";
function makeSession() {
  return {
    provider: "copilot",
    title: "Test",
    status: SessionStatus.Idle,
    project: { uri: "file:///test-project", displayName: "Test Project" },
    lifecycle: SessionLifecycle.Ready,
    activeClients: [],
    chats: []
  };
}
function makeChat() {
  const now = new Date(Date.now()).toISOString();
  return {
    resource: "ahp-chat://test",
    title: "Test",
    status: SessionStatus.Idle,
    modifiedAt: now,
    origin: { kind: ChatOriginKind.User },
    turns: [],
    activeTurn: void 0
  };
}
function withActiveTurnAndToolCall(state) {
  state = chatReducer(state, {
    type: ActionType.ChatTurnStarted,
    turnId: "turn-1",
    startedAt: "2025-01-01T00:00:00.000Z",
    message: { text: "hello", origin: { kind: MessageKind.User } }
  });
  state = chatReducer(state, {
    type: ActionType.ChatToolCallStart,
    turnId: "turn-1",
    toolCallId: "tc-1",
    toolName: "readFile",
    displayName: "Read File"
  });
  return state;
}
suite("chatReducer \u2013 summaryStatus with tool call confirmations and input requests", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("preserves turn start timestamp and duration after completion", () => {
    let state = chatReducer(makeChat(), {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    const activeStartedAt = state.activeTurn?.startedAt;
    state = chatReducer(state, {
      type: ActionType.ChatTurnComplete,
      turnId: "turn-1",
      duration: 15e4
    });
    assert.deepStrictEqual({
      activeStartedAt,
      completedStartedAt: state.turns[0].startedAt,
      duration: state.turns[0].duration
    }, {
      activeStartedAt: "2025-01-01T00:00:00.000Z",
      completedStartedAt: "2025-01-01T00:00:00.000Z",
      duration: 15e4
    });
  });
  test("clamps negative terminal duration", () => {
    const active = chatReducer(makeChat(), {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    const afterNegativeDuration = chatReducer(active, {
      type: ActionType.ChatTurnComplete,
      turnId: "turn-1",
      duration: -5
    });
    assert.deepStrictEqual(afterNegativeDuration.turns[0], {
      id: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      duration: 0,
      message: { text: "hello", origin: { kind: MessageKind.User } },
      responseParts: [],
      usage: void 0,
      state: TurnState.Complete,
      error: void 0
    });
  });
  test("Chat status is InputNeeded when a tool call is PendingConfirmation", () => {
    let state = withActiveTurnAndToolCall(makeChat());
    state = chatReducer(state, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file?",
      toolInput: "/foo.ts"
    });
    assert.strictEqual(state.status, SessionStatus.InputNeeded);
  });
  test("Chat status is InputNeeded when a tool call is PendingResultConfirmation", () => {
    let state = withActiveTurnAndToolCall(makeChat());
    state = chatReducer(state, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file",
      toolInput: "/foo.ts",
      confirmed: ToolCallConfirmationReason.NotNeeded
    });
    state = chatReducer(state, {
      type: ActionType.ChatToolCallComplete,
      turnId: "turn-1",
      toolCallId: "tc-1",
      requiresResultConfirmation: true,
      result: {
        success: true,
        pastTenseMessage: "Read file"
      }
    });
    assert.strictEqual(state.status, SessionStatus.InputNeeded);
  });
  test("SessionStatus transitions from InputNeeded to InProgress when tool call is confirmed", () => {
    let state = withActiveTurnAndToolCall(makeChat());
    state = chatReducer(state, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file?",
      toolInput: "/foo.ts"
    });
    assert.strictEqual(state.status, SessionStatus.InputNeeded);
    state = chatReducer(state, {
      type: ActionType.ChatToolCallConfirmed,
      turnId: "turn-1",
      toolCallId: "tc-1",
      approved: true,
      confirmed: ToolCallConfirmationReason.UserAction
    });
    assert.strictEqual(state.status, SessionStatus.InProgress);
  });
  test("Chat status is InputNeeded with an unresolved input request response part", () => {
    let state = withActiveTurnAndToolCall(makeChat());
    state = chatReducer(state, {
      type: ActionType.ChatInputRequested,
      request: {
        id: "req-1",
        message: "What is your name?",
        questions: [{
          kind: ChatInputQuestionKind.Text,
          id: "q-1",
          message: "What is your name?",
          required: true
        }]
      }
    });
    assert.deepStrictEqual({
      status: state.status,
      responsePart: state.activeTurn?.responseParts.at(-1)
    }, {
      status: SessionStatus.InputNeeded,
      responsePart: {
        kind: ResponsePartKind.InputRequest,
        request: {
          id: "req-1",
          message: "What is your name?",
          questions: [{
            kind: ChatInputQuestionKind.Text,
            id: "q-1",
            message: "What is your name?",
            required: true
          }]
        }
      }
    });
  });
  test("ChatInputRequested without an active turn is ignored", () => {
    const state = chatReducer(makeChat(), {
      type: ActionType.ChatInputRequested,
      request: { id: "req-1", questions: [] }
    });
    assert.deepStrictEqual({
      status: state.status,
      activeTurn: state.activeTurn
    }, {
      status: SessionStatus.Idle,
      activeTurn: void 0
    });
  });
  test("SessionStatus transitions from InputNeeded to InProgress after ChatInputCompleted", () => {
    let state = withActiveTurnAndToolCall(makeChat());
    state = chatReducer(state, {
      type: ActionType.ChatInputRequested,
      request: {
        id: "req-1",
        message: "What is your name?",
        questions: [{
          kind: ChatInputQuestionKind.Text,
          id: "q-1",
          message: "What is your name?",
          required: true
        }]
      }
    });
    assert.strictEqual(state.status, SessionStatus.InputNeeded);
    state = chatReducer(state, {
      type: ActionType.ChatInputCompleted,
      requestId: "req-1",
      response: ChatInputResponseKind.Accept,
      answers: { "q-1": { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "Alice" } } }
    });
    assert.deepStrictEqual({
      status: state.status,
      responsePart: state.activeTurn?.responseParts.at(-1)
    }, {
      status: SessionStatus.InProgress,
      responsePart: {
        kind: ResponsePartKind.InputRequest,
        request: {
          id: "req-1",
          message: "What is your name?",
          questions: [{
            kind: ChatInputQuestionKind.Text,
            id: "q-1",
            message: "What is your name?",
            required: true
          }],
          answers: {
            "q-1": {
              state: ChatInputAnswerState.Submitted,
              value: { kind: ChatInputAnswerValueKind.Text, value: "Alice" }
            }
          }
        },
        response: ChatInputResponseKind.Accept
      }
    });
  });
  test("Tool call transition to PendingConfirmation updates chat status to InputNeeded", () => {
    let state = withActiveTurnAndToolCall(makeChat());
    assert.strictEqual(state.status, SessionStatus.InProgress);
    state = chatReducer(state, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file?",
      toolInput: "/foo.ts"
    });
    assert.strictEqual(state.status, SessionStatus.InputNeeded);
  });
  test("ChatToolCallReady preserves action metadata on pending and running tool calls", () => {
    const state = withActiveTurnAndToolCall(makeChat());
    const pending = chatReducer(state, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file?",
      toolInput: "/foo.ts",
      _meta: { autoApproveBySetting: true }
    });
    const running = chatReducer(state, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file",
      toolInput: "/foo.ts",
      confirmed: ToolCallConfirmationReason.NotNeeded,
      _meta: { autoApproveBySetting: true }
    });
    const getToolCall = (s) => {
      const part = s.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall && part2.toolCall.toolCallId === "tc-1");
      assert.ok(part?.kind === ResponsePartKind.ToolCall);
      return part.toolCall;
    };
    assert.deepStrictEqual([
      { status: getToolCall(pending).status, meta: getToolCall(pending)._meta },
      { status: getToolCall(running).status, meta: getToolCall(running)._meta }
    ], [
      { status: ToolCallStatus.PendingConfirmation, meta: { autoApproveBySetting: true } },
      { status: ToolCallStatus.Running, meta: { autoApproveBySetting: true } }
    ]);
  });
  test("ChatToolCallDelta can update the invocation message without exposing partial input", () => {
    let state = chatReducer(makeChat(), {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    state = chatReducer(state, {
      type: ActionType.ChatToolCallStart,
      turnId: "turn-1",
      toolCallId: "tc-1",
      toolName: "edit",
      displayName: "Edit File"
    });
    state = chatReducer(state, {
      type: ActionType.ChatToolCallDelta,
      turnId: "turn-1",
      toolCallId: "tc-1",
      content: "",
      invocationMessage: "Replacing 2 lines with 3 lines"
    });
    const part = state.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall);
    assert.ok(part?.kind === ResponsePartKind.ToolCall);
    assert.deepStrictEqual({
      invocationMessage: part.toolCall.status === ToolCallStatus.Streaming ? part.toolCall.invocationMessage : void 0,
      partialInput: part.toolCall.status === ToolCallStatus.Streaming ? part.toolCall.partialInput : void 0
    }, {
      invocationMessage: "Replacing 2 lines with 3 lines",
      partialInput: ""
    });
  });
  test("ChatToolCallReady replaces provisional contributor and intention", () => {
    let state = chatReducer(makeChat(), {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    state = chatReducer(state, {
      type: ActionType.ChatToolCallStart,
      turnId: "turn-1",
      toolCallId: "tc-1",
      toolName: "mcp_tool",
      displayName: "MCP Tool",
      intention: "Query"
    });
    state = chatReducer(state, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      contributor: { kind: ToolCallContributorKind.MCP, customizationId: "mcp-1" },
      intention: "Query project metadata",
      invocationMessage: "Querying project metadata",
      toolInput: '{"query":"metadata"}',
      confirmed: ToolCallConfirmationReason.NotNeeded
    });
    const part = state.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall);
    assert.ok(part?.kind === ResponsePartKind.ToolCall);
    assert.deepStrictEqual({
      status: part.toolCall.status,
      contributor: part.toolCall.contributor,
      intention: part.toolCall.intention
    }, {
      status: ToolCallStatus.Running,
      contributor: { kind: ToolCallContributorKind.MCP, customizationId: "mcp-1" },
      intention: "Query project metadata"
    });
  });
  test("ChatToolCallReady cannot change client execution ownership", () => {
    const readyContributor = (startContributor, contributor) => {
      let state = chatReducer(makeChat(), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      state = chatReducer(state, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tc-1",
        toolName: "tool",
        displayName: "Tool",
        contributor: startContributor
      });
      state = chatReducer(state, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-1",
        contributor,
        invocationMessage: "Running tool",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      const part = state.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall);
      assert.ok(part?.kind === ResponsePartKind.ToolCall);
      return part.toolCall.contributor;
    };
    assert.deepStrictEqual([
      readyContributor(void 0, { kind: ToolCallContributorKind.Client, clientId: "client-1" }),
      readyContributor(
        { kind: ToolCallContributorKind.MCP, customizationId: "mcp-1" },
        { kind: ToolCallContributorKind.Client, clientId: "client-1" }
      ),
      readyContributor(
        { kind: ToolCallContributorKind.Client, clientId: "client-1" },
        { kind: ToolCallContributorKind.Client, clientId: "client-2" }
      ),
      readyContributor(
        { kind: ToolCallContributorKind.Client, clientId: "client-1" },
        { kind: ToolCallContributorKind.Client, clientId: "client-1" }
      )
    ], [
      void 0,
      { kind: ToolCallContributorKind.MCP, customizationId: "mcp-1" },
      { kind: ToolCallContributorKind.Client, clientId: "client-1" },
      { kind: ToolCallContributorKind.Client, clientId: "client-1" }
    ]);
  });
  test("ChatToolCallReady updates an asynchronous judge result on a pending confirmation", () => {
    const loading = chatReducer(withActiveTurnAndToolCall(makeChat()), {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file?",
      confirmationTitle: "Read file",
      toolInput: "/foo.ts",
      riskAssessment: {
        kind: ToolCallRiskAssessmentKind.Judge,
        status: ToolCallRiskAssessmentStatus.Loading
      }
    });
    const complete = chatReducer(loading, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "Read file?",
      riskAssessment: {
        kind: ToolCallRiskAssessmentKind.Judge,
        status: ToolCallRiskAssessmentStatus.Complete,
        reason: "This reads a sensitive file.",
        safety: 0.2
      }
    });
    const part = complete.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall && part2.toolCall.toolCallId === "tc-1");
    assert.ok(part?.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.PendingConfirmation);
    assert.deepStrictEqual({
      confirmationTitle: part.toolCall.confirmationTitle,
      toolInput: part.toolCall.toolInput,
      riskAssessment: part.toolCall.riskAssessment
    }, {
      confirmationTitle: "Read file",
      toolInput: "/foo.ts",
      riskAssessment: {
        kind: ToolCallRiskAssessmentKind.Judge,
        status: ToolCallRiskAssessmentStatus.Complete,
        reason: "This reads a sensitive file.",
        safety: 0.2
      }
    });
  });
});
suite("changesetReducer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const ready = { status: ChangesetStatus.Ready, files: [] };
  const fileA = { id: "file:///a.ts", edit: { after: { uri: "file:///a.ts", content: { uri: "file:///a.ts" } }, diff: { added: 1, removed: 0 } } };
  const fileARenamed = { id: "file:///a.ts", edit: { after: { uri: "file:///a.ts", content: { uri: "file:///a.ts" } }, diff: { added: 5, removed: 0 } } };
  test("ChangesetFileSet appends a new file", () => {
    const next = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
    assert.deepStrictEqual(next.files, [fileA]);
  });
  test("ChangesetFileSet replaces an existing file by id (upsert)", () => {
    const seeded = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
    const next = changesetReducer(seeded, { type: ActionType.ChangesetFileSet, file: fileARenamed });
    assert.deepStrictEqual(next.files, [fileARenamed]);
  });
  test("ChangesetFileRemoved removes by id", () => {
    const seeded = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
    const next = changesetReducer(seeded, { type: ActionType.ChangesetFileRemoved, fileId: fileA.id });
    assert.deepStrictEqual(next.files, []);
  });
  test("ChangesetFileRemoved is a no-op for an unknown id", () => {
    const seeded = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
    const next = changesetReducer(seeded, { type: ActionType.ChangesetFileRemoved, fileId: "file:///nope.ts" });
    assert.strictEqual(next, seeded);
  });
  test("ChangesetStatusChanged \u2192 Error attaches the error", () => {
    const err = { errorType: "computeFailed", message: "boom" };
    const next = changesetReducer(ready, { type: ActionType.ChangesetStatusChanged, status: ChangesetStatus.Error, error: err });
    assert.deepStrictEqual({ status: next.status, error: next.error }, { status: ChangesetStatus.Error, error: err });
  });
  test("ChangesetStatusChanged \u2192 Ready strips a previous error", () => {
    const errored = { status: ChangesetStatus.Error, error: { errorType: "x", message: "y" }, files: [fileA] };
    const next = changesetReducer(errored, { type: ActionType.ChangesetStatusChanged, status: ChangesetStatus.Ready });
    assert.deepStrictEqual({ status: next.status, error: next.error, files: next.files }, { status: ChangesetStatus.Ready, error: void 0, files: [fileA] });
  });
  test("ChangesetOperationsChanged with array replaces operations", () => {
    const ops = [{ id: "stage", label: "Stage", scopes: [], status: ChangesetOperationStatus.Idle }];
    const next = changesetReducer(ready, { type: ActionType.ChangesetOperationsChanged, operations: ops });
    assert.deepStrictEqual(next.operations, ops);
  });
  test("ChangesetOperationsChanged with undefined strips operations", () => {
    const seeded = changesetReducer(ready, { type: ActionType.ChangesetOperationsChanged, operations: [{ id: "stage", label: "Stage", scopes: [], status: ChangesetOperationStatus.Idle }] });
    const next = changesetReducer(seeded, { type: ActionType.ChangesetOperationsChanged, operations: void 0 });
    assert.strictEqual(next.operations, void 0);
  });
  test("ChangesetCleared empties files", () => {
    const seeded = changesetReducer(ready, { type: ActionType.ChangesetFileSet, file: fileA });
    const next = changesetReducer(seeded, { type: ActionType.ChangesetCleared });
    assert.deepStrictEqual(next.files, []);
  });
  test("ChangesetCleared is a no-op when files are already empty", () => {
    const next = changesetReducer(ready, { type: ActionType.ChangesetCleared });
    assert.strictEqual(next, ready);
  });
});
suite("sessionReducer \u2013 SessionCustomizationUpdated", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const agentA = { type: CustomizationType.Agent, id: "file:///plugin-a/agents/helper.md", uri: "file:///plugin-a/agents/helper.md", name: "helper" };
  const agentB = { type: CustomizationType.Agent, id: "file:///plugin-a/agents/reviewer.md", uri: "file:///plugin-a/agents/reviewer.md", name: "reviewer", description: "reviews code" };
  function pluginA(extra = {}) {
    return {
      type: CustomizationType.Plugin,
      id: "file:///plugin-a",
      uri: "file:///plugin-a",
      name: "Plugin A",
      enabled: true,
      ...extra
    };
  }
  test("insert: appends a new top-level customization with its children", () => {
    const customization = pluginA({ load: { kind: CustomizationLoadStatus.Loaded }, children: [agentA, agentB] });
    const state = sessionReducer(makeSession(), {
      type: ActionType.SessionCustomizationUpdated,
      customization
    });
    assert.deepStrictEqual(state.customizations, [customization]);
  });
  test("update: replaces the matching entry entirely", () => {
    const initial = pluginA({ load: { kind: CustomizationLoadStatus.Loading }, children: [agentA] });
    const seeded = sessionReducer(makeSession(), {
      type: ActionType.SessionCustomizationUpdated,
      customization: initial
    });
    const updated = pluginA({ load: { kind: CustomizationLoadStatus.Loaded }, children: [agentB] });
    const next = sessionReducer(seeded, {
      type: ActionType.SessionCustomizationUpdated,
      customization: updated
    });
    assert.deepStrictEqual(next.customizations, [updated]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvcmVkdWNlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgY2hhbmdlc2V0UmVkdWNlciwgY2hhdFJlZHVjZXIsIHNlc3Npb25SZWR1Y2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3JlZHVjZXJzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhbmdlc2V0U3RhdHVzLCBDaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMsIEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLCBNZXNzYWdlS2luZCwgQ2hhdElucHV0QW5zd2VyU3RhdGUsIENoYXRJbnB1dEFuc3dlclZhbHVlS2luZCwgQ2hhdElucHV0UXVlc3Rpb25LaW5kLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIENoYXRPcmlnaW5LaW5kLCBTZXNzaW9uTGlmZWN5Y2xlLCBTZXNzaW9uU3RhdHVzLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxSaXNrQXNzZXNzbWVudEtpbmQsIFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRTdGF0dXMsIFJlc3BvbnNlUGFydEtpbmQsIFRvb2xDYWxsU3RhdHVzLCBUdXJuU3RhdGUsIHR5cGUgQWdlbnRDdXN0b21pemF0aW9uLCB0eXBlIENoYW5nZXNldFN0YXRlLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgUGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBDaGF0U3RhdGUsIHR5cGUgU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uVHlwZSwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIHR5cGUgVG9vbENhbGxDb250cmlidXRvciB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5cbmZ1bmN0aW9uIG1ha2VTZXNzaW9uKCk6IFNlc3Npb25TdGF0ZSB7XG5cdHJldHVybiB7XG5cdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdHByb2plY3Q6IHsgdXJpOiAnZmlsZTovLy90ZXN0LXByb2plY3QnLCBkaXNwbGF5TmFtZTogJ1Rlc3QgUHJvamVjdCcgfSxcblx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0YWN0aXZlQ2xpZW50czogW10sXG5cdFx0Y2hhdHM6IFtdLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlQ2hhdCgpOiBDaGF0U3RhdGUge1xuXHRjb25zdCBub3cgPSBuZXcgRGF0ZShEYXRlLm5vdygpKS50b0lTT1N0cmluZygpO1xuXHRyZXR1cm4ge1xuXHRcdHJlc291cmNlOiAnYWhwLWNoYXQ6Ly90ZXN0Jyxcblx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdG1vZGlmaWVkQXQ6IG5vdyxcblx0XHRvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuVXNlciB9LFxuXHRcdHR1cm5zOiBbXSxcblx0XHRhY3RpdmVUdXJuOiB1bmRlZmluZWQsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHdpdGhBY3RpdmVUdXJuQW5kVG9vbENhbGwoc3RhdGU6IENoYXRTdGF0ZSk6IENoYXRTdGF0ZSB7XG5cdHN0YXRlID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdH0pO1xuXHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHR0b29sTmFtZTogJ3JlYWRGaWxlJyxcblx0XHRkaXNwbGF5TmFtZTogJ1JlYWQgRmlsZScsXG5cdH0pO1xuXHRyZXR1cm4gc3RhdGU7XG59XG5cbnN1aXRlKCdjaGF0UmVkdWNlciBcdTIwMTMgc3VtbWFyeVN0YXR1cyB3aXRoIHRvb2wgY2FsbCBjb25maXJtYXRpb25zIGFuZCBpbnB1dCByZXF1ZXN0cycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgdHVybiBzdGFydCB0aW1lc3RhbXAgYW5kIGR1cmF0aW9uIGFmdGVyIGNvbXBsZXRpb24nLCAoKSA9PiB7XG5cdFx0bGV0IHN0YXRlID0gY2hhdFJlZHVjZXIobWFrZUNoYXQoKSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdGl2ZVN0YXJ0ZWRBdCA9IHN0YXRlLmFjdGl2ZVR1cm4/LnN0YXJ0ZWRBdDtcblx0XHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0ZHVyYXRpb246IDE1MF8wMDAsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjdGl2ZVN0YXJ0ZWRBdCxcblx0XHRcdGNvbXBsZXRlZFN0YXJ0ZWRBdDogc3RhdGUudHVybnNbMF0uc3RhcnRlZEF0LFxuXHRcdFx0ZHVyYXRpb246IHN0YXRlLnR1cm5zWzBdLmR1cmF0aW9uLFxuXHRcdH0sIHtcblx0XHRcdGFjdGl2ZVN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRjb21wbGV0ZWRTdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0ZHVyYXRpb246IDE1MF8wMDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsYW1wcyBuZWdhdGl2ZSB0ZXJtaW5hbCBkdXJhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBhY3RpdmUgPSBjaGF0UmVkdWNlcihtYWtlQ2hhdCgpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWZ0ZXJOZWdhdGl2ZUR1cmF0aW9uID0gY2hhdFJlZHVjZXIoYWN0aXZlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0ZHVyYXRpb246IC01LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZnRlck5lZ2F0aXZlRHVyYXRpb24udHVybnNbMF0sIHtcblx0XHRcdGlkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRkdXJhdGlvbjogMCxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0cmVzcG9uc2VQYXJ0czogW10sXG5cdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYXQgc3RhdHVzIGlzIElucHV0TmVlZGVkIHdoZW4gYSB0b29sIGNhbGwgaXMgUGVuZGluZ0NvbmZpcm1hdGlvbicsICgpID0+IHtcblx0XHRsZXQgc3RhdGUgPSB3aXRoQWN0aXZlVHVybkFuZFRvb2xDYWxsKG1ha2VDaGF0KCkpO1xuXG5cdFx0Ly8gVHJhbnNpdGlvbiB0byBQZW5kaW5nQ29uZmlybWF0aW9uIChubyBgY29uZmlybWVkYCBmaWVsZClcblx0XHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCBmaWxlPycsXG5cdFx0XHR0b29sSW5wdXQ6ICcvZm9vLnRzJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5zdGF0dXMsIFNlc3Npb25TdGF0dXMuSW5wdXROZWVkZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGF0IHN0YXR1cyBpcyBJbnB1dE5lZWRlZCB3aGVuIGEgdG9vbCBjYWxsIGlzIFBlbmRpbmdSZXN1bHRDb25maXJtYXRpb24nLCAoKSA9PiB7XG5cdFx0bGV0IHN0YXRlID0gd2l0aEFjdGl2ZVR1cm5BbmRUb29sQ2FsbChtYWtlQ2hhdCgpKTtcblxuXHRcdC8vIFRyYW5zaXRpb24gdG8gUnVubmluZyBmaXJzdFxuXHRcdHN0YXRlID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkIGZpbGUnLFxuXHRcdFx0dG9vbElucHV0OiAnL2Zvby50cycsXG5cdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHR9KTtcblxuXHRcdC8vIFRoZW4gY29tcGxldGUgd2l0aCByZXF1aXJlc1Jlc3VsdENvbmZpcm1hdGlvblxuXHRcdHN0YXRlID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0cmVxdWlyZXNSZXN1bHRDb25maXJtYXRpb246IHRydWUsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JlYWQgZmlsZSdcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuc3RhdHVzLCBTZXNzaW9uU3RhdHVzLklucHV0TmVlZGVkKTtcblx0fSk7XG5cblx0dGVzdCgnU2Vzc2lvblN0YXR1cyB0cmFuc2l0aW9ucyBmcm9tIElucHV0TmVlZGVkIHRvIEluUHJvZ3Jlc3Mgd2hlbiB0b29sIGNhbGwgaXMgY29uZmlybWVkJywgKCkgPT4ge1xuXHRcdGxldCBzdGF0ZSA9IHdpdGhBY3RpdmVUdXJuQW5kVG9vbENhbGwobWFrZUNoYXQoKSk7XG5cblx0XHQvLyBUcmFuc2l0aW9uIHRvIFBlbmRpbmdDb25maXJtYXRpb25cblx0XHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCBmaWxlPycsXG5cdFx0XHR0b29sSW5wdXQ6ICcvZm9vLnRzJyxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuc3RhdHVzLCBTZXNzaW9uU3RhdHVzLklucHV0TmVlZGVkKTtcblxuXHRcdC8vIENvbmZpcm0gaXRcblx0XHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRhcHByb3ZlZDogdHJ1ZSxcblx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uVXNlckFjdGlvbixcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5zdGF0dXMsIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYXQgc3RhdHVzIGlzIElucHV0TmVlZGVkIHdpdGggYW4gdW5yZXNvbHZlZCBpbnB1dCByZXF1ZXN0IHJlc3BvbnNlIHBhcnQnLCAoKSA9PiB7XG5cdFx0bGV0IHN0YXRlID0gd2l0aEFjdGl2ZVR1cm5BbmRUb29sQ2FsbChtYWtlQ2hhdCgpKTtcblxuXHRcdHN0YXRlID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkLFxuXHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRpZDogJ3JlcS0xJyxcblx0XHRcdFx0bWVzc2FnZTogJ1doYXQgaXMgeW91ciBuYW1lPycsXG5cdFx0XHRcdHF1ZXN0aW9uczogW3tcblx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCxcblx0XHRcdFx0XHRpZDogJ3EtMScsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ1doYXQgaXMgeW91ciBuYW1lPycsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IHRydWVcblx0XHRcdFx0fV1cblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXR1czogc3RhdGUuc3RhdHVzLFxuXHRcdFx0cmVzcG9uc2VQYXJ0OiBzdGF0ZS5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmF0KC0xKSxcblx0XHR9LCB7XG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSW5wdXROZWVkZWQsXG5cdFx0XHRyZXNwb25zZVBhcnQ6IHtcblx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5JbnB1dFJlcXVlc3QsXG5cdFx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0XHRpZDogJ3JlcS0xJyxcblx0XHRcdFx0XHRtZXNzYWdlOiAnV2hhdCBpcyB5b3VyIG5hbWU/Jyxcblx0XHRcdFx0XHRxdWVzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCxcblx0XHRcdFx0XHRcdGlkOiAncS0xJyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6ICdXaGF0IGlzIHlvdXIgbmFtZT8nLFxuXHRcdFx0XHRcdFx0cmVxdWlyZWQ6IHRydWUsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGF0SW5wdXRSZXF1ZXN0ZWQgd2l0aG91dCBhbiBhY3RpdmUgdHVybiBpcyBpZ25vcmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY2hhdFJlZHVjZXIobWFrZUNoYXQoKSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRSZXF1ZXN0ZWQsXG5cdFx0XHRyZXF1ZXN0OiB7IGlkOiAncmVxLTEnLCBxdWVzdGlvbnM6IFtdIH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXR1czogc3RhdGUuc3RhdHVzLFxuXHRcdFx0YWN0aXZlVHVybjogc3RhdGUuYWN0aXZlVHVybixcblx0XHR9LCB7XG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGFjdGl2ZVR1cm46IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnU2Vzc2lvblN0YXR1cyB0cmFuc2l0aW9ucyBmcm9tIElucHV0TmVlZGVkIHRvIEluUHJvZ3Jlc3MgYWZ0ZXIgQ2hhdElucHV0Q29tcGxldGVkJywgKCkgPT4ge1xuXHRcdGxldCBzdGF0ZSA9IHdpdGhBY3RpdmVUdXJuQW5kVG9vbENhbGwobWFrZUNoYXQoKSk7XG5cblx0XHQvLyBBZGQgYW4gaW5wdXQgcmVxdWVzdFxuXHRcdHN0YXRlID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkLFxuXHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRpZDogJ3JlcS0xJyxcblx0XHRcdFx0bWVzc2FnZTogJ1doYXQgaXMgeW91ciBuYW1lPycsXG5cdFx0XHRcdHF1ZXN0aW9uczogW3tcblx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCxcblx0XHRcdFx0XHRpZDogJ3EtMScsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ1doYXQgaXMgeW91ciBuYW1lPycsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IHRydWVcblx0XHRcdFx0fV1cblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnN0YXR1cywgU2Vzc2lvblN0YXR1cy5JbnB1dE5lZWRlZCk7XG5cblx0XHQvLyBDb21wbGV0ZSB0aGUgaW5wdXQgcmVxdWVzdFxuXHRcdHN0YXRlID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxLTEnLFxuXHRcdFx0cmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsXG5cdFx0XHRhbnN3ZXJzOiB7ICdxLTEnOiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsIHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogJ0FsaWNlJyB9IH0gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhdHVzOiBzdGF0ZS5zdGF0dXMsXG5cdFx0XHRyZXNwb25zZVBhcnQ6IHN0YXRlLmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuYXQoLTEpLFxuXHRcdH0sIHtcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLFxuXHRcdFx0cmVzcG9uc2VQYXJ0OiB7XG5cdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuSW5wdXRSZXF1ZXN0LFxuXHRcdFx0XHRyZXF1ZXN0OiB7XG5cdFx0XHRcdFx0aWQ6ICdyZXEtMScsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ1doYXQgaXMgeW91ciBuYW1lPycsXG5cdFx0XHRcdFx0cXVlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdFx0a2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlRleHQsXG5cdFx0XHRcdFx0XHRpZDogJ3EtMScsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiAnV2hhdCBpcyB5b3VyIG5hbWU/Jyxcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiB0cnVlLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdGFuc3dlcnM6IHtcblx0XHRcdFx0XHRcdCdxLTEnOiB7XG5cdFx0XHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogJ0FsaWNlJyB9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rvb2wgY2FsbCB0cmFuc2l0aW9uIHRvIFBlbmRpbmdDb25maXJtYXRpb24gdXBkYXRlcyBjaGF0IHN0YXR1cyB0byBJbnB1dE5lZWRlZCcsICgpID0+IHtcblx0XHRsZXQgc3RhdGUgPSB3aXRoQWN0aXZlVHVybkFuZFRvb2xDYWxsKG1ha2VDaGF0KCkpO1xuXG5cdFx0Ly8gQWZ0ZXIgQ2hhdFRvb2xDYWxsU3RhcnQsIHN0YXR1cyBzaG91bGQgYmUgSW5Qcm9ncmVzcyAodG9vbCBpcyBTdHJlYW1pbmcpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnN0YXR1cywgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblxuXHRcdC8vIFRyYW5zaXRpb24gdG8gUGVuZGluZ0NvbmZpcm1hdGlvbiB2aWEgQ2hhdFRvb2xDYWxsUmVhZHkgKG5vIGNvbmZpcm1lZClcblx0XHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCBmaWxlPycsXG5cdFx0XHR0b29sSW5wdXQ6ICcvZm9vLnRzJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5zdGF0dXMsIFNlc3Npb25TdGF0dXMuSW5wdXROZWVkZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGF0VG9vbENhbGxSZWFkeSBwcmVzZXJ2ZXMgYWN0aW9uIG1ldGFkYXRhIG9uIHBlbmRpbmcgYW5kIHJ1bm5pbmcgdG9vbCBjYWxscycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IHdpdGhBY3RpdmVUdXJuQW5kVG9vbENhbGwobWFrZUNoYXQoKSk7XG5cdFx0Y29uc3QgcGVuZGluZyA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCBmaWxlPycsXG5cdFx0XHR0b29sSW5wdXQ6ICcvZm9vLnRzJyxcblx0XHRcdF9tZXRhOiB7IGF1dG9BcHByb3ZlQnlTZXR0aW5nOiB0cnVlIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcnVubmluZyA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCBmaWxlJyxcblx0XHRcdHRvb2xJbnB1dDogJy9mb28udHMnLFxuXHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRfbWV0YTogeyBhdXRvQXBwcm92ZUJ5U2V0dGluZzogdHJ1ZSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZ2V0VG9vbENhbGwgPSAoczogQ2hhdFN0YXRlKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gcy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0cmV0dXJuIHBhcnQudG9vbENhbGw7XG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHsgc3RhdHVzOiBnZXRUb29sQ2FsbChwZW5kaW5nKS5zdGF0dXMsIG1ldGE6IGdldFRvb2xDYWxsKHBlbmRpbmcpLl9tZXRhIH0sXG5cdFx0XHR7IHN0YXR1czogZ2V0VG9vbENhbGwocnVubmluZykuc3RhdHVzLCBtZXRhOiBnZXRUb29sQ2FsbChydW5uaW5nKS5fbWV0YSB9LFxuXHRcdF0sIFtcblx0XHRcdHsgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLCBtZXRhOiB7IGF1dG9BcHByb3ZlQnlTZXR0aW5nOiB0cnVlIH0gfSxcblx0XHRcdHsgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLCBtZXRhOiB7IGF1dG9BcHByb3ZlQnlTZXR0aW5nOiB0cnVlIH0gfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnQ2hhdFRvb2xDYWxsRGVsdGEgY2FuIHVwZGF0ZSB0aGUgaW52b2NhdGlvbiBtZXNzYWdlIHdpdGhvdXQgZXhwb3NpbmcgcGFydGlhbCBpbnB1dCcsICgpID0+IHtcblx0XHRsZXQgc3RhdGUgPSBjaGF0UmVkdWNlcihtYWtlQ2hhdCgpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0fSk7XG5cdFx0c3RhdGUgPSBjaGF0UmVkdWNlcihzdGF0ZSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdFZGl0IEZpbGUnLFxuXHRcdH0pO1xuXHRcdHN0YXRlID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0Y29udGVudDogJycsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlcGxhY2luZyAyIGxpbmVzIHdpdGggMyBsaW5lcycsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwYXJ0ID0gc3RhdGUuYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRhc3NlcnQub2socGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyA/IHBhcnQudG9vbENhbGwuaW52b2NhdGlvbk1lc3NhZ2UgOiB1bmRlZmluZWQsXG5cdFx0XHRwYXJ0aWFsSW5wdXQ6IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgPyBwYXJ0LnRvb2xDYWxsLnBhcnRpYWxJbnB1dCA6IHVuZGVmaW5lZCxcblx0XHR9LCB7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlcGxhY2luZyAyIGxpbmVzIHdpdGggMyBsaW5lcycsXG5cdFx0XHRwYXJ0aWFsSW5wdXQ6ICcnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGF0VG9vbENhbGxSZWFkeSByZXBsYWNlcyBwcm92aXNpb25hbCBjb250cmlidXRvciBhbmQgaW50ZW50aW9uJywgKCkgPT4ge1xuXHRcdGxldCBzdGF0ZSA9IGNoYXRSZWR1Y2VyKG1ha2VDaGF0KCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblx0XHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdHRvb2xOYW1lOiAnbWNwX3Rvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdNQ1AgVG9vbCcsXG5cdFx0XHRpbnRlbnRpb246ICdRdWVyeScsXG5cdFx0fSk7XG5cdFx0c3RhdGUgPSBjaGF0UmVkdWNlcihzdGF0ZSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ21jcC0xJyB9LFxuXHRcdFx0aW50ZW50aW9uOiAnUXVlcnkgcHJvamVjdCBtZXRhZGF0YScsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1F1ZXJ5aW5nIHByb2plY3QgbWV0YWRhdGEnLFxuXHRcdFx0dG9vbElucHV0OiAne1wicXVlcnlcIjpcIm1ldGFkYXRhXCJ9Jyxcblx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcGFydCA9IHN0YXRlLmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhdHVzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyxcblx0XHRcdGNvbnRyaWJ1dG9yOiBwYXJ0LnRvb2xDYWxsLmNvbnRyaWJ1dG9yLFxuXHRcdFx0aW50ZW50aW9uOiBwYXJ0LnRvb2xDYWxsLmludGVudGlvbixcblx0XHR9LCB7XG5cdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ21jcC0xJyB9LFxuXHRcdFx0aW50ZW50aW9uOiAnUXVlcnkgcHJvamVjdCBtZXRhZGF0YScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYXRUb29sQ2FsbFJlYWR5IGNhbm5vdCBjaGFuZ2UgY2xpZW50IGV4ZWN1dGlvbiBvd25lcnNoaXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVhZHlDb250cmlidXRvciA9IChzdGFydENvbnRyaWJ1dG9yOiBUb29sQ2FsbENvbnRyaWJ1dG9yIHwgdW5kZWZpbmVkLCBjb250cmlidXRvcjogVG9vbENhbGxDb250cmlidXRvcikgPT4ge1xuXHRcdFx0bGV0IHN0YXRlID0gY2hhdFJlZHVjZXIobWFrZUNoYXQoKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlID0gY2hhdFJlZHVjZXIoc3RhdGUsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3Rvb2wnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rvb2wnLFxuXHRcdFx0XHRjb250cmlidXRvcjogc3RhcnRDb250cmlidXRvcixcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGUgPSBjaGF0UmVkdWNlcihzdGF0ZSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgdG9vbCcsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RhdGUuYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdGFzc2VydC5vayhwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdHJldHVybiBwYXJ0LnRvb2xDYWxsLmNvbnRyaWJ1dG9yO1xuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHJlYWR5Q29udHJpYnV0b3IodW5kZWZpbmVkLCB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdjbGllbnQtMScgfSksXG5cdFx0XHRyZWFkeUNvbnRyaWJ1dG9yKFxuXHRcdFx0XHR7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLk1DUCwgY3VzdG9taXphdGlvbklkOiAnbWNwLTEnIH0sXG5cdFx0XHRcdHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC0xJyB9LFxuXHRcdFx0KSxcblx0XHRcdHJlYWR5Q29udHJpYnV0b3IoXG5cdFx0XHRcdHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC0xJyB9LFxuXHRcdFx0XHR7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdjbGllbnQtMicgfSxcblx0XHRcdCksXG5cdFx0XHRyZWFkeUNvbnRyaWJ1dG9yKFxuXHRcdFx0XHR7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdjbGllbnQtMScgfSxcblx0XHRcdFx0eyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0sXG5cdFx0XHQpLFxuXHRcdF0sIFtcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLCBjdXN0b21pemF0aW9uSWQ6ICdtY3AtMScgfSxcblx0XHRcdHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC0xJyB9LFxuXHRcdFx0eyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYXRUb29sQ2FsbFJlYWR5IHVwZGF0ZXMgYW4gYXN5bmNocm9ub3VzIGp1ZGdlIHJlc3VsdCBvbiBhIHBlbmRpbmcgY29uZmlybWF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvYWRpbmcgPSBjaGF0UmVkdWNlcih3aXRoQWN0aXZlVHVybkFuZFRvb2xDYWxsKG1ha2VDaGF0KCkpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCBmaWxlPycsXG5cdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1JlYWQgZmlsZScsXG5cdFx0XHR0b29sSW5wdXQ6ICcvZm9vLnRzJyxcblx0XHRcdHJpc2tBc3Nlc3NtZW50OiB7XG5cdFx0XHRcdGtpbmQ6IFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRLaW5kLkp1ZGdlLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRTdGF0dXMuTG9hZGluZyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgY29tcGxldGUgPSBjaGF0UmVkdWNlcihsb2FkaW5nLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCBmaWxlPycsXG5cdFx0XHRyaXNrQXNzZXNzbWVudDoge1xuXHRcdFx0XHRraW5kOiBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50S2luZC5KdWRnZSxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50U3RhdHVzLkNvbXBsZXRlLFxuXHRcdFx0XHRyZWFzb246ICdUaGlzIHJlYWRzIGEgc2Vuc2l0aXZlIGZpbGUuJyxcblx0XHRcdFx0c2FmZXR5OiAwLjIsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBhcnQgPSBjb21wbGV0ZS5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtMScpO1xuXHRcdGFzc2VydC5vayhwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IHBhcnQudG9vbENhbGwuY29uZmlybWF0aW9uVGl0bGUsXG5cdFx0XHR0b29sSW5wdXQ6IHBhcnQudG9vbENhbGwudG9vbElucHV0LFxuXHRcdFx0cmlza0Fzc2Vzc21lbnQ6IHBhcnQudG9vbENhbGwucmlza0Fzc2Vzc21lbnQsXG5cdFx0fSwge1xuXHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSZWFkIGZpbGUnLFxuXHRcdFx0dG9vbElucHV0OiAnL2Zvby50cycsXG5cdFx0XHRyaXNrQXNzZXNzbWVudDoge1xuXHRcdFx0XHRraW5kOiBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50S2luZC5KdWRnZSxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50U3RhdHVzLkNvbXBsZXRlLFxuXHRcdFx0XHRyZWFzb246ICdUaGlzIHJlYWRzIGEgc2Vuc2l0aXZlIGZpbGUuJyxcblx0XHRcdFx0c2FmZXR5OiAwLjIsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnY2hhbmdlc2V0UmVkdWNlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCByZWFkeTogQ2hhbmdlc2V0U3RhdGUgPSB7IHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLlJlYWR5LCBmaWxlczogW10gfTtcblx0Y29uc3QgZmlsZUEgPSB7IGlkOiAnZmlsZTovLy9hLnRzJywgZWRpdDogeyBhZnRlcjogeyB1cmk6ICdmaWxlOi8vL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vYS50cycgfSB9LCBkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0gfSB9O1xuXHRjb25zdCBmaWxlQVJlbmFtZWQgPSB7IGlkOiAnZmlsZTovLy9hLnRzJywgZWRpdDogeyBhZnRlcjogeyB1cmk6ICdmaWxlOi8vL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vYS50cycgfSB9LCBkaWZmOiB7IGFkZGVkOiA1LCByZW1vdmVkOiAwIH0gfSB9O1xuXG5cdHRlc3QoJ0NoYW5nZXNldEZpbGVTZXQgYXBwZW5kcyBhIG5ldyBmaWxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5leHQgPSBjaGFuZ2VzZXRSZWR1Y2VyKHJlYWR5LCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZVNldCwgZmlsZTogZmlsZUEgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXh0LmZpbGVzLCBbZmlsZUFdKTtcblx0fSk7XG5cblx0dGVzdCgnQ2hhbmdlc2V0RmlsZVNldCByZXBsYWNlcyBhbiBleGlzdGluZyBmaWxlIGJ5IGlkICh1cHNlcnQpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlZWRlZCA9IGNoYW5nZXNldFJlZHVjZXIocmVhZHksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRGaWxlU2V0LCBmaWxlOiBmaWxlQSB9KTtcblx0XHRjb25zdCBuZXh0ID0gY2hhbmdlc2V0UmVkdWNlcihzZWVkZWQsIHsgdHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRGaWxlU2V0LCBmaWxlOiBmaWxlQVJlbmFtZWQgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXh0LmZpbGVzLCBbZmlsZUFSZW5hbWVkXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYW5nZXNldEZpbGVSZW1vdmVkIHJlbW92ZXMgYnkgaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VlZGVkID0gY2hhbmdlc2V0UmVkdWNlcihyZWFkeSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVTZXQsIGZpbGU6IGZpbGVBIH0pO1xuXHRcdGNvbnN0IG5leHQgPSBjaGFuZ2VzZXRSZWR1Y2VyKHNlZWRlZCwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVSZW1vdmVkLCBmaWxlSWQ6IGZpbGVBLmlkIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV4dC5maWxlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGFuZ2VzZXRGaWxlUmVtb3ZlZCBpcyBhIG5vLW9wIGZvciBhbiB1bmtub3duIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlZWRlZCA9IGNoYW5nZXNldFJlZHVjZXIocmVhZHksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRGaWxlU2V0LCBmaWxlOiBmaWxlQSB9KTtcblx0XHRjb25zdCBuZXh0ID0gY2hhbmdlc2V0UmVkdWNlcihzZWVkZWQsIHsgdHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRGaWxlUmVtb3ZlZCwgZmlsZUlkOiAnZmlsZTovLy9ub3BlLnRzJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV4dCwgc2VlZGVkKTtcblx0fSk7XG5cblx0dGVzdCgnQ2hhbmdlc2V0U3RhdHVzQ2hhbmdlZCBcdTIxOTIgRXJyb3IgYXR0YWNoZXMgdGhlIGVycm9yJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVyciA9IHsgZXJyb3JUeXBlOiAnY29tcHV0ZUZhaWxlZCcsIG1lc3NhZ2U6ICdib29tJyB9O1xuXHRcdGNvbnN0IG5leHQgPSBjaGFuZ2VzZXRSZWR1Y2VyKHJlYWR5LCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0U3RhdHVzQ2hhbmdlZCwgc3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuRXJyb3IsIGVycm9yOiBlcnIgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHN0YXR1czogbmV4dC5zdGF0dXMsIGVycm9yOiBuZXh0LmVycm9yIH0sIHsgc3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuRXJyb3IsIGVycm9yOiBlcnIgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYW5nZXNldFN0YXR1c0NoYW5nZWQgXHUyMTkyIFJlYWR5IHN0cmlwcyBhIHByZXZpb3VzIGVycm9yJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVycm9yZWQ6IENoYW5nZXNldFN0YXRlID0geyBzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5FcnJvciwgZXJyb3I6IHsgZXJyb3JUeXBlOiAneCcsIG1lc3NhZ2U6ICd5JyB9LCBmaWxlczogW2ZpbGVBXSB9O1xuXHRcdGNvbnN0IG5leHQgPSBjaGFuZ2VzZXRSZWR1Y2VyKGVycm9yZWQsIHsgdHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkLCBzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc3RhdHVzOiBuZXh0LnN0YXR1cywgZXJyb3I6IG5leHQuZXJyb3IsIGZpbGVzOiBuZXh0LmZpbGVzIH0sIHsgc3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuUmVhZHksIGVycm9yOiB1bmRlZmluZWQsIGZpbGVzOiBbZmlsZUFdIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGFuZ2VzZXRPcGVyYXRpb25zQ2hhbmdlZCB3aXRoIGFycmF5IHJlcGxhY2VzIG9wZXJhdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3BzID0gW3sgaWQ6ICdzdGFnZScsIGxhYmVsOiAnU3RhZ2UnLCBzY29wZXM6IFtdLCBzdGF0dXM6IENoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5JZGxlIH1dO1xuXHRcdGNvbnN0IG5leHQgPSBjaGFuZ2VzZXRSZWR1Y2VyKHJlYWR5LCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0T3BlcmF0aW9uc0NoYW5nZWQsIG9wZXJhdGlvbnM6IG9wcyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5leHQub3BlcmF0aW9ucywgb3BzKTtcblx0fSk7XG5cblx0dGVzdCgnQ2hhbmdlc2V0T3BlcmF0aW9uc0NoYW5nZWQgd2l0aCB1bmRlZmluZWQgc3RyaXBzIG9wZXJhdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VlZGVkID0gY2hhbmdlc2V0UmVkdWNlcihyZWFkeSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldE9wZXJhdGlvbnNDaGFuZ2VkLCBvcGVyYXRpb25zOiBbeyBpZDogJ3N0YWdlJywgbGFiZWw6ICdTdGFnZScsIHNjb3BlczogW10sIHN0YXR1czogQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLklkbGUgfV0gfSk7XG5cdFx0Y29uc3QgbmV4dCA9IGNoYW5nZXNldFJlZHVjZXIoc2VlZGVkLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0T3BlcmF0aW9uc0NoYW5nZWQsIG9wZXJhdGlvbnM6IHVuZGVmaW5lZCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV4dC5vcGVyYXRpb25zLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGFuZ2VzZXRDbGVhcmVkIGVtcHRpZXMgZmlsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VlZGVkID0gY2hhbmdlc2V0UmVkdWNlcihyZWFkeSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVTZXQsIGZpbGU6IGZpbGVBIH0pO1xuXHRcdGNvbnN0IG5leHQgPSBjaGFuZ2VzZXRSZWR1Y2VyKHNlZWRlZCwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldENsZWFyZWQsIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV4dC5maWxlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGFuZ2VzZXRDbGVhcmVkIGlzIGEgbm8tb3Agd2hlbiBmaWxlcyBhcmUgYWxyZWFkeSBlbXB0eScsICgpID0+IHtcblx0XHRjb25zdCBuZXh0ID0gY2hhbmdlc2V0UmVkdWNlcihyZWFkeSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldENsZWFyZWQsIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXh0LCByZWFkeSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdzZXNzaW9uUmVkdWNlciBcdTIwMTMgU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGFnZW50QTogQWdlbnRDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdmaWxlOi8vL3BsdWdpbi1hL2FnZW50cy9oZWxwZXIubWQnLCB1cmk6ICdmaWxlOi8vL3BsdWdpbi1hL2FnZW50cy9oZWxwZXIubWQnLCBuYW1lOiAnaGVscGVyJyB9O1xuXHRjb25zdCBhZ2VudEI6IEFnZW50Q3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiAnZmlsZTovLy9wbHVnaW4tYS9hZ2VudHMvcmV2aWV3ZXIubWQnLCB1cmk6ICdmaWxlOi8vL3BsdWdpbi1hL2FnZW50cy9yZXZpZXdlci5tZCcsIG5hbWU6ICdyZXZpZXdlcicsIGRlc2NyaXB0aW9uOiAncmV2aWV3cyBjb2RlJyB9O1xuXG5cdGZ1bmN0aW9uIHBsdWdpbkEoZXh0cmE6IFBhcnRpYWw8UGx1Z2luQ3VzdG9taXphdGlvbj4gPSB7fSk6IEN1c3RvbWl6YXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRpZDogJ2ZpbGU6Ly8vcGx1Z2luLWEnLFxuXHRcdFx0dXJpOiAnZmlsZTovLy9wbHVnaW4tYScsXG5cdFx0XHRuYW1lOiAnUGx1Z2luIEEnLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdC4uLmV4dHJhLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdpbnNlcnQ6IGFwcGVuZHMgYSBuZXcgdG9wLWxldmVsIGN1c3RvbWl6YXRpb24gd2l0aCBpdHMgY2hpbGRyZW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbiA9IHBsdWdpbkEoeyBsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LCBjaGlsZHJlbjogW2FnZW50QSwgYWdlbnRCXSB9KTtcblx0XHRjb25zdCBzdGF0ZSA9IHNlc3Npb25SZWR1Y2VyKG1ha2VTZXNzaW9uKCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkLFxuXHRcdFx0Y3VzdG9taXphdGlvbixcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuY3VzdG9taXphdGlvbnMsIFtjdXN0b21pemF0aW9uXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZTogcmVwbGFjZXMgdGhlIG1hdGNoaW5nIGVudHJ5IGVudGlyZWx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGluaXRpYWwgPSBwbHVnaW5BKHsgbG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkaW5nIH0sIGNoaWxkcmVuOiBbYWdlbnRBXSB9KTtcblx0XHRjb25zdCBzZWVkZWQgPSBzZXNzaW9uUmVkdWNlcihtYWtlU2Vzc2lvbigpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZCxcblx0XHRcdGN1c3RvbWl6YXRpb246IGluaXRpYWwsXG5cdFx0fSk7XG5cdFx0Y29uc3QgdXBkYXRlZCA9IHBsdWdpbkEoeyBsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LCBjaGlsZHJlbjogW2FnZW50Ql0gfSk7XG5cdFx0Y29uc3QgbmV4dCA9IHNlc3Npb25SZWR1Y2VyKHNlZWRlZCwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQsXG5cdFx0XHRjdXN0b21pemF0aW9uOiB1cGRhdGVkLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXh0LmN1c3RvbWl6YXRpb25zLCBbdXBkYXRlZF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0JBQWtCLGFBQWEsc0JBQXNCO0FBQzlELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCLDBCQUEwQix5QkFBeUIsYUFBYSxzQkFBc0IsMEJBQTBCLHVCQUF1Qix1QkFBdUIsZ0JBQWdCLGtCQUFrQixlQUFlLDRCQUE0Qiw0QkFBNEIsOEJBQThCLGtCQUFrQixnQkFBZ0IsaUJBQWdKO0FBQ2pmLFNBQVMsbUJBQW1CLCtC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
