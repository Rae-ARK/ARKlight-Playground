import assert from "assert";
import { SashState } from "../../../base/browser/ui/sash/sash.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { Parts } from "../../../workbench/services/layout/browser/layoutService.js";
import { DockedAuxiliaryBarController } from "../../browser/dockedAuxiliaryBarController.js";
import { Workbench } from "../../browser/workbench.js";
import { DockedEditorSizeMemento, SinglePaneWorkbench } from "../../browser/singlePaneWorkbench.js";
import { SinglePaneMainEditorPart } from "../../browser/parts/singlePaneEditorPart.js";
import { DockedEditorInput } from "../../common/dockedEditorInput.js";
import { EditorInputCapabilities } from "../../../workbench/common/editor.js";
import { SESSIONS_LIST_MINIMUM_WIDTH } from "../../browser/parts/sidebarPart.js";
class TestDockedEditorInput extends DockedEditorInput {
  get typeId() {
    return "test.dockedEditor";
  }
  get resource() {
    return void 0;
  }
}
suite("Sessions - Workbench", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const setEditorHidden = Reflect.get(Workbench.prototype, "setEditorHidden");
  const setAuxiliaryBarHidden = Reflect.get(Workbench.prototype, "setAuxiliaryBarHidden");
  const setSideBarHidden = Reflect.get(Workbench.prototype, "setSideBarHidden");
  const handleDidCloseEditor = Reflect.get(Workbench.prototype, "handleDidCloseEditor");
  const setEditorMaximized = Reflect.get(Workbench.prototype, "setEditorMaximized");
  const onEditorNodeResized = Reflect.get(SinglePaneWorkbench.prototype, "_onEditorNodeResized");
  const onGridDidChange = Reflect.get(SinglePaneWorkbench.prototype, "_onGridDidChange");
  const onEditorPartGridVisibilityChange = Reflect.get(SinglePaneWorkbench.prototype, "_onEditorPartGridVisibilityChange");
  const persistedAuxiliaryBarWidth = Reflect.get(SinglePaneWorkbench.prototype, "_persistedGridViewSize");
  const persistedEditorWidth = Reflect.get(SinglePaneWorkbench.prototype, "_persistedEditorWidth");
  const rememberAttachedEditorMaximizedState = Reflect.get(Workbench.prototype, "rememberAttachedEditorMaximizedState");
  const restoreAttachedEditorMaximizedState = Reflect.get(Workbench.prototype, "restoreAttachedEditorMaximizedState");
  const loadPartVisibility = Reflect.get(Workbench.prototype, "_loadPartVisibility");
  const savePartVisibility = Reflect.get(Workbench.prototype, "_savePartVisibility");
  const revealEditorOnOpen = Reflect.get(Workbench.prototype, "revealEditorOnOpen");
  const revealEditorOnOpenSinglePane = Reflect.get(SinglePaneWorkbench.prototype, "revealEditorOnOpen");
  const createDesktopGridDescriptor = Reflect.get(Workbench.prototype, "createDesktopGridDescriptor");
  const savePartSizes = Reflect.get(Workbench.prototype, "_savePartSizes");
  const isEditorPaneVisible = Workbench.prototype.isEditorPaneVisible;
  const isSinglePaneEditorPaneVisible = SinglePaneWorkbench.prototype.isEditorPaneVisible;
  const toggleSecondarySideBarSinglePane = SinglePaneWorkbench.prototype.toggleSecondarySideBar;
  const isSecondarySideBarVisibleSinglePane = SinglePaneWorkbench.prototype.isSecondarySideBarVisible;
  const applyCustomViewGridVisibility = Reflect.get(Workbench.prototype, "_applyCustomViewGridVisibility");
  const setSessionsHidden = Reflect.get(Workbench.prototype, "setSessionsHidden");
  const setPanelHidden = Reflect.get(Workbench.prototype, "setPanelHidden");
  const updateMobileCustomViewNavigation = Reflect.get(Workbench.prototype, "_updateMobileCustomViewNavigation");
  const isVisible = Workbench.prototype.isVisible;
  const toggleSecondarySideBar = Workbench.prototype.toggleSecondarySideBar;
  function createHost(options = {}) {
    const editorPartView = {};
    const sessionsPartView = {};
    const sideBarPartView = {};
    const auxiliaryBarPartView = {};
    const panelPartView = {};
    const customViewGridPartView = {};
    const resizes = [];
    const visibilityChanges = [];
    const events = [];
    const classToggles = [];
    const counts = { save: 0, layout: 0 };
    const sidePaneReveals = [];
    const focusedParts = [];
    const renderedCustomViews = [];
    const gridVisibility = /* @__PURE__ */ new Map();
    const mobileNavLayers = [];
    let focusedSessions = 0;
    const notifyPartVisibility = (view, visible) => notifyPartVisibilityOn(host, view, visible);
    let editorNodeVisible = (options.partVisibility?.editor ?? false) || (options.partVisibility?.auxiliaryBar ?? true);
    const viewSizes = /* @__PURE__ */ new Map([
      [editorPartView, { width: options.editorWidth ?? 0, height: 800 }],
      [sessionsPartView, { width: options.sessionsWidth ?? 1e3, height: 800 }],
      [sideBarPartView, { width: options.sideBarWidth ?? 280, height: 800 }],
      [auxiliaryBarPartView, { width: 300, height: 800 }]
    ]);
    const partVisibility = { sidebar: true, auxiliaryBar: true, editor: false, panel: false, sessions: true, customViewGrid: false, ...options.partVisibility };
    const host = {
      editorPartView,
      sessionsPartView,
      sideBarPartView,
      auxiliaryBarPartView,
      panelPartView,
      customViewGridPartView,
      _editorPartContainer: void 0,
      mainContainer: { classList: { toggle: (name, force) => {
        classToggles.push({ name, force });
      } } },
      partVisibility,
      workbenchGrid: {
        width: options.windowWidth ?? 1e3,
        layout: () => {
        },
        getViewSize: (view) => viewSizes.get(view) ?? { width: 0, height: 0 },
        isViewVisible: (view) => view === editorPartView ? editorNodeVisible : true,
        hasMaximizedView: () => false,
        exitMaximizedView: () => {
        },
        setViewVisible: (view, visible) => {
          if (view === editorPartView) {
            editorNodeVisible = visible;
          }
          gridVisibility.set(view, visible);
          visibilityChanges.push(visible);
          notifyPartVisibility(view, visible);
        },
        resizeView: (view, size) => {
          resizes.push(size);
          viewSizes.set(view, size);
        }
      },
      _mainContainerDimension: { width: options.windowWidth ?? 1e3, height: 800 },
      layoutPolicy: { viewportClass: { get: () => "desktop" } },
      _hasAppliedInitialEditorSplit: options.hasAppliedInitialEditorSplit ?? false,
      _savedPartSizes: {},
      _editorRevealedExplicitly: false,
      _editorMaximized: false,
      _editorPartAutoVisibilitySuppressionCount: options.suppressionCount ?? 0,
      _restoreAttachedEditorMaximizedOnShow: false,
      editorGroupService: options.editorGroupService,
      paneCompositeService: {
        getActivePaneComposite: () => void 0,
        hideActivePaneComposite: () => {
        },
        getLastActivePaneCompositeId: () => void 0,
        openPaneComposite: () => {
        }
      },
      viewDescriptorService: options.viewDescriptorService ?? { getDefaultViewContainer: () => void 0 },
      // docked bookkeeping
      _dockedAuxiliaryBarWidth: options.dockedWidth ?? DockedAuxiliaryBarController.DEFAULT_WIDTH,
      _syncingEditorVisibility: false,
      _detailHiddenForEditorResize: false,
      _memento: new DockedEditorSizeMemento(),
      // stubs for the heavy base helpers the hooks call
      _savePartVisibility: () => {
        counts.save++;
      },
      _fireDidChangePartVisibility: (partId, visible, source) => {
        events.push({ partId, visible, ...source ? { source } : {} });
      },
      _onDidRevealSidePane: { fire: () => {
        sidePaneReveals.push(true);
      } },
      _onDidChangeEditorMaximized: { fire: () => {
      } },
      _notifyContainerDidLayout: () => {
      },
      _layoutDockedAuxBar: () => {
        counts.layout++;
      },
      layoutMobileSidebar: () => {
      },
      ...options.editorMaximize ? {} : { setEditorMaximized: () => {
      } },
      hasFocus: (part) => options.focusedPart === part,
      focusPart: (part) => {
        focusedParts.push(part);
      },
      layout: () => {
      },
      mobileNavStack: {
        has: (layer) => mobileNavLayers.includes(layer),
        push: (layer) => {
          mobileNavLayers.push(layer);
        },
        popSilently: (layer) => {
          mobileNavLayers.splice(mobileNavLayers.indexOf(layer), 1);
        }
      },
      customViewGridPartService: { setView: (descriptor) => {
        renderedCustomViews.push(descriptor);
      }, focusActiveView: () => {
      } },
      _customViewVisibleKey: { set: () => {
      } },
      sessionsPartService: { focusSession: () => {
        focusedSessions++;
      } },
      sessionsService: { activeSession: { get: () => void 0 } },
      // captures
      resizes,
      visibilityChanges,
      events,
      classToggles,
      counts,
      sidePaneReveals,
      focusedParts,
      renderedCustomViews,
      gridVisibility,
      mobileNavLayers,
      get focusedSessions() {
        return focusedSessions;
      }
    };
    Object.setPrototypeOf(host, options.single ? SinglePaneWorkbench.prototype : Workbench.prototype);
    return host;
  }
  function notifyPartVisibilityOn(host, view, visible) {
    if (host._applyingCustomViewGridVisibility) {
      return;
    }
    if (view === host.sessionsPartView) {
      setSessionsHidden.call(host, !visible);
    } else if (view === host.panelPartView) {
      setPanelHidden.call(host, !visible);
    } else if (view === host.auxiliaryBarPartView) {
      host.setAuxiliaryBarHidden(!visible);
    }
  }
  test("tracks editor pane visibility across editor and auxiliary bar changes", () => {
    const host = createHost({ partVisibility: { editor: false, auxiliaryBar: true } });
    setAuxiliaryBarHidden.call(host, true);
    const hidden = isEditorPaneVisible.call(host);
    setEditorHidden.call(host, false);
    const editorVisible = isEditorPaneVisible.call(host);
    setEditorHidden.call(host, true);
    const closed = isEditorPaneVisible.call(host);
    assert.deepStrictEqual({
      hidden,
      editorVisible,
      closed,
      noEditorPaneClasses: host.classToggles.filter((toggle) => toggle.name === "noeditorpane")
    }, {
      hidden: false,
      editorVisible: true,
      closed: false,
      noEditorPaneClasses: [
        { name: "noeditorpane", force: true },
        { name: "noeditorpane", force: false },
        { name: "noeditorpane", force: true }
      ]
    });
  });
  test("reads the single-pane editor grid node visibility", () => {
    const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true } });
    host.workbenchGrid.isViewVisible = () => false;
    assert.strictEqual(isSinglePaneEditorPaneVisible.call(host), false);
  });
  test("single-pane secondary sidebar toggle controls the editor pane", () => {
    const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: true }, focusedPart: Parts.EDITOR_PART });
    toggleSecondarySideBarSinglePane.call(host);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      secondarySideBarVisible: isSecondarySideBarVisibleSinglePane.call(host),
      focusedParts: host.focusedParts
    }, {
      editorVisible: false,
      auxiliaryBarVisible: true,
      secondarySideBarVisible: false,
      focusedParts: [Parts.AUXILIARYBAR_PART]
    });
  });
  test("updates the single-pane editor pane class after the grid node visibility changes", () => {
    const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: false } });
    setEditorHidden.call(host, true);
    assert.deepStrictEqual(
      host.classToggles.filter((toggle) => toggle.name === "noeditorpane"),
      [{ name: "noeditorpane", force: true }]
    );
  });
  test("applies an even editor split the first time the editor is revealed", () => {
    const host = createHost({ sessionsWidth: 1e3, windowWidth: 1e3 });
    setEditorHidden.call(host, false);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      appliedSplit: host._hasAppliedInitialEditorSplit,
      visibilityChanges: host.visibilityChanges,
      resizes: host.resizes
    }, {
      editorVisible: true,
      appliedSplit: true,
      visibilityChanges: [true],
      resizes: [{ width: 500, height: 800 }]
    });
  });
  test("docked sidebar hide grows the editor by the freed sidebar width and show restores it", () => {
    const host = createHost({ single: true, sideBarWidth: 280, editorWidth: 620, partVisibility: { sidebar: true, editor: true, auxiliaryBar: true } });
    setSideBarHidden.call(host, true);
    setSideBarHidden.call(host, false);
    assert.deepStrictEqual({
      sidebarVisible: host.partVisibility.sidebar,
      visibilityChanges: host.visibilityChanges,
      resizes: host.resizes,
      layoutCount: host.counts.layout,
      snapshot: host._memento.editorSizeGrownForSidebarHide
    }, {
      sidebarVisible: true,
      visibilityChanges: [false, true],
      resizes: [
        { width: 900, height: 800 },
        { width: 620, height: 800 }
      ],
      layoutCount: 2,
      snapshot: void 0
    });
  });
  test("standard layout sidebar hide does not grow the editor", () => {
    const host = createHost({ sideBarWidth: 280, editorWidth: 620, partVisibility: { sidebar: true, editor: true, auxiliaryBar: true } });
    setSideBarHidden.call(host, true);
    assert.deepStrictEqual({
      sidebarVisible: host.partVisibility.sidebar,
      visibilityChanges: host.visibilityChanges,
      resizes: host.resizes
    }, {
      sidebarVisible: false,
      visibilityChanges: [false],
      resizes: []
    });
  });
  test("docked sidebar hide grows the detail panel (not the editor node) when the editor is hidden and show restores it", () => {
    const host = createHost({ single: true, sideBarWidth: 280, editorWidth: 620, dockedWidth: 300, partVisibility: { sidebar: true, editor: false, auxiliaryBar: true } });
    setSideBarHidden.call(host, true);
    const afterHide = {
      editorVisible: host.partVisibility.editor,
      detailWidth: host._dockedAuxiliaryBarWidth,
      resizes: [...host.resizes],
      detailSnapshot: host._memento.detailWidthGrownForSidebarHide,
      editorSnapshot: host._memento.editorSizeGrownForSidebarHide
    };
    setSideBarHidden.call(host, false);
    assert.deepStrictEqual({
      afterHide,
      editorVisible: host.partVisibility.editor,
      detailWidth: host._dockedAuxiliaryBarWidth,
      resizes: host.resizes,
      detailSnapshot: host._memento.detailWidthGrownForSidebarHide,
      layoutCount: host.counts.layout
    }, {
      afterHide: {
        editorVisible: false,
        detailWidth: 580,
        resizes: [{ width: 580, height: 800 }],
        detailSnapshot: 300,
        editorSnapshot: void 0
      },
      editorVisible: false,
      detailWidth: 300,
      resizes: [
        { width: 580, height: 800 },
        { width: 300, height: 800 }
      ],
      detailSnapshot: void 0,
      layoutCount: 2
    });
  });
  test("single-pane descriptor uses the docked detail width for a detail-only first open", () => {
    const host = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: false, auxiliaryBar: true } });
    host.layoutPolicy = {
      getPartSizes: () => ({ sideBarSize: 280, auxiliaryBarSize: 340, panelSize: 300 }),
      viewportClass: { get: () => "desktop" }
    };
    host.titleBarPartView = { minimumHeight: 30 };
    const descriptor = createDesktopGridDescriptor.call(host, 1200, 800);
    const contentSection = descriptor.root.data[1];
    const rightSection = contentSection.data[1];
    const topRightSection = rightSection.data[0];
    const editorNode = topRightSection.data[1];
    assert.deepStrictEqual({ size: editorNode.size, visible: editorNode.visible }, { size: 300, visible: true });
  });
  test("single-pane descriptor restores an editor-only side pane at its saved width (no detail subtraction)", () => {
    const host = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: false } });
    host._savedPartSizes = { editor: 900 };
    host.layoutPolicy = {
      getPartSizes: () => ({ sideBarSize: 280, auxiliaryBarSize: 340, panelSize: 300 }),
      viewportClass: { get: () => "desktop" }
    };
    host.titleBarPartView = { minimumHeight: 30 };
    const descriptor = createDesktopGridDescriptor.call(host, 1600, 800);
    const contentSection = descriptor.root.data[1];
    const rightSection = contentSection.data[1];
    const topRightSection = rightSection.data[0];
    const editorNode = topRightSection.data[1];
    assert.deepStrictEqual({ size: editorNode.size, visible: editorNode.visible }, { size: 900, visible: true });
  });
  test("single-pane descriptor falls back to the default when the saved editor width is corrupt (0 / sub-minimum)", () => {
    const build = (savedEditor) => {
      const host = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: false } });
      host._savedPartSizes = savedEditor === void 0 ? {} : { editor: savedEditor };
      host.layoutPolicy = {
        getPartSizes: () => ({ sideBarSize: 280, auxiliaryBarSize: 340, panelSize: 300 }),
        viewportClass: { get: () => "desktop" }
      };
      host.titleBarPartView = { minimumHeight: 30 };
      const descriptor = createDesktopGridDescriptor.call(host, 1600, 800);
      const contentSection = descriptor.root.data[1];
      const rightSection = contentSection.data[1];
      const topRightSection = rightSection.data[0];
      return topRightSection.data[1].size;
    };
    assert.deepStrictEqual({
      corruptZero: build(0),
      subMinimum: build(120),
      missing: build(void 0),
      validSaved: build(750)
    }, {
      corruptZero: 600,
      subMinimum: 600,
      missing: 600,
      validSaved: 750
    });
  });
  test("_savePartSizes persists the editor width without reading the docked aux bar from the grid (single-pane)", () => {
    const stored = {};
    const editorView = {}, sessionsView = {}, sideBarView = {}, auxView = {}, panelView = {};
    const viewSizes = /* @__PURE__ */ new Map([
      [editorView, { width: 864, height: 700 }],
      [sessionsView, { width: 618, height: 700 }],
      [sideBarView, { width: 300, height: 700 }],
      [panelView, { width: 1e3, height: 200 }]
    ]);
    const host = {
      editorPartView: editorView,
      sessionsPartView: sessionsView,
      sideBarPartView: sideBarView,
      auxiliaryBarPartView: auxView,
      panelPartView: panelView,
      partVisibility: { sidebar: true, auxiliaryBar: false, editor: true, panel: false, sessions: true },
      _savedPartSizes: { editor: 500 },
      _dockedAuxiliaryBarWidth: 300,
      _memento: new DockedEditorSizeMemento(),
      logService: void 0,
      workbenchGrid: {
        getViewSize: (view) => {
          const size = viewSizes.get(view);
          if (!size) {
            throw new Error("View not found");
          }
          return size;
        },
        getViewCachedVisibleSize: (view) => {
          if (view === auxView) {
            throw new Error("View not found");
          }
          return viewSizes.get(view)?.width;
        }
      },
      storageService: { store: (key, value) => {
        stored[key] = value;
      } }
    };
    Object.setPrototypeOf(host, SinglePaneWorkbench.prototype);
    savePartSizes.call(host);
    const sizes = JSON.parse(stored["workbench.sessions.partSizes"]);
    assert.deepStrictEqual({ editor: sizes.editor, sessions: sizes.sessions, auxiliaryBar: sizes.auxiliaryBar }, { editor: 864, sessions: 618, auxiliaryBar: 300 });
  });
  test("_savePartSizes preserves the last valid editor width when the editor is hidden with the detail visible (single-pane)", () => {
    const stored = {};
    const editorView = {}, sessionsView = {}, sideBarView = {}, auxView = {}, panelView = {};
    const viewSizes = /* @__PURE__ */ new Map([
      [editorView, { width: 300, height: 700 }],
      [sessionsView, { width: 1182, height: 700 }],
      [sideBarView, { width: 300, height: 700 }],
      [panelView, { width: 1e3, height: 200 }]
    ]);
    const host = {
      editorPartView: editorView,
      sessionsPartView: sessionsView,
      sideBarPartView: sideBarView,
      auxiliaryBarPartView: auxView,
      panelPartView: panelView,
      partVisibility: { sidebar: true, auxiliaryBar: true, editor: false, panel: false, sessions: true },
      _savedPartSizes: { editor: 520 },
      _dockedAuxiliaryBarWidth: 300,
      _memento: new DockedEditorSizeMemento(),
      logService: void 0,
      workbenchGrid: {
        getViewSize: (view) => {
          const size = viewSizes.get(view);
          if (!size) {
            throw new Error("View not found");
          }
          return size;
        },
        getViewCachedVisibleSize: (view) => {
          if (view === auxView) {
            throw new Error("View not found");
          }
          return viewSizes.get(view)?.width;
        }
      },
      storageService: { store: (key, value) => {
        stored[key] = value;
      } }
    };
    Object.setPrototypeOf(host, SinglePaneWorkbench.prototype);
    savePartSizes.call(host);
    const sizes = JSON.parse(stored["workbench.sessions.partSizes"]);
    assert.strictEqual(sizes.editor, 520);
  });
  test("showing docked detail with hidden editor restores the preferred detail width instead of cached node width", () => {
    const host = createHost({ single: true, editorWidth: 640, dockedWidth: 300, partVisibility: { editor: false, auxiliaryBar: false } });
    setAuxiliaryBarHidden.call(host, false);
    assert.deepStrictEqual({
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      editorVisible: host.partVisibility.editor,
      resizes: host.resizes,
      visibilityChanges: host.visibilityChanges,
      events: host.events,
      layoutCount: host.counts.layout
    }, {
      auxiliaryBarVisible: true,
      editorVisible: false,
      resizes: [{ width: 300, height: 800 }],
      visibilityChanges: [true],
      events: [{ partId: Parts.AUXILIARYBAR_PART, visible: true }],
      layoutCount: 1
    });
  });
  test("persists the user detail width instead of a temporary sidebar-collapse grow width", () => {
    const host = createHost({ single: true, dockedWidth: 580 });
    host._memento.detailWidthGrownForSidebarHide = 300;
    assert.strictEqual(persistedAuxiliaryBarWidth.call(host, host.auxiliaryBarPartView, "width", false), 300);
  });
  test("persisted editor width excludes the detail only when the detail is visible", () => {
    const withDetail = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: true } });
    const editorOnly = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: false } });
    assert.deepStrictEqual({
      withDetail: persistedEditorWidth.call(withDetail, 900),
      editorOnly: persistedEditorWidth.call(editorOnly, 900)
    }, {
      withDetail: 600,
      editorOnly: 900
    });
  });
  test("does not re-apply the even split on later editor reveals", () => {
    const host = createHost({ sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true });
    setEditorHidden.call(host, false);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      visibilityChanges: host.visibilityChanges,
      resizes: host.resizes
    }, {
      editorVisible: true,
      visibilityChanges: [true],
      resizes: []
    });
  });
  test("clamps the even editor split to a minimum width", () => {
    const host = createHost({ sessionsWidth: 400, windowWidth: 400 });
    setEditorHidden.call(host, false);
    assert.deepStrictEqual(host.resizes, [{ width: 300, height: 800 }]);
  });
  test("relayouts the docked detail panel when the editor visibility changes", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true });
    setEditorHidden.call(host, false);
    setEditorHidden.call(host, true);
    assert.deepStrictEqual({
      layoutCount: host.counts.layout,
      visibilityChanges: host.visibilityChanges
    }, {
      layoutCount: 2,
      visibilityChanges: [true, true]
    });
  });
  test("fires editor visibility changes when docked editor content is hidden or shown", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true, partVisibility: { editor: true, auxiliaryBar: true } });
    setEditorHidden.call(host, true);
    setEditorHidden.call(host, false);
    assert.deepStrictEqual(host.events, [
      { partId: Parts.EDITOR_PART, visible: false },
      { partId: Parts.EDITOR_PART, visible: true }
    ]);
  });
  test("maps a native sash-drag collapse of the detail-only node onto hiding the auxiliary bar, like the sessions list", () => {
    const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true } });
    onEditorPartGridVisibilityChange.call(host, false);
    assert.deepStrictEqual({
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      events: host.events
    }, {
      auxiliaryBarVisible: false,
      events: [{ partId: Parts.AUXILIARYBAR_PART, visible: false, source: "resize" }]
    });
  });
  test("reveals the detail-only panel again when the collapsed node is dragged back open", () => {
    const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true } });
    onEditorPartGridVisibilityChange.call(host, false);
    onEditorPartGridVisibilityChange.call(host, true);
    assert.deepStrictEqual({
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      events: host.events
    }, {
      auxiliaryBarVisible: true,
      events: [
        { partId: Parts.AUXILIARYBAR_PART, visible: false, source: "resize" },
        { partId: Parts.AUXILIARYBAR_PART, visible: true, source: "resize" }
      ]
    });
  });
  test("ignores the shared node grid visibility while editor content is visible", () => {
    const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: true } });
    onEditorPartGridVisibilityChange.call(host, false);
    assert.deepStrictEqual({ auxiliaryBarVisible: host.partVisibility.auxiliaryBar, events: host.events }, { auxiliaryBarVisible: true, events: [] });
  });
  test("fires onDidRevealSidePane only when the side pane transitions from fully hidden to visible", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, partVisibility: { editor: false, auxiliaryBar: false } });
    const counts = [];
    setEditorHidden.call(host, false);
    counts.push(host.sidePaneReveals.length);
    setAuxiliaryBarHidden.call(host, false);
    counts.push(host.sidePaneReveals.length);
    setAuxiliaryBarHidden.call(host, true);
    setEditorHidden.call(host, true);
    counts.push(host.sidePaneReveals.length);
    setEditorHidden.call(host, false);
    counts.push(host.sidePaneReveals.length);
    assert.deepStrictEqual(counts, [1, 1, 1, 2]);
  });
  test("does not fire onDidRevealSidePane in the base (non-docked) layout", () => {
    const host = createHost({ sessionsWidth: 1e3, partVisibility: { editor: false, auxiliaryBar: false } });
    setAuxiliaryBarHidden.call(host, false);
    setEditorHidden.call(host, false);
    assert.strictEqual(host.sidePaneReveals.length, 0);
  });
  test("shrinks the docked editor node to the detail width when hiding the editor", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true, dockedWidth: 320, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });
    setEditorHidden.call(host, true);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      visibilityChanges: host.visibilityChanges,
      resizes: host.resizes
    }, {
      editorVisible: false,
      visibilityChanges: [true],
      resizes: [{ width: 320, height: 800 }]
    });
  });
  test("clears stale sidebar-grow snapshots when hiding the editor with the detail visible", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true, dockedWidth: 320, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });
    host._memento.editorSizeGrownForSidebarHide = { width: 900, height: 800 };
    host._memento.detailWidthGrownForSidebarHide = 500;
    setEditorHidden.call(host, true);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      resizes: host.resizes,
      editorSizeGrownForSidebarHide: host._memento.editorSizeGrownForSidebarHide,
      detailWidthGrownForSidebarHide: host._memento.detailWidthGrownForSidebarHide
    }, {
      editorVisible: false,
      resizes: [{ width: 320, height: 800 }],
      editorSizeGrownForSidebarHide: void 0,
      detailWidthGrownForSidebarHide: void 0
    });
  });
  function createWillOpenHarness(overrides) {
    const setEditorHiddenCalls = [];
    const harness = {
      _editorPartAutoVisibilitySuppressionCount: 0,
      partVisibility: { editor: false, auxiliaryBar: false },
      editorGroupService: { mainPart: { groups: [{ id: 1 }] } },
      setEditorHidden: (hidden, explicit) => setEditorHiddenCalls.push({ hidden, explicit }),
      restoreAttachedEditorMaximizedState: () => {
      },
      ...overrides
    };
    return { harness, setEditorHiddenCalls };
  }
  test("[Scenario 5] base revealEditorOnOpen reveals a hidden editor on open", () => {
    const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false, auxiliaryBar: true } });
    revealEditorOnOpen.call(harness, { groupId: 1, editor: { typeId: "workbench.editors.files.fileEditorInput" } });
    assert.deepStrictEqual(setEditorHiddenCalls, [{ hidden: false, explicit: true }]);
  });
  test("[Scenario 5] base revealEditorOnOpen does not reveal when the open targets a non-main-part group", () => {
    const { harness, setEditorHiddenCalls } = createWillOpenHarness();
    revealEditorOnOpen.call(harness, { groupId: 99, editor: { typeId: "workbench.editors.files.fileEditorInput" } });
    assert.deepStrictEqual(setEditorHiddenCalls, []);
  });
  test("[Scenario 5] base revealEditorOnOpen does not reveal while editor-part auto-visibility is suppressed", () => {
    const { harness, setEditorHiddenCalls } = createWillOpenHarness({ _editorPartAutoVisibilitySuppressionCount: 1 });
    revealEditorOnOpen.call(harness, { groupId: 1, editor: { typeId: "workbench.editors.files.fileEditorInput" } });
    assert.deepStrictEqual(setEditorHiddenCalls, []);
  });
  test("docked editors are excluded from the editor limit (prevents managed-tab open/close loop)", () => {
    const dockedEditor = new TestDockedEditorInput();
    try {
      assert.strictEqual(dockedEditor.hasCapability(EditorInputCapabilities.ExcludeFromEditorLimit), true);
    } finally {
      dockedEditor.dispose();
    }
  });
  test("[Scenario 5] single-pane does not reveal a docked editor while the detail panel is open and the editor is closed", () => {
    const dockedEditor = new TestDockedEditorInput();
    const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false, auxiliaryBar: true } });
    try {
      revealEditorOnOpenSinglePane.call(harness, { groupId: 1, editor: dockedEditor });
      assert.deepStrictEqual(setEditorHiddenCalls, []);
    } finally {
      dockedEditor.dispose();
    }
  });
  test("[Scenario 5] single-pane reveals a docked editor when the detail panel is closed", () => {
    const dockedEditor = new TestDockedEditorInput();
    const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false, auxiliaryBar: false } });
    try {
      revealEditorOnOpenSinglePane.call(harness, { groupId: 1, editor: dockedEditor });
      assert.deepStrictEqual(setEditorHiddenCalls, [{ hidden: false, explicit: true }]);
    } finally {
      dockedEditor.dispose();
    }
  });
  test("[Scenario 5] single-pane reveals a non-docked editor even while the detail panel is open", () => {
    const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false, auxiliaryBar: true } });
    revealEditorOnOpenSinglePane.call(harness, { groupId: 1, editor: { typeId: "workbench.editors.files.fileEditorInput" } });
    assert.deepStrictEqual(setEditorHiddenCalls, [{ hidden: false, explicit: true }]);
  });
  test("restores the docked editor node size when showing after hide", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true, dockedWidth: 320, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });
    setEditorHidden.call(host, true);
    setEditorHidden.call(host, false);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      visibilityChanges: host.visibilityChanges,
      resizes: host.resizes,
      snapshot: host._memento.dockedEditorSizeBeforeHide
    }, {
      editorVisible: true,
      visibilityChanges: [true, true],
      resizes: [
        { width: 320, height: 800 },
        { width: 900, height: 800 }
      ],
      snapshot: void 0
    });
  });
  test("suppresses docked editor reveal sync while hiding the editor", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true, dockedWidth: 320, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });
    const grid = host.workbenchGrid;
    const setViewVisible = grid.setViewVisible;
    grid.setViewVisible = (view, visible) => {
      setViewVisible(view, visible);
      onEditorNodeResized.call(host, 900);
    };
    setEditorHidden.call(host, true);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      resizes: host.resizes,
      snapshot: host._memento.dockedEditorSizeBeforeHide
    }, {
      editorVisible: false,
      events: [{ partId: Parts.EDITOR_PART, visible: false }],
      resizes: [{ width: 320, height: 800 }],
      snapshot: { width: 900, height: 800 }
    });
  });
  test("restores the remembered global editor width on reveal instead of the default split (cross-session)", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, windowWidth: 1e3, hasAppliedInitialEditorSplit: true, dockedWidth: 300, editorWidth: 520, partVisibility: { editor: true, auxiliaryBar: false } });
    setEditorHidden.call(host, true);
    const rememberedWidth = host._savedPartSizes.editor;
    const resizesBeforeReveal = host.resizes.length;
    setEditorHidden.call(host, false);
    const revealResizes = host.resizes.slice(resizesBeforeReveal);
    assert.deepStrictEqual({
      rememberedWidth,
      editorVisible: host.partVisibility.editor,
      revealResizes
    }, {
      rememberedWidth: 520,
      editorVisible: true,
      revealResizes: [{ width: 520, height: 800 }]
    });
  });
  test("single-pane editor part preferredWidth is 60% of the window (drives sash double-click reset)", () => {
    const preferredWidthGetter = Object.getOwnPropertyDescriptor(SinglePaneMainEditorPart.prototype, "preferredWidth").get;
    const call = (windowWidth) => preferredWidthGetter.call({ layoutService: { mainContainerDimension: { width: windowWidth, height: 800 }, isVisible: () => true } });
    assert.deepStrictEqual({
      wide: call(2e3),
      narrow: call(400)
    }, {
      wide: 1200,
      narrow: 300
    });
  });
  test("single-pane editor part preferredWidth resets to the docked detail default width instead of 60% when editor content is hidden", () => {
    const preferredWidthGetter = Object.getOwnPropertyDescriptor(SinglePaneMainEditorPart.prototype, "preferredWidth").get;
    const preferredWidth = preferredWidthGetter.call({ layoutService: { mainContainerDimension: { width: 2e3, height: 800 }, isVisible: () => false } });
    assert.strictEqual(preferredWidth, DockedAuxiliaryBarController.DEFAULT_WIDTH);
  });
  test("single-pane editor part is a snap view only while editor content is hidden (docked detail-only)", () => {
    const snapGetter = Object.getOwnPropertyDescriptor(SinglePaneMainEditorPart.prototype, "snap").get;
    const call = (editorVisible) => snapGetter.call({ layoutService: { isVisible: () => editorVisible } });
    assert.deepStrictEqual({ editorHidden: call(false), editorVisible: call(true) }, { editorHidden: true, editorVisible: false });
  });
  test("single-pane editor part minimumWidth matches the sessions-list minimum while editor content is hidden (docked detail-only)", () => {
    const minimumWidthGetter = Object.getOwnPropertyDescriptor(SinglePaneMainEditorPart.prototype, "minimumWidth").get;
    const minimumWidth = minimumWidthGetter.call({ layoutService: { isVisible: () => false } });
    assert.strictEqual(minimumWidth, SESSIONS_LIST_MINIMUM_WIDTH);
  });
  test("applies an even split when revealing the docked editor with no captured width even after the initial split", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, windowWidth: 1e3, hasAppliedInitialEditorSplit: true, dockedWidth: 300, partVisibility: { editor: false, auxiliaryBar: true } });
    setEditorHidden.call(host, false);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      visibilityChanges: host.visibilityChanges,
      resizes: host.resizes
    }, {
      editorVisible: true,
      visibilityChanges: [true],
      resizes: [{ width: 600, height: 800 }]
    });
  });
  test("restores a captured docked editor width instead of applying an even split", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true, dockedWidth: 300, partVisibility: { editor: false, auxiliaryBar: true } });
    host._memento.dockedEditorSizeBeforeHide = { width: 720, height: 800 };
    setEditorHidden.call(host, false);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      visibilityChanges: host.visibilityChanges,
      resizes: host.resizes,
      snapshot: host._memento.dockedEditorSizeBeforeHide
    }, {
      editorVisible: true,
      visibilityChanges: [true],
      resizes: [{ width: 720, height: 800 }],
      snapshot: void 0
    });
  });
  test("reopening the whole side pane while the sidebar is collapsed even-splits instead of restoring a cramped width", () => {
    const host = createHost({ single: true, sessionsWidth: 1360, windowWidth: 1360, hasAppliedInitialEditorSplit: true, dockedWidth: 300, editorWidth: 40, partVisibility: { editor: true, auxiliaryBar: false } });
    host._memento.editorSizeGrownForSidebarHide = { width: 620, height: 800 };
    host._memento.detailWidthGrownForSidebarHide = 300;
    setEditorHidden.call(host, true);
    const afterClose = {
      snapshot: host._memento.dockedEditorSizeBeforeHide,
      grownEditor: host._memento.editorSizeGrownForSidebarHide,
      grownDetail: host._memento.detailWidthGrownForSidebarHide,
      resizes: [...host.resizes]
    };
    setEditorHidden.call(host, false);
    assert.deepStrictEqual({
      afterClose,
      editorVisible: host.partVisibility.editor,
      resizes: host.resizes,
      snapshot: host._memento.dockedEditorSizeBeforeHide
    }, {
      afterClose: {
        snapshot: void 0,
        grownEditor: void 0,
        grownDetail: void 0,
        resizes: []
      },
      editorVisible: true,
      resizes: [{ width: 816, height: 800 }],
      snapshot: void 0
    });
  });
  test("does not reveal the docked editor when the grid sash widens the node while only the detail is shown", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 305 });
    host._memento.dockedEditorSizeBeforeHide = { width: 900, height: 800 };
    onGridDidChange.call(host);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save,
      classToggles: host.classToggles,
      resizes: host.resizes,
      snapshot: host._memento.dockedEditorSizeBeforeHide
    }, {
      editorVisible: false,
      events: [],
      layoutCount: 0,
      saveCount: 0,
      classToggles: [],
      resizes: [],
      snapshot: { width: 900, height: 800 }
    });
  });
  test("does not reveal the docked editor from editor part layout width while only the detail is shown", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 300 });
    host._memento.dockedEditorSizeBeforeHide = { width: 900, height: 800 };
    onEditorNodeResized.call(host, 305);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save,
      snapshot: host._memento.dockedEditorSizeBeforeHide
    }, {
      editorVisible: false,
      events: [],
      layoutCount: 0,
      saveCount: 0,
      snapshot: { width: 900, height: 800 }
    });
  });
  test("does not reveal the docked editor when the sash widens the node enough to fit the editor beside the detail", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 500, partVisibility: { editor: false, auxiliaryBar: true } });
    onEditorNodeResized.call(host, 500);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save,
      classToggles: host.classToggles
    }, {
      editorVisible: false,
      events: [],
      layoutCount: 0,
      saveCount: 0,
      classToggles: []
    });
  });
  test("does not reveal the docked editor while widening the node from a grid layout change", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 499, partVisibility: { editor: false, auxiliaryBar: true } });
    onGridDidChange.call(host);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save
    }, {
      editorVisible: false,
      events: [],
      layoutCount: 0,
      saveCount: 0
    });
  });
  test("does not reveal the docked editor from a widen while the detail is also hidden", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 650, partVisibility: { editor: false, auxiliaryBar: false } });
    onEditorNodeResized.call(host, 650);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save
    }, {
      editorVisible: false,
      events: [],
      layoutCount: 0,
      saveCount: 0
    });
  });
  test("keeps docked editor hidden when editor part layout width leaves only detail width", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 300 });
    onEditorNodeResized.call(host, 304);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save
    }, {
      editorVisible: false,
      events: [],
      layoutCount: 0,
      saveCount: 0
    });
  });
  test("keeps docked editor hidden when grid sash leaves only detail width", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 300 });
    onGridDidChange.call(host);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save
    }, {
      editorVisible: false,
      events: [],
      layoutCount: 0,
      saveCount: 0
    });
  });
  test("hides details when the editor sash leaves too little room for both panes", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 600, partVisibility: { editor: true, auxiliaryBar: true } });
    onEditorNodeResized.call(host, 599);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      detailVisible: host.partVisibility.auxiliaryBar,
      detailHiddenForEditorResize: host._detailHiddenForEditorResize,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save
    }, {
      editorVisible: true,
      detailVisible: false,
      detailHiddenForEditorResize: true,
      events: [{ partId: Parts.AUXILIARYBAR_PART, visible: false, source: "resize" }],
      layoutCount: 1,
      saveCount: 0
    });
  });
  test("shows details when the editor sash restores room after an automatic hide", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 600, partVisibility: { editor: true, auxiliaryBar: true } });
    onEditorNodeResized.call(host, 599);
    onEditorNodeResized.call(host, 700);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      detailVisible: host.partVisibility.auxiliaryBar,
      detailHiddenForEditorResize: host._detailHiddenForEditorResize,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save
    }, {
      editorVisible: true,
      detailVisible: true,
      detailHiddenForEditorResize: false,
      events: [
        { partId: Parts.AUXILIARYBAR_PART, visible: false, source: "resize" },
        { partId: Parts.AUXILIARYBAR_PART, visible: true, source: "resize" }
      ],
      layoutCount: 2,
      saveCount: 0
    });
  });
  test("does not hide docked editor when node is squeezed but detail is also hidden", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 600, partVisibility: { editor: true, auxiliaryBar: false } });
    onEditorNodeResized.call(host, 304);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save
    }, {
      editorVisible: true,
      events: [],
      layoutCount: 0,
      saveCount: 0
    });
  });
  test("keeps editor resize state when the outer sash hides details before collapsing the editor", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 600, partVisibility: { editor: true, auxiliaryBar: true } });
    host._memento.editorSizeGrownForSidebarHide = { width: 800, height: 600 };
    host._memento.detailWidthGrownForSidebarHide = 400;
    host._editorRevealedExplicitly = true;
    onEditorNodeResized.call(host, 300);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      detailVisible: host.partVisibility.auxiliaryBar,
      editorSizeGrownForSidebarHide: host._memento.editorSizeGrownForSidebarHide,
      detailWidthGrownForSidebarHide: host._memento.detailWidthGrownForSidebarHide,
      editorRevealedExplicitly: host._editorRevealedExplicitly
    }, {
      editorVisible: true,
      detailVisible: false,
      editorSizeGrownForSidebarHide: { width: 800, height: 600 },
      detailWidthGrownForSidebarHide: 400,
      editorRevealedExplicitly: true
    });
  });
  test("fills the narrowed docked detail node and disables its overlay sash when editor content is hidden", () => {
    const editorContainer = document.createElement("div");
    const auxiliaryBarContainer = document.createElement("div");
    const layouts = [];
    const insets = [];
    const persistedWidths = [];
    let editorVisible = true;
    let editorWidth = 800;
    Object.defineProperty(editorContainer, "clientWidth", { get: () => editorWidth });
    Object.defineProperty(editorContainer, "clientHeight", { value: 600 });
    editorContainer.getBoundingClientRect = () => ({
      width: editorWidth,
      height: 600,
      top: 0,
      right: editorWidth,
      bottom: 600,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => void 0
    });
    const auxiliaryBarPart = {
      getContainer: () => auxiliaryBarContainer,
      layout: (width, height, top, left) => {
        layouts.push({ width, height, top, left });
      }
    };
    const host = {
      getWidth: () => 260,
      setWidth: (width) => persistedWidths.push(width),
      isEditorAreaVisible: () => true,
      isEditorVisible: () => editorVisible,
      isAuxiliaryBarVisible: () => true,
      hideAuxiliaryBar: () => {
      },
      setEditorContentRightInset: (px) => insets.push(px),
      getHeaderHeight: () => 0
    };
    const controller = new DockedAuxiliaryBarController(editorContainer, auxiliaryBarPart, host);
    controller.layout();
    editorWidth = 260;
    editorVisible = false;
    controller.layout();
    const sash = Reflect.get(controller, "_sash");
    const sashLayoutProvider = Reflect.get(sash, "layoutProvider");
    assert.deepStrictEqual({
      insets,
      persistedWidths,
      layouts,
      style: {
        top: auxiliaryBarContainer.style.top,
        right: auxiliaryBarContainer.style.right,
        width: auxiliaryBarContainer.style.width,
        height: auxiliaryBarContainer.style.height
      },
      sashState: sash?.state,
      sashLeft: sashLayoutProvider.getVerticalSashLeft()
    }, {
      insets: [260, 260],
      persistedWidths: [],
      layouts: [
        { width: 260, height: 565, top: 35, left: 540 },
        { width: 260, height: 565, top: 35, left: 0 }
      ],
      style: {
        top: "35px",
        right: "0px",
        width: "260px",
        height: "565px"
      },
      // The grid sash owns resizing/collapsing here; the overlay sash must be disabled.
      sashState: SashState.Disabled,
      sashLeft: 0
    });
    controller.dispose();
  });
  test("uses persisted docked detail width when editor content is visible", () => {
    const editorContainer = document.createElement("div");
    const auxiliaryBarContainer = document.createElement("div");
    const layouts = [];
    const insets = [];
    Object.defineProperty(editorContainer, "clientWidth", { value: 800 });
    Object.defineProperty(editorContainer, "clientHeight", { value: 600 });
    editorContainer.getBoundingClientRect = () => ({
      width: 800,
      height: 600,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => void 0
    });
    const auxiliaryBarPart = {
      getContainer: () => auxiliaryBarContainer,
      layout: (width, height, top, left) => {
        layouts.push({ width, height, top, left });
      }
    };
    const host = {
      getWidth: () => 260,
      setWidth: () => {
      },
      isEditorAreaVisible: () => true,
      isEditorVisible: () => true,
      isAuxiliaryBarVisible: () => true,
      hideAuxiliaryBar: () => {
      },
      setEditorContentRightInset: (px) => insets.push(px),
      getHeaderHeight: () => 0
    };
    const controller = new DockedAuxiliaryBarController(editorContainer, auxiliaryBarPart, host);
    controller.layout();
    const sash = Reflect.get(controller, "_sash");
    assert.deepStrictEqual({
      insets,
      layouts,
      style: {
        width: auxiliaryBarContainer.style.width,
        height: auxiliaryBarContainer.style.height
      },
      sashState: sash?.state
    }, {
      insets: [260],
      layouts: [{ width: 260, height: 565, top: 35, left: 540 }],
      style: {
        width: "260px",
        height: "565px"
      },
      sashState: SashState.Enabled
    });
    controller.dispose();
  });
  test("hides the docked detail panel when its sash collapses to zero width", () => {
    const editorContainer = document.createElement("div");
    const auxiliaryBarContainer = document.createElement("div");
    let hideCount = 0;
    const persistedWidths = [];
    Object.defineProperty(editorContainer, "clientWidth", { value: 800 });
    Object.defineProperty(editorContainer, "clientHeight", { value: 600 });
    editorContainer.getBoundingClientRect = () => ({
      width: 800,
      height: 600,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => void 0
    });
    const auxiliaryBarPart = {
      getContainer: () => auxiliaryBarContainer,
      layout: () => {
      }
    };
    const host = {
      getWidth: () => 260,
      setWidth: (width) => persistedWidths.push(width),
      isEditorAreaVisible: () => true,
      isEditorVisible: () => true,
      isAuxiliaryBarVisible: () => true,
      hideAuxiliaryBar: () => hideCount++,
      setEditorContentRightInset: () => {
      },
      getHeaderHeight: () => 0
    };
    const controller = new DockedAuxiliaryBarController(editorContainer, auxiliaryBarPart, host);
    controller.layout();
    const sash = Reflect.get(controller, "_sash");
    const start = Reflect.get(sash, "_onDidStart");
    const change = Reflect.get(sash, "_onDidChange");
    start.fire({ startX: 0, currentX: 0, startY: 0, currentY: 0, altKey: false });
    change.fire({ startX: 0, currentX: 270, startY: 0, currentY: 0, altKey: false });
    assert.deepStrictEqual({ hideCount, persistedWidths }, { hideCount: 1, persistedWidths: [] });
    controller.dispose();
  });
  test("docked last editor close hides the whole side pane under suppression", () => {
    const editorHiddenCalls = [];
    const auxHiddenCalls = [];
    const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: true }, editorGroupService: { mainPart: { groups: [{ isEmpty: true }] } } });
    host.setEditorHidden = (hidden) => {
      editorHiddenCalls.push({ hidden, suppression: host._editorPartAutoVisibilitySuppressionCount });
      host.partVisibility.editor = !hidden;
    };
    host.setAuxiliaryBarHidden = (hidden) => {
      auxHiddenCalls.push({ hidden, suppression: host._editorPartAutoVisibilitySuppressionCount });
      host.partVisibility.auxiliaryBar = !hidden;
    };
    handleDidCloseEditor.call(host);
    assert.deepStrictEqual({
      editorHiddenCalls,
      auxHiddenCalls,
      visibility: host.partVisibility,
      suppression: host._editorPartAutoVisibilitySuppressionCount
    }, {
      editorHiddenCalls: [{ hidden: true, suppression: 1 }],
      auxHiddenCalls: [{ hidden: true, suppression: 1 }],
      visibility: {
        sidebar: true,
        auxiliaryBar: false,
        editor: false,
        panel: false,
        sessions: true,
        customViewGrid: false
      },
      suppression: 0
    });
  });
  test("docked last editor close hides lingering detail when editor is already hidden", () => {
    const editorHiddenCalls = [];
    const auxHiddenCalls = [];
    const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true }, editorGroupService: { mainPart: { groups: [{ isEmpty: true }] } } });
    host.setEditorHidden = (hidden) => {
      editorHiddenCalls.push(hidden);
      host.partVisibility.editor = !hidden;
    };
    host.setAuxiliaryBarHidden = (hidden) => {
      auxHiddenCalls.push({ hidden, suppression: host._editorPartAutoVisibilitySuppressionCount });
      host.partVisibility.auxiliaryBar = !hidden;
    };
    handleDidCloseEditor.call(host);
    assert.deepStrictEqual({
      editorHiddenCalls,
      auxHiddenCalls,
      editorVisible: host.partVisibility.editor,
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar
    }, {
      editorHiddenCalls: [],
      auxHiddenCalls: [{ hidden: true, suppression: 1 }],
      editorVisible: false,
      auxiliaryBarVisible: false
    });
  });
  function createWorkbenchHarness() {
    return {
      partVisibility: { sidebar: true, auxiliaryBar: true, editor: true, panel: false, sessions: true },
      layoutPolicy: { viewportClass: { get: () => "desktop" } },
      storageService: { store: () => {
      } },
      _editorPartAutoVisibilitySuppressionCount: 0,
      _editorMaximized: false,
      _restoreAttachedEditorMaximizedOnShow: false,
      setEditorMaximized: () => {
      },
      _savePartVisibility: () => {
      }
    };
  }
  test("restores attached editor maximized state when the auxiliary bar stays visible", () => {
    const maximizedStates = [];
    const workbench = createWorkbenchHarness();
    workbench._editorMaximized = true;
    workbench.setEditorMaximized = (maximized) => maximizedStates.push(maximized);
    rememberAttachedEditorMaximizedState.call(workbench);
    workbench._editorMaximized = false;
    restoreAttachedEditorMaximizedState.call(workbench);
    assert.deepStrictEqual(maximizedStates, [true]);
    assert.strictEqual(workbench._restoreAttachedEditorMaximizedOnShow, false);
  });
  test("does not restore attached editor maximized state once the auxiliary bar is hidden", () => {
    const maximizedStates = [];
    const workbench = createWorkbenchHarness();
    workbench._editorMaximized = true;
    workbench.setEditorMaximized = (maximized) => maximizedStates.push(maximized);
    rememberAttachedEditorMaximizedState.call(workbench);
    workbench._editorMaximized = false;
    workbench.partVisibility.auxiliaryBar = false;
    restoreAttachedEditorMaximizedState.call(workbench);
    assert.deepStrictEqual(maximizedStates, []);
    assert.strictEqual(workbench._restoreAttachedEditorMaximizedOnShow, false);
  });
  test("does not restore after the auxiliary bar is hidden and shown again before reopen", () => {
    const maximizedStates = [];
    const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: true } });
    host._editorMaximized = true;
    host.setEditorMaximized = (maximized) => maximizedStates.push(maximized);
    rememberAttachedEditorMaximizedState.call(host);
    setAuxiliaryBarHidden.call(host, true);
    setAuxiliaryBarHidden.call(host, false);
    host._editorMaximized = false;
    restoreAttachedEditorMaximizedState.call(host);
    assert.deepStrictEqual(maximizedStates, []);
    assert.strictEqual(host._restoreAttachedEditorMaximizedOnShow, false);
  });
  test("docked auxiliary bar hide reveals hidden editor content", () => {
    const editorHiddenCalls = [];
    const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true } });
    host.setEditorHidden = (hidden) => {
      editorHiddenCalls.push(hidden);
      host.partVisibility.editor = !hidden;
    };
    setAuxiliaryBarHidden.call(host, true);
    assert.deepStrictEqual({
      editorHiddenCalls,
      editorVisible: host.partVisibility.editor,
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      gridVisible: host.visibilityChanges
    }, {
      editorHiddenCalls: [false],
      editorVisible: true,
      auxiliaryBarVisible: false,
      gridVisible: [true]
    });
  });
  test("docked auxiliary bar hide does not reveal editor while side pane toggle is suppressed", () => {
    const editorHiddenCalls = [];
    const host = createHost({ single: true, suppressionCount: 1, partVisibility: { editor: false, auxiliaryBar: true } });
    host.setEditorHidden = (hidden) => {
      editorHiddenCalls.push(hidden);
      host.partVisibility.editor = !hidden;
    };
    setAuxiliaryBarHidden.call(host, true);
    assert.deepStrictEqual({
      editorHiddenCalls,
      editorVisible: host.partVisibility.editor,
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      gridVisible: host.visibilityChanges
    }, {
      editorHiddenCalls: [],
      editorVisible: false,
      auxiliaryBarVisible: false,
      gridVisible: [false]
    });
  });
  test("docked auxiliary bar show does not force-open an empty (gated-off) container", () => {
    const openedContainers = [];
    const host = createHost({
      single: true,
      partVisibility: { editor: true, auxiliaryBar: false },
      viewDescriptorService: {
        getDefaultViewContainer: () => ({ id: "empty.container" }),
        getViewContainerById: () => ({ hideIfEmpty: true }),
        getViewContainerModel: () => ({ activeViewDescriptors: [] })
      }
    });
    host.paneCompositeService.openPaneComposite = (id) => {
      openedContainers.push(id);
    };
    setAuxiliaryBarHidden.call(host, false);
    assert.deepStrictEqual(openedContainers, [], "must not force-open an empty container in docked mode");
  });
  test("docked auxiliary bar show opens a container that has active views", () => {
    const openedContainers = [];
    const host = createHost({
      single: true,
      partVisibility: { editor: true, auxiliaryBar: false },
      viewDescriptorService: {
        getDefaultViewContainer: () => ({ id: "active.container" }),
        getViewContainerById: () => ({ hideIfEmpty: true }),
        getViewContainerModel: () => ({ activeViewDescriptors: [{}] })
      }
    });
    host.paneCompositeService.openPaneComposite = (id) => {
      openedContainers.push(id);
    };
    setAuxiliaryBarHidden.call(host, false);
    assert.deepStrictEqual(openedContainers, ["active.container"], "must open a container that has active views");
  });
  test("restores editor size and auxiliary bar visibility when un-maximizing", () => {
    const editorPartView = {};
    const resizes = [];
    const auxiliaryBarHiddenCalls = [];
    let editorSize = { width: 700, height: 800 };
    const harness = {
      partVisibility: { sidebar: true, auxiliaryBar: false, editor: true, panel: false, sessions: true },
      editorPartView,
      workbenchGrid: {
        getViewSize: () => editorSize,
        resizeView: (_view, size) => {
          resizes.push(size);
          editorSize = size;
        }
      },
      _editorMaximized: false,
      _onDidChangeEditorMaximized: { fire: () => {
      } },
      _layoutSidePane: () => {
      },
      setEditorHidden: () => {
      },
      setSideBarHidden: (hidden) => {
        harness.partVisibility.sidebar = !hidden;
      },
      setSessionsHidden: (hidden) => {
        harness.partVisibility.sessions = !hidden;
      },
      setAuxiliaryBarHidden: (hidden) => {
        auxiliaryBarHiddenCalls.push(hidden);
        harness.partVisibility.auxiliaryBar = !hidden;
      }
    };
    setEditorMaximized.call(harness, true);
    harness.partVisibility.auxiliaryBar = true;
    editorSize = { width: 500, height: 800 };
    setEditorMaximized.call(harness, false);
    assert.deepStrictEqual({
      auxiliaryBarHiddenCalls,
      resizes,
      auxiliaryBarVisible: harness.partVisibility.auxiliaryBar,
      sidebarVisible: harness.partVisibility.sidebar,
      sessionsVisible: harness.partVisibility.sessions
    }, {
      auxiliaryBarHiddenCalls: [true],
      resizes: [{ width: 700, height: 800 }],
      auxiliaryBarVisible: false,
      sidebarVisible: true,
      sessionsVisible: true
    });
  });
  test("showing a custom view hides the sessions grid, editor, side panel and panel", () => {
    const host = createHost({ partVisibility: { editor: true, auxiliaryBar: true, panel: true, sessions: true } });
    const descriptor = {};
    applyCustomViewGridVisibility.call(host, descriptor);
    assert.deepStrictEqual({
      renderedCustomViews: host.renderedCustomViews,
      customViewGridVisible: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART),
      sessions: isVisible.call(host, Parts.SESSIONS_PART),
      editor: isVisible.call(host, Parts.EDITOR_PART),
      auxiliaryBar: isVisible.call(host, Parts.AUXILIARYBAR_PART),
      panel: isVisible.call(host, Parts.PANEL_PART),
      sideBar: isVisible.call(host, Parts.SIDEBAR_PART),
      gridNodes: {
        customViewGrid: host.gridVisibility.get(host.customViewGridPartView),
        sessions: host.gridVisibility.get(host.sessionsPartView),
        editor: host.gridVisibility.get(host.editorPartView),
        panel: host.gridVisibility.get(host.panelPartView)
      },
      events: host.events,
      focusedParts: host.focusedParts
    }, {
      renderedCustomViews: [descriptor],
      customViewGridVisible: true,
      sessions: false,
      editor: false,
      auxiliaryBar: false,
      panel: false,
      sideBar: true,
      gridNodes: {
        customViewGrid: true,
        sessions: false,
        editor: false,
        panel: false
      },
      events: [
        { partId: Parts.CUSTOM_VIEW_GRID_PART, visible: true },
        { partId: Parts.SESSIONS_PART, visible: false },
        { partId: Parts.EDITOR_PART, visible: false },
        { partId: Parts.AUXILIARYBAR_PART, visible: false },
        { partId: Parts.PANEL_PART, visible: false }
      ],
      focusedParts: [Parts.CUSTOM_VIEW_GRID_PART]
    });
  });
  test("hiding the custom view restores the desired part visibility, including changes made while it was shown", () => {
    const host = createHost({ partVisibility: { editor: true, auxiliaryBar: true, panel: false, sessions: true } });
    applyCustomViewGridVisibility.call(host, {});
    setEditorHidden.call(host, true);
    const whileShown = {
      editor: isVisible.call(host, Parts.EDITOR_PART),
      editorNode: host.gridVisibility.get(host.editorPartView)
    };
    applyCustomViewGridVisibility.call(host, void 0);
    assert.deepStrictEqual({
      whileShown,
      customViewGridVisible: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART),
      renderedCustomViewCount: host.renderedCustomViews.length,
      lastRenderedCustomView: host.renderedCustomViews[host.renderedCustomViews.length - 1],
      sessions: isVisible.call(host, Parts.SESSIONS_PART),
      editor: isVisible.call(host, Parts.EDITOR_PART),
      auxiliaryBar: isVisible.call(host, Parts.AUXILIARYBAR_PART),
      panel: isVisible.call(host, Parts.PANEL_PART),
      focusedSessions: host.focusedSessions
    }, {
      whileShown: { editor: false, editorNode: false },
      customViewGridVisible: false,
      renderedCustomViewCount: 2,
      lastRenderedCustomView: void 0,
      sessions: true,
      editor: false,
      auxiliaryBar: true,
      panel: false,
      focusedSessions: 1
    });
  });
  test("swapping to another custom view re-renders it without touching the layout", () => {
    const host = createHost({ partVisibility: { editor: true, auxiliaryBar: true, sessions: true } });
    const first = {};
    const second = {};
    applyCustomViewGridVisibility.call(host, first);
    const eventsAfterShow = host.events.length;
    applyCustomViewGridVisibility.call(host, second);
    assert.deepStrictEqual({
      renderedCustomViews: host.renderedCustomViews,
      customViewGridVisible: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART),
      sessions: isVisible.call(host, Parts.SESSIONS_PART),
      eventsAfterSwap: host.events.length - eventsAfterShow
    }, {
      renderedCustomViews: [first, second],
      customViewGridVisible: true,
      sessions: false,
      eventsAfterSwap: 0
    });
  });
  test("tracks the custom view in the phone navigation stack and drops it when leaving phone layout", () => {
    const host = createHost();
    host.layoutPolicy.viewportClass.get = () => "phone";
    applyCustomViewGridVisibility.call(host, {});
    const onPhone = [...host.mobileNavLayers];
    host.layoutPolicy.viewportClass.get = () => "desktop";
    updateMobileCustomViewNavigation.call(host);
    assert.deepStrictEqual({ onPhone, afterLeavingPhone: host.mobileNavLayers }, {
      onPhone: ["customView"],
      afterLeavingPhone: []
    });
  });
  test("the secondary side bar toggle is inert while a custom view is shown", () => {
    const host = createHost({ partVisibility: { auxiliaryBar: true } });
    applyCustomViewGridVisibility.call(host, {});
    toggleSecondarySideBar.call(host);
    assert.strictEqual(host.partVisibility.auxiliaryBar, true);
  });
  test("showing a custom view un-maximizes the editor so the sessions grid owns the row again on hide", () => {
    const host = createHost({ editorMaximize: true, partVisibility: { editor: true, auxiliaryBar: true, sessions: true } });
    setEditorMaximized.call(host, true);
    applyCustomViewGridVisibility.call(host, {});
    const whileShown = {
      editorMaximized: host._editorMaximized,
      sessions: isVisible.call(host, Parts.SESSIONS_PART),
      customViewGrid: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART)
    };
    applyCustomViewGridVisibility.call(host, void 0);
    assert.deepStrictEqual({
      whileShown,
      sessions: isVisible.call(host, Parts.SESSIONS_PART),
      customViewGrid: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART)
    }, {
      whileShown: { editorMaximized: false, sessions: false, customViewGrid: true },
      sessions: true,
      customViewGrid: false
    });
  });
  test("does not restore saved desktop part visibility on phone layout", () => {
    let getCalled = false;
    const workbench = createWorkbenchHarness();
    workbench.layoutPolicy.viewportClass.get = () => "phone";
    const storageService = {
      get: () => {
        getCalled = true;
        return JSON.stringify({ editor: true, auxiliaryBar: true, sidebar: true });
      },
      remove: () => {
      }
    };
    const restored = loadPartVisibility.call(workbench, storageService);
    assert.deepStrictEqual(restored, {});
    assert.strictEqual(getCalled, false);
  });
  test("restores saved desktop part visibility outside phone layout", () => {
    const workbench = createWorkbenchHarness();
    workbench.layoutPolicy.viewportClass.get = () => "desktop";
    const storageService = {
      get: () => JSON.stringify({ editor: true, auxiliaryBar: false, sidebar: false }),
      remove: () => {
      }
    };
    const restored = loadPartVisibility.call(workbench, storageService);
    assert.deepStrictEqual(restored, { editor: true, auxiliaryBar: false, sidebar: false });
  });
  test("does not persist part visibility on phone layout", () => {
    let storeCalled = false;
    const workbench = createWorkbenchHarness();
    workbench.layoutPolicy.viewportClass.get = () => "phone";
    workbench.storageService.store = () => {
      storeCalled = true;
    };
    savePartVisibility.call(workbench);
    assert.strictEqual(storeCalled, false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2gudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFNhc2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydC5qcyc7XG5pbXBvcnQgeyBJUGFydFZpc2liaWxpdHlDaGFuZ2VFdmVudCwgUGFydHMgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBEb2NrZWRBdXhpbGlhcnlCYXJDb250cm9sbGVyLCBJRG9ja2VkQXV4aWxpYXJ5QmFySG9zdCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZG9ja2VkQXV4aWxpYXJ5QmFyQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2ggfSBmcm9tICcuLi8uLi9icm93c2VyL3dvcmtiZW5jaC5qcyc7XG5pbXBvcnQgeyBEb2NrZWRFZGl0b3JTaXplTWVtZW50bywgU2luZ2xlUGFuZVdvcmtiZW5jaCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2luZ2xlUGFuZVdvcmtiZW5jaC5qcyc7XG5pbXBvcnQgeyBTaW5nbGVQYW5lTWFpbkVkaXRvclBhcnQgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL3NpbmdsZVBhbmVFZGl0b3JQYXJ0LmpzJztcbmltcG9ydCB7IERvY2tlZEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2RvY2tlZEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgU0VTU0lPTlNfTElTVF9NSU5JTVVNX1dJRFRIIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wYXJ0cy9zaWRlYmFyUGFydC5qcyc7XG5cbmludGVyZmFjZSBJVmlld1NpemUgeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9XG5cbi8qKiBNaW5pbWFsIGRvY2tlZCBlZGl0b3IgaW5wdXQgZm9yIHRlc3RpbmcgdGhlIHNpbmdsZS1wYW5lIHJldmVhbCBwb2xpY3kuICovXG5jbGFzcyBUZXN0RG9ja2VkRWRpdG9ySW5wdXQgZXh0ZW5kcyBEb2NrZWRFZGl0b3JJbnB1dCB7XG5cdG92ZXJyaWRlIGdldCB0eXBlSWQoKTogc3RyaW5nIHsgcmV0dXJuICd0ZXN0LmRvY2tlZEVkaXRvcic7IH1cblx0b3ZlcnJpZGUgZ2V0IHJlc291cmNlKCk6IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cbn1cblxuc3VpdGUoJ1Nlc3Npb25zIC0gV29ya2JlbmNoJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyBSZWFsIFdvcmtiZW5jaCBtZXRob2RzIGludm9rZWQgYWdhaW5zdCBhIHByb3RvdHlwZS1jaGFpbmVkIGZha2UgaGFybmVzcyBzb1xuXHQvLyB0aGUgcHJvdGVjdGVkIGxheW91dCBob29rcyBkaXNwYXRjaCB0byB0aGUgYmFzZSAoZ3JpZCkgb3IgU2luZ2xlUGFuZVdvcmtiZW5jaFxuXHQvLyAoZG9ja2VkKSBvdmVycmlkZSwgZXhhY3RseSBhcyBhdCBydW50aW1lLlxuXHRjb25zdCBzZXRFZGl0b3JIaWRkZW4gPSBSZWZsZWN0LmdldChXb3JrYmVuY2gucHJvdG90eXBlLCAnc2V0RWRpdG9ySGlkZGVuJykgYXMgKHRoaXM6IElUZXN0V29ya2JlbmNoLCBoaWRkZW46IGJvb2xlYW4sIGV4cGxpY2l0PzogYm9vbGVhbikgPT4gdm9pZDtcblx0Y29uc3Qgc2V0QXV4aWxpYXJ5QmFySGlkZGVuID0gUmVmbGVjdC5nZXQoV29ya2JlbmNoLnByb3RvdHlwZSwgJ3NldEF1eGlsaWFyeUJhckhpZGRlbicpIGFzICh0aGlzOiBJVGVzdFdvcmtiZW5jaCwgaGlkZGVuOiBib29sZWFuKSA9PiB2b2lkO1xuXHRjb25zdCBzZXRTaWRlQmFySGlkZGVuID0gUmVmbGVjdC5nZXQoV29ya2JlbmNoLnByb3RvdHlwZSwgJ3NldFNpZGVCYXJIaWRkZW4nKSBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gsIGhpZGRlbjogYm9vbGVhbikgPT4gdm9pZDtcblx0Y29uc3QgaGFuZGxlRGlkQ2xvc2VFZGl0b3IgPSBSZWZsZWN0LmdldChXb3JrYmVuY2gucHJvdG90eXBlLCAnaGFuZGxlRGlkQ2xvc2VFZGl0b3InKSBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gpID0+IHZvaWQ7XG5cdGNvbnN0IHNldEVkaXRvck1heGltaXplZCA9IFJlZmxlY3QuZ2V0KFdvcmtiZW5jaC5wcm90b3R5cGUsICdzZXRFZGl0b3JNYXhpbWl6ZWQnKSBhcyAodGhpczogSU1heGltaXplVGVzdEhhcm5lc3MsIG1heGltaXplZDogYm9vbGVhbikgPT4gdm9pZDtcblx0Y29uc3Qgb25FZGl0b3JOb2RlUmVzaXplZCA9IFJlZmxlY3QuZ2V0KFNpbmdsZVBhbmVXb3JrYmVuY2gucHJvdG90eXBlLCAnX29uRWRpdG9yTm9kZVJlc2l6ZWQnKSBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gsIG5vZGVXaWR0aDogbnVtYmVyKSA9PiB2b2lkO1xuXHRjb25zdCBvbkdyaWREaWRDaGFuZ2UgPSBSZWZsZWN0LmdldChTaW5nbGVQYW5lV29ya2JlbmNoLnByb3RvdHlwZSwgJ19vbkdyaWREaWRDaGFuZ2UnKSBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gpID0+IHZvaWQ7XG5cdGNvbnN0IG9uRWRpdG9yUGFydEdyaWRWaXNpYmlsaXR5Q2hhbmdlID0gUmVmbGVjdC5nZXQoU2luZ2xlUGFuZVdvcmtiZW5jaC5wcm90b3R5cGUsICdfb25FZGl0b3JQYXJ0R3JpZFZpc2liaWxpdHlDaGFuZ2UnKSBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gsIHZpc2libGU6IGJvb2xlYW4pID0+IHZvaWQ7XG5cdGNvbnN0IHBlcnNpc3RlZEF1eGlsaWFyeUJhcldpZHRoID0gUmVmbGVjdC5nZXQoU2luZ2xlUGFuZVdvcmtiZW5jaC5wcm90b3R5cGUsICdfcGVyc2lzdGVkR3JpZFZpZXdTaXplJykgYXMgKHRoaXM6IElUZXN0V29ya2JlbmNoLCB2aWV3OiBvYmplY3QsIGRpbWVuc2lvbjogJ3dpZHRoJyB8ICdoZWlnaHQnLCB2aXNpYmxlOiBib29sZWFuKSA9PiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGNvbnN0IHBlcnNpc3RlZEVkaXRvcldpZHRoID0gUmVmbGVjdC5nZXQoU2luZ2xlUGFuZVdvcmtiZW5jaC5wcm90b3R5cGUsICdfcGVyc2lzdGVkRWRpdG9yV2lkdGgnKSBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gsIGVkaXRvckdyaWRXaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkKSA9PiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGNvbnN0IHJlbWVtYmVyQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZSA9IFJlZmxlY3QuZ2V0KFdvcmtiZW5jaC5wcm90b3R5cGUsICdyZW1lbWJlckF0dGFjaGVkRWRpdG9yTWF4aW1pemVkU3RhdGUnKSBhcyAodGhpczogSVdvcmtiZW5jaFRlc3RIYXJuZXNzKSA9PiB2b2lkO1xuXHRjb25zdCByZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZSA9IFJlZmxlY3QuZ2V0KFdvcmtiZW5jaC5wcm90b3R5cGUsICdyZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZScpIGFzICh0aGlzOiBJV29ya2JlbmNoVGVzdEhhcm5lc3MpID0+IHZvaWQ7XG5cdGNvbnN0IGxvYWRQYXJ0VmlzaWJpbGl0eSA9IFJlZmxlY3QuZ2V0KFdvcmtiZW5jaC5wcm90b3R5cGUsICdfbG9hZFBhcnRWaXNpYmlsaXR5JykgYXMgKHRoaXM6IElXb3JrYmVuY2hUZXN0SGFybmVzcywgc3RvcmFnZVNlcnZpY2U6IHsgZ2V0KCk6IHN0cmluZyB8IHVuZGVmaW5lZDsgcmVtb3ZlKCk6IHZvaWQgfSkgPT4geyBlZGl0b3I/OiBib29sZWFuOyBhdXhpbGlhcnlCYXI/OiBib29sZWFuOyBzaWRlYmFyPzogYm9vbGVhbiB9O1xuXHRjb25zdCBzYXZlUGFydFZpc2liaWxpdHkgPSBSZWZsZWN0LmdldChXb3JrYmVuY2gucHJvdG90eXBlLCAnX3NhdmVQYXJ0VmlzaWJpbGl0eScpIGFzICh0aGlzOiBJV29ya2JlbmNoVGVzdEhhcm5lc3MpID0+IHZvaWQ7XG5cdGNvbnN0IHJldmVhbEVkaXRvck9uT3BlbiA9IFJlZmxlY3QuZ2V0KFdvcmtiZW5jaC5wcm90b3R5cGUsICdyZXZlYWxFZGl0b3JPbk9wZW4nKSBhcyAodGhpczogSVdpbGxPcGVuVGVzdEhhcm5lc3MsIGU6IHsgZ3JvdXBJZDogbnVtYmVyOyBlZGl0b3I6IHVua25vd24gfSkgPT4gdm9pZDtcblx0Y29uc3QgcmV2ZWFsRWRpdG9yT25PcGVuU2luZ2xlUGFuZSA9IFJlZmxlY3QuZ2V0KFNpbmdsZVBhbmVXb3JrYmVuY2gucHJvdG90eXBlLCAncmV2ZWFsRWRpdG9yT25PcGVuJykgYXMgKHRoaXM6IElXaWxsT3BlblRlc3RIYXJuZXNzLCBlOiB7IGdyb3VwSWQ6IG51bWJlcjsgZWRpdG9yOiB1bmtub3duIH0pID0+IHZvaWQ7XG5cdGNvbnN0IGNyZWF0ZURlc2t0b3BHcmlkRGVzY3JpcHRvciA9IFJlZmxlY3QuZ2V0KFdvcmtiZW5jaC5wcm90b3R5cGUsICdjcmVhdGVEZXNrdG9wR3JpZERlc2NyaXB0b3InKSBhcyAodGhpczogSUdyaWREZXNjcmlwdG9yVGVzdEhhcm5lc3MsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKSA9PiB7IHJvb3Q6IHsgZGF0YTogcmVhZG9ubHkgdW5rbm93bltdIH0gfTtcblx0Y29uc3Qgc2F2ZVBhcnRTaXplcyA9IFJlZmxlY3QuZ2V0KFdvcmtiZW5jaC5wcm90b3R5cGUsICdfc2F2ZVBhcnRTaXplcycpIGFzICh0aGlzOiBJU2F2ZVBhcnRTaXplc1Rlc3RIYXJuZXNzKSA9PiB2b2lkO1xuXHRjb25zdCBpc0VkaXRvclBhbmVWaXNpYmxlID0gV29ya2JlbmNoLnByb3RvdHlwZS5pc0VkaXRvclBhbmVWaXNpYmxlIGFzICh0aGlzOiBJVGVzdFdvcmtiZW5jaCkgPT4gYm9vbGVhbjtcblx0Y29uc3QgaXNTaW5nbGVQYW5lRWRpdG9yUGFuZVZpc2libGUgPSBTaW5nbGVQYW5lV29ya2JlbmNoLnByb3RvdHlwZS5pc0VkaXRvclBhbmVWaXNpYmxlIGFzICh0aGlzOiBJVGVzdFdvcmtiZW5jaCkgPT4gYm9vbGVhbjtcblx0Y29uc3QgdG9nZ2xlU2Vjb25kYXJ5U2lkZUJhclNpbmdsZVBhbmUgPSBTaW5nbGVQYW5lV29ya2JlbmNoLnByb3RvdHlwZS50b2dnbGVTZWNvbmRhcnlTaWRlQmFyIGFzICh0aGlzOiBJVGVzdFdvcmtiZW5jaCkgPT4gdm9pZDtcblx0Y29uc3QgaXNTZWNvbmRhcnlTaWRlQmFyVmlzaWJsZVNpbmdsZVBhbmUgPSBTaW5nbGVQYW5lV29ya2JlbmNoLnByb3RvdHlwZS5pc1NlY29uZGFyeVNpZGVCYXJWaXNpYmxlIGFzICh0aGlzOiBJVGVzdFdvcmtiZW5jaCkgPT4gYm9vbGVhbjtcblx0Y29uc3QgYXBwbHlDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkgPSBSZWZsZWN0LmdldChXb3JrYmVuY2gucHJvdG90eXBlLCAnX2FwcGx5Q3VzdG9tVmlld0dyaWRWaXNpYmlsaXR5JykgYXMgKHRoaXM6IElUZXN0V29ya2JlbmNoLCBkZXNjcmlwdG9yOiBvYmplY3QgfCB1bmRlZmluZWQpID0+IHZvaWQ7XG5cdGNvbnN0IHNldFNlc3Npb25zSGlkZGVuID0gUmVmbGVjdC5nZXQoV29ya2JlbmNoLnByb3RvdHlwZSwgJ3NldFNlc3Npb25zSGlkZGVuJykgYXMgKHRoaXM6IElUZXN0V29ya2JlbmNoLCBoaWRkZW46IGJvb2xlYW4pID0+IHZvaWQ7XG5cdGNvbnN0IHNldFBhbmVsSGlkZGVuID0gUmVmbGVjdC5nZXQoV29ya2JlbmNoLnByb3RvdHlwZSwgJ3NldFBhbmVsSGlkZGVuJykgYXMgKHRoaXM6IElUZXN0V29ya2JlbmNoLCBoaWRkZW46IGJvb2xlYW4pID0+IHZvaWQ7XG5cdGNvbnN0IHVwZGF0ZU1vYmlsZUN1c3RvbVZpZXdOYXZpZ2F0aW9uID0gUmVmbGVjdC5nZXQoV29ya2JlbmNoLnByb3RvdHlwZSwgJ191cGRhdGVNb2JpbGVDdXN0b21WaWV3TmF2aWdhdGlvbicpIGFzICh0aGlzOiBJVGVzdFdvcmtiZW5jaCkgPT4gdm9pZDtcblx0Y29uc3QgaXNWaXNpYmxlID0gV29ya2JlbmNoLnByb3RvdHlwZS5pc1Zpc2libGUgYXMgKHRoaXM6IElUZXN0V29ya2JlbmNoLCBwYXJ0OiBQYXJ0cykgPT4gYm9vbGVhbjtcblx0Y29uc3QgdG9nZ2xlU2Vjb25kYXJ5U2lkZUJhciA9IFdvcmtiZW5jaC5wcm90b3R5cGUudG9nZ2xlU2Vjb25kYXJ5U2lkZUJhciBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gpID0+IHZvaWQ7XG5cblx0Ly8gLS0tIEhhcm5lc3MgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0aW50ZXJmYWNlIElUZXN0V29ya2JlbmNoIHtcblx0XHRwYXJ0VmlzaWJpbGl0eTogeyBzaWRlYmFyOiBib29sZWFuOyBhdXhpbGlhcnlCYXI6IGJvb2xlYW47IGVkaXRvcjogYm9vbGVhbjsgcGFuZWw6IGJvb2xlYW47IHNlc3Npb25zOiBib29sZWFuOyBjdXN0b21WaWV3R3JpZDogYm9vbGVhbiB9O1xuXHRcdGF1eGlsaWFyeUJhclBhcnRWaWV3OiBvYmplY3Q7XG5cdFx0X3NhdmVkUGFydFNpemVzOiB7IHNpZGViYXI/OiBudW1iZXI7IGF1eGlsaWFyeUJhcj86IG51bWJlcjsgZWRpdG9yPzogbnVtYmVyOyBzZXNzaW9ucz86IG51bWJlcjsgcGFuZWw/OiBudW1iZXIgfTtcblx0XHRfZWRpdG9yTWF4aW1pemVkOiBib29sZWFuO1xuXHRcdF9lZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHk6IGJvb2xlYW47XG5cdFx0X2VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uQ291bnQ6IG51bWJlcjtcblx0XHRfcmVzdG9yZUF0dGFjaGVkRWRpdG9yTWF4aW1pemVkT25TaG93OiBib29sZWFuO1xuXHRcdF9oYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0OiBib29sZWFuO1xuXHRcdF9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aDogbnVtYmVyO1xuXHRcdF9kZXRhaWxIaWRkZW5Gb3JFZGl0b3JSZXNpemU6IGJvb2xlYW47XG5cdFx0X21lbWVudG86IERvY2tlZEVkaXRvclNpemVNZW1lbnRvO1xuXHRcdHJlYWRvbmx5IHJlc2l6ZXM6IElWaWV3U2l6ZVtdO1xuXHRcdHJlYWRvbmx5IHZpc2liaWxpdHlDaGFuZ2VzOiBib29sZWFuW107XG5cdFx0cmVhZG9ubHkgZXZlbnRzOiBJUGFydFZpc2liaWxpdHlDaGFuZ2VFdmVudFtdO1xuXHRcdHJlYWRvbmx5IGNsYXNzVG9nZ2xlczogeyBuYW1lOiBzdHJpbmc7IGZvcmNlOiBib29sZWFuIH1bXTtcblx0XHRyZWFkb25seSBjb3VudHM6IHsgc2F2ZTogbnVtYmVyOyBsYXlvdXQ6IG51bWJlciB9O1xuXHRcdHJlYWRvbmx5IHNpZGVQYW5lUmV2ZWFsczogYm9vbGVhbltdO1xuXHRcdHJlYWRvbmx5IGZvY3VzZWRQYXJ0czogUGFydHNbXTtcblx0XHRyZWFkb25seSByZW5kZXJlZEN1c3RvbVZpZXdzOiAob2JqZWN0IHwgdW5kZWZpbmVkKVtdO1xuXHRcdHJlYWRvbmx5IGdyaWRWaXNpYmlsaXR5OiBNYXA8b2JqZWN0LCBib29sZWFuPjtcblx0XHRyZWFkb25seSBtb2JpbGVOYXZMYXllcnM6IHN0cmluZ1tdO1xuXHRcdHJlYWRvbmx5IGZvY3VzZWRTZXNzaW9uczogbnVtYmVyO1xuXHRcdGxheW91dFBvbGljeTogeyB2aWV3cG9ydENsYXNzOiB7IGdldCgpOiBzdHJpbmcgfSB9O1xuXHRcdHNlc3Npb25zUGFydFZpZXc6IG9iamVjdDtcblx0XHRwYW5lbFBhcnRWaWV3OiBvYmplY3Q7XG5cdFx0Y3VzdG9tVmlld0dyaWRQYXJ0Vmlldzogb2JqZWN0O1xuXHRcdGVkaXRvclBhcnRWaWV3OiBvYmplY3Q7XG5cdFx0c2V0RWRpdG9ySGlkZGVuKGhpZGRlbjogYm9vbGVhbiwgZXhwbGljaXQ/OiBib29sZWFuKTogdm9pZDtcblx0XHRzZXRBdXhpbGlhcnlCYXJIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZDtcblx0fVxuXG5cdGludGVyZmFjZSBJR3JpZERlc2NyaXB0b3JUZXN0SGFybmVzcyBleHRlbmRzIElUZXN0V29ya2JlbmNoIHtcblx0XHRfc2F2ZWRQYXJ0U2l6ZXM6IHsgc2lkZWJhcj86IG51bWJlcjsgYXV4aWxpYXJ5QmFyPzogbnVtYmVyOyBlZGl0b3I/OiBudW1iZXI7IHNlc3Npb25zPzogbnVtYmVyOyBwYW5lbD86IG51bWJlciB9O1xuXHRcdGxheW91dFBvbGljeToge1xuXHRcdFx0Z2V0UGFydFNpemVzKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogeyBzaWRlQmFyU2l6ZTogbnVtYmVyOyBhdXhpbGlhcnlCYXJTaXplOiBudW1iZXI7IHBhbmVsU2l6ZTogbnVtYmVyIH07XG5cdFx0XHR2aWV3cG9ydENsYXNzOiB7IGdldCgpOiBzdHJpbmcgfTtcblx0XHR9O1xuXHRcdHRpdGxlQmFyUGFydFZpZXc6IHsgbWluaW11bUhlaWdodDogbnVtYmVyIH07XG5cdH1cblxuXHRpbnRlcmZhY2UgSVNhdmVQYXJ0U2l6ZXNUZXN0SGFybmVzcyB7XG5cdFx0ZWRpdG9yUGFydFZpZXc6IG9iamVjdDtcblx0XHRzZXNzaW9uc1BhcnRWaWV3OiBvYmplY3Q7XG5cdFx0c2lkZUJhclBhcnRWaWV3OiBvYmplY3Q7XG5cdFx0YXV4aWxpYXJ5QmFyUGFydFZpZXc6IG9iamVjdDtcblx0XHRwYW5lbFBhcnRWaWV3OiBvYmplY3Q7XG5cdFx0cGFydFZpc2liaWxpdHk6IHsgc2lkZWJhcjogYm9vbGVhbjsgYXV4aWxpYXJ5QmFyOiBib29sZWFuOyBlZGl0b3I6IGJvb2xlYW47IHBhbmVsOiBib29sZWFuOyBzZXNzaW9uczogYm9vbGVhbiB9O1xuXHRcdF9zYXZlZFBhcnRTaXplczogeyBlZGl0b3I/OiBudW1iZXIgfTtcblx0XHRfZG9ja2VkQXV4aWxpYXJ5QmFyV2lkdGg6IG51bWJlcjtcblx0XHRfbWVtZW50bzogRG9ja2VkRWRpdG9yU2l6ZU1lbWVudG87XG5cdFx0bG9nU2VydmljZTogdW5kZWZpbmVkO1xuXHRcdHdvcmtiZW5jaEdyaWQ6IHtcblx0XHRcdGdldFZpZXdTaXplKHZpZXc6IG9iamVjdCk6IElWaWV3U2l6ZTtcblx0XHRcdGdldFZpZXdDYWNoZWRWaXNpYmxlU2l6ZSh2aWV3OiBvYmplY3QpOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0fTtcblx0XHRzdG9yYWdlU2VydmljZTogeyBzdG9yZShrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZywgLi4ucmVzdDogdW5rbm93bltdKTogdm9pZCB9O1xuXHR9XG5cblx0aW50ZXJmYWNlIElIb3N0T3B0aW9ucyB7XG5cdFx0c2luZ2xlPzogYm9vbGVhbjtcblx0XHRwYXJ0VmlzaWJpbGl0eT86IFBhcnRpYWw8SVRlc3RXb3JrYmVuY2hbJ3BhcnRWaXNpYmlsaXR5J10+O1xuXHRcdHNlc3Npb25zV2lkdGg/OiBudW1iZXI7XG5cdFx0d2luZG93V2lkdGg/OiBudW1iZXI7XG5cdFx0ZWRpdG9yV2lkdGg/OiBudW1iZXI7XG5cdFx0c2lkZUJhcldpZHRoPzogbnVtYmVyO1xuXHRcdGRvY2tlZFdpZHRoPzogbnVtYmVyO1xuXHRcdGhhc0FwcGxpZWRJbml0aWFsRWRpdG9yU3BsaXQ/OiBib29sZWFuO1xuXHRcdC8qKiBVc2UgdGhlIHJlYWwgYHNldEVkaXRvck1heGltaXplZGAgaW5zdGVhZCBvZiB0aGUgbm8tb3Agc3R1Yi4gKi9cblx0XHRlZGl0b3JNYXhpbWl6ZT86IGJvb2xlYW47XG5cdFx0c3VwcHJlc3Npb25Db3VudD86IG51bWJlcjtcblx0XHRmb2N1c2VkUGFydD86IFBhcnRzO1xuXHRcdGVkaXRvckdyb3VwU2VydmljZT86IHsgbWFpblBhcnQ6IHsgZ3JvdXBzOiByZWFkb25seSB7IGlzRW1wdHk6IGJvb2xlYW4gfVtdIH0gfTtcblx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2U/OiB7XG5cdFx0XHRnZXREZWZhdWx0Vmlld0NvbnRhaW5lciguLi5hcmdzOiB1bmtub3duW10pOiB7IGlkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRcdGdldFZpZXdDb250YWluZXJCeUlkPyhpZDogc3RyaW5nKTogeyBoaWRlSWZFbXB0eTogYm9vbGVhbiB9IHwgbnVsbDtcblx0XHRcdGdldFZpZXdDb250YWluZXJNb2RlbD8oY29udGFpbmVyOiBvYmplY3QpOiB7IGFjdGl2ZVZpZXdEZXNjcmlwdG9yczogcmVhZG9ubHkgb2JqZWN0W10gfTtcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlSG9zdChvcHRpb25zOiBJSG9zdE9wdGlvbnMgPSB7fSk6IElUZXN0V29ya2JlbmNoIHtcblx0XHRjb25zdCBlZGl0b3JQYXJ0VmlldyA9IHt9O1xuXHRcdGNvbnN0IHNlc3Npb25zUGFydFZpZXcgPSB7fTtcblx0XHRjb25zdCBzaWRlQmFyUGFydFZpZXcgPSB7fTtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJQYXJ0VmlldyA9IHt9O1xuXHRcdGNvbnN0IHBhbmVsUGFydFZpZXcgPSB7fTtcblx0XHRjb25zdCBjdXN0b21WaWV3R3JpZFBhcnRWaWV3ID0ge307XG5cdFx0Y29uc3QgcmVzaXplczogSVZpZXdTaXplW10gPSBbXTtcblx0XHRjb25zdCB2aXNpYmlsaXR5Q2hhbmdlczogYm9vbGVhbltdID0gW107XG5cdFx0Y29uc3QgZXZlbnRzOiBJUGFydFZpc2liaWxpdHlDaGFuZ2VFdmVudFtdID0gW107XG5cdFx0Y29uc3QgY2xhc3NUb2dnbGVzOiB7IG5hbWU6IHN0cmluZzsgZm9yY2U6IGJvb2xlYW4gfVtdID0gW107XG5cdFx0Y29uc3QgY291bnRzID0geyBzYXZlOiAwLCBsYXlvdXQ6IDAgfTtcblx0XHRjb25zdCBzaWRlUGFuZVJldmVhbHM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGNvbnN0IGZvY3VzZWRQYXJ0czogUGFydHNbXSA9IFtdO1xuXHRcdGNvbnN0IHJlbmRlcmVkQ3VzdG9tVmlld3M6IChvYmplY3QgfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRjb25zdCBncmlkVmlzaWJpbGl0eSA9IG5ldyBNYXA8b2JqZWN0LCBib29sZWFuPigpO1xuXHRcdGNvbnN0IG1vYmlsZU5hdkxheWVyczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgZm9jdXNlZFNlc3Npb25zID0gMDtcblx0XHRjb25zdCBub3RpZnlQYXJ0VmlzaWJpbGl0eSA9ICh2aWV3OiBvYmplY3QsIHZpc2libGU6IGJvb2xlYW4pID0+IG5vdGlmeVBhcnRWaXNpYmlsaXR5T24oaG9zdCBhcyB1bmtub3duIGFzIElUZXN0V29ya2JlbmNoLCB2aWV3LCB2aXNpYmxlKTtcblx0XHRsZXQgZWRpdG9yTm9kZVZpc2libGUgPSAob3B0aW9ucy5wYXJ0VmlzaWJpbGl0eT8uZWRpdG9yID8/IGZhbHNlKSB8fCAob3B0aW9ucy5wYXJ0VmlzaWJpbGl0eT8uYXV4aWxpYXJ5QmFyID8/IHRydWUpO1xuXHRcdGNvbnN0IHZpZXdTaXplcyA9IG5ldyBNYXA8b2JqZWN0LCBJVmlld1NpemU+KFtcblx0XHRcdFtlZGl0b3JQYXJ0VmlldywgeyB3aWR0aDogb3B0aW9ucy5lZGl0b3JXaWR0aCA/PyAwLCBoZWlnaHQ6IDgwMCB9XSxcblx0XHRcdFtzZXNzaW9uc1BhcnRWaWV3LCB7IHdpZHRoOiBvcHRpb25zLnNlc3Npb25zV2lkdGggPz8gMTAwMCwgaGVpZ2h0OiA4MDAgfV0sXG5cdFx0XHRbc2lkZUJhclBhcnRWaWV3LCB7IHdpZHRoOiBvcHRpb25zLnNpZGVCYXJXaWR0aCA/PyAyODAsIGhlaWdodDogODAwIH1dLFxuXHRcdFx0W2F1eGlsaWFyeUJhclBhcnRWaWV3LCB7IHdpZHRoOiAzMDAsIGhlaWdodDogODAwIH1dLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcGFydFZpc2liaWxpdHkgPSB7IHNpZGViYXI6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSwgZWRpdG9yOiBmYWxzZSwgcGFuZWw6IGZhbHNlLCBzZXNzaW9uczogdHJ1ZSwgY3VzdG9tVmlld0dyaWQ6IGZhbHNlLCAuLi5vcHRpb25zLnBhcnRWaXNpYmlsaXR5IH07XG5cdFx0Y29uc3QgaG9zdCA9IHtcblx0XHRcdGVkaXRvclBhcnRWaWV3LFxuXHRcdFx0c2Vzc2lvbnNQYXJ0Vmlldyxcblx0XHRcdHNpZGVCYXJQYXJ0Vmlldyxcblx0XHRcdGF1eGlsaWFyeUJhclBhcnRWaWV3LFxuXHRcdFx0cGFuZWxQYXJ0Vmlldyxcblx0XHRcdGN1c3RvbVZpZXdHcmlkUGFydFZpZXcsXG5cdFx0XHRfZWRpdG9yUGFydENvbnRhaW5lcjogdW5kZWZpbmVkLFxuXHRcdFx0bWFpbkNvbnRhaW5lcjogeyBjbGFzc0xpc3Q6IHsgdG9nZ2xlOiAobmFtZTogc3RyaW5nLCBmb3JjZTogYm9vbGVhbikgPT4geyBjbGFzc1RvZ2dsZXMucHVzaCh7IG5hbWUsIGZvcmNlIH0pOyB9IH0gfSxcblx0XHRcdHBhcnRWaXNpYmlsaXR5LFxuXHRcdFx0d29ya2JlbmNoR3JpZDoge1xuXHRcdFx0XHR3aWR0aDogb3B0aW9ucy53aW5kb3dXaWR0aCA/PyAxMDAwLFxuXHRcdFx0XHRsYXlvdXQ6ICgpID0+IHsgfSxcblx0XHRcdFx0Z2V0Vmlld1NpemU6ICh2aWV3OiBvYmplY3QpID0+IHZpZXdTaXplcy5nZXQodmlldykgPz8geyB3aWR0aDogMCwgaGVpZ2h0OiAwIH0sXG5cdFx0XHRcdGlzVmlld1Zpc2libGU6ICh2aWV3OiBvYmplY3QpID0+IHZpZXcgPT09IGVkaXRvclBhcnRWaWV3ID8gZWRpdG9yTm9kZVZpc2libGUgOiB0cnVlLFxuXHRcdFx0XHRoYXNNYXhpbWl6ZWRWaWV3OiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0ZXhpdE1heGltaXplZFZpZXc6ICgpID0+IHsgfSxcblx0XHRcdFx0c2V0Vmlld1Zpc2libGU6ICh2aWV3OiBvYmplY3QsIHZpc2libGU6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0XHRpZiAodmlldyA9PT0gZWRpdG9yUGFydFZpZXcpIHtcblx0XHRcdFx0XHRcdGVkaXRvck5vZGVWaXNpYmxlID0gdmlzaWJsZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Z3JpZFZpc2liaWxpdHkuc2V0KHZpZXcsIHZpc2libGUpO1xuXHRcdFx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzLnB1c2godmlzaWJsZSk7XG5cdFx0XHRcdFx0bm90aWZ5UGFydFZpc2liaWxpdHkodmlldywgdmlzaWJsZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlc2l6ZVZpZXc6ICh2aWV3OiBvYmplY3QsIHNpemU6IElWaWV3U2l6ZSkgPT4geyByZXNpemVzLnB1c2goc2l6ZSk7IHZpZXdTaXplcy5zZXQodmlldywgc2l6ZSk7IH0sXG5cdFx0XHR9LFxuXHRcdFx0X21haW5Db250YWluZXJEaW1lbnNpb246IHsgd2lkdGg6IG9wdGlvbnMud2luZG93V2lkdGggPz8gMTAwMCwgaGVpZ2h0OiA4MDAgfSxcblx0XHRcdGxheW91dFBvbGljeTogeyB2aWV3cG9ydENsYXNzOiB7IGdldDogKCkgPT4gJ2Rlc2t0b3AnIH0gfSxcblx0XHRcdF9oYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0OiBvcHRpb25zLmhhc0FwcGxpZWRJbml0aWFsRWRpdG9yU3BsaXQgPz8gZmFsc2UsXG5cdFx0XHRfc2F2ZWRQYXJ0U2l6ZXM6IHt9LFxuXHRcdFx0X2VkaXRvclJldmVhbGVkRXhwbGljaXRseTogZmFsc2UsXG5cdFx0XHRfZWRpdG9yTWF4aW1pemVkOiBmYWxzZSxcblx0XHRcdF9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50OiBvcHRpb25zLnN1cHByZXNzaW9uQ291bnQgPz8gMCxcblx0XHRcdF9yZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRPblNob3c6IGZhbHNlLFxuXHRcdFx0ZWRpdG9yR3JvdXBTZXJ2aWNlOiBvcHRpb25zLmVkaXRvckdyb3VwU2VydmljZSxcblx0XHRcdHBhbmVDb21wb3NpdGVTZXJ2aWNlOiB7XG5cdFx0XHRcdGdldEFjdGl2ZVBhbmVDb21wb3NpdGU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0aGlkZUFjdGl2ZVBhbmVDb21wb3NpdGU6ICgpID0+IHsgfSxcblx0XHRcdFx0Z2V0TGFzdEFjdGl2ZVBhbmVDb21wb3NpdGVJZDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRvcGVuUGFuZUNvbXBvc2l0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSxcblx0XHRcdHZpZXdEZXNjcmlwdG9yU2VydmljZTogb3B0aW9ucy52aWV3RGVzY3JpcHRvclNlcnZpY2UgPz8geyBnZXREZWZhdWx0Vmlld0NvbnRhaW5lcjogKCkgPT4gdW5kZWZpbmVkIH0sXG5cdFx0XHQvLyBkb2NrZWQgYm9va2tlZXBpbmdcblx0XHRcdF9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aDogb3B0aW9ucy5kb2NrZWRXaWR0aCA/PyBEb2NrZWRBdXhpbGlhcnlCYXJDb250cm9sbGVyLkRFRkFVTFRfV0lEVEgsXG5cdFx0XHRfc3luY2luZ0VkaXRvclZpc2liaWxpdHk6IGZhbHNlLFxuXHRcdFx0X2RldGFpbEhpZGRlbkZvckVkaXRvclJlc2l6ZTogZmFsc2UsXG5cdFx0XHRfbWVtZW50bzogbmV3IERvY2tlZEVkaXRvclNpemVNZW1lbnRvKCksXG5cdFx0XHQvLyBzdHVicyBmb3IgdGhlIGhlYXZ5IGJhc2UgaGVscGVycyB0aGUgaG9va3MgY2FsbFxuXHRcdFx0X3NhdmVQYXJ0VmlzaWJpbGl0eTogKCkgPT4geyBjb3VudHMuc2F2ZSsrOyB9LFxuXHRcdFx0X2ZpcmVEaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eTogKHBhcnRJZDogUGFydHMsIHZpc2libGU6IGJvb2xlYW4sIHNvdXJjZT86ICdyZXNpemUnKSA9PiB7IGV2ZW50cy5wdXNoKHsgcGFydElkLCB2aXNpYmxlLCAuLi4oc291cmNlID8geyBzb3VyY2UgfSA6IHt9KSB9KTsgfSxcblx0XHRcdF9vbkRpZFJldmVhbFNpZGVQYW5lOiB7IGZpcmU6ICgpID0+IHsgc2lkZVBhbmVSZXZlYWxzLnB1c2godHJ1ZSk7IH0gfSxcblx0XHRcdF9vbkRpZENoYW5nZUVkaXRvck1heGltaXplZDogeyBmaXJlOiAoKSA9PiB7IH0gfSxcblx0XHRcdF9ub3RpZnlDb250YWluZXJEaWRMYXlvdXQ6ICgpID0+IHsgfSxcblx0XHRcdF9sYXlvdXREb2NrZWRBdXhCYXI6ICgpID0+IHsgY291bnRzLmxheW91dCsrOyB9LFxuXHRcdFx0bGF5b3V0TW9iaWxlU2lkZWJhcjogKCkgPT4geyB9LFxuXHRcdFx0Li4uKG9wdGlvbnMuZWRpdG9yTWF4aW1pemUgPyB7fSA6IHsgc2V0RWRpdG9yTWF4aW1pemVkOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRoYXNGb2N1czogKHBhcnQ6IFBhcnRzKSA9PiBvcHRpb25zLmZvY3VzZWRQYXJ0ID09PSBwYXJ0LFxuXHRcdFx0Zm9jdXNQYXJ0OiAocGFydDogUGFydHMpID0+IHsgZm9jdXNlZFBhcnRzLnB1c2gocGFydCk7IH0sXG5cdFx0XHRsYXlvdXQ6ICgpID0+IHsgfSxcblx0XHRcdG1vYmlsZU5hdlN0YWNrOiB7XG5cdFx0XHRcdGhhczogKGxheWVyOiBzdHJpbmcpID0+IG1vYmlsZU5hdkxheWVycy5pbmNsdWRlcyhsYXllciksXG5cdFx0XHRcdHB1c2g6IChsYXllcjogc3RyaW5nKSA9PiB7IG1vYmlsZU5hdkxheWVycy5wdXNoKGxheWVyKTsgfSxcblx0XHRcdFx0cG9wU2lsZW50bHk6IChsYXllcjogc3RyaW5nKSA9PiB7IG1vYmlsZU5hdkxheWVycy5zcGxpY2UobW9iaWxlTmF2TGF5ZXJzLmluZGV4T2YobGF5ZXIpLCAxKTsgfSxcblx0XHRcdH0sXG5cdFx0XHRjdXN0b21WaWV3R3JpZFBhcnRTZXJ2aWNlOiB7IHNldFZpZXc6IChkZXNjcmlwdG9yOiBvYmplY3QgfCB1bmRlZmluZWQpID0+IHsgcmVuZGVyZWRDdXN0b21WaWV3cy5wdXNoKGRlc2NyaXB0b3IpOyB9LCBmb2N1c0FjdGl2ZVZpZXc6ICgpID0+IHsgfSB9LFxuXHRcdFx0X2N1c3RvbVZpZXdWaXNpYmxlS2V5OiB7IHNldDogKCkgPT4geyB9IH0sXG5cdFx0XHRzZXNzaW9uc1BhcnRTZXJ2aWNlOiB7IGZvY3VzU2Vzc2lvbjogKCkgPT4geyBmb2N1c2VkU2Vzc2lvbnMrKzsgfSB9LFxuXHRcdFx0c2Vzc2lvbnNTZXJ2aWNlOiB7IGFjdGl2ZVNlc3Npb246IHsgZ2V0OiAoKSA9PiB1bmRlZmluZWQgfSB9LFxuXHRcdFx0Ly8gY2FwdHVyZXNcblx0XHRcdHJlc2l6ZXMsXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlcyxcblx0XHRcdGV2ZW50cyxcblx0XHRcdGNsYXNzVG9nZ2xlcyxcblx0XHRcdGNvdW50cyxcblx0XHRcdHNpZGVQYW5lUmV2ZWFscyxcblx0XHRcdGZvY3VzZWRQYXJ0cyxcblx0XHRcdHJlbmRlcmVkQ3VzdG9tVmlld3MsXG5cdFx0XHRncmlkVmlzaWJpbGl0eSxcblx0XHRcdG1vYmlsZU5hdkxheWVycyxcblx0XHRcdGdldCBmb2N1c2VkU2Vzc2lvbnMoKSB7IHJldHVybiBmb2N1c2VkU2Vzc2lvbnM7IH0sXG5cdFx0fTtcblxuXHRcdE9iamVjdC5zZXRQcm90b3R5cGVPZihob3N0LCBvcHRpb25zLnNpbmdsZSA/IFNpbmdsZVBhbmVXb3JrYmVuY2gucHJvdG90eXBlIDogV29ya2JlbmNoLnByb3RvdHlwZSk7XG5cdFx0cmV0dXJuIGhvc3QgYXMgdW5rbm93biBhcyBJVGVzdFdvcmtiZW5jaDtcblx0fVxuXG5cdC8vIFRoZSByZWFsIFNwbGl0VmlldyBjYWxscyBgUGFydC5zZXRWaXNpYmxlYCB3aGVuIGEgdmlldydzIGdyaWQgdmlzaWJpbGl0eVxuXHQvLyBjaGFuZ2VzLCB3aGljaCB0aGUgd29ya2JlbmNoIG1hcHMgYmFjayBvbnRvIHRoZSBkZXNpcmVkIHBhcnQgdmlzaWJpbGl0eS5cblx0Ly8gUmVwcm9kdWNlIHRoYXQgZmVlZGJhY2sgc28gdGVzdHMgY2F0Y2ggc3RhdGUgYmVpbmcgb3ZlcndyaXR0ZW4gYnkgaXQuXG5cdGZ1bmN0aW9uIG5vdGlmeVBhcnRWaXNpYmlsaXR5T24oaG9zdDogSVRlc3RXb3JrYmVuY2gsIHZpZXc6IG9iamVjdCwgdmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICgoaG9zdCBhcyB1bmtub3duIGFzIHsgX2FwcGx5aW5nQ3VzdG9tVmlld0dyaWRWaXNpYmlsaXR5OiBib29sZWFuIH0pLl9hcHBseWluZ0N1c3RvbVZpZXdHcmlkVmlzaWJpbGl0eSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodmlldyA9PT0gaG9zdC5zZXNzaW9uc1BhcnRWaWV3KSB7XG5cdFx0XHRzZXRTZXNzaW9uc0hpZGRlbi5jYWxsKGhvc3QsICF2aXNpYmxlKTtcblx0XHR9IGVsc2UgaWYgKHZpZXcgPT09IGhvc3QucGFuZWxQYXJ0Vmlldykge1xuXHRcdFx0c2V0UGFuZWxIaWRkZW4uY2FsbChob3N0LCAhdmlzaWJsZSk7XG5cdFx0fSBlbHNlIGlmICh2aWV3ID09PSBob3N0LmF1eGlsaWFyeUJhclBhcnRWaWV3KSB7XG5cdFx0XHRob3N0LnNldEF1eGlsaWFyeUJhckhpZGRlbighdmlzaWJsZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIEVkaXRvciBzcGxpdCAvIHJldmVhbCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCd0cmFja3MgZWRpdG9yIHBhbmUgdmlzaWJpbGl0eSBhY3Jvc3MgZWRpdG9yIGFuZCBhdXhpbGlhcnkgYmFyIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IGZhbHNlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdHNldEF1eGlsaWFyeUJhckhpZGRlbi5jYWxsKGhvc3QsIHRydWUpO1xuXHRcdGNvbnN0IGhpZGRlbiA9IGlzRWRpdG9yUGFuZVZpc2libGUuY2FsbChob3N0KTtcblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cdFx0Y29uc3QgZWRpdG9yVmlzaWJsZSA9IGlzRWRpdG9yUGFuZVZpc2libGUuY2FsbChob3N0KTtcblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblx0XHRjb25zdCBjbG9zZWQgPSBpc0VkaXRvclBhbmVWaXNpYmxlLmNhbGwoaG9zdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhpZGRlbixcblx0XHRcdGVkaXRvclZpc2libGUsXG5cdFx0XHRjbG9zZWQsXG5cdFx0XHRub0VkaXRvclBhbmVDbGFzc2VzOiBob3N0LmNsYXNzVG9nZ2xlcy5maWx0ZXIodG9nZ2xlID0+IHRvZ2dsZS5uYW1lID09PSAnbm9lZGl0b3JwYW5lJyksXG5cdFx0fSwge1xuXHRcdFx0aGlkZGVuOiBmYWxzZSxcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0XHRjbG9zZWQ6IGZhbHNlLFxuXHRcdFx0bm9FZGl0b3JQYW5lQ2xhc3NlczogW1xuXHRcdFx0XHR7IG5hbWU6ICdub2VkaXRvcnBhbmUnLCBmb3JjZTogdHJ1ZSB9LFxuXHRcdFx0XHR7IG5hbWU6ICdub2VkaXRvcnBhbmUnLCBmb3JjZTogZmFsc2UgfSxcblx0XHRcdFx0eyBuYW1lOiAnbm9lZGl0b3JwYW5lJywgZm9yY2U6IHRydWUgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRzIHRoZSBzaW5nbGUtcGFuZSBlZGl0b3IgZ3JpZCBub2RlIHZpc2liaWxpdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pIGFzIElUZXN0V29ya2JlbmNoICYge1xuXHRcdFx0d29ya2JlbmNoR3JpZDogeyBpc1ZpZXdWaXNpYmxlKHZpZXc6IG9iamVjdCk6IGJvb2xlYW4gfTtcblx0XHR9O1xuXHRcdGhvc3Qud29ya2JlbmNoR3JpZC5pc1ZpZXdWaXNpYmxlID0gKCkgPT4gZmFsc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNTaW5nbGVQYW5lRWRpdG9yUGFuZVZpc2libGUuY2FsbChob3N0KSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUtcGFuZSBzZWNvbmRhcnkgc2lkZWJhciB0b2dnbGUgY29udHJvbHMgdGhlIGVkaXRvciBwYW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9LCBmb2N1c2VkUGFydDogUGFydHMuRURJVE9SX1BBUlQgfSk7XG5cblx0XHR0b2dnbGVTZWNvbmRhcnlTaWRlQmFyU2luZ2xlUGFuZS5jYWxsKGhvc3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyLFxuXHRcdFx0c2Vjb25kYXJ5U2lkZUJhclZpc2libGU6IGlzU2Vjb25kYXJ5U2lkZUJhclZpc2libGVTaW5nbGVQYW5lLmNhbGwoaG9zdCksXG5cdFx0XHRmb2N1c2VkUGFydHM6IGhvc3QuZm9jdXNlZFBhcnRzLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSxcblx0XHRcdHNlY29uZGFyeVNpZGVCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGZvY3VzZWRQYXJ0czogW1BhcnRzLkFVWElMSUFSWUJBUl9QQVJUXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyB0aGUgc2luZ2xlLXBhbmUgZWRpdG9yIHBhbmUgY2xhc3MgYWZ0ZXIgdGhlIGdyaWQgbm9kZSB2aXNpYmlsaXR5IGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9IH0pO1xuXG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0aG9zdC5jbGFzc1RvZ2dsZXMuZmlsdGVyKHRvZ2dsZSA9PiB0b2dnbGUubmFtZSA9PT0gJ25vZWRpdG9ycGFuZScpLFxuXHRcdFx0W3sgbmFtZTogJ25vZWRpdG9ycGFuZScsIGZvcmNlOiB0cnVlIH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbGllcyBhbiBldmVuIGVkaXRvciBzcGxpdCB0aGUgZmlyc3QgdGltZSB0aGUgZWRpdG9yIGlzIHJldmVhbGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2Vzc2lvbnNXaWR0aDogMTAwMCwgd2luZG93V2lkdGg6IDEwMDAgfSk7XG5cblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0YXBwbGllZFNwbGl0OiBob3N0Ll9oYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0LFxuXHRcdFx0dmlzaWJpbGl0eUNoYW5nZXM6IGhvc3QudmlzaWJpbGl0eUNoYW5nZXMsXG5cdFx0XHRyZXNpemVzOiBob3N0LnJlc2l6ZXMsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHRcdGFwcGxpZWRTcGxpdDogdHJ1ZSxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBbdHJ1ZV0sXG5cdFx0XHRyZXNpemVzOiBbeyB3aWR0aDogNTAwLCBoZWlnaHQ6IDgwMCB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9ja2VkIHNpZGViYXIgaGlkZSBncm93cyB0aGUgZWRpdG9yIGJ5IHRoZSBmcmVlZCBzaWRlYmFyIHdpZHRoIGFuZCBzaG93IHJlc3RvcmVzIGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzaWRlQmFyV2lkdGg6IDI4MCwgZWRpdG9yV2lkdGg6IDYyMCwgcGFydFZpc2liaWxpdHk6IHsgc2lkZWJhcjogdHJ1ZSwgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdHNldFNpZGVCYXJIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblx0XHRzZXRTaWRlQmFySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzaWRlYmFyVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5zaWRlYmFyLFxuXHRcdFx0dmlzaWJpbGl0eUNoYW5nZXM6IGhvc3QudmlzaWJpbGl0eUNoYW5nZXMsXG5cdFx0XHRyZXNpemVzOiBob3N0LnJlc2l6ZXMsXG5cdFx0XHRsYXlvdXRDb3VudDogaG9zdC5jb3VudHMubGF5b3V0LFxuXHRcdFx0c25hcHNob3Q6IGhvc3QuX21lbWVudG8uZWRpdG9yU2l6ZUdyb3duRm9yU2lkZWJhckhpZGUsXG5cdFx0fSwge1xuXHRcdFx0c2lkZWJhclZpc2libGU6IHRydWUsXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogW2ZhbHNlLCB0cnVlXSxcblx0XHRcdHJlc2l6ZXM6IFtcblx0XHRcdFx0eyB3aWR0aDogOTAwLCBoZWlnaHQ6IDgwMCB9LFxuXHRcdFx0XHR7IHdpZHRoOiA2MjAsIGhlaWdodDogODAwIH0sXG5cdFx0XHRdLFxuXHRcdFx0bGF5b3V0Q291bnQ6IDIsXG5cdFx0XHRzbmFwc2hvdDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFuZGFyZCBsYXlvdXQgc2lkZWJhciBoaWRlIGRvZXMgbm90IGdyb3cgdGhlIGVkaXRvcicsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpZGVCYXJXaWR0aDogMjgwLCBlZGl0b3JXaWR0aDogNjIwLCBwYXJ0VmlzaWJpbGl0eTogeyBzaWRlYmFyOiB0cnVlLCBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0c2V0U2lkZUJhckhpZGRlbi5jYWxsKGhvc3QsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzaWRlYmFyVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5zaWRlYmFyLFxuXHRcdFx0dmlzaWJpbGl0eUNoYW5nZXM6IGhvc3QudmlzaWJpbGl0eUNoYW5nZXMsXG5cdFx0XHRyZXNpemVzOiBob3N0LnJlc2l6ZXMsXG5cdFx0fSwge1xuXHRcdFx0c2lkZWJhclZpc2libGU6IGZhbHNlLFxuXHRcdFx0dmlzaWJpbGl0eUNoYW5nZXM6IFtmYWxzZV0sXG5cdFx0XHRyZXNpemVzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9ja2VkIHNpZGViYXIgaGlkZSBncm93cyB0aGUgZGV0YWlsIHBhbmVsIChub3QgdGhlIGVkaXRvciBub2RlKSB3aGVuIHRoZSBlZGl0b3IgaXMgaGlkZGVuIGFuZCBzaG93IHJlc3RvcmVzIGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzaWRlQmFyV2lkdGg6IDI4MCwgZWRpdG9yV2lkdGg6IDYyMCwgZG9ja2VkV2lkdGg6IDMwMCwgcGFydFZpc2liaWxpdHk6IHsgc2lkZWJhcjogdHJ1ZSwgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSk7XG5cblx0XHRzZXRTaWRlQmFySGlkZGVuLmNhbGwoaG9zdCwgdHJ1ZSk7XG5cdFx0Y29uc3QgYWZ0ZXJIaWRlID0ge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IsXG5cdFx0XHRkZXRhaWxXaWR0aDogaG9zdC5fZG9ja2VkQXV4aWxpYXJ5QmFyV2lkdGgsXG5cdFx0XHRyZXNpemVzOiBbLi4uaG9zdC5yZXNpemVzXSxcblx0XHRcdGRldGFpbFNuYXBzaG90OiBob3N0Ll9tZW1lbnRvLmRldGFpbFdpZHRoR3Jvd25Gb3JTaWRlYmFySGlkZSxcblx0XHRcdGVkaXRvclNuYXBzaG90OiBob3N0Ll9tZW1lbnRvLmVkaXRvclNpemVHcm93bkZvclNpZGViYXJIaWRlLFxuXHRcdH07XG5cblx0XHRzZXRTaWRlQmFySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhZnRlckhpZGUsXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGRldGFpbFdpZHRoOiBob3N0Ll9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCxcblx0XHRcdHJlc2l6ZXM6IGhvc3QucmVzaXplcyxcblx0XHRcdGRldGFpbFNuYXBzaG90OiBob3N0Ll9tZW1lbnRvLmRldGFpbFdpZHRoR3Jvd25Gb3JTaWRlYmFySGlkZSxcblx0XHRcdGxheW91dENvdW50OiBob3N0LmNvdW50cy5sYXlvdXQsXG5cdFx0fSwge1xuXHRcdFx0YWZ0ZXJIaWRlOiB7XG5cdFx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0XHRkZXRhaWxXaWR0aDogNTgwLFxuXHRcdFx0XHRyZXNpemVzOiBbeyB3aWR0aDogNTgwLCBoZWlnaHQ6IDgwMCB9XSxcblx0XHRcdFx0ZGV0YWlsU25hcHNob3Q6IDMwMCxcblx0XHRcdFx0ZWRpdG9yU25hcHNob3Q6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGRldGFpbFdpZHRoOiAzMDAsXG5cdFx0XHRyZXNpemVzOiBbXG5cdFx0XHRcdHsgd2lkdGg6IDU4MCwgaGVpZ2h0OiA4MDAgfSxcblx0XHRcdFx0eyB3aWR0aDogMzAwLCBoZWlnaHQ6IDgwMCB9LFxuXHRcdFx0XSxcblx0XHRcdGRldGFpbFNuYXBzaG90OiB1bmRlZmluZWQsXG5cdFx0XHRsYXlvdXRDb3VudDogMixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlLXBhbmUgZGVzY3JpcHRvciB1c2VzIHRoZSBkb2NrZWQgZGV0YWlsIHdpZHRoIGZvciBhIGRldGFpbC1vbmx5IGZpcnN0IG9wZW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIGRvY2tlZFdpZHRoOiAzMDAsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pIGFzIElHcmlkRGVzY3JpcHRvclRlc3RIYXJuZXNzO1xuXHRcdGhvc3QubGF5b3V0UG9saWN5ID0ge1xuXHRcdFx0Z2V0UGFydFNpemVzOiAoKSA9PiAoeyBzaWRlQmFyU2l6ZTogMjgwLCBhdXhpbGlhcnlCYXJTaXplOiAzNDAsIHBhbmVsU2l6ZTogMzAwIH0pLFxuXHRcdFx0dmlld3BvcnRDbGFzczogeyBnZXQ6ICgpID0+ICdkZXNrdG9wJyB9LFxuXHRcdH07XG5cdFx0aG9zdC50aXRsZUJhclBhcnRWaWV3ID0geyBtaW5pbXVtSGVpZ2h0OiAzMCB9O1xuXG5cdFx0Y29uc3QgZGVzY3JpcHRvciA9IGNyZWF0ZURlc2t0b3BHcmlkRGVzY3JpcHRvci5jYWxsKGhvc3QsIDEyMDAsIDgwMCk7XG5cdFx0Y29uc3QgY29udGVudFNlY3Rpb24gPSBkZXNjcmlwdG9yLnJvb3QuZGF0YVsxXSBhcyB7IGRhdGE6IHJlYWRvbmx5IHVua25vd25bXSB9O1xuXHRcdGNvbnN0IHJpZ2h0U2VjdGlvbiA9IGNvbnRlbnRTZWN0aW9uLmRhdGFbMV0gYXMgeyBkYXRhOiByZWFkb25seSB1bmtub3duW10gfTtcblx0XHRjb25zdCB0b3BSaWdodFNlY3Rpb24gPSByaWdodFNlY3Rpb24uZGF0YVswXSBhcyB7IGRhdGE6IHJlYWRvbmx5IHVua25vd25bXSB9O1xuXHRcdGNvbnN0IGVkaXRvck5vZGUgPSB0b3BSaWdodFNlY3Rpb24uZGF0YVsxXSBhcyB7IHNpemU6IG51bWJlcjsgdmlzaWJsZTogYm9vbGVhbiB9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHNpemU6IGVkaXRvck5vZGUuc2l6ZSwgdmlzaWJsZTogZWRpdG9yTm9kZS52aXNpYmxlIH0sIHsgc2l6ZTogMzAwLCB2aXNpYmxlOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUtcGFuZSBkZXNjcmlwdG9yIHJlc3RvcmVzIGFuIGVkaXRvci1vbmx5IHNpZGUgcGFuZSBhdCBpdHMgc2F2ZWQgd2lkdGggKG5vIGRldGFpbCBzdWJ0cmFjdGlvbiknLCAoKSA9PiB7XG5cdFx0Ly8gUm91bmQtdHJpcCBndWFyZCBmb3IgdGhlIGNvbXBvdW5kaW5nLXNocmluayBidWc6IGFuIEVkaXRvci1vbmx5IHNlc3Npb25cblx0XHQvLyAoZGV0YWlsIGNsb3NlZCkgcGVyc2lzdHMgaXRzIHB1cmUgZWRpdG9yLWNvbnRlbnQgd2lkdGgsIGFuZCB0aGUgZGVzY3JpcHRvclxuXHRcdC8vIG11c3QgcmVjb25zdHJ1Y3QgdGhlIG5vZGUgYXQgZXhhY3RseSB0aGF0IHdpZHRoIChubyBkZXRhaWwgYWRkZWQsIG5vbmUgbG9zdCkuXG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIGRvY2tlZFdpZHRoOiAzMDAsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9IH0pIGFzIElHcmlkRGVzY3JpcHRvclRlc3RIYXJuZXNzO1xuXHRcdGhvc3QuX3NhdmVkUGFydFNpemVzID0geyBlZGl0b3I6IDkwMCB9O1xuXHRcdGhvc3QubGF5b3V0UG9saWN5ID0ge1xuXHRcdFx0Z2V0UGFydFNpemVzOiAoKSA9PiAoeyBzaWRlQmFyU2l6ZTogMjgwLCBhdXhpbGlhcnlCYXJTaXplOiAzNDAsIHBhbmVsU2l6ZTogMzAwIH0pLFxuXHRcdFx0dmlld3BvcnRDbGFzczogeyBnZXQ6ICgpID0+ICdkZXNrdG9wJyB9LFxuXHRcdH07XG5cdFx0aG9zdC50aXRsZUJhclBhcnRWaWV3ID0geyBtaW5pbXVtSGVpZ2h0OiAzMCB9O1xuXG5cdFx0Y29uc3QgZGVzY3JpcHRvciA9IGNyZWF0ZURlc2t0b3BHcmlkRGVzY3JpcHRvci5jYWxsKGhvc3QsIDE2MDAsIDgwMCk7XG5cdFx0Y29uc3QgY29udGVudFNlY3Rpb24gPSBkZXNjcmlwdG9yLnJvb3QuZGF0YVsxXSBhcyB7IGRhdGE6IHJlYWRvbmx5IHVua25vd25bXSB9O1xuXHRcdGNvbnN0IHJpZ2h0U2VjdGlvbiA9IGNvbnRlbnRTZWN0aW9uLmRhdGFbMV0gYXMgeyBkYXRhOiByZWFkb25seSB1bmtub3duW10gfTtcblx0XHRjb25zdCB0b3BSaWdodFNlY3Rpb24gPSByaWdodFNlY3Rpb24uZGF0YVswXSBhcyB7IGRhdGE6IHJlYWRvbmx5IHVua25vd25bXSB9O1xuXHRcdGNvbnN0IGVkaXRvck5vZGUgPSB0b3BSaWdodFNlY3Rpb24uZGF0YVsxXSBhcyB7IHNpemU6IG51bWJlcjsgdmlzaWJsZTogYm9vbGVhbiB9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHNpemU6IGVkaXRvck5vZGUuc2l6ZSwgdmlzaWJsZTogZWRpdG9yTm9kZS52aXNpYmxlIH0sIHsgc2l6ZTogOTAwLCB2aXNpYmxlOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUtcGFuZSBkZXNjcmlwdG9yIGZhbGxzIGJhY2sgdG8gdGhlIGRlZmF1bHQgd2hlbiB0aGUgc2F2ZWQgZWRpdG9yIHdpZHRoIGlzIGNvcnJ1cHQgKDAgLyBzdWItbWluaW11bSknLCAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbiBmb3IgdGhlIHJlbG9hZC0zMDAgYnVnOiBhIGAwYCAob3Igc3ViLW1pbmltdW0pIGVkaXRvciB3aWR0aCBjb3VsZCBiZVxuXHRcdC8vIHBlcnNpc3RlZCB3aGVuIHRoZSBoaWdoLXByaW9yaXR5IHNlc3Npb25zIHBhcnQgc3F1ZWV6ZWQgdGhlIGVkaXRvciBub2RlLiBUaGVcblx0XHQvLyBkZXNjcmlwdG9yIG11c3QgdHJlYXQgaXQgYXMgbWlzc2luZyBhbmQgdXNlIHRoZSBkZWZhdWx0LCBub3QgYnVpbGQgYSAwLXdpZHRoXG5cdFx0Ly8gbm9kZSB0aGF0IHRoZSBncmlkIHRoZW4gY2xhbXBzIHRvIGl0cyAzMDBweCBtaW5pbXVtLlxuXHRcdGNvbnN0IGJ1aWxkID0gKHNhdmVkRWRpdG9yOiBudW1iZXIgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBkb2NrZWRXaWR0aDogMzAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogZmFsc2UgfSB9KSBhcyBJR3JpZERlc2NyaXB0b3JUZXN0SGFybmVzcztcblx0XHRcdGhvc3QuX3NhdmVkUGFydFNpemVzID0gc2F2ZWRFZGl0b3IgPT09IHVuZGVmaW5lZCA/IHt9IDogeyBlZGl0b3I6IHNhdmVkRWRpdG9yIH07XG5cdFx0XHRob3N0LmxheW91dFBvbGljeSA9IHtcblx0XHRcdFx0Z2V0UGFydFNpemVzOiAoKSA9PiAoeyBzaWRlQmFyU2l6ZTogMjgwLCBhdXhpbGlhcnlCYXJTaXplOiAzNDAsIHBhbmVsU2l6ZTogMzAwIH0pLFxuXHRcdFx0XHR2aWV3cG9ydENsYXNzOiB7IGdldDogKCkgPT4gJ2Rlc2t0b3AnIH0sXG5cdFx0XHR9O1xuXHRcdFx0aG9zdC50aXRsZUJhclBhcnRWaWV3ID0geyBtaW5pbXVtSGVpZ2h0OiAzMCB9O1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRvciA9IGNyZWF0ZURlc2t0b3BHcmlkRGVzY3JpcHRvci5jYWxsKGhvc3QsIDE2MDAsIDgwMCk7XG5cdFx0XHRjb25zdCBjb250ZW50U2VjdGlvbiA9IGRlc2NyaXB0b3Iucm9vdC5kYXRhWzFdIGFzIHsgZGF0YTogcmVhZG9ubHkgdW5rbm93bltdIH07XG5cdFx0XHRjb25zdCByaWdodFNlY3Rpb24gPSBjb250ZW50U2VjdGlvbi5kYXRhWzFdIGFzIHsgZGF0YTogcmVhZG9ubHkgdW5rbm93bltdIH07XG5cdFx0XHRjb25zdCB0b3BSaWdodFNlY3Rpb24gPSByaWdodFNlY3Rpb24uZGF0YVswXSBhcyB7IGRhdGE6IHJlYWRvbmx5IHVua25vd25bXSB9O1xuXHRcdFx0cmV0dXJuICh0b3BSaWdodFNlY3Rpb24uZGF0YVsxXSBhcyB7IHNpemU6IG51bWJlciB9KS5zaXplO1xuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvcnJ1cHRaZXJvOiBidWlsZCgwKSxcblx0XHRcdHN1Yk1pbmltdW06IGJ1aWxkKDEyMCksXG5cdFx0XHRtaXNzaW5nOiBidWlsZCh1bmRlZmluZWQpLFxuXHRcdFx0dmFsaWRTYXZlZDogYnVpbGQoNzUwKSxcblx0XHR9LCB7XG5cdFx0XHRjb3JydXB0WmVybzogNjAwLFxuXHRcdFx0c3ViTWluaW11bTogNjAwLFxuXHRcdFx0bWlzc2luZzogNjAwLFxuXHRcdFx0dmFsaWRTYXZlZDogNzUwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdfc2F2ZVBhcnRTaXplcyBwZXJzaXN0cyB0aGUgZWRpdG9yIHdpZHRoIHdpdGhvdXQgcmVhZGluZyB0aGUgZG9ja2VkIGF1eCBiYXIgZnJvbSB0aGUgZ3JpZCAoc2luZ2xlLXBhbmUpJywgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb24gZm9yIHRoZSByZWxvYWQtbG9zaW5nLXJlc2l6ZSBidWc6IGluIHNpbmdsZS1wYW5lIHRoZSBkb2NrZWRcblx0XHQvLyBhdXhpbGlhcnkgYmFyIGlzIE5PVCBhIGdyaWQgdmlldyAoaXQgbGl2ZXMgaW5zaWRlIHRoZSBlZGl0b3Igbm9kZSksIHNvIGl0c1xuXHRcdC8vIHdpZHRoIG11c3QgY29tZSBmcm9tIHRoZSBkb2NrZWQgbGF5b3V0IHN0YXRlLCBuZXZlciB0aGUgZ3JpZC4gVGhlIGdyaWQgaGVyZVxuXHRcdC8vIHRocm93cyBcIlZpZXcgbm90IGZvdW5kXCIgZm9yIHRoZSBhdXggdmlldyB0byBwcm92ZSBgX3NhdmVQYXJ0U2l6ZXNgIG5ldmVyXG5cdFx0Ly8gcmVhZHMgaXQgXHUyMDE0IG90aGVyd2lzZSB0aGUgc2F2ZSB3b3VsZCBhYm9ydCBhbmQgdGhlIGVkaXRvciB3aWR0aCB3b3VsZCBiZSBsb3N0LlxuXHRcdGNvbnN0IHN0b3JlZDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXHRcdGNvbnN0IGVkaXRvclZpZXcgPSB7fSwgc2Vzc2lvbnNWaWV3ID0ge30sIHNpZGVCYXJWaWV3ID0ge30sIGF1eFZpZXcgPSB7fSwgcGFuZWxWaWV3ID0ge307XG5cdFx0Y29uc3Qgdmlld1NpemVzID0gbmV3IE1hcDxvYmplY3QsIElWaWV3U2l6ZT4oW1xuXHRcdFx0W2VkaXRvclZpZXcsIHsgd2lkdGg6IDg2NCwgaGVpZ2h0OiA3MDAgfV0sXG5cdFx0XHRbc2Vzc2lvbnNWaWV3LCB7IHdpZHRoOiA2MTgsIGhlaWdodDogNzAwIH1dLFxuXHRcdFx0W3NpZGVCYXJWaWV3LCB7IHdpZHRoOiAzMDAsIGhlaWdodDogNzAwIH1dLFxuXHRcdFx0W3BhbmVsVmlldywgeyB3aWR0aDogMTAwMCwgaGVpZ2h0OiAyMDAgfV0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgaG9zdCA9IHtcblx0XHRcdGVkaXRvclBhcnRWaWV3OiBlZGl0b3JWaWV3LFxuXHRcdFx0c2Vzc2lvbnNQYXJ0Vmlldzogc2Vzc2lvbnNWaWV3LFxuXHRcdFx0c2lkZUJhclBhcnRWaWV3OiBzaWRlQmFyVmlldyxcblx0XHRcdGF1eGlsaWFyeUJhclBhcnRWaWV3OiBhdXhWaWV3LFxuXHRcdFx0cGFuZWxQYXJ0VmlldzogcGFuZWxWaWV3LFxuXHRcdFx0cGFydFZpc2liaWxpdHk6IHsgc2lkZWJhcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSwgZWRpdG9yOiB0cnVlLCBwYW5lbDogZmFsc2UsIHNlc3Npb25zOiB0cnVlIH0sXG5cdFx0XHRfc2F2ZWRQYXJ0U2l6ZXM6IHsgZWRpdG9yOiA1MDAgfSxcblx0XHRcdF9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aDogMzAwLFxuXHRcdFx0X21lbWVudG86IG5ldyBEb2NrZWRFZGl0b3JTaXplTWVtZW50bygpLFxuXHRcdFx0bG9nU2VydmljZTogdW5kZWZpbmVkLFxuXHRcdFx0d29ya2JlbmNoR3JpZDoge1xuXHRcdFx0XHRnZXRWaWV3U2l6ZTogKHZpZXc6IG9iamVjdCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNpemUgPSB2aWV3U2l6ZXMuZ2V0KHZpZXcpO1xuXHRcdFx0XHRcdGlmICghc2l6ZSkgeyB0aHJvdyBuZXcgRXJyb3IoJ1ZpZXcgbm90IGZvdW5kJyk7IH1cblx0XHRcdFx0XHRyZXR1cm4gc2l6ZTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0Vmlld0NhY2hlZFZpc2libGVTaXplOiAodmlldzogb2JqZWN0KSA9PiB7XG5cdFx0XHRcdFx0aWYgKHZpZXcgPT09IGF1eFZpZXcpIHsgdGhyb3cgbmV3IEVycm9yKCdWaWV3IG5vdCBmb3VuZCcpOyB9XG5cdFx0XHRcdFx0cmV0dXJuIHZpZXdTaXplcy5nZXQodmlldyk/LndpZHRoO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlOiB7IHN0b3JlOiAoa2V5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpID0+IHsgc3RvcmVkW2tleV0gPSB2YWx1ZTsgfSB9LFxuXHRcdH07XG5cdFx0T2JqZWN0LnNldFByb3RvdHlwZU9mKGhvc3QsIFNpbmdsZVBhbmVXb3JrYmVuY2gucHJvdG90eXBlKTtcblxuXHRcdHNhdmVQYXJ0U2l6ZXMuY2FsbChob3N0IGFzIHVua25vd24gYXMgSVNhdmVQYXJ0U2l6ZXNUZXN0SGFybmVzcyk7XG5cblx0XHRjb25zdCBzaXplcyA9IEpTT04ucGFyc2Uoc3RvcmVkWyd3b3JrYmVuY2guc2Vzc2lvbnMucGFydFNpemVzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBlZGl0b3I6IHNpemVzLmVkaXRvciwgc2Vzc2lvbnM6IHNpemVzLnNlc3Npb25zLCBhdXhpbGlhcnlCYXI6IHNpemVzLmF1eGlsaWFyeUJhciB9LCB7IGVkaXRvcjogODY0LCBzZXNzaW9uczogNjE4LCBhdXhpbGlhcnlCYXI6IDMwMCB9KTtcblx0fSk7XG5cblx0dGVzdCgnX3NhdmVQYXJ0U2l6ZXMgcHJlc2VydmVzIHRoZSBsYXN0IHZhbGlkIGVkaXRvciB3aWR0aCB3aGVuIHRoZSBlZGl0b3IgaXMgaGlkZGVuIHdpdGggdGhlIGRldGFpbCB2aXNpYmxlIChzaW5nbGUtcGFuZSknLCAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogd2l0aCB0aGUgZWRpdG9yIGhpZGRlbiBhbmQgb25seSB0aGUgZGV0YWlsIHNob3dpbmcsIHRoZSBlZGl0b3Jcblx0XHQvLyBncmlkIG5vZGUgaXMgdGhlIGRldGFpbC1vbmx5IG5vZGUsIHNvIHRoZSBwdXJlIGVkaXRvci1jb250ZW50IHdpZHRoIG1lYXN1cmVzXG5cdFx0Ly8gYXMgfjAgKGJlbG93IHRoZSBtaW5pbXVtKS4gVGhhdCBzdWItbWluaW11bSB2YWx1ZSBtdXN0IE5PVCBiZSBwZXJzaXN0ZWQgKGl0XG5cdFx0Ly8gd291bGQgcmVidWlsZCB0aGUgc2lkZSBwYW5lIGF0IGl0cyAzMDBweCBtaW5pbXVtIG9uIHJlbG9hZCk7IHRoZSBsYXN0IHZhbGlkXG5cdFx0Ly8gZ2xvYmFsIHdpZHRoIGlzIGtlcHQgaW5zdGVhZC5cblx0XHRjb25zdCBzdG9yZWQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblx0XHRjb25zdCBlZGl0b3JWaWV3ID0ge30sIHNlc3Npb25zVmlldyA9IHt9LCBzaWRlQmFyVmlldyA9IHt9LCBhdXhWaWV3ID0ge30sIHBhbmVsVmlldyA9IHt9O1xuXHRcdGNvbnN0IHZpZXdTaXplcyA9IG5ldyBNYXA8b2JqZWN0LCBJVmlld1NpemU+KFtcblx0XHRcdFtlZGl0b3JWaWV3LCB7IHdpZHRoOiAzMDAsIGhlaWdodDogNzAwIH1dLFxuXHRcdFx0W3Nlc3Npb25zVmlldywgeyB3aWR0aDogMTE4MiwgaGVpZ2h0OiA3MDAgfV0sXG5cdFx0XHRbc2lkZUJhclZpZXcsIHsgd2lkdGg6IDMwMCwgaGVpZ2h0OiA3MDAgfV0sXG5cdFx0XHRbcGFuZWxWaWV3LCB7IHdpZHRoOiAxMDAwLCBoZWlnaHQ6IDIwMCB9XSxcblx0XHRdKTtcblx0XHRjb25zdCBob3N0ID0ge1xuXHRcdFx0ZWRpdG9yUGFydFZpZXc6IGVkaXRvclZpZXcsXG5cdFx0XHRzZXNzaW9uc1BhcnRWaWV3OiBzZXNzaW9uc1ZpZXcsXG5cdFx0XHRzaWRlQmFyUGFydFZpZXc6IHNpZGVCYXJWaWV3LFxuXHRcdFx0YXV4aWxpYXJ5QmFyUGFydFZpZXc6IGF1eFZpZXcsXG5cdFx0XHRwYW5lbFBhcnRWaWV3OiBwYW5lbFZpZXcsXG5cdFx0XHRwYXJ0VmlzaWJpbGl0eTogeyBzaWRlYmFyOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUsIGVkaXRvcjogZmFsc2UsIHBhbmVsOiBmYWxzZSwgc2Vzc2lvbnM6IHRydWUgfSxcblx0XHRcdF9zYXZlZFBhcnRTaXplczogeyBlZGl0b3I6IDUyMCB9LFxuXHRcdFx0X2RvY2tlZEF1eGlsaWFyeUJhcldpZHRoOiAzMDAsXG5cdFx0XHRfbWVtZW50bzogbmV3IERvY2tlZEVkaXRvclNpemVNZW1lbnRvKCksXG5cdFx0XHRsb2dTZXJ2aWNlOiB1bmRlZmluZWQsXG5cdFx0XHR3b3JrYmVuY2hHcmlkOiB7XG5cdFx0XHRcdGdldFZpZXdTaXplOiAodmlldzogb2JqZWN0KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc2l6ZSA9IHZpZXdTaXplcy5nZXQodmlldyk7XG5cdFx0XHRcdFx0aWYgKCFzaXplKSB7IHRocm93IG5ldyBFcnJvcignVmlldyBub3QgZm91bmQnKTsgfVxuXHRcdFx0XHRcdHJldHVybiBzaXplO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRWaWV3Q2FjaGVkVmlzaWJsZVNpemU6ICh2aWV3OiBvYmplY3QpID0+IHtcblx0XHRcdFx0XHRpZiAodmlldyA9PT0gYXV4VmlldykgeyB0aHJvdyBuZXcgRXJyb3IoJ1ZpZXcgbm90IGZvdW5kJyk7IH1cblx0XHRcdFx0XHRyZXR1cm4gdmlld1NpemVzLmdldCh2aWV3KT8ud2lkdGg7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0c3RvcmFnZVNlcnZpY2U6IHsgc3RvcmU6IChrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZykgPT4geyBzdG9yZWRba2V5XSA9IHZhbHVlOyB9IH0sXG5cdFx0fTtcblx0XHRPYmplY3Quc2V0UHJvdG90eXBlT2YoaG9zdCwgU2luZ2xlUGFuZVdvcmtiZW5jaC5wcm90b3R5cGUpO1xuXG5cdFx0c2F2ZVBhcnRTaXplcy5jYWxsKGhvc3QgYXMgdW5rbm93biBhcyBJU2F2ZVBhcnRTaXplc1Rlc3RIYXJuZXNzKTtcblxuXHRcdGNvbnN0IHNpemVzID0gSlNPTi5wYXJzZShzdG9yZWRbJ3dvcmtiZW5jaC5zZXNzaW9ucy5wYXJ0U2l6ZXMnXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpemVzLmVkaXRvciwgNTIwKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdzaG93aW5nIGRvY2tlZCBkZXRhaWwgd2l0aCBoaWRkZW4gZWRpdG9yIHJlc3RvcmVzIHRoZSBwcmVmZXJyZWQgZGV0YWlsIHdpZHRoIGluc3RlYWQgb2YgY2FjaGVkIG5vZGUgd2lkdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIGVkaXRvcldpZHRoOiA2NDAsIGRvY2tlZFdpZHRoOiAzMDAsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogZmFsc2UgfSB9KTtcblxuXHRcdHNldEF1eGlsaWFyeUJhckhpZGRlbi5jYWxsKGhvc3QsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIsXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdHJlc2l6ZXM6IGhvc3QucmVzaXplcyxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBob3N0LnZpc2liaWxpdHlDaGFuZ2VzLFxuXHRcdFx0ZXZlbnRzOiBob3N0LmV2ZW50cyxcblx0XHRcdGxheW91dENvdW50OiBob3N0LmNvdW50cy5sYXlvdXQsXG5cdFx0fSwge1xuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSxcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0cmVzaXplczogW3sgd2lkdGg6IDMwMCwgaGVpZ2h0OiA4MDAgfV0sXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogW3RydWVdLFxuXHRcdFx0ZXZlbnRzOiBbeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH1dLFxuXHRcdFx0bGF5b3V0Q291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RzIHRoZSB1c2VyIGRldGFpbCB3aWR0aCBpbnN0ZWFkIG9mIGEgdGVtcG9yYXJ5IHNpZGViYXItY29sbGFwc2UgZ3JvdyB3aWR0aCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgZG9ja2VkV2lkdGg6IDU4MCB9KTtcblx0XHRob3N0Ll9tZW1lbnRvLmRldGFpbFdpZHRoR3Jvd25Gb3JTaWRlYmFySGlkZSA9IDMwMDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZXJzaXN0ZWRBdXhpbGlhcnlCYXJXaWR0aC5jYWxsKGhvc3QsIGhvc3QuYXV4aWxpYXJ5QmFyUGFydFZpZXcsICd3aWR0aCcsIGZhbHNlKSwgMzAwKTtcblx0fSk7XG5cblx0dGVzdCgncGVyc2lzdGVkIGVkaXRvciB3aWR0aCBleGNsdWRlcyB0aGUgZGV0YWlsIG9ubHkgd2hlbiB0aGUgZGV0YWlsIGlzIHZpc2libGUnLCAoKSA9PiB7XG5cdFx0Ly8gRWRpdG9yICsgZGV0YWlsIHZpc2libGU6IHRoZSBub2RlIGluY2x1ZGVzIHRoZSBkZXRhaWwsIHNvIGl0IGlzIGV4Y2x1ZGVkXG5cdFx0Ly8gdG8gc3RvcmUgdGhlIHB1cmUgZWRpdG9yLWNvbnRlbnQgd2lkdGggKHJlY29uc3RydWN0ZWQgYnkgYWRkaW5nIGl0IGJhY2spLlxuXHRcdGNvbnN0IHdpdGhEZXRhaWwgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBkb2NrZWRXaWR0aDogMzAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXHRcdC8vIEVkaXRvci1vbmx5IChkZXRhaWwgY2xvc2VkKTogdGhlIG5vZGUgaXMgcHVyZSBlZGl0b3IgY29udGVudCwgc28gbm90aGluZ1xuXHRcdC8vIGlzIHN1YnRyYWN0ZWQgXHUyMDE0IG90aGVyd2lzZSB0aGUgc2lkZSBwYW5lIHdvdWxkIHNocmluayBieSB0aGUgZGV0YWlsIHdpZHRoXG5cdFx0Ly8gb24gZXZlcnkgcmVsb2FkIChjb21wb3VuZGluZyB0b3dhcmQgemVybykuXG5cdFx0Y29uc3QgZWRpdG9yT25seSA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIGRvY2tlZFdpZHRoOiAzMDAsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3aXRoRGV0YWlsOiBwZXJzaXN0ZWRFZGl0b3JXaWR0aC5jYWxsKHdpdGhEZXRhaWwsIDkwMCksXG5cdFx0XHRlZGl0b3JPbmx5OiBwZXJzaXN0ZWRFZGl0b3JXaWR0aC5jYWxsKGVkaXRvck9ubHksIDkwMCksXG5cdFx0fSwge1xuXHRcdFx0d2l0aERldGFpbDogNjAwLFxuXHRcdFx0ZWRpdG9yT25seTogOTAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZS1hcHBseSB0aGUgZXZlbiBzcGxpdCBvbiBsYXRlciBlZGl0b3IgcmV2ZWFscycsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNlc3Npb25zV2lkdGg6IDEwMDAsIGhhc0FwcGxpZWRJbml0aWFsRWRpdG9yU3BsaXQ6IHRydWUgfSk7XG5cblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0dmlzaWJpbGl0eUNoYW5nZXM6IGhvc3QudmlzaWJpbGl0eUNoYW5nZXMsXG5cdFx0XHRyZXNpemVzOiBob3N0LnJlc2l6ZXMsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBbdHJ1ZV0sXG5cdFx0XHRyZXNpemVzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xhbXBzIHRoZSBldmVuIGVkaXRvciBzcGxpdCB0byBhIG1pbmltdW0gd2lkdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzZXNzaW9uc1dpZHRoOiA0MDAsIHdpbmRvd1dpZHRoOiA0MDAgfSk7XG5cblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhvc3QucmVzaXplcywgW3sgd2lkdGg6IDMwMCwgaGVpZ2h0OiA4MDAgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWxheW91dHMgdGhlIGRvY2tlZCBkZXRhaWwgcGFuZWwgd2hlbiB0aGUgZWRpdG9yIHZpc2liaWxpdHkgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgaGFzQXBwbGllZEluaXRpYWxFZGl0b3JTcGxpdDogdHJ1ZSB9KTtcblxuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIGZhbHNlKTtcblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGF5b3V0Q291bnQ6IGhvc3QuY291bnRzLmxheW91dCxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBob3N0LnZpc2liaWxpdHlDaGFuZ2VzLFxuXHRcdH0sIHtcblx0XHRcdGxheW91dENvdW50OiAyLFxuXHRcdFx0dmlzaWJpbGl0eUNoYW5nZXM6IFt0cnVlLCB0cnVlXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmlyZXMgZWRpdG9yIHZpc2liaWxpdHkgY2hhbmdlcyB3aGVuIGRvY2tlZCBlZGl0b3IgY29udGVudCBpcyBoaWRkZW4gb3Igc2hvd24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHNlc3Npb25zV2lkdGg6IDEwMDAsIGhhc0FwcGxpZWRJbml0aWFsRWRpdG9yU3BsaXQ6IHRydWUsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSk7XG5cblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhvc3QuZXZlbnRzLCBbXG5cdFx0XHR7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IGZhbHNlIH0sXG5cdFx0XHR7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IHRydWUgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbWFwcyBhIG5hdGl2ZSBzYXNoLWRyYWcgY29sbGFwc2Ugb2YgdGhlIGRldGFpbC1vbmx5IG5vZGUgb250byBoaWRpbmcgdGhlIGF1eGlsaWFyeSBiYXIsIGxpa2UgdGhlIHNlc3Npb25zIGxpc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0b25FZGl0b3JQYXJ0R3JpZFZpc2liaWxpdHlDaGFuZ2UuY2FsbChob3N0LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyLFxuXHRcdFx0ZXZlbnRzOiBob3N0LmV2ZW50cyxcblx0XHR9LCB7XG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGV2ZW50czogW3sgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UsIHNvdXJjZTogJ3Jlc2l6ZScgfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldmVhbHMgdGhlIGRldGFpbC1vbmx5IHBhbmVsIGFnYWluIHdoZW4gdGhlIGNvbGxhcHNlZCBub2RlIGlzIGRyYWdnZWQgYmFjayBvcGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IGZhbHNlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdG9uRWRpdG9yUGFydEdyaWRWaXNpYmlsaXR5Q2hhbmdlLmNhbGwoaG9zdCwgZmFsc2UpO1xuXHRcdG9uRWRpdG9yUGFydEdyaWRWaXNpYmlsaXR5Q2hhbmdlLmNhbGwoaG9zdCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyLFxuXHRcdFx0ZXZlbnRzOiBob3N0LmV2ZW50cyxcblx0XHR9LCB7XG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlLFxuXHRcdFx0ZXZlbnRzOiBbXG5cdFx0XHRcdHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UsIHNvdXJjZTogJ3Jlc2l6ZScgfSxcblx0XHRcdFx0eyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlLCBzb3VyY2U6ICdyZXNpemUnIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIHRoZSBzaGFyZWQgbm9kZSBncmlkIHZpc2liaWxpdHkgd2hpbGUgZWRpdG9yIGNvbnRlbnQgaXMgdmlzaWJsZScsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdG9uRWRpdG9yUGFydEdyaWRWaXNpYmlsaXR5Q2hhbmdlLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGF1eGlsaWFyeUJhclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyLCBldmVudHM6IGhvc3QuZXZlbnRzIH0sIHsgYXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSwgZXZlbnRzOiBbXSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZmlyZXMgb25EaWRSZXZlYWxTaWRlUGFuZSBvbmx5IHdoZW4gdGhlIHNpZGUgcGFuZSB0cmFuc2l0aW9ucyBmcm9tIGZ1bGx5IGhpZGRlbiB0byB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IGZhbHNlLCBhdXhpbGlhcnlCYXI6IGZhbHNlIH0gfSk7XG5cdFx0Y29uc3QgY291bnRzOiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0Ly8gRnJvbSBmdWxseSBjbG9zZWQsIHJldmVhbGluZyB0aGUgZWRpdG9yIGZpcmVzIHRoZSByZXZlYWwuXG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXHRcdGNvdW50cy5wdXNoKGhvc3Quc2lkZVBhbmVSZXZlYWxzLmxlbmd0aCk7XG5cdFx0Ly8gVGhlIGF1eCBiYXIgdGhlbiBhbHNvIHNob3dpbmcgZG9lcyBOT1QgZmlyZSBhZ2FpbiBcdTIwMTQgdGhlIHBhbmUgaXMgYWxyZWFkeSB2aXNpYmxlLlxuXHRcdHNldEF1eGlsaWFyeUJhckhpZGRlbi5jYWxsKGhvc3QsIGZhbHNlKTtcblx0XHRjb3VudHMucHVzaChob3N0LnNpZGVQYW5lUmV2ZWFscy5sZW5ndGgpO1xuXHRcdC8vIEZ1bGx5IGNsb3NlIHRoZSBwYW5lIChoaWRlIHRoZSBhdXggZmlyc3Qgd2hpbGUgdGhlIGVkaXRvciBpcyBzdGlsbCB2aXNpYmxlLCB0aGVuXG5cdFx0Ly8gdGhlIGVkaXRvcikgc28gaXQgcmVhY2hlcyB0aGUgZnVsbHktaGlkZGVuIHN0YXRlIHdpdGhvdXQgYW4gYXV0by1yZXZlYWwuXG5cdFx0c2V0QXV4aWxpYXJ5QmFySGlkZGVuLmNhbGwoaG9zdCwgdHJ1ZSk7XG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgdHJ1ZSk7XG5cdFx0Y291bnRzLnB1c2goaG9zdC5zaWRlUGFuZVJldmVhbHMubGVuZ3RoKTtcblx0XHQvLyBSZXZlYWxpbmcgYWdhaW4gZnJvbSBmdWxseSBoaWRkZW4gZmlyZXMgYSBzZWNvbmQgdGltZS5cblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cdFx0Y291bnRzLnB1c2goaG9zdC5zaWRlUGFuZVJldmVhbHMubGVuZ3RoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY291bnRzLCBbMSwgMSwgMSwgMl0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBmaXJlIG9uRGlkUmV2ZWFsU2lkZVBhbmUgaW4gdGhlIGJhc2UgKG5vbi1kb2NrZWQpIGxheW91dCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNlc3Npb25zV2lkdGg6IDEwMDAsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogZmFsc2UgfSB9KTtcblxuXHRcdHNldEF1eGlsaWFyeUJhckhpZGRlbi5jYWxsKGhvc3QsIGZhbHNlKTtcblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdC5zaWRlUGFuZVJldmVhbHMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2hyaW5rcyB0aGUgZG9ja2VkIGVkaXRvciBub2RlIHRvIHRoZSBkZXRhaWwgd2lkdGggd2hlbiBoaWRpbmcgdGhlIGVkaXRvcicsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgaGFzQXBwbGllZEluaXRpYWxFZGl0b3JTcGxpdDogdHJ1ZSwgZG9ja2VkV2lkdGg6IDMyMCwgZWRpdG9yV2lkdGg6IDkwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBob3N0LnZpc2liaWxpdHlDaGFuZ2VzLFxuXHRcdFx0cmVzaXplczogaG9zdC5yZXNpemVzLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0dmlzaWJpbGl0eUNoYW5nZXM6IFt0cnVlXSxcblx0XHRcdHJlc2l6ZXM6IFt7IHdpZHRoOiAzMjAsIGhlaWdodDogODAwIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhcnMgc3RhbGUgc2lkZWJhci1ncm93IHNuYXBzaG90cyB3aGVuIGhpZGluZyB0aGUgZWRpdG9yIHdpdGggdGhlIGRldGFpbCB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCBoYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0OiB0cnVlLCBkb2NrZWRXaWR0aDogMzIwLCBlZGl0b3JXaWR0aDogOTAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXHRcdC8vIENhcHR1cmVkIHdoaWxlIHRoZSBlZGl0b3Igd2FzIHZpc2libGUgYW5kIHRoZSBzZXNzaW9ucyBsaXN0IHdhcyBoaWRkZW4uXG5cdFx0aG9zdC5fbWVtZW50by5lZGl0b3JTaXplR3Jvd25Gb3JTaWRlYmFySGlkZSA9IHsgd2lkdGg6IDkwMCwgaGVpZ2h0OiA4MDAgfTtcblx0XHRob3N0Ll9tZW1lbnRvLmRldGFpbFdpZHRoR3Jvd25Gb3JTaWRlYmFySGlkZSA9IDUwMDtcblxuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdHJlc2l6ZXM6IGhvc3QucmVzaXplcyxcblx0XHRcdGVkaXRvclNpemVHcm93bkZvclNpZGViYXJIaWRlOiBob3N0Ll9tZW1lbnRvLmVkaXRvclNpemVHcm93bkZvclNpZGViYXJIaWRlLFxuXHRcdFx0ZGV0YWlsV2lkdGhHcm93bkZvclNpZGViYXJIaWRlOiBob3N0Ll9tZW1lbnRvLmRldGFpbFdpZHRoR3Jvd25Gb3JTaWRlYmFySGlkZSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdHJlc2l6ZXM6IFt7IHdpZHRoOiAzMjAsIGhlaWdodDogODAwIH1dLFxuXHRcdFx0ZWRpdG9yU2l6ZUdyb3duRm9yU2lkZWJhckhpZGU6IHVuZGVmaW5lZCxcblx0XHRcdGRldGFpbFdpZHRoR3Jvd25Gb3JTaWRlYmFySGlkZTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gW1NjZW5hcmlvIDVdIGVkaXRvciBhdXRvLXJldmVhbCBvbiBvcGVuIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGludGVyZmFjZSBJV2lsbE9wZW5UZXN0SGFybmVzcyB7XG5cdFx0X2VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uQ291bnQ6IG51bWJlcjtcblx0XHRwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IGJvb2xlYW47IGF1eGlsaWFyeUJhcjogYm9vbGVhbiB9O1xuXHRcdGVkaXRvckdyb3VwU2VydmljZTogeyBtYWluUGFydDogeyBncm91cHM6IHsgaWQ6IG51bWJlciB9W10gfSB9O1xuXHRcdHNldEVkaXRvckhpZGRlbihoaWRkZW46IGJvb2xlYW4sIGV4cGxpY2l0PzogYm9vbGVhbik6IHZvaWQ7XG5cdFx0cmVzdG9yZUF0dGFjaGVkRWRpdG9yTWF4aW1pemVkU3RhdGUoKTogdm9pZDtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVdpbGxPcGVuSGFybmVzcyhvdmVycmlkZXM/OiBQYXJ0aWFsPElXaWxsT3BlblRlc3RIYXJuZXNzPik6IHsgaGFybmVzczogSVdpbGxPcGVuVGVzdEhhcm5lc3M7IHNldEVkaXRvckhpZGRlbkNhbGxzOiB7IGhpZGRlbjogYm9vbGVhbjsgZXhwbGljaXQ/OiBib29sZWFuIH1bXSB9IHtcblx0XHRjb25zdCBzZXRFZGl0b3JIaWRkZW5DYWxsczogeyBoaWRkZW46IGJvb2xlYW47IGV4cGxpY2l0PzogYm9vbGVhbiB9W10gPSBbXTtcblx0XHRjb25zdCBoYXJuZXNzOiBJV2lsbE9wZW5UZXN0SGFybmVzcyA9IHtcblx0XHRcdF9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50OiAwLFxuXHRcdFx0cGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9LFxuXHRcdFx0ZWRpdG9yR3JvdXBTZXJ2aWNlOiB7IG1haW5QYXJ0OiB7IGdyb3VwczogW3sgaWQ6IDEgfV0gfSB9LFxuXHRcdFx0c2V0RWRpdG9ySGlkZGVuOiAoaGlkZGVuLCBleHBsaWNpdCkgPT4gc2V0RWRpdG9ySGlkZGVuQ2FsbHMucHVzaCh7IGhpZGRlbiwgZXhwbGljaXQgfSksXG5cdFx0XHRyZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZTogKCkgPT4geyB9LFxuXHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdH07XG5cdFx0cmV0dXJuIHsgaGFybmVzcywgc2V0RWRpdG9ySGlkZGVuQ2FsbHMgfTtcblx0fVxuXG5cdHRlc3QoJ1tTY2VuYXJpbyA1XSBiYXNlIHJldmVhbEVkaXRvck9uT3BlbiByZXZlYWxzIGEgaGlkZGVuIGVkaXRvciBvbiBvcGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFybmVzcywgc2V0RWRpdG9ySGlkZGVuQ2FsbHMgfSA9IGNyZWF0ZVdpbGxPcGVuSGFybmVzcyh7IHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0cmV2ZWFsRWRpdG9yT25PcGVuLmNhbGwoaGFybmVzcywgeyBncm91cElkOiAxLCBlZGl0b3I6IHsgdHlwZUlkOiAnd29ya2JlbmNoLmVkaXRvcnMuZmlsZXMuZmlsZUVkaXRvcklucHV0JyB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXRFZGl0b3JIaWRkZW5DYWxscywgW3sgaGlkZGVuOiBmYWxzZSwgZXhwbGljaXQ6IHRydWUgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbU2NlbmFyaW8gNV0gYmFzZSByZXZlYWxFZGl0b3JPbk9wZW4gZG9lcyBub3QgcmV2ZWFsIHdoZW4gdGhlIG9wZW4gdGFyZ2V0cyBhIG5vbi1tYWluLXBhcnQgZ3JvdXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYXJuZXNzLCBzZXRFZGl0b3JIaWRkZW5DYWxscyB9ID0gY3JlYXRlV2lsbE9wZW5IYXJuZXNzKCk7XG5cblx0XHRyZXZlYWxFZGl0b3JPbk9wZW4uY2FsbChoYXJuZXNzLCB7IGdyb3VwSWQ6IDk5LCBlZGl0b3I6IHsgdHlwZUlkOiAnd29ya2JlbmNoLmVkaXRvcnMuZmlsZXMuZmlsZUVkaXRvcklucHV0JyB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXRFZGl0b3JIaWRkZW5DYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdbU2NlbmFyaW8gNV0gYmFzZSByZXZlYWxFZGl0b3JPbk9wZW4gZG9lcyBub3QgcmV2ZWFsIHdoaWxlIGVkaXRvci1wYXJ0IGF1dG8tdmlzaWJpbGl0eSBpcyBzdXBwcmVzc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFybmVzcywgc2V0RWRpdG9ySGlkZGVuQ2FsbHMgfSA9IGNyZWF0ZVdpbGxPcGVuSGFybmVzcyh7IF9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50OiAxIH0pO1xuXG5cdFx0cmV2ZWFsRWRpdG9yT25PcGVuLmNhbGwoaGFybmVzcywgeyBncm91cElkOiAxLCBlZGl0b3I6IHsgdHlwZUlkOiAnd29ya2JlbmNoLmVkaXRvcnMuZmlsZXMuZmlsZUVkaXRvcklucHV0JyB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXRFZGl0b3JIaWRkZW5DYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2NrZWQgZWRpdG9ycyBhcmUgZXhjbHVkZWQgZnJvbSB0aGUgZWRpdG9yIGxpbWl0IChwcmV2ZW50cyBtYW5hZ2VkLXRhYiBvcGVuL2Nsb3NlIGxvb3ApJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBtYW5hZ2VkIENoYW5nZXMvRmlsZXMgdGFicyBhcmUgcGlubmVkIGJ1dCBub3Qgc3RpY2t5LCBzbyBhIHBlci1ncm91cFxuXHRcdC8vIGVkaXRvciBsaW1pdCBvZiAxIHdvdWxkIG90aGVyd2lzZSBldmljdCB0aGVtIGFuZCB0aGUgbWFuYWdlZC10YWJcblx0XHQvLyByZWNvbmNpbGlhdGlvbiB3b3VsZCByZW9wZW4gdGhlbSwgaGFuZ2luZyB0aGUgcmVuZGVyZXIuIERvY2tlZCBpbnB1dHMgb3B0XG5cdFx0Ly8gb3V0IG9mIHRoZSBsaW1pdCBzbyB0aGV5IGFyZSBuZXZlciBhdXRvLWNsb3NlZC5cblx0XHRjb25zdCBkb2NrZWRFZGl0b3IgPSBuZXcgVGVzdERvY2tlZEVkaXRvcklucHV0KCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvY2tlZEVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkV4Y2x1ZGVGcm9tRWRpdG9yTGltaXQpLCB0cnVlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZG9ja2VkRWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ1tTY2VuYXJpbyA1XSBzaW5nbGUtcGFuZSBkb2VzIG5vdCByZXZlYWwgYSBkb2NrZWQgZWRpdG9yIHdoaWxlIHRoZSBkZXRhaWwgcGFuZWwgaXMgb3BlbiBhbmQgdGhlIGVkaXRvciBpcyBjbG9zZWQnLCAoKSA9PiB7XG5cdFx0Ly8gUmUtYWN0aXZhdGluZyBhIGRvY2tlZC1kZXRhaWwgZWRpdG9yIChjbG9zaW5nIGEgbmVpZ2hib3VyaW5nIHRhYiwgb3Jcblx0XHQvLyBjbGlja2luZyB0aGUgdGFiKSB3aGlsZSB0aGUgZGV0YWlsIHBhbmVsIGFscmVhZHkgc2hvd3MgaXRzIGNvbnRlbnQgbXVzdFxuXHRcdC8vIG5vdCByZXZlYWwgdGhlIGNsb3NlZCBlZGl0b3IgYXJlYS5cblx0XHRjb25zdCBkb2NrZWRFZGl0b3IgPSBuZXcgVGVzdERvY2tlZEVkaXRvcklucHV0KCk7XG5cdFx0Y29uc3QgeyBoYXJuZXNzLCBzZXRFZGl0b3JIaWRkZW5DYWxscyB9ID0gY3JlYXRlV2lsbE9wZW5IYXJuZXNzKHsgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0cmV2ZWFsRWRpdG9yT25PcGVuU2luZ2xlUGFuZS5jYWxsKGhhcm5lc3MsIHsgZ3JvdXBJZDogMSwgZWRpdG9yOiBkb2NrZWRFZGl0b3IgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNldEVkaXRvckhpZGRlbkNhbGxzLCBbXSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRvY2tlZEVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdbU2NlbmFyaW8gNV0gc2luZ2xlLXBhbmUgcmV2ZWFscyBhIGRvY2tlZCBlZGl0b3Igd2hlbiB0aGUgZGV0YWlsIHBhbmVsIGlzIGNsb3NlZCcsICgpID0+IHtcblx0XHQvLyBXaXRoIHRoZSB3aG9sZSBzaWRlIHBhbmUgY2xvc2VkIChkZXRhaWwgcGFuZWwgaGlkZGVuKSwgb3BlbmluZyBhIGRvY2tlZFxuXHRcdC8vIGVkaXRvciBtdXN0IHJldmVhbCB0aGUgZWRpdG9yIGFyZWEgc28gaXRzIGNvbnRlbnQgYmVjb21lcyB2aXNpYmxlLlxuXHRcdGNvbnN0IGRvY2tlZEVkaXRvciA9IG5ldyBUZXN0RG9ja2VkRWRpdG9ySW5wdXQoKTtcblx0XHRjb25zdCB7IGhhcm5lc3MsIHNldEVkaXRvckhpZGRlbkNhbGxzIH0gPSBjcmVhdGVXaWxsT3Blbkhhcm5lc3MoeyBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IGZhbHNlLCBhdXhpbGlhcnlCYXI6IGZhbHNlIH0gfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0cmV2ZWFsRWRpdG9yT25PcGVuU2luZ2xlUGFuZS5jYWxsKGhhcm5lc3MsIHsgZ3JvdXBJZDogMSwgZWRpdG9yOiBkb2NrZWRFZGl0b3IgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNldEVkaXRvckhpZGRlbkNhbGxzLCBbeyBoaWRkZW46IGZhbHNlLCBleHBsaWNpdDogdHJ1ZSB9XSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRvY2tlZEVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdbU2NlbmFyaW8gNV0gc2luZ2xlLXBhbmUgcmV2ZWFscyBhIG5vbi1kb2NrZWQgZWRpdG9yIGV2ZW4gd2hpbGUgdGhlIGRldGFpbCBwYW5lbCBpcyBvcGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFybmVzcywgc2V0RWRpdG9ySGlkZGVuQ2FsbHMgfSA9IGNyZWF0ZVdpbGxPcGVuSGFybmVzcyh7IHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0cmV2ZWFsRWRpdG9yT25PcGVuU2luZ2xlUGFuZS5jYWxsKGhhcm5lc3MsIHsgZ3JvdXBJZDogMSwgZWRpdG9yOiB7IHR5cGVJZDogJ3dvcmtiZW5jaC5lZGl0b3JzLmZpbGVzLmZpbGVFZGl0b3JJbnB1dCcgfSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2V0RWRpdG9ySGlkZGVuQ2FsbHMsIFt7IGhpZGRlbjogZmFsc2UsIGV4cGxpY2l0OiB0cnVlIH1dKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgdGhlIGRvY2tlZCBlZGl0b3Igbm9kZSBzaXplIHdoZW4gc2hvd2luZyBhZnRlciBoaWRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCBoYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0OiB0cnVlLCBkb2NrZWRXaWR0aDogMzIwLCBlZGl0b3JXaWR0aDogOTAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgdHJ1ZSk7XG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBob3N0LnZpc2liaWxpdHlDaGFuZ2VzLFxuXHRcdFx0cmVzaXplczogaG9zdC5yZXNpemVzLFxuXHRcdFx0c25hcHNob3Q6IGhvc3QuX21lbWVudG8uZG9ja2VkRWRpdG9yU2l6ZUJlZm9yZUhpZGUsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBbdHJ1ZSwgdHJ1ZV0sXG5cdFx0XHRyZXNpemVzOiBbXG5cdFx0XHRcdHsgd2lkdGg6IDMyMCwgaGVpZ2h0OiA4MDAgfSxcblx0XHRcdFx0eyB3aWR0aDogOTAwLCBoZWlnaHQ6IDgwMCB9LFxuXHRcdFx0XSxcblx0XHRcdHNuYXBzaG90OiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1cHByZXNzZXMgZG9ja2VkIGVkaXRvciByZXZlYWwgc3luYyB3aGlsZSBoaWRpbmcgdGhlIGVkaXRvcicsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgaGFzQXBwbGllZEluaXRpYWxFZGl0b3JTcGxpdDogdHJ1ZSwgZG9ja2VkV2lkdGg6IDMyMCwgZWRpdG9yV2lkdGg6IDkwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblx0XHQvLyBBbnkgZ3JpZCBtdXRhdGlvbiByZS1lbnRlcnMgcmV2ZWFsLXN5bmM7IGl0IG11c3QgYmUgYSBuby1vcCB3aGlsZSBzdXNwZW5kZWQuXG5cdFx0Y29uc3QgZ3JpZCA9IChob3N0IGFzIHVua25vd24gYXMgeyB3b3JrYmVuY2hHcmlkOiB7IHNldFZpZXdWaXNpYmxlKHZpZXc6IG9iamVjdCwgdmlzaWJsZTogYm9vbGVhbik6IHZvaWQgfSB9KS53b3JrYmVuY2hHcmlkO1xuXHRcdGNvbnN0IHNldFZpZXdWaXNpYmxlID0gZ3JpZC5zZXRWaWV3VmlzaWJsZTtcblx0XHRncmlkLnNldFZpZXdWaXNpYmxlID0gKHZpZXcsIHZpc2libGUpID0+IHtcblx0XHRcdHNldFZpZXdWaXNpYmxlKHZpZXcsIHZpc2libGUpO1xuXHRcdFx0b25FZGl0b3JOb2RlUmVzaXplZC5jYWxsKGhvc3QsIDkwMCk7XG5cdFx0fTtcblxuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGV2ZW50czogaG9zdC5ldmVudHMsXG5cdFx0XHRyZXNpemVzOiBob3N0LnJlc2l6ZXMsXG5cdFx0XHRzbmFwc2hvdDogaG9zdC5fbWVtZW50by5kb2NrZWRFZGl0b3JTaXplQmVmb3JlSGlkZSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGV2ZW50czogW3sgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogZmFsc2UgfV0sXG5cdFx0XHRyZXNpemVzOiBbeyB3aWR0aDogMzIwLCBoZWlnaHQ6IDgwMCB9XSxcblx0XHRcdHNuYXBzaG90OiB7IHdpZHRoOiA5MDAsIGhlaWdodDogODAwIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIHRoZSByZW1lbWJlcmVkIGdsb2JhbCBlZGl0b3Igd2lkdGggb24gcmV2ZWFsIGluc3RlYWQgb2YgdGhlIGRlZmF1bHQgc3BsaXQgKGNyb3NzLXNlc3Npb24pJywgKCkgPT4ge1xuXHRcdC8vIFNlc3Npb24gQSBoYWQgdGhlIHNpZGUgcGFuZSBhdCBhIHVzZXItY2hvc2VuIHdpZHRoOyBhbm90aGVyIHNlc3Npb24gY2xvc2VkIHRoZVxuXHRcdC8vIHdob2xlIHBhbmUuIFBhcnQgc2l6ZXMgYXJlIHdvcmtiZW5jaC1nbG9iYWwsIHNvIHN3aXRjaGluZyBiYWNrIG11c3QgcmVzdG9yZSB0aGF0XG5cdFx0Ly8gd2lkdGgsIG5vdCByZXNldCB0byB0aGUgNjAlIGRlZmF1bHQuIFRoZSB3aWR0aCBpcyByZW1lbWJlcmVkIGluIGBfc2F2ZWRQYXJ0U2l6ZXNgLlxuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCB3aW5kb3dXaWR0aDogMTAwMCwgaGFzQXBwbGllZEluaXRpYWxFZGl0b3JTcGxpdDogdHJ1ZSwgZG9ja2VkV2lkdGg6IDMwMCwgZWRpdG9yV2lkdGg6IDUyMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IGZhbHNlIH0gfSk7XG5cblx0XHQvLyBDbG9zZSB0aGUgd2hvbGUgc2lkZSBwYW5lIChhdXggYWxyZWFkeSBoaWRkZW4pIFx1MjAxNCB0aGlzIGNhcHR1cmVzIDUyMCBhcyB0aGVcblx0XHQvLyByZW1lbWJlcmVkIGdsb2JhbCB3aWR0aCBhbmQgY29sbGFwc2VzIHRoZSBub2RlLlxuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIHRydWUpO1xuXHRcdGNvbnN0IHJlbWVtYmVyZWRXaWR0aCA9IGhvc3QuX3NhdmVkUGFydFNpemVzLmVkaXRvcjtcblx0XHRjb25zdCByZXNpemVzQmVmb3JlUmV2ZWFsID0gaG9zdC5yZXNpemVzLmxlbmd0aDtcblxuXHRcdC8vIFJldmVhbCAoc3dpdGNoIGJhY2spOiByZXN0b3JlcyB0aGUgcmVtZW1iZXJlZCA1MjAsIG5vdCB0aGUgNjAlIHNwbGl0ICg2MDApLlxuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIGZhbHNlKTtcblx0XHRjb25zdCByZXZlYWxSZXNpemVzID0gaG9zdC5yZXNpemVzLnNsaWNlKHJlc2l6ZXNCZWZvcmVSZXZlYWwpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZW1lbWJlcmVkV2lkdGgsXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdHJldmVhbFJlc2l6ZXMsXG5cdFx0fSwge1xuXHRcdFx0cmVtZW1iZXJlZFdpZHRoOiA1MjAsXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiB0cnVlLFxuXHRcdFx0cmV2ZWFsUmVzaXplczogW3sgd2lkdGg6IDUyMCwgaGVpZ2h0OiA4MDAgfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZS1wYW5lIGVkaXRvciBwYXJ0IHByZWZlcnJlZFdpZHRoIGlzIDYwJSBvZiB0aGUgd2luZG93IChkcml2ZXMgc2FzaCBkb3VibGUtY2xpY2sgcmVzZXQpJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBncmlkIHJlc2V0cyBhIHZpZXcgdG8gaXRzIGBwcmVmZXJyZWRXaWR0aGAgb24gc2FzaCBkb3VibGUtY2xpY2ssIHNvIHRoZVxuXHRcdC8vIHNpZGUtcGFuZVx1MjE5NGNoYXQgc2FzaCBkb3VibGUtY2xpY2sgcmVzZXRzIHRoZSBzaWRlIHBhbmUgdG8gNjAlIG9mIHRoZSB3aW5kb3cuXG5cdFx0Ly8gU2NvcGVkIHRvIHNpbmdsZS1wYW5lOyB0aGUgY2xhc3NpYyBlZGl0b3IgcGFydCBoYXMgbm8gYHByZWZlcnJlZFdpZHRoYCBvdmVycmlkZS5cblx0XHRjb25zdCBwcmVmZXJyZWRXaWR0aEdldHRlciA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoU2luZ2xlUGFuZU1haW5FZGl0b3JQYXJ0LnByb3RvdHlwZSwgJ3ByZWZlcnJlZFdpZHRoJykhLmdldCE7XG5cdFx0Y29uc3QgY2FsbCA9ICh3aW5kb3dXaWR0aDogbnVtYmVyKSA9PiBwcmVmZXJyZWRXaWR0aEdldHRlci5jYWxsKHsgbGF5b3V0U2VydmljZTogeyBtYWluQ29udGFpbmVyRGltZW5zaW9uOiB7IHdpZHRoOiB3aW5kb3dXaWR0aCwgaGVpZ2h0OiA4MDAgfSwgaXNWaXNpYmxlOiAoKSA9PiB0cnVlIH0gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdpZGU6IGNhbGwoMjAwMCksXG5cdFx0XHRuYXJyb3c6IGNhbGwoNDAwKSxcblx0XHR9LCB7XG5cdFx0XHR3aWRlOiAxMjAwLFxuXHRcdFx0bmFycm93OiAzMDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZS1wYW5lIGVkaXRvciBwYXJ0IHByZWZlcnJlZFdpZHRoIHJlc2V0cyB0byB0aGUgZG9ja2VkIGRldGFpbCBkZWZhdWx0IHdpZHRoIGluc3RlYWQgb2YgNjAlIHdoZW4gZWRpdG9yIGNvbnRlbnQgaXMgaGlkZGVuJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBkb2NrZWQgZGV0YWlsIHBhbmVsJ3Mgb3duIHJlc2l6ZSBzYXNoIHNpdHMgYXQgdGhlIHNhbWUgc3BvdCBhcyB0aGlzXG5cdFx0Ly8gZ3JpZCBzYXNoIHdoaWxlIHRoZSBlZGl0b3IgaXMgaGlkZGVuLCBzbyBkb3VibGUtY2xpY2tpbmcgdGhlcmUgbXVzdCByZXNldFxuXHRcdC8vIHRvIHRoZSBkZXRhaWwgcGFuZWwncyBvd24gZGVmYXVsdCB3aWR0aCwgbm90IGEgd2luZG93LXJlbGF0aXZlIHNwbGl0LlxuXHRcdGNvbnN0IHByZWZlcnJlZFdpZHRoR2V0dGVyID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihTaW5nbGVQYW5lTWFpbkVkaXRvclBhcnQucHJvdG90eXBlLCAncHJlZmVycmVkV2lkdGgnKSEuZ2V0ITtcblx0XHRjb25zdCBwcmVmZXJyZWRXaWR0aCA9IHByZWZlcnJlZFdpZHRoR2V0dGVyLmNhbGwoeyBsYXlvdXRTZXJ2aWNlOiB7IG1haW5Db250YWluZXJEaW1lbnNpb246IHsgd2lkdGg6IDIwMDAsIGhlaWdodDogODAwIH0sIGlzVmlzaWJsZTogKCkgPT4gZmFsc2UgfSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVmZXJyZWRXaWR0aCwgRG9ja2VkQXV4aWxpYXJ5QmFyQ29udHJvbGxlci5ERUZBVUxUX1dJRFRIKTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlLXBhbmUgZWRpdG9yIHBhcnQgaXMgYSBzbmFwIHZpZXcgb25seSB3aGlsZSBlZGl0b3IgY29udGVudCBpcyBoaWRkZW4gKGRvY2tlZCBkZXRhaWwtb25seSknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc25hcEdldHRlciA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoU2luZ2xlUGFuZU1haW5FZGl0b3JQYXJ0LnByb3RvdHlwZSwgJ3NuYXAnKSEuZ2V0ITtcblx0XHRjb25zdCBjYWxsID0gKGVkaXRvclZpc2libGU6IGJvb2xlYW4pID0+IHNuYXBHZXR0ZXIuY2FsbCh7IGxheW91dFNlcnZpY2U6IHsgaXNWaXNpYmxlOiAoKSA9PiBlZGl0b3JWaXNpYmxlIH0gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZWRpdG9ySGlkZGVuOiBjYWxsKGZhbHNlKSwgZWRpdG9yVmlzaWJsZTogY2FsbCh0cnVlKSB9LCB7IGVkaXRvckhpZGRlbjogdHJ1ZSwgZWRpdG9yVmlzaWJsZTogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZS1wYW5lIGVkaXRvciBwYXJ0IG1pbmltdW1XaWR0aCBtYXRjaGVzIHRoZSBzZXNzaW9ucy1saXN0IG1pbmltdW0gd2hpbGUgZWRpdG9yIGNvbnRlbnQgaXMgaGlkZGVuIChkb2NrZWQgZGV0YWlsLW9ubHkpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1pbmltdW1XaWR0aEdldHRlciA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoU2luZ2xlUGFuZU1haW5FZGl0b3JQYXJ0LnByb3RvdHlwZSwgJ21pbmltdW1XaWR0aCcpIS5nZXQhO1xuXHRcdGNvbnN0IG1pbmltdW1XaWR0aCA9IG1pbmltdW1XaWR0aEdldHRlci5jYWxsKHsgbGF5b3V0U2VydmljZTogeyBpc1Zpc2libGU6ICgpID0+IGZhbHNlIH0gfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWluaW11bVdpZHRoLCBTRVNTSU9OU19MSVNUX01JTklNVU1fV0lEVEgpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBsaWVzIGFuIGV2ZW4gc3BsaXQgd2hlbiByZXZlYWxpbmcgdGhlIGRvY2tlZCBlZGl0b3Igd2l0aCBubyBjYXB0dXJlZCB3aWR0aCBldmVuIGFmdGVyIHRoZSBpbml0aWFsIHNwbGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCB3aW5kb3dXaWR0aDogMTAwMCwgaGFzQXBwbGllZEluaXRpYWxFZGl0b3JTcGxpdDogdHJ1ZSwgZG9ja2VkV2lkdGg6IDMwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSk7XG5cblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0dmlzaWJpbGl0eUNoYW5nZXM6IGhvc3QudmlzaWJpbGl0eUNoYW5nZXMsXG5cdFx0XHRyZXNpemVzOiBob3N0LnJlc2l6ZXMsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBbdHJ1ZV0sXG5cdFx0XHRyZXNpemVzOiBbeyB3aWR0aDogNjAwLCBoZWlnaHQ6IDgwMCB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgYSBjYXB0dXJlZCBkb2NrZWQgZWRpdG9yIHdpZHRoIGluc3RlYWQgb2YgYXBwbHlpbmcgYW4gZXZlbiBzcGxpdCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgaGFzQXBwbGllZEluaXRpYWxFZGl0b3JTcGxpdDogdHJ1ZSwgZG9ja2VkV2lkdGg6IDMwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSk7XG5cdFx0aG9zdC5fbWVtZW50by5kb2NrZWRFZGl0b3JTaXplQmVmb3JlSGlkZSA9IHsgd2lkdGg6IDcyMCwgaGVpZ2h0OiA4MDAgfTtcblxuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IsXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogaG9zdC52aXNpYmlsaXR5Q2hhbmdlcyxcblx0XHRcdHJlc2l6ZXM6IGhvc3QucmVzaXplcyxcblx0XHRcdHNuYXBzaG90OiBob3N0Ll9tZW1lbnRvLmRvY2tlZEVkaXRvclNpemVCZWZvcmVIaWRlLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogW3RydWVdLFxuXHRcdFx0cmVzaXplczogW3sgd2lkdGg6IDcyMCwgaGVpZ2h0OiA4MDAgfV0sXG5cdFx0XHRzbmFwc2hvdDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW9wZW5pbmcgdGhlIHdob2xlIHNpZGUgcGFuZSB3aGlsZSB0aGUgc2lkZWJhciBpcyBjb2xsYXBzZWQgZXZlbi1zcGxpdHMgaW5zdGVhZCBvZiByZXN0b3JpbmcgYSBjcmFtcGVkIHdpZHRoJywgKCkgPT4ge1xuXHRcdC8vIFNpbXVsYXRlcyB0b2dnbGUtY2xvc2Ugb3JkZXIgKGF1eGlsaWFyeSBiYXIgYWxyZWFkeSBoaWRkZW4sIGVkaXRvciBhYm91dFxuXHRcdC8vIHRvIGhpZGUpIHdoaWxlIHRoZSBzaWRlYmFyIGlzIGNvbGxhcHNlZDogdGhlIGVkaXRvciBncmlkIG5vZGUgY29sbGFwc2VzIHRvXG5cdFx0Ly8gYSB0aW55IHdpZHRoIGFuZCBhIHN0YWxlIHNpZGViYXItZ3JvdyBzbmFwc2hvdCBpcyBwcmVzZW50LiBDbG9zaW5nIG11c3Qgbm90XG5cdFx0Ly8gY2FwdHVyZSB0aGUgY29sbGFwc2VkIHdpZHRoLCBhbmQgbXVzdCBjbGVhciB0aGUgc3RhbGUgc25hcHNob3RzIHNvIHRoZVxuXHRcdC8vIHJlb3BlbiBhcHBsaWVzIGEgY29tZm9ydGFibGUgZXZlbiBzcGxpdCBvZiB0aGUgd2lkZSBtYWluIGFyZWEuXG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHNlc3Npb25zV2lkdGg6IDEzNjAsIHdpbmRvd1dpZHRoOiAxMzYwLCBoYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0OiB0cnVlLCBkb2NrZWRXaWR0aDogMzAwLCBlZGl0b3JXaWR0aDogNDAsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9IH0pO1xuXHRcdGhvc3QuX21lbWVudG8uZWRpdG9yU2l6ZUdyb3duRm9yU2lkZWJhckhpZGUgPSB7IHdpZHRoOiA2MjAsIGhlaWdodDogODAwIH07XG5cdFx0aG9zdC5fbWVtZW50by5kZXRhaWxXaWR0aEdyb3duRm9yU2lkZWJhckhpZGUgPSAzMDA7XG5cblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblx0XHRjb25zdCBhZnRlckNsb3NlID0ge1xuXHRcdFx0c25hcHNob3Q6IGhvc3QuX21lbWVudG8uZG9ja2VkRWRpdG9yU2l6ZUJlZm9yZUhpZGUsXG5cdFx0XHRncm93bkVkaXRvcjogaG9zdC5fbWVtZW50by5lZGl0b3JTaXplR3Jvd25Gb3JTaWRlYmFySGlkZSxcblx0XHRcdGdyb3duRGV0YWlsOiBob3N0Ll9tZW1lbnRvLmRldGFpbFdpZHRoR3Jvd25Gb3JTaWRlYmFySGlkZSxcblx0XHRcdHJlc2l6ZXM6IFsuLi5ob3N0LnJlc2l6ZXNdLFxuXHRcdH07XG5cblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFmdGVyQ2xvc2UsXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdHJlc2l6ZXM6IGhvc3QucmVzaXplcyxcblx0XHRcdHNuYXBzaG90OiBob3N0Ll9tZW1lbnRvLmRvY2tlZEVkaXRvclNpemVCZWZvcmVIaWRlLFxuXHRcdH0sIHtcblx0XHRcdGFmdGVyQ2xvc2U6IHtcblx0XHRcdFx0c25hcHNob3Q6IHVuZGVmaW5lZCxcblx0XHRcdFx0Z3Jvd25FZGl0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0Z3Jvd25EZXRhaWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzaXplczogW10sXG5cdFx0XHR9LFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHRcdHJlc2l6ZXM6IFt7IHdpZHRoOiA4MTYsIGhlaWdodDogODAwIH1dLFxuXHRcdFx0c25hcHNob3Q6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIERvY2tlZCBlZGl0b3IgaGlkZS1zeW5jIChncmlkIHNhc2ggLyBlZGl0b3IgcGFydCBsYXlvdXQpIC0tLS0tLS0tLS0tXG5cblx0dGVzdCgnZG9lcyBub3QgcmV2ZWFsIHRoZSBkb2NrZWQgZWRpdG9yIHdoZW4gdGhlIGdyaWQgc2FzaCB3aWRlbnMgdGhlIG5vZGUgd2hpbGUgb25seSB0aGUgZGV0YWlsIGlzIHNob3duJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCBkb2NrZWRXaWR0aDogMzAwLCBlZGl0b3JXaWR0aDogMzA1IH0pO1xuXHRcdGhvc3QuX21lbWVudG8uZG9ja2VkRWRpdG9yU2l6ZUJlZm9yZUhpZGUgPSB7IHdpZHRoOiA5MDAsIGhlaWdodDogODAwIH07XG5cblx0XHRvbkdyaWREaWRDaGFuZ2UuY2FsbChob3N0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IsXG5cdFx0XHRldmVudHM6IGhvc3QuZXZlbnRzLFxuXHRcdFx0bGF5b3V0Q291bnQ6IGhvc3QuY291bnRzLmxheW91dCxcblx0XHRcdHNhdmVDb3VudDogaG9zdC5jb3VudHMuc2F2ZSxcblx0XHRcdGNsYXNzVG9nZ2xlczogaG9zdC5jbGFzc1RvZ2dsZXMsXG5cdFx0XHRyZXNpemVzOiBob3N0LnJlc2l6ZXMsXG5cdFx0XHRzbmFwc2hvdDogaG9zdC5fbWVtZW50by5kb2NrZWRFZGl0b3JTaXplQmVmb3JlSGlkZSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGV2ZW50czogW10sXG5cdFx0XHRsYXlvdXRDb3VudDogMCxcblx0XHRcdHNhdmVDb3VudDogMCxcblx0XHRcdGNsYXNzVG9nZ2xlczogW10sXG5cdFx0XHRyZXNpemVzOiBbXSxcblx0XHRcdHNuYXBzaG90OiB7IHdpZHRoOiA5MDAsIGhlaWdodDogODAwIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJldmVhbCB0aGUgZG9ja2VkIGVkaXRvciBmcm9tIGVkaXRvciBwYXJ0IGxheW91dCB3aWR0aCB3aGlsZSBvbmx5IHRoZSBkZXRhaWwgaXMgc2hvd24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHNlc3Npb25zV2lkdGg6IDEwMDAsIGRvY2tlZFdpZHRoOiAzMDAsIGVkaXRvcldpZHRoOiAzMDAgfSk7XG5cdFx0aG9zdC5fbWVtZW50by5kb2NrZWRFZGl0b3JTaXplQmVmb3JlSGlkZSA9IHsgd2lkdGg6IDkwMCwgaGVpZ2h0OiA4MDAgfTtcblxuXHRcdG9uRWRpdG9yTm9kZVJlc2l6ZWQuY2FsbChob3N0LCAzMDUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGV2ZW50czogaG9zdC5ldmVudHMsXG5cdFx0XHRsYXlvdXRDb3VudDogaG9zdC5jb3VudHMubGF5b3V0LFxuXHRcdFx0c2F2ZUNvdW50OiBob3N0LmNvdW50cy5zYXZlLFxuXHRcdFx0c25hcHNob3Q6IGhvc3QuX21lbWVudG8uZG9ja2VkRWRpdG9yU2l6ZUJlZm9yZUhpZGUsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRldmVudHM6IFtdLFxuXHRcdFx0bGF5b3V0Q291bnQ6IDAsXG5cdFx0XHRzYXZlQ291bnQ6IDAsXG5cdFx0XHRzbmFwc2hvdDogeyB3aWR0aDogOTAwLCBoZWlnaHQ6IDgwMCB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXZlYWwgdGhlIGRvY2tlZCBlZGl0b3Igd2hlbiB0aGUgc2FzaCB3aWRlbnMgdGhlIG5vZGUgZW5vdWdoIHRvIGZpdCB0aGUgZWRpdG9yIGJlc2lkZSB0aGUgZGV0YWlsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCBkb2NrZWRXaWR0aDogMzAwLCBlZGl0b3JXaWR0aDogNTAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IGZhbHNlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdG9uRWRpdG9yTm9kZVJlc2l6ZWQuY2FsbChob3N0LCA1MDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGV2ZW50czogaG9zdC5ldmVudHMsXG5cdFx0XHRsYXlvdXRDb3VudDogaG9zdC5jb3VudHMubGF5b3V0LFxuXHRcdFx0c2F2ZUNvdW50OiBob3N0LmNvdW50cy5zYXZlLFxuXHRcdFx0Y2xhc3NUb2dnbGVzOiBob3N0LmNsYXNzVG9nZ2xlcyxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGV2ZW50czogW10sXG5cdFx0XHRsYXlvdXRDb3VudDogMCxcblx0XHRcdHNhdmVDb3VudDogMCxcblx0XHRcdGNsYXNzVG9nZ2xlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJldmVhbCB0aGUgZG9ja2VkIGVkaXRvciB3aGlsZSB3aWRlbmluZyB0aGUgbm9kZSBmcm9tIGEgZ3JpZCBsYXlvdXQgY2hhbmdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCBkb2NrZWRXaWR0aDogMzAwLCBlZGl0b3JXaWR0aDogNDk5LCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IGZhbHNlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdG9uR3JpZERpZENoYW5nZS5jYWxsKGhvc3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGV2ZW50czogaG9zdC5ldmVudHMsXG5cdFx0XHRsYXlvdXRDb3VudDogaG9zdC5jb3VudHMubGF5b3V0LFxuXHRcdFx0c2F2ZUNvdW50OiBob3N0LmNvdW50cy5zYXZlLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0ZXZlbnRzOiBbXSxcblx0XHRcdGxheW91dENvdW50OiAwLFxuXHRcdFx0c2F2ZUNvdW50OiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXZlYWwgdGhlIGRvY2tlZCBlZGl0b3IgZnJvbSBhIHdpZGVuIHdoaWxlIHRoZSBkZXRhaWwgaXMgYWxzbyBoaWRkZW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHNlc3Npb25zV2lkdGg6IDEwMDAsIGRvY2tlZFdpZHRoOiAzMDAsIGVkaXRvcldpZHRoOiA2NTAsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogZmFsc2UgfSB9KTtcblxuXHRcdG9uRWRpdG9yTm9kZVJlc2l6ZWQuY2FsbChob3N0LCA2NTApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGV2ZW50czogaG9zdC5ldmVudHMsXG5cdFx0XHRsYXlvdXRDb3VudDogaG9zdC5jb3VudHMubGF5b3V0LFxuXHRcdFx0c2F2ZUNvdW50OiBob3N0LmNvdW50cy5zYXZlLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0ZXZlbnRzOiBbXSxcblx0XHRcdGxheW91dENvdW50OiAwLFxuXHRcdFx0c2F2ZUNvdW50OiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBkb2NrZWQgZWRpdG9yIGhpZGRlbiB3aGVuIGVkaXRvciBwYXJ0IGxheW91dCB3aWR0aCBsZWF2ZXMgb25seSBkZXRhaWwgd2lkdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHNlc3Npb25zV2lkdGg6IDEwMDAsIGRvY2tlZFdpZHRoOiAzMDAsIGVkaXRvcldpZHRoOiAzMDAgfSk7XG5cblx0XHRvbkVkaXRvck5vZGVSZXNpemVkLmNhbGwoaG9zdCwgMzA0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IsXG5cdFx0XHRldmVudHM6IGhvc3QuZXZlbnRzLFxuXHRcdFx0bGF5b3V0Q291bnQ6IGhvc3QuY291bnRzLmxheW91dCxcblx0XHRcdHNhdmVDb3VudDogaG9zdC5jb3VudHMuc2F2ZSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGV2ZW50czogW10sXG5cdFx0XHRsYXlvdXRDb3VudDogMCxcblx0XHRcdHNhdmVDb3VudDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgZG9ja2VkIGVkaXRvciBoaWRkZW4gd2hlbiBncmlkIHNhc2ggbGVhdmVzIG9ubHkgZGV0YWlsIHdpZHRoJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCBkb2NrZWRXaWR0aDogMzAwLCBlZGl0b3JXaWR0aDogMzAwIH0pO1xuXG5cdFx0b25HcmlkRGlkQ2hhbmdlLmNhbGwoaG9zdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0ZXZlbnRzOiBob3N0LmV2ZW50cyxcblx0XHRcdGxheW91dENvdW50OiBob3N0LmNvdW50cy5sYXlvdXQsXG5cdFx0XHRzYXZlQ291bnQ6IGhvc3QuY291bnRzLnNhdmUsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRldmVudHM6IFtdLFxuXHRcdFx0bGF5b3V0Q291bnQ6IDAsXG5cdFx0XHRzYXZlQ291bnQ6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGVzIGRldGFpbHMgd2hlbiB0aGUgZWRpdG9yIHNhc2ggbGVhdmVzIHRvbyBsaXR0bGUgcm9vbSBmb3IgYm90aCBwYW5lcycsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgZG9ja2VkV2lkdGg6IDMwMCwgZWRpdG9yV2lkdGg6IDYwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdG9uRWRpdG9yTm9kZVJlc2l6ZWQuY2FsbChob3N0LCA1OTkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGRldGFpbFZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyLFxuXHRcdFx0ZGV0YWlsSGlkZGVuRm9yRWRpdG9yUmVzaXplOiBob3N0Ll9kZXRhaWxIaWRkZW5Gb3JFZGl0b3JSZXNpemUsXG5cdFx0XHRldmVudHM6IGhvc3QuZXZlbnRzLFxuXHRcdFx0bGF5b3V0Q291bnQ6IGhvc3QuY291bnRzLmxheW91dCxcblx0XHRcdHNhdmVDb3VudDogaG9zdC5jb3VudHMuc2F2ZSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiB0cnVlLFxuXHRcdFx0ZGV0YWlsVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRkZXRhaWxIaWRkZW5Gb3JFZGl0b3JSZXNpemU6IHRydWUsXG5cdFx0XHRldmVudHM6IFt7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlLCBzb3VyY2U6ICdyZXNpemUnIH1dLFxuXHRcdFx0bGF5b3V0Q291bnQ6IDEsXG5cdFx0XHRzYXZlQ291bnQ6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3dzIGRldGFpbHMgd2hlbiB0aGUgZWRpdG9yIHNhc2ggcmVzdG9yZXMgcm9vbSBhZnRlciBhbiBhdXRvbWF0aWMgaGlkZScsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgZG9ja2VkV2lkdGg6IDMwMCwgZWRpdG9yV2lkdGg6IDYwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdG9uRWRpdG9yTm9kZVJlc2l6ZWQuY2FsbChob3N0LCA1OTkpO1xuXHRcdG9uRWRpdG9yTm9kZVJlc2l6ZWQuY2FsbChob3N0LCA3MDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGRldGFpbFZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyLFxuXHRcdFx0ZGV0YWlsSGlkZGVuRm9yRWRpdG9yUmVzaXplOiBob3N0Ll9kZXRhaWxIaWRkZW5Gb3JFZGl0b3JSZXNpemUsXG5cdFx0XHRldmVudHM6IGhvc3QuZXZlbnRzLFxuXHRcdFx0bGF5b3V0Q291bnQ6IGhvc3QuY291bnRzLmxheW91dCxcblx0XHRcdHNhdmVDb3VudDogaG9zdC5jb3VudHMuc2F2ZSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiB0cnVlLFxuXHRcdFx0ZGV0YWlsVmlzaWJsZTogdHJ1ZSxcblx0XHRcdGRldGFpbEhpZGRlbkZvckVkaXRvclJlc2l6ZTogZmFsc2UsXG5cdFx0XHRldmVudHM6IFtcblx0XHRcdFx0eyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiBmYWxzZSwgc291cmNlOiAncmVzaXplJyB9LFxuXHRcdFx0XHR7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUsIHNvdXJjZTogJ3Jlc2l6ZScgfSxcblx0XHRcdF0sXG5cdFx0XHRsYXlvdXRDb3VudDogMixcblx0XHRcdHNhdmVDb3VudDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgaGlkZSBkb2NrZWQgZWRpdG9yIHdoZW4gbm9kZSBpcyBzcXVlZXplZCBidXQgZGV0YWlsIGlzIGFsc28gaGlkZGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCBkb2NrZWRXaWR0aDogMzAwLCBlZGl0b3JXaWR0aDogNjAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogZmFsc2UgfSB9KTtcblxuXHRcdG9uRWRpdG9yTm9kZVJlc2l6ZWQuY2FsbChob3N0LCAzMDQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGV2ZW50czogaG9zdC5ldmVudHMsXG5cdFx0XHRsYXlvdXRDb3VudDogaG9zdC5jb3VudHMubGF5b3V0LFxuXHRcdFx0c2F2ZUNvdW50OiBob3N0LmNvdW50cy5zYXZlLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0XHRldmVudHM6IFtdLFxuXHRcdFx0bGF5b3V0Q291bnQ6IDAsXG5cdFx0XHRzYXZlQ291bnQ6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGVkaXRvciByZXNpemUgc3RhdGUgd2hlbiB0aGUgb3V0ZXIgc2FzaCBoaWRlcyBkZXRhaWxzIGJlZm9yZSBjb2xsYXBzaW5nIHRoZSBlZGl0b3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHNlc3Npb25zV2lkdGg6IDEwMDAsIGRvY2tlZFdpZHRoOiAzMDAsIGVkaXRvcldpZHRoOiA2MDAsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSk7XG5cdFx0aG9zdC5fbWVtZW50by5lZGl0b3JTaXplR3Jvd25Gb3JTaWRlYmFySGlkZSA9IHsgd2lkdGg6IDgwMCwgaGVpZ2h0OiA2MDAgfTtcblx0XHRob3N0Ll9tZW1lbnRvLmRldGFpbFdpZHRoR3Jvd25Gb3JTaWRlYmFySGlkZSA9IDQwMDtcblx0XHRob3N0Ll9lZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHkgPSB0cnVlO1xuXG5cdFx0b25FZGl0b3JOb2RlUmVzaXplZC5jYWxsKGhvc3QsIDMwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0ZGV0YWlsVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIsXG5cdFx0XHRlZGl0b3JTaXplR3Jvd25Gb3JTaWRlYmFySGlkZTogaG9zdC5fbWVtZW50by5lZGl0b3JTaXplR3Jvd25Gb3JTaWRlYmFySGlkZSxcblx0XHRcdGRldGFpbFdpZHRoR3Jvd25Gb3JTaWRlYmFySGlkZTogaG9zdC5fbWVtZW50by5kZXRhaWxXaWR0aEdyb3duRm9yU2lkZWJhckhpZGUsXG5cdFx0XHRlZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHk6IGhvc3QuX2VkaXRvclJldmVhbGVkRXhwbGljaXRseSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiB0cnVlLFxuXHRcdFx0ZGV0YWlsVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRlZGl0b3JTaXplR3Jvd25Gb3JTaWRlYmFySGlkZTogeyB3aWR0aDogODAwLCBoZWlnaHQ6IDYwMCB9LFxuXHRcdFx0ZGV0YWlsV2lkdGhHcm93bkZvclNpZGViYXJIaWRlOiA0MDAsXG5cdFx0XHRlZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHk6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBEb2NrZWRBdXhpbGlhcnlCYXJDb250cm9sbGVyIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnZmlsbHMgdGhlIG5hcnJvd2VkIGRvY2tlZCBkZXRhaWwgbm9kZSBhbmQgZGlzYWJsZXMgaXRzIG92ZXJsYXkgc2FzaCB3aGVuIGVkaXRvciBjb250ZW50IGlzIGhpZGRlbicsICgpID0+IHtcblxuXHRcdGNvbnN0IGVkaXRvckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IGxheW91dHM6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IHRvcDogbnVtYmVyOyBsZWZ0OiBudW1iZXIgfVtdID0gW107XG5cdFx0Y29uc3QgaW5zZXRzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IHBlcnNpc3RlZFdpZHRoczogbnVtYmVyW10gPSBbXTtcblx0XHRsZXQgZWRpdG9yVmlzaWJsZSA9IHRydWU7XG5cdFx0bGV0IGVkaXRvcldpZHRoID0gODAwO1xuXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGVkaXRvckNvbnRhaW5lciwgJ2NsaWVudFdpZHRoJywgeyBnZXQ6ICgpID0+IGVkaXRvcldpZHRoIH0pO1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShlZGl0b3JDb250YWluZXIsICdjbGllbnRIZWlnaHQnLCB7IHZhbHVlOiA2MDAgfSk7XG5cdFx0ZWRpdG9yQ29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCA9ICgpID0+ICh7XG5cdFx0XHR3aWR0aDogZWRpdG9yV2lkdGgsXG5cdFx0XHRoZWlnaHQ6IDYwMCxcblx0XHRcdHRvcDogMCxcblx0XHRcdHJpZ2h0OiBlZGl0b3JXaWR0aCxcblx0XHRcdGJvdHRvbTogNjAwLFxuXHRcdFx0bGVmdDogMCxcblx0XHRcdHg6IDAsXG5cdFx0XHR5OiAwLFxuXHRcdFx0dG9KU09OOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBhdXhpbGlhcnlCYXJQYXJ0ID0ge1xuXHRcdFx0Z2V0Q29udGFpbmVyOiAoKSA9PiBhdXhpbGlhcnlCYXJDb250YWluZXIsXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGxlZnQ6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRsYXlvdXRzLnB1c2goeyB3aWR0aCwgaGVpZ2h0LCB0b3AsIGxlZnQgfSk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBQYXJ0O1xuXHRcdGNvbnN0IGhvc3Q6IElEb2NrZWRBdXhpbGlhcnlCYXJIb3N0ID0ge1xuXHRcdFx0Z2V0V2lkdGg6ICgpID0+IDI2MCxcblx0XHRcdHNldFdpZHRoOiB3aWR0aCA9PiBwZXJzaXN0ZWRXaWR0aHMucHVzaCh3aWR0aCksXG5cdFx0XHRpc0VkaXRvckFyZWFWaXNpYmxlOiAoKSA9PiB0cnVlLFxuXHRcdFx0aXNFZGl0b3JWaXNpYmxlOiAoKSA9PiBlZGl0b3JWaXNpYmxlLFxuXHRcdFx0aXNBdXhpbGlhcnlCYXJWaXNpYmxlOiAoKSA9PiB0cnVlLFxuXHRcdFx0aGlkZUF1eGlsaWFyeUJhcjogKCkgPT4geyB9LFxuXHRcdFx0c2V0RWRpdG9yQ29udGVudFJpZ2h0SW5zZXQ6IHB4ID0+IGluc2V0cy5wdXNoKHB4KSxcblx0XHRcdGdldEhlYWRlckhlaWdodDogKCkgPT4gMCxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgRG9ja2VkQXV4aWxpYXJ5QmFyQ29udHJvbGxlcihlZGl0b3JDb250YWluZXIsIGF1eGlsaWFyeUJhclBhcnQsIGhvc3QpO1xuXG5cdFx0Y29udHJvbGxlci5sYXlvdXQoKTtcblx0XHRlZGl0b3JXaWR0aCA9IDI2MDtcblx0XHRlZGl0b3JWaXNpYmxlID0gZmFsc2U7XG5cdFx0Y29udHJvbGxlci5sYXlvdXQoKTtcblxuXHRcdGNvbnN0IHNhc2ggPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3Nhc2gnKSBhcyB7IHN0YXRlOiBTYXNoU3RhdGUgfTtcblx0XHRjb25zdCBzYXNoTGF5b3V0UHJvdmlkZXIgPSBSZWZsZWN0LmdldChzYXNoLCAnbGF5b3V0UHJvdmlkZXInKSBhcyB7IGdldFZlcnRpY2FsU2FzaExlZnQoKTogbnVtYmVyIH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbnNldHMsXG5cdFx0XHRwZXJzaXN0ZWRXaWR0aHMsXG5cdFx0XHRsYXlvdXRzLFxuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0dG9wOiBhdXhpbGlhcnlCYXJDb250YWluZXIuc3R5bGUudG9wLFxuXHRcdFx0XHRyaWdodDogYXV4aWxpYXJ5QmFyQ29udGFpbmVyLnN0eWxlLnJpZ2h0LFxuXHRcdFx0XHR3aWR0aDogYXV4aWxpYXJ5QmFyQ29udGFpbmVyLnN0eWxlLndpZHRoLFxuXHRcdFx0XHRoZWlnaHQ6IGF1eGlsaWFyeUJhckNvbnRhaW5lci5zdHlsZS5oZWlnaHQsXG5cdFx0XHR9LFxuXHRcdFx0c2FzaFN0YXRlOiBzYXNoPy5zdGF0ZSxcblx0XHRcdHNhc2hMZWZ0OiBzYXNoTGF5b3V0UHJvdmlkZXIuZ2V0VmVydGljYWxTYXNoTGVmdCgpLFxuXHRcdH0sIHtcblx0XHRcdGluc2V0czogWzI2MCwgMjYwXSxcblx0XHRcdHBlcnNpc3RlZFdpZHRoczogW10sXG5cdFx0XHRsYXlvdXRzOiBbXG5cdFx0XHRcdHsgd2lkdGg6IDI2MCwgaGVpZ2h0OiA1NjUsIHRvcDogMzUsIGxlZnQ6IDU0MCB9LFxuXHRcdFx0XHR7IHdpZHRoOiAyNjAsIGhlaWdodDogNTY1LCB0b3A6IDM1LCBsZWZ0OiAwIH0sXG5cdFx0XHRdLFxuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0dG9wOiAnMzVweCcsXG5cdFx0XHRcdHJpZ2h0OiAnMHB4Jyxcblx0XHRcdFx0d2lkdGg6ICcyNjBweCcsXG5cdFx0XHRcdGhlaWdodDogJzU2NXB4Jyxcblx0XHRcdH0sXG5cdFx0XHQvLyBUaGUgZ3JpZCBzYXNoIG93bnMgcmVzaXppbmcvY29sbGFwc2luZyBoZXJlOyB0aGUgb3ZlcmxheSBzYXNoIG11c3QgYmUgZGlzYWJsZWQuXG5cdFx0XHRzYXNoU3RhdGU6IFNhc2hTdGF0ZS5EaXNhYmxlZCxcblx0XHRcdHNhc2hMZWZ0OiAwLFxuXHRcdH0pO1xuXG5cdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgcGVyc2lzdGVkIGRvY2tlZCBkZXRhaWwgd2lkdGggd2hlbiBlZGl0b3IgY29udGVudCBpcyB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IGxheW91dHM6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IHRvcDogbnVtYmVyOyBsZWZ0OiBudW1iZXIgfVtdID0gW107XG5cdFx0Y29uc3QgaW5zZXRzOiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGVkaXRvckNvbnRhaW5lciwgJ2NsaWVudFdpZHRoJywgeyB2YWx1ZTogODAwIH0pO1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShlZGl0b3JDb250YWluZXIsICdjbGllbnRIZWlnaHQnLCB7IHZhbHVlOiA2MDAgfSk7XG5cdFx0ZWRpdG9yQ29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCA9ICgpID0+ICh7XG5cdFx0XHR3aWR0aDogODAwLFxuXHRcdFx0aGVpZ2h0OiA2MDAsXG5cdFx0XHR0b3A6IDAsXG5cdFx0XHRyaWdodDogODAwLFxuXHRcdFx0Ym90dG9tOiA2MDAsXG5cdFx0XHRsZWZ0OiAwLFxuXHRcdFx0eDogMCxcblx0XHRcdHk6IDAsXG5cdFx0XHR0b0pTT046ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclBhcnQgPSB7XG5cdFx0XHRnZXRDb250YWluZXI6ICgpID0+IGF1eGlsaWFyeUJhckNvbnRhaW5lcixcblx0XHRcdGxheW91dDogKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciwgbGVmdDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdGxheW91dHMucHVzaCh7IHdpZHRoLCBoZWlnaHQsIHRvcCwgbGVmdCB9KTtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIFBhcnQ7XG5cdFx0Y29uc3QgaG9zdDogSURvY2tlZEF1eGlsaWFyeUJhckhvc3QgPSB7XG5cdFx0XHRnZXRXaWR0aDogKCkgPT4gMjYwLFxuXHRcdFx0c2V0V2lkdGg6ICgpID0+IHsgfSxcblx0XHRcdGlzRWRpdG9yQXJlYVZpc2libGU6ICgpID0+IHRydWUsXG5cdFx0XHRpc0VkaXRvclZpc2libGU6ICgpID0+IHRydWUsXG5cdFx0XHRpc0F1eGlsaWFyeUJhclZpc2libGU6ICgpID0+IHRydWUsXG5cdFx0XHRoaWRlQXV4aWxpYXJ5QmFyOiAoKSA9PiB7IH0sXG5cdFx0XHRzZXRFZGl0b3JDb250ZW50UmlnaHRJbnNldDogcHggPT4gaW5zZXRzLnB1c2gocHgpLFxuXHRcdFx0Z2V0SGVhZGVySGVpZ2h0OiAoKSA9PiAwLFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBEb2NrZWRBdXhpbGlhcnlCYXJDb250cm9sbGVyKGVkaXRvckNvbnRhaW5lciwgYXV4aWxpYXJ5QmFyUGFydCwgaG9zdCk7XG5cblx0XHRjb250cm9sbGVyLmxheW91dCgpO1xuXG5cdFx0Y29uc3Qgc2FzaCA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfc2FzaCcpIGFzIHsgc3RhdGU6IFNhc2hTdGF0ZSB9IHwgdW5kZWZpbmVkO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aW5zZXRzLFxuXHRcdFx0bGF5b3V0cyxcblx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdHdpZHRoOiBhdXhpbGlhcnlCYXJDb250YWluZXIuc3R5bGUud2lkdGgsXG5cdFx0XHRcdGhlaWdodDogYXV4aWxpYXJ5QmFyQ29udGFpbmVyLnN0eWxlLmhlaWdodCxcblx0XHRcdH0sXG5cdFx0XHRzYXNoU3RhdGU6IHNhc2g/LnN0YXRlLFxuXHRcdH0sIHtcblx0XHRcdGluc2V0czogWzI2MF0sXG5cdFx0XHRsYXlvdXRzOiBbeyB3aWR0aDogMjYwLCBoZWlnaHQ6IDU2NSwgdG9wOiAzNSwgbGVmdDogNTQwIH1dLFxuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0d2lkdGg6ICcyNjBweCcsXG5cdFx0XHRcdGhlaWdodDogJzU2NXB4Jyxcblx0XHRcdH0sXG5cdFx0XHRzYXNoU3RhdGU6IFNhc2hTdGF0ZS5FbmFibGVkLFxuXHRcdH0pO1xuXG5cdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGVzIHRoZSBkb2NrZWQgZGV0YWlsIHBhbmVsIHdoZW4gaXRzIHNhc2ggY29sbGFwc2VzIHRvIHplcm8gd2lkdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29uc3QgYXV4aWxpYXJ5QmFyQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0bGV0IGhpZGVDb3VudCA9IDA7XG5cdFx0Y29uc3QgcGVyc2lzdGVkV2lkdGhzOiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGVkaXRvckNvbnRhaW5lciwgJ2NsaWVudFdpZHRoJywgeyB2YWx1ZTogODAwIH0pO1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShlZGl0b3JDb250YWluZXIsICdjbGllbnRIZWlnaHQnLCB7IHZhbHVlOiA2MDAgfSk7XG5cdFx0ZWRpdG9yQ29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCA9ICgpID0+ICh7XG5cdFx0XHR3aWR0aDogODAwLFxuXHRcdFx0aGVpZ2h0OiA2MDAsXG5cdFx0XHR0b3A6IDAsXG5cdFx0XHRyaWdodDogODAwLFxuXHRcdFx0Ym90dG9tOiA2MDAsXG5cdFx0XHRsZWZ0OiAwLFxuXHRcdFx0eDogMCxcblx0XHRcdHk6IDAsXG5cdFx0XHR0b0pTT046ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclBhcnQgPSB7XG5cdFx0XHRnZXRDb250YWluZXI6ICgpID0+IGF1eGlsaWFyeUJhckNvbnRhaW5lcixcblx0XHRcdGxheW91dDogKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBQYXJ0O1xuXHRcdGNvbnN0IGhvc3Q6IElEb2NrZWRBdXhpbGlhcnlCYXJIb3N0ID0ge1xuXHRcdFx0Z2V0V2lkdGg6ICgpID0+IDI2MCxcblx0XHRcdHNldFdpZHRoOiB3aWR0aCA9PiBwZXJzaXN0ZWRXaWR0aHMucHVzaCh3aWR0aCksXG5cdFx0XHRpc0VkaXRvckFyZWFWaXNpYmxlOiAoKSA9PiB0cnVlLFxuXHRcdFx0aXNFZGl0b3JWaXNpYmxlOiAoKSA9PiB0cnVlLFxuXHRcdFx0aXNBdXhpbGlhcnlCYXJWaXNpYmxlOiAoKSA9PiB0cnVlLFxuXHRcdFx0aGlkZUF1eGlsaWFyeUJhcjogKCkgPT4gaGlkZUNvdW50KyssXG5cdFx0XHRzZXRFZGl0b3JDb250ZW50UmlnaHRJbnNldDogKCkgPT4geyB9LFxuXHRcdFx0Z2V0SGVhZGVySGVpZ2h0OiAoKSA9PiAwLFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBEb2NrZWRBdXhpbGlhcnlCYXJDb250cm9sbGVyKGVkaXRvckNvbnRhaW5lciwgYXV4aWxpYXJ5QmFyUGFydCwgaG9zdCk7XG5cblx0XHRjb250cm9sbGVyLmxheW91dCgpO1xuXHRcdGNvbnN0IHNhc2ggPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3Nhc2gnKTtcblx0XHRjb25zdCBzdGFydCA9IFJlZmxlY3QuZ2V0KHNhc2gsICdfb25EaWRTdGFydCcpIGFzIHsgZmlyZShlOiB1bmtub3duKTogdm9pZCB9O1xuXHRcdGNvbnN0IGNoYW5nZSA9IFJlZmxlY3QuZ2V0KHNhc2gsICdfb25EaWRDaGFuZ2UnKSBhcyB7IGZpcmUoZTogdW5rbm93bik6IHZvaWQgfTtcblx0XHRzdGFydC5maXJlKHsgc3RhcnRYOiAwLCBjdXJyZW50WDogMCwgc3RhcnRZOiAwLCBjdXJyZW50WTogMCwgYWx0S2V5OiBmYWxzZSB9KTtcblx0XHRjaGFuZ2UuZmlyZSh7IHN0YXJ0WDogMCwgY3VycmVudFg6IDI3MCwgc3RhcnRZOiAwLCBjdXJyZW50WTogMCwgYWx0S2V5OiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoaWRlQ291bnQsIHBlcnNpc3RlZFdpZHRocyB9LCB7IGhpZGVDb3VudDogMSwgcGVyc2lzdGVkV2lkdGhzOiBbXSB9KTtcblxuXHRcdGNvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHQvLyAtLS0gTGFzdC1lZGl0b3IgY2xvc2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnZG9ja2VkIGxhc3QgZWRpdG9yIGNsb3NlIGhpZGVzIHRoZSB3aG9sZSBzaWRlIHBhbmUgdW5kZXIgc3VwcHJlc3Npb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9ySGlkZGVuQ2FsbHM6IHsgaGlkZGVuOiBib29sZWFuOyBzdXBwcmVzc2lvbjogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGF1eEhpZGRlbkNhbGxzOiB7IGhpZGRlbjogYm9vbGVhbjsgc3VwcHJlc3Npb246IG51bWJlciB9W10gPSBbXTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSwgZWRpdG9yR3JvdXBTZXJ2aWNlOiB7IG1haW5QYXJ0OiB7IGdyb3VwczogW3sgaXNFbXB0eTogdHJ1ZSB9XSB9IH0gfSk7XG5cdFx0aG9zdC5zZXRFZGl0b3JIaWRkZW4gPSBoaWRkZW4gPT4ge1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHMucHVzaCh7IGhpZGRlbiwgc3VwcHJlc3Npb246IGhvc3QuX2VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uQ291bnQgfSk7XG5cdFx0XHRob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvciA9ICFoaWRkZW47XG5cdFx0fTtcblx0XHRob3N0LnNldEF1eGlsaWFyeUJhckhpZGRlbiA9IGhpZGRlbiA9PiB7XG5cdFx0XHRhdXhIaWRkZW5DYWxscy5wdXNoKHsgaGlkZGVuLCBzdXBwcmVzc2lvbjogaG9zdC5fZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25Db3VudCB9KTtcblx0XHRcdGhvc3QucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyID0gIWhpZGRlbjtcblx0XHR9O1xuXG5cdFx0aGFuZGxlRGlkQ2xvc2VFZGl0b3IuY2FsbChob3N0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHMsXG5cdFx0XHRhdXhIaWRkZW5DYWxscyxcblx0XHRcdHZpc2liaWxpdHk6IGhvc3QucGFydFZpc2liaWxpdHksXG5cdFx0XHRzdXBwcmVzc2lvbjogaG9zdC5fZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25Db3VudCxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JIaWRkZW5DYWxsczogW3sgaGlkZGVuOiB0cnVlLCBzdXBwcmVzc2lvbjogMSB9XSxcblx0XHRcdGF1eEhpZGRlbkNhbGxzOiBbeyBoaWRkZW46IHRydWUsIHN1cHByZXNzaW9uOiAxIH1dLFxuXHRcdFx0dmlzaWJpbGl0eToge1xuXHRcdFx0XHRzaWRlYmFyOiB0cnVlLFxuXHRcdFx0XHRhdXhpbGlhcnlCYXI6IGZhbHNlLFxuXHRcdFx0XHRlZGl0b3I6IGZhbHNlLFxuXHRcdFx0XHRwYW5lbDogZmFsc2UsXG5cdFx0XHRcdHNlc3Npb25zOiB0cnVlLFxuXHRcdFx0XHRjdXN0b21WaWV3R3JpZDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0c3VwcHJlc3Npb246IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvY2tlZCBsYXN0IGVkaXRvciBjbG9zZSBoaWRlcyBsaW5nZXJpbmcgZGV0YWlsIHdoZW4gZWRpdG9yIGlzIGFscmVhZHkgaGlkZGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvckhpZGRlbkNhbGxzOiBib29sZWFuW10gPSBbXTtcblx0XHRjb25zdCBhdXhIaWRkZW5DYWxsczogeyBoaWRkZW46IGJvb2xlYW47IHN1cHByZXNzaW9uOiBudW1iZXIgfVtdID0gW107XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9LCBlZGl0b3JHcm91cFNlcnZpY2U6IHsgbWFpblBhcnQ6IHsgZ3JvdXBzOiBbeyBpc0VtcHR5OiB0cnVlIH1dIH0gfSB9KTtcblx0XHRob3N0LnNldEVkaXRvckhpZGRlbiA9IGhpZGRlbiA9PiB7XG5cdFx0XHRlZGl0b3JIaWRkZW5DYWxscy5wdXNoKGhpZGRlbik7XG5cdFx0XHRob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvciA9ICFoaWRkZW47XG5cdFx0fTtcblx0XHRob3N0LnNldEF1eGlsaWFyeUJhckhpZGRlbiA9IGhpZGRlbiA9PiB7XG5cdFx0XHRhdXhIaWRkZW5DYWxscy5wdXNoKHsgaGlkZGVuLCBzdXBwcmVzc2lvbjogaG9zdC5fZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25Db3VudCB9KTtcblx0XHRcdGhvc3QucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyID0gIWhpZGRlbjtcblx0XHR9O1xuXG5cdFx0aGFuZGxlRGlkQ2xvc2VFZGl0b3IuY2FsbChob3N0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHMsXG5cdFx0XHRhdXhIaWRkZW5DYWxscyxcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHM6IFtdLFxuXHRcdFx0YXV4SGlkZGVuQ2FsbHM6IFt7IGhpZGRlbjogdHJ1ZSwgc3VwcHJlc3Npb246IDEgfV0sXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gQXR0YWNoZWQgZWRpdG9yIG1heGltaXplZCBzdGF0ZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGludGVyZmFjZSBJV29ya2JlbmNoVGVzdEhhcm5lc3Mge1xuXHRcdHBhcnRWaXNpYmlsaXR5OiB7IHNpZGViYXI6IGJvb2xlYW47IGF1eGlsaWFyeUJhcjogYm9vbGVhbjsgZWRpdG9yOiBib29sZWFuOyBwYW5lbDogYm9vbGVhbjsgc2Vzc2lvbnM6IGJvb2xlYW4gfTtcblx0XHRsYXlvdXRQb2xpY3k6IHsgdmlld3BvcnRDbGFzczogeyBnZXQoKTogJ3Bob25lJyB8ICd0YWJsZXQnIHwgJ2Rlc2t0b3AnIH0gfTtcblx0XHRzdG9yYWdlU2VydmljZTogeyBzdG9yZSguLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIH07XG5cdFx0X2VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uQ291bnQ6IG51bWJlcjtcblx0XHRfZWRpdG9yTWF4aW1pemVkOiBib29sZWFuO1xuXHRcdF9yZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRPblNob3c6IGJvb2xlYW47XG5cdFx0c2V0RWRpdG9yTWF4aW1pemVkKG1heGltaXplZDogYm9vbGVhbik6IHZvaWQ7XG5cdFx0X3NhdmVQYXJ0VmlzaWJpbGl0eSgpOiB2b2lkO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlV29ya2JlbmNoSGFybmVzcygpOiBJV29ya2JlbmNoVGVzdEhhcm5lc3Mge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwYXJ0VmlzaWJpbGl0eTogeyBzaWRlYmFyOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUsIGVkaXRvcjogdHJ1ZSwgcGFuZWw6IGZhbHNlLCBzZXNzaW9uczogdHJ1ZSB9LFxuXHRcdFx0bGF5b3V0UG9saWN5OiB7IHZpZXdwb3J0Q2xhc3M6IHsgZ2V0OiAoKSA9PiAnZGVza3RvcCcgfSB9LFxuXHRcdFx0c3RvcmFnZVNlcnZpY2U6IHsgc3RvcmU6ICgpID0+IHsgfSB9LFxuXHRcdFx0X2VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uQ291bnQ6IDAsXG5cdFx0XHRfZWRpdG9yTWF4aW1pemVkOiBmYWxzZSxcblx0XHRcdF9yZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRPblNob3c6IGZhbHNlLFxuXHRcdFx0c2V0RWRpdG9yTWF4aW1pemVkOiAoKSA9PiB7IH0sXG5cdFx0XHRfc2F2ZVBhcnRWaXNpYmlsaXR5OiAoKSA9PiB7IH0sXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3Jlc3RvcmVzIGF0dGFjaGVkIGVkaXRvciBtYXhpbWl6ZWQgc3RhdGUgd2hlbiB0aGUgYXV4aWxpYXJ5IGJhciBzdGF5cyB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1heGltaXplZFN0YXRlczogYm9vbGVhbltdID0gW107XG5cdFx0Y29uc3Qgd29ya2JlbmNoID0gY3JlYXRlV29ya2JlbmNoSGFybmVzcygpO1xuXHRcdHdvcmtiZW5jaC5fZWRpdG9yTWF4aW1pemVkID0gdHJ1ZTtcblx0XHR3b3JrYmVuY2guc2V0RWRpdG9yTWF4aW1pemVkID0gbWF4aW1pemVkID0+IG1heGltaXplZFN0YXRlcy5wdXNoKG1heGltaXplZCk7XG5cblx0XHRyZW1lbWJlckF0dGFjaGVkRWRpdG9yTWF4aW1pemVkU3RhdGUuY2FsbCh3b3JrYmVuY2gpO1xuXG5cdFx0d29ya2JlbmNoLl9lZGl0b3JNYXhpbWl6ZWQgPSBmYWxzZTtcblx0XHRyZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZS5jYWxsKHdvcmtiZW5jaCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1heGltaXplZFN0YXRlcywgW3RydWVdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2JlbmNoLl9yZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRPblNob3csIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVzdG9yZSBhdHRhY2hlZCBlZGl0b3IgbWF4aW1pemVkIHN0YXRlIG9uY2UgdGhlIGF1eGlsaWFyeSBiYXIgaXMgaGlkZGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1heGltaXplZFN0YXRlczogYm9vbGVhbltdID0gW107XG5cdFx0Y29uc3Qgd29ya2JlbmNoID0gY3JlYXRlV29ya2JlbmNoSGFybmVzcygpO1xuXHRcdHdvcmtiZW5jaC5fZWRpdG9yTWF4aW1pemVkID0gdHJ1ZTtcblx0XHR3b3JrYmVuY2guc2V0RWRpdG9yTWF4aW1pemVkID0gbWF4aW1pemVkID0+IG1heGltaXplZFN0YXRlcy5wdXNoKG1heGltaXplZCk7XG5cblx0XHRyZW1lbWJlckF0dGFjaGVkRWRpdG9yTWF4aW1pemVkU3RhdGUuY2FsbCh3b3JrYmVuY2gpO1xuXG5cdFx0d29ya2JlbmNoLl9lZGl0b3JNYXhpbWl6ZWQgPSBmYWxzZTtcblx0XHR3b3JrYmVuY2gucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyID0gZmFsc2U7XG5cdFx0cmVzdG9yZUF0dGFjaGVkRWRpdG9yTWF4aW1pemVkU3RhdGUuY2FsbCh3b3JrYmVuY2gpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXhpbWl6ZWRTdGF0ZXMsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2JlbmNoLl9yZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRPblNob3csIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVzdG9yZSBhZnRlciB0aGUgYXV4aWxpYXJ5IGJhciBpcyBoaWRkZW4gYW5kIHNob3duIGFnYWluIGJlZm9yZSByZW9wZW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWF4aW1pemVkU3RhdGVzOiBib29sZWFuW10gPSBbXTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblx0XHRob3N0Ll9lZGl0b3JNYXhpbWl6ZWQgPSB0cnVlO1xuXHRcdChob3N0IGFzIHVua25vd24gYXMgSVdvcmtiZW5jaFRlc3RIYXJuZXNzKS5zZXRFZGl0b3JNYXhpbWl6ZWQgPSBtYXhpbWl6ZWQgPT4gbWF4aW1pemVkU3RhdGVzLnB1c2gobWF4aW1pemVkKTtcblxuXHRcdHJlbWVtYmVyQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZS5jYWxsKGhvc3QgYXMgdW5rbm93biBhcyBJV29ya2JlbmNoVGVzdEhhcm5lc3MpO1xuXHRcdHNldEF1eGlsaWFyeUJhckhpZGRlbi5jYWxsKGhvc3QsIHRydWUpO1xuXHRcdHNldEF1eGlsaWFyeUJhckhpZGRlbi5jYWxsKGhvc3QsIGZhbHNlKTtcblxuXHRcdGhvc3QuX2VkaXRvck1heGltaXplZCA9IGZhbHNlO1xuXHRcdHJlc3RvcmVBdHRhY2hlZEVkaXRvck1heGltaXplZFN0YXRlLmNhbGwoaG9zdCBhcyB1bmtub3duIGFzIElXb3JrYmVuY2hUZXN0SGFybmVzcyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1heGltaXplZFN0YXRlcywgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3N0Ll9yZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRPblNob3csIGZhbHNlKTtcblx0fSk7XG5cblx0Ly8gLS0tIERvY2tlZCBhdXhpbGlhcnkgYmFyIHZpc2liaWxpdHkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCdkb2NrZWQgYXV4aWxpYXJ5IGJhciBoaWRlIHJldmVhbHMgaGlkZGVuIGVkaXRvciBjb250ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvckhpZGRlbkNhbGxzOiBib29sZWFuW10gPSBbXTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSk7XG5cdFx0aG9zdC5zZXRFZGl0b3JIaWRkZW4gPSBoaWRkZW4gPT4ge1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHMucHVzaChoaWRkZW4pO1xuXHRcdFx0aG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IgPSAhaGlkZGVuO1xuXHRcdH07XG5cblx0XHRzZXRBdXhpbGlhcnlCYXJIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHMsXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyLFxuXHRcdFx0Z3JpZFZpc2libGU6IGhvc3QudmlzaWJpbGl0eUNoYW5nZXMsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHM6IFtmYWxzZV0sXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiB0cnVlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRncmlkVmlzaWJsZTogW3RydWVdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2NrZWQgYXV4aWxpYXJ5IGJhciBoaWRlIGRvZXMgbm90IHJldmVhbCBlZGl0b3Igd2hpbGUgc2lkZSBwYW5lIHRvZ2dsZSBpcyBzdXBwcmVzc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvckhpZGRlbkNhbGxzOiBib29sZWFuW10gPSBbXTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc3VwcHJlc3Npb25Db3VudDogMSwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSk7XG5cdFx0aG9zdC5zZXRFZGl0b3JIaWRkZW4gPSBoaWRkZW4gPT4ge1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHMucHVzaChoaWRkZW4pO1xuXHRcdFx0aG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IgPSAhaGlkZGVuO1xuXHRcdH07XG5cblx0XHRzZXRBdXhpbGlhcnlCYXJIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHMsXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyLFxuXHRcdFx0Z3JpZFZpc2libGU6IGhvc3QudmlzaWJpbGl0eUNoYW5nZXMsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHM6IFtdLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGdyaWRWaXNpYmxlOiBbZmFsc2VdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2NrZWQgYXV4aWxpYXJ5IGJhciBzaG93IGRvZXMgbm90IGZvcmNlLW9wZW4gYW4gZW1wdHkgKGdhdGVkLW9mZikgY29udGFpbmVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9wZW5lZENvbnRhaW5lcnM6IHN0cmluZ1tdID0gW107XG5cdFx0Ly8gVGhlIHJlc29sdmVkIGRlZmF1bHQgY29udGFpbmVyIGlzIGBoaWRlSWZFbXB0eWAgd2l0aCBubyBhY3RpdmUgdmlld3Ncblx0XHQvLyAoZS5nLiBDaGFuZ2VzL0ZpbGVzIGdhdGVkIG9mZiBmb3IgYSB3b3Jrc3BhY2UtbGVzcyBxdWljayBjaGF0KS5cblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7XG5cdFx0XHRzaW5nbGU6IHRydWUsXG5cdFx0XHRwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogZmFsc2UgfSxcblx0XHRcdHZpZXdEZXNjcmlwdG9yU2VydmljZToge1xuXHRcdFx0XHRnZXREZWZhdWx0Vmlld0NvbnRhaW5lcjogKCkgPT4gKHsgaWQ6ICdlbXB0eS5jb250YWluZXInIH0pLFxuXHRcdFx0XHRnZXRWaWV3Q29udGFpbmVyQnlJZDogKCkgPT4gKHsgaGlkZUlmRW1wdHk6IHRydWUgfSksXG5cdFx0XHRcdGdldFZpZXdDb250YWluZXJNb2RlbDogKCkgPT4gKHsgYWN0aXZlVmlld0Rlc2NyaXB0b3JzOiBbXSB9KSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0KGhvc3QgYXMgdW5rbm93biBhcyB7IHBhbmVDb21wb3NpdGVTZXJ2aWNlOiB7IG9wZW5QYW5lQ29tcG9zaXRlKGlkOiBzdHJpbmcpOiB2b2lkIH0gfSkucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUgPSAoaWQ6IHN0cmluZykgPT4geyBvcGVuZWRDb250YWluZXJzLnB1c2goaWQpOyB9O1xuXG5cdFx0c2V0QXV4aWxpYXJ5QmFySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcGVuZWRDb250YWluZXJzLCBbXSwgJ211c3Qgbm90IGZvcmNlLW9wZW4gYW4gZW1wdHkgY29udGFpbmVyIGluIGRvY2tlZCBtb2RlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvY2tlZCBhdXhpbGlhcnkgYmFyIHNob3cgb3BlbnMgYSBjb250YWluZXIgdGhhdCBoYXMgYWN0aXZlIHZpZXdzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9wZW5lZENvbnRhaW5lcnM6IHN0cmluZ1tdID0gW107XG5cdFx0Ly8gVGhlIHJlc29sdmVkIGRlZmF1bHQgY29udGFpbmVyIGhhcyBhbiBhY3RpdmUgdmlldyBkZXNjcmlwdG9yLCBzbyBpdCBoYXNcblx0XHQvLyBjb250ZW50IHRvIHJlbmRlciBhbmQgbXVzdCBiZSBvcGVuZWQgbm9ybWFsbHkuXG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3Qoe1xuXHRcdFx0c2luZ2xlOiB0cnVlLFxuXHRcdFx0cGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IGZhbHNlIH0sXG5cdFx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2U6IHtcblx0XHRcdFx0Z2V0RGVmYXVsdFZpZXdDb250YWluZXI6ICgpID0+ICh7IGlkOiAnYWN0aXZlLmNvbnRhaW5lcicgfSksXG5cdFx0XHRcdGdldFZpZXdDb250YWluZXJCeUlkOiAoKSA9PiAoeyBoaWRlSWZFbXB0eTogdHJ1ZSB9KSxcblx0XHRcdFx0Z2V0Vmlld0NvbnRhaW5lck1vZGVsOiAoKSA9PiAoeyBhY3RpdmVWaWV3RGVzY3JpcHRvcnM6IFt7fV0gfSksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdChob3N0IGFzIHVua25vd24gYXMgeyBwYW5lQ29tcG9zaXRlU2VydmljZTogeyBvcGVuUGFuZUNvbXBvc2l0ZShpZDogc3RyaW5nKTogdm9pZCB9IH0pLnBhbmVDb21wb3NpdGVTZXJ2aWNlLm9wZW5QYW5lQ29tcG9zaXRlID0gKGlkOiBzdHJpbmcpID0+IHsgb3BlbmVkQ29udGFpbmVycy5wdXNoKGlkKTsgfTtcblxuXHRcdHNldEF1eGlsaWFyeUJhckhpZGRlbi5jYWxsKGhvc3QsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3BlbmVkQ29udGFpbmVycywgWydhY3RpdmUuY29udGFpbmVyJ10sICdtdXN0IG9wZW4gYSBjb250YWluZXIgdGhhdCBoYXMgYWN0aXZlIHZpZXdzJyk7XG5cdH0pO1xuXG5cdC8vIC0tLSBFZGl0b3IgbWF4aW1pemUvdW4tbWF4aW1pemUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0aW50ZXJmYWNlIElNYXhpbWl6ZVRlc3RIYXJuZXNzIHtcblx0XHRwYXJ0VmlzaWJpbGl0eTogeyBzaWRlYmFyOiBib29sZWFuOyBhdXhpbGlhcnlCYXI6IGJvb2xlYW47IGVkaXRvcjogYm9vbGVhbjsgcGFuZWw6IGJvb2xlYW47IHNlc3Npb25zOiBib29sZWFuIH07XG5cdFx0cmVhZG9ubHkgZWRpdG9yUGFydFZpZXc6IG9iamVjdDtcblx0XHRyZWFkb25seSB3b3JrYmVuY2hHcmlkOiB7XG5cdFx0XHRnZXRWaWV3U2l6ZSh2aWV3OiBvYmplY3QpOiBJVmlld1NpemU7XG5cdFx0XHRyZXNpemVWaWV3KHZpZXc6IG9iamVjdCwgc2l6ZTogSVZpZXdTaXplKTogdm9pZDtcblx0XHR9O1xuXHRcdF9lZGl0b3JNYXhpbWl6ZWQ6IGJvb2xlYW47XG5cdFx0X2VkaXRvckxhc3ROb25NYXhpbWl6ZWRWaXNpYmlsaXR5Pzogb2JqZWN0O1xuXHRcdF9lZGl0b3JMYXN0Tm9uTWF4aW1pemVkU2l6ZT86IElWaWV3U2l6ZTtcblx0XHRyZWFkb25seSBfb25EaWRDaGFuZ2VFZGl0b3JNYXhpbWl6ZWQ6IHsgZmlyZSgpOiB2b2lkIH07XG5cdFx0X2xheW91dFNpZGVQYW5lKCk6IHZvaWQ7XG5cdFx0c2V0RWRpdG9ySGlkZGVuKGhpZGRlbjogYm9vbGVhbik6IHZvaWQ7XG5cdFx0c2V0U2lkZUJhckhpZGRlbihoaWRkZW46IGJvb2xlYW4pOiB2b2lkO1xuXHRcdHNldFNlc3Npb25zSGlkZGVuKGhpZGRlbjogYm9vbGVhbik6IHZvaWQ7XG5cdFx0c2V0QXV4aWxpYXJ5QmFySGlkZGVuKGhpZGRlbjogYm9vbGVhbik6IHZvaWQ7XG5cdH1cblxuXHR0ZXN0KCdyZXN0b3JlcyBlZGl0b3Igc2l6ZSBhbmQgYXV4aWxpYXJ5IGJhciB2aXNpYmlsaXR5IHdoZW4gdW4tbWF4aW1pemluZycsICgpID0+IHtcblx0XHRjb25zdCBlZGl0b3JQYXJ0VmlldyA9IHt9O1xuXHRcdGNvbnN0IHJlc2l6ZXM6IElWaWV3U2l6ZVtdID0gW107XG5cdFx0Y29uc3QgYXV4aWxpYXJ5QmFySGlkZGVuQ2FsbHM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGxldCBlZGl0b3JTaXplID0geyB3aWR0aDogNzAwLCBoZWlnaHQ6IDgwMCB9O1xuXHRcdGNvbnN0IGhhcm5lc3M6IElNYXhpbWl6ZVRlc3RIYXJuZXNzID0ge1xuXHRcdFx0cGFydFZpc2liaWxpdHk6IHsgc2lkZWJhcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSwgZWRpdG9yOiB0cnVlLCBwYW5lbDogZmFsc2UsIHNlc3Npb25zOiB0cnVlIH0sXG5cdFx0XHRlZGl0b3JQYXJ0Vmlldyxcblx0XHRcdHdvcmtiZW5jaEdyaWQ6IHtcblx0XHRcdFx0Z2V0Vmlld1NpemU6ICgpID0+IGVkaXRvclNpemUsXG5cdFx0XHRcdHJlc2l6ZVZpZXc6IChfdmlldywgc2l6ZSkgPT4geyByZXNpemVzLnB1c2goc2l6ZSk7IGVkaXRvclNpemUgPSBzaXplOyB9LFxuXHRcdFx0fSxcblx0XHRcdF9lZGl0b3JNYXhpbWl6ZWQ6IGZhbHNlLFxuXHRcdFx0X29uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkOiB7IGZpcmU6ICgpID0+IHsgfSB9LFxuXHRcdFx0X2xheW91dFNpZGVQYW5lOiAoKSA9PiB7IH0sXG5cdFx0XHRzZXRFZGl0b3JIaWRkZW46ICgpID0+IHsgfSxcblx0XHRcdHNldFNpZGVCYXJIaWRkZW46IGhpZGRlbiA9PiB7IGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2lkZWJhciA9ICFoaWRkZW47IH0sXG5cdFx0XHRzZXRTZXNzaW9uc0hpZGRlbjogaGlkZGVuID0+IHsgaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXNzaW9ucyA9ICFoaWRkZW47IH0sXG5cdFx0XHRzZXRBdXhpbGlhcnlCYXJIaWRkZW46IGhpZGRlbiA9PiB7IGF1eGlsaWFyeUJhckhpZGRlbkNhbGxzLnB1c2goaGlkZGVuKTsgaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIgPSAhaGlkZGVuOyB9LFxuXHRcdH07XG5cblx0XHRzZXRFZGl0b3JNYXhpbWl6ZWQuY2FsbChoYXJuZXNzLCB0cnVlKTtcblxuXHRcdC8vIFdoaWxlIG1heGltaXplZCB0aGUgbGF5b3V0IGNvbnRyb2xsZXIgZm9yY2VzIHRoZSBDaGFuZ2VzIHZpZXcgKGF1eGlsaWFyeVxuXHRcdC8vIGJhcikgdmlzaWJsZSwgd2hpY2ggc2hyaW5rcyB0aGUgZWRpdG9yLlxuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyID0gdHJ1ZTtcblx0XHRlZGl0b3JTaXplID0geyB3aWR0aDogNTAwLCBoZWlnaHQ6IDgwMCB9O1xuXG5cdFx0c2V0RWRpdG9yTWF4aW1pemVkLmNhbGwoaGFybmVzcywgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhdXhpbGlhcnlCYXJIaWRkZW5DYWxscyxcblx0XHRcdHJlc2l6ZXMsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhcixcblx0XHRcdHNpZGViYXJWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIsXG5cdFx0XHRzZXNzaW9uc1Zpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2Vzc2lvbnMsXG5cdFx0fSwge1xuXHRcdFx0YXV4aWxpYXJ5QmFySGlkZGVuQ2FsbHM6IFt0cnVlXSxcblx0XHRcdHJlc2l6ZXM6IFt7IHdpZHRoOiA3MDAsIGhlaWdodDogODAwIH1dLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRzaWRlYmFyVmlzaWJsZTogdHJ1ZSxcblx0XHRcdHNlc3Npb25zVmlzaWJsZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIEN1c3RvbSB2aWV3IGdyaWQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnc2hvd2luZyBhIGN1c3RvbSB2aWV3IGhpZGVzIHRoZSBzZXNzaW9ucyBncmlkLCBlZGl0b3IsIHNpZGUgcGFuZWwgYW5kIHBhbmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUsIHBhbmVsOiB0cnVlLCBzZXNzaW9uczogdHJ1ZSB9IH0pO1xuXHRcdGNvbnN0IGRlc2NyaXB0b3IgPSB7fTtcblxuXHRcdGFwcGx5Q3VzdG9tVmlld0dyaWRWaXNpYmlsaXR5LmNhbGwoaG9zdCwgZGVzY3JpcHRvcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlbmRlcmVkQ3VzdG9tVmlld3M6IGhvc3QucmVuZGVyZWRDdXN0b21WaWV3cyxcblx0XHRcdGN1c3RvbVZpZXdHcmlkVmlzaWJsZTogaXNWaXNpYmxlLmNhbGwoaG9zdCwgUGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJUKSxcblx0XHRcdHNlc3Npb25zOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5TRVNTSU9OU19QQVJUKSxcblx0XHRcdGVkaXRvcjogaXNWaXNpYmxlLmNhbGwoaG9zdCwgUGFydHMuRURJVE9SX1BBUlQpLFxuXHRcdFx0YXV4aWxpYXJ5QmFyOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0XHRwYW5lbDogaXNWaXNpYmxlLmNhbGwoaG9zdCwgUGFydHMuUEFORUxfUEFSVCksXG5cdFx0XHRzaWRlQmFyOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5TSURFQkFSX1BBUlQpLFxuXHRcdFx0Z3JpZE5vZGVzOiB7XG5cdFx0XHRcdGN1c3RvbVZpZXdHcmlkOiBob3N0LmdyaWRWaXNpYmlsaXR5LmdldChob3N0LmN1c3RvbVZpZXdHcmlkUGFydFZpZXcpLFxuXHRcdFx0XHRzZXNzaW9uczogaG9zdC5ncmlkVmlzaWJpbGl0eS5nZXQoaG9zdC5zZXNzaW9uc1BhcnRWaWV3KSxcblx0XHRcdFx0ZWRpdG9yOiBob3N0LmdyaWRWaXNpYmlsaXR5LmdldChob3N0LmVkaXRvclBhcnRWaWV3KSxcblx0XHRcdFx0cGFuZWw6IGhvc3QuZ3JpZFZpc2liaWxpdHkuZ2V0KGhvc3QucGFuZWxQYXJ0VmlldyksXG5cdFx0XHR9LFxuXHRcdFx0ZXZlbnRzOiBob3N0LmV2ZW50cyxcblx0XHRcdGZvY3VzZWRQYXJ0czogaG9zdC5mb2N1c2VkUGFydHMsXG5cdFx0fSwge1xuXHRcdFx0cmVuZGVyZWRDdXN0b21WaWV3czogW2Rlc2NyaXB0b3JdLFxuXHRcdFx0Y3VzdG9tVmlld0dyaWRWaXNpYmxlOiB0cnVlLFxuXHRcdFx0c2Vzc2lvbnM6IGZhbHNlLFxuXHRcdFx0ZWRpdG9yOiBmYWxzZSxcblx0XHRcdGF1eGlsaWFyeUJhcjogZmFsc2UsXG5cdFx0XHRwYW5lbDogZmFsc2UsXG5cdFx0XHRzaWRlQmFyOiB0cnVlLFxuXHRcdFx0Z3JpZE5vZGVzOiB7XG5cdFx0XHRcdGN1c3RvbVZpZXdHcmlkOiB0cnVlLFxuXHRcdFx0XHRzZXNzaW9uczogZmFsc2UsXG5cdFx0XHRcdGVkaXRvcjogZmFsc2UsXG5cdFx0XHRcdHBhbmVsOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHRldmVudHM6IFtcblx0XHRcdFx0eyBwYXJ0SWQ6IFBhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHBhcnRJZDogUGFydHMuU0VTU0lPTlNfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSxcblx0XHRcdFx0eyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9LFxuXHRcdFx0XHR7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0sXG5cdFx0XHRcdHsgcGFydElkOiBQYXJ0cy5QQU5FTF9QQVJULCB2aXNpYmxlOiBmYWxzZSB9LFxuXHRcdFx0XSxcblx0XHRcdGZvY3VzZWRQYXJ0czogW1BhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGluZyB0aGUgY3VzdG9tIHZpZXcgcmVzdG9yZXMgdGhlIGRlc2lyZWQgcGFydCB2aXNpYmlsaXR5LCBpbmNsdWRpbmcgY2hhbmdlcyBtYWRlIHdoaWxlIGl0IHdhcyBzaG93bicsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiB0cnVlLCBwYW5lbDogZmFsc2UsIHNlc3Npb25zOiB0cnVlIH0gfSk7XG5cblx0XHRhcHBseUN1c3RvbVZpZXdHcmlkVmlzaWJpbGl0eS5jYWxsKGhvc3QsIHt9KTtcblxuXHRcdC8vIFRoZSBsYXlvdXQgY29udHJvbGxlciByZWFjdHMgdG8gYSBzZXNzaW9uIHN3aXRjaCB3aGlsZSB0aGUgY3VzdG9tIHZpZXcgaXNcblx0XHQvLyB1cDogdGhlIGRlc2lyZWQgc3RhdGUgY2hhbmdlcyBidXQgbm90aGluZyBpcyByZW5kZXJlZC5cblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblx0XHRjb25zdCB3aGlsZVNob3duID0ge1xuXHRcdFx0ZWRpdG9yOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRlZGl0b3JOb2RlOiBob3N0LmdyaWRWaXNpYmlsaXR5LmdldChob3N0LmVkaXRvclBhcnRWaWV3KSxcblx0XHR9O1xuXG5cdFx0YXBwbHlDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkuY2FsbChob3N0LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3aGlsZVNob3duLFxuXHRcdFx0Y3VzdG9tVmlld0dyaWRWaXNpYmxlOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlQpLFxuXHRcdFx0cmVuZGVyZWRDdXN0b21WaWV3Q291bnQ6IGhvc3QucmVuZGVyZWRDdXN0b21WaWV3cy5sZW5ndGgsXG5cdFx0XHRsYXN0UmVuZGVyZWRDdXN0b21WaWV3OiBob3N0LnJlbmRlcmVkQ3VzdG9tVmlld3NbaG9zdC5yZW5kZXJlZEN1c3RvbVZpZXdzLmxlbmd0aCAtIDFdLFxuXHRcdFx0c2Vzc2lvbnM6IGlzVmlzaWJsZS5jYWxsKGhvc3QsIFBhcnRzLlNFU1NJT05TX1BBUlQpLFxuXHRcdFx0ZWRpdG9yOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRhdXhpbGlhcnlCYXI6IGlzVmlzaWJsZS5jYWxsKGhvc3QsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHRcdHBhbmVsOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5QQU5FTF9QQVJUKSxcblx0XHRcdGZvY3VzZWRTZXNzaW9uczogaG9zdC5mb2N1c2VkU2Vzc2lvbnMsXG5cdFx0fSwge1xuXHRcdFx0d2hpbGVTaG93bjogeyBlZGl0b3I6IGZhbHNlLCBlZGl0b3JOb2RlOiBmYWxzZSB9LFxuXHRcdFx0Y3VzdG9tVmlld0dyaWRWaXNpYmxlOiBmYWxzZSxcblx0XHRcdHJlbmRlcmVkQ3VzdG9tVmlld0NvdW50OiAyLFxuXHRcdFx0bGFzdFJlbmRlcmVkQ3VzdG9tVmlldzogdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvbnM6IHRydWUsXG5cdFx0XHRlZGl0b3I6IGZhbHNlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyOiB0cnVlLFxuXHRcdFx0cGFuZWw6IGZhbHNlLFxuXHRcdFx0Zm9jdXNlZFNlc3Npb25zOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzd2FwcGluZyB0byBhbm90aGVyIGN1c3RvbSB2aWV3IHJlLXJlbmRlcnMgaXQgd2l0aG91dCB0b3VjaGluZyB0aGUgbGF5b3V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUsIHNlc3Npb25zOiB0cnVlIH0gfSk7XG5cdFx0Y29uc3QgZmlyc3QgPSB7fTtcblx0XHRjb25zdCBzZWNvbmQgPSB7fTtcblxuXHRcdGFwcGx5Q3VzdG9tVmlld0dyaWRWaXNpYmlsaXR5LmNhbGwoaG9zdCwgZmlyc3QpO1xuXHRcdGNvbnN0IGV2ZW50c0FmdGVyU2hvdyA9IGhvc3QuZXZlbnRzLmxlbmd0aDtcblx0XHRhcHBseUN1c3RvbVZpZXdHcmlkVmlzaWJpbGl0eS5jYWxsKGhvc3QsIHNlY29uZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlbmRlcmVkQ3VzdG9tVmlld3M6IGhvc3QucmVuZGVyZWRDdXN0b21WaWV3cyxcblx0XHRcdGN1c3RvbVZpZXdHcmlkVmlzaWJsZTogaXNWaXNpYmxlLmNhbGwoaG9zdCwgUGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJUKSxcblx0XHRcdHNlc3Npb25zOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5TRVNTSU9OU19QQVJUKSxcblx0XHRcdGV2ZW50c0FmdGVyU3dhcDogaG9zdC5ldmVudHMubGVuZ3RoIC0gZXZlbnRzQWZ0ZXJTaG93LFxuXHRcdH0sIHtcblx0XHRcdHJlbmRlcmVkQ3VzdG9tVmlld3M6IFtmaXJzdCwgc2Vjb25kXSxcblx0XHRcdGN1c3RvbVZpZXdHcmlkVmlzaWJsZTogdHJ1ZSxcblx0XHRcdHNlc3Npb25zOiBmYWxzZSxcblx0XHRcdGV2ZW50c0FmdGVyU3dhcDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHJhY2tzIHRoZSBjdXN0b20gdmlldyBpbiB0aGUgcGhvbmUgbmF2aWdhdGlvbiBzdGFjayBhbmQgZHJvcHMgaXQgd2hlbiBsZWF2aW5nIHBob25lIGxheW91dCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCgpO1xuXHRcdGhvc3QubGF5b3V0UG9saWN5LnZpZXdwb3J0Q2xhc3MuZ2V0ID0gKCkgPT4gJ3Bob25lJztcblxuXHRcdGFwcGx5Q3VzdG9tVmlld0dyaWRWaXNpYmlsaXR5LmNhbGwoaG9zdCwge30pO1xuXHRcdGNvbnN0IG9uUGhvbmUgPSBbLi4uaG9zdC5tb2JpbGVOYXZMYXllcnNdO1xuXG5cdFx0Ly8gUm90YXRpbmcgYmFjayB0byBhIGRlc2t0b3AtY2xhc3Mgdmlld3BvcnQgbXVzdCBub3QgbGVhdmUgYSBzdGFsZSBlbnRyeSBiZWhpbmQuXG5cdFx0aG9zdC5sYXlvdXRQb2xpY3kudmlld3BvcnRDbGFzcy5nZXQgPSAoKSA9PiAnZGVza3RvcCc7XG5cdFx0dXBkYXRlTW9iaWxlQ3VzdG9tVmlld05hdmlnYXRpb24uY2FsbChob3N0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBvblBob25lLCBhZnRlckxlYXZpbmdQaG9uZTogaG9zdC5tb2JpbGVOYXZMYXllcnMgfSwge1xuXHRcdFx0b25QaG9uZTogWydjdXN0b21WaWV3J10sXG5cdFx0XHRhZnRlckxlYXZpbmdQaG9uZTogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZSBzZWNvbmRhcnkgc2lkZSBiYXIgdG9nZ2xlIGlzIGluZXJ0IHdoaWxlIGEgY3VzdG9tIHZpZXcgaXMgc2hvd24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBwYXJ0VmlzaWJpbGl0eTogeyBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdGFwcGx5Q3VzdG9tVmlld0dyaWRWaXNpYmlsaXR5LmNhbGwoaG9zdCwge30pO1xuXHRcdHRvZ2dsZVNlY29uZGFyeVNpZGVCYXIuY2FsbChob3N0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3N0LnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3dpbmcgYSBjdXN0b20gdmlldyB1bi1tYXhpbWl6ZXMgdGhlIGVkaXRvciBzbyB0aGUgc2Vzc2lvbnMgZ3JpZCBvd25zIHRoZSByb3cgYWdhaW4gb24gaGlkZScsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IGVkaXRvck1heGltaXplOiB0cnVlLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSwgc2Vzc2lvbnM6IHRydWUgfSB9KTtcblx0XHRzZXRFZGl0b3JNYXhpbWl6ZWQuY2FsbChob3N0IGFzIHVua25vd24gYXMgSU1heGltaXplVGVzdEhhcm5lc3MsIHRydWUpO1xuXG5cdFx0YXBwbHlDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkuY2FsbChob3N0LCB7fSk7XG5cdFx0Y29uc3Qgd2hpbGVTaG93biA9IHtcblx0XHRcdGVkaXRvck1heGltaXplZDogaG9zdC5fZWRpdG9yTWF4aW1pemVkLFxuXHRcdFx0c2Vzc2lvbnM6IGlzVmlzaWJsZS5jYWxsKGhvc3QsIFBhcnRzLlNFU1NJT05TX1BBUlQpLFxuXHRcdFx0Y3VzdG9tVmlld0dyaWQ6IGlzVmlzaWJsZS5jYWxsKGhvc3QsIFBhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVCksXG5cdFx0fTtcblxuXHRcdGFwcGx5Q3VzdG9tVmlld0dyaWRWaXNpYmlsaXR5LmNhbGwoaG9zdCwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d2hpbGVTaG93bixcblx0XHRcdHNlc3Npb25zOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5TRVNTSU9OU19QQVJUKSxcblx0XHRcdGN1c3RvbVZpZXdHcmlkOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlQpLFxuXHRcdH0sIHtcblx0XHRcdHdoaWxlU2hvd246IHsgZWRpdG9yTWF4aW1pemVkOiBmYWxzZSwgc2Vzc2lvbnM6IGZhbHNlLCBjdXN0b21WaWV3R3JpZDogdHJ1ZSB9LFxuXHRcdFx0c2Vzc2lvbnM6IHRydWUsXG5cdFx0XHRjdXN0b21WaWV3R3JpZDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBQZXJzaXN0ZW5jZSBnYXRpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ2RvZXMgbm90IHJlc3RvcmUgc2F2ZWQgZGVza3RvcCBwYXJ0IHZpc2liaWxpdHkgb24gcGhvbmUgbGF5b3V0JywgKCkgPT4ge1xuXHRcdGxldCBnZXRDYWxsZWQgPSBmYWxzZTtcblx0XHRjb25zdCB3b3JrYmVuY2ggPSBjcmVhdGVXb3JrYmVuY2hIYXJuZXNzKCk7XG5cdFx0d29ya2JlbmNoLmxheW91dFBvbGljeS52aWV3cG9ydENsYXNzLmdldCA9ICgpID0+ICdwaG9uZSc7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSB7XG5cdFx0XHRnZXQ6ICgpID0+IHtcblx0XHRcdFx0Z2V0Q2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUsIHNpZGViYXI6IHRydWUgfSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVtb3ZlOiAoKSA9PiB7IH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3RvcmVkID0gbG9hZFBhcnRWaXNpYmlsaXR5LmNhbGwod29ya2JlbmNoLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3RvcmVkLCB7fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENhbGxlZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBzYXZlZCBkZXNrdG9wIHBhcnQgdmlzaWJpbGl0eSBvdXRzaWRlIHBob25lIGxheW91dCcsICgpID0+IHtcblx0XHRjb25zdCB3b3JrYmVuY2ggPSBjcmVhdGVXb3JrYmVuY2hIYXJuZXNzKCk7XG5cdFx0d29ya2JlbmNoLmxheW91dFBvbGljeS52aWV3cG9ydENsYXNzLmdldCA9ICgpID0+ICdkZXNrdG9wJztcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHtcblx0XHRcdGdldDogKCkgPT4gSlNPTi5zdHJpbmdpZnkoeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogZmFsc2UsIHNpZGViYXI6IGZhbHNlIH0pLFxuXHRcdFx0cmVtb3ZlOiAoKSA9PiB7IH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3RvcmVkID0gbG9hZFBhcnRWaXNpYmlsaXR5LmNhbGwod29ya2JlbmNoLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3RvcmVkLCB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSwgc2lkZWJhcjogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHBlcnNpc3QgcGFydCB2aXNpYmlsaXR5IG9uIHBob25lIGxheW91dCcsICgpID0+IHtcblx0XHRsZXQgc3RvcmVDYWxsZWQgPSBmYWxzZTtcblx0XHRjb25zdCB3b3JrYmVuY2ggPSBjcmVhdGVXb3JrYmVuY2hIYXJuZXNzKCk7XG5cdFx0d29ya2JlbmNoLmxheW91dFBvbGljeS52aWV3cG9ydENsYXNzLmdldCA9ICgpID0+ICdwaG9uZSc7XG5cdFx0d29ya2JlbmNoLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlID0gKCkgPT4ge1xuXHRcdFx0c3RvcmVDYWxsZWQgPSB0cnVlO1xuXHRcdH07XG5cblx0XHRzYXZlUGFydFZpc2liaWxpdHkuY2FsbCh3b3JrYmVuY2gpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlQ2FsbGVkLCBmYWxzZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBcUMsYUFBYTtBQUNsRCxTQUFTLG9DQUE2RDtBQUN0RSxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHlCQUF5QiwyQkFBMkI7QUFDN0QsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxtQ0FBbUM7QUFLNUMsTUFBTSw4QkFBOEIsa0JBQWtCO0FBQUEsRUFDckQsSUFBYSxTQUFpQjtBQUFFLFdBQU87QUFBQSxFQUFxQjtBQUFBLEVBQzVELElBQWEsV0FBc0I7QUFBRSxXQUFPO0FBQUEsRUFBVztBQUN4RDtBQUVBLE1BQU0sd0JBQXdCLE1BQU07QUFDbkMsMENBQXdDO0FBS3hDLFFB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
