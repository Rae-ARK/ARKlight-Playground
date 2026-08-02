import assert from "assert";
import * as sinon from "sinon";
import { Event } from "../../../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { renderAsPlaintext, renderMarkdown } from "../../../../../../../base/browser/markdownRenderer.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { IChatMarkdownAnchorService } from "../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js";
import { ChatAutomationConfiguredResultSubPart } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatAutomationConfiguredResultSubPart.js";
import { ChatToolInvocationPart } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationPart.js";
import { ChatToolConfirmationCarouselPart } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolConfirmationCarouselPart.js";
import { BaseChatToolInvocationSubPart } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationSubPart.js";
import { ChatToolProgressSubPart } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolProgressPart.js";
import { isAskQuestionsToolInvocation, isMcpToolInvocation } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolPartUtilities.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
class TestToolInvocationSubPart extends BaseChatToolInvocationSubPart {
  constructor(toolInvocation, terminalData) {
    super(toolInvocation);
    this.domNode = mainWindow.document.createElement("div");
    this.codeblocks = [];
    this.domNode.dataset.terminalToolSessionId = terminalData.terminalToolSessionId ?? "";
  }
}
suite("ChatToolProgressSubPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let instantiationService;
  let mockMarkdownRenderer;
  let mockAnchorService;
  let mockHoverService;
  let mockConfigurationService;
  let mockEditorPool;
  function createRenderContext(isComplete = false) {
    const mockElement = {
      isComplete,
      id: "test-response-id",
      sessionResource: URI.parse("chat-session://test/session1"),
      setVote: () => {
      },
      get model() {
        return {};
      }
    };
    return {
      element: mockElement,
      inlineTextModels: {},
      elementIndex: 0,
      container: mainWindow.document.createElement("div"),
      content: [],
      contentIndex: 0,
      editorPool: mockEditorPool,
      codeBlockStartIndex: 0,
      treeStartIndex: 0,
      diffEditorPool: {},
      currentWidth: observableValue("currentWidth", 500),
      onDidChangeVisibility: Event.None
    };
  }
  function createSerializedToolInvocation(options = {}) {
    return {
      presentation: void 0,
      toolSpecificData: void 0,
      originMessage: void 0,
      invocationMessage: options.invocationMessage ?? "Running tool...",
      pastTenseMessage: void 0,
      resultDetails: void 0,
      isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
      isComplete: options.isComplete ?? false,
      toolCallId: "tool-call-id",
      toolId: options.toolId ?? "test_tool",
      source: options.source,
      kind: "toolInvocationSerialized"
    };
  }
  function createToolInvocation(options = {}) {
    const source = options.source ?? ToolDataSource.Internal;
    const toolId = options.toolId ?? "test_tool";
    return {
      presentation: void 0,
      toolSpecificData: void 0,
      originMessage: void 0,
      invocationMessage: options.invocationMessage ?? "Running tool...",
      pastTenseMessage: void 0,
      source,
      toolId,
      toolCallId: "live-tool-call-id",
      state: observableValue("state", {
        type: IChatToolInvocation.StateKind.Executing,
        parameters: void 0,
        confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
        progress: observableValue("progress", { message: options.progressMessage, progress: void 0 })
      }),
      toolSpecificDataKind: observableValue("test", void 0),
      isAttachedToThinking: false,
      kind: "toolInvocation",
      toJSON: () => createSerializedToolInvocation({ source, toolId, invocationMessage: options.invocationMessage })
    };
  }
  setup(() => {
    disposables = store.add(new DisposableStore());
    instantiationService = workbenchInstantiationService(void 0, store);
    mockConfigurationService = new TestConfigurationService();
    instantiationService.stub(IConfigurationService, mockConfigurationService);
    mockMarkdownRenderer = {
      render: (markdown, _options, outElement) => {
        const element = outElement ?? mainWindow.document.createElement("div");
        const content = typeof markdown === "string" ? markdown : renderAsPlaintext(markdown);
        element.textContent = content;
        return {
          element,
          dispose: () => {
          }
        };
      }
    };
    mockAnchorService = {
      _serviceBrand: void 0,
      register: () => ({ dispose: () => {
      } }),
      lastFocusedAnchor: void 0
    };
    instantiationService.stub(IChatMarkdownAnchorService, mockAnchorService);
    mockHoverService = {
      _serviceBrand: void 0,
      showHover: () => void 0,
      showDelayedHover: () => void 0,
      showAndFocusLastHover: () => {
      },
      hideHover: () => {
      },
      setupDelayedHover: () => ({ dispose: () => {
      } }),
      setupManagedHover: () => ({ dispose: () => {
      }, show: () => {
      }, hide: () => {
      }, update: () => {
      } }),
      showManagedHover: () => void 0,
      isHovered: () => false
    };
    instantiationService.stub(IHoverService, mockHoverService);
    mockEditorPool = {};
  });
  teardown(() => {
    disposables.dispose();
  });
  function renderToolInvocation(toolInvocation, renderer = mockMarkdownRenderer) {
    return disposables.add(new ChatToolInvocationPart(
      toolInvocation,
      createRenderContext(),
      renderer,
      {},
      mockEditorPool,
      () => 500,
      void 0,
      0,
      instantiationService,
      {
        _serviceBrand: void 0,
        onDidUpdateTodos: Event.None,
        getTodos: () => [],
        setTodos() {
        },
        migrateTodos() {
        }
      }
    ));
  }
  test("does not retain an ordinary tool part when it becomes a parent subagent", () => {
    const invocation = createToolInvocation();
    const part = renderToolInvocation(invocation);
    invocation.toolSpecificData = { kind: "subagent" };
    assert.strictEqual(part.hasSameContent(invocation, [], {}), false);
  });
  test("confirmation carousel reports the active subagent and invokes its reference action", () => {
    const createPendingInvocation = (toolCallId) => ({
      ...createToolInvocation(),
      toolCallId,
      state: observableValue(`state-${toolCallId}`, {
        type: IChatToolInvocation.StateKind.WaitingForConfirmation,
        parameters: void 0,
        confirmationMessages: { title: "Run command?", message: "Run command?" },
        confirm: () => {
        }
      })
    });
    const createExternalPart = () => {
      const domNode = mainWindow.document.createElement("div");
      domNode.className = "chat-tool-invocation-part";
      return {
        domNode,
        addDisposable: (disposable) => disposables.add(disposable)
      };
    };
    const revealed = [];
    const active = [];
    const carousel = disposables.add(new ChatToolConfirmationCarouselPart(() => {
      throw new Error("External tool parts should be reused");
    }, []));
    disposables.add(carousel.onDidChangeActiveSubagent((id) => active.push(id)));
    carousel.addToolInvocation(createPendingInvocation("first"), "subagent-one", "one", (id) => revealed.push(id), "Open one Chat", createExternalPart());
    carousel.addToolInvocation(createPendingInvocation("second"), "subagent-two", "two", (id) => revealed.push(id), "Open two Chat", createExternalPart());
    carousel.activateFirstToolForSubagent("subagent-two");
    const agentLabel = carousel.domNode.querySelector(".chat-tool-carousel-agent-label");
    agentLabel?.click();
    assert.deepStrictEqual({
      active,
      revealed,
      label: agentLabel?.title
    }, {
      active: ["subagent-one", "subagent-two"],
      revealed: ["subagent-two"],
      label: "Open two Chat"
    });
  });
  test("detects MCP tool invocations for live and serialized rows", () => {
    const mcpSource = {
      type: "mcp",
      label: "Weather MCP",
      serverLabel: "Weather",
      instructions: void 0,
      collectionId: "collection",
      definitionId: "definition"
    };
    const cases = [
      isMcpToolInvocation(createToolInvocation({ source: mcpSource })),
      isMcpToolInvocation(createSerializedToolInvocation({ source: void 0, toolId: "mcp__weather" })),
      isMcpToolInvocation(createSerializedToolInvocation({ source: ToolDataSource.Internal, toolId: "fetch_webpage" }))
    ];
    assert.deepStrictEqual(cases, [true, true, false]);
  });
  test("detects all ask-question tool names for top-level rendering", () => {
    const toolNames = ["copilot_askQuestions", "vscode_askQuestions", "ask_user", "AskUserQuestion", "request_user_input"];
    assert.deepStrictEqual(toolNames.map((toolId) => isAskQuestionsToolInvocation(createToolInvocation({ toolId }))), [true, true, true, true, true]);
  });
  test("renders the automation result subpart for configured automation data", () => {
    const invocation = {
      ...createSerializedToolInvocation({ isComplete: true }),
      toolSpecificData: {
        kind: "automationConfigured",
        automationId: "automation-1",
        automationName: "Morning review",
        operation: "created"
      }
    };
    const createInstanceStub = sinon.stub(instantiationService, "createInstance").callsFake((_ctor, ...args) => {
      return new TestToolInvocationSubPart(args[0], {
        kind: "terminal",
        commandLine: { original: "" },
        language: "shellscript"
      });
    });
    disposables.add(toDisposable(() => createInstanceStub.restore()));
    renderToolInvocation(invocation);
    assert.strictEqual(createInstanceStub.firstCall.args[0], ChatAutomationConfiguredResultSubPart);
  });
  test("renders codicon syntax in an automation name as literal text", () => {
    const render = (automationName) => {
      const part = disposables.add(instantiationService.createInstance(
        ChatAutomationConfiguredResultSubPart,
        createSerializedToolInvocation({ isComplete: true }),
        { kind: "automationConfigured", automationId: "automation-1", automationName, operation: "created" },
        createRenderContext(),
        mockMarkdownRenderer
      ));
      const button = part.domNode.querySelector(".chat-open-session-button");
      return {
        text: button?.textContent,
        ariaLabel: button?.getAttribute("aria-label"),
        tabIndex: button?.tabIndex,
        watchIconIsChild: !!button?.querySelector(".codicon-watch"),
        // `codicon-*` on the root would restyle the label text.
        rootCarriesCodiconClass: button?.classList.contains("codicon"),
        injectedIcons: [...button?.querySelectorAll(".codicon") ?? []].flatMap((el) => [...el.classList]).filter((c) => c.startsWith("codicon-"))
      };
    };
    assert.deepStrictEqual([render("$(error)"), render("a \\$(error) b")], [
      {
        text: "Created an automation: $(error)",
        ariaLabel: "Open automation $(error)",
        tabIndex: 0,
        watchIconIsChild: true,
        rootCarriesCodiconClass: false,
        injectedIcons: ["codicon-watch"]
      },
      {
        text: "Created an automation: a \\$(error) b",
        ariaLabel: "Open automation a \\$(error) b",
        tabIndex: 0,
        watchIconIsChild: true,
        rootCarriesCodiconClass: false,
        injectedIcons: ["codicon-watch"]
      }
    ]);
  });
  test("rerenders when terminal metadata changes without changing data kind", () => {
    const state = observableValue("state", {
      type: IChatToolInvocation.StateKind.Executing,
      parameters: void 0,
      confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
      progress: observableValue("progress", { progress: void 0 })
    });
    let terminalData = {
      kind: "terminal",
      commandLine: { original: "echo test" },
      language: "shellscript"
    };
    const invocation = {
      ...createToolInvocation(),
      get toolSpecificData() {
        return terminalData;
      },
      state,
      toolSpecificDataKind: observableValue("kind", "terminal")
    };
    const createInstanceStub = sinon.stub(instantiationService, "createInstance").callsFake((_ctor, ...args) => {
      return new TestToolInvocationSubPart(args[0], args[1]);
    });
    disposables.add(toDisposable(() => createInstanceStub.restore()));
    const part = disposables.add(new ChatToolInvocationPart(
      invocation,
      createRenderContext(),
      mockMarkdownRenderer,
      {},
      mockEditorPool,
      () => 500,
      void 0,
      0,
      instantiationService,
      {
        _serviceBrand: void 0,
        onDidUpdateTodos: Event.None,
        getTodos: () => [],
        setTodos() {
        },
        migrateTodos() {
        }
      }
    ));
    const sessionIdBeforeUpdate = part.domNode.firstElementChild?.getAttribute("data-terminal-tool-session-id");
    terminalData = { ...terminalData, terminalToolSessionId: "terminal-session" };
    state.set({ ...state.get() }, void 0);
    assert.deepStrictEqual({
      renderCount: createInstanceStub.callCount,
      sessionIdBeforeUpdate,
      sessionIdAfterUpdate: part.domNode.firstElementChild?.getAttribute("data-terminal-tool-session-id")
    }, {
      renderCount: 2,
      sessionIdBeforeUpdate: "",
      sessionIdAfterUpdate: "terminal-session"
    });
  });
  test("does not add shimmer styling for active MCP tool progress", () => {
    const mcpTool = createToolInvocation({
      source: {
        type: "mcp",
        label: "Weather MCP",
        serverLabel: "Weather",
        instructions: void 0,
        collectionId: "collection",
        definitionId: "definition"
      },
      toolId: "weather_lookup"
    });
    const part = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      mcpTool,
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    assert.strictEqual(part.domNode.querySelector(".shimmer-progress"), null);
  });
  test("adds shimmer styling only for active ask questions invocation progress", () => {
    const askQuestionsTool = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      createToolInvocation({
        toolId: "vscode_askQuestions",
        invocationMessage: "Asking a question (Target)"
      }),
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    const askMultipleQuestionsTool = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      createToolInvocation({
        toolId: "vscode_askQuestions",
        invocationMessage: "Asking 3 questions (What should we work on?, Preferred area, How hands-on?)"
      }),
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    const analyzingAnswersTool = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      createToolInvocation({
        toolId: "vscode_askQuestions",
        invocationMessage: "Asking a question (Target)",
        progressMessage: "Analyzing your answers..."
      }),
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    const waitingForAnswerTool = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      createToolInvocation({
        toolId: "ask_user",
        invocationMessage: "Waiting for answer..."
      }),
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    assert.deepStrictEqual([
      !!askQuestionsTool.domNode.querySelector(".shimmer-progress"),
      askQuestionsTool.domNode.querySelector(".chat-progress-shimmer-text")?.textContent,
      askQuestionsTool.domNode.textContent,
      askMultipleQuestionsTool.domNode.querySelector(".chat-progress-shimmer-text")?.textContent,
      askMultipleQuestionsTool.domNode.textContent,
      !!analyzingAnswersTool.domNode.querySelector(".shimmer-progress"),
      analyzingAnswersTool.domNode.querySelector(".chat-progress-shimmer-text")?.textContent,
      !!waitingForAnswerTool.domNode.querySelector(".shimmer-progress")
    ], [true, "Asking a question", "Asking a question (Target)", "Asking 3 questions", "Asking 3 questions (What should we work on?, Preferred area, How hands-on?)", false, void 0, true]);
  });
  test("does not render a loading icon for run playwright code progress", () => {
    const tool = createToolInvocation({
      toolId: "run_playwright_code",
      invocationMessage: "Running Playwright code..."
    });
    const part = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      tool,
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    assert.strictEqual(part.domNode.querySelector(".codicon-loading"), null);
  });
  test("does not add shimmer styling for non-MCP tool progress", () => {
    const tool = createSerializedToolInvocation({
      source: ToolDataSource.Internal,
      toolId: "fetch_webpage"
    });
    const part = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      tool,
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    assert.strictEqual(part.domNode.querySelector(".shimmer-progress"), null);
  });
  test("renders another client tool with an accessible inline skip action", () => {
    let cancelCount = 0;
    const state = observableValue("state", {
      type: IChatToolInvocation.StateKind.Executing,
      parameters: void 0,
      confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
      progress: observableValue("progress", { progress: void 0 })
    });
    const invocation = {
      ...createToolInvocation({ invocationMessage: "Running Run Task on another client..." }),
      pastTenseMessage: "Ran Task",
      state,
      otherClientToolCall: {
        cancel: () => {
          cancelCount++;
          state.set({
            type: IChatToolInvocation.StateKind.Completed,
            parameters: void 0,
            confirmationMessages: void 0,
            confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
            postConfirmed: void 0,
            resultDetails: void 0,
            contentForModel: []
          }, void 0);
        }
      }
    };
    const markdownRenderer = {
      render: (markdown, options) => renderMarkdown(markdown, options)
    };
    const part = renderToolInvocation(invocation, markdownRenderer);
    const skipLink = part.domNode.querySelector('a[data-href="#skip"]');
    const progressText = part.domNode.querySelector(".progress-step")?.textContent?.replaceAll("\xA0", " ");
    const linkParagraphText = skipLink?.closest("p")?.textContent?.replaceAll("\xA0", " ");
    const linkLabel = skipLink?.textContent;
    const linkRole = skipLink?.getAttribute("role");
    const linkHref = skipLink?.getAttribute("href");
    const tabIndex = skipLink?.tabIndex;
    skipLink?.click();
    assert.deepStrictEqual({
      progressText,
      linkParagraphText,
      textAfterSkip: part.domNode.textContent?.replaceAll("\xA0", " "),
      linkAfterSkip: part.domNode.querySelector('a[data-href="#skip"]'),
      linkLabel,
      linkRole,
      linkHref,
      tabIndex,
      cancelCount
    }, {
      progressText: "Running Run Task on another client... Skip?",
      linkParagraphText: "Running Run Task on another client... Skip?",
      textAfterSkip: "Ran Task",
      linkAfterSkip: null,
      linkLabel: "Skip?",
      linkRole: "button",
      linkHref: "",
      tabIndex: 0,
      cancelCount: 1
    });
  });
  test("does not add shimmer styling for completed MCP tool progress", () => {
    const mcpTool = createSerializedToolInvocation({
      source: {
        type: "mcp",
        label: "Weather MCP",
        serverLabel: "Weather",
        instructions: void 0,
        collectionId: "collection",
        definitionId: "definition"
      },
      toolId: "weather_lookup"
    });
    const part = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      mcpTool,
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    assert.strictEqual(part.domNode.querySelector(".shimmer-progress"), null);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRUb29sUHJvZ3Jlc3NQYXJ0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSVJlbmRlcmVkTWFya2Rvd24sIE1hcmtkb3duUmVuZGVyT3B0aW9ucywgcmVuZGVyQXNQbGFpbnRleHQsIHJlbmRlck1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIElubGluZVRleHRNb2RlbENvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgQ2hhdEF1dG9tYXRpb25Db25maWd1cmVkUmVzdWx0U3ViUGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0QXV0b21hdGlvbkNvbmZpZ3VyZWRSZXN1bHRTdWJQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUb29sSW52b2NhdGlvblBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdFRvb2xJbnZvY2F0aW9uUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsUGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsUGFydC5qcyc7XG5pbXBvcnQgeyBCYXNlQ2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUb29sUHJvZ3Jlc3NTdWJQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sUHJvZ3Jlc3NQYXJ0LmpzJztcbmltcG9ydCB7IGlzQXNrUXVlc3Rpb25zVG9vbEludm9jYXRpb24sIGlzTWNwVG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdFRvb2xQYXJ0VXRpbGl0aWVzLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JQb29sLCBFZGl0b3JQb29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29udGVudENvZGVQb29scy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEF1dG9tYXRpb25Db25maWd1cmVkRGF0YSwgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSwgSUNoYXRUb29sSW52b2NhdGlvbiwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgVG9vbERhdGFTb3VyY2UsIHR5cGUgVG9vbERhdGFTb3VyY2UgYXMgVG9vbERhdGFTb3VyY2VUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29sbGFwc2libGVMaXN0UG9vbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdFJlZmVyZW5jZXNDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvZG9MaXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9jaGF0VG9kb0xpc3RTZXJ2aWNlLmpzJztcblxuY2xhc3MgVGVzdFRvb2xJbnZvY2F0aW9uU3ViUGFydCBleHRlbmRzIEJhc2VDaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0IHtcblx0cmVhZG9ubHkgZG9tTm9kZSA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdGNvZGVibG9ja3MgPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcih0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiwgdGVybWluYWxEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhKSB7XG5cdFx0c3VwZXIodG9vbEludm9jYXRpb24pO1xuXHRcdHRoaXMuZG9tTm9kZS5kYXRhc2V0LnRlcm1pbmFsVG9vbFNlc3Npb25JZCA9IHRlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQgPz8gJyc7XG5cdH1cbn1cblxuc3VpdGUoJ0NoYXRUb29sUHJvZ3Jlc3NTdWJQYXJ0JywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFJldHVyblR5cGU8dHlwZW9mIHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlPjtcblx0bGV0IG1vY2tNYXJrZG93blJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcjtcblx0bGV0IG1vY2tBbmNob3JTZXJ2aWNlOiBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZTtcblx0bGV0IG1vY2tIb3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2U7XG5cdGxldCBtb2NrQ29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IG1vY2tFZGl0b3JQb29sOiBFZGl0b3JQb29sO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVJlbmRlckNvbnRleHQoaXNDb21wbGV0ZTogYm9vbGVhbiA9IGZhbHNlKTogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQge1xuXHRcdGNvbnN0IG1vY2tFbGVtZW50OiBQYXJ0aWFsPElDaGF0UmVzcG9uc2VWaWV3TW9kZWw+ID0ge1xuXHRcdFx0aXNDb21wbGV0ZSxcblx0XHRcdGlkOiAndGVzdC1yZXNwb25zZS1pZCcsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi8vdGVzdC9zZXNzaW9uMScpLFxuXHRcdFx0c2V0Vm90ZTogKCkgPT4geyB9LFxuXHRcdFx0Z2V0IG1vZGVsKCkgeyByZXR1cm4ge30gYXMgSUNoYXRSZXNwb25zZVZpZXdNb2RlbFsnbW9kZWwnXTsgfVxuXHRcdH07XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWxlbWVudDogbW9ja0VsZW1lbnQgYXMgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCxcblx0XHRcdGlubGluZVRleHRNb2RlbHM6IHt9IGFzIElubGluZVRleHRNb2RlbENvbGxlY3Rpb24sXG5cdFx0XHRlbGVtZW50SW5kZXg6IDAsXG5cdFx0XHRjb250YWluZXI6IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JyksXG5cdFx0XHRjb250ZW50OiBbXSxcblx0XHRcdGNvbnRlbnRJbmRleDogMCxcblx0XHRcdGVkaXRvclBvb2w6IG1vY2tFZGl0b3JQb29sLFxuXHRcdFx0Y29kZUJsb2NrU3RhcnRJbmRleDogMCxcblx0XHRcdHRyZWVTdGFydEluZGV4OiAwLFxuXHRcdFx0ZGlmZkVkaXRvclBvb2w6IHt9IGFzIERpZmZFZGl0b3JQb29sLFxuXHRcdFx0Y3VycmVudFdpZHRoOiBvYnNlcnZhYmxlVmFsdWUoJ2N1cnJlbnRXaWR0aCcsIDUwMCksXG5cdFx0XHRvbkRpZENoYW5nZVZpc2liaWxpdHk6IEV2ZW50Lk5vbmVcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2VyaWFsaXplZFRvb2xJbnZvY2F0aW9uKG9wdGlvbnM6IHtcblx0XHRzb3VyY2U/OiBUb29sRGF0YVNvdXJjZVR5cGU7XG5cdFx0dG9vbElkPzogc3RyaW5nO1xuXHRcdGlzQ29tcGxldGU/OiBib29sZWFuO1xuXHRcdGludm9jYXRpb25NZXNzYWdlPzogc3RyaW5nO1xuXHR9ID0ge30pOiBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByZXNlbnRhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogdW5kZWZpbmVkLFxuXHRcdFx0b3JpZ2luTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG9wdGlvbnMuaW52b2NhdGlvbk1lc3NhZ2UgPz8gJ1J1bm5pbmcgdG9vbC4uLicsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRyZXN1bHREZXRhaWxzOiB1bmRlZmluZWQsXG5cdFx0XHRpc0NvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0sXG5cdFx0XHRpc0NvbXBsZXRlOiBvcHRpb25zLmlzQ29tcGxldGUgPz8gZmFsc2UsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLWlkJyxcblx0XHRcdHRvb2xJZDogb3B0aW9ucy50b29sSWQgPz8gJ3Rlc3RfdG9vbCcsXG5cdFx0XHRzb3VyY2U6IG9wdGlvbnMuc291cmNlLFxuXHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCdcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlVG9vbEludm9jYXRpb24ob3B0aW9uczoge1xuXHRcdHNvdXJjZT86IFRvb2xEYXRhU291cmNlVHlwZTtcblx0XHR0b29sSWQ/OiBzdHJpbmc7XG5cdFx0aW52b2NhdGlvbk1lc3NhZ2U/OiBzdHJpbmc7XG5cdFx0cHJvZ3Jlc3NNZXNzYWdlPzogc3RyaW5nO1xuXHR9ID0ge30pOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHtcblx0XHRjb25zdCBzb3VyY2UgPSBvcHRpb25zLnNvdXJjZSA/PyBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbDtcblx0XHRjb25zdCB0b29sSWQgPSBvcHRpb25zLnRvb2xJZCA/PyAndGVzdF90b29sJztcblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRvcmlnaW5NZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogb3B0aW9ucy5pbnZvY2F0aW9uTWVzc2FnZSA/PyAnUnVubmluZyB0b29sLi4uJyxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHNvdXJjZSxcblx0XHRcdHRvb2xJZCxcblx0XHRcdHRvb2xDYWxsSWQ6ICdsaXZlLXRvb2wtY2FsbC1pZCcsXG5cdFx0XHRzdGF0ZTogb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZScsIHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0sXG5cdFx0XHRcdHByb2dyZXNzOiBvYnNlcnZhYmxlVmFsdWUoJ3Byb2dyZXNzJywgeyBtZXNzYWdlOiBvcHRpb25zLnByb2dyZXNzTWVzc2FnZSwgcHJvZ3Jlc3M6IHVuZGVmaW5lZCB9KVxuXHRcdFx0fSksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhS2luZDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgdW5kZWZpbmVkKSxcblx0XHRcdGlzQXR0YWNoZWRUb1RoaW5raW5nOiBmYWxzZSxcblx0XHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvbicsXG5cdFx0XHR0b0pTT046ICgpID0+IGNyZWF0ZVNlcmlhbGl6ZWRUb29sSW52b2NhdGlvbih7IHNvdXJjZSwgdG9vbElkLCBpbnZvY2F0aW9uTWVzc2FnZTogb3B0aW9ucy5pbnZvY2F0aW9uTWVzc2FnZSB9KVxuXHRcdH07XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXG5cdFx0bW9ja0NvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtb2NrQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0bW9ja01hcmtkb3duUmVuZGVyZXIgPSB7XG5cdFx0XHRyZW5kZXI6IChtYXJrZG93bjogSU1hcmtkb3duU3RyaW5nLCBfb3B0aW9ucz86IE1hcmtkb3duUmVuZGVyT3B0aW9ucywgb3V0RWxlbWVudD86IEhUTUxFbGVtZW50KTogSVJlbmRlcmVkTWFya2Rvd24gPT4ge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gb3V0RWxlbWVudCA/PyBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gdHlwZW9mIG1hcmtkb3duID09PSAnc3RyaW5nJyA/IG1hcmtkb3duIDogcmVuZGVyQXNQbGFpbnRleHQobWFya2Rvd24pO1xuXHRcdFx0XHRlbGVtZW50LnRleHRDb250ZW50ID0gY29udGVudDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRtb2NrQW5jaG9yU2VydmljZSA9IHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHJlZ2lzdGVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRsYXN0Rm9jdXNlZEFuY2hvcjogdW5kZWZpbmVkXG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLCBtb2NrQW5jaG9yU2VydmljZSk7XG5cblx0XHRtb2NrSG92ZXJTZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0c2hvd0hvdmVyOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzaG93RGVsYXllZEhvdmVyOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzaG93QW5kRm9jdXNMYXN0SG92ZXI6ICgpID0+IHsgfSxcblx0XHRcdGhpZGVIb3ZlcjogKCkgPT4geyB9LFxuXHRcdFx0c2V0dXBEZWxheWVkSG92ZXI6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRcdHNldHVwTWFuYWdlZEhvdmVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0sIHNob3c6ICgpID0+IHsgfSwgaGlkZTogKCkgPT4geyB9LCB1cGRhdGU6ICgpID0+IHsgfSB9KSxcblx0XHRcdHNob3dNYW5hZ2VkSG92ZXI6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGlzSG92ZXJlZDogKCkgPT4gZmFsc2UsXG5cdFx0fSBhcyB1bmtub3duIGFzIElIb3ZlclNlcnZpY2U7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSG92ZXJTZXJ2aWNlLCBtb2NrSG92ZXJTZXJ2aWNlKTtcblxuXHRcdG1vY2tFZGl0b3JQb29sID0ge30gYXMgRWRpdG9yUG9vbDtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gcmVuZGVyVG9vbEludm9jYXRpb24odG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCwgcmVuZGVyZXIgPSBtb2NrTWFya2Rvd25SZW5kZXJlcik6IENoYXRUb29sSW52b2NhdGlvblBhcnQge1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRUb29sSW52b2NhdGlvblBhcnQoXG5cdFx0XHR0b29sSW52b2NhdGlvbixcblx0XHRcdGNyZWF0ZVJlbmRlckNvbnRleHQoKSxcblx0XHRcdHJlbmRlcmVyLFxuXHRcdFx0e30gYXMgQ29sbGFwc2libGVMaXN0UG9vbCxcblx0XHRcdG1vY2tFZGl0b3JQb29sLFxuXHRcdFx0KCkgPT4gNTAwLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0MCxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0e1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uRGlkVXBkYXRlVG9kb3M6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGdldFRvZG9zOiAoKSA9PiBbXSxcblx0XHRcdFx0c2V0VG9kb3MoKSB7IH0sXG5cdFx0XHRcdG1pZ3JhdGVUb2RvcygpIHsgfSxcblx0XHRcdH0gc2F0aXNmaWVzIElDaGF0VG9kb0xpc3RTZXJ2aWNlLFxuXHRcdCkpO1xuXHR9XG5cblx0dGVzdCgnZG9lcyBub3QgcmV0YWluIGFuIG9yZGluYXJ5IHRvb2wgcGFydCB3aGVuIGl0IGJlY29tZXMgYSBwYXJlbnQgc3ViYWdlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52b2NhdGlvbiA9IGNyZWF0ZVRvb2xJbnZvY2F0aW9uKCk7XG5cdFx0Y29uc3QgcGFydCA9IHJlbmRlclRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24pO1xuXHRcdChpbnZvY2F0aW9uIGFzIHsgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUb29sSW52b2NhdGlvblsndG9vbFNwZWNpZmljRGF0YSddIH0pLnRvb2xTcGVjaWZpY0RhdGEgPSB7IGtpbmQ6ICdzdWJhZ2VudCcgfTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Lmhhc1NhbWVDb250ZW50KGludm9jYXRpb24sIFtdLCB7fSBhcyBuZXZlciksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlybWF0aW9uIGNhcm91c2VsIHJlcG9ydHMgdGhlIGFjdGl2ZSBzdWJhZ2VudCBhbmQgaW52b2tlcyBpdHMgcmVmZXJlbmNlIGFjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBjcmVhdGVQZW5kaW5nSW52b2NhdGlvbiA9ICh0b29sQ2FsbElkOiBzdHJpbmcpOiBJQ2hhdFRvb2xJbnZvY2F0aW9uID0+ICh7XG5cdFx0XHQuLi5jcmVhdGVUb29sSW52b2NhdGlvbigpLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdHN0YXRlOiBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4oYHN0YXRlLSR7dG9vbENhbGxJZH1gLCB7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6ICdSdW4gY29tbWFuZD8nLCBtZXNzYWdlOiAnUnVuIGNvbW1hbmQ/JyB9LFxuXHRcdFx0XHRjb25maXJtOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHR9KTtcblx0XHRjb25zdCBjcmVhdGVFeHRlcm5hbFBhcnQgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBkb21Ob2RlID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGRvbU5vZGUuY2xhc3NOYW1lID0gJ2NoYXQtdG9vbC1pbnZvY2F0aW9uLXBhcnQnO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZG9tTm9kZSxcblx0XHRcdFx0YWRkRGlzcG9zYWJsZTogKGRpc3Bvc2FibGU6IHsgZGlzcG9zZSgpOiB2b2lkIH0pID0+IGRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlKSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBDaGF0VG9vbEludm9jYXRpb25QYXJ0O1xuXHRcdH07XG5cdFx0Y29uc3QgcmV2ZWFsZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgYWN0aXZlOiBBcnJheTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gW107XG5cdFx0Y29uc3QgY2Fyb3VzZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxQYXJ0KCgpID0+IHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRXh0ZXJuYWwgdG9vbCBwYXJ0cyBzaG91bGQgYmUgcmV1c2VkJyk7XG5cdFx0fSwgW10pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY2Fyb3VzZWwub25EaWRDaGFuZ2VBY3RpdmVTdWJhZ2VudChpZCA9PiBhY3RpdmUucHVzaChpZCkpKTtcblx0XHRjYXJvdXNlbC5hZGRUb29sSW52b2NhdGlvbihjcmVhdGVQZW5kaW5nSW52b2NhdGlvbignZmlyc3QnKSwgJ3N1YmFnZW50LW9uZScsICdvbmUnLCBpZCA9PiByZXZlYWxlZC5wdXNoKGlkKSwgJ09wZW4gb25lIENoYXQnLCBjcmVhdGVFeHRlcm5hbFBhcnQoKSk7XG5cdFx0Y2Fyb3VzZWwuYWRkVG9vbEludm9jYXRpb24oY3JlYXRlUGVuZGluZ0ludm9jYXRpb24oJ3NlY29uZCcpLCAnc3ViYWdlbnQtdHdvJywgJ3R3bycsIGlkID0+IHJldmVhbGVkLnB1c2goaWQpLCAnT3BlbiB0d28gQ2hhdCcsIGNyZWF0ZUV4dGVybmFsUGFydCgpKTtcblxuXHRcdGNhcm91c2VsLmFjdGl2YXRlRmlyc3RUb29sRm9yU3ViYWdlbnQoJ3N1YmFnZW50LXR3bycpO1xuXHRcdGNvbnN0IGFnZW50TGFiZWwgPSBjYXJvdXNlbC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcuY2hhdC10b29sLWNhcm91c2VsLWFnZW50LWxhYmVsJyk7XG5cdFx0YWdlbnRMYWJlbD8uY2xpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWN0aXZlLFxuXHRcdFx0cmV2ZWFsZWQsXG5cdFx0XHRsYWJlbDogYWdlbnRMYWJlbD8udGl0bGUsXG5cdFx0fSwge1xuXHRcdFx0YWN0aXZlOiBbJ3N1YmFnZW50LW9uZScsICdzdWJhZ2VudC10d28nXSxcblx0XHRcdHJldmVhbGVkOiBbJ3N1YmFnZW50LXR3byddLFxuXHRcdFx0bGFiZWw6ICdPcGVuIHR3byBDaGF0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0cyBNQ1AgdG9vbCBpbnZvY2F0aW9ucyBmb3IgbGl2ZSBhbmQgc2VyaWFsaXplZCByb3dzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1jcFNvdXJjZTogVG9vbERhdGFTb3VyY2VUeXBlID0ge1xuXHRcdFx0dHlwZTogJ21jcCcsXG5cdFx0XHRsYWJlbDogJ1dlYXRoZXIgTUNQJyxcblx0XHRcdHNlcnZlckxhYmVsOiAnV2VhdGhlcicsXG5cdFx0XHRpbnN0cnVjdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdGNvbGxlY3Rpb25JZDogJ2NvbGxlY3Rpb24nLFxuXHRcdFx0ZGVmaW5pdGlvbklkOiAnZGVmaW5pdGlvbidcblx0XHR9O1xuXG5cdFx0Y29uc3QgY2FzZXMgPSBbXG5cdFx0XHRpc01jcFRvb2xJbnZvY2F0aW9uKGNyZWF0ZVRvb2xJbnZvY2F0aW9uKHsgc291cmNlOiBtY3BTb3VyY2UgfSkpLFxuXHRcdFx0aXNNY3BUb29sSW52b2NhdGlvbihjcmVhdGVTZXJpYWxpemVkVG9vbEludm9jYXRpb24oeyBzb3VyY2U6IHVuZGVmaW5lZCwgdG9vbElkOiAnbWNwX193ZWF0aGVyJyB9KSksXG5cdFx0XHRpc01jcFRvb2xJbnZvY2F0aW9uKGNyZWF0ZVNlcmlhbGl6ZWRUb29sSW52b2NhdGlvbih7IHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsIHRvb2xJZDogJ2ZldGNoX3dlYnBhZ2UnIH0pKVxuXHRcdF07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhc2VzLCBbdHJ1ZSwgdHJ1ZSwgZmFsc2VdKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0cyBhbGwgYXNrLXF1ZXN0aW9uIHRvb2wgbmFtZXMgZm9yIHRvcC1sZXZlbCByZW5kZXJpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbE5hbWVzID0gWydjb3BpbG90X2Fza1F1ZXN0aW9ucycsICd2c2NvZGVfYXNrUXVlc3Rpb25zJywgJ2Fza191c2VyJywgJ0Fza1VzZXJRdWVzdGlvbicsICdyZXF1ZXN0X3VzZXJfaW5wdXQnXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xOYW1lcy5tYXAodG9vbElkID0+IGlzQXNrUXVlc3Rpb25zVG9vbEludm9jYXRpb24oY3JlYXRlVG9vbEludm9jYXRpb24oeyB0b29sSWQgfSkpKSwgW3RydWUsIHRydWUsIHRydWUsIHRydWUsIHRydWVdKTtcblx0fSk7XG5cblx0dGVzdCgncmVuZGVycyB0aGUgYXV0b21hdGlvbiByZXN1bHQgc3VicGFydCBmb3IgY29uZmlndXJlZCBhdXRvbWF0aW9uIGRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQgPSB7XG5cdFx0XHQuLi5jcmVhdGVTZXJpYWxpemVkVG9vbEludm9jYXRpb24oeyBpc0NvbXBsZXRlOiB0cnVlIH0pLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRraW5kOiAnYXV0b21hdGlvbkNvbmZpZ3VyZWQnLFxuXHRcdFx0XHRhdXRvbWF0aW9uSWQ6ICdhdXRvbWF0aW9uLTEnLFxuXHRcdFx0XHRhdXRvbWF0aW9uTmFtZTogJ01vcm5pbmcgcmV2aWV3Jyxcblx0XHRcdFx0b3BlcmF0aW9uOiAnY3JlYXRlZCcsXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY3JlYXRlSW5zdGFuY2VTdHViID0gc2lub24uc3R1YihpbnN0YW50aWF0aW9uU2VydmljZSwgJ2NyZWF0ZUluc3RhbmNlJykuY2FsbHNGYWtlKChfY3RvciwgLi4uYXJncykgPT4ge1xuXHRcdFx0cmV0dXJuIG5ldyBUZXN0VG9vbEludm9jYXRpb25TdWJQYXJ0KGFyZ3NbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvbiwge1xuXHRcdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHRjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJycgfSxcblx0XHRcdFx0bGFuZ3VhZ2U6ICdzaGVsbHNjcmlwdCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNyZWF0ZUluc3RhbmNlU3R1Yi5yZXN0b3JlKCkpKTtcblxuXHRcdHJlbmRlclRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZUluc3RhbmNlU3R1Yi5maXJzdENhbGwuYXJnc1swXSwgQ2hhdEF1dG9tYXRpb25Db25maWd1cmVkUmVzdWx0U3ViUGFydCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlcnMgY29kaWNvbiBzeW50YXggaW4gYW4gYXV0b21hdGlvbiBuYW1lIGFzIGxpdGVyYWwgdGV4dCcsICgpID0+IHtcblx0XHRjb25zdCByZW5kZXIgPSAoYXV0b21hdGlvbk5hbWU6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgcGFydCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdEF1dG9tYXRpb25Db25maWd1cmVkUmVzdWx0U3ViUGFydCxcblx0XHRcdFx0Y3JlYXRlU2VyaWFsaXplZFRvb2xJbnZvY2F0aW9uKHsgaXNDb21wbGV0ZTogdHJ1ZSB9KSxcblx0XHRcdFx0eyBraW5kOiAnYXV0b21hdGlvbkNvbmZpZ3VyZWQnLCBhdXRvbWF0aW9uSWQ6ICdhdXRvbWF0aW9uLTEnLCBhdXRvbWF0aW9uTmFtZSwgb3BlcmF0aW9uOiAnY3JlYXRlZCcgfSBzYXRpc2ZpZXMgSUNoYXRBdXRvbWF0aW9uQ29uZmlndXJlZERhdGEsXG5cdFx0XHRcdGNyZWF0ZVJlbmRlckNvbnRleHQoKSxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHQpKTtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtb3Blbi1zZXNzaW9uLWJ1dHRvbicpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGV4dDogYnV0dG9uPy50ZXh0Q29udGVudCxcblx0XHRcdFx0YXJpYUxhYmVsOiBidXR0b24/LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLFxuXHRcdFx0XHR0YWJJbmRleDogYnV0dG9uPy50YWJJbmRleCxcblx0XHRcdFx0d2F0Y2hJY29uSXNDaGlsZDogISFidXR0b24/LnF1ZXJ5U2VsZWN0b3IoJy5jb2RpY29uLXdhdGNoJyksXG5cdFx0XHRcdC8vIGBjb2RpY29uLSpgIG9uIHRoZSByb290IHdvdWxkIHJlc3R5bGUgdGhlIGxhYmVsIHRleHQuXG5cdFx0XHRcdHJvb3RDYXJyaWVzQ29kaWNvbkNsYXNzOiBidXR0b24/LmNsYXNzTGlzdC5jb250YWlucygnY29kaWNvbicpLFxuXHRcdFx0XHRpbmplY3RlZEljb25zOiBbLi4uYnV0dG9uPy5xdWVyeVNlbGVjdG9yQWxsKCcuY29kaWNvbicpID8/IFtdXVxuXHRcdFx0XHRcdC5mbGF0TWFwKGVsID0+IFsuLi5lbC5jbGFzc0xpc3RdKS5maWx0ZXIoYyA9PiBjLnN0YXJ0c1dpdGgoJ2NvZGljb24tJykpLFxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbcmVuZGVyKCckKGVycm9yKScpLCByZW5kZXIoJ2EgXFxcXCQoZXJyb3IpIGInKV0sIFtcblx0XHRcdHtcblx0XHRcdFx0dGV4dDogJ0NyZWF0ZWQgYW4gYXV0b21hdGlvbjogJChlcnJvciknLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdPcGVuIGF1dG9tYXRpb24gJChlcnJvciknLFxuXHRcdFx0XHR0YWJJbmRleDogMCxcblx0XHRcdFx0d2F0Y2hJY29uSXNDaGlsZDogdHJ1ZSxcblx0XHRcdFx0cm9vdENhcnJpZXNDb2RpY29uQ2xhc3M6IGZhbHNlLFxuXHRcdFx0XHRpbmplY3RlZEljb25zOiBbJ2NvZGljb24td2F0Y2gnXSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHRleHQ6ICdDcmVhdGVkIGFuIGF1dG9tYXRpb246IGEgXFxcXCQoZXJyb3IpIGInLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdPcGVuIGF1dG9tYXRpb24gYSBcXFxcJChlcnJvcikgYicsXG5cdFx0XHRcdHRhYkluZGV4OiAwLFxuXHRcdFx0XHR3YXRjaEljb25Jc0NoaWxkOiB0cnVlLFxuXHRcdFx0XHRyb290Q2Fycmllc0NvZGljb25DbGFzczogZmFsc2UsXG5cdFx0XHRcdGluamVjdGVkSWNvbnM6IFsnY29kaWNvbi13YXRjaCddLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVyZW5kZXJzIHdoZW4gdGVybWluYWwgbWV0YWRhdGEgY2hhbmdlcyB3aXRob3V0IGNoYW5naW5nIGRhdGEga2luZCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlPignc3RhdGUnLCB7XG5cdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHRwYXJhbWV0ZXJzOiB1bmRlZmluZWQsXG5cdFx0XHRjb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0cHJvZ3Jlc3M6IG9ic2VydmFibGVWYWx1ZSgncHJvZ3Jlc3MnLCB7IHByb2dyZXNzOiB1bmRlZmluZWQgfSksXG5cdFx0fSk7XG5cdFx0bGV0IHRlcm1pbmFsRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJ2VjaG8gdGVzdCcgfSxcblx0XHRcdGxhbmd1YWdlOiAnc2hlbGxzY3JpcHQnLFxuXHRcdH07XG5cdFx0Y29uc3QgaW52b2NhdGlvbiA9IHtcblx0XHRcdC4uLmNyZWF0ZVRvb2xJbnZvY2F0aW9uKCksXG5cdFx0XHRnZXQgdG9vbFNwZWNpZmljRGF0YSgpIHsgcmV0dXJuIHRlcm1pbmFsRGF0YTsgfSxcblx0XHRcdHN0YXRlLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YUtpbmQ6IG9ic2VydmFibGVWYWx1ZSgna2luZCcsICd0ZXJtaW5hbCcpLFxuXHRcdH0gYXMgSUNoYXRUb29sSW52b2NhdGlvbjtcblx0XHRjb25zdCBjcmVhdGVJbnN0YW5jZVN0dWIgPSBzaW5vbi5zdHViKGluc3RhbnRpYXRpb25TZXJ2aWNlLCAnY3JlYXRlSW5zdGFuY2UnKS5jYWxsc0Zha2UoKF9jdG9yLCAuLi5hcmdzKSA9PiB7XG5cdFx0XHRyZXR1cm4gbmV3IFRlc3RUb29sSW52b2NhdGlvblN1YlBhcnQoYXJnc1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBhcmdzWzFdIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEpO1xuXHRcdH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3JlYXRlSW5zdGFuY2VTdHViLnJlc3RvcmUoKSkpO1xuXHRcdGNvbnN0IHBhcnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRUb29sSW52b2NhdGlvblBhcnQoXG5cdFx0XHRpbnZvY2F0aW9uLFxuXHRcdFx0Y3JlYXRlUmVuZGVyQ29udGV4dCgpLFxuXHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHR7fSBhcyBDb2xsYXBzaWJsZUxpc3RQb29sLFxuXHRcdFx0bW9ja0VkaXRvclBvb2wsXG5cdFx0XHQoKSA9PiA1MDAsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQwLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHR7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0b25EaWRVcGRhdGVUb2RvczogRXZlbnQuTm9uZSxcblx0XHRcdFx0Z2V0VG9kb3M6ICgpID0+IFtdLFxuXHRcdFx0XHRzZXRUb2RvcygpIHsgfSxcblx0XHRcdFx0bWlncmF0ZVRvZG9zKCkgeyB9LFxuXHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRUb2RvTGlzdFNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkQmVmb3JlVXBkYXRlID0gcGFydC5kb21Ob2RlLmZpcnN0RWxlbWVudENoaWxkPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGVybWluYWwtdG9vbC1zZXNzaW9uLWlkJyk7XG5cblx0XHR0ZXJtaW5hbERhdGEgPSB7IC4uLnRlcm1pbmFsRGF0YSwgdGVybWluYWxUb29sU2Vzc2lvbklkOiAndGVybWluYWwtc2Vzc2lvbicgfTtcblx0XHRzdGF0ZS5zZXQoeyAuLi5zdGF0ZS5nZXQoKSB9LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZW5kZXJDb3VudDogY3JlYXRlSW5zdGFuY2VTdHViLmNhbGxDb3VudCxcblx0XHRcdHNlc3Npb25JZEJlZm9yZVVwZGF0ZSxcblx0XHRcdHNlc3Npb25JZEFmdGVyVXBkYXRlOiBwYXJ0LmRvbU5vZGUuZmlyc3RFbGVtZW50Q2hpbGQ/LmdldEF0dHJpYnV0ZSgnZGF0YS10ZXJtaW5hbC10b29sLXNlc3Npb24taWQnKSxcblx0XHR9LCB7XG5cdFx0XHRyZW5kZXJDb3VudDogMixcblx0XHRcdHNlc3Npb25JZEJlZm9yZVVwZGF0ZTogJycsXG5cdFx0XHRzZXNzaW9uSWRBZnRlclVwZGF0ZTogJ3Rlcm1pbmFsLXNlc3Npb24nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBhZGQgc2hpbW1lciBzdHlsaW5nIGZvciBhY3RpdmUgTUNQIHRvb2wgcHJvZ3Jlc3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWNwVG9vbCA9IGNyZWF0ZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdHNvdXJjZToge1xuXHRcdFx0XHR0eXBlOiAnbWNwJyxcblx0XHRcdFx0bGFiZWw6ICdXZWF0aGVyIE1DUCcsXG5cdFx0XHRcdHNlcnZlckxhYmVsOiAnV2VhdGhlcicsXG5cdFx0XHRcdGluc3RydWN0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb2xsZWN0aW9uSWQ6ICdjb2xsZWN0aW9uJyxcblx0XHRcdFx0ZGVmaW5pdGlvbklkOiAnZGVmaW5pdGlvbidcblx0XHRcdH0sXG5cdFx0XHR0b29sSWQ6ICd3ZWF0aGVyX2xvb2t1cCdcblx0XHR9KTtcblxuXHRcdGNvbnN0IHBhcnQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0VG9vbFByb2dyZXNzU3ViUGFydCxcblx0XHRcdG1jcFRvb2wsXG5cdFx0XHRjcmVhdGVSZW5kZXJDb250ZXh0KGZhbHNlKSxcblx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0bmV3IFNldDxzdHJpbmc+KClcblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLnNoaW1tZXItcHJvZ3Jlc3MnKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZHMgc2hpbW1lciBzdHlsaW5nIG9ubHkgZm9yIGFjdGl2ZSBhc2sgcXVlc3Rpb25zIGludm9jYXRpb24gcHJvZ3Jlc3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXNrUXVlc3Rpb25zVG9vbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRUb29sUHJvZ3Jlc3NTdWJQYXJ0LFxuXHRcdFx0Y3JlYXRlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sSWQ6ICd2c2NvZGVfYXNrUXVlc3Rpb25zJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdBc2tpbmcgYSBxdWVzdGlvbiAoVGFyZ2V0KSdcblx0XHRcdH0pLFxuXHRcdFx0Y3JlYXRlUmVuZGVyQ29udGV4dChmYWxzZSksXG5cdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdG5ldyBTZXQ8c3RyaW5nPigpXG5cdFx0KSk7XG5cdFx0Y29uc3QgYXNrTXVsdGlwbGVRdWVzdGlvbnNUb29sID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFRvb2xQcm9ncmVzc1N1YlBhcnQsXG5cdFx0XHRjcmVhdGVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xJZDogJ3ZzY29kZV9hc2tRdWVzdGlvbnMnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0Fza2luZyAzIHF1ZXN0aW9ucyAoV2hhdCBzaG91bGQgd2Ugd29yayBvbj8sIFByZWZlcnJlZCBhcmVhLCBIb3cgaGFuZHMtb24/KSdcblx0XHRcdH0pLFxuXHRcdFx0Y3JlYXRlUmVuZGVyQ29udGV4dChmYWxzZSksXG5cdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdG5ldyBTZXQ8c3RyaW5nPigpXG5cdFx0KSk7XG5cdFx0Y29uc3QgYW5hbHl6aW5nQW5zd2Vyc1Rvb2wgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0VG9vbFByb2dyZXNzU3ViUGFydCxcblx0XHRcdGNyZWF0ZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbElkOiAndnNjb2RlX2Fza1F1ZXN0aW9ucycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnQXNraW5nIGEgcXVlc3Rpb24gKFRhcmdldCknLFxuXHRcdFx0XHRwcm9ncmVzc01lc3NhZ2U6ICdBbmFseXppbmcgeW91ciBhbnN3ZXJzLi4uJ1xuXHRcdFx0fSksXG5cdFx0XHRjcmVhdGVSZW5kZXJDb250ZXh0KGZhbHNlKSxcblx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0bmV3IFNldDxzdHJpbmc+KClcblx0XHQpKTtcblx0XHRjb25zdCB3YWl0aW5nRm9yQW5zd2VyVG9vbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRUb29sUHJvZ3Jlc3NTdWJQYXJ0LFxuXHRcdFx0Y3JlYXRlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sSWQ6ICdhc2tfdXNlcicsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV2FpdGluZyBmb3IgYW5zd2VyLi4uJ1xuXHRcdFx0fSksXG5cdFx0XHRjcmVhdGVSZW5kZXJDb250ZXh0KGZhbHNlKSxcblx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0bmV3IFNldDxzdHJpbmc+KClcblx0XHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0ISFhc2tRdWVzdGlvbnNUb29sLmRvbU5vZGUucXVlcnlTZWxlY3RvcignLnNoaW1tZXItcHJvZ3Jlc3MnKSxcblx0XHRcdGFza1F1ZXN0aW9uc1Rvb2wuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wcm9ncmVzcy1zaGltbWVyLXRleHQnKT8udGV4dENvbnRlbnQsXG5cdFx0XHRhc2tRdWVzdGlvbnNUb29sLmRvbU5vZGUudGV4dENvbnRlbnQsXG5cdFx0XHRhc2tNdWx0aXBsZVF1ZXN0aW9uc1Rvb2wuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wcm9ncmVzcy1zaGltbWVyLXRleHQnKT8udGV4dENvbnRlbnQsXG5cdFx0XHRhc2tNdWx0aXBsZVF1ZXN0aW9uc1Rvb2wuZG9tTm9kZS50ZXh0Q29udGVudCxcblx0XHRcdCEhYW5hbHl6aW5nQW5zd2Vyc1Rvb2wuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuc2hpbW1lci1wcm9ncmVzcycpLFxuXHRcdFx0YW5hbHl6aW5nQW5zd2Vyc1Rvb2wuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wcm9ncmVzcy1zaGltbWVyLXRleHQnKT8udGV4dENvbnRlbnQsXG5cdFx0XHQhIXdhaXRpbmdGb3JBbnN3ZXJUb29sLmRvbU5vZGUucXVlcnlTZWxlY3RvcignLnNoaW1tZXItcHJvZ3Jlc3MnKVxuXHRcdF0sIFt0cnVlLCAnQXNraW5nIGEgcXVlc3Rpb24nLCAnQXNraW5nIGEgcXVlc3Rpb24gKFRhcmdldCknLCAnQXNraW5nIDMgcXVlc3Rpb25zJywgJ0Fza2luZyAzIHF1ZXN0aW9ucyAoV2hhdCBzaG91bGQgd2Ugd29yayBvbj8sIFByZWZlcnJlZCBhcmVhLCBIb3cgaGFuZHMtb24/KScsIGZhbHNlLCB1bmRlZmluZWQsIHRydWVdKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVuZGVyIGEgbG9hZGluZyBpY29uIGZvciBydW4gcGxheXdyaWdodCBjb2RlIHByb2dyZXNzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2wgPSBjcmVhdGVUb29sSW52b2NhdGlvbih7XG5cdFx0XHR0b29sSWQ6ICdydW5fcGxheXdyaWdodF9jb2RlJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBQbGF5d3JpZ2h0IGNvZGUuLi4nXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwYXJ0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFRvb2xQcm9ncmVzc1N1YlBhcnQsXG5cdFx0XHR0b29sLFxuXHRcdFx0Y3JlYXRlUmVuZGVyQ29udGV4dChmYWxzZSksXG5cdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdG5ldyBTZXQ8c3RyaW5nPigpXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jb2RpY29uLWxvYWRpbmcnKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGFkZCBzaGltbWVyIHN0eWxpbmcgZm9yIG5vbi1NQ1AgdG9vbCBwcm9ncmVzcycsICgpID0+IHtcblx0XHRjb25zdCB0b29sID0gY3JlYXRlU2VyaWFsaXplZFRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHR0b29sSWQ6ICdmZXRjaF93ZWJwYWdlJ1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcGFydCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRUb29sUHJvZ3Jlc3NTdWJQYXJ0LFxuXHRcdFx0dG9vbCxcblx0XHRcdGNyZWF0ZVJlbmRlckNvbnRleHQoZmFsc2UpLFxuXHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRuZXcgU2V0PHN0cmluZz4oKVxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuc2hpbW1lci1wcm9ncmVzcycpLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgncmVuZGVycyBhbm90aGVyIGNsaWVudCB0b29sIHdpdGggYW4gYWNjZXNzaWJsZSBpbmxpbmUgc2tpcCBhY3Rpb24nLCAoKSA9PiB7XG5cdFx0bGV0IGNhbmNlbENvdW50ID0gMDtcblx0XHRjb25zdCBzdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlPignc3RhdGUnLCB7XG5cdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHRwYXJhbWV0ZXJzOiB1bmRlZmluZWQsXG5cdFx0XHRjb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0cHJvZ3Jlc3M6IG9ic2VydmFibGVWYWx1ZSgncHJvZ3Jlc3MnLCB7IHByb2dyZXNzOiB1bmRlZmluZWQgfSksXG5cdFx0fSk7XG5cdFx0Y29uc3QgaW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdC4uLmNyZWF0ZVRvb2xJbnZvY2F0aW9uKHsgaW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIFJ1biBUYXNrIG9uIGFub3RoZXIgY2xpZW50Li4uJyB9KSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gVGFzaycsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdG90aGVyQ2xpZW50VG9vbENhbGw6IHtcblx0XHRcdFx0Y2FuY2VsOiAoKSA9PiB7XG5cdFx0XHRcdFx0Y2FuY2VsQ291bnQrKztcblx0XHRcdFx0XHRzdGF0ZS5zZXQoe1xuXHRcdFx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ29tcGxldGVkLFxuXHRcdFx0XHRcdFx0cGFyYW1ldGVyczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGNvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0sXG5cdFx0XHRcdFx0XHRwb3N0Q29uZmlybWVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRyZXN1bHREZXRhaWxzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRjb250ZW50Rm9yTW9kZWw6IFtdLFxuXHRcdFx0XHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBtYXJrZG93blJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlciA9IHtcblx0XHRcdHJlbmRlcjogKG1hcmtkb3duLCBvcHRpb25zKSA9PiByZW5kZXJNYXJrZG93bihtYXJrZG93biwgb3B0aW9ucyksXG5cdFx0fTtcblx0XHRjb25zdCBwYXJ0ID0gcmVuZGVyVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwgbWFya2Rvd25SZW5kZXJlcik7XG5cdFx0Y29uc3Qgc2tpcExpbmsgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MQW5jaG9yRWxlbWVudD4oJ2FbZGF0YS1ocmVmPVwiI3NraXBcIl0nKTtcblx0XHRjb25zdCBwcm9ncmVzc1RleHQgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLnByb2dyZXNzLXN0ZXAnKT8udGV4dENvbnRlbnQ/LnJlcGxhY2VBbGwoJ1xcdTAwYTAnLCAnICcpO1xuXHRcdGNvbnN0IGxpbmtQYXJhZ3JhcGhUZXh0ID0gc2tpcExpbms/LmNsb3Nlc3QoJ3AnKT8udGV4dENvbnRlbnQ/LnJlcGxhY2VBbGwoJ1xcdTAwYTAnLCAnICcpO1xuXHRcdGNvbnN0IGxpbmtMYWJlbCA9IHNraXBMaW5rPy50ZXh0Q29udGVudDtcblx0XHRjb25zdCBsaW5rUm9sZSA9IHNraXBMaW5rPy5nZXRBdHRyaWJ1dGUoJ3JvbGUnKTtcblx0XHRjb25zdCBsaW5rSHJlZiA9IHNraXBMaW5rPy5nZXRBdHRyaWJ1dGUoJ2hyZWYnKTtcblx0XHRjb25zdCB0YWJJbmRleCA9IHNraXBMaW5rPy50YWJJbmRleDtcblxuXHRcdHNraXBMaW5rPy5jbGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcm9ncmVzc1RleHQsXG5cdFx0XHRsaW5rUGFyYWdyYXBoVGV4dCxcblx0XHRcdHRleHRBZnRlclNraXA6IHBhcnQuZG9tTm9kZS50ZXh0Q29udGVudD8ucmVwbGFjZUFsbCgnXFx1MDBhMCcsICcgJyksXG5cdFx0XHRsaW5rQWZ0ZXJTa2lwOiBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignYVtkYXRhLWhyZWY9XCIjc2tpcFwiXScpLFxuXHRcdFx0bGlua0xhYmVsLFxuXHRcdFx0bGlua1JvbGUsXG5cdFx0XHRsaW5rSHJlZixcblx0XHRcdHRhYkluZGV4LFxuXHRcdFx0Y2FuY2VsQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0cHJvZ3Jlc3NUZXh0OiAnUnVubmluZyBSdW4gVGFzayBvbiBhbm90aGVyIGNsaWVudC4uLiBTa2lwPycsXG5cdFx0XHRsaW5rUGFyYWdyYXBoVGV4dDogJ1J1bm5pbmcgUnVuIFRhc2sgb24gYW5vdGhlciBjbGllbnQuLi4gU2tpcD8nLFxuXHRcdFx0dGV4dEFmdGVyU2tpcDogJ1JhbiBUYXNrJyxcblx0XHRcdGxpbmtBZnRlclNraXA6IG51bGwsXG5cdFx0XHRsaW5rTGFiZWw6ICdTa2lwPycsXG5cdFx0XHRsaW5rUm9sZTogJ2J1dHRvbicsXG5cdFx0XHRsaW5rSHJlZjogJycsXG5cdFx0XHR0YWJJbmRleDogMCxcblx0XHRcdGNhbmNlbENvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBhZGQgc2hpbW1lciBzdHlsaW5nIGZvciBjb21wbGV0ZWQgTUNQIHRvb2wgcHJvZ3Jlc3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWNwVG9vbCA9IGNyZWF0ZVNlcmlhbGl6ZWRUb29sSW52b2NhdGlvbih7XG5cdFx0XHRzb3VyY2U6IHtcblx0XHRcdFx0dHlwZTogJ21jcCcsXG5cdFx0XHRcdGxhYmVsOiAnV2VhdGhlciBNQ1AnLFxuXHRcdFx0XHRzZXJ2ZXJMYWJlbDogJ1dlYXRoZXInLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29sbGVjdGlvbklkOiAnY29sbGVjdGlvbicsXG5cdFx0XHRcdGRlZmluaXRpb25JZDogJ2RlZmluaXRpb24nXG5cdFx0XHR9LFxuXHRcdFx0dG9vbElkOiAnd2VhdGhlcl9sb29rdXAnXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwYXJ0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFRvb2xQcm9ncmVzc1N1YlBhcnQsXG5cdFx0XHRtY3BUb29sLFxuXHRcdFx0Y3JlYXRlUmVuZGVyQ29udGV4dChmYWxzZSksXG5cdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdG5ldyBTZXQ8c3RyaW5nPigpXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5zaGltbWVyLXByb2dyZXNzJyksIG51bGwpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksV0FBVztBQUN2QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQW1ELG1CQUFtQixzQkFBc0I7QUFFNUYsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsa0NBQWtDO0FBRTNDLFNBQVMsNkNBQTZDO0FBQ3RELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsOEJBQThCLDJCQUEyQjtBQUVsRSxTQUF5RSxxQkFBb0QsdUJBQXVCO0FBRXBKLFNBQVMsc0JBQWlFO0FBSTFFLE1BQU0sa0NBQWtDLDhCQUE4QjtBQUFBLEVBSXJFLFlBQVksZ0JBQXFDLGNBQStDO0FBQy9GLFVBQU0sY0FBYztBQUpyQixTQUFTLFVBQVUsV0FBVyxTQUFTLGNBQWMsS0FBSztBQUMxRCxzQkFBYSxDQUFDO0FBSWIsU0FBSyxRQUFR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
