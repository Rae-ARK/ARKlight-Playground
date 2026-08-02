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
import * as dom from "../../../../../../../base/browser/dom.js";
import { ActionBar } from "../../../../../../../base/browser/ui/actionbar/actionbar.js";
import { getDefaultHoverDelegate } from "../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Checkbox } from "../../../../../../../base/browser/ui/toggle/toggle.js";
import { Action } from "../../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { DisposableMap, DisposableStore, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { basename } from "../../../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../../../base/common/themables.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { localize } from "../../../../../../../nls.js";
import { ICommandService } from "../../../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { FileKind } from "../../../../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { ILogService } from "../../../../../../../platform/log/common/log.js";
import { defaultCheckboxStyles } from "../../../../../../../platform/theme/browser/defaultStyles.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../../../../browser/labels.js";
import { AgentFeedbackReviewCommandId, IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { ILanguageModelToolsService } from "../../../../common/tools/languageModelToolsService.js";
import { ChatContextKeys } from "../../../../common/actions/chatContextKeys.js";
import { IChatWidgetService } from "../../../chat.js";
import { IChatToolRiskAssessmentService } from "../../../tools/chatToolRiskAssessmentService.js";
import { ChatCustomConfirmationWidget } from "../chatConfirmationWidget.js";
import { AbstractToolConfirmationSubPart } from "./abstractToolConfirmationSubPart.js";
import "../media/chatAgentFeedbackReviewConfirmation.css";
let ChatAgentFeedbackReviewConfirmationSubPart = class extends AbstractToolConfirmationSubPart {
  constructor(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, riskAssessmentService, commandService, logService, hoverService) {
    super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, riskAssessmentService);
    this.commandService = commandService;
    this.logService = logService;
    this.hoverService = hoverService;
    this.codeblocks = [];
    this._rows = /* @__PURE__ */ new Map();
    this._rowStores = this._register(new DisposableMap());
    const data = toolInvocation.toolSpecificData;
    if (!data || data.kind !== "agentFeedbackReviewConfirmation") {
      throw new Error("Agent feedback review confirmation data is missing");
    }
    this._resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
    const listElement = dom.$(".chat-agent-feedback-review-list");
    void this._populate(listElement);
    const revealLabel = data.options[0] ?? localize("agentFeedback.reveal", "Reveal Selected");
    const buttons = [
      {
        label: revealLabel,
        data: () => this._onReveal()
      },
      {
        label: localize("agentFeedback.cancel", "Cancel"),
        isSecondary: true,
        data: () => this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.Skipped })
      }
    ];
    const confirmWidget = this._register(this.instantiationService.createInstance(
      ChatCustomConfirmationWidget,
      this.context,
      {
        title: this.getTitle(),
        icon: Codicon.commentDiscussion,
        message: listElement,
        buttons
      }
    ));
    const hasToolConfirmation = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
    hasToolConfirmation.set(true);
    this._register(confirmWidget.onDidClick(({ button, isTouchClick }) => {
      button.data();
      if (!isTouchClick) {
        this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.focusInput();
      }
    }));
    this._register(toDisposable(() => hasToolConfirmation.reset()));
    this.domNode = confirmWidget.domNode;
  }
  get _sessionResource() {
    return this.context.element.sessionResource;
  }
  async _populate(listElement) {
    let comments = [];
    try {
      comments = await this.commandService.executeCommand(
        AgentFeedbackReviewCommandId.GetComments,
        this._sessionResource
      ) ?? [];
    } catch (error) {
      this.logService.warn("[AgentFeedbackReview] Failed to fetch unreviewed comments", error);
    }
    if (this._store.isDisposed) {
      return;
    }
    dom.clearNode(listElement);
    if (!comments.length) {
      listElement.append(dom.$(".chat-agent-feedback-review-empty", void 0, localize("agentFeedback.none", "No unreviewed comments.")));
      return;
    }
    for (const comment of comments) {
      this._renderRow(listElement, comment);
    }
  }
  _renderRow(listElement, comment) {
    const rowStore = new DisposableStore();
    this._rowStores.set(comment.id, rowStore);
    const rowElement = dom.append(listElement, dom.$(".chat-agent-feedback-review-row"));
    const checkbox = rowStore.add(new Checkbox(
      localize("agentFeedback.revealComment", "Reveal this comment to the agent"),
      true,
      defaultCheckboxStyles
    ));
    dom.append(rowElement, checkbox.domNode);
    const main = dom.append(rowElement, dom.$(".chat-agent-feedback-review-main"));
    const header = dom.append(main, dom.$(".chat-agent-feedback-review-header"));
    if (comment.kindLabel) {
      dom.append(header, dom.$(".chat-agent-feedback-review-kind", void 0, comment.kindLabel));
    }
    const fileUri = URI.revive(comment.fileUri);
    const fileLabel = rowStore.add(this._resourceLabels.create(header));
    fileLabel.element.classList.add("chat-agent-feedback-review-file");
    fileLabel.setResource(
      { resource: fileUri, name: basename(fileUri) },
      { fileKind: FileKind.FILE, title: fileUri.fsPath || fileUri.path }
    );
    this._renderCommentText(rowStore, main, comment.text);
    const actionsContainer = dom.append(rowElement, dom.$(".chat-agent-feedback-review-actions"));
    const actionBar = rowStore.add(new ActionBar(actionsContainer));
    actionBar.push(rowStore.add(new Action(
      "agentFeedbackReview.reveal",
      localize("agentFeedback.openFile", "Open File and Reveal Comment"),
      ThemeIcon.asClassName(Codicon.goToFile),
      true,
      () => this._reveal(comment.id)
    )), { icon: true, label: false });
    actionBar.push(rowStore.add(new Action(
      "agentFeedbackReview.delete",
      localize("agentFeedback.delete", "Delete Comment"),
      ThemeIcon.asClassName(Codicon.close),
      true,
      () => this._delete(comment.id)
    )), { icon: true, label: false });
    this._rows.set(comment.id, { comment, checkbox, element: rowElement });
  }
  /**
   * Renders the comment body clamped to two visual lines by default, with an
   * expand/collapse toggle in the bottom-right corner. The toggle and the
   * fade/ellipsis affordance only appear when the text actually overflows two
   * lines; overflow is re-evaluated whenever the available width changes.
   */
  _renderCommentText(rowStore, main, text) {
    const container = dom.append(main, dom.$(".chat-agent-feedback-review-text-container"));
    const textElement = dom.append(container, dom.$(".chat-agent-feedback-review-text"));
    textElement.textContent = text;
    const toggle = dom.append(container, dom.$("button.chat-agent-feedback-review-expand-toggle"));
    toggle.type = "button";
    toggle.tabIndex = 0;
    const toggleIcon = dom.append(toggle, dom.$("span.codicon"));
    toggleIcon.setAttribute("aria-hidden", "true");
    const expandLabel = localize("agentFeedback.expandComment", "Show More");
    const collapseLabel = localize("agentFeedback.collapseComment", "Show Less");
    let expanded = false;
    const renderState = () => {
      container.classList.toggle("collapsed", !expanded);
      container.classList.toggle("expanded", expanded);
      toggleIcon.classList.toggle("codicon-chevron-down", !expanded);
      toggleIcon.classList.toggle("codicon-chevron-up", expanded);
      toggle.setAttribute("aria-label", expanded ? collapseLabel : expandLabel);
      toggle.setAttribute("aria-expanded", String(expanded));
    };
    const isOverflowing = () => {
      const wasExpanded = expanded;
      if (wasExpanded) {
        container.classList.add("collapsed");
        container.classList.remove("expanded");
      }
      const overflowing = textElement.scrollHeight - textElement.clientHeight > 1;
      if (wasExpanded) {
        container.classList.remove("collapsed");
        container.classList.add("expanded");
      }
      return overflowing;
    };
    const updateOverflow = () => {
      const overflowing = isOverflowing();
      container.classList.toggle("overflowing", overflowing);
      if (!overflowing && expanded) {
        expanded = false;
        renderState();
      }
    };
    rowStore.add(this.hoverService.setupManagedHover(
      getDefaultHoverDelegate("element"),
      toggle,
      () => expanded ? collapseLabel : expandLabel
    ));
    rowStore.add(dom.addDisposableListener(toggle, dom.EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      expanded = !expanded;
      renderState();
    }));
    renderState();
    const targetWindow = dom.getWindow(container);
    const observer = new targetWindow.ResizeObserver(() => updateOverflow());
    observer.observe(textElement);
    rowStore.add(toDisposable(() => observer.disconnect()));
  }
  async _reveal(commentId) {
    try {
      await this.commandService.executeCommand(AgentFeedbackReviewCommandId.Reveal, this._sessionResource, commentId);
    } catch (error) {
      this.logService.warn("[AgentFeedbackReview] Failed to reveal comment", error);
    }
  }
  async _delete(commentId) {
    const row = this._rows.get(commentId);
    try {
      await this.commandService.executeCommand(AgentFeedbackReviewCommandId.Delete, this._sessionResource, commentId);
      row?.element.remove();
      this._rows.delete(commentId);
      this._rowStores.deleteAndDispose(commentId);
    } catch (error) {
      this.logService.warn("[AgentFeedbackReview] Failed to delete comment", error);
    }
  }
  async _onReveal() {
    const checkedIds = [];
    for (const row of this._rows.values()) {
      if (row.checkbox.checked) {
        checkedIds.push(row.comment.id);
      }
    }
    if (checkedIds.length) {
      try {
        await this.commandService.executeCommand(AgentFeedbackReviewCommandId.Accept, this._sessionResource, checkedIds);
      } catch (error) {
        this.logService.warn("[AgentFeedbackReview] Failed to accept comments", error);
      }
    }
    this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction });
  }
  createContentElement() {
    return "";
  }
  getTitle() {
    const state = this.toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return "";
    }
    const title = state.confirmationMessages?.title;
    return typeof title === "string" ? title : title?.value ?? "";
  }
};
ChatAgentFeedbackReviewConfirmationSubPart = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, ILanguageModelToolsService),
  __decorateParam(7, IChatToolRiskAssessmentService),
  __decorateParam(8, ICommandService),
  __decorateParam(9, ILogService),
  __decorateParam(10, IHoverService)
], ChatAgentFeedbackReviewConfirmationSubPart);
export {
  ChatAgentFeedbackReviewConfirmationSubPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRBZ2VudEZlZWRiYWNrUmV2aWV3Q29uZmlybWF0aW9uU3ViUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IENoZWNrYm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q2hlY2tib3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IEFnZW50RmVlZGJhY2tSZXZpZXdDb21tYW5kSWQsIElDaGF0QWdlbnRGZWVkYmFja1Jldmlld0NvbW1lbnQsIElDaGF0VG9vbEludm9jYXRpb24sIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvZGVCbG9ja0luZm8sIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdG9vbHMvY2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENoYXRDdXN0b21Db25maXJtYXRpb25XaWRnZXQsIElDaGF0Q29uZmlybWF0aW9uQnV0dG9uIH0gZnJvbSAnLi4vY2hhdENvbmZpcm1hdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFRvb2xDb25maXJtYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi9hYnN0cmFjdFRvb2xDb25maXJtYXRpb25TdWJQYXJ0LmpzJztcbmltcG9ydCAnLi4vbWVkaWEvY2hhdEFnZW50RmVlZGJhY2tSZXZpZXdDb25maXJtYXRpb24uY3NzJztcblxuaW50ZXJmYWNlIElDb21tZW50Um93IHtcblx0cmVhZG9ubHkgY29tbWVudDogSUNoYXRBZ2VudEZlZWRiYWNrUmV2aWV3Q29tbWVudDtcblx0cmVhZG9ubHkgY2hlY2tib3g6IENoZWNrYm94O1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcbn1cblxuLyoqXG4gKiBDb25maXJtYXRpb24gZm9yIHRoZSBhZ2VudCBob3N0IGB2aWV3VW5yZXZpZXdlZENvbW1lbnRzYCB0b29sLiBMaXN0cyB0aGVcbiAqIHJldmlldyBjb21tZW50cyB0aGUgdXNlciBoYXMgbm90IGFjY2VwdGVkIHlldCBcdTIwMTQgZWFjaCB3aXRoIGEgY2hlY2tib3ggKHJldmVhbFxuICogdG8gdGhlIGFnZW50IG9yIG5vdCksIGFuIGFjdGlvbiB0byBvcGVuIHRoZSBmaWxlIGF0IHRoZSBjb21tZW50LCBhbmQgYW5cbiAqIGFjdGlvbiB0byBkZWxldGUgdGhlIGNvbW1lbnQuIEFjY2VwdGluZyByZXZlYWxzIChhY2NlcHRzKSB0aGUgY2hlY2tlZFxuICogY29tbWVudHMgYmVmb3JlIGFwcHJvdmluZyB0aGUgdG9vbCBjYWxsOyB0aGUgY29tbWVudHMgYW5kIGFsbCBhY3Rpb25zIGFyZVxuICogZmV0Y2hlZC9hcHBsaWVkIHZpYSB7QGxpbmsgQWdlbnRGZWVkYmFja1Jldmlld0NvbW1hbmRJZH0gY29tbWFuZHMgc28gdGhpc1xuICogbGF5ZXIgc3RheXMgZGVjb3VwbGVkIGZyb20gdGhlIGB2cy9zZXNzaW9uc2AgZmVlZGJhY2sgbW9kZWwuXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0QWdlbnRGZWVkYmFja1Jldmlld0NvbmZpcm1hdGlvblN1YlBhcnQgZXh0ZW5kcyBBYnN0cmFjdFRvb2xDb25maXJtYXRpb25TdWJQYXJ0IHtcblx0cHVibGljIG92ZXJyaWRlIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwdWJsaWMgb3ZlcnJpZGUgcmVhZG9ubHkgY29kZWJsb2NrczogSUNoYXRDb2RlQmxvY2tJbmZvW10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yb3dzID0gbmV3IE1hcDxzdHJpbmcsIElDb21tZW50Um93PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yb3dTdG9yZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbixcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2Ugcmlza0Fzc2Vzc21lbnRTZXJ2aWNlOiBJQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0LCBpbnN0YW50aWF0aW9uU2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBjaGF0V2lkZ2V0U2VydmljZSwgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgcmlza0Fzc2Vzc21lbnRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGRhdGEgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhO1xuXHRcdGlmICghZGF0YSB8fCBkYXRhLmtpbmQgIT09ICdhZ2VudEZlZWRiYWNrUmV2aWV3Q29uZmlybWF0aW9uJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBZ2VudCBmZWVkYmFjayByZXZpZXcgY29uZmlybWF0aW9uIGRhdGEgaXMgbWlzc2luZycpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Jlc291cmNlTGFiZWxzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVscywgREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSKSk7XG5cblx0XHRjb25zdCBsaXN0RWxlbWVudCA9IGRvbS4kKCcuY2hhdC1hZ2VudC1mZWVkYmFjay1yZXZpZXctbGlzdCcpO1xuXHRcdHZvaWQgdGhpcy5fcG9wdWxhdGUobGlzdEVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgcmV2ZWFsTGFiZWwgPSBkYXRhLm9wdGlvbnNbMF0gPz8gbG9jYWxpemUoJ2FnZW50RmVlZGJhY2sucmV2ZWFsJywgXCJSZXZlYWwgU2VsZWN0ZWRcIik7XG5cdFx0Y29uc3QgYnV0dG9uczogSUNoYXRDb25maXJtYXRpb25CdXR0b248KCkgPT4gdm9pZD5bXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IHJldmVhbExhYmVsLFxuXHRcdFx0XHRkYXRhOiAoKSA9PiB0aGlzLl9vblJldmVhbCgpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudEZlZWRiYWNrLmNhbmNlbCcsIFwiQ2FuY2VsXCIpLFxuXHRcdFx0XHRpc1NlY29uZGFyeTogdHJ1ZSxcblx0XHRcdFx0ZGF0YTogKCkgPT4gdGhpcy5jb25maXJtV2l0aCh0aGlzLnRvb2xJbnZvY2F0aW9uLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkIH0pLFxuXHRcdFx0fSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgY29uZmlybVdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0Q3VzdG9tQ29uZmlybWF0aW9uV2lkZ2V0PCgpID0+IHZvaWQ+LFxuXHRcdFx0dGhpcy5jb250ZXh0LFxuXHRcdFx0e1xuXHRcdFx0XHR0aXRsZTogdGhpcy5nZXRUaXRsZSgpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNvbW1lbnREaXNjdXNzaW9uLFxuXHRcdFx0XHRtZXNzYWdlOiBsaXN0RWxlbWVudCxcblx0XHRcdFx0YnV0dG9ucyxcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdGNvbnN0IGhhc1Rvb2xDb25maXJtYXRpb24gPSBDaGF0Q29udGV4dEtleXMuRWRpdGluZy5oYXNUb29sQ29uZmlybWF0aW9uLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRoYXNUb29sQ29uZmlybWF0aW9uLnNldCh0cnVlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpcm1XaWRnZXQub25EaWRDbGljaygoeyBidXR0b24sIGlzVG91Y2hDbGljayB9KSA9PiB7XG5cdFx0XHRidXR0b24uZGF0YSgpO1xuXHRcdFx0aWYgKCFpc1RvdWNoQ2xpY2spIHtcblx0XHRcdFx0dGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSh0aGlzLmNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpPy5mb2N1c0lucHV0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGhhc1Rvb2xDb25maXJtYXRpb24ucmVzZXQoKSkpO1xuXHRcdHRoaXMuZG9tTm9kZSA9IGNvbmZpcm1XaWRnZXQuZG9tTm9kZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IF9zZXNzaW9uUmVzb3VyY2UoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5jb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcG9wdWxhdGUobGlzdEVsZW1lbnQ6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGNvbW1lbnRzOiByZWFkb25seSBJQ2hhdEFnZW50RmVlZGJhY2tSZXZpZXdDb21tZW50W10gPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0Y29tbWVudHMgPSBhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPElDaGF0QWdlbnRGZWVkYmFja1Jldmlld0NvbW1lbnRbXT4oXG5cdFx0XHRcdEFnZW50RmVlZGJhY2tSZXZpZXdDb21tYW5kSWQuR2V0Q29tbWVudHMsXG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSxcblx0XHRcdCkgPz8gW107XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbQWdlbnRGZWVkYmFja1Jldmlld10gRmFpbGVkIHRvIGZldGNoIHVucmV2aWV3ZWQgY29tbWVudHMnLCBlcnJvcik7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRkb20uY2xlYXJOb2RlKGxpc3RFbGVtZW50KTtcblx0XHRpZiAoIWNvbW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0bGlzdEVsZW1lbnQuYXBwZW5kKGRvbS4kKCcuY2hhdC1hZ2VudC1mZWVkYmFjay1yZXZpZXctZW1wdHknLCB1bmRlZmluZWQsIGxvY2FsaXplKCdhZ2VudEZlZWRiYWNrLm5vbmUnLCBcIk5vIHVucmV2aWV3ZWQgY29tbWVudHMuXCIpKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBjb21tZW50IG9mIGNvbW1lbnRzKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJSb3cobGlzdEVsZW1lbnQsIGNvbW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclJvdyhsaXN0RWxlbWVudDogSFRNTEVsZW1lbnQsIGNvbW1lbnQ6IElDaGF0QWdlbnRGZWVkYmFja1Jldmlld0NvbW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCByb3dTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9yb3dTdG9yZXMuc2V0KGNvbW1lbnQuaWQsIHJvd1N0b3JlKTtcblx0XHRjb25zdCByb3dFbGVtZW50ID0gZG9tLmFwcGVuZChsaXN0RWxlbWVudCwgZG9tLiQoJy5jaGF0LWFnZW50LWZlZWRiYWNrLXJldmlldy1yb3cnKSk7XG5cblx0XHRjb25zdCBjaGVja2JveCA9IHJvd1N0b3JlLmFkZChuZXcgQ2hlY2tib3goXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRGZWVkYmFjay5yZXZlYWxDb21tZW50JywgXCJSZXZlYWwgdGhpcyBjb21tZW50IHRvIHRoZSBhZ2VudFwiKSxcblx0XHRcdHRydWUsXG5cdFx0XHRkZWZhdWx0Q2hlY2tib3hTdHlsZXMsXG5cdFx0KSk7XG5cdFx0ZG9tLmFwcGVuZChyb3dFbGVtZW50LCBjaGVja2JveC5kb21Ob2RlKTtcblxuXHRcdGNvbnN0IG1haW4gPSBkb20uYXBwZW5kKHJvd0VsZW1lbnQsIGRvbS4kKCcuY2hhdC1hZ2VudC1mZWVkYmFjay1yZXZpZXctbWFpbicpKTtcblx0XHRjb25zdCBoZWFkZXIgPSBkb20uYXBwZW5kKG1haW4sIGRvbS4kKCcuY2hhdC1hZ2VudC1mZWVkYmFjay1yZXZpZXctaGVhZGVyJykpO1xuXHRcdGlmIChjb21tZW50LmtpbmRMYWJlbCkge1xuXHRcdFx0ZG9tLmFwcGVuZChoZWFkZXIsIGRvbS4kKCcuY2hhdC1hZ2VudC1mZWVkYmFjay1yZXZpZXcta2luZCcsIHVuZGVmaW5lZCwgY29tbWVudC5raW5kTGFiZWwpKTtcblx0XHR9XG5cdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5yZXZpdmUoY29tbWVudC5maWxlVXJpKTtcblx0XHRjb25zdCBmaWxlTGFiZWwgPSByb3dTdG9yZS5hZGQodGhpcy5fcmVzb3VyY2VMYWJlbHMuY3JlYXRlKGhlYWRlcikpO1xuXHRcdGZpbGVMYWJlbC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtYWdlbnQtZmVlZGJhY2stcmV2aWV3LWZpbGUnKTtcblx0XHRmaWxlTGFiZWwuc2V0UmVzb3VyY2UoXG5cdFx0XHR7IHJlc291cmNlOiBmaWxlVXJpLCBuYW1lOiBiYXNlbmFtZShmaWxlVXJpKSB9LFxuXHRcdFx0eyBmaWxlS2luZDogRmlsZUtpbmQuRklMRSwgdGl0bGU6IGZpbGVVcmkuZnNQYXRoIHx8IGZpbGVVcmkucGF0aCB9LFxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZW5kZXJDb21tZW50VGV4dChyb3dTdG9yZSwgbWFpbiwgY29tbWVudC50ZXh0KTtcblxuXHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSBkb20uYXBwZW5kKHJvd0VsZW1lbnQsIGRvbS4kKCcuY2hhdC1hZ2VudC1mZWVkYmFjay1yZXZpZXctYWN0aW9ucycpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSByb3dTdG9yZS5hZGQobmV3IEFjdGlvbkJhcihhY3Rpb25zQ29udGFpbmVyKSk7XG5cdFx0YWN0aW9uQmFyLnB1c2gocm93U3RvcmUuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHQnYWdlbnRGZWVkYmFja1Jldmlldy5yZXZlYWwnLFxuXHRcdFx0bG9jYWxpemUoJ2FnZW50RmVlZGJhY2sub3BlbkZpbGUnLCBcIk9wZW4gRmlsZSBhbmQgUmV2ZWFsIENvbW1lbnRcIiksXG5cdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5nb1RvRmlsZSksXG5cdFx0XHR0cnVlLFxuXHRcdFx0KCkgPT4gdGhpcy5fcmV2ZWFsKGNvbW1lbnQuaWQpLFxuXHRcdCkpLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHRhY3Rpb25CYXIucHVzaChyb3dTdG9yZS5hZGQobmV3IEFjdGlvbihcblx0XHRcdCdhZ2VudEZlZWRiYWNrUmV2aWV3LmRlbGV0ZScsXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRGZWVkYmFjay5kZWxldGUnLCBcIkRlbGV0ZSBDb21tZW50XCIpLFxuXHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2UpLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCgpID0+IHRoaXMuX2RlbGV0ZShjb21tZW50LmlkKSxcblx0XHQpKSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cblx0XHR0aGlzLl9yb3dzLnNldChjb21tZW50LmlkLCB7IGNvbW1lbnQsIGNoZWNrYm94LCBlbGVtZW50OiByb3dFbGVtZW50IH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgdGhlIGNvbW1lbnQgYm9keSBjbGFtcGVkIHRvIHR3byB2aXN1YWwgbGluZXMgYnkgZGVmYXVsdCwgd2l0aCBhblxuXHQgKiBleHBhbmQvY29sbGFwc2UgdG9nZ2xlIGluIHRoZSBib3R0b20tcmlnaHQgY29ybmVyLiBUaGUgdG9nZ2xlIGFuZCB0aGVcblx0ICogZmFkZS9lbGxpcHNpcyBhZmZvcmRhbmNlIG9ubHkgYXBwZWFyIHdoZW4gdGhlIHRleHQgYWN0dWFsbHkgb3ZlcmZsb3dzIHR3b1xuXHQgKiBsaW5lczsgb3ZlcmZsb3cgaXMgcmUtZXZhbHVhdGVkIHdoZW5ldmVyIHRoZSBhdmFpbGFibGUgd2lkdGggY2hhbmdlcy5cblx0ICovXG5cdHByaXZhdGUgX3JlbmRlckNvbW1lbnRUZXh0KHJvd1N0b3JlOiBEaXNwb3NhYmxlU3RvcmUsIG1haW46IEhUTUxFbGVtZW50LCB0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uYXBwZW5kKG1haW4sIGRvbS4kKCcuY2hhdC1hZ2VudC1mZWVkYmFjay1yZXZpZXctdGV4dC1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgdGV4dEVsZW1lbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5jaGF0LWFnZW50LWZlZWRiYWNrLXJldmlldy10ZXh0JykpO1xuXHRcdHRleHRFbGVtZW50LnRleHRDb250ZW50ID0gdGV4dDtcblxuXHRcdGNvbnN0IHRvZ2dsZSA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJDxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbi5jaGF0LWFnZW50LWZlZWRiYWNrLXJldmlldy1leHBhbmQtdG9nZ2xlJykpO1xuXHRcdHRvZ2dsZS50eXBlID0gJ2J1dHRvbic7XG5cdFx0dG9nZ2xlLnRhYkluZGV4ID0gMDtcblx0XHRjb25zdCB0b2dnbGVJY29uID0gZG9tLmFwcGVuZCh0b2dnbGUsIGRvbS4kKCdzcGFuLmNvZGljb24nKSk7XG5cdFx0dG9nZ2xlSWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdGNvbnN0IGV4cGFuZExhYmVsID0gbG9jYWxpemUoJ2FnZW50RmVlZGJhY2suZXhwYW5kQ29tbWVudCcsIFwiU2hvdyBNb3JlXCIpO1xuXHRcdGNvbnN0IGNvbGxhcHNlTGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRGZWVkYmFjay5jb2xsYXBzZUNvbW1lbnQnLCBcIlNob3cgTGVzc1wiKTtcblxuXHRcdGxldCBleHBhbmRlZCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgcmVuZGVyU3RhdGUgPSAoKSA9PiB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY29sbGFwc2VkJywgIWV4cGFuZGVkKTtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdleHBhbmRlZCcsIGV4cGFuZGVkKTtcblx0XHRcdHRvZ2dsZUljb24uY2xhc3NMaXN0LnRvZ2dsZSgnY29kaWNvbi1jaGV2cm9uLWRvd24nLCAhZXhwYW5kZWQpO1xuXHRcdFx0dG9nZ2xlSWNvbi5jbGFzc0xpc3QudG9nZ2xlKCdjb2RpY29uLWNoZXZyb24tdXAnLCBleHBhbmRlZCk7XG5cdFx0XHR0b2dnbGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgZXhwYW5kZWQgPyBjb2xsYXBzZUxhYmVsIDogZXhwYW5kTGFiZWwpO1xuXHRcdFx0dG9nZ2xlLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyhleHBhbmRlZCkpO1xuXHRcdH07XG5cblx0XHRjb25zdCBpc092ZXJmbG93aW5nID0gKCk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0Ly8gYHNjcm9sbEhlaWdodGAgcmVmbGVjdHMgdGhlIGZ1bGwgY29udGVudCBoZWlnaHQgZXZlbiB3aGlsZSBjbGFtcGVkLFxuXHRcdFx0Ly8gc28gY29tcGFyZSBpdCBhZ2FpbnN0IHRoZSAoY2xhbXBlZCkgYGNsaWVudEhlaWdodGAuIE1lYXN1cmUgaW4gdGhlXG5cdFx0XHQvLyBjb2xsYXBzZWQgc3RhdGUsIHJlc3RvcmluZyB0aGUgcHJldmlvdXMgc3RhdGUgaW4gdGhlIHNhbWUgZnJhbWUgc29cblx0XHRcdC8vIG5vIGludGVybWVkaWF0ZSBsYXlvdXQgaXMgcGFpbnRlZC5cblx0XHRcdGNvbnN0IHdhc0V4cGFuZGVkID0gZXhwYW5kZWQ7XG5cdFx0XHRpZiAod2FzRXhwYW5kZWQpIHtcblx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NvbGxhcHNlZCcpO1xuXHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnZXhwYW5kZWQnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG92ZXJmbG93aW5nID0gdGV4dEVsZW1lbnQuc2Nyb2xsSGVpZ2h0IC0gdGV4dEVsZW1lbnQuY2xpZW50SGVpZ2h0ID4gMTtcblx0XHRcdGlmICh3YXNFeHBhbmRlZCkge1xuXHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnY29sbGFwc2VkJyk7XG5cdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdleHBhbmRlZCcpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG92ZXJmbG93aW5nO1xuXHRcdH07XG5cblx0XHRjb25zdCB1cGRhdGVPdmVyZmxvdyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IG92ZXJmbG93aW5nID0gaXNPdmVyZmxvd2luZygpO1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ292ZXJmbG93aW5nJywgb3ZlcmZsb3dpbmcpO1xuXHRcdFx0aWYgKCFvdmVyZmxvd2luZyAmJiBleHBhbmRlZCkge1xuXHRcdFx0XHRleHBhbmRlZCA9IGZhbHNlO1xuXHRcdFx0XHRyZW5kZXJTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyb3dTdG9yZS5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoXG5cdFx0XHRnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLFxuXHRcdFx0dG9nZ2xlLFxuXHRcdFx0KCkgPT4gZXhwYW5kZWQgPyBjb2xsYXBzZUxhYmVsIDogZXhwYW5kTGFiZWwsXG5cdFx0KSk7XG5cblx0XHRyb3dTdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0b2dnbGUsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGV4cGFuZGVkID0gIWV4cGFuZGVkO1xuXHRcdFx0cmVuZGVyU3RhdGUoKTtcblx0XHR9KSk7XG5cblx0XHRyZW5kZXJTdGF0ZSgpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyhjb250YWluZXIpO1xuXHRcdGNvbnN0IG9ic2VydmVyID0gbmV3IHRhcmdldFdpbmRvdy5SZXNpemVPYnNlcnZlcigoKSA9PiB1cGRhdGVPdmVyZmxvdygpKTtcblx0XHRvYnNlcnZlci5vYnNlcnZlKHRleHRFbGVtZW50KTtcblx0XHRyb3dTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG9ic2VydmVyLmRpc2Nvbm5lY3QoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmV2ZWFsKGNvbW1lbnRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQWdlbnRGZWVkYmFja1Jldmlld0NvbW1hbmRJZC5SZXZlYWwsIHRoaXMuX3Nlc3Npb25SZXNvdXJjZSwgY29tbWVudElkKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1tBZ2VudEZlZWRiYWNrUmV2aWV3XSBGYWlsZWQgdG8gcmV2ZWFsIGNvbW1lbnQnLCBlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGVsZXRlKGNvbW1lbnRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgcm93ID0gdGhpcy5fcm93cy5nZXQoY29tbWVudElkKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBZ2VudEZlZWRiYWNrUmV2aWV3Q29tbWFuZElkLkRlbGV0ZSwgdGhpcy5fc2Vzc2lvblJlc291cmNlLCBjb21tZW50SWQpO1xuXHRcdFx0cm93Py5lbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5fcm93cy5kZWxldGUoY29tbWVudElkKTtcblx0XHRcdHRoaXMuX3Jvd1N0b3Jlcy5kZWxldGVBbmREaXNwb3NlKGNvbW1lbnRJZCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbQWdlbnRGZWVkYmFja1Jldmlld10gRmFpbGVkIHRvIGRlbGV0ZSBjb21tZW50JywgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29uUmV2ZWFsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoZWNrZWRJZHM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCByb3cgb2YgdGhpcy5fcm93cy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHJvdy5jaGVja2JveC5jaGVja2VkKSB7XG5cdFx0XHRcdGNoZWNrZWRJZHMucHVzaChyb3cuY29tbWVudC5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEFjY2VwdCB0aGUgY2hlY2tlZCBjb21tZW50cyBiZWZvcmUgYXBwcm92aW5nIHRoZSB0b29sIGNhbGwgc28gdGhlXG5cdFx0Ly8gYW5ub3RhdGlvbiB3cml0ZXMgYXJlIGRpc3BhdGNoZWQgYWhlYWQgb2YgdGhlIGFwcHJvdmFsIG9uIHRoZSBzYW1lXG5cdFx0Ly8gY29ubmVjdGlvbjsgdGhlIHNlcnZlciB0b29sIGJvZHkgdGhlbiByZWFkcyB0aGUgdXBkYXRlZCBzdGF0ZSBhbmRcblx0XHQvLyByZXR1cm5zIGV4YWN0bHkgdGhlIHJldmVhbGVkIGNvbW1lbnRzLlxuXHRcdGlmIChjaGVja2VkSWRzLmxlbmd0aCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBZ2VudEZlZWRiYWNrUmV2aWV3Q29tbWFuZElkLkFjY2VwdCwgdGhpcy5fc2Vzc2lvblJlc291cmNlLCBjaGVja2VkSWRzKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbQWdlbnRGZWVkYmFja1Jldmlld10gRmFpbGVkIHRvIGFjY2VwdCBjb21tZW50cycsIGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5jb25maXJtV2l0aCh0aGlzLnRvb2xJbnZvY2F0aW9uLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUNvbnRlbnRFbGVtZW50KCk6IEhUTUxFbGVtZW50IHwgc3RyaW5nIHtcblx0XHQvLyBUaGlzIGNvbmZpcm1hdGlvbiBidWlsZHMgaXRzIG93biB3aWRnZXQgY29udGVudCAodGhlIGNvbW1lbnQgbGlzdCkgaW5cblx0XHQvLyB0aGUgY29uc3RydWN0b3IgYW5kIG5ldmVyIGdvZXMgdGhyb3VnaCB0aGUgYmFzZSBgcmVuZGVyKClgIGZsb3csIHNvXG5cdFx0Ly8gdGhpcyBpcyB1bnVzZWQuIFJldHVybiBhbiBlbXB0eSBzdHJpbmcgcmF0aGVyIHRoYW4gdGhyb3dpbmcgc28gdGhlXG5cdFx0Ly8gY2xhc3Mgc3RheXMgc2FmZSBpZiBhIGZ1dHVyZSByZWZhY3RvciByb3V0ZXMgdGhyb3VnaCBgcmVuZGVyKClgLlxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRUaXRsZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy50b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRpZiAoc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRjb25zdCB0aXRsZSA9IHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZTtcblx0XHRyZXR1cm4gdHlwZW9mIHRpdGxlID09PSAnc3RyaW5nJyA/IHRpdGxlIDogdGl0bGU/LnZhbHVlID8/ICcnO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZSxpQkFBaUIsb0JBQW9CO0FBQzdELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQixzQkFBc0I7QUFDekQsU0FBUyw4QkFBK0QscUJBQXFCLHVCQUF1QjtBQUNwSCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUE2QiwwQkFBMEI7QUFDdkQsU0FBUyxzQ0FBc0M7QUFFL0MsU0FBUyxvQ0FBNkQ7QUFDdEUsU0FBUyx1Q0FBdUM7QUFDaEQsT0FBTztBQWlCQSxJQUFNLDZDQUFOLGNBQXlE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
