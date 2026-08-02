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
import { StandardKeyboardEvent } from "../../../../../../base/browser/keyboardEvent.js";
import { Button, ButtonWithDropdown } from "../../../../../../base/browser/ui/button/button.js";
import { DomScrollableElement } from "../../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Action } from "../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { ScrollbarVisibility } from "../../../../../../base/common/scrollable.js";
import Severity from "../../../../../../base/common/severity.js";
import { basename, isEqual } from "../../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { localize } from "../../../../../../nls.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IMarkdownRendererService } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { defaultButtonStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { IAgentEditorCommentsBridge } from "../../../../../services/agentEditorComments/common/agentEditorComments.js";
import { ITextFileService } from "../../../../../services/textfile/common/textfiles.js";
import { IPlanReviewFeedbackService } from "../../planReviewFeedback/planReviewFeedbackService.js";
import { ChatPlanReviewData } from "../../../common/model/chatProgressTypes/chatPlanReviewData.js";
import { isResponseVM } from "../../../common/model/chatViewModel.js";
import "./media/chatPlanReview.css";
const MARKDOWN_EDITOR_ID = "vscode.markdown.editor";
let ChatPlanReviewPart = class extends Disposable {
  constructor(review, context, _options, _markdownRendererService, _contextMenuService, _dialogService, _editorService, _hoverService, _planReviewFeedbackService, _agentEditorCommentsBridge, _textFileService) {
    super();
    this.review = review;
    this._options = _options;
    this._markdownRendererService = _markdownRendererService;
    this._contextMenuService = _contextMenuService;
    this._dialogService = _dialogService;
    this._editorService = _editorService;
    this._hoverService = _hoverService;
    this._planReviewFeedbackService = _planReviewFeedbackService;
    this._agentEditorCommentsBridge = _agentEditorCommentsBridge;
    this._textFileService = _textFileService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._buttonStore = this._register(new DisposableStore());
    this._renderedSubmitInlineCount = -1;
    this._messageContentDisposables = this._register(new MutableDisposable());
    this._isCollapsed = false;
    this._isSubmitted = false;
    this._isSubmitting = false;
    this._isFeedbackMode = false;
    this._planReviewRegistration = this._register(new MutableDisposable());
    this._commentRowDisposables = this._register(new DisposableStore());
    this._selectedAction = review.actions.find((a) => a.default) ?? review.actions[0];
    if (review instanceof ChatPlanReviewData && typeof review.draftCollapsed === "boolean") {
      this._isCollapsed = review.draftCollapsed;
    }
    const isResponseComplete = isResponseVM(context.element) && context.element.isComplete;
    this._isSubmitted = !!review.isUsed || isResponseComplete;
    if (review instanceof ChatPlanReviewData) {
      this._register(review.onDidDismiss(() => {
        if (this.updatePlanContentFromModel()) {
          this.renderMarkdown();
        }
        this._isSubmitted = true;
        void this.markUsed();
      }));
    }
    if (review.planUri && review.canProvideFeedback && !this._isSubmitted) {
      const planUri = URI.revive(review.planUri);
      const planUriString = planUri.toString();
      const registrationStore = new DisposableStore();
      registrationStore.add(this._planReviewFeedbackService.registerPlanReview(planUri, {
        sessionResource: context.element.sessionResource,
        actions: review.actions,
        hasOverallFeedback: () => !!this._feedbackTextarea?.value.trim(),
        submitFeedback: () => this.submitFeedback(),
        submitAction: (action) => this.submitApproval(action),
        reject: () => this.submitRejection()
      }));
      registrationStore.add(this._planReviewFeedbackService.onDidChangeFeedback((uri) => {
        if (uri.toString() === planUriString) {
          this.onInlineFeedbackChanged();
        }
      }));
      registrationStore.add(this._agentEditorCommentsBridge.onDidChangeComments(() => this.onInlineFeedbackChanged()));
      this._planReviewRegistration.value = registrationStore;
    }
    const elements = dom.h(".chat-confirmation-widget-container.chat-plan-review-container@container", [
      dom.h(".chat-confirmation-widget2.chat-plan-review@root", [
        dom.h(".chat-confirmation-widget-title.chat-plan-review-title@title", [
          dom.h(".chat-plan-review-title-label@titleLabel"),
          dom.h(".chat-plan-review-inline-actions@inlineActions"),
          dom.h(".chat-plan-review-title-actions@titleActions")
        ]),
        dom.h(".chat-confirmation-widget-message.chat-plan-review-body@message"),
        dom.h(".chat-plan-review-feedback@feedback"),
        dom.h(".chat-confirmation-widget-buttons.chat-plan-review-footer", [
          dom.h(".chat-buttons@footerButtons")
        ])
      ])
    ]);
    this.domNode = elements.container;
    this.domNode.id = generateUuid();
    this.domNode.setAttribute("role", "region");
    this.domNode.setAttribute("aria-label", localize("chat.planReview.ariaLabel", "Plan review: {0}", review.title));
    this._titleActionsEl = elements.titleActions;
    this._inlineActionsEl = elements.inlineActions;
    this._footerButtonsEl = elements.footerButtons;
    this._messageEl = elements.message;
    elements.titleLabel.textContent = review.title;
    this._register(this._hoverService.setupDelayedHover(elements.titleLabel, { content: review.title }));
    if (review.planUri) {
      const fileName = basename(URI.revive(review.planUri));
      const reviewButtonTooltip = review.canProvideFeedback ? localize("chat.planReview.reviewTooltip", "Review {0}", fileName) : localize("chat.planReview.openTooltip", "Open {0}", fileName);
      const reviewButton = this._register(new Button(this._titleActionsEl, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: reviewButtonTooltip, ariaLabel: reviewButtonTooltip }));
      reviewButton.element.classList.add("chat-plan-review-title-button", "chat-plan-review-review-button");
      this._reviewButton = reviewButton;
      this._register(reviewButton.onDidClick(() => void this.enterReviewMode()));
    }
    this._collapseButton = this._register(new Button(this._titleActionsEl, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
    this._collapseButton.element.classList.add("chat-plan-review-title-button", "chat-plan-review-title-icon-button");
    this._register(this._collapseButton.onDidClick(() => this.toggleCollapsed()));
    const messageParent = this._messageEl.parentElement;
    const messageNextSibling = this._messageEl.nextSibling;
    this._messageScrollable = this._register(new DomScrollableElement(this._messageEl, {
      vertical: ScrollbarVisibility.Auto,
      horizontal: ScrollbarVisibility.Hidden,
      consumeMouseWheelIfScrollbarIsNeeded: true
    }));
    this._messageScrollable.getDomNode().classList.add("chat-confirmation-widget-message-scrollable", "chat-plan-review-body-scrollable");
    messageParent.insertBefore(this._messageScrollable.getDomNode(), messageNextSibling);
    const resizeObserver = this._register(new dom.DisposableResizeObserver("ChatPlanReviewPart.messageScrollable", () => this._messageScrollable.scanDomNode()));
    this._register(resizeObserver.observe(this._messageScrollable.getDomNode()));
    this.renderMarkdown();
    if (review.canProvideFeedback) {
      this.renderFeedback(elements.feedback);
      this._feedbackSection = elements.feedback;
      if (review.planUri) {
        dom.hide(elements.feedback);
      } else {
        this.domNode.classList.add("chat-plan-review-textarea-mode");
      }
    } else {
      dom.hide(elements.feedback);
    }
    this.renderActionButtons(
      this._isCollapsed ? this._inlineActionsEl : this._footerButtonsEl,
      { includeReject: !this._isCollapsed }
    );
    this.updateCollapsedPresentation();
    if (this._isSubmitted) {
      this.domNode.classList.add("chat-plan-review-used");
    }
    if (this._feedbackTextarea && review instanceof ChatPlanReviewData && review.draftFeedback) {
      this._feedbackTextarea.value = review.draftFeedback;
      this._feedbackTextarea.style.height = "auto";
      this._feedbackTextarea.style.height = `${this._feedbackTextarea.scrollHeight}px`;
    }
    if (!this._isSubmitted && this.getInlineFeedbackItems().length > 0) {
      void this.enterFeedbackMode({ focus: false });
    }
  }
  hasSameContent(other, _followingContent, _element) {
    if (other.kind !== "planReview") {
      return false;
    }
    if (!!other.isUsed !== !!this.review.isUsed) {
      return false;
    }
    if (this.review.resolveId && other.resolveId) {
      return this.review.resolveId === other.resolveId;
    }
    return other === this.review;
  }
  renderMarkdown() {
    dom.clearNode(this._messageEl);
    const store = new DisposableStore();
    this._messageContentDisposables.value = store;
    const rendered = store.add(this._markdownRendererService.render(
      new MarkdownString(this.review.content, { supportThemeIcons: true, isTrusted: false }),
      { asyncRenderCallback: () => this._messageScrollable.scanDomNode() }
    ));
    this._messageEl.append(rendered.element);
    this._messageScrollable.scanDomNode();
  }
  renderFeedback(section) {
    dom.clearNode(section);
    const header = dom.append(section, dom.$(".chat-plan-review-feedback-header"));
    const label = dom.append(header, dom.$(".chat-plan-review-feedback-label"));
    label.textContent = localize("chat.planReview.feedbackLabel", "Feedback");
    const headerActions = dom.append(header, dom.$(".chat-plan-review-feedback-header-actions"));
    if (this.review.planUri) {
      const clearAllLabel = localize("chat.planReview.clearAll", "Clear All");
      const clearAllButton = this._register(new Button(headerActions, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: clearAllLabel, ariaLabel: clearAllLabel }));
      clearAllButton.element.classList.add("chat-plan-review-title-button", "chat-plan-review-feedback-clear-all");
      clearAllButton.label = clearAllLabel;
      this._register(clearAllButton.onDidClick(() => this.clearAllInlineFeedback()));
      this._clearAllButtonEl = clearAllButton.element;
    }
    if (this.review.planUri) {
      const closeButtonLabel = localize("chat.planReview.close", "Close");
      const closeButton = this._register(new Button(headerActions, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: closeButtonLabel, ariaLabel: closeButtonLabel }));
      closeButton.element.classList.add("chat-plan-review-title-button", "chat-plan-review-title-icon-button", "chat-plan-review-feedback-close");
      closeButton.label = `$(${Codicon.close.id})`;
      this._register(closeButton.onDidClick(() => this.exitFeedbackMode()));
    }
    this._commentsListEl = dom.$(".chat-plan-review-comments-list");
    this._commentsListScrollable = this._register(new DomScrollableElement(this._commentsListEl, {
      vertical: ScrollbarVisibility.Auto,
      horizontal: ScrollbarVisibility.Hidden,
      consumeMouseWheelIfScrollbarIsNeeded: true
    }));
    this._commentsListScrollable.getDomNode().classList.add("chat-plan-review-comments-list-scrollable");
    dom.append(section, this._commentsListScrollable.getDomNode());
    dom.hide(this._commentsListScrollable.getDomNode());
    this.renderCommentsList();
    const textarea = dom.append(section, dom.$("textarea.chat-plan-review-feedback-textarea"));
    textarea.rows = 1;
    textarea.placeholder = localize("chat.planReview.feedbackPlaceholder", "Add an overall comment for the agent...");
    this._feedbackTextarea = textarea;
    const autoResize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      this._onDidChangeHeight.fire();
    };
    this._register(dom.addDisposableListener(textarea, dom.EventType.INPUT, () => {
      autoResize();
      this._messageScrollable.scanDomNode();
      if (this.review instanceof ChatPlanReviewData) {
        this.review.draftFeedback = textarea.value;
      }
      if (this.review.planUri) {
        this._planReviewFeedbackService.notifyFeedbackChanged(URI.revive(this.review.planUri));
      }
      this.updateSubmitButtonState();
    }));
    if (this.review.planUri) {
      this._register(dom.addDisposableListener(textarea, dom.EventType.KEY_DOWN, (e) => {
        const ev = new StandardKeyboardEvent(e);
        if (ev.keyCode === KeyCode.Enter && !ev.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          void this.submitFeedback();
        }
      }));
    }
  }
  renderCommentsList() {
    if (!this._commentsListEl) {
      return;
    }
    this._commentRowDisposables.clear();
    dom.clearNode(this._commentsListEl);
    const items = this.getInlineFeedbackItems();
    if (this._clearAllButtonEl) {
      if (items.length > 0) {
        dom.show(this._clearAllButtonEl);
      } else {
        dom.hide(this._clearAllButtonEl);
      }
    }
    const scrollableNode = this._commentsListScrollable?.getDomNode();
    if (items.length === 0) {
      if (scrollableNode) {
        dom.hide(scrollableNode);
      }
      this._commentsListScrollable?.scanDomNode();
      return;
    }
    if (scrollableNode) {
      dom.show(scrollableNode);
    }
    for (const item of items) {
      const row = dom.append(this._commentsListEl, dom.$(".chat-plan-review-comment-row"));
      const rowLabel = localize("chat.planReview.commentRowAriaLabel", "Line {0}: {1}", item.line, item.text);
      const revealButton = dom.append(row, dom.$("button.chat-plan-review-comment-reveal"));
      revealButton.type = "button";
      revealButton.setAttribute("aria-label", rowLabel);
      const lineEl = dom.append(revealButton, dom.$("span.chat-plan-review-comment-line"));
      lineEl.textContent = localize("chat.planReview.commentRowLine", "Line {0}", item.line);
      const textEl = dom.append(revealButton, dom.$("span.chat-plan-review-comment-text"));
      textEl.textContent = item.text;
      this._commentRowDisposables.add(dom.addDisposableListener(revealButton, dom.EventType.CLICK, () => {
        this.revealInlineComment(item);
      }));
      const removeLabel = localize("chat.planReview.removeComment", "Remove comment on line {0}", item.line);
      const removeButton = dom.append(row, dom.$("button.chat-plan-review-comment-remove"));
      removeButton.type = "button";
      removeButton.setAttribute("aria-label", removeLabel);
      removeButton.title = removeLabel;
      removeButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
      this._commentRowDisposables.add(dom.addDisposableListener(removeButton, dom.EventType.CLICK, (e) => {
        e.stopPropagation();
        this.removeInlineComment(item.id);
      }));
    }
    this._commentsListScrollable?.scanDomNode();
  }
  getInlineFeedbackItems() {
    return this.review.planUri ? this._planReviewFeedbackService.getFeedback(URI.revive(this.review.planUri)) : [];
  }
  async revealInlineComment(item) {
    const planUri = this.review.planUri ? URI.revive(this.review.planUri) : void 0;
    if (!planUri) {
      return;
    }
    this._planReviewFeedbackService.setNavigationAnchor(planUri, item.id);
    await this._editorService.openEditor({
      resource: item.resource,
      options: {
        pinned: true,
        ...isEqual(item.resource, planUri) ? { override: MARKDOWN_EDITOR_ID } : {},
        selection: { startLineNumber: item.line, startColumn: item.column }
      }
    });
  }
  removeInlineComment(itemId) {
    if (this._isSubmitted) {
      return;
    }
    if (this.review.planUri) {
      this._planReviewFeedbackService.removeFeedback(URI.revive(this.review.planUri), itemId);
    }
  }
  async clearAllInlineFeedback() {
    if (this._isSubmitted) {
      return;
    }
    const items = this.getInlineFeedbackItems();
    if (items.length === 0) {
      return;
    }
    const result = await this._dialogService.confirm({
      type: Severity.Warning,
      message: localize("chat.planReview.clearAllConfirm", "Clear {0} inline comment(s)?", items.length),
      detail: localize("chat.planReview.clearAllDetail", "These comments will be removed from the plan file and not sent to the agent."),
      primaryButton: localize("chat.planReview.clearAllConfirmPrimary", "Clear All")
    });
    if (!result.confirmed) {
      return;
    }
    if (this.review.planUri) {
      this._planReviewFeedbackService.clearFeedback(URI.revive(this.review.planUri));
    }
  }
  onInlineFeedbackChanged() {
    if (this._isSubmitted) {
      return;
    }
    const items = this.getInlineFeedbackItems();
    if (items.length > 0 && !this._isFeedbackMode) {
      void this.enterFeedbackMode({ focus: false });
      return;
    }
    this.renderCommentsList();
    if (this._isFeedbackMode) {
      this.updateSubmitButtonState();
    }
    this._messageScrollable.scanDomNode();
    this._onDidChangeHeight.fire();
  }
  /**
   * Render the action buttons into the active container (footer when
   * expanded, inline title slot when collapsed). Clears the inactive slot
   * so the same buttons can never appear in two places at once.
   */
  renderCurrentActionButtons() {
    if (this._isSubmitted) {
      return;
    }
    const target = this._isCollapsed ? this._inlineActionsEl : this._footerButtonsEl;
    const other = this._isCollapsed ? this._footerButtonsEl : this._inlineActionsEl;
    dom.clearNode(other);
    this.renderActionButtons(target, { includeReject: !this._isCollapsed });
  }
  renderActionButtons(container, options) {
    const includeReject = options?.includeReject ?? true;
    this._buttonStore.clear();
    this._submitButton = void 0;
    this._renderedSubmitInlineCount = -1;
    dom.clearNode(container);
    if (this._isFeedbackMode) {
      const inlineCount = this.getInlineFeedbackItems().length;
      const submitButton = new Button(container, { ...defaultButtonStyles, supportIcons: true });
      submitButton.label = this.computeSubmitLabel(inlineCount);
      submitButton.enabled = this.canSubmitFeedback();
      this._submitButton = submitButton;
      this._renderedSubmitInlineCount = inlineCount;
      this._buttonStore.add(submitButton);
      this._buttonStore.add(submitButton.onDidClick(() => void this.submitFeedback()));
      if (includeReject) {
        const rejectButton = new Button(container, { ...defaultButtonStyles, secondary: true });
        rejectButton.label = localize("chat.planReview.reject", "Reject");
        this._buttonStore.add(rejectButton);
        this._buttonStore.add(rejectButton.onDidClick(() => this.submitRejection()));
      }
      return;
    }
    const primary = this._selectedAction;
    const moreActions = this.review.actions.filter((a) => a !== primary);
    let approveButton;
    if (moreActions.length > 0) {
      approveButton = new ButtonWithDropdown(container, {
        ...defaultButtonStyles,
        supportIcons: true,
        contextMenuProvider: this._contextMenuService,
        addPrimaryActionToDropdown: false,
        actions: moreActions.map((action) => {
          const button = new Action(
            action.label,
            action.label,
            void 0,
            true,
            () => {
              this.submitApproval(action);
              return Promise.resolve();
            }
          );
          button.tooltip = action.description || "";
          return this._buttonStore.add(button);
        })
      });
    } else {
      approveButton = new Button(container, { ...defaultButtonStyles, supportIcons: true });
    }
    this._buttonStore.add(approveButton);
    approveButton.label = primary.label;
    if (primary.description) {
      approveButton.element.title = primary.description;
    }
    this._buttonStore.add(approveButton.onDidClick(() => this.submitApproval(primary)));
    if (includeReject) {
      const rejectButton = new Button(container, { ...defaultButtonStyles, secondary: true });
      rejectButton.label = localize("chat.planReview.reject", "Reject");
      this._buttonStore.add(rejectButton);
      this._buttonStore.add(rejectButton.onDidClick(() => this.submitRejection()));
    }
  }
  canSubmitFeedback() {
    const textareaText = this._feedbackTextarea?.value.trim() ?? "";
    if (textareaText) {
      return true;
    }
    return this.getInlineFeedbackItems().length > 0;
  }
  computeSubmitLabel(inlineCount) {
    return inlineCount > 0 ? localize("chat.planReview.submitFeedbackWithCount", "Submit Feedback ({0})", inlineCount) : localize("chat.planReview.submitFeedback", "Submit Feedback");
  }
  /**
   * Update the cached Submit button's enabled state and label without
   * destroying the button row. Cheap enough to run on every keystroke.
   */
  updateSubmitButtonState() {
    if (!this._submitButton || !this._isFeedbackMode) {
      return;
    }
    this._submitButton.enabled = this.canSubmitFeedback();
    const inlineCount = this.getInlineFeedbackItems().length;
    if (inlineCount !== this._renderedSubmitInlineCount) {
      this._submitButton.label = this.computeSubmitLabel(inlineCount);
      this._renderedSubmitInlineCount = inlineCount;
    }
  }
  toggleCollapsed() {
    this._isCollapsed = !this._isCollapsed;
    if (this.review instanceof ChatPlanReviewData) {
      this.review.draftCollapsed = this._isCollapsed;
    }
    this.updateCollapsedPresentation();
    this._onDidChangeHeight.fire();
  }
  updateCollapsedPresentation() {
    this.domNode.classList.toggle("chat-plan-review-collapsed", this._isCollapsed);
    this._collapseButton.label = this._isCollapsed ? `$(${Codicon.chevronUp.id})` : `$(${Codicon.chevronDown.id})`;
    const collapseTooltip = this._isCollapsed ? localize("chat.planReview.expand", "Expand") : localize("chat.planReview.collapse", "Collapse");
    this._collapseButton.element.setAttribute("aria-label", collapseTooltip);
    this._collapseButton.element.setAttribute("aria-expanded", String(!this._isCollapsed));
    this._collapseButton.setTitle(collapseTooltip);
    if (this._reviewButton) {
      const isIconOnly = this._isCollapsed;
      this._reviewButton.element.classList.toggle("chat-plan-review-title-icon-button", isIconOnly);
      let label;
      let tooltip;
      if (isIconOnly) {
        label = `$(${Codicon.edit.id})`;
        const fileName = this.review.planUri ? basename(URI.revive(this.review.planUri)) : "";
        tooltip = this.review.canProvideFeedback ? localize("chat.planReview.reviewTooltip", "Review {0}", fileName) : localize("chat.planReview.openTooltip", "Open {0}", fileName);
      } else {
        const fileName = this.review.planUri ? basename(URI.revive(this.review.planUri)) : "";
        if (this.review.canProvideFeedback) {
          label = localize("chat.planReview.reviewButtonLabel", "Open Full Plan");
          tooltip = localize("chat.planReview.reviewTooltip", "Review {0}", fileName);
        } else {
          label = localize("chat.planReview.openButtonLabel", "Open Plan");
          tooltip = localize("chat.planReview.openTooltip", "Open {0}", fileName);
        }
      }
      this._reviewButton.label = label;
      this._reviewButton.element.setAttribute("aria-label", tooltip);
      this._reviewButton.setTitle(tooltip);
    }
    this.renderCurrentActionButtons();
  }
  async enterReviewMode() {
    if (!this.review.canProvideFeedback || this._isSubmitted) {
      if (this.review.planUri) {
        await this._editorService.openEditor({
          resource: URI.revive(this.review.planUri),
          options: { pinned: true, override: MARKDOWN_EDITOR_ID }
        });
      }
      return;
    }
    if (this._isCollapsed) {
      this._isCollapsed = false;
      if (this.review instanceof ChatPlanReviewData) {
        this.review.draftCollapsed = false;
      }
      this.updateCollapsedPresentation();
    }
    await this.enterFeedbackMode({ focus: true });
  }
  async submitApproval(action) {
    if (this._isSubmitted || this._isSubmitting) {
      return;
    }
    this._isSubmitting = true;
    try {
      if (action.permissionLevel === "autopilot") {
        const confirmed = await this.confirmAutopilot();
        if (!confirmed) {
          return;
        }
      }
      if (this.review.planUri && !await this.savePlanFile()) {
        return;
      }
      this._isSubmitted = true;
      const ridesAlong = !this.review.planUri;
      const textareaFeedback = ridesAlong ? this._feedbackTextarea?.value.trim() : void 0;
      this._options.onSubmit({
        action: action.label,
        ...action.id ? { actionId: action.id } : {},
        rejected: false,
        ...textareaFeedback ? { feedback: textareaFeedback, feedbackOverall: textareaFeedback } : {}
      });
      void this.markUsed();
    } finally {
      if (!this._isSubmitted) {
        this._isSubmitting = false;
      }
    }
  }
  async submitRejection() {
    if (this._isSubmitted || this._isSubmitting) {
      return;
    }
    this._isSubmitting = true;
    try {
      if (this.review.planUri && !await this.savePlanFile()) {
        return;
      }
      this._isSubmitted = true;
      const ridesAlong = !this.review.planUri;
      const textareaFeedback = ridesAlong ? this._feedbackTextarea?.value.trim() : void 0;
      this._options.onSubmit({
        rejected: true,
        ...textareaFeedback ? { feedback: textareaFeedback, feedbackOverall: textareaFeedback } : {}
      });
      void this.markUsed();
    } finally {
      if (!this._isSubmitted) {
        this._isSubmitting = false;
      }
    }
  }
  async savePlanFile() {
    if (!this.review.planUri) {
      return true;
    }
    const planUri = URI.revive(this.review.planUri);
    if (this._textFileService.isDirty(planUri) && !await this._textFileService.save(planUri)) {
      return false;
    }
    if (this.review instanceof ChatPlanReviewData) {
      if (!this.updatePlanContentFromModel()) {
        this.review.content = (await this._textFileService.read(planUri)).value;
      }
      this.renderMarkdown();
    }
    return true;
  }
  updatePlanContentFromModel() {
    if (!(this.review instanceof ChatPlanReviewData) || !this.review.planUri) {
      return false;
    }
    const model = this._textFileService.files.get(URI.revive(this.review.planUri));
    if (!model?.isResolved()) {
      return false;
    }
    this.review.content = model.textEditorModel.getValue();
    return true;
  }
  async enterFeedbackMode(options) {
    if (this._isFeedbackMode) {
      if (this.review.planUri) {
        await this._editorService.openEditor({
          resource: URI.revive(this.review.planUri),
          options: { pinned: true, override: MARKDOWN_EDITOR_ID }
        });
      } else if (options?.focus) {
        this.focusFeedbackInput();
      }
      return;
    }
    this._isFeedbackMode = true;
    if (this._feedbackSection) {
      dom.show(this._feedbackSection);
    }
    this.domNode.classList.add("chat-plan-review-feedback-mode");
    this.renderCommentsList();
    this.updateCollapsedPresentation();
    if (this.review.planUri) {
      await this._editorService.openEditor({
        resource: URI.revive(this.review.planUri),
        options: { pinned: true, override: MARKDOWN_EDITOR_ID }
      });
    }
    if (!this.review.planUri && options?.focus !== false) {
      this.focusFeedbackInput();
    }
    this._messageScrollable.scanDomNode();
    this._onDidChangeHeight.fire();
  }
  async exitFeedbackMode() {
    if (!this._isFeedbackMode) {
      return;
    }
    this._isFeedbackMode = false;
    if (this._feedbackSection) {
      dom.hide(this._feedbackSection);
    }
    this.domNode.classList.remove("chat-plan-review-feedback-mode");
    this.updateCollapsedPresentation();
    this._messageScrollable.scanDomNode();
    this._onDidChangeHeight.fire();
  }
  focusFeedbackInput() {
    this._feedbackTextarea?.focus();
  }
  async submitFeedback() {
    if (this._isSubmitted || this._isSubmitting) {
      return false;
    }
    const textareaFeedback = this._feedbackTextarea?.value.trim();
    const editorFeedbackItems = [...this.getInlineFeedbackItems()];
    if (!textareaFeedback && editorFeedbackItems.length === 0) {
      return false;
    }
    this._isSubmitting = true;
    try {
      if (!await this.savePlanFile()) {
        return false;
      }
      let feedbackInlineMarkdown;
      if (editorFeedbackItems.length > 0) {
        const itemsByResource = /* @__PURE__ */ new Map();
        for (const item of editorFeedbackItems) {
          const key = item.resource.toString();
          const items = itemsByResource.get(key) ?? [];
          items.push(item);
          itemsByResource.set(key, items);
        }
        const sections2 = [...itemsByResource.values()].flatMap((items) => [
          localize("chat.planReview.inlineCommentsHeading", "Inline comments on `{0}`:", basename(items[0].resource)),
          ...items.map((item) => {
            const location = item.column > 1 ? localize("chat.planReview.inlineCommentLocation", "Line {0}, Column {1}", item.line, item.column) : localize("chat.planReview.inlineCommentLocationLine", "Line {0}", item.line);
            return `- **${location}:** ${item.text}`;
          })
        ]);
        feedbackInlineMarkdown = sections2.join("\n");
      }
      const sections = [];
      if (textareaFeedback) {
        sections.push(textareaFeedback);
      }
      if (feedbackInlineMarkdown) {
        sections.push(feedbackInlineMarkdown);
      }
      const feedback = sections.join("\n\n");
      this._isSubmitted = true;
      const planUri = this.review.planUri ? URI.revive(this.review.planUri) : void 0;
      if (planUri) {
        for (const item of editorFeedbackItems) {
          this._planReviewFeedbackService.removeFeedback(planUri, item.id);
        }
      }
      this._options.onSubmit({
        rejected: false,
        feedback,
        feedbackOverall: textareaFeedback || void 0,
        feedbackInlineMarkdown
      });
      await this.markUsed();
      return true;
    } finally {
      if (!this._isSubmitted) {
        this._isSubmitting = false;
      }
    }
  }
  async confirmAutopilot() {
    const result = await this._dialogService.prompt({
      type: Severity.Warning,
      message: localize("chat.planReview.autopilot.title", "Enable Autopilot?"),
      buttons: [
        {
          label: localize("chat.planReview.autopilot.confirm", "Enable"),
          run: () => true
        },
        {
          label: localize("chat.planReview.autopilot.cancel", "Cancel"),
          run: () => false
        }
      ],
      custom: {
        icon: Codicon.rocket,
        markdownDetails: [{
          markdown: new MarkdownString(localize("chat.planReview.autopilot.detail", "Autopilot will auto-approve all tool calls and continue working autonomously until the task is complete. This includes terminal commands, file edits, and external tool calls. The agent will make decisions on your behalf without asking for confirmation.\n\nYou can stop the agent at any time by clicking the stop button. This applies to the current session only."))
        }]
      }
    });
    return result.result === true;
  }
  async markUsed() {
    this.domNode.classList.add("chat-plan-review-used");
    this._buttonStore.clear();
    this._submitButton = void 0;
    this._renderedSubmitInlineCount = -1;
    this._planReviewRegistration.clear();
    if (this._feedbackTextarea) {
      this._feedbackTextarea.disabled = true;
    }
  }
};
ChatPlanReviewPart = __decorateClass([
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IHoverService),
  __decorateParam(8, IPlanReviewFeedbackService),
  __decorateParam(9, IAgentEditorCommentsBridge),
  __decorateParam(10, ITextFileService)
], ChatPlanReviewPart);
export {
  ChatPlanReviewPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0UGxhblJldmlld1BhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBCdXR0b24sIEJ1dHRvbldpdGhEcm9wZG93biwgSUJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRFZGl0b3JDb21tZW50c0JyaWRnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2FnZW50RWRpdG9yQ29tbWVudHMvY29tbW9uL2FnZW50RWRpdG9yQ29tbWVudHMuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRQbGFuQXBwcm92YWxBY3Rpb24sIElDaGF0UGxhblJldmlldywgSUNoYXRQbGFuUmV2aWV3UmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQbGFuUmV2aWV3RmVlZGJhY2tJdGVtLCBJUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYW5SZXZpZXdGZWVkYmFjay9wbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRQbGFuUmV2aWV3RGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0UGxhblJldmlld0RhdGEuanMnO1xuaW1wb3J0IHsgSUNoYXRSZW5kZXJlckNvbnRlbnQsIGlzUmVzcG9uc2VWTSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydCwgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0ICcuL21lZGlhL2NoYXRQbGFuUmV2aWV3LmNzcyc7XG5cbmNvbnN0IE1BUktET1dOX0VESVRPUl9JRCA9ICd2c2NvZGUubWFya2Rvd24uZWRpdG9yJztcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFBsYW5SZXZpZXdQYXJ0T3B0aW9ucyB7XG5cdG9uU3VibWl0OiAocmVzdWx0OiBJQ2hhdFBsYW5SZXZpZXdSZXN1bHQpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UGxhblJldmlld1BhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRDb250ZW50UGFydCB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYnV0dG9uU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9zdWJtaXRCdXR0b246IEJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVuZGVyZWRTdWJtaXRJbmxpbmVDb3VudCA9IC0xO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlQ29udGVudERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVBY3Rpb25zRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVBY3Rpb25zRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mb290ZXJCdXR0b25zRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlU2Nyb2xsYWJsZTogRG9tU2Nyb2xsYWJsZUVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbGxhcHNlQnV0dG9uOiBCdXR0b247XG5cdHByaXZhdGUgX3Jldmlld0J1dHRvbjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2lzQ29sbGFwc2VkID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzU3VibWl0dGVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzU3VibWl0dGluZyA9IGZhbHNlO1xuXHRwcml2YXRlIF9zZWxlY3RlZEFjdGlvbjogSUNoYXRQbGFuQXBwcm92YWxBY3Rpb247XG5cdHByaXZhdGUgX2ZlZWRiYWNrVGV4dGFyZWE6IEhUTUxUZXh0QXJlYUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ZlZWRiYWNrU2VjdGlvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbW1lbnRzTGlzdEVsOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29tbWVudHNMaXN0U2Nyb2xsYWJsZTogRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NsZWFyQWxsQnV0dG9uRWw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc0ZlZWRiYWNrTW9kZSA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wbGFuUmV2aWV3UmVnaXN0cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50Um93RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByZXZpZXc6IElDaGF0UGxhblJldmlldyxcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJQ2hhdFBsYW5SZXZpZXdQYXJ0T3B0aW9ucyxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlOiBJUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSxcblx0XHRASUFnZW50RWRpdG9yQ29tbWVudHNCcmlkZ2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRFZGl0b3JDb21tZW50c0JyaWRnZTogSUFnZW50RWRpdG9yQ29tbWVudHNCcmlkZ2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fc2VsZWN0ZWRBY3Rpb24gPSByZXZpZXcuYWN0aW9ucy5maW5kKGEgPT4gYS5kZWZhdWx0KSA/PyByZXZpZXcuYWN0aW9uc1swXTtcblxuXHRcdGlmIChyZXZpZXcgaW5zdGFuY2VvZiBDaGF0UGxhblJldmlld0RhdGEgJiYgdHlwZW9mIHJldmlldy5kcmFmdENvbGxhcHNlZCA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR0aGlzLl9pc0NvbGxhcHNlZCA9IHJldmlldy5kcmFmdENvbGxhcHNlZDtcblx0XHR9XG5cblx0XHRjb25zdCBpc1Jlc3BvbnNlQ29tcGxldGUgPSBpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSAmJiBjb250ZXh0LmVsZW1lbnQuaXNDb21wbGV0ZTtcblx0XHR0aGlzLl9pc1N1Ym1pdHRlZCA9ICEhcmV2aWV3LmlzVXNlZCB8fCBpc1Jlc3BvbnNlQ29tcGxldGU7XG5cdFx0aWYgKHJldmlldyBpbnN0YW5jZW9mIENoYXRQbGFuUmV2aWV3RGF0YSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmV2aWV3Lm9uRGlkRGlzbWlzcygoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLnVwZGF0ZVBsYW5Db250ZW50RnJvbU1vZGVsKCkpIHtcblx0XHRcdFx0XHR0aGlzLnJlbmRlck1hcmtkb3duKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5faXNTdWJtaXR0ZWQgPSB0cnVlO1xuXHRcdFx0XHR2b2lkIHRoaXMubWFya1VzZWQoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBSZWdpc3RlciB3aXRoIHRoZSBwbGFuIHJldmlldyBmZWVkYmFjayBzZXJ2aWNlIHNvIHRoZSBlZGl0b3Jcblx0XHQvLyBjb250cmlidXRpb24gY2FuIHNob3cgaW5saW5lIGZlZWRiYWNrIGlucHV0IGZvciB0aGlzIHBsYW4gZmlsZS5cblx0XHQvLyBTdWJzY3JpYmUgdG8gZmVlZGJhY2sgY2hhbmdlcyBzbyB0aGUgY29tbWVudHMgbGlzdCBhbmQgU3VibWl0XG5cdFx0Ly8gYnV0dG9uIGxhYmVsIHN0YXkgaW4gc3luYy5cblx0XHRpZiAocmV2aWV3LnBsYW5VcmkgJiYgcmV2aWV3LmNhblByb3ZpZGVGZWVkYmFjayAmJiAhdGhpcy5faXNTdWJtaXR0ZWQpIHtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpKTtcblx0XHRcdGNvbnN0IHBsYW5VcmlTdHJpbmcgPSBwbGFuVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCByZWdpc3RyYXRpb25TdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHJlZ2lzdHJhdGlvblN0b3JlLmFkZCh0aGlzLl9wbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlLnJlZ2lzdGVyUGxhblJldmlldyhwbGFuVXJpLCB7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0YWN0aW9uczogcmV2aWV3LmFjdGlvbnMsXG5cdFx0XHRcdGhhc092ZXJhbGxGZWVkYmFjazogKCkgPT4gISF0aGlzLl9mZWVkYmFja1RleHRhcmVhPy52YWx1ZS50cmltKCksXG5cdFx0XHRcdHN1Ym1pdEZlZWRiYWNrOiAoKSA9PiB0aGlzLnN1Ym1pdEZlZWRiYWNrKCksXG5cdFx0XHRcdHN1Ym1pdEFjdGlvbjogYWN0aW9uID0+IHRoaXMuc3VibWl0QXBwcm92YWwoYWN0aW9uKSxcblx0XHRcdFx0cmVqZWN0OiAoKSA9PiB0aGlzLnN1Ym1pdFJlamVjdGlvbigpLFxuXHRcdFx0fSkpO1xuXHRcdFx0cmVnaXN0cmF0aW9uU3RvcmUuYWRkKHRoaXMuX3BsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2Uub25EaWRDaGFuZ2VGZWVkYmFjayh1cmkgPT4ge1xuXHRcdFx0XHRpZiAodXJpLnRvU3RyaW5nKCkgPT09IHBsYW5VcmlTdHJpbmcpIHtcblx0XHRcdFx0XHR0aGlzLm9uSW5saW5lRmVlZGJhY2tDaGFuZ2VkKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHJlZ2lzdHJhdGlvblN0b3JlLmFkZCh0aGlzLl9hZ2VudEVkaXRvckNvbW1lbnRzQnJpZGdlLm9uRGlkQ2hhbmdlQ29tbWVudHMoKCkgPT4gdGhpcy5vbklubGluZUZlZWRiYWNrQ2hhbmdlZCgpKSk7XG5cdFx0XHR0aGlzLl9wbGFuUmV2aWV3UmVnaXN0cmF0aW9uLnZhbHVlID0gcmVnaXN0cmF0aW9uU3RvcmU7XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbGQgRE9NIHRoYXQgbWlycm9ycyBjaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQyIHNvIHdlIGluaGVyaXQgaXRzXG5cdFx0Ly8gc3R5bGluZyAodGl0bGUgYmFyLCBzY3JvbGxhYmxlIG1lc3NhZ2UsIGJsdWUvZ3JleSBidXR0b24gcm93KS5cblx0XHRjb25zdCBlbGVtZW50cyA9IGRvbS5oKCcuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LWNvbnRhaW5lci5jaGF0LXBsYW4tcmV2aWV3LWNvbnRhaW5lckBjb250YWluZXInLCBbXG5cdFx0XHRkb20uaCgnLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldDIuY2hhdC1wbGFuLXJldmlld0Byb290JywgW1xuXHRcdFx0XHRkb20uaCgnLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldC10aXRsZS5jaGF0LXBsYW4tcmV2aWV3LXRpdGxlQHRpdGxlJywgW1xuXHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1wbGFuLXJldmlldy10aXRsZS1sYWJlbEB0aXRsZUxhYmVsJyksXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LXBsYW4tcmV2aWV3LWlubGluZS1hY3Rpb25zQGlubGluZUFjdGlvbnMnKSxcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtcGxhbi1yZXZpZXctdGl0bGUtYWN0aW9uc0B0aXRsZUFjdGlvbnMnKSxcblx0XHRcdFx0XSksXG5cdFx0XHRcdGRvbS5oKCcuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LW1lc3NhZ2UuY2hhdC1wbGFuLXJldmlldy1ib2R5QG1lc3NhZ2UnKSxcblx0XHRcdFx0ZG9tLmgoJy5jaGF0LXBsYW4tcmV2aWV3LWZlZWRiYWNrQGZlZWRiYWNrJyksXG5cdFx0XHRcdGRvbS5oKCcuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LWJ1dHRvbnMuY2hhdC1wbGFuLXJldmlldy1mb290ZXInLCBbXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWJ1dHRvbnNAZm9vdGVyQnV0dG9ucycpLFxuXHRcdFx0XHRdKSxcblx0XHRcdF0pLFxuXHRcdF0pO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gZWxlbWVudHMuY29udGFpbmVyO1xuXHRcdHRoaXMuZG9tTm9kZS5pZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAncmVnaW9uJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcuYXJpYUxhYmVsJywgJ1BsYW4gcmV2aWV3OiB7MH0nLCByZXZpZXcudGl0bGUpKTtcblxuXHRcdHRoaXMuX3RpdGxlQWN0aW9uc0VsID0gZWxlbWVudHMudGl0bGVBY3Rpb25zO1xuXHRcdHRoaXMuX2lubGluZUFjdGlvbnNFbCA9IGVsZW1lbnRzLmlubGluZUFjdGlvbnM7XG5cdFx0dGhpcy5fZm9vdGVyQnV0dG9uc0VsID0gZWxlbWVudHMuZm9vdGVyQnV0dG9ucztcblx0XHR0aGlzLl9tZXNzYWdlRWwgPSBlbGVtZW50cy5tZXNzYWdlO1xuXG5cdFx0Ly8gVGl0bGUgbGFiZWwgKyBob3ZlciBmb3IgdHJ1bmNhdGVkIHRpdGxlcy5cblx0XHRlbGVtZW50cy50aXRsZUxhYmVsLnRleHRDb250ZW50ID0gcmV2aWV3LnRpdGxlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihlbGVtZW50cy50aXRsZUxhYmVsLCB7IGNvbnRlbnQ6IHJldmlldy50aXRsZSB9KSk7XG5cblx0XHQvLyBSZXZpZXcgYnV0dG9uIFx1MjAxNCBvcGVucyB0aGUgcGxhbiBmaWxlIGFuZCBlbnRlcnMgZmVlZGJhY2sgbW9kZS5cblx0XHRpZiAocmV2aWV3LnBsYW5VcmkpIHtcblx0XHRcdGNvbnN0IGZpbGVOYW1lID0gYmFzZW5hbWUoVVJJLnJldml2ZShyZXZpZXcucGxhblVyaSkpO1xuXHRcdFx0Y29uc3QgcmV2aWV3QnV0dG9uVG9vbHRpcCA9IHJldmlldy5jYW5Qcm92aWRlRmVlZGJhY2tcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LnJldmlld1Rvb2x0aXAnLCAnUmV2aWV3IHswfScsIGZpbGVOYW1lKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcub3BlblRvb2x0aXAnLCAnT3BlbiB7MH0nLCBmaWxlTmFtZSk7XG5cdFx0XHRjb25zdCByZXZpZXdCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHRoaXMuX3RpdGxlQWN0aW9uc0VsLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlLCB0aXRsZTogcmV2aWV3QnV0dG9uVG9vbHRpcCwgYXJpYUxhYmVsOiByZXZpZXdCdXR0b25Ub29sdGlwIH0pKTtcblx0XHRcdHJldmlld0J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtcGxhbi1yZXZpZXctdGl0bGUtYnV0dG9uJywgJ2NoYXQtcGxhbi1yZXZpZXctcmV2aWV3LWJ1dHRvbicpO1xuXHRcdFx0dGhpcy5fcmV2aWV3QnV0dG9uID0gcmV2aWV3QnV0dG9uO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmV2aWV3QnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdm9pZCB0aGlzLmVudGVyUmV2aWV3TW9kZSgpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hldnJvbiBjb2xsYXBzZSB0b2dnbGUuXG5cdFx0dGhpcy5fY29sbGFwc2VCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHRoaXMuX3RpdGxlQWN0aW9uc0VsLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtcGxhbi1yZXZpZXctdGl0bGUtYnV0dG9uJywgJ2NoYXQtcGxhbi1yZXZpZXctdGl0bGUtaWNvbi1idXR0b24nKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb2xsYXBzZUJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMudG9nZ2xlQ29sbGFwc2VkKCkpKTtcblxuXHRcdC8vIFNjcm9sbGFibGUgbWVzc2FnZSBhcmVhIChtYXJrZG93bikuXG5cdFx0Y29uc3QgbWVzc2FnZVBhcmVudCA9IHRoaXMuX21lc3NhZ2VFbC5wYXJlbnRFbGVtZW50ITtcblx0XHRjb25zdCBtZXNzYWdlTmV4dFNpYmxpbmcgPSB0aGlzLl9tZXNzYWdlRWwubmV4dFNpYmxpbmc7XG5cdFx0dGhpcy5fbWVzc2FnZVNjcm9sbGFibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5fbWVzc2FnZUVsLCB7XG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHRjb25zdW1lTW91c2VXaGVlbElmU2Nyb2xsYmFySXNOZWVkZWQ6IHRydWUsXG5cdFx0fSkpO1xuXHRcdHRoaXMuX21lc3NhZ2VTY3JvbGxhYmxlLmdldERvbU5vZGUoKS5jbGFzc0xpc3QuYWRkKCdjaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtbWVzc2FnZS1zY3JvbGxhYmxlJywgJ2NoYXQtcGxhbi1yZXZpZXctYm9keS1zY3JvbGxhYmxlJyk7XG5cdFx0bWVzc2FnZVBhcmVudC5pbnNlcnRCZWZvcmUodGhpcy5fbWVzc2FnZVNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpLCBtZXNzYWdlTmV4dFNpYmxpbmcpO1xuXHRcdGNvbnN0IHJlc2l6ZU9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IGRvbS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0NoYXRQbGFuUmV2aWV3UGFydC5tZXNzYWdlU2Nyb2xsYWJsZScsICgpID0+IHRoaXMuX21lc3NhZ2VTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCkpKTtcblx0XHQvLyBUaGUgaW5uZXIgYF9tZXNzYWdlRWxgIGlzIGBoZWlnaHQ6IDEwMCVgLCBzbyBvYnNlcnZpbmcgb25seSB0aGVcblx0XHQvLyB3cmFwcGVyIGlzIGVub3VnaDsgbWFya2Rvd24gY29udGVudCByZWZsb3cgaXMgaGFuZGxlZCBieSB0aGVcblx0XHQvLyByZW5kZXJlcidzIGBhc3luY1JlbmRlckNhbGxiYWNrYC5cblx0XHR0aGlzLl9yZWdpc3RlcihyZXNpemVPYnNlcnZlci5vYnNlcnZlKHRoaXMuX21lc3NhZ2VTY3JvbGxhYmxlLmdldERvbU5vZGUoKSkpO1xuXG5cdFx0dGhpcy5yZW5kZXJNYXJrZG93bigpO1xuXG5cdFx0aWYgKHJldmlldy5jYW5Qcm92aWRlRmVlZGJhY2spIHtcblx0XHRcdHRoaXMucmVuZGVyRmVlZGJhY2soZWxlbWVudHMuZmVlZGJhY2spO1xuXHRcdFx0dGhpcy5fZmVlZGJhY2tTZWN0aW9uID0gZWxlbWVudHMuZmVlZGJhY2s7XG5cdFx0XHRpZiAocmV2aWV3LnBsYW5VcmkpIHtcblx0XHRcdFx0ZG9tLmhpZGUoZWxlbWVudHMuZmVlZGJhY2spOyAvLyBIaWRkZW4gdW50aWwgdGhlIHVzZXIgZW50ZXJzIHJldmlldyBtb2RlIG9yIGlubGluZSBmZWVkYmFjayBleGlzdHMuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBObyBwbGFuIGZpbGU6IHRoZXJlJ3Mgbm8gaW5saW5lIGVkaXRvciBzdXJmYWNlIHRvIGNvb3JkaW5hdGVcblx0XHRcdFx0Ly8gd2l0aCwgc28gd2UgZG9uJ3QgdG9nZ2xlIGludG8gXCJmZWVkYmFjayBtb2RlXCIuIEluc3RlYWQgbGVhdmVcblx0XHRcdFx0Ly8gdGhlIHRleHRhcmVhIHZpc2libGUgYWxvbmdzaWRlIHRoZSByZWd1bGFyIEFwcHJvdmUvUmVqZWN0XG5cdFx0XHRcdC8vIGJ1dHRvbnMgYW5kIGxldCB0aGUgdXNlciBvcHRpb25hbGx5IHR5cGUgYSBjb21tZW50IHRoYXRcblx0XHRcdFx0Ly8gcmlkZXMgYWxvbmcgd2l0aCB3aGljaGV2ZXIgYWN0aW9uIHRoZXkgcGljay5cblx0XHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtcGxhbi1yZXZpZXctdGV4dGFyZWEtbW9kZScpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRkb20uaGlkZShlbGVtZW50cy5mZWVkYmFjayk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJBY3Rpb25CdXR0b25zKFxuXHRcdFx0dGhpcy5faXNDb2xsYXBzZWQgPyB0aGlzLl9pbmxpbmVBY3Rpb25zRWwgOiB0aGlzLl9mb290ZXJCdXR0b25zRWwsXG5cdFx0XHR7IGluY2x1ZGVSZWplY3Q6ICF0aGlzLl9pc0NvbGxhcHNlZCB9LFxuXHRcdCk7XG5cblx0XHR0aGlzLnVwZGF0ZUNvbGxhcHNlZFByZXNlbnRhdGlvbigpO1xuXG5cdFx0aWYgKHRoaXMuX2lzU3VibWl0dGVkKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC1wbGFuLXJldmlldy11c2VkJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2ZlZWRiYWNrVGV4dGFyZWEgJiYgcmV2aWV3IGluc3RhbmNlb2YgQ2hhdFBsYW5SZXZpZXdEYXRhICYmIHJldmlldy5kcmFmdEZlZWRiYWNrKSB7XG5cdFx0XHR0aGlzLl9mZWVkYmFja1RleHRhcmVhLnZhbHVlID0gcmV2aWV3LmRyYWZ0RmVlZGJhY2s7XG5cdFx0XHQvLyBNYXRjaCB0aGUgYXV0by1yZXNpemUgd2lyZWQgdXAgb24gYGlucHV0YCBzbyBhIG11bHRpLWxpbmVcblx0XHRcdC8vIHJlc3RvcmVkIGRyYWZ0IHJlbmRlcnMgd2l0aCB0aGUgcmlnaHQgaGVpZ2h0LlxuXHRcdFx0dGhpcy5fZmVlZGJhY2tUZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSAnYXV0byc7XG5cdFx0XHR0aGlzLl9mZWVkYmFja1RleHRhcmVhLnN0eWxlLmhlaWdodCA9IGAke3RoaXMuX2ZlZWRiYWNrVGV4dGFyZWEuc2Nyb2xsSGVpZ2h0fXB4YDtcblx0XHR9XG5cblx0XHQvLyBQcm9tb3RlIGludG8gcmV2aWV3IG1vZGUgaWYgaW5saW5lIGZlZWRiYWNrIGlzIGFscmVhZHkgcHJlc2VudFxuXHRcdC8vIChlLmcuIHJlc3RvcmVkIGZyb20gYSBwcmlvciBzZXNzaW9uKS5cblx0XHRpZiAoIXRoaXMuX2lzU3VibWl0dGVkICYmIHRoaXMuZ2V0SW5saW5lRmVlZGJhY2tJdGVtcygpLmxlbmd0aCA+IDApIHtcblx0XHRcdHZvaWQgdGhpcy5lbnRlckZlZWRiYWNrTW9kZSh7IGZvY3VzOiBmYWxzZSB9KTtcblx0XHR9XG5cdH1cblxuXHRoYXNTYW1lQ29udGVudChvdGhlcjogSUNoYXRSZW5kZXJlckNvbnRlbnQsIF9mb2xsb3dpbmdDb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdLCBfZWxlbWVudDogQ2hhdFRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyLmtpbmQgIT09ICdwbGFuUmV2aWV3Jykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoISFvdGhlci5pc1VzZWQgIT09ICEhdGhpcy5yZXZpZXcuaXNVc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnJldmlldy5yZXNvbHZlSWQgJiYgb3RoZXIucmVzb2x2ZUlkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXZpZXcucmVzb2x2ZUlkID09PSBvdGhlci5yZXNvbHZlSWQ7XG5cdFx0fVxuXHRcdHJldHVybiBvdGhlciA9PT0gdGhpcy5yZXZpZXc7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1hcmtkb3duKCk6IHZvaWQge1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fbWVzc2FnZUVsKTtcblx0XHQvLyBQYXJlbnQgdGhlIHN0b3JlIGJlZm9yZSBwb3B1bGF0aW5nIHNvIHRoZSBsZWFrIHRyYWNrZXIgZG9lc24ndCBmbGFnIGl0LlxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX21lc3NhZ2VDb250ZW50RGlzcG9zYWJsZXMudmFsdWUgPSBzdG9yZTtcblx0XHRjb25zdCByZW5kZXJlZCA9IHN0b3JlLmFkZCh0aGlzLl9tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoXG5cdFx0XHRuZXcgTWFya2Rvd25TdHJpbmcodGhpcy5yZXZpZXcuY29udGVudCwgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSwgaXNUcnVzdGVkOiBmYWxzZSB9KSxcblx0XHRcdHsgYXN5bmNSZW5kZXJDYWxsYmFjazogKCkgPT4gdGhpcy5fbWVzc2FnZVNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKSB9XG5cdFx0KSk7XG5cdFx0dGhpcy5fbWVzc2FnZUVsLmFwcGVuZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHR0aGlzLl9tZXNzYWdlU2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJGZWVkYmFjayhzZWN0aW9uOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGRvbS5jbGVhck5vZGUoc2VjdGlvbik7XG5cdFx0Y29uc3QgaGVhZGVyID0gZG9tLmFwcGVuZChzZWN0aW9uLCBkb20uJCgnLmNoYXQtcGxhbi1yZXZpZXctZmVlZGJhY2staGVhZGVyJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChoZWFkZXIsIGRvbS4kKCcuY2hhdC1wbGFuLXJldmlldy1mZWVkYmFjay1sYWJlbCcpKTtcblx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcuZmVlZGJhY2tMYWJlbCcsICdGZWVkYmFjaycpO1xuXG5cdFx0Y29uc3QgaGVhZGVyQWN0aW9ucyA9IGRvbS5hcHBlbmQoaGVhZGVyLCBkb20uJCgnLmNoYXQtcGxhbi1yZXZpZXctZmVlZGJhY2staGVhZGVyLWFjdGlvbnMnKSk7XG5cblx0XHQvLyBDbGVhciBBbGwgXHUyMDE0IHZpc2liaWxpdHkgaXMgdG9nZ2xlZCB3aXRoIHRoZSBjb21tZW50cyBsaXN0LlxuXHRcdGlmICh0aGlzLnJldmlldy5wbGFuVXJpKSB7XG5cdFx0XHRjb25zdCBjbGVhckFsbExhYmVsID0gbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5jbGVhckFsbCcsIFwiQ2xlYXIgQWxsXCIpO1xuXHRcdFx0Y29uc3QgY2xlYXJBbGxCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGhlYWRlckFjdGlvbnMsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUsIHRpdGxlOiBjbGVhckFsbExhYmVsLCBhcmlhTGFiZWw6IGNsZWFyQWxsTGFiZWwgfSkpO1xuXHRcdFx0Y2xlYXJBbGxCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXBsYW4tcmV2aWV3LXRpdGxlLWJ1dHRvbicsICdjaGF0LXBsYW4tcmV2aWV3LWZlZWRiYWNrLWNsZWFyLWFsbCcpO1xuXHRcdFx0Y2xlYXJBbGxCdXR0b24ubGFiZWwgPSBjbGVhckFsbExhYmVsO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoY2xlYXJBbGxCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLmNsZWFyQWxsSW5saW5lRmVlZGJhY2soKSkpO1xuXHRcdFx0dGhpcy5fY2xlYXJBbGxCdXR0b25FbCA9IGNsZWFyQWxsQnV0dG9uLmVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xvc2UgXHUyMDE0IG5vbi1kZXN0cnVjdGl2ZSBleGl0IGZyb20gZmVlZGJhY2sgbW9kZS4gUGVyLXJvdyBcdTAwRDcgYnV0dG9uc1xuXHRcdC8vIGFuZCBDbGVhciBBbGwgaGFuZGxlIGRlbGV0aW9uIGV4cGxpY2l0bHkuXG5cdFx0aWYgKHRoaXMucmV2aWV3LnBsYW5VcmkpIHtcblx0XHRcdGNvbnN0IGNsb3NlQnV0dG9uTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LmNsb3NlJywgXCJDbG9zZVwiKTtcblx0XHRcdGNvbnN0IGNsb3NlQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihoZWFkZXJBY3Rpb25zLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlLCB0aXRsZTogY2xvc2VCdXR0b25MYWJlbCwgYXJpYUxhYmVsOiBjbG9zZUJ1dHRvbkxhYmVsIH0pKTtcblx0XHRcdGNsb3NlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1wbGFuLXJldmlldy10aXRsZS1idXR0b24nLCAnY2hhdC1wbGFuLXJldmlldy10aXRsZS1pY29uLWJ1dHRvbicsICdjaGF0LXBsYW4tcmV2aWV3LWZlZWRiYWNrLWNsb3NlJyk7XG5cdFx0XHRjbG9zZUJ1dHRvbi5sYWJlbCA9IGAkKCR7Q29kaWNvbi5jbG9zZS5pZH0pYDtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGNsb3NlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5leGl0RmVlZGJhY2tNb2RlKCkpKTtcblx0XHR9XG5cblx0XHQvLyBJbmxpbmUgY29tbWVudHMgbGlzdCBcdTIwMTQgd3JhcHBlZCBpbiBhIE1vbmFjbyBzY3JvbGxhYmxlIGZvciBhIHN0eWxlZFxuXHRcdC8vIHNjcm9sbGJhciBjb25zaXN0ZW50IHdpdGggdGhlIHJlc3Qgb2YgdGhlIHdvcmtiZW5jaC5cblx0XHR0aGlzLl9jb21tZW50c0xpc3RFbCA9IGRvbS4kKCcuY2hhdC1wbGFuLXJldmlldy1jb21tZW50cy1saXN0Jyk7XG5cdFx0dGhpcy5fY29tbWVudHNMaXN0U2Nyb2xsYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0aGlzLl9jb21tZW50c0xpc3RFbCwge1xuXHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0byxcblx0XHRcdGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0Y29uc3VtZU1vdXNlV2hlZWxJZlNjcm9sbGJhcklzTmVlZGVkOiB0cnVlLFxuXHRcdH0pKTtcblx0XHR0aGlzLl9jb21tZW50c0xpc3RTY3JvbGxhYmxlLmdldERvbU5vZGUoKS5jbGFzc0xpc3QuYWRkKCdjaGF0LXBsYW4tcmV2aWV3LWNvbW1lbnRzLWxpc3Qtc2Nyb2xsYWJsZScpO1xuXHRcdGRvbS5hcHBlbmQoc2VjdGlvbiwgdGhpcy5fY29tbWVudHNMaXN0U2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkpO1xuXHRcdGRvbS5oaWRlKHRoaXMuX2NvbW1lbnRzTGlzdFNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpKTtcblx0XHR0aGlzLnJlbmRlckNvbW1lbnRzTGlzdCgpO1xuXG5cdFx0Y29uc3QgdGV4dGFyZWEgPSBkb20uYXBwZW5kKHNlY3Rpb24sIGRvbS4kPEhUTUxUZXh0QXJlYUVsZW1lbnQ+KCd0ZXh0YXJlYS5jaGF0LXBsYW4tcmV2aWV3LWZlZWRiYWNrLXRleHRhcmVhJykpO1xuXHRcdHRleHRhcmVhLnJvd3MgPSAxO1xuXHRcdHRleHRhcmVhLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5mZWVkYmFja1BsYWNlaG9sZGVyJywgJ0FkZCBhbiBvdmVyYWxsIGNvbW1lbnQgZm9yIHRoZSBhZ2VudC4uLicpO1xuXHRcdHRoaXMuX2ZlZWRiYWNrVGV4dGFyZWEgPSB0ZXh0YXJlYTtcblxuXHRcdC8vIE1hdGNoZXMgdGhlIGJlaGF2aW91ciBvZiB0aGUgcXVlc3Rpb24gY2Fyb3VzZWwgZnJlZWZvcm0gdGV4dGFyZWE6XG5cdFx0Ly8gZ3JvdyB0byBmaXQgY29udGVudCwgY2FwcGVkIHZpYSBDU1MgYG1heC1oZWlnaHRgLlxuXHRcdGNvbnN0IGF1dG9SZXNpemUgPSAoKSA9PiB7XG5cdFx0XHR0ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSAnYXV0byc7XG5cdFx0XHR0ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSBgJHt0ZXh0YXJlYS5zY3JvbGxIZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRleHRhcmVhLCBkb20uRXZlbnRUeXBlLklOUFVULCAoKSA9PiB7XG5cdFx0XHRhdXRvUmVzaXplKCk7XG5cdFx0XHQvLyBBdXRvLXJlc2l6ZSBmaXJlcyBfb25EaWRDaGFuZ2VIZWlnaHQgd2hpY2ggY2FuIHNoaWZ0IHNpYmxpbmdcblx0XHRcdC8vIGxheW91dDsgcmVzY2FuIHNvIHRoZSBib2R5J3Mgc2Nyb2xsYmFyIGdlb21ldHJ5IHN0YXlzIGFjY3VyYXRlLlxuXHRcdFx0dGhpcy5fbWVzc2FnZVNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0XHRcdGlmICh0aGlzLnJldmlldyBpbnN0YW5jZW9mIENoYXRQbGFuUmV2aWV3RGF0YSkge1xuXHRcdFx0XHR0aGlzLnJldmlldy5kcmFmdEZlZWRiYWNrID0gdGV4dGFyZWEudmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5yZXZpZXcucGxhblVyaSkge1xuXHRcdFx0XHR0aGlzLl9wbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlLm5vdGlmeUZlZWRiYWNrQ2hhbmdlZChVUkkucmV2aXZlKHRoaXMucmV2aWV3LnBsYW5VcmkpKTtcblx0XHRcdH1cblx0XHRcdC8vIFVwZGF0ZSB0aGUgY2FjaGVkIFN1Ym1pdCBidXR0b24gcmF0aGVyIHRoYW4gcmUtcmVuZGVyaW5nIHRoZVxuXHRcdFx0Ly8gd2hvbGUgYnV0dG9uIHJvdyBvbiBldmVyeSBrZXlzdHJva2UuXG5cdFx0XHR0aGlzLnVwZGF0ZVN1Ym1pdEJ1dHRvblN0YXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRW50ZXIgc3VibWl0cyBmZWVkYmFjazsgU2hpZnQrRW50ZXIgaW5zZXJ0cyBhIG5ld2xpbmUuIE9ubHkgd2lyZWRcblx0XHQvLyB1cCBpbiBwbGFuLW1vZGUgKHdoZXJlIFN1Ym1pdCBGZWVkYmFjayBpcyB0aGUgcHJpbWFyeSBhY3Rpb24pLlxuXHRcdC8vIEluIHRoZSBuby1wbGFuVXJpIHRleHRhcmVhLW9ubHkgZmxvdyB0aGUgdXNlciBtdXN0IGV4cGxpY2l0bHkgcGlja1xuXHRcdC8vIEFwcHJvdmUgb3IgUmVqZWN0LCBzbyBFbnRlciBmYWxscyB0aHJvdWdoIHRvIHRoZSBkZWZhdWx0IG5ld2xpbmVcblx0XHQvLyBiZWhhdmlvdXIgdG8gYXZvaWQgYW4gYWNjaWRlbnRhbCBmZWVkYmFjay1vbmx5IHN1Ym1pdC5cblx0XHRpZiAodGhpcy5yZXZpZXcucGxhblVyaSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0ZXh0YXJlYSwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0Y29uc3QgZXYgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRpZiAoZXYua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciAmJiAhZXYuc2hpZnRLZXkpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHR2b2lkIHRoaXMuc3VibWl0RmVlZGJhY2soKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ29tbWVudHNMaXN0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29tbWVudHNMaXN0RWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY29tbWVudFJvd0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLl9jb21tZW50c0xpc3RFbCk7XG5cblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuZ2V0SW5saW5lRmVlZGJhY2tJdGVtcygpO1xuXHRcdGlmICh0aGlzLl9jbGVhckFsbEJ1dHRvbkVsKSB7XG5cdFx0XHRpZiAoaXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRkb20uc2hvdyh0aGlzLl9jbGVhckFsbEJ1dHRvbkVsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRvbS5oaWRlKHRoaXMuX2NsZWFyQWxsQnV0dG9uRWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzY3JvbGxhYmxlTm9kZSA9IHRoaXMuX2NvbW1lbnRzTGlzdFNjcm9sbGFibGU/LmdldERvbU5vZGUoKTtcblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRpZiAoc2Nyb2xsYWJsZU5vZGUpIHtcblx0XHRcdFx0ZG9tLmhpZGUoc2Nyb2xsYWJsZU5vZGUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29tbWVudHNMaXN0U2Nyb2xsYWJsZT8uc2NhbkRvbU5vZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHNjcm9sbGFibGVOb2RlKSB7XG5cdFx0XHRkb20uc2hvdyhzY3JvbGxhYmxlTm9kZSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRjb25zdCByb3cgPSBkb20uYXBwZW5kKHRoaXMuX2NvbW1lbnRzTGlzdEVsLCBkb20uJCgnLmNoYXQtcGxhbi1yZXZpZXctY29tbWVudC1yb3cnKSk7XG5cdFx0XHRjb25zdCByb3dMYWJlbCA9IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcuY29tbWVudFJvd0FyaWFMYWJlbCcsICdMaW5lIHswfTogezF9JywgaXRlbS5saW5lLCBpdGVtLnRleHQpO1xuXG5cdFx0XHRjb25zdCByZXZlYWxCdXR0b24gPSBkb20uYXBwZW5kKHJvdywgZG9tLiQ8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b24uY2hhdC1wbGFuLXJldmlldy1jb21tZW50LXJldmVhbCcpKTtcblx0XHRcdHJldmVhbEJ1dHRvbi50eXBlID0gJ2J1dHRvbic7XG5cdFx0XHRyZXZlYWxCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgcm93TGFiZWwpO1xuXG5cdFx0XHRjb25zdCBsaW5lRWwgPSBkb20uYXBwZW5kKHJldmVhbEJ1dHRvbiwgZG9tLiQoJ3NwYW4uY2hhdC1wbGFuLXJldmlldy1jb21tZW50LWxpbmUnKSk7XG5cdFx0XHRsaW5lRWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LmNvbW1lbnRSb3dMaW5lJywgJ0xpbmUgezB9JywgaXRlbS5saW5lKTtcblxuXHRcdFx0Y29uc3QgdGV4dEVsID0gZG9tLmFwcGVuZChyZXZlYWxCdXR0b24sIGRvbS4kKCdzcGFuLmNoYXQtcGxhbi1yZXZpZXctY29tbWVudC10ZXh0JykpO1xuXHRcdFx0dGV4dEVsLnRleHRDb250ZW50ID0gaXRlbS50ZXh0O1xuXG5cdFx0XHR0aGlzLl9jb21tZW50Um93RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIocmV2ZWFsQnV0dG9uLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMucmV2ZWFsSW5saW5lQ29tbWVudChpdGVtKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgcmVtb3ZlTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LnJlbW92ZUNvbW1lbnQnLCBcIlJlbW92ZSBjb21tZW50IG9uIGxpbmUgezB9XCIsIGl0ZW0ubGluZSk7XG5cdFx0XHRjb25zdCByZW1vdmVCdXR0b24gPSBkb20uYXBwZW5kKHJvdywgZG9tLiQ8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b24uY2hhdC1wbGFuLXJldmlldy1jb21tZW50LXJlbW92ZScpKTtcblx0XHRcdHJlbW92ZUJ1dHRvbi50eXBlID0gJ2J1dHRvbic7XG5cdFx0XHRyZW1vdmVCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgcmVtb3ZlTGFiZWwpO1xuXHRcdFx0cmVtb3ZlQnV0dG9uLnRpdGxlID0gcmVtb3ZlTGFiZWw7XG5cdFx0XHRyZW1vdmVCdXR0b24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmNsb3NlKSk7XG5cblx0XHRcdHRoaXMuX2NvbW1lbnRSb3dEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihyZW1vdmVCdXR0b24sIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLnJlbW92ZUlubGluZUNvbW1lbnQoaXRlbS5pZCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1lbnRzTGlzdFNjcm9sbGFibGU/LnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldElubGluZUZlZWRiYWNrSXRlbXMoKTogcmVhZG9ubHkgSVBsYW5SZXZpZXdGZWVkYmFja0l0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMucmV2aWV3LnBsYW5Vcmlcblx0XHRcdD8gdGhpcy5fcGxhblJldmlld0ZlZWRiYWNrU2VydmljZS5nZXRGZWVkYmFjayhVUkkucmV2aXZlKHRoaXMucmV2aWV3LnBsYW5VcmkpKVxuXHRcdFx0OiBbXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmV2ZWFsSW5saW5lQ29tbWVudChpdGVtOiBJUGxhblJldmlld0ZlZWRiYWNrSXRlbSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBsYW5VcmkgPSB0aGlzLnJldmlldy5wbGFuVXJpID8gVVJJLnJldml2ZSh0aGlzLnJldmlldy5wbGFuVXJpKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXBsYW5VcmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGxhblJldmlld0ZlZWRiYWNrU2VydmljZS5zZXROYXZpZ2F0aW9uQW5jaG9yKHBsYW5VcmksIGl0ZW0uaWQpO1xuXHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogaXRlbS5yZXNvdXJjZSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0cGlubmVkOiB0cnVlLFxuXHRcdFx0XHQuLi4oaXNFcXVhbChpdGVtLnJlc291cmNlLCBwbGFuVXJpKSA/IHsgb3ZlcnJpZGU6IE1BUktET1dOX0VESVRPUl9JRCB9IDoge30pLFxuXHRcdFx0XHRzZWxlY3Rpb246IHsgc3RhcnRMaW5lTnVtYmVyOiBpdGVtLmxpbmUsIHN0YXJ0Q29sdW1uOiBpdGVtLmNvbHVtbiB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlSW5saW5lQ29tbWVudChpdGVtSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc1N1Ym1pdHRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5yZXZpZXcucGxhblVyaSkge1xuXHRcdFx0dGhpcy5fcGxhblJldmlld0ZlZWRiYWNrU2VydmljZS5yZW1vdmVGZWVkYmFjayhVUkkucmV2aXZlKHRoaXMucmV2aWV3LnBsYW5VcmkpLCBpdGVtSWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2xlYXJBbGxJbmxpbmVGZWVkYmFjaygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5faXNTdWJtaXR0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmdldElubGluZUZlZWRiYWNrSXRlbXMoKTtcblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2RpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5jbGVhckFsbENvbmZpcm0nLCAnQ2xlYXIgezB9IGlubGluZSBjb21tZW50KHMpPycsIGl0ZW1zLmxlbmd0aCksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcuY2xlYXJBbGxEZXRhaWwnLCAnVGhlc2UgY29tbWVudHMgd2lsbCBiZSByZW1vdmVkIGZyb20gdGhlIHBsYW4gZmlsZSBhbmQgbm90IHNlbnQgdG8gdGhlIGFnZW50LicpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5jbGVhckFsbENvbmZpcm1QcmltYXJ5JywgJ0NsZWFyIEFsbCcpLFxuXHRcdH0pO1xuXHRcdGlmICghcmVzdWx0LmNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5yZXZpZXcucGxhblVyaSkge1xuXHRcdFx0dGhpcy5fcGxhblJldmlld0ZlZWRiYWNrU2VydmljZS5jbGVhckZlZWRiYWNrKFVSSS5yZXZpdmUodGhpcy5yZXZpZXcucGxhblVyaSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25JbmxpbmVGZWVkYmFja0NoYW5nZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzU3VibWl0dGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRJbmxpbmVGZWVkYmFja0l0ZW1zKCk7XG5cblx0XHQvLyBBdXRvLXByb21vdGUgaW50byByZXZpZXcgbW9kZSB0aGUgZmlyc3QgdGltZSBhIGNvbW1lbnQgc2hvd3MgdXAuXG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA+IDAgJiYgIXRoaXMuX2lzRmVlZGJhY2tNb2RlKSB7XG5cdFx0XHR2b2lkIHRoaXMuZW50ZXJGZWVkYmFja01vZGUoeyBmb2N1czogZmFsc2UgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJDb21tZW50c0xpc3QoKTtcblx0XHRpZiAodGhpcy5faXNGZWVkYmFja01vZGUpIHtcblx0XHRcdHRoaXMudXBkYXRlU3VibWl0QnV0dG9uU3RhdGUoKTtcblx0XHR9XG5cdFx0dGhpcy5fbWVzc2FnZVNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIHRoZSBhY3Rpb24gYnV0dG9ucyBpbnRvIHRoZSBhY3RpdmUgY29udGFpbmVyIChmb290ZXIgd2hlblxuXHQgKiBleHBhbmRlZCwgaW5saW5lIHRpdGxlIHNsb3Qgd2hlbiBjb2xsYXBzZWQpLiBDbGVhcnMgdGhlIGluYWN0aXZlIHNsb3Rcblx0ICogc28gdGhlIHNhbWUgYnV0dG9ucyBjYW4gbmV2ZXIgYXBwZWFyIGluIHR3byBwbGFjZXMgYXQgb25jZS5cblx0ICovXG5cdHByaXZhdGUgcmVuZGVyQ3VycmVudEFjdGlvbkJ1dHRvbnMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzU3VibWl0dGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX2lzQ29sbGFwc2VkID8gdGhpcy5faW5saW5lQWN0aW9uc0VsIDogdGhpcy5fZm9vdGVyQnV0dG9uc0VsO1xuXHRcdGNvbnN0IG90aGVyID0gdGhpcy5faXNDb2xsYXBzZWQgPyB0aGlzLl9mb290ZXJCdXR0b25zRWwgOiB0aGlzLl9pbmxpbmVBY3Rpb25zRWw7XG5cdFx0ZG9tLmNsZWFyTm9kZShvdGhlcik7XG5cdFx0dGhpcy5yZW5kZXJBY3Rpb25CdXR0b25zKHRhcmdldCwgeyBpbmNsdWRlUmVqZWN0OiAhdGhpcy5faXNDb2xsYXBzZWQgfSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckFjdGlvbkJ1dHRvbnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgb3B0aW9ucz86IHsgaW5jbHVkZVJlamVjdD86IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGNvbnN0IGluY2x1ZGVSZWplY3QgPSBvcHRpb25zPy5pbmNsdWRlUmVqZWN0ID8/IHRydWU7XG5cdFx0dGhpcy5fYnV0dG9uU3RvcmUuY2xlYXIoKTtcblx0XHR0aGlzLl9zdWJtaXRCdXR0b24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVuZGVyZWRTdWJtaXRJbmxpbmVDb3VudCA9IC0xO1xuXHRcdGRvbS5jbGVhck5vZGUoY29udGFpbmVyKTtcblxuXHRcdC8vIEluIGZlZWRiYWNrIG1vZGUsIHNob3cgU3VibWl0ICsgUmVqZWN0LiBTdWJtaXQncyBsYWJlbCBpbmNsdWRlc1xuXHRcdC8vIHRoZSBjb3VudCBvZiBwZW5kaW5nIGlubGluZSBjb21tZW50cy5cblx0XHRpZiAodGhpcy5faXNGZWVkYmFja01vZGUpIHtcblx0XHRcdGNvbnN0IGlubGluZUNvdW50ID0gdGhpcy5nZXRJbmxpbmVGZWVkYmFja0l0ZW1zKCkubGVuZ3RoO1xuXHRcdFx0Y29uc3Qgc3VibWl0QnV0dG9uID0gbmV3IEJ1dHRvbihjb250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc3VwcG9ydEljb25zOiB0cnVlIH0pO1xuXHRcdFx0c3VibWl0QnV0dG9uLmxhYmVsID0gdGhpcy5jb21wdXRlU3VibWl0TGFiZWwoaW5saW5lQ291bnQpO1xuXHRcdFx0c3VibWl0QnV0dG9uLmVuYWJsZWQgPSB0aGlzLmNhblN1Ym1pdEZlZWRiYWNrKCk7XG5cdFx0XHR0aGlzLl9zdWJtaXRCdXR0b24gPSBzdWJtaXRCdXR0b247XG5cdFx0XHR0aGlzLl9yZW5kZXJlZFN1Ym1pdElubGluZUNvdW50ID0gaW5saW5lQ291bnQ7XG5cdFx0XHR0aGlzLl9idXR0b25TdG9yZS5hZGQoc3VibWl0QnV0dG9uKTtcblx0XHRcdHRoaXMuX2J1dHRvblN0b3JlLmFkZChzdWJtaXRCdXR0b24ub25EaWRDbGljaygoKSA9PiB2b2lkIHRoaXMuc3VibWl0RmVlZGJhY2soKSkpO1xuXG5cdFx0XHRpZiAoaW5jbHVkZVJlamVjdCkge1xuXHRcdFx0XHRjb25zdCByZWplY3RCdXR0b24gPSBuZXcgQnV0dG9uKGNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUgfSk7XG5cdFx0XHRcdHJlamVjdEJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcucmVqZWN0JywgJ1JlamVjdCcpO1xuXHRcdFx0XHR0aGlzLl9idXR0b25TdG9yZS5hZGQocmVqZWN0QnV0dG9uKTtcblx0XHRcdFx0dGhpcy5fYnV0dG9uU3RvcmUuYWRkKHJlamVjdEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuc3VibWl0UmVqZWN0aW9uKCkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBcHByb3ZlIGJ1dHRvbiBmaXJzdCAoYmx1ZSkuIFVzZXMgQnV0dG9uV2l0aERyb3Bkb3duIHdoZW4gdGhlcmUgYXJlXG5cdFx0Ly8gZXh0cmEgYWN0aW9uczsgb3RoZXJ3aXNlIGEgcGxhaW4gQnV0dG9uLlxuXHRcdGNvbnN0IHByaW1hcnkgPSB0aGlzLl9zZWxlY3RlZEFjdGlvbjtcblx0XHRjb25zdCBtb3JlQWN0aW9ucyA9IHRoaXMucmV2aWV3LmFjdGlvbnMuZmlsdGVyKGEgPT4gYSAhPT0gcHJpbWFyeSk7XG5cblx0XHRsZXQgYXBwcm92ZUJ1dHRvbjogSUJ1dHRvbjtcblx0XHRpZiAobW9yZUFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiA9IG5ldyBCdXR0b25XaXRoRHJvcGRvd24oY29udGFpbmVyLCB7XG5cdFx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsXG5cdFx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHRcdFx0Y29udGV4dE1lbnVQcm92aWRlcjogdGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0XHRhZGRQcmltYXJ5QWN0aW9uVG9Ecm9wZG93bjogZmFsc2UsXG5cdFx0XHRcdGFjdGlvbnM6IG1vcmVBY3Rpb25zLm1hcChhY3Rpb24gPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGJ1dHRvbiA9IG5ldyBBY3Rpb24oXG5cdFx0XHRcdFx0XHRhY3Rpb24ubGFiZWwsXG5cdFx0XHRcdFx0XHRhY3Rpb24ubGFiZWwsXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnN1Ym1pdEFwcHJvdmFsKGFjdGlvbik7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRidXR0b24udG9vbHRpcCA9IGFjdGlvbi5kZXNjcmlwdGlvbiB8fCAnJztcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fYnV0dG9uU3RvcmUuYWRkKGJ1dHRvbik7XG5cdFx0XHRcdH0pIGFzIChBY3Rpb24gfCBTZXBhcmF0b3IpW10sXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiA9IG5ldyBCdXR0b24oY29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHN1cHBvcnRJY29uczogdHJ1ZSB9KTtcblx0XHR9XG5cdFx0dGhpcy5fYnV0dG9uU3RvcmUuYWRkKGFwcHJvdmVCdXR0b24pO1xuXHRcdGFwcHJvdmVCdXR0b24ubGFiZWwgPSBwcmltYXJ5LmxhYmVsO1xuXHRcdGlmIChwcmltYXJ5LmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRhcHByb3ZlQnV0dG9uLmVsZW1lbnQudGl0bGUgPSBwcmltYXJ5LmRlc2NyaXB0aW9uO1xuXHRcdH1cblx0XHR0aGlzLl9idXR0b25TdG9yZS5hZGQoYXBwcm92ZUJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuc3VibWl0QXBwcm92YWwocHJpbWFyeSkpKTtcblxuXHRcdC8vIFJlamVjdCBidXR0b24gKGdyZXkgc2Vjb25kYXJ5KSBpbW1lZGlhdGVseSBhZnRlciB0aGUgYXBwcm92ZSBidXR0b25cblx0XHQvLyBzbyB0aGUgcHJpbWFyeSBBcHByb3ZlIC8gUmVqZWN0IHBhaXIgc3RheXMgZ3JvdXBlZCB0b2dldGhlciBcdTIwMTRcblx0XHQvLyBvbWl0dGVkIGluIHRoZSBjb2xsYXBzZWQgdGl0bGUgYmFyIChwYXJpdHkgd2l0aFxuXHRcdC8vIGNoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxQYXJ0IHdoaWNoIG9ubHkgc3VyZmFjZXMgdGhlIHByaW1hcnlcblx0XHQvLyBhY3Rpb24gd2hlbiBjb2xsYXBzZWQpLlxuXHRcdGlmIChpbmNsdWRlUmVqZWN0KSB7XG5cdFx0XHRjb25zdCByZWplY3RCdXR0b24gPSBuZXcgQnV0dG9uKGNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUgfSk7XG5cdFx0XHRyZWplY3RCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LnJlamVjdCcsICdSZWplY3QnKTtcblx0XHRcdHRoaXMuX2J1dHRvblN0b3JlLmFkZChyZWplY3RCdXR0b24pO1xuXHRcdFx0dGhpcy5fYnV0dG9uU3RvcmUuYWRkKHJlamVjdEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuc3VibWl0UmVqZWN0aW9uKCkpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNhblN1Ym1pdEZlZWRiYWNrKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHRleHRhcmVhVGV4dCA9IHRoaXMuX2ZlZWRiYWNrVGV4dGFyZWE/LnZhbHVlLnRyaW0oKSA/PyAnJztcblx0XHRpZiAodGV4dGFyZWFUZXh0KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0SW5saW5lRmVlZGJhY2tJdGVtcygpLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVTdWJtaXRMYWJlbChpbmxpbmVDb3VudDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gaW5saW5lQ291bnQgPiAwXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcuc3VibWl0RmVlZGJhY2tXaXRoQ291bnQnLCAnU3VibWl0IEZlZWRiYWNrICh7MH0pJywgaW5saW5lQ291bnQpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcuc3VibWl0RmVlZGJhY2snLCAnU3VibWl0IEZlZWRiYWNrJyk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIHRoZSBjYWNoZWQgU3VibWl0IGJ1dHRvbidzIGVuYWJsZWQgc3RhdGUgYW5kIGxhYmVsIHdpdGhvdXRcblx0ICogZGVzdHJveWluZyB0aGUgYnV0dG9uIHJvdy4gQ2hlYXAgZW5vdWdoIHRvIHJ1biBvbiBldmVyeSBrZXlzdHJva2UuXG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZVN1Ym1pdEJ1dHRvblN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc3VibWl0QnV0dG9uIHx8ICF0aGlzLl9pc0ZlZWRiYWNrTW9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdWJtaXRCdXR0b24uZW5hYmxlZCA9IHRoaXMuY2FuU3VibWl0RmVlZGJhY2soKTtcblx0XHRjb25zdCBpbmxpbmVDb3VudCA9IHRoaXMuZ2V0SW5saW5lRmVlZGJhY2tJdGVtcygpLmxlbmd0aDtcblx0XHRpZiAoaW5saW5lQ291bnQgIT09IHRoaXMuX3JlbmRlcmVkU3VibWl0SW5saW5lQ291bnQpIHtcblx0XHRcdHRoaXMuX3N1Ym1pdEJ1dHRvbi5sYWJlbCA9IHRoaXMuY29tcHV0ZVN1Ym1pdExhYmVsKGlubGluZUNvdW50KTtcblx0XHRcdHRoaXMuX3JlbmRlcmVkU3VibWl0SW5saW5lQ291bnQgPSBpbmxpbmVDb3VudDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZUNvbGxhcHNlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0NvbGxhcHNlZCA9ICF0aGlzLl9pc0NvbGxhcHNlZDtcblx0XHRpZiAodGhpcy5yZXZpZXcgaW5zdGFuY2VvZiBDaGF0UGxhblJldmlld0RhdGEpIHtcblx0XHRcdHRoaXMucmV2aWV3LmRyYWZ0Q29sbGFwc2VkID0gdGhpcy5faXNDb2xsYXBzZWQ7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlQ29sbGFwc2VkUHJlc2VudGF0aW9uKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb2xsYXBzZWRQcmVzZW50YXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtcGxhbi1yZXZpZXctY29sbGFwc2VkJywgdGhpcy5faXNDb2xsYXBzZWQpO1xuXHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmxhYmVsID0gdGhpcy5faXNDb2xsYXBzZWRcblx0XHRcdD8gYCQoJHtDb2RpY29uLmNoZXZyb25VcC5pZH0pYFxuXHRcdFx0OiBgJCgke0NvZGljb24uY2hldnJvbkRvd24uaWR9KWA7XG5cdFx0Y29uc3QgY29sbGFwc2VUb29sdGlwID0gdGhpcy5faXNDb2xsYXBzZWRcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5leHBhbmQnLCAnRXhwYW5kJylcblx0XHRcdDogbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5jb2xsYXBzZScsICdDb2xsYXBzZScpO1xuXHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgY29sbGFwc2VUb29sdGlwKTtcblx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyghdGhpcy5faXNDb2xsYXBzZWQpKTtcblx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5zZXRUaXRsZShjb2xsYXBzZVRvb2x0aXApO1xuXG5cdFx0Ly8gQ29sbGFwc2VkIHRpdGxlIGJhciB1c2VzIGEgcGVuY2lsIGljb247IGV4cGFuZGVkIHVzZXMgYSB0ZXh0XG5cdFx0Ly8gbGFiZWwgdGhhdCBoaW50cyBhdCB0aGUgZmVlZGJhY2sgZmxvdy5cblx0XHRpZiAodGhpcy5fcmV2aWV3QnV0dG9uKSB7XG5cdFx0XHRjb25zdCBpc0ljb25Pbmx5ID0gdGhpcy5faXNDb2xsYXBzZWQ7XG5cdFx0XHR0aGlzLl9yZXZpZXdCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXBsYW4tcmV2aWV3LXRpdGxlLWljb24tYnV0dG9uJywgaXNJY29uT25seSk7XG5cdFx0XHRsZXQgbGFiZWw6IHN0cmluZztcblx0XHRcdGxldCB0b29sdGlwOiBzdHJpbmc7XG5cdFx0XHRpZiAoaXNJY29uT25seSkge1xuXHRcdFx0XHRsYWJlbCA9IGAkKCR7Q29kaWNvbi5lZGl0LmlkfSlgO1xuXHRcdFx0XHRjb25zdCBmaWxlTmFtZSA9IHRoaXMucmV2aWV3LnBsYW5VcmkgPyBiYXNlbmFtZShVUkkucmV2aXZlKHRoaXMucmV2aWV3LnBsYW5VcmkpKSA6ICcnO1xuXHRcdFx0XHR0b29sdGlwID0gdGhpcy5yZXZpZXcuY2FuUHJvdmlkZUZlZWRiYWNrXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LnJldmlld1Rvb2x0aXAnLCAnUmV2aWV3IHswfScsIGZpbGVOYW1lKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5vcGVuVG9vbHRpcCcsICdPcGVuIHswfScsIGZpbGVOYW1lKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGZpbGVOYW1lID0gdGhpcy5yZXZpZXcucGxhblVyaSA/IGJhc2VuYW1lKFVSSS5yZXZpdmUodGhpcy5yZXZpZXcucGxhblVyaSkpIDogJyc7XG5cdFx0XHRcdGlmICh0aGlzLnJldmlldy5jYW5Qcm92aWRlRmVlZGJhY2spIHtcblx0XHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcucmV2aWV3QnV0dG9uTGFiZWwnLCBcIk9wZW4gRnVsbCBQbGFuXCIpO1xuXHRcdFx0XHRcdHRvb2x0aXAgPSBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LnJldmlld1Rvb2x0aXAnLCAnUmV2aWV3IHswfScsIGZpbGVOYW1lKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcub3BlbkJ1dHRvbkxhYmVsJywgXCJPcGVuIFBsYW5cIik7XG5cdFx0XHRcdFx0dG9vbHRpcCA9IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcub3BlblRvb2x0aXAnLCAnT3BlbiB7MH0nLCBmaWxlTmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3Jldmlld0J1dHRvbi5sYWJlbCA9IGxhYmVsO1xuXHRcdFx0dGhpcy5fcmV2aWV3QnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdG9vbHRpcCk7XG5cdFx0XHR0aGlzLl9yZXZpZXdCdXR0b24uc2V0VGl0bGUodG9vbHRpcCk7XG5cdFx0fVxuXG5cdFx0Ly8gTW92ZSBhY3Rpb24gYnV0dG9ucyBiZXR3ZWVuIGZvb3RlciAoZXhwYW5kZWQpIGFuZCBpbmxpbmUgdGl0bGVcblx0XHQvLyBzbG90IChjb2xsYXBzZWQpLiBSZWplY3QgaXMgb21pdHRlZCB3aGVuIGNvbGxhcHNlZC5cblx0XHR0aGlzLnJlbmRlckN1cnJlbnRBY3Rpb25CdXR0b25zKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGVudGVyUmV2aWV3TW9kZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBSZWFkLW9ubHkgLyBzdWJtaXR0ZWQgcGxhbnM6IGZhbGwgYmFjayB0byBvcGVuaW5nIHRoZSBmaWxlIGluIGFuIGVkaXRvci5cblx0XHRpZiAoIXRoaXMucmV2aWV3LmNhblByb3ZpZGVGZWVkYmFjayB8fCB0aGlzLl9pc1N1Ym1pdHRlZCkge1xuXHRcdFx0aWYgKHRoaXMucmV2aWV3LnBsYW5VcmkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnJldml2ZSh0aGlzLnJldmlldy5wbGFuVXJpKSxcblx0XHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSwgb3ZlcnJpZGU6IE1BUktET1dOX0VESVRPUl9JRCB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2lzQ29sbGFwc2VkKSB7XG5cdFx0XHR0aGlzLl9pc0NvbGxhcHNlZCA9IGZhbHNlO1xuXHRcdFx0aWYgKHRoaXMucmV2aWV3IGluc3RhbmNlb2YgQ2hhdFBsYW5SZXZpZXdEYXRhKSB7XG5cdFx0XHRcdHRoaXMucmV2aWV3LmRyYWZ0Q29sbGFwc2VkID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbGxhcHNlZFByZXNlbnRhdGlvbigpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLmVudGVyRmVlZGJhY2tNb2RlKHsgZm9jdXM6IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN1Ym1pdEFwcHJvdmFsKGFjdGlvbjogSUNoYXRQbGFuQXBwcm92YWxBY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5faXNTdWJtaXR0ZWQgfHwgdGhpcy5faXNTdWJtaXR0aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzU3VibWl0dGluZyA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChhY3Rpb24ucGVybWlzc2lvbkxldmVsID09PSAnYXV0b3BpbG90Jykge1xuXHRcdFx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCB0aGlzLmNvbmZpcm1BdXRvcGlsb3QoKTtcblx0XHRcdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnJldmlldy5wbGFuVXJpICYmICFhd2FpdCB0aGlzLnNhdmVQbGFuRmlsZSgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2lzU3VibWl0dGVkID0gdHJ1ZTtcblx0XHRcdC8vIE9ubHkgdGhlIHRleHRhcmVhLW9ubHkgZmxvdyAobm8gcGxhblVyaSkgYXR0YWNoZXMgYSBkcmFmdCB0byB0aGUgYWN0aW9uIGNsaWNrLlxuXHRcdFx0Y29uc3QgcmlkZXNBbG9uZyA9ICF0aGlzLnJldmlldy5wbGFuVXJpO1xuXHRcdFx0Y29uc3QgdGV4dGFyZWFGZWVkYmFjayA9IHJpZGVzQWxvbmcgPyB0aGlzLl9mZWVkYmFja1RleHRhcmVhPy52YWx1ZS50cmltKCkgOiB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9vcHRpb25zLm9uU3VibWl0KHtcblx0XHRcdFx0YWN0aW9uOiBhY3Rpb24ubGFiZWwsXG5cdFx0XHRcdC4uLihhY3Rpb24uaWQgPyB7IGFjdGlvbklkOiBhY3Rpb24uaWQgfSA6IHt9KSxcblx0XHRcdFx0cmVqZWN0ZWQ6IGZhbHNlLFxuXHRcdFx0XHQuLi4odGV4dGFyZWFGZWVkYmFjayA/IHsgZmVlZGJhY2s6IHRleHRhcmVhRmVlZGJhY2ssIGZlZWRiYWNrT3ZlcmFsbDogdGV4dGFyZWFGZWVkYmFjayB9IDoge30pLFxuXHRcdFx0fSk7XG5cdFx0XHR2b2lkIHRoaXMubWFya1VzZWQoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKCF0aGlzLl9pc1N1Ym1pdHRlZCkge1xuXHRcdFx0XHR0aGlzLl9pc1N1Ym1pdHRpbmcgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN1Ym1pdFJlamVjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5faXNTdWJtaXR0ZWQgfHwgdGhpcy5faXNTdWJtaXR0aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzU3VibWl0dGluZyA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0aGlzLnJldmlldy5wbGFuVXJpICYmICFhd2FpdCB0aGlzLnNhdmVQbGFuRmlsZSgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2lzU3VibWl0dGVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHJpZGVzQWxvbmcgPSAhdGhpcy5yZXZpZXcucGxhblVyaTtcblx0XHRcdGNvbnN0IHRleHRhcmVhRmVlZGJhY2sgPSByaWRlc0Fsb25nID8gdGhpcy5fZmVlZGJhY2tUZXh0YXJlYT8udmFsdWUudHJpbSgpIDogdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fb3B0aW9ucy5vblN1Ym1pdCh7XG5cdFx0XHRcdHJlamVjdGVkOiB0cnVlLFxuXHRcdFx0XHQuLi4odGV4dGFyZWFGZWVkYmFjayA/IHsgZmVlZGJhY2s6IHRleHRhcmVhRmVlZGJhY2ssIGZlZWRiYWNrT3ZlcmFsbDogdGV4dGFyZWFGZWVkYmFjayB9IDoge30pLFxuXHRcdFx0fSk7XG5cdFx0XHR2b2lkIHRoaXMubWFya1VzZWQoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKCF0aGlzLl9pc1N1Ym1pdHRlZCkge1xuXHRcdFx0XHR0aGlzLl9pc1N1Ym1pdHRpbmcgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNhdmVQbGFuRmlsZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIXRoaXMucmV2aWV3LnBsYW5VcmkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBwbGFuVXJpID0gVVJJLnJldml2ZSh0aGlzLnJldmlldy5wbGFuVXJpKTtcblx0XHRpZiAodGhpcy5fdGV4dEZpbGVTZXJ2aWNlLmlzRGlydHkocGxhblVyaSkgJiYgIWF3YWl0IHRoaXMuX3RleHRGaWxlU2VydmljZS5zYXZlKHBsYW5VcmkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnJldmlldyBpbnN0YW5jZW9mIENoYXRQbGFuUmV2aWV3RGF0YSkge1xuXHRcdFx0aWYgKCF0aGlzLnVwZGF0ZVBsYW5Db250ZW50RnJvbU1vZGVsKCkpIHtcblx0XHRcdFx0dGhpcy5yZXZpZXcuY29udGVudCA9IChhd2FpdCB0aGlzLl90ZXh0RmlsZVNlcnZpY2UucmVhZChwbGFuVXJpKSkudmFsdWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnJlbmRlck1hcmtkb3duKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQbGFuQ29udGVudEZyb21Nb2RlbCgpOiBib29sZWFuIHtcblx0XHRpZiAoISh0aGlzLnJldmlldyBpbnN0YW5jZW9mIENoYXRQbGFuUmV2aWV3RGF0YSkgfHwgIXRoaXMucmV2aWV3LnBsYW5VcmkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl90ZXh0RmlsZVNlcnZpY2UuZmlsZXMuZ2V0KFVSSS5yZXZpdmUodGhpcy5yZXZpZXcucGxhblVyaSkpO1xuXHRcdGlmICghbW9kZWw/LmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLnJldmlldy5jb250ZW50ID0gbW9kZWwudGV4dEVkaXRvck1vZGVsLmdldFZhbHVlKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGVudGVyRmVlZGJhY2tNb2RlKG9wdGlvbnM/OiB7IGZvY3VzPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2lzRmVlZGJhY2tNb2RlKSB7XG5cdFx0XHRpZiAodGhpcy5yZXZpZXcucGxhblVyaSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucmV2aXZlKHRoaXMucmV2aWV3LnBsYW5VcmkpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlLCBvdmVycmlkZTogTUFSS0RPV05fRURJVE9SX0lEIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChvcHRpb25zPy5mb2N1cykge1xuXHRcdFx0XHR0aGlzLmZvY3VzRmVlZGJhY2tJbnB1dCgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc0ZlZWRiYWNrTW9kZSA9IHRydWU7XG5cdFx0aWYgKHRoaXMuX2ZlZWRiYWNrU2VjdGlvbikge1xuXHRcdFx0ZG9tLnNob3codGhpcy5fZmVlZGJhY2tTZWN0aW9uKTtcblx0XHR9XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtcGxhbi1yZXZpZXctZmVlZGJhY2stbW9kZScpO1xuXHRcdHRoaXMucmVuZGVyQ29tbWVudHNMaXN0KCk7XG5cdFx0Ly8gYHVwZGF0ZUNvbGxhcHNlZFByZXNlbnRhdGlvbmAgcmUtcmVuZGVycyB0aGUgYWN0aW9uIGJ1dHRvbnMsIHNvIHdlIGRvbid0IGNhbGxcblx0XHQvLyBgcmVuZGVyQ3VycmVudEFjdGlvbkJ1dHRvbnNgIGV4cGxpY2l0bHkgaGVyZSB0byBhdm9pZCBkb3VibGUgd29yay5cblx0XHR0aGlzLnVwZGF0ZUNvbGxhcHNlZFByZXNlbnRhdGlvbigpO1xuXHRcdGlmICh0aGlzLnJldmlldy5wbGFuVXJpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnJldml2ZSh0aGlzLnJldmlldy5wbGFuVXJpKSxcblx0XHRcdFx0b3B0aW9uczogeyBwaW5uZWQ6IHRydWUsIG92ZXJyaWRlOiBNQVJLRE9XTl9FRElUT1JfSUQgfSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMucmV2aWV3LnBsYW5VcmkgJiYgb3B0aW9ucz8uZm9jdXMgIT09IGZhbHNlKSB7XG5cdFx0XHR0aGlzLmZvY3VzRmVlZGJhY2tJbnB1dCgpO1xuXHRcdH1cblx0XHR0aGlzLl9tZXNzYWdlU2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZXhpdEZlZWRiYWNrTW9kZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2lzRmVlZGJhY2tNb2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNGZWVkYmFja01vZGUgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5fZmVlZGJhY2tTZWN0aW9uKSB7XG5cdFx0XHRkb20uaGlkZSh0aGlzLl9mZWVkYmFja1NlY3Rpb24pO1xuXHRcdH1cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1wbGFuLXJldmlldy1mZWVkYmFjay1tb2RlJyk7XG5cdFx0Ly8gYHVwZGF0ZUNvbGxhcHNlZFByZXNlbnRhdGlvbmAgcmUtcmVuZGVycyB0aGUgYWN0aW9uIGJ1dHRvbnMuXG5cdFx0dGhpcy51cGRhdGVDb2xsYXBzZWRQcmVzZW50YXRpb24oKTtcblx0XHR0aGlzLl9tZXNzYWdlU2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgZm9jdXNGZWVkYmFja0lucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZlZWRiYWNrVGV4dGFyZWE/LmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN1Ym1pdEZlZWRiYWNrKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl9pc1N1Ym1pdHRlZCB8fCB0aGlzLl9pc1N1Ym1pdHRpbmcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgdGV4dGFyZWFGZWVkYmFjayA9IHRoaXMuX2ZlZWRiYWNrVGV4dGFyZWE/LnZhbHVlLnRyaW0oKTtcblxuXHRcdGNvbnN0IGVkaXRvckZlZWRiYWNrSXRlbXMgPSBbLi4udGhpcy5nZXRJbmxpbmVGZWVkYmFja0l0ZW1zKCldO1xuXG5cdFx0aWYgKCF0ZXh0YXJlYUZlZWRiYWNrICYmIGVkaXRvckZlZWRiYWNrSXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX2lzU3VibWl0dGluZyA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghYXdhaXQgdGhpcy5zYXZlUGxhbkZpbGUoKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEtlZXAgb3ZlcmFsbCBhbmQgaW5saW5lIGJsb2NrcyBzZXBhcmF0ZSBzbyB0aGUgdHJhbnNjcmlwdCBjYW4gcmVuZGVyIHRoZW0gZGlzdGluY3RseS5cblx0XHRcdGxldCBmZWVkYmFja0lubGluZU1hcmtkb3duOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZWRpdG9yRmVlZGJhY2tJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW1zQnlSZXNvdXJjZSA9IG5ldyBNYXA8c3RyaW5nLCBJUGxhblJldmlld0ZlZWRiYWNrSXRlbVtdPigpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZWRpdG9yRmVlZGJhY2tJdGVtcykge1xuXHRcdFx0XHRcdGNvbnN0IGtleSA9IGl0ZW0ucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdFx0XHRjb25zdCBpdGVtcyA9IGl0ZW1zQnlSZXNvdXJjZS5nZXQoa2V5KSA/PyBbXTtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0XHRcdGl0ZW1zQnlSZXNvdXJjZS5zZXQoa2V5LCBpdGVtcyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBbLi4uaXRlbXNCeVJlc291cmNlLnZhbHVlcygpXS5mbGF0TWFwKGl0ZW1zID0+IFtcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LmlubGluZUNvbW1lbnRzSGVhZGluZycsIFwiSW5saW5lIGNvbW1lbnRzIG9uIGB7MH1gOlwiLCBiYXNlbmFtZShpdGVtc1swXS5yZXNvdXJjZSkpLFxuXHRcdFx0XHRcdC4uLml0ZW1zLm1hcChpdGVtID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGxvY2F0aW9uID0gaXRlbS5jb2x1bW4gPiAxXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5pbmxpbmVDb21tZW50TG9jYXRpb24nLCBcIkxpbmUgezB9LCBDb2x1bW4gezF9XCIsIGl0ZW0ubGluZSwgaXRlbS5jb2x1bW4pXG5cdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5pbmxpbmVDb21tZW50TG9jYXRpb25MaW5lJywgXCJMaW5lIHswfVwiLCBpdGVtLmxpbmUpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGAtICoqJHtsb2NhdGlvbn06KiogJHtpdGVtLnRleHR9YDtcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGZlZWRiYWNrSW5saW5lTWFya2Rvd24gPSBzZWN0aW9ucy5qb2luKCdcXG4nKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2VjdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRpZiAodGV4dGFyZWFGZWVkYmFjaykge1xuXHRcdFx0XHRzZWN0aW9ucy5wdXNoKHRleHRhcmVhRmVlZGJhY2spO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZlZWRiYWNrSW5saW5lTWFya2Rvd24pIHtcblx0XHRcdFx0c2VjdGlvbnMucHVzaChmZWVkYmFja0lubGluZU1hcmtkb3duKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmVlZGJhY2sgPSBzZWN0aW9ucy5qb2luKCdcXG5cXG4nKTtcblx0XHRcdHRoaXMuX2lzU3VibWl0dGVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSB0aGlzLnJldmlldy5wbGFuVXJpID8gVVJJLnJldml2ZSh0aGlzLnJldmlldy5wbGFuVXJpKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChwbGFuVXJpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBlZGl0b3JGZWVkYmFja0l0ZW1zKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGxhblJldmlld0ZlZWRiYWNrU2VydmljZS5yZW1vdmVGZWVkYmFjayhwbGFuVXJpLCBpdGVtLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb3B0aW9ucy5vblN1Ym1pdCh7XG5cdFx0XHRcdHJlamVjdGVkOiBmYWxzZSxcblx0XHRcdFx0ZmVlZGJhY2ssXG5cdFx0XHRcdGZlZWRiYWNrT3ZlcmFsbDogdGV4dGFyZWFGZWVkYmFjayB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdGZlZWRiYWNrSW5saW5lTWFya2Rvd24sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRoaXMubWFya1VzZWQoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzU3VibWl0dGVkKSB7XG5cdFx0XHRcdHRoaXMuX2lzU3VibWl0dGluZyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29uZmlybUF1dG9waWxvdCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5hdXRvcGlsb3QudGl0bGUnLCAnRW5hYmxlIEF1dG9waWxvdD8nKSxcblx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LmF1dG9waWxvdC5jb25maXJtJywgJ0VuYWJsZScpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcuYXV0b3BpbG90LmNhbmNlbCcsICdDYW5jZWwnKSxcblx0XHRcdFx0XHRydW46ICgpID0+IGZhbHNlXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0Y3VzdG9tOiB7XG5cdFx0XHRcdGljb246IENvZGljb24ucm9ja2V0LFxuXHRcdFx0XHRtYXJrZG93bkRldGFpbHM6IFt7XG5cdFx0XHRcdFx0bWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LmF1dG9waWxvdC5kZXRhaWwnLCAnQXV0b3BpbG90IHdpbGwgYXV0by1hcHByb3ZlIGFsbCB0b29sIGNhbGxzIGFuZCBjb250aW51ZSB3b3JraW5nIGF1dG9ub21vdXNseSB1bnRpbCB0aGUgdGFzayBpcyBjb21wbGV0ZS4gVGhpcyBpbmNsdWRlcyB0ZXJtaW5hbCBjb21tYW5kcywgZmlsZSBlZGl0cywgYW5kIGV4dGVybmFsIHRvb2wgY2FsbHMuIFRoZSBhZ2VudCB3aWxsIG1ha2UgZGVjaXNpb25zIG9uIHlvdXIgYmVoYWxmIHdpdGhvdXQgYXNraW5nIGZvciBjb25maXJtYXRpb24uXFxuXFxuWW91IGNhbiBzdG9wIHRoZSBhZ2VudCBhdCBhbnkgdGltZSBieSBjbGlja2luZyB0aGUgc3RvcCBidXR0b24uIFRoaXMgYXBwbGllcyB0byB0aGUgY3VycmVudCBzZXNzaW9uIG9ubHkuJykpLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdC5yZXN1bHQgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1hcmtVc2VkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LXBsYW4tcmV2aWV3LXVzZWQnKTtcblx0XHR0aGlzLl9idXR0b25TdG9yZS5jbGVhcigpO1xuXHRcdHRoaXMuX3N1Ym1pdEJ1dHRvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZW5kZXJlZFN1Ym1pdElubGluZUNvdW50ID0gLTE7XG5cdFx0Ly8gSGlkZSB0aGUgZWRpdG9yIGNvbnRyaWJ1dGlvbiBldmVuIGlmIHRoZSBwbGFuIGZpbGUgaXMgc3RpbGwgb3Blbi5cblx0XHR0aGlzLl9wbGFuUmV2aWV3UmVnaXN0cmF0aW9uLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuX2ZlZWRiYWNrVGV4dGFyZWEpIHtcblx0XHRcdHRoaXMuX2ZlZWRiYWNrVGV4dGFyZWEuZGlzYWJsZWQgPSB0cnVlO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxRQUFRLDBCQUFtQztBQUNwRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGNBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxTQUFTLDJCQUEyQjtBQUNwQyxPQUFPLGNB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
