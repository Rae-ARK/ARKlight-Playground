import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentHostSessionTitleController } from "../../node/agentHostSessionTitleController.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { MessageKind, ResponsePartKind, SessionStatus, ToolCallConfirmationReason, ToolCallStatus, TurnState } from "../../common/state/sessionState.js";
import { createSessionDataService, TestSessionDatabase } from "../common/sessionTestHelpers.js";
class TestCopilotApiService {
  constructor() {
    this.utilityCalls = [];
    this.response = "Generated title";
  }
  messages() {
    throw new Error("not used");
  }
  async countTokens() {
    throw new Error("not used");
  }
  async models() {
    return [];
  }
  async responses() {
    throw new Error("not used");
  }
  async resolveRestrictedTelemetryContext() {
    return { restrictedTelemetryEnabled: false, trackingId: void 0, telemetryEndpoint: void 0 };
  }
  async resolveApiEndpoint() {
    return void 0;
  }
  async utilityChatCompletion(githubToken, request, options) {
    this.utilityCalls.push({ token: githubToken, request, options });
    if (this.error) {
      throw this.error;
    }
    if (this.responsePromise) {
      return this.responsePromise;
    }
    return this.response;
  }
}
suite("AgentHostSessionTitleController", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  function createSummary(session, title = "") {
    return {
      resource: session.toString(),
      provider: "copilot",
      title,
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date(1)).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date(1)).toISOString()
    };
  }
  async function waitForCondition(predicate, message) {
    for (let i = 0; i < 20; i++) {
      if (await predicate()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(await predicate(), message);
  }
  function setup(copilotApiService = new TestCopilotApiService(), title = "", getGitHubCopilotToken = () => "gh-token") {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const db = new TestSessionDatabase();
    const session = URI.parse("agenthost-session://copilot/session-title-test");
    stateManager.createSession(createSummary(session, title));
    const titleActions = [];
    disposables.add(stateManager.onDidEmitEnvelope((e) => {
      if (e.action.type === ActionType.SessionTitleChanged) {
        titleActions.push(e.action.title);
      }
    }));
    const controller = disposables.add(new AgentHostSessionTitleController(stateManager, {
      sessionDataService: createSessionDataService(db),
      getGitHubCopilotToken,
      copilotApiService
    }, new NullLogService()));
    return { controller, stateManager, session, db, titleActions, copilotApiService };
  }
  test("seedTitleFromFirstMessage applies fallback and persists generated title", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.response = '"Generated title."';
    const { controller, session, db, titleActions } = setup(copilotApiService);
    controller.seedTitleFromFirstMessage(session.toString(), "  Please   explain title generation  ");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Generated title", "generated title should be persisted");
    assert.deepStrictEqual({
      titles: titleActions,
      token: copilotApiService.utilityCalls[0]?.token,
      maxTokens: copilotApiService.utilityCalls[0]?.request.maxTokens,
      promptIncludesUserText: copilotApiService.utilityCalls[0]?.request.messages.some((message) => message.content.includes("Please   explain title generation")),
      persistedTitle: await db.getMetadata("customTitle")
    }, {
      titles: ["Please explain title generation", "Generated title"],
      token: "gh-token",
      maxTokens: 32,
      promptIncludesUserText: true,
      persistedTitle: "Generated title"
    });
  });
  test("seedTitleFromFirstMessage strips an unexpected trailing Han suffix from a Latin title", async () => {
    const titlePrefixAtLimit = "A".repeat(199);
    const cases = [
      { response: "Fix chat title\u7F16\u7801", expected: "Fix chat title" },
      { response: "Fix chat title \u7F16\u7801\u95EE", expected: "Fix chat title" },
      { response: `${titlePrefixAtLimit}\u7F16\u7801`, expected: titlePrefixAtLimit }
    ];
    const titles = [];
    for (const testCase of cases) {
      const copilotApiService = new TestCopilotApiService();
      copilotApiService.response = testCase.response;
      const { controller, stateManager, session, db } = setup(copilotApiService);
      controller.seedTitleFromFirstMessage(session.toString(), "Fix chat title generation");
      await waitForCondition(async () => {
        return stateManager.getSessionState(session.toString())?.title === testCase.expected && await db.getMetadata("customTitle") === testCase.expected;
      }, "cleaned title should be applied and persisted");
      titles.push({
        title: stateManager.getSessionState(session.toString())?.title ?? "",
        persistedTitle: await db.getMetadata("customTitle")
      });
    }
    assert.deepStrictEqual(titles, cases.map((testCase) => ({ title: testCase.expected, persistedTitle: testCase.expected })));
  });
  test("seedTitleFromFirstMessage preserves intentional or ambiguous Han suffixes", async () => {
    const cases = [
      { prompt: "Explain \u7F16\u7801 naming", response: "Explain code\u7F16\u7801" },
      { prompt: "Fix chat title generation", response: "Fix chat title\u7F16" },
      { prompt: "Fix chat title generation", response: "Fix chat title\u7F16\u7801\u95EE\u9898" },
      { prompt: "Fix chat title generation", response: "\u4FEE\u590D\u6807\u9898" },
      { prompt: "Fix chat title generation", response: "Code \u041E\u0448\u0438\u0431\u043A\u0430\u7F16\u7801" }
    ];
    const titles = [];
    for (const testCase of cases) {
      const copilotApiService = new TestCopilotApiService();
      copilotApiService.response = testCase.response;
      const { controller, stateManager, session, db } = setup(copilotApiService);
      controller.seedTitleFromFirstMessage(session.toString(), testCase.prompt);
      await waitForCondition(async () => {
        return stateManager.getSessionState(session.toString())?.title === testCase.response && await db.getMetadata("customTitle") === testCase.response;
      }, "unchanged title should be applied and persisted");
      titles.push({
        title: stateManager.getSessionState(session.toString())?.title ?? "",
        persistedTitle: await db.getMetadata("customTitle")
      });
    }
    assert.deepStrictEqual(titles, cases.map((testCase) => ({ title: testCase.response, persistedTitle: testCase.response })));
  });
  test("seedTitleFromFirstMessage does not clobber a changed title", async () => {
    const copilotApiService = new TestCopilotApiService();
    let resolveTitle;
    copilotApiService.responsePromise = new Promise((resolve) => {
      resolveTitle = resolve;
    });
    const { controller, stateManager, session, db } = setup(copilotApiService);
    controller.seedTitleFromFirstMessage(session.toString(), "Create title tests");
    await waitForCondition(() => copilotApiService.utilityCalls.length === 1, "title generation should start");
    stateManager.dispatchServerAction(session.toString(), {
      type: ActionType.SessionTitleChanged,
      title: "Manual title"
    });
    resolveTitle("Generated title");
    await Promise.resolve();
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      persistedTitle: await db.getMetadata("customTitle")
    }, {
      title: "Manual title",
      persistedTitle: void 0
    });
  });
  test("cancelTitleGeneration cancels delayed generated title application", async () => {
    const copilotApiService = new TestCopilotApiService();
    let resolveTitle;
    copilotApiService.responsePromise = new Promise((resolve) => {
      resolveTitle = resolve;
    });
    const { controller, stateManager, session, db } = setup(copilotApiService);
    controller.seedTitleFromFirstMessage(session.toString(), "Investigate title cancellation");
    await waitForCondition(() => copilotApiService.utilityCalls.length === 1, "title generation should start");
    controller.cancelTitleGeneration(session.toString());
    resolveTitle("Generated title");
    await Promise.resolve();
    assert.deepStrictEqual({
      aborted: copilotApiService.utilityCalls[0].options?.signal?.aborted,
      title: stateManager.getSessionState(session.toString())?.title,
      persistedTitle: await db.getMetadata("customTitle")
    }, {
      aborted: true,
      title: "Investigate title cancellation",
      persistedTitle: void 0
    });
  });
  test("seedTitleFromFirstMessage skips sessions with an existing title", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db, titleActions } = setup(copilotApiService, "Forked: Source title");
    controller.seedTitleFromFirstMessage(session.toString(), "Continue forked session");
    await Promise.resolve();
    assert.deepStrictEqual({
      calls: copilotApiService.utilityCalls.length,
      title: stateManager.getSessionState(session.toString())?.title,
      titles: titleActions,
      persistedTitle: await db.getMetadata("customTitle")
    }, {
      calls: 0,
      title: "Forked: Source title",
      titles: [],
      persistedTitle: void 0
    });
  });
  test("seedProvisionalTitle titles the session from the suggestion without generating", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db, titleActions } = setup(copilotApiService);
    controller.seedProvisionalTitle(session.toString(), "ls -la");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "ls -la", "provisional title should be persisted");
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      titles: titleActions,
      persistedTitle: await db.getMetadata("customTitle"),
      utilityCalls: copilotApiService.utilityCalls.length
    }, {
      title: "ls -la",
      titles: ["ls -la"],
      persistedTitle: "ls -la",
      utilityCalls: 0
    });
  });
  test("seedProvisionalTitle refreshes a provisional title with a later suggestion", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db } = setup(copilotApiService);
    controller.seedProvisionalTitle(session.toString(), "ls -la");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "ls -la", "first provisional title should be persisted");
    controller.seedProvisionalTitle(session.toString(), "git status");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "git status", "second provisional title should be persisted");
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      utilityCalls: copilotApiService.utilityCalls.length
    }, {
      title: "git status",
      utilityCalls: 0
    });
  });
  test("seedProvisionalTitle does not clobber a changed title", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db, titleActions } = setup(copilotApiService);
    controller.seedProvisionalTitle(session.toString(), "ls -la");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "ls -la", "provisional title should be persisted");
    stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title: "Manual title" });
    controller.seedProvisionalTitle(session.toString(), "git status");
    await Promise.resolve();
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      titles: titleActions
    }, {
      title: "Manual title",
      titles: ["ls -la", "Manual title"]
    });
  });
  test("seedTitleFromFirstMessage replaces a provisional title with a generated title", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.response = "Explain the build";
    const { controller, stateManager, session, db, titleActions } = setup(copilotApiService);
    controller.seedProvisionalTitle(session.toString(), "ls -la");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "ls -la", "provisional title should be persisted");
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn("!ls -la", [])]);
    controller.seedTitleFromFirstMessage(session.toString(), "Explain how the build works");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Explain the build", "generated title should replace the provisional title");
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      titles: titleActions,
      persistedTitle: await db.getMetadata("customTitle")
    }, {
      title: "Explain the build",
      titles: ["ls -la", "Explain how the build works", "Explain the build"],
      persistedTitle: "Explain the build"
    });
  });
  test("seedTitleFromFirstMessage persists its fallback when replacing a provisional title", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.error = new Error("Title generation unavailable");
    const { controller, stateManager, session, db } = setup(copilotApiService);
    controller.seedProvisionalTitle(session.toString(), "ls -la");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "ls -la", "provisional title should be persisted");
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn("!ls -la", [])]);
    controller.seedTitleFromFirstMessage(session.toString(), "Explain how the build works");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Explain how the build works", "fallback title should replace the provisional title");
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      persistedTitle: await db.getMetadata("customTitle")
    }, {
      title: "Explain how the build works",
      persistedTitle: "Explain how the build works"
    });
  });
  function textPart(content) {
    return { kind: ResponsePartKind.Markdown, id: "m1", content };
  }
  function reasoningPart(content) {
    return { kind: ResponsePartKind.Reasoning, id: "r1", content };
  }
  function toolCallPart(displayName, invocationMessage) {
    const toolCall = {
      status: ToolCallStatus.Completed,
      toolCallId: "tc1",
      toolName: "tool",
      displayName,
      invocationMessage,
      success: true,
      pastTenseMessage: "done",
      confirmed: ToolCallConfirmationReason.NotNeeded
    };
    return { kind: ResponsePartKind.ToolCall, toolCall };
  }
  function firstTurn(text, responseParts) {
    return {
      id: "turn-1",
      message: { text, origin: { kind: MessageKind.User } },
      responseParts,
      usage: void 0,
      state: TurnState.Complete
    };
  }
  async function seedFirstTitle(controller, copilotApiService, db, session, userPrompt, title) {
    copilotApiService.response = title;
    controller.seedTitleFromFirstMessage(session.toString(), userPrompt);
    await waitForCondition(async () => await db.getMetadata("customTitle") === title, "first title should be persisted");
  }
  test("refineTitleFromFirstTurn regenerates the title from the first-turn context", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db } = setup(copilotApiService);
    await seedFirstTitle(controller, copilotApiService, db, session, "Add dark mode toggle", "First title");
    copilotApiService.response = "Dark mode setting";
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn("Add dark mode toggle", [textPart("Implemented the toggle in the settings editor.")])]);
    controller.refineTitleFromFirstTurn(session.toString());
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Dark mode setting", "refined title should be persisted");
    const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
    const userMessage = lastCall.request.messages.find((message) => message.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      persistedTitle: await db.getMetadata("customTitle"),
      mentionsConversation: userMessage.includes("conversation"),
      includesUserRequest: userMessage.includes("Add dark mode toggle"),
      includesResponse: userMessage.includes("Implemented the toggle in the settings editor.")
    }, {
      title: "Dark mode setting",
      persistedTitle: "Dark mode setting",
      mentionsConversation: true,
      includesUserRequest: true,
      includesResponse: true
    });
  });
  test("refineTitleFromFirstTurn does not clobber a title changed in the meantime", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db } = setup(copilotApiService);
    await seedFirstTitle(controller, copilotApiService, db, session, "Add dark mode toggle", "First title");
    const callsAfterSeed = copilotApiService.utilityCalls.length;
    stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title: "Manual title" });
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn("Add dark mode toggle", [textPart("Implemented the toggle.")])]);
    controller.refineTitleFromFirstTurn(session.toString());
    await Promise.resolve();
    assert.deepStrictEqual({
      calls: copilotApiService.utilityCalls.length,
      title: stateManager.getSessionState(session.toString())?.title
    }, {
      calls: callsAfterSeed,
      title: "Manual title"
    });
  });
  test("refineTitleFromFirstTurn ignores tool calls and reasoning, keeping only text parts", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db } = setup(copilotApiService);
    await seedFirstTitle(controller, copilotApiService, db, session, "Add dark mode toggle", "First title");
    copilotApiService.response = "Refined title";
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn("Add dark mode toggle", [
      reasoningPart("Thinking about THINKING_MARKER the approach"),
      toolCallPart("SearchTool", "searched the workspace TOOL_MARKER"),
      textPart("Added the toggle TEXT_MARKER to settings.")
    ])]);
    controller.refineTitleFromFirstTurn(session.toString());
    await waitForCondition(() => copilotApiService.utilityCalls.length >= 2, "refine should issue a utility call");
    const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
    const userMessage = lastCall.request.messages.find((message) => message.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      includesText: userMessage.includes("TEXT_MARKER"),
      excludesReasoning: !userMessage.includes("THINKING_MARKER"),
      excludesToolCall: !userMessage.includes("TOOL_MARKER") && !userMessage.includes("SearchTool")
    }, {
      includesText: true,
      excludesReasoning: true,
      excludesToolCall: true
    });
  });
  test("refineTitleFromFirstTurn truncates the middle of an oversized text response", async () => {
    const copilotApiService = new TestCopilotApiService();
    const { controller, stateManager, session, db } = setup(copilotApiService);
    await seedFirstTitle(controller, copilotApiService, db, session, "Add dark mode toggle", "First title");
    copilotApiService.response = "Refined title";
    const hugeResponse = "A".repeat(15e3) + " MIDDLE_MARKER " + "B".repeat(15e3);
    stateManager.seedDefaultChatTurns(session.toString(), [firstTurn("Add dark mode toggle", [textPart(hugeResponse)])]);
    controller.refineTitleFromFirstTurn(session.toString());
    await waitForCondition(() => copilotApiService.utilityCalls.length >= 2, "refine should issue a utility call");
    const lastCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
    const userMessage = lastCall.request.messages.find((message) => message.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      withinBudget: userMessage.length <= 20200,
      middleTruncated: userMessage.includes("...") && !userMessage.includes("MIDDLE_MARKER"),
      includesUserRequest: userMessage.includes("Add dark mode toggle"),
      keepsHeadAndTail: userMessage.includes("AAAA") && userMessage.includes("BBBB")
    }, {
      withinBudget: true,
      middleTruncated: true,
      includesUserRequest: true,
      keepsHeadAndTail: true
    });
  });
  function turn(id, text, responseParts) {
    return {
      id,
      message: { text, origin: { kind: MessageKind.User } },
      responseParts,
      usage: void 0,
      state: TurnState.Complete
    };
  }
  test("generateForkedTitle replaces the inherited title using the whole forked conversation", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.response = "Compaction strategy";
    const { controller, stateManager, session, db, titleActions } = setup(copilotApiService, "Forked: Source title");
    stateManager.seedDefaultChatTurns(session.toString(), [
      turn("turn-1", "Add dark mode toggle", [textPart("Implemented the toggle in settings.")]),
      turn("turn-2", "Now compact the history", [textPart("Summarized earlier turns.")])
    ]);
    const turns = stateManager.getSessionState(session.toString()).turns;
    controller.generateForkedTitle(session.toString(), void 0, turns, "Forked: Source title", "Source title");
    await waitForCondition(async () => await db.getMetadata("customTitle") === "Compaction strategy", "forked title should be persisted");
    const userMessage = copilotApiService.utilityCalls[0]?.request.messages.find((message) => message.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      titles: titleActions,
      persistedTitle: await db.getMetadata("customTitle"),
      mentionsConversation: userMessage.includes("conversation"),
      framesAsBranch: userMessage.includes('branched from an earlier chat titled "Source title"'),
      includesFirstTurn: userMessage.includes("Add dark mode toggle") && userMessage.includes("Implemented the toggle in settings."),
      includesSecondTurn: userMessage.includes("Now compact the history") && userMessage.includes("Summarized earlier turns.")
    }, {
      titles: ["Compaction strategy"],
      persistedTitle: "Compaction strategy",
      mentionsConversation: true,
      framesAsBranch: true,
      includesFirstTurn: true,
      includesSecondTurn: true
    });
  });
  test("generateForkedTitle does not clobber a title changed during generation", async () => {
    const copilotApiService = new TestCopilotApiService();
    let resolveTitle;
    copilotApiService.responsePromise = new Promise((resolve) => {
      resolveTitle = resolve;
    });
    const { controller, stateManager, session, db } = setup(copilotApiService, "Forked: Source title");
    stateManager.seedDefaultChatTurns(session.toString(), [turn("turn-1", "Add dark mode toggle", [textPart("Done.")])]);
    controller.generateForkedTitle(session.toString(), void 0, stateManager.getSessionState(session.toString()).turns, "Forked: Source title");
    await waitForCondition(() => copilotApiService.utilityCalls.length === 1, "forked title generation should start");
    stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title: "Manual title" });
    resolveTitle("Generated title");
    await Promise.resolve();
    assert.deepStrictEqual({
      title: stateManager.getSessionState(session.toString())?.title,
      persistedTitle: await db.getMetadata("customTitle")
    }, {
      title: "Manual title",
      persistedTitle: void 0
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0U2Vzc2lvblRpdGxlQ29udHJvbGxlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgQW50aHJvcGljIGZyb20gJ0BhbnRocm9waWMtYWkvc2RrJztcbmltcG9ydCB0eXBlIHsgQ0NBTW9kZWwgfSBmcm9tICdAdnNjb2RlL2NvcGlsb3QtYXBpJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgU2Vzc2lvblN0YXR1cywgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsU3RhdHVzLCBUdXJuU3RhdGUsIHR5cGUgUmVzcG9uc2VQYXJ0LCB0eXBlIFNlc3Npb25TdW1tYXJ5LCB0eXBlIFRvb2xDYWxsQ29tcGxldGVkU3RhdGUsIHR5cGUgVHVybiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgdHlwZSBJQ29waWxvdEFwaVNlcnZpY2UsIHR5cGUgSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsIHR5cGUgSUNvcGlsb3RVdGlsaXR5Q2hhdENvbXBsZXRpb25SZXF1ZXN0IH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvY29waWxvdEFwaVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlLCBUZXN0U2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5cbmNsYXNzIFRlc3RDb3BpbG90QXBpU2VydmljZSBpbXBsZW1lbnRzIElDb3BpbG90QXBpU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHV0aWxpdHlDYWxsczogeyB0b2tlbjogc3RyaW5nOyByZXF1ZXN0OiBJQ29waWxvdFV0aWxpdHlDaGF0Q29tcGxldGlvblJlcXVlc3Q7IG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyB9W10gPSBbXTtcblx0cmVzcG9uc2UgPSAnR2VuZXJhdGVkIHRpdGxlJztcblx0cmVzcG9uc2VQcm9taXNlOiBQcm9taXNlPHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblxuXHRtZXNzYWdlcyhfZ2l0aHViVG9rZW46IHN0cmluZywgX3JlcXVlc3Q6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zU3RyZWFtaW5nLCBfb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zKTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD47XG5cdG1lc3NhZ2VzKF9naXRodWJUb2tlbjogc3RyaW5nLCBfcmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNOb25TdHJlYW1pbmcsIF9vcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPjtcblx0bWVzc2FnZXMoKTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD4gfCBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpO1xuXHR9XG5cdGFzeW5jIGNvdW50VG9rZW5zKCk6IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2VUb2tlbnNDb3VudD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCB1c2VkJyk7IH1cblx0YXN5bmMgbW9kZWxzKCk6IFByb21pc2U8Q0NBTW9kZWxbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgcmVzcG9uc2VzKCk6IFByb21pc2U8UmVzcG9uc2U+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpOyB9XG5cdGFzeW5jIHJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCgpIHsgcmV0dXJuIHsgcmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IGZhbHNlLCB0cmFja2luZ0lkOiB1bmRlZmluZWQsIHRlbGVtZXRyeUVuZHBvaW50OiB1bmRlZmluZWQgfTsgfVxuXHRhc3luYyByZXNvbHZlQXBpRW5kcG9pbnQoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgdXRpbGl0eUNoYXRDb21wbGV0aW9uKGdpdGh1YlRva2VuOiBzdHJpbmcsIHJlcXVlc3Q6IElDb3BpbG90VXRpbGl0eUNoYXRDb21wbGV0aW9uUmVxdWVzdCwgb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0aGlzLnV0aWxpdHlDYWxscy5wdXNoKHsgdG9rZW46IGdpdGh1YlRva2VuLCByZXF1ZXN0LCBvcHRpb25zIH0pO1xuXHRcdGlmICh0aGlzLmVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLmVycm9yO1xuXHRcdH1cblx0XHRpZiAodGhpcy5yZXNwb25zZVByb21pc2UpIHtcblx0XHRcdHJldHVybiB0aGlzLnJlc3BvbnNlUHJvbWlzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMucmVzcG9uc2U7XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTdW1tYXJ5KHNlc3Npb246IFVSSSwgdGl0bGUgPSAnJyk6IFNlc3Npb25TdW1tYXJ5IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHR0aXRsZSxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgxKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoMSkudG9JU09TdHJpbmcoKSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gd2FpdEZvckNvbmRpdGlvbihwcmVkaWNhdGU6ICgpID0+IGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+LCBtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDIwOyBpKyspIHtcblx0XHRcdGlmIChhd2FpdCBwcmVkaWNhdGUoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgNSkpO1xuXHRcdH1cblx0XHRhc3NlcnQub2soYXdhaXQgcHJlZGljYXRlKCksIG1lc3NhZ2UpO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCksIHRpdGxlID0gJycsIGdldEdpdEh1YkNvcGlsb3RUb2tlbiA9ICgpID0+ICdnaC10b2tlbicpOiB7XG5cdFx0Y29udHJvbGxlcjogQWdlbnRIb3N0U2Vzc2lvblRpdGxlQ29udHJvbGxlcjtcblx0XHRzdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcjtcblx0XHRzZXNzaW9uOiBVUkk7XG5cdFx0ZGI6IFRlc3RTZXNzaW9uRGF0YWJhc2U7XG5cdFx0dGl0bGVBY3Rpb25zOiBzdHJpbmdbXTtcblx0XHRjb3BpbG90QXBpU2VydmljZTogVGVzdENvcGlsb3RBcGlTZXJ2aWNlO1xuXHR9IHtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gVVJJLnBhcnNlKCdhZ2VudGhvc3Qtc2Vzc2lvbjovL2NvcGlsb3Qvc2Vzc2lvbi10aXRsZS10ZXN0Jyk7XG5cdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oY3JlYXRlU3VtbWFyeShzZXNzaW9uLCB0aXRsZSkpO1xuXHRcdGNvbnN0IHRpdGxlQWN0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCkge1xuXHRcdFx0XHR0aXRsZUFjdGlvbnMucHVzaChlLmFjdGlvbi50aXRsZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXIoc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksXG5cdFx0XHRnZXRHaXRIdWJDb3BpbG90VG9rZW4sXG5cdFx0XHRjb3BpbG90QXBpU2VydmljZSxcblx0XHR9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHJldHVybiB7IGNvbnRyb2xsZXIsIHN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgZGIsIHRpdGxlQWN0aW9ucywgY29waWxvdEFwaVNlcnZpY2UgfTtcblx0fVxuXG5cdHRlc3QoJ3NlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2UgYXBwbGllcyBmYWxsYmFjayBhbmQgcGVyc2lzdHMgZ2VuZXJhdGVkIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlID0gJ1wiR2VuZXJhdGVkIHRpdGxlLlwiJztcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHNlc3Npb24sIGRiLCB0aXRsZUFjdGlvbnMgfSA9IHNldHVwKGNvcGlsb3RBcGlTZXJ2aWNlKTtcblxuXHRcdGNvbnRyb2xsZXIuc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShzZXNzaW9uLnRvU3RyaW5nKCksICcgIFBsZWFzZSAgIGV4cGxhaW4gdGl0bGUgZ2VuZXJhdGlvbiAgJyk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbihhc3luYyAoKSA9PiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSA9PT0gJ0dlbmVyYXRlZCB0aXRsZScsICdnZW5lcmF0ZWQgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0aXRsZXM6IHRpdGxlQWN0aW9ucyxcblx0XHRcdHRva2VuOiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHNbMF0/LnRva2VuLFxuXHRcdFx0bWF4VG9rZW5zOiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHNbMF0/LnJlcXVlc3QubWF4VG9rZW5zLFxuXHRcdFx0cHJvbXB0SW5jbHVkZXNVc2VyVGV4dDogY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzWzBdPy5yZXF1ZXN0Lm1lc3NhZ2VzLnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLmNvbnRlbnQuaW5jbHVkZXMoJ1BsZWFzZSAgIGV4cGxhaW4gdGl0bGUgZ2VuZXJhdGlvbicpKSxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSxcblx0XHR9LCB7XG5cdFx0XHR0aXRsZXM6IFsnUGxlYXNlIGV4cGxhaW4gdGl0bGUgZ2VuZXJhdGlvbicsICdHZW5lcmF0ZWQgdGl0bGUnXSxcblx0XHRcdHRva2VuOiAnZ2gtdG9rZW4nLFxuXHRcdFx0bWF4VG9rZW5zOiAzMixcblx0XHRcdHByb21wdEluY2x1ZGVzVXNlclRleHQ6IHRydWUsXG5cdFx0XHRwZXJzaXN0ZWRUaXRsZTogJ0dlbmVyYXRlZCB0aXRsZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2Ugc3RyaXBzIGFuIHVuZXhwZWN0ZWQgdHJhaWxpbmcgSGFuIHN1ZmZpeCBmcm9tIGEgTGF0aW4gdGl0bGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGl0bGVQcmVmaXhBdExpbWl0ID0gJ0EnLnJlcGVhdCgxOTkpO1xuXHRcdGNvbnN0IGNhc2VzID0gW1xuXHRcdFx0eyByZXNwb25zZTogJ0ZpeCBjaGF0IHRpdGxlXFx1N2YxNlxcdTc4MDEnLCBleHBlY3RlZDogJ0ZpeCBjaGF0IHRpdGxlJyB9LFxuXHRcdFx0eyByZXNwb25zZTogJ0ZpeCBjaGF0IHRpdGxlIFxcdTdmMTZcXHU3ODAxXFx1OTVlZScsIGV4cGVjdGVkOiAnRml4IGNoYXQgdGl0bGUnIH0sXG5cdFx0XHR7IHJlc3BvbnNlOiBgJHt0aXRsZVByZWZpeEF0TGltaXR9XFx1N2YxNlxcdTc4MDFgLCBleHBlY3RlZDogdGl0bGVQcmVmaXhBdExpbWl0IH0sXG5cdFx0XTtcblx0XHRjb25zdCB0aXRsZXM6IHsgdGl0bGU6IHN0cmluZzsgcGVyc2lzdGVkVGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgdGVzdENhc2Ugb2YgY2FzZXMpIHtcblx0XHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0Y29waWxvdEFwaVNlcnZpY2UucmVzcG9uc2UgPSB0ZXN0Q2FzZS5yZXNwb25zZTtcblx0XHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UpO1xuXG5cdFx0XHRjb250cm9sbGVyLnNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2Uoc2Vzc2lvbi50b1N0cmluZygpLCAnRml4IGNoYXQgdGl0bGUgZ2VuZXJhdGlvbicpO1xuXHRcdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LnRpdGxlID09PSB0ZXN0Q2FzZS5leHBlY3RlZFxuXHRcdFx0XHRcdCYmIGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSB0ZXN0Q2FzZS5leHBlY3RlZDtcblx0XHRcdH0sICdjbGVhbmVkIHRpdGxlIHNob3VsZCBiZSBhcHBsaWVkIGFuZCBwZXJzaXN0ZWQnKTtcblx0XHRcdHRpdGxlcy5wdXNoKHtcblx0XHRcdFx0dGl0bGU6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8udGl0bGUgPz8gJycsXG5cdFx0XHRcdHBlcnNpc3RlZFRpdGxlOiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGl0bGVzLCBjYXNlcy5tYXAodGVzdENhc2UgPT4gKHsgdGl0bGU6IHRlc3RDYXNlLmV4cGVjdGVkLCBwZXJzaXN0ZWRUaXRsZTogdGVzdENhc2UuZXhwZWN0ZWQgfSkpKTtcblx0fSk7XG5cblx0dGVzdCgnc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZSBwcmVzZXJ2ZXMgaW50ZW50aW9uYWwgb3IgYW1iaWd1b3VzIEhhbiBzdWZmaXhlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYXNlcyA9IFtcblx0XHRcdHsgcHJvbXB0OiAnRXhwbGFpbiBcXHU3ZjE2XFx1NzgwMSBuYW1pbmcnLCByZXNwb25zZTogJ0V4cGxhaW4gY29kZVxcdTdmMTZcXHU3ODAxJyB9LFxuXHRcdFx0eyBwcm9tcHQ6ICdGaXggY2hhdCB0aXRsZSBnZW5lcmF0aW9uJywgcmVzcG9uc2U6ICdGaXggY2hhdCB0aXRsZVxcdTdmMTYnIH0sXG5cdFx0XHR7IHByb21wdDogJ0ZpeCBjaGF0IHRpdGxlIGdlbmVyYXRpb24nLCByZXNwb25zZTogJ0ZpeCBjaGF0IHRpdGxlXFx1N2YxNlxcdTc4MDFcXHU5NWVlXFx1OTg5OCcgfSxcblx0XHRcdHsgcHJvbXB0OiAnRml4IGNoYXQgdGl0bGUgZ2VuZXJhdGlvbicsIHJlc3BvbnNlOiAnXFx1NGZlZVxcdTU5MGRcXHU2ODA3XFx1OTg5OCcgfSxcblx0XHRcdHsgcHJvbXB0OiAnRml4IGNoYXQgdGl0bGUgZ2VuZXJhdGlvbicsIHJlc3BvbnNlOiAnQ29kZSBcXHUwNDFlXFx1MDQ0OFxcdTA0MzhcXHUwNDMxXFx1MDQzYVxcdTA0MzBcXHU3ZjE2XFx1NzgwMScgfSxcblx0XHRdO1xuXHRcdGNvbnN0IHRpdGxlczogeyB0aXRsZTogc3RyaW5nOyBwZXJzaXN0ZWRUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCB0ZXN0Q2FzZSBvZiBjYXNlcykge1xuXHRcdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRjb3BpbG90QXBpU2VydmljZS5yZXNwb25zZSA9IHRlc3RDYXNlLnJlc3BvbnNlO1xuXHRcdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzdGF0ZU1hbmFnZXIsIHNlc3Npb24sIGRiIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSk7XG5cblx0XHRcdGNvbnRyb2xsZXIuc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShzZXNzaW9uLnRvU3RyaW5nKCksIHRlc3RDYXNlLnByb21wdCk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8udGl0bGUgPT09IHRlc3RDYXNlLnJlc3BvbnNlXG5cdFx0XHRcdFx0JiYgYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09IHRlc3RDYXNlLnJlc3BvbnNlO1xuXHRcdFx0fSwgJ3VuY2hhbmdlZCB0aXRsZSBzaG91bGQgYmUgYXBwbGllZCBhbmQgcGVyc2lzdGVkJyk7XG5cdFx0XHR0aXRsZXMucHVzaCh7XG5cdFx0XHRcdHRpdGxlOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LnRpdGxlID8/ICcnLFxuXHRcdFx0XHRwZXJzaXN0ZWRUaXRsZTogYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJyksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRpdGxlcywgY2FzZXMubWFwKHRlc3RDYXNlID0+ICh7IHRpdGxlOiB0ZXN0Q2FzZS5yZXNwb25zZSwgcGVyc2lzdGVkVGl0bGU6IHRlc3RDYXNlLnJlc3BvbnNlIH0pKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2UgZG9lcyBub3QgY2xvYmJlciBhIGNoYW5nZWQgdGl0bGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0bGV0IHJlc29sdmVUaXRsZSE6ICh0aXRsZTogc3RyaW5nKSA9PiB2b2lkO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlUHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4geyByZXNvbHZlVGl0bGUgPSByZXNvbHZlOyB9KTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgZGIgfSA9IHNldHVwKGNvcGlsb3RBcGlTZXJ2aWNlKTtcblxuXHRcdGNvbnRyb2xsZXIuc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShzZXNzaW9uLnRvU3RyaW5nKCksICdDcmVhdGUgdGl0bGUgdGVzdHMnKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKCgpID0+IGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGggPT09IDEsICd0aXRsZSBnZW5lcmF0aW9uIHNob3VsZCBzdGFydCcpO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLnRvU3RyaW5nKCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdHRpdGxlOiAnTWFudWFsIHRpdGxlJyxcblx0XHR9KTtcblx0XHRyZXNvbHZlVGl0bGUoJ0dlbmVyYXRlZCB0aXRsZScpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0aXRsZTogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy50aXRsZSxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSxcblx0XHR9LCB7XG5cdFx0XHR0aXRsZTogJ01hbnVhbCB0aXRsZScsXG5cdFx0XHRwZXJzaXN0ZWRUaXRsZTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxUaXRsZUdlbmVyYXRpb24gY2FuY2VscyBkZWxheWVkIGdlbmVyYXRlZCB0aXRsZSBhcHBsaWNhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRsZXQgcmVzb2x2ZVRpdGxlITogKHRpdGxlOiBzdHJpbmcpID0+IHZvaWQ7XG5cdFx0Y29waWxvdEFwaVNlcnZpY2UucmVzcG9uc2VQcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7IHJlc29sdmVUaXRsZSA9IHJlc29sdmU7IH0pO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UpO1xuXG5cdFx0Y29udHJvbGxlci5zZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlKHNlc3Npb24udG9TdHJpbmcoKSwgJ0ludmVzdGlnYXRlIHRpdGxlIGNhbmNlbGxhdGlvbicpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oKCkgPT4gY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzLmxlbmd0aCA9PT0gMSwgJ3RpdGxlIGdlbmVyYXRpb24gc2hvdWxkIHN0YXJ0Jyk7XG5cdFx0Y29udHJvbGxlci5jYW5jZWxUaXRsZUdlbmVyYXRpb24oc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRyZXNvbHZlVGl0bGUoJ0dlbmVyYXRlZCB0aXRsZScpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhYm9ydGVkOiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHNbMF0ub3B0aW9ucz8uc2lnbmFsPy5hYm9ydGVkLFxuXHRcdFx0dGl0bGU6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8udGl0bGUsXG5cdFx0XHRwZXJzaXN0ZWRUaXRsZTogYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJyksXG5cdFx0fSwge1xuXHRcdFx0YWJvcnRlZDogdHJ1ZSxcblx0XHRcdHRpdGxlOiAnSW52ZXN0aWdhdGUgdGl0bGUgY2FuY2VsbGF0aW9uJyxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2Ugc2tpcHMgc2Vzc2lvbnMgd2l0aCBhbiBleGlzdGluZyB0aXRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgZGIsIHRpdGxlQWN0aW9ucyB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UsICdGb3JrZWQ6IFNvdXJjZSB0aXRsZScpO1xuXG5cdFx0Y29udHJvbGxlci5zZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlKHNlc3Npb24udG9TdHJpbmcoKSwgJ0NvbnRpbnVlIGZvcmtlZCBzZXNzaW9uJyk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNhbGxzOiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHMubGVuZ3RoLFxuXHRcdFx0dGl0bGU6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8udGl0bGUsXG5cdFx0XHR0aXRsZXM6IHRpdGxlQWN0aW9ucyxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSxcblx0XHR9LCB7XG5cdFx0XHRjYWxsczogMCxcblx0XHRcdHRpdGxlOiAnRm9ya2VkOiBTb3VyY2UgdGl0bGUnLFxuXHRcdFx0dGl0bGVzOiBbXSxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRQcm92aXNpb25hbFRpdGxlIHRpdGxlcyB0aGUgc2Vzc2lvbiBmcm9tIHRoZSBzdWdnZXN0aW9uIHdpdGhvdXQgZ2VuZXJhdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgZGIsIHRpdGxlQWN0aW9ucyB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UpO1xuXG5cdFx0Y29udHJvbGxlci5zZWVkUHJvdmlzaW9uYWxUaXRsZShzZXNzaW9uLnRvU3RyaW5nKCksICdscyAtbGEnKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSAnbHMgLWxhJywgJ3Byb3Zpc2lvbmFsIHRpdGxlIHNob3VsZCBiZSBwZXJzaXN0ZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dGl0bGU6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8udGl0bGUsXG5cdFx0XHR0aXRsZXM6IHRpdGxlQWN0aW9ucyxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSxcblx0XHRcdHV0aWxpdHlDYWxsczogY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHR0aXRsZTogJ2xzIC1sYScsXG5cdFx0XHR0aXRsZXM6IFsnbHMgLWxhJ10sXG5cdFx0XHRwZXJzaXN0ZWRUaXRsZTogJ2xzIC1sYScsXG5cdFx0XHR1dGlsaXR5Q2FsbHM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRQcm92aXNpb25hbFRpdGxlIHJlZnJlc2hlcyBhIHByb3Zpc2lvbmFsIHRpdGxlIHdpdGggYSBsYXRlciBzdWdnZXN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UpO1xuXG5cdFx0Y29udHJvbGxlci5zZWVkUHJvdmlzaW9uYWxUaXRsZShzZXNzaW9uLnRvU3RyaW5nKCksICdscyAtbGEnKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSAnbHMgLWxhJywgJ2ZpcnN0IHByb3Zpc2lvbmFsIHRpdGxlIHNob3VsZCBiZSBwZXJzaXN0ZWQnKTtcblx0XHRjb250cm9sbGVyLnNlZWRQcm92aXNpb25hbFRpdGxlKHNlc3Npb24udG9TdHJpbmcoKSwgJ2dpdCBzdGF0dXMnKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSAnZ2l0IHN0YXR1cycsICdzZWNvbmQgcHJvdmlzaW9uYWwgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0aXRsZTogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy50aXRsZSxcblx0XHRcdHV0aWxpdHlDYWxsczogY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHR0aXRsZTogJ2dpdCBzdGF0dXMnLFxuXHRcdFx0dXRpbGl0eUNhbGxzOiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWVkUHJvdmlzaW9uYWxUaXRsZSBkb2VzIG5vdCBjbG9iYmVyIGEgY2hhbmdlZCB0aXRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgZGIsIHRpdGxlQWN0aW9ucyB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UpO1xuXG5cdFx0Y29udHJvbGxlci5zZWVkUHJvdmlzaW9uYWxUaXRsZShzZXNzaW9uLnRvU3RyaW5nKCksICdscyAtbGEnKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSAnbHMgLWxhJywgJ3Byb3Zpc2lvbmFsIHRpdGxlIHNob3VsZCBiZSBwZXJzaXN0ZWQnKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbi50b1N0cmluZygpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGU6ICdNYW51YWwgdGl0bGUnIH0pO1xuXHRcdGNvbnRyb2xsZXIuc2VlZFByb3Zpc2lvbmFsVGl0bGUoc2Vzc2lvbi50b1N0cmluZygpLCAnZ2l0IHN0YXR1cycpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0aXRsZTogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy50aXRsZSxcblx0XHRcdHRpdGxlczogdGl0bGVBY3Rpb25zLFxuXHRcdH0sIHtcblx0XHRcdHRpdGxlOiAnTWFudWFsIHRpdGxlJyxcblx0XHRcdHRpdGxlczogWydscyAtbGEnLCAnTWFudWFsIHRpdGxlJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2UgcmVwbGFjZXMgYSBwcm92aXNpb25hbCB0aXRsZSB3aXRoIGEgZ2VuZXJhdGVkIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlID0gJ0V4cGxhaW4gdGhlIGJ1aWxkJztcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgZGIsIHRpdGxlQWN0aW9ucyB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UpO1xuXG5cdFx0Ly8gQSBgIWNvbW1hbmRgIHNlZWRzIGEgcHJvdmlzaW9uYWwgdGl0bGUgYW5kIHJlY29yZHMgYSAobG9jYWwpIHR1cm4uXG5cdFx0Y29udHJvbGxlci5zZWVkUHJvdmlzaW9uYWxUaXRsZShzZXNzaW9uLnRvU3RyaW5nKCksICdscyAtbGEnKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSAnbHMgLWxhJywgJ3Byb3Zpc2lvbmFsIHRpdGxlIHNob3VsZCBiZSBwZXJzaXN0ZWQnKTtcblx0XHRzdGF0ZU1hbmFnZXIuc2VlZERlZmF1bHRDaGF0VHVybnMoc2Vzc2lvbi50b1N0cmluZygpLCBbZmlyc3RUdXJuKCchbHMgLWxhJywgW10pXSk7XG5cblx0XHQvLyBUaGUgZmlyc3QgcmVhbCByZXF1ZXN0IHN1cGVyc2VkZXMgaXQgd2l0aCBhIGdlbmVyYXRlZCB0aXRsZS5cblx0XHRjb250cm9sbGVyLnNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2Uoc2Vzc2lvbi50b1N0cmluZygpLCAnRXhwbGFpbiBob3cgdGhlIGJ1aWxkIHdvcmtzJyk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbihhc3luYyAoKSA9PiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSA9PT0gJ0V4cGxhaW4gdGhlIGJ1aWxkJywgJ2dlbmVyYXRlZCB0aXRsZSBzaG91bGQgcmVwbGFjZSB0aGUgcHJvdmlzaW9uYWwgdGl0bGUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dGl0bGU6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8udGl0bGUsXG5cdFx0XHR0aXRsZXM6IHRpdGxlQWN0aW9ucyxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSxcblx0XHR9LCB7XG5cdFx0XHR0aXRsZTogJ0V4cGxhaW4gdGhlIGJ1aWxkJyxcblx0XHRcdHRpdGxlczogWydscyAtbGEnLCAnRXhwbGFpbiBob3cgdGhlIGJ1aWxkIHdvcmtzJywgJ0V4cGxhaW4gdGhlIGJ1aWxkJ10sXG5cdFx0XHRwZXJzaXN0ZWRUaXRsZTogJ0V4cGxhaW4gdGhlIGJ1aWxkJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZSBwZXJzaXN0cyBpdHMgZmFsbGJhY2sgd2hlbiByZXBsYWNpbmcgYSBwcm92aXNpb25hbCB0aXRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb3BpbG90QXBpU2VydmljZS5lcnJvciA9IG5ldyBFcnJvcignVGl0bGUgZ2VuZXJhdGlvbiB1bmF2YWlsYWJsZScpO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UpO1xuXG5cdFx0Y29udHJvbGxlci5zZWVkUHJvdmlzaW9uYWxUaXRsZShzZXNzaW9uLnRvU3RyaW5nKCksICdscyAtbGEnKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSAnbHMgLWxhJywgJ3Byb3Zpc2lvbmFsIHRpdGxlIHNob3VsZCBiZSBwZXJzaXN0ZWQnKTtcblx0XHRzdGF0ZU1hbmFnZXIuc2VlZERlZmF1bHRDaGF0VHVybnMoc2Vzc2lvbi50b1N0cmluZygpLCBbZmlyc3RUdXJuKCchbHMgLWxhJywgW10pXSk7XG5cdFx0Y29udHJvbGxlci5zZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlKHNlc3Npb24udG9TdHJpbmcoKSwgJ0V4cGxhaW4gaG93IHRoZSBidWlsZCB3b3JrcycpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09ICdFeHBsYWluIGhvdyB0aGUgYnVpbGQgd29ya3MnLCAnZmFsbGJhY2sgdGl0bGUgc2hvdWxkIHJlcGxhY2UgdGhlIHByb3Zpc2lvbmFsIHRpdGxlJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRpdGxlOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LnRpdGxlLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLFxuXHRcdH0sIHtcblx0XHRcdHRpdGxlOiAnRXhwbGFpbiBob3cgdGhlIGJ1aWxkIHdvcmtzJyxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiAnRXhwbGFpbiBob3cgdGhlIGJ1aWxkIHdvcmtzJyxcblx0XHR9KTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gdGV4dFBhcnQoY29udGVudDogc3RyaW5nKTogUmVzcG9uc2VQYXJ0IHtcblx0XHRyZXR1cm4geyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ20xJywgY29udGVudCB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVhc29uaW5nUGFydChjb250ZW50OiBzdHJpbmcpOiBSZXNwb25zZVBhcnQge1xuXHRcdHJldHVybiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nLCBpZDogJ3IxJywgY29udGVudCB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gdG9vbENhbGxQYXJ0KGRpc3BsYXlOYW1lOiBzdHJpbmcsIGludm9jYXRpb25NZXNzYWdlOiBzdHJpbmcpOiBSZXNwb25zZVBhcnQge1xuXHRcdGNvbnN0IHRvb2xDYWxsOiBUb29sQ2FsbENvbXBsZXRlZFN0YXRlID0ge1xuXHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMxJyxcblx0XHRcdHRvb2xOYW1lOiAndG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdkb25lJyxcblx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdH07XG5cdFx0cmV0dXJuIHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGwgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGZpcnN0VHVybih0ZXh0OiBzdHJpbmcsIHJlc3BvbnNlUGFydHM6IFJlc3BvbnNlUGFydFtdKTogVHVybiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiAndHVybi0xJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0cmVzcG9uc2VQYXJ0cyxcblx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBzZWVkRmlyc3RUaXRsZShjb250cm9sbGVyOiBBZ2VudEhvc3RTZXNzaW9uVGl0bGVDb250cm9sbGVyLCBjb3BpbG90QXBpU2VydmljZTogVGVzdENvcGlsb3RBcGlTZXJ2aWNlLCBkYjogVGVzdFNlc3Npb25EYXRhYmFzZSwgc2Vzc2lvbjogVVJJLCB1c2VyUHJvbXB0OiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb3BpbG90QXBpU2VydmljZS5yZXNwb25zZSA9IHRpdGxlO1xuXHRcdGNvbnRyb2xsZXIuc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShzZXNzaW9uLnRvU3RyaW5nKCksIHVzZXJQcm9tcHQpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09IHRpdGxlLCAnZmlyc3QgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXHR9XG5cblx0dGVzdCgncmVmaW5lVGl0bGVGcm9tRmlyc3RUdXJuIHJlZ2VuZXJhdGVzIHRoZSB0aXRsZSBmcm9tIHRoZSBmaXJzdC10dXJuIGNvbnRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzdGF0ZU1hbmFnZXIsIHNlc3Npb24sIGRiIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSk7XG5cdFx0YXdhaXQgc2VlZEZpcnN0VGl0bGUoY29udHJvbGxlciwgY29waWxvdEFwaVNlcnZpY2UsIGRiLCBzZXNzaW9uLCAnQWRkIGRhcmsgbW9kZSB0b2dnbGUnLCAnRmlyc3QgdGl0bGUnKTtcblxuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlID0gJ0RhcmsgbW9kZSBzZXR0aW5nJztcblx0XHRzdGF0ZU1hbmFnZXIuc2VlZERlZmF1bHRDaGF0VHVybnMoc2Vzc2lvbi50b1N0cmluZygpLCBbZmlyc3RUdXJuKCdBZGQgZGFyayBtb2RlIHRvZ2dsZScsIFt0ZXh0UGFydCgnSW1wbGVtZW50ZWQgdGhlIHRvZ2dsZSBpbiB0aGUgc2V0dGluZ3MgZWRpdG9yLicpXSldKTtcblx0XHRjb250cm9sbGVyLnJlZmluZVRpdGxlRnJvbUZpcnN0VHVybihzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oYXN5bmMgKCkgPT4gYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJykgPT09ICdEYXJrIG1vZGUgc2V0dGluZycsICdyZWZpbmVkIHRpdGxlIHNob3VsZCBiZSBwZXJzaXN0ZWQnKTtcblxuXHRcdGNvbnN0IGxhc3RDYWxsID0gY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzW2NvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGggLSAxXTtcblx0XHRjb25zdCB1c2VyTWVzc2FnZSA9IGxhc3RDYWxsLnJlcXVlc3QubWVzc2FnZXMuZmluZChtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ3VzZXInKT8uY29udGVudCA/PyAnJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRpdGxlOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LnRpdGxlLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLFxuXHRcdFx0bWVudGlvbnNDb252ZXJzYXRpb246IHVzZXJNZXNzYWdlLmluY2x1ZGVzKCdjb252ZXJzYXRpb24nKSxcblx0XHRcdGluY2x1ZGVzVXNlclJlcXVlc3Q6IHVzZXJNZXNzYWdlLmluY2x1ZGVzKCdBZGQgZGFyayBtb2RlIHRvZ2dsZScpLFxuXHRcdFx0aW5jbHVkZXNSZXNwb25zZTogdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ0ltcGxlbWVudGVkIHRoZSB0b2dnbGUgaW4gdGhlIHNldHRpbmdzIGVkaXRvci4nKSxcblx0XHR9LCB7XG5cdFx0XHR0aXRsZTogJ0RhcmsgbW9kZSBzZXR0aW5nJyxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiAnRGFyayBtb2RlIHNldHRpbmcnLFxuXHRcdFx0bWVudGlvbnNDb252ZXJzYXRpb246IHRydWUsXG5cdFx0XHRpbmNsdWRlc1VzZXJSZXF1ZXN0OiB0cnVlLFxuXHRcdFx0aW5jbHVkZXNSZXNwb25zZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVmaW5lVGl0bGVGcm9tRmlyc3RUdXJuIGRvZXMgbm90IGNsb2JiZXIgYSB0aXRsZSBjaGFuZ2VkIGluIHRoZSBtZWFudGltZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIHN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgZGIgfSA9IHNldHVwKGNvcGlsb3RBcGlTZXJ2aWNlKTtcblx0XHRhd2FpdCBzZWVkRmlyc3RUaXRsZShjb250cm9sbGVyLCBjb3BpbG90QXBpU2VydmljZSwgZGIsIHNlc3Npb24sICdBZGQgZGFyayBtb2RlIHRvZ2dsZScsICdGaXJzdCB0aXRsZScpO1xuXHRcdGNvbnN0IGNhbGxzQWZ0ZXJTZWVkID0gY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzLmxlbmd0aDtcblxuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ01hbnVhbCB0aXRsZScgfSk7XG5cdFx0c3RhdGVNYW5hZ2VyLnNlZWREZWZhdWx0Q2hhdFR1cm5zKHNlc3Npb24udG9TdHJpbmcoKSwgW2ZpcnN0VHVybignQWRkIGRhcmsgbW9kZSB0b2dnbGUnLCBbdGV4dFBhcnQoJ0ltcGxlbWVudGVkIHRoZSB0b2dnbGUuJyldKV0pO1xuXHRcdGNvbnRyb2xsZXIucmVmaW5lVGl0bGVGcm9tRmlyc3RUdXJuKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNhbGxzOiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHMubGVuZ3RoLFxuXHRcdFx0dGl0bGU6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8udGl0bGUsXG5cdFx0fSwge1xuXHRcdFx0Y2FsbHM6IGNhbGxzQWZ0ZXJTZWVkLFxuXHRcdFx0dGl0bGU6ICdNYW51YWwgdGl0bGUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZpbmVUaXRsZUZyb21GaXJzdFR1cm4gaWdub3JlcyB0b29sIGNhbGxzIGFuZCByZWFzb25pbmcsIGtlZXBpbmcgb25seSB0ZXh0IHBhcnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UpO1xuXHRcdGF3YWl0IHNlZWRGaXJzdFRpdGxlKGNvbnRyb2xsZXIsIGNvcGlsb3RBcGlTZXJ2aWNlLCBkYiwgc2Vzc2lvbiwgJ0FkZCBkYXJrIG1vZGUgdG9nZ2xlJywgJ0ZpcnN0IHRpdGxlJyk7XG5cblx0XHRjb3BpbG90QXBpU2VydmljZS5yZXNwb25zZSA9ICdSZWZpbmVkIHRpdGxlJztcblx0XHRzdGF0ZU1hbmFnZXIuc2VlZERlZmF1bHRDaGF0VHVybnMoc2Vzc2lvbi50b1N0cmluZygpLCBbZmlyc3RUdXJuKCdBZGQgZGFyayBtb2RlIHRvZ2dsZScsIFtcblx0XHRcdHJlYXNvbmluZ1BhcnQoJ1RoaW5raW5nIGFib3V0IFRISU5LSU5HX01BUktFUiB0aGUgYXBwcm9hY2gnKSxcblx0XHRcdHRvb2xDYWxsUGFydCgnU2VhcmNoVG9vbCcsICdzZWFyY2hlZCB0aGUgd29ya3NwYWNlIFRPT0xfTUFSS0VSJyksXG5cdFx0XHR0ZXh0UGFydCgnQWRkZWQgdGhlIHRvZ2dsZSBURVhUX01BUktFUiB0byBzZXR0aW5ncy4nKSxcblx0XHRdKV0pO1xuXHRcdGNvbnRyb2xsZXIucmVmaW5lVGl0bGVGcm9tRmlyc3RUdXJuKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbigoKSA9PiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHMubGVuZ3RoID49IDIsICdyZWZpbmUgc2hvdWxkIGlzc3VlIGEgdXRpbGl0eSBjYWxsJyk7XG5cblx0XHRjb25zdCBsYXN0Q2FsbCA9IGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxsc1tjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHMubGVuZ3RoIC0gMV07XG5cdFx0Y29uc3QgdXNlck1lc3NhZ2UgPSBsYXN0Q2FsbC5yZXF1ZXN0Lm1lc3NhZ2VzLmZpbmQobWVzc2FnZSA9PiBtZXNzYWdlLnJvbGUgPT09ICd1c2VyJyk/LmNvbnRlbnQgPz8gJyc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbmNsdWRlc1RleHQ6IHVzZXJNZXNzYWdlLmluY2x1ZGVzKCdURVhUX01BUktFUicpLFxuXHRcdFx0ZXhjbHVkZXNSZWFzb25pbmc6ICF1c2VyTWVzc2FnZS5pbmNsdWRlcygnVEhJTktJTkdfTUFSS0VSJyksXG5cdFx0XHRleGNsdWRlc1Rvb2xDYWxsOiAhdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ1RPT0xfTUFSS0VSJykgJiYgIXVzZXJNZXNzYWdlLmluY2x1ZGVzKCdTZWFyY2hUb29sJyksXG5cdFx0fSwge1xuXHRcdFx0aW5jbHVkZXNUZXh0OiB0cnVlLFxuXHRcdFx0ZXhjbHVkZXNSZWFzb25pbmc6IHRydWUsXG5cdFx0XHRleGNsdWRlc1Rvb2xDYWxsOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZpbmVUaXRsZUZyb21GaXJzdFR1cm4gdHJ1bmNhdGVzIHRoZSBtaWRkbGUgb2YgYW4gb3ZlcnNpemVkIHRleHQgcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBzdGF0ZU1hbmFnZXIsIHNlc3Npb24sIGRiIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSk7XG5cdFx0YXdhaXQgc2VlZEZpcnN0VGl0bGUoY29udHJvbGxlciwgY29waWxvdEFwaVNlcnZpY2UsIGRiLCBzZXNzaW9uLCAnQWRkIGRhcmsgbW9kZSB0b2dnbGUnLCAnRmlyc3QgdGl0bGUnKTtcblxuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlID0gJ1JlZmluZWQgdGl0bGUnO1xuXHRcdGNvbnN0IGh1Z2VSZXNwb25zZSA9ICdBJy5yZXBlYXQoMTUwMDApICsgJyBNSURETEVfTUFSS0VSICcgKyAnQicucmVwZWF0KDE1MDAwKTtcblx0XHRzdGF0ZU1hbmFnZXIuc2VlZERlZmF1bHRDaGF0VHVybnMoc2Vzc2lvbi50b1N0cmluZygpLCBbZmlyc3RUdXJuKCdBZGQgZGFyayBtb2RlIHRvZ2dsZScsIFt0ZXh0UGFydChodWdlUmVzcG9uc2UpXSldKTtcblx0XHRjb250cm9sbGVyLnJlZmluZVRpdGxlRnJvbUZpcnN0VHVybihzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oKCkgPT4gY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzLmxlbmd0aCA+PSAyLCAncmVmaW5lIHNob3VsZCBpc3N1ZSBhIHV0aWxpdHkgY2FsbCcpO1xuXG5cdFx0Y29uc3QgbGFzdENhbGwgPSBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHNbY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzLmxlbmd0aCAtIDFdO1xuXHRcdGNvbnN0IHVzZXJNZXNzYWdlID0gbGFzdENhbGwucmVxdWVzdC5tZXNzYWdlcy5maW5kKG1lc3NhZ2UgPT4gbWVzc2FnZS5yb2xlID09PSAndXNlcicpPy5jb250ZW50ID8/ICcnO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d2l0aGluQnVkZ2V0OiB1c2VyTWVzc2FnZS5sZW5ndGggPD0gMjAyMDAsXG5cdFx0XHRtaWRkbGVUcnVuY2F0ZWQ6IHVzZXJNZXNzYWdlLmluY2x1ZGVzKCcuLi4nKSAmJiAhdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ01JRERMRV9NQVJLRVInKSxcblx0XHRcdGluY2x1ZGVzVXNlclJlcXVlc3Q6IHVzZXJNZXNzYWdlLmluY2x1ZGVzKCdBZGQgZGFyayBtb2RlIHRvZ2dsZScpLFxuXHRcdFx0a2VlcHNIZWFkQW5kVGFpbDogdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ0FBQUEnKSAmJiB1c2VyTWVzc2FnZS5pbmNsdWRlcygnQkJCQicpLFxuXHRcdH0sIHtcblx0XHRcdHdpdGhpbkJ1ZGdldDogdHJ1ZSxcblx0XHRcdG1pZGRsZVRydW5jYXRlZDogdHJ1ZSxcblx0XHRcdGluY2x1ZGVzVXNlclJlcXVlc3Q6IHRydWUsXG5cdFx0XHRrZWVwc0hlYWRBbmRUYWlsOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiB0dXJuKGlkOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgcmVzcG9uc2VQYXJ0czogUmVzcG9uc2VQYXJ0W10pOiBUdXJuIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdHJlc3BvbnNlUGFydHMsXG5cdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnZ2VuZXJhdGVGb3JrZWRUaXRsZSByZXBsYWNlcyB0aGUgaW5oZXJpdGVkIHRpdGxlIHVzaW5nIHRoZSB3aG9sZSBmb3JrZWQgY29udmVyc2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlID0gJ0NvbXBhY3Rpb24gc3RyYXRlZ3knO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiwgdGl0bGVBY3Rpb25zIH0gPSBzZXR1cChjb3BpbG90QXBpU2VydmljZSwgJ0ZvcmtlZDogU291cmNlIHRpdGxlJyk7XG5cblx0XHRzdGF0ZU1hbmFnZXIuc2VlZERlZmF1bHRDaGF0VHVybnMoc2Vzc2lvbi50b1N0cmluZygpLCBbXG5cdFx0XHR0dXJuKCd0dXJuLTEnLCAnQWRkIGRhcmsgbW9kZSB0b2dnbGUnLCBbdGV4dFBhcnQoJ0ltcGxlbWVudGVkIHRoZSB0b2dnbGUgaW4gc2V0dGluZ3MuJyldKSxcblx0XHRcdHR1cm4oJ3R1cm4tMicsICdOb3cgY29tcGFjdCB0aGUgaGlzdG9yeScsIFt0ZXh0UGFydCgnU3VtbWFyaXplZCBlYXJsaWVyIHR1cm5zLicpXSksXG5cdFx0XSk7XG5cdFx0Y29uc3QgdHVybnMgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSkhLnR1cm5zO1xuXHRcdGNvbnRyb2xsZXIuZ2VuZXJhdGVGb3JrZWRUaXRsZShzZXNzaW9uLnRvU3RyaW5nKCksIHVuZGVmaW5lZCwgdHVybnMsICdGb3JrZWQ6IFNvdXJjZSB0aXRsZScsICdTb3VyY2UgdGl0bGUnKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSAnQ29tcGFjdGlvbiBzdHJhdGVneScsICdmb3JrZWQgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXG5cdFx0Y29uc3QgdXNlck1lc3NhZ2UgPSBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHNbMF0/LnJlcXVlc3QubWVzc2FnZXMuZmluZChtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ3VzZXInKT8uY29udGVudCA/PyAnJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRpdGxlczogdGl0bGVBY3Rpb25zLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLFxuXHRcdFx0bWVudGlvbnNDb252ZXJzYXRpb246IHVzZXJNZXNzYWdlLmluY2x1ZGVzKCdjb252ZXJzYXRpb24nKSxcblx0XHRcdGZyYW1lc0FzQnJhbmNoOiB1c2VyTWVzc2FnZS5pbmNsdWRlcygnYnJhbmNoZWQgZnJvbSBhbiBlYXJsaWVyIGNoYXQgdGl0bGVkIFwiU291cmNlIHRpdGxlXCInKSxcblx0XHRcdGluY2x1ZGVzRmlyc3RUdXJuOiB1c2VyTWVzc2FnZS5pbmNsdWRlcygnQWRkIGRhcmsgbW9kZSB0b2dnbGUnKSAmJiB1c2VyTWVzc2FnZS5pbmNsdWRlcygnSW1wbGVtZW50ZWQgdGhlIHRvZ2dsZSBpbiBzZXR0aW5ncy4nKSxcblx0XHRcdGluY2x1ZGVzU2Vjb25kVHVybjogdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ05vdyBjb21wYWN0IHRoZSBoaXN0b3J5JykgJiYgdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ1N1bW1hcml6ZWQgZWFybGllciB0dXJucy4nKSxcblx0XHR9LCB7XG5cdFx0XHR0aXRsZXM6IFsnQ29tcGFjdGlvbiBzdHJhdGVneSddLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6ICdDb21wYWN0aW9uIHN0cmF0ZWd5Jyxcblx0XHRcdG1lbnRpb25zQ29udmVyc2F0aW9uOiB0cnVlLFxuXHRcdFx0ZnJhbWVzQXNCcmFuY2g6IHRydWUsXG5cdFx0XHRpbmNsdWRlc0ZpcnN0VHVybjogdHJ1ZSxcblx0XHRcdGluY2x1ZGVzU2Vjb25kVHVybjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2VuZXJhdGVGb3JrZWRUaXRsZSBkb2VzIG5vdCBjbG9iYmVyIGEgdGl0bGUgY2hhbmdlZCBkdXJpbmcgZ2VuZXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRsZXQgcmVzb2x2ZVRpdGxlITogKHRpdGxlOiBzdHJpbmcpID0+IHZvaWQ7XG5cdFx0Y29waWxvdEFwaVNlcnZpY2UucmVzcG9uc2VQcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7IHJlc29sdmVUaXRsZSA9IHJlc29sdmU7IH0pO1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBkYiB9ID0gc2V0dXAoY29waWxvdEFwaVNlcnZpY2UsICdGb3JrZWQ6IFNvdXJjZSB0aXRsZScpO1xuXG5cdFx0c3RhdGVNYW5hZ2VyLnNlZWREZWZhdWx0Q2hhdFR1cm5zKHNlc3Npb24udG9TdHJpbmcoKSwgW3R1cm4oJ3R1cm4tMScsICdBZGQgZGFyayBtb2RlIHRvZ2dsZScsIFt0ZXh0UGFydCgnRG9uZS4nKV0pXSk7XG5cdFx0Y29udHJvbGxlci5nZW5lcmF0ZUZvcmtlZFRpdGxlKHNlc3Npb24udG9TdHJpbmcoKSwgdW5kZWZpbmVkLCBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSkhLnR1cm5zLCAnRm9ya2VkOiBTb3VyY2UgdGl0bGUnKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKCgpID0+IGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGggPT09IDEsICdmb3JrZWQgdGl0bGUgZ2VuZXJhdGlvbiBzaG91bGQgc3RhcnQnKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbi50b1N0cmluZygpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGU6ICdNYW51YWwgdGl0bGUnIH0pO1xuXHRcdHJlc29sdmVUaXRsZSgnR2VuZXJhdGVkIHRpdGxlJyk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRpdGxlOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LnRpdGxlLFxuXHRcdFx0cGVyc2lzdGVkVGl0bGU6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLFxuXHRcdH0sIHtcblx0XHRcdHRpdGxlOiAnTWFudWFsIHRpdGxlJyxcblx0XHRcdHBlcnNpc3RlZFRpdGxlOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFHbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsYUFBYSxrQkFBa0IsZUFBZSw0QkFBNEIsZ0JBQWdCLGlCQUFpRztBQUVwTSxTQUFTLDBCQUEwQiwyQkFBMkI7QUFFOUQsTUFBTSxzQkFBb0Q7QUFBQSxFQUExRDtBQUdDLFNBQVMsZUFBK0gsQ0FBQztBQUN6SSxvQkFBVztBQUFBO0FBQUEsRUFNWCxXQUFzRjtBQUNyRixVQUFNLElBQUksTUFBTSxVQUFVO0FBQUEsRUFDM0I7QUFBQSxFQUNBLE1BQU0sY0FBcUQ7QUFBRSxVQUFNLElBQUksTUFBTSxVQUFVO0FBQUEsRUFBRztBQUFBLEVBQzFGLE1BQU0sU0FBOEI7QUFBRSxXQUFPLENBQUM7QUFBQSxFQUFHO0FBQUEsRUFDakQsTUFBTSxZQUErQjtBQUFFLFVBQU0sSUFBSSxNQUFNLFVBQVU7QUFBQSxFQUFHO0FBQUEsRUFDcEUsTUFBTSxvQ0FBb0M7QUFBRSxXQUFPLEVBQUUsNEJBQTRCLE9BQU8sWUFBWSxRQUFXLG1CQUFtQixPQUFVO0FBQUEsRUFBRztBQUFBLEVBQy9JLE1BQU0scUJBQXFCO0FBQUUsV0FBTztBQUFBLEVBQVc7QUFBQSxFQUMvQyxNQUFNLHNCQUFzQixhQUFxQixT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
