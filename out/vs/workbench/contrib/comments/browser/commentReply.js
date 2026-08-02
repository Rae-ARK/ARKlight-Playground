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
import * as dom from "../../../../base/browser/dom.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from "../../../../base/browser/ui/mouseCursor/mouseCursor.js";
import { Disposable, dispose } from "../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { FileAccess, Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { CommentFormActions } from "./commentFormActions.js";
import { ICommentService } from "./commentService.js";
import { CommentContextKeys } from "../common/commentContextKeys.js";
import { MIN_EDITOR_HEIGHT, SimpleCommentEditor, calculateEditorHeight } from "./simpleCommentEditor.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { Position } from "../../../../editor/common/core/position.js";
let INMEM_MODEL_ID = 0;
const COMMENTEDITOR_DECORATION_KEY = "commenteditordecoration";
let CommentReply = class extends Disposable {
  constructor(owner, container, _parentEditor, _commentThread, _scopedInstatiationService, _contextKeyService, _commentMenus, _commentOptions, _pendingComment, _parentThread, focus, _actionRunDelegate, commentService, configurationService, keybindingService, contextMenuService, hoverService, textModelService) {
    super();
    this.owner = owner;
    this._parentEditor = _parentEditor;
    this._commentThread = _commentThread;
    this._scopedInstatiationService = _scopedInstatiationService;
    this._contextKeyService = _contextKeyService;
    this._commentMenus = _commentMenus;
    this._commentOptions = _commentOptions;
    this._pendingComment = _pendingComment;
    this._parentThread = _parentThread;
    this._actionRunDelegate = _actionRunDelegate;
    this.commentService = commentService;
    this.keybindingService = keybindingService;
    this.contextMenuService = contextMenuService;
    this.hoverService = hoverService;
    this.textModelService = textModelService;
    this._commentThreadDisposables = [];
    this._editorHeight = MIN_EDITOR_HEIGHT;
    this._container = dom.append(container, dom.$(".comment-form-container"));
    this._form = dom.append(this._container, dom.$(".comment-form"));
    this.commentEditor = this._register(this._scopedInstatiationService.createInstance(SimpleCommentEditor, this._form, SimpleCommentEditor.getEditorOptions(configurationService), _contextKeyService, this._parentThread));
    this.commentEditorIsEmpty = CommentContextKeys.commentIsEmpty.bindTo(this._contextKeyService);
    this.commentEditorIsEmpty.set(!this._pendingComment);
    this.initialize(focus);
  }
  async initialize(focus) {
    this.avatar = dom.append(this._form, dom.$(".avatar-container"));
    this.updateAuthorInfo();
    const hasExistingComments = this._commentThread.comments && this._commentThread.comments.length > 0;
    const modeId = generateUuid() + "-" + (hasExistingComments ? this._commentThread.threadId : ++INMEM_MODEL_ID);
    let resource = URI.from({
      scheme: Schemas.commentsInput,
      path: `/${this._commentThread.extensionId}/commentinput-${modeId}.md`
    });
    const commentController = this.commentService.getCommentController(this.owner);
    if (commentController) {
      resource = resource.with({ authority: commentController.id });
    }
    const model = await this.textModelService.createModelReference(resource);
    model.object.textEditorModel.setValue(this._pendingComment?.body || "");
    this._register(model);
    this.commentEditor.setModel(model.object.textEditorModel);
    if (this._pendingComment) {
      this.commentEditor.setPosition(this._pendingComment.cursor);
    }
    this.calculateEditorHeight();
    this._register(model.object.textEditorModel.onDidChangeContent(() => {
      this.setCommentEditorDecorations();
      this.commentEditorIsEmpty?.set(!this.commentEditor.getValue());
      if (this.calculateEditorHeight()) {
        this.commentEditor.layout({ height: this._editorHeight, width: this.commentEditor.getLayoutInfo().width });
        this.commentEditor.render(true);
      }
    }));
    this.createTextModelListener(this.commentEditor, this._form);
    this.setCommentEditorDecorations();
    if (this._pendingComment) {
      this.expandReplyArea();
    } else if (hasExistingComments) {
      this.createReplyButton(this.commentEditor, this._form);
    } else if (this._commentThread.comments && this._commentThread.comments.length === 0) {
      this.expandReplyArea(focus);
    }
    this._error = dom.append(this._container, dom.$(".validation-error.hidden"));
    const formActions = dom.append(this._container, dom.$(".form-actions"));
    this._formActions = dom.append(formActions, dom.$(".other-actions"));
    this.createCommentWidgetFormActions(this._formActions, model.object.textEditorModel);
    this._editorActions = dom.append(formActions, dom.$(".editor-actions"));
    this.createCommentWidgetEditorActions(this._editorActions, model.object.textEditorModel);
  }
  calculateEditorHeight() {
    const newEditorHeight = calculateEditorHeight(this._parentEditor, this.commentEditor, this._editorHeight);
    if (newEditorHeight !== this._editorHeight) {
      this._editorHeight = newEditorHeight;
      return true;
    }
    return false;
  }
  updateCommentThread(commentThread) {
    const isReplying = this.commentEditor.hasTextFocus();
    const oldAndNewBothEmpty = !this._commentThread.comments?.length && !commentThread.comments?.length;
    if (!this._reviewThreadReplyButton) {
      this.createReplyButton(this.commentEditor, this._form);
    }
    if (this._commentThread.comments && this._commentThread.comments.length === 0 && !oldAndNewBothEmpty) {
      this.expandReplyArea();
    }
    if (isReplying) {
      this.commentEditor.focus();
    }
  }
  getPendingComment() {
    const model = this.commentEditor.getModel();
    if (model && model.getValueLength() > 0) {
      return { body: model.getValue(), cursor: this.commentEditor.getPosition() ?? new Position(1, 1) };
    }
    return void 0;
  }
  setPendingComment(pending) {
    this._pendingComment = pending;
    this.expandReplyArea();
    this.commentEditor.setValue(pending.body);
    this.commentEditor.setPosition(pending.cursor);
  }
  layout(widthInPixel) {
    this.commentEditor.layout({
      height: this._editorHeight,
      width: widthInPixel - 54
      /* margin 20px * 10 + scrollbar 14px*/
    });
  }
  focusIfNeeded() {
    if (!this._commentThread.comments || !this._commentThread.comments.length) {
      this.commentEditor.focus();
    } else if ((this.commentEditor.getModel()?.getValueLength() ?? 0) > 0) {
      this.expandReplyArea();
    }
  }
  focusCommentEditor() {
    this.commentEditor.focus();
  }
  expandReplyAreaAndFocusCommentEditor() {
    this.expandReplyArea();
    this.commentEditor.focus();
  }
  isCommentEditorFocused() {
    return this.commentEditor.hasWidgetFocus();
  }
  updateAuthorInfo() {
    this.avatar.textContent = "";
    if (typeof this._commentThread.canReply !== "boolean" && this._commentThread.canReply.iconPath) {
      this.avatar.style.display = "block";
      const img = dom.append(this.avatar, dom.$("img.avatar"));
      img.src = FileAccess.uriToBrowserUri(URI.revive(this._commentThread.canReply.iconPath)).toString(true);
    } else {
      this.avatar.style.display = "none";
    }
  }
  updateCanReply() {
    this.updateAuthorInfo();
    if (!this._commentThread.canReply) {
      this._container.style.display = "none";
    } else {
      this._container.style.display = "block";
    }
  }
  async submitComment() {
    await this._commentFormActions?.triggerDefaultAction();
    this._pendingComment = void 0;
  }
  setCommentEditorDecorations() {
    const hasExistingComments = this._commentThread.comments && this._commentThread.comments.length > 0;
    const placeholder = hasExistingComments ? this._commentOptions?.placeHolder || nls.localize("reply", "Reply...") : this._commentOptions?.placeHolder || nls.localize("newComment", "Type a new comment");
    this.commentEditor.updateOptions({ placeholder });
  }
  createTextModelListener(commentEditor, commentForm) {
    this._commentThreadDisposables.push(commentEditor.onDidFocusEditorWidget(() => {
      this._commentThread.input = {
        uri: commentEditor.getModel().uri,
        value: commentEditor.getValue()
      };
      this.commentService.setActiveEditingCommentThread(this._commentThread);
      this.commentService.setActiveCommentAndThread(this.owner, { thread: this._commentThread });
    }));
    this._commentThreadDisposables.push(commentEditor.getModel().onDidChangeContent(() => {
      const modelContent = commentEditor.getValue();
      if (this._commentThread.input && this._commentThread.input.uri === commentEditor.getModel().uri && this._commentThread.input.value !== modelContent) {
        const newInput = this._commentThread.input;
        newInput.value = modelContent;
        this._commentThread.input = newInput;
      }
      this.commentService.setActiveEditingCommentThread(this._commentThread);
    }));
    this._commentThreadDisposables.push(this._commentThread.onDidChangeInput((input) => {
      const thread = this._commentThread;
      const model = commentEditor.getModel();
      if (thread.input && model && thread.input.uri !== model.uri) {
        return;
      }
      if (!input) {
        return;
      }
      if (commentEditor.getValue() !== input.value) {
        commentEditor.setValue(input.value);
        if (input.value === "") {
          this._pendingComment = { body: "", cursor: new Position(1, 1) };
          commentForm.classList.remove("expand");
          commentEditor.getDomNode().style.outline = "";
          this._error.textContent = "";
          this._error.classList.add("hidden");
        }
      }
    }));
  }
  /**
   * Command based actions.
   */
  createCommentWidgetFormActions(container, model) {
    const menu = this._commentMenus.getCommentThreadActions(this._contextKeyService);
    this._register(menu);
    this._register(menu.onDidChange(() => {
      this._commentFormActions.setActions(menu);
    }));
    this._commentFormActions = new CommentFormActions(this.keybindingService, this._contextKeyService, this.contextMenuService, container, async (action) => {
      await this._actionRunDelegate?.();
      await action.run({
        thread: this._commentThread,
        text: this.commentEditor.getValue(),
        $mid: MarshalledId.CommentThreadReply
      });
      this.hideReplyArea();
    });
    this._register(this._commentFormActions);
    this._commentFormActions.setActions(menu);
  }
  createCommentWidgetEditorActions(container, model) {
    const editorMenu = this._commentMenus.getCommentEditorActions(this._contextKeyService);
    this._register(editorMenu);
    this._register(editorMenu.onDidChange(() => {
      this._commentEditorActions.setActions(editorMenu, true);
    }));
    this._commentEditorActions = new CommentFormActions(this.keybindingService, this._contextKeyService, this.contextMenuService, container, async (action) => {
      this._actionRunDelegate?.();
      action.run({
        thread: this._commentThread,
        text: this.commentEditor.getValue(),
        $mid: MarshalledId.CommentThreadReply
      });
      this.focusCommentEditor();
    });
    this._register(this._commentEditorActions);
    this._commentEditorActions.setActions(editorMenu, true);
  }
  get isReplyExpanded() {
    return this._container.classList.contains("expand");
  }
  expandReplyArea(focus = true) {
    if (!this.isReplyExpanded) {
      this._container.classList.add("expand");
      if (focus) {
        this.commentEditor.focus();
      }
      this.commentEditor.layout();
    }
  }
  clearAndExpandReplyArea() {
    if (!this.isReplyExpanded) {
      this.commentEditor.setValue("");
      this.expandReplyArea();
    }
  }
  hideReplyArea() {
    const domNode = this.commentEditor.getDomNode();
    if (domNode) {
      domNode.style.outline = "";
    }
    this.commentEditor.setValue("");
    this._pendingComment = { body: "", cursor: new Position(1, 1) };
    this._container.classList.remove("expand");
    this._error.textContent = "";
    this._error.classList.add("hidden");
  }
  createReplyButton(commentEditor, commentForm) {
    this._reviewThreadReplyButton = dom.append(commentForm, dom.$(`button.review-thread-reply-button.${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`));
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this._reviewThreadReplyButton, this._commentOptions?.prompt || nls.localize("reply", "Reply...")));
    this._reviewThreadReplyButton.textContent = this._commentOptions?.prompt || nls.localize("reply", "Reply...");
    this._register(dom.addDisposableListener(this._reviewThreadReplyButton, "click", (_) => this.clearAndExpandReplyArea()));
    this._register(dom.addDisposableListener(this._reviewThreadReplyButton, "focus", (_) => this.clearAndExpandReplyArea()));
    this._register(commentEditor.onDidBlurEditorWidget(() => {
      if (commentEditor.getModel().getValueLength() === 0 && commentForm.classList.contains("expand")) {
        commentForm.classList.remove("expand");
      }
    }));
  }
  dispose() {
    super.dispose();
    dispose(this._commentThreadDisposables);
  }
};
CommentReply = __decorateClass([
  __decorateParam(12, ICommentService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IKeybindingService),
  __decorateParam(15, IContextMenuService),
  __decorateParam(16, IHoverService),
  __decorateParam(17, ITextModelService)
], CommentReply);
export {
  COMMENTEDITOR_DECORATION_KEY,
  CommentReply
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudFJlcGx5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgTU9VU0VfQ1VSU09SX1RFWFRfQ1NTX0NMQVNTX05BTUUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbW91c2VDdXJzb3IvbW91c2VDdXJzb3IuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcywgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IENvbW1lbnRGb3JtQWN0aW9ucyB9IGZyb20gJy4vY29tbWVudEZvcm1BY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1lbnRNZW51cyB9IGZyb20gJy4vY29tbWVudE1lbnVzLmpzJztcbmltcG9ydCB7IElDb21tZW50U2VydmljZSB9IGZyb20gJy4vY29tbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tbWVudENvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL2NvbW1lbnRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ29tbWVudFRocmVhZFdpZGdldCB9IGZyb20gJy4uL2NvbW1vbi9jb21tZW50VGhyZWFkV2lkZ2V0LmpzJztcbmltcG9ydCB7IElDZWxsUmFuZ2UgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tSYW5nZS5qcyc7XG5pbXBvcnQgeyBMYXlvdXRhYmxlRWRpdG9yLCBNSU5fRURJVE9SX0hFSUdIVCwgU2ltcGxlQ29tbWVudEVkaXRvciwgY2FsY3VsYXRlRWRpdG9ySGVpZ2h0IH0gZnJvbSAnLi9zaW1wbGVDb21tZW50RWRpdG9yLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcblxubGV0IElOTUVNX01PREVMX0lEID0gMDtcbmV4cG9ydCBjb25zdCBDT01NRU5URURJVE9SX0RFQ09SQVRJT05fS0VZID0gJ2NvbW1lbnRlZGl0b3JkZWNvcmF0aW9uJztcblxuZXhwb3J0IGNsYXNzIENvbW1lbnRSZXBseTxUIGV4dGVuZHMgSVJhbmdlIHwgSUNlbGxSYW5nZT4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29tbWVudEVkaXRvcjogSUNvZGVFZGl0b3I7XG5cdHByaXZhdGUgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2Zvcm06IEhUTUxFbGVtZW50O1xuXHRjb21tZW50RWRpdG9ySXNFbXB0eTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgYXZhdGFyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2Vycm9yITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2Zvcm1BY3Rpb25zITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2VkaXRvckFjdGlvbnMhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfY29tbWVudFRocmVhZERpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cdHByaXZhdGUgX2NvbW1lbnRGb3JtQWN0aW9ucyE6IENvbW1lbnRGb3JtQWN0aW9ucztcblx0cHJpdmF0ZSBfY29tbWVudEVkaXRvckFjdGlvbnMhOiBDb21tZW50Rm9ybUFjdGlvbnM7XG5cdHByaXZhdGUgX3Jldmlld1RocmVhZFJlcGx5QnV0dG9uITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2VkaXRvckhlaWdodCA9IE1JTl9FRElUT1JfSEVJR0hUO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG93bmVyOiBzdHJpbmcsXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wYXJlbnRFZGl0b3I6IExheW91dGFibGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSBfY29tbWVudFRocmVhZDogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQ8VD4sXG5cdFx0cHJpdmF0ZSBfc2NvcGVkSW5zdGF0aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfY29tbWVudE1lbnVzOiBDb21tZW50TWVudXMsXG5cdFx0cHJpdmF0ZSBfY29tbWVudE9wdGlvbnM6IGxhbmd1YWdlcy5Db21tZW50T3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIF9wZW5kaW5nQ29tbWVudDogbGFuZ3VhZ2VzLlBlbmRpbmdDb21tZW50IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgX3BhcmVudFRocmVhZDogSUNvbW1lbnRUaHJlYWRXaWRnZXQsXG5cdFx0Zm9jdXM6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSBfYWN0aW9uUnVuRGVsZWdhdGU6ICgoKSA9PiB2b2lkKSB8IG51bGwsXG5cdFx0QElDb21tZW50U2VydmljZSBwcml2YXRlIGNvbW1lbnRTZXJ2aWNlOiBJQ29tbWVudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuY29tbWVudC1mb3JtLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLl9mb3JtID0gZG9tLmFwcGVuZCh0aGlzLl9jb250YWluZXIsIGRvbS4kKCcuY29tbWVudC1mb3JtJykpO1xuXHRcdHRoaXMuY29tbWVudEVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Njb3BlZEluc3RhdGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2ltcGxlQ29tbWVudEVkaXRvciwgdGhpcy5fZm9ybSwgU2ltcGxlQ29tbWVudEVkaXRvci5nZXRFZGl0b3JPcHRpb25zKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSwgX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9wYXJlbnRUaHJlYWQpKTtcblx0XHR0aGlzLmNvbW1lbnRFZGl0b3JJc0VtcHR5ID0gQ29tbWVudENvbnRleHRLZXlzLmNvbW1lbnRJc0VtcHR5LmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jb21tZW50RWRpdG9ySXNFbXB0eS5zZXQoIXRoaXMuX3BlbmRpbmdDb21tZW50KTtcblxuXHRcdHRoaXMuaW5pdGlhbGl6ZShmb2N1cyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluaXRpYWxpemUoZm9jdXM6IGJvb2xlYW4pIHtcblx0XHR0aGlzLmF2YXRhciA9IGRvbS5hcHBlbmQodGhpcy5fZm9ybSwgZG9tLiQoJy5hdmF0YXItY29udGFpbmVyJykpO1xuXHRcdHRoaXMudXBkYXRlQXV0aG9ySW5mbygpO1xuXHRcdGNvbnN0IGhhc0V4aXN0aW5nQ29tbWVudHMgPSB0aGlzLl9jb21tZW50VGhyZWFkLmNvbW1lbnRzICYmIHRoaXMuX2NvbW1lbnRUaHJlYWQuY29tbWVudHMubGVuZ3RoID4gMDtcblx0XHRjb25zdCBtb2RlSWQgPSBnZW5lcmF0ZVV1aWQoKSArICctJyArIChoYXNFeGlzdGluZ0NvbW1lbnRzID8gdGhpcy5fY29tbWVudFRocmVhZC50aHJlYWRJZCA6ICsrSU5NRU1fTU9ERUxfSUQpO1xuXG5cdFx0bGV0IHJlc291cmNlID0gVVJJLmZyb20oe1xuXHRcdFx0c2NoZW1lOiBTY2hlbWFzLmNvbW1lbnRzSW5wdXQsXG5cdFx0XHRwYXRoOiBgLyR7dGhpcy5fY29tbWVudFRocmVhZC5leHRlbnNpb25JZH0vY29tbWVudGlucHV0LSR7bW9kZUlkfS5tZGBcblx0XHR9KTtcblx0XHRjb25zdCBjb21tZW50Q29udHJvbGxlciA9IHRoaXMuY29tbWVudFNlcnZpY2UuZ2V0Q29tbWVudENvbnRyb2xsZXIodGhpcy5vd25lcik7XG5cdFx0aWYgKGNvbW1lbnRDb250cm9sbGVyKSB7XG5cdFx0XHRyZXNvdXJjZSA9IHJlc291cmNlLndpdGgoeyBhdXRob3JpdHk6IGNvbW1lbnRDb250cm9sbGVyLmlkIH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHJlc291cmNlKTtcblx0XHRtb2RlbC5vYmplY3QudGV4dEVkaXRvck1vZGVsLnNldFZhbHVlKHRoaXMuX3BlbmRpbmdDb21tZW50Py5ib2R5IHx8ICcnKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsKTtcblx0XHR0aGlzLmNvbW1lbnRFZGl0b3Iuc2V0TW9kZWwobW9kZWwub2JqZWN0LnRleHRFZGl0b3JNb2RlbCk7XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdDb21tZW50KSB7XG5cdFx0XHR0aGlzLmNvbW1lbnRFZGl0b3Iuc2V0UG9zaXRpb24odGhpcy5fcGVuZGluZ0NvbW1lbnQuY3Vyc29yKTtcblx0XHR9XG5cdFx0dGhpcy5jYWxjdWxhdGVFZGl0b3JIZWlnaHQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHtcblx0XHRcdHRoaXMuc2V0Q29tbWVudEVkaXRvckRlY29yYXRpb25zKCk7XG5cdFx0XHR0aGlzLmNvbW1lbnRFZGl0b3JJc0VtcHR5Py5zZXQoIXRoaXMuY29tbWVudEVkaXRvci5nZXRWYWx1ZSgpKTtcblx0XHRcdGlmICh0aGlzLmNhbGN1bGF0ZUVkaXRvckhlaWdodCgpKSB7XG5cdFx0XHRcdHRoaXMuY29tbWVudEVkaXRvci5sYXlvdXQoeyBoZWlnaHQ6IHRoaXMuX2VkaXRvckhlaWdodCwgd2lkdGg6IHRoaXMuY29tbWVudEVkaXRvci5nZXRMYXlvdXRJbmZvKCkud2lkdGggfSk7XG5cdFx0XHRcdHRoaXMuY29tbWVudEVkaXRvci5yZW5kZXIodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5jcmVhdGVUZXh0TW9kZWxMaXN0ZW5lcih0aGlzLmNvbW1lbnRFZGl0b3IsIHRoaXMuX2Zvcm0pO1xuXG5cdFx0dGhpcy5zZXRDb21tZW50RWRpdG9yRGVjb3JhdGlvbnMoKTtcblxuXHRcdC8vIE9ubHkgYWRkIHRoZSBhZGRpdGlvbmFsIHN0ZXAgb2YgY2xpY2tpbmcgYSByZXBseSBidXR0b24gdG8gZXhwYW5kIHRoZSB0ZXh0YXJlYSB3aGVuIHRoZXJlIGFyZSBleGlzdGluZyBjb21tZW50c1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nQ29tbWVudCkge1xuXHRcdFx0dGhpcy5leHBhbmRSZXBseUFyZWEoKTtcblx0XHR9IGVsc2UgaWYgKGhhc0V4aXN0aW5nQ29tbWVudHMpIHtcblx0XHRcdHRoaXMuY3JlYXRlUmVwbHlCdXR0b24odGhpcy5jb21tZW50RWRpdG9yLCB0aGlzLl9mb3JtKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2NvbW1lbnRUaHJlYWQuY29tbWVudHMgJiYgdGhpcy5fY29tbWVudFRocmVhZC5jb21tZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuZXhwYW5kUmVwbHlBcmVhKGZvY3VzKTtcblx0XHR9XG5cdFx0dGhpcy5fZXJyb3IgPSBkb20uYXBwZW5kKHRoaXMuX2NvbnRhaW5lciwgZG9tLiQoJy52YWxpZGF0aW9uLWVycm9yLmhpZGRlbicpKTtcblx0XHRjb25zdCBmb3JtQWN0aW9ucyA9IGRvbS5hcHBlbmQodGhpcy5fY29udGFpbmVyLCBkb20uJCgnLmZvcm0tYWN0aW9ucycpKTtcblx0XHR0aGlzLl9mb3JtQWN0aW9ucyA9IGRvbS5hcHBlbmQoZm9ybUFjdGlvbnMsIGRvbS4kKCcub3RoZXItYWN0aW9ucycpKTtcblx0XHR0aGlzLmNyZWF0ZUNvbW1lbnRXaWRnZXRGb3JtQWN0aW9ucyh0aGlzLl9mb3JtQWN0aW9ucywgbW9kZWwub2JqZWN0LnRleHRFZGl0b3JNb2RlbCk7XG5cdFx0dGhpcy5fZWRpdG9yQWN0aW9ucyA9IGRvbS5hcHBlbmQoZm9ybUFjdGlvbnMsIGRvbS4kKCcuZWRpdG9yLWFjdGlvbnMnKSk7XG5cdFx0dGhpcy5jcmVhdGVDb21tZW50V2lkZ2V0RWRpdG9yQWN0aW9ucyh0aGlzLl9lZGl0b3JBY3Rpb25zLCBtb2RlbC5vYmplY3QudGV4dEVkaXRvck1vZGVsKTtcblx0fVxuXG5cdHByaXZhdGUgY2FsY3VsYXRlRWRpdG9ySGVpZ2h0KCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG5ld0VkaXRvckhlaWdodCA9IGNhbGN1bGF0ZUVkaXRvckhlaWdodCh0aGlzLl9wYXJlbnRFZGl0b3IsIHRoaXMuY29tbWVudEVkaXRvciwgdGhpcy5fZWRpdG9ySGVpZ2h0KTtcblx0XHRpZiAobmV3RWRpdG9ySGVpZ2h0ICE9PSB0aGlzLl9lZGl0b3JIZWlnaHQpIHtcblx0XHRcdHRoaXMuX2VkaXRvckhlaWdodCA9IG5ld0VkaXRvckhlaWdodDtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlQ29tbWVudFRocmVhZChjb21tZW50VGhyZWFkOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZDxJUmFuZ2UgfCBJQ2VsbFJhbmdlPikge1xuXHRcdGNvbnN0IGlzUmVwbHlpbmcgPSB0aGlzLmNvbW1lbnRFZGl0b3IuaGFzVGV4dEZvY3VzKCk7XG5cdFx0Y29uc3Qgb2xkQW5kTmV3Qm90aEVtcHR5ID0gIXRoaXMuX2NvbW1lbnRUaHJlYWQuY29tbWVudHM/Lmxlbmd0aCAmJiAhY29tbWVudFRocmVhZC5jb21tZW50cz8ubGVuZ3RoO1xuXG5cdFx0aWYgKCF0aGlzLl9yZXZpZXdUaHJlYWRSZXBseUJ1dHRvbikge1xuXHRcdFx0dGhpcy5jcmVhdGVSZXBseUJ1dHRvbih0aGlzLmNvbW1lbnRFZGl0b3IsIHRoaXMuX2Zvcm0pO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jb21tZW50VGhyZWFkLmNvbW1lbnRzICYmIHRoaXMuX2NvbW1lbnRUaHJlYWQuY29tbWVudHMubGVuZ3RoID09PSAwICYmICFvbGRBbmROZXdCb3RoRW1wdHkpIHtcblx0XHRcdHRoaXMuZXhwYW5kUmVwbHlBcmVhKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzUmVwbHlpbmcpIHtcblx0XHRcdHRoaXMuY29tbWVudEVkaXRvci5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRQZW5kaW5nQ29tbWVudCgpOiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jb21tZW50RWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRpZiAobW9kZWwgJiYgbW9kZWwuZ2V0VmFsdWVMZW5ndGgoKSA+IDApIHsgLy8gY2hlY2tpbmcgbGVuZ3RoIGlzIGNoZWFwXG5cdFx0XHRyZXR1cm4geyBib2R5OiBtb2RlbC5nZXRWYWx1ZSgpLCBjdXJzb3I6IHRoaXMuY29tbWVudEVkaXRvci5nZXRQb3NpdGlvbigpID8/IG5ldyBQb3NpdGlvbigxLCAxKSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgc2V0UGVuZGluZ0NvbW1lbnQocGVuZGluZzogbGFuZ3VhZ2VzLlBlbmRpbmdDb21tZW50KSB7XG5cdFx0dGhpcy5fcGVuZGluZ0NvbW1lbnQgPSBwZW5kaW5nO1xuXHRcdHRoaXMuZXhwYW5kUmVwbHlBcmVhKCk7XG5cdFx0dGhpcy5jb21tZW50RWRpdG9yLnNldFZhbHVlKHBlbmRpbmcuYm9keSk7XG5cdFx0dGhpcy5jb21tZW50RWRpdG9yLnNldFBvc2l0aW9uKHBlbmRpbmcuY3Vyc29yKTtcblx0fVxuXG5cdHB1YmxpYyBsYXlvdXQod2lkdGhJblBpeGVsOiBudW1iZXIpIHtcblx0XHR0aGlzLmNvbW1lbnRFZGl0b3IubGF5b3V0KHsgaGVpZ2h0OiB0aGlzLl9lZGl0b3JIZWlnaHQsIHdpZHRoOiB3aWR0aEluUGl4ZWwgLSA1NCAvKiBtYXJnaW4gMjBweCAqIDEwICsgc2Nyb2xsYmFyIDE0cHgqLyB9KTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1c0lmTmVlZGVkKCkge1xuXHRcdGlmICghdGhpcy5fY29tbWVudFRocmVhZC5jb21tZW50cyB8fCAhdGhpcy5fY29tbWVudFRocmVhZC5jb21tZW50cy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuY29tbWVudEVkaXRvci5mb2N1cygpO1xuXHRcdH0gZWxzZSBpZiAoKHRoaXMuY29tbWVudEVkaXRvci5nZXRNb2RlbCgpPy5nZXRWYWx1ZUxlbmd0aCgpID8/IDApID4gMCkge1xuXHRcdFx0dGhpcy5leHBhbmRSZXBseUFyZWEoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZm9jdXNDb21tZW50RWRpdG9yKCkge1xuXHRcdHRoaXMuY29tbWVudEVkaXRvci5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIGV4cGFuZFJlcGx5QXJlYUFuZEZvY3VzQ29tbWVudEVkaXRvcigpIHtcblx0XHR0aGlzLmV4cGFuZFJlcGx5QXJlYSgpO1xuXHRcdHRoaXMuY29tbWVudEVkaXRvci5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIGlzQ29tbWVudEVkaXRvckZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29tbWVudEVkaXRvci5oYXNXaWRnZXRGb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBdXRob3JJbmZvKCkge1xuXHRcdHRoaXMuYXZhdGFyLnRleHRDb250ZW50ID0gJyc7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLl9jb21tZW50VGhyZWFkLmNhblJlcGx5ICE9PSAnYm9vbGVhbicgJiYgdGhpcy5fY29tbWVudFRocmVhZC5jYW5SZXBseS5pY29uUGF0aCkge1xuXHRcdFx0dGhpcy5hdmF0YXIuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0XHRjb25zdCBpbWcgPSBkb20uYXBwZW5kKHRoaXMuYXZhdGFyLCBkb20uJCgnaW1nLmF2YXRhcicpKSBhcyBIVE1MSW1hZ2VFbGVtZW50O1xuXHRcdFx0aW1nLnNyYyA9IEZpbGVBY2Nlc3MudXJpVG9Ccm93c2VyVXJpKFVSSS5yZXZpdmUodGhpcy5fY29tbWVudFRocmVhZC5jYW5SZXBseS5pY29uUGF0aCkpLnRvU3RyaW5nKHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmF2YXRhci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVDYW5SZXBseSgpIHtcblx0XHR0aGlzLnVwZGF0ZUF1dGhvckluZm8oKTtcblx0XHRpZiAoIXRoaXMuX2NvbW1lbnRUaHJlYWQuY2FuUmVwbHkpIHtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3VibWl0Q29tbWVudCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9jb21tZW50Rm9ybUFjdGlvbnM/LnRyaWdnZXJEZWZhdWx0QWN0aW9uKCk7XG5cdFx0dGhpcy5fcGVuZGluZ0NvbW1lbnQgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRzZXRDb21tZW50RWRpdG9yRGVjb3JhdGlvbnMoKSB7XG5cdFx0Y29uc3QgaGFzRXhpc3RpbmdDb21tZW50cyA9IHRoaXMuX2NvbW1lbnRUaHJlYWQuY29tbWVudHMgJiYgdGhpcy5fY29tbWVudFRocmVhZC5jb21tZW50cy5sZW5ndGggPiAwO1xuXHRcdGNvbnN0IHBsYWNlaG9sZGVyID0gaGFzRXhpc3RpbmdDb21tZW50c1xuXHRcdFx0PyAodGhpcy5fY29tbWVudE9wdGlvbnM/LnBsYWNlSG9sZGVyIHx8IG5scy5sb2NhbGl6ZSgncmVwbHknLCBcIlJlcGx5Li4uXCIpKVxuXHRcdFx0OiAodGhpcy5fY29tbWVudE9wdGlvbnM/LnBsYWNlSG9sZGVyIHx8IG5scy5sb2NhbGl6ZSgnbmV3Q29tbWVudCcsIFwiVHlwZSBhIG5ldyBjb21tZW50XCIpKTtcblxuXHRcdHRoaXMuY29tbWVudEVkaXRvci51cGRhdGVPcHRpb25zKHsgcGxhY2Vob2xkZXIgfSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRleHRNb2RlbExpc3RlbmVyKGNvbW1lbnRFZGl0b3I6IElDb2RlRWRpdG9yLCBjb21tZW50Rm9ybTogSFRNTEVsZW1lbnQpIHtcblx0XHR0aGlzLl9jb21tZW50VGhyZWFkRGlzcG9zYWJsZXMucHVzaChjb21tZW50RWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29tbWVudFRocmVhZC5pbnB1dCA9IHtcblx0XHRcdFx0dXJpOiBjb21tZW50RWRpdG9yLmdldE1vZGVsKCkhLnVyaSxcblx0XHRcdFx0dmFsdWU6IGNvbW1lbnRFZGl0b3IuZ2V0VmFsdWUoKVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuY29tbWVudFNlcnZpY2Uuc2V0QWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWQodGhpcy5fY29tbWVudFRocmVhZCk7XG5cdFx0XHR0aGlzLmNvbW1lbnRTZXJ2aWNlLnNldEFjdGl2ZUNvbW1lbnRBbmRUaHJlYWQodGhpcy5vd25lciwgeyB0aHJlYWQ6IHRoaXMuX2NvbW1lbnRUaHJlYWQgfSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY29tbWVudFRocmVhZERpc3Bvc2FibGVzLnB1c2goY29tbWVudEVkaXRvci5nZXRNb2RlbCgpIS5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWxDb250ZW50ID0gY29tbWVudEVkaXRvci5nZXRWYWx1ZSgpO1xuXHRcdFx0aWYgKHRoaXMuX2NvbW1lbnRUaHJlYWQuaW5wdXQgJiYgdGhpcy5fY29tbWVudFRocmVhZC5pbnB1dC51cmkgPT09IGNvbW1lbnRFZGl0b3IuZ2V0TW9kZWwoKSEudXJpICYmIHRoaXMuX2NvbW1lbnRUaHJlYWQuaW5wdXQudmFsdWUgIT09IG1vZGVsQ29udGVudCkge1xuXHRcdFx0XHRjb25zdCBuZXdJbnB1dDogbGFuZ3VhZ2VzLkNvbW1lbnRJbnB1dCA9IHRoaXMuX2NvbW1lbnRUaHJlYWQuaW5wdXQ7XG5cdFx0XHRcdG5ld0lucHV0LnZhbHVlID0gbW9kZWxDb250ZW50O1xuXHRcdFx0XHR0aGlzLl9jb21tZW50VGhyZWFkLmlucHV0ID0gbmV3SW5wdXQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNvbW1lbnRTZXJ2aWNlLnNldEFjdGl2ZUVkaXRpbmdDb21tZW50VGhyZWFkKHRoaXMuX2NvbW1lbnRUaHJlYWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2NvbW1lbnRUaHJlYWREaXNwb3NhYmxlcy5wdXNoKHRoaXMuX2NvbW1lbnRUaHJlYWQub25EaWRDaGFuZ2VJbnB1dChpbnB1dCA9PiB7XG5cdFx0XHRjb25zdCB0aHJlYWQgPSB0aGlzLl9jb21tZW50VGhyZWFkO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjb21tZW50RWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAodGhyZWFkLmlucHV0ICYmIG1vZGVsICYmICh0aHJlYWQuaW5wdXQudXJpICE9PSBtb2RlbC51cmkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghaW5wdXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29tbWVudEVkaXRvci5nZXRWYWx1ZSgpICE9PSBpbnB1dC52YWx1ZSkge1xuXHRcdFx0XHRjb21tZW50RWRpdG9yLnNldFZhbHVlKGlucHV0LnZhbHVlKTtcblxuXHRcdFx0XHRpZiAoaW5wdXQudmFsdWUgPT09ICcnKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ0NvbW1lbnQgPSB7IGJvZHk6ICcnLCBjdXJzb3I6IG5ldyBQb3NpdGlvbigxLCAxKSB9O1xuXHRcdFx0XHRcdGNvbW1lbnRGb3JtLmNsYXNzTGlzdC5yZW1vdmUoJ2V4cGFuZCcpO1xuXHRcdFx0XHRcdGNvbW1lbnRFZGl0b3IuZ2V0RG9tTm9kZSgpIS5zdHlsZS5vdXRsaW5lID0gJyc7XG5cdFx0XHRcdFx0dGhpcy5fZXJyb3IudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdFx0XHR0aGlzLl9lcnJvci5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21tYW5kIGJhc2VkIGFjdGlvbnMuXG5cdCAqL1xuXHRwcml2YXRlIGNyZWF0ZUNvbW1lbnRXaWRnZXRGb3JtQWN0aW9ucyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBtb2RlbDogSVRleHRNb2RlbCkge1xuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLl9jb21tZW50TWVudXMuZ2V0Q29tbWVudFRocmVhZEFjdGlvbnModGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobWVudSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobWVudS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb21tZW50Rm9ybUFjdGlvbnMuc2V0QWN0aW9ucyhtZW51KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9jb21tZW50Rm9ybUFjdGlvbnMgPSBuZXcgQ29tbWVudEZvcm1BY3Rpb25zKHRoaXMua2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmNvbnRleHRNZW51U2VydmljZSwgY29udGFpbmVyLCBhc3luYyAoYWN0aW9uOiBJQWN0aW9uKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hY3Rpb25SdW5EZWxlZ2F0ZT8uKCk7XG5cblx0XHRcdGF3YWl0IGFjdGlvbi5ydW4oe1xuXHRcdFx0XHR0aHJlYWQ6IHRoaXMuX2NvbW1lbnRUaHJlYWQsXG5cdFx0XHRcdHRleHQ6IHRoaXMuY29tbWVudEVkaXRvci5nZXRWYWx1ZSgpLFxuXHRcdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuQ29tbWVudFRocmVhZFJlcGx5XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5oaWRlUmVwbHlBcmVhKCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb21tZW50Rm9ybUFjdGlvbnMpO1xuXHRcdHRoaXMuX2NvbW1lbnRGb3JtQWN0aW9ucy5zZXRBY3Rpb25zKG1lbnUpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb21tZW50V2lkZ2V0RWRpdG9yQWN0aW9ucyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBtb2RlbDogSVRleHRNb2RlbCkge1xuXHRcdGNvbnN0IGVkaXRvck1lbnUgPSB0aGlzLl9jb21tZW50TWVudXMuZ2V0Q29tbWVudEVkaXRvckFjdGlvbnModGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvck1lbnUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvck1lbnUub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29tbWVudEVkaXRvckFjdGlvbnMuc2V0QWN0aW9ucyhlZGl0b3JNZW51LCB0cnVlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9jb21tZW50RWRpdG9yQWN0aW9ucyA9IG5ldyBDb21tZW50Rm9ybUFjdGlvbnModGhpcy5rZXliaW5kaW5nU2VydmljZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCBjb250YWluZXIsIGFzeW5jIChhY3Rpb246IElBY3Rpb24pID0+IHtcblx0XHRcdHRoaXMuX2FjdGlvblJ1bkRlbGVnYXRlPy4oKTtcblxuXHRcdFx0YWN0aW9uLnJ1bih7XG5cdFx0XHRcdHRocmVhZDogdGhpcy5fY29tbWVudFRocmVhZCxcblx0XHRcdFx0dGV4dDogdGhpcy5jb21tZW50RWRpdG9yLmdldFZhbHVlKCksXG5cdFx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Db21tZW50VGhyZWFkUmVwbHlcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmZvY3VzQ29tbWVudEVkaXRvcigpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29tbWVudEVkaXRvckFjdGlvbnMpO1xuXHRcdHRoaXMuX2NvbW1lbnRFZGl0b3JBY3Rpb25zLnNldEFjdGlvbnMoZWRpdG9yTWVudSwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBpc1JlcGx5RXhwYW5kZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2V4cGFuZCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBleHBhbmRSZXBseUFyZWEoZm9jdXM6IGJvb2xlYW4gPSB0cnVlKSB7XG5cdFx0aWYgKCF0aGlzLmlzUmVwbHlFeHBhbmRlZCkge1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2V4cGFuZCcpO1xuXHRcdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHRcdHRoaXMuY29tbWVudEVkaXRvci5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jb21tZW50RWRpdG9yLmxheW91dCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xlYXJBbmRFeHBhbmRSZXBseUFyZWEoKSB7XG5cdFx0aWYgKCF0aGlzLmlzUmVwbHlFeHBhbmRlZCkge1xuXHRcdFx0dGhpcy5jb21tZW50RWRpdG9yLnNldFZhbHVlKCcnKTtcblx0XHRcdHRoaXMuZXhwYW5kUmVwbHlBcmVhKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoaWRlUmVwbHlBcmVhKCkge1xuXHRcdGNvbnN0IGRvbU5vZGUgPSB0aGlzLmNvbW1lbnRFZGl0b3IuZ2V0RG9tTm9kZSgpO1xuXHRcdGlmIChkb21Ob2RlKSB7XG5cdFx0XHRkb21Ob2RlLnN0eWxlLm91dGxpbmUgPSAnJztcblx0XHR9XG5cdFx0dGhpcy5jb21tZW50RWRpdG9yLnNldFZhbHVlKCcnKTtcblx0XHR0aGlzLl9wZW5kaW5nQ29tbWVudCA9IHsgYm9keTogJycsIGN1cnNvcjogbmV3IFBvc2l0aW9uKDEsIDEpIH07XG5cdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2V4cGFuZCcpO1xuXHRcdHRoaXMuX2Vycm9yLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGhpcy5fZXJyb3IuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVJlcGx5QnV0dG9uKGNvbW1lbnRFZGl0b3I6IElDb2RlRWRpdG9yLCBjb21tZW50Rm9ybTogSFRNTEVsZW1lbnQpIHtcblx0XHR0aGlzLl9yZXZpZXdUaHJlYWRSZXBseUJ1dHRvbiA9IDxIVE1MQnV0dG9uRWxlbWVudD5kb20uYXBwZW5kKGNvbW1lbnRGb3JtLCBkb20uJChgYnV0dG9uLnJldmlldy10aHJlYWQtcmVwbHktYnV0dG9uLiR7TU9VU0VfQ1VSU09SX1RFWFRfQ1NTX0NMQVNTX05BTUV9YCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLl9yZXZpZXdUaHJlYWRSZXBseUJ1dHRvbiwgdGhpcy5fY29tbWVudE9wdGlvbnM/LnByb21wdCB8fCBubHMubG9jYWxpemUoJ3JlcGx5JywgXCJSZXBseS4uLlwiKSkpO1xuXG5cdFx0dGhpcy5fcmV2aWV3VGhyZWFkUmVwbHlCdXR0b24udGV4dENvbnRlbnQgPSB0aGlzLl9jb21tZW50T3B0aW9ucz8ucHJvbXB0IHx8IG5scy5sb2NhbGl6ZSgncmVwbHknLCBcIlJlcGx5Li4uXCIpO1xuXHRcdC8vIGJpbmQgY2xpY2svZXNjYXBlIGFjdGlvbnMgZm9yIHJldmlld1RocmVhZFJlcGx5QnV0dG9uIGFuZCB0ZXh0QXJlYVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fcmV2aWV3VGhyZWFkUmVwbHlCdXR0b24sICdjbGljaycsIF8gPT4gdGhpcy5jbGVhckFuZEV4cGFuZFJlcGx5QXJlYSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9yZXZpZXdUaHJlYWRSZXBseUJ1dHRvbiwgJ2ZvY3VzJywgXyA9PiB0aGlzLmNsZWFyQW5kRXhwYW5kUmVwbHlBcmVhKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbW1lbnRFZGl0b3Iub25EaWRCbHVyRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdGlmIChjb21tZW50RWRpdG9yLmdldE1vZGVsKCkhLmdldFZhbHVlTGVuZ3RoKCkgPT09IDAgJiYgY29tbWVudEZvcm0uY2xhc3NMaXN0LmNvbnRhaW5zKCdleHBhbmQnKSkge1xuXHRcdFx0XHRjb21tZW50Rm9ybS5jbGFzc0xpc3QucmVtb3ZlKCdleHBhbmQnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHRkaXNwb3NlKHRoaXMuX2NvbW1lbnRUaHJlYWREaXNwb3NhYmxlcyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsd0NBQXdDO0FBRWpELFNBQVMsWUFBeUIsZUFBZTtB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
