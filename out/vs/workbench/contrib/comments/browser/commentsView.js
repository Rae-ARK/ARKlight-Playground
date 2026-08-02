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
import "./media/panel.css";
import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import { basename } from "../../../../base/common/resources.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { CommentNode, ResourceWithCommentThreads } from "../common/commentModel.js";
import { ICommentService } from "./commentService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ResourceLabels } from "../../../browser/labels.js";
import { CommentsList, COMMENTS_VIEW_TITLE, Filter } from "./commentsTreeViewer.js";
import { FilterViewPane } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { CommentsViewFilterFocusContextKey } from "./comments.js";
import { CommentsFilters, CommentsSortOrder } from "./commentsViewActions.js";
import { Memento } from "../../../common/memento.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { FilterOptions } from "./commentsFilterOptions.js";
import { CommentThreadApplicability, CommentThreadState } from "../../../../editor/common/languages.js";
import { revealCommentThread } from "./commentsController.js";
import { registerNavigableContainer } from "../../../browser/actions/widgetNavigationCommands.js";
import { CommentsModel, threadHasMeaningfulComments } from "./commentsModel.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibleViewAction } from "../../accessibility/browser/accessibleViewActions.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
const CONTEXT_KEY_HAS_COMMENTS = new RawContextKey("commentsView.hasComments", false);
const CONTEXT_KEY_SOME_COMMENTS_EXPANDED = new RawContextKey("commentsView.someCommentsExpanded", false);
const CONTEXT_KEY_COMMENT_FOCUSED = new RawContextKey("commentsView.commentFocused", false);
const VIEW_STORAGE_ID = "commentsViewState";
function createResourceCommentsIterator(model) {
  const result = [];
  for (const m of model.resourceCommentThreads) {
    const children = [];
    for (const r of m.commentThreads) {
      if (threadHasMeaningfulComments(r.thread)) {
        children.push({ element: r });
      }
    }
    if (children.length > 0) {
      result.push({ element: m, children });
    }
  }
  return result;
}
let CommentsPanel = class extends FilterViewPane {
  constructor(options, instantiationService, viewDescriptorService, editorService, configurationService, contextKeyService, contextMenuService, keybindingService, openerService, themeService, commentService, hoverService, uriIdentityService, storageService, pathService) {
    const stateMemento = new Memento(VIEW_STORAGE_ID, storageService);
    const viewState = stateMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    super({
      ...options,
      filterOptions: {
        placeholder: nls.localize("comments.filter.placeholder", "Filter (e.g. text, author)"),
        ariaLabel: nls.localize("comments.filter.ariaLabel", "Filter comments"),
        history: viewState.filterHistory || [],
        text: viewState.filter || "",
        focusContextKey: CommentsViewFilterFocusContextKey.key
      }
    }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.editorService = editorService;
    this.commentService = commentService;
    this.uriIdentityService = uriIdentityService;
    this.pathService = pathService;
    this.totalComments = 0;
    this.currentHeight = 0;
    this.currentWidth = 0;
    this.cachedFilterStats = void 0;
    this.onDidChangeVisibility = this.onDidChangeBodyVisibility;
    this.hasCommentsContextKey = CONTEXT_KEY_HAS_COMMENTS.bindTo(contextKeyService);
    this.someCommentsExpandedContextKey = CONTEXT_KEY_SOME_COMMENTS_EXPANDED.bindTo(contextKeyService);
    this.commentsFocusedContextKey = CONTEXT_KEY_COMMENT_FOCUSED.bindTo(contextKeyService);
    this.stateMemento = stateMemento;
    this.viewState = viewState;
    this.filters = this._register(new CommentsFilters({
      showResolved: this.viewState.showResolved !== false,
      showUnresolved: this.viewState.showUnresolved !== false,
      sortBy: this.viewState.sortBy ?? CommentsSortOrder.ResourceAscending
    }, this.contextKeyService));
    this.filter = new Filter(new FilterOptions(this.filterWidget.getFilterText(), this.filters.showResolved, this.filters.showUnresolved));
    this._register(this.filters.onDidChange((event) => {
      if (event.showResolved || event.showUnresolved) {
        this.updateFilter();
      }
      if (event.sortBy) {
        this.refresh();
      }
    }));
    this._register(this.filterWidget.onDidChangeFilterText(() => this.updateFilter()));
  }
  get focusedCommentNode() {
    const focused = this.tree?.getFocus();
    if (focused?.length === 1 && focused[0] instanceof CommentNode) {
      return focused[0];
    }
    return void 0;
  }
  get focusedCommentInfo() {
    if (!this.focusedCommentNode) {
      return;
    }
    return this.getScreenReaderInfoForNode(this.focusedCommentNode);
  }
  focusNextNode() {
    if (!this.tree) {
      return;
    }
    const focused = this.tree.getFocus()?.[0];
    if (!focused) {
      return;
    }
    let next = this.tree.navigate(focused).next();
    while (next && !(next instanceof CommentNode)) {
      next = this.tree.navigate(next).next();
    }
    if (!next) {
      return;
    }
    this.tree.setFocus([next]);
  }
  focusPreviousNode() {
    if (!this.tree) {
      return;
    }
    const focused = this.tree.getFocus()?.[0];
    if (!focused) {
      return;
    }
    let previous = this.tree.navigate(focused).previous();
    while (previous && !(previous instanceof CommentNode)) {
      previous = this.tree.navigate(previous).previous();
    }
    if (!previous) {
      return;
    }
    this.tree.setFocus([previous]);
  }
  saveState() {
    this.viewState.filter = this.filterWidget.getFilterText();
    this.viewState.filterHistory = this.filterWidget.getHistory();
    this.viewState.showResolved = this.filters.showResolved;
    this.viewState.showUnresolved = this.filters.showUnresolved;
    this.viewState.sortBy = this.filters.sortBy;
    this.stateMemento.saveMemento();
    super.saveState();
  }
  render() {
    super.render();
    this._register(registerNavigableContainer({
      name: "commentsView",
      focusNotifiers: [this, this.filterWidget],
      focusNextWidget: () => {
        if (this.filterWidget.hasFocus()) {
          this.focus();
        }
      },
      focusPreviousWidget: () => {
        if (!this.filterWidget.hasFocus()) {
          this.focusFilter();
        }
      }
    }));
  }
  focusFilter() {
    this.filterWidget.focus();
  }
  clearFilterText() {
    this.filterWidget.setFilterText("");
  }
  getFilterStats() {
    if (!this.cachedFilterStats) {
      this.cachedFilterStats = {
        total: this.totalComments,
        filtered: this.tree?.getVisibleItemCount() ?? 0
      };
    }
    return this.cachedFilterStats;
  }
  updateFilter() {
    this.filter.options = new FilterOptions(this.filterWidget.getFilterText(), this.filters.showResolved, this.filters.showUnresolved);
    this.tree?.filterComments();
    this.cachedFilterStats = void 0;
    const { total, filtered } = this.getFilterStats();
    this.filterWidget.updateBadge(total === filtered || total === 0 ? void 0 : nls.localize("showing filtered results", "Showing {0} of {1}", filtered, total));
    this.filterWidget.checkMoreFilters(!this.filters.showResolved || !this.filters.showUnresolved);
  }
  renderBody(container) {
    super.renderBody(container);
    container.classList.add("comments-panel");
    const domContainer = dom.append(container, dom.$(".comments-panel-container"));
    this.treeContainer = dom.append(domContainer, dom.$(".tree-container"));
    this.treeContainer.classList.add("file-icon-themable-tree", "show-file-icons");
    this.cachedFilterStats = void 0;
    this.createTree();
    this.createMessageBox(domContainer);
    this._register(this.commentService.onDidSetAllCommentThreads(this.onAllCommentsChanged, this));
    this._register(this.commentService.onDidUpdateCommentThreads(this.onCommentsUpdated, this));
    this._register(this.commentService.onDidDeleteDataProvider(this.onDataProviderDeleted, this));
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible) {
        this.refresh();
      }
    }));
    this.renderComments();
  }
  focus() {
    super.focus();
    const element = this.tree?.getHTMLElement();
    if (element && dom.isActiveElement(element)) {
      return;
    }
    if (!this.commentService.commentsModel.hasCommentThreads() && this.messageBoxContainer) {
      this.messageBoxContainer.focus();
    } else if (this.tree) {
      this.tree.domFocus();
    }
  }
  renderComments() {
    this.treeContainer.classList.toggle("hidden", !this.commentService.commentsModel.hasCommentThreads());
    this.renderMessage();
    this.tree?.setChildren(null, createResourceCommentsIterator(this.commentService.commentsModel));
  }
  collapseAll() {
    if (this.tree) {
      this.tree.collapseAll();
      this.tree.setSelection([]);
      this.tree.setFocus([]);
      this.tree.domFocus();
      this.tree.focusFirst();
    }
  }
  expandAll() {
    if (this.tree) {
      this.tree.expandAll();
      this.tree.setSelection([]);
      this.tree.setFocus([]);
      this.tree.domFocus();
      this.tree.focusFirst();
    }
  }
  get hasRendered() {
    return !!this.tree;
  }
  layoutBodyContent(height = this.currentHeight, width = this.currentWidth) {
    if (this.messageBoxContainer) {
      this.messageBoxContainer.style.height = `${height}px`;
    }
    this.tree?.layout(height, width);
    this.currentHeight = height;
    this.currentWidth = width;
  }
  createMessageBox(parent) {
    this.messageBoxContainer = dom.append(parent, dom.$(".message-box-container"));
    this.messageBoxContainer.setAttribute("tabIndex", "0");
  }
  renderMessage() {
    this.messageBoxContainer.textContent = this.commentService.commentsModel.getMessage();
    this.messageBoxContainer.classList.toggle("hidden", this.commentService.commentsModel.hasCommentThreads());
  }
  makeCommentLocationLabel(file, range) {
    const fileLabel = basename(file);
    if (!range) {
      return nls.localize("fileCommentLabel", "in {0}", fileLabel);
    }
    if (range.startLineNumber === range.endLineNumber) {
      return nls.localize("oneLineCommentLabel", "at line {0} column {1} in {2}", range.startLineNumber, range.startColumn, fileLabel);
    } else {
      return nls.localize("multiLineCommentLabel", "from line {0} to line {1} in {2}", range.startLineNumber, range.endLineNumber, fileLabel);
    }
  }
  makeScreenReaderLabelInfo(element, forAriaLabel) {
    const userName = element.comment.userName;
    const locationLabel = this.makeCommentLocationLabel(element.resource, element.range);
    const replyCountLabel = this.getReplyCountAsString(element, forAriaLabel);
    const bodyLabel = typeof element.comment.body === "string" ? element.comment.body : element.comment.body.value;
    return { userName, locationLabel, replyCountLabel, bodyLabel };
  }
  getScreenReaderInfoForNode(element, forAriaLabel) {
    let accessibleViewHint = "";
    if (forAriaLabel && this.configurationService.getValue(AccessibilityVerbositySettingId.Comments)) {
      const kbLabel = this.keybindingService.lookupKeybinding(AccessibleViewAction.id)?.getAriaLabel();
      accessibleViewHint = kbLabel ? nls.localize("accessibleViewHint", "\nInspect this in the accessible view ({0}).", kbLabel) : nls.localize("acessibleViewHintNoKbOpen", "\nInspect this in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding.");
    }
    const replies = this.getRepliesAsString(element, forAriaLabel);
    const editor = this.editorService.findEditors(element.resource);
    const codeEditor = this.editorService.activeEditorPane?.getControl();
    let relevantLines;
    if (element.range && editor?.length && isCodeEditor(codeEditor)) {
      relevantLines = codeEditor.getModel()?.getValueInRange(element.range);
      if (relevantLines) {
        relevantLines = "\nCorresponding code: \n" + relevantLines;
      }
    }
    if (!relevantLines) {
      relevantLines = "";
    }
    const labelInfo = this.makeScreenReaderLabelInfo(element, forAriaLabel);
    if (element.threadRelevance === CommentThreadApplicability.Outdated) {
      return nls.localize(
        "resourceWithCommentLabelOutdated",
        "Outdated from {0}: {1}\n{2}\n{3}\n{4}",
        labelInfo.userName,
        labelInfo.bodyLabel,
        labelInfo.locationLabel,
        labelInfo.replyCountLabel,
        relevantLines
      ) + replies + accessibleViewHint;
    } else {
      return nls.localize(
        "resourceWithCommentLabel",
        "{0}: {1}\n{2}\n{3}\n{4}",
        labelInfo.userName,
        labelInfo.bodyLabel,
        labelInfo.locationLabel,
        labelInfo.replyCountLabel,
        relevantLines
      ) + replies + accessibleViewHint;
    }
  }
  getRepliesAsString(node, forAriaLabel) {
    if (!node.replies.length || forAriaLabel) {
      return "";
    }
    return "\n" + node.replies.map(
      (reply) => nls.localize(
        "resourceWithRepliesLabel",
        "{0} {1}",
        reply.comment.userName,
        typeof reply.comment.body === "string" ? reply.comment.body : reply.comment.body.value
      )
    ).join("\n");
  }
  getReplyCountAsString(node, forAriaLabel) {
    return node.replies.length && !forAriaLabel ? nls.localize("replyCount", " {0} replies,", node.replies.length) : "";
  }
  createTree() {
    this.treeLabels = this._register(this.instantiationService.createInstance(ResourceLabels, this));
    this.tree = this._register(this.instantiationService.createInstance(CommentsList, this.treeLabels, this.treeContainer, {
      overrideStyles: this.getLocationBasedColors().listOverrideStyles,
      selectionNavigation: true,
      filter: this.filter,
      sorter: {
        compare: (a, b) => {
          if (a instanceof CommentsModel || b instanceof CommentsModel) {
            return 0;
          }
          if (this.filters.sortBy === CommentsSortOrder.UpdatedAtDescending) {
            return a.lastUpdatedAt > b.lastUpdatedAt ? -1 : 1;
          } else if (this.filters.sortBy === CommentsSortOrder.ResourceAscending) {
            if (a instanceof ResourceWithCommentThreads && b instanceof ResourceWithCommentThreads) {
              const workspaceScheme = this.pathService.defaultUriScheme;
              if (a.resource.scheme !== b.resource.scheme && (a.resource.scheme === workspaceScheme || b.resource.scheme === workspaceScheme)) {
                return b.resource.scheme === workspaceScheme ? 1 : -1;
              }
              return a.resource.toString() > b.resource.toString() ? 1 : -1;
            } else if (a instanceof CommentNode && b instanceof CommentNode && a.thread.range && b.thread.range) {
              return a.thread.range?.startLineNumber > b.thread.range?.startLineNumber ? 1 : -1;
            }
          }
          return 0;
        }
      },
      keyboardNavigationLabelProvider: {
        getKeyboardNavigationLabel: (item) => {
          return void 0;
        }
      },
      accessibilityProvider: {
        getAriaLabel: (element) => {
          if (element instanceof CommentsModel) {
            return nls.localize("rootCommentsLabel", "Comments for current workspace");
          }
          if (element instanceof ResourceWithCommentThreads) {
            return nls.localize("resourceWithCommentThreadsLabel", "Comments in {0}, full path {1}", basename(element.resource), element.resource.fsPath);
          }
          if (element instanceof CommentNode) {
            return this.getScreenReaderInfoForNode(element, true);
          }
          return "";
        },
        getWidgetAriaLabel() {
          return COMMENTS_VIEW_TITLE.value;
        }
      }
    }));
    this._register(this.tree.onDidOpen((e) => {
      this.openFile(e.element, e.editorOptions.pinned, e.editorOptions.preserveFocus, e.sideBySide);
    }));
    this._register(this.tree.onDidChangeModel(() => {
      this.updateSomeCommentsExpanded();
    }));
    this._register(this.tree.onDidChangeCollapseState(() => {
      this.updateSomeCommentsExpanded();
    }));
    this._register(this.tree.onDidFocus(() => this.commentsFocusedContextKey.set(true)));
    this._register(this.tree.onDidBlur(() => this.commentsFocusedContextKey.set(false)));
  }
  openFile(element, pinned, preserveFocus, sideBySide) {
    if (!element) {
      return;
    }
    if (!(element instanceof ResourceWithCommentThreads || element instanceof CommentNode)) {
      return;
    }
    const threadToReveal = element instanceof ResourceWithCommentThreads ? element.commentThreads[0].thread : element.thread;
    const commentToReveal = element instanceof ResourceWithCommentThreads ? element.commentThreads[0].comment : void 0;
    return revealCommentThread(this.commentService, this.editorService, this.uriIdentityService, threadToReveal, commentToReveal, false, pinned, preserveFocus, sideBySide);
  }
  async refresh() {
    if (!this.tree) {
      return;
    }
    if (this.isVisible()) {
      this.hasCommentsContextKey.set(this.commentService.commentsModel.hasCommentThreads());
      this.cachedFilterStats = void 0;
      this.renderComments();
      if (this.tree.getSelection().length === 0 && this.commentService.commentsModel.hasCommentThreads()) {
        const firstComment = this.commentService.commentsModel.resourceCommentThreads[0].commentThreads[0];
        if (firstComment && this.tree.hasElement(firstComment)) {
          this.tree.setFocus([firstComment]);
          this.tree.setSelection([firstComment]);
        }
      }
    }
  }
  onAllCommentsChanged(e) {
    this.cachedFilterStats = void 0;
    this.totalComments += e.commentThreads.length;
    let unresolved = 0;
    for (const thread of e.commentThreads) {
      if (thread.state === CommentThreadState.Unresolved) {
        unresolved++;
      }
    }
    this.refresh();
  }
  onCommentsUpdated(e) {
    this.cachedFilterStats = void 0;
    this.totalComments += e.added.length;
    this.totalComments -= e.removed.length;
    let unresolved = 0;
    for (const resource of this.commentService.commentsModel.resourceCommentThreads) {
      for (const thread of resource.commentThreads) {
        if (thread.threadState === CommentThreadState.Unresolved) {
          unresolved++;
        }
      }
    }
    this.refresh();
  }
  onDataProviderDeleted(owner) {
    this.cachedFilterStats = void 0;
    this.totalComments = 0;
    this.refresh();
  }
  updateSomeCommentsExpanded() {
    this.someCommentsExpandedContextKey.set(this.isSomeCommentsExpanded());
  }
  areAllCommentsExpanded() {
    if (!this.tree) {
      return false;
    }
    const navigator = this.tree.navigate();
    while (navigator.next()) {
      if (this.tree.isCollapsed(navigator.current())) {
        return false;
      }
    }
    return true;
  }
  isSomeCommentsExpanded() {
    if (!this.tree) {
      return false;
    }
    const navigator = this.tree.navigate();
    while (navigator.next()) {
      if (!this.tree.isCollapsed(navigator.current())) {
        return true;
      }
    }
    return false;
  }
};
CommentsPanel = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IViewDescriptorService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IThemeService),
  __decorateParam(10, ICommentService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, IUriIdentityService),
  __decorateParam(13, IStorageService),
  __decorateParam(14, IPathService)
], CommentsPanel);
export {
  CONTEXT_KEY_COMMENT_FOCUSED,
  CONTEXT_KEY_HAS_COMMENTS,
  CONTEXT_KEY_SOME_COMMENTS_EXPANDED,
  CommentsPanel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudHNWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3BhbmVsLmNzcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tbWVudE5vZGUsIElDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50LCBSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcyB9IGZyb20gJy4uL2NvbW1vbi9jb21tZW50TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNvbW1lbnRTZXJ2aWNlLCBJV29ya3NwYWNlQ29tbWVudFRocmVhZHNFdmVudCB9IGZyb20gJy4vY29tbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBDb21tZW50c0xpc3QsIENPTU1FTlRTX1ZJRVdfVElUTEUsIEZpbHRlciB9IGZyb20gJy4vY29tbWVudHNUcmVlVmlld2VyLmpzJztcbmltcG9ydCB7IElWaWV3UGFuZU9wdGlvbnMsIEZpbHRlclZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgQ29tbWVudHNWaWV3RmlsdGVyRm9jdXNDb250ZXh0S2V5LCBJQ29tbWVudHNWaWV3IH0gZnJvbSAnLi9jb21tZW50cy5qcyc7XG5pbXBvcnQgeyBDb21tZW50c0ZpbHRlcnMsIENvbW1lbnRzRmlsdGVyc0NoYW5nZUV2ZW50LCBDb21tZW50c1NvcnRPcmRlciB9IGZyb20gJy4vY29tbWVudHNWaWV3QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBNZW1lbnRvIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21lbWVudG8uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IEZpbHRlck9wdGlvbnMgfSBmcm9tICcuL2NvbW1lbnRzRmlsdGVyT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tZW50VGhyZWFkQXBwbGljYWJpbGl0eSwgQ29tbWVudFRocmVhZFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgcmV2ZWFsQ29tbWVudFRocmVhZCB9IGZyb20gJy4vY29tbWVudHNDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyTmF2aWdhYmxlQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL3dpZGdldE5hdmlnYXRpb25Db21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb21tZW50c01vZGVsLCB0aHJlYWRIYXNNZWFuaW5nZnVsQ29tbWVudHMsIHR5cGUgSUNvbW1lbnRzTW9kZWwgfSBmcm9tICcuL2NvbW1lbnRzTW9kZWwuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmxlVmlld0FjdGlvbiB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlld0FjdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJVHJlZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBDT05URVhUX0tFWV9IQVNfQ09NTUVOVFMgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY29tbWVudHNWaWV3Lmhhc0NvbW1lbnRzJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IENPTlRFWFRfS0VZX1NPTUVfQ09NTUVOVFNfRVhQQU5ERUQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY29tbWVudHNWaWV3LnNvbWVDb21tZW50c0V4cGFuZGVkJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IENPTlRFWFRfS0VZX0NPTU1FTlRfRk9DVVNFRCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjb21tZW50c1ZpZXcuY29tbWVudEZvY3VzZWQnLCBmYWxzZSk7XG5jb25zdCBWSUVXX1NUT1JBR0VfSUQgPSAnY29tbWVudHNWaWV3U3RhdGUnO1xuXG5pbnRlcmZhY2UgQ29tbWVudHNWaWV3U3RhdGUge1xuXHRmaWx0ZXI/OiBzdHJpbmc7XG5cdGZpbHRlckhpc3Rvcnk/OiBzdHJpbmdbXTtcblx0c2hvd1Jlc29sdmVkPzogYm9vbGVhbjtcblx0c2hvd1VucmVzb2x2ZWQ/OiBib29sZWFuO1xuXHRzb3J0Qnk/OiBDb21tZW50c1NvcnRPcmRlcjtcbn1cblxudHlwZSBDb21tZW50c1RyZWVOb2RlID0gQ29tbWVudHNNb2RlbCB8IFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzIHwgQ29tbWVudE5vZGU7XG5cbmZ1bmN0aW9uIGNyZWF0ZVJlc291cmNlQ29tbWVudHNJdGVyYXRvcihtb2RlbDogSUNvbW1lbnRzTW9kZWwpOiBJdGVyYWJsZTxJVHJlZUVsZW1lbnQ8Q29tbWVudHNUcmVlTm9kZT4+IHtcblx0Y29uc3QgcmVzdWx0OiBJVHJlZUVsZW1lbnQ8Q29tbWVudHNUcmVlTm9kZT5bXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgbSBvZiBtb2RlbC5yZXNvdXJjZUNvbW1lbnRUaHJlYWRzKSB7XG5cdFx0Y29uc3QgY2hpbGRyZW4gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHIgb2YgbS5jb21tZW50VGhyZWFkcykge1xuXHRcdFx0aWYgKHRocmVhZEhhc01lYW5pbmdmdWxDb21tZW50cyhyLnRocmVhZCkpIHtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaCh7IGVsZW1lbnQ6IHIgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7IGVsZW1lbnQ6IG0sIGNoaWxkcmVuIH0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgY2xhc3MgQ29tbWVudHNQYW5lbCBleHRlbmRzIEZpbHRlclZpZXdQYW5lIGltcGxlbWVudHMgSUNvbW1lbnRzVmlldyB7XG5cdHByaXZhdGUgdHJlZUxhYmVscyE6IFJlc291cmNlTGFiZWxzO1xuXHRwcml2YXRlIHRyZWU6IENvbW1lbnRzTGlzdCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0cmVlQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgbWVzc2FnZUJveENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRvdGFsQ29tbWVudHM6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzQ29tbWVudHNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzb21lQ29tbWVudHNFeHBhbmRlZENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbW1lbnRzRm9jdXNlZENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGZpbHRlcjogRmlsdGVyO1xuXHRyZWFkb25seSBmaWx0ZXJzOiBDb21tZW50c0ZpbHRlcnM7XG5cblx0cHJpdmF0ZSBjdXJyZW50SGVpZ2h0ID0gMDtcblx0cHJpdmF0ZSBjdXJyZW50V2lkdGggPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IHZpZXdTdGF0ZTogQ29tbWVudHNWaWV3U3RhdGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgc3RhdGVNZW1lbnRvOiBNZW1lbnRvPENvbW1lbnRzVmlld1N0YXRlPjtcblx0cHJpdmF0ZSBjYWNoZWRGaWx0ZXJTdGF0czogeyB0b3RhbDogbnVtYmVyOyBmaWx0ZXJlZDogbnVtYmVyIH0gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5O1xuXG5cdGdldCBmb2N1c2VkQ29tbWVudE5vZGUoKTogQ29tbWVudE5vZGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLnRyZWU/LmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzZWQ/Lmxlbmd0aCA9PT0gMSAmJiBmb2N1c2VkWzBdIGluc3RhbmNlb2YgQ29tbWVudE5vZGUpIHtcblx0XHRcdHJldHVybiBmb2N1c2VkWzBdO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IGZvY3VzZWRDb21tZW50SW5mbygpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5mb2N1c2VkQ29tbWVudE5vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U2NyZWVuUmVhZGVySW5mb0Zvck5vZGUodGhpcy5mb2N1c2VkQ29tbWVudE5vZGUpO1xuXHR9XG5cblx0Zm9jdXNOZXh0Tm9kZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudHJlZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy50cmVlLmdldEZvY3VzKCk/LlswXTtcblx0XHRpZiAoIWZvY3VzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IG5leHQgPSB0aGlzLnRyZWUubmF2aWdhdGUoZm9jdXNlZCkubmV4dCgpO1xuXHRcdHdoaWxlIChuZXh0ICYmICEobmV4dCBpbnN0YW5jZW9mIENvbW1lbnROb2RlKSkge1xuXHRcdFx0bmV4dCA9IHRoaXMudHJlZS5uYXZpZ2F0ZShuZXh0KS5uZXh0KCk7XG5cdFx0fVxuXHRcdGlmICghbmV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW25leHRdKTtcblx0fVxuXG5cdGZvY3VzUHJldmlvdXNOb2RlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy50cmVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLnRyZWUuZ2V0Rm9jdXMoKT8uWzBdO1xuXHRcdGlmICghZm9jdXNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgcHJldmlvdXMgPSB0aGlzLnRyZWUubmF2aWdhdGUoZm9jdXNlZCkucHJldmlvdXMoKTtcblx0XHR3aGlsZSAocHJldmlvdXMgJiYgIShwcmV2aW91cyBpbnN0YW5jZW9mIENvbW1lbnROb2RlKSkge1xuXHRcdFx0cHJldmlvdXMgPSB0aGlzLnRyZWUubmF2aWdhdGUocHJldmlvdXMpLnByZXZpb3VzKCk7XG5cdFx0fVxuXHRcdGlmICghcHJldmlvdXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy50cmVlLnNldEZvY3VzKFtwcmV2aW91c10pO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdQYW5lT3B0aW9ucyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29tbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tZW50U2VydmljZTogSUNvbW1lbnRTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IHN0YXRlTWVtZW50byA9IG5ldyBNZW1lbnRvPENvbW1lbnRzVmlld1N0YXRlPihWSUVXX1NUT1JBR0VfSUQsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3U3RhdGUgPSBzdGF0ZU1lbWVudG8uZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdHN1cGVyKHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRmaWx0ZXJPcHRpb25zOiB7XG5cdFx0XHRcdHBsYWNlaG9sZGVyOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzLmZpbHRlci5wbGFjZWhvbGRlcicsIFwiRmlsdGVyIChlLmcuIHRleHQsIGF1dGhvcilcIiksXG5cdFx0XHRcdGFyaWFMYWJlbDogbmxzLmxvY2FsaXplKCdjb21tZW50cy5maWx0ZXIuYXJpYUxhYmVsJywgXCJGaWx0ZXIgY29tbWVudHNcIiksXG5cdFx0XHRcdGhpc3Rvcnk6IHZpZXdTdGF0ZS5maWx0ZXJIaXN0b3J5IHx8IFtdLFxuXHRcdFx0XHR0ZXh0OiB2aWV3U3RhdGUuZmlsdGVyIHx8ICcnLFxuXHRcdFx0XHRmb2N1c0NvbnRleHRLZXk6IENvbW1lbnRzVmlld0ZpbHRlckZvY3VzQ29udGV4dEtleS5rZXlcblx0XHRcdH1cblx0XHR9LCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0XHR0aGlzLmhhc0NvbW1lbnRzQ29udGV4dEtleSA9IENPTlRFWFRfS0VZX0hBU19DT01NRU5UUy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc29tZUNvbW1lbnRzRXhwYW5kZWRDb250ZXh0S2V5ID0gQ09OVEVYVF9LRVlfU09NRV9DT01NRU5UU19FWFBBTkRFRC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuY29tbWVudHNGb2N1c2VkQ29udGV4dEtleSA9IENPTlRFWFRfS0VZX0NPTU1FTlRfRk9DVVNFRC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc3RhdGVNZW1lbnRvID0gc3RhdGVNZW1lbnRvO1xuXHRcdHRoaXMudmlld1N0YXRlID0gdmlld1N0YXRlO1xuXG5cdFx0dGhpcy5maWx0ZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IENvbW1lbnRzRmlsdGVycyh7XG5cdFx0XHRzaG93UmVzb2x2ZWQ6IHRoaXMudmlld1N0YXRlLnNob3dSZXNvbHZlZCAhPT0gZmFsc2UsXG5cdFx0XHRzaG93VW5yZXNvbHZlZDogdGhpcy52aWV3U3RhdGUuc2hvd1VucmVzb2x2ZWQgIT09IGZhbHNlLFxuXHRcdFx0c29ydEJ5OiB0aGlzLnZpZXdTdGF0ZS5zb3J0QnkgPz8gQ29tbWVudHNTb3J0T3JkZXIuUmVzb3VyY2VBc2NlbmRpbmcsXG5cdFx0fSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdHRoaXMuZmlsdGVyID0gbmV3IEZpbHRlcihuZXcgRmlsdGVyT3B0aW9ucyh0aGlzLmZpbHRlcldpZGdldC5nZXRGaWx0ZXJUZXh0KCksIHRoaXMuZmlsdGVycy5zaG93UmVzb2x2ZWQsIHRoaXMuZmlsdGVycy5zaG93VW5yZXNvbHZlZCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWx0ZXJzLm9uRGlkQ2hhbmdlKChldmVudDogQ29tbWVudHNGaWx0ZXJzQ2hhbmdlRXZlbnQpID0+IHtcblx0XHRcdGlmIChldmVudC5zaG93UmVzb2x2ZWQgfHwgZXZlbnQuc2hvd1VucmVzb2x2ZWQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVGaWx0ZXIoKTtcblx0XHRcdH1cblx0XHRcdGlmIChldmVudC5zb3J0QnkpIHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsdGVyV2lkZ2V0Lm9uRGlkQ2hhbmdlRmlsdGVyVGV4dCgoKSA9PiB0aGlzLnVwZGF0ZUZpbHRlcigpKSk7XG5cdH1cblxuXHRvdmVycmlkZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3U3RhdGUuZmlsdGVyID0gdGhpcy5maWx0ZXJXaWRnZXQuZ2V0RmlsdGVyVGV4dCgpO1xuXHRcdHRoaXMudmlld1N0YXRlLmZpbHRlckhpc3RvcnkgPSB0aGlzLmZpbHRlcldpZGdldC5nZXRIaXN0b3J5KCk7XG5cdFx0dGhpcy52aWV3U3RhdGUuc2hvd1Jlc29sdmVkID0gdGhpcy5maWx0ZXJzLnNob3dSZXNvbHZlZDtcblx0XHR0aGlzLnZpZXdTdGF0ZS5zaG93VW5yZXNvbHZlZCA9IHRoaXMuZmlsdGVycy5zaG93VW5yZXNvbHZlZDtcblx0XHR0aGlzLnZpZXdTdGF0ZS5zb3J0QnkgPSB0aGlzLmZpbHRlcnMuc29ydEJ5O1xuXHRcdHRoaXMuc3RhdGVNZW1lbnRvLnNhdmVNZW1lbnRvKCk7XG5cdFx0c3VwZXIuc2F2ZVN0YXRlKCk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoKTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJOYXZpZ2FibGVDb250YWluZXIoe1xuXHRcdFx0bmFtZTogJ2NvbW1lbnRzVmlldycsXG5cdFx0XHRmb2N1c05vdGlmaWVyczogW3RoaXMsIHRoaXMuZmlsdGVyV2lkZ2V0XSxcblx0XHRcdGZvY3VzTmV4dFdpZGdldDogKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5maWx0ZXJXaWRnZXQuaGFzRm9jdXMoKSkge1xuXHRcdFx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGZvY3VzUHJldmlvdXNXaWRnZXQ6ICgpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLmZpbHRlcldpZGdldC5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1c0ZpbHRlcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIGZvY3VzRmlsdGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuZmlsdGVyV2lkZ2V0LmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJGaWx0ZXJUZXh0KCk6IHZvaWQge1xuXHRcdHRoaXMuZmlsdGVyV2lkZ2V0LnNldEZpbHRlclRleHQoJycpO1xuXHR9XG5cblx0cHVibGljIGdldEZpbHRlclN0YXRzKCk6IHsgdG90YWw6IG51bWJlcjsgZmlsdGVyZWQ6IG51bWJlciB9IHtcblx0XHRpZiAoIXRoaXMuY2FjaGVkRmlsdGVyU3RhdHMpIHtcblx0XHRcdHRoaXMuY2FjaGVkRmlsdGVyU3RhdHMgPSB7XG5cdFx0XHRcdHRvdGFsOiB0aGlzLnRvdGFsQ29tbWVudHMsXG5cdFx0XHRcdGZpbHRlcmVkOiB0aGlzLnRyZWU/LmdldFZpc2libGVJdGVtQ291bnQoKSA/PyAwXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNhY2hlZEZpbHRlclN0YXRzO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGaWx0ZXIoKSB7XG5cdFx0dGhpcy5maWx0ZXIub3B0aW9ucyA9IG5ldyBGaWx0ZXJPcHRpb25zKHRoaXMuZmlsdGVyV2lkZ2V0LmdldEZpbHRlclRleHQoKSwgdGhpcy5maWx0ZXJzLnNob3dSZXNvbHZlZCwgdGhpcy5maWx0ZXJzLnNob3dVbnJlc29sdmVkKTtcblx0XHR0aGlzLnRyZWU/LmZpbHRlckNvbW1lbnRzKCk7XG5cblx0XHR0aGlzLmNhY2hlZEZpbHRlclN0YXRzID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHsgdG90YWwsIGZpbHRlcmVkIH0gPSB0aGlzLmdldEZpbHRlclN0YXRzKCk7XG5cdFx0dGhpcy5maWx0ZXJXaWRnZXQudXBkYXRlQmFkZ2UodG90YWwgPT09IGZpbHRlcmVkIHx8IHRvdGFsID09PSAwID8gdW5kZWZpbmVkIDogbmxzLmxvY2FsaXplKCdzaG93aW5nIGZpbHRlcmVkIHJlc3VsdHMnLCBcIlNob3dpbmcgezB9IG9mIHsxfVwiLCBmaWx0ZXJlZCwgdG90YWwpKTtcblx0XHR0aGlzLmZpbHRlcldpZGdldC5jaGVja01vcmVGaWx0ZXJzKCF0aGlzLmZpbHRlcnMuc2hvd1Jlc29sdmVkIHx8ICF0aGlzLmZpbHRlcnMuc2hvd1VucmVzb2x2ZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjb21tZW50cy1wYW5lbCcpO1xuXG5cdFx0Y29uc3QgZG9tQ29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuY29tbWVudHMtcGFuZWwtY29udGFpbmVyJykpO1xuXG5cdFx0dGhpcy50cmVlQ29udGFpbmVyID0gZG9tLmFwcGVuZChkb21Db250YWluZXIsIGRvbS4kKCcudHJlZS1jb250YWluZXInKSk7XG5cdFx0dGhpcy50cmVlQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2ZpbGUtaWNvbi10aGVtYWJsZS10cmVlJywgJ3Nob3ctZmlsZS1pY29ucycpO1xuXG5cdFx0dGhpcy5jYWNoZWRGaWx0ZXJTdGF0cyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmNyZWF0ZVRyZWUoKTtcblx0XHR0aGlzLmNyZWF0ZU1lc3NhZ2VCb3goZG9tQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29tbWVudFNlcnZpY2Uub25EaWRTZXRBbGxDb21tZW50VGhyZWFkcyh0aGlzLm9uQWxsQ29tbWVudHNDaGFuZ2VkLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb21tZW50U2VydmljZS5vbkRpZFVwZGF0ZUNvbW1lbnRUaHJlYWRzKHRoaXMub25Db21tZW50c1VwZGF0ZWQsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbW1lbnRTZXJ2aWNlLm9uRGlkRGVsZXRlRGF0YVByb3ZpZGVyKHRoaXMub25EYXRhUHJvdmlkZXJEZWxldGVkLCB0aGlzKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkodmlzaWJsZSA9PiB7XG5cdFx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnJlbmRlckNvbW1lbnRzKCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblxuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLnRyZWU/LmdldEhUTUxFbGVtZW50KCk7XG5cdFx0aWYgKGVsZW1lbnQgJiYgZG9tLmlzQWN0aXZlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5jb21tZW50U2VydmljZS5jb21tZW50c01vZGVsLmhhc0NvbW1lbnRUaHJlYWRzKCkgJiYgdGhpcy5tZXNzYWdlQm94Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLm1lc3NhZ2VCb3hDb250YWluZXIuZm9jdXMoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMudHJlZSkge1xuXHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb21tZW50cygpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIXRoaXMuY29tbWVudFNlcnZpY2UuY29tbWVudHNNb2RlbC5oYXNDb21tZW50VGhyZWFkcygpKTtcblx0XHR0aGlzLnJlbmRlck1lc3NhZ2UoKTtcblx0XHR0aGlzLnRyZWU/LnNldENoaWxkcmVuKG51bGwsIGNyZWF0ZVJlc291cmNlQ29tbWVudHNJdGVyYXRvcih0aGlzLmNvbW1lbnRTZXJ2aWNlLmNvbW1lbnRzTW9kZWwpKTtcblx0fVxuXG5cdHB1YmxpYyBjb2xsYXBzZUFsbCgpIHtcblx0XHRpZiAodGhpcy50cmVlKSB7XG5cdFx0XHR0aGlzLnRyZWUuY29sbGFwc2VBbGwoKTtcblx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtdKTtcblx0XHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHRcdFx0dGhpcy50cmVlLmZvY3VzRmlyc3QoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZXhwYW5kQWxsKCkge1xuXHRcdGlmICh0aGlzLnRyZWUpIHtcblx0XHRcdHRoaXMudHJlZS5leHBhbmRBbGwoKTtcblx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtdKTtcblx0XHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHRcdFx0dGhpcy50cmVlLmZvY3VzRmlyc3QoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGhhc1JlbmRlcmVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMudHJlZTtcblx0fVxuXG5cdHByb3RlY3RlZCBsYXlvdXRCb2R5Q29udGVudChoZWlnaHQ6IG51bWJlciA9IHRoaXMuY3VycmVudEhlaWdodCwgd2lkdGg6IG51bWJlciA9IHRoaXMuY3VycmVudFdpZHRoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubWVzc2FnZUJveENvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5tZXNzYWdlQm94Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0fVxuXHRcdHRoaXMudHJlZT8ubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMuY3VycmVudEhlaWdodCA9IGhlaWdodDtcblx0XHR0aGlzLmN1cnJlbnRXaWR0aCA9IHdpZHRoO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVNZXNzYWdlQm94KHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLm1lc3NhZ2VCb3hDb250YWluZXIgPSBkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJy5tZXNzYWdlLWJveC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5tZXNzYWdlQm94Q29udGFpbmVyLnNldEF0dHJpYnV0ZSgndGFiSW5kZXgnLCAnMCcpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNZXNzYWdlKCk6IHZvaWQge1xuXHRcdHRoaXMubWVzc2FnZUJveENvbnRhaW5lci50ZXh0Q29udGVudCA9IHRoaXMuY29tbWVudFNlcnZpY2UuY29tbWVudHNNb2RlbC5nZXRNZXNzYWdlKCk7XG5cdFx0dGhpcy5tZXNzYWdlQm94Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsIHRoaXMuY29tbWVudFNlcnZpY2UuY29tbWVudHNNb2RlbC5oYXNDb21tZW50VGhyZWFkcygpKTtcblx0fVxuXG5cdHByaXZhdGUgbWFrZUNvbW1lbnRMb2NhdGlvbkxhYmVsKGZpbGU6IFVSSSwgcmFuZ2U/OiBJUmFuZ2UpIHtcblx0XHRjb25zdCBmaWxlTGFiZWwgPSBiYXNlbmFtZShmaWxlKTtcblx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdmaWxlQ29tbWVudExhYmVsJywgXCJpbiB7MH1cIiwgZmlsZUxhYmVsKTtcblx0XHR9XG5cdFx0aWYgKHJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gcmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnb25lTGluZUNvbW1lbnRMYWJlbCcsIFwiYXQgbGluZSB7MH0gY29sdW1uIHsxfSBpbiB7Mn1cIiwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiwgZmlsZUxhYmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnbXVsdGlMaW5lQ29tbWVudExhYmVsJywgXCJmcm9tIGxpbmUgezB9IHRvIGxpbmUgezF9IGluIHsyfVwiLCByYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLmVuZExpbmVOdW1iZXIsIGZpbGVMYWJlbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBtYWtlU2NyZWVuUmVhZGVyTGFiZWxJbmZvKGVsZW1lbnQ6IENvbW1lbnROb2RlLCBmb3JBcmlhTGFiZWw/OiBib29sZWFuKSB7XG5cdFx0Y29uc3QgdXNlck5hbWUgPSBlbGVtZW50LmNvbW1lbnQudXNlck5hbWU7XG5cdFx0Y29uc3QgbG9jYXRpb25MYWJlbCA9IHRoaXMubWFrZUNvbW1lbnRMb2NhdGlvbkxhYmVsKGVsZW1lbnQucmVzb3VyY2UsIGVsZW1lbnQucmFuZ2UpO1xuXHRcdGNvbnN0IHJlcGx5Q291bnRMYWJlbCA9IHRoaXMuZ2V0UmVwbHlDb3VudEFzU3RyaW5nKGVsZW1lbnQsIGZvckFyaWFMYWJlbCk7XG5cdFx0Y29uc3QgYm9keUxhYmVsID0gKHR5cGVvZiBlbGVtZW50LmNvbW1lbnQuYm9keSA9PT0gJ3N0cmluZycpID8gZWxlbWVudC5jb21tZW50LmJvZHkgOiBlbGVtZW50LmNvbW1lbnQuYm9keS52YWx1ZTtcblxuXHRcdHJldHVybiB7IHVzZXJOYW1lLCBsb2NhdGlvbkxhYmVsLCByZXBseUNvdW50TGFiZWwsIGJvZHlMYWJlbCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTY3JlZW5SZWFkZXJJbmZvRm9yTm9kZShlbGVtZW50OiBDb21tZW50Tm9kZSwgZm9yQXJpYUxhYmVsPzogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0bGV0IGFjY2Vzc2libGVWaWV3SGludCA9ICcnO1xuXHRcdGlmIChmb3JBcmlhTGFiZWwgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkNvbW1lbnRzKSkge1xuXHRcdFx0Y29uc3Qga2JMYWJlbCA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhBY2Nlc3NpYmxlVmlld0FjdGlvbi5pZCk/LmdldEFyaWFMYWJlbCgpO1xuXHRcdFx0YWNjZXNzaWJsZVZpZXdIaW50ID0ga2JMYWJlbCA/IG5scy5sb2NhbGl6ZSgnYWNjZXNzaWJsZVZpZXdIaW50JywgXCJcXG5JbnNwZWN0IHRoaXMgaW4gdGhlIGFjY2Vzc2libGUgdmlldyAoezB9KS5cIiwga2JMYWJlbCkgOiBubHMubG9jYWxpemUoJ2FjZXNzaWJsZVZpZXdIaW50Tm9LYk9wZW4nLCBcIlxcbkluc3BlY3QgdGhpcyBpbiB0aGUgYWNjZXNzaWJsZSB2aWV3IHZpYSB0aGUgY29tbWFuZCBPcGVuIEFjY2Vzc2libGUgVmlldyB3aGljaCBpcyBjdXJyZW50bHkgbm90IHRyaWdnZXJhYmxlIHZpYSBrZXliaW5kaW5nLlwiKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVwbGllcyA9IHRoaXMuZ2V0UmVwbGllc0FzU3RyaW5nKGVsZW1lbnQsIGZvckFyaWFMYWJlbCk7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmZpbmRFZGl0b3JzKGVsZW1lbnQucmVzb3VyY2UpO1xuXHRcdGNvbnN0IGNvZGVFZGl0b3IgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0Q29udHJvbCgpO1xuXHRcdGxldCByZWxldmFudExpbmVzO1xuXHRcdGlmIChlbGVtZW50LnJhbmdlICYmIGVkaXRvcj8ubGVuZ3RoICYmIGlzQ29kZUVkaXRvcihjb2RlRWRpdG9yKSkge1xuXHRcdFx0cmVsZXZhbnRMaW5lcyA9IGNvZGVFZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0VmFsdWVJblJhbmdlKGVsZW1lbnQucmFuZ2UpO1xuXHRcdFx0aWYgKHJlbGV2YW50TGluZXMpIHtcblx0XHRcdFx0cmVsZXZhbnRMaW5lcyA9ICdcXG5Db3JyZXNwb25kaW5nIGNvZGU6IFxcbicgKyByZWxldmFudExpbmVzO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIXJlbGV2YW50TGluZXMpIHtcblx0XHRcdHJlbGV2YW50TGluZXMgPSAnJztcblx0XHR9XG5cblx0XHRjb25zdCBsYWJlbEluZm8gPSB0aGlzLm1ha2VTY3JlZW5SZWFkZXJMYWJlbEluZm8oZWxlbWVudCwgZm9yQXJpYUxhYmVsKTtcblxuXHRcdGlmIChlbGVtZW50LnRocmVhZFJlbGV2YW5jZSA9PT0gQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkuT3V0ZGF0ZWQpIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3Jlc291cmNlV2l0aENvbW1lbnRMYWJlbE91dGRhdGVkJyxcblx0XHRcdFx0XCJPdXRkYXRlZCBmcm9tIHswfTogezF9XFxuezJ9XFxuezN9XFxuezR9XCIsXG5cdFx0XHRcdGxhYmVsSW5mby51c2VyTmFtZSxcblx0XHRcdFx0bGFiZWxJbmZvLmJvZHlMYWJlbCxcblx0XHRcdFx0bGFiZWxJbmZvLmxvY2F0aW9uTGFiZWwsXG5cdFx0XHRcdGxhYmVsSW5mby5yZXBseUNvdW50TGFiZWwsXG5cdFx0XHRcdHJlbGV2YW50TGluZXNcblx0XHRcdCkgKyByZXBsaWVzICsgYWNjZXNzaWJsZVZpZXdIaW50O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdyZXNvdXJjZVdpdGhDb21tZW50TGFiZWwnLFxuXHRcdFx0XHRcInswfTogezF9XFxuezJ9XFxuezN9XFxuezR9XCIsXG5cdFx0XHRcdGxhYmVsSW5mby51c2VyTmFtZSxcblx0XHRcdFx0bGFiZWxJbmZvLmJvZHlMYWJlbCxcblx0XHRcdFx0bGFiZWxJbmZvLmxvY2F0aW9uTGFiZWwsXG5cdFx0XHRcdGxhYmVsSW5mby5yZXBseUNvdW50TGFiZWwsXG5cdFx0XHRcdHJlbGV2YW50TGluZXNcblx0XHRcdCkgKyByZXBsaWVzICsgYWNjZXNzaWJsZVZpZXdIaW50O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVwbGllc0FzU3RyaW5nKG5vZGU6IENvbW1lbnROb2RlLCBmb3JBcmlhTGFiZWw/OiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRpZiAoIW5vZGUucmVwbGllcy5sZW5ndGggfHwgZm9yQXJpYUxhYmVsKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiAnXFxuJyArIG5vZGUucmVwbGllcy5tYXAocmVwbHkgPT4gbmxzLmxvY2FsaXplKCdyZXNvdXJjZVdpdGhSZXBsaWVzTGFiZWwnLFxuXHRcdFx0XCJ7MH0gezF9XCIsXG5cdFx0XHRyZXBseS5jb21tZW50LnVzZXJOYW1lLFxuXHRcdFx0KHR5cGVvZiByZXBseS5jb21tZW50LmJvZHkgPT09ICdzdHJpbmcnKSA/IHJlcGx5LmNvbW1lbnQuYm9keSA6IHJlcGx5LmNvbW1lbnQuYm9keS52YWx1ZSlcblx0XHQpLmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZXBseUNvdW50QXNTdHJpbmcobm9kZTogQ29tbWVudE5vZGUsIGZvckFyaWFMYWJlbD86IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdHJldHVybiBub2RlLnJlcGxpZXMubGVuZ3RoICYmICFmb3JBcmlhTGFiZWwgPyBubHMubG9jYWxpemUoJ3JlcGx5Q291bnQnLCBcIiB7MH0gcmVwbGllcyxcIiwgbm9kZS5yZXBsaWVzLmxlbmd0aCkgOiAnJztcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVHJlZSgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWVMYWJlbHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCB0aGlzKSk7XG5cdFx0dGhpcy50cmVlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tZW50c0xpc3QsIHRoaXMudHJlZUxhYmVscywgdGhpcy50cmVlQ29udGFpbmVyLCB7XG5cdFx0XHRvdmVycmlkZVN0eWxlczogdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCkubGlzdE92ZXJyaWRlU3R5bGVzLFxuXHRcdFx0c2VsZWN0aW9uTmF2aWdhdGlvbjogdHJ1ZSxcblx0XHRcdGZpbHRlcjogdGhpcy5maWx0ZXIsXG5cdFx0XHRzb3J0ZXI6IHtcblx0XHRcdFx0Y29tcGFyZTogKGE6IENvbW1lbnRzVHJlZU5vZGUsIGI6IENvbW1lbnRzVHJlZU5vZGUpID0+IHtcblx0XHRcdFx0XHRpZiAoYSBpbnN0YW5jZW9mIENvbW1lbnRzTW9kZWwgfHwgYiBpbnN0YW5jZW9mIENvbW1lbnRzTW9kZWwpIHtcblx0XHRcdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGhpcy5maWx0ZXJzLnNvcnRCeSA9PT0gQ29tbWVudHNTb3J0T3JkZXIuVXBkYXRlZEF0RGVzY2VuZGluZykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGEubGFzdFVwZGF0ZWRBdCA+IGIubGFzdFVwZGF0ZWRBdCA/IC0xIDogMTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuZmlsdGVycy5zb3J0QnkgPT09IENvbW1lbnRzU29ydE9yZGVyLlJlc291cmNlQXNjZW5kaW5nKSB7XG5cdFx0XHRcdFx0XHRpZiAoYSBpbnN0YW5jZW9mIFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzICYmIGIgaW5zdGFuY2VvZiBSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VTY2hlbWUgPSB0aGlzLnBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWU7XG5cdFx0XHRcdFx0XHRcdGlmICgoYS5yZXNvdXJjZS5zY2hlbWUgIT09IGIucmVzb3VyY2Uuc2NoZW1lKSAmJiAoYS5yZXNvdXJjZS5zY2hlbWUgPT09IHdvcmtzcGFjZVNjaGVtZSB8fCBiLnJlc291cmNlLnNjaGVtZSA9PT0gd29ya3NwYWNlU2NoZW1lKSkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIFdvcmtzcGFjZSBzY2hlbWUgc2hvdWxkIGFsd2F5cyBjb21lIGZpcnN0XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGIucmVzb3VyY2Uuc2NoZW1lID09PSB3b3Jrc3BhY2VTY2hlbWUgPyAxIDogLTE7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIGEucmVzb3VyY2UudG9TdHJpbmcoKSA+IGIucmVzb3VyY2UudG9TdHJpbmcoKSA/IDEgOiAtMTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoYSBpbnN0YW5jZW9mIENvbW1lbnROb2RlICYmIGIgaW5zdGFuY2VvZiBDb21tZW50Tm9kZSAmJiBhLnRocmVhZC5yYW5nZSAmJiBiLnRocmVhZC5yYW5nZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYS50aHJlYWQucmFuZ2U/LnN0YXJ0TGluZU51bWJlciA+IGIudGhyZWFkLnJhbmdlPy5zdGFydExpbmVOdW1iZXIgPyAxIDogLTE7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IHtcblx0XHRcdFx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWw6IChpdGVtOiBDb21tZW50c1RyZWVOb2RlKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRnZXRBcmlhTGFiZWw6IChlbGVtZW50OiBhbnkpOiBzdHJpbmcgPT4ge1xuXHRcdFx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQ29tbWVudHNNb2RlbCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncm9vdENvbW1lbnRzTGFiZWwnLCBcIkNvbW1lbnRzIGZvciBjdXJyZW50IHdvcmtzcGFjZVwiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVzb3VyY2VXaXRoQ29tbWVudFRocmVhZHNMYWJlbCcsIFwiQ29tbWVudHMgaW4gezB9LCBmdWxsIHBhdGggezF9XCIsIGJhc2VuYW1lKGVsZW1lbnQucmVzb3VyY2UpLCBlbGVtZW50LnJlc291cmNlLmZzUGF0aCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQ29tbWVudE5vZGUpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmdldFNjcmVlblJlYWRlckluZm9Gb3JOb2RlKGVsZW1lbnQsIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdFx0XHRcdHJldHVybiBDT01NRU5UU19WSUVXX1RJVExFLnZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkT3BlbihlID0+IHtcblx0XHRcdHRoaXMub3BlbkZpbGUoZS5lbGVtZW50LCBlLmVkaXRvck9wdGlvbnMucGlubmVkLCBlLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cywgZS5zaWRlQnlTaWRlKTtcblx0XHR9KSk7XG5cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlU29tZUNvbW1lbnRzRXhwYW5kZWQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZVNvbWVDb21tZW50c0V4cGFuZGVkKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZEZvY3VzKCgpID0+IHRoaXMuY29tbWVudHNGb2N1c2VkQ29udGV4dEtleS5zZXQodHJ1ZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRCbHVyKCgpID0+IHRoaXMuY29tbWVudHNGb2N1c2VkQ29udGV4dEtleS5zZXQoZmFsc2UpKSk7XG5cdH1cblxuXHRwcml2YXRlIG9wZW5GaWxlKGVsZW1lbnQ6IGFueSwgcGlubmVkPzogYm9vbGVhbiwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4sIHNpZGVCeVNpZGU/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCEoZWxlbWVudCBpbnN0YW5jZW9mIFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzIHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBDb21tZW50Tm9kZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGhyZWFkVG9SZXZlYWwgPSBlbGVtZW50IGluc3RhbmNlb2YgUmVzb3VyY2VXaXRoQ29tbWVudFRocmVhZHMgPyBlbGVtZW50LmNvbW1lbnRUaHJlYWRzWzBdLnRocmVhZCA6IGVsZW1lbnQudGhyZWFkO1xuXHRcdGNvbnN0IGNvbW1lbnRUb1JldmVhbCA9IGVsZW1lbnQgaW5zdGFuY2VvZiBSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcyA/IGVsZW1lbnQuY29tbWVudFRocmVhZHNbMF0uY29tbWVudCA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gcmV2ZWFsQ29tbWVudFRocmVhZCh0aGlzLmNvbW1lbnRTZXJ2aWNlLCB0aGlzLmVkaXRvclNlcnZpY2UsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCB0aHJlYWRUb1JldmVhbCwgY29tbWVudFRvUmV2ZWFsLCBmYWxzZSwgcGlubmVkLCBwcmVzZXJ2ZUZvY3VzLCBzaWRlQnlTaWRlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMudHJlZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0dGhpcy5oYXNDb21tZW50c0NvbnRleHRLZXkuc2V0KHRoaXMuY29tbWVudFNlcnZpY2UuY29tbWVudHNNb2RlbC5oYXNDb21tZW50VGhyZWFkcygpKTtcblx0XHRcdHRoaXMuY2FjaGVkRmlsdGVyU3RhdHMgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnJlbmRlckNvbW1lbnRzKCk7XG5cblx0XHRcdGlmICh0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCkubGVuZ3RoID09PSAwICYmIHRoaXMuY29tbWVudFNlcnZpY2UuY29tbWVudHNNb2RlbC5oYXNDb21tZW50VGhyZWFkcygpKSB7XG5cdFx0XHRcdGNvbnN0IGZpcnN0Q29tbWVudCA9IHRoaXMuY29tbWVudFNlcnZpY2UuY29tbWVudHNNb2RlbC5yZXNvdXJjZUNvbW1lbnRUaHJlYWRzWzBdLmNvbW1lbnRUaHJlYWRzWzBdO1xuXHRcdFx0XHRpZiAoZmlyc3RDb21tZW50ICYmIHRoaXMudHJlZS5oYXNFbGVtZW50KGZpcnN0Q29tbWVudCkpIHtcblx0XHRcdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW2ZpcnN0Q29tbWVudF0pO1xuXHRcdFx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW2ZpcnN0Q29tbWVudF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkFsbENvbW1lbnRzQ2hhbmdlZChlOiBJV29ya3NwYWNlQ29tbWVudFRocmVhZHNFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuY2FjaGVkRmlsdGVyU3RhdHMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy50b3RhbENvbW1lbnRzICs9IGUuY29tbWVudFRocmVhZHMubGVuZ3RoO1xuXG5cdFx0bGV0IHVucmVzb2x2ZWQgPSAwO1xuXHRcdGZvciAoY29uc3QgdGhyZWFkIG9mIGUuY29tbWVudFRocmVhZHMpIHtcblx0XHRcdGlmICh0aHJlYWQuc3RhdGUgPT09IENvbW1lbnRUaHJlYWRTdGF0ZS5VbnJlc29sdmVkKSB7XG5cdFx0XHRcdHVucmVzb2x2ZWQrKztcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5yZWZyZXNoKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ29tbWVudHNVcGRhdGVkKGU6IElDb21tZW50VGhyZWFkQ2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5jYWNoZWRGaWx0ZXJTdGF0cyA9IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMudG90YWxDb21tZW50cyArPSBlLmFkZGVkLmxlbmd0aDtcblx0XHR0aGlzLnRvdGFsQ29tbWVudHMgLT0gZS5yZW1vdmVkLmxlbmd0aDtcblxuXHRcdGxldCB1bnJlc29sdmVkID0gMDtcblx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHRoaXMuY29tbWVudFNlcnZpY2UuY29tbWVudHNNb2RlbC5yZXNvdXJjZUNvbW1lbnRUaHJlYWRzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRocmVhZCBvZiByZXNvdXJjZS5jb21tZW50VGhyZWFkcykge1xuXHRcdFx0XHRpZiAodGhyZWFkLnRocmVhZFN0YXRlID09PSBDb21tZW50VGhyZWFkU3RhdGUuVW5yZXNvbHZlZCkge1xuXHRcdFx0XHRcdHVucmVzb2x2ZWQrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnJlZnJlc2goKTtcblx0fVxuXG5cdHByaXZhdGUgb25EYXRhUHJvdmlkZXJEZWxldGVkKG93bmVyOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmNhY2hlZEZpbHRlclN0YXRzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMudG90YWxDb21tZW50cyA9IDA7XG5cdFx0dGhpcy5yZWZyZXNoKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNvbWVDb21tZW50c0V4cGFuZGVkKCkge1xuXHRcdHRoaXMuc29tZUNvbW1lbnRzRXhwYW5kZWRDb250ZXh0S2V5LnNldCh0aGlzLmlzU29tZUNvbW1lbnRzRXhwYW5kZWQoKSk7XG5cdH1cblxuXHRwdWJsaWMgYXJlQWxsQ29tbWVudHNFeHBhbmRlZCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMudHJlZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBuYXZpZ2F0b3IgPSB0aGlzLnRyZWUubmF2aWdhdGUoKTtcblx0XHR3aGlsZSAobmF2aWdhdG9yLm5leHQoKSkge1xuXHRcdFx0aWYgKHRoaXMudHJlZS5pc0NvbGxhcHNlZChuYXZpZ2F0b3IuY3VycmVudCgpKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIGlzU29tZUNvbW1lbnRzRXhwYW5kZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLnRyZWUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgbmF2aWdhdG9yID0gdGhpcy50cmVlLm5hdmlnYXRlKCk7XG5cdFx0d2hpbGUgKG5hdmlnYXRvci5uZXh0KCkpIHtcblx0XHRcdGlmICghdGhpcy50cmVlLmlzQ29sbGFwc2VkKG5hdmlnYXRvci5jdXJyZW50KCkpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixZQUFZLFNBQVM7QUFDckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUF5QyxrQ0FBa0M7QUFDcEYsU0FBUyx1QkFBc0Q7QUFDL0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxjQUFjLHFCQUFxQixjQUFjO0FBQzFELFNBQTJCLHNCQUFzQjtBQUNqRCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQixvQkFBb0IscUJBQXFCO0FBQy9ELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMseUNBQXdEO0FBQ2pFLFNBQVMsaUJBQTZDLHlCQUF5QjtBQUMvRSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw0QkFBNEIsMEJBQTBCO0FBQy9ELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsZUFBZSxtQ0FBd0Q7QUFDaEYsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1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
