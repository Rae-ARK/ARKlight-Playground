var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import * as dom from "../../../../../../base/browser/dom.js";
import { $, AnimationFrameScheduler, DisposableResizeObserver } from "../../../../../../base/browser/dom.js";
import { Action } from "../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { rcut } from "../../../../../../base/common/strings.js";
import { localize } from "../../../../../../nls.js";
import { IActionViewItemService } from "../../../../../../platform/actions/browser/actionViewItemService.js";
import { HiddenItemStrategy, WorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../../../platform/actions/common/actions.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID } from "../../../common/constants.js";
import { formatCopilotCredits, IChatToolInvocation, isLegacyChatTerminalToolInvocationData } from "../../../common/chatService/chatService.js";
import { isResponseVM } from "../../../common/model/chatViewModel.js";
import { ChatCollapsibleContentPart } from "./chatCollapsibleContentPart.js";
import { ChatCollapsibleMarkdownContentPart } from "./chatCollapsibleMarkdownContentPart.js";
import { renderFileWidgets } from "./chatInlineAnchorWidget.js";
import { IChatMarkdownAnchorService } from "./chatMarkdownAnchorService.js";
import { buildPhrasePool, createThinkingIcon, getToolInvocationIcon } from "./chatThinkingContentPart.js";
import { ChatToolInvocationPart } from "./toolInvocationParts/chatToolInvocationPart.js";
import "./media/chatSubagentContent.css";
const MAX_TITLE_LENGTH = 100;
const subagentWorkingMessages = [
  localize("chat.subagent.working.1", "Processing"),
  localize("chat.subagent.working.2", "Preparing"),
  localize("chat.subagent.working.3", "Loading"),
  localize("chat.subagent.working.4", "Analyzing"),
  localize("chat.subagent.working.5", "Evaluating")
];
let ChatSubagentContentPart = class extends ChatCollapsibleContentPart {
  constructor(subAgentInvocationId, toolInvocation, context, chatContentMarkdownRenderer, listPool, editorPool, currentWidthDelegate, announcedToolProgressKeys, instantiationService, chatMarkdownAnchorService, hoverService, configurationService, accessibilityService, actionViewItemService, menuService, contextKeyService) {
    const { description, isDefaultDescription, agentName, prompt, modelName, credits } = ChatSubagentContentPart.extractSubagentInfo(toolInvocation);
    const rawPrefix = agentName || localize("chat.subagent.prefix", "Subagent");
    const prefix = rawPrefix.charAt(0).toUpperCase() + rawPrefix.slice(1);
    const initialTitle = `${prefix}: ${description}`;
    super(initialTitle, context, void 0, hoverService, configurationService);
    this.subAgentInvocationId = subAgentInvocationId;
    this.context = context;
    this.chatContentMarkdownRenderer = chatContentMarkdownRenderer;
    this.listPool = listPool;
    this.editorPool = editorPool;
    this.currentWidthDelegate = currentWidthDelegate;
    this.announcedToolProgressKeys = announcedToolProgressKeys;
    this.instantiationService = instantiationService;
    this.chatMarkdownAnchorService = chatMarkdownAnchorService;
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this.actionViewItemService = actionViewItemService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.hasToolItems = false;
    // Lazy rendering support
    this.lazyItems = [];
    this.hasExpandedOnce = false;
    this.pendingPromptRender = false;
    this._hoverDisposable = this._register(new MutableDisposable());
    this._openChatActionListeners = this._register(new MutableDisposable());
    this._openChatActionViewRegistration = this._register(new MutableDisposable());
    // Confirmation auto-expand tracking
    this.toolsWaitingForConfirmation = 0;
    this.userManuallyExpanded = false;
    this.autoExpandedForConfirmation = false;
    this._confirmationPlaceholderDisposable = this._register(new MutableDisposable());
    this._activeConfirmationTracker = this._register(new MutableDisposable());
    this._useCarouselForConfirmations = false;
    this.toolsWaitingForCarouselConfirmation = 0;
    this._confirmationActive = false;
    /** Per-tool-invocation autoruns observing tool state; each is disposed once its tool reaches a terminal state so listeners don't accumulate for the widget's lifetime. */
    this._toolStateTracking = this._register(new DisposableStore());
    this._titleDetailRendered = this._register(new MutableDisposable());
    this.description = rcut(description, MAX_TITLE_LENGTH);
    this._isDefaultDescription = isDefaultDescription;
    this.agentName = agentName;
    this.prompt = prompt;
    this.modelName = modelName;
    this.credits = credits;
    this.isInitiallyComplete = IChatToolInvocation.isComplete(toolInvocation);
    this.isExternallyActive = toolInvocation.toolSpecificData?.kind === "subagent" && toolInvocation.toolSpecificData.isActive === true;
    this.isActive = toolInvocation.toolSpecificData?.kind === "subagent" ? toolInvocation.toolSpecificData.isActive ?? !this.isInitiallyComplete : !this.isInitiallyComplete;
    this._subagentToolInvocation = toolInvocation;
    if (isResponseVM(context.element)) {
      const response = context.element;
      const finalizeOnTerminal = () => {
        if (this.isActive && (response.isComplete || response.isCanceled)) {
          this.markAsInactive(true);
        }
      };
      finalizeOnTerminal();
      if (!response.isComplete && !response.isCanceled) {
        this._register(Event.once(Event.filter(response.model.onDidChange, () => response.isComplete || response.isCanceled))(finalizeOnTerminal));
      }
    }
    const node = this.domNode;
    node.classList.add("chat-thinking-box", "chat-thinking-fixed-mode", "chat-subagent-part");
    const animationContainer = this.contentAnimationContainer;
    if (animationContainer) {
      const pendingAnimationCleanup = this._register(new MutableDisposable());
      this._register(dom.addDisposableListener(node, ChatCollapsibleContentPart.userToggleEvent, (e) => {
        if (e.target === node && this.isActive && !this.accessibilityService.isMotionReduced()) {
          this.setContentAnimationEnabled(true);
          animationContainer.getBoundingClientRect();
        }
      }));
      const finishActiveToggleAnimation = (e) => {
        if (this.isActive && e.target === animationContainer && e.propertyName === "grid-template-rows") {
          pendingAnimationCleanup.clear();
          this.setContentAnimationEnabled(false);
        }
      };
      this._register(dom.addDisposableListener(animationContainer, "transitionend", finishActiveToggleAnimation));
      this._register(dom.addDisposableListener(animationContainer, "transitioncancel", finishActiveToggleAnimation));
    }
    this._updateOpenChatLink();
    if (this.isActive) {
      node.classList.add("chat-thinking-active");
    }
    if (this.isActive && this._collapseButton) {
      const labelElement = this._collapseButton.labelElement;
      labelElement.textContent = "";
      this.titleShimmerSpan = $("span.chat-thinking-title-shimmer");
      this.titleShimmerSpan.textContent = initialTitle;
      labelElement.appendChild(this.titleShimmerSpan);
    }
    if (this._collapseButton && this.isActive) {
      this._collapseButton.icon = Codicon.circleFilled;
    }
    this._register(autorun((r) => {
      this.expanded.read(r);
      if (this._collapseButton) {
        if (this.isActive) {
          this._collapseButton.icon = Codicon.circleFilled;
        } else {
          this._collapseButton.icon = Codicon.check;
        }
      }
    }));
    this._register(autorun((r) => {
      if (this._isExpanded.read(r) && !this.hasExpandedOnce) {
        this.hasExpandedOnce = true;
        this.materializePendingContent();
      }
    }));
    this.setExpanded(false);
    this._register(autorun((r) => {
      const expanded = this._isExpanded.read(r);
      if (expanded) {
        if (!this.autoExpandedForConfirmation) {
          this.userManuallyExpanded = true;
        }
      } else {
        if (this.autoExpandedForConfirmation) {
          this.autoExpandedForConfirmation = false;
        }
        if (this.userManuallyExpanded) {
          this.userManuallyExpanded = false;
        }
      }
    }));
    this.layoutScheduler = this._register(new AnimationFrameScheduler(this.domNode, () => this.performLayout()));
    this.updateHover();
    this.renderPromptSection();
    this.watchToolCompletion(toolInvocation);
  }
  /**
   * Check if a tool invocation is the parent subagent tool (the tool that spawns a subagent).
   * A parent subagent tool has subagent toolSpecificData but no subAgentInvocationId.
   */
  static isParentSubagentTool(toolInvocation) {
    return toolInvocation.toolSpecificData?.kind === "subagent" && !toolInvocation.subAgentInvocationId;
  }
  /**
   * Extracts subagent info (description, agentName, prompt) from a tool invocation.
   */
  static extractSubagentInfo(toolInvocation) {
    const defaultDescription = localize("chat.subagent.defaultDescription", "Running subagent");
    if (!ChatSubagentContentPart.isParentSubagentTool(toolInvocation)) {
      return { description: defaultDescription, isDefaultDescription: true, agentName: void 0, prompt: void 0, modelName: void 0, credits: void 0 };
    }
    if (toolInvocation.toolSpecificData?.kind === "subagent") {
      const hasDescription = !!toolInvocation.toolSpecificData.description;
      return {
        description: toolInvocation.toolSpecificData.description ?? defaultDescription,
        isDefaultDescription: !hasDescription,
        agentName: toolInvocation.toolSpecificData.agentName,
        prompt: toolInvocation.toolSpecificData.prompt,
        modelName: toolInvocation.toolSpecificData.modelName,
        credits: toolInvocation.toolSpecificData.credits
      };
    }
    if (toolInvocation.kind === "toolInvocation") {
      const state = toolInvocation.state.get();
      const params = state.type !== IChatToolInvocation.StateKind.Streaming ? state.parameters : void 0;
      const hasDescription = !!params?.description;
      return {
        description: params?.description ?? defaultDescription,
        isDefaultDescription: !hasDescription,
        agentName: params?.agentName,
        prompt: params?.prompt,
        modelName: void 0,
        credits: void 0
      };
    }
    return { description: defaultDescription, isDefaultDescription: true, agentName: void 0, prompt: void 0, modelName: void 0, credits: void 0 };
  }
  /** The subagent's own chat resource (URI string), when it runs as a distinct chat. */
  _getChatResource() {
    const data = this._subagentToolInvocation.toolSpecificData;
    return data?.kind === "subagent" ? data.chatResource : void 0;
  }
  /**
   * Creates (once) and toggles the subagent header toolbar that hosts the
   * `MenuId.ChatSubagentContent` menu. The Agents window contributes an "Open
   * Subagent" pill into that menu to reveal the subagent's own (read-only)
   * chat; in the regular chat view the menu is empty and nothing renders. The
   * subagent chat resource can arrive after the part is first constructed, so
   * this is also called from the tool-completion autorun.
   */
  _updateOpenChatLink() {
    const resource = this._getChatResource();
    if (!this._collapseButton) {
      return;
    }
    this.domNode.classList.toggle("chat-subagent-has-chat", !!resource);
    if (!resource) {
      this._openChatToolbarContainer?.classList.add("hidden");
      return;
    }
    if (!this._ensureOpenChatToolbar()) {
      return;
    }
    this._updateOpenChatToolbarContext();
    this._openChatToolbarContainer.classList.remove("hidden");
  }
  _ensureOpenChatToolbar() {
    if (this._openChatToolbar) {
      return true;
    }
    const menuAction = this._getOpenChatMenuAction();
    if (!menuAction) {
      return false;
    }
    const actionViewItemProvider = this.actionViewItemService.lookUp(MenuId.ChatSubagentContent, CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID);
    if (!actionViewItemProvider) {
      if (!this._openChatActionViewRegistration.value) {
        this._openChatActionViewRegistration.value = Event.once(Event.filter(
          this.actionViewItemService.onDidChange,
          (menuId) => menuId === MenuId.ChatSubagentContent
        ))(() => {
          this._openChatActionViewRegistration.clear();
          this._updateOpenChatLink();
        });
      }
      return false;
    }
    this._openChatActionViewRegistration.clear();
    const container = $(".chat-subagent-open-chat-toolbar");
    this._collapseButton?.element.parentElement?.insertBefore(container, this._collapseButton.element);
    this._openChatToolbarContainer = container;
    this._openChatToolbar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, container, {
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      actionViewItemProvider: (action, options) => actionViewItemProvider(
        action,
        options,
        this.instantiationService,
        dom.getWindow(container).vscodeWindowId
      )
    }));
    this._openChatToolbar.setActions([menuAction]);
    this._trackOpenChatActions();
    return true;
  }
  _getOpenChatMenuAction() {
    for (const [, actions] of this.menuService.getMenuActions(MenuId.ChatSubagentContent, this.contextKeyService, { shouldForwardArgs: true })) {
      const action = actions.find((action2) => action2.id === CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID);
      if (action instanceof MenuItemAction) {
        return action;
      }
    }
    return void 0;
  }
  _trackOpenChatActions() {
    const store = new DisposableStore();
    const itemCount = this._openChatToolbar?.getItemsLength() ?? 0;
    for (let index = 0; index < itemCount; index++) {
      const action = this._openChatToolbar?.getItemAction(index);
      if (action instanceof Action) {
        store.add(action.onDidChange(() => this._updateOpenChatOnlyMode()));
      }
    }
    this._openChatActionListeners.value = store;
    this._updateOpenChatOnlyMode();
  }
  _updateOpenChatOnlyMode() {
    if (!this._collapseButton || !this._openChatToolbar) {
      return;
    }
    const itemCount = this._openChatToolbar.getItemsLength();
    let openChatOnly = false;
    for (let index = 0; index < itemCount; index++) {
      if (this._openChatToolbar.getItemAction(index)?.enabled) {
        openChatOnly = true;
        break;
      }
    }
    this.domNode.classList.toggle("chat-subagent-open-chat-only", openChatOnly);
    if (openChatOnly) {
      dom.hide(this._collapseButton.element);
      if (this.contentAnimationContainer) {
        dom.hide(this.contentAnimationContainer);
      }
      this.setExpanded(false);
    } else {
      dom.show(this._collapseButton.element);
      if (this.contentAnimationContainer) {
        dom.show(this.contentAnimationContainer);
      }
    }
  }
  _updateOpenChatToolbarContext() {
    const chatResource = this._getChatResource();
    if (chatResource && this._openChatToolbar) {
      const data = this._subagentToolInvocation.toolSpecificData;
      this._openChatToolbar.context = {
        chatResource,
        confirmationCount: this.toolsWaitingForCarouselConfirmation,
        confirmationActive: this._confirmationActive,
        startedAt: data?.kind === "subagent" ? data.startedAt : void 0,
        duration: data?.kind === "subagent" ? data.duration : void 0,
        ...this.modelName ? { modelName: this.modelName } : {},
        ...this.isActive && this.currentRunningToolMessage ? { activeToolLabel: this.currentRunningToolMessage } : {},
        ...this.isActive && this.currentRunningToolIcon ? { activeToolIcon: this.currentRunningToolIcon } : {}
      };
    }
  }
  getRandomWorkingMessage() {
    if (!this.availableMessages || this.availableMessages.length === 0) {
      this.availableMessages = buildPhrasePool(subagentWorkingMessages, this.configurationService);
    }
    const index = Math.floor(Math.random() * this.availableMessages.length);
    return this.availableMessages.splice(index, 1)[0];
  }
  createWorkingSpinner() {
    if (this.workingSpinnerElement || !this.wrapper) {
      return;
    }
    this.workingSpinnerElement = $(".chat-thinking-item.chat-thinking-spinner-item");
    const spinnerIcon = createThinkingIcon(Codicon.circleFilled);
    this.workingSpinnerElement.appendChild(spinnerIcon);
    this.workingSpinnerLabel = $("span.chat-thinking-spinner-label");
    this.workingSpinnerLabel.textContent = this.getRandomWorkingMessage();
    this.workingSpinnerElement.appendChild(this.workingSpinnerLabel);
    this.wrapper.appendChild(this.workingSpinnerElement);
  }
  removeWorkingSpinner() {
    if (this.workingSpinnerElement) {
      this.workingSpinnerElement.remove();
      this.workingSpinnerElement = void 0;
      this.workingSpinnerLabel = void 0;
    }
  }
  showWorkingSpinner() {
    if (this.workingSpinnerElement) {
      this.workingSpinnerElement.style.display = "";
    } else {
      this.createWorkingSpinner();
    }
  }
  initContent() {
    this.wrapper = $(".chat-used-context-list.chat-thinking-collapsible");
    if (!this.hasToolItems) {
      this.wrapper.style.display = "none";
    }
    this.materializePendingContent();
    if (this.isActive && !this.isInitiallyComplete && !this.hasToolsWaitingForConfirmation) {
      this.showWorkingSpinner();
    }
    const resizeObserver = this._register(new DisposableResizeObserver("ChatSubagentContentPart.layout", () => this.layoutScheduler.schedule()));
    this._register(resizeObserver.observe(this.wrapper));
    return this.wrapper;
  }
  /**
   * Renders the prompt as a collapsible section at the start of the content.
   * If the wrapper doesn't exist yet (lazy init) or subagent is initially complete,
   * this is deferred until expanded.
   */
  renderPromptSection() {
    if (!this.prompt || this.promptContainer) {
      return;
    }
    if (!this.wrapper || this.isInitiallyComplete && !this.isExpanded() && !this.hasExpandedOnce) {
      this.pendingPromptRender = true;
      return;
    }
    this.pendingPromptRender = false;
    this.doRenderPromptSection();
  }
  doRenderPromptSection() {
    if (!this.prompt || this.promptContainer) {
      return;
    }
    const lines = this.prompt.split("\n");
    const rawFirstLine = lines[0] || localize("chat.subagent.prompt", "Prompt");
    const restOfLines = lines.slice(1).join("\n").trim();
    const titleContent = rcut(rawFirstLine, MAX_TITLE_LENGTH);
    const wasTruncated = rawFirstLine.length > MAX_TITLE_LENGTH;
    const title = wasTruncated ? titleContent + "\u2026" : titleContent;
    const titleRemainder = rawFirstLine.length > titleContent.length ? rawFirstLine.slice(titleContent.length).trim() : "";
    const content = titleRemainder ? titleRemainder + (restOfLines ? "\n" + restOfLines : "") : restOfLines || this.prompt;
    const collapsiblePart = this._register(this.instantiationService.createInstance(
      ChatCollapsibleMarkdownContentPart,
      title,
      content,
      this.context,
      this.chatContentMarkdownRenderer
    ));
    this.promptContainer = $(".chat-thinking-tool-wrapper.chat-subagent-section");
    const promptIcon = createThinkingIcon(Codicon.comment);
    this.promptContainer.appendChild(promptIcon);
    this.promptContainer.appendChild(collapsiblePart.domNode);
    if (this.wrapper) {
      if (this.wrapper.firstChild) {
        this.wrapper.insertBefore(this.promptContainer, this.wrapper.firstChild);
      } else {
        dom.append(this.wrapper, this.promptContainer);
      }
      if (this.wrapper.style.display === "none") {
        this.wrapper.style.display = "";
      }
    }
  }
  getIsActive() {
    return this.isActive;
  }
  shouldRemainActive() {
    return this.isExternallyActive;
  }
  get hasToolsWaitingForConfirmation() {
    return this.toolsWaitingForConfirmation > 0;
  }
  /** Routes this subagent's initial confirmations to the input carousel. */
  enableCarouselMode(navigateToCarousel, addToolToCarousel, shouldUseCarouselForTool, onDidChangeActiveSubagent) {
    this._useCarouselForConfirmations = true;
    this._navigateToCarousel = navigateToCarousel;
    this._addToolToCarousel = addToolToCarousel;
    this._shouldUseCarouselForTool = shouldUseCarouselForTool;
    this._activeConfirmationTracker.value = onDidChangeActiveSubagent?.((id) => this.setConfirmationActive(id === this.subAgentInvocationId));
  }
  getChatResource() {
    return this._getChatResource();
  }
  setConfirmationActive(active) {
    if (active !== this._confirmationActive) {
      this._confirmationActive = active;
      this._updateOpenChatToolbarContext();
    }
  }
  getAgentLabel() {
    if (this.agentName) {
      return this.agentName;
    }
    if (!this._isDefaultDescription && this.description) {
      return this.description;
    }
    return localize("chat.subagent.prefix", "Subagent");
  }
  markAsInactive(force = false) {
    if (force && this._subagentToolInvocation.toolSpecificData?.kind === "subagent") {
      const data = this._subagentToolInvocation.toolSpecificData;
      data.isActive = false;
      if (data.duration === void 0 && data.startedAt !== void 0) {
        data.duration = Math.max(0, Date.now() - data.startedAt);
      }
    }
    this.isActive = false;
    this._updateOpenChatToolbarContext();
    this.domNode.classList.remove("chat-thinking-active");
    if (this._collapseButton) {
      this._collapseButton.icon = Codicon.check;
    }
    this.removeWorkingSpinner();
    this.hideConfirmationPlaceholder();
    if (this._isDefaultDescription) {
      this.description = localize("chat.subagent.completedDefaultDescription", "Ran subagent");
    }
    this.finalizeTitle();
    this.setExpanded(false);
    this.setContentAnimationEnabled(true);
  }
  markAsActive() {
    if (this.isActive) {
      return;
    }
    this.isActive = true;
    this.setContentAnimationEnabled(false);
    this.domNode.classList.add("chat-thinking-active");
    if (this._collapseButton) {
      this._collapseButton.icon = Codicon.circleFilled;
    }
    if (this.wrapper && !this.hasToolsWaitingForConfirmation) {
      this.showWorkingSpinner();
    }
    this._updateOpenChatToolbarContext();
    this.updateTitle();
  }
  refreshActiveStateFromToolData(toolInvocation) {
    if (toolInvocation.toolSpecificData?.kind !== "subagent") {
      return;
    }
    this._updateOpenChatToolbarContext();
    if (toolInvocation.toolSpecificData.isActive === void 0) {
      return;
    }
    this.isExternallyActive = toolInvocation.toolSpecificData.isActive;
    if (toolInvocation.toolSpecificData.isActive) {
      this.markAsActive();
    } else {
      this.markAsInactive();
    }
  }
  finalizeTitle() {
    this.updateTitle();
    if (this._collapseButton) {
      this._collapseButton.icon = Codicon.check;
    }
  }
  updateTitle() {
    const rawName = this.agentName || localize("chat.subagent.prefix", "Subagent");
    const prefix = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    const shimmerText = `${prefix}: ${this.description}`;
    const toolCallText = this.currentRunningToolMessage && this.isActive ? ` \u2014 ${this.currentRunningToolMessage}` : ``;
    if (!this._collapseButton) {
      return;
    }
    const labelElement = this._collapseButton.labelElement;
    if (!this.isActive) {
      labelElement.textContent = "";
      this.titleShimmerSpan = void 0;
      this._titleDetailRendered.clear();
      this._titleFileWidgetStore.clear();
      this.titleDetailContainer = void 0;
      const prefixSpan = $("span");
      prefixSpan.textContent = `${prefix}:`;
      labelElement.appendChild(prefixSpan);
      const descSpan = $("span.chat-thinking-title-detail-text");
      descSpan.textContent = ` ${this.description}`;
      labelElement.appendChild(descSpan);
      this._collapseButton.element.ariaLabel = shimmerText;
      this._collapseButton.element.ariaExpanded = String(this.isExpanded());
      return;
    }
    if (!this.titleShimmerSpan || !this.titleShimmerSpan.parentElement) {
      labelElement.textContent = "";
      this.titleShimmerSpan = $("span.chat-thinking-title-shimmer");
      labelElement.appendChild(this.titleShimmerSpan);
    }
    this.titleShimmerSpan.textContent = shimmerText;
    this._titleDetailRendered.clear();
    this._titleFileWidgetStore.clear();
    if (!toolCallText) {
      if (this.titleDetailContainer) {
        this.titleDetailContainer.remove();
        this.titleDetailContainer = void 0;
      }
    } else {
      const result = this.chatContentMarkdownRenderer.render(new MarkdownString(toolCallText));
      result.element.classList.add("collapsible-title-content", "chat-thinking-title-detail");
      renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._titleFileWidgetStore);
      this._titleDetailRendered.value = result;
      if (this.titleDetailContainer) {
        this.titleDetailContainer.replaceWith(result.element);
      } else {
        labelElement.appendChild(result.element);
      }
      this.titleDetailContainer = result.element;
    }
    const fullLabel = `${shimmerText}${toolCallText}`;
    this._collapseButton.element.ariaLabel = fullLabel;
    this._collapseButton.element.ariaExpanded = String(this.isExpanded());
  }
  updateHover() {
    if (!this._collapseButton) {
      return;
    }
    const parts = [];
    if (this.modelName) {
      parts.push(localize("chat.subagent.modelTooltip", "Model: {0}", this.modelName));
    }
    if (typeof this.credits === "number" && this.credits > 0) {
      const formatted = formatCopilotCredits(this.credits);
      parts.push(formatted === "1" ? localize("chat.subagent.creditTooltip", "{0} credit", formatted) : localize("chat.subagent.creditsTooltip", "{0} credits", formatted));
    }
    if (parts.length === 0) {
      this._hoverDisposable.clear();
      return;
    }
    this._hoverDisposable.value = this.hoverService.setupDelayedHover(this._collapseButton.element, {
      content: parts.join(" \u2022 ")
    });
  }
  /**
   * Re-reads the subagent's credit (AIC) usage from `toolSpecificData` and
   * refreshes the hover tooltip when it has changed. Credits can arrive
   * incrementally while the subagent runs and continue updating until its
   * child turns report their final usage.
   */
  refreshCreditsFromToolData(toolInvocation) {
    if (toolInvocation.toolSpecificData?.kind !== "subagent") {
      return;
    }
    const credits = toolInvocation.toolSpecificData.credits;
    if (typeof credits === "number" && credits !== this.credits) {
      this.credits = credits;
      this.updateHover();
    }
  }
  /**
   * Re-reads the subagent's model name from `toolSpecificData` and refreshes
   * the hover when it changes. The model can arrive incrementally (e.g. agent
   * host subagents report it via their child turns' usage events).
   */
  refreshModelFromToolData(toolInvocation) {
    if (toolInvocation.toolSpecificData?.kind !== "subagent") {
      return;
    }
    const modelName = toolInvocation.toolSpecificData.modelName;
    if (modelName && modelName !== this.modelName) {
      this.modelName = modelName;
      this.updateHover();
      this._updateOpenChatToolbarContext();
    }
  }
  getToolLabel(toolInvocation) {
    if (toolInvocation.toolSpecificData?.kind === "terminal" && !isLegacyChatTerminalToolInvocationData(toolInvocation.toolSpecificData)) {
      const intention = toolInvocation.toolSpecificData.intention?.replace(/\s+/g, " ").trim();
      if (intention) {
        return intention;
      }
    }
    const message = toolInvocation.invocationMessage;
    const messageText = typeof message === "string" ? message : message.value;
    return messageText.replace(/\s+/g, " ").trim() || void 0;
  }
  /**
   * Tracks a tool invocation's state for:
   * 1. Updating the title with the current tool message (persists even after completion)
   * 2. Auto-expanding when a tool is waiting for confirmation
   * 3. Auto-collapsing when the confirmation is addressed
   * This method is public to support testing.
   */
  trackToolState(toolInvocation) {
    if (toolInvocation.kind !== "toolInvocation") {
      return;
    }
    this.currentRunningToolCallId = toolInvocation.toolCallId;
    this.currentRunningToolMessage = this.getToolLabel(toolInvocation);
    this.currentRunningToolIcon = getToolInvocationIcon(toolInvocation.toolId, toolInvocation.icon);
    this._updateOpenChatToolbarContext();
    this.updateTitle();
    const addToolToCarousel = this._addToolToCarousel;
    const shouldUseCarouselForTool = this._shouldUseCarouselForTool;
    let wasWaitingForConfirmation = false;
    let wasWaitingForCarouselConfirmation = false;
    const toolStateAutorun = autorun((r) => {
      const state = toolInvocation.state.read(r);
      if (this.currentRunningToolCallId === toolInvocation.toolCallId) {
        const toolLabel = this.getToolLabel(toolInvocation);
        if (toolLabel !== this.currentRunningToolMessage) {
          this.currentRunningToolMessage = toolLabel;
          this._updateOpenChatToolbarContext();
          this.updateTitle();
        }
      }
      const isWaitingForConfirmation = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval || state.type === IChatToolInvocation.StateKind.WaitingForAuthentication;
      const isWaitingForCarouselConfirmation = !!addToolToCarousel && shouldUseCarouselForTool?.(toolInvocation, state) === true;
      if (isWaitingForConfirmation && !wasWaitingForConfirmation) {
        this.toolsWaitingForConfirmation++;
        if (!this.isExpanded()) {
          this.autoExpandedForConfirmation = true;
          this.setExpanded(true);
        }
        this.removeWorkingSpinner();
      } else if (!isWaitingForConfirmation && wasWaitingForConfirmation) {
        this.toolsWaitingForConfirmation--;
        if (this.toolsWaitingForConfirmation === 0 && this.autoExpandedForConfirmation && !this.userManuallyExpanded) {
          this.autoExpandedForConfirmation = false;
          this.setExpanded(false);
        }
        if (this.toolsWaitingForConfirmation === 0 && this.isActive) {
          this.showWorkingSpinner();
        }
      }
      if (isWaitingForCarouselConfirmation && !wasWaitingForCarouselConfirmation) {
        this.toolsWaitingForCarouselConfirmation++;
        this._updateOpenChatToolbarContext();
        addToolToCarousel(toolInvocation);
        this.showConfirmationPlaceholder();
      } else if (!isWaitingForCarouselConfirmation && wasWaitingForCarouselConfirmation) {
        this.toolsWaitingForCarouselConfirmation--;
        this._updateOpenChatToolbarContext();
        if (this.toolsWaitingForCarouselConfirmation === 0) {
          this.hideConfirmationPlaceholder();
        } else {
          this.updateConfirmationPlaceholderLabel();
        }
      }
      wasWaitingForConfirmation = isWaitingForConfirmation;
      wasWaitingForCarouselConfirmation = isWaitingForCarouselConfirmation;
      if (state.type === IChatToolInvocation.StateKind.Completed || state.type === IChatToolInvocation.StateKind.Cancelled) {
        queueMicrotask(() => this._toolStateTracking.delete(toolStateAutorun));
      }
    });
    this._toolStateTracking.add(toolStateAutorun);
  }
  getConfirmationPlaceholderText() {
    const count = this.toolsWaitingForCarouselConfirmation;
    return count === 1 ? localize("chat.subagent.pendingConfirmation", "1 pending confirmation") : localize("chat.subagent.pendingConfirmations", "{0} pending confirmations", count);
  }
  updateConfirmationPlaceholderLabel() {
    if (this._confirmationPlaceholderLabel) {
      this._confirmationPlaceholderLabel.textContent = this.getConfirmationPlaceholderText();
    }
  }
  /** Shows a placeholder that jumps back to the carousel. */
  showConfirmationPlaceholder() {
    if (this._confirmationPlaceholder) {
      this.updateConfirmationPlaceholderLabel();
      return;
    }
    const placeholder = $("button.chat-subagent-confirmation-placeholder");
    const label = $("span.chat-subagent-placeholder-label");
    label.textContent = this.getConfirmationPlaceholderText();
    placeholder.appendChild(label);
    this._confirmationPlaceholder = placeholder;
    this._confirmationPlaceholderLabel = label;
    const placeholderDisposables = new DisposableStore();
    placeholderDisposables.add(dom.addDisposableListener(placeholder, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._navigateToCarousel?.(this.subAgentInvocationId);
    }));
    this._confirmationPlaceholderDisposable.value = placeholderDisposables;
    if (!this.hasToolItems) {
      this.hasToolItems = true;
      if (this.wrapper) {
        this.wrapper.style.display = "";
      }
    }
    if (!this.isExpanded()) {
      this.autoExpandedForConfirmation = true;
      this.setExpanded(true);
    }
    if (this.wrapper) {
      this.wrapper.appendChild(placeholder);
    }
    this.layoutScheduler.schedule();
  }
  hideConfirmationPlaceholder() {
    if (this._confirmationPlaceholder) {
      this._confirmationPlaceholder.remove();
      this._confirmationPlaceholder = void 0;
      this._confirmationPlaceholderLabel = void 0;
      this._confirmationPlaceholderDisposable.clear();
      this.layoutScheduler.schedule();
    }
  }
  /** Keeps the carousel placeholder after visible tool output. */
  ensurePlaceholderAtBottom() {
    if (this._confirmationPlaceholder?.parentElement === this.wrapper) {
      this.wrapper.appendChild(this._confirmationPlaceholder);
    }
  }
  /**
   * Watches the tool invocation for completion and renders the result.
   * Handles both live and serialized invocations.
   */
  watchToolCompletion(toolInvocation) {
    if (!ChatSubagentContentPart.isParentSubagentTool(toolInvocation)) {
      return;
    }
    if (toolInvocation.kind === "toolInvocation") {
      let wasStreaming = toolInvocation.state.get().type === IChatToolInvocation.StateKind.Streaming;
      this._register(autorun((r) => {
        const state = toolInvocation.state.read(r);
        this.refreshActiveStateFromToolData(toolInvocation);
        if (state.type === IChatToolInvocation.StateKind.Completed) {
          wasStreaming = false;
          const textParts = (state.contentForModel || []).filter((part) => part.kind === "text").map((part) => part.value);
          if (textParts.length > 0) {
            this.renderResultText(textParts.join("\n"));
          }
          if (toolInvocation.toolSpecificData?.kind === "subagent") {
            if (toolInvocation.toolSpecificData.description) {
              this.description = toolInvocation.toolSpecificData.description;
              this._isDefaultDescription = false;
            }
            if (toolInvocation.toolSpecificData.modelName) {
              this.modelName = toolInvocation.toolSpecificData.modelName;
              this.updateHover();
              this._updateOpenChatToolbarContext();
            }
          }
          this.refreshCreditsFromToolData(toolInvocation);
          this._updateOpenChatLink();
          if (!this.isExternallyActive) {
            this.markAsInactive();
          }
        } else if (wasStreaming && state.type !== IChatToolInvocation.StateKind.Streaming) {
          wasStreaming = false;
          const { description, isDefaultDescription, agentName, prompt, modelName } = ChatSubagentContentPart.extractSubagentInfo(toolInvocation);
          this.description = description;
          this._isDefaultDescription = isDefaultDescription;
          this.agentName = agentName;
          this.prompt = prompt;
          if (modelName) {
            this.modelName = modelName;
            this.updateHover();
            this._updateOpenChatToolbarContext();
          }
          this.refreshCreditsFromToolData(toolInvocation);
          this.renderPromptSection();
          this.updateTitle();
        } else if (toolInvocation.toolSpecificData?.kind === "subagent") {
          const { description, isDefaultDescription, agentName } = ChatSubagentContentPart.extractSubagentInfo(toolInvocation);
          const descriptionChanged = this._isDefaultDescription && !isDefaultDescription;
          const agentNameChanged = !!agentName && agentName !== this.agentName;
          if (descriptionChanged || agentNameChanged) {
            if (descriptionChanged) {
              this.description = description;
              this._isDefaultDescription = isDefaultDescription;
            }
            if (agentNameChanged) {
              this.agentName = agentName;
            }
            this.updateTitle();
          }
          this.refreshCreditsFromToolData(toolInvocation);
          this.refreshModelFromToolData(toolInvocation);
          this._updateOpenChatLink();
        }
      }));
    } else if (toolInvocation.toolSpecificData?.kind === "subagent" && toolInvocation.toolSpecificData.result) {
      this.renderResultText(toolInvocation.toolSpecificData.result);
      this.markAsInactive();
    }
  }
  /**
   * Renders the result text as a collapsible section.
   * If the wrapper doesn't exist yet (lazy init) or subagent is initially complete,
   * this is deferred until expanded.
   */
  renderResultText(resultText) {
    if (this.resultContainer || !resultText) {
      return;
    }
    if (!this.wrapper || this.isInitiallyComplete && !this.isExpanded() && !this.hasExpandedOnce) {
      this.pendingResultText = resultText;
      return;
    }
    this.pendingResultText = void 0;
    this.doRenderResultText(resultText);
  }
  doRenderResultText(resultText) {
    if (this.resultContainer || !resultText) {
      return;
    }
    const lines = resultText.split("\n");
    const rawFirstLine = lines[0] || "";
    const restOfLines = lines.slice(1).join("\n").trim();
    const titleContent = rcut(rawFirstLine, MAX_TITLE_LENGTH);
    const wasTruncated = rawFirstLine.length > MAX_TITLE_LENGTH;
    const title = wasTruncated ? titleContent + "\u2026" : titleContent;
    const titleRemainder = rawFirstLine.length > titleContent.length ? rawFirstLine.slice(titleContent.length).trim() : "";
    const content = titleRemainder ? titleRemainder + (restOfLines ? "\n" + restOfLines : "") : restOfLines;
    const collapsiblePart = this._register(this.instantiationService.createInstance(
      ChatCollapsibleMarkdownContentPart,
      title,
      content,
      this.context,
      this.chatContentMarkdownRenderer
    ));
    this.resultContainer = $(".chat-thinking-tool-wrapper.chat-subagent-section");
    const resultIcon = createThinkingIcon(Codicon.check);
    this.resultContainer.appendChild(resultIcon);
    this.resultContainer.appendChild(collapsiblePart.domNode);
    if (this.wrapper) {
      dom.append(this.wrapper, this.resultContainer);
      if (this.wrapper.style.display === "none") {
        this.wrapper.style.display = "";
      }
    }
  }
  /**
   * Appends a tool invocation to the subagent group.
   * The tool part is created lazily - only when the subagent section is expanded,
   * unless it's actively streaming (not initially complete), in which case render immediately.
   */
  appendToolInvocation(toolInvocation, codeBlockStartIndex) {
    if (!this.hasToolItems) {
      this.hasToolItems = true;
      if (this.wrapper) {
        this.wrapper.style.display = "";
      }
    }
    this.trackToolState(toolInvocation);
    if (this.isExpanded() || this.hasExpandedOnce) {
      const part = this.createToolPart(toolInvocation, codeBlockStartIndex);
      this.appendToolPartToDOM(part, toolInvocation);
    } else {
      const item = {
        kind: "tool",
        lazy: new Lazy(() => this.createToolPart(toolInvocation, codeBlockStartIndex)),
        toolInvocation,
        codeBlockStartIndex
      };
      this.lazyItems.push(item);
    }
  }
  /**
   * Appends a markdown item (e.g., an edit pill) to the subagent content part.
   * This is used to route codeblockUri parts with subAgentInvocationId to this subagent's container.
   *
   * When the caller has already created the content part eagerly (for example, a
   * pre-built `ChatMarkdownContentPart` wrapped in a factory), the caller MUST pass
   * that part as `eagerDisposable` so it is registered on this subagent part
   * immediately. Otherwise, if the subagent section is collapsed and the lazy item
   * is never materialized, the eagerly-created part would leak.
   */
  appendMarkdownItem(factory, _codeblocksPartId, _markdown, _originalParent, eagerDisposable) {
    if (eagerDisposable) {
      this._register(eagerDisposable);
    }
    if (this.isExpanded() || this.hasExpandedOnce) {
      const result = factory();
      this.appendMarkdownItemToDOM(result.domNode);
      if (result.disposable && result.disposable !== eagerDisposable) {
        this._register(result.disposable);
      }
    } else {
      const item = {
        kind: "markdown",
        lazy: new Lazy(factory),
        eagerlyRegistered: !!eagerDisposable
      };
      this.lazyItems.push(item);
    }
  }
  /**
   * Appends a hook item (blocked/warning) to the subagent content part.
   */
  appendHookItem(factory, hookPart) {
    const hookMessage = hookPart.stopReason ? hookPart.toolDisplayName ? localize("hook.subagent.blocked", "Blocked {0}", hookPart.toolDisplayName) : localize("hook.subagent.blockedGeneric", "Blocked by hook") : hookPart.toolDisplayName ? localize("hook.subagent.warning", "Warning for {0}", hookPart.toolDisplayName) : localize("hook.subagent.warningGeneric", "Hook warning");
    this.currentRunningToolMessage = hookMessage;
    this.currentRunningToolCallId = void 0;
    this.currentRunningToolIcon = hookPart.stopReason ? Codicon.error : Codicon.warning;
    this._updateOpenChatToolbarContext();
    this.updateTitle();
    if (this.isExpanded() || this.hasExpandedOnce) {
      const result = factory();
      this.appendHookItemToDOM(result.domNode, hookPart);
      if (result.disposable) {
        this._register(result.disposable);
      }
    } else {
      const item = {
        kind: "hook",
        lazy: new Lazy(factory),
        hookPart
      };
      this.lazyItems.push(item);
    }
  }
  /**
   * Appends a hook item's DOM node to the wrapper.
   */
  appendHookItemToDOM(domNode, hookPart) {
    const itemWrapper = $(".chat-thinking-tool-wrapper");
    const icon = hookPart.stopReason ? Codicon.error : Codicon.warning;
    const iconElement = createThinkingIcon(icon);
    itemWrapper.appendChild(iconElement);
    itemWrapper.appendChild(domNode);
    if (!this.hasToolItems) {
      this.hasToolItems = true;
      if (this.wrapper) {
        this.wrapper.style.display = "";
      }
    }
    if (this.wrapper) {
      if (this.resultContainer) {
        this.wrapper.insertBefore(itemWrapper, this.resultContainer);
      } else {
        this.wrapper.appendChild(itemWrapper);
      }
    }
    this.lastItemWrapper = itemWrapper;
    this.layoutScheduler.schedule();
  }
  /**
   * Appends a markdown item's DOM node to the wrapper.
   */
  appendMarkdownItemToDOM(domNode) {
    if (!domNode.hasChildNodes() || domNode.textContent?.trim() === "") {
      return;
    }
    const itemWrapper = $(".chat-thinking-tool-wrapper");
    const iconElement = createThinkingIcon(Codicon.edit);
    itemWrapper.appendChild(domNode);
    itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);
    if (this.wrapper) {
      if (this.resultContainer) {
        this.wrapper.insertBefore(itemWrapper, this.resultContainer);
      } else {
        this.wrapper.appendChild(itemWrapper);
      }
    }
    this.lastItemWrapper = itemWrapper;
    this.layoutScheduler.schedule();
  }
  shouldInitEarly() {
    return false;
  }
  shouldAnimateContent() {
    return !this.isActive;
  }
  shouldPrepareContentAnimation() {
    return true;
  }
  /**
   * Creates a ChatToolInvocationPart for the given tool invocation.
   */
  createToolPart(toolInvocation, codeBlockStartIndex) {
    const part = this.instantiationService.createInstance(
      ChatToolInvocationPart,
      toolInvocation,
      this.context,
      this.chatContentMarkdownRenderer,
      this.listPool,
      this.editorPool,
      this.currentWidthDelegate,
      this.announcedToolProgressKeys,
      codeBlockStartIndex
    );
    this._register(part);
    return part;
  }
  /**
   * Appends a tool part's DOM node to the wrapper with appropriate icon wrapper.
   */
  appendToolPartToDOM(part, toolInvocation) {
    const content = part.domNode;
    if (!content.hasChildNodes() || content.textContent?.trim() === "") {
      return;
    }
    const itemWrapper = $(".chat-thinking-tool-wrapper");
    const icon = getToolInvocationIcon(toolInvocation.toolId, toolInvocation.icon);
    const iconElement = createThinkingIcon(icon);
    itemWrapper.appendChild(content);
    if (toolInvocation.kind === "toolInvocation") {
      const shouldUseCarouselForTool = this._shouldUseCarouselForTool;
      const iconAutorun = autorun((r) => {
        const state = toolInvocation.state.read(r);
        const hasConfirmation = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval;
        const shouldHideInline = shouldUseCarouselForTool?.(toolInvocation, state) === true;
        if (hasConfirmation) {
          iconElement.remove();
          if (shouldHideInline) {
            itemWrapper.style.display = "none";
          } else {
            itemWrapper.style.display = "";
          }
        } else {
          if (!iconElement.parentElement) {
            itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);
          }
          if (this._useCarouselForConfirmations) {
            itemWrapper.style.display = "";
            this.ensurePlaceholderAtBottom();
          }
        }
        if (state.type === IChatToolInvocation.StateKind.Completed || state.type === IChatToolInvocation.StateKind.Cancelled) {
          queueMicrotask(() => this._toolStateTracking.delete(iconAutorun));
        }
      });
      this._toolStateTracking.add(iconAutorun);
    } else {
      itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);
    }
    if (this.wrapper) {
      const anchor = this._confirmationPlaceholder ?? this.workingSpinnerElement ?? this.resultContainer;
      if (anchor) {
        this.wrapper.insertBefore(itemWrapper, anchor);
      } else {
        this.wrapper.appendChild(itemWrapper);
      }
    }
    this.lastItemWrapper = itemWrapper;
    this.layoutScheduler.schedule();
  }
  /**
   * Materializes a lazy item by creating the content and adding it to the DOM.
   */
  materializeLazyItem(item) {
    if (item.lazy.hasValue) {
      return;
    }
    if (item.kind === "tool") {
      const part = item.lazy.value;
      this.appendToolPartToDOM(part, item.toolInvocation);
    } else if (item.kind === "markdown") {
      const result = item.lazy.value;
      this.appendMarkdownItemToDOM(result.domNode);
      if (result.disposable && !item.eagerlyRegistered) {
        this._register(result.disposable);
      }
    } else if (item.kind === "hook") {
      const result = item.lazy.value;
      this.appendHookItemToDOM(result.domNode, item.hookPart);
      if (result.disposable) {
        this._register(result.disposable);
      }
    }
  }
  /**
   * Materializes all pending lazy content (prompt, tool items, result) when the section is expanded.
   * This is called when first expanded, but the wrapper must exist (created by base class initContent).
   */
  materializePendingContent() {
    if (!this.wrapper) {
      return;
    }
    if (this.pendingPromptRender) {
      this.pendingPromptRender = false;
      this.doRenderPromptSection();
    }
    for (const item of this.lazyItems) {
      this.materializeLazyItem(item);
    }
    if (this.pendingResultText) {
      const resultText = this.pendingResultText;
      this.pendingResultText = void 0;
      this.doRenderResultText(resultText);
    }
  }
  performLayout() {
    if (this.lastItemWrapper && this.wrapper) {
      const height = this.lastItemWrapper.offsetHeight;
      if (height > 0) {
        this.wrapper.style.setProperty("--chat-subagent-last-item-height", `${height}px`);
      }
    }
    if (this.isActive && !this.isInitiallyComplete && this.wrapper) {
      const scrollHeight = this.wrapper.scrollHeight;
      this.wrapper.scrollTop = scrollHeight;
    }
  }
  hasSameContent(other, _followingContent, _element) {
    return (other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && ChatSubagentContentPart.isParentSubagentTool(other) && this.subAgentInvocationId === other.toolCallId;
  }
};
ChatSubagentContentPart = __decorateClass([
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IChatMarkdownAnchorService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IAccessibilityService),
  __decorateParam(13, IActionViewItemService),
  __decorateParam(14, IMenuService),
  __decorateParam(15, IContextKeyService)
], ChatSubagentContentPart);
export {
  ChatSubagentContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0U3ViYWdlbnRDb250ZW50UGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7ICQsIEFuaW1hdGlvbkZyYW1lU2NoZWR1bGVyLCBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBJUmVuZGVyZWRNYXJrZG93biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IHJjdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIFdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQ0hBVF9PUEVOX0FHRU5UX0hPU1RfQ0hBVF9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBmb3JtYXRDb3BpbG90Q3JlZGl0cywgSUNoYXRIb29rUGFydCwgSUNoYXRNYXJrZG93bkNvbnRlbnQsIElDaGF0VG9vbEludm9jYXRpb24sIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLCBpc0xlZ2FjeUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlbmRlcmVyQ29udGVudCwgaXNSZXNwb25zZVZNIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSVJ1blN1YmFnZW50VG9vbElucHV0UGFyYW1zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9ydW5TdWJhZ2VudFRvb2wuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVJdGVtIH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29sbGFwc2libGVDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbGxhcHNpYmxlTWFya2Rvd25Db250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbGxhcHNpYmxlTWFya2Rvd25Db250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQb29sIH0gZnJvbSAnLi9jaGF0Q29udGVudENvZGVQb29scy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0LCBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyByZW5kZXJGaWxlV2lkZ2V0cyB9IGZyb20gJy4vY2hhdElubGluZUFuY2hvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSB9IGZyb20gJy4vY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2xsYXBzaWJsZUxpc3RQb29sIH0gZnJvbSAnLi9jaGF0UmVmZXJlbmNlc0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IGJ1aWxkUGhyYXNlUG9vbCwgY3JlYXRlVGhpbmtpbmdJY29uLCBnZXRUb29sSW52b2NhdGlvbkljb24gfSBmcm9tICcuL2NoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUb29sSW52b2NhdGlvblBhcnQgfSBmcm9tICcuL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdFRvb2xJbnZvY2F0aW9uUGFydC5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvY2hhdFN1YmFnZW50Q29udGVudC5jc3MnO1xuXG5jb25zdCBNQVhfVElUTEVfTEVOR1RIID0gMTAwO1xuXG5jb25zdCBzdWJhZ2VudFdvcmtpbmdNZXNzYWdlcyA9IFtcblx0bG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQud29ya2luZy4xJywgJ1Byb2Nlc3NpbmcnKSxcblx0bG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQud29ya2luZy4yJywgJ1ByZXBhcmluZycpLFxuXHRsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC53b3JraW5nLjMnLCAnTG9hZGluZycpLFxuXHRsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC53b3JraW5nLjQnLCAnQW5hbHl6aW5nJyksXG5cdGxvY2FsaXplKCdjaGF0LnN1YmFnZW50LndvcmtpbmcuNScsICdFdmFsdWF0aW5nJyksXG5dO1xuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBsYXp5IHRvb2wgaXRlbSB0aGF0IHdpbGwgYmUgY3JlYXRlZCB3aGVuIHRoZSBzdWJhZ2VudCBzZWN0aW9uIGlzIGV4cGFuZGVkLlxuICovXG5pbnRlcmZhY2UgSUxhenlUb29sSXRlbSB7XG5cdGtpbmQ6ICd0b29sJztcblx0bGF6eTogTGF6eTxDaGF0VG9vbEludm9jYXRpb25QYXJ0Pjtcblx0dG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblx0Y29kZUJsb2NrU3RhcnRJbmRleDogbnVtYmVyO1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBsYXp5IG1hcmtkb3duIGl0ZW0gKGUuZy4sIGVkaXQgcGlsbCkgdGhhdCB3aWxsIGJlIHJlbmRlcmVkIHdoZW4gZXhwYW5kZWQuXG4gKi9cbmludGVyZmFjZSBJTGF6eU1hcmtkb3duSXRlbSB7XG5cdGtpbmQ6ICdtYXJrZG93bic7XG5cdGxhenk6IExhenk8eyBkb21Ob2RlOiBIVE1MRWxlbWVudDsgZGlzcG9zYWJsZT86IElEaXNwb3NhYmxlIH0+O1xuXHQvKipcblx0ICogVHJ1ZSB3aGVuIHRoZSBjYWxsZXIgcGFzc2VkIGFuIGVhZ2VyRGlzcG9zYWJsZSB0aGF0IGhhcyBhbHJlYWR5IGJlZW4gcmVnaXN0ZXJlZCBvbiB0aGlzXG5cdCAqIHN1YmFnZW50IHBhcnQuIEluIHRoYXQgY2FzZSwgbWF0ZXJpYWxpemVMYXp5SXRlbSBtdXN0IG5vdCByZWdpc3RlciB0aGUgZmFjdG9yeSdzIHJldHVybmVkXG5cdCAqIGRpc3Bvc2FibGUgYWdhaW4uXG5cdCAqL1xuXHRlYWdlcmx5UmVnaXN0ZXJlZD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIGxhenkgaG9vayBpdGVtIChibG9ja2VkL3dhcm5pbmcpIHRoYXQgd2lsbCBiZSByZW5kZXJlZCB3aGVuIGV4cGFuZGVkLlxuICovXG5pbnRlcmZhY2UgSUxhenlIb29rSXRlbSB7XG5cdGtpbmQ6ICdob29rJztcblx0bGF6eTogTGF6eTx7IGRvbU5vZGU6IEhUTUxFbGVtZW50OyBkaXNwb3NhYmxlPzogSURpc3Bvc2FibGUgfT47XG5cdGhvb2tQYXJ0OiBJQ2hhdEhvb2tQYXJ0O1xufVxuXG50eXBlIElMYXp5SXRlbSA9IElMYXp5VG9vbEl0ZW0gfCBJTGF6eU1hcmtkb3duSXRlbSB8IElMYXp5SG9va0l0ZW07XG5cbi8qKlxuICogVGhpcyBpcyBnZW5lcmFsbHkgY29waWVkIGZyb20gQ2hhdFRoaW5raW5nQ29udGVudFBhcnQuIFdlIGFyZSBzdGlsbCBleHBlcmltZW50aW5nIHdpdGggYm90aCBVSXMgc28gSSdtIG5vdFxuICogdHJ5aW5nIHRvIHJlZmFjdG9yIHRvIHNoYXJlIGNvZGUuIEJvdGggY291bGQgcHJvYmFibHkgYmUgc2ltcGxpZmllZCB3aGVuIHN0YWJsZS5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0IGV4dGVuZHMgQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQgaW1wbGVtZW50cyBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0cHJpdmF0ZSB3cmFwcGVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgaXNBY3RpdmU6IGJvb2xlYW47XG5cdHByaXZhdGUgaXNFeHRlcm5hbGx5QWN0aXZlOiBib29sZWFuO1xuXHRwcml2YXRlIGhhc1Rvb2xJdGVtczogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlzSW5pdGlhbGx5Q29tcGxldGU6IGJvb2xlYW47XG5cdHByaXZhdGUgcHJvbXB0Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZXN1bHRDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGxhc3RJdGVtV3JhcHBlcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2NoZWR1bGVyOiBBbmltYXRpb25GcmFtZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRwcml2YXRlIGFnZW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHByb21wdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8vIExhenkgcmVuZGVyaW5nIHN1cHBvcnRcblx0cHJpdmF0ZSByZWFkb25seSBsYXp5SXRlbXM6IElMYXp5SXRlbVtdID0gW107XG5cdHByaXZhdGUgaGFzRXhwYW5kZWRPbmNlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcGVuZGluZ1Byb21wdFJlbmRlcjogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHBlbmRpbmdSZXN1bHRUZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Ly8gQ3VycmVudCB0b29sIG1lc3NhZ2UgZm9yIGNvbGxhcHNlZCB0aXRsZSAocGVyc2lzdHMgZXZlbiBhZnRlciB0b29sIGNvbXBsZXRlcylcblx0cHJpdmF0ZSBjdXJyZW50UnVubmluZ1Rvb2xNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VycmVudFJ1bm5pbmdUb29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VycmVudFJ1bm5pbmdUb29sSWNvbjogVGhlbWVJY29uIHwgdW5kZWZpbmVkO1xuXG5cdC8vIE1vZGVsIG5hbWUgdXNlZCBieSB0aGlzIHN1YmFnZW50IGZvciBob3ZlciB0b29sdGlwXG5cdHByaXZhdGUgbW9kZWxOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8vIENvcGlsb3QgY3JlZGl0cyAoQUlDKSBjb25zdW1lZCBieSB0aGlzIHN1YmFnZW50LCBzaG93biBpbiB0aGUgaG92ZXIgdG9vbHRpcFxuXHRwcml2YXRlIGNyZWRpdHM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNEZWZhdWx0RGVzY3JpcHRpb246IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHQvLyBUaGUgc3ViYWdlbnQgdG9vbCBpbnZvY2F0aW9uLCBrZXB0IHNvIHRoZSBcIk9wZW4gU3ViYWdlbnRcIiBhY3Rpb24gY2FuIHJlLXJlYWRcblx0Ly8gdGhlIHN1YmFnZW50IGNoYXQgcmVzb3VyY2UgYXMgaXQgYXJyaXZlcy9jaGFuZ2VzLlxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdWJhZ2VudFRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdC8qKlxuXHQgKiBUb29sYmFyIGhvc3RpbmcgdGhlIGBNZW51SWQuQ2hhdFN1YmFnZW50Q29udGVudGAgbWVudSBpbiB0aGUgc3ViYWdlbnRcblx0ICogaGVhZGVyLiBUaGUgQWdlbnRzIHdpbmRvdyBjb250cmlidXRlcyBhbiBcIk9wZW4gU3ViYWdlbnRcIiBhY3Rpb24gKHJlbmRlcmVkXG5cdCAqIGFzIGEgcGlsbCkgaW50byB0aGlzIG1lbnU7IGVsc2V3aGVyZSB0aGUgbWVudSBpcyBlbXB0eSBhbmQgbm90aGluZyBzaG93cy5cblx0ICovXG5cdHByaXZhdGUgX29wZW5DaGF0VG9vbGJhcjogV29ya2JlbmNoVG9vbEJhciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfb3BlbkNoYXRUb29sYmFyQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfb3BlbkNoYXRBY3Rpb25MaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb3BlbkNoYXRBY3Rpb25WaWV3UmVnaXN0cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdC8vIENvbmZpcm1hdGlvbiBhdXRvLWV4cGFuZCB0cmFja2luZ1xuXHRwcml2YXRlIHRvb2xzV2FpdGluZ0ZvckNvbmZpcm1hdGlvbjogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSB1c2VyTWFudWFsbHlFeHBhbmRlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGF1dG9FeHBhbmRlZEZvckNvbmZpcm1hdGlvbjogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdC8vIENhcm91c2VsIGNvbmZpcm1hdGlvbiBwbGFjZWhvbGRlclxuXHRwcml2YXRlIF9uYXZpZ2F0ZVRvQ2Fyb3VzZWw6ICgoc3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN0cmluZykgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FkZFRvb2xUb0Nhcm91c2VsOiAoKHRvb2w6IElDaGF0VG9vbEludm9jYXRpb24pID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zaG91bGRVc2VDYXJvdXNlbEZvclRvb2w6ICgodG9vbDogSUNoYXRUb29sSW52b2NhdGlvbiwgc3RhdGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGUpID0+IGJvb2xlYW4pIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb25maXJtYXRpb25QbGFjZWhvbGRlcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbmZpcm1hdGlvblBsYWNlaG9sZGVyTGFiZWw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maXJtYXRpb25QbGFjZWhvbGRlckRpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUNvbmZpcm1hdGlvblRyYWNrZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgX3VzZUNhcm91c2VsRm9yQ29uZmlybWF0aW9uczogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHRvb2xzV2FpdGluZ0ZvckNhcm91c2VsQ29uZmlybWF0aW9uOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9jb25maXJtYXRpb25BY3RpdmUgPSBmYWxzZTtcblxuXHQvKiogUGVyLXRvb2wtaW52b2NhdGlvbiBhdXRvcnVucyBvYnNlcnZpbmcgdG9vbCBzdGF0ZTsgZWFjaCBpcyBkaXNwb3NlZCBvbmNlIGl0cyB0b29sIHJlYWNoZXMgYSB0ZXJtaW5hbCBzdGF0ZSBzbyBsaXN0ZW5lcnMgZG9uJ3QgYWNjdW11bGF0ZSBmb3IgdGhlIHdpZGdldCdzIGxpZmV0aW1lLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sU3RhdGVUcmFja2luZyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Ly8gV29ya2luZyBzcGlubmVyIGVsZW1lbnRzIGZvciBleHBhbmRlZCBzdGF0ZVxuXHRwcml2YXRlIHdvcmtpbmdTcGlubmVyRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgd29ya2luZ1NwaW5uZXJMYWJlbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXZhaWxhYmxlTWVzc2FnZXM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXG5cdC8vIFBlcnNpc3RlbnQgdGl0bGUgZWxlbWVudHMgZm9yIHNoaW1tZXJcblx0cHJpdmF0ZSB0aXRsZVNoaW1tZXJTcGFuOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0aXRsZURldGFpbENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpdGxlRGV0YWlsUmVuZGVyZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVJlbmRlcmVkTWFya2Rvd24+KCkpO1xuXG5cdC8qKlxuXHQgKiBDaGVjayBpZiBhIHRvb2wgaW52b2NhdGlvbiBpcyB0aGUgcGFyZW50IHN1YmFnZW50IHRvb2wgKHRoZSB0b29sIHRoYXQgc3Bhd25zIGEgc3ViYWdlbnQpLlxuXHQgKiBBIHBhcmVudCBzdWJhZ2VudCB0b29sIGhhcyBzdWJhZ2VudCB0b29sU3BlY2lmaWNEYXRhIGJ1dCBubyBzdWJBZ2VudEludm9jYXRpb25JZC5cblx0ICovXG5cdHByaXZhdGUgc3RhdGljIGlzUGFyZW50U3ViYWdlbnRUb29sKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50JyAmJiAhdG9vbEludm9jYXRpb24uc3ViQWdlbnRJbnZvY2F0aW9uSWQ7XG5cdH1cblxuXHQvKipcblx0ICogRXh0cmFjdHMgc3ViYWdlbnQgaW5mbyAoZGVzY3JpcHRpb24sIGFnZW50TmFtZSwgcHJvbXB0KSBmcm9tIGEgdG9vbCBpbnZvY2F0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgZXh0cmFjdFN1YmFnZW50SW5mbyh0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkKTogeyBkZXNjcmlwdGlvbjogc3RyaW5nOyBpc0RlZmF1bHREZXNjcmlwdGlvbjogYm9vbGVhbjsgYWdlbnROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHByb21wdDogc3RyaW5nIHwgdW5kZWZpbmVkOyBtb2RlbE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDsgY3JlZGl0czogbnVtYmVyIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGNvbnN0IGRlZmF1bHREZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdjaGF0LnN1YmFnZW50LmRlZmF1bHREZXNjcmlwdGlvbicsICdSdW5uaW5nIHN1YmFnZW50Jyk7XG5cblx0XHQvLyBPbmx5IHBhcmVudCBzdWJhZ2VudCB0b29scyBjb250YWluIHRoZSBmdWxsIHN1YmFnZW50IGluZm9cblx0XHRpZiAoIUNoYXRTdWJhZ2VudENvbnRlbnRQYXJ0LmlzUGFyZW50U3ViYWdlbnRUb29sKHRvb2xJbnZvY2F0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHsgZGVzY3JpcHRpb246IGRlZmF1bHREZXNjcmlwdGlvbiwgaXNEZWZhdWx0RGVzY3JpcHRpb246IHRydWUsIGFnZW50TmFtZTogdW5kZWZpbmVkLCBwcm9tcHQ6IHVuZGVmaW5lZCwgbW9kZWxOYW1lOiB1bmRlZmluZWQsIGNyZWRpdHM6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIHRvb2xTcGVjaWZpY0RhdGEgZmlyc3QgKHdvcmtzIGZvciBib3RoIGxpdmUgYW5kIHNlcmlhbGl6ZWQpXG5cdFx0aWYgKHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdGNvbnN0IGhhc0Rlc2NyaXB0aW9uID0gISF0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmRlc2NyaXB0aW9uO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuZGVzY3JpcHRpb24gPz8gZGVmYXVsdERlc2NyaXB0aW9uLFxuXHRcdFx0XHRpc0RlZmF1bHREZXNjcmlwdGlvbjogIWhhc0Rlc2NyaXB0aW9uLFxuXHRcdFx0XHRhZ2VudE5hbWU6IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuYWdlbnROYW1lLFxuXHRcdFx0XHRwcm9tcHQ6IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEucHJvbXB0LFxuXHRcdFx0XHRtb2RlbE5hbWU6IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEubW9kZWxOYW1lLFxuXHRcdFx0XHRjcmVkaXRzOiB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmNyZWRpdHMsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEZhbGxiYWNrIHRvIHBhcmFtZXRlcnMgZm9yIGxpdmUgaW52b2NhdGlvbnNcblx0XHRpZiAodG9vbEludm9jYXRpb24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRcdGNvbnN0IHBhcmFtcyA9IHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZyA/XG5cdFx0XHRcdHN0YXRlLnBhcmFtZXRlcnMgYXMgSVJ1blN1YmFnZW50VG9vbElucHV0UGFyYW1zIHwgdW5kZWZpbmVkXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgaGFzRGVzY3JpcHRpb24gPSAhIXBhcmFtcz8uZGVzY3JpcHRpb247XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogcGFyYW1zPy5kZXNjcmlwdGlvbiA/PyBkZWZhdWx0RGVzY3JpcHRpb24sXG5cdFx0XHRcdGlzRGVmYXVsdERlc2NyaXB0aW9uOiAhaGFzRGVzY3JpcHRpb24sXG5cdFx0XHRcdGFnZW50TmFtZTogcGFyYW1zPy5hZ2VudE5hbWUsXG5cdFx0XHRcdHByb21wdDogcGFyYW1zPy5wcm9tcHQsXG5cdFx0XHRcdG1vZGVsTmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRjcmVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGRlc2NyaXB0aW9uOiBkZWZhdWx0RGVzY3JpcHRpb24sIGlzRGVmYXVsdERlc2NyaXB0aW9uOiB0cnVlLCBhZ2VudE5hbWU6IHVuZGVmaW5lZCwgcHJvbXB0OiB1bmRlZmluZWQsIG1vZGVsTmFtZTogdW5kZWZpbmVkLCBjcmVkaXRzOiB1bmRlZmluZWQgfTtcblx0fVxuXG5cdC8qKiBUaGUgc3ViYWdlbnQncyBvd24gY2hhdCByZXNvdXJjZSAoVVJJIHN0cmluZyksIHdoZW4gaXQgcnVucyBhcyBhIGRpc3RpbmN0IGNoYXQuICovXG5cdHByaXZhdGUgX2dldENoYXRSZXNvdXJjZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9zdWJhZ2VudFRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE7XG5cdFx0cmV0dXJuIGRhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcgPyBkYXRhLmNoYXRSZXNvdXJjZSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIChvbmNlKSBhbmQgdG9nZ2xlcyB0aGUgc3ViYWdlbnQgaGVhZGVyIHRvb2xiYXIgdGhhdCBob3N0cyB0aGVcblx0ICogYE1lbnVJZC5DaGF0U3ViYWdlbnRDb250ZW50YCBtZW51LiBUaGUgQWdlbnRzIHdpbmRvdyBjb250cmlidXRlcyBhbiBcIk9wZW5cblx0ICogU3ViYWdlbnRcIiBwaWxsIGludG8gdGhhdCBtZW51IHRvIHJldmVhbCB0aGUgc3ViYWdlbnQncyBvd24gKHJlYWQtb25seSlcblx0ICogY2hhdDsgaW4gdGhlIHJlZ3VsYXIgY2hhdCB2aWV3IHRoZSBtZW51IGlzIGVtcHR5IGFuZCBub3RoaW5nIHJlbmRlcnMuIFRoZVxuXHQgKiBzdWJhZ2VudCBjaGF0IHJlc291cmNlIGNhbiBhcnJpdmUgYWZ0ZXIgdGhlIHBhcnQgaXMgZmlyc3QgY29uc3RydWN0ZWQsIHNvXG5cdCAqIHRoaXMgaXMgYWxzbyBjYWxsZWQgZnJvbSB0aGUgdG9vbC1jb21wbGV0aW9uIGF1dG9ydW4uXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVPcGVuQ2hhdExpbmsoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLl9nZXRDaGF0UmVzb3VyY2UoKTtcblx0XHRpZiAoIXRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFdoZW4gdGhlIHN1YmFnZW50IGhhcyBpdHMgb3duIG9wZW5hYmxlIGNoYXQsIGtlZXAgdGhlIGlubGluZSBibG9ja1xuXHRcdC8vIGNvbGxhcHNlZCB0byBqdXN0IHRoZSBoZWFkZXIgKyBcIk9wZW4gU3ViYWdlbnRcIiBwaWxsIFx1MjAxNCB0aGUgZnVsbCB0cmFuc2NyaXB0XG5cdFx0Ly8gbGl2ZXMgaW4gdGhlIGRlZGljYXRlZCByZWFkLW9ubHkgY2hhdC4gVG9nZ2xlIGEgY2xhc3MgdGhlIENTUyB1c2VzIHRvXG5cdFx0Ly8gc3VwcHJlc3MgdGhlIGNvbGxhcHNlZCBzdHJlYW1pbmcgcGVlay5cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1zdWJhZ2VudC1oYXMtY2hhdCcsICEhcmVzb3VyY2UpO1xuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdHRoaXMuX29wZW5DaGF0VG9vbGJhckNvbnRhaW5lcj8uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fZW5zdXJlT3BlbkNoYXRUb29sYmFyKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlT3BlbkNoYXRUb29sYmFyQ29udGV4dCgpO1xuXHRcdHRoaXMuX29wZW5DaGF0VG9vbGJhckNvbnRhaW5lciEuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVPcGVuQ2hhdFRvb2xiYXIoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX29wZW5DaGF0VG9vbGJhcikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IG1lbnVBY3Rpb24gPSB0aGlzLl9nZXRPcGVuQ2hhdE1lbnVBY3Rpb24oKTtcblx0XHRpZiAoIW1lbnVBY3Rpb24pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aW9uVmlld0l0ZW1Qcm92aWRlciA9IHRoaXMuYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmxvb2tVcChNZW51SWQuQ2hhdFN1YmFnZW50Q29udGVudCwgQ0hBVF9PUEVOX0FHRU5UX0hPU1RfQ0hBVF9DT01NQU5EX0lEKTtcblx0XHRpZiAoIWFjdGlvblZpZXdJdGVtUHJvdmlkZXIpIHtcblx0XHRcdGlmICghdGhpcy5fb3BlbkNoYXRBY3Rpb25WaWV3UmVnaXN0cmF0aW9uLnZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuX29wZW5DaGF0QWN0aW9uVmlld1JlZ2lzdHJhdGlvbi52YWx1ZSA9IEV2ZW50Lm9uY2UoRXZlbnQuZmlsdGVyKFxuXHRcdFx0XHRcdHRoaXMuYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLm9uRGlkQ2hhbmdlLFxuXHRcdFx0XHRcdG1lbnVJZCA9PiBtZW51SWQgPT09IE1lbnVJZC5DaGF0U3ViYWdlbnRDb250ZW50XG5cdFx0XHRcdCkpKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9vcGVuQ2hhdEFjdGlvblZpZXdSZWdpc3RyYXRpb24uY2xlYXIoKTtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVPcGVuQ2hhdExpbmsoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb3BlbkNoYXRBY3Rpb25WaWV3UmVnaXN0cmF0aW9uLmNsZWFyKCk7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gJCgnLmNoYXQtc3ViYWdlbnQtb3Blbi1jaGF0LXRvb2xiYXInKTtcblx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbj8uZWxlbWVudC5wYXJlbnRFbGVtZW50Py5pbnNlcnRCZWZvcmUoY29udGFpbmVyLCB0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50KTtcblx0XHR0aGlzLl9vcGVuQ2hhdFRvb2xiYXJDb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0dGhpcy5fb3BlbkNoYXRUb29sYmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hUb29sQmFyLCBjb250YWluZXIsIHtcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lklnbm9yZSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IGFjdGlvblZpZXdJdGVtUHJvdmlkZXIoXG5cdFx0XHRcdGFjdGlvbixcblx0XHRcdFx0b3B0aW9ucyxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdFx0ZG9tLmdldFdpbmRvdyhjb250YWluZXIpLnZzY29kZVdpbmRvd0lkXG5cdFx0XHQpLFxuXHRcdH0pKTtcblx0XHR0aGlzLl9vcGVuQ2hhdFRvb2xiYXIuc2V0QWN0aW9ucyhbbWVudUFjdGlvbl0pO1xuXHRcdHRoaXMuX3RyYWNrT3BlbkNoYXRBY3Rpb25zKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPcGVuQ2hhdE1lbnVBY3Rpb24oKTogTWVudUl0ZW1BY3Rpb24gfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgWywgYWN0aW9uc10gb2YgdGhpcy5tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuQ2hhdFN1YmFnZW50Q29udGVudCwgdGhpcy5jb250ZXh0S2V5U2VydmljZSwgeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KSkge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gYWN0aW9ucy5maW5kKGFjdGlvbiA9PiBhY3Rpb24uaWQgPT09IENIQVRfT1BFTl9BR0VOVF9IT1NUX0NIQVRfQ09NTUFORF9JRCk7XG5cdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0cmV0dXJuIGFjdGlvbjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3RyYWNrT3BlbkNoYXRBY3Rpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGl0ZW1Db3VudCA9IHRoaXMuX29wZW5DaGF0VG9vbGJhcj8uZ2V0SXRlbXNMZW5ndGgoKSA/PyAwO1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBpdGVtQ291bnQ7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuX29wZW5DaGF0VG9vbGJhcj8uZ2V0SXRlbUFjdGlvbihpbmRleCk7XG5cdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgQWN0aW9uKSB7XG5cdFx0XHRcdHN0b3JlLmFkZChhY3Rpb24ub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fdXBkYXRlT3BlbkNoYXRPbmx5TW9kZSgpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX29wZW5DaGF0QWN0aW9uTGlzdGVuZXJzLnZhbHVlID0gc3RvcmU7XG5cdFx0dGhpcy5fdXBkYXRlT3BlbkNoYXRPbmx5TW9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlT3BlbkNoYXRPbmx5TW9kZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbGxhcHNlQnV0dG9uIHx8ICF0aGlzLl9vcGVuQ2hhdFRvb2xiYXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaXRlbUNvdW50ID0gdGhpcy5fb3BlbkNoYXRUb29sYmFyLmdldEl0ZW1zTGVuZ3RoKCk7XG5cdFx0bGV0IG9wZW5DaGF0T25seSA9IGZhbHNlO1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBpdGVtQ291bnQ7IGluZGV4KyspIHtcblx0XHRcdGlmICh0aGlzLl9vcGVuQ2hhdFRvb2xiYXIuZ2V0SXRlbUFjdGlvbihpbmRleCk/LmVuYWJsZWQpIHtcblx0XHRcdFx0b3BlbkNoYXRPbmx5ID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXN1YmFnZW50LW9wZW4tY2hhdC1vbmx5Jywgb3BlbkNoYXRPbmx5KTtcblx0XHRpZiAob3BlbkNoYXRPbmx5KSB7XG5cdFx0XHRkb20uaGlkZSh0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50KTtcblx0XHRcdGlmICh0aGlzLmNvbnRlbnRBbmltYXRpb25Db250YWluZXIpIHtcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5jb250ZW50QW5pbWF0aW9uQ29udGFpbmVyKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuc2V0RXhwYW5kZWQoZmFsc2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkb20uc2hvdyh0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50KTtcblx0XHRcdGlmICh0aGlzLmNvbnRlbnRBbmltYXRpb25Db250YWluZXIpIHtcblx0XHRcdFx0ZG9tLnNob3codGhpcy5jb250ZW50QW5pbWF0aW9uQ29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVPcGVuQ2hhdFRvb2xiYXJDb250ZXh0KCk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYXRSZXNvdXJjZSA9IHRoaXMuX2dldENoYXRSZXNvdXJjZSgpO1xuXHRcdGlmIChjaGF0UmVzb3VyY2UgJiYgdGhpcy5fb3BlbkNoYXRUb29sYmFyKSB7XG5cdFx0XHRjb25zdCBkYXRhID0gdGhpcy5fc3ViYWdlbnRUb29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhO1xuXHRcdFx0dGhpcy5fb3BlbkNoYXRUb29sYmFyLmNvbnRleHQgPSB7XG5cdFx0XHRcdGNoYXRSZXNvdXJjZSxcblx0XHRcdFx0Y29uZmlybWF0aW9uQ291bnQ6IHRoaXMudG9vbHNXYWl0aW5nRm9yQ2Fyb3VzZWxDb25maXJtYXRpb24sXG5cdFx0XHRcdGNvbmZpcm1hdGlvbkFjdGl2ZTogdGhpcy5fY29uZmlybWF0aW9uQWN0aXZlLFxuXHRcdFx0XHRzdGFydGVkQXQ6IGRhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcgPyBkYXRhLnN0YXJ0ZWRBdCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZHVyYXRpb246IGRhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcgPyBkYXRhLmR1cmF0aW9uIDogdW5kZWZpbmVkLFxuXHRcdFx0XHQuLi4odGhpcy5tb2RlbE5hbWUgPyB7IG1vZGVsTmFtZTogdGhpcy5tb2RlbE5hbWUgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHRoaXMuaXNBY3RpdmUgJiYgdGhpcy5jdXJyZW50UnVubmluZ1Rvb2xNZXNzYWdlID8geyBhY3RpdmVUb29sTGFiZWw6IHRoaXMuY3VycmVudFJ1bm5pbmdUb29sTWVzc2FnZSB9IDoge30pLFxuXHRcdFx0XHQuLi4odGhpcy5pc0FjdGl2ZSAmJiB0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbEljb24gPyB7IGFjdGl2ZVRvb2xJY29uOiB0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbEljb24gfSA6IHt9KSxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHN1YkFnZW50SW52b2NhdGlvbklkOiBzdHJpbmcsXG5cdFx0dG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxpc3RQb29sOiBDb2xsYXBzaWJsZUxpc3RQb29sLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUG9vbDogRWRpdG9yUG9vbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGN1cnJlbnRXaWR0aERlbGVnYXRlOiAoKSA9PiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzOiBTZXQ8c3RyaW5nPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlOiBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdC8vIEV4dHJhY3QgZGVzY3JpcHRpb24sIGFnZW50TmFtZSwgYW5kIHByb21wdCBmcm9tIHRvb2xJbnZvY2F0aW9uXG5cdFx0Y29uc3QgeyBkZXNjcmlwdGlvbiwgaXNEZWZhdWx0RGVzY3JpcHRpb24sIGFnZW50TmFtZSwgcHJvbXB0LCBtb2RlbE5hbWUsIGNyZWRpdHMgfSA9IENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0LmV4dHJhY3RTdWJhZ2VudEluZm8odG9vbEludm9jYXRpb24pO1xuXG5cdFx0Ly8gQnVpbGQgdGl0bGU6IFwiQWdlbnROYW1lOiBkZXNjcmlwdGlvblwiIG9yIFwiU3ViYWdlbnQ6IGRlc2NyaXB0aW9uXCJcblx0XHRjb25zdCByYXdQcmVmaXggPSBhZ2VudE5hbWUgfHwgbG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQucHJlZml4JywgJ1N1YmFnZW50Jyk7XG5cdFx0Y29uc3QgcHJlZml4ID0gcmF3UHJlZml4LmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcmF3UHJlZml4LnNsaWNlKDEpO1xuXHRcdGNvbnN0IGluaXRpYWxUaXRsZSA9IGAke3ByZWZpeH06ICR7ZGVzY3JpcHRpb259YDtcblx0XHRzdXBlcihpbml0aWFsVGl0bGUsIGNvbnRleHQsIHVuZGVmaW5lZCwgaG92ZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gcmN1dChkZXNjcmlwdGlvbiwgTUFYX1RJVExFX0xFTkdUSCk7XG5cdFx0dGhpcy5faXNEZWZhdWx0RGVzY3JpcHRpb24gPSBpc0RlZmF1bHREZXNjcmlwdGlvbjtcblx0XHR0aGlzLmFnZW50TmFtZSA9IGFnZW50TmFtZTtcblx0XHR0aGlzLnByb21wdCA9IHByb21wdDtcblx0XHR0aGlzLm1vZGVsTmFtZSA9IG1vZGVsTmFtZTtcblx0XHR0aGlzLmNyZWRpdHMgPSBjcmVkaXRzO1xuXHRcdHRoaXMuaXNJbml0aWFsbHlDb21wbGV0ZSA9IElDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZSh0b29sSW52b2NhdGlvbik7XG5cdFx0dGhpcy5pc0V4dGVybmFsbHlBY3RpdmUgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnICYmIHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuaXNBY3RpdmUgPT09IHRydWU7XG5cdFx0dGhpcy5pc0FjdGl2ZSA9IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCdcblx0XHRcdD8gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSA/PyAhdGhpcy5pc0luaXRpYWxseUNvbXBsZXRlXG5cdFx0XHQ6ICF0aGlzLmlzSW5pdGlhbGx5Q29tcGxldGU7XG5cdFx0dGhpcy5fc3ViYWdlbnRUb29sSW52b2NhdGlvbiA9IHRvb2xJbnZvY2F0aW9uO1xuXHRcdGlmIChpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBjb250ZXh0LmVsZW1lbnQ7XG5cdFx0XHRjb25zdCBmaW5hbGl6ZU9uVGVybWluYWwgPSAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmlzQWN0aXZlICYmIChyZXNwb25zZS5pc0NvbXBsZXRlIHx8IHJlc3BvbnNlLmlzQ2FuY2VsZWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5tYXJrQXNJbmFjdGl2ZSh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGZpbmFsaXplT25UZXJtaW5hbCgpO1xuXHRcdFx0aWYgKCFyZXNwb25zZS5pc0NvbXBsZXRlICYmICFyZXNwb25zZS5pc0NhbmNlbGVkKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50Lm9uY2UoRXZlbnQuZmlsdGVyKHJlc3BvbnNlLm1vZGVsLm9uRGlkQ2hhbmdlLCAoKSA9PiByZXNwb25zZS5pc0NvbXBsZXRlIHx8IHJlc3BvbnNlLmlzQ2FuY2VsZWQpKShmaW5hbGl6ZU9uVGVybWluYWwpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBub2RlID0gdGhpcy5kb21Ob2RlO1xuXHRcdG5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC10aGlua2luZy1ib3gnLCAnY2hhdC10aGlua2luZy1maXhlZC1tb2RlJywgJ2NoYXQtc3ViYWdlbnQtcGFydCcpO1xuXHRcdGNvbnN0IGFuaW1hdGlvbkNvbnRhaW5lciA9IHRoaXMuY29udGVudEFuaW1hdGlvbkNvbnRhaW5lcjtcblx0XHRpZiAoYW5pbWF0aW9uQ29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCBwZW5kaW5nQW5pbWF0aW9uQ2xlYW51cCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG5vZGUsIENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LnVzZXJUb2dnbGVFdmVudCwgZSA9PiB7XG5cdFx0XHRcdGlmIChlLnRhcmdldCA9PT0gbm9kZVxuXHRcdFx0XHRcdCYmIHRoaXMuaXNBY3RpdmVcblx0XHRcdFx0XHQmJiAhdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuc2V0Q29udGVudEFuaW1hdGlvbkVuYWJsZWQodHJ1ZSk7XG5cdFx0XHRcdFx0YW5pbWF0aW9uQ29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCBmaW5pc2hBY3RpdmVUb2dnbGVBbmltYXRpb24gPSAoZTogVHJhbnNpdGlvbkV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmlzQWN0aXZlICYmIGUudGFyZ2V0ID09PSBhbmltYXRpb25Db250YWluZXIgJiYgZS5wcm9wZXJ0eU5hbWUgPT09ICdncmlkLXRlbXBsYXRlLXJvd3MnKSB7XG5cdFx0XHRcdFx0cGVuZGluZ0FuaW1hdGlvbkNsZWFudXAuY2xlYXIoKTtcblx0XHRcdFx0XHR0aGlzLnNldENvbnRlbnRBbmltYXRpb25FbmFibGVkKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYW5pbWF0aW9uQ29udGFpbmVyLCAndHJhbnNpdGlvbmVuZCcsIGZpbmlzaEFjdGl2ZVRvZ2dsZUFuaW1hdGlvbikpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihhbmltYXRpb25Db250YWluZXIsICd0cmFuc2l0aW9uY2FuY2VsJywgZmluaXNoQWN0aXZlVG9nZ2xlQW5pbWF0aW9uKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQW5jaG9yIHRoZSBgTWVudUlkLkNoYXRTdWJhZ2VudENvbnRlbnRgIG1lbnUgaW4gdGhlIHN1YmFnZW50IGhlYWRlciBzb1xuXHRcdC8vIHRoZSBBZ2VudHMgd2luZG93IGNhbiBjb250cmlidXRlIGFuIFwiT3BlbiBTdWJhZ2VudFwiIHBpbGwgdG8gcmV2ZWFsIHRoZVxuXHRcdC8vIHN1YmFnZW50J3Mgb3duIChyZWFkLW9ubHkpIGNoYXQgd2hlbiBpdCBydW5zIGFzIGEgZGlzdGluY3QgY2hhdC5cblx0XHR0aGlzLl91cGRhdGVPcGVuQ2hhdExpbmsoKTtcblxuXHRcdGlmICh0aGlzLmlzQWN0aXZlKSB7XG5cdFx0XHRub2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtdGhpbmtpbmctYWN0aXZlJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQXBwbHkgc2hpbW1lciB0byB0aGUgaW5pdGlhbCB0aXRsZSB3aGVuIHN0aWxsIGFjdGl2ZVxuXHRcdGlmICh0aGlzLmlzQWN0aXZlICYmIHRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSB0aGlzLl9jb2xsYXBzZUJ1dHRvbi5sYWJlbEVsZW1lbnQ7XG5cdFx0XHRsYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdHRoaXMudGl0bGVTaGltbWVyU3BhbiA9ICQoJ3NwYW4uY2hhdC10aGlua2luZy10aXRsZS1zaGltbWVyJyk7XG5cdFx0XHR0aGlzLnRpdGxlU2hpbW1lclNwYW4udGV4dENvbnRlbnQgPSBpbml0aWFsVGl0bGU7XG5cdFx0XHRsYWJlbEVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVNoaW1tZXJTcGFuKTtcblx0XHR9XG5cblx0XHQvLyBOb3RlOiB3cmFwcGVyIGlzIGNyZWF0ZWQgbGF6aWx5IGluIGluaXRDb250ZW50KCksIHNvIHdlIGNhbid0IHNldCBpdHMgc3R5bGUgaGVyZVxuXG5cdFx0aWYgKHRoaXMuX2NvbGxhcHNlQnV0dG9uICYmIHRoaXMuaXNBY3RpdmUpIHtcblx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmljb24gPSBDb2RpY29uLmNpcmNsZUZpbGxlZDtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0dGhpcy5leHBhbmRlZC5yZWFkKHIpO1xuXHRcdFx0aWYgKHRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHRcdGlmICh0aGlzLmlzQWN0aXZlKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29sbGFwc2VCdXR0b24uaWNvbiA9IENvZGljb24uY2lyY2xlRmlsbGVkO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmljb24gPSBDb2RpY29uLmNoZWNrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTWF0ZXJpYWxpemUgbGF6eSBpdGVtcyB3aGVuIGZpcnN0IGV4cGFuZGVkXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc0V4cGFuZGVkLnJlYWQocikgJiYgIXRoaXMuaGFzRXhwYW5kZWRPbmNlKSB7XG5cdFx0XHRcdHRoaXMuaGFzRXhwYW5kZWRPbmNlID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5tYXRlcmlhbGl6ZVBlbmRpbmdDb250ZW50KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU3RhcnQgY29sbGFwc2VkIC0gZml4ZWQgc2Nyb2xsaW5nIG1vZGUgc2hvd3MgbGltaXRlZCBoZWlnaHQgd2hlbiBjb2xsYXBzZWRcblx0XHR0aGlzLnNldEV4cGFuZGVkKGZhbHNlKTtcblxuXHRcdC8vIFRyYWNrIHVzZXIgbWFudWFsIGV4cGFuc2lvblxuXHRcdC8vIElmIHRoZSB1c2VyIGV4cGFuZHMgKG5vdCB2aWEgYXV0by1leHBhbmQgZm9yIGNvbmZpcm1hdGlvbiksIG1hcmsgaXQgYXMgbWFudWFsXG5cdFx0Ly8gT25seSBjbGVhciBhdXRvRXhwYW5kZWRGb3JDb25maXJtYXRpb24gd2hlbiB1c2VyIGNvbGxhcHNlcywgc28gcmUtZXhwYW5kIGlzIGRldGVjdGVkIGFzIG1hbnVhbFxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBleHBhbmRlZCA9IHRoaXMuX2lzRXhwYW5kZWQucmVhZChyKTtcblx0XHRcdGlmIChleHBhbmRlZCkge1xuXHRcdFx0XHRpZiAoIXRoaXMuYXV0b0V4cGFuZGVkRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy51c2VyTWFudWFsbHlFeHBhbmRlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFVzZXIgY29sbGFwc2VkIC0gcmVzZXQgZmxhZ3Mgc28gbmV4dCBjb25maXJtYXRpb24gY3ljbGUgY2FuIGF1dG8tY29sbGFwc2UgYWdhaW5cblx0XHRcdFx0aWYgKHRoaXMuYXV0b0V4cGFuZGVkRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5hdXRvRXhwYW5kZWRGb3JDb25maXJtYXRpb24gPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBSZXNldCBtYW51YWwgZXhwYW5zaW9uIGZsYWcgd2hlbiB1c2VyIGNvbGxhcHNlcywgc28gZnV0dXJlIGNvbmZpcm1hdGlvbiBjeWNsZXMgY2FuIGF1dG8tY29sbGFwc2Vcblx0XHRcdFx0aWYgKHRoaXMudXNlck1hbnVhbGx5RXhwYW5kZWQpIHtcblx0XHRcdFx0XHR0aGlzLnVzZXJNYW51YWxseUV4cGFuZGVkID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTY2hlZHVsZXIgZm9yIGNvYWxlc2NpbmcgbGF5b3V0IG9wZXJhdGlvbnNcblx0XHR0aGlzLmxheW91dFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBbmltYXRpb25GcmFtZVNjaGVkdWxlcih0aGlzLmRvbU5vZGUsICgpID0+IHRoaXMucGVyZm9ybUxheW91dCgpKSk7XG5cblx0XHQvLyBTZXQgdXAgaG92ZXIgdG9vbHRpcCB3aXRoIG1vZGVsIG5hbWUgaWYgYXZhaWxhYmxlXG5cdFx0dGhpcy51cGRhdGVIb3ZlcigpO1xuXG5cdFx0Ly8gUmVuZGVyIHRoZSBwcm9tcHQgc2VjdGlvbiBhdCB0aGUgc3RhcnQgaWYgYXZhaWxhYmxlIChtdXN0IGJlIGFmdGVyIHdyYXBwZXIgaXMgaW5pdGlhbGl6ZWQpXG5cdFx0dGhpcy5yZW5kZXJQcm9tcHRTZWN0aW9uKCk7XG5cblx0XHQvLyBXYXRjaCBmb3IgY29tcGxldGlvbiBhbmQgcmVuZGVyIHJlc3VsdFxuXHRcdHRoaXMud2F0Y2hUb29sQ29tcGxldGlvbih0b29sSW52b2NhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIGdldFJhbmRvbVdvcmtpbmdNZXNzYWdlKCk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLmF2YWlsYWJsZU1lc3NhZ2VzIHx8IHRoaXMuYXZhaWxhYmxlTWVzc2FnZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmF2YWlsYWJsZU1lc3NhZ2VzID0gYnVpbGRQaHJhc2VQb29sKHN1YmFnZW50V29ya2luZ01lc3NhZ2VzLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR9XG5cdFx0Y29uc3QgaW5kZXggPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmF2YWlsYWJsZU1lc3NhZ2VzLmxlbmd0aCk7XG5cdFx0cmV0dXJuIHRoaXMuYXZhaWxhYmxlTWVzc2FnZXMuc3BsaWNlKGluZGV4LCAxKVswXTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlV29ya2luZ1NwaW5uZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50IHx8ICF0aGlzLndyYXBwZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQgPSAkKCcuY2hhdC10aGlua2luZy1pdGVtLmNoYXQtdGhpbmtpbmctc3Bpbm5lci1pdGVtJyk7XG5cdFx0Y29uc3Qgc3Bpbm5lckljb24gPSBjcmVhdGVUaGlua2luZ0ljb24oQ29kaWNvbi5jaXJjbGVGaWxsZWQpO1xuXHRcdHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50LmFwcGVuZENoaWxkKHNwaW5uZXJJY29uKTtcblx0XHR0aGlzLndvcmtpbmdTcGlubmVyTGFiZWwgPSAkKCdzcGFuLmNoYXQtdGhpbmtpbmctc3Bpbm5lci1sYWJlbCcpO1xuXHRcdHRoaXMud29ya2luZ1NwaW5uZXJMYWJlbC50ZXh0Q29udGVudCA9IHRoaXMuZ2V0UmFuZG9tV29ya2luZ01lc3NhZ2UoKTtcblx0XHR0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLndvcmtpbmdTcGlubmVyTGFiZWwpO1xuXHRcdHRoaXMud3JhcHBlci5hcHBlbmRDaGlsZCh0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZVdvcmtpbmdTcGlubmVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCkge1xuXHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJMYWJlbCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3dXb3JraW5nU3Bpbm5lcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQpIHtcblx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jcmVhdGVXb3JraW5nU3Bpbm5lcigpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpbml0Q29udGVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0dGhpcy53cmFwcGVyID0gJCgnLmNoYXQtdXNlZC1jb250ZXh0LWxpc3QuY2hhdC10aGlua2luZy1jb2xsYXBzaWJsZScpO1xuXG5cdFx0Ly8gSGlkZSBpbml0aWFsbHkgdW50aWwgdGhlcmUgYXJlIHRvb2wgY2FsbHNcblx0XHRpZiAoIXRoaXMuaGFzVG9vbEl0ZW1zKSB7XG5cdFx0XHR0aGlzLndyYXBwZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHQvLyBNYXRlcmlhbGl6ZSBhbnkgZGVmZXJyZWQgY29udGVudCBub3cgdGhhdCB3cmFwcGVyIGV4aXN0c1xuXHRcdC8vIFRoaXMgaGFuZGxlcyB0aGUgY2FzZSB3aGVyZSB0aGUgc3ViY2xhc3MgYXV0b3J1biByYW4gYmVmb3JlIHRoaXMgYmFzZSBjbGFzcyBhdXRvcnVuXG5cdFx0dGhpcy5tYXRlcmlhbGl6ZVBlbmRpbmdDb250ZW50KCk7XG5cdFx0aWYgKHRoaXMuaXNBY3RpdmUgJiYgIXRoaXMuaXNJbml0aWFsbHlDb21wbGV0ZSAmJiAhdGhpcy5oYXNUb29sc1dhaXRpbmdGb3JDb25maXJtYXRpb24pIHtcblx0XHRcdHRoaXMuc2hvd1dvcmtpbmdTcGlubmVyKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXNlIFJlc2l6ZU9ic2VydmVyIHRvIHRyaWdnZXIgbGF5b3V0IHdoZW4gd3JhcHBlciBjb250ZW50IGNoYW5nZXNcblx0XHRjb25zdCByZXNpemVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0NoYXRTdWJhZ2VudENvbnRlbnRQYXJ0LmxheW91dCcsICgpID0+IHRoaXMubGF5b3V0U2NoZWR1bGVyLnNjaGVkdWxlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZXNpemVPYnNlcnZlci5vYnNlcnZlKHRoaXMud3JhcHBlcikpO1xuXG5cdFx0cmV0dXJuIHRoaXMud3JhcHBlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXJzIHRoZSBwcm9tcHQgYXMgYSBjb2xsYXBzaWJsZSBzZWN0aW9uIGF0IHRoZSBzdGFydCBvZiB0aGUgY29udGVudC5cblx0ICogSWYgdGhlIHdyYXBwZXIgZG9lc24ndCBleGlzdCB5ZXQgKGxhenkgaW5pdCkgb3Igc3ViYWdlbnQgaXMgaW5pdGlhbGx5IGNvbXBsZXRlLFxuXHQgKiB0aGlzIGlzIGRlZmVycmVkIHVudGlsIGV4cGFuZGVkLlxuXHQgKi9cblx0cHJpdmF0ZSByZW5kZXJQcm9tcHRTZWN0aW9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5wcm9tcHQgfHwgdGhpcy5wcm9tcHRDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEZWZlciByZW5kZXJpbmcgd2hlbiB3cmFwcGVyIGRvZXNuJ3QgZXhpc3QgeWV0IChsYXp5IGluaXQpIG9yIGZvciBvbGQgY29tcGxldGVkIHN1YmFnZW50cyB1bnRpbCBleHBhbmRlZFxuXHRcdGlmICghdGhpcy53cmFwcGVyIHx8ICh0aGlzLmlzSW5pdGlhbGx5Q29tcGxldGUgJiYgIXRoaXMuaXNFeHBhbmRlZCgpICYmICF0aGlzLmhhc0V4cGFuZGVkT25jZSkpIHtcblx0XHRcdHRoaXMucGVuZGluZ1Byb21wdFJlbmRlciA9IHRydWU7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5wZW5kaW5nUHJvbXB0UmVuZGVyID0gZmFsc2U7XG5cdFx0dGhpcy5kb1JlbmRlclByb21wdFNlY3Rpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgZG9SZW5kZXJQcm9tcHRTZWN0aW9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5wcm9tcHQgfHwgdGhpcy5wcm9tcHRDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTcGxpdCBpbnRvIGZpcnN0IGxpbmUgYW5kIHJlc3Rcblx0XHRjb25zdCBsaW5lcyA9IHRoaXMucHJvbXB0LnNwbGl0KCdcXG4nKTtcblx0XHRjb25zdCByYXdGaXJzdExpbmUgPSBsaW5lc1swXSB8fCBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5wcm9tcHQnLCAnUHJvbXB0Jyk7XG5cdFx0Y29uc3QgcmVzdE9mTGluZXMgPSBsaW5lcy5zbGljZSgxKS5qb2luKCdcXG4nKS50cmltKCk7XG5cblx0XHQvLyBMaW1pdCBmaXJzdCBsaW5lIGxlbmd0aCwgbW92aW5nIG92ZXJmbG93IHRvIGNvbnRlbnRcblx0XHRjb25zdCB0aXRsZUNvbnRlbnQgPSByY3V0KHJhd0ZpcnN0TGluZSwgTUFYX1RJVExFX0xFTkdUSCk7XG5cdFx0Y29uc3Qgd2FzVHJ1bmNhdGVkID0gcmF3Rmlyc3RMaW5lLmxlbmd0aCA+IE1BWF9USVRMRV9MRU5HVEg7XG5cdFx0Y29uc3QgdGl0bGUgPSB3YXNUcnVuY2F0ZWQgPyB0aXRsZUNvbnRlbnQgKyAnXHUyMDI2JyA6IHRpdGxlQ29udGVudDtcblx0XHRjb25zdCB0aXRsZVJlbWFpbmRlciA9IHJhd0ZpcnN0TGluZS5sZW5ndGggPiB0aXRsZUNvbnRlbnQubGVuZ3RoID8gcmF3Rmlyc3RMaW5lLnNsaWNlKHRpdGxlQ29udGVudC5sZW5ndGgpLnRyaW0oKSA6ICcnO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSB0aXRsZVJlbWFpbmRlclxuXHRcdFx0PyAodGl0bGVSZW1haW5kZXIgKyAocmVzdE9mTGluZXMgPyAnXFxuJyArIHJlc3RPZkxpbmVzIDogJycpKVxuXHRcdFx0OiAocmVzdE9mTGluZXMgfHwgdGhpcy5wcm9tcHQpO1xuXG5cdFx0Ly8gQ3JlYXRlIGNvbGxhcHNpYmxlIHByb21wdCBwYXJ0XG5cdFx0Y29uc3QgY29sbGFwc2libGVQYXJ0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRDb2xsYXBzaWJsZU1hcmtkb3duQ29udGVudFBhcnQsXG5cdFx0XHR0aXRsZSxcblx0XHRcdGNvbnRlbnQsXG5cdFx0XHR0aGlzLmNvbnRleHQsXG5cdFx0XHR0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlclxuXHRcdCkpO1xuXG5cdFx0Ly8gV3JhcCBpbiBhIGNvbnRhaW5lciBmb3IgY2hhaW4gb2YgdGhvdWdodCBsaW5lIHN0eWxpbmdcblx0XHR0aGlzLnByb21wdENvbnRhaW5lciA9ICQoJy5jaGF0LXRoaW5raW5nLXRvb2wtd3JhcHBlci5jaGF0LXN1YmFnZW50LXNlY3Rpb24nKTtcblx0XHRjb25zdCBwcm9tcHRJY29uID0gY3JlYXRlVGhpbmtpbmdJY29uKENvZGljb24uY29tbWVudCk7XG5cdFx0dGhpcy5wcm9tcHRDb250YWluZXIuYXBwZW5kQ2hpbGQocHJvbXB0SWNvbik7XG5cdFx0dGhpcy5wcm9tcHRDb250YWluZXIuYXBwZW5kQ2hpbGQoY29sbGFwc2libGVQYXJ0LmRvbU5vZGUpO1xuXG5cdFx0Ly8gSW5zZXJ0IGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIHdyYXBwZXJcblx0XHQvLyBXaXRoIGxhenkgcmVuZGVyaW5nLCB3cmFwcGVyIG1heSBub3QgYmUgY3JlYXRlZCB5ZXQgaWYgY29udGVudCBoYXNuJ3QgYmVlbiBleHBhbmRlZFxuXHRcdGlmICh0aGlzLndyYXBwZXIpIHtcblx0XHRcdGlmICh0aGlzLndyYXBwZXIuZmlyc3RDaGlsZCkge1xuXHRcdFx0XHR0aGlzLndyYXBwZXIuaW5zZXJ0QmVmb3JlKHRoaXMucHJvbXB0Q29udGFpbmVyLCB0aGlzLndyYXBwZXIuZmlyc3RDaGlsZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkb20uYXBwZW5kKHRoaXMud3JhcHBlciwgdGhpcy5wcm9tcHRDb250YWluZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaG93IHRoZSBjb250YWluZXIgaWYgaXQgd2FzIGhpZGRlbiAobm8gdG9vbCBpdGVtcyB5ZXQpXG5cdFx0XHRpZiAodGhpcy53cmFwcGVyLnN0eWxlLmRpc3BsYXkgPT09ICdub25lJykge1xuXHRcdFx0XHR0aGlzLndyYXBwZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRJc0FjdGl2ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pc0FjdGl2ZTtcblx0fVxuXG5cdHB1YmxpYyBzaG91bGRSZW1haW5BY3RpdmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaXNFeHRlcm5hbGx5QWN0aXZlO1xuXHR9XG5cblx0cHVibGljIGdldCBoYXNUb29sc1dhaXRpbmdGb3JDb25maXJtYXRpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudG9vbHNXYWl0aW5nRm9yQ29uZmlybWF0aW9uID4gMDtcblx0fVxuXG5cdC8qKiBSb3V0ZXMgdGhpcyBzdWJhZ2VudCdzIGluaXRpYWwgY29uZmlybWF0aW9ucyB0byB0aGUgaW5wdXQgY2Fyb3VzZWwuICovXG5cdHB1YmxpYyBlbmFibGVDYXJvdXNlbE1vZGUoXG5cdFx0bmF2aWdhdGVUb0Nhcm91c2VsOiAoc3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN0cmluZykgPT4gdm9pZCxcblx0XHRhZGRUb29sVG9DYXJvdXNlbDogKHRvb2w6IElDaGF0VG9vbEludm9jYXRpb24pID0+IHZvaWQsXG5cdFx0c2hvdWxkVXNlQ2Fyb3VzZWxGb3JUb29sOiAodG9vbDogSUNoYXRUb29sSW52b2NhdGlvbiwgc3RhdGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGUpID0+IGJvb2xlYW4sXG5cdFx0b25EaWRDaGFuZ2VBY3RpdmVTdWJhZ2VudD86IEV2ZW50PHN0cmluZyB8IHVuZGVmaW5lZD4sXG5cdCk6IHZvaWQge1xuXHRcdHRoaXMuX3VzZUNhcm91c2VsRm9yQ29uZmlybWF0aW9ucyA9IHRydWU7XG5cdFx0dGhpcy5fbmF2aWdhdGVUb0Nhcm91c2VsID0gbmF2aWdhdGVUb0Nhcm91c2VsO1xuXHRcdHRoaXMuX2FkZFRvb2xUb0Nhcm91c2VsID0gYWRkVG9vbFRvQ2Fyb3VzZWw7XG5cdFx0dGhpcy5fc2hvdWxkVXNlQ2Fyb3VzZWxGb3JUb29sID0gc2hvdWxkVXNlQ2Fyb3VzZWxGb3JUb29sO1xuXHRcdHRoaXMuX2FjdGl2ZUNvbmZpcm1hdGlvblRyYWNrZXIudmFsdWUgPSBvbkRpZENoYW5nZUFjdGl2ZVN1YmFnZW50Py4oaWQgPT4gdGhpcy5zZXRDb25maXJtYXRpb25BY3RpdmUoaWQgPT09IHRoaXMuc3ViQWdlbnRJbnZvY2F0aW9uSWQpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDaGF0UmVzb3VyY2UoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Q2hhdFJlc291cmNlKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q29uZmlybWF0aW9uQWN0aXZlKGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChhY3RpdmUgIT09IHRoaXMuX2NvbmZpcm1hdGlvbkFjdGl2ZSkge1xuXHRcdFx0dGhpcy5fY29uZmlybWF0aW9uQWN0aXZlID0gYWN0aXZlO1xuXHRcdFx0dGhpcy5fdXBkYXRlT3BlbkNoYXRUb29sYmFyQ29udGV4dCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRBZ2VudExhYmVsKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuYWdlbnROYW1lKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hZ2VudE5hbWU7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5faXNEZWZhdWx0RGVzY3JpcHRpb24gJiYgdGhpcy5kZXNjcmlwdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVzY3JpcHRpb247XG5cdFx0fVxuXHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5wcmVmaXgnLCAnU3ViYWdlbnQnKTtcblx0fVxuXG5cdHB1YmxpYyBtYXJrQXNJbmFjdGl2ZShmb3JjZTogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKGZvcmNlICYmIHRoaXMuX3N1YmFnZW50VG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuX3N1YmFnZW50VG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YTtcblx0XHRcdGRhdGEuaXNBY3RpdmUgPSBmYWxzZTtcblx0XHRcdGlmIChkYXRhLmR1cmF0aW9uID09PSB1bmRlZmluZWQgJiYgZGF0YS5zdGFydGVkQXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRkYXRhLmR1cmF0aW9uID0gTWF0aC5tYXgoMCwgRGF0ZS5ub3coKSAtIGRhdGEuc3RhcnRlZEF0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5pc0FjdGl2ZSA9IGZhbHNlO1xuXHRcdHRoaXMuX3VwZGF0ZU9wZW5DaGF0VG9vbGJhckNvbnRleHQoKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC10aGlua2luZy1hY3RpdmUnKTtcblx0XHRpZiAodGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmljb24gPSBDb2RpY29uLmNoZWNrO1xuXHRcdH1cblxuXHRcdHRoaXMucmVtb3ZlV29ya2luZ1NwaW5uZXIoKTtcblx0XHR0aGlzLmhpZGVDb25maXJtYXRpb25QbGFjZWhvbGRlcigpO1xuXG5cdFx0aWYgKHRoaXMuX2lzRGVmYXVsdERlc2NyaXB0aW9uKSB7XG5cdFx0XHR0aGlzLmRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQuY29tcGxldGVkRGVmYXVsdERlc2NyaXB0aW9uJywgJ1JhbiBzdWJhZ2VudCcpO1xuXHRcdH1cblx0XHR0aGlzLmZpbmFsaXplVGl0bGUoKTtcblx0XHQvLyBDb2xsYXBzZSB3aGVuIGRvbmVcblx0XHR0aGlzLnNldEV4cGFuZGVkKGZhbHNlKTtcblx0XHR0aGlzLnNldENvbnRlbnRBbmltYXRpb25FbmFibGVkKHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXJrQXNBY3RpdmUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNBY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5pc0FjdGl2ZSA9IHRydWU7XG5cdFx0dGhpcy5zZXRDb250ZW50QW5pbWF0aW9uRW5hYmxlZChmYWxzZSk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtdGhpbmtpbmctYWN0aXZlJyk7XG5cdFx0aWYgKHRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5pY29uID0gQ29kaWNvbi5jaXJjbGVGaWxsZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLndyYXBwZXIgJiYgIXRoaXMuaGFzVG9vbHNXYWl0aW5nRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHR0aGlzLnNob3dXb3JraW5nU3Bpbm5lcigpO1xuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVPcGVuQ2hhdFRvb2xiYXJDb250ZXh0KCk7XG5cdFx0dGhpcy51cGRhdGVUaXRsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoQWN0aXZlU3RhdGVGcm9tVG9vbERhdGEodG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCk6IHZvaWQge1xuXHRcdGlmICh0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kICE9PSAnc3ViYWdlbnQnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3VwZGF0ZU9wZW5DaGF0VG9vbGJhckNvbnRleHQoKTtcblx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuaXNFeHRlcm5hbGx5QWN0aXZlID0gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZTtcblx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSkge1xuXHRcdFx0dGhpcy5tYXJrQXNBY3RpdmUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYXJrQXNJbmFjdGl2ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBmaW5hbGl6ZVRpdGxlKCk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlVGl0bGUoKTtcblx0XHRpZiAodGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmljb24gPSBDb2RpY29uLmNoZWNrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGl0bGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3TmFtZSA9IHRoaXMuYWdlbnROYW1lIHx8IGxvY2FsaXplKCdjaGF0LnN1YmFnZW50LnByZWZpeCcsICdTdWJhZ2VudCcpO1xuXHRcdGNvbnN0IHByZWZpeCA9IHJhd05hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyByYXdOYW1lLnNsaWNlKDEpO1xuXHRcdGNvbnN0IHNoaW1tZXJUZXh0ID0gYCR7cHJlZml4fTogJHt0aGlzLmRlc2NyaXB0aW9ufWA7XG5cdFx0Y29uc3QgdG9vbENhbGxUZXh0ID0gdGhpcy5jdXJyZW50UnVubmluZ1Rvb2xNZXNzYWdlICYmIHRoaXMuaXNBY3RpdmUgPyBgIFxcdTIwMTQgJHt0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbE1lc3NhZ2V9YCA6IGBgO1xuXG5cdFx0aWYgKCF0aGlzLl9jb2xsYXBzZUJ1dHRvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IHRoaXMuX2NvbGxhcHNlQnV0dG9uLmxhYmVsRWxlbWVudDtcblxuXHRcdGlmICghdGhpcy5pc0FjdGl2ZSkge1xuXHRcdFx0bGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0aGlzLnRpdGxlU2hpbW1lclNwYW4gPSB1bmRlZmluZWQ7XG5cblx0XHRcdHRoaXMuX3RpdGxlRGV0YWlsUmVuZGVyZWQuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3RpdGxlRmlsZVdpZGdldFN0b3JlLmNsZWFyKCk7XG5cdFx0XHR0aGlzLnRpdGxlRGV0YWlsQ29udGFpbmVyID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBwcmVmaXhTcGFuID0gJCgnc3BhbicpO1xuXHRcdFx0cHJlZml4U3Bhbi50ZXh0Q29udGVudCA9IGAke3ByZWZpeH06YDtcblx0XHRcdGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZChwcmVmaXhTcGFuKTtcblxuXHRcdFx0Y29uc3QgZGVzY1NwYW4gPSAkKCdzcGFuLmNoYXQtdGhpbmtpbmctdGl0bGUtZGV0YWlsLXRleHQnKTtcblx0XHRcdGRlc2NTcGFuLnRleHRDb250ZW50ID0gYCAke3RoaXMuZGVzY3JpcHRpb259YDtcblx0XHRcdGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZChkZXNjU3Bhbik7XG5cblx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmVsZW1lbnQuYXJpYUxhYmVsID0gc2hpbW1lclRleHQ7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LmFyaWFFeHBhbmRlZCA9IFN0cmluZyh0aGlzLmlzRXhwYW5kZWQoKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIHRoZSBwZXJzaXN0ZW50IHNoaW1tZXIgc3BhbiBleGlzdHNcblx0XHRpZiAoIXRoaXMudGl0bGVTaGltbWVyU3BhbiB8fCAhdGhpcy50aXRsZVNoaW1tZXJTcGFuLnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0dGhpcy50aXRsZVNoaW1tZXJTcGFuID0gJCgnc3Bhbi5jaGF0LXRoaW5raW5nLXRpdGxlLXNoaW1tZXInKTtcblx0XHRcdGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlU2hpbW1lclNwYW4pO1xuXHRcdH1cblx0XHR0aGlzLnRpdGxlU2hpbW1lclNwYW4udGV4dENvbnRlbnQgPSBzaGltbWVyVGV4dDtcblxuXHRcdC8vIERpc3Bvc2UgcHJldmlvdXMgZGV0YWlsIHJlbmRlcmluZ1xuXHRcdHRoaXMuX3RpdGxlRGV0YWlsUmVuZGVyZWQuY2xlYXIoKTtcblx0XHR0aGlzLl90aXRsZUZpbGVXaWRnZXRTdG9yZS5jbGVhcigpO1xuXG5cdFx0aWYgKCF0b29sQ2FsbFRleHQpIHtcblx0XHRcdGlmICh0aGlzLnRpdGxlRGV0YWlsQ29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMudGl0bGVEZXRhaWxDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHRcdHRoaXMudGl0bGVEZXRhaWxDb250YWluZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLnJlbmRlcihuZXcgTWFya2Rvd25TdHJpbmcodG9vbENhbGxUZXh0KSk7XG5cdFx0XHRyZXN1bHQuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjb2xsYXBzaWJsZS10aXRsZS1jb250ZW50JywgJ2NoYXQtdGhpbmtpbmctdGl0bGUtZGV0YWlsJyk7XG5cdFx0XHRyZW5kZXJGaWxlV2lkZ2V0cyhyZXN1bHQuZWxlbWVudCwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5jaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLCB0aGlzLl90aXRsZUZpbGVXaWRnZXRTdG9yZSk7XG5cdFx0XHR0aGlzLl90aXRsZURldGFpbFJlbmRlcmVkLnZhbHVlID0gcmVzdWx0O1xuXG5cdFx0XHRpZiAodGhpcy50aXRsZURldGFpbENvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLnRpdGxlRGV0YWlsQ29udGFpbmVyLnJlcGxhY2VXaXRoKHJlc3VsdC5lbGVtZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZChyZXN1bHQuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRpdGxlRGV0YWlsQ29udGFpbmVyID0gcmVzdWx0LmVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZnVsbExhYmVsID0gYCR7c2hpbW1lclRleHR9JHt0b29sQ2FsbFRleHR9YDtcblx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LmFyaWFMYWJlbCA9IGZ1bGxMYWJlbDtcblx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LmFyaWFFeHBhbmRlZCA9IFN0cmluZyh0aGlzLmlzRXhwYW5kZWQoKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUhvdmVyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAodGhpcy5tb2RlbE5hbWUpIHtcblx0XHRcdHBhcnRzLnB1c2gobG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQubW9kZWxUb29sdGlwJywgJ01vZGVsOiB7MH0nLCB0aGlzLm1vZGVsTmFtZSkpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIHRoaXMuY3JlZGl0cyA9PT0gJ251bWJlcicgJiYgdGhpcy5jcmVkaXRzID4gMCkge1xuXHRcdFx0Y29uc3QgZm9ybWF0dGVkID0gZm9ybWF0Q29waWxvdENyZWRpdHModGhpcy5jcmVkaXRzKTtcblx0XHRcdHBhcnRzLnB1c2goZm9ybWF0dGVkID09PSAnMSdcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5jcmVkaXRUb29sdGlwJywgJ3swfSBjcmVkaXQnLCBmb3JtYXR0ZWQpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQuY3JlZGl0c1Rvb2x0aXAnLCAnezB9IGNyZWRpdHMnLCBmb3JtYXR0ZWQpKTtcblx0XHR9XG5cblx0XHRpZiAocGFydHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9ob3ZlckRpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9ob3ZlckRpc3Bvc2FibGUudmFsdWUgPSB0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LCB7XG5cdFx0XHRjb250ZW50OiBwYXJ0cy5qb2luKCcgXHUyMDIyICcpLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLXJlYWRzIHRoZSBzdWJhZ2VudCdzIGNyZWRpdCAoQUlDKSB1c2FnZSBmcm9tIGB0b29sU3BlY2lmaWNEYXRhYCBhbmRcblx0ICogcmVmcmVzaGVzIHRoZSBob3ZlciB0b29sdGlwIHdoZW4gaXQgaGFzIGNoYW5nZWQuIENyZWRpdHMgY2FuIGFycml2ZVxuXHQgKiBpbmNyZW1lbnRhbGx5IHdoaWxlIHRoZSBzdWJhZ2VudCBydW5zIGFuZCBjb250aW51ZSB1cGRhdGluZyB1bnRpbCBpdHNcblx0ICogY2hpbGQgdHVybnMgcmVwb3J0IHRoZWlyIGZpbmFsIHVzYWdlLlxuXHQgKi9cblx0cHJpdmF0ZSByZWZyZXNoQ3JlZGl0c0Zyb21Ub29sRGF0YSh0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkKTogdm9pZCB7XG5cdFx0aWYgKHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgIT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3JlZGl0cyA9IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY3JlZGl0cztcblx0XHRpZiAodHlwZW9mIGNyZWRpdHMgPT09ICdudW1iZXInICYmIGNyZWRpdHMgIT09IHRoaXMuY3JlZGl0cykge1xuXHRcdFx0dGhpcy5jcmVkaXRzID0gY3JlZGl0cztcblx0XHRcdHRoaXMudXBkYXRlSG92ZXIoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmUtcmVhZHMgdGhlIHN1YmFnZW50J3MgbW9kZWwgbmFtZSBmcm9tIGB0b29sU3BlY2lmaWNEYXRhYCBhbmQgcmVmcmVzaGVzXG5cdCAqIHRoZSBob3ZlciB3aGVuIGl0IGNoYW5nZXMuIFRoZSBtb2RlbCBjYW4gYXJyaXZlIGluY3JlbWVudGFsbHkgKGUuZy4gYWdlbnRcblx0ICogaG9zdCBzdWJhZ2VudHMgcmVwb3J0IGl0IHZpYSB0aGVpciBjaGlsZCB0dXJucycgdXNhZ2UgZXZlbnRzKS5cblx0ICovXG5cdHByaXZhdGUgcmVmcmVzaE1vZGVsRnJvbVRvb2xEYXRhKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpOiB2b2lkIHtcblx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCAhPT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbE5hbWUgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLm1vZGVsTmFtZTtcblx0XHRpZiAobW9kZWxOYW1lICYmIG1vZGVsTmFtZSAhPT0gdGhpcy5tb2RlbE5hbWUpIHtcblx0XHRcdHRoaXMubW9kZWxOYW1lID0gbW9kZWxOYW1lO1xuXHRcdFx0dGhpcy51cGRhdGVIb3ZlcigpO1xuXHRcdFx0dGhpcy5fdXBkYXRlT3BlbkNoYXRUb29sYmFyQ29udGV4dCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0VG9vbExhYmVsKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Rlcm1pbmFsJyAmJiAhaXNMZWdhY3lDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSkpIHtcblx0XHRcdGNvbnN0IGludGVudGlvbiA9IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuaW50ZW50aW9uPy5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpO1xuXHRcdFx0aWYgKGludGVudGlvbikge1xuXHRcdFx0XHRyZXR1cm4gaW50ZW50aW9uO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBtZXNzYWdlID0gdG9vbEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2U7XG5cdFx0Y29uc3QgbWVzc2FnZVRleHQgPSB0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBtZXNzYWdlIDogbWVzc2FnZS52YWx1ZTtcblx0XHRyZXR1cm4gbWVzc2FnZVRleHQucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKSB8fCB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogVHJhY2tzIGEgdG9vbCBpbnZvY2F0aW9uJ3Mgc3RhdGUgZm9yOlxuXHQgKiAxLiBVcGRhdGluZyB0aGUgdGl0bGUgd2l0aCB0aGUgY3VycmVudCB0b29sIG1lc3NhZ2UgKHBlcnNpc3RzIGV2ZW4gYWZ0ZXIgY29tcGxldGlvbilcblx0ICogMi4gQXV0by1leHBhbmRpbmcgd2hlbiBhIHRvb2wgaXMgd2FpdGluZyBmb3IgY29uZmlybWF0aW9uXG5cdCAqIDMuIEF1dG8tY29sbGFwc2luZyB3aGVuIHRoZSBjb25maXJtYXRpb24gaXMgYWRkcmVzc2VkXG5cdCAqIFRoaXMgbWV0aG9kIGlzIHB1YmxpYyB0byBzdXBwb3J0IHRlc3RpbmcuXG5cdCAqL1xuXHRwdWJsaWMgdHJhY2tUb29sU3RhdGUodG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCk6IHZvaWQge1xuXHRcdC8vIE9ubHkgdHJhY2sgbGl2ZSB0b29sIGludm9jYXRpb25zXG5cdFx0aWYgKHRvb2xJbnZvY2F0aW9uLmtpbmQgIT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTZXQgdGhlIHRpdGxlIGltbWVkaWF0ZWx5IHdoZW4gdG9vbCBpcyBhZGRlZCAtIGxpa2UgdGhpbmtpbmcgcGFydCBkb2VzXG5cdFx0dGhpcy5jdXJyZW50UnVubmluZ1Rvb2xDYWxsSWQgPSB0b29sSW52b2NhdGlvbi50b29sQ2FsbElkO1xuXHRcdHRoaXMuY3VycmVudFJ1bm5pbmdUb29sTWVzc2FnZSA9IHRoaXMuZ2V0VG9vbExhYmVsKHRvb2xJbnZvY2F0aW9uKTtcblx0XHR0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbEljb24gPSBnZXRUb29sSW52b2NhdGlvbkljb24odG9vbEludm9jYXRpb24udG9vbElkLCB0b29sSW52b2NhdGlvbi5pY29uKTtcblx0XHR0aGlzLl91cGRhdGVPcGVuQ2hhdFRvb2xiYXJDb250ZXh0KCk7XG5cdFx0dGhpcy51cGRhdGVUaXRsZSgpO1xuXHRcdGNvbnN0IGFkZFRvb2xUb0Nhcm91c2VsID0gdGhpcy5fYWRkVG9vbFRvQ2Fyb3VzZWw7XG5cdFx0Y29uc3Qgc2hvdWxkVXNlQ2Fyb3VzZWxGb3JUb29sID0gdGhpcy5fc2hvdWxkVXNlQ2Fyb3VzZWxGb3JUb29sO1xuXG5cdFx0bGV0IHdhc1dhaXRpbmdGb3JDb25maXJtYXRpb24gPSBmYWxzZTtcblx0XHRsZXQgd2FzV2FpdGluZ0ZvckNhcm91c2VsQ29uZmlybWF0aW9uID0gZmFsc2U7XG5cdFx0Y29uc3QgdG9vbFN0YXRlQXV0b3J1biA9IGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLnJlYWQocik7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50UnVubmluZ1Rvb2xDYWxsSWQgPT09IHRvb2xJbnZvY2F0aW9uLnRvb2xDYWxsSWQpIHtcblx0XHRcdFx0Y29uc3QgdG9vbExhYmVsID0gdGhpcy5nZXRUb29sTGFiZWwodG9vbEludm9jYXRpb24pO1xuXHRcdFx0XHRpZiAodG9vbExhYmVsICE9PSB0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbE1lc3NhZ2UpIHtcblx0XHRcdFx0XHR0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbE1lc3NhZ2UgPSB0b29sTGFiZWw7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlT3BlbkNoYXRUb29sYmFyQ29udGV4dCgpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlVGl0bGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc1dhaXRpbmdGb3JDb25maXJtYXRpb24gPSBzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uXG5cdFx0XHRcdHx8IHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWxcblx0XHRcdFx0fHwgc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uO1xuXHRcdFx0Y29uc3QgaXNXYWl0aW5nRm9yQ2Fyb3VzZWxDb25maXJtYXRpb24gPSAhIWFkZFRvb2xUb0Nhcm91c2VsICYmIHNob3VsZFVzZUNhcm91c2VsRm9yVG9vbD8uKHRvb2xJbnZvY2F0aW9uLCBzdGF0ZSkgPT09IHRydWU7XG5cblx0XHRcdGlmIChpc1dhaXRpbmdGb3JDb25maXJtYXRpb24gJiYgIXdhc1dhaXRpbmdGb3JDb25maXJtYXRpb24pIHtcblx0XHRcdFx0dGhpcy50b29sc1dhaXRpbmdGb3JDb25maXJtYXRpb24rKztcblx0XHRcdFx0aWYgKCF0aGlzLmlzRXhwYW5kZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuYXV0b0V4cGFuZGVkRm9yQ29uZmlybWF0aW9uID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLnNldEV4cGFuZGVkKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFJlbW92ZSB0aGUgd29ya2luZyBzcGlubmVyIHdoaWxlIGNvbmZpcm1hdGlvbiBpcyBzaG93blxuXHRcdFx0XHR0aGlzLnJlbW92ZVdvcmtpbmdTcGlubmVyKCk7XG5cdFx0XHR9IGVsc2UgaWYgKCFpc1dhaXRpbmdGb3JDb25maXJtYXRpb24gJiYgd2FzV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0XHR0aGlzLnRvb2xzV2FpdGluZ0ZvckNvbmZpcm1hdGlvbi0tO1xuXHRcdFx0XHRpZiAodGhpcy50b29sc1dhaXRpbmdGb3JDb25maXJtYXRpb24gPT09IDAgJiYgdGhpcy5hdXRvRXhwYW5kZWRGb3JDb25maXJtYXRpb24gJiYgIXRoaXMudXNlck1hbnVhbGx5RXhwYW5kZWQpIHtcblx0XHRcdFx0XHQvLyBBdXRvLWNvbGxhcHNlIG9ubHkgaWYgd2UgYXV0by1leHBhbmRlZCBhbmQgdXNlciBkaWRuJ3QgbWFudWFsbHkgZXhwYW5kXG5cdFx0XHRcdFx0dGhpcy5hdXRvRXhwYW5kZWRGb3JDb25maXJtYXRpb24gPSBmYWxzZTtcblx0XHRcdFx0XHR0aGlzLnNldEV4cGFuZGVkKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBTaG93IHRoZSB3b3JraW5nIHNwaW5uZXIgYWdhaW4gaWYgc3RpbGwgYWN0aXZlIGFuZCBubyBtb3JlIGNvbmZpcm1hdGlvbnNcblx0XHRcdFx0aWYgKHRoaXMudG9vbHNXYWl0aW5nRm9yQ29uZmlybWF0aW9uID09PSAwICYmIHRoaXMuaXNBY3RpdmUpIHtcblx0XHRcdFx0XHR0aGlzLnNob3dXb3JraW5nU3Bpbm5lcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc1dhaXRpbmdGb3JDYXJvdXNlbENvbmZpcm1hdGlvbiAmJiAhd2FzV2FpdGluZ0ZvckNhcm91c2VsQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdHRoaXMudG9vbHNXYWl0aW5nRm9yQ2Fyb3VzZWxDb25maXJtYXRpb24rKztcblx0XHRcdFx0dGhpcy5fdXBkYXRlT3BlbkNoYXRUb29sYmFyQ29udGV4dCgpO1xuXHRcdFx0XHRhZGRUb29sVG9DYXJvdXNlbCh0b29sSW52b2NhdGlvbik7XG5cdFx0XHRcdHRoaXMuc2hvd0NvbmZpcm1hdGlvblBsYWNlaG9sZGVyKCk7XG5cdFx0XHR9IGVsc2UgaWYgKCFpc1dhaXRpbmdGb3JDYXJvdXNlbENvbmZpcm1hdGlvbiAmJiB3YXNXYWl0aW5nRm9yQ2Fyb3VzZWxDb25maXJtYXRpb24pIHtcblx0XHRcdFx0dGhpcy50b29sc1dhaXRpbmdGb3JDYXJvdXNlbENvbmZpcm1hdGlvbi0tO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVPcGVuQ2hhdFRvb2xiYXJDb250ZXh0KCk7XG5cdFx0XHRcdGlmICh0aGlzLnRvb2xzV2FpdGluZ0ZvckNhcm91c2VsQ29uZmlybWF0aW9uID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5oaWRlQ29uZmlybWF0aW9uUGxhY2Vob2xkZXIoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUNvbmZpcm1hdGlvblBsYWNlaG9sZGVyTGFiZWwoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR3YXNXYWl0aW5nRm9yQ29uZmlybWF0aW9uID0gaXNXYWl0aW5nRm9yQ29uZmlybWF0aW9uO1xuXHRcdFx0d2FzV2FpdGluZ0ZvckNhcm91c2VsQ29uZmlybWF0aW9uID0gaXNXYWl0aW5nRm9yQ2Fyb3VzZWxDb25maXJtYXRpb247XG5cblx0XHRcdC8vIE9uIHRlcm1pbmFsIHN0YXRlLCBkaXNwb3NlIHRoaXMgYXV0b3J1biAoZGVmZXJyZWQgc28gd2UgZG9uJ3QgZGlzcG9zZSBpdCBtaWQtcnVuKSB0byBhdm9pZCBsZWFraW5nIGEgbGlzdGVuZXIgcGVyIHRvb2wgaW52b2NhdGlvbi5cblx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQgfHwgc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHRoaXMuX3Rvb2xTdGF0ZVRyYWNraW5nLmRlbGV0ZSh0b29sU3RhdGVBdXRvcnVuKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fdG9vbFN0YXRlVHJhY2tpbmcuYWRkKHRvb2xTdGF0ZUF1dG9ydW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb25maXJtYXRpb25QbGFjZWhvbGRlclRleHQoKTogc3RyaW5nIHtcblx0XHRjb25zdCBjb3VudCA9IHRoaXMudG9vbHNXYWl0aW5nRm9yQ2Fyb3VzZWxDb25maXJtYXRpb247XG5cdFx0cmV0dXJuIGNvdW50ID09PSAxXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnN1YmFnZW50LnBlbmRpbmdDb25maXJtYXRpb24nLCAnMSBwZW5kaW5nIGNvbmZpcm1hdGlvbicpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGF0LnN1YmFnZW50LnBlbmRpbmdDb25maXJtYXRpb25zJywgJ3swfSBwZW5kaW5nIGNvbmZpcm1hdGlvbnMnLCBjb3VudCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbmZpcm1hdGlvblBsYWNlaG9sZGVyTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbmZpcm1hdGlvblBsYWNlaG9sZGVyTGFiZWwpIHtcblx0XHRcdHRoaXMuX2NvbmZpcm1hdGlvblBsYWNlaG9sZGVyTGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLmdldENvbmZpcm1hdGlvblBsYWNlaG9sZGVyVGV4dCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBTaG93cyBhIHBsYWNlaG9sZGVyIHRoYXQganVtcHMgYmFjayB0byB0aGUgY2Fyb3VzZWwuICovXG5cdHByaXZhdGUgc2hvd0NvbmZpcm1hdGlvblBsYWNlaG9sZGVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb25maXJtYXRpb25QbGFjZWhvbGRlcikge1xuXHRcdFx0dGhpcy51cGRhdGVDb25maXJtYXRpb25QbGFjZWhvbGRlckxhYmVsKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGxhY2Vob2xkZXIgPSAkKCdidXR0b24uY2hhdC1zdWJhZ2VudC1jb25maXJtYXRpb24tcGxhY2Vob2xkZXInKTtcblx0XHRjb25zdCBsYWJlbCA9ICQoJ3NwYW4uY2hhdC1zdWJhZ2VudC1wbGFjZWhvbGRlci1sYWJlbCcpO1xuXHRcdGxhYmVsLnRleHRDb250ZW50ID0gdGhpcy5nZXRDb25maXJtYXRpb25QbGFjZWhvbGRlclRleHQoKTtcblx0XHRwbGFjZWhvbGRlci5hcHBlbmRDaGlsZChsYWJlbCk7XG5cblx0XHR0aGlzLl9jb25maXJtYXRpb25QbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyO1xuXHRcdHRoaXMuX2NvbmZpcm1hdGlvblBsYWNlaG9sZGVyTGFiZWwgPSBsYWJlbDtcblxuXHRcdGNvbnN0IHBsYWNlaG9sZGVyRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0cGxhY2Vob2xkZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihwbGFjZWhvbGRlciwgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9uYXZpZ2F0ZVRvQ2Fyb3VzZWw/Lih0aGlzLnN1YkFnZW50SW52b2NhdGlvbklkKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fY29uZmlybWF0aW9uUGxhY2Vob2xkZXJEaXNwb3NhYmxlLnZhbHVlID0gcGxhY2Vob2xkZXJEaXNwb3NhYmxlcztcblxuXHRcdGlmICghdGhpcy5oYXNUb29sSXRlbXMpIHtcblx0XHRcdHRoaXMuaGFzVG9vbEl0ZW1zID0gdHJ1ZTtcblx0XHRcdGlmICh0aGlzLndyYXBwZXIpIHtcblx0XHRcdFx0dGhpcy53cmFwcGVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuaXNFeHBhbmRlZCgpKSB7XG5cdFx0XHR0aGlzLmF1dG9FeHBhbmRlZEZvckNvbmZpcm1hdGlvbiA9IHRydWU7XG5cdFx0XHR0aGlzLnNldEV4cGFuZGVkKHRydWUpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLndyYXBwZXIpIHtcblx0XHRcdHRoaXMud3JhcHBlci5hcHBlbmRDaGlsZChwbGFjZWhvbGRlcik7XG5cdFx0fVxuXHRcdHRoaXMubGF5b3V0U2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRwcml2YXRlIGhpZGVDb25maXJtYXRpb25QbGFjZWhvbGRlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29uZmlybWF0aW9uUGxhY2Vob2xkZXIpIHtcblx0XHRcdHRoaXMuX2NvbmZpcm1hdGlvblBsYWNlaG9sZGVyLnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5fY29uZmlybWF0aW9uUGxhY2Vob2xkZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jb25maXJtYXRpb25QbGFjZWhvbGRlckxhYmVsID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY29uZmlybWF0aW9uUGxhY2Vob2xkZXJEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmxheW91dFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBLZWVwcyB0aGUgY2Fyb3VzZWwgcGxhY2Vob2xkZXIgYWZ0ZXIgdmlzaWJsZSB0b29sIG91dHB1dC4gKi9cblx0cHJpdmF0ZSBlbnN1cmVQbGFjZWhvbGRlckF0Qm90dG9tKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb25maXJtYXRpb25QbGFjZWhvbGRlcj8ucGFyZW50RWxlbWVudCA9PT0gdGhpcy53cmFwcGVyKSB7XG5cdFx0XHR0aGlzLndyYXBwZXIuYXBwZW5kQ2hpbGQodGhpcy5fY29uZmlybWF0aW9uUGxhY2Vob2xkZXIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBXYXRjaGVzIHRoZSB0b29sIGludm9jYXRpb24gZm9yIGNvbXBsZXRpb24gYW5kIHJlbmRlcnMgdGhlIHJlc3VsdC5cblx0ICogSGFuZGxlcyBib3RoIGxpdmUgYW5kIHNlcmlhbGl6ZWQgaW52b2NhdGlvbnMuXG5cdCAqL1xuXHRwcml2YXRlIHdhdGNoVG9vbENvbXBsZXRpb24odG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCk6IHZvaWQge1xuXHRcdC8vIE9ubHkgd2F0Y2ggcGFyZW50IHN1YmFnZW50IHRvb2xzIGZvciBjb21wbGV0aW9uXG5cdFx0aWYgKCFDaGF0U3ViYWdlbnRDb250ZW50UGFydC5pc1BhcmVudFN1YmFnZW50VG9vbCh0b29sSW52b2NhdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodG9vbEludm9jYXRpb24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0Ly8gV2F0Y2ggZm9yIGNvbXBsZXRpb24gYW5kIHJlbmRlciB0aGUgcmVzdWx0XG5cdFx0XHRsZXQgd2FzU3RyZWFtaW5nID0gdG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCkudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5yZWFkKHIpO1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hBY3RpdmVTdGF0ZUZyb21Ub29sRGF0YSh0b29sSW52b2NhdGlvbik7XG5cdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQpIHtcblx0XHRcdFx0XHR3YXNTdHJlYW1pbmcgPSBmYWxzZTtcblx0XHRcdFx0XHQvLyBFeHRyYWN0IHRleHQgZnJvbSByZXN1bHRcblx0XHRcdFx0XHRjb25zdCB0ZXh0UGFydHMgPSAoc3RhdGUuY29udGVudEZvck1vZGVsIHx8IFtdKVxuXHRcdFx0XHRcdFx0LmZpbHRlcigocGFydCk6IHBhcnQgaXMgeyBraW5kOiAndGV4dCc7IHZhbHVlOiBzdHJpbmcgfSA9PiBwYXJ0LmtpbmQgPT09ICd0ZXh0Jylcblx0XHRcdFx0XHRcdC5tYXAocGFydCA9PiBwYXJ0LnZhbHVlKTtcblxuXHRcdFx0XHRcdGlmICh0ZXh0UGFydHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0dGhpcy5yZW5kZXJSZXN1bHRUZXh0KHRleHRQYXJ0cy5qb2luKCdcXG4nKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gVXBkYXRlIGRlc2NyaXB0aW9uIGFuZCBtb2RlbCBuYW1lIGZyb20gdG9vbFNwZWNpZmljRGF0YSAoc2V0IGR1cmluZyBpbnZva2UoKSlcblx0XHRcdFx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRcdFx0aWYgKHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5kZXNjcmlwdGlvbiA9IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuZGVzY3JpcHRpb247XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2lzRGVmYXVsdERlc2NyaXB0aW9uID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5tb2RlbE5hbWUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5tb2RlbE5hbWUgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLm1vZGVsTmFtZTtcblx0XHRcdFx0XHRcdFx0dGhpcy51cGRhdGVIb3ZlcigpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl91cGRhdGVPcGVuQ2hhdFRvb2xiYXJDb250ZXh0KCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIENyZWRpdHMgKEFJQykgbWF5IGFycml2ZSBhdCBvciBhZnRlciBjb21wbGV0aW9uIGFzIHRoZVxuXHRcdFx0XHRcdC8vIHN1YmFnZW50J3MgY2hpbGQgdHVybnMgcmVwb3J0IHRoZWlyIGZpbmFsIHVzYWdlLlxuXHRcdFx0XHRcdHRoaXMucmVmcmVzaENyZWRpdHNGcm9tVG9vbERhdGEodG9vbEludm9jYXRpb24pO1xuXG5cdFx0XHRcdFx0Ly8gVGhlIHN1YmFnZW50IGNoYXQgcmVzb3VyY2UgbWF5IGhhdmUgYXJyaXZlZCB3aXRoIGNvbXBsZXRpb24uXG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlT3BlbkNoYXRMaW5rKCk7XG5cblx0XHRcdFx0XHRpZiAoIXRoaXMuaXNFeHRlcm5hbGx5QWN0aXZlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm1hcmtBc0luYWN0aXZlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKHdhc1N0cmVhbWluZyAmJiBzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpIHtcblx0XHRcdFx0XHR3YXNTdHJlYW1pbmcgPSBmYWxzZTtcblx0XHRcdFx0XHQvLyBVcGRhdGUgdGhpbmdzIHRoYXQgY2hhbmdlIHdoZW4gdG9vbCBpcyBkb25lIHN0cmVhbWluZ1xuXHRcdFx0XHRcdGNvbnN0IHsgZGVzY3JpcHRpb24sIGlzRGVmYXVsdERlc2NyaXB0aW9uLCBhZ2VudE5hbWUsIHByb21wdCwgbW9kZWxOYW1lIH0gPSBDaGF0U3ViYWdlbnRDb250ZW50UGFydC5leHRyYWN0U3ViYWdlbnRJbmZvKHRvb2xJbnZvY2F0aW9uKTtcblx0XHRcdFx0XHR0aGlzLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cdFx0XHRcdFx0dGhpcy5faXNEZWZhdWx0RGVzY3JpcHRpb24gPSBpc0RlZmF1bHREZXNjcmlwdGlvbjtcblx0XHRcdFx0XHR0aGlzLmFnZW50TmFtZSA9IGFnZW50TmFtZTtcblx0XHRcdFx0XHR0aGlzLnByb21wdCA9IHByb21wdDtcblx0XHRcdFx0XHRpZiAobW9kZWxOYW1lKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm1vZGVsTmFtZSA9IG1vZGVsTmFtZTtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlSG92ZXIoKTtcblx0XHRcdFx0XHRcdHRoaXMuX3VwZGF0ZU9wZW5DaGF0VG9vbGJhckNvbnRleHQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoQ3JlZGl0c0Zyb21Ub29sRGF0YSh0b29sSW52b2NhdGlvbik7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJQcm9tcHRTZWN0aW9uKCk7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVUaXRsZSgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdFx0XHQvLyB0b29sU3BlY2lmaWNEYXRhIHdhcyB1cGRhdGVkIGFmdGVyIGluaXRpYWwgcmVuZGVyIChlLmcuXG5cdFx0XHRcdFx0Ly8gc3ViYWdlbnQgY29udGVudCBhcnJpdmVkIHZpYSBDaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZFxuXHRcdFx0XHRcdC8vIGFmdGVyIHRoZSBwYXJ0IHdhcyBmaXJzdCBjb25zdHJ1Y3RlZCBpbiBQZW5kaW5nQ29uZmlybWF0aW9uKS5cblx0XHRcdFx0XHQvLyBSZS1yZWFkIG1ldGFkYXRhIGFuZCB1cGRhdGUgdGhlIHRpdGxlIGlmIHJlYWwgdmFsdWVzIGFyZVxuXHRcdFx0XHRcdC8vIG5vdyBhdmFpbGFibGUgdGhhdCB3ZSBkaWRuJ3QgaGF2ZSBiZWZvcmUuXG5cdFx0XHRcdFx0Y29uc3QgeyBkZXNjcmlwdGlvbiwgaXNEZWZhdWx0RGVzY3JpcHRpb24sIGFnZW50TmFtZSB9ID0gQ2hhdFN1YmFnZW50Q29udGVudFBhcnQuZXh0cmFjdFN1YmFnZW50SW5mbyh0b29sSW52b2NhdGlvbik7XG5cdFx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb25DaGFuZ2VkID0gdGhpcy5faXNEZWZhdWx0RGVzY3JpcHRpb24gJiYgIWlzRGVmYXVsdERlc2NyaXB0aW9uO1xuXHRcdFx0XHRcdGNvbnN0IGFnZW50TmFtZUNoYW5nZWQgPSAhIWFnZW50TmFtZSAmJiBhZ2VudE5hbWUgIT09IHRoaXMuYWdlbnROYW1lO1xuXHRcdFx0XHRcdGlmIChkZXNjcmlwdGlvbkNoYW5nZWQgfHwgYWdlbnROYW1lQ2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0aWYgKGRlc2NyaXB0aW9uQ2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2lzRGVmYXVsdERlc2NyaXB0aW9uID0gaXNEZWZhdWx0RGVzY3JpcHRpb247XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoYWdlbnROYW1lQ2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmFnZW50TmFtZSA9IGFnZW50TmFtZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlVGl0bGUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoQ3JlZGl0c0Zyb21Ub29sRGF0YSh0b29sSW52b2NhdGlvbik7XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoTW9kZWxGcm9tVG9vbERhdGEodG9vbEludm9jYXRpb24pO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZU9wZW5DaGF0TGluaygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIGlmICh0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnICYmIHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEucmVzdWx0KSB7XG5cdFx0XHQvLyBSZW5kZXIgdGhlIHBlcnNpc3RlZCByZXN1bHQgZm9yIHNlcmlhbGl6ZWQgaW52b2NhdGlvbnNcblx0XHRcdHRoaXMucmVuZGVyUmVzdWx0VGV4dCh0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLnJlc3VsdCk7XG5cdFx0XHQvLyBBbHJlYWR5IGNvbXBsZXRlLCBtYXJrIGFzIGluYWN0aXZlXG5cdFx0XHR0aGlzLm1hcmtBc0luYWN0aXZlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgdGhlIHJlc3VsdCB0ZXh0IGFzIGEgY29sbGFwc2libGUgc2VjdGlvbi5cblx0ICogSWYgdGhlIHdyYXBwZXIgZG9lc24ndCBleGlzdCB5ZXQgKGxhenkgaW5pdCkgb3Igc3ViYWdlbnQgaXMgaW5pdGlhbGx5IGNvbXBsZXRlLFxuXHQgKiB0aGlzIGlzIGRlZmVycmVkIHVudGlsIGV4cGFuZGVkLlxuXHQgKi9cblx0cHVibGljIHJlbmRlclJlc3VsdFRleHQocmVzdWx0VGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucmVzdWx0Q29udGFpbmVyIHx8ICFyZXN1bHRUZXh0KSB7XG5cdFx0XHRyZXR1cm47IC8vIEFscmVhZHkgcmVuZGVyZWQgb3Igbm8gY29udGVudFxuXHRcdH1cblxuXHRcdC8vIERlZmVyIHJlbmRlcmluZyB3aGVuIHdyYXBwZXIgZG9lc24ndCBleGlzdCB5ZXQgKGxhenkgaW5pdCkgb3IgZm9yIG9sZCBjb21wbGV0ZWQgc3ViYWdlbnRzIHVudGlsIGV4cGFuZGVkXG5cdFx0aWYgKCF0aGlzLndyYXBwZXIgfHwgKHRoaXMuaXNJbml0aWFsbHlDb21wbGV0ZSAmJiAhdGhpcy5pc0V4cGFuZGVkKCkgJiYgIXRoaXMuaGFzRXhwYW5kZWRPbmNlKSkge1xuXHRcdFx0dGhpcy5wZW5kaW5nUmVzdWx0VGV4dCA9IHJlc3VsdFRleHQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5wZW5kaW5nUmVzdWx0VGV4dCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmRvUmVuZGVyUmVzdWx0VGV4dChyZXN1bHRUZXh0KTtcblx0fVxuXG5cdHByaXZhdGUgZG9SZW5kZXJSZXN1bHRUZXh0KHJlc3VsdFRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnJlc3VsdENvbnRhaW5lciB8fCAhcmVzdWx0VGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNwbGl0IGludG8gZmlyc3QgbGluZSBhbmQgcmVzdFxuXHRcdGNvbnN0IGxpbmVzID0gcmVzdWx0VGV4dC5zcGxpdCgnXFxuJyk7XG5cdFx0Y29uc3QgcmF3Rmlyc3RMaW5lID0gbGluZXNbMF0gfHwgJyc7XG5cdFx0Y29uc3QgcmVzdE9mTGluZXMgPSBsaW5lcy5zbGljZSgxKS5qb2luKCdcXG4nKS50cmltKCk7XG5cblx0XHQvLyBMaW1pdCBmaXJzdCBsaW5lIGxlbmd0aCwgbW92aW5nIG92ZXJmbG93IHRvIGNvbnRlbnRcblx0XHRjb25zdCB0aXRsZUNvbnRlbnQgPSByY3V0KHJhd0ZpcnN0TGluZSwgTUFYX1RJVExFX0xFTkdUSCk7XG5cdFx0Y29uc3Qgd2FzVHJ1bmNhdGVkID0gcmF3Rmlyc3RMaW5lLmxlbmd0aCA+IE1BWF9USVRMRV9MRU5HVEg7XG5cdFx0Y29uc3QgdGl0bGUgPSB3YXNUcnVuY2F0ZWQgPyB0aXRsZUNvbnRlbnQgKyAnXHUyMDI2JyA6IHRpdGxlQ29udGVudDtcblx0XHRjb25zdCB0aXRsZVJlbWFpbmRlciA9IHJhd0ZpcnN0TGluZS5sZW5ndGggPiB0aXRsZUNvbnRlbnQubGVuZ3RoID8gcmF3Rmlyc3RMaW5lLnNsaWNlKHRpdGxlQ29udGVudC5sZW5ndGgpLnRyaW0oKSA6ICcnO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSB0aXRsZVJlbWFpbmRlclxuXHRcdFx0PyAodGl0bGVSZW1haW5kZXIgKyAocmVzdE9mTGluZXMgPyAnXFxuJyArIHJlc3RPZkxpbmVzIDogJycpKVxuXHRcdFx0OiByZXN0T2ZMaW5lcztcblxuXHRcdC8vIENyZWF0ZSBjb2xsYXBzaWJsZSByZXN1bHQgcGFydFxuXHRcdGNvbnN0IGNvbGxhcHNpYmxlUGFydCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0Q29sbGFwc2libGVNYXJrZG93bkNvbnRlbnRQYXJ0LFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRjb250ZW50LFxuXHRcdFx0dGhpcy5jb250ZXh0LFxuXHRcdFx0dGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXJcblx0XHQpKTtcblxuXHRcdC8vIFdyYXAgaW4gYSBjb250YWluZXIgZm9yIGNoYWluIG9mIHRob3VnaHQgbGluZSBzdHlsaW5nXG5cdFx0dGhpcy5yZXN1bHRDb250YWluZXIgPSAkKCcuY2hhdC10aGlua2luZy10b29sLXdyYXBwZXIuY2hhdC1zdWJhZ2VudC1zZWN0aW9uJyk7XG5cdFx0Y29uc3QgcmVzdWx0SWNvbiA9IGNyZWF0ZVRoaW5raW5nSWNvbihDb2RpY29uLmNoZWNrKTtcblx0XHR0aGlzLnJlc3VsdENvbnRhaW5lci5hcHBlbmRDaGlsZChyZXN1bHRJY29uKTtcblx0XHR0aGlzLnJlc3VsdENvbnRhaW5lci5hcHBlbmRDaGlsZChjb2xsYXBzaWJsZVBhcnQuZG9tTm9kZSk7XG5cblx0XHQvLyBXaXRoIGxhenkgcmVuZGVyaW5nLCB3cmFwcGVyIG1heSBub3QgYmUgY3JlYXRlZCB5ZXQgaWYgY29udGVudCBoYXNuJ3QgYmVlbiBleHBhbmRlZFxuXHRcdGlmICh0aGlzLndyYXBwZXIpIHtcblx0XHRcdGRvbS5hcHBlbmQodGhpcy53cmFwcGVyLCB0aGlzLnJlc3VsdENvbnRhaW5lcik7XG5cblx0XHRcdC8vIFNob3cgdGhlIGNvbnRhaW5lciBpZiBpdCB3YXMgaGlkZGVuXG5cdFx0XHRpZiAodGhpcy53cmFwcGVyLnN0eWxlLmRpc3BsYXkgPT09ICdub25lJykge1xuXHRcdFx0XHR0aGlzLndyYXBwZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBlbmRzIGEgdG9vbCBpbnZvY2F0aW9uIHRvIHRoZSBzdWJhZ2VudCBncm91cC5cblx0ICogVGhlIHRvb2wgcGFydCBpcyBjcmVhdGVkIGxhemlseSAtIG9ubHkgd2hlbiB0aGUgc3ViYWdlbnQgc2VjdGlvbiBpcyBleHBhbmRlZCxcblx0ICogdW5sZXNzIGl0J3MgYWN0aXZlbHkgc3RyZWFtaW5nIChub3QgaW5pdGlhbGx5IGNvbXBsZXRlKSwgaW4gd2hpY2ggY2FzZSByZW5kZXIgaW1tZWRpYXRlbHkuXG5cdCAqL1xuXHRwdWJsaWMgYXBwZW5kVG9vbEludm9jYXRpb24odG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCwgY29kZUJsb2NrU3RhcnRJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Ly8gU2hvdyB0aGUgY29udGFpbmVyIHdoZW4gZmlyc3QgdG9vbCBpdGVtIGlzIGFkZGVkXG5cdFx0aWYgKCF0aGlzLmhhc1Rvb2xJdGVtcykge1xuXHRcdFx0dGhpcy5oYXNUb29sSXRlbXMgPSB0cnVlO1xuXHRcdFx0Ly8gV2l0aCBsYXp5IHJlbmRlcmluZywgd3JhcHBlciBtYXkgbm90IGJlIGNyZWF0ZWQgeWV0IGlmIGNvbnRlbnQgaGFzbid0IGJlZW4gZXhwYW5kZWRcblx0XHRcdGlmICh0aGlzLndyYXBwZXIpIHtcblx0XHRcdFx0dGhpcy53cmFwcGVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUcmFjayB0b29sIHN0YXRlIGZvciB0aXRsZSB1cGRhdGVzIGFuZCBhdXRvLWV4cGFuZC9jb2xsYXBzZSBvbiBjb25maXJtYXRpb25cblx0XHR0aGlzLnRyYWNrVG9vbFN0YXRlKHRvb2xJbnZvY2F0aW9uKTtcblxuXHRcdC8vIFJlbmRlciBpbW1lZGlhdGVseSBvbmx5IGlmIGFscmVhZHkgZXhwYW5kZWQgb3IgaGFzIGJlZW4gZXhwYW5kZWQgYmVmb3JlXG5cdFx0aWYgKHRoaXMuaXNFeHBhbmRlZCgpIHx8IHRoaXMuaGFzRXhwYW5kZWRPbmNlKSB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gdGhpcy5jcmVhdGVUb29sUGFydCh0b29sSW52b2NhdGlvbiwgY29kZUJsb2NrU3RhcnRJbmRleCk7XG5cdFx0XHR0aGlzLmFwcGVuZFRvb2xQYXJ0VG9ET00ocGFydCwgdG9vbEludm9jYXRpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBEZWZlciByZW5kZXJpbmcgdW50aWwgZXhwYW5kZWRcblx0XHRcdGNvbnN0IGl0ZW06IElMYXp5VG9vbEl0ZW0gPSB7XG5cdFx0XHRcdGtpbmQ6ICd0b29sJyxcblx0XHRcdFx0bGF6eTogbmV3IExhenkoKCkgPT4gdGhpcy5jcmVhdGVUb29sUGFydCh0b29sSW52b2NhdGlvbiwgY29kZUJsb2NrU3RhcnRJbmRleCkpLFxuXHRcdFx0XHR0b29sSW52b2NhdGlvbixcblx0XHRcdFx0Y29kZUJsb2NrU3RhcnRJbmRleCxcblx0XHRcdH07XG5cdFx0XHR0aGlzLmxhenlJdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBlbmRzIGEgbWFya2Rvd24gaXRlbSAoZS5nLiwgYW4gZWRpdCBwaWxsKSB0byB0aGUgc3ViYWdlbnQgY29udGVudCBwYXJ0LlxuXHQgKiBUaGlzIGlzIHVzZWQgdG8gcm91dGUgY29kZWJsb2NrVXJpIHBhcnRzIHdpdGggc3ViQWdlbnRJbnZvY2F0aW9uSWQgdG8gdGhpcyBzdWJhZ2VudCdzIGNvbnRhaW5lci5cblx0ICpcblx0ICogV2hlbiB0aGUgY2FsbGVyIGhhcyBhbHJlYWR5IGNyZWF0ZWQgdGhlIGNvbnRlbnQgcGFydCBlYWdlcmx5IChmb3IgZXhhbXBsZSwgYVxuXHQgKiBwcmUtYnVpbHQgYENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0YCB3cmFwcGVkIGluIGEgZmFjdG9yeSksIHRoZSBjYWxsZXIgTVVTVCBwYXNzXG5cdCAqIHRoYXQgcGFydCBhcyBgZWFnZXJEaXNwb3NhYmxlYCBzbyBpdCBpcyByZWdpc3RlcmVkIG9uIHRoaXMgc3ViYWdlbnQgcGFydFxuXHQgKiBpbW1lZGlhdGVseS4gT3RoZXJ3aXNlLCBpZiB0aGUgc3ViYWdlbnQgc2VjdGlvbiBpcyBjb2xsYXBzZWQgYW5kIHRoZSBsYXp5IGl0ZW1cblx0ICogaXMgbmV2ZXIgbWF0ZXJpYWxpemVkLCB0aGUgZWFnZXJseS1jcmVhdGVkIHBhcnQgd291bGQgbGVhay5cblx0ICovXG5cdHB1YmxpYyBhcHBlbmRNYXJrZG93bkl0ZW0oXG5cdFx0ZmFjdG9yeTogKCkgPT4geyBkb21Ob2RlOiBIVE1MRWxlbWVudDsgZGlzcG9zYWJsZT86IElEaXNwb3NhYmxlIH0sXG5cdFx0X2NvZGVibG9ja3NQYXJ0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRfbWFya2Rvd246IElDaGF0TWFya2Rvd25Db250ZW50LFxuXHRcdF9vcmlnaW5hbFBhcmVudD86IEhUTUxFbGVtZW50LFxuXHRcdGVhZ2VyRGlzcG9zYWJsZT86IElEaXNwb3NhYmxlLFxuXHQpOiB2b2lkIHtcblx0XHQvLyBSZWdpc3RlciBhbnkgY2FsbGVyLW93bmVkIGRpc3Bvc2FibGUgdXAtZnJvbnQgc28gaXQgaXMgYWx3YXlzIGNsZWFuZWQgdXBcblx0XHQvLyB3aXRoIHRoaXMgc3ViYWdlbnQgcGFydCwgZXZlbiBpZiB0aGUgbGF6eSBpdGVtIGlzIG5ldmVyIG1hdGVyaWFsaXplZC5cblx0XHRpZiAoZWFnZXJEaXNwb3NhYmxlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihlYWdlckRpc3Bvc2FibGUpO1xuXHRcdH1cblxuXHRcdC8vIElmIGV4cGFuZGVkIG9yIGhhcyBiZWVuIGV4cGFuZGVkIG9uY2UsIHJlbmRlciBpbW1lZGlhdGVseVxuXHRcdGlmICh0aGlzLmlzRXhwYW5kZWQoKSB8fCB0aGlzLmhhc0V4cGFuZGVkT25jZSkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmFjdG9yeSgpO1xuXHRcdFx0dGhpcy5hcHBlbmRNYXJrZG93bkl0ZW1Ub0RPTShyZXN1bHQuZG9tTm9kZSk7XG5cdFx0XHRpZiAocmVzdWx0LmRpc3Bvc2FibGUgJiYgcmVzdWx0LmRpc3Bvc2FibGUgIT09IGVhZ2VyRGlzcG9zYWJsZSkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihyZXN1bHQuZGlzcG9zYWJsZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIERlZmVyIHJlbmRlcmluZyB1bnRpbCBleHBhbmRlZFxuXHRcdFx0Y29uc3QgaXRlbTogSUxhenlNYXJrZG93bkl0ZW0gPSB7XG5cdFx0XHRcdGtpbmQ6ICdtYXJrZG93bicsXG5cdFx0XHRcdGxhenk6IG5ldyBMYXp5KGZhY3RvcnkpLFxuXHRcdFx0XHRlYWdlcmx5UmVnaXN0ZXJlZDogISFlYWdlckRpc3Bvc2FibGUsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5sYXp5SXRlbXMucHVzaChpdGVtKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQXBwZW5kcyBhIGhvb2sgaXRlbSAoYmxvY2tlZC93YXJuaW5nKSB0byB0aGUgc3ViYWdlbnQgY29udGVudCBwYXJ0LlxuXHQgKi9cblx0cHVibGljIGFwcGVuZEhvb2tJdGVtKFxuXHRcdGZhY3Rvcnk6ICgpID0+IHsgZG9tTm9kZTogSFRNTEVsZW1lbnQ7IGRpc3Bvc2FibGU/OiBJRGlzcG9zYWJsZSB9LFxuXHRcdGhvb2tQYXJ0OiBJQ2hhdEhvb2tQYXJ0XG5cdCk6IHZvaWQge1xuXHRcdC8vIHVwZGF0ZSB0aXRsZSB3aXRoIGhvb2sgbWVzc2FnZVxuXHRcdGNvbnN0IGhvb2tNZXNzYWdlID0gaG9va1BhcnQuc3RvcFJlYXNvblxuXHRcdFx0PyAoaG9va1BhcnQudG9vbERpc3BsYXlOYW1lXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2hvb2suc3ViYWdlbnQuYmxvY2tlZCcsICdCbG9ja2VkIHswfScsIGhvb2tQYXJ0LnRvb2xEaXNwbGF5TmFtZSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnaG9vay5zdWJhZ2VudC5ibG9ja2VkR2VuZXJpYycsICdCbG9ja2VkIGJ5IGhvb2snKSlcblx0XHRcdDogKGhvb2tQYXJ0LnRvb2xEaXNwbGF5TmFtZVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdob29rLnN1YmFnZW50Lndhcm5pbmcnLCAnV2FybmluZyBmb3IgezB9JywgaG9va1BhcnQudG9vbERpc3BsYXlOYW1lKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdob29rLnN1YmFnZW50Lndhcm5pbmdHZW5lcmljJywgJ0hvb2sgd2FybmluZycpKTtcblx0XHR0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbE1lc3NhZ2UgPSBob29rTWVzc2FnZTtcblx0XHR0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbENhbGxJZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbEljb24gPSBob29rUGFydC5zdG9wUmVhc29uID8gQ29kaWNvbi5lcnJvciA6IENvZGljb24ud2FybmluZztcblx0XHR0aGlzLl91cGRhdGVPcGVuQ2hhdFRvb2xiYXJDb250ZXh0KCk7XG5cdFx0dGhpcy51cGRhdGVUaXRsZSgpO1xuXG5cdFx0aWYgKHRoaXMuaXNFeHBhbmRlZCgpIHx8IHRoaXMuaGFzRXhwYW5kZWRPbmNlKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmYWN0b3J5KCk7XG5cdFx0XHR0aGlzLmFwcGVuZEhvb2tJdGVtVG9ET00ocmVzdWx0LmRvbU5vZGUsIGhvb2tQYXJ0KTtcblx0XHRcdGlmIChyZXN1bHQuZGlzcG9zYWJsZSkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihyZXN1bHQuZGlzcG9zYWJsZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGl0ZW06IElMYXp5SG9va0l0ZW0gPSB7XG5cdFx0XHRcdGtpbmQ6ICdob29rJyxcblx0XHRcdFx0bGF6eTogbmV3IExhenkoZmFjdG9yeSksXG5cdFx0XHRcdGhvb2tQYXJ0LFxuXHRcdFx0fTtcblx0XHRcdHRoaXMubGF6eUl0ZW1zLnB1c2goaXRlbSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGVuZHMgYSBob29rIGl0ZW0ncyBET00gbm9kZSB0byB0aGUgd3JhcHBlci5cblx0ICovXG5cdHByaXZhdGUgYXBwZW5kSG9va0l0ZW1Ub0RPTShkb21Ob2RlOiBIVE1MRWxlbWVudCwgaG9va1BhcnQ6IElDaGF0SG9va1BhcnQpOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtV3JhcHBlciA9ICQoJy5jaGF0LXRoaW5raW5nLXRvb2wtd3JhcHBlcicpO1xuXHRcdGNvbnN0IGljb24gPSBob29rUGFydC5zdG9wUmVhc29uID8gQ29kaWNvbi5lcnJvciA6IENvZGljb24ud2FybmluZztcblx0XHRjb25zdCBpY29uRWxlbWVudCA9IGNyZWF0ZVRoaW5raW5nSWNvbihpY29uKTtcblx0XHRpdGVtV3JhcHBlci5hcHBlbmRDaGlsZChpY29uRWxlbWVudCk7XG5cdFx0aXRlbVdyYXBwZXIuYXBwZW5kQ2hpbGQoZG9tTm9kZSk7XG5cblx0XHQvLyBUcmVhdCBob29rIGl0ZW1zIGFzIHRvb2wgaXRlbXMgZm9yIHZpc2liaWxpdHkgcHVycG9zZXNcblx0XHRpZiAoIXRoaXMuaGFzVG9vbEl0ZW1zKSB7XG5cdFx0XHR0aGlzLmhhc1Rvb2xJdGVtcyA9IHRydWU7XG5cdFx0XHRpZiAodGhpcy53cmFwcGVyKSB7XG5cdFx0XHRcdHRoaXMud3JhcHBlci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMud3JhcHBlcikge1xuXHRcdFx0aWYgKHRoaXMucmVzdWx0Q29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMud3JhcHBlci5pbnNlcnRCZWZvcmUoaXRlbVdyYXBwZXIsIHRoaXMucmVzdWx0Q29udGFpbmVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMud3JhcHBlci5hcHBlbmRDaGlsZChpdGVtV3JhcHBlcik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMubGFzdEl0ZW1XcmFwcGVyID0gaXRlbVdyYXBwZXI7XG5cdFx0dGhpcy5sYXlvdXRTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBlbmRzIGEgbWFya2Rvd24gaXRlbSdzIERPTSBub2RlIHRvIHRoZSB3cmFwcGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBhcHBlbmRNYXJrZG93bkl0ZW1Ub0RPTShkb21Ob2RlOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICghZG9tTm9kZS5oYXNDaGlsZE5vZGVzKCkgfHwgZG9tTm9kZS50ZXh0Q29udGVudD8udHJpbSgpID09PSAnJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFdyYXAgd2l0aCBpY29uIGxpa2Ugb3RoZXIgaXRlbXNcblx0XHRjb25zdCBpdGVtV3JhcHBlciA9ICQoJy5jaGF0LXRoaW5raW5nLXRvb2wtd3JhcHBlcicpO1xuXHRcdGNvbnN0IGljb25FbGVtZW50ID0gY3JlYXRlVGhpbmtpbmdJY29uKENvZGljb24uZWRpdCk7XG5cdFx0aXRlbVdyYXBwZXIuYXBwZW5kQ2hpbGQoZG9tTm9kZSk7XG5cdFx0aXRlbVdyYXBwZXIuaW5zZXJ0QmVmb3JlKGljb25FbGVtZW50LCBpdGVtV3JhcHBlci5maXJzdENoaWxkKTtcblxuXHRcdC8vIEluc2VydCBiZWZvcmUgcmVzdWx0IGNvbnRhaW5lciBpZiBpdCBleGlzdHMsIG90aGVyd2lzZSBhcHBlbmRcblx0XHRpZiAodGhpcy53cmFwcGVyKSB7XG5cdFx0XHRpZiAodGhpcy5yZXN1bHRDb250YWluZXIpIHtcblx0XHRcdFx0dGhpcy53cmFwcGVyLmluc2VydEJlZm9yZShpdGVtV3JhcHBlciwgdGhpcy5yZXN1bHRDb250YWluZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy53cmFwcGVyLmFwcGVuZENoaWxkKGl0ZW1XcmFwcGVyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5sYXN0SXRlbVdyYXBwZXIgPSBpdGVtV3JhcHBlcjtcblxuXHRcdC8vIFNjaGVkdWxlIGxheW91dCB0byBtZWFzdXJlIGxhc3QgaXRlbSBhbmQgc2Nyb2xsXG5cdFx0dGhpcy5sYXlvdXRTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzaG91bGRJbml0RWFybHkoKTogYm9vbGVhbiB7XG5cdFx0Ly8gTmV2ZXIgaW5pdCBlYXJseSAtIHN1YmFnZW50IGlzIGNvbGxhcHNlZCB3aGlsZSBydW5uaW5nLCBjb250ZW50IG9ubHkgc2hvd24gb24gZXhwYW5kXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNob3VsZEFuaW1hdGVDb250ZW50KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5pc0FjdGl2ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzaG91bGRQcmVwYXJlQ29udGVudEFuaW1hdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCBmb3IgdGhlIGdpdmVuIHRvb2wgaW52b2NhdGlvbi5cblx0ICovXG5cdHByaXZhdGUgY3JlYXRlVG9vbFBhcnQodG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCwgY29kZUJsb2NrU3RhcnRJbmRleDogbnVtYmVyKTogQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCB7XG5cdFx0Y29uc3QgcGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0VG9vbEludm9jYXRpb25QYXJ0LFxuXHRcdFx0dG9vbEludm9jYXRpb24sXG5cdFx0XHR0aGlzLmNvbnRleHQsXG5cdFx0XHR0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlcixcblx0XHRcdHRoaXMubGlzdFBvb2wsXG5cdFx0XHR0aGlzLmVkaXRvclBvb2wsXG5cdFx0XHR0aGlzLmN1cnJlbnRXaWR0aERlbGVnYXRlLFxuXHRcdFx0dGhpcy5hbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzLFxuXHRcdFx0Y29kZUJsb2NrU3RhcnRJbmRleFxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihwYXJ0KTtcblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBlbmRzIGEgdG9vbCBwYXJ0J3MgRE9NIG5vZGUgdG8gdGhlIHdyYXBwZXIgd2l0aCBhcHByb3ByaWF0ZSBpY29uIHdyYXBwZXIuXG5cdCAqL1xuXHRwcml2YXRlIGFwcGVuZFRvb2xQYXJ0VG9ET00ocGFydDogQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCwgdG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBwYXJ0LmRvbU5vZGU7XG5cdFx0aWYgKCFjb250ZW50Lmhhc0NoaWxkTm9kZXMoKSB8fCBjb250ZW50LnRleHRDb250ZW50Py50cmltKCkgPT09ICcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV3JhcCB3aXRoIGljb24gbGlrZSB0aGlua2luZyBwYXJ0cyBkb1xuXHRcdGNvbnN0IGl0ZW1XcmFwcGVyID0gJCgnLmNoYXQtdGhpbmtpbmctdG9vbC13cmFwcGVyJyk7XG5cdFx0Y29uc3QgaWNvbiA9IGdldFRvb2xJbnZvY2F0aW9uSWNvbih0b29sSW52b2NhdGlvbi50b29sSWQsIHRvb2xJbnZvY2F0aW9uLmljb24pO1xuXHRcdGNvbnN0IGljb25FbGVtZW50ID0gY3JlYXRlVGhpbmtpbmdJY29uKGljb24pO1xuXHRcdGl0ZW1XcmFwcGVyLmFwcGVuZENoaWxkKGNvbnRlbnQpO1xuXG5cdFx0Ly8gRHluYW1pY2FsbHkgYWRkL3JlbW92ZSBpY29uIGJhc2VkIG9uIGNvbmZpcm1hdGlvbiBzdGF0ZVxuXHRcdGlmICh0b29sSW52b2NhdGlvbi5raW5kID09PSAndG9vbEludm9jYXRpb24nKSB7XG5cdFx0XHRjb25zdCBzaG91bGRVc2VDYXJvdXNlbEZvclRvb2wgPSB0aGlzLl9zaG91bGRVc2VDYXJvdXNlbEZvclRvb2w7XG5cdFx0XHRjb25zdCBpY29uQXV0b3J1biA9IGF1dG9ydW4ociA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUucmVhZChyKTtcblx0XHRcdFx0Y29uc3QgaGFzQ29uZmlybWF0aW9uID0gc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiB8fFxuXHRcdFx0XHRcdHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWw7XG5cdFx0XHRcdGNvbnN0IHNob3VsZEhpZGVJbmxpbmUgPSBzaG91bGRVc2VDYXJvdXNlbEZvclRvb2w/Lih0b29sSW52b2NhdGlvbiwgc3RhdGUpID09PSB0cnVlO1xuXHRcdFx0XHRpZiAoaGFzQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0aWNvbkVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHRcdFx0aWYgKHNob3VsZEhpZGVJbmxpbmUpIHtcblx0XHRcdFx0XHRcdGl0ZW1XcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGl0ZW1XcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKCFpY29uRWxlbWVudC5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRpdGVtV3JhcHBlci5pbnNlcnRCZWZvcmUoaWNvbkVsZW1lbnQsIGl0ZW1XcmFwcGVyLmZpcnN0Q2hpbGQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGhpcy5fdXNlQ2Fyb3VzZWxGb3JDb25maXJtYXRpb25zKSB7XG5cdFx0XHRcdFx0XHRpdGVtV3JhcHBlci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdFx0XHQvLyBSZS1wb3NpdGlvbiB0aGUgY29uZmlybWF0aW9uIHBsYWNlaG9sZGVyIHRvIHN0YXkgYXQgdGhlIGJvdHRvbVxuXHRcdFx0XHRcdFx0dGhpcy5lbnN1cmVQbGFjZWhvbGRlckF0Qm90dG9tKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVGVybWluYWwgc3RhdGUgaXMgZmluYWwgYW5kIHNldHRsZXMgaW50byB0aGUgbm9uLWNvbmZpcm1hdGlvbiBicmFuY2ggYWJvdmUsIHNvIGRpc3Bvc2UgKGRlZmVycmVkIHNvIHdlIGRvbid0IGRpc3Bvc2UgaXQgbWlkLXJ1bikgdG8gYXZvaWQgbGVha2luZyBhIGxpc3RlbmVyIHBlciB0b29sIGludm9jYXRpb24uXG5cdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQgfHwgc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4gdGhpcy5fdG9vbFN0YXRlVHJhY2tpbmcuZGVsZXRlKGljb25BdXRvcnVuKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fdG9vbFN0YXRlVHJhY2tpbmcuYWRkKGljb25BdXRvcnVuKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRm9yIHNlcmlhbGl6ZWQgaW52b2NhdGlvbnMsIGFsd2F5cyBzaG93IGljb24gKGFscmVhZHkgY29tcGxldGVkKVxuXHRcdFx0aXRlbVdyYXBwZXIuaW5zZXJ0QmVmb3JlKGljb25FbGVtZW50LCBpdGVtV3JhcHBlci5maXJzdENoaWxkKTtcblx0XHR9XG5cblx0XHQvLyBLZWVwIG5ld2x5LXZpc2libGUgdG9vbCByZXN1bHRzIGFib3ZlIHRoZSBwbGFjZWhvbGRlci9zcGlubmVyLlxuXHRcdGlmICh0aGlzLndyYXBwZXIpIHtcblx0XHRcdGNvbnN0IGFuY2hvciA9IHRoaXMuX2NvbmZpcm1hdGlvblBsYWNlaG9sZGVyID8/IHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50ID8/IHRoaXMucmVzdWx0Q29udGFpbmVyO1xuXHRcdFx0aWYgKGFuY2hvcikge1xuXHRcdFx0XHR0aGlzLndyYXBwZXIuaW5zZXJ0QmVmb3JlKGl0ZW1XcmFwcGVyLCBhbmNob3IpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy53cmFwcGVyLmFwcGVuZENoaWxkKGl0ZW1XcmFwcGVyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5sYXN0SXRlbVdyYXBwZXIgPSBpdGVtV3JhcHBlcjtcblxuXHRcdC8vIFNjaGVkdWxlIGxheW91dCB0byBtZWFzdXJlIGxhc3QgaXRlbSBhbmQgc2Nyb2xsXG5cdFx0dGhpcy5sYXlvdXRTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXRlcmlhbGl6ZXMgYSBsYXp5IGl0ZW0gYnkgY3JlYXRpbmcgdGhlIGNvbnRlbnQgYW5kIGFkZGluZyBpdCB0byB0aGUgRE9NLlxuXHQgKi9cblx0cHJpdmF0ZSBtYXRlcmlhbGl6ZUxhenlJdGVtKGl0ZW06IElMYXp5SXRlbSk6IHZvaWQge1xuXHRcdGlmIChpdGVtLmxhenkuaGFzVmFsdWUpIHtcblx0XHRcdHJldHVybjsgLy8gQWxyZWFkeSBtYXRlcmlhbGl6ZWRcblx0XHR9XG5cblx0XHRpZiAoaXRlbS5raW5kID09PSAndG9vbCcpIHtcblx0XHRcdGNvbnN0IHBhcnQgPSBpdGVtLmxhenkudmFsdWU7XG5cdFx0XHR0aGlzLmFwcGVuZFRvb2xQYXJ0VG9ET00ocGFydCwgaXRlbS50b29sSW52b2NhdGlvbik7XG5cdFx0fSBlbHNlIGlmIChpdGVtLmtpbmQgPT09ICdtYXJrZG93bicpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGl0ZW0ubGF6eS52YWx1ZTtcblx0XHRcdHRoaXMuYXBwZW5kTWFya2Rvd25JdGVtVG9ET00ocmVzdWx0LmRvbU5vZGUpO1xuXHRcdFx0aWYgKHJlc3VsdC5kaXNwb3NhYmxlICYmICFpdGVtLmVhZ2VybHlSZWdpc3RlcmVkKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdC5kaXNwb3NhYmxlKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGl0ZW0ua2luZCA9PT0gJ2hvb2snKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBpdGVtLmxhenkudmFsdWU7XG5cdFx0XHR0aGlzLmFwcGVuZEhvb2tJdGVtVG9ET00ocmVzdWx0LmRvbU5vZGUsIGl0ZW0uaG9va1BhcnQpO1xuXHRcdFx0aWYgKHJlc3VsdC5kaXNwb3NhYmxlKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdC5kaXNwb3NhYmxlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogTWF0ZXJpYWxpemVzIGFsbCBwZW5kaW5nIGxhenkgY29udGVudCAocHJvbXB0LCB0b29sIGl0ZW1zLCByZXN1bHQpIHdoZW4gdGhlIHNlY3Rpb24gaXMgZXhwYW5kZWQuXG5cdCAqIFRoaXMgaXMgY2FsbGVkIHdoZW4gZmlyc3QgZXhwYW5kZWQsIGJ1dCB0aGUgd3JhcHBlciBtdXN0IGV4aXN0IChjcmVhdGVkIGJ5IGJhc2UgY2xhc3MgaW5pdENvbnRlbnQpLlxuXHQgKi9cblx0cHJpdmF0ZSBtYXRlcmlhbGl6ZVBlbmRpbmdDb250ZW50KCk6IHZvaWQge1xuXHRcdC8vIFdyYXBwZXIgbWF5IG5vdCBiZSBjcmVhdGVkIHlldCBpZiB0aGlzIGF1dG9ydW4gcnVucyBiZWZvcmUgdGhlIGJhc2UgY2xhc3MgYXV0b3J1blxuXHRcdC8vIHRoYXQgY2FsbHMgaW5pdENvbnRlbnQoKS4gSW4gdGhhdCBjYXNlLCBpbml0Q29udGVudCgpIHdpbGwgY2FsbCB0aGlzIGxvZ2ljLlxuXHRcdGlmICghdGhpcy53cmFwcGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVuZGVyIHBlbmRpbmcgcHJvbXB0IHNlY3Rpb25cblx0XHRpZiAodGhpcy5wZW5kaW5nUHJvbXB0UmVuZGVyKSB7XG5cdFx0XHR0aGlzLnBlbmRpbmdQcm9tcHRSZW5kZXIgPSBmYWxzZTtcblx0XHRcdHRoaXMuZG9SZW5kZXJQcm9tcHRTZWN0aW9uKCk7XG5cdFx0fVxuXG5cdFx0Ly8gTWF0ZXJpYWxpemUgbGF6eSB0b29sIGl0ZW1zXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMubGF6eUl0ZW1zKSB7XG5cdFx0XHR0aGlzLm1hdGVyaWFsaXplTGF6eUl0ZW0oaXRlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVuZGVyIHBlbmRpbmcgcmVzdWx0IHRleHRcblx0XHRpZiAodGhpcy5wZW5kaW5nUmVzdWx0VGV4dCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0VGV4dCA9IHRoaXMucGVuZGluZ1Jlc3VsdFRleHQ7XG5cdFx0XHR0aGlzLnBlbmRpbmdSZXN1bHRUZXh0ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5kb1JlbmRlclJlc3VsdFRleHQocmVzdWx0VGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwZXJmb3JtTGF5b3V0KCk6IHZvaWQge1xuXHRcdC8vIE1lYXN1cmUgbGFzdCBpdGVtIGhlaWdodCBvbmNlIGFmdGVyIGxheW91dCwgc2V0IENTUyB2YXJpYWJsZSBmb3IgY29sbGFwc2VkIG1heC1oZWlnaHRcblx0XHRpZiAodGhpcy5sYXN0SXRlbVdyYXBwZXIgJiYgdGhpcy53cmFwcGVyKSB7XG5cdFx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLmxhc3RJdGVtV3JhcHBlci5vZmZzZXRIZWlnaHQ7XG5cdFx0XHRpZiAoaGVpZ2h0ID4gMCkge1xuXHRcdFx0XHR0aGlzLndyYXBwZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tY2hhdC1zdWJhZ2VudC1sYXN0LWl0ZW0taGVpZ2h0JywgYCR7aGVpZ2h0fXB4YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQXV0by1zY3JvbGwgdG8gYm90dG9tIG9ubHkgd2hlbiBhY3RpdmVseSBzdHJlYW1pbmcgKG5vdCBmb3IgY29tcGxldGVkIHJlc3BvbnNlcylcblx0XHRpZiAodGhpcy5pc0FjdGl2ZSAmJiAhdGhpcy5pc0luaXRpYWxseUNvbXBsZXRlICYmIHRoaXMud3JhcHBlcikge1xuXHRcdFx0Y29uc3Qgc2Nyb2xsSGVpZ2h0ID0gdGhpcy53cmFwcGVyLnNjcm9sbEhlaWdodDtcblx0XHRcdHRoaXMud3JhcHBlci5zY3JvbGxUb3AgPSBzY3JvbGxIZWlnaHQ7XG5cdFx0fVxuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50LCBfZm9sbG93aW5nQ29udGVudDogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSwgX2VsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAob3RoZXIua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBvdGhlci5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJylcblx0XHRcdCYmIENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0LmlzUGFyZW50U3ViYWdlbnRUb29sKG90aGVyKVxuXHRcdFx0JiYgdGhpcy5zdWJBZ2VudEludm9jYXRpb25JZCA9PT0gb3RoZXIudG9vbENhbGxJZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxHQUFHLHlCQUF5QixnQ0FBZ0M7QUFDckUsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZ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
