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
import { compareFileNames } from "../../../../base/common/comparers.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { createMatches } from "../../../../base/common/filters.js";
import * as glob from "../../../../base/common/glob.js";
import { DisposableStore, MutableDisposable, Disposable } from "../../../../base/common/lifecycle.js";
import { posix, relative } from "../../../../base/common/path.js";
import { basename, dirname, isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import "./media/breadcrumbscontrol.css";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { FileKind, FileSystemProviderCapabilities, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchDataTree, WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { breadcrumbsPickerBackground, widgetBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { isWorkspace, isWorkspaceFolder, IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ResourceLabels, DEFAULT_LABELS_CONTAINER } from "../../labels.js";
import { BreadcrumbsConfig } from "./breadcrumbs.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { localize } from "../../../../nls.js";
import { IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
let BreadcrumbsPicker = class {
  constructor(parent, resource, _instantiationService, _themeService, _configurationService) {
    this.resource = resource;
    this._instantiationService = _instantiationService;
    this._themeService = _themeService;
    this._configurationService = _configurationService;
    this._disposables = new DisposableStore();
    this._fakeEvent = new UIEvent("fakeEvent");
    this._onWillPickElement = new Emitter();
    this.onWillPickElement = this._onWillPickElement.event;
    this._previewDispoables = new MutableDisposable();
    this._domNode = document.createElement("div");
    this._domNode.className = "monaco-breadcrumbs-picker show-file-icons";
    parent.appendChild(this._domNode);
  }
  dispose() {
    this._disposables.dispose();
    this._previewDispoables.dispose();
    this._onWillPickElement.dispose();
    this._domNode.remove();
    setTimeout(() => this._tree.dispose(), 0);
  }
  async show(input, maxHeight, width, arrowSize, arrowOffset) {
    const theme = this._themeService.getColorTheme();
    const color = theme.getColor(breadcrumbsPickerBackground);
    this._arrow = document.createElement("div");
    this._arrow.className = "arrow";
    this._arrow.style.borderColor = `transparent transparent ${color ? color.toString() : ""}`;
    this._domNode.appendChild(this._arrow);
    this._treeContainer = document.createElement("div");
    this._treeContainer.style.background = color ? color.toString() : "";
    this._treeContainer.style.paddingTop = "2px";
    this._treeContainer.style.borderRadius = "3px";
    this._treeContainer.style.boxShadow = "var(--vscode-shadow-lg)";
    this._treeContainer.style.border = `1px solid ${this._themeService.getColorTheme().getColor(widgetBorder)}`;
    this._domNode.appendChild(this._treeContainer);
    this._layoutInfo = { maxHeight, width, arrowSize, arrowOffset, inputHeight: 0 };
    this._tree = this._createTree(this._treeContainer, input);
    this._disposables.add(this._tree.onDidOpen(async (e) => {
      const { element, editorOptions, sideBySide } = e;
      const didReveal = await this._revealElement(element, { ...editorOptions, preserveFocus: false }, sideBySide);
      if (!didReveal) {
        return;
      }
    }));
    this._disposables.add(this._tree.onDidChangeFocus((e) => {
      this._previewDispoables.value = this._previewElement(e.elements[0]);
    }));
    this._disposables.add(this._tree.onDidChangeContentHeight(() => {
      this._layout();
    }));
    this._domNode.focus();
    try {
      await this._setInput(input);
      this._layout();
    } catch (err) {
      onUnexpectedError(err);
    }
  }
  _layout() {
    const headerHeight = 2 * this._layoutInfo.arrowSize;
    const treeHeight = Math.min(this._layoutInfo.maxHeight - headerHeight, this._tree.contentHeight);
    const totalHeight = treeHeight + headerHeight;
    this._domNode.style.height = `${totalHeight}px`;
    this._domNode.style.width = `${this._layoutInfo.width}px`;
    this._arrow.style.top = `-${2 * this._layoutInfo.arrowSize}px`;
    this._arrow.style.borderWidth = `${this._layoutInfo.arrowSize}px`;
    this._arrow.style.marginLeft = `${this._layoutInfo.arrowOffset}px`;
    this._treeContainer.style.height = `${treeHeight}px`;
    this._treeContainer.style.width = `${this._layoutInfo.width}px`;
    this._tree.layout(treeHeight, this._layoutInfo.width);
  }
  restoreViewState() {
  }
};
BreadcrumbsPicker = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IConfigurationService)
], BreadcrumbsPicker);
class FileVirtualDelegate {
  getHeight(_element) {
    return 22;
  }
  getTemplateId(_element) {
    return "FileStat";
  }
}
class FileIdentityProvider {
  getId(element) {
    if (URI.isUri(element)) {
      return element.toString();
    } else if (isWorkspace(element)) {
      return element.id;
    } else if (isWorkspaceFolder(element)) {
      return element.uri.toString();
    } else {
      return element.resource.toString();
    }
  }
}
let FileDataSource = class {
  constructor(_fileService) {
    this._fileService = _fileService;
  }
  hasChildren(element) {
    return URI.isUri(element) || isWorkspace(element) || isWorkspaceFolder(element) || element.isDirectory;
  }
  async getChildren(element) {
    if (isWorkspace(element)) {
      return element.folders;
    }
    let uri;
    if (isWorkspaceFolder(element)) {
      uri = element.uri;
    } else if (URI.isUri(element)) {
      uri = element;
    } else {
      uri = element.resource;
    }
    const stat = await this._fileService.resolve(uri);
    return stat.children ?? [];
  }
};
FileDataSource = __decorateClass([
  __decorateParam(0, IFileService)
], FileDataSource);
let FileRenderer = class {
  constructor(_labels, _configService) {
    this._labels = _labels;
    this._configService = _configService;
    this.templateId = "FileStat";
  }
  renderTemplate(container) {
    return this._labels.create(container, { supportHighlights: true });
  }
  renderElement(node, index, templateData) {
    const fileDecorations = this._configService.getValue("explorer.decorations");
    const { element } = node;
    let resource;
    let fileKind;
    if (isWorkspaceFolder(element)) {
      resource = element.uri;
      fileKind = FileKind.ROOT_FOLDER;
    } else {
      resource = element.resource;
      fileKind = element.isDirectory ? FileKind.FOLDER : FileKind.FILE;
    }
    templateData.setFile(resource, {
      fileKind,
      hidePath: true,
      fileDecorations,
      matches: createMatches(node.filterData),
      extraClasses: ["picker-item"]
    });
  }
  disposeTemplate(templateData) {
    templateData.dispose();
  }
};
FileRenderer = __decorateClass([
  __decorateParam(1, IConfigurationService)
], FileRenderer);
class FileNavigationLabelProvider {
  getKeyboardNavigationLabel(element) {
    return element.name;
  }
}
class FileAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("breadcrumbs", "Breadcrumbs");
  }
  getAriaLabel(element) {
    return element.name;
  }
}
let FileFilter = class {
  constructor(_workspaceService, configService, fileService) {
    this._workspaceService = _workspaceService;
    this._cachedExpressions = /* @__PURE__ */ new Map();
    this._disposables = new DisposableStore();
    const config = BreadcrumbsConfig.FileExcludes.bindTo(configService);
    const update = () => {
      _workspaceService.getWorkspace().folders.forEach((folder) => {
        const excludesConfig = config.getValue({ resource: folder.uri });
        if (!excludesConfig) {
          return;
        }
        const adjustedConfig = {};
        for (const pattern in excludesConfig) {
          if (typeof excludesConfig[pattern] !== "boolean") {
            continue;
          }
          const patternAbs = pattern.indexOf("**/") !== 0 ? posix.join(folder.uri.path, pattern) : pattern;
          adjustedConfig[patternAbs] = excludesConfig[pattern];
        }
        const ignoreCase = !fileService.hasCapability(folder.uri, FileSystemProviderCapabilities.PathCaseSensitive);
        this._cachedExpressions.set(folder.uri.toString(), glob.parse(adjustedConfig, { ignoreCase }));
      });
    };
    update();
    this._disposables.add(config);
    this._disposables.add(config.onDidChange(update));
    this._disposables.add(_workspaceService.onDidChangeWorkspaceFolders(update));
  }
  dispose() {
    this._disposables.dispose();
  }
  filter(element, _parentVisibility) {
    if (isWorkspaceFolder(element)) {
      return true;
    }
    const folder = this._workspaceService.getWorkspaceFolder(element.resource);
    if (!folder || !this._cachedExpressions.has(folder.uri.toString())) {
      return true;
    }
    const expression = this._cachedExpressions.get(folder.uri.toString());
    return !expression(relative(folder.uri.path, element.resource.path), basename(element.resource));
  }
};
FileFilter = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IFileService)
], FileFilter);
class FileSorter {
  compare(a, b) {
    if (isWorkspaceFolder(a) && isWorkspaceFolder(b)) {
      return a.index - b.index;
    }
    if (a.isDirectory === b.isDirectory) {
      return compareFileNames(a.name, b.name);
    } else if (a.isDirectory) {
      return -1;
    } else {
      return 1;
    }
  }
}
let BreadcrumbsFilePicker = class extends BreadcrumbsPicker {
  constructor(parent, resource, instantiationService, themeService, configService, _workspaceService, _editorService) {
    super(parent, resource, instantiationService, themeService, configService);
    this._workspaceService = _workspaceService;
    this._editorService = _editorService;
  }
  _createTree(container) {
    this._treeContainer.classList.add("file-icon-themable-tree");
    this._treeContainer.classList.add("show-file-icons");
    const onFileIconThemeChange = (fileIconTheme) => {
      this._treeContainer.classList.toggle("align-icons-and-twisties", fileIconTheme.hasFileIcons && !fileIconTheme.hasFolderIcons);
      this._treeContainer.classList.toggle("hide-arrows", fileIconTheme.hidesExplorerArrows === true);
    };
    this._disposables.add(this._themeService.onDidFileIconThemeChange(onFileIconThemeChange));
    onFileIconThemeChange(this._themeService.getFileIconTheme());
    const labels = this._instantiationService.createInstance(
      ResourceLabels,
      DEFAULT_LABELS_CONTAINER
      /* TODO@Jo visibility propagation */
    );
    this._disposables.add(labels);
    return this._instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "BreadcrumbsFilePicker",
      container,
      new FileVirtualDelegate(),
      [this._instantiationService.createInstance(FileRenderer, labels)],
      this._instantiationService.createInstance(FileDataSource),
      {
        multipleSelectionSupport: false,
        sorter: new FileSorter(),
        filter: this._instantiationService.createInstance(FileFilter),
        identityProvider: new FileIdentityProvider(),
        keyboardNavigationLabelProvider: new FileNavigationLabelProvider(),
        accessibilityProvider: this._instantiationService.createInstance(FileAccessibilityProvider),
        showNotFoundMessage: false,
        overrideStyles: {
          listBackground: breadcrumbsPickerBackground
        }
      }
    );
  }
  async _setInput(element) {
    const { uri, kind } = element;
    let input;
    if (kind === FileKind.ROOT_FOLDER) {
      input = this._workspaceService.getWorkspace();
    } else {
      input = dirname(uri);
    }
    const tree = this._tree;
    await tree.setInput(input);
    let focusElement;
    for (const { element: element2 } of tree.getNode().children) {
      if (isWorkspaceFolder(element2) && isEqual(element2.uri, uri)) {
        focusElement = element2;
        break;
      } else if (isEqual(element2.resource, uri)) {
        focusElement = element2;
        break;
      }
    }
    if (focusElement) {
      tree.reveal(focusElement, 0.5);
      tree.setFocus([focusElement], this._fakeEvent);
    }
    tree.domFocus();
  }
  _previewElement(_element) {
    return Disposable.None;
  }
  async _revealElement(element, options, sideBySide) {
    if (!isWorkspaceFolder(element) && element.isFile) {
      this._onWillPickElement.fire();
      await this._editorService.openEditor({ resource: element.resource, options }, sideBySide ? SIDE_GROUP : void 0);
      return true;
    }
    return false;
  }
};
BreadcrumbsFilePicker = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IEditorService)
], BreadcrumbsFilePicker);
let OutlineTreeSorter = class {
  constructor(comparator, uri, configService) {
    this.comparator = comparator;
    this._order = configService.getValue(uri, "breadcrumbs.symbolSortOrder");
  }
  compare(a, b) {
    if (this._order === "name") {
      return this.comparator.compareByName(a, b);
    } else if (this._order === "type") {
      return this.comparator.compareByType(a, b);
    } else {
      return this.comparator.compareByPosition(a, b);
    }
  }
};
OutlineTreeSorter = __decorateClass([
  __decorateParam(2, ITextResourceConfigurationService)
], OutlineTreeSorter);
class BreadcrumbsOutlinePicker extends BreadcrumbsPicker {
  _createTree(container, input) {
    const { config } = input.outline;
    return this._instantiationService.createInstance(
      WorkbenchDataTree,
      "BreadcrumbsOutlinePicker",
      container,
      config.delegate,
      config.renderers,
      config.treeDataSource,
      {
        ...config.options,
        sorter: this._instantiationService.createInstance(OutlineTreeSorter, config.comparator, void 0),
        collapseByDefault: true,
        expandOnlyOnTwistieClick: true,
        multipleSelectionSupport: false,
        showNotFoundMessage: false
      }
    );
  }
  _setInput(input) {
    const viewState = input.outline.captureViewState();
    this.restoreViewState = () => {
      viewState.dispose();
    };
    const tree = this._tree;
    tree.setInput(input.outline);
    if (input.element !== input.outline) {
      tree.reveal(input.element, 0.5);
      tree.setFocus([input.element], this._fakeEvent);
    }
    tree.domFocus();
    return Promise.resolve();
  }
  _previewElement(element) {
    const outline = this._tree.getInput();
    return outline.preview(element);
  }
  async _revealElement(element, options, sideBySide) {
    this._onWillPickElement.fire();
    const outline = this._tree.getInput();
    await outline.reveal(element, options, sideBySide, false);
    return true;
  }
}
export {
  BreadcrumbsFilePicker,
  BreadcrumbsOutlinePicker,
  BreadcrumbsPicker,
  FileSorter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9icmVhZGNydW1ic1BpY2tlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvbXBhcmVGaWxlTmFtZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb21wYXJlcnMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNYXRjaGVzLCBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgKiBhcyBnbG9iIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcG9zaXgsIHJlbGF0aXZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICcuL21lZGlhL2JyZWFkY3J1bWJzY29udHJvbC5jc3MnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBJRmlsZVNlcnZpY2UsIElGaWxlU3RhdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaERhdGFUcmVlLCBXb3JrYmVuY2hBc3luY0RhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJyZWFkY3J1bWJzUGlja2VyQmFja2dyb3VuZCwgd2lkZ2V0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgaXNXb3Jrc3BhY2UsIGlzV29ya3NwYWNlRm9sZGVyLCBJV29ya3NwYWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUxhYmVscywgSVJlc291cmNlTGFiZWwsIERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUiB9IGZyb20gJy4uLy4uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBCcmVhZGNydW1ic0NvbmZpZyB9IGZyb20gJy4vYnJlYWRjcnVtYnMuanMnO1xuaW1wb3J0IHsgT3V0bGluZUVsZW1lbnQyLCBGaWxlRWxlbWVudCB9IGZyb20gJy4vYnJlYWRjcnVtYnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQXN5bmNEYXRhU291cmNlLCBJVHJlZVJlbmRlcmVyLCBJVHJlZU5vZGUsIElUcmVlRmlsdGVyLCBUcmVlVmlzaWJpbGl0eSwgSVRyZWVTb3J0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IElJZGVudGl0eVByb3ZpZGVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgSUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElGaWxlSWNvblRoZW1lLCBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU91dGxpbmUsIElPdXRsaW5lQ29tcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL291dGxpbmUvYnJvd3Nlci9vdXRsaW5lLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcblxuaW50ZXJmYWNlIElMYXlvdXRJbmZvIHtcblx0bWF4SGVpZ2h0OiBudW1iZXI7XG5cdHdpZHRoOiBudW1iZXI7XG5cdGFycm93U2l6ZTogbnVtYmVyO1xuXHRhcnJvd09mZnNldDogbnVtYmVyO1xuXHRpbnB1dEhlaWdodDogbnVtYmVyO1xufVxuXG50eXBlIFRyZWU8SSwgRT4gPSBXb3JrYmVuY2hEYXRhVHJlZTxJLCBFLCBGdXp6eVNjb3JlPiB8IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8SSwgRSwgRnV6enlTY29yZT47XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VsZWN0RXZlbnQge1xuXHR0YXJnZXQ6IHVua25vd247XG5cdGJyb3dzZXJFdmVudDogVUlFdmVudDtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJyZWFkY3J1bWJzUGlja2VyPFRJbnB1dCwgVEVsZW1lbnQ+IHtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2RvbU5vZGU6IEhUTUxEaXZFbGVtZW50O1xuXHRwcm90ZWN0ZWQgX2Fycm93ITogSFRNTERpdkVsZW1lbnQ7XG5cdHByb3RlY3RlZCBfdHJlZUNvbnRhaW5lciE6IEhUTUxEaXZFbGVtZW50O1xuXHRwcm90ZWN0ZWQgX3RyZWUhOiBUcmVlPFRJbnB1dCwgVEVsZW1lbnQ+O1xuXHRwcm90ZWN0ZWQgX2Zha2VFdmVudCA9IG5ldyBVSUV2ZW50KCdmYWtlRXZlbnQnKTtcblx0cHJvdGVjdGVkIF9sYXlvdXRJbmZvITogSUxheW91dEluZm87XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbldpbGxQaWNrRWxlbWVudCA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uV2lsbFBpY2tFbGVtZW50OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uV2lsbFBpY2tFbGVtZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZXZpZXdEaXNwb2FibGVzID0gbmV3IE11dGFibGVEaXNwb3NhYmxlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcm90ZWN0ZWQgcmVzb3VyY2U6IFVSSSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NOYW1lID0gJ21vbmFjby1icmVhZGNydW1icy1waWNrZXIgc2hvdy1maWxlLWljb25zJztcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5fZG9tTm9kZSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9wcmV2aWV3RGlzcG9hYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25XaWxsUGlja0VsZW1lbnQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2RvbU5vZGUucmVtb3ZlKCk7XG5cdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLl90cmVlLmRpc3Bvc2UoKSwgMCk7IC8vIHRyZWUgY2Fubm90IGJlIGRpc3Bvc2VkIHdoaWxlIGJlaW5nIG9wZW5lZC4uLlxuXHR9XG5cblx0YXN5bmMgc2hvdyhpbnB1dDogRmlsZUVsZW1lbnQgfCBPdXRsaW5lRWxlbWVudDIsIG1heEhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBhcnJvd1NpemU6IG51bWJlciwgYXJyb3dPZmZzZXQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgdGhlbWUgPSB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdGNvbnN0IGNvbG9yID0gdGhlbWUuZ2V0Q29sb3IoYnJlYWRjcnVtYnNQaWNrZXJCYWNrZ3JvdW5kKTtcblxuXHRcdHRoaXMuX2Fycm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fYXJyb3cuY2xhc3NOYW1lID0gJ2Fycm93Jztcblx0XHR0aGlzLl9hcnJvdy5zdHlsZS5ib3JkZXJDb2xvciA9IGB0cmFuc3BhcmVudCB0cmFuc3BhcmVudCAke2NvbG9yID8gY29sb3IudG9TdHJpbmcoKSA6ICcnfWA7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9hcnJvdyk7XG5cblx0XHR0aGlzLl90cmVlQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fdHJlZUNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kID0gY29sb3IgPyBjb2xvci50b1N0cmluZygpIDogJyc7XG5cdFx0dGhpcy5fdHJlZUNvbnRhaW5lci5zdHlsZS5wYWRkaW5nVG9wID0gJzJweCc7XG5cdFx0dGhpcy5fdHJlZUNvbnRhaW5lci5zdHlsZS5ib3JkZXJSYWRpdXMgPSAnM3B4Jztcblx0XHR0aGlzLl90cmVlQ29udGFpbmVyLnN0eWxlLmJveFNoYWRvdyA9ICd2YXIoLS12c2NvZGUtc2hhZG93LWxnKSc7XG5cdFx0dGhpcy5fdHJlZUNvbnRhaW5lci5zdHlsZS5ib3JkZXIgPSBgMXB4IHNvbGlkICR7dGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS5nZXRDb2xvcih3aWRnZXRCb3JkZXIpfWA7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl90cmVlQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuX2xheW91dEluZm8gPSB7IG1heEhlaWdodCwgd2lkdGgsIGFycm93U2l6ZSwgYXJyb3dPZmZzZXQsIGlucHV0SGVpZ2h0OiAwIH07XG5cdFx0dGhpcy5fdHJlZSA9IHRoaXMuX2NyZWF0ZVRyZWUodGhpcy5fdHJlZUNvbnRhaW5lciwgaW5wdXQpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3RyZWUub25EaWRPcGVuKGFzeW5jIGUgPT4ge1xuXHRcdFx0Y29uc3QgeyBlbGVtZW50LCBlZGl0b3JPcHRpb25zLCBzaWRlQnlTaWRlIH0gPSBlO1xuXHRcdFx0Y29uc3QgZGlkUmV2ZWFsID0gYXdhaXQgdGhpcy5fcmV2ZWFsRWxlbWVudChlbGVtZW50LCB7IC4uLmVkaXRvck9wdGlvbnMsIHByZXNlcnZlRm9jdXM6IGZhbHNlIH0sIHNpZGVCeVNpZGUpO1xuXHRcdFx0aWYgKCFkaWRSZXZlYWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fdHJlZS5vbkRpZENoYW5nZUZvY3VzKGUgPT4ge1xuXHRcdFx0dGhpcy5fcHJldmlld0Rpc3BvYWJsZXMudmFsdWUgPSB0aGlzLl9wcmV2aWV3RWxlbWVudChlLmVsZW1lbnRzWzBdKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3RyZWUub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCgpID0+IHtcblx0XHRcdHRoaXMuX2xheW91dCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUuZm9jdXMoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fc2V0SW5wdXQoaW5wdXQpO1xuXHRcdFx0dGhpcy5fbGF5b3V0KCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfbGF5b3V0KCk6IHZvaWQge1xuXG5cdFx0Y29uc3QgaGVhZGVySGVpZ2h0ID0gMiAqIHRoaXMuX2xheW91dEluZm8uYXJyb3dTaXplO1xuXHRcdGNvbnN0IHRyZWVIZWlnaHQgPSBNYXRoLm1pbih0aGlzLl9sYXlvdXRJbmZvLm1heEhlaWdodCAtIGhlYWRlckhlaWdodCwgdGhpcy5fdHJlZS5jb250ZW50SGVpZ2h0KTtcblx0XHRjb25zdCB0b3RhbEhlaWdodCA9IHRyZWVIZWlnaHQgKyBoZWFkZXJIZWlnaHQ7XG5cblx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLmhlaWdodCA9IGAke3RvdGFsSGVpZ2h0fXB4YDtcblx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLndpZHRoID0gYCR7dGhpcy5fbGF5b3V0SW5mby53aWR0aH1weGA7XG5cdFx0dGhpcy5fYXJyb3cuc3R5bGUudG9wID0gYC0kezIgKiB0aGlzLl9sYXlvdXRJbmZvLmFycm93U2l6ZX1weGA7XG5cdFx0dGhpcy5fYXJyb3cuc3R5bGUuYm9yZGVyV2lkdGggPSBgJHt0aGlzLl9sYXlvdXRJbmZvLmFycm93U2l6ZX1weGA7XG5cdFx0dGhpcy5fYXJyb3cuc3R5bGUubWFyZ2luTGVmdCA9IGAke3RoaXMuX2xheW91dEluZm8uYXJyb3dPZmZzZXR9cHhgO1xuXHRcdHRoaXMuX3RyZWVDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7dHJlZUhlaWdodH1weGA7XG5cdFx0dGhpcy5fdHJlZUNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3RoaXMuX2xheW91dEluZm8ud2lkdGh9cHhgO1xuXHRcdHRoaXMuX3RyZWUubGF5b3V0KHRyZWVIZWlnaHQsIHRoaXMuX2xheW91dEluZm8ud2lkdGgpO1xuXHR9XG5cblx0cmVzdG9yZVZpZXdTdGF0ZSgpOiB2b2lkIHsgfVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfc2V0SW5wdXQoZWxlbWVudDogRmlsZUVsZW1lbnQgfCBPdXRsaW5lRWxlbWVudDIpOiBQcm9taXNlPHZvaWQ+O1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2NyZWF0ZVRyZWUoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgaW5wdXQ6IHVua25vd24pOiBUcmVlPFRJbnB1dCwgVEVsZW1lbnQ+O1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX3ByZXZpZXdFbGVtZW50KGVsZW1lbnQ6IHVua25vd24pOiBJRGlzcG9zYWJsZTtcblx0cHJvdGVjdGVkIGFic3RyYWN0IF9yZXZlYWxFbGVtZW50KGVsZW1lbnQ6IHVua25vd24sIG9wdGlvbnM6IElFZGl0b3JPcHRpb25zLCBzaWRlQnlTaWRlOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPjtcblxufVxuXG4vLyNyZWdpb24gLSBGaWxlc1xuXG5jbGFzcyBGaWxlVmlydHVhbERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SUZpbGVTdGF0IHwgSVdvcmtzcGFjZUZvbGRlcj4ge1xuXHRnZXRIZWlnaHQoX2VsZW1lbnQ6IElGaWxlU3RhdCB8IElXb3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRyZXR1cm4gMjI7XG5cdH1cblx0Z2V0VGVtcGxhdGVJZChfZWxlbWVudDogSUZpbGVTdGF0IHwgSVdvcmtzcGFjZUZvbGRlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdGaWxlU3RhdCc7XG5cdH1cbn1cblxuY2xhc3MgRmlsZUlkZW50aXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJSWRlbnRpdHlQcm92aWRlcjxJV29ya3NwYWNlIHwgSVdvcmtzcGFjZUZvbGRlciB8IElGaWxlU3RhdCB8IFVSST4ge1xuXHRnZXRJZChlbGVtZW50OiBJV29ya3NwYWNlIHwgSVdvcmtzcGFjZUZvbGRlciB8IElGaWxlU3RhdCB8IFVSSSk6IHsgdG9TdHJpbmcoKTogc3RyaW5nIH0ge1xuXHRcdGlmIChVUkkuaXNVcmkoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LnRvU3RyaW5nKCk7XG5cdFx0fSBlbHNlIGlmIChpc1dvcmtzcGFjZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuaWQ7XG5cdFx0fSBlbHNlIGlmIChpc1dvcmtzcGFjZUZvbGRlcihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQudXJpLnRvU3RyaW5nKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBlbGVtZW50LnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0fVxuXHR9XG59XG5cblxuY2xhc3MgRmlsZURhdGFTb3VyY2UgaW1wbGVtZW50cyBJQXN5bmNEYXRhU291cmNlPElXb3Jrc3BhY2UgfCBVUkksIElXb3Jrc3BhY2VGb2xkZXIgfCBJRmlsZVN0YXQ+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdCkgeyB9XG5cblx0aGFzQ2hpbGRyZW4oZWxlbWVudDogSVdvcmtzcGFjZSB8IFVSSSB8IElXb3Jrc3BhY2VGb2xkZXIgfCBJRmlsZVN0YXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gVVJJLmlzVXJpKGVsZW1lbnQpXG5cdFx0XHR8fCBpc1dvcmtzcGFjZShlbGVtZW50KVxuXHRcdFx0fHwgaXNXb3Jrc3BhY2VGb2xkZXIoZWxlbWVudClcblx0XHRcdHx8IGVsZW1lbnQuaXNEaXJlY3Rvcnk7XG5cdH1cblxuXHRhc3luYyBnZXRDaGlsZHJlbihlbGVtZW50OiBJV29ya3NwYWNlIHwgVVJJIHwgSVdvcmtzcGFjZUZvbGRlciB8IElGaWxlU3RhdCk6IFByb21pc2U8KElXb3Jrc3BhY2VGb2xkZXIgfCBJRmlsZVN0YXQpW10+IHtcblx0XHRpZiAoaXNXb3Jrc3BhY2UoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LmZvbGRlcnM7XG5cdFx0fVxuXHRcdGxldCB1cmk6IFVSSTtcblx0XHRpZiAoaXNXb3Jrc3BhY2VGb2xkZXIoZWxlbWVudCkpIHtcblx0XHRcdHVyaSA9IGVsZW1lbnQudXJpO1xuXHRcdH0gZWxzZSBpZiAoVVJJLmlzVXJpKGVsZW1lbnQpKSB7XG5cdFx0XHR1cmkgPSBlbGVtZW50O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR1cmkgPSBlbGVtZW50LnJlc291cmNlO1xuXHRcdH1cblx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZSh1cmkpO1xuXHRcdHJldHVybiBzdGF0LmNoaWxkcmVuID8/IFtdO1xuXHR9XG59XG5cbmNsYXNzIEZpbGVSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8SUZpbGVTdGF0IHwgSVdvcmtzcGFjZUZvbGRlciwgRnV6enlTY29yZSwgSVJlc291cmNlTGFiZWw+IHtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSAnRmlsZVN0YXQnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVJlc291cmNlTGFiZWwge1xuXHRcdHJldHVybiB0aGlzLl9sYWJlbHMuY3JlYXRlKGNvbnRhaW5lciwgeyBzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSB9KTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElXb3Jrc3BhY2VGb2xkZXIgfCBJRmlsZVN0YXQsIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVJlc291cmNlTGFiZWwpOiB2b2lkIHtcblx0XHRjb25zdCBmaWxlRGVjb3JhdGlvbnMgPSB0aGlzLl9jb25maWdTZXJ2aWNlLmdldFZhbHVlPHsgY29sb3JzOiBib29sZWFuOyBiYWRnZXM6IGJvb2xlYW4gfT4oJ2V4cGxvcmVyLmRlY29yYXRpb25zJyk7XG5cdFx0Y29uc3QgeyBlbGVtZW50IH0gPSBub2RlO1xuXHRcdGxldCByZXNvdXJjZTogVVJJO1xuXHRcdGxldCBmaWxlS2luZDogRmlsZUtpbmQ7XG5cdFx0aWYgKGlzV29ya3NwYWNlRm9sZGVyKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXNvdXJjZSA9IGVsZW1lbnQudXJpO1xuXHRcdFx0ZmlsZUtpbmQgPSBGaWxlS2luZC5ST09UX0ZPTERFUjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzb3VyY2UgPSBlbGVtZW50LnJlc291cmNlO1xuXHRcdFx0ZmlsZUtpbmQgPSBlbGVtZW50LmlzRGlyZWN0b3J5ID8gRmlsZUtpbmQuRk9MREVSIDogRmlsZUtpbmQuRklMRTtcblx0XHR9XG5cdFx0dGVtcGxhdGVEYXRhLnNldEZpbGUocmVzb3VyY2UsIHtcblx0XHRcdGZpbGVLaW5kLFxuXHRcdFx0aGlkZVBhdGg6IHRydWUsXG5cdFx0XHRmaWxlRGVjb3JhdGlvbnM6IGZpbGVEZWNvcmF0aW9ucyxcblx0XHRcdG1hdGNoZXM6IGNyZWF0ZU1hdGNoZXMobm9kZS5maWx0ZXJEYXRhKSxcblx0XHRcdGV4dHJhQ2xhc3NlczogWydwaWNrZXItaXRlbSddXG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJUmVzb3VyY2VMYWJlbCk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgRmlsZU5hdmlnYXRpb25MYWJlbFByb3ZpZGVyIGltcGxlbWVudHMgSUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI8SVdvcmtzcGFjZUZvbGRlciB8IElGaWxlU3RhdD4ge1xuXG5cdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKGVsZW1lbnQ6IElXb3Jrc3BhY2VGb2xkZXIgfCBJRmlsZVN0YXQpOiB7IHRvU3RyaW5nKCk6IHN0cmluZyB9IHtcblx0XHRyZXR1cm4gZWxlbWVudC5uYW1lO1xuXHR9XG59XG5cbmNsYXNzIEZpbGVBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxJV29ya3NwYWNlRm9sZGVyIHwgSUZpbGVTdGF0PiB7XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdicmVhZGNydW1icycsIFwiQnJlYWRjcnVtYnNcIik7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogSVdvcmtzcGFjZUZvbGRlciB8IElGaWxlU3RhdCk6IHN0cmluZyB8IG51bGwge1xuXHRcdHJldHVybiBlbGVtZW50Lm5hbWU7XG5cdH1cbn1cblxuY2xhc3MgRmlsZUZpbHRlciBpbXBsZW1lbnRzIElUcmVlRmlsdGVyPElXb3Jrc3BhY2VGb2xkZXIgfCBJRmlsZVN0YXQ+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZWRFeHByZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBnbG9iLlBhcnNlZEV4cHJlc3Npb24+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlnU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgY29uZmlnID0gQnJlYWRjcnVtYnNDb25maWcuRmlsZUV4Y2x1ZGVzLmJpbmRUbyhjb25maWdTZXJ2aWNlKTtcblx0XHRjb25zdCB1cGRhdGUgPSAoKSA9PiB7XG5cdFx0XHRfd29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLmZvckVhY2goZm9sZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgZXhjbHVkZXNDb25maWcgPSBjb25maWcuZ2V0VmFsdWUoeyByZXNvdXJjZTogZm9sZGVyLnVyaSB9KTtcblx0XHRcdFx0aWYgKCFleGNsdWRlc0NvbmZpZykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBhZGp1c3QgcGF0dGVybnMgdG8gYmUgYWJzb2x1dGUgaW4gY2FzZSB0aGV5IGFyZW4ndFxuXHRcdFx0XHQvLyBmcmVlIGZsb2F0aW5nICgqKi8pXG5cdFx0XHRcdGNvbnN0IGFkanVzdGVkQ29uZmlnOiBnbG9iLklFeHByZXNzaW9uID0ge307XG5cdFx0XHRcdGZvciAoY29uc3QgcGF0dGVybiBpbiBleGNsdWRlc0NvbmZpZykge1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgZXhjbHVkZXNDb25maWdbcGF0dGVybl0gIT09ICdib29sZWFuJykge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHBhdHRlcm5BYnMgPSBwYXR0ZXJuLmluZGV4T2YoJyoqLycpICE9PSAwXG5cdFx0XHRcdFx0XHQ/IHBvc2l4LmpvaW4oZm9sZGVyLnVyaS5wYXRoLCBwYXR0ZXJuKVxuXHRcdFx0XHRcdFx0OiBwYXR0ZXJuO1xuXG5cdFx0XHRcdFx0YWRqdXN0ZWRDb25maWdbcGF0dGVybkFic10gPSBleGNsdWRlc0NvbmZpZ1twYXR0ZXJuXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBpZ25vcmVDYXNlID0gIWZpbGVTZXJ2aWNlLmhhc0NhcGFiaWxpdHkoZm9sZGVyLnVyaSwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlBhdGhDYXNlU2Vuc2l0aXZlKTtcblx0XHRcdFx0dGhpcy5fY2FjaGVkRXhwcmVzc2lvbnMuc2V0KGZvbGRlci51cmkudG9TdHJpbmcoKSwgZ2xvYi5wYXJzZShhZGp1c3RlZENvbmZpZywgeyBpZ25vcmVDYXNlIH0pKTtcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0dXBkYXRlKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGNvbmZpZyk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGNvbmZpZy5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoX3dvcmtzcGFjZVNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKHVwZGF0ZSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRmaWx0ZXIoZWxlbWVudDogSVdvcmtzcGFjZUZvbGRlciB8IElGaWxlU3RhdCwgX3BhcmVudFZpc2liaWxpdHk6IFRyZWVWaXNpYmlsaXR5KTogYm9vbGVhbiB7XG5cdFx0aWYgKGlzV29ya3NwYWNlRm9sZGVyKGVsZW1lbnQpKSB7XG5cdFx0XHQvLyBub3QgYSBmaWxlXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5fd29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIoZWxlbWVudC5yZXNvdXJjZSk7XG5cdFx0aWYgKCFmb2xkZXIgfHwgIXRoaXMuX2NhY2hlZEV4cHJlc3Npb25zLmhhcyhmb2xkZXIudXJpLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHQvLyBubyBmb2xkZXIgb3Igbm8gZmlsZXJcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cHJlc3Npb24gPSB0aGlzLl9jYWNoZWRFeHByZXNzaW9ucy5nZXQoZm9sZGVyLnVyaS50b1N0cmluZygpKSE7XG5cdFx0cmV0dXJuICFleHByZXNzaW9uKHJlbGF0aXZlKGZvbGRlci51cmkucGF0aCwgZWxlbWVudC5yZXNvdXJjZS5wYXRoKSwgYmFzZW5hbWUoZWxlbWVudC5yZXNvdXJjZSkpO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIEZpbGVTb3J0ZXIgaW1wbGVtZW50cyBJVHJlZVNvcnRlcjxJRmlsZVN0YXQgfCBJV29ya3NwYWNlRm9sZGVyPiB7XG5cdGNvbXBhcmUoYTogSUZpbGVTdGF0IHwgSVdvcmtzcGFjZUZvbGRlciwgYjogSUZpbGVTdGF0IHwgSVdvcmtzcGFjZUZvbGRlcik6IG51bWJlciB7XG5cdFx0aWYgKGlzV29ya3NwYWNlRm9sZGVyKGEpICYmIGlzV29ya3NwYWNlRm9sZGVyKGIpKSB7XG5cdFx0XHRyZXR1cm4gYS5pbmRleCAtIGIuaW5kZXg7XG5cdFx0fVxuXHRcdGlmICgoYSBhcyBJRmlsZVN0YXQpLmlzRGlyZWN0b3J5ID09PSAoYiBhcyBJRmlsZVN0YXQpLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHQvLyBzYW1lIHR5cGUgLT4gY29tcGFyZSBvbiBuYW1lc1xuXHRcdFx0cmV0dXJuIGNvbXBhcmVGaWxlTmFtZXMoYS5uYW1lLCBiLm5hbWUpO1xuXHRcdH0gZWxzZSBpZiAoKGEgYXMgSUZpbGVTdGF0KS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEJyZWFkY3J1bWJzRmlsZVBpY2tlciBleHRlbmRzIEJyZWFkY3J1bWJzUGlja2VyPElXb3Jrc3BhY2UgfCBVUkksIElXb3Jrc3BhY2VGb2xkZXIgfCBJRmlsZVN0YXQ+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHJlc291cmNlOiBVUkksXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHBhcmVudCwgcmVzb3VyY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9jcmVhdGVUcmVlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblxuXHRcdC8vIHRyZWUgaWNvbiB0aGVtZSBzcGVjaWFsc1xuXHRcdHRoaXMuX3RyZWVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZmlsZS1pY29uLXRoZW1hYmxlLXRyZWUnKTtcblx0XHR0aGlzLl90cmVlQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Nob3ctZmlsZS1pY29ucycpO1xuXHRcdGNvbnN0IG9uRmlsZUljb25UaGVtZUNoYW5nZSA9IChmaWxlSWNvblRoZW1lOiBJRmlsZUljb25UaGVtZSkgPT4ge1xuXHRcdFx0dGhpcy5fdHJlZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdhbGlnbi1pY29ucy1hbmQtdHdpc3RpZXMnLCBmaWxlSWNvblRoZW1lLmhhc0ZpbGVJY29ucyAmJiAhZmlsZUljb25UaGVtZS5oYXNGb2xkZXJJY29ucyk7XG5cdFx0XHR0aGlzLl90cmVlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGUtYXJyb3dzJywgZmlsZUljb25UaGVtZS5oaWRlc0V4cGxvcmVyQXJyb3dzID09PSB0cnVlKTtcblx0XHR9O1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl90aGVtZVNlcnZpY2Uub25EaWRGaWxlSWNvblRoZW1lQ2hhbmdlKG9uRmlsZUljb25UaGVtZUNoYW5nZSkpO1xuXHRcdG9uRmlsZUljb25UaGVtZUNoYW5nZSh0aGlzLl90aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpKTtcblxuXHRcdGNvbnN0IGxhYmVscyA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCBERUZBVUxUX0xBQkVMU19DT05UQUlORVIgLyogVE9ET0BKbyB2aXNpYmlsaXR5IHByb3BhZ2F0aW9uICovKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQobGFiZWxzKTtcblxuXHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8SVdvcmtzcGFjZSB8IFVSSSwgSVdvcmtzcGFjZUZvbGRlciB8IElGaWxlU3RhdCwgRnV6enlTY29yZT4sXG5cdFx0XHQnQnJlYWRjcnVtYnNGaWxlUGlja2VyJyxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdG5ldyBGaWxlVmlydHVhbERlbGVnYXRlKCksXG5cdFx0XHRbdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZVJlbmRlcmVyLCBsYWJlbHMpXSxcblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVEYXRhU291cmNlKSxcblx0XHRcdHtcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0c29ydGVyOiBuZXcgRmlsZVNvcnRlcigpLFxuXHRcdFx0XHRmaWx0ZXI6IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVGaWx0ZXIpLFxuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiBuZXcgRmlsZUlkZW50aXR5UHJvdmlkZXIoKSxcblx0XHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjogbmV3IEZpbGVOYXZpZ2F0aW9uTGFiZWxQcm92aWRlcigpLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVBY2Nlc3NpYmlsaXR5UHJvdmlkZXIpLFxuXHRcdFx0XHRzaG93Tm90Rm91bmRNZXNzYWdlOiBmYWxzZSxcblx0XHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHtcblx0XHRcdFx0XHRsaXN0QmFja2dyb3VuZDogYnJlYWRjcnVtYnNQaWNrZXJCYWNrZ3JvdW5kXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfc2V0SW5wdXQoZWxlbWVudDogRmlsZUVsZW1lbnQgfCBPdXRsaW5lRWxlbWVudDIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IHVyaSwga2luZCB9ID0gKGVsZW1lbnQgYXMgRmlsZUVsZW1lbnQpO1xuXHRcdGxldCBpbnB1dDogSVdvcmtzcGFjZSB8IFVSSTtcblx0XHRpZiAoa2luZCA9PT0gRmlsZUtpbmQuUk9PVF9GT0xERVIpIHtcblx0XHRcdGlucHV0ID0gdGhpcy5fd29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aW5wdXQgPSBkaXJuYW1lKHVyaSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJlZSA9IHRoaXMuX3RyZWUgYXMgV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxJV29ya3NwYWNlIHwgVVJJLCBJV29ya3NwYWNlRm9sZGVyIHwgSUZpbGVTdGF0LCBGdXp6eVNjb3JlPjtcblx0XHRhd2FpdCB0cmVlLnNldElucHV0KGlucHV0KTtcblx0XHRsZXQgZm9jdXNFbGVtZW50OiBJV29ya3NwYWNlRm9sZGVyIHwgSUZpbGVTdGF0IHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgeyBlbGVtZW50IH0gb2YgdHJlZS5nZXROb2RlKCkuY2hpbGRyZW4pIHtcblx0XHRcdGlmIChpc1dvcmtzcGFjZUZvbGRlcihlbGVtZW50KSAmJiBpc0VxdWFsKGVsZW1lbnQudXJpLCB1cmkpKSB7XG5cdFx0XHRcdGZvY3VzRWxlbWVudCA9IGVsZW1lbnQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBlbHNlIGlmIChpc0VxdWFsKChlbGVtZW50IGFzIElGaWxlU3RhdCkucmVzb3VyY2UsIHVyaSkpIHtcblx0XHRcdFx0Zm9jdXNFbGVtZW50ID0gZWxlbWVudCBhcyBJRmlsZVN0YXQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZm9jdXNFbGVtZW50KSB7XG5cdFx0XHR0cmVlLnJldmVhbChmb2N1c0VsZW1lbnQsIDAuNSk7XG5cdFx0XHR0cmVlLnNldEZvY3VzKFtmb2N1c0VsZW1lbnRdLCB0aGlzLl9mYWtlRXZlbnQpO1xuXHRcdH1cblx0XHR0cmVlLmRvbUZvY3VzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3ByZXZpZXdFbGVtZW50KF9lbGVtZW50OiB1bmtub3duKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX3JldmVhbEVsZW1lbnQoZWxlbWVudDogSUZpbGVTdGF0IHwgSVdvcmtzcGFjZUZvbGRlciwgb3B0aW9uczogSUVkaXRvck9wdGlvbnMsIHNpZGVCeVNpZGU6IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIWlzV29ya3NwYWNlRm9sZGVyKGVsZW1lbnQpICYmIGVsZW1lbnQuaXNGaWxlKSB7XG5cdFx0XHR0aGlzLl9vbldpbGxQaWNrRWxlbWVudC5maXJlKCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogZWxlbWVudC5yZXNvdXJjZSwgb3B0aW9ucyB9LCBzaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIC0gT3V0bGluZVxuXG5jbGFzcyBPdXRsaW5lVHJlZVNvcnRlcjxFPiBpbXBsZW1lbnRzIElUcmVlU29ydGVyPEU+IHtcblxuXHRwcml2YXRlIF9vcmRlcjogJ25hbWUnIHwgJ3R5cGUnIHwgJ3Bvc2l0aW9uJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGNvbXBhcmF0b3I6IElPdXRsaW5lQ29tcGFyYXRvcjxFPixcblx0XHR1cmk6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ1NlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fb3JkZXIgPSBjb25maWdTZXJ2aWNlLmdldFZhbHVlKHVyaSwgJ2JyZWFkY3J1bWJzLnN5bWJvbFNvcnRPcmRlcicpO1xuXHR9XG5cblx0Y29tcGFyZShhOiBFLCBiOiBFKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fb3JkZXIgPT09ICduYW1lJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29tcGFyYXRvci5jb21wYXJlQnlOYW1lKGEsIGIpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fb3JkZXIgPT09ICd0eXBlJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29tcGFyYXRvci5jb21wYXJlQnlUeXBlKGEsIGIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb21wYXJhdG9yLmNvbXBhcmVCeVBvc2l0aW9uKGEsIGIpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnJlYWRjcnVtYnNPdXRsaW5lUGlja2VyIGV4dGVuZHMgQnJlYWRjcnVtYnNQaWNrZXI8SU91dGxpbmU8dW5rbm93bj4sIHVua25vd24+IHtcblxuXHRwcm90ZWN0ZWQgX2NyZWF0ZVRyZWUoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgaW5wdXQ6IE91dGxpbmVFbGVtZW50Mikge1xuXG5cdFx0Y29uc3QgeyBjb25maWcgfSA9IGlucHV0Lm91dGxpbmU7XG5cblx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hEYXRhVHJlZTxJT3V0bGluZTx1bmtub3duPiwgdW5rbm93biwgRnV6enlTY29yZT4sXG5cdFx0XHQnQnJlYWRjcnVtYnNPdXRsaW5lUGlja2VyJyxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdGNvbmZpZy5kZWxlZ2F0ZSxcblx0XHRcdGNvbmZpZy5yZW5kZXJlcnMsXG5cdFx0XHRjb25maWcudHJlZURhdGFTb3VyY2UsXG5cdFx0XHR7XG5cdFx0XHRcdC4uLmNvbmZpZy5vcHRpb25zLFxuXHRcdFx0XHRzb3J0ZXI6IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE91dGxpbmVUcmVlU29ydGVyLCBjb25maWcuY29tcGFyYXRvciwgdW5kZWZpbmVkKSxcblx0XHRcdFx0Y29sbGFwc2VCeURlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogdHJ1ZSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0c2hvd05vdEZvdW5kTWVzc2FnZTogZmFsc2Vcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zZXRJbnB1dChpbnB1dDogT3V0bGluZUVsZW1lbnQyKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCB2aWV3U3RhdGUgPSBpbnB1dC5vdXRsaW5lLmNhcHR1cmVWaWV3U3RhdGUoKTtcblx0XHR0aGlzLnJlc3RvcmVWaWV3U3RhdGUgPSAoKSA9PiB7IHZpZXdTdGF0ZS5kaXNwb3NlKCk7IH07XG5cblx0XHRjb25zdCB0cmVlID0gdGhpcy5fdHJlZSBhcyBXb3JrYmVuY2hEYXRhVHJlZTxJT3V0bGluZTx1bmtub3duPiwgdW5rbm93biwgRnV6enlTY29yZT47XG5cblx0XHR0cmVlLnNldElucHV0KGlucHV0Lm91dGxpbmUpO1xuXHRcdGlmIChpbnB1dC5lbGVtZW50ICE9PSBpbnB1dC5vdXRsaW5lKSB7XG5cdFx0XHR0cmVlLnJldmVhbChpbnB1dC5lbGVtZW50LCAwLjUpO1xuXHRcdFx0dHJlZS5zZXRGb2N1cyhbaW5wdXQuZWxlbWVudF0sIHRoaXMuX2Zha2VFdmVudCk7XG5cdFx0fVxuXHRcdHRyZWUuZG9tRm9jdXMoKTtcblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfcHJldmlld0VsZW1lbnQoZWxlbWVudDogdW5rbm93bik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBvdXRsaW5lOiBJT3V0bGluZTx1bmtub3duPiA9IHRoaXMuX3RyZWUuZ2V0SW5wdXQoKSE7XG5cdFx0cmV0dXJuIG91dGxpbmUucHJldmlldyhlbGVtZW50KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfcmV2ZWFsRWxlbWVudChlbGVtZW50OiB1bmtub3duLCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucywgc2lkZUJ5U2lkZTogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRoaXMuX29uV2lsbFBpY2tFbGVtZW50LmZpcmUoKTtcblx0XHRjb25zdCBvdXRsaW5lOiBJT3V0bGluZTx1bmtub3duPiA9IHRoaXMuX3RyZWUuZ2V0SW5wdXQoKSE7XG5cdFx0YXdhaXQgb3V0bGluZS5yZXZlYWwoZWxlbWVudCwgb3B0aW9ucywgc2lkZUJ5U2lkZSwgZmFsc2UpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMscUJBQWlDO0FBQzFDLFlBQVksVUFBVTtBQUN0QixTQUFzQixpQkFBaUIsbUJBQW1CLGtCQUFrQjtBQUM1RSxTQUFTLE9BQU8sZ0JBQWdCO0FBQ2hDLFNBQVMsVUFBVSxTQUFTLGVBQWU7QUFDM0MsU0FBUyxXQUFXO0FBQ3BCLE9BQU87QUFDUCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFVBQVUsZ0NBQWdDLG9CQUErQjtBQUNsRixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQiw4QkFBOEI7QUFDMUQsU0FBUyw2QkFBNkIsb0JBQW9CO0FBQzFELFNBQVMsYUFBYSxtQkFBK0IsZ0NBQWtEO0FBQ3ZHLFNBQVMsZ0JBQWdDLGdDQUFnQztBQUN6RSxTQUFTLHlCQUF5QjtBQUlsQyxTQUF5QixxQkFBcUI7QUFFOUMsU0FBUyxnQkFBZ0I7QUFHekIsU0FBUyxnQkFBZ0Isa0JBQWtCO0FBQzNDLFNBQVMseUNBQXlDO0FBaUIzQyxJQUFlLG9CQUFmLE1BQW1EO0FBQUEsRUFlekQsWUFDQyxRQUNVLFVBQ2dDLHVCQUNSLGVBQ1EsdUJBQ3pDO0FBSlM7QUFDZ0M7QUFDUjtBQUNRO0FBbEIzQyxTQUFtQixlQUFlLElBQUksZ0JBQWdCO0FBS3RELFNBQVUsYUFBYSxJQUFJLFFBQVEsV0FBVztBQUc5QyxTQUFtQixxQkFBcUIsSUFBSSxRQUFjO0FBQzFELFNBQVMsb0JBQWlDLEtBQUssbUJBQW1CO0FBRWxFLFNBQWlCLHFCQUFxQixJQUFJLGtCQUFrQjtBQVMzRCxTQUFLLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDNUMsU0FBSyxTQUFTLFlBQVk7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
