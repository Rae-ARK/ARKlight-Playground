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
import "./outlinePane.css";
import * as dom from "../../../../base/browser/dom.js";
import { ProgressBar } from "../../../../base/browser/ui/progressbar/progressbar.js";
import { TimeoutTimer, timeout } from "../../../../base/common/async.js";
import { toDisposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { LRUCache } from "../../../../base/common/map.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { WorkbenchDataTree } from "../../../../platform/list/browser/listService.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { basename } from "../../../../base/common/resources.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { OutlineViewState } from "./outlineViewState.js";
import { IOutlineService, OutlineTarget } from "../../../services/outline/browser/outline.js";
import { EditorResourceAccessor } from "../../../common/editor.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Event } from "../../../../base/common/event.js";
import { AbstractTreeViewState, TreeFindMode } from "../../../../base/browser/ui/tree/abstractTree.js";
import { ctxAllCollapsed, ctxFilterOnType, ctxFocused, ctxFollowsCursor, ctxSortMode, OutlineSortOrder } from "./outline.js";
import { defaultProgressBarStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
class OutlineTreeSorter {
  constructor(_comparator, order) {
    this._comparator = _comparator;
    this.order = order;
  }
  compare(a, b) {
    if (this.order === OutlineSortOrder.ByKind) {
      return this._comparator.compareByType(a, b);
    } else if (this.order === OutlineSortOrder.ByName) {
      return this._comparator.compareByName(a, b);
    } else {
      return this._comparator.compareByPosition(a, b);
    }
  }
}
let OutlinePane = class extends ViewPane {
  constructor(options, _outlineService, _instantiationService, viewDescriptorService, _storageService, _editorService, configurationService, keybindingService, contextKeyService, contextMenuService, openerService, themeService, hoverService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, _instantiationService, openerService, themeService, hoverService);
    this._outlineService = _outlineService;
    this._instantiationService = _instantiationService;
    this._storageService = _storageService;
    this._editorService = _editorService;
    this._disposables = new DisposableStore();
    this._editorControlDisposables = new DisposableStore();
    this._editorPaneDisposables = new DisposableStore();
    this._outlineViewState = new OutlineViewState();
    this._editorListener = new MutableDisposable();
    this._treeStates = new LRUCache(10);
    this._editorControlChangePromise = Promise.resolve();
    this._outlineViewState.restore(this._storageService);
    this._disposables.add(this._outlineViewState);
    contextKeyService.bufferChangeEvents(() => {
      this._ctxFollowsCursor = ctxFollowsCursor.bindTo(contextKeyService);
      this._ctxFilterOnType = ctxFilterOnType.bindTo(contextKeyService);
      this._ctxSortMode = ctxSortMode.bindTo(contextKeyService);
      this._ctxAllCollapsed = ctxAllCollapsed.bindTo(contextKeyService);
    });
    const updateContext = () => {
      this._ctxFollowsCursor.set(this._outlineViewState.followCursor);
      this._ctxFilterOnType.set(this._outlineViewState.filterOnType);
      this._ctxSortMode.set(this._outlineViewState.sortBy);
    };
    updateContext();
    this._disposables.add(this._outlineViewState.onDidChange(updateContext));
  }
  dispose() {
    this._disposables.dispose();
    this._editorPaneDisposables.dispose();
    this._editorControlDisposables.dispose();
    this._editorListener.dispose();
    super.dispose();
  }
  focus() {
    this._editorControlChangePromise.then(() => {
      super.focus();
      this._tree?.domFocus();
    });
  }
  renderBody(container) {
    super.renderBody(container);
    this._domNode = container;
    container.classList.add("outline-pane");
    const progressContainer = dom.$(".outline-progress");
    this._message = dom.$(".outline-message");
    this._progressBar = new ProgressBar(progressContainer, defaultProgressBarStyles);
    this._treeContainer = dom.$(".outline-tree");
    dom.append(container, progressContainer, this._message, this._treeContainer);
    this._disposables.add(this.onDidChangeBodyVisibility((visible) => {
      if (!visible) {
        this._editorListener.clear();
        this._editorPaneDisposables.clear();
        this._editorControlDisposables.clear();
      } else if (!this._editorListener.value) {
        const event = Event.any(this._editorService.onDidActiveEditorChange, this._outlineService.onDidChange);
        this._editorListener.value = event(() => this._handleEditorChanged(this._editorService.activeEditorPane));
        this._handleEditorChanged(this._editorService.activeEditorPane);
      }
    }));
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this._tree?.layout(height, width);
    this._treeDimensions = new dom.Dimension(width, height);
  }
  collapseAll() {
    this._tree?.collapseAll();
  }
  expandAll() {
    this._tree?.expandAll();
  }
  get outlineViewState() {
    return this._outlineViewState;
  }
  _showMessage(message) {
    this._domNode.classList.add("message");
    this._progressBar.stop().hide();
    this._message.textContent = message;
  }
  _captureViewState(uri) {
    if (this._tree) {
      const oldOutline = this._tree.getInput();
      if (!uri) {
        uri = oldOutline?.uri;
      }
      if (oldOutline && uri) {
        this._treeStates.set(`${oldOutline.outlineKind}/${uri}`, this._tree.getViewState());
        return true;
      }
    }
    return false;
  }
  _handleEditorChanged(pane) {
    this._editorPaneDisposables.clear();
    if (pane) {
      this._editorPaneDisposables.add(pane.onDidChangeControl(() => {
        this._editorControlChangePromise = this._handleEditorControlChanged(pane);
      }));
    }
    this._editorControlChangePromise = this._handleEditorControlChanged(pane);
  }
  async _handleEditorControlChanged(pane) {
    const resource = EditorResourceAccessor.getOriginalUri(pane?.input);
    const didCapture = this._captureViewState();
    this._editorControlDisposables.clear();
    if (!pane || !this._outlineService.canCreateOutline(pane) || !resource) {
      return this._showMessage(localize("no-editor", "The active editor cannot provide outline information."));
    }
    let loadingMessage;
    if (!didCapture) {
      loadingMessage = new TimeoutTimer(() => {
        this._showMessage(localize("loading", "Loading document symbols for '{0}'...", basename(resource)));
      }, 100);
    }
    this._progressBar.infinite().show(500);
    const cts = new CancellationTokenSource();
    this._editorControlDisposables.add(toDisposable(() => cts.dispose(true)));
    const newOutline = await this._outlineService.createOutline(pane, OutlineTarget.OutlinePane, cts.token);
    loadingMessage?.dispose();
    if (!newOutline) {
      return;
    }
    if (cts.token.isCancellationRequested) {
      newOutline?.dispose();
      return;
    }
    this._editorControlDisposables.add(newOutline);
    this._progressBar.stop().hide();
    const sorter = new OutlineTreeSorter(newOutline.config.comparator, this._outlineViewState.sortBy);
    const tree = this._instantiationService.createInstance(
      WorkbenchDataTree,
      "OutlinePane",
      this._treeContainer,
      newOutline.config.delegate,
      newOutline.config.renderers,
      newOutline.config.treeDataSource,
      {
        ...newOutline.config.options,
        sorter,
        expandOnDoubleClick: false,
        expandOnlyOnTwistieClick: true,
        multipleSelectionSupport: false,
        hideTwistiesOfChildlessElements: true,
        defaultFindMode: this._outlineViewState.filterOnType ? TreeFindMode.Filter : TreeFindMode.Highlight,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles
      }
    );
    ctxFocused.bindTo(tree.contextKeyService);
    const updateTree = () => {
      if (newOutline.isEmpty) {
        this._showMessage(localize("no-symbols", "No symbols found in document '{0}'", basename(resource)));
        this._captureViewState(resource);
        tree.setInput(void 0);
      } else if (!tree.getInput()) {
        this._domNode.classList.remove("message");
        const state = this._treeStates.get(`${newOutline.outlineKind}/${newOutline.uri}`);
        tree.setInput(newOutline, state && AbstractTreeViewState.lift(state));
      } else {
        this._domNode.classList.remove("message");
        tree.updateChildren();
      }
    };
    updateTree();
    this._editorControlDisposables.add(newOutline.onDidChange(updateTree));
    this._editorControlDisposables.add(this.viewDescriptorService.onDidChangeLocation(({ views }) => {
      if (views.some((v) => v.id === this.id)) {
        tree.updateOptions({ overrideStyles: this.getLocationBasedColors().listOverrideStyles });
      }
    }));
    this._editorControlDisposables.add(tree.onDidChangeFindMode((mode) => this._outlineViewState.filterOnType = mode === TreeFindMode.Filter));
    let idPool = 0;
    this._editorControlDisposables.add(tree.onDidOpen(async (e) => {
      const myId = ++idPool;
      const isDoubleClick = e.browserEvent?.type === "dblclick";
      if (!isDoubleClick) {
        await timeout(150);
        if (myId !== idPool) {
          return;
        }
      }
      await newOutline.reveal(e.element, e.editorOptions, e.sideBySide, isDoubleClick);
    }));
    const revealActiveElement = () => {
      if (!this._outlineViewState.followCursor || !newOutline.activeElement) {
        return;
      }
      let item = newOutline.activeElement;
      while (item) {
        const top = tree.getRelativeTop(item);
        if (top === null) {
          tree.reveal(item, 0.5);
        }
        if (tree.getRelativeTop(item) !== null) {
          tree.setFocus([item]);
          tree.setSelection([item]);
          break;
        }
        item = tree.getParentElement(item);
      }
    };
    revealActiveElement();
    this._editorControlDisposables.add(newOutline.onDidChange(revealActiveElement));
    this._editorControlDisposables.add(this._outlineViewState.onDidChange((e) => {
      this._outlineViewState.persist(this._storageService);
      if (e.filterOnType) {
        tree.findMode = this._outlineViewState.filterOnType ? TreeFindMode.Filter : TreeFindMode.Highlight;
      }
      if (e.followCursor) {
        revealActiveElement();
      }
      if (e.sortBy) {
        sorter.order = this._outlineViewState.sortBy;
        tree.resort();
      }
    }));
    let viewState;
    this._editorControlDisposables.add(tree.onDidChangeFindPattern((pattern) => {
      if (tree.findMode === TreeFindMode.Highlight) {
        return;
      }
      if (!viewState && pattern) {
        viewState = tree.getViewState();
        tree.expandAll();
      } else if (!pattern && viewState) {
        tree.setInput(tree.getInput(), viewState);
        viewState = void 0;
      }
    }));
    const updateAllCollapsedCtx = () => {
      this._ctxAllCollapsed.set(tree.getNode(null).children.every((node) => !node.collapsible || node.collapsed));
    };
    this._editorControlDisposables.add(tree.onDidChangeCollapseState(updateAllCollapsedCtx));
    this._editorControlDisposables.add(tree.onDidChangeModel(updateAllCollapsedCtx));
    updateAllCollapsedCtx();
    tree.layout(this._treeDimensions?.height, this._treeDimensions?.width);
    this._tree = tree;
    this._editorControlDisposables.add(toDisposable(() => {
      tree.dispose();
      this._tree = void 0;
    }));
  }
};
OutlinePane.Id = "outline";
OutlinePane = __decorateClass([
  __decorateParam(1, IOutlineService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IViewDescriptorService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IContextMenuService),
  __decorateParam(10, IOpenerService),
  __decorateParam(11, IThemeService),
  __decorateParam(12, IHoverService)
], OutlinePane);
export {
  OutlinePane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL291dGxpbmUvYnJvd3Nlci9vdXRsaW5lUGFuZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9vdXRsaW5lUGFuZS5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgUHJvZ3Jlc3NCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcHJvZ3Jlc3NiYXIvcHJvZ3Jlc3NiYXIuanMnO1xuaW1wb3J0IHsgVGltZW91dFRpbWVyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMUlVDYWNoZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJVmlld2xldFZpZXdPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3c1ZpZXdsZXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IE91dGxpbmVWaWV3U3RhdGUgfSBmcm9tICcuL291dGxpbmVWaWV3U3RhdGUuanMnO1xuaW1wb3J0IHsgSU91dGxpbmUsIElPdXRsaW5lQ29tcGFyYXRvciwgSU91dGxpbmVTZXJ2aWNlLCBPdXRsaW5lVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvb3V0bGluZS9icm93c2VyL291dGxpbmUuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgSUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVRyZWVTb3J0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IEFic3RyYWN0VHJlZVZpZXdTdGF0ZSwgSUFic3RyYWN0VHJlZVZpZXdTdGF0ZSwgVHJlZUZpbmRNb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYWJzdHJhY3RUcmVlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBjdHhBbGxDb2xsYXBzZWQsIGN0eEZpbHRlck9uVHlwZSwgY3R4Rm9jdXNlZCwgY3R4Rm9sbG93c0N1cnNvciwgY3R4U29ydE1vZGUsIElPdXRsaW5lUGFuZSwgT3V0bGluZVNvcnRPcmRlciB9IGZyb20gJy4vb3V0bGluZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0UHJvZ3Jlc3NCYXJTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuXG5jbGFzcyBPdXRsaW5lVHJlZVNvcnRlcjxFPiBpbXBsZW1lbnRzIElUcmVlU29ydGVyPEU+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9jb21wYXJhdG9yOiBJT3V0bGluZUNvbXBhcmF0b3I8RT4sXG5cdFx0cHVibGljIG9yZGVyOiBPdXRsaW5lU29ydE9yZGVyXG5cdCkgeyB9XG5cblx0Y29tcGFyZShhOiBFLCBiOiBFKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5vcmRlciA9PT0gT3V0bGluZVNvcnRPcmRlci5CeUtpbmQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb21wYXJhdG9yLmNvbXBhcmVCeVR5cGUoYSwgYik7XG5cdFx0fSBlbHNlIGlmICh0aGlzLm9yZGVyID09PSBPdXRsaW5lU29ydE9yZGVyLkJ5TmFtZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NvbXBhcmF0b3IuY29tcGFyZUJ5TmFtZShhLCBiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NvbXBhcmF0b3IuY29tcGFyZUJ5UG9zaXRpb24oYSwgYik7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPdXRsaW5lUGFuZSBleHRlbmRzIFZpZXdQYW5lIGltcGxlbWVudHMgSU91dGxpbmVQYW5lIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSWQgPSAnb3V0bGluZSc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yQ29udHJvbERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JQYW5lRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX291dGxpbmVWaWV3U3RhdGUgPSBuZXcgT3V0bGluZVZpZXdTdGF0ZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckxpc3RlbmVyID0gbmV3IE11dGFibGVEaXNwb3NhYmxlKCk7XG5cblx0cHJpdmF0ZSBfZG9tTm9kZSE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9tZXNzYWdlITogSFRNTERpdkVsZW1lbnQ7XG5cdHByaXZhdGUgX3Byb2dyZXNzQmFyITogUHJvZ3Jlc3NCYXI7XG5cdHByaXZhdGUgX3RyZWVDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfdHJlZT86IFdvcmtiZW5jaERhdGFUcmVlPElPdXRsaW5lPHVua25vd24+IHwgdW5kZWZpbmVkLCB1bmtub3duLCBGdXp6eVNjb3JlPjtcblx0cHJpdmF0ZSBfdHJlZURpbWVuc2lvbnM/OiBkb20uRGltZW5zaW9uO1xuXHRwcml2YXRlIF90cmVlU3RhdGVzID0gbmV3IExSVUNhY2hlPHN0cmluZywgSUFic3RyYWN0VHJlZVZpZXdTdGF0ZT4oMTApO1xuXG5cdHByaXZhdGUgX2N0eEZvbGxvd3NDdXJzb3IhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfY3R4RmlsdGVyT25UeXBlITogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2N0eFNvcnRNb2RlITogSUNvbnRleHRLZXk8T3V0bGluZVNvcnRPcmRlcj47XG5cdHByaXZhdGUgX2N0eEFsbENvbGxhcHNlZCE6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3bGV0Vmlld09wdGlvbnMsXG5cdFx0QElPdXRsaW5lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vdXRsaW5lU2VydmljZTogSU91dGxpbmVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBfaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0XHR0aGlzLl9vdXRsaW5lVmlld1N0YXRlLnJlc3RvcmUodGhpcy5fc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9vdXRsaW5lVmlld1N0YXRlKTtcblxuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmJ1ZmZlckNoYW5nZUV2ZW50cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9jdHhGb2xsb3dzQ3Vyc29yID0gY3R4Rm9sbG93c0N1cnNvci5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0dGhpcy5fY3R4RmlsdGVyT25UeXBlID0gY3R4RmlsdGVyT25UeXBlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR0aGlzLl9jdHhTb3J0TW9kZSA9IGN0eFNvcnRNb2RlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR0aGlzLl9jdHhBbGxDb2xsYXBzZWQgPSBjdHhBbGxDb2xsYXBzZWQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHVwZGF0ZUNvbnRleHQgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLl9jdHhGb2xsb3dzQ3Vyc29yLnNldCh0aGlzLl9vdXRsaW5lVmlld1N0YXRlLmZvbGxvd0N1cnNvcik7XG5cdFx0XHR0aGlzLl9jdHhGaWx0ZXJPblR5cGUuc2V0KHRoaXMuX291dGxpbmVWaWV3U3RhdGUuZmlsdGVyT25UeXBlKTtcblx0XHRcdHRoaXMuX2N0eFNvcnRNb2RlLnNldCh0aGlzLl9vdXRsaW5lVmlld1N0YXRlLnNvcnRCeSk7XG5cdFx0fTtcblx0XHR1cGRhdGVDb250ZXh0KCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX291dGxpbmVWaWV3U3RhdGUub25EaWRDaGFuZ2UodXBkYXRlQ29udGV4dCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZWRpdG9yUGFuZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9lZGl0b3JDb250cm9sRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2VkaXRvckxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3JDb250cm9sQ2hhbmdlUHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0XHR0aGlzLl90cmVlPy5kb21Gb2N1cygpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUgPSBjb250YWluZXI7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ291dGxpbmUtcGFuZScpO1xuXG5cdFx0Y29uc3QgcHJvZ3Jlc3NDb250YWluZXIgPSBkb20uJCgnLm91dGxpbmUtcHJvZ3Jlc3MnKTtcblx0XHR0aGlzLl9tZXNzYWdlID0gZG9tLiQoJy5vdXRsaW5lLW1lc3NhZ2UnKTtcblxuXHRcdHRoaXMuX3Byb2dyZXNzQmFyID0gbmV3IFByb2dyZXNzQmFyKHByb2dyZXNzQ29udGFpbmVyLCBkZWZhdWx0UHJvZ3Jlc3NCYXJTdHlsZXMpO1xuXG5cdFx0dGhpcy5fdHJlZUNvbnRhaW5lciA9IGRvbS4kKCcub3V0bGluZS10cmVlJyk7XG5cdFx0ZG9tLmFwcGVuZChjb250YWluZXIsIHByb2dyZXNzQ29udGFpbmVyLCB0aGlzLl9tZXNzYWdlLCB0aGlzLl90cmVlQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkodmlzaWJsZSA9PiB7XG5cdFx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdFx0Ly8gc3RvcCBldmVyeXRoaW5nIHdoZW4gbm90IHZpc2libGVcblx0XHRcdFx0dGhpcy5fZWRpdG9yTGlzdGVuZXIuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yUGFuZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMuX2VkaXRvckNvbnRyb2xEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0XHR9IGVsc2UgaWYgKCF0aGlzLl9lZGl0b3JMaXN0ZW5lci52YWx1ZSkge1xuXHRcdFx0XHRjb25zdCBldmVudCA9IEV2ZW50LmFueSh0aGlzLl9lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLCB0aGlzLl9vdXRsaW5lU2VydmljZS5vbkRpZENoYW5nZSk7XG5cdFx0XHRcdHRoaXMuX2VkaXRvckxpc3RlbmVyLnZhbHVlID0gZXZlbnQoKCkgPT4gdGhpcy5faGFuZGxlRWRpdG9yQ2hhbmdlZCh0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpKTtcblx0XHRcdFx0dGhpcy5faGFuZGxlRWRpdG9yQ2hhbmdlZCh0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLl90cmVlPy5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5fdHJlZURpbWVuc2lvbnMgPSBuZXcgZG9tLkRpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KTtcblx0fVxuXG5cdGNvbGxhcHNlQWxsKCk6IHZvaWQge1xuXHRcdHRoaXMuX3RyZWU/LmNvbGxhcHNlQWxsKCk7XG5cdH1cblxuXHRleHBhbmRBbGwoKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJlZT8uZXhwYW5kQWxsKCk7XG5cdH1cblxuXHRnZXQgb3V0bGluZVZpZXdTdGF0ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fb3V0bGluZVZpZXdTdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZykge1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmFkZCgnbWVzc2FnZScpO1xuXHRcdHRoaXMuX3Byb2dyZXNzQmFyLnN0b3AoKS5oaWRlKCk7XG5cdFx0dGhpcy5fbWVzc2FnZS50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG5cdH1cblxuXHRwcml2YXRlIF9jYXB0dXJlVmlld1N0YXRlKHVyaT86IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl90cmVlKSB7XG5cdFx0XHRjb25zdCBvbGRPdXRsaW5lID0gdGhpcy5fdHJlZS5nZXRJbnB1dCgpO1xuXHRcdFx0aWYgKCF1cmkpIHtcblx0XHRcdFx0dXJpID0gb2xkT3V0bGluZT8udXJpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG9sZE91dGxpbmUgJiYgdXJpKSB7XG5cdFx0XHRcdHRoaXMuX3RyZWVTdGF0ZXMuc2V0KGAke29sZE91dGxpbmUub3V0bGluZUtpbmR9LyR7dXJpfWAsIHRoaXMuX3RyZWUuZ2V0Vmlld1N0YXRlKCkpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZWRpdG9yQ29udHJvbENoYW5nZVByb21pc2U6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUoKTtcblx0cHJpdmF0ZSBfaGFuZGxlRWRpdG9yQ2hhbmdlZChwYW5lOiBJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2VkaXRvclBhbmVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0aWYgKHBhbmUpIHtcblx0XHRcdC8vIHJlYWN0IHRvIGNvbnRyb2wgY2hhbmdlcyBmcm9tIHdpdGhpbiBwYW5lIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTM0MDA4KVxuXHRcdFx0dGhpcy5fZWRpdG9yUGFuZURpc3Bvc2FibGVzLmFkZChwYW5lLm9uRGlkQ2hhbmdlQ29udHJvbCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvckNvbnRyb2xDaGFuZ2VQcm9taXNlID0gdGhpcy5faGFuZGxlRWRpdG9yQ29udHJvbENoYW5nZWQocGFuZSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRpdG9yQ29udHJvbENoYW5nZVByb21pc2UgPSB0aGlzLl9oYW5kbGVFZGl0b3JDb250cm9sQ2hhbmdlZChwYW5lKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUVkaXRvckNvbnRyb2xDaGFuZ2VkKHBhbmU6IElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBwZXJzaXN0IHN0YXRlXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKHBhbmU/LmlucHV0KTtcblx0XHRjb25zdCBkaWRDYXB0dXJlID0gdGhpcy5fY2FwdHVyZVZpZXdTdGF0ZSgpO1xuXG5cdFx0dGhpcy5fZWRpdG9yQ29udHJvbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRpZiAoIXBhbmUgfHwgIXRoaXMuX291dGxpbmVTZXJ2aWNlLmNhbkNyZWF0ZU91dGxpbmUocGFuZSkgfHwgIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2hvd01lc3NhZ2UobG9jYWxpemUoJ25vLWVkaXRvcicsIFwiVGhlIGFjdGl2ZSBlZGl0b3IgY2Fubm90IHByb3ZpZGUgb3V0bGluZSBpbmZvcm1hdGlvbi5cIikpO1xuXHRcdH1cblxuXHRcdGxldCBsb2FkaW5nTWVzc2FnZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFkaWRDYXB0dXJlKSB7XG5cdFx0XHRsb2FkaW5nTWVzc2FnZSA9IG5ldyBUaW1lb3V0VGltZXIoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zaG93TWVzc2FnZShsb2NhbGl6ZSgnbG9hZGluZycsIFwiTG9hZGluZyBkb2N1bWVudCBzeW1ib2xzIGZvciAnezB9Jy4uLlwiLCBiYXNlbmFtZShyZXNvdXJjZSkpKTtcblx0XHRcdH0sIDEwMCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcHJvZ3Jlc3NCYXIuaW5maW5pdGUoKS5zaG93KDUwMCk7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9lZGl0b3JDb250cm9sRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXG5cdFx0Y29uc3QgbmV3T3V0bGluZSA9IGF3YWl0IHRoaXMuX291dGxpbmVTZXJ2aWNlLmNyZWF0ZU91dGxpbmUocGFuZSwgT3V0bGluZVRhcmdldC5PdXRsaW5lUGFuZSwgY3RzLnRva2VuKTtcblx0XHRsb2FkaW5nTWVzc2FnZT8uZGlzcG9zZSgpO1xuXG5cdFx0aWYgKCFuZXdPdXRsaW5lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0bmV3T3V0bGluZT8uZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2VkaXRvckNvbnRyb2xEaXNwb3NhYmxlcy5hZGQobmV3T3V0bGluZSk7XG5cdFx0dGhpcy5fcHJvZ3Jlc3NCYXIuc3RvcCgpLmhpZGUoKTtcblxuXHRcdGNvbnN0IHNvcnRlciA9IG5ldyBPdXRsaW5lVHJlZVNvcnRlcihuZXdPdXRsaW5lLmNvbmZpZy5jb21wYXJhdG9yLCB0aGlzLl9vdXRsaW5lVmlld1N0YXRlLnNvcnRCeSk7XG5cblx0XHRjb25zdCB0cmVlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hEYXRhVHJlZTxJT3V0bGluZTx1bmtub3duPiB8IHVuZGVmaW5lZCwgdW5rbm93biwgRnV6enlTY29yZT4sXG5cdFx0XHQnT3V0bGluZVBhbmUnLFxuXHRcdFx0dGhpcy5fdHJlZUNvbnRhaW5lcixcblx0XHRcdG5ld091dGxpbmUuY29uZmlnLmRlbGVnYXRlLFxuXHRcdFx0bmV3T3V0bGluZS5jb25maWcucmVuZGVyZXJzLFxuXHRcdFx0bmV3T3V0bGluZS5jb25maWcudHJlZURhdGFTb3VyY2UsXG5cdFx0XHR7XG5cdFx0XHRcdC4uLm5ld091dGxpbmUuY29uZmlnLm9wdGlvbnMsXG5cdFx0XHRcdHNvcnRlcixcblx0XHRcdFx0ZXhwYW5kT25Eb3VibGVDbGljazogZmFsc2UsXG5cdFx0XHRcdGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogdHJ1ZSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0aGlkZVR3aXN0aWVzT2ZDaGlsZGxlc3NFbGVtZW50czogdHJ1ZSxcblx0XHRcdFx0ZGVmYXVsdEZpbmRNb2RlOiB0aGlzLl9vdXRsaW5lVmlld1N0YXRlLmZpbHRlck9uVHlwZSA/IFRyZWVGaW5kTW9kZS5GaWx0ZXIgOiBUcmVlRmluZE1vZGUuSGlnaGxpZ2h0LFxuXHRcdFx0XHRvdmVycmlkZVN0eWxlczogdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCkubGlzdE92ZXJyaWRlU3R5bGVzXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGN0eEZvY3VzZWQuYmluZFRvKHRyZWUuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Ly8gdXBkYXRlIHRyZWUsIGxpc3RlbiB0byBjaGFuZ2VzXG5cdFx0Y29uc3QgdXBkYXRlVHJlZSA9ICgpID0+IHtcblx0XHRcdGlmIChuZXdPdXRsaW5lLmlzRW1wdHkpIHtcblx0XHRcdFx0Ly8gbm8gbW9yZSBlbGVtZW50c1xuXHRcdFx0XHR0aGlzLl9zaG93TWVzc2FnZShsb2NhbGl6ZSgnbm8tc3ltYm9scycsIFwiTm8gc3ltYm9scyBmb3VuZCBpbiBkb2N1bWVudCAnezB9J1wiLCBiYXNlbmFtZShyZXNvdXJjZSkpKTtcblx0XHRcdFx0dGhpcy5fY2FwdHVyZVZpZXdTdGF0ZShyZXNvdXJjZSk7XG5cdFx0XHRcdHRyZWUuc2V0SW5wdXQodW5kZWZpbmVkKTtcblxuXHRcdFx0fSBlbHNlIGlmICghdHJlZS5nZXRJbnB1dCgpKSB7XG5cdFx0XHRcdC8vIGZpcnN0OiBpbml0IHRyZWVcblx0XHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdtZXNzYWdlJyk7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fdHJlZVN0YXRlcy5nZXQoYCR7bmV3T3V0bGluZS5vdXRsaW5lS2luZH0vJHtuZXdPdXRsaW5lLnVyaX1gKTtcblx0XHRcdFx0dHJlZS5zZXRJbnB1dChuZXdPdXRsaW5lLCBzdGF0ZSAmJiBBYnN0cmFjdFRyZWVWaWV3U3RhdGUubGlmdChzdGF0ZSkpO1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyB1cGRhdGU6IHJlZnJlc2ggdHJlZVxuXHRcdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ21lc3NhZ2UnKTtcblx0XHRcdFx0dHJlZS51cGRhdGVDaGlsZHJlbigpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dXBkYXRlVHJlZSgpO1xuXHRcdHRoaXMuX2VkaXRvckNvbnRyb2xEaXNwb3NhYmxlcy5hZGQobmV3T3V0bGluZS5vbkRpZENoYW5nZSh1cGRhdGVUcmVlKSk7XG5cblx0XHQvLyBmZWF0dXJlOiBhcHBseSBwYW5lbCBiYWNrZ3JvdW5kIHRvIHRyZWVcblx0XHR0aGlzLl9lZGl0b3JDb250cm9sRGlzcG9zYWJsZXMuYWRkKHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm9uRGlkQ2hhbmdlTG9jYXRpb24oKHsgdmlld3MgfSkgPT4ge1xuXHRcdFx0aWYgKHZpZXdzLnNvbWUodiA9PiB2LmlkID09PSB0aGlzLmlkKSkge1xuXHRcdFx0XHR0cmVlLnVwZGF0ZU9wdGlvbnMoeyBvdmVycmlkZVN0eWxlczogdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCkubGlzdE92ZXJyaWRlU3R5bGVzIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIGZlYXR1cmU6IGZpbHRlciBvbiB0eXBlIC0ga2VlcCB0cmVlIGFuZCBtZW51IGluIHN5bmNcblx0XHR0aGlzLl9lZGl0b3JDb250cm9sRGlzcG9zYWJsZXMuYWRkKHRyZWUub25EaWRDaGFuZ2VGaW5kTW9kZShtb2RlID0+IHRoaXMuX291dGxpbmVWaWV3U3RhdGUuZmlsdGVyT25UeXBlID0gbW9kZSA9PT0gVHJlZUZpbmRNb2RlLkZpbHRlcikpO1xuXG5cdFx0Ly8gZmVhdHVyZTogcmV2ZWFsIG91dGxpbmUgc2VsZWN0aW9uIGluIGVkaXRvclxuXHRcdC8vIG9uIGNoYW5nZSAtPiByZXZlYWwvc2VsZWN0IGRlZmluaW5nIHJhbmdlXG5cdFx0bGV0IGlkUG9vbCA9IDA7XG5cdFx0dGhpcy5fZWRpdG9yQ29udHJvbERpc3Bvc2FibGVzLmFkZCh0cmVlLm9uRGlkT3Blbihhc3luYyBlID0+IHtcblx0XHRcdGNvbnN0IG15SWQgPSArK2lkUG9vbDtcblx0XHRcdGNvbnN0IGlzRG91YmxlQ2xpY2sgPSBlLmJyb3dzZXJFdmVudD8udHlwZSA9PT0gJ2RibGNsaWNrJztcblx0XHRcdGlmICghaXNEb3VibGVDbGljaykge1xuXHRcdFx0XHQvLyB3b3JrYXJvdW5kIGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjA2NDI0XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTUwKTtcblx0XHRcdFx0aWYgKG15SWQgIT09IGlkUG9vbCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0YXdhaXQgbmV3T3V0bGluZS5yZXZlYWwoZS5lbGVtZW50LCBlLmVkaXRvck9wdGlvbnMsIGUuc2lkZUJ5U2lkZSwgaXNEb3VibGVDbGljayk7XG5cdFx0fSkpO1xuXHRcdC8vIGZlYXR1cmU6IHJldmVhbCBlZGl0b3Igc2VsZWN0aW9uIGluIG91dGxpbmVcblx0XHRjb25zdCByZXZlYWxBY3RpdmVFbGVtZW50ID0gKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9vdXRsaW5lVmlld1N0YXRlLmZvbGxvd0N1cnNvciB8fCAhbmV3T3V0bGluZS5hY3RpdmVFbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxldCBpdGVtID0gbmV3T3V0bGluZS5hY3RpdmVFbGVtZW50O1xuXHRcdFx0d2hpbGUgKGl0ZW0pIHtcblx0XHRcdFx0Y29uc3QgdG9wID0gdHJlZS5nZXRSZWxhdGl2ZVRvcChpdGVtKTtcblx0XHRcdFx0aWYgKHRvcCA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdC8vIG5vdCB2aXNpYmxlIC0+IHJldmVhbFxuXHRcdFx0XHRcdHRyZWUucmV2ZWFsKGl0ZW0sIDAuNSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRyZWUuZ2V0UmVsYXRpdmVUb3AoaXRlbSkgIT09IG51bGwpIHtcblx0XHRcdFx0XHR0cmVlLnNldEZvY3VzKFtpdGVtXSk7XG5cdFx0XHRcdFx0dHJlZS5zZXRTZWxlY3Rpb24oW2l0ZW1dKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBTVElMTCBub3QgdmlzaWJsZSAtPiB0cnkgcGFyZW50XG5cdFx0XHRcdGl0ZW0gPSB0cmVlLmdldFBhcmVudEVsZW1lbnQoaXRlbSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRyZXZlYWxBY3RpdmVFbGVtZW50KCk7XG5cdFx0dGhpcy5fZWRpdG9yQ29udHJvbERpc3Bvc2FibGVzLmFkZChuZXdPdXRsaW5lLm9uRGlkQ2hhbmdlKHJldmVhbEFjdGl2ZUVsZW1lbnQpKTtcblxuXHRcdC8vIGZlYXR1cmU6IHVwZGF0ZSB2aWV3IHdoZW4gdXNlciBzdGF0ZSBjaGFuZ2VzXG5cdFx0dGhpcy5fZWRpdG9yQ29udHJvbERpc3Bvc2FibGVzLmFkZCh0aGlzLl9vdXRsaW5lVmlld1N0YXRlLm9uRGlkQ2hhbmdlKChlOiB7IGZvbGxvd0N1cnNvcj86IGJvb2xlYW47IHNvcnRCeT86IGJvb2xlYW47IGZpbHRlck9uVHlwZT86IGJvb2xlYW4gfSkgPT4ge1xuXHRcdFx0dGhpcy5fb3V0bGluZVZpZXdTdGF0ZS5wZXJzaXN0KHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGlmIChlLmZpbHRlck9uVHlwZSkge1xuXHRcdFx0XHR0cmVlLmZpbmRNb2RlID0gdGhpcy5fb3V0bGluZVZpZXdTdGF0ZS5maWx0ZXJPblR5cGUgPyBUcmVlRmluZE1vZGUuRmlsdGVyIDogVHJlZUZpbmRNb2RlLkhpZ2hsaWdodDtcblx0XHRcdH1cblx0XHRcdGlmIChlLmZvbGxvd0N1cnNvcikge1xuXHRcdFx0XHRyZXZlYWxBY3RpdmVFbGVtZW50KCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5zb3J0QnkpIHtcblx0XHRcdFx0c29ydGVyLm9yZGVyID0gdGhpcy5fb3V0bGluZVZpZXdTdGF0ZS5zb3J0Qnk7XG5cdFx0XHRcdHRyZWUucmVzb3J0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gZmVhdHVyZTogZXhwYW5kIGFsbCBub2RlcyB3aGVuIGZpbHRlcmluZyAobm90IHdoZW4gZmluZGluZylcblx0XHRsZXQgdmlld1N0YXRlOiBBYnN0cmFjdFRyZWVWaWV3U3RhdGUgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZWRpdG9yQ29udHJvbERpc3Bvc2FibGVzLmFkZCh0cmVlLm9uRGlkQ2hhbmdlRmluZFBhdHRlcm4ocGF0dGVybiA9PiB7XG5cdFx0XHRpZiAodHJlZS5maW5kTW9kZSA9PT0gVHJlZUZpbmRNb2RlLkhpZ2hsaWdodCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXZpZXdTdGF0ZSAmJiBwYXR0ZXJuKSB7XG5cdFx0XHRcdHZpZXdTdGF0ZSA9IHRyZWUuZ2V0Vmlld1N0YXRlKCk7XG5cdFx0XHRcdHRyZWUuZXhwYW5kQWxsKCk7XG5cdFx0XHR9IGVsc2UgaWYgKCFwYXR0ZXJuICYmIHZpZXdTdGF0ZSkge1xuXHRcdFx0XHR0cmVlLnNldElucHV0KHRyZWUuZ2V0SW5wdXQoKSEsIHZpZXdTdGF0ZSk7XG5cdFx0XHRcdHZpZXdTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBmZWF0dXJlOiB1cGRhdGUgYWxsLWNvbGxhcHNlZCBjb250ZXh0IGtleVxuXHRcdGNvbnN0IHVwZGF0ZUFsbENvbGxhcHNlZEN0eCA9ICgpID0+IHtcblx0XHRcdHRoaXMuX2N0eEFsbENvbGxhcHNlZC5zZXQodHJlZS5nZXROb2RlKG51bGwpLmNoaWxkcmVuLmV2ZXJ5KG5vZGUgPT4gIW5vZGUuY29sbGFwc2libGUgfHwgbm9kZS5jb2xsYXBzZWQpKTtcblx0XHR9O1xuXHRcdHRoaXMuX2VkaXRvckNvbnRyb2xEaXNwb3NhYmxlcy5hZGQodHJlZS5vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUodXBkYXRlQWxsQ29sbGFwc2VkQ3R4KSk7XG5cdFx0dGhpcy5fZWRpdG9yQ29udHJvbERpc3Bvc2FibGVzLmFkZCh0cmVlLm9uRGlkQ2hhbmdlTW9kZWwodXBkYXRlQWxsQ29sbGFwc2VkQ3R4KSk7XG5cdFx0dXBkYXRlQWxsQ29sbGFwc2VkQ3R4KCk7XG5cblx0XHQvLyBsYXN0OiBzZXQgdHJlZSBwcm9wZXJ0eSBhbmQgd2lyZSBpdCB1cCB0byBvbmUgb2Ygb3VyIGNvbnRleHQga2V5c1xuXHRcdHRyZWUubGF5b3V0KHRoaXMuX3RyZWVEaW1lbnNpb25zPy5oZWlnaHQsIHRoaXMuX3RyZWVEaW1lbnNpb25zPy53aWR0aCk7XG5cdFx0dGhpcy5fdHJlZSA9IHRyZWU7XG5cdFx0dGhpcy5fZWRpdG9yQ29udHJvbERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dHJlZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl90cmVlID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsY0FBYyxlQUFlO0FBQ3RDLFNBQXNCLGNBQWMsaUJBQWlCLHlCQUF5QjtBQUM5RSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBdUMsaUJBQWlCLHFCQUFxQjtBQUM3RSxTQUFTLDhCQUEyQztBQUNwRCxTQUFTLCtCQUErQjtBQUN4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
