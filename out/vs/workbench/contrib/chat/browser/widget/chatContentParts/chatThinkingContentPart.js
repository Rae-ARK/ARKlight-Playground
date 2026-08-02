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
import { $, clearNode, DisposableResizeObserver, getWindow, hide, isHTMLElement, scheduleAtNextAnimationFrame } from "../../../../../../base/browser/dom.js";
import { alert } from "../../../../../../base/browser/ui/aria/aria.js";
import { DomScrollableElement } from "../../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../../../../base/common/scrollable.js";
import { IChatToolInvocation } from "../../../common/chatService/chatService.js";
import { ChatConfiguration, ThinkingDisplayMode } from "../../../common/constants.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { AccessibilityWorkbenchSettingId } from "../../../../accessibility/browser/accessibilityConfiguration.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { extractCodeblockUrisFromText } from "../../../common/widget/annotations.js";
import { basename } from "../../../../../../base/common/resources.js";
import { ChatCollapsibleContentPart } from "./chatCollapsibleContentPart.js";
import { renderFileWidgets } from "./chatInlineAnchorWidget.js";
import { localize } from "../../../../../../nls.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { IChatMarkdownAnchorService } from "./chatMarkdownAnchorService.js";
import { ChatMessageRole, ILanguageModelsService } from "../../../common/languageModels.js";
import "./media/chatThinkingContent.css";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { extractImagesFromToolInvocationOutputDetails } from "../../../common/chatImageExtraction.js";
import { ChatThinkingExternalResourceWidget } from "./chatThinkingExternalResourcesWidget.js";
import { LocalChatSessionUri, chatSessionResourceToId } from "../../../common/model/chatUri.js";
const SESSIONS_IS_PHONE_LAYOUT_KEY = "sessionsIsPhoneLayout";
function getEffectiveThinkingDisplayMode(configurationService, contextKeyService) {
  if (contextKeyService.getContextKeyValue(SESSIONS_IS_PHONE_LAYOUT_KEY) === true) {
    return ThinkingDisplayMode.CollapsedPreview;
  }
  return configurationService.getValue("chat.agent.thinkingStyle") ?? ThinkingDisplayMode.Collapsed;
}
function extractTextFromPart(content) {
  const raw = Array.isArray(content.value) ? content.value.join("") : content.value || "";
  return raw.trim();
}
function isEditToolId(toolId) {
  const lowerToolId = toolId.toLowerCase();
  return lowerToolId.includes("edit") || lowerToolId.includes("create") || lowerToolId.includes("replace") || lowerToolId.includes("patch");
}
function isGenericEditToolId(toolId) {
  const lowerToolId = toolId.toLowerCase();
  if (lowerToolId.includes("create") || lowerToolId.includes("notebook")) {
    return false;
  }
  return lowerToolId.includes("replace") || lowerToolId.includes("patch") || lowerToolId.includes("insertedit") || lowerToolId.includes("insert_edit") || lowerToolId.includes("editfile");
}
function isProblemsToolId(toolId) {
  switch (toolId?.toLowerCase()) {
    case "problems":
    case "get_errors":
    case "copilot_geterrors":
      return true;
    default:
      return false;
  }
}
function isNoProblemsFoundResult(toolId, resultText) {
  return isProblemsToolId(toolId) && resultText?.toLowerCase().includes("no problems found") === true;
}
function getToolInvocationIcon(toolId, registeredIcon, resultText) {
  if (isNoProblemsFoundResult(toolId, resultText)) {
    return Codicon.search;
  }
  if (registeredIcon) {
    return registeredIcon;
  }
  const lowerToolId = toolId.toLowerCase();
  if (lowerToolId.includes("comment")) {
    return Codicon.comment;
  }
  if (lowerToolId.includes("search") || lowerToolId.includes("grep") || lowerToolId.includes("find") || lowerToolId.includes("list") || lowerToolId.includes("semantic") || lowerToolId.includes("changes") || lowerToolId.includes("codebase") || lowerToolId.includes("checked")) {
    return Codicon.search;
  }
  if (lowerToolId.includes("read") || lowerToolId.includes("get_file") || lowerToolId.includes("problems")) {
    return Codicon.book;
  }
  if (isEditToolId(toolId)) {
    return Codicon.pencil;
  }
  if (lowerToolId.includes("terminal")) {
    return Codicon.terminal;
  }
  return Codicon.tools;
}
function createThinkingIcon(icon) {
  const iconElement = $("span.chat-thinking-icon");
  iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
  return iconElement;
}
function setThinkingIcon(iconElement, icon) {
  iconElement.className = "chat-thinking-icon";
  iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
}
function extractTitleFromThinkingContent(content) {
  const headerMatch = content.match(/^\*\*([^*]+)\*\*/);
  return headerMatch ? headerMatch[1] : void 0;
}
const THINKING_SCROLL_MAX_HEIGHT = 200;
const TITLE_CACHE_STORAGE_KEY = "chat.thinkingTitleCache";
const TITLE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
const TITLE_CACHE_MAX_ENTRIES = 1e3;
var WorkingMessageCategory = /* @__PURE__ */ ((WorkingMessageCategory2) => {
  WorkingMessageCategory2["Thinking"] = "thinking";
  WorkingMessageCategory2["Terminal"] = "terminal";
  WorkingMessageCategory2["Tool"] = "tool";
  return WorkingMessageCategory2;
})(WorkingMessageCategory || {});
const defaultThinkingMessages = [
  localize("chat.thinking.thinking.1", "Thinking"),
  localize("chat.thinking.thinking.2", "Reasoning"),
  localize("chat.thinking.thinking.3", "Considering"),
  localize("chat.thinking.thinking.4", "Analyzing"),
  localize("chat.thinking.thinking.5", "Evaluating"),
  localize("chat.thinking.thinking.6", "Working")
];
const terminalMessages = [
  localize("chat.thinking.terminal.1", "Executing"),
  localize("chat.thinking.terminal.2", "Running"),
  localize("chat.thinking.terminal.3", "Processing")
];
const toolMessages = [
  localize("chat.thinking.tool.1", "Processing"),
  localize("chat.thinking.tool.2", "Preparing"),
  localize("chat.thinking.tool.3", "Loading"),
  localize("chat.thinking.tool.4", "Analyzing"),
  localize("chat.thinking.tool.5", "Evaluating")
];
const funWorkingMessages = [
  // Generic
  localize("chat.working.fun.1", "Bribing the hamster"),
  localize("chat.working.fun.2", "Reticulating splines"),
  localize("chat.working.fun.3", "Untangling the spaghetti"),
  localize("chat.working.fun.4", "Communing with the codebase"),
  // Minecraft
  localize("chat.working.fun.minecraft.1", "Mining diamonds"),
  // Microsoft
  localize("chat.working.fun.ms.1", "Summoning Clippy")
];
const FUN_WORKING_MESSAGE_RATE = 50;
function getCustomThinkingPhrases(configurationService) {
  const config = configurationService.getValue(ChatConfiguration.ThinkingPhrases);
  const customPhrases = Array.isArray(config?.phrases) ? config.phrases.filter((phrase) => typeof phrase === "string").map((phrase) => phrase.trim()).filter((phrase) => phrase.length > 0) : [];
  return {
    customPhrases,
    replaceDefaults: config?.mode === "replace" && customPhrases.length > 0
  };
}
function maybePickFunWorkingMessage(configurationService, random = Math.random) {
  if (getCustomThinkingPhrases(configurationService).replaceDefaults) {
    return void 0;
  }
  if (Math.floor(random() * FUN_WORKING_MESSAGE_RATE) === 0) {
    return funWorkingMessages[Math.floor(random() * funWorkingMessages.length)];
  }
  return void 0;
}
function buildPhrasePool(defaults, configurationService) {
  const { customPhrases, replaceDefaults } = getCustomThinkingPhrases(configurationService);
  if (customPhrases.length > 0) {
    return replaceDefaults ? [...customPhrases] : [...defaults, ...customPhrases];
  }
  return [...defaults];
}
let ChatThinkingContentPart = class extends ChatCollapsibleContentPart {
  constructor(content, context, chatContentMarkdownRenderer, streamingCompleted, instantiationService, configurationService, chatMarkdownAnchorService, languageModelsService, hoverService, storageService, contextKeyService) {
    const initialText = extractTextFromPart(content);
    const containsReasoning = initialText.trim().length > 0;
    const extractedTitle = extractTitleFromThinkingContent(initialText) ?? localize("chat.thinking.header.initial", "Thinking");
    super(extractedTitle, context, void 0, hoverService, configurationService);
    this.chatContentMarkdownRenderer = chatContentMarkdownRenderer;
    this.streamingCompleted = streamingCompleted;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.chatMarkdownAnchorService = chatMarkdownAnchorService;
    this.languageModelsService = languageModelsService;
    this.storageService = storageService;
    this._onDidChangeHeight = this._register(new Emitter());
    this._asyncRenderCallback = () => this._onDidChangeHeight.fire();
    this.defaultTitle = localize("chat.thinking.header", "Thinking");
    this.workingTitle = localize("chat.thinking.header.working", "Working");
    this._markdownResult = this._register(new MutableDisposable());
    this.fixedScrollingMode = false;
    this.autoScrollEnabled = true;
    this.extractedTitles = [];
    this.toolInvocationCount = 0;
    this.appendedItemCount = 0;
    this.isActive = true;
    this.toolInvocations = [];
    this.allThinkingParts = [];
    this.hookCount = 0;
    this.lazyItems = [];
    this.hasExpandedOnce = false;
    this.availableMessagesByCategory = /* @__PURE__ */ new Map();
    this.toolWrappersByCallId = /* @__PURE__ */ new Map();
    this.toolIconsByCallId = /* @__PURE__ */ new Map();
    this.toolLabelsByCallId = /* @__PURE__ */ new Map();
    this.toolDisposables = this._register(new DisposableMap());
    this.ownedToolParts = /* @__PURE__ */ new Map();
    this.pendingRemovals = [];
    this.isUpdatingDimensions = false;
    this.lastKnownContentHeight = 0;
    this.lastKnownScrollTop = 0;
    this._pendingExternalResources = /* @__PURE__ */ new Map();
    this._titleDetailRendered = this._register(new MutableDisposable());
    this._pendingAppendRefresh = this._register(new MutableDisposable());
    this.diffStatsByPartId = /* @__PURE__ */ new Map();
    this._aggregatedDiff = { added: 0, removed: 0 };
    this.containsGroupedItems = false;
    this.containsReasoning = containsReasoning;
    this.reasoningDurationMs = content.reasoningDurationMs;
    this.id = content.id;
    this.content = content;
    this.allThinkingParts.push(content);
    const configuredMode = getEffectiveThinkingDisplayMode(this.configurationService, contextKeyService);
    this.thinkingDisplayMode = configuredMode;
    this.fixedScrollingMode = configuredMode === ThinkingDisplayMode.FixedScrolling;
    this.currentTitle = extractedTitle;
    if (extractedTitle !== this.defaultTitle) {
      this.lastExtractedTitle = extractedTitle;
      this.extractedTitles.push(extractedTitle);
    }
    this.currentThinkingValue = initialText;
    if (initialText.trim()) {
      this.appendedItemCount++;
    }
    if (this.configurationService.getValue(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates)) {
      alert(localize("chat.thinking.started", "Thinking"));
    }
    if (configuredMode === ThinkingDisplayMode.Collapsed) {
      this.setExpanded(false);
    } else if (configuredMode === ThinkingDisplayMode.CollapsedPreview) {
      this.setExpanded(!this.streamingCompleted && !this.element.isComplete);
    } else {
      this.setExpanded(false);
    }
    const node = this.domNode;
    node.classList.add("chat-thinking-box");
    this._externalResourceWidget = this._register(this.instantiationService.createInstance(ChatThinkingExternalResourceWidget));
    this._register(this._externalResourceWidget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
    node.appendChild(this._externalResourceWidget.domNode);
    if (!this.streamingCompleted && !this.element.isComplete) {
      if (!this.fixedScrollingMode) {
        node.classList.add("chat-thinking-active");
      }
    }
    if (!this.fixedScrollingMode && !this.streamingCompleted && !this.element.isComplete && this._collapseButton) {
      const labelElement = this._collapseButton.labelElement;
      labelElement.textContent = "";
      this.titleShimmerSpan = $("span.chat-thinking-title-shimmer");
      this.titleShimmerSpan.textContent = extractedTitle;
      labelElement.appendChild(this.titleShimmerSpan);
    }
    if (this.fixedScrollingMode) {
      node.classList.add("chat-thinking-fixed-mode");
      this.currentTitle = this.defaultTitle;
    }
    this._register(toDisposable(() => {
      for (const d of this.ownedToolParts.values()) {
        d.dispose();
      }
      this.ownedToolParts.clear();
    }));
    this._register(autorun((r) => {
      const isExpanded = this.expanded.read(r);
      if (this._collapseButton) {
        if (this.streamingCompleted || this.element.isComplete) {
          this._collapseButton.icon = Codicon.check;
        } else if (!this.fixedScrollingMode) {
          if (isExpanded) {
            this._collapseButton.icon = Codicon.chevronDown;
          } else {
            this._collapseButton.icon = Codicon.circleFilled;
          }
        }
      }
    }));
    this._register(autorun((r) => {
      const isExpanded = this._isExpanded.read(r);
      if (isExpanded && !this.hasExpandedOnce && this.lazyItems.length > 0) {
        this.hasExpandedOnce = true;
        this.processPendingRemovals();
        for (const item of this.lazyItems) {
          this.materializeLazyItem(item);
        }
      }
      if (isExpanded && !this.shouldAllowExpansion() && (this.streamingCompleted || this.element.isComplete)) {
        this.setExpanded(false);
        return;
      }
      this._externalResourceWidget.setCollapsed(!isExpanded);
      this._onDidChangeHeight.fire();
    }));
    const label = this.lastExtractedTitle ?? "";
    if (!this.fixedScrollingMode && !this._isExpanded.get()) {
      this.setTitle(label);
    }
    if (this._collapseButton) {
      this._register(this._collapseButton.onDidClick(() => {
        if (this.fixedScrollingMode) {
          if (this.streamingCompleted) {
            this.domNode.classList.add("chat-thinking-fixed-mode-animated");
          }
          return;
        }
        if (this.streamingCompleted) {
          return;
        }
        const expanded = this.isExpanded();
        if (expanded) {
          this.collapsedTitleBeforeExpansion = this.lastExtractedTitle;
          this.setTitle(this.defaultTitle, true);
          this.currentTitle = this.defaultTitle;
        } else {
          const collapsedTitle = this.collapsedTitleBeforeExpansion ?? this.lastExtractedTitle;
          this.collapsedTitleBeforeExpansion = void 0;
          if (collapsedTitle) {
            this.setTitle(collapsedTitle);
          } else {
            this.setTitle(this.defaultTitle, true);
            this.currentTitle = this.defaultTitle;
          }
        }
      }));
    }
  }
  static _codeBlockRendererSync(_languageId, text, _raw) {
    const codeElement = $("code");
    codeElement.textContent = text;
    return codeElement;
  }
  get aggregatedDiff() {
    return this._aggregatedDiff;
  }
  getRandomWorkingMessage(category = "tool" /* Tool */) {
    const fun = maybePickFunWorkingMessage(this.configurationService);
    if (fun) {
      return fun;
    }
    let pool = this.availableMessagesByCategory.get(category);
    if (!pool || pool.length === 0) {
      let defaults;
      switch (category) {
        case "thinking" /* Thinking */:
          defaults = defaultThinkingMessages;
          break;
        case "terminal" /* Terminal */:
          defaults = terminalMessages;
          break;
        case "tool" /* Tool */:
        default:
          defaults = toolMessages;
          break;
      }
      pool = buildPhrasePool(defaults, this.configurationService);
      this.availableMessagesByCategory.set(category, pool);
    }
    const index = Math.floor(Math.random() * pool.length);
    return pool.splice(index, 1)[0];
  }
  shouldInitEarly() {
    return this.fixedScrollingMode && !this.streamingCompleted;
  }
  shouldAnimateContent() {
    return !this.fixedScrollingMode;
  }
  shouldPrepareContentAnimation() {
    return !this.fixedScrollingMode;
  }
  contentDidInitialize() {
    if (this.fixedScrollingMode && this.streamingCompleted && this.scrollableElement) {
      const scrollableDomNode = this.scrollableElement.getDomNode();
      scrollableDomNode.style.maxHeight = "0px";
      scrollableDomNode.getBoundingClientRect();
    }
  }
  expansionDidChange(expanded) {
    if (this.fixedScrollingMode && this.streamingCompleted) {
      if (expanded) {
        this.syncDimensionsAndScheduleScroll();
      } else {
        this.updateCompletedScrollAnimationState(false);
      }
    }
  }
  // @TODO: @justschen Convert to template for each setting?
  initContent() {
    this.wrapper = $(".chat-used-context-list.chat-thinking-collapsible");
    if (!this.streamingCompleted) {
      this.wrapper.classList.add("chat-thinking-streaming");
    }
    const hasLazyThinkingItems = this.lazyItems.some((item) => item.kind === "thinking");
    if (this.currentThinkingValue && !hasLazyThinkingItems) {
      this.textContainer = $(".chat-thinking-item.markdown-content");
      this.wrapper.appendChild(this.textContainer);
      this.renderMarkdown(this.currentThinkingValue);
    }
    if (!this.streamingCompleted && !this.element.isComplete) {
      this.workingSpinnerElement = $(".chat-thinking-item.chat-thinking-spinner-item");
      const spinnerIcon = createThinkingIcon(Codicon.circleFilled);
      this.workingSpinnerElement.appendChild(spinnerIcon);
      this.workingSpinnerLabel = $("span.chat-thinking-spinner-label");
      this.workingSpinnerLabel.textContent = this.getRandomWorkingMessage("thinking" /* Thinking */);
      this.workingSpinnerElement.appendChild(this.workingSpinnerLabel);
      this.wrapper.appendChild(this.workingSpinnerElement);
      this.updateWorkingSpinnerVisibility();
    }
    if (this.fixedScrollingMode) {
      this.scrollableElement = this._register(new DomScrollableElement(this.wrapper, {
        vertical: ScrollbarVisibility.Auto,
        horizontal: ScrollbarVisibility.Hidden,
        handleMouseWheel: true,
        alwaysConsumeMouseWheel: false
      }));
      this._register(this.scrollableElement.onScroll((e) => this.handleScroll(e.scrollTop)));
      let pendingMutationRefresh;
      const mutationObserver = new MutationObserver(() => {
        if (pendingMutationRefresh) {
          return;
        }
        pendingMutationRefresh = scheduleAtNextAnimationFrame(getWindow(this.wrapper), () => {
          pendingMutationRefresh = void 0;
          if (this.streamingCompleted || !this.domNode.classList.contains("chat-used-context-collapsed")) {
            return;
          }
          this.refreshContentHeight();
          this.updateScrollDimensionsFromCache();
        });
      });
      mutationObserver.observe(this.wrapper, { childList: true, subtree: true });
      this._register({
        dispose: () => {
          mutationObserver.disconnect();
          pendingMutationRefresh?.dispose();
        }
      });
      this.childResizeObserver = this._register(new DisposableResizeObserver("ChatThinkingContentPart.child", () => {
        if (this.streamingCompleted || !this.domNode.classList.contains("chat-used-context-collapsed")) {
          return;
        }
        this.syncDimensionsAndScheduleScroll();
      }));
      if (this.textContainer) {
        this._register(this.childResizeObserver.observe(this.textContainer));
      }
      if (this.workingSpinnerElement) {
        this._register(this.childResizeObserver.observe(this.workingSpinnerElement));
      }
      const wrapperResizeObserver = this._register(new DisposableResizeObserver("ChatThinkingContentPart.wrapper", (entries) => {
        if (entries[0]) {
          this.lastKnownContentHeight = this.wrapper.scrollHeight;
          if (this.streamingCompleted && this.isExpanded()) {
            this.updateScrollDimensionsForCompletion();
          } else if (!this.streamingCompleted && this.domNode.classList.contains("chat-used-context-collapsed")) {
            this.updateScrollDimensionsFromCache();
          }
        }
      }));
      this.wrapperResizeObserverDisposable = this._register(wrapperResizeObserver.observe(this.wrapper));
      this._register(this._onDidChangeHeight.event(() => {
        if (!this.streamingCompleted && this.wrapperResizeObserverDisposable) {
          this.refreshContentHeight();
          this.updateScrollDimensionsFromCache();
          return;
        }
        this.syncDimensionsAndScheduleScroll();
      }));
      this.syncDimensionsAndScheduleScroll();
      this.updateDropdownClickability();
      return this.scrollableElement.getDomNode();
    }
    this.updateDropdownClickability();
    return this.wrapper;
  }
  handleScroll(scrollTop) {
    if (!this.scrollableElement || this.isUpdatingDimensions) {
      return;
    }
    this.lastKnownScrollTop = scrollTop;
    const contentHeight = this.lastKnownContentHeight;
    const viewportHeight = Math.min(contentHeight, THINKING_SCROLL_MAX_HEIGHT);
    const maxScrollTop = contentHeight - viewportHeight;
    this.autoScrollEnabled = maxScrollTop <= 0 || scrollTop >= maxScrollTop - 10;
    this.updateFadeClasses(scrollTop, contentHeight, viewportHeight);
  }
  updateFadeClasses(scrollTop, contentHeight, viewportHeight) {
    if (!this.fixedScrollingMode || this.streamingCompleted) {
      this.domNode.classList.remove("chat-thinking-fade-top", "chat-thinking-fade-bottom");
      return;
    }
    const currentScrollTop = scrollTop ?? this.lastKnownScrollTop;
    const currentContentHeight = contentHeight ?? this.lastKnownContentHeight;
    const currentViewportHeight = viewportHeight ?? Math.min(currentContentHeight, THINKING_SCROLL_MAX_HEIGHT);
    const maxScrollTop = currentContentHeight - currentViewportHeight;
    this.domNode.classList.toggle("chat-thinking-fade-top", currentScrollTop > 5);
    this.domNode.classList.toggle("chat-thinking-fade-bottom", maxScrollTop > 0 && currentScrollTop < maxScrollTop - 5);
  }
  // Fallback for non-ResizeObserver updates (onDidChangeHeight, initial setup).
  syncDimensionsAndScheduleScroll() {
    if (this.pendingScrollDisposable) {
      return;
    }
    this.pendingScrollDisposable = scheduleAtNextAnimationFrame(getWindow(this.domNode), () => {
      this.pendingScrollDisposable = void 0;
      if (this._store.isDisposed) {
        return;
      }
      if (this.streamingCompleted) {
        this.updateScrollDimensionsForCompletion();
        return;
      }
      this.refreshContentHeight();
      this.updateScrollDimensionsFromCache();
    });
  }
  /**
   * Re-read scrollHeight from the DOM and update cached height if changed.
   */
  refreshContentHeight() {
    if (!this.wrapper || !this.scrollableElement) {
      return;
    }
    const newHeight = this.wrapper.scrollHeight;
    if (newHeight && newHeight !== this.lastKnownContentHeight) {
      this.lastKnownContentHeight = newHeight;
    }
  }
  updateScrollDimensionsFromCache() {
    if (!this.scrollableElement || this._store.isDisposed) {
      return;
    }
    const isCollapsed = this.domNode.classList.contains("chat-used-context-collapsed");
    if (!isCollapsed) {
      return;
    }
    const contentHeight = this.lastKnownContentHeight;
    if (!contentHeight) {
      return;
    }
    const viewportHeight = Math.min(contentHeight, THINKING_SCROLL_MAX_HEIGHT);
    this.isUpdatingDimensions = true;
    try {
      const viewportWidth = this.scrollableElement.getDomNode().clientWidth;
      this.scrollableElement.setScrollDimensions({
        width: viewportWidth,
        scrollWidth: viewportWidth,
        height: viewportHeight,
        scrollHeight: contentHeight
      });
      if (this.autoScrollEnabled) {
        this.scrollToBottom(contentHeight);
      }
    } finally {
      this.isUpdatingDimensions = false;
    }
    this.updateFadeClasses(this.lastKnownScrollTop, this.lastKnownContentHeight);
    this.updateDropdownClickability(contentHeight);
  }
  scrollToBottom(contentHeight) {
    if (!this.scrollableElement) {
      return;
    }
    const viewportHeight = Math.min(contentHeight, THINKING_SCROLL_MAX_HEIGHT);
    if (contentHeight > viewportHeight) {
      const newScrollTop = contentHeight - viewportHeight;
      this.lastKnownScrollTop = newScrollTop;
      this.scrollableElement.setRevealOnScroll(false);
      this.scrollableElement.setScrollPosition({ scrollTop: newScrollTop });
      this.scrollableElement.setRevealOnScroll(true);
    }
  }
  /**
   * updates scroll dimensions when streaming is complete.
   */
  updateScrollDimensionsForCompletion() {
    if (!this.scrollableElement || !this.fixedScrollingMode) {
      return;
    }
    const contentHeight = this.wrapper.scrollHeight;
    this.lastKnownContentHeight = contentHeight;
    const scrollableDomNode = this.scrollableElement.getDomNode();
    scrollableDomNode.style.maxHeight = `${contentHeight}px`;
    const viewportWidth = scrollableDomNode.clientWidth;
    this.scrollableElement.setScrollDimensions({
      width: viewportWidth,
      scrollWidth: viewportWidth,
      height: contentHeight,
      scrollHeight: contentHeight
    });
    this.lastKnownScrollTop = 0;
    this.scrollableElement.setRevealOnScroll(false);
    this.scrollableElement.setScrollPosition({ scrollTop: 0 });
    this.scrollableElement.setRevealOnScroll(true);
    this.updateCompletedScrollAnimationState(this.isExpanded());
  }
  updateCompletedScrollAnimationState(expanded) {
    if (!this.scrollableElement) {
      return;
    }
    const scrollableDomNode = this.scrollableElement.getDomNode();
    scrollableDomNode.style.maxHeight = expanded ? `${this.lastKnownContentHeight}px` : "0px";
    scrollableDomNode.inert = !expanded;
  }
  renderMarkdown(content, reuseExisting) {
    if (this._store.isDisposed) {
      return;
    }
    const cleanedContent = content.trim();
    if (!cleanedContent) {
      this._markdownResult.clear();
      if (this.textContainer) {
        clearNode(this.textContainer);
      }
      return;
    }
    let contentToRender = cleanedContent;
    if (cleanedContent.startsWith("**") && cleanedContent.endsWith("**")) {
      contentToRender = cleanedContent.slice(2, -2);
    }
    const target = reuseExisting ? this._markdownResult.value?.element : void 0;
    const rendered = this.chatContentMarkdownRenderer.render(new MarkdownString(contentToRender), {
      fillInIncompleteTokens: true,
      asyncRenderCallback: this._asyncRenderCallback,
      codeBlockRendererSync: ChatThinkingContentPart._codeBlockRendererSync
    }, target);
    this._markdownResult.value = rendered;
    if (!target) {
      if (this.textContainer) {
        clearNode(this.textContainer);
        this.textContainer.appendChild(createThinkingIcon(Codicon.circleFilled));
        this.textContainer.appendChild(rendered.element);
      }
    }
  }
  setFinalizedTitle(title) {
    if (!this._collapseButton) {
      return;
    }
    const displayTitle = this.getFinalizedDisplayTitle(title);
    const labelElement = this._collapseButton.labelElement;
    labelElement.textContent = "";
    const firstSpaceIndex = displayTitle.indexOf(" ");
    if (firstSpaceIndex === -1) {
      labelElement.textContent = displayTitle;
    } else {
      const verb = displayTitle.substring(0, firstSpaceIndex);
      const rest = displayTitle.substring(firstSpaceIndex);
      const verbSpan = $("span");
      verbSpan.textContent = verb;
      labelElement.appendChild(verbSpan);
      const restSpan = $("span.chat-thinking-title-detail-text");
      restSpan.textContent = rest;
      labelElement.appendChild(restSpan);
    }
    if (this.diffStatsByPartId.size > 0) {
      const { added, removed } = this._aggregatedDiff;
      if (added > 0 || removed > 0) {
        const diffContainer = $("span.chat-thinking-title-diff");
        diffContainer.appendChild($("span.label-added", {}, `+${added}`));
        diffContainer.appendChild($("span.label-removed", {}, `-${removed}`));
        labelElement.appendChild(diffContainer);
        const insertionsFragment = added === 1 ? localize("chat.thinking.insertions.one", "1 insertion") : localize("chat.thinking.insertions", "{0} insertions", added);
        const deletionsFragment = removed === 1 ? localize("chat.thinking.deletions.one", "1 deletion") : localize("chat.thinking.deletions", "{0} deletions", removed);
        this.setAriaLabel(localize("chat.thinking.titleWithDiff", "{0}, {1}, {2}", displayTitle, insertionsFragment, deletionsFragment));
      } else {
        this.setAriaLabel(displayTitle);
      }
    } else {
      this.setAriaLabel(displayTitle);
    }
  }
  getFinalizedDisplayTitle(title) {
    if (this.thinkingDisplayMode !== ThinkingDisplayMode.Collapsed || !this.containsReasoning || this.containsGroupedItems || !this.reasoningDurationMs) {
      return title;
    }
    const seconds = Math.ceil(this.reasoningDurationMs / 1e3);
    const duration = localize("chat.thinking.duration.seconds", "{0}s", seconds);
    return localize("chat.thinking.titleWithDuration", "{0} - {1}", title, duration);
  }
  hasReasoningContent() {
    return this.containsReasoning;
  }
  hasGroupedItems() {
    return this.containsGroupedItems;
  }
  recordReasoningContent(content) {
    if (!content.trim()) {
      return;
    }
    this.containsReasoning = true;
  }
  setDropdownClickable(clickable) {
    if (this._collapseButton) {
      this._collapseButton.element.style.pointerEvents = clickable ? "auto" : "none";
    }
    if (!clickable && this.streamingCompleted) {
      this.setFinalizedTitle(this.lastExtractedTitle ?? this.currentTitle);
    }
  }
  shouldAllowExpansion() {
    if (this.toolInvocationCount > 0 || this.lazyItems.length > 0) {
      return true;
    }
    if (this.wrapper) {
      const meaningfulChildren = Array.from(this.wrapper.children).filter((child) => child !== this.workingSpinnerElement).length;
      if (meaningfulChildren > 1) {
        return true;
      }
    }
    const contentWithoutTitle = this.currentThinkingValue.trim();
    const titleToCompare = this.lastExtractedTitle ?? this.currentTitle;
    const stripMarkdown = (text) => {
      return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/`(.+?)`/g, "$1").trim();
    };
    const strippedContent = stripMarkdown(contentWithoutTitle);
    return !(!strippedContent || strippedContent === titleToCompare);
  }
  updateDropdownClickability(knownContentHeight) {
    let allowExpansion = this.shouldAllowExpansion();
    if (allowExpansion && this.fixedScrollingMode && !this.streamingCompleted && !this.element.isComplete && this.wrapper) {
      const contentHeight = knownContentHeight ?? this.lastKnownContentHeight;
      if (!contentHeight || contentHeight <= THINKING_SCROLL_MAX_HEIGHT) {
        allowExpansion = false;
      }
    }
    if (!allowExpansion && this.isExpanded() && (this.streamingCompleted || this.element.isComplete)) {
      this.setExpanded(false);
    }
    this.setDropdownClickable(allowExpansion);
  }
  appendToWrapper(element) {
    if (!this.wrapper) {
      return;
    }
    if (this.workingSpinnerElement && this.workingSpinnerElement.parentNode === this.wrapper) {
      this.wrapper.insertBefore(element, this.workingSpinnerElement);
    } else {
      this.wrapper.appendChild(element);
    }
  }
  updateWorkingSpinnerVisibility(reader) {
    if (!this.wrapper || !this.workingSpinnerElement) {
      return;
    }
    const hasRunningTerminalTool = this.toolInvocations.some((toolInvocation) => {
      const terminalData = toolInvocation.toolSpecificData;
      if (terminalData?.kind !== "terminal" || terminalData.terminalCommandState?.exitCode !== void 0) {
        return false;
      }
      return !IChatToolInvocation.isComplete(toolInvocation, reader);
    });
    const isAttached = this.workingSpinnerElement.parentNode === this.wrapper;
    if (hasRunningTerminalTool && isAttached) {
      this.workingSpinnerElement.remove();
      this._onDidChangeHeight.fire();
    } else if (!hasRunningTerminalTool && !isAttached && !this.streamingCompleted && !this.element.isComplete) {
      this.wrapper.appendChild(this.workingSpinnerElement);
      this._onDidChangeHeight.fire();
    }
  }
  resetId() {
    this.id = void 0;
  }
  collapseContent() {
    this.setExpanded(false);
  }
  updateThinking(content) {
    if (this._store.isDisposed) {
      return;
    }
    this.content = content;
    this.reasoningDurationMs = content.reasoningDurationMs;
    for (const lazyItem of this.lazyItems) {
      if (lazyItem.kind === "thinking" && lazyItem.content.id === content.id) {
        lazyItem.content = content;
        break;
      }
    }
    const raw = extractTextFromPart(content);
    this.recordReasoningContent(raw);
    const next = raw;
    if (next === this.currentThinkingValue) {
      return;
    }
    const previousValue = this.currentThinkingValue;
    const reuseExisting = !!(this._markdownResult.value && next.startsWith(previousValue) && next.length > previousValue.length);
    this.currentThinkingValue = next;
    this.renderMarkdown(next, reuseExisting);
    if (this.fixedScrollingMode && this.scrollableElement) {
      this.refreshContentHeight();
      this.updateScrollDimensionsFromCache();
    }
    const extractedTitle = extractTitleFromThinkingContent(raw);
    if (extractedTitle && extractedTitle !== this.currentTitle) {
      if (!this.extractedTitles.includes(extractedTitle)) {
        this.extractedTitles.push(extractedTitle);
      }
      this.lastExtractedTitle = extractedTitle;
    }
    if (!extractedTitle || extractedTitle === this.currentTitle) {
      return;
    }
    const label = this.lastExtractedTitle ?? "";
    if (!this.fixedScrollingMode && !this._isExpanded.get()) {
      this.setTitle(label);
    }
    this.updateDropdownClickability();
  }
  getIsActive() {
    return this.isActive;
  }
  /**
   * Returns true when this thinking part has no meaningful content to display:
   * no tool invocations, no lazy items, no hooks, and no thinking text.
   * This happens when a tool is removed from thinking (e.g. due to confirmation)
   * and the thinking part was only created to hold that tool.
   */
  isEffectivelyEmpty() {
    this.processPendingRemovals();
    if (this.toolInvocationCount > 0 || this.lazyItems.length > 0 || this.hookCount > 0) {
      return false;
    }
    if (this.currentThinkingValue.trim().length > 0) {
      return false;
    }
    return true;
  }
  markAsInactive() {
    this.isActive = false;
    this.domNode.classList.remove("chat-thinking-active");
    this.domNode.classList.remove("chat-thinking-fade-top", "chat-thinking-fade-bottom");
    this.processPendingRemovals();
    if (this.workingSpinnerElement) {
      this.workingSpinnerElement.remove();
      this.workingSpinnerElement = void 0;
      this.workingSpinnerLabel = void 0;
    }
    for (const toolInvocation of this.toolInvocations) {
      toolInvocation.isAttachedToThinking = false;
    }
  }
  finalizeTitleIfDefault() {
    this.processPendingRemovals();
    if (this.wrapper) {
      this.wrapper.classList.remove("chat-thinking-streaming");
    }
    this.domNode.classList.remove("chat-thinking-active");
    this.domNode.classList.remove("chat-thinking-fade-top", "chat-thinking-fade-bottom");
    this.streamingCompleted = true;
    this.setContentAnimationEnabled(!this.fixedScrollingMode);
    this.flushPendingExternalResources();
    if (this.workingSpinnerElement) {
      this.workingSpinnerElement.remove();
      this.workingSpinnerElement = void 0;
      this.workingSpinnerLabel = void 0;
    }
    if (this._collapseButton) {
      this._collapseButton.icon = Codicon.check;
    }
    this.updateScrollDimensionsForCompletion();
    this.updateDropdownClickability();
    if (this.content.generatedTitle) {
      this.currentTitle = this.content.generatedTitle;
      this.setGeneratedTitleOnAllParts(this.content.generatedTitle);
      this.setFinalizedTitle(this.content.generatedTitle);
      return;
    }
    const existingTitle = this.toolInvocations.find((t) => t.generatedTitle)?.generatedTitle ?? this.allThinkingParts.find((t) => t.generatedTitle)?.generatedTitle;
    if (existingTitle) {
      this.currentTitle = existingTitle;
      this.content.generatedTitle = existingTitle;
      this.setGeneratedTitleOnAllParts(existingTitle);
      this.setFinalizedTitle(existingTitle);
      return;
    }
    const allToolsSerialized = this.toolInvocations.every((t) => t.kind === "toolInvocationSerialized");
    if (allToolsSerialized && !LocalChatSessionUri.isLocalSession(this.element.sessionResource)) {
      const cacheId = this.getTitleCacheId();
      if (cacheId) {
        const cachedTitle = this.getCachedTitle(cacheId);
        if (cachedTitle) {
          this.currentTitle = cachedTitle;
          this.content.generatedTitle = cachedTitle;
          this.setGeneratedTitleOnAllParts(cachedTitle);
          this.setFinalizedTitle(cachedTitle);
          return;
        }
      }
    }
    if (this.toolInvocationCount === 1 && this.hookCount === 0 && this.currentThinkingValue.trim() === "") {
      if (!this.singleItemInfo) {
        const lazyItem = this.lazyItems.find((item) => item.kind === "tool" && item.originalParent);
        if (lazyItem && lazyItem.kind === "tool") {
          const toolInvocation = lazyItem.toolInvocationOrMarkdown && (lazyItem.toolInvocationOrMarkdown.kind === "toolInvocation" || lazyItem.toolInvocationOrMarkdown.kind === "toolInvocationSerialized") ? lazyItem.toolInvocationOrMarkdown : void 0;
          const result = lazyItem.lazy.value;
          this.appendItemToDOM(result.domNode, lazyItem.toolInvocationId, lazyItem.toolInvocationOrMarkdown, lazyItem.originalParent);
          if (result.disposable) {
            const toolCallId = toolInvocation?.toolCallId;
            if (toolCallId) {
              this.ownedToolParts.set(toolCallId, result.disposable);
            } else {
              this._register(result.disposable);
            }
          }
        }
      }
      if (this.singleItemInfo && this.restoreSingleItemToOriginalPosition()) {
        return;
      }
    }
    if (this.extractedTitles.length === 1 && this.toolInvocationCount === 0) {
      const title = this.extractedTitles[0];
      this.currentTitle = title;
      this.content.generatedTitle = title;
      this.setGeneratedTitleOnAllParts(title);
      this.setFinalizedTitle(title);
      return;
    }
    const generateTitles = this.configurationService.getValue(ChatConfiguration.ThinkingGenerateTitles) ?? true;
    if (!generateTitles) {
      this.setFallbackTitle();
      return;
    }
    this.generateTitleViaLLM();
  }
  setGeneratedTitleOnAllParts(title) {
    for (const toolInvocation of this.toolInvocations) {
      toolInvocation.generatedTitle = title;
    }
    for (const thinkingPart of this.allThinkingParts) {
      thinkingPart.generatedTitle = title;
    }
  }
  loadTitleCache() {
    return this.storageService.getObject(TITLE_CACHE_STORAGE_KEY, StorageScope.PROFILE) ?? {};
  }
  saveTitleCache(cache) {
    if (Object.keys(cache).length === 0) {
      this.storageService.remove(TITLE_CACHE_STORAGE_KEY, StorageScope.PROFILE);
    } else {
      this.storageService.store(TITLE_CACHE_STORAGE_KEY, JSON.stringify(cache), StorageScope.PROFILE, StorageTarget.MACHINE);
    }
  }
  getTitleCacheKey(id) {
    return `${chatSessionResourceToId(this.element.sessionResource)}:${id}`;
  }
  /**
   * Stable id used to persist/restore the generated title. Tool-based blocks
   * key off the last tool call id; reasoning-only blocks fall back to the
   * thinking part id so their headers also survive a session reload.
   */
  getTitleCacheId() {
    const lastTool = this.toolInvocations[this.toolInvocations.length - 1];
    if (lastTool) {
      return lastTool.toolCallId;
    }
    return this.allThinkingParts.find((t) => t.id)?.id ?? this.content.id;
  }
  getCachedTitle(id) {
    const entry = this.loadTitleCache()[this.getTitleCacheKey(id)];
    if (!entry || Date.now() - entry.storedAt > TITLE_CACHE_TTL_MS) {
      return void 0;
    }
    return entry.title;
  }
  setCachedTitle(id, title) {
    const cache = this.loadTitleCache();
    const now = Date.now();
    for (const key of Object.keys(cache)) {
      if (now - cache[key].storedAt > TITLE_CACHE_TTL_MS) {
        delete cache[key];
      }
    }
    cache[this.getTitleCacheKey(id)] = { title, storedAt: now };
    const keys = Object.keys(cache);
    if (keys.length > TITLE_CACHE_MAX_ENTRIES) {
      const sorted = keys.sort((a, b) => cache[a].storedAt - cache[b].storedAt);
      for (let i = 0; i < sorted.length - TITLE_CACHE_MAX_ENTRIES; i++) {
        delete cache[sorted[i]];
      }
    }
    this.saveTitleCache(cache);
  }
  async generateTitleViaLLM() {
    const cts = new CancellationTokenSource();
    const timeout = setTimeout(() => cts.cancel(), 5e3);
    try {
      const models = await this.languageModelsService.selectLanguageModels({ vendor: "copilot", id: "copilot-utility-small" });
      if (!models.length) {
        this.setFallbackTitle();
        return;
      }
      if (cts.token.isCancellationRequested) {
        this.setFallbackTitle();
        return;
      }
      let context;
      if (this.extractedTitles.length > 0) {
        context = this.extractedTitles.join(", ");
      } else {
        context = this.currentThinkingValue.substring(0, 1e3);
      }
      const prompt = `Summarize the following content in a SINGLE sentence (under 10 words) using past tense. Follow these rules strictly:

			OUTPUT FORMAT:
			- MUST be a single sentence
			- MUST be under 10 words
			- The FIRST word MUST be a past tense verb (e.g. "Updated", "Reviewed", "Created", "Searched", "Analyzed")
			- No quotes, no trailing punctuation

			GENERAL:
			- The content may include tool invocations (file edits, reads, searches, terminal commands), reasoning headers, or raw thinking text
			- For reasoning headers or thinking text (no tool calls), summarize WHAT was considered/analyzed, NOT that thinking occurred
			- For thinking-only summaries, use phrases like: "Considered...", "Planned...", "Analyzed...", "Reviewed..."

			TOOL NAME FILTERING:
			- NEVER include tool names like "Replace String in File", "Multi Replace String in File", "Create File", "Read File", etc. in the output
			- If an action says "Edited X and used Replace String in File", output ONLY the action on X
			- Tool names describe HOW something was done, not WHAT was done - always omit them

			VOCABULARY - Use varied synonyms for natural-sounding summaries:
			- For edits: "Updated", "Modified", "Changed", "Refactored", "Fixed", "Adjusted"
			- For reads: "Reviewed", "Examined", "Checked", "Inspected", "Analyzed", "Explored"
			- For creates: "Created", "Added", "Generated"
			- For searches: "Searched for", "Looked up", "Investigated"
			- For terminal: "Ran command", "Executed"
			- For reasoning/thinking: "Considered", "Planned", "Analyzed", "Reviewed", "Evaluated"
			- Choose the synonym that best fits the context

${this.hookCount > 0 ? `BLOCKED/DENIED CONTENT (hooks detected):
			- Only mention "blocked" if the content explicitly includes hook results that blocked or warned about a tool (e.g. "Blocked terminal" or "Warning for read_file")
			- If blocked items are present alongside normal tool calls, briefly note the block but do NOT let it dominate the summary: e.g. "Updated file.ts, blocked terminal"

			` : `IMPORTANT: Do NOT use words like "blocked", "denied", or "tried" in the summary - there are no hooks or blocked items in this content. Just summarize normally.

			`}RULES FOR TOOL CALLS:
			1. If the SAME file was both edited AND read: Use a combined phrase like "Reviewed and updated <filename>"
			2. If exactly ONE file was edited: Start with an edit synonym + "<filename>" (include actual filename)
			3. If exactly ONE file was read: Start with a read synonym + "<filename>" (include actual filename)
			4. If MULTIPLE files were edited: Start with an edit synonym + "X files"
			5. If MULTIPLE files were read: Start with a read synonym + "X files"
			6. If BOTH edits AND reads occurred on DIFFERENT files: Combine them naturally
			7. For searches: Say "searched for <term>" or "looked up <term>" with the actual search term, NOT "searched for files"
			8. After the file info, you may add a brief summary of other actions if space permits
			9. NEVER say "1 file" - always use the actual filename when there's only one file

			RULES FOR REASONING HEADERS (no tool calls):
			1. If the input contains reasoning/analysis headers without actual tool invocations, summarize the main topic and what was considered
			2. Use past tense verbs that indicate thinking, not doing: "Considered", "Planned", "Analyzed", "Evaluated"
			3. Focus on WHAT was being thought about, not that thinking occurred

			RULES FOR RAW THINKING TEXT:
			1. Extract the main topic or question being considered from the text
			2. Identify any specific files, functions, or concepts mentioned
			3. Summarize as "Analyzed <topic>" or "Considered <specific thing>"
			4. If discussing code structure: "Reviewed <component/architecture>"
			5. If discussing a problem: "Analyzed <problem description>"
			6. If discussing implementation: "Planned <feature/change>"

			EXAMPLES WITH TOOLS:
			- "Read HomePage.tsx, Edited HomePage.tsx" \u2192 "Reviewed and updated HomePage.tsx"
			- "Edited HomePage.tsx" \u2192 "Updated HomePage.tsx"
			- "Edited config.css and used Replace String in File" \u2192 "Modified config.css"
			- "Edited App.tsx, used Multi Replace String in File" \u2192 "Refactored App.tsx"
			- "Read config.json, Read package.json" \u2192 "Reviewed 2 files"
			- "Edited App.tsx, Read utils.ts" \u2192 "Updated App.tsx and checked utils.ts"
			- "Edited App.tsx, Read utils.ts, Read types.ts" \u2192 "Updated App.tsx and reviewed 2 files"
			- "Edited index.ts, Edited styles.css, Ran terminal command" \u2192 "Modified 2 files and ran command"
			- "Read README.md, Searched for AuthService" \u2192 "Checked README.md and searched for AuthService"
			- "Searched for login, Searched for authentication" \u2192 "Searched for login and authentication"
			- "Edited api.ts, Edited models.ts, Read schema.json" \u2192 "Updated 2 files and reviewed schema.json"
			- "Edited Button.tsx, Edited Button.css, Edited index.ts" \u2192 "Modified 3 files"
			- "Searched codebase for error handling" \u2192 "Looked up error handling"

${this.hookCount > 0 ? `EXAMPLES WITH BLOCKED CONTENT (from hooks):
			- "Blocked terminal, Edited config.ts" \u2192 "Edited config.ts, terminal was blocked"
			- "Blocked terminal, Blocked read_file" \u2192 "Two tools were blocked by hooks"
			- "Warning for read_file, Edited utils.ts" \u2192 "Edited utils.ts with a hook warning"

			` : ""}EXAMPLES WITH REASONING HEADERS (no tools):
			- "Analyzing component architecture" \u2192 "Considered component architecture"
			- "Planning refactor strategy" \u2192 "Planned refactor strategy"
			- "Reviewing error handling approach, Considering edge cases" \u2192 "Analyzed error handling approach"
			- "Understanding the codebase structure" \u2192 "Reviewed codebase structure"
			- "Thinking about implementation options" \u2192 "Considered implementation options"

			EXAMPLES WITH RAW THINKING TEXT:
			- "I need to understand how the authentication flow works in this app..." \u2192 "Analyzed authentication flow"
			- "Let me think about how to refactor this component to be more maintainable..." \u2192 "Planned component refactoring"
			- "The error seems to be coming from the database connection..." \u2192 "Investigated database connection issue"
			- "Looking at the UserService class, I see it handles..." \u2192 "Reviewed UserService implementation"

			Content: ${context}`;
      const response = await this.languageModelsService.sendChatRequest(
        models[0],
        void 0,
        [{ role: ChatMessageRole.User, content: [{ type: "text", value: prompt }] }],
        {},
        cts.token
      );
      let generatedTitle = "";
      for await (const part of response.stream) {
        if (cts.token.isCancellationRequested) {
          break;
        }
        if (Array.isArray(part)) {
          for (const p of part) {
            if (p.type === "text") {
              generatedTitle += p.value;
            }
          }
        } else if (part.type === "text") {
          generatedTitle += part.value;
        }
      }
      if (cts.token.isCancellationRequested) {
        this.setFallbackTitle();
        return;
      }
      await response.result;
      generatedTitle = generatedTitle.trim();
      if (generatedTitle.includes("can't assist with that")) {
        this.setFallbackTitle();
        return;
      }
      if (generatedTitle && !this._store.isDisposed) {
        this.currentTitle = generatedTitle;
        this.setFinalizedTitle(generatedTitle);
        this.content.generatedTitle = generatedTitle;
        this.setGeneratedTitleOnAllParts(generatedTitle);
        if (!LocalChatSessionUri.isLocalSession(this.element.sessionResource)) {
          const cacheId = this.getTitleCacheId();
          if (cacheId) {
            this.setCachedTitle(cacheId, generatedTitle);
          }
        }
        return;
      }
    } catch (error) {
    } finally {
      clearTimeout(timeout);
      cts.dispose();
    }
    this.setFallbackTitle();
  }
  restoreSingleItemToOriginalPosition() {
    if (!this.singleItemInfo) {
      return false;
    }
    const { element, thinkingWrapper, originalParent, originalNextSibling, restoreToOriginalParent, toolInvocation } = this.singleItemInfo;
    const hasOtherThinkingItems = this.wrapper && Array.from(this.wrapper.children).some(
      (child) => child !== thinkingWrapper && child !== this.workingSpinnerElement
    );
    if (hasOtherThinkingItems) {
      this.singleItemInfo = void 0;
      return false;
    }
    const precedingToolInvocationPart = isHTMLElement(originalNextSibling) && originalNextSibling.parentElement === originalParent ? originalNextSibling.previousElementSibling : originalParent.lastElementChild;
    if (restoreToOriginalParent) {
      if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
        originalParent.insertBefore(element, originalNextSibling);
      } else {
        originalParent.appendChild(element);
      }
    } else if (precedingToolInvocationPart?.classList.contains("chat-tool-invocation-part")) {
      precedingToolInvocationPart.appendChild(element);
    } else if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
      originalParent.insertBefore(element, originalNextSibling);
    } else {
      originalParent.appendChild(element);
    }
    thinkingWrapper.remove();
    if (toolInvocation) {
      this.toolWrappersByCallId.delete(toolInvocation.toolCallId);
      this.toolIconsByCallId.delete(toolInvocation.toolCallId);
      toolInvocation.isAttachedToThinking = false;
    }
    hide(this.domNode);
    this.singleItemInfo = void 0;
    return true;
  }
  updateAggregatedDiff() {
    let totalAdded = 0;
    let totalRemoved = 0;
    for (const stats of this.diffStatsByPartId.values()) {
      totalAdded += stats.added;
      totalRemoved += stats.removed;
    }
    this._aggregatedDiff = { added: totalAdded, removed: totalRemoved };
    if (this.streamingCompleted || this.element.isComplete) {
      this.setFinalizedTitle(this.currentTitle);
    }
  }
  setFallbackTitle() {
    const finalLabel = this.appendedItemCount > 0 ? this.appendedItemCount === 1 ? localize("chat.thinking.finished.withStepsSingular", "Finished with 1 step") : localize("chat.thinking.finished.withStepsPlural", "Finished with {0} steps", this.appendedItemCount) : localize("chat.thinking.finished", "Finished Working");
    this.currentTitle = finalLabel;
    if (this.wrapper) {
      this.wrapper.classList.remove("chat-thinking-streaming");
    }
    this.domNode.classList.remove("chat-thinking-active");
    this.streamingCompleted = true;
    this.flushPendingExternalResources();
    if (this._collapseButton) {
      this._collapseButton.icon = Codicon.check;
      this.setFinalizedTitle(finalLabel);
    }
    this.updateDropdownClickability();
  }
  /**
   * Appends a tool invocation or content item to the thinking group.
   * The factory is called lazily - only when the thinking section is expanded.
   * If already expanded, the factory is called immediately.
   *
   * When the caller has already created the content part eagerly (for example, a
   * pre-built `ChatMarkdownContentPart` wrapped in a factory), the caller MUST pass
   * that part as `eagerDisposable` so it is registered on this thinking part
   * immediately. Otherwise, if the thinking section is collapsed and the lazy item
   * is never materialized (because the user never expands it), the eagerly-created
   * part would leak: its disposable is only referenced from inside the factory's
   * closure, which nothing ever calls.
   */
  appendItem(factory, toolInvocationId, toolInvocationOrMarkdown, originalParent, onDidChangeDiff, eagerDisposable) {
    this.processPendingRemovals();
    this.containsGroupedItems = true;
    this.trackToolMetadata(toolInvocationId, toolInvocationOrMarkdown);
    this.updateWorkingSpinnerVisibility();
    this.appendedItemCount++;
    if (onDidChangeDiff && toolInvocationId) {
      this._register(onDidChangeDiff((stats) => {
        this.diffStatsByPartId.set(toolInvocationId, stats);
        this.updateAggregatedDiff();
      }));
    }
    if (eagerDisposable) {
      this._register(eagerDisposable);
    }
    if (this.workingSpinnerLabel) {
      const isTerminalTool = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized") && toolInvocationOrMarkdown.toolSpecificData?.kind === "terminal";
      const category = isTerminalTool ? "terminal" /* Terminal */ : "tool" /* Tool */;
      this.workingSpinnerLabel.textContent = this.getRandomWorkingMessage(category);
    }
    if (this.isExpanded() || this.hasExpandedOnce || this.fixedScrollingMode && !this.streamingCompleted) {
      const result = factory();
      this.appendItemToDOM(result.domNode, toolInvocationId, toolInvocationOrMarkdown, originalParent);
      if (result.disposable) {
        const toolCallId = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized") ? toolInvocationOrMarkdown.toolCallId : void 0;
        if (toolCallId) {
          this.ownedToolParts.set(toolCallId, result.disposable);
        } else {
          this._register(result.disposable);
        }
      }
    } else {
      const item = {
        kind: "tool",
        lazy: new Lazy(factory),
        toolInvocationId,
        toolInvocationOrMarkdown,
        originalParent,
        isHook: !toolInvocationOrMarkdown && !!toolInvocationId
      };
      this.lazyItems.push(item);
    }
    this.updateDropdownClickability();
  }
  removeMaterializedItem(toolCallId) {
    this.toolDisposables.deleteAndDispose(toolCallId);
    this.ownedToolParts.delete(toolCallId);
    const wrapper = this.toolWrappersByCallId.get(toolCallId);
    if (wrapper) {
      this.toolWrappersByCallId.delete(toolCallId);
      this.toolIconsByCallId.delete(toolCallId);
    }
    this.appendedItemCount = Math.max(0, this.appendedItemCount - 1);
    this.toolInvocationCount = Math.max(0, this.toolInvocationCount - 1);
    const toolInvocationsIndex = this.toolInvocations.findIndex(
      (t) => (t.kind === "toolInvocation" || t.kind === "toolInvocationSerialized") && t.toolCallId === toolCallId
    );
    if (toolInvocationsIndex !== -1) {
      const label = this.toolLabelsByCallId.get(toolCallId);
      if (label) {
        const titleIndex = this.extractedTitles.indexOf(label);
        if (titleIndex !== -1) {
          this.extractedTitles.splice(titleIndex, 1);
        }
      }
      this.toolInvocations.splice(toolInvocationsIndex, 1);
    }
    this.toolLabelsByCallId.delete(toolCallId);
    this._pendingExternalResources.delete(toolCallId);
    this._externalResourceWidget.removeToolInvocation(toolCallId);
    this.updateWorkingSpinnerVisibility();
    this.updateDropdownClickability();
    this._onDidChangeHeight.fire();
  }
  /**
   * Removes a markdown edit pill child by its part ID (codeblocksPartId).
   */
  removeEditPillByPartId(partId) {
    let removed = false;
    const lazyIndex = this.lazyItems.findIndex((item) => item.kind === "tool" && item.toolInvocationId === partId);
    if (lazyIndex !== -1) {
      this.lazyItems.splice(lazyIndex, 1);
      removed = true;
    }
    if (this.diffStatsByPartId.delete(partId)) {
      this.updateAggregatedDiff();
      removed = true;
    }
    if (removed) {
      this.appendedItemCount = Math.max(0, this.appendedItemCount - 1);
      this.updateDropdownClickability();
      this._onDidChangeHeight.fire();
    }
  }
  /**
   * removes/re-establishes a lazy item from the thinking container
   * this is needed so we can check if there are confirmations still needed
   */
  removeLazyItem(toolInvocationId) {
    const index = this.lazyItems.findIndex((item) => item.kind === "tool" && item.toolInvocationId === toolInvocationId);
    if (index === -1) {
      return false;
    }
    const removedItem = this.lazyItems[index];
    this.lazyItems.splice(index, 1);
    this.appendedItemCount--;
    if (removedItem.kind === "tool" && removedItem.isHook) {
      this.hookCount = Math.max(0, this.hookCount - 1);
    } else {
      this.toolInvocationCount--;
    }
    if (removedItem.kind === "tool" && removedItem.toolInvocationOrMarkdown && (removedItem.toolInvocationOrMarkdown.kind === "toolInvocation" || removedItem.toolInvocationOrMarkdown.kind === "toolInvocationSerialized")) {
      removedItem.toolInvocationOrMarkdown.isAttachedToThinking = false;
      const toolCallId = removedItem.toolInvocationOrMarkdown.toolCallId;
      this._pendingExternalResources.delete(toolCallId);
      this._externalResourceWidget.removeToolInvocation(toolCallId);
      const label = this.toolLabelsByCallId.get(toolCallId);
      if (label) {
        const titleIndex = this.extractedTitles.indexOf(label);
        if (titleIndex !== -1) {
          this.extractedTitles.splice(titleIndex, 1);
        }
      }
      this.toolLabelsByCallId.delete(toolCallId);
    }
    const toolInvocationsIndex = this.toolInvocations.findIndex(
      (t) => (t.kind === "toolInvocation" || t.kind === "toolInvocationSerialized") && t.toolId === toolInvocationId
    );
    if (toolInvocationsIndex !== -1) {
      this.toolInvocations.splice(toolInvocationsIndex, 1);
    }
    this.updateDropdownClickability();
    this.updateWorkingSpinnerVisibility();
    return true;
  }
  processPendingRemovals() {
    this.pendingRemovalFlushDisposable?.dispose();
    this.pendingRemovalFlushDisposable = void 0;
    if (this.pendingRemovals.length === 0) {
      return;
    }
    const pendingRemovals = this.pendingRemovals;
    this.pendingRemovals = [];
    for (const pending of pendingRemovals) {
      this.removeStreamingToolEntry(pending.toolCallId, pending.toolLabel);
    }
  }
  schedulePendingRemovalsFlush() {
    if (this.pendingRemovalFlushDisposable) {
      return;
    }
    this.pendingRemovalFlushDisposable = scheduleAtNextAnimationFrame(getWindow(this.domNode), () => {
      this.pendingRemovalFlushDisposable = void 0;
      if (this._store.isDisposed) {
        return;
      }
      this.processPendingRemovals();
    });
  }
  // removes the tool entry that was previously streaming and now is not. removes item from dom and internal tracking.
  removeStreamingToolEntry(toolCallId, toolLabel) {
    this.toolDisposables.deleteAndDispose(toolCallId);
    this.ownedToolParts.get(toolCallId)?.dispose();
    this.ownedToolParts.delete(toolCallId);
    const wrapper = this.toolWrappersByCallId.get(toolCallId);
    if (wrapper) {
      wrapper.remove();
      this.toolWrappersByCallId.delete(toolCallId);
      this.toolIconsByCallId.delete(toolCallId);
    }
    const lazyIndex = this.lazyItems.findIndex(
      (item) => item.kind === "tool" && item.toolInvocationOrMarkdown && (item.toolInvocationOrMarkdown.kind === "toolInvocation" || item.toolInvocationOrMarkdown.kind === "toolInvocationSerialized") && item.toolInvocationOrMarkdown.toolCallId === toolCallId
    );
    if (lazyIndex !== -1) {
      const removedLazyItem = this.lazyItems[lazyIndex];
      if (removedLazyItem.kind === "tool" && removedLazyItem.toolInvocationOrMarkdown && (removedLazyItem.toolInvocationOrMarkdown.kind === "toolInvocation" || removedLazyItem.toolInvocationOrMarkdown.kind === "toolInvocationSerialized")) {
        removedLazyItem.toolInvocationOrMarkdown.isAttachedToThinking = false;
      }
      this.lazyItems.splice(lazyIndex, 1);
    }
    this.appendedItemCount = Math.max(0, this.appendedItemCount - 1);
    this.toolInvocationCount = Math.max(0, this.toolInvocationCount - 1);
    const toolInvocationsIndex = this.toolInvocations.findIndex(
      (t) => (t.kind === "toolInvocation" || t.kind === "toolInvocationSerialized") && t.toolCallId === toolCallId
    );
    if (toolInvocationsIndex !== -1) {
      this.toolInvocations.splice(toolInvocationsIndex, 1);
    }
    const titleIndex = this.extractedTitles.indexOf(toolLabel);
    if (titleIndex !== -1) {
      this.extractedTitles.splice(titleIndex, 1);
    }
    this.toolLabelsByCallId.delete(toolCallId);
    this._pendingExternalResources.delete(toolCallId);
    this._externalResourceWidget.removeToolInvocation(toolCallId);
    this.updateWorkingSpinnerVisibility();
    this.updateDropdownClickability();
    this._onDidChangeHeight.fire();
  }
  trackToolMetadata(toolInvocationId, toolInvocationOrMarkdown) {
    if (!toolInvocationId) {
      return;
    }
    const isHook = !toolInvocationOrMarkdown;
    if (isHook) {
      this.hookCount++;
    } else {
      this.toolInvocationCount++;
    }
    if (this.toolInvocationCount === 1) {
      this.defaultTitle = this.workingTitle;
    }
    let toolCallLabel;
    const isToolInvocation = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized");
    if (isToolInvocation && toolInvocationOrMarkdown.invocationMessage) {
      const message = typeof toolInvocationOrMarkdown.invocationMessage === "string" ? toolInvocationOrMarkdown.invocationMessage : toolInvocationOrMarkdown.invocationMessage.value;
      const isStreamingEditTool = toolInvocationOrMarkdown.kind === "toolInvocation" && IChatToolInvocation.isStreaming(toolInvocationOrMarkdown) && isGenericEditToolId(toolInvocationOrMarkdown.toolId);
      if (isStreamingEditTool) {
        toolCallLabel = localize("chat.thinking.editingFiles", "Editing files");
      } else {
        toolCallLabel = message;
      }
      this.toolInvocations.push(toolInvocationOrMarkdown);
      const toolCallId = toolInvocationOrMarkdown.toolCallId;
      this.toolLabelsByCallId.set(toolCallId, toolCallLabel);
      if (toolInvocationOrMarkdown.kind === "toolInvocationSerialized") {
        this.updateExternalResourceParts(toolInvocationOrMarkdown);
        if (IChatToolInvocation.isEffectivelyHidden(toolInvocationOrMarkdown)) {
          this.pendingRemovals.push({ toolCallId: toolInvocationOrMarkdown.toolCallId, toolLabel: toolCallLabel });
          this.schedulePendingRemovalsFlush();
        }
      }
      if (toolInvocationOrMarkdown.kind === "toolInvocation") {
        let currentToolLabel = toolCallLabel;
        let isComplete = false;
        let isStreaming = IChatToolInvocation.isStreaming(toolInvocationOrMarkdown);
        const toolStore = new DisposableStore();
        this.toolDisposables.set(toolInvocationOrMarkdown.toolCallId, toolStore);
        const updateTitle = (updatedMessage) => {
          if (updatedMessage && updatedMessage !== currentToolLabel) {
            const oldIndex = this.extractedTitles.indexOf(currentToolLabel);
            const updatedIndex = this.extractedTitles.indexOf(updatedMessage);
            if (oldIndex !== -1) {
              if (updatedIndex !== -1 && updatedIndex !== oldIndex) {
                this.extractedTitles.splice(oldIndex, 1);
              } else {
                this.extractedTitles[oldIndex] = updatedMessage;
              }
            } else if (updatedIndex === -1) {
              this.extractedTitles.push(updatedMessage);
            }
            currentToolLabel = updatedMessage;
            this.toolLabelsByCallId.set(toolCallId, updatedMessage);
            this.lastExtractedTitle = updatedMessage;
            if (!this.fixedScrollingMode && !this._isExpanded.read(void 0)) {
              this.setTitle(updatedMessage);
            }
          }
        };
        const autorunDisposable = autorun((reader) => {
          if (isComplete) {
            return;
          }
          const currentState = toolInvocationOrMarkdown.state.read(reader);
          this.updateWorkingSpinnerVisibility(reader);
          if (isStreaming && currentState.type !== IChatToolInvocation.StateKind.Streaming) {
            isStreaming = false;
            const termData = toolInvocationOrMarkdown.toolSpecificData;
            if (termData?.kind === "terminal") {
              const iconEl = this.toolIconsByCallId.get(toolCallId);
              if (iconEl) {
                const newIcon = termData.commandLine?.isSandboxWrapped ? Codicon.terminalSecure : Codicon.terminal;
                setThinkingIcon(iconEl, newIcon);
              }
            }
            if (toolInvocationOrMarkdown.presentation === "hidden") {
              this.pendingRemovals.push({ toolCallId: toolInvocationOrMarkdown.toolCallId, toolLabel: currentToolLabel });
              this.schedulePendingRemovalsFlush();
              isComplete = true;
              return;
            }
          }
          if (currentState.type === IChatToolInvocation.StateKind.Completed || currentState.type === IChatToolInvocation.StateKind.Cancelled) {
            if (toolInvocationOrMarkdown.presentation === "hidden" || toolInvocationOrMarkdown.presentation === "hiddenAfterComplete") {
              this.pendingRemovals.push({ toolCallId: toolInvocationOrMarkdown.toolCallId, toolLabel: currentToolLabel });
              this.schedulePendingRemovalsFlush();
            }
            if (currentState.type === IChatToolInvocation.StateKind.Completed) {
              this.updateExternalResourceParts(toolInvocationOrMarkdown);
              const completedMessage = toolInvocationOrMarkdown.pastTenseMessage ?? toolInvocationOrMarkdown.invocationMessage;
              const completedText = typeof completedMessage === "string" ? completedMessage : completedMessage.value;
              const iconElement = this.toolIconsByCallId.get(toolCallId);
              if (iconElement && isNoProblemsFoundResult(toolInvocationOrMarkdown.toolId, completedText)) {
                setThinkingIcon(iconElement, Codicon.search);
              }
            }
            isComplete = true;
            return;
          }
          if (currentState.type === IChatToolInvocation.StateKind.Streaming) {
            isStreaming = true;
            const streamingMessage = currentState.streamingMessage.read(reader);
            if (streamingMessage) {
              const updatedMessage = typeof streamingMessage === "string" ? streamingMessage : streamingMessage.value;
              updateTitle(updatedMessage);
            }
            return;
          }
          if (currentState.type === IChatToolInvocation.StateKind.Executing) {
            const progressData = currentState.progress.read(reader);
            if (progressData.message) {
              const updatedMessage = typeof progressData.message === "string" ? progressData.message : progressData.message.value;
              updateTitle(updatedMessage);
            } else {
              const invocationMsg2 = toolInvocationOrMarkdown.invocationMessage;
              if (invocationMsg2) {
                const updatedMessage = typeof invocationMsg2 === "string" ? invocationMsg2 : invocationMsg2.value;
                updateTitle(updatedMessage);
              }
            }
            return;
          }
          const invocationMsg = toolInvocationOrMarkdown.invocationMessage;
          if (invocationMsg) {
            const updatedMessage = typeof invocationMsg === "string" ? invocationMsg : invocationMsg.value;
            updateTitle(updatedMessage);
          }
        });
        toolStore.add(autorunDisposable);
      }
    } else if (toolInvocationOrMarkdown?.kind === "markdownContent") {
      const codeblockInfo = extractCodeblockUrisFromText(toolInvocationOrMarkdown.content.value);
      if (codeblockInfo?.uri) {
        const filename = basename(codeblockInfo.uri);
        toolCallLabel = localize("chat.thinking.editedFile", "Edited {0}", filename);
      } else {
        toolCallLabel = localize("chat.thinking.editingFile", "Edited file");
      }
    } else if (toolInvocationOrMarkdown?.kind === "externalEdit") {
      const filename = basename(toolInvocationOrMarkdown.uri);
      switch (toolInvocationOrMarkdown.editKind) {
        case "create":
          toolCallLabel = localize("chat.thinking.createdFile", "Created {0}", filename);
          break;
        case "delete":
          toolCallLabel = localize("chat.thinking.deletedFile", "Deleted {0}", filename);
          break;
        case "rename":
          toolCallLabel = localize("chat.thinking.renamedFile", "Renamed {0}", filename);
          break;
        case "edit":
          toolCallLabel = localize("chat.thinking.editedFile", "Edited {0}", filename);
          break;
      }
    } else {
      toolCallLabel = toolInvocationId;
    }
    if (!this.extractedTitles.includes(toolCallLabel)) {
      this.extractedTitles.push(toolCallLabel);
    }
    this.lastExtractedTitle = toolCallLabel;
    if (!this.fixedScrollingMode && !this._isExpanded.get()) {
      this.setTitle(toolCallLabel);
    }
  }
  updateExternalResourceParts(toolInvocation) {
    if (this.fixedScrollingMode && !this.streamingCompleted && !this.element.isComplete) {
      this._pendingExternalResources.set(toolInvocation.toolCallId, toolInvocation);
      return;
    }
    const extractedImages = extractImagesFromToolInvocationOutputDetails(toolInvocation, this.element.sessionResource);
    if (extractedImages.length === 0) {
      return;
    }
    const parts = extractedImages.map((image) => ({
      kind: "data",
      value: image.data.buffer,
      mimeType: image.mimeType,
      uri: image.uri
    }));
    this._externalResourceWidget.setToolInvocationParts(toolInvocation.toolCallId, parts);
  }
  flushPendingExternalResources() {
    if (this._pendingExternalResources.size === 0) {
      return;
    }
    const pending = Array.from(this._pendingExternalResources.values());
    this._pendingExternalResources.clear();
    for (const toolInvocation of pending) {
      this.updateExternalResourceParts(toolInvocation);
    }
  }
  appendItemToDOM(content, toolInvocationId, toolInvocationOrMarkdown, originalParent) {
    if (!content.hasChildNodes() || content.textContent?.trim() === "") {
      return;
    }
    const itemWrapper = $(".chat-thinking-tool-wrapper");
    const isMarkdownEdit = toolInvocationOrMarkdown?.kind === "markdownContent";
    const isExternalEdit = toolInvocationOrMarkdown?.kind === "externalEdit";
    const isTerminalTool = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized") && toolInvocationOrMarkdown.toolSpecificData?.kind === "terminal";
    const isSearchTool = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized") && toolInvocationOrMarkdown.toolSpecificData?.kind === "search";
    const toolInvocationIcon = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized") ? toolInvocationOrMarkdown.icon : void 0;
    let icon;
    if (isNoProblemsFoundResult(toolInvocationId, content.textContent ?? void 0)) {
      icon = Codicon.search;
    } else if (isMarkdownEdit || isExternalEdit) {
      icon = Codicon.pencil;
    } else if (isSearchTool) {
      icon = Codicon.search;
    } else if (isTerminalTool) {
      const terminalData = toolInvocationOrMarkdown.toolSpecificData;
      const exitCode = terminalData?.terminalCommandState?.exitCode;
      const isSandboxWrapped = terminalData?.commandLine?.isSandboxWrapped;
      if (exitCode !== void 0 && exitCode !== 0) {
        icon = Codicon.error;
      } else if (isSandboxWrapped) {
        icon = Codicon.terminalSecure;
      } else {
        icon = toolInvocationIcon ?? Codicon.terminal;
      }
    } else if (content.classList.contains("chat-hook-outcome-blocked")) {
      icon = Codicon.error;
    } else if (content.classList.contains("chat-hook-outcome-warning")) {
      icon = Codicon.warning;
    } else {
      icon = toolInvocationId ? getToolInvocationIcon(toolInvocationId, toolInvocationIcon, content.textContent ?? void 0) : Codicon.tools;
    }
    const iconElement = createThinkingIcon(icon);
    itemWrapper.appendChild(iconElement);
    itemWrapper.appendChild(content);
    if (this.toolInvocationCount === 1 && this.hookCount === 0 && originalParent) {
      const toolInvocation = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized") ? toolInvocationOrMarkdown : void 0;
      this.singleItemInfo = {
        element: content,
        thinkingWrapper: itemWrapper,
        originalParent,
        originalNextSibling: this.domNode,
        restoreToOriginalParent: !!toolInvocation || isExternalEdit,
        toolInvocation
      };
    } else {
      this.singleItemInfo = void 0;
    }
    const isToolInvocation = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized");
    if (isToolInvocation && toolInvocationOrMarkdown.toolCallId) {
      this.toolWrappersByCallId.set(toolInvocationOrMarkdown.toolCallId, itemWrapper);
      this.toolIconsByCallId.set(toolInvocationOrMarkdown.toolCallId, iconElement);
    }
    this.appendToWrapper(itemWrapper);
    if (this.fixedScrollingMode && this.scrollableElement) {
      if (this.childResizeObserver && !this.streamingCompleted) {
        const observeDisposable = this.childResizeObserver.observe(itemWrapper);
        const toolCallId = isToolInvocation ? toolInvocationOrMarkdown.toolCallId : void 0;
        if (toolCallId) {
          let store = this.toolDisposables.get(toolCallId);
          if (!store) {
            store = new DisposableStore();
            this.toolDisposables.set(toolCallId, store);
          }
          store.add(observeDisposable);
        } else {
          this._register(observeDisposable);
        }
      }
      this.scheduleAppendRefresh();
    }
  }
  scheduleAppendRefresh() {
    if (this._pendingAppendRefresh.value) {
      return;
    }
    this._pendingAppendRefresh.value = scheduleAtNextAnimationFrame(getWindow(this.wrapper), () => {
      this._pendingAppendRefresh.clear();
      if (this._store.isDisposed) {
        return;
      }
      this.refreshContentHeight();
      this.updateScrollDimensionsFromCache();
    });
  }
  materializeLazyItem(item) {
    if (item.kind === "thinking") {
      this.appendToWrapper(item.textContainer);
      this.textContainer = item.textContainer;
      this.id = item.content.id;
      this.updateThinking(item.content);
      return;
    }
    if (this.workingSpinnerLabel) {
      const isTerminalTool = item.toolInvocationOrMarkdown && (item.toolInvocationOrMarkdown.kind === "toolInvocation" || item.toolInvocationOrMarkdown.kind === "toolInvocationSerialized") && item.toolInvocationOrMarkdown.toolSpecificData?.kind === "terminal";
      const category = isTerminalTool ? "terminal" /* Terminal */ : "tool" /* Tool */;
      this.workingSpinnerLabel.textContent = this.getRandomWorkingMessage(category);
    }
    if (item.lazy.hasValue) {
      const result2 = item.lazy.value;
      if (!result2.domNode.parentElement) {
        this.appendItemToDOM(result2.domNode, item.toolInvocationId, item.toolInvocationOrMarkdown, item.originalParent);
      }
      return;
    }
    const result = item.lazy.value;
    this.appendItemToDOM(result.domNode, item.toolInvocationId, item.toolInvocationOrMarkdown, item.originalParent);
    if (result.disposable) {
      const toolCallId = item.toolInvocationOrMarkdown && (item.toolInvocationOrMarkdown.kind === "toolInvocation" || item.toolInvocationOrMarkdown.kind === "toolInvocationSerialized") ? item.toolInvocationOrMarkdown.toolCallId : void 0;
      if (toolCallId) {
        this.ownedToolParts.set(toolCallId, result.disposable);
      } else {
        this._register(result.disposable);
      }
    }
  }
  // makes a new text container. when we update, we now update this container.
  setupThinkingContainer(content) {
    if (this._store.isDisposed) {
      return;
    }
    this.appendedItemCount++;
    this.allThinkingParts.push(content);
    this.recordReasoningContent(extractTextFromPart(content));
    this.textContainer = $(".chat-thinking-item.markdown-content");
    if (this.childResizeObserver && this.fixedScrollingMode && !this.streamingCompleted) {
      this._register(this.childResizeObserver.observe(this.textContainer));
    }
    if (content.value) {
      if (this.isExpanded() || this.hasExpandedOnce || this.fixedScrollingMode && !this.streamingCompleted) {
        this.appendToWrapper(this.textContainer);
        this.id = content.id;
        this.updateThinking(content);
      } else {
        this.content = content;
        this.id = content.id;
        const lazyThinking = {
          kind: "thinking",
          textContainer: this.textContainer,
          content
        };
        this.lazyItems.push(lazyThinking);
      }
      if (this.workingSpinnerLabel) {
        this.workingSpinnerLabel.textContent = this.getRandomWorkingMessage("thinking" /* Thinking */);
      }
    }
    this.updateDropdownClickability();
  }
  setTitle(title, omitPrefix) {
    if (!title || this.element.isComplete) {
      return;
    }
    if (omitPrefix) {
      if (this._collapseButton) {
        const labelElement2 = this._collapseButton.labelElement;
        labelElement2.textContent = "";
        const plainSpan = $("span");
        plainSpan.textContent = title;
        labelElement2.appendChild(plainSpan);
        this._collapseButton.element.ariaLabel = title;
      }
      this.titleShimmerSpan = void 0;
      this.titleDetailContainer = void 0;
      this._titleDetailRendered.clear();
      this._titleFileWidgetStore.clear();
      this.currentTitle = title;
      return;
    }
    this.lastExtractedTitle = title;
    const thinkingLabel = localize("chat.thinking.label", "{0}: {1}", this.defaultTitle, title);
    this.currentTitle = thinkingLabel;
    if (!this._collapseButton) {
      return;
    }
    const labelElement = this._collapseButton.labelElement;
    if (!this.titleShimmerSpan || !this.titleShimmerSpan.parentElement) {
      labelElement.textContent = "";
      this.titleShimmerSpan = $("span.chat-thinking-title-shimmer");
      labelElement.appendChild(this.titleShimmerSpan);
    }
    this.titleShimmerSpan.textContent = localize("chat.thinking.shimmer", "{0}: ", this.defaultTitle);
    this._titleDetailRendered.clear();
    this._titleFileWidgetStore.clear();
    const result = this.chatContentMarkdownRenderer.render(new MarkdownString(title));
    result.element.classList.add("collapsible-title-content", "chat-thinking-title-detail");
    renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._titleFileWidgetStore);
    this._titleDetailRendered.value = result;
    if (this.titleDetailContainer) {
      this.titleDetailContainer.replaceWith(result.element);
    } else {
      labelElement.appendChild(result.element);
    }
    this.titleDetailContainer = result.element;
    this._collapseButton.element.ariaLabel = thinkingLabel;
    this._collapseButton.element.ariaExpanded = String(this.isExpanded());
  }
  hasSameContent(other, _followingContent, _element) {
    if (_element.isComplete) {
      return true;
    }
    if ((other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && other.toolSpecificData?.kind === "subagent" && !other.subAgentInvocationId) {
      return false;
    }
    if (other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized" || other.kind === "markdownContent" || other.kind === "hook") {
      return true;
    }
    if (other.kind !== "thinking") {
      return false;
    }
    return other?.id !== this.id;
  }
  dispose() {
    this.isActive = false;
    if (this.workingSpinnerElement) {
      this.workingSpinnerElement.remove();
      this.workingSpinnerElement = void 0;
      this.workingSpinnerLabel = void 0;
    }
    this.pendingRemovalFlushDisposable?.dispose();
    this.pendingRemovalFlushDisposable = void 0;
    this.pendingScrollDisposable?.dispose();
    super.dispose();
  }
};
ChatThinkingContentPart = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IChatMarkdownAnchorService),
  __decorateParam(7, ILanguageModelsService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IContextKeyService)
], ChatThinkingContentPart);
export {
  ChatThinkingContentPart,
  buildPhrasePool,
  createThinkingIcon,
  defaultThinkingMessages,
  getEffectiveThinkingDisplayMode,
  getToolInvocationIcon,
  maybePickFunWorkingMessage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0VGhpbmtpbmdDb250ZW50UGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7ICQsIGNsZWFyTm9kZSwgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyLCBnZXRXaW5kb3csIGhpZGUsIGlzSFRNTEVsZW1lbnQsIHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgSUNoYXRFeHRlcm5hbEVkaXQsIElDaGF0TWFya2Rvd25Db250ZW50LCBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLCBJQ2hhdFRoaW5raW5nUGFydCwgSUNoYXRUb29sSW52b2NhdGlvbiwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIElDaGF0Q29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgSUNoYXRSZW5kZXJlckNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiwgVGhpbmtpbmdEaXNwbGF5TW9kZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVJdGVtIH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSVJlbmRlcmVkTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBleHRyYWN0Q29kZWJsb2NrVXJpc0Zyb21UZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3dpZGdldC9hbm5vdGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29sbGFwc2libGVDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgcmVuZGVyRmlsZVdpZGdldHMgfSBmcm9tICcuL2NoYXRJbmxpbmVBbmNob3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSVJlYWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UgfSBmcm9tICcuL2NoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdE1lc3NhZ2VSb2xlLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCAnLi9tZWRpYS9jaGF0VGhpbmtpbmdDb250ZW50LmNzcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZXh0cmFjdEltYWdlc0Zyb21Ub29sSW52b2NhdGlvbk91dHB1dERldGFpbHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdEltYWdlRXh0cmFjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbGxhcHNpYmxlSU9EYXRhUGFydCB9IGZyb20gJy4vY2hhdFRvb2xJbnB1dE91dHB1dENvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUaGlua2luZ0V4dGVybmFsUmVzb3VyY2VXaWRnZXQgfSBmcm9tICcuL2NoYXRUaGlua2luZ0V4dGVybmFsUmVzb3VyY2VzV2lkZ2V0LmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmksIGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUVkaXRTZXNzaW9uRGlmZlN0YXRzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcblxuXG4vLyBDb250ZXh0IGtleSBpZCBtaXJyb3JlZCBmcm9tIGB2cy9zZXNzaW9ucy9jb21tb24vY29udGV4dGtleXNgIChgSXNQaG9uZUxheW91dENvbnRleHRgKS5cbi8vIElubGluZWQgYXMgYSBzdHJpbmcgYmVjYXVzZSBgdnMvd29ya2JlbmNoYCBtdXN0IG5vdCBpbXBvcnQgZnJvbSBgdnMvc2Vzc2lvbnNgLlxuY29uc3QgU0VTU0lPTlNfSVNfUEhPTkVfTEFZT1VUX0tFWSA9ICdzZXNzaW9uc0lzUGhvbmVMYXlvdXQnO1xuXG4vKipcbiAqIFJlc29sdmVzIHRoZSBlZmZlY3RpdmUgdGhpbmtpbmcgZGlzcGxheSBtb2RlLiBPbiBwaG9uZSBsYXlvdXQgd2UgYWx3YXlzIGZvcmNlXG4gKiB7QGxpbmsgVGhpbmtpbmdEaXNwbGF5TW9kZS5Db2xsYXBzZWRQcmV2aWV3fSBzbyBzdHJlYW1pbmcgcmVhc29uaW5nIHRha2VzIGxlc3NcbiAqIHJvb20gYW5kIGF1dG8tY29sbGFwc2VzIG9uIGNvbXBsZXRpb24gcmVnYXJkbGVzcyBvZiB0aGUgdXNlcidzIHNldHRpbmcuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRFZmZlY3RpdmVUaGlua2luZ0Rpc3BsYXlNb2RlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBUaGlua2luZ0Rpc3BsYXlNb2RlIHtcblx0aWYgKGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuPihTRVNTSU9OU19JU19QSE9ORV9MQVlPVVRfS0VZKSA9PT0gdHJ1ZSkge1xuXHRcdHJldHVybiBUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZFByZXZpZXc7XG5cdH1cblx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFRoaW5raW5nRGlzcGxheU1vZGU+KCdjaGF0LmFnZW50LnRoaW5raW5nU3R5bGUnKSA/PyBUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZDtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdFRleHRGcm9tUGFydChjb250ZW50OiBJQ2hhdFRoaW5raW5nUGFydCk6IHN0cmluZyB7XG5cdGNvbnN0IHJhdyA9IEFycmF5LmlzQXJyYXkoY29udGVudC52YWx1ZSkgPyBjb250ZW50LnZhbHVlLmpvaW4oJycpIDogKGNvbnRlbnQudmFsdWUgfHwgJycpO1xuXHRyZXR1cm4gcmF3LnRyaW0oKTtcbn1cblxuZnVuY3Rpb24gaXNFZGl0VG9vbElkKHRvb2xJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IGxvd2VyVG9vbElkID0gdG9vbElkLnRvTG93ZXJDYXNlKCk7XG5cdHJldHVybiBsb3dlclRvb2xJZC5pbmNsdWRlcygnZWRpdCcpIHx8XG5cdFx0bG93ZXJUb29sSWQuaW5jbHVkZXMoJ2NyZWF0ZScpIHx8XG5cdFx0bG93ZXJUb29sSWQuaW5jbHVkZXMoJ3JlcGxhY2UnKSB8fFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdwYXRjaCcpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBmb3IgZWRpdCB0b29scyB3aG9zZSBnZW5lcmljIGRpc3BsYXkgbmFtZSBzaG91bGQgYmUgcmVwbGFjZWRcbiAqIHdpdGggXCJFZGl0aW5nIGZpbGVzXCIgd2hpbGUgc3RyZWFtaW5nIChlLmcuIHJlcGxhY2UsIG11bHRpLXJlcGxhY2UsIHBhdGNoLCBpbnNlcnRFZGl0KS5cbiAqIEV4Y2x1ZGVzIGNyZWF0ZSBhbmQgbm90ZWJvb2sgdG9vbHMgd2hpY2ggYWxyZWFkeSBoYXZlIGdvb2QgbGFiZWxzLlxuICovXG5mdW5jdGlvbiBpc0dlbmVyaWNFZGl0VG9vbElkKHRvb2xJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IGxvd2VyVG9vbElkID0gdG9vbElkLnRvTG93ZXJDYXNlKCk7XG5cdGlmIChsb3dlclRvb2xJZC5pbmNsdWRlcygnY3JlYXRlJykgfHwgbG93ZXJUb29sSWQuaW5jbHVkZXMoJ25vdGVib29rJykpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIGxvd2VyVG9vbElkLmluY2x1ZGVzKCdyZXBsYWNlJykgfHxcblx0XHRsb3dlclRvb2xJZC5pbmNsdWRlcygncGF0Y2gnKSB8fFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdpbnNlcnRlZGl0JykgfHxcblx0XHRsb3dlclRvb2xJZC5pbmNsdWRlcygnaW5zZXJ0X2VkaXQnKSB8fFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdlZGl0ZmlsZScpO1xufVxuXG5mdW5jdGlvbiBpc1Byb2JsZW1zVG9vbElkKHRvb2xJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHN3aXRjaCAodG9vbElkPy50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0Y2FzZSAncHJvYmxlbXMnOlxuXHRcdGNhc2UgJ2dldF9lcnJvcnMnOlxuXHRcdGNhc2UgJ2NvcGlsb3RfZ2V0ZXJyb3JzJzpcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNOb1Byb2JsZW1zRm91bmRSZXN1bHQodG9vbElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlc3VsdFRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNQcm9ibGVtc1Rvb2xJZCh0b29sSWQpICYmIHJlc3VsdFRleHQ/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ25vIHByb2JsZW1zIGZvdW5kJykgPT09IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUb29sSW52b2NhdGlvbkljb24odG9vbElkOiBzdHJpbmcsIHJlZ2lzdGVyZWRJY29uPzogVGhlbWVJY29uLCByZXN1bHRUZXh0Pzogc3RyaW5nKTogVGhlbWVJY29uIHtcblx0aWYgKGlzTm9Qcm9ibGVtc0ZvdW5kUmVzdWx0KHRvb2xJZCwgcmVzdWx0VGV4dCkpIHtcblx0XHRyZXR1cm4gQ29kaWNvbi5zZWFyY2g7XG5cdH1cblxuXHRpZiAocmVnaXN0ZXJlZEljb24pIHtcblx0XHRyZXR1cm4gcmVnaXN0ZXJlZEljb247XG5cdH1cblxuXHRjb25zdCBsb3dlclRvb2xJZCA9IHRvb2xJZC50b0xvd2VyQ2FzZSgpO1xuXG5cdGlmIChsb3dlclRvb2xJZC5pbmNsdWRlcygnY29tbWVudCcpKSB7XG5cdFx0cmV0dXJuIENvZGljb24uY29tbWVudDtcblx0fVxuXG5cdGlmIChcblx0XHRsb3dlclRvb2xJZC5pbmNsdWRlcygnc2VhcmNoJykgfHxcblx0XHRsb3dlclRvb2xJZC5pbmNsdWRlcygnZ3JlcCcpIHx8XG5cdFx0bG93ZXJUb29sSWQuaW5jbHVkZXMoJ2ZpbmQnKSB8fFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdsaXN0JykgfHxcblx0XHRsb3dlclRvb2xJZC5pbmNsdWRlcygnc2VtYW50aWMnKSB8fFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdjaGFuZ2VzJykgfHxcblx0XHRsb3dlclRvb2xJZC5pbmNsdWRlcygnY29kZWJhc2UnKSB8fFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdjaGVja2VkJylcblx0KSB7XG5cdFx0cmV0dXJuIENvZGljb24uc2VhcmNoO1xuXHR9XG5cblx0aWYgKFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdyZWFkJykgfHxcblx0XHRsb3dlclRvb2xJZC5pbmNsdWRlcygnZ2V0X2ZpbGUnKSB8fFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdwcm9ibGVtcycpXG5cdCkge1xuXHRcdHJldHVybiBDb2RpY29uLmJvb2s7XG5cdH1cblxuXHRpZiAoaXNFZGl0VG9vbElkKHRvb2xJZCkpIHtcblx0XHRyZXR1cm4gQ29kaWNvbi5wZW5jaWw7XG5cdH1cblxuXHRpZiAoXG5cdFx0bG93ZXJUb29sSWQuaW5jbHVkZXMoJ3Rlcm1pbmFsJylcblx0KSB7XG5cdFx0cmV0dXJuIENvZGljb24udGVybWluYWw7XG5cdH1cblxuXHQvLyBkZWZhdWx0IHRvIGdlbmVyaWMgdG9vbCBpY29uXG5cdHJldHVybiBDb2RpY29uLnRvb2xzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGhpbmtpbmdJY29uKGljb246IFRoZW1lSWNvbik6IEhUTUxFbGVtZW50IHtcblx0Y29uc3QgaWNvbkVsZW1lbnQgPSAkKCdzcGFuLmNoYXQtdGhpbmtpbmctaWNvbicpO1xuXHRpY29uRWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGljb24pKTtcblx0cmV0dXJuIGljb25FbGVtZW50O1xufVxuXG5mdW5jdGlvbiBzZXRUaGlua2luZ0ljb24oaWNvbkVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpY29uOiBUaGVtZUljb24pOiB2b2lkIHtcblx0aWNvbkVsZW1lbnQuY2xhc3NOYW1lID0gJ2NoYXQtdGhpbmtpbmctaWNvbic7XG5cdGljb25FbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoaWNvbikpO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0VGl0bGVGcm9tVGhpbmtpbmdDb250ZW50KGNvbnRlbnQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGhlYWRlck1hdGNoID0gY29udGVudC5tYXRjaCgvXlxcKlxcKihbXipdKylcXCpcXCovKTtcblx0cmV0dXJuIGhlYWRlck1hdGNoID8gaGVhZGVyTWF0Y2hbMV0gOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogTWV0YWRhdGEgcGFzc2VkIHRvIHtAbGluayBDaGF0VGhpbmtpbmdDb250ZW50UGFydC5hcHBlbmRJdGVtfSB0byBkcml2ZVxuICogdGl0bGUgLyBpY29uIGV4dHJhY3Rpb24uIFRoZSBga2luZGAgZGlzY3JpbWluYXRlcyB3aGljaCBwYXlsb2FkIGlzXG4gKiBhdmFpbGFibGU7IHRoZSB0aGlua2luZyBwYXJ0IGluc3BlY3RzIGl0IHRvIGNvbXB1dGUgYSBsYWJlbCBsaWtlXG4gKiBcIkVkaXRlZCBmb28udHNcIiB3aXRob3V0IHJlbmRlcmluZyB0aGUgYWN0dWFsIGNvbnRlbnQgaXRzZWxmICh0aGVcbiAqIGZhY3RvcnkgcHJvdmlkZXMgdGhlIERPTSkuXG4gKi9cbmV4cG9ydCB0eXBlIENoYXRUaGlua2luZ0l0ZW1NZXRhZGF0YSA9XG5cdHwgSUNoYXRUb29sSW52b2NhdGlvblxuXHR8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkXG5cdHwgSUNoYXRNYXJrZG93bkNvbnRlbnRcblx0fCBJQ2hhdEV4dGVybmFsRWRpdDtcblxuaW50ZXJmYWNlIElMYXp5VG9vbEl0ZW0ge1xuXHRraW5kOiAndG9vbCc7XG5cdGxhenk6IExhenk8eyBkb21Ob2RlOiBIVE1MRWxlbWVudDsgZGlzcG9zYWJsZT86IElEaXNwb3NhYmxlIH0+O1xuXHR0b29sSW52b2NhdGlvbklkPzogc3RyaW5nO1xuXHR0b29sSW52b2NhdGlvbk9yTWFya2Rvd24/OiBDaGF0VGhpbmtpbmdJdGVtTWV0YWRhdGE7XG5cdG9yaWdpbmFsUGFyZW50PzogSFRNTEVsZW1lbnQ7XG5cdGlzSG9vaz86IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJTGF6eVRoaW5raW5nSXRlbSB7XG5cdGtpbmQ6ICd0aGlua2luZyc7XG5cdHRleHRDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRjb250ZW50OiBJQ2hhdFRoaW5raW5nUGFydDtcbn1cblxudHlwZSBJTGF6eUl0ZW0gPSBJTGF6eVRvb2xJdGVtIHwgSUxhenlUaGlua2luZ0l0ZW07XG5jb25zdCBUSElOS0lOR19TQ1JPTExfTUFYX0hFSUdIVCA9IDIwMDtcblxuY29uc3QgVElUTEVfQ0FDSEVfU1RPUkFHRV9LRVkgPSAnY2hhdC50aGlua2luZ1RpdGxlQ2FjaGUnO1xuY29uc3QgVElUTEVfQ0FDSEVfVFRMX01TID0gNyAqIDI0ICogNjAgKiA2MCAqIDEwMDA7IC8vIDcgZGF5c1xuY29uc3QgVElUTEVfQ0FDSEVfTUFYX0VOVFJJRVMgPSAxMDAwO1xuXG5jb25zdCBlbnVtIFdvcmtpbmdNZXNzYWdlQ2F0ZWdvcnkge1xuXHRUaGlua2luZyA9ICd0aGlua2luZycsXG5cdFRlcm1pbmFsID0gJ3Rlcm1pbmFsJyxcblx0VG9vbCA9ICd0b29sJ1xufVxuXG5leHBvcnQgY29uc3QgZGVmYXVsdFRoaW5raW5nTWVzc2FnZXMgPSBbXG5cdGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLnRoaW5raW5nLjEnLCAnVGhpbmtpbmcnKSxcblx0bG9jYWxpemUoJ2NoYXQudGhpbmtpbmcudGhpbmtpbmcuMicsICdSZWFzb25pbmcnKSxcblx0bG9jYWxpemUoJ2NoYXQudGhpbmtpbmcudGhpbmtpbmcuMycsICdDb25zaWRlcmluZycpLFxuXHRsb2NhbGl6ZSgnY2hhdC50aGlua2luZy50aGlua2luZy40JywgJ0FuYWx5emluZycpLFxuXHRsb2NhbGl6ZSgnY2hhdC50aGlua2luZy50aGlua2luZy41JywgJ0V2YWx1YXRpbmcnKSxcblx0bG9jYWxpemUoJ2NoYXQudGhpbmtpbmcudGhpbmtpbmcuNicsICdXb3JraW5nJyksXG5dO1xuXG5jb25zdCB0ZXJtaW5hbE1lc3NhZ2VzID0gW1xuXHRsb2NhbGl6ZSgnY2hhdC50aGlua2luZy50ZXJtaW5hbC4xJywgJ0V4ZWN1dGluZycpLFxuXHRsb2NhbGl6ZSgnY2hhdC50aGlua2luZy50ZXJtaW5hbC4yJywgJ1J1bm5pbmcnKSxcblx0bG9jYWxpemUoJ2NoYXQudGhpbmtpbmcudGVybWluYWwuMycsICdQcm9jZXNzaW5nJyksXG5dO1xuXG5jb25zdCB0b29sTWVzc2FnZXMgPSBbXG5cdGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLnRvb2wuMScsICdQcm9jZXNzaW5nJyksXG5cdGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLnRvb2wuMicsICdQcmVwYXJpbmcnKSxcblx0bG9jYWxpemUoJ2NoYXQudGhpbmtpbmcudG9vbC4zJywgJ0xvYWRpbmcnKSxcblx0bG9jYWxpemUoJ2NoYXQudGhpbmtpbmcudG9vbC40JywgJ0FuYWx5emluZycpLFxuXHRsb2NhbGl6ZSgnY2hhdC50aGlua2luZy50b29sLjUnLCAnRXZhbHVhdGluZycpLFxuXTtcblxuLyoqIEVhc3Rlci1lZ2cgbG9hZGluZyBtZXNzYWdlcywgdXNlZCB+MSBpbiB7QGxpbmsgRlVOX1dPUktJTkdfTUVTU0FHRV9SQVRFfSBwaWNrcy4gKi9cbmNvbnN0IGZ1bldvcmtpbmdNZXNzYWdlcyA9IFtcblx0Ly8gR2VuZXJpY1xuXHRsb2NhbGl6ZSgnY2hhdC53b3JraW5nLmZ1bi4xJywgXCJCcmliaW5nIHRoZSBoYW1zdGVyXCIpLFxuXHRsb2NhbGl6ZSgnY2hhdC53b3JraW5nLmZ1bi4yJywgXCJSZXRpY3VsYXRpbmcgc3BsaW5lc1wiKSxcblx0bG9jYWxpemUoJ2NoYXQud29ya2luZy5mdW4uMycsIFwiVW50YW5nbGluZyB0aGUgc3BhZ2hldHRpXCIpLFxuXHRsb2NhbGl6ZSgnY2hhdC53b3JraW5nLmZ1bi40JywgXCJDb21tdW5pbmcgd2l0aCB0aGUgY29kZWJhc2VcIiksXG5cblx0Ly8gTWluZWNyYWZ0XG5cdGxvY2FsaXplKCdjaGF0LndvcmtpbmcuZnVuLm1pbmVjcmFmdC4xJywgXCJNaW5pbmcgZGlhbW9uZHNcIiksXG5cblx0Ly8gTWljcm9zb2Z0XG5cdGxvY2FsaXplKCdjaGF0LndvcmtpbmcuZnVuLm1zLjEnLCBcIlN1bW1vbmluZyBDbGlwcHlcIiksXG5dO1xuXG5jb25zdCBGVU5fV09SS0lOR19NRVNTQUdFX1JBVEUgPSA1MDtcblxudHlwZSBUaGlua2luZ1BocmFzZXNDb25maWd1cmF0aW9uID0geyBtb2RlPzogJ3JlcGxhY2UnIHwgJ2FwcGVuZCc7IHBocmFzZXM/OiBzdHJpbmdbXSB9O1xuXG5mdW5jdGlvbiBnZXRDdXN0b21UaGlua2luZ1BocmFzZXMoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IHsgY3VzdG9tUGhyYXNlczogc3RyaW5nW107IHJlcGxhY2VEZWZhdWx0czogYm9vbGVhbiB9IHtcblx0Y29uc3QgY29uZmlnID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8VGhpbmtpbmdQaHJhc2VzQ29uZmlndXJhdGlvbj4oQ2hhdENvbmZpZ3VyYXRpb24uVGhpbmtpbmdQaHJhc2VzKTtcblx0Y29uc3QgY3VzdG9tUGhyYXNlcyA9IEFycmF5LmlzQXJyYXkoY29uZmlnPy5waHJhc2VzKVxuXHRcdD8gY29uZmlnLnBocmFzZXNcblx0XHRcdC5maWx0ZXIoKHBocmFzZSk6IHBocmFzZSBpcyBzdHJpbmcgPT4gdHlwZW9mIHBocmFzZSA9PT0gJ3N0cmluZycpXG5cdFx0XHQubWFwKHBocmFzZSA9PiBwaHJhc2UudHJpbSgpKVxuXHRcdFx0LmZpbHRlcihwaHJhc2UgPT4gcGhyYXNlLmxlbmd0aCA+IDApXG5cdFx0OiBbXTtcblxuXHRyZXR1cm4ge1xuXHRcdGN1c3RvbVBocmFzZXMsXG5cdFx0cmVwbGFjZURlZmF1bHRzOiBjb25maWc/Lm1vZGUgPT09ICdyZXBsYWNlJyAmJiBjdXN0b21QaHJhc2VzLmxlbmd0aCA+IDAsXG5cdH07XG59XG5cbi8qKiBSZXR1cm5zIGFuIGVhc3Rlci1lZ2cgbWVzc2FnZSB+MSBpbiB7QGxpbmsgRlVOX1dPUktJTkdfTUVTU0FHRV9SQVRFfSwgZWxzZSBgdW5kZWZpbmVkYC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVBpY2tGdW5Xb3JraW5nTWVzc2FnZShjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCByYW5kb20gPSBNYXRoLnJhbmRvbSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmIChnZXRDdXN0b21UaGlua2luZ1BocmFzZXMoY29uZmlndXJhdGlvblNlcnZpY2UpLnJlcGxhY2VEZWZhdWx0cykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRpZiAoTWF0aC5mbG9vcihyYW5kb20oKSAqIEZVTl9XT1JLSU5HX01FU1NBR0VfUkFURSkgPT09IDApIHtcblx0XHRyZXR1cm4gZnVuV29ya2luZ01lc3NhZ2VzW01hdGguZmxvb3IocmFuZG9tKCkgKiBmdW5Xb3JraW5nTWVzc2FnZXMubGVuZ3RoKV07XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBCdWlsZHMgYSBwaHJhc2UgcG9vbCBmcm9tIGRlZmF1bHRzIGFuZCB1c2VyLWNvbmZpZ3VyZWQgY3VzdG9tIHBocmFzZXMuXG4gKiBJbiAncmVwbGFjZScgbW9kZSwgb25seSBjdXN0b20gcGhyYXNlcyBhcmUgdXNlZDsgaW4gJ2FwcGVuZCcgbW9kZSAoZGVmYXVsdCksXG4gKiBjdXN0b20gcGhyYXNlcyBhcmUgYWRkZWQgdG8gdGhlIGRlZmF1bHRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRQaHJhc2VQb29sKGRlZmF1bHRzOiBzdHJpbmdbXSwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IHN0cmluZ1tdIHtcblx0Y29uc3QgeyBjdXN0b21QaHJhc2VzLCByZXBsYWNlRGVmYXVsdHMgfSA9IGdldEN1c3RvbVRoaW5raW5nUGhyYXNlcyhjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0aWYgKGN1c3RvbVBocmFzZXMubGVuZ3RoID4gMCkge1xuXHRcdHJldHVybiByZXBsYWNlRGVmYXVsdHMgPyBbLi4uY3VzdG9tUGhyYXNlc10gOiBbLi4uZGVmYXVsdHMsIC4uLmN1c3RvbVBocmFzZXNdO1xuXHR9XG5cdHJldHVybiBbLi4uZGVmYXVsdHNdO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFRoaW5raW5nQ29udGVudFBhcnQgZXh0ZW5kcyBDaGF0Q29sbGFwc2libGVDb250ZW50UGFydCBpbXBsZW1lbnRzIElDaGF0Q29udGVudFBhcnQge1xuXG5cdHByaXZhdGUgc3RhdGljIF9jb2RlQmxvY2tSZW5kZXJlclN5bmMoX2xhbmd1YWdlSWQ6IHN0cmluZywgdGV4dDogc3RyaW5nLCBfcmF3Pzogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGNvZGVFbGVtZW50ID0gJCgnY29kZScpO1xuXHRcdGNvZGVFbGVtZW50LnRleHRDb250ZW50ID0gdGV4dDtcblx0XHRyZXR1cm4gY29kZUVsZW1lbnQ7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgY29kZWJsb2NrczogdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgY29kZWJsb2Nrc1BhcnRJZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FzeW5jUmVuZGVyQ2FsbGJhY2sgPSAoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cblx0cHJpdmF0ZSBpZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbnRlbnQ6IElDaGF0VGhpbmtpbmdQYXJ0O1xuXHRwcml2YXRlIGN1cnJlbnRUaGlua2luZ1ZhbHVlOiBzdHJpbmc7XG5cdHByaXZhdGUgY3VycmVudFRpdGxlOiBzdHJpbmc7XG5cdHByaXZhdGUgZGVmYXVsdFRpdGxlID0gbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuaGVhZGVyJywgJ1RoaW5raW5nJyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ1RpdGxlID0gbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuaGVhZGVyLndvcmtpbmcnLCAnV29ya2luZycpO1xuXHRwcml2YXRlIHRleHRDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbWFya2Rvd25SZXN1bHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVJlbmRlcmVkTWFya2Rvd24+KCkpO1xuXHRwcml2YXRlIHdyYXBwZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBmaXhlZFNjcm9sbGluZ01vZGU6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSB0aGlua2luZ0Rpc3BsYXlNb2RlOiBUaGlua2luZ0Rpc3BsYXlNb2RlO1xuXHRwcml2YXRlIGF1dG9TY3JvbGxFbmFibGVkOiBib29sZWFuID0gdHJ1ZTtcblx0cHJpdmF0ZSBzY3JvbGxhYmxlRWxlbWVudDogRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbGFzdEV4dHJhY3RlZFRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZXh0cmFjdGVkVGl0bGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIHRvb2xJbnZvY2F0aW9uQ291bnQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgYXBwZW5kZWRJdGVtQ291bnQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgaXNBY3RpdmU6IGJvb2xlYW4gPSB0cnVlO1xuXHRwcml2YXRlIHRvb2xJbnZvY2F0aW9uczogKElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZClbXSA9IFtdO1xuXHRwcml2YXRlIGFsbFRoaW5raW5nUGFydHM6IElDaGF0VGhpbmtpbmdQYXJ0W10gPSBbXTtcblx0cHJpdmF0ZSBob29rQ291bnQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgc2luZ2xlSXRlbUluZm86IHsgZWxlbWVudDogSFRNTEVsZW1lbnQ7IHRoaW5raW5nV3JhcHBlcjogSFRNTEVsZW1lbnQ7IG9yaWdpbmFsUGFyZW50OiBIVE1MRWxlbWVudDsgb3JpZ2luYWxOZXh0U2libGluZzogTm9kZSB8IG51bGw7IHJlc3RvcmVUb09yaWdpbmFsUGFyZW50OiBib29sZWFuOyB0b29sSW52b2NhdGlvbj86IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGxhenlJdGVtczogSUxhenlJdGVtW10gPSBbXTtcblx0cHJpdmF0ZSBoYXNFeHBhbmRlZE9uY2U6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSB3b3JraW5nU3Bpbm5lckVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHdvcmtpbmdTcGlubmVyTGFiZWw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGF2YWlsYWJsZU1lc3NhZ2VzQnlDYXRlZ29yeSA9IG5ldyBNYXA8V29ya2luZ01lc3NhZ2VDYXRlZ29yeSwgc3RyaW5nW10+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9vbFdyYXBwZXJzQnlDYWxsSWQgPSBuZXcgTWFwPHN0cmluZywgSFRNTEVsZW1lbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9vbEljb25zQnlDYWxsSWQgPSBuZXcgTWFwPHN0cmluZywgSFRNTEVsZW1lbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9vbExhYmVsc0J5Q2FsbElkID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB0b29sRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb3duZWRUb29sUGFydHMgPSBuZXcgTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCk7XG5cdHByaXZhdGUgcGVuZGluZ1JlbW92YWxzOiB7IHRvb2xDYWxsSWQ6IHN0cmluZzsgdG9vbExhYmVsOiBzdHJpbmcgfVtdID0gW107XG5cdHByaXZhdGUgcGVuZGluZ1JlbW92YWxGbHVzaERpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHBlbmRpbmdTY3JvbGxEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB3cmFwcGVyUmVzaXplT2JzZXJ2ZXJEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjaGlsZFJlc2l6ZU9ic2VydmVyOiBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaXNVcGRhdGluZ0RpbWVuc2lvbnM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBsYXN0S25vd25Db250ZW50SGVpZ2h0OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIGxhc3RLbm93blNjcm9sbFRvcDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSB0aXRsZVNoaW1tZXJTcGFuOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0aXRsZURldGFpbENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29sbGFwc2VkVGl0bGVCZWZvcmVFeHBhbnNpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZXJuYWxSZXNvdXJjZVdpZGdldDogQ2hhdFRoaW5raW5nRXh0ZXJuYWxSZXNvdXJjZVdpZGdldDtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0V4dGVybmFsUmVzb3VyY2VzID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVEZXRhaWxSZW5kZXJlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJUmVuZGVyZWRNYXJrZG93bj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdBcHBlbmRSZWZyZXNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBkaWZmU3RhdHNCeVBhcnRJZCA9IG5ldyBNYXA8c3RyaW5nLCBJRWRpdFNlc3Npb25EaWZmU3RhdHM+KCk7XG5cdHByaXZhdGUgX2FnZ3JlZ2F0ZWREaWZmOiBJRWRpdFNlc3Npb25EaWZmU3RhdHMgPSB7IGFkZGVkOiAwLCByZW1vdmVkOiAwIH07XG5cdHByaXZhdGUgY29udGFpbnNSZWFzb25pbmc6IGJvb2xlYW47XG5cdHByaXZhdGUgY29udGFpbnNHcm91cGVkSXRlbXM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFzb25pbmdEdXJhdGlvbk1zOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0Z2V0IGFnZ3JlZ2F0ZWREaWZmKCk6IElFZGl0U2Vzc2lvbkRpZmZTdGF0cyB7IHJldHVybiB0aGlzLl9hZ2dyZWdhdGVkRGlmZjsgfVxuXG5cdHByaXZhdGUgZ2V0UmFuZG9tV29ya2luZ01lc3NhZ2UoY2F0ZWdvcnk6IFdvcmtpbmdNZXNzYWdlQ2F0ZWdvcnkgPSBXb3JraW5nTWVzc2FnZUNhdGVnb3J5LlRvb2wpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGZ1biA9IG1heWJlUGlja0Z1bldvcmtpbmdNZXNzYWdlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChmdW4pIHtcblx0XHRcdHJldHVybiBmdW47XG5cdFx0fVxuXG5cdFx0bGV0IHBvb2wgPSB0aGlzLmF2YWlsYWJsZU1lc3NhZ2VzQnlDYXRlZ29yeS5nZXQoY2F0ZWdvcnkpO1xuXHRcdGlmICghcG9vbCB8fCBwb29sLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0bGV0IGRlZmF1bHRzOiBzdHJpbmdbXTtcblx0XHRcdHN3aXRjaCAoY2F0ZWdvcnkpIHtcblx0XHRcdFx0Y2FzZSBXb3JraW5nTWVzc2FnZUNhdGVnb3J5LlRoaW5raW5nOlxuXHRcdFx0XHRcdGRlZmF1bHRzID0gZGVmYXVsdFRoaW5raW5nTWVzc2FnZXM7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgV29ya2luZ01lc3NhZ2VDYXRlZ29yeS5UZXJtaW5hbDpcblx0XHRcdFx0XHRkZWZhdWx0cyA9IHRlcm1pbmFsTWVzc2FnZXM7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgV29ya2luZ01lc3NhZ2VDYXRlZ29yeS5Ub29sOlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGRlZmF1bHRzID0gdG9vbE1lc3NhZ2VzO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRwb29sID0gYnVpbGRQaHJhc2VQb29sKGRlZmF1bHRzLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdFx0dGhpcy5hdmFpbGFibGVNZXNzYWdlc0J5Q2F0ZWdvcnkuc2V0KGNhdGVnb3J5LCBwb29sKTtcblx0XHR9XG5cdFx0Y29uc3QgaW5kZXggPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBwb29sLmxlbmd0aCk7XG5cdFx0cmV0dXJuIHBvb2wuc3BsaWNlKGluZGV4LCAxKVswXTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRlbnQ6IElDaGF0VGhpbmtpbmdQYXJ0LFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcixcblx0XHRwcml2YXRlIHN0cmVhbWluZ0NvbXBsZXRlZDogYm9vbGVhbixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlOiBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBpbml0aWFsVGV4dCA9IGV4dHJhY3RUZXh0RnJvbVBhcnQoY29udGVudCk7XG5cdFx0Y29uc3QgY29udGFpbnNSZWFzb25pbmcgPSBpbml0aWFsVGV4dC50cmltKCkubGVuZ3RoID4gMDtcblx0XHRjb25zdCBleHRyYWN0ZWRUaXRsZSA9IGV4dHJhY3RUaXRsZUZyb21UaGlua2luZ0NvbnRlbnQoaW5pdGlhbFRleHQpXG5cdFx0XHQ/PyBsb2NhbGl6ZSgnY2hhdC50aGlua2luZy5oZWFkZXIuaW5pdGlhbCcsICdUaGlua2luZycpO1xuXG5cdFx0c3VwZXIoZXh0cmFjdGVkVGl0bGUsIGNvbnRleHQsIHVuZGVmaW5lZCwgaG92ZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLmNvbnRhaW5zUmVhc29uaW5nID0gY29udGFpbnNSZWFzb25pbmc7XG5cdFx0dGhpcy5yZWFzb25pbmdEdXJhdGlvbk1zID0gY29udGVudC5yZWFzb25pbmdEdXJhdGlvbk1zO1xuXHRcdHRoaXMuaWQgPSBjb250ZW50LmlkO1xuXHRcdHRoaXMuY29udGVudCA9IGNvbnRlbnQ7XG5cdFx0dGhpcy5hbGxUaGlua2luZ1BhcnRzLnB1c2goY29udGVudCk7XG5cdFx0Y29uc3QgY29uZmlndXJlZE1vZGUgPSBnZXRFZmZlY3RpdmVUaGlua2luZ0Rpc3BsYXlNb2RlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnRoaW5raW5nRGlzcGxheU1vZGUgPSBjb25maWd1cmVkTW9kZTtcblxuXHRcdHRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlID0gY29uZmlndXJlZE1vZGUgPT09IFRoaW5raW5nRGlzcGxheU1vZGUuRml4ZWRTY3JvbGxpbmc7XG5cblx0XHR0aGlzLmN1cnJlbnRUaXRsZSA9IGV4dHJhY3RlZFRpdGxlO1xuXHRcdGlmIChleHRyYWN0ZWRUaXRsZSAhPT0gdGhpcy5kZWZhdWx0VGl0bGUpIHtcblx0XHRcdHRoaXMubGFzdEV4dHJhY3RlZFRpdGxlID0gZXh0cmFjdGVkVGl0bGU7XG5cdFx0XHR0aGlzLmV4dHJhY3RlZFRpdGxlcy5wdXNoKGV4dHJhY3RlZFRpdGxlKTtcblx0XHR9XG5cdFx0dGhpcy5jdXJyZW50VGhpbmtpbmdWYWx1ZSA9IGluaXRpYWxUZXh0O1xuXG5cdFx0aWYgKGluaXRpYWxUZXh0LnRyaW0oKSkge1xuXHRcdFx0dGhpcy5hcHBlbmRlZEl0ZW1Db3VudCsrO1xuXHRcdH1cblxuXHRcdC8vIEFsZXJ0IHNjcmVlbiByZWFkZXIgdXNlcnMgdGhhdCB0aGlua2luZyBoYXMgc3RhcnRlZFxuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEFjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQuVmVyYm9zZUNoYXRQcm9ncmVzc1VwZGF0ZXMpKSB7XG5cdFx0XHRhbGVydChsb2NhbGl6ZSgnY2hhdC50aGlua2luZy5zdGFydGVkJywgJ1RoaW5raW5nJykpO1xuXHRcdH1cblxuXHRcdGlmIChjb25maWd1cmVkTW9kZSA9PT0gVGhpbmtpbmdEaXNwbGF5TW9kZS5Db2xsYXBzZWQpIHtcblx0XHRcdHRoaXMuc2V0RXhwYW5kZWQoZmFsc2UpO1xuXHRcdH0gZWxzZSBpZiAoY29uZmlndXJlZE1vZGUgPT09IFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkUHJldmlldykge1xuXHRcdFx0Ly8gU3RhcnQgZXhwYW5kZWQgaWYgc3RpbGwgaW4gcHJvZ3Jlc3MuXG5cdFx0XHQvLyBzdHJlYW1pbmdDb21wbGV0ZWQgaXMgdHJ1ZSB3aGVuIGxvb2stYWhlYWQgZmluZHMgc3Vic2VxdWVudCBub24tcGlubmFibGVcblx0XHRcdC8vIHBhcnRzLCBtZWFuaW5nIHRoaXMgdGhpbmtpbmcgcGFydCB3b24ndCByZWNlaXZlIG1vcmUgY29udGVudC5cblx0XHRcdHRoaXMuc2V0RXhwYW5kZWQoIXRoaXMuc3RyZWFtaW5nQ29tcGxldGVkICYmICF0aGlzLmVsZW1lbnQuaXNDb21wbGV0ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2V0RXhwYW5kZWQoZmFsc2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLmRvbU5vZGU7XG5cdFx0bm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LXRoaW5raW5nLWJveCcpO1xuXG5cdFx0dGhpcy5fZXh0ZXJuYWxSZXNvdXJjZVdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFRoaW5raW5nRXh0ZXJuYWxSZXNvdXJjZVdpZGdldCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2V4dGVybmFsUmVzb3VyY2VXaWRnZXQub25EaWRDaGFuZ2VIZWlnaHQoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpKSk7XG5cdFx0bm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9leHRlcm5hbFJlc291cmNlV2lkZ2V0LmRvbU5vZGUpO1xuXG5cdFx0aWYgKCF0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCAmJiAhdGhpcy5lbGVtZW50LmlzQ29tcGxldGUpIHtcblx0XHRcdGlmICghdGhpcy5maXhlZFNjcm9sbGluZ01vZGUpIHtcblx0XHRcdFx0bm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LXRoaW5raW5nLWFjdGl2ZScpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5maXhlZFNjcm9sbGluZ01vZGUgJiYgIXRoaXMuc3RyZWFtaW5nQ29tcGxldGVkICYmICF0aGlzLmVsZW1lbnQuaXNDb21wbGV0ZSAmJiB0aGlzLl9jb2xsYXBzZUJ1dHRvbikge1xuXHRcdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gdGhpcy5fY29sbGFwc2VCdXR0b24ubGFiZWxFbGVtZW50O1xuXHRcdFx0bGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0aGlzLnRpdGxlU2hpbW1lclNwYW4gPSAkKCdzcGFuLmNoYXQtdGhpbmtpbmctdGl0bGUtc2hpbW1lcicpO1xuXHRcdFx0dGhpcy50aXRsZVNoaW1tZXJTcGFuLnRleHRDb250ZW50ID0gZXh0cmFjdGVkVGl0bGU7XG5cdFx0XHRsYWJlbEVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVNoaW1tZXJTcGFuKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5maXhlZFNjcm9sbGluZ01vZGUpIHtcblx0XHRcdG5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC10aGlua2luZy1maXhlZC1tb2RlJyk7XG5cdFx0XHR0aGlzLmN1cnJlbnRUaXRsZSA9IHRoaXMuZGVmYXVsdFRpdGxlO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGQgb2YgdGhpcy5vd25lZFRvb2xQYXJ0cy52YWx1ZXMoKSkge1xuXHRcdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMub3duZWRUb29sUGFydHMuY2xlYXIoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBvdmVycmlkZSBmb3IgY29kaWNvbiBjaGV2cm9uIGluIHRoZSBjb2xsYXBzaWJsZSBwYXJ0XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IGlzRXhwYW5kZWQgPSB0aGlzLmV4cGFuZGVkLnJlYWQocik7XG5cdFx0XHRpZiAodGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdFx0aWYgKHRoaXMuc3RyZWFtaW5nQ29tcGxldGVkIHx8IHRoaXMuZWxlbWVudC5pc0NvbXBsZXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29sbGFwc2VCdXR0b24uaWNvbiA9IENvZGljb24uY2hlY2s7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIXRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlKSB7XG5cdFx0XHRcdFx0aWYgKGlzRXhwYW5kZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmljb24gPSBDb2RpY29uLmNoZXZyb25Eb3duO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5pY29uID0gQ29kaWNvbi5jaXJjbGVGaWxsZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IGlzRXhwYW5kZWQgPSB0aGlzLl9pc0V4cGFuZGVkLnJlYWQocik7XG5cdFx0XHQvLyBNYXRlcmlhbGl6ZSBsYXp5IGl0ZW1zIHdoZW4gZmlyc3QgZXhwYW5kZWRcblx0XHRcdGlmIChpc0V4cGFuZGVkICYmICF0aGlzLmhhc0V4cGFuZGVkT25jZSAmJiB0aGlzLmxhenlJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuaGFzRXhwYW5kZWRPbmNlID0gdHJ1ZTtcblx0XHRcdFx0Ly8gRmx1c2ggcGVuZGluZyByZW1vdmFscyBzbyB0aGF0IGNvbXBsZXRlZCBoaWRkZW4gdG9vbHMgYXJlIHJlbW92ZWQgZnJvbSBsYXp5SXRlbXMgYmVmb3JlIG1hdGVyaWFsaXphdGlvblxuXHRcdFx0XHR0aGlzLnByb2Nlc3NQZW5kaW5nUmVtb3ZhbHMoKTtcblx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMubGF6eUl0ZW1zKSB7XG5cdFx0XHRcdFx0dGhpcy5tYXRlcmlhbGl6ZUxhenlJdGVtKGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIGV4cGFuZGVkIGJ1dCBjb250ZW50IG1hdGNoZXMgdGl0bGUgYW5kIHRoZXJlJ3Mgbm90aGluZyBlbHNlIHRvIHNob3csIHJldmVydCBpbW1lZGlhdGVseS5cblx0XHRcdC8vIFNraXAgdGhpcyBjaGVjayB3aGlsZSBzdGlsbCBzdHJlYW1pbmcgXHUyMDE0IG1vcmUgY29udGVudCB3aWxsIGFycml2ZS5cblx0XHRcdGlmIChpc0V4cGFuZGVkICYmICF0aGlzLnNob3VsZEFsbG93RXhwYW5zaW9uKCkgJiYgKHRoaXMuc3RyZWFtaW5nQ29tcGxldGVkIHx8IHRoaXMuZWxlbWVudC5pc0NvbXBsZXRlKSkge1xuXHRcdFx0XHR0aGlzLnNldEV4cGFuZGVkKGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9leHRlcm5hbFJlc291cmNlV2lkZ2V0LnNldENvbGxhcHNlZCghaXNFeHBhbmRlZCk7XG5cblx0XHRcdC8vIEZpcmUgd2hlbiBleHBhbmRlZC9jb2xsYXBzZWRcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBsYWJlbCA9IHRoaXMubGFzdEV4dHJhY3RlZFRpdGxlID8/ICcnO1xuXHRcdGlmICghdGhpcy5maXhlZFNjcm9sbGluZ01vZGUgJiYgIXRoaXMuX2lzRXhwYW5kZWQuZ2V0KCkpIHtcblx0XHRcdHRoaXMuc2V0VGl0bGUobGFiZWwpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jb2xsYXBzZUJ1dHRvbikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29sbGFwc2VCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmZpeGVkU2Nyb2xsaW5nTW9kZSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtdGhpbmtpbmctZml4ZWQtbW9kZS1hbmltYXRlZCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBleHBhbmRlZCA9IHRoaXMuaXNFeHBhbmRlZCgpO1xuXHRcdFx0XHRpZiAoZXhwYW5kZWQpIHtcblx0XHRcdFx0XHQvLyBKdXN0IGV4cGFuZGVkOiBzaG93IHBsYWluICdXb3JraW5nJyB3aXRoIG5vIGRldGFpbFxuXHRcdFx0XHRcdHRoaXMuY29sbGFwc2VkVGl0bGVCZWZvcmVFeHBhbnNpb24gPSB0aGlzLmxhc3RFeHRyYWN0ZWRUaXRsZTtcblx0XHRcdFx0XHR0aGlzLnNldFRpdGxlKHRoaXMuZGVmYXVsdFRpdGxlLCB0cnVlKTtcblx0XHRcdFx0XHR0aGlzLmN1cnJlbnRUaXRsZSA9IHRoaXMuZGVmYXVsdFRpdGxlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFJlc3RvcmUgdGhlIHRpdGxlIHRoYXQgd2FzIHZpc2libGUgYmVmb3JlIGV4cGFuc2lvbi4gVG9vbCBzdGF0ZVxuXHRcdFx0XHRcdC8vIHVwZGF0ZXMgY2FuIGJlY29tZSBsZXNzIGRlc2NyaXB0aXZlIHdoaWxlIHRoZSBzZWN0aW9uIGlzIG9wZW4uXG5cdFx0XHRcdFx0Y29uc3QgY29sbGFwc2VkVGl0bGUgPSB0aGlzLmNvbGxhcHNlZFRpdGxlQmVmb3JlRXhwYW5zaW9uID8/IHRoaXMubGFzdEV4dHJhY3RlZFRpdGxlO1xuXHRcdFx0XHRcdHRoaXMuY29sbGFwc2VkVGl0bGVCZWZvcmVFeHBhbnNpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKGNvbGxhcHNlZFRpdGxlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNldFRpdGxlKGNvbGxhcHNlZFRpdGxlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRUaXRsZSh0aGlzLmRlZmF1bHRUaXRsZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHR0aGlzLmN1cnJlbnRUaXRsZSA9IHRoaXMuZGVmYXVsdFRpdGxlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzaG91bGRJbml0RWFybHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlICYmICF0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzaG91bGRBbmltYXRlQ29udGVudCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNob3VsZFByZXBhcmVDb250ZW50QW5pbWF0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5maXhlZFNjcm9sbGluZ01vZGU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY29udGVudERpZEluaXRpYWxpemUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlICYmIHRoaXMuc3RyZWFtaW5nQ29tcGxldGVkICYmIHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IHNjcm9sbGFibGVEb21Ob2RlID0gdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCk7XG5cdFx0XHRzY3JvbGxhYmxlRG9tTm9kZS5zdHlsZS5tYXhIZWlnaHQgPSAnMHB4Jztcblx0XHRcdHNjcm9sbGFibGVEb21Ob2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBleHBhbnNpb25EaWRDaGFuZ2UoZXhwYW5kZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5maXhlZFNjcm9sbGluZ01vZGUgJiYgdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQpIHtcblx0XHRcdGlmIChleHBhbmRlZCkge1xuXHRcdFx0XHR0aGlzLnN5bmNEaW1lbnNpb25zQW5kU2NoZWR1bGVTY3JvbGwoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ29tcGxldGVkU2Nyb2xsQW5pbWF0aW9uU3RhdGUoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIEBUT0RPOiBAanVzdHNjaGVuIENvbnZlcnQgdG8gdGVtcGxhdGUgZm9yIGVhY2ggc2V0dGluZz9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGluaXRDb250ZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHR0aGlzLndyYXBwZXIgPSAkKCcuY2hhdC11c2VkLWNvbnRleHQtbGlzdC5jaGF0LXRoaW5raW5nLWNvbGxhcHNpYmxlJyk7XG5cdFx0aWYgKCF0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCkge1xuXHRcdFx0dGhpcy53cmFwcGVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtdGhpbmtpbmctc3RyZWFtaW5nJyk7XG5cdFx0fVxuXG5cdFx0Ly8gT25seSBjcmVhdGUgdGV4dENvbnRhaW5lciBoZXJlIGlmIHRoZXJlJ3Mgbm8gcGVuZGluZyBsYXp5IHRoaW5raW5nIGl0ZW0uXG5cdFx0Ly8gSWYgdGhlcmUncyBhIGxhenkgdGhpbmtpbmcgaXRlbSwgaXQgd2lsbCBiZSByZW5kZXJlZCB2aWEgbWF0ZXJpYWxpemVMYXp5SXRlbVxuXHRcdC8vIHdpdGggdGhlIGxhdGVzdCBzdHJlYW1pbmcgY29udGVudC5cblx0XHRjb25zdCBoYXNMYXp5VGhpbmtpbmdJdGVtcyA9IHRoaXMubGF6eUl0ZW1zLnNvbWUoaXRlbSA9PiBpdGVtLmtpbmQgPT09ICd0aGlua2luZycpO1xuXHRcdGlmICh0aGlzLmN1cnJlbnRUaGlua2luZ1ZhbHVlICYmICFoYXNMYXp5VGhpbmtpbmdJdGVtcykge1xuXHRcdFx0dGhpcy50ZXh0Q29udGFpbmVyID0gJCgnLmNoYXQtdGhpbmtpbmctaXRlbS5tYXJrZG93bi1jb250ZW50Jyk7XG5cdFx0XHR0aGlzLndyYXBwZXIuYXBwZW5kQ2hpbGQodGhpcy50ZXh0Q29udGFpbmVyKTtcblx0XHRcdHRoaXMucmVuZGVyTWFya2Rvd24odGhpcy5jdXJyZW50VGhpbmtpbmdWYWx1ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCAmJiAhdGhpcy5lbGVtZW50LmlzQ29tcGxldGUpIHtcblx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50ID0gJCgnLmNoYXQtdGhpbmtpbmctaXRlbS5jaGF0LXRoaW5raW5nLXNwaW5uZXItaXRlbScpO1xuXHRcdFx0Y29uc3Qgc3Bpbm5lckljb24gPSBjcmVhdGVUaGlua2luZ0ljb24oQ29kaWNvbi5jaXJjbGVGaWxsZWQpO1xuXHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQuYXBwZW5kQ2hpbGQoc3Bpbm5lckljb24pO1xuXHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckxhYmVsID0gJCgnc3Bhbi5jaGF0LXRoaW5raW5nLXNwaW5uZXItbGFiZWwnKTtcblx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJMYWJlbC50ZXh0Q29udGVudCA9IHRoaXMuZ2V0UmFuZG9tV29ya2luZ01lc3NhZ2UoV29ya2luZ01lc3NhZ2VDYXRlZ29yeS5UaGlua2luZyk7XG5cdFx0XHR0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLndvcmtpbmdTcGlubmVyTGFiZWwpO1xuXHRcdFx0dGhpcy53cmFwcGVyLmFwcGVuZENoaWxkKHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50KTtcblx0XHRcdHRoaXMudXBkYXRlV29ya2luZ1NwaW5uZXJWaXNpYmlsaXR5KCk7XG5cdFx0fVxuXG5cdFx0Ly8gd3JhcCBjb250ZW50IGluIHNjcm9sbGFibGUgZWxlbWVudCBmb3IgZml4ZWQgc2Nyb2xsaW5nIG1vZGVcblx0XHRpZiAodGhpcy5maXhlZFNjcm9sbGluZ01vZGUpIHtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy53cmFwcGVyLCB7XG5cdFx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHRcdGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0XHRoYW5kbGVNb3VzZVdoZWVsOiB0cnVlLFxuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2Vcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQub25TY3JvbGwoZSA9PiB0aGlzLmhhbmRsZVNjcm9sbChlLnNjcm9sbFRvcCkpKTtcblxuXHRcdFx0bGV0IHBlbmRpbmdNdXRhdGlvblJlZnJlc2g6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgbXV0YXRpb25PYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcblx0XHRcdFx0aWYgKHBlbmRpbmdNdXRhdGlvblJlZnJlc2gpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cGVuZGluZ011dGF0aW9uUmVmcmVzaCA9IHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZ2V0V2luZG93KHRoaXMud3JhcHBlciksICgpID0+IHtcblx0XHRcdFx0XHRwZW5kaW5nTXV0YXRpb25SZWZyZXNoID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmICh0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCB8fCAhdGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJykpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoQ29udGVudEhlaWdodCgpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlU2Nyb2xsRGltZW5zaW9uc0Zyb21DYWNoZSgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdFx0bXV0YXRpb25PYnNlcnZlci5vYnNlcnZlKHRoaXMud3JhcHBlciwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRtdXRhdGlvbk9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcblx0XHRcdFx0XHRwZW5kaW5nTXV0YXRpb25SZWZyZXNoPy5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBPYnNlcnZlIGNoaWxkIGVsZW1lbnRzIGZvciByZXNpemVzIChlLmcuIHRlcm1pbmFsIG91dHB1dCBncm93aW5nKVxuXHRcdFx0Ly8gc28gd2UgY2FuIHVwZGF0ZSBzY3JvbGwgZGltZW5zaW9ucyB3aGVuIHRoZSB3cmFwcGVyIGJveCBpcyBwaW5uZWQgYXQgbWF4LWhlaWdodC5cblx0XHRcdHRoaXMuY2hpbGRSZXNpemVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0NoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LmNoaWxkJywgKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQgfHwgIXRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5zeW5jRGltZW5zaW9uc0FuZFNjaGVkdWxlU2Nyb2xsKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRpZiAodGhpcy50ZXh0Q29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hpbGRSZXNpemVPYnNlcnZlci5vYnNlcnZlKHRoaXMudGV4dENvbnRhaW5lcikpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hpbGRSZXNpemVPYnNlcnZlci5vYnNlcnZlKHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50KSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENhY2hlIHdyYXBwZXIgc2Nyb2xsSGVpZ2h0IHBvc3QtbGF5b3V0IHZpYSBSZXNpemVPYnNlcnZlciB0byBhdm9pZCBmb3JjZWQgcmVmbG93cy5cblx0XHRcdGNvbnN0IHdyYXBwZXJSZXNpemVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0NoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LndyYXBwZXInLCAoZW50cmllcykgPT4ge1xuXHRcdFx0XHRpZiAoZW50cmllc1swXSkge1xuXHRcdFx0XHRcdHRoaXMubGFzdEtub3duQ29udGVudEhlaWdodCA9IHRoaXMud3JhcHBlci5zY3JvbGxIZWlnaHQ7XG5cdFx0XHRcdFx0aWYgKHRoaXMuc3RyZWFtaW5nQ29tcGxldGVkICYmIHRoaXMuaXNFeHBhbmRlZCgpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVNjcm9sbERpbWVuc2lvbnNGb3JDb21wbGV0aW9uKCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICghdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQgJiYgdGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJykpIHtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlU2Nyb2xsRGltZW5zaW9uc0Zyb21DYWNoZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy53cmFwcGVyUmVzaXplT2JzZXJ2ZXJEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIod3JhcHBlclJlc2l6ZU9ic2VydmVyLm9ic2VydmUodGhpcy53cmFwcGVyKSk7XG5cblx0XHRcdC8vIE9uY2UgY29udGVudCBleGNlZWRzIG1heC1oZWlnaHQsIHRoZSB3cmFwcGVyIGJveCBzaXplIHN0b3BzIGNoYW5naW5nXG5cdFx0XHQvLyBzbyBSZXNpemVPYnNlcnZlciB3b24ndCBmaXJlLiBGYWxsIGJhY2sgdG8gc2Nyb2xsSGVpZ2h0IHJlYWRzIGhlcmUuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5ldmVudCgoKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQgJiYgdGhpcy53cmFwcGVyUmVzaXplT2JzZXJ2ZXJEaXNwb3NhYmxlKSB7XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoQ29udGVudEhlaWdodCgpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlU2Nyb2xsRGltZW5zaW9uc0Zyb21DYWNoZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnN5bmNEaW1lbnNpb25zQW5kU2NoZWR1bGVTY3JvbGwoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5zeW5jRGltZW5zaW9uc0FuZFNjaGVkdWxlU2Nyb2xsKCk7XG5cblx0XHRcdHRoaXMudXBkYXRlRHJvcGRvd25DbGlja2FiaWxpdHkoKTtcblx0XHRcdHJldHVybiB0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldERvbU5vZGUoKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZURyb3Bkb3duQ2xpY2thYmlsaXR5KCk7XG5cdFx0cmV0dXJuIHRoaXMud3JhcHBlcjtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlU2Nyb2xsKHNjcm9sbFRvcDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnNjcm9sbGFibGVFbGVtZW50IHx8IHRoaXMuaXNVcGRhdGluZ0RpbWVuc2lvbnMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxhc3RLbm93blNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcblx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gdGhpcy5sYXN0S25vd25Db250ZW50SGVpZ2h0O1xuXHRcdGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gTWF0aC5taW4oY29udGVudEhlaWdodCwgVEhJTktJTkdfU0NST0xMX01BWF9IRUlHSFQpO1xuXHRcdGNvbnN0IG1heFNjcm9sbFRvcCA9IGNvbnRlbnRIZWlnaHQgLSB2aWV3cG9ydEhlaWdodDtcblx0XHR0aGlzLmF1dG9TY3JvbGxFbmFibGVkID0gbWF4U2Nyb2xsVG9wIDw9IDAgfHwgc2Nyb2xsVG9wID49IG1heFNjcm9sbFRvcCAtIDEwO1xuXG5cdFx0dGhpcy51cGRhdGVGYWRlQ2xhc3NlcyhzY3JvbGxUb3AsIGNvbnRlbnRIZWlnaHQsIHZpZXdwb3J0SGVpZ2h0KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRmFkZUNsYXNzZXMoc2Nyb2xsVG9wPzogbnVtYmVyLCBjb250ZW50SGVpZ2h0PzogbnVtYmVyLCB2aWV3cG9ydEhlaWdodD86IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5maXhlZFNjcm9sbGluZ01vZGUgfHwgdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQpIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXRoaW5raW5nLWZhZGUtdG9wJywgJ2NoYXQtdGhpbmtpbmctZmFkZS1ib3R0b20nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50U2Nyb2xsVG9wID0gc2Nyb2xsVG9wID8/IHRoaXMubGFzdEtub3duU2Nyb2xsVG9wO1xuXHRcdGNvbnN0IGN1cnJlbnRDb250ZW50SGVpZ2h0ID0gY29udGVudEhlaWdodCA/PyB0aGlzLmxhc3RLbm93bkNvbnRlbnRIZWlnaHQ7XG5cdFx0Y29uc3QgY3VycmVudFZpZXdwb3J0SGVpZ2h0ID0gdmlld3BvcnRIZWlnaHQgPz8gTWF0aC5taW4oY3VycmVudENvbnRlbnRIZWlnaHQsIFRISU5LSU5HX1NDUk9MTF9NQVhfSEVJR0hUKTtcblx0XHRjb25zdCBtYXhTY3JvbGxUb3AgPSBjdXJyZW50Q29udGVudEhlaWdodCAtIGN1cnJlbnRWaWV3cG9ydEhlaWdodDtcblxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXRoaW5raW5nLWZhZGUtdG9wJywgY3VycmVudFNjcm9sbFRvcCA+IDUpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXRoaW5raW5nLWZhZGUtYm90dG9tJywgbWF4U2Nyb2xsVG9wID4gMCAmJiBjdXJyZW50U2Nyb2xsVG9wIDwgbWF4U2Nyb2xsVG9wIC0gNSk7XG5cdH1cblxuXHQvLyBGYWxsYmFjayBmb3Igbm9uLVJlc2l6ZU9ic2VydmVyIHVwZGF0ZXMgKG9uRGlkQ2hhbmdlSGVpZ2h0LCBpbml0aWFsIHNldHVwKS5cblx0cHJpdmF0ZSBzeW5jRGltZW5zaW9uc0FuZFNjaGVkdWxlU2Nyb2xsKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnBlbmRpbmdTY3JvbGxEaXNwb3NhYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucGVuZGluZ1Njcm9sbERpc3Bvc2FibGUgPSBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGdldFdpbmRvdyh0aGlzLmRvbU5vZGUpLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnBlbmRpbmdTY3JvbGxEaXNwb3NhYmxlID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuc3RyZWFtaW5nQ29tcGxldGVkKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2Nyb2xsRGltZW5zaW9uc0ZvckNvbXBsZXRpb24oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZWZyZXNoQ29udGVudEhlaWdodCgpO1xuXHRcdFx0dGhpcy51cGRhdGVTY3JvbGxEaW1lbnNpb25zRnJvbUNhY2hlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUmUtcmVhZCBzY3JvbGxIZWlnaHQgZnJvbSB0aGUgRE9NIGFuZCB1cGRhdGUgY2FjaGVkIGhlaWdodCBpZiBjaGFuZ2VkLlxuXHQgKi9cblx0cHJpdmF0ZSByZWZyZXNoQ29udGVudEhlaWdodCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMud3JhcHBlciB8fCAhdGhpcy5zY3JvbGxhYmxlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBuZXdIZWlnaHQgPSB0aGlzLndyYXBwZXIuc2Nyb2xsSGVpZ2h0O1xuXHRcdGlmIChuZXdIZWlnaHQgJiYgbmV3SGVpZ2h0ICE9PSB0aGlzLmxhc3RLbm93bkNvbnRlbnRIZWlnaHQpIHtcblx0XHRcdHRoaXMubGFzdEtub3duQ29udGVudEhlaWdodCA9IG5ld0hlaWdodDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNjcm9sbERpbWVuc2lvbnNGcm9tQ2FjaGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnNjcm9sbGFibGVFbGVtZW50IHx8IHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc0NvbGxhcHNlZCA9IHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpO1xuXHRcdGlmICghaXNDb2xsYXBzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gdGhpcy5sYXN0S25vd25Db250ZW50SGVpZ2h0O1xuXHRcdGlmICghY29udGVudEhlaWdodCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gTWF0aC5taW4oY29udGVudEhlaWdodCwgVEhJTktJTkdfU0NST0xMX01BWF9IRUlHSFQpO1xuXG5cdFx0dGhpcy5pc1VwZGF0aW5nRGltZW5zaW9ucyA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHZpZXdwb3J0V2lkdGggPSB0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldERvbU5vZGUoKS5jbGllbnRXaWR0aDtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyh7XG5cdFx0XHRcdHdpZHRoOiB2aWV3cG9ydFdpZHRoLFxuXHRcdFx0XHRzY3JvbGxXaWR0aDogdmlld3BvcnRXaWR0aCxcblx0XHRcdFx0aGVpZ2h0OiB2aWV3cG9ydEhlaWdodCxcblx0XHRcdFx0c2Nyb2xsSGVpZ2h0OiBjb250ZW50SGVpZ2h0XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHRoaXMuYXV0b1Njcm9sbEVuYWJsZWQpIHtcblx0XHRcdFx0dGhpcy5zY3JvbGxUb0JvdHRvbShjb250ZW50SGVpZ2h0KTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5pc1VwZGF0aW5nRGltZW5zaW9ucyA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlRmFkZUNsYXNzZXModGhpcy5sYXN0S25vd25TY3JvbGxUb3AsIHRoaXMubGFzdEtub3duQ29udGVudEhlaWdodCk7XG5cdFx0dGhpcy51cGRhdGVEcm9wZG93bkNsaWNrYWJpbGl0eShjb250ZW50SGVpZ2h0KTtcblx0fVxuXG5cdHByaXZhdGUgc2Nyb2xsVG9Cb3R0b20oY29udGVudEhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnNjcm9sbGFibGVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld3BvcnRIZWlnaHQgPSBNYXRoLm1pbihjb250ZW50SGVpZ2h0LCBUSElOS0lOR19TQ1JPTExfTUFYX0hFSUdIVCk7XG5cblx0XHRpZiAoY29udGVudEhlaWdodCA+IHZpZXdwb3J0SGVpZ2h0KSB7XG5cdFx0XHRjb25zdCBuZXdTY3JvbGxUb3AgPSBjb250ZW50SGVpZ2h0IC0gdmlld3BvcnRIZWlnaHQ7XG5cdFx0XHR0aGlzLmxhc3RLbm93blNjcm9sbFRvcCA9IG5ld1Njcm9sbFRvcDtcblx0XHRcdC8vIFByZXZlbnQgcmV2ZWFsLW9uLXNjcm9sbCBiZWhhdmlvciBmcm9tIGludGVyZmVyaW5nIHdpdGggZXhwbGljaXQgYm90dG9tIHBpbm5pbmcuXG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNldFJldmVhbE9uU2Nyb2xsKGZhbHNlKTtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IG5ld1Njcm9sbFRvcCB9KTtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0UmV2ZWFsT25TY3JvbGwodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIHVwZGF0ZXMgc2Nyb2xsIGRpbWVuc2lvbnMgd2hlbiBzdHJlYW1pbmcgaXMgY29tcGxldGUuXG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZVNjcm9sbERpbWVuc2lvbnNGb3JDb21wbGV0aW9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zY3JvbGxhYmxlRWxlbWVudCB8fCAhdGhpcy5maXhlZFNjcm9sbGluZ01vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gdGhpcy53cmFwcGVyLnNjcm9sbEhlaWdodDtcblx0XHR0aGlzLmxhc3RLbm93bkNvbnRlbnRIZWlnaHQgPSBjb250ZW50SGVpZ2h0O1xuXG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZURvbU5vZGUgPSB0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldERvbU5vZGUoKTtcblx0XHRzY3JvbGxhYmxlRG9tTm9kZS5zdHlsZS5tYXhIZWlnaHQgPSBgJHtjb250ZW50SGVpZ2h0fXB4YDtcblx0XHRjb25zdCB2aWV3cG9ydFdpZHRoID0gc2Nyb2xsYWJsZURvbU5vZGUuY2xpZW50V2lkdGg7XG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxEaW1lbnNpb25zKHtcblx0XHRcdHdpZHRoOiB2aWV3cG9ydFdpZHRoLFxuXHRcdFx0c2Nyb2xsV2lkdGg6IHZpZXdwb3J0V2lkdGgsXG5cdFx0XHRoZWlnaHQ6IGNvbnRlbnRIZWlnaHQsXG5cdFx0XHRzY3JvbGxIZWlnaHQ6IGNvbnRlbnRIZWlnaHRcblx0XHR9KTtcblx0XHR0aGlzLmxhc3RLbm93blNjcm9sbFRvcCA9IDA7XG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRSZXZlYWxPblNjcm9sbChmYWxzZSk7XG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogMCB9KTtcblx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNldFJldmVhbE9uU2Nyb2xsKHRydWUpO1xuXHRcdHRoaXMudXBkYXRlQ29tcGxldGVkU2Nyb2xsQW5pbWF0aW9uU3RhdGUodGhpcy5pc0V4cGFuZGVkKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb21wbGV0ZWRTY3JvbGxBbmltYXRpb25TdGF0ZShleHBhbmRlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zY3JvbGxhYmxlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzY3JvbGxhYmxlRG9tTm9kZSA9IHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0RG9tTm9kZSgpO1xuXHRcdHNjcm9sbGFibGVEb21Ob2RlLnN0eWxlLm1heEhlaWdodCA9IGV4cGFuZGVkID8gYCR7dGhpcy5sYXN0S25vd25Db250ZW50SGVpZ2h0fXB4YCA6ICcwcHgnO1xuXHRcdHNjcm9sbGFibGVEb21Ob2RlLmluZXJ0ID0gIWV4cGFuZGVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNYXJrZG93bihjb250ZW50OiBzdHJpbmcsIHJldXNlRXhpc3Rpbmc/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gR3VhcmQgYWdhaW5zdCByZW5kZXJpbmcgYWZ0ZXIgZGlzcG9zYWwgdG8gYXZvaWQgbGVha2luZyBkaXNwb3NhYmxlc1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNsZWFuZWRDb250ZW50ID0gY29udGVudC50cmltKCk7XG5cdFx0aWYgKCFjbGVhbmVkQ29udGVudCkge1xuXHRcdFx0dGhpcy5fbWFya2Rvd25SZXN1bHQuY2xlYXIoKTtcblx0XHRcdGlmICh0aGlzLnRleHRDb250YWluZXIpIHtcblx0XHRcdFx0Y2xlYXJOb2RlKHRoaXMudGV4dENvbnRhaW5lcik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIGVudGlyZSBjb250ZW50IGlzIGJvbGRlZCwgc3RyaXAgdGhlIGJvbGQgbWFya2VycyBmb3IgcmVuZGVyaW5nXG5cdFx0bGV0IGNvbnRlbnRUb1JlbmRlciA9IGNsZWFuZWRDb250ZW50O1xuXHRcdGlmIChjbGVhbmVkQ29udGVudC5zdGFydHNXaXRoKCcqKicpICYmIGNsZWFuZWRDb250ZW50LmVuZHNXaXRoKCcqKicpKSB7XG5cdFx0XHRjb250ZW50VG9SZW5kZXIgPSBjbGVhbmVkQ29udGVudC5zbGljZSgyLCAtMik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gcmV1c2VFeGlzdGluZyA/IHRoaXMuX21hcmtkb3duUmVzdWx0LnZhbHVlPy5lbGVtZW50IDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgcmVuZGVyZWQgPSB0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlci5yZW5kZXIobmV3IE1hcmtkb3duU3RyaW5nKGNvbnRlbnRUb1JlbmRlciksIHtcblx0XHRcdGZpbGxJbkluY29tcGxldGVUb2tlbnM6IHRydWUsXG5cdFx0XHRhc3luY1JlbmRlckNhbGxiYWNrOiB0aGlzLl9hc3luY1JlbmRlckNhbGxiYWNrLFxuXHRcdFx0Y29kZUJsb2NrUmVuZGVyZXJTeW5jOiBDaGF0VGhpbmtpbmdDb250ZW50UGFydC5fY29kZUJsb2NrUmVuZGVyZXJTeW5jLFxuXHRcdH0sIHRhcmdldCk7XG5cdFx0dGhpcy5fbWFya2Rvd25SZXN1bHQudmFsdWUgPSByZW5kZXJlZDtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0aWYgKHRoaXMudGV4dENvbnRhaW5lcikge1xuXHRcdFx0XHRjbGVhck5vZGUodGhpcy50ZXh0Q29udGFpbmVyKTtcblx0XHRcdFx0dGhpcy50ZXh0Q29udGFpbmVyLmFwcGVuZENoaWxkKGNyZWF0ZVRoaW5raW5nSWNvbihDb2RpY29uLmNpcmNsZUZpbGxlZCkpO1xuXHRcdFx0XHR0aGlzLnRleHRDb250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyZWQuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRGaW5hbGl6ZWRUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb2xsYXBzZUJ1dHRvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3BsYXlUaXRsZSA9IHRoaXMuZ2V0RmluYWxpemVkRGlzcGxheVRpdGxlKHRpdGxlKTtcblx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSB0aGlzLl9jb2xsYXBzZUJ1dHRvbi5sYWJlbEVsZW1lbnQ7XG5cdFx0bGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG5cblx0XHRjb25zdCBmaXJzdFNwYWNlSW5kZXggPSBkaXNwbGF5VGl0bGUuaW5kZXhPZignICcpO1xuXHRcdGlmIChmaXJzdFNwYWNlSW5kZXggPT09IC0xKSB7XG5cdFx0XHQvLyBTaW5nbGUgd29yZCB0aXRsZSwgbm8gbmVlZCB0byBzcGxpdFxuXHRcdFx0bGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gZGlzcGxheVRpdGxlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB2ZXJiID0gZGlzcGxheVRpdGxlLnN1YnN0cmluZygwLCBmaXJzdFNwYWNlSW5kZXgpO1xuXHRcdFx0Y29uc3QgcmVzdCA9IGRpc3BsYXlUaXRsZS5zdWJzdHJpbmcoZmlyc3RTcGFjZUluZGV4KTtcblxuXHRcdFx0Y29uc3QgdmVyYlNwYW4gPSAkKCdzcGFuJyk7XG5cdFx0XHR2ZXJiU3Bhbi50ZXh0Q29udGVudCA9IHZlcmI7XG5cdFx0XHRsYWJlbEVsZW1lbnQuYXBwZW5kQ2hpbGQodmVyYlNwYW4pO1xuXG5cdFx0XHRjb25zdCByZXN0U3BhbiA9ICQoJ3NwYW4uY2hhdC10aGlua2luZy10aXRsZS1kZXRhaWwtdGV4dCcpO1xuXHRcdFx0cmVzdFNwYW4udGV4dENvbnRlbnQgPSByZXN0O1xuXHRcdFx0bGFiZWxFbGVtZW50LmFwcGVuZENoaWxkKHJlc3RTcGFuKTtcblx0XHR9XG5cblx0XHQvLyBTaG93IGFnZ3JlZ2F0ZWQgZGlmZiBzdGF0cyBmcm9tIGVkaXQgcGlsbHMgKG9ubHkgd2hlbiB0aGVyZSBhcmUgYWN0dWFsIGNoYW5nZXMpXG5cdFx0aWYgKHRoaXMuZGlmZlN0YXRzQnlQYXJ0SWQuc2l6ZSA+IDApIHtcblx0XHRcdGNvbnN0IHsgYWRkZWQsIHJlbW92ZWQgfSA9IHRoaXMuX2FnZ3JlZ2F0ZWREaWZmO1xuXHRcdFx0aWYgKGFkZGVkID4gMCB8fCByZW1vdmVkID4gMCkge1xuXHRcdFx0XHRjb25zdCBkaWZmQ29udGFpbmVyID0gJCgnc3Bhbi5jaGF0LXRoaW5raW5nLXRpdGxlLWRpZmYnKTtcblx0XHRcdFx0ZGlmZkNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCdzcGFuLmxhYmVsLWFkZGVkJywge30sIGArJHthZGRlZH1gKSk7XG5cdFx0XHRcdGRpZmZDb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnc3Bhbi5sYWJlbC1yZW1vdmVkJywge30sIGAtJHtyZW1vdmVkfWApKTtcblx0XHRcdFx0bGFiZWxFbGVtZW50LmFwcGVuZENoaWxkKGRpZmZDb250YWluZXIpO1xuXG5cdFx0XHRcdGNvbnN0IGluc2VydGlvbnNGcmFnbWVudCA9IGFkZGVkID09PSAxID8gbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuaW5zZXJ0aW9ucy5vbmUnLCBcIjEgaW5zZXJ0aW9uXCIpIDogbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuaW5zZXJ0aW9ucycsIFwiezB9IGluc2VydGlvbnNcIiwgYWRkZWQpO1xuXHRcdFx0XHRjb25zdCBkZWxldGlvbnNGcmFnbWVudCA9IHJlbW92ZWQgPT09IDEgPyBsb2NhbGl6ZSgnY2hhdC50aGlua2luZy5kZWxldGlvbnMub25lJywgXCIxIGRlbGV0aW9uXCIpIDogbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuZGVsZXRpb25zJywgXCJ7MH0gZGVsZXRpb25zXCIsIHJlbW92ZWQpO1xuXHRcdFx0XHR0aGlzLnNldEFyaWFMYWJlbChsb2NhbGl6ZSgnY2hhdC50aGlua2luZy50aXRsZVdpdGhEaWZmJywgXCJ7MH0sIHsxfSwgezJ9XCIsIGRpc3BsYXlUaXRsZSwgaW5zZXJ0aW9uc0ZyYWdtZW50LCBkZWxldGlvbnNGcmFnbWVudCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zZXRBcmlhTGFiZWwoZGlzcGxheVRpdGxlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZXRBcmlhTGFiZWwoZGlzcGxheVRpdGxlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEZpbmFsaXplZERpc3BsYXlUaXRsZSh0aXRsZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy50aGlua2luZ0Rpc3BsYXlNb2RlICE9PSBUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZCB8fCAhdGhpcy5jb250YWluc1JlYXNvbmluZyB8fCB0aGlzLmNvbnRhaW5zR3JvdXBlZEl0ZW1zIHx8ICF0aGlzLnJlYXNvbmluZ0R1cmF0aW9uTXMpIHtcblx0XHRcdHJldHVybiB0aXRsZTtcblx0XHR9XG5cblx0XHRjb25zdCBzZWNvbmRzID0gTWF0aC5jZWlsKHRoaXMucmVhc29uaW5nRHVyYXRpb25NcyAvIDEwMDApO1xuXHRcdGNvbnN0IGR1cmF0aW9uID0gbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuZHVyYXRpb24uc2Vjb25kcycsIFwiezB9c1wiLCBzZWNvbmRzKTtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcudGl0bGVXaXRoRHVyYXRpb24nLCBcInswfSAtIHsxfVwiLCB0aXRsZSwgZHVyYXRpb24pO1xuXHR9XG5cblx0cHVibGljIGhhc1JlYXNvbmluZ0NvbnRlbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGFpbnNSZWFzb25pbmc7XG5cdH1cblxuXHRwdWJsaWMgaGFzR3JvdXBlZEl0ZW1zKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbnRhaW5zR3JvdXBlZEl0ZW1zO1xuXHR9XG5cblx0cHJpdmF0ZSByZWNvcmRSZWFzb25pbmdDb250ZW50KGNvbnRlbnQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghY29udGVudC50cmltKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jb250YWluc1JlYXNvbmluZyA9IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHNldERyb3Bkb3duQ2xpY2thYmxlKGNsaWNrYWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb2xsYXBzZUJ1dHRvbikge1xuXHRcdFx0dGhpcy5fY29sbGFwc2VCdXR0b24uZWxlbWVudC5zdHlsZS5wb2ludGVyRXZlbnRzID0gY2xpY2thYmxlID8gJ2F1dG8nIDogJ25vbmUnO1xuXHRcdH1cblxuXHRcdGlmICghY2xpY2thYmxlICYmIHRoaXMuc3RyZWFtaW5nQ29tcGxldGVkKSB7XG5cdFx0XHR0aGlzLnNldEZpbmFsaXplZFRpdGxlKHRoaXMubGFzdEV4dHJhY3RlZFRpdGxlID8/IHRoaXMuY3VycmVudFRpdGxlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZEFsbG93RXhwYW5zaW9uKCk6IGJvb2xlYW4ge1xuXHRcdC8vIE11bHRpcGxlIHRvb2wgaW52b2NhdGlvbnMgb3IgbGF6eSBpdGVtcyBtZWFuIHRoZXJlJ3MgY29udGVudCB0byBzaG93XG5cdFx0aWYgKHRoaXMudG9vbEludm9jYXRpb25Db3VudCA+IDAgfHwgdGhpcy5sYXp5SXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gQ291bnQgbWVhbmluZ2Z1bCBjaGlsZHJlbiBpbiB0aGUgd3JhcHBlciAoZXhjbHVkZSB0aGUgd29ya2luZyBzcGlubmVyKVxuXHRcdGlmICh0aGlzLndyYXBwZXIpIHtcblx0XHRcdGNvbnN0IG1lYW5pbmdmdWxDaGlsZHJlbiA9IEFycmF5LmZyb20odGhpcy53cmFwcGVyLmNoaWxkcmVuKS5maWx0ZXIoY2hpbGQgPT4gY2hpbGQgIT09IHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50KS5sZW5ndGg7XG5cdFx0XHRpZiAobWVhbmluZ2Z1bENoaWxkcmVuID4gMSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjb250ZW50V2l0aG91dFRpdGxlID0gdGhpcy5jdXJyZW50VGhpbmtpbmdWYWx1ZS50cmltKCk7XG5cdFx0Y29uc3QgdGl0bGVUb0NvbXBhcmUgPSB0aGlzLmxhc3RFeHRyYWN0ZWRUaXRsZSA/PyB0aGlzLmN1cnJlbnRUaXRsZTtcblxuXHRcdGNvbnN0IHN0cmlwTWFya2Rvd24gPSAodGV4dDogc3RyaW5nKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGV4dFxuXHRcdFx0XHQucmVwbGFjZSgvXFwqXFwqKC4rPylcXCpcXCovZywgJyQxJykucmVwbGFjZSgvXFwqKC4rPylcXCovZywgJyQxJykucmVwbGFjZSgvYCguKz8pYC9nLCAnJDEnKS50cmltKCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHN0cmlwcGVkQ29udGVudCA9IHN0cmlwTWFya2Rvd24oY29udGVudFdpdGhvdXRUaXRsZSk7XG5cdFx0Ly8gSWYgY29udGVudCBpcyBlbXB0eSBvciBtYXRjaGVzIHRoZSB0aXRsZSBleGFjdGx5LCBub3RoaW5nIHRvIGV4cGFuZFxuXHRcdHJldHVybiAhKCFzdHJpcHBlZENvbnRlbnQgfHwgc3RyaXBwZWRDb250ZW50ID09PSB0aXRsZVRvQ29tcGFyZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZURyb3Bkb3duQ2xpY2thYmlsaXR5KGtub3duQ29udGVudEhlaWdodD86IG51bWJlcik6IHZvaWQge1xuXHRcdGxldCBhbGxvd0V4cGFuc2lvbiA9IHRoaXMuc2hvdWxkQWxsb3dFeHBhbnNpb24oKTtcblxuXHRcdC8vIGRvbid0IGFsbG93IGZlZWRiYWNrIG9uIGZpeGVkIHNjcm9sbGluZyBiZWZvcmUgcmVhY2hpbmcgbWF4IGhlaWdodC5cblx0XHRpZiAoYWxsb3dFeHBhbnNpb24gJiYgdGhpcy5maXhlZFNjcm9sbGluZ01vZGUgJiYgIXRoaXMuc3RyZWFtaW5nQ29tcGxldGVkICYmICF0aGlzLmVsZW1lbnQuaXNDb21wbGV0ZSAmJiB0aGlzLndyYXBwZXIpIHtcblx0XHRcdC8vIFVzZSBvbmx5IHRoZSBjYWNoZWQgaGVpZ2h0IFx1MjAxNCBuZXZlciByZWFkIHNjcm9sbEhlaWdodCBoZXJlIHRvIGF2b2lkIGZvcmNlZCByZWZsb3dzLlxuXHRcdFx0Ly8gSWYgdGhlIGNhY2hlIGlzIGVtcHR5LCBjb25zZXJ2YXRpdmVseSBkaXNhbGxvdyBleHBhbnNpb247IHRoZSBSZXNpemVPYnNlcnZlclxuXHRcdFx0Ly8gd2lsbCBwb3B1bGF0ZSBsYXN0S25vd25Db250ZW50SGVpZ2h0IGFuZCB0cmlnZ2VyIGFub3RoZXIgY2FsbCBvbmNlIGxheW91dCBzZXR0bGVzLlxuXHRcdFx0Y29uc3QgY29udGVudEhlaWdodCA9IGtub3duQ29udGVudEhlaWdodCA/PyB0aGlzLmxhc3RLbm93bkNvbnRlbnRIZWlnaHQ7XG5cdFx0XHRpZiAoIWNvbnRlbnRIZWlnaHQgfHwgY29udGVudEhlaWdodCA8PSBUSElOS0lOR19TQ1JPTExfTUFYX0hFSUdIVCkge1xuXHRcdFx0XHRhbGxvd0V4cGFuc2lvbiA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghYWxsb3dFeHBhbnNpb24gJiYgdGhpcy5pc0V4cGFuZGVkKCkgJiYgKHRoaXMuc3RyZWFtaW5nQ29tcGxldGVkIHx8IHRoaXMuZWxlbWVudC5pc0NvbXBsZXRlKSkge1xuXHRcdFx0dGhpcy5zZXRFeHBhbmRlZChmYWxzZSk7XG5cdFx0fVxuXHRcdHRoaXMuc2V0RHJvcGRvd25DbGlja2FibGUoYWxsb3dFeHBhbnNpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBlbmRUb1dyYXBwZXIoZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMud3JhcHBlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQgJiYgdGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQucGFyZW50Tm9kZSA9PT0gdGhpcy53cmFwcGVyKSB7XG5cdFx0XHR0aGlzLndyYXBwZXIuaW5zZXJ0QmVmb3JlKGVsZW1lbnQsIHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy53cmFwcGVyLmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlV29ya2luZ1NwaW5uZXJWaXNpYmlsaXR5KHJlYWRlcj86IElSZWFkZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMud3JhcHBlciB8fCAhdGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNSdW5uaW5nVGVybWluYWxUb29sID0gdGhpcy50b29sSW52b2NhdGlvbnMuc29tZSh0b29sSW52b2NhdGlvbiA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodGVybWluYWxEYXRhPy5raW5kICE9PSAndGVybWluYWwnIHx8IHRlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZT8uZXhpdENvZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAhSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHRvb2xJbnZvY2F0aW9uLCByZWFkZXIpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaXNBdHRhY2hlZCA9IHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50LnBhcmVudE5vZGUgPT09IHRoaXMud3JhcHBlcjtcblx0XHRpZiAoaGFzUnVubmluZ1Rlcm1pbmFsVG9vbCAmJiBpc0F0dGFjaGVkKSB7XG5cdFx0XHR0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHR9IGVsc2UgaWYgKCFoYXNSdW5uaW5nVGVybWluYWxUb29sICYmICFpc0F0dGFjaGVkICYmICF0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCAmJiAhdGhpcy5lbGVtZW50LmlzQ29tcGxldGUpIHtcblx0XHRcdHRoaXMud3JhcHBlci5hcHBlbmRDaGlsZCh0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlc2V0SWQoKTogdm9pZCB7XG5cdFx0dGhpcy5pZCA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBjb2xsYXBzZUNvbnRlbnQoKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRFeHBhbmRlZChmYWxzZSk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlVGhpbmtpbmcoY29udGVudDogSUNoYXRUaGlua2luZ1BhcnQpOiB2b2lkIHtcblx0XHQvLyBJZiBkaXNwb3NlZCwgaWdub3JlIGxhdGUgdXBkYXRlcyBjb21pbmcgZnJvbSByZW5kZXJlciBkaWZmaW5nXG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jb250ZW50ID0gY29udGVudDtcblx0XHR0aGlzLnJlYXNvbmluZ0R1cmF0aW9uTXMgPSBjb250ZW50LnJlYXNvbmluZ0R1cmF0aW9uTXM7XG5cblx0XHQvLyBVcGRhdGUgYW55IHBlbmRpbmcgbGF6eSB0aGlua2luZyBpdGVtIHdpdGggbWF0Y2hpbmcgSUQgc28gdGhhdFxuXHRcdC8vIHdoZW4gbWF0ZXJpYWxpemVkLCBpdCB3aWxsIGhhdmUgdGhlIGxhdGVzdCBzdHJlYW1pbmcgY29udGVudFxuXHRcdGZvciAoY29uc3QgbGF6eUl0ZW0gb2YgdGhpcy5sYXp5SXRlbXMpIHtcblx0XHRcdGlmIChsYXp5SXRlbS5raW5kID09PSAndGhpbmtpbmcnICYmIGxhenlJdGVtLmNvbnRlbnQuaWQgPT09IGNvbnRlbnQuaWQpIHtcblx0XHRcdFx0bGF6eUl0ZW0uY29udGVudCA9IGNvbnRlbnQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJhdyA9IGV4dHJhY3RUZXh0RnJvbVBhcnQoY29udGVudCk7XG5cdFx0dGhpcy5yZWNvcmRSZWFzb25pbmdDb250ZW50KHJhdyk7XG5cdFx0Y29uc3QgbmV4dCA9IHJhdztcblx0XHRpZiAobmV4dCA9PT0gdGhpcy5jdXJyZW50VGhpbmtpbmdWYWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcmV2aW91c1ZhbHVlID0gdGhpcy5jdXJyZW50VGhpbmtpbmdWYWx1ZTtcblx0XHRjb25zdCByZXVzZUV4aXN0aW5nID0gISEodGhpcy5fbWFya2Rvd25SZXN1bHQudmFsdWUgJiYgbmV4dC5zdGFydHNXaXRoKHByZXZpb3VzVmFsdWUpICYmIG5leHQubGVuZ3RoID4gcHJldmlvdXNWYWx1ZS5sZW5ndGgpO1xuXHRcdHRoaXMuY3VycmVudFRoaW5raW5nVmFsdWUgPSBuZXh0O1xuXHRcdHRoaXMucmVuZGVyTWFya2Rvd24obmV4dCwgcmV1c2VFeGlzdGluZyk7XG5cblx0XHRpZiAodGhpcy5maXhlZFNjcm9sbGluZ01vZGUgJiYgdGhpcy5zY3JvbGxhYmxlRWxlbWVudCkge1xuXHRcdFx0dGhpcy5yZWZyZXNoQ29udGVudEhlaWdodCgpO1xuXHRcdFx0dGhpcy51cGRhdGVTY3JvbGxEaW1lbnNpb25zRnJvbUNhY2hlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0cmFjdGVkVGl0bGUgPSBleHRyYWN0VGl0bGVGcm9tVGhpbmtpbmdDb250ZW50KHJhdyk7XG5cdFx0aWYgKGV4dHJhY3RlZFRpdGxlICYmIGV4dHJhY3RlZFRpdGxlICE9PSB0aGlzLmN1cnJlbnRUaXRsZSkge1xuXHRcdFx0aWYgKCF0aGlzLmV4dHJhY3RlZFRpdGxlcy5pbmNsdWRlcyhleHRyYWN0ZWRUaXRsZSkpIHtcblx0XHRcdFx0dGhpcy5leHRyYWN0ZWRUaXRsZXMucHVzaChleHRyYWN0ZWRUaXRsZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxhc3RFeHRyYWN0ZWRUaXRsZSA9IGV4dHJhY3RlZFRpdGxlO1xuXHRcdH1cblxuXHRcdGlmICghZXh0cmFjdGVkVGl0bGUgfHwgZXh0cmFjdGVkVGl0bGUgPT09IHRoaXMuY3VycmVudFRpdGxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmxhc3RFeHRyYWN0ZWRUaXRsZSA/PyAnJztcblx0XHRpZiAoIXRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlICYmICF0aGlzLl9pc0V4cGFuZGVkLmdldCgpKSB7XG5cdFx0XHR0aGlzLnNldFRpdGxlKGxhYmVsKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZURyb3Bkb3duQ2xpY2thYmlsaXR5KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SXNBY3RpdmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaXNBY3RpdmU7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIHdoZW4gdGhpcyB0aGlua2luZyBwYXJ0IGhhcyBubyBtZWFuaW5nZnVsIGNvbnRlbnQgdG8gZGlzcGxheTpcblx0ICogbm8gdG9vbCBpbnZvY2F0aW9ucywgbm8gbGF6eSBpdGVtcywgbm8gaG9va3MsIGFuZCBubyB0aGlua2luZyB0ZXh0LlxuXHQgKiBUaGlzIGhhcHBlbnMgd2hlbiBhIHRvb2wgaXMgcmVtb3ZlZCBmcm9tIHRoaW5raW5nIChlLmcuIGR1ZSB0byBjb25maXJtYXRpb24pXG5cdCAqIGFuZCB0aGUgdGhpbmtpbmcgcGFydCB3YXMgb25seSBjcmVhdGVkIHRvIGhvbGQgdGhhdCB0b29sLlxuXHQgKi9cblx0cHVibGljIGlzRWZmZWN0aXZlbHlFbXB0eSgpOiBib29sZWFuIHtcblx0XHR0aGlzLnByb2Nlc3NQZW5kaW5nUmVtb3ZhbHMoKTtcblx0XHRpZiAodGhpcy50b29sSW52b2NhdGlvbkNvdW50ID4gMCB8fCB0aGlzLmxhenlJdGVtcy5sZW5ndGggPiAwIHx8IHRoaXMuaG9va0NvdW50ID4gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jdXJyZW50VGhpbmtpbmdWYWx1ZS50cmltKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBtYXJrQXNJbmFjdGl2ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmlzQWN0aXZlID0gZmFsc2U7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2NoYXQtdGhpbmtpbmctYWN0aXZlJyk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2NoYXQtdGhpbmtpbmctZmFkZS10b3AnLCAnY2hhdC10aGlua2luZy1mYWRlLWJvdHRvbScpO1xuXHRcdHRoaXMucHJvY2Vzc1BlbmRpbmdSZW1vdmFscygpO1xuXHRcdGlmICh0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCkge1xuXHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJMYWJlbCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBDbGVhciB0aGUgYXR0YWNoZWQtdG8tdGhpbmtpbmcgZmxhZyBvbiBhbGwgdG9vbCBpbnZvY2F0aW9uc1xuXHRcdGZvciAoY29uc3QgdG9vbEludm9jYXRpb24gb2YgdGhpcy50b29sSW52b2NhdGlvbnMpIHtcblx0XHRcdHRvb2xJbnZvY2F0aW9uLmlzQXR0YWNoZWRUb1RoaW5raW5nID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGZpbmFsaXplVGl0bGVJZkRlZmF1bHQoKTogdm9pZCB7XG5cdFx0dGhpcy5wcm9jZXNzUGVuZGluZ1JlbW92YWxzKCk7XG5cblx0XHQvLyBXaXRoIGxhenkgcmVuZGVyaW5nLCB3cmFwcGVyIG1heSBub3QgYmUgY3JlYXRlZCB5ZXQgaWYgY29udGVudCBoYXNuJ3QgYmVlbiBleHBhbmRlZFxuXHRcdGlmICh0aGlzLndyYXBwZXIpIHtcblx0XHRcdHRoaXMud3JhcHBlci5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXRoaW5raW5nLXN0cmVhbWluZycpO1xuXHRcdH1cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC10aGlua2luZy1hY3RpdmUnKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC10aGlua2luZy1mYWRlLXRvcCcsICdjaGF0LXRoaW5raW5nLWZhZGUtYm90dG9tJyk7XG5cdFx0dGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQgPSB0cnVlO1xuXHRcdHRoaXMuc2V0Q29udGVudEFuaW1hdGlvbkVuYWJsZWQoIXRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlKTtcblxuXHRcdC8vIE5vdyB0aGF0IHN0cmVhbWluZyBpcyBjb21wbGV0ZSwgcmVuZGVyIGFueSBhZ2dyZWdhdGVkIGltYWdlcyB0aGF0IHdlcmVcblx0XHQvLyBkZWZlcnJlZCB3aGlsZSBzY3JvbGxpbmcgd2FzIHBpbm5lZCBpbiBmaXhlZCBzY3JvbGxpbmcgbW9kZS5cblx0XHR0aGlzLmZsdXNoUGVuZGluZ0V4dGVybmFsUmVzb3VyY2VzKCk7XG5cblx0XHRpZiAodGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQpIHtcblx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLndvcmtpbmdTcGlubmVyTGFiZWwgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5pY29uID0gQ29kaWNvbi5jaGVjaztcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgc2Nyb2xsIGRpbWVuc2lvbnMgbm93IHRoYXQgc3RyZWFtaW5nIGlzIGNvbXBsZXRlXG5cdFx0Ly8gVGhpcyByZW1vdmVzIHVubmVjZXNzYXJ5IHNjcm9sbGJhciB3aGVuIGNvbnRlbnQgZml0c1xuXHRcdHRoaXMudXBkYXRlU2Nyb2xsRGltZW5zaW9uc0ZvckNvbXBsZXRpb24oKTtcblxuXHRcdHRoaXMudXBkYXRlRHJvcGRvd25DbGlja2FiaWxpdHkoKTtcblxuXHRcdGlmICh0aGlzLmNvbnRlbnQuZ2VuZXJhdGVkVGl0bGUpIHtcblx0XHRcdHRoaXMuY3VycmVudFRpdGxlID0gdGhpcy5jb250ZW50LmdlbmVyYXRlZFRpdGxlO1xuXHRcdFx0dGhpcy5zZXRHZW5lcmF0ZWRUaXRsZU9uQWxsUGFydHModGhpcy5jb250ZW50LmdlbmVyYXRlZFRpdGxlKTtcblx0XHRcdHRoaXMuc2V0RmluYWxpemVkVGl0bGUodGhpcy5jb250ZW50LmdlbmVyYXRlZFRpdGxlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZXVzZSBhbnkgZXhpc3RpbmcgZ2VuZXJhdGVkIHRpdGxlIGZyb20gdG9vbCBpbnZvY2F0aW9ucyBvciB0aGlua2luZyBwYXJ0cy5cblx0XHRjb25zdCBleGlzdGluZ1RpdGxlID0gdGhpcy50b29sSW52b2NhdGlvbnMuZmluZCh0ID0+IHQuZ2VuZXJhdGVkVGl0bGUpPy5nZW5lcmF0ZWRUaXRsZVxuXHRcdFx0Pz8gdGhpcy5hbGxUaGlua2luZ1BhcnRzLmZpbmQodCA9PiB0LmdlbmVyYXRlZFRpdGxlKT8uZ2VuZXJhdGVkVGl0bGU7XG5cdFx0aWYgKGV4aXN0aW5nVGl0bGUpIHtcblx0XHRcdHRoaXMuY3VycmVudFRpdGxlID0gZXhpc3RpbmdUaXRsZTtcblx0XHRcdHRoaXMuY29udGVudC5nZW5lcmF0ZWRUaXRsZSA9IGV4aXN0aW5nVGl0bGU7XG5cdFx0XHR0aGlzLnNldEdlbmVyYXRlZFRpdGxlT25BbGxQYXJ0cyhleGlzdGluZ1RpdGxlKTtcblx0XHRcdHRoaXMuc2V0RmluYWxpemVkVGl0bGUoZXhpc3RpbmdUaXRsZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT25seSBjaGVjayB0aGUgcGVyc2lzdGVkIGNhY2hlIHdoZW4gcmUtcmVuZGVyaW5nICh0b29sIGludm9jYXRpb25zIGFyZVxuXHRcdC8vIHNlcmlhbGl6ZWQpLCBub3QgZHVyaW5nIGxpdmUgc3RyZWFtaW5nLiBSZWFzb25pbmctb25seSBibG9ja3MgKG5vIHRvb2xzKVxuXHRcdC8vIGFyZSBrZXllZCBvZmYgdGhlIHN0YWJsZSB0aGlua2luZyBwYXJ0IGlkIHNvIHRoZWlyIGdlbmVyYXRlZCBoZWFkZXJzIGFyZVxuXHRcdC8vIGFsc28gcmVzdG9yZWQgb24gcmVsb2FkIChub24tbG9jYWwgc2Vzc2lvbnMgb25seSkuXG5cdFx0Y29uc3QgYWxsVG9vbHNTZXJpYWxpemVkID0gdGhpcy50b29sSW52b2NhdGlvbnMuZXZlcnkodCA9PiB0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKTtcblx0XHRpZiAoYWxsVG9vbHNTZXJpYWxpemVkICYmICFMb2NhbENoYXRTZXNzaW9uVXJpLmlzTG9jYWxTZXNzaW9uKHRoaXMuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBjYWNoZUlkID0gdGhpcy5nZXRUaXRsZUNhY2hlSWQoKTtcblx0XHRcdGlmIChjYWNoZUlkKSB7XG5cdFx0XHRcdGNvbnN0IGNhY2hlZFRpdGxlID0gdGhpcy5nZXRDYWNoZWRUaXRsZShjYWNoZUlkKTtcblx0XHRcdFx0aWYgKGNhY2hlZFRpdGxlKSB7XG5cdFx0XHRcdFx0dGhpcy5jdXJyZW50VGl0bGUgPSBjYWNoZWRUaXRsZTtcblx0XHRcdFx0XHR0aGlzLmNvbnRlbnQuZ2VuZXJhdGVkVGl0bGUgPSBjYWNoZWRUaXRsZTtcblx0XHRcdFx0XHR0aGlzLnNldEdlbmVyYXRlZFRpdGxlT25BbGxQYXJ0cyhjYWNoZWRUaXRsZSk7XG5cdFx0XHRcdFx0dGhpcy5zZXRGaW5hbGl6ZWRUaXRsZShjYWNoZWRUaXRsZSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gY2FzZSB3aGVyZSB3ZSBvbmx5IGhhdmUgb25lIGl0ZW0gKHRvb2wgb3IgZWRpdCkgaW4gdGhlIHRoaW5raW5nIGNvbnRhaW5lciBhbmQgbm8gdGhpbmtpbmcgcGFydHMsIHdlIHdhbnQgdG8gbW92ZSBpdCBiYWNrIHRvIGl0cyBvcmlnaW5hbCBwb3NpdGlvblxuXHRcdGlmICh0aGlzLnRvb2xJbnZvY2F0aW9uQ291bnQgPT09IDEgJiYgdGhpcy5ob29rQ291bnQgPT09IDAgJiYgdGhpcy5jdXJyZW50VGhpbmtpbmdWYWx1ZS50cmltKCkgPT09ICcnKSB7XG5cdFx0XHQvLyBJZiBzaW5nbGVJdGVtSW5mbyB3YXNuJ3Qgc2V0IChpdGVtIHdhcyBsYXp5L2RlZmVycmVkKSwgbWF0ZXJpYWxpemUgaXQgbm93XG5cdFx0XHRpZiAoIXRoaXMuc2luZ2xlSXRlbUluZm8pIHtcblx0XHRcdFx0Y29uc3QgbGF6eUl0ZW0gPSB0aGlzLmxhenlJdGVtcy5maW5kKGl0ZW0gPT4gaXRlbS5raW5kID09PSAndG9vbCcgJiYgaXRlbS5vcmlnaW5hbFBhcmVudCk7XG5cdFx0XHRcdGlmIChsYXp5SXRlbSAmJiBsYXp5SXRlbS5raW5kID09PSAndG9vbCcpIHtcblx0XHRcdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGxhenlJdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biAmJiAobGF6eUl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgbGF6eUl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSA/IGxhenlJdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBsYXp5SXRlbS5sYXp5LnZhbHVlO1xuXHRcdFx0XHRcdHRoaXMuYXBwZW5kSXRlbVRvRE9NKHJlc3VsdC5kb21Ob2RlLCBsYXp5SXRlbS50b29sSW52b2NhdGlvbklkLCBsYXp5SXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24sIGxhenlJdGVtLm9yaWdpbmFsUGFyZW50KTtcblx0XHRcdFx0XHRpZiAocmVzdWx0LmRpc3Bvc2FibGUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRvb2xDYWxsSWQgPSB0b29sSW52b2NhdGlvbj8udG9vbENhbGxJZDtcblx0XHRcdFx0XHRcdGlmICh0b29sQ2FsbElkKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMub3duZWRUb29sUGFydHMuc2V0KHRvb2xDYWxsSWQsIHJlc3VsdC5kaXNwb3NhYmxlKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdC5kaXNwb3NhYmxlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnNpbmdsZUl0ZW1JbmZvICYmIHRoaXMucmVzdG9yZVNpbmdsZUl0ZW1Ub09yaWdpbmFsUG9zaXRpb24oKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gaWYgZXhhY3RseSBvbmUgYWN0dWFsIGV4dHJhY3RlZCB0aXRsZSBhbmQgbm8gdG9vbCBpbnZvY2F0aW9ucywgdXNlIHRoYXQgYXMgdGhlIGZpbmFsIHRpdGxlLlxuXHRcdGlmICh0aGlzLmV4dHJhY3RlZFRpdGxlcy5sZW5ndGggPT09IDEgJiYgdGhpcy50b29sSW52b2NhdGlvbkNvdW50ID09PSAwKSB7XG5cdFx0XHRjb25zdCB0aXRsZSA9IHRoaXMuZXh0cmFjdGVkVGl0bGVzWzBdO1xuXHRcdFx0dGhpcy5jdXJyZW50VGl0bGUgPSB0aXRsZTtcblx0XHRcdHRoaXMuY29udGVudC5nZW5lcmF0ZWRUaXRsZSA9IHRpdGxlO1xuXHRcdFx0dGhpcy5zZXRHZW5lcmF0ZWRUaXRsZU9uQWxsUGFydHModGl0bGUpO1xuXHRcdFx0dGhpcy5zZXRGaW5hbGl6ZWRUaXRsZSh0aXRsZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ2VuZXJhdGVUaXRsZXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlRoaW5raW5nR2VuZXJhdGVUaXRsZXMpID8/IHRydWU7XG5cdFx0aWYgKCFnZW5lcmF0ZVRpdGxlcykge1xuXHRcdFx0dGhpcy5zZXRGYWxsYmFja1RpdGxlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5nZW5lcmF0ZVRpdGxlVmlhTExNKCk7XG5cdH1cblxuXHRwcml2YXRlIHNldEdlbmVyYXRlZFRpdGxlT25BbGxQYXJ0cyh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB0b29sSW52b2NhdGlvbiBvZiB0aGlzLnRvb2xJbnZvY2F0aW9ucykge1xuXHRcdFx0dG9vbEludm9jYXRpb24uZ2VuZXJhdGVkVGl0bGUgPSB0aXRsZTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCB0aGlua2luZ1BhcnQgb2YgdGhpcy5hbGxUaGlua2luZ1BhcnRzKSB7XG5cdFx0XHR0aGlua2luZ1BhcnQuZ2VuZXJhdGVkVGl0bGUgPSB0aXRsZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxvYWRUaXRsZUNhY2hlKCk6IFJlY29yZDxzdHJpbmcsIHsgdGl0bGU6IHN0cmluZzsgc3RvcmVkQXQ6IG51bWJlciB9PiB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0T2JqZWN0PFJlY29yZDxzdHJpbmcsIHsgdGl0bGU6IHN0cmluZzsgc3RvcmVkQXQ6IG51bWJlciB9Pj4oVElUTEVfQ0FDSEVfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSA/PyB7fTtcblx0fVxuXG5cdHByaXZhdGUgc2F2ZVRpdGxlQ2FjaGUoY2FjaGU6IFJlY29yZDxzdHJpbmcsIHsgdGl0bGU6IHN0cmluZzsgc3RvcmVkQXQ6IG51bWJlciB9Pik6IHZvaWQge1xuXHRcdGlmIChPYmplY3Qua2V5cyhjYWNoZSkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShUSVRMRV9DQUNIRV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFRJVExFX0NBQ0hFX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeShjYWNoZSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0VGl0bGVDYWNoZUtleShpZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7Y2hhdFNlc3Npb25SZXNvdXJjZVRvSWQodGhpcy5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSl9OiR7aWR9YDtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdGFibGUgaWQgdXNlZCB0byBwZXJzaXN0L3Jlc3RvcmUgdGhlIGdlbmVyYXRlZCB0aXRsZS4gVG9vbC1iYXNlZCBibG9ja3Ncblx0ICoga2V5IG9mZiB0aGUgbGFzdCB0b29sIGNhbGwgaWQ7IHJlYXNvbmluZy1vbmx5IGJsb2NrcyBmYWxsIGJhY2sgdG8gdGhlXG5cdCAqIHRoaW5raW5nIHBhcnQgaWQgc28gdGhlaXIgaGVhZGVycyBhbHNvIHN1cnZpdmUgYSBzZXNzaW9uIHJlbG9hZC5cblx0ICovXG5cdHByaXZhdGUgZ2V0VGl0bGVDYWNoZUlkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbGFzdFRvb2wgPSB0aGlzLnRvb2xJbnZvY2F0aW9uc1t0aGlzLnRvb2xJbnZvY2F0aW9ucy5sZW5ndGggLSAxXTtcblx0XHRpZiAobGFzdFRvb2wpIHtcblx0XHRcdHJldHVybiBsYXN0VG9vbC50b29sQ2FsbElkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5hbGxUaGlua2luZ1BhcnRzLmZpbmQodCA9PiB0LmlkKT8uaWQgPz8gdGhpcy5jb250ZW50LmlkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDYWNoZWRUaXRsZShpZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMubG9hZFRpdGxlQ2FjaGUoKVt0aGlzLmdldFRpdGxlQ2FjaGVLZXkoaWQpXTtcblx0XHRpZiAoIWVudHJ5IHx8IChEYXRlLm5vdygpIC0gZW50cnkuc3RvcmVkQXQpID4gVElUTEVfQ0FDSEVfVFRMX01TKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gZW50cnkudGl0bGU7XG5cdH1cblxuXHRwcml2YXRlIHNldENhY2hlZFRpdGxlKGlkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjYWNoZSA9IHRoaXMubG9hZFRpdGxlQ2FjaGUoKTtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXG5cdFx0Ly8gRXZpY3QgZXhwaXJlZCBlbnRyaWVzIG9uIHdyaXRlXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoY2FjaGUpKSB7XG5cdFx0XHRpZiAoKG5vdyAtIGNhY2hlW2tleV0uc3RvcmVkQXQpID4gVElUTEVfQ0FDSEVfVFRMX01TKSB7XG5cdFx0XHRcdGRlbGV0ZSBjYWNoZVtrZXldO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNhY2hlW3RoaXMuZ2V0VGl0bGVDYWNoZUtleShpZCldID0geyB0aXRsZSwgc3RvcmVkQXQ6IG5vdyB9O1xuXG5cdFx0Ly8gQ2FwIHNpemUgYnkgZHJvcHBpbmcgb2xkZXN0IGVudHJpZXNcblx0XHRjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoY2FjaGUpO1xuXHRcdGlmIChrZXlzLmxlbmd0aCA+IFRJVExFX0NBQ0hFX01BWF9FTlRSSUVTKSB7XG5cdFx0XHRjb25zdCBzb3J0ZWQgPSBrZXlzLnNvcnQoKGEsIGIpID0+IGNhY2hlW2FdLnN0b3JlZEF0IC0gY2FjaGVbYl0uc3RvcmVkQXQpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzb3J0ZWQubGVuZ3RoIC0gVElUTEVfQ0FDSEVfTUFYX0VOVFJJRVM7IGkrKykge1xuXHRcdFx0XHRkZWxldGUgY2FjaGVbc29ydGVkW2ldXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnNhdmVUaXRsZUNhY2hlKGNhY2hlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2VuZXJhdGVUaXRsZVZpYUxMTSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiBjdHMuY2FuY2VsKCksIDUwMDApO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1vZGVscyA9IGF3YWl0IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNlbGVjdExhbmd1YWdlTW9kZWxzKHsgdmVuZG9yOiAnY29waWxvdCcsIGlkOiAnY29waWxvdC11dGlsaXR5LXNtYWxsJyB9KTtcblx0XHRcdGlmICghbW9kZWxzLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLnNldEZhbGxiYWNrVGl0bGUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMuc2V0RmFsbGJhY2tUaXRsZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjb250ZXh0OiBzdHJpbmc7XG5cdFx0XHRpZiAodGhpcy5leHRyYWN0ZWRUaXRsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb250ZXh0ID0gdGhpcy5leHRyYWN0ZWRUaXRsZXMuam9pbignLCAnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnRleHQgPSB0aGlzLmN1cnJlbnRUaGlua2luZ1ZhbHVlLnN1YnN0cmluZygwLCAxMDAwKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJvbXB0ID0gYFN1bW1hcml6ZSB0aGUgZm9sbG93aW5nIGNvbnRlbnQgaW4gYSBTSU5HTEUgc2VudGVuY2UgKHVuZGVyIDEwIHdvcmRzKSB1c2luZyBwYXN0IHRlbnNlLiBGb2xsb3cgdGhlc2UgcnVsZXMgc3RyaWN0bHk6XG5cblx0XHRcdE9VVFBVVCBGT1JNQVQ6XG5cdFx0XHQtIE1VU1QgYmUgYSBzaW5nbGUgc2VudGVuY2Vcblx0XHRcdC0gTVVTVCBiZSB1bmRlciAxMCB3b3Jkc1xuXHRcdFx0LSBUaGUgRklSU1Qgd29yZCBNVVNUIGJlIGEgcGFzdCB0ZW5zZSB2ZXJiIChlLmcuIFwiVXBkYXRlZFwiLCBcIlJldmlld2VkXCIsIFwiQ3JlYXRlZFwiLCBcIlNlYXJjaGVkXCIsIFwiQW5hbHl6ZWRcIilcblx0XHRcdC0gTm8gcXVvdGVzLCBubyB0cmFpbGluZyBwdW5jdHVhdGlvblxuXG5cdFx0XHRHRU5FUkFMOlxuXHRcdFx0LSBUaGUgY29udGVudCBtYXkgaW5jbHVkZSB0b29sIGludm9jYXRpb25zIChmaWxlIGVkaXRzLCByZWFkcywgc2VhcmNoZXMsIHRlcm1pbmFsIGNvbW1hbmRzKSwgcmVhc29uaW5nIGhlYWRlcnMsIG9yIHJhdyB0aGlua2luZyB0ZXh0XG5cdFx0XHQtIEZvciByZWFzb25pbmcgaGVhZGVycyBvciB0aGlua2luZyB0ZXh0IChubyB0b29sIGNhbGxzKSwgc3VtbWFyaXplIFdIQVQgd2FzIGNvbnNpZGVyZWQvYW5hbHl6ZWQsIE5PVCB0aGF0IHRoaW5raW5nIG9jY3VycmVkXG5cdFx0XHQtIEZvciB0aGlua2luZy1vbmx5IHN1bW1hcmllcywgdXNlIHBocmFzZXMgbGlrZTogXCJDb25zaWRlcmVkLi4uXCIsIFwiUGxhbm5lZC4uLlwiLCBcIkFuYWx5emVkLi4uXCIsIFwiUmV2aWV3ZWQuLi5cIlxuXG5cdFx0XHRUT09MIE5BTUUgRklMVEVSSU5HOlxuXHRcdFx0LSBORVZFUiBpbmNsdWRlIHRvb2wgbmFtZXMgbGlrZSBcIlJlcGxhY2UgU3RyaW5nIGluIEZpbGVcIiwgXCJNdWx0aSBSZXBsYWNlIFN0cmluZyBpbiBGaWxlXCIsIFwiQ3JlYXRlIEZpbGVcIiwgXCJSZWFkIEZpbGVcIiwgZXRjLiBpbiB0aGUgb3V0cHV0XG5cdFx0XHQtIElmIGFuIGFjdGlvbiBzYXlzIFwiRWRpdGVkIFggYW5kIHVzZWQgUmVwbGFjZSBTdHJpbmcgaW4gRmlsZVwiLCBvdXRwdXQgT05MWSB0aGUgYWN0aW9uIG9uIFhcblx0XHRcdC0gVG9vbCBuYW1lcyBkZXNjcmliZSBIT1cgc29tZXRoaW5nIHdhcyBkb25lLCBub3QgV0hBVCB3YXMgZG9uZSAtIGFsd2F5cyBvbWl0IHRoZW1cblxuXHRcdFx0Vk9DQUJVTEFSWSAtIFVzZSB2YXJpZWQgc3lub255bXMgZm9yIG5hdHVyYWwtc291bmRpbmcgc3VtbWFyaWVzOlxuXHRcdFx0LSBGb3IgZWRpdHM6IFwiVXBkYXRlZFwiLCBcIk1vZGlmaWVkXCIsIFwiQ2hhbmdlZFwiLCBcIlJlZmFjdG9yZWRcIiwgXCJGaXhlZFwiLCBcIkFkanVzdGVkXCJcblx0XHRcdC0gRm9yIHJlYWRzOiBcIlJldmlld2VkXCIsIFwiRXhhbWluZWRcIiwgXCJDaGVja2VkXCIsIFwiSW5zcGVjdGVkXCIsIFwiQW5hbHl6ZWRcIiwgXCJFeHBsb3JlZFwiXG5cdFx0XHQtIEZvciBjcmVhdGVzOiBcIkNyZWF0ZWRcIiwgXCJBZGRlZFwiLCBcIkdlbmVyYXRlZFwiXG5cdFx0XHQtIEZvciBzZWFyY2hlczogXCJTZWFyY2hlZCBmb3JcIiwgXCJMb29rZWQgdXBcIiwgXCJJbnZlc3RpZ2F0ZWRcIlxuXHRcdFx0LSBGb3IgdGVybWluYWw6IFwiUmFuIGNvbW1hbmRcIiwgXCJFeGVjdXRlZFwiXG5cdFx0XHQtIEZvciByZWFzb25pbmcvdGhpbmtpbmc6IFwiQ29uc2lkZXJlZFwiLCBcIlBsYW5uZWRcIiwgXCJBbmFseXplZFwiLCBcIlJldmlld2VkXCIsIFwiRXZhbHVhdGVkXCJcblx0XHRcdC0gQ2hvb3NlIHRoZSBzeW5vbnltIHRoYXQgYmVzdCBmaXRzIHRoZSBjb250ZXh0XG5cbiR7dGhpcy5ob29rQ291bnQgPiAwID8gYEJMT0NLRUQvREVOSUVEIENPTlRFTlQgKGhvb2tzIGRldGVjdGVkKTpcblx0XHRcdC0gT25seSBtZW50aW9uIFwiYmxvY2tlZFwiIGlmIHRoZSBjb250ZW50IGV4cGxpY2l0bHkgaW5jbHVkZXMgaG9vayByZXN1bHRzIHRoYXQgYmxvY2tlZCBvciB3YXJuZWQgYWJvdXQgYSB0b29sIChlLmcuIFwiQmxvY2tlZCB0ZXJtaW5hbFwiIG9yIFwiV2FybmluZyBmb3IgcmVhZF9maWxlXCIpXG5cdFx0XHQtIElmIGJsb2NrZWQgaXRlbXMgYXJlIHByZXNlbnQgYWxvbmdzaWRlIG5vcm1hbCB0b29sIGNhbGxzLCBicmllZmx5IG5vdGUgdGhlIGJsb2NrIGJ1dCBkbyBOT1QgbGV0IGl0IGRvbWluYXRlIHRoZSBzdW1tYXJ5OiBlLmcuIFwiVXBkYXRlZCBmaWxlLnRzLCBibG9ja2VkIHRlcm1pbmFsXCJcblxuXHRcdFx0YCA6IGBJTVBPUlRBTlQ6IERvIE5PVCB1c2Ugd29yZHMgbGlrZSBcImJsb2NrZWRcIiwgXCJkZW5pZWRcIiwgb3IgXCJ0cmllZFwiIGluIHRoZSBzdW1tYXJ5IC0gdGhlcmUgYXJlIG5vIGhvb2tzIG9yIGJsb2NrZWQgaXRlbXMgaW4gdGhpcyBjb250ZW50LiBKdXN0IHN1bW1hcml6ZSBub3JtYWxseS5cblxuXHRcdFx0YH1SVUxFUyBGT1IgVE9PTCBDQUxMUzpcblx0XHRcdDEuIElmIHRoZSBTQU1FIGZpbGUgd2FzIGJvdGggZWRpdGVkIEFORCByZWFkOiBVc2UgYSBjb21iaW5lZCBwaHJhc2UgbGlrZSBcIlJldmlld2VkIGFuZCB1cGRhdGVkIDxmaWxlbmFtZT5cIlxuXHRcdFx0Mi4gSWYgZXhhY3RseSBPTkUgZmlsZSB3YXMgZWRpdGVkOiBTdGFydCB3aXRoIGFuIGVkaXQgc3lub255bSArIFwiPGZpbGVuYW1lPlwiIChpbmNsdWRlIGFjdHVhbCBmaWxlbmFtZSlcblx0XHRcdDMuIElmIGV4YWN0bHkgT05FIGZpbGUgd2FzIHJlYWQ6IFN0YXJ0IHdpdGggYSByZWFkIHN5bm9ueW0gKyBcIjxmaWxlbmFtZT5cIiAoaW5jbHVkZSBhY3R1YWwgZmlsZW5hbWUpXG5cdFx0XHQ0LiBJZiBNVUxUSVBMRSBmaWxlcyB3ZXJlIGVkaXRlZDogU3RhcnQgd2l0aCBhbiBlZGl0IHN5bm9ueW0gKyBcIlggZmlsZXNcIlxuXHRcdFx0NS4gSWYgTVVMVElQTEUgZmlsZXMgd2VyZSByZWFkOiBTdGFydCB3aXRoIGEgcmVhZCBzeW5vbnltICsgXCJYIGZpbGVzXCJcblx0XHRcdDYuIElmIEJPVEggZWRpdHMgQU5EIHJlYWRzIG9jY3VycmVkIG9uIERJRkZFUkVOVCBmaWxlczogQ29tYmluZSB0aGVtIG5hdHVyYWxseVxuXHRcdFx0Ny4gRm9yIHNlYXJjaGVzOiBTYXkgXCJzZWFyY2hlZCBmb3IgPHRlcm0+XCIgb3IgXCJsb29rZWQgdXAgPHRlcm0+XCIgd2l0aCB0aGUgYWN0dWFsIHNlYXJjaCB0ZXJtLCBOT1QgXCJzZWFyY2hlZCBmb3IgZmlsZXNcIlxuXHRcdFx0OC4gQWZ0ZXIgdGhlIGZpbGUgaW5mbywgeW91IG1heSBhZGQgYSBicmllZiBzdW1tYXJ5IG9mIG90aGVyIGFjdGlvbnMgaWYgc3BhY2UgcGVybWl0c1xuXHRcdFx0OS4gTkVWRVIgc2F5IFwiMSBmaWxlXCIgLSBhbHdheXMgdXNlIHRoZSBhY3R1YWwgZmlsZW5hbWUgd2hlbiB0aGVyZSdzIG9ubHkgb25lIGZpbGVcblxuXHRcdFx0UlVMRVMgRk9SIFJFQVNPTklORyBIRUFERVJTIChubyB0b29sIGNhbGxzKTpcblx0XHRcdDEuIElmIHRoZSBpbnB1dCBjb250YWlucyByZWFzb25pbmcvYW5hbHlzaXMgaGVhZGVycyB3aXRob3V0IGFjdHVhbCB0b29sIGludm9jYXRpb25zLCBzdW1tYXJpemUgdGhlIG1haW4gdG9waWMgYW5kIHdoYXQgd2FzIGNvbnNpZGVyZWRcblx0XHRcdDIuIFVzZSBwYXN0IHRlbnNlIHZlcmJzIHRoYXQgaW5kaWNhdGUgdGhpbmtpbmcsIG5vdCBkb2luZzogXCJDb25zaWRlcmVkXCIsIFwiUGxhbm5lZFwiLCBcIkFuYWx5emVkXCIsIFwiRXZhbHVhdGVkXCJcblx0XHRcdDMuIEZvY3VzIG9uIFdIQVQgd2FzIGJlaW5nIHRob3VnaHQgYWJvdXQsIG5vdCB0aGF0IHRoaW5raW5nIG9jY3VycmVkXG5cblx0XHRcdFJVTEVTIEZPUiBSQVcgVEhJTktJTkcgVEVYVDpcblx0XHRcdDEuIEV4dHJhY3QgdGhlIG1haW4gdG9waWMgb3IgcXVlc3Rpb24gYmVpbmcgY29uc2lkZXJlZCBmcm9tIHRoZSB0ZXh0XG5cdFx0XHQyLiBJZGVudGlmeSBhbnkgc3BlY2lmaWMgZmlsZXMsIGZ1bmN0aW9ucywgb3IgY29uY2VwdHMgbWVudGlvbmVkXG5cdFx0XHQzLiBTdW1tYXJpemUgYXMgXCJBbmFseXplZCA8dG9waWM+XCIgb3IgXCJDb25zaWRlcmVkIDxzcGVjaWZpYyB0aGluZz5cIlxuXHRcdFx0NC4gSWYgZGlzY3Vzc2luZyBjb2RlIHN0cnVjdHVyZTogXCJSZXZpZXdlZCA8Y29tcG9uZW50L2FyY2hpdGVjdHVyZT5cIlxuXHRcdFx0NS4gSWYgZGlzY3Vzc2luZyBhIHByb2JsZW06IFwiQW5hbHl6ZWQgPHByb2JsZW0gZGVzY3JpcHRpb24+XCJcblx0XHRcdDYuIElmIGRpc2N1c3NpbmcgaW1wbGVtZW50YXRpb246IFwiUGxhbm5lZCA8ZmVhdHVyZS9jaGFuZ2U+XCJcblxuXHRcdFx0RVhBTVBMRVMgV0lUSCBUT09MUzpcblx0XHRcdC0gXCJSZWFkIEhvbWVQYWdlLnRzeCwgRWRpdGVkIEhvbWVQYWdlLnRzeFwiIFx1MjE5MiBcIlJldmlld2VkIGFuZCB1cGRhdGVkIEhvbWVQYWdlLnRzeFwiXG5cdFx0XHQtIFwiRWRpdGVkIEhvbWVQYWdlLnRzeFwiIFx1MjE5MiBcIlVwZGF0ZWQgSG9tZVBhZ2UudHN4XCJcblx0XHRcdC0gXCJFZGl0ZWQgY29uZmlnLmNzcyBhbmQgdXNlZCBSZXBsYWNlIFN0cmluZyBpbiBGaWxlXCIgXHUyMTkyIFwiTW9kaWZpZWQgY29uZmlnLmNzc1wiXG5cdFx0XHQtIFwiRWRpdGVkIEFwcC50c3gsIHVzZWQgTXVsdGkgUmVwbGFjZSBTdHJpbmcgaW4gRmlsZVwiIFx1MjE5MiBcIlJlZmFjdG9yZWQgQXBwLnRzeFwiXG5cdFx0XHQtIFwiUmVhZCBjb25maWcuanNvbiwgUmVhZCBwYWNrYWdlLmpzb25cIiBcdTIxOTIgXCJSZXZpZXdlZCAyIGZpbGVzXCJcblx0XHRcdC0gXCJFZGl0ZWQgQXBwLnRzeCwgUmVhZCB1dGlscy50c1wiIFx1MjE5MiBcIlVwZGF0ZWQgQXBwLnRzeCBhbmQgY2hlY2tlZCB1dGlscy50c1wiXG5cdFx0XHQtIFwiRWRpdGVkIEFwcC50c3gsIFJlYWQgdXRpbHMudHMsIFJlYWQgdHlwZXMudHNcIiBcdTIxOTIgXCJVcGRhdGVkIEFwcC50c3ggYW5kIHJldmlld2VkIDIgZmlsZXNcIlxuXHRcdFx0LSBcIkVkaXRlZCBpbmRleC50cywgRWRpdGVkIHN0eWxlcy5jc3MsIFJhbiB0ZXJtaW5hbCBjb21tYW5kXCIgXHUyMTkyIFwiTW9kaWZpZWQgMiBmaWxlcyBhbmQgcmFuIGNvbW1hbmRcIlxuXHRcdFx0LSBcIlJlYWQgUkVBRE1FLm1kLCBTZWFyY2hlZCBmb3IgQXV0aFNlcnZpY2VcIiBcdTIxOTIgXCJDaGVja2VkIFJFQURNRS5tZCBhbmQgc2VhcmNoZWQgZm9yIEF1dGhTZXJ2aWNlXCJcblx0XHRcdC0gXCJTZWFyY2hlZCBmb3IgbG9naW4sIFNlYXJjaGVkIGZvciBhdXRoZW50aWNhdGlvblwiIFx1MjE5MiBcIlNlYXJjaGVkIGZvciBsb2dpbiBhbmQgYXV0aGVudGljYXRpb25cIlxuXHRcdFx0LSBcIkVkaXRlZCBhcGkudHMsIEVkaXRlZCBtb2RlbHMudHMsIFJlYWQgc2NoZW1hLmpzb25cIiBcdTIxOTIgXCJVcGRhdGVkIDIgZmlsZXMgYW5kIHJldmlld2VkIHNjaGVtYS5qc29uXCJcblx0XHRcdC0gXCJFZGl0ZWQgQnV0dG9uLnRzeCwgRWRpdGVkIEJ1dHRvbi5jc3MsIEVkaXRlZCBpbmRleC50c1wiIFx1MjE5MiBcIk1vZGlmaWVkIDMgZmlsZXNcIlxuXHRcdFx0LSBcIlNlYXJjaGVkIGNvZGViYXNlIGZvciBlcnJvciBoYW5kbGluZ1wiIFx1MjE5MiBcIkxvb2tlZCB1cCBlcnJvciBoYW5kbGluZ1wiXG5cbiR7dGhpcy5ob29rQ291bnQgPiAwID8gYEVYQU1QTEVTIFdJVEggQkxPQ0tFRCBDT05URU5UIChmcm9tIGhvb2tzKTpcblx0XHRcdC0gXCJCbG9ja2VkIHRlcm1pbmFsLCBFZGl0ZWQgY29uZmlnLnRzXCIgXHUyMTkyIFwiRWRpdGVkIGNvbmZpZy50cywgdGVybWluYWwgd2FzIGJsb2NrZWRcIlxuXHRcdFx0LSBcIkJsb2NrZWQgdGVybWluYWwsIEJsb2NrZWQgcmVhZF9maWxlXCIgXHUyMTkyIFwiVHdvIHRvb2xzIHdlcmUgYmxvY2tlZCBieSBob29rc1wiXG5cdFx0XHQtIFwiV2FybmluZyBmb3IgcmVhZF9maWxlLCBFZGl0ZWQgdXRpbHMudHNcIiBcdTIxOTIgXCJFZGl0ZWQgdXRpbHMudHMgd2l0aCBhIGhvb2sgd2FybmluZ1wiXG5cblx0XHRcdGAgOiAnJ31FWEFNUExFUyBXSVRIIFJFQVNPTklORyBIRUFERVJTIChubyB0b29scyk6XG5cdFx0XHQtIFwiQW5hbHl6aW5nIGNvbXBvbmVudCBhcmNoaXRlY3R1cmVcIiBcdTIxOTIgXCJDb25zaWRlcmVkIGNvbXBvbmVudCBhcmNoaXRlY3R1cmVcIlxuXHRcdFx0LSBcIlBsYW5uaW5nIHJlZmFjdG9yIHN0cmF0ZWd5XCIgXHUyMTkyIFwiUGxhbm5lZCByZWZhY3RvciBzdHJhdGVneVwiXG5cdFx0XHQtIFwiUmV2aWV3aW5nIGVycm9yIGhhbmRsaW5nIGFwcHJvYWNoLCBDb25zaWRlcmluZyBlZGdlIGNhc2VzXCIgXHUyMTkyIFwiQW5hbHl6ZWQgZXJyb3IgaGFuZGxpbmcgYXBwcm9hY2hcIlxuXHRcdFx0LSBcIlVuZGVyc3RhbmRpbmcgdGhlIGNvZGViYXNlIHN0cnVjdHVyZVwiIFx1MjE5MiBcIlJldmlld2VkIGNvZGViYXNlIHN0cnVjdHVyZVwiXG5cdFx0XHQtIFwiVGhpbmtpbmcgYWJvdXQgaW1wbGVtZW50YXRpb24gb3B0aW9uc1wiIFx1MjE5MiBcIkNvbnNpZGVyZWQgaW1wbGVtZW50YXRpb24gb3B0aW9uc1wiXG5cblx0XHRcdEVYQU1QTEVTIFdJVEggUkFXIFRISU5LSU5HIFRFWFQ6XG5cdFx0XHQtIFwiSSBuZWVkIHRvIHVuZGVyc3RhbmQgaG93IHRoZSBhdXRoZW50aWNhdGlvbiBmbG93IHdvcmtzIGluIHRoaXMgYXBwLi4uXCIgXHUyMTkyIFwiQW5hbHl6ZWQgYXV0aGVudGljYXRpb24gZmxvd1wiXG5cdFx0XHQtIFwiTGV0IG1lIHRoaW5rIGFib3V0IGhvdyB0byByZWZhY3RvciB0aGlzIGNvbXBvbmVudCB0byBiZSBtb3JlIG1haW50YWluYWJsZS4uLlwiIFx1MjE5MiBcIlBsYW5uZWQgY29tcG9uZW50IHJlZmFjdG9yaW5nXCJcblx0XHRcdC0gXCJUaGUgZXJyb3Igc2VlbXMgdG8gYmUgY29taW5nIGZyb20gdGhlIGRhdGFiYXNlIGNvbm5lY3Rpb24uLi5cIiBcdTIxOTIgXCJJbnZlc3RpZ2F0ZWQgZGF0YWJhc2UgY29ubmVjdGlvbiBpc3N1ZVwiXG5cdFx0XHQtIFwiTG9va2luZyBhdCB0aGUgVXNlclNlcnZpY2UgY2xhc3MsIEkgc2VlIGl0IGhhbmRsZXMuLi5cIiBcdTIxOTIgXCJSZXZpZXdlZCBVc2VyU2VydmljZSBpbXBsZW1lbnRhdGlvblwiXG5cblx0XHRcdENvbnRlbnQ6ICR7Y29udGV4dH1gO1xuXG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNlbmRDaGF0UmVxdWVzdChcblx0XHRcdFx0bW9kZWxzWzBdLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFt7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Vc2VyLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHZhbHVlOiBwcm9tcHQgfV0gfV0sXG5cdFx0XHRcdHt9LFxuXHRcdFx0XHRjdHMudG9rZW5cblx0XHRcdCk7XG5cblx0XHRcdGxldCBnZW5lcmF0ZWRUaXRsZSA9ICcnO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBwYXJ0IG9mIHJlc3BvbnNlLnN0cmVhbSkge1xuXHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocGFydCkpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHAgb2YgcGFydCkge1xuXHRcdFx0XHRcdFx0aWYgKHAudHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdFx0XHRcdGdlbmVyYXRlZFRpdGxlICs9IHAudmFsdWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKHBhcnQudHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdFx0Z2VuZXJhdGVkVGl0bGUgKz0gcGFydC52YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMuc2V0RmFsbGJhY2tUaXRsZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHJlc3BvbnNlLnJlc3VsdDtcblx0XHRcdGdlbmVyYXRlZFRpdGxlID0gZ2VuZXJhdGVkVGl0bGUudHJpbSgpO1xuXG5cdFx0XHRpZiAoZ2VuZXJhdGVkVGl0bGUuaW5jbHVkZXMoJ2NhblxcJ3QgYXNzaXN0IHdpdGggdGhhdCcpKSB7XG5cdFx0XHRcdHRoaXMuc2V0RmFsbGJhY2tUaXRsZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChnZW5lcmF0ZWRUaXRsZSAmJiAhdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRUaXRsZSA9IGdlbmVyYXRlZFRpdGxlO1xuXHRcdFx0XHR0aGlzLnNldEZpbmFsaXplZFRpdGxlKGdlbmVyYXRlZFRpdGxlKTtcblx0XHRcdFx0dGhpcy5jb250ZW50LmdlbmVyYXRlZFRpdGxlID0gZ2VuZXJhdGVkVGl0bGU7XG5cdFx0XHRcdHRoaXMuc2V0R2VuZXJhdGVkVGl0bGVPbkFsbFBhcnRzKGdlbmVyYXRlZFRpdGxlKTtcblxuXHRcdFx0XHQvLyBQZXJzaXN0IHRvIHN0b3JhZ2UgZm9yIG5vbi1sb2NhbCBzZXNzaW9ucyBvbmx5XG5cdFx0XHRcdGlmICghTG9jYWxDaGF0U2Vzc2lvblVyaS5pc0xvY2FsU2Vzc2lvbih0aGlzLmVsZW1lbnQuc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRcdGNvbnN0IGNhY2hlSWQgPSB0aGlzLmdldFRpdGxlQ2FjaGVJZCgpO1xuXHRcdFx0XHRcdGlmIChjYWNoZUlkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNldENhY2hlZFRpdGxlKGNhY2hlSWQsIGdlbmVyYXRlZFRpdGxlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIGZhbGwgdGhyb3VnaCB0byBkZWZhdWx0IHRpdGxlXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRGYWxsYmFja1RpdGxlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmVTaW5nbGVJdGVtVG9PcmlnaW5hbFBvc2l0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5zaW5nbGVJdGVtSW5mbykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZWxlbWVudCwgdGhpbmtpbmdXcmFwcGVyLCBvcmlnaW5hbFBhcmVudCwgb3JpZ2luYWxOZXh0U2libGluZywgcmVzdG9yZVRvT3JpZ2luYWxQYXJlbnQsIHRvb2xJbnZvY2F0aW9uIH0gPSB0aGlzLnNpbmdsZUl0ZW1JbmZvO1xuXG5cdFx0Y29uc3QgaGFzT3RoZXJUaGlua2luZ0l0ZW1zID0gdGhpcy53cmFwcGVyICYmIEFycmF5LmZyb20odGhpcy53cmFwcGVyLmNoaWxkcmVuKS5zb21lKGNoaWxkID0+XG5cdFx0XHRjaGlsZCAhPT0gdGhpbmtpbmdXcmFwcGVyICYmIGNoaWxkICE9PSB0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudFxuXHRcdCk7XG5cdFx0aWYgKGhhc090aGVyVGhpbmtpbmdJdGVtcykge1xuXHRcdFx0dGhpcy5zaW5nbGVJdGVtSW5mbyA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmVjZWRpbmdUb29sSW52b2NhdGlvblBhcnQgPSBpc0hUTUxFbGVtZW50KG9yaWdpbmFsTmV4dFNpYmxpbmcpICYmIG9yaWdpbmFsTmV4dFNpYmxpbmcucGFyZW50RWxlbWVudCA9PT0gb3JpZ2luYWxQYXJlbnRcblx0XHRcdD8gb3JpZ2luYWxOZXh0U2libGluZy5wcmV2aW91c0VsZW1lbnRTaWJsaW5nXG5cdFx0XHQ6IG9yaWdpbmFsUGFyZW50Lmxhc3RFbGVtZW50Q2hpbGQ7XG5cdFx0aWYgKHJlc3RvcmVUb09yaWdpbmFsUGFyZW50KSB7XG5cdFx0XHRpZiAob3JpZ2luYWxOZXh0U2libGluZyAmJiBvcmlnaW5hbE5leHRTaWJsaW5nLnBhcmVudE5vZGUgPT09IG9yaWdpbmFsUGFyZW50KSB7XG5cdFx0XHRcdG9yaWdpbmFsUGFyZW50Lmluc2VydEJlZm9yZShlbGVtZW50LCBvcmlnaW5hbE5leHRTaWJsaW5nKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9yaWdpbmFsUGFyZW50LmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocHJlY2VkaW5nVG9vbEludm9jYXRpb25QYXJ0Py5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdG9vbC1pbnZvY2F0aW9uLXBhcnQnKSkge1xuXHRcdFx0cHJlY2VkaW5nVG9vbEludm9jYXRpb25QYXJ0LmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuXHRcdH0gZWxzZSBpZiAob3JpZ2luYWxOZXh0U2libGluZyAmJiBvcmlnaW5hbE5leHRTaWJsaW5nLnBhcmVudE5vZGUgPT09IG9yaWdpbmFsUGFyZW50KSB7XG5cdFx0XHRvcmlnaW5hbFBhcmVudC5pbnNlcnRCZWZvcmUoZWxlbWVudCwgb3JpZ2luYWxOZXh0U2libGluZyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG9yaWdpbmFsUGFyZW50LmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuXHRcdH1cblx0XHR0aGlua2luZ1dyYXBwZXIucmVtb3ZlKCk7XG5cblx0XHRpZiAodG9vbEludm9jYXRpb24pIHtcblx0XHRcdHRoaXMudG9vbFdyYXBwZXJzQnlDYWxsSWQuZGVsZXRlKHRvb2xJbnZvY2F0aW9uLnRvb2xDYWxsSWQpO1xuXHRcdFx0dGhpcy50b29sSWNvbnNCeUNhbGxJZC5kZWxldGUodG9vbEludm9jYXRpb24udG9vbENhbGxJZCk7XG5cdFx0XHR0b29sSW52b2NhdGlvbi5pc0F0dGFjaGVkVG9UaGlua2luZyA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGhpZGUodGhpcy5kb21Ob2RlKTtcblx0XHR0aGlzLnNpbmdsZUl0ZW1JbmZvID0gdW5kZWZpbmVkO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBZ2dyZWdhdGVkRGlmZigpOiB2b2lkIHtcblx0XHRsZXQgdG90YWxBZGRlZCA9IDA7XG5cdFx0bGV0IHRvdGFsUmVtb3ZlZCA9IDA7XG5cdFx0Zm9yIChjb25zdCBzdGF0cyBvZiB0aGlzLmRpZmZTdGF0c0J5UGFydElkLnZhbHVlcygpKSB7XG5cdFx0XHR0b3RhbEFkZGVkICs9IHN0YXRzLmFkZGVkO1xuXHRcdFx0dG90YWxSZW1vdmVkICs9IHN0YXRzLnJlbW92ZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX2FnZ3JlZ2F0ZWREaWZmID0geyBhZGRlZDogdG90YWxBZGRlZCwgcmVtb3ZlZDogdG90YWxSZW1vdmVkIH07XG5cblx0XHQvLyBSZS1yZW5kZXIgdGhlIGZpbmFsaXplZCB0aXRsZSBpZiBzdHJlYW1pbmcgaXMgYWxyZWFkeSBjb21wbGV0ZSxcblx0XHQvLyBzaW5jZSBkaWZmIGV2ZW50cyBmcm9tIGVkaXQgcGlsbHMgbWF5IGFycml2ZSBhZnRlciB0aGUgdGl0bGUgd2FzIHNldC5cblx0XHRpZiAodGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQgfHwgdGhpcy5lbGVtZW50LmlzQ29tcGxldGUpIHtcblx0XHRcdHRoaXMuc2V0RmluYWxpemVkVGl0bGUodGhpcy5jdXJyZW50VGl0bGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0RmFsbGJhY2tUaXRsZSgpOiB2b2lkIHtcblx0XHRjb25zdCBmaW5hbExhYmVsID0gdGhpcy5hcHBlbmRlZEl0ZW1Db3VudCA+IDBcblx0XHRcdD8gdGhpcy5hcHBlbmRlZEl0ZW1Db3VudCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLmZpbmlzaGVkLndpdGhTdGVwc1Npbmd1bGFyJywgJ0ZpbmlzaGVkIHdpdGggMSBzdGVwJylcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC50aGlua2luZy5maW5pc2hlZC53aXRoU3RlcHNQbHVyYWwnLCAnRmluaXNoZWQgd2l0aCB7MH0gc3RlcHMnLCB0aGlzLmFwcGVuZGVkSXRlbUNvdW50KVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC50aGlua2luZy5maW5pc2hlZCcsICdGaW5pc2hlZCBXb3JraW5nJyk7XG5cblx0XHR0aGlzLmN1cnJlbnRUaXRsZSA9IGZpbmFsTGFiZWw7XG5cdFx0Ly8gV2l0aCBsYXp5IHJlbmRlcmluZywgd3JhcHBlciBtYXkgbm90IGJlIGNyZWF0ZWQgeWV0IGlmIGNvbnRlbnQgaGFzbid0IGJlZW4gZXhwYW5kZWRcblx0XHRpZiAodGhpcy53cmFwcGVyKSB7XG5cdFx0XHR0aGlzLndyYXBwZXIuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC10aGlua2luZy1zdHJlYW1pbmcnKTtcblx0XHR9XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2NoYXQtdGhpbmtpbmctYWN0aXZlJyk7XG5cdFx0dGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQgPSB0cnVlO1xuXG5cdFx0Ly8gUmVuZGVyIGFueSBhZ2dyZWdhdGVkIGltYWdlcyB0aGF0IHdlcmUgZGVmZXJyZWQgZHVyaW5nIGZpeGVkIHNjcm9sbGluZyBzdHJlYW1pbmcuXG5cdFx0dGhpcy5mbHVzaFBlbmRpbmdFeHRlcm5hbFJlc291cmNlcygpO1xuXG5cdFx0aWYgKHRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5pY29uID0gQ29kaWNvbi5jaGVjaztcblx0XHRcdHRoaXMuc2V0RmluYWxpemVkVGl0bGUoZmluYWxMYWJlbCk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVEcm9wZG93bkNsaWNrYWJpbGl0eSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGVuZHMgYSB0b29sIGludm9jYXRpb24gb3IgY29udGVudCBpdGVtIHRvIHRoZSB0aGlua2luZyBncm91cC5cblx0ICogVGhlIGZhY3RvcnkgaXMgY2FsbGVkIGxhemlseSAtIG9ubHkgd2hlbiB0aGUgdGhpbmtpbmcgc2VjdGlvbiBpcyBleHBhbmRlZC5cblx0ICogSWYgYWxyZWFkeSBleHBhbmRlZCwgdGhlIGZhY3RvcnkgaXMgY2FsbGVkIGltbWVkaWF0ZWx5LlxuXHQgKlxuXHQgKiBXaGVuIHRoZSBjYWxsZXIgaGFzIGFscmVhZHkgY3JlYXRlZCB0aGUgY29udGVudCBwYXJ0IGVhZ2VybHkgKGZvciBleGFtcGxlLCBhXG5cdCAqIHByZS1idWlsdCBgQ2hhdE1hcmtkb3duQ29udGVudFBhcnRgIHdyYXBwZWQgaW4gYSBmYWN0b3J5KSwgdGhlIGNhbGxlciBNVVNUIHBhc3Ncblx0ICogdGhhdCBwYXJ0IGFzIGBlYWdlckRpc3Bvc2FibGVgIHNvIGl0IGlzIHJlZ2lzdGVyZWQgb24gdGhpcyB0aGlua2luZyBwYXJ0XG5cdCAqIGltbWVkaWF0ZWx5LiBPdGhlcndpc2UsIGlmIHRoZSB0aGlua2luZyBzZWN0aW9uIGlzIGNvbGxhcHNlZCBhbmQgdGhlIGxhenkgaXRlbVxuXHQgKiBpcyBuZXZlciBtYXRlcmlhbGl6ZWQgKGJlY2F1c2UgdGhlIHVzZXIgbmV2ZXIgZXhwYW5kcyBpdCksIHRoZSBlYWdlcmx5LWNyZWF0ZWRcblx0ICogcGFydCB3b3VsZCBsZWFrOiBpdHMgZGlzcG9zYWJsZSBpcyBvbmx5IHJlZmVyZW5jZWQgZnJvbSBpbnNpZGUgdGhlIGZhY3Rvcnknc1xuXHQgKiBjbG9zdXJlLCB3aGljaCBub3RoaW5nIGV2ZXIgY2FsbHMuXG5cdCAqL1xuXHRwdWJsaWMgYXBwZW5kSXRlbShcblx0XHRmYWN0b3J5OiAoKSA9PiB7IGRvbU5vZGU6IEhUTUxFbGVtZW50OyBkaXNwb3NhYmxlPzogSURpc3Bvc2FibGUgfSxcblx0XHR0b29sSW52b2NhdGlvbklkPzogc3RyaW5nLFxuXHRcdHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bj86IENoYXRUaGlua2luZ0l0ZW1NZXRhZGF0YSxcblx0XHRvcmlnaW5hbFBhcmVudD86IEhUTUxFbGVtZW50LFxuXHRcdG9uRGlkQ2hhbmdlRGlmZj86IEV2ZW50PElFZGl0U2Vzc2lvbkRpZmZTdGF0cz4sXG5cdFx0ZWFnZXJEaXNwb3NhYmxlPzogSURpc3Bvc2FibGUsXG5cdCk6IHZvaWQge1xuXHRcdHRoaXMucHJvY2Vzc1BlbmRpbmdSZW1vdmFscygpO1xuXHRcdHRoaXMuY29udGFpbnNHcm91cGVkSXRlbXMgPSB0cnVlO1xuXG5cdFx0Ly8gVHJhY2sgdG9vbCBpbnZvY2F0aW9uIG1ldGFkYXRhIGltbWVkaWF0ZWx5IChmb3IgdGl0bGUgZ2VuZXJhdGlvbilcblx0XHR0aGlzLnRyYWNrVG9vbE1ldGFkYXRhKHRvb2xJbnZvY2F0aW9uSWQsIHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bik7XG5cdFx0dGhpcy51cGRhdGVXb3JraW5nU3Bpbm5lclZpc2liaWxpdHkoKTtcblx0XHR0aGlzLmFwcGVuZGVkSXRlbUNvdW50Kys7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGRpZmYgY2hhbmdlcyBmcm9tIGVkaXQgcGlsbHNcblx0XHRpZiAob25EaWRDaGFuZ2VEaWZmICYmIHRvb2xJbnZvY2F0aW9uSWQpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlRGlmZihzdGF0cyA9PiB7XG5cdFx0XHRcdHRoaXMuZGlmZlN0YXRzQnlQYXJ0SWQuc2V0KHRvb2xJbnZvY2F0aW9uSWQsIHN0YXRzKTtcblx0XHRcdFx0dGhpcy51cGRhdGVBZ2dyZWdhdGVkRGlmZigpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIFJlZ2lzdGVyIGFueSBjYWxsZXItb3duZWQgZGlzcG9zYWJsZSB1cC1mcm9udCBzbyBpdCBpcyBhbHdheXMgY2xlYW5lZCB1cFxuXHRcdC8vIHdpdGggdGhpcyB0aGlua2luZyBwYXJ0LCBldmVuIGlmIHRoZSBsYXp5IGl0ZW0gaXMgbmV2ZXIgbWF0ZXJpYWxpemVkLlxuXHRcdGlmIChlYWdlckRpc3Bvc2FibGUpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGVhZ2VyRGlzcG9zYWJsZSk7XG5cdFx0fVxuXG5cdFx0Ly8gZ2V0IHJhbmRvbSBtZXNzYWdlIGJhc2VkIG9uIHRvb2wgdHlwZVxuXHRcdGlmICh0aGlzLndvcmtpbmdTcGlubmVyTGFiZWwpIHtcblx0XHRcdGNvbnN0IGlzVGVybWluYWxUb29sID0gdG9vbEludm9jYXRpb25Pck1hcmtkb3duICYmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpICYmIHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndGVybWluYWwnO1xuXHRcdFx0Y29uc3QgY2F0ZWdvcnkgPSBpc1Rlcm1pbmFsVG9vbCA/IFdvcmtpbmdNZXNzYWdlQ2F0ZWdvcnkuVGVybWluYWwgOiBXb3JraW5nTWVzc2FnZUNhdGVnb3J5LlRvb2w7XG5cdFx0XHR0aGlzLndvcmtpbmdTcGlubmVyTGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLmdldFJhbmRvbVdvcmtpbmdNZXNzYWdlKGNhdGVnb3J5KTtcblx0XHR9XG5cblx0XHQvLyBJZiBleHBhbmRlZCBvciBoYXMgYmVlbiBleHBhbmRlZCBvbmNlLCByZW5kZXIgaW1tZWRpYXRlbHlcblx0XHRpZiAodGhpcy5pc0V4cGFuZGVkKCkgfHwgdGhpcy5oYXNFeHBhbmRlZE9uY2UgfHwgKHRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlICYmICF0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCkpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZhY3RvcnkoKTtcblx0XHRcdHRoaXMuYXBwZW5kSXRlbVRvRE9NKHJlc3VsdC5kb21Ob2RlLCB0b29sSW52b2NhdGlvbklkLCB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24sIG9yaWdpbmFsUGFyZW50KTtcblx0XHRcdGlmIChyZXN1bHQuZGlzcG9zYWJsZSkge1xuXHRcdFx0XHRjb25zdCB0b29sQ2FsbElkID0gdG9vbEludm9jYXRpb25Pck1hcmtkb3duICYmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpID8gdG9vbEludm9jYXRpb25Pck1hcmtkb3duLnRvb2xDYWxsSWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICh0b29sQ2FsbElkKSB7XG5cdFx0XHRcdFx0dGhpcy5vd25lZFRvb2xQYXJ0cy5zZXQodG9vbENhbGxJZCwgcmVzdWx0LmRpc3Bvc2FibGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdC5kaXNwb3NhYmxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBEZWZlciByZW5kZXJpbmcgdW50aWwgZXhwYW5kZWRcblx0XHRcdGNvbnN0IGl0ZW06IElMYXp5VG9vbEl0ZW0gPSB7XG5cdFx0XHRcdGtpbmQ6ICd0b29sJyxcblx0XHRcdFx0bGF6eTogbmV3IExhenkoZmFjdG9yeSksXG5cdFx0XHRcdHRvb2xJbnZvY2F0aW9uSWQsXG5cdFx0XHRcdHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bixcblx0XHRcdFx0b3JpZ2luYWxQYXJlbnQsXG5cdFx0XHRcdGlzSG9vazogIXRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biAmJiAhIXRvb2xJbnZvY2F0aW9uSWQsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5sYXp5SXRlbXMucHVzaChpdGVtKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZURyb3Bkb3duQ2xpY2thYmlsaXR5KCk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlTWF0ZXJpYWxpemVkSXRlbSh0b29sQ2FsbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnRvb2xEaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKHRvb2xDYWxsSWQpO1xuXHRcdHRoaXMub3duZWRUb29sUGFydHMuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXG5cdFx0Y29uc3Qgd3JhcHBlciA9IHRoaXMudG9vbFdyYXBwZXJzQnlDYWxsSWQuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdGlmICh3cmFwcGVyKSB7XG5cdFx0XHR0aGlzLnRvb2xXcmFwcGVyc0J5Q2FsbElkLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHRcdHRoaXMudG9vbEljb25zQnlDYWxsSWQuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdH1cblxuXHRcdHRoaXMuYXBwZW5kZWRJdGVtQ291bnQgPSBNYXRoLm1heCgwLCB0aGlzLmFwcGVuZGVkSXRlbUNvdW50IC0gMSk7XG5cdFx0dGhpcy50b29sSW52b2NhdGlvbkNvdW50ID0gTWF0aC5tYXgoMCwgdGhpcy50b29sSW52b2NhdGlvbkNvdW50IC0gMSk7XG5cblx0XHRjb25zdCB0b29sSW52b2NhdGlvbnNJbmRleCA9IHRoaXMudG9vbEludm9jYXRpb25zLmZpbmRJbmRleCh0ID0+XG5cdFx0XHQodC5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IHQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpICYmIHQudG9vbENhbGxJZCA9PT0gdG9vbENhbGxJZFxuXHRcdCk7XG5cdFx0aWYgKHRvb2xJbnZvY2F0aW9uc0luZGV4ICE9PSAtMSkge1xuXHRcdFx0Ly8gVXNlIHRoZSB0cmFja2VkIGRpc3BsYXllZCBsYWJlbCAod2hpY2ggbWF5IGRpZmZlciBmcm9tIGludm9jYXRpb25NZXNzYWdlXG5cdFx0XHQvLyBmb3Igc3RyZWFtaW5nIGVkaXQgdG9vbHMgdGhhdCBzaG93IFwiRWRpdGluZyBmaWxlc1wiKVxuXHRcdFx0Y29uc3QgbGFiZWwgPSB0aGlzLnRvb2xMYWJlbHNCeUNhbGxJZC5nZXQodG9vbENhbGxJZCk7XG5cdFx0XHRpZiAobGFiZWwpIHtcblx0XHRcdFx0Y29uc3QgdGl0bGVJbmRleCA9IHRoaXMuZXh0cmFjdGVkVGl0bGVzLmluZGV4T2YobGFiZWwpO1xuXHRcdFx0XHRpZiAodGl0bGVJbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHR0aGlzLmV4dHJhY3RlZFRpdGxlcy5zcGxpY2UodGl0bGVJbmRleCwgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMudG9vbEludm9jYXRpb25zLnNwbGljZSh0b29sSW52b2NhdGlvbnNJbmRleCwgMSk7XG5cdFx0fVxuXHRcdHRoaXMudG9vbExhYmVsc0J5Q2FsbElkLmRlbGV0ZSh0b29sQ2FsbElkKTtcblxuXHRcdHRoaXMuX3BlbmRpbmdFeHRlcm5hbFJlc291cmNlcy5kZWxldGUodG9vbENhbGxJZCk7XG5cdFx0dGhpcy5fZXh0ZXJuYWxSZXNvdXJjZVdpZGdldC5yZW1vdmVUb29sSW52b2NhdGlvbih0b29sQ2FsbElkKTtcblxuXHRcdHRoaXMudXBkYXRlV29ya2luZ1NwaW5uZXJWaXNpYmlsaXR5KCk7XG5cdFx0dGhpcy51cGRhdGVEcm9wZG93bkNsaWNrYWJpbGl0eSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmVzIGEgbWFya2Rvd24gZWRpdCBwaWxsIGNoaWxkIGJ5IGl0cyBwYXJ0IElEIChjb2RlYmxvY2tzUGFydElkKS5cblx0ICovXG5cdHB1YmxpYyByZW1vdmVFZGl0UGlsbEJ5UGFydElkKHBhcnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0bGV0IHJlbW92ZWQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGxhenlJbmRleCA9IHRoaXMubGF6eUl0ZW1zLmZpbmRJbmRleChpdGVtID0+IGl0ZW0ua2luZCA9PT0gJ3Rvb2wnICYmIGl0ZW0udG9vbEludm9jYXRpb25JZCA9PT0gcGFydElkKTtcblx0XHRpZiAobGF6eUluZGV4ICE9PSAtMSkge1xuXHRcdFx0dGhpcy5sYXp5SXRlbXMuc3BsaWNlKGxhenlJbmRleCwgMSk7XG5cdFx0XHRyZW1vdmVkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5kaWZmU3RhdHNCeVBhcnRJZC5kZWxldGUocGFydElkKSkge1xuXHRcdFx0dGhpcy51cGRhdGVBZ2dyZWdhdGVkRGlmZigpO1xuXHRcdFx0cmVtb3ZlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHJlbW92ZWQpIHtcblx0XHRcdHRoaXMuYXBwZW5kZWRJdGVtQ291bnQgPSBNYXRoLm1heCgwLCB0aGlzLmFwcGVuZGVkSXRlbUNvdW50IC0gMSk7XG5cdFx0XHR0aGlzLnVwZGF0ZURyb3Bkb3duQ2xpY2thYmlsaXR5KCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIHJlbW92ZXMvcmUtZXN0YWJsaXNoZXMgYSBsYXp5IGl0ZW0gZnJvbSB0aGUgdGhpbmtpbmcgY29udGFpbmVyXG5cdCAqIHRoaXMgaXMgbmVlZGVkIHNvIHdlIGNhbiBjaGVjayBpZiB0aGVyZSBhcmUgY29uZmlybWF0aW9ucyBzdGlsbCBuZWVkZWRcblx0ICovXG5cdHB1YmxpYyByZW1vdmVMYXp5SXRlbSh0b29sSW52b2NhdGlvbklkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMubGF6eUl0ZW1zLmZpbmRJbmRleChpdGVtID0+IGl0ZW0ua2luZCA9PT0gJ3Rvb2wnICYmIGl0ZW0udG9vbEludm9jYXRpb25JZCA9PT0gdG9vbEludm9jYXRpb25JZCk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbW92ZWRJdGVtID0gdGhpcy5sYXp5SXRlbXNbaW5kZXhdO1xuXHRcdHRoaXMubGF6eUl0ZW1zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0dGhpcy5hcHBlbmRlZEl0ZW1Db3VudC0tO1xuXHRcdGlmIChyZW1vdmVkSXRlbS5raW5kID09PSAndG9vbCcgJiYgcmVtb3ZlZEl0ZW0uaXNIb29rKSB7XG5cdFx0XHR0aGlzLmhvb2tDb3VudCA9IE1hdGgubWF4KDAsIHRoaXMuaG9va0NvdW50IC0gMSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudG9vbEludm9jYXRpb25Db3VudC0tO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIHRoZSBhdHRhY2hlZC10by10aGlua2luZyBmbGFnIG9uIHRoZSByZW1vdmVkIHRvb2wgaW52b2NhdGlvblxuXHRcdGlmIChyZW1vdmVkSXRlbS5raW5kID09PSAndG9vbCcgJiYgcmVtb3ZlZEl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duICYmIChyZW1vdmVkSXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCByZW1vdmVkSXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpKSB7XG5cdFx0XHRyZW1vdmVkSXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24uaXNBdHRhY2hlZFRvVGhpbmtpbmcgPSBmYWxzZTtcblxuXHRcdFx0Ly8gS2VlcCBleHRyYWN0ZWRUaXRsZXMgaW4gc3luYyB3aGVuIGEgbGF6eSB0b29sIGxlYXZlcyB0aGUgdGhpbmtpbmcgY29udGFpbmVyLlxuXHRcdFx0Ly8gVXNlIHRoZSB0cmFja2VkIGRpc3BsYXllZCBsYWJlbCAod2hpY2ggbWF5IGRpZmZlciBmcm9tIGludm9jYXRpb25NZXNzYWdlXG5cdFx0XHQvLyBmb3Igc3RyZWFtaW5nIGVkaXQgdG9vbHMgdGhhdCBzaG93IFwiRWRpdGluZyBmaWxlc1wiKVxuXHRcdFx0Y29uc3QgdG9vbENhbGxJZCA9IHJlbW92ZWRJdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sQ2FsbElkO1xuXHRcdFx0dGhpcy5fcGVuZGluZ0V4dGVybmFsUmVzb3VyY2VzLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHRcdHRoaXMuX2V4dGVybmFsUmVzb3VyY2VXaWRnZXQucmVtb3ZlVG9vbEludm9jYXRpb24odG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBsYWJlbCA9IHRoaXMudG9vbExhYmVsc0J5Q2FsbElkLmdldCh0b29sQ2FsbElkKTtcblx0XHRcdGlmIChsYWJlbCkge1xuXHRcdFx0XHRjb25zdCB0aXRsZUluZGV4ID0gdGhpcy5leHRyYWN0ZWRUaXRsZXMuaW5kZXhPZihsYWJlbCk7XG5cdFx0XHRcdGlmICh0aXRsZUluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdHRoaXMuZXh0cmFjdGVkVGl0bGVzLnNwbGljZSh0aXRsZUluZGV4LCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy50b29sTGFiZWxzQnlDYWxsSWQuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uc0luZGV4ID0gdGhpcy50b29sSW52b2NhdGlvbnMuZmluZEluZGV4KHQgPT5cblx0XHRcdCh0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgdC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgdC50b29sSWQgPT09IHRvb2xJbnZvY2F0aW9uSWRcblx0XHQpO1xuXHRcdGlmICh0b29sSW52b2NhdGlvbnNJbmRleCAhPT0gLTEpIHtcblx0XHRcdHRoaXMudG9vbEludm9jYXRpb25zLnNwbGljZSh0b29sSW52b2NhdGlvbnNJbmRleCwgMSk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVEcm9wZG93bkNsaWNrYWJpbGl0eSgpO1xuXHRcdHRoaXMudXBkYXRlV29ya2luZ1NwaW5uZXJWaXNpYmlsaXR5KCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHByb2Nlc3NQZW5kaW5nUmVtb3ZhbHMoKTogdm9pZCB7XG5cdFx0dGhpcy5wZW5kaW5nUmVtb3ZhbEZsdXNoRGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMucGVuZGluZ1JlbW92YWxGbHVzaERpc3Bvc2FibGUgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAodGhpcy5wZW5kaW5nUmVtb3ZhbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVuZGluZ1JlbW92YWxzID0gdGhpcy5wZW5kaW5nUmVtb3ZhbHM7XG5cdFx0dGhpcy5wZW5kaW5nUmVtb3ZhbHMgPSBbXTtcblxuXHRcdGZvciAoY29uc3QgcGVuZGluZyBvZiBwZW5kaW5nUmVtb3ZhbHMpIHtcblx0XHRcdHRoaXMucmVtb3ZlU3RyZWFtaW5nVG9vbEVudHJ5KHBlbmRpbmcudG9vbENhbGxJZCwgcGVuZGluZy50b29sTGFiZWwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVQZW5kaW5nUmVtb3ZhbHNGbHVzaCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wZW5kaW5nUmVtb3ZhbEZsdXNoRGlzcG9zYWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucGVuZGluZ1JlbW92YWxGbHVzaERpc3Bvc2FibGUgPSBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGdldFdpbmRvdyh0aGlzLmRvbU5vZGUpLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnBlbmRpbmdSZW1vdmFsRmx1c2hEaXNwb3NhYmxlID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnByb2Nlc3NQZW5kaW5nUmVtb3ZhbHMoKTtcblx0XHR9KTtcblx0fVxuXG5cdC8vIHJlbW92ZXMgdGhlIHRvb2wgZW50cnkgdGhhdCB3YXMgcHJldmlvdXNseSBzdHJlYW1pbmcgYW5kIG5vdyBpcyBub3QuIHJlbW92ZXMgaXRlbSBmcm9tIGRvbSBhbmQgaW50ZXJuYWwgdHJhY2tpbmcuXG5cdHByaXZhdGUgcmVtb3ZlU3RyZWFtaW5nVG9vbEVudHJ5KHRvb2xDYWxsSWQ6IHN0cmluZywgdG9vbExhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnRvb2xEaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKHRvb2xDYWxsSWQpO1xuXHRcdHRoaXMub3duZWRUb29sUGFydHMuZ2V0KHRvb2xDYWxsSWQpPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5vd25lZFRvb2xQYXJ0cy5kZWxldGUodG9vbENhbGxJZCk7XG5cblx0XHRjb25zdCB3cmFwcGVyID0gdGhpcy50b29sV3JhcHBlcnNCeUNhbGxJZC5nZXQodG9vbENhbGxJZCk7XG5cdFx0aWYgKHdyYXBwZXIpIHtcblx0XHRcdHdyYXBwZXIucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLnRvb2xXcmFwcGVyc0J5Q2FsbElkLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHRcdHRoaXMudG9vbEljb25zQnlDYWxsSWQuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdH1cblxuXHRcdC8vIG1ha2Ugc3VyZSB0byByZW1vdmUgYW55IGxhenkgaXRlbSBhcyB3ZWxsXG5cdFx0Y29uc3QgbGF6eUluZGV4ID0gdGhpcy5sYXp5SXRlbXMuZmluZEluZGV4KGl0ZW0gPT5cblx0XHRcdGl0ZW0ua2luZCA9PT0gJ3Rvb2wnICYmXG5cdFx0XHRpdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biAmJlxuXHRcdFx0KGl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgaXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpICYmXG5cdFx0XHRpdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sQ2FsbElkID09PSB0b29sQ2FsbElkXG5cdFx0KTtcblx0XHRpZiAobGF6eUluZGV4ICE9PSAtMSkge1xuXHRcdFx0Y29uc3QgcmVtb3ZlZExhenlJdGVtID0gdGhpcy5sYXp5SXRlbXNbbGF6eUluZGV4XTtcblx0XHRcdGlmIChyZW1vdmVkTGF6eUl0ZW0ua2luZCA9PT0gJ3Rvb2wnICYmIHJlbW92ZWRMYXp5SXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24gJiYgKHJlbW92ZWRMYXp5SXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCByZW1vdmVkTGF6eUl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSkge1xuXHRcdFx0XHRyZW1vdmVkTGF6eUl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duLmlzQXR0YWNoZWRUb1RoaW5raW5nID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxhenlJdGVtcy5zcGxpY2UobGF6eUluZGV4LCAxKTtcblx0XHR9XG5cblx0XHR0aGlzLmFwcGVuZGVkSXRlbUNvdW50ID0gTWF0aC5tYXgoMCwgdGhpcy5hcHBlbmRlZEl0ZW1Db3VudCAtIDEpO1xuXHRcdHRoaXMudG9vbEludm9jYXRpb25Db3VudCA9IE1hdGgubWF4KDAsIHRoaXMudG9vbEludm9jYXRpb25Db3VudCAtIDEpO1xuXHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uc0luZGV4ID0gdGhpcy50b29sSW52b2NhdGlvbnMuZmluZEluZGV4KHQgPT5cblx0XHRcdCh0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgdC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgdC50b29sQ2FsbElkID09PSB0b29sQ2FsbElkXG5cdFx0KTtcblx0XHRpZiAodG9vbEludm9jYXRpb25zSW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLnRvb2xJbnZvY2F0aW9ucy5zcGxpY2UodG9vbEludm9jYXRpb25zSW5kZXgsIDEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRpdGxlSW5kZXggPSB0aGlzLmV4dHJhY3RlZFRpdGxlcy5pbmRleE9mKHRvb2xMYWJlbCk7XG5cdFx0aWYgKHRpdGxlSW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLmV4dHJhY3RlZFRpdGxlcy5zcGxpY2UodGl0bGVJbmRleCwgMSk7XG5cdFx0fVxuXHRcdHRoaXMudG9vbExhYmVsc0J5Q2FsbElkLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHR0aGlzLl9wZW5kaW5nRXh0ZXJuYWxSZXNvdXJjZXMuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdHRoaXMuX2V4dGVybmFsUmVzb3VyY2VXaWRnZXQucmVtb3ZlVG9vbEludm9jYXRpb24odG9vbENhbGxJZCk7XG5cdFx0dGhpcy51cGRhdGVXb3JraW5nU3Bpbm5lclZpc2liaWxpdHkoKTtcblx0XHR0aGlzLnVwZGF0ZURyb3Bkb3duQ2xpY2thYmlsaXR5KCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB0cmFja1Rvb2xNZXRhZGF0YShcblx0XHR0b29sSW52b2NhdGlvbklkPzogc3RyaW5nLFxuXHRcdHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bj86IENoYXRUaGlua2luZ0l0ZW1NZXRhZGF0YVxuXHQpOiB2b2lkIHtcblx0XHRpZiAoIXRvb2xJbnZvY2F0aW9uSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUcmFjayBob29rcyBzZXBhcmF0ZWx5OiBpZiB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24gaXMgdW5kZWZpbmVkLCBpdCdzIGEgaG9vayBpdGVtXG5cdFx0Y29uc3QgaXNIb29rID0gIXRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bjtcblx0XHRpZiAoaXNIb29rKSB7XG5cdFx0XHR0aGlzLmhvb2tDb3VudCsrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRvb2xJbnZvY2F0aW9uQ291bnQrKztcblx0XHR9XG5cblx0XHQvLyBTaGlmdCBkZWZhdWx0IHRpdGxlIGZyb20gJ1RoaW5raW5nJyB0byAnV29ya2luZycgb25jZSB3ZSBoYXZlIHRvb2wgY2FsbHNcblx0XHRpZiAodGhpcy50b29sSW52b2NhdGlvbkNvdW50ID09PSAxKSB7XG5cdFx0XHR0aGlzLmRlZmF1bHRUaXRsZSA9IHRoaXMud29ya2luZ1RpdGxlO1xuXHRcdH1cblxuXHRcdGxldCB0b29sQ2FsbExhYmVsOiBzdHJpbmc7XG5cblx0XHRjb25zdCBpc1Rvb2xJbnZvY2F0aW9uID0gdG9vbEludm9jYXRpb25Pck1hcmtkb3duICYmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpO1xuXHRcdGlmIChpc1Rvb2xJbnZvY2F0aW9uICYmIHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5pbnZvY2F0aW9uTWVzc2FnZSkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHR5cGVvZiB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24uaW52b2NhdGlvbk1lc3NhZ2UgPT09ICdzdHJpbmcnID8gdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmludm9jYXRpb25NZXNzYWdlIDogdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmludm9jYXRpb25NZXNzYWdlLnZhbHVlO1xuXG5cdFx0XHQvLyBGb3IgZWRpdC10eXBlIHRvb2xzIHRoYXQgYXJlIHN0aWxsIHN0cmVhbWluZywgdXNlIGEgZnJpZW5kbGllciBsYWJlbFxuXHRcdFx0Ly8gaW5zdGVhZCBvZiB0aGUgZ2VuZXJpYyB0b29sIGRpc3BsYXkgbmFtZSAoZS5nLiBcIlJlcGxhY2UgU3RyaW5nIGluIEZpbGVcIilcblx0XHRcdGNvbnN0IGlzU3RyZWFtaW5nRWRpdFRvb2wgPSB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyAmJiBJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzU3RyZWFtaW5nKHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bikgJiYgaXNHZW5lcmljRWRpdFRvb2xJZCh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbElkKTtcblx0XHRcdGlmIChpc1N0cmVhbWluZ0VkaXRUb29sKSB7XG5cdFx0XHRcdHRvb2xDYWxsTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC50aGlua2luZy5lZGl0aW5nRmlsZXMnLCAnRWRpdGluZyBmaWxlcycpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dG9vbENhbGxMYWJlbCA9IG1lc3NhZ2U7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudG9vbEludm9jYXRpb25zLnB1c2godG9vbEludm9jYXRpb25Pck1hcmtkb3duKTtcblxuXHRcdFx0Ly8gVHJhY2sgdGhlIGRpc3BsYXllZCBsYWJlbCBmb3IgY29uc2lzdGVudCBjbGVhbnVwXG5cdFx0XHRjb25zdCB0b29sQ2FsbElkID0gdG9vbEludm9jYXRpb25Pck1hcmtkb3duLnRvb2xDYWxsSWQ7XG5cdFx0XHR0aGlzLnRvb2xMYWJlbHNCeUNhbGxJZC5zZXQodG9vbENhbGxJZCwgdG9vbENhbGxMYWJlbCk7XG5cblx0XHRcdC8vIFJlbmRlciBleHRlcm5hbCBpbWFnZSBwaWxscyBmb3Igc2VyaWFsaXplZCAoYWxyZWFkeS1jb21wbGV0ZWQpIHRvb2wgaW52b2NhdGlvbnNcblx0XHRcdGlmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVFeHRlcm5hbFJlc291cmNlUGFydHModG9vbEludm9jYXRpb25Pck1hcmtkb3duKTtcblxuXHRcdFx0XHQvLyBRdWV1ZSBoaWRkZW4gc2VyaWFsaXplZCB0b29scyBmb3IgcmVtb3ZhbCBpbW1lZGlhdGVseS5cblx0XHRcdFx0aWYgKElDaGF0VG9vbEludm9jYXRpb24uaXNFZmZlY3RpdmVseUhpZGRlbih0b29sSW52b2NhdGlvbk9yTWFya2Rvd24pKSB7XG5cdFx0XHRcdFx0dGhpcy5wZW5kaW5nUmVtb3ZhbHMucHVzaCh7IHRvb2xDYWxsSWQ6IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sQ2FsbElkLCB0b29sTGFiZWw6IHRvb2xDYWxsTGFiZWwgfSk7XG5cdFx0XHRcdFx0dGhpcy5zY2hlZHVsZVBlbmRpbmdSZW1vdmFsc0ZsdXNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gdHJhY2sgc3RhdGUgZm9yIGxpdmUvc3RpbGwgc3RyZWFtaW5nIHRvb2xzLCBleGNsdWRpbmcgc2VyaWFsaXplZCB0b29sc1xuXHRcdFx0aWYgKHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5raW5kID09PSAndG9vbEludm9jYXRpb24nKSB7XG5cdFx0XHRcdGxldCBjdXJyZW50VG9vbExhYmVsID0gdG9vbENhbGxMYWJlbDtcblx0XHRcdFx0bGV0IGlzQ29tcGxldGUgPSBmYWxzZTtcblx0XHRcdFx0bGV0IGlzU3RyZWFtaW5nID0gSUNoYXRUb29sSW52b2NhdGlvbi5pc1N0cmVhbWluZyh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24pO1xuXG5cdFx0XHRcdGNvbnN0IHRvb2xTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0dGhpcy50b29sRGlzcG9zYWJsZXMuc2V0KHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sQ2FsbElkLCB0b29sU3RvcmUpO1xuXG5cdFx0XHRcdGNvbnN0IHVwZGF0ZVRpdGxlID0gKHVwZGF0ZWRNZXNzYWdlOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRpZiAodXBkYXRlZE1lc3NhZ2UgJiYgdXBkYXRlZE1lc3NhZ2UgIT09IGN1cnJlbnRUb29sTGFiZWwpIHtcblx0XHRcdFx0XHRcdC8vIHJlcGxhY2Ugb2xkIHRpdGxlIGlmIGV4aXN0cywgb3RoZXJ3aXNlIGFkZCBuZXdcblx0XHRcdFx0XHRcdGNvbnN0IG9sZEluZGV4ID0gdGhpcy5leHRyYWN0ZWRUaXRsZXMuaW5kZXhPZihjdXJyZW50VG9vbExhYmVsKTtcblx0XHRcdFx0XHRcdGNvbnN0IHVwZGF0ZWRJbmRleCA9IHRoaXMuZXh0cmFjdGVkVGl0bGVzLmluZGV4T2YodXBkYXRlZE1lc3NhZ2UpO1xuXG5cdFx0XHRcdFx0XHRpZiAob2xkSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0XHRcdGlmICh1cGRhdGVkSW5kZXggIT09IC0xICYmIHVwZGF0ZWRJbmRleCAhPT0gb2xkSW5kZXgpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmV4dHJhY3RlZFRpdGxlcy5zcGxpY2Uob2xkSW5kZXgsIDEpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuZXh0cmFjdGVkVGl0bGVzW29sZEluZGV4XSA9IHVwZGF0ZWRNZXNzYWdlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHVwZGF0ZWRJbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5leHRyYWN0ZWRUaXRsZXMucHVzaCh1cGRhdGVkTWVzc2FnZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjdXJyZW50VG9vbExhYmVsID0gdXBkYXRlZE1lc3NhZ2U7XG5cdFx0XHRcdFx0XHR0aGlzLnRvb2xMYWJlbHNCeUNhbGxJZC5zZXQodG9vbENhbGxJZCwgdXBkYXRlZE1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0dGhpcy5sYXN0RXh0cmFjdGVkVGl0bGUgPSB1cGRhdGVkTWVzc2FnZTtcblxuXHRcdFx0XHRcdFx0Ly8gbWFrZSBzdXJlIG5vdCB0byBzZXQgdGl0bGUgaWYgZXhwYW5kZWRcblx0XHRcdFx0XHRcdGlmICghdGhpcy5maXhlZFNjcm9sbGluZ01vZGUgJiYgIXRoaXMuX2lzRXhwYW5kZWQucmVhZCh1bmRlZmluZWQpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2V0VGl0bGUodXBkYXRlZE1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBhdXRvcnVuRGlzcG9zYWJsZSA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRpZiAoaXNDb21wbGV0ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVXb3JraW5nU3Bpbm5lclZpc2liaWxpdHkocmVhZGVyKTtcblxuXHRcdFx0XHRcdC8vIHF1ZXVlIGl0ZW0gdG8gYmUgcmVtb3ZlZCBpZiBpdCB3YXMgc3RyZWFtaW5nIGFuZCBwcmVzZW50YXRpb24gaXMgaGlkZGVuXG5cdFx0XHRcdFx0aWYgKGlzU3RyZWFtaW5nICYmIGN1cnJlbnRTdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpIHtcblx0XHRcdFx0XHRcdGlzU3RyZWFtaW5nID0gZmFsc2U7XG5cblx0XHRcdFx0XHRcdC8vIFVwZGF0ZSB0ZXJtaW5hbCB0b29sIGljb24gYmFzZWQgb24gc2FuZGJveCB3cmFwcGluZyBzdGF0ZVxuXHRcdFx0XHRcdFx0Y29uc3QgdGVybURhdGEgPSB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0aWYgKHRlcm1EYXRhPy5raW5kID09PSAndGVybWluYWwnKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGljb25FbCA9IHRoaXMudG9vbEljb25zQnlDYWxsSWQuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdFx0XHRcdFx0XHRpZiAoaWNvbkVsKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgbmV3SWNvbiA9IHRlcm1EYXRhLmNvbW1hbmRMaW5lPy5pc1NhbmRib3hXcmFwcGVkID8gQ29kaWNvbi50ZXJtaW5hbFNlY3VyZSA6IENvZGljb24udGVybWluYWw7XG5cdFx0XHRcdFx0XHRcdFx0c2V0VGhpbmtpbmdJY29uKGljb25FbCwgbmV3SWNvbik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5wcmVzZW50YXRpb24gPT09ICdoaWRkZW4nKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMucGVuZGluZ1JlbW92YWxzLnB1c2goeyB0b29sQ2FsbElkOiB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbENhbGxJZCwgdG9vbExhYmVsOiBjdXJyZW50VG9vbExhYmVsIH0pO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnNjaGVkdWxlUGVuZGluZ1JlbW92YWxzRmx1c2goKTtcblx0XHRcdFx0XHRcdFx0aXNDb21wbGV0ZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoY3VycmVudFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCB8fFxuXHRcdFx0XHRcdFx0Y3VycmVudFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNhbmNlbGxlZCkge1xuXHRcdFx0XHRcdFx0Ly8gUmVtb3ZlIHRvb2xzIHRoYXQgc2hvdWxkIGJlIGhpZGRlbiBub3cgb3IgYWZ0ZXIgY29tcGxldGlvbi5cblx0XHRcdFx0XHRcdGlmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ucHJlc2VudGF0aW9uID09PSAnaGlkZGVuJyB8fCB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ucHJlc2VudGF0aW9uID09PSAnaGlkZGVuQWZ0ZXJDb21wbGV0ZScpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5wZW5kaW5nUmVtb3ZhbHMucHVzaCh7IHRvb2xDYWxsSWQ6IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sQ2FsbElkLCB0b29sTGFiZWw6IGN1cnJlbnRUb29sTGFiZWwgfSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2NoZWR1bGVQZW5kaW5nUmVtb3ZhbHNGbHVzaCgpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBSZW5kZXIgaW1hZ2UgcGlsbHMgb3V0c2lkZSB0aGUgY29sbGFwc2libGUgYXJlYSBmb3IgY29tcGxldGVkIHRvb2xzXG5cdFx0XHRcdFx0XHRpZiAoY3VycmVudFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUV4dGVybmFsUmVzb3VyY2VQYXJ0cyh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24pO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjb21wbGV0ZWRNZXNzYWdlID0gdG9vbEludm9jYXRpb25Pck1hcmtkb3duLnBhc3RUZW5zZU1lc3NhZ2UgPz8gdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmludm9jYXRpb25NZXNzYWdlO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjb21wbGV0ZWRUZXh0ID0gdHlwZW9mIGNvbXBsZXRlZE1lc3NhZ2UgPT09ICdzdHJpbmcnID8gY29tcGxldGVkTWVzc2FnZSA6IGNvbXBsZXRlZE1lc3NhZ2UudmFsdWU7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGljb25FbGVtZW50ID0gdGhpcy50b29sSWNvbnNCeUNhbGxJZC5nZXQodG9vbENhbGxJZCk7XG5cdFx0XHRcdFx0XHRcdGlmIChpY29uRWxlbWVudCAmJiBpc05vUHJvYmxlbXNGb3VuZFJlc3VsdCh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbElkLCBjb21wbGV0ZWRUZXh0KSkge1xuXHRcdFx0XHRcdFx0XHRcdHNldFRoaW5raW5nSWNvbihpY29uRWxlbWVudCwgQ29kaWNvbi5zZWFyY2gpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlzQ29tcGxldGUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIHN0cmVhbWluZ1xuXHRcdFx0XHRcdGlmIChjdXJyZW50U3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nKSB7XG5cdFx0XHRcdFx0XHRpc1N0cmVhbWluZyA9IHRydWU7XG5cdFx0XHRcdFx0XHRjb25zdCBzdHJlYW1pbmdNZXNzYWdlID0gY3VycmVudFN0YXRlLnN0cmVhbWluZ01lc3NhZ2UucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdFx0aWYgKHN0cmVhbWluZ01lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdXBkYXRlZE1lc3NhZ2UgPSB0eXBlb2Ygc3RyZWFtaW5nTWVzc2FnZSA9PT0gJ3N0cmluZycgPyBzdHJlYW1pbmdNZXNzYWdlIDogc3RyZWFtaW5nTWVzc2FnZS52YWx1ZTtcblx0XHRcdFx0XHRcdFx0dXBkYXRlVGl0bGUodXBkYXRlZE1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIGV4ZWN1dGluZyAoc29tZXRoaW5nIGxpa2UgYFJlcGxhY2luZyA2NyBsaW5lcy4uLi4uYClcblx0XHRcdFx0XHRpZiAoY3VycmVudFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZykge1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJvZ3Jlc3NEYXRhID0gY3VycmVudFN0YXRlLnByb2dyZXNzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdGlmIChwcm9ncmVzc0RhdGEubWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB1cGRhdGVkTWVzc2FnZSA9IHR5cGVvZiBwcm9ncmVzc0RhdGEubWVzc2FnZSA9PT0gJ3N0cmluZycgPyBwcm9ncmVzc0RhdGEubWVzc2FnZSA6IHByb2dyZXNzRGF0YS5tZXNzYWdlLnZhbHVlO1xuXHRcdFx0XHRcdFx0XHR1cGRhdGVUaXRsZSh1cGRhdGVkTWVzc2FnZSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBpbnZvY2F0aW9uTXNnID0gdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmludm9jYXRpb25NZXNzYWdlO1xuXHRcdFx0XHRcdFx0XHRpZiAoaW52b2NhdGlvbk1zZykge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHVwZGF0ZWRNZXNzYWdlID0gdHlwZW9mIGludm9jYXRpb25Nc2cgPT09ICdzdHJpbmcnID8gaW52b2NhdGlvbk1zZyA6IGludm9jYXRpb25Nc2cudmFsdWU7XG5cdFx0XHRcdFx0XHRcdFx0dXBkYXRlVGl0bGUodXBkYXRlZE1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gY29uZmlybWF0aW9ucywgZmFpbHVyZXMsIGNvbXBsZXRlZCwgb3RoZXIsIGV0Y1xuXHRcdFx0XHRcdGNvbnN0IGludm9jYXRpb25Nc2cgPSB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24uaW52b2NhdGlvbk1lc3NhZ2U7XG5cdFx0XHRcdFx0aWYgKGludm9jYXRpb25Nc2cpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVwZGF0ZWRNZXNzYWdlID0gdHlwZW9mIGludm9jYXRpb25Nc2cgPT09ICdzdHJpbmcnID8gaW52b2NhdGlvbk1zZyA6IGludm9jYXRpb25Nc2cudmFsdWU7XG5cdFx0XHRcdFx0XHR1cGRhdGVUaXRsZSh1cGRhdGVkTWVzc2FnZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dG9vbFN0b3JlLmFkZChhdXRvcnVuRGlzcG9zYWJsZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24/LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnKSB7XG5cdFx0XHRjb25zdCBjb2RlYmxvY2tJbmZvID0gZXh0cmFjdENvZGVibG9ja1VyaXNGcm9tVGV4dCh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24uY29udGVudC52YWx1ZSk7XG5cdFx0XHRpZiAoY29kZWJsb2NrSW5mbz8udXJpKSB7XG5cdFx0XHRcdGNvbnN0IGZpbGVuYW1lID0gYmFzZW5hbWUoY29kZWJsb2NrSW5mby51cmkpO1xuXHRcdFx0XHR0b29sQ2FsbExhYmVsID0gbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuZWRpdGVkRmlsZScsICdFZGl0ZWQgezB9JywgZmlsZW5hbWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dG9vbENhbGxMYWJlbCA9IGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLmVkaXRpbmdGaWxlJywgJ0VkaXRlZCBmaWxlJyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24/LmtpbmQgPT09ICdleHRlcm5hbEVkaXQnKSB7XG5cdFx0XHRjb25zdCBmaWxlbmFtZSA9IGJhc2VuYW1lKHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi51cmkpO1xuXHRcdFx0c3dpdGNoICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24uZWRpdEtpbmQpIHtcblx0XHRcdFx0Y2FzZSAnY3JlYXRlJzpcblx0XHRcdFx0XHR0b29sQ2FsbExhYmVsID0gbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuY3JlYXRlZEZpbGUnLCAnQ3JlYXRlZCB7MH0nLCBmaWxlbmFtZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2RlbGV0ZSc6XG5cdFx0XHRcdFx0dG9vbENhbGxMYWJlbCA9IGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLmRlbGV0ZWRGaWxlJywgJ0RlbGV0ZWQgezB9JywgZmlsZW5hbWUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdyZW5hbWUnOlxuXHRcdFx0XHRcdHRvb2xDYWxsTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC50aGlua2luZy5yZW5hbWVkRmlsZScsICdSZW5hbWVkIHswfScsIGZpbGVuYW1lKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnZWRpdCc6XG5cdFx0XHRcdFx0dG9vbENhbGxMYWJlbCA9IGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLmVkaXRlZEZpbGUnLCAnRWRpdGVkIHswfScsIGZpbGVuYW1lKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dG9vbENhbGxMYWJlbCA9IHRvb2xJbnZvY2F0aW9uSWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIHRvb2wgY2FsbCB0byBleHRyYWN0ZWQgdGl0bGVzIGZvciBMTE0gdGl0bGUgZ2VuZXJhdGlvblxuXHRcdGlmICghdGhpcy5leHRyYWN0ZWRUaXRsZXMuaW5jbHVkZXModG9vbENhbGxMYWJlbCkpIHtcblx0XHRcdHRoaXMuZXh0cmFjdGVkVGl0bGVzLnB1c2godG9vbENhbGxMYWJlbCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXN0RXh0cmFjdGVkVGl0bGUgPSB0b29sQ2FsbExhYmVsO1xuXG5cdFx0aWYgKCF0aGlzLmZpeGVkU2Nyb2xsaW5nTW9kZSAmJiAhdGhpcy5faXNFeHBhbmRlZC5nZXQoKSkge1xuXHRcdFx0dGhpcy5zZXRUaXRsZSh0b29sQ2FsbExhYmVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUV4dGVybmFsUmVzb3VyY2VQYXJ0cyh0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkKTogdm9pZCB7XG5cdFx0Ly8gSW4gZml4ZWQgc2Nyb2xsaW5nIG1vZGUsIGRlZmVyIHJlbmRlcmluZyBhZ2dyZWdhdGVkIGltYWdlcyBhdCB0aGUgYm90dG9tIHdoaWxlXG5cdFx0Ly8gdGhlIHJlc3BvbnNlIGlzIHN0aWxsIHN0cmVhbWluZy4gVGhlIGltYWdlcyB3b3VsZCBvdGhlcndpc2Ugb3ZlcmxhcCB0aGUgcGlubmVkXG5cdFx0Ly8gc2Nyb2xsaW5nIHZpZXdwb3J0LiBUaGV5IGFyZSBmbHVzaGVkIG9uY2Ugc3RyZWFtaW5nIGNvbXBsZXRlcy5cblx0XHRpZiAodGhpcy5maXhlZFNjcm9sbGluZ01vZGUgJiYgIXRoaXMuc3RyZWFtaW5nQ29tcGxldGVkICYmICF0aGlzLmVsZW1lbnQuaXNDb21wbGV0ZSkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ0V4dGVybmFsUmVzb3VyY2VzLnNldCh0b29sSW52b2NhdGlvbi50b29sQ2FsbElkLCB0b29sSW52b2NhdGlvbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0cmFjdGVkSW1hZ2VzID0gZXh0cmFjdEltYWdlc0Zyb21Ub29sSW52b2NhdGlvbk91dHB1dERldGFpbHModG9vbEludm9jYXRpb24sIHRoaXMuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChleHRyYWN0ZWRJbWFnZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFydHM6IElDaGF0Q29sbGFwc2libGVJT0RhdGFQYXJ0W10gPSBleHRyYWN0ZWRJbWFnZXMubWFwKGltYWdlID0+ICh7XG5cdFx0XHRraW5kOiAnZGF0YScsXG5cdFx0XHR2YWx1ZTogaW1hZ2UuZGF0YS5idWZmZXIsXG5cdFx0XHRtaW1lVHlwZTogaW1hZ2UubWltZVR5cGUsXG5cdFx0XHR1cmk6IGltYWdlLnVyaSxcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9leHRlcm5hbFJlc291cmNlV2lkZ2V0LnNldFRvb2xJbnZvY2F0aW9uUGFydHModG9vbEludm9jYXRpb24udG9vbENhbGxJZCwgcGFydHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBmbHVzaFBlbmRpbmdFeHRlcm5hbFJlc291cmNlcygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ0V4dGVybmFsUmVzb3VyY2VzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcGVuZGluZyA9IEFycmF5LmZyb20odGhpcy5fcGVuZGluZ0V4dGVybmFsUmVzb3VyY2VzLnZhbHVlcygpKTtcblx0XHR0aGlzLl9wZW5kaW5nRXh0ZXJuYWxSZXNvdXJjZXMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHRvb2xJbnZvY2F0aW9uIG9mIHBlbmRpbmcpIHtcblx0XHRcdHRoaXMudXBkYXRlRXh0ZXJuYWxSZXNvdXJjZVBhcnRzKHRvb2xJbnZvY2F0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFwcGVuZEl0ZW1Ub0RPTShcblx0XHRjb250ZW50OiBIVE1MRWxlbWVudCxcblx0XHR0b29sSW52b2NhdGlvbklkPzogc3RyaW5nLFxuXHRcdHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bj86IENoYXRUaGlua2luZ0l0ZW1NZXRhZGF0YSxcblx0XHRvcmlnaW5hbFBhcmVudD86IEhUTUxFbGVtZW50XG5cdCk6IHZvaWQge1xuXHRcdGlmICghY29udGVudC5oYXNDaGlsZE5vZGVzKCkgfHwgY29udGVudC50ZXh0Q29udGVudD8udHJpbSgpID09PSAnJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1XcmFwcGVyID0gJCgnLmNoYXQtdGhpbmtpbmctdG9vbC13cmFwcGVyJyk7XG5cdFx0Y29uc3QgaXNNYXJrZG93bkVkaXQgPSB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24/LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnO1xuXHRcdGNvbnN0IGlzRXh0ZXJuYWxFZGl0ID0gdG9vbEludm9jYXRpb25Pck1hcmtkb3duPy5raW5kID09PSAnZXh0ZXJuYWxFZGl0Jztcblx0XHRjb25zdCBpc1Rlcm1pbmFsVG9vbCA9IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biAmJiAodG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSAmJiB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Rlcm1pbmFsJztcblx0XHRjb25zdCBpc1NlYXJjaFRvb2wgPSB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24gJiYgKHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgdG9vbEludm9jYXRpb25Pck1hcmtkb3duLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzZWFyY2gnO1xuXHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uSWNvbiA9IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biAmJiAodG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSA/IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5pY29uIDogdW5kZWZpbmVkO1xuXG5cdFx0bGV0IGljb246IFRoZW1lSWNvbjtcblx0XHRpZiAoaXNOb1Byb2JsZW1zRm91bmRSZXN1bHQodG9vbEludm9jYXRpb25JZCwgY29udGVudC50ZXh0Q29udGVudCA/PyB1bmRlZmluZWQpKSB7XG5cdFx0XHRpY29uID0gQ29kaWNvbi5zZWFyY2g7XG5cdFx0fSBlbHNlIGlmIChpc01hcmtkb3duRWRpdCB8fCBpc0V4dGVybmFsRWRpdCkge1xuXHRcdFx0aWNvbiA9IENvZGljb24ucGVuY2lsO1xuXHRcdH0gZWxzZSBpZiAoaXNTZWFyY2hUb29sKSB7XG5cdFx0XHRpY29uID0gQ29kaWNvbi5zZWFyY2g7XG5cdFx0fSBlbHNlIGlmIChpc1Rlcm1pbmFsVG9vbCkge1xuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gKHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyB0ZXJtaW5hbENvbW1hbmRTdGF0ZT86IHsgZXhpdENvZGU/OiBudW1iZXIgfTsgY29tbWFuZExpbmU/OiB7IGlzU2FuZGJveFdyYXBwZWQ/OiBib29sZWFuIH0gfTtcblx0XHRcdGNvbnN0IGV4aXRDb2RlID0gdGVybWluYWxEYXRhPy50ZXJtaW5hbENvbW1hbmRTdGF0ZT8uZXhpdENvZGU7XG5cdFx0XHRjb25zdCBpc1NhbmRib3hXcmFwcGVkID0gdGVybWluYWxEYXRhPy5jb21tYW5kTGluZT8uaXNTYW5kYm94V3JhcHBlZDtcblx0XHRcdGlmIChleGl0Q29kZSAhPT0gdW5kZWZpbmVkICYmIGV4aXRDb2RlICE9PSAwKSB7XG5cdFx0XHRcdGljb24gPSBDb2RpY29uLmVycm9yO1xuXHRcdFx0fSBlbHNlIGlmIChpc1NhbmRib3hXcmFwcGVkKSB7XG5cdFx0XHRcdGljb24gPSBDb2RpY29uLnRlcm1pbmFsU2VjdXJlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWNvbiA9IHRvb2xJbnZvY2F0aW9uSWNvbiA/PyBDb2RpY29uLnRlcm1pbmFsO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoY29udGVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtaG9vay1vdXRjb21lLWJsb2NrZWQnKSkge1xuXHRcdFx0aWNvbiA9IENvZGljb24uZXJyb3I7XG5cdFx0fSBlbHNlIGlmIChjb250ZW50LmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1ob29rLW91dGNvbWUtd2FybmluZycpKSB7XG5cdFx0XHRpY29uID0gQ29kaWNvbi53YXJuaW5nO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpY29uID0gdG9vbEludm9jYXRpb25JZCA/IGdldFRvb2xJbnZvY2F0aW9uSWNvbih0b29sSW52b2NhdGlvbklkLCB0b29sSW52b2NhdGlvbkljb24sIGNvbnRlbnQudGV4dENvbnRlbnQgPz8gdW5kZWZpbmVkKSA6IENvZGljb24udG9vbHM7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWNvbkVsZW1lbnQgPSBjcmVhdGVUaGlua2luZ0ljb24oaWNvbik7XG5cdFx0aXRlbVdyYXBwZXIuYXBwZW5kQ2hpbGQoaWNvbkVsZW1lbnQpO1xuXHRcdGl0ZW1XcmFwcGVyLmFwcGVuZENoaWxkKGNvbnRlbnQpO1xuXG5cdFx0aWYgKHRoaXMudG9vbEludm9jYXRpb25Db3VudCA9PT0gMSAmJiB0aGlzLmhvb2tDb3VudCA9PT0gMCAmJiBvcmlnaW5hbFBhcmVudCkge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24gJiYgKHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgPyB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24gOiB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnNpbmdsZUl0ZW1JbmZvID0ge1xuXHRcdFx0XHRlbGVtZW50OiBjb250ZW50LFxuXHRcdFx0XHR0aGlua2luZ1dyYXBwZXI6IGl0ZW1XcmFwcGVyLFxuXHRcdFx0XHRvcmlnaW5hbFBhcmVudCxcblx0XHRcdFx0b3JpZ2luYWxOZXh0U2libGluZzogdGhpcy5kb21Ob2RlLFxuXHRcdFx0XHRyZXN0b3JlVG9PcmlnaW5hbFBhcmVudDogISF0b29sSW52b2NhdGlvbiB8fCBpc0V4dGVybmFsRWRpdCxcblx0XHRcdFx0dG9vbEludm9jYXRpb25cblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2luZ2xlSXRlbUluZm8gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNUb29sSW52b2NhdGlvbiA9IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biAmJiAodG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKTtcblx0XHRpZiAoaXNUb29sSW52b2NhdGlvbiAmJiB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbENhbGxJZCkge1xuXHRcdFx0dGhpcy50b29sV3JhcHBlcnNCeUNhbGxJZC5zZXQodG9vbEludm9jYXRpb25Pck1hcmtkb3duLnRvb2xDYWxsSWQsIGl0ZW1XcmFwcGVyKTtcblx0XHRcdHRoaXMudG9vbEljb25zQnlDYWxsSWQuc2V0KHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sQ2FsbElkLCBpY29uRWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5hcHBlbmRUb1dyYXBwZXIoaXRlbVdyYXBwZXIpO1xuXG5cdFx0aWYgKHRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlICYmIHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQpIHtcblx0XHRcdC8vIE9ic2VydmUgdGhlIGNoaWxkIHdyYXBwZXIgZm9yIHJlc2l6ZXMgKGUuZy4gdGVybWluYWwgZXhwYW5kaW5nKVxuXHRcdFx0aWYgKHRoaXMuY2hpbGRSZXNpemVPYnNlcnZlciAmJiAhdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQpIHtcblx0XHRcdFx0Y29uc3Qgb2JzZXJ2ZURpc3Bvc2FibGUgPSB0aGlzLmNoaWxkUmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZShpdGVtV3JhcHBlcik7XG5cdFx0XHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBpc1Rvb2xJbnZvY2F0aW9uID8gdG9vbEludm9jYXRpb25Pck1hcmtkb3duLnRvb2xDYWxsSWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICh0b29sQ2FsbElkKSB7XG5cdFx0XHRcdFx0bGV0IHN0b3JlID0gdGhpcy50b29sRGlzcG9zYWJsZXMuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdFx0XHRcdGlmICghc3RvcmUpIHtcblx0XHRcdFx0XHRcdHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRcdFx0dGhpcy50b29sRGlzcG9zYWJsZXMuc2V0KHRvb2xDYWxsSWQsIHN0b3JlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c3RvcmUuYWRkKG9ic2VydmVEaXNwb3NhYmxlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3RlcihvYnNlcnZlRGlzcG9zYWJsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29hbGVzY2UgcmVhZHMgb2Ygc2Nyb2xsSGVpZ2h0IHRvIGF2b2lkIGZvcmNlZCByZWZsb3dzIHdoZW4gbWFueSBpdGVtc1xuXHRcdFx0Ly8gYXJlIGFwcGVuZGVkIGluIHRoZSBzYW1lIHRpY2sgKGUuZy4gd2hlbiByZXN0b3JpbmcgYSBzZXNzaW9uKS5cblx0XHRcdHRoaXMuc2NoZWR1bGVBcHBlbmRSZWZyZXNoKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzY2hlZHVsZUFwcGVuZFJlZnJlc2goKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdBcHBlbmRSZWZyZXNoLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdBcHBlbmRSZWZyZXNoLnZhbHVlID0gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShnZXRXaW5kb3codGhpcy53cmFwcGVyKSwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fcGVuZGluZ0FwcGVuZFJlZnJlc2guY2xlYXIoKTtcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMucmVmcmVzaENvbnRlbnRIZWlnaHQoKTtcblx0XHRcdHRoaXMudXBkYXRlU2Nyb2xsRGltZW5zaW9uc0Zyb21DYWNoZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXRlcmlhbGl6ZUxhenlJdGVtKGl0ZW06IElMYXp5SXRlbSk6IHZvaWQge1xuXHRcdGlmIChpdGVtLmtpbmQgPT09ICd0aGlua2luZycpIHtcblx0XHRcdC8vIE1hdGVyaWFsaXplIHRoaW5raW5nIGNvbnRhaW5lclxuXHRcdFx0dGhpcy5hcHBlbmRUb1dyYXBwZXIoaXRlbS50ZXh0Q29udGFpbmVyKTtcblx0XHRcdC8vIFN0b3JlIHJlZmVyZW5jZSB0byB0ZXh0Q29udGFpbmVyIGZvciB1cGRhdGVUaGlua2luZyBjYWxsc1xuXHRcdFx0dGhpcy50ZXh0Q29udGFpbmVyID0gaXRlbS50ZXh0Q29udGFpbmVyO1xuXHRcdFx0dGhpcy5pZCA9IGl0ZW0uY29udGVudC5pZDtcblx0XHRcdC8vIFVzZSBpdGVtLmNvbnRlbnQgd2hpY2ggaXMga2VwdCB1cC10by1kYXRlIGR1cmluZyBzdHJlYW1pbmcgdmlhIHVwZGF0ZVRoaW5raW5nXG5cdFx0XHR0aGlzLnVwZGF0ZVRoaW5raW5nKGl0ZW0uY29udGVudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMud29ya2luZ1NwaW5uZXJMYWJlbCkge1xuXHRcdFx0Y29uc3QgaXNUZXJtaW5hbFRvb2wgPSBpdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biAmJiAoaXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBpdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgaXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Rlcm1pbmFsJztcblx0XHRcdGNvbnN0IGNhdGVnb3J5ID0gaXNUZXJtaW5hbFRvb2wgPyBXb3JraW5nTWVzc2FnZUNhdGVnb3J5LlRlcm1pbmFsIDogV29ya2luZ01lc3NhZ2VDYXRlZ29yeS5Ub29sO1xuXHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckxhYmVsLnRleHRDb250ZW50ID0gdGhpcy5nZXRSYW5kb21Xb3JraW5nTWVzc2FnZShjYXRlZ29yeSk7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIHRvb2wgaXRlbXNcblx0XHRpZiAoaXRlbS5sYXp5Lmhhc1ZhbHVlKSB7XG5cdFx0XHQvLyBBbHJlYWR5IGV2YWx1YXRlZCBcdTIwMTQgYnV0IG1heSBub3QgaGF2ZSBiZWVuIHBsYWNlZCBpbiB0aGUgRE9NIHlldFxuXHRcdFx0Ly8gKGUuZy4gZmluYWxpemVUaXRsZUlmRGVmYXVsdCBtYXRlcmlhbGl6ZWQgaXQgYmVmb3JlIHRoZSB3cmFwcGVyIGV4aXN0ZWQpLlxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gaXRlbS5sYXp5LnZhbHVlO1xuXHRcdFx0aWYgKCFyZXN1bHQuZG9tTm9kZS5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuYXBwZW5kSXRlbVRvRE9NKHJlc3VsdC5kb21Ob2RlLCBpdGVtLnRvb2xJbnZvY2F0aW9uSWQsIGl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duLCBpdGVtLm9yaWdpbmFsUGFyZW50KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBpdGVtLmxhenkudmFsdWU7XG5cdFx0dGhpcy5hcHBlbmRJdGVtVG9ET00ocmVzdWx0LmRvbU5vZGUsIGl0ZW0udG9vbEludm9jYXRpb25JZCwgaXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24sIGl0ZW0ub3JpZ2luYWxQYXJlbnQpO1xuXG5cdFx0aWYgKHJlc3VsdC5kaXNwb3NhYmxlKSB7XG5cdFx0XHRjb25zdCB0b29sQ2FsbElkID0gaXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24gJiYgKGl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgaXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpID8gaXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbENhbGxJZCA6IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0b29sQ2FsbElkKSB7XG5cdFx0XHRcdHRoaXMub3duZWRUb29sUGFydHMuc2V0KHRvb2xDYWxsSWQsIHJlc3VsdC5kaXNwb3NhYmxlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdC5kaXNwb3NhYmxlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBtYWtlcyBhIG5ldyB0ZXh0IGNvbnRhaW5lci4gd2hlbiB3ZSB1cGRhdGUsIHdlIG5vdyB1cGRhdGUgdGhpcyBjb250YWluZXIuXG5cdHB1YmxpYyBzZXR1cFRoaW5raW5nQ29udGFpbmVyKGNvbnRlbnQ6IElDaGF0VGhpbmtpbmdQYXJ0KSB7XG5cdFx0Ly8gQXZvaWQgY3JlYXRpbmcgbmV3IGNvbnRhaW5lcnMgYWZ0ZXIgZGlzcG9zYWxcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmFwcGVuZGVkSXRlbUNvdW50Kys7XG5cdFx0dGhpcy5hbGxUaGlua2luZ1BhcnRzLnB1c2goY29udGVudCk7XG5cdFx0dGhpcy5yZWNvcmRSZWFzb25pbmdDb250ZW50KGV4dHJhY3RUZXh0RnJvbVBhcnQoY29udGVudCkpO1xuXHRcdHRoaXMudGV4dENvbnRhaW5lciA9ICQoJy5jaGF0LXRoaW5raW5nLWl0ZW0ubWFya2Rvd24tY29udGVudCcpO1xuXHRcdC8vIE9ic2VydmUgdGhlIG5ldyB0ZXh0Q29udGFpbmVyIGZvciBjaGlsZCByZXNpemVzIGluIGZpeGVkIHNjcm9sbGluZyBtb2RlXG5cdFx0aWYgKHRoaXMuY2hpbGRSZXNpemVPYnNlcnZlciAmJiB0aGlzLmZpeGVkU2Nyb2xsaW5nTW9kZSAmJiAhdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hpbGRSZXNpemVPYnNlcnZlci5vYnNlcnZlKHRoaXMudGV4dENvbnRhaW5lcikpO1xuXHRcdH1cblx0XHRpZiAoY29udGVudC52YWx1ZSkge1xuXHRcdFx0Ly8gVXNlIGxhenkgcmVuZGVyaW5nIHdoZW4gY29sbGFwc2VkIHRvIHByZXNlcnZlIG9yZGVyIHdpdGggdG9vbCBpdGVtc1xuXHRcdFx0aWYgKHRoaXMuaXNFeHBhbmRlZCgpIHx8IHRoaXMuaGFzRXhwYW5kZWRPbmNlIHx8ICh0aGlzLmZpeGVkU2Nyb2xsaW5nTW9kZSAmJiAhdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQpKSB7XG5cdFx0XHRcdC8vIFJlbmRlciBpbW1lZGlhdGVseSB3aGVuIGV4cGFuZGVkXG5cdFx0XHRcdHRoaXMuYXBwZW5kVG9XcmFwcGVyKHRoaXMudGV4dENvbnRhaW5lcik7XG5cdFx0XHRcdHRoaXMuaWQgPSBjb250ZW50LmlkO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVRoaW5raW5nKGNvbnRlbnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVXBkYXRlIHRoaXMuY29udGVudCBhbmQgdGhpcy5pZCBzbyB0aGF0IHN1YnNlcXVlbnQgdXBkYXRlVGhpbmtpbmcgY2FsbHNcblx0XHRcdFx0Ly8gb3IgbWF0ZXJpYWxpemVMYXp5SXRlbSB3aWxsIHVzZSB0aGUgY29ycmVjdCBjb250ZW50IGZvciB0aGlzIHNlY3Rpb25cblx0XHRcdFx0dGhpcy5jb250ZW50ID0gY29udGVudDtcblx0XHRcdFx0dGhpcy5pZCA9IGNvbnRlbnQuaWQ7XG5cdFx0XHRcdC8vIERlZmVyIHJlbmRlcmluZyB1bnRpbCBleHBhbmRlZCB0byBwcmVzZXJ2ZSBvcmRlclxuXHRcdFx0XHRjb25zdCBsYXp5VGhpbmtpbmc6IElMYXp5VGhpbmtpbmdJdGVtID0ge1xuXHRcdFx0XHRcdGtpbmQ6ICd0aGlua2luZycsXG5cdFx0XHRcdFx0dGV4dENvbnRhaW5lcjogdGhpcy50ZXh0Q29udGFpbmVyLFxuXHRcdFx0XHRcdGNvbnRlbnRcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5sYXp5SXRlbXMucHVzaChsYXp5VGhpbmtpbmcpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy53b3JraW5nU3Bpbm5lckxhYmVsKSB7XG5cdFx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJMYWJlbC50ZXh0Q29udGVudCA9IHRoaXMuZ2V0UmFuZG9tV29ya2luZ01lc3NhZ2UoV29ya2luZ01lc3NhZ2VDYXRlZ29yeS5UaGlua2luZyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlRHJvcGRvd25DbGlja2FiaWxpdHkoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzZXRUaXRsZSh0aXRsZTogc3RyaW5nLCBvbWl0UHJlZml4PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGl0bGUgfHwgdGhpcy5lbGVtZW50LmlzQ29tcGxldGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAob21pdFByZWZpeCkge1xuXHRcdFx0aWYgKHRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IHRoaXMuX2NvbGxhcHNlQnV0dG9uLmxhYmVsRWxlbWVudDtcblx0XHRcdFx0bGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRcdGNvbnN0IHBsYWluU3BhbiA9ICQoJ3NwYW4nKTtcblx0XHRcdFx0cGxhaW5TcGFuLnRleHRDb250ZW50ID0gdGl0bGU7XG5cdFx0XHRcdGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZChwbGFpblNwYW4pO1xuXHRcdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LmFyaWFMYWJlbCA9IHRpdGxlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy50aXRsZVNoaW1tZXJTcGFuID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy50aXRsZURldGFpbENvbnRhaW5lciA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3RpdGxlRGV0YWlsUmVuZGVyZWQuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3RpdGxlRmlsZVdpZGdldFN0b3JlLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmN1cnJlbnRUaXRsZSA9IHRpdGxlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubGFzdEV4dHJhY3RlZFRpdGxlID0gdGl0bGU7XG5cdFx0Y29uc3QgdGhpbmtpbmdMYWJlbCA9IGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLmxhYmVsJywgXCJ7MH06IHsxfVwiLCB0aGlzLmRlZmF1bHRUaXRsZSwgdGl0bGUpO1xuXHRcdHRoaXMuY3VycmVudFRpdGxlID0gdGhpbmtpbmdMYWJlbDtcblxuXHRcdGlmICghdGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSB0aGlzLl9jb2xsYXBzZUJ1dHRvbi5sYWJlbEVsZW1lbnQ7XG5cblx0XHQvLyBFbnN1cmUgdGhlIHBlcnNpc3RlbnQgc2hpbW1lciBzcGFuIGV4aXN0c1xuXHRcdGlmICghdGhpcy50aXRsZVNoaW1tZXJTcGFuIHx8ICF0aGlzLnRpdGxlU2hpbW1lclNwYW4ucGFyZW50RWxlbWVudCkge1xuXHRcdFx0bGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0aGlzLnRpdGxlU2hpbW1lclNwYW4gPSAkKCdzcGFuLmNoYXQtdGhpbmtpbmctdGl0bGUtc2hpbW1lcicpO1xuXHRcdFx0bGFiZWxFbGVtZW50LmFwcGVuZENoaWxkKHRoaXMudGl0bGVTaGltbWVyU3Bhbik7XG5cdFx0fVxuXHRcdHRoaXMudGl0bGVTaGltbWVyU3Bhbi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLnNoaW1tZXInLCBcInswfTogXCIsIHRoaXMuZGVmYXVsdFRpdGxlKTtcblxuXHRcdC8vIERpc3Bvc2UgcHJldmlvdXMgZGV0YWlsIHJlbmRlcmluZ1xuXHRcdHRoaXMuX3RpdGxlRGV0YWlsUmVuZGVyZWQuY2xlYXIoKTtcblx0XHR0aGlzLl90aXRsZUZpbGVXaWRnZXRTdG9yZS5jbGVhcigpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIucmVuZGVyKG5ldyBNYXJrZG93blN0cmluZyh0aXRsZSkpO1xuXHRcdHJlc3VsdC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NvbGxhcHNpYmxlLXRpdGxlLWNvbnRlbnQnLCAnY2hhdC10aGlua2luZy10aXRsZS1kZXRhaWwnKTtcblx0XHRyZW5kZXJGaWxlV2lkZ2V0cyhyZXN1bHQuZWxlbWVudCwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5jaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLCB0aGlzLl90aXRsZUZpbGVXaWRnZXRTdG9yZSk7XG5cdFx0dGhpcy5fdGl0bGVEZXRhaWxSZW5kZXJlZC52YWx1ZSA9IHJlc3VsdDtcblxuXHRcdGlmICh0aGlzLnRpdGxlRGV0YWlsQ29udGFpbmVyKSB7XG5cdFx0XHQvLyBSZXBsYWNlIG9sZCBkZXRhaWwgaW4tcGxhY2Vcblx0XHRcdHRoaXMudGl0bGVEZXRhaWxDb250YWluZXIucmVwbGFjZVdpdGgocmVzdWx0LmVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsYWJlbEVsZW1lbnQuYXBwZW5kQ2hpbGQocmVzdWx0LmVsZW1lbnQpO1xuXHRcdH1cblx0XHR0aGlzLnRpdGxlRGV0YWlsQ29udGFpbmVyID0gcmVzdWx0LmVsZW1lbnQ7XG5cblx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LmFyaWFMYWJlbCA9IHRoaW5raW5nTGFiZWw7XG5cdFx0dGhpcy5fY29sbGFwc2VCdXR0b24uZWxlbWVudC5hcmlhRXhwYW5kZWQgPSBTdHJpbmcodGhpcy5pc0V4cGFuZGVkKCkpO1xuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50LCBfZm9sbG93aW5nQ29udGVudDogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSwgX2VsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXG5cdFx0aWYgKF9lbGVtZW50LmlzQ29tcGxldGUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoKG90aGVyLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgb3RoZXIua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpXG5cdFx0XHQmJiBvdGhlci50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnXG5cdFx0XHQmJiAhb3RoZXIuc3ViQWdlbnRJbnZvY2F0aW9uSWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAob3RoZXIua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBvdGhlci5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJyB8fCBvdGhlci5raW5kID09PSAnbWFya2Rvd25Db250ZW50JyB8fCBvdGhlci5raW5kID09PSAnaG9vaycpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChvdGhlci5raW5kICE9PSAndGhpbmtpbmcnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG90aGVyPy5pZCAhPT0gdGhpcy5pZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5pc0FjdGl2ZSA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCkge1xuXHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJMYWJlbCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5wZW5kaW5nUmVtb3ZhbEZsdXNoRGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMucGVuZGluZ1JlbW92YWxGbHVzaERpc3Bvc2FibGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5wZW5kaW5nU2Nyb2xsRGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLEdBQUcsV0FBVywwQkFBMEIsV0FBVyxNQUFNLGVBQWUsb0NBQW9DO0FBQ3JILFNBQVMsYUFBYTtBQUN0QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFzRywyQkFBMEQ7QUFHaEssU0FBUyxtQkFBbUIsMkJBQTJCO0FBRXZELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFlBQVk7QUFDckIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGVBQWUsaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDN0YsU0FBUyxlQUF3QjtBQUNqQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGlCQUFpQiw4QkFBOEI7QUFDeEQsT0FBTztBQUNQLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsb0RBQW9EO0FBRTdELFNBQVMsMENBQTBDO0FBQ25ELFNBQVMscUJBQXFCLCtCQUErQjtBQU03RCxNQUFNLCtCQUEr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
