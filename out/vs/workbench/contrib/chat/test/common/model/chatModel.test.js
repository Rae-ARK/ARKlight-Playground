import assert from "assert";
import * as sinon from "sinon";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { URI } from "../../../../../../base/common/uri.js";
import { assertSnapshot } from "../../../../../../base/test/common/snapshot.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { OffsetRange } from "../../../../../../editor/common/core/ranges/offsetRange.js";
import { SymbolKind } from "../../../../../../editor/common/languages.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { MockContextKeyService } from "../../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { IExtensionService } from "../../../../../services/extensions/common/extensions.js";
import { TestExtensionService, TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { CellUri } from "../../../../notebook/common/notebookCommon.js";
import { ChatAgentService, IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ChatModel, ChatResponseResource, isExportableSessionData, isSerializableSessionData, normalizeSerializableChatData, Response, serializeSendOptions, toChatHistoryContent } from "../../../common/model/chatModel.js";
import { ChatToolInvocation } from "../../../common/model/chatProgressTypes/chatToolInvocation.js";
import { ChatRequestTextPart } from "../../../common/requestParser/chatParserTypes.js";
import { ChatRequestQueueKind, IChatService, IChatToolInvocation, ResponseModelState } from "../../../common/chatService/chatService.js";
import { ToolDataSource } from "../../../common/tools/languageModelToolsService.js";
import { ChatAgentLocation, ChatModeKind } from "../../../common/constants.js";
import { MockChatService } from "../chatService/mockChatService.js";
suite("ChatModel", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  setup(async () => {
    instantiationService = testDisposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IExtensionService, new TestExtensionService());
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IChatService, new MockChatService());
  });
  test("initialization with exported data only (imported)", async () => {
    const exportedData = {
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: "bot"
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: exportedData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.strictEqual(model.isImported, true);
    assert.ok(model.sessionId);
    assert.ok(model.timestamp > 0);
  });
  test("initialization with full serializable data (not imported)", async () => {
    const now = Date.now();
    const serializableData = {
      version: 3,
      sessionId: "existing-session",
      creationDate: now - 1e3,
      customTitle: "My Chat",
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: "bot"
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: serializableData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.strictEqual(model.isImported, false);
    assert.strictEqual(model.sessionId, "existing-session");
    assert.strictEqual(model.timestamp, now - 1e3);
    assert.strictEqual(model.customTitle, "My Chat");
  });
  test("legacy requests without timestamps keep display time unknown", () => {
    const creationDate = 1752012321e3;
    const serializableData = {
      version: 3,
      sessionId: "legacy-session",
      creationDate,
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: [{
        requestId: "req1",
        message: { text: "hello", parts: [] },
        variableData: { variables: [] },
        response: void 0
      }],
      responderUsername: "bot"
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: serializableData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.deepStrictEqual({
      recencyTimestamp: model.getRequests()[0].timestamp,
      requestTimestamp: model.getRequests()[0].requestTimestamp,
      serializedTimestamp: model.toJSON().requests[0].timestamp
    }, {
      recencyTimestamp: creationDate,
      requestTimestamp: void 0,
      serializedTimestamp: void 0
    });
  });
  test("initialization with invalid data", async () => {
    const invalidData = {
      // Missing required fields
      requests: "not-an-array"
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: invalidData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.strictEqual(model.getRequests().length, 0);
    assert.ok(model.sessionId);
  });
  test("initialization without data", async () => {
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      void 0,
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.strictEqual(model.isImported, false);
    assert.strictEqual(model.getRequests().length, 0);
    assert.ok(model.sessionId);
    assert.ok(model.timestamp > 0);
  });
  test("removeRequest", async () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    const requests = model.getRequests();
    assert.strictEqual(requests.length, 1);
    model.removeRequest(requests[0].id);
    assert.strictEqual(model.getRequests().length, 0);
  });
  test("adoptRequest", async function() {
    const model1 = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.EditorInline, canUseTools: true }));
    const model2 = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request1 = model1.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    assert.strictEqual(model1.getRequests().length, 1);
    assert.strictEqual(model2.getRequests().length, 0);
    assert.ok(request1.session === model1);
    assert.ok(request1.response?.session === model1);
    model2.adoptRequest(request1);
    assert.strictEqual(model1.getRequests().length, 0);
    assert.strictEqual(model2.getRequests().length, 1);
    assert.ok(request1.session === model2);
    assert.ok(request1.response?.session === model2);
    model2.acceptResponseProgress(request1, { content: new MarkdownString("Hello"), kind: "markdownContent" });
    assert.strictEqual(request1.response.response.toString(), "Hello");
  });
  test("acceptResponseProgress applies usage to response metadata", async function() {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    model.acceptResponseProgress(request, { kind: "usage", promptTokens: 10, completionTokens: 2 });
    model.acceptResponseProgress(request, { kind: "usage", promptTokens: 10, completionTokens: 2 });
    model.acceptResponseProgress(request, { kind: "usage", promptTokens: 10, completionTokens: 3 });
    assert.deepStrictEqual({
      usage: request.response?.usage,
      completionTokenCount: request.response?.completionTokenCount,
      responseContent: request.response?.response.toString()
    }, {
      usage: { kind: "usage", promptTokens: 10, completionTokens: 3 },
      completionTokenCount: 5,
      responseContent: ""
    });
  });
  test("voice progress is live-only response metadata", () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("Before ") });
    model.acceptResponseProgress(request, { kind: "voiceProgress", id: "investigating", value: "Investigating the relevant code." });
    model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("after") });
    const response = request.response.response;
    assert.deepStrictEqual({
      responseKinds: response.value.map((part) => part.kind),
      historyKinds: toChatHistoryContent(response.value).map((part) => part.kind),
      markdown: response.getMarkdown(),
      copyText: response.toString(),
      persistedKinds: model.toExport().requests[0].response?.map((part) => hasKey(part, { kind: true }) ? part.kind : "markdown")
    }, {
      responseKinds: ["markdownContent", "voiceProgress", "markdownContent"],
      historyKinds: ["markdownContent", "markdownContent"],
      markdown: "Before after",
      copyText: "Before after",
      persistedKinds: ["markdown", "markdown"]
    });
  });
  test("a refinement of the same model call updates usage without recounting its tokens", () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    model.acceptResponseProgress(request, { kind: "usage", promptTokens: 10, completionTokens: 2, copilotCredits: 1, sessionCopilotCredits: 1 });
    model.acceptResponseProgress(request, { kind: "usage", promptTokens: 10, completionTokens: 2, copilotCredits: 1, sessionCopilotCredits: 5 });
    assert.deepStrictEqual({
      sessionCopilotCredits: request.response?.usage?.sessionCopilotCredits,
      completionTokenCount: request.response?.completionTokenCount
    }, {
      sessionCopilotCredits: 5,
      completionTokenCount: 2
    });
  });
  test("subagent credits are folded into parent response usage", () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    request.response?.setSubagentCopilotCredits("subagent-1", 5);
    model.acceptResponseProgress(request, { kind: "usage", promptTokens: 10, completionTokens: 2, copilotCredits: 2 });
    request.response?.setSubagentCopilotCredits("subagent-1", 6);
    request.response?.setSubagentCopilotCredits("subagent-1", 4);
    request.response?.setSubagentCopilotCredits("subagent-2", 3);
    request.response?.setSubagentCopilotCredits("invalid", Number.NaN);
    request.response?.setSubagentCopilotCredits("invalid", -1);
    assert.deepStrictEqual({ usage: request.response?.usage, completionTokenCount: request.response?.completionTokenCount, sessionCost: model.sessionCost }, {
      usage: { kind: "usage", promptTokens: 10, completionTokens: 2, copilotCredits: 11 },
      completionTokenCount: 2,
      sessionCost: 11
    });
    const restoredSeparateCosts = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: JSON.parse(JSON.stringify(model.toJSON())), serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.strictEqual(restoredSeparateCosts.sessionCost, 11);
  });
  test("the session total and the summed turns each provide a floor for session cost", () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const addRequest = (text) => model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    const first = addRequest("one");
    model.acceptResponseProgress(first, { kind: "usage", promptTokens: 10, completionTokens: 2, copilotCredits: 2 });
    const second = addRequest("two");
    model.acceptResponseProgress(second, { kind: "usage", promptTokens: 10, completionTokens: 2, copilotCredits: 3, sessionCopilotCredits: 9 });
    assert.strictEqual(model.sessionCost, 9);
    const restored = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: JSON.parse(JSON.stringify(model.toJSON())), serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.strictEqual(restored.sessionCost, 9);
    const third = addRequest("three");
    model.acceptResponseProgress(third, { kind: "usage", promptTokens: 10, completionTokens: 2, copilotCredits: 6 });
    assert.strictEqual(model.sessionCost, 11);
  });
  test("response details, elapsed time, and tokens roundtrip through serialization", () => {
    const completedAt = 1752012405e3;
    const serializableData = {
      version: 3,
      sessionId: "test-session",
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: [{
        requestId: "req1",
        message: { text: "hello", parts: [] },
        variableData: { variables: [] },
        timestamp: 1752012321e3,
        response: [{ value: "response", isTrusted: false }],
        result: { details: "GPT-5.6 Sol" },
        modelState: { value: ResponseModelState.Complete, completedAt },
        responseTimestamp: 1752012322e3,
        elapsedMs: 83e3,
        completionTokens: 1234
      }],
      responderUsername: "bot"
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: serializableData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    const response = model.getRequests()[0].response;
    const serializedResponse = model.toJSON().requests[0];
    assert.deepStrictEqual({
      details: response?.result?.details,
      requestTimestamp: model.getRequests()[0].timestamp,
      visibleRequestTimestamp: model.getRequests()[0].requestTimestamp,
      responseTimestamp: response?.timestamp,
      completionTimestamp: response?.completionTimestamp,
      elapsedMs: response?.elapsedMs,
      completionTokens: response?.completionTokenCount,
      serializedDetails: serializedResponse.result?.details,
      serializedRequestTimestamp: serializedResponse.timestamp,
      serializedResponseTimestamp: serializedResponse.responseTimestamp,
      serializedElapsedMs: serializedResponse.elapsedMs,
      serializedCompletionTokens: serializedResponse.completionTokens
    }, {
      details: "GPT-5.6 Sol",
      requestTimestamp: 1752012321e3,
      visibleRequestTimestamp: 1752012321e3,
      responseTimestamp: 1752012322e3,
      completionTimestamp: completedAt,
      elapsedMs: 83e3,
      completionTokens: 1234,
      serializedDetails: "GPT-5.6 Sol",
      serializedRequestTimestamp: 1752012321e3,
      serializedResponseTimestamp: 1752012322e3,
      serializedElapsedMs: 83e3,
      serializedCompletionTokens: 1234
    });
  });
  test("persists reasoning duration when response progress moves on", () => {
    const clock = sinon.useFakeTimers({ now: 1e3 });
    try {
      const response = testDisposables.add(new Response([]));
      response.updateContent({ kind: "thinking", value: ["First", " thought"] });
      clock.tick(1500);
      response.updateContent({ kind: "markdownContent", content: new MarkdownString("Done") });
      assert.deepStrictEqual(response.value.map((part) => part.kind === "thinking" ? {
        kind: part.kind,
        value: part.value,
        reasoningDurationMs: part.reasoningDurationMs
      } : { kind: part.kind }), [
        { kind: "thinking", value: ["First", " thought"], reasoningDurationMs: 1500 },
        { kind: "markdownContent" }
      ]);
    } finally {
      clock.restore();
    }
  });
  test("persists reasoning duration when response completes without a rendered row", () => {
    const clock = sinon.useFakeTimers({ now: 1e3 });
    try {
      const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
      const text = "hello";
      const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
      model.acceptResponseProgress(request, { kind: "thinking", value: "Still reasoning" });
      clock.tick(2300);
      request.response?.complete();
      const thinkingPart = request.response?.entireResponse.value.find((part) => part.kind === "thinking");
      assert.strictEqual(thinkingPart?.kind === "thinking" ? thinkingPart.reasoningDurationMs : void 0, 2300);
    } finally {
      clock.restore();
    }
  });
  test("addCompleteRequest", async function() {
    const model1 = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request1 = model1.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0, void 0, void 0, void 0, void 0, void 0, void 0, true);
    assert.strictEqual(request1.isCompleteAddedRequest, true);
    assert.strictEqual(request1.response.isCompleteAddedRequest, true);
    assert.strictEqual(request1.shouldBeRemovedOnSend, void 0);
    assert.strictEqual(request1.response.shouldBeRemovedOnSend, void 0);
  });
  test("deserialization marks unused question carousels as used", async () => {
    const serializableData = {
      version: 3,
      sessionId: "test-session",
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: [{
        requestId: "req1",
        message: { text: "hello", parts: [] },
        variableData: { variables: [] },
        response: [
          { value: "some text", isTrusted: false },
          {
            kind: "questionCarousel",
            questions: [{ id: "q1", title: "Question 1", type: "text" }],
            allowSkip: true,
            resolveId: "resolve1",
            isUsed: false
          }
        ],
        modelState: { value: 2, completedAt: Date.now() }
      }],
      responderUsername: "bot"
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: serializableData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    const requests = model.getRequests();
    assert.strictEqual(requests.length, 1);
    const response = requests[0].response;
    const carouselPart = response.response.value.find((p) => p.kind === "questionCarousel");
    assert.ok(carouselPart);
    assert.strictEqual(carouselPart.isUsed, true);
    assert.strictEqual(response.isComplete, true);
  });
  test("inputModel.toJSON filters extension-contributed contexts", async function() {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const fileAttachment = {
      kind: "file",
      value: URI.parse("file:///test.ts"),
      id: "file-id",
      name: "test.ts"
    };
    const stringContextValue = {
      value: "pr-content",
      name: "PR #123",
      iconPath: Codicon.gitPullRequest,
      uri: URI.parse("pr://123"),
      handle: 1
    };
    const stringAttachment = {
      kind: "string",
      value: "pr-content",
      id: "string-id",
      name: "PR #123",
      iconPath: Codicon.gitPullRequest,
      uri: URI.parse("pr://123"),
      handle: 1
    };
    const implicitWithStringContext = {
      kind: "implicit",
      isFile: true,
      value: stringContextValue,
      uri: URI.parse("pr://123"),
      isSelection: false,
      enabled: true,
      id: "implicit-string-id",
      name: "PR Context"
    };
    const implicitWithUri = {
      kind: "implicit",
      isFile: true,
      value: URI.parse("file:///current.ts"),
      uri: URI.parse("file:///current.ts"),
      isSelection: false,
      enabled: true,
      id: "implicit-uri-id",
      name: "current.ts"
    };
    model.inputModel.setState({
      attachments: [fileAttachment, stringAttachment, implicitWithStringContext, implicitWithUri],
      inputText: "test"
    });
    const serialized = model.inputModel.toJSON();
    assert.ok(serialized);
    assert.deepStrictEqual(serialized.attachments, [fileAttachment, implicitWithUri]);
  });
  test("modeInfo roundtrips through serialization", async () => {
    const modeInfo = {
      kind: ChatModeKind.Agent,
      isBuiltin: false,
      telemetryModeId: "custom",
      modeInstructions: {
        name: "plan",
        content: "You are a planning agent",
        toolReferences: []
      },
      applyCodeBlockSuggestionId: void 0
    };
    const serializableData = {
      version: 3,
      sessionId: "test-modeinfo-session",
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      responderUsername: "bot",
      requests: [{
        requestId: "req1",
        message: { text: "plan something", parts: [] },
        variableData: { variables: [] },
        response: [{ value: "Here is my plan", isTrusted: false }],
        modelState: { value: 1, completedAt: Date.now() },
        modeInfo
      }]
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: serializableData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    const requests = model.getRequests();
    assert.strictEqual(requests.length, 1);
    assert.deepStrictEqual(requests[0].modeInfo, modeInfo);
    const exported = model.toExport();
    assert.strictEqual(exported.requests.length, 1);
    assert.deepStrictEqual(exported.requests[0].modeInfo, modeInfo);
  });
  test("restores legacy top-level modelConfiguration into selectedModel (backwards compat)", async () => {
    const legacyConfig = { thinkingEffort: "high", contextSize: 2e3 };
    const legacyInputState = {
      attachments: [],
      contrib: {},
      inputText: "draft",
      selections: [],
      mode: { id: ChatModeKind.Agent, kind: ChatModeKind.Agent },
      selectedModel: { identifier: "copilot/gpt", metadata: { name: "GPT" } },
      modelConfiguration: legacyConfig
    };
    const serializableData = {
      version: 3,
      sessionId: "legacy-model-config-session",
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      responderUsername: "bot",
      requests: [],
      inputState: legacyInputState
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: serializableData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.deepStrictEqual(model.inputModel.state.get()?.modelConfiguration, legacyConfig);
    const serialized = model.inputModel.toJSON();
    assert.deepStrictEqual(serialized?.selectedModel?.modelConfiguration, legacyConfig);
    assert.strictEqual(serialized.modelConfiguration, void 0);
  });
});
suite("Response", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("mergeable markdown", async () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("markdown1"), kind: "markdownContent" });
    response.updateContent({ content: new MarkdownString("markdown2"), kind: "markdownContent" });
    await assertSnapshot(response.value);
    assert.strictEqual(response.toString(), "markdown1markdown2");
  });
  test("not mergeable markdown", async () => {
    const response = store.add(new Response([]));
    const md1 = new MarkdownString("markdown1");
    md1.supportHtml = true;
    response.updateContent({ content: md1, kind: "markdownContent" });
    response.updateContent({ content: new MarkdownString("markdown2"), kind: "markdownContent" });
    await assertSnapshot(response.value);
  });
  test("system notification remains distinct from later response content", () => {
    const response = store.add(new Response([]));
    response.updateContent({ kind: "systemNotification", content: new MarkdownString("Background command completed") });
    response.updateContent({ kind: "markdownContent", content: new MarkdownString("Finished processing output.") });
    assert.deepStrictEqual({
      kinds: response.value.map((part) => part.kind),
      text: response.toString()
    }, {
      kinds: ["systemNotification", "markdownContent"],
      text: "Background command completed\n\nFinished processing output."
    });
  });
  test("inline reference", async () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("text before "), kind: "markdownContent" });
    response.updateContent({ inlineReference: URI.parse("https://microsoft.com/"), kind: "inlineReference" });
    response.updateContent({ content: new MarkdownString(" text after"), kind: "markdownContent" });
    await assertSnapshot(response.value);
    assert.strictEqual(response.toString(), "text before https://microsoft.com/ text after");
  });
  test("resolve inline reference updates existing response content", () => {
    const uri = URI.parse("file:///workspace/foo.ts");
    const response = store.add(new Response([]));
    response.updateContent({
      kind: "inlineReference",
      resolveId: "resolve1",
      inlineReference: { uri, range: new Range(1, 1, 1, 1) },
      name: "Foo"
    });
    let changes = 0;
    store.add(response.onDidChangeValue(() => changes++));
    const didResolve = response.resolveInlineReference("resolve1", {
      kind: "inlineReference",
      inlineReference: {
        name: "Foo",
        kind: SymbolKind.Class,
        location: { uri, range: new Range(2, 7, 2, 10) }
      }
    });
    const resolved = response.value[0];
    const resolvedReference = resolved.kind === "inlineReference" ? resolved.inlineReference : void 0;
    assert.deepStrictEqual({
      didResolve,
      changes,
      responseText: response.toString(),
      resolvedReference
    }, {
      didResolve: true,
      changes: 1,
      responseText: "`Foo`",
      resolvedReference: {
        name: "Foo",
        kind: SymbolKind.Class,
        location: { uri, range: new Range(2, 7, 2, 10) }
      }
    });
  });
  test("resolve inline reference updates display name when provided", () => {
    const uri = URI.parse("file:///workspace/foo.ts");
    const response = store.add(new Response([]));
    response.updateContent({
      kind: "inlineReference",
      resolveId: "resolve1",
      inlineReference: { uri, range: new Range(1, 1, 1, 1) },
      name: "Foo"
    });
    const didResolve = response.resolveInlineReference("resolve1", {
      kind: "inlineReference",
      inlineReference: {
        name: "Foo",
        kind: SymbolKind.Class,
        location: { uri, range: new Range(2, 7, 2, 10) }
      },
      name: "Resolved Foo"
    });
    const resolved = response.value[0];
    assert.deepStrictEqual({
      didResolve,
      displayName: resolved.kind === "inlineReference" ? resolved.name : void 0,
      responseText: response.toString()
    }, {
      didResolve: true,
      displayName: "Resolved Foo",
      responseText: "`Foo`"
    });
  });
  test("resolve inline reference returns false for an unknown resolve id", () => {
    const uri = URI.parse("file:///workspace/foo.ts");
    const response = store.add(new Response([]));
    response.updateContent({
      kind: "inlineReference",
      resolveId: "resolve1",
      inlineReference: { uri, range: new Range(1, 1, 1, 1) },
      name: "Foo"
    });
    let changes = 0;
    store.add(response.onDidChangeValue(() => changes++));
    const didResolve = response.resolveInlineReference("missing", {
      kind: "inlineReference",
      inlineReference: {
        name: "Foo",
        kind: SymbolKind.Class,
        location: { uri, range: new Range(2, 7, 2, 10) }
      }
    });
    assert.deepStrictEqual({
      didResolve,
      changes,
      responseText: response.toString()
    }, {
      didResolve: false,
      changes: 0,
      responseText: "foo.ts"
    });
  });
  test("consolidated edit summary", () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("Some content before edits"), kind: "markdownContent" });
    response.updateContent({ kind: "textEditGroup", uri: URI.parse("file:///file1.ts"), edits: [], state: void 0, done: true });
    response.updateContent({ kind: "textEditGroup", uri: URI.parse("file:///file2.ts"), edits: [], state: void 0, done: true });
    response.updateContent({ content: new MarkdownString("Some content after edits"), kind: "markdownContent" });
    const responseString = response.toString();
    const madeChangesCount = (responseString.match(/Made changes\./g) || []).length;
    assert.strictEqual(madeChangesCount, 1, 'Should have exactly one "Made changes." message');
    assert.ok(responseString.includes("Some content before edits"), "Should include content before edits");
    assert.ok(responseString.includes("Some content after edits"), "Should include content after edits");
    assert.ok(responseString.endsWith("Made changes."), 'Should end with "Made changes."');
  });
  test("no edit summary when no edits", () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("Some content"), kind: "markdownContent" });
    response.updateContent({ content: new MarkdownString("More content"), kind: "markdownContent" });
    const responseString = response.toString();
    assert.ok(!responseString.includes("Made changes."), 'Should not include "Made changes." when no edits present');
    assert.strictEqual(responseString, "Some contentMore content");
  });
  test("consolidated edit summary with clear operation", () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("Initial content"), kind: "markdownContent" });
    response.updateContent({ kind: "textEditGroup", uri: URI.parse("file:///file1.ts"), edits: [], state: void 0, done: true });
    response.updateContent({ kind: "clearToPreviousToolInvocation", reason: 1 });
    response.updateContent({ content: new MarkdownString("Content after clear"), kind: "markdownContent" });
    response.updateContent({ kind: "textEditGroup", uri: URI.parse("file:///file2.ts"), edits: [], state: void 0, done: true });
    const responseString = response.toString();
    const madeChangesCount = (responseString.match(/Made changes\./g) || []).length;
    assert.strictEqual(madeChangesCount, 1, 'Should have exactly one "Made changes." message after clear');
    assert.ok(responseString.includes("Content after clear"), "Should include content after clear");
    assert.ok(!responseString.includes("Initial content"), "Should not include content before clear");
    assert.ok(responseString.endsWith("Made changes."), 'Should end with "Made changes."');
  });
  test("textEdit merges edits for same URI when not done", () => {
    const response = store.add(new Response([]));
    const uri = URI.parse("file:///file1.ts");
    response.updateContent({
      kind: "textEdit",
      uri,
      edits: [{ range: new Range(1, 1, 1, 1), text: "edit1" }],
      done: false,
      isExternalEdit: true
    });
    response.updateContent({
      kind: "textEdit",
      uri,
      edits: [{ range: new Range(2, 1, 2, 1), text: "edit2" }],
      done: true
    });
    const textEditGroups = response.value.filter((p) => p.kind === "textEditGroup");
    assert.strictEqual(textEditGroups.length, 1, "Should have exactly one textEditGroup");
    assert.strictEqual(textEditGroups[0].edits.length, 2, "Should have two edit batches merged");
    assert.strictEqual(textEditGroups[0].done, true, "Should be marked as done after final edit");
    assert.strictEqual(textEditGroups[0].isExternalEdit, true, "Should preserve isExternalEdit flag from first edit");
  });
  test("textEdit does not merge edits when previous is done", () => {
    const response = store.add(new Response([]));
    const uri = URI.parse("file:///file1.ts");
    response.updateContent({
      kind: "textEdit",
      uri,
      edits: [{ range: new Range(1, 1, 1, 1), text: "edit1" }],
      done: true
    });
    response.updateContent({
      kind: "textEdit",
      uri,
      edits: [{ range: new Range(2, 1, 2, 1), text: "edit2" }],
      done: true
    });
    const textEditGroups = response.value.filter((p) => p.kind === "textEditGroup");
    assert.strictEqual(textEditGroups.length, 2, "Should have two separate textEditGroups");
  });
  test("textEdit does not merge edits for different URIs", () => {
    const response = store.add(new Response([]));
    response.updateContent({
      kind: "textEdit",
      uri: URI.parse("file:///file1.ts"),
      edits: [{ range: new Range(1, 1, 1, 1), text: "edit1" }],
      done: false
    });
    response.updateContent({
      kind: "textEdit",
      uri: URI.parse("file:///file2.ts"),
      edits: [{ range: new Range(1, 1, 1, 1), text: "edit2" }],
      done: true
    });
    const textEditGroups = response.value.filter((p) => p.kind === "textEditGroup");
    assert.strictEqual(textEditGroups.length, 2, "Should have two separate textEditGroups for different URIs");
  });
  test("notebookEdit merges edits for same notebook URI when not done", () => {
    const response = store.add(new Response([]));
    const notebookUri = URI.parse("file:///notebook.ipynb");
    response.updateContent({
      kind: "notebookEdit",
      uri: notebookUri,
      edits: [{ editType: 1, index: 0, count: 0, cells: [] }],
      done: false,
      isExternalEdit: true
    });
    response.updateContent({
      kind: "notebookEdit",
      uri: notebookUri,
      edits: [{ editType: 1, index: 1, count: 0, cells: [] }],
      done: true
    });
    const notebookEditGroups = response.value.filter((p) => p.kind === "notebookEditGroup");
    assert.strictEqual(notebookEditGroups.length, 1, "Should have exactly one notebookEditGroup");
    assert.strictEqual(notebookEditGroups[0].edits.length, 2, "Should have two edit batches merged");
    assert.strictEqual(notebookEditGroups[0].done, true, "Should be marked as done after final edit");
    assert.strictEqual(notebookEditGroups[0].isExternalEdit, true, "Should preserve isExternalEdit flag from first edit");
  });
  test("notebookEdit does not merge edits when previous is done", () => {
    const response = store.add(new Response([]));
    const notebookUri = URI.parse("file:///notebook.ipynb");
    response.updateContent({
      kind: "notebookEdit",
      uri: notebookUri,
      edits: [{ editType: 1, index: 0, count: 0, cells: [] }],
      done: true
    });
    response.updateContent({
      kind: "notebookEdit",
      uri: notebookUri,
      edits: [{ editType: 1, index: 1, count: 0, cells: [] }],
      done: true
    });
    const notebookEditGroups = response.value.filter((p) => p.kind === "notebookEditGroup");
    assert.strictEqual(notebookEditGroups.length, 2, "Should have two separate notebookEditGroups");
  });
  test("notebookEdit does not merge edits for different notebook URIs", () => {
    const response = store.add(new Response([]));
    response.updateContent({
      kind: "notebookEdit",
      uri: URI.parse("file:///notebook1.ipynb"),
      edits: [{ editType: 1, index: 0, count: 0, cells: [] }],
      done: false
    });
    response.updateContent({
      kind: "notebookEdit",
      uri: URI.parse("file:///notebook2.ipynb"),
      edits: [{ editType: 1, index: 0, count: 0, cells: [] }],
      done: true
    });
    const notebookEditGroups = response.value.filter((p) => p.kind === "notebookEditGroup");
    assert.strictEqual(notebookEditGroups.length, 2, "Should have two separate notebookEditGroups for different URIs");
  });
  test("textEdit to notebook cell creates notebookEditGroup", () => {
    const response = store.add(new Response([]));
    const notebookUri = URI.parse("file:///notebook.ipynb");
    const cellUri = CellUri.generate(notebookUri, 1);
    response.updateContent({
      kind: "textEdit",
      uri: cellUri,
      edits: [{ range: new Range(1, 1, 1, 1), text: "edit1" }],
      done: true
    });
    const textEditGroups = response.value.filter((p) => p.kind === "textEditGroup");
    const notebookEditGroups = response.value.filter((p) => p.kind === "notebookEditGroup");
    assert.strictEqual(textEditGroups.length, 0, "Should not have textEditGroup for cell edits");
    assert.strictEqual(notebookEditGroups.length, 1, "Should have notebookEditGroup for cell edits");
  });
  test("external terminal tool updates preserve toolSpecificData when completing an existing invocation", () => {
    const response = store.add(new Response([]));
    const toolSpecificData = {
      kind: "terminal",
      language: "bash",
      commandLine: { original: "npm test" },
      terminalCommandOutput: { text: "all green" },
      terminalCommandState: { exitCode: 0 }
    };
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-call-1",
      toolName: "run_in_terminal",
      isComplete: false,
      invocationMessage: "Running npm test"
    });
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-call-1",
      toolName: "run_in_terminal",
      isComplete: true,
      pastTenseMessage: "Ran npm test",
      toolSpecificData
    });
    assert.strictEqual(response.value.length, 1);
    assert.strictEqual(response.value[0].kind, "toolInvocation");
    assert.deepStrictEqual(response.value[0].toolSpecificData, toolSpecificData);
    assert.strictEqual(IChatToolInvocation.isComplete(response.value[0]), true);
  });
  test("external terminal tool updates preserve toolSpecificData when first pushed as complete", () => {
    const response = store.add(new Response([]));
    const toolSpecificData = {
      kind: "terminal",
      language: "bash",
      commandLine: { original: "npm test" },
      terminalCommandOutput: { text: "all green" },
      terminalCommandState: { exitCode: 0 }
    };
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-call-2",
      toolName: "run_in_terminal",
      isComplete: true,
      invocationMessage: "Running npm test",
      pastTenseMessage: "Ran npm test",
      toolSpecificData
    });
    assert.strictEqual(response.value.length, 1);
    assert.strictEqual(response.value[0].kind, "toolInvocation");
    assert.deepStrictEqual(response.value[0].toolSpecificData, toolSpecificData);
    assert.strictEqual(IChatToolInvocation.isComplete(response.value[0]), true);
  });
  test("response stringification prefers terminal display command over sandbox wrapper", () => {
    const response = store.add(new Response([]));
    const sandboxWrappedCommand = `ELECTRON_RUN_AS_NODE=1 TMPDIR="/tmp/vscode" "Code - Insiders" "sandbox-runtime" -c 'npm test'`;
    const toolSpecificData = {
      kind: "terminal",
      language: "bash",
      commandLine: {
        original: sandboxWrappedCommand,
        toolEdited: sandboxWrappedCommand,
        forDisplay: "npm test",
        isSandboxWrapped: true
      },
      terminalCommandOutput: { text: "all green" },
      terminalCommandState: { exitCode: 0 }
    };
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-call-display-command",
      toolName: "run_in_terminal",
      isComplete: true,
      pastTenseMessage: "Ran npm test",
      toolSpecificData
    });
    const responseString = response.toString();
    assert.strictEqual(responseString, "Ran terminal command: npm test");
    assert.ok(!responseString.includes("sandbox-runtime"));
    assert.ok(!responseString.includes("ELECTRON_RUN_AS_NODE=1"));
  });
  test("response stringification prefers terminal presentation override over display command", () => {
    const response = store.add(new Response([]));
    const sandboxWrappedCommand = `ELECTRON_RUN_AS_NODE=1 TMPDIR="/tmp/vscode" "Code - Insiders" "sandbox-runtime" -c 'python -c "print(1)"'`;
    const toolSpecificData = {
      kind: "terminal",
      language: "python",
      commandLine: {
        original: sandboxWrappedCommand,
        toolEdited: sandboxWrappedCommand,
        forDisplay: 'python -c "print(1)"',
        isSandboxWrapped: true
      },
      presentationOverrides: {
        commandLine: "print(1)",
        language: "python"
      },
      terminalCommandOutput: { text: "1" },
      terminalCommandState: { exitCode: 0 }
    };
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-call-presentation-override",
      toolName: "run_in_terminal",
      isComplete: true,
      pastTenseMessage: "Ran python command",
      toolSpecificData
    });
    const responseString = response.toString();
    assert.strictEqual(responseString, "Ran terminal command: print(1)");
    assert.ok(!responseString.includes("sandbox-runtime"));
    assert.ok(!responseString.includes('python -c "print(1)"'));
  });
  test("response stringification uses terminal presentation override for result details", () => {
    const response = store.add(new Response([]));
    const sandboxWrappedCommand = `ELECTRON_RUN_AS_NODE=1 TMPDIR="/tmp/vscode" CLAUDE_TMPDIR="/tmp/vscode" "Code - Insiders" "sandbox-runtime" --settings "/tmp/settings.json" -c 'python -c "print(1)"'`;
    const toolSpecificData = {
      kind: "terminal",
      language: "python",
      commandLine: {
        original: 'python -c "print(1)"',
        toolEdited: sandboxWrappedCommand,
        forDisplay: 'python -c "print(1)"',
        isSandboxWrapped: true
      },
      presentationOverrides: {
        commandLine: "print(1)",
        language: "python"
      }
    };
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-call-result-details",
      toolName: "run_in_terminal",
      isComplete: true,
      pastTenseMessage: "Ran python command",
      toolSpecificData,
      resultDetails: {
        input: sandboxWrappedCommand,
        output: [{ type: "embed", isText: true, value: "1" }],
        isError: true
      }
    });
    const responseString = response.toString();
    assert.strictEqual(responseString, "Ran terminal command: print(1)\nCompleted with input: print(1)");
    assert.ok(!responseString.includes("sandbox-runtime"));
    assert.ok(!responseString.includes("ELECTRON_RUN_AS_NODE=1"));
    assert.ok(!responseString.includes('python -c "print(1)"'));
  });
  test("getFinalResponse returns last contiguous markdown after tool call", () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("Early text"), kind: "markdownContent" });
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-1",
      toolName: "some_tool",
      isComplete: true,
      invocationMessage: "Ran tool"
    });
    response.updateContent({ content: new MarkdownString("Final text"), kind: "markdownContent" });
    assert.strictEqual(response.getFinalResponse(), "Final text");
  });
  test("getFinalResponse skips trailing empty markdown and tool calls", () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("Before tool"), kind: "markdownContent" });
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-1",
      toolName: "some_tool",
      isComplete: true,
      invocationMessage: "Ran tool"
    });
    response.updateContent({ content: new MarkdownString("The answer is 42."), kind: "markdownContent" });
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-2",
      toolName: "some_tool",
      isComplete: true,
      invocationMessage: "Ran another tool"
    });
    response.updateContent({ content: new MarkdownString(""), kind: "markdownContent" });
    assert.strictEqual(response.getFinalResponse(), "The answer is 42.");
  });
  test("getFinalResponse includes inline references in final block", () => {
    const response = store.add(new Response([]));
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-1",
      toolName: "some_tool",
      isComplete: true,
      invocationMessage: "Ran tool"
    });
    response.updateContent({ content: new MarkdownString("See "), kind: "markdownContent" });
    response.updateContent({ inlineReference: URI.parse("https://example.com/"), kind: "inlineReference" });
    response.updateContent({ content: new MarkdownString(" for details."), kind: "markdownContent" });
    assert.strictEqual(response.getFinalResponse(), "See https://example.com/ for details.");
  });
  test("getFinalResponse returns empty string when no markdown", () => {
    const response = store.add(new Response([]));
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-1",
      toolName: "some_tool",
      isComplete: true,
      invocationMessage: "Ran tool"
    });
    assert.strictEqual(response.getFinalResponse(), "");
  });
  test("getFinalResponse returns all markdown when there are no tool calls", () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("Hello "), kind: "markdownContent" });
    response.updateContent({ content: new MarkdownString("World"), kind: "markdownContent" });
    assert.strictEqual(response.getFinalResponse(), "Hello World");
  });
});
suite("normalizeSerializableChatData", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("v1", () => {
    const v1Data = {
      creationDate: Date.now(),
      initialLocation: void 0,
      requests: [],
      responderUsername: "bot",
      sessionId: "session1"
    };
    const newData = normalizeSerializableChatData(v1Data);
    assert.strictEqual(newData.creationDate, v1Data.creationDate);
    assert.strictEqual(newData.version, 3);
  });
  test("v2", () => {
    const v2Data = {
      version: 2,
      creationDate: 100,
      initialLocation: void 0,
      requests: [],
      responderUsername: "bot",
      sessionId: "session1",
      computedTitle: "computed title"
    };
    const newData = normalizeSerializableChatData(v2Data);
    assert.strictEqual(newData.version, 3);
    assert.strictEqual(newData.creationDate, v2Data.creationDate);
    assert.strictEqual(newData.customTitle, v2Data.computedTitle);
  });
  test("old bad data", () => {
    const v1Data = {
      // Testing the scenario where these are missing
      sessionId: void 0,
      creationDate: void 0,
      initialLocation: void 0,
      requests: [],
      responderUsername: "bot"
    };
    const newData = normalizeSerializableChatData(v1Data);
    assert.strictEqual(newData.version, 3);
    assert.ok(newData.creationDate > 0);
    assert.ok(newData.sessionId);
  });
  test("v3 with bug", () => {
    const v3Data = {
      // Test case where old data was wrongly normalized and these fields were missing
      creationDate: void 0,
      version: 3,
      initialLocation: void 0,
      requests: [],
      responderUsername: "bot",
      sessionId: "session1",
      customTitle: "computed title"
    };
    const newData = normalizeSerializableChatData(v3Data);
    assert.strictEqual(newData.version, 3);
    assert.ok(newData.creationDate > 0);
    assert.ok(newData.sessionId);
  });
});
suite("isExportableSessionData", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("valid exportable data", () => {
    const validData = {
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: "bot"
    };
    assert.strictEqual(isExportableSessionData(validData), true);
  });
  test("invalid - missing requests", () => {
    const invalidData = {
      initialLocation: ChatAgentLocation.Chat,
      responderUsername: "bot"
    };
    assert.strictEqual(isExportableSessionData(invalidData), false);
  });
  test("invalid - requests not array", () => {
    const invalidData = {
      initialLocation: ChatAgentLocation.Chat,
      requests: "not-an-array",
      responderUsername: "bot"
    };
    assert.strictEqual(isExportableSessionData(invalidData), false);
  });
  test("invalid - missing responderUsername", () => {
    const invalidData = {
      initialLocation: ChatAgentLocation.Chat,
      requests: []
    };
    assert.strictEqual(isExportableSessionData(invalidData), false);
  });
  test("invalid - responderUsername not string", () => {
    const invalidData = {
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: 123
    };
    assert.strictEqual(isExportableSessionData(invalidData), false);
  });
  test("invalid - null", () => {
    assert.strictEqual(isExportableSessionData(null), false);
  });
  test("invalid - undefined", () => {
    assert.strictEqual(isExportableSessionData(void 0), false);
  });
});
suite("isSerializableSessionData", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("valid serializable data", () => {
    const validData = {
      version: 3,
      sessionId: "session1",
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: "bot"
    };
    assert.strictEqual(isSerializableSessionData(validData), true);
  });
  test("valid - with usedContext", () => {
    const validData = {
      version: 3,
      sessionId: "session1",
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: [{
        requestId: "req1",
        message: "test",
        variableData: { variables: [] },
        response: void 0,
        usedContext: { documents: [], kind: "usedContext" }
      }],
      responderUsername: "bot"
    };
    assert.strictEqual(isSerializableSessionData(validData), true);
  });
  test("invalid - missing sessionId", () => {
    const invalidData = {
      version: 3,
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: "bot"
    };
    assert.strictEqual(isSerializableSessionData(invalidData), false);
  });
  test("invalid - missing creationDate", () => {
    const invalidData = {
      version: 3,
      sessionId: "session1",
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: "bot"
    };
    assert.strictEqual(isSerializableSessionData(invalidData), false);
  });
  test("invalid - not exportable", () => {
    const invalidData = {
      version: 3,
      sessionId: "session1",
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: "not-an-array",
      responderUsername: "bot"
    };
    assert.strictEqual(isSerializableSessionData(invalidData), false);
  });
});
suite("ChatResponseModel", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  setup(async () => {
    instantiationService = testDisposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IExtensionService, new TestExtensionService());
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IChatService, new MockChatService());
  });
  test("timestamp and confirmationAdjustedTimestamp", async () => {
    const clock = sinon.useFakeTimers();
    try {
      const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
      const start = Date.now();
      const text = "hello";
      const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
      const response = request.response;
      assert.strictEqual(response.timestamp, start);
      assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start);
      clock.tick(1e3);
      assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start);
      const toolState = observableValue("state", { type: 1, confirmationMessages: { title: "Please confirm" } });
      const toolInvocation = {
        kind: "toolInvocation",
        invocationMessage: "calling tool",
        state: toolState
      };
      model.acceptResponseProgress(request, toolInvocation);
      clock.tick(2e3);
      assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start);
      toolState.set({
        type: 4
        /* IChatToolInvocation.StateKind.Completed */
      }, void 0);
      assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start + 2e3);
      clock.tick(1e3);
      assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start + 2e3);
    } finally {
      clock.restore();
    }
  });
  test("isIncomplete stays true during tool confirmations", async () => {
    const clock = sinon.useFakeTimers();
    try {
      const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
      const text = "hello";
      const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
      const response = request.response;
      assert.strictEqual(response.isIncomplete.get(), true);
      assert.strictEqual(response.isInProgress.get(), true);
      const toolState = observableValue("state", { type: 1, confirmationMessages: { title: "Please confirm" } });
      const toolInvocation = {
        kind: "toolInvocation",
        invocationMessage: "calling tool",
        state: toolState
      };
      model.acceptResponseProgress(request, toolInvocation);
      assert.strictEqual(response.isInProgress.get(), false);
      assert.strictEqual(response.isIncomplete.get(), true);
      toolState.set({
        type: 4
        /* IChatToolInvocation.StateKind.Completed */
      }, void 0);
      assert.strictEqual(response.isInProgress.get(), true);
      assert.strictEqual(response.isIncomplete.get(), true);
      response.complete();
      assert.strictEqual(response.isInProgress.get(), false);
      assert.strictEqual(response.isIncomplete.get(), false);
      assert.strictEqual(response.state, ResponseModelState.Complete);
    } finally {
      clock.restore();
    }
  });
  test("MCP tool authentication marks the response as needing input", () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    const response = request.response;
    const toolInvocation = {
      kind: "toolInvocation",
      invocationMessage: "calling tool",
      state: observableValue("state", {
        type: IChatToolInvocation.StateKind.WaitingForAuthentication,
        server: { id: "server", name: "GitHub MCP", resource: "https://api.githubcopilot.com/mcp" },
        cancel: () => {
        }
      })
    };
    model.acceptResponseProgress(request, toolInvocation);
    assert.deepStrictEqual({
      isInProgress: response.isInProgress.get(),
      isIncomplete: response.isIncomplete.get(),
      pending: response.isPendingConfirmation.get()?.detail
    }, {
      isInProgress: false,
      isIncomplete: true,
      pending: "Authenticate GitHub MCP to continue..."
    });
  });
  test("isIncomplete becomes false on cancellation", async () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    const response = request.response;
    assert.strictEqual(response.isIncomplete.get(), true);
    model.cancelRequest(request);
    assert.deepStrictEqual({
      isIncomplete: response.isIncomplete.get(),
      state: response.state,
      hasElapsedTime: typeof response.elapsedMs === "number"
    }, {
      isIncomplete: false,
      state: ResponseModelState.Cancelled,
      hasElapsedTime: true
    });
  });
  test("cancellation transitions streaming tool invocations to Cancelled (issue #288701)", async () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "edit a file";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    const response = request.response;
    const toolInvocation = ChatToolInvocation.createStreaming({
      toolCallId: "tool-call-1",
      toolId: "replace_string_in_file",
      toolData: {
        id: "replace_string_in_file",
        modelDescription: "Replace string in file",
        displayName: "Replace String in File",
        source: ToolDataSource.Internal
      }
    });
    model.acceptResponseProgress(request, toolInvocation);
    assert.strictEqual(toolInvocation.state.get().type, IChatToolInvocation.StateKind.Streaming);
    assert.strictEqual(IChatToolInvocation.isComplete(toolInvocation), false);
    model.cancelRequest(request);
    assert.strictEqual(toolInvocation.state.get().type, IChatToolInvocation.StateKind.Cancelled);
    assert.strictEqual(IChatToolInvocation.isComplete(toolInvocation), true);
    assert.strictEqual(response.state, ResponseModelState.Cancelled);
  });
  test("hasActiveRequest reflects last request isIncomplete", async () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    assert.strictEqual(model.hasActiveRequest.get(), false);
    const text = "hello";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    assert.strictEqual(model.hasActiveRequest.get(), true);
    request.response.complete();
    assert.strictEqual(model.hasActiveRequest.get(), false);
  });
});
suite("ChatModel - Pending Requests", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  function createModel() {
    return testDisposables.add(instantiationService.createInstance(
      ChatModel,
      void 0,
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
  }
  function addRequestToModel(model, text) {
    return model.addRequest(
      { text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] },
      { variables: [] },
      0
    );
  }
  setup(async () => {
    instantiationService = testDisposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IExtensionService, new TestExtensionService());
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IChatService, new MockChatService());
  });
  test("addPendingRequest - queued messages are added at the end", () => {
    const model = createModel();
    const request1 = addRequestToModel(model, "first");
    const request2 = addRequestToModel(model, "second");
    model.addPendingRequest(request1, ChatRequestQueueKind.Queued, {});
    model.addPendingRequest(request2, ChatRequestQueueKind.Queued, {});
    const pending = model.getPendingRequests();
    assert.strictEqual(pending.length, 2);
    assert.strictEqual(pending[0].request.id, request1.id);
    assert.strictEqual(pending[1].request.id, request2.id);
  });
  test("addPendingRequest - steering messages are inserted before queued messages", () => {
    const model = createModel();
    const queued = addRequestToModel(model, "queued");
    const steering = addRequestToModel(model, "steering");
    model.addPendingRequest(queued, ChatRequestQueueKind.Queued, {});
    model.addPendingRequest(steering, ChatRequestQueueKind.Steering, {});
    const pending = model.getPendingRequests();
    assert.strictEqual(pending.length, 2);
    assert.strictEqual(pending[0].request.id, steering.id);
    assert.strictEqual(pending[0].kind, ChatRequestQueueKind.Steering);
    assert.strictEqual(pending[1].request.id, queued.id);
    assert.strictEqual(pending[1].kind, ChatRequestQueueKind.Queued);
  });
  test("addPendingRequest - multiple steering messages maintain order", () => {
    const model = createModel();
    const [steering1, steering2, queued] = ["s1", "s2", "q"].map((t) => addRequestToModel(model, t));
    model.addPendingRequest(queued, ChatRequestQueueKind.Queued, {});
    model.addPendingRequest(steering1, ChatRequestQueueKind.Steering, {});
    model.addPendingRequest(steering2, ChatRequestQueueKind.Steering, {});
    const pending = model.getPendingRequests();
    assert.strictEqual(pending.length, 3);
    assert.strictEqual(pending[0].request.id, steering1.id);
    assert.strictEqual(pending[1].request.id, steering2.id);
    assert.strictEqual(pending[2].request.id, queued.id);
  });
  test("addPendingRequest - fires onDidChangePendingRequests event", () => {
    const model = createModel();
    const request = addRequestToModel(model, "test");
    let eventFired = false;
    testDisposables.add(model.onDidChangePendingRequests(() => {
      eventFired = true;
    }));
    model.addPendingRequest(request, ChatRequestQueueKind.Queued, {});
    assert.strictEqual(eventFired, true);
  });
  test("removePendingRequest - removes specified request", () => {
    const model = createModel();
    const [request1, request2] = ["r1", "r2"].map((t) => addRequestToModel(model, t));
    model.addPendingRequest(request1, ChatRequestQueueKind.Queued, {});
    model.addPendingRequest(request2, ChatRequestQueueKind.Queued, {});
    model.removePendingRequest(request1.id);
    const pending = model.getPendingRequests();
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].request.id, request2.id);
  });
  test("removePendingRequest - no-op for non-existent request", () => {
    const model = createModel();
    const request = addRequestToModel(model, "test");
    model.addPendingRequest(request, ChatRequestQueueKind.Queued, {});
    let eventCount = 0;
    testDisposables.add(model.onDidChangePendingRequests(() => {
      eventCount++;
    }));
    model.removePendingRequest("non-existent-id");
    assert.strictEqual(model.getPendingRequests().length, 1);
    assert.strictEqual(eventCount, 0);
  });
  test("dequeuePendingRequest - returns and removes first request", () => {
    const model = createModel();
    const [request1, request2] = ["r1", "r2"].map((t) => addRequestToModel(model, t));
    model.addPendingRequest(request1, ChatRequestQueueKind.Queued, {});
    model.addPendingRequest(request2, ChatRequestQueueKind.Queued, {});
    const dequeued = model.dequeuePendingRequest();
    assert.strictEqual(dequeued?.request.id, request1.id);
    assert.strictEqual(model.getPendingRequests().length, 1);
    assert.strictEqual(model.getPendingRequests()[0].request.id, request2.id);
  });
  test("dequeuePendingRequest - returns undefined when empty", () => {
    const model = createModel();
    assert.strictEqual(model.dequeuePendingRequest(), void 0);
  });
  test("dequeuePendingRequest - fires event when request dequeued", () => {
    const model = createModel();
    const request = addRequestToModel(model, "test");
    model.addPendingRequest(request, ChatRequestQueueKind.Queued, {});
    let eventFired = false;
    testDisposables.add(model.onDidChangePendingRequests(() => {
      eventFired = true;
    }));
    model.dequeuePendingRequest();
    assert.strictEqual(eventFired, true);
  });
  test("clearPendingRequests - removes all pending requests", () => {
    const model = createModel();
    ["r1", "r2", "r3"].forEach((t) => {
      model.addPendingRequest(addRequestToModel(model, t), ChatRequestQueueKind.Queued, {});
    });
    model.clearPendingRequests();
    assert.strictEqual(model.getPendingRequests().length, 0);
  });
  test("clearPendingRequests - no event when already empty", () => {
    const model = createModel();
    let eventFired = false;
    testDisposables.add(model.onDidChangePendingRequests(() => {
      eventFired = true;
    }));
    model.clearPendingRequests();
    assert.strictEqual(eventFired, false);
  });
  test("setPendingRequests - reorders existing pending requests", () => {
    const model = createModel();
    const [r1, r2, r3] = ["r1", "r2", "r3"].map((t) => addRequestToModel(model, t));
    model.addPendingRequest(r1, ChatRequestQueueKind.Queued, {});
    model.addPendingRequest(r2, ChatRequestQueueKind.Queued, {});
    model.addPendingRequest(r3, ChatRequestQueueKind.Steering, {});
    model.setPendingRequests([
      { requestId: r2.id, kind: ChatRequestQueueKind.Queued },
      { requestId: r1.id, kind: ChatRequestQueueKind.Steering }
      // Change kind
    ]);
    const pending = model.getPendingRequests();
    assert.strictEqual(pending.length, 2);
    assert.strictEqual(pending[0].request.id, r2.id);
    assert.strictEqual(pending[1].request.id, r1.id);
    assert.strictEqual(pending[1].kind, ChatRequestQueueKind.Steering);
  });
  test("setPendingRequests - ignores non-existent request IDs", () => {
    const model = createModel();
    const request = addRequestToModel(model, "test");
    model.addPendingRequest(request, ChatRequestQueueKind.Queued, {});
    model.setPendingRequests([
      { requestId: "non-existent", kind: ChatRequestQueueKind.Queued },
      { requestId: request.id, kind: ChatRequestQueueKind.Queued }
    ]);
    const pending = model.getPendingRequests();
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].request.id, request.id);
  });
  test("pending requests preserve send options", () => {
    const model = createModel();
    const request = addRequestToModel(model, "test");
    const sendOptions = { agentId: "test-agent", attempt: 3 };
    const pending = model.addPendingRequest(request, ChatRequestQueueKind.Queued, sendOptions);
    assert.strictEqual(pending.sendOptions.agentId, "test-agent");
    assert.strictEqual(pending.sendOptions.attempt, 3);
  });
});
suite("serializeSendOptions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("preserves request-scoped options through persist/restore", () => {
    const serialized = serializeSendOptions({
      userSelectedModelId: "copilot/gpt",
      userSelectedModelConfiguration: { thinkingEffort: "high", contextSize: 2e3 },
      isVoiceModeInput: true
    });
    assert.deepStrictEqual({
      modelConfiguration: serialized.userSelectedModelConfiguration,
      isVoiceModeInput: serialized.isVoiceModeInput
    }, {
      modelConfiguration: { thinkingEffort: "high", contextSize: 2e3 },
      isVoiceModeInput: true
    });
  });
});
suite("ChatResponseResource", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("createUri roundtrips through parseUri without basename", () => {
    const sessionResource = URI.parse("vscode-chat-session://local/session1");
    const uri = ChatResponseResource.createUri(sessionResource, "call-123", 2);
    const parsed = ChatResponseResource.parseUri(uri);
    assert.ok(parsed);
    assert.strictEqual(parsed.sessionResource.toString(), sessionResource.toString());
    assert.strictEqual(parsed.toolCallId, "call-123");
    assert.strictEqual(parsed.index, 2);
  });
  test("createUri roundtrips through parseUri with basename", () => {
    const sessionResource = URI.parse("vscode-chat-session://local/session1");
    const uri = ChatResponseResource.createUri(sessionResource, "call-456", 0, "file.txt");
    const parsed = ChatResponseResource.parseUri(uri);
    assert.ok(parsed);
    assert.strictEqual(parsed.sessionResource.toString(), sessionResource.toString());
    assert.strictEqual(parsed.toolCallId, "call-456");
    assert.strictEqual(parsed.index, 0);
  });
  test("parseUri rejects paths with fewer than 4 segments", () => {
    const base = URI.from({ scheme: ChatResponseResource.scheme, authority: "abc", path: "/tool/callId" });
    assert.strictEqual(ChatResponseResource.parseUri(base), void 0);
    const tooShort = URI.from({ scheme: ChatResponseResource.scheme, authority: "abc", path: "/tool" });
    assert.strictEqual(ChatResponseResource.parseUri(tooShort), void 0);
    const empty = URI.from({ scheme: ChatResponseResource.scheme, authority: "abc", path: "/" });
    assert.strictEqual(ChatResponseResource.parseUri(empty), void 0);
  });
  test("parseUri rejects wrong scheme", () => {
    const uri = URI.from({ scheme: "file", path: "/tool/callId/0" });
    assert.strictEqual(ChatResponseResource.parseUri(uri), void 0);
  });
  test("parseUri rejects wrong kind", () => {
    const uri = URI.from({ scheme: ChatResponseResource.scheme, authority: "abc", path: "/notTool/callId/0" });
    assert.strictEqual(ChatResponseResource.parseUri(uri), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRTbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vc25hcHNob3QuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgU3ltYm9sS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBUZXN0RXh0ZW5zaW9uU2VydmljZSwgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IENlbGxVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0SW1wbGljaXRWYXJpYWJsZUVudHJ5LCBJQ2hhdFJlcXVlc3RTdHJpbmdWYXJpYWJsZUVudHJ5LCBJQ2hhdFJlcXVlc3RGaWxlRW50cnksIFN0cmluZ0NoYXRDb250ZXh0VmFsdWUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRTZXJ2aWNlLCBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWwsIENoYXRSZXF1ZXN0TW9kZWwsIENoYXRSZXNwb25zZVJlc291cmNlLCBJQ2hhdFJlcXVlc3RNb2RlSW5mbywgSUV4cG9ydGFibGVDaGF0RGF0YSwgSVNlcmlhbGl6YWJsZUNoYXREYXRhMSwgSVNlcmlhbGl6YWJsZUNoYXREYXRhMiwgSVNlcmlhbGl6YWJsZUNoYXREYXRhMywgSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUsIGlzRXhwb3J0YWJsZVNlc3Npb25EYXRhLCBpc1NlcmlhbGl6YWJsZVNlc3Npb25EYXRhLCBub3JtYWxpemVTZXJpYWxpemFibGVDaGF0RGF0YSwgUmVzcG9uc2UsIHNlcmlhbGl6ZVNlbmRPcHRpb25zLCB0b0NoYXRIaXN0b3J5Q29udGVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRUb29sSW52b2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFRleHRQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0UXVldWVLaW5kLCBJQ2hhdFNlcnZpY2UsIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIElDaGF0VG9vbEludm9jYXRpb24sIFJlc3BvbnNlTW9kZWxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0U2VydmljZSB9IGZyb20gJy4uL2NoYXRTZXJ2aWNlL21vY2tDaGF0U2VydmljZS5qcyc7XG5cbnN1aXRlKCdDaGF0TW9kZWwnLCAoKSA9PiB7XG5cdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uU2VydmljZSwgbmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEFnZW50U2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbmV3IE1vY2tDaGF0U2VydmljZSgpKTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6YXRpb24gd2l0aCBleHBvcnRlZCBkYXRhIG9ubHkgKGltcG9ydGVkKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHBvcnRlZERhdGE6IElFeHBvcnRhYmxlQ2hhdERhdGEgPSB7XG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXF1ZXN0czogW10sXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0fTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNb2RlbCxcblx0XHRcdHsgdmFsdWU6IGV4cG9ydGVkRGF0YSwgc2VyaWFsaXplcjogdW5kZWZpbmVkISB9LFxuXHRcdFx0eyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH1cblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5pc0ltcG9ydGVkLCB0cnVlKTtcblx0XHRhc3NlcnQub2sobW9kZWwuc2Vzc2lvbklkKTsgLy8gU2hvdWxkIGhhdmUgZ2VuZXJhdGVkIElEXG5cdFx0YXNzZXJ0Lm9rKG1vZGVsLnRpbWVzdGFtcCA+IDApOyAvLyBTaG91bGQgaGF2ZSBnZW5lcmF0ZWQgdGltZXN0YW1wXG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemF0aW9uIHdpdGggZnVsbCBzZXJpYWxpemFibGUgZGF0YSAobm90IGltcG9ydGVkKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHNlcmlhbGl6YWJsZURhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTMgPSB7XG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0c2Vzc2lvbklkOiAnZXhpc3Rpbmctc2Vzc2lvbicsXG5cdFx0XHRjcmVhdGlvbkRhdGU6IG5vdyAtIDEwMDAsXG5cdFx0XHRjdXN0b21UaXRsZTogJ015IENoYXQnLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0cmVxdWVzdHM6IFtdLFxuXHRcdFx0cmVzcG9uZGVyVXNlcm5hbWU6ICdib3QnLFxuXHRcdH07XG5cblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TW9kZWwsXG5cdFx0XHR7IHZhbHVlOiBzZXJpYWxpemFibGVEYXRhLCBzZXJpYWxpemVyOiB1bmRlZmluZWQhIH0sXG5cdFx0XHR7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfVxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmlzSW1wb3J0ZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuc2Vzc2lvbklkLCAnZXhpc3Rpbmctc2Vzc2lvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC50aW1lc3RhbXAsIG5vdyAtIDEwMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXN0b21UaXRsZSwgJ015IENoYXQnKTtcblx0fSk7XG5cblx0dGVzdCgnbGVnYWN5IHJlcXVlc3RzIHdpdGhvdXQgdGltZXN0YW1wcyBrZWVwIGRpc3BsYXkgdGltZSB1bmtub3duJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNyZWF0aW9uRGF0ZSA9IDFfNzUyXzAxMl8zMjFfMDAwO1xuXHRcdGNvbnN0IHNlcmlhbGl6YWJsZURhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTMgPSB7XG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0c2Vzc2lvbklkOiAnbGVnYWN5LXNlc3Npb24nLFxuXHRcdFx0Y3JlYXRpb25EYXRlLFxuXHRcdFx0Y3VzdG9tVGl0bGU6IHVuZGVmaW5lZCxcblx0XHRcdGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHJlcXVlc3RzOiBbe1xuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBwYXJ0czogW10gfSxcblx0XHRcdFx0dmFyaWFibGVEYXRhOiB7IHZhcmlhYmxlczogW10gfSxcblx0XHRcdFx0cmVzcG9uc2U6IHVuZGVmaW5lZCxcblx0XHRcdH1dLFxuXHRcdFx0cmVzcG9uZGVyVXNlcm5hbWU6ICdib3QnLFxuXHRcdH07XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdE1vZGVsLFxuXHRcdFx0eyB2YWx1ZTogc2VyaWFsaXphYmxlRGF0YSwgc2VyaWFsaXplcjogdW5kZWZpbmVkISB9LFxuXHRcdFx0eyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH1cblx0XHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVjZW5jeVRpbWVzdGFtcDogbW9kZWwuZ2V0UmVxdWVzdHMoKVswXS50aW1lc3RhbXAsXG5cdFx0XHRyZXF1ZXN0VGltZXN0YW1wOiBtb2RlbC5nZXRSZXF1ZXN0cygpWzBdLnJlcXVlc3RUaW1lc3RhbXAsXG5cdFx0XHRzZXJpYWxpemVkVGltZXN0YW1wOiBtb2RlbC50b0pTT04oKS5yZXF1ZXN0c1swXS50aW1lc3RhbXAsXG5cdFx0fSwge1xuXHRcdFx0cmVjZW5jeVRpbWVzdGFtcDogY3JlYXRpb25EYXRlLFxuXHRcdFx0cmVxdWVzdFRpbWVzdGFtcDogdW5kZWZpbmVkLFxuXHRcdFx0c2VyaWFsaXplZFRpbWVzdGFtcDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXphdGlvbiB3aXRoIGludmFsaWQgZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnZhbGlkRGF0YSA9IHtcblx0XHRcdC8vIE1pc3NpbmcgcmVxdWlyZWQgZmllbGRzXG5cdFx0XHRyZXF1ZXN0czogJ25vdC1hbi1hcnJheSdcblx0XHR9IGFzIHVua25vd24gYXMgSUV4cG9ydGFibGVDaGF0RGF0YTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNb2RlbCxcblx0XHRcdHsgdmFsdWU6IGludmFsaWREYXRhLCBzZXJpYWxpemVyOiB1bmRlZmluZWQhIH0sXG5cdFx0XHR7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfVxuXHRcdCkpO1xuXG5cdFx0Ly8gU2hvdWxkIGhhbmRsZSBncmFjZWZ1bGx5IHdpdGggZW1wdHkgc3RhdGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0UmVxdWVzdHMoKS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayhtb2RlbC5zZXNzaW9uSWQpOyAvLyBTaG91bGQgaGF2ZSBnZW5lcmF0ZWQgSURcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6YXRpb24gd2l0aG91dCBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNb2RlbCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9XG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaXNJbXBvcnRlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsLnNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsLnRpbWVzdGFtcCA+IDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVSZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdG1vZGVsLmFkZFJlcXVlc3QoeyB0ZXh0LCBwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCB0ZXh0Lmxlbmd0aCksIG5ldyBSYW5nZSgxLCB0ZXh0Lmxlbmd0aCwgMSwgdGV4dC5sZW5ndGgpLCB0ZXh0KV0gfSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXHRcdGNvbnN0IHJlcXVlc3RzID0gbW9kZWwuZ2V0UmVxdWVzdHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdHMubGVuZ3RoLCAxKTtcblxuXHRcdG1vZGVsLnJlbW92ZVJlcXVlc3QocmVxdWVzdHNbMF0uaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fkb3B0UmVxdWVzdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbDEgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lLCBjYW5Vc2VUb29sczogdHJ1ZSB9KSk7XG5cdFx0Y29uc3QgbW9kZWwyID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdGNvbnN0IHJlcXVlc3QxID0gbW9kZWwxLmFkZFJlcXVlc3QoeyB0ZXh0LCBwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCB0ZXh0Lmxlbmd0aCksIG5ldyBSYW5nZSgxLCB0ZXh0Lmxlbmd0aCwgMSwgdGV4dC5sZW5ndGgpLCB0ZXh0KV0gfSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsMS5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsMi5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKHJlcXVlc3QxLnNlc3Npb24gPT09IG1vZGVsMSk7XG5cdFx0YXNzZXJ0Lm9rKHJlcXVlc3QxLnJlc3BvbnNlPy5zZXNzaW9uID09PSBtb2RlbDEpO1xuXG5cdFx0bW9kZWwyLmFkb3B0UmVxdWVzdChyZXF1ZXN0MSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwxLmdldFJlcXVlc3RzKCkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwyLmdldFJlcXVlc3RzKCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQub2socmVxdWVzdDEuc2Vzc2lvbiA9PT0gbW9kZWwyKTtcblx0XHRhc3NlcnQub2socmVxdWVzdDEucmVzcG9uc2U/LnNlc3Npb24gPT09IG1vZGVsMik7XG5cblx0XHRtb2RlbDIuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0MSwgeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ0hlbGxvJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3QxLnJlc3BvbnNlLnJlc3BvbnNlLnRvU3RyaW5nKCksICdIZWxsbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHRSZXNwb25zZVByb2dyZXNzIGFwcGxpZXMgdXNhZ2UgdG8gcmVzcG9uc2UgbWV0YWRhdGEnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblxuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAndXNhZ2UnLCBwcm9tcHRUb2tlbnM6IDEwLCBjb21wbGV0aW9uVG9rZW5zOiAyIH0pO1xuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAndXNhZ2UnLCBwcm9tcHRUb2tlbnM6IDEwLCBjb21wbGV0aW9uVG9rZW5zOiAyIH0pO1xuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAndXNhZ2UnLCBwcm9tcHRUb2tlbnM6IDEwLCBjb21wbGV0aW9uVG9rZW5zOiAzIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR1c2FnZTogcmVxdWVzdC5yZXNwb25zZT8udXNhZ2UsXG5cdFx0XHRjb21wbGV0aW9uVG9rZW5Db3VudDogcmVxdWVzdC5yZXNwb25zZT8uY29tcGxldGlvblRva2VuQ291bnQsXG5cdFx0XHRyZXNwb25zZUNvbnRlbnQ6IHJlcXVlc3QucmVzcG9uc2U/LnJlc3BvbnNlLnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0dXNhZ2U6IHsga2luZDogJ3VzYWdlJywgcHJvbXB0VG9rZW5zOiAxMCwgY29tcGxldGlvblRva2VuczogMyB9LFxuXHRcdFx0Y29tcGxldGlvblRva2VuQ291bnQ6IDUsXG5cdFx0XHRyZXNwb25zZUNvbnRlbnQ6ICcnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd2b2ljZSBwcm9ncmVzcyBpcyBsaXZlLW9ubHkgcmVzcG9uc2UgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblxuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdCZWZvcmUgJykgfSk7XG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICd2b2ljZVByb2dyZXNzJywgaWQ6ICdpbnZlc3RpZ2F0aW5nJywgdmFsdWU6ICdJbnZlc3RpZ2F0aW5nIHRoZSByZWxldmFudCBjb2RlLicgfSk7XG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ2FmdGVyJykgfSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IHJlcXVlc3QucmVzcG9uc2UhLnJlc3BvbnNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzcG9uc2VLaW5kczogcmVzcG9uc2UudmFsdWUubWFwKHBhcnQgPT4gcGFydC5raW5kKSxcblx0XHRcdGhpc3RvcnlLaW5kczogdG9DaGF0SGlzdG9yeUNvbnRlbnQocmVzcG9uc2UudmFsdWUpLm1hcChwYXJ0ID0+IHBhcnQua2luZCksXG5cdFx0XHRtYXJrZG93bjogcmVzcG9uc2UuZ2V0TWFya2Rvd24oKSxcblx0XHRcdGNvcHlUZXh0OiByZXNwb25zZS50b1N0cmluZygpLFxuXHRcdFx0cGVyc2lzdGVkS2luZHM6IG1vZGVsLnRvRXhwb3J0KCkucmVxdWVzdHNbMF0ucmVzcG9uc2U/Lm1hcChwYXJ0ID0+IGhhc0tleShwYXJ0LCB7IGtpbmQ6IHRydWUgfSkgPyBwYXJ0LmtpbmQgOiAnbWFya2Rvd24nKSxcblx0XHR9LCB7XG5cdFx0XHRyZXNwb25zZUtpbmRzOiBbJ21hcmtkb3duQ29udGVudCcsICd2b2ljZVByb2dyZXNzJywgJ21hcmtkb3duQ29udGVudCddLFxuXHRcdFx0aGlzdG9yeUtpbmRzOiBbJ21hcmtkb3duQ29udGVudCcsICdtYXJrZG93bkNvbnRlbnQnXSxcblx0XHRcdG1hcmtkb3duOiAnQmVmb3JlIGFmdGVyJyxcblx0XHRcdGNvcHlUZXh0OiAnQmVmb3JlIGFmdGVyJyxcblx0XHRcdHBlcnNpc3RlZEtpbmRzOiBbJ21hcmtkb3duJywgJ21hcmtkb3duJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgcmVmaW5lbWVudCBvZiB0aGUgc2FtZSBtb2RlbCBjYWxsIHVwZGF0ZXMgdXNhZ2Ugd2l0aG91dCByZWNvdW50aW5nIGl0cyB0b2tlbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblxuXHRcdC8vIFRoZSBhZ2VudCBob3N0IHJlcG9ydHMgb25lIG1vZGVsIGNhbGwgc2V2ZXJhbCB0aW1lcyBhcyBpdHMgY29udGV4dCBhdHRyaWJ1dGlvblxuXHRcdC8vIGFuZCBzZXNzaW9uIGNvc3QgcmVzb2x2ZSBhc3luY2hyb25vdXNseS4gVGhvc2UgcmVmaW5lbWVudHMgbXVzdCB1cGRhdGUgdGhlXG5cdFx0Ly8gc3RvcmVkIHVzYWdlIHdpdGhvdXQgYWRkaW5nIHRoZSBjYWxsJ3MgY29tcGxldGlvbiB0b2tlbnMgYWdhaW4uXG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMTAsIGNvbXBsZXRpb25Ub2tlbnM6IDIsIGNvcGlsb3RDcmVkaXRzOiAxLCBzZXNzaW9uQ29waWxvdENyZWRpdHM6IDEgfSk7XG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMTAsIGNvbXBsZXRpb25Ub2tlbnM6IDIsIGNvcGlsb3RDcmVkaXRzOiAxLCBzZXNzaW9uQ29waWxvdENyZWRpdHM6IDUgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlc3Npb25Db3BpbG90Q3JlZGl0czogcmVxdWVzdC5yZXNwb25zZT8udXNhZ2U/LnNlc3Npb25Db3BpbG90Q3JlZGl0cyxcblx0XHRcdGNvbXBsZXRpb25Ub2tlbkNvdW50OiByZXF1ZXN0LnJlc3BvbnNlPy5jb21wbGV0aW9uVG9rZW5Db3VudCxcblx0XHR9LCB7XG5cdFx0XHRzZXNzaW9uQ29waWxvdENyZWRpdHM6IDUsXG5cdFx0XHRjb21wbGV0aW9uVG9rZW5Db3VudDogMixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3ViYWdlbnQgY3JlZGl0cyBhcmUgZm9sZGVkIGludG8gcGFyZW50IHJlc3BvbnNlIHVzYWdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblx0XHRjb25zdCB0ZXh0ID0gJ2hlbGxvJztcblx0XHRjb25zdCByZXF1ZXN0ID0gbW9kZWwuYWRkUmVxdWVzdCh7IHRleHQsIHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSwgbmV3IFJhbmdlKDEsIHRleHQubGVuZ3RoLCAxLCB0ZXh0Lmxlbmd0aCksIHRleHQpXSB9LCB7IHZhcmlhYmxlczogW10gfSwgMCk7XG5cblx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5zZXRTdWJhZ2VudENvcGlsb3RDcmVkaXRzKCdzdWJhZ2VudC0xJywgNSk7XG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMTAsIGNvbXBsZXRpb25Ub2tlbnM6IDIsIGNvcGlsb3RDcmVkaXRzOiAyIH0pO1xuXHRcdHJlcXVlc3QucmVzcG9uc2U/LnNldFN1YmFnZW50Q29waWxvdENyZWRpdHMoJ3N1YmFnZW50LTEnLCA2KTtcblx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5zZXRTdWJhZ2VudENvcGlsb3RDcmVkaXRzKCdzdWJhZ2VudC0xJywgNCk7XG5cdFx0cmVxdWVzdC5yZXNwb25zZT8uc2V0U3ViYWdlbnRDb3BpbG90Q3JlZGl0cygnc3ViYWdlbnQtMicsIDMpO1xuXHRcdHJlcXVlc3QucmVzcG9uc2U/LnNldFN1YmFnZW50Q29waWxvdENyZWRpdHMoJ2ludmFsaWQnLCBOdW1iZXIuTmFOKTtcblx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5zZXRTdWJhZ2VudENvcGlsb3RDcmVkaXRzKCdpbnZhbGlkJywgLTEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHVzYWdlOiByZXF1ZXN0LnJlc3BvbnNlPy51c2FnZSwgY29tcGxldGlvblRva2VuQ291bnQ6IHJlcXVlc3QucmVzcG9uc2U/LmNvbXBsZXRpb25Ub2tlbkNvdW50LCBzZXNzaW9uQ29zdDogbW9kZWwuc2Vzc2lvbkNvc3QgfSwge1xuXHRcdFx0dXNhZ2U6IHsga2luZDogJ3VzYWdlJywgcHJvbXB0VG9rZW5zOiAxMCwgY29tcGxldGlvblRva2VuczogMiwgY29waWxvdENyZWRpdHM6IDExIH0sXG5cdFx0XHRjb21wbGV0aW9uVG9rZW5Db3VudDogMixcblx0XHRcdHNlc3Npb25Db3N0OiAxMSxcblx0XHR9KTtcblx0XHRjb25zdCByZXN0b3JlZFNlcGFyYXRlQ29zdHMgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdE1vZGVsLFxuXHRcdFx0eyB2YWx1ZTogSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShtb2RlbC50b0pTT04oKSkpIGFzIElTZXJpYWxpemFibGVDaGF0RGF0YTMsIHNlcmlhbGl6ZXI6IHVuZGVmaW5lZCEgfSxcblx0XHRcdHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9XG5cdFx0KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3RvcmVkU2VwYXJhdGVDb3N0cy5zZXNzaW9uQ29zdCwgMTEpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGUgc2Vzc2lvbiB0b3RhbCBhbmQgdGhlIHN1bW1lZCB0dXJucyBlYWNoIHByb3ZpZGUgYSBmbG9vciBmb3Igc2Vzc2lvbiBjb3N0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblx0XHRjb25zdCBhZGRSZXF1ZXN0ID0gKHRleHQ6IHN0cmluZykgPT4gbW9kZWwuYWRkUmVxdWVzdCh7IHRleHQsIHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSwgbmV3IFJhbmdlKDEsIHRleHQubGVuZ3RoLCAxLCB0ZXh0Lmxlbmd0aCksIHRleHQpXSB9LCB7IHZhcmlhYmxlczogW10gfSwgMCk7XG5cblx0XHQvLyBBIHR1cm4gZnJvbSBhIGJhY2tlbmQgdGhhdCByZXBvcnRzIG5vIHNlc3Npb24gdG90YWwgKGUuZy4gQ2xhdWRlKSBzdGlsbCBjb3VudHMuXG5cdFx0Y29uc3QgZmlyc3QgPSBhZGRSZXF1ZXN0KCdvbmUnKTtcblx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKGZpcnN0LCB7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMTAsIGNvbXBsZXRpb25Ub2tlbnM6IDIsIGNvcGlsb3RDcmVkaXRzOiAyIH0pO1xuXHRcdC8vIFRoZSByZXBvcnRlZCBzZXNzaW9uIHRvdGFsIGV4Y2VlZHMgdGhlIHN1bW1lZCB0dXJucyBiZWNhdXNlIGl0IGFsc28gY292ZXJzIHdvcmtcblx0XHQvLyBiaWxsZWQgb3V0c2lkZSBhbnkgdHVybiwgc3VjaCBhcyBhIGNvbXBhY3Rpb24gdGhhdCByYW4gYmV0d2VlbiB0aGVtLlxuXHRcdGNvbnN0IHNlY29uZCA9IGFkZFJlcXVlc3QoJ3R3bycpO1xuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3Moc2Vjb25kLCB7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMTAsIGNvbXBsZXRpb25Ub2tlbnM6IDIsIGNvcGlsb3RDcmVkaXRzOiAzLCBzZXNzaW9uQ29waWxvdENyZWRpdHM6IDkgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuc2Vzc2lvbkNvc3QsIDkpO1xuXHRcdGNvbnN0IHJlc3RvcmVkID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNb2RlbCxcblx0XHRcdHsgdmFsdWU6IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkobW9kZWwudG9KU09OKCkpKSBhcyBJU2VyaWFsaXphYmxlQ2hhdERhdGEzLCBzZXJpYWxpemVyOiB1bmRlZmluZWQhIH0sXG5cdFx0XHR7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfVxuXHRcdCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN0b3JlZC5zZXNzaW9uQ29zdCwgOSk7XG5cblx0XHQvLyBBIGxhdGVyIHR1cm4gd2hvc2UgY29zdCBoYXMgbm90IHlldCByZWFjaGVkIHRoZSByZXBvcnRlZCB0b3RhbCBtdXN0IG5vdCBzaHJpbmtcblx0XHQvLyB0aGUgc2Vzc2lvbiBjb3N0LCBhbmQgdGhlIHN1bW1lZCB0dXJucyB0YWtlIG92ZXIgb25jZSB0aGV5IGV4Y2VlZCBpdC5cblx0XHRjb25zdCB0aGlyZCA9IGFkZFJlcXVlc3QoJ3RocmVlJyk7XG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyh0aGlyZCwgeyBraW5kOiAndXNhZ2UnLCBwcm9tcHRUb2tlbnM6IDEwLCBjb21wbGV0aW9uVG9rZW5zOiAyLCBjb3BpbG90Q3JlZGl0czogNiB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuc2Vzc2lvbkNvc3QsIDExKTtcblx0fSk7XG5cblx0dGVzdCgncmVzcG9uc2UgZGV0YWlscywgZWxhcHNlZCB0aW1lLCBhbmQgdG9rZW5zIHJvdW5kdHJpcCB0aHJvdWdoIHNlcmlhbGl6YXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tcGxldGVkQXQgPSAxXzc1Ml8wMTJfNDA1XzAwMDtcblx0XHRjb25zdCBzZXJpYWxpemFibGVEYXRhOiBJU2VyaWFsaXphYmxlQ2hhdERhdGEzID0ge1xuXHRcdFx0dmVyc2lvbjogMyxcblx0XHRcdHNlc3Npb25JZDogJ3Rlc3Qtc2Vzc2lvbicsXG5cdFx0XHRjcmVhdGlvbkRhdGU6IERhdGUubm93KCksXG5cdFx0XHRjdXN0b21UaXRsZTogdW5kZWZpbmVkLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0cmVxdWVzdHM6IFt7XG5cdFx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIHBhcnRzOiBbXSB9LFxuXHRcdFx0XHR2YXJpYWJsZURhdGE6IHsgdmFyaWFibGVzOiBbXSB9LFxuXHRcdFx0XHR0aW1lc3RhbXA6IDFfNzUyXzAxMl8zMjFfMDAwLFxuXHRcdFx0XHRyZXNwb25zZTogW3sgdmFsdWU6ICdyZXNwb25zZScsIGlzVHJ1c3RlZDogZmFsc2UgfV0sXG5cdFx0XHRcdHJlc3VsdDogeyBkZXRhaWxzOiAnR1BULTUuNiBTb2wnIH0sXG5cdFx0XHRcdG1vZGVsU3RhdGU6IHsgdmFsdWU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSwgY29tcGxldGVkQXQgfSxcblx0XHRcdFx0cmVzcG9uc2VUaW1lc3RhbXA6IDFfNzUyXzAxMl8zMjJfMDAwLFxuXHRcdFx0XHRlbGFwc2VkTXM6IDgzXzAwMCxcblx0XHRcdFx0Y29tcGxldGlvblRva2VuczogMV8yMzQsXG5cdFx0XHR9XSxcblx0XHRcdHJlc3BvbmRlclVzZXJuYW1lOiAnYm90Jyxcblx0XHR9O1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNb2RlbCxcblx0XHRcdHsgdmFsdWU6IHNlcmlhbGl6YWJsZURhdGEsIHNlcmlhbGl6ZXI6IHVuZGVmaW5lZCEgfSxcblx0XHRcdHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9XG5cdFx0KSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IG1vZGVsLmdldFJlcXVlc3RzKClbMF0ucmVzcG9uc2U7XG5cdFx0Y29uc3Qgc2VyaWFsaXplZFJlc3BvbnNlID0gbW9kZWwudG9KU09OKCkucmVxdWVzdHNbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkZXRhaWxzOiByZXNwb25zZT8ucmVzdWx0Py5kZXRhaWxzLFxuXHRcdFx0cmVxdWVzdFRpbWVzdGFtcDogbW9kZWwuZ2V0UmVxdWVzdHMoKVswXS50aW1lc3RhbXAsXG5cdFx0XHR2aXNpYmxlUmVxdWVzdFRpbWVzdGFtcDogbW9kZWwuZ2V0UmVxdWVzdHMoKVswXS5yZXF1ZXN0VGltZXN0YW1wLFxuXHRcdFx0cmVzcG9uc2VUaW1lc3RhbXA6IHJlc3BvbnNlPy50aW1lc3RhbXAsXG5cdFx0XHRjb21wbGV0aW9uVGltZXN0YW1wOiByZXNwb25zZT8uY29tcGxldGlvblRpbWVzdGFtcCxcblx0XHRcdGVsYXBzZWRNczogcmVzcG9uc2U/LmVsYXBzZWRNcyxcblx0XHRcdGNvbXBsZXRpb25Ub2tlbnM6IHJlc3BvbnNlPy5jb21wbGV0aW9uVG9rZW5Db3VudCxcblx0XHRcdHNlcmlhbGl6ZWREZXRhaWxzOiBzZXJpYWxpemVkUmVzcG9uc2UucmVzdWx0Py5kZXRhaWxzLFxuXHRcdFx0c2VyaWFsaXplZFJlcXVlc3RUaW1lc3RhbXA6IHNlcmlhbGl6ZWRSZXNwb25zZS50aW1lc3RhbXAsXG5cdFx0XHRzZXJpYWxpemVkUmVzcG9uc2VUaW1lc3RhbXA6IHNlcmlhbGl6ZWRSZXNwb25zZS5yZXNwb25zZVRpbWVzdGFtcCxcblx0XHRcdHNlcmlhbGl6ZWRFbGFwc2VkTXM6IHNlcmlhbGl6ZWRSZXNwb25zZS5lbGFwc2VkTXMsXG5cdFx0XHRzZXJpYWxpemVkQ29tcGxldGlvblRva2Vuczogc2VyaWFsaXplZFJlc3BvbnNlLmNvbXBsZXRpb25Ub2tlbnMsXG5cdFx0fSwge1xuXHRcdFx0ZGV0YWlsczogJ0dQVC01LjYgU29sJyxcblx0XHRcdHJlcXVlc3RUaW1lc3RhbXA6IDFfNzUyXzAxMl8zMjFfMDAwLFxuXHRcdFx0dmlzaWJsZVJlcXVlc3RUaW1lc3RhbXA6IDFfNzUyXzAxMl8zMjFfMDAwLFxuXHRcdFx0cmVzcG9uc2VUaW1lc3RhbXA6IDFfNzUyXzAxMl8zMjJfMDAwLFxuXHRcdFx0Y29tcGxldGlvblRpbWVzdGFtcDogY29tcGxldGVkQXQsXG5cdFx0XHRlbGFwc2VkTXM6IDgzXzAwMCxcblx0XHRcdGNvbXBsZXRpb25Ub2tlbnM6IDFfMjM0LFxuXHRcdFx0c2VyaWFsaXplZERldGFpbHM6ICdHUFQtNS42IFNvbCcsXG5cdFx0XHRzZXJpYWxpemVkUmVxdWVzdFRpbWVzdGFtcDogMV83NTJfMDEyXzMyMV8wMDAsXG5cdFx0XHRzZXJpYWxpemVkUmVzcG9uc2VUaW1lc3RhbXA6IDFfNzUyXzAxMl8zMjJfMDAwLFxuXHRcdFx0c2VyaWFsaXplZEVsYXBzZWRNczogODNfMDAwLFxuXHRcdFx0c2VyaWFsaXplZENvbXBsZXRpb25Ub2tlbnM6IDFfMjM0LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwZXJzaXN0cyByZWFzb25pbmcgZHVyYXRpb24gd2hlbiByZXNwb25zZSBwcm9ncmVzcyBtb3ZlcyBvbicsICgpID0+IHtcblx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoeyBub3c6IDEwMDAgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBraW5kOiAndGhpbmtpbmcnLCB2YWx1ZTogWydGaXJzdCcsICcgdGhvdWdodCddIH0pO1xuXHRcdFx0Y2xvY2sudGljaygxNTAwKTtcblx0XHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdEb25lJykgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzcG9uc2UudmFsdWUubWFwKHBhcnQgPT4gcGFydC5raW5kID09PSAndGhpbmtpbmcnID8ge1xuXHRcdFx0XHRraW5kOiBwYXJ0LmtpbmQsXG5cdFx0XHRcdHZhbHVlOiBwYXJ0LnZhbHVlLFxuXHRcdFx0XHRyZWFzb25pbmdEdXJhdGlvbk1zOiBwYXJ0LnJlYXNvbmluZ0R1cmF0aW9uTXMsXG5cdFx0XHR9IDogeyBraW5kOiBwYXJ0LmtpbmQgfSksIFtcblx0XHRcdFx0eyBraW5kOiAndGhpbmtpbmcnLCB2YWx1ZTogWydGaXJzdCcsICcgdGhvdWdodCddLCByZWFzb25pbmdEdXJhdGlvbk1zOiAxNTAwIH0sXG5cdFx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcgfSxcblx0XHRcdF0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbG9jay5yZXN0b3JlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdwZXJzaXN0cyByZWFzb25pbmcgZHVyYXRpb24gd2hlbiByZXNwb25zZSBjb21wbGV0ZXMgd2l0aG91dCBhIHJlbmRlcmVkIHJvdycsICgpID0+IHtcblx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoeyBub3c6IDEwMDAgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblx0XHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsLmFkZFJlcXVlc3QoeyB0ZXh0LCBwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCB0ZXh0Lmxlbmd0aCksIG5ldyBSYW5nZSgxLCB0ZXh0Lmxlbmd0aCwgMSwgdGV4dC5sZW5ndGgpLCB0ZXh0KV0gfSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICd0aGlua2luZycsIHZhbHVlOiAnU3RpbGwgcmVhc29uaW5nJyB9KTtcblx0XHRcdGNsb2NrLnRpY2soMjMwMCk7XG5cdFx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5jb21wbGV0ZSgpO1xuXG5cdFx0XHRjb25zdCB0aGlua2luZ1BhcnQgPSByZXF1ZXN0LnJlc3BvbnNlPy5lbnRpcmVSZXNwb25zZS52YWx1ZS5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSAndGhpbmtpbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlua2luZ1BhcnQ/LmtpbmQgPT09ICd0aGlua2luZycgPyB0aGlua2luZ1BhcnQucmVhc29uaW5nRHVyYXRpb25NcyA6IHVuZGVmaW5lZCwgMjMwMCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsb2NrLnJlc3RvcmUoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZENvbXBsZXRlUmVxdWVzdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbDEgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgdGV4dCA9ICdoZWxsbyc7XG5cdFx0Y29uc3QgcmVxdWVzdDEgPSBtb2RlbDEuYWRkUmVxdWVzdCh7IHRleHQsIHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSwgbmV3IFJhbmdlKDEsIHRleHQubGVuZ3RoLCAxLCB0ZXh0Lmxlbmd0aCksIHRleHQpXSB9LCB7IHZhcmlhYmxlczogW10gfSwgMCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdDEuaXNDb21wbGV0ZUFkZGVkUmVxdWVzdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3QxLnJlc3BvbnNlIS5pc0NvbXBsZXRlQWRkZWRSZXF1ZXN0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdDEuc2hvdWxkQmVSZW1vdmVkT25TZW5kLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0MS5yZXNwb25zZSEuc2hvdWxkQmVSZW1vdmVkT25TZW5kLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXNlcmlhbGl6YXRpb24gbWFya3MgdW51c2VkIHF1ZXN0aW9uIGNhcm91c2VscyBhcyB1c2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcmlhbGl6YWJsZURhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTMgPSB7XG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0c2Vzc2lvbklkOiAndGVzdC1zZXNzaW9uJyxcblx0XHRcdGNyZWF0aW9uRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdGN1c3RvbVRpdGxlOiB1bmRlZmluZWQsXG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXF1ZXN0czogW3tcblx0XHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgcGFydHM6IFtdIH0sXG5cdFx0XHRcdHZhcmlhYmxlRGF0YTogeyB2YXJpYWJsZXM6IFtdIH0sXG5cdFx0XHRcdHJlc3BvbnNlOiBbXG5cdFx0XHRcdFx0eyB2YWx1ZTogJ3NvbWUgdGV4dCcsIGlzVHJ1c3RlZDogZmFsc2UgfSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcgYXMgY29uc3QsXG5cdFx0XHRcdFx0XHRxdWVzdGlvbnM6IFt7IGlkOiAncTEnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnLCB0eXBlOiAndGV4dCcgYXMgY29uc3QgfV0sXG5cdFx0XHRcdFx0XHRhbGxvd1NraXA6IHRydWUsXG5cdFx0XHRcdFx0XHRyZXNvbHZlSWQ6ICdyZXNvbHZlMScsXG5cdFx0XHRcdFx0XHRpc1VzZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdG1vZGVsU3RhdGU6IHsgdmFsdWU6IDIgLyogUmVzcG9uc2VNb2RlbFN0YXRlLkNhbmNlbGxlZCAqLywgY29tcGxldGVkQXQ6IERhdGUubm93KCkgfSxcblx0XHRcdH1dLFxuXHRcdFx0cmVzcG9uZGVyVXNlcm5hbWU6ICdib3QnLFxuXHRcdH07XG5cblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TW9kZWwsXG5cdFx0XHR7IHZhbHVlOiBzZXJpYWxpemFibGVEYXRhLCBzZXJpYWxpemVyOiB1bmRlZmluZWQhIH0sXG5cdFx0XHR7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdHMgPSBtb2RlbC5nZXRSZXF1ZXN0cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0cy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVxdWVzdHNbMF0ucmVzcG9uc2UhO1xuXG5cdFx0Ly8gVGhlIHF1ZXN0aW9uIGNhcm91c2VsIHNob3VsZCBiZSBtYXJrZWQgYXMgdXNlZCBhZnRlciBkZXNlcmlhbGl6YXRpb25cblx0XHRjb25zdCBjYXJvdXNlbFBhcnQgPSByZXNwb25zZS5yZXNwb25zZS52YWx1ZS5maW5kKHAgPT4gcC5raW5kID09PSAncXVlc3Rpb25DYXJvdXNlbCcpO1xuXHRcdGFzc2VydC5vayhjYXJvdXNlbFBhcnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXJvdXNlbFBhcnQuaXNVc2VkLCB0cnVlKTtcblxuXHRcdC8vIFRoZSByZXNwb25zZSBzaG91bGQgYmUgY29tcGxldGUgKG5vdCBzdHVjayBpbiBOZWVkc0lucHV0KVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5pc0NvbXBsZXRlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaW5wdXRNb2RlbC50b0pTT04gZmlsdGVycyBleHRlbnNpb24tY29udHJpYnV0ZWQgY29udGV4dHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgZmlsZUF0dGFjaG1lbnQ6IElDaGF0UmVxdWVzdEZpbGVFbnRyeSA9IHtcblx0XHRcdGtpbmQ6ICdmaWxlJyxcblx0XHRcdHZhbHVlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50cycpLFxuXHRcdFx0aWQ6ICdmaWxlLWlkJyxcblx0XHRcdG5hbWU6ICd0ZXN0LnRzJyxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RyaW5nQ29udGV4dFZhbHVlOiBTdHJpbmdDaGF0Q29udGV4dFZhbHVlID0ge1xuXHRcdFx0dmFsdWU6ICdwci1jb250ZW50Jyxcblx0XHRcdG5hbWU6ICdQUiAjMTIzJyxcblx0XHRcdGljb25QYXRoOiBDb2RpY29uLmdpdFB1bGxSZXF1ZXN0LFxuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ3ByOi8vMTIzJyksXG5cdFx0XHRoYW5kbGU6IDFcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RyaW5nQXR0YWNobWVudDogSUNoYXRSZXF1ZXN0U3RyaW5nVmFyaWFibGVFbnRyeSA9IHtcblx0XHRcdGtpbmQ6ICdzdHJpbmcnLFxuXHRcdFx0dmFsdWU6ICdwci1jb250ZW50Jyxcblx0XHRcdGlkOiAnc3RyaW5nLWlkJyxcblx0XHRcdG5hbWU6ICdQUiAjMTIzJyxcblx0XHRcdGljb25QYXRoOiBDb2RpY29uLmdpdFB1bGxSZXF1ZXN0LFxuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ3ByOi8vMTIzJyksXG5cdFx0XHRoYW5kbGU6IDFcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW1wbGljaXRXaXRoU3RyaW5nQ29udGV4dDogSUNoYXRSZXF1ZXN0SW1wbGljaXRWYXJpYWJsZUVudHJ5ID0ge1xuXHRcdFx0a2luZDogJ2ltcGxpY2l0Jyxcblx0XHRcdGlzRmlsZTogdHJ1ZSxcblx0XHRcdHZhbHVlOiBzdHJpbmdDb250ZXh0VmFsdWUsXG5cdFx0XHR1cmk6IFVSSS5wYXJzZSgncHI6Ly8xMjMnKSxcblx0XHRcdGlzU2VsZWN0aW9uOiBmYWxzZSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRpZDogJ2ltcGxpY2l0LXN0cmluZy1pZCcsXG5cdFx0XHRuYW1lOiAnUFIgQ29udGV4dCcsXG5cdFx0fTtcblxuXHRcdGNvbnN0IGltcGxpY2l0V2l0aFVyaTogSUNoYXRSZXF1ZXN0SW1wbGljaXRWYXJpYWJsZUVudHJ5ID0ge1xuXHRcdFx0a2luZDogJ2ltcGxpY2l0Jyxcblx0XHRcdGlzRmlsZTogdHJ1ZSxcblx0XHRcdHZhbHVlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vY3VycmVudC50cycpLFxuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vY3VycmVudC50cycpLFxuXHRcdFx0aXNTZWxlY3Rpb246IGZhbHNlLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGlkOiAnaW1wbGljaXQtdXJpLWlkJyxcblx0XHRcdG5hbWU6ICdjdXJyZW50LnRzJyxcblx0XHR9O1xuXG5cdFx0bW9kZWwuaW5wdXRNb2RlbC5zZXRTdGF0ZSh7XG5cdFx0XHRhdHRhY2htZW50czogW2ZpbGVBdHRhY2htZW50LCBzdHJpbmdBdHRhY2htZW50LCBpbXBsaWNpdFdpdGhTdHJpbmdDb250ZXh0LCBpbXBsaWNpdFdpdGhVcmldLFxuXHRcdFx0aW5wdXRUZXh0OiAndGVzdCdcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSBtb2RlbC5pbnB1dE1vZGVsLnRvSlNPTigpO1xuXHRcdGFzc2VydC5vayhzZXJpYWxpemVkKTtcblxuXHRcdC8vIFNob3VsZCBmaWx0ZXIgb3V0IHN0cmluZyBhdHRhY2htZW50cyBhbmQgaW1wbGljaXQgYXR0YWNobWVudHMgd2l0aCBTdHJpbmdDaGF0Q29udGV4dFZhbHVlXG5cdFx0Ly8gU2hvdWxkIGtlZXAgZmlsZSBhdHRhY2htZW50cyBhbmQgaW1wbGljaXQgYXR0YWNobWVudHMgd2l0aCBVUkkgdmFsdWVzXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJpYWxpemVkLmF0dGFjaG1lbnRzLCBbZmlsZUF0dGFjaG1lbnQsIGltcGxpY2l0V2l0aFVyaV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlSW5mbyByb3VuZHRyaXBzIHRocm91Z2ggc2VyaWFsaXphdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlSW5mbzogSUNoYXRSZXF1ZXN0TW9kZUluZm8gPSB7XG5cdFx0XHRraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRpc0J1aWx0aW46IGZhbHNlLFxuXHRcdFx0dGVsZW1ldHJ5TW9kZUlkOiAnY3VzdG9tJyxcblx0XHRcdG1vZGVJbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0bmFtZTogJ3BsYW4nLFxuXHRcdFx0XHRjb250ZW50OiAnWW91IGFyZSBhIHBsYW5uaW5nIGFnZW50Jyxcblx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0fSxcblx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHNlcmlhbGl6YWJsZURhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTMgPSB7XG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0c2Vzc2lvbklkOiAndGVzdC1tb2RlaW5mby1zZXNzaW9uJyxcblx0XHRcdGNyZWF0aW9uRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdGN1c3RvbVRpdGxlOiB1bmRlZmluZWQsXG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0XHRyZXF1ZXN0czogW3tcblx0XHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3BsYW4gc29tZXRoaW5nJywgcGFydHM6IFtdIH0sXG5cdFx0XHRcdHZhcmlhYmxlRGF0YTogeyB2YXJpYWJsZXM6IFtdIH0sXG5cdFx0XHRcdHJlc3BvbnNlOiBbeyB2YWx1ZTogJ0hlcmUgaXMgbXkgcGxhbicsIGlzVHJ1c3RlZDogZmFsc2UgfV0sXG5cdFx0XHRcdG1vZGVsU3RhdGU6IHsgdmFsdWU6IDEgLyogUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlICovLCBjb21wbGV0ZWRBdDogRGF0ZS5ub3coKSB9LFxuXHRcdFx0XHRtb2RlSW5mbyxcblx0XHRcdH1dLFxuXHRcdH07XG5cblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TW9kZWwsXG5cdFx0XHR7IHZhbHVlOiBzZXJpYWxpemFibGVEYXRhLCBzZXJpYWxpemVyOiB1bmRlZmluZWQhIH0sXG5cdFx0XHR7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdHMgPSBtb2RlbC5nZXRSZXF1ZXN0cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVxdWVzdHNbMF0ubW9kZUluZm8sIG1vZGVJbmZvKTtcblxuXHRcdC8vIFZlcmlmeSByb3VuZHRyaXAgdGhyb3VnaCB0b0V4cG9ydFxuXHRcdGNvbnN0IGV4cG9ydGVkID0gbW9kZWwudG9FeHBvcnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwb3J0ZWQucmVxdWVzdHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4cG9ydGVkLnJlcXVlc3RzWzBdLm1vZGVJbmZvLCBtb2RlSW5mbyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIGxlZ2FjeSB0b3AtbGV2ZWwgbW9kZWxDb25maWd1cmF0aW9uIGludG8gc2VsZWN0ZWRNb2RlbCAoYmFja3dhcmRzIGNvbXBhdCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGVnYWN5Q29uZmlnID0geyB0aGlua2luZ0VmZm9ydDogJ2hpZ2gnLCBjb250ZXh0U2l6ZTogMjAwMCB9O1xuXG5cdFx0Ly8gT2xkIGZvcm1hdDogbW9kZWxDb25maWd1cmF0aW9uIHdhcyBwZXJzaXN0ZWQgYXMgYSBzaWJsaW5nIG9mIHNlbGVjdGVkTW9kZWxcblx0XHQvLyByYXRoZXIgdGhhbiBuZXN0ZWQgaW5zaWRlIGl0LlxuXHRcdGNvbnN0IGxlZ2FjeUlucHV0U3RhdGUgPSB7XG5cdFx0XHRhdHRhY2htZW50czogW10sXG5cdFx0XHRjb250cmliOiB7fSxcblx0XHRcdGlucHV0VGV4dDogJ2RyYWZ0Jyxcblx0XHRcdHNlbGVjdGlvbnM6IFtdLFxuXHRcdFx0bW9kZTogeyBpZDogQ2hhdE1vZGVLaW5kLkFnZW50LCBraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQgfSxcblx0XHRcdHNlbGVjdGVkTW9kZWw6IHsgaWRlbnRpZmllcjogJ2NvcGlsb3QvZ3B0JywgbWV0YWRhdGE6IHsgbmFtZTogJ0dQVCcgfSB9LFxuXHRcdFx0bW9kZWxDb25maWd1cmF0aW9uOiBsZWdhY3lDb25maWcsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHNlcmlhbGl6YWJsZURhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTMgPSB7XG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0c2Vzc2lvbklkOiAnbGVnYWN5LW1vZGVsLWNvbmZpZy1zZXNzaW9uJyxcblx0XHRcdGNyZWF0aW9uRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdGN1c3RvbVRpdGxlOiB1bmRlZmluZWQsXG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0XHRyZXF1ZXN0czogW10sXG5cdFx0XHRpbnB1dFN0YXRlOiBsZWdhY3lJbnB1dFN0YXRlIGFzIHVua25vd24gYXMgSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUsXG5cdFx0fTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNb2RlbCxcblx0XHRcdHsgdmFsdWU6IHNlcmlhbGl6YWJsZURhdGEsIHNlcmlhbGl6ZXI6IHVuZGVmaW5lZCEgfSxcblx0XHRcdHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9XG5cdFx0KSk7XG5cblx0XHQvLyBMZWdhY3kgY29uZmlnIGlzIHJlY292ZXJlZCBpbnRvIHRoZSBpbi1tZW1vcnkgaW5wdXQgc3RhdGUuLi5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmlucHV0TW9kZWwuc3RhdGUuZ2V0KCk/Lm1vZGVsQ29uZmlndXJhdGlvbiwgbGVnYWN5Q29uZmlnKTtcblxuXHRcdC8vIC4uLmFuZCByZS1zZXJpYWxpemVzIGludG8gdGhlIG5ldyBuZXN0ZWQgc2hhcGUgd2l0aCBubyB0b3AtbGV2ZWwgZmllbGQuXG5cdFx0Y29uc3Qgc2VyaWFsaXplZCA9IG1vZGVsLmlucHV0TW9kZWwudG9KU09OKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJpYWxpemVkPy5zZWxlY3RlZE1vZGVsPy5tb2RlbENvbmZpZ3VyYXRpb24sIGxlZ2FjeUNvbmZpZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzZXJpYWxpemVkIGFzIHsgbW9kZWxDb25maWd1cmF0aW9uPzogdW5rbm93biB9KS5tb2RlbENvbmZpZ3VyYXRpb24sIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdSZXNwb25zZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtZXJnZWFibGUgbWFya2Rvd24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnbWFya2Rvd24xJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ21hcmtkb3duMicpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXNwb25zZS52YWx1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudG9TdHJpbmcoKSwgJ21hcmtkb3duMW1hcmtkb3duMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdub3QgbWVyZ2VhYmxlIG1hcmtkb3duJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdGNvbnN0IG1kMSA9IG5ldyBNYXJrZG93blN0cmluZygnbWFya2Rvd24xJyk7XG5cdFx0bWQxLnN1cHBvcnRIdG1sID0gdHJ1ZTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbWQxLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdtYXJrZG93bjInKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzcG9uc2UudmFsdWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzeXN0ZW0gbm90aWZpY2F0aW9uIHJlbWFpbnMgZGlzdGluY3QgZnJvbSBsYXRlciByZXNwb25zZSBjb250ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBraW5kOiAnc3lzdGVtTm90aWZpY2F0aW9uJywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdCYWNrZ3JvdW5kIGNvbW1hbmQgY29tcGxldGVkJykgfSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ0ZpbmlzaGVkIHByb2Nlc3Npbmcgb3V0cHV0LicpIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRraW5kczogcmVzcG9uc2UudmFsdWUubWFwKHBhcnQgPT4gcGFydC5raW5kKSxcblx0XHRcdHRleHQ6IHJlc3BvbnNlLnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0a2luZHM6IFsnc3lzdGVtTm90aWZpY2F0aW9uJywgJ21hcmtkb3duQ29udGVudCddLFxuXHRcdFx0dGV4dDogJ0JhY2tncm91bmQgY29tbWFuZCBjb21wbGV0ZWRcXG5cXG5GaW5pc2hlZCBwcm9jZXNzaW5nIG91dHB1dC4nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmxpbmUgcmVmZXJlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ3RleHQgYmVmb3JlICcpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgaW5saW5lUmVmZXJlbmNlOiBVUkkucGFyc2UoJ2h0dHBzOi8vbWljcm9zb2Z0LmNvbS8nKSwga2luZDogJ2lubGluZVJlZmVyZW5jZScgfSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnIHRleHQgYWZ0ZXInKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzcG9uc2UudmFsdWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnRvU3RyaW5nKCksICd0ZXh0IGJlZm9yZSBodHRwczovL21pY3Jvc29mdC5jb20vIHRleHQgYWZ0ZXInKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIGlubGluZSByZWZlcmVuY2UgdXBkYXRlcyBleGlzdGluZyByZXNwb25zZSBjb250ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvZm9vLnRzJyk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdHJlc29sdmVJZDogJ3Jlc29sdmUxJyxcblx0XHRcdGlubGluZVJlZmVyZW5jZTogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkgfSxcblx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdH0pO1xuXG5cdFx0bGV0IGNoYW5nZXMgPSAwO1xuXHRcdHN0b3JlLmFkZChyZXNwb25zZS5vbkRpZENoYW5nZVZhbHVlKCgpID0+IGNoYW5nZXMrKykpO1xuXG5cdFx0Y29uc3QgZGlkUmVzb2x2ZSA9IHJlc3BvbnNlLnJlc29sdmVJbmxpbmVSZWZlcmVuY2UoJ3Jlc29sdmUxJywge1xuXHRcdFx0a2luZDogJ2lubGluZVJlZmVyZW5jZScsXG5cdFx0XHRpbmxpbmVSZWZlcmVuY2U6IHtcblx0XHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0XHRcdGtpbmQ6IFN5bWJvbEtpbmQuQ2xhc3MsXG5cdFx0XHRcdGxvY2F0aW9uOiB7IHVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgyLCA3LCAyLCAxMCkgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSByZXNwb25zZS52YWx1ZVswXTtcblx0XHRjb25zdCByZXNvbHZlZFJlZmVyZW5jZSA9IHJlc29sdmVkLmtpbmQgPT09ICdpbmxpbmVSZWZlcmVuY2UnID8gcmVzb2x2ZWQuaW5saW5lUmVmZXJlbmNlIDogdW5kZWZpbmVkO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaWRSZXNvbHZlLFxuXHRcdFx0Y2hhbmdlcyxcblx0XHRcdHJlc3BvbnNlVGV4dDogcmVzcG9uc2UudG9TdHJpbmcoKSxcblx0XHRcdHJlc29sdmVkUmVmZXJlbmNlLFxuXHRcdH0sIHtcblx0XHRcdGRpZFJlc29sdmU6IHRydWUsXG5cdFx0XHRjaGFuZ2VzOiAxLFxuXHRcdFx0cmVzcG9uc2VUZXh0OiAnYEZvb2AnLFxuXHRcdFx0cmVzb2x2ZWRSZWZlcmVuY2U6IHtcblx0XHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0XHRcdGtpbmQ6IFN5bWJvbEtpbmQuQ2xhc3MsXG5cdFx0XHRcdGxvY2F0aW9uOiB7IHVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgyLCA3LCAyLCAxMCkgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgaW5saW5lIHJlZmVyZW5jZSB1cGRhdGVzIGRpc3BsYXkgbmFtZSB3aGVuIHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvZm9vLnRzJyk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdHJlc29sdmVJZDogJ3Jlc29sdmUxJyxcblx0XHRcdGlubGluZVJlZmVyZW5jZTogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkgfSxcblx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGlkUmVzb2x2ZSA9IHJlc3BvbnNlLnJlc29sdmVJbmxpbmVSZWZlcmVuY2UoJ3Jlc29sdmUxJywge1xuXHRcdFx0a2luZDogJ2lubGluZVJlZmVyZW5jZScsXG5cdFx0XHRpbmxpbmVSZWZlcmVuY2U6IHtcblx0XHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0XHRcdGtpbmQ6IFN5bWJvbEtpbmQuQ2xhc3MsXG5cdFx0XHRcdGxvY2F0aW9uOiB7IHVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgyLCA3LCAyLCAxMCkgfSxcblx0XHRcdH0sXG5cdFx0XHRuYW1lOiAnUmVzb2x2ZWQgRm9vJyxcblx0XHR9KTtcblx0XHRjb25zdCByZXNvbHZlZCA9IHJlc3BvbnNlLnZhbHVlWzBdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaWRSZXNvbHZlLFxuXHRcdFx0ZGlzcGxheU5hbWU6IHJlc29sdmVkLmtpbmQgPT09ICdpbmxpbmVSZWZlcmVuY2UnID8gcmVzb2x2ZWQubmFtZSA6IHVuZGVmaW5lZCxcblx0XHRcdHJlc3BvbnNlVGV4dDogcmVzcG9uc2UudG9TdHJpbmcoKSxcblx0XHR9LCB7XG5cdFx0XHRkaWRSZXNvbHZlOiB0cnVlLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdSZXNvbHZlZCBGb28nLFxuXHRcdFx0cmVzcG9uc2VUZXh0OiAnYEZvb2AnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIGlubGluZSByZWZlcmVuY2UgcmV0dXJucyBmYWxzZSBmb3IgYW4gdW5rbm93biByZXNvbHZlIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvZm9vLnRzJyk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdHJlc29sdmVJZDogJ3Jlc29sdmUxJyxcblx0XHRcdGlubGluZVJlZmVyZW5jZTogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkgfSxcblx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdH0pO1xuXG5cdFx0bGV0IGNoYW5nZXMgPSAwO1xuXHRcdHN0b3JlLmFkZChyZXNwb25zZS5vbkRpZENoYW5nZVZhbHVlKCgpID0+IGNoYW5nZXMrKykpO1xuXG5cdFx0Y29uc3QgZGlkUmVzb2x2ZSA9IHJlc3BvbnNlLnJlc29sdmVJbmxpbmVSZWZlcmVuY2UoJ21pc3NpbmcnLCB7XG5cdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdGlubGluZVJlZmVyZW5jZToge1xuXHRcdFx0XHRuYW1lOiAnRm9vJyxcblx0XHRcdFx0a2luZDogU3ltYm9sS2luZC5DbGFzcyxcblx0XHRcdFx0bG9jYXRpb246IHsgdXJpLCByYW5nZTogbmV3IFJhbmdlKDIsIDcsIDIsIDEwKSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlkUmVzb2x2ZSxcblx0XHRcdGNoYW5nZXMsXG5cdFx0XHRyZXNwb25zZVRleHQ6IHJlc3BvbnNlLnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0ZGlkUmVzb2x2ZTogZmFsc2UsXG5cdFx0XHRjaGFuZ2VzOiAwLFxuXHRcdFx0cmVzcG9uc2VUZXh0OiAnZm9vLnRzJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uc29saWRhdGVkIGVkaXQgc3VtbWFyeScsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdTb21lIGNvbnRlbnQgYmVmb3JlIGVkaXRzJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBraW5kOiAndGV4dEVkaXRHcm91cCcsIHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL2ZpbGUxLnRzJyksIGVkaXRzOiBbXSwgc3RhdGU6IHVuZGVmaW5lZCwgZG9uZTogdHJ1ZSB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsga2luZDogJ3RleHRFZGl0R3JvdXAnLCB1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy9maWxlMi50cycpLCBlZGl0czogW10sIHN0YXRlOiB1bmRlZmluZWQsIGRvbmU6IHRydWUgfSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnU29tZSBjb250ZW50IGFmdGVyIGVkaXRzJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXG5cdFx0Ly8gU2hvdWxkIGhhdmUgc2luZ2xlIFwiTWFkZSBjaGFuZ2VzLlwiIGF0IHRoZSBlbmQgaW5zdGVhZCBvZiBtdWx0aXBsZSBlbnRyaWVzXG5cdFx0Y29uc3QgcmVzcG9uc2VTdHJpbmcgPSByZXNwb25zZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IG1hZGVDaGFuZ2VzQ291bnQgPSAocmVzcG9uc2VTdHJpbmcubWF0Y2goL01hZGUgY2hhbmdlc1xcLi9nKSB8fCBbXSkubGVuZ3RoO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYWRlQ2hhbmdlc0NvdW50LCAxLCAnU2hvdWxkIGhhdmUgZXhhY3RseSBvbmUgXCJNYWRlIGNoYW5nZXMuXCIgbWVzc2FnZScpO1xuXHRcdGFzc2VydC5vayhyZXNwb25zZVN0cmluZy5pbmNsdWRlcygnU29tZSBjb250ZW50IGJlZm9yZSBlZGl0cycpLCAnU2hvdWxkIGluY2x1ZGUgY29udGVudCBiZWZvcmUgZWRpdHMnKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2VTdHJpbmcuaW5jbHVkZXMoJ1NvbWUgY29udGVudCBhZnRlciBlZGl0cycpLCAnU2hvdWxkIGluY2x1ZGUgY29udGVudCBhZnRlciBlZGl0cycpO1xuXHRcdGFzc2VydC5vayhyZXNwb25zZVN0cmluZy5lbmRzV2l0aCgnTWFkZSBjaGFuZ2VzLicpLCAnU2hvdWxkIGVuZCB3aXRoIFwiTWFkZSBjaGFuZ2VzLlwiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vIGVkaXQgc3VtbWFyeSB3aGVuIG5vIGVkaXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ1NvbWUgY29udGVudCcpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdNb3JlIGNvbnRlbnQnKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cblx0XHQvLyBTaG91bGQgbm90IGhhdmUgXCJNYWRlIGNoYW5nZXMuXCIgd2hlbiB0aGVyZSBhcmUgbm8gZWRpdCBncm91cHNcblx0XHRjb25zdCByZXNwb25zZVN0cmluZyA9IHJlc3BvbnNlLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXNwb25zZVN0cmluZy5pbmNsdWRlcygnTWFkZSBjaGFuZ2VzLicpLCAnU2hvdWxkIG5vdCBpbmNsdWRlIFwiTWFkZSBjaGFuZ2VzLlwiIHdoZW4gbm8gZWRpdHMgcHJlc2VudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZVN0cmluZywgJ1NvbWUgY29udGVudE1vcmUgY29udGVudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25zb2xpZGF0ZWQgZWRpdCBzdW1tYXJ5IHdpdGggY2xlYXIgb3BlcmF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ0luaXRpYWwgY29udGVudCcpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsga2luZDogJ3RleHRFZGl0R3JvdXAnLCB1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy9maWxlMS50cycpLCBlZGl0czogW10sIHN0YXRlOiB1bmRlZmluZWQsIGRvbmU6IHRydWUgfSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGtpbmQ6ICdjbGVhclRvUHJldmlvdXNUb29sSW52b2NhdGlvbicsIHJlYXNvbjogMSB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdDb250ZW50IGFmdGVyIGNsZWFyJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBraW5kOiAndGV4dEVkaXRHcm91cCcsIHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL2ZpbGUyLnRzJyksIGVkaXRzOiBbXSwgc3RhdGU6IHVuZGVmaW5lZCwgZG9uZTogdHJ1ZSB9KTtcblxuXHRcdC8vIFNob3VsZCBvbmx5IHNob3cgXCJNYWRlIGNoYW5nZXMuXCIgZm9yIGVkaXRzIGFmdGVyIHRoZSBjbGVhciBvcGVyYXRpb25cblx0XHRjb25zdCByZXNwb25zZVN0cmluZyA9IHJlc3BvbnNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgbWFkZUNoYW5nZXNDb3VudCA9IChyZXNwb25zZVN0cmluZy5tYXRjaCgvTWFkZSBjaGFuZ2VzXFwuL2cpIHx8IFtdKS5sZW5ndGg7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hZGVDaGFuZ2VzQ291bnQsIDEsICdTaG91bGQgaGF2ZSBleGFjdGx5IG9uZSBcIk1hZGUgY2hhbmdlcy5cIiBtZXNzYWdlIGFmdGVyIGNsZWFyJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3BvbnNlU3RyaW5nLmluY2x1ZGVzKCdDb250ZW50IGFmdGVyIGNsZWFyJyksICdTaG91bGQgaW5jbHVkZSBjb250ZW50IGFmdGVyIGNsZWFyJyk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXNwb25zZVN0cmluZy5pbmNsdWRlcygnSW5pdGlhbCBjb250ZW50JyksICdTaG91bGQgbm90IGluY2x1ZGUgY29udGVudCBiZWZvcmUgY2xlYXInKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2VTdHJpbmcuZW5kc1dpdGgoJ01hZGUgY2hhbmdlcy4nKSwgJ1Nob3VsZCBlbmQgd2l0aCBcIk1hZGUgY2hhbmdlcy5cIicpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXh0RWRpdCBtZXJnZXMgZWRpdHMgZm9yIHNhbWUgVVJJIHdoZW4gbm90IGRvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL2ZpbGUxLnRzJyk7XG5cblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICd0ZXh0RWRpdCcsXG5cdFx0XHR1cmksXG5cdFx0XHRlZGl0czogW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJ2VkaXQxJyB9XSxcblx0XHRcdGRvbmU6IGZhbHNlLFxuXHRcdFx0aXNFeHRlcm5hbEVkaXQ6IHRydWVcblx0XHR9KTtcblxuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ3RleHRFZGl0Jyxcblx0XHRcdHVyaSxcblx0XHRcdGVkaXRzOiBbeyByYW5nZTogbmV3IFJhbmdlKDIsIDEsIDIsIDEpLCB0ZXh0OiAnZWRpdDInIH1dLFxuXHRcdFx0ZG9uZTogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGV4dEVkaXRHcm91cHMgPSByZXNwb25zZS52YWx1ZS5maWx0ZXIocCA9PiBwLmtpbmQgPT09ICd0ZXh0RWRpdEdyb3VwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRFZGl0R3JvdXBzLmxlbmd0aCwgMSwgJ1Nob3VsZCBoYXZlIGV4YWN0bHkgb25lIHRleHRFZGl0R3JvdXAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEVkaXRHcm91cHNbMF0uZWRpdHMubGVuZ3RoLCAyLCAnU2hvdWxkIGhhdmUgdHdvIGVkaXQgYmF0Y2hlcyBtZXJnZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEVkaXRHcm91cHNbMF0uZG9uZSwgdHJ1ZSwgJ1Nob3VsZCBiZSBtYXJrZWQgYXMgZG9uZSBhZnRlciBmaW5hbCBlZGl0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRFZGl0R3JvdXBzWzBdLmlzRXh0ZXJuYWxFZGl0LCB0cnVlLCAnU2hvdWxkIHByZXNlcnZlIGlzRXh0ZXJuYWxFZGl0IGZsYWcgZnJvbSBmaXJzdCBlZGl0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RleHRFZGl0IGRvZXMgbm90IG1lcmdlIGVkaXRzIHdoZW4gcHJldmlvdXMgaXMgZG9uZScsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vZmlsZTEudHMnKTtcblxuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ3RleHRFZGl0Jyxcblx0XHRcdHVyaSxcblx0XHRcdGVkaXRzOiBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCB0ZXh0OiAnZWRpdDEnIH1dLFxuXHRcdFx0ZG9uZTogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAndGV4dEVkaXQnLFxuXHRcdFx0dXJpLFxuXHRcdFx0ZWRpdHM6IFt7IHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMiwgMSksIHRleHQ6ICdlZGl0MicgfV0sXG5cdFx0XHRkb25lOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0ZXh0RWRpdEdyb3VwcyA9IHJlc3BvbnNlLnZhbHVlLmZpbHRlcihwID0+IHAua2luZCA9PT0gJ3RleHRFZGl0R3JvdXAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEVkaXRHcm91cHMubGVuZ3RoLCAyLCAnU2hvdWxkIGhhdmUgdHdvIHNlcGFyYXRlIHRleHRFZGl0R3JvdXBzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RleHRFZGl0IGRvZXMgbm90IG1lcmdlIGVkaXRzIGZvciBkaWZmZXJlbnQgVVJJcycsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblxuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ3RleHRFZGl0Jyxcblx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL2ZpbGUxLnRzJyksXG5cdFx0XHRlZGl0czogW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJ2VkaXQxJyB9XSxcblx0XHRcdGRvbmU6IGZhbHNlXG5cdFx0fSk7XG5cblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICd0ZXh0RWRpdCcsXG5cdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy9maWxlMi50cycpLFxuXHRcdFx0ZWRpdHM6IFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRleHQ6ICdlZGl0MicgfV0sXG5cdFx0XHRkb25lOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0ZXh0RWRpdEdyb3VwcyA9IHJlc3BvbnNlLnZhbHVlLmZpbHRlcihwID0+IHAua2luZCA9PT0gJ3RleHRFZGl0R3JvdXAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEVkaXRHcm91cHMubGVuZ3RoLCAyLCAnU2hvdWxkIGhhdmUgdHdvIHNlcGFyYXRlIHRleHRFZGl0R3JvdXBzIGZvciBkaWZmZXJlbnQgVVJJcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdub3RlYm9va0VkaXQgbWVyZ2VzIGVkaXRzIGZvciBzYW1lIG5vdGVib29rIFVSSSB3aGVuIG5vdCBkb25lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdGNvbnN0IG5vdGVib29rVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL25vdGVib29rLmlweW5iJyk7XG5cblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICdub3RlYm9va0VkaXQnLFxuXHRcdFx0dXJpOiBub3RlYm9va1VyaSxcblx0XHRcdGVkaXRzOiBbeyBlZGl0VHlwZTogMSAvKiBDZWxsRWRpdFR5cGUuUmVwbGFjZSAqLywgaW5kZXg6IDAsIGNvdW50OiAwLCBjZWxsczogW10gfV0sXG5cdFx0XHRkb25lOiBmYWxzZSxcblx0XHRcdGlzRXh0ZXJuYWxFZGl0OiB0cnVlXG5cdFx0fSk7XG5cblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICdub3RlYm9va0VkaXQnLFxuXHRcdFx0dXJpOiBub3RlYm9va1VyaSxcblx0XHRcdGVkaXRzOiBbeyBlZGl0VHlwZTogMSAvKiBDZWxsRWRpdFR5cGUuUmVwbGFjZSAqLywgaW5kZXg6IDEsIGNvdW50OiAwLCBjZWxsczogW10gfV0sXG5cdFx0XHRkb25lOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRjb25zdCBub3RlYm9va0VkaXRHcm91cHMgPSByZXNwb25zZS52YWx1ZS5maWx0ZXIocCA9PiBwLmtpbmQgPT09ICdub3RlYm9va0VkaXRHcm91cCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9va0VkaXRHcm91cHMubGVuZ3RoLCAxLCAnU2hvdWxkIGhhdmUgZXhhY3RseSBvbmUgbm90ZWJvb2tFZGl0R3JvdXAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2tFZGl0R3JvdXBzWzBdLmVkaXRzLmxlbmd0aCwgMiwgJ1Nob3VsZCBoYXZlIHR3byBlZGl0IGJhdGNoZXMgbWVyZ2VkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rRWRpdEdyb3Vwc1swXS5kb25lLCB0cnVlLCAnU2hvdWxkIGJlIG1hcmtlZCBhcyBkb25lIGFmdGVyIGZpbmFsIGVkaXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2tFZGl0R3JvdXBzWzBdLmlzRXh0ZXJuYWxFZGl0LCB0cnVlLCAnU2hvdWxkIHByZXNlcnZlIGlzRXh0ZXJuYWxFZGl0IGZsYWcgZnJvbSBmaXJzdCBlZGl0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vdGVib29rRWRpdCBkb2VzIG5vdCBtZXJnZSBlZGl0cyB3aGVuIHByZXZpb3VzIGlzIGRvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0Y29uc3Qgbm90ZWJvb2tVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vbm90ZWJvb2suaXB5bmInKTtcblxuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ25vdGVib29rRWRpdCcsXG5cdFx0XHR1cmk6IG5vdGVib29rVXJpLFxuXHRcdFx0ZWRpdHM6IFt7IGVkaXRUeXBlOiAxIC8qIENlbGxFZGl0VHlwZS5SZXBsYWNlICovLCBpbmRleDogMCwgY291bnQ6IDAsIGNlbGxzOiBbXSB9XSxcblx0XHRcdGRvbmU6IHRydWVcblx0XHR9KTtcblxuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ25vdGVib29rRWRpdCcsXG5cdFx0XHR1cmk6IG5vdGVib29rVXJpLFxuXHRcdFx0ZWRpdHM6IFt7IGVkaXRUeXBlOiAxIC8qIENlbGxFZGl0VHlwZS5SZXBsYWNlICovLCBpbmRleDogMSwgY291bnQ6IDAsIGNlbGxzOiBbXSB9XSxcblx0XHRcdGRvbmU6IHRydWVcblx0XHR9KTtcblxuXHRcdGNvbnN0IG5vdGVib29rRWRpdEdyb3VwcyA9IHJlc3BvbnNlLnZhbHVlLmZpbHRlcihwID0+IHAua2luZCA9PT0gJ25vdGVib29rRWRpdEdyb3VwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rRWRpdEdyb3Vwcy5sZW5ndGgsIDIsICdTaG91bGQgaGF2ZSB0d28gc2VwYXJhdGUgbm90ZWJvb2tFZGl0R3JvdXBzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vdGVib29rRWRpdCBkb2VzIG5vdCBtZXJnZSBlZGl0cyBmb3IgZGlmZmVyZW50IG5vdGVib29rIFVSSXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICdub3RlYm9va0VkaXQnLFxuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vbm90ZWJvb2sxLmlweW5iJyksXG5cdFx0XHRlZGl0czogW3sgZWRpdFR5cGU6IDEgLyogQ2VsbEVkaXRUeXBlLlJlcGxhY2UgKi8sIGluZGV4OiAwLCBjb3VudDogMCwgY2VsbHM6IFtdIH1dLFxuXHRcdFx0ZG9uZTogZmFsc2Vcblx0XHR9KTtcblxuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ25vdGVib29rRWRpdCcsXG5cdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy9ub3RlYm9vazIuaXB5bmInKSxcblx0XHRcdGVkaXRzOiBbeyBlZGl0VHlwZTogMSAvKiBDZWxsRWRpdFR5cGUuUmVwbGFjZSAqLywgaW5kZXg6IDAsIGNvdW50OiAwLCBjZWxsczogW10gfV0sXG5cdFx0XHRkb25lOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRjb25zdCBub3RlYm9va0VkaXRHcm91cHMgPSByZXNwb25zZS52YWx1ZS5maWx0ZXIocCA9PiBwLmtpbmQgPT09ICdub3RlYm9va0VkaXRHcm91cCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9va0VkaXRHcm91cHMubGVuZ3RoLCAyLCAnU2hvdWxkIGhhdmUgdHdvIHNlcGFyYXRlIG5vdGVib29rRWRpdEdyb3VwcyBmb3IgZGlmZmVyZW50IFVSSXMnKTtcblx0fSk7XG5cblx0dGVzdCgndGV4dEVkaXQgdG8gbm90ZWJvb2sgY2VsbCBjcmVhdGVzIG5vdGVib29rRWRpdEdyb3VwJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdGNvbnN0IG5vdGVib29rVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL25vdGVib29rLmlweW5iJyk7XG5cdFx0Y29uc3QgY2VsbFVyaSA9IENlbGxVcmkuZ2VuZXJhdGUobm90ZWJvb2tVcmksIDEpO1xuXG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAndGV4dEVkaXQnLFxuXHRcdFx0dXJpOiBjZWxsVXJpLFxuXHRcdFx0ZWRpdHM6IFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRleHQ6ICdlZGl0MScgfV0sXG5cdFx0XHRkb25lOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0ZXh0RWRpdEdyb3VwcyA9IHJlc3BvbnNlLnZhbHVlLmZpbHRlcihwID0+IHAua2luZCA9PT0gJ3RleHRFZGl0R3JvdXAnKTtcblx0XHRjb25zdCBub3RlYm9va0VkaXRHcm91cHMgPSByZXNwb25zZS52YWx1ZS5maWx0ZXIocCA9PiBwLmtpbmQgPT09ICdub3RlYm9va0VkaXRHcm91cCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0RWRpdEdyb3Vwcy5sZW5ndGgsIDAsICdTaG91bGQgbm90IGhhdmUgdGV4dEVkaXRHcm91cCBmb3IgY2VsbCBlZGl0cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9va0VkaXRHcm91cHMubGVuZ3RoLCAxLCAnU2hvdWxkIGhhdmUgbm90ZWJvb2tFZGl0R3JvdXAgZm9yIGNlbGwgZWRpdHMnKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0ZXJuYWwgdGVybWluYWwgdG9vbCB1cGRhdGVzIHByZXNlcnZlIHRvb2xTcGVjaWZpY0RhdGEgd2hlbiBjb21wbGV0aW5nIGFuIGV4aXN0aW5nIGludm9jYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRsYW5ndWFnZTogJ2Jhc2gnLFxuXHRcdFx0Y29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICducG0gdGVzdCcgfSxcblx0XHRcdHRlcm1pbmFsQ29tbWFuZE91dHB1dDogeyB0ZXh0OiAnYWxsIGdyZWVuJyB9LFxuXHRcdFx0dGVybWluYWxDb21tYW5kU3RhdGU6IHsgZXhpdENvZGU6IDAgfSxcblx0XHR9O1xuXG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnZXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdydW5faW5fdGVybWluYWwnLFxuXHRcdFx0aXNDb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgbnBtIHRlc3QnLFxuXHRcdH0pO1xuXG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnZXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdydW5faW5fdGVybWluYWwnLFxuXHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gbnBtIHRlc3QnLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS52YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS52YWx1ZVswXS5raW5kLCAndG9vbEludm9jYXRpb24nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3BvbnNlLnZhbHVlWzBdLnRvb2xTcGVjaWZpY0RhdGEsIHRvb2xTcGVjaWZpY0RhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUocmVzcG9uc2UudmFsdWVbMF0pLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0ZXJuYWwgdGVybWluYWwgdG9vbCB1cGRhdGVzIHByZXNlcnZlIHRvb2xTcGVjaWZpY0RhdGEgd2hlbiBmaXJzdCBwdXNoZWQgYXMgY29tcGxldGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRsYW5ndWFnZTogJ2Jhc2gnLFxuXHRcdFx0Y29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICducG0gdGVzdCcgfSxcblx0XHRcdHRlcm1pbmFsQ29tbWFuZE91dHB1dDogeyB0ZXh0OiAnYWxsIGdyZWVuJyB9LFxuXHRcdFx0dGVybWluYWxDb21tYW5kU3RhdGU6IHsgZXhpdENvZGU6IDAgfSxcblx0XHR9O1xuXG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnZXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTInLFxuXHRcdFx0dG9vbE5hbWU6ICdydW5faW5fdGVybWluYWwnLFxuXHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBucG0gdGVzdCcsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIG5wbSB0ZXN0Jyxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudmFsdWUubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudmFsdWVbMF0ua2luZCwgJ3Rvb2xJbnZvY2F0aW9uJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNwb25zZS52YWx1ZVswXS50b29sU3BlY2lmaWNEYXRhLCB0b29sU3BlY2lmaWNEYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHJlc3BvbnNlLnZhbHVlWzBdKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3BvbnNlIHN0cmluZ2lmaWNhdGlvbiBwcmVmZXJzIHRlcm1pbmFsIGRpc3BsYXkgY29tbWFuZCBvdmVyIHNhbmRib3ggd3JhcHBlcicsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRjb25zdCBzYW5kYm94V3JhcHBlZENvbW1hbmQgPSBgRUxFQ1RST05fUlVOX0FTX05PREU9MSBUTVBESVI9XCIvdG1wL3ZzY29kZVwiIFwiQ29kZSAtIEluc2lkZXJzXCIgXCJzYW5kYm94LXJ1bnRpbWVcIiAtYyAnbnBtIHRlc3QnYDtcblx0XHRjb25zdCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0a2luZDogJ3Rlcm1pbmFsJyxcblx0XHRcdGxhbmd1YWdlOiAnYmFzaCcsXG5cdFx0XHRjb21tYW5kTGluZToge1xuXHRcdFx0XHRvcmlnaW5hbDogc2FuZGJveFdyYXBwZWRDb21tYW5kLFxuXHRcdFx0XHR0b29sRWRpdGVkOiBzYW5kYm94V3JhcHBlZENvbW1hbmQsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICducG0gdGVzdCcsXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0dGVybWluYWxDb21tYW5kT3V0cHV0OiB7IHRleHQ6ICdhbGwgZ3JlZW4nIH0sXG5cdFx0XHR0ZXJtaW5hbENvbW1hbmRTdGF0ZTogeyBleGl0Q29kZTogMCB9LFxuXHRcdH07XG5cblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICdleHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtZGlzcGxheS1jb21tYW5kJyxcblx0XHRcdHRvb2xOYW1lOiAncnVuX2luX3Rlcm1pbmFsJyxcblx0XHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIG5wbSB0ZXN0Jyxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXNwb25zZVN0cmluZyA9IHJlc3BvbnNlLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlU3RyaW5nLCAnUmFuIHRlcm1pbmFsIGNvbW1hbmQ6IG5wbSB0ZXN0Jyk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXNwb25zZVN0cmluZy5pbmNsdWRlcygnc2FuZGJveC1ydW50aW1lJykpO1xuXHRcdGFzc2VydC5vayghcmVzcG9uc2VTdHJpbmcuaW5jbHVkZXMoJ0VMRUNUUk9OX1JVTl9BU19OT0RFPTEnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3BvbnNlIHN0cmluZ2lmaWNhdGlvbiBwcmVmZXJzIHRlcm1pbmFsIHByZXNlbnRhdGlvbiBvdmVycmlkZSBvdmVyIGRpc3BsYXkgY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRjb25zdCBzYW5kYm94V3JhcHBlZENvbW1hbmQgPSBgRUxFQ1RST05fUlVOX0FTX05PREU9MSBUTVBESVI9XCIvdG1wL3ZzY29kZVwiIFwiQ29kZSAtIEluc2lkZXJzXCIgXCJzYW5kYm94LXJ1bnRpbWVcIiAtYyAncHl0aG9uIC1jIFwicHJpbnQoMSlcIidgO1xuXHRcdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0bGFuZ3VhZ2U6ICdweXRob24nLFxuXHRcdFx0Y29tbWFuZExpbmU6IHtcblx0XHRcdFx0b3JpZ2luYWw6IHNhbmRib3hXcmFwcGVkQ29tbWFuZCxcblx0XHRcdFx0dG9vbEVkaXRlZDogc2FuZGJveFdyYXBwZWRDb21tYW5kLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAncHl0aG9uIC1jIFwicHJpbnQoMSlcIicsXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0cHJlc2VudGF0aW9uT3ZlcnJpZGVzOiB7XG5cdFx0XHRcdGNvbW1hbmRMaW5lOiAncHJpbnQoMSknLFxuXHRcdFx0XHRsYW5ndWFnZTogJ3B5dGhvbicsXG5cdFx0XHR9LFxuXHRcdFx0dGVybWluYWxDb21tYW5kT3V0cHV0OiB7IHRleHQ6ICcxJyB9LFxuXHRcdFx0dGVybWluYWxDb21tYW5kU3RhdGU6IHsgZXhpdENvZGU6IDAgfSxcblx0XHR9O1xuXG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnZXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLXByZXNlbnRhdGlvbi1vdmVycmlkZScsXG5cdFx0XHR0b29sTmFtZTogJ3J1bl9pbl90ZXJtaW5hbCcsXG5cdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBweXRob24gY29tbWFuZCcsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VTdHJpbmcgPSByZXNwb25zZS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZVN0cmluZywgJ1JhbiB0ZXJtaW5hbCBjb21tYW5kOiBwcmludCgxKScpO1xuXHRcdGFzc2VydC5vayghcmVzcG9uc2VTdHJpbmcuaW5jbHVkZXMoJ3NhbmRib3gtcnVudGltZScpKTtcblx0XHRhc3NlcnQub2soIXJlc3BvbnNlU3RyaW5nLmluY2x1ZGVzKCdweXRob24gLWMgXCJwcmludCgxKVwiJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNwb25zZSBzdHJpbmdpZmljYXRpb24gdXNlcyB0ZXJtaW5hbCBwcmVzZW50YXRpb24gb3ZlcnJpZGUgZm9yIHJlc3VsdCBkZXRhaWxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdGNvbnN0IHNhbmRib3hXcmFwcGVkQ29tbWFuZCA9IGBFTEVDVFJPTl9SVU5fQVNfTk9ERT0xIFRNUERJUj1cIi90bXAvdnNjb2RlXCIgQ0xBVURFX1RNUERJUj1cIi90bXAvdnNjb2RlXCIgXCJDb2RlIC0gSW5zaWRlcnNcIiBcInNhbmRib3gtcnVudGltZVwiIC0tc2V0dGluZ3MgXCIvdG1wL3NldHRpbmdzLmpzb25cIiAtYyAncHl0aG9uIC1jIFwicHJpbnQoMSlcIidgO1xuXHRcdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0bGFuZ3VhZ2U6ICdweXRob24nLFxuXHRcdFx0Y29tbWFuZExpbmU6IHtcblx0XHRcdFx0b3JpZ2luYWw6ICdweXRob24gLWMgXCJwcmludCgxKVwiJyxcblx0XHRcdFx0dG9vbEVkaXRlZDogc2FuZGJveFdyYXBwZWRDb21tYW5kLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAncHl0aG9uIC1jIFwicHJpbnQoMSlcIicsXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0cHJlc2VudGF0aW9uT3ZlcnJpZGVzOiB7XG5cdFx0XHRcdGNvbW1hbmRMaW5lOiAncHJpbnQoMSknLFxuXHRcdFx0XHRsYW5ndWFnZTogJ3B5dGhvbicsXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICdleHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtcmVzdWx0LWRldGFpbHMnLFxuXHRcdFx0dG9vbE5hbWU6ICdydW5faW5fdGVybWluYWwnLFxuXHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gcHl0aG9uIGNvbW1hbmQnLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdHJlc3VsdERldGFpbHM6IHtcblx0XHRcdFx0aW5wdXQ6IHNhbmRib3hXcmFwcGVkQ29tbWFuZCxcblx0XHRcdFx0b3V0cHV0OiBbeyB0eXBlOiAnZW1iZWQnLCBpc1RleHQ6IHRydWUsIHZhbHVlOiAnMScgfV0sXG5cdFx0XHRcdGlzRXJyb3I6IHRydWUsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VTdHJpbmcgPSByZXNwb25zZS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZVN0cmluZywgJ1JhbiB0ZXJtaW5hbCBjb21tYW5kOiBwcmludCgxKVxcbkNvbXBsZXRlZCB3aXRoIGlucHV0OiBwcmludCgxKScpO1xuXHRcdGFzc2VydC5vayghcmVzcG9uc2VTdHJpbmcuaW5jbHVkZXMoJ3NhbmRib3gtcnVudGltZScpKTtcblx0XHRhc3NlcnQub2soIXJlc3BvbnNlU3RyaW5nLmluY2x1ZGVzKCdFTEVDVFJPTl9SVU5fQVNfTk9ERT0xJykpO1xuXHRcdGFzc2VydC5vayghcmVzcG9uc2VTdHJpbmcuaW5jbHVkZXMoJ3B5dGhvbiAtYyBcInByaW50KDEpXCInKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEZpbmFsUmVzcG9uc2UgcmV0dXJucyBsYXN0IGNvbnRpZ3VvdXMgbWFya2Rvd24gYWZ0ZXIgdG9vbCBjYWxsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ0Vhcmx5IHRleHQnKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnZXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdHRvb2xOYW1lOiAnc29tZV90b29sJyxcblx0XHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JhbiB0b29sJyxcblx0XHR9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdGaW5hbCB0ZXh0JyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmdldEZpbmFsUmVzcG9uc2UoKSwgJ0ZpbmFsIHRleHQnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RmluYWxSZXNwb25zZSBza2lwcyB0cmFpbGluZyBlbXB0eSBtYXJrZG93biBhbmQgdG9vbCBjYWxscycsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdCZWZvcmUgdG9vbCcpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICdleHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdzb21lX3Rvb2wnLFxuXHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmFuIHRvb2wnLFxuXHRcdH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ1RoZSBhbnN3ZXIgaXMgNDIuJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ2V4dGVybmFsVG9vbEludm9jYXRpb25VcGRhdGUnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMicsXG5cdFx0XHR0b29sTmFtZTogJ3NvbWVfdG9vbCcsXG5cdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSYW4gYW5vdGhlciB0b29sJyxcblx0XHR9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCcnKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuZ2V0RmluYWxSZXNwb25zZSgpLCAnVGhlIGFuc3dlciBpcyA0Mi4nKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RmluYWxSZXNwb25zZSBpbmNsdWRlcyBpbmxpbmUgcmVmZXJlbmNlcyBpbiBmaW5hbCBibG9jaycsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICdleHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdzb21lX3Rvb2wnLFxuXHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmFuIHRvb2wnLFxuXHRcdH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ1NlZSAnKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGlubGluZVJlZmVyZW5jZTogVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tLycpLCBraW5kOiAnaW5saW5lUmVmZXJlbmNlJyB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCcgZm9yIGRldGFpbHMuJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmdldEZpbmFsUmVzcG9uc2UoKSwgJ1NlZSBodHRwczovL2V4YW1wbGUuY29tLyBmb3IgZGV0YWlscy4nKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RmluYWxSZXNwb25zZSByZXR1cm5zIGVtcHR5IHN0cmluZyB3aGVuIG5vIG1hcmtkb3duJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ2V4dGVybmFsVG9vbEludm9jYXRpb25VcGRhdGUnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHR0b29sTmFtZTogJ3NvbWVfdG9vbCcsXG5cdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSYW4gdG9vbCcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuZ2V0RmluYWxSZXNwb25zZSgpLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEZpbmFsUmVzcG9uc2UgcmV0dXJucyBhbGwgbWFya2Rvd24gd2hlbiB0aGVyZSBhcmUgbm8gdG9vbCBjYWxscycsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdIZWxsbyAnKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnV29ybGQnKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuZ2V0RmluYWxSZXNwb25zZSgpLCAnSGVsbG8gV29ybGQnKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ25vcm1hbGl6ZVNlcmlhbGl6YWJsZUNoYXREYXRhJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd2MScsICgpID0+IHtcblx0XHRjb25zdCB2MURhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTEgPSB7XG5cdFx0XHRjcmVhdGlvbkRhdGU6IERhdGUubm93KCksXG5cdFx0XHRpbml0aWFsTG9jYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdHJlcXVlc3RzOiBbXSxcblx0XHRcdHJlc3BvbmRlclVzZXJuYW1lOiAnYm90Jyxcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24xJyxcblx0XHR9O1xuXG5cdFx0Y29uc3QgbmV3RGF0YSA9IG5vcm1hbGl6ZVNlcmlhbGl6YWJsZUNoYXREYXRhKHYxRGF0YSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld0RhdGEuY3JlYXRpb25EYXRlLCB2MURhdGEuY3JlYXRpb25EYXRlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3RGF0YS52ZXJzaW9uLCAzKTtcblx0fSk7XG5cblx0dGVzdCgndjInLCAoKSA9PiB7XG5cdFx0Y29uc3QgdjJEYXRhOiBJU2VyaWFsaXphYmxlQ2hhdERhdGEyID0ge1xuXHRcdFx0dmVyc2lvbjogMixcblx0XHRcdGNyZWF0aW9uRGF0ZTogMTAwLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRyZXF1ZXN0czogW10sXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uMScsXG5cdFx0XHRjb21wdXRlZFRpdGxlOiAnY29tcHV0ZWQgdGl0bGUnXG5cdFx0fTtcblxuXHRcdGNvbnN0IG5ld0RhdGEgPSBub3JtYWxpemVTZXJpYWxpemFibGVDaGF0RGF0YSh2MkRhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdEYXRhLnZlcnNpb24sIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdEYXRhLmNyZWF0aW9uRGF0ZSwgdjJEYXRhLmNyZWF0aW9uRGF0ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld0RhdGEuY3VzdG9tVGl0bGUsIHYyRGF0YS5jb21wdXRlZFRpdGxlKTtcblx0fSk7XG5cblx0dGVzdCgnb2xkIGJhZCBkYXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IHYxRGF0YTogSVNlcmlhbGl6YWJsZUNoYXREYXRhMSA9IHtcblx0XHRcdC8vIFRlc3RpbmcgdGhlIHNjZW5hcmlvIHdoZXJlIHRoZXNlIGFyZSBtaXNzaW5nXG5cdFx0XHRzZXNzaW9uSWQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRjcmVhdGlvbkRhdGU6IHVuZGVmaW5lZCEsXG5cblx0XHRcdGluaXRpYWxMb2NhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0cmVxdWVzdHM6IFtdLFxuXHRcdFx0cmVzcG9uZGVyVXNlcm5hbWU6ICdib3QnLFxuXHRcdH07XG5cblx0XHRjb25zdCBuZXdEYXRhID0gbm9ybWFsaXplU2VyaWFsaXphYmxlQ2hhdERhdGEodjFEYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3RGF0YS52ZXJzaW9uLCAzKTtcblx0XHRhc3NlcnQub2sobmV3RGF0YS5jcmVhdGlvbkRhdGUgPiAwKTtcblx0XHRhc3NlcnQub2sobmV3RGF0YS5zZXNzaW9uSWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd2MyB3aXRoIGJ1ZycsICgpID0+IHtcblx0XHRjb25zdCB2M0RhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTMgPSB7XG5cdFx0XHQvLyBUZXN0IGNhc2Ugd2hlcmUgb2xkIGRhdGEgd2FzIHdyb25nbHkgbm9ybWFsaXplZCBhbmQgdGhlc2UgZmllbGRzIHdlcmUgbWlzc2luZ1xuXHRcdFx0Y3JlYXRpb25EYXRlOiB1bmRlZmluZWQhLFxuXG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRyZXF1ZXN0czogW10sXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uMScsXG5cdFx0XHRjdXN0b21UaXRsZTogJ2NvbXB1dGVkIHRpdGxlJ1xuXHRcdH07XG5cblx0XHRjb25zdCBuZXdEYXRhID0gbm9ybWFsaXplU2VyaWFsaXphYmxlQ2hhdERhdGEodjNEYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3RGF0YS52ZXJzaW9uLCAzKTtcblx0XHRhc3NlcnQub2sobmV3RGF0YS5jcmVhdGlvbkRhdGUgPiAwKTtcblx0XHRhc3NlcnQub2sobmV3RGF0YS5zZXNzaW9uSWQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnaXNFeHBvcnRhYmxlU2Vzc2lvbkRhdGEnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3ZhbGlkIGV4cG9ydGFibGUgZGF0YScsICgpID0+IHtcblx0XHRjb25zdCB2YWxpZERhdGE6IElFeHBvcnRhYmxlQ2hhdERhdGEgPSB7XG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXF1ZXN0czogW10sXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0V4cG9ydGFibGVTZXNzaW9uRGF0YSh2YWxpZERhdGEpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCAtIG1pc3NpbmcgcmVxdWVzdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52YWxpZERhdGEgPSB7XG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0V4cG9ydGFibGVTZXNzaW9uRGF0YShpbnZhbGlkRGF0YSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCAtIHJlcXVlc3RzIG5vdCBhcnJheScsICgpID0+IHtcblx0XHRjb25zdCBpbnZhbGlkRGF0YSA9IHtcblx0XHRcdGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHJlcXVlc3RzOiAnbm90LWFuLWFycmF5Jyxcblx0XHRcdHJlc3BvbmRlclVzZXJuYW1lOiAnYm90Jyxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwb3J0YWJsZVNlc3Npb25EYXRhKGludmFsaWREYXRhKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZhbGlkIC0gbWlzc2luZyByZXNwb25kZXJVc2VybmFtZScsICgpID0+IHtcblx0XHRjb25zdCBpbnZhbGlkRGF0YSA9IHtcblx0XHRcdGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHJlcXVlc3RzOiBbXSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwb3J0YWJsZVNlc3Npb25EYXRhKGludmFsaWREYXRhKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZhbGlkIC0gcmVzcG9uZGVyVXNlcm5hbWUgbm90IHN0cmluZycsICgpID0+IHtcblx0XHRjb25zdCBpbnZhbGlkRGF0YSA9IHtcblx0XHRcdGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHJlcXVlc3RzOiBbXSxcblx0XHRcdHJlc3BvbmRlclVzZXJuYW1lOiAxMjMsXG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0V4cG9ydGFibGVTZXNzaW9uRGF0YShpbnZhbGlkRGF0YSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCAtIG51bGwnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwb3J0YWJsZVNlc3Npb25EYXRhKG51bGwpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludmFsaWQgLSB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwb3J0YWJsZVNlc3Npb25EYXRhKHVuZGVmaW5lZCksIGZhbHNlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2lzU2VyaWFsaXphYmxlU2Vzc2lvbkRhdGEnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3ZhbGlkIHNlcmlhbGl6YWJsZSBkYXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhbGlkRGF0YTogSVNlcmlhbGl6YWJsZUNoYXREYXRhMyA9IHtcblx0XHRcdHZlcnNpb246IDMsXG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uMScsXG5cdFx0XHRjcmVhdGlvbkRhdGU6IERhdGUubm93KCksXG5cdFx0XHRjdXN0b21UaXRsZTogdW5kZWZpbmVkLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0cmVxdWVzdHM6IFtdLFxuXHRcdFx0cmVzcG9uZGVyVXNlcm5hbWU6ICdib3QnLFxuXHRcdH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNTZXJpYWxpemFibGVTZXNzaW9uRGF0YSh2YWxpZERhdGEpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgndmFsaWQgLSB3aXRoIHVzZWRDb250ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhbGlkRGF0YTogSVNlcmlhbGl6YWJsZUNoYXREYXRhMyA9IHtcblx0XHRcdHZlcnNpb246IDMsXG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uMScsXG5cdFx0XHRjcmVhdGlvbkRhdGU6IERhdGUubm93KCksXG5cdFx0XHRjdXN0b21UaXRsZTogdW5kZWZpbmVkLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0cmVxdWVzdHM6IFt7XG5cdFx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0XHRtZXNzYWdlOiAndGVzdCcsXG5cdFx0XHRcdHZhcmlhYmxlRGF0YTogeyB2YXJpYWJsZXM6IFtdIH0sXG5cdFx0XHRcdHJlc3BvbnNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzZWRDb250ZXh0OiB7IGRvY3VtZW50czogW10sIGtpbmQ6ICd1c2VkQ29udGV4dCcgfVxuXHRcdFx0fV0sXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1NlcmlhbGl6YWJsZVNlc3Npb25EYXRhKHZhbGlkRGF0YSksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZhbGlkIC0gbWlzc2luZyBzZXNzaW9uSWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52YWxpZERhdGEgPSB7XG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0Y3JlYXRpb25EYXRlOiBEYXRlLm5vdygpLFxuXHRcdFx0Y3VzdG9tVGl0bGU6IHVuZGVmaW5lZCxcblx0XHRcdGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHJlcXVlc3RzOiBbXSxcblx0XHRcdHJlc3BvbmRlclVzZXJuYW1lOiAnYm90Jyxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzU2VyaWFsaXphYmxlU2Vzc2lvbkRhdGEoaW52YWxpZERhdGEpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludmFsaWQgLSBtaXNzaW5nIGNyZWF0aW9uRGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBpbnZhbGlkRGF0YSA9IHtcblx0XHRcdHZlcnNpb246IDMsXG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uMScsXG5cdFx0XHRjdXN0b21UaXRsZTogdW5kZWZpbmVkLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0cmVxdWVzdHM6IFtdLFxuXHRcdFx0cmVzcG9uZGVyVXNlcm5hbWU6ICdib3QnLFxuXHRcdH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNTZXJpYWxpemFibGVTZXNzaW9uRGF0YShpbnZhbGlkRGF0YSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCAtIG5vdCBleHBvcnRhYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGludmFsaWREYXRhID0ge1xuXHRcdFx0dmVyc2lvbjogMyxcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24xJyxcblx0XHRcdGNyZWF0aW9uRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdGN1c3RvbVRpdGxlOiB1bmRlZmluZWQsXG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXF1ZXN0czogJ25vdC1hbi1hcnJheScsXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1NlcmlhbGl6YWJsZVNlc3Npb25EYXRhKGludmFsaWREYXRhKSwgZmFsc2UpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdFJlc3BvbnNlTW9kZWwnLCAoKSA9PiB7XG5cdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uU2VydmljZSwgbmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEFnZW50U2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbmV3IE1vY2tDaGF0U2VydmljZSgpKTtcblx0fSk7XG5cblx0dGVzdCgndGltZXN0YW1wIGFuZCBjb25maXJtYXRpb25BZGp1c3RlZFRpbWVzdGFtcCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXG5cdFx0XHRjb25zdCB0ZXh0ID0gJ2hlbGxvJztcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gcmVxdWVzdC5yZXNwb25zZSE7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50aW1lc3RhbXAsIHN0YXJ0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5jb25maXJtYXRpb25BZGp1c3RlZFRpbWVzdGFtcC5nZXQoKSwgc3RhcnQpO1xuXG5cdFx0XHQvLyBBZHZhbmNlIHRpbWUsIG5vIHBlbmRpbmcgY29uZmlybWF0aW9uXG5cdFx0XHRjbG9jay50aWNrKDEwMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmNvbmZpcm1hdGlvbkFkanVzdGVkVGltZXN0YW1wLmdldCgpLCBzdGFydCk7XG5cblx0XHRcdC8vIEFkZCBwZW5kaW5nIGNvbmZpcm1hdGlvbiB2aWEgdG9vbCBpbnZvY2F0aW9uXG5cdFx0XHRjb25zdCB0b29sU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8YW55Pignc3RhdGUnLCB7IHR5cGU6IDEgLyogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiAqLywgY29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6ICdQbGVhc2UgY29uZmlybScgfSB9KTtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0XHRraW5kOiAndG9vbEludm9jYXRpb24nLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ2NhbGxpbmcgdG9vbCcsXG5cdFx0XHRcdHN0YXRlOiB0b29sU3RhdGVcblx0XHRcdH0gYXMgUGFydGlhbDxJQ2hhdFRvb2xJbnZvY2F0aW9uPiBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uO1xuXG5cdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHRvb2xJbnZvY2F0aW9uKTtcblxuXHRcdFx0Ly8gQWR2YW5jZSB0aW1lIHdoaWxlIHBlbmRpbmdcblx0XHRcdGNsb2NrLnRpY2soMjAwMCk7XG5cdFx0XHQvLyBUaW1lc3RhbXAgc2hvdWxkIHN0aWxsIGJlIHN0YXJ0IChpdCBpbmNsdWRlcyB0aGUgd2FpdCB0aW1lIHdoaWxlIHdhaXRpbmcpXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuY29uZmlybWF0aW9uQWRqdXN0ZWRUaW1lc3RhbXAuZ2V0KCksIHN0YXJ0KTtcblxuXHRcdFx0Ly8gUmVzb2x2ZSBjb25maXJtYXRpb25cblx0XHRcdHRvb2xTdGF0ZS5zZXQoeyB0eXBlOiA0IC8qIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCAqLyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBOb3cgYWRqdXN0ZWQgdGltZXN0YW1wIHNob3VsZCByZWZsZWN0IHRoZSB3YWl0IHRpbWVcblx0XHRcdC8vIFRoZSB3YWl0IHRpbWUgd2FzIDIwMDBtcy5cblx0XHRcdC8vIGNvbmZpcm1hdGlvbkFkanVzdGVkVGltZXN0YW1wID0gc3RhcnQgKyB3YWl0VGltZSA9IHN0YXJ0ICsgMjAwMFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmNvbmZpcm1hdGlvbkFkanVzdGVkVGltZXN0YW1wLmdldCgpLCBzdGFydCArIDIwMDApO1xuXG5cdFx0XHQvLyBBZHZhbmNlIHRpbWUgYWdhaW5cblx0XHRcdGNsb2NrLnRpY2soMTAwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuY29uZmlybWF0aW9uQWRqdXN0ZWRUaW1lc3RhbXAuZ2V0KCksIHN0YXJ0ICsgMjAwMCk7XG5cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xvY2sucmVzdG9yZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnaXNJbmNvbXBsZXRlIHN0YXlzIHRydWUgZHVyaW5nIHRvb2wgY29uZmlybWF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXG5cdFx0XHRjb25zdCB0ZXh0ID0gJ2hlbGxvJztcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gcmVxdWVzdC5yZXNwb25zZSE7XG5cblx0XHRcdC8vIEluaXRpYWxseSBpbmNvbXBsZXRlIGFuZCBpbiBwcm9ncmVzc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlzSW5jb21wbGV0ZS5nZXQoKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuaXNJblByb2dyZXNzLmdldCgpLCB0cnVlKTtcblxuXHRcdFx0Ly8gQWRkIGEgcGVuZGluZyB0b29sIGNvbmZpcm1hdGlvblxuXHRcdFx0Y29uc3QgdG9vbFN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPGFueT4oJ3N0YXRlJywgeyB0eXBlOiAxIC8qIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24gKi8sIGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB7IHRpdGxlOiAnUGxlYXNlIGNvbmZpcm0nIH0gfSk7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IHtcblx0XHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdjYWxsaW5nIHRvb2wnLFxuXHRcdFx0XHRzdGF0ZTogdG9vbFN0YXRlXG5cdFx0XHR9IGFzIFBhcnRpYWw8SUNoYXRUb29sSW52b2NhdGlvbj4gYXMgSUNoYXRUb29sSW52b2NhdGlvbjtcblx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgdG9vbEludm9jYXRpb24pO1xuXG5cdFx0XHQvLyBpc0luUHJvZ3Jlc3Mgc2hvdWxkIGJlIGZhbHNlIChpdCBmYWN0b3JzIG91dCBwZW5kaW5nIGNvbmZpcm1hdGlvbnMpLCBidXQgaXNJbmNvbXBsZXRlIHNob3VsZCByZW1haW4gdHJ1ZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlzSW5Qcm9ncmVzcy5nZXQoKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlzSW5jb21wbGV0ZS5nZXQoKSwgdHJ1ZSk7XG5cblx0XHRcdC8vIFJlc29sdmUgdG9vbCBjb25maXJtYXRpb25cblx0XHRcdHRvb2xTdGF0ZS5zZXQoeyB0eXBlOiA0IC8qIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCAqLyB9LCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlzSW5Qcm9ncmVzcy5nZXQoKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuaXNJbmNvbXBsZXRlLmdldCgpLCB0cnVlKTtcblxuXHRcdFx0Ly8gQ29tcGxldGUgdGhlIHJlc3BvbnNlXG5cdFx0XHRyZXNwb25zZS5jb21wbGV0ZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlzSW5Qcm9ncmVzcy5nZXQoKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlzSW5jb21wbGV0ZS5nZXQoKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnN0YXRlLCBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbG9jay5yZXN0b3JlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdNQ1AgdG9vbCBhdXRoZW50aWNhdGlvbiBtYXJrcyB0aGUgcmVzcG9uc2UgYXMgbmVlZGluZyBpbnB1dCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1vZGVsLCB1bmRlZmluZWQsIHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9KSk7XG5cdFx0Y29uc3QgdGV4dCA9ICdoZWxsbyc7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsLmFkZFJlcXVlc3QoeyB0ZXh0LCBwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCB0ZXh0Lmxlbmd0aCksIG5ldyBSYW5nZSgxLCB0ZXh0Lmxlbmd0aCwgMSwgdGV4dC5sZW5ndGgpLCB0ZXh0KV0gfSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVxdWVzdC5yZXNwb25zZSE7XG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRraW5kOiAndG9vbEludm9jYXRpb24nLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdjYWxsaW5nIHRvb2wnLFxuXHRcdFx0c3RhdGU6IG9ic2VydmFibGVWYWx1ZTxhbnk+KCdzdGF0ZScsIHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uLFxuXHRcdFx0XHRzZXJ2ZXI6IHsgaWQ6ICdzZXJ2ZXInLCBuYW1lOiAnR2l0SHViIE1DUCcsIHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViY29waWxvdC5jb20vbWNwJyB9LFxuXHRcdFx0XHRjYW5jZWw6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdH0gYXMgUGFydGlhbDxJQ2hhdFRvb2xJbnZvY2F0aW9uPiBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uO1xuXG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB0b29sSW52b2NhdGlvbik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlzSW5Qcm9ncmVzczogcmVzcG9uc2UuaXNJblByb2dyZXNzLmdldCgpLFxuXHRcdFx0aXNJbmNvbXBsZXRlOiByZXNwb25zZS5pc0luY29tcGxldGUuZ2V0KCksXG5cdFx0XHRwZW5kaW5nOiByZXNwb25zZS5pc1BlbmRpbmdDb25maXJtYXRpb24uZ2V0KCk/LmRldGFpbCxcblx0XHR9LCB7XG5cdFx0XHRpc0luUHJvZ3Jlc3M6IGZhbHNlLFxuXHRcdFx0aXNJbmNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0cGVuZGluZzogJ0F1dGhlbnRpY2F0ZSBHaXRIdWIgTUNQIHRvIGNvbnRpbnVlLi4uJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNJbmNvbXBsZXRlIGJlY29tZXMgZmFsc2Ugb24gY2FuY2VsbGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRjb25zdCByZXNwb25zZSA9IHJlcXVlc3QucmVzcG9uc2UhO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlzSW5jb21wbGV0ZS5nZXQoKSwgdHJ1ZSk7XG5cblx0XHRtb2RlbC5jYW5jZWxSZXF1ZXN0KHJlcXVlc3QpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aXNJbmNvbXBsZXRlOiByZXNwb25zZS5pc0luY29tcGxldGUuZ2V0KCksXG5cdFx0XHRzdGF0ZTogcmVzcG9uc2Uuc3RhdGUsXG5cdFx0XHRoYXNFbGFwc2VkVGltZTogdHlwZW9mIHJlc3BvbnNlLmVsYXBzZWRNcyA9PT0gJ251bWJlcicsXG5cdFx0fSwge1xuXHRcdFx0aXNJbmNvbXBsZXRlOiBmYWxzZSxcblx0XHRcdHN0YXRlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ2FuY2VsbGVkLFxuXHRcdFx0aGFzRWxhcHNlZFRpbWU6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbGxhdGlvbiB0cmFuc2l0aW9ucyBzdHJlYW1pbmcgdG9vbCBpbnZvY2F0aW9ucyB0byBDYW5jZWxsZWQgKGlzc3VlICMyODg3MDEpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IHRleHQgPSAnZWRpdCBhIGZpbGUnO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRjb25zdCByZXNwb25zZSA9IHJlcXVlc3QucmVzcG9uc2UhO1xuXG5cdFx0Ly8gU2ltdWxhdGUgYSB0b29sIGludm9jYXRpb24gdGhhdCBpcyBzdGlsbCBzdHJlYW1pbmcgcGFydGlhbCBpbnB1dCBmcm9tXG5cdFx0Ly8gdGhlIExNIChlLmcuIGFuIGVkaXQgdG9vbCB3aG9zZSBhcmdzIGFyZSBzdGlsbCBiZWluZyBwcm9kdWNlZCkgd2hlblxuXHRcdC8vIHRoZSB1c2VyIHByZXNzZXMgU3RvcC4gVGhpcyBpcyB0aGUgZXhhY3Qgc2NlbmFyaW8gcmVwb3J0ZWQgaW4gIzI4ODcwMVxuXHRcdC8vIHdoZXJlIHRoZSBcIkVkaXRpbmcgZmlsZXNcIiBzcGlubmVyIHJlbWFpbmVkIGFmdGVyIGNhbmNlbGxhdGlvbi5cblx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IENoYXRUb29sSW52b2NhdGlvbi5jcmVhdGVTdHJlYW1pbmcoe1xuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdHRvb2xJZDogJ3JlcGxhY2Vfc3RyaW5nX2luX2ZpbGUnLFxuXHRcdFx0dG9vbERhdGE6IHtcblx0XHRcdFx0aWQ6ICdyZXBsYWNlX3N0cmluZ19pbl9maWxlJyxcblx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1JlcGxhY2Ugc3RyaW5nIGluIGZpbGUnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1JlcGxhY2UgU3RyaW5nIGluIEZpbGUnLFxuXHRcdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHRvb2xJbnZvY2F0aW9uKTtcblxuXHRcdC8vIFByZS1jb25kaXRpb25zOiB0aGUgdG9vbCBpcyBpbiBTdHJlYW1pbmcgc3RhdGUgKFVJIHN0aWxsIHNob3dzIHNwaW5uZXIpLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUodG9vbEludm9jYXRpb24pLCBmYWxzZSk7XG5cblx0XHQvLyBVc2VyIHByZXNzZXMgU3RvcC5cblx0XHRtb2RlbC5jYW5jZWxSZXF1ZXN0KHJlcXVlc3QpO1xuXG5cdFx0Ly8gVGhlIHRvb2wgaW52b2NhdGlvbiBtdXN0IGJlIHRyYW5zaXRpb25lZCBvdXQgb2YgU3RyZWFtaW5nIHNvIHRoYXQgdGhlXG5cdFx0Ly8gdGhpbmtpbmcgY29udGVudCBwYXJ0IHNlZXMgaXQgYXMgY29tcGxldGUgYW5kIGRyb3BzIHRoZSBzcGlubmVyL2xhYmVsLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUodG9vbEludm9jYXRpb24pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2Uuc3RhdGUsIFJlc3BvbnNlTW9kZWxTdGF0ZS5DYW5jZWxsZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYXNBY3RpdmVSZXF1ZXN0IHJlZmxlY3RzIGxhc3QgcmVxdWVzdCBpc0luY29tcGxldGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmhhc0FjdGl2ZVJlcXVlc3QuZ2V0KCksIGZhbHNlKTtcblxuXHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5oYXNBY3RpdmVSZXF1ZXN0LmdldCgpLCB0cnVlKTtcblxuXHRcdHJlcXVlc3QucmVzcG9uc2UhLmNvbXBsZXRlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmhhc0FjdGl2ZVJlcXVlc3QuZ2V0KCksIGZhbHNlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0NoYXRNb2RlbCAtIFBlbmRpbmcgUmVxdWVzdHMnLCAoKSA9PiB7XG5cdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vZGVsKCk6IENoYXRNb2RlbCB7XG5cdFx0cmV0dXJuIHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TW9kZWwsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfVxuXHRcdCkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gYWRkUmVxdWVzdFRvTW9kZWwobW9kZWw6IENoYXRNb2RlbCwgdGV4dDogc3RyaW5nKTogQ2hhdFJlcXVlc3RNb2RlbCB7XG5cdFx0cmV0dXJuIG1vZGVsLmFkZFJlcXVlc3QoXG5cdFx0XHR7IHRleHQsIHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSwgbmV3IFJhbmdlKDEsIHRleHQubGVuZ3RoLCAxLCB0ZXh0Lmxlbmd0aCksIHRleHQpXSB9LFxuXHRcdFx0eyB2YXJpYWJsZXM6IFtdIH0sXG5cdFx0XHQwXG5cdFx0KTtcblx0fVxuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uU2VydmljZSwgbmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEFnZW50U2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbmV3IE1vY2tDaGF0U2VydmljZSgpKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkUGVuZGluZ1JlcXVlc3QgLSBxdWV1ZWQgbWVzc2FnZXMgYXJlIGFkZGVkIGF0IHRoZSBlbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHJlcXVlc3QxID0gYWRkUmVxdWVzdFRvTW9kZWwobW9kZWwsICdmaXJzdCcpO1xuXHRcdGNvbnN0IHJlcXVlc3QyID0gYWRkUmVxdWVzdFRvTW9kZWwobW9kZWwsICdzZWNvbmQnKTtcblxuXHRcdG1vZGVsLmFkZFBlbmRpbmdSZXF1ZXN0KHJlcXVlc3QxLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHt9KTtcblx0XHRtb2RlbC5hZGRQZW5kaW5nUmVxdWVzdChyZXF1ZXN0MiwgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCB7fSk7XG5cblx0XHRjb25zdCBwZW5kaW5nID0gbW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmcubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZ1swXS5yZXF1ZXN0LmlkLCByZXF1ZXN0MS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmdbMV0ucmVxdWVzdC5pZCwgcmVxdWVzdDIuaWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRQZW5kaW5nUmVxdWVzdCAtIHN0ZWVyaW5nIG1lc3NhZ2VzIGFyZSBpbnNlcnRlZCBiZWZvcmUgcXVldWVkIG1lc3NhZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBxdWV1ZWQgPSBhZGRSZXF1ZXN0VG9Nb2RlbChtb2RlbCwgJ3F1ZXVlZCcpO1xuXHRcdGNvbnN0IHN0ZWVyaW5nID0gYWRkUmVxdWVzdFRvTW9kZWwobW9kZWwsICdzdGVlcmluZycpO1xuXG5cdFx0bW9kZWwuYWRkUGVuZGluZ1JlcXVlc3QocXVldWVkLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHt9KTtcblx0XHRtb2RlbC5hZGRQZW5kaW5nUmVxdWVzdChzdGVlcmluZywgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcsIHt9KTtcblxuXHRcdGNvbnN0IHBlbmRpbmcgPSBtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nWzBdLnJlcXVlc3QuaWQsIHN0ZWVyaW5nLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZ1swXS5raW5kLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmdbMV0ucmVxdWVzdC5pZCwgcXVldWVkLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZ1sxXS5raW5kLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRQZW5kaW5nUmVxdWVzdCAtIG11bHRpcGxlIHN0ZWVyaW5nIG1lc3NhZ2VzIG1haW50YWluIG9yZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBbc3RlZXJpbmcxLCBzdGVlcmluZzIsIHF1ZXVlZF0gPSBbJ3MxJywgJ3MyJywgJ3EnXS5tYXAodCA9PiBhZGRSZXF1ZXN0VG9Nb2RlbChtb2RlbCwgdCkpO1xuXG5cdFx0bW9kZWwuYWRkUGVuZGluZ1JlcXVlc3QocXVldWVkLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHt9KTtcblx0XHRtb2RlbC5hZGRQZW5kaW5nUmVxdWVzdChzdGVlcmluZzEsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nLCB7fSk7XG5cdFx0bW9kZWwuYWRkUGVuZGluZ1JlcXVlc3Qoc3RlZXJpbmcyLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZywge30pO1xuXG5cdFx0Y29uc3QgcGVuZGluZyA9IG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmdbMF0ucmVxdWVzdC5pZCwgc3RlZXJpbmcxLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZ1sxXS5yZXF1ZXN0LmlkLCBzdGVlcmluZzIuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nWzJdLnJlcXVlc3QuaWQsIHF1ZXVlZC5pZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZFBlbmRpbmdSZXF1ZXN0IC0gZmlyZXMgb25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMgZXZlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBhZGRSZXF1ZXN0VG9Nb2RlbChtb2RlbCwgJ3Rlc3QnKTtcblxuXHRcdGxldCBldmVudEZpcmVkID0gZmFsc2U7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZENoYW5nZVBlbmRpbmdSZXF1ZXN0cygoKSA9PiB7IGV2ZW50RmlyZWQgPSB0cnVlOyB9KSk7XG5cblx0XHRtb2RlbC5hZGRQZW5kaW5nUmVxdWVzdChyZXF1ZXN0LCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHt9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudEZpcmVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlUGVuZGluZ1JlcXVlc3QgLSByZW1vdmVzIHNwZWNpZmllZCByZXF1ZXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBbcmVxdWVzdDEsIHJlcXVlc3QyXSA9IFsncjEnLCAncjInXS5tYXAodCA9PiBhZGRSZXF1ZXN0VG9Nb2RlbChtb2RlbCwgdCkpO1xuXG5cdFx0bW9kZWwuYWRkUGVuZGluZ1JlcXVlc3QocmVxdWVzdDEsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwge30pO1xuXHRcdG1vZGVsLmFkZFBlbmRpbmdSZXF1ZXN0KHJlcXVlc3QyLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHt9KTtcblxuXHRcdG1vZGVsLnJlbW92ZVBlbmRpbmdSZXF1ZXN0KHJlcXVlc3QxLmlkKTtcblxuXHRcdGNvbnN0IHBlbmRpbmcgPSBtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nWzBdLnJlcXVlc3QuaWQsIHJlcXVlc3QyLmlkKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlUGVuZGluZ1JlcXVlc3QgLSBuby1vcCBmb3Igbm9uLWV4aXN0ZW50IHJlcXVlc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBhZGRSZXF1ZXN0VG9Nb2RlbChtb2RlbCwgJ3Rlc3QnKTtcblx0XHRtb2RlbC5hZGRQZW5kaW5nUmVxdWVzdChyZXF1ZXN0LCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHt9KTtcblxuXHRcdGxldCBldmVudENvdW50ID0gMDtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlUGVuZGluZ1JlcXVlc3RzKCgpID0+IHsgZXZlbnRDb3VudCsrOyB9KSk7XG5cblx0XHRtb2RlbC5yZW1vdmVQZW5kaW5nUmVxdWVzdCgnbm9uLWV4aXN0ZW50LWlkJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlcXVldWVQZW5kaW5nUmVxdWVzdCAtIHJldHVybnMgYW5kIHJlbW92ZXMgZmlyc3QgcmVxdWVzdCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgW3JlcXVlc3QxLCByZXF1ZXN0Ml0gPSBbJ3IxJywgJ3IyJ10ubWFwKHQgPT4gYWRkUmVxdWVzdFRvTW9kZWwobW9kZWwsIHQpKTtcblxuXHRcdG1vZGVsLmFkZFBlbmRpbmdSZXF1ZXN0KHJlcXVlc3QxLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHt9KTtcblx0XHRtb2RlbC5hZGRQZW5kaW5nUmVxdWVzdChyZXF1ZXN0MiwgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCB7fSk7XG5cblx0XHRjb25zdCBkZXF1ZXVlZCA9IG1vZGVsLmRlcXVldWVQZW5kaW5nUmVxdWVzdCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlcXVldWVkPy5yZXF1ZXN0LmlkLCByZXF1ZXN0MS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpWzBdLnJlcXVlc3QuaWQsIHJlcXVlc3QyLmlkKTtcblx0fSk7XG5cblx0dGVzdCgnZGVxdWV1ZVBlbmRpbmdSZXF1ZXN0IC0gcmV0dXJucyB1bmRlZmluZWQgd2hlbiBlbXB0eScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmRlcXVldWVQZW5kaW5nUmVxdWVzdCgpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXF1ZXVlUGVuZGluZ1JlcXVlc3QgLSBmaXJlcyBldmVudCB3aGVuIHJlcXVlc3QgZGVxdWV1ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBhZGRSZXF1ZXN0VG9Nb2RlbChtb2RlbCwgJ3Rlc3QnKTtcblx0XHRtb2RlbC5hZGRQZW5kaW5nUmVxdWVzdChyZXF1ZXN0LCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHt9KTtcblxuXHRcdGxldCBldmVudEZpcmVkID0gZmFsc2U7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZENoYW5nZVBlbmRpbmdSZXF1ZXN0cygoKSA9PiB7IGV2ZW50RmlyZWQgPSB0cnVlOyB9KSk7XG5cblx0XHRtb2RlbC5kZXF1ZXVlUGVuZGluZ1JlcXVlc3QoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudEZpcmVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXJQZW5kaW5nUmVxdWVzdHMgLSByZW1vdmVzIGFsbCBwZW5kaW5nIHJlcXVlc3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRbJ3IxJywgJ3IyJywgJ3IzJ10uZm9yRWFjaCh0ID0+IHtcblx0XHRcdG1vZGVsLmFkZFBlbmRpbmdSZXF1ZXN0KGFkZFJlcXVlc3RUb01vZGVsKG1vZGVsLCB0KSwgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCB7fSk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5jbGVhclBlbmRpbmdSZXF1ZXN0cygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyUGVuZGluZ1JlcXVlc3RzIC0gbm8gZXZlbnQgd2hlbiBhbHJlYWR5IGVtcHR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblxuXHRcdGxldCBldmVudEZpcmVkID0gZmFsc2U7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZENoYW5nZVBlbmRpbmdSZXF1ZXN0cygoKSA9PiB7IGV2ZW50RmlyZWQgPSB0cnVlOyB9KSk7XG5cblx0XHRtb2RlbC5jbGVhclBlbmRpbmdSZXF1ZXN0cygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50RmlyZWQsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0UGVuZGluZ1JlcXVlc3RzIC0gcmVvcmRlcnMgZXhpc3RpbmcgcGVuZGluZyByZXF1ZXN0cycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgW3IxLCByMiwgcjNdID0gWydyMScsICdyMicsICdyMyddLm1hcCh0ID0+IGFkZFJlcXVlc3RUb01vZGVsKG1vZGVsLCB0KSk7XG5cblx0XHRtb2RlbC5hZGRQZW5kaW5nUmVxdWVzdChyMSwgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCB7fSk7XG5cdFx0bW9kZWwuYWRkUGVuZGluZ1JlcXVlc3QocjIsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwge30pO1xuXHRcdG1vZGVsLmFkZFBlbmRpbmdSZXF1ZXN0KHIzLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZywge30pO1xuXG5cdFx0Ly8gUmV2ZXJzZSB0aGUgb3JkZXJcblx0XHRtb2RlbC5zZXRQZW5kaW5nUmVxdWVzdHMoW1xuXHRcdFx0eyByZXF1ZXN0SWQ6IHIyLmlkLCBraW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQgfSxcblx0XHRcdHsgcmVxdWVzdElkOiByMS5pZCwga2luZDogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcgfSwgLy8gQ2hhbmdlIGtpbmRcblx0XHRdKTtcblxuXHRcdGNvbnN0IHBlbmRpbmcgPSBtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nWzBdLnJlcXVlc3QuaWQsIHIyLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZ1sxXS5yZXF1ZXN0LmlkLCByMS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmdbMV0ua2luZCwgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRQZW5kaW5nUmVxdWVzdHMgLSBpZ25vcmVzIG5vbi1leGlzdGVudCByZXF1ZXN0IElEcycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGFkZFJlcXVlc3RUb01vZGVsKG1vZGVsLCAndGVzdCcpO1xuXHRcdG1vZGVsLmFkZFBlbmRpbmdSZXF1ZXN0KHJlcXVlc3QsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwge30pO1xuXG5cdFx0bW9kZWwuc2V0UGVuZGluZ1JlcXVlc3RzKFtcblx0XHRcdHsgcmVxdWVzdElkOiAnbm9uLWV4aXN0ZW50Jywga2luZDogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkIH0sXG5cdFx0XHR7IHJlcXVlc3RJZDogcmVxdWVzdC5pZCwga2luZDogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkIH0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCBwZW5kaW5nID0gbW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmcubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZ1swXS5yZXF1ZXN0LmlkLCByZXF1ZXN0LmlkKTtcblx0fSk7XG5cblx0dGVzdCgncGVuZGluZyByZXF1ZXN0cyBwcmVzZXJ2ZSBzZW5kIG9wdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBhZGRSZXF1ZXN0VG9Nb2RlbChtb2RlbCwgJ3Rlc3QnKTtcblx0XHRjb25zdCBzZW5kT3B0aW9ucyA9IHsgYWdlbnRJZDogJ3Rlc3QtYWdlbnQnLCBhdHRlbXB0OiAzIH07XG5cblx0XHRjb25zdCBwZW5kaW5nID0gbW9kZWwuYWRkUGVuZGluZ1JlcXVlc3QocmVxdWVzdCwgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCBzZW5kT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZy5zZW5kT3B0aW9ucy5hZ2VudElkLCAndGVzdC1hZ2VudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nLnNlbmRPcHRpb25zLmF0dGVtcHQsIDMpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnc2VyaWFsaXplU2VuZE9wdGlvbnMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyByZXF1ZXN0LXNjb3BlZCBvcHRpb25zIHRocm91Z2ggcGVyc2lzdC9yZXN0b3JlJywgKCkgPT4ge1xuXHRcdC8vIEEgcGVuZGluZy9xdWV1ZWQgcmVxdWVzdCBpcyBzZXJpYWxpemVkIGFuZCBsYXRlciByZXN0b3JlZCAoZS5nLiB3aW5kb3dcblx0XHQvLyByZWxvYWQpLiBUaGUgZWRpdG9yLXNjb3BlZCBtb2RlbCBjb25maWd1cmF0aW9uIG11c3Qgcm91bmQtdHJpcCwgb3RoZXJ3aXNlXG5cdFx0Ly8gdGhlIHJlc3RvcmVkIHJlcXVlc3QgZmFsbHMgYmFjayB0byB0aGUgcHJvZmlsZS1nbG9iYWwgdmFsdWUuXG5cdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHNlcmlhbGl6ZVNlbmRPcHRpb25zKHtcblx0XHRcdHVzZXJTZWxlY3RlZE1vZGVsSWQ6ICdjb3BpbG90L2dwdCcsXG5cdFx0XHR1c2VyU2VsZWN0ZWRNb2RlbENvbmZpZ3VyYXRpb246IHsgdGhpbmtpbmdFZmZvcnQ6ICdoaWdoJywgY29udGV4dFNpemU6IDIwMDAgfSxcblx0XHRcdGlzVm9pY2VNb2RlSW5wdXQ6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1vZGVsQ29uZmlndXJhdGlvbjogc2VyaWFsaXplZC51c2VyU2VsZWN0ZWRNb2RlbENvbmZpZ3VyYXRpb24sXG5cdFx0XHRpc1ZvaWNlTW9kZUlucHV0OiBzZXJpYWxpemVkLmlzVm9pY2VNb2RlSW5wdXQsXG5cdFx0fSwge1xuXHRcdFx0bW9kZWxDb25maWd1cmF0aW9uOiB7IHRoaW5raW5nRWZmb3J0OiAnaGlnaCcsIGNvbnRleHRTaXplOiAyMDAwIH0sXG5cdFx0XHRpc1ZvaWNlTW9kZUlucHV0OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdFJlc3BvbnNlUmVzb3VyY2UnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NyZWF0ZVVyaSByb3VuZHRyaXBzIHRocm91Z2ggcGFyc2VVcmkgd2l0aG91dCBiYXNlbmFtZScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9sb2NhbC9zZXNzaW9uMScpO1xuXHRcdGNvbnN0IHVyaSA9IENoYXRSZXNwb25zZVJlc291cmNlLmNyZWF0ZVVyaShzZXNzaW9uUmVzb3VyY2UsICdjYWxsLTEyMycsIDIpO1xuXHRcdGNvbnN0IHBhcnNlZCA9IENoYXRSZXNwb25zZVJlc291cmNlLnBhcnNlVXJpKHVyaSk7XG5cblx0XHRhc3NlcnQub2socGFyc2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC50b29sQ2FsbElkLCAnY2FsbC0xMjMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmluZGV4LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlVXJpIHJvdW5kdHJpcHMgdGhyb3VnaCBwYXJzZVVyaSB3aXRoIGJhc2VuYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQtc2Vzc2lvbjovL2xvY2FsL3Nlc3Npb24xJyk7XG5cdFx0Y29uc3QgdXJpID0gQ2hhdFJlc3BvbnNlUmVzb3VyY2UuY3JlYXRlVXJpKHNlc3Npb25SZXNvdXJjZSwgJ2NhbGwtNDU2JywgMCwgJ2ZpbGUudHh0Jyk7XG5cdFx0Y29uc3QgcGFyc2VkID0gQ2hhdFJlc3BvbnNlUmVzb3VyY2UucGFyc2VVcmkodXJpKTtcblxuXHRcdGFzc2VydC5vayhwYXJzZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLnRvb2xDYWxsSWQsICdjYWxsLTQ1NicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuaW5kZXgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZVVyaSByZWplY3RzIHBhdGhzIHdpdGggZmV3ZXIgdGhhbiA0IHNlZ21lbnRzJywgKCkgPT4ge1xuXHRcdC8vIHBhdGggXCIvdG9vbC9jYWxsSWQvMFwiIHNwbGl0cyBpbnRvIFsnJywgJ3Rvb2wnLCAnY2FsbElkJywgJzAnXSA9IDQgcGFydHMgPT4gdmFsaWRcblx0XHQvLyBwYXRoIFwiL3Rvb2wvY2FsbElkXCIgc3BsaXRzIGludG8gWycnLCAndG9vbCcsICdjYWxsSWQnXSA9IDMgcGFydHMgPT4gaW52YWxpZFxuXHRcdGNvbnN0IGJhc2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQ2hhdFJlc3BvbnNlUmVzb3VyY2Uuc2NoZW1lLCBhdXRob3JpdHk6ICdhYmMnLCBwYXRoOiAnL3Rvb2wvY2FsbElkJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQ2hhdFJlc3BvbnNlUmVzb3VyY2UucGFyc2VVcmkoYmFzZSksIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCB0b29TaG9ydCA9IFVSSS5mcm9tKHsgc2NoZW1lOiBDaGF0UmVzcG9uc2VSZXNvdXJjZS5zY2hlbWUsIGF1dGhvcml0eTogJ2FiYycsIHBhdGg6ICcvdG9vbCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKENoYXRSZXNwb25zZVJlc291cmNlLnBhcnNlVXJpKHRvb1Nob3J0KSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGVtcHR5ID0gVVJJLmZyb20oeyBzY2hlbWU6IENoYXRSZXNwb25zZVJlc291cmNlLnNjaGVtZSwgYXV0aG9yaXR5OiAnYWJjJywgcGF0aDogJy8nIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChDaGF0UmVzcG9uc2VSZXNvdXJjZS5wYXJzZVVyaShlbXB0eSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlVXJpIHJlamVjdHMgd3Jvbmcgc2NoZW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnZmlsZScsIHBhdGg6ICcvdG9vbC9jYWxsSWQvMCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKENoYXRSZXNwb25zZVJlc291cmNlLnBhcnNlVXJpKHVyaSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlVXJpIHJlamVjdHMgd3Jvbmcga2luZCcsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogQ2hhdFJlc3BvbnNlUmVzb3VyY2Uuc2NoZW1lLCBhdXRob3JpdHk6ICdhYmMnLCBwYXRoOiAnL25vdFRvb2wvY2FsbElkLzAnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChDaGF0UmVzcG9uc2VSZXNvdXJjZS5wYXJzZVVyaSh1cmkpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25C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
