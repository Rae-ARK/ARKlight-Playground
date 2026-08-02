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
import "./media/callHierarchy.css";
import * as peekView from "../../../../editor/contrib/peekView/browser/peekView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { CallHierarchyDirection } from "../common/callHierarchy.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import * as callHTree from "./callHierarchyTree.js";
import { localize } from "../../../../nls.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { Range } from "../../../../editor/common/core/range.js";
import { SplitView, Orientation, Sizing } from "../../../../base/browser/ui/splitview/splitview.js";
import { Dimension, isKeyboardEvent } from "../../../../base/browser/dom.js";
import { Event } from "../../../../base/common/event.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { toDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { TrackedRangeStickiness, OverviewRulerLane } from "../../../../editor/common/model.js";
import { themeColorFromId, IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Color } from "../../../../base/common/color.js";
import { TreeMouseEventTarget } from "../../../../base/browser/ui/tree/tree.js";
import { MenuId, IMenuService } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
var State = /* @__PURE__ */ ((State2) => {
  State2["Loading"] = "loading";
  State2["Message"] = "message";
  State2["Data"] = "data";
  return State2;
})(State || {});
class LayoutInfo {
  constructor(ratio, height) {
    this.ratio = ratio;
    this.height = height;
  }
  static store(info, storageService) {
    storageService.store("callHierarchyPeekLayout", JSON.stringify(info), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  static retrieve(storageService) {
    const value = storageService.get("callHierarchyPeekLayout", StorageScope.PROFILE, "{}");
    const defaultInfo = { ratio: 0.7, height: 17 };
    try {
      return { ...defaultInfo, ...JSON.parse(value) };
    } catch {
      return defaultInfo;
    }
  }
}
class CallHierarchyTree extends WorkbenchAsyncDataTree {
}
let CallHierarchyTreePeekWidget = class extends peekView.PeekViewWidget {
  constructor(editor, _where, _direction, themeService, _peekViewService, _editorService, _textModelService, _storageService, _menuService, _contextKeyService, _instantiationService) {
    super(editor, { showFrame: true, showArrow: true, isResizeable: true, isAccessible: true }, _instantiationService);
    this._where = _where;
    this._direction = _direction;
    this._peekViewService = _peekViewService;
    this._editorService = _editorService;
    this._textModelService = _textModelService;
    this._storageService = _storageService;
    this._menuService = _menuService;
    this._contextKeyService = _contextKeyService;
    this._instantiationService = _instantiationService;
    this._treeViewStates = /* @__PURE__ */ new Map();
    this._previewDisposable = new DisposableStore();
    this.create();
    this._peekViewService.addExclusiveWidget(editor, this);
    this._applyTheme(themeService.getColorTheme());
    this._disposables.add(themeService.onDidColorThemeChange(this._applyTheme, this));
    this._disposables.add(this._previewDisposable);
  }
  dispose() {
    LayoutInfo.store(this._layoutInfo, this._storageService);
    this._splitView.dispose();
    this._tree.dispose();
    this._editor.dispose();
    super.dispose();
  }
  get direction() {
    return this._direction;
  }
  _applyTheme(theme) {
    const borderColor = theme.getColor(peekView.peekViewBorder) || Color.transparent;
    this.style({
      arrowColor: borderColor,
      frameColor: borderColor,
      headerBackgroundColor: theme.getColor(peekView.peekViewTitleBackground) || Color.transparent,
      primaryHeadingColor: theme.getColor(peekView.peekViewTitleForeground),
      secondaryHeadingColor: theme.getColor(peekView.peekViewTitleInfoForeground)
    });
  }
  _fillHead(container) {
    super._fillHead(container, true);
    const menu = this._menuService.createMenu(CallHierarchyTreePeekWidget.TitleMenu, this._contextKeyService);
    const updateToolbar = () => {
      const actions = getFlatActionBarActions(menu.getActions());
      this._actionbarWidget.clear();
      this._actionbarWidget.push(actions, { label: false, icon: true });
    };
    this._disposables.add(menu);
    this._disposables.add(menu.onDidChange(updateToolbar));
    updateToolbar();
  }
  _fillBody(parent) {
    this._layoutInfo = LayoutInfo.retrieve(this._storageService);
    this._dim = new Dimension(0, 0);
    this._parent = parent;
    parent.classList.add("call-hierarchy");
    const message = document.createElement("div");
    message.classList.add("message");
    parent.appendChild(message);
    this._message = message;
    this._message.tabIndex = 0;
    const container = document.createElement("div");
    container.classList.add("results");
    parent.appendChild(container);
    this._splitView = new SplitView(container, { orientation: Orientation.HORIZONTAL });
    const editorContainer = document.createElement("div");
    editorContainer.classList.add("editor");
    container.appendChild(editorContainer);
    const editorOptions = {
      scrollBeyondLastLine: false,
      scrollbar: {
        verticalScrollbarSize: 14,
        horizontal: "auto",
        useShadows: true,
        verticalHasArrows: false,
        horizontalHasArrows: false,
        alwaysConsumeMouseWheel: false
      },
      overviewRulerLanes: 2,
      fixedOverflowWidgets: true,
      minimap: {
        enabled: false
      }
    };
    this._editor = this._instantiationService.createInstance(
      EmbeddedCodeEditorWidget,
      editorContainer,
      editorOptions,
      {},
      this.editor
    );
    const treeContainer = document.createElement("div");
    treeContainer.classList.add("tree");
    container.appendChild(treeContainer);
    const options = {
      sorter: new callHTree.Sorter(),
      accessibilityProvider: new callHTree.AccessibilityProvider(() => this._direction),
      identityProvider: new callHTree.IdentityProvider(() => this._direction),
      expandOnlyOnTwistieClick: true,
      overrideStyles: {
        listBackground: peekView.peekViewResultsBackground
      }
    };
    this._tree = this._instantiationService.createInstance(
      CallHierarchyTree,
      "CallHierarchyPeek",
      treeContainer,
      new callHTree.VirtualDelegate(),
      [this._instantiationService.createInstance(callHTree.CallRenderer)],
      this._instantiationService.createInstance(callHTree.DataSource, () => this._direction),
      options
    );
    this._splitView.addView({
      onDidChange: Event.None,
      element: editorContainer,
      minimumSize: 200,
      maximumSize: Number.MAX_VALUE,
      layout: (width) => {
        if (this._dim.height) {
          this._editor.layout({ height: this._dim.height, width });
        }
      }
    }, Sizing.Distribute);
    this._splitView.addView({
      onDidChange: Event.None,
      element: treeContainer,
      minimumSize: 100,
      maximumSize: Number.MAX_VALUE,
      layout: (width) => {
        if (this._dim.height) {
          this._tree.layout(this._dim.height, width);
        }
      }
    }, Sizing.Distribute);
    this._disposables.add(this._splitView.onDidSashChange(() => {
      if (this._dim.width) {
        this._layoutInfo.ratio = this._splitView.getViewSize(0) / this._dim.width;
      }
    }));
    this._disposables.add(this._tree.onDidChangeFocus(this._updatePreview, this));
    this._disposables.add(this._editor.onMouseDown((e) => {
      const { event, target } = e;
      if (event.detail !== 2) {
        return;
      }
      const [focus] = this._tree.getFocus();
      if (!focus) {
        return;
      }
      this.dispose();
      this._editorService.openEditor({
        resource: focus.item.uri,
        options: { selection: target.range }
      });
    }));
    this._disposables.add(this._tree.onMouseDblClick((e) => {
      if (e.target === TreeMouseEventTarget.Twistie) {
        return;
      }
      if (e.element) {
        this.dispose();
        this._editorService.openEditor({
          resource: e.element.item.uri,
          options: { selection: e.element.item.selectionRange, pinned: true }
        });
      }
    }));
    this._disposables.add(this._tree.onDidChangeSelection((e) => {
      const [element] = e.elements;
      if (element && isKeyboardEvent(e.browserEvent)) {
        this.dispose();
        this._editorService.openEditor({
          resource: element.item.uri,
          options: { selection: element.item.selectionRange, pinned: true }
        });
      }
    }));
  }
  async _updatePreview() {
    const [element] = this._tree.getFocus();
    if (!element) {
      return;
    }
    this._previewDisposable.clear();
    const options = {
      description: "call-hierarchy-decoration",
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      className: "call-decoration",
      overviewRuler: {
        color: themeColorFromId(peekView.peekViewEditorMatchHighlight),
        position: OverviewRulerLane.Center
      }
    };
    let previewUri;
    if (this._direction === CallHierarchyDirection.CallsFrom) {
      previewUri = element.parent ? element.parent.item.uri : element.model.root.uri;
    } else {
      previewUri = element.item.uri;
    }
    const value = await this._textModelService.createModelReference(previewUri);
    this._editor.setModel(value.object.textEditorModel);
    const decorations = [];
    let fullRange;
    let locations = element.locations;
    if (!locations) {
      locations = [{ uri: element.item.uri, range: element.item.selectionRange }];
    }
    for (const loc of locations) {
      if (loc.uri.toString() === previewUri.toString()) {
        decorations.push({ range: loc.range, options });
        fullRange = !fullRange ? loc.range : Range.plusRange(loc.range, fullRange);
      }
    }
    if (fullRange) {
      this._editor.revealRangeInCenter(fullRange, ScrollType.Immediate);
      const decorationsCollection = this._editor.createDecorationsCollection(decorations);
      this._previewDisposable.add(toDisposable(() => decorationsCollection.clear()));
    }
    this._previewDisposable.add(value);
    const title = this._direction === CallHierarchyDirection.CallsFrom ? localize("callFrom", "Calls from '{0}'", element.model.root.name) : localize("callsTo", "Callers of '{0}'", element.model.root.name);
    this.setTitle(title);
  }
  showLoading() {
    this._parent.dataset["state"] = "loading" /* Loading */;
    this.setTitle(localize("title.loading", "Loading..."));
    this._show();
  }
  showMessage(message) {
    this._parent.dataset["state"] = "message" /* Message */;
    this.setTitle("");
    this.setMetaTitle("");
    this._message.innerText = message;
    this._show();
    this._message.focus();
  }
  async showModel(model) {
    this._show();
    const viewState = this._treeViewStates.get(this._direction);
    await this._tree.setInput(model, viewState);
    const root = this._tree.getNode(model).children[0];
    await this._tree.expand(root.element);
    if (root.children.length === 0) {
      this.showMessage(this._direction === CallHierarchyDirection.CallsFrom ? localize("empt.callsFrom", "No calls from '{0}'", model.root.name) : localize("empt.callsTo", "No callers of '{0}'", model.root.name));
    } else {
      this._parent.dataset["state"] = "data" /* Data */;
      if (!viewState || this._tree.getFocus().length === 0) {
        this._tree.setFocus([root.children[0].element]);
      }
      this._tree.domFocus();
      this._updatePreview();
    }
  }
  getModel() {
    return this._tree.getInput();
  }
  getFocused() {
    return this._tree.getFocus()[0];
  }
  async updateDirection(newDirection) {
    const model = this._tree.getInput();
    if (model && newDirection !== this._direction) {
      this._treeViewStates.set(this._direction, this._tree.getViewState());
      this._direction = newDirection;
      await this.showModel(model);
    }
  }
  _show() {
    if (!this._isShowing) {
      this.editor.revealLineInCenterIfOutsideViewport(this._where.lineNumber, ScrollType.Smooth);
      super.show(Range.fromPositions(this._where), this._layoutInfo.height);
    }
  }
  _onWidth(width) {
    if (this._dim) {
      this._doLayoutBody(this._dim.height, width);
    }
  }
  _doLayoutBody(height, width) {
    if (this._dim.height !== height || this._dim.width !== width) {
      super._doLayoutBody(height, width);
      this._dim = new Dimension(width, height);
      this._layoutInfo.height = this._viewZone ? this._viewZone.heightInLines : this._layoutInfo.height;
      this._splitView.layout(width);
      this._splitView.resizeView(0, width * this._layoutInfo.ratio);
    }
  }
};
CallHierarchyTreePeekWidget.TitleMenu = new MenuId("callhierarchy/title");
CallHierarchyTreePeekWidget = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, peekView.IPeekViewService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, ITextModelService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IInstantiationService)
], CallHierarchyTreePeekWidget);
export {
  CallHierarchyTreePeekWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NhbGxIaWVyYXJjaHkvYnJvd3Nlci9jYWxsSGllcmFyY2h5UGVlay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jYWxsSGllcmFyY2h5LmNzcyc7XG5pbXBvcnQgKiBhcyBwZWVrVmlldyBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9wZWVrVmlldy9icm93c2VyL3BlZWtWaWV3LmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IENhbGxIaWVyYXJjaHlEaXJlY3Rpb24sIENhbGxIaWVyYXJjaHlNb2RlbCB9IGZyb20gJy4uL2NvbW1vbi9jYWxsSGllcmFyY2h5LmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWUsIElXb3JrYmVuY2hBc3luY0RhdGFUcmVlT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgKiBhcyBjYWxsSFRyZWUgZnJvbSAnLi9jYWxsSGllcmFyY2h5VHJlZS5qcyc7XG5pbXBvcnQgeyBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2FzeW5jRGF0YVRyZWUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU3BsaXRWaWV3LCBPcmllbnRhdGlvbiwgU2l6aW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgRGltZW5zaW9uLCBpc0tleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvZW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MsIElNb2RlbERlbHRhRGVjb3JhdGlvbiwgSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMsIE92ZXJ2aWV3UnVsZXJMYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyB0aGVtZUNvbG9yRnJvbUlkLCBJVGhlbWVTZXJ2aWNlLCBJQ29sb3JUaGVtZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IFRyZWVNb3VzZUV2ZW50VGFyZ2V0LCBJVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIElNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5cbmNvbnN0IGVudW0gU3RhdGUge1xuXHRMb2FkaW5nID0gJ2xvYWRpbmcnLFxuXHRNZXNzYWdlID0gJ21lc3NhZ2UnLFxuXHREYXRhID0gJ2RhdGEnXG59XG5cbmNsYXNzIExheW91dEluZm8ge1xuXG5cdHN0YXRpYyBzdG9yZShpbmZvOiBMYXlvdXRJbmZvLCBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKTogdm9pZCB7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2NhbGxIaWVyYXJjaHlQZWVrTGF5b3V0JywgSlNPTi5zdHJpbmdpZnkoaW5mbyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0c3RhdGljIHJldHJpZXZlKHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpOiBMYXlvdXRJbmZvIHtcblx0XHRjb25zdCB2YWx1ZSA9IHN0b3JhZ2VTZXJ2aWNlLmdldCgnY2FsbEhpZXJhcmNoeVBlZWtMYXlvdXQnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJ3t9Jyk7XG5cdFx0Y29uc3QgZGVmYXVsdEluZm86IExheW91dEluZm8gPSB7IHJhdGlvOiAwLjcsIGhlaWdodDogMTcgfTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHsgLi4uZGVmYXVsdEluZm8sIC4uLkpTT04ucGFyc2UodmFsdWUpIH07XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZGVmYXVsdEluZm87XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJhdGlvOiBudW1iZXIsXG5cdFx0cHVibGljIGhlaWdodDogbnVtYmVyXG5cdCkgeyB9XG59XG5cbmNsYXNzIENhbGxIaWVyYXJjaHlUcmVlIGV4dGVuZHMgV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxDYWxsSGllcmFyY2h5TW9kZWwsIGNhbGxIVHJlZS5DYWxsLCBGdXp6eVNjb3JlPiB7IH1cblxuZXhwb3J0IGNsYXNzIENhbGxIaWVyYXJjaHlUcmVlUGVla1dpZGdldCBleHRlbmRzIHBlZWtWaWV3LlBlZWtWaWV3V2lkZ2V0IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVGl0bGVNZW51ID0gbmV3IE1lbnVJZCgnY2FsbGhpZXJhcmNoeS90aXRsZScpO1xuXG5cdHByaXZhdGUgX3BhcmVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9tZXNzYWdlITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3NwbGl0VmlldyE6IFNwbGl0Vmlldztcblx0cHJpdmF0ZSBfdHJlZSE6IENhbGxIaWVyYXJjaHlUcmVlO1xuXHRwcml2YXRlIF90cmVlVmlld1N0YXRlcyA9IG5ldyBNYXA8Q2FsbEhpZXJhcmNoeURpcmVjdGlvbiwgSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGU+KCk7XG5cdHByaXZhdGUgX2VkaXRvciE6IEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldDtcblx0cHJpdmF0ZSBfZGltITogRGltZW5zaW9uO1xuXHRwcml2YXRlIF9sYXlvdXRJbmZvITogTGF5b3V0SW5mbztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmV2aWV3RGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3doZXJlOiBJUG9zaXRpb24sXG5cdFx0cHJpdmF0ZSBfZGlyZWN0aW9uOiBDYWxsSGllcmFyY2h5RGlyZWN0aW9uLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRAcGVla1ZpZXcuSVBlZWtWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wZWVrVmlld1NlcnZpY2U6IHBlZWtWaWV3LklQZWVrVmlld1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvciwgeyBzaG93RnJhbWU6IHRydWUsIHNob3dBcnJvdzogdHJ1ZSwgaXNSZXNpemVhYmxlOiB0cnVlLCBpc0FjY2Vzc2libGU6IHRydWUgfSwgX2luc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLmNyZWF0ZSgpO1xuXHRcdHRoaXMuX3BlZWtWaWV3U2VydmljZS5hZGRFeGNsdXNpdmVXaWRnZXQoZWRpdG9yLCB0aGlzKTtcblx0XHR0aGlzLl9hcHBseVRoZW1lKHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKHRoaXMuX2FwcGx5VGhlbWUsIHRoaXMpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fcHJldmlld0Rpc3Bvc2FibGUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRMYXlvdXRJbmZvLnN0b3JlKHRoaXMuX2xheW91dEluZm8sIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLl9zcGxpdFZpZXcuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3RyZWUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2VkaXRvci5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Z2V0IGRpcmVjdGlvbigpOiBDYWxsSGllcmFyY2h5RGlyZWN0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fZGlyZWN0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlUaGVtZSh0aGVtZTogSUNvbG9yVGhlbWUpIHtcblx0XHRjb25zdCBib3JkZXJDb2xvciA9IHRoZW1lLmdldENvbG9yKHBlZWtWaWV3LnBlZWtWaWV3Qm9yZGVyKSB8fCBDb2xvci50cmFuc3BhcmVudDtcblx0XHR0aGlzLnN0eWxlKHtcblx0XHRcdGFycm93Q29sb3I6IGJvcmRlckNvbG9yLFxuXHRcdFx0ZnJhbWVDb2xvcjogYm9yZGVyQ29sb3IsXG5cdFx0XHRoZWFkZXJCYWNrZ3JvdW5kQ29sb3I6IHRoZW1lLmdldENvbG9yKHBlZWtWaWV3LnBlZWtWaWV3VGl0bGVCYWNrZ3JvdW5kKSB8fCBDb2xvci50cmFuc3BhcmVudCxcblx0XHRcdHByaW1hcnlIZWFkaW5nQ29sb3I6IHRoZW1lLmdldENvbG9yKHBlZWtWaWV3LnBlZWtWaWV3VGl0bGVGb3JlZ3JvdW5kKSxcblx0XHRcdHNlY29uZGFyeUhlYWRpbmdDb2xvcjogdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXcucGVla1ZpZXdUaXRsZUluZm9Gb3JlZ3JvdW5kKVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9maWxsSGVhZChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIuX2ZpbGxIZWFkKGNvbnRhaW5lciwgdHJ1ZSk7XG5cblx0XHRjb25zdCBtZW51ID0gdGhpcy5fbWVudVNlcnZpY2UuY3JlYXRlTWVudShDYWxsSGllcmFyY2h5VHJlZVBlZWtXaWRnZXQuVGl0bGVNZW51LCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgdXBkYXRlVG9vbGJhciA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyhtZW51LmdldEFjdGlvbnMoKSk7XG5cdFx0XHR0aGlzLl9hY3Rpb25iYXJXaWRnZXQhLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9hY3Rpb25iYXJXaWRnZXQhLnB1c2goYWN0aW9ucywgeyBsYWJlbDogZmFsc2UsIGljb246IHRydWUgfSk7XG5cdFx0fTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQobWVudSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKG1lbnUub25EaWRDaGFuZ2UodXBkYXRlVG9vbGJhcikpO1xuXHRcdHVwZGF0ZVRvb2xiYXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZmlsbEJvZHkocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXG5cdFx0dGhpcy5fbGF5b3V0SW5mbyA9IExheW91dEluZm8ucmV0cmlldmUodGhpcy5fc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMuX2RpbSA9IG5ldyBEaW1lbnNpb24oMCwgMCk7XG5cblx0XHR0aGlzLl9wYXJlbnQgPSBwYXJlbnQ7XG5cdFx0cGFyZW50LmNsYXNzTGlzdC5hZGQoJ2NhbGwtaGllcmFyY2h5Jyk7XG5cblx0XHRjb25zdCBtZXNzYWdlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0bWVzc2FnZS5jbGFzc0xpc3QuYWRkKCdtZXNzYWdlJyk7XG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKG1lc3NhZ2UpO1xuXHRcdHRoaXMuX21lc3NhZ2UgPSBtZXNzYWdlO1xuXHRcdHRoaXMuX21lc3NhZ2UudGFiSW5kZXggPSAwO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Jlc3VsdHMnKTtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3NwbGl0VmlldyA9IG5ldyBTcGxpdFZpZXcoY29udGFpbmVyLCB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIH0pO1xuXG5cdFx0Ly8gZWRpdG9yIHN0dWZmXG5cdFx0Y29uc3QgZWRpdG9yQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZWRpdG9yQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2VkaXRvcicpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChlZGl0b3JDb250YWluZXIpO1xuXHRcdGNvbnN0IGVkaXRvck9wdGlvbnM6IElFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IGZhbHNlLFxuXHRcdFx0c2Nyb2xsYmFyOiB7XG5cdFx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTogMTQsXG5cdFx0XHRcdGhvcml6b250YWw6ICdhdXRvJyxcblx0XHRcdFx0dXNlU2hhZG93czogdHJ1ZSxcblx0XHRcdFx0dmVydGljYWxIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0XHRob3Jpem9udGFsSGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0b3ZlcnZpZXdSdWxlckxhbmVzOiAyLFxuXHRcdFx0Zml4ZWRPdmVyZmxvd1dpZGdldHM6IHRydWUsXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdGVuYWJsZWQ6IGZhbHNlXG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9lZGl0b3IgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCxcblx0XHRcdGVkaXRvckNvbnRhaW5lcixcblx0XHRcdGVkaXRvck9wdGlvbnMsXG5cdFx0XHR7fSxcblx0XHRcdHRoaXMuZWRpdG9yXG5cdFx0KTtcblxuXHRcdC8vIHRyZWUgc3R1ZmZcblx0XHRjb25zdCB0cmVlQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dHJlZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCd0cmVlJyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRyZWVDb250YWluZXIpO1xuXHRcdGNvbnN0IG9wdGlvbnM6IElXb3JrYmVuY2hBc3luY0RhdGFUcmVlT3B0aW9uczxjYWxsSFRyZWUuQ2FsbCwgRnV6enlTY29yZT4gPSB7XG5cdFx0XHRzb3J0ZXI6IG5ldyBjYWxsSFRyZWUuU29ydGVyKCksXG5cdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IG5ldyBjYWxsSFRyZWUuQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCgpID0+IHRoaXMuX2RpcmVjdGlvbiksXG5cdFx0XHRpZGVudGl0eVByb3ZpZGVyOiBuZXcgY2FsbEhUcmVlLklkZW50aXR5UHJvdmlkZXIoKCkgPT4gdGhpcy5fZGlyZWN0aW9uKSxcblx0XHRcdGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogdHJ1ZSxcblx0XHRcdG92ZXJyaWRlU3R5bGVzOiB7XG5cdFx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBwZWVrVmlldy5wZWVrVmlld1Jlc3VsdHNCYWNrZ3JvdW5kXG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl90cmVlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDYWxsSGllcmFyY2h5VHJlZSxcblx0XHRcdCdDYWxsSGllcmFyY2h5UGVlaycsXG5cdFx0XHR0cmVlQ29udGFpbmVyLFxuXHRcdFx0bmV3IGNhbGxIVHJlZS5WaXJ0dWFsRGVsZWdhdGUoKSxcblx0XHRcdFt0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShjYWxsSFRyZWUuQ2FsbFJlbmRlcmVyKV0sXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShjYWxsSFRyZWUuRGF0YVNvdXJjZSwgKCkgPT4gdGhpcy5fZGlyZWN0aW9uKSxcblx0XHRcdG9wdGlvbnNcblx0XHQpO1xuXG5cdFx0Ly8gc3BsaXQgc3R1ZmZcblx0XHR0aGlzLl9zcGxpdFZpZXcuYWRkVmlldyh7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdGVsZW1lbnQ6IGVkaXRvckNvbnRhaW5lcixcblx0XHRcdG1pbmltdW1TaXplOiAyMDAsXG5cdFx0XHRtYXhpbXVtU2l6ZTogTnVtYmVyLk1BWF9WQUxVRSxcblx0XHRcdGxheW91dDogKHdpZHRoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9kaW0uaGVpZ2h0KSB7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yLmxheW91dCh7IGhlaWdodDogdGhpcy5fZGltLmhlaWdodCwgd2lkdGggfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCBTaXppbmcuRGlzdHJpYnV0ZSk7XG5cblx0XHR0aGlzLl9zcGxpdFZpZXcuYWRkVmlldyh7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdGVsZW1lbnQ6IHRyZWVDb250YWluZXIsXG5cdFx0XHRtaW5pbXVtU2l6ZTogMTAwLFxuXHRcdFx0bWF4aW11bVNpemU6IE51bWJlci5NQVhfVkFMVUUsXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fZGltLmhlaWdodCkge1xuXHRcdFx0XHRcdHRoaXMuX3RyZWUubGF5b3V0KHRoaXMuX2RpbS5oZWlnaHQsIHdpZHRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIFNpemluZy5EaXN0cmlidXRlKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9zcGxpdFZpZXcub25EaWRTYXNoQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9kaW0ud2lkdGgpIHtcblx0XHRcdFx0dGhpcy5fbGF5b3V0SW5mby5yYXRpbyA9IHRoaXMuX3NwbGl0Vmlldy5nZXRWaWV3U2l6ZSgwKSAvIHRoaXMuX2RpbS53aWR0aDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyB1cGRhdGUgZWRpdG9yXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3RyZWUub25EaWRDaGFuZ2VGb2N1cyh0aGlzLl91cGRhdGVQcmV2aWV3LCB0aGlzKSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fZWRpdG9yLm9uTW91c2VEb3duKGUgPT4ge1xuXHRcdFx0Y29uc3QgeyBldmVudCwgdGFyZ2V0IH0gPSBlO1xuXHRcdFx0aWYgKGV2ZW50LmRldGFpbCAhPT0gMikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBbZm9jdXNdID0gdGhpcy5fdHJlZS5nZXRGb2N1cygpO1xuXHRcdFx0aWYgKCFmb2N1cykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiBmb2N1cy5pdGVtLnVyaSxcblx0XHRcdFx0b3B0aW9uczogeyBzZWxlY3Rpb246IHRhcmdldC5yYW5nZSEgfVxuXHRcdFx0fSk7XG5cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fdHJlZS5vbk1vdXNlRGJsQ2xpY2soZSA9PiB7XG5cdFx0XHRpZiAoZS50YXJnZXQgPT09IFRyZWVNb3VzZUV2ZW50VGFyZ2V0LlR3aXN0aWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5lbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdHJlc291cmNlOiBlLmVsZW1lbnQuaXRlbS51cmksXG5cdFx0XHRcdFx0b3B0aW9uczogeyBzZWxlY3Rpb246IGUuZWxlbWVudC5pdGVtLnNlbGVjdGlvblJhbmdlLCBwaW5uZWQ6IHRydWUgfVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fdHJlZS5vbkRpZENoYW5nZVNlbGVjdGlvbihlID0+IHtcblx0XHRcdGNvbnN0IFtlbGVtZW50XSA9IGUuZWxlbWVudHM7XG5cdFx0XHQvLyBkb24ndCBjbG9zZSBvbiBjbGlja1xuXHRcdFx0aWYgKGVsZW1lbnQgJiYgaXNLZXlib2FyZEV2ZW50KGUuYnJvd3NlckV2ZW50KSkge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogZWxlbWVudC5pdGVtLnVyaSxcblx0XHRcdFx0XHRvcHRpb25zOiB7IHNlbGVjdGlvbjogZWxlbWVudC5pdGVtLnNlbGVjdGlvblJhbmdlLCBwaW5uZWQ6IHRydWUgfVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVQcmV2aWV3KCkge1xuXHRcdGNvbnN0IFtlbGVtZW50XSA9IHRoaXMuX3RyZWUuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9wcmV2aWV3RGlzcG9zYWJsZS5jbGVhcigpO1xuXG5cdFx0Ly8gdXBkYXRlOiBlZGl0b3IgYW5kIGVkaXRvciBoaWdobGlnaHRzXG5cdFx0Y29uc3Qgb3B0aW9uczogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgPSB7XG5cdFx0XHRkZXNjcmlwdGlvbjogJ2NhbGwtaGllcmFyY2h5LWRlY29yYXRpb24nLFxuXHRcdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0XHRjbGFzc05hbWU6ICdjYWxsLWRlY29yYXRpb24nLFxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChwZWVrVmlldy5wZWVrVmlld0VkaXRvck1hdGNoSGlnaGxpZ2h0KSxcblx0XHRcdFx0cG9zaXRpb246IE92ZXJ2aWV3UnVsZXJMYW5lLkNlbnRlclxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0bGV0IHByZXZpZXdVcmk6IFVSSTtcblx0XHRpZiAodGhpcy5fZGlyZWN0aW9uID09PSBDYWxsSGllcmFyY2h5RGlyZWN0aW9uLkNhbGxzRnJvbSkge1xuXHRcdFx0Ly8gb3V0Z29pbmcgY2FsbHM6IHNob3cgY2FsbGVyIGFuZCBoaWdobGlnaHQgZm9jdXNlZCBjYWxsc1xuXHRcdFx0cHJldmlld1VyaSA9IGVsZW1lbnQucGFyZW50ID8gZWxlbWVudC5wYXJlbnQuaXRlbS51cmkgOiBlbGVtZW50Lm1vZGVsLnJvb3QudXJpO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGluY29taW5nIGNhbGxzOiBzaG93IGNhbGxlciBhbmQgaGlnaGxpZ2h0IGZvY3VzZWQgY2FsbHNcblx0XHRcdHByZXZpZXdVcmkgPSBlbGVtZW50Lml0ZW0udXJpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShwcmV2aWV3VXJpKTtcblx0XHR0aGlzLl9lZGl0b3Iuc2V0TW9kZWwodmFsdWUub2JqZWN0LnRleHRFZGl0b3JNb2RlbCk7XG5cblx0XHQvLyBzZXQgZGVjb3JhdGlvbnMgZm9yIGNhbGxlciByYW5nZXMgKGlmIGluIHRoZSBzYW1lIGZpbGUpXG5cdFx0Y29uc3QgZGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0bGV0IGZ1bGxSYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBsb2NhdGlvbnMgPSBlbGVtZW50LmxvY2F0aW9ucztcblx0XHRpZiAoIWxvY2F0aW9ucykge1xuXHRcdFx0bG9jYXRpb25zID0gW3sgdXJpOiBlbGVtZW50Lml0ZW0udXJpLCByYW5nZTogZWxlbWVudC5pdGVtLnNlbGVjdGlvblJhbmdlIH1dO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGxvYyBvZiBsb2NhdGlvbnMpIHtcblx0XHRcdGlmIChsb2MudXJpLnRvU3RyaW5nKCkgPT09IHByZXZpZXdVcmkudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRkZWNvcmF0aW9ucy5wdXNoKHsgcmFuZ2U6IGxvYy5yYW5nZSwgb3B0aW9ucyB9KTtcblx0XHRcdFx0ZnVsbFJhbmdlID0gIWZ1bGxSYW5nZSA/IGxvYy5yYW5nZSA6IFJhbmdlLnBsdXNSYW5nZShsb2MucmFuZ2UsIGZ1bGxSYW5nZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChmdWxsUmFuZ2UpIHtcblx0XHRcdHRoaXMuX2VkaXRvci5yZXZlYWxSYW5nZUluQ2VudGVyKGZ1bGxSYW5nZSwgU2Nyb2xsVHlwZS5JbW1lZGlhdGUpO1xuXHRcdFx0Y29uc3QgZGVjb3JhdGlvbnNDb2xsZWN0aW9uID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbihkZWNvcmF0aW9ucyk7XG5cdFx0XHR0aGlzLl9wcmV2aWV3RGlzcG9zYWJsZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGRlY29yYXRpb25zQ29sbGVjdGlvbi5jbGVhcigpKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3ByZXZpZXdEaXNwb3NhYmxlLmFkZCh2YWx1ZSk7XG5cblx0XHQvLyB1cGRhdGU6IHRpdGxlXG5cdFx0Y29uc3QgdGl0bGUgPSB0aGlzLl9kaXJlY3Rpb24gPT09IENhbGxIaWVyYXJjaHlEaXJlY3Rpb24uQ2FsbHNGcm9tXG5cdFx0XHQ/IGxvY2FsaXplKCdjYWxsRnJvbScsIFwiQ2FsbHMgZnJvbSAnezB9J1wiLCBlbGVtZW50Lm1vZGVsLnJvb3QubmFtZSlcblx0XHRcdDogbG9jYWxpemUoJ2NhbGxzVG8nLCBcIkNhbGxlcnMgb2YgJ3swfSdcIiwgZWxlbWVudC5tb2RlbC5yb290Lm5hbWUpO1xuXHRcdHRoaXMuc2V0VGl0bGUodGl0bGUpO1xuXHR9XG5cblx0c2hvd0xvYWRpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGFyZW50LmRhdGFzZXRbJ3N0YXRlJ10gPSBTdGF0ZS5Mb2FkaW5nO1xuXHRcdHRoaXMuc2V0VGl0bGUobG9jYWxpemUoJ3RpdGxlLmxvYWRpbmcnLCBcIkxvYWRpbmcuLi5cIikpO1xuXHRcdHRoaXMuX3Nob3coKTtcblx0fVxuXG5cdHNob3dNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3BhcmVudC5kYXRhc2V0WydzdGF0ZSddID0gU3RhdGUuTWVzc2FnZTtcblx0XHR0aGlzLnNldFRpdGxlKCcnKTtcblx0XHR0aGlzLnNldE1ldGFUaXRsZSgnJyk7XG5cdFx0dGhpcy5fbWVzc2FnZS5pbm5lclRleHQgPSBtZXNzYWdlO1xuXHRcdHRoaXMuX3Nob3coKTtcblx0XHR0aGlzLl9tZXNzYWdlLmZvY3VzKCk7XG5cdH1cblxuXHRhc3luYyBzaG93TW9kZWwobW9kZWw6IENhbGxIaWVyYXJjaHlNb2RlbCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0dGhpcy5fc2hvdygpO1xuXHRcdGNvbnN0IHZpZXdTdGF0ZSA9IHRoaXMuX3RyZWVWaWV3U3RhdGVzLmdldCh0aGlzLl9kaXJlY3Rpb24pO1xuXG5cdFx0YXdhaXQgdGhpcy5fdHJlZS5zZXRJbnB1dChtb2RlbCwgdmlld1N0YXRlKTtcblxuXHRcdGNvbnN0IHJvb3QgPSA8SVRyZWVOb2RlPGNhbGxIVHJlZS5DYWxsLCBGdXp6eVNjb3JlPj50aGlzLl90cmVlLmdldE5vZGUobW9kZWwpLmNoaWxkcmVuWzBdO1xuXHRcdGF3YWl0IHRoaXMuX3RyZWUuZXhwYW5kKHJvb3QuZWxlbWVudCk7XG5cblx0XHRpZiAocm9vdC5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vXG5cdFx0XHR0aGlzLnNob3dNZXNzYWdlKHRoaXMuX2RpcmVjdGlvbiA9PT0gQ2FsbEhpZXJhcmNoeURpcmVjdGlvbi5DYWxsc0Zyb21cblx0XHRcdFx0PyBsb2NhbGl6ZSgnZW1wdC5jYWxsc0Zyb20nLCBcIk5vIGNhbGxzIGZyb20gJ3swfSdcIiwgbW9kZWwucm9vdC5uYW1lKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdlbXB0LmNhbGxzVG8nLCBcIk5vIGNhbGxlcnMgb2YgJ3swfSdcIiwgbW9kZWwucm9vdC5uYW1lKSk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcGFyZW50LmRhdGFzZXRbJ3N0YXRlJ10gPSBTdGF0ZS5EYXRhO1xuXHRcdFx0aWYgKCF2aWV3U3RhdGUgfHwgdGhpcy5fdHJlZS5nZXRGb2N1cygpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl90cmVlLnNldEZvY3VzKFtyb290LmNoaWxkcmVuWzBdLmVsZW1lbnRdKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3RyZWUuZG9tRm9jdXMoKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVByZXZpZXcoKTtcblx0XHR9XG5cdH1cblxuXHRnZXRNb2RlbCgpOiBDYWxsSGllcmFyY2h5TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90cmVlLmdldElucHV0KCk7XG5cdH1cblxuXHRnZXRGb2N1c2VkKCk6IGNhbGxIVHJlZS5DYWxsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZS5nZXRGb2N1cygpWzBdO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlRGlyZWN0aW9uKG5ld0RpcmVjdGlvbjogQ2FsbEhpZXJhcmNoeURpcmVjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fdHJlZS5nZXRJbnB1dCgpO1xuXHRcdGlmIChtb2RlbCAmJiBuZXdEaXJlY3Rpb24gIT09IHRoaXMuX2RpcmVjdGlvbikge1xuXHRcdFx0dGhpcy5fdHJlZVZpZXdTdGF0ZXMuc2V0KHRoaXMuX2RpcmVjdGlvbiwgdGhpcy5fdHJlZS5nZXRWaWV3U3RhdGUoKSk7XG5cdFx0XHR0aGlzLl9kaXJlY3Rpb24gPSBuZXdEaXJlY3Rpb247XG5cdFx0XHRhd2FpdCB0aGlzLnNob3dNb2RlbChtb2RlbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdygpIHtcblx0XHRpZiAoIXRoaXMuX2lzU2hvd2luZykge1xuXHRcdFx0dGhpcy5lZGl0b3IucmV2ZWFsTGluZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQodGhpcy5fd2hlcmUubGluZU51bWJlciwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdFx0c3VwZXIuc2hvdyhSYW5nZS5mcm9tUG9zaXRpb25zKHRoaXMuX3doZXJlKSwgdGhpcy5fbGF5b3V0SW5mby5oZWlnaHQpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb25XaWR0aCh3aWR0aDogbnVtYmVyKSB7XG5cdFx0aWYgKHRoaXMuX2RpbSkge1xuXHRcdFx0dGhpcy5fZG9MYXlvdXRCb2R5KHRoaXMuX2RpbS5oZWlnaHQsIHdpZHRoKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2RvTGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaW0uaGVpZ2h0ICE9PSBoZWlnaHQgfHwgdGhpcy5fZGltLndpZHRoICE9PSB3aWR0aCkge1xuXHRcdFx0c3VwZXIuX2RvTGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHRcdHRoaXMuX2RpbSA9IG5ldyBEaW1lbnNpb24od2lkdGgsIGhlaWdodCk7XG5cdFx0XHR0aGlzLl9sYXlvdXRJbmZvLmhlaWdodCA9IHRoaXMuX3ZpZXdab25lID8gdGhpcy5fdmlld1pvbmUuaGVpZ2h0SW5MaW5lcyA6IHRoaXMuX2xheW91dEluZm8uaGVpZ2h0O1xuXHRcdFx0dGhpcy5fc3BsaXRWaWV3LmxheW91dCh3aWR0aCk7XG5cdFx0XHR0aGlzLl9zcGxpdFZpZXcucmVzaXplVmlldygwLCB3aWR0aCAqIHRoaXMuX2xheW91dEluZm8ucmF0aW8pO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxjQUFjO0FBRTFCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsOEJBQWtEO0FBQzNELFNBQVMsOEJBQThEO0FBRXZFLFlBQVksZUFBZTtBQUUzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQjtBQUMzQixTQUFpQixhQUFhO0FBQzlCLFNBQVMsV0FBVyxhQUFhLGNBQWM7QUFDL0MsU0FBUyxXQUFXLHVCQUF1QjtBQUMzQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxjQUFjLHVCQUF1QjtBQUM5QyxTQUFTLHdCQUF3RSx5QkFBeUI7QUFDMUcsU0FBUyxrQkFBa0IscUJBQWtDO0FBRTdELFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsYUFBYTtBQUN0QixTQUFTLDRCQUF1QztBQUVoRCxTQUFTLFFBQVEsb0JBQW9CO0FBQ3JDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0JBQStC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
