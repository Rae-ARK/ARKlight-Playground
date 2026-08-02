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
import { $ } from "../../../../../../base/browser/dom.js";
import { ActionBar } from "../../../../../../base/browser/ui/actionbar/actionbar.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Iterable } from "../../../../../../base/common/iterator.js";
import { combinedDisposable, Disposable, DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { FileKind } from "../../../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchList } from "../../../../../../platform/list/browser/listService.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { ResourceLabels } from "../../../../../browser/labels.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { createFileIconThemableTreeContainerScope } from "../../../../files/browser/views/explorerView.js";
import { MultiDiffEditorInput } from "../../../../multiDiffEditor/browser/multiDiffEditorInput.js";
import { MultiDiffEditorItem } from "../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js";
import { ChatEditingSnapshotTextModelContentProvider } from "../../chatEditing/chatEditingTextModelContentProviders.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { IChatResponseFileChangesService } from "../../chatResponseFileChangesService.js";
import { ChatCollapsibleContentPart } from "./chatCollapsibleContentPart.js";
import { ResourcePool } from "./chatCollections.js";
const CHANGES_SUMMARY_ELEMENT_HEIGHT = 22;
const CHANGES_SUMMARY_MAX_ITEMS_SHOWN = 6;
function renderChangesSummaryFileList(container, diffs, instantiationService, editorService, configurationService, options) {
  const store = new DisposableStore();
  const list = store.add(instantiationService.createInstance(CollapsibleChangesSummaryListPool, options)).get();
  const listNode = list.getHTMLElement();
  container.appendChild(listNode.parentElement);
  store.add(list.onDidOpen((item) => {
    const diff = item.element;
    if (!diff) {
      return;
    }
    const altKey = (dom.isMouseEvent(item.browserEvent) || dom.isKeyboardEvent(item.browserEvent)) && item.browserEvent.altKey;
    const openInDiffEditorByDefault = configurationService.getValue(ChatConfiguration.OpenChangedFileInDiffEditor);
    const openInDiffEditor = altKey ? !openInDiffEditorByDefault : openInDiffEditorByDefault;
    if (!openInDiffEditor) {
      const fileURI = ChatEditingSnapshotTextModelContentProvider.getOriginalFileURI(diff.modifiedURI);
      if (fileURI) {
        editorService.openEditor({ resource: fileURI, options: { preserveFocus: true } });
        return;
      }
    }
    editorService.openEditor({
      original: { resource: diff.originalURI },
      modified: { resource: diff.modifiedURI },
      options: { preserveFocus: true }
    });
  }));
  store.add(list.onContextMenu((e) => {
    dom.EventHelper.stop(e.browserEvent, true);
  }));
  store.add(autorun((r) => {
    const currentDiffs = diffs.read(r);
    const itemsShown = Math.min(currentDiffs.length, CHANGES_SUMMARY_MAX_ITEMS_SHOWN);
    const height = itemsShown * CHANGES_SUMMARY_ELEMENT_HEIGHT;
    list.layout(height);
    listNode.style.height = height + "px";
    list.splice(0, list.length, currentDiffs);
  }));
  return store;
}
let ChatCheckpointFileChangesSummaryContentPart = class extends Disposable {
  constructor(content, context, hoverService, chatService, editorService, configurationService, instantiationService, chatResponseFileChangesService) {
    super();
    this.content = content;
    this.hoverService = hoverService;
    this.chatService = chatService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.chatResponseFileChangesService = chatResponseFileChangesService;
    this.diffsBetweenRequests = /* @__PURE__ */ new Map();
    this.fileChangesDiffsObservable = this.computeFileChangesDiffs(content);
    this.domNode = $(".checkpoint-file-changes-summary.checkpoint-file-changes-compact");
    this.detailsElement = document.createElement("details");
    this.detailsElement.classList.add("checkpoint-file-changes-disclosure");
    this.domNode.appendChild(this.detailsElement);
    const headerDomNode = this.detailsElement.appendChild(document.createElement("summary"));
    headerDomNode.classList.add("checkpoint-file-changes-summary-header");
    this._register(autorun((r) => {
      const hasChanges = this.fileChangesDiffsObservable.read(r).length > 0;
      this.domNode.style.display = hasChanges ? "" : "none";
    }));
    this._register(this.renderHeader(headerDomNode));
    this._register(this.renderFilesList(this.detailsElement));
    this._register(dom.addDisposableListener(headerDomNode, "click", () => {
      this.domNode.dispatchEvent(new CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));
    }));
  }
  computeFileChangesDiffs({ requestId, sessionResource }) {
    const fromProvider = this.chatResponseFileChangesService.getChangesForRequest(sessionResource, requestId);
    if (fromProvider) {
      return fromProvider;
    }
    return this.chatService.chatModels.map((models) => Iterable.find(models, (m) => isEqual(m.sessionResource, sessionResource))).map((model) => model?.editingSession?.getDiffsForFilesInRequest(requestId)).map((diffs, r) => diffs?.read(r) || Iterable.empty());
  }
  getCachedEntryDiffBetweenRequests(editSession, uri, startRequestId, stopRequestId) {
    const key = `${uri}\0${startRequestId}\0${stopRequestId}`;
    let observable = this.diffsBetweenRequests.get(key);
    if (!observable) {
      observable = editSession.getEntryDiffBetweenRequests(uri, startRequestId, stopRequestId);
      this.diffsBetweenRequests.set(key, observable);
    }
    return observable;
  }
  renderHeader(container) {
    const filesLabel = container.appendChild($("span.chat-file-changes-label"));
    const counts = container.appendChild($("span.chat-file-changes-counts", { "aria-hidden": "true" }));
    const addedLabel = counts.appendChild($("span.insertions"));
    const removedLabel = counts.appendChild($("span.deletions"));
    const disposables = new DisposableStore();
    disposables.add(this.renderViewAllFileChangesButton(container));
    const chevron = container.appendChild($("span.chat-file-changes-chevron.chat-collapsible-hover-chevron", { "aria-hidden": "true" }));
    chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));
    this._register(autorun((r) => {
      const diffs = this.fileChangesDiffsObservable.read(r);
      const fileCountLabel = diffs.length === 1 ? localize("chat.fileChanges.oneFile", "1 file changed") : localize("chat.fileChanges.manyFiles", "{0} files changed", diffs.length);
      const additions = diffs.reduce((total, diff) => total + diff.added, 0);
      const deletions = diffs.reduce((total, diff) => total + diff.removed, 0);
      filesLabel.textContent = fileCountLabel;
      addedLabel.textContent = `+${additions}`;
      removedLabel.textContent = `-${deletions}`;
      container.setAttribute("aria-label", localize(
        "chat.fileChanges.accessibleSummary",
        "{0}, {1} lines added, {2} lines deleted",
        fileCountLabel,
        additions,
        deletions
      ));
    }));
    const setExpansionState = () => {
      container.setAttribute("aria-expanded", String(this.detailsElement.open));
      chevron.classList.toggle("expanded", this.detailsElement.open);
    };
    setExpansionState();
    disposables.add(dom.addDisposableListener(this.detailsElement, "toggle", setExpansionState));
    return toDisposable(() => disposables.dispose());
  }
  renderViewAllFileChangesButton(container) {
    const button = container.appendChild(document.createElement("button"));
    button.classList.add("chat-view-changes-icon");
    button.type = "button";
    const hoverDisposable = this.hoverService.setupDelayedHover(button, () => ({
      content: localize2("chat.viewFileChangesSummary", "View All File Changes")
    }));
    button.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
    button.setAttribute("aria-label", localize("chat.viewFileChangesSummary", "View All File Changes"));
    return combinedDisposable(hoverDisposable, dom.addDisposableListener(button, "click", (e) => {
      const resources = this.fileChangesDiffsObservable.get().map((diff) => ({
        originalUri: diff.originalURI,
        modifiedUri: diff.modifiedURI
      }));
      const source = URI.parse(`multi-diff-editor:${(/* @__PURE__ */ new Date()).getMilliseconds().toString() + Math.random().toString()}`);
      const input = this.instantiationService.createInstance(
        MultiDiffEditorInput,
        source,
        localize("chat.checkpointFileChanges", "Checkpoint File Changes"),
        resources.map((resource) => {
          return new MultiDiffEditorItem(
            resource.originalUri,
            resource.modifiedUri,
            void 0
          );
        }),
        false
      );
      this.editorService.openEditor(input);
      dom.EventHelper.stop(e, true);
    }));
  }
  renderFilesList(container) {
    return renderChangesSummaryFileList(container, this.fileChangesDiffsObservable, this.instantiationService, this.editorService, this.configurationService);
  }
  hasSameContent(other, followingContent, element) {
    return other.kind === "changesSummary" && other.requestId === this.content.requestId;
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatCheckpointFileChangesSummaryContentPart = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, IChatService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IChatResponseFileChangesService)
], ChatCheckpointFileChangesSummaryContentPart);
let CollapsibleChangesSummaryListPool = class extends Disposable {
  constructor(options, instantiationService, themeService) {
    super();
    this.options = options;
    this.instantiationService = instantiationService;
    this.themeService = themeService;
    this._resourcePool = this._register(new ResourcePool(() => this.listFactory()));
  }
  listFactory() {
    const container = $(".chat-summary-list");
    const store = new DisposableStore();
    store.add(createFileIconThemableTreeContainerScope(container, this.themeService));
    const resourceLabels = store.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: () => Disposable.None }));
    const list = store.add(this.instantiationService.createInstance(
      WorkbenchList,
      "ChatListRenderer",
      container,
      new CollapsibleChangesSummaryListDelegate(),
      [new CollapsibleChangesSummaryListRenderer(resourceLabels, this.options)],
      {
        alwaysConsumeMouseWheel: false
      }
    ));
    return {
      list,
      dispose: () => {
        store.dispose();
      }
    };
  }
  get() {
    return this._resourcePool.get().list;
  }
};
CollapsibleChangesSummaryListPool = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IThemeService)
], CollapsibleChangesSummaryListPool);
class CollapsibleChangesSummaryListDelegate {
  getHeight(element) {
    return CHANGES_SUMMARY_ELEMENT_HEIGHT;
  }
  getTemplateId(element) {
    return CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;
  }
}
const _CollapsibleChangesSummaryListRenderer = class _CollapsibleChangesSummaryListRenderer {
  constructor(labels, options) {
    this.labels = labels;
    this.options = options;
    this.templateId = _CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const label = this.labels.create(container, { supportHighlights: true, supportIcons: true });
    let actionBar;
    if (this.options?.getRowActions) {
      container.classList.add("chat-summary-list-row-with-actions");
      const actionsContainer = container.appendChild($(".chat-summary-list-actions"));
      actionBar = new ActionBar(actionsContainer);
    }
    return {
      label,
      actionBar,
      dispose: () => {
        label.dispose();
        actionBar?.dispose();
      }
    };
  }
  renderElement(data, index, templateData) {
    const label = templateData.label;
    label.setFile(data.modifiedURI, {
      fileKind: FileKind.FILE,
      title: data.modifiedURI.path
    });
    const labelElement = label.element;
    templateData.changesElement?.remove();
    if (!data.identical && !data.isBusy) {
      const changesSummary = labelElement.appendChild($(`.${_CollapsibleChangesSummaryListRenderer.CHANGES_SUMMARY_CLASS_NAME}`));
      const added = changesSummary.appendChild($(`.insertions`));
      added.textContent = `+${data.added}`;
      const removed = changesSummary.appendChild($(`.deletions`));
      removed.textContent = `-${data.removed}`;
      templateData.changesElement = changesSummary;
    }
    if (templateData.actionBar && this.options?.getRowActions) {
      templateData.actionBar.clear();
      templateData.actionBar.push(this.options.getRowActions(data), { icon: false, label: true });
    }
  }
  disposeTemplate(templateData) {
    templateData.dispose();
  }
};
_CollapsibleChangesSummaryListRenderer.TEMPLATE_ID = "collapsibleChangesSummaryListRenderer";
_CollapsibleChangesSummaryListRenderer.CHANGES_SUMMARY_CLASS_NAME = "insertions-and-deletions";
let CollapsibleChangesSummaryListRenderer = _CollapsibleChangesSummaryListRenderer;
export {
  ChatCheckpointFileChangesSummaryContentPart,
  renderChangesSummaryFileList
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q2hhbmdlc1N1bW1hcnlQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUxpc3RSZW5kZXJlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VMYWJlbCwgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVGaWxlSWNvblRoZW1hYmxlVHJlZUNvbnRhaW5lclNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZmlsZXMvYnJvd3Nlci92aWV3cy9leHBsb3JlclZpZXcuanMnO1xuaW1wb3J0IHsgTXVsdGlEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9tdWx0aURpZmZFZGl0b3IvYnJvd3Nlci9tdWx0aURpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vbXVsdGlEaWZmRWRpdG9yL2Jyb3dzZXIvbXVsdGlEaWZmU291cmNlUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0RWRpdGluZ1Nlc3Npb24sIElFZGl0U2Vzc2lvbkVudHJ5RGlmZiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ1NuYXBzaG90VGV4dE1vZGVsQ29udGVudFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdUZXh0TW9kZWxDb250ZW50UHJvdmlkZXJzLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRDaGFuZ2VzU3VtbWFyeVBhcnQgYXMgSUNoYXRGaWxlQ2hhbmdlc1N1bW1hcnlQYXJ0LCBJQ2hhdFJlbmRlcmVyQ29udGVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VQb29sIH0gZnJvbSAnLi9jaGF0Q29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydCwgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuXG5jb25zdCBDSEFOR0VTX1NVTU1BUllfRUxFTUVOVF9IRUlHSFQgPSAyMjtcbmNvbnN0IENIQU5HRVNfU1VNTUFSWV9NQVhfSVRFTVNfU0hPV04gPSA2O1xuXG4vKiogT3B0aW9ucyBjb250cm9sbGluZyBob3cge0BsaW5rIHJlbmRlckNoYW5nZXNTdW1tYXJ5RmlsZUxpc3R9IHJlbmRlcnMgZWFjaCByb3cuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGFuZ2VzU3VtbWFyeUZpbGVMaXN0T3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBQcm92aWRlcyB0aGUgYWN0aW9ucyBzaG93biBpbiBhIHBlci1yb3cgYWN0aW9uIGJhciAocmlnaHQtYWxpZ25lZCkuIFJldHVyblxuXHQgKiBhbiBlbXB0eSBhcnJheSBmb3Igcm93cyB0aGF0IHNob3VsZCBoYXZlIG5vIGFjdGlvbnMuIFdoZW4gb21pdHRlZCwgbm8gYWN0aW9uXG5cdCAqIGJhciBpcyByZW5kZXJlZC5cblx0ICovXG5cdHJlYWRvbmx5IGdldFJvd0FjdGlvbnM/OiAoZGlmZjogSUVkaXRTZXNzaW9uRW50cnlEaWZmKSA9PiBJQWN0aW9uW107XG59XG5cbi8qKlxuICogUmVuZGVycyB0aGUgY29sbGFwc2libGUgbGlzdCBvZiBjaGFuZ2VkIGZpbGVzIChvbmUgcm93IHBlciB7QGxpbmsgSUVkaXRTZXNzaW9uRW50cnlEaWZmfSxcbiAqIHNob3dpbmcgdGhlIGZpbGUncyByZXNvdXJjZSBsYWJlbCBhbmQgaXRzICthZGRlZC8tcmVtb3ZlZCBjb3VudHMpIGludG8gYGNvbnRhaW5lcmAsXG4gKiBrZWVwaW5nIGl0IGluIHN5bmMgd2l0aCBgZGlmZnNgLiBSb3dzIG9wZW4gdGhlIGZpbGUgb3IgaXRzIGRpZmYgb24gYWN0aXZhdGlvbi5cbiAqIFNoYXJlZCBieSB0aGUgY2hlY2twb2ludCBmaWxlIGNoYW5nZXMgc3VtbWFyeSBhbmQgdGhlIGFnZW50IHR1cm4gY2hhbmdlcyBzdW1tYXJ5XG4gKiBzbyBib3RoIHJlbmRlciBhbiBpZGVudGljYWwgbGlzdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckNoYW5nZXNTdW1tYXJ5RmlsZUxpc3QoXG5cdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdGRpZmZzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJRWRpdFNlc3Npb25FbnRyeURpZmZbXT4sXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRvcHRpb25zPzogSUNoYW5nZXNTdW1tYXJ5RmlsZUxpc3RPcHRpb25zLFxuKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgbGlzdCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2xsYXBzaWJsZUNoYW5nZXNTdW1tYXJ5TGlzdFBvb2wsIG9wdGlvbnMpKS5nZXQoKTtcblx0Y29uc3QgbGlzdE5vZGUgPSBsaXN0LmdldEhUTUxFbGVtZW50KCk7XG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChsaXN0Tm9kZS5wYXJlbnRFbGVtZW50ISk7XG5cblx0c3RvcmUuYWRkKGxpc3Qub25EaWRPcGVuKChpdGVtKSA9PiB7XG5cdFx0Y29uc3QgZGlmZiA9IGl0ZW0uZWxlbWVudDtcblx0XHRpZiAoIWRpZmYpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhbHRLZXkgPSAoZG9tLmlzTW91c2VFdmVudChpdGVtLmJyb3dzZXJFdmVudCkgfHwgZG9tLmlzS2V5Ym9hcmRFdmVudChpdGVtLmJyb3dzZXJFdmVudCkpICYmIGl0ZW0uYnJvd3NlckV2ZW50LmFsdEtleTtcblx0XHRjb25zdCBvcGVuSW5EaWZmRWRpdG9yQnlEZWZhdWx0ID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uT3BlbkNoYW5nZWRGaWxlSW5EaWZmRWRpdG9yKTtcblx0XHRjb25zdCBvcGVuSW5EaWZmRWRpdG9yID0gYWx0S2V5ID8gIW9wZW5JbkRpZmZFZGl0b3JCeURlZmF1bHQgOiBvcGVuSW5EaWZmRWRpdG9yQnlEZWZhdWx0O1xuXG5cdFx0aWYgKCFvcGVuSW5EaWZmRWRpdG9yKSB7XG5cdFx0XHRjb25zdCBmaWxlVVJJID0gQ2hhdEVkaXRpbmdTbmFwc2hvdFRleHRNb2RlbENvbnRlbnRQcm92aWRlci5nZXRPcmlnaW5hbEZpbGVVUkkoZGlmZi5tb2RpZmllZFVSSSk7XG5cdFx0XHRpZiAoZmlsZVVSSSkge1xuXHRcdFx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogZmlsZVVSSSwgb3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0gfSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFRoZSBmaWxlJ3Mgb3JpZ2luIGNhbm5vdCBiZSByZWNvdmVyZWQgKGUuZy4gbGVnYWN5IHNuYXBzaG90IFVSSXMpOlxuXHRcdFx0Ly8gZmFsbCBiYWNrIHRvIHRoZSBkaWZmIGVkaXRvci5cblx0XHR9XG5cblx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IGRpZmYub3JpZ2luYWxVUkkgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBkaWZmLm1vZGlmaWVkVVJJIH0sXG5cdFx0XHRvcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IHRydWUgfVxuXHRcdH0pO1xuXHR9KSk7XG5cblx0c3RvcmUuYWRkKGxpc3Qub25Db250ZXh0TWVudShlID0+IHtcblx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLmJyb3dzZXJFdmVudCwgdHJ1ZSk7XG5cdH0pKTtcblxuXHRzdG9yZS5hZGQoYXV0b3J1bigocikgPT4ge1xuXHRcdGNvbnN0IGN1cnJlbnREaWZmcyA9IGRpZmZzLnJlYWQocik7XG5cblx0XHRjb25zdCBpdGVtc1Nob3duID0gTWF0aC5taW4oY3VycmVudERpZmZzLmxlbmd0aCwgQ0hBTkdFU19TVU1NQVJZX01BWF9JVEVNU19TSE9XTik7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gaXRlbXNTaG93biAqIENIQU5HRVNfU1VNTUFSWV9FTEVNRU5UX0hFSUdIVDtcblx0XHRsaXN0LmxheW91dChoZWlnaHQpO1xuXHRcdGxpc3ROb2RlLnN0eWxlLmhlaWdodCA9IGhlaWdodCArICdweCc7XG5cblx0XHRsaXN0LnNwbGljZSgwLCBsaXN0Lmxlbmd0aCwgY3VycmVudERpZmZzKTtcblx0fSkpO1xuXG5cdHJldHVybiBzdG9yZTtcbn1cblxuXG5leHBvcnQgY2xhc3MgQ2hhdENoZWNrcG9pbnRGaWxlQ2hhbmdlc1N1bW1hcnlDb250ZW50UGFydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdENvbnRlbnRQYXJ0IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaWZmc0JldHdlZW5SZXF1ZXN0cyA9IG5ldyBNYXA8c3RyaW5nLCBJT2JzZXJ2YWJsZTxJRWRpdFNlc3Npb25FbnRyeURpZmYgfCB1bmRlZmluZWQ+PigpO1xuXG5cdHByaXZhdGUgZmlsZUNoYW5nZXNEaWZmc09ic2VydmFibGU6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdPjtcblx0cHJpdmF0ZSByZWFkb25seSBkZXRhaWxzRWxlbWVudDogSFRNTERldGFpbHNFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGVudDogSUNoYXRGaWxlQ2hhbmdlc1N1bW1hcnlQYXJ0LFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlOiBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5maWxlQ2hhbmdlc0RpZmZzT2JzZXJ2YWJsZSA9IHRoaXMuY29tcHV0ZUZpbGVDaGFuZ2VzRGlmZnMoY29udGVudCk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSAkKCcuY2hlY2twb2ludC1maWxlLWNoYW5nZXMtc3VtbWFyeS5jaGVja3BvaW50LWZpbGUtY2hhbmdlcy1jb21wYWN0Jyk7XG5cdFx0dGhpcy5kZXRhaWxzRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RldGFpbHMnKTtcblx0XHR0aGlzLmRldGFpbHNFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoZWNrcG9pbnQtZmlsZS1jaGFuZ2VzLWRpc2Nsb3N1cmUnKTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5kZXRhaWxzRWxlbWVudCk7XG5cdFx0Y29uc3QgaGVhZGVyRG9tTm9kZSA9IHRoaXMuZGV0YWlsc0VsZW1lbnQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3VtbWFyeScpKTtcblx0XHRoZWFkZXJEb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoZWNrcG9pbnQtZmlsZS1jaGFuZ2VzLXN1bW1hcnktaGVhZGVyJyk7XG5cblx0XHQvLyBIaWRlIHRoZSB3aG9sZSBzdW1tYXJ5IHdoZW4gdGhlcmUgYXJlIG5vIGNoYW5nZXMgdG8gc2hvdy4gVGhlIHBhcnQgaXNcblx0XHQvLyBjcmVhdGVkIGVhZ2VybHkgZm9yIGNvbXBsZXRlZCByZXNwb25zZXMsIGJ1dCBzZXNzaW9uIHR5cGVzIHdob3NlXG5cdFx0Ly8gY2hhbmdlcyBhcmUgY29tcHV0ZWQgYXN5bmNocm9ub3VzbHkgKGUuZy4gYWdlbnQgaG9zdCB0dXJuIGNoYW5nZXNldHMpXG5cdFx0Ly8gb25seSBrbm93IHdoZXRoZXIgYSB0dXJuIHByb2R1Y2VkIGVkaXRzIG9uY2UgdGhlIGRpZmZzIHJlc29sdmUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IGhhc0NoYW5nZXMgPSB0aGlzLmZpbGVDaGFuZ2VzRGlmZnNPYnNlcnZhYmxlLnJlYWQocikubGVuZ3RoID4gMDtcblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gaGFzQ2hhbmdlcyA/ICcnIDogJ25vbmUnO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVuZGVySGVhZGVyKGhlYWRlckRvbU5vZGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlbmRlckZpbGVzTGlzdCh0aGlzLmRldGFpbHNFbGVtZW50KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihoZWFkZXJEb21Ob2RlLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQudXNlclRvZ2dsZUV2ZW50LCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUZpbGVDaGFuZ2VzRGlmZnMoeyByZXF1ZXN0SWQsIHNlc3Npb25SZXNvdXJjZSB9OiBJQ2hhdEZpbGVDaGFuZ2VzU3VtbWFyeVBhcnQpIHtcblx0XHQvLyBQcmVmZXIgYSBzZXNzaW9uLXR5cGUtc3BlY2lmaWMgcHJvdmlkZXIgKHRoZSBhdXRob3JpdGF0aXZlIHNvdXJjZSBmb3Jcblx0XHQvLyBzZXNzaW9uIHR5cGVzIHRoYXQgb3duIHRoZWlyIG93biBjaGFuZ2UgY29tcHV0YXRpb24pOyBvdGhlcndpc2UgZmFsbFxuXHRcdC8vIGJhY2sgdG8gdGhlIGNoYXQgZWRpdGluZyBzZXNzaW9uJ3MgcGVyLXJlcXVlc3QgZGlmZnMuXG5cdFx0Y29uc3QgZnJvbVByb3ZpZGVyID0gdGhpcy5jaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0ZvclJlcXVlc3Qoc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0SWQpO1xuXHRcdGlmIChmcm9tUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBmcm9tUHJvdmlkZXI7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNoYXRTZXJ2aWNlLmNoYXRNb2RlbHNcblx0XHRcdC5tYXAobW9kZWxzID0+IEl0ZXJhYmxlLmZpbmQobW9kZWxzLCBtID0+IGlzRXF1YWwobS5zZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25SZXNvdXJjZSkpKVxuXHRcdFx0Lm1hcChtb2RlbCA9PiBtb2RlbD8uZWRpdGluZ1Nlc3Npb24/LmdldERpZmZzRm9yRmlsZXNJblJlcXVlc3QocmVxdWVzdElkKSlcblx0XHRcdC5tYXAoKGRpZmZzLCByKSA9PiBkaWZmcz8ucmVhZChyKSB8fCBJdGVyYWJsZS5lbXB0eSgpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDYWNoZWRFbnRyeURpZmZCZXR3ZWVuUmVxdWVzdHMoZWRpdFNlc3Npb246IElDaGF0RWRpdGluZ1Nlc3Npb24sIHVyaTogVVJJLCBzdGFydFJlcXVlc3RJZDogc3RyaW5nLCBzdG9wUmVxdWVzdElkOiBzdHJpbmcpOiBJT2JzZXJ2YWJsZTxJRWRpdFNlc3Npb25FbnRyeURpZmYgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBrZXkgPSBgJHt1cml9XFwwJHtzdGFydFJlcXVlc3RJZH1cXDAke3N0b3BSZXF1ZXN0SWR9YDtcblx0XHRsZXQgb2JzZXJ2YWJsZSA9IHRoaXMuZGlmZnNCZXR3ZWVuUmVxdWVzdHMuZ2V0KGtleSk7XG5cdFx0aWYgKCFvYnNlcnZhYmxlKSB7XG5cdFx0XHRvYnNlcnZhYmxlID0gZWRpdFNlc3Npb24uZ2V0RW50cnlEaWZmQmV0d2VlblJlcXVlc3RzKHVyaSwgc3RhcnRSZXF1ZXN0SWQsIHN0b3BSZXF1ZXN0SWQpO1xuXHRcdFx0dGhpcy5kaWZmc0JldHdlZW5SZXF1ZXN0cy5zZXQoa2V5LCBvYnNlcnZhYmxlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG9ic2VydmFibGU7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckhlYWRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGZpbGVzTGFiZWwgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnc3Bhbi5jaGF0LWZpbGUtY2hhbmdlcy1sYWJlbCcpKTtcblx0XHRjb25zdCBjb3VudHMgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnc3Bhbi5jaGF0LWZpbGUtY2hhbmdlcy1jb3VudHMnLCB7ICdhcmlhLWhpZGRlbic6ICd0cnVlJyB9KSk7XG5cdFx0Y29uc3QgYWRkZWRMYWJlbCA9IGNvdW50cy5hcHBlbmRDaGlsZCgkKCdzcGFuLmluc2VydGlvbnMnKSk7XG5cdFx0Y29uc3QgcmVtb3ZlZExhYmVsID0gY291bnRzLmFwcGVuZENoaWxkKCQoJ3NwYW4uZGVsZXRpb25zJykpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnJlbmRlclZpZXdBbGxGaWxlQ2hhbmdlc0J1dHRvbihjb250YWluZXIpKTtcblx0XHRjb25zdCBjaGV2cm9uID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJ3NwYW4uY2hhdC1maWxlLWNoYW5nZXMtY2hldnJvbi5jaGF0LWNvbGxhcHNpYmxlLWhvdmVyLWNoZXZyb24nLCB7ICdhcmlhLWhpZGRlbic6ICd0cnVlJyB9KSk7XG5cdFx0Y2hldnJvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uY2hldnJvblJpZ2h0KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZnMgPSB0aGlzLmZpbGVDaGFuZ2VzRGlmZnNPYnNlcnZhYmxlLnJlYWQocik7XG5cdFx0XHRjb25zdCBmaWxlQ291bnRMYWJlbCA9IGRpZmZzLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LmZpbGVDaGFuZ2VzLm9uZUZpbGUnLCAnMSBmaWxlIGNoYW5nZWQnKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0LmZpbGVDaGFuZ2VzLm1hbnlGaWxlcycsICd7MH0gZmlsZXMgY2hhbmdlZCcsIGRpZmZzLmxlbmd0aCk7XG5cdFx0XHRjb25zdCBhZGRpdGlvbnMgPSBkaWZmcy5yZWR1Y2UoKHRvdGFsLCBkaWZmKSA9PiB0b3RhbCArIGRpZmYuYWRkZWQsIDApO1xuXHRcdFx0Y29uc3QgZGVsZXRpb25zID0gZGlmZnMucmVkdWNlKCh0b3RhbCwgZGlmZikgPT4gdG90YWwgKyBkaWZmLnJlbW92ZWQsIDApO1xuXHRcdFx0ZmlsZXNMYWJlbC50ZXh0Q29udGVudCA9IGZpbGVDb3VudExhYmVsO1xuXHRcdFx0YWRkZWRMYWJlbC50ZXh0Q29udGVudCA9IGArJHthZGRpdGlvbnN9YDtcblx0XHRcdHJlbW92ZWRMYWJlbC50ZXh0Q29udGVudCA9IGAtJHtkZWxldGlvbnN9YDtcblx0XHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZShcblx0XHRcdFx0J2NoYXQuZmlsZUNoYW5nZXMuYWNjZXNzaWJsZVN1bW1hcnknLFxuXHRcdFx0XHQnezB9LCB7MX0gbGluZXMgYWRkZWQsIHsyfSBsaW5lcyBkZWxldGVkJyxcblx0XHRcdFx0ZmlsZUNvdW50TGFiZWwsXG5cdFx0XHRcdGFkZGl0aW9ucyxcblx0XHRcdFx0ZGVsZXRpb25zXG5cdFx0XHQpKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXRFeHBhbnNpb25TdGF0ZSA9ICgpID0+IHtcblx0XHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcodGhpcy5kZXRhaWxzRWxlbWVudC5vcGVuKSk7XG5cdFx0XHRjaGV2cm9uLmNsYXNzTGlzdC50b2dnbGUoJ2V4cGFuZGVkJywgdGhpcy5kZXRhaWxzRWxlbWVudC5vcGVuKTtcblx0XHR9O1xuXHRcdHNldEV4cGFuc2lvblN0YXRlKCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRldGFpbHNFbGVtZW50LCAndG9nZ2xlJywgc2V0RXhwYW5zaW9uU3RhdGUpKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclZpZXdBbGxGaWxlQ2hhbmdlc0J1dHRvbihjb250YWluZXI6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGJ1dHRvbiA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKSk7XG5cdFx0YnV0dG9uLmNsYXNzTGlzdC5hZGQoJ2NoYXQtdmlldy1jaGFuZ2VzLWljb24nKTtcblx0XHRidXR0b24udHlwZSA9ICdidXR0b24nO1xuXHRcdGNvbnN0IGhvdmVyRGlzcG9zYWJsZSA9IHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKGJ1dHRvbiwgKCkgPT4gKHtcblx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplMignY2hhdC52aWV3RmlsZUNoYW5nZXNTdW1tYXJ5JywgJ1ZpZXcgQWxsIEZpbGUgQ2hhbmdlcycpXG5cdFx0fSkpO1xuXHRcdGJ1dHRvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZGlmZk11bHRpcGxlKSk7XG5cdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0LnZpZXdGaWxlQ2hhbmdlc1N1bW1hcnknLCAnVmlldyBBbGwgRmlsZSBDaGFuZ2VzJykpO1xuXG5cdFx0cmV0dXJuIGNvbWJpbmVkRGlzcG9zYWJsZShob3ZlckRpc3Bvc2FibGUsIGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCAnY2xpY2snLCAoZSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VzOiB7IG9yaWdpbmFsVXJpOiBVUkk7IG1vZGlmaWVkVXJpPzogVVJJIH1bXSA9IHRoaXMuZmlsZUNoYW5nZXNEaWZmc09ic2VydmFibGUuZ2V0KCkubWFwKGRpZmYgPT4gKHtcblx0XHRcdFx0b3JpZ2luYWxVcmk6IGRpZmYub3JpZ2luYWxVUkksXG5cdFx0XHRcdG1vZGlmaWVkVXJpOiBkaWZmLm1vZGlmaWVkVVJJXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IHNvdXJjZSA9IFVSSS5wYXJzZShgbXVsdGktZGlmZi1lZGl0b3I6JHtuZXcgRGF0ZSgpLmdldE1pbGxpc2Vjb25kcygpLnRvU3RyaW5nKCkgKyBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdE11bHRpRGlmZkVkaXRvcklucHV0LFxuXHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdGxvY2FsaXplKCdjaGF0LmNoZWNrcG9pbnRGaWxlQ2hhbmdlcycsICdDaGVja3BvaW50IEZpbGUgQ2hhbmdlcycpLFxuXHRcdFx0XHRyZXNvdXJjZXMubWFwKHJlc291cmNlID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IE11bHRpRGlmZkVkaXRvckl0ZW0oXG5cdFx0XHRcdFx0XHRyZXNvdXJjZS5vcmlnaW5hbFVyaSxcblx0XHRcdFx0XHRcdHJlc291cmNlLm1vZGlmaWVkVXJpLFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KTtcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0KTtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRmlsZXNMaXN0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHJlbmRlckNoYW5nZXNTdW1tYXJ5RmlsZUxpc3QoY29udGFpbmVyLCB0aGlzLmZpbGVDaGFuZ2VzRGlmZnNPYnNlcnZhYmxlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLmVkaXRvclNlcnZpY2UsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50LCBmb2xsb3dpbmdDb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdLCBlbGVtZW50OiBDaGF0VHJlZUl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gb3RoZXIua2luZCA9PT0gJ2NoYW5nZXNTdW1tYXJ5JyAmJiBvdGhlci5yZXF1ZXN0SWQgPT09IHRoaXMuY29udGVudC5yZXF1ZXN0SWQ7XG5cdH1cblxuXHRhZGREaXNwb3NhYmxlKGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElDaGF0RmlsZUNoYW5nZXNTdW1tYXJ5TGlzdFdyYXBwZXIgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdGxpc3Q6IFdvcmtiZW5jaExpc3Q8SUVkaXRTZXNzaW9uRW50cnlEaWZmPjtcbn1cblxuY2xhc3MgQ29sbGFwc2libGVDaGFuZ2VzU3VtbWFyeUxpc3RQb29sIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfcmVzb3VyY2VQb29sOiBSZXNvdXJjZVBvb2w8SUNoYXRGaWxlQ2hhbmdlc1N1bW1hcnlMaXN0V3JhcHBlcj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJQ2hhbmdlc1N1bW1hcnlGaWxlTGlzdE9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZXNvdXJjZVBvb2wgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVzb3VyY2VQb29sKCgpID0+IHRoaXMubGlzdEZhY3RvcnkoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBsaXN0RmFjdG9yeSgpOiBJQ2hhdEZpbGVDaGFuZ2VzU3VtbWFyeUxpc3RXcmFwcGVyIHtcblx0XHRjb25zdCBjb250YWluZXIgPSAkKCcuY2hhdC1zdW1tYXJ5LWxpc3QnKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQoY3JlYXRlRmlsZUljb25UaGVtYWJsZVRyZWVDb250YWluZXJTY29wZShjb250YWluZXIsIHRoaXMudGhlbWVTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2VMYWJlbHMgPSBzdG9yZS5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVscywgeyBvbkRpZENoYW5nZVZpc2liaWxpdHk6ICgpID0+IERpc3Bvc2FibGUuTm9uZSB9KSk7XG5cdFx0Y29uc3QgbGlzdCA9IHN0b3JlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoTGlzdDxJRWRpdFNlc3Npb25FbnRyeURpZmY+LFxuXHRcdFx0J0NoYXRMaXN0UmVuZGVyZXInLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0bmV3IENvbGxhcHNpYmxlQ2hhbmdlc1N1bW1hcnlMaXN0RGVsZWdhdGUoKSxcblx0XHRcdFtuZXcgQ29sbGFwc2libGVDaGFuZ2VzU3VtbWFyeUxpc3RSZW5kZXJlcihyZXNvdXJjZUxhYmVscywgdGhpcy5vcHRpb25zKV0sXG5cdFx0XHR7XG5cdFx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiBmYWxzZVxuXHRcdFx0fVxuXHRcdCkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRsaXN0OiBsaXN0LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGdldCgpOiBXb3JrYmVuY2hMaXN0PElFZGl0U2Vzc2lvbkVudHJ5RGlmZj4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXNvdXJjZVBvb2wuZ2V0KCkubGlzdDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUNvbGxhcHNpYmxlQ2hhbmdlc1N1bW1hcnlMaXN0VGVtcGxhdGUgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcblx0cmVhZG9ubHkgYWN0aW9uQmFyPzogQWN0aW9uQmFyO1xuXHRjaGFuZ2VzRWxlbWVudD86IEhUTUxFbGVtZW50O1xufVxuXG5jbGFzcyBDb2xsYXBzaWJsZUNoYW5nZXNTdW1tYXJ5TGlzdERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SUVkaXRTZXNzaW9uRW50cnlEaWZmPiB7XG5cblx0Z2V0SGVpZ2h0KGVsZW1lbnQ6IElFZGl0U2Vzc2lvbkVudHJ5RGlmZik6IG51bWJlciB7XG5cdFx0cmV0dXJuIENIQU5HRVNfU1VNTUFSWV9FTEVNRU5UX0hFSUdIVDtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogSUVkaXRTZXNzaW9uRW50cnlEaWZmKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gQ29sbGFwc2libGVDaGFuZ2VzU3VtbWFyeUxpc3RSZW5kZXJlci5URU1QTEFURV9JRDtcblx0fVxufVxuXG5jbGFzcyBDb2xsYXBzaWJsZUNoYW5nZXNTdW1tYXJ5TGlzdFJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJRWRpdFNlc3Npb25FbnRyeURpZmYsIElDb2xsYXBzaWJsZUNoYW5nZXNTdW1tYXJ5TGlzdFRlbXBsYXRlPiB7XG5cblx0c3RhdGljIFRFTVBMQVRFX0lEID0gJ2NvbGxhcHNpYmxlQ2hhbmdlc1N1bW1hcnlMaXN0UmVuZGVyZXInO1xuXHRzdGF0aWMgQ0hBTkdFU19TVU1NQVJZX0NMQVNTX05BTUUgPSAnaW5zZXJ0aW9ucy1hbmQtZGVsZXRpb25zJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBDb2xsYXBzaWJsZUNoYW5nZXNTdW1tYXJ5TGlzdFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgbGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM/OiBJQ2hhbmdlc1N1bW1hcnlGaWxlTGlzdE9wdGlvbnMsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElDb2xsYXBzaWJsZUNoYW5nZXNTdW1tYXJ5TGlzdFRlbXBsYXRlIHtcblx0XHRjb25zdCBsYWJlbCA9IHRoaXMubGFiZWxzLmNyZWF0ZShjb250YWluZXIsIHsgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KTtcblx0XHQvLyBPbmx5IHdoZW4gYSByb3ctYWN0aW9uIHByb3ZpZGVyIGlzIHN1cHBsaWVkIGRvIHdlIGFkZCBhIHJpZ2h0LWFsaWduZWRcblx0XHQvLyBhY3Rpb24gYmFyOyB0aGUgcm93IGJlY29tZXMgYSBmbGV4IHJvdyBzbyB0aGUgbGFiZWwgZmlsbHMgdGhlIHJlbWFpbmluZ1xuXHRcdC8vIHdpZHRoIGFuZCB0aGUgYWN0aW9ucyBodWcgdGhlIHJpZ2h0IGVkZ2UuXG5cdFx0bGV0IGFjdGlvbkJhcjogQWN0aW9uQmFyIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLm9wdGlvbnM/LmdldFJvd0FjdGlvbnMpIHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LXN1bW1hcnktbGlzdC1yb3ctd2l0aC1hY3Rpb25zJyk7XG5cdFx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5jaGF0LXN1bW1hcnktbGlzdC1hY3Rpb25zJykpO1xuXHRcdFx0YWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihhY3Rpb25zQ29udGFpbmVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsLFxuXHRcdFx0YWN0aW9uQmFyLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRsYWJlbC5kaXNwb3NlKCk7XG5cdFx0XHRcdGFjdGlvbkJhcj8uZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGRhdGE6IElFZGl0U2Vzc2lvbkVudHJ5RGlmZiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ29sbGFwc2libGVDaGFuZ2VzU3VtbWFyeUxpc3RUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGxhYmVsID0gdGVtcGxhdGVEYXRhLmxhYmVsO1xuXHRcdGxhYmVsLnNldEZpbGUoZGF0YS5tb2RpZmllZFVSSSwge1xuXHRcdFx0ZmlsZUtpbmQ6IEZpbGVLaW5kLkZJTEUsXG5cdFx0XHR0aXRsZTogZGF0YS5tb2RpZmllZFVSSS5wYXRoXG5cdFx0fSk7XG5cdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gbGFiZWwuZWxlbWVudDtcblxuXHRcdHRlbXBsYXRlRGF0YS5jaGFuZ2VzRWxlbWVudD8ucmVtb3ZlKCk7XG5cblx0XHRpZiAoIWRhdGEuaWRlbnRpY2FsICYmICFkYXRhLmlzQnVzeSkge1xuXHRcdFx0Y29uc3QgY2hhbmdlc1N1bW1hcnkgPSBsYWJlbEVsZW1lbnQuYXBwZW5kQ2hpbGQoJChgLiR7Q29sbGFwc2libGVDaGFuZ2VzU3VtbWFyeUxpc3RSZW5kZXJlci5DSEFOR0VTX1NVTU1BUllfQ0xBU1NfTkFNRX1gKSk7XG5cblx0XHRcdGNvbnN0IGFkZGVkID0gY2hhbmdlc1N1bW1hcnkuYXBwZW5kQ2hpbGQoJChgLmluc2VydGlvbnNgKSk7XG5cdFx0XHRhZGRlZC50ZXh0Q29udGVudCA9IGArJHtkYXRhLmFkZGVkfWA7XG5cblx0XHRcdGNvbnN0IHJlbW92ZWQgPSBjaGFuZ2VzU3VtbWFyeS5hcHBlbmRDaGlsZCgkKGAuZGVsZXRpb25zYCkpO1xuXHRcdFx0cmVtb3ZlZC50ZXh0Q29udGVudCA9IGAtJHtkYXRhLnJlbW92ZWR9YDtcblxuXHRcdFx0dGVtcGxhdGVEYXRhLmNoYW5nZXNFbGVtZW50ID0gY2hhbmdlc1N1bW1hcnk7XG5cdFx0fVxuXG5cdFx0aWYgKHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIgJiYgdGhpcy5vcHRpb25zPy5nZXRSb3dBY3Rpb25zKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2godGhpcy5vcHRpb25zLmdldFJvd0FjdGlvbnMoZGF0YSksIHsgaWNvbjogZmFsc2UsIGxhYmVsOiB0cnVlIH0pO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElDb2xsYXBzaWJsZUNoYW5nZXNTdW1tYXJ5TGlzdFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bv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RUosZUFBZSxXQUFnRTtBQUM5RSxVQUFNLFFBQVEsS0FBSyxPQUFPLE9BQU8sV0FBVyxFQUFFLG1CQUFtQixNQUFNLGNBQWMsS0FBSyxDQUFDO0FBSTNGLFFBQUk7QUFDSixRQUFJLEtBQUssU0FBUyxlQUFlO0FBQ2hDLGdCQUFVLFVBQVUsSUFBSSxvQ0FBb0M7QUFDNUQsWUFBTSxtQkFBbUIsVUFBVSxZQUFZLEVBQUUsNEJBQTRCLENBQUM7QUFDOUUsa0JBQVksSUFBSSxVQUFVLGdCQUFnQjtBQUFBLElBQzNDO0FBQ0EsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQSxTQUFTLE1BQU07QUFDZCxjQUFNLFFBQVE7QUFDZCxtQkFBVyxRQUFRO0FBQUEsTUFDcEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsY0FBYyxNQUE2QixPQUFlLGNBQTREO0FBQ3JILFVBQU0sUUFBUSxhQUFhO0FBQzNCLFVBQU0sUUFBUSxLQUFLLGFBQWE7QUFBQSxNQUMvQixVQUFVLFNBQVM7QUFBQSxNQUNuQixPQUFPLEtBQUssWUFBWTtBQUFBLElBQ3pCLENBQUM7QUFDRCxVQUFNLGVBQWUsTUFBTTtBQUUzQixpQkFBYSxnQkFBZ0IsT0FBTztBQUVwQyxRQUFJLENBQUMsS0FBSyxhQUFhLENBQUMsS0FBSyxRQUFRO0FBQ3BDLFlBQU0saUJBQWlCLGFBQWEsWUFBWSxFQUFFLElBQUksdUNBQXNDLDBCQUEwQixFQUFFLENBQUM7QUFFekgsWUFBTSxRQUFRLGVBQWUsWUFBWSxFQUFFLGFBQWEsQ0FBQztBQUN6RCxZQUFNLGNBQWMsSUFBSSxLQUFLLEtBQUs7QUFFbEMsWUFBTSxVQUFVLGVBQWUsWUFBWSxFQUFFLFlBQVksQ0FBQztBQUMxRCxjQUFRLGNBQWMsSUFBSSxLQUFLLE9BQU87QUFFdEMsbUJBQWEsaUJBQWlCO0FBQUEsSUFDL0I7QUFFQSxRQUFJLGFBQWEsYUFBYSxLQUFLLFNBQVMsZUFBZTtBQUMxRCxtQkFBYSxVQUFVLE1BQU07QUFDN0IsbUJBQWEsVUFBVSxLQUFLLEtBQUssUUFBUSxjQUFjLElBQUksR0FBRyxFQUFFLE1BQU0sT0FBTyxPQUFPLEtBQUssQ0FBQztBQUFBLElBQzNGO0FBQUEsRUFDRDtBQUFBLEVBRUEsZ0JBQWdCLGNBQTREO0FBQzNFLGlCQUFhLFFBQVE7QUFBQSxFQUN0QjtBQUNEO0FBaEVNLHVDQUVFLGNBQWM7QUFGaEIsdUNBR0UsNkJBQTZCO0FBSHJDLElBQU0sd0NBQU47IiwKICAibmFtZXMiOiBbXQp9Cg==
