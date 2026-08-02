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
import * as nls from "../../../../nls.js";
import { renderMarkdown } from "../../../../base/browser/markdownRenderer.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { CommentNode, ResourceWithCommentThreads } from "../common/commentModel.js";
import { TreeVisibility } from "../../../../base/browser/ui/tree/tree.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IListService, WorkbenchObjectTree } from "../../../../platform/list/browser/listService.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { TimestampWidget } from "./timestamp.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { commentViewThreadStateColorVar, getCommentThreadStateIconColor } from "./commentColors.js";
import { CommentThreadApplicability, CommentThreadState, CommentState } from "../../../../editor/common/languages.js";
import { FilterOptions } from "./commentsFilterOptions.js";
import { basename } from "../../../../base/common/resources.js";
import { CommentsModel } from "./commentsModel.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { createActionViewItem, getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
const COMMENTS_VIEW_ID = "workbench.panel.comments";
const COMMENTS_VIEW_STORAGE_ID = "Comments";
const COMMENTS_VIEW_TITLE = nls.localize2("comments.view.title", "Comments");
const _CommentsModelVirtualDelegate = class _CommentsModelVirtualDelegate {
  getHeight(element) {
    if (element instanceof CommentNode && element.hasReply()) {
      return 44;
    }
    return 22;
  }
  getTemplateId(element) {
    if (element instanceof ResourceWithCommentThreads) {
      return _CommentsModelVirtualDelegate.RESOURCE_ID;
    }
    if (element instanceof CommentNode) {
      return _CommentsModelVirtualDelegate.COMMENT_ID;
    }
    return "";
  }
};
_CommentsModelVirtualDelegate.RESOURCE_ID = "resource-with-comments";
_CommentsModelVirtualDelegate.COMMENT_ID = "comment-node";
let CommentsModelVirtualDelegate = _CommentsModelVirtualDelegate;
class ResourceWithCommentsRenderer {
  constructor(labels) {
    this.labels = labels;
    this.templateId = "resource-with-comments";
  }
  renderTemplate(container) {
    const labelContainer = dom.append(container, dom.$(".resource-container"));
    const resourceLabel = this.labels.create(labelContainer);
    const separator = dom.append(labelContainer, dom.$(".separator"));
    const owner = labelContainer.appendChild(dom.$(".owner"));
    return { resourceLabel, owner, separator };
  }
  renderElement(node, index, templateData) {
    templateData.resourceLabel.setFile(node.element.resource);
    templateData.separator.innerText = "\xB7";
    if (node.element.ownerLabel) {
      templateData.owner.innerText = node.element.ownerLabel;
      templateData.separator.style.display = "inline";
    } else {
      templateData.owner.innerText = "";
      templateData.separator.style.display = "none";
    }
  }
  disposeTemplate(templateData) {
    templateData.resourceLabel.dispose();
  }
}
let CommentsMenus = class {
  constructor(menuService) {
    this.menuService = menuService;
  }
  getResourceActions(element) {
    const actions = this.getActions(MenuId.CommentsViewThreadActions, element);
    return { actions: actions.primary };
  }
  getResourceContextActions(element) {
    return this.getActions(MenuId.CommentsViewThreadActions, element).secondary;
  }
  setContextKeyService(service) {
    this.contextKeyService = service;
  }
  getActions(menuId, element) {
    if (!this.contextKeyService) {
      return { primary: [], secondary: [] };
    }
    const overlay = [
      ["commentController", element.owner],
      ["resourceScheme", element.resource.scheme],
      ["commentThread", element.contextValue],
      ["canReply", element.thread.canReply]
    ];
    const contextKeyService = this.contextKeyService.createOverlay(overlay);
    const menu = this.menuService.getMenuActions(menuId, contextKeyService, { shouldForwardArgs: true });
    return getContextMenuActions(menu, "inline");
  }
  dispose() {
    this.contextKeyService = void 0;
  }
};
CommentsMenus = __decorateClass([
  __decorateParam(0, IMenuService)
], CommentsMenus);
let CommentNodeRenderer = class {
  constructor(actionViewItemProvider, menus, configurationService, hoverService, themeService) {
    this.actionViewItemProvider = actionViewItemProvider;
    this.menus = menus;
    this.configurationService = configurationService;
    this.hoverService = hoverService;
    this.themeService = themeService;
    this.templateId = "comment-node";
  }
  renderTemplate(container) {
    const threadContainer = dom.append(container, dom.$(".comment-thread-container"));
    const metadataContainer = dom.append(threadContainer, dom.$(".comment-metadata-container"));
    const metadata = dom.append(metadataContainer, dom.$(".comment-metadata"));
    const icon = dom.append(metadata, dom.$(".icon"));
    const userNames = dom.append(metadata, dom.$(".user"));
    const timestamp = new TimestampWidget(this.configurationService, this.hoverService, dom.append(metadata, dom.$(".timestamp-container")));
    const relevance = dom.append(metadata, dom.$(".relevance"));
    const separator = dom.append(metadata, dom.$(".separator"));
    const commentPreview = dom.append(metadata, dom.$(".text"));
    const rangeContainer = dom.append(metadata, dom.$(".range"));
    const range = dom.$("p");
    rangeContainer.appendChild(range);
    const threadMetadata = {
      icon,
      userNames,
      timestamp,
      relevance,
      separator,
      commentPreview,
      range
    };
    threadMetadata.separator.innerText = "\xB7";
    const actionsContainer = dom.append(metadataContainer, dom.$(".actions"));
    const actionBar = new ActionBar(actionsContainer, {
      actionViewItemProvider: this.actionViewItemProvider
    });
    const snippetContainer = dom.append(threadContainer, dom.$(".comment-snippet-container"));
    const repliesMetadata = {
      container: snippetContainer,
      icon: dom.append(snippetContainer, dom.$(".icon")),
      count: dom.append(snippetContainer, dom.$(".count")),
      lastReplyDetail: dom.append(snippetContainer, dom.$(".reply-detail")),
      separator: dom.append(snippetContainer, dom.$(".separator")),
      timestamp: new TimestampWidget(this.configurationService, this.hoverService, dom.append(snippetContainer, dom.$(".timestamp-container")))
    };
    repliesMetadata.separator.innerText = "\xB7";
    repliesMetadata.icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.indent));
    const disposables = [threadMetadata.timestamp, repliesMetadata.timestamp];
    return { threadMetadata, repliesMetadata, actionBar, disposables, elementDisposables: new DisposableStore() };
  }
  getCountString(commentCount) {
    if (commentCount > 2) {
      return nls.localize("commentsCountReplies", "{0} replies", commentCount - 1);
    } else if (commentCount === 2) {
      return nls.localize("commentsCountReply", "1 reply");
    } else {
      return nls.localize("commentCount", "1 comment");
    }
  }
  getRenderedComment(commentBody) {
    const renderedComment = renderMarkdown(commentBody, {}, document.createElement("span"));
    const images = renderedComment.element.getElementsByTagName("img");
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const textDescription = dom.$("");
      textDescription.textContent = image.alt ? nls.localize("imageWithLabel", "Image: {0}", image.alt) : nls.localize("image", "Image");
      image.replaceWith(textDescription);
    }
    const headings = [...renderedComment.element.getElementsByTagName("h1"), ...renderedComment.element.getElementsByTagName("h2"), ...renderedComment.element.getElementsByTagName("h3"), ...renderedComment.element.getElementsByTagName("h4"), ...renderedComment.element.getElementsByTagName("h5"), ...renderedComment.element.getElementsByTagName("h6")];
    for (const heading of headings) {
      const textNode = document.createTextNode(heading.textContent || "");
      heading.replaceWith(textNode);
    }
    while (renderedComment.element.children.length > 1 && renderedComment.element.firstElementChild?.tagName === "HR") {
      renderedComment.element.removeChild(renderedComment.element.firstElementChild);
    }
    return renderedComment;
  }
  getIcon(threadState, hasDraft) {
    if (hasDraft) {
      return Codicon.commentDraft;
    } else if (threadState === CommentThreadState.Unresolved) {
      return Codicon.commentUnresolved;
    } else {
      return Codicon.comment;
    }
  }
  renderElement(node, index, templateData) {
    templateData.actionBar.clear();
    const commentCount = node.element.replies.length + 1;
    if (node.element.threadRelevance === CommentThreadApplicability.Outdated) {
      templateData.threadMetadata.relevance.style.display = "";
      templateData.threadMetadata.relevance.innerText = nls.localize("outdated", "Outdated");
      templateData.threadMetadata.separator.style.display = "none";
    } else {
      templateData.threadMetadata.relevance.innerText = "";
      templateData.threadMetadata.relevance.style.display = "none";
      templateData.threadMetadata.separator.style.display = "";
    }
    templateData.threadMetadata.icon.classList.remove(...Array.from(templateData.threadMetadata.icon.classList.values()).filter((value) => value.startsWith("codicon")));
    const hasDraft = node.element.thread.comments?.some((comment) => comment.state === CommentState.Draft);
    templateData.threadMetadata.icon.classList.add(...ThemeIcon.asClassNameArray(this.getIcon(node.element.threadState, hasDraft)));
    if (node.element.threadState !== void 0) {
      const color = this.getCommentThreadWidgetStateColor(node.element.threadState, this.themeService.getColorTheme());
      templateData.threadMetadata.icon.style.setProperty(commentViewThreadStateColorVar, `${color}`);
      templateData.threadMetadata.icon.style.color = `var(${commentViewThreadStateColorVar})`;
    }
    templateData.threadMetadata.userNames.textContent = node.element.comment.userName;
    templateData.threadMetadata.timestamp.setTimestamp(node.element.comment.timestamp ? new Date(node.element.comment.timestamp) : void 0);
    const originalComment = node.element;
    templateData.threadMetadata.commentPreview.innerText = "";
    templateData.threadMetadata.commentPreview.style.height = "22px";
    if (typeof originalComment.comment.body === "string") {
      templateData.threadMetadata.commentPreview.innerText = originalComment.comment.body;
    } else {
      const renderedComment = this.getRenderedComment(originalComment.comment.body);
      templateData.elementDisposables.add(renderedComment);
      for (let i = renderedComment.element.children.length - 1; i >= 1; i--) {
        renderedComment.element.removeChild(renderedComment.element.children[i]);
      }
      templateData.threadMetadata.commentPreview.appendChild(renderedComment.element);
      templateData.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), templateData.threadMetadata.commentPreview, renderedComment.element.textContent ?? ""));
    }
    if (node.element.range) {
      if (node.element.range.startLineNumber === node.element.range.endLineNumber) {
        templateData.threadMetadata.range.textContent = nls.localize("commentLine", "[Ln {0}]", node.element.range.startLineNumber);
      } else {
        templateData.threadMetadata.range.textContent = nls.localize("commentRange", "[Ln {0}-{1}]", node.element.range.startLineNumber, node.element.range.endLineNumber);
      }
    }
    const menuActions = this.menus.getResourceActions(node.element);
    templateData.actionBar.push(menuActions.actions, { icon: true, label: false });
    templateData.actionBar.context = {
      commentControlHandle: node.element.controllerHandle,
      commentThreadHandle: node.element.threadHandle,
      $mid: MarshalledId.CommentThread
    };
    if (!node.element.hasReply()) {
      templateData.repliesMetadata.container.style.display = "none";
      return;
    }
    templateData.repliesMetadata.container.style.display = "";
    templateData.repliesMetadata.count.textContent = this.getCountString(commentCount);
    const lastComment = node.element.replies[node.element.replies.length - 1].comment;
    templateData.repliesMetadata.lastReplyDetail.textContent = nls.localize("lastReplyFrom", "Last reply from {0}", lastComment.userName);
    templateData.repliesMetadata.timestamp.setTimestamp(lastComment.timestamp ? new Date(lastComment.timestamp) : void 0);
  }
  getCommentThreadWidgetStateColor(state, theme) {
    return state !== void 0 ? getCommentThreadStateIconColor(state, theme) : void 0;
  }
  disposeElement(_node, _index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.disposables.forEach((disposeable) => disposeable.dispose());
    templateData.elementDisposables.dispose();
    templateData.actionBar.dispose();
  }
};
CommentNodeRenderer = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IThemeService)
], CommentNodeRenderer);
var FilterDataType = /* @__PURE__ */ ((FilterDataType2) => {
  FilterDataType2[FilterDataType2["Resource"] = 0] = "Resource";
  FilterDataType2[FilterDataType2["Comment"] = 1] = "Comment";
  return FilterDataType2;
})(FilterDataType || {});
class Filter {
  constructor(options) {
    this.options = options;
  }
  filter(element, parentVisibility) {
    if (this.options.filter === "" && this.options.showResolved && this.options.showUnresolved) {
      return TreeVisibility.Visible;
    }
    if (element instanceof ResourceWithCommentThreads) {
      return this.filterResourceMarkers(element);
    } else {
      return this.filterCommentNode(element, parentVisibility);
    }
  }
  filterResourceMarkers(resourceMarkers) {
    if (this.options.textFilter.text && !this.options.textFilter.negate) {
      const uriMatches = FilterOptions._filter(this.options.textFilter.text, basename(resourceMarkers.resource));
      if (uriMatches) {
        return { visibility: true, data: { type: 0 /* Resource */, uriMatches: uriMatches || [] } };
      }
    }
    return TreeVisibility.Recurse;
  }
  filterCommentNode(comment, parentVisibility) {
    const matchesResolvedState = comment.threadState === void 0 || this.options.showResolved && CommentThreadState.Resolved === comment.threadState || this.options.showUnresolved && CommentThreadState.Unresolved === comment.threadState;
    if (!matchesResolvedState) {
      return false;
    }
    if (!this.options.textFilter.text) {
      return true;
    }
    const textMatches = (
      // Check body of comment for value
      FilterOptions._messageFilter(this.options.textFilter.text, typeof comment.comment.body === "string" ? comment.comment.body : comment.comment.body.value) || FilterOptions._messageFilter(this.options.textFilter.text, comment.comment.userName) || comment.replies.map((reply) => {
        return FilterOptions._messageFilter(this.options.textFilter.text, reply.comment.userName) || FilterOptions._messageFilter(this.options.textFilter.text, typeof reply.comment.body === "string" ? reply.comment.body : reply.comment.body.value);
      }).filter((value) => !!value).flat()
    );
    if (textMatches.length && !this.options.textFilter.negate) {
      return { visibility: true, data: { type: 1 /* Comment */, textMatches } };
    }
    if (textMatches.length && this.options.textFilter.negate && parentVisibility === TreeVisibility.Recurse) {
      return false;
    }
    if (textMatches.length === 0 && this.options.textFilter.negate && parentVisibility === TreeVisibility.Recurse) {
      return true;
    }
    return parentVisibility;
  }
}
let CommentsList = class extends WorkbenchObjectTree {
  constructor(labels, container, options, contextKeyService, listService, instantiationService, configurationService, contextMenuService, keybindingService) {
    const delegate = new CommentsModelVirtualDelegate();
    const actionViewItemProvider = createActionViewItem.bind(void 0, instantiationService);
    const menus = instantiationService.createInstance(CommentsMenus);
    menus.setContextKeyService(contextKeyService);
    const renderers = [
      instantiationService.createInstance(ResourceWithCommentsRenderer, labels),
      instantiationService.createInstance(CommentNodeRenderer, actionViewItemProvider, menus)
    ];
    super(
      "CommentsTree",
      container,
      delegate,
      renderers,
      {
        accessibilityProvider: options.accessibilityProvider,
        identityProvider: {
          getId: (element) => {
            if (element instanceof CommentsModel) {
              return "root";
            }
            if (element instanceof ResourceWithCommentThreads) {
              return `${element.uniqueOwner}-${element.id}`;
            }
            if (element instanceof CommentNode) {
              return `${element.uniqueOwner}-${element.resource.toString()}-${element.threadId}-${element.comment.uniqueIdInThread}` + (element.isRoot ? "-root" : "");
            }
            return "";
          }
        },
        expandOnlyOnTwistieClick: true,
        collapseByDefault: false,
        overrideStyles: options.overrideStyles,
        filter: options.filter,
        sorter: options.sorter,
        findWidgetEnabled: false,
        multipleSelectionSupport: false
      },
      instantiationService,
      contextKeyService,
      listService,
      configurationService
    );
    this.contextMenuService = contextMenuService;
    this.keybindingService = keybindingService;
    this.menus = menus;
    this.disposables.add(this.onContextMenu((e) => this.commentsOnContextMenu(e)));
  }
  commentsOnContextMenu(treeEvent) {
    const node = treeEvent.element;
    if (!(node instanceof CommentNode)) {
      return;
    }
    const event = treeEvent.browserEvent;
    event.preventDefault();
    event.stopPropagation();
    this.setFocus([node]);
    const actions = this.menus.getResourceContextActions(node);
    if (!actions.length) {
      return;
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => treeEvent.anchor,
      getActions: () => actions,
      getActionViewItem: (action) => {
        const keybinding = this.keybindingService.lookupKeybinding(action.id);
        if (keybinding) {
          return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
        }
        return void 0;
      },
      onHide: (wasCancelled) => {
        if (wasCancelled) {
          this.domFocus();
        }
      },
      getActionsContext: () => ({
        commentControlHandle: node.controllerHandle,
        commentThreadHandle: node.threadHandle,
        $mid: MarshalledId.CommentThread,
        thread: node.thread
      })
    });
  }
  filterComments() {
    this.refilter();
  }
  getVisibleItemCount() {
    let filtered = 0;
    const root = this.getNode();
    for (const resourceNode of root.children) {
      for (const commentNode of resourceNode.children) {
        if (commentNode.visible && resourceNode.visible) {
          filtered++;
        }
      }
    }
    return filtered;
  }
};
CommentsList = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IListService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IKeybindingService)
], CommentsList);
export {
  COMMENTS_VIEW_ID,
  COMMENTS_VIEW_STORAGE_ID,
  COMMENTS_VIEW_TITLE,
  CommentNodeRenderer,
  CommentsList,
  CommentsMenus,
  Filter,
  ResourceWithCommentsRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudHNUcmVlVmlld2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyByZW5kZXJNYXJrZG93biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlTGFiZWwsIFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgQ29tbWVudE5vZGUsIFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzIH0gZnJvbSAnLi4vY29tbW9uL2NvbW1lbnRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJVHJlZUNvbnRleHRNZW51RXZlbnQsIElUcmVlRmlsdGVyLCBJVHJlZU5vZGUsIFRyZWVGaWx0ZXJSZXN1bHQsIFRyZWVWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgSUxpc3RSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSwgSVdvcmtiZW5jaEFzeW5jRGF0YVRyZWVPcHRpb25zLCBXb3JrYmVuY2hPYmplY3RUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lLCBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFRpbWVzdGFtcFdpZGdldCB9IGZyb20gJy4vdGltZXN0YW1wLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgY29tbWVudFZpZXdUaHJlYWRTdGF0ZUNvbG9yVmFyLCBnZXRDb21tZW50VGhyZWFkU3RhdGVJY29uQ29sb3IgfSBmcm9tICcuL2NvbW1lbnRDb2xvcnMuanMnO1xuaW1wb3J0IHsgQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHksIENvbW1lbnRUaHJlYWRTdGF0ZSwgQ29tbWVudFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBJTWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IEZpbHRlck9wdGlvbnMgfSBmcm9tICcuL2NvbW1lbnRzRmlsdGVyT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJU3R5bGVPdmVycmlkZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJTGlzdFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUxvY2FsaXplZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IENvbW1lbnRzTW9kZWwgfSBmcm9tICcuL2NvbW1lbnRzTW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyLCBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtLCBnZXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkQ29tbWVudFRocmVhZCwgTWFyc2hhbGxlZENvbW1lbnRUaHJlYWRJbnRlcm5hbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb21tZW50cy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5cbmV4cG9ydCBjb25zdCBDT01NRU5UU19WSUVXX0lEID0gJ3dvcmtiZW5jaC5wYW5lbC5jb21tZW50cyc7XG5leHBvcnQgY29uc3QgQ09NTUVOVFNfVklFV19TVE9SQUdFX0lEID0gJ0NvbW1lbnRzJztcbmV4cG9ydCBjb25zdCBDT01NRU5UU19WSUVXX1RJVExFOiBJTG9jYWxpemVkU3RyaW5nID0gbmxzLmxvY2FsaXplMignY29tbWVudHMudmlldy50aXRsZScsIFwiQ29tbWVudHNcIik7XG5cbmludGVyZmFjZSBJUmVzb3VyY2VUZW1wbGF0ZURhdGEge1xuXHRyZXNvdXJjZUxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcblx0c2VwYXJhdG9yOiBIVE1MRWxlbWVudDtcblx0b3duZXI6IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSUNvbW1lbnRUaHJlYWRUZW1wbGF0ZURhdGEge1xuXHR0aHJlYWRNZXRhZGF0YToge1xuXHRcdHJlbGV2YW5jZTogSFRNTEVsZW1lbnQ7XG5cdFx0aWNvbjogSFRNTEVsZW1lbnQ7XG5cdFx0dXNlck5hbWVzOiBIVE1MU3BhbkVsZW1lbnQ7XG5cdFx0dGltZXN0YW1wOiBUaW1lc3RhbXBXaWRnZXQ7XG5cdFx0c2VwYXJhdG9yOiBIVE1MRWxlbWVudDtcblx0XHRjb21tZW50UHJldmlldzogSFRNTFNwYW5FbGVtZW50O1xuXHRcdHJhbmdlOiBIVE1MRWxlbWVudDtcblx0fTtcblx0cmVwbGllc01ldGFkYXRhOiB7XG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0XHRpY29uOiBIVE1MRWxlbWVudDtcblx0XHRjb3VudDogSFRNTFNwYW5FbGVtZW50O1xuXHRcdGxhc3RSZXBseURldGFpbDogSFRNTFNwYW5FbGVtZW50O1xuXHRcdHNlcGFyYXRvcjogSFRNTEVsZW1lbnQ7XG5cdFx0dGltZXN0YW1wOiBUaW1lc3RhbXBXaWRnZXQ7XG5cdH07XG5cdGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRkaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXTtcblx0ZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmNsYXNzIENvbW1lbnRzTW9kZWxWaXJ0dWFsRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcyB8IENvbW1lbnROb2RlPiB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFU09VUkNFX0lEID0gJ3Jlc291cmNlLXdpdGgtY29tbWVudHMnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDT01NRU5UX0lEID0gJ2NvbW1lbnQtbm9kZSc7XG5cblxuXHRnZXRIZWlnaHQoZWxlbWVudDogYW55KTogbnVtYmVyIHtcblx0XHRpZiAoKGVsZW1lbnQgaW5zdGFuY2VvZiBDb21tZW50Tm9kZSkgJiYgZWxlbWVudC5oYXNSZXBseSgpKSB7XG5cdFx0XHRyZXR1cm4gNDQ7XG5cdFx0fVxuXHRcdHJldHVybiAyMjtcblx0fVxuXG5cdHB1YmxpYyBnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IGFueSk6IHN0cmluZyB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcykge1xuXHRcdFx0cmV0dXJuIENvbW1lbnRzTW9kZWxWaXJ0dWFsRGVsZWdhdGUuUkVTT1VSQ0VfSUQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQ29tbWVudE5vZGUpIHtcblx0XHRcdHJldHVybiBDb21tZW50c01vZGVsVmlydHVhbERlbGVnYXRlLkNPTU1FTlRfSUQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICcnO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXNvdXJjZVdpdGhDb21tZW50c1JlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJVHJlZU5vZGU8UmVzb3VyY2VXaXRoQ29tbWVudFRocmVhZHM+LCBJUmVzb3VyY2VUZW1wbGF0ZURhdGE+IHtcblx0dGVtcGxhdGVJZDogc3RyaW5nID0gJ3Jlc291cmNlLXdpdGgtY29tbWVudHMnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgbGFiZWxzOiBSZXNvdXJjZUxhYmVsc1xuXHQpIHtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHRjb25zdCBsYWJlbENvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnJlc291cmNlLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCByZXNvdXJjZUxhYmVsID0gdGhpcy5sYWJlbHMuY3JlYXRlKGxhYmVsQ29udGFpbmVyKTtcblx0XHRjb25zdCBzZXBhcmF0b3IgPSBkb20uYXBwZW5kKGxhYmVsQ29udGFpbmVyLCBkb20uJCgnLnNlcGFyYXRvcicpKTtcblx0XHRjb25zdCBvd25lciA9IGxhYmVsQ29udGFpbmVyLmFwcGVuZENoaWxkKGRvbS4kKCcub3duZXInKSk7XG5cblx0XHRyZXR1cm4geyByZXNvdXJjZUxhYmVsLCBvd25lciwgc2VwYXJhdG9yIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcz4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVJlc291cmNlVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnJlc291cmNlTGFiZWwuc2V0RmlsZShub2RlLmVsZW1lbnQucmVzb3VyY2UpO1xuXHRcdHRlbXBsYXRlRGF0YS5zZXBhcmF0b3IuaW5uZXJUZXh0ID0gJ1xcdTAwYjcnO1xuXG5cdFx0aWYgKG5vZGUuZWxlbWVudC5vd25lckxhYmVsKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEub3duZXIuaW5uZXJUZXh0ID0gbm9kZS5lbGVtZW50Lm93bmVyTGFiZWw7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuc2VwYXJhdG9yLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLm93bmVyLmlubmVyVGV4dCA9ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnNlcGFyYXRvci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElSZXNvdXJjZVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5yZXNvdXJjZUxhYmVsLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29tbWVudHNNZW51cyBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlXG5cdCkgeyB9XG5cblx0Z2V0UmVzb3VyY2VBY3Rpb25zKGVsZW1lbnQ6IENvbW1lbnROb2RlKTogeyBhY3Rpb25zOiBJQWN0aW9uW10gfSB7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuZ2V0QWN0aW9ucyhNZW51SWQuQ29tbWVudHNWaWV3VGhyZWFkQWN0aW9ucywgZWxlbWVudCk7XG5cdFx0cmV0dXJuIHsgYWN0aW9uczogYWN0aW9ucy5wcmltYXJ5IH07XG5cdH1cblxuXHRnZXRSZXNvdXJjZUNvbnRleHRBY3Rpb25zKGVsZW1lbnQ6IENvbW1lbnROb2RlKTogSUFjdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRBY3Rpb25zKE1lbnVJZC5Db21tZW50c1ZpZXdUaHJlYWRBY3Rpb25zLCBlbGVtZW50KS5zZWNvbmRhcnk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q29udGV4dEtleVNlcnZpY2Uoc2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZSA9IHNlcnZpY2U7XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGlvbnMobWVudUlkOiBNZW51SWQsIGVsZW1lbnQ6IENvbW1lbnROb2RlKTogeyBwcmltYXJ5OiBJQWN0aW9uW107IHNlY29uZGFyeTogSUFjdGlvbltdIH0ge1xuXHRcdGlmICghdGhpcy5jb250ZXh0S2V5U2VydmljZSkge1xuXHRcdFx0cmV0dXJuIHsgcHJpbWFyeTogW10sIHNlY29uZGFyeTogW10gfTtcblx0XHR9XG5cblx0XHRjb25zdCBvdmVybGF5OiBbc3RyaW5nLCBhbnldW10gPSBbXG5cdFx0XHRbJ2NvbW1lbnRDb250cm9sbGVyJywgZWxlbWVudC5vd25lcl0sXG5cdFx0XHRbJ3Jlc291cmNlU2NoZW1lJywgZWxlbWVudC5yZXNvdXJjZS5zY2hlbWVdLFxuXHRcdFx0Wydjb21tZW50VGhyZWFkJywgZWxlbWVudC5jb250ZXh0VmFsdWVdLFxuXHRcdFx0WydjYW5SZXBseScsIGVsZW1lbnQudGhyZWFkLmNhblJlcGx5XVxuXHRcdF07XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkob3ZlcmxheSk7XG5cblx0XHRjb25zdCBtZW51ID0gdGhpcy5tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhtZW51SWQsIGNvbnRleHRLZXlTZXJ2aWNlLCB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pO1xuXHRcdHJldHVybiBnZXRDb250ZXh0TWVudUFjdGlvbnMobWVudSwgJ2lubGluZScpO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlID0gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb21tZW50Tm9kZVJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJVHJlZU5vZGU8Q29tbWVudE5vZGU+LCBJQ29tbWVudFRocmVhZFRlbXBsYXRlRGF0YT4ge1xuXHR0ZW1wbGF0ZUlkOiBzdHJpbmcgPSAnY29tbWVudC1ub2RlJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyLFxuXHRcdHByaXZhdGUgbWVudXM6IENvbW1lbnRzTWVudXMsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2Vcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29uc3QgdGhyZWFkQ29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuY29tbWVudC10aHJlYWQtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IG1ldGFkYXRhQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0aHJlYWRDb250YWluZXIsIGRvbS4kKCcuY29tbWVudC1tZXRhZGF0YS1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBkb20uYXBwZW5kKG1ldGFkYXRhQ29udGFpbmVyLCBkb20uJCgnLmNvbW1lbnQtbWV0YWRhdGEnKSk7XG5cblx0XHRjb25zdCBpY29uID0gZG9tLmFwcGVuZChtZXRhZGF0YSwgZG9tLiQoJy5pY29uJykpO1xuXHRcdGNvbnN0IHVzZXJOYW1lcyA9IGRvbS5hcHBlbmQobWV0YWRhdGEsIGRvbS4kKCcudXNlcicpKTtcblx0XHRjb25zdCB0aW1lc3RhbXAgPSBuZXcgVGltZXN0YW1wV2lkZ2V0KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuaG92ZXJTZXJ2aWNlLCBkb20uYXBwZW5kKG1ldGFkYXRhLCBkb20uJCgnLnRpbWVzdGFtcC1jb250YWluZXInKSkpO1xuXHRcdGNvbnN0IHJlbGV2YW5jZSA9IGRvbS5hcHBlbmQobWV0YWRhdGEsIGRvbS4kKCcucmVsZXZhbmNlJykpO1xuXHRcdGNvbnN0IHNlcGFyYXRvciA9IGRvbS5hcHBlbmQobWV0YWRhdGEsIGRvbS4kKCcuc2VwYXJhdG9yJykpO1xuXHRcdGNvbnN0IGNvbW1lbnRQcmV2aWV3ID0gZG9tLmFwcGVuZChtZXRhZGF0YSwgZG9tLiQoJy50ZXh0JykpO1xuXHRcdGNvbnN0IHJhbmdlQ29udGFpbmVyID0gZG9tLmFwcGVuZChtZXRhZGF0YSwgZG9tLiQoJy5yYW5nZScpKTtcblx0XHRjb25zdCByYW5nZSA9IGRvbS4kKCdwJyk7XG5cdFx0cmFuZ2VDb250YWluZXIuYXBwZW5kQ2hpbGQocmFuZ2UpO1xuXG5cdFx0Y29uc3QgdGhyZWFkTWV0YWRhdGEgPSB7XG5cdFx0XHRpY29uLFxuXHRcdFx0dXNlck5hbWVzLFxuXHRcdFx0dGltZXN0YW1wLFxuXHRcdFx0cmVsZXZhbmNlLFxuXHRcdFx0c2VwYXJhdG9yLFxuXHRcdFx0Y29tbWVudFByZXZpZXcsXG5cdFx0XHRyYW5nZVxuXHRcdH07XG5cdFx0dGhyZWFkTWV0YWRhdGEuc2VwYXJhdG9yLmlubmVyVGV4dCA9ICdcXHUwMGI3JztcblxuXHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSBkb20uYXBwZW5kKG1ldGFkYXRhQ29udGFpbmVyLCBkb20uJCgnLmFjdGlvbnMnKSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihhY3Rpb25zQ29udGFpbmVyLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiB0aGlzLmFjdGlvblZpZXdJdGVtUHJvdmlkZXJcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNuaXBwZXRDb250YWluZXIgPSBkb20uYXBwZW5kKHRocmVhZENvbnRhaW5lciwgZG9tLiQoJy5jb21tZW50LXNuaXBwZXQtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHJlcGxpZXNNZXRhZGF0YSA9IHtcblx0XHRcdGNvbnRhaW5lcjogc25pcHBldENvbnRhaW5lcixcblx0XHRcdGljb246IGRvbS5hcHBlbmQoc25pcHBldENvbnRhaW5lciwgZG9tLiQoJy5pY29uJykpLFxuXHRcdFx0Y291bnQ6IGRvbS5hcHBlbmQoc25pcHBldENvbnRhaW5lciwgZG9tLiQoJy5jb3VudCcpKSxcblx0XHRcdGxhc3RSZXBseURldGFpbDogZG9tLmFwcGVuZChzbmlwcGV0Q29udGFpbmVyLCBkb20uJCgnLnJlcGx5LWRldGFpbCcpKSxcblx0XHRcdHNlcGFyYXRvcjogZG9tLmFwcGVuZChzbmlwcGV0Q29udGFpbmVyLCBkb20uJCgnLnNlcGFyYXRvcicpKSxcblx0XHRcdHRpbWVzdGFtcDogbmV3IFRpbWVzdGFtcFdpZGdldCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmhvdmVyU2VydmljZSwgZG9tLmFwcGVuZChzbmlwcGV0Q29udGFpbmVyLCBkb20uJCgnLnRpbWVzdGFtcC1jb250YWluZXInKSkpLFxuXHRcdH07XG5cdFx0cmVwbGllc01ldGFkYXRhLnNlcGFyYXRvci5pbm5lclRleHQgPSAnXFx1MDBiNyc7XG5cdFx0cmVwbGllc01ldGFkYXRhLmljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmluZGVudCkpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBbdGhyZWFkTWV0YWRhdGEudGltZXN0YW1wLCByZXBsaWVzTWV0YWRhdGEudGltZXN0YW1wXTtcblx0XHRyZXR1cm4geyB0aHJlYWRNZXRhZGF0YSwgcmVwbGllc01ldGFkYXRhLCBhY3Rpb25CYXIsIGRpc3Bvc2FibGVzLCBlbGVtZW50RGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb3VudFN0cmluZyhjb21tZW50Q291bnQ6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0aWYgKGNvbW1lbnRDb3VudCA+IDIpIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2NvbW1lbnRzQ291bnRSZXBsaWVzJywgXCJ7MH0gcmVwbGllc1wiLCBjb21tZW50Q291bnQgLSAxKTtcblx0XHR9IGVsc2UgaWYgKGNvbW1lbnRDb3VudCA9PT0gMikge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnY29tbWVudHNDb3VudFJlcGx5JywgXCIxIHJlcGx5XCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdjb21tZW50Q291bnQnLCBcIjEgY29tbWVudFwiKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFJlbmRlcmVkQ29tbWVudChjb21tZW50Qm9keTogSU1hcmtkb3duU3RyaW5nKSB7XG5cdFx0Y29uc3QgcmVuZGVyZWRDb21tZW50ID0gcmVuZGVyTWFya2Rvd24oY29tbWVudEJvZHksIHt9LCBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJykpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGltYWdlcyA9IHJlbmRlcmVkQ29tbWVudC5lbGVtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdpbWcnKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGltYWdlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgaW1hZ2UgPSBpbWFnZXNbaV07XG5cdFx0XHRjb25zdCB0ZXh0RGVzY3JpcHRpb24gPSBkb20uJCgnJyk7XG5cdFx0XHR0ZXh0RGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSBpbWFnZS5hbHQgPyBubHMubG9jYWxpemUoJ2ltYWdlV2l0aExhYmVsJywgXCJJbWFnZTogezB9XCIsIGltYWdlLmFsdCkgOiBubHMubG9jYWxpemUoJ2ltYWdlJywgXCJJbWFnZVwiKTtcblx0XHRcdGltYWdlLnJlcGxhY2VXaXRoKHRleHREZXNjcmlwdGlvbik7XG5cdFx0fVxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGhlYWRpbmdzID0gWy4uLnJlbmRlcmVkQ29tbWVudC5lbGVtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdoMScpLCAuLi5yZW5kZXJlZENvbW1lbnQuZWxlbWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaDInKSwgLi4ucmVuZGVyZWRDb21tZW50LmVsZW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2gzJyksIC4uLnJlbmRlcmVkQ29tbWVudC5lbGVtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdoNCcpLCAuLi5yZW5kZXJlZENvbW1lbnQuZWxlbWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaDUnKSwgLi4ucmVuZGVyZWRDb21tZW50LmVsZW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2g2JyldO1xuXHRcdGZvciAoY29uc3QgaGVhZGluZyBvZiBoZWFkaW5ncykge1xuXHRcdFx0Y29uc3QgdGV4dE5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShoZWFkaW5nLnRleHRDb250ZW50IHx8ICcnKTtcblx0XHRcdGhlYWRpbmcucmVwbGFjZVdpdGgodGV4dE5vZGUpO1xuXHRcdH1cblx0XHR3aGlsZSAoKHJlbmRlcmVkQ29tbWVudC5lbGVtZW50LmNoaWxkcmVuLmxlbmd0aCA+IDEpICYmIChyZW5kZXJlZENvbW1lbnQuZWxlbWVudC5maXJzdEVsZW1lbnRDaGlsZD8udGFnTmFtZSA9PT0gJ0hSJykpIHtcblx0XHRcdHJlbmRlcmVkQ29tbWVudC5lbGVtZW50LnJlbW92ZUNoaWxkKHJlbmRlcmVkQ29tbWVudC5lbGVtZW50LmZpcnN0RWxlbWVudENoaWxkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlbmRlcmVkQ29tbWVudDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SWNvbih0aHJlYWRTdGF0ZT86IENvbW1lbnRUaHJlYWRTdGF0ZSwgaGFzRHJhZnQ/OiBib29sZWFuKTogVGhlbWVJY29uIHtcblx0XHQvLyBQcmlvcml0eTogZHJhZnQgPiB1bnJlc29sdmVkID4gcmVzb2x2ZWRcblx0XHRpZiAoaGFzRHJhZnQpIHtcblx0XHRcdHJldHVybiBDb2RpY29uLmNvbW1lbnREcmFmdDtcblx0XHR9IGVsc2UgaWYgKHRocmVhZFN0YXRlID09PSBDb21tZW50VGhyZWFkU3RhdGUuVW5yZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuIENvZGljb24uY29tbWVudFVucmVzb2x2ZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBDb2RpY29uLmNvbW1lbnQ7XG5cdFx0fVxuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8Q29tbWVudE5vZGU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDb21tZW50VGhyZWFkVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXG5cdFx0Y29uc3QgY29tbWVudENvdW50ID0gbm9kZS5lbGVtZW50LnJlcGxpZXMubGVuZ3RoICsgMTtcblx0XHRpZiAobm9kZS5lbGVtZW50LnRocmVhZFJlbGV2YW5jZSA9PT0gQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkuT3V0ZGF0ZWQpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS5yZWxldmFuY2Uuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRocmVhZE1ldGFkYXRhLnJlbGV2YW5jZS5pbm5lclRleHQgPSBubHMubG9jYWxpemUoJ291dGRhdGVkJywgXCJPdXRkYXRlZFwiKTtcblx0XHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS5zZXBhcmF0b3Iuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRocmVhZE1ldGFkYXRhLnJlbGV2YW5jZS5pbm5lclRleHQgPSAnJztcblx0XHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS5yZWxldmFuY2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS5zZXBhcmF0b3Iuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS5pY29uLmNsYXNzTGlzdC5yZW1vdmUoLi4uQXJyYXkuZnJvbSh0ZW1wbGF0ZURhdGEudGhyZWFkTWV0YWRhdGEuaWNvbi5jbGFzc0xpc3QudmFsdWVzKCkpXG5cdFx0XHQuZmlsdGVyKHZhbHVlID0+IHZhbHVlLnN0YXJ0c1dpdGgoJ2NvZGljb24nKSkpO1xuXHRcdC8vIENoZWNrIGlmIGFueSBjb21tZW50IGluIHRoZSB0aHJlYWQgaGFzIGRyYWZ0IHN0YXRlXG5cdFx0Y29uc3QgaGFzRHJhZnQgPSBub2RlLmVsZW1lbnQudGhyZWFkLmNvbW1lbnRzPy5zb21lKGNvbW1lbnQgPT4gY29tbWVudC5zdGF0ZSA9PT0gQ29tbWVudFN0YXRlLkRyYWZ0KTtcblx0XHR0ZW1wbGF0ZURhdGEudGhyZWFkTWV0YWRhdGEuaWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHRoaXMuZ2V0SWNvbihub2RlLmVsZW1lbnQudGhyZWFkU3RhdGUsIGhhc0RyYWZ0KSkpO1xuXHRcdGlmIChub2RlLmVsZW1lbnQudGhyZWFkU3RhdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgY29sb3IgPSB0aGlzLmdldENvbW1lbnRUaHJlYWRXaWRnZXRTdGF0ZUNvbG9yKG5vZGUuZWxlbWVudC50aHJlYWRTdGF0ZSwgdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpKTtcblx0XHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS5pY29uLnN0eWxlLnNldFByb3BlcnR5KGNvbW1lbnRWaWV3VGhyZWFkU3RhdGVDb2xvclZhciwgYCR7Y29sb3J9YCk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGhyZWFkTWV0YWRhdGEuaWNvbi5zdHlsZS5jb2xvciA9IGB2YXIoJHtjb21tZW50Vmlld1RocmVhZFN0YXRlQ29sb3JWYXJ9KWA7XG5cdFx0fVxuXHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS51c2VyTmFtZXMudGV4dENvbnRlbnQgPSBub2RlLmVsZW1lbnQuY29tbWVudC51c2VyTmFtZTtcblx0XHR0ZW1wbGF0ZURhdGEudGhyZWFkTWV0YWRhdGEudGltZXN0YW1wLnNldFRpbWVzdGFtcChub2RlLmVsZW1lbnQuY29tbWVudC50aW1lc3RhbXAgPyBuZXcgRGF0ZShub2RlLmVsZW1lbnQuY29tbWVudC50aW1lc3RhbXApIDogdW5kZWZpbmVkKTtcblx0XHRjb25zdCBvcmlnaW5hbENvbW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cblx0XHR0ZW1wbGF0ZURhdGEudGhyZWFkTWV0YWRhdGEuY29tbWVudFByZXZpZXcuaW5uZXJUZXh0ID0gJyc7XG5cdFx0dGVtcGxhdGVEYXRhLnRocmVhZE1ldGFkYXRhLmNvbW1lbnRQcmV2aWV3LnN0eWxlLmhlaWdodCA9ICcyMnB4Jztcblx0XHRpZiAodHlwZW9mIG9yaWdpbmFsQ29tbWVudC5jb21tZW50LmJvZHkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGhyZWFkTWV0YWRhdGEuY29tbWVudFByZXZpZXcuaW5uZXJUZXh0ID0gb3JpZ2luYWxDb21tZW50LmNvbW1lbnQuYm9keTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcmVuZGVyZWRDb21tZW50ID0gdGhpcy5nZXRSZW5kZXJlZENvbW1lbnQob3JpZ2luYWxDb21tZW50LmNvbW1lbnQuYm9keSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChyZW5kZXJlZENvbW1lbnQpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IHJlbmRlcmVkQ29tbWVudC5lbGVtZW50LmNoaWxkcmVuLmxlbmd0aCAtIDE7IGkgPj0gMTsgaS0tKSB7XG5cdFx0XHRcdHJlbmRlcmVkQ29tbWVudC5lbGVtZW50LnJlbW92ZUNoaWxkKHJlbmRlcmVkQ29tbWVudC5lbGVtZW50LmNoaWxkcmVuW2ldKTtcblx0XHRcdH1cblx0XHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS5jb21tZW50UHJldmlldy5hcHBlbmRDaGlsZChyZW5kZXJlZENvbW1lbnQuZWxlbWVudCk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGVtcGxhdGVEYXRhLnRocmVhZE1ldGFkYXRhLmNvbW1lbnRQcmV2aWV3LCByZW5kZXJlZENvbW1lbnQuZWxlbWVudC50ZXh0Q29udGVudCA/PyAnJykpO1xuXHRcdH1cblxuXHRcdGlmIChub2RlLmVsZW1lbnQucmFuZ2UpIHtcblx0XHRcdGlmIChub2RlLmVsZW1lbnQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBub2RlLmVsZW1lbnQucmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEudGhyZWFkTWV0YWRhdGEucmFuZ2UudGV4dENvbnRlbnQgPSBubHMubG9jYWxpemUoJ2NvbW1lbnRMaW5lJywgXCJbTG4gezB9XVwiLCBub2RlLmVsZW1lbnQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS5yYW5nZS50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnY29tbWVudFJhbmdlJywgXCJbTG4gezB9LXsxfV1cIiwgbm9kZS5lbGVtZW50LnJhbmdlLnN0YXJ0TGluZU51bWJlciwgbm9kZS5lbGVtZW50LnJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1lbnVBY3Rpb25zID0gdGhpcy5tZW51cy5nZXRSZXNvdXJjZUFjdGlvbnMobm9kZS5lbGVtZW50KTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2gobWVudUFjdGlvbnMuYWN0aW9ucywgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jb250ZXh0ID0ge1xuXHRcdFx0Y29tbWVudENvbnRyb2xIYW5kbGU6IG5vZGUuZWxlbWVudC5jb250cm9sbGVySGFuZGxlLFxuXHRcdFx0Y29tbWVudFRocmVhZEhhbmRsZTogbm9kZS5lbGVtZW50LnRocmVhZEhhbmRsZSxcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Db21tZW50VGhyZWFkXG5cdFx0fSBzYXRpc2ZpZXMgTWFyc2hhbGxlZENvbW1lbnRUaHJlYWQ7XG5cblx0XHRpZiAoIW5vZGUuZWxlbWVudC5oYXNSZXBseSgpKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucmVwbGllc01ldGFkYXRhLmNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5yZXBsaWVzTWV0YWRhdGEuY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0ZW1wbGF0ZURhdGEucmVwbGllc01ldGFkYXRhLmNvdW50LnRleHRDb250ZW50ID0gdGhpcy5nZXRDb3VudFN0cmluZyhjb21tZW50Q291bnQpO1xuXHRcdGNvbnN0IGxhc3RDb21tZW50ID0gbm9kZS5lbGVtZW50LnJlcGxpZXNbbm9kZS5lbGVtZW50LnJlcGxpZXMubGVuZ3RoIC0gMV0uY29tbWVudDtcblx0XHR0ZW1wbGF0ZURhdGEucmVwbGllc01ldGFkYXRhLmxhc3RSZXBseURldGFpbC50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnbGFzdFJlcGx5RnJvbScsIFwiTGFzdCByZXBseSBmcm9tIHswfVwiLCBsYXN0Q29tbWVudC51c2VyTmFtZSk7XG5cdFx0dGVtcGxhdGVEYXRhLnJlcGxpZXNNZXRhZGF0YS50aW1lc3RhbXAuc2V0VGltZXN0YW1wKGxhc3RDb21tZW50LnRpbWVzdGFtcCA/IG5ldyBEYXRlKGxhc3RDb21tZW50LnRpbWVzdGFtcCkgOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb21tZW50VGhyZWFkV2lkZ2V0U3RhdGVDb2xvcihzdGF0ZTogQ29tbWVudFRocmVhZFN0YXRlIHwgdW5kZWZpbmVkLCB0aGVtZTogSUNvbG9yVGhlbWUpOiBDb2xvciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIChzdGF0ZSAhPT0gdW5kZWZpbmVkKSA/IGdldENvbW1lbnRUaHJlYWRTdGF0ZUljb25Db2xvcihzdGF0ZSwgdGhlbWUpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoX25vZGU6IElUcmVlTm9kZTxDb21tZW50Tm9kZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDb21tZW50VGhyZWFkVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUNvbW1lbnRUaHJlYWRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZm9yRWFjaChkaXNwb3NlYWJsZSA9PiBkaXNwb3NlYWJsZS5kaXNwb3NlKCkpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1lbnRzTGlzdE9wdGlvbnMgZXh0ZW5kcyBJV29ya2JlbmNoQXN5bmNEYXRhVHJlZU9wdGlvbnM8YW55LCBhbnk+IHtcblx0b3ZlcnJpZGVTdHlsZXM/OiBJU3R5bGVPdmVycmlkZTxJTGlzdFN0eWxlcz47XG59XG5cbmNvbnN0IGVudW0gRmlsdGVyRGF0YVR5cGUge1xuXHRSZXNvdXJjZSxcblx0Q29tbWVudFxufVxuXG5pbnRlcmZhY2UgUmVzb3VyY2VGaWx0ZXJEYXRhIHtcblx0dHlwZTogRmlsdGVyRGF0YVR5cGUuUmVzb3VyY2U7XG5cdHVyaU1hdGNoZXM6IElNYXRjaFtdO1xufVxuXG5pbnRlcmZhY2UgQ29tbWVudEZpbHRlckRhdGEge1xuXHR0eXBlOiBGaWx0ZXJEYXRhVHlwZS5Db21tZW50O1xuXHR0ZXh0TWF0Y2hlczogSU1hdGNoW107XG59XG5cbnR5cGUgRmlsdGVyRGF0YSA9IFJlc291cmNlRmlsdGVyRGF0YSB8IENvbW1lbnRGaWx0ZXJEYXRhO1xuXG5leHBvcnQgY2xhc3MgRmlsdGVyIGltcGxlbWVudHMgSVRyZWVGaWx0ZXI8UmVzb3VyY2VXaXRoQ29tbWVudFRocmVhZHMgfCBDb21tZW50Tm9kZSwgRmlsdGVyRGF0YT4ge1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBvcHRpb25zOiBGaWx0ZXJPcHRpb25zKSB7IH1cblxuXHRmaWx0ZXIoZWxlbWVudDogUmVzb3VyY2VXaXRoQ29tbWVudFRocmVhZHMgfCBDb21tZW50Tm9kZSwgcGFyZW50VmlzaWJpbGl0eTogVHJlZVZpc2liaWxpdHkpOiBUcmVlRmlsdGVyUmVzdWx0PEZpbHRlckRhdGE+IHtcblx0XHRpZiAodGhpcy5vcHRpb25zLmZpbHRlciA9PT0gJycgJiYgdGhpcy5vcHRpb25zLnNob3dSZXNvbHZlZCAmJiB0aGlzLm9wdGlvbnMuc2hvd1VucmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybiBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgUmVzb3VyY2VXaXRoQ29tbWVudFRocmVhZHMpIHtcblx0XHRcdHJldHVybiB0aGlzLmZpbHRlclJlc291cmNlTWFya2VycyhlbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuZmlsdGVyQ29tbWVudE5vZGUoZWxlbWVudCwgcGFyZW50VmlzaWJpbGl0eSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJSZXNvdXJjZU1hcmtlcnMocmVzb3VyY2VNYXJrZXJzOiBSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcyk6IFRyZWVGaWx0ZXJSZXN1bHQ8RmlsdGVyRGF0YT4ge1xuXHRcdC8vIEZpbHRlciBieSB0ZXh0LiBEbyBub3QgYXBwbHkgbmVnYXRlZCBmaWx0ZXJzIG9uIHJlc291cmNlcyBpbnN0ZWFkIHVzZSBleGNsdWRlIHBhdHRlcm5zXG5cdFx0aWYgKHRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLnRleHQgJiYgIXRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLm5lZ2F0ZSkge1xuXHRcdFx0Y29uc3QgdXJpTWF0Y2hlcyA9IEZpbHRlck9wdGlvbnMuX2ZpbHRlcih0aGlzLm9wdGlvbnMudGV4dEZpbHRlci50ZXh0LCBiYXNlbmFtZShyZXNvdXJjZU1hcmtlcnMucmVzb3VyY2UpKTtcblx0XHRcdGlmICh1cmlNYXRjaGVzKSB7XG5cdFx0XHRcdHJldHVybiB7IHZpc2liaWxpdHk6IHRydWUsIGRhdGE6IHsgdHlwZTogRmlsdGVyRGF0YVR5cGUuUmVzb3VyY2UsIHVyaU1hdGNoZXM6IHVyaU1hdGNoZXMgfHwgW10gfSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJDb21tZW50Tm9kZShjb21tZW50OiBDb21tZW50Tm9kZSwgcGFyZW50VmlzaWJpbGl0eTogVHJlZVZpc2liaWxpdHkpOiBUcmVlRmlsdGVyUmVzdWx0PEZpbHRlckRhdGE+IHtcblx0XHRjb25zdCBtYXRjaGVzUmVzb2x2ZWRTdGF0ZSA9IChjb21tZW50LnRocmVhZFN0YXRlID09PSB1bmRlZmluZWQpIHx8ICh0aGlzLm9wdGlvbnMuc2hvd1Jlc29sdmVkICYmIENvbW1lbnRUaHJlYWRTdGF0ZS5SZXNvbHZlZCA9PT0gY29tbWVudC50aHJlYWRTdGF0ZSkgfHxcblx0XHRcdCh0aGlzLm9wdGlvbnMuc2hvd1VucmVzb2x2ZWQgJiYgQ29tbWVudFRocmVhZFN0YXRlLlVucmVzb2x2ZWQgPT09IGNvbW1lbnQudGhyZWFkU3RhdGUpO1xuXG5cdFx0aWYgKCFtYXRjaGVzUmVzb2x2ZWRTdGF0ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5vcHRpb25zLnRleHRGaWx0ZXIudGV4dCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dE1hdGNoZXMgPVxuXHRcdFx0Ly8gQ2hlY2sgYm9keSBvZiBjb21tZW50IGZvciB2YWx1ZVxuXHRcdFx0RmlsdGVyT3B0aW9ucy5fbWVzc2FnZUZpbHRlcih0aGlzLm9wdGlvbnMudGV4dEZpbHRlci50ZXh0LCB0eXBlb2YgY29tbWVudC5jb21tZW50LmJvZHkgPT09ICdzdHJpbmcnID8gY29tbWVudC5jb21tZW50LmJvZHkgOiBjb21tZW50LmNvbW1lbnQuYm9keS52YWx1ZSlcblx0XHRcdC8vIENoZWNrIGZpcnN0IHVzZXIgZm9yIHZhbHVlXG5cdFx0XHR8fCBGaWx0ZXJPcHRpb25zLl9tZXNzYWdlRmlsdGVyKHRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLnRleHQsIGNvbW1lbnQuY29tbWVudC51c2VyTmFtZSlcblx0XHRcdC8vIENoZWNrIGFsbCByZXBsaWVzIGZvciB2YWx1ZVxuXHRcdFx0fHwgKGNvbW1lbnQucmVwbGllcy5tYXAocmVwbHkgPT4ge1xuXHRcdFx0XHQvLyBDaGVjayB1c2VyIGZvciB2YWx1ZVxuXHRcdFx0XHRyZXR1cm4gRmlsdGVyT3B0aW9ucy5fbWVzc2FnZUZpbHRlcih0aGlzLm9wdGlvbnMudGV4dEZpbHRlci50ZXh0LCByZXBseS5jb21tZW50LnVzZXJOYW1lKVxuXHRcdFx0XHRcdC8vIENoZWNrIGJvZHkgb2YgcmVwbHkgZm9yIHZhbHVlXG5cdFx0XHRcdFx0fHwgRmlsdGVyT3B0aW9ucy5fbWVzc2FnZUZpbHRlcih0aGlzLm9wdGlvbnMudGV4dEZpbHRlci50ZXh0LCB0eXBlb2YgcmVwbHkuY29tbWVudC5ib2R5ID09PSAnc3RyaW5nJyA/IHJlcGx5LmNvbW1lbnQuYm9keSA6IHJlcGx5LmNvbW1lbnQuYm9keS52YWx1ZSk7XG5cdFx0XHR9KS5maWx0ZXIodmFsdWUgPT4gISF2YWx1ZSkgYXMgSU1hdGNoW11bXSkuZmxhdCgpO1xuXG5cdFx0Ly8gTWF0Y2hlZCBhbmQgbm90IG5lZ2F0ZWRcblx0XHRpZiAodGV4dE1hdGNoZXMubGVuZ3RoICYmICF0aGlzLm9wdGlvbnMudGV4dEZpbHRlci5uZWdhdGUpIHtcblx0XHRcdHJldHVybiB7IHZpc2liaWxpdHk6IHRydWUsIGRhdGE6IHsgdHlwZTogRmlsdGVyRGF0YVR5cGUuQ29tbWVudCwgdGV4dE1hdGNoZXMgfSB9O1xuXHRcdH1cblxuXHRcdC8vIE1hdGNoZWQgYW5kIG5lZ2F0ZWQgLSBleGNsdWRlIGl0IG9ubHkgaWYgcGFyZW50IHZpc2liaWxpdHkgaXMgbm90IHNldFxuXHRcdGlmICh0ZXh0TWF0Y2hlcy5sZW5ndGggJiYgdGhpcy5vcHRpb25zLnRleHRGaWx0ZXIubmVnYXRlICYmIHBhcmVudFZpc2liaWxpdHkgPT09IFRyZWVWaXNpYmlsaXR5LlJlY3Vyc2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBOb3QgbWF0Y2hlZCBhbmQgbmVnYXRlZCAtIGluY2x1ZGUgaXQgb25seSBpZiBwYXJlbnQgdmlzaWJpbGl0eSBpcyBub3Qgc2V0XG5cdFx0aWYgKCh0ZXh0TWF0Y2hlcy5sZW5ndGggPT09IDApICYmIHRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLm5lZ2F0ZSAmJiBwYXJlbnRWaXNpYmlsaXR5ID09PSBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGFyZW50VmlzaWJpbGl0eTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29tbWVudHNMaXN0IGV4dGVuZHMgV29ya2JlbmNoT2JqZWN0VHJlZTxDb21tZW50c01vZGVsIHwgUmVzb3VyY2VXaXRoQ29tbWVudFRocmVhZHMgfCBDb21tZW50Tm9kZSwgYW55PiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWVudXM6IENvbW1lbnRzTWVudXM7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdG9wdGlvbnM6IElDb21tZW50c0xpc3RPcHRpb25zLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxpc3RTZXJ2aWNlIGxpc3RTZXJ2aWNlOiBJTGlzdFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZVxuXHQpIHtcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBDb21tZW50c01vZGVsVmlydHVhbERlbGVnYXRlKCk7XG5cdFx0Y29uc3QgYWN0aW9uVmlld0l0ZW1Qcm92aWRlciA9IGNyZWF0ZUFjdGlvblZpZXdJdGVtLmJpbmQodW5kZWZpbmVkLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgbWVudXMgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tZW50c01lbnVzKTtcblx0XHRtZW51cy5zZXRDb250ZXh0S2V5U2VydmljZShjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgcmVuZGVyZXJzID0gW1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VXaXRoQ29tbWVudHNSZW5kZXJlciwgbGFiZWxzKSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1lbnROb2RlUmVuZGVyZXIsIGFjdGlvblZpZXdJdGVtUHJvdmlkZXIsIG1lbnVzKVxuXHRcdF07XG5cblx0XHRzdXBlcihcblx0XHRcdCdDb21tZW50c1RyZWUnLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRyZW5kZXJlcnMsXG5cdFx0XHR7XG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIsXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZDogKGVsZW1lbnQ6IGFueSkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBDb21tZW50c01vZGVsKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiAncm9vdCc7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBgJHtlbGVtZW50LnVuaXF1ZU93bmVyfS0ke2VsZW1lbnQuaWR9YDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQ29tbWVudE5vZGUpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGAke2VsZW1lbnQudW5pcXVlT3duZXJ9LSR7ZWxlbWVudC5yZXNvdXJjZS50b1N0cmluZygpfS0ke2VsZW1lbnQudGhyZWFkSWR9LSR7ZWxlbWVudC5jb21tZW50LnVuaXF1ZUlkSW5UaHJlYWR9YCArIChlbGVtZW50LmlzUm9vdCA/ICctcm9vdCcgOiAnJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s6IHRydWUsXG5cdFx0XHRcdGNvbGxhcHNlQnlEZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0b3ZlcnJpZGVTdHlsZXM6IG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMsXG5cdFx0XHRcdGZpbHRlcjogb3B0aW9ucy5maWx0ZXIsXG5cdFx0XHRcdHNvcnRlcjogb3B0aW9ucy5zb3J0ZXIsXG5cdFx0XHRcdGZpbmRXaWRnZXRFbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0bGlzdFNlcnZpY2UsXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHQpO1xuXHRcdHRoaXMubWVudXMgPSBtZW51cztcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLmNvbW1lbnRzT25Db250ZXh0TWVudShlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21tZW50c09uQ29udGV4dE1lbnUodHJlZUV2ZW50OiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8Q29tbWVudHNNb2RlbCB8IFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzIHwgQ29tbWVudE5vZGUgfCBudWxsPik6IHZvaWQge1xuXHRcdGNvbnN0IG5vZGU6IENvbW1lbnRzTW9kZWwgfCBSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcyB8IENvbW1lbnROb2RlIHwgbnVsbCA9IHRyZWVFdmVudC5lbGVtZW50O1xuXHRcdGlmICghKG5vZGUgaW5zdGFuY2VvZiBDb21tZW50Tm9kZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZXZlbnQ6IFVJRXZlbnQgPSB0cmVlRXZlbnQuYnJvd3NlckV2ZW50O1xuXG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdHRoaXMuc2V0Rm9jdXMoW25vZGVdKTtcblx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5tZW51cy5nZXRSZXNvdXJjZUNvbnRleHRBY3Rpb25zKG5vZGUpO1xuXHRcdGlmICghYWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gdHJlZUV2ZW50LmFuY2hvcixcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRnZXRBY3Rpb25WaWV3SXRlbTogKGFjdGlvbikgPT4ge1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCk7XG5cdFx0XHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBBY3Rpb25WaWV3SXRlbShhY3Rpb24sIGFjdGlvbiwgeyBsYWJlbDogdHJ1ZSwga2V5YmluZGluZzoga2V5YmluZGluZy5nZXRMYWJlbCgpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0b25IaWRlOiAod2FzQ2FuY2VsbGVkPzogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRpZiAod2FzQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5kb21Gb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpOiBNYXJzaGFsbGVkQ29tbWVudFRocmVhZEludGVybmFsID0+ICh7XG5cdFx0XHRcdGNvbW1lbnRDb250cm9sSGFuZGxlOiBub2RlLmNvbnRyb2xsZXJIYW5kbGUsXG5cdFx0XHRcdGNvbW1lbnRUaHJlYWRIYW5kbGU6IG5vZGUudGhyZWFkSGFuZGxlLFxuXHRcdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuQ29tbWVudFRocmVhZCxcblx0XHRcdFx0dGhyZWFkOiBub2RlLnRocmVhZFxuXHRcdFx0fSlcblx0XHR9KTtcblx0fVxuXG5cdGZpbHRlckNvbW1lbnRzKCk6IHZvaWQge1xuXHRcdHRoaXMucmVmaWx0ZXIoKTtcblx0fVxuXG5cdGdldFZpc2libGVJdGVtQ291bnQoKTogbnVtYmVyIHtcblx0XHRsZXQgZmlsdGVyZWQgPSAwO1xuXHRcdGNvbnN0IHJvb3QgPSB0aGlzLmdldE5vZGUoKTtcblxuXHRcdGZvciAoY29uc3QgcmVzb3VyY2VOb2RlIG9mIHJvb3QuY2hpbGRyZW4pIHtcblx0XHRcdGZvciAoY29uc3QgY29tbWVudE5vZGUgb2YgcmVzb3VyY2VOb2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdGlmIChjb21tZW50Tm9kZS52aXNpYmxlICYmIHJlc291cmNlTm9kZS52aXNpYmxlKSB7XG5cdFx0XHRcdFx0ZmlsdGVyZWQrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmaWx0ZXJlZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQXNCLHVCQUF1QjtBQUU3QyxTQUFTLGFBQWEsa0NBQWtDO0FBQ3hELFNBQTBFLHNCQUFzQjtBQUVoRyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGNBQThDLDJCQUEyQjtBQUNsRixTQUFzQixxQkFB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
