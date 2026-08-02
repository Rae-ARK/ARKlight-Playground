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
import "./media/typeHierarchy.css";
import { Dimension, isKeyboardEvent } from "../../../../base/browser/dom.js";
import { Orientation, Sizing, SplitView } from "../../../../base/browser/ui/splitview/splitview.js";
import { TreeMouseEventTarget } from "../../../../base/browser/ui/tree/tree.js";
import { Color } from "../../../../base/common/color.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { TrackedRangeStickiness, OverviewRulerLane } from "../../../../editor/common/model.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import * as peekView from "../../../../editor/contrib/peekView/browser/peekView.js";
import { localize } from "../../../../nls.js";
import { getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IThemeService, themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import * as typeHTree from "./typeHierarchyTree.js";
import { TypeHierarchyDirection } from "../common/typeHierarchy.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
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
    storageService.store("typeHierarchyPeekLayout", JSON.stringify(info), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  static retrieve(storageService) {
    const value = storageService.get("typeHierarchyPeekLayout", StorageScope.PROFILE, "{}");
    const defaultInfo = { ratio: 0.7, height: 17 };
    try {
      return { ...defaultInfo, ...JSON.parse(value) };
    } catch {
      return defaultInfo;
    }
  }
}
class TypeHierarchyTree extends WorkbenchAsyncDataTree {
}
let TypeHierarchyTreePeekWidget = class extends peekView.PeekViewWidget {
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
    const menu = this._menuService.createMenu(TypeHierarchyTreePeekWidget.TitleMenu, this._contextKeyService);
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
    parent.classList.add("type-hierarchy");
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
      sorter: new typeHTree.Sorter(),
      accessibilityProvider: new typeHTree.AccessibilityProvider(() => this._direction),
      identityProvider: new typeHTree.IdentityProvider(() => this._direction),
      expandOnlyOnTwistieClick: true,
      overrideStyles: {
        listBackground: peekView.peekViewResultsBackground
      }
    };
    this._tree = this._instantiationService.createInstance(
      TypeHierarchyTree,
      "TypeHierarchyPeek",
      treeContainer,
      new typeHTree.VirtualDelegate(),
      [this._instantiationService.createInstance(typeHTree.TypeRenderer)],
      this._instantiationService.createInstance(typeHTree.DataSource, () => this._direction),
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
      description: "type-hierarchy-decoration",
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      className: "type-decoration",
      overviewRuler: {
        color: themeColorFromId(peekView.peekViewEditorMatchHighlight),
        position: OverviewRulerLane.Center
      }
    };
    let previewUri;
    if (this._direction === TypeHierarchyDirection.Supertypes) {
      previewUri = element.parent ? element.parent.item.uri : element.model.root.uri;
    } else {
      previewUri = element.item.uri;
    }
    const value = await this._textModelService.createModelReference(previewUri);
    this._editor.setModel(value.object.textEditorModel);
    const decorations = [];
    let fullRange;
    const loc = { uri: element.item.uri, range: element.item.selectionRange };
    if (loc.uri.toString() === previewUri.toString()) {
      decorations.push({ range: loc.range, options });
      fullRange = !fullRange ? loc.range : Range.plusRange(loc.range, fullRange);
    }
    if (fullRange) {
      this._editor.revealRangeInCenter(fullRange, ScrollType.Immediate);
      const decorationsCollection = this._editor.createDecorationsCollection(decorations);
      this._previewDisposable.add(toDisposable(() => decorationsCollection.clear()));
    }
    this._previewDisposable.add(value);
    const title = this._direction === TypeHierarchyDirection.Supertypes ? localize("supertypes", "Supertypes of '{0}'", element.model.root.name) : localize("subtypes", "Subtypes of '{0}'", element.model.root.name);
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
      this.showMessage(this._direction === TypeHierarchyDirection.Supertypes ? localize("empt.supertypes", "No supertypes of '{0}'", model.root.name) : localize("empt.subtypes", "No subtypes of '{0}'", model.root.name));
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
TypeHierarchyTreePeekWidget.TitleMenu = new MenuId("typehierarchy/title");
TypeHierarchyTreePeekWidget = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, peekView.IPeekViewService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, ITextModelService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IInstantiationService)
], TypeHierarchyTreePeekWidget);
export {
  TypeHierarchyTreePeekWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3R5cGVIaWVyYXJjaHkvYnJvd3Nlci90eXBlSGllcmFyY2h5UGVlay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS90eXBlSGllcmFyY2h5LmNzcyc7XG5pbXBvcnQgeyBEaW1lbnNpb24sIGlzS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgT3JpZW50YXRpb24sIFNpemluZywgU3BsaXRWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hc3luY0RhdGFUcmVlLmpzJztcbmltcG9ydCB7IElUcmVlTm9kZSwgVHJlZU1vdXNlRXZlbnRUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2VtYmVkZGVkQ29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElNb2RlbERlY29yYXRpb25PcHRpb25zLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLCBJTW9kZWxEZWx0YURlY29yYXRpb24sIE92ZXJ2aWV3UnVsZXJMYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCAqIGFzIHBlZWtWaWV3IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3BlZWtWaWV3L2Jyb3dzZXIvcGVla1ZpZXcuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0RmxhdEFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQXN5bmNEYXRhVHJlZU9wdGlvbnMsIFdvcmtiZW5jaEFzeW5jRGF0YVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lLCBJVGhlbWVTZXJ2aWNlLCB0aGVtZUNvbG9yRnJvbUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlSFRyZWUgZnJvbSAnLi90eXBlSGllcmFyY2h5VHJlZS5qcyc7XG5pbXBvcnQgeyBUeXBlSGllcmFyY2h5RGlyZWN0aW9uLCBUeXBlSGllcmFyY2h5TW9kZWwgfSBmcm9tICcuLi9jb21tb24vdHlwZUhpZXJhcmNoeS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5cbi8vIFRvZG86IGNvcGllZCBmcm9tIGNhbGwgaGllcmFyY2h5LCB0byBleHRyYWN0XG5jb25zdCBlbnVtIFN0YXRlIHtcblx0TG9hZGluZyA9ICdsb2FkaW5nJyxcblx0TWVzc2FnZSA9ICdtZXNzYWdlJyxcblx0RGF0YSA9ICdkYXRhJ1xufVxuXG5jbGFzcyBMYXlvdXRJbmZvIHtcblxuXHRzdGF0aWMgc3RvcmUoaW5mbzogTGF5b3V0SW5mbywgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSk6IHZvaWQge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCd0eXBlSGllcmFyY2h5UGVla0xheW91dCcsIEpTT04uc3RyaW5naWZ5KGluZm8pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHN0YXRpYyByZXRyaWV2ZShzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKTogTGF5b3V0SW5mbyB7XG5cdFx0Y29uc3QgdmFsdWUgPSBzdG9yYWdlU2VydmljZS5nZXQoJ3R5cGVIaWVyYXJjaHlQZWVrTGF5b3V0JywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICd7fScpO1xuXHRcdGNvbnN0IGRlZmF1bHRJbmZvOiBMYXlvdXRJbmZvID0geyByYXRpbzogMC43LCBoZWlnaHQ6IDE3IH07XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiB7IC4uLmRlZmF1bHRJbmZvLCAuLi5KU09OLnBhcnNlKHZhbHVlKSB9O1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGRlZmF1bHRJbmZvO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByYXRpbzogbnVtYmVyLFxuXHRcdHB1YmxpYyBoZWlnaHQ6IG51bWJlclxuXHQpIHsgfVxufVxuXG5jbGFzcyBUeXBlSGllcmFyY2h5VHJlZSBleHRlbmRzIFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8VHlwZUhpZXJhcmNoeU1vZGVsLCB0eXBlSFRyZWUuVHlwZSwgRnV6enlTY29yZT4geyB9XG5cbmV4cG9ydCBjbGFzcyBUeXBlSGllcmFyY2h5VHJlZVBlZWtXaWRnZXQgZXh0ZW5kcyBwZWVrVmlldy5QZWVrVmlld1dpZGdldCB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRpdGxlTWVudSA9IG5ldyBNZW51SWQoJ3R5cGVoaWVyYXJjaHkvdGl0bGUnKTtcblxuXHRwcml2YXRlIF9wYXJlbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfbWVzc2FnZSE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9zcGxpdFZpZXchOiBTcGxpdFZpZXc7XG5cdHByaXZhdGUgX3RyZWUhOiBUeXBlSGllcmFyY2h5VHJlZTtcblx0cHJpdmF0ZSBfdHJlZVZpZXdTdGF0ZXMgPSBuZXcgTWFwPFR5cGVIaWVyYXJjaHlEaXJlY3Rpb24sIElBc3luY0RhdGFUcmVlVmlld1N0YXRlPigpO1xuXHRwcml2YXRlIF9lZGl0b3IhOiBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQ7XG5cdHByaXZhdGUgX2RpbSE6IERpbWVuc2lvbjtcblx0cHJpdmF0ZSBfbGF5b3V0SW5mbyE6IExheW91dEluZm87XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJldmlld0Rpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93aGVyZTogSVBvc2l0aW9uLFxuXHRcdHByaXZhdGUgX2RpcmVjdGlvbjogVHlwZUhpZXJhcmNoeURpcmVjdGlvbixcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QHBlZWtWaWV3LklQZWVrVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGVla1ZpZXdTZXJ2aWNlOiBwZWVrVmlldy5JUGVla1ZpZXdTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3IsIHsgc2hvd0ZyYW1lOiB0cnVlLCBzaG93QXJyb3c6IHRydWUsIGlzUmVzaXplYWJsZTogdHJ1ZSwgaXNBY2Nlc3NpYmxlOiB0cnVlIH0sIF9pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0XHR0aGlzLl9wZWVrVmlld1NlcnZpY2UuYWRkRXhjbHVzaXZlV2lkZ2V0KGVkaXRvciwgdGhpcyk7XG5cdFx0dGhpcy5fYXBwbHlUaGVtZSh0aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSh0aGlzLl9hcHBseVRoZW1lLCB0aGlzKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3ByZXZpZXdEaXNwb3NhYmxlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0TGF5b3V0SW5mby5zdG9yZSh0aGlzLl9sYXlvdXRJbmZvLCB0aGlzLl9zdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5fc3BsaXRWaWV3LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl90cmVlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9lZGl0b3IuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldCBkaXJlY3Rpb24oKTogVHlwZUhpZXJhcmNoeURpcmVjdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2RpcmVjdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5VGhlbWUodGhlbWU6IElDb2xvclRoZW1lKSB7XG5cdFx0Y29uc3QgYm9yZGVyQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihwZWVrVmlldy5wZWVrVmlld0JvcmRlcikgfHwgQ29sb3IudHJhbnNwYXJlbnQ7XG5cdFx0dGhpcy5zdHlsZSh7XG5cdFx0XHRhcnJvd0NvbG9yOiBib3JkZXJDb2xvcixcblx0XHRcdGZyYW1lQ29sb3I6IGJvcmRlckNvbG9yLFxuXHRcdFx0aGVhZGVyQmFja2dyb3VuZENvbG9yOiB0aGVtZS5nZXRDb2xvcihwZWVrVmlldy5wZWVrVmlld1RpdGxlQmFja2dyb3VuZCkgfHwgQ29sb3IudHJhbnNwYXJlbnQsXG5cdFx0XHRwcmltYXJ5SGVhZGluZ0NvbG9yOiB0aGVtZS5nZXRDb2xvcihwZWVrVmlldy5wZWVrVmlld1RpdGxlRm9yZWdyb3VuZCksXG5cdFx0XHRzZWNvbmRhcnlIZWFkaW5nQ29sb3I6IHRoZW1lLmdldENvbG9yKHBlZWtWaWV3LnBlZWtWaWV3VGl0bGVJbmZvRm9yZWdyb3VuZClcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZmlsbEhlYWQoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLl9maWxsSGVhZChjb250YWluZXIsIHRydWUpO1xuXG5cdFx0Y29uc3QgbWVudSA9IHRoaXMuX21lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoVHlwZUhpZXJhcmNoeVRyZWVQZWVrV2lkZ2V0LlRpdGxlTWVudSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IHVwZGF0ZVRvb2xiYXIgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gZ2V0RmxhdEFjdGlvbkJhckFjdGlvbnMobWVudS5nZXRBY3Rpb25zKCkpO1xuXHRcdFx0dGhpcy5fYWN0aW9uYmFyV2lkZ2V0IS5jbGVhcigpO1xuXHRcdFx0dGhpcy5fYWN0aW9uYmFyV2lkZ2V0IS5wdXNoKGFjdGlvbnMsIHsgbGFiZWw6IGZhbHNlLCBpY29uOiB0cnVlIH0pO1xuXHRcdH07XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKG1lbnUpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChtZW51Lm9uRGlkQ2hhbmdlKHVwZGF0ZVRvb2xiYXIpKTtcblx0XHR1cGRhdGVUb29sYmFyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2ZpbGxCb2R5KHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblxuXHRcdHRoaXMuX2xheW91dEluZm8gPSBMYXlvdXRJbmZvLnJldHJpZXZlKHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLl9kaW0gPSBuZXcgRGltZW5zaW9uKDAsIDApO1xuXG5cdFx0dGhpcy5fcGFyZW50ID0gcGFyZW50O1xuXHRcdHBhcmVudC5jbGFzc0xpc3QuYWRkKCd0eXBlLWhpZXJhcmNoeScpO1xuXG5cdFx0Y29uc3QgbWVzc2FnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdG1lc3NhZ2UuY2xhc3NMaXN0LmFkZCgnbWVzc2FnZScpO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZChtZXNzYWdlKTtcblx0XHR0aGlzLl9tZXNzYWdlID0gbWVzc2FnZTtcblx0XHR0aGlzLl9tZXNzYWdlLnRhYkluZGV4ID0gMDtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdyZXN1bHRzJyk7XG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9zcGxpdFZpZXcgPSBuZXcgU3BsaXRWaWV3KGNvbnRhaW5lciwgeyBvcmllbnRhdGlvbjogT3JpZW50YXRpb24uSE9SSVpPTlRBTCB9KTtcblxuXHRcdC8vIGVkaXRvciBzdHVmZlxuXHRcdGNvbnN0IGVkaXRvckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGVkaXRvckNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdlZGl0b3InKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZWRpdG9yQ29udGFpbmVyKTtcblx0XHRjb25zdCBlZGl0b3JPcHRpb25zOiBJRWRpdG9yT3B0aW9ucyA9IHtcblx0XHRcdHNjcm9sbEJleW9uZExhc3RMaW5lOiBmYWxzZSxcblx0XHRcdHNjcm9sbGJhcjoge1xuXHRcdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhclNpemU6IDE0LFxuXHRcdFx0XHRob3Jpem9udGFsOiAnYXV0bycsXG5cdFx0XHRcdHVzZVNoYWRvd3M6IHRydWUsXG5cdFx0XHRcdHZlcnRpY2FsSGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdFx0aG9yaXpvbnRhbEhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdG92ZXJ2aWV3UnVsZXJMYW5lczogMixcblx0XHRcdGZpeGVkT3ZlcmZsb3dXaWRnZXRzOiB0cnVlLFxuXHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRlbmFibGVkOiBmYWxzZVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fZWRpdG9yID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0XHRlZGl0b3JDb250YWluZXIsXG5cdFx0XHRlZGl0b3JPcHRpb25zLFxuXHRcdFx0e30sXG5cdFx0XHR0aGlzLmVkaXRvclxuXHRcdCk7XG5cblx0XHQvLyB0cmVlIHN0dWZmXG5cdFx0Y29uc3QgdHJlZUNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRyZWVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgndHJlZScpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0cmVlQ29udGFpbmVyKTtcblx0XHRjb25zdCBvcHRpb25zOiBJV29ya2JlbmNoQXN5bmNEYXRhVHJlZU9wdGlvbnM8dHlwZUhUcmVlLlR5cGUsIEZ1enp5U2NvcmU+ID0ge1xuXHRcdFx0c29ydGVyOiBuZXcgdHlwZUhUcmVlLlNvcnRlcigpLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgdHlwZUhUcmVlLkFjY2Vzc2liaWxpdHlQcm92aWRlcigoKSA9PiB0aGlzLl9kaXJlY3Rpb24pLFxuXHRcdFx0aWRlbnRpdHlQcm92aWRlcjogbmV3IHR5cGVIVHJlZS5JZGVudGl0eVByb3ZpZGVyKCgpID0+IHRoaXMuX2RpcmVjdGlvbiksXG5cdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s6IHRydWUsXG5cdFx0XHRvdmVycmlkZVN0eWxlczoge1xuXHRcdFx0XHRsaXN0QmFja2dyb3VuZDogcGVla1ZpZXcucGVla1ZpZXdSZXN1bHRzQmFja2dyb3VuZFxuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fdHJlZSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0VHlwZUhpZXJhcmNoeVRyZWUsXG5cdFx0XHQnVHlwZUhpZXJhcmNoeVBlZWsnLFxuXHRcdFx0dHJlZUNvbnRhaW5lcixcblx0XHRcdG5ldyB0eXBlSFRyZWUuVmlydHVhbERlbGVnYXRlKCksXG5cdFx0XHRbdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UodHlwZUhUcmVlLlR5cGVSZW5kZXJlcildLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UodHlwZUhUcmVlLkRhdGFTb3VyY2UsICgpID0+IHRoaXMuX2RpcmVjdGlvbiksXG5cdFx0XHRvcHRpb25zXG5cdFx0KTtcblxuXHRcdC8vIHNwbGl0IHN0dWZmXG5cdFx0dGhpcy5fc3BsaXRWaWV3LmFkZFZpZXcoe1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRlbGVtZW50OiBlZGl0b3JDb250YWluZXIsXG5cdFx0XHRtaW5pbXVtU2l6ZTogMjAwLFxuXHRcdFx0bWF4aW11bVNpemU6IE51bWJlci5NQVhfVkFMVUUsXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fZGltLmhlaWdodCkge1xuXHRcdFx0XHRcdHRoaXMuX2VkaXRvci5sYXlvdXQoeyBoZWlnaHQ6IHRoaXMuX2RpbS5oZWlnaHQsIHdpZHRoIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSwgU2l6aW5nLkRpc3RyaWJ1dGUpO1xuXG5cdFx0dGhpcy5fc3BsaXRWaWV3LmFkZFZpZXcoe1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRlbGVtZW50OiB0cmVlQ29udGFpbmVyLFxuXHRcdFx0bWluaW11bVNpemU6IDEwMCxcblx0XHRcdG1heGltdW1TaXplOiBOdW1iZXIuTUFYX1ZBTFVFLFxuXHRcdFx0bGF5b3V0OiAod2lkdGgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2RpbS5oZWlnaHQpIHtcblx0XHRcdFx0XHR0aGlzLl90cmVlLmxheW91dCh0aGlzLl9kaW0uaGVpZ2h0LCB3aWR0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCBTaXppbmcuRGlzdHJpYnV0ZSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fc3BsaXRWaWV3Lm9uRGlkU2FzaENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZGltLndpZHRoKSB7XG5cdFx0XHRcdHRoaXMuX2xheW91dEluZm8ucmF0aW8gPSB0aGlzLl9zcGxpdFZpZXcuZ2V0Vmlld1NpemUoMCkgLyB0aGlzLl9kaW0ud2lkdGg7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gdXBkYXRlIGVkaXRvclxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl90cmVlLm9uRGlkQ2hhbmdlRm9jdXModGhpcy5fdXBkYXRlUHJldmlldywgdGhpcykpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2VkaXRvci5vbk1vdXNlRG93bihlID0+IHtcblx0XHRcdGNvbnN0IHsgZXZlbnQsIHRhcmdldCB9ID0gZTtcblx0XHRcdGlmIChldmVudC5kZXRhaWwgIT09IDIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgW2ZvY3VzXSA9IHRoaXMuX3RyZWUuZ2V0Rm9jdXMoKTtcblx0XHRcdGlmICghZm9jdXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZTogZm9jdXMuaXRlbS51cmksXG5cdFx0XHRcdG9wdGlvbnM6IHsgc2VsZWN0aW9uOiB0YXJnZXQucmFuZ2UhIH1cblx0XHRcdH0pO1xuXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3RyZWUub25Nb3VzZURibENsaWNrKGUgPT4ge1xuXHRcdFx0aWYgKGUudGFyZ2V0ID09PSBUcmVlTW91c2VFdmVudFRhcmdldC5Ud2lzdGllKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogZS5lbGVtZW50Lml0ZW0udXJpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHsgc2VsZWN0aW9uOiBlLmVsZW1lbnQuaXRlbS5zZWxlY3Rpb25SYW5nZSwgcGlubmVkOiB0cnVlIH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3RyZWUub25EaWRDaGFuZ2VTZWxlY3Rpb24oZSA9PiB7XG5cdFx0XHRjb25zdCBbZWxlbWVudF0gPSBlLmVsZW1lbnRzO1xuXHRcdFx0Ly8gZG9uJ3QgY2xvc2Ugb24gY2xpY2tcblx0XHRcdGlmIChlbGVtZW50ICYmIGlzS2V5Ym9hcmRFdmVudChlLmJyb3dzZXJFdmVudCkpIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IGVsZW1lbnQuaXRlbS51cmksXG5cdFx0XHRcdFx0b3B0aW9uczogeyBzZWxlY3Rpb246IGVsZW1lbnQuaXRlbS5zZWxlY3Rpb25SYW5nZSwgcGlubmVkOiB0cnVlIH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlUHJldmlldygpIHtcblx0XHRjb25zdCBbZWxlbWVudF0gPSB0aGlzLl90cmVlLmdldEZvY3VzKCk7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcHJldmlld0Rpc3Bvc2FibGUuY2xlYXIoKTtcblxuXHRcdC8vIHVwZGF0ZTogZWRpdG9yIGFuZCBlZGl0b3IgaGlnaGxpZ2h0c1xuXHRcdGNvbnN0IG9wdGlvbnM6IElNb2RlbERlY29yYXRpb25PcHRpb25zID0ge1xuXHRcdFx0ZGVzY3JpcHRpb246ICd0eXBlLWhpZXJhcmNoeS1kZWNvcmF0aW9uJyxcblx0XHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdFx0Y2xhc3NOYW1lOiAndHlwZS1kZWNvcmF0aW9uJyxcblx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0Y29sb3I6IHRoZW1lQ29sb3JGcm9tSWQocGVla1ZpZXcucGVla1ZpZXdFZGl0b3JNYXRjaEhpZ2hsaWdodCksXG5cdFx0XHRcdHBvc2l0aW9uOiBPdmVydmlld1J1bGVyTGFuZS5DZW50ZXJcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGxldCBwcmV2aWV3VXJpOiBVUkk7XG5cdFx0aWYgKHRoaXMuX2RpcmVjdGlvbiA9PT0gVHlwZUhpZXJhcmNoeURpcmVjdGlvbi5TdXBlcnR5cGVzKSB7XG5cdFx0XHQvLyBzdXBlcnR5cGVzOiBzaG93IHN1cGVyIHR5cGVzIGFuZCBoaWdobGlnaHQgZm9jdXNlZCB0eXBlXG5cdFx0XHRwcmV2aWV3VXJpID0gZWxlbWVudC5wYXJlbnQgPyBlbGVtZW50LnBhcmVudC5pdGVtLnVyaSA6IGVsZW1lbnQubW9kZWwucm9vdC51cmk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHN1YnR5cGVzOiBzaG93IHN1YiB0eXBlcyBhbmQgaGlnaGxpZ2h0IGZvY3VzZWQgdHlwZVxuXHRcdFx0cHJldmlld1VyaSA9IGVsZW1lbnQuaXRlbS51cmk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl90ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHByZXZpZXdVcmkpO1xuXHRcdHRoaXMuX2VkaXRvci5zZXRNb2RlbCh2YWx1ZS5vYmplY3QudGV4dEVkaXRvck1vZGVsKTtcblxuXHRcdC8vIHNldCBkZWNvcmF0aW9ucyBmb3IgdHlwZSByYW5nZXNcblx0XHRjb25zdCBkZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRsZXQgZnVsbFJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbG9jID0geyB1cmk6IGVsZW1lbnQuaXRlbS51cmksIHJhbmdlOiBlbGVtZW50Lml0ZW0uc2VsZWN0aW9uUmFuZ2UgfTtcblx0XHRpZiAobG9jLnVyaS50b1N0cmluZygpID09PSBwcmV2aWV3VXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdGRlY29yYXRpb25zLnB1c2goeyByYW5nZTogbG9jLnJhbmdlLCBvcHRpb25zIH0pO1xuXHRcdFx0ZnVsbFJhbmdlID0gIWZ1bGxSYW5nZSA/IGxvYy5yYW5nZSA6IFJhbmdlLnBsdXNSYW5nZShsb2MucmFuZ2UsIGZ1bGxSYW5nZSk7XG5cdFx0fVxuXHRcdGlmIChmdWxsUmFuZ2UpIHtcblx0XHRcdHRoaXMuX2VkaXRvci5yZXZlYWxSYW5nZUluQ2VudGVyKGZ1bGxSYW5nZSwgU2Nyb2xsVHlwZS5JbW1lZGlhdGUpO1xuXHRcdFx0Y29uc3QgZGVjb3JhdGlvbnNDb2xsZWN0aW9uID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbihkZWNvcmF0aW9ucyk7XG5cdFx0XHR0aGlzLl9wcmV2aWV3RGlzcG9zYWJsZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGRlY29yYXRpb25zQ29sbGVjdGlvbi5jbGVhcigpKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3ByZXZpZXdEaXNwb3NhYmxlLmFkZCh2YWx1ZSk7XG5cblx0XHQvLyB1cGRhdGU6IHRpdGxlXG5cdFx0Y29uc3QgdGl0bGUgPSB0aGlzLl9kaXJlY3Rpb24gPT09IFR5cGVIaWVyYXJjaHlEaXJlY3Rpb24uU3VwZXJ0eXBlc1xuXHRcdFx0PyBsb2NhbGl6ZSgnc3VwZXJ0eXBlcycsIFwiU3VwZXJ0eXBlcyBvZiAnezB9J1wiLCBlbGVtZW50Lm1vZGVsLnJvb3QubmFtZSlcblx0XHRcdDogbG9jYWxpemUoJ3N1YnR5cGVzJywgXCJTdWJ0eXBlcyBvZiAnezB9J1wiLCBlbGVtZW50Lm1vZGVsLnJvb3QubmFtZSk7XG5cdFx0dGhpcy5zZXRUaXRsZSh0aXRsZSk7XG5cdH1cblxuXHRzaG93TG9hZGluZygpOiB2b2lkIHtcblx0XHR0aGlzLl9wYXJlbnQuZGF0YXNldFsnc3RhdGUnXSA9IFN0YXRlLkxvYWRpbmc7XG5cdFx0dGhpcy5zZXRUaXRsZShsb2NhbGl6ZSgndGl0bGUubG9hZGluZycsIFwiTG9hZGluZy4uLlwiKSk7XG5cdFx0dGhpcy5fc2hvdygpO1xuXHR9XG5cblx0c2hvd01lc3NhZ2UobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcGFyZW50LmRhdGFzZXRbJ3N0YXRlJ10gPSBTdGF0ZS5NZXNzYWdlO1xuXHRcdHRoaXMuc2V0VGl0bGUoJycpO1xuXHRcdHRoaXMuc2V0TWV0YVRpdGxlKCcnKTtcblx0XHR0aGlzLl9tZXNzYWdlLmlubmVyVGV4dCA9IG1lc3NhZ2U7XG5cdFx0dGhpcy5fc2hvdygpO1xuXHRcdHRoaXMuX21lc3NhZ2UuZm9jdXMoKTtcblx0fVxuXG5cdGFzeW5jIHNob3dNb2RlbChtb2RlbDogVHlwZUhpZXJhcmNoeU1vZGVsKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHR0aGlzLl9zaG93KCk7XG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gdGhpcy5fdHJlZVZpZXdTdGF0ZXMuZ2V0KHRoaXMuX2RpcmVjdGlvbik7XG5cblx0XHRhd2FpdCB0aGlzLl90cmVlLnNldElucHV0KG1vZGVsLCB2aWV3U3RhdGUpO1xuXG5cdFx0Y29uc3Qgcm9vdCA9IDxJVHJlZU5vZGU8dHlwZUhUcmVlLlR5cGUsIEZ1enp5U2NvcmU+PnRoaXMuX3RyZWUuZ2V0Tm9kZShtb2RlbCkuY2hpbGRyZW5bMF07XG5cdFx0YXdhaXQgdGhpcy5fdHJlZS5leHBhbmQocm9vdC5lbGVtZW50KTtcblxuXHRcdGlmIChyb290LmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5zaG93TWVzc2FnZSh0aGlzLl9kaXJlY3Rpb24gPT09IFR5cGVIaWVyYXJjaHlEaXJlY3Rpb24uU3VwZXJ0eXBlc1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdlbXB0LnN1cGVydHlwZXMnLCBcIk5vIHN1cGVydHlwZXMgb2YgJ3swfSdcIiwgbW9kZWwucm9vdC5uYW1lKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdlbXB0LnN1YnR5cGVzJywgXCJObyBzdWJ0eXBlcyBvZiAnezB9J1wiLCBtb2RlbC5yb290Lm5hbWUpKTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9wYXJlbnQuZGF0YXNldFsnc3RhdGUnXSA9IFN0YXRlLkRhdGE7XG5cdFx0XHRpZiAoIXZpZXdTdGF0ZSB8fCB0aGlzLl90cmVlLmdldEZvY3VzKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3RyZWUuc2V0Rm9jdXMoW3Jvb3QuY2hpbGRyZW5bMF0uZWxlbWVudF0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdHJlZS5kb21Gb2N1cygpO1xuXHRcdFx0dGhpcy5fdXBkYXRlUHJldmlldygpO1xuXHRcdH1cblx0fVxuXG5cdGdldE1vZGVsKCk6IFR5cGVIaWVyYXJjaHlNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuZ2V0SW5wdXQoKTtcblx0fVxuXG5cdGdldEZvY3VzZWQoKTogdHlwZUhUcmVlLlR5cGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90cmVlLmdldEZvY3VzKClbMF07XG5cdH1cblxuXHRhc3luYyB1cGRhdGVEaXJlY3Rpb24obmV3RGlyZWN0aW9uOiBUeXBlSGllcmFyY2h5RGlyZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl90cmVlLmdldElucHV0KCk7XG5cdFx0aWYgKG1vZGVsICYmIG5ld0RpcmVjdGlvbiAhPT0gdGhpcy5fZGlyZWN0aW9uKSB7XG5cdFx0XHR0aGlzLl90cmVlVmlld1N0YXRlcy5zZXQodGhpcy5fZGlyZWN0aW9uLCB0aGlzLl90cmVlLmdldFZpZXdTdGF0ZSgpKTtcblx0XHRcdHRoaXMuX2RpcmVjdGlvbiA9IG5ld0RpcmVjdGlvbjtcblx0XHRcdGF3YWl0IHRoaXMuc2hvd01vZGVsKG1vZGVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93KCkge1xuXHRcdGlmICghdGhpcy5faXNTaG93aW5nKSB7XG5cdFx0XHR0aGlzLmVkaXRvci5yZXZlYWxMaW5lSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydCh0aGlzLl93aGVyZS5saW5lTnVtYmVyLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0XHRzdXBlci5zaG93KFJhbmdlLmZyb21Qb3NpdGlvbnModGhpcy5fd2hlcmUpLCB0aGlzLl9sYXlvdXRJbmZvLmhlaWdodCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vbldpZHRoKHdpZHRoOiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5fZGltKSB7XG5cdFx0XHR0aGlzLl9kb0xheW91dEJvZHkodGhpcy5fZGltLmhlaWdodCwgd2lkdGgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZG9MYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2RpbS5oZWlnaHQgIT09IGhlaWdodCB8fCB0aGlzLl9kaW0ud2lkdGggIT09IHdpZHRoKSB7XG5cdFx0XHRzdXBlci5fZG9MYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdFx0dGhpcy5fZGltID0gbmV3IERpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KTtcblx0XHRcdHRoaXMuX2xheW91dEluZm8uaGVpZ2h0ID0gdGhpcy5fdmlld1pvbmUgPyB0aGlzLl92aWV3Wm9uZS5oZWlnaHRJbkxpbmVzIDogdGhpcy5fbGF5b3V0SW5mby5oZWlnaHQ7XG5cdFx0XHR0aGlzLl9zcGxpdFZpZXcubGF5b3V0KHdpZHRoKTtcblx0XHRcdHRoaXMuX3NwbGl0Vmlldy5yZXNpemVWaWV3KDAsIHdpZHRoICogdGhpcy5fbGF5b3V0SW5mby5yYXRpbyk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLFdBQVcsdUJBQXVCO0FBQzNDLFNBQVMsYUFBYSxRQUFRLGlCQUFpQjtBQUUvQyxTQUFvQiw0QkFBNEI7QUFDaEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYTtBQUV0QixTQUFTLGlCQUFpQixvQkFBb0I7QUFHOUMsU0FBUyxnQ0FBZ0M7QUFHekMsU0FBaUIsYUFBYTtBQUM5QixTQUFTLGtCQUFrQjtBQUMzQixTQUFrQyx3QkFBK0MseUJBQXlCO0FBQzFHLFNBQVMseUJBQXlCO0FBQ2xDLFlBQVksY0FBYztBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGNBQWMsY0FBYztBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUF5Qyw4QkFBOEI7QUFDdkUsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBc0IsZUFBZSx3QkFBd0I7QUFDN0QsWUFBWSxlQUFlO0FBQzNCLFNBQVMsOEJBQWtEO0FBQzNELFNBQVMsc0JBQXNCO0FBRy9CLElBQVcsUUFBWCxrQkFBV0EsV0FBWDtBQUNDLEVBQUFBLE9BQUEsYUFBVTtBQUNWLEVBQUFBLE9BQUEsYUFBVTtBQUNWLEVBQUFBLE9BQUEsVUFBTztBQUhH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
