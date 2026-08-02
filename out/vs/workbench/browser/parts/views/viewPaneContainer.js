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
import { $, addDisposableListener, DragAndDropObserver, EventType, getWindow, isAncestor } from "../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { EventType as TouchEventType, Gesture } from "../../../../base/browser/touch.js";
import { Orientation } from "../../../../base/browser/ui/sash/sash.js";
import { PaneView } from "../../../../base/browser/ui/splitview/paneview.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { combinedDisposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import "./media/paneviewlet.css";
import * as nls from "../../../../nls.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { activeContrastBorder, asCssVariable } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { CompositeDragAndDropObserver, toggleDropEffect } from "../../dnd.js";
import { Component } from "../../../common/component.js";
import { PANEL_SECTION_BORDER, PANEL_SECTION_DRAG_AND_DROP_BACKGROUND, PANEL_SECTION_HEADER_BACKGROUND, PANEL_SECTION_HEADER_BORDER, PANEL_SECTION_HEADER_FOREGROUND, SIDE_BAR_DRAG_AND_DROP_BACKGROUND, SIDE_BAR_SECTION_HEADER_BACKGROUND, SIDE_BAR_SECTION_HEADER_BORDER, SIDE_BAR_SECTION_HEADER_FOREGROUND } from "../../../common/theme.js";
import { IViewDescriptorService, ViewContainerLocation, ViewVisibilityState } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { FocusedViewContext } from "../../../common/contextkeys.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { isHorizontal, IWorkbenchLayoutService, LayoutSettings, FLOATING_PANEL_MARGIN, Position } from "../../../services/layout/browser/layoutService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ViewContainerMenuActions } from "./viewMenuActions.js";
const ViewsSubMenu = new MenuId("Views");
MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
  submenu: ViewsSubMenu,
  title: nls.localize("views", "Views"),
  order: 1
});
var DropDirection = /* @__PURE__ */ ((DropDirection2) => {
  DropDirection2[DropDirection2["UP"] = 0] = "UP";
  DropDirection2[DropDirection2["DOWN"] = 1] = "DOWN";
  DropDirection2[DropDirection2["LEFT"] = 2] = "LEFT";
  DropDirection2[DropDirection2["RIGHT"] = 3] = "RIGHT";
  return DropDirection2;
})(DropDirection || {});
const _ViewPaneDropOverlay = class _ViewPaneDropOverlay extends Themable {
  constructor(paneElement, orientation, bounds, location, themeService) {
    super(themeService);
    this.paneElement = paneElement;
    this.orientation = orientation;
    this.bounds = bounds;
    this.location = location;
    this.cleanupOverlayScheduler = this._register(new RunOnceScheduler(() => this.dispose(), 300));
    this.create();
  }
  get currentDropOperation() {
    return this._currentDropOperation;
  }
  get disposed() {
    return !!this._disposed;
  }
  create() {
    this.container = $("div", { id: _ViewPaneDropOverlay.OVERLAY_ID });
    this.container.style.top = "0px";
    this.paneElement.appendChild(this.container);
    this.paneElement.classList.add("dragged-over");
    this._register(toDisposable(() => {
      this.container.remove();
      this.paneElement.classList.remove("dragged-over");
    }));
    this.overlay = $(".pane-overlay-indicator");
    this.container.appendChild(this.overlay);
    this.registerListeners();
    this.updateStyles();
  }
  updateStyles() {
    this.overlay.style.backgroundColor = this.getColor(this.location === ViewContainerLocation.Panel ? PANEL_SECTION_DRAG_AND_DROP_BACKGROUND : SIDE_BAR_DRAG_AND_DROP_BACKGROUND) || "";
    const activeContrastBorderColor = this.getColor(activeContrastBorder);
    this.overlay.style.outlineColor = activeContrastBorderColor || "";
    this.overlay.style.outlineOffset = activeContrastBorderColor ? "-2px" : "";
    this.overlay.style.outlineStyle = activeContrastBorderColor ? "dashed" : "";
    this.overlay.style.outlineWidth = activeContrastBorderColor ? "2px" : "";
    this.overlay.style.borderColor = activeContrastBorderColor || "";
    this.overlay.style.borderStyle = "solid";
    this.overlay.style.borderWidth = "0px";
  }
  registerListeners() {
    this._register(new DragAndDropObserver(this.container, {
      onDragOver: (e) => {
        this.positionOverlay(e.offsetX, e.offsetY);
        if (this.cleanupOverlayScheduler.isScheduled()) {
          this.cleanupOverlayScheduler.cancel();
        }
      },
      onDragLeave: (e) => this.dispose(),
      onDragEnd: (e) => this.dispose(),
      onDrop: (e) => {
        this.dispose();
      }
    }));
    this._register(addDisposableListener(this.container, EventType.MOUSE_OVER, () => {
      if (!this.cleanupOverlayScheduler.isScheduled()) {
        this.cleanupOverlayScheduler.schedule();
      }
    }));
  }
  positionOverlay(mousePosX, mousePosY) {
    const paneWidth = this.paneElement.clientWidth;
    const paneHeight = this.paneElement.clientHeight;
    const splitWidthThreshold = paneWidth / 2;
    const splitHeightThreshold = paneHeight / 2;
    let dropDirection;
    if (this.orientation === Orientation.VERTICAL) {
      if (mousePosY < splitHeightThreshold) {
        dropDirection = 0 /* UP */;
      } else if (mousePosY >= splitHeightThreshold) {
        dropDirection = 1 /* DOWN */;
      }
    } else if (this.orientation === Orientation.HORIZONTAL) {
      if (mousePosX < splitWidthThreshold) {
        dropDirection = 2 /* LEFT */;
      } else if (mousePosX >= splitWidthThreshold) {
        dropDirection = 3 /* RIGHT */;
      }
    }
    switch (dropDirection) {
      case 0 /* UP */:
        this.doPositionOverlay({ top: "0", left: "0", width: "100%", height: "50%" });
        break;
      case 1 /* DOWN */:
        this.doPositionOverlay({ bottom: "0", left: "0", width: "100%", height: "50%" });
        break;
      case 2 /* LEFT */:
        this.doPositionOverlay({ top: "0", left: "0", width: "50%", height: "100%" });
        break;
      case 3 /* RIGHT */:
        this.doPositionOverlay({ top: "0", right: "0", width: "50%", height: "100%" });
        break;
      default: {
        let top = "0";
        let left = "0";
        let width = "100%";
        let height = "100%";
        if (this.bounds) {
          const boundingRect = this.container.getBoundingClientRect();
          top = `${this.bounds.top - boundingRect.top}px`;
          left = `${this.bounds.left - boundingRect.left}px`;
          height = `${this.bounds.bottom - this.bounds.top}px`;
          width = `${this.bounds.right - this.bounds.left}px`;
        }
        this.doPositionOverlay({ top, left, width, height });
      }
    }
    if (this.orientation === Orientation.VERTICAL && paneHeight <= 25 || this.orientation === Orientation.HORIZONTAL && paneWidth <= 25) {
      this.doUpdateOverlayBorder(dropDirection);
    } else {
      this.doUpdateOverlayBorder(void 0);
    }
    this.overlay.style.opacity = "1";
    setTimeout(() => this.overlay.classList.add("overlay-move-transition"), 0);
    this._currentDropOperation = dropDirection;
  }
  doUpdateOverlayBorder(direction) {
    this.overlay.style.borderTopWidth = direction === 0 /* UP */ ? "2px" : "0px";
    this.overlay.style.borderLeftWidth = direction === 2 /* LEFT */ ? "2px" : "0px";
    this.overlay.style.borderBottomWidth = direction === 1 /* DOWN */ ? "2px" : "0px";
    this.overlay.style.borderRightWidth = direction === 3 /* RIGHT */ ? "2px" : "0px";
  }
  doPositionOverlay(options) {
    this.container.style.height = "100%";
    this.overlay.style.top = options.top || "";
    this.overlay.style.left = options.left || "";
    this.overlay.style.bottom = options.bottom || "";
    this.overlay.style.right = options.right || "";
    this.overlay.style.width = options.width;
    this.overlay.style.height = options.height;
  }
  contains(element) {
    return element === this.container || element === this.overlay;
  }
  dispose() {
    super.dispose();
    this._disposed = true;
  }
};
_ViewPaneDropOverlay.OVERLAY_ID = "monaco-pane-drop-overlay";
let ViewPaneDropOverlay = _ViewPaneDropOverlay;
let ViewPaneContainer = class extends Component {
  constructor(id, options, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService) {
    super(id, themeService, storageService);
    this.options = options;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.layoutService = layoutService;
    this.contextMenuService = contextMenuService;
    this.telemetryService = telemetryService;
    this.extensionService = extensionService;
    this.storageService = storageService;
    this.contextService = contextService;
    this.viewDescriptorService = viewDescriptorService;
    this.logService = logService;
    this.paneItems = [];
    this.visible = false;
    this.areExtensionsReady = false;
    this.didLayout = false;
    this._onTitleAreaUpdate = this._register(new Emitter());
    this.onTitleAreaUpdate = this._onTitleAreaUpdate.event;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._onDidAddViews = this._register(new Emitter());
    this.onDidAddViews = this._onDidAddViews.event;
    this._onDidRemoveViews = this._register(new Emitter());
    this.onDidRemoveViews = this._onDidRemoveViews.event;
    this._onDidChangeViewVisibility = this._register(new Emitter());
    this.onDidChangeViewVisibility = this._onDidChangeViewVisibility.event;
    this._onDidFocusView = this._register(new Emitter());
    this.onDidFocusView = this._onDidFocusView.event;
    this._onDidBlurView = this._register(new Emitter());
    this.onDidBlurView = this._onDidBlurView.event;
    const container = this.viewDescriptorService.getViewContainerById(id);
    if (!container) {
      throw new Error("Could not find container");
    }
    this.viewContainer = container;
    this.visibleViewsStorageId = `${id}.numberOfVisibleViews`;
    this.visibleViewsCountFromCache = this.storageService.getNumber(this.visibleViewsStorageId, StorageScope.WORKSPACE, void 0);
    this.viewContainerModel = this.viewDescriptorService.getViewContainerModel(container);
  }
  get onDidSashChange() {
    return assertReturnsDefined(this.paneview).onDidSashChange;
  }
  get panes() {
    return this.paneItems.map((i) => i.pane);
  }
  get views() {
    return this.panes;
  }
  get length() {
    return this.paneItems.length;
  }
  get menuActions() {
    return this._menuActions;
  }
  create(parent) {
    const options = this.options;
    options.orientation = this.orientation;
    this.paneview = this._register(new PaneView(parent, this.options));
    if (this._boundarySashes) {
      this.paneview.setBoundarySashes(this._boundarySashes);
    }
    this._register(this.paneview.onDidDrop(({ from, to }) => this.movePane(from, to)));
    this._register(this.paneview.onDidScroll((_) => this.onDidScrollPane()));
    this._register(this.paneview.onDidSashReset((index) => this.onDidSashReset(index)));
    this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, (e) => this.showContextMenu(new StandardMouseEvent(getWindow(parent), e))));
    this._register(Gesture.addTarget(parent));
    this._register(addDisposableListener(parent, TouchEventType.Contextmenu, (e) => this.showContextMenu(new StandardMouseEvent(getWindow(parent), e))));
    this._menuActions = this._register(this.instantiationService.createInstance(ViewContainerMenuActions, this.paneview.element, this.viewContainer, void 0));
    this._register(this._menuActions.onDidChange(() => this.updateTitleArea()));
    let overlay;
    const getOverlayBounds = () => {
      const fullSize = parent.getBoundingClientRect();
      const lastPane = this.panes[this.panes.length - 1].element.getBoundingClientRect();
      const top = this.orientation === Orientation.VERTICAL ? lastPane.bottom : fullSize.top;
      const left = this.orientation === Orientation.HORIZONTAL ? lastPane.right : fullSize.left;
      return {
        top,
        bottom: fullSize.bottom,
        left,
        right: fullSize.right
      };
    };
    const inBounds = (bounds2, pos) => {
      return pos.x >= bounds2.left && pos.x <= bounds2.right && pos.y >= bounds2.top && pos.y <= bounds2.bottom;
    };
    let bounds;
    if (this.viewDescriptorService.canMoveViews()) {
      this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(parent, {
        onDragEnter: (e) => {
          bounds = getOverlayBounds();
          if (overlay?.disposed) {
            overlay = void 0;
          }
          if (!overlay && inBounds(bounds, e.eventData)) {
            const dropData = e.dragAndDropData.getData();
            if (dropData.type === "view") {
              const oldViewContainer = this.viewDescriptorService.getViewContainerByViewId(dropData.id);
              const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dropData.id);
              if (oldViewContainer !== this.viewContainer && (!viewDescriptor || !viewDescriptor.canMoveView || this.viewContainer.rejectAddedViews)) {
                return;
              }
              overlay = new ViewPaneDropOverlay(parent, void 0, bounds, this.viewDescriptorService.getViewContainerLocation(this.viewContainer), this.themeService);
            }
            if (dropData.type === "composite" && dropData.id !== this.viewContainer.id) {
              const container = this.viewDescriptorService.getViewContainerById(dropData.id);
              const viewsToMove = this.viewDescriptorService.getViewContainerModel(container).allViewDescriptors;
              if (!viewsToMove.some((v) => !v.canMoveView) && viewsToMove.length > 0) {
                overlay = new ViewPaneDropOverlay(parent, void 0, bounds, this.viewDescriptorService.getViewContainerLocation(this.viewContainer), this.themeService);
              }
            }
          }
        },
        onDragOver: (e) => {
          if (overlay?.disposed) {
            overlay = void 0;
          }
          if (overlay && !inBounds(bounds, e.eventData)) {
            overlay.dispose();
            overlay = void 0;
          }
          if (inBounds(bounds, e.eventData)) {
            toggleDropEffect(e.eventData.dataTransfer, "move", overlay !== void 0);
          }
        },
        onDragLeave: (e) => {
          overlay?.dispose();
          overlay = void 0;
        },
        onDrop: (e) => {
          if (overlay) {
            const dropData = e.dragAndDropData.getData();
            const viewsToMove = [];
            if (dropData.type === "composite" && dropData.id !== this.viewContainer.id) {
              const container = this.viewDescriptorService.getViewContainerById(dropData.id);
              const allViews = this.viewDescriptorService.getViewContainerModel(container).allViewDescriptors;
              if (!allViews.some((v) => !v.canMoveView)) {
                viewsToMove.push(...allViews);
              }
            } else if (dropData.type === "view") {
              const oldViewContainer = this.viewDescriptorService.getViewContainerByViewId(dropData.id);
              const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dropData.id);
              if (oldViewContainer !== this.viewContainer && viewDescriptor?.canMoveView) {
                this.viewDescriptorService.moveViewsToContainer([viewDescriptor], this.viewContainer, void 0, "dnd");
              }
            }
            const paneCount = this.panes.length;
            if (viewsToMove.length > 0) {
              this.viewDescriptorService.moveViewsToContainer(viewsToMove, this.viewContainer, void 0, "dnd");
            }
            if (paneCount > 0) {
              for (const view of viewsToMove) {
                const paneToMove = this.panes.find((p) => p.id === view.id);
                if (paneToMove) {
                  this.movePane(paneToMove, this.panes[this.panes.length - 1]);
                }
              }
            }
          }
          overlay?.dispose();
          overlay = void 0;
        }
      }));
    }
    this._register(this.onDidSashChange(() => this.saveViewSizes()));
    this._register(this.viewContainerModel.onDidAddVisibleViewDescriptors((added) => this.onDidAddViewDescriptors(added)));
    this._register(this.viewContainerModel.onDidRemoveVisibleViewDescriptors((removed) => this.onDidRemoveViewDescriptors(removed)));
    const addedViews = this.viewContainerModel.visibleViewDescriptors.map((viewDescriptor, index) => {
      const size = this.viewContainerModel.getSize(viewDescriptor.id);
      const collapsed = this.viewContainerModel.isCollapsed(viewDescriptor.id);
      return { viewDescriptor, index, size, collapsed };
    });
    if (addedViews.length) {
      this.onDidAddViewDescriptors(addedViews);
    }
    this.extensionService.whenInstalledExtensionsRegistered().then(() => {
      this.areExtensionsReady = true;
      if (this.panes.length) {
        this.updateTitleArea();
        this.updateViewHeaders();
      }
      this._register(this.configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
          this.updateViewHeaders();
        }
      }));
    });
    this._register(this.viewContainerModel.onDidChangeActiveViewDescriptors(() => this._onTitleAreaUpdate.fire()));
  }
  getTitle() {
    const containerTitle = this.viewContainerModel.title;
    if (this.isViewMergedWithContainer()) {
      const singleViewPaneContainerTitle = this.paneItems[0].pane.singleViewPaneContainerTitle;
      if (singleViewPaneContainerTitle) {
        return singleViewPaneContainerTitle;
      }
      const paneItemTitle = this.paneItems[0].pane.title;
      if (containerTitle === paneItemTitle) {
        return paneItemTitle;
      }
      return paneItemTitle ? `${containerTitle}: ${paneItemTitle}` : containerTitle;
    }
    return containerTitle;
  }
  showContextMenu(event) {
    for (const paneItem of this.paneItems) {
      if (isAncestor(event.target, paneItem.pane.element)) {
        return;
      }
    }
    event.stopPropagation();
    event.preventDefault();
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      getActions: () => this.menuActions?.getContextMenuActions() ?? []
    });
  }
  getActionsContext() {
    if (this.isViewMergedWithContainer()) {
      return this.panes[0].getActionsContext();
    }
    return void 0;
  }
  getActionViewItem(action, options) {
    if (this.isViewMergedWithContainer()) {
      return this.paneItems[0].pane.createActionViewItem(action, options);
    }
    return createActionViewItem(this.instantiationService, action, options);
  }
  focus() {
    let paneToFocus = void 0;
    if (this.lastFocusedPane) {
      paneToFocus = this.lastFocusedPane;
    } else if (this.paneItems.length > 0) {
      for (const { pane } of this.paneItems) {
        if (pane.isExpanded()) {
          paneToFocus = pane;
          break;
        }
      }
    }
    if (paneToFocus) {
      paneToFocus.focus();
    }
  }
  get orientation() {
    switch (this.viewDescriptorService.getViewContainerLocation(this.viewContainer)) {
      case ViewContainerLocation.Sidebar:
      case ViewContainerLocation.AuxiliaryBar:
        return Orientation.VERTICAL;
      case ViewContainerLocation.Panel: {
        return isHorizontal(this.layoutService.getPanelPosition()) ? Orientation.HORIZONTAL : Orientation.VERTICAL;
      }
    }
    return Orientation.VERTICAL;
  }
  layout(dimension) {
    if (this.paneview) {
      if (this.paneview.orientation !== this.orientation) {
        this.paneview.flipOrientation(dimension.height, dimension.width);
      }
      const bottomGap = !this.layoutService.isFloatingPanelsEnabled() ? 0 : this.viewDescriptorService.getViewContainerLocation(this.viewContainer) === ViewContainerLocation.Panel && this.layoutService.getPanelPosition() === Position.TOP ? 1 : FLOATING_PANEL_MARGIN + 1;
      this.paneview.layout(Math.max(0, dimension.height - bottomGap), dimension.width);
    }
    this.dimension = dimension;
    if (this.didLayout) {
      this.saveViewSizes();
    } else {
      this.didLayout = true;
      this.restoreViewSizes();
    }
  }
  setBoundarySashes(sashes) {
    this._boundarySashes = sashes;
    this.paneview?.setBoundarySashes(sashes);
  }
  getOptimalWidth() {
    const additionalMargin = 16;
    const optimalWidth = Math.max(...this.panes.map((view) => view.getOptimalWidth() || 0));
    return optimalWidth + additionalMargin;
  }
  addPanes(panes) {
    const wasMerged = this.isViewMergedWithContainer();
    for (const { pane, size, index, disposable } of panes) {
      this.addPane(pane, size, disposable, index);
    }
    this.updateViewHeaders();
    if (this.isViewMergedWithContainer() !== wasMerged) {
      this.updateTitleArea();
    }
    this._onDidAddViews.fire(panes.map(({ pane }) => pane));
  }
  setVisible(visible) {
    if (this.visible !== !!visible) {
      this.visible = visible;
      this._onDidChangeVisibility.fire(visible);
    }
    this.panes.filter((view) => view.isVisible() !== visible).map((view) => view.setVisible(visible));
  }
  isVisible() {
    return this.visible;
  }
  updateTitleArea() {
    this._onTitleAreaUpdate.fire();
  }
  createView(viewDescriptor, options) {
    return this.instantiationService.createInstance(viewDescriptor.ctorDescriptor.ctor, ...viewDescriptor.ctorDescriptor.staticArguments || [], options);
  }
  getView(id) {
    return this.panes.filter((view) => view.id === id)[0];
  }
  saveViewSizes() {
    if (this.didLayout) {
      this.viewContainerModel.setSizes(this.panes.map((view) => ({ id: view.id, size: this.getPaneSize(view) })));
    }
  }
  restoreViewSizes() {
    if (this.didLayout) {
      let initialSizes;
      for (const viewDescriptor of this.viewContainerModel.visibleViewDescriptors) {
        const pane = this.getView(viewDescriptor.id);
        if (!pane) {
          continue;
        }
        const size = this.viewContainerModel.getSize(viewDescriptor.id);
        if (typeof size === "number") {
          this.resizePane(pane, size);
        } else {
          initialSizes = initialSizes ? initialSizes : this.computeInitialSizes();
          this.resizePane(pane, initialSizes.get(pane.id) || 200);
        }
      }
    }
  }
  computeInitialSizes() {
    const sizes = /* @__PURE__ */ new Map();
    if (this.dimension) {
      const totalWeight = this.viewContainerModel.visibleViewDescriptors.reduce((totalWeight2, { weight }) => totalWeight2 + (weight || 20), 0);
      for (const viewDescriptor of this.viewContainerModel.visibleViewDescriptors) {
        if (this.orientation === Orientation.VERTICAL) {
          sizes.set(viewDescriptor.id, this.dimension.height * (viewDescriptor.weight || 20) / totalWeight);
        } else {
          sizes.set(viewDescriptor.id, this.dimension.width * (viewDescriptor.weight || 20) / totalWeight);
        }
      }
    }
    return sizes;
  }
  saveState() {
    this.panes.forEach((view) => view.saveState());
    this.storageService.store(this.visibleViewsStorageId, this.length, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  onContextMenu(event, viewPane) {
    event.stopPropagation();
    event.preventDefault();
    const actions = viewPane.menuActions.getContextMenuActions();
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      getActions: () => actions
    });
  }
  openView(id, focus) {
    let view = this.getView(id);
    if (!view) {
      this.toggleViewVisibility(id);
    }
    view = this.getView(id);
    if (view) {
      view.setExpanded(true);
      if (focus) {
        view.focus();
      }
    }
    return view;
  }
  onDidAddViewDescriptors(added) {
    const panesToAdd = [];
    for (const { viewDescriptor, collapsed, index, size } of added) {
      const pane = this.createView(
        viewDescriptor,
        {
          id: viewDescriptor.id,
          title: viewDescriptor.name.value,
          fromExtensionId: viewDescriptor.extensionId,
          expanded: !collapsed,
          singleViewPaneContainerTitle: viewDescriptor.singleViewPaneContainerTitle
        }
      );
      try {
        pane.render();
      } catch (error) {
        this.logService.error(`Fail to render view ${viewDescriptor.id}`, error);
        continue;
      }
      if (pane.draggableElement) {
        const contextMenuDisposable = addDisposableListener(pane.draggableElement, "contextmenu", (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.onContextMenu(new StandardMouseEvent(getWindow(pane.draggableElement), e), pane);
        });
        const collapseDisposable = Event.latch(Event.map(pane.onDidChange, () => !pane.isExpanded()))((collapsed2) => {
          this.viewContainerModel.setCollapsed(viewDescriptor.id, collapsed2);
        });
        panesToAdd.push({ pane, size: size || pane.minimumSize, index, disposable: combinedDisposable(contextMenuDisposable, collapseDisposable) });
      }
    }
    this.addPanes(panesToAdd);
    this.restoreViewSizes();
    const panes = [];
    for (const { pane } of panesToAdd) {
      pane.setVisible(this.isVisible());
      panes.push(pane);
    }
    return panes;
  }
  onDidRemoveViewDescriptors(removed) {
    removed = removed.sort((a, b) => b.index - a.index);
    const panesToRemove = [];
    for (const { index } of removed) {
      const paneItem = this.paneItems[index];
      if (paneItem) {
        panesToRemove.push(this.paneItems[index].pane);
      }
    }
    if (panesToRemove.length) {
      this.removePanes(panesToRemove);
      for (const pane of panesToRemove) {
        pane.setVisible(false);
      }
    }
  }
  toggleViewVisibility(viewId) {
    if (this.viewContainerModel.activeViewDescriptors.some((viewDescriptor) => viewDescriptor.id === viewId)) {
      const visible = !this.viewContainerModel.isVisible(viewId);
      this.viewContainerModel.setVisible(viewId, visible);
    }
  }
  addPane(pane, size, disposable, index = this.paneItems.length - 1) {
    const onDidFocus = pane.onDidFocus(() => {
      this._onDidFocusView.fire(pane);
      this.lastFocusedPane = pane;
    });
    const onDidBlur = pane.onDidBlur(() => this._onDidBlurView.fire(pane));
    const onDidChangeTitleArea = pane.onDidChangeTitleArea(() => {
      if (this.isViewMergedWithContainer()) {
        this.updateTitleArea();
      }
    });
    const onDidChangeVisibility = pane.onDidChangeBodyVisibility(() => this._onDidChangeViewVisibility.fire(pane));
    const onDidChange = pane.onDidChange(() => {
      if (pane === this.lastFocusedPane && !pane.isExpanded()) {
        this.lastFocusedPane = void 0;
      }
    });
    const isPanel = this.viewDescriptorService.getViewContainerLocation(this.viewContainer) === ViewContainerLocation.Panel;
    pane.style({
      headerForeground: asCssVariable(isPanel ? PANEL_SECTION_HEADER_FOREGROUND : SIDE_BAR_SECTION_HEADER_FOREGROUND),
      headerBackground: asCssVariable(isPanel ? PANEL_SECTION_HEADER_BACKGROUND : SIDE_BAR_SECTION_HEADER_BACKGROUND),
      headerBorder: asCssVariable(isPanel ? PANEL_SECTION_HEADER_BORDER : SIDE_BAR_SECTION_HEADER_BORDER),
      dropBackground: asCssVariable(isPanel ? PANEL_SECTION_DRAG_AND_DROP_BACKGROUND : SIDE_BAR_DRAG_AND_DROP_BACKGROUND),
      leftBorder: isPanel ? asCssVariable(PANEL_SECTION_BORDER) : void 0
    });
    const store = new DisposableStore();
    store.add(disposable);
    store.add(combinedDisposable(pane, onDidFocus, onDidBlur, onDidChangeTitleArea, onDidChange, onDidChangeVisibility));
    const paneItem = { pane, disposable: store };
    this.paneItems.splice(index, 0, paneItem);
    assertReturnsDefined(this.paneview).addPane(pane, size, index);
    let overlay;
    if (this.viewDescriptorService.canMoveViews()) {
      if (pane.draggableElement) {
        store.add(CompositeDragAndDropObserver.INSTANCE.registerDraggable(pane.draggableElement, () => {
          return { type: "view", id: pane.id };
        }, {}));
      }
      store.add(CompositeDragAndDropObserver.INSTANCE.registerTarget(pane.dropTargetElement, {
        onDragEnter: (e) => {
          if (!overlay) {
            const dropData = e.dragAndDropData.getData();
            if (dropData.type === "view" && dropData.id !== pane.id) {
              const oldViewContainer = this.viewDescriptorService.getViewContainerByViewId(dropData.id);
              const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dropData.id);
              if (oldViewContainer !== this.viewContainer && (!viewDescriptor || !viewDescriptor.canMoveView || this.viewContainer.rejectAddedViews)) {
                return;
              }
              overlay = new ViewPaneDropOverlay(pane.dropTargetElement, this.orientation ?? Orientation.VERTICAL, void 0, this.viewDescriptorService.getViewContainerLocation(this.viewContainer), this.themeService);
            }
            if (dropData.type === "composite" && dropData.id !== this.viewContainer.id && !this.viewContainer.rejectAddedViews) {
              const container = this.viewDescriptorService.getViewContainerById(dropData.id);
              const viewsToMove = this.viewDescriptorService.getViewContainerModel(container).allViewDescriptors;
              if (!viewsToMove.some((v) => !v.canMoveView) && viewsToMove.length > 0) {
                overlay = new ViewPaneDropOverlay(pane.dropTargetElement, this.orientation ?? Orientation.VERTICAL, void 0, this.viewDescriptorService.getViewContainerLocation(this.viewContainer), this.themeService);
              }
            }
          }
        },
        onDragOver: (e) => {
          toggleDropEffect(e.eventData.dataTransfer, "move", overlay !== void 0);
        },
        onDragLeave: (e) => {
          overlay?.dispose();
          overlay = void 0;
        },
        onDrop: (e) => {
          if (overlay) {
            const dropData = e.dragAndDropData.getData();
            const viewsToMove = [];
            let anchorView;
            if (dropData.type === "composite" && dropData.id !== this.viewContainer.id && !this.viewContainer.rejectAddedViews) {
              const container = this.viewDescriptorService.getViewContainerById(dropData.id);
              const allViews = this.viewDescriptorService.getViewContainerModel(container).allViewDescriptors;
              if (allViews.length > 0 && !allViews.some((v) => !v.canMoveView)) {
                viewsToMove.push(...allViews);
                anchorView = allViews[0];
              }
            } else if (dropData.type === "view") {
              const oldViewContainer = this.viewDescriptorService.getViewContainerByViewId(dropData.id);
              const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dropData.id);
              if (oldViewContainer !== this.viewContainer && viewDescriptor && viewDescriptor.canMoveView && !this.viewContainer.rejectAddedViews) {
                viewsToMove.push(viewDescriptor);
              }
              if (viewDescriptor) {
                anchorView = viewDescriptor;
              }
            }
            if (viewsToMove) {
              this.viewDescriptorService.moveViewsToContainer(viewsToMove, this.viewContainer, void 0, "dnd");
            }
            if (anchorView) {
              if (overlay.currentDropOperation === 1 /* DOWN */ || overlay.currentDropOperation === 3 /* RIGHT */) {
                const fromIndex = this.panes.findIndex((p) => p.id === anchorView.id);
                let toIndex = this.panes.findIndex((p) => p.id === pane.id);
                if (fromIndex >= 0 && toIndex >= 0) {
                  if (fromIndex > toIndex) {
                    toIndex++;
                  }
                  if (toIndex < this.panes.length && toIndex !== fromIndex) {
                    this.movePane(this.panes[fromIndex], this.panes[toIndex]);
                  }
                }
              }
              if (overlay.currentDropOperation === 0 /* UP */ || overlay.currentDropOperation === 2 /* LEFT */) {
                const fromIndex = this.panes.findIndex((p) => p.id === anchorView.id);
                let toIndex = this.panes.findIndex((p) => p.id === pane.id);
                if (fromIndex >= 0 && toIndex >= 0) {
                  if (fromIndex < toIndex) {
                    toIndex--;
                  }
                  if (toIndex >= 0 && toIndex !== fromIndex) {
                    this.movePane(this.panes[fromIndex], this.panes[toIndex]);
                  }
                }
              }
              if (viewsToMove.length > 1) {
                viewsToMove.slice(1).forEach((view) => {
                  let toIndex = this.panes.findIndex((p) => p.id === anchorView.id);
                  const fromIndex = this.panes.findIndex((p) => p.id === view.id);
                  if (fromIndex >= 0 && toIndex >= 0) {
                    if (fromIndex > toIndex) {
                      toIndex++;
                    }
                    if (toIndex < this.panes.length && toIndex !== fromIndex) {
                      this.movePane(this.panes[fromIndex], this.panes[toIndex]);
                      anchorView = view;
                    }
                  }
                });
              }
            }
          }
          overlay?.dispose();
          overlay = void 0;
        }
      }));
    }
  }
  removePanes(panes) {
    const wasMerged = this.isViewMergedWithContainer();
    panes.forEach((pane) => this.removePane(pane));
    this.updateViewHeaders();
    if (wasMerged !== this.isViewMergedWithContainer()) {
      this.updateTitleArea();
    }
    this._onDidRemoveViews.fire(panes);
  }
  removePane(pane) {
    const index = this.paneItems.findIndex((i) => i.pane === pane);
    if (index === -1) {
      return;
    }
    if (this.lastFocusedPane === pane) {
      this.lastFocusedPane = void 0;
    }
    assertReturnsDefined(this.paneview).removePane(pane);
    const [paneItem] = this.paneItems.splice(index, 1);
    paneItem.disposable.dispose();
  }
  movePane(from, to) {
    const fromIndex = this.paneItems.findIndex((item) => item.pane === from);
    const toIndex = this.paneItems.findIndex((item) => item.pane === to);
    const fromViewDescriptor = this.viewContainerModel.visibleViewDescriptors[fromIndex];
    const toViewDescriptor = this.viewContainerModel.visibleViewDescriptors[toIndex];
    if (fromIndex < 0 || fromIndex >= this.paneItems.length) {
      return;
    }
    if (toIndex < 0 || toIndex >= this.paneItems.length) {
      return;
    }
    const [paneItem] = this.paneItems.splice(fromIndex, 1);
    this.paneItems.splice(toIndex, 0, paneItem);
    assertReturnsDefined(this.paneview).movePane(from, to);
    this.viewContainerModel.move(fromViewDescriptor.id, toViewDescriptor.id);
    this.updateTitleArea();
  }
  resizePane(pane, size) {
    assertReturnsDefined(this.paneview).resizePane(pane, size);
  }
  getPaneSize(pane) {
    return assertReturnsDefined(this.paneview).getPaneSize(pane);
  }
  updateViewHeaders() {
    if (this.isViewMergedWithContainer()) {
      if (this.paneItems[0].pane.isExpanded()) {
        this.lastMergedCollapsedPane = void 0;
      } else {
        this.lastMergedCollapsedPane = this.paneItems[0].pane;
        this.paneItems[0].pane.setExpanded(true);
      }
      this.paneItems[0].pane.headerVisible = false;
      this.paneItems[0].pane.collapsible = true;
    } else {
      if (this.paneItems.length === 1) {
        this.paneItems[0].pane.headerVisible = true;
        if (this.paneItems[0].pane === this.lastMergedCollapsedPane) {
          this.paneItems[0].pane.setExpanded(false);
        }
        this.paneItems[0].pane.collapsible = false;
      } else {
        this.paneItems.forEach((i) => {
          i.pane.headerVisible = true;
          i.pane.collapsible = true;
          if (i.pane === this.lastMergedCollapsedPane) {
            i.pane.setExpanded(false);
          }
        });
      }
      this.lastMergedCollapsedPane = void 0;
    }
  }
  isViewMergedWithContainer() {
    if (!(this.options.mergeViewWithContainerWhenSingleView && this.paneItems.length === 1)) {
      return false;
    }
    if (!this.areExtensionsReady) {
      if (this.visibleViewsCountFromCache === void 0) {
        return this.paneItems[0].pane.isExpanded();
      }
      return this.visibleViewsCountFromCache === 1;
    }
    return true;
  }
  onDidScrollPane() {
    for (const pane of this.panes) {
      pane.onDidScrollRoot();
    }
  }
  onDidSashReset(index) {
    let firstPane = void 0;
    let secondPane = void 0;
    for (let i = index; i >= 0; i--) {
      if (this.paneItems[i].pane?.isVisible() && this.paneItems[i]?.pane.isExpanded()) {
        firstPane = this.paneItems[i].pane;
        break;
      }
    }
    for (let i = index + 1; i < this.paneItems.length; i++) {
      if (this.paneItems[i].pane?.isVisible() && this.paneItems[i]?.pane.isExpanded()) {
        secondPane = this.paneItems[i].pane;
        break;
      }
    }
    if (firstPane && secondPane) {
      const firstPaneSize = this.getPaneSize(firstPane);
      const secondPaneSize = this.getPaneSize(secondPane);
      const newFirstPaneSize = Math.ceil((firstPaneSize + secondPaneSize) / 2);
      const newSecondPaneSize = Math.floor((firstPaneSize + secondPaneSize) / 2);
      if (firstPaneSize > secondPaneSize) {
        this.resizePane(firstPane, newFirstPaneSize);
        this.resizePane(secondPane, newSecondPaneSize);
      } else {
        this.resizePane(secondPane, newSecondPaneSize);
        this.resizePane(firstPane, newFirstPaneSize);
      }
    }
  }
  dispose() {
    super.dispose();
    this.paneItems.forEach((i) => i.disposable.dispose());
    if (this.paneview) {
      this.paneview.dispose();
    }
  }
};
ViewPaneContainer = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IWorkbenchLayoutService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IWorkspaceContextService),
  __decorateParam(11, IViewDescriptorService),
  __decorateParam(12, ILogService)
], ViewPaneContainer);
class ViewPaneContainerAction extends Action2 {
  constructor(desc) {
    super(desc);
    this.desc = desc;
  }
  run(accessor, ...args) {
    const viewPaneContainer = accessor.get(IViewsService).getActiveViewPaneContainerWithId(this.desc.viewPaneContainerId);
    if (viewPaneContainer) {
      return this.runInViewPaneContainer(accessor, viewPaneContainer, ...args);
    }
    return void 0;
  }
}
class MoveViewPosition extends Action2 {
  constructor(desc, offset) {
    super(desc);
    this.offset = offset;
  }
  async run(accessor) {
    const viewDescriptorService = accessor.get(IViewDescriptorService);
    const contextKeyService = accessor.get(IContextKeyService);
    const viewId = FocusedViewContext.getValue(contextKeyService);
    if (viewId === void 0) {
      return;
    }
    const viewContainer = viewDescriptorService.getViewContainerByViewId(viewId);
    const model = viewDescriptorService.getViewContainerModel(viewContainer);
    const viewDescriptor = model.visibleViewDescriptors.find((vd) => vd.id === viewId);
    const currentIndex = model.visibleViewDescriptors.indexOf(viewDescriptor);
    if (currentIndex + this.offset < 0 || currentIndex + this.offset >= model.visibleViewDescriptors.length) {
      return;
    }
    const newPosition = model.visibleViewDescriptors[currentIndex + this.offset];
    model.move(viewDescriptor.id, newPosition.id);
  }
}
registerAction2(
  class MoveViewUp extends MoveViewPosition {
    constructor() {
      super({
        id: "views.moveViewUp",
        title: nls.localize("viewMoveUp", "Move View Up"),
        keybinding: {
          primary: KeyChord(KeyMod.CtrlCmd + KeyCode.KeyK, KeyCode.UpArrow),
          weight: KeybindingWeight.WorkbenchContrib + 1,
          when: FocusedViewContext.notEqualsTo("")
        }
      }, -1);
    }
  }
);
registerAction2(
  class MoveViewLeft extends MoveViewPosition {
    constructor() {
      super({
        id: "views.moveViewLeft",
        title: nls.localize("viewMoveLeft", "Move View Left"),
        keybinding: {
          primary: KeyChord(KeyMod.CtrlCmd + KeyCode.KeyK, KeyCode.LeftArrow),
          weight: KeybindingWeight.WorkbenchContrib + 1,
          when: FocusedViewContext.notEqualsTo("")
        }
      }, -1);
    }
  }
);
registerAction2(
  class MoveViewDown extends MoveViewPosition {
    constructor() {
      super({
        id: "views.moveViewDown",
        title: nls.localize("viewMoveDown", "Move View Down"),
        keybinding: {
          primary: KeyChord(KeyMod.CtrlCmd + KeyCode.KeyK, KeyCode.DownArrow),
          weight: KeybindingWeight.WorkbenchContrib + 1,
          when: FocusedViewContext.notEqualsTo("")
        }
      }, 1);
    }
  }
);
registerAction2(
  class MoveViewRight extends MoveViewPosition {
    constructor() {
      super({
        id: "views.moveViewRight",
        title: nls.localize("viewMoveRight", "Move View Right"),
        keybinding: {
          primary: KeyChord(KeyMod.CtrlCmd + KeyCode.KeyK, KeyCode.RightArrow),
          weight: KeybindingWeight.WorkbenchContrib + 1,
          when: FocusedViewContext.notEqualsTo("")
        }
      }, 1);
    }
  }
);
registerAction2(class MoveViews extends Action2 {
  constructor() {
    super({
      id: "vscode.moveViews",
      title: nls.localize("viewsMove", "Move Views")
    });
  }
  async run(accessor, options) {
    if (!Array.isArray(options?.viewIds) || typeof options?.destinationId !== "string") {
      return Promise.reject("Invalid arguments");
    }
    const viewDescriptorService = accessor.get(IViewDescriptorService);
    const destination = viewDescriptorService.getViewContainerById(options.destinationId);
    if (!destination) {
      return;
    }
    for (const viewId of options.viewIds) {
      const viewDescriptor = viewDescriptorService.getViewDescriptorById(viewId);
      if (viewDescriptor?.canMoveView) {
        viewDescriptorService.moveViewsToContainer([viewDescriptor], destination, ViewVisibilityState.Default, this.desc.id);
      }
    }
    await accessor.get(IViewsService).openViewContainer(destination.id, true);
  }
});
export {
  ViewPaneContainer,
  ViewPaneContainerAction,
  ViewsSubMenu
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lQ29udGFpbmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBEaW1lbnNpb24sIERyYWdBbmREcm9wT2JzZXJ2ZXIsIEV2ZW50VHlwZSwgZ2V0V2luZG93LCBpc0FuY2VzdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUsIEdlc3R1cmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUJvdW5kYXJ5U2FzaGVzLCBPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgSVBhbmVWaWV3T3B0aW9ucywgUGFuZVZpZXcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc3BsaXR2aWV3L3BhbmV2aWV3LmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBjb21iaW5lZERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAnLi9tZWRpYS9wYW5ldmlld2xldC5jc3MnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJQWN0aW9uMk9wdGlvbnMsIElTdWJtZW51SXRlbSwgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgYWN0aXZlQ29udHJhc3RCb3JkZXIsIGFzQ3NzVmFyaWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCBUaGVtYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlciwgdG9nZ2xlRHJvcEVmZmVjdCB9IGZyb20gJy4uLy4uL2RuZC5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZSB9IGZyb20gJy4vdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSVZpZXdsZXRWaWV3T3B0aW9ucyB9IGZyb20gJy4vdmlld3NWaWV3bGV0LmpzJztcbmltcG9ydCB7IENvbXBvbmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb21wb25lbnQuanMnO1xuaW1wb3J0IHsgUEFORUxfU0VDVElPTl9CT1JERVIsIFBBTkVMX1NFQ1RJT05fRFJBR19BTkRfRFJPUF9CQUNLR1JPVU5ELCBQQU5FTF9TRUNUSU9OX0hFQURFUl9CQUNLR1JPVU5ELCBQQU5FTF9TRUNUSU9OX0hFQURFUl9CT1JERVIsIFBBTkVMX1NFQ1RJT05fSEVBREVSX0ZPUkVHUk9VTkQsIFNJREVfQkFSX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCwgU0lERV9CQVJfU0VDVElPTl9IRUFERVJfQkFDS0dST1VORCwgU0lERV9CQVJfU0VDVElPTl9IRUFERVJfQk9SREVSLCBTSURFX0JBUl9TRUNUSU9OX0hFQURFUl9GT1JFR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElBZGRlZFZpZXdEZXNjcmlwdG9yUmVmLCBJQ3VzdG9tVmlld0Rlc2NyaXB0b3IsIElWaWV3LCBJVmlld0NvbnRhaW5lck1vZGVsLCBJVmlld0Rlc2NyaXB0b3IsIElWaWV3RGVzY3JpcHRvclJlZiwgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgSVZpZXdQYW5lQ29udGFpbmVyLCBWaWV3Q29udGFpbmVyLCBWaWV3Q29udGFpbmVyTG9jYXRpb24sIFZpZXdWaXNpYmlsaXR5U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRm9jdXNlZFZpZXdDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBpc0hvcml6b250YWwsIElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBMYXlvdXRTZXR0aW5ncywgRkxPQVRJTkdfUEFORUxfTUFSR0lOLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFZpZXdDb250YWluZXJNZW51QWN0aW9ucyB9IGZyb20gJy4vdmlld01lbnVBY3Rpb25zLmpzJztcblxuZXhwb3J0IGNvbnN0IFZpZXdzU3ViTWVudSA9IG5ldyBNZW51SWQoJ1ZpZXdzJyk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlZpZXdDb250YWluZXJUaXRsZSwge1xuXHRzdWJtZW51OiBWaWV3c1N1Yk1lbnUsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ3ZpZXdzJywgXCJWaWV3c1wiKSxcblx0b3JkZXI6IDEsXG59IHNhdGlzZmllcyBJU3VibWVudUl0ZW0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIElWaWV3UGFuZUNvbnRhaW5lck9wdGlvbnMgZXh0ZW5kcyBJUGFuZVZpZXdPcHRpb25zIHtcblx0bWVyZ2VWaWV3V2l0aENvbnRhaW5lcldoZW5TaW5nbGVWaWV3OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSVZpZXdQYW5lSXRlbSB7XG5cdHBhbmU6IFZpZXdQYW5lO1xuXHRkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcbn1cblxuY29uc3QgZW51bSBEcm9wRGlyZWN0aW9uIHtcblx0VVAsXG5cdERPV04sXG5cdExFRlQsXG5cdFJJR0hUXG59XG5cbnR5cGUgQm91bmRpbmdSZWN0ID0geyB0b3A6IG51bWJlcjsgbGVmdDogbnVtYmVyOyBib3R0b206IG51bWJlcjsgcmlnaHQ6IG51bWJlciB9O1xuXG5jbGFzcyBWaWV3UGFuZURyb3BPdmVybGF5IGV4dGVuZHMgVGhlbWFibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE9WRVJMQVlfSUQgPSAnbW9uYWNvLXBhbmUtZHJvcC1vdmVybGF5JztcblxuXHRwcml2YXRlIGNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIG92ZXJsYXkhOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIF9jdXJyZW50RHJvcE9wZXJhdGlvbjogRHJvcERpcmVjdGlvbiB8IHVuZGVmaW5lZDtcblxuXHQvLyBwcml2YXRlIGN1cnJlbnREcm9wT3BlcmF0aW9uOiBJRHJvcE9wZXJhdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlzcG9zZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBjbGVhbnVwT3ZlcmxheVNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblxuXHRnZXQgY3VycmVudERyb3BPcGVyYXRpb24oKTogRHJvcERpcmVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnREcm9wT3BlcmF0aW9uO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBwYW5lRWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSBvcmllbnRhdGlvbjogT3JpZW50YXRpb24gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBib3VuZHM6IEJvdW5kaW5nUmVjdCB8IHVuZGVmaW5lZCxcblx0XHRwcm90ZWN0ZWQgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbixcblx0XHR0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHRoZW1lU2VydmljZSk7XG5cdFx0dGhpcy5jbGVhbnVwT3ZlcmxheVNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuZGlzcG9zZSgpLCAzMDApKTtcblxuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdH1cblxuXHRnZXQgZGlzcG9zZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fZGlzcG9zZWQ7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZSgpOiB2b2lkIHtcblxuXHRcdC8vIENvbnRhaW5lclxuXHRcdHRoaXMuY29udGFpbmVyID0gJCgnZGl2JywgeyBpZDogVmlld1BhbmVEcm9wT3ZlcmxheS5PVkVSTEFZX0lEIH0pO1xuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLnRvcCA9ICcwcHgnO1xuXG5cdFx0Ly8gUGFyZW50XG5cdFx0dGhpcy5wYW5lRWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLmNvbnRhaW5lcik7XG5cdFx0dGhpcy5wYW5lRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdkcmFnZ2VkLW92ZXInKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5jb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLnBhbmVFbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWdnZWQtb3ZlcicpO1xuXHRcdH0pKTtcblxuXHRcdC8vIE92ZXJsYXlcblx0XHR0aGlzLm92ZXJsYXkgPSAkKCcucGFuZS1vdmVybGF5LWluZGljYXRvcicpO1xuXHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMub3ZlcmxheSk7XG5cblx0XHQvLyBPdmVybGF5IEV2ZW50IEhhbmRsaW5nXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXG5cdFx0Ly8gU3R5bGVzXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblxuXHRcdC8vIE92ZXJsYXkgZHJvcCBiYWNrZ3JvdW5kXG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHRoaXMuZ2V0Q29sb3IodGhpcy5sb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsID8gUEFORUxfU0VDVElPTl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQgOiBTSURFX0JBUl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQpIHx8ICcnO1xuXG5cdFx0Ly8gT3ZlcmxheSBjb250cmFzdCBib3JkZXIgKGlmIGFueSlcblx0XHRjb25zdCBhY3RpdmVDb250cmFzdEJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihhY3RpdmVDb250cmFzdEJvcmRlcik7XG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLm91dGxpbmVDb2xvciA9IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IgfHwgJyc7XG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLm91dGxpbmVPZmZzZXQgPSBhY3RpdmVDb250cmFzdEJvcmRlckNvbG9yID8gJy0ycHgnIDogJyc7XG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLm91dGxpbmVTdHlsZSA9IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IgPyAnZGFzaGVkJyA6ICcnO1xuXHRcdHRoaXMub3ZlcmxheS5zdHlsZS5vdXRsaW5lV2lkdGggPSBhY3RpdmVDb250cmFzdEJvcmRlckNvbG9yID8gJzJweCcgOiAnJztcblxuXHRcdHRoaXMub3ZlcmxheS5zdHlsZS5ib3JkZXJDb2xvciA9IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IgfHwgJyc7XG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLmJvcmRlclN0eWxlID0gJ3NvbGlkJztcblx0XHR0aGlzLm92ZXJsYXkuc3R5bGUuYm9yZGVyV2lkdGggPSAnMHB4Jztcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IERyYWdBbmREcm9wT2JzZXJ2ZXIodGhpcy5jb250YWluZXIsIHtcblx0XHRcdG9uRHJhZ092ZXI6IGUgPT4ge1xuXG5cdFx0XHRcdC8vIFBvc2l0aW9uIG92ZXJsYXlcblx0XHRcdFx0dGhpcy5wb3NpdGlvbk92ZXJsYXkoZS5vZmZzZXRYLCBlLm9mZnNldFkpO1xuXG5cdFx0XHRcdC8vIE1ha2Ugc3VyZSB0byBzdG9wIGFueSBydW5uaW5nIGNsZWFudXAgc2NoZWR1bGVyIHRvIHJlbW92ZSB0aGUgb3ZlcmxheVxuXHRcdFx0XHRpZiAodGhpcy5jbGVhbnVwT3ZlcmxheVNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5jbGVhbnVwT3ZlcmxheVNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblxuXHRcdFx0b25EcmFnTGVhdmU6IGUgPT4gdGhpcy5kaXNwb3NlKCksXG5cdFx0XHRvbkRyYWdFbmQ6IGUgPT4gdGhpcy5kaXNwb3NlKCksXG5cblx0XHRcdG9uRHJvcDogZSA9PiB7XG5cdFx0XHRcdC8vIERpc3Bvc2Ugb3ZlcmxheVxuXHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9PVkVSLCAoKSA9PiB7XG5cdFx0XHQvLyBVbmRlciBzb21lIGNpcmN1bXN0YW5jZXMgd2UgaGF2ZSBzZWVuIHJlcG9ydHMgd2hlcmUgdGhlIGRyb3Agb3ZlcmxheSBpcyBub3QgYmVpbmdcblx0XHRcdC8vIGNsZWFuZWQgdXAgYW5kIGFzIHN1Y2ggdGhlIGVkaXRvciBhcmVhIHJlbWFpbnMgdW5kZXIgdGhlIG92ZXJsYXkgc28gdGhhdCB5b3UgY2Fubm90XG5cdFx0XHQvLyB0eXBlIGludG8gdGhlIGVkaXRvciBhbnltb3JlLiBUaGlzIHNlZW1zIHJlbGF0ZWQgdG8gdXNpbmcgVk1zIGFuZCBETkQgdmlhIGhvc3QgYW5kXG5cdFx0XHQvLyBndWVzdCBPUywgdGhvdWdoIHNvbWUgdXNlcnMgYWxzbyBzYXcgaXQgd2l0aG91dCBWTXMuXG5cdFx0XHQvLyBUbyBwcm90ZWN0IGFnYWluc3QgdGhpcyBpc3N1ZSB3ZSBhbHdheXMgZGVzdHJveSB0aGUgb3ZlcmxheSBhcyBzb29uIGFzIHdlIGRldGVjdCBhXG5cdFx0XHQvLyBtb3VzZSBldmVudCBvdmVyIGl0LiBUaGUgZGVsYXkgaXMgdXNlZCB0byBndWFyYW50ZWUgd2UgYXJlIG5vdCBpbnRlcmZlcmluZyB3aXRoIHRoZVxuXHRcdFx0Ly8gYWN0dWFsIERST1AgZXZlbnQgdGhhdCBjYW4gYWxzbyB0cmlnZ2VyIGEgbW91c2Ugb3ZlciBldmVudC5cblx0XHRcdGlmICghdGhpcy5jbGVhbnVwT3ZlcmxheVNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHRoaXMuY2xlYW51cE92ZXJsYXlTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHBvc2l0aW9uT3ZlcmxheShtb3VzZVBvc1g6IG51bWJlciwgbW91c2VQb3NZOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBwYW5lV2lkdGggPSB0aGlzLnBhbmVFbGVtZW50LmNsaWVudFdpZHRoO1xuXHRcdGNvbnN0IHBhbmVIZWlnaHQgPSB0aGlzLnBhbmVFbGVtZW50LmNsaWVudEhlaWdodDtcblxuXHRcdGNvbnN0IHNwbGl0V2lkdGhUaHJlc2hvbGQgPSBwYW5lV2lkdGggLyAyO1xuXHRcdGNvbnN0IHNwbGl0SGVpZ2h0VGhyZXNob2xkID0gcGFuZUhlaWdodCAvIDI7XG5cblx0XHRsZXQgZHJvcERpcmVjdGlvbjogRHJvcERpcmVjdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRcdGlmICh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCkge1xuXHRcdFx0aWYgKG1vdXNlUG9zWSA8IHNwbGl0SGVpZ2h0VGhyZXNob2xkKSB7XG5cdFx0XHRcdGRyb3BEaXJlY3Rpb24gPSBEcm9wRGlyZWN0aW9uLlVQO1xuXHRcdFx0fSBlbHNlIGlmIChtb3VzZVBvc1kgPj0gc3BsaXRIZWlnaHRUaHJlc2hvbGQpIHtcblx0XHRcdFx0ZHJvcERpcmVjdGlvbiA9IERyb3BEaXJlY3Rpb24uRE9XTjtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwpIHtcblx0XHRcdGlmIChtb3VzZVBvc1ggPCBzcGxpdFdpZHRoVGhyZXNob2xkKSB7XG5cdFx0XHRcdGRyb3BEaXJlY3Rpb24gPSBEcm9wRGlyZWN0aW9uLkxFRlQ7XG5cdFx0XHR9IGVsc2UgaWYgKG1vdXNlUG9zWCA+PSBzcGxpdFdpZHRoVGhyZXNob2xkKSB7XG5cdFx0XHRcdGRyb3BEaXJlY3Rpb24gPSBEcm9wRGlyZWN0aW9uLlJJR0hUO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIERyYXcgb3ZlcmxheSBiYXNlZCBvbiBzcGxpdCBkaXJlY3Rpb25cblx0XHRzd2l0Y2ggKGRyb3BEaXJlY3Rpb24pIHtcblx0XHRcdGNhc2UgRHJvcERpcmVjdGlvbi5VUDpcblx0XHRcdFx0dGhpcy5kb1Bvc2l0aW9uT3ZlcmxheSh7IHRvcDogJzAnLCBsZWZ0OiAnMCcsIHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzUwJScgfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBEcm9wRGlyZWN0aW9uLkRPV046XG5cdFx0XHRcdHRoaXMuZG9Qb3NpdGlvbk92ZXJsYXkoeyBib3R0b206ICcwJywgbGVmdDogJzAnLCB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICc1MCUnIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRHJvcERpcmVjdGlvbi5MRUZUOlxuXHRcdFx0XHR0aGlzLmRvUG9zaXRpb25PdmVybGF5KHsgdG9wOiAnMCcsIGxlZnQ6ICcwJywgd2lkdGg6ICc1MCUnLCBoZWlnaHQ6ICcxMDAlJyB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIERyb3BEaXJlY3Rpb24uUklHSFQ6XG5cdFx0XHRcdHRoaXMuZG9Qb3NpdGlvbk92ZXJsYXkoeyB0b3A6ICcwJywgcmlnaHQ6ICcwJywgd2lkdGg6ICc1MCUnLCBoZWlnaHQ6ICcxMDAlJyB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdC8vIGNvbnN0IHRvcCA9IHRoaXMuYm91bmRzPy50b3AgfHwgMDtcblx0XHRcdFx0Ly8gY29uc3QgbGVmdCA9IHRoaXMuYm91bmRzPy5ib3R0b20gfHwgMDtcblxuXHRcdFx0XHRsZXQgdG9wID0gJzAnO1xuXHRcdFx0XHRsZXQgbGVmdCA9ICcwJztcblx0XHRcdFx0bGV0IHdpZHRoID0gJzEwMCUnO1xuXHRcdFx0XHRsZXQgaGVpZ2h0ID0gJzEwMCUnO1xuXHRcdFx0XHRpZiAodGhpcy5ib3VuZHMpIHtcblx0XHRcdFx0XHRjb25zdCBib3VuZGluZ1JlY3QgPSB0aGlzLmNvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0XHR0b3AgPSBgJHt0aGlzLmJvdW5kcy50b3AgLSBib3VuZGluZ1JlY3QudG9wfXB4YDtcblx0XHRcdFx0XHRsZWZ0ID0gYCR7dGhpcy5ib3VuZHMubGVmdCAtIGJvdW5kaW5nUmVjdC5sZWZ0fXB4YDtcblx0XHRcdFx0XHRoZWlnaHQgPSBgJHt0aGlzLmJvdW5kcy5ib3R0b20gLSB0aGlzLmJvdW5kcy50b3B9cHhgO1xuXHRcdFx0XHRcdHdpZHRoID0gYCR7dGhpcy5ib3VuZHMucmlnaHQgLSB0aGlzLmJvdW5kcy5sZWZ0fXB4YDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuZG9Qb3NpdGlvbk92ZXJsYXkoeyB0b3AsIGxlZnQsIHdpZHRoLCBoZWlnaHQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCAmJiBwYW5lSGVpZ2h0IDw9IDI1KSB8fFxuXHRcdFx0KHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgJiYgcGFuZVdpZHRoIDw9IDI1KSkge1xuXHRcdFx0dGhpcy5kb1VwZGF0ZU92ZXJsYXlCb3JkZXIoZHJvcERpcmVjdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZG9VcGRhdGVPdmVybGF5Qm9yZGVyKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFrZSBzdXJlIHRoZSBvdmVybGF5IGlzIHZpc2libGUgbm93XG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLm9wYWNpdHkgPSAnMSc7XG5cblx0XHQvLyBFbmFibGUgdHJhbnNpdGlvbiBhZnRlciBhIHRpbWVvdXQgdG8gcHJldmVudCBpbml0aWFsIGFuaW1hdGlvblxuXHRcdHNldFRpbWVvdXQoKCkgPT4gdGhpcy5vdmVybGF5LmNsYXNzTGlzdC5hZGQoJ292ZXJsYXktbW92ZS10cmFuc2l0aW9uJyksIDApO1xuXG5cdFx0Ly8gUmVtZW1iZXIgYXMgY3VycmVudCBzcGxpdCBkaXJlY3Rpb25cblx0XHR0aGlzLl9jdXJyZW50RHJvcE9wZXJhdGlvbiA9IGRyb3BEaXJlY3Rpb247XG5cdH1cblxuXHRwcml2YXRlIGRvVXBkYXRlT3ZlcmxheUJvcmRlcihkaXJlY3Rpb246IERyb3BEaXJlY3Rpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLm92ZXJsYXkuc3R5bGUuYm9yZGVyVG9wV2lkdGggPSBkaXJlY3Rpb24gPT09IERyb3BEaXJlY3Rpb24uVVAgPyAnMnB4JyA6ICcwcHgnO1xuXHRcdHRoaXMub3ZlcmxheS5zdHlsZS5ib3JkZXJMZWZ0V2lkdGggPSBkaXJlY3Rpb24gPT09IERyb3BEaXJlY3Rpb24uTEVGVCA/ICcycHgnIDogJzBweCc7XG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLmJvcmRlckJvdHRvbVdpZHRoID0gZGlyZWN0aW9uID09PSBEcm9wRGlyZWN0aW9uLkRPV04gPyAnMnB4JyA6ICcwcHgnO1xuXHRcdHRoaXMub3ZlcmxheS5zdHlsZS5ib3JkZXJSaWdodFdpZHRoID0gZGlyZWN0aW9uID09PSBEcm9wRGlyZWN0aW9uLlJJR0hUID8gJzJweCcgOiAnMHB4Jztcblx0fVxuXG5cdHByaXZhdGUgZG9Qb3NpdGlvbk92ZXJsYXkob3B0aW9uczogeyB0b3A/OiBzdHJpbmc7IGJvdHRvbT86IHN0cmluZzsgbGVmdD86IHN0cmluZzsgcmlnaHQ/OiBzdHJpbmc7IHdpZHRoOiBzdHJpbmc7IGhlaWdodDogc3RyaW5nIH0pOiB2b2lkIHtcblxuXHRcdC8vIENvbnRhaW5lclxuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblxuXHRcdC8vIE92ZXJsYXlcblx0XHR0aGlzLm92ZXJsYXkuc3R5bGUudG9wID0gb3B0aW9ucy50b3AgfHwgJyc7XG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLmxlZnQgPSBvcHRpb25zLmxlZnQgfHwgJyc7XG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLmJvdHRvbSA9IG9wdGlvbnMuYm90dG9tIHx8ICcnO1xuXHRcdHRoaXMub3ZlcmxheS5zdHlsZS5yaWdodCA9IG9wdGlvbnMucmlnaHQgfHwgJyc7XG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLndpZHRoID0gb3B0aW9ucy53aWR0aDtcblx0XHR0aGlzLm92ZXJsYXkuc3R5bGUuaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQ7XG5cdH1cblxuXG5cdGNvbnRhaW5zKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGVsZW1lbnQgPT09IHRoaXMuY29udGFpbmVyIHx8IGVsZW1lbnQgPT09IHRoaXMub3ZlcmxheTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBWaWV3UGFuZUNvbnRhaW5lcjxNZW1lbnRvVHlwZSBleHRlbmRzIG9iamVjdCA9IG9iamVjdD4gZXh0ZW5kcyBDb21wb25lbnQ8TWVtZW50b1R5cGU+IGltcGxlbWVudHMgSVZpZXdQYW5lQ29udGFpbmVyIHtcblxuXHRyZWFkb25seSB2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyO1xuXHRwcml2YXRlIGxhc3RGb2N1c2VkUGFuZTogVmlld1BhbmUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbGFzdE1lcmdlZENvbGxhcHNlZFBhbmU6IFZpZXdQYW5lIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHBhbmVJdGVtczogSVZpZXdQYW5lSXRlbVtdID0gW107XG5cdHByaXZhdGUgcGFuZXZpZXc/OiBQYW5lVmlldztcblxuXHRwcml2YXRlIHZpc2libGU6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIGFyZUV4dGVuc2lvbnNSZWFkeTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgZGlkTGF5b3V0ID0gZmFsc2U7XG5cdHByaXZhdGUgZGltZW5zaW9uOiBEaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2JvdW5kYXJ5U2FzaGVzOiBJQm91bmRhcnlTYXNoZXMgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSB2aXNpYmxlVmlld3NDb3VudEZyb21DYWNoZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHZpc2libGVWaWV3c1N0b3JhZ2VJZDogc3RyaW5nO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdmlld0NvbnRhaW5lck1vZGVsOiBJVmlld0NvbnRhaW5lck1vZGVsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uVGl0bGVBcmVhVXBkYXRlOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uVGl0bGVBcmVhVXBkYXRlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uVGl0bGVBcmVhVXBkYXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBZGRWaWV3cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElWaWV3W10+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFkZFZpZXdzID0gdGhpcy5fb25EaWRBZGRWaWV3cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZVZpZXdzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVZpZXdbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlVmlld3MgPSB0aGlzLl9vbkRpZFJlbW92ZVZpZXdzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlld1Zpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVmlldz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlld1Zpc2liaWxpdHkgPSB0aGlzLl9vbkRpZENoYW5nZVZpZXdWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9jdXNWaWV3ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVZpZXc+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzVmlldyA9IHRoaXMuX29uRGlkRm9jdXNWaWV3LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQmx1clZpZXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVmlldz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQmx1clZpZXcgPSB0aGlzLl9vbkRpZEJsdXJWaWV3LmV2ZW50O1xuXG5cdGdldCBvbkRpZFNhc2hDaGFuZ2UoKTogRXZlbnQ8bnVtYmVyPiB7XG5cdFx0cmV0dXJuIGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMucGFuZXZpZXcpLm9uRGlkU2FzaENoYW5nZTtcblx0fVxuXG5cdGdldCBwYW5lcygpOiBWaWV3UGFuZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5wYW5lSXRlbXMubWFwKGkgPT4gaS5wYW5lKTtcblx0fVxuXG5cdGdldCB2aWV3cygpOiBJVmlld1tdIHtcblx0XHRyZXR1cm4gdGhpcy5wYW5lcztcblx0fVxuXG5cdGdldCBsZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5wYW5lSXRlbXMubGVuZ3RoO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWVudUFjdGlvbnM/OiBWaWV3Q29udGFpbmVyTWVudUFjdGlvbnM7XG5cdGdldCBtZW51QWN0aW9ucygpOiBWaWV3Q29udGFpbmVyTWVudUFjdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tZW51QWN0aW9ucztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBvcHRpb25zOiBJVmlld1BhbmVDb250YWluZXJPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJvdGVjdGVkIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByb3RlY3RlZCBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByb3RlY3RlZCB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJvdGVjdGVkIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByb3RlY3RlZCBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJvdGVjdGVkIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2UgcHJvdGVjdGVkIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdHN1cGVyKGlkLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKGlkKTtcblx0XHRpZiAoIWNvbnRhaW5lcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgZmluZCBjb250YWluZXInKTtcblx0XHR9XG5cblxuXHRcdHRoaXMudmlld0NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHR0aGlzLnZpc2libGVWaWV3c1N0b3JhZ2VJZCA9IGAke2lkfS5udW1iZXJPZlZpc2libGVWaWV3c2A7XG5cdFx0dGhpcy52aXNpYmxlVmlld3NDb3VudEZyb21DYWNoZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKHRoaXMudmlzaWJsZVZpZXdzU3RvcmFnZUlkLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMudmlld0NvbnRhaW5lck1vZGVsID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcik7XG5cdH1cblxuXHRjcmVhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLm9wdGlvbnMgYXMgSVBhbmVWaWV3T3B0aW9ucztcblx0XHRvcHRpb25zLm9yaWVudGF0aW9uID0gdGhpcy5vcmllbnRhdGlvbjtcblx0XHR0aGlzLnBhbmV2aWV3ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFBhbmVWaWV3KHBhcmVudCwgdGhpcy5vcHRpb25zKSk7XG5cblx0XHRpZiAodGhpcy5fYm91bmRhcnlTYXNoZXMpIHtcblx0XHRcdHRoaXMucGFuZXZpZXcuc2V0Qm91bmRhcnlTYXNoZXModGhpcy5fYm91bmRhcnlTYXNoZXMpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucGFuZXZpZXcub25EaWREcm9wKCh7IGZyb20sIHRvIH0pID0+IHRoaXMubW92ZVBhbmUoZnJvbSBhcyBWaWV3UGFuZSwgdG8gYXMgVmlld1BhbmUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wYW5ldmlldy5vbkRpZFNjcm9sbChfID0+IHRoaXMub25EaWRTY3JvbGxQYW5lKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnBhbmV2aWV3Lm9uRGlkU2FzaFJlc2V0KChpbmRleCkgPT4gdGhpcy5vbkRpZFNhc2hSZXNldChpbmRleCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIocGFyZW50LCBFdmVudFR5cGUuQ09OVEVYVF9NRU5VLCAoZTogTW91c2VFdmVudCkgPT4gdGhpcy5zaG93Q29udGV4dE1lbnUobmV3IFN0YW5kYXJkTW91c2VFdmVudChnZXRXaW5kb3cocGFyZW50KSwgZSkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoR2VzdHVyZS5hZGRUYXJnZXQocGFyZW50KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBhcmVudCwgVG91Y2hFdmVudFR5cGUuQ29udGV4dG1lbnUsIChlOiBNb3VzZUV2ZW50KSA9PiB0aGlzLnNob3dDb250ZXh0TWVudShuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyhwYXJlbnQpLCBlKSkpKTtcblxuXHRcdHRoaXMuX21lbnVBY3Rpb25zID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWaWV3Q29udGFpbmVyTWVudUFjdGlvbnMsIHRoaXMucGFuZXZpZXcuZWxlbWVudCwgdGhpcy52aWV3Q29udGFpbmVyLCB1bmRlZmluZWQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9tZW51QWN0aW9ucy5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZVRpdGxlQXJlYSgpKSk7XG5cblx0XHRsZXQgb3ZlcmxheTogVmlld1BhbmVEcm9wT3ZlcmxheSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBnZXRPdmVybGF5Qm91bmRzOiAoKSA9PiBCb3VuZGluZ1JlY3QgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBmdWxsU2l6ZSA9IHBhcmVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdGNvbnN0IGxhc3RQYW5lID0gdGhpcy5wYW5lc1t0aGlzLnBhbmVzLmxlbmd0aCAtIDFdLmVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRjb25zdCB0b3AgPSB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCA/IGxhc3RQYW5lLmJvdHRvbSA6IGZ1bGxTaXplLnRvcDtcblx0XHRcdGNvbnN0IGxlZnQgPSB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gbGFzdFBhbmUucmlnaHQgOiBmdWxsU2l6ZS5sZWZ0O1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0b3AsXG5cdFx0XHRcdGJvdHRvbTogZnVsbFNpemUuYm90dG9tLFxuXHRcdFx0XHRsZWZ0LFxuXHRcdFx0XHRyaWdodDogZnVsbFNpemUucmlnaHQsXG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRjb25zdCBpbkJvdW5kcyA9IChib3VuZHM6IEJvdW5kaW5nUmVjdCwgcG9zOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pID0+IHtcblx0XHRcdHJldHVybiBwb3MueCA+PSBib3VuZHMubGVmdCAmJiBwb3MueCA8PSBib3VuZHMucmlnaHQgJiYgcG9zLnkgPj0gYm91bmRzLnRvcCAmJiBwb3MueSA8PSBib3VuZHMuYm90dG9tO1xuXHRcdH07XG5cblxuXHRcdGxldCBib3VuZHM6IEJvdW5kaW5nUmVjdDtcblxuXHRcdGlmICh0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5jYW5Nb3ZlVmlld3MoKSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlci5JTlNUQU5DRS5yZWdpc3RlclRhcmdldChwYXJlbnQsIHtcblx0XHRcdFx0b25EcmFnRW50ZXI6IChlKSA9PiB7XG5cdFx0XHRcdFx0Ym91bmRzID0gZ2V0T3ZlcmxheUJvdW5kcygpO1xuXHRcdFx0XHRcdGlmIChvdmVybGF5Py5kaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0b3ZlcmxheSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIW92ZXJsYXkgJiYgaW5Cb3VuZHMoYm91bmRzLCBlLmV2ZW50RGF0YSkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGRyb3BEYXRhID0gZS5kcmFnQW5kRHJvcERhdGEuZ2V0RGF0YSgpO1xuXHRcdFx0XHRcdFx0aWYgKGRyb3BEYXRhLnR5cGUgPT09ICd2aWV3Jykge1xuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9sZFZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQoZHJvcERhdGEuaWQpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCB2aWV3RGVzY3JpcHRvciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdEZXNjcmlwdG9yQnlJZChkcm9wRGF0YS5pZCk7XG5cblx0XHRcdFx0XHRcdFx0aWYgKG9sZFZpZXdDb250YWluZXIgIT09IHRoaXMudmlld0NvbnRhaW5lciAmJiAoIXZpZXdEZXNjcmlwdG9yIHx8ICF2aWV3RGVzY3JpcHRvci5jYW5Nb3ZlVmlldyB8fCB0aGlzLnZpZXdDb250YWluZXIucmVqZWN0QWRkZWRWaWV3cykpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRvdmVybGF5ID0gbmV3IFZpZXdQYW5lRHJvcE92ZXJsYXkocGFyZW50LCB1bmRlZmluZWQsIGJvdW5kcywgdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHRoaXMudmlld0NvbnRhaW5lcikhLCB0aGlzLnRoZW1lU2VydmljZSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmIChkcm9wRGF0YS50eXBlID09PSAnY29tcG9zaXRlJyAmJiBkcm9wRGF0YS5pZCAhPT0gdGhpcy52aWV3Q29udGFpbmVyLmlkKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKGRyb3BEYXRhLmlkKSE7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHZpZXdzVG9Nb3ZlID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcikuYWxsVmlld0Rlc2NyaXB0b3JzO1xuXG5cdFx0XHRcdFx0XHRcdGlmICghdmlld3NUb01vdmUuc29tZSh2ID0+ICF2LmNhbk1vdmVWaWV3KSAmJiB2aWV3c1RvTW92ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0b3ZlcmxheSA9IG5ldyBWaWV3UGFuZURyb3BPdmVybGF5KHBhcmVudCwgdW5kZWZpbmVkLCBib3VuZHMsIHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJMb2NhdGlvbih0aGlzLnZpZXdDb250YWluZXIpISwgdGhpcy50aGVtZVNlcnZpY2UpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkRyYWdPdmVyOiAoZSkgPT4ge1xuXHRcdFx0XHRcdGlmIChvdmVybGF5Py5kaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0b3ZlcmxheSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAob3ZlcmxheSAmJiAhaW5Cb3VuZHMoYm91bmRzLCBlLmV2ZW50RGF0YSkpIHtcblx0XHRcdFx0XHRcdG92ZXJsYXkuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0b3ZlcmxheSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoaW5Cb3VuZHMoYm91bmRzLCBlLmV2ZW50RGF0YSkpIHtcblx0XHRcdFx0XHRcdHRvZ2dsZURyb3BFZmZlY3QoZS5ldmVudERhdGEuZGF0YVRyYW5zZmVyLCAnbW92ZScsIG92ZXJsYXkgIT09IHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkRyYWdMZWF2ZTogKGUpID0+IHtcblx0XHRcdFx0XHRvdmVybGF5Py5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0b3ZlcmxheSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25Ecm9wOiAoZSkgPT4ge1xuXHRcdFx0XHRcdGlmIChvdmVybGF5KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkcm9wRGF0YSA9IGUuZHJhZ0FuZERyb3BEYXRhLmdldERhdGEoKTtcblx0XHRcdFx0XHRcdGNvbnN0IHZpZXdzVG9Nb3ZlOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtdO1xuXG5cdFx0XHRcdFx0XHRpZiAoZHJvcERhdGEudHlwZSA9PT0gJ2NvbXBvc2l0ZScgJiYgZHJvcERhdGEuaWQgIT09IHRoaXMudmlld0NvbnRhaW5lci5pZCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChkcm9wRGF0YS5pZCkhO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBhbGxWaWV3cyA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbChjb250YWluZXIpLmFsbFZpZXdEZXNjcmlwdG9ycztcblx0XHRcdFx0XHRcdFx0aWYgKCFhbGxWaWV3cy5zb21lKHYgPT4gIXYuY2FuTW92ZVZpZXcpKSB7XG5cdFx0XHRcdFx0XHRcdFx0dmlld3NUb01vdmUucHVzaCguLi5hbGxWaWV3cyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZHJvcERhdGEudHlwZSA9PT0gJ3ZpZXcnKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9sZFZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQoZHJvcERhdGEuaWQpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCB2aWV3RGVzY3JpcHRvciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdEZXNjcmlwdG9yQnlJZChkcm9wRGF0YS5pZCk7XG5cdFx0XHRcdFx0XHRcdGlmIChvbGRWaWV3Q29udGFpbmVyICE9PSB0aGlzLnZpZXdDb250YWluZXIgJiYgdmlld0Rlc2NyaXB0b3I/LmNhbk1vdmVWaWV3KSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdzVG9Db250YWluZXIoW3ZpZXdEZXNjcmlwdG9yXSwgdGhpcy52aWV3Q29udGFpbmVyLCB1bmRlZmluZWQsICdkbmQnKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBwYW5lQ291bnQgPSB0aGlzLnBhbmVzLmxlbmd0aDtcblxuXHRcdFx0XHRcdFx0aWYgKHZpZXdzVG9Nb3ZlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdzVG9Db250YWluZXIodmlld3NUb01vdmUsIHRoaXMudmlld0NvbnRhaW5lciwgdW5kZWZpbmVkLCAnZG5kJyk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmIChwYW5lQ291bnQgPiAwKSB7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgdmlldyBvZiB2aWV3c1RvTW92ZSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHBhbmVUb01vdmUgPSB0aGlzLnBhbmVzLmZpbmQocCA9PiBwLmlkID09PSB2aWV3LmlkKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAocGFuZVRvTW92ZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5tb3ZlUGFuZShwYW5lVG9Nb3ZlLCB0aGlzLnBhbmVzW3RoaXMucGFuZXMubGVuZ3RoIC0gMV0pO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdG92ZXJsYXk/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRvdmVybGF5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZFNhc2hDaGFuZ2UoKCkgPT4gdGhpcy5zYXZlVmlld1NpemVzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdDb250YWluZXJNb2RlbC5vbkRpZEFkZFZpc2libGVWaWV3RGVzY3JpcHRvcnMoYWRkZWQgPT4gdGhpcy5vbkRpZEFkZFZpZXdEZXNjcmlwdG9ycyhhZGRlZCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdDb250YWluZXJNb2RlbC5vbkRpZFJlbW92ZVZpc2libGVWaWV3RGVzY3JpcHRvcnMocmVtb3ZlZCA9PiB0aGlzLm9uRGlkUmVtb3ZlVmlld0Rlc2NyaXB0b3JzKHJlbW92ZWQpKSk7XG5cdFx0Y29uc3QgYWRkZWRWaWV3czogSUFkZGVkVmlld0Rlc2NyaXB0b3JSZWZbXSA9IHRoaXMudmlld0NvbnRhaW5lck1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnMubWFwKCh2aWV3RGVzY3JpcHRvciwgaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IHNpemUgPSB0aGlzLnZpZXdDb250YWluZXJNb2RlbC5nZXRTaXplKHZpZXdEZXNjcmlwdG9yLmlkKTtcblx0XHRcdGNvbnN0IGNvbGxhcHNlZCA9IHRoaXMudmlld0NvbnRhaW5lck1vZGVsLmlzQ29sbGFwc2VkKHZpZXdEZXNjcmlwdG9yLmlkKTtcblx0XHRcdHJldHVybiAoeyB2aWV3RGVzY3JpcHRvciwgaW5kZXgsIHNpemUsIGNvbGxhcHNlZCB9KTtcblx0XHR9KTtcblx0XHRpZiAoYWRkZWRWaWV3cy5sZW5ndGgpIHtcblx0XHRcdHRoaXMub25EaWRBZGRWaWV3RGVzY3JpcHRvcnMoYWRkZWRWaWV3cyk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGhlYWRlcnMgYWZ0ZXIgYW5kIHRpdGxlIGNvbnRyaWJ1dGVkIHZpZXdzIGFmdGVyIGF2YWlsYWJsZSwgc2luY2Ugd2UgcmVhZCBmcm9tIGNhY2hlIGluIHRoZSBiZWdpbm5pbmcgdG8ga25vdyBpZiB0aGUgdmlld2xldCBoYXMgc2luZ2xlIHZpZXcgb3Igbm90LiBSZWYgIzI5NjA5XG5cdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0dGhpcy5hcmVFeHRlbnNpb25zUmVhZHkgPSB0cnVlO1xuXHRcdFx0aWYgKHRoaXMucGFuZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlVGl0bGVBcmVhKCk7XG5cdFx0XHRcdHRoaXMudXBkYXRlVmlld0hlYWRlcnMoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVWaWV3SGVhZGVycygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdDb250YWluZXJNb2RlbC5vbkRpZENoYW5nZUFjdGl2ZVZpZXdEZXNjcmlwdG9ycygoKSA9PiB0aGlzLl9vblRpdGxlQXJlYVVwZGF0ZS5maXJlKCkpKTtcblx0fVxuXG5cdGdldFRpdGxlKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgY29udGFpbmVyVGl0bGUgPSB0aGlzLnZpZXdDb250YWluZXJNb2RlbC50aXRsZTtcblxuXHRcdGlmICh0aGlzLmlzVmlld01lcmdlZFdpdGhDb250YWluZXIoKSkge1xuXHRcdFx0Y29uc3Qgc2luZ2xlVmlld1BhbmVDb250YWluZXJUaXRsZSA9IHRoaXMucGFuZUl0ZW1zWzBdLnBhbmUuc2luZ2xlVmlld1BhbmVDb250YWluZXJUaXRsZTtcblx0XHRcdGlmIChzaW5nbGVWaWV3UGFuZUNvbnRhaW5lclRpdGxlKSB7XG5cdFx0XHRcdHJldHVybiBzaW5nbGVWaWV3UGFuZUNvbnRhaW5lclRpdGxlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwYW5lSXRlbVRpdGxlID0gdGhpcy5wYW5lSXRlbXNbMF0ucGFuZS50aXRsZTtcblx0XHRcdGlmIChjb250YWluZXJUaXRsZSA9PT0gcGFuZUl0ZW1UaXRsZSkge1xuXHRcdFx0XHRyZXR1cm4gcGFuZUl0ZW1UaXRsZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHBhbmVJdGVtVGl0bGUgPyBgJHtjb250YWluZXJUaXRsZX06ICR7cGFuZUl0ZW1UaXRsZX1gIDogY29udGFpbmVyVGl0bGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbnRhaW5lclRpdGxlO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93Q29udGV4dE1lbnUoZXZlbnQ6IFN0YW5kYXJkTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcGFuZUl0ZW0gb2YgdGhpcy5wYW5lSXRlbXMpIHtcblx0XHRcdC8vIERvIG5vdCBzaG93IGNvbnRleHQgbWVudSBpZiB0YXJnZXQgaXMgY29taW5nIGZyb20gaW5zaWRlIHBhbmUgdmlld3Ncblx0XHRcdGlmIChpc0FuY2VzdG9yKGV2ZW50LnRhcmdldCwgcGFuZUl0ZW0ucGFuZS5lbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGV2ZW50LFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gdGhpcy5tZW51QWN0aW9ucz8uZ2V0Q29udGV4dE1lbnVBY3Rpb25zKCkgPz8gW11cblx0XHR9KTtcblx0fVxuXG5cdGdldEFjdGlvbnNDb250ZXh0KCk6IHVua25vd24ge1xuXHRcdGlmICh0aGlzLmlzVmlld01lcmdlZFdpdGhDb250YWluZXIoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucGFuZXNbMF0uZ2V0QWN0aW9uc0NvbnRleHQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldEFjdGlvblZpZXdJdGVtKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMpOiBJQWN0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmlzVmlld01lcmdlZFdpdGhDb250YWluZXIoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucGFuZUl0ZW1zWzBdLnBhbmUuY3JlYXRlQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBvcHRpb25zKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNyZWF0ZUFjdGlvblZpZXdJdGVtKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHRsZXQgcGFuZVRvRm9jdXM6IFZpZXdQYW5lIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLmxhc3RGb2N1c2VkUGFuZSkge1xuXHRcdFx0cGFuZVRvRm9jdXMgPSB0aGlzLmxhc3RGb2N1c2VkUGFuZTtcblx0XHR9IGVsc2UgaWYgKHRoaXMucGFuZUl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvciAoY29uc3QgeyBwYW5lIH0gb2YgdGhpcy5wYW5lSXRlbXMpIHtcblx0XHRcdFx0aWYgKHBhbmUuaXNFeHBhbmRlZCgpKSB7XG5cdFx0XHRcdFx0cGFuZVRvRm9jdXMgPSBwYW5lO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChwYW5lVG9Gb2N1cykge1xuXHRcdFx0cGFuZVRvRm9jdXMuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldCBvcmllbnRhdGlvbigpOiBPcmllbnRhdGlvbiB7XG5cdFx0c3dpdGNoICh0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odGhpcy52aWV3Q29udGFpbmVyKSkge1xuXHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcjpcblx0XHRcdGNhc2UgVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcjpcblx0XHRcdFx0cmV0dXJuIE9yaWVudGF0aW9uLlZFUlRJQ0FMO1xuXHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWw6IHtcblx0XHRcdFx0cmV0dXJuIGlzSG9yaXpvbnRhbCh0aGlzLmxheW91dFNlcnZpY2UuZ2V0UGFuZWxQb3NpdGlvbigpKSA/IE9yaWVudGF0aW9uLkhPUklaT05UQUwgOiBPcmllbnRhdGlvbi5WRVJUSUNBTDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gT3JpZW50YXRpb24uVkVSVElDQUw7XG5cdH1cblxuXHRsYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wYW5ldmlldykge1xuXHRcdFx0aWYgKHRoaXMucGFuZXZpZXcub3JpZW50YXRpb24gIT09IHRoaXMub3JpZW50YXRpb24pIHtcblx0XHRcdFx0dGhpcy5wYW5ldmlldy5mbGlwT3JpZW50YXRpb24oZGltZW5zaW9uLmhlaWdodCwgZGltZW5zaW9uLndpZHRoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSW4gTW9kZXJuIFVJIChmbG9hdGluZyBwYW5lbHMpIHJlc2VydmUgYSBzbWFsbCBib3R0b20gZ2FwIHNvIHRoZSBsYXN0XG5cdFx0XHQvLyBwYW5lIGRvZXMgbm90IHNpdCBmbHVzaCBhZ2FpbnN0IHRoZSBwYXJ0IGVkZ2UsIG1hdGNoaW5nIHRoZSA0cHhcblx0XHRcdC8vIGhvcml6b250YWwgbWFyZ2lucyBvbiB0aGUgcGFuZSBoZWFkZXJzLiBBZGQgMXB4IGZvciB0aGUgcGFydCdzIGJvdHRvbVxuXHRcdFx0Ly8gYm9yZGVyIHNvIHRoZSB2aXNpYmxlIGdhcCBsaW5lcyB1cCB3aXRoIHRoZSBob3Jpem9udGFsIG1hcmdpbnMuXG5cdFx0XHQvLyBFeGNlcHRpb246IHdoZW4gdGhlIHBhbmVsIGlzIGF0IHRoZSBUT1AsIHRoZSBib3R0b20gb2YgdGhlIHBhbmVsXG5cdFx0XHQvLyBmYWNlcyB0aGUgZWRpdG9yIGNhcmQuIEEgMXB4IGlubmVyIGdhcCBrZWVwcyB0aGUgcGFuZSBjb250ZW50IG9mZiB0aGVcblx0XHRcdC8vIGJvcmRlciwgd2hpbGUgdGhlIENTUyBpbnRlci1jYXJkIG1hcmdpbnMgKHBhbmVsIDRweCArIGVkaXRvciA0cHgpXG5cdFx0XHQvLyBwcm92aWRlIHRoZSByZW1haW5pbmcgc2VwYXJhdGlvbi4gVGhpcyB0b3RhbHMgMTBweCAoMSBpbm5lciArIDEgYm9yZGVyXG5cdFx0XHQvLyArIDQgKyA0KSwgbWF0Y2hpbmcgdGhlIGJvdHRvbSBwYW5lbCdzIGJvdHRvbS10by1zdGF0dXMtYmFyIGdhcFxuXHRcdFx0Ly8gKDUgaW5uZXIgKyAxIGJvcmRlciArIDQgQ1NTID0gMTBweCkgZm9yIHZpc3VhbCBjb25zaXN0ZW5jeS5cblx0XHRcdGNvbnN0IGJvdHRvbUdhcCA9ICF0aGlzLmxheW91dFNlcnZpY2UuaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKSA/IDBcblx0XHRcdFx0OiAodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHRoaXMudmlld0NvbnRhaW5lcikgPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbFxuXHRcdFx0XHRcdCYmIHRoaXMubGF5b3V0U2VydmljZS5nZXRQYW5lbFBvc2l0aW9uKCkgPT09IFBvc2l0aW9uLlRPUCkgPyAxXG5cdFx0XHRcdFx0OiBGTE9BVElOR19QQU5FTF9NQVJHSU4gKyAxO1xuXHRcdFx0dGhpcy5wYW5ldmlldy5sYXlvdXQoTWF0aC5tYXgoMCwgZGltZW5zaW9uLmhlaWdodCAtIGJvdHRvbUdhcCksIGRpbWVuc2lvbi53aWR0aCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cdFx0aWYgKHRoaXMuZGlkTGF5b3V0KSB7XG5cdFx0XHR0aGlzLnNhdmVWaWV3U2l6ZXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kaWRMYXlvdXQgPSB0cnVlO1xuXHRcdFx0dGhpcy5yZXN0b3JlVmlld1NpemVzKCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0Qm91bmRhcnlTYXNoZXMoc2FzaGVzOiBJQm91bmRhcnlTYXNoZXMpOiB2b2lkIHtcblx0XHR0aGlzLl9ib3VuZGFyeVNhc2hlcyA9IHNhc2hlcztcblx0XHR0aGlzLnBhbmV2aWV3Py5zZXRCb3VuZGFyeVNhc2hlcyhzYXNoZXMpO1xuXHR9XG5cblx0Z2V0T3B0aW1hbFdpZHRoKCk6IG51bWJlciB7XG5cdFx0Y29uc3QgYWRkaXRpb25hbE1hcmdpbiA9IDE2O1xuXHRcdGNvbnN0IG9wdGltYWxXaWR0aCA9IE1hdGgubWF4KC4uLnRoaXMucGFuZXMubWFwKHZpZXcgPT4gdmlldy5nZXRPcHRpbWFsV2lkdGgoKSB8fCAwKSk7XG5cdFx0cmV0dXJuIG9wdGltYWxXaWR0aCArIGFkZGl0aW9uYWxNYXJnaW47XG5cdH1cblxuXHRhZGRQYW5lcyhwYW5lczogeyBwYW5lOiBWaWV3UGFuZTsgc2l6ZTogbnVtYmVyOyBpbmRleD86IG51bWJlcjsgZGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfVtdKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2FzTWVyZ2VkID0gdGhpcy5pc1ZpZXdNZXJnZWRXaXRoQ29udGFpbmVyKCk7XG5cblx0XHRmb3IgKGNvbnN0IHsgcGFuZSwgc2l6ZSwgaW5kZXgsIGRpc3Bvc2FibGUgfSBvZiBwYW5lcykge1xuXHRcdFx0dGhpcy5hZGRQYW5lKHBhbmUsIHNpemUsIGRpc3Bvc2FibGUsIGluZGV4KTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVZpZXdIZWFkZXJzKCk7XG5cdFx0aWYgKHRoaXMuaXNWaWV3TWVyZ2VkV2l0aENvbnRhaW5lcigpICE9PSB3YXNNZXJnZWQpIHtcblx0XHRcdHRoaXMudXBkYXRlVGl0bGVBcmVhKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRBZGRWaWV3cy5maXJlKHBhbmVzLm1hcCgoeyBwYW5lIH0pID0+IHBhbmUpKTtcblx0fVxuXG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnZpc2libGUgIT09ICEhdmlzaWJsZSkge1xuXHRcdFx0dGhpcy52aXNpYmxlID0gdmlzaWJsZTtcblxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmZpcmUodmlzaWJsZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5wYW5lcy5maWx0ZXIodmlldyA9PiB2aWV3LmlzVmlzaWJsZSgpICE9PSB2aXNpYmxlKVxuXHRcdFx0Lm1hcCgodmlldykgPT4gdmlldy5zZXRWaXNpYmxlKHZpc2libGUpKTtcblx0fVxuXG5cdGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy52aXNpYmxlO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZVRpdGxlQXJlYSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vblRpdGxlQXJlYVVwZGF0ZS5maXJlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlVmlldyh2aWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yLCBvcHRpb25zOiBJVmlld2xldFZpZXdPcHRpb25zKTogVmlld1BhbmUge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKHZpZXdEZXNjcmlwdG9yLmN0b3JEZXNjcmlwdG9yLmN0b3IsIC4uLih2aWV3RGVzY3JpcHRvci5jdG9yRGVzY3JpcHRvci5zdGF0aWNBcmd1bWVudHMgfHwgW10pLCBvcHRpb25zKTtcblx0fVxuXG5cdGdldFZpZXcoaWQ6IHN0cmluZyk6IFZpZXdQYW5lIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5wYW5lcy5maWx0ZXIodmlldyA9PiB2aWV3LmlkID09PSBpZClbMF07XG5cdH1cblxuXHRwcml2YXRlIHNhdmVWaWV3U2l6ZXMoKTogdm9pZCB7XG5cdFx0Ly8gU2F2ZSBzaXplIG9ubHkgd2hlbiB0aGUgbGF5b3V0IGhhcyBoYXBwZW5lZFxuXHRcdGlmICh0aGlzLmRpZExheW91dCkge1xuXHRcdFx0dGhpcy52aWV3Q29udGFpbmVyTW9kZWwuc2V0U2l6ZXModGhpcy5wYW5lcy5tYXAodmlldyA9PiAoeyBpZDogdmlldy5pZCwgc2l6ZTogdGhpcy5nZXRQYW5lU2l6ZSh2aWV3KSB9KSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVzdG9yZVZpZXdTaXplcygpOiB2b2lkIHtcblx0XHQvLyBSZXN0b3JlIHNpemVzIG9ubHkgd2hlbiB0aGUgbGF5b3V0IGhhcyBoYXBwZW5lZFxuXHRcdGlmICh0aGlzLmRpZExheW91dCkge1xuXHRcdFx0bGV0IGluaXRpYWxTaXplcztcblx0XHRcdGZvciAoY29uc3Qgdmlld0Rlc2NyaXB0b3Igb2YgdGhpcy52aWV3Q29udGFpbmVyTW9kZWwudmlzaWJsZVZpZXdEZXNjcmlwdG9ycykge1xuXHRcdFx0XHQvLyBMb29rIHVwIHRoZSBwYW5lIGJ5IGlkIHJhdGhlciB0aGFuIGJ5IGluZGV4IHNpbmNlIGEgdmlldyBkZXNjcmlwdG9yXG5cdFx0XHRcdC8vIG1heSBiZSB2aXNpYmxlIHdpdGhvdXQgYSBjb3JyZXNwb25kaW5nIHBhbmUgKGUuZy4gd2hlbiBpdHMgcGFuZSBmYWlsZWQgdG8gcmVuZGVyKVxuXHRcdFx0XHRjb25zdCBwYW5lID0gdGhpcy5nZXRWaWV3KHZpZXdEZXNjcmlwdG9yLmlkKTtcblx0XHRcdFx0aWYgKCFwYW5lKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzaXplID0gdGhpcy52aWV3Q29udGFpbmVyTW9kZWwuZ2V0U2l6ZSh2aWV3RGVzY3JpcHRvci5pZCk7XG5cdFx0XHRcdGlmICh0eXBlb2Ygc2l6ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHR0aGlzLnJlc2l6ZVBhbmUocGFuZSwgc2l6ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5pdGlhbFNpemVzID0gaW5pdGlhbFNpemVzID8gaW5pdGlhbFNpemVzIDogdGhpcy5jb21wdXRlSW5pdGlhbFNpemVzKCk7XG5cdFx0XHRcdFx0dGhpcy5yZXNpemVQYW5lKHBhbmUsIGluaXRpYWxTaXplcy5nZXQocGFuZS5pZCkgfHwgMjAwKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUluaXRpYWxTaXplcygpOiBNYXA8c3RyaW5nLCBudW1iZXI+IHtcblx0XHRjb25zdCBzaXplczogTWFwPHN0cmluZywgbnVtYmVyPiA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHRjb25zdCB0b3RhbFdlaWdodCA9IHRoaXMudmlld0NvbnRhaW5lck1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnMucmVkdWNlKCh0b3RhbFdlaWdodCwgeyB3ZWlnaHQgfSkgPT4gdG90YWxXZWlnaHQgKyAod2VpZ2h0IHx8IDIwKSwgMCk7XG5cdFx0XHRmb3IgKGNvbnN0IHZpZXdEZXNjcmlwdG9yIG9mIHRoaXMudmlld0NvbnRhaW5lck1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnMpIHtcblx0XHRcdFx0aWYgKHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMKSB7XG5cdFx0XHRcdFx0c2l6ZXMuc2V0KHZpZXdEZXNjcmlwdG9yLmlkLCB0aGlzLmRpbWVuc2lvbi5oZWlnaHQgKiAodmlld0Rlc2NyaXB0b3Iud2VpZ2h0IHx8IDIwKSAvIHRvdGFsV2VpZ2h0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzaXplcy5zZXQodmlld0Rlc2NyaXB0b3IuaWQsIHRoaXMuZGltZW5zaW9uLndpZHRoICogKHZpZXdEZXNjcmlwdG9yLndlaWdodCB8fCAyMCkgLyB0b3RhbFdlaWdodCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHNpemVzO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLnBhbmVzLmZvckVhY2goKHZpZXcpID0+IHZpZXcuc2F2ZVN0YXRlKCkpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUodGhpcy52aXNpYmxlVmlld3NTdG9yYWdlSWQsIHRoaXMubGVuZ3RoLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbnRleHRNZW51KGV2ZW50OiBTdGFuZGFyZE1vdXNlRXZlbnQsIHZpZXdQYW5lOiBWaWV3UGFuZSk6IHZvaWQge1xuXHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSB2aWV3UGFuZS5tZW51QWN0aW9ucy5nZXRDb250ZXh0TWVudUFjdGlvbnMoKTtcblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGV2ZW50LFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9uc1xuXHRcdH0pO1xuXHR9XG5cblx0b3BlblZpZXcoaWQ6IHN0cmluZywgZm9jdXM/OiBib29sZWFuKTogSVZpZXcgfCB1bmRlZmluZWQge1xuXHRcdGxldCB2aWV3ID0gdGhpcy5nZXRWaWV3KGlkKTtcblx0XHRpZiAoIXZpZXcpIHtcblx0XHRcdHRoaXMudG9nZ2xlVmlld1Zpc2liaWxpdHkoaWQpO1xuXHRcdH1cblx0XHR2aWV3ID0gdGhpcy5nZXRWaWV3KGlkKTtcblx0XHRpZiAodmlldykge1xuXHRcdFx0dmlldy5zZXRFeHBhbmRlZCh0cnVlKTtcblx0XHRcdGlmIChmb2N1cykge1xuXHRcdFx0XHR2aWV3LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB2aWV3O1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uRGlkQWRkVmlld0Rlc2NyaXB0b3JzKGFkZGVkOiBJQWRkZWRWaWV3RGVzY3JpcHRvclJlZltdKTogVmlld1BhbmVbXSB7XG5cdFx0Y29uc3QgcGFuZXNUb0FkZDogeyBwYW5lOiBWaWV3UGFuZTsgc2l6ZTogbnVtYmVyOyBpbmRleDogbnVtYmVyOyBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB9W10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgeyB2aWV3RGVzY3JpcHRvciwgY29sbGFwc2VkLCBpbmRleCwgc2l6ZSB9IG9mIGFkZGVkKSB7XG5cdFx0XHRjb25zdCBwYW5lID0gdGhpcy5jcmVhdGVWaWV3KHZpZXdEZXNjcmlwdG9yLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IHZpZXdEZXNjcmlwdG9yLmlkLFxuXHRcdFx0XHRcdHRpdGxlOiB2aWV3RGVzY3JpcHRvci5uYW1lLnZhbHVlLFxuXHRcdFx0XHRcdGZyb21FeHRlbnNpb25JZDogKHZpZXdEZXNjcmlwdG9yIGFzIFBhcnRpYWw8SUN1c3RvbVZpZXdEZXNjcmlwdG9yPikuZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdFx0ZXhwYW5kZWQ6ICFjb2xsYXBzZWQsXG5cdFx0XHRcdFx0c2luZ2xlVmlld1BhbmVDb250YWluZXJUaXRsZTogdmlld0Rlc2NyaXB0b3Iuc2luZ2xlVmlld1BhbmVDb250YWluZXJUaXRsZSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHBhbmUucmVuZGVyKCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEZhaWwgdG8gcmVuZGVyIHZpZXcgJHt2aWV3RGVzY3JpcHRvci5pZH1gLCBlcnJvcik7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBhbmUuZHJhZ2dhYmxlRWxlbWVudCkge1xuXHRcdFx0XHRjb25zdCBjb250ZXh0TWVudURpc3Bvc2FibGUgPSBhZGREaXNwb3NhYmxlTGlzdGVuZXIocGFuZS5kcmFnZ2FibGVFbGVtZW50LCAnY29udGV4dG1lbnUnLCBlID0+IHtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHR0aGlzLm9uQ29udGV4dE1lbnUobmV3IFN0YW5kYXJkTW91c2VFdmVudChnZXRXaW5kb3cocGFuZS5kcmFnZ2FibGVFbGVtZW50KSwgZSksIHBhbmUpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBjb2xsYXBzZURpc3Bvc2FibGUgPSBFdmVudC5sYXRjaChFdmVudC5tYXAocGFuZS5vbkRpZENoYW5nZSwgKCkgPT4gIXBhbmUuaXNFeHBhbmRlZCgpKSkoY29sbGFwc2VkID0+IHtcblx0XHRcdFx0XHR0aGlzLnZpZXdDb250YWluZXJNb2RlbC5zZXRDb2xsYXBzZWQodmlld0Rlc2NyaXB0b3IuaWQsIGNvbGxhcHNlZCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHBhbmVzVG9BZGQucHVzaCh7IHBhbmUsIHNpemU6IHNpemUgfHwgcGFuZS5taW5pbXVtU2l6ZSwgaW5kZXgsIGRpc3Bvc2FibGU6IGNvbWJpbmVkRGlzcG9zYWJsZShjb250ZXh0TWVudURpc3Bvc2FibGUsIGNvbGxhcHNlRGlzcG9zYWJsZSkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5hZGRQYW5lcyhwYW5lc1RvQWRkKTtcblx0XHR0aGlzLnJlc3RvcmVWaWV3U2l6ZXMoKTtcblxuXHRcdGNvbnN0IHBhbmVzOiBWaWV3UGFuZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCB7IHBhbmUgfSBvZiBwYW5lc1RvQWRkKSB7XG5cdFx0XHRwYW5lLnNldFZpc2libGUodGhpcy5pc1Zpc2libGUoKSk7XG5cdFx0XHRwYW5lcy5wdXNoKHBhbmUpO1xuXHRcdH1cblx0XHRyZXR1cm4gcGFuZXM7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkUmVtb3ZlVmlld0Rlc2NyaXB0b3JzKHJlbW92ZWQ6IElWaWV3RGVzY3JpcHRvclJlZltdKTogdm9pZCB7XG5cdFx0cmVtb3ZlZCA9IHJlbW92ZWQuc29ydCgoYSwgYikgPT4gYi5pbmRleCAtIGEuaW5kZXgpO1xuXHRcdGNvbnN0IHBhbmVzVG9SZW1vdmU6IFZpZXdQYW5lW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHsgaW5kZXggfSBvZiByZW1vdmVkKSB7XG5cdFx0XHRjb25zdCBwYW5lSXRlbSA9IHRoaXMucGFuZUl0ZW1zW2luZGV4XTtcblx0XHRcdGlmIChwYW5lSXRlbSkge1xuXHRcdFx0XHRwYW5lc1RvUmVtb3ZlLnB1c2godGhpcy5wYW5lSXRlbXNbaW5kZXhdLnBhbmUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChwYW5lc1RvUmVtb3ZlLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5yZW1vdmVQYW5lcyhwYW5lc1RvUmVtb3ZlKTtcblxuXHRcdFx0Zm9yIChjb25zdCBwYW5lIG9mIHBhbmVzVG9SZW1vdmUpIHtcblx0XHRcdFx0cGFuZS5zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR0b2dnbGVWaWV3VmlzaWJpbGl0eSh2aWV3SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdC8vIENoZWNrIGlmIHZpZXcgaXMgYWN0aXZlXG5cdFx0aWYgKHRoaXMudmlld0NvbnRhaW5lck1vZGVsLmFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5zb21lKHZpZXdEZXNjcmlwdG9yID0+IHZpZXdEZXNjcmlwdG9yLmlkID09PSB2aWV3SWQpKSB7XG5cdFx0XHRjb25zdCB2aXNpYmxlID0gIXRoaXMudmlld0NvbnRhaW5lck1vZGVsLmlzVmlzaWJsZSh2aWV3SWQpO1xuXHRcdFx0dGhpcy52aWV3Q29udGFpbmVyTW9kZWwuc2V0VmlzaWJsZSh2aWV3SWQsIHZpc2libGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWRkUGFuZShwYW5lOiBWaWV3UGFuZSwgc2l6ZTogbnVtYmVyLCBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSwgaW5kZXggPSB0aGlzLnBhbmVJdGVtcy5sZW5ndGggLSAxKTogdm9pZCB7XG5cdFx0Y29uc3Qgb25EaWRGb2N1cyA9IHBhbmUub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZEZvY3VzVmlldy5maXJlKHBhbmUpO1xuXHRcdFx0dGhpcy5sYXN0Rm9jdXNlZFBhbmUgPSBwYW5lO1xuXHRcdH0pO1xuXHRcdGNvbnN0IG9uRGlkQmx1ciA9IHBhbmUub25EaWRCbHVyKCgpID0+IHRoaXMuX29uRGlkQmx1clZpZXcuZmlyZShwYW5lKSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VUaXRsZUFyZWEgPSBwYW5lLm9uRGlkQ2hhbmdlVGl0bGVBcmVhKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzVmlld01lcmdlZFdpdGhDb250YWluZXIoKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVRpdGxlQXJlYSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gcGFuZS5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlVmlld1Zpc2liaWxpdHkuZmlyZShwYW5lKSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2UgPSBwYW5lLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmIChwYW5lID09PSB0aGlzLmxhc3RGb2N1c2VkUGFuZSAmJiAhcGFuZS5pc0V4cGFuZGVkKCkpIHtcblx0XHRcdFx0dGhpcy5sYXN0Rm9jdXNlZFBhbmUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBpc1BhbmVsID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHRoaXMudmlld0NvbnRhaW5lcikgPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbDtcblx0XHRwYW5lLnN0eWxlKHtcblx0XHRcdGhlYWRlckZvcmVncm91bmQ6IGFzQ3NzVmFyaWFibGUoaXNQYW5lbCA/IFBBTkVMX1NFQ1RJT05fSEVBREVSX0ZPUkVHUk9VTkQgOiBTSURFX0JBUl9TRUNUSU9OX0hFQURFUl9GT1JFR1JPVU5EKSxcblx0XHRcdGhlYWRlckJhY2tncm91bmQ6IGFzQ3NzVmFyaWFibGUoaXNQYW5lbCA/IFBBTkVMX1NFQ1RJT05fSEVBREVSX0JBQ0tHUk9VTkQgOiBTSURFX0JBUl9TRUNUSU9OX0hFQURFUl9CQUNLR1JPVU5EKSxcblx0XHRcdGhlYWRlckJvcmRlcjogYXNDc3NWYXJpYWJsZShpc1BhbmVsID8gUEFORUxfU0VDVElPTl9IRUFERVJfQk9SREVSIDogU0lERV9CQVJfU0VDVElPTl9IRUFERVJfQk9SREVSKSxcblx0XHRcdGRyb3BCYWNrZ3JvdW5kOiBhc0Nzc1ZhcmlhYmxlKGlzUGFuZWwgPyBQQU5FTF9TRUNUSU9OX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCA6IFNJREVfQkFSX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCksXG5cdFx0XHRsZWZ0Qm9yZGVyOiBpc1BhbmVsID8gYXNDc3NWYXJpYWJsZShQQU5FTF9TRUNUSU9OX0JPUkRFUikgOiB1bmRlZmluZWRcblx0XHR9KTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlKTtcblx0XHRzdG9yZS5hZGQoY29tYmluZWREaXNwb3NhYmxlKHBhbmUsIG9uRGlkRm9jdXMsIG9uRGlkQmx1ciwgb25EaWRDaGFuZ2VUaXRsZUFyZWEsIG9uRGlkQ2hhbmdlLCBvbkRpZENoYW5nZVZpc2liaWxpdHkpKTtcblx0XHRjb25zdCBwYW5lSXRlbTogSVZpZXdQYW5lSXRlbSA9IHsgcGFuZSwgZGlzcG9zYWJsZTogc3RvcmUgfTtcblxuXHRcdHRoaXMucGFuZUl0ZW1zLnNwbGljZShpbmRleCwgMCwgcGFuZUl0ZW0pO1xuXHRcdGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMucGFuZXZpZXcpLmFkZFBhbmUocGFuZSwgc2l6ZSwgaW5kZXgpO1xuXG5cdFx0bGV0IG92ZXJsYXk6IFZpZXdQYW5lRHJvcE92ZXJsYXkgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuY2FuTW92ZVZpZXdzKCkpIHtcblxuXHRcdFx0aWYgKHBhbmUuZHJhZ2dhYmxlRWxlbWVudCkge1xuXHRcdFx0XHRzdG9yZS5hZGQoQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlci5JTlNUQU5DRS5yZWdpc3RlckRyYWdnYWJsZShwYW5lLmRyYWdnYWJsZUVsZW1lbnQsICgpID0+IHsgcmV0dXJuIHsgdHlwZTogJ3ZpZXcnLCBpZDogcGFuZS5pZCB9OyB9LCB7fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRzdG9yZS5hZGQoQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlci5JTlNUQU5DRS5yZWdpc3RlclRhcmdldChwYW5lLmRyb3BUYXJnZXRFbGVtZW50LCB7XG5cdFx0XHRcdG9uRHJhZ0VudGVyOiAoZSkgPT4ge1xuXHRcdFx0XHRcdGlmICghb3ZlcmxheSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZHJvcERhdGEgPSBlLmRyYWdBbmREcm9wRGF0YS5nZXREYXRhKCk7XG5cdFx0XHRcdFx0XHRpZiAoZHJvcERhdGEudHlwZSA9PT0gJ3ZpZXcnICYmIGRyb3BEYXRhLmlkICE9PSBwYW5lLmlkKSB7XG5cblx0XHRcdFx0XHRcdFx0Y29uc3Qgb2xkVmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZChkcm9wRGF0YS5pZCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0Rlc2NyaXB0b3JCeUlkKGRyb3BEYXRhLmlkKTtcblxuXHRcdFx0XHRcdFx0XHRpZiAob2xkVmlld0NvbnRhaW5lciAhPT0gdGhpcy52aWV3Q29udGFpbmVyICYmICghdmlld0Rlc2NyaXB0b3IgfHwgIXZpZXdEZXNjcmlwdG9yLmNhbk1vdmVWaWV3IHx8IHRoaXMudmlld0NvbnRhaW5lci5yZWplY3RBZGRlZFZpZXdzKSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdG92ZXJsYXkgPSBuZXcgVmlld1BhbmVEcm9wT3ZlcmxheShwYW5lLmRyb3BUYXJnZXRFbGVtZW50LCB0aGlzLm9yaWVudGF0aW9uID8/IE9yaWVudGF0aW9uLlZFUlRJQ0FMLCB1bmRlZmluZWQsIHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJMb2NhdGlvbih0aGlzLnZpZXdDb250YWluZXIpISwgdGhpcy50aGVtZVNlcnZpY2UpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAoZHJvcERhdGEudHlwZSA9PT0gJ2NvbXBvc2l0ZScgJiYgZHJvcERhdGEuaWQgIT09IHRoaXMudmlld0NvbnRhaW5lci5pZCAmJiAhdGhpcy52aWV3Q29udGFpbmVyLnJlamVjdEFkZGVkVmlld3MpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoZHJvcERhdGEuaWQpITtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgdmlld3NUb01vdmUgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKS5hbGxWaWV3RGVzY3JpcHRvcnM7XG5cblx0XHRcdFx0XHRcdFx0aWYgKCF2aWV3c1RvTW92ZS5zb21lKHYgPT4gIXYuY2FuTW92ZVZpZXcpICYmIHZpZXdzVG9Nb3ZlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0XHRvdmVybGF5ID0gbmV3IFZpZXdQYW5lRHJvcE92ZXJsYXkocGFuZS5kcm9wVGFyZ2V0RWxlbWVudCwgdGhpcy5vcmllbnRhdGlvbiA/PyBPcmllbnRhdGlvbi5WRVJUSUNBTCwgdW5kZWZpbmVkLCB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odGhpcy52aWV3Q29udGFpbmVyKSEsIHRoaXMudGhlbWVTZXJ2aWNlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b25EcmFnT3ZlcjogKGUpID0+IHtcblx0XHRcdFx0XHR0b2dnbGVEcm9wRWZmZWN0KGUuZXZlbnREYXRhLmRhdGFUcmFuc2ZlciwgJ21vdmUnLCBvdmVybGF5ICE9PSB1bmRlZmluZWQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkRyYWdMZWF2ZTogKGUpID0+IHtcblx0XHRcdFx0XHRvdmVybGF5Py5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0b3ZlcmxheSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25Ecm9wOiAoZSkgPT4ge1xuXHRcdFx0XHRcdGlmIChvdmVybGF5KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkcm9wRGF0YSA9IGUuZHJhZ0FuZERyb3BEYXRhLmdldERhdGEoKTtcblx0XHRcdFx0XHRcdGNvbnN0IHZpZXdzVG9Nb3ZlOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtdO1xuXHRcdFx0XHRcdFx0bGV0IGFuY2hvclZpZXc6IElWaWV3RGVzY3JpcHRvciB8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdFx0aWYgKGRyb3BEYXRhLnR5cGUgPT09ICdjb21wb3NpdGUnICYmIGRyb3BEYXRhLmlkICE9PSB0aGlzLnZpZXdDb250YWluZXIuaWQgJiYgIXRoaXMudmlld0NvbnRhaW5lci5yZWplY3RBZGRlZFZpZXdzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKGRyb3BEYXRhLmlkKSE7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFsbFZpZXdzID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcikuYWxsVmlld0Rlc2NyaXB0b3JzO1xuXG5cdFx0XHRcdFx0XHRcdGlmIChhbGxWaWV3cy5sZW5ndGggPiAwICYmICFhbGxWaWV3cy5zb21lKHYgPT4gIXYuY2FuTW92ZVZpZXcpKSB7XG5cdFx0XHRcdFx0XHRcdFx0dmlld3NUb01vdmUucHVzaCguLi5hbGxWaWV3cyk7XG5cdFx0XHRcdFx0XHRcdFx0YW5jaG9yVmlldyA9IGFsbFZpZXdzWzBdO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGRyb3BEYXRhLnR5cGUgPT09ICd2aWV3Jykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBvbGRWaWV3Q29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKGRyb3BEYXRhLmlkKTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3IgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3RGVzY3JpcHRvckJ5SWQoZHJvcERhdGEuaWQpO1xuXHRcdFx0XHRcdFx0XHRpZiAob2xkVmlld0NvbnRhaW5lciAhPT0gdGhpcy52aWV3Q29udGFpbmVyICYmIHZpZXdEZXNjcmlwdG9yICYmIHZpZXdEZXNjcmlwdG9yLmNhbk1vdmVWaWV3ICYmICF0aGlzLnZpZXdDb250YWluZXIucmVqZWN0QWRkZWRWaWV3cykge1xuXHRcdFx0XHRcdFx0XHRcdHZpZXdzVG9Nb3ZlLnB1c2godmlld0Rlc2NyaXB0b3IpO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0aWYgKHZpZXdEZXNjcmlwdG9yKSB7XG5cdFx0XHRcdFx0XHRcdFx0YW5jaG9yVmlldyA9IHZpZXdEZXNjcmlwdG9yO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmICh2aWV3c1RvTW92ZSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5tb3ZlVmlld3NUb0NvbnRhaW5lcih2aWV3c1RvTW92ZSwgdGhpcy52aWV3Q29udGFpbmVyLCB1bmRlZmluZWQsICdkbmQnKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKGFuY2hvclZpZXcpIHtcblx0XHRcdFx0XHRcdFx0aWYgKG92ZXJsYXkuY3VycmVudERyb3BPcGVyYXRpb24gPT09IERyb3BEaXJlY3Rpb24uRE9XTiB8fFxuXHRcdFx0XHRcdFx0XHRcdG92ZXJsYXkuY3VycmVudERyb3BPcGVyYXRpb24gPT09IERyb3BEaXJlY3Rpb24uUklHSFQpIHtcblxuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGZyb21JbmRleCA9IHRoaXMucGFuZXMuZmluZEluZGV4KHAgPT4gcC5pZCA9PT0gYW5jaG9yVmlldyEuaWQpO1xuXHRcdFx0XHRcdFx0XHRcdGxldCB0b0luZGV4ID0gdGhpcy5wYW5lcy5maW5kSW5kZXgocCA9PiBwLmlkID09PSBwYW5lLmlkKTtcblxuXHRcdFx0XHRcdFx0XHRcdGlmIChmcm9tSW5kZXggPj0gMCAmJiB0b0luZGV4ID49IDApIHtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChmcm9tSW5kZXggPiB0b0luZGV4KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHRvSW5kZXgrKztcblx0XHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKHRvSW5kZXggPCB0aGlzLnBhbmVzLmxlbmd0aCAmJiB0b0luZGV4ICE9PSBmcm9tSW5kZXgpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5tb3ZlUGFuZSh0aGlzLnBhbmVzW2Zyb21JbmRleF0sIHRoaXMucGFuZXNbdG9JbmRleF0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGlmIChvdmVybGF5LmN1cnJlbnREcm9wT3BlcmF0aW9uID09PSBEcm9wRGlyZWN0aW9uLlVQIHx8XG5cdFx0XHRcdFx0XHRcdFx0b3ZlcmxheS5jdXJyZW50RHJvcE9wZXJhdGlvbiA9PT0gRHJvcERpcmVjdGlvbi5MRUZUKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZnJvbUluZGV4ID0gdGhpcy5wYW5lcy5maW5kSW5kZXgocCA9PiBwLmlkID09PSBhbmNob3JWaWV3IS5pZCk7XG5cdFx0XHRcdFx0XHRcdFx0bGV0IHRvSW5kZXggPSB0aGlzLnBhbmVzLmZpbmRJbmRleChwID0+IHAuaWQgPT09IHBhbmUuaWQpO1xuXG5cdFx0XHRcdFx0XHRcdFx0aWYgKGZyb21JbmRleCA+PSAwICYmIHRvSW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGZyb21JbmRleCA8IHRvSW5kZXgpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dG9JbmRleC0tO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAodG9JbmRleCA+PSAwICYmIHRvSW5kZXggIT09IGZyb21JbmRleCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLm1vdmVQYW5lKHRoaXMucGFuZXNbZnJvbUluZGV4XSwgdGhpcy5wYW5lc1t0b0luZGV4XSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0aWYgKHZpZXdzVG9Nb3ZlLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRcdFx0XHR2aWV3c1RvTW92ZS5zbGljZSgxKS5mb3JFYWNoKHZpZXcgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0bGV0IHRvSW5kZXggPSB0aGlzLnBhbmVzLmZpbmRJbmRleChwID0+IHAuaWQgPT09IGFuY2hvclZpZXchLmlkKTtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGZyb21JbmRleCA9IHRoaXMucGFuZXMuZmluZEluZGV4KHAgPT4gcC5pZCA9PT0gdmlldy5pZCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoZnJvbUluZGV4ID49IDAgJiYgdG9JbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmIChmcm9tSW5kZXggPiB0b0luZGV4KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dG9JbmRleCsrO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKHRvSW5kZXggPCB0aGlzLnBhbmVzLmxlbmd0aCAmJiB0b0luZGV4ICE9PSBmcm9tSW5kZXgpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLm1vdmVQYW5lKHRoaXMucGFuZXNbZnJvbUluZGV4XSwgdGhpcy5wYW5lc1t0b0luZGV4XSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0YW5jaG9yVmlldyA9IHZpZXc7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdG92ZXJsYXk/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRvdmVybGF5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlUGFuZXMocGFuZXM6IFZpZXdQYW5lW10pOiB2b2lkIHtcblx0XHRjb25zdCB3YXNNZXJnZWQgPSB0aGlzLmlzVmlld01lcmdlZFdpdGhDb250YWluZXIoKTtcblxuXHRcdHBhbmVzLmZvckVhY2gocGFuZSA9PiB0aGlzLnJlbW92ZVBhbmUocGFuZSkpO1xuXG5cdFx0dGhpcy51cGRhdGVWaWV3SGVhZGVycygpO1xuXHRcdGlmICh3YXNNZXJnZWQgIT09IHRoaXMuaXNWaWV3TWVyZ2VkV2l0aENvbnRhaW5lcigpKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRpdGxlQXJlYSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkUmVtb3ZlVmlld3MuZmlyZShwYW5lcyk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZVBhbmUocGFuZTogVmlld1BhbmUpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMucGFuZUl0ZW1zLmZpbmRJbmRleChpID0+IGkucGFuZSA9PT0gcGFuZSk7XG5cblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubGFzdEZvY3VzZWRQYW5lID09PSBwYW5lKSB7XG5cdFx0XHR0aGlzLmxhc3RGb2N1c2VkUGFuZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnBhbmV2aWV3KS5yZW1vdmVQYW5lKHBhbmUpO1xuXHRcdGNvbnN0IFtwYW5lSXRlbV0gPSB0aGlzLnBhbmVJdGVtcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdHBhbmVJdGVtLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdH1cblxuXHRtb3ZlUGFuZShmcm9tOiBWaWV3UGFuZSwgdG86IFZpZXdQYW5lKTogdm9pZCB7XG5cdFx0Y29uc3QgZnJvbUluZGV4ID0gdGhpcy5wYW5lSXRlbXMuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS5wYW5lID09PSBmcm9tKTtcblx0XHRjb25zdCB0b0luZGV4ID0gdGhpcy5wYW5lSXRlbXMuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS5wYW5lID09PSB0byk7XG5cblx0XHRjb25zdCBmcm9tVmlld0Rlc2NyaXB0b3IgPSB0aGlzLnZpZXdDb250YWluZXJNb2RlbC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzW2Zyb21JbmRleF07XG5cdFx0Y29uc3QgdG9WaWV3RGVzY3JpcHRvciA9IHRoaXMudmlld0NvbnRhaW5lck1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnNbdG9JbmRleF07XG5cblx0XHRpZiAoZnJvbUluZGV4IDwgMCB8fCBmcm9tSW5kZXggPj0gdGhpcy5wYW5lSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRvSW5kZXggPCAwIHx8IHRvSW5kZXggPj0gdGhpcy5wYW5lSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgW3BhbmVJdGVtXSA9IHRoaXMucGFuZUl0ZW1zLnNwbGljZShmcm9tSW5kZXgsIDEpO1xuXHRcdHRoaXMucGFuZUl0ZW1zLnNwbGljZSh0b0luZGV4LCAwLCBwYW5lSXRlbSk7XG5cblx0XHRhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnBhbmV2aWV3KS5tb3ZlUGFuZShmcm9tLCB0byk7XG5cblx0XHR0aGlzLnZpZXdDb250YWluZXJNb2RlbC5tb3ZlKGZyb21WaWV3RGVzY3JpcHRvci5pZCwgdG9WaWV3RGVzY3JpcHRvci5pZCk7XG5cblx0XHR0aGlzLnVwZGF0ZVRpdGxlQXJlYSgpO1xuXHR9XG5cblx0cmVzaXplUGFuZShwYW5lOiBWaWV3UGFuZSwgc2l6ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0YXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5wYW5ldmlldykucmVzaXplUGFuZShwYW5lLCBzaXplKTtcblx0fVxuXG5cdGdldFBhbmVTaXplKHBhbmU6IFZpZXdQYW5lKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5wYW5ldmlldykuZ2V0UGFuZVNpemUocGFuZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVZpZXdIZWFkZXJzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzVmlld01lcmdlZFdpdGhDb250YWluZXIoKSkge1xuXHRcdFx0aWYgKHRoaXMucGFuZUl0ZW1zWzBdLnBhbmUuaXNFeHBhbmRlZCgpKSB7XG5cdFx0XHRcdHRoaXMubGFzdE1lcmdlZENvbGxhcHNlZFBhbmUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxhc3RNZXJnZWRDb2xsYXBzZWRQYW5lID0gdGhpcy5wYW5lSXRlbXNbMF0ucGFuZTtcblx0XHRcdFx0dGhpcy5wYW5lSXRlbXNbMF0ucGFuZS5zZXRFeHBhbmRlZCh0cnVlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMucGFuZUl0ZW1zWzBdLnBhbmUuaGVhZGVyVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5wYW5lSXRlbXNbMF0ucGFuZS5jb2xsYXBzaWJsZSA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLnBhbmVJdGVtcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0dGhpcy5wYW5lSXRlbXNbMF0ucGFuZS5oZWFkZXJWaXNpYmxlID0gdHJ1ZTtcblx0XHRcdFx0aWYgKHRoaXMucGFuZUl0ZW1zWzBdLnBhbmUgPT09IHRoaXMubGFzdE1lcmdlZENvbGxhcHNlZFBhbmUpIHtcblx0XHRcdFx0XHR0aGlzLnBhbmVJdGVtc1swXS5wYW5lLnNldEV4cGFuZGVkKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnBhbmVJdGVtc1swXS5wYW5lLmNvbGxhcHNpYmxlID0gZmFsc2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnBhbmVJdGVtcy5mb3JFYWNoKGkgPT4ge1xuXHRcdFx0XHRcdGkucGFuZS5oZWFkZXJWaXNpYmxlID0gdHJ1ZTtcblx0XHRcdFx0XHRpLnBhbmUuY29sbGFwc2libGUgPSB0cnVlO1xuXHRcdFx0XHRcdGlmIChpLnBhbmUgPT09IHRoaXMubGFzdE1lcmdlZENvbGxhcHNlZFBhbmUpIHtcblx0XHRcdFx0XHRcdGkucGFuZS5zZXRFeHBhbmRlZChmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHRoaXMubGFzdE1lcmdlZENvbGxhcHNlZFBhbmUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0aXNWaWV3TWVyZ2VkV2l0aENvbnRhaW5lcigpOiBib29sZWFuIHtcblx0XHRpZiAoISh0aGlzLm9wdGlvbnMubWVyZ2VWaWV3V2l0aENvbnRhaW5lcldoZW5TaW5nbGVWaWV3ICYmIHRoaXMucGFuZUl0ZW1zLmxlbmd0aCA9PT0gMSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmFyZUV4dGVuc2lvbnNSZWFkeSkge1xuXHRcdFx0aWYgKHRoaXMudmlzaWJsZVZpZXdzQ291bnRGcm9tQ2FjaGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5wYW5lSXRlbXNbMF0ucGFuZS5pc0V4cGFuZGVkKCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBDaGVjayBpbiBjYWNoZSBzbyB0aGF0IHZpZXcgZG8gbm90IGp1bXAuIFNlZSAjMjk2MDlcblx0XHRcdHJldHVybiB0aGlzLnZpc2libGVWaWV3c0NvdW50RnJvbUNhY2hlID09PSAxO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRTY3JvbGxQYW5lKCkge1xuXHRcdGZvciAoY29uc3QgcGFuZSBvZiB0aGlzLnBhbmVzKSB7XG5cdFx0XHRwYW5lLm9uRGlkU2Nyb2xsUm9vdCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRTYXNoUmVzZXQoaW5kZXg6IG51bWJlcikge1xuXHRcdGxldCBmaXJzdFBhbmUgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IHNlY29uZFBhbmUgPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBEZWFsIHdpdGggY29sbGFwc2VkIHZpZXdzOiB0byBiZSBjbGV2ZXIsIHdlIHNwbGl0IHRoZSBzcGFjZSB0YWtlbiBieSB0aGUgbmVhcmVzdCB1bmNvbGxhcHNlZCB2aWV3c1xuXHRcdGZvciAobGV0IGkgPSBpbmRleDsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGlmICh0aGlzLnBhbmVJdGVtc1tpXS5wYW5lPy5pc1Zpc2libGUoKSAmJiB0aGlzLnBhbmVJdGVtc1tpXT8ucGFuZS5pc0V4cGFuZGVkKCkpIHtcblx0XHRcdFx0Zmlyc3RQYW5lID0gdGhpcy5wYW5lSXRlbXNbaV0ucGFuZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IGluZGV4ICsgMTsgaSA8IHRoaXMucGFuZUl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAodGhpcy5wYW5lSXRlbXNbaV0ucGFuZT8uaXNWaXNpYmxlKCkgJiYgdGhpcy5wYW5lSXRlbXNbaV0/LnBhbmUuaXNFeHBhbmRlZCgpKSB7XG5cdFx0XHRcdHNlY29uZFBhbmUgPSB0aGlzLnBhbmVJdGVtc1tpXS5wYW5lO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZmlyc3RQYW5lICYmIHNlY29uZFBhbmUpIHtcblx0XHRcdGNvbnN0IGZpcnN0UGFuZVNpemUgPSB0aGlzLmdldFBhbmVTaXplKGZpcnN0UGFuZSk7XG5cdFx0XHRjb25zdCBzZWNvbmRQYW5lU2l6ZSA9IHRoaXMuZ2V0UGFuZVNpemUoc2Vjb25kUGFuZSk7XG5cblx0XHRcdC8vIEF2b2lkIHJvdW5kaW5nIGVycm9ycyBhbmQgYmUgY29uc2lzdGVudCB3aGVuIHJlc2l6aW5nXG5cdFx0XHQvLyBUaGUgZmlyc3QgcGFuZSBhbHdheXMgZ2V0IGhhbGYgcm91bmRlZCB1cCBhbmQgdGhlIHNlY29uZCBpcyBoYWxmIHJvdW5kZWQgZG93blxuXHRcdFx0Y29uc3QgbmV3Rmlyc3RQYW5lU2l6ZSA9IE1hdGguY2VpbCgoZmlyc3RQYW5lU2l6ZSArIHNlY29uZFBhbmVTaXplKSAvIDIpO1xuXHRcdFx0Y29uc3QgbmV3U2Vjb25kUGFuZVNpemUgPSBNYXRoLmZsb29yKChmaXJzdFBhbmVTaXplICsgc2Vjb25kUGFuZVNpemUpIC8gMik7XG5cblx0XHRcdC8vIFNocmluayB0aGUgbGFyZ2VyIHBhbmUgZmlyc3QsIHRoZW4gZ3JvdyB0aGUgc21hbGxlciBwYW5lXG5cdFx0XHQvLyBUaGlzIHByZXZlbnRzIGludGVyZmVyaW5nIHdpdGggb3RoZXIgdmlldyBzaXplc1xuXHRcdFx0aWYgKGZpcnN0UGFuZVNpemUgPiBzZWNvbmRQYW5lU2l6ZSkge1xuXHRcdFx0XHR0aGlzLnJlc2l6ZVBhbmUoZmlyc3RQYW5lLCBuZXdGaXJzdFBhbmVTaXplKTtcblx0XHRcdFx0dGhpcy5yZXNpemVQYW5lKHNlY29uZFBhbmUsIG5ld1NlY29uZFBhbmVTaXplKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucmVzaXplUGFuZShzZWNvbmRQYW5lLCBuZXdTZWNvbmRQYW5lU2l6ZSk7XG5cdFx0XHRcdHRoaXMucmVzaXplUGFuZShmaXJzdFBhbmUsIG5ld0ZpcnN0UGFuZVNpemUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMucGFuZUl0ZW1zLmZvckVhY2goaSA9PiBpLmRpc3Bvc2FibGUuZGlzcG9zZSgpKTtcblx0XHRpZiAodGhpcy5wYW5ldmlldykge1xuXHRcdFx0dGhpcy5wYW5ldmlldy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBWaWV3UGFuZUNvbnRhaW5lckFjdGlvbjxUIGV4dGVuZHMgSVZpZXdQYW5lQ29udGFpbmVyPiBleHRlbmRzIEFjdGlvbjIge1xuXHRvdmVycmlkZSByZWFkb25seSBkZXNjOiBSZWFkb25seTxJQWN0aW9uMk9wdGlvbnM+ICYgeyB2aWV3UGFuZUNvbnRhaW5lcklkOiBzdHJpbmcgfTtcblx0Y29uc3RydWN0b3IoZGVzYzogUmVhZG9ubHk8SUFjdGlvbjJPcHRpb25zPiAmIHsgdmlld1BhbmVDb250YWluZXJJZDogc3RyaW5nIH0pIHtcblx0XHRzdXBlcihkZXNjKTtcblx0XHR0aGlzLmRlc2MgPSBkZXNjO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB1bmtub3duIHtcblx0XHRjb25zdCB2aWV3UGFuZUNvbnRhaW5lciA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKS5nZXRBY3RpdmVWaWV3UGFuZUNvbnRhaW5lcldpdGhJZCh0aGlzLmRlc2Mudmlld1BhbmVDb250YWluZXJJZCk7XG5cdFx0aWYgKHZpZXdQYW5lQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5ydW5JblZpZXdQYW5lQ29udGFpbmVyKGFjY2Vzc29yLCA8VD52aWV3UGFuZUNvbnRhaW5lciwgLi4uYXJncyk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhYnN0cmFjdCBydW5JblZpZXdQYW5lQ29udGFpbmVyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3UGFuZUNvbnRhaW5lcjogVCwgLi4uYXJnczogdW5rbm93bltdKTogdW5rbm93bjtcbn1cblxuY2xhc3MgTW92ZVZpZXdQb3NpdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcihkZXNjOiBSZWFkb25seTxJQWN0aW9uMk9wdGlvbnM+LCBwcml2YXRlIHJlYWRvbmx5IG9mZnNldDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoZGVzYyk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdEZXNjcmlwdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHZpZXdJZCA9IEZvY3VzZWRWaWV3Q29udGV4dC5nZXRWYWx1ZShjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKHZpZXdJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQodmlld0lkKSE7XG5cdFx0Y29uc3QgbW9kZWwgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdDb250YWluZXIpO1xuXG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3IgPSBtb2RlbC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLmZpbmQodmQgPT4gdmQuaWQgPT09IHZpZXdJZCkhO1xuXHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IG1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnMuaW5kZXhPZih2aWV3RGVzY3JpcHRvcik7XG5cdFx0aWYgKGN1cnJlbnRJbmRleCArIHRoaXMub2Zmc2V0IDwgMCB8fCBjdXJyZW50SW5kZXggKyB0aGlzLm9mZnNldCA+PSBtb2RlbC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld1Bvc2l0aW9uID0gbW9kZWwudmlzaWJsZVZpZXdEZXNjcmlwdG9yc1tjdXJyZW50SW5kZXggKyB0aGlzLm9mZnNldF07XG5cblx0XHRtb2RlbC5tb3ZlKHZpZXdEZXNjcmlwdG9yLmlkLCBuZXdQb3NpdGlvbi5pZCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFxuXHRjbGFzcyBNb3ZlVmlld1VwIGV4dGVuZHMgTW92ZVZpZXdQb3NpdGlvbiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAndmlld3MubW92ZVZpZXdVcCcsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3ZpZXdNb3ZlVXAnLCBcIk1vdmUgVmlldyBVcFwiKSxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kICsgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLlVwQXJyb3cpLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0XHR3aGVuOiBGb2N1c2VkVmlld0NvbnRleHQubm90RXF1YWxzVG8oJycpXG5cdFx0XHRcdH1cblx0XHRcdH0sIC0xKTtcblx0XHR9XG5cdH1cbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihcblx0Y2xhc3MgTW92ZVZpZXdMZWZ0IGV4dGVuZHMgTW92ZVZpZXdQb3NpdGlvbiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAndmlld3MubW92ZVZpZXdMZWZ0Jyxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgndmlld01vdmVMZWZ0JywgXCJNb3ZlIFZpZXcgTGVmdFwiKSxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kICsgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLkxlZnRBcnJvdyksXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxLFxuXHRcdFx0XHRcdHdoZW46IEZvY3VzZWRWaWV3Q29udGV4dC5ub3RFcXVhbHNUbygnJylcblx0XHRcdFx0fVxuXHRcdFx0fSwgLTEpO1xuXHRcdH1cblx0fVxuKTtcblxucmVnaXN0ZXJBY3Rpb24yKFxuXHRjbGFzcyBNb3ZlVmlld0Rvd24gZXh0ZW5kcyBNb3ZlVmlld1Bvc2l0aW9uIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd2aWV3cy5tb3ZlVmlld0Rvd24nLFxuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCd2aWV3TW92ZURvd24nLCBcIk1vdmUgVmlldyBEb3duXCIpLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgKyBLZXlDb2RlLktleUssIEtleUNvZGUuRG93bkFycm93KSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0XHRcdFx0d2hlbjogRm9jdXNlZFZpZXdDb250ZXh0Lm5vdEVxdWFsc1RvKCcnKVxuXHRcdFx0XHR9XG5cdFx0XHR9LCAxKTtcblx0XHR9XG5cdH1cbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihcblx0Y2xhc3MgTW92ZVZpZXdSaWdodCBleHRlbmRzIE1vdmVWaWV3UG9zaXRpb24ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3ZpZXdzLm1vdmVWaWV3UmlnaHQnLFxuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCd2aWV3TW92ZVJpZ2h0JywgXCJNb3ZlIFZpZXcgUmlnaHRcIiksXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCArIEtleUNvZGUuS2V5SywgS2V5Q29kZS5SaWdodEFycm93KSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0XHRcdFx0d2hlbjogRm9jdXNlZFZpZXdDb250ZXh0Lm5vdEVxdWFsc1RvKCcnKVxuXHRcdFx0XHR9XG5cdFx0XHR9LCAxKTtcblx0XHR9XG5cdH1cbik7XG5cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE1vdmVWaWV3cyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3ZzY29kZS5tb3ZlVmlld3MnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgndmlld3NNb3ZlJywgXCJNb3ZlIFZpZXdzXCIpLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvcHRpb25zOiB7IHZpZXdJZHM6IHN0cmluZ1tdOyBkZXN0aW5hdGlvbklkOiBzdHJpbmcgfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShvcHRpb25zPy52aWV3SWRzKSB8fCB0eXBlb2Ygb3B0aW9ucz8uZGVzdGluYXRpb25JZCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdCgnSW52YWxpZCBhcmd1bWVudHMnKTtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdEZXNjcmlwdG9yU2VydmljZSk7XG5cblx0XHRjb25zdCBkZXN0aW5hdGlvbiA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChvcHRpb25zLmRlc3RpbmF0aW9uSWQpO1xuXHRcdGlmICghZGVzdGluYXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBGWUksIGRvbid0IHVzZSBgbW92ZVZpZXdzVG9Db250YWluZXJgIGluIDEgc2hvdCwgYmVjYXVzZSBpdCBleHBlY3RzIGFsbCB2aWV3cyB0byBoYXZlIHRoZSBzYW1lIGN1cnJlbnQgbG9jYXRpb25cblx0XHRmb3IgKGNvbnN0IHZpZXdJZCBvZiBvcHRpb25zLnZpZXdJZHMpIHtcblx0XHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdEZXNjcmlwdG9yQnlJZCh2aWV3SWQpO1xuXHRcdFx0aWYgKHZpZXdEZXNjcmlwdG9yPy5jYW5Nb3ZlVmlldykge1xuXHRcdFx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdzVG9Db250YWluZXIoW3ZpZXdEZXNjcmlwdG9yXSwgZGVzdGluYXRpb24sIFZpZXdWaXNpYmlsaXR5U3RhdGUuRGVmYXVsdCwgdGhpcy5kZXNjLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkub3BlblZpZXdDb250YWlu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O0FBQUEsSUFDM0MsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sSUFBSSxTQUFTLGdCQUFnQixnQkFBZ0I7QUFBQSxRQUNwRCxZQUFZO0FBQUEsVUFDWCxTQUFTLFNBQVMsT0FBTyxVQUFVLFFBQVEsTUFBTSxRQUFRLFNBQVM7QUFBQSxVQUNsRSxRQUFRLGlCQUFpQixtQkFBbUI7QUFBQSxVQUM1QyxNQUFNLG1CQUFtQixZQUFZLEVBQUU7QUFBQSxRQUN4QztBQUFBLE1BQ0QsR0FBRyxDQUFDO0FBQUEsSUFDTDtBQUFBLEVBQ0Q7QUFDRDtBQUVBO0FBQUEsRUFDQyxNQUFNLHNCQUFzQixpQkFBaUI7QUFBQSxJQUM1QyxjQUFjO0FBQ2IsWUFBTTtBQUFBLFFBQ0wsSUFBSTtBQUFBLFFBQ0osT0FBTyxJQUFJLFNBQVMsaUJBQWlCLGlCQUFpQjtBQUFBLFFBQ3RELFlBQVk7QUFBQSxVQUNYLFNBQVMsU0FBUyxPQUFPLFVBQVUsUUFBUSxNQUFNLFFBQVEsVUFBVTtBQUFBLFVBQ25FLFFBQVEsaUJBQWlCLG1CQUFtQjtBQUFBLFVBQzVDLE1BQU0sbUJBQW1CLFlBQVksRUFBRTtBQUFBLFFBQ3hDO0FBQUEsTUFDRCxHQUFHLENBQUM7QUFBQSxJQUNMO0FBQUEsRUFDRDtBQUNEO0FBR0EsZ0JBQWdCLE1BQU0sa0JBQWtCLFFBQVE7QUFBQSxFQUMvQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFNBQVMsYUFBYSxZQUFZO0FBQUEsSUFDOUMsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUE0QixTQUFzRTtBQUMzRyxRQUFJLENBQUMsTUFBTSxRQUFRLFNBQVMsT0FBTyxLQUFLLE9BQU8sU0FBUyxrQkFBa0IsVUFBVTtBQUNuRixhQUFPLFFBQVEsT0FBTyxtQkFBbUI7QUFBQSxJQUMxQztBQUVBLFVBQU0sd0JBQXdCLFNBQVMsSUFBSSxzQkFBc0I7QUFFakUsVUFBTSxjQUFjLHNCQUFzQixxQkFBcUIsUUFBUSxhQUFhO0FBQ3BGLFFBQUksQ0FBQyxhQUFhO0FBQ2pCO0FBQUEsSUFDRDtBQUdBLGVBQVcsVUFBVSxRQUFRLFNBQVM7QUFDckMsWUFBTSxpQkFBaUIsc0JBQXNCLHNCQUFzQixNQUFNO0FBQ3pFLFVBQUksZ0JBQWdCLGFBQWE7QUFDaEMsOEJBQXNCLHFCQUFxQixDQUFDLGNBQWMsR0FBRyxhQUFhLG9CQUFvQixTQUFTLEtBQUssS0FBSyxFQUFFO0FBQUEsTUFDcEg7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLElBQUksYUFBYSxFQUFFLGtCQUFrQixZQUFZLElBQUksSUFBSTtBQUFBLEVBQ3pFO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFsiRHJvcERpcmVjdGlvbiIsICJib3VuZHMiLCAidG90YWxXZWlnaHQiLCAiY29sbGFwc2VkIl0KfQo=
