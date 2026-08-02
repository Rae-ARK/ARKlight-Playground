import assert from "assert";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { agentSessionApprovalId, AgentSessionApprovalModel } from "../../../browser/agentSessions/agentSessionApprovalModel.js";
import { MockChatModel } from "../../common/model/mockChatModel.js";
import { MockChatService } from "../../common/chatService/mockChatService.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
function makeToolInvocationPart(options) {
  return {
    kind: "toolInvocation",
    presentation: void 0,
    originMessage: void 0,
    invocationMessage: options.invocationMessage ?? "Running tool...",
    pastTenseMessage: void 0,
    source: void 0,
    toolId: "test-tool",
    toolCallId: options.toolCallId ?? "call-1",
    state: observableValue("toolState", options.state),
    toolSpecificData: options.toolSpecificData,
    toolSpecificDataKind: observableValue("test", options.toolSpecificData?.kind),
    isAttachedToThinking: false,
    toJSON: () => void 0
  };
}
function makeTerminalToolData(overrides) {
  return {
    kind: "terminal",
    commandLine: { original: "echo hello" },
    language: "sh",
    ...overrides
  };
}
function makeWaitingState(confirm) {
  return {
    type: IChatToolInvocation.StateKind.WaitingForConfirmation,
    parameters: {},
    confirm: confirm ?? (() => {
    })
  };
}
function makePostApprovalState(confirm) {
  return {
    type: IChatToolInvocation.StateKind.WaitingForPostApproval,
    parameters: {},
    confirmed: { type: ToolConfirmKind.UserAction },
    resultDetails: void 0,
    confirm: confirm ?? (() => {
    }),
    contentForModel: []
  };
}
function makeExecutingState() {
  return {
    type: IChatToolInvocation.StateKind.Executing,
    parameters: {},
    confirmed: { type: ToolConfirmKind.UserAction },
    progress: observableValue("progress", { message: void 0, progress: void 0 })
  };
}
function mockModelWithResponse(model, parts) {
  const response = {
    response: { value: parts, getMarkdown: () => "", getFinalResponse: () => "", toString: () => "" }
  };
  const request = {
    response
  };
  model.lastRequest = request;
}
class MockLanguageService {
  getLanguageIdByLanguageName(name) {
    switch (name) {
      case "bash":
        return "sh";
      case "python":
        return "python";
      case "powershell":
        return "pwsh";
      default:
        return name;
    }
  }
}
suite("AgentSessionApprovalModel", () => {
  const disposables = new DisposableStore();
  let chatService;
  let chatModelsObs;
  let langservice;
  setup(() => {
    chatService = new MockChatService();
    langservice = new MockLanguageService();
    chatModelsObs = chatService.chatModels;
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createModel() {
    const model = new AgentSessionApprovalModel(chatService, langservice);
    disposables.add(model);
    return model;
  }
  function addChatModel(uri) {
    const chatModel = disposables.add(new MockChatModel(uri ?? URI.parse(`test://session/${Math.random()}`)));
    chatModelsObs.set([...Array.from(chatModelsObs.get()), chatModel], void 0);
    return chatModel;
  }
  function getApproval(approvalModel, chatModel) {
    return approvalModel.getApproval(chatModel.sessionResource).get();
  }
  test("returns undefined when no models exist", () => {
    const approvalModel = createModel();
    const result = approvalModel.getApproval(URI.parse("test://nonexistent")).get();
    assert.strictEqual(result, void 0);
  });
  test("returns undefined when model has no requestNeedsInput", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
  test("returns undefined when requestNeedsInput is set but no response exists", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
  test("returns undefined when response has no tool invocation parts", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    mockModelWithResponse(chatModel, []);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
  test("returns undefined when tool invocation is in Executing state", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({ state: makeExecutingState() });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
  test("returns approval info for WaitingForConfirmation state with terminal data", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData()
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    const result = getApproval(approvalModel, chatModel);
    assert.deepStrictEqual({
      label: result?.label,
      language: result?.languageId
    }, {
      label: "echo hello",
      language: "sh"
    });
  });
  test("returns approval info for WaitingForPostApproval state", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makePostApprovalState(),
      toolSpecificData: makeTerminalToolData({ commandLine: { original: "npm install" } })
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    const result = getApproval(approvalModel, chatModel);
    assert.deepStrictEqual({
      label: result?.label,
      language: result?.languageId
    }, {
      label: "npm install",
      language: "sh"
    });
  });
  test("prefers presentationOverrides.commandLine and language", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({
        commandLine: { original: 'python -c "print(1)"' },
        language: "sh",
        presentationOverrides: { commandLine: "print(1)", language: "python" }
      })
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    const result = getApproval(approvalModel, chatModel);
    assert.deepStrictEqual({
      label: result?.label,
      language: result?.languageId
    }, {
      label: "print(1)",
      language: "python"
    });
  });
  test("uses forDisplay from commandLine when available", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({
        commandLine: { original: "echo raw", forDisplay: "echo display" }
      })
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel)?.label, "echo display");
  });
  test("uses userEdited from commandLine when forDisplay is not set", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({
        commandLine: { original: "orig", userEdited: "user-edited" }
      })
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel)?.label, "user-edited");
  });
  test("uses toolEdited from commandLine as fallback", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({
        commandLine: { original: "orig", toolEdited: "tool-edited" }
      })
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel)?.label, "tool-edited");
  });
  test("uses needsInput.detail when tool is not terminal", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({ state: makeWaitingState() });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test", detail: "Custom detail message" }, void 0);
    const result = getApproval(approvalModel, chatModel);
    assert.deepStrictEqual({
      label: result?.label,
      language: result?.languageId
    }, {
      label: "Custom detail message",
      language: void 0
    });
  });
  test("uses invocationMessage string when no terminal data and no detail", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      invocationMessage: "Searching files..."
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    const result = getApproval(approvalModel, chatModel);
    assert.deepStrictEqual({
      label: result?.label,
      language: result?.languageId
    }, {
      label: "Searching files...",
      language: void 0
    });
  });
  test("uses invocationMessage MarkdownString when no terminal data and no detail", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      invocationMessage: new MarkdownString("**Running** tool")
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel)?.label, "Running tool");
  });
  test("confirm() delegates to tool state confirm with UserAction", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    let confirmedWith;
    const part = makeToolInvocationPart({
      state: makeWaitingState((reason) => {
        confirmedWith = reason;
      }),
      toolSpecificData: makeTerminalToolData()
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    getApproval(approvalModel, chatModel)?.confirm();
    assert.deepStrictEqual(confirmedWith, { type: ToolConfirmKind.UserAction });
  });
  test("reacts to requestNeedsInput becoming undefined", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData()
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.ok(getApproval(approvalModel, chatModel));
    chatModel.requestNeedsInput.set(void 0, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
  test("reacts to tool state changing from waiting to executing", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const stateObs = observableValue("toolState", makeWaitingState());
    const part = {
      ...makeToolInvocationPart({ state: makeWaitingState(), toolSpecificData: makeTerminalToolData() }),
      state: stateObs
    };
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.ok(getApproval(approvalModel, chatModel));
    stateObs.set(makeExecutingState(), void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
  test("tracks multiple models independently", () => {
    const approvalModel = createModel();
    const chatModel1 = addChatModel(URI.parse("test://session/1"));
    const chatModel2 = addChatModel(URI.parse("test://session/2"));
    const part1 = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({ commandLine: { original: "cmd1" } })
    });
    mockModelWithResponse(chatModel1, [part1]);
    chatModel1.requestNeedsInput.set({ title: "Session 1" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel1)?.label, "cmd1");
    assert.strictEqual(getApproval(approvalModel, chatModel2), void 0);
  });
  test("clears approval when model is removed", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData()
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.ok(getApproval(approvalModel, chatModel));
    chatModelsObs.set([], void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
  test("keeps approval identity stable when a chat model reloads", () => {
    const approvalModel = createModel();
    const uri = URI.parse("test://session/reloaded");
    const firstModel = addChatModel(uri);
    mockModelWithResponse(firstModel, [makeToolInvocationPart({ state: makeWaitingState(), toolCallId: "stable-call" })]);
    firstModel.requestNeedsInput.set({ title: "Test" }, void 0);
    const firstId = agentSessionApprovalId(getApproval(approvalModel, firstModel));
    chatModelsObs.set([], void 0);
    const restoredModel = addChatModel(uri);
    mockModelWithResponse(restoredModel, [makeToolInvocationPart({ state: makeWaitingState(), toolCallId: "stable-call" })]);
    restoredModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.deepStrictEqual([firstId, agentSessionApprovalId(getApproval(approvalModel, restoredModel))], ["stable-call", "stable-call"]);
  });
  test("picks the first WaitingForConfirmation part when multiple parts exist", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const executingPart = makeToolInvocationPart({ state: makeExecutingState() });
    const waitingPart = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({ commandLine: { original: "second-cmd" } })
    });
    mockModelWithResponse(chatModel, [executingPart, waitingPart]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel)?.label, "second-cmd");
  });
  test("handles model added after approval model is created", () => {
    const approvalModel = createModel();
    const uri = URI.parse("test://session/late");
    assert.strictEqual(approvalModel.getApproval(uri).get(), void 0);
    const chatModel = addChatModel(uri);
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({ commandLine: { original: "late-cmd" } })
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel)?.label, "late-cmd");
  });
  test("handles legacy terminal tool data", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const legacyData = { kind: "terminal", command: "legacy-cmd", language: "bash" };
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: legacyData
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    const result = getApproval(approvalModel, chatModel);
    assert.deepStrictEqual({
      label: result?.label,
      language: result?.languageId
    }, {
      label: "legacy-cmd",
      language: "sh"
    });
  });
  test("observable is reused for the same session resource", () => {
    const approvalModel = createModel();
    const uri = URI.parse("test://session/same");
    const obs1 = approvalModel.getApproval(uri);
    const obs2 = approvalModel.getApproval(uri);
    assert.strictEqual(obs1, obs2);
  });
  test("skips non-toolInvocation parts", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const markdownPart = { kind: "markdownContent", content: new MarkdownString("hello") };
    const waitingPart = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({ commandLine: { original: "the-cmd" } })
    });
    mockModelWithResponse(chatModel, [markdownPart, waitingPart]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel)?.label, "the-cmd");
  });
  test("updating requestNeedsInput triggers re-evaluation", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData()
    });
    mockModelWithResponse(chatModel, [part]);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.ok(getApproval(approvalModel, chatModel));
    chatModel.requestNeedsInput.set(void 0, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBhZ2VudFNlc3Npb25BcHByb3ZhbElkLCBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsLCBJQWdlbnRTZXNzaW9uQXBwcm92YWxJbmZvIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9tb2NrQ2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9tb2NrQ2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sSW52b2NhdGlvbiwgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSwgVG9vbENvbmZpcm1LaW5kLCBDb25maXJtZWRSZWFzb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCwgSUNoYXRSZXF1ZXN0TW9kZWwsIElDaGF0UmVzcG9uc2VNb2RlbCwgSVJlc3BvbnNlLCBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuXG5mdW5jdGlvbiBtYWtlVG9vbEludm9jYXRpb25QYXJ0KG9wdGlvbnM6IHtcblx0c3RhdGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU7XG5cdHRvb2xTcGVjaWZpY0RhdGE/OiBJQ2hhdFRvb2xJbnZvY2F0aW9uWyd0b29sU3BlY2lmaWNEYXRhJ107XG5cdGludm9jYXRpb25NZXNzYWdlPzogc3RyaW5nIHwgTWFya2Rvd25TdHJpbmc7XG5cdHRvb2xDYWxsSWQ/OiBzdHJpbmc7XG59KTogSUNoYXRUb29sSW52b2NhdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uJyxcblx0XHRwcmVzZW50YXRpb246IHVuZGVmaW5lZCEsXG5cdFx0b3JpZ2luTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdGludm9jYXRpb25NZXNzYWdlOiBvcHRpb25zLmludm9jYXRpb25NZXNzYWdlID8/ICdSdW5uaW5nIHRvb2wuLi4nLFxuXHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRzb3VyY2U6IHVuZGVmaW5lZCEsXG5cdFx0dG9vbElkOiAndGVzdC10b29sJyxcblx0XHR0b29sQ2FsbElkOiBvcHRpb25zLnRvb2xDYWxsSWQgPz8gJ2NhbGwtMScsXG5cdFx0c3RhdGU6IG9ic2VydmFibGVWYWx1ZSgndG9vbFN0YXRlJywgb3B0aW9ucy5zdGF0ZSksXG5cdFx0dG9vbFNwZWNpZmljRGF0YTogb3B0aW9ucy50b29sU3BlY2lmaWNEYXRhLFxuXHRcdHRvb2xTcGVjaWZpY0RhdGFLaW5kOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCBvcHRpb25zLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQpLFxuXHRcdGlzQXR0YWNoZWRUb1RoaW5raW5nOiBmYWxzZSxcblx0XHR0b0pTT046ICgpID0+IHVuZGVmaW5lZCEsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VUZXJtaW5hbFRvb2xEYXRhKG92ZXJyaWRlcz86IFBhcnRpYWw8SUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YT4pOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAnZWNobyBoZWxsbycgfSxcblx0XHRsYW5ndWFnZTogJ3NoJyxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VXYWl0aW5nU3RhdGUoY29uZmlybT86IChyZWFzb246IENvbmZpcm1lZFJlYXNvbikgPT4gdm9pZCk6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0cGFyYW1ldGVyczoge30sXG5cdFx0Y29uZmlybTogY29uZmlybSA/PyAoKCkgPT4geyB9KSxcblx0fSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlO1xufVxuXG5mdW5jdGlvbiBtYWtlUG9zdEFwcHJvdmFsU3RhdGUoY29uZmlybT86IChyZWFzb246IENvbmZpcm1lZFJlYXNvbikgPT4gdm9pZCk6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWwsXG5cdFx0cGFyYW1ldGVyczoge30sXG5cdFx0Y29uZmlybWVkOiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH0sXG5cdFx0cmVzdWx0RGV0YWlsczogdW5kZWZpbmVkLFxuXHRcdGNvbmZpcm06IGNvbmZpcm0gPz8gKCgpID0+IHsgfSksXG5cdFx0Y29udGVudEZvck1vZGVsOiBbXSxcblx0fSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlO1xufVxuXG5mdW5jdGlvbiBtYWtlRXhlY3V0aW5nU3RhdGUoKTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZSB7XG5cdHJldHVybiB7XG5cdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdHBhcmFtZXRlcnM6IHt9LFxuXHRcdGNvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9LFxuXHRcdHByb2dyZXNzOiBvYnNlcnZhYmxlVmFsdWUoJ3Byb2dyZXNzJywgeyBtZXNzYWdlOiB1bmRlZmluZWQsIHByb2dyZXNzOiB1bmRlZmluZWQgfSksXG5cdH0gYXMgSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZTtcbn1cblxuLyoqIENyZWF0ZXMgYSBtaW5pbWFsIG1vY2sgdGhhdCBzYXRpc2ZpZXMgdGhlIHJlc3BvbnNlIGNoYWluOiBsYXN0UmVxdWVzdC5yZXNwb25zZS5yZXNwb25zZS52YWx1ZSAqL1xuZnVuY3Rpb24gbW9ja01vZGVsV2l0aFJlc3BvbnNlKG1vZGVsOiBNb2NrQ2hhdE1vZGVsLCBwYXJ0czogSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudFtdKTogdm9pZCB7XG5cdGNvbnN0IHJlc3BvbnNlOiBQYXJ0aWFsPElDaGF0UmVzcG9uc2VNb2RlbD4gPSB7XG5cdFx0cmVzcG9uc2U6IHsgdmFsdWU6IHBhcnRzLCBnZXRNYXJrZG93bjogKCkgPT4gJycsIGdldEZpbmFsUmVzcG9uc2U6ICgpID0+ICcnLCB0b1N0cmluZzogKCkgPT4gJycgfSBzYXRpc2ZpZXMgSVJlc3BvbnNlLFxuXHR9O1xuXHRjb25zdCByZXF1ZXN0OiBQYXJ0aWFsPElDaGF0UmVxdWVzdE1vZGVsPiA9IHtcblx0XHRyZXNwb25zZTogcmVzcG9uc2UgYXMgSUNoYXRSZXNwb25zZU1vZGVsLFxuXHR9O1xuXHQobW9kZWwgYXMgeyBsYXN0UmVxdWVzdDogSUNoYXRSZXF1ZXN0TW9kZWwgfCB1bmRlZmluZWQgfSkubGFzdFJlcXVlc3QgPSByZXF1ZXN0IGFzIElDaGF0UmVxdWVzdE1vZGVsO1xufVxuXG5jbGFzcyBNb2NrTGFuZ3VhZ2VTZXJ2aWNlIHtcblx0Z2V0TGFuZ3VhZ2VJZEJ5TGFuZ3VhZ2VOYW1lKG5hbWU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoIChuYW1lKSB7XG5cdFx0XHRjYXNlICdiYXNoJzogcmV0dXJuICdzaCc7XG5cdFx0XHRjYXNlICdweXRob24nOiByZXR1cm4gJ3B5dGhvbic7XG5cdFx0XHRjYXNlICdwb3dlcnNoZWxsJzogcmV0dXJuICdwd3NoJztcblx0XHRcdGRlZmF1bHQ6IHJldHVybiBuYW1lO1xuXHRcdH1cblx0fVxufVxuXG5zdWl0ZSgnQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCcsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGNoYXRTZXJ2aWNlOiBNb2NrQ2hhdFNlcnZpY2U7XG5cdGxldCBjaGF0TW9kZWxzT2JzOiBJU2V0dGFibGVPYnNlcnZhYmxlPEl0ZXJhYmxlPElDaGF0TW9kZWw+Pjtcblx0bGV0IGxhbmdzZXJ2aWNlOiBNb2NrTGFuZ3VhZ2VTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjaGF0U2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlcnZpY2UoKTtcblx0XHRsYW5nc2VydmljZSA9IG5ldyBNb2NrTGFuZ3VhZ2VTZXJ2aWNlKCk7XG5cdFx0Y2hhdE1vZGVsc09icyA9IGNoYXRTZXJ2aWNlLmNoYXRNb2RlbHMgYXMgSVNldHRhYmxlT2JzZXJ2YWJsZTxJdGVyYWJsZTxJQ2hhdE1vZGVsPj47XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVNb2RlbCgpOiBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsIHtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsKGNoYXRTZXJ2aWNlLCBsYW5nc2VydmljZSBhcyBJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdGZ1bmN0aW9uIGFkZENoYXRNb2RlbCh1cmk/OiBVUkkpOiBNb2NrQ2hhdE1vZGVsIHtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tDaGF0TW9kZWwodXJpID8/IFVSSS5wYXJzZShgdGVzdDovL3Nlc3Npb24vJHtNYXRoLnJhbmRvbSgpfWApKSk7XG5cdFx0Y2hhdE1vZGVsc09icy5zZXQoWy4uLkFycmF5LmZyb20oY2hhdE1vZGVsc09icy5nZXQoKSksIGNoYXRNb2RlbF0sIHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIGNoYXRNb2RlbDtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWw6IEFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbDogTW9ja0NoYXRNb2RlbCk6IElBZ2VudFNlc3Npb25BcHByb3ZhbEluZm8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBhcHByb3ZhbE1vZGVsLmdldEFwcHJvdmFsKGNoYXRNb2RlbC5zZXNzaW9uUmVzb3VyY2UpLmdldCgpO1xuXHR9XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyBtb2RlbHMgZXhpc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXBwcm92YWxNb2RlbC5nZXRBcHByb3ZhbChVUkkucGFyc2UoJ3Rlc3Q6Ly9ub25leGlzdGVudCcpKS5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG1vZGVsIGhhcyBubyByZXF1ZXN0TmVlZHNJbnB1dCcsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiByZXF1ZXN0TmVlZHNJbnB1dCBpcyBzZXQgYnV0IG5vIHJlc3BvbnNlIGV4aXN0cycsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHJlc3BvbnNlIGhhcyBubyB0b29sIGludm9jYXRpb24gcGFydHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbCwgW10pO1xuXHRcdGNoYXRNb2RlbC5yZXF1ZXN0TmVlZHNJbnB1dC5zZXQoeyB0aXRsZTogJ1Rlc3QnIH0sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gdG9vbCBpbnZvY2F0aW9uIGlzIGluIEV4ZWN1dGluZyBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHsgc3RhdGU6IG1ha2VFeGVjdXRpbmdTdGF0ZSgpIH0pO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFtwYXJ0XSk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGFwcHJvdmFsIGluZm8gZm9yIFdhaXRpbmdGb3JDb25maXJtYXRpb24gc3RhdGUgd2l0aCB0ZXJtaW5hbCBkYXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IGFkZENoYXRNb2RlbCgpO1xuXG5cdFx0Y29uc3QgcGFydCA9IG1ha2VUb29sSW52b2NhdGlvblBhcnQoe1xuXHRcdFx0c3RhdGU6IG1ha2VXYWl0aW5nU3RhdGUoKSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IG1ha2VUZXJtaW5hbFRvb2xEYXRhKCksXG5cdFx0fSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbCwgW3BhcnRdKTtcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxhYmVsOiByZXN1bHQ/LmxhYmVsLFxuXHRcdFx0bGFuZ3VhZ2U6IHJlc3VsdD8ubGFuZ3VhZ2VJZCxcblx0XHR9LCB7XG5cdFx0XHRsYWJlbDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0bGFuZ3VhZ2U6ICdzaCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgYXBwcm92YWwgaW5mbyBmb3IgV2FpdGluZ0ZvclBvc3RBcHByb3ZhbCBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHtcblx0XHRcdHN0YXRlOiBtYWtlUG9zdEFwcHJvdmFsU3RhdGUoKSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IG1ha2VUZXJtaW5hbFRvb2xEYXRhKHsgY29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICducG0gaW5zdGFsbCcgfSB9KSxcblx0XHR9KTtcblx0XHRtb2NrTW9kZWxXaXRoUmVzcG9uc2UoY2hhdE1vZGVsLCBbcGFydF0pO1xuXHRcdGNoYXRNb2RlbC5yZXF1ZXN0TmVlZHNJbnB1dC5zZXQoeyB0aXRsZTogJ1Rlc3QnIH0sIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGFiZWw6IHJlc3VsdD8ubGFiZWwsXG5cdFx0XHRsYW5ndWFnZTogcmVzdWx0Py5sYW5ndWFnZUlkLFxuXHRcdH0sIHtcblx0XHRcdGxhYmVsOiAnbnBtIGluc3RhbGwnLFxuXHRcdFx0bGFuZ3VhZ2U6ICdzaCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZWZlcnMgcHJlc2VudGF0aW9uT3ZlcnJpZGVzLmNvbW1hbmRMaW5lIGFuZCBsYW5ndWFnZScsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHtcblx0XHRcdHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBtYWtlVGVybWluYWxUb29sRGF0YSh7XG5cdFx0XHRcdGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAncHl0aG9uIC1jIFwicHJpbnQoMSlcIicgfSxcblx0XHRcdFx0bGFuZ3VhZ2U6ICdzaCcsXG5cdFx0XHRcdHByZXNlbnRhdGlvbk92ZXJyaWRlczogeyBjb21tYW5kTGluZTogJ3ByaW50KDEpJywgbGFuZ3VhZ2U6ICdweXRob24nIH0sXG5cdFx0XHR9KSxcblx0XHR9KTtcblx0XHRtb2NrTW9kZWxXaXRoUmVzcG9uc2UoY2hhdE1vZGVsLCBbcGFydF0pO1xuXHRcdGNoYXRNb2RlbC5yZXF1ZXN0TmVlZHNJbnB1dC5zZXQoeyB0aXRsZTogJ1Rlc3QnIH0sIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGFiZWw6IHJlc3VsdD8ubGFiZWwsXG5cdFx0XHRsYW5ndWFnZTogcmVzdWx0Py5sYW5ndWFnZUlkLFxuXHRcdH0sIHtcblx0XHRcdGxhYmVsOiAncHJpbnQoMSknLFxuXHRcdFx0bGFuZ3VhZ2U6ICdweXRob24nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGZvckRpc3BsYXkgZnJvbSBjb21tYW5kTGluZSB3aGVuIGF2YWlsYWJsZScsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHtcblx0XHRcdHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBtYWtlVGVybWluYWxUb29sRGF0YSh7XG5cdFx0XHRcdGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAnZWNobyByYXcnLCBmb3JEaXNwbGF5OiAnZWNobyBkaXNwbGF5JyB9LFxuXHRcdFx0fSksXG5cdFx0fSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbCwgW3BhcnRdKTtcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCk/LmxhYmVsLCAnZWNobyBkaXNwbGF5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdXNlckVkaXRlZCBmcm9tIGNvbW1hbmRMaW5lIHdoZW4gZm9yRGlzcGxheSBpcyBub3Qgc2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IGFkZENoYXRNb2RlbCgpO1xuXG5cdFx0Y29uc3QgcGFydCA9IG1ha2VUb29sSW52b2NhdGlvblBhcnQoe1xuXHRcdFx0c3RhdGU6IG1ha2VXYWl0aW5nU3RhdGUoKSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IG1ha2VUZXJtaW5hbFRvb2xEYXRhKHtcblx0XHRcdFx0Y29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICdvcmlnJywgdXNlckVkaXRlZDogJ3VzZXItZWRpdGVkJyB9LFxuXHRcdFx0fSksXG5cdFx0fSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbCwgW3BhcnRdKTtcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCk/LmxhYmVsLCAndXNlci1lZGl0ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyB0b29sRWRpdGVkIGZyb20gY29tbWFuZExpbmUgYXMgZmFsbGJhY2snLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cblx0XHRjb25zdCBwYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7XG5cdFx0XHRzdGF0ZTogbWFrZVdhaXRpbmdTdGF0ZSgpLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogbWFrZVRlcm1pbmFsVG9vbERhdGEoe1xuXHRcdFx0XHRjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJ29yaWcnLCB0b29sRWRpdGVkOiAndG9vbC1lZGl0ZWQnIH0sXG5cdFx0XHR9KSxcblx0XHR9KTtcblx0XHRtb2NrTW9kZWxXaXRoUmVzcG9uc2UoY2hhdE1vZGVsLCBbcGFydF0pO1xuXHRcdGNoYXRNb2RlbC5yZXF1ZXN0TmVlZHNJbnB1dC5zZXQoeyB0aXRsZTogJ1Rlc3QnIH0sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKT8ubGFiZWwsICd0b29sLWVkaXRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIG5lZWRzSW5wdXQuZGV0YWlsIHdoZW4gdG9vbCBpcyBub3QgdGVybWluYWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cblx0XHRjb25zdCBwYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7IHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCkgfSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbCwgW3BhcnRdKTtcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JywgZGV0YWlsOiAnQ3VzdG9tIGRldGFpbCBtZXNzYWdlJyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxhYmVsOiByZXN1bHQ/LmxhYmVsLFxuXHRcdFx0bGFuZ3VhZ2U6IHJlc3VsdD8ubGFuZ3VhZ2VJZCxcblx0XHR9LCB7XG5cdFx0XHRsYWJlbDogJ0N1c3RvbSBkZXRhaWwgbWVzc2FnZScsXG5cdFx0XHRsYW5ndWFnZTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGludm9jYXRpb25NZXNzYWdlIHN0cmluZyB3aGVuIG5vIHRlcm1pbmFsIGRhdGEgYW5kIG5vIGRldGFpbCcsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHtcblx0XHRcdHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1NlYXJjaGluZyBmaWxlcy4uLicsXG5cdFx0fSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbCwgW3BhcnRdKTtcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxhYmVsOiByZXN1bHQ/LmxhYmVsLFxuXHRcdFx0bGFuZ3VhZ2U6IHJlc3VsdD8ubGFuZ3VhZ2VJZCxcblx0XHR9LCB7XG5cdFx0XHRsYWJlbDogJ1NlYXJjaGluZyBmaWxlcy4uLicsXG5cdFx0XHRsYW5ndWFnZTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGludm9jYXRpb25NZXNzYWdlIE1hcmtkb3duU3RyaW5nIHdoZW4gbm8gdGVybWluYWwgZGF0YSBhbmQgbm8gZGV0YWlsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IGFkZENoYXRNb2RlbCgpO1xuXG5cdFx0Y29uc3QgcGFydCA9IG1ha2VUb29sSW52b2NhdGlvblBhcnQoe1xuXHRcdFx0c3RhdGU6IG1ha2VXYWl0aW5nU3RhdGUoKSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoJyoqUnVubmluZyoqIHRvb2wnKSxcblx0XHR9KTtcblx0XHRtb2NrTW9kZWxXaXRoUmVzcG9uc2UoY2hhdE1vZGVsLCBbcGFydF0pO1xuXHRcdGNoYXRNb2RlbC5yZXF1ZXN0TmVlZHNJbnB1dC5zZXQoeyB0aXRsZTogJ1Rlc3QnIH0sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKT8ubGFiZWwsICdSdW5uaW5nIHRvb2wnKTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlybSgpIGRlbGVnYXRlcyB0byB0b29sIHN0YXRlIGNvbmZpcm0gd2l0aCBVc2VyQWN0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IGFkZENoYXRNb2RlbCgpO1xuXG5cdFx0bGV0IGNvbmZpcm1lZFdpdGg6IENvbmZpcm1lZFJlYXNvbiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7XG5cdFx0XHRzdGF0ZTogbWFrZVdhaXRpbmdTdGF0ZShyZWFzb24gPT4geyBjb25maXJtZWRXaXRoID0gcmVhc29uOyB9KSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IG1ha2VUZXJtaW5hbFRvb2xEYXRhKCksXG5cdFx0fSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbCwgW3BhcnRdKTtcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0Z2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKT8uY29uZmlybSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlybWVkV2l0aCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KTtcblx0fSk7XG5cblx0dGVzdCgncmVhY3RzIHRvIHJlcXVlc3ROZWVkc0lucHV0IGJlY29taW5nIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHtcblx0XHRcdHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBtYWtlVGVybWluYWxUb29sRGF0YSgpLFxuXHRcdH0pO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFtwYXJ0XSk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2soZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKSk7XG5cblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmVhY3RzIHRvIHRvb2wgc3RhdGUgY2hhbmdpbmcgZnJvbSB3YWl0aW5nIHRvIGV4ZWN1dGluZycsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdGNvbnN0IHN0YXRlT2JzID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+KCd0b29sU3RhdGUnLCBtYWtlV2FpdGluZ1N0YXRlKCkpO1xuXHRcdGNvbnN0IHBhcnQ6IElDaGF0VG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHQuLi5tYWtlVG9vbEludm9jYXRpb25QYXJ0KHsgc3RhdGU6IG1ha2VXYWl0aW5nU3RhdGUoKSwgdG9vbFNwZWNpZmljRGF0YTogbWFrZVRlcm1pbmFsVG9vbERhdGEoKSB9KSxcblx0XHRcdHN0YXRlOiBzdGF0ZU9icyxcblx0XHR9O1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFtwYXJ0XSk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2soZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKSk7XG5cblx0XHRzdGF0ZU9icy5zZXQobWFrZUV4ZWN1dGluZ1N0YXRlKCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYWNrcyBtdWx0aXBsZSBtb2RlbHMgaW5kZXBlbmRlbnRseScsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwxID0gYWRkQ2hhdE1vZGVsKFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vMScpKTtcblx0XHRjb25zdCBjaGF0TW9kZWwyID0gYWRkQ2hhdE1vZGVsKFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vMicpKTtcblxuXHRcdGNvbnN0IHBhcnQxID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7XG5cdFx0XHRzdGF0ZTogbWFrZVdhaXRpbmdTdGF0ZSgpLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogbWFrZVRlcm1pbmFsVG9vbERhdGEoeyBjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJ2NtZDEnIH0gfSksXG5cdFx0fSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbDEsIFtwYXJ0MV0pO1xuXHRcdGNoYXRNb2RlbDEucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdTZXNzaW9uIDEnIH0sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsMSk/LmxhYmVsLCAnY21kMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwyKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXJzIGFwcHJvdmFsIHdoZW4gbW9kZWwgaXMgcmVtb3ZlZCcsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHtcblx0XHRcdHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBtYWtlVGVybWluYWxUb29sRGF0YSgpLFxuXHRcdH0pO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFtwYXJ0XSk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2soZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKSk7XG5cblx0XHQvLyBSZW1vdmUgbW9kZWwgZnJvbSBjaGF0TW9kZWxzXG5cdFx0Y2hhdE1vZGVsc09icy5zZXQoW10sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGFwcHJvdmFsIGlkZW50aXR5IHN0YWJsZSB3aGVuIGEgY2hhdCBtb2RlbCByZWxvYWRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vcmVsb2FkZWQnKTtcblx0XHRjb25zdCBmaXJzdE1vZGVsID0gYWRkQ2hhdE1vZGVsKHVyaSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGZpcnN0TW9kZWwsIFttYWtlVG9vbEludm9jYXRpb25QYXJ0KHsgc3RhdGU6IG1ha2VXYWl0aW5nU3RhdGUoKSwgdG9vbENhbGxJZDogJ3N0YWJsZS1jYWxsJyB9KV0pO1xuXHRcdGZpcnN0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGZpcnN0SWQgPSBhZ2VudFNlc3Npb25BcHByb3ZhbElkKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGZpcnN0TW9kZWwpISk7XG5cblx0XHRjaGF0TW9kZWxzT2JzLnNldChbXSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCByZXN0b3JlZE1vZGVsID0gYWRkQ2hhdE1vZGVsKHVyaSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKHJlc3RvcmVkTW9kZWwsIFttYWtlVG9vbEludm9jYXRpb25QYXJ0KHsgc3RhdGU6IG1ha2VXYWl0aW5nU3RhdGUoKSwgdG9vbENhbGxJZDogJ3N0YWJsZS1jYWxsJyB9KV0pO1xuXHRcdHJlc3RvcmVkTW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbZmlyc3RJZCwgYWdlbnRTZXNzaW9uQXBwcm92YWxJZChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCByZXN0b3JlZE1vZGVsKSEpXSwgWydzdGFibGUtY2FsbCcsICdzdGFibGUtY2FsbCddKTtcblx0fSk7XG5cblx0dGVzdCgncGlja3MgdGhlIGZpcnN0IFdhaXRpbmdGb3JDb25maXJtYXRpb24gcGFydCB3aGVuIG11bHRpcGxlIHBhcnRzIGV4aXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IGFkZENoYXRNb2RlbCgpO1xuXG5cdFx0Y29uc3QgZXhlY3V0aW5nUGFydCA9IG1ha2VUb29sSW52b2NhdGlvblBhcnQoeyBzdGF0ZTogbWFrZUV4ZWN1dGluZ1N0YXRlKCkgfSk7XG5cdFx0Y29uc3Qgd2FpdGluZ1BhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHtcblx0XHRcdHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBtYWtlVGVybWluYWxUb29sRGF0YSh7IGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAnc2Vjb25kLWNtZCcgfSB9KSxcblx0XHR9KTtcblx0XHRtb2NrTW9kZWxXaXRoUmVzcG9uc2UoY2hhdE1vZGVsLCBbZXhlY3V0aW5nUGFydCwgd2FpdGluZ1BhcnRdKTtcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCk/LmxhYmVsLCAnc2Vjb25kLWNtZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG1vZGVsIGFkZGVkIGFmdGVyIGFwcHJvdmFsIG1vZGVsIGlzIGNyZWF0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cblx0XHQvLyBObyBtb2RlbHMgeWV0XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi9sYXRlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmFsTW9kZWwuZ2V0QXBwcm92YWwodXJpKS5nZXQoKSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIEFkZCBtb2RlbCBsYXRlclxuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IGFkZENoYXRNb2RlbCh1cmkpO1xuXHRcdGNvbnN0IHBhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHtcblx0XHRcdHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBtYWtlVGVybWluYWxUb29sRGF0YSh7IGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAnbGF0ZS1jbWQnIH0gfSksXG5cdFx0fSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbCwgW3BhcnRdKTtcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCk/LmxhYmVsLCAnbGF0ZS1jbWQnKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBsZWdhY3kgdGVybWluYWwgdG9vbCBkYXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IGFkZENoYXRNb2RlbCgpO1xuXG5cdFx0Ly8gTGVnYWN5IGZvcm1hdCBoYXMgYGNvbW1hbmRgIGluc3RlYWQgb2YgYGNvbW1hbmRMaW5lYFxuXHRcdGNvbnN0IGxlZ2FjeURhdGEgPSB7IGtpbmQ6ICd0ZXJtaW5hbCcgYXMgY29uc3QsIGNvbW1hbmQ6ICdsZWdhY3ktY21kJywgbGFuZ3VhZ2U6ICdiYXNoJyB9O1xuXHRcdGNvbnN0IHBhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHtcblx0XHRcdHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBsZWdhY3lEYXRhLFxuXHRcdH0pO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFtwYXJ0XSk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsYWJlbDogcmVzdWx0Py5sYWJlbCxcblx0XHRcdGxhbmd1YWdlOiByZXN1bHQ/Lmxhbmd1YWdlSWQsXG5cdFx0fSwge1xuXHRcdFx0bGFiZWw6ICdsZWdhY3ktY21kJyxcblx0XHRcdGxhbmd1YWdlOiAnc2gnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvYnNlcnZhYmxlIGlzIHJldXNlZCBmb3IgdGhlIHNhbWUgc2Vzc2lvbiByZXNvdXJjZScsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uL3NhbWUnKTtcblxuXHRcdGNvbnN0IG9iczEgPSBhcHByb3ZhbE1vZGVsLmdldEFwcHJvdmFsKHVyaSk7XG5cdFx0Y29uc3Qgb2JzMiA9IGFwcHJvdmFsTW9kZWwuZ2V0QXBwcm92YWwodXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob2JzMSwgb2JzMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIG5vbi10b29sSW52b2NhdGlvbiBwYXJ0cycsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdGNvbnN0IG1hcmtkb3duUGFydCA9IHsga2luZDogJ21hcmtkb3duQ29udGVudCcgYXMgY29uc3QsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnaGVsbG8nKSB9O1xuXHRcdGNvbnN0IHdhaXRpbmdQYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7XG5cdFx0XHRzdGF0ZTogbWFrZVdhaXRpbmdTdGF0ZSgpLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogbWFrZVRlcm1pbmFsVG9vbERhdGEoeyBjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJ3RoZS1jbWQnIH0gfSksXG5cdFx0fSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbCwgW21hcmtkb3duUGFydCBhcyB1bmtub3duIGFzIElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQsIHdhaXRpbmdQYXJ0XSk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpPy5sYWJlbCwgJ3RoZS1jbWQnKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRpbmcgcmVxdWVzdE5lZWRzSW5wdXQgdHJpZ2dlcnMgcmUtZXZhbHVhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdC8vIEluaXRpYWxseSBubyByZXF1ZXN0TmVlZHNJbnB1dFxuXHRcdGNvbnN0IHBhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHtcblx0XHRcdHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBtYWtlVGVybWluYWxUb29sRGF0YSgpLFxuXHRcdH0pO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFtwYXJ0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCksIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBTZXQgcmVxdWVzdE5lZWRzSW5wdXRcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpKTtcblxuXHRcdC8vIENsZWFyIGFnYWluXG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCksIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBOEIsdUJBQXVCO0FBQ3JELFNBQVMsV0FBVztBQUNwQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHdCQUF3QixpQ0FBNEQ7QUFDN0YsU0FBUyxxQkFB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
