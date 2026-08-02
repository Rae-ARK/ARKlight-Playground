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
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { basename, dirname, extUriBiasedIgnorePathCase, relativePath } from "../../../../base/common/resources.js";
import { ResourceTree } from "../../../../base/common/resourceTree.js";
import { URI } from "../../../../base/common/uri.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { isIChatSessionFileChange2 } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ModifiedFileEntryState } from "../../../../workbench/contrib/chat/common/editing/chatEditingService.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { GITHUB_REMOTE_FILE_SCHEME } from "../../../services/sessions/common/session.js";
import { ActiveSessionContextKeys, ChangesContextKeys, ChangesViewMode } from "../common/changes.js";
import { IChangesViewService } from "../common/changesViewService.js";
const $ = dom.$;
function toIChangesFileItem(changes) {
  return changes.map((change) => {
    const isAddition = change.originalUri === void 0;
    const isDeletion = change.modifiedUri === void 0;
    const uri = isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri;
    return {
      type: "file",
      uri,
      originalUri: change.originalUri,
      isDeletion,
      state: ModifiedFileEntryState.Accepted,
      changeType: isAddition ? "added" : isDeletion ? "deleted" : "modified",
      linesAdded: change.insertions,
      linesRemoved: change.deletions
    };
  });
}
function isChangesFileItem(element) {
  return !ResourceTree.isResourceNode(element) && element.type === "file";
}
function isChangesRootItem(element) {
  return !ResourceTree.isResourceNode(element) && element.type === "root";
}
function buildTreeChildren(items, treeRootInfo) {
  if (items.length === 0) {
    return [];
  }
  let rootUri = treeRootInfo?.resourceTreeRootUri ?? URI.file("/");
  if (!treeRootInfo && items[0].uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
    const parts = items[0].uri.path.split("/").filter(Boolean);
    if (parts.length >= 3) {
      rootUri = items[0].uri.with({ path: "/" + parts.slice(0, 3).join("/") });
    }
  }
  const resourceTree = new ResourceTree(void 0, rootUri, extUriBiasedIgnorePathCase);
  for (const item of items) {
    resourceTree.add(item.uri, item);
  }
  function convertChildren(parent) {
    const result = [];
    for (const child of parent.children) {
      if (child.element && child.childrenCount === 0) {
        result.push({
          element: child.element,
          collapsible: false,
          incompressible: true
        });
      } else {
        result.push({
          element: child,
          children: convertChildren(child),
          incompressible: parent === resourceTree.root,
          collapsible: true,
          collapsed: false
        });
      }
    }
    return result;
  }
  const children = convertChildren(resourceTree.root);
  if (!treeRootInfo) {
    return children;
  }
  return [{
    element: treeRootInfo.root,
    children,
    collapsible: true,
    collapsed: false,
    incompressible: true
  }];
}
let ChangesTreeRenderer = class {
  constructor(labels, actionRunner, getRootUri, instantiationService, changesViewService, contextKeyService, labelService, sessionsService) {
    this.labels = labels;
    this.actionRunner = actionRunner;
    this.getRootUri = getRootUri;
    this.instantiationService = instantiationService;
    this.changesViewService = changesViewService;
    this.contextKeyService = contextKeyService;
    this.labelService = labelService;
    this.sessionsService = sessionsService;
    this.templateId = ChangesTreeRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));
    const reviewCommentsBadge = dom.$(".changes-review-comments-badge");
    label.element.appendChild(reviewCommentsBadge);
    const agentFeedbackBadge = dom.$(".changes-agent-feedback-badge");
    label.element.appendChild(agentFeedbackBadge);
    const lineCountsContainer = $(".working-set-line-counts");
    const addedSpan = dom.$(".working-set-lines-added");
    const removedSpan = dom.$(".working-set-lines-removed");
    lineCountsContainer.appendChild(addedSpan);
    lineCountsContainer.appendChild(removedSpan);
    label.element.appendChild(lineCountsContainer);
    const actionBarContainer = $(".chat-collapsible-list-action-bar");
    const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(actionBarContainer));
    const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const toolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.AgentsChangeInlineToolbar, {
      menuOptions: { shouldForwardArgs: true, arg: void 0 },
      actionRunner: this.actionRunner
    }));
    label.element.appendChild(actionBarContainer);
    templateDisposables.add(bindContextKey(ChatContextKeys.agentSessionType, contextKeyService, (reader) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      return activeSession?.sessionType ?? "";
    }));
    templateDisposables.add(bindContextKey(ActiveSessionContextKeys.HasGitRepository, contextKeyService, (reader) => {
      return this.changesViewService.activeSessionHasGitRepositoryObs.read(reader);
    }));
    templateDisposables.add(bindContextKey(ChangesContextKeys.VersionMode, contextKeyService, (reader) => {
      return this.changesViewService.activeSessionChangesetObs.read(reader)?.id ?? "";
    }));
    const changeKindContextKey = ChangesContextKeys.ChangeKind.bindTo(contextKeyService);
    const decorationBadge = dom.$(".changes-decoration-badge");
    label.element.appendChild(decorationBadge);
    return { label, toolbar, changeKindContextKey, reviewCommentsBadge, agentFeedbackBadge, decorationBadge, addedSpan, removedSpan, lineCountsContainer, elementDisposables: new DisposableStore(), templateDisposables };
  }
  renderElement(node, _index, templateData) {
    const element = node.element;
    templateData.label.element.style.display = "flex";
    if (isChangesRootItem(element)) {
      this.renderRootElement(element, templateData);
    } else if (ResourceTree.isResourceNode(element)) {
      this.renderFolderElement(element, templateData);
    } else {
      this.renderFileElement(element, templateData);
    }
  }
  renderCompressedElements(node, _index, templateData) {
    const compressed = node.element;
    const folder = compressed.elements[compressed.elements.length - 1];
    templateData.label.element.style.display = "flex";
    const label = compressed.elements.map((e) => e.name);
    templateData.label.setResource({ resource: folder.uri, name: label }, {
      fileKind: FileKind.FOLDER,
      separator: this.labelService.getSeparator(folder.uri.scheme)
    });
    templateData.reviewCommentsBadge.style.display = "none";
    templateData.agentFeedbackBadge.style.display = "none";
    templateData.decorationBadge.style.display = "none";
    templateData.lineCountsContainer.style.display = "none";
    if (templateData.toolbar) {
      templateData.toolbar.context = folder;
    }
    templateData.changeKindContextKey.set("folder");
  }
  renderFileElement(data, templateData) {
    const root = this.getRootUri();
    const viewMode = this.changesViewService.viewModeObs.get();
    templateData.label.setResource({
      resource: data.uri,
      name: basename(data.uri),
      description: viewMode === ChangesViewMode.List ? root ? relativePath(root, dirname(data.uri)) : void 0 : void 0
    }, {
      fileKind: FileKind.FILE,
      fileDecorations: void 0,
      strikethrough: data.changeType === "deleted"
    });
    const showChangeDecorations = data.changeType !== "none";
    templateData.lineCountsContainer.style.display = showChangeDecorations ? "" : "none";
    templateData.decorationBadge.style.display = showChangeDecorations ? "" : "none";
    templateData.elementDisposables.add(autorun((reader) => {
      const reviewCommentByFile = this.changesViewService.activeSessionReviewCommentCountByFileObs.read(reader);
      const reviewCommentCount = reviewCommentByFile?.get(data.uri.fsPath) ?? 0;
      if (reviewCommentCount > 0) {
        templateData.reviewCommentsBadge.style.display = "";
        templateData.reviewCommentsBadge.className = "changes-review-comments-badge";
        templateData.reviewCommentsBadge.replaceChildren(
          dom.$(".codicon.codicon-comment-unresolved"),
          dom.$("span", void 0, `${reviewCommentCount}`)
        );
      } else {
        templateData.reviewCommentsBadge.style.display = "none";
        templateData.reviewCommentsBadge.replaceChildren();
      }
    }));
    templateData.elementDisposables.add(autorun((reader) => {
      const agentFeedbackByFile = this.changesViewService.activeSessionAgentFeedbackCountByFileObs.read(reader);
      const agentFeedbackCount = agentFeedbackByFile?.get(data.uri.fsPath) ?? 0;
      if (agentFeedbackCount > 0) {
        templateData.agentFeedbackBadge.style.display = "";
        templateData.agentFeedbackBadge.className = "changes-agent-feedback-badge";
        templateData.agentFeedbackBadge.replaceChildren(
          dom.$(".codicon.codicon-comment"),
          dom.$("span", void 0, `${agentFeedbackCount}`)
        );
      } else {
        templateData.agentFeedbackBadge.style.display = "none";
        templateData.agentFeedbackBadge.replaceChildren();
      }
    }));
    const badge = templateData.decorationBadge;
    badge.className = "changes-decoration-badge";
    if (showChangeDecorations) {
      switch (data.changeType) {
        case "added":
          badge.textContent = "A";
          badge.classList.add("added");
          break;
        case "deleted":
          badge.textContent = "D";
          badge.classList.add("deleted");
          break;
        case "modified":
        default:
          badge.textContent = "M";
          badge.classList.add("modified");
          break;
      }
      templateData.addedSpan.textContent = `+${data.linesAdded}`;
      templateData.removedSpan.textContent = `-${data.linesRemoved}`;
      templateData.label.element.querySelector(".monaco-icon-name-container")?.classList.add("modified");
    } else {
      badge.textContent = "";
      templateData.label.element.querySelector(".monaco-icon-name-container")?.classList.remove("modified");
    }
    templateData.toolbar.context = data;
    templateData.changeKindContextKey.set("file");
  }
  renderRootElement(data, templateData) {
    templateData.label.setResource({
      resource: data.uri,
      name: data.name
    }, {
      fileKind: FileKind.ROOT_FOLDER,
      separator: this.labelService.getSeparator(data.uri.scheme, data.uri.authority)
    });
    templateData.reviewCommentsBadge.style.display = "none";
    templateData.agentFeedbackBadge.style.display = "none";
    templateData.decorationBadge.style.display = "none";
    templateData.lineCountsContainer.style.display = "none";
    templateData.toolbar.context = data.uri;
    templateData.changeKindContextKey.set("root");
  }
  renderFolderElement(node, templateData) {
    templateData.label.setFile(node.uri, {
      fileKind: FileKind.FOLDER,
      hidePath: true
    });
    templateData.reviewCommentsBadge.style.display = "none";
    templateData.agentFeedbackBadge.style.display = "none";
    templateData.decorationBadge.style.display = "none";
    templateData.lineCountsContainer.style.display = "none";
    templateData.toolbar.context = node;
    templateData.changeKindContextKey.set("folder");
  }
  disposeElement(_element, _index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(_element, _index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.templateDisposables.dispose();
  }
};
ChangesTreeRenderer.TEMPLATE_ID = "changesTreeRenderer";
ChangesTreeRenderer = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IChangesViewService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, ISessionsService)
], ChangesTreeRenderer);
export {
  ChangesTreeRenderer,
  buildTreeChildren,
  isChangesFileItem,
  isChangesRootItem,
  toIChangesFileItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhbmdlcy9icm93c2VyL2NoYW5nZXNWaWV3UmVuZGVyZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NlZFRyZWVFbGVtZW50LCBJQ29tcHJlc3NlZFRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvY29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IEFjdGlvblJ1bm5lciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSwgcmVsYXRpdmVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZU5vZGUsIFJlc291cmNlVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlVHJlZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEZpbGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IGJpbmRDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlTGFiZWwsIFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGlzSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTIgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSwgSVNlc3Npb25GaWxlQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgQWN0aXZlU2Vzc2lvbkNvbnRleHRLZXlzLCBDaGFuZ2VzQ29udGV4dEtleXMsIENoYW5nZXNWaWV3TW9kZSB9IGZyb20gJy4uL2NvbW1vbi9jaGFuZ2VzLmpzJztcbmltcG9ydCB7IElDaGFuZ2VzVmlld1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlc1ZpZXdTZXJ2aWNlLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5leHBvcnQgZnVuY3Rpb24gdG9JQ2hhbmdlc0ZpbGVJdGVtKGNoYW5nZXM6IHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdKTogSUNoYW5nZXNGaWxlSXRlbVtdIHtcblx0cmV0dXJuIGNoYW5nZXMubWFwKGNoYW5nZSA9PiB7XG5cdFx0Y29uc3QgaXNBZGRpdGlvbiA9IGNoYW5nZS5vcmlnaW5hbFVyaSA9PT0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGlzRGVsZXRpb24gPSBjaGFuZ2UubW9kaWZpZWRVcmkgPT09IHVuZGVmaW5lZDtcblx0XHRjb25zdCB1cmkgPSBpc0lDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyKGNoYW5nZSlcblx0XHRcdD8gY2hhbmdlLnVyaVxuXHRcdFx0OiBjaGFuZ2UubW9kaWZpZWRVcmk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ2ZpbGUnLFxuXHRcdFx0dXJpLFxuXHRcdFx0b3JpZ2luYWxVcmk6IGNoYW5nZS5vcmlnaW5hbFVyaSxcblx0XHRcdGlzRGVsZXRpb24sXG5cdFx0XHRzdGF0ZTogTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5BY2NlcHRlZCxcblx0XHRcdGNoYW5nZVR5cGU6IGlzQWRkaXRpb25cblx0XHRcdFx0PyAnYWRkZWQnXG5cdFx0XHRcdDogaXNEZWxldGlvblxuXHRcdFx0XHRcdD8gJ2RlbGV0ZWQnXG5cdFx0XHRcdFx0OiAnbW9kaWZpZWQnLFxuXHRcdFx0bGluZXNBZGRlZDogY2hhbmdlLmluc2VydGlvbnMsXG5cdFx0XHRsaW5lc1JlbW92ZWQ6IGNoYW5nZS5kZWxldGlvbnNcblx0XHR9IHNhdGlzZmllcyBJQ2hhbmdlc0ZpbGVJdGVtO1xuXHR9KTtcbn1cblxudHlwZSBDaGFuZ2VUeXBlID0gJ2FkZGVkJyB8ICdtb2RpZmllZCcgfCAnZGVsZXRlZCcgfCAnbm9uZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYW5nZXNGaWxlSXRlbSB7XG5cdHJlYWRvbmx5IHR5cGU6ICdmaWxlJztcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdHJlYWRvbmx5IG9yaWdpbmFsVXJpPzogVVJJO1xuXHRyZWFkb25seSBzdGF0ZTogTW9kaWZpZWRGaWxlRW50cnlTdGF0ZTtcblx0cmVhZG9ubHkgaXNEZWxldGlvbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgY2hhbmdlVHlwZTogQ2hhbmdlVHlwZTtcblx0cmVhZG9ubHkgbGluZXNBZGRlZDogbnVtYmVyO1xuXHRyZWFkb25seSBsaW5lc1JlbW92ZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhbmdlc1Jvb3RJdGVtIHtcblx0cmVhZG9ubHkgdHlwZTogJ3Jvb3QnO1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGFuZ2VzVHJlZVJvb3RJbmZvIHtcblx0cmVhZG9ubHkgcm9vdDogSUNoYW5nZXNSb290SXRlbTtcblx0cmVhZG9ubHkgcmVzb3VyY2VUcmVlUm9vdFVyaTogVVJJO1xufVxuXG5leHBvcnQgdHlwZSBDaGFuZ2VzVHJlZUVsZW1lbnQgPSBJQ2hhbmdlc1Jvb3RJdGVtIHwgSUNoYW5nZXNGaWxlSXRlbSB8IElSZXNvdXJjZU5vZGU8SUNoYW5nZXNGaWxlSXRlbSwgdW5kZWZpbmVkPjtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ2hhbmdlc0ZpbGVJdGVtKGVsZW1lbnQ6IENoYW5nZXNUcmVlRWxlbWVudCk6IGVsZW1lbnQgaXMgSUNoYW5nZXNGaWxlSXRlbSB7XG5cdHJldHVybiAhUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKGVsZW1lbnQpICYmIGVsZW1lbnQudHlwZSA9PT0gJ2ZpbGUnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNDaGFuZ2VzUm9vdEl0ZW0oZWxlbWVudDogQ2hhbmdlc1RyZWVFbGVtZW50KTogZWxlbWVudCBpcyBJQ2hhbmdlc1Jvb3RJdGVtIHtcblx0cmV0dXJuICFSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoZWxlbWVudCkgJiYgZWxlbWVudC50eXBlID09PSAncm9vdCc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFRyZWVDaGlsZHJlbihpdGVtczogSUNoYW5nZXNGaWxlSXRlbVtdLCB0cmVlUm9vdEluZm8/OiBJQ2hhbmdlc1RyZWVSb290SW5mbyk6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8Q2hhbmdlc1RyZWVFbGVtZW50PltdIHtcblx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGxldCByb290VXJpID0gdHJlZVJvb3RJbmZvPy5yZXNvdXJjZVRyZWVSb290VXJpID8/IFVSSS5maWxlKCcvJyk7XG5cblx0Ly8gRm9yIGdpdGh1Yi1yZW1vdGUtZmlsZSBVUklzLCBzZXQgdGhlIHJvb3QgdG8gL3tvd25lcn0ve3JlcG99L3tyZWZ9XG5cdC8vIHNvIHRoZSB0cmVlIHNob3dzIHJlcG8tcmVsYXRpdmUgcGF0aHMgaW5zdGVhZCBvZiBpbnRlcm5hbCBVUkkgc2VnbWVudHMuXG5cdGlmICghdHJlZVJvb3RJbmZvICYmIGl0ZW1zWzBdLnVyaS5zY2hlbWUgPT09IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUpIHtcblx0XHRjb25zdCBwYXJ0cyA9IGl0ZW1zWzBdLnVyaS5wYXRoLnNwbGl0KCcvJykuZmlsdGVyKEJvb2xlYW4pO1xuXHRcdGlmIChwYXJ0cy5sZW5ndGggPj0gMykge1xuXHRcdFx0cm9vdFVyaSA9IGl0ZW1zWzBdLnVyaS53aXRoKHsgcGF0aDogJy8nICsgcGFydHMuc2xpY2UoMCwgMykuam9pbignLycpIH0pO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHJlc291cmNlVHJlZSA9IG5ldyBSZXNvdXJjZVRyZWU8SUNoYW5nZXNGaWxlSXRlbSwgdW5kZWZpbmVkPih1bmRlZmluZWQsIHJvb3RVcmksIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlKTtcblx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0cmVzb3VyY2VUcmVlLmFkZChpdGVtLnVyaSwgaXRlbSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjb252ZXJ0Q2hpbGRyZW4ocGFyZW50OiBJUmVzb3VyY2VOb2RlPElDaGFuZ2VzRmlsZUl0ZW0sIHVuZGVmaW5lZD4pOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PENoYW5nZXNUcmVlRWxlbWVudD5bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PENoYW5nZXNUcmVlRWxlbWVudD5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgcGFyZW50LmNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoY2hpbGQuZWxlbWVudCAmJiBjaGlsZC5jaGlsZHJlbkNvdW50ID09PSAwKSB7XG5cdFx0XHRcdC8vIExlYWYgbm9kZSBcdTIwMTQganVzdCB0aGUgZmlsZSBpdGVtXG5cdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRlbGVtZW50OiBjaGlsZC5lbGVtZW50LFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlOiBmYWxzZSxcblx0XHRcdFx0XHRpbmNvbXByZXNzaWJsZTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBGb2xkZXIgbm9kZS4gRW5zdXJlIHRoYXQgdGhlIGZpcnN0IGxldmVsIG9mIGZvbGRlcnMgdW5kZXJcblx0XHRcdFx0Ly8gdGhlIHJvb3QgZm9sZGVyIGFyZSBub3QgYmVpbmcgY29sbGFwc2VkIHdpdGggdGhlIHJvb3QgZm9sZGVyXG5cdFx0XHRcdC8vIGFzIHRoYXQgaXMgYSBzcGVjaWFsIG5vZGUgc2hvd2luZyB0aGUgd29ya3NwYWNlIGZvbGRlciBhbmRcblx0XHRcdFx0Ly8gYnJhbmNoIGluZm9ybWF0aW9uLlxuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0ZWxlbWVudDogY2hpbGQsXG5cdFx0XHRcdFx0Y2hpbGRyZW46IGNvbnZlcnRDaGlsZHJlbihjaGlsZCksXG5cdFx0XHRcdFx0aW5jb21wcmVzc2libGU6IHBhcmVudCA9PT0gcmVzb3VyY2VUcmVlLnJvb3QsXG5cdFx0XHRcdFx0Y29sbGFwc2libGU6IHRydWUsXG5cdFx0XHRcdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRjb25zdCBjaGlsZHJlbiA9IGNvbnZlcnRDaGlsZHJlbihyZXNvdXJjZVRyZWUucm9vdCk7XG5cdGlmICghdHJlZVJvb3RJbmZvKSB7XG5cdFx0cmV0dXJuIGNoaWxkcmVuO1xuXHR9XG5cblx0cmV0dXJuIFt7XG5cdFx0ZWxlbWVudDogdHJlZVJvb3RJbmZvLnJvb3QsXG5cdFx0Y2hpbGRyZW4sXG5cdFx0Y29sbGFwc2libGU6IHRydWUsXG5cdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRpbmNvbXByZXNzaWJsZTogdHJ1ZSxcblx0fV07XG59XG5cbmludGVyZmFjZSBJQ2hhbmdlc1RyZWVUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcblx0cmVhZG9ubHkgdG9vbGJhcjogTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cdHJlYWRvbmx5IGNoYW5nZUtpbmRDb250ZXh0S2V5OiBJQ29udGV4dEtleTwncm9vdCcgfCAnZm9sZGVyJyB8ICdmaWxlJz47XG5cdHJlYWRvbmx5IHJldmlld0NvbW1lbnRzQmFkZ2U6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBhZ2VudEZlZWRiYWNrQmFkZ2U6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkZWNvcmF0aW9uQmFkZ2U6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBhZGRlZFNwYW46IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSByZW1vdmVkU3BhbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxpbmVDb3VudHNDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhbmdlc1RyZWVSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8Q2hhbmdlc1RyZWVFbGVtZW50LCB2b2lkLCBJQ2hhbmdlc1RyZWVUZW1wbGF0ZT4ge1xuXHRzdGF0aWMgVEVNUExBVEVfSUQgPSAnY2hhbmdlc1RyZWVSZW5kZXJlcic7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IENoYW5nZXNUcmVlUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBsYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdHByaXZhdGUgYWN0aW9uUnVubmVyOiBBY3Rpb25SdW5uZXIgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBnZXRSb290VXJpOiAoKSA9PiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDaGFuZ2VzVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGFuZ2VzVmlld1NlcnZpY2U6IElDaGFuZ2VzVmlld1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElDaGFuZ2VzVHJlZVRlbXBsYXRlIHtcblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGxhYmVsID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5sYWJlbHMuY3JlYXRlKGNvbnRhaW5lciwgeyBzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IHJldmlld0NvbW1lbnRzQmFkZ2UgPSBkb20uJCgnLmNoYW5nZXMtcmV2aWV3LWNvbW1lbnRzLWJhZGdlJyk7XG5cdFx0bGFiZWwuZWxlbWVudC5hcHBlbmRDaGlsZChyZXZpZXdDb21tZW50c0JhZGdlKTtcblxuXHRcdGNvbnN0IGFnZW50RmVlZGJhY2tCYWRnZSA9IGRvbS4kKCcuY2hhbmdlcy1hZ2VudC1mZWVkYmFjay1iYWRnZScpO1xuXHRcdGxhYmVsLmVsZW1lbnQuYXBwZW5kQ2hpbGQoYWdlbnRGZWVkYmFja0JhZGdlKTtcblxuXHRcdGNvbnN0IGxpbmVDb3VudHNDb250YWluZXIgPSAkKCcud29ya2luZy1zZXQtbGluZS1jb3VudHMnKTtcblx0XHRjb25zdCBhZGRlZFNwYW4gPSBkb20uJCgnLndvcmtpbmctc2V0LWxpbmVzLWFkZGVkJyk7XG5cdFx0Y29uc3QgcmVtb3ZlZFNwYW4gPSBkb20uJCgnLndvcmtpbmctc2V0LWxpbmVzLXJlbW92ZWQnKTtcblx0XHRsaW5lQ291bnRzQ29udGFpbmVyLmFwcGVuZENoaWxkKGFkZGVkU3Bhbik7XG5cdFx0bGluZUNvdW50c0NvbnRhaW5lci5hcHBlbmRDaGlsZChyZW1vdmVkU3Bhbik7XG5cdFx0bGFiZWwuZWxlbWVudC5hcHBlbmRDaGlsZChsaW5lQ291bnRzQ29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGFjdGlvbkJhckNvbnRhaW5lciA9ICQoJy5jaGF0LWNvbGxhcHNpYmxlLWxpc3QtYWN0aW9uLWJhcicpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoYWN0aW9uQmFyQ29udGFpbmVyKSk7XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0Y29uc3QgdG9vbGJhciA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBhY3Rpb25CYXJDb250YWluZXIsIE1lbnVJZC5BZ2VudHNDaGFuZ2VJbmxpbmVUb29sYmFyLCB7XG5cdFx0XHRtZW51T3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSwgYXJnOiB1bmRlZmluZWQgfSwgYWN0aW9uUnVubmVyOiB0aGlzLmFjdGlvblJ1bm5lclxuXHRcdH0pKTtcblx0XHRsYWJlbC5lbGVtZW50LmFwcGVuZENoaWxkKGFjdGlvbkJhckNvbnRhaW5lcik7XG5cblx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChiaW5kQ29udGV4dEtleShDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uVHlwZSwgY29udGV4dEtleVNlcnZpY2UsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gYWN0aXZlU2Vzc2lvbj8uc2Vzc2lvblR5cGUgPz8gJyc7XG5cdFx0fSkpO1xuXG5cdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoYmluZENvbnRleHRLZXkoQWN0aXZlU2Vzc2lvbkNvbnRleHRLZXlzLkhhc0dpdFJlcG9zaXRvcnksIGNvbnRleHRLZXlTZXJ2aWNlLCByZWFkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25IYXNHaXRSZXBvc2l0b3J5T2JzLnJlYWQocmVhZGVyKTtcblx0XHR9KSk7XG5cblx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChiaW5kQ29udGV4dEtleShDaGFuZ2VzQ29udGV4dEtleXMuVmVyc2lvbk1vZGUsIGNvbnRleHRLZXlTZXJ2aWNlLCByZWFkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRPYnMucmVhZChyZWFkZXIpPy5pZCA/PyAnJztcblx0XHR9KSk7XG5cblx0XHRjb25zdCBjaGFuZ2VLaW5kQ29udGV4dEtleSA9IENoYW5nZXNDb250ZXh0S2V5cy5DaGFuZ2VLaW5kLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBkZWNvcmF0aW9uQmFkZ2UgPSBkb20uJCgnLmNoYW5nZXMtZGVjb3JhdGlvbi1iYWRnZScpO1xuXHRcdGxhYmVsLmVsZW1lbnQuYXBwZW5kQ2hpbGQoZGVjb3JhdGlvbkJhZGdlKTtcblxuXHRcdHJldHVybiB7IGxhYmVsLCB0b29sYmFyLCBjaGFuZ2VLaW5kQ29udGV4dEtleSwgcmV2aWV3Q29tbWVudHNCYWRnZSwgYWdlbnRGZWVkYmFja0JhZGdlLCBkZWNvcmF0aW9uQmFkZ2UsIGFkZGVkU3BhbiwgcmVtb3ZlZFNwYW4sIGxpbmVDb3VudHNDb250YWluZXIsIGVsZW1lbnREaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpLCB0ZW1wbGF0ZURpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxDaGFuZ2VzVHJlZUVsZW1lbnQsIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ2hhbmdlc1RyZWVUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcblxuXHRcdGlmIChpc0NoYW5nZXNSb290SXRlbShlbGVtZW50KSkge1xuXHRcdFx0Ly8gUm9vdCBlbGVtZW50XG5cdFx0XHR0aGlzLnJlbmRlclJvb3RFbGVtZW50KGVsZW1lbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0fSBlbHNlIGlmIChSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoZWxlbWVudCkpIHtcblx0XHRcdC8vIEZvbGRlciBlbGVtZW50XG5cdFx0XHR0aGlzLnJlbmRlckZvbGRlckVsZW1lbnQoZWxlbWVudCwgdGVtcGxhdGVEYXRhKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRmlsZSBlbGVtZW50XG5cdFx0XHR0aGlzLnJlbmRlckZpbGVFbGVtZW50KGVsZW1lbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPENoYW5nZXNUcmVlRWxlbWVudD4sIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ2hhbmdlc1RyZWVUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbXByZXNzZWQgPSBub2RlLmVsZW1lbnQgYXMgSUNvbXByZXNzZWRUcmVlTm9kZTxJUmVzb3VyY2VOb2RlPElDaGFuZ2VzRmlsZUl0ZW0sIHVuZGVmaW5lZD4+O1xuXHRcdGNvbnN0IGZvbGRlciA9IGNvbXByZXNzZWQuZWxlbWVudHNbY29tcHJlc3NlZC5lbGVtZW50cy5sZW5ndGggLSAxXTtcblxuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cblx0XHRjb25zdCBsYWJlbCA9IGNvbXByZXNzZWQuZWxlbWVudHMubWFwKGUgPT4gZS5uYW1lKTtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0UmVzb3VyY2UoeyByZXNvdXJjZTogZm9sZGVyLnVyaSwgbmFtZTogbGFiZWwgfSwge1xuXHRcdFx0ZmlsZUtpbmQ6IEZpbGVLaW5kLkZPTERFUixcblx0XHRcdHNlcGFyYXRvcjogdGhpcy5sYWJlbFNlcnZpY2UuZ2V0U2VwYXJhdG9yKGZvbGRlci51cmkuc2NoZW1lKSxcblx0XHR9KTtcblxuXHRcdC8vIEhpZGUgZmlsZS1zcGVjaWZpYyBkZWNvcmF0aW9ucyBmb3IgZm9sZGVyc1xuXHRcdHRlbXBsYXRlRGF0YS5yZXZpZXdDb21tZW50c0JhZGdlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGVtcGxhdGVEYXRhLmFnZW50RmVlZGJhY2tCYWRnZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRlbXBsYXRlRGF0YS5kZWNvcmF0aW9uQmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0ZW1wbGF0ZURhdGEubGluZUNvdW50c0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0aWYgKHRlbXBsYXRlRGF0YS50b29sYmFyKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudG9vbGJhci5jb250ZXh0ID0gZm9sZGVyO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5jaGFuZ2VLaW5kQ29udGV4dEtleS5zZXQoJ2ZvbGRlcicpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJGaWxlRWxlbWVudChkYXRhOiBJQ2hhbmdlc0ZpbGVJdGVtLCB0ZW1wbGF0ZURhdGE6IElDaGFuZ2VzVHJlZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3Qgcm9vdCA9IHRoaXMuZ2V0Um9vdFVyaSgpO1xuXHRcdGNvbnN0IHZpZXdNb2RlID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2Uudmlld01vZGVPYnMuZ2V0KCk7XG5cblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0UmVzb3VyY2Uoe1xuXHRcdFx0cmVzb3VyY2U6IGRhdGEudXJpLFxuXHRcdFx0bmFtZTogYmFzZW5hbWUoZGF0YS51cmkpLFxuXHRcdFx0ZGVzY3JpcHRpb246IHZpZXdNb2RlID09PSBDaGFuZ2VzVmlld01vZGUuTGlzdFxuXHRcdFx0XHQ/IHJvb3Rcblx0XHRcdFx0XHQ/IHJlbGF0aXZlUGF0aChyb290LCBkaXJuYW1lKGRhdGEudXJpKSlcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZFxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHR9LCB7XG5cdFx0XHRmaWxlS2luZDogRmlsZUtpbmQuRklMRSxcblx0XHRcdGZpbGVEZWNvcmF0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0c3RyaWtldGhyb3VnaDogZGF0YS5jaGFuZ2VUeXBlID09PSAnZGVsZXRlZCdcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNob3dDaGFuZ2VEZWNvcmF0aW9ucyA9IGRhdGEuY2hhbmdlVHlwZSAhPT0gJ25vbmUnO1xuXG5cdFx0Ly8gU2hvdyBmaWxlLXNwZWNpZmljIGRlY29yYXRpb25zIGZvciBjaGFuZ2VkIGZpbGVzIG9ubHlcblx0XHR0ZW1wbGF0ZURhdGEubGluZUNvdW50c0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gc2hvd0NoYW5nZURlY29yYXRpb25zID8gJycgOiAnbm9uZSc7XG5cdFx0dGVtcGxhdGVEYXRhLmRlY29yYXRpb25CYWRnZS5zdHlsZS5kaXNwbGF5ID0gc2hvd0NoYW5nZURlY29yYXRpb25zID8gJycgOiAnbm9uZSc7XG5cblx0XHQvLyBSZXZpZXcgY29tbWVudHNcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCByZXZpZXdDb21tZW50QnlGaWxlID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvblJldmlld0NvbW1lbnRDb3VudEJ5RmlsZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCByZXZpZXdDb21tZW50Q291bnQgPSByZXZpZXdDb21tZW50QnlGaWxlPy5nZXQoZGF0YS51cmkuZnNQYXRoKSA/PyAwO1xuXG5cdFx0XHRpZiAocmV2aWV3Q29tbWVudENvdW50ID4gMCkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEucmV2aWV3Q29tbWVudHNCYWRnZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5yZXZpZXdDb21tZW50c0JhZGdlLmNsYXNzTmFtZSA9ICdjaGFuZ2VzLXJldmlldy1jb21tZW50cy1iYWRnZSc7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5yZXZpZXdDb21tZW50c0JhZGdlLnJlcGxhY2VDaGlsZHJlbihcblx0XHRcdFx0XHRkb20uJCgnLmNvZGljb24uY29kaWNvbi1jb21tZW50LXVucmVzb2x2ZWQnKSxcblx0XHRcdFx0XHRkb20uJCgnc3BhbicsIHVuZGVmaW5lZCwgYCR7cmV2aWV3Q29tbWVudENvdW50fWApXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEucmV2aWV3Q29tbWVudHNCYWRnZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEucmV2aWV3Q29tbWVudHNCYWRnZS5yZXBsYWNlQ2hpbGRyZW4oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBBZ2VudCBmZWVkYmFja1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFnZW50RmVlZGJhY2tCeUZpbGUgPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uQWdlbnRGZWVkYmFja0NvdW50QnlGaWxlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGFnZW50RmVlZGJhY2tDb3VudCA9IGFnZW50RmVlZGJhY2tCeUZpbGU/LmdldChkYXRhLnVyaS5mc1BhdGgpID8/IDA7XG5cblx0XHRcdGlmIChhZ2VudEZlZWRiYWNrQ291bnQgPiAwKSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5hZ2VudEZlZWRiYWNrQmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuYWdlbnRGZWVkYmFja0JhZGdlLmNsYXNzTmFtZSA9ICdjaGFuZ2VzLWFnZW50LWZlZWRiYWNrLWJhZGdlJztcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmFnZW50RmVlZGJhY2tCYWRnZS5yZXBsYWNlQ2hpbGRyZW4oXG5cdFx0XHRcdFx0ZG9tLiQoJy5jb2RpY29uLmNvZGljb24tY29tbWVudCcpLFxuXHRcdFx0XHRcdGRvbS4kKCdzcGFuJywgdW5kZWZpbmVkLCBgJHthZ2VudEZlZWRiYWNrQ291bnR9YClcblx0XHRcdFx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5hZ2VudEZlZWRiYWNrQmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmFnZW50RmVlZGJhY2tCYWRnZS5yZXBsYWNlQ2hpbGRyZW4oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBiYWRnZSA9IHRlbXBsYXRlRGF0YS5kZWNvcmF0aW9uQmFkZ2U7XG5cdFx0YmFkZ2UuY2xhc3NOYW1lID0gJ2NoYW5nZXMtZGVjb3JhdGlvbi1iYWRnZSc7XG5cdFx0aWYgKHNob3dDaGFuZ2VEZWNvcmF0aW9ucykge1xuXHRcdFx0Ly8gVXBkYXRlIGRlY29yYXRpb24gYmFkZ2UgKEEvTS9EKVxuXHRcdFx0c3dpdGNoIChkYXRhLmNoYW5nZVR5cGUpIHtcblx0XHRcdFx0Y2FzZSAnYWRkZWQnOlxuXHRcdFx0XHRcdGJhZGdlLnRleHRDb250ZW50ID0gJ0EnO1xuXHRcdFx0XHRcdGJhZGdlLmNsYXNzTGlzdC5hZGQoJ2FkZGVkJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2RlbGV0ZWQnOlxuXHRcdFx0XHRcdGJhZGdlLnRleHRDb250ZW50ID0gJ0QnO1xuXHRcdFx0XHRcdGJhZGdlLmNsYXNzTGlzdC5hZGQoJ2RlbGV0ZWQnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnbW9kaWZpZWQnOlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGJhZGdlLnRleHRDb250ZW50ID0gJ00nO1xuXHRcdFx0XHRcdGJhZGdlLmNsYXNzTGlzdC5hZGQoJ21vZGlmaWVkJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdHRlbXBsYXRlRGF0YS5hZGRlZFNwYW4udGV4dENvbnRlbnQgPSBgKyR7ZGF0YS5saW5lc0FkZGVkfWA7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucmVtb3ZlZFNwYW4udGV4dENvbnRlbnQgPSBgLSR7ZGF0YS5saW5lc1JlbW92ZWR9YDtcblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWljb24tbmFtZS1jb250YWluZXInKT8uY2xhc3NMaXN0LmFkZCgnbW9kaWZpZWQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YmFkZ2UudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLmVsZW1lbnQucXVlcnlTZWxlY3RvcignLm1vbmFjby1pY29uLW5hbWUtY29udGFpbmVyJyk/LmNsYXNzTGlzdC5yZW1vdmUoJ21vZGlmaWVkJyk7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLnRvb2xiYXIuY29udGV4dCA9IGRhdGE7XG5cdFx0dGVtcGxhdGVEYXRhLmNoYW5nZUtpbmRDb250ZXh0S2V5LnNldCgnZmlsZScpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJSb290RWxlbWVudChkYXRhOiBJQ2hhbmdlc1Jvb3RJdGVtLCB0ZW1wbGF0ZURhdGE6IElDaGFuZ2VzVHJlZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldFJlc291cmNlKHtcblx0XHRcdHJlc291cmNlOiBkYXRhLnVyaSxcblx0XHRcdG5hbWU6IGRhdGEubmFtZSxcblx0XHR9LCB7XG5cdFx0XHRmaWxlS2luZDogRmlsZUtpbmQuUk9PVF9GT0xERVIsXG5cdFx0XHRzZXBhcmF0b3I6IHRoaXMubGFiZWxTZXJ2aWNlLmdldFNlcGFyYXRvcihkYXRhLnVyaS5zY2hlbWUsIGRhdGEudXJpLmF1dGhvcml0eSksXG5cdFx0fSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEucmV2aWV3Q29tbWVudHNCYWRnZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRlbXBsYXRlRGF0YS5hZ2VudEZlZWRiYWNrQmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0ZW1wbGF0ZURhdGEuZGVjb3JhdGlvbkJhZGdlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGVtcGxhdGVEYXRhLmxpbmVDb3VudHNDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdHRlbXBsYXRlRGF0YS50b29sYmFyLmNvbnRleHQgPSBkYXRhLnVyaTtcblx0XHR0ZW1wbGF0ZURhdGEuY2hhbmdlS2luZENvbnRleHRLZXkuc2V0KCdyb290Jyk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckZvbGRlckVsZW1lbnQobm9kZTogSVJlc291cmNlTm9kZTxJQ2hhbmdlc0ZpbGVJdGVtLCB1bmRlZmluZWQ+LCB0ZW1wbGF0ZURhdGE6IElDaGFuZ2VzVHJlZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldEZpbGUobm9kZS51cmksIHtcblx0XHRcdGZpbGVLaW5kOiBGaWxlS2luZC5GT0xERVIsXG5cdFx0XHRoaWRlUGF0aDogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdC8vIEhpZGUgZmlsZS1zcGVjaWZpYyBkZWNvcmF0aW9ucyBmb3IgZm9sZGVyc1xuXHRcdHRlbXBsYXRlRGF0YS5yZXZpZXdDb21tZW50c0JhZGdlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGVtcGxhdGVEYXRhLmFnZW50RmVlZGJhY2tCYWRnZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRlbXBsYXRlRGF0YS5kZWNvcmF0aW9uQmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0ZW1wbGF0ZURhdGEubGluZUNvdW50c0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0dGVtcGxhdGVEYXRhLnRvb2xiYXIuY29udGV4dCA9IG5vZGU7XG5cdFx0dGVtcGxhdGVEYXRhLmNoYW5nZUtpbmRDb250ZXh0S2V5LnNldCgnZm9sZGVyJyk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChfZWxlbWVudDogSVRyZWVOb2RlPENoYW5nZXNUcmVlRWxlbWVudCwgdm9pZD4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDaGFuZ2VzVHJlZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZUNvbXByZXNzZWRFbGVtZW50cyhfZWxlbWVudDogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8Q2hhbmdlc1RyZWVFbGVtZW50Piwgdm9pZD4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDaGFuZ2VzVHJlZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUNoYW5nZXNUcmVlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBS3JCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsU0FBUyw0QkFBNEIsb0JBQW9CO0FBQzVFLFNBQXdCLG9CQUFvQjtBQUM1QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxjQUFjO0FBQ3ZCLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGlDQUFxRDtBQUM5RCxTQUFTLDBCQUEwQixvQkFBb0IsdUJBQXVCO0FBQzlFLFNBQVMsMkJBQTJCO0FBRXBDLE1BQU0sSUFBSSxJQUFJO0FBRVAsU0FBUyxtQkFBbUIsU0FBNEQ7QUFDOUYsU0FBTyxRQUFRLElBQUksWUFBVTtBQUM1QixVQUFNLGFBQWEsT0FBTyxnQkFBZ0I7QUFDMUMsVUFBTSxhQUFhLE9BQU8sZ0JBQWdCO0FBQzFDLFVBQU0sTUFBTSwwQkFBMEIsTUFBTSxJQUN6QyxPQUFPLE1BQ1AsT0FBTztBQUVWLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOO0FBQUEsTUFDQSxhQUFhLE9BQU87QUFBQSxNQUNwQjtBQUFBLE1BQ0EsT0FBTyx1QkFBdUI7QUFBQSxNQUM5QixZQUFZLGFBQ1QsVUFDQSxhQUNDLFlBQ0E7QUFBQSxNQUNKLFlBQVksT0FBTztBQUFB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
