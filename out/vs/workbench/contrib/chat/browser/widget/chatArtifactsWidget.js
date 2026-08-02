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
import * as dom from "../../../../../base/browser/dom.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { autorun, derived, observableValue } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { toAction } from "../../../../../base/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchObjectTree } from "../../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { ChatConfiguration } from "../../common/constants.js";
import { ChatMemoryFileResource } from "../../common/chatArtifactExtraction.js";
import { IChatArtifactsService } from "../../common/tools/chatArtifactsService.js";
import { IChatImageCarouselService } from "../chatImageCarouselService.js";
import { getEditorOverrideForChatResource } from "./chatEditorAssociations.js";
const ARTIFACT_TYPE_ICONS = {
  devServer: Codicon.globe,
  screenshot: Codicon.file,
  plan: Codicon.book
};
function isGroupNode(element) {
  return element.kind === "group";
}
function isLeafNode(element) {
  return element.kind === "leaf";
}
let ChatArtifactsWidget = class extends Disposable {
  constructor(_chatArtifactsService, _instantiationService, _openerService, _configurationService, _commandService, _fileService, _fileDialogService, _chatImageCarouselService) {
    super();
    this._chatArtifactsService = _chatArtifactsService;
    this._instantiationService = _instantiationService;
    this._openerService = _openerService;
    this._configurationService = _configurationService;
    this._commandService = _commandService;
    this._fileService = _fileService;
    this._fileDialogService = _fileDialogService;
    this._chatImageCarouselService = _chatImageCarouselService;
    this._sessionResource = observableValue(this, void 0);
    this._isCollapsed = observableValue(this, false);
    this._currentArtifacts = derived(this, (reader) => {
      const sr = this._sessionResource.read(reader);
      return sr ? this._chatArtifactsService.getArtifacts(sr) : void 0;
    });
    this._treeData = derived(this, (reader) => {
      const artifacts = this._currentArtifacts.read(reader);
      if (!artifacts) {
        return void 0;
      }
      const groups = artifacts.artifactGroups.read(reader);
      const totalCount = groups.reduce((sum, g) => sum + g.artifacts.length, 0);
      if (totalCount === 0) {
        return void 0;
      }
      const multiSource = groups.length > 1;
      const treeElements = buildTreeElementsFromGroups(groups, multiSource, (source) => this._clearSource(source));
      const visibleCount = countVisibleRows(treeElements);
      const itemsShown = Math.min(visibleCount, ChatArtifactsWidget.MAX_ITEMS_SHOWN);
      return {
        totalCount,
        treeElements,
        treeHeight: itemsShown * ChatArtifactsWidget.ELEMENT_HEIGHT
      };
    });
    this.domNode = dom.$(".chat-artifacts-widget");
    this.domNode.style.display = "none";
    this._register(autorun((reader) => {
      const artifacts = this._currentArtifacts.read(reader);
      dom.clearNode(this.domNode);
      if (!artifacts) {
        this.domNode.style.display = "none";
        return;
      }
      const store = reader.store;
      const expandoContainer = dom.$(".chat-artifacts-expand");
      const headerButton = store.add(new Button(expandoContainer, { supportIcons: true }));
      const titleSection = dom.$(".chat-artifacts-title-section");
      const expandIcon = dom.$(".expand-icon.codicon");
      expandIcon.setAttribute("aria-hidden", "true");
      const titleElement = dom.$(".chat-artifacts-title");
      titleSection.appendChild(expandIcon);
      titleSection.appendChild(titleElement);
      headerButton.element.appendChild(titleSection);
      this.domNode.appendChild(expandoContainer);
      const listContainer = dom.$(".chat-artifacts-list");
      this.domNode.appendChild(listContainer);
      const tree = store.add(this._instantiationService.createInstance(
        WorkbenchObjectTree,
        "ChatArtifactsTree",
        listContainer,
        new ChatArtifactsTreeDelegate(),
        [
          new ChatArtifactGroupRenderer(),
          new ChatArtifactLeafRenderer((artifact) => this._saveArtifact(artifact))
        ],
        {
          alwaysConsumeMouseWheel: false,
          accessibilityProvider: new ChatArtifactsAccessibilityProvider()
        }
      ));
      store.add(tree.onDidOpen((e) => {
        if (!e.element) {
          return;
        }
        if (isGroupNode(e.element)) {
          if (e.element.onlyShowGroup) {
            this._openGroupInCarousel(e.element);
          }
        } else if (isLeafNode(e.element)) {
          this._openLeafArtifact(e.element.artifact);
        }
      }));
      store.add(headerButton.onDidClick(() => {
        this._isCollapsed.set(!this._isCollapsed.read(void 0), void 0);
      }));
      store.add(autorun((reader2) => {
        const collapsed = this._isCollapsed.read(reader2);
        expandIcon.classList.toggle("codicon-chevron-down", !collapsed);
        expandIcon.classList.toggle("codicon-chevron-right", collapsed);
        headerButton.element.setAttribute("aria-expanded", String(!collapsed));
        listContainer.style.display = collapsed ? "none" : "block";
      }));
      store.add(autorun((reader2) => {
        const data = this._treeData.read(reader2);
        if (!data) {
          this.domNode.style.display = "none";
          return;
        }
        this.domNode.style.display = "";
        titleElement.textContent = data.totalCount === 1 ? localize("chat.artifacts.one", "1 Artifact") : localize("chat.artifacts.count", "{0} Artifacts", data.totalCount);
        tree.layout(data.treeHeight);
        tree.getHTMLElement().style.height = `${data.treeHeight}px`;
        tree.setChildren(null, data.treeElements);
      }));
    }));
  }
  setSessionResource(sessionResource) {
    this._sessionResource.set(sessionResource, void 0);
  }
  async _openGroupInCarousel(group) {
    const first = group.artifacts[0];
    if (first?.uri) {
      await this._chatImageCarouselService.openCarouselAtResource(URI.parse(first.uri));
    }
  }
  _openLeafArtifact(artifact) {
    if (artifact.type === "screenshot" && this._configurationService.getValue(ChatConfiguration.ImageCarouselEnabled)) {
      this._openScreenshotInCarousel(artifact);
    } else if (artifact.uri) {
      const uri = URI.parse(artifact.uri);
      if (ChatMemoryFileResource.isChatMemoryFileUri(uri)) {
        this._openMemoryFileArtifact(uri);
      } else {
        const editorOverride = getEditorOverrideForChatResource(uri, this._configurationService);
        this._openerService.open(uri, {
          fromUserGesture: true,
          editorOptions: { override: editorOverride }
        });
      }
    }
  }
  async _openScreenshotInCarousel(clicked) {
    if (clicked.uri) {
      await this._chatImageCarouselService.openCarouselAtResource(URI.parse(clicked.uri));
    }
  }
  async _openMemoryFileArtifact(uri) {
    const { memoryPath, sessionResource } = ChatMemoryFileResource.parse(uri);
    const resolvedUriStr = await this._commandService.executeCommand(
      "github.copilot.chat.tools.memory.resolveMemoryFileUri",
      memoryPath,
      sessionResource
    );
    if (resolvedUriStr) {
      const resolvedUri = URI.parse(resolvedUriStr);
      const editorOverride = getEditorOverrideForChatResource(resolvedUri, this._configurationService);
      this._openerService.open(resolvedUri, {
        fromUserGesture: true,
        editorOptions: { override: editorOverride }
      });
    }
  }
  _clearSource(source) {
    const artifacts = this._currentArtifacts.get();
    if (!artifacts) {
      return;
    }
    switch (source.kind) {
      case "agent":
        artifacts.clearAgentArtifacts();
        break;
      case "subagent":
        artifacts.clearSubagentArtifacts(source.invocationId);
        break;
    }
  }
  async _saveArtifact(artifact) {
    const sourceUri = URI.parse(artifact.uri);
    const defaultFileName = sourceUri.path.split("/").pop() ?? artifact.label;
    const defaultPath = await this._fileDialogService.defaultFilePath();
    const defaultUri = URI.joinPath(defaultPath, defaultFileName);
    const targetUri = await this._fileDialogService.showSaveDialog({
      defaultUri,
      title: localize("chat.artifacts.saveDialog.title", "Save Artifact")
    });
    if (targetUri) {
      const content = await this._fileService.readFile(sourceUri);
      await this._fileService.writeFile(targetUri, content.value);
    }
  }
};
ChatArtifactsWidget.ELEMENT_HEIGHT = 22;
ChatArtifactsWidget.MAX_ITEMS_SHOWN = 6;
ChatArtifactsWidget = __decorateClass([
  __decorateParam(0, IChatArtifactsService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IOpenerService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IFileDialogService),
  __decorateParam(7, IChatImageCarouselService)
], ChatArtifactsWidget);
function sourceDisplayName(source) {
  switch (source.kind) {
    case "rules":
      return localize("chat.artifacts.source.rules", "Rules");
    case "agent":
      return localize("chat.artifacts.source.agent", "Agent");
    case "subagent":
      return source.name ?? localize("chat.artifacts.source.subagent", "Subagent");
  }
}
function buildTreeElementsFromGroups(sourceGroups, multiSource, onClearSource) {
  const elements = [];
  for (const sourceGroup of sourceGroups) {
    const prefix = multiSource ? sourceDisplayName(sourceGroup.source) : void 0;
    const clearable = sourceGroup.source.kind !== "rules";
    const onClear = clearable ? () => onClearSource(sourceGroup.source) : void 0;
    const groups = /* @__PURE__ */ new Map();
    const ungrouped = [];
    for (const artifact of sourceGroup.artifacts) {
      if (artifact.groupName) {
        let group = groups.get(artifact.groupName);
        if (!group) {
          group = { config: { groupName: artifact.groupName, onlyShowGroup: artifact.onlyShowGroup ?? false }, artifacts: [] };
          groups.set(artifact.groupName, group);
        }
        group.artifacts.push(artifact);
      } else {
        ungrouped.push(artifact);
      }
    }
    for (const [, group] of groups) {
      const displayName = prefix ? `${prefix}: ${group.config.groupName}` : group.config.groupName;
      if (group.artifacts.length === 1 && !group.config.onlyShowGroup) {
        elements.push({ element: { kind: "leaf", artifact: group.artifacts[0], description: displayName, onClear } });
        continue;
      }
      const groupNode = {
        kind: "group",
        groupName: displayName,
        artifacts: group.artifacts,
        onlyShowGroup: group.config.onlyShowGroup,
        onClear
      };
      if (group.config.onlyShowGroup) {
        elements.push({ element: groupNode, collapsible: false, collapsed: false });
      } else {
        elements.push({
          element: groupNode,
          collapsible: true,
          collapsed: false,
          children: group.artifacts.map((a) => ({ element: { kind: "leaf", artifact: a } }))
        });
      }
    }
    if (ungrouped.length > 0 && prefix) {
      if (ungrouped.length === 1) {
        elements.push({ element: { kind: "leaf", artifact: ungrouped[0], description: prefix, onClear } });
      } else {
        const groupNode = {
          kind: "group",
          groupName: prefix,
          artifacts: ungrouped,
          onlyShowGroup: false,
          onClear
        };
        elements.push({
          element: groupNode,
          collapsible: true,
          collapsed: false,
          children: ungrouped.map((a) => ({ element: { kind: "leaf", artifact: a } }))
        });
      }
    } else {
      for (const artifact of ungrouped) {
        elements.push({ element: { kind: "leaf", artifact, onClear } });
      }
    }
  }
  return elements;
}
function countVisibleRows(elements) {
  let count = 0;
  for (const el of elements) {
    count++;
    if (el.children && !el.collapsed) {
      count += countVisibleRows([...el.children]);
    }
  }
  return count;
}
class ChatArtifactsTreeDelegate {
  getHeight() {
    return ChatArtifactsWidget.ELEMENT_HEIGHT;
  }
  getTemplateId(element) {
    return isGroupNode(element) ? ChatArtifactGroupRenderer.TEMPLATE_ID : ChatArtifactLeafRenderer.TEMPLATE_ID;
  }
}
class ChatArtifactsAccessibilityProvider {
  getAriaLabel(element) {
    if (isGroupNode(element)) {
      return localize("chat.artifacts.group.aria", "{0} ({1} items)", element.groupName, element.artifacts.length);
    }
    return element.artifact.label;
  }
  getWidgetAriaLabel() {
    return localize("chat.artifacts.widget.aria", "Chat Artifacts");
  }
}
const _ChatArtifactGroupRenderer = class _ChatArtifactGroupRenderer {
  constructor() {
    this.templateId = _ChatArtifactGroupRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const row = dom.append(container, dom.$(".chat-artifacts-list-row"));
    const iconElement = dom.append(row, dom.$(".chat-artifacts-list-icon"));
    const labelElement = dom.append(row, dom.$(".chat-artifacts-list-label"));
    const actionsContainer = dom.append(row, dom.$(".chat-artifacts-list-actions"));
    const elementDisposables = new DisposableStore();
    const actionBar = new ActionBar(actionsContainer);
    return { container: row, iconElement, labelElement, actionBar, elementDisposables };
  }
  renderElement(node, _index, templateData) {
    const group = node.element;
    if (!isGroupNode(group)) {
      return;
    }
    templateData.elementDisposables.clear();
    const firstType = group.artifacts[0]?.type;
    const icon = firstType && ARTIFACT_TYPE_ICONS[firstType] || Codicon.archive;
    templateData.iconElement.className = "chat-artifacts-list-icon " + ThemeIcon.asClassName(icon);
    templateData.labelElement.textContent = `${group.groupName} (${group.artifacts.length})`;
    templateData.container.title = group.groupName;
    templateData.actionBar.clear();
    if (group.onClear) {
      const clearFn = group.onClear;
      templateData.actionBar.push(toAction({
        id: "chatArtifacts.clearSource",
        label: localize("chat.artifacts.clearSource", "Clear"),
        class: ThemeIcon.asClassName(Codicon.close),
        run: () => clearFn()
      }), { icon: true, label: false });
    }
  }
  disposeElement(_element, _index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.actionBar.dispose();
  }
};
_ChatArtifactGroupRenderer.TEMPLATE_ID = "chatArtifactGroupRenderer";
let ChatArtifactGroupRenderer = _ChatArtifactGroupRenderer;
const _ChatArtifactLeafRenderer = class _ChatArtifactLeafRenderer {
  constructor(_onSave) {
    this._onSave = _onSave;
    this.templateId = _ChatArtifactLeafRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const row = dom.append(container, dom.$(".chat-artifacts-list-row"));
    const iconElement = dom.append(row, dom.$(".chat-artifacts-list-icon"));
    const labelElement = dom.append(row, dom.$(".chat-artifacts-list-label"));
    const descriptionElement = dom.append(row, dom.$(".chat-artifacts-list-description"));
    const actionsContainer = dom.append(row, dom.$(".chat-artifacts-list-actions"));
    const elementDisposables = new DisposableStore();
    const actionBar = new ActionBar(actionsContainer);
    return { container: row, iconElement, labelElement, descriptionElement, actionBar, elementDisposables };
  }
  renderElement(node, _index, templateData) {
    if (!isLeafNode(node.element)) {
      return;
    }
    templateData.elementDisposables.clear();
    const { artifact, description, onClear } = node.element;
    const icon = artifact.type && ARTIFACT_TYPE_ICONS[artifact.type] || Codicon.archive;
    templateData.iconElement.className = "chat-artifacts-list-icon " + ThemeIcon.asClassName(icon);
    templateData.labelElement.textContent = artifact.label;
    templateData.descriptionElement.textContent = description ?? "";
    templateData.descriptionElement.style.display = description ? "" : "none";
    templateData.container.title = artifact.uri;
    templateData.actionBar.clear();
    const actions = [];
    if (onClear) {
      const clearFn = onClear;
      actions.push(toAction({
        id: "chatArtifacts.clearSource",
        label: localize("chat.artifacts.clearSource", "Clear"),
        class: ThemeIcon.asClassName(Codicon.close),
        run: () => clearFn()
      }));
    }
    actions.push(toAction({
      id: "chatArtifacts.save",
      label: localize("chat.artifacts.save", "Save artifact"),
      class: ThemeIcon.asClassName(Codicon.save),
      run: () => this._onSave(artifact)
    }));
    templateData.actionBar.push(actions, { icon: true, label: false });
  }
  disposeElement(_element, _index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.actionBar.dispose();
  }
};
_ChatArtifactLeafRenderer.TEMPLATE_ID = "chatArtifactLeafRenderer";
let ChatArtifactLeafRenderer = _ChatArtifactLeafRenderer;
export {
  ChatArtifactsWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdEFydGlmYWN0c1dpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJT2JqZWN0VHJlZUVsZW1lbnQsIElUcmVlTm9kZSwgSVRyZWVSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaE9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdE1lbW9yeUZpbGVSZXNvdXJjZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0QXJ0aWZhY3RFeHRyYWN0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0QXJ0aWZhY3QsIElDaGF0QXJ0aWZhY3RzU2VydmljZSwgSUFydGlmYWN0U291cmNlR3JvdXAsIEFydGlmYWN0U291cmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2NoYXRBcnRpZmFjdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdG9yT3ZlcnJpZGVGb3JDaGF0UmVzb3VyY2UgfSBmcm9tICcuL2NoYXRFZGl0b3JBc3NvY2lhdGlvbnMuanMnO1xuXG5jb25zdCBBUlRJRkFDVF9UWVBFX0lDT05TOiBSZWNvcmQ8c3RyaW5nLCBUaGVtZUljb24+ID0ge1xuXHRkZXZTZXJ2ZXI6IENvZGljb24uZ2xvYmUsXG5cdHNjcmVlbnNob3Q6IENvZGljb24uZmlsZSxcblx0cGxhbjogQ29kaWNvbi5ib29rLFxufTtcblxuLyoqXG4gKiBBIGdyb3VwIG5vZGUgaW4gdGhlIGFydGlmYWN0IHRyZWUuIEdyb3VwcyBhcnRpZmFjdHMgYnkgYGdyb3VwTmFtZWAuXG4gKi9cbmludGVyZmFjZSBJQXJ0aWZhY3RHcm91cE5vZGUge1xuXHRyZWFkb25seSBraW5kOiAnZ3JvdXAnO1xuXHRyZWFkb25seSBncm91cE5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgYXJ0aWZhY3RzOiBJQ2hhdEFydGlmYWN0W107XG5cdHJlYWRvbmx5IG9ubHlTaG93R3JvdXA6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9uQ2xlYXI/OiAoKSA9PiB2b2lkO1xufVxuXG4vKipcbiAqIEEgbGVhZiBhcnRpZmFjdCBub2RlLCBvcHRpb25hbGx5IGFubm90YXRlZCB3aXRoIHN1YnRleHQgKGUuZy4gc291cmNlL2dyb3VwIG5hbWVcbiAqIHdoZW4gdGhlIGFydGlmYWN0IGlzIHRoZSBzb2xlIGl0ZW0gb2YgaXRzIGdyb3VwLCBzaG93biBhdCB0b3AgbGV2ZWwpLlxuICovXG5pbnRlcmZhY2UgSUFydGlmYWN0TGVhZk5vZGUge1xuXHRyZWFkb25seSBraW5kOiAnbGVhZic7XG5cdHJlYWRvbmx5IGFydGlmYWN0OiBJQ2hhdEFydGlmYWN0O1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgb25DbGVhcj86ICgpID0+IHZvaWQ7XG59XG5cbnR5cGUgQXJ0aWZhY3RUcmVlRWxlbWVudCA9IElBcnRpZmFjdEdyb3VwTm9kZSB8IElBcnRpZmFjdExlYWZOb2RlO1xuXG5mdW5jdGlvbiBpc0dyb3VwTm9kZShlbGVtZW50OiBBcnRpZmFjdFRyZWVFbGVtZW50KTogZWxlbWVudCBpcyBJQXJ0aWZhY3RHcm91cE5vZGUge1xuXHRyZXR1cm4gZWxlbWVudC5raW5kID09PSAnZ3JvdXAnO1xufVxuXG5mdW5jdGlvbiBpc0xlYWZOb2RlKGVsZW1lbnQ6IEFydGlmYWN0VHJlZUVsZW1lbnQpOiBlbGVtZW50IGlzIElBcnRpZmFjdExlYWZOb2RlIHtcblx0cmV0dXJuIGVsZW1lbnQua2luZCA9PT0gJ2xlYWYnO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdEFydGlmYWN0c1dpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uUmVzb3VyY2UgPSBvYnNlcnZhYmxlVmFsdWU8VVJJIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0NvbGxhcHNlZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudEFydGlmYWN0cyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBzciA9IHRoaXMuX3Nlc3Npb25SZXNvdXJjZS5yZWFkKHJlYWRlcik7XG5cdFx0cmV0dXJuIHNyID8gdGhpcy5fY2hhdEFydGlmYWN0c1NlcnZpY2UuZ2V0QXJ0aWZhY3RzKHNyKSA6IHVuZGVmaW5lZDtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdHJlZURhdGEgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgYXJ0aWZhY3RzID0gdGhpcy5fY3VycmVudEFydGlmYWN0cy5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFhcnRpZmFjdHMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGdyb3VwcyA9IGFydGlmYWN0cy5hcnRpZmFjdEdyb3Vwcy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgdG90YWxDb3VudCA9IGdyb3Vwcy5yZWR1Y2UoKHN1bSwgZykgPT4gc3VtICsgZy5hcnRpZmFjdHMubGVuZ3RoLCAwKTtcblx0XHRpZiAodG90YWxDb3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbXVsdGlTb3VyY2UgPSBncm91cHMubGVuZ3RoID4gMTtcblx0XHRjb25zdCB0cmVlRWxlbWVudHMgPSBidWlsZFRyZWVFbGVtZW50c0Zyb21Hcm91cHMoZ3JvdXBzLCBtdWx0aVNvdXJjZSwgc291cmNlID0+IHRoaXMuX2NsZWFyU291cmNlKHNvdXJjZSkpO1xuXHRcdGNvbnN0IHZpc2libGVDb3VudCA9IGNvdW50VmlzaWJsZVJvd3ModHJlZUVsZW1lbnRzKTtcblx0XHRjb25zdCBpdGVtc1Nob3duID0gTWF0aC5taW4odmlzaWJsZUNvdW50LCBDaGF0QXJ0aWZhY3RzV2lkZ2V0Lk1BWF9JVEVNU19TSE9XTik7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvdGFsQ291bnQsXG5cdFx0XHR0cmVlRWxlbWVudHMsXG5cdFx0XHR0cmVlSGVpZ2h0OiBpdGVtc1Nob3duICogQ2hhdEFydGlmYWN0c1dpZGdldC5FTEVNRU5UX0hFSUdIVCxcblx0XHR9O1xuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEVMRU1FTlRfSEVJR0hUID0gMjI7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9JVEVNU19TSE9XTiA9IDY7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0QXJ0aWZhY3RzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0QXJ0aWZhY3RzU2VydmljZTogSUNoYXRBcnRpZmFjdHNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRJbWFnZUNhcm91c2VsU2VydmljZTogSUNoYXRJbWFnZUNhcm91c2VsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnLmNoYXQtYXJ0aWZhY3RzLXdpZGdldCcpO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYXJ0aWZhY3RzID0gdGhpcy5fY3VycmVudEFydGlmYWN0cy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy5kb21Ob2RlKTtcblxuXHRcdFx0aWYgKCFhcnRpZmFjdHMpIHtcblx0XHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RvcmUgPSByZWFkZXIuc3RvcmU7XG5cblx0XHRcdGNvbnN0IGV4cGFuZG9Db250YWluZXIgPSBkb20uJCgnLmNoYXQtYXJ0aWZhY3RzLWV4cGFuZCcpO1xuXHRcdFx0Y29uc3QgaGVhZGVyQnV0dG9uID0gc3RvcmUuYWRkKG5ldyBCdXR0b24oZXhwYW5kb0NvbnRhaW5lciwgeyBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXG5cdFx0XHRjb25zdCB0aXRsZVNlY3Rpb24gPSBkb20uJCgnLmNoYXQtYXJ0aWZhY3RzLXRpdGxlLXNlY3Rpb24nKTtcblx0XHRcdGNvbnN0IGV4cGFuZEljb24gPSBkb20uJCgnLmV4cGFuZC1pY29uLmNvZGljb24nKTtcblx0XHRcdGV4cGFuZEljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRjb25zdCB0aXRsZUVsZW1lbnQgPSBkb20uJCgnLmNoYXQtYXJ0aWZhY3RzLXRpdGxlJyk7XG5cblx0XHRcdHRpdGxlU2VjdGlvbi5hcHBlbmRDaGlsZChleHBhbmRJY29uKTtcblx0XHRcdHRpdGxlU2VjdGlvbi5hcHBlbmRDaGlsZCh0aXRsZUVsZW1lbnQpO1xuXHRcdFx0aGVhZGVyQnV0dG9uLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGl0bGVTZWN0aW9uKTtcblxuXHRcdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKGV4cGFuZG9Db250YWluZXIpO1xuXG5cdFx0XHRjb25zdCBsaXN0Q29udGFpbmVyID0gZG9tLiQoJy5jaGF0LWFydGlmYWN0cy1saXN0Jyk7XG5cdFx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQobGlzdENvbnRhaW5lcik7XG5cblx0XHRcdGNvbnN0IHRyZWUgPSBzdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFdvcmtiZW5jaE9iamVjdFRyZWU8QXJ0aWZhY3RUcmVlRWxlbWVudD4sXG5cdFx0XHRcdCdDaGF0QXJ0aWZhY3RzVHJlZScsXG5cdFx0XHRcdGxpc3RDb250YWluZXIsXG5cdFx0XHRcdG5ldyBDaGF0QXJ0aWZhY3RzVHJlZURlbGVnYXRlKCksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRuZXcgQ2hhdEFydGlmYWN0R3JvdXBSZW5kZXJlcigpLFxuXHRcdFx0XHRcdG5ldyBDaGF0QXJ0aWZhY3RMZWFmUmVuZGVyZXIoYXJ0aWZhY3QgPT4gdGhpcy5fc2F2ZUFydGlmYWN0KGFydGlmYWN0KSksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2UsXG5cdFx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgQ2hhdEFydGlmYWN0c0FjY2Vzc2liaWxpdHlQcm92aWRlcigpLFxuXHRcdFx0XHR9LFxuXHRcdFx0KSk7XG5cblx0XHRcdHN0b3JlLmFkZCh0cmVlLm9uRGlkT3BlbihlID0+IHtcblx0XHRcdFx0aWYgKCFlLmVsZW1lbnQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGlzR3JvdXBOb2RlKGUuZWxlbWVudCkpIHtcblx0XHRcdFx0XHRpZiAoZS5lbGVtZW50Lm9ubHlTaG93R3JvdXApIHtcblx0XHRcdFx0XHRcdHRoaXMuX29wZW5Hcm91cEluQ2Fyb3VzZWwoZS5lbGVtZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNMZWFmTm9kZShlLmVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fb3BlbkxlYWZBcnRpZmFjdChlLmVsZW1lbnQuYXJ0aWZhY3QpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHN0b3JlLmFkZChoZWFkZXJCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2lzQ29sbGFwc2VkLnNldCghdGhpcy5faXNDb2xsYXBzZWQucmVhZCh1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBjb2xsYXBzZWQgPSB0aGlzLl9pc0NvbGxhcHNlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGV4cGFuZEljb24uY2xhc3NMaXN0LnRvZ2dsZSgnY29kaWNvbi1jaGV2cm9uLWRvd24nLCAhY29sbGFwc2VkKTtcblx0XHRcdFx0ZXhwYW5kSWNvbi5jbGFzc0xpc3QudG9nZ2xlKCdjb2RpY29uLWNoZXZyb24tcmlnaHQnLCBjb2xsYXBzZWQpO1xuXHRcdFx0XHRoZWFkZXJCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcoIWNvbGxhcHNlZCkpO1xuXHRcdFx0XHRsaXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBjb2xsYXBzZWQgPyAnbm9uZScgOiAnYmxvY2snO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gdGhpcy5fdHJlZURhdGEucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnJztcblxuXHRcdFx0XHR0aXRsZUVsZW1lbnQudGV4dENvbnRlbnQgPSBkYXRhLnRvdGFsQ291bnQgPT09IDFcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LmFydGlmYWN0cy5vbmUnLCBcIjEgQXJ0aWZhY3RcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0LmFydGlmYWN0cy5jb3VudCcsIFwiezB9IEFydGlmYWN0c1wiLCBkYXRhLnRvdGFsQ291bnQpO1xuXG5cdFx0XHRcdHRyZWUubGF5b3V0KGRhdGEudHJlZUhlaWdodCk7XG5cdFx0XHRcdHRyZWUuZ2V0SFRNTEVsZW1lbnQoKS5zdHlsZS5oZWlnaHQgPSBgJHtkYXRhLnRyZWVIZWlnaHR9cHhgO1xuXHRcdFx0XHR0cmVlLnNldENoaWxkcmVuKG51bGwsIGRhdGEudHJlZUVsZW1lbnRzKTtcblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cdH1cblxuXHRzZXRTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2Uuc2V0KHNlc3Npb25SZXNvdXJjZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW5Hcm91cEluQ2Fyb3VzZWwoZ3JvdXA6IElBcnRpZmFjdEdyb3VwTm9kZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE9wZW4gdGhlIGZpcnN0IGFydGlmYWN0IGluIHRoZSBncm91cCBcdTIwMTQgdGhlIGNhcm91c2VsIHNlcnZpY2Ugd2lsbCBjb2xsZWN0XG5cdFx0Ly8gYWxsIGltYWdlcyBmcm9tIHRoZSBjaGF0IHdpZGdldCBzZXNzaW9uIGF1dG9tYXRpY2FsbHkuXG5cdFx0Y29uc3QgZmlyc3QgPSBncm91cC5hcnRpZmFjdHNbMF07XG5cdFx0aWYgKGZpcnN0Py51cmkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2NoYXRJbWFnZUNhcm91c2VsU2VydmljZS5vcGVuQ2Fyb3VzZWxBdFJlc291cmNlKFVSSS5wYXJzZShmaXJzdC51cmkpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vcGVuTGVhZkFydGlmYWN0KGFydGlmYWN0OiBJQ2hhdEFydGlmYWN0KTogdm9pZCB7XG5cdFx0aWYgKGFydGlmYWN0LnR5cGUgPT09ICdzY3JlZW5zaG90JyAmJiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5JbWFnZUNhcm91c2VsRW5hYmxlZCkpIHtcblx0XHRcdHRoaXMuX29wZW5TY3JlZW5zaG90SW5DYXJvdXNlbChhcnRpZmFjdCk7XG5cdFx0fSBlbHNlIGlmIChhcnRpZmFjdC51cmkpIHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShhcnRpZmFjdC51cmkpO1xuXHRcdFx0aWYgKENoYXRNZW1vcnlGaWxlUmVzb3VyY2UuaXNDaGF0TWVtb3J5RmlsZVVyaSh1cmkpKSB7XG5cdFx0XHRcdHRoaXMuX29wZW5NZW1vcnlGaWxlQXJ0aWZhY3QodXJpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvck92ZXJyaWRlID0gZ2V0RWRpdG9yT3ZlcnJpZGVGb3JDaGF0UmVzb3VyY2UodXJpLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRcdHRoaXMuX29wZW5lclNlcnZpY2Uub3Blbih1cmksIHtcblx0XHRcdFx0XHRmcm9tVXNlckdlc3R1cmU6IHRydWUsXG5cdFx0XHRcdFx0ZWRpdG9yT3B0aW9uczogeyBvdmVycmlkZTogZWRpdG9yT3ZlcnJpZGUgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb3BlblNjcmVlbnNob3RJbkNhcm91c2VsKGNsaWNrZWQ6IElDaGF0QXJ0aWZhY3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoY2xpY2tlZC51cmkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2NoYXRJbWFnZUNhcm91c2VsU2VydmljZS5vcGVuQ2Fyb3VzZWxBdFJlc291cmNlKFVSSS5wYXJzZShjbGlja2VkLnVyaSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW5NZW1vcnlGaWxlQXJ0aWZhY3QodXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IG1lbW9yeVBhdGgsIHNlc3Npb25SZXNvdXJjZSB9ID0gQ2hhdE1lbW9yeUZpbGVSZXNvdXJjZS5wYXJzZSh1cmkpO1xuXHRcdGNvbnN0IHJlc29sdmVkVXJpU3RyOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChcblx0XHRcdCdnaXRodWIuY29waWxvdC5jaGF0LnRvb2xzLm1lbW9yeS5yZXNvbHZlTWVtb3J5RmlsZVVyaScsXG5cdFx0XHRtZW1vcnlQYXRoLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdCk7XG5cdFx0aWYgKHJlc29sdmVkVXJpU3RyKSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZFVyaSA9IFVSSS5wYXJzZShyZXNvbHZlZFVyaVN0cik7XG5cdFx0XHRjb25zdCBlZGl0b3JPdmVycmlkZSA9IGdldEVkaXRvck92ZXJyaWRlRm9yQ2hhdFJlc291cmNlKHJlc29sdmVkVXJpLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHR0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4ocmVzb2x2ZWRVcmksIHtcblx0XHRcdFx0ZnJvbVVzZXJHZXN0dXJlOiB0cnVlLFxuXHRcdFx0XHRlZGl0b3JPcHRpb25zOiB7IG92ZXJyaWRlOiBlZGl0b3JPdmVycmlkZSB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJTb3VyY2Uoc291cmNlOiBBcnRpZmFjdFNvdXJjZSk6IHZvaWQge1xuXHRcdGNvbnN0IGFydGlmYWN0cyA9IHRoaXMuX2N1cnJlbnRBcnRpZmFjdHMuZ2V0KCk7XG5cdFx0aWYgKCFhcnRpZmFjdHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c3dpdGNoIChzb3VyY2Uua2luZCkge1xuXHRcdFx0Y2FzZSAnYWdlbnQnOlxuXHRcdFx0XHRhcnRpZmFjdHMuY2xlYXJBZ2VudEFydGlmYWN0cygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3N1YmFnZW50Jzpcblx0XHRcdFx0YXJ0aWZhY3RzLmNsZWFyU3ViYWdlbnRBcnRpZmFjdHMoc291cmNlLmludm9jYXRpb25JZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NhdmVBcnRpZmFjdChhcnRpZmFjdDogSUNoYXRBcnRpZmFjdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNvdXJjZVVyaSA9IFVSSS5wYXJzZShhcnRpZmFjdC51cmkpO1xuXHRcdGNvbnN0IGRlZmF1bHRGaWxlTmFtZSA9IHNvdXJjZVVyaS5wYXRoLnNwbGl0KCcvJykucG9wKCkgPz8gYXJ0aWZhY3QubGFiZWw7XG5cdFx0Y29uc3QgZGVmYXVsdFBhdGggPSBhd2FpdCB0aGlzLl9maWxlRGlhbG9nU2VydmljZS5kZWZhdWx0RmlsZVBhdGgoKTtcblx0XHRjb25zdCBkZWZhdWx0VXJpID0gVVJJLmpvaW5QYXRoKGRlZmF1bHRQYXRoLCBkZWZhdWx0RmlsZU5hbWUpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0VXJpID0gYXdhaXQgdGhpcy5fZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd1NhdmVEaWFsb2coe1xuXHRcdFx0ZGVmYXVsdFVyaSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMuc2F2ZURpYWxvZy50aXRsZScsIFwiU2F2ZSBBcnRpZmFjdFwiKSxcblx0XHR9KTtcblxuXHRcdGlmICh0YXJnZXRVcmkpIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShzb3VyY2VVcmkpO1xuXHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRhcmdldFVyaSwgY29udGVudC52YWx1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbi8vIC0tLSBUcmVlIGluZnJhc3RydWN0dXJlIC0tLVxuXG5mdW5jdGlvbiBzb3VyY2VEaXNwbGF5TmFtZShzb3VyY2U6IEFydGlmYWN0U291cmNlKTogc3RyaW5nIHtcblx0c3dpdGNoIChzb3VyY2Uua2luZCkge1xuXHRcdGNhc2UgJ3J1bGVzJzogcmV0dXJuIGxvY2FsaXplKCdjaGF0LmFydGlmYWN0cy5zb3VyY2UucnVsZXMnLCBcIlJ1bGVzXCIpO1xuXHRcdGNhc2UgJ2FnZW50JzogcmV0dXJuIGxvY2FsaXplKCdjaGF0LmFydGlmYWN0cy5zb3VyY2UuYWdlbnQnLCBcIkFnZW50XCIpO1xuXHRcdGNhc2UgJ3N1YmFnZW50JzogcmV0dXJuIHNvdXJjZS5uYW1lID8/IGxvY2FsaXplKCdjaGF0LmFydGlmYWN0cy5zb3VyY2Uuc3ViYWdlbnQnLCBcIlN1YmFnZW50XCIpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGJ1aWxkVHJlZUVsZW1lbnRzRnJvbUdyb3Vwcyhzb3VyY2VHcm91cHM6IHJlYWRvbmx5IElBcnRpZmFjdFNvdXJjZUdyb3VwW10sIG11bHRpU291cmNlOiBib29sZWFuLCBvbkNsZWFyU291cmNlOiAoc291cmNlOiBBcnRpZmFjdFNvdXJjZSkgPT4gdm9pZCk6IElPYmplY3RUcmVlRWxlbWVudDxBcnRpZmFjdFRyZWVFbGVtZW50PltdIHtcblx0Y29uc3QgZWxlbWVudHM6IElPYmplY3RUcmVlRWxlbWVudDxBcnRpZmFjdFRyZWVFbGVtZW50PltdID0gW107XG5cblx0Zm9yIChjb25zdCBzb3VyY2VHcm91cCBvZiBzb3VyY2VHcm91cHMpIHtcblx0XHRjb25zdCBwcmVmaXggPSBtdWx0aVNvdXJjZSA/IHNvdXJjZURpc3BsYXlOYW1lKHNvdXJjZUdyb3VwLnNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY2xlYXJhYmxlID0gc291cmNlR3JvdXAuc291cmNlLmtpbmQgIT09ICdydWxlcyc7XG5cdFx0Y29uc3Qgb25DbGVhciA9IGNsZWFyYWJsZSA/ICgpID0+IG9uQ2xlYXJTb3VyY2Uoc291cmNlR3JvdXAuc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgeyBjb25maWc6IHsgZ3JvdXBOYW1lOiBzdHJpbmc7IG9ubHlTaG93R3JvdXA6IGJvb2xlYW4gfTsgYXJ0aWZhY3RzOiBJQ2hhdEFydGlmYWN0W10gfT4oKTtcblx0XHRjb25zdCB1bmdyb3VwZWQ6IElDaGF0QXJ0aWZhY3RbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBhcnRpZmFjdCBvZiBzb3VyY2VHcm91cC5hcnRpZmFjdHMpIHtcblx0XHRcdGlmIChhcnRpZmFjdC5ncm91cE5hbWUpIHtcblx0XHRcdFx0bGV0IGdyb3VwID0gZ3JvdXBzLmdldChhcnRpZmFjdC5ncm91cE5hbWUpO1xuXHRcdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdFx0Z3JvdXAgPSB7IGNvbmZpZzogeyBncm91cE5hbWU6IGFydGlmYWN0Lmdyb3VwTmFtZSwgb25seVNob3dHcm91cDogYXJ0aWZhY3Qub25seVNob3dHcm91cCA/PyBmYWxzZSB9LCBhcnRpZmFjdHM6IFtdIH07XG5cdFx0XHRcdFx0Z3JvdXBzLnNldChhcnRpZmFjdC5ncm91cE5hbWUsIGdyb3VwKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRncm91cC5hcnRpZmFjdHMucHVzaChhcnRpZmFjdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR1bmdyb3VwZWQucHVzaChhcnRpZmFjdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBbLCBncm91cF0gb2YgZ3JvdXBzKSB7XG5cdFx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IHByZWZpeCA/IGAke3ByZWZpeH06ICR7Z3JvdXAuY29uZmlnLmdyb3VwTmFtZX1gIDogZ3JvdXAuY29uZmlnLmdyb3VwTmFtZTtcblxuXHRcdFx0Ly8gU2luZ2xlLWFydGlmYWN0IGdyb3VwOiBwcm9tb3RlIHRvIHRvcC1sZXZlbCBsZWFmIHdpdGggZGVzY3JpcHRpb25cblx0XHRcdGlmIChncm91cC5hcnRpZmFjdHMubGVuZ3RoID09PSAxICYmICFncm91cC5jb25maWcub25seVNob3dHcm91cCkge1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKHsgZWxlbWVudDogeyBraW5kOiAnbGVhZicsIGFydGlmYWN0OiBncm91cC5hcnRpZmFjdHNbMF0sIGRlc2NyaXB0aW9uOiBkaXNwbGF5TmFtZSwgb25DbGVhciB9IH0pO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZ3JvdXBOb2RlOiBJQXJ0aWZhY3RHcm91cE5vZGUgPSB7XG5cdFx0XHRcdGtpbmQ6ICdncm91cCcsXG5cdFx0XHRcdGdyb3VwTmFtZTogZGlzcGxheU5hbWUsXG5cdFx0XHRcdGFydGlmYWN0czogZ3JvdXAuYXJ0aWZhY3RzLFxuXHRcdFx0XHRvbmx5U2hvd0dyb3VwOiBncm91cC5jb25maWcub25seVNob3dHcm91cCxcblx0XHRcdFx0b25DbGVhcixcblx0XHRcdH07XG5cblx0XHRcdGlmIChncm91cC5jb25maWcub25seVNob3dHcm91cCkge1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKHsgZWxlbWVudDogZ3JvdXBOb2RlLCBjb2xsYXBzaWJsZTogZmFsc2UsIGNvbGxhcHNlZDogZmFsc2UgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKHtcblx0XHRcdFx0XHRlbGVtZW50OiBncm91cE5vZGUsXG5cdFx0XHRcdFx0Y29sbGFwc2libGU6IHRydWUsXG5cdFx0XHRcdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdFx0XHRjaGlsZHJlbjogZ3JvdXAuYXJ0aWZhY3RzLm1hcCgoYSk6IElPYmplY3RUcmVlRWxlbWVudDxBcnRpZmFjdFRyZWVFbGVtZW50PiA9PiAoeyBlbGVtZW50OiB7IGtpbmQ6ICdsZWFmJywgYXJ0aWZhY3Q6IGEgfSB9KSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh1bmdyb3VwZWQubGVuZ3RoID4gMCAmJiBwcmVmaXgpIHtcblx0XHRcdC8vIFNpbmdsZSB1bmdyb3VwZWQgYXJ0aWZhY3QgZnJvbSBhIHNvdXJjZTogc2hvdyBhcyBsZWFmIHdpdGggc291cmNlIG5hbWVcblx0XHRcdGlmICh1bmdyb3VwZWQubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdGVsZW1lbnRzLnB1c2goeyBlbGVtZW50OiB7IGtpbmQ6ICdsZWFmJywgYXJ0aWZhY3Q6IHVuZ3JvdXBlZFswXSwgZGVzY3JpcHRpb246IHByZWZpeCwgb25DbGVhciB9IH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXBOb2RlOiBJQXJ0aWZhY3RHcm91cE5vZGUgPSB7XG5cdFx0XHRcdFx0a2luZDogJ2dyb3VwJyxcblx0XHRcdFx0XHRncm91cE5hbWU6IHByZWZpeCxcblx0XHRcdFx0XHRhcnRpZmFjdHM6IHVuZ3JvdXBlZCxcblx0XHRcdFx0XHRvbmx5U2hvd0dyb3VwOiBmYWxzZSxcblx0XHRcdFx0XHRvbkNsZWFyLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKHtcblx0XHRcdFx0XHRlbGVtZW50OiBncm91cE5vZGUsXG5cdFx0XHRcdFx0Y29sbGFwc2libGU6IHRydWUsXG5cdFx0XHRcdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdFx0XHRjaGlsZHJlbjogdW5ncm91cGVkLm1hcCgoYSk6IElPYmplY3RUcmVlRWxlbWVudDxBcnRpZmFjdFRyZWVFbGVtZW50PiA9PiAoeyBlbGVtZW50OiB7IGtpbmQ6ICdsZWFmJywgYXJ0aWZhY3Q6IGEgfSB9KSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFydGlmYWN0IG9mIHVuZ3JvdXBlZCkge1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKHsgZWxlbWVudDogeyBraW5kOiAnbGVhZicsIGFydGlmYWN0LCBvbkNsZWFyIH0gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGVsZW1lbnRzO1xufVxuXG5mdW5jdGlvbiBjb3VudFZpc2libGVSb3dzKGVsZW1lbnRzOiBJT2JqZWN0VHJlZUVsZW1lbnQ8QXJ0aWZhY3RUcmVlRWxlbWVudD5bXSk6IG51bWJlciB7XG5cdGxldCBjb3VudCA9IDA7XG5cdGZvciAoY29uc3QgZWwgb2YgZWxlbWVudHMpIHtcblx0XHRjb3VudCsrOyAvLyBUaGUgZWxlbWVudCBpdHNlbGZcblx0XHRpZiAoZWwuY2hpbGRyZW4gJiYgIWVsLmNvbGxhcHNlZCkge1xuXHRcdFx0Y291bnQgKz0gY291bnRWaXNpYmxlUm93cyhbLi4uZWwuY2hpbGRyZW5dKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGNvdW50O1xufVxuXG5jbGFzcyBDaGF0QXJ0aWZhY3RzVHJlZURlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8QXJ0aWZhY3RUcmVlRWxlbWVudD4ge1xuXHRnZXRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gQ2hhdEFydGlmYWN0c1dpZGdldC5FTEVNRU5UX0hFSUdIVDtcblx0fVxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IEFydGlmYWN0VHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBpc0dyb3VwTm9kZShlbGVtZW50KVxuXHRcdFx0PyBDaGF0QXJ0aWZhY3RHcm91cFJlbmRlcmVyLlRFTVBMQVRFX0lEXG5cdFx0XHQ6IENoYXRBcnRpZmFjdExlYWZSZW5kZXJlci5URU1QTEFURV9JRDtcblx0fVxufVxuXG5jbGFzcyBDaGF0QXJ0aWZhY3RzQWNjZXNzaWJpbGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8QXJ0aWZhY3RUcmVlRWxlbWVudD4ge1xuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogQXJ0aWZhY3RUcmVlRWxlbWVudCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmIChpc0dyb3VwTm9kZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LmFydGlmYWN0cy5ncm91cC5hcmlhJywgXCJ7MH0gKHsxfSBpdGVtcylcIiwgZWxlbWVudC5ncm91cE5hbWUsIGVsZW1lbnQuYXJ0aWZhY3RzLmxlbmd0aCk7XG5cdFx0fVxuXHRcdHJldHVybiBlbGVtZW50LmFydGlmYWN0LmxhYmVsO1xuXHR9XG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMud2lkZ2V0LmFyaWEnLCBcIkNoYXQgQXJ0aWZhY3RzXCIpO1xuXHR9XG59XG5cbi8vIC0tLSBHcm91cCByZW5kZXJlciAtLS1cblxuaW50ZXJmYWNlIElBcnRpZmFjdEdyb3VwVGVtcGxhdGUge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBpY29uRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgQ2hhdEFydGlmYWN0R3JvdXBSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8QXJ0aWZhY3RUcmVlRWxlbWVudCwgdm9pZCwgSUFydGlmYWN0R3JvdXBUZW1wbGF0ZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnY2hhdEFydGlmYWN0R3JvdXBSZW5kZXJlcic7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBDaGF0QXJ0aWZhY3RHcm91cFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJQXJ0aWZhY3RHcm91cFRlbXBsYXRlIHtcblx0XHRjb25zdCByb3cgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5jaGF0LWFydGlmYWN0cy1saXN0LXJvdycpKTtcblx0XHRjb25zdCBpY29uRWxlbWVudCA9IGRvbS5hcHBlbmQocm93LCBkb20uJCgnLmNoYXQtYXJ0aWZhY3RzLWxpc3QtaWNvbicpKTtcblx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSBkb20uYXBwZW5kKHJvdywgZG9tLiQoJy5jaGF0LWFydGlmYWN0cy1saXN0LWxhYmVsJykpO1xuXHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSBkb20uYXBwZW5kKHJvdywgZG9tLiQoJy5jaGF0LWFydGlmYWN0cy1saXN0LWFjdGlvbnMnKSk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIoYWN0aW9uc0NvbnRhaW5lcik7XG5cdFx0cmV0dXJuIHsgY29udGFpbmVyOiByb3csIGljb25FbGVtZW50LCBsYWJlbEVsZW1lbnQsIGFjdGlvbkJhciwgZWxlbWVudERpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxBcnRpZmFjdFRyZWVFbGVtZW50PiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUFydGlmYWN0R3JvdXBUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3VwID0gbm9kZS5lbGVtZW50O1xuXHRcdGlmICghaXNHcm91cE5vZGUoZ3JvdXApKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgZmlyc3RUeXBlID0gZ3JvdXAuYXJ0aWZhY3RzWzBdPy50eXBlO1xuXHRcdGNvbnN0IGljb24gPSAoZmlyc3RUeXBlICYmIEFSVElGQUNUX1RZUEVfSUNPTlNbZmlyc3RUeXBlXSkgfHwgQ29kaWNvbi5hcmNoaXZlO1xuXHRcdHRlbXBsYXRlRGF0YS5pY29uRWxlbWVudC5jbGFzc05hbWUgPSAnY2hhdC1hcnRpZmFjdHMtbGlzdC1pY29uICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbik7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IGAke2dyb3VwLmdyb3VwTmFtZX0gKCR7Z3JvdXAuYXJ0aWZhY3RzLmxlbmd0aH0pYDtcblx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLnRpdGxlID0gZ3JvdXAuZ3JvdXBOYW1lO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGlmIChncm91cC5vbkNsZWFyKSB7XG5cdFx0XHRjb25zdCBjbGVhckZuID0gZ3JvdXAub25DbGVhcjtcblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAnY2hhdEFydGlmYWN0cy5jbGVhclNvdXJjZScsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMuY2xlYXJTb3VyY2UnLCBcIkNsZWFyXCIpLFxuXHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2UpLFxuXHRcdFx0XHRydW46ICgpID0+IGNsZWFyRm4oKSxcblx0XHRcdH0pLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChfZWxlbWVudDogSVRyZWVOb2RlPEFydGlmYWN0VHJlZUVsZW1lbnQ+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQXJ0aWZhY3RHcm91cFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUFydGlmYWN0R3JvdXBUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vIC0tLSBMZWFmIGFydGlmYWN0IHJlbmRlcmVyIC0tLVxuXG5pbnRlcmZhY2UgSUFydGlmYWN0TGVhZlRlbXBsYXRlIHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaWNvbkVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbEVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbkVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0cmVhZG9ubHkgZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmNsYXNzIENoYXRBcnRpZmFjdExlYWZSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8QXJ0aWZhY3RUcmVlRWxlbWVudCwgdm9pZCwgSUFydGlmYWN0TGVhZlRlbXBsYXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdjaGF0QXJ0aWZhY3RMZWFmUmVuZGVyZXInO1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gQ2hhdEFydGlmYWN0TGVhZlJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX29uU2F2ZTogKGFydGlmYWN0OiBJQ2hhdEFydGlmYWN0KSA9PiB2b2lkKSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUFydGlmYWN0TGVhZlRlbXBsYXRlIHtcblx0XHRjb25zdCByb3cgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5jaGF0LWFydGlmYWN0cy1saXN0LXJvdycpKTtcblx0XHRjb25zdCBpY29uRWxlbWVudCA9IGRvbS5hcHBlbmQocm93LCBkb20uJCgnLmNoYXQtYXJ0aWZhY3RzLWxpc3QtaWNvbicpKTtcblx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSBkb20uYXBwZW5kKHJvdywgZG9tLiQoJy5jaGF0LWFydGlmYWN0cy1saXN0LWxhYmVsJykpO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uRWxlbWVudCA9IGRvbS5hcHBlbmQocm93LCBkb20uJCgnLmNoYXQtYXJ0aWZhY3RzLWxpc3QtZGVzY3JpcHRpb24nKSk7XG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGRvbS5hcHBlbmQocm93LCBkb20uJCgnLmNoYXQtYXJ0aWZhY3RzLWxpc3QtYWN0aW9ucycpKTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihhY3Rpb25zQ29udGFpbmVyKTtcblx0XHRyZXR1cm4geyBjb250YWluZXI6IHJvdywgaWNvbkVsZW1lbnQsIGxhYmVsRWxlbWVudCwgZGVzY3JpcHRpb25FbGVtZW50LCBhY3Rpb25CYXIsIGVsZW1lbnREaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8QXJ0aWZhY3RUcmVlRWxlbWVudD4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElBcnRpZmFjdExlYWZUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGlmICghaXNMZWFmTm9kZShub2RlLmVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgeyBhcnRpZmFjdCwgZGVzY3JpcHRpb24sIG9uQ2xlYXIgfSA9IG5vZGUuZWxlbWVudDtcblx0XHRjb25zdCBpY29uID0gKGFydGlmYWN0LnR5cGUgJiYgQVJUSUZBQ1RfVFlQRV9JQ09OU1thcnRpZmFjdC50eXBlXSkgfHwgQ29kaWNvbi5hcmNoaXZlO1xuXHRcdHRlbXBsYXRlRGF0YS5pY29uRWxlbWVudC5jbGFzc05hbWUgPSAnY2hhdC1hcnRpZmFjdHMtbGlzdC1pY29uICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbik7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IGFydGlmYWN0LmxhYmVsO1xuXHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbkVsZW1lbnQudGV4dENvbnRlbnQgPSBkZXNjcmlwdGlvbiA/PyAnJztcblx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBkZXNjcmlwdGlvbiA/ICcnIDogJ25vbmUnO1xuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIudGl0bGUgPSBhcnRpZmFjdC51cmk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IFtdO1xuXHRcdGlmIChvbkNsZWFyKSB7XG5cdFx0XHRjb25zdCBjbGVhckZuID0gb25DbGVhcjtcblx0XHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAnY2hhdEFydGlmYWN0cy5jbGVhclNvdXJjZScsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMuY2xlYXJTb3VyY2UnLCBcIkNsZWFyXCIpLFxuXHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2UpLFxuXHRcdFx0XHRydW46ICgpID0+IGNsZWFyRm4oKSxcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdGlkOiAnY2hhdEFydGlmYWN0cy5zYXZlJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMuc2F2ZScsIFwiU2F2ZSBhcnRpZmFjdFwiKSxcblx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5zYXZlKSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5fb25TYXZlKGFydGlmYWN0KSxcblx0XHR9KSk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5wdXNoKGFjdGlvbnMsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoX2VsZW1lbnQ6IElUcmVlTm9kZTxBcnRpZmFjdFRyZWVFbGVtZW50PiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUFydGlmYWN0TGVhZlRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUFydGlmYWN0TGVhZlRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7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
