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
import "./media/agentFeedbackEditorWidget.css";
import { $, addDisposableListener, addStandardDisposableListener, clearNode, getTotalWidth, isHTMLElement } from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Action } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { overviewRulerRangeHighlight } from "../../../../editor/common/core/editorColorRegistry.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { OverviewRulerLane } from "../../../../editor/common/model.js";
import * as nls from "../../../../nls.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { ICodeReviewService } from "../../codeReview/browser/codeReviewService.js";
import { createAgentFeedbackContext } from "./agentFeedbackEditorUtils.js";
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from "./agentFeedbackService.js";
import { SessionEditorCommentSource, toSessionEditorCommentId } from "./sessionEditorComments.js";
function isTextInputTarget(target) {
  return isHTMLElement(target) && target.closest("textarea, input") !== null;
}
var ComposerKind = /* @__PURE__ */ ((ComposerKind2) => {
  ComposerKind2[ComposerKind2["Edit"] = 0] = "Edit";
  ComposerKind2[ComposerKind2["Reply"] = 1] = "Reply";
  return ComposerKind2;
})(ComposerKind || {});
let AgentFeedbackEditorWidget = class extends Disposable {
  constructor(_editor, _commentItems, _sessionResource, _composerDraftState, _agentFeedbackService, _codeReviewService, _markdownRendererService, _codeEditorService) {
    super();
    this._editor = _editor;
    this._commentItems = _commentItems;
    this._sessionResource = _sessionResource;
    this._composerDraftState = _composerDraftState;
    this._agentFeedbackService = _agentFeedbackService;
    this._codeReviewService = _codeReviewService;
    this._markdownRendererService = _markdownRendererService;
    this._codeEditorService = _codeEditorService;
    this._id = `agent-feedback-widget-${AgentFeedbackEditorWidget._idPool++}`;
    this._itemElements = /* @__PURE__ */ new Map();
    this._activeReplyInputs = /* @__PURE__ */ new Map();
    this._activeEditInputs = /* @__PURE__ */ new Map();
    this._actionBarElements = /* @__PURE__ */ new Map();
    this._position = null;
    this._isExpanded = false;
    this._disposed = false;
    this._startLineNumber = 1;
    this._eventStore = this._register(new DisposableStore());
    this._onDidExpand = this._register(new Emitter());
    this.onDidExpand = this._onDidExpand.event;
    this._rangeHighlightDecoration = this._editor.createDecorationsCollection();
    this._domNode = $("div.agent-feedback-widget");
    this._domNode.classList.add("collapsed");
    this._domNode.tabIndex = -1;
    this._headerNode = $("div.agent-feedback-widget-header");
    const commentIcon = renderIcon(Codicon.comment);
    commentIcon.setAttribute("aria-hidden", "true");
    this._headerNode.appendChild(commentIcon);
    this._titleNode = $("span.agent-feedback-widget-title");
    this._updateTitle();
    this._headerNode.appendChild(this._titleNode);
    this._headerNode.appendChild($("span.agent-feedback-widget-spacer"));
    this._toggleButton = $("div.agent-feedback-widget-toggle");
    this._updateToggleButton();
    this._headerNode.appendChild(this._toggleButton);
    this._domNode.appendChild(this._headerNode);
    this._bodyNode = $("div.agent-feedback-widget-body");
    this._bodyNode.classList.add("collapsed");
    this._buildFeedbackItems();
    this._domNode.appendChild(this._bodyNode);
    const arrow = $("div.agent-feedback-widget-arrow");
    this._domNode.appendChild(arrow);
    this._setupEventHandlers();
    this._domNode.classList.add("visible");
    this._editor.addOverlayWidget(this);
  }
  _setupEventHandlers() {
    this._eventStore.add(addDisposableListener(this._toggleButton, "click", (e) => {
      e.stopPropagation();
      this._toggleExpanded();
    }));
    this._eventStore.add(addDisposableListener(this._headerNode, "click", () => {
      this._toggleExpanded();
    }));
    this._eventStore.add(addStandardDisposableListener(this._domNode, "keydown", (e) => {
      if (e.keyCode !== KeyCode.Escape || !this._cancelActiveInputs()) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    }));
  }
  /**
   * Closes every open edit / reply composer. Returns whether any was open.
   */
  _cancelActiveInputs() {
    const cancels = [...this._activeEditInputs.values(), ...this._activeReplyInputs.values()].map((input) => input.cancel);
    for (const cancel of cancels) {
      cancel();
    }
    return cancels.length > 0;
  }
  _setDraft(commentId, kind, text) {
    this._composerDraftState?.drafts.set(commentId, { kind, text });
  }
  _clearDraft(commentId) {
    if (!this._composerDraftState) {
      return;
    }
    this._composerDraftState.drafts.delete(commentId);
    if (this._composerDraftState.focusedCommentId === commentId) {
      this._composerDraftState.focusedCommentId = void 0;
    }
  }
  /**
   * Whether a composer should take focus: always for an explicit user action,
   * and for a restored draft only if it had focus when the widget was rebuilt.
   */
  _shouldFocusComposer(commentId, restoredText) {
    return restoredText === void 0 || this._composerDraftState?.focusedCommentId === commentId;
  }
  _focusComposer(textarea) {
    this._composerToFocus = textarea;
    if (textarea.isConnected) {
      this.restoreComposerFocus();
    }
  }
  _toggleExpanded() {
    if (this._isExpanded) {
      this.collapse();
    } else {
      this.expand();
    }
  }
  _updateTitle() {
    const count = this._commentItems.length;
    if (count === 1) {
      this._titleNode.textContent = this._commentItems[0].text;
    } else {
      this._titleNode.textContent = nls.localize("nComments", "{0} comments", count);
    }
  }
  _updateToggleButton() {
    clearNode(this._toggleButton);
    if (this._isExpanded) {
      this._toggleButton.appendChild(renderIcon(Codicon.chevronUp));
      this._toggleButton.title = nls.localize("collapse", "Collapse");
    } else {
      this._toggleButton.appendChild(renderIcon(Codicon.chevronDown));
      this._toggleButton.title = nls.localize("expand", "Expand");
    }
  }
  _buildFeedbackItems() {
    clearNode(this._bodyNode);
    this._itemElements.clear();
    this._activeReplyInputs.clear();
    this._activeEditInputs.clear();
    this._actionBarElements.clear();
    for (const comment of this._commentItems) {
      const item = $("div.agent-feedback-widget-item");
      item.classList.add(`agent-feedback-widget-item-${comment.source}`);
      if (comment.suggestion) {
        item.classList.add("agent-feedback-widget-item-suggestion");
      }
      this._itemElements.set(comment.id, item);
      const itemHeader = $("div.agent-feedback-widget-item-header");
      const itemMeta = $("div.agent-feedback-widget-item-meta");
      const lineInfo = $("span.agent-feedback-widget-line-info");
      if (comment.range.startLineNumber === comment.range.endLineNumber) {
        lineInfo.textContent = nls.localize("lineNumber", "Line {0}", comment.range.startLineNumber);
      } else {
        lineInfo.textContent = nls.localize("lineRange", "Lines {0}-{1}", comment.range.startLineNumber, comment.range.endLineNumber);
      }
      itemMeta.appendChild(lineInfo);
      const typeLabel = this._getTypeLabel(comment);
      if (typeLabel) {
        const typeBadge = $("span.agent-feedback-widget-item-type");
        typeBadge.textContent = typeLabel;
        itemMeta.appendChild(typeBadge);
      }
      itemHeader.appendChild(itemMeta);
      const actionBarContainer = $("div.agent-feedback-widget-item-actions");
      const actionBar = this._eventStore.add(new ActionBar(actionBarContainer));
      const itemActions = { editAction: void 0, removeAction: void 0, addReplyAction: void 0 };
      itemActions.addReplyAction = this._eventStore.add(new Action(
        "agentFeedback.widget.addReply",
        nls.localize("addToComment", "Add to Comment"),
        ThemeIcon.asClassName(Codicon.commentDiscussion),
        true,
        () => {
          this._startAddingReply(comment, item, itemActions);
        }
      ));
      actionBar.push(itemActions.addReplyAction, { icon: true, label: false });
      itemActions.editAction = this._eventStore.add(new Action(
        "agentFeedback.widget.edit",
        nls.localize("editComment", "Edit"),
        ThemeIcon.asClassName(Codicon.edit),
        true,
        () => {
          this._startEditing(comment, text, itemActions);
        }
      ));
      actionBar.push(itemActions.editAction, { icon: true, label: false });
      const showActionButtonsBar = comment.canConvertToAgentFeedback || comment.source === SessionEditorCommentSource.AgentFeedback && comment.state === AgentFeedbackState.Created;
      itemActions.removeAction = this._eventStore.add(new Action(
        "agentFeedback.widget.remove",
        nls.localize("removeComment", "Remove"),
        ThemeIcon.asClassName(Codicon.close),
        true,
        () => this._removeComment(comment)
      ));
      if (!showActionButtonsBar) {
        actionBar.push(itemActions.removeAction, { icon: true, label: false });
      }
      itemHeader.appendChild(actionBarContainer);
      item.appendChild(itemHeader);
      const text = $("div.agent-feedback-widget-text");
      const rendered = this._markdownRendererService.render(new MarkdownString(comment.text));
      this._eventStore.add(rendered);
      text.appendChild(rendered.element);
      item.appendChild(text);
      if (comment.suggestion?.edits.length) {
        item.appendChild(this._renderSuggestion(comment));
      }
      if (comment.replies?.length) {
        item.appendChild(this._renderReplies(comment.replies));
      }
      if (showActionButtonsBar) {
        this._renderActionButtons(comment, item);
      }
      this._eventStore.add(addDisposableListener(item, "mouseenter", () => {
        this._highlightRange(comment);
      }));
      this._eventStore.add(addDisposableListener(item, "mouseleave", () => {
        this._rangeHighlightDecoration.clear();
      }));
      this._eventStore.add(addDisposableListener(item, "click", (e) => {
        const target = e.target;
        if (target?.closest(".action-bar")) {
          return;
        }
        if (target?.closest(".agent-feedback-widget-add-reply")) {
          return;
        }
        if (isTextInputTarget(target)) {
          return;
        }
        if (target?.closest(".agent-feedback-widget-text, .agent-feedback-widget-suggestion-text, .agent-feedback-widget-reply-text")) {
          const selection = this._domNode.ownerDocument.defaultView?.getSelection();
          if (selection && !selection.isCollapsed && this._domNode.contains(selection.anchorNode)) {
            return;
          }
        }
        this.focusFeedback(comment.id);
        this._agentFeedbackService.setNavigationAnchor(this._sessionResource, comment.id);
        this._revealComment(comment);
      }));
      const onSelectableMousedown = (e) => {
        const target = e.target;
        if (isTextInputTarget(target)) {
          return;
        }
        if (target?.closest(".agent-feedback-widget-text, .agent-feedback-widget-suggestion-text, .agent-feedback-widget-reply-text")) {
          this._domNode.focus({ preventScroll: true });
        }
      };
      this._eventStore.add(addDisposableListener(item, "mousedown", onSelectableMousedown));
      this._bodyNode.appendChild(item);
      const draft = this._composerDraftState?.drafts.get(comment.id);
      if (draft?.kind === 1 /* Reply */) {
        this._startAddingReply(comment, item, itemActions, draft.text);
      } else if (draft?.kind === 0 /* Edit */) {
        this._startEditing(comment, text, itemActions, draft.text);
      }
    }
  }
  _getTypeLabel(comment) {
    switch (comment.kind) {
      case AgentFeedbackKind.PRReview:
        return nls.localize("prReviewComment", "PR Review");
      case AgentFeedbackKind.AgentReview:
        return nls.localize("agentReviewComment", "Agent Review");
      default:
        return void 0;
    }
  }
  _renderSuggestion(comment) {
    const suggestionNode = $("div.agent-feedback-widget-suggestion");
    for (const edit of comment.suggestion?.edits ?? []) {
      const editNode = $("div.agent-feedback-widget-suggestion-edit");
      const header = $("div.agent-feedback-widget-suggestion-header");
      if (edit.range.startLineNumber === edit.range.endLineNumber) {
        header.textContent = nls.localize("suggestedChangeLine", "Suggested Change \u2022 Line {0}", edit.range.startLineNumber);
      } else {
        header.textContent = nls.localize("suggestedChangeLines", "Suggested Change \u2022 Lines {0}-{1}", edit.range.startLineNumber, edit.range.endLineNumber);
      }
      editNode.appendChild(header);
      const newText = $("pre.agent-feedback-widget-suggestion-text");
      newText.textContent = edit.newText;
      editNode.appendChild(newText);
      suggestionNode.appendChild(editNode);
    }
    return suggestionNode;
  }
  _renderReplies(replies) {
    const repliesNode = $("div.agent-feedback-widget-replies");
    for (const reply of replies) {
      const replyNode = $("div.agent-feedback-widget-reply");
      const replyText = $("div.agent-feedback-widget-reply-text");
      const rendered = this._markdownRendererService.render(new MarkdownString(reply));
      this._eventStore.add(rendered);
      replyText.appendChild(rendered.element);
      replyNode.appendChild(replyText);
      repliesNode.appendChild(replyNode);
    }
    return repliesNode;
  }
  /**
   * Renders the Accept / Remove button bar shown at the bottom of a
   * `created` agent feedback comment or a PR review comment. Clicking either
   * button performs the action and removes the bar. For PR review comments
   * "Accept" converts the comment into agent feedback; for agent feedback it
   * marks the comment as accepted.
   */
  _renderActionButtons(comment, item) {
    const buttonBar = $("div.agent-feedback-widget-actions-bar");
    const buttonStore = new DisposableStore();
    this._eventStore.add(buttonStore);
    buttonStore.add(addDisposableListener(buttonBar, "click", (e) => e.stopPropagation()));
    const dismiss = () => {
      buttonStore.dispose();
      buttonBar.remove();
      this._actionBarElements.delete(comment.id);
      this._domNode.focus({ preventScroll: true });
      this._editor.layoutOverlayWidget(this);
    };
    const isPRComment = comment.source === SessionEditorCommentSource.PRReview;
    const acceptTooltip = isPRComment ? nls.localize("acceptPRFeedbackTooltip", "Share PR comment with agent") : nls.localize("acceptAgentFeedbackTooltip", "Share comment with agent");
    const deleteTooltip = isPRComment ? nls.localize("deletePRFeedbackTooltip", "Remove and mark as resolved on GitHub") : nls.localize("deleteAgentFeedbackTooltip", "Remove agent comment");
    const acceptButton = buttonStore.add(new Button(buttonBar, {
      title: acceptTooltip,
      buttonBackground: "var(--vscode-charts-purple)",
      buttonHoverBackground: "color-mix(in srgb, var(--vscode-charts-purple) 85%, var(--vscode-foreground))",
      buttonForeground: "var(--vscode-button-foreground)",
      buttonBorder: "var(--vscode-charts-purple)"
    }));
    acceptButton.label = nls.localize("acceptFeedbackButton", "Accept");
    buttonStore.add(acceptButton.onDidClick(() => {
      if (comment.canConvertToAgentFeedback) {
        this._convertToAgentFeedback(comment);
      } else {
        this._acceptFeedback(comment);
      }
      dismiss();
    }));
    const deleteButton = buttonStore.add(new Button(buttonBar, {
      title: deleteTooltip,
      secondary: true,
      buttonSecondaryBackground: "var(--vscode-button-secondaryBackground)",
      buttonSecondaryHoverBackground: "var(--vscode-button-secondaryHoverBackground)",
      buttonSecondaryForeground: "var(--vscode-button-secondaryForeground)",
      buttonSecondaryBorder: "var(--vscode-button-secondaryBorder)"
    }));
    deleteButton.label = nls.localize("deleteFeedbackButton", "Delete");
    buttonStore.add(deleteButton.onDidClick(() => {
      this._removeComment(comment);
      dismiss();
    }));
    item.appendChild(buttonBar);
    this._actionBarElements.set(comment.id, buttonBar);
  }
  _removeComment(comment) {
    if (comment.source === SessionEditorCommentSource.PRReview) {
      this._codeReviewService.resolvePRReviewThread(this._sessionResource, comment.sourceId);
      return;
    }
    this._agentFeedbackService.removeFeedback(this._sessionResource, comment.sourceId);
  }
  _startEditing(comment, textContainer, actions, restoredText) {
    const existing = this._activeEditInputs.get(comment.id);
    if (existing) {
      existing.textarea.focus();
      return;
    }
    actions.editAction.enabled = false;
    actions.removeAction.enabled = false;
    actions.addReplyAction.enabled = false;
    const editStore = new DisposableStore();
    this._eventStore.add(editStore);
    clearNode(textContainer);
    textContainer.classList.add("editing");
    const textarea = $("textarea.agent-feedback-widget-edit-textarea");
    textarea.value = restoredText ?? comment.text;
    textarea.rows = 1;
    textContainer.appendChild(textarea);
    this._activeEditInputs.set(comment.id, {
      textarea,
      cancel: () => this._stopEditing(comment, textContainer, editStore, actions)
    });
    this._setDraft(comment.id, 0 /* Edit */, textarea.value);
    const autoSize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      this._editor.layoutOverlayWidget(this);
    };
    autoSize();
    editStore.add(addDisposableListener(textarea, "input", () => {
      this._setDraft(comment.id, 0 /* Edit */, textarea.value);
      autoSize();
    }));
    editStore.add(addStandardDisposableListener(textarea, "keydown", (e) => {
      if (e.keyCode === KeyCode.Enter && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const newText = textarea.value.trim();
        if (newText) {
          this._clearDraft(comment.id);
          this._saveEdit(comment, newText);
        } else {
          this._stopEditing(comment, textContainer, editStore, actions);
        }
      } else if (e.keyCode === KeyCode.Escape) {
        e.preventDefault();
        e.stopPropagation();
        this._stopEditing(comment, textContainer, editStore, actions);
      }
    }));
    if (this._shouldFocusComposer(comment.id, restoredText)) {
      this._focusComposer(textarea);
    }
  }
  _startAddingReply(comment, itemNode, actions, restoredText) {
    const existing = this._activeReplyInputs.get(comment.id);
    if (existing) {
      existing.textarea.focus();
      return;
    }
    actions.editAction.enabled = false;
    actions.removeAction.enabled = false;
    actions.addReplyAction.enabled = false;
    const replyStore = new DisposableStore();
    this._eventStore.add(replyStore);
    const replyContainer = $("div.agent-feedback-widget-add-reply");
    const textarea = $("textarea.agent-feedback-widget-edit-textarea");
    textarea.placeholder = nls.localize("addReplyPlaceholder", "Add a comment\u2026");
    textarea.rows = 1;
    if (restoredText !== void 0) {
      textarea.value = restoredText;
    }
    replyContainer.appendChild(textarea);
    const actionsBar = this._actionBarElements.get(comment.id);
    if (actionsBar) {
      itemNode.insertBefore(replyContainer, actionsBar);
    } else {
      itemNode.appendChild(replyContainer);
    }
    this._activeReplyInputs.set(comment.id, { textarea, cancel: () => cleanup() });
    this._setDraft(comment.id, 1 /* Reply */, textarea.value);
    const autoSize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      this._editor.layoutOverlayWidget(this);
    };
    autoSize();
    replyStore.add(addDisposableListener(textarea, "input", () => {
      this._setDraft(comment.id, 1 /* Reply */, textarea.value);
      autoSize();
    }));
    const cleanup = () => {
      replyStore.dispose();
      actions.editAction.enabled = true;
      actions.removeAction.enabled = true;
      actions.addReplyAction.enabled = true;
      this._activeReplyInputs.delete(comment.id);
      replyContainer.remove();
      this._clearDraft(comment.id);
      this._editor.layoutOverlayWidget(this);
    };
    replyStore.add(addStandardDisposableListener(textarea, "keydown", (e) => {
      if (e.keyCode === KeyCode.Enter && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const newReply = textarea.value.trim();
        if (newReply) {
          this._clearDraft(comment.id);
          this._saveReply(comment, newReply);
        } else {
          cleanup();
        }
      } else if (e.keyCode === KeyCode.Escape) {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
      }
    }));
    if (this._shouldFocusComposer(comment.id, restoredText)) {
      this._focusComposer(textarea);
    }
  }
  /**
   * Focuses the composer restored from a draft, if any. Must be called once the
   * widget is in the DOM — focusing a detached element has no effect.
   */
  restoreComposerFocus() {
    const textarea = this._composerToFocus;
    this._composerToFocus = void 0;
    if (!textarea) {
      return;
    }
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }
  _saveReply(comment, replyText) {
    if (comment.source === SessionEditorCommentSource.AgentFeedback) {
      this._agentFeedbackService.addReply(this._sessionResource, comment.sourceId, replyText);
      return;
    }
    if (!comment.canConvertToAgentFeedback) {
      return;
    }
    const feedback = this._agentFeedbackService.addFeedback(
      this._sessionResource,
      comment.resourceUri,
      comment.range,
      comment.text,
      comment.suggestion,
      createAgentFeedbackContext(this._editor, this._codeEditorService, comment.resourceUri, comment.range),
      comment.sourceId,
      AgentFeedbackKind.PRReview
    );
    this._agentFeedbackService.addReply(this._sessionResource, feedback.id, replyText);
    this._agentFeedbackService.setNavigationAnchor(this._sessionResource, toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, feedback.id));
    this._codeReviewService.markPRReviewCommentConverted(this._sessionResource, comment.sourceId);
  }
  _saveEdit(comment, newText) {
    if (comment.source === SessionEditorCommentSource.AgentFeedback) {
      this._agentFeedbackService.updateFeedback(this._sessionResource, comment.sourceId, newText);
    } else {
      this._convertToAgentFeedbackWithText(comment, newText);
    }
  }
  _stopEditing(comment, textContainer, editStore, actions) {
    editStore.dispose();
    this._activeEditInputs.delete(comment.id);
    this._clearDraft(comment.id);
    actions.editAction.enabled = true;
    actions.removeAction.enabled = true;
    actions.addReplyAction.enabled = true;
    textContainer.classList.remove("editing");
    clearNode(textContainer);
    const rendered = this._markdownRendererService.render(new MarkdownString(comment.text));
    this._eventStore.add(rendered);
    textContainer.appendChild(rendered.element);
    this._editor.layoutOverlayWidget(this);
  }
  _convertToAgentFeedback(comment) {
    this._convertToAgentFeedbackWithText(comment, comment.text);
  }
  /**
   * Accept a Created agent feedback item so it becomes submittable.
   */
  _acceptFeedback(comment) {
    if (comment.source !== SessionEditorCommentSource.AgentFeedback) {
      return;
    }
    this._agentFeedbackService.acceptFeedback(this._sessionResource, comment.sourceId);
    this._agentFeedbackService.setNavigationAnchor(this._sessionResource, comment.id);
  }
  /**
   * Converts a non-agent-feedback comment into an agent feedback item, optionally with edited text.
   */
  _convertToAgentFeedbackWithText(comment, text) {
    if (!comment.canConvertToAgentFeedback) {
      return;
    }
    const feedback = this._agentFeedbackService.addFeedback(
      this._sessionResource,
      comment.resourceUri,
      comment.range,
      text,
      comment.suggestion,
      createAgentFeedbackContext(this._editor, this._codeEditorService, comment.resourceUri, comment.range),
      comment.sourceId,
      AgentFeedbackKind.PRReview
    );
    this._agentFeedbackService.setNavigationAnchor(this._sessionResource, toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, feedback.id));
    this._codeReviewService.markPRReviewCommentConverted(this._sessionResource, comment.sourceId);
  }
  /**
   * Expand the widget body.
   */
  expand() {
    const wasExpanded = this._isExpanded;
    this._isExpanded = true;
    this._domNode.classList.remove("collapsed");
    this._bodyNode.classList.remove("collapsed");
    this._updateToggleButton();
    this._editor.layoutOverlayWidget(this);
    if (!wasExpanded) {
      this._onDidExpand.fire();
    }
  }
  get isExpanded() {
    return this._isExpanded;
  }
  /**
   * Collapse the widget body.
   */
  collapse() {
    this._isExpanded = false;
    this._domNode.classList.add("collapsed");
    this._bodyNode.classList.add("collapsed");
    this._updateToggleButton();
    this.clearFocus();
    this._editor.layoutOverlayWidget(this);
  }
  /**
   * Focus a specific feedback item within this widget.
   * Highlights its range in the editor and marks it as focused.
   */
  focusFeedback(feedbackId) {
    for (const el of this._itemElements.values()) {
      el.classList.remove("focused");
    }
    const feedback = this._commentItems.find((f) => f.id === feedbackId);
    if (!feedback) {
      return;
    }
    const itemEl = this._itemElements.get(feedbackId);
    itemEl?.classList.add("focused");
    this._highlightRange(feedback);
  }
  /**
   * Clear focus state and range highlighting.
   */
  clearFocus() {
    for (const el of this._itemElements.values()) {
      el.classList.remove("focused");
    }
    this._rangeHighlightDecoration.clear();
  }
  _highlightRange(feedback) {
    const endLineNumber = feedback.range.endLineNumber;
    const range = new Range(
      feedback.range.startLineNumber,
      1,
      endLineNumber,
      this._editor.getModel()?.getLineMaxColumn(endLineNumber) ?? 1
    );
    this._rangeHighlightDecoration.set([
      {
        range,
        options: {
          description: "agent-feedback-range-highlight",
          className: "rangeHighlight",
          isWholeLine: true,
          linesDecorationsClassName: "agent-feedback-widget-range-glyph"
        }
      },
      {
        range,
        options: {
          description: "agent-feedback-range-highlight-overview",
          overviewRuler: {
            color: themeColorFromId(overviewRulerRangeHighlight),
            position: OverviewRulerLane.Full
          }
        }
      }
    ]);
  }
  /**
   * Returns true if this widget contains the given feedback item (by id).
   */
  containsFeedback(feedbackId) {
    return this._commentItems.some((f) => f.id === feedbackId);
  }
  /**
   * Returns the comment id whose open composer is the given element, or
   * `undefined` if none. Lets the contribution restore focus after a rebuild.
   */
  findComposerCommentIdForElement(element) {
    for (const [commentId, { textarea }] of [...this._activeEditInputs, ...this._activeReplyInputs]) {
      if (textarea === element) {
        return commentId;
      }
    }
    return void 0;
  }
  /**
   * Ids of the comments rendered by this widget. Used by the contribution
   * to prune draft state for comments that no longer exist.
   */
  getCommentIds() {
    return this._commentItems.map((comment) => comment.id);
  }
  /**
   * Updates the widget position and layout.
   */
  layout(startLineNumber) {
    if (this._disposed) {
      return;
    }
    if (startLineNumber !== this._startLineNumber) {
      this._cachedMinContentWidth = void 0;
    }
    this._startLineNumber = startLineNumber;
    const lineHeight = this._editor.getOption(EditorOption.lineHeight);
    const { contentLeft, contentWidth, verticalScrollbarWidth } = this._editor.getLayoutInfo();
    const scrollTop = this._editor.getScrollTop();
    const widgetWidth = getTotalWidth(this._domNode) || 280;
    const widgetHeight = this._domNode.offsetHeight || 0;
    const headerHeight = this._headerNode.offsetHeight || lineHeight;
    const contentRelativeTop = this._editor.getTopForLineNumber(startLineNumber) + (lineHeight - headerHeight) / 2;
    const scrollHeight = this._editor.getScrollHeight();
    const clampedContentTop = Math.min(Math.max(0, contentRelativeTop), Math.max(0, scrollHeight - widgetHeight));
    this._position = {
      stackOrdinal: 2,
      preference: {
        top: clampedContentTop - scrollTop,
        left: contentLeft + contentWidth - (2 * verticalScrollbarWidth + widgetWidth)
      }
    };
    this._editor.layoutOverlayWidget(this);
  }
  /**
   * Shows or hides the widget.
   */
  toggle(show) {
    this._domNode.classList.toggle("visible", show);
    if (show && this._commentItems.length > 0) {
      this.layout(this._commentItems[0].range.startLineNumber);
    }
  }
  /**
   * Relayouts the widget at its current line number.
   */
  relayout() {
    if (this._startLineNumber) {
      this.layout(this._startLineNumber);
    }
  }
  // IOverlayWidget implementation
  getId() {
    return this._id;
  }
  getDomNode() {
    return this._domNode;
  }
  getPosition() {
    return this._position;
  }
  /**
   * Reserve enough horizontal scroll width so the user can always scroll the
   * editor content out from underneath the widget. The widget is anchored to
   * the right edge of the editor content area, so without this reservation any
   * line that extends under the widget cannot be revealed because the editor
   * cannot scroll past its longest line.
   *
   * The reserved width is the widget width plus the widest content among the
   * anchored line and the lines immediately above and below it. The result is
   * computed once using the real rendered widget width and cached afterwards.
   * Until the widget DOM node has a real width we fall back to an estimate and
   * skip caching so the value is recomputed once it is actually rendered. The
   * cache is also invalidated by `layout` whenever the anchor line changes.
   */
  getMinContentWidthInPx() {
    if (this._disposed) {
      return 0;
    }
    if (this._cachedMinContentWidth !== void 0) {
      return this._cachedMinContentWidth;
    }
    const model = this._editor.getModel();
    if (!model) {
      return 0;
    }
    const renderedWidth = getTotalWidth(this._domNode);
    const hasRenderedWidth = renderedWidth > 0;
    const widgetWidth = hasRenderedWidth ? renderedWidth : AgentFeedbackEditorWidget._estimatedWidgetWidth;
    const lineCount = model.getLineCount();
    let maxLineWidth = 0;
    let measuredAnyLine = false;
    for (let lineNumber = this._startLineNumber - 1; lineNumber <= this._startLineNumber + 1; lineNumber++) {
      if (lineNumber < 1 || lineNumber > lineCount) {
        continue;
      }
      const lineWidth = this._editor.getWidthOfLine(lineNumber);
      if (lineWidth < 0) {
        continue;
      }
      measuredAnyLine = true;
      if (lineWidth > maxLineWidth) {
        maxLineWidth = lineWidth;
      }
    }
    const { verticalScrollbarWidth } = this._editor.getLayoutInfo();
    const result = maxLineWidth + widgetWidth + 2 * verticalScrollbarWidth;
    if (hasRenderedWidth && measuredAnyLine) {
      this._cachedMinContentWidth = result;
    }
    return result;
  }
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._rangeHighlightDecoration.clear();
    this._editor.removeOverlayWidget(this);
    super.dispose();
  }
  _revealComment(comment) {
    const range = new Range(
      comment.range.startLineNumber,
      1,
      comment.range.endLineNumber,
      this._editor.getModel()?.getLineMaxColumn(comment.range.endLineNumber) ?? 1
    );
    this._editor.revealRangeInCenterIfOutsideViewport(range, ScrollType.Smooth);
  }
};
AgentFeedbackEditorWidget._idPool = 0;
/**
 * Estimated widget width in px used while the widget DOM node has not been
 * laid out yet. Matches the `max-width` of `.agent-feedback-widget` so we
 * reserve enough scroll space up front; the real width replaces it once the
 * node is rendered.
 */
