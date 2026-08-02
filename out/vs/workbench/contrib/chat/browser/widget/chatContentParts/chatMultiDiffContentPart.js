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
import { ButtonWithIcon } from "../../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../../../base/common/marshallingIds.js";
import { autorun, constObservable, isObservable } from "../../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { FileKind } from "../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { WorkbenchList } from "../../../../../../platform/list/browser/listService.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { ResourceLabels } from "../../../../../browser/labels.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../../../services/editor/common/editorService.js";
import { createFileIconThemableTreeContainerScope } from "../../../../files/browser/views/explorerView.js";
import { MultiDiffEditorInput } from "../../../../multiDiffEditor/browser/multiDiffEditorInput.js";
import { MultiDiffEditorItem } from "../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { ChatEditingSnapshotTextModelContentProvider } from "../../chatEditing/chatEditingTextModelContentProviders.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { getChatSessionType } from "../../../common/model/chatUri.js";
const $ = dom.$;
const ELEMENT_HEIGHT = 22;
const MAX_ITEMS_SHOWN = 6;
let ChatMultiDiffContentPart = class extends Disposable {
  constructor(content, _element, instantiationService, editorService, themeService, contextKeyService, configurationService) {
    super();
    this.content = content;
    this._element = _element;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.themeService = themeService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.isCollapsed = false;
    this.readOnly = content.readOnly ?? false;
    this.diffData = isObservable(this.content.multiDiffData) ? this.content.multiDiffData.map((d) => d) : constObservable(this.content.multiDiffData);
    const headerDomNode = $(".checkpoint-file-changes-summary-header");
    this.domNode = $(".checkpoint-file-changes-summary", void 0, headerDomNode);
    this.domNode.tabIndex = 0;
    this.isCollapsed = content?.collapsed ?? false;
    this._register(this.renderHeader(headerDomNode));
    this._register(this.renderFilesList(this.domNode));
  }
  renderHeader(container) {
    const viewListButtonContainer = container.appendChild($(".chat-file-changes-label"));
    const viewListButton = new ButtonWithIcon(viewListButtonContainer, {});
    this._register(autorun((reader) => {
      const fileCount = this.diffData.read(reader).resources.length;
      viewListButton.label = fileCount === 1 ? localize("chatMultiDiff.oneFile", "Changed 1 file") : localize("chatMultiDiff.manyFiles", "Changed {0} files", fileCount);
    }));
    const setExpansionState = () => {
      viewListButton.icon = this.isCollapsed ? Codicon.chevronRight : Codicon.chevronDown;
      this.domNode.classList.toggle("chat-file-changes-collapsed", this.isCollapsed);
    };
    setExpansionState();
    const disposables = new DisposableStore();
    disposables.add(viewListButton);
    disposables.add(viewListButton.onDidClick(() => {
      this.isCollapsed = !this.isCollapsed;
      setExpansionState();
    }));
    if (!this.readOnly) {
      disposables.add(this.renderViewAllFileChangesButton(viewListButton.element));
    }
    disposables.add(this.renderContributedButtons(viewListButton.element));
    return toDisposable(() => disposables.dispose());
  }
  renderViewAllFileChangesButton(container) {
    const button = container.appendChild($(".chat-view-changes-icon"));
    button.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
    button.title = localize("chatMultiDiff.openAllChanges", "Open Changes");
    return dom.addDisposableListener(button, "click", (e) => {
      const source = URI.parse(`multi-diff-editor:${(/* @__PURE__ */ new Date()).getMilliseconds().toString() + Math.random().toString()}`);
      const { title, resources } = this.diffData.get();
      const input = this.instantiationService.createInstance(
        MultiDiffEditorInput,
        source,
        title || "Multi-Diff",
        resources.map((resource) => new MultiDiffEditorItem(
          resource.originalUri,
          resource.modifiedUri,
          resource.goToFileUri
        )),
        false
      );
      const sideBySide = e.altKey;
      this.editorService.openEditor(input, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
      dom.EventHelper.stop(e, true);
    });
  }
  renderContributedButtons(container) {
    const buttonsContainer = container.appendChild($(".chat-multidiff-contributed-buttons"));
    const disposables = new DisposableStore();
    const type = getChatSessionType(this._element.sessionResource);
    const overlay = this.contextKeyService.createOverlay([
      [ChatContextKeys.agentSessionType.key, type]
    ]);
    const nestedInsta = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, overlay])));
    const marshalledUri = {
      ...this._element.sessionResource,
      $mid: MarshalledId.Uri
    };
    disposables.add(nestedInsta.createInstance(
      MenuWorkbenchToolBar,
      buttonsContainer,
      MenuId.ChatMultiDiffContext,
      {
        menuOptions: {
          arg: marshalledUri,
          shouldForwardArgs: true
        },
        toolbarOptions: {
          primaryGroup: () => true
        }
      }
    ));
    return disposables;
  }
  renderFilesList(container) {
    const store = new DisposableStore();
    const listContainer = container.appendChild($(".chat-summary-list"));
    store.add(createFileIconThemableTreeContainerScope(listContainer, this.themeService));
    const resourceLabels = store.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: Event.None }));
    this.list = store.add(this.instantiationService.createInstance(
      WorkbenchList,
      "ChatMultiDiffList",
      listContainer,
      new ChatMultiDiffListDelegate(),
      [this.instantiationService.createInstance(ChatMultiDiffListRenderer, resourceLabels)],
      {
        identityProvider: {
          getId: (element) => element.uri.toString()
        },
        setRowLineHeight: true,
        horizontalScrolling: false,
        supportDynamicHeights: false,
        mouseSupport: !this.readOnly,
        alwaysConsumeMouseWheel: false,
        accessibilityProvider: {
          getAriaLabel: (element) => element.uri.path,
          getWidgetAriaLabel: () => localize("chatMultiDiffList", "File Changes")
        }
      }
    ));
    this._register(autorun((reader) => {
      const { resources } = this.diffData.read(reader);
      const items = [];
      for (const resource of resources) {
        const uri = resource.modifiedUri || resource.originalUri || resource.goToFileUri;
        if (!uri) {
          continue;
        }
        const item = { uri };
        if (resource.originalUri && resource.modifiedUri) {
          item.diff = {
            originalURI: resource.originalUri,
            modifiedURI: resource.modifiedUri,
            isFinal: true,
            quitEarly: false,
            identical: false,
            added: resource.added || 0,
            removed: resource.removed || 0,
            isBusy: false
          };
        }
        items.push(item);
      }
      this.list.splice(0, this.list.length, items);
      const height = Math.min(items.length, MAX_ITEMS_SHOWN) * ELEMENT_HEIGHT;
      this.list.layout(height);
      listContainer.style.height = `${height}px`;
    }));
    if (!this.readOnly) {
      store.add(this.list.onDidOpen((e) => {
        if (!e.element) {
          return;
        }
        const altKey = (dom.isMouseEvent(e.browserEvent) || dom.isKeyboardEvent(e.browserEvent)) && e.browserEvent.altKey;
        const openInDiffEditorByDefault = this.configurationService.getValue(ChatConfiguration.OpenChangedFileInDiffEditor);
        const openInDiffEditor = altKey ? !openInDiffEditorByDefault : openInDiffEditorByDefault;
        if (e.element.diff && !openInDiffEditor) {
          const fileURI = ChatEditingSnapshotTextModelContentProvider.getOriginalFileURI(e.element.diff.modifiedURI);
          if (fileURI) {
            this.editorService.openEditor({ resource: fileURI, options: { preserveFocus: true } });
            return;
          }
        }
        if (e.element.diff) {
          this.editorService.openEditor({
            original: { resource: e.element.diff.originalURI },
            modified: { resource: e.element.diff.modifiedURI },
            options: { preserveFocus: true }
          });
        } else {
          const fileURI = ChatEditingSnapshotTextModelContentProvider.getOriginalFileURI(e.element.uri) ?? e.element.uri;
          this.editorService.openEditor({
            resource: fileURI,
            options: { preserveFocus: true }
          });
        }
      }));
    }
    return store;
  }
  hasSameContent(other) {
    return other.kind === "multiDiffData" && this.diffData.get().resources.length === (isObservable(other.multiDiffData) ? other.multiDiffData.get().resources.length : other.multiDiffData.resources.length);
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatMultiDiffContentPart = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IConfigurationService)
], ChatMultiDiffContentPart);
class ChatMultiDiffListDelegate {
  getHeight() {
    return 22;
  }
  getTemplateId() {
    return "chatMultiDiffItem";
  }
}
const _ChatMultiDiffListRenderer = class _ChatMultiDiffListRenderer {
  constructor(labels) {
    this.labels = labels;
    this.templateId = _ChatMultiDiffListRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const label = this.labels.create(container, { supportHighlights: true, supportIcons: true });
    return {
      label,
      dispose: () => label.dispose()
    };
  }
  renderElement(element, _index, templateData) {
    templateData.label.setFile(element.uri, {
      fileKind: FileKind.FILE,
      title: element.uri.path
    });
    const labelElement = templateData.label.element;
    templateData.changesElement?.remove();
    if (element.diff?.added || element.diff?.removed) {
      const changesSummary = labelElement.appendChild($(`.${_ChatMultiDiffListRenderer.CHANGES_SUMMARY_CLASS_NAME}`));
      const addedElement = changesSummary.appendChild($(".insertions"));
      addedElement.textContent = `+${element.diff.added}`;
      const removedElement = changesSummary.appendChild($(".deletions"));
      removedElement.textContent = `-${element.diff.removed}`;
      changesSummary.setAttribute("aria-label", localize("chatEditingSession.fileCounts", "{0} lines added, {1} lines removed", element.diff.added, element.diff.removed));
      templateData.changesElement = changesSummary;
    }
  }
  disposeTemplate(templateData) {
    templateData.dispose();
  }
};
_ChatMultiDiffListRenderer.TEMPLATE_ID = "chatMultiDiffItem";
_ChatMultiDiffListRenderer.CHANGES_SUMMARY_CLASS_NAME = "insertions-and-deletions";
let ChatMultiDiffListRenderer = _ChatMultiDiffListRenderer;
export {
  ChatMultiDiffContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0TXVsdGlEaWZmQ29udGVudFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCdXR0b25XaXRoSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IElMaXN0UmVuZGVyZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZSwgaXNPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlTGFiZWwsIFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgQUNUSVZFX0dST1VQLCBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVGaWxlSWNvblRoZW1hYmxlVHJlZUNvbnRhaW5lclNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZmlsZXMvYnJvd3Nlci92aWV3cy9leHBsb3JlclZpZXcuanMnO1xuaW1wb3J0IHsgTXVsdGlEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9tdWx0aURpZmZFZGl0b3IvYnJvd3Nlci9tdWx0aURpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vbXVsdGlEaWZmRWRpdG9yL2Jyb3dzZXIvbXVsdGlEaWZmU291cmNlUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJRWRpdFNlc3Npb25FbnRyeURpZmYgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRpbmdTbmFwc2hvdFRleHRNb2RlbENvbnRlbnRQcm92aWRlciB9IGZyb20gJy4uLy4uL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nVGV4dE1vZGVsQ29udGVudFByb3ZpZGVycy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRNdWx0aURpZmZEYXRhLCBJQ2hhdE11bHRpRGlmZkRhdGFTZXJpYWxpemVkLCBJQ2hhdE11bHRpRGlmZklubmVyRGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlbmRlcmVyQ29udGVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuaW50ZXJmYWNlIElDaGF0TXVsdGlEaWZmSXRlbSB7XG5cdHVyaTogVVJJO1xuXHRkaWZmPzogSUVkaXRTZXNzaW9uRW50cnlEaWZmO1xufVxuXG5jb25zdCBFTEVNRU5UX0hFSUdIVCA9IDIyO1xuY29uc3QgTUFYX0lURU1TX1NIT1dOID0gNjtcblxuZXhwb3J0IGNsYXNzIENoYXRNdWx0aURpZmZDb250ZW50UGFydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgbGlzdCE6IFdvcmtiZW5jaExpc3Q8SUNoYXRNdWx0aURpZmZJdGVtPjtcblx0cHJpdmF0ZSBpc0NvbGxhcHNlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlYWRPbmx5OiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpZmZEYXRhOiBJT2JzZXJ2YWJsZTxJQ2hhdE11bHRpRGlmZklubmVyRGF0YT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50OiBJQ2hhdE11bHRpRGlmZkRhdGEgfCBJQ2hhdE11bHRpRGlmZkRhdGFTZXJpYWxpemVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VsZW1lbnQ6IENoYXRUcmVlSXRlbSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVhZE9ubHkgPSBjb250ZW50LnJlYWRPbmx5ID8/IGZhbHNlO1xuXHRcdHRoaXMuZGlmZkRhdGEgPSBpc09ic2VydmFibGUodGhpcy5jb250ZW50Lm11bHRpRGlmZkRhdGEpXG5cdFx0XHQ/IHRoaXMuY29udGVudC5tdWx0aURpZmZEYXRhLm1hcChkID0+IGQpXG5cdFx0XHQ6IGNvbnN0T2JzZXJ2YWJsZSh0aGlzLmNvbnRlbnQubXVsdGlEaWZmRGF0YSk7XG5cblx0XHRjb25zdCBoZWFkZXJEb21Ob2RlID0gJCgnLmNoZWNrcG9pbnQtZmlsZS1jaGFuZ2VzLXN1bW1hcnktaGVhZGVyJyk7XG5cdFx0dGhpcy5kb21Ob2RlID0gJCgnLmNoZWNrcG9pbnQtZmlsZS1jaGFuZ2VzLXN1bW1hcnknLCB1bmRlZmluZWQsIGhlYWRlckRvbU5vZGUpO1xuXHRcdHRoaXMuZG9tTm9kZS50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5pc0NvbGxhcHNlZCA9IGNvbnRlbnQ/LmNvbGxhcHNlZCA/PyBmYWxzZTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVuZGVySGVhZGVyKGhlYWRlckRvbU5vZGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlbmRlckZpbGVzTGlzdCh0aGlzLmRvbU5vZGUpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVySGVhZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgdmlld0xpc3RCdXR0b25Db250YWluZXIgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnLmNoYXQtZmlsZS1jaGFuZ2VzLWxhYmVsJykpO1xuXHRcdGNvbnN0IHZpZXdMaXN0QnV0dG9uID0gbmV3IEJ1dHRvbldpdGhJY29uKHZpZXdMaXN0QnV0dG9uQ29udGFpbmVyLCB7fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZUNvdW50ID0gdGhpcy5kaWZmRGF0YS5yZWFkKHJlYWRlcikucmVzb3VyY2VzLmxlbmd0aDtcblx0XHRcdHZpZXdMaXN0QnV0dG9uLmxhYmVsID0gZmlsZUNvdW50ID09PSAxXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXRNdWx0aURpZmYub25lRmlsZScsICdDaGFuZ2VkIDEgZmlsZScpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXRNdWx0aURpZmYubWFueUZpbGVzJywgJ0NoYW5nZWQgezB9IGZpbGVzJywgZmlsZUNvdW50KTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXRFeHBhbnNpb25TdGF0ZSA9ICgpID0+IHtcblx0XHRcdHZpZXdMaXN0QnV0dG9uLmljb24gPSB0aGlzLmlzQ29sbGFwc2VkID8gQ29kaWNvbi5jaGV2cm9uUmlnaHQgOiBDb2RpY29uLmNoZXZyb25Eb3duO1xuXHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtZmlsZS1jaGFuZ2VzLWNvbGxhcHNlZCcsIHRoaXMuaXNDb2xsYXBzZWQpO1xuXHRcdH07XG5cdFx0c2V0RXhwYW5zaW9uU3RhdGUoKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3TGlzdEJ1dHRvbik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdMaXN0QnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dGhpcy5pc0NvbGxhcHNlZCA9ICF0aGlzLmlzQ29sbGFwc2VkO1xuXHRcdFx0c2V0RXhwYW5zaW9uU3RhdGUoKTtcblx0XHR9KSk7XG5cdFx0aWYgKCF0aGlzLnJlYWRPbmx5KSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5yZW5kZXJWaWV3QWxsRmlsZUNoYW5nZXNCdXR0b24odmlld0xpc3RCdXR0b24uZWxlbWVudCkpO1xuXHRcdH1cblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5yZW5kZXJDb250cmlidXRlZEJ1dHRvbnModmlld0xpc3RCdXR0b24uZWxlbWVudCkpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVmlld0FsbEZpbGVDaGFuZ2VzQnV0dG9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgYnV0dG9uID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5jaGF0LXZpZXctY2hhbmdlcy1pY29uJykpO1xuXHRcdGJ1dHRvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZGlmZk11bHRpcGxlKSk7XG5cdFx0YnV0dG9uLnRpdGxlID0gbG9jYWxpemUoJ2NoYXRNdWx0aURpZmYub3BlbkFsbENoYW5nZXMnLCAnT3BlbiBDaGFuZ2VzJyk7XG5cblx0XHRyZXR1cm4gZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBVUkkucGFyc2UoYG11bHRpLWRpZmYtZWRpdG9yOiR7bmV3IERhdGUoKS5nZXRNaWxsaXNlY29uZHMoKS50b1N0cmluZygpICsgTWF0aC5yYW5kb20oKS50b1N0cmluZygpfWApO1xuXHRcdFx0Y29uc3QgeyB0aXRsZSwgcmVzb3VyY2VzIH0gPSB0aGlzLmRpZmZEYXRhLmdldCgpO1xuXHRcdFx0Y29uc3QgaW5wdXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRNdWx0aURpZmZFZGl0b3JJbnB1dCxcblx0XHRcdFx0c291cmNlLFxuXHRcdFx0XHR0aXRsZSB8fCAnTXVsdGktRGlmZicsXG5cdFx0XHRcdHJlc291cmNlcy5tYXAocmVzb3VyY2UgPT4gbmV3IE11bHRpRGlmZkVkaXRvckl0ZW0oXG5cdFx0XHRcdFx0cmVzb3VyY2Uub3JpZ2luYWxVcmksXG5cdFx0XHRcdFx0cmVzb3VyY2UubW9kaWZpZWRVcmksXG5cdFx0XHRcdFx0cmVzb3VyY2UuZ29Ub0ZpbGVVcmlcblx0XHRcdFx0KSksXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc2lkZUJ5U2lkZSA9IGUuYWx0S2V5O1xuXHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHNpZGVCeVNpZGUgPyBTSURFX0dST1VQIDogQUNUSVZFX0dST1VQKTtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb250cmlidXRlZEJ1dHRvbnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBidXR0b25zQ29udGFpbmVyID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5jaGF0LW11bHRpZGlmZi1jb250cmlidXRlZC1idXR0b25zJykpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgdHlwZSA9IGdldENoYXRTZXNzaW9uVHlwZSh0aGlzLl9lbGVtZW50LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3Qgb3ZlcmxheSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShbXG5cdFx0XHRbQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblR5cGUua2V5LCB0eXBlXVxuXHRcdF0pO1xuXHRcdGNvbnN0IG5lc3RlZEluc3RhID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIG92ZXJsYXldKSkpO1xuXG5cdFx0Y29uc3QgbWFyc2hhbGxlZFVyaSA9IHtcblx0XHRcdC4uLnRoaXMuX2VsZW1lbnQuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLlVyaVxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobmVzdGVkSW5zdGEuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRNZW51V29ya2JlbmNoVG9vbEJhcixcblx0XHRcdGJ1dHRvbnNDb250YWluZXIsXG5cdFx0XHRNZW51SWQuQ2hhdE11bHRpRGlmZkNvbnRleHQsXG5cdFx0XHR7XG5cdFx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdFx0YXJnOiBtYXJzaGFsbGVkVXJpLFxuXHRcdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0b29sYmFyT3B0aW9uczoge1xuXHRcdFx0XHRcdHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRmlsZXNMaXN0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBsaXN0Q29udGFpbmVyID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5jaGF0LXN1bW1hcnktbGlzdCcpKTtcblx0XHRzdG9yZS5hZGQoY3JlYXRlRmlsZUljb25UaGVtYWJsZVRyZWVDb250YWluZXJTY29wZShsaXN0Q29udGFpbmVyLCB0aGlzLnRoZW1lU2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc291cmNlTGFiZWxzID0gc3RvcmUuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIHsgb25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudC5Ob25lIH0pKTtcblxuXHRcdHRoaXMubGlzdCA9IHN0b3JlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoTGlzdDxJQ2hhdE11bHRpRGlmZkl0ZW0+LFxuXHRcdFx0J0NoYXRNdWx0aURpZmZMaXN0Jyxcblx0XHRcdGxpc3RDb250YWluZXIsXG5cdFx0XHRuZXcgQ2hhdE11bHRpRGlmZkxpc3REZWxlZ2F0ZSgpLFxuXHRcdFx0W3RoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE11bHRpRGlmZkxpc3RSZW5kZXJlciwgcmVzb3VyY2VMYWJlbHMpXSxcblx0XHRcdHtcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkOiAoZWxlbWVudDogSUNoYXRNdWx0aURpZmZJdGVtKSA9PiBlbGVtZW50LnVyaS50b1N0cmluZygpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IHRydWUsXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRzdXBwb3J0RHluYW1pY0hlaWdodHM6IGZhbHNlLFxuXHRcdFx0XHRtb3VzZVN1cHBvcnQ6ICF0aGlzLnJlYWRPbmx5LFxuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2UsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbDogKGVsZW1lbnQ6IElDaGF0TXVsdGlEaWZmSXRlbSkgPT4gZWxlbWVudC51cmkucGF0aCxcblx0XHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKCdjaGF0TXVsdGlEaWZmTGlzdCcsIFwiRmlsZSBDaGFuZ2VzXCIpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHsgcmVzb3VyY2VzIH0gPSB0aGlzLmRpZmZEYXRhLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgaXRlbXM6IElDaGF0TXVsdGlEaWZmSXRlbVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHJlc291cmNlcykge1xuXHRcdFx0XHRjb25zdCB1cmkgPSByZXNvdXJjZS5tb2RpZmllZFVyaSB8fCByZXNvdXJjZS5vcmlnaW5hbFVyaSB8fCByZXNvdXJjZS5nb1RvRmlsZVVyaTtcblx0XHRcdFx0aWYgKCF1cmkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGl0ZW06IElDaGF0TXVsdGlEaWZmSXRlbSA9IHsgdXJpIH07XG5cblx0XHRcdFx0aWYgKHJlc291cmNlLm9yaWdpbmFsVXJpICYmIHJlc291cmNlLm1vZGlmaWVkVXJpKSB7XG5cdFx0XHRcdFx0aXRlbS5kaWZmID0ge1xuXHRcdFx0XHRcdFx0b3JpZ2luYWxVUkk6IHJlc291cmNlLm9yaWdpbmFsVXJpLFxuXHRcdFx0XHRcdFx0bW9kaWZpZWRVUkk6IHJlc291cmNlLm1vZGlmaWVkVXJpLFxuXHRcdFx0XHRcdFx0aXNGaW5hbDogdHJ1ZSxcblx0XHRcdFx0XHRcdHF1aXRFYXJseTogZmFsc2UsXG5cdFx0XHRcdFx0XHRpZGVudGljYWw6IGZhbHNlLFxuXHRcdFx0XHRcdFx0YWRkZWQ6IHJlc291cmNlLmFkZGVkIHx8IDAsXG5cdFx0XHRcdFx0XHRyZW1vdmVkOiByZXNvdXJjZS5yZW1vdmVkIHx8IDAsXG5cdFx0XHRcdFx0XHRpc0J1c3k6IGZhbHNlLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aXRlbXMucHVzaChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5saXN0LnNwbGljZSgwLCB0aGlzLmxpc3QubGVuZ3RoLCBpdGVtcyk7XG5cblx0XHRcdGNvbnN0IGhlaWdodCA9IE1hdGgubWluKGl0ZW1zLmxlbmd0aCwgTUFYX0lURU1TX1NIT1dOKSAqIEVMRU1FTlRfSEVJR0hUO1xuXHRcdFx0dGhpcy5saXN0LmxheW91dChoZWlnaHQpO1xuXHRcdFx0bGlzdENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdH0pKTtcblxuXG5cdFx0aWYgKCF0aGlzLnJlYWRPbmx5KSB7XG5cdFx0XHRzdG9yZS5hZGQodGhpcy5saXN0Lm9uRGlkT3BlbigoZSkgPT4ge1xuXHRcdFx0XHRpZiAoIWUuZWxlbWVudCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGFsdEtleSA9IChkb20uaXNNb3VzZUV2ZW50KGUuYnJvd3NlckV2ZW50KSB8fCBkb20uaXNLZXlib2FyZEV2ZW50KGUuYnJvd3NlckV2ZW50KSkgJiYgZS5icm93c2VyRXZlbnQuYWx0S2V5O1xuXHRcdFx0XHRjb25zdCBvcGVuSW5EaWZmRWRpdG9yQnlEZWZhdWx0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5PcGVuQ2hhbmdlZEZpbGVJbkRpZmZFZGl0b3IpO1xuXHRcdFx0XHRjb25zdCBvcGVuSW5EaWZmRWRpdG9yID0gYWx0S2V5ID8gIW9wZW5JbkRpZmZFZGl0b3JCeURlZmF1bHQgOiBvcGVuSW5EaWZmRWRpdG9yQnlEZWZhdWx0O1xuXG5cdFx0XHRcdGlmIChlLmVsZW1lbnQuZGlmZiAmJiAhb3BlbkluRGlmZkVkaXRvcikge1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVVUkkgPSBDaGF0RWRpdGluZ1NuYXBzaG90VGV4dE1vZGVsQ29udGVudFByb3ZpZGVyLmdldE9yaWdpbmFsRmlsZVVSSShlLmVsZW1lbnQuZGlmZi5tb2RpZmllZFVSSSk7XG5cdFx0XHRcdFx0aWYgKGZpbGVVUkkpIHtcblx0XHRcdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGZpbGVVUkksIG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9IH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBUaGUgZmlsZSdzIG9yaWdpbiBjYW5ub3QgYmUgcmVjb3ZlcmVkIChlLmcuIGxlZ2FjeSBzbmFwc2hvdCBVUklzKTpcblx0XHRcdFx0XHQvLyBmYWxsIGJhY2sgdG8gdGhlIGRpZmYgZWRpdG9yLlxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGUuZWxlbWVudC5kaWZmKSB7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IGUuZWxlbWVudC5kaWZmLm9yaWdpbmFsVVJJIH0sXG5cdFx0XHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogZS5lbGVtZW50LmRpZmYubW9kaWZpZWRVUkkgfSxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgZmlsZVVSSSA9IENoYXRFZGl0aW5nU25hcHNob3RUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIuZ2V0T3JpZ2luYWxGaWxlVVJJKGUuZWxlbWVudC51cmkpID8/IGUuZWxlbWVudC51cmk7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IGZpbGVVUkksXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IHRydWUgfVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIG90aGVyLmtpbmQgPT09ICdtdWx0aURpZmZEYXRhJyAmJiB0aGlzLmRpZmZEYXRhLmdldCgpLnJlc291cmNlcy5sZW5ndGggPT09IChpc09ic2VydmFibGUob3RoZXIubXVsdGlEaWZmRGF0YSkgPyBvdGhlci5tdWx0aURpZmZEYXRhLmdldCgpLnJlc291cmNlcy5sZW5ndGggOiBvdGhlci5tdWx0aURpZmZEYXRhLnJlc291cmNlcy5sZW5ndGgpO1xuXHR9XG5cblx0YWRkRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHR9XG59XG5cbmNsYXNzIENoYXRNdWx0aURpZmZMaXN0RGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJQ2hhdE11bHRpRGlmZkl0ZW0+IHtcblx0Z2V0SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDIyO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnY2hhdE11bHRpRGlmZkl0ZW0nO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQ2hhdE11bHRpRGlmZkl0ZW1UZW1wbGF0ZSBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgbGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRjaGFuZ2VzRWxlbWVudD86IEhUTUxFbGVtZW50O1xufVxuXG5jbGFzcyBDaGF0TXVsdGlEaWZmTGlzdFJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJQ2hhdE11bHRpRGlmZkl0ZW0sIElDaGF0TXVsdGlEaWZmSXRlbVRlbXBsYXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdjaGF0TXVsdGlEaWZmSXRlbSc7XG5cdHN0YXRpYyByZWFkb25seSBDSEFOR0VTX1NVTU1BUllfQ0xBU1NfTkFNRSA9ICdpbnNlcnRpb25zLWFuZC1kZWxldGlvbnMnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IENoYXRNdWx0aURpZmZMaXN0UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBsYWJlbHM6IFJlc291cmNlTGFiZWxzKSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUNoYXRNdWx0aURpZmZJdGVtVGVtcGxhdGUge1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5sYWJlbHMuY3JlYXRlKGNvbnRhaW5lciwgeyBzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gbGFiZWwuZGlzcG9zZSgpXG5cdFx0fTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSUNoYXRNdWx0aURpZmZJdGVtLCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ2hhdE11bHRpRGlmZkl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRGaWxlKGVsZW1lbnQudXJpLCB7XG5cdFx0XHRmaWxlS2luZDogRmlsZUtpbmQuRklMRSxcblx0XHRcdHRpdGxlOiBlbGVtZW50LnVyaS5wYXRoXG5cdFx0fSk7XG5cblx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSB0ZW1wbGF0ZURhdGEubGFiZWwuZWxlbWVudDtcblx0XHR0ZW1wbGF0ZURhdGEuY2hhbmdlc0VsZW1lbnQ/LnJlbW92ZSgpO1xuXG5cdFx0aWYgKGVsZW1lbnQuZGlmZj8uYWRkZWQgfHwgZWxlbWVudC5kaWZmPy5yZW1vdmVkKSB7XG5cdFx0XHRjb25zdCBjaGFuZ2VzU3VtbWFyeSA9IGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZCgkKGAuJHtDaGF0TXVsdGlEaWZmTGlzdFJlbmRlcmVyLkNIQU5HRVNfU1VNTUFSWV9DTEFTU19OQU1FfWApKTtcblxuXHRcdFx0Y29uc3QgYWRkZWRFbGVtZW50ID0gY2hhbmdlc1N1bW1hcnkuYXBwZW5kQ2hpbGQoJCgnLmluc2VydGlvbnMnKSk7XG5cdFx0XHRhZGRlZEVsZW1lbnQudGV4dENvbnRlbnQgPSBgKyR7ZWxlbWVudC5kaWZmLmFkZGVkfWA7XG5cblx0XHRcdGNvbnN0IHJlbW92ZWRFbGVtZW50ID0gY2hhbmdlc1N1bW1hcnkuYXBwZW5kQ2hpbGQoJCgnLmRlbGV0aW9ucycpKTtcblx0XHRcdHJlbW92ZWRFbGVtZW50LnRleHRDb250ZW50ID0gYC0ke2VsZW1lbnQuZGlmZi5yZW1vdmVkfWA7XG5cblx0XHRcdGNoYW5nZXNTdW1tYXJ5LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0RWRpdGluZ1Nlc3Npb24uZmlsZUNvdW50cycsICd7MH0gbGluZXMgYWRkZWQsIHsxfSBsaW5lcyByZW1vdmVkJywgZWxlbWVudC5kaWZmLmFkZGVkLCBlbGVtZW50LmRpZmYucmVtb3ZlZCkpO1xuXG5cdFx0XHR0ZW1wbGF0ZURhdGEuY2hhbmdlc0VsZW1lbnQgPSBjaGFuZ2VzU3VtbWFyeTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQ2hhdE11bHRpRGlmZkl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxTQUFTLGlCQUE4QixvQkFBb0I7QUFDcEUsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsY0FBYztBQUN2QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2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
