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
import { TreeFindMode } from "../../../../base/browser/ui/tree/abstractTree.js";
import { TreeVisibility } from "../../../../base/browser/ui/tree/tree.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { createMatches } from "../../../../base/common/filters.js";
import { normalizeDriveLetter, tildify } from "../../../../base/common/labels.js";
import { dispose, DisposableMap, DisposableStore } from "../../../../base/common/lifecycle.js";
import { isAbsolute, normalize, posix } from "../../../../base/common/path.js";
import { isWindows } from "../../../../base/common/platform.js";
import { ltrim } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import * as nls from "../../../../nls.js";
import { MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchCompressibleObjectTree } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ResourceLabels } from "../../../browser/labels.js";
import { ViewAction, ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { CONTEXT_LOADED_SCRIPTS_ITEM_TYPE, IDebugService, LOADED_SCRIPTS_VIEW_ID } from "../common/debug.js";
import { DebugContentProvider } from "../common/debugContentProvider.js";
import { renderViewTree } from "./baseDebugView.js";
const NEW_STYLE_COMPRESS = true;
const URI_SCHEMA_PATTERN = /^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/;
class BaseTreeItem {
  constructor(_parent, _label, isIncompressible = false) {
    this._parent = _parent;
    this._label = _label;
    this.isIncompressible = isIncompressible;
    this._children = /* @__PURE__ */ new Map();
    this._showedMoreThanOne = false;
  }
  updateLabel(label) {
    this._label = label;
  }
  isLeaf() {
    return this._children.size === 0;
  }
  getSession() {
    if (this._parent) {
      return this._parent.getSession();
    }
    return void 0;
  }
  setSource(session, source) {
    this._source = source;
    this._children.clear();
    if (source.raw && source.raw.sources) {
      for (const src of source.raw.sources) {
        if (src.name && src.path) {
          const s = new BaseTreeItem(this, src.name);
          this._children.set(src.path, s);
          const ss = session.getSource(src);
          s.setSource(session, ss);
        }
      }
    }
  }
  createIfNeeded(key, factory) {
    let child = this._children.get(key);
    if (!child) {
      child = factory(this, key);
      this._children.set(key, child);
    }
    return child;
  }
  getChild(key) {
    return this._children.get(key);
  }
  remove(key) {
    this._children.delete(key);
  }
  removeFromParent() {
    if (this._parent) {
      this._parent.remove(this._label);
      if (this._parent._children.size === 0) {
        this._parent.removeFromParent();
      }
    }
  }
  getTemplateId() {
    return "id";
  }
  // a dynamic ID based on the parent chain; required for reparenting (see #55448)
  getId() {
    const parent = this.getParent();
    return parent ? `${parent.getId()}/${this.getInternalId()}` : this.getInternalId();
  }
  getInternalId() {
    return this._label;
  }
  // skips intermediate single-child nodes
  getParent() {
    if (this._parent) {
      if (this._parent.isSkipped()) {
        return this._parent.getParent();
      }
      return this._parent;
    }
    return void 0;
  }
  isSkipped() {
    if (this._parent) {
      if (this._parent.oneChild()) {
        return true;
      }
      return false;
    }
    return true;
  }
  // skips intermediate single-child nodes
  hasChildren() {
    const child = this.oneChild();
    if (child) {
      return child.hasChildren();
    }
    return this._children.size > 0;
  }
  // skips intermediate single-child nodes
  getChildren() {
    const child = this.oneChild();
    if (child) {
      return child.getChildren();
    }
    const array = [];
    for (const child2 of this._children.values()) {
      array.push(child2);
    }
    return array.sort((a, b) => this.compare(a, b));
  }
  // skips intermediate single-child nodes
  getLabel(separateRootFolder = true) {
    const child = this.oneChild();
    if (child) {
      const sep = this instanceof RootFolderTreeItem && separateRootFolder ? " \u2022 " : posix.sep;
      return `${this._label}${sep}${child.getLabel()}`;
    }
    return this._label;
  }
  // skips intermediate single-child nodes
  getHoverLabel() {
    if (this._source && this._parent && this._parent._source) {
      return this._source.raw.path || this._source.raw.name;
    }
    const label = this.getLabel(false);
    const parent = this.getParent();
    if (parent) {
      const hover = parent.getHoverLabel();
      if (hover) {
        return `${hover}/${label}`;
      }
    }
    return label;
  }
  // skips intermediate single-child nodes
  getSource() {
    const child = this.oneChild();
    if (child) {
      return child.getSource();
    }
    return this._source;
  }
  compare(a, b) {
    if (a._label && b._label) {
      return a._label.localeCompare(b._label);
    }
    return 0;
  }
  oneChild() {
    if (!this._source && !this._showedMoreThanOne && this.skipOneChild()) {
      if (this._children.size === 1) {
        return this._children.values().next().value;
      }
      if (this._children.size > 1) {
        this._showedMoreThanOne = true;
      }
    }
    return void 0;
  }
  skipOneChild() {
    if (NEW_STYLE_COMPRESS) {
      return this instanceof RootTreeItem;
    } else {
      return !(this instanceof RootFolderTreeItem) && !(this instanceof SessionTreeItem);
    }
  }
}
class RootFolderTreeItem extends BaseTreeItem {
  constructor(parent, folder) {
    super(parent, folder.name, true);
    this.folder = folder;
  }
}
class RootTreeItem extends BaseTreeItem {
  constructor(_pathService, _contextService, _labelService) {
    super(void 0, "Root");
    this._pathService = _pathService;
    this._contextService = _contextService;
    this._labelService = _labelService;
  }
  add(session) {
    return this.createIfNeeded(session.getId(), () => new SessionTreeItem(this._labelService, this, session, this._pathService, this._contextService));
  }
  find(session) {
    return this.getChild(session.getId());
  }
}
const _SessionTreeItem = class _SessionTreeItem extends BaseTreeItem {
  constructor(labelService, parent, session, _pathService, rootProvider) {
    super(parent, session.getLabel(), true);
    this._pathService = _pathService;
    this.rootProvider = rootProvider;
    this._map = /* @__PURE__ */ new Map();
    this._labelService = labelService;
    this._session = session;
  }
  getInternalId() {
    return this._session.getId();
  }
  getSession() {
    return this._session;
  }
  getHoverLabel() {
    return void 0;
  }
  hasChildren() {
    return true;
  }
  compare(a, b) {
    const acat = this.category(a);
    const bcat = this.category(b);
    if (acat !== bcat) {
      return acat - bcat;
    }
    return super.compare(a, b);
  }
  category(item) {
    if (item instanceof RootFolderTreeItem) {
      return item.folder.index;
    }
    const l = item.getLabel();
    if (l && /^<.+>$/.test(l)) {
      return 1e3;
    }
    return 999;
  }
  async addPath(source) {
    let folder;
    let url;
    let path = source.raw.path;
    if (!path) {
      return;
    }
    if (this._labelService && URI_SCHEMA_PATTERN.test(path)) {
      path = this._labelService.getUriLabel(URI.parse(path));
    }
    const match = _SessionTreeItem.URL_REGEXP.exec(path);
    if (match && match.length === 3) {
      url = match[1];
      path = decodeURI(match[2]);
    } else {
      if (isAbsolute(path)) {
        const resource = URI.file(path);
        folder = this.rootProvider ? this.rootProvider.getWorkspaceFolder(resource) : null;
        if (folder) {
          path = normalize(ltrim(resource.path.substring(folder.uri.path.length), posix.sep));
          const hasMultipleRoots = this.rootProvider.getWorkspace().folders.length > 1;
          if (hasMultipleRoots) {
            path = posix.sep + path;
          } else {
            folder = null;
          }
        } else {
          path = normalize(path);
          if (isWindows) {
            path = normalizeDriveLetter(path);
          } else {
            path = tildify(path, (await this._pathService.userHome()).fsPath);
          }
        }
      }
    }
    let leaf = this;
    path.split(/[\/\\]/).forEach((segment, i) => {
      if (i === 0 && folder) {
        const f = folder;
        leaf = leaf.createIfNeeded(folder.name, (parent) => new RootFolderTreeItem(parent, f));
      } else if (i === 0 && url) {
        leaf = leaf.createIfNeeded(url, (parent) => new BaseTreeItem(parent, url));
      } else {
        leaf = leaf.createIfNeeded(segment, (parent) => new BaseTreeItem(parent, segment));
      }
    });
    leaf.setSource(this._session, source);
    if (source.raw.path) {
      this._map.set(source.raw.path, leaf);
    }
  }
  removePath(source) {
    if (source.raw.path) {
      const leaf = this._map.get(source.raw.path);
      if (leaf) {
        leaf.removeFromParent();
        return true;
      }
    }
    return false;
  }
};
_SessionTreeItem.URL_REGEXP = /^(https?:\/\/[^/]+)(\/.*)$/;
let SessionTreeItem = _SessionTreeItem;
function asTreeElement(item, viewState) {
  const children = item.getChildren();
  const collapsed = viewState ? !viewState.expanded.has(item.getId()) : !(item instanceof SessionTreeItem);
  return {
    element: item,
    collapsed,
    collapsible: item.hasChildren(),
    children: children.map((i) => asTreeElement(i, viewState))
  };
}
let LoadedScriptsView = class extends ViewPane {
  constructor(options, contextMenuService, keybindingService, instantiationService, viewDescriptorService, configurationService, editorService, contextKeyService, contextService, debugService, labelService, pathService, openerService, themeService, hoverService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.editorService = editorService;
    this.contextService = contextService;
    this.debugService = debugService;
    this.labelService = labelService;
    this.pathService = pathService;
    this.treeNeedsRefreshOnVisible = false;
    this.loadedScriptsItemType = CONTEXT_LOADED_SCRIPTS_ITEM_TYPE.bindTo(contextKeyService);
  }
  renderBody(container) {
    super.renderBody(container);
    this.element.classList.add("debug-pane");
    container.classList.add("debug-loaded-scripts", "show-file-icons");
    this.treeContainer = renderViewTree(container);
    this.filter = new LoadedScriptsFilter();
    const root = new RootTreeItem(this.pathService, this.contextService, this.labelService);
    this.treeLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
    this._register(this.treeLabels);
    const onFileIconThemeChange = (fileIconTheme) => {
      this.treeContainer.classList.toggle("align-icons-and-twisties", fileIconTheme.hasFileIcons && !fileIconTheme.hasFolderIcons);
      this.treeContainer.classList.toggle("hide-arrows", fileIconTheme.hidesExplorerArrows === true);
    };
    this._register(this.themeService.onDidFileIconThemeChange(onFileIconThemeChange));
    onFileIconThemeChange(this.themeService.getFileIconTheme());
    this.tree = this.instantiationService.createInstance(
      WorkbenchCompressibleObjectTree,
      "LoadedScriptsView",
      this.treeContainer,
      new LoadedScriptsDelegate(),
      [new LoadedScriptsRenderer(this.treeLabels)],
      {
        compressionEnabled: NEW_STYLE_COMPRESS,
        collapseByDefault: true,
        hideTwistiesOfChildlessElements: true,
        identityProvider: {
          getId: (element) => element.getId()
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (element) => {
            return element.getLabel();
          },
          getCompressedNodeKeyboardNavigationLabel: (elements) => {
            return elements.map((e) => e.getLabel()).join("/");
          }
        },
        filter: this.filter,
        accessibilityProvider: new LoadedSciptsAccessibilityProvider(),
        overrideStyles: this.getLocationBasedColors().listOverrideStyles
      }
    );
    const updateView = (viewState2) => this.tree.setChildren(null, asTreeElement(root, viewState2).children);
    updateView();
    this.changeScheduler = new RunOnceScheduler(() => {
      this.treeNeedsRefreshOnVisible = false;
      if (this.tree) {
        updateView();
      }
    }, 300);
    this._register(this.changeScheduler);
    this._register(this.tree.onDidOpen((e) => {
      if (e.element instanceof BaseTreeItem) {
        const source = e.element.getSource();
        if (source && source.available) {
          const nullRange = { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 };
          source.openInEditor(this.editorService, nullRange, e.editorOptions.preserveFocus, e.sideBySide, e.editorOptions.pinned);
        }
      }
    }));
    this._register(this.tree.onDidChangeFocus(() => {
      const focus = this.tree.getFocus();
      if (focus instanceof SessionTreeItem) {
        this.loadedScriptsItemType.set("session");
      } else {
        this.loadedScriptsItemType.reset();
      }
    }));
    const scheduleRefreshOnVisible = () => {
      if (this.isBodyVisible()) {
        this.changeScheduler.schedule();
      } else {
        this.treeNeedsRefreshOnVisible = true;
      }
    };
    const addSourcePathsToSession = async (session) => {
      if (session.capabilities.supportsLoadedSourcesRequest) {
        const sessionNode = root.add(session);
        const paths = await session.getLoadedSources();
        for (const path of paths) {
          await sessionNode.addPath(path);
        }
        scheduleRefreshOnVisible();
      }
    };
    const sessionListeners = this._register(new DisposableMap());
    const registerSessionListeners = (session) => {
      const store = new DisposableStore();
      sessionListeners.set(session.getId(), store);
      store.add(session.onDidChangeName(async () => {
        const sessionRoot = root.find(session);
        if (sessionRoot) {
          sessionRoot.updateLabel(session.getLabel());
          scheduleRefreshOnVisible();
        }
      }));
      store.add(session.onDidLoadedSource(async (event) => {
        let sessionRoot;
        switch (event.reason) {
          case "new":
          case "changed":
            sessionRoot = root.add(session);
            await sessionRoot.addPath(event.source);
            scheduleRefreshOnVisible();
            if (event.reason === "changed") {
              DebugContentProvider.refreshDebugContent(event.source.uri);
            }
            break;
          case "removed":
            sessionRoot = root.find(session);
            if (sessionRoot && sessionRoot.removePath(event.source)) {
              scheduleRefreshOnVisible();
            }
            break;
          default:
            this.filter.setFilter(event.source.name);
            this.tree.refilter();
            break;
        }
      }));
    };
    this._register(this.debugService.onDidNewSession(registerSessionListeners));
    this.debugService.getModel().getSessions().forEach(registerSessionListeners);
    this._register(this.debugService.onDidEndSession(({ session }) => {
      sessionListeners.deleteAndDispose(session.getId());
      root.remove(session.getId());
      this.changeScheduler.schedule();
    }));
    this.changeScheduler.schedule(0);
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible && this.treeNeedsRefreshOnVisible) {
        this.changeScheduler.schedule();
      }
    }));
    let viewState;
    this._register(this.tree.onDidChangeFindPattern((pattern) => {
      if (this.tree.findMode === TreeFindMode.Highlight) {
        return;
      }
      if (!viewState && pattern) {
        const expanded = /* @__PURE__ */ new Set();
        const visit = (node) => {
          if (node.element && !node.collapsed) {
            expanded.add(node.element.getId());
          }
          for (const child of node.children) {
            visit(child);
          }
        };
        visit(this.tree.getNode());
        viewState = { expanded };
        this.tree.expandAll();
      } else if (!pattern && viewState) {
        this.tree.setFocus([]);
        updateView(viewState);
        viewState = void 0;
      }
    }));
    this.debugService.getModel().getSessions().forEach((session) => addSourcePathsToSession(session));
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree.layout(height, width);
  }
  collapseAll() {
    this.tree.collapseAll();
  }
  dispose() {
    dispose(this.tree);
    dispose(this.treeLabels);
    super.dispose();
  }
};
LoadedScriptsView = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IViewDescriptorService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IDebugService),
  __decorateParam(10, ILabelService),
  __decorateParam(11, IPathService),
  __decorateParam(12, IOpenerService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IHoverService)
], LoadedScriptsView);
class LoadedScriptsDelegate {
  getHeight(element) {
    return 22;
  }
  getTemplateId(element) {
    return LoadedScriptsRenderer.ID;
  }
}
const _LoadedScriptsRenderer = class _LoadedScriptsRenderer {
  constructor(labels) {
    this.labels = labels;
  }
  get templateId() {
    return _LoadedScriptsRenderer.ID;
  }
  renderTemplate(container) {
    const label = this.labels.create(container, { supportHighlights: true });
    return { label };
  }
  renderElement(node, index, data) {
    const element = node.element;
    const label = element.getLabel();
    this.render(element, label, data, node.filterData);
  }
  renderCompressedElements(node, index, data) {
    const element = node.element.elements[node.element.elements.length - 1];
    const labels = node.element.elements.map((e) => e.getLabel());
    this.render(element, labels, data, node.filterData);
  }
  render(element, labels, data, filterData) {
    const label = {
      name: labels
    };
    const options = {
      title: element.getHoverLabel()
    };
    if (element instanceof RootFolderTreeItem) {
      options.fileKind = FileKind.ROOT_FOLDER;
    } else if (element instanceof SessionTreeItem) {
      options.title = nls.localize("loadedScriptsSession", "Debug Session");
      options.hideIcon = true;
    } else if (element instanceof BaseTreeItem) {
      const src = element.getSource();
      if (src && src.uri) {
        label.resource = src.uri;
        options.fileKind = FileKind.FILE;
      } else {
        options.fileKind = FileKind.FOLDER;
      }
    }
    options.matches = createMatches(filterData);
    data.label.setResource(label, options);
  }
  disposeTemplate(templateData) {
    templateData.label.dispose();
  }
};
_LoadedScriptsRenderer.ID = "lsrenderer";
let LoadedScriptsRenderer = _LoadedScriptsRenderer;
class LoadedSciptsAccessibilityProvider {
  getWidgetAriaLabel() {
    return nls.localize({ comment: ["Debug is a noun in this context, not a verb."], key: "loadedScriptsAriaLabel" }, "Debug Loaded Scripts");
  }
  getAriaLabel(element) {
    if (element instanceof RootFolderTreeItem) {
      return nls.localize("loadedScriptsRootFolderAriaLabel", "Workspace folder {0}, loaded script, debug", element.getLabel());
    }
    if (element instanceof SessionTreeItem) {
      return nls.localize("loadedScriptsSessionAriaLabel", "Session {0}, loaded script, debug", element.getLabel());
    }
    if (element.hasChildren()) {
      return nls.localize("loadedScriptsFolderAriaLabel", "Folder {0}, loaded script, debug", element.getLabel());
    } else {
      return nls.localize("loadedScriptsSourceAriaLabel", "{0}, loaded script, debug", element.getLabel());
    }
  }
}
class LoadedScriptsFilter {
  setFilter(filterText) {
    this.filterText = filterText;
  }
  filter(element, parentVisibility) {
    if (!this.filterText) {
      return TreeVisibility.Visible;
    }
    if (element.isLeaf()) {
      const name = element.getLabel();
      if (name.indexOf(this.filterText) >= 0) {
        return TreeVisibility.Visible;
      }
      return TreeVisibility.Hidden;
    }
    return TreeVisibility.Recurse;
  }
}
registerAction2(class Collapse extends ViewAction {
  constructor() {
    super({
      id: "loadedScripts.collapse",
      viewId: LOADED_SCRIPTS_VIEW_ID,
      title: nls.localize("collapse", "Collapse All"),
      f1: false,
      icon: Codicon.collapseAll,
      menu: {
        id: MenuId.ViewTitle,
        order: 30,
        group: "navigation",
        when: ContextKeyExpr.equals("view", LOADED_SCRIPTS_VIEW_ID)
      }
    });
  }
  runInView(_accessor, view) {
    view.collapseAll();
  }
});
export {
  LoadedScriptsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvbG9hZGVkU2NyaXB0c1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IFRyZWVGaW5kTW9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2Fic3RyYWN0VHJlZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb21wcmVzc2VkVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9jb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsLmpzJztcbmltcG9ydCB0eXBlIHsgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL29iamVjdFRyZWUuanMnO1xuaW1wb3J0IHsgSVRyZWVFbGVtZW50LCBJVHJlZUZpbHRlciwgSVRyZWVOb2RlLCBUcmVlRmlsdGVyUmVzdWx0LCBUcmVlVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNYXRjaGVzLCBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVEcml2ZUxldHRlciwgdGlsZGlmeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBkaXNwb3NlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNBYnNvbHV0ZSwgbm9ybWFsaXplLCBwb3NpeCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbHRyaW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hDb21wcmVzc2libGVPYmplY3RUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSUZpbGVJY29uVGhlbWUsIElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUxhYmVsLCBJUmVzb3VyY2VMYWJlbE9wdGlvbnMsIElSZXNvdXJjZUxhYmVsUHJvcHMsIFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgVmlld0FjdGlvbiwgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENPTlRFWFRfTE9BREVEX1NDUklQVFNfSVRFTV9UWVBFLCBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uLCBMT0FERURfU0NSSVBUU19WSUVXX0lEIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IERlYnVnQ29udGVudFByb3ZpZGVyIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnQ29udGVudFByb3ZpZGVyLmpzJztcbmltcG9ydCB7IFNvdXJjZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1NvdXJjZS5qcyc7XG5pbXBvcnQgeyByZW5kZXJWaWV3VHJlZSB9IGZyb20gJy4vYmFzZURlYnVnVmlldy5qcyc7XG5cbmNvbnN0IE5FV19TVFlMRV9DT01QUkVTUyA9IHRydWU7XG5cbi8vIFJGQyAyMzk2LCBBcHBlbmRpeCBBOiBodHRwczovL3d3dy5pZXRmLm9yZy9yZmMvcmZjMjM5Ni50eHRcbmNvbnN0IFVSSV9TQ0hFTUFfUEFUVEVSTiA9IC9eW2EtekEtWl1bYS16QS1aMC05XFwrXFwtXFwuXSs6LztcblxudHlwZSBMb2FkZWRTY3JpcHRzSXRlbSA9IEJhc2VUcmVlSXRlbTtcblxuY2xhc3MgQmFzZVRyZWVJdGVtIHtcblxuXHRwcml2YXRlIF9zaG93ZWRNb3JlVGhhbk9uZTogYm9vbGVhbjtcblx0cHJpdmF0ZSBfY2hpbGRyZW4gPSBuZXcgTWFwPHN0cmluZywgQmFzZVRyZWVJdGVtPigpO1xuXHRwcml2YXRlIF9zb3VyY2U6IFNvdXJjZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIF9wYXJlbnQ6IEJhc2VUcmVlSXRlbSB8IHVuZGVmaW5lZCwgcHJpdmF0ZSBfbGFiZWw6IHN0cmluZywgcHVibGljIHJlYWRvbmx5IGlzSW5jb21wcmVzc2libGUgPSBmYWxzZSkge1xuXHRcdHRoaXMuX3Nob3dlZE1vcmVUaGFuT25lID0gZmFsc2U7XG5cdH1cblxuXHR1cGRhdGVMYWJlbChsYWJlbDogc3RyaW5nKSB7XG5cdFx0dGhpcy5fbGFiZWwgPSBsYWJlbDtcblx0fVxuXG5cdGlzTGVhZigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hpbGRyZW4uc2l6ZSA9PT0gMDtcblx0fVxuXG5cdGdldFNlc3Npb24oKTogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX3BhcmVudCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3BhcmVudC5nZXRTZXNzaW9uKCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRzZXRTb3VyY2Uoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiwgc291cmNlOiBTb3VyY2UpOiB2b2lkIHtcblx0XHR0aGlzLl9zb3VyY2UgPSBzb3VyY2U7XG5cdFx0dGhpcy5fY2hpbGRyZW4uY2xlYXIoKTtcblx0XHRpZiAoc291cmNlLnJhdyAmJiBzb3VyY2UucmF3LnNvdXJjZXMpIHtcblx0XHRcdGZvciAoY29uc3Qgc3JjIG9mIHNvdXJjZS5yYXcuc291cmNlcykge1xuXHRcdFx0XHRpZiAoc3JjLm5hbWUgJiYgc3JjLnBhdGgpIHtcblx0XHRcdFx0XHRjb25zdCBzID0gbmV3IEJhc2VUcmVlSXRlbSh0aGlzLCBzcmMubmFtZSk7XG5cdFx0XHRcdFx0dGhpcy5fY2hpbGRyZW4uc2V0KHNyYy5wYXRoLCBzKTtcblx0XHRcdFx0XHRjb25zdCBzcyA9IHNlc3Npb24uZ2V0U291cmNlKHNyYyk7XG5cdFx0XHRcdFx0cy5zZXRTb3VyY2Uoc2Vzc2lvbiwgc3MpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y3JlYXRlSWZOZWVkZWQ8VCBleHRlbmRzIEJhc2VUcmVlSXRlbT4oa2V5OiBzdHJpbmcsIGZhY3Rvcnk6IChwYXJlbnQ6IEJhc2VUcmVlSXRlbSwgbGFiZWw6IHN0cmluZykgPT4gVCk6IFQge1xuXHRcdGxldCBjaGlsZCA9IDxUPnRoaXMuX2NoaWxkcmVuLmdldChrZXkpO1xuXHRcdGlmICghY2hpbGQpIHtcblx0XHRcdGNoaWxkID0gZmFjdG9yeSh0aGlzLCBrZXkpO1xuXHRcdFx0dGhpcy5fY2hpbGRyZW4uc2V0KGtleSwgY2hpbGQpO1xuXHRcdH1cblx0XHRyZXR1cm4gY2hpbGQ7XG5cdH1cblxuXHRnZXRDaGlsZChrZXk6IHN0cmluZyk6IEJhc2VUcmVlSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoaWxkcmVuLmdldChrZXkpO1xuXHR9XG5cblx0cmVtb3ZlKGtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hpbGRyZW4uZGVsZXRlKGtleSk7XG5cdH1cblxuXHRyZW1vdmVGcm9tUGFyZW50KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wYXJlbnQpIHtcblx0XHRcdHRoaXMuX3BhcmVudC5yZW1vdmUodGhpcy5fbGFiZWwpO1xuXHRcdFx0aWYgKHRoaXMuX3BhcmVudC5fY2hpbGRyZW4uc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9wYXJlbnQucmVtb3ZlRnJvbVBhcmVudCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ2lkJztcblx0fVxuXG5cdC8vIGEgZHluYW1pYyBJRCBiYXNlZCBvbiB0aGUgcGFyZW50IGNoYWluOyByZXF1aXJlZCBmb3IgcmVwYXJlbnRpbmcgKHNlZSAjNTU0NDgpXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcGFyZW50ID0gdGhpcy5nZXRQYXJlbnQoKTtcblx0XHRyZXR1cm4gcGFyZW50ID8gYCR7cGFyZW50LmdldElkKCl9LyR7dGhpcy5nZXRJbnRlcm5hbElkKCl9YCA6IHRoaXMuZ2V0SW50ZXJuYWxJZCgpO1xuXHR9XG5cblx0Z2V0SW50ZXJuYWxJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9sYWJlbDtcblx0fVxuXG5cdC8vIHNraXBzIGludGVybWVkaWF0ZSBzaW5nbGUtY2hpbGQgbm9kZXNcblx0Z2V0UGFyZW50KCk6IEJhc2VUcmVlSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX3BhcmVudCkge1xuXHRcdFx0aWYgKHRoaXMuX3BhcmVudC5pc1NraXBwZWQoKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcGFyZW50LmdldFBhcmVudCgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX3BhcmVudDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlzU2tpcHBlZCgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fcGFyZW50KSB7XG5cdFx0XHRpZiAodGhpcy5fcGFyZW50Lm9uZUNoaWxkKCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XHQvLyBza2lwcGVkIGlmIEknbSB0aGUgb25seSBjaGlsZCBvZiBteSBwYXJlbnRzXG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1x0Ly8gcm9vdHMgYXJlIG5ldmVyIHNraXBwZWRcblx0fVxuXG5cdC8vIHNraXBzIGludGVybWVkaWF0ZSBzaW5nbGUtY2hpbGQgbm9kZXNcblx0aGFzQ2hpbGRyZW4oKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY2hpbGQgPSB0aGlzLm9uZUNoaWxkKCk7XG5cdFx0aWYgKGNoaWxkKSB7XG5cdFx0XHRyZXR1cm4gY2hpbGQuaGFzQ2hpbGRyZW4oKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NoaWxkcmVuLnNpemUgPiAwO1xuXHR9XG5cblx0Ly8gc2tpcHMgaW50ZXJtZWRpYXRlIHNpbmdsZS1jaGlsZCBub2Rlc1xuXHRnZXRDaGlsZHJlbigpOiBCYXNlVHJlZUl0ZW1bXSB7XG5cdFx0Y29uc3QgY2hpbGQgPSB0aGlzLm9uZUNoaWxkKCk7XG5cdFx0aWYgKGNoaWxkKSB7XG5cdFx0XHRyZXR1cm4gY2hpbGQuZ2V0Q2hpbGRyZW4oKTtcblx0XHR9XG5cdFx0Y29uc3QgYXJyYXk6IEJhc2VUcmVlSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLl9jaGlsZHJlbi52YWx1ZXMoKSkge1xuXHRcdFx0YXJyYXkucHVzaChjaGlsZCk7XG5cdFx0fVxuXHRcdHJldHVybiBhcnJheS5zb3J0KChhLCBiKSA9PiB0aGlzLmNvbXBhcmUoYSwgYikpO1xuXHR9XG5cblx0Ly8gc2tpcHMgaW50ZXJtZWRpYXRlIHNpbmdsZS1jaGlsZCBub2Rlc1xuXHRnZXRMYWJlbChzZXBhcmF0ZVJvb3RGb2xkZXIgPSB0cnVlKTogc3RyaW5nIHtcblx0XHRjb25zdCBjaGlsZCA9IHRoaXMub25lQ2hpbGQoKTtcblx0XHRpZiAoY2hpbGQpIHtcblx0XHRcdGNvbnN0IHNlcCA9ICh0aGlzIGluc3RhbmNlb2YgUm9vdEZvbGRlclRyZWVJdGVtICYmIHNlcGFyYXRlUm9vdEZvbGRlcikgPyAnIFx1MjAyMiAnIDogcG9zaXguc2VwO1xuXHRcdFx0cmV0dXJuIGAke3RoaXMuX2xhYmVsfSR7c2VwfSR7Y2hpbGQuZ2V0TGFiZWwoKX1gO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbGFiZWw7XG5cdH1cblxuXHQvLyBza2lwcyBpbnRlcm1lZGlhdGUgc2luZ2xlLWNoaWxkIG5vZGVzXG5cdGdldEhvdmVyTGFiZWwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fc291cmNlICYmIHRoaXMuX3BhcmVudCAmJiB0aGlzLl9wYXJlbnQuX3NvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5yYXcucGF0aCB8fCB0aGlzLl9zb3VyY2UucmF3Lm5hbWU7XG5cdFx0fVxuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5nZXRMYWJlbChmYWxzZSk7XG5cdFx0Y29uc3QgcGFyZW50ID0gdGhpcy5nZXRQYXJlbnQoKTtcblx0XHRpZiAocGFyZW50KSB7XG5cdFx0XHRjb25zdCBob3ZlciA9IHBhcmVudC5nZXRIb3ZlckxhYmVsKCk7XG5cdFx0XHRpZiAoaG92ZXIpIHtcblx0XHRcdFx0cmV0dXJuIGAke2hvdmVyfS8ke2xhYmVsfWA7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBsYWJlbDtcblx0fVxuXG5cdC8vIHNraXBzIGludGVybWVkaWF0ZSBzaW5nbGUtY2hpbGQgbm9kZXNcblx0Z2V0U291cmNlKCk6IFNvdXJjZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2hpbGQgPSB0aGlzLm9uZUNoaWxkKCk7XG5cdFx0aWYgKGNoaWxkKSB7XG5cdFx0XHRyZXR1cm4gY2hpbGQuZ2V0U291cmNlKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zb3VyY2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY29tcGFyZShhOiBCYXNlVHJlZUl0ZW0sIGI6IEJhc2VUcmVlSXRlbSk6IG51bWJlciB7XG5cdFx0aWYgKGEuX2xhYmVsICYmIGIuX2xhYmVsKSB7XG5cdFx0XHRyZXR1cm4gYS5fbGFiZWwubG9jYWxlQ29tcGFyZShiLl9sYWJlbCk7XG5cdFx0fVxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBvbmVDaGlsZCgpOiBCYXNlVHJlZUl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fc291cmNlICYmICF0aGlzLl9zaG93ZWRNb3JlVGhhbk9uZSAmJiB0aGlzLnNraXBPbmVDaGlsZCgpKSB7XG5cdFx0XHRpZiAodGhpcy5fY2hpbGRyZW4uc2l6ZSA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fY2hpbGRyZW4udmFsdWVzKCkubmV4dCgpLnZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gaWYgYSBub2RlIGhhZCBtb3JlIHRoYW4gb25lIGNoaWxkIG9uY2UsIGl0IHdpbGwgbmV2ZXIgYmUgc2tpcHBlZCBhZ2FpblxuXHRcdFx0aWYgKHRoaXMuX2NoaWxkcmVuLnNpemUgPiAxKSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dlZE1vcmVUaGFuT25lID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgc2tpcE9uZUNoaWxkKCk6IGJvb2xlYW4ge1xuXHRcdGlmIChORVdfU1RZTEVfQ09NUFJFU1MpIHtcblx0XHRcdC8vIGlmIHRoZSByb290IG5vZGUgaGFzIG9ubHkgb25lIFNlc3Npb24sIGRvbid0IHNob3cgdGhlIHNlc3Npb25cblx0XHRcdHJldHVybiB0aGlzIGluc3RhbmNlb2YgUm9vdFRyZWVJdGVtO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gISh0aGlzIGluc3RhbmNlb2YgUm9vdEZvbGRlclRyZWVJdGVtKSAmJiAhKHRoaXMgaW5zdGFuY2VvZiBTZXNzaW9uVHJlZUl0ZW0pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBSb290Rm9sZGVyVHJlZUl0ZW0gZXh0ZW5kcyBCYXNlVHJlZUl0ZW0ge1xuXG5cdGNvbnN0cnVjdG9yKHBhcmVudDogQmFzZVRyZWVJdGVtLCBwdWJsaWMgZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0c3VwZXIocGFyZW50LCBmb2xkZXIubmFtZSwgdHJ1ZSk7XG5cdH1cbn1cblxuY2xhc3MgUm9vdFRyZWVJdGVtIGV4dGVuZHMgQmFzZVRyZWVJdGVtIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIF9wYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLCBwcml2YXRlIF9jb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBwcml2YXRlIF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsICdSb290Jyk7XG5cdH1cblxuXHRhZGQoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbik6IFNlc3Npb25UcmVlSXRlbSB7XG5cdFx0cmV0dXJuIHRoaXMuY3JlYXRlSWZOZWVkZWQoc2Vzc2lvbi5nZXRJZCgpLCAoKSA9PiBuZXcgU2Vzc2lvblRyZWVJdGVtKHRoaXMuX2xhYmVsU2VydmljZSwgdGhpcywgc2Vzc2lvbiwgdGhpcy5fcGF0aFNlcnZpY2UsIHRoaXMuX2NvbnRleHRTZXJ2aWNlKSk7XG5cdH1cblxuXHRmaW5kKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pOiBTZXNzaW9uVHJlZUl0ZW0ge1xuXHRcdHJldHVybiA8U2Vzc2lvblRyZWVJdGVtPnRoaXMuZ2V0Q2hpbGQoc2Vzc2lvbi5nZXRJZCgpKTtcblx0fVxufVxuXG5jbGFzcyBTZXNzaW9uVHJlZUl0ZW0gZXh0ZW5kcyBCYXNlVHJlZUl0ZW0ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFVSTF9SRUdFWFAgPSAvXihodHRwcz86XFwvXFwvW14vXSspKFxcLy4qKSQvO1xuXG5cdHByaXZhdGUgX3Nlc3Npb246IElEZWJ1Z1Nlc3Npb247XG5cdHByaXZhdGUgX21hcCA9IG5ldyBNYXA8c3RyaW5nLCBCYXNlVHJlZUl0ZW0+KCk7XG5cdHByaXZhdGUgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZTtcblxuXHRjb25zdHJ1Y3RvcihsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsIHBhcmVudDogQmFzZVRyZWVJdGVtLCBzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBwcml2YXRlIF9wYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLCBwcml2YXRlIHJvb3RQcm92aWRlcjogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKSB7XG5cdFx0c3VwZXIocGFyZW50LCBzZXNzaW9uLmdldExhYmVsKCksIHRydWUpO1xuXHRcdHRoaXMuX2xhYmVsU2VydmljZSA9IGxhYmVsU2VydmljZTtcblx0XHR0aGlzLl9zZXNzaW9uID0gc2Vzc2lvbjtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEludGVybmFsSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbi5nZXRJZCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbigpOiBJRGVidWdTZXNzaW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbjtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEhvdmVyTGFiZWwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgaGFzQ2hpbGRyZW4oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY29tcGFyZShhOiBCYXNlVHJlZUl0ZW0sIGI6IEJhc2VUcmVlSXRlbSk6IG51bWJlciB7XG5cdFx0Y29uc3QgYWNhdCA9IHRoaXMuY2F0ZWdvcnkoYSk7XG5cdFx0Y29uc3QgYmNhdCA9IHRoaXMuY2F0ZWdvcnkoYik7XG5cdFx0aWYgKGFjYXQgIT09IGJjYXQpIHtcblx0XHRcdHJldHVybiBhY2F0IC0gYmNhdDtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLmNvbXBhcmUoYSwgYik7XG5cdH1cblxuXHRwcml2YXRlIGNhdGVnb3J5KGl0ZW06IEJhc2VUcmVlSXRlbSk6IG51bWJlciB7XG5cblx0XHQvLyB3b3Jrc3BhY2Ugc2NyaXB0cyBjb21lIGF0IHRoZSBiZWdpbm5pbmcgaW4gXCJmb2xkZXJcIiBvcmRlclxuXHRcdGlmIChpdGVtIGluc3RhbmNlb2YgUm9vdEZvbGRlclRyZWVJdGVtKSB7XG5cdFx0XHRyZXR1cm4gaXRlbS5mb2xkZXIuaW5kZXg7XG5cdFx0fVxuXG5cdFx0Ly8gPC4uLj4gY29tZSBhdCB0aGUgdmVyeSBlbmRcblx0XHRjb25zdCBsID0gaXRlbS5nZXRMYWJlbCgpO1xuXHRcdGlmIChsICYmIC9ePC4rPiQvLnRlc3QobCkpIHtcblx0XHRcdHJldHVybiAxMDAwO1xuXHRcdH1cblxuXHRcdC8vIGV2ZXJ5dGhpbmcgZWxzZSBpbiBiZXR3ZWVuXG5cdFx0cmV0dXJuIDk5OTtcblx0fVxuXG5cdGFzeW5jIGFkZFBhdGgoc291cmNlOiBTb3VyY2UpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGxldCBmb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIgfCBudWxsO1xuXHRcdGxldCB1cmw6IHN0cmluZztcblxuXHRcdGxldCBwYXRoID0gc291cmNlLnJhdy5wYXRoO1xuXHRcdGlmICghcGF0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9sYWJlbFNlcnZpY2UgJiYgVVJJX1NDSEVNQV9QQVRURVJOLnRlc3QocGF0aCkpIHtcblx0XHRcdHBhdGggPSB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoVVJJLnBhcnNlKHBhdGgpKTtcblx0XHR9XG5cblx0XHRjb25zdCBtYXRjaCA9IFNlc3Npb25UcmVlSXRlbS5VUkxfUkVHRVhQLmV4ZWMocGF0aCk7XG5cdFx0aWYgKG1hdGNoICYmIG1hdGNoLmxlbmd0aCA9PT0gMykge1xuXHRcdFx0dXJsID0gbWF0Y2hbMV07XG5cdFx0XHRwYXRoID0gZGVjb2RlVVJJKG1hdGNoWzJdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGlzQWJzb2x1dGUocGF0aCkpIHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShwYXRoKTtcblxuXHRcdFx0XHQvLyByZXR1cm4gZWFybHkgaWYgd2UgY2FuIHJlc29sdmUgYSByZWxhdGl2ZSBwYXRoIGxhYmVsIGZyb20gdGhlIHJvb3QgZm9sZGVyXG5cdFx0XHRcdGZvbGRlciA9IHRoaXMucm9vdFByb3ZpZGVyID8gdGhpcy5yb290UHJvdmlkZXIuZ2V0V29ya3NwYWNlRm9sZGVyKHJlc291cmNlKSA6IG51bGw7XG5cdFx0XHRcdGlmIChmb2xkZXIpIHtcblx0XHRcdFx0XHQvLyBzdHJpcCBvZmYgdGhlIHJvb3QgZm9sZGVyIHBhdGhcblx0XHRcdFx0XHRwYXRoID0gbm9ybWFsaXplKGx0cmltKHJlc291cmNlLnBhdGguc3Vic3RyaW5nKGZvbGRlci51cmkucGF0aC5sZW5ndGgpLCBwb3NpeC5zZXApKTtcblx0XHRcdFx0XHRjb25zdCBoYXNNdWx0aXBsZVJvb3RzID0gdGhpcy5yb290UHJvdmlkZXIuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5sZW5ndGggPiAxO1xuXHRcdFx0XHRcdGlmIChoYXNNdWx0aXBsZVJvb3RzKSB7XG5cdFx0XHRcdFx0XHRwYXRoID0gcG9zaXguc2VwICsgcGF0aDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gZG9uJ3Qgc2hvdyByb290IGZvbGRlclxuXHRcdFx0XHRcdFx0Zm9sZGVyID0gbnVsbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gb24gdW5peCB0cnkgdG8gdGlsZGlmeSBhYnNvbHV0ZSBwYXRoc1xuXHRcdFx0XHRcdHBhdGggPSBub3JtYWxpemUocGF0aCk7XG5cdFx0XHRcdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0XHRcdFx0cGF0aCA9IG5vcm1hbGl6ZURyaXZlTGV0dGVyKHBhdGgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRwYXRoID0gdGlsZGlmeShwYXRoLCAoYXdhaXQgdGhpcy5fcGF0aFNlcnZpY2UudXNlckhvbWUoKSkuZnNQYXRoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgbGVhZjogQmFzZVRyZWVJdGVtID0gdGhpcztcblx0XHRwYXRoLnNwbGl0KC9bXFwvXFxcXF0vKS5mb3JFYWNoKChzZWdtZW50LCBpKSA9PiB7XG5cdFx0XHRpZiAoaSA9PT0gMCAmJiBmb2xkZXIpIHtcblx0XHRcdFx0Y29uc3QgZiA9IGZvbGRlcjtcblx0XHRcdFx0bGVhZiA9IGxlYWYuY3JlYXRlSWZOZWVkZWQoZm9sZGVyLm5hbWUsIHBhcmVudCA9PiBuZXcgUm9vdEZvbGRlclRyZWVJdGVtKHBhcmVudCwgZikpO1xuXHRcdFx0fSBlbHNlIGlmIChpID09PSAwICYmIHVybCkge1xuXHRcdFx0XHRsZWFmID0gbGVhZi5jcmVhdGVJZk5lZWRlZCh1cmwsIHBhcmVudCA9PiBuZXcgQmFzZVRyZWVJdGVtKHBhcmVudCwgdXJsKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZWFmID0gbGVhZi5jcmVhdGVJZk5lZWRlZChzZWdtZW50LCBwYXJlbnQgPT4gbmV3IEJhc2VUcmVlSXRlbShwYXJlbnQsIHNlZ21lbnQpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGxlYWYuc2V0U291cmNlKHRoaXMuX3Nlc3Npb24sIHNvdXJjZSk7XG5cdFx0aWYgKHNvdXJjZS5yYXcucGF0aCkge1xuXHRcdFx0dGhpcy5fbWFwLnNldChzb3VyY2UucmF3LnBhdGgsIGxlYWYpO1xuXHRcdH1cblx0fVxuXG5cdHJlbW92ZVBhdGgoc291cmNlOiBTb3VyY2UpOiBib29sZWFuIHtcblx0XHRpZiAoc291cmNlLnJhdy5wYXRoKSB7XG5cdFx0XHRjb25zdCBsZWFmID0gdGhpcy5fbWFwLmdldChzb3VyY2UucmF3LnBhdGgpO1xuXHRcdFx0aWYgKGxlYWYpIHtcblx0XHRcdFx0bGVhZi5yZW1vdmVGcm9tUGFyZW50KCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElWaWV3U3RhdGUge1xuXHRyZWFkb25seSBleHBhbmRlZDogU2V0PHN0cmluZz47XG59XG5cbi8qKlxuICogVGhpcyBtYXBzIGEgbW9kZWwgaXRlbSBpbnRvIGEgdmlldyBtb2RlbCBpdGVtLlxuICovXG5mdW5jdGlvbiBhc1RyZWVFbGVtZW50KGl0ZW06IEJhc2VUcmVlSXRlbSwgdmlld1N0YXRlPzogSVZpZXdTdGF0ZSk6IElUcmVlRWxlbWVudDxMb2FkZWRTY3JpcHRzSXRlbT4ge1xuXHRjb25zdCBjaGlsZHJlbiA9IGl0ZW0uZ2V0Q2hpbGRyZW4oKTtcblx0Y29uc3QgY29sbGFwc2VkID0gdmlld1N0YXRlID8gIXZpZXdTdGF0ZS5leHBhbmRlZC5oYXMoaXRlbS5nZXRJZCgpKSA6ICEoaXRlbSBpbnN0YW5jZW9mIFNlc3Npb25UcmVlSXRlbSk7XG5cblx0cmV0dXJuIHtcblx0XHRlbGVtZW50OiBpdGVtLFxuXHRcdGNvbGxhcHNlZCxcblx0XHRjb2xsYXBzaWJsZTogaXRlbS5oYXNDaGlsZHJlbigpLFxuXHRcdGNoaWxkcmVuOiBjaGlsZHJlbi5tYXAoaSA9PiBhc1RyZWVFbGVtZW50KGksIHZpZXdTdGF0ZSkpXG5cdH07XG59XG5cbmV4cG9ydCBjbGFzcyBMb2FkZWRTY3JpcHRzVmlldyBleHRlbmRzIFZpZXdQYW5lIHtcblxuXHRwcml2YXRlIHRyZWVDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBsb2FkZWRTY3JpcHRzSXRlbVR5cGU6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgdHJlZSE6IFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWU8TG9hZGVkU2NyaXB0c0l0ZW0sIEZ1enp5U2NvcmU+O1xuXHRwcml2YXRlIHRyZWVMYWJlbHMhOiBSZXNvdXJjZUxhYmVscztcblx0cHJpdmF0ZSBjaGFuZ2VTY2hlZHVsZXIhOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIHRyZWVOZWVkc1JlZnJlc2hPblZpc2libGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBmaWx0ZXIhOiBMb2FkZWRTY3JpcHRzRmlsdGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3bGV0Vmlld09wdGlvbnMsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHRcdHRoaXMubG9hZGVkU2NyaXB0c0l0ZW1UeXBlID0gQ09OVEVYVF9MT0FERURfU0NSSVBUU19JVEVNX1RZUEUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZGVidWctcGFuZScpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdkZWJ1Zy1sb2FkZWQtc2NyaXB0cycsICdzaG93LWZpbGUtaWNvbnMnKTtcblxuXHRcdHRoaXMudHJlZUNvbnRhaW5lciA9IHJlbmRlclZpZXdUcmVlKGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLmZpbHRlciA9IG5ldyBMb2FkZWRTY3JpcHRzRmlsdGVyKCk7XG5cblx0XHRjb25zdCByb290ID0gbmV3IFJvb3RUcmVlSXRlbSh0aGlzLnBhdGhTZXJ2aWNlLCB0aGlzLmNvbnRleHRTZXJ2aWNlLCB0aGlzLmxhYmVsU2VydmljZSk7XG5cblx0XHR0aGlzLnRyZWVMYWJlbHMgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCB7IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogdGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5IH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZUxhYmVscyk7XG5cblx0XHRjb25zdCBvbkZpbGVJY29uVGhlbWVDaGFuZ2UgPSAoZmlsZUljb25UaGVtZTogSUZpbGVJY29uVGhlbWUpID0+IHtcblx0XHRcdHRoaXMudHJlZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdhbGlnbi1pY29ucy1hbmQtdHdpc3RpZXMnLCBmaWxlSWNvblRoZW1lLmhhc0ZpbGVJY29ucyAmJiAhZmlsZUljb25UaGVtZS5oYXNGb2xkZXJJY29ucyk7XG5cdFx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZS1hcnJvd3MnLCBmaWxlSWNvblRoZW1lLmhpZGVzRXhwbG9yZXJBcnJvd3MgPT09IHRydWUpO1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZEZpbGVJY29uVGhlbWVDaGFuZ2Uob25GaWxlSWNvblRoZW1lQ2hhbmdlKSk7XG5cdFx0b25GaWxlSWNvblRoZW1lQ2hhbmdlKHRoaXMudGhlbWVTZXJ2aWNlLmdldEZpbGVJY29uVGhlbWUoKSk7XG5cblx0XHR0aGlzLnRyZWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWU8TG9hZGVkU2NyaXB0c0l0ZW0sIEZ1enp5U2NvcmU+LFxuXHRcdFx0J0xvYWRlZFNjcmlwdHNWaWV3Jyxcblx0XHRcdHRoaXMudHJlZUNvbnRhaW5lcixcblx0XHRcdG5ldyBMb2FkZWRTY3JpcHRzRGVsZWdhdGUoKSxcblx0XHRcdFtuZXcgTG9hZGVkU2NyaXB0c1JlbmRlcmVyKHRoaXMudHJlZUxhYmVscyldLFxuXHRcdFx0e1xuXHRcdFx0XHRjb21wcmVzc2lvbkVuYWJsZWQ6IE5FV19TVFlMRV9DT01QUkVTUyxcblx0XHRcdFx0Y29sbGFwc2VCeURlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdGhpZGVUd2lzdGllc09mQ2hpbGRsZXNzRWxlbWVudHM6IHRydWUsXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZDogKGVsZW1lbnQ6IExvYWRlZFNjcmlwdHNJdGVtKSA9PiBlbGVtZW50LmdldElkKClcblx0XHRcdFx0fSxcblx0XHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsOiAoZWxlbWVudDogTG9hZGVkU2NyaXB0c0l0ZW0pID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmdldExhYmVsKCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRDb21wcmVzc2VkTm9kZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsOiAoZWxlbWVudHM6IExvYWRlZFNjcmlwdHNJdGVtW10pID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50cy5tYXAoZSA9PiBlLmdldExhYmVsKCkpLmpvaW4oJy8nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZpbHRlcjogdGhpcy5maWx0ZXIsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IExvYWRlZFNjaXB0c0FjY2Vzc2liaWxpdHlQcm92aWRlcigpLFxuXHRcdFx0XHRvdmVycmlkZVN0eWxlczogdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCkubGlzdE92ZXJyaWRlU3R5bGVzXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IHVwZGF0ZVZpZXcgPSAodmlld1N0YXRlPzogSVZpZXdTdGF0ZSkgPT4gdGhpcy50cmVlLnNldENoaWxkcmVuKG51bGwsIGFzVHJlZUVsZW1lbnQocm9vdCwgdmlld1N0YXRlKS5jaGlsZHJlbik7XG5cblx0XHR1cGRhdGVWaWV3KCk7XG5cblx0XHR0aGlzLmNoYW5nZVNjaGVkdWxlciA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdHRoaXMudHJlZU5lZWRzUmVmcmVzaE9uVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0aWYgKHRoaXMudHJlZSkge1xuXHRcdFx0XHR1cGRhdGVWaWV3KCk7XG5cdFx0XHR9XG5cdFx0fSwgMzAwKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYW5nZVNjaGVkdWxlcik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRPcGVuKGUgPT4ge1xuXHRcdFx0aWYgKGUuZWxlbWVudCBpbnN0YW5jZW9mIEJhc2VUcmVlSXRlbSkge1xuXHRcdFx0XHRjb25zdCBzb3VyY2UgPSBlLmVsZW1lbnQuZ2V0U291cmNlKCk7XG5cdFx0XHRcdGlmIChzb3VyY2UgJiYgc291cmNlLmF2YWlsYWJsZSkge1xuXHRcdFx0XHRcdGNvbnN0IG51bGxSYW5nZSA9IHsgc3RhcnRMaW5lTnVtYmVyOiAwLCBzdGFydENvbHVtbjogMCwgZW5kTGluZU51bWJlcjogMCwgZW5kQ29sdW1uOiAwIH07XG5cdFx0XHRcdFx0c291cmNlLm9wZW5JbkVkaXRvcih0aGlzLmVkaXRvclNlcnZpY2UsIG51bGxSYW5nZSwgZS5lZGl0b3JPcHRpb25zLnByZXNlcnZlRm9jdXMsIGUuc2lkZUJ5U2lkZSwgZS5lZGl0b3JPcHRpb25zLnBpbm5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRDaGFuZ2VGb2N1cygoKSA9PiB7XG5cdFx0XHRjb25zdCBmb2N1cyA9IHRoaXMudHJlZS5nZXRGb2N1cygpO1xuXHRcdFx0aWYgKGZvY3VzIGluc3RhbmNlb2YgU2Vzc2lvblRyZWVJdGVtKSB7XG5cdFx0XHRcdHRoaXMubG9hZGVkU2NyaXB0c0l0ZW1UeXBlLnNldCgnc2Vzc2lvbicpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2FkZWRTY3JpcHRzSXRlbVR5cGUucmVzZXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzY2hlZHVsZVJlZnJlc2hPblZpc2libGUgPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc0JvZHlWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy5jaGFuZ2VTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudHJlZU5lZWRzUmVmcmVzaE9uVmlzaWJsZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGFkZFNvdXJjZVBhdGhzVG9TZXNzaW9uID0gYXN5bmMgKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pID0+IHtcblx0XHRcdGlmIChzZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0xvYWRlZFNvdXJjZXNSZXF1ZXN0KSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25Ob2RlID0gcm9vdC5hZGQoc2Vzc2lvbik7XG5cdFx0XHRcdGNvbnN0IHBhdGhzID0gYXdhaXQgc2Vzc2lvbi5nZXRMb2FkZWRTb3VyY2VzKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiBwYXRocykge1xuXHRcdFx0XHRcdGF3YWl0IHNlc3Npb25Ob2RlLmFkZFBhdGgocGF0aCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2NoZWR1bGVSZWZyZXNoT25WaXNpYmxlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIFRyYWNrIGxpc3RlbmVycyBwZXIgc2Vzc2lvbiB0byBhdm9pZCBsZWFraW5nIGRpc3Bvc2FibGVzXG5cdFx0Y29uc3Qgc2Vzc2lvbkxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgRGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHRcdGNvbnN0IHJlZ2lzdGVyU2Vzc2lvbkxpc3RlbmVycyA9IChzZXNzaW9uOiBJRGVidWdTZXNzaW9uKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHNlc3Npb25MaXN0ZW5lcnMuc2V0KHNlc3Npb24uZ2V0SWQoKSwgc3RvcmUpO1xuXG5cdFx0XHRzdG9yZS5hZGQoc2Vzc2lvbi5vbkRpZENoYW5nZU5hbWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uUm9vdCA9IHJvb3QuZmluZChzZXNzaW9uKTtcblx0XHRcdFx0aWYgKHNlc3Npb25Sb290KSB7XG5cdFx0XHRcdFx0c2Vzc2lvblJvb3QudXBkYXRlTGFiZWwoc2Vzc2lvbi5nZXRMYWJlbCgpKTtcblx0XHRcdFx0XHRzY2hlZHVsZVJlZnJlc2hPblZpc2libGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKHNlc3Npb24ub25EaWRMb2FkZWRTb3VyY2UoYXN5bmMgZXZlbnQgPT4ge1xuXHRcdFx0XHRsZXQgc2Vzc2lvblJvb3Q6IFNlc3Npb25UcmVlSXRlbTtcblx0XHRcdFx0c3dpdGNoIChldmVudC5yZWFzb24pIHtcblx0XHRcdFx0XHRjYXNlICduZXcnOlxuXHRcdFx0XHRcdGNhc2UgJ2NoYW5nZWQnOlxuXHRcdFx0XHRcdFx0c2Vzc2lvblJvb3QgPSByb290LmFkZChzZXNzaW9uKTtcblx0XHRcdFx0XHRcdGF3YWl0IHNlc3Npb25Sb290LmFkZFBhdGgoZXZlbnQuc291cmNlKTtcblx0XHRcdFx0XHRcdHNjaGVkdWxlUmVmcmVzaE9uVmlzaWJsZSgpO1xuXHRcdFx0XHRcdFx0aWYgKGV2ZW50LnJlYXNvbiA9PT0gJ2NoYW5nZWQnKSB7XG5cdFx0XHRcdFx0XHRcdERlYnVnQ29udGVudFByb3ZpZGVyLnJlZnJlc2hEZWJ1Z0NvbnRlbnQoZXZlbnQuc291cmNlLnVyaSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdyZW1vdmVkJzpcblx0XHRcdFx0XHRcdHNlc3Npb25Sb290ID0gcm9vdC5maW5kKHNlc3Npb24pO1xuXHRcdFx0XHRcdFx0aWYgKHNlc3Npb25Sb290ICYmIHNlc3Npb25Sb290LnJlbW92ZVBhdGgoZXZlbnQuc291cmNlKSkge1xuXHRcdFx0XHRcdFx0XHRzY2hlZHVsZVJlZnJlc2hPblZpc2libGUoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHR0aGlzLmZpbHRlci5zZXRGaWx0ZXIoZXZlbnQuc291cmNlLm5hbWUpO1xuXHRcdFx0XHRcdFx0dGhpcy50cmVlLnJlZmlsdGVyKCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5vbkRpZE5ld1Nlc3Npb24ocmVnaXN0ZXJTZXNzaW9uTGlzdGVuZXJzKSk7XG5cdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucygpLmZvckVhY2gocmVnaXN0ZXJTZXNzaW9uTGlzdGVuZXJzKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLm9uRGlkRW5kU2Vzc2lvbigoeyBzZXNzaW9uIH0pID0+IHtcblx0XHRcdHNlc3Npb25MaXN0ZW5lcnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uLmdldElkKCkpO1xuXHRcdFx0cm9vdC5yZW1vdmUoc2Vzc2lvbi5nZXRJZCgpKTtcblx0XHRcdHRoaXMuY2hhbmdlU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5jaGFuZ2VTY2hlZHVsZXIuc2NoZWR1bGUoMCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkodmlzaWJsZSA9PiB7XG5cdFx0XHRpZiAodmlzaWJsZSAmJiB0aGlzLnRyZWVOZWVkc1JlZnJlc2hPblZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5jaGFuZ2VTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBmZWF0dXJlOiBleHBhbmQgYWxsIG5vZGVzIHdoZW4gZmlsdGVyaW5nIChub3Qgd2hlbiBmaW5kaW5nKVxuXHRcdGxldCB2aWV3U3RhdGU6IElWaWV3U3RhdGUgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkQ2hhbmdlRmluZFBhdHRlcm4ocGF0dGVybiA9PiB7XG5cdFx0XHRpZiAodGhpcy50cmVlLmZpbmRNb2RlID09PSBUcmVlRmluZE1vZGUuSGlnaGxpZ2h0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF2aWV3U3RhdGUgJiYgcGF0dGVybikge1xuXHRcdFx0XHRjb25zdCBleHBhbmRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0XHRjb25zdCB2aXNpdCA9IChub2RlOiBJVHJlZU5vZGU8QmFzZVRyZWVJdGVtIHwgbnVsbCwgRnV6enlTY29yZT4pID0+IHtcblx0XHRcdFx0XHRpZiAobm9kZS5lbGVtZW50ICYmICFub2RlLmNvbGxhcHNlZCkge1xuXHRcdFx0XHRcdFx0ZXhwYW5kZWQuYWRkKG5vZGUuZWxlbWVudC5nZXRJZCgpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdHZpc2l0KGNoaWxkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0dmlzaXQodGhpcy50cmVlLmdldE5vZGUoKSk7XG5cdFx0XHRcdHZpZXdTdGF0ZSA9IHsgZXhwYW5kZWQgfTtcblx0XHRcdFx0dGhpcy50cmVlLmV4cGFuZEFsbCgpO1xuXHRcdFx0fSBlbHNlIGlmICghcGF0dGVybiAmJiB2aWV3U3RhdGUpIHtcblx0XHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtdKTtcblx0XHRcdFx0dXBkYXRlVmlldyh2aWV3U3RhdGUpO1xuXHRcdFx0XHR2aWV3U3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gcG9wdWxhdGUgdHJlZSBtb2RlbCB3aXRoIHNvdXJjZSBwYXRocyBmcm9tIGFsbCBkZWJ1ZyBzZXNzaW9uc1xuXHRcdHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbnMoKS5mb3JFYWNoKHNlc3Npb24gPT4gYWRkU291cmNlUGF0aHNUb1Nlc3Npb24oc2Vzc2lvbikpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMudHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRjb2xsYXBzZUFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuY29sbGFwc2VBbGwoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLnRyZWUpO1xuXHRcdGRpc3Bvc2UodGhpcy50cmVlTGFiZWxzKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgTG9hZGVkU2NyaXB0c0RlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8TG9hZGVkU2NyaXB0c0l0ZW0+IHtcblxuXHRnZXRIZWlnaHQoZWxlbWVudDogTG9hZGVkU2NyaXB0c0l0ZW0pOiBudW1iZXIge1xuXHRcdHJldHVybiAyMjtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogTG9hZGVkU2NyaXB0c0l0ZW0pOiBzdHJpbmcge1xuXHRcdHJldHVybiBMb2FkZWRTY3JpcHRzUmVuZGVyZXIuSUQ7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElMb2FkZWRTY3JpcHRzSXRlbVRlbXBsYXRlRGF0YSB7XG5cdGxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcbn1cblxuY2xhc3MgTG9hZGVkU2NyaXB0c1JlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxCYXNlVHJlZUl0ZW0sIEZ1enp5U2NvcmUsIElMb2FkZWRTY3JpcHRzSXRlbVRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdsc3JlbmRlcmVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGxhYmVsczogUmVzb3VyY2VMYWJlbHNcblx0KSB7XG5cdH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBMb2FkZWRTY3JpcHRzUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUxvYWRlZFNjcmlwdHNJdGVtVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBsYWJlbCA9IHRoaXMubGFiZWxzLmNyZWF0ZShjb250YWluZXIsIHsgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUgfSk7XG5cdFx0cmV0dXJuIHsgbGFiZWwgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPEJhc2VUcmVlSXRlbSwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIGRhdGE6IElMb2FkZWRTY3JpcHRzSXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXG5cdFx0Y29uc3QgZWxlbWVudCA9IG5vZGUuZWxlbWVudDtcblx0XHRjb25zdCBsYWJlbCA9IGVsZW1lbnQuZ2V0TGFiZWwoKTtcblxuXHRcdHRoaXMucmVuZGVyKGVsZW1lbnQsIGxhYmVsLCBkYXRhLCBub2RlLmZpbHRlckRhdGEpO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPEJhc2VUcmVlSXRlbT4sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCBkYXRhOiBJTG9hZGVkU2NyaXB0c0l0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblxuXHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQuZWxlbWVudHNbbm9kZS5lbGVtZW50LmVsZW1lbnRzLmxlbmd0aCAtIDFdO1xuXHRcdGNvbnN0IGxhYmVscyA9IG5vZGUuZWxlbWVudC5lbGVtZW50cy5tYXAoZSA9PiBlLmdldExhYmVsKCkpO1xuXG5cdFx0dGhpcy5yZW5kZXIoZWxlbWVudCwgbGFiZWxzLCBkYXRhLCBub2RlLmZpbHRlckRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIoZWxlbWVudDogQmFzZVRyZWVJdGVtLCBsYWJlbHM6IHN0cmluZyB8IHN0cmluZ1tdLCBkYXRhOiBJTG9hZGVkU2NyaXB0c0l0ZW1UZW1wbGF0ZURhdGEsIGZpbHRlckRhdGE6IEZ1enp5U2NvcmUgfCB1bmRlZmluZWQpIHtcblxuXHRcdGNvbnN0IGxhYmVsOiBJUmVzb3VyY2VMYWJlbFByb3BzID0ge1xuXHRcdFx0bmFtZTogbGFiZWxzXG5cdFx0fTtcblx0XHRjb25zdCBvcHRpb25zOiBJUmVzb3VyY2VMYWJlbE9wdGlvbnMgPSB7XG5cdFx0XHR0aXRsZTogZWxlbWVudC5nZXRIb3ZlckxhYmVsKClcblx0XHR9O1xuXG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBSb290Rm9sZGVyVHJlZUl0ZW0pIHtcblxuXHRcdFx0b3B0aW9ucy5maWxlS2luZCA9IEZpbGVLaW5kLlJPT1RfRk9MREVSO1xuXG5cdFx0fSBlbHNlIGlmIChlbGVtZW50IGluc3RhbmNlb2YgU2Vzc2lvblRyZWVJdGVtKSB7XG5cblx0XHRcdG9wdGlvbnMudGl0bGUgPSBubHMubG9jYWxpemUoJ2xvYWRlZFNjcmlwdHNTZXNzaW9uJywgXCJEZWJ1ZyBTZXNzaW9uXCIpO1xuXHRcdFx0b3B0aW9ucy5oaWRlSWNvbiA9IHRydWU7XG5cblx0XHR9IGVsc2UgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBCYXNlVHJlZUl0ZW0pIHtcblxuXHRcdFx0Y29uc3Qgc3JjID0gZWxlbWVudC5nZXRTb3VyY2UoKTtcblx0XHRcdGlmIChzcmMgJiYgc3JjLnVyaSkge1xuXHRcdFx0XHRsYWJlbC5yZXNvdXJjZSA9IHNyYy51cmk7XG5cdFx0XHRcdG9wdGlvbnMuZmlsZUtpbmQgPSBGaWxlS2luZC5GSUxFO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3B0aW9ucy5maWxlS2luZCA9IEZpbGVLaW5kLkZPTERFUjtcblx0XHRcdH1cblx0XHR9XG5cdFx0b3B0aW9ucy5tYXRjaGVzID0gY3JlYXRlTWF0Y2hlcyhmaWx0ZXJEYXRhKTtcblxuXHRcdGRhdGEubGFiZWwuc2V0UmVzb3VyY2UobGFiZWwsIG9wdGlvbnMpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUxvYWRlZFNjcmlwdHNJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBMb2FkZWRTY2lwdHNBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxMb2FkZWRTY3JpcHRzSXRlbT4ge1xuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoeyBjb21tZW50OiBbJ0RlYnVnIGlzIGEgbm91biBpbiB0aGlzIGNvbnRleHQsIG5vdCBhIHZlcmIuJ10sIGtleTogJ2xvYWRlZFNjcmlwdHNBcmlhTGFiZWwnIH0sIFwiRGVidWcgTG9hZGVkIFNjcmlwdHNcIik7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogTG9hZGVkU2NyaXB0c0l0ZW0pOiBzdHJpbmcge1xuXG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBSb290Rm9sZGVyVHJlZUl0ZW0pIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2xvYWRlZFNjcmlwdHNSb290Rm9sZGVyQXJpYUxhYmVsJywgXCJXb3Jrc3BhY2UgZm9sZGVyIHswfSwgbG9hZGVkIHNjcmlwdCwgZGVidWdcIiwgZWxlbWVudC5nZXRMYWJlbCgpKTtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFNlc3Npb25UcmVlSXRlbSkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnbG9hZGVkU2NyaXB0c1Nlc3Npb25BcmlhTGFiZWwnLCBcIlNlc3Npb24gezB9LCBsb2FkZWQgc2NyaXB0LCBkZWJ1Z1wiLCBlbGVtZW50LmdldExhYmVsKCkpO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50Lmhhc0NoaWxkcmVuKCkpIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2xvYWRlZFNjcmlwdHNGb2xkZXJBcmlhTGFiZWwnLCBcIkZvbGRlciB7MH0sIGxvYWRlZCBzY3JpcHQsIGRlYnVnXCIsIGVsZW1lbnQuZ2V0TGFiZWwoKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2xvYWRlZFNjcmlwdHNTb3VyY2VBcmlhTGFiZWwnLCBcInswfSwgbG9hZGVkIHNjcmlwdCwgZGVidWdcIiwgZWxlbWVudC5nZXRMYWJlbCgpKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgTG9hZGVkU2NyaXB0c0ZpbHRlciBpbXBsZW1lbnRzIElUcmVlRmlsdGVyPEJhc2VUcmVlSXRlbSwgRnV6enlTY29yZT4ge1xuXG5cdHByaXZhdGUgZmlsdGVyVGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHNldEZpbHRlcihmaWx0ZXJUZXh0OiBzdHJpbmcpIHtcblx0XHR0aGlzLmZpbHRlclRleHQgPSBmaWx0ZXJUZXh0O1xuXHR9XG5cblx0ZmlsdGVyKGVsZW1lbnQ6IEJhc2VUcmVlSXRlbSwgcGFyZW50VmlzaWJpbGl0eTogVHJlZVZpc2liaWxpdHkpOiBUcmVlRmlsdGVyUmVzdWx0PEZ1enp5U2NvcmU+IHtcblxuXHRcdGlmICghdGhpcy5maWx0ZXJUZXh0KSB7XG5cdFx0XHRyZXR1cm4gVHJlZVZpc2liaWxpdHkuVmlzaWJsZTtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudC5pc0xlYWYoKSkge1xuXHRcdFx0Y29uc3QgbmFtZSA9IGVsZW1lbnQuZ2V0TGFiZWwoKTtcblx0XHRcdGlmIChuYW1lLmluZGV4T2YodGhpcy5maWx0ZXJUZXh0KSA+PSAwKSB7XG5cdFx0XHRcdHJldHVybiBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFRyZWVWaXNpYmlsaXR5LkhpZGRlbjtcblx0XHR9XG5cdFx0cmV0dXJuIFRyZWVWaXNpYmlsaXR5LlJlY3Vyc2U7XG5cdH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDb2xsYXBzZSBleHRlbmRzIFZpZXdBY3Rpb248TG9hZGVkU2NyaXB0c1ZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdsb2FkZWRTY3JpcHRzLmNvbGxhcHNlJyxcblx0XHRcdHZpZXdJZDogTE9BREVEX1NDUklQVFNfVklFV19JRCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NvbGxhcHNlJywgXCJDb2xsYXBzZSBBbGxcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRpY29uOiBDb2RpY29uLmNvbGxhcHNlQWxsLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0b3JkZXI6IDMwLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBMT0FERURfU0NSSVBUU19WSUVXX0lEKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuSW5WaWV3KF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogTG9hZGVkU2NyaXB0c1ZpZXcpIHtcblx0XHR2aWV3LmNvbGxhcHNlQWxsKCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFPQSxTQUFTLG9CQUFvQjtBQUc3QixTQUFpRSxzQkFBc0I7QUFDdkYsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMscUJBQWlDO0FBQzFDLFNBQVMsc0JBQXNCLGVBQWU7QUFDOUMsU0FBUyxTQUFTLGVBQWUsdUJBQXVCO0FBQ3hELFNBQVMsWUFBWSxXQUFXLGFBQWE7QUFDN0MsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVztBQUNwQixZQUFZLFNBQVM7QUFDckIsU0FBUyxRQUFRLHVCQUF1QjtBQUN4QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUE2QiwwQkFBMEI7QUFDaEUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBeUIscUJBQXFCO0FBQzlDLFNBQVMsZ0NBQWtEO0FBQzNELFNBQXFFLHNCQUFzQjtBQUMzRixTQUFTLFlBQVksZ0JBQWdCO0FBRXJDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsa0NBQWtDLGVBQThCLDhCQUE4QjtBQUN2RyxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLHNCQUFzQjtBQUUvQixNQUFNLHFC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