AgentFeedbackEditorWidget._estimatedWidgetWidth = 280;
AgentFeedbackEditorWidget = __decorateClass([
  __decorateParam(4, IAgentFeedbackService),
  __decorateParam(5, ICodeReviewService),
  __decorateParam(6, IMarkdownRendererService),
  __decorateParam(7, ICodeEditorService)
], AgentFeedbackEditorWidget);
export {
  AgentFeedbackEditorWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYWdlbnRGZWVkYmFjay9icm93c2VyL2FnZW50RmVlZGJhY2tFZGl0b3JXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYWdlbnRGZWVkYmFja0VkaXRvcldpZGdldC5jc3MnO1xuXG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyLCBjbGVhck5vZGUsIGdldFRvdGFsV2lkdGgsIGlzSFRNTEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSU92ZXJsYXlXaWRnZXQsIElPdmVybGF5V2lkZ2V0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgb3ZlcnZpZXdSdWxlclJhbmdlSGlnaGxpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRvckNvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiwgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IE92ZXJ2aWV3UnVsZXJMYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyB0aGVtZUNvbG9yRnJvbUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29kZVJldmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb2RlUmV2aWV3L2Jyb3dzZXIvY29kZVJldmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWdlbnRGZWVkYmFja0NvbnRleHQgfSBmcm9tICcuL2FnZW50RmVlZGJhY2tFZGl0b3JVdGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudEZlZWRiYWNrS2luZCwgQWdlbnRGZWVkYmFja1N0YXRlLCBJQWdlbnRGZWVkYmFja1NlcnZpY2UgfSBmcm9tICcuL2FnZW50RmVlZGJhY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRWRpdG9yQ29tbWVudCwgU2Vzc2lvbkVkaXRvckNvbW1lbnRTb3VyY2UsIHRvU2Vzc2lvbkVkaXRvckNvbW1lbnRJZCB9IGZyb20gJy4vc2Vzc2lvbkVkaXRvckNvbW1lbnRzLmpzJztcblxuaW50ZXJmYWNlIElDb21tZW50SXRlbUFjdGlvbnMge1xuXHRlZGl0QWN0aW9uOiBBY3Rpb247XG5cdHJlbW92ZUFjdGlvbjogQWN0aW9uO1xuXHRhZGRSZXBseUFjdGlvbjogQWN0aW9uO1xufVxuXG4vKipcbiAqIEFuIG9wZW4gZWRpdCBvciByZXBseSBjb21wb3Nlci4gYGNhbmNlbGAgY2xvc2VzIGl0IGFuZCByZXN0b3JlcyB0aGUgaXRlbS5cbiAqL1xuaW50ZXJmYWNlIElBY3RpdmVJbnB1dCB7XG5cdHJlYWRvbmx5IHRleHRhcmVhOiBIVE1MVGV4dEFyZWFFbGVtZW50O1xuXHRyZWFkb25seSBjYW5jZWw6ICgpID0+IHZvaWQ7XG59XG5cbi8qKlxuICogV2hldGhlciB0aGUgZXZlbnQgdGFyZ2V0IGxpdmVzIGluc2lkZSBvbmUgb2YgdGhlIHdpZGdldCdzIHRleHQgaW5wdXRzLCB3aGVyZVxuICogbW91c2UgaW50ZXJhY3Rpb25zIG11c3QgYmUgbGVmdCB0byB0aGUgYnJvd3NlciBzbyB0aGUgY2FyZXQgY2FuIGJlIHBsYWNlZC5cbiAqL1xuZnVuY3Rpb24gaXNUZXh0SW5wdXRUYXJnZXQodGFyZ2V0OiBFdmVudFRhcmdldCB8IG51bGwpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzSFRNTEVsZW1lbnQodGFyZ2V0KSAmJiB0YXJnZXQuY2xvc2VzdCgndGV4dGFyZWEsIGlucHV0JykgIT09IG51bGw7XG59XG5cbmNvbnN0IGVudW0gQ29tcG9zZXJLaW5kIHtcblx0RWRpdCxcblx0UmVwbHksXG59XG5cbi8qKlxuICogSW4tcHJvZ3Jlc3MgdGV4dCBvZiBhIHNpbmdsZSBvcGVuIGNvbXBvc2VyLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDb21wb3NlckRyYWZ0IHtcblx0cmVhZG9ubHkga2luZDogQ29tcG9zZXJLaW5kO1xuXHRyZWFkb25seSB0ZXh0OiBzdHJpbmc7XG59XG5cbi8qKlxuICogU2hhcmVkIGNvbXBvc2VyIHN0YXRlIHRoYXQgc3Vydml2ZXMgd2lkZ2V0IHJlYnVpbGRzLiBUaGUgY29udHJpYnV0aW9uIG93bnMgdGhlXG4gKiBzaW5nbGUgaW5zdGFuY2UgYW5kIGhhbmRzIGl0IHRvIGVhY2ggd2lkZ2V0IHNvIGRyYWZ0cyAoYW5kIGZvY3VzKSBhcmUgbm90IGxvc3RcbiAqIHdoZW4gd2lkZ2V0cyBhcmUgcmVjcmVhdGVkIGluIHJlc3BvbnNlIHRvIHVucmVsYXRlZCBmZWVkYmFjayAvIHJldmlldyBjaGFuZ2VzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDb21wb3NlckRyYWZ0U3RhdGUge1xuXHRyZWFkb25seSBkcmFmdHM6IE1hcDxzdHJpbmcsIElDb21wb3NlckRyYWZ0Pjtcblx0Zm9jdXNlZENvbW1lbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFdpZGdldCB0aGF0IGRpc3BsYXlzIGFnZW50IGZlZWRiYWNrIGNvbW1lbnRzIGZvciBhIGdyb3VwIG9mIG5lYXJieSBmZWVkYmFjayBpdGVtcy5cbiAqIFBvc2l0aW9uZWQgb24gdGhlIHJpZ2h0IHNpZGUgb2YgdGhlIGVkaXRvciBsaWtlIGEgc3BlZWNoIGJ1YmJsZS5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50RmVlZGJhY2tFZGl0b3JXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU92ZXJsYXlXaWRnZXQge1xuXG5cdHByaXZhdGUgc3RhdGljIF9pZFBvb2wgPSAwO1xuXG5cdC8qKlxuXHQgKiBFc3RpbWF0ZWQgd2lkZ2V0IHdpZHRoIGluIHB4IHVzZWQgd2hpbGUgdGhlIHdpZGdldCBET00gbm9kZSBoYXMgbm90IGJlZW5cblx0ICogbGFpZCBvdXQgeWV0LiBNYXRjaGVzIHRoZSBgbWF4LXdpZHRoYCBvZiBgLmFnZW50LWZlZWRiYWNrLXdpZGdldGAgc28gd2Vcblx0ICogcmVzZXJ2ZSBlbm91Z2ggc2Nyb2xsIHNwYWNlIHVwIGZyb250OyB0aGUgcmVhbCB3aWR0aCByZXBsYWNlcyBpdCBvbmNlIHRoZVxuXHQgKiBub2RlIGlzIHJlbmRlcmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2VzdGltYXRlZFdpZGdldFdpZHRoID0gMjgwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lkOiBzdHJpbmcgPSBgYWdlbnQtZmVlZGJhY2std2lkZ2V0LSR7QWdlbnRGZWVkYmFja0VkaXRvcldpZGdldC5faWRQb29sKyt9YDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfaGVhZGVyTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpdGxlTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RvZ2dsZUJ1dHRvbjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2JvZHlOb2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfaXRlbUVsZW1lbnRzID0gbmV3IE1hcDxzdHJpbmcsIEhUTUxFbGVtZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVSZXBseUlucHV0cyA9IG5ldyBNYXA8c3RyaW5nLCBJQWN0aXZlSW5wdXQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUVkaXRJbnB1dHMgPSBuZXcgTWFwPHN0cmluZywgSUFjdGl2ZUlucHV0PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3Rpb25CYXJFbGVtZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBIVE1MRWxlbWVudD4oKTtcblxuXHRwcml2YXRlIF9wb3NpdGlvbjogSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9jb21wb3NlclRvRm9jdXM6IEhUTUxUZXh0QXJlYUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzRXhwYW5kZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfZGlzcG9zZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIgPSAxO1xuXHRwcml2YXRlIF9jYWNoZWRNaW5Db250ZW50V2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcmFuZ2VIaWdobGlnaHREZWNvcmF0aW9uOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V2ZW50U3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRXhwYW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRXhwYW5kOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRXhwYW5kLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29tbWVudEl0ZW1zOiByZWFkb25seSBJU2Vzc2lvbkVkaXRvckNvbW1lbnRbXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb21wb3NlckRyYWZ0U3RhdGU6IElDb21wb3NlckRyYWZ0U3RhdGUgfCB1bmRlZmluZWQsXG5cdFx0QElBZ2VudEZlZWRiYWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hZ2VudEZlZWRiYWNrU2VydmljZTogSUFnZW50RmVlZGJhY2tTZXJ2aWNlLFxuXHRcdEBJQ29kZVJldmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29kZVJldmlld1NlcnZpY2U6IElDb2RlUmV2aWV3U2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmFuZ2VIaWdobGlnaHREZWNvcmF0aW9uID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXG5cdFx0Ly8gQ3JlYXRlIERPTSBzdHJ1Y3R1cmVcblx0XHR0aGlzLl9kb21Ob2RlID0gJCgnZGl2LmFnZW50LWZlZWRiYWNrLXdpZGdldCcpO1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY29sbGFwc2VkJyk7XG5cdFx0Ly8gTWFrZSBmb2N1c2FibGUgc28gdGhhdCBtb3VzZWRvd24gaW4gc2VsZWN0YWJsZSByZWdpb25zIGNhbiBwdWxsIGZvY3VzXG5cdFx0Ly8gYXdheSBmcm9tIHRoZSBlZGl0b3IncyB0ZXh0YXJlYSwgYWxsb3dpbmcgbmF0aXZlIEN0cmwvQ21kK0MgdG8gY29weVxuXHRcdC8vIHRoZSBET00gc2VsZWN0aW9uIG9mIHRoZSBjb21tZW50IGNvbnRlbnQuXG5cdFx0dGhpcy5fZG9tTm9kZS50YWJJbmRleCA9IC0xO1xuXG5cdFx0Ly8gSGVhZGVyXG5cdFx0dGhpcy5faGVhZGVyTm9kZSA9ICQoJ2Rpdi5hZ2VudC1mZWVkYmFjay13aWRnZXQtaGVhZGVyJyk7XG5cblx0XHQvLyBDb21tZW50IGljb24gKGRlY29yYXRpdmUsIGhpZGRlbiBmcm9tIHNjcmVlbiByZWFkZXJzKVxuXHRcdGNvbnN0IGNvbW1lbnRJY29uID0gcmVuZGVySWNvbihDb2RpY29uLmNvbW1lbnQpO1xuXHRcdGNvbW1lbnRJY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdHRoaXMuX2hlYWRlck5vZGUuYXBwZW5kQ2hpbGQoY29tbWVudEljb24pO1xuXG5cdFx0Ly8gVGl0bGUgc2hvd2luZyBmZWVkYmFjayBjb3VudFxuXHRcdHRoaXMuX3RpdGxlTm9kZSA9ICQoJ3NwYW4uYWdlbnQtZmVlZGJhY2std2lkZ2V0LXRpdGxlJyk7XG5cdFx0dGhpcy5fdXBkYXRlVGl0bGUoKTtcblx0XHR0aGlzLl9oZWFkZXJOb2RlLmFwcGVuZENoaWxkKHRoaXMuX3RpdGxlTm9kZSk7XG5cblx0XHQvLyBTcGFjZXJcblx0XHR0aGlzLl9oZWFkZXJOb2RlLmFwcGVuZENoaWxkKCQoJ3NwYW4uYWdlbnQtZmVlZGJhY2std2lkZ2V0LXNwYWNlcicpKTtcblxuXHRcdC8vIFRvZ2dsZSBleHBhbmQvY29sbGFwc2UgYnV0dG9uXG5cdFx0dGhpcy5fdG9nZ2xlQnV0dG9uID0gJCgnZGl2LmFnZW50LWZlZWRiYWNrLXdpZGdldC10b2dnbGUnKTtcblx0XHR0aGlzLl91cGRhdGVUb2dnbGVCdXR0b24oKTtcblx0XHR0aGlzLl9oZWFkZXJOb2RlLmFwcGVuZENoaWxkKHRoaXMuX3RvZ2dsZUJ1dHRvbik7XG5cblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2hlYWRlck5vZGUpO1xuXG5cdFx0Ly8gQm9keSAoY29sbGFwc2libGUpIFx1MjAxNCBzdGFydHMgY29sbGFwc2VkXG5cdFx0dGhpcy5fYm9keU5vZGUgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2std2lkZ2V0LWJvZHknKTtcblx0XHR0aGlzLl9ib2R5Tm9kZS5jbGFzc0xpc3QuYWRkKCdjb2xsYXBzZWQnKTtcblx0XHR0aGlzLl9idWlsZEZlZWRiYWNrSXRlbXMoKTtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2JvZHlOb2RlKTtcblxuXHRcdC8vIEFycm93IHBvaW50ZXJcblx0XHRjb25zdCBhcnJvdyA9ICQoJ2Rpdi5hZ2VudC1mZWVkYmFjay13aWRnZXQtYXJyb3cnKTtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKGFycm93KTtcblxuXHRcdC8vIEV2ZW50IGhhbmRsZXJzXG5cdFx0dGhpcy5fc2V0dXBFdmVudEhhbmRsZXJzKCk7XG5cblx0XHQvLyBBZGQgdmlzaWJsZSBjbGFzcyBmb3IgaW5pdGlhbCBkaXNwbGF5XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCd2aXNpYmxlJyk7XG5cblx0XHQvLyBBZGQgdG8gZWRpdG9yXG5cdFx0dGhpcy5fZWRpdG9yLmFkZE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXR1cEV2ZW50SGFuZGxlcnMoKTogdm9pZCB7XG5cdFx0Ly8gVG9nZ2xlIGJ1dHRvbiBjbGljayAtIGV4cGFuZC9jb2xsYXBzZVxuXHRcdHRoaXMuX2V2ZW50U3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl90b2dnbGVCdXR0b24sICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5fdG9nZ2xlRXhwYW5kZWQoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBIZWFkZXIgY2xpY2sgLSBhbHNvIHRvZ2dsZXMgZXhwYW5kL2NvbGxhcHNlXG5cdFx0dGhpcy5fZXZlbnRTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2hlYWRlck5vZGUsICdjbGljaycsICgpID0+IHtcblx0XHRcdHRoaXMuX3RvZ2dsZUV4cGFuZGVkKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRXNjYXBlIGluc2lkZSBhIHRleHRhcmVhIGlzIGhhbmRsZWQgdGhlcmUgYW5kIHN0b3BzIHByb3BhZ2F0aW5nLCBzbyB0aGlzIG9ubHkgZmlyZXMgZnJvbSB0aGUgd2lkZ2V0IGNocm9tZS5cblx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kb21Ob2RlLCAna2V5ZG93bicsIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5rZXlDb2RlICE9PSBLZXlDb2RlLkVzY2FwZSB8fCAhdGhpcy5fY2FuY2VsQWN0aXZlSW5wdXRzKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2xvc2VzIGV2ZXJ5IG9wZW4gZWRpdCAvIHJlcGx5IGNvbXBvc2VyLiBSZXR1cm5zIHdoZXRoZXIgYW55IHdhcyBvcGVuLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2FuY2VsQWN0aXZlSW5wdXRzKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNhbmNlbHMgPSBbLi4udGhpcy5fYWN0aXZlRWRpdElucHV0cy52YWx1ZXMoKSwgLi4udGhpcy5fYWN0aXZlUmVwbHlJbnB1dHMudmFsdWVzKCldLm1hcChpbnB1dCA9PiBpbnB1dC5jYW5jZWwpO1xuXHRcdGZvciAoY29uc3QgY2FuY2VsIG9mIGNhbmNlbHMpIHtcblx0XHRcdGNhbmNlbCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gY2FuY2Vscy5sZW5ndGggPiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RHJhZnQoY29tbWVudElkOiBzdHJpbmcsIGtpbmQ6IENvbXBvc2VyS2luZCwgdGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY29tcG9zZXJEcmFmdFN0YXRlPy5kcmFmdHMuc2V0KGNvbW1lbnRJZCwgeyBraW5kLCB0ZXh0IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJEcmFmdChjb21tZW50SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29tcG9zZXJEcmFmdFN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NvbXBvc2VyRHJhZnRTdGF0ZS5kcmFmdHMuZGVsZXRlKGNvbW1lbnRJZCk7XG5cdFx0aWYgKHRoaXMuX2NvbXBvc2VyRHJhZnRTdGF0ZS5mb2N1c2VkQ29tbWVudElkID09PSBjb21tZW50SWQpIHtcblx0XHRcdHRoaXMuX2NvbXBvc2VyRHJhZnRTdGF0ZS5mb2N1c2VkQ29tbWVudElkID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIGEgY29tcG9zZXIgc2hvdWxkIHRha2UgZm9jdXM6IGFsd2F5cyBmb3IgYW4gZXhwbGljaXQgdXNlciBhY3Rpb24sXG5cdCAqIGFuZCBmb3IgYSByZXN0b3JlZCBkcmFmdCBvbmx5IGlmIGl0IGhhZCBmb2N1cyB3aGVuIHRoZSB3aWRnZXQgd2FzIHJlYnVpbHQuXG5cdCAqL1xuXHRwcml2YXRlIF9zaG91bGRGb2N1c0NvbXBvc2VyKGNvbW1lbnRJZDogc3RyaW5nLCByZXN0b3JlZFRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiByZXN0b3JlZFRleHQgPT09IHVuZGVmaW5lZCB8fCB0aGlzLl9jb21wb3NlckRyYWZ0U3RhdGU/LmZvY3VzZWRDb21tZW50SWQgPT09IGNvbW1lbnRJZDtcblx0fVxuXG5cdHByaXZhdGUgX2ZvY3VzQ29tcG9zZXIodGV4dGFyZWE6IEhUTUxUZXh0QXJlYUVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21wb3NlclRvRm9jdXMgPSB0ZXh0YXJlYTtcblx0XHRpZiAodGV4dGFyZWEuaXNDb25uZWN0ZWQpIHtcblx0XHRcdHRoaXMucmVzdG9yZUNvbXBvc2VyRm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90b2dnbGVFeHBhbmRlZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNFeHBhbmRlZCkge1xuXHRcdFx0dGhpcy5jb2xsYXBzZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmV4cGFuZCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRpdGxlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvdW50ID0gdGhpcy5fY29tbWVudEl0ZW1zLmxlbmd0aDtcblx0XHRpZiAoY291bnQgPT09IDEpIHtcblx0XHRcdHRoaXMuX3RpdGxlTm9kZS50ZXh0Q29udGVudCA9IHRoaXMuX2NvbW1lbnRJdGVtc1swXS50ZXh0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90aXRsZU5vZGUudGV4dENvbnRlbnQgPSBubHMubG9jYWxpemUoJ25Db21tZW50cycsIFwiezB9IGNvbW1lbnRzXCIsIGNvdW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUb2dnbGVCdXR0b24oKTogdm9pZCB7XG5cdFx0Y2xlYXJOb2RlKHRoaXMuX3RvZ2dsZUJ1dHRvbik7XG5cdFx0aWYgKHRoaXMuX2lzRXhwYW5kZWQpIHtcblx0XHRcdHRoaXMuX3RvZ2dsZUJ1dHRvbi5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uY2hldnJvblVwKSk7XG5cdFx0XHR0aGlzLl90b2dnbGVCdXR0b24udGl0bGUgPSBubHMubG9jYWxpemUoJ2NvbGxhcHNlJywgXCJDb2xsYXBzZVwiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdG9nZ2xlQnV0dG9uLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5jaGV2cm9uRG93bikpO1xuXHRcdFx0dGhpcy5fdG9nZ2xlQnV0dG9uLnRpdGxlID0gbmxzLmxvY2FsaXplKCdleHBhbmQnLCBcIkV4cGFuZFwiKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZEZlZWRiYWNrSXRlbXMoKTogdm9pZCB7XG5cdFx0Y2xlYXJOb2RlKHRoaXMuX2JvZHlOb2RlKTtcblx0XHR0aGlzLl9pdGVtRWxlbWVudHMuY2xlYXIoKTtcblx0XHR0aGlzLl9hY3RpdmVSZXBseUlucHV0cy5jbGVhcigpO1xuXHRcdHRoaXMuX2FjdGl2ZUVkaXRJbnB1dHMuY2xlYXIoKTtcblx0XHR0aGlzLl9hY3Rpb25CYXJFbGVtZW50cy5jbGVhcigpO1xuXG5cdFx0Zm9yIChjb25zdCBjb21tZW50IG9mIHRoaXMuX2NvbW1lbnRJdGVtcykge1xuXHRcdFx0Y29uc3QgaXRlbSA9ICQoJ2Rpdi5hZ2VudC1mZWVkYmFjay13aWRnZXQtaXRlbScpO1xuXHRcdFx0aXRlbS5jbGFzc0xpc3QuYWRkKGBhZ2VudC1mZWVkYmFjay13aWRnZXQtaXRlbS0ke2NvbW1lbnQuc291cmNlfWApO1xuXHRcdFx0aWYgKGNvbW1lbnQuc3VnZ2VzdGlvbikge1xuXHRcdFx0XHRpdGVtLmNsYXNzTGlzdC5hZGQoJ2FnZW50LWZlZWRiYWNrLXdpZGdldC1pdGVtLXN1Z2dlc3Rpb24nKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2l0ZW1FbGVtZW50cy5zZXQoY29tbWVudC5pZCwgaXRlbSk7XG5cblx0XHRcdGNvbnN0IGl0ZW1IZWFkZXIgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2std2lkZ2V0LWl0ZW0taGVhZGVyJyk7XG5cdFx0XHRjb25zdCBpdGVtTWV0YSA9ICQoJ2Rpdi5hZ2VudC1mZWVkYmFjay13aWRnZXQtaXRlbS1tZXRhJyk7XG5cblx0XHRcdGNvbnN0IGxpbmVJbmZvID0gJCgnc3Bhbi5hZ2VudC1mZWVkYmFjay13aWRnZXQtbGluZS1pbmZvJyk7XG5cdFx0XHRpZiAoY29tbWVudC5yYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IGNvbW1lbnQucmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRsaW5lSW5mby50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnbGluZU51bWJlcicsIFwiTGluZSB7MH1cIiwgY29tbWVudC5yYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGluZUluZm8udGV4dENvbnRlbnQgPSBubHMubG9jYWxpemUoJ2xpbmVSYW5nZScsIFwiTGluZXMgezB9LXsxfVwiLCBjb21tZW50LnJhbmdlLnN0YXJ0TGluZU51bWJlciwgY29tbWVudC5yYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdH1cblx0XHRcdGl0ZW1NZXRhLmFwcGVuZENoaWxkKGxpbmVJbmZvKTtcblxuXHRcdFx0Y29uc3QgdHlwZUxhYmVsID0gdGhpcy5fZ2V0VHlwZUxhYmVsKGNvbW1lbnQpO1xuXHRcdFx0aWYgKHR5cGVMYWJlbCkge1xuXHRcdFx0XHRjb25zdCB0eXBlQmFkZ2UgPSAkKCdzcGFuLmFnZW50LWZlZWRiYWNrLXdpZGdldC1pdGVtLXR5cGUnKTtcblx0XHRcdFx0dHlwZUJhZGdlLnRleHRDb250ZW50ID0gdHlwZUxhYmVsO1xuXHRcdFx0XHRpdGVtTWV0YS5hcHBlbmRDaGlsZCh0eXBlQmFkZ2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpdGVtSGVhZGVyLmFwcGVuZENoaWxkKGl0ZW1NZXRhKTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uQmFyQ29udGFpbmVyID0gJCgnZGl2LmFnZW50LWZlZWRiYWNrLXdpZGdldC1pdGVtLWFjdGlvbnMnKTtcblx0XHRcdGNvbnN0IGFjdGlvbkJhciA9IHRoaXMuX2V2ZW50U3RvcmUuYWRkKG5ldyBBY3Rpb25CYXIoYWN0aW9uQmFyQ29udGFpbmVyKSk7XG5cblx0XHRcdGNvbnN0IGl0ZW1BY3Rpb25zOiBJQ29tbWVudEl0ZW1BY3Rpb25zID0geyBlZGl0QWN0aW9uOiB1bmRlZmluZWQhLCByZW1vdmVBY3Rpb246IHVuZGVmaW5lZCEsIGFkZFJlcGx5QWN0aW9uOiB1bmRlZmluZWQhIH07XG5cblx0XHRcdGl0ZW1BY3Rpb25zLmFkZFJlcGx5QWN0aW9uID0gdGhpcy5fZXZlbnRTdG9yZS5hZGQobmV3IEFjdGlvbihcblx0XHRcdFx0J2FnZW50RmVlZGJhY2sud2lkZ2V0LmFkZFJlcGx5Jyxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhZGRUb0NvbW1lbnQnLCBcIkFkZCB0byBDb21tZW50XCIpLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jb21tZW50RGlzY3Vzc2lvbiksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdCgpOiB2b2lkID0+IHsgdGhpcy5fc3RhcnRBZGRpbmdSZXBseShjb21tZW50LCBpdGVtLCBpdGVtQWN0aW9ucyk7IH0sXG5cdFx0XHQpKTtcblx0XHRcdGFjdGlvbkJhci5wdXNoKGl0ZW1BY3Rpb25zLmFkZFJlcGx5QWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblxuXHRcdFx0aXRlbUFjdGlvbnMuZWRpdEFjdGlvbiA9IHRoaXMuX2V2ZW50U3RvcmUuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHRcdCdhZ2VudEZlZWRiYWNrLndpZGdldC5lZGl0Jyxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0Q29tbWVudCcsIFwiRWRpdFwiKSxcblx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZWRpdCksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdCgpOiB2b2lkID0+IHsgdGhpcy5fc3RhcnRFZGl0aW5nKGNvbW1lbnQsIHRleHQsIGl0ZW1BY3Rpb25zKTsgfSxcblx0XHRcdCkpO1xuXHRcdFx0YWN0aW9uQmFyLnB1c2goaXRlbUFjdGlvbnMuZWRpdEFjdGlvbiwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cblx0XHRcdC8vIENvbW1lbnRzIHRoYXQgY2FuIGJlIGFjY2VwdGVkIFx1MjAxNCBlaXRoZXIgY29udmVydGlibGUgUFIgcmV2aWV3XG5cdFx0XHQvLyBjb21tZW50cyBvciBgY3JlYXRlZGAgYWdlbnQgZmVlZGJhY2sgXHUyMDE0IHJlbmRlciB0aGVpciBBY2NlcHQgL1xuXHRcdFx0Ly8gUmVtb3ZlIGFmZm9yZGFuY2VzIGluIHRoZSBhbHdheXMtdmlzaWJsZSBib3R0b20gYnV0dG9uIGJhciwgc29cblx0XHRcdC8vIHRob3NlIGFjdGlvbnMgYXJlIG9taXR0ZWQgZnJvbSB0aGUgaG92ZXIgdG9vbGJhciB0byBhdm9pZCBhXG5cdFx0XHQvLyBkdXBsaWNhdGUgYWZmb3JkYW5jZS4gVGhlIGNvbnZlcnQgKFwiQWNjZXB0XCIpIGFjdGlvbiBpcyBuZXZlclxuXHRcdFx0Ly8gc2hvd24gaW4gdGhlIGhvdmVyIHRvb2xiYXIuXG5cdFx0XHRjb25zdCBzaG93QWN0aW9uQnV0dG9uc0JhciA9IGNvbW1lbnQuY2FuQ29udmVydFRvQWdlbnRGZWVkYmFja1xuXHRcdFx0XHR8fCAoY29tbWVudC5zb3VyY2UgPT09IFNlc3Npb25FZGl0b3JDb21tZW50U291cmNlLkFnZW50RmVlZGJhY2sgJiYgY29tbWVudC5zdGF0ZSA9PT0gQWdlbnRGZWVkYmFja1N0YXRlLkNyZWF0ZWQpO1xuXG5cdFx0XHRpdGVtQWN0aW9ucy5yZW1vdmVBY3Rpb24gPSB0aGlzLl9ldmVudFN0b3JlLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0XHQnYWdlbnRGZWVkYmFjay53aWRnZXQucmVtb3ZlJyxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdyZW1vdmVDb21tZW50JywgXCJSZW1vdmVcIiksXG5cdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsb3NlKSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0KCkgPT4gdGhpcy5fcmVtb3ZlQ29tbWVudChjb21tZW50KSxcblx0XHRcdCkpO1xuXHRcdFx0aWYgKCFzaG93QWN0aW9uQnV0dG9uc0Jhcikge1xuXHRcdFx0XHRhY3Rpb25CYXIucHVzaChpdGVtQWN0aW9ucy5yZW1vdmVBY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRpdGVtSGVhZGVyLmFwcGVuZENoaWxkKGFjdGlvbkJhckNvbnRhaW5lcik7XG5cdFx0XHRpdGVtLmFwcGVuZENoaWxkKGl0ZW1IZWFkZXIpO1xuXG5cdFx0XHRjb25zdCB0ZXh0ID0gJCgnZGl2LmFnZW50LWZlZWRiYWNrLXdpZGdldC10ZXh0Jyk7XG5cdFx0XHRjb25zdCByZW5kZXJlZCA9IHRoaXMuX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihuZXcgTWFya2Rvd25TdHJpbmcoY29tbWVudC50ZXh0KSk7XG5cdFx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChyZW5kZXJlZCk7XG5cdFx0XHR0ZXh0LmFwcGVuZENoaWxkKHJlbmRlcmVkLmVsZW1lbnQpO1xuXHRcdFx0aXRlbS5hcHBlbmRDaGlsZCh0ZXh0KTtcblxuXHRcdFx0aWYgKGNvbW1lbnQuc3VnZ2VzdGlvbj8uZWRpdHMubGVuZ3RoKSB7XG5cdFx0XHRcdGl0ZW0uYXBwZW5kQ2hpbGQodGhpcy5fcmVuZGVyU3VnZ2VzdGlvbihjb21tZW50KSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb21tZW50LnJlcGxpZXM/Lmxlbmd0aCkge1xuXHRcdFx0XHRpdGVtLmFwcGVuZENoaWxkKHRoaXMuX3JlbmRlclJlcGxpZXMoY29tbWVudC5yZXBsaWVzKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzaG93QWN0aW9uQnV0dG9uc0Jhcikge1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJBY3Rpb25CdXR0b25zKGNvbW1lbnQsIGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaXRlbSwgJ21vdXNlZW50ZXInLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2hpZ2hsaWdodFJhbmdlKGNvbW1lbnQpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaXRlbSwgJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3JhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbi5jbGVhcigpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaXRlbSwgJ2NsaWNrJywgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRcdFx0aWYgKHRhcmdldD8uY2xvc2VzdCgnLmFjdGlvbi1iYXInKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBEb24ndCB0cmlnZ2VyIG5hdmlnYXRpb24gd2hlbiBpbnRlcmFjdGluZyB3aXRoIHRoZSByZXBseSBpbnB1dC5cblx0XHRcdFx0aWYgKHRhcmdldD8uY2xvc2VzdCgnLmFnZW50LWZlZWRiYWNrLXdpZGdldC1hZGQtcmVwbHknKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBEb24ndCBuYXZpZ2F0ZSB3aGVuIHBsYWNpbmcgdGhlIGNhcmV0IGluIGEgY29tcG9zZXIuXG5cdFx0XHRcdGlmIChpc1RleHRJbnB1dFRhcmdldCh0YXJnZXQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIERvbid0IG5hdmlnYXRlIGlmIHRoZSB1c2VyIGp1c3Qgc2VsZWN0ZWQgdGV4dCBpbnNpZGUgdGhlIGNvbW1lbnQuXG5cdFx0XHRcdGlmICh0YXJnZXQ/LmNsb3Nlc3QoJy5hZ2VudC1mZWVkYmFjay13aWRnZXQtdGV4dCwgLmFnZW50LWZlZWRiYWNrLXdpZGdldC1zdWdnZXN0aW9uLXRleHQsIC5hZ2VudC1mZWVkYmFjay13aWRnZXQtcmVwbHktdGV4dCcpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fZG9tTm9kZS5vd25lckRvY3VtZW50LmRlZmF1bHRWaWV3Py5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0XHRpZiAoc2VsZWN0aW9uICYmICFzZWxlY3Rpb24uaXNDb2xsYXBzZWQgJiYgdGhpcy5fZG9tTm9kZS5jb250YWlucyhzZWxlY3Rpb24uYW5jaG9yTm9kZSkpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5mb2N1c0ZlZWRiYWNrKGNvbW1lbnQuaWQpO1xuXHRcdFx0XHR0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZS5zZXROYXZpZ2F0aW9uQW5jaG9yKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSwgY29tbWVudC5pZCk7XG5cdFx0XHRcdHRoaXMuX3JldmVhbENvbW1lbnQoY29tbWVudCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIFB1bGwgZm9jdXMgdG8gdGhlIHdpZGdldCB3aGVuIHN0YXJ0aW5nIGEgc2VsZWN0aW9uIGluIHNlbGVjdGFibGVcblx0XHRcdC8vIHJlZ2lvbnMgc28gdGhhdCBDdHJsL0NtZCtDIGNvcGllcyB0aGUgRE9NIHNlbGVjdGlvbiBpbnN0ZWFkIG9mXG5cdFx0XHQvLyB0cmlnZ2VyaW5nIHRoZSBlZGl0b3IncyBjb3B5IGFjdGlvbi5cblx0XHRcdGNvbnN0IG9uU2VsZWN0YWJsZU1vdXNlZG93biA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRcdFx0Ly8gU3RlYWxpbmcgZm9jdXMgaGVyZSB3b3VsZCBibHVyIHRoZSBjb21wb3NlciB0aGUgdXNlciBpcyBjbGlja2luZyBpbnRvLlxuXHRcdFx0XHRpZiAoaXNUZXh0SW5wdXRUYXJnZXQodGFyZ2V0KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGFyZ2V0Py5jbG9zZXN0KCcuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXRleHQsIC5hZ2VudC1mZWVkYmFjay13aWRnZXQtc3VnZ2VzdGlvbi10ZXh0LCAuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXJlcGx5LXRleHQnKSkge1xuXHRcdFx0XHRcdHRoaXMuX2RvbU5vZGUuZm9jdXMoeyBwcmV2ZW50U2Nyb2xsOiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fZXZlbnRTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGl0ZW0sICdtb3VzZWRvd24nLCBvblNlbGVjdGFibGVNb3VzZWRvd24pKTtcblxuXHRcdFx0dGhpcy5fYm9keU5vZGUuYXBwZW5kQ2hpbGQoaXRlbSk7XG5cblx0XHRcdC8vIFJlc3RvcmUgYW4gaW4tcHJvZ3Jlc3MgY29tcG9zZXIgc28gZHJhZnRzIHN1cnZpdmUgd2lkZ2V0IHJlYnVpbGRzLlxuXHRcdFx0Y29uc3QgZHJhZnQgPSB0aGlzLl9jb21wb3NlckRyYWZ0U3RhdGU/LmRyYWZ0cy5nZXQoY29tbWVudC5pZCk7XG5cdFx0XHRpZiAoZHJhZnQ/LmtpbmQgPT09IENvbXBvc2VyS2luZC5SZXBseSkge1xuXHRcdFx0XHR0aGlzLl9zdGFydEFkZGluZ1JlcGx5KGNvbW1lbnQsIGl0ZW0sIGl0ZW1BY3Rpb25zLCBkcmFmdC50ZXh0KTtcblx0XHRcdH0gZWxzZSBpZiAoZHJhZnQ/LmtpbmQgPT09IENvbXBvc2VyS2luZC5FZGl0KSB7XG5cdFx0XHRcdHRoaXMuX3N0YXJ0RWRpdGluZyhjb21tZW50LCB0ZXh0LCBpdGVtQWN0aW9ucywgZHJhZnQudGV4dCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VHlwZUxhYmVsKGNvbW1lbnQ6IElTZXNzaW9uRWRpdG9yQ29tbWVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoIChjb21tZW50LmtpbmQpIHtcblx0XHRcdGNhc2UgQWdlbnRGZWVkYmFja0tpbmQuUFJSZXZpZXc6XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3ByUmV2aWV3Q29tbWVudCcsIFwiUFIgUmV2aWV3XCIpO1xuXHRcdFx0Y2FzZSBBZ2VudEZlZWRiYWNrS2luZC5BZ2VudFJldmlldzpcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnYWdlbnRSZXZpZXdDb21tZW50JywgXCJBZ2VudCBSZXZpZXdcIik7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclN1Z2dlc3Rpb24oY29tbWVudDogSVNlc3Npb25FZGl0b3JDb21tZW50KTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25Ob2RlID0gJCgnZGl2LmFnZW50LWZlZWRiYWNrLXdpZGdldC1zdWdnZXN0aW9uJyk7XG5cblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgY29tbWVudC5zdWdnZXN0aW9uPy5lZGl0cyA/PyBbXSkge1xuXHRcdFx0Y29uc3QgZWRpdE5vZGUgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXN1Z2dlc3Rpb24tZWRpdCcpO1xuXG5cdFx0XHRjb25zdCBoZWFkZXIgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXN1Z2dlc3Rpb24taGVhZGVyJyk7XG5cdFx0XHRpZiAoZWRpdC5yYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IGVkaXQucmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRoZWFkZXIudGV4dENvbnRlbnQgPSBubHMubG9jYWxpemUoJ3N1Z2dlc3RlZENoYW5nZUxpbmUnLCBcIlN1Z2dlc3RlZCBDaGFuZ2UgXFx1MjAyMiBMaW5lIHswfVwiLCBlZGl0LnJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoZWFkZXIudGV4dENvbnRlbnQgPSBubHMubG9jYWxpemUoJ3N1Z2dlc3RlZENoYW5nZUxpbmVzJywgXCJTdWdnZXN0ZWQgQ2hhbmdlIFxcdTIwMjIgTGluZXMgezB9LXsxfVwiLCBlZGl0LnJhbmdlLnN0YXJ0TGluZU51bWJlciwgZWRpdC5yYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdH1cblx0XHRcdGVkaXROb2RlLmFwcGVuZENoaWxkKGhlYWRlcik7XG5cblx0XHRcdGNvbnN0IG5ld1RleHQgPSAkKCdwcmUuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXN1Z2dlc3Rpb24tdGV4dCcpO1xuXHRcdFx0bmV3VGV4dC50ZXh0Q29udGVudCA9IGVkaXQubmV3VGV4dDtcblx0XHRcdGVkaXROb2RlLmFwcGVuZENoaWxkKG5ld1RleHQpO1xuXHRcdFx0c3VnZ2VzdGlvbk5vZGUuYXBwZW5kQ2hpbGQoZWRpdE5vZGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdWdnZXN0aW9uTm9kZTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclJlcGxpZXMocmVwbGllczogcmVhZG9ubHkgc3RyaW5nW10pOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgcmVwbGllc05vZGUgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXJlcGxpZXMnKTtcblxuXHRcdGZvciAoY29uc3QgcmVwbHkgb2YgcmVwbGllcykge1xuXHRcdFx0Y29uc3QgcmVwbHlOb2RlID0gJCgnZGl2LmFnZW50LWZlZWRiYWNrLXdpZGdldC1yZXBseScpO1xuXHRcdFx0Y29uc3QgcmVwbHlUZXh0ID0gJCgnZGl2LmFnZW50LWZlZWRiYWNrLXdpZGdldC1yZXBseS10ZXh0Jyk7XG5cdFx0XHRjb25zdCByZW5kZXJlZCA9IHRoaXMuX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihuZXcgTWFya2Rvd25TdHJpbmcocmVwbHkpKTtcblx0XHRcdHRoaXMuX2V2ZW50U3RvcmUuYWRkKHJlbmRlcmVkKTtcblx0XHRcdHJlcGx5VGV4dC5hcHBlbmRDaGlsZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHRcdHJlcGx5Tm9kZS5hcHBlbmRDaGlsZChyZXBseVRleHQpO1xuXHRcdFx0cmVwbGllc05vZGUuYXBwZW5kQ2hpbGQocmVwbHlOb2RlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVwbGllc05vZGU7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVycyB0aGUgQWNjZXB0IC8gUmVtb3ZlIGJ1dHRvbiBiYXIgc2hvd24gYXQgdGhlIGJvdHRvbSBvZiBhXG5cdCAqIGBjcmVhdGVkYCBhZ2VudCBmZWVkYmFjayBjb21tZW50IG9yIGEgUFIgcmV2aWV3IGNvbW1lbnQuIENsaWNraW5nIGVpdGhlclxuXHQgKiBidXR0b24gcGVyZm9ybXMgdGhlIGFjdGlvbiBhbmQgcmVtb3ZlcyB0aGUgYmFyLiBGb3IgUFIgcmV2aWV3IGNvbW1lbnRzXG5cdCAqIFwiQWNjZXB0XCIgY29udmVydHMgdGhlIGNvbW1lbnQgaW50byBhZ2VudCBmZWVkYmFjazsgZm9yIGFnZW50IGZlZWRiYWNrIGl0XG5cdCAqIG1hcmtzIHRoZSBjb21tZW50IGFzIGFjY2VwdGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyQWN0aW9uQnV0dG9ucyhjb21tZW50OiBJU2Vzc2lvbkVkaXRvckNvbW1lbnQsIGl0ZW06IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgYnV0dG9uQmFyID0gJCgnZGl2LmFnZW50LWZlZWRiYWNrLXdpZGdldC1hY3Rpb25zLWJhcicpO1xuXG5cdFx0Y29uc3QgYnV0dG9uU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fZXZlbnRTdG9yZS5hZGQoYnV0dG9uU3RvcmUpO1xuXG5cdFx0Ly8gUHJldmVudCBjbGlja3Mgb24gdGhlIGJ1dHRvbiBiYXIgZnJvbSBidWJibGluZyB1cCB0byB0aGUgaXRlbSBjbGlja1xuXHRcdC8vIGhhbmRsZXIgKHdoaWNoIHdvdWxkIG5hdmlnYXRlL3JldmVhbCB0aGUgY29tbWVudCkuXG5cdFx0YnV0dG9uU3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b25CYXIsICdjbGljaycsIGUgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSkpO1xuXG5cdFx0Y29uc3QgZGlzbWlzcyA9ICgpID0+IHtcblx0XHRcdGJ1dHRvblN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdGJ1dHRvbkJhci5yZW1vdmUoKTtcblx0XHRcdHRoaXMuX2FjdGlvbkJhckVsZW1lbnRzLmRlbGV0ZShjb21tZW50LmlkKTtcblx0XHRcdC8vIE1vdmUgZm9jdXMgYmFjayB0byB0aGUgd2lkZ2V0IHNvIGtleWJvYXJkL3NjcmVlbiByZWFkZXIgdXNlcnNcblx0XHRcdC8vIGRvbid0IGxvc2UgdGhlaXIgcGxhY2Ugd2hlbiB0aGUgKG5vdyByZW1vdmVkKSBidXR0b24gaXMgZ29uZS5cblx0XHRcdHRoaXMuX2RvbU5vZGUuZm9jdXMoeyBwcmV2ZW50U2Nyb2xsOiB0cnVlIH0pO1xuXHRcdFx0dGhpcy5fZWRpdG9yLmxheW91dE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGlzUFJDb21tZW50ID0gY29tbWVudC5zb3VyY2UgPT09IFNlc3Npb25FZGl0b3JDb21tZW50U291cmNlLlBSUmV2aWV3O1xuXHRcdGNvbnN0IGFjY2VwdFRvb2x0aXAgPSBpc1BSQ29tbWVudFxuXHRcdFx0PyBubHMubG9jYWxpemUoJ2FjY2VwdFBSRmVlZGJhY2tUb29sdGlwJywgXCJTaGFyZSBQUiBjb21tZW50IHdpdGggYWdlbnRcIilcblx0XHRcdDogbmxzLmxvY2FsaXplKCdhY2NlcHRBZ2VudEZlZWRiYWNrVG9vbHRpcCcsIFwiU2hhcmUgY29tbWVudCB3aXRoIGFnZW50XCIpO1xuXHRcdGNvbnN0IGRlbGV0ZVRvb2x0aXAgPSBpc1BSQ29tbWVudFxuXHRcdFx0PyBubHMubG9jYWxpemUoJ2RlbGV0ZVBSRmVlZGJhY2tUb29sdGlwJywgXCJSZW1vdmUgYW5kIG1hcmsgYXMgcmVzb2x2ZWQgb24gR2l0SHViXCIpXG5cdFx0XHQ6IG5scy5sb2NhbGl6ZSgnZGVsZXRlQWdlbnRGZWVkYmFja1Rvb2x0aXAnLCBcIlJlbW92ZSBhZ2VudCBjb21tZW50XCIpO1xuXG5cdFx0Y29uc3QgYWNjZXB0QnV0dG9uID0gYnV0dG9uU3RvcmUuYWRkKG5ldyBCdXR0b24oYnV0dG9uQmFyLCB7XG5cdFx0XHR0aXRsZTogYWNjZXB0VG9vbHRpcCxcblx0XHRcdGJ1dHRvbkJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtY2hhcnRzLXB1cnBsZSknLFxuXHRcdFx0YnV0dG9uSG92ZXJCYWNrZ3JvdW5kOiAnY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLXZzY29kZS1jaGFydHMtcHVycGxlKSA4NSUsIHZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKSknLFxuXHRcdFx0YnV0dG9uRm9yZWdyb3VuZDogJ3ZhcigtLXZzY29kZS1idXR0b24tZm9yZWdyb3VuZCknLFxuXHRcdFx0YnV0dG9uQm9yZGVyOiAndmFyKC0tdnNjb2RlLWNoYXJ0cy1wdXJwbGUpJyxcblx0XHR9KSk7XG5cdFx0YWNjZXB0QnV0dG9uLmxhYmVsID0gbmxzLmxvY2FsaXplKCdhY2NlcHRGZWVkYmFja0J1dHRvbicsIFwiQWNjZXB0XCIpO1xuXHRcdGJ1dHRvblN0b3JlLmFkZChhY2NlcHRCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRpZiAoY29tbWVudC5jYW5Db252ZXJ0VG9BZ2VudEZlZWRiYWNrKSB7XG5cdFx0XHRcdHRoaXMuX2NvbnZlcnRUb0FnZW50RmVlZGJhY2soY29tbWVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9hY2NlcHRGZWVkYmFjayhjb21tZW50KTtcblx0XHRcdH1cblx0XHRcdGRpc21pc3MoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkZWxldGVCdXR0b24gPSBidXR0b25TdG9yZS5hZGQobmV3IEJ1dHRvbihidXR0b25CYXIsIHtcblx0XHRcdHRpdGxlOiBkZWxldGVUb29sdGlwLFxuXHRcdFx0c2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5QmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1idXR0b24tc2Vjb25kYXJ5QmFja2dyb3VuZCknLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlIb3ZlckJhY2tncm91bmQpJyxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUZvcmVncm91bmQ6ICd2YXIoLS12c2NvZGUtYnV0dG9uLXNlY29uZGFyeUZvcmVncm91bmQpJyxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUJvcmRlcjogJ3ZhcigtLXZzY29kZS1idXR0b24tc2Vjb25kYXJ5Qm9yZGVyKScsXG5cdFx0fSkpO1xuXHRcdGRlbGV0ZUJ1dHRvbi5sYWJlbCA9IG5scy5sb2NhbGl6ZSgnZGVsZXRlRmVlZGJhY2tCdXR0b24nLCBcIkRlbGV0ZVwiKTtcblx0XHRidXR0b25TdG9yZS5hZGQoZGVsZXRlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVtb3ZlQ29tbWVudChjb21tZW50KTtcblx0XHRcdGRpc21pc3MoKTtcblx0XHR9KSk7XG5cblx0XHRpdGVtLmFwcGVuZENoaWxkKGJ1dHRvbkJhcik7XG5cdFx0dGhpcy5fYWN0aW9uQmFyRWxlbWVudHMuc2V0KGNvbW1lbnQuaWQsIGJ1dHRvbkJhcik7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVDb21tZW50KGNvbW1lbnQ6IElTZXNzaW9uRWRpdG9yQ29tbWVudCk6IHZvaWQge1xuXHRcdGlmIChjb21tZW50LnNvdXJjZSA9PT0gU2Vzc2lvbkVkaXRvckNvbW1lbnRTb3VyY2UuUFJSZXZpZXcpIHtcblx0XHRcdHRoaXMuX2NvZGVSZXZpZXdTZXJ2aWNlLnJlc29sdmVQUlJldmlld1RocmVhZCh0aGlzLl9zZXNzaW9uUmVzb3VyY2UhLCBjb21tZW50LnNvdXJjZUlkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZS5yZW1vdmVGZWVkYmFjayh0aGlzLl9zZXNzaW9uUmVzb3VyY2UsIGNvbW1lbnQuc291cmNlSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRFZGl0aW5nKGNvbW1lbnQ6IElTZXNzaW9uRWRpdG9yQ29tbWVudCwgdGV4dENvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGFjdGlvbnM6IElDb21tZW50SXRlbUFjdGlvbnMsIHJlc3RvcmVkVGV4dD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fYWN0aXZlRWRpdElucHV0cy5nZXQoY29tbWVudC5pZCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRleGlzdGluZy50ZXh0YXJlYS5mb2N1cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERpc2FibGUgYWxsIGFjdGlvbnMgd2hpbGUgZWRpdGluZ1xuXHRcdGFjdGlvbnMuZWRpdEFjdGlvbi5lbmFibGVkID0gZmFsc2U7XG5cdFx0YWN0aW9ucy5yZW1vdmVBY3Rpb24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdGFjdGlvbnMuYWRkUmVwbHlBY3Rpb24uZW5hYmxlZCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgZWRpdFN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX2V2ZW50U3RvcmUuYWRkKGVkaXRTdG9yZSk7XG5cblx0XHRjbGVhck5vZGUodGV4dENvbnRhaW5lcik7XG5cdFx0dGV4dENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdlZGl0aW5nJyk7XG5cblx0XHRjb25zdCB0ZXh0YXJlYSA9ICQoJ3RleHRhcmVhLmFnZW50LWZlZWRiYWNrLXdpZGdldC1lZGl0LXRleHRhcmVhJykgYXMgSFRNTFRleHRBcmVhRWxlbWVudDtcblx0XHR0ZXh0YXJlYS52YWx1ZSA9IHJlc3RvcmVkVGV4dCA/PyBjb21tZW50LnRleHQ7XG5cdFx0dGV4dGFyZWEucm93cyA9IDE7XG5cdFx0dGV4dENvbnRhaW5lci5hcHBlbmRDaGlsZCh0ZXh0YXJlYSk7XG5cblx0XHR0aGlzLl9hY3RpdmVFZGl0SW5wdXRzLnNldChjb21tZW50LmlkLCB7XG5cdFx0XHR0ZXh0YXJlYSxcblx0XHRcdGNhbmNlbDogKCkgPT4gdGhpcy5fc3RvcEVkaXRpbmcoY29tbWVudCwgdGV4dENvbnRhaW5lciwgZWRpdFN0b3JlLCBhY3Rpb25zKSxcblx0XHR9KTtcblx0XHR0aGlzLl9zZXREcmFmdChjb21tZW50LmlkLCBDb21wb3NlcktpbmQuRWRpdCwgdGV4dGFyZWEudmFsdWUpO1xuXG5cdFx0Ly8gQXV0by1zaXplIHRoZSB0ZXh0YXJlYVxuXHRcdGNvbnN0IGF1dG9TaXplID0gKCkgPT4ge1xuXHRcdFx0dGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gJ2F1dG8nO1xuXHRcdFx0dGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gYCR7dGV4dGFyZWEuc2Nyb2xsSGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMuX2VkaXRvci5sYXlvdXRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHRcdH07XG5cdFx0YXV0b1NpemUoKTtcblxuXHRcdGVkaXRTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRleHRhcmVhLCAnaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9zZXREcmFmdChjb21tZW50LmlkLCBDb21wb3NlcktpbmQuRWRpdCwgdGV4dGFyZWEudmFsdWUpO1xuXHRcdFx0YXV0b1NpemUoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBFZGl0aW5nIGVuZHMgb25seSBvbiBFbnRlciBvciBFc2NhcGUgc28gYW4gaW5jaWRlbnRhbCBjbGljayBuZXZlciBkaXNjYXJkcyB0aGUgZHJhZnQuXG5cdFx0ZWRpdFN0b3JlLmFkZChhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0ZXh0YXJlYSwgJ2tleWRvd24nLCAoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciAmJiAhZS5zaGlmdEtleSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IG5ld1RleHQgPSB0ZXh0YXJlYS52YWx1ZS50cmltKCk7XG5cdFx0XHRcdGlmIChuZXdUZXh0KSB7XG5cdFx0XHRcdFx0Ly8gQ2xlYXIgdGhlIGRyYWZ0IGZpcnN0IHNvIHRoZSByZWJ1aWx0IHdpZGdldCBkb2Vzbid0IHJlLW9wZW4gdGhlIGNvbXBvc2VyLlxuXHRcdFx0XHRcdHRoaXMuX2NsZWFyRHJhZnQoY29tbWVudC5pZCk7XG5cdFx0XHRcdFx0dGhpcy5fc2F2ZUVkaXQoY29tbWVudCwgbmV3VGV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RvcEVkaXRpbmcoY29tbWVudCwgdGV4dENvbnRhaW5lciwgZWRpdFN0b3JlLCBhY3Rpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fc3RvcEVkaXRpbmcoY29tbWVudCwgdGV4dENvbnRhaW5lciwgZWRpdFN0b3JlLCBhY3Rpb25zKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAodGhpcy5fc2hvdWxkRm9jdXNDb21wb3Nlcihjb21tZW50LmlkLCByZXN0b3JlZFRleHQpKSB7XG5cdFx0XHR0aGlzLl9mb2N1c0NvbXBvc2VyKHRleHRhcmVhKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydEFkZGluZ1JlcGx5KGNvbW1lbnQ6IElTZXNzaW9uRWRpdG9yQ29tbWVudCwgaXRlbU5vZGU6IEhUTUxFbGVtZW50LCBhY3Rpb25zOiBJQ29tbWVudEl0ZW1BY3Rpb25zLCByZXN0b3JlZFRleHQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBJZiBhIHJlcGx5IGlucHV0IGlzIGFscmVhZHkgb3BlbiBmb3IgdGhpcyBpdGVtLCBqdXN0IGZvY3VzIGl0LlxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fYWN0aXZlUmVwbHlJbnB1dHMuZ2V0KGNvbW1lbnQuaWQpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0ZXhpc3RpbmcudGV4dGFyZWEuZm9jdXMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEaXNhYmxlIGl0ZW0gYWN0aW9ucyB3aGlsZSByZXBseWluZyBzbyB0aGUgYWN0aW9uIGJhciBkb2Vzbid0IGNvbmZsaWN0LlxuXHRcdGFjdGlvbnMuZWRpdEFjdGlvbi5lbmFibGVkID0gZmFsc2U7XG5cdFx0YWN0aW9ucy5yZW1vdmVBY3Rpb24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdGFjdGlvbnMuYWRkUmVwbHlBY3Rpb24uZW5hYmxlZCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgcmVwbHlTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChyZXBseVN0b3JlKTtcblxuXHRcdGNvbnN0IHJlcGx5Q29udGFpbmVyID0gJCgnZGl2LmFnZW50LWZlZWRiYWNrLXdpZGdldC1hZGQtcmVwbHknKTtcblx0XHRjb25zdCB0ZXh0YXJlYSA9ICQoJ3RleHRhcmVhLmFnZW50LWZlZWRiYWNrLXdpZGdldC1lZGl0LXRleHRhcmVhJykgYXMgSFRNTFRleHRBcmVhRWxlbWVudDtcblx0XHR0ZXh0YXJlYS5wbGFjZWhvbGRlciA9IG5scy5sb2NhbGl6ZSgnYWRkUmVwbHlQbGFjZWhvbGRlcicsIFwiQWRkIGEgY29tbWVudFxcdTIwMjZcIik7XG5cdFx0dGV4dGFyZWEucm93cyA9IDE7XG5cdFx0aWYgKHJlc3RvcmVkVGV4dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0ZXh0YXJlYS52YWx1ZSA9IHJlc3RvcmVkVGV4dDtcblx0XHR9XG5cdFx0cmVwbHlDb250YWluZXIuYXBwZW5kQ2hpbGQodGV4dGFyZWEpO1xuXHRcdC8vIEtlZXAgdGhlIGFjdGlvbiBidXR0b24gYmFyIChBY2NlcHQvUmVtb3ZlKSBhcyB0aGUgdmVyeSBsYXN0IGVsZW1lbnQgc29cblx0XHQvLyB0aGUgcmVwbHkgY29tcG9zZXIgYXBwZWFycyBhYm92ZSBpdC5cblx0XHRjb25zdCBhY3Rpb25zQmFyID0gdGhpcy5fYWN0aW9uQmFyRWxlbWVudHMuZ2V0KGNvbW1lbnQuaWQpO1xuXHRcdGlmIChhY3Rpb25zQmFyKSB7XG5cdFx0XHRpdGVtTm9kZS5pbnNlcnRCZWZvcmUocmVwbHlDb250YWluZXIsIGFjdGlvbnNCYXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpdGVtTm9kZS5hcHBlbmRDaGlsZChyZXBseUNvbnRhaW5lcik7XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZVJlcGx5SW5wdXRzLnNldChjb21tZW50LmlkLCB7IHRleHRhcmVhLCBjYW5jZWw6ICgpID0+IGNsZWFudXAoKSB9KTtcblx0XHR0aGlzLl9zZXREcmFmdChjb21tZW50LmlkLCBDb21wb3NlcktpbmQuUmVwbHksIHRleHRhcmVhLnZhbHVlKTtcblxuXHRcdGNvbnN0IGF1dG9TaXplID0gKCkgPT4ge1xuXHRcdFx0dGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gJ2F1dG8nO1xuXHRcdFx0dGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gYCR7dGV4dGFyZWEuc2Nyb2xsSGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMuX2VkaXRvci5sYXlvdXRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHRcdH07XG5cdFx0YXV0b1NpemUoKTtcblxuXHRcdHJlcGx5U3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0ZXh0YXJlYSwgJ2lucHV0JywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2V0RHJhZnQoY29tbWVudC5pZCwgQ29tcG9zZXJLaW5kLlJlcGx5LCB0ZXh0YXJlYS52YWx1ZSk7XG5cdFx0XHRhdXRvU2l6ZSgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNsZWFudXAgPSAoKSA9PiB7XG5cdFx0XHRyZXBseVN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdGFjdGlvbnMuZWRpdEFjdGlvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdGFjdGlvbnMucmVtb3ZlQWN0aW9uLmVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0YWN0aW9ucy5hZGRSZXBseUFjdGlvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2FjdGl2ZVJlcGx5SW5wdXRzLmRlbGV0ZShjb21tZW50LmlkKTtcblx0XHRcdHJlcGx5Q29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5fY2xlYXJEcmFmdChjb21tZW50LmlkKTtcblx0XHRcdHRoaXMuX2VkaXRvci5sYXlvdXRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHRcdH07XG5cblx0XHQvLyBSZXBseWluZyBlbmRzIG9ubHkgb24gRW50ZXIgb3IgRXNjYXBlIHNvIGFuIGluY2lkZW50YWwgY2xpY2sgbmV2ZXIgZGlzY2FyZHMgdGhlIGRyYWZ0LlxuXHRcdHJlcGx5U3RvcmUuYWRkKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRleHRhcmVhLCAna2V5ZG93bicsIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyICYmICFlLnNoaWZ0S2V5KSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0Y29uc3QgbmV3UmVwbHkgPSB0ZXh0YXJlYS52YWx1ZS50cmltKCk7XG5cdFx0XHRcdGlmIChuZXdSZXBseSkge1xuXHRcdFx0XHRcdC8vIENsZWFyIHRoZSBkcmFmdCBmaXJzdCBzbyB0aGUgcmVidWlsdCB3aWRnZXQgZG9lc24ndCByZS1vcGVuIHRoZSBjb21wb3Nlci5cblx0XHRcdFx0XHR0aGlzLl9jbGVhckRyYWZ0KGNvbW1lbnQuaWQpO1xuXHRcdFx0XHRcdHRoaXMuX3NhdmVSZXBseShjb21tZW50LCBuZXdSZXBseSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y2xlYW51cCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGUua2V5Q29kZSA9PT0gS2V5Q29kZS5Fc2NhcGUpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRoaXMuX3Nob3VsZEZvY3VzQ29tcG9zZXIoY29tbWVudC5pZCwgcmVzdG9yZWRUZXh0KSkge1xuXHRcdFx0dGhpcy5fZm9jdXNDb21wb3Nlcih0ZXh0YXJlYSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZvY3VzZXMgdGhlIGNvbXBvc2VyIHJlc3RvcmVkIGZyb20gYSBkcmFmdCwgaWYgYW55LiBNdXN0IGJlIGNhbGxlZCBvbmNlIHRoZVxuXHQgKiB3aWRnZXQgaXMgaW4gdGhlIERPTSBcdTIwMTQgZm9jdXNpbmcgYSBkZXRhY2hlZCBlbGVtZW50IGhhcyBubyBlZmZlY3QuXG5cdCAqL1xuXHRyZXN0b3JlQ29tcG9zZXJGb2N1cygpOiB2b2lkIHtcblx0XHRjb25zdCB0ZXh0YXJlYSA9IHRoaXMuX2NvbXBvc2VyVG9Gb2N1cztcblx0XHR0aGlzLl9jb21wb3NlclRvRm9jdXMgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKCF0ZXh0YXJlYSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0ZXh0YXJlYS5mb2N1cygpO1xuXHRcdC8vIFBsYWNlIGNhcmV0IGF0IHRoZSBlbmQgc28gdHlwaW5nIGNvbnRpbnVlcyB3aGVyZSB0aGUgdXNlciBsZWZ0IG9mZi5cblx0XHR0ZXh0YXJlYS5zZXRTZWxlY3Rpb25SYW5nZSh0ZXh0YXJlYS52YWx1ZS5sZW5ndGgsIHRleHRhcmVhLnZhbHVlLmxlbmd0aCk7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlUmVwbHkoY29tbWVudDogSVNlc3Npb25FZGl0b3JDb21tZW50LCByZXBseVRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChjb21tZW50LnNvdXJjZSA9PT0gU2Vzc2lvbkVkaXRvckNvbW1lbnRTb3VyY2UuQWdlbnRGZWVkYmFjaykge1xuXHRcdFx0dGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UuYWRkUmVwbHkodGhpcy5fc2Vzc2lvblJlc291cmNlLCBjb21tZW50LnNvdXJjZUlkLCByZXBseVRleHQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZvciBQUiByZXZpZXcgY29tbWVudHMsIGNvbnZlcnQgdG8gYWdlbnQgZmVlZGJhY2sgZmlyc3QgcHJlc2VydmluZ1xuXHRcdC8vIHRoZSBvcmlnaW5hbCB0ZXh0LCB0aGVuIGFkZCB0aGUgcmVwbHkgc28gdGhhdCB0aGUgb3JpZ2luYWwgY29tbWVudCBhbmRcblx0XHQvLyB0aGUgcmVwbHkgbGl2ZSBpbiB0aGUgc2FtZSB0aHJlYWQuXG5cdFx0aWYgKCFjb21tZW50LmNhbkNvbnZlcnRUb0FnZW50RmVlZGJhY2spIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmZWVkYmFjayA9IHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlLmFkZEZlZWRiYWNrKFxuXHRcdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0Y29tbWVudC5yZXNvdXJjZVVyaSxcblx0XHRcdGNvbW1lbnQucmFuZ2UsXG5cdFx0XHRjb21tZW50LnRleHQsXG5cdFx0XHRjb21tZW50LnN1Z2dlc3Rpb24sXG5cdFx0XHRjcmVhdGVBZ2VudEZlZWRiYWNrQ29udGV4dCh0aGlzLl9lZGl0b3IsIHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLCBjb21tZW50LnJlc291cmNlVXJpLCBjb21tZW50LnJhbmdlKSxcblx0XHRcdGNvbW1lbnQuc291cmNlSWQsXG5cdFx0XHRBZ2VudEZlZWRiYWNrS2luZC5QUlJldmlldyxcblx0XHQpO1xuXHRcdHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlLmFkZFJlcGx5KHRoaXMuX3Nlc3Npb25SZXNvdXJjZSwgZmVlZGJhY2suaWQsIHJlcGx5VGV4dCk7XG5cdFx0dGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2Uuc2V0TmF2aWdhdGlvbkFuY2hvcih0aGlzLl9zZXNzaW9uUmVzb3VyY2UsIHRvU2Vzc2lvbkVkaXRvckNvbW1lbnRJZChTZXNzaW9uRWRpdG9yQ29tbWVudFNvdXJjZS5BZ2VudEZlZWRiYWNrLCBmZWVkYmFjay5pZCkpO1xuXHRcdHRoaXMuX2NvZGVSZXZpZXdTZXJ2aWNlLm1hcmtQUlJldmlld0NvbW1lbnRDb252ZXJ0ZWQodGhpcy5fc2Vzc2lvblJlc291cmNlLCBjb21tZW50LnNvdXJjZUlkKTtcblx0fVxuXG5cdHByaXZhdGUgX3NhdmVFZGl0KGNvbW1lbnQ6IElTZXNzaW9uRWRpdG9yQ29tbWVudCwgbmV3VGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKGNvbW1lbnQuc291cmNlID09PSBTZXNzaW9uRWRpdG9yQ29tbWVudFNvdXJjZS5BZ2VudEZlZWRiYWNrKSB7XG5cdFx0XHR0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZS51cGRhdGVGZWVkYmFjayh0aGlzLl9zZXNzaW9uUmVzb3VyY2UsIGNvbW1lbnQuc291cmNlSWQsIG5ld1RleHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBQUiByZXZpZXcgYW5kIGNvZGUgcmV2aWV3IGNvbW1lbnRzIGFyZSBjb252ZXJ0ZWQgdG8gYWdlbnQgZmVlZGJhY2sgb24gZWRpdFxuXHRcdFx0dGhpcy5fY29udmVydFRvQWdlbnRGZWVkYmFja1dpdGhUZXh0KGNvbW1lbnQsIG5ld1RleHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N0b3BFZGl0aW5nKGNvbW1lbnQ6IElTZXNzaW9uRWRpdG9yQ29tbWVudCwgdGV4dENvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGVkaXRTdG9yZTogRGlzcG9zYWJsZVN0b3JlLCBhY3Rpb25zOiBJQ29tbWVudEl0ZW1BY3Rpb25zKTogdm9pZCB7XG5cdFx0ZWRpdFN0b3JlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9hY3RpdmVFZGl0SW5wdXRzLmRlbGV0ZShjb21tZW50LmlkKTtcblx0XHR0aGlzLl9jbGVhckRyYWZ0KGNvbW1lbnQuaWQpO1xuXG5cdFx0Ly8gUmUtZW5hYmxlIGFjdGlvbnNcblx0XHRhY3Rpb25zLmVkaXRBY3Rpb24uZW5hYmxlZCA9IHRydWU7XG5cdFx0YWN0aW9ucy5yZW1vdmVBY3Rpb24uZW5hYmxlZCA9IHRydWU7XG5cdFx0YWN0aW9ucy5hZGRSZXBseUFjdGlvbi5lbmFibGVkID0gdHJ1ZTtcblxuXHRcdHRleHRDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnZWRpdGluZycpO1xuXHRcdGNsZWFyTm9kZSh0ZXh0Q29udGFpbmVyKTtcblx0XHRjb25zdCByZW5kZXJlZCA9IHRoaXMuX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihuZXcgTWFya2Rvd25TdHJpbmcoY29tbWVudC50ZXh0KSk7XG5cdFx0dGhpcy5fZXZlbnRTdG9yZS5hZGQocmVuZGVyZWQpO1xuXHRcdHRleHRDb250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyZWQuZWxlbWVudCk7XG5cdFx0dGhpcy5fZWRpdG9yLmxheW91dE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRwcml2YXRlIF9jb252ZXJ0VG9BZ2VudEZlZWRiYWNrKGNvbW1lbnQ6IElTZXNzaW9uRWRpdG9yQ29tbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnZlcnRUb0FnZW50RmVlZGJhY2tXaXRoVGV4dChjb21tZW50LCBjb21tZW50LnRleHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFjY2VwdCBhIENyZWF0ZWQgYWdlbnQgZmVlZGJhY2sgaXRlbSBzbyBpdCBiZWNvbWVzIHN1Ym1pdHRhYmxlLlxuXHQgKi9cblx0cHJpdmF0ZSBfYWNjZXB0RmVlZGJhY2soY29tbWVudDogSVNlc3Npb25FZGl0b3JDb21tZW50KTogdm9pZCB7XG5cdFx0aWYgKGNvbW1lbnQuc291cmNlICE9PSBTZXNzaW9uRWRpdG9yQ29tbWVudFNvdXJjZS5BZ2VudEZlZWRiYWNrKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlLmFjY2VwdEZlZWRiYWNrKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSwgY29tbWVudC5zb3VyY2VJZCk7XG5cdFx0dGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2Uuc2V0TmF2aWdhdGlvbkFuY2hvcih0aGlzLl9zZXNzaW9uUmVzb3VyY2UsIGNvbW1lbnQuaWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgbm9uLWFnZW50LWZlZWRiYWNrIGNvbW1lbnQgaW50byBhbiBhZ2VudCBmZWVkYmFjayBpdGVtLCBvcHRpb25hbGx5IHdpdGggZWRpdGVkIHRleHQuXG5cdCAqL1xuXHRwcml2YXRlIF9jb252ZXJ0VG9BZ2VudEZlZWRiYWNrV2l0aFRleHQoY29tbWVudDogSVNlc3Npb25FZGl0b3JDb21tZW50LCB0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIWNvbW1lbnQuY2FuQ29udmVydFRvQWdlbnRGZWVkYmFjaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZlZWRiYWNrID0gdGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UuYWRkRmVlZGJhY2soXG5cdFx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRjb21tZW50LnJlc291cmNlVXJpLFxuXHRcdFx0Y29tbWVudC5yYW5nZSxcblx0XHRcdHRleHQsXG5cdFx0XHRjb21tZW50LnN1Z2dlc3Rpb24sXG5cdFx0XHRjcmVhdGVBZ2VudEZlZWRiYWNrQ29udGV4dCh0aGlzLl9lZGl0b3IsIHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLCBjb21tZW50LnJlc291cmNlVXJpLCBjb21tZW50LnJhbmdlKSxcblx0XHRcdGNvbW1lbnQuc291cmNlSWQsXG5cdFx0XHRBZ2VudEZlZWRiYWNrS2luZC5QUlJldmlldyxcblx0XHQpO1xuXHRcdHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlLnNldE5hdmlnYXRpb25BbmNob3IodGhpcy5fc2Vzc2lvblJlc291cmNlLCB0b1Nlc3Npb25FZGl0b3JDb21tZW50SWQoU2Vzc2lvbkVkaXRvckNvbW1lbnRTb3VyY2UuQWdlbnRGZWVkYmFjaywgZmVlZGJhY2suaWQpKTtcblx0XHR0aGlzLl9jb2RlUmV2aWV3U2VydmljZS5tYXJrUFJSZXZpZXdDb21tZW50Q29udmVydGVkKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSwgY29tbWVudC5zb3VyY2VJZCk7XG5cdH1cblxuXHQvKipcblx0ICogRXhwYW5kIHRoZSB3aWRnZXQgYm9keS5cblx0ICovXG5cdGV4cGFuZCgpOiB2b2lkIHtcblx0XHRjb25zdCB3YXNFeHBhbmRlZCA9IHRoaXMuX2lzRXhwYW5kZWQ7XG5cdFx0dGhpcy5faXNFeHBhbmRlZCA9IHRydWU7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdjb2xsYXBzZWQnKTtcblx0XHR0aGlzLl9ib2R5Tm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdjb2xsYXBzZWQnKTtcblx0XHR0aGlzLl91cGRhdGVUb2dnbGVCdXR0b24oKTtcblx0XHR0aGlzLl9lZGl0b3IubGF5b3V0T3ZlcmxheVdpZGdldCh0aGlzKTtcblx0XHRpZiAoIXdhc0V4cGFuZGVkKSB7XG5cdFx0XHR0aGlzLl9vbkRpZEV4cGFuZC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGlzRXhwYW5kZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzRXhwYW5kZWQ7XG5cdH1cblxuXHQvKipcblx0ICogQ29sbGFwc2UgdGhlIHdpZGdldCBib2R5LlxuXHQgKi9cblx0Y29sbGFwc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNFeHBhbmRlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY29sbGFwc2VkJyk7XG5cdFx0dGhpcy5fYm9keU5vZGUuY2xhc3NMaXN0LmFkZCgnY29sbGFwc2VkJyk7XG5cdFx0dGhpcy5fdXBkYXRlVG9nZ2xlQnV0dG9uKCk7XG5cdFx0dGhpcy5jbGVhckZvY3VzKCk7XG5cdFx0dGhpcy5fZWRpdG9yLmxheW91dE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdH1cblxuXHQvKipcblx0ICogRm9jdXMgYSBzcGVjaWZpYyBmZWVkYmFjayBpdGVtIHdpdGhpbiB0aGlzIHdpZGdldC5cblx0ICogSGlnaGxpZ2h0cyBpdHMgcmFuZ2UgaW4gdGhlIGVkaXRvciBhbmQgbWFya3MgaXQgYXMgZm9jdXNlZC5cblx0ICovXG5cdGZvY3VzRmVlZGJhY2soZmVlZGJhY2tJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gQ2xlYXIgcHJldmlvdXMgZm9jdXNcblx0XHRmb3IgKGNvbnN0IGVsIG9mIHRoaXMuX2l0ZW1FbGVtZW50cy52YWx1ZXMoKSkge1xuXHRcdFx0ZWwuY2xhc3NMaXN0LnJlbW92ZSgnZm9jdXNlZCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZlZWRiYWNrID0gdGhpcy5fY29tbWVudEl0ZW1zLmZpbmQoZiA9PiBmLmlkID09PSBmZWVkYmFja0lkKTtcblx0XHRpZiAoIWZlZWRiYWNrKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGZvY3VzZWQgY2xhc3MgdG8gdGhlIGl0ZW1cblx0XHRjb25zdCBpdGVtRWwgPSB0aGlzLl9pdGVtRWxlbWVudHMuZ2V0KGZlZWRiYWNrSWQpO1xuXHRcdGl0ZW1FbD8uY2xhc3NMaXN0LmFkZCgnZm9jdXNlZCcpO1xuXG5cdFx0Ly8gU2hvdyByYW5nZSBoaWdobGlnaHRpbmdcblx0XHR0aGlzLl9oaWdobGlnaHRSYW5nZShmZWVkYmFjayk7XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXIgZm9jdXMgc3RhdGUgYW5kIHJhbmdlIGhpZ2hsaWdodGluZy5cblx0ICovXG5cdGNsZWFyRm9jdXMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlbCBvZiB0aGlzLl9pdGVtRWxlbWVudHMudmFsdWVzKCkpIHtcblx0XHRcdGVsLmNsYXNzTGlzdC5yZW1vdmUoJ2ZvY3VzZWQnKTtcblx0XHR9XG5cdFx0dGhpcy5fcmFuZ2VIaWdobGlnaHREZWNvcmF0aW9uLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9oaWdobGlnaHRSYW5nZShmZWVkYmFjazogSVNlc3Npb25FZGl0b3JDb21tZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IGZlZWRiYWNrLnJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoXG5cdFx0XHRmZWVkYmFjay5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDEsXG5cdFx0XHRlbmRMaW5lTnVtYmVyLCB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0TGluZU1heENvbHVtbihlbmRMaW5lTnVtYmVyKSA/PyAxXG5cdFx0KTtcblx0XHR0aGlzLl9yYW5nZUhpZ2hsaWdodERlY29yYXRpb24uc2V0KFtcblx0XHRcdHtcblx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2FnZW50LWZlZWRiYWNrLXJhbmdlLWhpZ2hsaWdodCcsXG5cdFx0XHRcdFx0Y2xhc3NOYW1lOiAncmFuZ2VIaWdobGlnaHQnLFxuXHRcdFx0XHRcdGlzV2hvbGVMaW5lOiB0cnVlLFxuXHRcdFx0XHRcdGxpbmVzRGVjb3JhdGlvbnNDbGFzc05hbWU6ICdhZ2VudC1mZWVkYmFjay13aWRnZXQtcmFuZ2UtZ2x5cGgnLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnYWdlbnQtZmVlZGJhY2stcmFuZ2UtaGlnaGxpZ2h0LW92ZXJ2aWV3Jyxcblx0XHRcdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChvdmVydmlld1J1bGVyUmFuZ2VIaWdobGlnaHQpLFxuXHRcdFx0XHRcdFx0cG9zaXRpb246IE92ZXJ2aWV3UnVsZXJMYW5lLkZ1bGwsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoaXMgd2lkZ2V0IGNvbnRhaW5zIHRoZSBnaXZlbiBmZWVkYmFjayBpdGVtIChieSBpZCkuXG5cdCAqL1xuXHRjb250YWluc0ZlZWRiYWNrKGZlZWRiYWNrSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb21tZW50SXRlbXMuc29tZShmID0+IGYuaWQgPT09IGZlZWRiYWNrSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNvbW1lbnQgaWQgd2hvc2Ugb3BlbiBjb21wb3NlciBpcyB0aGUgZ2l2ZW4gZWxlbWVudCwgb3Jcblx0ICogYHVuZGVmaW5lZGAgaWYgbm9uZS4gTGV0cyB0aGUgY29udHJpYnV0aW9uIHJlc3RvcmUgZm9jdXMgYWZ0ZXIgYSByZWJ1aWxkLlxuXHQgKi9cblx0ZmluZENvbXBvc2VyQ29tbWVudElkRm9yRWxlbWVudChlbGVtZW50OiBIVE1MRWxlbWVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBbY29tbWVudElkLCB7IHRleHRhcmVhIH1dIG9mIFsuLi50aGlzLl9hY3RpdmVFZGl0SW5wdXRzLCAuLi50aGlzLl9hY3RpdmVSZXBseUlucHV0c10pIHtcblx0XHRcdGlmICh0ZXh0YXJlYSA9PT0gZWxlbWVudCkge1xuXHRcdFx0XHRyZXR1cm4gY29tbWVudElkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIElkcyBvZiB0aGUgY29tbWVudHMgcmVuZGVyZWQgYnkgdGhpcyB3aWRnZXQuIFVzZWQgYnkgdGhlIGNvbnRyaWJ1dGlvblxuXHQgKiB0byBwcnVuZSBkcmFmdCBzdGF0ZSBmb3IgY29tbWVudHMgdGhhdCBubyBsb25nZXIgZXhpc3QuXG5cdCAqL1xuXHRnZXRDb21tZW50SWRzKCk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fY29tbWVudEl0ZW1zLm1hcChjb21tZW50ID0+IGNvbW1lbnQuaWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIHdpZGdldCBwb3NpdGlvbiBhbmQgbGF5b3V0LlxuXHQgKi9cblx0bGF5b3V0KHN0YXJ0TGluZU51bWJlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSW52YWxpZGF0ZSB0aGUgcmVzZXJ2ZWQtd2lkdGggY2FjaGUgd2hlbiB0aGUgYW5jaG9yIGxpbmUgY2hhbmdlcyBzbyBpdFxuXHRcdC8vIGlzIHJlY29tcHV0ZWQgZm9yIHRoZSBuZXcgbGluZSBkdXJpbmcgYGxheW91dE92ZXJsYXlXaWRnZXRgIGJlbG93LlxuXHRcdGlmIChzdGFydExpbmVOdW1iZXIgIT09IHRoaXMuX3N0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0dGhpcy5fY2FjaGVkTWluQ29udGVudFdpZHRoID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXJ0TGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlcjtcblxuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHRjb25zdCB7IGNvbnRlbnRMZWZ0LCBjb250ZW50V2lkdGgsIHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggfSA9IHRoaXMuX2VkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy5fZWRpdG9yLmdldFNjcm9sbFRvcCgpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0V2lkdGggPSBnZXRUb3RhbFdpZHRoKHRoaXMuX2RvbU5vZGUpIHx8IDI4MDtcblx0XHRjb25zdCB3aWRnZXRIZWlnaHQgPSB0aGlzLl9kb21Ob2RlLm9mZnNldEhlaWdodCB8fCAwO1xuXHRcdGNvbnN0IGhlYWRlckhlaWdodCA9IHRoaXMuX2hlYWRlck5vZGUub2Zmc2V0SGVpZ2h0IHx8IGxpbmVIZWlnaHQ7XG5cblx0XHQvLyBBbGlnbiB0aGUgaGVhZGVyIGNlbnRlciB3aXRoIHRoZSBzdGFydCBsaW5lIGNlbnRlciBiZWZvcmUgY2xhbXBpbmcgd2l0aGluIHRoZSBlZGl0b3IgY29udGVudCBhcmVhLlxuXHRcdGNvbnN0IGNvbnRlbnRSZWxhdGl2ZVRvcCA9IHRoaXMuX2VkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKHN0YXJ0TGluZU51bWJlcikgKyAobGluZUhlaWdodCAtIGhlYWRlckhlaWdodCkgLyAyO1xuXHRcdGNvbnN0IHNjcm9sbEhlaWdodCA9IHRoaXMuX2VkaXRvci5nZXRTY3JvbGxIZWlnaHQoKTtcblx0XHRjb25zdCBjbGFtcGVkQ29udGVudFRvcCA9IE1hdGgubWluKE1hdGgubWF4KDAsIGNvbnRlbnRSZWxhdGl2ZVRvcCksIE1hdGgubWF4KDAsIHNjcm9sbEhlaWdodCAtIHdpZGdldEhlaWdodCkpO1xuXG5cdFx0dGhpcy5fcG9zaXRpb24gPSB7XG5cdFx0XHRzdGFja09yZGluYWw6IDIsXG5cdFx0XHRwcmVmZXJlbmNlOiB7XG5cdFx0XHRcdHRvcDogY2xhbXBlZENvbnRlbnRUb3AgLSBzY3JvbGxUb3AsXG5cdFx0XHRcdGxlZnQ6IGNvbnRlbnRMZWZ0ICsgY29udGVudFdpZHRoIC0gKDIgKiB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoICsgd2lkZ2V0V2lkdGgpXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX2VkaXRvci5sYXlvdXRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3dzIG9yIGhpZGVzIHRoZSB3aWRnZXQuXG5cdCAqL1xuXHR0b2dnbGUoc2hvdzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgndmlzaWJsZScsIHNob3cpO1xuXHRcdGlmIChzaG93ICYmIHRoaXMuX2NvbW1lbnRJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLl9jb21tZW50SXRlbXNbMF0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVsYXlvdXRzIHRoZSB3aWRnZXQgYXQgaXRzIGN1cnJlbnQgbGluZSBudW1iZXIuXG5cdCAqL1xuXHRyZWxheW91dCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLl9zdGFydExpbmVOdW1iZXIpO1xuXHRcdH1cblx0fVxuXG5cdC8vIElPdmVybGF5V2lkZ2V0IGltcGxlbWVudGF0aW9uXG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5faWQ7XG5cdH1cblxuXHRnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdGdldFBvc2l0aW9uKCk6IElPdmVybGF5V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fcG9zaXRpb247XG5cdH1cblxuXHQvKipcblx0ICogUmVzZXJ2ZSBlbm91Z2ggaG9yaXpvbnRhbCBzY3JvbGwgd2lkdGggc28gdGhlIHVzZXIgY2FuIGFsd2F5cyBzY3JvbGwgdGhlXG5cdCAqIGVkaXRvciBjb250ZW50IG91dCBmcm9tIHVuZGVybmVhdGggdGhlIHdpZGdldC4gVGhlIHdpZGdldCBpcyBhbmNob3JlZCB0b1xuXHQgKiB0aGUgcmlnaHQgZWRnZSBvZiB0aGUgZWRpdG9yIGNvbnRlbnQgYXJlYSwgc28gd2l0aG91dCB0aGlzIHJlc2VydmF0aW9uIGFueVxuXHQgKiBsaW5lIHRoYXQgZXh0ZW5kcyB1bmRlciB0aGUgd2lkZ2V0IGNhbm5vdCBiZSByZXZlYWxlZCBiZWNhdXNlIHRoZSBlZGl0b3Jcblx0ICogY2Fubm90IHNjcm9sbCBwYXN0IGl0cyBsb25nZXN0IGxpbmUuXG5cdCAqXG5cdCAqIFRoZSByZXNlcnZlZCB3aWR0aCBpcyB0aGUgd2lkZ2V0IHdpZHRoIHBsdXMgdGhlIHdpZGVzdCBjb250ZW50IGFtb25nIHRoZVxuXHQgKiBhbmNob3JlZCBsaW5lIGFuZCB0aGUgbGluZXMgaW1tZWRpYXRlbHkgYWJvdmUgYW5kIGJlbG93IGl0LiBUaGUgcmVzdWx0IGlzXG5cdCAqIGNvbXB1dGVkIG9uY2UgdXNpbmcgdGhlIHJlYWwgcmVuZGVyZWQgd2lkZ2V0IHdpZHRoIGFuZCBjYWNoZWQgYWZ0ZXJ3YXJkcy5cblx0ICogVW50aWwgdGhlIHdpZGdldCBET00gbm9kZSBoYXMgYSByZWFsIHdpZHRoIHdlIGZhbGwgYmFjayB0byBhbiBlc3RpbWF0ZSBhbmRcblx0ICogc2tpcCBjYWNoaW5nIHNvIHRoZSB2YWx1ZSBpcyByZWNvbXB1dGVkIG9uY2UgaXQgaXMgYWN0dWFsbHkgcmVuZGVyZWQuIFRoZVxuXHQgKiBjYWNoZSBpcyBhbHNvIGludmFsaWRhdGVkIGJ5IGBsYXlvdXRgIHdoZW5ldmVyIHRoZSBhbmNob3IgbGluZSBjaGFuZ2VzLlxuXHQgKi9cblx0Z2V0TWluQ29udGVudFdpZHRoSW5QeCgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2NhY2hlZE1pbkNvbnRlbnRXaWR0aCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2FjaGVkTWluQ29udGVudFdpZHRoO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0Ly8gVXNlIHRoZSByZWFsIHJlbmRlcmVkIHdpZHRoIHdoZW4gYXZhaWxhYmxlLCBvdGhlcndpc2UgZmFsbCBiYWNrIHRvIGFuXG5cdFx0Ly8gZXN0aW1hdGUuIFdoZW4gZXN0aW1hdGluZyB3ZSBhdm9pZCBjYWNoaW5nIHNvIHRoZSB2YWx1ZSBpcyByZWNvbXB1dGVkXG5cdFx0Ly8gb25jZSB0aGUgd2lkZ2V0IGhhcyBhY3R1YWxseSBiZWVuIHJlbmRlcmVkLlxuXHRcdGNvbnN0IHJlbmRlcmVkV2lkdGggPSBnZXRUb3RhbFdpZHRoKHRoaXMuX2RvbU5vZGUpO1xuXHRcdGNvbnN0IGhhc1JlbmRlcmVkV2lkdGggPSByZW5kZXJlZFdpZHRoID4gMDtcblx0XHRjb25zdCB3aWRnZXRXaWR0aCA9IGhhc1JlbmRlcmVkV2lkdGggPyByZW5kZXJlZFdpZHRoIDogQWdlbnRGZWVkYmFja0VkaXRvcldpZGdldC5fZXN0aW1hdGVkV2lkZ2V0V2lkdGg7XG5cblx0XHRjb25zdCBsaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRsZXQgbWF4TGluZVdpZHRoID0gMDtcblx0XHRsZXQgbWVhc3VyZWRBbnlMaW5lID0gZmFsc2U7XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHRoaXMuX3N0YXJ0TGluZU51bWJlciAtIDE7IGxpbmVOdW1iZXIgPD0gdGhpcy5fc3RhcnRMaW5lTnVtYmVyICsgMTsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRpZiAobGluZU51bWJlciA8IDEgfHwgbGluZU51bWJlciA+IGxpbmVDb3VudCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIFJldHVybnMgLTEgd2hlbiB0aGUgbGluZSBpcyBub3QgY3VycmVudGx5IHJlbmRlcmVkOyBpZ25vcmUgdGhvc2UuXG5cdFx0XHRjb25zdCBsaW5lV2lkdGggPSB0aGlzLl9lZGl0b3IuZ2V0V2lkdGhPZkxpbmUobGluZU51bWJlcik7XG5cdFx0XHRpZiAobGluZVdpZHRoIDwgMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdG1lYXN1cmVkQW55TGluZSA9IHRydWU7XG5cdFx0XHRpZiAobGluZVdpZHRoID4gbWF4TGluZVdpZHRoKSB7XG5cdFx0XHRcdG1heExpbmVXaWR0aCA9IGxpbmVXaWR0aDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB7IHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggfSA9IHRoaXMuX2VkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbWF4TGluZVdpZHRoICsgd2lkZ2V0V2lkdGggKyAyICogdmVydGljYWxTY3JvbGxiYXJXaWR0aDtcblxuXHRcdC8vIE9ubHkgY2FjaGUgb25jZSB0aGUgY29tcHV0YXRpb24gaXMgYmFzZWQgb24gdGhlIHJlYWwgd2lkZ2V0IHdpZHRoIGFuZFxuXHRcdC8vIGF0IGxlYXN0IG9uZSBhbmNob3JlZCBsaW5lIGhhcyBhY3R1YWxseSBiZWVuIG1lYXN1cmVkOyBvdGhlcndpc2Uga2VlcFxuXHRcdC8vIHJlY29tcHV0aW5nIHNvIHRoZSB2YWx1ZSBzZXR0bGVzIG9uY2UgZXZlcnl0aGluZyBpcyByZW5kZXJlZC5cblx0XHRpZiAoaGFzUmVuZGVyZWRXaWR0aCAmJiBtZWFzdXJlZEFueUxpbmUpIHtcblx0XHRcdHRoaXMuX2NhY2hlZE1pbkNvbnRlbnRXaWR0aCA9IHJlc3VsdDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuX3JhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbi5jbGVhcigpO1xuXHRcdHRoaXMuX2VkaXRvci5yZW1vdmVPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JldmVhbENvbW1lbnQoY29tbWVudDogSVNlc3Npb25FZGl0b3JDb21tZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoXG5cdFx0XHRjb21tZW50LnJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdDEsXG5cdFx0XHRjb21tZW50LnJhbmdlLmVuZExpbmVOdW1iZXIsXG5cdFx0XHR0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0TGluZU1heENvbHVtbihjb21tZW50LnJhbmdlLmVuZExpbmVOdW1iZXIpID8/IDEsXG5cdFx0KTtcblx0XHR0aGlzLl9lZGl0b3IucmV2ZWFsUmFuZ2VJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KHJhbmdlLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUVQLFNBQVMsR0FBRyx1QkFBdUIsK0JBQStCLFdBQVcsZUFBZSxxQkFBcUI7QUFDakgsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGlCQUFpQjtBQUcxQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGFBQWE7QUFDdEIsU0FBdUMsa0JBQWtCO0FBQ3pELFNBQVMseUJBQXlCO0FBQ2xDLFlBQVksU0FBUztBQUNyQixTQUFTLGdD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
