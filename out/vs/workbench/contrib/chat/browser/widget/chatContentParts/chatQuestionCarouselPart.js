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
import { renderAsPlaintext } from "../../../../../../base/browser/markdownRenderer.js";
import { StandardKeyboardEvent } from "../../../../../../base/browser/keyboardEvent.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString, isMarkdownString } from "../../../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { isMacintosh } from "../../../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { localize } from "../../../../../../nls.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { IMarkdownRendererService } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { InputBox } from "../../../../../../base/browser/ui/inputbox/inputBox.js";
import { DomScrollableElement } from "../../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Checkbox } from "../../../../../../base/browser/ui/toggle/toggle.js";
import { findQuestionValidationFailure, getDisplayedQuestionText, getOptionsWithDefaultsFirst } from "../../../common/chatService/chatQuestionCarouselHelpers.js";
import { ChatQuestionCarouselData } from "../../../common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { isResponseVM } from "../../../common/model/chatViewModel.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { HoverPosition } from "../../../../../../base/browser/ui/hover/hoverWidget.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { AccessibilityVerbositySettingId } from "../../../../accessibility/browser/accessibilityConfiguration.js";
import { ScrollbarVisibility } from "../../../../../../base/common/scrollable.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ITerminalChatService } from "../../../../terminal/browser/terminal.js";
import { AgentHostAutoReplyAnswer } from "../../../../../../platform/agentHost/common/agentHostSchema.js";
import { ChatCollapsibleContentPart } from "./chatCollapsibleContentPart.js";
import "./media/chatQuestionCarousel.css";
const PREVIOUS_QUESTION_ACTION_ID = "workbench.action.chat.previousQuestion";
const NEXT_QUESTION_ACTION_ID = "workbench.action.chat.nextQuestion";
class ChatQuestionAnswerCollapsiblePart extends ChatCollapsibleContentPart {
  constructor(title, prefix, value, answerIcon, context, contentFactory, onDidChangeHeight, hoverService, configurationService) {
    super(title, context, void 0, hoverService, configurationService);
    this.prefix = prefix;
    this.value = value;
    this.answerIcon = answerIcon;
    this.contentFactory = contentFactory;
    this.onDidChangeHeight = onDidChangeHeight;
  }
  init() {
    const element = super.init();
    element.classList.toggle("chat-question-answer-expandable", !!this.contentFactory);
    if (this._collapseButton) {
      const labelElement = this._collapseButton.labelElement;
      labelElement.textContent = "";
      const icon = dom.$("span.chat-question-summary-answer-icon");
      icon.classList.add(...ThemeIcon.asClassNameArray(this.answerIcon));
      icon.setAttribute("aria-hidden", "true");
      const value = dom.$("span.chat-question-summary-answer-value");
      value.textContent = this.value;
      this._register(this.hoverService.setupDelayedHover(value, { content: this.value }));
      labelElement.appendChild(icon);
      if (this.prefix) {
        const prefix = dom.$("span.chat-question-summary-prefix");
        prefix.textContent = this.prefix;
        labelElement.append(prefix, labelElement.ownerDocument.createTextNode(" "));
      }
      labelElement.appendChild(value);
      if (!this.contentFactory) {
        this._collapseButton.element.tabIndex = -1;
        this._collapseButton.element.setAttribute("aria-disabled", "true");
        this._collapseButton.element.removeAttribute("aria-expanded");
        this._hoverChevron?.remove();
      }
    }
    return element;
  }
  initContent() {
    return this.contentFactory?.() ?? dom.$(".chat-question-summary-empty-content");
  }
  expansionDidChange() {
    this.onDidChangeHeight();
  }
  hasSameContent(_other, _followingContent, _element) {
    return false;
  }
}
let ChatQuestionCarouselPart = class extends Disposable {
  constructor(carousel, _context, _options, _markdownRendererService, _hoverService, _accessibilityService, _contextKeyService, _keybindingService, _commandService, _configurationService, _terminalChatService) {
    super();
    this.carousel = carousel;
    this._context = _context;
    this._options = _options;
    this._markdownRendererService = _markdownRendererService;
    this._hoverService = _hoverService;
    this._accessibilityService = _accessibilityService;
    this._contextKeyService = _contextKeyService;
    this._keybindingService = _keybindingService;
    this._commandService = _commandService;
    this._configurationService = _configurationService;
    this._terminalChatService = _terminalChatService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._currentIndex = 0;
    this._answers = /* @__PURE__ */ new Map();
    this._isCollapsed = false;
    this._isSkipped = false;
    this._textInputBoxes = /* @__PURE__ */ new Map();
    this._singleSelectItems = /* @__PURE__ */ new Map();
    this._multiSelectCheckboxes = /* @__PURE__ */ new Map();
    this._freeformTextareas = /* @__PURE__ */ new Map();
    this._inputBoxes = this._register(new DisposableStore());
    this._questionRenderStore = this._register(new MutableDisposable());
    /**
     * Disposable store for interactive UI components (header, nav buttons, etc.)
     * that should be disposed when transitioning to summary view.
     */
    this._interactiveUIStore = this._register(new MutableDisposable());
    this.domNode = dom.$(".chat-question-carousel-container");
    this.domNode.classList.toggle("chat-question-carousel-conversation", carousel.answerPresentation === "conversation");
    this.domNode.id = generateUuid();
    this._inChatQuestionCarouselContextKey = ChatContextKeys.inChatQuestionCarousel.bindTo(this._contextKeyService);
    this._chatQuestionCarouselHasTerminalContextKey = ChatContextKeys.chatQuestionCarouselHasTerminal.bindTo(this._contextKeyService);
    const focusTracker = this._register(dom.trackFocus(this.domNode));
    this._register(focusTracker.onDidFocus(() => {
      this._inChatQuestionCarouselContextKey.set(true);
      this._chatQuestionCarouselHasTerminalContextKey.set(!!this.carousel.terminalId);
    }));
    this._register(focusTracker.onDidBlur(() => {
      this._inChatQuestionCarouselContextKey.set(false);
      this._chatQuestionCarouselHasTerminalContextKey.reset();
    }));
    this._register({ dispose: () => {
      this._inChatQuestionCarouselContextKey.reset();
      this._chatQuestionCarouselHasTerminalContextKey.reset();
    } });
    this.domNode.tabIndex = 0;
    this.domNode.setAttribute("role", "region");
    this.domNode.setAttribute("aria-roledescription", localize("chat.questionCarousel.roleDescription", "chat question"));
    this._updateAriaLabel();
    if (carousel instanceof ChatQuestionCarouselData) {
      if (typeof carousel.draftCurrentIndex === "number") {
        this._currentIndex = Math.max(0, Math.min(carousel.draftCurrentIndex, carousel.questions.length - 1));
      }
      if (typeof carousel.draftCollapsed === "boolean") {
        this._isCollapsed = carousel.draftCollapsed;
      }
      if (carousel.draftAnswers) {
        for (const [key, value] of Object.entries(carousel.draftAnswers)) {
          this._answers.set(key, value);
        }
      }
    }
    if (carousel.data) {
      for (const [key, value] of Object.entries(carousel.data)) {
        this._answers.set(key, value);
      }
    }
    const responseIsComplete = isResponseVM(this._context.element) && this._context.element.isComplete;
    if (carousel.isUsed || responseIsComplete) {
      this._isSkipped = true;
      this.domNode.classList.add("chat-question-carousel-used");
      this.renderSummary();
      return;
    }
    const interactiveStore = new DisposableStore();
    this._interactiveUIStore.value = interactiveStore;
    this._questionContainer = dom.$(".chat-question-carousel-content");
    this.domNode.append(this._questionContainer);
    this._headerActionsContainer = dom.$(".chat-question-header-actions");
    const collapseToggleTitle = localize("chat.questionCarousel.collapseTitle", "Collapse Questions");
    const collapseButton = interactiveStore.add(new Button(this._headerActionsContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
    collapseButton.element.classList.add("chat-question-collapse-toggle");
    collapseButton.element.setAttribute("aria-label", collapseToggleTitle);
    this._collapseButton = collapseButton;
    if (carousel.allowSkip) {
      this._closeButtonContainer = dom.$(".chat-question-close-container");
      const skipAllTitle = localize("chat.questionCarousel.skipAllTitle", "Skip all questions");
      const skipAllButton = interactiveStore.add(new Button(this._closeButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
      skipAllButton.label = `$(${Codicon.close.id})`;
      skipAllButton.element.classList.add("chat-question-close");
      skipAllButton.element.setAttribute("aria-label", skipAllTitle);
      interactiveStore.add(this._hoverService.setupDelayedHover(skipAllButton.element, { content: skipAllTitle }));
      this._skipAllButton = skipAllButton;
    }
    if (carousel.terminalId) {
      this._focusTerminalButtonContainer = dom.$(".chat-question-focus-terminal-container");
      const focusTerminalTitle = localize("chat.questionCarousel.focusTerminalTitle", "Focus Terminal");
      const kbLabel = this._keybindingService.lookupKeybinding("workbench.action.chat.focusQuestionCarouselTerminal")?.getLabel();
      const focusTerminalAriaLabel = kbLabel ? localize("chat.questionCarousel.focusTerminalAriaLabel", "Focus Terminal ({0})", kbLabel) : focusTerminalTitle;
      const focusTerminalButton = interactiveStore.add(new Button(this._focusTerminalButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
      focusTerminalButton.label = `$(${Codicon.terminal.id})`;
      focusTerminalButton.element.classList.add("chat-question-focus-terminal");
      focusTerminalButton.element.setAttribute("aria-label", focusTerminalAriaLabel);
      interactiveStore.add(this._hoverService.setupDelayedHover(focusTerminalButton.element, { content: focusTerminalTitle }));
      interactiveStore.add(focusTerminalButton.onDidClick(() => this._focusTerminal()));
      const terminalInstance = this._terminalChatService.getTerminalInstanceByExecutionId(carousel.terminalId);
      if (terminalInstance) {
        interactiveStore.add(terminalInstance.onDidInputData(() => {
          if (!this._isSkipped) {
            if (carousel instanceof ChatQuestionCarouselData) {
              carousel.dismissedByTerminalInput = true;
            }
            this.ignore();
          }
        }));
      }
    }
    interactiveStore.add(collapseButton.onDidClick(() => this.toggleCollapsed()));
    if (this._skipAllButton) {
      interactiveStore.add(this._skipAllButton.onDidClick(() => this.ignore()));
    }
    interactiveStore.add(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.Escape && this.carousel.allowSkip) {
        e.preventDefault();
        e.stopPropagation();
        this.ignore();
      } else if (event.keyCode === KeyCode.Enter && (event.metaKey || event.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        this.submit();
      } else if (event.keyCode === KeyCode.Enter && !event.shiftKey) {
        const target = e.target;
        const isTextInput = target.tagName === "INPUT" && target.type === "text";
        const isFreeformTextarea = target.tagName === "TEXTAREA" && target.classList.contains("chat-question-freeform-textarea");
        if (isTextInput || isFreeformTextarea) {
          e.preventDefault();
          e.stopPropagation();
          this.handleNextOrSubmit();
        }
      } else if ((event.ctrlKey || event.metaKey) && (event.keyCode === KeyCode.Backspace || event.keyCode === KeyCode.Delete)) {
        e.stopPropagation();
      }
    }));
    this.renderCurrentQuestion();
  }
  /**
   * Saves the current question's answer to the answers map.
   */
  saveCurrentAnswer() {
    const currentQuestion = this.carousel.questions[this._currentIndex];
    const answer = this.getCurrentAnswer();
    if (answer !== void 0) {
      this._answers.set(currentQuestion.id, answer);
    } else {
      this._answers.delete(currentQuestion.id);
    }
    if (currentQuestion?.validation && typeof answer === "string" && answer !== "") {
      const error = this.getValidationError(answer, currentQuestion.validation);
      if (error) {
        this.showValidationError(error);
      } else {
        this.clearValidationError();
      }
    } else {
      this.clearValidationError();
    }
    this.updateFooterState();
    this.persistDraftState();
  }
  persistDraftState() {
    if (this.carousel.isUsed || !(this.carousel instanceof ChatQuestionCarouselData)) {
      return;
    }
    this.carousel.draftAnswers = Object.fromEntries(this._answers.entries());
    this.carousel.draftCurrentIndex = this._currentIndex;
    this.carousel.draftCollapsed = this._isCollapsed;
  }
  toggleCollapsed() {
    this._isCollapsed = !this._isCollapsed;
    this.persistDraftState();
    this.updateCollapsedPresentation();
    this._onDidChangeHeight.fire();
  }
  _focusTerminal() {
    const terminalId = this.carousel.terminalId;
    if (!terminalId) {
      return;
    }
    this._commandService.executeCommand("workbench.action.terminal.chat.focusTerminalByExecutionId", terminalId);
  }
  updateCollapsedPresentation() {
    this.domNode.classList.toggle("chat-question-carousel-collapsed", this._isCollapsed);
    if (this._collapseButton) {
      const collapsed = this._isCollapsed;
      const buttonTitle = collapsed ? localize("chat.questionCarousel.expandTitle", "Expand Questions") : localize("chat.questionCarousel.collapseTitle", "Collapse Questions");
      const contentId = this.domNode.id;
      this._collapseButton.label = collapsed ? `$(${Codicon.chevronUp.id})` : `$(${Codicon.chevronDown.id})`;
      this._collapseButton.element.setAttribute("aria-label", buttonTitle);
      this._collapseButton.element.setAttribute("aria-expanded", String(!collapsed));
      this._collapseButton.element.setAttribute("aria-controls", contentId);
      this._collapseButton.setTitle(buttonTitle);
    }
  }
  /**
   * Navigates the carousel by the given delta.
   * @param delta Negative for previous, positive for next
   */
  navigate(delta) {
    const newIndex = this._currentIndex + delta;
    if (newIndex >= 0 && newIndex < this.carousel.questions.length) {
      this.saveCurrentAnswer();
      this._currentIndex = newIndex;
      this.persistDraftState();
      this.renderCurrentQuestion(true);
      this.domNode.focus();
    }
  }
  /**
   * Handles the next/submit behavior for keyboard and option selection flows.
   * Either advances to the next question or submits when on the last question.
   */
  handleNextOrSubmit() {
    this.saveCurrentAnswer();
    if (!this.validateCurrentQuestion()) {
      return;
    }
    if (this._currentIndex < this.carousel.questions.length - 1) {
      this._currentIndex++;
      this.persistDraftState();
      this.renderCurrentQuestion(true);
    } else {
      if (!this.validateRequiredFields()) {
        return;
      }
      this._options.onSubmit(this._answers);
      this.hideAndShowSummary();
    }
  }
  /**
   * Handles explicit submit action from the dedicated submit button.
   */
  submit() {
    this.saveCurrentAnswer();
    if (!this.validateCurrentQuestion()) {
      return;
    }
    if (!this.validateRequiredFields()) {
      return;
    }
    this._options.onSubmit(this._answers);
    this.hideAndShowSummary();
  }
  /**
   * Focuses the container element and announces the question for screen reader users.
   */
  _focusContainerAndAnnounce() {
    this.domNode.focus();
    const question = this.carousel.questions[this._currentIndex];
    if (question) {
      const questionText = getDisplayedQuestionText(question);
      const messageContent = this.getQuestionText(questionText);
      const questionCount = this.carousel.questions.length;
      const alertMessage = questionCount === 1 ? messageContent : localize("chat.questionCarousel.questionAlertMulti", "Question {0} of {1}: {2}", this._currentIndex + 1, questionCount, messageContent);
      this._accessibilityService.alert(alertMessage);
    }
  }
  /**
   * Hides the carousel UI and shows a summary of answers.
   */
  hideAndShowSummary() {
    if (this._store.isDisposed) {
      return;
    }
    this._isSkipped = true;
    this.domNode.classList.add("chat-question-carousel-used");
    this.clearInteractiveResources();
    dom.clearNode(this.domNode);
    this.renderSummary();
    this._onDidChangeHeight.fire();
  }
  /**
   * Clears and disposes all interactive UI resources (header, nav buttons, input boxes, etc.)
   * and resets references to disposed elements.
   */
  clearInteractiveResources() {
    this._interactiveUIStore.clear();
    this._questionRenderStore.clear();
    this._inputBoxes.clear();
    this._textInputBoxes.clear();
    this._singleSelectItems.clear();
    this._multiSelectCheckboxes.clear();
    this._freeformTextareas.clear();
    this._prevButton = void 0;
    this._nextButton = void 0;
    this._submitButton = void 0;
    this._skipAllButton = void 0;
    this._questionContainer = void 0;
    this._headerActionsContainer = void 0;
    this._closeButtonContainer = void 0;
    this._focusTerminalButtonContainer = void 0;
    this._collapseButton = void 0;
    this._footerRow = void 0;
    this._stepIndicator = void 0;
    this._submitHint = void 0;
    this._inputScrollable = void 0;
  }
  layoutInputScrollable(inputScrollable) {
    if (!this._questionContainer) {
      return;
    }
    const scrollableNode = inputScrollable.getDomNode();
    const scrollableContent = scrollableNode.firstElementChild;
    if (!dom.isHTMLElement(scrollableContent)) {
      return;
    }
    if (scrollableNode.style.height !== "" || scrollableNode.style.maxHeight !== "") {
      scrollableNode.style.height = "";
      scrollableNode.style.maxHeight = "";
    }
    if (scrollableContent.style.height !== "" || scrollableContent.style.maxHeight !== "") {
      scrollableContent.style.height = "";
      scrollableContent.style.maxHeight = "";
    }
    const maxContainerHeight = this._questionContainer.clientHeight;
    const computedStyle = dom.getWindow(this._questionContainer).getComputedStyle(this._questionContainer);
    const contentVerticalPadding = Number.parseFloat(computedStyle.paddingTop || "0") + Number.parseFloat(computedStyle.paddingBottom || "0");
    const nonScrollableContentHeight = Array.from(this._questionContainer.children).filter((child) => child !== scrollableNode).reduce((sum, child) => sum + child.offsetHeight, 0);
    const availableScrollableHeight = Math.floor(maxContainerHeight - contentVerticalPadding - nonScrollableContentHeight);
    const contentScrollableHeight = scrollableContent.scrollHeight;
    const constrainedScrollableHeight = Math.max(0, Math.min(availableScrollableHeight, contentScrollableHeight));
    const constrainedScrollableHeightPx = `${constrainedScrollableHeight}px`;
    if (scrollableNode.style.height !== constrainedScrollableHeightPx || scrollableNode.style.maxHeight !== constrainedScrollableHeightPx) {
      scrollableNode.style.height = constrainedScrollableHeightPx;
      scrollableNode.style.maxHeight = constrainedScrollableHeightPx;
    }
    if (scrollableContent.style.height !== constrainedScrollableHeightPx || scrollableContent.style.maxHeight !== constrainedScrollableHeightPx) {
      scrollableContent.style.height = constrainedScrollableHeightPx;
      scrollableContent.style.maxHeight = constrainedScrollableHeightPx;
    }
    inputScrollable.scanDomNode();
  }
  /**
   * Skips the carousel with default values - called when user wants to proceed quickly.
   * Returns defaults for all questions.
   *
   * `carousel.isUsed` covers resolution that did not come from this part: a
   * voice answer dismisses the carousel directly, and a later auto-skip on
   * request submit would otherwise overwrite the answer that actually landed
   * with defaults.
   */
  skip() {
    if (this._isSkipped || this.carousel.isUsed || !this.carousel.allowSkip) {
      return false;
    }
    const defaults = this.getDefaultAnswers();
    this._options.onSubmit(defaults);
    this._answers.clear();
    for (const [key, value] of defaults) {
      this._answers.set(key, value);
    }
    this.hideAndShowSummary();
    return true;
  }
  /**
   * Ignores the carousel completely - called when user wants to dismiss without data.
   * Returns undefined to signal the carousel was ignored.
   *
   * Guarded on `carousel.isUsed` for the same reason as {@link skip}.
   */
  ignore() {
    if (this._isSkipped || this.carousel.isUsed || !this.carousel.allowSkip) {
      return false;
    }
    this._isSkipped = true;
    this._options.onSubmit(void 0);
    this.clearInteractiveResources();
    this.domNode.classList.add("chat-question-carousel-used");
    dom.clearNode(this.domNode);
    this.renderTerminalStateMessage();
    this._onDidChangeHeight.fire();
    return true;
  }
  /**
   * Collects default values for all questions in the carousel.
   */
  getDefaultAnswers() {
    const answers = /* @__PURE__ */ new Map();
    for (const question of this.carousel.questions) {
      const defaultAnswer = this.getDefaultAnswerForQuestion(question);
      if (defaultAnswer !== void 0) {
        answers.set(question.id, defaultAnswer);
      }
    }
    return answers;
  }
  /**
   * Gets the default answer for a specific question.
   */
  getDefaultAnswerForQuestion(question) {
    switch (question.type) {
      case "text":
        return typeof question.defaultValue === "string" ? question.defaultValue : void 0;
      case "singleSelect": {
        const defaultOptionId = typeof question.defaultValue === "string" ? question.defaultValue : void 0;
        const defaultOption = defaultOptionId !== void 0 ? question.options?.find((opt) => opt.id === defaultOptionId) : void 0;
        const selectedValue = defaultOption?.value;
        return selectedValue !== void 0 ? { selectedValue, freeformValue: void 0 } : void 0;
      }
      case "multiSelect": {
        const defaultIds = Array.isArray(question.defaultValue) ? question.defaultValue : typeof question.defaultValue === "string" ? [question.defaultValue] : [];
        const selectedValues = question.options?.filter((opt) => defaultIds.includes(opt.id)).map((opt) => opt.value).filter((v) => v !== void 0) ?? [];
        return selectedValues.length > 0 ? { selectedValues, freeformValue: void 0 } : void 0;
      }
      default:
        return typeof question.defaultValue === "string" ? question.defaultValue : Array.isArray(question.defaultValue) ? { selectedValues: question.defaultValue } : void 0;
    }
  }
  /**
   * Returns whether auto-focus should be enabled.
   * Disabled when screen reader mode is active or when explicitly disabled via options.
   */
  _shouldAutoFocus() {
    if (this._options.shouldAutoFocus === false) {
      return false;
    }
    return !this._accessibilityService.isScreenReaderOptimized();
  }
  /**
   * Updates the aria-label of the carousel container based on the current question.
   */
  _updateAriaLabel() {
    const question = this.carousel.questions[this._currentIndex];
    if (!question) {
      this.domNode.setAttribute("aria-label", localize("chat.questionCarousel.label", "Chat question"));
      return;
    }
    const questionText = getDisplayedQuestionText(question);
    const messageContent = this.getQuestionText(questionText);
    const questionCount = this.carousel.questions.length;
    let label;
    if (questionCount === 1) {
      label = localize("chat.questionCarousel.singleQuestionLabel", "Chat question: {0}", messageContent);
    } else {
      label = localize("chat.questionCarousel.multiQuestionLabel", "Chat question {0} of {1}: {2}", this._currentIndex + 1, questionCount, messageContent);
    }
    const verbose = this._configurationService.getValue(AccessibilityVerbositySettingId.ChatQuestionCarousel);
    if (verbose && this.carousel.terminalId) {
      const kbLabel = this._keybindingService.lookupKeybinding("workbench.action.chat.focusQuestionCarouselTerminal")?.getLabel();
      if (kbLabel) {
        label = localize("chat.questionCarousel.combinedFocusTerminalHint", "{0} Use {1} to focus the terminal.", label, kbLabel);
      } else {
        label = localize("chat.questionCarousel.combinedFocusTerminalHintNoKb", "{0} Use the Focus Terminal from Question Carousel command to focus the terminal.", label);
      }
    }
    this.domNode.setAttribute("aria-label", label);
  }
  /**
   * Focuses the carousel container element.
   */
  focus() {
    this.domNode.focus();
  }
  /**
   * Returns whether the carousel container has focus.
   */
  hasFocus() {
    return dom.isAncestorOfActiveElement(this.domNode);
  }
  navigateToPreviousQuestion() {
    if (this._currentIndex <= 0) {
      return false;
    }
    this.navigate(-1);
    return true;
  }
  navigateToNextQuestion() {
    if (this._currentIndex >= this.carousel.questions.length - 1) {
      return false;
    }
    this.navigate(1);
    return true;
  }
  focusTerminal() {
    if (!this.carousel.terminalId) {
      return false;
    }
    this._focusTerminal();
    return true;
  }
  renderCurrentQuestion(focusContainerForScreenReader = false) {
    if (!this._questionContainer) {
      return;
    }
    const questionRenderStore = new DisposableStore();
    this._questionRenderStore.value = questionRenderStore;
    this._inputScrollable = void 0;
    this._inputBoxes.clear();
    this._textInputBoxes.clear();
    this._singleSelectItems.clear();
    this._multiSelectCheckboxes.clear();
    this._freeformTextareas.clear();
    dom.clearNode(this._questionContainer);
    const question = this.carousel.questions[this._currentIndex];
    if (!question) {
      return;
    }
    const headerRow = dom.$(".chat-question-header-row");
    const titleRow = dom.$(".chat-question-title-row");
    if (this.carousel.message && this._currentIndex === 0) {
      const messageMd = isMarkdownString(this.carousel.message) ? MarkdownString.lift(this.carousel.message) : new MarkdownString(this.carousel.message);
      const carouselMessage = dom.$(".chat-question-carousel-message");
      const renderedMessage = questionRenderStore.add(this._markdownRendererService.render(messageMd));
      carouselMessage.appendChild(renderedMessage.element);
      headerRow.appendChild(carouselMessage);
    }
    const questionText = getDisplayedQuestionText(question);
    if (questionText) {
      const title = dom.$(".chat-question-title");
      const messageContent = this.getQuestionText(questionText);
      title.setAttribute("aria-label", messageContent);
      const rawValue = isMarkdownString(questionText) ? questionText.value : questionText;
      const suffixed = question.required ? `${rawValue} *` : rawValue;
      const md = isMarkdownString(questionText) ? MarkdownString.lift({ ...questionText, value: suffixed }) : new MarkdownString(suffixed);
      const rendered = questionRenderStore.add(this._markdownRendererService.render(md));
      title.appendChild(rendered.element);
      titleRow.appendChild(title);
    }
    headerRow.appendChild(titleRow);
    if (this._headerActionsContainer) {
      dom.clearNode(this._headerActionsContainer);
      if (this._focusTerminalButtonContainer) {
        this._headerActionsContainer.appendChild(this._focusTerminalButtonContainer);
      }
      if (this._closeButtonContainer) {
        this._headerActionsContainer.appendChild(this._closeButtonContainer);
      }
      if (this._collapseButton) {
        this._headerActionsContainer.appendChild(this._collapseButton.element);
      }
      titleRow.appendChild(this._headerActionsContainer);
    }
    this._questionContainer.appendChild(headerRow);
    if (question.description) {
      const descriptionEl = dom.$(".chat-question-description");
      descriptionEl.textContent = question.description;
      this._questionContainer.appendChild(descriptionEl);
    }
    const inputContainer = dom.$(".chat-question-input-container");
    if (question.detailedMessage) {
      const detailedMd = isMarkdownString(question.detailedMessage) ? MarkdownString.lift(question.detailedMessage) : new MarkdownString(question.detailedMessage);
      const detailedMessageEl = dom.$(".chat-question-detailed-message");
      const renderedDetailedMessage = questionRenderStore.add(this._markdownRendererService.render(detailedMd));
      detailedMessageEl.appendChild(renderedDetailedMessage.element);
      inputContainer.appendChild(detailedMessageEl);
    }
    this.renderInput(inputContainer, question);
    const inputScrollable = questionRenderStore.add(new DomScrollableElement(inputContainer, {
      vertical: ScrollbarVisibility.Visible,
      horizontal: ScrollbarVisibility.Hidden,
      consumeMouseWheelIfScrollbarIsNeeded: true
    }));
    this._inputScrollable = inputScrollable;
    const inputScrollableNode = inputScrollable.getDomNode();
    inputScrollableNode.classList.add("chat-question-input-scrollable");
    this._questionContainer.appendChild(inputScrollableNode);
    this._validationMessageElement = dom.$(".chat-question-validation-message");
    this._validationMessageElement.style.display = "none";
    this._questionContainer.appendChild(this._validationMessageElement);
    const isSingleQuestion = this.carousel.questions.length === 1;
    if (!isSingleQuestion) {
      this.renderFooter();
    } else {
      this.renderSingleQuestionFooter();
    }
    let relayoutScheduled = false;
    const relayoutScheduler = questionRenderStore.add(new MutableDisposable());
    const scheduleLayoutInputScrollable = () => {
      if (relayoutScheduled) {
        return;
      }
      relayoutScheduled = true;
      relayoutScheduler.value = dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.domNode), () => {
        relayoutScheduled = false;
        this.layoutInputScrollable(inputScrollable);
      });
    };
    const inputResizeObserver = questionRenderStore.add(new dom.DisposableResizeObserver("ChatQuestionCarouselPart.inputScrollable", () => scheduleLayoutInputScrollable()));
    questionRenderStore.add(inputResizeObserver.observe(inputScrollableNode));
    questionRenderStore.add(inputResizeObserver.observe(inputContainer));
    questionRenderStore.add(dom.addDisposableListener(dom.getWindow(this.domNode), dom.EventType.RESIZE, () => scheduleLayoutInputScrollable()));
    scheduleLayoutInputScrollable();
    questionRenderStore.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.domNode), () => {
      inputContainer.scrollTop = 0;
      inputContainer.scrollLeft = 0;
      inputScrollable.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
      inputScrollable.scanDomNode();
    }));
    this._updateAriaLabel();
    this.updateCollapsedPresentation();
    if (focusContainerForScreenReader && this._accessibilityService.isScreenReaderOptimized()) {
      this._focusContainerAndAnnounce();
    }
    this._onDidChangeHeight.fire();
  }
  /**
   * Renders or updates the persistent footer with nav arrows, step indicator, and submit button.
   */
  renderFooter() {
    if (!this._footerRow) {
      const interactiveStore = this._interactiveUIStore.value;
      if (!interactiveStore) {
        return;
      }
      this._footerRow = dom.$(".chat-question-footer-row");
      const leftControls = dom.$(".chat-question-footer-left.chat-question-carousel-nav");
      leftControls.setAttribute("role", "navigation");
      leftControls.setAttribute("aria-label", localize("chat.questionCarousel.navigation", "Question navigation"));
      const arrowsContainer = dom.$(".chat-question-nav-arrows");
      const previousLabel = this.getLabelWithKeybinding(localize("previous", "Previous"), PREVIOUS_QUESTION_ACTION_ID);
      const prevButton = interactiveStore.add(new Button(arrowsContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
      prevButton.element.classList.add("chat-question-nav-arrow", "chat-question-nav-prev");
      prevButton.label = `$(${Codicon.chevronLeft.id})`;
      prevButton.element.setAttribute("aria-label", previousLabel);
      interactiveStore.add(this._hoverService.setupDelayedHover(prevButton.element, { content: previousLabel }));
      interactiveStore.add(prevButton.onDidClick(() => this.navigate(-1)));
      this._prevButton = prevButton;
      const nextLabel = this.getLabelWithKeybinding(localize("next", "Next"), NEXT_QUESTION_ACTION_ID);
      const nextButton = interactiveStore.add(new Button(arrowsContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
      nextButton.element.classList.add("chat-question-nav-arrow", "chat-question-nav-next");
      nextButton.label = `$(${Codicon.chevronRight.id})`;
      nextButton.element.setAttribute("aria-label", nextLabel);
      interactiveStore.add(this._hoverService.setupDelayedHover(nextButton.element, { content: nextLabel }));
      interactiveStore.add(nextButton.onDidClick(() => this.navigate(1)));
      this._nextButton = nextButton;
      leftControls.appendChild(arrowsContainer);
      this._stepIndicator = dom.$(".chat-question-step-indicator");
      leftControls.appendChild(this._stepIndicator);
      this._footerRow.appendChild(leftControls);
      const rightControls = dom.$(".chat-question-footer-right");
      const hint = dom.$("span.chat-question-submit-hint");
      hint.textContent = isMacintosh ? localize("chat.questionCarousel.submitHintMac", "\u2318\u23CE to submit") : localize("chat.questionCarousel.submitHintOther", "Ctrl+Enter to submit");
      rightControls.appendChild(hint);
      this._submitHint = hint;
      const submitButton = interactiveStore.add(new Button(rightControls, { ...defaultButtonStyles }));
      submitButton.element.classList.add("chat-question-submit-button");
      submitButton.label = localize("submit", "Submit");
      interactiveStore.add(submitButton.onDidClick(() => this.submit()));
      this._submitButton = submitButton;
      this._footerRow.appendChild(rightControls);
      this.domNode.append(this._footerRow);
    }
    this.updateFooterState();
  }
  /**
   * Updates the footer nav button enabled state and step indicator text.
   */
  updateFooterState() {
    if (this._prevButton) {
      this._prevButton.enabled = this._currentIndex > 0;
    }
    if (this._nextButton) {
      const canAdvance = this._currentIndex < this.carousel.questions.length - 1;
      const question = this.carousel.questions[this._currentIndex];
      const answer = this._answers.get(question?.id);
      const hasAnswer = answer !== void 0 && answer !== "";
      const hasValidationError = !!this._currentValidationError;
      this._nextButton.enabled = canAdvance && (!question?.required || hasAnswer) && !hasValidationError;
    }
    if (this._stepIndicator) {
      this._stepIndicator.textContent = localize(
        "chat.questionCarousel.stepIndicator",
        "{0}/{1}",
        this._currentIndex + 1,
        this.carousel.questions.length
      );
    }
    if (this._submitButton) {
      const isLastQuestion = this._currentIndex === this.carousel.questions.length - 1;
      this._submitButton.element.style.display = isLastQuestion ? "" : "none";
      if (this._submitHint) {
        this._submitHint.style.display = isLastQuestion ? "" : "none";
      }
    }
  }
  /**
   * Renders a simplified footer with just a submit button for single-question multi-select carousels.
   */
  renderSingleQuestionFooter() {
    if (!this._footerRow) {
      const interactiveStore = this._interactiveUIStore.value;
      if (!interactiveStore) {
        return;
      }
      this._footerRow = dom.$(".chat-question-footer-row");
      const leftControls = dom.$(".chat-question-footer-left.chat-question-carousel-nav");
      leftControls.setAttribute("role", "navigation");
      leftControls.setAttribute("aria-label", localize("chat.questionCarousel.navigation", "Question navigation"));
      this._footerRow.appendChild(leftControls);
      const rightControls = dom.$(".chat-question-footer-right");
      const hint = dom.$("span.chat-question-submit-hint");
      hint.textContent = isMacintosh ? localize("chat.questionCarousel.submitHintMac", "\u2318\u23CE to submit") : localize("chat.questionCarousel.submitHintOther", "Ctrl+Enter to submit");
      rightControls.appendChild(hint);
      this._submitHint = hint;
      const submitButton = interactiveStore.add(new Button(rightControls, { ...defaultButtonStyles }));
      submitButton.element.classList.add("chat-question-submit-button");
      submitButton.label = localize("submit", "Submit");
      interactiveStore.add(submitButton.onDidClick(() => this.submit()));
      this._submitButton = submitButton;
      this._footerRow.appendChild(rightControls);
      this.domNode.append(this._footerRow);
    }
  }
  getLabelWithKeybinding(label, actionId) {
    const keybindingLabel = this._keybindingService.lookupKeybinding(actionId, this._contextKeyService)?.getLabel();
    return keybindingLabel ? localize("chat.questionCarousel.labelWithKeybinding", "{0} ({1})", label, keybindingLabel) : label;
  }
  renderInput(container, question) {
    switch (question.type) {
      case "text":
        this.renderTextInput(container, question);
        break;
      case "singleSelect":
        this.renderSingleSelect(container, question);
        break;
      case "multiSelect":
        this.renderMultiSelect(container, question);
        break;
    }
  }
  /**
   * Sets up auto-resize behavior for a textarea element.
   * @returns A function that triggers the resize manually (useful for initial sizing).
   */
  setupTextareaAutoResize(textarea) {
    const autoResize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
      if (this._inputScrollable) {
        this.layoutInputScrollable(this._inputScrollable);
      }
      this._onDidChangeHeight.fire();
    };
    this._inputBoxes.add(dom.addDisposableListener(textarea, dom.EventType.INPUT, autoResize));
    return autoResize;
  }
  renderTextInput(container, question) {
    const inputBox = this._inputBoxes.add(new InputBox(container, void 0, {
      placeholder: localize("chat.questionCarousel.enterText", "Enter your answer"),
      inputBoxStyles: defaultInputBoxStyles,
      validationOptions: question.validation ? {
        validation: (value) => {
          if (!value && !question.required) {
            return null;
          }
          const error = this.getValidationError(value, question.validation);
          if (error) {
            return { type: 2, content: error };
          }
          return null;
        }
      } : void 0
    }));
    this._inputBoxes.add(inputBox.onDidChange(() => {
      this.saveCurrentAnswer();
    }));
    const previousAnswer = this._answers.get(question.id);
    if (previousAnswer !== void 0) {
      inputBox.value = String(previousAnswer);
    } else if (question.defaultValue !== void 0) {
      inputBox.value = String(question.defaultValue);
    }
    this._textInputBoxes.set(question.id, inputBox);
    if (this._shouldAutoFocus()) {
      this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(inputBox.element), () => inputBox.focus()));
    }
  }
  renderSingleSelect(container, question) {
    const orderedOptions = getOptionsWithDefaultsFirst(question);
    const selectContainer = dom.$(".chat-question-list");
    selectContainer.setAttribute("role", "listbox");
    selectContainer.setAttribute("aria-label", question.title);
    selectContainer.tabIndex = 0;
    container.appendChild(selectContainer);
    const previousAnswer = this._answers.get(question.id);
    const prevSingle = typeof previousAnswer === "object" && previousAnswer !== null && hasKey(previousAnswer, { selectedValue: true }) ? previousAnswer : void 0;
    const previousFreeform = prevSingle?.freeformValue;
    const previousSelectedValue = prevSingle?.selectedValue;
    const defaultOptionId = typeof question.defaultValue === "string" ? question.defaultValue : void 0;
    let selectedIndex = -1;
    orderedOptions.forEach(({ option }, index) => {
      if (previousSelectedValue !== void 0 && option.value === previousSelectedValue) {
        selectedIndex = index;
      } else if (selectedIndex === -1 && !previousFreeform && defaultOptionId !== void 0 && option.id === defaultOptionId) {
        selectedIndex = index;
      }
    });
    const listItems = [];
    const indicators = [];
    const updateSelection = (newIndex) => {
      listItems.forEach((item, i) => {
        const isSelected = i === newIndex;
        item.classList.toggle("selected", isSelected);
        item.setAttribute("aria-selected", String(isSelected));
        const indicator = indicators[i];
        indicator.classList.toggle("codicon", isSelected);
        indicator.classList.toggle("codicon-check", isSelected);
      });
      if (newIndex >= 0 && newIndex < listItems.length) {
        selectContainer.setAttribute("aria-activedescendant", listItems[newIndex].id);
      }
      const data = this._singleSelectItems.get(question.id);
      if (data) {
        data.selectedIndex = newIndex;
      }
      this.saveCurrentAnswer();
    };
    orderedOptions.forEach(({ option }, index) => {
      const isSelected = index === selectedIndex;
      const listItem = dom.$(".chat-question-list-item");
      listItem.setAttribute("role", "option");
      listItem.setAttribute("aria-selected", String(isSelected));
      listItem.setAttribute("aria-label", localize("chat.questionCarousel.optionLabel", "Option {0}: {1}", index + 1, option.label));
      listItem.id = `option-${question.id}-${index}`;
      listItem.tabIndex = -1;
      const number = dom.$(".chat-question-list-number");
      number.textContent = `${index + 1}`;
      listItem.appendChild(number);
      const indicator = dom.$(".chat-question-list-indicator");
      if (isSelected) {
        indicator.classList.add("codicon", "codicon-check");
      }
      indicators.push(indicator);
      const label = dom.$(".chat-question-list-label");
      const separatorIndex = option.label.indexOf(" - ");
      if (separatorIndex !== -1) {
        listItem.classList.add("has-description");
        const titleSpan = dom.$("span.chat-question-list-label-title");
        titleSpan.textContent = option.label.substring(0, separatorIndex);
        label.appendChild(titleSpan);
        const descSpan = dom.$("span.chat-question-list-label-desc");
        descSpan.textContent = option.label.substring(separatorIndex + 3);
        label.appendChild(descSpan);
      } else {
        label.textContent = option.label;
      }
      listItem.appendChild(label);
      listItem.appendChild(indicator);
      if (isSelected) {
        listItem.classList.add("selected");
      }
      this._inputBoxes.add(dom.addDisposableListener(listItem, dom.EventType.CLICK, (e) => {
        e.preventDefault();
        e.stopPropagation();
        updateSelection(index);
        const freeform = this._freeformTextareas.get(question.id);
        if (freeform) {
          freeform.value = "";
        }
        this.handleNextOrSubmit();
      }));
      this._inputBoxes.add(this._hoverService.setupDelayedHover(listItem, {
        content: option.label,
        position: { hoverPosition: HoverPosition.BELOW },
        appearance: { showPointer: true }
      }));
      selectContainer.appendChild(listItem);
      listItems.push(listItem);
    });
    this._singleSelectItems.set(question.id, { items: listItems, selectedIndex, optionIndices: orderedOptions.map((o) => o.originalIndex) });
    if (selectedIndex >= 0 && selectedIndex < listItems.length) {
      selectContainer.setAttribute("aria-activedescendant", listItems[selectedIndex].id);
    }
    let freeformTextarea;
    if (question.allowFreeformInput !== false) {
      const freeformContainer = dom.$(".chat-question-freeform");
      const freeformNumber = dom.$(".chat-question-freeform-number");
      freeformNumber.textContent = `${orderedOptions.length + 1}`;
      freeformContainer.appendChild(freeformNumber);
      freeformTextarea = dom.$("textarea.chat-question-freeform-textarea");
      freeformTextarea.placeholder = localize("chat.questionCarousel.enterCustomAnswer", "Enter custom answer");
      freeformTextarea.rows = 1;
      if (previousFreeform !== void 0) {
        freeformTextarea.value = previousFreeform;
      }
      const autoResize = this.setupTextareaAutoResize(freeformTextarea);
      const capturedFreeform = freeformTextarea;
      this._inputBoxes.add(dom.addDisposableListener(capturedFreeform, dom.EventType.INPUT, () => {
        if (capturedFreeform.value.length > 0) {
          updateSelection(-1);
        } else {
          this.saveCurrentAnswer();
        }
      }));
      freeformContainer.appendChild(freeformTextarea);
      container.appendChild(freeformContainer);
      this._freeformTextareas.set(question.id, freeformTextarea);
      if (previousFreeform !== void 0) {
        this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(capturedFreeform), () => autoResize()));
      }
    }
    this._inputBoxes.add(dom.addDisposableListener(selectContainer, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      const data = this._singleSelectItems.get(question.id);
      if (!data || !listItems.length) {
        return;
      }
      let newIndex = data.selectedIndex;
      if (event.keyCode === KeyCode.DownArrow) {
        e.preventDefault();
        newIndex = Math.min(data.selectedIndex + 1, listItems.length - 1);
      } else if (event.keyCode === KeyCode.UpArrow) {
        e.preventDefault();
        newIndex = Math.max(data.selectedIndex - 1, 0);
      } else if ((event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) && !event.metaKey && !event.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        this.handleNextOrSubmit();
        return;
      } else if (event.keyCode >= KeyCode.Digit1 && event.keyCode <= KeyCode.Digit9) {
        const numberIndex = event.keyCode - KeyCode.Digit1;
        if (numberIndex < listItems.length) {
          e.preventDefault();
          updateSelection(numberIndex);
        } else if (freeformTextarea && numberIndex === listItems.length) {
          e.preventDefault();
          updateSelection(-1);
          freeformTextarea.focus();
        }
        return;
      }
      if (newIndex !== data.selectedIndex && newIndex >= 0) {
        updateSelection(newIndex);
      }
    }));
    if (this._shouldAutoFocus()) {
      if (freeformTextarea && previousFreeform) {
        const capturedFreeform = freeformTextarea;
        this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(capturedFreeform), () => {
          capturedFreeform.focus();
        }));
      } else if (listItems.length > 0) {
        const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;
        if (selectedIndex < 0) {
          updateSelection(0);
        }
        this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(selectContainer), () => {
          listItems[focusIndex]?.focus();
        }));
      }
    }
  }
  renderMultiSelect(container, question) {
    const orderedOptions = getOptionsWithDefaultsFirst(question);
    const selectContainer = dom.$(".chat-question-list");
    selectContainer.setAttribute("role", "listbox");
    selectContainer.setAttribute("aria-multiselectable", "true");
    selectContainer.setAttribute("aria-label", question.title);
    selectContainer.tabIndex = 0;
    container.appendChild(selectContainer);
    const previousAnswer = this._answers.get(question.id);
    const prevMulti = typeof previousAnswer === "object" && previousAnswer !== null && hasKey(previousAnswer, { selectedValues: true }) ? previousAnswer : void 0;
    const previousFreeform = prevMulti?.freeformValue;
    const previousSelectedValues = prevMulti?.selectedValues ?? [];
    const defaultOptionIds = Array.isArray(question.defaultValue) ? question.defaultValue : typeof question.defaultValue === "string" ? [question.defaultValue] : [];
    const checkboxes = [];
    const listItems = [];
    let focusedIndex = 0;
    let firstCheckedIndex = -1;
    orderedOptions.forEach(({ option }, index) => {
      let isChecked = false;
      if (previousSelectedValues && previousSelectedValues.length > 0) {
        isChecked = previousSelectedValues.includes(option.value);
      } else if (!previousFreeform && defaultOptionIds.includes(option.id)) {
        isChecked = true;
      }
      const listItem = dom.$(".chat-question-list-item.multi-select");
      listItem.setAttribute("role", "option");
      listItem.setAttribute("aria-selected", String(isChecked));
      listItem.setAttribute("aria-label", localize("chat.questionCarousel.optionLabel", "Option {0}: {1}", index + 1, option.label));
      listItem.id = `option-${question.id}-${index}`;
      listItem.tabIndex = -1;
      const number = dom.$(".chat-question-list-number");
      number.textContent = `${index + 1}`;
      listItem.appendChild(number);
      const checkbox = this._inputBoxes.add(new Checkbox(option.label, isChecked, defaultCheckboxStyles));
      checkbox.domNode.classList.add("chat-question-list-checkbox");
      checkbox.domNode.tabIndex = -1;
      listItem.appendChild(checkbox.domNode);
      const label = dom.$(".chat-question-list-label");
      const separatorIndex = option.label.indexOf(" - ");
      if (separatorIndex !== -1) {
        listItem.classList.add("has-description");
        const titleSpan = dom.$("span.chat-question-list-label-title");
        titleSpan.textContent = option.label.substring(0, separatorIndex);
        label.appendChild(titleSpan);
        const descSpan = dom.$("span.chat-question-list-label-desc");
        descSpan.textContent = option.label.substring(separatorIndex + 3);
        label.appendChild(descSpan);
      } else {
        label.textContent = option.label;
      }
      listItem.appendChild(label);
      if (isChecked) {
        listItem.classList.add("checked");
        if (firstCheckedIndex === -1) {
          firstCheckedIndex = index;
        }
      }
      this._inputBoxes.add(checkbox.onChange(() => {
        listItem.classList.toggle("checked", checkbox.checked);
        listItem.setAttribute("aria-selected", String(checkbox.checked));
        this.saveCurrentAnswer();
      }));
      this._inputBoxes.add(dom.addDisposableListener(listItem, dom.EventType.CLICK, (e) => {
        focusedIndex = index;
        if (e.target !== checkbox.domNode && !checkbox.domNode.contains(e.target)) {
          checkbox.domNode.click();
        }
      }));
      this._inputBoxes.add(this._hoverService.setupDelayedHover(listItem, {
        content: option.label,
        position: { hoverPosition: HoverPosition.BELOW },
        appearance: { showPointer: true }
      }));
      selectContainer.appendChild(listItem);
      checkboxes.push(checkbox);
      listItems.push(listItem);
    });
    this._multiSelectCheckboxes.set(question.id, { checkboxes, optionIndices: orderedOptions.map((o) => o.originalIndex) });
    let freeformTextarea;
    if (question.allowFreeformInput !== false) {
      const freeformContainer = dom.$(".chat-question-freeform");
      const freeformNumber = dom.$(".chat-question-freeform-number");
      freeformNumber.textContent = `${orderedOptions.length + 1}`;
      freeformContainer.appendChild(freeformNumber);
      freeformTextarea = dom.$("textarea.chat-question-freeform-textarea");
      freeformTextarea.placeholder = localize("chat.questionCarousel.enterCustomAnswer", "Enter custom answer");
      freeformTextarea.rows = 1;
      if (previousFreeform !== void 0) {
        freeformTextarea.value = previousFreeform;
      }
      const autoResize = this.setupTextareaAutoResize(freeformTextarea);
      this._inputBoxes.add(dom.addDisposableListener(freeformTextarea, dom.EventType.INPUT, () => this.saveCurrentAnswer()));
      freeformContainer.appendChild(freeformTextarea);
      container.appendChild(freeformContainer);
      this._freeformTextareas.set(question.id, freeformTextarea);
      if (previousFreeform !== void 0) {
        this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(freeformTextarea), () => autoResize()));
      }
    }
    this._inputBoxes.add(dom.addDisposableListener(selectContainer, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (!listItems.length) {
        return;
      }
      if (event.keyCode === KeyCode.DownArrow) {
        e.preventDefault();
        focusedIndex = Math.min(focusedIndex + 1, listItems.length - 1);
        listItems[focusedIndex].focus();
      } else if (event.keyCode === KeyCode.UpArrow) {
        e.preventDefault();
        focusedIndex = Math.max(focusedIndex - 1, 0);
        listItems[focusedIndex].focus();
      } else if (event.keyCode === KeyCode.Enter && !event.metaKey && !event.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        this.handleNextOrSubmit();
      } else if (event.keyCode === KeyCode.Space) {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < checkboxes.length) {
          checkboxes[focusedIndex].domNode.click();
        }
      } else if (event.keyCode >= KeyCode.Digit1 && event.keyCode <= KeyCode.Digit9) {
        const numberIndex = event.keyCode - KeyCode.Digit1;
        if (numberIndex < checkboxes.length) {
          e.preventDefault();
          checkboxes[numberIndex].domNode.click();
        } else if (freeformTextarea && numberIndex === checkboxes.length) {
          e.preventDefault();
          freeformTextarea.focus();
        }
      }
    }));
    if (this._shouldAutoFocus()) {
      if (freeformTextarea && previousFreeform) {
        const capturedFreeform = freeformTextarea;
        this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(capturedFreeform), () => {
          capturedFreeform.focus();
        }));
      } else if (listItems.length > 0) {
        const initialFocusIndex = firstCheckedIndex >= 0 ? firstCheckedIndex : 0;
        focusedIndex = initialFocusIndex;
        this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(selectContainer), () => {
          listItems[initialFocusIndex]?.focus();
        }));
      }
    }
  }
  getCurrentAnswer() {
    const question = this.carousel.questions[this._currentIndex];
    if (!question) {
      return void 0;
    }
    switch (question.type) {
      case "text": {
        const inputBox = this._textInputBoxes.get(question.id);
        return inputBox?.value ?? (typeof question.defaultValue === "string" ? question.defaultValue : Array.isArray(question.defaultValue) ? { selectedValues: question.defaultValue } : void 0);
      }
      case "singleSelect": {
        const data = this._singleSelectItems.get(question.id);
        let selectedValue = void 0;
        if (data && data.selectedIndex >= 0) {
          const originalIndex = data.optionIndices[data.selectedIndex];
          selectedValue = originalIndex !== void 0 ? question.options?.[originalIndex]?.value : void 0;
        }
        if (selectedValue === void 0 && typeof question.defaultValue === "string") {
          const defaultOption = question.options?.find((opt) => opt.id === question.defaultValue);
          selectedValue = defaultOption?.value;
        }
        const freeformTextarea = this._freeformTextareas.get(question.id);
        const freeformValue = freeformTextarea?.value !== "" ? freeformTextarea?.value : void 0;
        if (freeformValue) {
          return { selectedValue: void 0, freeformValue };
        }
        if (selectedValue !== void 0) {
          return { selectedValue, freeformValue: void 0 };
        }
        return void 0;
      }
      case "multiSelect": {
        const data = this._multiSelectCheckboxes.get(question.id);
        const selectedValues = [];
        if (data) {
          data.checkboxes.forEach((checkbox, index) => {
            if (checkbox.checked) {
              const originalIndex = data.optionIndices[index];
              const value = originalIndex !== void 0 ? question.options?.[originalIndex]?.value : void 0;
              if (value !== void 0) {
                selectedValues.push(value);
              }
            }
          });
        }
        const freeformTextarea = this._freeformTextareas.get(question.id);
        const freeformValue = freeformTextarea?.value !== "" ? freeformTextarea?.value : void 0;
        if (freeformValue || selectedValues.length > 0) {
          return { selectedValues, freeformValue };
        }
        return void 0;
      }
      default:
        return typeof question.defaultValue === "string" ? question.defaultValue : Array.isArray(question.defaultValue) ? { selectedValues: question.defaultValue } : void 0;
    }
  }
  /**
   * Renders a terminal-state message (Skipped/Answered) when the carousel is
   * dismissed without structured answers.
   */
  renderTerminalStateMessage() {
    const summaryContainer = dom.$(".chat-question-carousel-summary");
    const isDismissedByTerminal = this.carousel instanceof ChatQuestionCarouselData && this.carousel.dismissedByTerminalInput;
    if (this.carousel.answeredExternally) {
      const answeredMessage = dom.$(".chat-question-summary-answered");
      answeredMessage.textContent = localize("chat.questionCarousel.answered", "Answered");
      summaryContainer.appendChild(answeredMessage);
    } else {
      const skippedMessage = dom.$(".chat-question-summary-skipped");
      skippedMessage.textContent = isDismissedByTerminal ? localize("chat.questionCarousel.deferredToTerminal", "Deferring to user's input in the terminal") : localize("chat.questionCarousel.skipped", "Skipped question");
      summaryContainer.appendChild(skippedMessage);
    }
    this.domNode.appendChild(summaryContainer);
  }
  /**
   * Renders a summary of answers when the carousel is already used.
   */
  renderSummary() {
    if (this._answers.size === 0) {
      if (this.carousel.answerPresentation === "conversation") {
        if (this.carousel.autoReply) {
          this.renderConversationSummary({
            answerFallback: localize("chat.questionCarousel.answeredAutomatically", "Answered automatically"),
            answerIcon: Codicon.copilotCompact
          });
        } else if (this.carousel.answeredExternally) {
          this.renderTerminalStateMessage();
        } else if (this.carousel.isUsed) {
          this.renderConversationSummary({
            answerFallback: localize("chat.questionCarousel.skippedConversation", "Skipped question"),
            answerIcon: Codicon.closeCompact,
            hideAnswerPrefix: true
          });
        }
        return;
      }
      if (this.carousel.isUsed) {
        this.renderTerminalStateMessage();
      }
      return;
    }
    if (this.carousel.answerPresentation === "conversation") {
      this.renderConversationSummary();
      return;
    }
    const summaryContainer = dom.$(".chat-question-carousel-summary");
    for (const question of this.carousel.questions) {
      const answer = this._answers.get(question.id);
      const summaryItem = dom.$(".chat-question-summary-item");
      const questionRow = dom.$("div.chat-question-summary-label");
      const questionText = getDisplayedQuestionText(question);
      let labelText = typeof questionText === "string" ? questionText : questionText.value;
      labelText = labelText.replace(/[:\s]+$/, "");
      questionRow.textContent = localize("chat.questionCarousel.summaryQuestion", "Q: {0}", labelText);
      summaryItem.appendChild(questionRow);
      if (answer !== void 0) {
        const formattedAnswer = this.formatAnswerForSummary(question, answer);
        const answerRow = dom.$("div.chat-question-summary-answer-title");
        answerRow.textContent = localize("chat.questionCarousel.summaryAnswer", "A: {0}", formattedAnswer);
        summaryItem.appendChild(answerRow);
      } else {
        const unanswered = dom.$("div.chat-question-summary-unanswered");
        unanswered.textContent = localize("chat.questionCarousel.notAnsweredYet", "Not answered yet");
        summaryItem.appendChild(unanswered);
      }
      summaryContainer.appendChild(summaryItem);
    }
    this.domNode.appendChild(summaryContainer);
  }
  renderConversationSummary(options) {
    const summaryStore = new DisposableStore();
    this._interactiveUIStore.value = summaryStore;
    const summaryContainer = dom.$(".chat-question-carousel-summary.chat-question-carousel-conversation-summary");
    this.domNode.setAttribute("aria-label", localize("chat.questionCarousel.answeredQuestions", "Answered chat questions"));
    for (const question of this.carousel.questions) {
      const answer = this._answers.get(question.id);
      const summaryItem = dom.$(".chat-question-summary-item");
      const questionValue = dom.$(".chat-question-summary-question");
      const questionText = getDisplayedQuestionText(question);
      const displayedQuestion = (typeof questionText === "string" ? questionText : questionText.value).replace(/[:\s]+$/, "");
      const questionPrefix = dom.$("span.chat-question-summary-prefix");
      questionPrefix.textContent = localize("chat.questionCarousel.questionPrefix", "Question:");
      const questionTextValue = dom.$("span.chat-question-summary-question-value");
      questionTextValue.textContent = displayedQuestion;
      summaryStore.add(this._hoverService.setupDelayedHover(questionTextValue, { content: displayedQuestion }));
      questionValue.append(questionPrefix, questionValue.ownerDocument.createTextNode(" "), questionTextValue);
      summaryItem.appendChild(questionValue);
      const decision = dom.$(".chat-question-summary-decision");
      const answerValue = answer === void 0 ? options?.answerFallback ?? localize("chat.questionCarousel.conversationNotAnswered", "Not answered yet") : this.formatAnswerForSummary(question, answer);
      const answerPrefix = options?.hideAnswerPrefix ? void 0 : localize("chat.questionCarousel.answerPrefix", "Answered:");
      const answerTitle = answerPrefix ? localize("chat.questionCarousel.conversationAnswer", "{0} {1}", answerPrefix, answerValue) : answerValue;
      const collapsibleContext = {
        ...this._context,
        content: this._context.content ?? [],
        contentIndex: this._context.contentIndex ?? 0
      };
      const answerPart = summaryStore.add(new ChatQuestionAnswerCollapsiblePart(
        answerTitle,
        answerPrefix,
        answerValue,
        options?.answerIcon ?? (this.carousel.autoReply ? Codicon.copilotCompact : Codicon.comment),
        collapsibleContext,
        question.options?.length ? () => this.renderConversationOptions(question, answer) : void 0,
        () => this._onDidChangeHeight.fire(),
        this._hoverService,
        this._configurationService
      ));
      answerPart.domNode.classList.add("chat-question-answer-collapsible");
      decision.appendChild(answerPart.domNode);
      summaryItem.appendChild(decision);
      summaryContainer.appendChild(summaryItem);
    }
    this.domNode.appendChild(summaryContainer);
  }
  renderConversationOptions(question, answer) {
    const selectedValues = /* @__PURE__ */ new Set();
    let freeformValue;
    if (typeof answer === "string") {
      selectedValues.add(answer);
    } else if (answer) {
      if (hasKey(answer, { selectedValues: true })) {
        for (const selectedValue of answer.selectedValues) {
          selectedValues.add(selectedValue);
        }
        freeformValue = answer.freeformValue;
      } else {
        const singleAnswer = answer;
        if (singleAnswer.selectedValue !== void 0) {
          selectedValues.add(singleAnswer.selectedValue);
        }
        freeformValue = singleAnswer.freeformValue;
      }
    }
    const container = dom.$(".chat-question-summary-option-details.chat-used-context-list");
    const optionsTitle = dom.$(".chat-question-summary-options-title");
    optionsTitle.textContent = localize("chat.questionCarousel.optionsTitle", "Options");
    container.appendChild(optionsTitle);
    const optionList = dom.$("ul.chat-question-summary-option-list");
    for (const option of question.options ?? []) {
      const selected = selectedValues.has(option.value);
      const optionItem = dom.$("li.chat-question-summary-option");
      optionItem.classList.toggle("selected", selected);
      optionItem.setAttribute("aria-label", selected ? localize("chat.questionCarousel.selectedOptionAriaLabel", "{0}, selected", option.label) : option.label);
      const optionLabel = dom.$("span.chat-question-summary-option-label");
      optionLabel.textContent = option.label;
      optionItem.appendChild(optionLabel);
      if (selected) {
        optionItem.appendChild(this.renderSelectedOptionState());
      }
      optionList.appendChild(optionItem);
    }
    if (freeformValue) {
      const customItem = dom.$("li.chat-question-summary-option.selected");
      customItem.setAttribute("aria-label", localize("chat.questionCarousel.selectedCustomAnswerAriaLabel", "Custom answer: {0}, selected", freeformValue));
      const customLabel = dom.$("span.chat-question-summary-option-label");
      customLabel.textContent = localize("chat.questionCarousel.customAnswer", "Custom answer: {0}", freeformValue);
      customItem.append(customLabel, this.renderSelectedOptionState());
      optionList.appendChild(customItem);
    }
    container.appendChild(optionList);
    return container;
  }
  renderSelectedOptionState() {
    const selectedState = dom.$("span.chat-question-summary-option-selected");
    const selectedIcon = dom.$("span");
    selectedIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.checkCompact));
    selectedIcon.setAttribute("aria-hidden", "true");
    selectedState.appendChild(selectedIcon);
    return selectedState;
  }
  /**
   * Formats an answer for display in the summary.
   */
  formatAnswerForSummary(question, answer) {
    if (this.carousel.autoReply && answer === AgentHostAutoReplyAnswer) {
      return localize("chat.questionCarousel.autoReplyAnswer", "The user is not available to answer your question. Choose a pragmatic option best aligned with the context of the request.");
    }
    switch (question.type) {
      case "text":
        return String(answer);
      case "singleSelect": {
        if (typeof answer === "object") {
          const { selectedValue, freeformValue } = answer;
          const selectedLabel = selectedValue !== void 0 ? question.options?.find((opt) => opt.value === selectedValue)?.label : void 0;
          if (freeformValue) {
            return freeformValue;
          }
          return selectedLabel ?? String(selectedValue ?? "");
        }
        const label = question.options?.find((opt) => opt.value === answer)?.label;
        return label ?? String(answer);
      }
      case "multiSelect": {
        if (typeof answer === "object" && hasKey(answer, { selectedValues: true })) {
          const { selectedValues, freeformValue } = answer;
          const labels = selectedValues.map((v) => question.options?.find((opt) => opt.value === v)?.label ?? String(v));
          if (freeformValue) {
            labels.push(freeformValue);
          }
          return labels.join(localize("chat.questionCarousel.listSeparator", ", "));
        }
        return String(answer);
      }
      default:
        return String(answer);
    }
  }
  getQuestionText(questionText) {
    const md = typeof questionText === "string" ? new MarkdownString(questionText) : questionText;
    return renderAsPlaintext(md);
  }
  /**
   * Validates the current question's answer against its validation rules.
   * Returns true if valid, false if validation errors were shown.
   */
  validateCurrentQuestion() {
    const question = this.carousel.questions[this._currentIndex];
    if (!question) {
      return true;
    }
    const answer = this._answers.get(question.id);
    if (question.required && (answer === void 0 || answer === "")) {
      this.showValidationError(localize("chat.questionCarousel.required", "This field is required"));
      return false;
    }
    if (question.type === "text" && question.validation && typeof answer === "string" && answer !== "") {
      const error = this.getValidationError(answer, question.validation);
      if (error) {
        this.showValidationError(error);
        return false;
      }
    }
    this.clearValidationError();
    return true;
  }
  /**
   * Validates that all required questions have been answered.
   * Returns true if all required fields are satisfied.
   */
  validateRequiredFields() {
    for (let i = 0; i < this.carousel.questions.length; i++) {
      const question = this.carousel.questions[i];
      if (!question.required) {
        continue;
      }
      const answer = this._answers.get(question.id);
      if (answer === void 0 || answer === "") {
        this.saveCurrentAnswer();
        this._currentIndex = i;
        this.persistDraftState();
        this.renderCurrentQuestion(true);
        this.showValidationError(localize("chat.questionCarousel.required", "This field is required"));
        return false;
      }
    }
    return true;
  }
  /**
   * Returns a validation error message for the given value, or undefined if valid.
   */
  getValidationError(value, validation) {
    const failure = findQuestionValidationFailure(value, validation);
    switch (failure?.kind) {
      case void 0:
        return void 0;
      case "minLength":
        return localize("chat.questionCarousel.validation.minLength", "Minimum length is {0}", failure.limit);
      case "maxLength":
        return localize("chat.questionCarousel.validation.maxLength", "Maximum length is {0}", failure.limit);
      case "email":
        return localize("chat.questionCarousel.validation.email", "Please enter a valid email address");
      case "uri":
        return localize("chat.questionCarousel.validation.uri", "Please enter a valid URI");
      case "date":
        return localize("chat.questionCarousel.validation.date", "Please enter a valid date (YYYY-MM-DD)");
      case "dateTime":
        return localize("chat.questionCarousel.validation.dateTime", "Please enter a valid date-time");
      case "number":
        return localize("chat.questionCarousel.validation.number", "Please enter a valid number");
      case "integer":
        return localize("chat.questionCarousel.validation.integer", "Please enter a valid integer");
      case "minimum":
        return localize("chat.questionCarousel.validation.minimum", "Minimum value is {0}", failure.limit);
      case "maximum":
        return localize("chat.questionCarousel.validation.maximum", "Maximum value is {0}", failure.limit);
    }
  }
  showValidationError(message) {
    this._currentValidationError = message;
    if (this._validationMessageElement) {
      this._validationMessageElement.textContent = message;
      this._validationMessageElement.style.display = "";
    }
  }
  clearValidationError() {
    this._currentValidationError = void 0;
    if (this._validationMessageElement) {
      this._validationMessageElement.textContent = "";
      this._validationMessageElement.style.display = "none";
    }
  }
  hasSameContent(other, _followingContent, element) {
    if (!this._isSkipped && !this.carousel.isUsed && isResponseVM(element) && element.isComplete) {
      return false;
    }
    return other.kind === "questionCarousel" && other === this.carousel;
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
  dispose() {
    if (!this._isSkipped && !this.carousel.isUsed) {
      this.saveCurrentAnswer();
    }
    super.dispose();
  }
};
ChatQuestionCarouselPart = __decorateClass([
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IAccessibilityService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, ICommandService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, ITerminalChatService)
], ChatQuestionCarouselPart);
export {
  ChatQuestionCarouselPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZywgaXNNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZGVmYXVsdENoZWNrYm94U3R5bGVzLCBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSW5wdXRCb3ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IENoZWNrYm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgSUNoYXRRdWVzdGlvbiwgSUNoYXRRdWVzdGlvbkNhcm91c2VsLCBJQ2hhdFF1ZXN0aW9uQW5zd2VyVmFsdWUsIElDaGF0UXVlc3Rpb25WYWxpZGF0aW9uLCBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlciwgSUNoYXRNdWx0aVNlbGVjdEFuc3dlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBmaW5kUXVlc3Rpb25WYWxpZGF0aW9uRmFpbHVyZSwgZ2V0RGlzcGxheWVkUXVlc3Rpb25UZXh0LCBnZXRPcHRpb25zV2l0aERlZmF1bHRzRmlyc3QgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxIZWxwZXJzLmpzJztcbmltcG9ydCB7IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydCwgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgSUNoYXRSZW5kZXJlckNvbnRlbnQsIGlzUmVzcG9uc2VWTSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0QXV0b1JlcGx5QW5zd2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCAnLi9tZWRpYS9jaGF0UXVlc3Rpb25DYXJvdXNlbC5jc3MnO1xuXG5jb25zdCBQUkVWSU9VU19RVUVTVElPTl9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnByZXZpb3VzUXVlc3Rpb24nO1xuY29uc3QgTkVYVF9RVUVTVElPTl9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm5leHRRdWVzdGlvbic7XG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UXVlc3Rpb25DYXJvdXNlbE9wdGlvbnMge1xuXHRvblN1Ym1pdDogKGFuc3dlcnM6IE1hcDxzdHJpbmcsIElDaGF0UXVlc3Rpb25BbnN3ZXJWYWx1ZT4gfCB1bmRlZmluZWQpID0+IHZvaWQ7XG5cdHNob3VsZEF1dG9Gb2N1cz86IGJvb2xlYW47XG59XG5cbmNsYXNzIENoYXRRdWVzdGlvbkFuc3dlckNvbGxhcHNpYmxlUGFydCBleHRlbmRzIENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0dGl0bGU6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByZWZpeDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmFsdWU6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGFuc3dlckljb246IFRoZW1lSWNvbixcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRlbnRGYWN0b3J5OiAoKCkgPT4gSFRNTEVsZW1lbnQpIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQ6ICgpID0+IHZvaWQsXG5cdFx0aG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHRpdGxlLCBjb250ZXh0LCB1bmRlZmluZWQsIGhvdmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGluaXQoKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBzdXBlci5pbml0KCk7XG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXF1ZXN0aW9uLWFuc3dlci1leHBhbmRhYmxlJywgISF0aGlzLmNvbnRlbnRGYWN0b3J5KTtcblx0XHRpZiAodGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IHRoaXMuX2NvbGxhcHNlQnV0dG9uLmxhYmVsRWxlbWVudDtcblx0XHRcdGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0Y29uc3QgaWNvbiA9IGRvbS4kKCdzcGFuLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1hbnN3ZXItaWNvbicpO1xuXHRcdFx0aWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHRoaXMuYW5zd2VySWNvbikpO1xuXHRcdFx0aWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gZG9tLiQoJ3NwYW4uY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LWFuc3dlci12YWx1ZScpO1xuXHRcdFx0dmFsdWUudGV4dENvbnRlbnQgPSB0aGlzLnZhbHVlO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodmFsdWUsIHsgY29udGVudDogdGhpcy52YWx1ZSB9KSk7XG5cdFx0XHRsYWJlbEVsZW1lbnQuYXBwZW5kQ2hpbGQoaWNvbik7XG5cdFx0XHRpZiAodGhpcy5wcmVmaXgpIHtcblx0XHRcdFx0Y29uc3QgcHJlZml4ID0gZG9tLiQoJ3NwYW4uY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LXByZWZpeCcpO1xuXHRcdFx0XHRwcmVmaXgudGV4dENvbnRlbnQgPSB0aGlzLnByZWZpeDtcblx0XHRcdFx0bGFiZWxFbGVtZW50LmFwcGVuZChwcmVmaXgsIGxhYmVsRWxlbWVudC5vd25lckRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcgJykpO1xuXHRcdFx0fVxuXHRcdFx0bGFiZWxFbGVtZW50LmFwcGVuZENoaWxkKHZhbHVlKTtcblx0XHRcdGlmICghdGhpcy5jb250ZW50RmFjdG9yeSkge1xuXHRcdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LnRhYkluZGV4ID0gLTE7XG5cdFx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJywgJ3RydWUnKTtcblx0XHRcdFx0dGhpcy5fY29sbGFwc2VCdXR0b24uZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKTtcblx0XHRcdFx0dGhpcy5faG92ZXJDaGV2cm9uPy5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgaW5pdENvbnRlbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmNvbnRlbnRGYWN0b3J5Py4oKSA/PyBkb20uJCgnLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1lbXB0eS1jb250ZW50Jyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZXhwYW5zaW9uRGlkQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMub25EaWRDaGFuZ2VIZWlnaHQoKTtcblx0fVxuXG5cdGhhc1NhbWVDb250ZW50KF9vdGhlcjogSUNoYXRSZW5kZXJlckNvbnRlbnQsIF9mb2xsb3dpbmdDb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdLCBfZWxlbWVudDogQ2hhdFRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRDb250ZW50UGFydCB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfY3VycmVudEluZGV4ID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfYW5zd2VycyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdFF1ZXN0aW9uQW5zd2VyVmFsdWU+KCk7XG5cdHByaXZhdGUgX2lzQ29sbGFwc2VkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfcXVlc3Rpb25Db250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9oZWFkZXJBY3Rpb25zQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY2xvc2VCdXR0b25Db250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9mb290ZXJSb3c6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zdGVwSW5kaWNhdG9yOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc3VibWl0SGludDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3N1Ym1pdEJ1dHRvbjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb2xsYXBzZUJ1dHRvbjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wcmV2QnV0dG9uOiBCdXR0b24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX25leHRCdXR0b246IEJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2tpcEFsbEJ1dHRvbjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2lzU2tpcHBlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RleHRJbnB1dEJveGVzOiBNYXA8c3RyaW5nLCBJbnB1dEJveD4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NpbmdsZVNlbGVjdEl0ZW1zOiBNYXA8c3RyaW5nLCB7IGl0ZW1zOiBIVE1MRWxlbWVudFtdOyBzZWxlY3RlZEluZGV4OiBudW1iZXI7IG9wdGlvbkluZGljZXM6IG51bWJlcltdIH0+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tdWx0aVNlbGVjdENoZWNrYm94ZXM6IE1hcDxzdHJpbmcsIHsgY2hlY2tib3hlczogQ2hlY2tib3hbXTsgb3B0aW9uSW5kaWNlczogbnVtYmVyW10gfT4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZyZWVmb3JtVGV4dGFyZWFzOiBNYXA8c3RyaW5nLCBIVE1MVGV4dEFyZWFFbGVtZW50PiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRCb3hlczogRGlzcG9zYWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcXVlc3Rpb25SZW5kZXJTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIF9pbnB1dFNjcm9sbGFibGU6IERvbVNjcm9sbGFibGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBEaXNwb3NhYmxlIHN0b3JlIGZvciBpbnRlcmFjdGl2ZSBVSSBjb21wb25lbnRzIChoZWFkZXIsIG5hdiBidXR0b25zLCBldGMuKVxuXHQgKiB0aGF0IHNob3VsZCBiZSBkaXNwb3NlZCB3aGVuIHRyYW5zaXRpb25pbmcgdG8gc3VtbWFyeSB2aWV3LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfaW50ZXJhY3RpdmVVSVN0b3JlOiBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbkNoYXRRdWVzdGlvbkNhcm91c2VsQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRRdWVzdGlvbkNhcm91c2VsSGFzVGVybWluYWxDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfdmFsaWRhdGlvbk1lc3NhZ2VFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3VycmVudFZhbGlkYXRpb25FcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9mb2N1c1Rlcm1pbmFsQnV0dG9uQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgY2Fyb3VzZWw6IElDaGF0UXVlc3Rpb25DYXJvdXNlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxPcHRpb25zLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDaGF0U2VydmljZTogSVRlcm1pbmFsQ2hhdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtY29udGFpbmVyJyk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtY29udmVyc2F0aW9uJywgY2Fyb3VzZWwuYW5zd2VyUHJlc2VudGF0aW9uID09PSAnY29udmVyc2F0aW9uJyk7XG5cdFx0dGhpcy5kb21Ob2RlLmlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0dGhpcy5faW5DaGF0UXVlc3Rpb25DYXJvdXNlbENvbnRleHRLZXkgPSBDaGF0Q29udGV4dEtleXMuaW5DaGF0UXVlc3Rpb25DYXJvdXNlbC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2NoYXRRdWVzdGlvbkNhcm91c2VsSGFzVGVybWluYWxDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmNoYXRRdWVzdGlvbkNhcm91c2VsSGFzVGVybWluYWwuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3Rlcihkb20udHJhY2tGb2N1cyh0aGlzLmRvbU5vZGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9pbkNoYXRRdWVzdGlvbkNhcm91c2VsQ29udGV4dEtleS5zZXQodHJ1ZSk7XG5cdFx0XHR0aGlzLl9jaGF0UXVlc3Rpb25DYXJvdXNlbEhhc1Rlcm1pbmFsQ29udGV4dEtleS5zZXQoISF0aGlzLmNhcm91c2VsLnRlcm1pbmFsSWQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHtcblx0XHRcdHRoaXMuX2luQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0XHR0aGlzLl9jaGF0UXVlc3Rpb25DYXJvdXNlbEhhc1Rlcm1pbmFsQ29udGV4dEtleS5yZXNldCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih7IGRpc3Bvc2U6ICgpID0+IHsgdGhpcy5faW5DaGF0UXVlc3Rpb25DYXJvdXNlbENvbnRleHRLZXkucmVzZXQoKTsgdGhpcy5fY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxIYXNUZXJtaW5hbENvbnRleHRLZXkucmVzZXQoKTsgfSB9KTtcblxuXHRcdC8vIFNldCB1cCBhY2Nlc3NpYmlsaXR5IGF0dHJpYnV0ZXMgZm9yIHRoZSBjYXJvdXNlbCBjb250YWluZXJcblx0XHR0aGlzLmRvbU5vZGUudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAncmVnaW9uJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1yb2xlZGVzY3JpcHRpb24nLCBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnJvbGVEZXNjcmlwdGlvbicsICdjaGF0IHF1ZXN0aW9uJykpO1xuXHRcdHRoaXMuX3VwZGF0ZUFyaWFMYWJlbCgpO1xuXG5cdFx0Ly8gUmVzdG9yZSBkcmFmdCBzdGF0ZSBmcm9tIHRyYW5zaWVudCBydW50aW1lIGZpZWxkcyB3aGVuIGF2YWlsYWJsZS5cblx0XHRpZiAoY2Fyb3VzZWwgaW5zdGFuY2VvZiBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEpIHtcblx0XHRcdGlmICh0eXBlb2YgY2Fyb3VzZWwuZHJhZnRDdXJyZW50SW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRJbmRleCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGNhcm91c2VsLmRyYWZ0Q3VycmVudEluZGV4LCBjYXJvdXNlbC5xdWVzdGlvbnMubGVuZ3RoIC0gMSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHlwZW9mIGNhcm91c2VsLmRyYWZ0Q29sbGFwc2VkID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0dGhpcy5faXNDb2xsYXBzZWQgPSBjYXJvdXNlbC5kcmFmdENvbGxhcHNlZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNhcm91c2VsLmRyYWZ0QW5zd2Vycykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhjYXJvdXNlbC5kcmFmdEFuc3dlcnMpKSB7XG5cdFx0XHRcdFx0dGhpcy5fYW5zd2Vycy5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZXN0b3JlIHN1Ym1pdHRlZCBhbnN3ZXJzIGZvciBzdW1tYXJ5IHJlbmRlcmluZy5cblx0XHRpZiAoY2Fyb3VzZWwuZGF0YSkge1xuXHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoY2Fyb3VzZWwuZGF0YSkpIHtcblx0XHRcdFx0dGhpcy5fYW5zd2Vycy5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgY2Fyb3VzZWwgd2FzIGFscmVhZHkgdXNlZCBPUiB0aGUgcmVzcG9uc2UgaXMgY29tcGxldGUsIHNob3cgc3VtbWFyeSBvZiBhbnN3ZXJzXG5cdFx0Ly8gV2hlbiByZXNwb25zZSBpcyBjb21wbGV0ZSwgdGhlIGNhcm91c2VsIGNhbiBubyBsb25nZXIgYmUgaW50ZXJhY3RlZCB3aXRoXG5cdFx0Y29uc3QgcmVzcG9uc2VJc0NvbXBsZXRlID0gaXNSZXNwb25zZVZNKHRoaXMuX2NvbnRleHQuZWxlbWVudCkgJiYgdGhpcy5fY29udGV4dC5lbGVtZW50LmlzQ29tcGxldGU7XG5cdFx0aWYgKGNhcm91c2VsLmlzVXNlZCB8fCByZXNwb25zZUlzQ29tcGxldGUpIHtcblx0XHRcdHRoaXMuX2lzU2tpcHBlZCA9IHRydWU7XG5cdFx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC11c2VkJyk7XG5cdFx0XHR0aGlzLnJlbmRlclN1bW1hcnkoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgZGlzcG9zYWJsZSBzdG9yZSBmb3IgaW50ZXJhY3RpdmUgVUkgY29tcG9uZW50c1xuXHRcdGNvbnN0IGludGVyYWN0aXZlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5faW50ZXJhY3RpdmVVSVN0b3JlLnZhbHVlID0gaW50ZXJhY3RpdmVTdG9yZTtcblxuXHRcdC8vIFF1ZXN0aW9uIGNvbnRhaW5lclxuXHRcdHRoaXMuX3F1ZXN0aW9uQ29udGFpbmVyID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLWNvbnRlbnQnKTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kKHRoaXMuX3F1ZXN0aW9uQ29udGFpbmVyKTtcblx0XHR0aGlzLl9oZWFkZXJBY3Rpb25zQ29udGFpbmVyID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWhlYWRlci1hY3Rpb25zJyk7XG5cblx0XHRjb25zdCBjb2xsYXBzZVRvZ2dsZVRpdGxlID0gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5jb2xsYXBzZVRpdGxlJywgJ0NvbGxhcHNlIFF1ZXN0aW9ucycpO1xuXHRcdGNvbnN0IGNvbGxhcHNlQnV0dG9uID0gaW50ZXJhY3RpdmVTdG9yZS5hZGQobmV3IEJ1dHRvbih0aGlzLl9oZWFkZXJBY3Rpb25zQ29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHRjb2xsYXBzZUJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtcXVlc3Rpb24tY29sbGFwc2UtdG9nZ2xlJyk7XG5cdFx0Y29sbGFwc2VCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBjb2xsYXBzZVRvZ2dsZVRpdGxlKTtcblx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbiA9IGNvbGxhcHNlQnV0dG9uO1xuXG5cdFx0Ly8gQ2xvc2Uvc2tpcCBidXR0b24gKFgpIC0gcGxhY2VkIGluIGhlYWRlciByb3csIG9ubHkgc2hvd24gd2hlbiBhbGxvd1NraXAgaXMgdHJ1ZVxuXHRcdGlmIChjYXJvdXNlbC5hbGxvd1NraXApIHtcblx0XHRcdHRoaXMuX2Nsb3NlQnV0dG9uQ29udGFpbmVyID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWNsb3NlLWNvbnRhaW5lcicpO1xuXHRcdFx0Y29uc3Qgc2tpcEFsbFRpdGxlID0gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5za2lwQWxsVGl0bGUnLCAnU2tpcCBhbGwgcXVlc3Rpb25zJyk7XG5cdFx0XHRjb25zdCBza2lwQWxsQnV0dG9uID0gaW50ZXJhY3RpdmVTdG9yZS5hZGQobmV3IEJ1dHRvbih0aGlzLl9jbG9zZUJ1dHRvbkNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdFx0XHRza2lwQWxsQnV0dG9uLmxhYmVsID0gYCQoJHtDb2RpY29uLmNsb3NlLmlkfSlgO1xuXHRcdFx0c2tpcEFsbEJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtcXVlc3Rpb24tY2xvc2UnKTtcblx0XHRcdHNraXBBbGxCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBza2lwQWxsVGl0bGUpO1xuXHRcdFx0aW50ZXJhY3RpdmVTdG9yZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHNraXBBbGxCdXR0b24uZWxlbWVudCwgeyBjb250ZW50OiBza2lwQWxsVGl0bGUgfSkpO1xuXHRcdFx0dGhpcy5fc2tpcEFsbEJ1dHRvbiA9IHNraXBBbGxCdXR0b247XG5cdFx0fVxuXG5cdFx0Ly8gRm9jdXMgVGVybWluYWwgYnV0dG9uIC0gc2hvd24gd2hlbiB0aGUgY2Fyb3VzZWwgd2FzIHRyaWdnZXJlZCBieSB0ZXJtaW5hbCBpbnB1dFxuXHRcdGlmIChjYXJvdXNlbC50ZXJtaW5hbElkKSB7XG5cdFx0XHR0aGlzLl9mb2N1c1Rlcm1pbmFsQnV0dG9uQ29udGFpbmVyID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWZvY3VzLXRlcm1pbmFsLWNvbnRhaW5lcicpO1xuXHRcdFx0Y29uc3QgZm9jdXNUZXJtaW5hbFRpdGxlID0gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5mb2N1c1Rlcm1pbmFsVGl0bGUnLCAnRm9jdXMgVGVybWluYWwnKTtcblx0XHRcdGNvbnN0IGtiTGFiZWwgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZm9jdXNRdWVzdGlvbkNhcm91c2VsVGVybWluYWwnKT8uZ2V0TGFiZWwoKTtcblx0XHRcdGNvbnN0IGZvY3VzVGVybWluYWxBcmlhTGFiZWwgPSBrYkxhYmVsXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5mb2N1c1Rlcm1pbmFsQXJpYUxhYmVsJywgJ0ZvY3VzIFRlcm1pbmFsICh7MH0pJywga2JMYWJlbClcblx0XHRcdFx0OiBmb2N1c1Rlcm1pbmFsVGl0bGU7XG5cdFx0XHRjb25zdCBmb2N1c1Rlcm1pbmFsQnV0dG9uID0gaW50ZXJhY3RpdmVTdG9yZS5hZGQobmV3IEJ1dHRvbih0aGlzLl9mb2N1c1Rlcm1pbmFsQnV0dG9uQ29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHRcdGZvY3VzVGVybWluYWxCdXR0b24ubGFiZWwgPSBgJCgke0NvZGljb24udGVybWluYWwuaWR9KWA7XG5cdFx0XHRmb2N1c1Rlcm1pbmFsQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1xdWVzdGlvbi1mb2N1cy10ZXJtaW5hbCcpO1xuXHRcdFx0Zm9jdXNUZXJtaW5hbEJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGZvY3VzVGVybWluYWxBcmlhTGFiZWwpO1xuXHRcdFx0aW50ZXJhY3RpdmVTdG9yZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKGZvY3VzVGVybWluYWxCdXR0b24uZWxlbWVudCwgeyBjb250ZW50OiBmb2N1c1Rlcm1pbmFsVGl0bGUgfSkpO1xuXHRcdFx0aW50ZXJhY3RpdmVTdG9yZS5hZGQoZm9jdXNUZXJtaW5hbEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuX2ZvY3VzVGVybWluYWwoKSkpO1xuXG5cdFx0XHQvLyBEaXNtaXNzIHRoZSBjYXJvdXNlbCB3aGVuIHRoZSB1c2VyIHR5cGVzIGRpcmVjdGx5IGluIHRoZSB0ZXJtaW5hbCxcblx0XHRcdC8vIHNpbmNlIHRoZXkgYXJlIGFuc3dlcmluZyB0aGUgcHJvbXB0IHRoZW1zZWx2ZXMuXG5cdFx0XHRjb25zdCB0ZXJtaW5hbEluc3RhbmNlID0gdGhpcy5fdGVybWluYWxDaGF0U2VydmljZS5nZXRUZXJtaW5hbEluc3RhbmNlQnlFeGVjdXRpb25JZChjYXJvdXNlbC50ZXJtaW5hbElkKTtcblx0XHRcdGlmICh0ZXJtaW5hbEluc3RhbmNlKSB7XG5cdFx0XHRcdGludGVyYWN0aXZlU3RvcmUuYWRkKHRlcm1pbmFsSW5zdGFuY2Uub25EaWRJbnB1dERhdGEoKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghdGhpcy5faXNTa2lwcGVkKSB7XG5cdFx0XHRcdFx0XHRpZiAoY2Fyb3VzZWwgaW5zdGFuY2VvZiBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEpIHtcblx0XHRcdFx0XHRcdFx0Y2Fyb3VzZWwuZGlzbWlzc2VkQnlUZXJtaW5hbElucHV0ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRoaXMuaWdub3JlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVnaXN0ZXIgZXZlbnQgbGlzdGVuZXJzXG5cdFx0aW50ZXJhY3RpdmVTdG9yZS5hZGQoY29sbGFwc2VCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLnRvZ2dsZUNvbGxhcHNlZCgpKSk7XG5cblx0XHRpZiAodGhpcy5fc2tpcEFsbEJ1dHRvbikge1xuXHRcdFx0aW50ZXJhY3RpdmVTdG9yZS5hZGQodGhpcy5fc2tpcEFsbEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuaWdub3JlKCkpKTtcblx0XHR9XG5cblx0XHQvLyBSZWdpc3RlciBrZXlib2FyZCBuYXZpZ2F0aW9uXG5cdFx0aW50ZXJhY3RpdmVTdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5Fc2NhcGUgJiYgdGhpcy5jYXJvdXNlbC5hbGxvd1NraXApIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLmlnbm9yZSgpO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyICYmIChldmVudC5tZXRhS2V5IHx8IGV2ZW50LmN0cmxLZXkpKSB7XG5cdFx0XHRcdC8vIENtZC9DdHJsK0VudGVyIHN1Ym1pdHMgaW1tZWRpYXRlbHkgZnJvbSBhbnl3aGVyZVxuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuc3VibWl0KCk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIgJiYgIWV2ZW50LnNoaWZ0S2V5KSB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0XHRjb25zdCBpc1RleHRJbnB1dCA9IHRhcmdldC50YWdOYW1lID09PSAnSU5QVVQnICYmICh0YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudHlwZSA9PT0gJ3RleHQnO1xuXHRcdFx0XHRjb25zdCBpc0ZyZWVmb3JtVGV4dGFyZWEgPSB0YXJnZXQudGFnTmFtZSA9PT0gJ1RFWFRBUkVBJyAmJiB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXF1ZXN0aW9uLWZyZWVmb3JtLXRleHRhcmVhJyk7XG5cdFx0XHRcdGlmIChpc1RleHRJbnB1dCB8fCBpc0ZyZWVmb3JtVGV4dGFyZWEpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHR0aGlzLmhhbmRsZU5leHRPclN1Ym1pdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKChldmVudC5jdHJsS2V5IHx8IGV2ZW50Lm1ldGFLZXkpICYmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkJhY2tzcGFjZSB8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkRlbGV0ZSkpIHtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBJbml0aWFsaXplIHRoZSBjYXJvdXNlbFxuXHRcdHRoaXMucmVuZGVyQ3VycmVudFF1ZXN0aW9uKCk7XG5cdH1cblxuXHQvKipcblx0ICogU2F2ZXMgdGhlIGN1cnJlbnQgcXVlc3Rpb24ncyBhbnN3ZXIgdG8gdGhlIGFuc3dlcnMgbWFwLlxuXHQgKi9cblx0cHJpdmF0ZSBzYXZlQ3VycmVudEFuc3dlcigpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50UXVlc3Rpb24gPSB0aGlzLmNhcm91c2VsLnF1ZXN0aW9uc1t0aGlzLl9jdXJyZW50SW5kZXhdO1xuXHRcdGNvbnN0IGFuc3dlciA9IHRoaXMuZ2V0Q3VycmVudEFuc3dlcigpO1xuXHRcdGlmIChhbnN3ZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fYW5zd2Vycy5zZXQoY3VycmVudFF1ZXN0aW9uLmlkLCBhbnN3ZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hbnN3ZXJzLmRlbGV0ZShjdXJyZW50UXVlc3Rpb24uaWQpO1xuXHRcdH1cblxuXHRcdC8vIFZhbGlkYXRlIG9uIGNoYW5nZSB0byB1cGRhdGUgdGhlIE5leHQgYnV0dG9uIHN0YXRlXG5cdFx0aWYgKGN1cnJlbnRRdWVzdGlvbj8udmFsaWRhdGlvbiAmJiB0eXBlb2YgYW5zd2VyID09PSAnc3RyaW5nJyAmJiBhbnN3ZXIgIT09ICcnKSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IHRoaXMuZ2V0VmFsaWRhdGlvbkVycm9yKGFuc3dlciwgY3VycmVudFF1ZXN0aW9uLnZhbGlkYXRpb24pO1xuXHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuc2hvd1ZhbGlkYXRpb25FcnJvcihlcnJvcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNsZWFyVmFsaWRhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2xlYXJWYWxpZGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUZvb3RlclN0YXRlKCk7XG5cdFx0dGhpcy5wZXJzaXN0RHJhZnRTdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBwZXJzaXN0RHJhZnRTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYXJvdXNlbC5pc1VzZWQgfHwgISh0aGlzLmNhcm91c2VsIGluc3RhbmNlb2YgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY2Fyb3VzZWwuZHJhZnRBbnN3ZXJzID0gT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMuX2Fuc3dlcnMuZW50cmllcygpKTtcblx0XHR0aGlzLmNhcm91c2VsLmRyYWZ0Q3VycmVudEluZGV4ID0gdGhpcy5fY3VycmVudEluZGV4O1xuXHRcdHRoaXMuY2Fyb3VzZWwuZHJhZnRDb2xsYXBzZWQgPSB0aGlzLl9pc0NvbGxhcHNlZDtcblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlQ29sbGFwc2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzQ29sbGFwc2VkID0gIXRoaXMuX2lzQ29sbGFwc2VkO1xuXHRcdHRoaXMucGVyc2lzdERyYWZ0U3RhdGUoKTtcblx0XHR0aGlzLnVwZGF0ZUNvbGxhcHNlZFByZXNlbnRhdGlvbigpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZvY3VzVGVybWluYWwoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVybWluYWxJZCA9IHRoaXMuY2Fyb3VzZWwudGVybWluYWxJZDtcblx0XHRpZiAoIXRlcm1pbmFsSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2hhdC5mb2N1c1Rlcm1pbmFsQnlFeGVjdXRpb25JZCcsIHRlcm1pbmFsSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb2xsYXBzZWRQcmVzZW50YXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtY29sbGFwc2VkJywgdGhpcy5faXNDb2xsYXBzZWQpO1xuXG5cdFx0aWYgKHRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHRjb25zdCBjb2xsYXBzZWQgPSB0aGlzLl9pc0NvbGxhcHNlZDtcblx0XHRcdGNvbnN0IGJ1dHRvblRpdGxlID0gY29sbGFwc2VkXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5leHBhbmRUaXRsZScsICdFeHBhbmQgUXVlc3Rpb25zJylcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLmNvbGxhcHNlVGl0bGUnLCAnQ29sbGFwc2UgUXVlc3Rpb25zJyk7XG5cdFx0XHRjb25zdCBjb250ZW50SWQgPSB0aGlzLmRvbU5vZGUuaWQ7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5sYWJlbCA9IGNvbGxhcHNlZCA/IGAkKCR7Q29kaWNvbi5jaGV2cm9uVXAuaWR9KWAgOiBgJCgke0NvZGljb24uY2hldnJvbkRvd24uaWR9KWA7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGJ1dHRvblRpdGxlKTtcblx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKCFjb2xsYXBzZWQpKTtcblx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWNvbnRyb2xzJywgY29udGVudElkKTtcblx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLnNldFRpdGxlKGJ1dHRvblRpdGxlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogTmF2aWdhdGVzIHRoZSBjYXJvdXNlbCBieSB0aGUgZ2l2ZW4gZGVsdGEuXG5cdCAqIEBwYXJhbSBkZWx0YSBOZWdhdGl2ZSBmb3IgcHJldmlvdXMsIHBvc2l0aXZlIGZvciBuZXh0XG5cdCAqL1xuXHRwcml2YXRlIG5hdmlnYXRlKGRlbHRhOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdJbmRleCA9IHRoaXMuX2N1cnJlbnRJbmRleCArIGRlbHRhO1xuXHRcdGlmIChuZXdJbmRleCA+PSAwICYmIG5ld0luZGV4IDwgdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnNhdmVDdXJyZW50QW5zd2VyKCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50SW5kZXggPSBuZXdJbmRleDtcblx0XHRcdHRoaXMucGVyc2lzdERyYWZ0U3RhdGUoKTtcblx0XHRcdHRoaXMucmVuZGVyQ3VycmVudFF1ZXN0aW9uKHRydWUpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgdGhlIG5leHQvc3VibWl0IGJlaGF2aW9yIGZvciBrZXlib2FyZCBhbmQgb3B0aW9uIHNlbGVjdGlvbiBmbG93cy5cblx0ICogRWl0aGVyIGFkdmFuY2VzIHRvIHRoZSBuZXh0IHF1ZXN0aW9uIG9yIHN1Ym1pdHMgd2hlbiBvbiB0aGUgbGFzdCBxdWVzdGlvbi5cblx0ICovXG5cdHByaXZhdGUgaGFuZGxlTmV4dE9yU3VibWl0KCk6IHZvaWQge1xuXHRcdHRoaXMuc2F2ZUN1cnJlbnRBbnN3ZXIoKTtcblxuXHRcdGlmICghdGhpcy52YWxpZGF0ZUN1cnJlbnRRdWVzdGlvbigpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRJbmRleCA8IHRoaXMuY2Fyb3VzZWwucXVlc3Rpb25zLmxlbmd0aCAtIDEpIHtcblx0XHRcdC8vIE1vdmUgdG8gbmV4dCBxdWVzdGlvblxuXHRcdFx0dGhpcy5fY3VycmVudEluZGV4Kys7XG5cdFx0XHR0aGlzLnBlcnNpc3REcmFmdFN0YXRlKCk7XG5cdFx0XHR0aGlzLnJlbmRlckN1cnJlbnRRdWVzdGlvbih0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gU3VibWl0XG5cdFx0XHRpZiAoIXRoaXMudmFsaWRhdGVSZXF1aXJlZEZpZWxkcygpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29wdGlvbnMub25TdWJtaXQodGhpcy5fYW5zd2Vycyk7XG5cdFx0XHR0aGlzLmhpZGVBbmRTaG93U3VtbWFyeSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIGV4cGxpY2l0IHN1Ym1pdCBhY3Rpb24gZnJvbSB0aGUgZGVkaWNhdGVkIHN1Ym1pdCBidXR0b24uXG5cdCAqL1xuXHRwcml2YXRlIHN1Ym1pdCgpOiB2b2lkIHtcblx0XHR0aGlzLnNhdmVDdXJyZW50QW5zd2VyKCk7XG5cdFx0aWYgKCF0aGlzLnZhbGlkYXRlQ3VycmVudFF1ZXN0aW9uKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnZhbGlkYXRlUmVxdWlyZWRGaWVsZHMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9vcHRpb25zLm9uU3VibWl0KHRoaXMuX2Fuc3dlcnMpO1xuXHRcdHRoaXMuaGlkZUFuZFNob3dTdW1tYXJ5KCk7XG5cdH1cblxuXHQvKipcblx0ICogRm9jdXNlcyB0aGUgY29udGFpbmVyIGVsZW1lbnQgYW5kIGFubm91bmNlcyB0aGUgcXVlc3Rpb24gZm9yIHNjcmVlbiByZWFkZXIgdXNlcnMuXG5cdCAqL1xuXHRwcml2YXRlIF9mb2N1c0NvbnRhaW5lckFuZEFubm91bmNlKCk6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZS5mb2N1cygpO1xuXHRcdGNvbnN0IHF1ZXN0aW9uID0gdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnNbdGhpcy5fY3VycmVudEluZGV4XTtcblx0XHRpZiAocXVlc3Rpb24pIHtcblx0XHRcdGNvbnN0IHF1ZXN0aW9uVGV4dCA9IGdldERpc3BsYXllZFF1ZXN0aW9uVGV4dChxdWVzdGlvbik7XG5cdFx0XHRjb25zdCBtZXNzYWdlQ29udGVudCA9IHRoaXMuZ2V0UXVlc3Rpb25UZXh0KHF1ZXN0aW9uVGV4dCk7XG5cdFx0XHRjb25zdCBxdWVzdGlvbkNvdW50ID0gdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnMubGVuZ3RoO1xuXHRcdFx0Y29uc3QgYWxlcnRNZXNzYWdlID0gcXVlc3Rpb25Db3VudCA9PT0gMVxuXHRcdFx0XHQ/IG1lc3NhZ2VDb250ZW50XG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5xdWVzdGlvbkFsZXJ0TXVsdGknLCAnUXVlc3Rpb24gezB9IG9mIHsxfTogezJ9JywgdGhpcy5fY3VycmVudEluZGV4ICsgMSwgcXVlc3Rpb25Db3VudCwgbWVzc2FnZUNvbnRlbnQpO1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuYWxlcnQoYWxlcnRNZXNzYWdlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSGlkZXMgdGhlIGNhcm91c2VsIFVJIGFuZCBzaG93cyBhIHN1bW1hcnkgb2YgYW5zd2Vycy5cblx0ICovXG5cdHByaXZhdGUgaGlkZUFuZFNob3dTdW1tYXJ5KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNTa2lwcGVkID0gdHJ1ZTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC11c2VkJyk7XG5cblx0XHQvLyBEaXNwb3NlIGludGVyYWN0aXZlIFVJIGFuZCBjbGVhciBET01cblx0XHR0aGlzLmNsZWFySW50ZXJhY3RpdmVSZXNvdXJjZXMoKTtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuZG9tTm9kZSk7XG5cblx0XHQvLyBSZW5kZXIgc3VtbWFyeVxuXHRcdHRoaXMucmVuZGVyU3VtbWFyeSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhcnMgYW5kIGRpc3Bvc2VzIGFsbCBpbnRlcmFjdGl2ZSBVSSByZXNvdXJjZXMgKGhlYWRlciwgbmF2IGJ1dHRvbnMsIGlucHV0IGJveGVzLCBldGMuKVxuXHQgKiBhbmQgcmVzZXRzIHJlZmVyZW5jZXMgdG8gZGlzcG9zZWQgZWxlbWVudHMuXG5cdCAqL1xuXHRwcml2YXRlIGNsZWFySW50ZXJhY3RpdmVSZXNvdXJjZXMoKTogdm9pZCB7XG5cdFx0Ly8gRGlzcG9zZSBpbnRlcmFjdGl2ZSBVSSBkaXNwb3NhYmxlcyAoaGVhZGVyLCBuYXYgYnV0dG9ucywgZXRjLilcblx0XHR0aGlzLl9pbnRlcmFjdGl2ZVVJU3RvcmUuY2xlYXIoKTtcblx0XHR0aGlzLl9xdWVzdGlvblJlbmRlclN0b3JlLmNsZWFyKCk7XG5cdFx0dGhpcy5faW5wdXRCb3hlcy5jbGVhcigpO1xuXHRcdHRoaXMuX3RleHRJbnB1dEJveGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fc2luZ2xlU2VsZWN0SXRlbXMuY2xlYXIoKTtcblx0XHR0aGlzLl9tdWx0aVNlbGVjdENoZWNrYm94ZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9mcmVlZm9ybVRleHRhcmVhcy5jbGVhcigpO1xuXG5cdFx0Ly8gQ2xlYXIgcmVmZXJlbmNlcyB0byBkaXNwb3NlZCBlbGVtZW50c1xuXHRcdHRoaXMuX3ByZXZCdXR0b24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbmV4dEJ1dHRvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zdWJtaXRCdXR0b24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2tpcEFsbEJ1dHRvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9xdWVzdGlvbkNvbnRhaW5lciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9oZWFkZXJBY3Rpb25zQ29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2Nsb3NlQnV0dG9uQ29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2ZvY3VzVGVybWluYWxCdXR0b25Db250YWluZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY29sbGFwc2VCdXR0b24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZm9vdGVyUm93ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3N0ZXBJbmRpY2F0b3IgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc3VibWl0SGludCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9pbnB1dFNjcm9sbGFibGUgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGxheW91dElucHV0U2Nyb2xsYWJsZShpbnB1dFNjcm9sbGFibGU6IERvbVNjcm9sbGFibGVFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9xdWVzdGlvbkNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNjcm9sbGFibGVOb2RlID0gaW5wdXRTY3JvbGxhYmxlLmdldERvbU5vZGUoKTtcblx0XHRjb25zdCBzY3JvbGxhYmxlQ29udGVudCA9IHNjcm9sbGFibGVOb2RlLmZpcnN0RWxlbWVudENoaWxkO1xuXHRcdGlmICghZG9tLmlzSFRNTEVsZW1lbnQoc2Nyb2xsYWJsZUNvbnRlbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgc3RhbGUgc2l6ZSBjb25zdHJhaW50cyBmaXJzdCBzbyB0aGlzIHN0ZXAgY2FuIHNocmluayBhZnRlclxuXHRcdC8vIG5hdmlnYXRpbmcgZnJvbSBhIHRhbGxlciBxdWVzdGlvbi5cblx0XHRpZiAoc2Nyb2xsYWJsZU5vZGUuc3R5bGUuaGVpZ2h0ICE9PSAnJyB8fCBzY3JvbGxhYmxlTm9kZS5zdHlsZS5tYXhIZWlnaHQgIT09ICcnKSB7XG5cdFx0XHRzY3JvbGxhYmxlTm9kZS5zdHlsZS5oZWlnaHQgPSAnJztcblx0XHRcdHNjcm9sbGFibGVOb2RlLnN0eWxlLm1heEhlaWdodCA9ICcnO1xuXHRcdH1cblx0XHRpZiAoc2Nyb2xsYWJsZUNvbnRlbnQuc3R5bGUuaGVpZ2h0ICE9PSAnJyB8fCBzY3JvbGxhYmxlQ29udGVudC5zdHlsZS5tYXhIZWlnaHQgIT09ICcnKSB7XG5cdFx0XHRzY3JvbGxhYmxlQ29udGVudC5zdHlsZS5oZWlnaHQgPSAnJztcblx0XHRcdHNjcm9sbGFibGVDb250ZW50LnN0eWxlLm1heEhlaWdodCA9ICcnO1xuXHRcdH1cblxuXHRcdC8vIFVzZSB0aGUgZmxleC1yZXNvbHZlZCBjb250YWluZXIgaGVpZ2h0IChjb25zdHJhaW5lZCBieSBDU1MgbWF4LWhlaWdodClcblx0XHQvLyBpbnN0ZWFkIG9mIHdpbmRvdy5pbm5lckhlaWdodCwgc28gdGhlIHNjcm9sbCB2aWV3cG9ydCB0cmFja3MgYWN0dWFsIGNoYXQgc3BhY2UuXG5cdFx0Y29uc3QgbWF4Q29udGFpbmVySGVpZ2h0ID0gdGhpcy5fcXVlc3Rpb25Db250YWluZXIuY2xpZW50SGVpZ2h0O1xuXG5cdFx0Y29uc3QgY29tcHV0ZWRTdHlsZSA9IGRvbS5nZXRXaW5kb3codGhpcy5fcXVlc3Rpb25Db250YWluZXIpLmdldENvbXB1dGVkU3R5bGUodGhpcy5fcXVlc3Rpb25Db250YWluZXIpO1xuXHRcdGNvbnN0IGNvbnRlbnRWZXJ0aWNhbFBhZGRpbmcgPVxuXHRcdFx0TnVtYmVyLnBhcnNlRmxvYXQoY29tcHV0ZWRTdHlsZS5wYWRkaW5nVG9wIHx8ICcwJykgK1xuXHRcdFx0TnVtYmVyLnBhcnNlRmxvYXQoY29tcHV0ZWRTdHlsZS5wYWRkaW5nQm90dG9tIHx8ICcwJyk7XG5cblx0XHRjb25zdCBub25TY3JvbGxhYmxlQ29udGVudEhlaWdodCA9IEFycmF5LmZyb20odGhpcy5fcXVlc3Rpb25Db250YWluZXIuY2hpbGRyZW4pXG5cdFx0XHQuZmlsdGVyKGNoaWxkID0+IGNoaWxkICE9PSBzY3JvbGxhYmxlTm9kZSlcblx0XHRcdC5yZWR1Y2UoKHN1bSwgY2hpbGQpID0+IHN1bSArIChjaGlsZCBhcyBIVE1MRWxlbWVudCkub2Zmc2V0SGVpZ2h0LCAwKTtcblxuXHRcdGNvbnN0IGF2YWlsYWJsZVNjcm9sbGFibGVIZWlnaHQgPSBNYXRoLmZsb29yKG1heENvbnRhaW5lckhlaWdodCAtIGNvbnRlbnRWZXJ0aWNhbFBhZGRpbmcgLSBub25TY3JvbGxhYmxlQ29udGVudEhlaWdodCk7XG5cblx0XHRjb25zdCBjb250ZW50U2Nyb2xsYWJsZUhlaWdodCA9IHNjcm9sbGFibGVDb250ZW50LnNjcm9sbEhlaWdodDtcblx0XHRjb25zdCBjb25zdHJhaW5lZFNjcm9sbGFibGVIZWlnaHQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihhdmFpbGFibGVTY3JvbGxhYmxlSGVpZ2h0LCBjb250ZW50U2Nyb2xsYWJsZUhlaWdodCkpO1xuXHRcdGNvbnN0IGNvbnN0cmFpbmVkU2Nyb2xsYWJsZUhlaWdodFB4ID0gYCR7Y29uc3RyYWluZWRTY3JvbGxhYmxlSGVpZ2h0fXB4YDtcblxuXHRcdC8vIENvbnN0cmFpbiB3cmFwcGVyICsgY29udGVudCBzbyBubyBzdGFsZSBmbGV4IHNpemluZyBzdXJ2aXZlcyBiZXR3ZWVuIHN0ZXBzLlxuXHRcdGlmIChzY3JvbGxhYmxlTm9kZS5zdHlsZS5oZWlnaHQgIT09IGNvbnN0cmFpbmVkU2Nyb2xsYWJsZUhlaWdodFB4IHx8IHNjcm9sbGFibGVOb2RlLnN0eWxlLm1heEhlaWdodCAhPT0gY29uc3RyYWluZWRTY3JvbGxhYmxlSGVpZ2h0UHgpIHtcblx0XHRcdHNjcm9sbGFibGVOb2RlLnN0eWxlLmhlaWdodCA9IGNvbnN0cmFpbmVkU2Nyb2xsYWJsZUhlaWdodFB4O1xuXHRcdFx0c2Nyb2xsYWJsZU5vZGUuc3R5bGUubWF4SGVpZ2h0ID0gY29uc3RyYWluZWRTY3JvbGxhYmxlSGVpZ2h0UHg7XG5cdFx0fVxuXG5cdFx0Ly8gQ29uc3RyYWluIHRoZSBjb250ZW50IGVsZW1lbnQgKERvbVNjcm9sbGFibGVFbGVtZW50Ll9lbGVtZW50KSBzbyB0aGF0XG5cdFx0Ly8gc2NhbkRvbU5vZGUgc2VlcyBjbGllbnRIZWlnaHQgPCBzY3JvbGxIZWlnaHQgYW5kIGVuYWJsZXMgc2Nyb2xsaW5nLlxuXHRcdGlmIChzY3JvbGxhYmxlQ29udGVudC5zdHlsZS5oZWlnaHQgIT09IGNvbnN0cmFpbmVkU2Nyb2xsYWJsZUhlaWdodFB4IHx8IHNjcm9sbGFibGVDb250ZW50LnN0eWxlLm1heEhlaWdodCAhPT0gY29uc3RyYWluZWRTY3JvbGxhYmxlSGVpZ2h0UHgpIHtcblx0XHRcdHNjcm9sbGFibGVDb250ZW50LnN0eWxlLmhlaWdodCA9IGNvbnN0cmFpbmVkU2Nyb2xsYWJsZUhlaWdodFB4O1xuXHRcdFx0c2Nyb2xsYWJsZUNvbnRlbnQuc3R5bGUubWF4SGVpZ2h0ID0gY29uc3RyYWluZWRTY3JvbGxhYmxlSGVpZ2h0UHg7XG5cdFx0fVxuXHRcdGlucHV0U2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNraXBzIHRoZSBjYXJvdXNlbCB3aXRoIGRlZmF1bHQgdmFsdWVzIC0gY2FsbGVkIHdoZW4gdXNlciB3YW50cyB0byBwcm9jZWVkIHF1aWNrbHkuXG5cdCAqIFJldHVybnMgZGVmYXVsdHMgZm9yIGFsbCBxdWVzdGlvbnMuXG5cdCAqXG5cdCAqIGBjYXJvdXNlbC5pc1VzZWRgIGNvdmVycyByZXNvbHV0aW9uIHRoYXQgZGlkIG5vdCBjb21lIGZyb20gdGhpcyBwYXJ0OiBhXG5cdCAqIHZvaWNlIGFuc3dlciBkaXNtaXNzZXMgdGhlIGNhcm91c2VsIGRpcmVjdGx5LCBhbmQgYSBsYXRlciBhdXRvLXNraXAgb25cblx0ICogcmVxdWVzdCBzdWJtaXQgd291bGQgb3RoZXJ3aXNlIG92ZXJ3cml0ZSB0aGUgYW5zd2VyIHRoYXQgYWN0dWFsbHkgbGFuZGVkXG5cdCAqIHdpdGggZGVmYXVsdHMuXG5cdCAqL1xuXHRwdWJsaWMgc2tpcCgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5faXNTa2lwcGVkIHx8IHRoaXMuY2Fyb3VzZWwuaXNVc2VkIHx8ICF0aGlzLmNhcm91c2VsLmFsbG93U2tpcCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmF1bHRzID0gdGhpcy5nZXREZWZhdWx0QW5zd2VycygpO1xuXHRcdHRoaXMuX29wdGlvbnMub25TdWJtaXQoZGVmYXVsdHMpO1xuXG5cdFx0Ly8gUmVzZXQgYW5zd2VycyB0byBtYXRjaCBzdWJtaXR0ZWQgZGVmYXVsdHMgZm9yIHN1bW1hcnkgZGlzcGxheVxuXHRcdHRoaXMuX2Fuc3dlcnMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBkZWZhdWx0cykge1xuXHRcdFx0dGhpcy5fYW5zd2Vycy5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0fVxuXHRcdHRoaXMuaGlkZUFuZFNob3dTdW1tYXJ5KCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogSWdub3JlcyB0aGUgY2Fyb3VzZWwgY29tcGxldGVseSAtIGNhbGxlZCB3aGVuIHVzZXIgd2FudHMgdG8gZGlzbWlzcyB3aXRob3V0IGRhdGEuXG5cdCAqIFJldHVybnMgdW5kZWZpbmVkIHRvIHNpZ25hbCB0aGUgY2Fyb3VzZWwgd2FzIGlnbm9yZWQuXG5cdCAqXG5cdCAqIEd1YXJkZWQgb24gYGNhcm91c2VsLmlzVXNlZGAgZm9yIHRoZSBzYW1lIHJlYXNvbiBhcyB7QGxpbmsgc2tpcH0uXG5cdCAqL1xuXHRwdWJsaWMgaWdub3JlKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9pc1NraXBwZWQgfHwgdGhpcy5jYXJvdXNlbC5pc1VzZWQgfHwgIXRoaXMuY2Fyb3VzZWwuYWxsb3dTa2lwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX2lzU2tpcHBlZCA9IHRydWU7XG5cblx0XHR0aGlzLl9vcHRpb25zLm9uU3VibWl0KHVuZGVmaW5lZCk7XG5cblx0XHQvLyBEaXNwb3NlIGludGVyYWN0aXZlIFVJIGFuZCBjbGVhciBET01cblx0XHR0aGlzLmNsZWFySW50ZXJhY3RpdmVSZXNvdXJjZXMoKTtcblxuXHRcdC8vIEhpZGUgVUkgYW5kIHNob3cgdGVybWluYWwtc3RhdGUgKFNraXBwZWQvQW5zd2VyZWQpIG1lc3NhZ2Vcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC11c2VkJyk7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmRvbU5vZGUpO1xuXHRcdHRoaXMucmVuZGVyVGVybWluYWxTdGF0ZU1lc3NhZ2UoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogQ29sbGVjdHMgZGVmYXVsdCB2YWx1ZXMgZm9yIGFsbCBxdWVzdGlvbnMgaW4gdGhlIGNhcm91c2VsLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXREZWZhdWx0QW5zd2VycygpOiBNYXA8c3RyaW5nLCBJQ2hhdFF1ZXN0aW9uQW5zd2VyVmFsdWU+IHtcblx0XHRjb25zdCBhbnN3ZXJzID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0UXVlc3Rpb25BbnN3ZXJWYWx1ZT4oKTtcblx0XHRmb3IgKGNvbnN0IHF1ZXN0aW9uIG9mIHRoaXMuY2Fyb3VzZWwucXVlc3Rpb25zKSB7XG5cdFx0XHRjb25zdCBkZWZhdWx0QW5zd2VyID0gdGhpcy5nZXREZWZhdWx0QW5zd2VyRm9yUXVlc3Rpb24ocXVlc3Rpb24pO1xuXHRcdFx0aWYgKGRlZmF1bHRBbnN3ZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRhbnN3ZXJzLnNldChxdWVzdGlvbi5pZCwgZGVmYXVsdEFuc3dlcik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBhbnN3ZXJzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIGRlZmF1bHQgYW5zd2VyIGZvciBhIHNwZWNpZmljIHF1ZXN0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXREZWZhdWx0QW5zd2VyRm9yUXVlc3Rpb24ocXVlc3Rpb246IElDaGF0UXVlc3Rpb24pOiBJQ2hhdFF1ZXN0aW9uQW5zd2VyVmFsdWUgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAocXVlc3Rpb24udHlwZSkge1xuXHRcdFx0Y2FzZSAndGV4dCc6XG5cdFx0XHRcdHJldHVybiB0eXBlb2YgcXVlc3Rpb24uZGVmYXVsdFZhbHVlID09PSAnc3RyaW5nJyA/IHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y2FzZSAnc2luZ2xlU2VsZWN0Jzoge1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0T3B0aW9uSWQgPSB0eXBlb2YgcXVlc3Rpb24uZGVmYXVsdFZhbHVlID09PSAnc3RyaW5nJyA/IHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdE9wdGlvbiA9IGRlZmF1bHRPcHRpb25JZCAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdFx0PyBxdWVzdGlvbi5vcHRpb25zPy5maW5kKG9wdCA9PiBvcHQuaWQgPT09IGRlZmF1bHRPcHRpb25JZClcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRWYWx1ZSA9IGRlZmF1bHRPcHRpb24/LnZhbHVlO1xuXG5cdFx0XHRcdHJldHVybiBzZWxlY3RlZFZhbHVlICE9PSB1bmRlZmluZWQgPyB7IHNlbGVjdGVkVmFsdWUsIGZyZWVmb3JtVmFsdWU6IHVuZGVmaW5lZCB9IHNhdGlzZmllcyBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlciA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSAnbXVsdGlTZWxlY3QnOiB7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRJZHMgPSBBcnJheS5pc0FycmF5KHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSlcblx0XHRcdFx0XHQ/IHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZVxuXHRcdFx0XHRcdDogKHR5cGVvZiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgPT09ICdzdHJpbmcnID8gW3F1ZXN0aW9uLmRlZmF1bHRWYWx1ZV0gOiBbXSk7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkVmFsdWVzID0gcXVlc3Rpb24ub3B0aW9uc1xuXHRcdFx0XHRcdD8uZmlsdGVyKG9wdCA9PiBkZWZhdWx0SWRzLmluY2x1ZGVzKG9wdC5pZCkpXG5cdFx0XHRcdFx0Lm1hcChvcHQgPT4gb3B0LnZhbHVlKVxuXHRcdFx0XHRcdC5maWx0ZXIodiA9PiB2ICE9PSB1bmRlZmluZWQpID8/IFtdO1xuXG5cdFx0XHRcdHJldHVybiBzZWxlY3RlZFZhbHVlcy5sZW5ndGggPiAwID8geyBzZWxlY3RlZFZhbHVlcywgZnJlZWZvcm1WYWx1ZTogdW5kZWZpbmVkIH0gc2F0aXNmaWVzIElDaGF0TXVsdGlTZWxlY3RBbnN3ZXIgOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB0eXBlb2YgcXVlc3Rpb24uZGVmYXVsdFZhbHVlID09PSAnc3RyaW5nJyA/IHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSA6IEFycmF5LmlzQXJyYXkocXVlc3Rpb24uZGVmYXVsdFZhbHVlKSA/IHsgc2VsZWN0ZWRWYWx1ZXM6IHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSB9IDogdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgYXV0by1mb2N1cyBzaG91bGQgYmUgZW5hYmxlZC5cblx0ICogRGlzYWJsZWQgd2hlbiBzY3JlZW4gcmVhZGVyIG1vZGUgaXMgYWN0aXZlIG9yIHdoZW4gZXhwbGljaXRseSBkaXNhYmxlZCB2aWEgb3B0aW9ucy5cblx0ICovXG5cdHByaXZhdGUgX3Nob3VsZEF1dG9Gb2N1cygpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fb3B0aW9ucy5zaG91bGRBdXRvRm9jdXMgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIERpc2FibGUgYXV0by1mb2N1cyBmb3Igc2NyZWVuIHJlYWRlciB1c2VycyB0byBhbGxvdyB0aGVtIHRvIHJlYWQgdGhlIHF1ZXN0aW9uIGZpcnN0XG5cdFx0cmV0dXJuICF0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIGFyaWEtbGFiZWwgb2YgdGhlIGNhcm91c2VsIGNvbnRhaW5lciBiYXNlZCBvbiB0aGUgY3VycmVudCBxdWVzdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZUFyaWFMYWJlbCgpOiB2b2lkIHtcblx0XHRjb25zdCBxdWVzdGlvbiA9IHRoaXMuY2Fyb3VzZWwucXVlc3Rpb25zW3RoaXMuX2N1cnJlbnRJbmRleF07XG5cdFx0aWYgKCFxdWVzdGlvbikge1xuXHRcdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwubGFiZWwnLCAnQ2hhdCBxdWVzdGlvbicpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBxdWVzdGlvblRleHQgPSBnZXREaXNwbGF5ZWRRdWVzdGlvblRleHQocXVlc3Rpb24pO1xuXHRcdGNvbnN0IG1lc3NhZ2VDb250ZW50ID0gdGhpcy5nZXRRdWVzdGlvblRleHQocXVlc3Rpb25UZXh0KTtcblx0XHRjb25zdCBxdWVzdGlvbkNvdW50ID0gdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnMubGVuZ3RoO1xuXG5cdFx0bGV0IGxhYmVsOiBzdHJpbmc7XG5cdFx0aWYgKHF1ZXN0aW9uQ291bnQgPT09IDEpIHtcblx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5zaW5nbGVRdWVzdGlvbkxhYmVsJywgJ0NoYXQgcXVlc3Rpb246IHswfScsIG1lc3NhZ2VDb250ZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLm11bHRpUXVlc3Rpb25MYWJlbCcsICdDaGF0IHF1ZXN0aW9uIHswfSBvZiB7MX06IHsyfScsIHRoaXMuX2N1cnJlbnRJbmRleCArIDEsIHF1ZXN0aW9uQ291bnQsIG1lc3NhZ2VDb250ZW50KTtcblx0XHR9XG5cblx0XHRjb25zdCB2ZXJib3NlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5DaGF0UXVlc3Rpb25DYXJvdXNlbCk7XG5cdFx0aWYgKHZlcmJvc2UgJiYgdGhpcy5jYXJvdXNlbC50ZXJtaW5hbElkKSB7XG5cdFx0XHRjb25zdCBrYkxhYmVsID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZygnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmZvY3VzUXVlc3Rpb25DYXJvdXNlbFRlcm1pbmFsJyk/LmdldExhYmVsKCk7XG5cdFx0XHRpZiAoa2JMYWJlbCkge1xuXHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuY29tYmluZWRGb2N1c1Rlcm1pbmFsSGludCcsIFwiezB9IFVzZSB7MX0gdG8gZm9jdXMgdGhlIHRlcm1pbmFsLlwiLCBsYWJlbCwga2JMYWJlbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuY29tYmluZWRGb2N1c1Rlcm1pbmFsSGludE5vS2InLCBcInswfSBVc2UgdGhlIEZvY3VzIFRlcm1pbmFsIGZyb20gUXVlc3Rpb24gQ2Fyb3VzZWwgY29tbWFuZCB0byBmb2N1cyB0aGUgdGVybWluYWwuXCIsIGxhYmVsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbGFiZWwpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvY3VzZXMgdGhlIGNhcm91c2VsIGNvbnRhaW5lciBlbGVtZW50LlxuXHQgKi9cblx0cHVibGljIGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZS5mb2N1cygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUgY2Fyb3VzZWwgY29udGFpbmVyIGhhcyBmb2N1cy5cblx0ICovXG5cdHB1YmxpYyBoYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZG9tLmlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQodGhpcy5kb21Ob2RlKTtcblx0fVxuXG5cdHB1YmxpYyBuYXZpZ2F0ZVRvUHJldmlvdXNRdWVzdGlvbigpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fY3VycmVudEluZGV4IDw9IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLm5hdmlnYXRlKC0xKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBuYXZpZ2F0ZVRvTmV4dFF1ZXN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9jdXJyZW50SW5kZXggPj0gdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnMubGVuZ3RoIC0gMSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMubmF2aWdhdGUoMSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgZm9jdXNUZXJtaW5hbCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuY2Fyb3VzZWwudGVybWluYWxJZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9mb2N1c1Rlcm1pbmFsKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckN1cnJlbnRRdWVzdGlvbihmb2N1c0NvbnRhaW5lckZvclNjcmVlblJlYWRlcjogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9xdWVzdGlvbkNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1ZXN0aW9uUmVuZGVyU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fcXVlc3Rpb25SZW5kZXJTdG9yZS52YWx1ZSA9IHF1ZXN0aW9uUmVuZGVyU3RvcmU7XG5cdFx0dGhpcy5faW5wdXRTY3JvbGxhYmxlID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gQ2xlYXIgcHJldmlvdXMgaW5wdXQgYm94ZXMgYW5kIHN0YWxlIHJlZmVyZW5jZXNcblx0XHR0aGlzLl9pbnB1dEJveGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fdGV4dElucHV0Qm94ZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9zaW5nbGVTZWxlY3RJdGVtcy5jbGVhcigpO1xuXHRcdHRoaXMuX211bHRpU2VsZWN0Q2hlY2tib3hlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2ZyZWVmb3JtVGV4dGFyZWFzLmNsZWFyKCk7XG5cblx0XHQvLyBDbGVhciBwcmV2aW91cyBjb250ZW50XG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLl9xdWVzdGlvbkNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBxdWVzdGlvbiA9IHRoaXMuY2Fyb3VzZWwucXVlc3Rpb25zW3RoaXMuX2N1cnJlbnRJbmRleF07XG5cdFx0aWYgKCFxdWVzdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlclJvdyA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1oZWFkZXItcm93Jyk7XG5cdFx0Y29uc3QgdGl0bGVSb3cgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tdGl0bGUtcm93Jyk7XG5cblx0XHQvLyBSZW5kZXIgY2Fyb3VzZWwtbGV2ZWwgbWVzc2FnZSBpZiBwcmVzZW50IChlLmcuIGZyb20gTUNQIGVsaWNpdGF0aW9uKVxuXHRcdGlmICh0aGlzLmNhcm91c2VsLm1lc3NhZ2UgJiYgdGhpcy5fY3VycmVudEluZGV4ID09PSAwKSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlTWQgPSBpc01hcmtkb3duU3RyaW5nKHRoaXMuY2Fyb3VzZWwubWVzc2FnZSkgPyBNYXJrZG93blN0cmluZy5saWZ0KHRoaXMuY2Fyb3VzZWwubWVzc2FnZSkgOiBuZXcgTWFya2Rvd25TdHJpbmcodGhpcy5jYXJvdXNlbC5tZXNzYWdlKTtcblx0XHRcdGNvbnN0IGNhcm91c2VsTWVzc2FnZSA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1tZXNzYWdlJyk7XG5cdFx0XHRjb25zdCByZW5kZXJlZE1lc3NhZ2UgPSBxdWVzdGlvblJlbmRlclN0b3JlLmFkZCh0aGlzLl9tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIobWVzc2FnZU1kKSk7XG5cdFx0XHRjYXJvdXNlbE1lc3NhZ2UuYXBwZW5kQ2hpbGQocmVuZGVyZWRNZXNzYWdlLmVsZW1lbnQpO1xuXHRcdFx0aGVhZGVyUm93LmFwcGVuZENoaWxkKGNhcm91c2VsTWVzc2FnZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVlc3Rpb25UZXh0ID0gZ2V0RGlzcGxheWVkUXVlc3Rpb25UZXh0KHF1ZXN0aW9uKTtcblx0XHRpZiAocXVlc3Rpb25UZXh0KSB7XG5cdFx0XHRjb25zdCB0aXRsZSA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi10aXRsZScpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZUNvbnRlbnQgPSB0aGlzLmdldFF1ZXN0aW9uVGV4dChxdWVzdGlvblRleHQpO1xuXHRcdFx0dGl0bGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbWVzc2FnZUNvbnRlbnQpO1xuXG5cdFx0XHRjb25zdCByYXdWYWx1ZSA9IGlzTWFya2Rvd25TdHJpbmcocXVlc3Rpb25UZXh0KSA/IHF1ZXN0aW9uVGV4dC52YWx1ZSA6IHF1ZXN0aW9uVGV4dDtcblx0XHRcdGNvbnN0IHN1ZmZpeGVkID0gcXVlc3Rpb24ucmVxdWlyZWQgPyBgJHtyYXdWYWx1ZX0gKmAgOiByYXdWYWx1ZTtcblx0XHRcdGNvbnN0IG1kID0gaXNNYXJrZG93blN0cmluZyhxdWVzdGlvblRleHQpXG5cdFx0XHRcdD8gTWFya2Rvd25TdHJpbmcubGlmdCh7IC4uLnF1ZXN0aW9uVGV4dCwgdmFsdWU6IHN1ZmZpeGVkIH0pXG5cdFx0XHRcdDogbmV3IE1hcmtkb3duU3RyaW5nKHN1ZmZpeGVkKTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gcXVlc3Rpb25SZW5kZXJTdG9yZS5hZGQodGhpcy5fbWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKG1kKSk7XG5cdFx0XHR0aXRsZS5hcHBlbmRDaGlsZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHRcdHRpdGxlUm93LmFwcGVuZENoaWxkKHRpdGxlKTtcblx0XHR9XG5cblx0XHRoZWFkZXJSb3cuYXBwZW5kQ2hpbGQodGl0bGVSb3cpO1xuXG5cdFx0aWYgKHRoaXMuX2hlYWRlckFjdGlvbnNDb250YWluZXIpIHtcblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy5faGVhZGVyQWN0aW9uc0NvbnRhaW5lcik7XG5cdFx0XHRpZiAodGhpcy5fZm9jdXNUZXJtaW5hbEJ1dHRvbkNvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLl9oZWFkZXJBY3Rpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2ZvY3VzVGVybWluYWxCdXR0b25Db250YWluZXIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2Nsb3NlQnV0dG9uQ29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMuX2hlYWRlckFjdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fY2xvc2VCdXR0b25Db250YWluZXIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHRcdHRoaXMuX2hlYWRlckFjdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fY29sbGFwc2VCdXR0b24uZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0XHR0aXRsZVJvdy5hcHBlbmRDaGlsZCh0aGlzLl9oZWFkZXJBY3Rpb25zQ29udGFpbmVyKTtcblx0XHR9XG5cblx0XHR0aGlzLl9xdWVzdGlvbkNvbnRhaW5lci5hcHBlbmRDaGlsZChoZWFkZXJSb3cpO1xuXG5cdFx0Ly8gUmVuZGVyIGRlc2NyaXB0aW9uIGlmIHByZXNlbnRcblx0XHRpZiAocXVlc3Rpb24uZGVzY3JpcHRpb24pIHtcblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uRWwgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tZGVzY3JpcHRpb24nKTtcblx0XHRcdGRlc2NyaXB0aW9uRWwudGV4dENvbnRlbnQgPSBxdWVzdGlvbi5kZXNjcmlwdGlvbjtcblx0XHRcdHRoaXMuX3F1ZXN0aW9uQ29udGFpbmVyLmFwcGVuZENoaWxkKGRlc2NyaXB0aW9uRWwpO1xuXHRcdH1cblxuXHRcdC8vIFJlbmRlciBpbnB1dCBiYXNlZCBvbiBxdWVzdGlvbiB0eXBlXG5cdFx0Y29uc3QgaW5wdXRDb250YWluZXIgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24taW5wdXQtY29udGFpbmVyJyk7XG5cblx0XHQvLyBSZW5kZXIgZGV0YWlsZWQgbWFya2Rvd24gbWVzc2FnZSBpbnNpZGUgdGhlIHNjcm9sbGFibGUgaW5wdXQgYXJlYVxuXHRcdGlmIChxdWVzdGlvbi5kZXRhaWxlZE1lc3NhZ2UpIHtcblx0XHRcdGNvbnN0IGRldGFpbGVkTWQgPSBpc01hcmtkb3duU3RyaW5nKHF1ZXN0aW9uLmRldGFpbGVkTWVzc2FnZSlcblx0XHRcdFx0PyBNYXJrZG93blN0cmluZy5saWZ0KHF1ZXN0aW9uLmRldGFpbGVkTWVzc2FnZSlcblx0XHRcdFx0OiBuZXcgTWFya2Rvd25TdHJpbmcocXVlc3Rpb24uZGV0YWlsZWRNZXNzYWdlKTtcblx0XHRcdGNvbnN0IGRldGFpbGVkTWVzc2FnZUVsID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWRldGFpbGVkLW1lc3NhZ2UnKTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkRGV0YWlsZWRNZXNzYWdlID0gcXVlc3Rpb25SZW5kZXJTdG9yZS5hZGQodGhpcy5fbWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKGRldGFpbGVkTWQpKTtcblx0XHRcdGRldGFpbGVkTWVzc2FnZUVsLmFwcGVuZENoaWxkKHJlbmRlcmVkRGV0YWlsZWRNZXNzYWdlLmVsZW1lbnQpO1xuXHRcdFx0aW5wdXRDb250YWluZXIuYXBwZW5kQ2hpbGQoZGV0YWlsZWRNZXNzYWdlRWwpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVySW5wdXQoaW5wdXRDb250YWluZXIsIHF1ZXN0aW9uKTtcblxuXHRcdGNvbnN0IGlucHV0U2Nyb2xsYWJsZSA9IHF1ZXN0aW9uUmVuZGVyU3RvcmUuYWRkKG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudChpbnB1dENvbnRhaW5lciwge1xuXHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuVmlzaWJsZSxcblx0XHRcdGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0Y29uc3VtZU1vdXNlV2hlZWxJZlNjcm9sbGJhcklzTmVlZGVkOiB0cnVlLFxuXHRcdH0pKTtcblx0XHR0aGlzLl9pbnB1dFNjcm9sbGFibGUgPSBpbnB1dFNjcm9sbGFibGU7XG5cdFx0Y29uc3QgaW5wdXRTY3JvbGxhYmxlTm9kZSA9IGlucHV0U2Nyb2xsYWJsZS5nZXREb21Ob2RlKCk7XG5cdFx0aW5wdXRTY3JvbGxhYmxlTm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LXF1ZXN0aW9uLWlucHV0LXNjcm9sbGFibGUnKTtcblx0XHR0aGlzLl9xdWVzdGlvbkNvbnRhaW5lci5hcHBlbmRDaGlsZChpbnB1dFNjcm9sbGFibGVOb2RlKTtcblxuXHRcdC8vIFZhbGlkYXRpb24gbWVzc2FnZSBlbGVtZW50IGJlbG93IHRoZSBzY3JvbGxhYmxlIGFyZWEgKG5vdCBpbnNpZGUgaXQpXG5cdFx0dGhpcy5fdmFsaWRhdGlvbk1lc3NhZ2VFbGVtZW50ID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLXZhbGlkYXRpb24tbWVzc2FnZScpO1xuXHRcdHRoaXMuX3ZhbGlkYXRpb25NZXNzYWdlRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuX3F1ZXN0aW9uQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3ZhbGlkYXRpb25NZXNzYWdlRWxlbWVudCk7XG5cblx0XHRjb25zdCBpc1NpbmdsZVF1ZXN0aW9uID0gdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnMubGVuZ3RoID09PSAxO1xuXG5cdFx0Ly8gUmVuZGVyIGZvb3RlciBiZWZvcmUgZmlyc3QgbGF5b3V0IHNvIHRoZSBzY3JvbGxhYmxlIGFyZWEgaXMgbWVhc3VyZWQgYWdhaW5zdFxuXHRcdC8vIGl0cyBmaW5hbCBhdmFpbGFibGUgaGVpZ2h0IGFuZCBkb2VzIG5vdCB2aXNpYmx5IHJlc2l6ZSB0d2ljZS5cblx0XHRpZiAoIWlzU2luZ2xlUXVlc3Rpb24pIHtcblx0XHRcdHRoaXMucmVuZGVyRm9vdGVyKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVuZGVyU2luZ2xlUXVlc3Rpb25Gb290ZXIoKTtcblx0XHR9XG5cblx0XHRsZXQgcmVsYXlvdXRTY2hlZHVsZWQgPSBmYWxzZTtcblx0XHRjb25zdCByZWxheW91dFNjaGVkdWxlciA9IHF1ZXN0aW9uUmVuZGVyU3RvcmUuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRjb25zdCBzY2hlZHVsZUxheW91dElucHV0U2Nyb2xsYWJsZSA9ICgpID0+IHtcblx0XHRcdGlmIChyZWxheW91dFNjaGVkdWxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHJlbGF5b3V0U2NoZWR1bGVkID0gdHJ1ZTtcblx0XHRcdHJlbGF5b3V0U2NoZWR1bGVyLnZhbHVlID0gZG9tLnJ1bkF0VGhpc09yU2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KHRoaXMuZG9tTm9kZSksICgpID0+IHtcblx0XHRcdFx0cmVsYXlvdXRTY2hlZHVsZWQgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5sYXlvdXRJbnB1dFNjcm9sbGFibGUoaW5wdXRTY3JvbGxhYmxlKTtcblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRjb25zdCBpbnB1dFJlc2l6ZU9ic2VydmVyID0gcXVlc3Rpb25SZW5kZXJTdG9yZS5hZGQobmV3IGRvbS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0NoYXRRdWVzdGlvbkNhcm91c2VsUGFydC5pbnB1dFNjcm9sbGFibGUnLCAoKSA9PiBzY2hlZHVsZUxheW91dElucHV0U2Nyb2xsYWJsZSgpKSk7XG5cdFx0cXVlc3Rpb25SZW5kZXJTdG9yZS5hZGQoaW5wdXRSZXNpemVPYnNlcnZlci5vYnNlcnZlKGlucHV0U2Nyb2xsYWJsZU5vZGUpKTtcblx0XHRxdWVzdGlvblJlbmRlclN0b3JlLmFkZChpbnB1dFJlc2l6ZU9ic2VydmVyLm9ic2VydmUoaW5wdXRDb250YWluZXIpKTtcblx0XHRxdWVzdGlvblJlbmRlclN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlKSwgZG9tLkV2ZW50VHlwZS5SRVNJWkUsICgpID0+IHNjaGVkdWxlTGF5b3V0SW5wdXRTY3JvbGxhYmxlKCkpKTtcblx0XHRzY2hlZHVsZUxheW91dElucHV0U2Nyb2xsYWJsZSgpO1xuXHRcdHF1ZXN0aW9uUmVuZGVyU3RvcmUuYWRkKGRvbS5ydW5BdFRoaXNPclNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyh0aGlzLmRvbU5vZGUpLCAoKSA9PiB7XG5cdFx0XHRpbnB1dENvbnRhaW5lci5zY3JvbGxUb3AgPSAwO1xuXHRcdFx0aW5wdXRDb250YWluZXIuc2Nyb2xsTGVmdCA9IDA7XG5cdFx0XHRpbnB1dFNjcm9sbGFibGUuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IDAsIHNjcm9sbExlZnQ6IDAgfSk7XG5cdFx0XHRpbnB1dFNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBVcGRhdGUgYXJpYS1sYWJlbCB0byByZWZsZWN0IHRoZSBjdXJyZW50IHF1ZXN0aW9uXG5cdFx0dGhpcy5fdXBkYXRlQXJpYUxhYmVsKCk7XG5cdFx0dGhpcy51cGRhdGVDb2xsYXBzZWRQcmVzZW50YXRpb24oKTtcblxuXHRcdC8vIEluIHNjcmVlbiByZWFkZXIgbW9kZSwgZm9jdXMgdGhlIGNvbnRhaW5lciBhbmQgYW5ub3VuY2UgdGhlIHF1ZXN0aW9uXG5cdFx0Ly8gVGhpcyBtdXN0IGhhcHBlbiBhZnRlciBhbGwgcmVuZGVyIGNhbGxzIHRvIGF2b2lkIGZvY3VzIGJlaW5nIHN0b2xlblxuXHRcdGlmIChmb2N1c0NvbnRhaW5lckZvclNjcmVlblJlYWRlciAmJiB0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpKSB7XG5cdFx0XHR0aGlzLl9mb2N1c0NvbnRhaW5lckFuZEFubm91bmNlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgb3IgdXBkYXRlcyB0aGUgcGVyc2lzdGVudCBmb290ZXIgd2l0aCBuYXYgYXJyb3dzLCBzdGVwIGluZGljYXRvciwgYW5kIHN1Ym1pdCBidXR0b24uXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlckZvb3RlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2Zvb3RlclJvdykge1xuXHRcdFx0Y29uc3QgaW50ZXJhY3RpdmVTdG9yZSA9IHRoaXMuX2ludGVyYWN0aXZlVUlTdG9yZS52YWx1ZTtcblx0XHRcdGlmICghaW50ZXJhY3RpdmVTdG9yZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2Zvb3RlclJvdyA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1mb290ZXItcm93Jyk7XG5cblx0XHRcdC8vIExlZnQgc2lkZTogbmF2IGFycm93cyArIHN0ZXAgaW5kaWNhdG9yXG5cdFx0XHRjb25zdCBsZWZ0Q29udHJvbHMgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tZm9vdGVyLWxlZnQuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1uYXYnKTtcblx0XHRcdGxlZnRDb250cm9scy5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbmF2aWdhdGlvbicpO1xuXHRcdFx0bGVmdENvbnRyb2xzLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwubmF2aWdhdGlvbicsICdRdWVzdGlvbiBuYXZpZ2F0aW9uJykpO1xuXG5cdFx0XHRjb25zdCBhcnJvd3NDb250YWluZXIgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tbmF2LWFycm93cycpO1xuXG5cdFx0XHRjb25zdCBwcmV2aW91c0xhYmVsID0gdGhpcy5nZXRMYWJlbFdpdGhLZXliaW5kaW5nKGxvY2FsaXplKCdwcmV2aW91cycsICdQcmV2aW91cycpLCBQUkVWSU9VU19RVUVTVElPTl9BQ1RJT05fSUQpO1xuXHRcdFx0Y29uc3QgcHJldkJ1dHRvbiA9IGludGVyYWN0aXZlU3RvcmUuYWRkKG5ldyBCdXR0b24oYXJyb3dzQ29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHRcdHByZXZCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXF1ZXN0aW9uLW5hdi1hcnJvdycsICdjaGF0LXF1ZXN0aW9uLW5hdi1wcmV2Jyk7XG5cdFx0XHRwcmV2QnV0dG9uLmxhYmVsID0gYCQoJHtDb2RpY29uLmNoZXZyb25MZWZ0LmlkfSlgO1xuXHRcdFx0cHJldkJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHByZXZpb3VzTGFiZWwpO1xuXHRcdFx0aW50ZXJhY3RpdmVTdG9yZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHByZXZCdXR0b24uZWxlbWVudCwgeyBjb250ZW50OiBwcmV2aW91c0xhYmVsIH0pKTtcblx0XHRcdGludGVyYWN0aXZlU3RvcmUuYWRkKHByZXZCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLm5hdmlnYXRlKC0xKSkpO1xuXHRcdFx0dGhpcy5fcHJldkJ1dHRvbiA9IHByZXZCdXR0b247XG5cblx0XHRcdGNvbnN0IG5leHRMYWJlbCA9IHRoaXMuZ2V0TGFiZWxXaXRoS2V5YmluZGluZyhsb2NhbGl6ZSgnbmV4dCcsICdOZXh0JyksIE5FWFRfUVVFU1RJT05fQUNUSU9OX0lEKTtcblx0XHRcdGNvbnN0IG5leHRCdXR0b24gPSBpbnRlcmFjdGl2ZVN0b3JlLmFkZChuZXcgQnV0dG9uKGFycm93c0NvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdFx0XHRuZXh0QnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1xdWVzdGlvbi1uYXYtYXJyb3cnLCAnY2hhdC1xdWVzdGlvbi1uYXYtbmV4dCcpO1xuXHRcdFx0bmV4dEJ1dHRvbi5sYWJlbCA9IGAkKCR7Q29kaWNvbi5jaGV2cm9uUmlnaHQuaWR9KWA7XG5cdFx0XHRuZXh0QnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbmV4dExhYmVsKTtcblx0XHRcdGludGVyYWN0aXZlU3RvcmUuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihuZXh0QnV0dG9uLmVsZW1lbnQsIHsgY29udGVudDogbmV4dExhYmVsIH0pKTtcblx0XHRcdGludGVyYWN0aXZlU3RvcmUuYWRkKG5leHRCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLm5hdmlnYXRlKDEpKSk7XG5cdFx0XHR0aGlzLl9uZXh0QnV0dG9uID0gbmV4dEJ1dHRvbjtcblxuXHRcdFx0bGVmdENvbnRyb2xzLmFwcGVuZENoaWxkKGFycm93c0NvbnRhaW5lcik7XG5cblx0XHRcdHRoaXMuX3N0ZXBJbmRpY2F0b3IgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tc3RlcC1pbmRpY2F0b3InKTtcblx0XHRcdGxlZnRDb250cm9scy5hcHBlbmRDaGlsZCh0aGlzLl9zdGVwSW5kaWNhdG9yKTtcblxuXHRcdFx0dGhpcy5fZm9vdGVyUm93LmFwcGVuZENoaWxkKGxlZnRDb250cm9scyk7XG5cblx0XHRcdC8vIFJpZ2h0IHNpZGU6IGhpbnQgKyBzdWJtaXRcblx0XHRcdGNvbnN0IHJpZ2h0Q29udHJvbHMgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tZm9vdGVyLXJpZ2h0Jyk7XG5cblx0XHRcdGNvbnN0IGhpbnQgPSBkb20uJCgnc3Bhbi5jaGF0LXF1ZXN0aW9uLXN1Ym1pdC1oaW50Jyk7XG5cdFx0XHRoaW50LnRleHRDb250ZW50ID0gaXNNYWNpbnRvc2hcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnN1Ym1pdEhpbnRNYWMnLCAnXFx1MjMxOFxcdTIzQ0UgdG8gc3VibWl0Jylcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnN1Ym1pdEhpbnRPdGhlcicsICdDdHJsK0VudGVyIHRvIHN1Ym1pdCcpO1xuXHRcdFx0cmlnaHRDb250cm9scy5hcHBlbmRDaGlsZChoaW50KTtcblx0XHRcdHRoaXMuX3N1Ym1pdEhpbnQgPSBoaW50O1xuXG5cdFx0XHRjb25zdCBzdWJtaXRCdXR0b24gPSBpbnRlcmFjdGl2ZVN0b3JlLmFkZChuZXcgQnV0dG9uKHJpZ2h0Q29udHJvbHMsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcyB9KSk7XG5cdFx0XHRzdWJtaXRCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXF1ZXN0aW9uLXN1Ym1pdC1idXR0b24nKTtcblx0XHRcdHN1Ym1pdEJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdzdWJtaXQnLCAnU3VibWl0Jyk7XG5cdFx0XHRpbnRlcmFjdGl2ZVN0b3JlLmFkZChzdWJtaXRCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLnN1Ym1pdCgpKSk7XG5cdFx0XHR0aGlzLl9zdWJtaXRCdXR0b24gPSBzdWJtaXRCdXR0b247XG5cblx0XHRcdHRoaXMuX2Zvb3RlclJvdy5hcHBlbmRDaGlsZChyaWdodENvbnRyb2xzKTtcblx0XHRcdHRoaXMuZG9tTm9kZS5hcHBlbmQodGhpcy5fZm9vdGVyUm93KTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUZvb3RlclN0YXRlKCk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgZm9vdGVyIG5hdiBidXR0b24gZW5hYmxlZCBzdGF0ZSBhbmQgc3RlcCBpbmRpY2F0b3IgdGV4dC5cblx0ICovXG5cdHByaXZhdGUgdXBkYXRlRm9vdGVyU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3ByZXZCdXR0b24pIHtcblx0XHRcdHRoaXMuX3ByZXZCdXR0b24uZW5hYmxlZCA9IHRoaXMuX2N1cnJlbnRJbmRleCA+IDA7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9uZXh0QnV0dG9uKSB7XG5cdFx0XHRjb25zdCBjYW5BZHZhbmNlID0gdGhpcy5fY3VycmVudEluZGV4IDwgdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnMubGVuZ3RoIC0gMTtcblx0XHRcdGNvbnN0IHF1ZXN0aW9uID0gdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnNbdGhpcy5fY3VycmVudEluZGV4XTtcblx0XHRcdGNvbnN0IGFuc3dlciA9IHRoaXMuX2Fuc3dlcnMuZ2V0KHF1ZXN0aW9uPy5pZCk7XG5cdFx0XHRjb25zdCBoYXNBbnN3ZXIgPSBhbnN3ZXIgIT09IHVuZGVmaW5lZCAmJiBhbnN3ZXIgIT09ICcnO1xuXHRcdFx0Y29uc3QgaGFzVmFsaWRhdGlvbkVycm9yID0gISF0aGlzLl9jdXJyZW50VmFsaWRhdGlvbkVycm9yO1xuXHRcdFx0dGhpcy5fbmV4dEJ1dHRvbi5lbmFibGVkID0gY2FuQWR2YW5jZSAmJiAoIXF1ZXN0aW9uPy5yZXF1aXJlZCB8fCBoYXNBbnN3ZXIpICYmICFoYXNWYWxpZGF0aW9uRXJyb3I7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdGVwSW5kaWNhdG9yKSB7XG5cdFx0XHR0aGlzLl9zdGVwSW5kaWNhdG9yLnRleHRDb250ZW50ID0gbG9jYWxpemUoXG5cdFx0XHRcdCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuc3RlcEluZGljYXRvcicsXG5cdFx0XHRcdCd7MH0vezF9Jyxcblx0XHRcdFx0dGhpcy5fY3VycmVudEluZGV4ICsgMSxcblx0XHRcdFx0dGhpcy5jYXJvdXNlbC5xdWVzdGlvbnMubGVuZ3RoXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3VibWl0QnV0dG9uKSB7XG5cdFx0XHRjb25zdCBpc0xhc3RRdWVzdGlvbiA9IHRoaXMuX2N1cnJlbnRJbmRleCA9PT0gdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnMubGVuZ3RoIC0gMTtcblx0XHRcdHRoaXMuX3N1Ym1pdEJ1dHRvbi5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBpc0xhc3RRdWVzdGlvbiA/ICcnIDogJ25vbmUnO1xuXHRcdFx0aWYgKHRoaXMuX3N1Ym1pdEhpbnQpIHtcblx0XHRcdFx0dGhpcy5fc3VibWl0SGludC5zdHlsZS5kaXNwbGF5ID0gaXNMYXN0UXVlc3Rpb24gPyAnJyA6ICdub25lJztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVycyBhIHNpbXBsaWZpZWQgZm9vdGVyIHdpdGgganVzdCBhIHN1Ym1pdCBidXR0b24gZm9yIHNpbmdsZS1xdWVzdGlvbiBtdWx0aS1zZWxlY3QgY2Fyb3VzZWxzLlxuXHQgKi9cblx0cHJpdmF0ZSByZW5kZXJTaW5nbGVRdWVzdGlvbkZvb3RlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2Zvb3RlclJvdykge1xuXHRcdFx0Y29uc3QgaW50ZXJhY3RpdmVTdG9yZSA9IHRoaXMuX2ludGVyYWN0aXZlVUlTdG9yZS52YWx1ZTtcblx0XHRcdGlmICghaW50ZXJhY3RpdmVTdG9yZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2Zvb3RlclJvdyA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1mb290ZXItcm93Jyk7XG5cblx0XHRcdC8vIFNwYWNlciB0byBwdXNoIGNvbnRyb2xzIHRvIHRoZSByaWdodFxuXHRcdFx0Y29uc3QgbGVmdENvbnRyb2xzID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWZvb3Rlci1sZWZ0LmNoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtbmF2Jyk7XG5cdFx0XHRsZWZ0Q29udHJvbHMuc2V0QXR0cmlidXRlKCdyb2xlJywgJ25hdmlnYXRpb24nKTtcblx0XHRcdGxlZnRDb250cm9scy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLm5hdmlnYXRpb24nLCAnUXVlc3Rpb24gbmF2aWdhdGlvbicpKTtcblx0XHRcdHRoaXMuX2Zvb3RlclJvdy5hcHBlbmRDaGlsZChsZWZ0Q29udHJvbHMpO1xuXG5cdFx0XHRjb25zdCByaWdodENvbnRyb2xzID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWZvb3Rlci1yaWdodCcpO1xuXG5cdFx0XHRjb25zdCBoaW50ID0gZG9tLiQoJ3NwYW4uY2hhdC1xdWVzdGlvbi1zdWJtaXQtaGludCcpO1xuXHRcdFx0aGludC50ZXh0Q29udGVudCA9IGlzTWFjaW50b3NoXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5zdWJtaXRIaW50TWFjJywgJ1xcdTIzMThcXHUyM0NFIHRvIHN1Ym1pdCcpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5zdWJtaXRIaW50T3RoZXInLCAnQ3RybCtFbnRlciB0byBzdWJtaXQnKTtcblx0XHRcdHJpZ2h0Q29udHJvbHMuYXBwZW5kQ2hpbGQoaGludCk7XG5cdFx0XHR0aGlzLl9zdWJtaXRIaW50ID0gaGludDtcblxuXHRcdFx0Y29uc3Qgc3VibWl0QnV0dG9uID0gaW50ZXJhY3RpdmVTdG9yZS5hZGQobmV3IEJ1dHRvbihyaWdodENvbnRyb2xzLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMgfSkpO1xuXHRcdFx0c3VibWl0QnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1xdWVzdGlvbi1zdWJtaXQtYnV0dG9uJyk7XG5cdFx0XHRzdWJtaXRCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnc3VibWl0JywgJ1N1Ym1pdCcpO1xuXHRcdFx0aW50ZXJhY3RpdmVTdG9yZS5hZGQoc3VibWl0QnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5zdWJtaXQoKSkpO1xuXHRcdFx0dGhpcy5fc3VibWl0QnV0dG9uID0gc3VibWl0QnV0dG9uO1xuXG5cdFx0XHR0aGlzLl9mb290ZXJSb3cuYXBwZW5kQ2hpbGQocmlnaHRDb250cm9scyk7XG5cdFx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kKHRoaXMuX2Zvb3RlclJvdyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRMYWJlbFdpdGhLZXliaW5kaW5nKGxhYmVsOiBzdHJpbmcsIGFjdGlvbklkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGtleWJpbmRpbmdMYWJlbCA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uSWQsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKT8uZ2V0TGFiZWwoKTtcblx0XHRyZXR1cm4ga2V5YmluZGluZ0xhYmVsXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwubGFiZWxXaXRoS2V5YmluZGluZycsICd7MH0gKHsxfSknLCBsYWJlbCwga2V5YmluZGluZ0xhYmVsKVxuXHRcdFx0OiBsYWJlbDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVySW5wdXQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgcXVlc3Rpb246IElDaGF0UXVlc3Rpb24pOiB2b2lkIHtcblx0XHRzd2l0Y2ggKHF1ZXN0aW9uLnR5cGUpIHtcblx0XHRcdGNhc2UgJ3RleHQnOlxuXHRcdFx0XHR0aGlzLnJlbmRlclRleHRJbnB1dChjb250YWluZXIsIHF1ZXN0aW9uKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdzaW5nbGVTZWxlY3QnOlxuXHRcdFx0XHR0aGlzLnJlbmRlclNpbmdsZVNlbGVjdChjb250YWluZXIsIHF1ZXN0aW9uKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdtdWx0aVNlbGVjdCc6XG5cdFx0XHRcdHRoaXMucmVuZGVyTXVsdGlTZWxlY3QoY29udGFpbmVyLCBxdWVzdGlvbik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTZXRzIHVwIGF1dG8tcmVzaXplIGJlaGF2aW9yIGZvciBhIHRleHRhcmVhIGVsZW1lbnQuXG5cdCAqIEByZXR1cm5zIEEgZnVuY3Rpb24gdGhhdCB0cmlnZ2VycyB0aGUgcmVzaXplIG1hbnVhbGx5ICh1c2VmdWwgZm9yIGluaXRpYWwgc2l6aW5nKS5cblx0ICovXG5cdHByaXZhdGUgc2V0dXBUZXh0YXJlYUF1dG9SZXNpemUodGV4dGFyZWE6IEhUTUxUZXh0QXJlYUVsZW1lbnQpOiAoKSA9PiB2b2lkIHtcblx0XHRjb25zdCBhdXRvUmVzaXplID0gKCkgPT4ge1xuXHRcdFx0dGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gJ2F1dG8nO1xuXHRcdFx0dGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gYCR7TWF0aC5taW4odGV4dGFyZWEuc2Nyb2xsSGVpZ2h0LCAyMDApfXB4YDtcblx0XHRcdGlmICh0aGlzLl9pbnB1dFNjcm9sbGFibGUpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXRJbnB1dFNjcm9sbGFibGUodGhpcy5faW5wdXRTY3JvbGxhYmxlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHR9O1xuXHRcdHRoaXMuX2lucHV0Qm94ZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGV4dGFyZWEsIGRvbS5FdmVudFR5cGUuSU5QVVQsIGF1dG9SZXNpemUpKTtcblx0XHRyZXR1cm4gYXV0b1Jlc2l6ZTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVGV4dElucHV0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHF1ZXN0aW9uOiBJQ2hhdFF1ZXN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5wdXRCb3ggPSB0aGlzLl9pbnB1dEJveGVzLmFkZChuZXcgSW5wdXRCb3goY29udGFpbmVyLCB1bmRlZmluZWQsIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLmVudGVyVGV4dCcsICdFbnRlciB5b3VyIGFuc3dlcicpLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHRcdHZhbGlkYXRpb25PcHRpb25zOiBxdWVzdGlvbi52YWxpZGF0aW9uID8ge1xuXHRcdFx0XHR2YWxpZGF0aW9uOiAodmFsdWU6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGlmICghdmFsdWUgJiYgIXF1ZXN0aW9uLnJlcXVpcmVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZXJyb3IgPSB0aGlzLmdldFZhbGlkYXRpb25FcnJvcih2YWx1ZSwgcXVlc3Rpb24udmFsaWRhdGlvbiEpO1xuXHRcdFx0XHRcdGlmIChlcnJvcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogMiAvKiBNZXNzYWdlVHlwZS5XQVJOSU5HICovLCBjb250ZW50OiBlcnJvciB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHR9KSk7XG5cdFx0dGhpcy5faW5wdXRCb3hlcy5hZGQoaW5wdXRCb3gub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5zYXZlQ3VycmVudEFuc3dlcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlc3RvcmUgcHJldmlvdXMgYW5zd2VyIGlmIGV4aXN0c1xuXHRcdGNvbnN0IHByZXZpb3VzQW5zd2VyID0gdGhpcy5fYW5zd2Vycy5nZXQocXVlc3Rpb24uaWQpO1xuXHRcdGlmIChwcmV2aW91c0Fuc3dlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpbnB1dEJveC52YWx1ZSA9IFN0cmluZyhwcmV2aW91c0Fuc3dlcik7XG5cdFx0fSBlbHNlIGlmIChxdWVzdGlvbi5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aW5wdXRCb3gudmFsdWUgPSBTdHJpbmcocXVlc3Rpb24uZGVmYXVsdFZhbHVlKTtcblx0XHR9XG5cblx0XHR0aGlzLl90ZXh0SW5wdXRCb3hlcy5zZXQocXVlc3Rpb24uaWQsIGlucHV0Qm94KTtcblxuXHRcdC8vIEZvY3VzIG9uIGlucHV0IHdoZW4gcmVuZGVyZWQgdXNpbmcgcHJvcGVyIERPTSBzY2hlZHVsaW5nXG5cdFx0aWYgKHRoaXMuX3Nob3VsZEF1dG9Gb2N1cygpKSB7XG5cdFx0XHR0aGlzLl9pbnB1dEJveGVzLmFkZChkb20ucnVuQXRUaGlzT3JTY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3coaW5wdXRCb3guZWxlbWVudCksICgpID0+IGlucHV0Qm94LmZvY3VzKCkpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclNpbmdsZVNlbGVjdChjb250YWluZXI6IEhUTUxFbGVtZW50LCBxdWVzdGlvbjogSUNoYXRRdWVzdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IG9yZGVyZWRPcHRpb25zID0gZ2V0T3B0aW9uc1dpdGhEZWZhdWx0c0ZpcnN0KHF1ZXN0aW9uKTtcblx0XHRjb25zdCBzZWxlY3RDb250YWluZXIgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tbGlzdCcpO1xuXHRcdHNlbGVjdENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGlzdGJveCcpO1xuXHRcdHNlbGVjdENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBxdWVzdGlvbi50aXRsZSk7XG5cdFx0c2VsZWN0Q29udGFpbmVyLnRhYkluZGV4ID0gMDtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoc2VsZWN0Q29udGFpbmVyKTtcblxuXHRcdC8vIFJlc3RvcmUgcHJldmlvdXMgYW5zd2VyIGlmIGV4aXN0c1xuXHRcdGNvbnN0IHByZXZpb3VzQW5zd2VyID0gdGhpcy5fYW5zd2Vycy5nZXQocXVlc3Rpb24uaWQpO1xuXHRcdGNvbnN0IHByZXZTaW5nbGUgPSB0eXBlb2YgcHJldmlvdXNBbnN3ZXIgPT09ICdvYmplY3QnICYmIHByZXZpb3VzQW5zd2VyICE9PSBudWxsICYmIGhhc0tleShwcmV2aW91c0Fuc3dlciwgeyBzZWxlY3RlZFZhbHVlOiB0cnVlIH0pID8gcHJldmlvdXNBbnN3ZXIgYXMgSUNoYXRTaW5nbGVTZWxlY3RBbnN3ZXIgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcHJldmlvdXNGcmVlZm9ybSA9IHByZXZTaW5nbGU/LmZyZWVmb3JtVmFsdWU7XG5cdFx0Y29uc3QgcHJldmlvdXNTZWxlY3RlZFZhbHVlID0gcHJldlNpbmdsZT8uc2VsZWN0ZWRWYWx1ZTtcblxuXHRcdC8vIEdldCBkZWZhdWx0IG9wdGlvbiBpZCAoZm9yIHNpbmdsZVNlbGVjdCwgZGVmYXVsdFZhbHVlIGlzIGEgc2luZ2xlIHN0cmluZylcblx0XHRjb25zdCBkZWZhdWx0T3B0aW9uSWQgPSB0eXBlb2YgcXVlc3Rpb24uZGVmYXVsdFZhbHVlID09PSAnc3RyaW5nJyA/IHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSA6IHVuZGVmaW5lZDtcblxuXHRcdC8vIERldGVybWluZSBpbml0aWFsbHkgc2VsZWN0ZWQgaW5kZXhcblx0XHRsZXQgc2VsZWN0ZWRJbmRleCA9IC0xO1xuXHRcdG9yZGVyZWRPcHRpb25zLmZvckVhY2goKHsgb3B0aW9uIH0sIGluZGV4KSA9PiB7XG5cdFx0XHRpZiAocHJldmlvdXNTZWxlY3RlZFZhbHVlICE9PSB1bmRlZmluZWQgJiYgb3B0aW9uLnZhbHVlID09PSBwcmV2aW91c1NlbGVjdGVkVmFsdWUpIHtcblx0XHRcdFx0c2VsZWN0ZWRJbmRleCA9IGluZGV4O1xuXHRcdFx0fSBlbHNlIGlmIChzZWxlY3RlZEluZGV4ID09PSAtMSAmJiAhcHJldmlvdXNGcmVlZm9ybSAmJiBkZWZhdWx0T3B0aW9uSWQgIT09IHVuZGVmaW5lZCAmJiBvcHRpb24uaWQgPT09IGRlZmF1bHRPcHRpb25JZCkge1xuXHRcdFx0XHRzZWxlY3RlZEluZGV4ID0gaW5kZXg7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBsaXN0SXRlbXM6IEhUTUxFbGVtZW50W10gPSBbXTtcblx0XHRjb25zdCBpbmRpY2F0b3JzOiBIVE1MRWxlbWVudFtdID0gW107XG5cdFx0Y29uc3QgdXBkYXRlU2VsZWN0aW9uID0gKG5ld0luZGV4OiBudW1iZXIpID0+IHtcblx0XHRcdC8vIFVwZGF0ZSB2aXN1YWwgc3RhdGVcblx0XHRcdGxpc3RJdGVtcy5mb3JFYWNoKChpdGVtLCBpKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGlzU2VsZWN0ZWQgPSBpID09PSBuZXdJbmRleDtcblx0XHRcdFx0aXRlbS5jbGFzc0xpc3QudG9nZ2xlKCdzZWxlY3RlZCcsIGlzU2VsZWN0ZWQpO1xuXHRcdFx0XHRpdGVtLnNldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcsIFN0cmluZyhpc1NlbGVjdGVkKSk7XG5cdFx0XHRcdGNvbnN0IGluZGljYXRvciA9IGluZGljYXRvcnNbaV07XG5cdFx0XHRcdGluZGljYXRvci5jbGFzc0xpc3QudG9nZ2xlKCdjb2RpY29uJywgaXNTZWxlY3RlZCk7XG5cdFx0XHRcdGluZGljYXRvci5jbGFzc0xpc3QudG9nZ2xlKCdjb2RpY29uLWNoZWNrJywgaXNTZWxlY3RlZCk7XG5cdFx0XHR9KTtcblx0XHRcdC8vIFVwZGF0ZSBhcmlhLWFjdGl2ZWRlc2NlbmRhbnQgZm9yIHNjcmVlbiByZWFkZXIgYW5ub3VuY2VtZW50c1xuXHRcdFx0aWYgKG5ld0luZGV4ID49IDAgJiYgbmV3SW5kZXggPCBsaXN0SXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdHNlbGVjdENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcsIGxpc3RJdGVtc1tuZXdJbmRleF0uaWQpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVXBkYXRlIHRyYWNrZWQgc3RhdGVcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9zaW5nbGVTZWxlY3RJdGVtcy5nZXQocXVlc3Rpb24uaWQpO1xuXHRcdFx0aWYgKGRhdGEpIHtcblx0XHRcdFx0ZGF0YS5zZWxlY3RlZEluZGV4ID0gbmV3SW5kZXg7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuc2F2ZUN1cnJlbnRBbnN3ZXIoKTtcblx0XHR9O1xuXG5cdFx0b3JkZXJlZE9wdGlvbnMuZm9yRWFjaCgoeyBvcHRpb24gfSwgaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IGlzU2VsZWN0ZWQgPSBpbmRleCA9PT0gc2VsZWN0ZWRJbmRleDtcblx0XHRcdGNvbnN0IGxpc3RJdGVtID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWxpc3QtaXRlbScpO1xuXHRcdFx0bGlzdEl0ZW0uc2V0QXR0cmlidXRlKCdyb2xlJywgJ29wdGlvbicpO1xuXHRcdFx0bGlzdEl0ZW0uc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgU3RyaW5nKGlzU2VsZWN0ZWQpKTtcblx0XHRcdGxpc3RJdGVtLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwub3B0aW9uTGFiZWwnLCBcIk9wdGlvbiB7MH06IHsxfVwiLCBpbmRleCArIDEsIG9wdGlvbi5sYWJlbCkpO1xuXHRcdFx0bGlzdEl0ZW0uaWQgPSBgb3B0aW9uLSR7cXVlc3Rpb24uaWR9LSR7aW5kZXh9YDtcblx0XHRcdGxpc3RJdGVtLnRhYkluZGV4ID0gLTE7XG5cblx0XHRcdGNvbnN0IG51bWJlciA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1saXN0LW51bWJlcicpO1xuXHRcdFx0bnVtYmVyLnRleHRDb250ZW50ID0gYCR7aW5kZXggKyAxfWA7XG5cdFx0XHRsaXN0SXRlbS5hcHBlbmRDaGlsZChudW1iZXIpO1xuXG5cdFx0XHQvLyBTZWxlY3Rpb24gaW5kaWNhdG9yIChjaGVja21hcmsgd2hlbiBzZWxlY3RlZClcblx0XHRcdGNvbnN0IGluZGljYXRvciA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1saXN0LWluZGljYXRvcicpO1xuXHRcdFx0aWYgKGlzU2VsZWN0ZWQpIHtcblx0XHRcdFx0aW5kaWNhdG9yLmNsYXNzTGlzdC5hZGQoJ2NvZGljb24nLCAnY29kaWNvbi1jaGVjaycpO1xuXHRcdFx0fVxuXHRcdFx0aW5kaWNhdG9ycy5wdXNoKGluZGljYXRvcik7XG5cblx0XHRcdC8vIExhYmVsIHdpdGggb3B0aW9uYWwgZGVzY3JpcHRpb24gKGZvcm1hdDogXCJUaXRsZSAtIERlc2NyaXB0aW9uXCIpXG5cdFx0XHRjb25zdCBsYWJlbCA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1saXN0LWxhYmVsJyk7XG5cdFx0XHRjb25zdCBzZXBhcmF0b3JJbmRleCA9IG9wdGlvbi5sYWJlbC5pbmRleE9mKCcgLSAnKTtcblx0XHRcdGlmIChzZXBhcmF0b3JJbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0bGlzdEl0ZW0uY2xhc3NMaXN0LmFkZCgnaGFzLWRlc2NyaXB0aW9uJyk7XG5cdFx0XHRcdGNvbnN0IHRpdGxlU3BhbiA9IGRvbS4kKCdzcGFuLmNoYXQtcXVlc3Rpb24tbGlzdC1sYWJlbC10aXRsZScpO1xuXHRcdFx0XHR0aXRsZVNwYW4udGV4dENvbnRlbnQgPSBvcHRpb24ubGFiZWwuc3Vic3RyaW5nKDAsIHNlcGFyYXRvckluZGV4KTtcblx0XHRcdFx0bGFiZWwuYXBwZW5kQ2hpbGQodGl0bGVTcGFuKTtcblxuXHRcdFx0XHRjb25zdCBkZXNjU3BhbiA9IGRvbS4kKCdzcGFuLmNoYXQtcXVlc3Rpb24tbGlzdC1sYWJlbC1kZXNjJyk7XG5cdFx0XHRcdGRlc2NTcGFuLnRleHRDb250ZW50ID0gb3B0aW9uLmxhYmVsLnN1YnN0cmluZyhzZXBhcmF0b3JJbmRleCArIDMpO1xuXHRcdFx0XHRsYWJlbC5hcHBlbmRDaGlsZChkZXNjU3Bhbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IG9wdGlvbi5sYWJlbDtcblx0XHRcdH1cblx0XHRcdGxpc3RJdGVtLmFwcGVuZENoaWxkKGxhYmVsKTtcblx0XHRcdGxpc3RJdGVtLmFwcGVuZENoaWxkKGluZGljYXRvcik7XG5cblx0XHRcdGlmIChpc1NlbGVjdGVkKSB7XG5cdFx0XHRcdGxpc3RJdGVtLmNsYXNzTGlzdC5hZGQoJ3NlbGVjdGVkJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGlmIHdlIHNlbGVjdCBhbiBvcHRpb24sIGNsZWFyIHRleHQgYW5kIGdvIHRvIG5leHQgcXVlc3Rpb25cblx0XHRcdHRoaXMuX2lucHV0Qm94ZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobGlzdEl0ZW0sIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dXBkYXRlU2VsZWN0aW9uKGluZGV4KTtcblx0XHRcdFx0Y29uc3QgZnJlZWZvcm0gPSB0aGlzLl9mcmVlZm9ybVRleHRhcmVhcy5nZXQocXVlc3Rpb24uaWQpO1xuXHRcdFx0XHRpZiAoZnJlZWZvcm0pIHtcblx0XHRcdFx0XHRmcmVlZm9ybS52YWx1ZSA9ICcnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuaGFuZGxlTmV4dE9yU3VibWl0KCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX2lucHV0Qm94ZXMuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihsaXN0SXRlbSwge1xuXHRcdFx0XHRjb250ZW50OiBvcHRpb24ubGFiZWwsXG5cdFx0XHRcdHBvc2l0aW9uOiB7IGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uQkVMT1cgfSxcblx0XHRcdFx0YXBwZWFyYW5jZTogeyBzaG93UG9pbnRlcjogdHJ1ZSB9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHNlbGVjdENvbnRhaW5lci5hcHBlbmRDaGlsZChsaXN0SXRlbSk7XG5cdFx0XHRsaXN0SXRlbXMucHVzaChsaXN0SXRlbSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9zaW5nbGVTZWxlY3RJdGVtcy5zZXQocXVlc3Rpb24uaWQsIHsgaXRlbXM6IGxpc3RJdGVtcywgc2VsZWN0ZWRJbmRleCwgb3B0aW9uSW5kaWNlczogb3JkZXJlZE9wdGlvbnMubWFwKG8gPT4gby5vcmlnaW5hbEluZGV4KSB9KTtcblxuXHRcdC8vIFNldCBpbml0aWFsIGFyaWEtYWN0aXZlZGVzY2VuZGFudCBpZiB0aGVyZSdzIGEgc2VsZWN0ZWQgaXRlbVxuXHRcdGlmIChzZWxlY3RlZEluZGV4ID49IDAgJiYgc2VsZWN0ZWRJbmRleCA8IGxpc3RJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHNlbGVjdENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcsIGxpc3RJdGVtc1tzZWxlY3RlZEluZGV4XS5pZCk7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBmcmVlZm9ybSBpbnB1dCBvbmx5IHdoZW4gZXhwbGljaXRseSBhbGxvd2VkXG5cdFx0bGV0IGZyZWVmb3JtVGV4dGFyZWE6IEhUTUxUZXh0QXJlYUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHF1ZXN0aW9uLmFsbG93RnJlZWZvcm1JbnB1dCAhPT0gZmFsc2UpIHtcblx0XHRcdGNvbnN0IGZyZWVmb3JtQ29udGFpbmVyID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWZyZWVmb3JtJyk7XG5cblx0XHRcdGNvbnN0IGZyZWVmb3JtTnVtYmVyID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWZyZWVmb3JtLW51bWJlcicpO1xuXHRcdFx0ZnJlZWZvcm1OdW1iZXIudGV4dENvbnRlbnQgPSBgJHtvcmRlcmVkT3B0aW9ucy5sZW5ndGggKyAxfWA7XG5cdFx0XHRmcmVlZm9ybUNvbnRhaW5lci5hcHBlbmRDaGlsZChmcmVlZm9ybU51bWJlcik7XG5cblx0XHRcdGZyZWVmb3JtVGV4dGFyZWEgPSBkb20uJDxIVE1MVGV4dEFyZWFFbGVtZW50PigndGV4dGFyZWEuY2hhdC1xdWVzdGlvbi1mcmVlZm9ybS10ZXh0YXJlYScpO1xuXHRcdFx0ZnJlZWZvcm1UZXh0YXJlYS5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuZW50ZXJDdXN0b21BbnN3ZXInLCAnRW50ZXIgY3VzdG9tIGFuc3dlcicpO1xuXHRcdFx0ZnJlZWZvcm1UZXh0YXJlYS5yb3dzID0gMTtcblxuXHRcdFx0aWYgKHByZXZpb3VzRnJlZWZvcm0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRmcmVlZm9ybVRleHRhcmVhLnZhbHVlID0gcHJldmlvdXNGcmVlZm9ybTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2V0dXAgYXV0by1yZXNpemUgYmVoYXZpb3Jcblx0XHRcdGNvbnN0IGF1dG9SZXNpemUgPSB0aGlzLnNldHVwVGV4dGFyZWFBdXRvUmVzaXplKGZyZWVmb3JtVGV4dGFyZWEpO1xuXG5cdFx0XHQvLyBjbGVhciB3aGVuIHdlIHN0YXJ0IHR5cGluZyBpbiBmcmVlZm9ybVxuXHRcdFx0Y29uc3QgY2FwdHVyZWRGcmVlZm9ybSA9IGZyZWVmb3JtVGV4dGFyZWE7XG5cdFx0XHR0aGlzLl9pbnB1dEJveGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNhcHR1cmVkRnJlZWZvcm0sIGRvbS5FdmVudFR5cGUuSU5QVVQsICgpID0+IHtcblx0XHRcdFx0aWYgKGNhcHR1cmVkRnJlZWZvcm0udmFsdWUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHVwZGF0ZVNlbGVjdGlvbigtMSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5zYXZlQ3VycmVudEFuc3dlcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGZyZWVmb3JtQ29udGFpbmVyLmFwcGVuZENoaWxkKGZyZWVmb3JtVGV4dGFyZWEpO1xuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGZyZWVmb3JtQ29udGFpbmVyKTtcblx0XHRcdHRoaXMuX2ZyZWVmb3JtVGV4dGFyZWFzLnNldChxdWVzdGlvbi5pZCwgZnJlZWZvcm1UZXh0YXJlYSk7XG5cblx0XHRcdC8vIFJlc2l6ZSB0ZXh0YXJlYSBpZiBpdCBoYXMgcmVzdG9yZWQgY29udGVudFxuXHRcdFx0aWYgKHByZXZpb3VzRnJlZWZvcm0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9pbnB1dEJveGVzLmFkZChkb20ucnVuQXRUaGlzT3JTY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3coY2FwdHVyZWRGcmVlZm9ybSksICgpID0+IGF1dG9SZXNpemUoKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEtleWJvYXJkIG5hdmlnYXRpb24gZm9yIHRoZSBsaXN0XG5cdFx0dGhpcy5faW5wdXRCb3hlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihzZWxlY3RDb250YWluZXIsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRjb25zdCBkYXRhID0gdGhpcy5fc2luZ2xlU2VsZWN0SXRlbXMuZ2V0KHF1ZXN0aW9uLmlkKTtcblx0XHRcdGlmICghZGF0YSB8fCAhbGlzdEl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsZXQgbmV3SW5kZXggPSBkYXRhLnNlbGVjdGVkSW5kZXg7XG5cblx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkRvd25BcnJvdykge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdG5ld0luZGV4ID0gTWF0aC5taW4oZGF0YS5zZWxlY3RlZEluZGV4ICsgMSwgbGlzdEl0ZW1zLmxlbmd0aCAtIDEpO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlVwQXJyb3cpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRuZXdJbmRleCA9IE1hdGgubWF4KGRhdGEuc2VsZWN0ZWRJbmRleCAtIDEsIDApO1xuXHRcdFx0fSBlbHNlIGlmICgoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciB8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlNwYWNlKSAmJiAhZXZlbnQubWV0YUtleSAmJiAhZXZlbnQuY3RybEtleSkge1xuXHRcdFx0XHQvLyBFbnRlciBjb25maXJtcyBjdXJyZW50IHNlbGVjdGlvbiBhbmQgYWR2YW5jZXMgdG8gbmV4dCBxdWVzdGlvblxuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuaGFuZGxlTmV4dE9yU3VibWl0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQua2V5Q29kZSA+PSBLZXlDb2RlLkRpZ2l0MSAmJiBldmVudC5rZXlDb2RlIDw9IEtleUNvZGUuRGlnaXQ5KSB7XG5cdFx0XHRcdC8vIE51bWJlciBrZXlzIDEtOSBzZWxlY3QgdGhlIGNvcnJlc3BvbmRpbmcgb3B0aW9uLCBvciBmb2N1cyBmcmVlZm9ybSBmb3IgbmV4dCBudW1iZXJcblx0XHRcdFx0Y29uc3QgbnVtYmVySW5kZXggPSBldmVudC5rZXlDb2RlIC0gS2V5Q29kZS5EaWdpdDE7XG5cdFx0XHRcdGlmIChudW1iZXJJbmRleCA8IGxpc3RJdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0dXBkYXRlU2VsZWN0aW9uKG51bWJlckluZGV4KTtcblx0XHRcdFx0fSBlbHNlIGlmIChmcmVlZm9ybVRleHRhcmVhICYmIG51bWJlckluZGV4ID09PSBsaXN0SXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdHVwZGF0ZVNlbGVjdGlvbigtMSk7XG5cdFx0XHRcdFx0ZnJlZWZvcm1UZXh0YXJlYS5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG5ld0luZGV4ICE9PSBkYXRhLnNlbGVjdGVkSW5kZXggJiYgbmV3SW5kZXggPj0gMCkge1xuXHRcdFx0XHR1cGRhdGVTZWxlY3Rpb24obmV3SW5kZXgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIGZvY3VzIG9uIHRoZSByb3cgd2hlbiBmaXJzdCByZW5kZXJlZCBvciB0ZXh0YXJlYSBpZiBpdCBoYXMgY29udGVudFxuXHRcdGlmICh0aGlzLl9zaG91bGRBdXRvRm9jdXMoKSkge1xuXHRcdFx0aWYgKGZyZWVmb3JtVGV4dGFyZWEgJiYgcHJldmlvdXNGcmVlZm9ybSkge1xuXHRcdFx0XHRjb25zdCBjYXB0dXJlZEZyZWVmb3JtID0gZnJlZWZvcm1UZXh0YXJlYTtcblx0XHRcdFx0dGhpcy5faW5wdXRCb3hlcy5hZGQoZG9tLnJ1bkF0VGhpc09yU2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KGNhcHR1cmVkRnJlZWZvcm0pLCAoKSA9PiB7XG5cdFx0XHRcdFx0Y2FwdHVyZWRGcmVlZm9ybS5mb2N1cygpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9IGVsc2UgaWYgKGxpc3RJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGZvY3VzSW5kZXggPSBzZWxlY3RlZEluZGV4ID49IDAgPyBzZWxlY3RlZEluZGV4IDogMDtcblx0XHRcdFx0Ly8gaWYgbm8gZGVmYXVsdCBhbmQgbm8gZnJlZWZvcm0gdGV4dCwgc2VsZWN0IHRoZSBmaXJzdCBhbnN3ZXJcblx0XHRcdFx0aWYgKHNlbGVjdGVkSW5kZXggPCAwKSB7XG5cdFx0XHRcdFx0dXBkYXRlU2VsZWN0aW9uKDApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94ZXMuYWRkKGRvbS5ydW5BdFRoaXNPclNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyhzZWxlY3RDb250YWluZXIpLCAoKSA9PiB7XG5cdFx0XHRcdFx0bGlzdEl0ZW1zW2ZvY3VzSW5kZXhdPy5mb2N1cygpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNdWx0aVNlbGVjdChjb250YWluZXI6IEhUTUxFbGVtZW50LCBxdWVzdGlvbjogSUNoYXRRdWVzdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IG9yZGVyZWRPcHRpb25zID0gZ2V0T3B0aW9uc1dpdGhEZWZhdWx0c0ZpcnN0KHF1ZXN0aW9uKTtcblx0XHRjb25zdCBzZWxlY3RDb250YWluZXIgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tbGlzdCcpO1xuXHRcdHNlbGVjdENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGlzdGJveCcpO1xuXHRcdHNlbGVjdENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbXVsdGlzZWxlY3RhYmxlJywgJ3RydWUnKTtcblx0XHRzZWxlY3RDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgcXVlc3Rpb24udGl0bGUpO1xuXHRcdHNlbGVjdENvbnRhaW5lci50YWJJbmRleCA9IDA7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHNlbGVjdENvbnRhaW5lcik7XG5cblx0XHQvLyBSZXN0b3JlIHByZXZpb3VzIGFuc3dlciBpZiBleGlzdHNcblx0XHRjb25zdCBwcmV2aW91c0Fuc3dlciA9IHRoaXMuX2Fuc3dlcnMuZ2V0KHF1ZXN0aW9uLmlkKTtcblx0XHRjb25zdCBwcmV2TXVsdGkgPSB0eXBlb2YgcHJldmlvdXNBbnN3ZXIgPT09ICdvYmplY3QnICYmIHByZXZpb3VzQW5zd2VyICE9PSBudWxsICYmIGhhc0tleShwcmV2aW91c0Fuc3dlciwgeyBzZWxlY3RlZFZhbHVlczogdHJ1ZSB9KSA/IHByZXZpb3VzQW5zd2VyIGFzIElDaGF0TXVsdGlTZWxlY3RBbnN3ZXIgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcHJldmlvdXNGcmVlZm9ybSA9IHByZXZNdWx0aT8uZnJlZWZvcm1WYWx1ZTtcblx0XHRjb25zdCBwcmV2aW91c1NlbGVjdGVkVmFsdWVzID0gcHJldk11bHRpPy5zZWxlY3RlZFZhbHVlcyA/PyBbXTtcblxuXHRcdC8vIEdldCBkZWZhdWx0IG9wdGlvbiBpZHMgKGZvciBtdWx0aVNlbGVjdCwgZGVmYXVsdFZhbHVlIGNhbiBiZSBzdHJpbmcgb3Igc3RyaW5nW10pXG5cdFx0Y29uc3QgZGVmYXVsdE9wdGlvbklkczogc3RyaW5nW10gPSBBcnJheS5pc0FycmF5KHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSlcblx0XHRcdD8gcXVlc3Rpb24uZGVmYXVsdFZhbHVlXG5cdFx0XHQ6ICh0eXBlb2YgcXVlc3Rpb24uZGVmYXVsdFZhbHVlID09PSAnc3RyaW5nJyA/IFtxdWVzdGlvbi5kZWZhdWx0VmFsdWVdIDogW10pO1xuXG5cdFx0Y29uc3QgY2hlY2tib3hlczogQ2hlY2tib3hbXSA9IFtdO1xuXHRcdGNvbnN0IGxpc3RJdGVtczogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRcdGxldCBmb2N1c2VkSW5kZXggPSAwO1xuXHRcdGxldCBmaXJzdENoZWNrZWRJbmRleCA9IC0xO1xuXG5cdFx0b3JkZXJlZE9wdGlvbnMuZm9yRWFjaCgoeyBvcHRpb24gfSwgaW5kZXgpID0+IHtcblx0XHRcdC8vIERldGVybWluZSBpbml0aWFsIGNoZWNrZWQgc3RhdGVcblx0XHRcdGxldCBpc0NoZWNrZWQgPSBmYWxzZTtcblx0XHRcdGlmIChwcmV2aW91c1NlbGVjdGVkVmFsdWVzICYmIHByZXZpb3VzU2VsZWN0ZWRWYWx1ZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRpc0NoZWNrZWQgPSBwcmV2aW91c1NlbGVjdGVkVmFsdWVzLmluY2x1ZGVzKG9wdGlvbi52YWx1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKCFwcmV2aW91c0ZyZWVmb3JtICYmIGRlZmF1bHRPcHRpb25JZHMuaW5jbHVkZXMob3B0aW9uLmlkKSkge1xuXHRcdFx0XHRpc0NoZWNrZWQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaXN0SXRlbSA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1saXN0LWl0ZW0ubXVsdGktc2VsZWN0Jyk7XG5cdFx0XHRsaXN0SXRlbS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnb3B0aW9uJyk7XG5cdFx0XHRsaXN0SXRlbS5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCBTdHJpbmcoaXNDaGVja2VkKSk7XG5cdFx0XHRsaXN0SXRlbS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLm9wdGlvbkxhYmVsJywgXCJPcHRpb24gezB9OiB7MX1cIiwgaW5kZXggKyAxLCBvcHRpb24ubGFiZWwpKTtcblx0XHRcdGxpc3RJdGVtLmlkID0gYG9wdGlvbi0ke3F1ZXN0aW9uLmlkfS0ke2luZGV4fWA7XG5cdFx0XHRsaXN0SXRlbS50YWJJbmRleCA9IC0xO1xuXG5cdFx0XHRjb25zdCBudW1iZXIgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tbGlzdC1udW1iZXInKTtcblx0XHRcdG51bWJlci50ZXh0Q29udGVudCA9IGAke2luZGV4ICsgMX1gO1xuXHRcdFx0bGlzdEl0ZW0uYXBwZW5kQ2hpbGQobnVtYmVyKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGNoZWNrYm94IHVzaW5nIHRoZSBWUyBDb2RlIENoZWNrYm94IGNvbXBvbmVudFxuXHRcdFx0Y29uc3QgY2hlY2tib3ggPSB0aGlzLl9pbnB1dEJveGVzLmFkZChuZXcgQ2hlY2tib3gob3B0aW9uLmxhYmVsLCBpc0NoZWNrZWQsIGRlZmF1bHRDaGVja2JveFN0eWxlcykpO1xuXHRcdFx0Y2hlY2tib3guZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LXF1ZXN0aW9uLWxpc3QtY2hlY2tib3gnKTtcblx0XHRcdC8vIFJlbW92ZSBjaGVja2JveCBmcm9tIHRhYiBvcmRlciBzaW5jZSBsaXN0IGl0ZW1zIGFyZSBuYXZpZ2FibGUgd2l0aCBhcnJvdyBrZXlzXG5cdFx0XHRjaGVja2JveC5kb21Ob2RlLnRhYkluZGV4ID0gLTE7XG5cdFx0XHRsaXN0SXRlbS5hcHBlbmRDaGlsZChjaGVja2JveC5kb21Ob2RlKTtcblxuXHRcdFx0Ly8gTGFiZWwgd2l0aCBvcHRpb25hbCBkZXNjcmlwdGlvbiAoZm9ybWF0OiBcIlRpdGxlIC0gRGVzY3JpcHRpb25cIilcblx0XHRcdGNvbnN0IGxhYmVsID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWxpc3QtbGFiZWwnKTtcblx0XHRcdGNvbnN0IHNlcGFyYXRvckluZGV4ID0gb3B0aW9uLmxhYmVsLmluZGV4T2YoJyAtICcpO1xuXHRcdFx0aWYgKHNlcGFyYXRvckluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRsaXN0SXRlbS5jbGFzc0xpc3QuYWRkKCdoYXMtZGVzY3JpcHRpb24nKTtcblx0XHRcdFx0Y29uc3QgdGl0bGVTcGFuID0gZG9tLiQoJ3NwYW4uY2hhdC1xdWVzdGlvbi1saXN0LWxhYmVsLXRpdGxlJyk7XG5cdFx0XHRcdHRpdGxlU3Bhbi50ZXh0Q29udGVudCA9IG9wdGlvbi5sYWJlbC5zdWJzdHJpbmcoMCwgc2VwYXJhdG9ySW5kZXgpO1xuXHRcdFx0XHRsYWJlbC5hcHBlbmRDaGlsZCh0aXRsZVNwYW4pO1xuXG5cdFx0XHRcdGNvbnN0IGRlc2NTcGFuID0gZG9tLiQoJ3NwYW4uY2hhdC1xdWVzdGlvbi1saXN0LWxhYmVsLWRlc2MnKTtcblx0XHRcdFx0ZGVzY1NwYW4udGV4dENvbnRlbnQgPSBvcHRpb24ubGFiZWwuc3Vic3RyaW5nKHNlcGFyYXRvckluZGV4ICsgMyk7XG5cdFx0XHRcdGxhYmVsLmFwcGVuZENoaWxkKGRlc2NTcGFuKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gb3B0aW9uLmxhYmVsO1xuXHRcdFx0fVxuXHRcdFx0bGlzdEl0ZW0uYXBwZW5kQ2hpbGQobGFiZWwpO1xuXG5cdFx0XHRpZiAoaXNDaGVja2VkKSB7XG5cdFx0XHRcdGxpc3RJdGVtLmNsYXNzTGlzdC5hZGQoJ2NoZWNrZWQnKTtcblx0XHRcdFx0aWYgKGZpcnN0Q2hlY2tlZEluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdGZpcnN0Q2hlY2tlZEluZGV4ID0gaW5kZXg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gU3luYyBjaGVja2JveCBzdGF0ZSB3aXRoIGxpc3QgaXRlbSB2aXN1YWwgc3RhdGVcblx0XHRcdHRoaXMuX2lucHV0Qm94ZXMuYWRkKGNoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0bGlzdEl0ZW0uY2xhc3NMaXN0LnRvZ2dsZSgnY2hlY2tlZCcsIGNoZWNrYm94LmNoZWNrZWQpO1xuXHRcdFx0XHRsaXN0SXRlbS5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCBTdHJpbmcoY2hlY2tib3guY2hlY2tlZCkpO1xuXHRcdFx0XHR0aGlzLnNhdmVDdXJyZW50QW5zd2VyKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIENsaWNrIGhhbmRsZXIgZm9yIHRoZSBlbnRpcmUgcm93ICh0b2dnbGUgY2hlY2tib3gpXG5cdFx0XHR0aGlzLl9pbnB1dEJveGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxpc3RJdGVtLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHQvLyBVcGRhdGUgZm9jdXNlZEluZGV4IHdoZW4gY2xpY2tpbmcgYSByb3dcblx0XHRcdFx0Zm9jdXNlZEluZGV4ID0gaW5kZXg7XG5cdFx0XHRcdC8vIERvbid0IHRvZ2dsZSBpZiB0aGUgY2xpY2sgd2FzIG9uIHRoZSBjaGVja2JveCBpdHNlbGYgKGl0IGhhbmRsZXMgaXRzZWxmKVxuXHRcdFx0XHRpZiAoZS50YXJnZXQgIT09IGNoZWNrYm94LmRvbU5vZGUgJiYgIWNoZWNrYm94LmRvbU5vZGUuY29udGFpbnMoZS50YXJnZXQgYXMgTm9kZSkpIHtcblx0XHRcdFx0XHQvLyBVc2UgY2xpY2soKSB0byB0cmlnZ2VyIG9uQ2hhbmdlIGFuZCBzeW5jIHZpc3VhbCBzdGF0ZVxuXHRcdFx0XHRcdGNoZWNrYm94LmRvbU5vZGUuY2xpY2soKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9pbnB1dEJveGVzLmFkZCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIobGlzdEl0ZW0sIHtcblx0XHRcdFx0Y29udGVudDogb3B0aW9uLmxhYmVsLFxuXHRcdFx0XHRwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XIH0sXG5cdFx0XHRcdGFwcGVhcmFuY2U6IHsgc2hvd1BvaW50ZXI6IHRydWUgfVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRzZWxlY3RDb250YWluZXIuYXBwZW5kQ2hpbGQobGlzdEl0ZW0pO1xuXHRcdFx0Y2hlY2tib3hlcy5wdXNoKGNoZWNrYm94KTtcblx0XHRcdGxpc3RJdGVtcy5wdXNoKGxpc3RJdGVtKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX211bHRpU2VsZWN0Q2hlY2tib3hlcy5zZXQocXVlc3Rpb24uaWQsIHsgY2hlY2tib3hlcywgb3B0aW9uSW5kaWNlczogb3JkZXJlZE9wdGlvbnMubWFwKG8gPT4gby5vcmlnaW5hbEluZGV4KSB9KTtcblxuXHRcdC8vIFNob3cgZnJlZWZvcm0gaW5wdXQgb25seSB3aGVuIGV4cGxpY2l0bHkgYWxsb3dlZFxuXHRcdGxldCBmcmVlZm9ybVRleHRhcmVhOiBIVE1MVGV4dEFyZWFFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChxdWVzdGlvbi5hbGxvd0ZyZWVmb3JtSW5wdXQgIT09IGZhbHNlKSB7XG5cdFx0XHRjb25zdCBmcmVlZm9ybUNvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1mcmVlZm9ybScpO1xuXG5cdFx0XHQvLyBOdW1iZXIgaW5kaWNhdG9yIGZvciBmcmVlZm9ybSAoY29tZXMgYWZ0ZXIgYWxsIG9wdGlvbnMpXG5cdFx0XHRjb25zdCBmcmVlZm9ybU51bWJlciA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1mcmVlZm9ybS1udW1iZXInKTtcblx0XHRcdGZyZWVmb3JtTnVtYmVyLnRleHRDb250ZW50ID0gYCR7b3JkZXJlZE9wdGlvbnMubGVuZ3RoICsgMX1gO1xuXHRcdFx0ZnJlZWZvcm1Db250YWluZXIuYXBwZW5kQ2hpbGQoZnJlZWZvcm1OdW1iZXIpO1xuXG5cdFx0XHRmcmVlZm9ybVRleHRhcmVhID0gZG9tLiQ8SFRNTFRleHRBcmVhRWxlbWVudD4oJ3RleHRhcmVhLmNoYXQtcXVlc3Rpb24tZnJlZWZvcm0tdGV4dGFyZWEnKTtcblx0XHRcdGZyZWVmb3JtVGV4dGFyZWEucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLmVudGVyQ3VzdG9tQW5zd2VyJywgJ0VudGVyIGN1c3RvbSBhbnN3ZXInKTtcblx0XHRcdGZyZWVmb3JtVGV4dGFyZWEucm93cyA9IDE7XG5cblx0XHRcdGlmIChwcmV2aW91c0ZyZWVmb3JtICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0ZnJlZWZvcm1UZXh0YXJlYS52YWx1ZSA9IHByZXZpb3VzRnJlZWZvcm07XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNldHVwIGF1dG8tcmVzaXplIGJlaGF2aW9yXG5cdFx0XHRjb25zdCBhdXRvUmVzaXplID0gdGhpcy5zZXR1cFRleHRhcmVhQXV0b1Jlc2l6ZShmcmVlZm9ybVRleHRhcmVhKTtcblx0XHRcdHRoaXMuX2lucHV0Qm94ZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZnJlZWZvcm1UZXh0YXJlYSwgZG9tLkV2ZW50VHlwZS5JTlBVVCwgKCkgPT4gdGhpcy5zYXZlQ3VycmVudEFuc3dlcigpKSk7XG5cblx0XHRcdGZyZWVmb3JtQ29udGFpbmVyLmFwcGVuZENoaWxkKGZyZWVmb3JtVGV4dGFyZWEpO1xuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGZyZWVmb3JtQ29udGFpbmVyKTtcblx0XHRcdHRoaXMuX2ZyZWVmb3JtVGV4dGFyZWFzLnNldChxdWVzdGlvbi5pZCwgZnJlZWZvcm1UZXh0YXJlYSk7XG5cblx0XHRcdC8vIFJlc2l6ZSB0ZXh0YXJlYSBpZiBpdCBoYXMgcmVzdG9yZWQgY29udGVudFxuXHRcdFx0aWYgKHByZXZpb3VzRnJlZWZvcm0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9pbnB1dEJveGVzLmFkZChkb20ucnVuQXRUaGlzT3JTY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3coZnJlZWZvcm1UZXh0YXJlYSksICgpID0+IGF1dG9SZXNpemUoKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEtleWJvYXJkIG5hdmlnYXRpb24gZm9yIHRoZSBsaXN0XG5cdFx0dGhpcy5faW5wdXRCb3hlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihzZWxlY3RDb250YWluZXIsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cblx0XHRcdC8vIEd1YXJkIGFnYWluc3QgZW1wdHkgbGlzdFxuXHRcdFx0aWYgKCFsaXN0SXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRG93bkFycm93KSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0Zm9jdXNlZEluZGV4ID0gTWF0aC5taW4oZm9jdXNlZEluZGV4ICsgMSwgbGlzdEl0ZW1zLmxlbmd0aCAtIDEpO1xuXHRcdFx0XHRsaXN0SXRlbXNbZm9jdXNlZEluZGV4XS5mb2N1cygpO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlVwQXJyb3cpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRmb2N1c2VkSW5kZXggPSBNYXRoLm1heChmb2N1c2VkSW5kZXggLSAxLCAwKTtcblx0XHRcdFx0bGlzdEl0ZW1zW2ZvY3VzZWRJbmRleF0uZm9jdXMoKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciAmJiAhZXZlbnQubWV0YUtleSAmJiAhZXZlbnQuY3RybEtleSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuaGFuZGxlTmV4dE9yU3VibWl0KCk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuU3BhY2UpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHQvLyBUb2dnbGUgdGhlIGN1cnJlbnRseSBmb2N1c2VkIGNoZWNrYm94IHVzaW5nIGNsaWNrKCkgdG8gdHJpZ2dlciBvbkNoYW5nZVxuXHRcdFx0XHRpZiAoZm9jdXNlZEluZGV4ID49IDAgJiYgZm9jdXNlZEluZGV4IDwgY2hlY2tib3hlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRjaGVja2JveGVzW2ZvY3VzZWRJbmRleF0uZG9tTm9kZS5jbGljaygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmtleUNvZGUgPj0gS2V5Q29kZS5EaWdpdDEgJiYgZXZlbnQua2V5Q29kZSA8PSBLZXlDb2RlLkRpZ2l0OSkge1xuXHRcdFx0XHQvLyBOdW1iZXIga2V5cyAxLTkgdG9nZ2xlIHRoZSBjb3JyZXNwb25kaW5nIGNoZWNrYm94LCBvciBmb2N1cyBmcmVlZm9ybSBmb3IgbmV4dCBudW1iZXJcblx0XHRcdFx0Y29uc3QgbnVtYmVySW5kZXggPSBldmVudC5rZXlDb2RlIC0gS2V5Q29kZS5EaWdpdDE7XG5cdFx0XHRcdGlmIChudW1iZXJJbmRleCA8IGNoZWNrYm94ZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGNoZWNrYm94ZXNbbnVtYmVySW5kZXhdLmRvbU5vZGUuY2xpY2soKTtcblx0XHRcdFx0fSBlbHNlIGlmIChmcmVlZm9ybVRleHRhcmVhICYmIG51bWJlckluZGV4ID09PSBjaGVja2JveGVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRmcmVlZm9ybVRleHRhcmVhLmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBGb2N1cyBvbiB0aGUgYXBwcm9wcmlhdGUgcm93IHdoZW4gcmVuZGVyZWQgb3IgdGV4dGFyZWEgaWYgaXQgaGFzIGNvbnRlbnRcblx0XHRpZiAodGhpcy5fc2hvdWxkQXV0b0ZvY3VzKCkpIHtcblx0XHRcdGlmIChmcmVlZm9ybVRleHRhcmVhICYmIHByZXZpb3VzRnJlZWZvcm0pIHtcblx0XHRcdFx0Y29uc3QgY2FwdHVyZWRGcmVlZm9ybSA9IGZyZWVmb3JtVGV4dGFyZWE7XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94ZXMuYWRkKGRvbS5ydW5BdFRoaXNPclNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyhjYXB0dXJlZEZyZWVmb3JtKSwgKCkgPT4ge1xuXHRcdFx0XHRcdGNhcHR1cmVkRnJlZWZvcm0uZm9jdXMoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSBlbHNlIGlmIChsaXN0SXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBpbml0aWFsRm9jdXNJbmRleCA9IGZpcnN0Q2hlY2tlZEluZGV4ID49IDAgPyBmaXJzdENoZWNrZWRJbmRleCA6IDA7XG5cdFx0XHRcdGZvY3VzZWRJbmRleCA9IGluaXRpYWxGb2N1c0luZGV4O1xuXHRcdFx0XHR0aGlzLl9pbnB1dEJveGVzLmFkZChkb20ucnVuQXRUaGlzT3JTY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3coc2VsZWN0Q29udGFpbmVyKSwgKCkgPT4ge1xuXHRcdFx0XHRcdGxpc3RJdGVtc1tpbml0aWFsRm9jdXNJbmRleF0/LmZvY3VzKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEN1cnJlbnRBbnN3ZXIoKTogSUNoYXRRdWVzdGlvbkFuc3dlclZhbHVlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBxdWVzdGlvbiA9IHRoaXMuY2Fyb3VzZWwucXVlc3Rpb25zW3RoaXMuX2N1cnJlbnRJbmRleF07XG5cdFx0aWYgKCFxdWVzdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKHF1ZXN0aW9uLnR5cGUpIHtcblx0XHRcdGNhc2UgJ3RleHQnOiB7XG5cdFx0XHRcdGNvbnN0IGlucHV0Qm94ID0gdGhpcy5fdGV4dElucHV0Qm94ZXMuZ2V0KHF1ZXN0aW9uLmlkKTtcblx0XHRcdFx0cmV0dXJuIGlucHV0Qm94Py52YWx1ZSA/PyAodHlwZW9mIHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSA9PT0gJ3N0cmluZycgPyBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgOiBBcnJheS5pc0FycmF5KHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSkgPyB7IHNlbGVjdGVkVmFsdWVzOiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgfSA6IHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgJ3NpbmdsZVNlbGVjdCc6IHtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuX3NpbmdsZVNlbGVjdEl0ZW1zLmdldChxdWVzdGlvbi5pZCk7XG5cdFx0XHRcdGxldCBzZWxlY3RlZFZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChkYXRhICYmIGRhdGEuc2VsZWN0ZWRJbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxJbmRleCA9IGRhdGEub3B0aW9uSW5kaWNlc1tkYXRhLnNlbGVjdGVkSW5kZXhdO1xuXHRcdFx0XHRcdHNlbGVjdGVkVmFsdWUgPSBvcmlnaW5hbEluZGV4ICE9PSB1bmRlZmluZWQgPyBxdWVzdGlvbi5vcHRpb25zPy5bb3JpZ2luYWxJbmRleF0/LnZhbHVlIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEZpbmQgZGVmYXVsdCBvcHRpb24gaWYgbm90aGluZyBzZWxlY3RlZCAoZGVmYXVsdFZhbHVlIGlzIHRoZSBvcHRpb24gaWQpXG5cdFx0XHRcdGlmIChzZWxlY3RlZFZhbHVlID09PSB1bmRlZmluZWQgJiYgdHlwZW9mIHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRjb25zdCBkZWZhdWx0T3B0aW9uID0gcXVlc3Rpb24ub3B0aW9ucz8uZmluZChvcHQgPT4gb3B0LmlkID09PSBxdWVzdGlvbi5kZWZhdWx0VmFsdWUpO1xuXHRcdFx0XHRcdHNlbGVjdGVkVmFsdWUgPSBkZWZhdWx0T3B0aW9uPy52YWx1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEZvciBzaW5nbGUtc2VsZWN0OiBpZiBmcmVlZm9ybSBpcyBwcm92aWRlZCwgdXNlIE9OTFkgZnJlZWZvcm0gKGlnbm9yZSBzZWxlY3Rpb24pXG5cdFx0XHRcdGNvbnN0IGZyZWVmb3JtVGV4dGFyZWEgPSB0aGlzLl9mcmVlZm9ybVRleHRhcmVhcy5nZXQocXVlc3Rpb24uaWQpO1xuXHRcdFx0XHRjb25zdCBmcmVlZm9ybVZhbHVlID0gZnJlZWZvcm1UZXh0YXJlYT8udmFsdWUgIT09ICcnID8gZnJlZWZvcm1UZXh0YXJlYT8udmFsdWUgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChmcmVlZm9ybVZhbHVlKSB7XG5cdFx0XHRcdFx0Ly8gRnJlZWZvcm0gdGFrZXMgcHJpb3JpdHkgLSBpZ25vcmUgc2VsZWN0ZWRWYWx1ZVxuXHRcdFx0XHRcdHJldHVybiB7IHNlbGVjdGVkVmFsdWU6IHVuZGVmaW5lZCwgZnJlZWZvcm1WYWx1ZSB9IHNhdGlzZmllcyBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc2VsZWN0ZWRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgc2VsZWN0ZWRWYWx1ZSwgZnJlZWZvcm1WYWx1ZTogdW5kZWZpbmVkIH0gc2F0aXNmaWVzIElDaGF0U2luZ2xlU2VsZWN0QW5zd2VyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgJ211bHRpU2VsZWN0Jzoge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gdGhpcy5fbXVsdGlTZWxlY3RDaGVja2JveGVzLmdldChxdWVzdGlvbi5pZCk7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkVmFsdWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRpZiAoZGF0YSkge1xuXHRcdFx0XHRcdGRhdGEuY2hlY2tib3hlcy5mb3JFYWNoKChjaGVja2JveCwgaW5kZXgpID0+IHtcblx0XHRcdFx0XHRcdGlmIChjaGVja2JveC5jaGVja2VkKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsSW5kZXggPSBkYXRhLm9wdGlvbkluZGljZXNbaW5kZXhdO1xuXHRcdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IG9yaWdpbmFsSW5kZXggIT09IHVuZGVmaW5lZCA/IHF1ZXN0aW9uLm9wdGlvbnM/LltvcmlnaW5hbEluZGV4XT8udmFsdWUgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0c2VsZWN0ZWRWYWx1ZXMucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEFsd2F5cyBpbmNsdWRlIGZyZWVmb3JtIHZhbHVlIGZvciBtdWx0aS1zZWxlY3QgcXVlc3Rpb25zXG5cdFx0XHRcdGNvbnN0IGZyZWVmb3JtVGV4dGFyZWEgPSB0aGlzLl9mcmVlZm9ybVRleHRhcmVhcy5nZXQocXVlc3Rpb24uaWQpO1xuXHRcdFx0XHRjb25zdCBmcmVlZm9ybVZhbHVlID0gZnJlZWZvcm1UZXh0YXJlYT8udmFsdWUgIT09ICcnID8gZnJlZWZvcm1UZXh0YXJlYT8udmFsdWUgOiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0Ly8gUmV0dXJuIHdoYXRldmVyIHdhcyBzZWxlY3RlZCAtIGRlZmF1bHRzIGFyZSBhcHBsaWVkIGF0IHJlbmRlciB0aW1lIHdoZW5cblx0XHRcdFx0Ly8gY2hlY2tib3hlcyBhcmUgaW5pdGlhbGx5IGNoZWNrZWQsIHNvIGVtcHR5IHNlbGVjdGlvbiBtZWFucyB1c2VyIHVuY2hlY2tlZCBhbGxcblx0XHRcdFx0aWYgKGZyZWVmb3JtVmFsdWUgfHwgc2VsZWN0ZWRWYWx1ZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHJldHVybiB7IHNlbGVjdGVkVmFsdWVzLCBmcmVlZm9ybVZhbHVlIH0gc2F0aXNmaWVzIElDaGF0TXVsdGlTZWxlY3RBbnN3ZXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHR5cGVvZiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgPT09ICdzdHJpbmcnID8gcXVlc3Rpb24uZGVmYXVsdFZhbHVlIDogQXJyYXkuaXNBcnJheShxdWVzdGlvbi5kZWZhdWx0VmFsdWUpID8geyBzZWxlY3RlZFZhbHVlczogcXVlc3Rpb24uZGVmYXVsdFZhbHVlIH0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgYSB0ZXJtaW5hbC1zdGF0ZSBtZXNzYWdlIChTa2lwcGVkL0Fuc3dlcmVkKSB3aGVuIHRoZSBjYXJvdXNlbCBpc1xuXHQgKiBkaXNtaXNzZWQgd2l0aG91dCBzdHJ1Y3R1cmVkIGFuc3dlcnMuXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlclRlcm1pbmFsU3RhdGVNZXNzYWdlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHN1bW1hcnlDb250YWluZXIgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtc3VtbWFyeScpO1xuXHRcdGNvbnN0IGlzRGlzbWlzc2VkQnlUZXJtaW5hbCA9IHRoaXMuY2Fyb3VzZWwgaW5zdGFuY2VvZiBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEgJiYgdGhpcy5jYXJvdXNlbC5kaXNtaXNzZWRCeVRlcm1pbmFsSW5wdXQ7XG5cdFx0aWYgKHRoaXMuY2Fyb3VzZWwuYW5zd2VyZWRFeHRlcm5hbGx5KSB7XG5cdFx0XHRjb25zdCBhbnN3ZXJlZE1lc3NhZ2UgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1hbnN3ZXJlZCcpO1xuXHRcdFx0YW5zd2VyZWRNZXNzYWdlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5hbnN3ZXJlZCcsICdBbnN3ZXJlZCcpO1xuXHRcdFx0c3VtbWFyeUNvbnRhaW5lci5hcHBlbmRDaGlsZChhbnN3ZXJlZE1lc3NhZ2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBza2lwcGVkTWVzc2FnZSA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LXNraXBwZWQnKTtcblx0XHRcdHNraXBwZWRNZXNzYWdlLnRleHRDb250ZW50ID0gaXNEaXNtaXNzZWRCeVRlcm1pbmFsXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5kZWZlcnJlZFRvVGVybWluYWwnLCBcIkRlZmVycmluZyB0byB1c2VyJ3MgaW5wdXQgaW4gdGhlIHRlcm1pbmFsXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5za2lwcGVkJywgJ1NraXBwZWQgcXVlc3Rpb24nKTtcblx0XHRcdHN1bW1hcnlDb250YWluZXIuYXBwZW5kQ2hpbGQoc2tpcHBlZE1lc3NhZ2UpO1xuXHRcdH1cblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQoc3VtbWFyeUNvbnRhaW5lcik7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVycyBhIHN1bW1hcnkgb2YgYW5zd2VycyB3aGVuIHRoZSBjYXJvdXNlbCBpcyBhbHJlYWR5IHVzZWQuXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlclN1bW1hcnkoKTogdm9pZCB7XG5cdFx0Ly8gSWYgbm8gYW5zd2Vycywgc2hvdyB0aGUgdGVybWluYWwtc3RhdGUgKFNraXBwZWQvQW5zd2VyZWQpIG1lc3NhZ2Vcblx0XHRpZiAodGhpcy5fYW5zd2Vycy5zaXplID09PSAwKSB7XG5cdFx0XHRpZiAodGhpcy5jYXJvdXNlbC5hbnN3ZXJQcmVzZW50YXRpb24gPT09ICdjb252ZXJzYXRpb24nKSB7XG5cdFx0XHRcdGlmICh0aGlzLmNhcm91c2VsLmF1dG9SZXBseSkge1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyQ29udmVyc2F0aW9uU3VtbWFyeSh7XG5cdFx0XHRcdFx0XHRhbnN3ZXJGYWxsYmFjazogbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5hbnN3ZXJlZEF1dG9tYXRpY2FsbHknLCBcIkFuc3dlcmVkIGF1dG9tYXRpY2FsbHlcIiksXG5cdFx0XHRcdFx0XHRhbnN3ZXJJY29uOiBDb2RpY29uLmNvcGlsb3RDb21wYWN0LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuY2Fyb3VzZWwuYW5zd2VyZWRFeHRlcm5hbGx5KSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJUZXJtaW5hbFN0YXRlTWVzc2FnZSgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuY2Fyb3VzZWwuaXNVc2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJDb252ZXJzYXRpb25TdW1tYXJ5KHtcblx0XHRcdFx0XHRcdGFuc3dlckZhbGxiYWNrOiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnNraXBwZWRDb252ZXJzYXRpb24nLCBcIlNraXBwZWQgcXVlc3Rpb25cIiksXG5cdFx0XHRcdFx0XHRhbnN3ZXJJY29uOiBDb2RpY29uLmNsb3NlQ29tcGFjdCxcblx0XHRcdFx0XHRcdGhpZGVBbnN3ZXJQcmVmaXg6IHRydWUsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuY2Fyb3VzZWwuaXNVc2VkKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyVGVybWluYWxTdGF0ZU1lc3NhZ2UoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jYXJvdXNlbC5hbnN3ZXJQcmVzZW50YXRpb24gPT09ICdjb252ZXJzYXRpb24nKSB7XG5cdFx0XHR0aGlzLnJlbmRlckNvbnZlcnNhdGlvblN1bW1hcnkoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdW1tYXJ5Q29udGFpbmVyID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLXN1bW1hcnknKTtcblxuXHRcdGZvciAoY29uc3QgcXVlc3Rpb24gb2YgdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnMpIHtcblx0XHRcdGNvbnN0IGFuc3dlciA9IHRoaXMuX2Fuc3dlcnMuZ2V0KHF1ZXN0aW9uLmlkKTtcblxuXHRcdFx0Y29uc3Qgc3VtbWFyeUl0ZW0gPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1pdGVtJyk7XG5cblx0XHRcdGNvbnN0IHF1ZXN0aW9uUm93ID0gZG9tLiQoJ2Rpdi5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktbGFiZWwnKTtcblx0XHRcdGNvbnN0IHF1ZXN0aW9uVGV4dCA9IGdldERpc3BsYXllZFF1ZXN0aW9uVGV4dChxdWVzdGlvbik7XG5cdFx0XHRsZXQgbGFiZWxUZXh0ID0gdHlwZW9mIHF1ZXN0aW9uVGV4dCA9PT0gJ3N0cmluZycgPyBxdWVzdGlvblRleHQgOiBxdWVzdGlvblRleHQudmFsdWU7XG5cdFx0XHRsYWJlbFRleHQgPSBsYWJlbFRleHQucmVwbGFjZSgvWzpcXHNdKyQvLCAnJyk7XG5cdFx0XHRxdWVzdGlvblJvdy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuc3VtbWFyeVF1ZXN0aW9uJywgJ1E6IHswfScsIGxhYmVsVGV4dCk7XG5cdFx0XHRzdW1tYXJ5SXRlbS5hcHBlbmRDaGlsZChxdWVzdGlvblJvdyk7XG5cblx0XHRcdGlmIChhbnN3ZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBmb3JtYXR0ZWRBbnN3ZXIgPSB0aGlzLmZvcm1hdEFuc3dlckZvclN1bW1hcnkocXVlc3Rpb24sIGFuc3dlcik7XG5cdFx0XHRcdGNvbnN0IGFuc3dlclJvdyA9IGRvbS4kKCdkaXYuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LWFuc3dlci10aXRsZScpO1xuXHRcdFx0XHRhbnN3ZXJSb3cudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnN1bW1hcnlBbnN3ZXInLCAnQTogezB9JywgZm9ybWF0dGVkQW5zd2VyKTtcblx0XHRcdFx0c3VtbWFyeUl0ZW0uYXBwZW5kQ2hpbGQoYW5zd2VyUm93KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHVuYW5zd2VyZWQgPSBkb20uJCgnZGl2LmNoYXQtcXVlc3Rpb24tc3VtbWFyeS11bmFuc3dlcmVkJyk7XG5cdFx0XHRcdHVuYW5zd2VyZWQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLm5vdEFuc3dlcmVkWWV0JywgJ05vdCBhbnN3ZXJlZCB5ZXQnKTtcblx0XHRcdFx0c3VtbWFyeUl0ZW0uYXBwZW5kQ2hpbGQodW5hbnN3ZXJlZCk7XG5cdFx0XHR9XG5cblx0XHRcdHN1bW1hcnlDb250YWluZXIuYXBwZW5kQ2hpbGQoc3VtbWFyeUl0ZW0pO1xuXHRcdH1cblxuXHRcdHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZChzdW1tYXJ5Q29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ29udmVyc2F0aW9uU3VtbWFyeShvcHRpb25zPzogeyBhbnN3ZXJGYWxsYmFjaz86IHN0cmluZzsgYW5zd2VySWNvbj86IFRoZW1lSWNvbjsgaGlkZUFuc3dlclByZWZpeD86IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGNvbnN0IHN1bW1hcnlTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9pbnRlcmFjdGl2ZVVJU3RvcmUudmFsdWUgPSBzdW1tYXJ5U3RvcmU7XG5cdFx0Y29uc3Qgc3VtbWFyeUNvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1zdW1tYXJ5LmNoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtY29udmVyc2F0aW9uLXN1bW1hcnknKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5hbnN3ZXJlZFF1ZXN0aW9ucycsIFwiQW5zd2VyZWQgY2hhdCBxdWVzdGlvbnNcIikpO1xuXG5cdFx0Zm9yIChjb25zdCBxdWVzdGlvbiBvZiB0aGlzLmNhcm91c2VsLnF1ZXN0aW9ucykge1xuXHRcdFx0Y29uc3QgYW5zd2VyID0gdGhpcy5fYW5zd2Vycy5nZXQocXVlc3Rpb24uaWQpO1xuXHRcdFx0Y29uc3Qgc3VtbWFyeUl0ZW0gPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1pdGVtJyk7XG5cdFx0XHRjb25zdCBxdWVzdGlvblZhbHVlID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktcXVlc3Rpb24nKTtcblx0XHRcdGNvbnN0IHF1ZXN0aW9uVGV4dCA9IGdldERpc3BsYXllZFF1ZXN0aW9uVGV4dChxdWVzdGlvbik7XG5cdFx0XHRjb25zdCBkaXNwbGF5ZWRRdWVzdGlvbiA9ICh0eXBlb2YgcXVlc3Rpb25UZXh0ID09PSAnc3RyaW5nJyA/IHF1ZXN0aW9uVGV4dCA6IHF1ZXN0aW9uVGV4dC52YWx1ZSkucmVwbGFjZSgvWzpcXHNdKyQvLCAnJyk7XG5cdFx0XHRjb25zdCBxdWVzdGlvblByZWZpeCA9IGRvbS4kKCdzcGFuLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1wcmVmaXgnKTtcblx0XHRcdHF1ZXN0aW9uUHJlZml4LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5xdWVzdGlvblByZWZpeCcsIFwiUXVlc3Rpb246XCIpO1xuXHRcdFx0Y29uc3QgcXVlc3Rpb25UZXh0VmFsdWUgPSBkb20uJCgnc3Bhbi5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktcXVlc3Rpb24tdmFsdWUnKTtcblx0XHRcdHF1ZXN0aW9uVGV4dFZhbHVlLnRleHRDb250ZW50ID0gZGlzcGxheWVkUXVlc3Rpb247XG5cdFx0XHRzdW1tYXJ5U3RvcmUuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihxdWVzdGlvblRleHRWYWx1ZSwgeyBjb250ZW50OiBkaXNwbGF5ZWRRdWVzdGlvbiB9KSk7XG5cdFx0XHRxdWVzdGlvblZhbHVlLmFwcGVuZChxdWVzdGlvblByZWZpeCwgcXVlc3Rpb25WYWx1ZS5vd25lckRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcgJyksIHF1ZXN0aW9uVGV4dFZhbHVlKTtcblx0XHRcdHN1bW1hcnlJdGVtLmFwcGVuZENoaWxkKHF1ZXN0aW9uVmFsdWUpO1xuXG5cdFx0XHRjb25zdCBkZWNpc2lvbiA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LWRlY2lzaW9uJyk7XG5cdFx0XHRjb25zdCBhbnN3ZXJWYWx1ZSA9IGFuc3dlciA9PT0gdW5kZWZpbmVkXG5cdFx0XHRcdD8gb3B0aW9ucz8uYW5zd2VyRmFsbGJhY2sgPz8gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5jb252ZXJzYXRpb25Ob3RBbnN3ZXJlZCcsIFwiTm90IGFuc3dlcmVkIHlldFwiKVxuXHRcdFx0XHQ6IHRoaXMuZm9ybWF0QW5zd2VyRm9yU3VtbWFyeShxdWVzdGlvbiwgYW5zd2VyKTtcblx0XHRcdGNvbnN0IGFuc3dlclByZWZpeCA9IG9wdGlvbnM/LmhpZGVBbnN3ZXJQcmVmaXggPyB1bmRlZmluZWQgOiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLmFuc3dlclByZWZpeCcsIFwiQW5zd2VyZWQ6XCIpO1xuXHRcdFx0Y29uc3QgYW5zd2VyVGl0bGUgPSBhbnN3ZXJQcmVmaXhcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLmNvbnZlcnNhdGlvbkFuc3dlcicsIFwiezB9IHsxfVwiLCBhbnN3ZXJQcmVmaXgsIGFuc3dlclZhbHVlKVxuXHRcdFx0XHQ6IGFuc3dlclZhbHVlO1xuXHRcdFx0Y29uc3QgY29sbGFwc2libGVDb250ZXh0ID0ge1xuXHRcdFx0XHQuLi50aGlzLl9jb250ZXh0LFxuXHRcdFx0XHRjb250ZW50OiB0aGlzLl9jb250ZXh0LmNvbnRlbnQgPz8gW10sXG5cdFx0XHRcdGNvbnRlbnRJbmRleDogdGhpcy5fY29udGV4dC5jb250ZW50SW5kZXggPz8gMCxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBhbnN3ZXJQYXJ0ID0gc3VtbWFyeVN0b3JlLmFkZChuZXcgQ2hhdFF1ZXN0aW9uQW5zd2VyQ29sbGFwc2libGVQYXJ0KFxuXHRcdFx0XHRhbnN3ZXJUaXRsZSxcblx0XHRcdFx0YW5zd2VyUHJlZml4LFxuXHRcdFx0XHRhbnN3ZXJWYWx1ZSxcblx0XHRcdFx0b3B0aW9ucz8uYW5zd2VySWNvbiA/PyAodGhpcy5jYXJvdXNlbC5hdXRvUmVwbHkgPyBDb2RpY29uLmNvcGlsb3RDb21wYWN0IDogQ29kaWNvbi5jb21tZW50KSxcblx0XHRcdFx0Y29sbGFwc2libGVDb250ZXh0LFxuXHRcdFx0XHRxdWVzdGlvbi5vcHRpb25zPy5sZW5ndGggPyAoKSA9PiB0aGlzLnJlbmRlckNvbnZlcnNhdGlvbk9wdGlvbnMocXVlc3Rpb24sIGFuc3dlcikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKSxcblx0XHRcdFx0dGhpcy5faG92ZXJTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdCkpO1xuXHRcdFx0YW5zd2VyUGFydC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtcXVlc3Rpb24tYW5zd2VyLWNvbGxhcHNpYmxlJyk7XG5cdFx0XHRkZWNpc2lvbi5hcHBlbmRDaGlsZChhbnN3ZXJQYXJ0LmRvbU5vZGUpO1xuXHRcdFx0c3VtbWFyeUl0ZW0uYXBwZW5kQ2hpbGQoZGVjaXNpb24pO1xuXHRcdFx0c3VtbWFyeUNvbnRhaW5lci5hcHBlbmRDaGlsZChzdW1tYXJ5SXRlbSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKHN1bW1hcnlDb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb252ZXJzYXRpb25PcHRpb25zKHF1ZXN0aW9uOiBJQ2hhdFF1ZXN0aW9uLCBhbnN3ZXI6IElDaGF0UXVlc3Rpb25BbnN3ZXJWYWx1ZSB8IHVuZGVmaW5lZCk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBzZWxlY3RlZFZhbHVlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGxldCBmcmVlZm9ybVZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHR5cGVvZiBhbnN3ZXIgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRzZWxlY3RlZFZhbHVlcy5hZGQoYW5zd2VyKTtcblx0XHR9IGVsc2UgaWYgKGFuc3dlcikge1xuXHRcdFx0aWYgKGhhc0tleShhbnN3ZXIsIHsgc2VsZWN0ZWRWYWx1ZXM6IHRydWUgfSkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZWxlY3RlZFZhbHVlIG9mIGFuc3dlci5zZWxlY3RlZFZhbHVlcykge1xuXHRcdFx0XHRcdHNlbGVjdGVkVmFsdWVzLmFkZChzZWxlY3RlZFZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmcmVlZm9ybVZhbHVlID0gYW5zd2VyLmZyZWVmb3JtVmFsdWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBzaW5nbGVBbnN3ZXIgPSBhbnN3ZXIgYXMgSUNoYXRTaW5nbGVTZWxlY3RBbnN3ZXI7XG5cdFx0XHRcdGlmIChzaW5nbGVBbnN3ZXIuc2VsZWN0ZWRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0c2VsZWN0ZWRWYWx1ZXMuYWRkKHNpbmdsZUFuc3dlci5zZWxlY3RlZFZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmcmVlZm9ybVZhbHVlID0gc2luZ2xlQW5zd2VyLmZyZWVmb3JtVmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktb3B0aW9uLWRldGFpbHMuY2hhdC11c2VkLWNvbnRleHQtbGlzdCcpO1xuXHRcdGNvbnN0IG9wdGlvbnNUaXRsZSA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LW9wdGlvbnMtdGl0bGUnKTtcblx0XHRvcHRpb25zVGl0bGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLm9wdGlvbnNUaXRsZScsIFwiT3B0aW9uc1wiKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQob3B0aW9uc1RpdGxlKTtcblxuXHRcdGNvbnN0IG9wdGlvbkxpc3QgPSBkb20uJCgndWwuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LW9wdGlvbi1saXN0Jyk7XG5cdFx0Zm9yIChjb25zdCBvcHRpb24gb2YgcXVlc3Rpb24ub3B0aW9ucyA/PyBbXSkge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWQgPSBzZWxlY3RlZFZhbHVlcy5oYXMob3B0aW9uLnZhbHVlKTtcblx0XHRcdGNvbnN0IG9wdGlvbkl0ZW0gPSBkb20uJCgnbGkuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LW9wdGlvbicpO1xuXHRcdFx0b3B0aW9uSXRlbS5jbGFzc0xpc3QudG9nZ2xlKCdzZWxlY3RlZCcsIHNlbGVjdGVkKTtcblx0XHRcdG9wdGlvbkl0ZW0uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgc2VsZWN0ZWRcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnNlbGVjdGVkT3B0aW9uQXJpYUxhYmVsJywgXCJ7MH0sIHNlbGVjdGVkXCIsIG9wdGlvbi5sYWJlbClcblx0XHRcdFx0OiBvcHRpb24ubGFiZWwpO1xuXHRcdFx0Y29uc3Qgb3B0aW9uTGFiZWwgPSBkb20uJCgnc3Bhbi5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktb3B0aW9uLWxhYmVsJyk7XG5cdFx0XHRvcHRpb25MYWJlbC50ZXh0Q29udGVudCA9IG9wdGlvbi5sYWJlbDtcblx0XHRcdG9wdGlvbkl0ZW0uYXBwZW5kQ2hpbGQob3B0aW9uTGFiZWwpO1xuXHRcdFx0aWYgKHNlbGVjdGVkKSB7XG5cdFx0XHRcdG9wdGlvbkl0ZW0uYXBwZW5kQ2hpbGQodGhpcy5yZW5kZXJTZWxlY3RlZE9wdGlvblN0YXRlKCkpO1xuXHRcdFx0fVxuXHRcdFx0b3B0aW9uTGlzdC5hcHBlbmRDaGlsZChvcHRpb25JdGVtKTtcblx0XHR9XG5cdFx0aWYgKGZyZWVmb3JtVmFsdWUpIHtcblx0XHRcdGNvbnN0IGN1c3RvbUl0ZW0gPSBkb20uJCgnbGkuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LW9wdGlvbi5zZWxlY3RlZCcpO1xuXHRcdFx0Y3VzdG9tSXRlbS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnNlbGVjdGVkQ3VzdG9tQW5zd2VyQXJpYUxhYmVsJywgXCJDdXN0b20gYW5zd2VyOiB7MH0sIHNlbGVjdGVkXCIsIGZyZWVmb3JtVmFsdWUpKTtcblx0XHRcdGNvbnN0IGN1c3RvbUxhYmVsID0gZG9tLiQoJ3NwYW4uY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LW9wdGlvbi1sYWJlbCcpO1xuXHRcdFx0Y3VzdG9tTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLmN1c3RvbUFuc3dlcicsIFwiQ3VzdG9tIGFuc3dlcjogezB9XCIsIGZyZWVmb3JtVmFsdWUpO1xuXHRcdFx0Y3VzdG9tSXRlbS5hcHBlbmQoY3VzdG9tTGFiZWwsIHRoaXMucmVuZGVyU2VsZWN0ZWRPcHRpb25TdGF0ZSgpKTtcblx0XHRcdG9wdGlvbkxpc3QuYXBwZW5kQ2hpbGQoY3VzdG9tSXRlbSk7XG5cdFx0fVxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChvcHRpb25MaXN0KTtcblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTZWxlY3RlZE9wdGlvblN0YXRlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBzZWxlY3RlZFN0YXRlID0gZG9tLiQoJ3NwYW4uY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LW9wdGlvbi1zZWxlY3RlZCcpO1xuXHRcdGNvbnN0IHNlbGVjdGVkSWNvbiA9IGRvbS4kKCdzcGFuJyk7XG5cdFx0c2VsZWN0ZWRJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5jaGVja0NvbXBhY3QpKTtcblx0XHRzZWxlY3RlZEljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0c2VsZWN0ZWRTdGF0ZS5hcHBlbmRDaGlsZChzZWxlY3RlZEljb24pO1xuXHRcdHJldHVybiBzZWxlY3RlZFN0YXRlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvcm1hdHMgYW4gYW5zd2VyIGZvciBkaXNwbGF5IGluIHRoZSBzdW1tYXJ5LlxuXHQgKi9cblx0cHJpdmF0ZSBmb3JtYXRBbnN3ZXJGb3JTdW1tYXJ5KHF1ZXN0aW9uOiBJQ2hhdFF1ZXN0aW9uLCBhbnN3ZXI6IElDaGF0UXVlc3Rpb25BbnN3ZXJWYWx1ZSk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuY2Fyb3VzZWwuYXV0b1JlcGx5ICYmIGFuc3dlciA9PT0gQWdlbnRIb3N0QXV0b1JlcGx5QW5zd2VyKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5hdXRvUmVwbHlBbnN3ZXInLCBcIlRoZSB1c2VyIGlzIG5vdCBhdmFpbGFibGUgdG8gYW5zd2VyIHlvdXIgcXVlc3Rpb24uIENob29zZSBhIHByYWdtYXRpYyBvcHRpb24gYmVzdCBhbGlnbmVkIHdpdGggdGhlIGNvbnRleHQgb2YgdGhlIHJlcXVlc3QuXCIpO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAocXVlc3Rpb24udHlwZSkge1xuXHRcdFx0Y2FzZSAndGV4dCc6XG5cdFx0XHRcdHJldHVybiBTdHJpbmcoYW5zd2VyKTtcblxuXHRcdFx0Y2FzZSAnc2luZ2xlU2VsZWN0Jzoge1xuXHRcdFx0XHRpZiAodHlwZW9mIGFuc3dlciA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRjb25zdCB7IHNlbGVjdGVkVmFsdWUsIGZyZWVmb3JtVmFsdWUgfSA9IGFuc3dlciBhcyBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlcjtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3RlZExhYmVsID0gc2VsZWN0ZWRWYWx1ZSAhPT0gdW5kZWZpbmVkID8gcXVlc3Rpb24ub3B0aW9ucz8uZmluZChvcHQgPT4gb3B0LnZhbHVlID09PSBzZWxlY3RlZFZhbHVlKT8ubGFiZWwgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Ly8gRm9yIHNpbmdsZVNlbGVjdCwgZnJlZWZvcm0gdGFrZXMgcHJpb3JpdHkgb3ZlciBzZWxlY3Rpb25cblx0XHRcdFx0XHRpZiAoZnJlZWZvcm1WYWx1ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZyZWVmb3JtVmFsdWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBzZWxlY3RlZExhYmVsID8/IFN0cmluZyhzZWxlY3RlZFZhbHVlID8/ICcnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBsYWJlbCA9IHF1ZXN0aW9uLm9wdGlvbnM/LmZpbmQob3B0ID0+IG9wdC52YWx1ZSA9PT0gYW5zd2VyKT8ubGFiZWw7XG5cdFx0XHRcdHJldHVybiBsYWJlbCA/PyBTdHJpbmcoYW5zd2VyKTtcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSAnbXVsdGlTZWxlY3QnOiB7XG5cdFx0XHRcdGlmICh0eXBlb2YgYW5zd2VyID09PSAnb2JqZWN0JyAmJiBoYXNLZXkoYW5zd2VyLCB7IHNlbGVjdGVkVmFsdWVzOiB0cnVlIH0pKSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBzZWxlY3RlZFZhbHVlcywgZnJlZWZvcm1WYWx1ZSB9ID0gYW5zd2VyO1xuXHRcdFx0XHRcdGNvbnN0IGxhYmVscyA9IHNlbGVjdGVkVmFsdWVzXG5cdFx0XHRcdFx0XHQubWFwKHYgPT4gcXVlc3Rpb24ub3B0aW9ucz8uZmluZChvcHQgPT4gb3B0LnZhbHVlID09PSB2KT8ubGFiZWwgPz8gU3RyaW5nKHYpKTtcblx0XHRcdFx0XHQvLyBGb3IgbXVsdGlTZWxlY3QsIGNvbWJpbmUgc2VsZWN0aW9ucyBhbmQgZnJlZWZvcm0gd2l0aCBjb21tYSBzZXBhcmF0b3Jcblx0XHRcdFx0XHRpZiAoZnJlZWZvcm1WYWx1ZSkge1xuXHRcdFx0XHRcdFx0bGFiZWxzLnB1c2goZnJlZWZvcm1WYWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBsYWJlbHMuam9pbihsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLmxpc3RTZXBhcmF0b3InLCAnLCAnKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFN0cmluZyhhbnN3ZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gU3RyaW5nKGFuc3dlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRRdWVzdGlvblRleHQocXVlc3Rpb25UZXh0OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG1kID0gdHlwZW9mIHF1ZXN0aW9uVGV4dCA9PT0gJ3N0cmluZycgPyBuZXcgTWFya2Rvd25TdHJpbmcocXVlc3Rpb25UZXh0KSA6IHF1ZXN0aW9uVGV4dDtcblx0XHRyZXR1cm4gcmVuZGVyQXNQbGFpbnRleHQobWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFZhbGlkYXRlcyB0aGUgY3VycmVudCBxdWVzdGlvbidzIGFuc3dlciBhZ2FpbnN0IGl0cyB2YWxpZGF0aW9uIHJ1bGVzLlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdmFsaWQsIGZhbHNlIGlmIHZhbGlkYXRpb24gZXJyb3JzIHdlcmUgc2hvd24uXG5cdCAqL1xuXHRwcml2YXRlIHZhbGlkYXRlQ3VycmVudFF1ZXN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHF1ZXN0aW9uID0gdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnNbdGhpcy5fY3VycmVudEluZGV4XTtcblx0XHRpZiAoIXF1ZXN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBhbnN3ZXIgPSB0aGlzLl9hbnN3ZXJzLmdldChxdWVzdGlvbi5pZCk7XG5cblx0XHQvLyBDaGVjayByZXF1aXJlZFxuXHRcdGlmIChxdWVzdGlvbi5yZXF1aXJlZCAmJiAoYW5zd2VyID09PSB1bmRlZmluZWQgfHwgYW5zd2VyID09PSAnJykpIHtcblx0XHRcdHRoaXMuc2hvd1ZhbGlkYXRpb25FcnJvcihsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnJlcXVpcmVkJywgJ1RoaXMgZmllbGQgaXMgcmVxdWlyZWQnKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gVmFsaWRhdGUgdGV4dCBpbnB1dHNcblx0XHRpZiAocXVlc3Rpb24udHlwZSA9PT0gJ3RleHQnICYmIHF1ZXN0aW9uLnZhbGlkYXRpb24gJiYgdHlwZW9mIGFuc3dlciA9PT0gJ3N0cmluZycgJiYgYW5zd2VyICE9PSAnJykge1xuXHRcdFx0Y29uc3QgZXJyb3IgPSB0aGlzLmdldFZhbGlkYXRpb25FcnJvcihhbnN3ZXIsIHF1ZXN0aW9uLnZhbGlkYXRpb24pO1xuXHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuc2hvd1ZhbGlkYXRpb25FcnJvcihlcnJvcik7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmNsZWFyVmFsaWRhdGlvbkVycm9yKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogVmFsaWRhdGVzIHRoYXQgYWxsIHJlcXVpcmVkIHF1ZXN0aW9ucyBoYXZlIGJlZW4gYW5zd2VyZWQuXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiBhbGwgcmVxdWlyZWQgZmllbGRzIGFyZSBzYXRpc2ZpZWQuXG5cdCAqL1xuXHRwcml2YXRlIHZhbGlkYXRlUmVxdWlyZWRGaWVsZHMoKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmNhcm91c2VsLnF1ZXN0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcXVlc3Rpb24gPSB0aGlzLmNhcm91c2VsLnF1ZXN0aW9uc1tpXTtcblx0XHRcdGlmICghcXVlc3Rpb24ucmVxdWlyZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhbnN3ZXIgPSB0aGlzLl9hbnN3ZXJzLmdldChxdWVzdGlvbi5pZCk7XG5cdFx0XHRpZiAoYW5zd2VyID09PSB1bmRlZmluZWQgfHwgYW5zd2VyID09PSAnJykge1xuXHRcdFx0XHQvLyBOYXZpZ2F0ZSB0byB0aGUgdW5hbnN3ZXJlZCByZXF1aXJlZCBxdWVzdGlvblxuXHRcdFx0XHR0aGlzLnNhdmVDdXJyZW50QW5zd2VyKCk7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRJbmRleCA9IGk7XG5cdFx0XHRcdHRoaXMucGVyc2lzdERyYWZ0U3RhdGUoKTtcblx0XHRcdFx0dGhpcy5yZW5kZXJDdXJyZW50UXVlc3Rpb24odHJ1ZSk7XG5cdFx0XHRcdHRoaXMuc2hvd1ZhbGlkYXRpb25FcnJvcihsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnJlcXVpcmVkJywgJ1RoaXMgZmllbGQgaXMgcmVxdWlyZWQnKSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhIHZhbGlkYXRpb24gZXJyb3IgbWVzc2FnZSBmb3IgdGhlIGdpdmVuIHZhbHVlLCBvciB1bmRlZmluZWQgaWYgdmFsaWQuXG5cdCAqL1xuXHRwcml2YXRlIGdldFZhbGlkYXRpb25FcnJvcih2YWx1ZTogc3RyaW5nLCB2YWxpZGF0aW9uOiBJQ2hhdFF1ZXN0aW9uVmFsaWRhdGlvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZmFpbHVyZSA9IGZpbmRRdWVzdGlvblZhbGlkYXRpb25GYWlsdXJlKHZhbHVlLCB2YWxpZGF0aW9uKTtcblx0XHRzd2l0Y2ggKGZhaWx1cmU/LmtpbmQpIHtcblx0XHRcdGNhc2UgdW5kZWZpbmVkOlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0Y2FzZSAnbWluTGVuZ3RoJzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwudmFsaWRhdGlvbi5taW5MZW5ndGgnLCAnTWluaW11bSBsZW5ndGggaXMgezB9JywgZmFpbHVyZS5saW1pdCk7XG5cdFx0XHRjYXNlICdtYXhMZW5ndGgnOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC52YWxpZGF0aW9uLm1heExlbmd0aCcsICdNYXhpbXVtIGxlbmd0aCBpcyB7MH0nLCBmYWlsdXJlLmxpbWl0KTtcblx0XHRcdGNhc2UgJ2VtYWlsJzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwudmFsaWRhdGlvbi5lbWFpbCcsICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBlbWFpbCBhZGRyZXNzJyk7XG5cdFx0XHRjYXNlICd1cmknOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC52YWxpZGF0aW9uLnVyaScsICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBVUkknKTtcblx0XHRcdGNhc2UgJ2RhdGUnOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC52YWxpZGF0aW9uLmRhdGUnLCAnUGxlYXNlIGVudGVyIGEgdmFsaWQgZGF0ZSAoWVlZWS1NTS1ERCknKTtcblx0XHRcdGNhc2UgJ2RhdGVUaW1lJzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwudmFsaWRhdGlvbi5kYXRlVGltZScsICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBkYXRlLXRpbWUnKTtcblx0XHRcdGNhc2UgJ251bWJlcic6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnZhbGlkYXRpb24ubnVtYmVyJywgJ1BsZWFzZSBlbnRlciBhIHZhbGlkIG51bWJlcicpO1xuXHRcdFx0Y2FzZSAnaW50ZWdlcic6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnZhbGlkYXRpb24uaW50ZWdlcicsICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBpbnRlZ2VyJyk7XG5cdFx0XHRjYXNlICdtaW5pbXVtJzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwudmFsaWRhdGlvbi5taW5pbXVtJywgJ01pbmltdW0gdmFsdWUgaXMgezB9JywgZmFpbHVyZS5saW1pdCk7XG5cdFx0XHRjYXNlICdtYXhpbXVtJzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwudmFsaWRhdGlvbi5tYXhpbXVtJywgJ01heGltdW0gdmFsdWUgaXMgezB9JywgZmFpbHVyZS5saW1pdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG93VmFsaWRhdGlvbkVycm9yKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2N1cnJlbnRWYWxpZGF0aW9uRXJyb3IgPSBtZXNzYWdlO1xuXHRcdGlmICh0aGlzLl92YWxpZGF0aW9uTWVzc2FnZUVsZW1lbnQpIHtcblx0XHRcdHRoaXMuX3ZhbGlkYXRpb25NZXNzYWdlRWxlbWVudC50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG5cdFx0XHR0aGlzLl92YWxpZGF0aW9uTWVzc2FnZUVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xlYXJWYWxpZGF0aW9uRXJyb3IoKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudFZhbGlkYXRpb25FcnJvciA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5fdmFsaWRhdGlvbk1lc3NhZ2VFbGVtZW50KSB7XG5cdFx0XHR0aGlzLl92YWxpZGF0aW9uTWVzc2FnZUVsZW1lbnQudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdHRoaXMuX3ZhbGlkYXRpb25NZXNzYWdlRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblx0fVxuXG5cdGhhc1NhbWVDb250ZW50KG90aGVyOiBJQ2hhdFJlbmRlcmVyQ29udGVudCwgX2ZvbGxvd2luZ0NvbnRlbnQ6IElDaGF0UmVuZGVyZXJDb250ZW50W10sIGVsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdC8vIGRvZXMgbm90IGhhdmUgc2FtZSBjb250ZW50IHdoZW4gaXQgaXMgbm90IHNraXBwZWQgYW5kIGlzIGFjdGl2ZSBhbmQgd2Ugc3RvcCB0aGUgcmVzcG9uc2Vcblx0XHRpZiAoIXRoaXMuX2lzU2tpcHBlZCAmJiAhdGhpcy5jYXJvdXNlbC5pc1VzZWQgJiYgaXNSZXNwb25zZVZNKGVsZW1lbnQpICYmIGVsZW1lbnQuaXNDb21wbGV0ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gb3RoZXIua2luZCA9PT0gJ3F1ZXN0aW9uQ2Fyb3VzZWwnICYmIG90aGVyID09PSB0aGlzLmNhcm91c2VsO1xuXHR9XG5cblx0YWRkRGlzcG9zYWJsZShkaXNwb3NhYmxlOiB7IGRpc3Bvc2UoKTogdm9pZCB9KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNTa2lwcGVkICYmICF0aGlzLmNhcm91c2VsLmlzVXNlZCkge1xuXHRcdFx0dGhpcy5zYXZlQ3VycmVudEFuc3dlcigpO1xuXHRcdH1cblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxlQUFzQjtBQUMvQixTQUEwQixnQkFBZ0Isd0JBQXdCO0FBQ2xFLFNBQVMsZUFBZTtBQUN4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
