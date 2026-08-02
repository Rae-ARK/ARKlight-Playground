import assert from "assert";
import { isHTMLElement } from "../../../../../../../base/browser/dom.js";
import { ActionViewItem } from "../../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Action } from "../../../../../../../base/common/actions.js";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { TestMenuService, workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { ChatCollapsibleContentPart } from "../../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js";
import { ChatSubagentContentPart } from "../../../../browser/widget/chatContentParts/chatSubagentContentPart.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { IChatMarkdownAnchorService } from "../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js";
import { isMarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { AccessibilityWorkbenchSettingId } from "../../../../../accessibility/browser/accessibilityConfiguration.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { RunSubagentTool } from "../../../../common/tools/builtinTools/runSubagentTool.js";
import { ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
import { IAccessibilityService } from "../../../../../../../platform/accessibility/common/accessibility.js";
import { TestAccessibilityService } from "../../../../../../../platform/accessibility/test/common/testAccessibilityService.js";
import { IActionViewItemService } from "../../../../../../../platform/actions/browser/actionViewItemService.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../../../../platform/commands/common/commands.js";
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID } from "../../../../common/constants.js";
class TestOpenChatActionViewItem extends ActionViewItem {
  constructor(sourceAction, options) {
    super(void 0, new Action(sourceAction.id, sourceAction.label, sourceAction.class, true, (context) => sourceAction.run(context)), options);
    if (this.action instanceof Action) {
      this._register(this.action);
    }
  }
}
class TestActionViewItemService {
  constructor() {
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._providerAvailable = true;
  }
  get hasChangeListeners() {
    return this._onDidChange.hasListeners();
  }
  setProviderAvailable(available) {
    this._providerAvailable = available;
  }
  fireDidChange(menuId) {
    this._onDidChange.fire(menuId);
  }
  register(_menu, _commandId, _provider) {
    return { dispose: () => {
    } };
  }
  lookUp(menu, commandId) {
    if (!this._providerAvailable || menu !== MenuId.ChatSubagentContent || commandId !== CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID) {
      return void 0;
    }
    return (action, options) => new TestOpenChatActionViewItem(action, options);
  }
}
class TestSubagentMenuService extends TestMenuService {
  constructor(openChatAction) {
    super();
    this.openChatAction = openChatAction;
    this.createMenuCalls = 0;
    this.getMenuActionsCalls = 0;
  }
  createMenu(id, contextKeyService) {
    this.createMenuCalls++;
    return super.createMenu(id, contextKeyService);
  }
  getMenuActions(id, contextKeyService, options) {
    this.getMenuActionsCalls++;
    if (id === MenuId.ChatSubagentContent) {
      return [["navigation", [this.openChatAction]]];
    }
    return super.getMenuActions(id, contextKeyService, options);
  }
}
suite("ChatSubagentContentPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let instantiationService;
  let mockMarkdownRenderer;
  let mockAnchorService;
  let mockHoverService;
  let mockListPool;
  let mockEditorPool;
  let announcedToolProgressKeys;
  let actionViewItemService;
  let menuService;
  function createMockRenderContext(isComplete = false) {
    const mockElement = {
      isComplete,
      id: "test-response-id",
      sessionResource: URI.parse("chat-session://test/session1"),
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
  function createState(stateType, parameters) {
    switch (stateType) {
      case IChatToolInvocation.StateKind.Streaming:
        return {
          type: IChatToolInvocation.StateKind.Streaming,
          partialInput: observableValue("partialInput", {}),
          streamingMessage: observableValue("streamingMessage", void 0)
        };
      case IChatToolInvocation.StateKind.Completed:
        return {
          type: IChatToolInvocation.StateKind.Completed,
          parameters,
          confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
          resultDetails: void 0,
          postConfirmed: void 0,
          contentForModel: [{ kind: "text", value: "test result" }]
        };
      case IChatToolInvocation.StateKind.Executing:
        return {
          type: IChatToolInvocation.StateKind.Executing,
          parameters,
          confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
          progress: observableValue("progress", { message: void 0, progress: void 0 })
        };
      case IChatToolInvocation.StateKind.WaitingForAuthentication:
        return {
          type: IChatToolInvocation.StateKind.WaitingForAuthentication,
          parameters,
          confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
          server: {
            id: "server",
            name: "MCP server",
            resource: "https://mcp.example.com"
          },
          cancel: () => {
          }
        };
      case IChatToolInvocation.StateKind.WaitingForConfirmation:
        return {
          type: IChatToolInvocation.StateKind.WaitingForConfirmation,
          parameters,
          confirmationMessages: {
            title: "Confirm action",
            message: "Are you sure you want to proceed?"
          },
          confirm: () => {
          }
        };
      case IChatToolInvocation.StateKind.WaitingForPostApproval:
        return {
          type: IChatToolInvocation.StateKind.WaitingForPostApproval,
          parameters,
          confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
          resultDetails: void 0,
          contentForModel: [{ kind: "text", value: "test result" }],
          confirm: () => {
          }
        };
      case IChatToolInvocation.StateKind.Cancelled:
        return {
          type: IChatToolInvocation.StateKind.Cancelled,
          parameters,
          reason: ToolConfirmKind.Denied
        };
    }
  }
  function createMockToolInvocation(options = {}) {
    const stateType = options.stateType ?? IChatToolInvocation.StateKind.Streaming;
    const stateValue = createState(stateType, options.parameters);
    const toolCallId = options.toolCallId ?? "tool-call-" + Math.random().toString(36).substring(7);
    const toolInvocation = {
      presentation: void 0,
      toolSpecificData: options.toolSpecificData ?? {
        kind: "subagent",
        description: "Test subagent description",
        agentName: "TestAgent",
        prompt: "Test prompt"
      },
      originMessage: void 0,
      invocationMessage: options.invocationMessage ?? "Running subagent",
      pastTenseMessage: void 0,
      source: ToolDataSource.Internal,
      toolId: options.toolId ?? RunSubagentTool.Id,
      toolCallId,
      subAgentInvocationId: options.subAgentInvocationId,
      state: observableValue("state", stateValue),
      toolSpecificDataKind: observableValue("test", (options.toolSpecificData ?? { kind: "subagent" }).kind),
      isAttachedToThinking: false,
      kind: "toolInvocation",
      toJSON: () => createMockSerializedToolInvocation({
        toolId: options.toolId ?? RunSubagentTool.Id,
        subAgentInvocationId: options.subAgentInvocationId,
        toolSpecificData: options.toolSpecificData,
        isComplete: stateType === IChatToolInvocation.StateKind.Completed
      })
    };
    return toolInvocation;
  }
  function createMockSerializedToolInvocation(options = {}) {
    return {
      presentation: void 0,
      toolSpecificData: options.toolSpecificData ?? {
        kind: "subagent",
        description: "Test subagent description",
        agentName: "TestAgent",
        prompt: "Test prompt",
        result: "Test result text"
      },
      originMessage: void 0,
      invocationMessage: "Running subagent",
      pastTenseMessage: void 0,
      resultDetails: void 0,
      isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
      isComplete: options.isComplete ?? true,
      toolCallId: options.subAgentInvocationId ?? "test-tool-call-id",
      toolId: options.toolId ?? RunSubagentTool.Id,
      source: ToolDataSource.Internal,
      subAgentInvocationId: options.subAgentInvocationId,
      kind: "toolInvocationSerialized"
    };
  }
  setup(() => {
    disposables = store.add(new DisposableStore());
    instantiationService = workbenchInstantiationService(void 0, store);
    mockMarkdownRenderer = {
      render: (_markdown, _options, outElement) => {
        const element = outElement ?? mainWindow.document.createElement("div");
        const content = typeof _markdown === "string" ? _markdown : _markdown.value ?? "";
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
      showDelayedHover: () => void 0,
      setupDelayedHover: () => ({ dispose: () => {
      } }),
      setupDelayedHoverAtMouse: () => ({ dispose: () => {
      } }),
      showInstantHover: () => void 0,
      hideHover: () => {
      },
      showAndFocusLastHover: () => {
      },
      setupManagedHover: () => ({ dispose: () => {
      }, show: () => {
      }, hide: () => {
      }, update: () => {
      } }),
      showManagedHover: () => {
      }
    };
    instantiationService.stub(IHoverService, mockHoverService);
    instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
      isMotionReduced() {
        return false;
      }
    }());
    actionViewItemService = new TestActionViewItemService();
    instantiationService.stub(IActionViewItemService, actionViewItemService);
    menuService = new TestSubagentMenuService(new MenuItemAction(
      { id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, title: "Open Subagent" },
      void 0,
      { shouldForwardArgs: true },
      void 0,
      void 0,
      instantiationService.get(IContextKeyService),
      instantiationService.get(ICommandService)
    ));
    instantiationService.stub(IMenuService, menuService);
    mockListPool = {};
    mockEditorPool = {};
    announcedToolProgressKeys = /* @__PURE__ */ new Set();
  });
  teardown(() => {
    disposables.dispose();
  });
  function createPart(toolInvocation, context, idOverride) {
    const part = store.add(instantiationService.createInstance(
      ChatSubagentContentPart,
      idOverride ?? toolInvocation.subAgentInvocationId ?? toolInvocation.toolCallId,
      toolInvocation,
      context,
      mockMarkdownRenderer,
      mockListPool,
      mockEditorPool,
      () => 500,
      announcedToolProgressKeys
    ));
    mainWindow.document.body.appendChild(part.domNode);
    disposables.add({ dispose: () => part.domNode.remove() });
    return part;
  }
  function getCollapseButton(part) {
    const button = part.domNode.querySelector(".chat-used-context-label > .monaco-button");
    return isHTMLElement(button) ? button : void 0;
  }
  function getCollapseButtonLabel(button) {
    const label = button.querySelector(".monaco-button-mdlabel");
    return isHTMLElement(label) ? label : void 0;
  }
  function getCollapseButtonIcon(button) {
    const icon = button.firstElementChild;
    return isHTMLElement(icon) ? icon : void 0;
  }
  function getWrapperElement(part) {
    const wrapper = part.domNode.querySelector(".chat-thinking-collapsible");
    return isHTMLElement(wrapper) ? wrapper : void 0;
  }
  function getOpenChatContext(part) {
    return part._openChatToolbar?.actionBar?.context;
  }
  function setOpenChatOnlyMode(part, enabled) {
    const toolbar = part._openChatToolbar;
    assert.ok(toolbar);
    const action = store.add(new Action("openSubagent", "Open Subagent", "", enabled));
    toolbar.getItemsLength = () => 1;
    toolbar.getItemAction = () => action;
    part._updateOpenChatOnlyMode();
  }
  suite("Basic rendering", () => {
    test("should create subagent part with correct classes", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-thinking-box"), "Should have chat-thinking-box class");
      assert.ok(part.domNode.classList.contains("chat-subagent-part"), "Should have chat-subagent-part class");
      assert.ok(part.domNode.classList.contains("chat-thinking-fixed-mode"), "Should have chat-thinking-fixed-mode class");
      assert.ok(part.domNode.classList.contains("chat-collapsible-content-animatable"), "Should prepare expandable content for animation");
      assert.strictEqual(part.domNode.classList.contains("chat-collapsible-content-animated"), false, "Should preserve the collapsed streaming preview at rest");
    });
    test("should render the open-chat toolbar beside the collapse button", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Test subagent description",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      const header = part.domNode.querySelector(".chat-used-context-label");
      const toolbar = header?.querySelector(".chat-subagent-open-chat-toolbar");
      const collapseButton = getCollapseButton(part);
      assert.deepStrictEqual({
        hasChatClass: part.domNode.classList.contains("chat-subagent-has-chat"),
        toolbarParentIsHeader: toolbar?.parentElement === header,
        toolbarPrecedesCollapseButton: toolbar?.nextElementSibling === collapseButton
      }, {
        hasChatClass: true,
        toolbarParentIsHeader: true,
        toolbarPrecedesCollapseButton: true
      });
    });
    test("should use a menu snapshot without persistent menu or action-view listeners", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Test subagent description",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      assert.deepStrictEqual({
        hasToolbar: !!part._openChatToolbar,
        createMenuCalls: menuService.createMenuCalls,
        getMenuActionsCalls: menuService.getMenuActionsCalls,
        hasActionViewListeners: actionViewItemService.hasChangeListeners
      }, {
        hasToolbar: true,
        createMenuCalls: 0,
        getMenuActionsCalls: 1,
        hasActionViewListeners: false
      });
    });
    test("should hide the complete collapsible surface when the open-chat action is available", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Test subagent description",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      setOpenChatOnlyMode(part, true);
      const collapseButton = getCollapseButton(part);
      const animationContainer = part.domNode.querySelector(".chat-collapsible-content-animation");
      assert.ok(collapseButton);
      assert.ok(animationContainer);
      assert.deepStrictEqual({
        openChatOnlyClass: part.domNode.classList.contains("chat-subagent-open-chat-only"),
        collapseButtonDisplay: collapseButton.style.display,
        animationDisplay: animationContainer.style.display
      }, {
        openChatOnlyClass: true,
        collapseButtonDisplay: "none",
        animationDisplay: "none"
      });
    });
    test("should hydrate open-chat-only mode when the action view registers after rendering", () => {
      actionViewItemService.setProviderAvailable(false);
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Test subagent description",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      const listeningBeforeRegistration = actionViewItemService.hasChangeListeners;
      actionViewItemService.setProviderAvailable(true);
      actionViewItemService.fireDidChange(MenuId.ChatSubagentContent);
      const collapseButton = getCollapseButton(part);
      const animationContainer = part.domNode.querySelector(".chat-collapsible-content-animation");
      assert.deepStrictEqual({
        listeningBeforeRegistration,
        listeningAfterRegistration: actionViewItemService.hasChangeListeners,
        openChatOnlyClass: part.domNode.classList.contains("chat-subagent-open-chat-only"),
        collapseButtonDisplay: collapseButton?.style.display,
        animationDisplay: animationContainer?.style.display
      }, {
        listeningBeforeRegistration: true,
        listeningAfterRegistration: false,
        openChatOnlyClass: true,
        collapseButtonDisplay: "none",
        animationDisplay: "none"
      });
    });
    test("should preserve the collapsible surface when the open-chat action is unavailable", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Test subagent description",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      setOpenChatOnlyMode(part, false);
      const collapseButton = getCollapseButton(part);
      const animationContainer = part.domNode.querySelector(".chat-collapsible-content-animation");
      assert.ok(collapseButton);
      assert.ok(animationContainer);
      assert.deepStrictEqual({
        openChatOnlyClass: part.domNode.classList.contains("chat-subagent-open-chat-only"),
        collapseButtonDisplay: collapseButton.style.display,
        animationDisplay: animationContainer.style.display
      }, {
        openChatOnlyClass: false,
        collapseButtonDisplay: "",
        animationDisplay: ""
      });
    });
    test("should publish the model and newest child tool intent to the open-chat pill", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Test subagent description",
          chatResource: "ahp-chat://subagent/test/tool-call",
          modelName: "Claude Sonnet 4"
        }
      }), createMockRenderContext(false));
      part.trackToolState(createMockToolInvocation({
        toolCallId: "child-tool-1",
        toolId: "search",
        invocationMessage: "  Search\n  the codebase  "
      }));
      const first = getOpenChatContext(part);
      part.trackToolState(createMockToolInvocation({
        toolCallId: "child-tool-2",
        toolId: "read_file",
        invocationMessage: "Read package.json"
      }));
      const second = getOpenChatContext(part);
      part.markAsInactive();
      assert.deepStrictEqual({
        firstModel: first?.modelName,
        firstTool: first?.activeToolLabel,
        firstToolIcon: first?.activeToolIcon?.id,
        secondTool: second?.activeToolLabel,
        secondToolIcon: second?.activeToolIcon?.id,
        completedTool: getOpenChatContext(part)?.activeToolLabel,
        completedToolIcon: getOpenChatContext(part)?.activeToolIcon
      }, {
        firstModel: "Claude Sonnet 4",
        firstTool: "Search the codebase",
        firstToolIcon: "search",
        secondTool: "Read package.json",
        secondToolIcon: "book",
        completedTool: void 0,
        completedToolIcon: void 0
      });
    });
    test("should prefer terminal intention over the raw command invocation message", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      const terminalTool = createMockToolInvocation({
        toolCallId: "terminal-tool",
        invocationMessage: "Running `grep -rn activeToolLabel src/vs/sessions`"
      });
      terminalTool.toolSpecificData = {
        kind: "terminal",
        commandLine: {
          original: "grep -rn activeToolLabel src/vs/sessions",
          toolEdited: void 0,
          userEdited: void 0
        },
        intention: "Find active tool rendering",
        language: "bash"
      };
      part.trackToolState(terminalTool);
      assert.strictEqual(getOpenChatContext(part)?.activeToolLabel, "Find active tool rendering");
    });
    test("should keep collapsed animated content out of keyboard navigation", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const animationContainer = part.domNode.querySelector(".chat-collapsible-content-animation");
      const animationContent = part.domNode.querySelector(".chat-collapsible-content-animation-inner");
      const chevron = part.domNode.querySelector(".chat-collapsible-hover-chevron");
      const button = getCollapseButton(part);
      assert.ok(animationContainer);
      assert.ok(animationContent);
      assert.ok(chevron);
      assert.ok(button);
      const collapsedInert = animationContent.inert;
      const collapsedChevronExpanded = chevron.classList.contains("expanded");
      button.click();
      const animationEnabledDuringToggle = part.domNode.classList.contains("chat-collapsible-content-animated");
      const transitionEnd = new mainWindow.Event("transitionend");
      Object.defineProperty(transitionEnd, "propertyName", { value: "grid-template-rows" });
      animationContainer.dispatchEvent(transitionEnd);
      const animationEnabledAfterToggle = part.domNode.classList.contains("chat-collapsible-content-animated");
      animationContent.dispatchEvent(new mainWindow.CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));
      assert.deepStrictEqual({
        collapsedInert,
        collapsedChevronExpanded,
        animationEnabledDuringToggle,
        animationEnabledAfterToggle,
        nestedToggleIgnored: !part.domNode.classList.contains("chat-collapsible-content-animated"),
        expandedInert: animationContent.inert,
        expandedChevronExpanded: chevron.classList.contains("expanded")
      }, {
        collapsedInert: true,
        collapsedChevronExpanded: false,
        animationEnabledDuringToggle: true,
        animationEnabledAfterToggle: false,
        nestedToggleIgnored: true,
        expandedInert: false,
        expandedChevronExpanded: true
      });
    });
    test("should restore the streaming preview when an animation is canceled", async () => {
      const part = createPart(createMockToolInvocation(), createMockRenderContext(false));
      const animationContainer = part.domNode.querySelector(".chat-collapsible-content-animation");
      const button = getCollapseButton(part);
      assert.ok(animationContainer);
      assert.ok(button);
      button.click();
      animationContainer.getAnimations = () => [];
      const transitionCancel = new mainWindow.Event("transitioncancel");
      Object.defineProperty(transitionCancel, "propertyName", { value: "grid-template-rows" });
      animationContainer.dispatchEvent(transitionCancel);
      await new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
      assert.strictEqual(part.domNode.classList.contains("chat-collapsible-content-animated"), false);
    });
    test("should shimmer for an in-progress subagent even when the response is complete", () => {
      const toolInvocation = createMockToolInvocation({ stateType: IChatToolInvocation.StateKind.Executing });
      const context = createMockRenderContext(true);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.querySelector(".chat-thinking-title-shimmer"));
    });
    test("should not shimmer for a completed subagent while the response is in progress", () => {
      const toolInvocation = createMockSerializedToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Completed task"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.deepStrictEqual({
        isActive: part.getIsActive(),
        hasShimmer: !!part.domNode.querySelector(".chat-thinking-title-shimmer")
      }, {
        isActive: false,
        hasShimmer: false
      });
    });
    test("should shimmer while Agent Host reports an active child chat after tool completion", () => {
      const toolInvocation = createMockSerializedToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          isActive: true,
          description: "Running child chat"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.deepStrictEqual({
        isActive: part.getIsActive(),
        hasShimmer: !!part.domNode.querySelector(".chat-thinking-title-shimmer")
      }, {
        isActive: true,
        hasShimmer: true
      });
    });
    test("should start collapsed", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should be collapsed by default");
    });
  });
  suite("Title extraction", () => {
    test("should extract title with agent name from toolSpecificData", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Searching the codebase",
          agentName: "CodeSearchAgent",
          prompt: "Search for authentication"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const labelElement = getCollapseButtonLabel(button);
      const buttonText = labelElement?.textContent ?? button.textContent ?? "";
      assert.ok(buttonText.includes("CodeSearchAgent"), "Title should include agent name");
      assert.ok(buttonText.includes("Searching the codebase"), "Title should include description");
    });
    test("should use default prefix when no agent name is provided", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task"
          // no agentName
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const labelElement = getCollapseButtonLabel(button);
      const buttonText = labelElement?.textContent ?? button.textContent ?? "";
      assert.ok(buttonText.includes("Subagent:"), "Title should use default Subagent prefix");
    });
  });
  suite("Late metadata updates", () => {
    function getTitleText(part) {
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const labelElement = getCollapseButtonLabel(button);
      return labelElement?.textContent ?? button.textContent ?? "";
    }
    function getSettableState(toolInvocation) {
      return toolInvocation.state;
    }
    function setToolSpecificData(toolInvocation, data) {
      toolInvocation.toolSpecificData = data;
    }
    test("updateTitle clears previous title file widget disposables", () => {
      const toolInvocation = createMockToolInvocation({ invocationMessage: "first" });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      let disposed = false;
      part._titleFileWidgetStore.add({ dispose: () => {
        disposed = true;
      } });
      part.trackToolState(createMockToolInvocation({ invocationMessage: "second" }));
      assert.strictEqual(disposed, true, "Previous title file widget disposable should be cleared");
    });
    test("default description with no agentName \u2192 real description arrives later \u2192 title updates", () => {
      const toolInvocation = createMockToolInvocation({
        stateType: IChatToolInvocation.StateKind.WaitingForConfirmation,
        toolSpecificData: {
          kind: "subagent"
          /* no description, no agentName */
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(getTitleText(part).includes("Subagent:"), "Title should start with default prefix");
      setToolSpecificData(toolInvocation, { kind: "subagent", description: "Searching the codebase" });
      getSettableState(toolInvocation).set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.ok(getTitleText(part).includes("Searching the codebase"), "Title should reflect the new description");
    });
    test("real description already set \u2192 agentName arrives later \u2192 title updates (regression)", () => {
      const toolInvocation = createMockToolInvocation({
        stateType: IChatToolInvocation.StateKind.WaitingForConfirmation,
        toolSpecificData: {
          kind: "subagent",
          description: "Searching the codebase"
          /* no agentName */
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(getTitleText(part).includes("Searching the codebase"), "Title should start with the real description");
      assert.ok(!getTitleText(part).includes("CodeSearchAgent"), "Title should not yet have agent name");
      setToolSpecificData(toolInvocation, { kind: "subagent", description: "Searching the codebase", agentName: "CodeSearchAgent" });
      getSettableState(toolInvocation).set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.ok(getTitleText(part).includes("CodeSearchAgent"), "Title should reflect the new agent name");
    });
    test("agentName already set \u2192 empty agentName arrives \u2192 title NOT cleared", () => {
      const toolInvocation = createMockToolInvocation({
        stateType: IChatToolInvocation.StateKind.WaitingForConfirmation,
        toolSpecificData: { kind: "subagent", description: "Searching the codebase", agentName: "CodeSearchAgent" }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(getTitleText(part).includes("CodeSearchAgent"), "Title should start with the agent name");
      setToolSpecificData(toolInvocation, { kind: "subagent", description: "Searching the codebase" });
      getSettableState(toolInvocation).set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.ok(getTitleText(part).includes("CodeSearchAgent"), "Title should still have the agent name");
    });
    test("real description already set \u2192 no further changes \u2192 title preserved", () => {
      const toolInvocation = createMockToolInvocation({
        stateType: IChatToolInvocation.StateKind.WaitingForConfirmation,
        toolSpecificData: { kind: "subagent", description: "Searching the codebase", agentName: "CodeSearchAgent" }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const before = getTitleText(part);
      getSettableState(toolInvocation).set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.strictEqual(getTitleText(part), before, "Title should be unchanged when no metadata changed");
    });
  });
  suite("State management", () => {
    test("should start as active", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.strictEqual(part.getIsActive(), true, "Should start as active");
    });
    test("markAsInactive should update isActive state", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      part.markAsInactive();
      assert.deepStrictEqual({
        isActive: part.getIsActive(),
        animationEnabled: part.domNode.classList.contains("chat-collapsible-content-animated")
      }, {
        isActive: false,
        animationEnabled: true
      });
    });
    test("forced inactive state freezes timing for a terminal parent response", () => {
      const toolSpecificData = {
        kind: "subagent",
        isActive: true,
        description: "Working on task",
        chatResource: "ahp-chat://subagent/test/tool-call",
        startedAt: Date.now() - 5e3
      };
      const part = createPart(createMockToolInvocation({ toolSpecificData }), createMockRenderContext(false));
      part.markAsInactive(true);
      assert.deepStrictEqual({
        isActive: toolSpecificData.isActive,
        hasDuration: typeof toolSpecificData.duration === "number" && toolSpecificData.duration >= 5e3,
        contextDuration: getOpenChatContext(part)?.duration
      }, {
        isActive: false,
        hasDuration: true,
        contextDuration: toolSpecificData.duration
      });
    });
    test("forced inactive state freezes serialized subagent timing", () => {
      const toolSpecificData = {
        kind: "subagent",
        isActive: true,
        description: "Restored task",
        chatResource: "ahp-chat://subagent/test/restored",
        startedAt: Date.now() - 5e3
      };
      const part = createPart(createMockSerializedToolInvocation({
        toolSpecificData,
        isComplete: true
      }), createMockRenderContext(true));
      part.markAsInactive(true);
      assert.deepStrictEqual({
        isActive: toolSpecificData.isActive,
        hasDuration: typeof toolSpecificData.duration === "number" && toolSpecificData.duration >= 5e3,
        contextDuration: getOpenChatContext(part)?.duration
      }, {
        isActive: false,
        hasDuration: true,
        contextDuration: toolSpecificData.duration
      });
    });
    test("stops immediately when the parent response becomes terminal", () => {
      const onDidChange = disposables.add(new Emitter());
      let isComplete = false;
      const baseContext = createMockRenderContext(false);
      const baseElement = baseContext.element;
      const context = {
        ...baseContext,
        element: {
          ...baseElement,
          model: {
            ...baseElement.model,
            onDidChange: onDidChange.event
          },
          get isComplete() {
            return isComplete;
          },
          get isCanceled() {
            return false;
          },
          setVote: () => {
          }
        }
      };
      const toolSpecificData = {
        kind: "subagent",
        isActive: true,
        description: "Working on task",
        chatResource: "ahp-chat://subagent/test/tool-call",
        startedAt: Date.now() - 5e3
      };
      const part = createPart(createMockToolInvocation({ toolSpecificData }), context);
      isComplete = true;
      onDidChange.fire({ reason: "completedRequest" });
      assert.deepStrictEqual({
        isActive: part.getIsActive(),
        toolIsActive: toolSpecificData.isActive,
        hasDuration: typeof toolSpecificData.duration === "number" && toolSpecificData.duration >= 5e3
      }, {
        isActive: false,
        toolIsActive: false,
        hasDuration: true
      });
    });
    test("markAsInactive should remove streaming class", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      button?.click();
      part.markAsInactive();
      const wrapper = getWrapperElement(part);
      if (wrapper) {
        assert.strictEqual(
          wrapper.classList.contains("chat-thinking-streaming"),
          false,
          "Streaming class should be removed after markAsInactive"
        );
      }
    });
    test("markAsInactive should collapse the part", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      button?.click();
      assert.strictEqual(part.domNode.classList.contains("chat-used-context-collapsed"), false);
      part.markAsInactive();
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should be collapsed after markAsInactive");
    });
    test("markAsInactive should change default description to past tense", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent"
          // no description — should use the default "Running subagent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const labelBefore = getCollapseButtonLabel(button);
      const textBefore = labelBefore?.textContent ?? button.textContent ?? "";
      assert.ok(textBefore.includes("Running subagent"), 'Title should show "Running subagent" before completion');
      part.markAsInactive();
      const labelAfter = getCollapseButtonLabel(button);
      const textAfter = labelAfter?.textContent ?? button.textContent ?? "";
      assert.ok(textAfter.includes("Ran subagent"), 'Title should show "Ran subagent" after completion');
      assert.ok(!textAfter.includes("Running subagent"), 'Title should no longer show "Running subagent"');
    });
    test("markAsInactive should keep custom description unchanged", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Searching the codebase",
          agentName: "Explorer"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      part.markAsInactive();
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const label = getCollapseButtonLabel(button);
      const text = label?.textContent ?? button.textContent ?? "";
      assert.ok(text.includes("Searching the codebase"), "Title should keep custom description after completion");
    });
    test("finalizeTitle should update button icon to check", () => {
      const configService = instantiationService.get(IConfigurationService);
      configService.setUserConfiguration(AccessibilityWorkbenchSettingId.ShowChatCheckmarks, true);
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      part.finalizeTitle();
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const iconElement = getCollapseButtonIcon(button);
      assert.ok(iconElement?.classList.contains("codicon-check"), "Should have check icon after finalization");
    });
  });
  suite("Serialized invocation", () => {
    test("should handle serialized tool invocation", () => {
      const serializedInvocation = createMockSerializedToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Completed task",
          agentName: "FinishedAgent",
          prompt: "Original prompt",
          result: "Task completed successfully"
        }
      });
      const context = createMockRenderContext(true);
      const part = createPart(serializedInvocation, context);
      assert.strictEqual(part.getIsActive(), false, "Serialized invocation should be inactive");
    });
  });
  suite("hasSameContent", () => {
    test("should not reuse the visual part for a child tool invocation", () => {
      const toolInvocation = createMockToolInvocation({ subAgentInvocationId: "subagent-123" });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const otherInvocation = createMockToolInvocation({
        toolId: "some-tool",
        subAgentInvocationId: "subagent-123"
      });
      const result = part.hasSameContent(otherInvocation, [], context.element);
      assert.strictEqual(result, false);
    });
    test("should return false for tool invocation with different subAgentInvocationId", () => {
      const toolInvocation = createMockToolInvocation({ subAgentInvocationId: "subagent-123" });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const otherInvocation = createMockToolInvocation({
        toolId: "some-tool",
        subAgentInvocationId: "subagent-456"
      });
      const result = part.hasSameContent(otherInvocation, [], context.element);
      assert.strictEqual(result, false, "Should not match tool invocation with different subAgentInvocationId");
    });
    test("should return true for runSubagent tool using toolCallId as effective ID", () => {
      const sharedToolCallId = "shared-tool-call-id";
      const toolInvocation = createMockToolInvocation({
        toolId: RunSubagentTool.Id,
        toolCallId: sharedToolCallId
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context, toolInvocation.toolCallId);
      const otherInvocation = createMockToolInvocation({
        toolId: RunSubagentTool.Id,
        toolCallId: sharedToolCallId
      });
      const result = part.hasSameContent(otherInvocation, [], context.element);
      assert.strictEqual(result, true, "Should match runSubagent tool using toolCallId as effective ID");
    });
    test("should not reuse the visual part for grouped markdown", () => {
      const toolInvocation = createMockToolInvocation({ toolCallId: "subagent-123" });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const markdownContent = {
        kind: "markdownContent",
        content: { value: '<vscode_codeblock_uri subAgentInvocationId="subagent-123">file:///test.txt</vscode_codeblock_uri>' }
      };
      const result = part.hasSameContent(markdownContent, [], context.element);
      assert.strictEqual(result, false);
    });
  });
  suite("Streaming behavior", () => {
    test("should show loading spinner while streaming", () => {
      const toolInvocation = createMockToolInvocation({
        stateType: IChatToolInvocation.StateKind.Streaming
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const loadingIcon = getCollapseButtonIcon(button);
      assert.ok(loadingIcon?.classList.contains("codicon-circle-filled"), "Should have circle-filled icon while streaming");
    });
  });
  suite("Expand/collapse", () => {
    test("should toggle expansion when button is clicked", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"));
      const button = getCollapseButton(part);
      assert.ok(button, "Should have expand button");
      button.click();
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should be expanded after clicking button"
      );
      button.click();
      assert.ok(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        "Should be collapsed after clicking button again"
      );
    });
    test("should have proper aria-expanded attribute", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      assert.ok(button, "Button should exist");
      assert.strictEqual(button.getAttribute("aria-expanded"), "false", 'Should have aria-expanded="false" when collapsed');
      button.click();
      assert.strictEqual(button.getAttribute("aria-expanded"), "true", 'Should have aria-expanded="true" when expanded');
    });
  });
  suite("Lazy rendering", () => {
    test("should defer prompt/result rendering until expanded when initially complete", () => {
      const serializedInvocation = createMockSerializedToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Completed task",
          agentName: "FinishedAgent",
          prompt: "Original prompt for the task",
          result: "Task completed successfully"
        }
      });
      const context = createMockRenderContext(true);
      const part = createPart(serializedInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should be collapsed initially");
      const button = getCollapseButton(part);
      assert.ok(button, "Expand button should exist");
      button.click();
      assert.strictEqual(part.domNode.classList.contains("chat-used-context-collapsed"), false, "Should be expanded");
      const wrapperContent = part.domNode.querySelector(".chat-used-context-list");
      assert.ok(wrapperContent, "Wrapper content should exist after expand");
      const sections = wrapperContent.querySelectorAll(".chat-subagent-section");
      assert.ok(sections.length >= 2, "Should have prompt and result sections after expand");
    });
    test("should not render wrapper content while subagent is running (truly collapsed)", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Running task",
          agentName: "RunningAgent",
          prompt: "Prompt text"
        },
        stateType: IChatToolInvocation.StateKind.Streaming
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should be collapsed while running");
      const wrapperContent = part.domNode.querySelector(".chat-used-context-list");
      assert.strictEqual(wrapperContent, null, "Wrapper content should not be rendered while running and collapsed");
    });
    test("should show prompt on expand when no tool items yet", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Starting task",
          agentName: "RunningAgent",
          prompt: "This is the prompt to execute"
        },
        stateType: IChatToolInvocation.StateKind.Streaming
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should be collapsed initially");
      let wrapperContent = part.domNode.querySelector(".chat-used-context-list");
      assert.strictEqual(wrapperContent, null, "Wrapper should not exist initially");
      const button = getCollapseButton(part);
      assert.ok(button, "Expand button should exist");
      button.click();
      wrapperContent = part.domNode.querySelector(".chat-used-context-list");
      assert.ok(wrapperContent, "Wrapper should exist after expand");
      const promptSection = wrapperContent.querySelector(".chat-subagent-section");
      assert.ok(promptSection, "Prompt section should be visible after expand");
    });
  });
  suite("Current running tool in title", () => {
    test("should update title with current running tool invocation message", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const childTool = createMockToolInvocation({
        toolId: "readFile",
        subAgentInvocationId: toolInvocation.subAgentInvocationId,
        stateType: IChatToolInvocation.StateKind.Executing,
        invocationMessage: "Reading config.ts"
      });
      part.appendToolInvocation(childTool, 0);
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const labelElement = getCollapseButtonLabel(button);
      const buttonText = labelElement?.textContent ?? button.textContent ?? "";
      assert.ok(buttonText.includes("Reading config.ts"), "Title should include current running tool message");
    });
    test("should show latest tool when multiple tools are added", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const firstTool = createMockToolInvocation({
        toolId: "readFile",
        subAgentInvocationId: toolInvocation.subAgentInvocationId,
        stateType: IChatToolInvocation.StateKind.Executing,
        invocationMessage: "Reading file1.ts"
      });
      part.appendToolInvocation(firstTool, 0);
      const secondTool = createMockToolInvocation({
        toolId: "searchFiles",
        subAgentInvocationId: toolInvocation.subAgentInvocationId,
        stateType: IChatToolInvocation.StateKind.Executing,
        invocationMessage: "Searching for patterns"
      });
      part.appendToolInvocation(secondTool, 1);
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const labelElement = getCollapseButtonLabel(button);
      const buttonText = labelElement?.textContent ?? button.textContent ?? "";
      assert.ok(buttonText.includes("Searching for patterns"), "Title should include latest tool message");
    });
    test("should keep showing running tool when another tool completes", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const firstToolState = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const firstTool = {
        ...createMockToolInvocation({
          toolId: "readFile",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: firstToolState,
        invocationMessage: "Reading file1.ts"
      };
      part.trackToolState(firstTool);
      const secondToolState = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const secondTool = {
        ...createMockToolInvocation({
          toolId: "searchFiles",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: secondToolState,
        invocationMessage: "Searching for patterns"
      };
      part.trackToolState(secondTool);
      const button = getCollapseButton(part);
      assert.ok(button, "Button should exist");
      const labelElement = getCollapseButtonLabel(button);
      let buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(buttonText.includes("Searching for patterns"), "Title should show second tool");
      firstToolState.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(buttonText.includes("Searching for patterns"), "Title should still show second tool after first completes");
    });
    test("should keep title when tool is cancelled", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const toolState = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const childTool = {
        ...createMockToolInvocation({
          toolId: "readFile",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: toolState,
        invocationMessage: "Reading file.ts"
      };
      part.trackToolState(childTool);
      const button = getCollapseButton(part);
      assert.ok(button, "Button should exist");
      const labelElement = getCollapseButtonLabel(button);
      let buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(buttonText.includes("Reading file.ts"), "Title should include tool message while running");
      toolState.set(createState(IChatToolInvocation.StateKind.Cancelled), void 0);
      buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(
        buttonText.includes("Reading file.ts"),
        "Title should still include tool message after cancellation"
      );
    });
    test("should keep showing last tool message when that tool completes", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const firstToolState = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const firstTool = {
        ...createMockToolInvocation({
          toolId: "readFile",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: firstToolState,
        invocationMessage: "Reading file1.ts"
      };
      part.trackToolState(firstTool);
      const button = getCollapseButton(part);
      assert.ok(button, "Button should exist");
      const labelElement = getCollapseButtonLabel(button);
      let buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(buttonText.includes("Reading file1.ts"), "Title should show first tool");
      const secondToolState = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const secondTool = {
        ...createMockToolInvocation({
          toolId: "searchFiles",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: secondToolState,
        invocationMessage: "Searching for patterns"
      };
      part.trackToolState(secondTool);
      buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(buttonText.includes("Searching for patterns"), "Title should show second tool");
      secondToolState.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(
        buttonText.includes("Searching for patterns"),
        "Title should still show last tool message after completion"
      );
    });
  });
  suite("appendMarkdownItem", () => {
    test("should append markdown item to expanded subagent part", () => {
      const toolInvocation = createMockToolInvocation({
        subAgentInvocationId: "test-subagent-id",
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      button?.click();
      assert.strictEqual(part.domNode.classList.contains("chat-used-context-collapsed"), false, "Should be expanded");
      const markdownContent = {
        kind: "markdownContent",
        content: { value: "Edited file.ts" }
      };
      const markdownDomNode = mainWindow.document.createElement("div");
      markdownDomNode.className = "chat-codeblock-button";
      markdownDomNode.textContent = "file.ts";
      let disposeCallCount = 0;
      const mockDisposable = { dispose: () => {
        disposeCallCount++;
      } };
      part.appendMarkdownItem(
        () => ({ domNode: markdownDomNode, disposable: mockDisposable }),
        "codeblock-123",
        markdownContent,
        void 0
      );
      const wrapper = getWrapperElement(part);
      assert.ok(wrapper, "Wrapper should exist");
      const appendedElement = wrapper.querySelector(".chat-codeblock-button");
      assert.ok(appendedElement, "Appended markdown element should exist in wrapper");
      assert.strictEqual(appendedElement.textContent, "file.ts", "Should have correct content");
    });
    test("should not render markdown item when part is collapsed", () => {
      const toolInvocation = createMockToolInvocation({
        subAgentInvocationId: "test-subagent-defer",
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should start collapsed");
      const markdownContent = {
        kind: "markdownContent",
        content: { value: "Deferred edit" }
      };
      let factoryCalled = false;
      const markdownDomNode = mainWindow.document.createElement("div");
      markdownDomNode.className = "deferred-edit";
      markdownDomNode.textContent = "deferred.ts";
      const mockDisposable = { dispose: () => {
      } };
      part.appendMarkdownItem(
        () => {
          factoryCalled = true;
          return { domNode: markdownDomNode, disposable: mockDisposable };
        },
        "codeblock-deferred",
        markdownContent,
        void 0
      );
      assert.strictEqual(factoryCalled, false, "Factory should not be called when collapsed");
    });
    test("should append multiple markdown items with same codeblock ID", () => {
      const toolInvocation = createMockToolInvocation({
        subAgentInvocationId: "test-subagent-dedup",
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      button?.click();
      const markdownContent = {
        kind: "markdownContent",
        content: { value: "Same codeblock" }
      };
      const sharedCodeblockId = "codeblock-same-id";
      const firstNode = mainWindow.document.createElement("div");
      firstNode.className = "first-item";
      firstNode.textContent = "first item content";
      part.appendMarkdownItem(
        () => ({ domNode: firstNode, disposable: { dispose: () => {
        } } }),
        sharedCodeblockId,
        markdownContent,
        void 0
      );
      const secondNode = mainWindow.document.createElement("div");
      secondNode.className = "second-item";
      secondNode.textContent = "second item content";
      part.appendMarkdownItem(
        () => ({ domNode: secondNode, disposable: { dispose: () => {
        } } }),
        sharedCodeblockId,
        markdownContent,
        void 0
      );
      const wrapper = getWrapperElement(part);
      assert.ok(wrapper, "Wrapper should exist");
      const firstItems = wrapper.querySelectorAll(".first-item");
      const secondItems = wrapper.querySelectorAll(".second-item");
      assert.strictEqual(firstItems.length, 1, "First item should exist");
      assert.strictEqual(secondItems.length, 1, "Second item should exist");
    });
    test("should handle multiple different codeblock IDs", () => {
      const toolInvocation = createMockToolInvocation({
        subAgentInvocationId: "test-subagent-multi",
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      button?.click();
      const firstNode = mainWindow.document.createElement("div");
      firstNode.className = "item-one";
      firstNode.textContent = "first item content";
      part.appendMarkdownItem(
        () => ({ domNode: firstNode, disposable: { dispose: () => {
        } } }),
        "codeblock-1",
        { kind: "markdownContent", content: { value: "First" } },
        void 0
      );
      const secondNode = mainWindow.document.createElement("div");
      secondNode.className = "item-two";
      secondNode.textContent = "second item content";
      part.appendMarkdownItem(
        () => ({ domNode: secondNode, disposable: { dispose: () => {
        } } }),
        "codeblock-2",
        { kind: "markdownContent", content: { value: "Second" } },
        void 0
      );
      const wrapper = getWrapperElement(part);
      assert.ok(wrapper, "Wrapper should exist");
      assert.ok(wrapper.querySelector(".item-one"), "First item should exist");
      assert.ok(wrapper.querySelector(".item-two"), "Second item should exist");
    });
  });
  suite("Auto-expand on confirmation", () => {
    test("should auto-expand when tool state becomes WaitingForConfirmation", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should start collapsed");
      const stateObservable = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const childTool = {
        ...createMockToolInvocation({
          toolId: "readFile",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable,
        invocationMessage: "Reading file"
      };
      part.trackToolState(childTool);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should still be collapsed when tool is executing");
      stateObservable.set(createState(IChatToolInvocation.StateKind.WaitingForConfirmation), void 0);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should auto-expand when tool needs confirmation"
      );
    });
    test("should publish the pending confirmation count to the open-chat pill", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      const state = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const childTool = { ...createMockToolInvocation({ toolId: "first" }), state };
      part.enableCarouselMode(() => {
      }, () => {
      }, (_tool, currentState) => currentState.type === IChatToolInvocation.StateKind.WaitingForConfirmation);
      part.trackToolState(childTool);
      state.set(createState(IChatToolInvocation.StateKind.WaitingForConfirmation), void 0);
      const pending = getOpenChatContext(part)?.confirmationCount;
      state.set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.deepStrictEqual({
        pending,
        afterConfirmation: getOpenChatContext(part)?.confirmationCount
      }, {
        pending: 1,
        afterConfirmation: 0
      });
    });
    test("should distinguish the active confirmation from pending confirmations", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      part.setConfirmationActive(true);
      const active = getOpenChatContext(part)?.confirmationActive;
      part.setConfirmationActive(false);
      assert.deepStrictEqual({
        active,
        inactive: getOpenChatContext(part)?.confirmationActive
      }, {
        active: true,
        inactive: false
      });
    });
    test("should refresh the open-chat timing when the subagent stops", () => {
      const toolSpecificData = {
        kind: "subagent",
        description: "Working on task",
        chatResource: "ahp-chat://subagent/test/tool-call",
        isActive: true,
        startedAt: 1e3
      };
      const toolInvocation = createMockToolInvocation({
        toolSpecificData,
        stateType: IChatToolInvocation.StateKind.Executing
      });
      const state = observableValue("state", toolInvocation.state.get());
      toolInvocation.state = state;
      const part = createPart(toolInvocation, createMockRenderContext(false));
      toolSpecificData.isActive = false;
      toolSpecificData.duration = 5e3;
      state.set({ ...state.get() }, void 0);
      assert.deepStrictEqual(getOpenChatContext(part), {
        chatResource: "ahp-chat://subagent/test/tool-call",
        confirmationCount: 0,
        confirmationActive: false,
        startedAt: 1e3,
        duration: 5e3
      });
    });
    test("should stop tracking a tool invocation once it reaches a terminal state", async () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const stateObservable = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const childTool = {
        ...createMockToolInvocation({
          toolId: "readFile",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable,
        invocationMessage: "Reading file"
      };
      part.trackToolState(childTool);
      const observerCount = () => stateObservable.debugGetObservers().size;
      assert.strictEqual(observerCount(), 1, "Tracking autorun should observe the tool state");
      stateObservable.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      await Promise.resolve();
      assert.strictEqual(observerCount(), 0, "Tracking autorun should be disposed once the tool reaches a terminal state");
    });
    test("should auto-collapse when confirmation is addressed", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const stateObservable = observableValue("state", createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
      const childTool = {
        ...createMockToolInvocation({
          toolId: "runInTerminal",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable,
        invocationMessage: "Run npm install"
      };
      part.trackToolState(childTool);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should be expanded when waiting for confirmation"
      );
      stateObservable.set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.ok(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        "Should auto-collapse after confirmation is addressed"
      );
    });
    test("should not auto-collapse if user manually expanded", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      button?.click();
      assert.strictEqual(part.domNode.classList.contains("chat-used-context-collapsed"), false, "Should be expanded after user click");
      const stateObservable = observableValue("state", createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
      const childTool = {
        ...createMockToolInvocation({
          toolId: "runInTerminal",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable,
        invocationMessage: "Run npm install"
      };
      part.trackToolState(childTool);
      stateObservable.set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should stay expanded when user manually expanded"
      );
    });
    test("should respect manual expansion after auto-expand", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should start collapsed");
      const stateObservable = observableValue("state", createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
      const childTool = {
        ...createMockToolInvocation({
          toolId: "runInTerminal",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable,
        invocationMessage: "Run npm install"
      };
      part.trackToolState(childTool);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should auto-expand for confirmation"
      );
      const button = getCollapseButton(part);
      button?.click();
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should collapse after user click");
      button?.click();
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should expand after second user click"
      );
      stateObservable.set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should stay expanded when user manually re-expanded after auto-expand"
      );
    });
    test("should resume auto-collapse after user manually expands then collapses", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const stateObservable1 = observableValue("state1", createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
      const childTool1 = {
        ...createMockToolInvocation({
          toolId: "runInTerminal",
          toolCallId: "tool1",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable1,
        invocationMessage: "First tool"
      };
      part.trackToolState(childTool1);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should auto-expand for first confirmation"
      );
      const button = getCollapseButton(part);
      button?.click();
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should collapse after user click");
      button?.click();
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should expand after user re-expands"
      );
      stateObservable1.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should stay expanded after first tool completes (user manually expanded)"
      );
      button?.click();
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should collapse after user manually collapses");
      const stateObservable2 = observableValue("state2", createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
      const childTool2 = {
        ...createMockToolInvocation({
          toolId: "runInTerminal",
          toolCallId: "tool2",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable2,
        invocationMessage: "Second tool"
      };
      part.trackToolState(childTool2);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should auto-expand for second confirmation"
      );
      stateObservable2.set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.ok(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        "Should auto-collapse after second confirmation is addressed (userManuallyExpanded was reset)"
      );
    });
    test("should clear current running tool message when tool completes", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const stateObservable = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const childTool = {
        ...createMockToolInvocation({
          toolId: "readFile",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable,
        invocationMessage: "Reading config.ts"
      };
      part.trackToolState(childTool);
      const button = getCollapseButton(part);
      assert.ok(button, "Button should exist");
      const labelElement = getCollapseButtonLabel(button);
      let buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(buttonText.includes("Reading config.ts"), "Title should include tool message while running");
      stateObservable.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(
        buttonText.includes("Reading config.ts"),
        "Title should still include tool message after completion"
      );
    });
  });
  suite("Model name tooltip", () => {
    const hoverText = (content) => {
      if (typeof content === "string") {
        return content;
      }
      if (isMarkdownString(content)) {
        return content.value;
      }
      return "";
    };
    test("should set up hover with model name from serialized toolSpecificData", () => {
      const setupDelayedHoverCalls = [];
      mockHoverService.setupDelayedHover = (element, options) => {
        setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
        return { dispose: () => {
        } };
      };
      const serializedInvocation = createMockSerializedToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Completed task",
          agentName: "TestAgent",
          prompt: "Do the thing",
          result: "Done",
          modelName: "GPT-4o"
        }
      });
      const context = createMockRenderContext(true);
      createPart(serializedInvocation, context);
      const modelHover = setupDelayedHoverCalls.find((c) => c.content.includes("GPT-4o"));
      assert.ok(modelHover, "Should set up hover with model name");
    });
    test("should not set up hover when no model name is available", () => {
      const setupDelayedHoverCalls = [];
      mockHoverService.setupDelayedHover = (element, options) => {
        setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
        return { dispose: () => {
        } };
      };
      const serializedInvocation = createMockSerializedToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Completed task",
          agentName: "TestAgent",
          prompt: "Do the thing",
          result: "Done"
          // no modelName
        }
      });
      const context = createMockRenderContext(true);
      createPart(serializedInvocation, context);
      const modelHover = setupDelayedHoverCalls.find((c) => c.content.includes("Model:"));
      assert.strictEqual(modelHover, void 0, "Should not set up model hover when no model name");
    });
    test("should set up hover when tool completes and toolSpecificData has modelName", () => {
      const setupDelayedHoverCalls = [];
      mockHoverService.setupDelayedHover = (element, options) => {
        setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
        return { dispose: () => {
        } };
      };
      const toolSpecificData = {
        kind: "subagent",
        description: "Working on task",
        agentName: "TestAgent",
        prompt: "Do stuff"
      };
      const toolInvocation = createMockToolInvocation({
        toolSpecificData,
        stateType: IChatToolInvocation.StateKind.Executing
      });
      const context = createMockRenderContext(false);
      createPart(toolInvocation, context);
      const initialHover = setupDelayedHoverCalls.find((c) => c.content.includes("Model:"));
      assert.strictEqual(initialHover, void 0, "Should not have model hover initially");
      toolSpecificData.modelName = "Claude Sonnet 4";
      const state = toolInvocation.state;
      state.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      const modelHover = setupDelayedHoverCalls.find((c) => c.content.includes("Claude Sonnet 4"));
      assert.ok(modelHover, "Should set up hover with model name after completion");
    });
    test("should set up hover with credits from serialized toolSpecificData", () => {
      const setupDelayedHoverCalls = [];
      mockHoverService.setupDelayedHover = (element, options) => {
        setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
        return { dispose: () => {
        } };
      };
      const serializedInvocation = createMockSerializedToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Completed task",
          agentName: "TestAgent",
          prompt: "Do the thing",
          result: "Done",
          modelName: "GPT-4o",
          credits: 1.5
        }
      });
      const context = createMockRenderContext(true);
      createPart(serializedInvocation, context);
      const hover = setupDelayedHoverCalls.find((c) => c.content.includes("1.5") && c.content.includes("credits"));
      assert.ok(hover, "Should set up hover with credits");
      assert.ok(hover.content.includes("GPT-4o"), "Hover should still include model name");
    });
    test("should update hover with credits when they arrive after completion", () => {
      const setupDelayedHoverCalls = [];
      mockHoverService.setupDelayedHover = (element, options) => {
        setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
        return { dispose: () => {
        } };
      };
      const toolSpecificData = {
        kind: "subagent",
        description: "Working on task",
        agentName: "TestAgent",
        prompt: "Do stuff",
        modelName: "GPT-4o"
      };
      const toolInvocation = createMockToolInvocation({
        toolSpecificData,
        stateType: IChatToolInvocation.StateKind.Executing
      });
      const context = createMockRenderContext(false);
      createPart(toolInvocation, context);
      assert.strictEqual(setupDelayedHoverCalls.find((c) => c.content.includes("credit")), void 0, "Should not show credits before they are reported");
      toolSpecificData.credits = 2;
      const state = toolInvocation.state;
      state.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      const creditHover = setupDelayedHoverCalls.find((c) => c.content.includes("2") && c.content.includes("credits"));
      assert.ok(creditHover, "Should set up hover with credits after completion");
    });
    test("should update hover with model name when it arrives after initial render", () => {
      const setupDelayedHoverCalls = [];
      mockHoverService.setupDelayedHover = (element, options) => {
        setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
        return { dispose: () => {
        } };
      };
      const toolSpecificData = {
        kind: "subagent",
        description: "Working on task",
        agentName: "TestAgent"
      };
      const toolInvocation = createMockToolInvocation({
        toolSpecificData,
        stateType: IChatToolInvocation.StateKind.Executing
      });
      const context = createMockRenderContext(false);
      createPart(toolInvocation, context);
      assert.strictEqual(setupDelayedHoverCalls.find((c) => c.content.includes("Model")), void 0, "Should not show a model before one is reported");
      toolSpecificData.modelName = "Claude Sonnet 4";
      const state = toolInvocation.state;
      state.set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      const modelHover = setupDelayedHoverCalls.find((c) => c.content.includes("Claude Sonnet 4"));
      assert.ok(modelHover, "Should set up hover with model name after it arrives");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRTdWJhZ2VudENvbnRlbnRQYXJ0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBpc0hUTUxFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSwgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGVlcC1pbXBvcnQtb2YtaW50ZXJuYWxcbmltcG9ydCB7IEJhc2VPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZUludGVybmFsL29ic2VydmFibGVzL2Jhc2VPYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgVGVzdE1lbnVTZXJ2aWNlLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0U3ViYWdlbnRDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1hcmtkb3duQ29udGVudCwgSUNoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSwgSUNoYXRUb29sSW52b2NhdGlvbiwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgSW5saW5lVGV4dE1vZGVsQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElSZW5kZXJlZE1hcmtkb3duLCBNYXJrZG93blJlbmRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIGlzTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQb29sLCBEaWZmRWRpdG9yUG9vbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbnRlbnRDb2RlUG9vbHMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBSdW5TdWJhZ2VudFRvb2wgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL3J1blN1YmFnZW50VG9vbC5qcyc7XG5pbXBvcnQgeyBDb2xsYXBzaWJsZUxpc3RQb29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0UmVmZXJlbmNlc0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IFRvb2xEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L3Rlc3QvY29tbW9uL3Rlc3RBY2Nlc3NpYmlsaXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1GYWN0b3J5LCBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWVudUFjdGlvbk9wdGlvbnMsIElNZW51U2VydmljZSwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ0hBVF9PUEVOX0FHRU5UX0hPU1RfQ0hBVF9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5cbmNsYXNzIFRlc3RPcGVuQ2hhdEFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQWN0aW9uVmlld0l0ZW0ge1xuXHRjb25zdHJ1Y3Rvcihzb3VyY2VBY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIG5ldyBBY3Rpb24oc291cmNlQWN0aW9uLmlkLCBzb3VyY2VBY3Rpb24ubGFiZWwsIHNvdXJjZUFjdGlvbi5jbGFzcywgdHJ1ZSwgY29udGV4dCA9PiBzb3VyY2VBY3Rpb24ucnVuKGNvbnRleHQpKSwgb3B0aW9ucyk7XG5cdFx0aWYgKHRoaXMuYWN0aW9uIGluc3RhbmNlb2YgQWN0aW9uKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFjdGlvbik7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFRlc3RBY3Rpb25WaWV3SXRlbVNlcnZpY2UgaW1wbGVtZW50cyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIHtcblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8TWVudUlkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXHRwcml2YXRlIF9wcm92aWRlckF2YWlsYWJsZSA9IHRydWU7XG5cblx0Z2V0IGhhc0NoYW5nZUxpc3RlbmVycygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2UuaGFzTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRzZXRQcm92aWRlckF2YWlsYWJsZShhdmFpbGFibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9wcm92aWRlckF2YWlsYWJsZSA9IGF2YWlsYWJsZTtcblx0fVxuXG5cdGZpcmVEaWRDaGFuZ2UobWVudUlkOiBNZW51SWQpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKG1lbnVJZCk7XG5cdH1cblxuXHRyZWdpc3RlcihfbWVudTogTWVudUlkLCBfY29tbWFuZElkOiBzdHJpbmcgfCBNZW51SWQsIF9wcm92aWRlcjogSUFjdGlvblZpZXdJdGVtRmFjdG9yeSk6IHsgZGlzcG9zZSgpOiB2b2lkIH0ge1xuXHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHR9XG5cblx0bG9va1VwKG1lbnU6IE1lbnVJZCwgY29tbWFuZElkOiBzdHJpbmcgfCBNZW51SWQpOiBJQWN0aW9uVmlld0l0ZW1GYWN0b3J5IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX3Byb3ZpZGVyQXZhaWxhYmxlIHx8IG1lbnUgIT09IE1lbnVJZC5DaGF0U3ViYWdlbnRDb250ZW50IHx8IGNvbW1hbmRJZCAhPT0gQ0hBVF9PUEVOX0FHRU5UX0hPU1RfQ0hBVF9DT01NQU5EX0lEKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gKGFjdGlvbiwgb3B0aW9ucykgPT4gbmV3IFRlc3RPcGVuQ2hhdEFjdGlvblZpZXdJdGVtKGFjdGlvbiwgb3B0aW9ucyk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdFN1YmFnZW50TWVudVNlcnZpY2UgZXh0ZW5kcyBUZXN0TWVudVNlcnZpY2Uge1xuXHRjcmVhdGVNZW51Q2FsbHMgPSAwO1xuXHRnZXRNZW51QWN0aW9uc0NhbGxzID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG9wZW5DaGF0QWN0aW9uOiBNZW51SXRlbUFjdGlvbikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBjcmVhdGVNZW51KGlkOiBNZW51SWQsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpIHtcblx0XHR0aGlzLmNyZWF0ZU1lbnVDYWxscysrO1xuXHRcdHJldHVybiBzdXBlci5jcmVhdGVNZW51KGlkLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRNZW51QWN0aW9ucyhpZDogTWVudUlkLCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLCBvcHRpb25zPzogSU1lbnVBY3Rpb25PcHRpb25zKTogUmV0dXJuVHlwZTxJTWVudVNlcnZpY2VbJ2dldE1lbnVBY3Rpb25zJ10+IHtcblx0XHR0aGlzLmdldE1lbnVBY3Rpb25zQ2FsbHMrKztcblx0XHRpZiAoaWQgPT09IE1lbnVJZC5DaGF0U3ViYWdlbnRDb250ZW50KSB7XG5cdFx0XHRyZXR1cm4gW1snbmF2aWdhdGlvbicsIFt0aGlzLm9wZW5DaGF0QWN0aW9uXV1dO1xuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIuZ2V0TWVudUFjdGlvbnMoaWQsIGNvbnRleHRLZXlTZXJ2aWNlLCBvcHRpb25zKTtcblx0fVxufVxuXG5zdWl0ZSgnQ2hhdFN1YmFnZW50Q29udGVudFBhcnQnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dHlwZSBUb29sSW52b2NhdGlvblBhcmFtZXRlcnMgPSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlIGV4dGVuZHMgeyBwYXJhbWV0ZXJzOiBpbmZlciBQIH0gPyBQIDogbmV2ZXI7XG5cblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogUmV0dXJuVHlwZTx0eXBlb2Ygd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2U+O1xuXHRsZXQgbW9ja01hcmtkb3duUmVuZGVyZXI6IElNYXJrZG93blJlbmRlcmVyO1xuXHRsZXQgbW9ja0FuY2hvclNlcnZpY2U6IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlO1xuXHRsZXQgbW9ja0hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZTtcblx0bGV0IG1vY2tMaXN0UG9vbDogQ29sbGFwc2libGVMaXN0UG9vbDtcblx0bGV0IG1vY2tFZGl0b3JQb29sOiBFZGl0b3JQb29sO1xuXHRsZXQgYW5ub3VuY2VkVG9vbFByb2dyZXNzS2V5czogU2V0PHN0cmluZz47XG5cdGxldCBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IFRlc3RBY3Rpb25WaWV3SXRlbVNlcnZpY2U7XG5cdGxldCBtZW51U2VydmljZTogVGVzdFN1YmFnZW50TWVudVNlcnZpY2U7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoaXNDb21wbGV0ZTogYm9vbGVhbiA9IGZhbHNlKTogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQge1xuXHRcdGNvbnN0IG1vY2tFbGVtZW50OiBQYXJ0aWFsPElDaGF0UmVzcG9uc2VWaWV3TW9kZWw+ID0ge1xuXHRcdFx0aXNDb21wbGV0ZSxcblx0XHRcdGlkOiAndGVzdC1yZXNwb25zZS1pZCcsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi8vdGVzdC9zZXNzaW9uMScpLFxuXHRcdFx0Z2V0IG1vZGVsKCkgeyByZXR1cm4ge30gYXMgSUNoYXRSZXNwb25zZVZpZXdNb2RlbFsnbW9kZWwnXTsgfVxuXHRcdH07XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWxlbWVudDogbW9ja0VsZW1lbnQgYXMgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCxcblx0XHRcdGlubGluZVRleHRNb2RlbHM6IHt9IGFzIElubGluZVRleHRNb2RlbENvbGxlY3Rpb24sXG5cdFx0XHRlbGVtZW50SW5kZXg6IDAsXG5cdFx0XHRjb250YWluZXI6IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JyksXG5cdFx0XHRjb250ZW50OiBbXSxcblx0XHRcdGNvbnRlbnRJbmRleDogMCxcblx0XHRcdGVkaXRvclBvb2w6IG1vY2tFZGl0b3JQb29sLFxuXHRcdFx0Y29kZUJsb2NrU3RhcnRJbmRleDogMCxcblx0XHRcdHRyZWVTdGFydEluZGV4OiAwLFxuXHRcdFx0ZGlmZkVkaXRvclBvb2w6IHt9IGFzIERpZmZFZGl0b3JQb29sLFxuXHRcdFx0Y3VycmVudFdpZHRoOiBvYnNlcnZhYmxlVmFsdWUoJ2N1cnJlbnRXaWR0aCcsIDUwMCksXG5cdFx0XHRvbkRpZENoYW5nZVZpc2liaWxpdHk6IEV2ZW50Lk5vbmVcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU3RhdGUoc3RhdGVUeXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZCwgcGFyYW1ldGVycz86IFRvb2xJbnZvY2F0aW9uUGFyYW1ldGVycyk6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGUge1xuXHRcdHN3aXRjaCAoc3RhdGVUeXBlKSB7XG5cdFx0XHRjYXNlIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcsXG5cdFx0XHRcdFx0cGFydGlhbElucHV0OiBvYnNlcnZhYmxlVmFsdWUoJ3BhcnRpYWxJbnB1dCcsIHt9KSxcblx0XHRcdFx0XHRzdHJlYW1pbmdNZXNzYWdlOiBvYnNlcnZhYmxlVmFsdWUoJ3N0cmVhbWluZ01lc3NhZ2UnLCB1bmRlZmluZWQpXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZDpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQsXG5cdFx0XHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdFx0XHRjb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0XHRcdHJlc3VsdERldGFpbHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwb3N0Q29uZmlybWVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29udGVudEZvck1vZGVsOiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAndGVzdCByZXN1bHQnIH1dXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdFx0XHRjb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0XHRcdHByb2dyZXNzOiBvYnNlcnZhYmxlVmFsdWUoJ3Byb2dyZXNzJywgeyBtZXNzYWdlOiB1bmRlZmluZWQsIHByb2dyZXNzOiB1bmRlZmluZWQgfSlcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbixcblx0XHRcdFx0XHRwYXJhbWV0ZXJzLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0sXG5cdFx0XHRcdFx0c2VydmVyOiB7XG5cdFx0XHRcdFx0XHRpZDogJ3NlcnZlcicsXG5cdFx0XHRcdFx0XHRuYW1lOiAnTUNQIHNlcnZlcicsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNhbmNlbDogKCkgPT4geyB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHRcdFx0dGl0bGU6ICdDb25maXJtIGFjdGlvbicsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiAnQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIHByb2NlZWQ/J1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y29uZmlybTogKCkgPT4geyB9XG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWw6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbCxcblx0XHRcdFx0XHRwYXJhbWV0ZXJzLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0sXG5cdFx0XHRcdFx0cmVzdWx0RGV0YWlsczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbnRlbnRGb3JNb2RlbDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ3Rlc3QgcmVzdWx0JyB9XSxcblx0XHRcdFx0XHRjb25maXJtOiAoKSA9PiB7IH1cblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNhbmNlbGxlZCxcblx0XHRcdFx0XHRwYXJhbWV0ZXJzLFxuXHRcdFx0XHRcdHJlYXNvbjogVG9vbENvbmZpcm1LaW5kLkRlbmllZFxuXHRcdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbihvcHRpb25zOiB7XG5cdFx0dG9vbElkPzogc3RyaW5nO1xuXHRcdHRvb2xDYWxsSWQ/OiBzdHJpbmc7XG5cdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ/OiBzdHJpbmc7XG5cdFx0dG9vbFNwZWNpZmljRGF0YT86IElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0c3RhdGVUeXBlPzogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQ7XG5cdFx0cGFyYW1ldGVycz86IFRvb2xJbnZvY2F0aW9uUGFyYW1ldGVycztcblx0XHRpbnZvY2F0aW9uTWVzc2FnZT86IHN0cmluZztcblx0fSA9IHt9KTogSUNoYXRUb29sSW52b2NhdGlvbiB7XG5cdFx0Y29uc3Qgc3RhdGVUeXBlID0gb3B0aW9ucy5zdGF0ZVR5cGUgPz8gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nO1xuXHRcdGNvbnN0IHN0YXRlVmFsdWUgPSBjcmVhdGVTdGF0ZShzdGF0ZVR5cGUsIG9wdGlvbnMucGFyYW1ldGVycyk7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IG9wdGlvbnMudG9vbENhbGxJZCA/PyAndG9vbC1jYWxsLScgKyBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zdWJzdHJpbmcoNyk7XG5cblx0XHRjb25zdCB0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdHByZXNlbnRhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogb3B0aW9ucy50b29sU3BlY2lmaWNEYXRhID8/IHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdUZXN0IHN1YmFnZW50IGRlc2NyaXB0aW9uJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50Jyxcblx0XHRcdFx0cHJvbXB0OiAnVGVzdCBwcm9tcHQnXG5cdFx0XHR9LFxuXHRcdFx0b3JpZ2luTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG9wdGlvbnMuaW52b2NhdGlvbk1lc3NhZ2UgPz8gJ1J1bm5pbmcgc3ViYWdlbnQnLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdHRvb2xJZDogb3B0aW9ucy50b29sSWQgPz8gUnVuU3ViYWdlbnRUb29sLklkLFxuXHRcdFx0dG9vbENhbGxJZDogdG9vbENhbGxJZCxcblx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiBvcHRpb25zLnN1YkFnZW50SW52b2NhdGlvbklkLFxuXHRcdFx0c3RhdGU6IG9ic2VydmFibGVWYWx1ZSgnc3RhdGUnLCBzdGF0ZVZhbHVlKSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGFLaW5kOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCAob3B0aW9ucy50b29sU3BlY2lmaWNEYXRhID8/IHsga2luZDogJ3N1YmFnZW50JyB9KS5raW5kKSxcblx0XHRcdGlzQXR0YWNoZWRUb1RoaW5raW5nOiBmYWxzZSxcblx0XHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvbicsXG5cdFx0XHR0b0pTT046ICgpID0+IGNyZWF0ZU1vY2tTZXJpYWxpemVkVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sSWQ6IG9wdGlvbnMudG9vbElkID8/IFJ1blN1YmFnZW50VG9vbC5JZCxcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IG9wdGlvbnMuc3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IG9wdGlvbnMudG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdFx0aXNDb21wbGV0ZTogc3RhdGVUeXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWRcblx0XHRcdH0pXG5cdFx0fTtcblxuXHRcdHJldHVybiB0b29sSW52b2NhdGlvbjtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tTZXJpYWxpemVkVG9vbEludm9jYXRpb24ob3B0aW9uczoge1xuXHRcdHRvb2xJZD86IHN0cmluZztcblx0XHRzdWJBZ2VudEludm9jYXRpb25JZD86IHN0cmluZztcblx0XHR0b29sU3BlY2lmaWNEYXRhPzogSUNoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YTtcblx0XHRpc0NvbXBsZXRlPzogYm9vbGVhbjtcblx0fSA9IHt9KTogSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcmVzZW50YXRpb246IHVuZGVmaW5lZCxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IG9wdGlvbnMudG9vbFNwZWNpZmljRGF0YSA/PyB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGVzdCBzdWJhZ2VudCBkZXNjcmlwdGlvbicsXG5cdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ1Rlc3QgcHJvbXB0Jyxcblx0XHRcdFx0cmVzdWx0OiAnVGVzdCByZXN1bHQgdGV4dCdcblx0XHRcdH0sXG5cdFx0XHRvcmlnaW5NZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgc3ViYWdlbnQnLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0cmVzdWx0RGV0YWlsczogdW5kZWZpbmVkLFxuXHRcdFx0aXNDb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0aXNDb21wbGV0ZTogb3B0aW9ucy5pc0NvbXBsZXRlID8/IHRydWUsXG5cdFx0XHR0b29sQ2FsbElkOiBvcHRpb25zLnN1YkFnZW50SW52b2NhdGlvbklkID8/ICd0ZXN0LXRvb2wtY2FsbC1pZCcsXG5cdFx0XHR0b29sSWQ6IG9wdGlvbnMudG9vbElkID8/IFJ1blN1YmFnZW50VG9vbC5JZCxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogb3B0aW9ucy5zdWJBZ2VudEludm9jYXRpb25JZCxcblx0XHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnXG5cdFx0fTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IHN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSk7XG5cblx0XHQvLyBDcmVhdGUgYSBtb2NrIG1hcmtkb3duIHJlbmRlcmVyXG5cdFx0bW9ja01hcmtkb3duUmVuZGVyZXIgPSB7XG5cdFx0XHRyZW5kZXI6IChfbWFya2Rvd246IElNYXJrZG93blN0cmluZywgX29wdGlvbnM/OiBNYXJrZG93blJlbmRlck9wdGlvbnMsIG91dEVsZW1lbnQ/OiBIVE1MRWxlbWVudCk6IElSZW5kZXJlZE1hcmtkb3duID0+IHtcblx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IG91dEVsZW1lbnQgPz8gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IHR5cGVvZiBfbWFya2Rvd24gPT09ICdzdHJpbmcnID8gX21hcmtkb3duIDogKF9tYXJrZG93bi52YWx1ZSA/PyAnJyk7XG5cdFx0XHRcdGVsZW1lbnQudGV4dENvbnRlbnQgPSBjb250ZW50O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIE1vY2sgdGhlIGFuY2hvciBzZXJ2aWNlXG5cdFx0bW9ja0FuY2hvclNlcnZpY2UgPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRyZWdpc3RlcjogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0bGFzdEZvY3VzZWRBbmNob3I6IHVuZGVmaW5lZFxuXHRcdH07XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSwgbW9ja0FuY2hvclNlcnZpY2UpO1xuXG5cdFx0Ly8gTW9jayBob3ZlciBzZXJ2aWNlXG5cdFx0bW9ja0hvdmVyU2VydmljZSA9IHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHNob3dEZWxheWVkSG92ZXI6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHNldHVwRGVsYXllZEhvdmVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRzZXR1cERlbGF5ZWRIb3ZlckF0TW91c2U6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRcdHNob3dJbnN0YW50SG92ZXI6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGhpZGVIb3ZlcjogKCkgPT4geyB9LFxuXHRcdFx0c2hvd0FuZEZvY3VzTGFzdEhvdmVyOiAoKSA9PiB7IH0sXG5cdFx0XHRzZXR1cE1hbmFnZWRIb3ZlcjogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9LCBzaG93OiAoKSA9PiB7IH0sIGhpZGU6ICgpID0+IHsgfSwgdXBkYXRlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRzaG93TWFuYWdlZEhvdmVyOiAoKSA9PiB7IH1cblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhvdmVyU2VydmljZSwgbW9ja0hvdmVyU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWNjZXNzaWJpbGl0eVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIFRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSBpc01vdGlvblJlZHVjZWQoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRcdH0oKSk7XG5cdFx0YWN0aW9uVmlld0l0ZW1TZXJ2aWNlID0gbmV3IFRlc3RBY3Rpb25WaWV3SXRlbVNlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsIGFjdGlvblZpZXdJdGVtU2VydmljZSk7XG5cdFx0bWVudVNlcnZpY2UgPSBuZXcgVGVzdFN1YmFnZW50TWVudVNlcnZpY2UobmV3IE1lbnVJdGVtQWN0aW9uKFxuXHRcdFx0eyBpZDogQ0hBVF9PUEVOX0FHRU5UX0hPU1RfQ0hBVF9DT01NQU5EX0lELCB0aXRsZTogJ09wZW4gU3ViYWdlbnQnIH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29tbWFuZFNlcnZpY2UpLFxuXHRcdCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU1lbnVTZXJ2aWNlLCBtZW51U2VydmljZSk7XG5cblx0XHQvLyBNb2NrIGxpc3QgcG9vbCBhbmQgZWRpdG9yIHBvb2xcblx0XHRtb2NrTGlzdFBvb2wgPSB7fSBhcyBDb2xsYXBzaWJsZUxpc3RQb29sO1xuXHRcdG1vY2tFZGl0b3JQb29sID0ge30gYXMgRWRpdG9yUG9vbDtcblx0XHRhbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzID0gbmV3IFNldCgpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVQYXJ0KFxuXHRcdHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0aWRPdmVycmlkZT86IHN0cmluZ1xuXHQpOiBDaGF0U3ViYWdlbnRDb250ZW50UGFydCB7XG5cdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0LFxuXHRcdFx0aWRPdmVycmlkZSA/PyB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZCA/PyB0b29sSW52b2NhdGlvbi50b29sQ2FsbElkLFxuXHRcdFx0dG9vbEludm9jYXRpb24sXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRtb2NrTGlzdFBvb2wsXG5cdFx0XHRtb2NrRWRpdG9yUG9vbCxcblx0XHRcdCgpID0+IDUwMCxcblx0XHRcdGFubm91bmNlZFRvb2xQcm9ncmVzc0tleXNcblx0XHQpKTtcblxuXHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSB9KTtcblxuXHRcdHJldHVybiBwYXJ0O1xuXHR9XG5cblxuXHRmdW5jdGlvbiBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0OiBDaGF0U3ViYWdlbnRDb250ZW50UGFydCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBidXR0b24gPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtdXNlZC1jb250ZXh0LWxhYmVsID4gLm1vbmFjby1idXR0b24nKTtcblx0XHRyZXR1cm4gaXNIVE1MRWxlbWVudChidXR0b24pID8gYnV0dG9uIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0Q29sbGFwc2VCdXR0b25MYWJlbChidXR0b246IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxhYmVsID0gYnV0dG9uLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uLW1kbGFiZWwnKTtcblx0XHRyZXR1cm4gaXNIVE1MRWxlbWVudChsYWJlbCkgPyBsYWJlbCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldENvbGxhcHNlQnV0dG9uSWNvbihidXR0b246IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGljb24gPSBidXR0b24uZmlyc3RFbGVtZW50Q2hpbGQ7XG5cdFx0cmV0dXJuIGlzSFRNTEVsZW1lbnQoaWNvbikgPyBpY29uIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0V3JhcHBlckVsZW1lbnQocGFydDogQ2hhdFN1YmFnZW50Q29udGVudFBhcnQpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgd3JhcHBlciA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC10aGlua2luZy1jb2xsYXBzaWJsZScpO1xuXHRcdHJldHVybiBpc0hUTUxFbGVtZW50KHdyYXBwZXIpID8gd3JhcHBlciA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldE9wZW5DaGF0Q29udGV4dChwYXJ0OiBDaGF0U3ViYWdlbnRDb250ZW50UGFydCk6IHsgY2hhdFJlc291cmNlOiBzdHJpbmc7IGNvbmZpcm1hdGlvbkNvdW50OiBudW1iZXI7IGNvbmZpcm1hdGlvbkFjdGl2ZT86IGJvb2xlYW47IHN0YXJ0ZWRBdD86IG51bWJlcjsgZHVyYXRpb24/OiBudW1iZXI7IG1vZGVsTmFtZT86IHN0cmluZzsgYWN0aXZlVG9vbExhYmVsPzogc3RyaW5nOyBhY3RpdmVUb29sSWNvbj86IFRoZW1lSWNvbiB9IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gKHBhcnQgYXMgdW5rbm93biBhcyB7IF9vcGVuQ2hhdFRvb2xiYXI/OiB7IGFjdGlvbkJhcj86IHsgY29udGV4dD86IHsgY2hhdFJlc291cmNlOiBzdHJpbmc7IGNvbmZpcm1hdGlvbkNvdW50OiBudW1iZXI7IGNvbmZpcm1hdGlvbkFjdGl2ZT86IGJvb2xlYW47IHN0YXJ0ZWRBdD86IG51bWJlcjsgZHVyYXRpb24/OiBudW1iZXI7IG1vZGVsTmFtZT86IHN0cmluZzsgYWN0aXZlVG9vbExhYmVsPzogc3RyaW5nOyBhY3RpdmVUb29sSWNvbj86IFRoZW1lSWNvbiB9IH0gfSB9KS5fb3BlbkNoYXRUb29sYmFyPy5hY3Rpb25CYXI/LmNvbnRleHQ7XG5cdH1cblxuXHRmdW5jdGlvbiBzZXRPcGVuQ2hhdE9ubHlNb2RlKHBhcnQ6IENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0LCBlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgdG9vbGJhciA9IChwYXJ0IGFzIHVua25vd24gYXMgeyBfb3BlbkNoYXRUb29sYmFyPzogeyBnZXRJdGVtc0xlbmd0aCgpOiBudW1iZXI7IGdldEl0ZW1BY3Rpb24oaW5kZXg6IG51bWJlcik6IEFjdGlvbiB8IHVuZGVmaW5lZCB9IH0pLl9vcGVuQ2hhdFRvb2xiYXI7XG5cdFx0YXNzZXJ0Lm9rKHRvb2xiYXIpO1xuXHRcdGNvbnN0IGFjdGlvbiA9IHN0b3JlLmFkZChuZXcgQWN0aW9uKCdvcGVuU3ViYWdlbnQnLCAnT3BlbiBTdWJhZ2VudCcsICcnLCBlbmFibGVkKSk7XG5cdFx0dG9vbGJhci5nZXRJdGVtc0xlbmd0aCA9ICgpID0+IDE7XG5cdFx0dG9vbGJhci5nZXRJdGVtQWN0aW9uID0gKCkgPT4gYWN0aW9uO1xuXHRcdChwYXJ0IGFzIHVua25vd24gYXMgeyBfdXBkYXRlT3BlbkNoYXRPbmx5TW9kZSgpOiB2b2lkIH0pLl91cGRhdGVPcGVuQ2hhdE9ubHlNb2RlKCk7XG5cdH1cblxuXHRzdWl0ZSgnQmFzaWMgcmVuZGVyaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBjcmVhdGUgc3ViYWdlbnQgcGFydCB3aXRoIGNvcnJlY3QgY2xhc3NlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKCk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXRoaW5raW5nLWJveCcpLCAnU2hvdWxkIGhhdmUgY2hhdC10aGlua2luZy1ib3ggY2xhc3MnKTtcblx0XHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXN1YmFnZW50LXBhcnQnKSwgJ1Nob3VsZCBoYXZlIGNoYXQtc3ViYWdlbnQtcGFydCBjbGFzcycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdGhpbmtpbmctZml4ZWQtbW9kZScpLCAnU2hvdWxkIGhhdmUgY2hhdC10aGlua2luZy1maXhlZC1tb2RlIGNsYXNzJyk7XG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1jb2xsYXBzaWJsZS1jb250ZW50LWFuaW1hdGFibGUnKSwgJ1Nob3VsZCBwcmVwYXJlIGV4cGFuZGFibGUgY29udGVudCBmb3IgYW5pbWF0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1jb2xsYXBzaWJsZS1jb250ZW50LWFuaW1hdGVkJyksIGZhbHNlLCAnU2hvdWxkIHByZXNlcnZlIHRoZSBjb2xsYXBzZWQgc3RyZWFtaW5nIHByZXZpZXcgYXQgcmVzdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlbmRlciB0aGUgb3Blbi1jaGF0IHRvb2xiYXIgYmVzaWRlIHRoZSBjb2xsYXBzZSBidXR0b24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Rlc3Qgc3ViYWdlbnQgZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZTogJ2FocC1jaGF0Oi8vc3ViYWdlbnQvdGVzdC90b29sLWNhbGwnLFxuXHRcdFx0XHR9XG5cdFx0XHR9KSwgY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpKTtcblx0XHRcdGNvbnN0IGhlYWRlciA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC11c2VkLWNvbnRleHQtbGFiZWwnKTtcblx0XHRcdGNvbnN0IHRvb2xiYXIgPSBoZWFkZXI/LnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXN1YmFnZW50LW9wZW4tY2hhdC10b29sYmFyJyk7XG5cdFx0XHRjb25zdCBjb2xsYXBzZUJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aGFzQ2hhdENsYXNzOiBwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXN1YmFnZW50LWhhcy1jaGF0JyksXG5cdFx0XHRcdHRvb2xiYXJQYXJlbnRJc0hlYWRlcjogdG9vbGJhcj8ucGFyZW50RWxlbWVudCA9PT0gaGVhZGVyLFxuXHRcdFx0XHR0b29sYmFyUHJlY2VkZXNDb2xsYXBzZUJ1dHRvbjogdG9vbGJhcj8ubmV4dEVsZW1lbnRTaWJsaW5nID09PSBjb2xsYXBzZUJ1dHRvbixcblx0XHRcdH0sIHtcblx0XHRcdFx0aGFzQ2hhdENsYXNzOiB0cnVlLFxuXHRcdFx0XHR0b29sYmFyUGFyZW50SXNIZWFkZXI6IHRydWUsXG5cdFx0XHRcdHRvb2xiYXJQcmVjZWRlc0NvbGxhcHNlQnV0dG9uOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIGEgbWVudSBzbmFwc2hvdCB3aXRob3V0IHBlcnNpc3RlbnQgbWVudSBvciBhY3Rpb24tdmlldyBsaXN0ZW5lcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Rlc3Qgc3ViYWdlbnQgZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZTogJ2FocC1jaGF0Oi8vc3ViYWdlbnQvdGVzdC90b29sLWNhbGwnLFxuXHRcdFx0XHR9XG5cdFx0XHR9KSwgY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGhhc1Rvb2xiYXI6ICEhKHBhcnQgYXMgdW5rbm93biBhcyB7IF9vcGVuQ2hhdFRvb2xiYXI/OiBvYmplY3QgfSkuX29wZW5DaGF0VG9vbGJhcixcblx0XHRcdFx0Y3JlYXRlTWVudUNhbGxzOiBtZW51U2VydmljZS5jcmVhdGVNZW51Q2FsbHMsXG5cdFx0XHRcdGdldE1lbnVBY3Rpb25zQ2FsbHM6IG1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zQ2FsbHMsXG5cdFx0XHRcdGhhc0FjdGlvblZpZXdMaXN0ZW5lcnM6IGFjdGlvblZpZXdJdGVtU2VydmljZS5oYXNDaGFuZ2VMaXN0ZW5lcnMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGhhc1Rvb2xiYXI6IHRydWUsXG5cdFx0XHRcdGNyZWF0ZU1lbnVDYWxsczogMCxcblx0XHRcdFx0Z2V0TWVudUFjdGlvbnNDYWxsczogMSxcblx0XHRcdFx0aGFzQWN0aW9uVmlld0xpc3RlbmVyczogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoaWRlIHRoZSBjb21wbGV0ZSBjb2xsYXBzaWJsZSBzdXJmYWNlIHdoZW4gdGhlIG9wZW4tY2hhdCBhY3Rpb24gaXMgYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdUZXN0IHN1YmFnZW50IGRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L3Rlc3QvdG9vbC1jYWxsJyxcblx0XHRcdFx0fVxuXHRcdFx0fSksIGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKSk7XG5cdFx0XHRzZXRPcGVuQ2hhdE9ubHlNb2RlKHBhcnQsIHRydWUpO1xuXG5cdFx0XHRjb25zdCBjb2xsYXBzZUJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0Y29uc3QgYW5pbWF0aW9uQ29udGFpbmVyID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuY2hhdC1jb2xsYXBzaWJsZS1jb250ZW50LWFuaW1hdGlvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbGxhcHNlQnV0dG9uKTtcblx0XHRcdGFzc2VydC5vayhhbmltYXRpb25Db250YWluZXIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG9wZW5DaGF0T25seUNsYXNzOiBwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXN1YmFnZW50LW9wZW4tY2hhdC1vbmx5JyksXG5cdFx0XHRcdGNvbGxhcHNlQnV0dG9uRGlzcGxheTogY29sbGFwc2VCdXR0b24uc3R5bGUuZGlzcGxheSxcblx0XHRcdFx0YW5pbWF0aW9uRGlzcGxheTogYW5pbWF0aW9uQ29udGFpbmVyLnN0eWxlLmRpc3BsYXksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG9wZW5DaGF0T25seUNsYXNzOiB0cnVlLFxuXHRcdFx0XHRjb2xsYXBzZUJ1dHRvbkRpc3BsYXk6ICdub25lJyxcblx0XHRcdFx0YW5pbWF0aW9uRGlzcGxheTogJ25vbmUnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaHlkcmF0ZSBvcGVuLWNoYXQtb25seSBtb2RlIHdoZW4gdGhlIGFjdGlvbiB2aWV3IHJlZ2lzdGVycyBhZnRlciByZW5kZXJpbmcnLCAoKSA9PiB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVNlcnZpY2Uuc2V0UHJvdmlkZXJBdmFpbGFibGUoZmFsc2UpO1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdUZXN0IHN1YmFnZW50IGRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L3Rlc3QvdG9vbC1jYWxsJyxcblx0XHRcdFx0fVxuXHRcdFx0fSksIGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKSk7XG5cdFx0XHRjb25zdCBsaXN0ZW5pbmdCZWZvcmVSZWdpc3RyYXRpb24gPSBhY3Rpb25WaWV3SXRlbVNlcnZpY2UuaGFzQ2hhbmdlTGlzdGVuZXJzO1xuXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVNlcnZpY2Uuc2V0UHJvdmlkZXJBdmFpbGFibGUodHJ1ZSk7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVNlcnZpY2UuZmlyZURpZENoYW5nZShNZW51SWQuQ2hhdFN1YmFnZW50Q29udGVudCk7XG5cblx0XHRcdGNvbnN0IGNvbGxhcHNlQnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRjb25zdCBhbmltYXRpb25Db250YWluZXIgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LWNvbGxhcHNpYmxlLWNvbnRlbnQtYW5pbWF0aW9uJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bGlzdGVuaW5nQmVmb3JlUmVnaXN0cmF0aW9uLFxuXHRcdFx0XHRsaXN0ZW5pbmdBZnRlclJlZ2lzdHJhdGlvbjogYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmhhc0NoYW5nZUxpc3RlbmVycyxcblx0XHRcdFx0b3BlbkNoYXRPbmx5Q2xhc3M6IHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtc3ViYWdlbnQtb3Blbi1jaGF0LW9ubHknKSxcblx0XHRcdFx0Y29sbGFwc2VCdXR0b25EaXNwbGF5OiBjb2xsYXBzZUJ1dHRvbj8uc3R5bGUuZGlzcGxheSxcblx0XHRcdFx0YW5pbWF0aW9uRGlzcGxheTogYW5pbWF0aW9uQ29udGFpbmVyPy5zdHlsZS5kaXNwbGF5LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRsaXN0ZW5pbmdCZWZvcmVSZWdpc3RyYXRpb246IHRydWUsXG5cdFx0XHRcdGxpc3RlbmluZ0FmdGVyUmVnaXN0cmF0aW9uOiBmYWxzZSxcblx0XHRcdFx0b3BlbkNoYXRPbmx5Q2xhc3M6IHRydWUsXG5cdFx0XHRcdGNvbGxhcHNlQnV0dG9uRGlzcGxheTogJ25vbmUnLFxuXHRcdFx0XHRhbmltYXRpb25EaXNwbGF5OiAnbm9uZScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBwcmVzZXJ2ZSB0aGUgY29sbGFwc2libGUgc3VyZmFjZSB3aGVuIHRoZSBvcGVuLWNoYXQgYWN0aW9uIGlzIHVuYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdUZXN0IHN1YmFnZW50IGRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L3Rlc3QvdG9vbC1jYWxsJyxcblx0XHRcdFx0fVxuXHRcdFx0fSksIGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKSk7XG5cdFx0XHRzZXRPcGVuQ2hhdE9ubHlNb2RlKHBhcnQsIGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgY29sbGFwc2VCdXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGNvbnN0IGFuaW1hdGlvbkNvbnRhaW5lciA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRpb24nKTtcblx0XHRcdGFzc2VydC5vayhjb2xsYXBzZUJ1dHRvbik7XG5cdFx0XHRhc3NlcnQub2soYW5pbWF0aW9uQ29udGFpbmVyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRvcGVuQ2hhdE9ubHlDbGFzczogcGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1zdWJhZ2VudC1vcGVuLWNoYXQtb25seScpLFxuXHRcdFx0XHRjb2xsYXBzZUJ1dHRvbkRpc3BsYXk6IGNvbGxhcHNlQnV0dG9uLnN0eWxlLmRpc3BsYXksXG5cdFx0XHRcdGFuaW1hdGlvbkRpc3BsYXk6IGFuaW1hdGlvbkNvbnRhaW5lci5zdHlsZS5kaXNwbGF5LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRvcGVuQ2hhdE9ubHlDbGFzczogZmFsc2UsXG5cdFx0XHRcdGNvbGxhcHNlQnV0dG9uRGlzcGxheTogJycsXG5cdFx0XHRcdGFuaW1hdGlvbkRpc3BsYXk6ICcnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHVibGlzaCB0aGUgbW9kZWwgYW5kIG5ld2VzdCBjaGlsZCB0b29sIGludGVudCB0byB0aGUgb3Blbi1jaGF0IHBpbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Rlc3Qgc3ViYWdlbnQgZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZTogJ2FocC1jaGF0Oi8vc3ViYWdlbnQvdGVzdC90b29sLWNhbGwnLFxuXHRcdFx0XHRcdG1vZGVsTmFtZTogJ0NsYXVkZSBTb25uZXQgNCcsXG5cdFx0XHRcdH1cblx0XHRcdH0pLCBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSkpO1xuXG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdjaGlsZC10b29sLTEnLFxuXHRcdFx0XHR0b29sSWQ6ICdzZWFyY2gnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJyAgU2VhcmNoXFxuICB0aGUgY29kZWJhc2UgICcsXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCBmaXJzdCA9IGdldE9wZW5DaGF0Q29udGV4dChwYXJ0KTtcblx0XHRcdHBhcnQudHJhY2tUb29sU3RhdGUoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ2NoaWxkLXRvb2wtMicsXG5cdFx0XHRcdHRvb2xJZDogJ3JlYWRfZmlsZScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCBwYWNrYWdlLmpzb24nLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3Qgc2Vjb25kID0gZ2V0T3BlbkNoYXRDb250ZXh0KHBhcnQpO1xuXHRcdFx0cGFydC5tYXJrQXNJbmFjdGl2ZSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Zmlyc3RNb2RlbDogZmlyc3Q/Lm1vZGVsTmFtZSxcblx0XHRcdFx0Zmlyc3RUb29sOiBmaXJzdD8uYWN0aXZlVG9vbExhYmVsLFxuXHRcdFx0XHRmaXJzdFRvb2xJY29uOiBmaXJzdD8uYWN0aXZlVG9vbEljb24/LmlkLFxuXHRcdFx0XHRzZWNvbmRUb29sOiBzZWNvbmQ/LmFjdGl2ZVRvb2xMYWJlbCxcblx0XHRcdFx0c2Vjb25kVG9vbEljb246IHNlY29uZD8uYWN0aXZlVG9vbEljb24/LmlkLFxuXHRcdFx0XHRjb21wbGV0ZWRUb29sOiBnZXRPcGVuQ2hhdENvbnRleHQocGFydCk/LmFjdGl2ZVRvb2xMYWJlbCxcblx0XHRcdFx0Y29tcGxldGVkVG9vbEljb246IGdldE9wZW5DaGF0Q29udGV4dChwYXJ0KT8uYWN0aXZlVG9vbEljb24sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGZpcnN0TW9kZWw6ICdDbGF1ZGUgU29ubmV0IDQnLFxuXHRcdFx0XHRmaXJzdFRvb2w6ICdTZWFyY2ggdGhlIGNvZGViYXNlJyxcblx0XHRcdFx0Zmlyc3RUb29sSWNvbjogJ3NlYXJjaCcsXG5cdFx0XHRcdHNlY29uZFRvb2w6ICdSZWFkIHBhY2thZ2UuanNvbicsXG5cdFx0XHRcdHNlY29uZFRvb2xJY29uOiAnYm9vaycsXG5cdFx0XHRcdGNvbXBsZXRlZFRvb2w6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29tcGxldGVkVG9vbEljb246IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHByZWZlciB0ZXJtaW5hbCBpbnRlbnRpb24gb3ZlciB0aGUgcmF3IGNvbW1hbmQgaW52b2NhdGlvbiBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0Y2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC90ZXN0L3Rvb2wtY2FsbCcsXG5cdFx0XHRcdH1cblx0XHRcdH0pLCBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSkpO1xuXG5cdFx0XHRjb25zdCB0ZXJtaW5hbFRvb2wgPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sQ2FsbElkOiAndGVybWluYWwtdG9vbCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBgZ3JlcCAtcm4gYWN0aXZlVG9vbExhYmVsIHNyYy92cy9zZXNzaW9uc2AnLFxuXHRcdFx0fSk7XG5cdFx0XHQodGVybWluYWxUb29sIGFzIHsgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUb29sSW52b2NhdGlvblsndG9vbFNwZWNpZmljRGF0YSddIH0pLnRvb2xTcGVjaWZpY0RhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdGNvbW1hbmRMaW5lOiB7XG5cdFx0XHRcdFx0b3JpZ2luYWw6ICdncmVwIC1ybiBhY3RpdmVUb29sTGFiZWwgc3JjL3ZzL3Nlc3Npb25zJyxcblx0XHRcdFx0XHR0b29sRWRpdGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXNlckVkaXRlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbnRlbnRpb246ICdGaW5kIGFjdGl2ZSB0b29sIHJlbmRlcmluZycsXG5cdFx0XHRcdGxhbmd1YWdlOiAnYmFzaCcsXG5cdFx0XHR9O1xuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZSh0ZXJtaW5hbFRvb2wpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0T3BlbkNoYXRDb250ZXh0KHBhcnQpPy5hY3RpdmVUb29sTGFiZWwsICdGaW5kIGFjdGl2ZSB0b29sIHJlbmRlcmluZycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGtlZXAgY29sbGFwc2VkIGFuaW1hdGVkIGNvbnRlbnQgb3V0IG9mIGtleWJvYXJkIG5hdmlnYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbigpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXHRcdFx0Y29uc3QgYW5pbWF0aW9uQ29udGFpbmVyID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuY2hhdC1jb2xsYXBzaWJsZS1jb250ZW50LWFuaW1hdGlvbicpO1xuXHRcdFx0Y29uc3QgYW5pbWF0aW9uQ29udGVudCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRpb24taW5uZXInKTtcblx0XHRcdGNvbnN0IGNoZXZyb24gPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtY29sbGFwc2libGUtaG92ZXItY2hldnJvbicpO1xuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRhc3NlcnQub2soYW5pbWF0aW9uQ29udGFpbmVyKTtcblx0XHRcdGFzc2VydC5vayhhbmltYXRpb25Db250ZW50KTtcblx0XHRcdGFzc2VydC5vayhjaGV2cm9uKTtcblx0XHRcdGFzc2VydC5vayhidXR0b24pO1xuXG5cdFx0XHRjb25zdCBjb2xsYXBzZWRJbmVydCA9IGFuaW1hdGlvbkNvbnRlbnQuaW5lcnQ7XG5cdFx0XHRjb25zdCBjb2xsYXBzZWRDaGV2cm9uRXhwYW5kZWQgPSBjaGV2cm9uLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKTtcblx0XHRcdGJ1dHRvbi5jbGljaygpO1xuXHRcdFx0Y29uc3QgYW5pbWF0aW9uRW5hYmxlZER1cmluZ1RvZ2dsZSA9IHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRlZCcpO1xuXHRcdFx0Y29uc3QgdHJhbnNpdGlvbkVuZCA9IG5ldyBtYWluV2luZG93LkV2ZW50KCd0cmFuc2l0aW9uZW5kJyk7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkodHJhbnNpdGlvbkVuZCwgJ3Byb3BlcnR5TmFtZScsIHsgdmFsdWU6ICdncmlkLXRlbXBsYXRlLXJvd3MnIH0pO1xuXHRcdFx0YW5pbWF0aW9uQ29udGFpbmVyLmRpc3BhdGNoRXZlbnQodHJhbnNpdGlvbkVuZCk7XG5cdFx0XHRjb25zdCBhbmltYXRpb25FbmFibGVkQWZ0ZXJUb2dnbGUgPSBwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LWNvbGxhcHNpYmxlLWNvbnRlbnQtYW5pbWF0ZWQnKTtcblx0XHRcdGFuaW1hdGlvbkNvbnRlbnQuZGlzcGF0Y2hFdmVudChuZXcgbWFpbldpbmRvdy5DdXN0b21FdmVudChDaGF0Q29sbGFwc2libGVDb250ZW50UGFydC51c2VyVG9nZ2xlRXZlbnQsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjb2xsYXBzZWRJbmVydCxcblx0XHRcdFx0Y29sbGFwc2VkQ2hldnJvbkV4cGFuZGVkLFxuXHRcdFx0XHRhbmltYXRpb25FbmFibGVkRHVyaW5nVG9nZ2xlLFxuXHRcdFx0XHRhbmltYXRpb25FbmFibGVkQWZ0ZXJUb2dnbGUsXG5cdFx0XHRcdG5lc3RlZFRvZ2dsZUlnbm9yZWQ6ICFwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LWNvbGxhcHNpYmxlLWNvbnRlbnQtYW5pbWF0ZWQnKSxcblx0XHRcdFx0ZXhwYW5kZWRJbmVydDogYW5pbWF0aW9uQ29udGVudC5pbmVydCxcblx0XHRcdFx0ZXhwYW5kZWRDaGV2cm9uRXhwYW5kZWQ6IGNoZXZyb24uY2xhc3NMaXN0LmNvbnRhaW5zKCdleHBhbmRlZCcpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjb2xsYXBzZWRJbmVydDogdHJ1ZSxcblx0XHRcdFx0Y29sbGFwc2VkQ2hldnJvbkV4cGFuZGVkOiBmYWxzZSxcblx0XHRcdFx0YW5pbWF0aW9uRW5hYmxlZER1cmluZ1RvZ2dsZTogdHJ1ZSxcblx0XHRcdFx0YW5pbWF0aW9uRW5hYmxlZEFmdGVyVG9nZ2xlOiBmYWxzZSxcblx0XHRcdFx0bmVzdGVkVG9nZ2xlSWdub3JlZDogdHJ1ZSxcblx0XHRcdFx0ZXhwYW5kZWRJbmVydDogZmFsc2UsXG5cdFx0XHRcdGV4cGFuZGVkQ2hldnJvbkV4cGFuZGVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzdG9yZSB0aGUgc3RyZWFtaW5nIHByZXZpZXcgd2hlbiBhbiBhbmltYXRpb24gaXMgY2FuY2VsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oKSwgY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpKTtcblx0XHRcdGNvbnN0IGFuaW1hdGlvbkNvbnRhaW5lciA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRpb24nKTtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFuaW1hdGlvbkNvbnRhaW5lcik7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uKTtcblxuXHRcdFx0YnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRhbmltYXRpb25Db250YWluZXIuZ2V0QW5pbWF0aW9ucyA9ICgpID0+IFtdO1xuXHRcdFx0Y29uc3QgdHJhbnNpdGlvbkNhbmNlbCA9IG5ldyBtYWluV2luZG93LkV2ZW50KCd0cmFuc2l0aW9uY2FuY2VsJyk7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkodHJhbnNpdGlvbkNhbmNlbCwgJ3Byb3BlcnR5TmFtZScsIHsgdmFsdWU6ICdncmlkLXRlbXBsYXRlLXJvd3MnIH0pO1xuXHRcdFx0YW5pbWF0aW9uQ29udGFpbmVyLmRpc3BhdGNoRXZlbnQodHJhbnNpdGlvbkNhbmNlbCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IG1haW5XaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHJlc29sdmUoKSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1jb2xsYXBzaWJsZS1jb250ZW50LWFuaW1hdGVkJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzaGltbWVyIGZvciBhbiBpbi1wcm9ncmVzcyBzdWJhZ2VudCBldmVuIHdoZW4gdGhlIHJlc3BvbnNlIGlzIGNvbXBsZXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oeyBzdGF0ZVR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyB9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dCh0cnVlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXRoaW5raW5nLXRpdGxlLXNoaW1tZXInKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHNoaW1tZXIgZm9yIGEgY29tcGxldGVkIHN1YmFnZW50IHdoaWxlIHRoZSByZXNwb25zZSBpcyBpbiBwcm9ncmVzcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1NlcmlhbGl6ZWRUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ29tcGxldGVkIHRhc2snLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGlzQWN0aXZlOiBwYXJ0LmdldElzQWN0aXZlKCksXG5cdFx0XHRcdGhhc1NoaW1tZXI6ICEhcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXRoaW5raW5nLXRpdGxlLXNoaW1tZXInKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aXNBY3RpdmU6IGZhbHNlLFxuXHRcdFx0XHRoYXNTaGltbWVyOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNoaW1tZXIgd2hpbGUgQWdlbnQgSG9zdCByZXBvcnRzIGFuIGFjdGl2ZSBjaGlsZCBjaGF0IGFmdGVyIHRvb2wgY29tcGxldGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1NlcmlhbGl6ZWRUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUnVubmluZyBjaGlsZCBjaGF0Jyxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRpc0FjdGl2ZTogcGFydC5nZXRJc0FjdGl2ZSgpLFxuXHRcdFx0XHRoYXNTaGltbWVyOiAhIXBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC10aGlua2luZy10aXRsZS1zaGltbWVyJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRoYXNTaGltbWVyOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3RhcnQgY29sbGFwc2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCAnU2hvdWxkIGJlIGNvbGxhcHNlZCBieSBkZWZhdWx0Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdUaXRsZSBleHRyYWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IHRpdGxlIHdpdGggYWdlbnQgbmFtZSBmcm9tIHRvb2xTcGVjaWZpY0RhdGEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2VhcmNoaW5nIHRoZSBjb2RlYmFzZScsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnQ29kZVNlYXJjaEFnZW50Jyxcblx0XHRcdFx0XHRwcm9tcHQ6ICdTZWFyY2ggZm9yIGF1dGhlbnRpY2F0aW9uJ1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uLCAnU2hvdWxkIGhhdmUgY29sbGFwc2UgYnV0dG9uJyk7XG5cdFx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSBnZXRDb2xsYXBzZUJ1dHRvbkxhYmVsKGJ1dHRvbik7XG5cdFx0XHRjb25zdCBidXR0b25UZXh0ID0gbGFiZWxFbGVtZW50Py50ZXh0Q29udGVudCA/PyBidXR0b24udGV4dENvbnRlbnQgPz8gJyc7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uVGV4dC5pbmNsdWRlcygnQ29kZVNlYXJjaEFnZW50JyksICdUaXRsZSBzaG91bGQgaW5jbHVkZSBhZ2VudCBuYW1lJyk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uVGV4dC5pbmNsdWRlcygnU2VhcmNoaW5nIHRoZSBjb2RlYmFzZScpLCAnVGl0bGUgc2hvdWxkIGluY2x1ZGUgZGVzY3JpcHRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgZGVmYXVsdCBwcmVmaXggd2hlbiBubyBhZ2VudCBuYW1lIGlzIHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaydcblx0XHRcdFx0XHQvLyBubyBhZ2VudE5hbWVcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbiwgJ1Nob3VsZCBoYXZlIGNvbGxhcHNlIGJ1dHRvbicpO1xuXHRcdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gZ2V0Q29sbGFwc2VCdXR0b25MYWJlbChidXR0b24pO1xuXHRcdFx0Y29uc3QgYnV0dG9uVGV4dCA9IGxhYmVsRWxlbWVudD8udGV4dENvbnRlbnQgPz8gYnV0dG9uLnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvblRleHQuaW5jbHVkZXMoJ1N1YmFnZW50OicpLCAnVGl0bGUgc2hvdWxkIHVzZSBkZWZhdWx0IFN1YmFnZW50IHByZWZpeCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTGF0ZSBtZXRhZGF0YSB1cGRhdGVzJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBwYXJlbnQgc3ViYWdlbnQgdG9vbCBpcyBvZnRlbiBjb25zdHJ1Y3RlZCBiZWZvcmVcblx0XHQvLyBgc3ViYWdlbnRfc3RhcnRlZGAgKHdoaWNoIGNhcnJpZXMgdGhlIHJlYWwgYWdlbnROYW1lKSBhcnJpdmVzLlxuXHRcdC8vIFRoZSBhdXRvcnVuIGluIGB3YXRjaFRvb2xDb21wbGV0aW9uYCByZS1yZWFkcyBtZXRhZGF0YSB3aGVuIHN0YXRlXG5cdFx0Ly8gY2hhbmdlcyBhbmQgdXBkYXRlcyB0aGUgdGl0bGUgaWYgdGhlIGRlc2NyaXB0aW9uIHRyYW5zaXRpb25lZCBmcm9tXG5cdFx0Ly8gdGhlIGRlZmF1bHQgcGxhY2Vob2xkZXIgdG8gYSByZWFsIHZhbHVlLCBvciBpZiB0aGUgYWdlbnROYW1lXG5cdFx0Ly8gY2hhbmdlZCB0byBhIHJlYWwgdmFsdWUuIFRoZXNlIHRlc3RzIGNvdmVyIHRoYXQgYnJhbmNoIGRpcmVjdGx5LlxuXG5cdFx0ZnVuY3Rpb24gZ2V0VGl0bGVUZXh0KHBhcnQ6IENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0KTogc3RyaW5nIHtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbiwgJ1Nob3VsZCBoYXZlIGNvbGxhcHNlIGJ1dHRvbicpO1xuXHRcdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gZ2V0Q29sbGFwc2VCdXR0b25MYWJlbChidXR0b24pO1xuXHRcdFx0cmV0dXJuIGxhYmVsRWxlbWVudD8udGV4dENvbnRlbnQgPz8gYnV0dG9uLnRleHRDb250ZW50ID8/ICcnO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGdldFNldHRhYmxlU3RhdGUodG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24pOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4+IHtcblx0XHRcdHJldHVybiB0b29sSW52b2NhdGlvbi5zdGF0ZSBhcyBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4+O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHNldFRvb2xTcGVjaWZpY0RhdGEodG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24sIGRhdGE6IElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEpOiB2b2lkIHtcblx0XHRcdCh0b29sSW52b2NhdGlvbiBhcyB7IHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEgfSkudG9vbFNwZWNpZmljRGF0YSA9IGRhdGE7XG5cdFx0fVxuXG5cdFx0dGVzdCgndXBkYXRlVGl0bGUgY2xlYXJzIHByZXZpb3VzIHRpdGxlIGZpbGUgd2lkZ2V0IGRpc3Bvc2FibGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oeyBpbnZvY2F0aW9uTWVzc2FnZTogJ2ZpcnN0JyB9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0KHBhcnQgYXMgdW5rbm93biBhcyB7IF90aXRsZUZpbGVXaWRnZXRTdG9yZTogRGlzcG9zYWJsZVN0b3JlIH0pLl90aXRsZUZpbGVXaWRnZXRTdG9yZS5hZGQoeyBkaXNwb3NlOiAoKSA9PiB7IGRpc3Bvc2VkID0gdHJ1ZTsgfSB9KTtcblxuXHRcdFx0Ly8gVHJpZ2dlciBhIHRpdGxlIHJlLXJlbmRlclxuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZShjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oeyBpbnZvY2F0aW9uTWVzc2FnZTogJ3NlY29uZCcgfSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWQsIHRydWUsICdQcmV2aW91cyB0aXRsZSBmaWxlIHdpZGdldCBkaXNwb3NhYmxlIHNob3VsZCBiZSBjbGVhcmVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWZhdWx0IGRlc2NyaXB0aW9uIHdpdGggbm8gYWdlbnROYW1lIFx1MjE5MiByZWFsIGRlc2NyaXB0aW9uIGFycml2ZXMgbGF0ZXIgXHUyMTkyIHRpdGxlIHVwZGF0ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YTogeyBraW5kOiAnc3ViYWdlbnQnIC8qIG5vIGRlc2NyaXB0aW9uLCBubyBhZ2VudE5hbWUgKi8gfVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHRhc3NlcnQub2soZ2V0VGl0bGVUZXh0KHBhcnQpLmluY2x1ZGVzKCdTdWJhZ2VudDonKSwgJ1RpdGxlIHNob3VsZCBzdGFydCB3aXRoIGRlZmF1bHQgcHJlZml4Jyk7XG5cblx0XHRcdC8vIExhdGUgbWV0YWRhdGE6IHJlYWwgZGVzY3JpcHRpb24gYXJyaXZlcyB2aWEgQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWRcblx0XHRcdHNldFRvb2xTcGVjaWZpY0RhdGEodG9vbEludm9jYXRpb24sIHsga2luZDogJ3N1YmFnZW50JywgZGVzY3JpcHRpb246ICdTZWFyY2hpbmcgdGhlIGNvZGViYXNlJyB9KTtcblx0XHRcdGdldFNldHRhYmxlU3RhdGUodG9vbEludm9jYXRpb24pLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQub2soZ2V0VGl0bGVUZXh0KHBhcnQpLmluY2x1ZGVzKCdTZWFyY2hpbmcgdGhlIGNvZGViYXNlJyksICdUaXRsZSBzaG91bGQgcmVmbGVjdCB0aGUgbmV3IGRlc2NyaXB0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFsIGRlc2NyaXB0aW9uIGFscmVhZHkgc2V0IFx1MjE5MiBhZ2VudE5hbWUgYXJyaXZlcyBsYXRlciBcdTIxOTIgdGl0bGUgdXBkYXRlcyAocmVncmVzc2lvbiknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YTogeyBraW5kOiAnc3ViYWdlbnQnLCBkZXNjcmlwdGlvbjogJ1NlYXJjaGluZyB0aGUgY29kZWJhc2UnIC8qIG5vIGFnZW50TmFtZSAqLyB9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdGFzc2VydC5vayhnZXRUaXRsZVRleHQocGFydCkuaW5jbHVkZXMoJ1NlYXJjaGluZyB0aGUgY29kZWJhc2UnKSwgJ1RpdGxlIHNob3VsZCBzdGFydCB3aXRoIHRoZSByZWFsIGRlc2NyaXB0aW9uJyk7XG5cdFx0XHRhc3NlcnQub2soIWdldFRpdGxlVGV4dChwYXJ0KS5pbmNsdWRlcygnQ29kZVNlYXJjaEFnZW50JyksICdUaXRsZSBzaG91bGQgbm90IHlldCBoYXZlIGFnZW50IG5hbWUnKTtcblxuXHRcdFx0Ly8gTGF0ZSBtZXRhZGF0YTogYWdlbnROYW1lIGFycml2ZXMgdmlhIHN1YmFnZW50X3N0YXJ0ZWQgYWZ0ZXIgdGhlXG5cdFx0XHQvLyBkZXNjcmlwdGlvbiBoYXMgYWxyZWFkeSBiZWVuIHNldCAodGhlIGJ1ZyB3ZSBmaXhlZCkuXG5cdFx0XHRzZXRUb29sU3BlY2lmaWNEYXRhKHRvb2xJbnZvY2F0aW9uLCB7IGtpbmQ6ICdzdWJhZ2VudCcsIGRlc2NyaXB0aW9uOiAnU2VhcmNoaW5nIHRoZSBjb2RlYmFzZScsIGFnZW50TmFtZTogJ0NvZGVTZWFyY2hBZ2VudCcgfSk7XG5cdFx0XHRnZXRTZXR0YWJsZVN0YXRlKHRvb2xJbnZvY2F0aW9uKS5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGdldFRpdGxlVGV4dChwYXJ0KS5pbmNsdWRlcygnQ29kZVNlYXJjaEFnZW50JyksICdUaXRsZSBzaG91bGQgcmVmbGVjdCB0aGUgbmV3IGFnZW50IG5hbWUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FnZW50TmFtZSBhbHJlYWR5IHNldCBcdTIxOTIgZW1wdHkgYWdlbnROYW1lIGFycml2ZXMgXHUyMTkyIHRpdGxlIE5PVCBjbGVhcmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRzdGF0ZVR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHsga2luZDogJ3N1YmFnZW50JywgZGVzY3JpcHRpb246ICdTZWFyY2hpbmcgdGhlIGNvZGViYXNlJywgYWdlbnROYW1lOiAnQ29kZVNlYXJjaEFnZW50JyB9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdGFzc2VydC5vayhnZXRUaXRsZVRleHQocGFydCkuaW5jbHVkZXMoJ0NvZGVTZWFyY2hBZ2VudCcpLCAnVGl0bGUgc2hvdWxkIHN0YXJ0IHdpdGggdGhlIGFnZW50IG5hbWUnKTtcblxuXHRcdFx0Ly8gQSBzdWJzZXF1ZW50IHVwZGF0ZSBhcnJpdmVzIHdpdGggbm8gYWdlbnROYW1lIGZpZWxkIFx1MjAxNCB0aGUgcGFydFxuXHRcdFx0Ly8gbXVzdCBOT1QgY2xlYXIgdGhlIHByZXZpb3VzbHktc2V0IG5hbWUuXG5cdFx0XHRzZXRUb29sU3BlY2lmaWNEYXRhKHRvb2xJbnZvY2F0aW9uLCB7IGtpbmQ6ICdzdWJhZ2VudCcsIGRlc2NyaXB0aW9uOiAnU2VhcmNoaW5nIHRoZSBjb2RlYmFzZScgfSk7XG5cdFx0XHRnZXRTZXR0YWJsZVN0YXRlKHRvb2xJbnZvY2F0aW9uKS5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGdldFRpdGxlVGV4dChwYXJ0KS5pbmNsdWRlcygnQ29kZVNlYXJjaEFnZW50JyksICdUaXRsZSBzaG91bGQgc3RpbGwgaGF2ZSB0aGUgYWdlbnQgbmFtZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhbCBkZXNjcmlwdGlvbiBhbHJlYWR5IHNldCBcdTIxOTIgbm8gZnVydGhlciBjaGFuZ2VzIFx1MjE5MiB0aXRsZSBwcmVzZXJ2ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YTogeyBraW5kOiAnc3ViYWdlbnQnLCBkZXNjcmlwdGlvbjogJ1NlYXJjaGluZyB0aGUgY29kZWJhc2UnLCBhZ2VudE5hbWU6ICdDb2RlU2VhcmNoQWdlbnQnIH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Y29uc3QgYmVmb3JlID0gZ2V0VGl0bGVUZXh0KHBhcnQpO1xuXG5cdFx0XHQvLyBUcmlnZ2VyIHRoZSBhdXRvcnVuIHdpdGhvdXQgY2hhbmdpbmcgdG9vbFNwZWNpZmljRGF0YS5cblx0XHRcdGdldFNldHRhYmxlU3RhdGUodG9vbEludm9jYXRpb24pLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGl0bGVUZXh0KHBhcnQpLCBiZWZvcmUsICdUaXRsZSBzaG91bGQgYmUgdW5jaGFuZ2VkIHdoZW4gbm8gbWV0YWRhdGEgY2hhbmdlZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnU3RhdGUgbWFuYWdlbWVudCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgc3RhcnQgYXMgYWN0aXZlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZ2V0SXNBY3RpdmUoKSwgdHJ1ZSwgJ1Nob3VsZCBzdGFydCBhcyBhY3RpdmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcmtBc0luYWN0aXZlIHNob3VsZCB1cGRhdGUgaXNBY3RpdmUgc3RhdGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbigpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHRwYXJ0Lm1hcmtBc0luYWN0aXZlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRpc0FjdGl2ZTogcGFydC5nZXRJc0FjdGl2ZSgpLFxuXHRcdFx0XHRhbmltYXRpb25FbmFibGVkOiBwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LWNvbGxhcHNpYmxlLWNvbnRlbnQtYW5pbWF0ZWQnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aXNBY3RpdmU6IGZhbHNlLFxuXHRcdFx0XHRhbmltYXRpb25FbmFibGVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3JjZWQgaW5hY3RpdmUgc3RhdGUgZnJlZXplcyB0aW1pbmcgZm9yIGEgdGVybWluYWwgcGFyZW50IHJlc3BvbnNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0Y2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC90ZXN0L3Rvb2wtY2FsbCcsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogRGF0ZS5ub3coKSAtIDUwMDAsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHsgdG9vbFNwZWNpZmljRGF0YSB9KSwgY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpKTtcblxuXHRcdFx0cGFydC5tYXJrQXNJbmFjdGl2ZSh0cnVlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGlzQWN0aXZlOiB0b29sU3BlY2lmaWNEYXRhLmlzQWN0aXZlLFxuXHRcdFx0XHRoYXNEdXJhdGlvbjogdHlwZW9mIHRvb2xTcGVjaWZpY0RhdGEuZHVyYXRpb24gPT09ICdudW1iZXInICYmIHRvb2xTcGVjaWZpY0RhdGEuZHVyYXRpb24gPj0gNTAwMCxcblx0XHRcdFx0Y29udGV4dER1cmF0aW9uOiBnZXRPcGVuQ2hhdENvbnRleHQocGFydCk/LmR1cmF0aW9uLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpc0FjdGl2ZTogZmFsc2UsXG5cdFx0XHRcdGhhc0R1cmF0aW9uOiB0cnVlLFxuXHRcdFx0XHRjb250ZXh0RHVyYXRpb246IHRvb2xTcGVjaWZpY0RhdGEuZHVyYXRpb24sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvcmNlZCBpbmFjdGl2ZSBzdGF0ZSBmcmVlemVzIHNlcmlhbGl6ZWQgc3ViYWdlbnQgdGltaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmVzdG9yZWQgdGFzaycsXG5cdFx0XHRcdGNoYXRSZXNvdXJjZTogJ2FocC1jaGF0Oi8vc3ViYWdlbnQvdGVzdC9yZXN0b3JlZCcsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogRGF0ZS5ub3coKSAtIDUwMDAsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoY3JlYXRlTW9ja1NlcmlhbGl6ZWRUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0XHR9KSwgY3JlYXRlTW9ja1JlbmRlckNvbnRleHQodHJ1ZSkpO1xuXG5cdFx0XHRwYXJ0Lm1hcmtBc0luYWN0aXZlKHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aXNBY3RpdmU6IHRvb2xTcGVjaWZpY0RhdGEuaXNBY3RpdmUsXG5cdFx0XHRcdGhhc0R1cmF0aW9uOiB0eXBlb2YgdG9vbFNwZWNpZmljRGF0YS5kdXJhdGlvbiA9PT0gJ251bWJlcicgJiYgdG9vbFNwZWNpZmljRGF0YS5kdXJhdGlvbiA+PSA1MDAwLFxuXHRcdFx0XHRjb250ZXh0RHVyYXRpb246IGdldE9wZW5DaGF0Q29udGV4dChwYXJ0KT8uZHVyYXRpb24sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlzQWN0aXZlOiBmYWxzZSxcblx0XHRcdFx0aGFzRHVyYXRpb246IHRydWUsXG5cdFx0XHRcdGNvbnRleHREdXJhdGlvbjogdG9vbFNwZWNpZmljRGF0YS5kdXJhdGlvbixcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcHMgaW1tZWRpYXRlbHkgd2hlbiB0aGUgcGFyZW50IHJlc3BvbnNlIGJlY29tZXMgdGVybWluYWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvbkRpZENoYW5nZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxDaGF0UmVzcG9uc2VNb2RlbENoYW5nZVJlYXNvbj4oKSk7XG5cdFx0XHRsZXQgaXNDb21wbGV0ZSA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgYmFzZUNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cdFx0XHRjb25zdCBiYXNlRWxlbWVudCA9IGJhc2VDb250ZXh0LmVsZW1lbnQgYXMgSUNoYXRSZXNwb25zZVZpZXdNb2RlbDtcblx0XHRcdGNvbnN0IGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0ID0ge1xuXHRcdFx0XHQuLi5iYXNlQ29udGV4dCxcblx0XHRcdFx0ZWxlbWVudDoge1xuXHRcdFx0XHRcdC4uLmJhc2VFbGVtZW50LFxuXHRcdFx0XHRcdG1vZGVsOiB7XG5cdFx0XHRcdFx0XHQuLi5iYXNlRWxlbWVudC5tb2RlbCxcblx0XHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBvbkRpZENoYW5nZS5ldmVudCxcblx0XHRcdFx0XHR9IGFzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWxbJ21vZGVsJ10sXG5cdFx0XHRcdFx0Z2V0IGlzQ29tcGxldGUoKSB7IHJldHVybiBpc0NvbXBsZXRlOyB9LFxuXHRcdFx0XHRcdGdldCBpc0NhbmNlbGVkKCkgeyByZXR1cm4gZmFsc2U7IH0sXG5cdFx0XHRcdFx0c2V0Vm90ZTogKCkgPT4geyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdGNoYXRSZXNvdXJjZTogJ2FocC1jaGF0Oi8vc3ViYWdlbnQvdGVzdC90b29sLWNhbGwnLFxuXHRcdFx0XHRzdGFydGVkQXQ6IERhdGUubm93KCkgLSA1MDAwLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7IHRvb2xTcGVjaWZpY0RhdGEgfSksIGNvbnRleHQpO1xuXG5cdFx0XHRpc0NvbXBsZXRlID0gdHJ1ZTtcblx0XHRcdG9uRGlkQ2hhbmdlLmZpcmUoeyByZWFzb246ICdjb21wbGV0ZWRSZXF1ZXN0JyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGlzQWN0aXZlOiBwYXJ0LmdldElzQWN0aXZlKCksXG5cdFx0XHRcdHRvb2xJc0FjdGl2ZTogdG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSxcblx0XHRcdFx0aGFzRHVyYXRpb246IHR5cGVvZiB0b29sU3BlY2lmaWNEYXRhLmR1cmF0aW9uID09PSAnbnVtYmVyJyAmJiB0b29sU3BlY2lmaWNEYXRhLmR1cmF0aW9uID49IDUwMDAsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlzQWN0aXZlOiBmYWxzZSxcblx0XHRcdFx0dG9vbElzQWN0aXZlOiBmYWxzZSxcblx0XHRcdFx0aGFzRHVyYXRpb246IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcmtBc0luYWN0aXZlIHNob3VsZCByZW1vdmUgc3RyZWFtaW5nIGNsYXNzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gRXhwYW5kIHRvIHRyaWdnZXIgd3JhcHBlciBjcmVhdGlvblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cblx0XHRcdHBhcnQubWFya0FzSW5hY3RpdmUoKTtcblxuXHRcdFx0Y29uc3Qgd3JhcHBlciA9IGdldFdyYXBwZXJFbGVtZW50KHBhcnQpO1xuXHRcdFx0aWYgKHdyYXBwZXIpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdyYXBwZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXRoaW5raW5nLXN0cmVhbWluZycpLCBmYWxzZSxcblx0XHRcdFx0XHQnU3RyZWFtaW5nIGNsYXNzIHNob3VsZCBiZSByZW1vdmVkIGFmdGVyIG1hcmtBc0luYWN0aXZlJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXJrQXNJbmFjdGl2ZSBzaG91bGQgY29sbGFwc2UgdGhlIHBhcnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbigpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBGaXJzdCBleHBhbmRcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YnV0dG9uPy5jbGljaygpO1xuXG5cdFx0XHQvLyBWZXJpZnkgZXhwYW5kZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgZmFsc2UpO1xuXG5cdFx0XHRwYXJ0Lm1hcmtBc0luYWN0aXZlKCk7XG5cblx0XHRcdC8vIFNob3VsZCBjb2xsYXBzZSB3aGVuIGluYWN0aXZlXG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksICdTaG91bGQgYmUgY29sbGFwc2VkIGFmdGVyIG1hcmtBc0luYWN0aXZlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXJrQXNJbmFjdGl2ZSBzaG91bGQgY2hhbmdlIGRlZmF1bHQgZGVzY3JpcHRpb24gdG8gcGFzdCB0ZW5zZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0Ly8gbm8gZGVzY3JpcHRpb24gXHUyMDE0IHNob3VsZCB1c2UgdGhlIGRlZmF1bHQgXCJSdW5uaW5nIHN1YmFnZW50XCJcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIEJlZm9yZSBtYXJraW5nIGluYWN0aXZlLCB0aXRsZSBzaG91bGQgc2hvdyBcIlJ1bm5pbmcgc3ViYWdlbnRcIlxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uLCAnU2hvdWxkIGhhdmUgY29sbGFwc2UgYnV0dG9uJyk7XG5cdFx0XHRjb25zdCBsYWJlbEJlZm9yZSA9IGdldENvbGxhcHNlQnV0dG9uTGFiZWwoYnV0dG9uKTtcblx0XHRcdGNvbnN0IHRleHRCZWZvcmUgPSBsYWJlbEJlZm9yZT8udGV4dENvbnRlbnQgPz8gYnV0dG9uLnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0YXNzZXJ0Lm9rKHRleHRCZWZvcmUuaW5jbHVkZXMoJ1J1bm5pbmcgc3ViYWdlbnQnKSwgJ1RpdGxlIHNob3VsZCBzaG93IFwiUnVubmluZyBzdWJhZ2VudFwiIGJlZm9yZSBjb21wbGV0aW9uJyk7XG5cblx0XHRcdHBhcnQubWFya0FzSW5hY3RpdmUoKTtcblxuXHRcdFx0Ly8gQWZ0ZXIgbWFya2luZyBpbmFjdGl2ZSwgdGl0bGUgc2hvdWxkIHNob3cgXCJSYW4gc3ViYWdlbnRcIlxuXHRcdFx0Y29uc3QgbGFiZWxBZnRlciA9IGdldENvbGxhcHNlQnV0dG9uTGFiZWwoYnV0dG9uKTtcblx0XHRcdGNvbnN0IHRleHRBZnRlciA9IGxhYmVsQWZ0ZXI/LnRleHRDb250ZW50ID8/IGJ1dHRvbi50ZXh0Q29udGVudCA/PyAnJztcblx0XHRcdGFzc2VydC5vayh0ZXh0QWZ0ZXIuaW5jbHVkZXMoJ1JhbiBzdWJhZ2VudCcpLCAnVGl0bGUgc2hvdWxkIHNob3cgXCJSYW4gc3ViYWdlbnRcIiBhZnRlciBjb21wbGV0aW9uJyk7XG5cdFx0XHRhc3NlcnQub2soIXRleHRBZnRlci5pbmNsdWRlcygnUnVubmluZyBzdWJhZ2VudCcpLCAnVGl0bGUgc2hvdWxkIG5vIGxvbmdlciBzaG93IFwiUnVubmluZyBzdWJhZ2VudFwiJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXJrQXNJbmFjdGl2ZSBzaG91bGQga2VlcCBjdXN0b20gZGVzY3JpcHRpb24gdW5jaGFuZ2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1NlYXJjaGluZyB0aGUgY29kZWJhc2UnLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ0V4cGxvcmVyJyxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdHBhcnQubWFya0FzSW5hY3RpdmUoKTtcblxuXHRcdFx0Ly8gQWZ0ZXIgbWFya2luZyBpbmFjdGl2ZSwgdGl0bGUgc2hvdWxkIHN0aWxsIHNob3cgdGhlIGN1c3RvbSBkZXNjcmlwdGlvblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uLCAnU2hvdWxkIGhhdmUgY29sbGFwc2UgYnV0dG9uJyk7XG5cdFx0XHRjb25zdCBsYWJlbCA9IGdldENvbGxhcHNlQnV0dG9uTGFiZWwoYnV0dG9uKTtcblx0XHRcdGNvbnN0IHRleHQgPSBsYWJlbD8udGV4dENvbnRlbnQgPz8gYnV0dG9uLnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJ1NlYXJjaGluZyB0aGUgY29kZWJhc2UnKSwgJ1RpdGxlIHNob3VsZCBrZWVwIGN1c3RvbSBkZXNjcmlwdGlvbiBhZnRlciBjb21wbGV0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5hbGl6ZVRpdGxlIHNob3VsZCB1cGRhdGUgYnV0dG9uIGljb24gdG8gY2hlY2snLCAoKSA9PiB7XG5cdFx0XHQvLyBFbmFibGUgdGhlIHNob3dDaGVja21hcmtzIHNldHRpbmcgc28gdGhlIGNoZWNrIGljb24gaXMgdmlzaWJsZVxuXHRcdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpIGFzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZC5TaG93Q2hhdENoZWNrbWFya3MsIHRydWUpO1xuXG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbigpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHRwYXJ0LmZpbmFsaXplVGl0bGUoKTtcblxuXHRcdFx0Ly8gVGhlIGJ1dHRvbiBzaG91bGQgbm93IHNob3cgYSBjaGVjayBpY29uXG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdTaG91bGQgaGF2ZSBjb2xsYXBzZSBidXR0b24nKTtcblx0XHRcdGNvbnN0IGljb25FbGVtZW50ID0gZ2V0Q29sbGFwc2VCdXR0b25JY29uKGJ1dHRvbik7XG5cdFx0XHRhc3NlcnQub2soaWNvbkVsZW1lbnQ/LmNsYXNzTGlzdC5jb250YWlucygnY29kaWNvbi1jaGVjaycpLCAnU2hvdWxkIGhhdmUgY2hlY2sgaWNvbiBhZnRlciBmaW5hbGl6YXRpb24nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1NlcmlhbGl6ZWQgaW52b2NhdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHNlcmlhbGl6ZWQgdG9vbCBpbnZvY2F0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZEludm9jYXRpb24gPSBjcmVhdGVNb2NrU2VyaWFsaXplZFRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdDb21wbGV0ZWQgdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnRmluaXNoZWRBZ2VudCcsXG5cdFx0XHRcdFx0cHJvbXB0OiAnT3JpZ2luYWwgcHJvbXB0Jyxcblx0XHRcdFx0XHRyZXN1bHQ6ICdUYXNrIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KHRydWUpOyAvLyBpc0NvbXBsZXRlID0gdHJ1ZVxuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChzZXJpYWxpemVkSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIFNob3VsZCBhbHJlYWR5IGJlIGluYWN0aXZlIHNpbmNlIGl0J3Mgc2VyaWFsaXplZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZ2V0SXNBY3RpdmUoKSwgZmFsc2UsICdTZXJpYWxpemVkIGludm9jYXRpb24gc2hvdWxkIGJlIGluYWN0aXZlJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdoYXNTYW1lQ29udGVudCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgbm90IHJldXNlIHRoZSB2aXN1YWwgcGFydCBmb3IgYSBjaGlsZCB0b29sIGludm9jYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7IHN1YkFnZW50SW52b2NhdGlvbklkOiAnc3ViYWdlbnQtMTIzJyB9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Y29uc3Qgb3RoZXJJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbElkOiAnc29tZS10b29sJyxcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6ICdzdWJhZ2VudC0xMjMnXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFydC5oYXNTYW1lQ29udGVudChvdGhlckludm9jYXRpb24sIFtdLCBjb250ZXh0LmVsZW1lbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBmYWxzZSBmb3IgdG9vbCBpbnZvY2F0aW9uIHdpdGggZGlmZmVyZW50IHN1YkFnZW50SW52b2NhdGlvbklkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oeyBzdWJBZ2VudEludm9jYXRpb25JZDogJ3N1YmFnZW50LTEyMycgfSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdGNvbnN0IG90aGVySW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xJZDogJ3NvbWUtdG9vbCcsXG5cdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiAnc3ViYWdlbnQtNDU2J1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnQuaGFzU2FtZUNvbnRlbnQob3RoZXJJbnZvY2F0aW9uLCBbXSwgY29udGV4dC5lbGVtZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlLCAnU2hvdWxkIG5vdCBtYXRjaCB0b29sIGludm9jYXRpb24gd2l0aCBkaWZmZXJlbnQgc3ViQWdlbnRJbnZvY2F0aW9uSWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdHJ1ZSBmb3IgcnVuU3ViYWdlbnQgdG9vbCB1c2luZyB0b29sQ2FsbElkIGFzIGVmZmVjdGl2ZSBJRCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNoYXJlZFRvb2xDYWxsSWQgPSAnc2hhcmVkLXRvb2wtY2FsbC1pZCc7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xJZDogUnVuU3ViYWdlbnRUb29sLklkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBzaGFyZWRUb29sQ2FsbElkLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCwgdG9vbEludm9jYXRpb24udG9vbENhbGxJZCk7XG5cblx0XHRcdGNvbnN0IG90aGVySW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xJZDogUnVuU3ViYWdlbnRUb29sLklkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBzaGFyZWRUb29sQ2FsbElkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnQuaGFzU2FtZUNvbnRlbnQob3RoZXJJbnZvY2F0aW9uLCBbXSwgY29udGV4dC5lbGVtZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUsICdTaG91bGQgbWF0Y2ggcnVuU3ViYWdlbnQgdG9vbCB1c2luZyB0b29sQ2FsbElkIGFzIGVmZmVjdGl2ZSBJRCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCByZXVzZSB0aGUgdmlzdWFsIHBhcnQgZm9yIGdyb3VwZWQgbWFya2Rvd24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7IHRvb2xDYWxsSWQ6ICdzdWJhZ2VudC0xMjMnIH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHRjb25zdCBtYXJrZG93bkNvbnRlbnQ6IElDaGF0TWFya2Rvd25Db250ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdFx0Y29udGVudDogeyB2YWx1ZTogJzx2c2NvZGVfY29kZWJsb2NrX3VyaSBzdWJBZ2VudEludm9jYXRpb25JZD1cInN1YmFnZW50LTEyM1wiPmZpbGU6Ly8vdGVzdC50eHQ8L3ZzY29kZV9jb2RlYmxvY2tfdXJpPicgfVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFydC5oYXNTYW1lQ29udGVudChtYXJrZG93bkNvbnRlbnQsIFtdLCBjb250ZXh0LmVsZW1lbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnU3RyZWFtaW5nIGJlaGF2aW9yJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBzaG93IGxvYWRpbmcgc3Bpbm5lciB3aGlsZSBzdHJlYW1pbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgbG9hZGluZyBzcGlubmVyIGljb24gd2hpbGUgc3RyZWFtaW5nXG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdTaG91bGQgaGF2ZSBjb2xsYXBzZSBidXR0b24nKTtcblx0XHRcdGNvbnN0IGxvYWRpbmdJY29uID0gZ2V0Q29sbGFwc2VCdXR0b25JY29uKGJ1dHRvbik7XG5cdFx0XHRhc3NlcnQub2sobG9hZGluZ0ljb24/LmNsYXNzTGlzdC5jb250YWlucygnY29kaWNvbi1jaXJjbGUtZmlsbGVkJyksICdTaG91bGQgaGF2ZSBjaXJjbGUtZmlsbGVkIGljb24gd2hpbGUgc3RyZWFtaW5nJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdFeHBhbmQvY29sbGFwc2UnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHRvZ2dsZSBleHBhbnNpb24gd2hlbiBidXR0b24gaXMgY2xpY2tlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKCk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIEluaXRpYWxseSBjb2xsYXBzZWRcblx0XHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSk7XG5cblx0XHRcdC8vIENsaWNrIHRvIGV4cGFuZFxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uLCAnU2hvdWxkIGhhdmUgZXhwYW5kIGJ1dHRvbicpO1xuXHRcdFx0YnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdC8vIFNob3VsZCBiZSBleHBhbmRlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCBmYWxzZSxcblx0XHRcdFx0J1Nob3VsZCBiZSBleHBhbmRlZCBhZnRlciBjbGlja2luZyBidXR0b24nKTtcblxuXHRcdFx0Ly8gQ2xpY2sgYWdhaW4gdG8gY29sbGFwc2Vcblx0XHRcdGJ1dHRvbi5jbGljaygpO1xuXG5cdFx0XHQvLyBTaG91bGQgYmUgY29sbGFwc2VkIGFnYWluXG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksXG5cdFx0XHRcdCdTaG91bGQgYmUgY29sbGFwc2VkIGFmdGVyIGNsaWNraW5nIGJ1dHRvbiBhZ2FpbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhdmUgcHJvcGVyIGFyaWEtZXhwYW5kZWQgYXR0cmlidXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uLCAnQnV0dG9uIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSwgJ2ZhbHNlJywgJ1Nob3VsZCBoYXZlIGFyaWEtZXhwYW5kZWQ9XCJmYWxzZVwiIHdoZW4gY29sbGFwc2VkJyk7XG5cblx0XHRcdC8vIEV4cGFuZFxuXHRcdFx0YnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChidXR0b24uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJyksICd0cnVlJywgJ1Nob3VsZCBoYXZlIGFyaWEtZXhwYW5kZWQ9XCJ0cnVlXCIgd2hlbiBleHBhbmRlZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTGF6eSByZW5kZXJpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGRlZmVyIHByb21wdC9yZXN1bHQgcmVuZGVyaW5nIHVudGlsIGV4cGFuZGVkIHdoZW4gaW5pdGlhbGx5IGNvbXBsZXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZEludm9jYXRpb24gPSBjcmVhdGVNb2NrU2VyaWFsaXplZFRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdDb21wbGV0ZWQgdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnRmluaXNoZWRBZ2VudCcsXG5cdFx0XHRcdFx0cHJvbXB0OiAnT3JpZ2luYWwgcHJvbXB0IGZvciB0aGUgdGFzaycsXG5cdFx0XHRcdFx0cmVzdWx0OiAnVGFzayBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5J1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dCh0cnVlKTsgLy8gaXNDb21wbGV0ZSA9IHRydWVcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoc2VyaWFsaXplZEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBDb250ZW50IHNob3VsZCBiZSBjb2xsYXBzZWQgLSBubyB3cmFwcGVyIGNvbnRlbnQgaW5pdGlhbGx5IHZpc2libGVcblx0XHRcdC8vIEp1c3QgdmVyaWZ5IHRoYXQgdGhlIGRvbU5vZGUgaGFzIHRoZSBjb2xsYXBzZWQgY2xhc3Ncblx0XHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgJ1Nob3VsZCBiZSBjb2xsYXBzZWQgaW5pdGlhbGx5Jyk7XG5cblx0XHRcdC8vIEV4cGFuZCB0byB0cmlnZ2VyIGxhenkgcmVuZGVyaW5nXG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdFeHBhbmQgYnV0dG9uIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdC8vIEFmdGVyIGV4cGFuZGluZywgdGhlIGNvbnRlbnQgY29udGFpbmVycyBzaG91bGQgYmUgcmVuZGVyZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgZmFsc2UsICdTaG91bGQgYmUgZXhwYW5kZWQnKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHByb21wdCBhbmQgcmVzdWx0IHNlY3Rpb25zIGV4aXN0IGluIHRoZSBleHBhbmRlZCBjb250ZW50XG5cdFx0XHRjb25zdCB3cmFwcGVyQ29udGVudCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC11c2VkLWNvbnRleHQtbGlzdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdyYXBwZXJDb250ZW50LCAnV3JhcHBlciBjb250ZW50IHNob3VsZCBleGlzdCBhZnRlciBleHBhbmQnKTtcblxuXHRcdFx0Ly8gQ2hlY2sgdGhhdCBzZWN0aW9ucyB3ZXJlIGluc2VydGVkXG5cdFx0XHRjb25zdCBzZWN0aW9ucyA9IHdyYXBwZXJDb250ZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXN1YmFnZW50LXNlY3Rpb24nKTtcblx0XHRcdGFzc2VydC5vayhzZWN0aW9ucy5sZW5ndGggPj0gMiwgJ1Nob3VsZCBoYXZlIHByb21wdCBhbmQgcmVzdWx0IHNlY3Rpb25zIGFmdGVyIGV4cGFuZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCByZW5kZXIgd3JhcHBlciBjb250ZW50IHdoaWxlIHN1YmFnZW50IGlzIHJ1bm5pbmcgKHRydWx5IGNvbGxhcHNlZCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUnVubmluZyB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdSdW5uaW5nQWdlbnQnLFxuXHRcdFx0XHRcdHByb21wdDogJ1Byb21wdCB0ZXh0J1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzdGF0ZVR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZ1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpOyAvLyBOb3QgY29tcGxldGVcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBTaG91bGQgYmUgY29sbGFwc2VkIHdpdGgganVzdCB0aGUgdGl0bGUgdmlzaWJsZVxuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCAnU2hvdWxkIGJlIGNvbGxhcHNlZCB3aGlsZSBydW5uaW5nJyk7XG5cblx0XHRcdC8vIFdyYXBwZXIgY29udGVudCBzaG91bGQgbm90IGJlIGluaXRpYWxpemVkIHlldCAobGF6eSlcblx0XHRcdGNvbnN0IHdyYXBwZXJDb250ZW50ID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXVzZWQtY29udGV4dC1saXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3JhcHBlckNvbnRlbnQsIG51bGwsICdXcmFwcGVyIGNvbnRlbnQgc2hvdWxkIG5vdCBiZSByZW5kZXJlZCB3aGlsZSBydW5uaW5nIGFuZCBjb2xsYXBzZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzaG93IHByb21wdCBvbiBleHBhbmQgd2hlbiBubyB0b29sIGl0ZW1zIHlldCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTdGFydGluZyB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdSdW5uaW5nQWdlbnQnLFxuXHRcdFx0XHRcdHByb21wdDogJ1RoaXMgaXMgdGhlIHByb21wdCB0byBleGVjdXRlJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzdGF0ZVR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZ1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpOyAvLyBOb3QgY29tcGxldGVcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBJbml0aWFsbHkgY29sbGFwc2VkIHdpdGggbm8gY29udGVudFxuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCAnU2hvdWxkIGJlIGNvbGxhcHNlZCBpbml0aWFsbHknKTtcblx0XHRcdGxldCB3cmFwcGVyQ29udGVudCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC11c2VkLWNvbnRleHQtbGlzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdyYXBwZXJDb250ZW50LCBudWxsLCAnV3JhcHBlciBzaG91bGQgbm90IGV4aXN0IGluaXRpYWxseScpO1xuXG5cdFx0XHQvLyBFeHBhbmRcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbiwgJ0V4cGFuZCBidXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRidXR0b24uY2xpY2soKTtcblxuXHRcdFx0Ly8gV3JhcHBlciBzaG91bGQgbm93IGV4aXN0IGFuZCBiZSB2aXNpYmxlXG5cdFx0XHR3cmFwcGVyQ29udGVudCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC11c2VkLWNvbnRleHQtbGlzdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdyYXBwZXJDb250ZW50LCAnV3JhcHBlciBzaG91bGQgZXhpc3QgYWZ0ZXIgZXhwYW5kJyk7XG5cblx0XHRcdC8vIFByb21wdCBzZWN0aW9uIHNob3VsZCBiZSByZW5kZXJlZFxuXHRcdFx0Y29uc3QgcHJvbXB0U2VjdGlvbiA9IHdyYXBwZXJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXN1YmFnZW50LXNlY3Rpb24nKTtcblx0XHRcdGFzc2VydC5vayhwcm9tcHRTZWN0aW9uLCAnUHJvbXB0IHNlY3Rpb24gc2hvdWxkIGJlIHZpc2libGUgYWZ0ZXIgZXhwYW5kJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdDdXJyZW50IHJ1bm5pbmcgdG9vbCBpbiB0aXRsZScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgdXBkYXRlIHRpdGxlIHdpdGggY3VycmVudCBydW5uaW5nIHRvb2wgaW52b2NhdGlvbiBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50J1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gQWRkIGEgY2hpbGQgdG9vbCBpbnZvY2F0aW9uXG5cdFx0XHRjb25zdCBjaGlsZFRvb2wgPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sSWQ6ICdyZWFkRmlsZScsXG5cdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZCxcblx0XHRcdFx0c3RhdGVUeXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZGluZyBjb25maWcudHMnXG5cdFx0XHR9KTtcblxuXHRcdFx0cGFydC5hcHBlbmRUb29sSW52b2NhdGlvbihjaGlsZFRvb2wsIDApO1xuXG5cdFx0XHQvLyBUaGUgdGl0bGUgc2hvdWxkIGluY2x1ZGUgdGhlIGN1cnJlbnQgcnVubmluZyB0b29sIG1lc3NhZ2Vcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbiwgJ1Nob3VsZCBoYXZlIGNvbGxhcHNlIGJ1dHRvbicpO1xuXHRcdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gZ2V0Q29sbGFwc2VCdXR0b25MYWJlbChidXR0b24pO1xuXHRcdFx0Y29uc3QgYnV0dG9uVGV4dCA9IGxhYmVsRWxlbWVudD8udGV4dENvbnRlbnQgPz8gYnV0dG9uLnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvblRleHQuaW5jbHVkZXMoJ1JlYWRpbmcgY29uZmlnLnRzJyksICdUaXRsZSBzaG91bGQgaW5jbHVkZSBjdXJyZW50IHJ1bm5pbmcgdG9vbCBtZXNzYWdlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc2hvdyBsYXRlc3QgdG9vbCB3aGVuIG11bHRpcGxlIHRvb2xzIGFyZSBhZGRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCdcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIEFkZCBmaXJzdCB0b29sXG5cdFx0XHRjb25zdCBmaXJzdFRvb2wgPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sSWQ6ICdyZWFkRmlsZScsXG5cdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZCxcblx0XHRcdFx0c3RhdGVUeXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZGluZyBmaWxlMS50cydcblx0XHRcdH0pO1xuXHRcdFx0cGFydC5hcHBlbmRUb29sSW52b2NhdGlvbihmaXJzdFRvb2wsIDApO1xuXG5cdFx0XHQvLyBBZGQgc2Vjb25kIHRvb2xcblx0XHRcdGNvbnN0IHNlY29uZFRvb2wgPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sSWQ6ICdzZWFyY2hGaWxlcycsXG5cdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZCxcblx0XHRcdFx0c3RhdGVUeXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnU2VhcmNoaW5nIGZvciBwYXR0ZXJucydcblx0XHRcdH0pO1xuXHRcdFx0cGFydC5hcHBlbmRUb29sSW52b2NhdGlvbihzZWNvbmRUb29sLCAxKTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uLCAnU2hvdWxkIGhhdmUgY29sbGFwc2UgYnV0dG9uJyk7XG5cdFx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSBnZXRDb2xsYXBzZUJ1dHRvbkxhYmVsKGJ1dHRvbik7XG5cdFx0XHRjb25zdCBidXR0b25UZXh0ID0gbGFiZWxFbGVtZW50Py50ZXh0Q29udGVudCA/PyBidXR0b24udGV4dENvbnRlbnQgPz8gJyc7XG5cdFx0XHQvLyBTaG91bGQgc2hvdyB0aGUgbGF0ZXN0IHRvb2wgbWVzc2FnZVxuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvblRleHQuaW5jbHVkZXMoJ1NlYXJjaGluZyBmb3IgcGF0dGVybnMnKSwgJ1RpdGxlIHNob3VsZCBpbmNsdWRlIGxhdGVzdCB0b29sIG1lc3NhZ2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBrZWVwIHNob3dpbmcgcnVubmluZyB0b29sIHdoZW4gYW5vdGhlciB0b29sIGNvbXBsZXRlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCdcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIEFkZCBmaXJzdCB0b29sICh3aWxsIGNvbXBsZXRlKVxuXHRcdFx0Y29uc3QgZmlyc3RUb29sU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSk7XG5cdFx0XHRjb25zdCBmaXJzdFRvb2w6IElDaGF0VG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRcdC4uLmNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0dG9vbElkOiAncmVhZEZpbGUnLFxuXHRcdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0c3RhdGU6IGZpcnN0VG9vbFN0YXRlLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWRpbmcgZmlsZTEudHMnXG5cdFx0XHR9O1xuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZShmaXJzdFRvb2wpO1xuXG5cdFx0XHQvLyBBZGQgc2Vjb25kIHRvb2wgKHdpbGwga2VlcCBydW5uaW5nKVxuXHRcdFx0Y29uc3Qgc2Vjb25kVG9vbFN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZScsIGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZykpO1xuXHRcdFx0Y29uc3Qgc2Vjb25kVG9vbDogSUNoYXRUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdFx0Li4uY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0XHR0b29sSWQ6ICdzZWFyY2hGaWxlcycsXG5cdFx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHRvb2xJbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzdGF0ZTogc2Vjb25kVG9vbFN0YXRlLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1NlYXJjaGluZyBmb3IgcGF0dGVybnMnXG5cdFx0XHR9O1xuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZShzZWNvbmRUb29sKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRpdGxlIHNob3dzIHNlY29uZCB0b29sXG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdCdXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSBnZXRDb2xsYXBzZUJ1dHRvbkxhYmVsKGJ1dHRvbik7XG5cdFx0XHRsZXQgYnV0dG9uVGV4dCA9IGxhYmVsRWxlbWVudD8udGV4dENvbnRlbnQgPz8gYnV0dG9uPy50ZXh0Q29udGVudCA/PyAnJztcblx0XHRcdGFzc2VydC5vayhidXR0b25UZXh0LmluY2x1ZGVzKCdTZWFyY2hpbmcgZm9yIHBhdHRlcm5zJyksICdUaXRsZSBzaG91bGQgc2hvdyBzZWNvbmQgdG9vbCcpO1xuXG5cdFx0XHQvLyBDb21wbGV0ZSB0aGUgZmlyc3QgdG9vbFxuXHRcdFx0Zmlyc3RUb29sU3RhdGUuc2V0KGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCksIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIFRpdGxlIHNob3VsZCBzdGlsbCBzaG93IHRoZSBzZWNvbmQgdG9vbCAod2hpY2ggaXMgc3RpbGwgcnVubmluZyBhbmQgb3ducyB0aGUgdGl0bGUpXG5cdFx0XHRidXR0b25UZXh0ID0gbGFiZWxFbGVtZW50Py50ZXh0Q29udGVudCA/PyBidXR0b24/LnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvblRleHQuaW5jbHVkZXMoJ1NlYXJjaGluZyBmb3IgcGF0dGVybnMnKSwgJ1RpdGxlIHNob3VsZCBzdGlsbCBzaG93IHNlY29uZCB0b29sIGFmdGVyIGZpcnN0IGNvbXBsZXRlcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGtlZXAgdGl0bGUgd2hlbiB0b29sIGlzIGNhbmNlbGxlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCdcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIEFkZCBhIHRvb2wgdGhhdCB3aWxsIGJlIGNhbmNlbGxlZFxuXHRcdFx0Y29uc3QgdG9vbFN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZScsIGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZykpO1xuXHRcdFx0Y29uc3QgY2hpbGRUb29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0XHQuLi5jcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRcdHRvb2xJZDogJ3JlYWRGaWxlJyxcblx0XHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogdG9vbEludm9jYXRpb24uc3ViQWdlbnRJbnZvY2F0aW9uSWRcblx0XHRcdFx0fSksXG5cdFx0XHRcdHN0YXRlOiB0b29sU3RhdGUsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZGluZyBmaWxlLnRzJ1xuXHRcdFx0fTtcblx0XHRcdHBhcnQudHJhY2tUb29sU3RhdGUoY2hpbGRUb29sKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRpdGxlIGluY2x1ZGVzIHRvb2wgbWVzc2FnZVxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uLCAnQnV0dG9uIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gZ2V0Q29sbGFwc2VCdXR0b25MYWJlbChidXR0b24pO1xuXHRcdFx0bGV0IGJ1dHRvblRleHQgPSBsYWJlbEVsZW1lbnQ/LnRleHRDb250ZW50ID8/IGJ1dHRvbj8udGV4dENvbnRlbnQgPz8gJyc7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uVGV4dC5pbmNsdWRlcygnUmVhZGluZyBmaWxlLnRzJyksICdUaXRsZSBzaG91bGQgaW5jbHVkZSB0b29sIG1lc3NhZ2Ugd2hpbGUgcnVubmluZycpO1xuXG5cdFx0XHQvLyBDYW5jZWwgdGhlIHRvb2xcblx0XHRcdHRvb2xTdGF0ZS5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkKSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gVGl0bGUgc2hvdWxkIHN0aWxsIGluY2x1ZGUgdGhlIHRvb2wgbWVzc2FnZSAocGVyc2lzdHMgbGlrZSB0aGlua2luZyBwYXJ0KVxuXHRcdFx0YnV0dG9uVGV4dCA9IGxhYmVsRWxlbWVudD8udGV4dENvbnRlbnQgPz8gYnV0dG9uPy50ZXh0Q29udGVudCA/PyAnJztcblx0XHRcdGFzc2VydC5vayhidXR0b25UZXh0LmluY2x1ZGVzKCdSZWFkaW5nIGZpbGUudHMnKSxcblx0XHRcdFx0J1RpdGxlIHNob3VsZCBzdGlsbCBpbmNsdWRlIHRvb2wgbWVzc2FnZSBhZnRlciBjYW5jZWxsYXRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBrZWVwIHNob3dpbmcgbGFzdCB0b29sIG1lc3NhZ2Ugd2hlbiB0aGF0IHRvb2wgY29tcGxldGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50J1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gRmlyc3QgdG9vbCBzdGFydHNcblx0XHRcdGNvbnN0IGZpcnN0VG9vbFN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZScsIGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZykpO1xuXHRcdFx0Y29uc3QgZmlyc3RUb29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0XHQuLi5jcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRcdHRvb2xJZDogJ3JlYWRGaWxlJyxcblx0XHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogdG9vbEludm9jYXRpb24uc3ViQWdlbnRJbnZvY2F0aW9uSWRcblx0XHRcdFx0fSksXG5cdFx0XHRcdHN0YXRlOiBmaXJzdFRvb2xTdGF0ZSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkaW5nIGZpbGUxLnRzJ1xuXHRcdFx0fTtcblx0XHRcdHBhcnQudHJhY2tUb29sU3RhdGUoZmlyc3RUb29sKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRpdGxlIHNob3dzIGZpcnN0IHRvb2xcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbiwgJ0J1dHRvbiBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IGdldENvbGxhcHNlQnV0dG9uTGFiZWwoYnV0dG9uKTtcblx0XHRcdGxldCBidXR0b25UZXh0ID0gbGFiZWxFbGVtZW50Py50ZXh0Q29udGVudCA/PyBidXR0b24/LnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvblRleHQuaW5jbHVkZXMoJ1JlYWRpbmcgZmlsZTEudHMnKSwgJ1RpdGxlIHNob3VsZCBzaG93IGZpcnN0IHRvb2wnKTtcblxuXHRcdFx0Ly8gU2Vjb25kIHRvb2wgc3RhcnRzIGFuZCBiZWNvbWVzIHRoZSBjdXJyZW50IHRpdGxlXG5cdFx0XHRjb25zdCBzZWNvbmRUb29sU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSk7XG5cdFx0XHRjb25zdCBzZWNvbmRUb29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0XHQuLi5jcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRcdHRvb2xJZDogJ3NlYXJjaEZpbGVzJyxcblx0XHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogdG9vbEludm9jYXRpb24uc3ViQWdlbnRJbnZvY2F0aW9uSWRcblx0XHRcdFx0fSksXG5cdFx0XHRcdHN0YXRlOiBzZWNvbmRUb29sU3RhdGUsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnU2VhcmNoaW5nIGZvciBwYXR0ZXJucydcblx0XHRcdH07XG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKHNlY29uZFRvb2wpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGl0bGUgc2hvd3Mgc2Vjb25kIHRvb2xcblx0XHRcdGJ1dHRvblRleHQgPSBsYWJlbEVsZW1lbnQ/LnRleHRDb250ZW50ID8/IGJ1dHRvbj8udGV4dENvbnRlbnQgPz8gJyc7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uVGV4dC5pbmNsdWRlcygnU2VhcmNoaW5nIGZvciBwYXR0ZXJucycpLCAnVGl0bGUgc2hvdWxkIHNob3cgc2Vjb25kIHRvb2wnKTtcblxuXHRcdFx0Ly8gU2Vjb25kIHRvb2wgY29tcGxldGVzXG5cdFx0XHRzZWNvbmRUb29sU3RhdGUuc2V0KGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCksIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIFRpdGxlIHNob3VsZCBzdGlsbCBzaG93IHNlY29uZCB0b29sIChwZXJzaXN0cyBsaWtlIHRoaW5raW5nIHBhcnQpXG5cdFx0XHRidXR0b25UZXh0ID0gbGFiZWxFbGVtZW50Py50ZXh0Q29udGVudCA/PyBidXR0b24/LnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvblRleHQuaW5jbHVkZXMoJ1NlYXJjaGluZyBmb3IgcGF0dGVybnMnKSxcblx0XHRcdFx0J1RpdGxlIHNob3VsZCBzdGlsbCBzaG93IGxhc3QgdG9vbCBtZXNzYWdlIGFmdGVyIGNvbXBsZXRpb24nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2FwcGVuZE1hcmtkb3duSXRlbScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgYXBwZW5kIG1hcmtkb3duIGl0ZW0gdG8gZXhwYW5kZWQgc3ViYWdlbnQgcGFydCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6ICd0ZXN0LXN1YmFnZW50LWlkJyxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCdcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIEV4cGFuZCB0aGUgcGFydCBmaXJzdFxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksIGZhbHNlLCAnU2hvdWxkIGJlIGV4cGFuZGVkJyk7XG5cblx0XHRcdC8vIENyZWF0ZSBhIG1vY2sgbWFya2Rvd24gY29udGVudCB3aXRoIGVkaXQgcGlsbFxuXHRcdFx0Y29uc3QgbWFya2Rvd25Db250ZW50OiBJQ2hhdE1hcmtkb3duQ29udGVudCA9IHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IHsgdmFsdWU6ICdFZGl0ZWQgZmlsZS50cycgfVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgbW9jayBET00gbm9kZSBmb3IgdGhlIG1hcmtkb3duXG5cdFx0XHRjb25zdCBtYXJrZG93bkRvbU5vZGUgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0bWFya2Rvd25Eb21Ob2RlLmNsYXNzTmFtZSA9ICdjaGF0LWNvZGVibG9jay1idXR0b24nO1xuXHRcdFx0bWFya2Rvd25Eb21Ob2RlLnRleHRDb250ZW50ID0gJ2ZpbGUudHMnO1xuXG5cdFx0XHRsZXQgZGlzcG9zZUNhbGxDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBtb2NrRGlzcG9zYWJsZSA9IHsgZGlzcG9zZTogKCkgPT4geyBkaXNwb3NlQ2FsbENvdW50Kys7IH0gfTtcblxuXHRcdFx0Ly8gQXBwZW5kIG1hcmtkb3duIGl0ZW1cblx0XHRcdHBhcnQuYXBwZW5kTWFya2Rvd25JdGVtKFxuXHRcdFx0XHQoKSA9PiAoeyBkb21Ob2RlOiBtYXJrZG93bkRvbU5vZGUsIGRpc3Bvc2FibGU6IG1vY2tEaXNwb3NhYmxlIH0pLFxuXHRcdFx0XHQnY29kZWJsb2NrLTEyMycsXG5cdFx0XHRcdG1hcmtkb3duQ29udGVudCxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIG1hcmtkb3duIHdhcyBhcHBlbmRlZFxuXHRcdFx0Y29uc3Qgd3JhcHBlciA9IGdldFdyYXBwZXJFbGVtZW50KHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdyYXBwZXIsICdXcmFwcGVyIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0Y29uc3QgYXBwZW5kZWRFbGVtZW50ID0gd3JhcHBlci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1jb2RlYmxvY2stYnV0dG9uJyk7XG5cdFx0XHRhc3NlcnQub2soYXBwZW5kZWRFbGVtZW50LCAnQXBwZW5kZWQgbWFya2Rvd24gZWxlbWVudCBzaG91bGQgZXhpc3QgaW4gd3JhcHBlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZGVkRWxlbWVudC50ZXh0Q29udGVudCwgJ2ZpbGUudHMnLCAnU2hvdWxkIGhhdmUgY29ycmVjdCBjb250ZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHJlbmRlciBtYXJrZG93biBpdGVtIHdoZW4gcGFydCBpcyBjb2xsYXBzZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiAndGVzdC1zdWJhZ2VudC1kZWZlcicsXG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBQYXJ0IGlzIGNvbGxhcHNlZCBieSBkZWZhdWx0XG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksICdTaG91bGQgc3RhcnQgY29sbGFwc2VkJyk7XG5cblx0XHRcdGNvbnN0IG1hcmtkb3duQ29udGVudDogSUNoYXRNYXJrZG93bkNvbnRlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0XHRjb250ZW50OiB7IHZhbHVlOiAnRGVmZXJyZWQgZWRpdCcgfVxuXHRcdFx0fTtcblxuXHRcdFx0bGV0IGZhY3RvcnlDYWxsZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IG1hcmtkb3duRG9tTm9kZSA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRtYXJrZG93bkRvbU5vZGUuY2xhc3NOYW1lID0gJ2RlZmVycmVkLWVkaXQnO1xuXHRcdFx0bWFya2Rvd25Eb21Ob2RlLnRleHRDb250ZW50ID0gJ2RlZmVycmVkLnRzJztcblxuXHRcdFx0Y29uc3QgbW9ja0Rpc3Bvc2FibGUgPSB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXG5cdFx0XHQvLyBBcHBlbmQgbWFya2Rvd24gaXRlbSB3aGlsZSBjb2xsYXBzZWQgLSBmYWN0b3J5IHNob3VsZCBub3QgYmUgY2FsbGVkXG5cdFx0XHRwYXJ0LmFwcGVuZE1hcmtkb3duSXRlbShcblx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdGZhY3RvcnlDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiB7IGRvbU5vZGU6IG1hcmtkb3duRG9tTm9kZSwgZGlzcG9zYWJsZTogbW9ja0Rpc3Bvc2FibGUgfTtcblx0XHRcdFx0fSxcblx0XHRcdFx0J2NvZGVibG9jay1kZWZlcnJlZCcsXG5cdFx0XHRcdG1hcmtkb3duQ29udGVudCxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBGYWN0b3J5IHNob3VsZCBub3QgYmUgY2FsbGVkIHdoZW4gY29sbGFwc2VkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFjdG9yeUNhbGxlZCwgZmFsc2UsICdGYWN0b3J5IHNob3VsZCBub3QgYmUgY2FsbGVkIHdoZW4gY29sbGFwc2VkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYXBwZW5kIG11bHRpcGxlIG1hcmtkb3duIGl0ZW1zIHdpdGggc2FtZSBjb2RlYmxvY2sgSUQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiAndGVzdC1zdWJhZ2VudC1kZWR1cCcsXG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBFeHBhbmQgdGhlIHBhcnRcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YnV0dG9uPy5jbGljaygpO1xuXG5cdFx0XHRjb25zdCBtYXJrZG93bkNvbnRlbnQ6IElDaGF0TWFya2Rvd25Db250ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdFx0Y29udGVudDogeyB2YWx1ZTogJ1NhbWUgY29kZWJsb2NrJyB9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBzaGFyZWRDb2RlYmxvY2tJZCA9ICdjb2RlYmxvY2stc2FtZS1pZCc7XG5cblx0XHRcdC8vIEFwcGVuZCBmaXJzdCBpdGVtXG5cdFx0XHRjb25zdCBmaXJzdE5vZGUgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0Zmlyc3ROb2RlLmNsYXNzTmFtZSA9ICdmaXJzdC1pdGVtJztcblx0XHRcdGZpcnN0Tm9kZS50ZXh0Q29udGVudCA9ICdmaXJzdCBpdGVtIGNvbnRlbnQnO1xuXHRcdFx0cGFydC5hcHBlbmRNYXJrZG93bkl0ZW0oXG5cdFx0XHRcdCgpID0+ICh7IGRvbU5vZGU6IGZpcnN0Tm9kZSwgZGlzcG9zYWJsZTogeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSB9KSxcblx0XHRcdFx0c2hhcmVkQ29kZWJsb2NrSWQsXG5cdFx0XHRcdG1hcmtkb3duQ29udGVudCxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBBcHBlbmQgc2Vjb25kIGl0ZW0gd2l0aCBzYW1lIGNvZGVibG9jayBJRFxuXHRcdFx0Y29uc3Qgc2Vjb25kTm9kZSA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRzZWNvbmROb2RlLmNsYXNzTmFtZSA9ICdzZWNvbmQtaXRlbSc7XG5cdFx0XHRzZWNvbmROb2RlLnRleHRDb250ZW50ID0gJ3NlY29uZCBpdGVtIGNvbnRlbnQnO1xuXHRcdFx0cGFydC5hcHBlbmRNYXJrZG93bkl0ZW0oXG5cdFx0XHRcdCgpID0+ICh7IGRvbU5vZGU6IHNlY29uZE5vZGUsIGRpc3Bvc2FibGU6IHsgZGlzcG9zZTogKCkgPT4geyB9IH0gfSksXG5cdFx0XHRcdHNoYXJlZENvZGVibG9ja0lkLFxuXHRcdFx0XHRtYXJrZG93bkNvbnRlbnQsXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gQm90aCBpdGVtcyBhcmUgYWRkZWQgKG5vIGJ1aWx0LWluIGRlZHVwbGljYXRpb24gYnkgY29kZWJsb2NrIElEKVxuXHRcdFx0Y29uc3Qgd3JhcHBlciA9IGdldFdyYXBwZXJFbGVtZW50KHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdyYXBwZXIsICdXcmFwcGVyIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0Y29uc3QgZmlyc3RJdGVtcyA9IHdyYXBwZXIucXVlcnlTZWxlY3RvckFsbCgnLmZpcnN0LWl0ZW0nKTtcblx0XHRcdGNvbnN0IHNlY29uZEl0ZW1zID0gd3JhcHBlci5xdWVyeVNlbGVjdG9yQWxsKCcuc2Vjb25kLWl0ZW0nKTtcblx0XHRcdC8vIEltcGxlbWVudGF0aW9uIGRvZXMgbm90IGRlZHVwbGljYXRlIC0gYm90aCBpdGVtcyBleGlzdFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0SXRlbXMubGVuZ3RoLCAxLCAnRmlyc3QgaXRlbSBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmRJdGVtcy5sZW5ndGgsIDEsICdTZWNvbmQgaXRlbSBzaG91bGQgZXhpc3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbXVsdGlwbGUgZGlmZmVyZW50IGNvZGVibG9jayBJRHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiAndGVzdC1zdWJhZ2VudC1tdWx0aScsXG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBFeHBhbmQgdGhlIHBhcnRcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YnV0dG9uPy5jbGljaygpO1xuXG5cdFx0XHQvLyBBcHBlbmQgZmlyc3QgaXRlbVxuXHRcdFx0Y29uc3QgZmlyc3ROb2RlID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGZpcnN0Tm9kZS5jbGFzc05hbWUgPSAnaXRlbS1vbmUnO1xuXHRcdFx0Zmlyc3ROb2RlLnRleHRDb250ZW50ID0gJ2ZpcnN0IGl0ZW0gY29udGVudCc7XG5cdFx0XHRwYXJ0LmFwcGVuZE1hcmtkb3duSXRlbShcblx0XHRcdFx0KCkgPT4gKHsgZG9tTm9kZTogZmlyc3ROb2RlLCBkaXNwb3NhYmxlOiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9IH0pLFxuXHRcdFx0XHQnY29kZWJsb2NrLTEnLFxuXHRcdFx0XHR7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiB7IHZhbHVlOiAnRmlyc3QnIH0gfSxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBBcHBlbmQgc2Vjb25kIGl0ZW0gd2l0aCBkaWZmZXJlbnQgSURcblx0XHRcdGNvbnN0IHNlY29uZE5vZGUgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0c2Vjb25kTm9kZS5jbGFzc05hbWUgPSAnaXRlbS10d28nO1xuXHRcdFx0c2Vjb25kTm9kZS50ZXh0Q29udGVudCA9ICdzZWNvbmQgaXRlbSBjb250ZW50Jztcblx0XHRcdHBhcnQuYXBwZW5kTWFya2Rvd25JdGVtKFxuXHRcdFx0XHQoKSA9PiAoeyBkb21Ob2RlOiBzZWNvbmROb2RlLCBkaXNwb3NhYmxlOiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9IH0pLFxuXHRcdFx0XHQnY29kZWJsb2NrLTInLFxuXHRcdFx0XHR7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiB7IHZhbHVlOiAnU2Vjb25kJyB9IH0sXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gQm90aCBzaG91bGQgZXhpc3Rcblx0XHRcdGNvbnN0IHdyYXBwZXIgPSBnZXRXcmFwcGVyRWxlbWVudChwYXJ0KTtcblx0XHRcdGFzc2VydC5vayh3cmFwcGVyLCAnV3JhcHBlciBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGFzc2VydC5vayh3cmFwcGVyLnF1ZXJ5U2VsZWN0b3IoJy5pdGVtLW9uZScpLCAnRmlyc3QgaXRlbSBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGFzc2VydC5vayh3cmFwcGVyLnF1ZXJ5U2VsZWN0b3IoJy5pdGVtLXR3bycpLCAnU2Vjb25kIGl0ZW0gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBdXRvLWV4cGFuZCBvbiBjb25maXJtYXRpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGF1dG8tZXhwYW5kIHdoZW4gdG9vbCBzdGF0ZSBiZWNvbWVzIFdhaXRpbmdGb3JDb25maXJtYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIFZlcmlmeSBpbml0aWFsbHkgY29sbGFwc2VkXG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksICdTaG91bGQgc3RhcnQgY29sbGFwc2VkJyk7XG5cblx0XHRcdC8vIENyZWF0ZSBhIHRvb2wgaW52b2NhdGlvbiB0aGF0IHN0YXJ0cyBpbiBleGVjdXRpbmcgc3RhdGUsIHRoZW4gY2hhbmdlcyB0byBXYWl0aW5nRm9yQ29uZmlybWF0aW9uXG5cdFx0XHRjb25zdCBzdGF0ZU9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSk7XG5cdFx0XHRjb25zdCBjaGlsZFRvb2w6IElDaGF0VG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRcdC4uLmNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0dG9vbElkOiAncmVhZEZpbGUnLFxuXHRcdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0c3RhdGU6IHN0YXRlT2JzZXJ2YWJsZSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkaW5nIGZpbGUnXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBUcmFjayB0aGlzIHRvb2wncyBzdGF0ZSAodGhpcyByZWdpc3RlcnMgb2JzZXJ2ZXJzKVxuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZShjaGlsZFRvb2wpO1xuXG5cdFx0XHQvLyBTaG91bGQgc3RpbGwgYmUgY29sbGFwc2VkIHNpbmNlIHRvb2wgaXMgZXhlY3V0aW5nLCBub3Qgd2FpdGluZyBmb3IgY29uZmlybWF0aW9uXG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksICdTaG91bGQgc3RpbGwgYmUgY29sbGFwc2VkIHdoZW4gdG9vbCBpcyBleGVjdXRpbmcnKTtcblxuXHRcdFx0Ly8gTm93IGNoYW5nZSBzdGF0ZSB0byBXYWl0aW5nRm9yQ29uZmlybWF0aW9uXG5cdFx0XHRzdGF0ZU9ic2VydmFibGUuc2V0KGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pLCB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBTaG91bGQgYXV0by1leHBhbmQgd2hlbiB0b29sIG5lZWRzIGNvbmZpcm1hdGlvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCBmYWxzZSxcblx0XHRcdFx0J1Nob3VsZCBhdXRvLWV4cGFuZCB3aGVuIHRvb2wgbmVlZHMgY29uZmlybWF0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHVibGlzaCB0aGUgcGVuZGluZyBjb25maXJtYXRpb24gY291bnQgdG8gdGhlIG9wZW4tY2hhdCBwaWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZTogJ2FocC1jaGF0Oi8vc3ViYWdlbnQvdGVzdC90b29sLWNhbGwnLFxuXHRcdFx0XHR9XG5cdFx0XHR9KSwgY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZScsIGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZykpO1xuXHRcdFx0Y29uc3QgY2hpbGRUb29sID0geyAuLi5jcmVhdGVNb2NrVG9vbEludm9jYXRpb24oeyB0b29sSWQ6ICdmaXJzdCcgfSksIHN0YXRlIH07XG5cdFx0XHRwYXJ0LmVuYWJsZUNhcm91c2VsTW9kZSgoKSA9PiB7IH0sICgpID0+IHsgfSwgKF90b29sLCBjdXJyZW50U3RhdGUpID0+IGN1cnJlbnRTdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKTtcblx0XHRcdHBhcnQudHJhY2tUb29sU3RhdGUoY2hpbGRUb29sKTtcblxuXHRcdFx0c3RhdGUuc2V0KGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgcGVuZGluZyA9IGdldE9wZW5DaGF0Q29udGV4dChwYXJ0KT8uY29uZmlybWF0aW9uQ291bnQ7XG5cdFx0XHRzdGF0ZS5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHBlbmRpbmcsXG5cdFx0XHRcdGFmdGVyQ29uZmlybWF0aW9uOiBnZXRPcGVuQ2hhdENvbnRleHQocGFydCk/LmNvbmZpcm1hdGlvbkNvdW50LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwZW5kaW5nOiAxLFxuXHRcdFx0XHRhZnRlckNvbmZpcm1hdGlvbjogMCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRpc3Rpbmd1aXNoIHRoZSBhY3RpdmUgY29uZmlybWF0aW9uIGZyb20gcGVuZGluZyBjb25maXJtYXRpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZTogJ2FocC1jaGF0Oi8vc3ViYWdlbnQvdGVzdC90b29sLWNhbGwnLFxuXHRcdFx0XHR9XG5cdFx0XHR9KSwgY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpKTtcblxuXHRcdFx0cGFydC5zZXRDb25maXJtYXRpb25BY3RpdmUodHJ1ZSk7XG5cdFx0XHRjb25zdCBhY3RpdmUgPSBnZXRPcGVuQ2hhdENvbnRleHQocGFydCk/LmNvbmZpcm1hdGlvbkFjdGl2ZTtcblx0XHRcdHBhcnQuc2V0Q29uZmlybWF0aW9uQWN0aXZlKGZhbHNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGFjdGl2ZSxcblx0XHRcdFx0aW5hY3RpdmU6IGdldE9wZW5DaGF0Q29udGV4dChwYXJ0KT8uY29uZmlybWF0aW9uQWN0aXZlLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhY3RpdmU6IHRydWUsXG5cdFx0XHRcdGluYWN0aXZlOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlZnJlc2ggdGhlIG9wZW4tY2hhdCB0aW1pbmcgd2hlbiB0aGUgc3ViYWdlbnQgc3RvcHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdGNoYXRSZXNvdXJjZTogJ2FocC1jaGF0Oi8vc3ViYWdlbnQvdGVzdC90b29sLWNhbGwnLFxuXHRcdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0c3RhcnRlZEF0OiAxMDAwLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdFx0c3RhdGVUeXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZScsIHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpKTtcblx0XHRcdCh0b29sSW52b2NhdGlvbiBhcyB1bmtub3duIGFzIHsgc3RhdGU6IHR5cGVvZiBzdGF0ZSB9KS5zdGF0ZSA9IHN0YXRlO1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKSk7XG5cblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEuaXNBY3RpdmUgPSBmYWxzZTtcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEuZHVyYXRpb24gPSA1MDAwO1xuXHRcdFx0c3RhdGUuc2V0KHsgLi4uc3RhdGUuZ2V0KCkgfSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRPcGVuQ2hhdENvbnRleHQocGFydCksIHtcblx0XHRcdFx0Y2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC90ZXN0L3Rvb2wtY2FsbCcsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbkNvdW50OiAwLFxuXHRcdFx0XHRjb25maXJtYXRpb25BY3RpdmU6IGZhbHNlLFxuXHRcdFx0XHRzdGFydGVkQXQ6IDEwMDAsXG5cdFx0XHRcdGR1cmF0aW9uOiA1MDAwLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3RvcCB0cmFja2luZyBhIHRvb2wgaW52b2NhdGlvbiBvbmNlIGl0IHJlYWNoZXMgYSB0ZXJtaW5hbCBzdGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCdcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdGNvbnN0IHN0YXRlT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnc3RhdGUnLCBjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpKTtcblx0XHRcdGNvbnN0IGNoaWxkVG9vbDogSUNoYXRUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdFx0Li4uY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0XHR0b29sSWQ6ICdyZWFkRmlsZScsXG5cdFx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHRvb2xJbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzdGF0ZTogc3RhdGVPYnNlcnZhYmxlLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWRpbmcgZmlsZSdcblx0XHRcdH07XG5cblx0XHRcdHBhcnQudHJhY2tUb29sU3RhdGUoY2hpbGRUb29sKTtcblx0XHRcdGNvbnN0IG9ic2VydmVyQ291bnQgPSAoKSA9PiAoc3RhdGVPYnNlcnZhYmxlIGFzIHVua25vd24gYXMgQmFzZU9ic2VydmFibGU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4pLmRlYnVnR2V0T2JzZXJ2ZXJzKCkuc2l6ZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvYnNlcnZlckNvdW50KCksIDEsICdUcmFja2luZyBhdXRvcnVuIHNob3VsZCBvYnNlcnZlIHRoZSB0b29sIHN0YXRlJyk7XG5cblx0XHRcdC8vIENvbXBsZXRlIHRoZSB0b29sOyBkaXNwb3NhbCBvZiB0aGUgdHJhY2tpbmcgYXV0b3J1biBpcyBkZWZlcnJlZCB2aWEgYSBtaWNyb3Rhc2suXG5cdFx0XHRzdGF0ZU9ic2VydmFibGUuc2V0KGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCksIHVuZGVmaW5lZCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9ic2VydmVyQ291bnQoKSwgMCwgJ1RyYWNraW5nIGF1dG9ydW4gc2hvdWxkIGJlIGRpc3Bvc2VkIG9uY2UgdGhlIHRvb2wgcmVhY2hlcyBhIHRlcm1pbmFsIHN0YXRlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYXV0by1jb2xsYXBzZSB3aGVuIGNvbmZpcm1hdGlvbiBpcyBhZGRyZXNzZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYSB0b29sIGludm9jYXRpb24gdGhhdCBpcyB3YWl0aW5nIGZvciBjb25maXJtYXRpb25cblx0XHRcdGNvbnN0IHN0YXRlT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnc3RhdGUnLCBjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSk7XG5cdFx0XHRjb25zdCBjaGlsZFRvb2w6IElDaGF0VG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRcdC4uLmNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0dG9vbElkOiAncnVuSW5UZXJtaW5hbCcsXG5cdFx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHRvb2xJbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzdGF0ZTogc3RhdGVPYnNlcnZhYmxlLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBucG0gaW5zdGFsbCdcblx0XHRcdH07XG5cblx0XHRcdC8vIFRyYWNrIHRoaXMgdG9vbCdzIHN0YXRlXG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKGNoaWxkVG9vbCk7XG5cblx0XHRcdC8vIFNob3VsZCBiZSBleHBhbmRlZCBub3dcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgZmFsc2UsXG5cdFx0XHRcdCdTaG91bGQgYmUgZXhwYW5kZWQgd2hlbiB3YWl0aW5nIGZvciBjb25maXJtYXRpb24nKTtcblxuXHRcdFx0Ly8gTm93IHNpbXVsYXRlIGNvbmZpcm1hdGlvbiBiZWluZyBhZGRyZXNzZWQgKHRvb2wgbW92ZXMgdG8gZXhlY3V0aW5nKVxuXHRcdFx0c3RhdGVPYnNlcnZhYmxlLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpLCB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBTaG91bGQgYXV0by1jb2xsYXBzZSBhZnRlciBjb25maXJtYXRpb24gaXMgYWRkcmVzc2VkXG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksXG5cdFx0XHRcdCdTaG91bGQgYXV0by1jb2xsYXBzZSBhZnRlciBjb25maXJtYXRpb24gaXMgYWRkcmVzc2VkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGF1dG8tY29sbGFwc2UgaWYgdXNlciBtYW51YWxseSBleHBhbmRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCdcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIFVzZXIgbWFudWFsbHkgZXhwYW5kc1xuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cblx0XHRcdC8vIFNob3VsZCBiZSBleHBhbmRlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCBmYWxzZSwgJ1Nob3VsZCBiZSBleHBhbmRlZCBhZnRlciB1c2VyIGNsaWNrJyk7XG5cblx0XHRcdC8vIENyZWF0ZSBhIHRvb2wgdGhhdCBnb2VzIHRocm91Z2ggY29uZmlybWF0aW9uIGN5Y2xlXG5cdFx0XHRjb25zdCBzdGF0ZU9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikpO1xuXHRcdFx0Y29uc3QgY2hpbGRUb29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0XHQuLi5jcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRcdHRvb2xJZDogJ3J1bkluVGVybWluYWwnLFxuXHRcdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0c3RhdGU6IHN0YXRlT2JzZXJ2YWJsZSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gbnBtIGluc3RhbGwnXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBUcmFjayB0aGlzIHRvb2wncyBzdGF0ZVxuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZShjaGlsZFRvb2wpO1xuXG5cdFx0XHQvLyBDb25maXJtIHRoZSB0b29sIChtb3ZlIHRvIGV4ZWN1dGluZylcblx0XHRcdHN0YXRlT2JzZXJ2YWJsZS5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gU2luY2UgdXNlciBtYW51YWxseSBleHBhbmRlZCwgaXQgc2hvdWxkIHN0YXkgZXhwYW5kZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgZmFsc2UsXG5cdFx0XHRcdCdTaG91bGQgc3RheSBleHBhbmRlZCB3aGVuIHVzZXIgbWFudWFsbHkgZXhwYW5kZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXNwZWN0IG1hbnVhbCBleHBhbnNpb24gYWZ0ZXIgYXV0by1leHBhbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBWZXJpZnkgaW5pdGlhbGx5IGNvbGxhcHNlZFxuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCAnU2hvdWxkIHN0YXJ0IGNvbGxhcHNlZCcpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYSB0b29sIHRoYXQgbmVlZHMgY29uZmlybWF0aW9uXG5cdFx0XHRjb25zdCBzdGF0ZU9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikpO1xuXHRcdFx0Y29uc3QgY2hpbGRUb29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0XHQuLi5jcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRcdHRvb2xJZDogJ3J1bkluVGVybWluYWwnLFxuXHRcdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0c3RhdGU6IHN0YXRlT2JzZXJ2YWJsZSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gbnBtIGluc3RhbGwnXG5cdFx0XHR9O1xuXG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKGNoaWxkVG9vbCk7XG5cblx0XHRcdC8vIFNob3VsZCBhdXRvLWV4cGFuZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCBmYWxzZSxcblx0XHRcdFx0J1Nob3VsZCBhdXRvLWV4cGFuZCBmb3IgY29uZmlybWF0aW9uJyk7XG5cblx0XHRcdC8vIFVzZXIgbWFudWFsbHkgY29sbGFwc2VzXG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGJ1dHRvbj8uY2xpY2soKTtcblx0XHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgJ1Nob3VsZCBjb2xsYXBzZSBhZnRlciB1c2VyIGNsaWNrJyk7XG5cblx0XHRcdC8vIFVzZXIgbWFudWFsbHkgZXhwYW5kcyBhZ2FpblxuXHRcdFx0YnV0dG9uPy5jbGljaygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCBmYWxzZSxcblx0XHRcdFx0J1Nob3VsZCBleHBhbmQgYWZ0ZXIgc2Vjb25kIHVzZXIgY2xpY2snKTtcblxuXHRcdFx0Ly8gQ29uZmlybSB0aGUgdG9vbCAobW92ZSB0byBleGVjdXRpbmcpXG5cdFx0XHRzdGF0ZU9ic2VydmFibGUuc2V0KGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyksIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIFNpbmNlIHVzZXIgbWFudWFsbHkgcmUtZXhwYW5kZWQgYWZ0ZXIgYXV0by1leHBhbmQsIHNob3VsZCBzdGF5IGV4cGFuZGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksIGZhbHNlLFxuXHRcdFx0XHQnU2hvdWxkIHN0YXkgZXhwYW5kZWQgd2hlbiB1c2VyIG1hbnVhbGx5IHJlLWV4cGFuZGVkIGFmdGVyIGF1dG8tZXhwYW5kJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzdW1lIGF1dG8tY29sbGFwc2UgYWZ0ZXIgdXNlciBtYW51YWxseSBleHBhbmRzIHRoZW4gY29sbGFwc2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50J1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gRmlyc3QgY29uZmlybWF0aW9uIGN5Y2xlIC0gdXNlciBtYW51YWxseSBleHBhbmRzXG5cdFx0XHRjb25zdCBzdGF0ZU9ic2VydmFibGUxID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZTEnLCBjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSk7XG5cdFx0XHRjb25zdCBjaGlsZFRvb2wxOiBJQ2hhdFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0XHQuLi5jcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRcdHRvb2xJZDogJ3J1bkluVGVybWluYWwnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sMScsXG5cdFx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHRvb2xJbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzdGF0ZTogc3RhdGVPYnNlcnZhYmxlMSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdGaXJzdCB0b29sJ1xuXHRcdFx0fTtcblxuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZShjaGlsZFRvb2wxKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGF1dG8tZXhwYW5kIGZvciBmaXJzdCBjb25maXJtYXRpb25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgZmFsc2UsXG5cdFx0XHRcdCdTaG91bGQgYXV0by1leHBhbmQgZm9yIGZpcnN0IGNvbmZpcm1hdGlvbicpO1xuXG5cdFx0XHQvLyBVc2VyIG1hbnVhbGx5IGNvbGxhcHNlc1xuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksICdTaG91bGQgY29sbGFwc2UgYWZ0ZXIgdXNlciBjbGljaycpO1xuXG5cdFx0XHQvLyBVc2VyIG1hbnVhbGx5IGV4cGFuZHMgKHRoaXMgc2V0cyB1c2VyTWFudWFsbHlFeHBhbmRlZCA9IHRydWUpXG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksIGZhbHNlLFxuXHRcdFx0XHQnU2hvdWxkIGV4cGFuZCBhZnRlciB1c2VyIHJlLWV4cGFuZHMnKTtcblxuXHRcdFx0Ly8gQ29tcGxldGUgZmlyc3QgdG9vbCAoc2hvdWxkIG5vdCBhdXRvLWNvbGxhcHNlIHNpbmNlIHVzZXIgbWFudWFsbHkgZXhwYW5kZWQpXG5cdFx0XHRzdGF0ZU9ic2VydmFibGUxLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCBmYWxzZSxcblx0XHRcdFx0J1Nob3VsZCBzdGF5IGV4cGFuZGVkIGFmdGVyIGZpcnN0IHRvb2wgY29tcGxldGVzICh1c2VyIG1hbnVhbGx5IGV4cGFuZGVkKScpO1xuXG5cdFx0XHQvLyBVc2VyIG1hbnVhbGx5IGNvbGxhcHNlcyBhZ2FpbiAodGhpcyByZXNldHMgdXNlck1hbnVhbGx5RXhwYW5kZWQpXG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksICdTaG91bGQgY29sbGFwc2UgYWZ0ZXIgdXNlciBtYW51YWxseSBjb2xsYXBzZXMnKTtcblxuXHRcdFx0Ly8gU2Vjb25kIGNvbmZpcm1hdGlvbiBjeWNsZSAtIHNob3VsZCBhdXRvLWNvbGxhcHNlIG5vdyBzaW5jZSB1c2VyTWFudWFsbHlFeHBhbmRlZCB3YXMgcmVzZXRcblx0XHRcdGNvbnN0IHN0YXRlT2JzZXJ2YWJsZTIgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlMicsIGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pKTtcblx0XHRcdGNvbnN0IGNoaWxkVG9vbDI6IElDaGF0VG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRcdC4uLmNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0dG9vbElkOiAncnVuSW5UZXJtaW5hbCcsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wyJyxcblx0XHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogdG9vbEludm9jYXRpb24uc3ViQWdlbnRJbnZvY2F0aW9uSWRcblx0XHRcdFx0fSksXG5cdFx0XHRcdHN0YXRlOiBzdGF0ZU9ic2VydmFibGUyLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1NlY29uZCB0b29sJ1xuXHRcdFx0fTtcblxuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZShjaGlsZFRvb2wyKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGF1dG8tZXhwYW5kIGZvciBzZWNvbmQgY29uZmlybWF0aW9uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksIGZhbHNlLFxuXHRcdFx0XHQnU2hvdWxkIGF1dG8tZXhwYW5kIGZvciBzZWNvbmQgY29uZmlybWF0aW9uJyk7XG5cblx0XHRcdC8vIENvbXBsZXRlIHNlY29uZCB0b29sIC0gc2hvdWxkIGF1dG8tY29sbGFwc2Ugc2luY2UgdXNlck1hbnVhbGx5RXhwYW5kZWQgd2FzIHJlc2V0IGJ5IHRoZSBlYXJsaWVyIGNvbGxhcHNlXG5cdFx0XHRzdGF0ZU9ic2VydmFibGUyLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLFxuXHRcdFx0XHQnU2hvdWxkIGF1dG8tY29sbGFwc2UgYWZ0ZXIgc2Vjb25kIGNvbmZpcm1hdGlvbiBpcyBhZGRyZXNzZWQgKHVzZXJNYW51YWxseUV4cGFuZGVkIHdhcyByZXNldCknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjbGVhciBjdXJyZW50IHJ1bm5pbmcgdG9vbCBtZXNzYWdlIHdoZW4gdG9vbCBjb21wbGV0ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYSB0b29sIHRoYXQgd2lsbCBjb21wbGV0ZVxuXHRcdFx0Y29uc3Qgc3RhdGVPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZScsIGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZykpO1xuXHRcdFx0Y29uc3QgY2hpbGRUb29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0XHQuLi5jcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRcdHRvb2xJZDogJ3JlYWRGaWxlJyxcblx0XHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogdG9vbEludm9jYXRpb24uc3ViQWdlbnRJbnZvY2F0aW9uSWRcblx0XHRcdFx0fSksXG5cdFx0XHRcdHN0YXRlOiBzdGF0ZU9ic2VydmFibGUsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZGluZyBjb25maWcudHMnXG5cdFx0XHR9O1xuXG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKGNoaWxkVG9vbCk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aXRsZSBpbmNsdWRlcyB0b29sIG1lc3NhZ2Vcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbiwgJ0J1dHRvbiBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IGdldENvbGxhcHNlQnV0dG9uTGFiZWwoYnV0dG9uKTtcblx0XHRcdGxldCBidXR0b25UZXh0ID0gbGFiZWxFbGVtZW50Py50ZXh0Q29udGVudCA/PyBidXR0b24/LnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvblRleHQuaW5jbHVkZXMoJ1JlYWRpbmcgY29uZmlnLnRzJyksICdUaXRsZSBzaG91bGQgaW5jbHVkZSB0b29sIG1lc3NhZ2Ugd2hpbGUgcnVubmluZycpO1xuXG5cdFx0XHQvLyBDb21wbGV0ZSB0aGUgdG9vbFxuXHRcdFx0c3RhdGVPYnNlcnZhYmxlLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQpLCB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBUaXRsZSBzaG91bGQgc3RpbGwgaW5jbHVkZSB0aGUgdG9vbCBtZXNzYWdlIChwZXJzaXN0cyBsaWtlIHRoaW5raW5nIHBhcnQpXG5cdFx0XHRidXR0b25UZXh0ID0gbGFiZWxFbGVtZW50Py50ZXh0Q29udGVudCA/PyBidXR0b24/LnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvblRleHQuaW5jbHVkZXMoJ1JlYWRpbmcgY29uZmlnLnRzJyksXG5cdFx0XHRcdCdUaXRsZSBzaG91bGQgc3RpbGwgaW5jbHVkZSB0b29sIG1lc3NhZ2UgYWZ0ZXIgY29tcGxldGlvbicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTW9kZWwgbmFtZSB0b29sdGlwJywgKCkgPT4ge1xuXHRcdC8vIEhvdmVyIGNvbnRlbnQgbWF5IGJlIGEgcGxhaW4gc3RyaW5nIG9yIGFuIElNYXJrZG93blN0cmluZzsgbm9ybWFsaXplIHRvIHRleHQgZm9yIGFzc2VydGlvbnMuXG5cdFx0Y29uc3QgaG92ZXJUZXh0ID0gKGNvbnRlbnQ6IHVua25vd24pOiBzdHJpbmcgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiBjb250ZW50ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRyZXR1cm4gY29udGVudDtcblx0XHRcdH1cblx0XHRcdGlmIChpc01hcmtkb3duU3RyaW5nKGNvbnRlbnQpKSB7XG5cdFx0XHRcdHJldHVybiBjb250ZW50LnZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH07XG5cblx0XHR0ZXN0KCdzaG91bGQgc2V0IHVwIGhvdmVyIHdpdGggbW9kZWwgbmFtZSBmcm9tIHNlcmlhbGl6ZWQgdG9vbFNwZWNpZmljRGF0YScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNldHVwRGVsYXllZEhvdmVyQ2FsbHM6IHsgZWxlbWVudDogSFRNTEVsZW1lbnQ7IGNvbnRlbnQ6IHN0cmluZyB9W10gPSBbXTtcblx0XHRcdG1vY2tIb3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIgPSAoZWxlbWVudDogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IHsgY29udGVudDogc3RyaW5nIH0pID0+IHtcblx0XHRcdFx0c2V0dXBEZWxheWVkSG92ZXJDYWxscy5wdXNoKHsgZWxlbWVudCwgY29udGVudDogaG92ZXJUZXh0KG9wdGlvbnMuY29udGVudCkgfSk7XG5cdFx0XHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZEludm9jYXRpb24gPSBjcmVhdGVNb2NrU2VyaWFsaXplZFRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdDb21wbGV0ZWQgdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50Jyxcblx0XHRcdFx0XHRwcm9tcHQ6ICdEbyB0aGUgdGhpbmcnLFxuXHRcdFx0XHRcdHJlc3VsdDogJ0RvbmUnLFxuXHRcdFx0XHRcdG1vZGVsTmFtZTogJ0dQVC00bydcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQodHJ1ZSk7XG5cblx0XHRcdGNyZWF0ZVBhcnQoc2VyaWFsaXplZEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBTaG91bGQgaGF2ZSBzZXQgdXAgYSBob3ZlciB3aXRoIHRoZSBtb2RlbCBuYW1lXG5cdFx0XHRjb25zdCBtb2RlbEhvdmVyID0gc2V0dXBEZWxheWVkSG92ZXJDYWxscy5maW5kKGMgPT4gYy5jb250ZW50LmluY2x1ZGVzKCdHUFQtNG8nKSk7XG5cdFx0XHRhc3NlcnQub2sobW9kZWxIb3ZlciwgJ1Nob3VsZCBzZXQgdXAgaG92ZXIgd2l0aCBtb2RlbCBuYW1lJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHNldCB1cCBob3ZlciB3aGVuIG5vIG1vZGVsIG5hbWUgaXMgYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2V0dXBEZWxheWVkSG92ZXJDYWxsczogeyBlbGVtZW50OiBIVE1MRWxlbWVudDsgY29udGVudDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdFx0bW9ja0hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlciA9IChlbGVtZW50OiBIVE1MRWxlbWVudCwgb3B0aW9uczogeyBjb250ZW50OiBzdHJpbmcgfSkgPT4ge1xuXHRcdFx0XHRzZXR1cERlbGF5ZWRIb3ZlckNhbGxzLnB1c2goeyBlbGVtZW50LCBjb250ZW50OiBob3ZlclRleHQob3B0aW9ucy5jb250ZW50KSB9KTtcblx0XHRcdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBzZXJpYWxpemVkSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tTZXJpYWxpemVkVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NvbXBsZXRlZCB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnLFxuXHRcdFx0XHRcdHByb21wdDogJ0RvIHRoZSB0aGluZycsXG5cdFx0XHRcdFx0cmVzdWx0OiAnRG9uZScsXG5cdFx0XHRcdFx0Ly8gbm8gbW9kZWxOYW1lXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KHRydWUpO1xuXG5cdFx0XHRjcmVhdGVQYXJ0KHNlcmlhbGl6ZWRJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gU2hvdWxkIG5vdCBoYXZlIHNldCB1cCBhbnkgaG92ZXIgd2l0aCBtb2RlbCBpbmZvXG5cdFx0XHRjb25zdCBtb2RlbEhvdmVyID0gc2V0dXBEZWxheWVkSG92ZXJDYWxscy5maW5kKGMgPT4gYy5jb250ZW50LmluY2x1ZGVzKCdNb2RlbDonKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxIb3ZlciwgdW5kZWZpbmVkLCAnU2hvdWxkIG5vdCBzZXQgdXAgbW9kZWwgaG92ZXIgd2hlbiBubyBtb2RlbCBuYW1lJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc2V0IHVwIGhvdmVyIHdoZW4gdG9vbCBjb21wbGV0ZXMgYW5kIHRvb2xTcGVjaWZpY0RhdGEgaGFzIG1vZGVsTmFtZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNldHVwRGVsYXllZEhvdmVyQ2FsbHM6IHsgZWxlbWVudDogSFRNTEVsZW1lbnQ7IGNvbnRlbnQ6IHN0cmluZyB9W10gPSBbXTtcblx0XHRcdG1vY2tIb3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIgPSAoZWxlbWVudDogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IHsgY29udGVudDogc3RyaW5nIH0pID0+IHtcblx0XHRcdFx0c2V0dXBEZWxheWVkSG92ZXJDYWxscy5wdXNoKHsgZWxlbWVudCwgY29udGVudDogaG92ZXJUZXh0KG9wdGlvbnMuY29udGVudCkgfSk7XG5cdFx0XHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnLFxuXHRcdFx0XHRwcm9tcHQ6ICdEbyBzdHVmZicsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHRcdHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gTm8gbW9kZWwgaG92ZXIgaW5pdGlhbGx5IChubyBtb2RlbE5hbWUgeWV0KVxuXHRcdFx0Y29uc3QgaW5pdGlhbEhvdmVyID0gc2V0dXBEZWxheWVkSG92ZXJDYWxscy5maW5kKGMgPT4gYy5jb250ZW50LmluY2x1ZGVzKCdNb2RlbDonKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5pdGlhbEhvdmVyLCB1bmRlZmluZWQsICdTaG91bGQgbm90IGhhdmUgbW9kZWwgaG92ZXIgaW5pdGlhbGx5Jyk7XG5cblx0XHRcdC8vIFNpbXVsYXRlIGludm9rZSgpIHNldHRpbmcgbW9kZWxOYW1lIG9uIHRvb2xTcGVjaWZpY0RhdGFcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEubW9kZWxOYW1lID0gJ0NsYXVkZSBTb25uZXQgNCc7XG5cblx0XHRcdC8vIFNpbXVsYXRlIHRvb2wgY29tcGxldGlvblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZSBhcyBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4+O1xuXHRcdFx0c3RhdGUuc2V0KGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCksIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIFNob3VsZCBub3cgaGF2ZSBhIGhvdmVyIHdpdGggdGhlIG1vZGVsIG5hbWVcblx0XHRcdGNvbnN0IG1vZGVsSG92ZXIgPSBzZXR1cERlbGF5ZWRIb3ZlckNhbGxzLmZpbmQoYyA9PiBjLmNvbnRlbnQuaW5jbHVkZXMoJ0NsYXVkZSBTb25uZXQgNCcpKTtcblx0XHRcdGFzc2VydC5vayhtb2RlbEhvdmVyLCAnU2hvdWxkIHNldCB1cCBob3ZlciB3aXRoIG1vZGVsIG5hbWUgYWZ0ZXIgY29tcGxldGlvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNldCB1cCBob3ZlciB3aXRoIGNyZWRpdHMgZnJvbSBzZXJpYWxpemVkIHRvb2xTcGVjaWZpY0RhdGEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXR1cERlbGF5ZWRIb3ZlckNhbGxzOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyBjb250ZW50OiBzdHJpbmcgfVtdID0gW107XG5cdFx0XHRtb2NrSG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyID0gKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBvcHRpb25zOiB7IGNvbnRlbnQ6IHN0cmluZyB9KSA9PiB7XG5cdFx0XHRcdHNldHVwRGVsYXllZEhvdmVyQ2FsbHMucHVzaCh7IGVsZW1lbnQsIGNvbnRlbnQ6IGhvdmVyVGV4dChvcHRpb25zLmNvbnRlbnQpIH0pO1xuXHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWRJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1NlcmlhbGl6ZWRUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ29tcGxldGVkIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCcsXG5cdFx0XHRcdFx0cHJvbXB0OiAnRG8gdGhlIHRoaW5nJyxcblx0XHRcdFx0XHRyZXN1bHQ6ICdEb25lJyxcblx0XHRcdFx0XHRtb2RlbE5hbWU6ICdHUFQtNG8nLFxuXHRcdFx0XHRcdGNyZWRpdHM6IDEuNSxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQodHJ1ZSk7XG5cblx0XHRcdGNyZWF0ZVBhcnQoc2VyaWFsaXplZEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBIb3ZlciBzaG91bGQgbWVudGlvbiBib3RoIHRoZSBtb2RlbCBhbmQgdGhlIGNyZWRpdCBjb3N0XG5cdFx0XHRjb25zdCBob3ZlciA9IHNldHVwRGVsYXllZEhvdmVyQ2FsbHMuZmluZChjID0+IGMuY29udGVudC5pbmNsdWRlcygnMS41JykgJiYgYy5jb250ZW50LmluY2x1ZGVzKCdjcmVkaXRzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGhvdmVyLCAnU2hvdWxkIHNldCB1cCBob3ZlciB3aXRoIGNyZWRpdHMnKTtcblx0XHRcdGFzc2VydC5vayhob3ZlciEuY29udGVudC5pbmNsdWRlcygnR1BULTRvJyksICdIb3ZlciBzaG91bGQgc3RpbGwgaW5jbHVkZSBtb2RlbCBuYW1lJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXBkYXRlIGhvdmVyIHdpdGggY3JlZGl0cyB3aGVuIHRoZXkgYXJyaXZlIGFmdGVyIGNvbXBsZXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXR1cERlbGF5ZWRIb3ZlckNhbGxzOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyBjb250ZW50OiBzdHJpbmcgfVtdID0gW107XG5cdFx0XHRtb2NrSG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyID0gKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBvcHRpb25zOiB7IGNvbnRlbnQ6IHN0cmluZyB9KSA9PiB7XG5cdFx0XHRcdHNldHVwRGVsYXllZEhvdmVyQ2FsbHMucHVzaCh7IGVsZW1lbnQsIGNvbnRlbnQ6IGhvdmVyVGV4dChvcHRpb25zLmNvbnRlbnQpIH0pO1xuXHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50Jyxcblx0XHRcdFx0cHJvbXB0OiAnRG8gc3R1ZmYnLFxuXHRcdFx0XHRtb2RlbE5hbWU6ICdHUFQtNG8nLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0XHRzdGF0ZVR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIE5vIGNyZWRpdHMgaW4gdGhlIGhvdmVyIHlldFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldHVwRGVsYXllZEhvdmVyQ2FsbHMuZmluZChjID0+IGMuY29udGVudC5pbmNsdWRlcygnY3JlZGl0JykpLCB1bmRlZmluZWQsICdTaG91bGQgbm90IHNob3cgY3JlZGl0cyBiZWZvcmUgdGhleSBhcmUgcmVwb3J0ZWQnKTtcblxuXHRcdFx0Ly8gQ3JlZGl0cyBhY2N1bXVsYXRlIGFuZCB0aGUgc3ViYWdlbnQgY29tcGxldGVzXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLmNyZWRpdHMgPSAyO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZSBhcyBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4+O1xuXHRcdFx0c3RhdGUuc2V0KGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCksIHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IGNyZWRpdEhvdmVyID0gc2V0dXBEZWxheWVkSG92ZXJDYWxscy5maW5kKGMgPT4gYy5jb250ZW50LmluY2x1ZGVzKCcyJykgJiYgYy5jb250ZW50LmluY2x1ZGVzKCdjcmVkaXRzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNyZWRpdEhvdmVyLCAnU2hvdWxkIHNldCB1cCBob3ZlciB3aXRoIGNyZWRpdHMgYWZ0ZXIgY29tcGxldGlvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVwZGF0ZSBob3ZlciB3aXRoIG1vZGVsIG5hbWUgd2hlbiBpdCBhcnJpdmVzIGFmdGVyIGluaXRpYWwgcmVuZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2V0dXBEZWxheWVkSG92ZXJDYWxsczogeyBlbGVtZW50OiBIVE1MRWxlbWVudDsgY29udGVudDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdFx0bW9ja0hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlciA9IChlbGVtZW50OiBIVE1MRWxlbWVudCwgb3B0aW9uczogeyBjb250ZW50OiBzdHJpbmcgfSkgPT4ge1xuXHRcdFx0XHRzZXR1cERlbGF5ZWRIb3ZlckNhbGxzLnB1c2goeyBlbGVtZW50LCBjb250ZW50OiBob3ZlclRleHQob3B0aW9ucy5jb250ZW50KSB9KTtcblx0XHRcdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBBZ2VudCBob3N0IHN1YmFnZW50cyBzdGFydCB3aXRob3V0IGEgbW9kZWwgbmFtZTsgaXQgaXMgcmVwb3J0ZWRcblx0XHRcdC8vIGxhdGVyIHZpYSB0aGUgY2hpbGQgdHVybnMnIHVzYWdlIGV2ZW50cy5cblx0XHRcdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50Jyxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdFx0c3RhdGVUeXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBObyBtb2RlbCBpbiB0aGUgaG92ZXIgeWV0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0dXBEZWxheWVkSG92ZXJDYWxscy5maW5kKGMgPT4gYy5jb250ZW50LmluY2x1ZGVzKCdNb2RlbCcpKSwgdW5kZWZpbmVkLCAnU2hvdWxkIG5vdCBzaG93IGEgbW9kZWwgYmVmb3JlIG9uZSBpcyByZXBvcnRlZCcpO1xuXG5cdFx0XHQvLyBNb2RlbCBuYW1lIGFycml2ZXMgd2hpbGUgdGhlIHN1YmFnZW50IGlzIHN0aWxsIHJ1bm5pbmdcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEubW9kZWxOYW1lID0gJ0NsYXVkZSBTb25uZXQgNCc7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlIGFzIFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlPj47XG5cdFx0XHRzdGF0ZS5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3QgbW9kZWxIb3ZlciA9IHNldHVwRGVsYXllZEhvdmVyQ2FsbHMuZmluZChjID0+IGMuY29udGVudC5pbmNsdWRlcygnQ2xhdWRlIFNvbm5ldCA0JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1vZGVsSG92ZXIsICdTaG91bGQgc2V0IHVwIGhvdmVyIHdpdGggbW9kZWwgbmFtZSBhZnRlciBpdCBhcnJpdmVzJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBOEM7QUFDdkQsU0FBUyxjQUF1QjtBQUNoQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUloQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQixxQ0FBcUM7QUFDL0QsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywrQkFBK0I7QUFDeEMsU0FBZ0UscUJBQW9ELHVCQUF1QjtBQUkzSSxTQUFTLGtDQUFrQztBQUczQyxTQUEwQix3QkFBd0I7QUFFbEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQWlDLDhCQUE4QjtBQUMvRCxTQUE2QixjQUFjLFFBQVEsc0JBQXNCO0FBQ3pFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNENBQTRDO0FBRXJELE1BQU0sbUNBQW1DLGVBQWU7QUFBQSxFQUN2RCxZQUFZLGNBQXVCLFNBQWlDO0FBQ25FLFVBQU0sUUFBVyxJQUFJLE9BQU8sYUFBYSxJQUFJLGFBQWEsT0FBTyxhQUFhLE9BQU8sTUFBTSxhQUFXLGFBQWEsSUFBSSxPQUFPLENBQUMsR0FBRyxPQUFPO0FBQ3pJLFFBQUksS0FBSyxrQkFBa0IsUUFBUTtBQUNsQyxXQUFLLFVBQVUsS0FBSyxNQUFNO0FBQUEsSUFDM0I7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLDBCQUE0RDtBQUFBLEVBQWxFO0FBRUMsU0FBaUIsZUFBZSxJQUFJLFFBQWdCO0FBQ3BELFNBQVMsY0FBYyxLQUFLLGFBQWE7QUFDekMsU0FBUSxxQkFBcUI7QUFBQTtBQUFBLEVBRTdCLElBQUkscUJBQThCO0FBQ2pDLFdBQU8sS0FBSyxhQUFhLGFBQWE7QUFBQSxFQUN2QztBQUFBLEVBRUEscUJBQXFCLFdBQTBCO0FBQzlDLFNBQUsscUJBQXFCO0FBQUEsRUFDM0I7QUFBQSxFQUVBLGNBQWMsUUFBc0I7QUFDbkMsU0FBSyxhQUFhLEtBQUssTUFBTTtBQUFBLEVBQzlCO0FBQUEsRUFFQSxTQUFTLE9BQWUsWUFBNkIsV0FBd0Q7QUFDNUcsV0FBTyxFQUFFLFNBQVMsTUFBTTtBQUFBLElBQUUsRUFBRTtBQUFBLEVBQzdCO0FBQUEsRUFFQSxPQUFPLE1BQWMsV0FBZ0U7QUFDcEYsUUFBSSxDQUFDLEtBQUssc0JBQXNCLFNBQVMsT0FBTyx1QkFBdUIsY0FBYyxzQ0FBc0M7QUFDMUgsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLENBQUMsUUFBUSxZQUFZLElBQUksMkJBQTJCLFFBQVEsT0FBTztBQUFBLEVBQzNFO0FBQ0Q7QUFFQSxNQUFNLGdDQUFnQyxnQkFBZ0I7QUFBQSxFQUlyRCxZQUE2QixnQkFBZ0M7QUFDNUQsVUFBTTtBQURzQjtBQUg3QiwyQkFBa0I7QUFDbEIsK0JBQXNCO0FBQUEsRUFJdEI7QUFBQSxFQUVTLFdBQVcsSUFBWSxtQkFBdUM7QUFDdEUsU0FBSztBQUNMLFdBQU8sTUFBTSxXQUFXLElBQUksaUJBQWlCO0FBQUEsRUFDOUM7QUFBQSxFQUVTLGVBQWUsSUFBWSxtQkFBdUMsU0FBMEU7QUFDcEosU0FBSztBQUNMLFFBQUksT0FBTyxPQUFPLHFCQUFxQjtBQUN0QyxhQUFPLENBQUMsQ0FBQyxjQUFjLENBQUMsS0FBSyxjQUFjLENBQUMsQ0FBQztBQUFBLElBQzlDO0FBQ0EsV0FBTyxNQUFNLGVBQWUsSUFBSSxtQkFBbUIsT0FBTztBQUFBLEVBQzNEO0FBQ0Q7QUFFQSxNQUFNLDJCQUEyQixNQUFNO0FBQ3RDLFFBQU0sUUFBUSx3Q0FBd0M7QUFJdEQsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLFdBQVMsd0JBQXdCLGFBQXNCLE9BQXNDO0FBQzVGLFVBQU0sY0FBK0M7QUFBQSxNQUNwRDtBQUFBLE1BQ0EsSUFBSTtBQUFBLE1BQ0osaUJBQWlCLElBQUksTUFBTSw4QkFBOEI7QUFBQSxNQUN6RCxJQUFJLFFBQVE7QUFBRSxlQUFPLENBQUM7QUFBQSxNQUFzQztBQUFBLElBQzdEO0FBRUEsV0FBTztBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1Qsa0JBQWtCLENBQUM7QUFBQSxNQUNuQixjQUFjO0FBQUEsTUFDZCxXQUFXLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFBQSxNQUNsRCxTQUFTLENBQUM7QUFBQSxNQUNWLGNBQWM7QUFBQSxNQUNkLFlBQVk7QUFBQSxNQUNaLHFCQUFxQjtBQUFBLE1BQ3JCLGdCQUFnQjtBQUFBLE1BQ2hCLGdCQUFnQixDQUFDO0FBQUEsTUFDakIsY0FBYyxnQkFBZ0IsZ0JBQWdCLEdBQUc7QUFBQSxNQUNqRCx1QkFBdUIsTUFBTTtBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUVBLFdBQVMsWUFBWSxXQUEwQyxZQUFrRTtBQUNoSSxZQUFRLFdBQVc7QUFBQSxNQUNsQixLQUFLLG9CQUFvQixVQUFVO0FBQ2xDLGVBQU87QUFBQSxVQUNOLE1BQU0sb0JBQW9CLFVBQVU7QUFBQSxVQUNwQyxjQUFjLGdCQUFnQixnQkFBZ0IsQ0FBQyxDQUFDO0FBQUEsVUFDaEQsa0JBQWtCLGdCQUFnQixvQkFBb0IsTUFBUztBQUFBLFFBQ2hFO0FBQUEsTUFDRCxLQUFLLG9CQUFvQixVQUFVO0FBQ2xDLGVBQU87QUFBQSxVQUNOLE1BQU0sb0JBQW9CLFVBQVU7QUFBQSxVQUNwQztBQUFBLFVBQ0EsV0FBVyxFQUFFLE1BQU0sZ0JBQWdCLHNCQUFzQjtBQUFBLFVBQ3pELGVBQWU7QUFBQSxVQUNmLGVBQWU7QUFBQSxVQUNmLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxRQUFRLE9BQU8sY0FBYyxDQUFDO0FBQUEsUUFDekQ7QUFBQSxNQUNELEtBQUssb0JBQW9CLFVBQVU7QUFDbEMsZUFBTztBQUFBLFVBQ04sTUFBTSxvQkFBb0IsVUFBVTtBQUFBLFVBQ3BDO0FBQUEsVUFDQSxXQUFXLEVBQUUsTUFBTSxnQkFBZ0Isc0JBQXNCO0FBQUEsVUFDekQsVUFBVSxnQkFBZ0IsWUFBWSxFQUFFLFNBQVMsUUFBVyxVQUFVLE9BQVUsQ0FBQztBQUFBLFFBQ2xGO0FBQUEsTUFDRCxLQUFLLG9CQUFvQixVQUFVO0FBQ2xDLGVBQU87QUFBQSxVQUNOLE1BQU0sb0JBQW9CLFVBQVU7QUFBQSxVQUNwQztBQUFBLFVBQ0EsV0FBVyxFQUFFLE1BQU0sZ0JBQWdCLHNCQUFzQjtBQUFBLFVBQ3pELFFBQVE7QUFBQSxZQUNQLElBQUk7QUFBQSxZQUNKLE1BQU07QUFBQSxZQUNOLFVBQVU7QUFBQSxVQUNYO0FBQUEsVUFDQSxRQUFRLE1BQU07QUFBQSxVQUFFO0FBQUEsUUFDakI7QUFBQSxNQUNELEtBQUssb0JBQW9CLFVBQVU7QUFDbEMsZUFBTztBQUFBLFVBQ04sTUFBTSxvQkFBb0IsVUFBVTtBQUFBLFVBQ3BDO0FBQUEsVUFDQSxzQkFBc0I7QUFBQSxZQUNyQixPQUFPO0FBQUEsWUFDUCxTQUFTO0FBQUEsVUFDVjtBQUFBLFVBQ0EsU0FBUyxNQUFNO0FBQUEsVUFBRTtBQUFBLFFBQ2xCO0FBQUEsTUFDRCxLQUFLLG9CQUFvQixVQUFVO0FBQ2xDLGVBQU87QUFBQSxVQUNOLE1BQU0sb0JBQW9CLFVBQVU7QUFBQSxVQUNwQztBQUFBLFVBQ0EsV0FBVyxFQUFFLE1BQU0sZ0JBQWdCLHNCQUFzQjtBQUFBLFVBQ3pELGVBQWU7QUFBQSxVQUNmLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxRQUFRLE9BQU8sY0FBYyxDQUFDO0FBQUEsVUFDeEQsU0FBUyxNQUFNO0FBQUEsVUFBRTtBQUFBLFFBQ2xCO0FBQUEsTUFDRCxLQUFLLG9CQUFvQixVQUFVO0FBQ2xDLGVBQU87QUFBQSxVQUNOLE1BQU0sb0JBQW9CLFVBQVU7QUFBQSxVQUNwQztBQUFBLFVBQ0EsUUFBUSxnQkFBZ0I7QUFBQSxRQUN6QjtBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBRUEsV0FBUyx5QkFBeUIsVUFROUIsQ0FBQyxHQUF3QjtBQUM1QixVQUFNLFlBQVksUUFBUSxhQUFhLG9CQUFvQixVQUFVO0FBQ3JFLFVBQU0sYUFBYSxZQUFZLFdBQVcsUUFBUSxVQUFVO0FBQzVELFVBQU0sYUFBYSxRQUFRLGNBQWMsZUFBZSxLQUFLLE9BQU8sRUFBRSxTQUFTLEVBQUUsRUFBRSxVQUFVLENBQUM7QUFFOUYsVUFBTSxpQkFBc0M7QUFBQSxNQUMzQyxjQUFjO0FBQUEsTUFDZCxrQkFBa0IsUUFBUSxvQkFBb0I7QUFBQSxRQUM3QyxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsTUFDVDtBQUFBLE1BQ0EsZUFBZTtBQUFBLE1BQ2YsbUJBQW1CLFFBQVEscUJBQXFCO0FBQUEsTUFDaEQsa0JBQWtCO0FBQUEsTUFDbEIsUUFBUSxlQUFlO0FBQUEsTUFDdkIsUUFBUSxRQUFRLFVBQVUsZ0JBQWdCO0FBQUEsTUFDMUM7QUFBQSxNQUNBLHNCQUFzQixRQUFRO0FBQUEsTUFDOUIsT0FBTyxnQkFBZ0IsU0FBUyxVQUFVO0FBQUEsTUFDMUMsc0JBQXNCLGdCQUFnQixTQUFTLFFBQVEsb0JBQW9CLEVBQUUsTUFBTSxXQUFXLEdBQUcsSUFBSTtBQUFBLE1BQ3JHLHNCQUFzQjtBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLFFBQVEsTUFBTSxtQ0FBbUM7QUFBQSxRQUNoRCxRQUFRLFFBQVEsVUFBVSxnQkFBZ0I7QUFBQSxRQUMxQyxzQkFBc0IsUUFBUTtBQUFBLFFBQzlCLGtCQUFrQixRQUFRO0FBQUEsUUFDMUIsWUFBWSxjQUFjLG9CQUFvQixVQUFVO0FBQUEsTUFDekQsQ0FBQztBQUFBLElBQ0Y7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUVBLFdBQVMsbUNBQW1DLFVBS3hDLENBQUMsR0FBa0M7QUFDdEMsV0FBTztBQUFBLE1BQ04sY0FBYztBQUFBLE1BQ2Qsa0JBQWtCLFFBQVEsb0JBQW9CO0FBQUEsUUFDN0MsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBLFFBQ1IsUUFBUTtBQUFBLE1BQ1Q7QUFBQSxNQUNBLGVBQWU7QUFBQSxNQUNmLG1CQUFtQjtBQUFBLE1BQ25CLGtCQUFrQjtBQUFBLE1BQ2xCLGVBQWU7QUFBQSxNQUNmLGFBQWEsRUFBRSxNQUFNLGdCQUFnQixzQkFBc0I7QUFBQSxNQUMzRCxZQUFZLFFBQVEsY0FBYztBQUFBLE1BQ2xDLFlBQVksUUFBUSx3QkFBd0I7QUFBQSxNQUM1QyxRQUFRLFFBQVEsVUFBVSxnQkFBZ0I7QUFBQSxNQUMxQyxRQUFRLGVBQWU7QUFBQSxNQUN2QixzQkFBc0IsUUFBUTtBQUFBLE1BQzlCLE1BQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUVBLFFBQU0sTUFBTTtBQUNYLGtCQUFjLE1BQU0sSUFBSSxJQUFJLGdCQUFnQixDQUFDO0FBQzdDLDJCQUF1Qiw4QkFBOEIsUUFBVyxLQUFLO0FBR3JFLDJCQUF1QjtBQUFBLE1BQ3RCLFFBQVEsQ0FBQyxXQUE0QixVQUFrQyxlQUFnRDtBQUN0SCxjQUFNLFVBQVUsY0FBYyxXQUFXLFNBQVMsY0FBYyxLQUFLO0FBQ3JFLGNBQU0sVUFBVSxPQUFPLGNBQWMsV0FBVyxZQUFhLFVBQVUsU0FBUztBQUNoRixnQkFBUSxjQUFjO0FBQ3RCLGVBQU87QUFBQSxVQUNOO0FBQUEsVUFDQSxTQUFTLE1BQU07QUFBQSxVQUFFO0FBQUEsUUFDbEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLHdCQUFvQjtBQUFBLE1BQ25CLGVBQWU7QUFBQSxNQUNmLFVBQVUsT0FBTyxFQUFFLFNBQVMsTUFBTTtBQUFBLE1BQUUsRUFBRTtBQUFBLE1BQ3RDLG1CQUFtQjtBQUFBLElBQ3BCO0FBQ0EseUJBQXFCLEtBQUssNEJBQTRCLGlCQUFpQjtBQUd2RSx1QkFBbUI7QUFBQSxNQUNsQixlQUFlO0FBQUEsTUFDZixrQkFBa0IsTUFBTTtBQUFBLE1BQ3hCLG1CQUFtQixPQUFPLEVBQUUsU0FBUyxNQUFNO0FBQUEsTUFBRSxFQUFFO0FBQUEsTUFDL0MsMEJBQTBCLE9BQU8sRUFBRSxTQUFTLE1BQU07QUFBQSxNQUFFLEVBQUU7QUFBQSxNQUN0RCxrQkFBa0IsTUFBTTtBQUFBLE1BQ3hCLFdBQVcsTUFBTTtBQUFBLE1BQUU7QUFBQSxNQUNuQix1QkFBdUIsTUFBTTtBQUFBLE1BQUU7QUFBQSxNQUMvQixtQkFBbUIsT0FBTyxFQUFFLFNBQVMsTUFBTTtBQUFBLE1BQUUsR0FBRyxNQUFNLE1BQU07QUFBQSxNQUFFLEdBQUcsTUFBTSxNQUFNO0FBQUEsTUFBRSxHQUFHLFFBQVEsTUFBTTtBQUFBLE1BQUUsRUFBRTtBQUFBLE1BQ3BHLGtCQUFrQixNQUFNO0FBQUEsTUFBRTtBQUFBLElBQzNCO0FBQ0EseUJBQXFCLEtBQUssZUFBZSxnQkFBZ0I7QUFDekQseUJBQXFCLEtBQUssdUJBQXVCLElBQUksY0FBYyx5QkFBeUI7QUFBQSxNQUNsRixrQkFBMkI7QUFBRSxlQUFPO0FBQUEsTUFBTztBQUFBLElBQ3JELEVBQUUsQ0FBQztBQUNILDRCQUF3QixJQUFJLDBCQUEwQjtBQUN0RCx5QkFBcUIsS0FBSyx3QkFBd0IscUJBQXFCO0FBQ3ZFLGtCQUFjLElBQUksd0JBQXdCLElBQUk7QUFBQSxNQUM3QyxFQUFFLElBQUksc0NBQXNDLE9BQU8sZ0JBQWdCO0FBQUEsTUFDbkU7QUFBQSxNQUNBLEVBQUUsbUJBQW1CLEtBQUs7QUFBQSxNQUMxQjtBQUFBLE1BQ0E7QUFBQSxNQUNBLHFCQUFxQixJQUFJLGtCQUFrQjtBQUFBLE1BQzNDLHFCQUFxQixJQUFJLGVBQWU7QUFBQSxJQUN6QyxDQUFDO0FBQ0QseUJBQXFCLEtBQUssY0FBYyxXQUFXO0FBR25ELG1CQUFlLENBQUM7QUFDaEIscUJBQWlCLENBQUM7QUFDbEIsZ0NBQTRCLG9CQUFJLElBQUk7QUFBQSxFQUNyQyxDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsZ0JBQVksUUFBUTtBQUFBLEVBQ3JCLENBQUM7QUFFRCxXQUFTLFdBQ1IsZ0JBQ0EsU0FDQSxZQUMwQjtBQUMxQixVQUFNLE9BQU8sTUFBTSxJQUFJLHFCQUFxQjtBQUFBLE1BQzNDO0FBQUEsTUFDQSxjQUFjLGVBQWUsd0JBQXdCLGVBQWU7QUFBQSxNQUNwRTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLE1BQU07QUFBQSxNQUNOO0FBQUEsSUFDRCxDQUFDO0FBRUQsZUFBVyxTQUFTLEtBQUssWUFBWSxLQUFLLE9BQU87QUFDakQsZ0JBQVksSUFBSSxFQUFFLFNBQVMsTUFBTSxLQUFLLFFBQVEsT0FBTyxFQUFFLENBQUM7QUFFeEQsV0FBTztBQUFBLEVBQ1I7QUFHQSxXQUFTLGtCQUFrQixNQUF3RDtBQUNsRixVQUFNLFNBQVMsS0FBSyxRQUFRLGNBQWMsMkNBQTJDO0FBQ3JGLFdBQU8sY0FBYyxNQUFNLElBQUksU0FBUztBQUFBLEVBQ3pDO0FBRUEsV0FBUyx1QkFBdUIsUUFBOEM7QUFDN0UsVUFBTSxRQUFRLE9BQU8sY0FBYyx3QkFBd0I7QUFDM0QsV0FBTyxjQUFjLEtBQUssSUFBSSxRQUFRO0FBQUEsRUFDdkM7QUFFQSxXQUFTLHNCQUFzQixRQUE4QztBQUM1RSxVQUFNLE9BQU8sT0FBTztBQUNwQixXQUFPLGNBQWMsSUFBSSxJQUFJLE9BQU87QUFBQSxFQUNyQztBQUVBLFdBQVMsa0JBQWtCLE1BQXdEO0FBQ2xGLFVBQU0sVUFBVSxLQUFLLFFBQVEsY0FBYyw0QkFBNEI7QUFDdkUsV0FBTyxjQUFjLE9BQU8sSUFBSSxVQUFVO0FBQUEsRUFDM0M7QUFFQSxXQUFTLG1CQUFtQixNQUErTztBQUMxUSxXQUFRLEtBQTRRLGtCQUFrQixXQUFXO0FBQUEsRUFDbFQ7QUFFQSxXQUFTLG9CQUFvQixNQUErQixTQUF3QjtBQUNuRixVQUFNLFVBQVcsS0FBMEg7QUFDM0ksV0FBTyxHQUFHLE9BQU87QUFDakIsVUFBTSxTQUFTLE1BQU0sSUFBSSxJQUFJLE9BQU8sZ0JBQWdCLGlCQUFpQixJQUFJLE9BQU8sQ0FBQztBQUNqRixZQUFRLGlCQUFpQixNQUFNO0FBQy9CLFlBQVEsZ0JBQWdCLE1BQU07QUFDOUIsSUFBQyxLQUF3RCx3QkFBd0I7QUFBQSxFQUNsRjtBQUVBLFFBQU0sbUJBQW1CLE1BQU07QUFDOUIsU0FBSyxvREFBb0QsTUFBTTtBQUM5RCxZQUFNLGlCQUFpQix5QkFBeUI7QUFDaEQsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRS9DLGFBQU8sR0FBRyxLQUFLLFFBQVEsVUFBVSxTQUFTLG1CQUFtQixHQUFHLHFDQUFxQztBQUNyRyxhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyxvQkFBb0IsR0FBRyxzQ0FBc0M7QUFDdkcsYUFBTyxHQUFHLEtBQUssUUFBUSxVQUFVLFNBQVMsMEJBQTBCLEdBQUcsNENBQTRDO0FBQ25ILGFBQU8sR0FBRyxLQUFLLFFBQVEsVUFBVSxTQUFTLHFDQUFxQyxHQUFHLGlEQUFpRDtBQUNuSSxhQUFPLFlBQVksS0FBSyxRQUFRLFVBQVUsU0FBUyxtQ0FBbUMsR0FBRyxPQUFPLHlEQUF5RDtBQUFBLElBQzFKLENBQUM7QUFFRCxTQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFlBQU0sT0FBTyxXQUFXLHlCQUF5QjtBQUFBLFFBQ2hELGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLGNBQWM7QUFBQSxRQUNmO0FBQUEsTUFDRCxDQUFDLEdBQUcsd0JBQXdCLEtBQUssQ0FBQztBQUNsQyxZQUFNLFNBQVMsS0FBSyxRQUFRLGNBQWMsMEJBQTBCO0FBQ3BFLFlBQU0sVUFBVSxRQUFRLGNBQWMsa0NBQWtDO0FBQ3hFLFlBQU0saUJBQWlCLGtCQUFrQixJQUFJO0FBRTdDLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsY0FBYyxLQUFLLFFBQVEsVUFBVSxTQUFTLHdCQUF3QjtBQUFBLFFBQ3RFLHVCQUF1QixTQUFTLGtCQUFrQjtBQUFBLFFBQ2xELCtCQUErQixTQUFTLHVCQUF1QjtBQUFBLE1BQ2hFLEdBQUc7QUFBQSxRQUNGLGNBQWM7QUFBQSxRQUNkLHVCQUF1QjtBQUFBLFFBQ3ZCLCtCQUErQjtBQUFBLE1BQ2hDLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLCtFQUErRSxNQUFNO0FBQ3pGLFlBQU0sT0FBTyxXQUFXLHlCQUF5QjtBQUFBLFFBQ2hELGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLGNBQWM7QUFBQSxRQUNmO0FBQUEsTUFDRCxDQUFDLEdBQUcsd0JBQXdCLEtBQUssQ0FBQztBQUVsQyxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFlBQVksQ0FBQyxDQUFFLEtBQWtEO0FBQUEsUUFDakUsaUJBQWlCLFlBQVk7QUFBQSxRQUM3QixxQkFBcUIsWUFBWTtBQUFBLFFBQ2pDLHdCQUF3QixzQkFBc0I7QUFBQSxNQUMvQyxHQUFHO0FBQUEsUUFDRixZQUFZO0FBQUEsUUFDWixpQkFBaUI7QUFBQSxRQUNqQixxQkFBcUI7QUFBQSxRQUNyQix3QkFBd0I7QUFBQSxNQUN6QixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyx1RkFBdUYsTUFBTTtBQUNqRyxZQUFNLE9BQU8sV0FBVyx5QkFBeUI7QUFBQSxRQUNoRCxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixjQUFjO0FBQUEsUUFDZjtBQUFBLE1BQ0QsQ0FBQyxHQUFHLHdCQUF3QixLQUFLLENBQUM7QUFDbEMsMEJBQW9CLE1BQU0sSUFBSTtBQUU5QixZQUFNLGlCQUFpQixrQkFBa0IsSUFBSTtBQUM3QyxZQUFNLHFCQUFxQixLQUFLLFFBQVEsY0FBMkIscUNBQXFDO0FBQ3hHLGFBQU8sR0FBRyxjQUFjO0FBQ3hCLGFBQU8sR0FBRyxrQkFBa0I7QUFDNUIsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixtQkFBbUIsS0FBSyxRQUFRLFVBQVUsU0FBUyw4QkFBOEI7QUFBQSxRQUNqRix1QkFBdUIsZUFBZSxNQUFNO0FBQUEsUUFDNUMsa0JBQWtCLG1CQUFtQixNQUFNO0FBQUEsTUFDNUMsR0FBRztBQUFBLFFBQ0YsbUJBQW1CO0FBQUEsUUFDbkIsdUJBQXVCO0FBQUEsUUFDdkIsa0JBQWtCO0FBQUEsTUFDbkIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUsscUZBQXFGLE1BQU07QUFDL0YsNEJBQXNCLHFCQUFxQixLQUFLO0FBQ2hELFlBQU0sT0FBTyxXQUFXLHlCQUF5QjtBQUFBLFFBQ2hELGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLGNBQWM7QUFBQSxRQUNmO0FBQUEsTUFDRCxDQUFDLEdBQUcsd0JBQXdCLEtBQUssQ0FBQztBQUNsQyxZQUFNLDhCQUE4QixzQkFBc0I7QUFFMUQsNEJBQXNCLHFCQUFxQixJQUFJO0FBQy9DLDRCQUFzQixjQUFjLE9BQU8sbUJBQW1CO0FBRTlELFlBQU0saUJBQWlCLGtCQUFrQixJQUFJO0FBQzdDLFlBQU0scUJBQXFCLEtBQUssUUFBUSxjQUEyQixxQ0FBcUM7QUFDeEcsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QjtBQUFBLFFBQ0EsNEJBQTRCLHNCQUFzQjtBQUFBLFFBQ2xELG1CQUFtQixLQUFLLFFBQVEsVUFBVSxTQUFTLDhCQUE4QjtBQUFBLFFBQ2pGLHVCQUF1QixnQkFBZ0IsTUFBTTtBQUFBLFFBQzdDLGtCQUFrQixvQkFBb0IsTUFBTTtBQUFBLE1BQzdDLEdBQUc7QUFBQSxRQUNGLDZCQUE2QjtBQUFBLFFBQzdCLDRCQUE0QjtBQUFBLFFBQzVCLG1CQUFtQjtBQUFBLFFBQ25CLHVCQUF1QjtBQUFBLFFBQ3ZCLGtCQUFrQjtBQUFBLE1BQ25CLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLG9GQUFvRixNQUFNO0FBQzlGLFlBQU0sT0FBTyxXQUFXLHlCQUF5QjtBQUFBLFFBQ2hELGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLGNBQWM7QUFBQSxRQUNmO0FBQUEsTUFDRCxDQUFDLEdBQUcsd0JBQXdCLEtBQUssQ0FBQztBQUNsQywwQkFBb0IsTUFBTSxLQUFLO0FBRS9CLFlBQU0saUJBQWlCLGtCQUFrQixJQUFJO0FBQzdDLFlBQU0scUJBQXFCLEtBQUssUUFBUSxjQUEyQixxQ0FBcUM7QUFDeEcsYUFBTyxHQUFHLGNBQWM7QUFDeEIsYUFBTyxHQUFHLGtCQUFrQjtBQUM1QixhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLG1CQUFtQixLQUFLLFFBQVEsVUFBVSxTQUFTLDhCQUE4QjtBQUFBLFFBQ2pGLHVCQUF1QixlQUFlLE1BQU07QUFBQSxRQUM1QyxrQkFBa0IsbUJBQW1CLE1BQU07QUFBQSxNQUM1QyxHQUFHO0FBQUEsUUFDRixtQkFBbUI7QUFBQSxRQUNuQix1QkFBdUI7QUFBQSxRQUN2QixrQkFBa0I7QUFBQSxNQUNuQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywrRUFBK0UsTUFBTTtBQUN6RixZQUFNLE9BQU8sV0FBVyx5QkFBeUI7QUFBQSxRQUNoRCxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixjQUFjO0FBQUEsVUFDZCxXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQyxHQUFHLHdCQUF3QixLQUFLLENBQUM7QUFFbEMsV0FBSyxlQUFlLHlCQUF5QjtBQUFBLFFBQzVDLFlBQVk7QUFBQSxRQUNaLFFBQVE7QUFBQSxRQUNSLG1CQUFtQjtBQUFBLE1BQ3BCLENBQUMsQ0FBQztBQUNGLFlBQU0sUUFBUSxtQkFBbUIsSUFBSTtBQUNyQyxXQUFLLGVBQWUseUJBQXlCO0FBQUEsUUFDNUMsWUFBWTtBQUFBLFFBQ1osUUFBUTtBQUFBLFFBQ1IsbUJBQW1CO0FBQUEsTUFDcEIsQ0FBQyxDQUFDO0FBQ0YsWUFBTSxTQUFTLG1CQUFtQixJQUFJO0FBQ3RDLFdBQUssZUFBZTtBQUVwQixhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFlBQVksT0FBTztBQUFBLFFBQ25CLFdBQVcsT0FBTztBQUFBLFFBQ2xCLGVBQWUsT0FBTyxnQkFBZ0I7QUFBQSxRQUN0QyxZQUFZLFFBQVE7QUFBQSxRQUNwQixnQkFBZ0IsUUFBUSxnQkFBZ0I7QUFBQSxRQUN4QyxlQUFlLG1CQUFtQixJQUFJLEdBQUc7QUFBQSxRQUN6QyxtQkFBbUIsbUJBQW1CLElBQUksR0FBRztBQUFBLE1BQzlDLEdBQUc7QUFBQSxRQUNGLFlBQVk7QUFBQSxRQUNaLFdBQVc7QUFBQSxRQUNYLGVBQWU7QUFBQSxRQUNmLFlBQVk7QUFBQSxRQUNaLGdCQUFnQjtBQUFBLFFBQ2hCLGVBQWU7QUFBQSxRQUNmLG1CQUFtQjtBQUFBLE1BQ3BCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFlBQU0sT0FBTyxXQUFXLHlCQUF5QjtBQUFBLFFBQ2hELGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGNBQWM7QUFBQSxRQUNmO0FBQUEsTUFDRCxDQUFDLEdBQUcsd0JBQXdCLEtBQUssQ0FBQztBQUVsQyxZQUFNLGVBQWUseUJBQXlCO0FBQUEsUUFDN0MsWUFBWTtBQUFBLFFBQ1osbUJBQW1CO0FBQUEsTUFDcEIsQ0FBQztBQUNELE1BQUMsYUFBK0UsbUJBQW1CO0FBQUEsUUFDbEcsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFVBQ1osVUFBVTtBQUFBLFVBQ1YsWUFBWTtBQUFBLFVBQ1osWUFBWTtBQUFBLFFBQ2I7QUFBQSxRQUNBLFdBQVc7QUFBQSxRQUNYLFVBQVU7QUFBQSxNQUNYO0FBQ0EsV0FBSyxlQUFlLFlBQVk7QUFFaEMsYUFBTyxZQUFZLG1CQUFtQixJQUFJLEdBQUcsaUJBQWlCLDRCQUE0QjtBQUFBLElBQzNGLENBQUM7QUFFRCxTQUFLLHFFQUFxRSxNQUFNO0FBQy9FLFlBQU0saUJBQWlCLHlCQUF5QjtBQUNoRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFDL0MsWUFBTSxxQkFBcUIsS0FBSyxRQUFRLGNBQTJCLHFDQUFxQztBQUN4RyxZQUFNLG1CQUFtQixLQUFLLFFBQVEsY0FBMkIsMkNBQTJDO0FBQzVHLFlBQU0sVUFBVSxLQUFLLFFBQVEsY0FBYyxpQ0FBaUM7QUFDNUUsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxrQkFBa0I7QUFDNUIsYUFBTyxHQUFHLGdCQUFnQjtBQUMxQixhQUFPLEdBQUcsT0FBTztBQUNqQixhQUFPLEdBQUcsTUFBTTtBQUVoQixZQUFNLGlCQUFpQixpQkFBaUI7QUFDeEMsWUFBTSwyQkFBMkIsUUFBUSxVQUFVLFNBQVMsVUFBVTtBQUN0RSxhQUFPLE1BQU07QUFDYixZQUFNLCtCQUErQixLQUFLLFFBQVEsVUFBVSxTQUFTLG1DQUFtQztBQUN4RyxZQUFNLGdCQUFnQixJQUFJLFdBQVcsTUFBTSxlQUFlO0FBQzFELGFBQU8sZUFBZSxlQUFlLGdCQUFnQixFQUFFLE9BQU8scUJBQXFCLENBQUM7QUFDcEYseUJBQW1CLGNBQWMsYUFBYTtBQUM5QyxZQUFNLDhCQUE4QixLQUFLLFFBQVEsVUFBVSxTQUFTLG1DQUFtQztBQUN2Ryx1QkFBaUIsY0FBYyxJQUFJLFdBQVcsWUFBWSwyQkFBMkIsaUJBQWlCLEVBQUUsU0FBUyxLQUFLLENBQUMsQ0FBQztBQUV4SCxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQSxxQkFBcUIsQ0FBQyxLQUFLLFFBQVEsVUFBVSxTQUFTLG1DQUFtQztBQUFBLFFBQ3pGLGVBQWUsaUJBQWlCO0FBQUEsUUFDaEMseUJBQXlCLFFBQVEsVUFBVSxTQUFTLFVBQVU7QUFBQSxNQUMvRCxHQUFHO0FBQUEsUUFDRixnQkFBZ0I7QUFBQSxRQUNoQiwwQkFBMEI7QUFBQSxRQUMxQiw4QkFBOEI7QUFBQSxRQUM5Qiw2QkFBNkI7QUFBQSxRQUM3QixxQkFBcUI7QUFBQSxRQUNyQixlQUFlO0FBQUEsUUFDZix5QkFBeUI7QUFBQSxNQUMxQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxzRUFBc0UsWUFBWTtBQUN0RixZQUFNLE9BQU8sV0FBVyx5QkFBeUIsR0FBRyx3QkFBd0IsS0FBSyxDQUFDO0FBQ2xGLFlBQU0scUJBQXFCLEtBQUssUUFBUSxjQUEyQixxQ0FBcUM7QUFDeEcsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxrQkFBa0I7QUFDNUIsYUFBTyxHQUFHLE1BQU07QUFFaEIsYUFBTyxNQUFNO0FBQ2IseUJBQW1CLGdCQUFnQixNQUFNLENBQUM7QUFDMUMsWUFBTSxtQkFBbUIsSUFBSSxXQUFXLE1BQU0sa0JBQWtCO0FBQ2hFLGFBQU8sZUFBZSxrQkFBa0IsZ0JBQWdCLEVBQUUsT0FBTyxxQkFBcUIsQ0FBQztBQUN2Rix5QkFBbUIsY0FBYyxnQkFBZ0I7QUFDakQsWUFBTSxJQUFJLFFBQWMsYUFBVyxXQUFXLHNCQUFzQixNQUFNLFFBQVEsQ0FBQyxDQUFDO0FBRXBGLGFBQU8sWUFBWSxLQUFLLFFBQVEsVUFBVSxTQUFTLG1DQUFtQyxHQUFHLEtBQUs7QUFBQSxJQUMvRixDQUFDO0FBRUQsU0FBSyxpRkFBaUYsTUFBTTtBQUMzRixZQUFNLGlCQUFpQix5QkFBeUIsRUFBRSxXQUFXLG9CQUFvQixVQUFVLFVBQVUsQ0FBQztBQUN0RyxZQUFNLFVBQVUsd0JBQXdCLElBQUk7QUFFNUMsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsYUFBTyxHQUFHLEtBQUssUUFBUSxjQUFjLDhCQUE4QixDQUFDO0FBQUEsSUFDckUsQ0FBQztBQUVELFNBQUssaUZBQWlGLE1BQU07QUFDM0YsWUFBTSxpQkFBaUIsbUNBQW1DO0FBQUEsUUFDekQsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFFBQ2Q7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixVQUFVLEtBQUssWUFBWTtBQUFBLFFBQzNCLFlBQVksQ0FBQyxDQUFDLEtBQUssUUFBUSxjQUFjLDhCQUE4QjtBQUFBLE1BQ3hFLEdBQUc7QUFBQSxRQUNGLFVBQVU7QUFBQSxRQUNWLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHNGQUFzRixNQUFNO0FBQ2hHLFlBQU0saUJBQWlCLG1DQUFtQztBQUFBLFFBQ3pELGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLFVBQVU7QUFBQSxVQUNWLGFBQWE7QUFBQSxRQUNkO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRS9DLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsVUFBVSxLQUFLLFlBQVk7QUFBQSxRQUMzQixZQUFZLENBQUMsQ0FBQyxLQUFLLFFBQVEsY0FBYyw4QkFBOEI7QUFBQSxNQUN4RSxHQUFHO0FBQUEsUUFDRixVQUFVO0FBQUEsUUFDVixZQUFZO0FBQUEsTUFDYixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywwQkFBMEIsTUFBTTtBQUNwQyxZQUFNLGlCQUFpQix5QkFBeUI7QUFDaEQsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRS9DLGFBQU8sR0FBRyxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QixHQUFHLGdDQUFnQztBQUFBLElBQzNHLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLG9CQUFvQixNQUFNO0FBQy9CLFNBQUssOERBQThELE1BQU07QUFDeEUsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0Msa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFFBQ1Q7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLDZCQUE2QjtBQUMvQyxZQUFNLGVBQWUsdUJBQXVCLE1BQU07QUFDbEQsWUFBTSxhQUFhLGNBQWMsZUFBZSxPQUFPLGVBQWU7QUFDdEUsYUFBTyxHQUFHLFdBQVcsU0FBUyxpQkFBaUIsR0FBRyxpQ0FBaUM7QUFDbkYsYUFBTyxHQUFHLFdBQVcsU0FBUyx3QkFBd0IsR0FBRyxrQ0FBa0M7QUFBQSxJQUM1RixDQUFDO0FBRUQsU0FBSyw0REFBNEQsTUFBTTtBQUN0RSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUE7QUFBQSxRQUVkO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRS9DLFlBQU0sU0FBUyxrQkFBa0IsSUFBSTtBQUNyQyxhQUFPLEdBQUcsUUFBUSw2QkFBNkI7QUFDL0MsWUFBTSxlQUFlLHVCQUF1QixNQUFNO0FBQ2xELFlBQU0sYUFBYSxjQUFjLGVBQWUsT0FBTyxlQUFlO0FBQ3RFLGFBQU8sR0FBRyxXQUFXLFNBQVMsV0FBVyxHQUFHLDBDQUEwQztBQUFBLElBQ3ZGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHlCQUF5QixNQUFNO0FBUXBDLGFBQVMsYUFBYSxNQUF1QztBQUM1RCxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsYUFBTyxHQUFHLFFBQVEsNkJBQTZCO0FBQy9DLFlBQU0sZUFBZSx1QkFBdUIsTUFBTTtBQUNsRCxhQUFPLGNBQWMsZUFBZSxPQUFPLGVBQWU7QUFBQSxJQUMzRDtBQUVBLGFBQVMsaUJBQWlCLGdCQUFvRztBQUM3SCxhQUFPLGVBQWU7QUFBQSxJQUN2QjtBQUVBLGFBQVMsb0JBQW9CLGdCQUFxQyxNQUE2QztBQUM5RyxNQUFDLGVBQXlFLG1CQUFtQjtBQUFBLElBQzlGO0FBRUEsU0FBSyw2REFBNkQsTUFBTTtBQUN2RSxZQUFNLGlCQUFpQix5QkFBeUIsRUFBRSxtQkFBbUIsUUFBUSxDQUFDO0FBQzlFLFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUM3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxVQUFJLFdBQVc7QUFDZixNQUFDLEtBQStELHNCQUFzQixJQUFJLEVBQUUsU0FBUyxNQUFNO0FBQUUsbUJBQVc7QUFBQSxNQUFNLEVBQUUsQ0FBQztBQUdqSSxXQUFLLGVBQWUseUJBQXlCLEVBQUUsbUJBQW1CLFNBQVMsQ0FBQyxDQUFDO0FBRTdFLGFBQU8sWUFBWSxVQUFVLE1BQU0seURBQXlEO0FBQUEsSUFDN0YsQ0FBQztBQUVELFNBQUssb0dBQTBGLE1BQU07QUFDcEcsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0MsV0FBVyxvQkFBb0IsVUFBVTtBQUFBLFFBQ3pDLGtCQUFrQjtBQUFBLFVBQUUsTUFBTTtBQUFBO0FBQUEsUUFBOEM7QUFBQSxNQUN6RSxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBQzdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRS9DLGFBQU8sR0FBRyxhQUFhLElBQUksRUFBRSxTQUFTLFdBQVcsR0FBRyx3Q0FBd0M7QUFHNUYsMEJBQW9CLGdCQUFnQixFQUFFLE1BQU0sWUFBWSxhQUFhLHlCQUF5QixDQUFDO0FBQy9GLHVCQUFpQixjQUFjLEVBQUUsSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBRXBHLGFBQU8sR0FBRyxhQUFhLElBQUksRUFBRSxTQUFTLHdCQUF3QixHQUFHLDBDQUEwQztBQUFBLElBQzVHLENBQUM7QUFFRCxTQUFLLGlHQUF1RixNQUFNO0FBQ2pHLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLFdBQVcsb0JBQW9CLFVBQVU7QUFBQSxRQUN6QyxrQkFBa0I7QUFBQSxVQUFFLE1BQU07QUFBQSxVQUFZLGFBQWE7QUFBQTtBQUFBLFFBQTRDO0FBQUEsTUFDaEcsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUM3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxhQUFPLEdBQUcsYUFBYSxJQUFJLEVBQUUsU0FBUyx3QkFBd0IsR0FBRyw4Q0FBOEM7QUFDL0csYUFBTyxHQUFHLENBQUMsYUFBYSxJQUFJLEVBQUUsU0FBUyxpQkFBaUIsR0FBRyxzQ0FBc0M7QUFJakcsMEJBQW9CLGdCQUFnQixFQUFFLE1BQU0sWUFBWSxhQUFhLDBCQUEwQixXQUFXLGtCQUFrQixDQUFDO0FBQzdILHVCQUFpQixjQUFjLEVBQUUsSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBRXBHLGFBQU8sR0FBRyxhQUFhLElBQUksRUFBRSxTQUFTLGlCQUFpQixHQUFHLHlDQUF5QztBQUFBLElBQ3BHLENBQUM7QUFFRCxTQUFLLGlGQUF1RSxNQUFNO0FBQ2pGLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLFdBQVcsb0JBQW9CLFVBQVU7QUFBQSxRQUN6QyxrQkFBa0IsRUFBRSxNQUFNLFlBQVksYUFBYSwwQkFBMEIsV0FBVyxrQkFBa0I7QUFBQSxNQUMzRyxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBQzdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRS9DLGFBQU8sR0FBRyxhQUFhLElBQUksRUFBRSxTQUFTLGlCQUFpQixHQUFHLHdDQUF3QztBQUlsRywwQkFBb0IsZ0JBQWdCLEVBQUUsTUFBTSxZQUFZLGFBQWEseUJBQXlCLENBQUM7QUFDL0YsdUJBQWlCLGNBQWMsRUFBRSxJQUFJLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxHQUFHLE1BQVM7QUFFcEcsYUFBTyxHQUFHLGFBQWEsSUFBSSxFQUFFLFNBQVMsaUJBQWlCLEdBQUcsd0NBQXdDO0FBQUEsSUFDbkcsQ0FBQztBQUVELFNBQUssaUZBQXVFLE1BQU07QUFDakYsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0MsV0FBVyxvQkFBb0IsVUFBVTtBQUFBLFFBQ3pDLGtCQUFrQixFQUFFLE1BQU0sWUFBWSxhQUFhLDBCQUEwQixXQUFXLGtCQUFrQjtBQUFBLE1BQzNHLENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFDN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsWUFBTSxTQUFTLGFBQWEsSUFBSTtBQUdoQyx1QkFBaUIsY0FBYyxFQUFFLElBQUksWUFBWSxvQkFBb0IsVUFBVSxTQUFTLEdBQUcsTUFBUztBQUVwRyxhQUFPLFlBQVksYUFBYSxJQUFJLEdBQUcsUUFBUSxvREFBb0Q7QUFBQSxJQUNwRyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxvQkFBb0IsTUFBTTtBQUMvQixTQUFLLDBCQUEwQixNQUFNO0FBQ3BDLFlBQU0saUJBQWlCLHlCQUF5QjtBQUNoRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsYUFBTyxZQUFZLEtBQUssWUFBWSxHQUFHLE1BQU0sd0JBQXdCO0FBQUEsSUFDdEUsQ0FBQztBQUVELFNBQUssK0NBQStDLE1BQU07QUFDekQsWUFBTSxpQkFBaUIseUJBQXlCO0FBQ2hELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxXQUFLLGVBQWU7QUFFcEIsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixVQUFVLEtBQUssWUFBWTtBQUFBLFFBQzNCLGtCQUFrQixLQUFLLFFBQVEsVUFBVSxTQUFTLG1DQUFtQztBQUFBLE1BQ3RGLEdBQUc7QUFBQSxRQUNGLFVBQVU7QUFBQSxRQUNWLGtCQUFrQjtBQUFBLE1BQ25CLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHVFQUF1RSxNQUFNO0FBQ2pGLFlBQU0sbUJBQW9EO0FBQUEsUUFDekQsTUFBTTtBQUFBLFFBQ04sVUFBVTtBQUFBLFFBQ1YsYUFBYTtBQUFBLFFBQ2IsY0FBYztBQUFBLFFBQ2QsV0FBVyxLQUFLLElBQUksSUFBSTtBQUFBLE1BQ3pCO0FBQ0EsWUFBTSxPQUFPLFdBQVcseUJBQXlCLEVBQUUsaUJBQWlCLENBQUMsR0FBRyx3QkFBd0IsS0FBSyxDQUFDO0FBRXRHLFdBQUssZUFBZSxJQUFJO0FBRXhCLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsVUFBVSxpQkFBaUI7QUFBQSxRQUMzQixhQUFhLE9BQU8saUJBQWlCLGFBQWEsWUFBWSxpQkFBaUIsWUFBWTtBQUFBLFFBQzNGLGlCQUFpQixtQkFBbUIsSUFBSSxHQUFHO0FBQUEsTUFDNUMsR0FBRztBQUFBLFFBQ0YsVUFBVTtBQUFBLFFBQ1YsYUFBYTtBQUFBLFFBQ2IsaUJBQWlCLGlCQUFpQjtBQUFBLE1BQ25DLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFlBQU0sbUJBQW9EO0FBQUEsUUFDekQsTUFBTTtBQUFBLFFBQ04sVUFBVTtBQUFBLFFBQ1YsYUFBYTtBQUFBLFFBQ2IsY0FBYztBQUFBLFFBQ2QsV0FBVyxLQUFLLElBQUksSUFBSTtBQUFBLE1BQ3pCO0FBQ0EsWUFBTSxPQUFPLFdBQVcsbUNBQW1DO0FBQUEsUUFDMUQ7QUFBQSxRQUNBLFlBQVk7QUFBQSxNQUNiLENBQUMsR0FBRyx3QkFBd0IsSUFBSSxDQUFDO0FBRWpDLFdBQUssZUFBZSxJQUFJO0FBRXhCLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsVUFBVSxpQkFBaUI7QUFBQSxRQUMzQixhQUFhLE9BQU8saUJBQWlCLGFBQWEsWUFBWSxpQkFBaUIsWUFBWTtBQUFBLFFBQzNGLGlCQUFpQixtQkFBbUIsSUFBSSxHQUFHO0FBQUEsTUFDNUMsR0FBRztBQUFBLFFBQ0YsVUFBVTtBQUFBLFFBQ1YsYUFBYTtBQUFBLFFBQ2IsaUJBQWlCLGlCQUFpQjtBQUFBLE1BQ25DLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLCtEQUErRCxNQUFNO0FBQ3pFLFlBQU0sY0FBYyxZQUFZLElBQUksSUFBSSxRQUF1QyxDQUFDO0FBQ2hGLFVBQUksYUFBYTtBQUNqQixZQUFNLGNBQWMsd0JBQXdCLEtBQUs7QUFDakQsWUFBTSxjQUFjLFlBQVk7QUFDaEMsWUFBTSxVQUF5QztBQUFBLFFBQzlDLEdBQUc7QUFBQSxRQUNILFNBQVM7QUFBQSxVQUNSLEdBQUc7QUFBQSxVQUNILE9BQU87QUFBQSxZQUNOLEdBQUcsWUFBWTtBQUFBLFlBQ2YsYUFBYSxZQUFZO0FBQUEsVUFDMUI7QUFBQSxVQUNBLElBQUksYUFBYTtBQUFFLG1CQUFPO0FBQUEsVUFBWTtBQUFBLFVBQ3RDLElBQUksYUFBYTtBQUFFLG1CQUFPO0FBQUEsVUFBTztBQUFBLFVBQ2pDLFNBQVMsTUFBTTtBQUFBLFVBQUU7QUFBQSxRQUNsQjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLG1CQUFvRDtBQUFBLFFBQ3pELE1BQU07QUFBQSxRQUNOLFVBQVU7QUFBQSxRQUNWLGFBQWE7QUFBQSxRQUNiLGNBQWM7QUFBQSxRQUNkLFdBQVcsS0FBSyxJQUFJLElBQUk7QUFBQSxNQUN6QjtBQUNBLFlBQU0sT0FBTyxXQUFXLHlCQUF5QixFQUFFLGlCQUFpQixDQUFDLEdBQUcsT0FBTztBQUUvRSxtQkFBYTtBQUNiLGtCQUFZLEtBQUssRUFBRSxRQUFRLG1CQUFtQixDQUFDO0FBRS9DLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsVUFBVSxLQUFLLFlBQVk7QUFBQSxRQUMzQixjQUFjLGlCQUFpQjtBQUFBLFFBQy9CLGFBQWEsT0FBTyxpQkFBaUIsYUFBYSxZQUFZLGlCQUFpQixZQUFZO0FBQUEsTUFDNUYsR0FBRztBQUFBLFFBQ0YsVUFBVTtBQUFBLFFBQ1YsY0FBYztBQUFBLFFBQ2QsYUFBYTtBQUFBLE1BQ2QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssZ0RBQWdELE1BQU07QUFDMUQsWUFBTSxpQkFBaUIseUJBQXlCO0FBQ2hELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsY0FBUSxNQUFNO0FBRWQsV0FBSyxlQUFlO0FBRXBCLFlBQU0sVUFBVSxrQkFBa0IsSUFBSTtBQUN0QyxVQUFJLFNBQVM7QUFDWixlQUFPO0FBQUEsVUFBWSxRQUFRLFVBQVUsU0FBUyx5QkFBeUI7QUFBQSxVQUFHO0FBQUEsVUFDekU7QUFBQSxRQUF3RDtBQUFBLE1BQzFEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSywyQ0FBMkMsTUFBTTtBQUNyRCxZQUFNLGlCQUFpQix5QkFBeUI7QUFDaEQsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLFlBQU0sU0FBUyxrQkFBa0IsSUFBSTtBQUNyQyxjQUFRLE1BQU07QUFHZCxhQUFPLFlBQVksS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRyxLQUFLO0FBRXhGLFdBQUssZUFBZTtBQUdwQixhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRywwQ0FBMEM7QUFBQSxJQUNySCxDQUFDO0FBRUQsU0FBSyxrRUFBa0UsTUFBTTtBQUM1RSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUE7QUFBQSxRQUVQO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLFlBQU0sU0FBUyxrQkFBa0IsSUFBSTtBQUNyQyxhQUFPLEdBQUcsUUFBUSw2QkFBNkI7QUFDL0MsWUFBTSxjQUFjLHVCQUF1QixNQUFNO0FBQ2pELFlBQU0sYUFBYSxhQUFhLGVBQWUsT0FBTyxlQUFlO0FBQ3JFLGFBQU8sR0FBRyxXQUFXLFNBQVMsa0JBQWtCLEdBQUcsd0RBQXdEO0FBRTNHLFdBQUssZUFBZTtBQUdwQixZQUFNLGFBQWEsdUJBQXVCLE1BQU07QUFDaEQsWUFBTSxZQUFZLFlBQVksZUFBZSxPQUFPLGVBQWU7QUFDbkUsYUFBTyxHQUFHLFVBQVUsU0FBUyxjQUFjLEdBQUcsbURBQW1EO0FBQ2pHLGFBQU8sR0FBRyxDQUFDLFVBQVUsU0FBUyxrQkFBa0IsR0FBRyxnREFBZ0Q7QUFBQSxJQUNwRyxDQUFDO0FBRUQsU0FBSywyREFBMkQsTUFBTTtBQUNyRSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxXQUFLLGVBQWU7QUFHcEIsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLDZCQUE2QjtBQUMvQyxZQUFNLFFBQVEsdUJBQXVCLE1BQU07QUFDM0MsWUFBTSxPQUFPLE9BQU8sZUFBZSxPQUFPLGVBQWU7QUFDekQsYUFBTyxHQUFHLEtBQUssU0FBUyx3QkFBd0IsR0FBRyx1REFBdUQ7QUFBQSxJQUMzRyxDQUFDO0FBRUQsU0FBSyxvREFBb0QsTUFBTTtBQUU5RCxZQUFNLGdCQUFnQixxQkFBcUIsSUFBSSxxQkFBcUI7QUFDcEUsb0JBQWMscUJBQXFCLGdDQUFnQyxvQkFBb0IsSUFBSTtBQUUzRixZQUFNLGlCQUFpQix5QkFBeUI7QUFDaEQsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRS9DLFdBQUssY0FBYztBQUduQixZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsYUFBTyxHQUFHLFFBQVEsNkJBQTZCO0FBQy9DLFlBQU0sY0FBYyxzQkFBc0IsTUFBTTtBQUNoRCxhQUFPLEdBQUcsYUFBYSxVQUFVLFNBQVMsZUFBZSxHQUFHLDJDQUEyQztBQUFBLElBQ3hHLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHlCQUF5QixNQUFNO0FBQ3BDLFNBQUssNENBQTRDLE1BQU07QUFDdEQsWUFBTSx1QkFBdUIsbUNBQW1DO0FBQUEsUUFDL0Qsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFVBQ1IsUUFBUTtBQUFBLFFBQ1Q7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLElBQUk7QUFFNUMsWUFBTSxPQUFPLFdBQVcsc0JBQXNCLE9BQU87QUFHckQsYUFBTyxZQUFZLEtBQUssWUFBWSxHQUFHLE9BQU8sMENBQTBDO0FBQUEsSUFDekYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sa0JBQWtCLE1BQU07QUFDN0IsU0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxZQUFNLGlCQUFpQix5QkFBeUIsRUFBRSxzQkFBc0IsZUFBZSxDQUFDO0FBQ3hGLFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxZQUFNLGtCQUFrQix5QkFBeUI7QUFBQSxRQUNoRCxRQUFRO0FBQUEsUUFDUixzQkFBc0I7QUFBQSxNQUN2QixDQUFDO0FBRUQsWUFBTSxTQUFTLEtBQUssZUFBZSxpQkFBaUIsQ0FBQyxHQUFHLFFBQVEsT0FBTztBQUN2RSxhQUFPLFlBQVksUUFBUSxLQUFLO0FBQUEsSUFDakMsQ0FBQztBQUVELFNBQUssK0VBQStFLE1BQU07QUFDekYsWUFBTSxpQkFBaUIseUJBQXlCLEVBQUUsc0JBQXNCLGVBQWUsQ0FBQztBQUN4RixZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsWUFBTSxrQkFBa0IseUJBQXlCO0FBQUEsUUFDaEQsUUFBUTtBQUFBLFFBQ1Isc0JBQXNCO0FBQUEsTUFDdkIsQ0FBQztBQUVELFlBQU0sU0FBUyxLQUFLLGVBQWUsaUJBQWlCLENBQUMsR0FBRyxRQUFRLE9BQU87QUFDdkUsYUFBTyxZQUFZLFFBQVEsT0FBTyxzRUFBc0U7QUFBQSxJQUN6RyxDQUFDO0FBRUQsU0FBSyw0RUFBNEUsTUFBTTtBQUN0RixZQUFNLG1CQUFtQjtBQUN6QixZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxRQUFRLGdCQUFnQjtBQUFBLFFBQ3hCLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLFNBQVMsZUFBZSxVQUFVO0FBRTFFLFlBQU0sa0JBQWtCLHlCQUF5QjtBQUFBLFFBQ2hELFFBQVEsZ0JBQWdCO0FBQUEsUUFDeEIsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUVELFlBQU0sU0FBUyxLQUFLLGVBQWUsaUJBQWlCLENBQUMsR0FBRyxRQUFRLE9BQU87QUFDdkUsYUFBTyxZQUFZLFFBQVEsTUFBTSxnRUFBZ0U7QUFBQSxJQUNsRyxDQUFDO0FBRUQsU0FBSyx5REFBeUQsTUFBTTtBQUNuRSxZQUFNLGlCQUFpQix5QkFBeUIsRUFBRSxZQUFZLGVBQWUsQ0FBQztBQUM5RSxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsWUFBTSxrQkFBd0M7QUFBQSxRQUM3QyxNQUFNO0FBQUEsUUFDTixTQUFTLEVBQUUsT0FBTyxvR0FBb0c7QUFBQSxNQUN2SDtBQUVBLFlBQU0sU0FBUyxLQUFLLGVBQWUsaUJBQWlCLENBQUMsR0FBRyxRQUFRLE9BQU87QUFDdkUsYUFBTyxZQUFZLFFBQVEsS0FBSztBQUFBLElBQ2pDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHNCQUFzQixNQUFNO0FBQ2pDLFNBQUssK0NBQStDLE1BQU07QUFDekQsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0MsV0FBVyxvQkFBb0IsVUFBVTtBQUFBLE1BQzFDLENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFHL0MsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLDZCQUE2QjtBQUMvQyxZQUFNLGNBQWMsc0JBQXNCLE1BQU07QUFDaEQsYUFBTyxHQUFHLGFBQWEsVUFBVSxTQUFTLHVCQUF1QixHQUFHLGdEQUFnRDtBQUFBLElBQ3JILENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLG1CQUFtQixNQUFNO0FBQzlCLFNBQUssa0RBQWtELE1BQU07QUFDNUQsWUFBTSxpQkFBaUIseUJBQXlCO0FBQ2hELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsQ0FBQztBQUd4RSxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsYUFBTyxHQUFHLFFBQVEsMkJBQTJCO0FBQzdDLGFBQU8sTUFBTTtBQUdiLGFBQU87QUFBQSxRQUFZLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCO0FBQUEsUUFBRztBQUFBLFFBQ2xGO0FBQUEsTUFBMEM7QUFHM0MsYUFBTyxNQUFNO0FBR2IsYUFBTztBQUFBLFFBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkI7QUFBQSxRQUN0RTtBQUFBLE1BQWlEO0FBQUEsSUFDbkQsQ0FBQztBQUVELFNBQUssOENBQThDLE1BQU07QUFDeEQsWUFBTSxpQkFBaUIseUJBQXlCO0FBQ2hELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsYUFBTyxHQUFHLFFBQVEscUJBQXFCO0FBQ3ZDLGFBQU8sWUFBWSxPQUFPLGFBQWEsZUFBZSxHQUFHLFNBQVMsa0RBQWtEO0FBR3BILGFBQU8sTUFBTTtBQUViLGFBQU8sWUFBWSxPQUFPLGFBQWEsZUFBZSxHQUFHLFFBQVEsZ0RBQWdEO0FBQUEsSUFDbEgsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sa0JBQWtCLE1BQU07QUFDN0IsU0FBSywrRUFBK0UsTUFBTTtBQUN6RixZQUFNLHVCQUF1QixtQ0FBbUM7QUFBQSxRQUMvRCxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsVUFDUixRQUFRO0FBQUEsUUFDVDtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsSUFBSTtBQUU1QyxZQUFNLE9BQU8sV0FBVyxzQkFBc0IsT0FBTztBQUlyRCxhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRywrQkFBK0I7QUFHekcsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLDRCQUE0QjtBQUM5QyxhQUFPLE1BQU07QUFHYixhQUFPLFlBQVksS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRyxPQUFPLG9CQUFvQjtBQUc5RyxZQUFNLGlCQUFpQixLQUFLLFFBQVEsY0FBYyx5QkFBeUI7QUFDM0UsYUFBTyxHQUFHLGdCQUFnQiwyQ0FBMkM7QUFHckUsWUFBTSxXQUFXLGVBQWUsaUJBQWlCLHdCQUF3QjtBQUN6RSxhQUFPLEdBQUcsU0FBUyxVQUFVLEdBQUcscURBQXFEO0FBQUEsSUFDdEYsQ0FBQztBQUVELFNBQUssaUZBQWlGLE1BQU07QUFDM0YsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0Msa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFFBQ1Q7QUFBQSxRQUNBLFdBQVcsb0JBQW9CLFVBQVU7QUFBQSxNQUMxQyxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLGFBQU8sR0FBRyxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QixHQUFHLG1DQUFtQztBQUc3RyxZQUFNLGlCQUFpQixLQUFLLFFBQVEsY0FBYyx5QkFBeUI7QUFDM0UsYUFBTyxZQUFZLGdCQUFnQixNQUFNLG9FQUFvRTtBQUFBLElBQzlHLENBQUM7QUFFRCxTQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFdBQVc7QUFBQSxVQUNYLFFBQVE7QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXLG9CQUFvQixVQUFVO0FBQUEsTUFDMUMsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRywrQkFBK0I7QUFDekcsVUFBSSxpQkFBaUIsS0FBSyxRQUFRLGNBQWMseUJBQXlCO0FBQ3pFLGFBQU8sWUFBWSxnQkFBZ0IsTUFBTSxvQ0FBb0M7QUFHN0UsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLDRCQUE0QjtBQUM5QyxhQUFPLE1BQU07QUFHYix1QkFBaUIsS0FBSyxRQUFRLGNBQWMseUJBQXlCO0FBQ3JFLGFBQU8sR0FBRyxnQkFBZ0IsbUNBQW1DO0FBRzdELFlBQU0sZ0JBQWdCLGVBQWUsY0FBYyx3QkFBd0I7QUFDM0UsYUFBTyxHQUFHLGVBQWUsK0NBQStDO0FBQUEsSUFDekUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0saUNBQWlDLE1BQU07QUFDNUMsU0FBSyxvRUFBb0UsTUFBTTtBQUM5RSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxZQUFNLFlBQVkseUJBQXlCO0FBQUEsUUFDMUMsUUFBUTtBQUFBLFFBQ1Isc0JBQXNCLGVBQWU7QUFBQSxRQUNyQyxXQUFXLG9CQUFvQixVQUFVO0FBQUEsUUFDekMsbUJBQW1CO0FBQUEsTUFDcEIsQ0FBQztBQUVELFdBQUsscUJBQXFCLFdBQVcsQ0FBQztBQUd0QyxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsYUFBTyxHQUFHLFFBQVEsNkJBQTZCO0FBQy9DLFlBQU0sZUFBZSx1QkFBdUIsTUFBTTtBQUNsRCxZQUFNLGFBQWEsY0FBYyxlQUFlLE9BQU8sZUFBZTtBQUN0RSxhQUFPLEdBQUcsV0FBVyxTQUFTLG1CQUFtQixHQUFHLG1EQUFtRDtBQUFBLElBQ3hHLENBQUM7QUFFRCxTQUFLLHlEQUF5RCxNQUFNO0FBQ25FLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFdBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLFlBQU0sWUFBWSx5QkFBeUI7QUFBQSxRQUMxQyxRQUFRO0FBQUEsUUFDUixzQkFBc0IsZUFBZTtBQUFBLFFBQ3JDLFdBQVcsb0JBQW9CLFVBQVU7QUFBQSxRQUN6QyxtQkFBbUI7QUFBQSxNQUNwQixDQUFDO0FBQ0QsV0FBSyxxQkFBcUIsV0FBVyxDQUFDO0FBR3RDLFlBQU0sYUFBYSx5QkFBeUI7QUFBQSxRQUMzQyxRQUFRO0FBQUEsUUFDUixzQkFBc0IsZUFBZTtBQUFBLFFBQ3JDLFdBQVcsb0JBQW9CLFVBQVU7QUFBQSxRQUN6QyxtQkFBbUI7QUFBQSxNQUNwQixDQUFDO0FBQ0QsV0FBSyxxQkFBcUIsWUFBWSxDQUFDO0FBRXZDLFlBQU0sU0FBUyxrQkFBa0IsSUFBSTtBQUNyQyxhQUFPLEdBQUcsUUFBUSw2QkFBNkI7QUFDL0MsWUFBTSxlQUFlLHVCQUF1QixNQUFNO0FBQ2xELFlBQU0sYUFBYSxjQUFjLGVBQWUsT0FBTyxlQUFlO0FBRXRFLGFBQU8sR0FBRyxXQUFXLFNBQVMsd0JBQXdCLEdBQUcsMENBQTBDO0FBQUEsSUFDcEcsQ0FBQztBQUVELFNBQUssZ0VBQWdFLE1BQU07QUFDMUUsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0Msa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFFBQ1o7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFHL0MsWUFBTSxpQkFBaUIsZ0JBQWdCLFNBQVMsWUFBWSxvQkFBb0IsVUFBVSxTQUFTLENBQUM7QUFDcEcsWUFBTSxZQUFpQztBQUFBLFFBQ3RDLEdBQUcseUJBQXlCO0FBQUEsVUFDM0IsUUFBUTtBQUFBLFVBQ1Isc0JBQXNCLGVBQWU7QUFBQSxRQUN0QyxDQUFDO0FBQUEsUUFDRCxPQUFPO0FBQUEsUUFDUCxtQkFBbUI7QUFBQSxNQUNwQjtBQUNBLFdBQUssZUFBZSxTQUFTO0FBRzdCLFlBQU0sa0JBQWtCLGdCQUFnQixTQUFTLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxDQUFDO0FBQ3JHLFlBQU0sYUFBa0M7QUFBQSxRQUN2QyxHQUFHLHlCQUF5QjtBQUFBLFVBQzNCLFFBQVE7QUFBQSxVQUNSLHNCQUFzQixlQUFlO0FBQUEsUUFDdEMsQ0FBQztBQUFBLFFBQ0QsT0FBTztBQUFBLFFBQ1AsbUJBQW1CO0FBQUEsTUFDcEI7QUFDQSxXQUFLLGVBQWUsVUFBVTtBQUc5QixZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsYUFBTyxHQUFHLFFBQVEscUJBQXFCO0FBQ3ZDLFlBQU0sZUFBZSx1QkFBdUIsTUFBTTtBQUNsRCxVQUFJLGFBQWEsY0FBYyxlQUFlLFFBQVEsZUFBZTtBQUNyRSxhQUFPLEdBQUcsV0FBVyxTQUFTLHdCQUF3QixHQUFHLCtCQUErQjtBQUd4RixxQkFBZSxJQUFJLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxHQUFHLE1BQVM7QUFHbEYsbUJBQWEsY0FBYyxlQUFlLFFBQVEsZUFBZTtBQUNqRSxhQUFPLEdBQUcsV0FBVyxTQUFTLHdCQUF3QixHQUFHLDJEQUEyRDtBQUFBLElBQ3JILENBQUM7QUFFRCxTQUFLLDRDQUE0QyxNQUFNO0FBQ3RELFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFdBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLFlBQU0sWUFBWSxnQkFBZ0IsU0FBUyxZQUFZLG9CQUFvQixVQUFVLFNBQVMsQ0FBQztBQUMvRixZQUFNLFlBQWlDO0FBQUEsUUFDdEMsR0FBRyx5QkFBeUI7QUFBQSxVQUMzQixRQUFRO0FBQUEsVUFDUixzQkFBc0IsZUFBZTtBQUFBLFFBQ3RDLENBQUM7QUFBQSxRQUNELE9BQU87QUFBQSxRQUNQLG1CQUFtQjtBQUFBLE1BQ3BCO0FBQ0EsV0FBSyxlQUFlLFNBQVM7QUFHN0IsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLHFCQUFxQjtBQUN2QyxZQUFNLGVBQWUsdUJBQXVCLE1BQU07QUFDbEQsVUFBSSxhQUFhLGNBQWMsZUFBZSxRQUFRLGVBQWU7QUFDckUsYUFBTyxHQUFHLFdBQVcsU0FBUyxpQkFBaUIsR0FBRyxpREFBaUQ7QUFHbkcsZ0JBQVUsSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBRzdFLG1CQUFhLGNBQWMsZUFBZSxRQUFRLGVBQWU7QUFDakUsYUFBTztBQUFBLFFBQUcsV0FBVyxTQUFTLGlCQUFpQjtBQUFBLFFBQzlDO0FBQUEsTUFBNEQ7QUFBQSxJQUM5RCxDQUFDO0FBRUQsU0FBSyxrRUFBa0UsTUFBTTtBQUM1RSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxZQUFNLGlCQUFpQixnQkFBZ0IsU0FBUyxZQUFZLG9CQUFvQixVQUFVLFNBQVMsQ0FBQztBQUNwRyxZQUFNLFlBQWlDO0FBQUEsUUFDdEMsR0FBRyx5QkFBeUI7QUFBQSxVQUMzQixRQUFRO0FBQUEsVUFDUixzQkFBc0IsZUFBZTtBQUFBLFFBQ3RDLENBQUM7QUFBQSxRQUNELE9BQU87QUFBQSxRQUNQLG1CQUFtQjtBQUFBLE1BQ3BCO0FBQ0EsV0FBSyxlQUFlLFNBQVM7QUFHN0IsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLHFCQUFxQjtBQUN2QyxZQUFNLGVBQWUsdUJBQXVCLE1BQU07QUFDbEQsVUFBSSxhQUFhLGNBQWMsZUFBZSxRQUFRLGVBQWU7QUFDckUsYUFBTyxHQUFHLFdBQVcsU0FBUyxrQkFBa0IsR0FBRyw4QkFBOEI7QUFHakYsWUFBTSxrQkFBa0IsZ0JBQWdCLFNBQVMsWUFBWSxvQkFBb0IsVUFBVSxTQUFTLENBQUM7QUFDckcsWUFBTSxhQUFrQztBQUFBLFFBQ3ZDLEdBQUcseUJBQXlCO0FBQUEsVUFDM0IsUUFBUTtBQUFBLFVBQ1Isc0JBQXNCLGVBQWU7QUFBQSxRQUN0QyxDQUFDO0FBQUEsUUFDRCxPQUFPO0FBQUEsUUFDUCxtQkFBbUI7QUFBQSxNQUNwQjtBQUNBLFdBQUssZUFBZSxVQUFVO0FBRzlCLG1CQUFhLGNBQWMsZUFBZSxRQUFRLGVBQWU7QUFDakUsYUFBTyxHQUFHLFdBQVcsU0FBUyx3QkFBd0IsR0FBRywrQkFBK0I7QUFHeEYsc0JBQWdCLElBQUksWUFBWSxvQkFBb0IsVUFBVSxTQUFTLEdBQUcsTUFBUztBQUduRixtQkFBYSxjQUFjLGVBQWUsUUFBUSxlQUFlO0FBQ2pFLGFBQU87QUFBQSxRQUFHLFdBQVcsU0FBUyx3QkFBd0I7QUFBQSxRQUNyRDtBQUFBLE1BQTREO0FBQUEsSUFDOUQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sc0JBQXNCLE1BQU07QUFDakMsU0FBSyx5REFBeUQsTUFBTTtBQUNuRSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxzQkFBc0I7QUFBQSxRQUN0QixrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsY0FBUSxNQUFNO0FBQ2QsYUFBTyxZQUFZLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCLEdBQUcsT0FBTyxvQkFBb0I7QUFHOUcsWUFBTSxrQkFBd0M7QUFBQSxRQUM3QyxNQUFNO0FBQUEsUUFDTixTQUFTLEVBQUUsT0FBTyxpQkFBaUI7QUFBQSxNQUNwQztBQUdBLFlBQU0sa0JBQWtCLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDL0Qsc0JBQWdCLFlBQVk7QUFDNUIsc0JBQWdCLGNBQWM7QUFFOUIsVUFBSSxtQkFBbUI7QUFDdkIsWUFBTSxpQkFBaUIsRUFBRSxTQUFTLE1BQU07QUFBRTtBQUFBLE1BQW9CLEVBQUU7QUFHaEUsV0FBSztBQUFBLFFBQ0osT0FBTyxFQUFFLFNBQVMsaUJBQWlCLFlBQVksZUFBZTtBQUFBLFFBQzlEO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBR0EsWUFBTSxVQUFVLGtCQUFrQixJQUFJO0FBQ3RDLGFBQU8sR0FBRyxTQUFTLHNCQUFzQjtBQUN6QyxZQUFNLGtCQUFrQixRQUFRLGNBQWMsd0JBQXdCO0FBQ3RFLGFBQU8sR0FBRyxpQkFBaUIsbURBQW1EO0FBQzlFLGFBQU8sWUFBWSxnQkFBZ0IsYUFBYSxXQUFXLDZCQUE2QjtBQUFBLElBQ3pGLENBQUM7QUFFRCxTQUFLLDBEQUEwRCxNQUFNO0FBQ3BFLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLHNCQUFzQjtBQUFBLFFBQ3RCLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFdBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLGFBQU8sR0FBRyxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QixHQUFHLHdCQUF3QjtBQUVsRyxZQUFNLGtCQUF3QztBQUFBLFFBQzdDLE1BQU07QUFBQSxRQUNOLFNBQVMsRUFBRSxPQUFPLGdCQUFnQjtBQUFBLE1BQ25DO0FBRUEsVUFBSSxnQkFBZ0I7QUFDcEIsWUFBTSxrQkFBa0IsV0FBVyxTQUFTLGNBQWMsS0FBSztBQUMvRCxzQkFBZ0IsWUFBWTtBQUM1QixzQkFBZ0IsY0FBYztBQUU5QixZQUFNLGlCQUFpQixFQUFFLFNBQVMsTUFBTTtBQUFBLE1BQUUsRUFBRTtBQUc1QyxXQUFLO0FBQUEsUUFDSixNQUFNO0FBQ0wsMEJBQWdCO0FBQ2hCLGlCQUFPLEVBQUUsU0FBUyxpQkFBaUIsWUFBWSxlQUFlO0FBQUEsUUFDL0Q7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBR0EsYUFBTyxZQUFZLGVBQWUsT0FBTyw2Q0FBNkM7QUFBQSxJQUN2RixDQUFDO0FBRUQsU0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxzQkFBc0I7QUFBQSxRQUN0QixrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsY0FBUSxNQUFNO0FBRWQsWUFBTSxrQkFBd0M7QUFBQSxRQUM3QyxNQUFNO0FBQUEsUUFDTixTQUFTLEVBQUUsT0FBTyxpQkFBaUI7QUFBQSxNQUNwQztBQUVBLFlBQU0sb0JBQW9CO0FBRzFCLFlBQU0sWUFBWSxXQUFXLFNBQVMsY0FBYyxLQUFLO0FBQ3pELGdCQUFVLFlBQVk7QUFDdEIsZ0JBQVUsY0FBYztBQUN4QixXQUFLO0FBQUEsUUFDSixPQUFPLEVBQUUsU0FBUyxXQUFXLFlBQVksRUFBRSxTQUFTLE1BQU07QUFBQSxRQUFFLEVBQUUsRUFBRTtBQUFBLFFBQ2hFO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBR0EsWUFBTSxhQUFhLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDMUQsaUJBQVcsWUFBWTtBQUN2QixpQkFBVyxjQUFjO0FBQ3pCLFdBQUs7QUFBQSxRQUNKLE9BQU8sRUFBRSxTQUFTLFlBQVksWUFBWSxFQUFFLFNBQVMsTUFBTTtBQUFBLFFBQUUsRUFBRSxFQUFFO0FBQUEsUUFDakU7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFHQSxZQUFNLFVBQVUsa0JBQWtCLElBQUk7QUFDdEMsYUFBTyxHQUFHLFNBQVMsc0JBQXNCO0FBQ3pDLFlBQU0sYUFBYSxRQUFRLGlCQUFpQixhQUFhO0FBQ3pELFlBQU0sY0FBYyxRQUFRLGlCQUFpQixjQUFjO0FBRTNELGFBQU8sWUFBWSxXQUFXLFFBQVEsR0FBRyx5QkFBeUI7QUFDbEUsYUFBTyxZQUFZLFlBQVksUUFBUSxHQUFHLDBCQUEwQjtBQUFBLElBQ3JFLENBQUM7QUFFRCxTQUFLLGtEQUFrRCxNQUFNO0FBQzVELFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLHNCQUFzQjtBQUFBLFFBQ3RCLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFdBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLFlBQU0sU0FBUyxrQkFBa0IsSUFBSTtBQUNyQyxjQUFRLE1BQU07QUFHZCxZQUFNLFlBQVksV0FBVyxTQUFTLGNBQWMsS0FBSztBQUN6RCxnQkFBVSxZQUFZO0FBQ3RCLGdCQUFVLGNBQWM7QUFDeEIsV0FBSztBQUFBLFFBQ0osT0FBTyxFQUFFLFNBQVMsV0FBVyxZQUFZLEVBQUUsU0FBUyxNQUFNO0FBQUEsUUFBRSxFQUFFLEVBQUU7QUFBQSxRQUNoRTtBQUFBLFFBQ0EsRUFBRSxNQUFNLG1CQUFtQixTQUFTLEVBQUUsT0FBTyxRQUFRLEVBQUU7QUFBQSxRQUN2RDtBQUFBLE1BQ0Q7QUFHQSxZQUFNLGFBQWEsV0FBVyxTQUFTLGNBQWMsS0FBSztBQUMxRCxpQkFBVyxZQUFZO0FBQ3ZCLGlCQUFXLGNBQWM7QUFDekIsV0FBSztBQUFBLFFBQ0osT0FBTyxFQUFFLFNBQVMsWUFBWSxZQUFZLEVBQUUsU0FBUyxNQUFNO0FBQUEsUUFBRSxFQUFFLEVBQUU7QUFBQSxRQUNqRTtBQUFBLFFBQ0EsRUFBRSxNQUFNLG1CQUFtQixTQUFTLEVBQUUsT0FBTyxTQUFTLEVBQUU7QUFBQSxRQUN4RDtBQUFBLE1BQ0Q7QUFHQSxZQUFNLFVBQVUsa0JBQWtCLElBQUk7QUFDdEMsYUFBTyxHQUFHLFNBQVMsc0JBQXNCO0FBQ3pDLGFBQU8sR0FBRyxRQUFRLGNBQWMsV0FBVyxHQUFHLHlCQUF5QjtBQUN2RSxhQUFPLEdBQUcsUUFBUSxjQUFjLFdBQVcsR0FBRywwQkFBMEI7QUFBQSxJQUN6RSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSwrQkFBK0IsTUFBTTtBQUMxQyxTQUFLLHFFQUFxRSxNQUFNO0FBQy9FLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFdBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLGFBQU8sR0FBRyxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QixHQUFHLHdCQUF3QjtBQUdsRyxZQUFNLGtCQUFrQixnQkFBZ0IsU0FBUyxZQUFZLG9CQUFvQixVQUFVLFNBQVMsQ0FBQztBQUNyRyxZQUFNLFlBQWlDO0FBQUEsUUFDdEMsR0FBRyx5QkFBeUI7QUFBQSxVQUMzQixRQUFRO0FBQUEsVUFDUixzQkFBc0IsZUFBZTtBQUFBLFFBQ3RDLENBQUM7QUFBQSxRQUNELE9BQU87QUFBQSxRQUNQLG1CQUFtQjtBQUFBLE1BQ3BCO0FBR0EsV0FBSyxlQUFlLFNBQVM7QUFHN0IsYUFBTyxHQUFHLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCLEdBQUcsa0RBQWtEO0FBRzVILHNCQUFnQixJQUFJLFlBQVksb0JBQW9CLFVBQVUsc0JBQXNCLEdBQUcsTUFBUztBQUdoRyxhQUFPO0FBQUEsUUFBWSxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QjtBQUFBLFFBQUc7QUFBQSxRQUNsRjtBQUFBLE1BQWlEO0FBQUEsSUFDbkQsQ0FBQztBQUVELFNBQUssdUVBQXVFLE1BQU07QUFDakYsWUFBTSxPQUFPLFdBQVcseUJBQXlCO0FBQUEsUUFDaEQsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsY0FBYztBQUFBLFFBQ2Y7QUFBQSxNQUNELENBQUMsR0FBRyx3QkFBd0IsS0FBSyxDQUFDO0FBQ2xDLFlBQU0sUUFBUSxnQkFBZ0IsU0FBUyxZQUFZLG9CQUFvQixVQUFVLFNBQVMsQ0FBQztBQUMzRixZQUFNLFlBQVksRUFBRSxHQUFHLHlCQUF5QixFQUFFLFFBQVEsUUFBUSxDQUFDLEdBQUcsTUFBTTtBQUM1RSxXQUFLLG1CQUFtQixNQUFNO0FBQUEsTUFBRSxHQUFHLE1BQU07QUFBQSxNQUFFLEdBQUcsQ0FBQyxPQUFPLGlCQUFpQixhQUFhLFNBQVMsb0JBQW9CLFVBQVUsc0JBQXNCO0FBQ2pKLFdBQUssZUFBZSxTQUFTO0FBRTdCLFlBQU0sSUFBSSxZQUFZLG9CQUFvQixVQUFVLHNCQUFzQixHQUFHLE1BQVM7QUFDdEYsWUFBTSxVQUFVLG1CQUFtQixJQUFJLEdBQUc7QUFDMUMsWUFBTSxJQUFJLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxHQUFHLE1BQVM7QUFFekUsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QjtBQUFBLFFBQ0EsbUJBQW1CLG1CQUFtQixJQUFJLEdBQUc7QUFBQSxNQUM5QyxHQUFHO0FBQUEsUUFDRixTQUFTO0FBQUEsUUFDVCxtQkFBbUI7QUFBQSxNQUNwQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyx5RUFBeUUsTUFBTTtBQUNuRixZQUFNLE9BQU8sV0FBVyx5QkFBeUI7QUFBQSxRQUNoRCxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixjQUFjO0FBQUEsUUFDZjtBQUFBLE1BQ0QsQ0FBQyxHQUFHLHdCQUF3QixLQUFLLENBQUM7QUFFbEMsV0FBSyxzQkFBc0IsSUFBSTtBQUMvQixZQUFNLFNBQVMsbUJBQW1CLElBQUksR0FBRztBQUN6QyxXQUFLLHNCQUFzQixLQUFLO0FBRWhDLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEI7QUFBQSxRQUNBLFVBQVUsbUJBQW1CLElBQUksR0FBRztBQUFBLE1BQ3JDLEdBQUc7QUFBQSxRQUNGLFFBQVE7QUFBQSxRQUNSLFVBQVU7QUFBQSxNQUNYLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLCtEQUErRCxNQUFNO0FBQ3pFLFlBQU0sbUJBQW9EO0FBQUEsUUFDekQsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsY0FBYztBQUFBLFFBQ2QsVUFBVTtBQUFBLFFBQ1YsV0FBVztBQUFBLE1BQ1o7QUFDQSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQztBQUFBLFFBQ0EsV0FBVyxvQkFBb0IsVUFBVTtBQUFBLE1BQzFDLENBQUM7QUFDRCxZQUFNLFFBQVEsZ0JBQWdCLFNBQVMsZUFBZSxNQUFNLElBQUksQ0FBQztBQUNqRSxNQUFDLGVBQXNELFFBQVE7QUFDL0QsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLHdCQUF3QixLQUFLLENBQUM7QUFFdEUsdUJBQWlCLFdBQVc7QUFDNUIsdUJBQWlCLFdBQVc7QUFDNUIsWUFBTSxJQUFJLEVBQUUsR0FBRyxNQUFNLElBQUksRUFBRSxHQUFHLE1BQVM7QUFFdkMsYUFBTyxnQkFBZ0IsbUJBQW1CLElBQUksR0FBRztBQUFBLFFBQ2hELGNBQWM7QUFBQSxRQUNkLG1CQUFtQjtBQUFBLFFBQ25CLG9CQUFvQjtBQUFBLFFBQ3BCLFdBQVc7QUFBQSxRQUNYLFVBQVU7QUFBQSxNQUNYLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDJFQUEyRSxZQUFZO0FBQzNGLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFdBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRS9DLFlBQU0sa0JBQWtCLGdCQUFnQixTQUFTLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxDQUFDO0FBQ3JHLFlBQU0sWUFBaUM7QUFBQSxRQUN0QyxHQUFHLHlCQUF5QjtBQUFBLFVBQzNCLFFBQVE7QUFBQSxVQUNSLHNCQUFzQixlQUFlO0FBQUEsUUFDdEMsQ0FBQztBQUFBLFFBQ0QsT0FBTztBQUFBLFFBQ1AsbUJBQW1CO0FBQUEsTUFDcEI7QUFFQSxXQUFLLGVBQWUsU0FBUztBQUM3QixZQUFNLGdCQUFnQixNQUFPLGdCQUF5RSxrQkFBa0IsRUFBRTtBQUMxSCxhQUFPLFlBQVksY0FBYyxHQUFHLEdBQUcsZ0RBQWdEO0FBR3ZGLHNCQUFnQixJQUFJLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxHQUFHLE1BQVM7QUFDbkYsWUFBTSxRQUFRLFFBQVE7QUFFdEIsYUFBTyxZQUFZLGNBQWMsR0FBRyxHQUFHLDRFQUE0RTtBQUFBLElBQ3BILENBQUM7QUFFRCxTQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFdBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLFlBQU0sa0JBQWtCLGdCQUFnQixTQUFTLFlBQVksb0JBQW9CLFVBQVUsc0JBQXNCLENBQUM7QUFDbEgsWUFBTSxZQUFpQztBQUFBLFFBQ3RDLEdBQUcseUJBQXlCO0FBQUEsVUFDM0IsUUFBUTtBQUFBLFVBQ1Isc0JBQXNCLGVBQWU7QUFBQSxRQUN0QyxDQUFDO0FBQUEsUUFDRCxPQUFPO0FBQUEsUUFDUCxtQkFBbUI7QUFBQSxNQUNwQjtBQUdBLFdBQUssZUFBZSxTQUFTO0FBRzdCLGFBQU87QUFBQSxRQUFZLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCO0FBQUEsUUFBRztBQUFBLFFBQ2xGO0FBQUEsTUFBa0Q7QUFHbkQsc0JBQWdCLElBQUksWUFBWSxvQkFBb0IsVUFBVSxTQUFTLEdBQUcsTUFBUztBQUduRixhQUFPO0FBQUEsUUFBRyxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QjtBQUFBLFFBQ3RFO0FBQUEsTUFBc0Q7QUFBQSxJQUN4RCxDQUFDO0FBRUQsU0FBSyxzREFBc0QsTUFBTTtBQUNoRSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsY0FBUSxNQUFNO0FBR2QsYUFBTyxZQUFZLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCLEdBQUcsT0FBTyxxQ0FBcUM7QUFHL0gsWUFBTSxrQkFBa0IsZ0JBQWdCLFNBQVMsWUFBWSxvQkFBb0IsVUFBVSxzQkFBc0IsQ0FBQztBQUNsSCxZQUFNLFlBQWlDO0FBQUEsUUFDdEMsR0FBRyx5QkFBeUI7QUFBQSxVQUMzQixRQUFRO0FBQUEsVUFDUixzQkFBc0IsZUFBZTtBQUFBLFFBQ3RDLENBQUM7QUFBQSxRQUNELE9BQU87QUFBQSxRQUNQLG1CQUFtQjtBQUFBLE1BQ3BCO0FBR0EsV0FBSyxlQUFlLFNBQVM7QUFHN0Isc0JBQWdCLElBQUksWUFBWSxvQkFBb0IsVUFBVSxTQUFTLEdBQUcsTUFBUztBQUduRixhQUFPO0FBQUEsUUFBWSxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QjtBQUFBLFFBQUc7QUFBQSxRQUNsRjtBQUFBLE1BQWtEO0FBQUEsSUFDcEQsQ0FBQztBQUVELFNBQUsscURBQXFELE1BQU07QUFDL0QsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0Msa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFFBQ1o7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFHL0MsYUFBTyxHQUFHLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCLEdBQUcsd0JBQXdCO0FBR2xHLFlBQU0sa0JBQWtCLGdCQUFnQixTQUFTLFlBQVksb0JBQW9CLFVBQVUsc0JBQXNCLENBQUM7QUFDbEgsWUFBTSxZQUFpQztBQUFBLFFBQ3RDLEdBQUcseUJBQXlCO0FBQUEsVUFDM0IsUUFBUTtBQUFBLFVBQ1Isc0JBQXNCLGVBQWU7QUFBQSxRQUN0QyxDQUFDO0FBQUEsUUFDRCxPQUFPO0FBQUEsUUFDUCxtQkFBbUI7QUFBQSxNQUNwQjtBQUVBLFdBQUssZUFBZSxTQUFTO0FBRzdCLGFBQU87QUFBQSxRQUFZLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCO0FBQUEsUUFBRztBQUFBLFFBQ2xGO0FBQUEsTUFBcUM7QUFHdEMsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGNBQVEsTUFBTTtBQUNkLGFBQU8sR0FBRyxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QixHQUFHLGtDQUFrQztBQUc1RyxjQUFRLE1BQU07QUFDZCxhQUFPO0FBQUEsUUFBWSxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QjtBQUFBLFFBQUc7QUFBQSxRQUNsRjtBQUFBLE1BQXVDO0FBR3hDLHNCQUFnQixJQUFJLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxHQUFHLE1BQVM7QUFHbkYsYUFBTztBQUFBLFFBQVksS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkI7QUFBQSxRQUFHO0FBQUEsUUFDbEY7QUFBQSxNQUF1RTtBQUFBLElBQ3pFLENBQUM7QUFFRCxTQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFdBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLFlBQU0sbUJBQW1CLGdCQUFnQixVQUFVLFlBQVksb0JBQW9CLFVBQVUsc0JBQXNCLENBQUM7QUFDcEgsWUFBTSxhQUFrQztBQUFBLFFBQ3ZDLEdBQUcseUJBQXlCO0FBQUEsVUFDM0IsUUFBUTtBQUFBLFVBQ1IsWUFBWTtBQUFBLFVBQ1osc0JBQXNCLGVBQWU7QUFBQSxRQUN0QyxDQUFDO0FBQUEsUUFDRCxPQUFPO0FBQUEsUUFDUCxtQkFBbUI7QUFBQSxNQUNwQjtBQUVBLFdBQUssZUFBZSxVQUFVO0FBRzlCLGFBQU87QUFBQSxRQUFZLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCO0FBQUEsUUFBRztBQUFBLFFBQ2xGO0FBQUEsTUFBMkM7QUFHNUMsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGNBQVEsTUFBTTtBQUNkLGFBQU8sR0FBRyxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QixHQUFHLGtDQUFrQztBQUc1RyxjQUFRLE1BQU07QUFDZCxhQUFPO0FBQUEsUUFBWSxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QjtBQUFBLFFBQUc7QUFBQSxRQUNsRjtBQUFBLE1BQXFDO0FBR3RDLHVCQUFpQixJQUFJLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxHQUFHLE1BQVM7QUFDcEYsYUFBTztBQUFBLFFBQVksS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkI7QUFBQSxRQUFHO0FBQUEsUUFDbEY7QUFBQSxNQUEwRTtBQUczRSxjQUFRLE1BQU07QUFDZCxhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRywrQ0FBK0M7QUFHekgsWUFBTSxtQkFBbUIsZ0JBQWdCLFVBQVUsWUFBWSxvQkFBb0IsVUFBVSxzQkFBc0IsQ0FBQztBQUNwSCxZQUFNLGFBQWtDO0FBQUEsUUFDdkMsR0FBRyx5QkFBeUI7QUFBQSxVQUMzQixRQUFRO0FBQUEsVUFDUixZQUFZO0FBQUEsVUFDWixzQkFBc0IsZUFBZTtBQUFBLFFBQ3RDLENBQUM7QUFBQSxRQUNELE9BQU87QUFBQSxRQUNQLG1CQUFtQjtBQUFBLE1BQ3BCO0FBRUEsV0FBSyxlQUFlLFVBQVU7QUFHOUIsYUFBTztBQUFBLFFBQVksS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkI7QUFBQSxRQUFHO0FBQUEsUUFDbEY7QUFBQSxNQUE0QztBQUc3Qyx1QkFBaUIsSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBQ3BGLGFBQU87QUFBQSxRQUFHLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCO0FBQUEsUUFDdEU7QUFBQSxNQUE4RjtBQUFBLElBQ2hHLENBQUM7QUFFRCxTQUFLLGlFQUFpRSxNQUFNO0FBQzNFLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFdBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLFlBQU0sa0JBQWtCLGdCQUFnQixTQUFTLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxDQUFDO0FBQ3JHLFlBQU0sWUFBaUM7QUFBQSxRQUN0QyxHQUFHLHlCQUF5QjtBQUFBLFVBQzNCLFFBQVE7QUFBQSxVQUNSLHNCQUFzQixlQUFlO0FBQUEsUUFDdEMsQ0FBQztBQUFBLFFBQ0QsT0FBTztBQUFBLFFBQ1AsbUJBQW1CO0FBQUEsTUFDcEI7QUFFQSxXQUFLLGVBQWUsU0FBUztBQUc3QixZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsYUFBTyxHQUFHLFFBQVEscUJBQXFCO0FBQ3ZDLFlBQU0sZUFBZSx1QkFBdUIsTUFBTTtBQUNsRCxVQUFJLGFBQWEsY0FBYyxlQUFlLFFBQVEsZUFBZTtBQUNyRSxhQUFPLEdBQUcsV0FBVyxTQUFTLG1CQUFtQixHQUFHLGlEQUFpRDtBQUdyRyxzQkFBZ0IsSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBR25GLG1CQUFhLGNBQWMsZUFBZSxRQUFRLGVBQWU7QUFDakUsYUFBTztBQUFBLFFBQUcsV0FBVyxTQUFTLG1CQUFtQjtBQUFBLFFBQ2hEO0FBQUEsTUFBMEQ7QUFBQSxJQUM1RCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxzQkFBc0IsTUFBTTtBQUVqQyxVQUFNLFlBQVksQ0FBQyxZQUE2QjtBQUMvQyxVQUFJLE9BQU8sWUFBWSxVQUFVO0FBQ2hDLGVBQU87QUFBQSxNQUNSO0FBQ0EsVUFBSSxpQkFBaUIsT0FBTyxHQUFHO0FBQzlCLGVBQU8sUUFBUTtBQUFBLE1BQ2hCO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFFQSxTQUFLLHdFQUF3RSxNQUFNO0FBQ2xGLFlBQU0seUJBQXNFLENBQUM7QUFDN0UsdUJBQWlCLG9CQUFvQixDQUFDLFNBQXNCLFlBQWlDO0FBQzVGLCtCQUF1QixLQUFLLEVBQUUsU0FBUyxTQUFTLFVBQVUsUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUM1RSxlQUFPLEVBQUUsU0FBUyxNQUFNO0FBQUEsUUFBRSxFQUFFO0FBQUEsTUFDN0I7QUFFQSxZQUFNLHVCQUF1QixtQ0FBbUM7QUFBQSxRQUMvRCxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsVUFDUixRQUFRO0FBQUEsVUFDUixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsSUFBSTtBQUU1QyxpQkFBVyxzQkFBc0IsT0FBTztBQUd4QyxZQUFNLGFBQWEsdUJBQXVCLEtBQUssT0FBSyxFQUFFLFFBQVEsU0FBUyxRQUFRLENBQUM7QUFDaEYsYUFBTyxHQUFHLFlBQVkscUNBQXFDO0FBQUEsSUFDNUQsQ0FBQztBQUVELFNBQUssMkRBQTJELE1BQU07QUFDckUsWUFBTSx5QkFBc0UsQ0FBQztBQUM3RSx1QkFBaUIsb0JBQW9CLENBQUMsU0FBc0IsWUFBaUM7QUFDNUYsK0JBQXVCLEtBQUssRUFBRSxTQUFTLFNBQVMsVUFBVSxRQUFRLE9BQU8sRUFBRSxDQUFDO0FBQzVFLGVBQU8sRUFBRSxTQUFTLE1BQU07QUFBQSxRQUFFLEVBQUU7QUFBQSxNQUM3QjtBQUVBLFlBQU0sdUJBQXVCLG1DQUFtQztBQUFBLFFBQy9ELGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFdBQVc7QUFBQSxVQUNYLFFBQVE7QUFBQSxVQUNSLFFBQVE7QUFBQTtBQUFBLFFBRVQ7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLElBQUk7QUFFNUMsaUJBQVcsc0JBQXNCLE9BQU87QUFHeEMsWUFBTSxhQUFhLHVCQUF1QixLQUFLLE9BQUssRUFBRSxRQUFRLFNBQVMsUUFBUSxDQUFDO0FBQ2hGLGFBQU8sWUFBWSxZQUFZLFFBQVcsa0RBQWtEO0FBQUEsSUFDN0YsQ0FBQztBQUVELFNBQUssOEVBQThFLE1BQU07QUFDeEYsWUFBTSx5QkFBc0UsQ0FBQztBQUM3RSx1QkFBaUIsb0JBQW9CLENBQUMsU0FBc0IsWUFBaUM7QUFDNUYsK0JBQXVCLEtBQUssRUFBRSxTQUFTLFNBQVMsVUFBVSxRQUFRLE9BQU8sRUFBRSxDQUFDO0FBQzVFLGVBQU8sRUFBRSxTQUFTLE1BQU07QUFBQSxRQUFFLEVBQUU7QUFBQSxNQUM3QjtBQUVBLFlBQU0sbUJBQW9EO0FBQUEsUUFDekQsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBLE1BQ1Q7QUFFQSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQztBQUFBLFFBQ0EsV0FBVyxvQkFBb0IsVUFBVTtBQUFBLE1BQzFDLENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsaUJBQVcsZ0JBQWdCLE9BQU87QUFHbEMsWUFBTSxlQUFlLHVCQUF1QixLQUFLLE9BQUssRUFBRSxRQUFRLFNBQVMsUUFBUSxDQUFDO0FBQ2xGLGFBQU8sWUFBWSxjQUFjLFFBQVcsdUNBQXVDO0FBR25GLHVCQUFpQixZQUFZO0FBRzdCLFlBQU0sUUFBUSxlQUFlO0FBQzdCLFlBQU0sSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBR3pFLFlBQU0sYUFBYSx1QkFBdUIsS0FBSyxPQUFLLEVBQUUsUUFBUSxTQUFTLGlCQUFpQixDQUFDO0FBQ3pGLGFBQU8sR0FBRyxZQUFZLHNEQUFzRDtBQUFBLElBQzdFLENBQUM7QUFFRCxTQUFLLHFFQUFxRSxNQUFNO0FBQy9FLFlBQU0seUJBQXNFLENBQUM7QUFDN0UsdUJBQWlCLG9CQUFvQixDQUFDLFNBQXNCLFlBQWlDO0FBQzVGLCtCQUF1QixLQUFLLEVBQUUsU0FBUyxTQUFTLFVBQVUsUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUM1RSxlQUFPLEVBQUUsU0FBUyxNQUFNO0FBQUEsUUFBRSxFQUFFO0FBQUEsTUFDN0I7QUFFQSxZQUFNLHVCQUF1QixtQ0FBbUM7QUFBQSxRQUMvRCxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsVUFDUixRQUFRO0FBQUEsVUFDUixXQUFXO0FBQUEsVUFDWCxTQUFTO0FBQUEsUUFDVjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsSUFBSTtBQUU1QyxpQkFBVyxzQkFBc0IsT0FBTztBQUd4QyxZQUFNLFFBQVEsdUJBQXVCLEtBQUssT0FBSyxFQUFFLFFBQVEsU0FBUyxLQUFLLEtBQUssRUFBRSxRQUFRLFNBQVMsU0FBUyxDQUFDO0FBQ3pHLGFBQU8sR0FBRyxPQUFPLGtDQUFrQztBQUNuRCxhQUFPLEdBQUcsTUFBTyxRQUFRLFNBQVMsUUFBUSxHQUFHLHVDQUF1QztBQUFBLElBQ3JGLENBQUM7QUFFRCxTQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLFlBQU0seUJBQXNFLENBQUM7QUFDN0UsdUJBQWlCLG9CQUFvQixDQUFDLFNBQXNCLFlBQWlDO0FBQzVGLCtCQUF1QixLQUFLLEVBQUUsU0FBUyxTQUFTLFVBQVUsUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUM1RSxlQUFPLEVBQUUsU0FBUyxNQUFNO0FBQUEsUUFBRSxFQUFFO0FBQUEsTUFDN0I7QUFFQSxZQUFNLG1CQUFvRDtBQUFBLFFBQ3pELE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLFdBQVc7QUFBQSxRQUNYLFFBQVE7QUFBQSxRQUNSLFdBQVc7QUFBQSxNQUNaO0FBRUEsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0M7QUFBQSxRQUNBLFdBQVcsb0JBQW9CLFVBQVU7QUFBQSxNQUMxQyxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLGlCQUFXLGdCQUFnQixPQUFPO0FBR2xDLGFBQU8sWUFBWSx1QkFBdUIsS0FBSyxPQUFLLEVBQUUsUUFBUSxTQUFTLFFBQVEsQ0FBQyxHQUFHLFFBQVcsa0RBQWtEO0FBR2hKLHVCQUFpQixVQUFVO0FBQzNCLFlBQU0sUUFBUSxlQUFlO0FBQzdCLFlBQU0sSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBRXpFLFlBQU0sY0FBYyx1QkFBdUIsS0FBSyxPQUFLLEVBQUUsUUFBUSxTQUFTLEdBQUcsS0FBSyxFQUFFLFFBQVEsU0FBUyxTQUFTLENBQUM7QUFDN0csYUFBTyxHQUFHLGFBQWEsbURBQW1EO0FBQUEsSUFDM0UsQ0FBQztBQUVELFNBQUssNEVBQTRFLE1BQU07QUFDdEYsWUFBTSx5QkFBc0UsQ0FBQztBQUM3RSx1QkFBaUIsb0JBQW9CLENBQUMsU0FBc0IsWUFBaUM7QUFDNUYsK0JBQXVCLEtBQUssRUFBRSxTQUFTLFNBQVMsVUFBVSxRQUFRLE9BQU8sRUFBRSxDQUFDO0FBQzVFLGVBQU8sRUFBRSxTQUFTLE1BQU07QUFBQSxRQUFFLEVBQUU7QUFBQSxNQUM3QjtBQUlBLFlBQU0sbUJBQW9EO0FBQUEsUUFDekQsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsV0FBVztBQUFBLE1BQ1o7QUFFQSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQztBQUFBLFFBQ0EsV0FBVyxvQkFBb0IsVUFBVTtBQUFBLE1BQzFDLENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsaUJBQVcsZ0JBQWdCLE9BQU87QUFHbEMsYUFBTyxZQUFZLHVCQUF1QixLQUFLLE9BQUssRUFBRSxRQUFRLFNBQVMsT0FBTyxDQUFDLEdBQUcsUUFBVyxnREFBZ0Q7QUFHN0ksdUJBQWlCLFlBQVk7QUFDN0IsWUFBTSxRQUFRLGVBQWU7QUFDN0IsWUFBTSxJQUFJLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxHQUFHLE1BQVM7QUFFekUsWUFBTSxhQUFhLHVCQUF1QixLQUFLLE9BQUssRUFBRSxRQUFRLFNBQVMsaUJBQWlCLENBQUM7QUFDekYsYUFBTyxHQUFHLFlBQVksc0RBQXNEO0FBQUEsSUFDN0UsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
