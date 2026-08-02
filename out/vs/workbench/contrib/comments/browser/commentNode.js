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
import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import * as languages from "../../../../editor/common/languages.js";
import { ActionsOrientation, ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Action, Separator, ActionRunner } from "../../../../base/common/actions.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { TimeoutTimer } from "../../../../base/common/async.js";
import { URI } from "../../../../base/common/uri.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ICommentService } from "./commentService.js";
import { MIN_EDITOR_HEIGHT, SimpleCommentEditor, calculateEditorHeight } from "./simpleCommentEditor.js";
import { Emitter } from "../../../../base/common/event.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { ToolBar } from "../../../../base/browser/ui/toolbar/toolbar.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { AnchorAlignment } from "../../../../base/browser/ui/contextview/contextview.js";
import { ToggleReactionsAction, ReactionAction, ReactionActionViewItem } from "./reactionsAction.js";
import { MenuItemAction, SubmenuItemAction, MenuId } from "../../../../platform/actions/common/actions.js";
import { MenuEntryActionViewItem, SubmenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { CommentFormActions } from "./commentFormActions.js";
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from "../../../../base/browser/ui/mouseCursor/mouseCursor.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { DropdownMenuActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { TimestampWidget } from "./timestamp.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Scrollable, ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { SmoothScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { DomEmitter } from "../../../../base/browser/event.js";
import { CommentContextKeys } from "../common/commentContextKeys.js";
import { FileAccess, Schemas } from "../../../../base/common/network.js";
import { COMMENTS_SECTION } from "../common/commentsConfiguration.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { Position } from "../../../../editor/common/core/position.js";
class CommentsActionRunner extends ActionRunner {
  async runAction(action, context) {
    await action.run(...context);
  }
}
let CommentNode = class extends Disposable {
  constructor(parentEditor, commentThread, comment, pendingEdit, owner, resource, parentThread, markdownRendererOptions, instantiationService, commentService, notificationService, contextMenuService, contextKeyService, configurationService, hoverService, keybindingService, textModelService, markdownRendererService) {
    super();
    this.parentEditor = parentEditor;
    this.commentThread = commentThread;
    this.comment = comment;
    this.pendingEdit = pendingEdit;
    this.owner = owner;
    this.resource = resource;
    this.parentThread = parentThread;
    this.markdownRendererOptions = markdownRendererOptions;
    this.instantiationService = instantiationService;
    this.commentService = commentService;
    this.notificationService = notificationService;
    this.contextMenuService = contextMenuService;
    this.configurationService = configurationService;
    this.hoverService = hoverService;
    this.keybindingService = keybindingService;
    this.textModelService = textModelService;
    this.markdownRendererService = markdownRendererService;
    this._md = this._register(new MutableDisposable());
    this._focusClearTimer = this._register(new TimeoutTimer());
    this._editAction = null;
    this._commentEditContainer = null;
    this._reactionsActionBar = this._register(new MutableDisposable());
    this._reactionActions = this._register(new DisposableStore());
    this._commentEditor = null;
    this._commentEditorModel = null;
    this._editorHeight = MIN_EDITOR_HEIGHT;
    this._actionRunner = this._register(new CommentsActionRunner());
    this.toolbar = this._register(new MutableDisposable());
    this._commentFormActions = null;
    this._commentEditorActions = null;
    this._onDidClick = this._register(new Emitter());
    this.isEditing = false;
    this._editModeDisposables = this._register(new DisposableStore());
    this._domNode = dom.$("div.review-comment");
    this._contextKeyService = this._register(contextKeyService.createScoped(this._domNode));
    this._commentContextValue = CommentContextKeys.commentContext.bindTo(this._contextKeyService);
    if (this.comment.contextValue) {
      this._commentContextValue.set(this.comment.contextValue);
    }
    this._commentMenus = this.commentService.getCommentMenus(this.owner);
    this._domNode.tabIndex = -1;
    this._avatar = dom.append(this._domNode, dom.$("div.avatar-container"));
    this.updateCommentUserIcon(this.comment.userIconPath);
    this._commentDetailsContainer = dom.append(this._domNode, dom.$(".review-comment-contents"));
    this.createHeader(this._commentDetailsContainer);
    this._body = document.createElement(`div`);
    this._body.classList.add("comment-body", MOUSE_CURSOR_TEXT_CSS_CLASS_NAME);
    if (configurationService.getValue(COMMENTS_SECTION)?.maxHeight !== false) {
      this._body.classList.add("comment-body-max-height");
    }
    this.createScroll(this._commentDetailsContainer, this._body);
    this.updateCommentBody(this.comment.body);
    this.createReactionsContainer(this._commentDetailsContainer);
    this._domNode.setAttribute("aria-label", `${comment.userName}, ${this.commentBodyValue}`);
    this._domNode.setAttribute("role", "treeitem");
    this._register(dom.addDisposableListener(this._domNode, dom.EventType.CLICK, () => this.isEditing || this._onDidClick.fire(this)));
    this._register(dom.addDisposableListener(this._domNode, dom.EventType.CONTEXT_MENU, (e) => {
      return this.onContextMenu(e);
    }));
    if (pendingEdit) {
      this.switchToEditMode();
    }
    this.activeCommentListeners();
  }
  get domNode() {
    return this._domNode;
  }
  activeCommentListeners() {
    this._register(dom.addDisposableListener(this._domNode, dom.EventType.FOCUS_IN, () => {
      this.commentService.setActiveCommentAndThread(this.owner, { thread: this.commentThread, comment: this.comment });
    }, true));
  }
  createScroll(container, body) {
    this._scrollable = this._register(new Scrollable({
      forceIntegerValues: true,
      smoothScrollDuration: 125,
      scheduleAtNextAnimationFrame: (cb) => dom.scheduleAtNextAnimationFrame(dom.getWindow(container), cb)
    }));
    this._scrollableElement = this._register(new SmoothScrollableElement(body, {
      horizontal: ScrollbarVisibility.Visible,
      vertical: ScrollbarVisibility.Visible
    }, this._scrollable));
    this._register(this._scrollableElement.onScroll((e) => {
      if (e.scrollLeftChanged) {
        body.scrollLeft = e.scrollLeft;
      }
      if (e.scrollTopChanged) {
        body.scrollTop = e.scrollTop;
      }
    }));
    const onDidScrollViewContainer = this._register(new DomEmitter(body, "scroll")).event;
    this._register(onDidScrollViewContainer((_) => {
      const position = this._scrollableElement.getScrollPosition();
      const scrollLeft = Math.abs(body.scrollLeft - position.scrollLeft) <= 1 ? void 0 : body.scrollLeft;
      const scrollTop = Math.abs(body.scrollTop - position.scrollTop) <= 1 ? void 0 : body.scrollTop;
      if (scrollLeft !== void 0 || scrollTop !== void 0) {
        this._scrollableElement.setScrollPosition({ scrollLeft, scrollTop });
      }
    }));
    container.appendChild(this._scrollableElement.getDomNode());
  }
  updateCommentBody(body) {
    this._body.innerText = "";
    this._md.clear();
    this._plainText = void 0;
    if (typeof body === "string") {
      this._plainText = dom.append(this._body, dom.$(".comment-body-plainstring"));
      this._plainText.innerText = body;
    } else {
      this._md.value = this.markdownRendererService.render(body, this.markdownRendererOptions);
      this._body.appendChild(this._md.value.element);
    }
  }
  updateCommentUserIcon(userIconPath) {
    this._avatar.textContent = "";
    if (userIconPath) {
      const img = dom.append(this._avatar, dom.$("img.avatar"));
      img.src = FileAccess.uriToBrowserUri(URI.revive(userIconPath)).toString(true);
      img.onerror = (_) => img.remove();
    }
  }
  get onDidClick() {
    return this._onDidClick.event;
  }
  createTimestamp(container) {
    this._timestamp = dom.append(container, dom.$("span.timestamp-container"));
    this.updateTimestamp(this.comment.timestamp);
  }
  updateTimestamp(raw) {
    if (!this._timestamp) {
      return;
    }
    const timestamp = raw !== void 0 ? new Date(raw) : void 0;
    if (!timestamp) {
      this._timestampWidget?.dispose();
    } else {
      if (!this._timestampWidget) {
        this._timestampWidget = new TimestampWidget(this.configurationService, this.hoverService, this._timestamp, timestamp);
        this._register(this._timestampWidget);
      } else {
        this._timestampWidget.setTimestamp(timestamp);
      }
    }
  }
  createHeader(commentDetailsContainer) {
    const header = dom.append(commentDetailsContainer, dom.$(`div.comment-title.${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`));
    const infoContainer = dom.append(header, dom.$("comment-header-info"));
    const author = dom.append(infoContainer, dom.$("strong.author"));
    author.innerText = this.comment.userName;
    this.createTimestamp(infoContainer);
    this._isPendingLabel = dom.append(infoContainer, dom.$("span.isPending"));
    if (this.comment.label) {
      this._isPendingLabel.innerText = this.comment.label;
    } else {
      this._isPendingLabel.innerText = "";
    }
    this._actionsToolbarContainer = dom.append(header, dom.$(".comment-actions"));
    this.createActionsToolbar();
  }
  getToolbarActions(menu) {
    const contributedActions = menu.getActions({ shouldForwardArgs: true });
    const primary = [];
    const secondary = [];
    const result = { primary, secondary };
    fillInActions(contributedActions, result, false, (g) => /^inline/.test(g));
    return result;
  }
  get commentNodeContext() {
    return [
      {
        thread: this.commentThread,
        commentUniqueId: this.comment.uniqueIdInThread,
        $mid: MarshalledId.CommentNode
      },
      {
        commentControlHandle: this.commentThread.controllerHandle,
        commentThreadHandle: this.commentThread.commentThreadHandle,
        $mid: MarshalledId.CommentThread
      }
    ];
  }
  createToolbar() {
    this.toolbar.value = new ToolBar(this._actionsToolbarContainer, this.contextMenuService, {
      actionViewItemProvider: (action, options) => {
        if (action.id === ToggleReactionsAction.ID) {
          return new DropdownMenuActionViewItem(
            action,
            action.menuActions,
            this.contextMenuService,
            {
              ...options,
              actionViewItemProvider: (action2, options2) => this.actionViewItemProvider(action2, options2),
              classNames: ["toolbar-toggle-pickReactions", ...ThemeIcon.asClassNameArray(Codicon.reactions)],
              anchorAlignmentProvider: () => AnchorAlignment.RIGHT
            }
          );
        }
        return this.actionViewItemProvider(action, options);
      },
      orientation: ActionsOrientation.HORIZONTAL
    });
    this.toolbar.value.context = this.commentNodeContext;
    this.toolbar.value.actionRunner = this._actionRunner;
  }
  createActionsToolbar() {
    const actions = [];
    const menu = this._commentMenus.getCommentTitleActions(this.comment, this._contextKeyService);
    this._register(menu);
    this._register(menu.onDidChange((e) => {
      const { primary: primary2, secondary: secondary2 } = this.getToolbarActions(menu);
      if (!this.toolbar && (primary2.length || secondary2.length)) {
        this.createToolbar();
      }
      this.toolbar.value.setActions(primary2, secondary2);
    }));
    const { primary, secondary } = this.getToolbarActions(menu);
    actions.push(...primary);
    if (actions.length || secondary.length) {
      this.createToolbar();
      this.toolbar.value.setActions(actions, secondary);
    }
  }
  actionViewItemProvider(action, options) {
    if (action.id === ToggleReactionsAction.ID) {
      options = { label: false, icon: true };
    } else {
      options = { label: false, icon: true };
    }
    if (action.id === ReactionAction.ID) {
      const item = new ReactionActionViewItem(action);
      return item;
    } else if (action instanceof MenuItemAction) {
      return this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
    } else if (action instanceof SubmenuItemAction) {
      return this.instantiationService.createInstance(SubmenuEntryActionViewItem, action, options);
    } else {
      const item = new ActionViewItem({}, action, options);
      return item;
    }
  }
  async submitComment() {
    if (this._commentEditor && this._commentFormActions) {
      await this._commentFormActions.triggerDefaultAction();
      this.pendingEdit = void 0;
    }
  }
  createReactionPicker(reactionGroup) {
    const toggleReactionAction = this._reactionActions.add(new ToggleReactionsAction(() => {
      toggleReactionActionViewItem?.show();
    }, nls.localize("commentToggleReaction", "Toggle Reaction")));
    let reactionMenuActions = [];
    if (reactionGroup && reactionGroup.length) {
      reactionMenuActions = reactionGroup.map((reaction) => {
        return this._reactionActions.add(new Action(`reaction.command.${reaction.label}`, `${reaction.label}`, "", true, async () => {
          try {
            await this.commentService.toggleReaction(this.owner, this.resource, this.commentThread, this.comment, reaction);
          } catch (e) {
            const error = e.message ? nls.localize("commentToggleReactionError", "Toggling the comment reaction failed: {0}.", e.message) : nls.localize("commentToggleReactionDefaultError", "Toggling the comment reaction failed");
            this.notificationService.error(error);
          }
        }));
      });
    }
    toggleReactionAction.menuActions = reactionMenuActions;
    const toggleReactionActionViewItem = this._reactionActions.add(new DropdownMenuActionViewItem(
      toggleReactionAction,
      toggleReactionAction.menuActions,
      this.contextMenuService,
      {
        actionViewItemProvider: (action, options) => {
          if (action.id === ToggleReactionsAction.ID) {
            return toggleReactionActionViewItem;
          }
          return this.actionViewItemProvider(action, options);
        },
        classNames: "toolbar-toggle-pickReactions",
        anchorAlignmentProvider: () => AnchorAlignment.RIGHT
      }
    ));
    return toggleReactionAction;
  }
  createReactionsContainer(commentDetailsContainer) {
    this._reactionActionsContainer?.remove();
    this._reactionsActionBar.clear();
    this._reactionActions.clear();
    const hasReactionHandler = this.commentService.hasReactionHandler(this.owner);
    const reactions = this.comment.commentReactions?.filter((reaction) => !!reaction.count) || [];
    if (reactions.length === 0 && !hasReactionHandler) {
      return;
    }
    this._reactionActionsContainer = dom.append(commentDetailsContainer, dom.$("div.comment-reactions"));
    this._reactionsActionBar.value = new ActionBar(this._reactionActionsContainer, {
      actionViewItemProvider: (action, options) => {
        if (action.id === ToggleReactionsAction.ID) {
          return new DropdownMenuActionViewItem(
            action,
            action.menuActions,
            this.contextMenuService,
            {
              actionViewItemProvider: (action2, options2) => this.actionViewItemProvider(action2, options2),
              classNames: ["toolbar-toggle-pickReactions", ...ThemeIcon.asClassNameArray(Codicon.reactions)],
              anchorAlignmentProvider: () => AnchorAlignment.RIGHT
            }
          );
        }
        return this.actionViewItemProvider(action, options);
      }
    });
    reactions.map((reaction) => {
      const action = this._reactionActions.add(new ReactionAction(`reaction.${reaction.label}`, `${reaction.label}`, reaction.hasReacted && (reaction.canEdit || hasReactionHandler) ? "active" : "", reaction.canEdit || hasReactionHandler, async () => {
        try {
          await this.commentService.toggleReaction(this.owner, this.resource, this.commentThread, this.comment, reaction);
        } catch (e) {
          let error;
          if (reaction.hasReacted) {
            error = e.message ? nls.localize("commentDeleteReactionError", "Deleting the comment reaction failed: {0}.", e.message) : nls.localize("commentDeleteReactionDefaultError", "Deleting the comment reaction failed");
          } else {
            error = e.message ? nls.localize("commentAddReactionError", "Deleting the comment reaction failed: {0}.", e.message) : nls.localize("commentAddReactionDefaultError", "Deleting the comment reaction failed");
          }
          this.notificationService.error(error);
        }
      }, reaction.reactors, reaction.iconPath, reaction.count));
      this._reactionsActionBar.value?.push(action, { label: true, icon: true });
    });
    if (hasReactionHandler) {
      const toggleReactionAction = this.createReactionPicker(this.comment.commentReactions || []);
      this._reactionsActionBar.value?.push(toggleReactionAction, { label: false, icon: true });
    }
  }
  get commentBodyValue() {
    return typeof this.comment.body === "string" ? this.comment.body : this.comment.body.value;
  }
  async createCommentEditor(editContainer) {
    this._editModeDisposables.clear();
    const container = dom.append(editContainer, dom.$(".edit-textarea"));
    this._commentEditor = this.instantiationService.createInstance(SimpleCommentEditor, container, SimpleCommentEditor.getEditorOptions(this.configurationService), this._contextKeyService, this.parentThread);
    this._editModeDisposables.add(this._commentEditor);
    const resource = URI.from({
      scheme: Schemas.commentsInput,
      path: `/commentinput-${this.comment.uniqueIdInThread}-${Date.now()}.md`
    });
    const modelRef = await this.textModelService.createModelReference(resource);
    this._commentEditorModel = modelRef;
    this._editModeDisposables.add(this._commentEditorModel);
    this._commentEditor.setModel(this._commentEditorModel.object.textEditorModel);
    this._commentEditor.setValue(this.pendingEdit?.body ?? this.commentBodyValue);
    if (this.pendingEdit) {
      this._commentEditor.setPosition(this.pendingEdit.cursor);
    } else {
      const lastLine = this._commentEditorModel.object.textEditorModel.getLineCount();
      const lastColumn = this._commentEditorModel.object.textEditorModel.getLineLength(lastLine) + 1;
      this._commentEditor.setPosition(new Position(lastLine, lastColumn));
    }
    this.pendingEdit = void 0;
    this._commentEditor.layout({ width: container.clientWidth - 14, height: this._editorHeight });
    this._commentEditor.focus();
    dom.scheduleAtNextAnimationFrame(dom.getWindow(editContainer), () => {
      this._commentEditor.layout({ width: container.clientWidth - 14, height: this._editorHeight });
      this._commentEditor.focus();
    });
    const commentThread = this.commentThread;
    commentThread.input = {
      uri: this._commentEditor.getModel().uri,
      value: this.commentBodyValue
    };
    this.commentService.setActiveEditingCommentThread(commentThread);
    this.commentService.setActiveCommentAndThread(this.owner, { thread: commentThread, comment: this.comment });
    this._editModeDisposables.add(this._commentEditor.onDidFocusEditorWidget(() => {
      commentThread.input = {
        uri: this._commentEditor.getModel().uri,
        value: this.commentBodyValue
      };
      this.commentService.setActiveEditingCommentThread(commentThread);
      this.commentService.setActiveCommentAndThread(this.owner, { thread: commentThread, comment: this.comment });
    }));
    this._editModeDisposables.add(this._commentEditor.onDidChangeModelContent((e) => {
      if (commentThread.input && this._commentEditor && this._commentEditor.getModel().uri === commentThread.input.uri) {
        const newVal = this._commentEditor.getValue();
        if (newVal !== commentThread.input.value) {
          const input = commentThread.input;
          input.value = newVal;
          commentThread.input = input;
          this.commentService.setActiveEditingCommentThread(commentThread);
          this.commentService.setActiveCommentAndThread(this.owner, { thread: commentThread, comment: this.comment });
        }
      }
    }));
    this.calculateEditorHeight();
    this._editModeDisposables.add(this._commentEditorModel.object.textEditorModel.onDidChangeContent(() => {
      if (this._commentEditor && this.calculateEditorHeight()) {
        this._commentEditor.layout({ height: this._editorHeight, width: this._commentEditor.getLayoutInfo().width });
        this._commentEditor.render(true);
      }
    }));
  }
  calculateEditorHeight() {
    if (this._commentEditor) {
      const newEditorHeight = calculateEditorHeight(this.parentEditor, this._commentEditor, this._editorHeight);
      if (newEditorHeight !== this._editorHeight) {
        this._editorHeight = newEditorHeight;
        return true;
      }
    }
    return false;
  }
  getPendingEdit() {
    const model = this._commentEditor?.getModel();
    if (this._commentEditor && model && model.getValueLength() > 0) {
      return { body: model.getValue(), cursor: this._commentEditor.getPosition() };
    }
    return void 0;
  }
  removeCommentEditor() {
    this.isEditing = false;
    if (this._editAction) {
      this._editAction.enabled = true;
    }
    this._body.classList.remove("hidden");
    this._editModeDisposables.clear();
    this._commentEditor = null;
    this._commentEditContainer.remove();
  }
  layout(widthInPixel) {
    const editorWidth = widthInPixel !== void 0 ? widthInPixel - 72 : this._commentEditor?.getLayoutInfo().width ?? 0;
    this._commentEditor?.layout({ width: editorWidth, height: this._editorHeight });
    const scrollWidth = this._body.scrollWidth;
    const width = dom.getContentWidth(this._body);
    const scrollHeight = this._body.scrollHeight;
    const height = dom.getContentHeight(this._body) + 4;
    this._scrollableElement.setScrollDimensions({ width, scrollWidth, height, scrollHeight });
  }
  async switchToEditMode() {
    if (this.isEditing) {
      return;
    }
    this.isEditing = true;
    this._body.classList.add("hidden");
    this._commentEditContainer = dom.append(this._commentDetailsContainer, dom.$(".edit-container"));
    await this.createCommentEditor(this._commentEditContainer);
    const formActions = dom.append(this._commentEditContainer, dom.$(".form-actions"));
    const otherActions = dom.append(formActions, dom.$(".other-actions"));
    this.createCommentWidgetFormActions(otherActions);
    const editorActions = dom.append(formActions, dom.$(".editor-actions"));
    this.createCommentWidgetEditorActions(editorActions);
  }
  createCommentWidgetFormActions(container) {
    const menus = this.commentService.getCommentMenus(this.owner);
    const menu = menus.getCommentActions(this.comment, this._contextKeyService);
    this._editModeDisposables.add(menu);
    this._editModeDisposables.add(menu.onDidChange(() => {
      this._commentFormActions?.setActions(menu);
    }));
    this._commentFormActions = new CommentFormActions(this.keybindingService, this._contextKeyService, this.contextMenuService, container, (action) => {
      const text = this._commentEditor.getValue();
      action.run({
        thread: this.commentThread,
        commentUniqueId: this.comment.uniqueIdInThread,
        text,
        $mid: MarshalledId.CommentThreadNode
      });
      this.removeCommentEditor();
    });
    this._editModeDisposables.add(this._commentFormActions);
    this._commentFormActions.setActions(menu);
  }
  createCommentWidgetEditorActions(container) {
    const menus = this.commentService.getCommentMenus(this.owner);
    const menu = menus.getCommentEditorActions(this._contextKeyService);
    this._editModeDisposables.add(menu);
    this._editModeDisposables.add(menu.onDidChange(() => {
      this._commentEditorActions?.setActions(menu, true);
    }));
    this._commentEditorActions = new CommentFormActions(this.keybindingService, this._contextKeyService, this.contextMenuService, container, (action) => {
      const text = this._commentEditor.getValue();
      action.run({
        thread: this.commentThread,
        commentUniqueId: this.comment.uniqueIdInThread,
        text,
        $mid: MarshalledId.CommentThreadNode
      });
      this._commentEditor?.focus();
    });
    this._editModeDisposables.add(this._commentEditorActions);
    this._commentEditorActions.setActions(menu, true);
  }
  setFocus(focused, visible = false) {
    if (focused) {
      this._domNode.focus();
      this._actionsToolbarContainer.classList.add("tabfocused");
      this._domNode.tabIndex = 0;
      if (this.comment.mode === languages.CommentMode.Editing) {
        this._commentEditor?.focus();
      }
    } else {
      if (this._actionsToolbarContainer.classList.contains("tabfocused") && !this._actionsToolbarContainer.classList.contains("mouseover")) {
        this._domNode.tabIndex = -1;
      }
      this._actionsToolbarContainer.classList.remove("tabfocused");
    }
  }
  async update(newComment) {
    if (newComment.body !== this.comment.body) {
      this.updateCommentBody(newComment.body);
    }
    if (this.comment.userIconPath && newComment.userIconPath && URI.from(this.comment.userIconPath).toString() !== URI.from(newComment.userIconPath).toString()) {
      this.updateCommentUserIcon(newComment.userIconPath);
    }
    const isChangingMode = newComment.mode !== void 0 && newComment.mode !== this.comment.mode;
    this.comment = newComment;
    if (isChangingMode) {
      if (newComment.mode === languages.CommentMode.Editing) {
        await this.switchToEditMode();
      } else {
        this.removeCommentEditor();
      }
    }
    if (newComment.label) {
      this._isPendingLabel.innerText = newComment.label;
    } else {
      this._isPendingLabel.innerText = "";
    }
    this.createReactionsContainer(this._commentDetailsContainer);
    if (this.comment.contextValue) {
      this._commentContextValue.set(this.comment.contextValue);
    } else {
      this._commentContextValue.reset();
    }
    if (this.comment.timestamp) {
      this.updateTimestamp(this.comment.timestamp);
    }
  }
  onContextMenu(e) {
    const event = new StandardMouseEvent(dom.getWindow(this._domNode), e);
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      menuId: MenuId.CommentThreadCommentContext,
      menuActionOptions: { shouldForwardArgs: true },
      contextKeyService: this._contextKeyService,
      actionRunner: this._actionRunner,
      getActionsContext: () => {
        return this.commentNodeContext;
      }
    });
  }
  focus() {
    this.domNode.focus();
    this.domNode.classList.add("focus");
    this._focusClearTimer.setIfNotSet(() => this.domNode.classList.remove("focus"), 3e3);
  }
};
CommentNode = __decorateClass([
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, ICommentService),
  __decorateParam(10, INotificationService),
  __decorateParam(11, IContextMenuService),
  __decorateParam(12, IContextKeyService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, IKeybindingService),
  __decorateParam(16, ITextModelService),
  __decorateParam(17, IMarkdownRendererService)
], CommentNode);
function fillInActions(groups, target, useAlternativeActions, isPrimaryGroup = (group) => group === "navigation") {
  for (const tuple of groups) {
    let [group, actions] = tuple;
    if (useAlternativeActions) {
      actions = actions.map((a) => a instanceof MenuItemAction && !!a.alt ? a.alt : a);
    }
    if (isPrimaryGroup(group)) {
      const to = Array.isArray(target) ? target : target.primary;
      to.unshift(...actions);
    } else {
      const to = Array.isArray(target) ? target : target.secondary;
      if (to.length > 0) {
        to.push(new Separator());
      }
      to.push(...actions);
    }
  }
}
export {
  CommentNode
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudE5vZGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGxhbmd1YWdlcyBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25zT3JpZW50YXRpb24sIEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgU2VwYXJhdG9yLCBBY3Rpb25SdW5uZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSVJlZmVyZW5jZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGltZW91dFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyRXh0cmFPcHRpb25zLCBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSVJlbmRlcmVkTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb21tZW50U2VydmljZSB9IGZyb20gJy4vY29tbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTGF5b3V0YWJsZUVkaXRvciwgTUlOX0VESVRPUl9IRUlHSFQsIFNpbXBsZUNvbW1lbnRFZGl0b3IsIGNhbGN1bGF0ZUVkaXRvckhlaWdodCB9IGZyb20gJy4vc2ltcGxlQ29tbWVudEVkaXRvci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b29sYmFyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IFRvZ2dsZVJlYWN0aW9uc0FjdGlvbiwgUmVhY3Rpb25BY3Rpb24sIFJlYWN0aW9uQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuL3JlYWN0aW9uc0FjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWVudFRocmVhZFdpZGdldCB9IGZyb20gJy4uL2NvbW1vbi9jb21tZW50VGhyZWFkV2lkZ2V0LmpzJztcbmltcG9ydCB7IE1lbnVJdGVtQWN0aW9uLCBTdWJtZW51SXRlbUFjdGlvbiwgSU1lbnUsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIFN1Ym1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgSUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENvbW1lbnRGb3JtQWN0aW9ucyB9IGZyb20gJy4vY29tbWVudEZvcm1BY3Rpb25zLmpzJztcbmltcG9ydCB7IE1PVVNFX0NVUlNPUl9URVhUX0NTU19DTEFTU19OQU1FIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL21vdXNlQ3Vyc29yL21vdXNlQ3Vyc29yLmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtLCBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZHJvcGRvd24vZHJvcGRvd25BY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IFRpbWVzdGFtcFdpZGdldCB9IGZyb20gJy4vdGltZXN0YW1wLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElDZWxsUmFuZ2UgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tSYW5nZS5qcyc7XG5pbXBvcnQgeyBDb21tZW50TWVudXMgfSBmcm9tICcuL2NvbW1lbnRNZW51cy5qcyc7XG5pbXBvcnQgeyBTY3JvbGxhYmxlLCBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBTbW9vdGhTY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgRG9tRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9ldmVudC5qcyc7XG5pbXBvcnQgeyBDb21tZW50Q29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vY29tbWVudENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MsIFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IENPTU1FTlRTX1NFQ1RJT04sIElDb21tZW50c0NvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb21tb24vY29tbWVudHNDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZENvbW1lbnRUaHJlYWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29tbWVudHMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcblxuY2xhc3MgQ29tbWVudHNBY3Rpb25SdW5uZXIgZXh0ZW5kcyBBY3Rpb25SdW5uZXIge1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgcnVuQWN0aW9uKGFjdGlvbjogSUFjdGlvbiwgY29udGV4dDogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgYWN0aW9uLnJ1biguLi5jb250ZXh0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29tbWVudE5vZGU8VCBleHRlbmRzIElSYW5nZSB8IElDZWxsUmFuZ2U+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9ib2R5OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfYXZhdGFyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbWQ6IE11dGFibGVEaXNwb3NhYmxlPElSZW5kZXJlZE1hcmtkb3duPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBfcGxhaW5UZXh0OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZm9jdXNDbGVhclRpbWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRpbWVvdXRUaW1lcigpKTtcblxuXHRwcml2YXRlIF9lZGl0QWN0aW9uOiBBY3Rpb24gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfY29tbWVudEVkaXRDb250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2NvbW1lbnREZXRhaWxzQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfYWN0aW9uc1Rvb2xiYXJDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVhY3Rpb25zQWN0aW9uQmFyOiBNdXRhYmxlRGlzcG9zYWJsZTxBY3Rpb25CYXI+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWFjdGlvbkFjdGlvbnM6IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX3JlYWN0aW9uQWN0aW9uc0NvbnRhaW5lcj86IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9jb21tZW50RWRpdG9yOiBTaW1wbGVDb21tZW50RWRpdG9yIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2NvbW1lbnRFZGl0b3JNb2RlbDogSVJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2VkaXRvckhlaWdodCA9IE1JTl9FRElUT1JfSEVJR0hUO1xuXG5cdHByaXZhdGUgX2lzUGVuZGluZ0xhYmVsITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3RpbWVzdGFtcDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3RpbWVzdGFtcFdpZGdldDogVGltZXN0YW1wV2lkZ2V0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRwcml2YXRlIF9jb21tZW50Q29udGV4dFZhbHVlOiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIF9jb21tZW50TWVudXM6IENvbW1lbnRNZW51cztcblxuXHRwcml2YXRlIF9zY3JvbGxhYmxlITogU2Nyb2xsYWJsZTtcblx0cHJpdmF0ZSBfc2Nyb2xsYWJsZUVsZW1lbnQhOiBTbW9vdGhTY3JvbGxhYmxlRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3Rpb25SdW5uZXI6IENvbW1lbnRzQWN0aW9uUnVubmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IENvbW1lbnRzQWN0aW9uUnVubmVyKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRvb2xiYXI6IE11dGFibGVEaXNwb3NhYmxlPFRvb2xCYXI+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9jb21tZW50Rm9ybUFjdGlvbnM6IENvbW1lbnRGb3JtQWN0aW9ucyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9jb21tZW50RWRpdG9yQWN0aW9uczogQ29tbWVudEZvcm1BY3Rpb25zIHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbGljayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENvbW1lbnROb2RlPFQ+PigpKTtcblxuXHRwdWJsaWMgZ2V0IGRvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlO1xuXHR9XG5cblx0cHVibGljIGlzRWRpdGluZzogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcGFyZW50RWRpdG9yOiBMYXlvdXRhYmxlRWRpdG9yLFxuXHRcdHByaXZhdGUgY29tbWVudFRocmVhZDogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQ8VD4sXG5cdFx0cHVibGljIGNvbW1lbnQ6IGxhbmd1YWdlcy5Db21tZW50LFxuXHRcdHByaXZhdGUgcGVuZGluZ0VkaXQ6IGxhbmd1YWdlcy5QZW5kaW5nQ29tbWVudCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIG93bmVyOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZXNvdXJjZTogVVJJLFxuXHRcdHByaXZhdGUgcGFyZW50VGhyZWFkOiBJQ29tbWVudFRocmVhZFdpZGdldCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJPcHRpb25zOiBJTWFya2Rvd25SZW5kZXJlckV4dHJhT3B0aW9ucyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbW1lbnRTZXJ2aWNlIHByaXZhdGUgY29tbWVudFNlcnZpY2U6IElDb21tZW50U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9kb21Ob2RlID0gZG9tLiQoJ2Rpdi5yZXZpZXctY29tbWVudCcpO1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuX2RvbU5vZGUpKTtcblx0XHR0aGlzLl9jb21tZW50Q29udGV4dFZhbHVlID0gQ29tbWVudENvbnRleHRLZXlzLmNvbW1lbnRDb250ZXh0LmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKHRoaXMuY29tbWVudC5jb250ZXh0VmFsdWUpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRDb250ZXh0VmFsdWUuc2V0KHRoaXMuY29tbWVudC5jb250ZXh0VmFsdWUpO1xuXHRcdH1cblx0XHR0aGlzLl9jb21tZW50TWVudXMgPSB0aGlzLmNvbW1lbnRTZXJ2aWNlLmdldENvbW1lbnRNZW51cyh0aGlzLm93bmVyKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUudGFiSW5kZXggPSAtMTtcblx0XHR0aGlzLl9hdmF0YXIgPSBkb20uYXBwZW5kKHRoaXMuX2RvbU5vZGUsIGRvbS4kKCdkaXYuYXZhdGFyLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLnVwZGF0ZUNvbW1lbnRVc2VySWNvbih0aGlzLmNvbW1lbnQudXNlckljb25QYXRoKTtcblxuXHRcdHRoaXMuX2NvbW1lbnREZXRhaWxzQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLl9kb21Ob2RlLCBkb20uJCgnLnJldmlldy1jb21tZW50LWNvbnRlbnRzJykpO1xuXG5cdFx0dGhpcy5jcmVhdGVIZWFkZXIodGhpcy5fY29tbWVudERldGFpbHNDb250YWluZXIpO1xuXHRcdHRoaXMuX2JvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KGBkaXZgKTtcblx0XHR0aGlzLl9ib2R5LmNsYXNzTGlzdC5hZGQoJ2NvbW1lbnQtYm9keScsIE1PVVNFX0NVUlNPUl9URVhUX0NTU19DTEFTU19OQU1FKTtcblx0XHRpZiAoY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUNvbW1lbnRzQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZD4oQ09NTUVOVFNfU0VDVElPTik/Lm1heEhlaWdodCAhPT0gZmFsc2UpIHtcblx0XHRcdHRoaXMuX2JvZHkuY2xhc3NMaXN0LmFkZCgnY29tbWVudC1ib2R5LW1heC1oZWlnaHQnKTtcblx0XHR9XG5cblx0XHR0aGlzLmNyZWF0ZVNjcm9sbCh0aGlzLl9jb21tZW50RGV0YWlsc0NvbnRhaW5lciwgdGhpcy5fYm9keSk7XG5cdFx0dGhpcy51cGRhdGVDb21tZW50Qm9keSh0aGlzLmNvbW1lbnQuYm9keSk7XG5cblx0XHR0aGlzLmNyZWF0ZVJlYWN0aW9uc0NvbnRhaW5lcih0aGlzLl9jb21tZW50RGV0YWlsc0NvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGAke2NvbW1lbnQudXNlck5hbWV9LCAke3RoaXMuY29tbWVudEJvZHlWYWx1ZX1gKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgncm9sZScsICd0cmVlaXRlbScpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kb21Ob2RlLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0aGlzLmlzRWRpdGluZyB8fCB0aGlzLl9vbkRpZENsaWNrLmZpcmUodGhpcykpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUsIGRvbS5FdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBlID0+IHtcblx0XHRcdHJldHVybiB0aGlzLm9uQ29udGV4dE1lbnUoZSk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHBlbmRpbmdFZGl0KSB7XG5cdFx0XHR0aGlzLnN3aXRjaFRvRWRpdE1vZGUoKTtcblx0XHR9XG5cblx0XHR0aGlzLmFjdGl2ZUNvbW1lbnRMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgYWN0aXZlQ29tbWVudExpc3RlbmVycygpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUsIGRvbS5FdmVudFR5cGUuRk9DVVNfSU4sICgpID0+IHtcblx0XHRcdHRoaXMuY29tbWVudFNlcnZpY2Uuc2V0QWN0aXZlQ29tbWVudEFuZFRocmVhZCh0aGlzLm93bmVyLCB7IHRocmVhZDogdGhpcy5jb21tZW50VGhyZWFkLCBjb21tZW50OiB0aGlzLmNvbW1lbnQgfSk7XG5cdFx0fSwgdHJ1ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTY3JvbGwoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgYm9keTogSFRNTEVsZW1lbnQpIHtcblx0XHR0aGlzLl9zY3JvbGxhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNjcm9sbGFibGUoe1xuXHRcdFx0Zm9yY2VJbnRlZ2VyVmFsdWVzOiB0cnVlLFxuXHRcdFx0c21vb3RoU2Nyb2xsRHVyYXRpb246IDEyNSxcblx0XHRcdHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWU6IGNiID0+IGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3coY29udGFpbmVyKSwgY2IpXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3Njcm9sbGFibGVFbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNtb290aFNjcm9sbGFibGVFbGVtZW50KGJvZHksIHtcblx0XHRcdGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuVmlzaWJsZSxcblx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LlZpc2libGVcblx0XHR9LCB0aGlzLl9zY3JvbGxhYmxlKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zY3JvbGxhYmxlRWxlbWVudC5vblNjcm9sbChlID0+IHtcblx0XHRcdGlmIChlLnNjcm9sbExlZnRDaGFuZ2VkKSB7XG5cdFx0XHRcdGJvZHkuc2Nyb2xsTGVmdCA9IGUuc2Nyb2xsTGVmdDtcblx0XHRcdH1cblx0XHRcdGlmIChlLnNjcm9sbFRvcENoYW5nZWQpIHtcblx0XHRcdFx0Ym9keS5zY3JvbGxUb3AgPSBlLnNjcm9sbFRvcDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBvbkRpZFNjcm9sbFZpZXdDb250YWluZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tRW1pdHRlcihib2R5LCAnc2Nyb2xsJykpLmV2ZW50O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkU2Nyb2xsVmlld0NvbnRhaW5lcihfID0+IHtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0U2Nyb2xsUG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IHNjcm9sbExlZnQgPSBNYXRoLmFicyhib2R5LnNjcm9sbExlZnQgLSBwb3NpdGlvbi5zY3JvbGxMZWZ0KSA8PSAxID8gdW5kZWZpbmVkIDogYm9keS5zY3JvbGxMZWZ0O1xuXHRcdFx0Y29uc3Qgc2Nyb2xsVG9wID0gTWF0aC5hYnMoYm9keS5zY3JvbGxUb3AgLSBwb3NpdGlvbi5zY3JvbGxUb3ApIDw9IDEgPyB1bmRlZmluZWQgOiBib2R5LnNjcm9sbFRvcDtcblxuXHRcdFx0aWYgKHNjcm9sbExlZnQgIT09IHVuZGVmaW5lZCB8fCBzY3JvbGxUb3AgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbExlZnQsIHNjcm9sbFRvcCB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0RG9tTm9kZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29tbWVudEJvZHkoYm9keTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nKSB7XG5cdFx0dGhpcy5fYm9keS5pbm5lclRleHQgPSAnJztcblx0XHR0aGlzLl9tZC5jbGVhcigpO1xuXHRcdHRoaXMuX3BsYWluVGV4dCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIGJvZHkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLl9wbGFpblRleHQgPSBkb20uYXBwZW5kKHRoaXMuX2JvZHksIGRvbS4kKCcuY29tbWVudC1ib2R5LXBsYWluc3RyaW5nJykpO1xuXHRcdFx0dGhpcy5fcGxhaW5UZXh0LmlubmVyVGV4dCA9IGJvZHk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX21kLnZhbHVlID0gdGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoYm9keSwgdGhpcy5tYXJrZG93blJlbmRlcmVyT3B0aW9ucyk7XG5cdFx0XHR0aGlzLl9ib2R5LmFwcGVuZENoaWxkKHRoaXMuX21kLnZhbHVlLmVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29tbWVudFVzZXJJY29uKHVzZXJJY29uUGF0aDogVXJpQ29tcG9uZW50cyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2F2YXRhci50ZXh0Q29udGVudCA9ICcnO1xuXHRcdGlmICh1c2VySWNvblBhdGgpIHtcblx0XHRcdGNvbnN0IGltZyA9IGRvbS5hcHBlbmQodGhpcy5fYXZhdGFyLCBkb20uJCgnaW1nLmF2YXRhcicpKSBhcyBIVE1MSW1hZ2VFbGVtZW50O1xuXHRcdFx0aW1nLnNyYyA9IEZpbGVBY2Nlc3MudXJpVG9Ccm93c2VyVXJpKFVSSS5yZXZpdmUodXNlckljb25QYXRoKSkudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRpbWcub25lcnJvciA9IF8gPT4gaW1nLnJlbW92ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRDbGljaygpOiBFdmVudDxDb21tZW50Tm9kZTxUPj4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZENsaWNrLmV2ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUaW1lc3RhbXAoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdHRoaXMuX3RpbWVzdGFtcCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnc3Bhbi50aW1lc3RhbXAtY29udGFpbmVyJykpO1xuXHRcdHRoaXMudXBkYXRlVGltZXN0YW1wKHRoaXMuY29tbWVudC50aW1lc3RhbXApO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUaW1lc3RhbXAocmF3Pzogc3RyaW5nKSB7XG5cdFx0aWYgKCF0aGlzLl90aW1lc3RhbXApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0aW1lc3RhbXAgPSByYXcgIT09IHVuZGVmaW5lZCA/IG5ldyBEYXRlKHJhdykgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCF0aW1lc3RhbXApIHtcblx0XHRcdHRoaXMuX3RpbWVzdGFtcFdpZGdldD8uZGlzcG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIXRoaXMuX3RpbWVzdGFtcFdpZGdldCkge1xuXHRcdFx0XHR0aGlzLl90aW1lc3RhbXBXaWRnZXQgPSBuZXcgVGltZXN0YW1wV2lkZ2V0KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuaG92ZXJTZXJ2aWNlLCB0aGlzLl90aW1lc3RhbXAsIHRpbWVzdGFtcCk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RpbWVzdGFtcFdpZGdldCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl90aW1lc3RhbXBXaWRnZXQuc2V0VGltZXN0YW1wKHRpbWVzdGFtcCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVIZWFkZXIoY29tbWVudERldGFpbHNDb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgaGVhZGVyID0gZG9tLmFwcGVuZChjb21tZW50RGV0YWlsc0NvbnRhaW5lciwgZG9tLiQoYGRpdi5jb21tZW50LXRpdGxlLiR7TU9VU0VfQ1VSU09SX1RFWFRfQ1NTX0NMQVNTX05BTUV9YCkpO1xuXHRcdGNvbnN0IGluZm9Db250YWluZXIgPSBkb20uYXBwZW5kKGhlYWRlciwgZG9tLiQoJ2NvbW1lbnQtaGVhZGVyLWluZm8nKSk7XG5cdFx0Y29uc3QgYXV0aG9yID0gZG9tLmFwcGVuZChpbmZvQ29udGFpbmVyLCBkb20uJCgnc3Ryb25nLmF1dGhvcicpKTtcblx0XHRhdXRob3IuaW5uZXJUZXh0ID0gdGhpcy5jb21tZW50LnVzZXJOYW1lO1xuXHRcdHRoaXMuY3JlYXRlVGltZXN0YW1wKGluZm9Db250YWluZXIpO1xuXHRcdHRoaXMuX2lzUGVuZGluZ0xhYmVsID0gZG9tLmFwcGVuZChpbmZvQ29udGFpbmVyLCBkb20uJCgnc3Bhbi5pc1BlbmRpbmcnKSk7XG5cblx0XHRpZiAodGhpcy5jb21tZW50LmxhYmVsKSB7XG5cdFx0XHR0aGlzLl9pc1BlbmRpbmdMYWJlbC5pbm5lclRleHQgPSB0aGlzLmNvbW1lbnQubGFiZWw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2lzUGVuZGluZ0xhYmVsLmlubmVyVGV4dCA9ICcnO1xuXHRcdH1cblxuXHRcdHRoaXMuX2FjdGlvbnNUb29sYmFyQ29udGFpbmVyID0gZG9tLmFwcGVuZChoZWFkZXIsIGRvbS4kKCcuY29tbWVudC1hY3Rpb25zJykpO1xuXHRcdHRoaXMuY3JlYXRlQWN0aW9uc1Rvb2xiYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VG9vbGJhckFjdGlvbnMobWVudTogSU1lbnUpOiB7IHByaW1hcnk6IElBY3Rpb25bXTsgc2Vjb25kYXJ5OiBJQWN0aW9uW10gfSB7XG5cdFx0Y29uc3QgY29udHJpYnV0ZWRBY3Rpb25zID0gbWVudS5nZXRBY3Rpb25zKHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSk7XG5cdFx0Y29uc3QgcHJpbWFyeTogSUFjdGlvbltdID0gW107XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5OiBJQWN0aW9uW10gPSBbXTtcblx0XHRjb25zdCByZXN1bHQgPSB7IHByaW1hcnksIHNlY29uZGFyeSB9O1xuXHRcdGZpbGxJbkFjdGlvbnMoY29udHJpYnV0ZWRBY3Rpb25zLCByZXN1bHQsIGZhbHNlLCBnID0+IC9eaW5saW5lLy50ZXN0KGcpKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgY29tbWVudE5vZGVDb250ZXh0KCk6IFt7IHRocmVhZDogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQ8VD47IGNvbW1lbnRVbmlxdWVJZDogbnVtYmVyOyAkbWlkOiBNYXJzaGFsbGVkSWQuQ29tbWVudE5vZGUgfSwgTWFyc2hhbGxlZENvbW1lbnRUaHJlYWRdIHtcblx0XHRyZXR1cm4gW3tcblx0XHRcdHRocmVhZDogdGhpcy5jb21tZW50VGhyZWFkLFxuXHRcdFx0Y29tbWVudFVuaXF1ZUlkOiB0aGlzLmNvbW1lbnQudW5pcXVlSWRJblRocmVhZCxcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Db21tZW50Tm9kZVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0Y29tbWVudENvbnRyb2xIYW5kbGU6IHRoaXMuY29tbWVudFRocmVhZC5jb250cm9sbGVySGFuZGxlLFxuXHRcdFx0Y29tbWVudFRocmVhZEhhbmRsZTogdGhpcy5jb21tZW50VGhyZWFkLmNvbW1lbnRUaHJlYWRIYW5kbGUsXG5cdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuQ29tbWVudFRocmVhZFxuXHRcdH1dO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUb29sYmFyKCkge1xuXHRcdHRoaXMudG9vbGJhci52YWx1ZSA9IG5ldyBUb29sQmFyKHRoaXMuX2FjdGlvbnNUb29sYmFyQ29udGFpbmVyLCB0aGlzLmNvbnRleHRNZW51U2VydmljZSwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSBUb2dnbGVSZWFjdGlvbnNBY3Rpb24uSUQpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtKFxuXHRcdFx0XHRcdFx0YWN0aW9uLFxuXHRcdFx0XHRcdFx0KDxUb2dnbGVSZWFjdGlvbnNBY3Rpb24+YWN0aW9uKS5tZW51QWN0aW9ucyxcblx0XHRcdFx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB0aGlzLmFjdGlvblZpZXdJdGVtUHJvdmlkZXIoYWN0aW9uIGFzIEFjdGlvbiwgb3B0aW9ucyksXG5cdFx0XHRcdFx0XHRcdGNsYXNzTmFtZXM6IFsndG9vbGJhci10b2dnbGUtcGlja1JlYWN0aW9ucycsIC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ucmVhY3Rpb25zKV0sXG5cdFx0XHRcdFx0XHRcdGFuY2hvckFsaWdubWVudFByb3ZpZGVyOiAoKSA9PiBBbmNob3JBbGlnbm1lbnQuUklHSFRcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLmFjdGlvblZpZXdJdGVtUHJvdmlkZXIoYWN0aW9uIGFzIEFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0b3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbi5IT1JJWk9OVEFMXG5cdFx0fSk7XG5cblx0XHR0aGlzLnRvb2xiYXIudmFsdWUuY29udGV4dCA9IHRoaXMuY29tbWVudE5vZGVDb250ZXh0O1xuXHRcdHRoaXMudG9vbGJhci52YWx1ZS5hY3Rpb25SdW5uZXIgPSB0aGlzLl9hY3Rpb25SdW5uZXI7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUFjdGlvbnNUb29sYmFyKCkge1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXG5cdFx0Y29uc3QgbWVudSA9IHRoaXMuX2NvbW1lbnRNZW51cy5nZXRDb21tZW50VGl0bGVBY3Rpb25zKHRoaXMuY29tbWVudCwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1lbnUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1lbnUub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRjb25zdCB7IHByaW1hcnksIHNlY29uZGFyeSB9ID0gdGhpcy5nZXRUb29sYmFyQWN0aW9ucyhtZW51KTtcblx0XHRcdGlmICghdGhpcy50b29sYmFyICYmIChwcmltYXJ5Lmxlbmd0aCB8fCBzZWNvbmRhcnkubGVuZ3RoKSkge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZVRvb2xiYXIoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudG9vbGJhci52YWx1ZSEuc2V0QWN0aW9ucyhwcmltYXJ5LCBzZWNvbmRhcnkpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHsgcHJpbWFyeSwgc2Vjb25kYXJ5IH0gPSB0aGlzLmdldFRvb2xiYXJBY3Rpb25zKG1lbnUpO1xuXHRcdGFjdGlvbnMucHVzaCguLi5wcmltYXJ5KTtcblxuXHRcdGlmIChhY3Rpb25zLmxlbmd0aCB8fCBzZWNvbmRhcnkubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZVRvb2xiYXIoKTtcblx0XHRcdHRoaXMudG9vbGJhci52YWx1ZSEuc2V0QWN0aW9ucyhhY3Rpb25zLCBzZWNvbmRhcnkpO1xuXHRcdH1cblx0fVxuXG5cdGFjdGlvblZpZXdJdGVtUHJvdmlkZXIoYWN0aW9uOiBBY3Rpb24sIG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpIHtcblx0XHRpZiAoYWN0aW9uLmlkID09PSBUb2dnbGVSZWFjdGlvbnNBY3Rpb24uSUQpIHtcblx0XHRcdG9wdGlvbnMgPSB7IGxhYmVsOiBmYWxzZSwgaWNvbjogdHJ1ZSB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvcHRpb25zID0geyBsYWJlbDogZmFsc2UsIGljb246IHRydWUgfTtcblx0XHR9XG5cblx0XHRpZiAoYWN0aW9uLmlkID09PSBSZWFjdGlvbkFjdGlvbi5JRCkge1xuXHRcdFx0Y29uc3QgaXRlbSA9IG5ldyBSZWFjdGlvbkFjdGlvblZpZXdJdGVtKGFjdGlvbik7XG5cdFx0XHRyZXR1cm4gaXRlbTtcblx0XHR9IGVsc2UgaWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9KTtcblx0XHR9IGVsc2UgaWYgKGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdWJtZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgaXRlbSA9IG5ldyBBY3Rpb25WaWV3SXRlbSh7fSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdHJldHVybiBpdGVtO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHN1Ym1pdENvbW1lbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRFZGl0b3IgJiYgdGhpcy5fY29tbWVudEZvcm1BY3Rpb25zKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9jb21tZW50Rm9ybUFjdGlvbnMudHJpZ2dlckRlZmF1bHRBY3Rpb24oKTtcblx0XHRcdHRoaXMucGVuZGluZ0VkaXQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVSZWFjdGlvblBpY2tlcihyZWFjdGlvbkdyb3VwOiBsYW5ndWFnZXMuQ29tbWVudFJlYWN0aW9uW10pOiBUb2dnbGVSZWFjdGlvbnNBY3Rpb24ge1xuXHRcdGNvbnN0IHRvZ2dsZVJlYWN0aW9uQWN0aW9uID0gdGhpcy5fcmVhY3Rpb25BY3Rpb25zLmFkZChuZXcgVG9nZ2xlUmVhY3Rpb25zQWN0aW9uKCgpID0+IHtcblx0XHRcdHRvZ2dsZVJlYWN0aW9uQWN0aW9uVmlld0l0ZW0/LnNob3coKTtcblx0XHR9LCBubHMubG9jYWxpemUoJ2NvbW1lbnRUb2dnbGVSZWFjdGlvbicsIFwiVG9nZ2xlIFJlYWN0aW9uXCIpKSk7XG5cblx0XHRsZXQgcmVhY3Rpb25NZW51QWN0aW9uczogQWN0aW9uW10gPSBbXTtcblx0XHRpZiAocmVhY3Rpb25Hcm91cCAmJiByZWFjdGlvbkdyb3VwLmxlbmd0aCkge1xuXHRcdFx0cmVhY3Rpb25NZW51QWN0aW9ucyA9IHJlYWN0aW9uR3JvdXAubWFwKChyZWFjdGlvbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVhY3Rpb25BY3Rpb25zLmFkZChuZXcgQWN0aW9uKGByZWFjdGlvbi5jb21tYW5kLiR7cmVhY3Rpb24ubGFiZWx9YCwgYCR7cmVhY3Rpb24ubGFiZWx9YCwgJycsIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jb21tZW50U2VydmljZS50b2dnbGVSZWFjdGlvbih0aGlzLm93bmVyLCB0aGlzLnJlc291cmNlLCB0aGlzLmNvbW1lbnRUaHJlYWQsIHRoaXMuY29tbWVudCwgcmVhY3Rpb24pO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVycm9yID0gZS5tZXNzYWdlXG5cdFx0XHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdjb21tZW50VG9nZ2xlUmVhY3Rpb25FcnJvcicsIFwiVG9nZ2xpbmcgdGhlIGNvbW1lbnQgcmVhY3Rpb24gZmFpbGVkOiB7MH0uXCIsIGUubWVzc2FnZSlcblx0XHRcdFx0XHRcdFx0OiBubHMubG9jYWxpemUoJ2NvbW1lbnRUb2dnbGVSZWFjdGlvbkRlZmF1bHRFcnJvcicsIFwiVG9nZ2xpbmcgdGhlIGNvbW1lbnQgcmVhY3Rpb24gZmFpbGVkXCIpO1xuXHRcdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRvZ2dsZVJlYWN0aW9uQWN0aW9uLm1lbnVBY3Rpb25zID0gcmVhY3Rpb25NZW51QWN0aW9ucztcblxuXHRcdGNvbnN0IHRvZ2dsZVJlYWN0aW9uQWN0aW9uVmlld0l0ZW06IERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtID0gdGhpcy5fcmVhY3Rpb25BY3Rpb25zLmFkZChuZXcgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0oXG5cdFx0XHR0b2dnbGVSZWFjdGlvbkFjdGlvbixcblx0XHRcdCg8VG9nZ2xlUmVhY3Rpb25zQWN0aW9uPnRvZ2dsZVJlYWN0aW9uQWN0aW9uKS5tZW51QWN0aW9ucyxcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0e1xuXHRcdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gVG9nZ2xlUmVhY3Rpb25zQWN0aW9uLklEKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdG9nZ2xlUmVhY3Rpb25BY3Rpb25WaWV3SXRlbTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcihhY3Rpb24gYXMgQWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Y2xhc3NOYW1lczogJ3Rvb2xiYXItdG9nZ2xlLXBpY2tSZWFjdGlvbnMnLFxuXHRcdFx0XHRhbmNob3JBbGlnbm1lbnRQcm92aWRlcjogKCkgPT4gQW5jaG9yQWxpZ25tZW50LlJJR0hUXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHRyZXR1cm4gdG9nZ2xlUmVhY3Rpb25BY3Rpb247XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVJlYWN0aW9uc0NvbnRhaW5lcihjb21tZW50RGV0YWlsc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWFjdGlvbkFjdGlvbnNDb250YWluZXI/LnJlbW92ZSgpO1xuXHRcdHRoaXMuX3JlYWN0aW9uc0FjdGlvbkJhci5jbGVhcigpO1xuXHRcdHRoaXMuX3JlYWN0aW9uQWN0aW9ucy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgaGFzUmVhY3Rpb25IYW5kbGVyID0gdGhpcy5jb21tZW50U2VydmljZS5oYXNSZWFjdGlvbkhhbmRsZXIodGhpcy5vd25lcik7XG5cdFx0Y29uc3QgcmVhY3Rpb25zID0gdGhpcy5jb21tZW50LmNvbW1lbnRSZWFjdGlvbnM/LmZpbHRlcihyZWFjdGlvbiA9PiAhIXJlYWN0aW9uLmNvdW50KSB8fCBbXTtcblxuXHRcdC8vIE9ubHkgY3JlYXRlIHRoZSBjb250YWluZXIgaWYgdGhlcmUgYXJlIHJlYWN0aW9ucyB0byBzaG93IG9yIGlmIHRoZXJlJ3MgYSByZWFjdGlvbiBoYW5kbGVyXG5cdFx0aWYgKHJlYWN0aW9ucy5sZW5ndGggPT09IDAgJiYgIWhhc1JlYWN0aW9uSGFuZGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlYWN0aW9uQWN0aW9uc0NvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29tbWVudERldGFpbHNDb250YWluZXIsIGRvbS4kKCdkaXYuY29tbWVudC1yZWFjdGlvbnMnKSk7XG5cdFx0dGhpcy5fcmVhY3Rpb25zQWN0aW9uQmFyLnZhbHVlID0gbmV3IEFjdGlvbkJhcih0aGlzLl9yZWFjdGlvbkFjdGlvbnNDb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gVG9nZ2xlUmVhY3Rpb25zQWN0aW9uLklEKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbShcblx0XHRcdFx0XHRcdGFjdGlvbixcblx0XHRcdFx0XHRcdCg8VG9nZ2xlUmVhY3Rpb25zQWN0aW9uPmFjdGlvbikubWVudUFjdGlvbnMsXG5cdFx0XHRcdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4gdGhpcy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyKGFjdGlvbiBhcyBBY3Rpb24sIG9wdGlvbnMpLFxuXHRcdFx0XHRcdFx0XHRjbGFzc05hbWVzOiBbJ3Rvb2xiYXItdG9nZ2xlLXBpY2tSZWFjdGlvbnMnLCAuLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnJlYWN0aW9ucyldLFxuXHRcdFx0XHRcdFx0XHRhbmNob3JBbGlnbm1lbnRQcm92aWRlcjogKCkgPT4gQW5jaG9yQWxpZ25tZW50LlJJR0hUXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyKGFjdGlvbiBhcyBBY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmVhY3Rpb25zLm1hcChyZWFjdGlvbiA9PiB7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLl9yZWFjdGlvbkFjdGlvbnMuYWRkKG5ldyBSZWFjdGlvbkFjdGlvbihgcmVhY3Rpb24uJHtyZWFjdGlvbi5sYWJlbH1gLCBgJHtyZWFjdGlvbi5sYWJlbH1gLCByZWFjdGlvbi5oYXNSZWFjdGVkICYmIChyZWFjdGlvbi5jYW5FZGl0IHx8IGhhc1JlYWN0aW9uSGFuZGxlcikgPyAnYWN0aXZlJyA6ICcnLCAocmVhY3Rpb24uY2FuRWRpdCB8fCBoYXNSZWFjdGlvbkhhbmRsZXIpLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jb21tZW50U2VydmljZS50b2dnbGVSZWFjdGlvbih0aGlzLm93bmVyLCB0aGlzLnJlc291cmNlLCB0aGlzLmNvbW1lbnRUaHJlYWQsIHRoaXMuY29tbWVudCwgcmVhY3Rpb24pO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0bGV0IGVycm9yOiBzdHJpbmc7XG5cblx0XHRcdFx0XHRpZiAocmVhY3Rpb24uaGFzUmVhY3RlZCkge1xuXHRcdFx0XHRcdFx0ZXJyb3IgPSBlLm1lc3NhZ2Vcblx0XHRcdFx0XHRcdFx0PyBubHMubG9jYWxpemUoJ2NvbW1lbnREZWxldGVSZWFjdGlvbkVycm9yJywgXCJEZWxldGluZyB0aGUgY29tbWVudCByZWFjdGlvbiBmYWlsZWQ6IHswfS5cIiwgZS5tZXNzYWdlKVxuXHRcdFx0XHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnY29tbWVudERlbGV0ZVJlYWN0aW9uRGVmYXVsdEVycm9yJywgXCJEZWxldGluZyB0aGUgY29tbWVudCByZWFjdGlvbiBmYWlsZWRcIik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGVycm9yID0gZS5tZXNzYWdlXG5cdFx0XHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdjb21tZW50QWRkUmVhY3Rpb25FcnJvcicsIFwiRGVsZXRpbmcgdGhlIGNvbW1lbnQgcmVhY3Rpb24gZmFpbGVkOiB7MH0uXCIsIGUubWVzc2FnZSlcblx0XHRcdFx0XHRcdFx0OiBubHMubG9jYWxpemUoJ2NvbW1lbnRBZGRSZWFjdGlvbkRlZmF1bHRFcnJvcicsIFwiRGVsZXRpbmcgdGhlIGNvbW1lbnQgcmVhY3Rpb24gZmFpbGVkXCIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCByZWFjdGlvbi5yZWFjdG9ycywgcmVhY3Rpb24uaWNvblBhdGgsIHJlYWN0aW9uLmNvdW50KSk7XG5cblx0XHRcdHRoaXMuX3JlYWN0aW9uc0FjdGlvbkJhci52YWx1ZT8ucHVzaChhY3Rpb24sIHsgbGFiZWw6IHRydWUsIGljb246IHRydWUgfSk7XG5cdFx0fSk7XG5cblx0XHRpZiAoaGFzUmVhY3Rpb25IYW5kbGVyKSB7XG5cdFx0XHRjb25zdCB0b2dnbGVSZWFjdGlvbkFjdGlvbiA9IHRoaXMuY3JlYXRlUmVhY3Rpb25QaWNrZXIodGhpcy5jb21tZW50LmNvbW1lbnRSZWFjdGlvbnMgfHwgW10pO1xuXHRcdFx0dGhpcy5fcmVhY3Rpb25zQWN0aW9uQmFyLnZhbHVlPy5wdXNoKHRvZ2dsZVJlYWN0aW9uQWN0aW9uLCB7IGxhYmVsOiBmYWxzZSwgaWNvbjogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRnZXQgY29tbWVudEJvZHlWYWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAodHlwZW9mIHRoaXMuY29tbWVudC5ib2R5ID09PSAnc3RyaW5nJykgPyB0aGlzLmNvbW1lbnQuYm9keSA6IHRoaXMuY29tbWVudC5ib2R5LnZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVDb21tZW50RWRpdG9yKGVkaXRDb250YWluZXI6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fZWRpdE1vZGVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvbS5hcHBlbmQoZWRpdENvbnRhaW5lciwgZG9tLiQoJy5lZGl0LXRleHRhcmVhJykpO1xuXHRcdHRoaXMuX2NvbW1lbnRFZGl0b3IgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNpbXBsZUNvbW1lbnRFZGl0b3IsIGNvbnRhaW5lciwgU2ltcGxlQ29tbWVudEVkaXRvci5nZXRFZGl0b3JPcHRpb25zKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgdGhpcy5wYXJlbnRUaHJlYWQpO1xuXHRcdHRoaXMuX2VkaXRNb2RlRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NvbW1lbnRFZGl0b3IpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMuY29tbWVudHNJbnB1dCxcblx0XHRcdHBhdGg6IGAvY29tbWVudGlucHV0LSR7dGhpcy5jb21tZW50LnVuaXF1ZUlkSW5UaHJlYWR9LSR7RGF0ZS5ub3coKX0ubWRgXG5cdFx0fSk7XG5cdFx0Y29uc3QgbW9kZWxSZWYgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UocmVzb3VyY2UpO1xuXHRcdHRoaXMuX2NvbW1lbnRFZGl0b3JNb2RlbCA9IG1vZGVsUmVmO1xuXHRcdHRoaXMuX2VkaXRNb2RlRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NvbW1lbnRFZGl0b3JNb2RlbCk7XG5cblx0XHR0aGlzLl9jb21tZW50RWRpdG9yLnNldE1vZGVsKHRoaXMuX2NvbW1lbnRFZGl0b3JNb2RlbC5vYmplY3QudGV4dEVkaXRvck1vZGVsKTtcblx0XHR0aGlzLl9jb21tZW50RWRpdG9yLnNldFZhbHVlKHRoaXMucGVuZGluZ0VkaXQ/LmJvZHkgPz8gdGhpcy5jb21tZW50Qm9keVZhbHVlKTtcblx0XHRpZiAodGhpcy5wZW5kaW5nRWRpdCkge1xuXHRcdFx0dGhpcy5fY29tbWVudEVkaXRvci5zZXRQb3NpdGlvbih0aGlzLnBlbmRpbmdFZGl0LmN1cnNvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGxhc3RMaW5lID0gdGhpcy5fY29tbWVudEVkaXRvck1vZGVsLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRjb25zdCBsYXN0Q29sdW1uID0gdGhpcy5fY29tbWVudEVkaXRvck1vZGVsLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwuZ2V0TGluZUxlbmd0aChsYXN0TGluZSkgKyAxO1xuXHRcdFx0dGhpcy5fY29tbWVudEVkaXRvci5zZXRQb3NpdGlvbihuZXcgUG9zaXRpb24obGFzdExpbmUsIGxhc3RDb2x1bW4pKTtcblx0XHR9XG5cdFx0dGhpcy5wZW5kaW5nRWRpdCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jb21tZW50RWRpdG9yLmxheW91dCh7IHdpZHRoOiBjb250YWluZXIuY2xpZW50V2lkdGggLSAxNCwgaGVpZ2h0OiB0aGlzLl9lZGl0b3JIZWlnaHQgfSk7XG5cdFx0dGhpcy5fY29tbWVudEVkaXRvci5mb2N1cygpO1xuXG5cdFx0ZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyhlZGl0Q29udGFpbmVyKSwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29tbWVudEVkaXRvciEubGF5b3V0KHsgd2lkdGg6IGNvbnRhaW5lci5jbGllbnRXaWR0aCAtIDE0LCBoZWlnaHQ6IHRoaXMuX2VkaXRvckhlaWdodCB9KTtcblx0XHRcdHRoaXMuX2NvbW1lbnRFZGl0b3IhLmZvY3VzKCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb21tZW50VGhyZWFkID0gdGhpcy5jb21tZW50VGhyZWFkO1xuXHRcdGNvbW1lbnRUaHJlYWQuaW5wdXQgPSB7XG5cdFx0XHR1cmk6IHRoaXMuX2NvbW1lbnRFZGl0b3IuZ2V0TW9kZWwoKSEudXJpLFxuXHRcdFx0dmFsdWU6IHRoaXMuY29tbWVudEJvZHlWYWx1ZVxuXHRcdH07XG5cdFx0dGhpcy5jb21tZW50U2VydmljZS5zZXRBY3RpdmVFZGl0aW5nQ29tbWVudFRocmVhZChjb21tZW50VGhyZWFkKTtcblx0XHR0aGlzLmNvbW1lbnRTZXJ2aWNlLnNldEFjdGl2ZUNvbW1lbnRBbmRUaHJlYWQodGhpcy5vd25lciwgeyB0aHJlYWQ6IGNvbW1lbnRUaHJlYWQsIGNvbW1lbnQ6IHRoaXMuY29tbWVudCB9KTtcblxuXHRcdHRoaXMuX2VkaXRNb2RlRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NvbW1lbnRFZGl0b3Iub25EaWRGb2N1c0VkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHRjb21tZW50VGhyZWFkLmlucHV0ID0ge1xuXHRcdFx0XHR1cmk6IHRoaXMuX2NvbW1lbnRFZGl0b3IhLmdldE1vZGVsKCkhLnVyaSxcblx0XHRcdFx0dmFsdWU6IHRoaXMuY29tbWVudEJvZHlWYWx1ZVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuY29tbWVudFNlcnZpY2Uuc2V0QWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWQoY29tbWVudFRocmVhZCk7XG5cdFx0XHR0aGlzLmNvbW1lbnRTZXJ2aWNlLnNldEFjdGl2ZUNvbW1lbnRBbmRUaHJlYWQodGhpcy5vd25lciwgeyB0aHJlYWQ6IGNvbW1lbnRUaHJlYWQsIGNvbW1lbnQ6IHRoaXMuY29tbWVudCB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9lZGl0TW9kZURpc3Bvc2FibGVzLmFkZCh0aGlzLl9jb21tZW50RWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KGUgPT4ge1xuXHRcdFx0aWYgKGNvbW1lbnRUaHJlYWQuaW5wdXQgJiYgdGhpcy5fY29tbWVudEVkaXRvciAmJiB0aGlzLl9jb21tZW50RWRpdG9yLmdldE1vZGVsKCkhLnVyaSA9PT0gY29tbWVudFRocmVhZC5pbnB1dC51cmkpIHtcblx0XHRcdFx0Y29uc3QgbmV3VmFsID0gdGhpcy5fY29tbWVudEVkaXRvci5nZXRWYWx1ZSgpO1xuXHRcdFx0XHRpZiAobmV3VmFsICE9PSBjb21tZW50VGhyZWFkLmlucHV0LnZhbHVlKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5wdXQgPSBjb21tZW50VGhyZWFkLmlucHV0O1xuXHRcdFx0XHRcdGlucHV0LnZhbHVlID0gbmV3VmFsO1xuXHRcdFx0XHRcdGNvbW1lbnRUaHJlYWQuaW5wdXQgPSBpbnB1dDtcblx0XHRcdFx0XHR0aGlzLmNvbW1lbnRTZXJ2aWNlLnNldEFjdGl2ZUVkaXRpbmdDb21tZW50VGhyZWFkKGNvbW1lbnRUaHJlYWQpO1xuXHRcdFx0XHRcdHRoaXMuY29tbWVudFNlcnZpY2Uuc2V0QWN0aXZlQ29tbWVudEFuZFRocmVhZCh0aGlzLm93bmVyLCB7IHRocmVhZDogY29tbWVudFRocmVhZCwgY29tbWVudDogdGhpcy5jb21tZW50IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5jYWxjdWxhdGVFZGl0b3JIZWlnaHQoKTtcblxuXHRcdHRoaXMuX2VkaXRNb2RlRGlzcG9zYWJsZXMuYWRkKCh0aGlzLl9jb21tZW50RWRpdG9yTW9kZWwub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvbW1lbnRFZGl0b3IgJiYgdGhpcy5jYWxjdWxhdGVFZGl0b3JIZWlnaHQoKSkge1xuXHRcdFx0XHR0aGlzLl9jb21tZW50RWRpdG9yLmxheW91dCh7IGhlaWdodDogdGhpcy5fZWRpdG9ySGVpZ2h0LCB3aWR0aDogdGhpcy5fY29tbWVudEVkaXRvci5nZXRMYXlvdXRJbmZvKCkud2lkdGggfSk7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRFZGl0b3IucmVuZGVyKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKSk7XG5cblx0fVxuXG5cdHByaXZhdGUgY2FsY3VsYXRlRWRpdG9ySGVpZ2h0KCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9jb21tZW50RWRpdG9yKSB7XG5cdFx0XHRjb25zdCBuZXdFZGl0b3JIZWlnaHQgPSBjYWxjdWxhdGVFZGl0b3JIZWlnaHQodGhpcy5wYXJlbnRFZGl0b3IsIHRoaXMuX2NvbW1lbnRFZGl0b3IsIHRoaXMuX2VkaXRvckhlaWdodCk7XG5cdFx0XHRpZiAobmV3RWRpdG9ySGVpZ2h0ICE9PSB0aGlzLl9lZGl0b3JIZWlnaHQpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9ySGVpZ2h0ID0gbmV3RWRpdG9ySGVpZ2h0O1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0UGVuZGluZ0VkaXQoKTogbGFuZ3VhZ2VzLlBlbmRpbmdDb21tZW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2NvbW1lbnRFZGl0b3I/LmdldE1vZGVsKCk7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRFZGl0b3IgJiYgbW9kZWwgJiYgbW9kZWwuZ2V0VmFsdWVMZW5ndGgoKSA+IDApIHtcblx0XHRcdHJldHVybiB7IGJvZHk6IG1vZGVsLmdldFZhbHVlKCksIGN1cnNvcjogdGhpcy5fY29tbWVudEVkaXRvci5nZXRQb3NpdGlvbigpISB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVDb21tZW50RWRpdG9yKCkge1xuXHRcdHRoaXMuaXNFZGl0aW5nID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuX2VkaXRBY3Rpb24pIHtcblx0XHRcdHRoaXMuX2VkaXRBY3Rpb24uZW5hYmxlZCA9IHRydWU7XG5cdFx0fVxuXHRcdHRoaXMuX2JvZHkuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG5cdFx0dGhpcy5fZWRpdE1vZGVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2NvbW1lbnRFZGl0b3IgPSBudWxsO1xuXHRcdHRoaXMuX2NvbW1lbnRFZGl0Q29udGFpbmVyIS5yZW1vdmUoKTtcblx0fVxuXG5cdGxheW91dCh3aWR0aEluUGl4ZWw/OiBudW1iZXIpIHtcblx0XHRjb25zdCBlZGl0b3JXaWR0aCA9IHdpZHRoSW5QaXhlbCAhPT0gdW5kZWZpbmVkID8gd2lkdGhJblBpeGVsIC0gNzIgLyogLSBtYXJnaW4gYW5kIHNjcm9sbGJhciovIDogKHRoaXMuX2NvbW1lbnRFZGl0b3I/LmdldExheW91dEluZm8oKS53aWR0aCA/PyAwKTtcblx0XHR0aGlzLl9jb21tZW50RWRpdG9yPy5sYXlvdXQoeyB3aWR0aDogZWRpdG9yV2lkdGgsIGhlaWdodDogdGhpcy5fZWRpdG9ySGVpZ2h0IH0pO1xuXHRcdGNvbnN0IHNjcm9sbFdpZHRoID0gdGhpcy5fYm9keS5zY3JvbGxXaWR0aDtcblx0XHRjb25zdCB3aWR0aCA9IGRvbS5nZXRDb250ZW50V2lkdGgodGhpcy5fYm9keSk7XG5cdFx0Y29uc3Qgc2Nyb2xsSGVpZ2h0ID0gdGhpcy5fYm9keS5zY3JvbGxIZWlnaHQ7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gZG9tLmdldENvbnRlbnRIZWlnaHQodGhpcy5fYm9keSkgKyA0O1xuXHRcdHRoaXMuX3Njcm9sbGFibGVFbGVtZW50LnNldFNjcm9sbERpbWVuc2lvbnMoeyB3aWR0aCwgc2Nyb2xsV2lkdGgsIGhlaWdodCwgc2Nyb2xsSGVpZ2h0IH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHN3aXRjaFRvRWRpdE1vZGUoKSB7XG5cdFx0aWYgKHRoaXMuaXNFZGl0aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5pc0VkaXRpbmcgPSB0cnVlO1xuXHRcdHRoaXMuX2JvZHkuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0dGhpcy5fY29tbWVudEVkaXRDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuX2NvbW1lbnREZXRhaWxzQ29udGFpbmVyLCBkb20uJCgnLmVkaXQtY29udGFpbmVyJykpO1xuXHRcdGF3YWl0IHRoaXMuY3JlYXRlQ29tbWVudEVkaXRvcih0aGlzLl9jb21tZW50RWRpdENvbnRhaW5lcik7XG5cblx0XHRjb25zdCBmb3JtQWN0aW9ucyA9IGRvbS5hcHBlbmQodGhpcy5fY29tbWVudEVkaXRDb250YWluZXIsIGRvbS4kKCcuZm9ybS1hY3Rpb25zJykpO1xuXHRcdGNvbnN0IG90aGVyQWN0aW9ucyA9IGRvbS5hcHBlbmQoZm9ybUFjdGlvbnMsIGRvbS4kKCcub3RoZXItYWN0aW9ucycpKTtcblx0XHR0aGlzLmNyZWF0ZUNvbW1lbnRXaWRnZXRGb3JtQWN0aW9ucyhvdGhlckFjdGlvbnMpO1xuXHRcdGNvbnN0IGVkaXRvckFjdGlvbnMgPSBkb20uYXBwZW5kKGZvcm1BY3Rpb25zLCBkb20uJCgnLmVkaXRvci1hY3Rpb25zJykpO1xuXHRcdHRoaXMuY3JlYXRlQ29tbWVudFdpZGdldEVkaXRvckFjdGlvbnMoZWRpdG9yQWN0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0TW9kZURpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIGNyZWF0ZUNvbW1lbnRXaWRnZXRGb3JtQWN0aW9ucyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29uc3QgbWVudXMgPSB0aGlzLmNvbW1lbnRTZXJ2aWNlLmdldENvbW1lbnRNZW51cyh0aGlzLm93bmVyKTtcblx0XHRjb25zdCBtZW51ID0gbWVudXMuZ2V0Q29tbWVudEFjdGlvbnModGhpcy5jb21tZW50LCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9lZGl0TW9kZURpc3Bvc2FibGVzLmFkZChtZW51KTtcblx0XHR0aGlzLl9lZGl0TW9kZURpc3Bvc2FibGVzLmFkZChtZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX2NvbW1lbnRGb3JtQWN0aW9ucz8uc2V0QWN0aW9ucyhtZW51KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9jb21tZW50Rm9ybUFjdGlvbnMgPSBuZXcgQ29tbWVudEZvcm1BY3Rpb25zKHRoaXMua2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmNvbnRleHRNZW51U2VydmljZSwgY29udGFpbmVyLCAoYWN0aW9uOiBJQWN0aW9uKTogdm9pZCA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gdGhpcy5fY29tbWVudEVkaXRvciEuZ2V0VmFsdWUoKTtcblxuXHRcdFx0YWN0aW9uLnJ1bih7XG5cdFx0XHRcdHRocmVhZDogdGhpcy5jb21tZW50VGhyZWFkLFxuXHRcdFx0XHRjb21tZW50VW5pcXVlSWQ6IHRoaXMuY29tbWVudC51bmlxdWVJZEluVGhyZWFkLFxuXHRcdFx0XHR0ZXh0OiB0ZXh0LFxuXHRcdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuQ29tbWVudFRocmVhZE5vZGVcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLnJlbW92ZUNvbW1lbnRFZGl0b3IoKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2VkaXRNb2RlRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NvbW1lbnRGb3JtQWN0aW9ucyk7XG5cdFx0dGhpcy5fY29tbWVudEZvcm1BY3Rpb25zLnNldEFjdGlvbnMobWVudSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvbW1lbnRXaWRnZXRFZGl0b3JBY3Rpb25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHRjb25zdCBtZW51cyA9IHRoaXMuY29tbWVudFNlcnZpY2UuZ2V0Q29tbWVudE1lbnVzKHRoaXMub3duZXIpO1xuXHRcdGNvbnN0IG1lbnUgPSBtZW51cy5nZXRDb21tZW50RWRpdG9yQWN0aW9ucyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9lZGl0TW9kZURpc3Bvc2FibGVzLmFkZChtZW51KTtcblx0XHR0aGlzLl9lZGl0TW9kZURpc3Bvc2FibGVzLmFkZChtZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX2NvbW1lbnRFZGl0b3JBY3Rpb25zPy5zZXRBY3Rpb25zKG1lbnUsIHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2NvbW1lbnRFZGl0b3JBY3Rpb25zID0gbmV3IENvbW1lbnRGb3JtQWN0aW9ucyh0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIGNvbnRhaW5lciwgKGFjdGlvbjogSUFjdGlvbik6IHZvaWQgPT4ge1xuXHRcdFx0Y29uc3QgdGV4dCA9IHRoaXMuX2NvbW1lbnRFZGl0b3IhLmdldFZhbHVlKCk7XG5cblx0XHRcdGFjdGlvbi5ydW4oe1xuXHRcdFx0XHR0aHJlYWQ6IHRoaXMuY29tbWVudFRocmVhZCxcblx0XHRcdFx0Y29tbWVudFVuaXF1ZUlkOiB0aGlzLmNvbW1lbnQudW5pcXVlSWRJblRocmVhZCxcblx0XHRcdFx0dGV4dDogdGV4dCxcblx0XHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLkNvbW1lbnRUaHJlYWROb2RlXG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5fY29tbWVudEVkaXRvcj8uZm9jdXMoKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2VkaXRNb2RlRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NvbW1lbnRFZGl0b3JBY3Rpb25zKTtcblx0XHR0aGlzLl9jb21tZW50RWRpdG9yQWN0aW9ucy5zZXRBY3Rpb25zKG1lbnUsIHRydWUpO1xuXHR9XG5cblx0c2V0Rm9jdXMoZm9jdXNlZDogYm9vbGVhbiwgdmlzaWJsZTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdFx0aWYgKGZvY3VzZWQpIHtcblx0XHRcdHRoaXMuX2RvbU5vZGUuZm9jdXMoKTtcblx0XHRcdHRoaXMuX2FjdGlvbnNUb29sYmFyQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3RhYmZvY3VzZWQnKTtcblx0XHRcdHRoaXMuX2RvbU5vZGUudGFiSW5kZXggPSAwO1xuXHRcdFx0aWYgKHRoaXMuY29tbWVudC5tb2RlID09PSBsYW5ndWFnZXMuQ29tbWVudE1vZGUuRWRpdGluZykge1xuXHRcdFx0XHR0aGlzLl9jb21tZW50RWRpdG9yPy5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5fYWN0aW9uc1Rvb2xiYXJDb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCd0YWJmb2N1c2VkJykgJiYgIXRoaXMuX2FjdGlvbnNUb29sYmFyQ29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnbW91c2VvdmVyJykpIHtcblx0XHRcdFx0dGhpcy5fZG9tTm9kZS50YWJJbmRleCA9IC0xO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYWN0aW9uc1Rvb2xiYXJDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgndGFiZm9jdXNlZCcpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHVwZGF0ZShuZXdDb21tZW50OiBsYW5ndWFnZXMuQ29tbWVudCkge1xuXG5cdFx0aWYgKG5ld0NvbW1lbnQuYm9keSAhPT0gdGhpcy5jb21tZW50LmJvZHkpIHtcblx0XHRcdHRoaXMudXBkYXRlQ29tbWVudEJvZHkobmV3Q29tbWVudC5ib2R5KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jb21tZW50LnVzZXJJY29uUGF0aCAmJiBuZXdDb21tZW50LnVzZXJJY29uUGF0aCAmJiAoVVJJLmZyb20odGhpcy5jb21tZW50LnVzZXJJY29uUGF0aCkudG9TdHJpbmcoKSAhPT0gVVJJLmZyb20obmV3Q29tbWVudC51c2VySWNvblBhdGgpLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbW1lbnRVc2VySWNvbihuZXdDb21tZW50LnVzZXJJY29uUGF0aCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNDaGFuZ2luZ01vZGU6IGJvb2xlYW4gPSBuZXdDb21tZW50Lm1vZGUgIT09IHVuZGVmaW5lZCAmJiBuZXdDb21tZW50Lm1vZGUgIT09IHRoaXMuY29tbWVudC5tb2RlO1xuXG5cdFx0dGhpcy5jb21tZW50ID0gbmV3Q29tbWVudDtcblxuXHRcdGlmIChpc0NoYW5naW5nTW9kZSkge1xuXHRcdFx0aWYgKG5ld0NvbW1lbnQubW9kZSA9PT0gbGFuZ3VhZ2VzLkNvbW1lbnRNb2RlLkVkaXRpbmcpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zd2l0Y2hUb0VkaXRNb2RlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnJlbW92ZUNvbW1lbnRFZGl0b3IoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobmV3Q29tbWVudC5sYWJlbCkge1xuXHRcdFx0dGhpcy5faXNQZW5kaW5nTGFiZWwuaW5uZXJUZXh0ID0gbmV3Q29tbWVudC5sYWJlbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5faXNQZW5kaW5nTGFiZWwuaW5uZXJUZXh0ID0gJyc7XG5cdFx0fVxuXG5cdFx0Ly8gdXBkYXRlIGNvbW1lbnQgcmVhY3Rpb25zXG5cdFx0dGhpcy5jcmVhdGVSZWFjdGlvbnNDb250YWluZXIodGhpcy5fY29tbWVudERldGFpbHNDb250YWluZXIpO1xuXG5cdFx0aWYgKHRoaXMuY29tbWVudC5jb250ZXh0VmFsdWUpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRDb250ZXh0VmFsdWUuc2V0KHRoaXMuY29tbWVudC5jb250ZXh0VmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jb21tZW50Q29udGV4dFZhbHVlLnJlc2V0KCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY29tbWVudC50aW1lc3RhbXApIHtcblx0XHRcdHRoaXMudXBkYXRlVGltZXN0YW1wKHRoaXMuY29tbWVudC50aW1lc3RhbXApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Db250ZXh0TWVudShlOiBNb3VzZUV2ZW50KSB7XG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGRvbS5nZXRXaW5kb3codGhpcy5fZG9tTm9kZSksIGUpO1xuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGV2ZW50LFxuXHRcdFx0bWVudUlkOiBNZW51SWQuQ29tbWVudFRocmVhZENvbW1lbnRDb250ZXh0LFxuXHRcdFx0bWVudUFjdGlvbk9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLl9jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdGFjdGlvblJ1bm5lcjogdGhpcy5fYWN0aW9uUnVubmVyLFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuY29tbWVudE5vZGVDb250ZXh0O1xuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdGZvY3VzKCkge1xuXHRcdHRoaXMuZG9tTm9kZS5mb2N1cygpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdmb2N1cycpO1xuXHRcdHRoaXMuX2ZvY3VzQ2xlYXJUaW1lci5zZXRJZk5vdFNldCgoKSA9PiB0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnZm9jdXMnKSwgMzAwMCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZmlsbEluQWN0aW9ucyhncm91cHM6IFtzdHJpbmcsIEFycmF5PE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24+XVtdLCB0YXJnZXQ6IElBY3Rpb25bXSB8IHsgcHJpbWFyeTogSUFjdGlvbltdOyBzZWNvbmRhcnk6IElBY3Rpb25bXSB9LCB1c2VBbHRlcm5hdGl2ZUFjdGlvbnM6IGJvb2xlYW4sIGlzUHJpbWFyeUdyb3VwOiAoZ3JvdXA6IHN0cmluZykgPT4gYm9vbGVhbiA9IGdyb3VwID0+IGdyb3VwID09PSAnbmF2aWdhdGlvbicpOiB2b2lkIHtcblx0Zm9yIChjb25zdCB0dXBsZSBvZiBncm91cHMpIHtcblx0XHRsZXQgW2dyb3VwLCBhY3Rpb25zXSA9IHR1cGxlO1xuXHRcdGlmICh1c2VBbHRlcm5hdGl2ZUFjdGlvbnMpIHtcblx0XHRcdGFjdGlvbnMgPSBhY3Rpb25zLm1hcChhID0+IChhIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pICYmICEhYS5hbHQgPyBhLmFsdCA6IGEpO1xuXHRcdH1cblxuXHRcdGlmIChpc1ByaW1hcnlHcm91cChncm91cCkpIHtcblx0XHRcdGNvbnN0IHRvID0gQXJyYXkuaXNBcnJheSh0YXJnZXQpID8gdGFyZ2V0IDogdGFyZ2V0LnByaW1hcnk7XG5cblx0XHRcdHRvLnVuc2hpZnQoLi4uYWN0aW9ucyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHRvID0gQXJyYXkuaXNBcnJheSh0YXJnZXQpID8gdGFyZ2V0IDogdGFyZ2V0LnNlY29uZGFyeTtcblxuXHRcdFx0aWYgKHRvLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dG8ucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0by5wdXNoKC4uLmFjdGlvbnMpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxTQUFTO0FBQ3JCLFlBQVksZUFBZTtBQUMzQixTQUFTLG9CQUFvQixpQkFBaUI7QUFDOUMsU0FBUyxRQUFpQixXQUFXLG9CQUFvQjtBQUN6RCxTQUFTLFlBQVksaUJBQTZCLHlCQUF5QjtBQUMzRSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFdBQTBCO0FBQ25DLFNBQXdDLGdDQUFnQztBQUV4RSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUEyQixtQkFBbUIscUJBQXFCLDZCQUE2QjtBQUNoRyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZUFBZTtBQUN4QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QixnQkFBZ0IsOEJBQThCO0FBRTlFLFNBQVMsZ0JBQWdCLG1CQUEwQixjQUFjO0FBQ2pFLFNBQVMseUJBQXlCLGtDQUFrQztBQUNwRSxTQUFTLDBCQUF1QztBQUNoRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLHNCQUE4QztBQUN2RCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFLdEMsU0FBUyxZQUFZLDJCQUEyQjtBQUNoRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFlBQVksZUFBZTtBQUNwQyxTQUFTLHdCQUFnRDtBQUN6RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFtQyx5QkFBeUI7QUFDNUQsU0FBUyxnQkFBZ0I7QUFFekIsTUFBTSw2QkFBNkIsYUFBYTtBQUFBLEVBQy9DLE1BQXlCLFVBQVUsUUFBaUIsU0FBbUM7QUFDdEYsVUFBTSxPQUFPLElBQUksR0FBRyxPQUFPO0FBQUEsRUFDNUI7QUFDRDtBQUVPLElBQU0sY0FBTixjQUF5RCxXQUFXO0FBQUEsRUEwQzFFLFlBQ2tCLGNBQ1QsZUFDRCxTQUNDLGFBQ0EsT0FDQSxVQUNBLGNBQ1MseUJBQ2Msc0JBQ04sZ0JBQ0sscUJBQ0Qsb0JBQ1QsbUJBQ1csc0JBQ1IsY0FDSyxtQkFDUSxrQkFDTyx5QkFDMUM7QUFDRCxVQUFNO0FBbkJXO0FBQ1Q7QUFDRDtBQUNDO0FBQ0E7QUFDQTtBQUNBO0FBQ1M7QUFDYztBQUNOO0FBQ0s7QUFDRDtBQUVFO0FBQ1I7QUFDSztBQUNRO0FBQ087QUF4RDVDLFNBQWlCLE1BQTRDLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBRW5HLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxhQUFhLENBQUM7QUFFckUsU0FBUSxjQUE2QjtBQUNyQyxTQUFRLHdCQUE0QztBQUdwRCxTQUFpQixzQkFBb0QsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFDM0csU0FBaUIsbUJBQW9DLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBRXpGLFNBQVEsaUJBQTZDO0FBQ3JELFNBQVEsc0JBQW1FO0FBQzNFLFNBQVEsZ0JBQWdCO0FBWXhCLFNBQWlCLGdCQUFzQyxLQUFLLFVBQVUsSUFBSSxxQkFBcUIsQ0FBQztBQUNoRyxTQUFpQixVQUFzQyxLQUFLLFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztBQUM3RixTQUFRLHNCQUFpRDtBQUN6RCxTQUFRLHdCQUFtRDtBQUUzRCxTQUFpQixjQUFjLEtBQUssVUFBVSxJQUFJLFFBQXdCLENBQUM7QUFNM0UsU0FBTyxZQUFxQjtBQXlmNUIsU0FBaUIsdUJBQXdDLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBamU1RixTQUFLLFdBQVcsSUFBSSxFQUFFLG9CQUFvQjtBQUMxQyxTQUFLLHFCQUFxQixLQUFLLFVBQVUsa0JBQWtCLGFBQWEsS0FBSyxRQUFRLENBQUM7QUFDdEYsU0FBSyx1QkFBdUIsbUJBQW1CLGVBQWUsT0FBTyxLQUFLLGtCQUFrQjtBQUM1RixRQUFJLEtBQUssUUFBUSxjQUFjO0FBQzlCLFdBQUsscUJBQXFCLElBQUksS0FBSyxRQUFRLFlBQVk7QUFBQSxJQUN4RDtBQUNBLFNBQUssZ0JBQWdCLEtBQUssZUFBZSxnQkFBZ0IsS0FBSyxLQUFLO0FBRW5FLFNBQUssU0FBUyxXQUFXO0FBQ3pCLFNBQUssVUFBVSxJQUFJLE9BQU8sS0FBSyxVQUFVLElBQUksRUFBRSxzQkFBc0IsQ0FBQztBQUN0RSxTQUFLLHNCQUFzQixLQUFLLFFBQVEsWUFBWTtBQUVwRCxTQUFLLDJCQUEyQixJQUFJLE9BQU8sS0FBSyxVQUFVLElBQUksRUFBRSwwQkFBMEIsQ0FBQztBQUUzRixTQUFLLGFBQWEsS0FBSyx3QkFBd0I7QUFDL0MsU0FBSyxRQUFRLFNBQVMsY0FBYyxLQUFLO0FBQ3pDLFNBQUssTUFBTSxVQUFVLElBQUksZ0JBQWdCLGdDQUFnQztBQUN6RSxRQUFJLHFCQUFxQixTQUE2QyxnQkFBZ0IsR0FBRyxjQUFjLE9BQU87QUFDN0csV0FBSyxNQUFNLFVBQVUsSUFBSSx5QkFBeUI7QUFBQSxJQUNuRDtBQUVBLFNBQUssYUFBYSxLQUFLLDBCQUEwQixLQUFLLEtBQUs7QUFDM0QsU0FBSyxrQkFBa0IsS0FBSyxRQUFRLElBQUk7QUFFeEMsU0FBSyx5QkFBeUIsS0FBSyx3QkFBd0I7QUFFM0QsU0FBSyxTQUFTLGFBQWEsY0FBYyxHQUFHLFFBQVEsUUFBUSxLQUFLLEtBQUssZ0JBQWdCLEVBQUU7QUFDeEYsU0FBSyxTQUFTLGFBQWEsUUFBUSxVQUFVO0FBRTdDLFNBQUssVUFBVSxJQUFJLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxVQUFVLE9BQU8sTUFBTSxLQUFLLGFBQWEsS0FBSyxZQUFZLEtBQUssSUFBSSxDQUFDLENBQUM7QUFDakksU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssVUFBVSxJQUFJLFVBQVUsY0FBYyxPQUFLO0FBQ3hGLGFBQU8sS0FBSyxjQUFjLENBQUM7QUFBQSxJQUM1QixDQUFDLENBQUM7QUFFRixRQUFJLGFBQWE7QUFDaEIsV0FBSyxpQkFBaUI7QUFBQSxJQUN2QjtBQUVBLFNBQUssdUJBQXVCO0FBQUEsRUFDN0I7QUFBQSxFQW5FQSxJQUFXLFVBQXVCO0FBQ2pDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQW1FUSx5QkFBeUI7QUFDaEMsU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssVUFBVSxJQUFJLFVBQVUsVUFBVSxNQUFNO0FBQ3JGLFdBQUssZUFBZSwwQkFBMEIsS0FBSyxPQUFPLEVBQUUsUUFBUSxLQUFLLGVBQWUsU0FBUyxLQUFLLFFBQVEsQ0FBQztBQUFBLElBQ2hILEdBQUcsSUFBSSxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBRVEsYUFBYSxXQUF3QixNQUFtQjtBQUMvRCxTQUFLLGNBQWMsS0FBSyxVQUFVLElBQUksV0FBVztBQUFBLE1BQ2hELG9CQUFvQjtBQUFBLE1BQ3BCLHNCQUFzQjtBQUFBLE1BQ3RCLDhCQUE4QixRQUFNLElBQUksNkJBQTZCLElBQUksVUFBVSxTQUFTLEdBQUcsRUFBRTtBQUFBLElBQ2xHLENBQUMsQ0FBQztBQUNGLFNBQUsscUJBQXFCLEtBQUssVUFBVSxJQUFJLHdCQUF3QixNQUFNO0FBQUEsTUFDMUUsWUFBWSxvQkFBb0I7QUFBQSxNQUNoQyxVQUFVLG9CQUFvQjtBQUFBLElBQy9CLEdBQUcsS0FBSyxXQUFXLENBQUM7QUFFcEIsU0FBSyxVQUFVLEtBQUssbUJBQW1CLFNBQVMsT0FBSztBQUNwRCxVQUFJLEVBQUUsbUJBQW1CO0FBQ3hCLGFBQUssYUFBYSxFQUFFO0FBQUEsTUFDckI7QUFDQSxVQUFJLEVBQUUsa0JBQWtCO0FBQ3ZCLGFBQUssWUFBWSxFQUFFO0FBQUEsTUFDcEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFVBQU0sMkJBQTJCLEtBQUssVUFBVSxJQUFJLFdBQVcsTUFBTSxRQUFRLENBQUMsRUFBRTtBQUNoRixTQUFLLFVBQVUseUJBQXlCLE9BQUs7QUFDNUMsWUFBTSxXQUFXLEtBQUssbUJBQW1CLGtCQUFrQjtBQUMzRCxZQUFNLGFBQWEsS0FBSyxJQUFJLEtBQUssYUFBYSxTQUFTLFVBQVUsS0FBSyxJQUFJLFNBQVksS0FBSztBQUMzRixZQUFNLFlBQVksS0FBSyxJQUFJLEtBQUssWUFBWSxTQUFTLFNBQVMsS0FBSyxJQUFJLFNBQVksS0FBSztBQUV4RixVQUFJLGVBQWUsVUFBYSxjQUFjLFFBQVc7QUFDeEQsYUFBSyxtQkFBbUIsa0JBQWtCLEVBQUUsWUFBWSxVQUFVLENBQUM7QUFBQSxNQUNwRTtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsY0FBVSxZQUFZLEtBQUssbUJBQW1CLFdBQVcsQ0FBQztBQUFBLEVBQzNEO0FBQUEsRUFFUSxrQkFBa0IsTUFBZ0M7QUFDekQsU0FBSyxNQUFNLFlBQVk7QUFDdkIsU0FBSyxJQUFJLE1BQU07QUFDZixTQUFLLGFBQWE7QUFDbEIsUUFBSSxPQUFPLFNBQVMsVUFBVTtBQUM3QixXQUFLLGFBQWEsSUFBSSxPQUFPLEtBQUssT0FBTyxJQUFJLEVBQUUsMkJBQTJCLENBQUM7QUFDM0UsV0FBSyxXQUFXLFlBQVk7QUFBQSxJQUM3QixPQUFPO0FBQ04sV0FBSyxJQUFJLFFBQVEsS0FBSyx3QkFBd0IsT0FBTyxNQUFNLEtBQUssdUJBQXVCO0FBQ3ZGLFdBQUssTUFBTSxZQUFZLEtBQUssSUFBSSxNQUFNLE9BQU87QUFBQSxJQUM5QztBQUFBLEVBQ0Q7QUFBQSxFQUVRLHNCQUFzQixjQUF5QztBQUN0RSxTQUFLLFFBQVEsY0FBYztBQUMzQixRQUFJLGNBQWM7QUFDakIsWUFBTSxNQUFNLElBQUksT0FBTyxLQUFLLFNBQVMsSUFBSSxFQUFFLFlBQVksQ0FBQztBQUN4RCxVQUFJLE1BQU0sV0FBVyxnQkFBZ0IsSUFBSSxPQUFPLFlBQVksQ0FBQyxFQUFFLFNBQVMsSUFBSTtBQUM1RSxVQUFJLFVBQVUsT0FBSyxJQUFJLE9BQU87QUFBQSxJQUMvQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQVcsYUFBb0M7QUFDOUMsV0FBTyxLQUFLLFlBQVk7QUFBQSxFQUN6QjtBQUFBLEVBRVEsZ0JBQWdCLFdBQXdCO0FBQy9DLFNBQUssYUFBYSxJQUFJLE9BQU8sV0FBVyxJQUFJLEVBQUUsMEJBQTBCLENBQUM7QUFDekUsU0FBSyxnQkFBZ0IsS0FBSyxRQUFRLFNBQVM7QUFBQSxFQUM1QztBQUFBLEVBRVEsZ0JBQWdCLEtBQWM7QUFDckMsUUFBSSxDQUFDLEtBQUssWUFBWTtBQUNyQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFlBQVksUUFBUSxTQUFZLElBQUksS0FBSyxHQUFHLElBQUk7QUFDdEQsUUFBSSxDQUFDLFdBQVc7QUFDZixXQUFLLGtCQUFrQixRQUFRO0FBQUEsSUFDaEMsT0FBTztBQUNOLFVBQUksQ0FBQyxLQUFLLGtCQUFrQjtBQUMzQixhQUFLLG1CQUFtQixJQUFJLGdCQUFnQixLQUFLLHNCQUFzQixLQUFLLGNBQWMsS0FBSyxZQUFZLFNBQVM7QUFDcEgsYUFBSyxVQUFVLEtBQUssZ0JBQWdCO0FBQUEsTUFDckMsT0FBTztBQUNOLGFBQUssaUJBQWlCLGFBQWEsU0FBUztBQUFBLE1BQzdDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGFBQWEseUJBQTRDO0FBQ2hFLFVBQU0sU0FBUyxJQUFJLE9BQU8seUJBQXlCLElBQUksRUFBRSxxQkFBcUIsZ0NBQWdDLEVBQUUsQ0FBQztBQUNqSCxVQUFNLGdCQUFnQixJQUFJLE9BQU8sUUFBUSxJQUFJLEVBQUUscUJBQXFCLENBQUM7QUFDckUsVUFBTSxTQUFTLElBQUksT0FBTyxlQUFlLElBQUksRUFBRSxlQUFlLENBQUM7QUFDL0QsV0FBTyxZQUFZLEtBQUssUUFBUTtBQUNoQyxTQUFLLGdCQUFnQixhQUFhO0FBQ2xDLFNBQUssa0JBQWtCLElBQUksT0FBTyxlQUFlLElBQUksRUFBRSxnQkFBZ0IsQ0FBQztBQUV4RSxRQUFJLEtBQUssUUFBUSxPQUFPO0FBQ3ZCLFdBQUssZ0JBQWdCLFlBQVksS0FBSyxRQUFRO0FBQUEsSUFDL0MsT0FBTztBQUNOLFdBQUssZ0JBQWdCLFlBQVk7QUFBQSxJQUNsQztBQUVBLFNBQUssMkJBQTJCLElBQUksT0FBTyxRQUFRLElBQUksRUFBRSxrQkFBa0IsQ0FBQztBQUM1RSxTQUFLLHFCQUFxQjtBQUFBLEVBQzNCO0FBQUEsRUFFUSxrQkFBa0IsTUFBMkQ7QUFDcEYsVUFBTSxxQkFBcUIsS0FBSyxXQUFXLEVBQUUsbUJBQW1CLEtBQUssQ0FBQztBQUN0RSxVQUFNLFVBQXFCLENBQUM7QUFDNUIsVUFBTSxZQUF1QixDQUFDO0FBQzlCLFVBQU0sU0FBUyxFQUFFLFNBQVMsVUFBVTtBQUNwQyxrQkFBYyxvQkFBb0IsUUFBUSxPQUFPLE9BQUssVUFBVSxLQUFLLENBQUMsQ0FBQztBQUN2RSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsSUFBWSxxQkFBaUo7QUFDNUosV0FBTztBQUFBLE1BQUM7QUFBQSxRQUNQLFFBQVEsS0FBSztBQUFBLFFBQ2IsaUJBQWlCLEtBQUssUUFBUTtBQUFBLFFBQzlCLE1BQU0sYUFBYTtBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBLFFBQ0Msc0JBQXNCLEtBQUssY0FBYztBQUFBLFFBQ3pDLHFCQUFxQixLQUFLLGNBQWM7QUFBQSxRQUN4QyxNQUFNLGFBQWE7QUFBQSxNQUNwQjtBQUFBLElBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxnQkFBZ0I7QUFDdkIsU0FBSyxRQUFRLFFBQVEsSUFBSSxRQUFRLEtBQUssMEJBQTBCLEtBQUssb0JBQW9CO0FBQUEsTUFDeEYsd0JBQXdCLENBQUMsUUFBUSxZQUFZO0FBQzVDLFlBQUksT0FBTyxPQUFPLHNCQUFzQixJQUFJO0FBQzNDLGlCQUFPLElBQUk7QUFBQSxZQUNWO0FBQUEsWUFDd0IsT0FBUTtBQUFBLFlBQ2hDLEtBQUs7QUFBQSxZQUNMO0FBQUEsY0FDQyxHQUFHO0FBQUEsY0FDSCx3QkFBd0IsQ0FBQ0EsU0FBUUMsYUFBWSxLQUFLLHVCQUF1QkQsU0FBa0JDLFFBQU87QUFBQSxjQUNsRyxZQUFZLENBQUMsZ0NBQWdDLEdBQUcsVUFBVSxpQkFBaUIsUUFBUSxTQUFTLENBQUM7QUFBQSxjQUM3Rix5QkFBeUIsTUFBTSxnQkFBZ0I7QUFBQSxZQUNoRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQ0EsZUFBTyxLQUFLLHVCQUF1QixRQUFrQixPQUFPO0FBQUEsTUFDN0Q7QUFBQSxNQUNBLGFBQWEsbUJBQW1CO0FBQUEsSUFDakMsQ0FBQztBQUVELFNBQUssUUFBUSxNQUFNLFVBQVUsS0FBSztBQUNsQyxTQUFLLFFBQVEsTUFBTSxlQUFlLEtBQUs7QUFBQSxFQUN4QztBQUFBLEVBRVEsdUJBQXVCO0FBQzlCLFVBQU0sVUFBcUIsQ0FBQztBQUU1QixVQUFNLE9BQU8sS0FBSyxjQUFjLHVCQUF1QixLQUFLLFNBQVMsS0FBSyxrQkFBa0I7QUFDNUYsU0FBSyxVQUFVLElBQUk7QUFDbkIsU0FBSyxVQUFVLEtBQUssWUFBWSxPQUFLO0FBQ3BDLFlBQU0sRUFBRSxTQUFBQyxVQUFTLFdBQUFDLFdBQVUsSUFBSSxLQUFLLGtCQUFrQixJQUFJO0FBQzFELFVBQUksQ0FBQyxLQUFLLFlBQVlELFNBQVEsVUFBVUMsV0FBVSxTQUFTO0FBQzFELGFBQUssY0FBYztBQUFBLE1BQ3BCO0FBQ0EsV0FBSyxRQUFRLE1BQU8sV0FBV0QsVUFBU0MsVUFBUztBQUFBLElBQ2xELENBQUMsQ0FBQztBQUVGLFVBQU0sRUFBRSxTQUFTLFVBQVUsSUFBSSxLQUFLLGtCQUFrQixJQUFJO0FBQzFELFlBQVEsS0FBSyxHQUFHLE9BQU87QUFFdkIsUUFBSSxRQUFRLFVBQVUsVUFBVSxRQUFRO0FBQ3ZDLFdBQUssY0FBYztBQUNuQixXQUFLLFFBQVEsTUFBTyxXQUFXLFNBQVMsU0FBUztBQUFBLElBQ2xEO0FBQUEsRUFDRDtBQUFBLEVBRUEsdUJBQXVCLFFBQWdCLFNBQWlDO0FBQ3ZFLFFBQUksT0FBTyxPQUFPLHNCQUFzQixJQUFJO0FBQzNDLGdCQUFVLEVBQUUsT0FBTyxPQUFPLE1BQU0sS0FBSztBQUFBLElBQ3RDLE9BQU87QUFDTixnQkFBVSxFQUFFLE9BQU8sT0FBTyxNQUFNLEtBQUs7QUFBQSxJQUN0QztBQUVBLFFBQUksT0FBTyxPQUFPLGVBQWUsSUFBSTtBQUNwQyxZQUFNLE9BQU8sSUFBSSx1QkFBdUIsTUFBTTtBQUM5QyxhQUFPO0FBQUEsSUFDUixXQUFXLGtCQUFrQixnQkFBZ0I7QUFDNUMsYUFBTyxLQUFLLHFCQUFxQixlQUFlLHlCQUF5QixRQUFRLEVBQUUsZUFBZSxRQUFRLGNBQWMsQ0FBQztBQUFBLElBQzFILFdBQVcsa0JBQWtCLG1CQUFtQjtBQUMvQyxhQUFPLEtBQUsscUJBQXFCLGVBQWUsNEJBQTRCLFFBQVEsT0FBTztBQUFBLElBQzVGLE9BQU87QUFDTixZQUFNLE9BQU8sSUFBSSxlQUFlLENBQUMsR0FBRyxRQUFRLE9BQU87QUFDbkQsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLGdCQUErQjtBQUNwQyxRQUFJLEtBQUssa0JBQWtCLEtBQUsscUJBQXFCO0FBQ3BELFlBQU0sS0FBSyxvQkFBb0IscUJBQXFCO0FBQ3BELFdBQUssY0FBYztBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUFBLEVBRVEscUJBQXFCLGVBQW1FO0FBQy9GLFVBQU0sdUJBQXVCLEtBQUssaUJBQWlCLElBQUksSUFBSSxzQkFBc0IsTUFBTTtBQUN0RixvQ0FBOEIsS0FBSztBQUFBLElBQ3BDLEdBQUcsSUFBSSxTQUFTLHlCQUF5QixpQkFBaUIsQ0FBQyxDQUFDO0FBRTVELFFBQUksc0JBQWdDLENBQUM7QUFDckMsUUFBSSxpQkFBaUIsY0FBYyxRQUFRO0FBQzFDLDRCQUFzQixjQUFjLElBQUksQ0FBQyxhQUFhO0FBQ3JELGVBQU8sS0FBSyxpQkFBaUIsSUFBSSxJQUFJLE9BQU8sb0JBQW9CLFNBQVMsS0FBSyxJQUFJLEdBQUcsU0FBUyxLQUFLLElBQUksSUFBSSxNQUFNLFlBQVk7QUFDNUgsY0FBSTtBQUNILGtCQUFNLEtBQUssZUFBZSxlQUFlLEtBQUssT0FBTyxLQUFLLFVBQVUsS0FBSyxlQUFlLEtBQUssU0FBUyxRQUFRO0FBQUEsVUFDL0csU0FBUyxHQUFHO0FBQ1gsa0JBQU0sUUFBUSxFQUFFLFVBQ2IsSUFBSSxTQUFTLDhCQUE4Qiw4Q0FBOEMsRUFBRSxPQUFPLElBQ2xHLElBQUksU0FBUyxxQ0FBcUMsc0NBQXNDO0FBQzNGLGlCQUFLLG9CQUFvQixNQUFNLEtBQUs7QUFBQSxVQUNyQztBQUFBLFFBQ0QsQ0FBQyxDQUFDO0FBQUEsTUFDSCxDQUFDO0FBQUEsSUFDRjtBQUVBLHlCQUFxQixjQUFjO0FBRW5DLFVBQU0sK0JBQTJELEtBQUssaUJBQWlCLElBQUksSUFBSTtBQUFBLE1BQzlGO0FBQUEsTUFDd0IscUJBQXNCO0FBQUEsTUFDOUMsS0FBSztBQUFBLE1BQ0w7QUFBQSxRQUNDLHdCQUF3QixDQUFDLFFBQVEsWUFBWTtBQUM1QyxjQUFJLE9BQU8sT0FBTyxzQkFBc0IsSUFBSTtBQUMzQyxtQkFBTztBQUFBLFVBQ1I7QUFDQSxpQkFBTyxLQUFLLHVCQUF1QixRQUFrQixPQUFPO0FBQUEsUUFDN0Q7QUFBQSxRQUNBLFlBQVk7QUFBQSxRQUNaLHlCQUF5QixNQUFNLGdCQUFnQjtBQUFBLE1BQ2hEO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHlCQUF5Qix5QkFBNEM7QUFDNUUsU0FBSywyQkFBMkIsT0FBTztBQUN2QyxTQUFLLG9CQUFvQixNQUFNO0FBQy9CLFNBQUssaUJBQWlCLE1BQU07QUFFNUIsVUFBTSxxQkFBcUIsS0FBSyxlQUFlLG1CQUFtQixLQUFLLEtBQUs7QUFDNUUsVUFBTSxZQUFZLEtBQUssUUFBUSxrQkFBa0IsT0FBTyxjQUFZLENBQUMsQ0FBQyxTQUFTLEtBQUssS0FBSyxDQUFDO0FBRzFGLFFBQUksVUFBVSxXQUFXLEtBQUssQ0FBQyxvQkFBb0I7QUFDbEQ7QUFBQSxJQUNEO0FBRUEsU0FBSyw0QkFBNEIsSUFBSSxPQUFPLHlCQUF5QixJQUFJLEVBQUUsdUJBQXVCLENBQUM7QUFDbkcsU0FBSyxvQkFBb0IsUUFBUSxJQUFJLFVBQVUsS0FBSywyQkFBMkI7QUFBQSxNQUM5RSx3QkFBd0IsQ0FBQyxRQUFRLFlBQVk7QUFDNUMsWUFBSSxPQUFPLE9BQU8sc0JBQXNCLElBQUk7QUFDM0MsaUJBQU8sSUFBSTtBQUFBLFlBQ1Y7QUFBQSxZQUN3QixPQUFRO0FBQUEsWUFDaEMsS0FBSztBQUFBLFlBQ0w7QUFBQSxjQUNDLHdCQUF3QixDQUFDSCxTQUFRQyxhQUFZLEtBQUssdUJBQXVCRCxTQUFrQkMsUUFBTztBQUFBLGNBQ2xHLFlBQVksQ0FBQyxnQ0FBZ0MsR0FBRyxVQUFVLGlCQUFpQixRQUFRLFNBQVMsQ0FBQztBQUFBLGNBQzdGLHlCQUF5QixNQUFNLGdCQUFnQjtBQUFBLFlBQ2hEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFDQSxlQUFPLEtBQUssdUJBQXVCLFFBQWtCLE9BQU87QUFBQSxNQUM3RDtBQUFBLElBQ0QsQ0FBQztBQUVELGNBQVUsSUFBSSxjQUFZO0FBQ3pCLFlBQU0sU0FBUyxLQUFLLGlCQUFpQixJQUFJLElBQUksZUFBZSxZQUFZLFNBQVMsS0FBSyxJQUFJLEdBQUcsU0FBUyxLQUFLLElBQUksU0FBUyxlQUFlLFNBQVMsV0FBVyxzQkFBc0IsV0FBVyxJQUFLLFNBQVMsV0FBVyxvQkFBcUIsWUFBWTtBQUNyUCxZQUFJO0FBQ0gsZ0JBQU0sS0FBSyxlQUFlLGVBQWUsS0FBSyxPQUFPLEtBQUssVUFBVSxLQUFLLGVBQWUsS0FBSyxTQUFTLFFBQVE7QUFBQSxRQUMvRyxTQUFTLEdBQUc7QUFDWCxjQUFJO0FBRUosY0FBSSxTQUFTLFlBQVk7QUFDeEIsb0JBQVEsRUFBRSxVQUNQLElBQUksU0FBUyw4QkFBOEIsOENBQThDLEVBQUUsT0FBTyxJQUNsRyxJQUFJLFNBQVMscUNBQXFDLHNDQUFzQztBQUFBLFVBQzVGLE9BQU87QUFDTixvQkFBUSxFQUFFLFVBQ1AsSUFBSSxTQUFTLDJCQUEyQiw4Q0FBOEMsRUFBRSxPQUFPLElBQy9GLElBQUksU0FBUyxrQ0FBa0Msc0NBQXNDO0FBQUEsVUFDekY7QUFDQSxlQUFLLG9CQUFvQixNQUFNLEtBQUs7QUFBQSxRQUNyQztBQUFBLE1BQ0QsR0FBRyxTQUFTLFVBQVUsU0FBUyxVQUFVLFNBQVMsS0FBSyxDQUFDO0FBRXhELFdBQUssb0JBQW9CLE9BQU8sS0FBSyxRQUFRLEVBQUUsT0FBTyxNQUFNLE1BQU0sS0FBSyxDQUFDO0FBQUEsSUFDekUsQ0FBQztBQUVELFFBQUksb0JBQW9CO0FBQ3ZCLFlBQU0sdUJBQXVCLEtBQUsscUJBQXFCLEtBQUssUUFBUSxvQkFBb0IsQ0FBQyxDQUFDO0FBQzFGLFdBQUssb0JBQW9CLE9BQU8sS0FBSyxzQkFBc0IsRUFBRSxPQUFPLE9BQU8sTUFBTSxLQUFLLENBQUM7QUFBQSxJQUN4RjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQUksbUJBQTJCO0FBQzlCLFdBQVEsT0FBTyxLQUFLLFFBQVEsU0FBUyxXQUFZLEtBQUssUUFBUSxPQUFPLEtBQUssUUFBUSxLQUFLO0FBQUEsRUFDeEY7QUFBQSxFQUVBLE1BQWMsb0JBQW9CLGVBQTJDO0FBQzVFLFNBQUsscUJBQXFCLE1BQU07QUFDaEMsVUFBTSxZQUFZLElBQUksT0FBTyxlQUFlLElBQUksRUFBRSxnQkFBZ0IsQ0FBQztBQUNuRSxTQUFLLGlCQUFpQixLQUFLLHFCQUFxQixlQUFlLHFCQUFxQixXQUFXLG9CQUFvQixpQkFBaUIsS0FBSyxvQkFBb0IsR0FBRyxLQUFLLG9CQUFvQixLQUFLLFlBQVk7QUFDMU0sU0FBSyxxQkFBcUIsSUFBSSxLQUFLLGNBQWM7QUFFakQsVUFBTSxXQUFXLElBQUksS0FBSztBQUFBLE1BQ3pCLFFBQVEsUUFBUTtBQUFBLE1BQ2hCLE1BQU0saUJBQWlCLEtBQUssUUFBUSxnQkFBZ0IsSUFBSSxLQUFLLElBQUksQ0FBQztBQUFBLElBQ25FLENBQUM7QUFDRCxVQUFNLFdBQVcsTUFBTSxLQUFLLGlCQUFpQixxQkFBcUIsUUFBUTtBQUMxRSxTQUFLLHNCQUFzQjtBQUMzQixTQUFLLHFCQUFxQixJQUFJLEtBQUssbUJBQW1CO0FBRXRELFNBQUssZUFBZSxTQUFTLEtBQUssb0JBQW9CLE9BQU8sZUFBZTtBQUM1RSxTQUFLLGVBQWUsU0FBUyxLQUFLLGFBQWEsUUFBUSxLQUFLLGdCQUFnQjtBQUM1RSxRQUFJLEtBQUssYUFBYTtBQUNyQixXQUFLLGVBQWUsWUFBWSxLQUFLLFlBQVksTUFBTTtBQUFBLElBQ3hELE9BQU87QUFDTixZQUFNLFdBQVcsS0FBSyxvQkFBb0IsT0FBTyxnQkFBZ0IsYUFBYTtBQUM5RSxZQUFNLGFBQWEsS0FBSyxvQkFBb0IsT0FBTyxnQkFBZ0IsY0FBYyxRQUFRLElBQUk7QUFDN0YsV0FBSyxlQUFlLFlBQVksSUFBSSxTQUFTLFVBQVUsVUFBVSxDQUFDO0FBQUEsSUFDbkU7QUFDQSxTQUFLLGNBQWM7QUFDbkIsU0FBSyxlQUFlLE9BQU8sRUFBRSxPQUFPLFVBQVUsY0FBYyxJQUFJLFFBQVEsS0FBSyxjQUFjLENBQUM7QUFDNUYsU0FBSyxlQUFlLE1BQU07QUFFMUIsUUFBSSw2QkFBNkIsSUFBSSxVQUFVLGFBQWEsR0FBRyxNQUFNO0FBQ3BFLFdBQUssZUFBZ0IsT0FBTyxFQUFFLE9BQU8sVUFBVSxjQUFjLElBQUksUUFBUSxLQUFLLGNBQWMsQ0FBQztBQUM3RixXQUFLLGVBQWdCLE1BQU07QUFBQSxJQUM1QixDQUFDO0FBRUQsVUFBTSxnQkFBZ0IsS0FBSztBQUMzQixrQkFBYyxRQUFRO0FBQUEsTUFDckIsS0FBSyxLQUFLLGVBQWUsU0FBUyxFQUFHO0FBQUEsTUFDckMsT0FBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFNBQUssZUFBZSw4QkFBOEIsYUFBYTtBQUMvRCxTQUFLLGVBQWUsMEJBQTBCLEtBQUssT0FBTyxFQUFFLFFBQVEsZUFBZSxTQUFTLEtBQUssUUFBUSxDQUFDO0FBRTFHLFNBQUsscUJBQXFCLElBQUksS0FBSyxlQUFlLHVCQUF1QixNQUFNO0FBQzlFLG9CQUFjLFFBQVE7QUFBQSxRQUNyQixLQUFLLEtBQUssZUFBZ0IsU0FBUyxFQUFHO0FBQUEsUUFDdEMsT0FBTyxLQUFLO0FBQUEsTUFDYjtBQUNBLFdBQUssZUFBZSw4QkFBOEIsYUFBYTtBQUMvRCxXQUFLLGVBQWUsMEJBQTBCLEtBQUssT0FBTyxFQUFFLFFBQVEsZUFBZSxTQUFTLEtBQUssUUFBUSxDQUFDO0FBQUEsSUFDM0csQ0FBQyxDQUFDO0FBRUYsU0FBSyxxQkFBcUIsSUFBSSxLQUFLLGVBQWUsd0JBQXdCLE9BQUs7QUFDOUUsVUFBSSxjQUFjLFNBQVMsS0FBSyxrQkFBa0IsS0FBSyxlQUFlLFNBQVMsRUFBRyxRQUFRLGNBQWMsTUFBTSxLQUFLO0FBQ2xILGNBQU0sU0FBUyxLQUFLLGVBQWUsU0FBUztBQUM1QyxZQUFJLFdBQVcsY0FBYyxNQUFNLE9BQU87QUFDekMsZ0JBQU0sUUFBUSxjQUFjO0FBQzVCLGdCQUFNLFFBQVE7QUFDZCx3QkFBYyxRQUFRO0FBQ3RCLGVBQUssZUFBZSw4QkFBOEIsYUFBYTtBQUMvRCxlQUFLLGVBQWUsMEJBQTBCLEtBQUssT0FBTyxFQUFFLFFBQVEsZUFBZSxTQUFTLEtBQUssUUFBUSxDQUFDO0FBQUEsUUFDM0c7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLHNCQUFzQjtBQUUzQixTQUFLLHFCQUFxQixJQUFLLEtBQUssb0JBQW9CLE9BQU8sZ0JBQWdCLG1CQUFtQixNQUFNO0FBQ3ZHLFVBQUksS0FBSyxrQkFBa0IsS0FBSyxzQkFBc0IsR0FBRztBQUN4RCxhQUFLLGVBQWUsT0FBTyxFQUFFLFFBQVEsS0FBSyxlQUFlLE9BQU8sS0FBSyxlQUFlLGNBQWMsRUFBRSxNQUFNLENBQUM7QUFDM0csYUFBSyxlQUFlLE9BQU8sSUFBSTtBQUFBLE1BQ2hDO0FBQUEsSUFDRCxDQUFDLENBQUU7QUFBQSxFQUVKO0FBQUEsRUFFUSx3QkFBaUM7QUFDeEMsUUFBSSxLQUFLLGdCQUFnQjtBQUN4QixZQUFNLGtCQUFrQixzQkFBc0IsS0FBSyxjQUFjLEtBQUssZ0JBQWdCLEtBQUssYUFBYTtBQUN4RyxVQUFJLG9CQUFvQixLQUFLLGVBQWU7QUFDM0MsYUFBSyxnQkFBZ0I7QUFDckIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGlCQUF1RDtBQUN0RCxVQUFNLFFBQVEsS0FBSyxnQkFBZ0IsU0FBUztBQUM1QyxRQUFJLEtBQUssa0JBQWtCLFNBQVMsTUFBTSxlQUFlLElBQUksR0FBRztBQUMvRCxhQUFPLEVBQUUsTUFBTSxNQUFNLFNBQVMsR0FBRyxRQUFRLEtBQUssZUFBZSxZQUFZLEVBQUc7QUFBQSxJQUM3RTtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxzQkFBc0I7QUFDN0IsU0FBSyxZQUFZO0FBQ2pCLFFBQUksS0FBSyxhQUFhO0FBQ3JCLFdBQUssWUFBWSxVQUFVO0FBQUEsSUFDNUI7QUFDQSxTQUFLLE1BQU0sVUFBVSxPQUFPLFFBQVE7QUFDcEMsU0FBSyxxQkFBcUIsTUFBTTtBQUNoQyxTQUFLLGlCQUFpQjtBQUN0QixTQUFLLHNCQUF1QixPQUFPO0FBQUEsRUFDcEM7QUFBQSxFQUVBLE9BQU8sY0FBdUI7QUFDN0IsVUFBTSxjQUFjLGlCQUFpQixTQUFZLGVBQWUsS0FBa0MsS0FBSyxnQkFBZ0IsY0FBYyxFQUFFLFNBQVM7QUFDaEosU0FBSyxnQkFBZ0IsT0FBTyxFQUFFLE9BQU8sYUFBYSxRQUFRLEtBQUssY0FBYyxDQUFDO0FBQzlFLFVBQU0sY0FBYyxLQUFLLE1BQU07QUFDL0IsVUFBTSxRQUFRLElBQUksZ0JBQWdCLEtBQUssS0FBSztBQUM1QyxVQUFNLGVBQWUsS0FBSyxNQUFNO0FBQ2hDLFVBQU0sU0FBUyxJQUFJLGlCQUFpQixLQUFLLEtBQUssSUFBSTtBQUNsRCxTQUFLLG1CQUFtQixvQkFBb0IsRUFBRSxPQUFPLGFBQWEsUUFBUSxhQUFhLENBQUM7QUFBQSxFQUN6RjtBQUFBLEVBRUEsTUFBYSxtQkFBbUI7QUFDL0IsUUFBSSxLQUFLLFdBQVc7QUFDbkI7QUFBQSxJQUNEO0FBRUEsU0FBSyxZQUFZO0FBQ2pCLFNBQUssTUFBTSxVQUFVLElBQUksUUFBUTtBQUNqQyxTQUFLLHdCQUF3QixJQUFJLE9BQU8sS0FBSywwQkFBMEIsSUFBSSxFQUFFLGlCQUFpQixDQUFDO0FBQy9GLFVBQU0sS0FBSyxvQkFBb0IsS0FBSyxxQkFBcUI7QUFFekQsVUFBTSxjQUFjLElBQUksT0FBTyxLQUFLLHVCQUF1QixJQUFJLEVBQUUsZUFBZSxDQUFDO0FBQ2pGLFVBQU0sZUFBZSxJQUFJLE9BQU8sYUFBYSxJQUFJLEVBQUUsZ0JBQWdCLENBQUM7QUFDcEUsU0FBSywrQkFBK0IsWUFBWTtBQUNoRCxVQUFNLGdCQUFnQixJQUFJLE9BQU8sYUFBYSxJQUFJLEVBQUUsaUJBQWlCLENBQUM7QUFDdEUsU0FBSyxpQ0FBaUMsYUFBYTtBQUFBLEVBQ3BEO0FBQUEsRUFHUSwrQkFBK0IsV0FBd0I7QUFDOUQsVUFBTSxRQUFRLEtBQUssZUFBZSxnQkFBZ0IsS0FBSyxLQUFLO0FBQzVELFVBQU0sT0FBTyxNQUFNLGtCQUFrQixLQUFLLFNBQVMsS0FBSyxrQkFBa0I7QUFFMUUsU0FBSyxxQkFBcUIsSUFBSSxJQUFJO0FBQ2xDLFNBQUsscUJBQXFCLElBQUksS0FBSyxZQUFZLE1BQU07QUFDcEQsV0FBSyxxQkFBcUIsV0FBVyxJQUFJO0FBQUEsSUFDMUMsQ0FBQyxDQUFDO0FBRUYsU0FBSyxzQkFBc0IsSUFBSSxtQkFBbUIsS0FBSyxtQkFBbUIsS0FBSyxvQkFBb0IsS0FBSyxvQkFBb0IsV0FBVyxDQUFDLFdBQTBCO0FBQ2pLLFlBQU0sT0FBTyxLQUFLLGVBQWdCLFNBQVM7QUFFM0MsYUFBTyxJQUFJO0FBQUEsUUFDVixRQUFRLEtBQUs7QUFBQSxRQUNiLGlCQUFpQixLQUFLLFFBQVE7QUFBQSxRQUM5QjtBQUFBLFFBQ0EsTUFBTSxhQUFhO0FBQUEsTUFDcEIsQ0FBQztBQUVELFdBQUssb0JBQW9CO0FBQUEsSUFDMUIsQ0FBQztBQUVELFNBQUsscUJBQXFCLElBQUksS0FBSyxtQkFBbUI7QUFDdEQsU0FBSyxvQkFBb0IsV0FBVyxJQUFJO0FBQUEsRUFDekM7QUFBQSxFQUVRLGlDQUFpQyxXQUF3QjtBQUNoRSxVQUFNLFFBQVEsS0FBSyxlQUFlLGdCQUFnQixLQUFLLEtBQUs7QUFDNUQsVUFBTSxPQUFPLE1BQU0sd0JBQXdCLEtBQUssa0JBQWtCO0FBRWxFLFNBQUsscUJBQXFCLElBQUksSUFBSTtBQUNsQyxTQUFLLHFCQUFxQixJQUFJLEtBQUssWUFBWSxNQUFNO0FBQ3BELFdBQUssdUJBQXVCLFdBQVcsTUFBTSxJQUFJO0FBQUEsSUFDbEQsQ0FBQyxDQUFDO0FBRUYsU0FBSyx3QkFBd0IsSUFBSSxtQkFBbUIsS0FBSyxtQkFBbUIsS0FBSyxvQkFBb0IsS0FBSyxvQkFBb0IsV0FBVyxDQUFDLFdBQTBCO0FBQ25LLFlBQU0sT0FBTyxLQUFLLGVBQWdCLFNBQVM7QUFFM0MsYUFBTyxJQUFJO0FBQUEsUUFDVixRQUFRLEtBQUs7QUFBQSxRQUNiLGlCQUFpQixLQUFLLFFBQVE7QUFBQSxRQUM5QjtBQUFBLFFBQ0EsTUFBTSxhQUFhO0FBQUEsTUFDcEIsQ0FBQztBQUVELFdBQUssZ0JBQWdCLE1BQU07QUFBQSxJQUM1QixDQUFDO0FBRUQsU0FBSyxxQkFBcUIsSUFBSSxLQUFLLHFCQUFxQjtBQUN4RCxTQUFLLHNCQUFzQixXQUFXLE1BQU0sSUFBSTtBQUFBLEVBQ2pEO0FBQUEsRUFFQSxTQUFTLFNBQWtCLFVBQW1CLE9BQU87QUFDcEQsUUFBSSxTQUFTO0FBQ1osV0FBSyxTQUFTLE1BQU07QUFDcEIsV0FBSyx5QkFBeUIsVUFBVSxJQUFJLFlBQVk7QUFDeEQsV0FBSyxTQUFTLFdBQVc7QUFDekIsVUFBSSxLQUFLLFFBQVEsU0FBUyxVQUFVLFlBQVksU0FBUztBQUN4RCxhQUFLLGdCQUFnQixNQUFNO0FBQUEsTUFDNUI7QUFBQSxJQUNELE9BQU87QUFDTixVQUFJLEtBQUsseUJBQXlCLFVBQVUsU0FBUyxZQUFZLEtBQUssQ0FBQyxLQUFLLHlCQUF5QixVQUFVLFNBQVMsV0FBVyxHQUFHO0FBQ3JJLGFBQUssU0FBUyxXQUFXO0FBQUEsTUFDMUI7QUFDQSxXQUFLLHlCQUF5QixVQUFVLE9BQU8sWUFBWTtBQUFBLElBQzVEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxPQUFPLFlBQStCO0FBRTNDLFFBQUksV0FBVyxTQUFTLEtBQUssUUFBUSxNQUFNO0FBQzFDLFdBQUssa0JBQWtCLFdBQVcsSUFBSTtBQUFBLElBQ3ZDO0FBRUEsUUFBSSxLQUFLLFFBQVEsZ0JBQWdCLFdBQVcsZ0JBQWlCLElBQUksS0FBSyxLQUFLLFFBQVEsWUFBWSxFQUFFLFNBQVMsTUFBTSxJQUFJLEtBQUssV0FBVyxZQUFZLEVBQUUsU0FBUyxHQUFJO0FBQzlKLFdBQUssc0JBQXNCLFdBQVcsWUFBWTtBQUFBLElBQ25EO0FBRUEsVUFBTSxpQkFBMEIsV0FBVyxTQUFTLFVBQWEsV0FBVyxTQUFTLEtBQUssUUFBUTtBQUVsRyxTQUFLLFVBQVU7QUFFZixRQUFJLGdCQUFnQjtBQUNuQixVQUFJLFdBQVcsU0FBUyxVQUFVLFlBQVksU0FBUztBQUN0RCxjQUFNLEtBQUssaUJBQWlCO0FBQUEsTUFDN0IsT0FBTztBQUNOLGFBQUssb0JBQW9CO0FBQUEsTUFDMUI7QUFBQSxJQUNEO0FBRUEsUUFBSSxXQUFXLE9BQU87QUFDckIsV0FBSyxnQkFBZ0IsWUFBWSxXQUFXO0FBQUEsSUFDN0MsT0FBTztBQUNOLFdBQUssZ0JBQWdCLFlBQVk7QUFBQSxJQUNsQztBQUdBLFNBQUsseUJBQXlCLEtBQUssd0JBQXdCO0FBRTNELFFBQUksS0FBSyxRQUFRLGNBQWM7QUFDOUIsV0FBSyxxQkFBcUIsSUFBSSxLQUFLLFFBQVEsWUFBWTtBQUFBLElBQ3hELE9BQU87QUFDTixXQUFLLHFCQUFxQixNQUFNO0FBQUEsSUFDakM7QUFFQSxRQUFJLEtBQUssUUFBUSxXQUFXO0FBQzNCLFdBQUssZ0JBQWdCLEtBQUssUUFBUSxTQUFTO0FBQUEsSUFDNUM7QUFBQSxFQUNEO0FBQUEsRUFFUSxjQUFjLEdBQWU7QUFDcEMsVUFBTSxRQUFRLElBQUksbUJBQW1CLElBQUksVUFBVSxLQUFLLFFBQVEsR0FBRyxDQUFDO0FBQ3BFLFNBQUssbUJBQW1CLGdCQUFnQjtBQUFBLE1BQ3ZDLFdBQVcsTUFBTTtBQUFBLE1BQ2pCLFFBQVEsT0FBTztBQUFBLE1BQ2YsbUJBQW1CLEVBQUUsbUJBQW1CLEtBQUs7QUFBQSxNQUM3QyxtQkFBbUIsS0FBSztBQUFBLE1BQ3hCLGNBQWMsS0FBSztBQUFBLE1BQ25CLG1CQUFtQixNQUFNO0FBQ3hCLGVBQU8sS0FBSztBQUFBLE1BQ2I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxRQUFRO0FBQ1AsU0FBSyxRQUFRLE1BQU07QUFDbkIsU0FBSyxRQUFRLFVBQVUsSUFBSSxPQUFPO0FBQ2xDLFNBQUssaUJBQWlCLFlBQVksTUFBTSxLQUFLLFFBQVEsVUFBVSxPQUFPLE9BQU8sR0FBRyxHQUFJO0FBQUEsRUFDckY7QUFDRDtBQW5xQmEsY0FBTjtBQUFBLEVBbURKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0E1RFU7QUFxcUJiLFNBQVMsY0FBYyxRQUErRCxRQUFrRSx1QkFBZ0MsaUJBQTZDLFdBQVMsVUFBVSxjQUFvQjtBQUMzUSxhQUFXLFNBQVMsUUFBUTtBQUMzQixRQUFJLENBQUMsT0FBTyxPQUFPLElBQUk7QUFDdkIsUUFBSSx1QkFBdUI7QUFDMUIsZ0JBQVUsUUFBUSxJQUFJLE9BQU0sYUFBYSxrQkFBbUIsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQztBQUFBLElBQ2hGO0FBRUEsUUFBSSxlQUFlLEtBQUssR0FBRztBQUMxQixZQUFNLEtBQUssTUFBTSxRQUFRLE1BQU0sSUFBSSxTQUFTLE9BQU87QUFFbkQsU0FBRyxRQUFRLEdBQUcsT0FBTztBQUFBLElBQ3RCLE9BQU87QUFDTixZQUFNLEtBQUssTUFBTSxRQUFRLE1BQU0sSUFBSSxTQUFTLE9BQU87QUFFbkQsVUFBSSxHQUFHLFNBQVMsR0FBRztBQUNsQixXQUFHLEtBQUssSUFBSSxVQUFVLENBQUM7QUFBQSxNQUN4QjtBQUVBLFNBQUcsS0FBSyxHQUFHLE9BQU87QUFBQSxJQUNuQjtBQUFBLEVBQ0Q7QUFDRDsiLAogICJuYW1lcyI6IFsiYWN0aW9uIiwgIm9wdGlvbnMiLCAicHJpbWFyeSIsICJzZWNvbmRhcnkiXQp9Cg==
