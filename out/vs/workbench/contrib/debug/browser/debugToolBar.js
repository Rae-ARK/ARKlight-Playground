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
import * as dom from "../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { PixelRatio } from "../../../../base/browser/pixelRatio.js";
import { ActionBar, ActionsOrientation } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { Action } from "../../../../base/common/actions.js";
import * as arrays from "../../../../base/common/arrays.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import * as errors from "../../../../base/common/errors.js";
import { DisposableStore, markAsSingleton, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Platform, platform } from "../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { DropdownWithPrimaryActionViewItem } from "../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js";
import { createActionViewItem, getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { widgetBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { getTitleBarStyle, TitlebarStyle } from "../../../../platform/window/common/window.js";
import { EditorTabsMode, IWorkbenchLayoutService, LayoutSettings, Parts } from "../../../services/layout/browser/layoutService.js";
import { CONTEXT_DEBUG_STATE, CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG, CONTEXT_IN_DEBUG_MODE, CONTEXT_MULTI_SESSION_DEBUG, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED, IDebugService, State, VIEWLET_ID } from "../common/debug.js";
import { FocusSessionActionViewItem } from "./debugActionViewItems.js";
import { debugToolBarBackground, debugToolBarBorder } from "./debugColors.js";
import { CONTINUE_ID, CONTINUE_LABEL, DISCONNECT_AND_SUSPEND_ID, DISCONNECT_AND_SUSPEND_LABEL, DISCONNECT_ID, DISCONNECT_LABEL, FOCUS_SESSION_ID, FOCUS_SESSION_LABEL, PAUSE_ID, PAUSE_LABEL, RESTART_LABEL, RESTART_SESSION_ID, REVERSE_CONTINUE_ID, STEP_BACK_ID, STEP_INTO_ID, STEP_INTO_LABEL, STEP_OUT_ID, STEP_OUT_LABEL, STEP_OVER_ID, STEP_OVER_LABEL, STOP_ID, STOP_LABEL } from "./debugCommands.js";
import * as icons from "./debugIcons.js";
import "./media/debugToolBar.css";
const DEBUG_TOOLBAR_POSITION_KEY = "debug.actionswidgetposition";
const DEBUG_TOOLBAR_Y_KEY = "debug.actionswidgety";
let DebugToolBar = class extends Themable {
  constructor(notificationService, telemetryService, debugService, layoutService, storageService, configurationService, themeService, instantiationService, menuService, contextKeyService) {
    super(themeService);
    this.notificationService = notificationService;
    this.telemetryService = telemetryService;
    this.debugService = debugService;
    this.layoutService = layoutService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.isVisible = false;
    this.isBuilt = false;
    this.stopActionViewItemDisposables = this._register(new DisposableStore());
    /** coordinate of the debug toolbar per aux window */
    this.auxWindowCoordinates = /* @__PURE__ */ new WeakMap();
    this.trackPixelRatioListener = this._register(new MutableDisposable());
    this.$el = dom.$("div.debug-toolbar");
    const controlsOnTitlebar = getTitleBarStyle(this.configurationService) === TitlebarStyle.CUSTOM;
    const controlsOnLeft = controlsOnTitlebar && platform === Platform.Mac;
    const controlsOnRight = controlsOnTitlebar && (platform === Platform.Windows || platform === Platform.Linux);
    this.$el.style.transform = `translate(
			min(
				max(${controlsOnLeft ? "60px" : "0px"}, calc(-50% + (100vw * var(--x-position)))),
				calc(100vw - 100% - ${controlsOnRight ? "100px" : "0px"})
			),
			var(--y-position)
		)`;
    this.dragArea = dom.append(this.$el, dom.$("div.drag-area" + ThemeIcon.asCSSSelector(icons.debugGripper)));
    const actionBarContainer = dom.append(this.$el, dom.$("div.action-bar-container"));
    this.debugToolBarMenu = menuService.createMenu(MenuId.DebugToolBar, contextKeyService);
    this._register(this.debugToolBarMenu);
    this.activeActions = [];
    this.actionBar = this._register(new ActionBar(actionBarContainer, {
      orientation: ActionsOrientation.HORIZONTAL,
      actionViewItemProvider: (action, options) => {
        if (action.id === FOCUS_SESSION_ID) {
          return this.instantiationService.createInstance(FocusSessionActionViewItem, action, void 0);
        } else if (action.id === STOP_ID || action.id === DISCONNECT_ID) {
          this.stopActionViewItemDisposables.clear();
          const item = this.instantiationService.invokeFunction((accessor) => createDisconnectMenuItemAction(action, this.stopActionViewItemDisposables, accessor, { hoverDelegate: options.hoverDelegate }));
          if (item) {
            return item;
          }
        }
        return createActionViewItem(this.instantiationService, action, options);
      }
    }));
    this.updateScheduler = this._register(new RunOnceScheduler(() => {
      const state = this.debugService.state;
      const toolBarLocation = this.configurationService.getValue("debug").toolBarLocation;
      if (state === State.Inactive || toolBarLocation !== "floating" || this.debugService.getModel().getSessions().every((s) => s.suppressDebugToolbar) || state === State.Initializing && this.debugService.initializingOptions?.suppressDebugToolbar) {
        return this.hide();
      }
      const actions = getFlatActionBarActions(this.debugToolBarMenu.getActions({ shouldForwardArgs: true }));
      if (!arrays.equals(actions, this.activeActions, (first, second) => first.id === second.id && first.enabled === second.enabled)) {
        this.actionBar.clear();
        this.actionBar.push(actions, { icon: true, label: false });
        this.activeActions = actions;
      }
      this.show();
    }, 20));
    this.updateStyles();
    this.registerListeners();
    this.hide();
  }
  registerListeners() {
    this._register(this.debugService.onDidChangeState(() => this.updateScheduler.schedule()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("debug.toolBarLocation")) {
        this.updateScheduler.schedule();
      }
      if (e.affectsConfiguration(LayoutSettings.EDITOR_TABS_MODE) || e.affectsConfiguration(LayoutSettings.COMMAND_CENTER)) {
        this._yRange = void 0;
        this.setCoordinates();
      }
    }));
    this._register(this.debugToolBarMenu.onDidChange(() => this.updateScheduler.schedule()));
    this._register(this.actionBar.actionRunner.onDidRun((e) => {
      if (e.error && !errors.isCancellationError(e.error)) {
        this.notificationService.warn(e.error);
      }
      this.telemetryService.publicLog2("workbenchActionExecuted", { id: e.action.id, from: "debugActionsWidget" });
    }));
    this._register(dom.addDisposableGenericMouseUpListener(this.dragArea, (event) => {
      const mouseClickEvent = new StandardMouseEvent(dom.getWindow(this.dragArea), event);
      if (mouseClickEvent.detail === 2) {
        this.setCoordinates(0.5, this.yDefault);
        this.storePosition();
      }
    }));
    this._register(dom.addDisposableGenericMouseDownListener(this.dragArea, (e) => {
      this.dragArea.classList.add("dragged");
      const activeWindow = dom.getWindow(this.layoutService.activeContainer);
      const originEvent = new StandardMouseEvent(activeWindow, e);
      const originX = this.computeCurrentXPercent();
      const originY = this.getCurrentYPosition();
      const mouseMoveListener = dom.addDisposableGenericMouseMoveListener(activeWindow, (e2) => {
        const mouseMoveEvent = new StandardMouseEvent(activeWindow, e2);
        mouseMoveEvent.preventDefault();
        this.setCoordinates(
          originX + (mouseMoveEvent.posx - originEvent.posx) / activeWindow.innerWidth,
          originY + mouseMoveEvent.posy - originEvent.posy
        );
      });
      const mouseUpListener = dom.addDisposableGenericMouseUpListener(activeWindow, (e2) => {
        this.storePosition();
        this.dragArea.classList.remove("dragged");
        mouseMoveListener.dispose();
        mouseUpListener.dispose();
      });
    }));
    this._register(this.layoutService.onDidChangePartVisibility(() => this.setCoordinates()));
    this._register(this.layoutService.onDidChangeActiveContainer(async () => {
      this._yRange = void 0;
      await this.layoutService.whenContainerStylesLoaded(dom.getWindow(this.layoutService.activeContainer));
      if (this.isBuilt) {
        this.doShowInActiveContainer();
        this.setCoordinates();
      }
    }));
  }
  /**
   * Computes the x percent position at which the toolbar is currently displayed.
   */
  computeCurrentXPercent() {
    const { left, width } = this.$el.getBoundingClientRect();
    return (left + width / 2) / dom.getWindow(this.$el).innerWidth;
  }
  /**
   * Gets the x position set in the style of the toolbar. This may not be its
   * actual position on screen depending on toolbar locations.
   */
  getCurrentXPercent() {
    return Number(this.$el.style.getPropertyValue("--x-position"));
  }
  /** Gets the y position set in the style of the toolbar */
  getCurrentYPosition() {
    return parseInt(this.$el.style.getPropertyValue("--y-position"));
  }
  storePosition() {
    const activeWindow = dom.getWindow(this.layoutService.activeContainer);
    const isMainWindow = this.layoutService.activeContainer === this.layoutService.mainContainer;
    const x = this.getCurrentXPercent();
    const y = this.getCurrentYPosition();
    if (isMainWindow) {
      this.storageService.store(DEBUG_TOOLBAR_POSITION_KEY, x, StorageScope.PROFILE, StorageTarget.MACHINE);
      this.storageService.store(DEBUG_TOOLBAR_Y_KEY, y, StorageScope.PROFILE, StorageTarget.MACHINE);
    } else {
      this.auxWindowCoordinates.set(activeWindow, { x, y });
    }
  }
  updateStyles() {
    super.updateStyles();
    if (this.$el) {
      this.$el.style.backgroundColor = this.getColor(debugToolBarBackground) || "";
      const contrastBorderColor = this.getColor(widgetBorder);
      const borderColor = this.getColor(debugToolBarBorder);
      if (contrastBorderColor) {
        this.$el.style.border = `1px solid ${contrastBorderColor}`;
      } else {
        this.$el.style.border = borderColor ? `solid ${borderColor}` : "none";
        this.$el.style.border = "1px 0";
      }
    }
  }
  /** Gets the stored X position of the middle of the toolbar based on the current window width */
  getStoredXPosition() {
    const currentWindow = dom.getWindow(this.layoutService.activeContainer);
    const isMainWindow = currentWindow === mainWindow;
    const storedPercentage = isMainWindow ? Number(this.storageService.get(DEBUG_TOOLBAR_POSITION_KEY, StorageScope.PROFILE)) : this.auxWindowCoordinates.get(currentWindow)?.x;
    return storedPercentage !== void 0 && !isNaN(storedPercentage) ? storedPercentage : 0.5;
  }
  getStoredYPosition() {
    const currentWindow = dom.getWindow(this.layoutService.activeContainer);
    const isMainWindow = currentWindow === mainWindow;
    const storedY = isMainWindow ? this.storageService.getNumber(DEBUG_TOOLBAR_Y_KEY, StorageScope.PROFILE) : this.auxWindowCoordinates.get(currentWindow)?.y;
    return storedY ?? this.yDefault;
  }
  setCoordinates(x, y) {
    if (!this.isVisible) {
      return;
    }
    x ??= this.getStoredXPosition();
    y ??= this.getStoredYPosition();
    const [yMin, yMax] = this.yRange;
    y = Math.max(yMin, Math.min(y, yMax));
    this.$el.style.setProperty("--x-position", `${x}`);
    this.$el.style.setProperty("--y-position", `${y}px`);
  }
  get yDefault() {
    return this.layoutService.mainContainerOffset.top;
  }
  get yRange() {
    if (!this._yRange) {
      const isTitleBarVisible = this.layoutService.isVisible(Parts.TITLEBAR_PART, dom.getWindow(this.layoutService.activeContainer));
      const yMin = isTitleBarVisible ? 0 : this.layoutService.mainContainerOffset.top;
      let yMax = 0;
      if (isTitleBarVisible) {
        if (this.configurationService.getValue(LayoutSettings.COMMAND_CENTER) === true) {
          yMax += 35;
        } else {
          yMax += 28;
        }
      }
      if (this.configurationService.getValue(LayoutSettings.EDITOR_TABS_MODE) !== EditorTabsMode.NONE) {
        yMax += 35;
      }
      this._yRange = [yMin, yMax];
    }
    return this._yRange;
  }
  show() {
    if (this.isVisible) {
      this.setCoordinates();
      return;
    }
    if (!this.isBuilt) {
      this.isBuilt = true;
      this.doShowInActiveContainer();
    }
    this.isVisible = true;
    dom.show(this.$el);
    this.setCoordinates();
  }
  doShowInActiveContainer() {
    this.layoutService.activeContainer.appendChild(this.$el);
    this.trackPixelRatioListener.value = PixelRatio.getInstance(dom.getWindow(this.$el)).onDidChange(
      () => this.setCoordinates()
    );
  }
  hide() {
    this.isVisible = false;
    dom.hide(this.$el);
  }
  dispose() {
    super.dispose();
    this.$el?.remove();
  }
};
DebugToolBar = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IDebugService),
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IContextKeyService)
], DebugToolBar);
function createDisconnectMenuItemAction(action, disposables, accessor, options) {
  const menuService = accessor.get(IMenuService);
  const contextKeyService = accessor.get(IContextKeyService);
  const instantiationService = accessor.get(IInstantiationService);
  const menu = menuService.getMenuActions(MenuId.DebugToolBarStop, contextKeyService, { shouldForwardArgs: true });
  const secondary = getFlatActionBarActions(menu);
  if (!secondary.length) {
    return void 0;
  }
  const dropdownAction = disposables.add(new Action("notebook.moreRunActions", localize("notebook.moreRunActionsLabel", "More..."), "codicon-chevron-down", true));
  const item = instantiationService.createInstance(
    DropdownWithPrimaryActionViewItem,
    action,
    dropdownAction,
    secondary,
    "debug-stop-actions",
    options
  );
  return item;
}
const debugViewTitleItems = new DisposableStore();
const registerDebugToolBarItem = (id, title, order, icon, when, precondition, alt) => {
  MenuRegistry.appendMenuItem(MenuId.DebugToolBar, {
    group: "navigation",
    when,
    order,
    command: {
      id,
      title,
      icon,
      precondition
    },
    alt
  });
  debugViewTitleItems.add(MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
    group: "navigation",
    when: ContextKeyExpr.and(when, ContextKeyExpr.equals("viewContainer", VIEWLET_ID), CONTEXT_DEBUG_STATE.notEqualsTo("inactive"), ContextKeyExpr.equals("config.debug.toolBarLocation", "docked")),
    order,
    command: {
      id,
      title,
      icon,
      precondition
    }
  }));
};
markAsSingleton(MenuRegistry.onDidChangeMenu((e) => {
  if (e.has(MenuId.DebugToolBar)) {
    debugViewTitleItems.clear();
    const items = MenuRegistry.getMenuItems(MenuId.DebugToolBar);
    for (const i of items) {
      debugViewTitleItems.add(MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
        ...i,
        when: ContextKeyExpr.and(i.when, ContextKeyExpr.equals("viewContainer", VIEWLET_ID), CONTEXT_DEBUG_STATE.notEqualsTo("inactive"), ContextKeyExpr.equals("config.debug.toolBarLocation", "docked"))
      }));
    }
  }
}));
const CONTEXT_TOOLBAR_COMMAND_CENTER = ContextKeyExpr.equals("config.debug.toolBarLocation", "commandCenter");
MenuRegistry.appendMenuItem(MenuId.CommandCenterCenter, {
  submenu: MenuId.DebugToolBar,
  title: "Debug",
  icon: Codicon.debug,
  order: 1,
  when: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_TOOLBAR_COMMAND_CENTER)
});
registerDebugToolBarItem(CONTINUE_ID, CONTINUE_LABEL, 10, icons.debugContinue, CONTEXT_DEBUG_STATE.isEqualTo("stopped"));
registerDebugToolBarItem(PAUSE_ID, PAUSE_LABEL, 10, icons.debugPause, CONTEXT_DEBUG_STATE.notEqualsTo("stopped"), ContextKeyExpr.and(CONTEXT_DEBUG_STATE.isEqualTo("running"), CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG.toNegated()));
registerDebugToolBarItem(STOP_ID, STOP_LABEL, 70, icons.debugStop, CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), void 0, { id: DISCONNECT_ID, title: DISCONNECT_LABEL, icon: icons.debugDisconnect, precondition: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED) });
registerDebugToolBarItem(DISCONNECT_ID, DISCONNECT_LABEL, 70, icons.debugDisconnect, CONTEXT_FOCUSED_SESSION_IS_ATTACH, void 0, { id: STOP_ID, title: STOP_LABEL, icon: icons.debugStop, precondition: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED) });
registerDebugToolBarItem(STEP_OVER_ID, STEP_OVER_LABEL, 20, icons.debugStepOver, void 0, CONTEXT_DEBUG_STATE.isEqualTo("stopped"));
registerDebugToolBarItem(STEP_INTO_ID, STEP_INTO_LABEL, 30, icons.debugStepInto, void 0, CONTEXT_DEBUG_STATE.isEqualTo("stopped"));
registerDebugToolBarItem(STEP_OUT_ID, STEP_OUT_LABEL, 40, icons.debugStepOut, void 0, CONTEXT_DEBUG_STATE.isEqualTo("stopped"));
registerDebugToolBarItem(RESTART_SESSION_ID, RESTART_LABEL, 60, icons.debugRestart);
registerDebugToolBarItem(STEP_BACK_ID, localize("stepBackDebug", "Step Back"), 50, icons.debugStepBack, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_DEBUG_STATE.isEqualTo("stopped"));
registerDebugToolBarItem(REVERSE_CONTINUE_ID, localize("reverseContinue", "Reverse"), 55, icons.debugReverseContinue, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_DEBUG_STATE.isEqualTo("stopped"));
registerDebugToolBarItem(FOCUS_SESSION_ID, FOCUS_SESSION_LABEL, 100, Codicon.listTree, ContextKeyExpr.and(CONTEXT_MULTI_SESSION_DEBUG, CONTEXT_TOOLBAR_COMMAND_CENTER.negate()));
MenuRegistry.appendMenuItem(MenuId.DebugToolBarStop, {
  group: "navigation",
  when: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED),
  order: 0,
  command: {
    id: DISCONNECT_ID,
    title: DISCONNECT_LABEL,
    icon: icons.debugDisconnect
  }
});
MenuRegistry.appendMenuItem(MenuId.DebugToolBarStop, {
  group: "navigation",
  when: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED),
  order: 0,
  command: {
    id: STOP_ID,
    title: STOP_LABEL,
    icon: icons.debugStop
  }
});
MenuRegistry.appendMenuItem(MenuId.DebugToolBarStop, {
  group: "navigation",
  when: ContextKeyExpr.or(
    ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED),
    ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED)
  ),
  order: 0,
  command: {
    id: DISCONNECT_AND_SUSPEND_ID,
    title: DISCONNECT_AND_SUSPEND_LABEL,
    icon: icons.debugDisconnect
  }
});
export {
  DebugToolBar,
  createDisconnectMenuItemAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdUb29sQmFyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgUGl4ZWxSYXRpbyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9waXhlbFJhdGlvLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciwgQWN0aW9uc09yaWVudGF0aW9uLCBJQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IENvZGVXaW5kb3csIG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgSVJ1bkV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgKiBhcyBhcnJheXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0ICogYXMgZXJyb3JzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIG1hcmtBc1NpbmdsZXRvbiwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUGxhdGZvcm0sIHBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEFjdGlvbiwgSUNvbW1hbmRBY3Rpb25UaXRsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IERyb3Bkb3duV2l0aFByaW1hcnlBY3Rpb25WaWV3SXRlbSwgSURyb3Bkb3duV2l0aFByaW1hcnlBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvZHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtLCBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWVudSwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyB3aWRnZXRCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCBUaGVtYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0VGl0bGVCYXJTdHlsZSwgVGl0bGViYXJTdHlsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JUYWJzTW9kZSwgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIExheW91dFNldHRpbmdzLCBQYXJ0cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9ERUJVR19TVEFURSwgQ09OVEVYVF9GT0NVU0VEX1NFU1NJT05fSVNfQVRUQUNILCBDT05URVhUX0ZPQ1VTRURfU0VTU0lPTl9JU19OT19ERUJVRywgQ09OVEVYVF9JTl9ERUJVR19NT0RFLCBDT05URVhUX01VTFRJX1NFU1NJT05fREVCVUcsIENPTlRFWFRfU1RFUF9CQUNLX1NVUFBPUlRFRCwgQ09OVEVYVF9TVVNQRU5EX0RFQlVHR0VFX1NVUFBPUlRFRCwgQ09OVEVYVF9URVJNSU5BVEVfREVCVUdHRUVfU1VQUE9SVEVELCBJRGVidWdDb25maWd1cmF0aW9uLCBJRGVidWdTZXJ2aWNlLCBTdGF0ZSwgVklFV0xFVF9JRCB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBGb2N1c1Nlc3Npb25BY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4vZGVidWdBY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgZGVidWdUb29sQmFyQmFja2dyb3VuZCwgZGVidWdUb29sQmFyQm9yZGVyIH0gZnJvbSAnLi9kZWJ1Z0NvbG9ycy5qcyc7XG5pbXBvcnQgeyBDT05USU5VRV9JRCwgQ09OVElOVUVfTEFCRUwsIERJU0NPTk5FQ1RfQU5EX1NVU1BFTkRfSUQsIERJU0NPTk5FQ1RfQU5EX1NVU1BFTkRfTEFCRUwsIERJU0NPTk5FQ1RfSUQsIERJU0NPTk5FQ1RfTEFCRUwsIEZPQ1VTX1NFU1NJT05fSUQsIEZPQ1VTX1NFU1NJT05fTEFCRUwsIFBBVVNFX0lELCBQQVVTRV9MQUJFTCwgUkVTVEFSVF9MQUJFTCwgUkVTVEFSVF9TRVNTSU9OX0lELCBSRVZFUlNFX0NPTlRJTlVFX0lELCBTVEVQX0JBQ0tfSUQsIFNURVBfSU5UT19JRCwgU1RFUF9JTlRPX0xBQkVMLCBTVEVQX09VVF9JRCwgU1RFUF9PVVRfTEFCRUwsIFNURVBfT1ZFUl9JRCwgU1RFUF9PVkVSX0xBQkVMLCBTVE9QX0lELCBTVE9QX0xBQkVMIH0gZnJvbSAnLi9kZWJ1Z0NvbW1hbmRzLmpzJztcbmltcG9ydCAqIGFzIGljb25zIGZyb20gJy4vZGVidWdJY29ucy5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvZGVidWdUb29sQmFyLmNzcyc7XG5cbmNvbnN0IERFQlVHX1RPT0xCQVJfUE9TSVRJT05fS0VZID0gJ2RlYnVnLmFjdGlvbnN3aWRnZXRwb3NpdGlvbic7XG5jb25zdCBERUJVR19UT09MQkFSX1lfS0VZID0gJ2RlYnVnLmFjdGlvbnN3aWRnZXR5JztcblxuZXhwb3J0IGNsYXNzIERlYnVnVG9vbEJhciBleHRlbmRzIFRoZW1hYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSAkZWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGRyYWdBcmVhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0cHJpdmF0ZSBhY3RpdmVBY3Rpb25zOiBJQWN0aW9uW107XG5cdHByaXZhdGUgdXBkYXRlU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIGRlYnVnVG9vbEJhck1lbnU6IElNZW51O1xuXG5cdHByaXZhdGUgaXNWaXNpYmxlID0gZmFsc2U7XG5cdHByaXZhdGUgaXNCdWlsdCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RvcEFjdGlvblZpZXdJdGVtRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHQvKiogY29vcmRpbmF0ZSBvZiB0aGUgZGVidWcgdG9vbGJhciBwZXIgYXV4IHdpbmRvdyAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGF1eFdpbmRvd0Nvb3JkaW5hdGVzID0gbmV3IFdlYWtNYXA8Q29kZVdpbmRvdywgeyB4OiBudW1iZXI7IHk6IG51bWJlciB8IHVuZGVmaW5lZCB9PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdHJhY2tQaXhlbFJhdGlvTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHRoZW1lU2VydmljZSk7XG5cblx0XHR0aGlzLiRlbCA9IGRvbS4kKCdkaXYuZGVidWctdG9vbGJhcicpO1xuXG5cdFx0Ly8gTm90ZTogY2hhbmdlcyB0byB0aGlzIHNldHRpbmcgcmVxdWlyZSBhIHJlc3RhcnQsIHNvIG5vIG5lZWQgdG8gbGlzdGVuIHRvIGl0LlxuXHRcdGNvbnN0IGNvbnRyb2xzT25UaXRsZWJhciA9IGdldFRpdGxlQmFyU3R5bGUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkgPT09IFRpdGxlYmFyU3R5bGUuQ1VTVE9NO1xuXG5cdFx0Ly8gRG8gbm90IGFsbG93IHRoZSB3aWRnZXQgdG8gb3ZlcmZsb3cgb3IgdW5kZXJmbG93IHdpbmRvdyBjb250cm9scy5cblx0XHQvLyBVc2UgQ1NTIGNhbGN1bGF0aW9ucyB0byBhdm9pZCBoYXZpbmcgdG8gZm9yY2UgbGF5b3V0IHdpdGggYC5jbGllbnRXaWR0aGBcblx0XHRjb25zdCBjb250cm9sc09uTGVmdCA9IGNvbnRyb2xzT25UaXRsZWJhciAmJiBwbGF0Zm9ybSA9PT0gUGxhdGZvcm0uTWFjO1xuXHRcdGNvbnN0IGNvbnRyb2xzT25SaWdodCA9IGNvbnRyb2xzT25UaXRsZWJhciAmJiAocGxhdGZvcm0gPT09IFBsYXRmb3JtLldpbmRvd3MgfHwgcGxhdGZvcm0gPT09IFBsYXRmb3JtLkxpbnV4KTtcblx0XHR0aGlzLiRlbC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKFxuXHRcdFx0bWluKFxuXHRcdFx0XHRtYXgoJHtjb250cm9sc09uTGVmdCA/ICc2MHB4JyA6ICcwcHgnfSwgY2FsYygtNTAlICsgKDEwMHZ3ICogdmFyKC0teC1wb3NpdGlvbikpKSksXG5cdFx0XHRcdGNhbGMoMTAwdncgLSAxMDAlIC0gJHtjb250cm9sc09uUmlnaHQgPyAnMTAwcHgnIDogJzBweCd9KVxuXHRcdFx0KSxcblx0XHRcdHZhcigtLXktcG9zaXRpb24pXG5cdFx0KWA7XG5cblx0XHR0aGlzLmRyYWdBcmVhID0gZG9tLmFwcGVuZCh0aGlzLiRlbCwgZG9tLiQoJ2Rpdi5kcmFnLWFyZWEnICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdHcmlwcGVyKSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9uQmFyQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLiRlbCwgZG9tLiQoJ2Rpdi5hY3Rpb24tYmFyLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLmRlYnVnVG9vbEJhck1lbnUgPSBtZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5EZWJ1Z1Rvb2xCYXIsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnVG9vbEJhck1lbnUpO1xuXG5cdFx0dGhpcy5hY3RpdmVBY3Rpb25zID0gW107XG5cdFx0dGhpcy5hY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKGFjdGlvbkJhckNvbnRhaW5lciwge1xuXHRcdFx0b3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbi5IT1JJWk9OVEFMLFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gRk9DVVNfU0VTU0lPTl9JRCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZvY3VzU2Vzc2lvbkFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYWN0aW9uLmlkID09PSBTVE9QX0lEIHx8IGFjdGlvbi5pZCA9PT0gRElTQ09OTkVDVF9JRCkge1xuXHRcdFx0XHRcdHRoaXMuc3RvcEFjdGlvblZpZXdJdGVtRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdFx0XHRjb25zdCBpdGVtID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBjcmVhdGVEaXNjb25uZWN0TWVudUl0ZW1BY3Rpb24oYWN0aW9uIGFzIE1lbnVJdGVtQWN0aW9uLCB0aGlzLnN0b3BBY3Rpb25WaWV3SXRlbURpc3Bvc2FibGVzLCBhY2Nlc3NvciwgeyBob3ZlckRlbGVnYXRlOiBvcHRpb25zLmhvdmVyRGVsZWdhdGUgfSkpO1xuXHRcdFx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0odGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZVNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhdGU7XG5cdFx0XHRjb25zdCB0b29sQmFyTG9jYXRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLnRvb2xCYXJMb2NhdGlvbjtcblx0XHRcdGlmIChcblx0XHRcdFx0c3RhdGUgPT09IFN0YXRlLkluYWN0aXZlIHx8XG5cdFx0XHRcdHRvb2xCYXJMb2NhdGlvbiAhPT0gJ2Zsb2F0aW5nJyB8fFxuXHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb25zKCkuZXZlcnkocyA9PiBzLnN1cHByZXNzRGVidWdUb29sYmFyKSB8fFxuXHRcdFx0XHQoc3RhdGUgPT09IFN0YXRlLkluaXRpYWxpemluZyAmJiB0aGlzLmRlYnVnU2VydmljZS5pbml0aWFsaXppbmdPcHRpb25zPy5zdXBwcmVzc0RlYnVnVG9vbGJhcilcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5oaWRlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyh0aGlzLmRlYnVnVG9vbEJhck1lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pKTtcblx0XHRcdGlmICghYXJyYXlzLmVxdWFscyhhY3Rpb25zLCB0aGlzLmFjdGl2ZUFjdGlvbnMsIChmaXJzdCwgc2Vjb25kKSA9PiBmaXJzdC5pZCA9PT0gc2Vjb25kLmlkICYmIGZpcnN0LmVuYWJsZWQgPT09IHNlY29uZC5lbmFibGVkKSkge1xuXHRcdFx0XHR0aGlzLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLmFjdGlvbkJhci5wdXNoKGFjdGlvbnMsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdFx0XHR0aGlzLmFjdGl2ZUFjdGlvbnMgPSBhY3Rpb25zO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNob3coKTtcblx0XHR9LCAyMCkpO1xuXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdFx0dGhpcy5oaWRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdGUoKCkgPT4gdGhpcy51cGRhdGVTY2hlZHVsZXIuc2NoZWR1bGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2RlYnVnLnRvb2xCYXJMb2NhdGlvbicpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5FRElUT1JfVEFCU19NT0RFKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLkNPTU1BTkRfQ0VOVEVSKSkge1xuXHRcdFx0XHR0aGlzLl95UmFuZ2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuc2V0Q29vcmRpbmF0ZXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1Rvb2xCYXJNZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMudXBkYXRlU2NoZWR1bGVyLnNjaGVkdWxlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFjdGlvbkJhci5hY3Rpb25SdW5uZXIub25EaWRSdW4oKGU6IElSdW5FdmVudCkgPT4ge1xuXHRcdFx0Ly8gY2hlY2sgZm9yIGVycm9yXG5cdFx0XHRpZiAoZS5lcnJvciAmJiAhZXJyb3JzLmlzQ2FuY2VsbGF0aW9uRXJyb3IoZS5lcnJvcikpIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4oZS5lcnJvcik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGxvZyBpbiB0ZWxlbWV0cnlcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6IGUuYWN0aW9uLmlkLCBmcm9tOiAnZGVidWdBY3Rpb25zV2lkZ2V0JyB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZVVwTGlzdGVuZXIodGhpcy5kcmFnQXJlYSwgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBtb3VzZUNsaWNrRXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGRvbS5nZXRXaW5kb3codGhpcy5kcmFnQXJlYSksIGV2ZW50KTtcblx0XHRcdGlmIChtb3VzZUNsaWNrRXZlbnQuZGV0YWlsID09PSAyKSB7XG5cdFx0XHRcdC8vIGRvdWJsZSBjbGljayBvbiBkZWJ1ZyBiYXIgY2VudGVycyBpdCBhZ2FpbiAjODI1MFxuXHRcdFx0XHR0aGlzLnNldENvb3JkaW5hdGVzKDAuNSwgdGhpcy55RGVmYXVsdCk7XG5cdFx0XHRcdHRoaXMuc3RvcmVQb3NpdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKHRoaXMuZHJhZ0FyZWEsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLmRyYWdBcmVhLmNsYXNzTGlzdC5hZGQoJ2RyYWdnZWQnKTtcblx0XHRcdGNvbnN0IGFjdGl2ZVdpbmRvdyA9IGRvbS5nZXRXaW5kb3codGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcik7XG5cdFx0XHRjb25zdCBvcmlnaW5FdmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoYWN0aXZlV2luZG93LCBlKTtcblxuXHRcdFx0Y29uc3Qgb3JpZ2luWCA9IHRoaXMuY29tcHV0ZUN1cnJlbnRYUGVyY2VudCgpO1xuXHRcdFx0Y29uc3Qgb3JpZ2luWSA9IHRoaXMuZ2V0Q3VycmVudFlQb3NpdGlvbigpO1xuXG5cdFx0XHRjb25zdCBtb3VzZU1vdmVMaXN0ZW5lciA9IGRvbS5hZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlTW92ZUxpc3RlbmVyKGFjdGl2ZVdpbmRvdywgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdFx0Y29uc3QgbW91c2VNb3ZlRXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGFjdGl2ZVdpbmRvdywgZSk7XG5cdFx0XHRcdC8vIFByZXZlbnQgZGVmYXVsdCB0byBzdG9wIGVkaXRvciBzZWxlY3RpbmcgdGV4dCAjODUyNFxuXHRcdFx0XHRtb3VzZU1vdmVFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR0aGlzLnNldENvb3JkaW5hdGVzKFxuXHRcdFx0XHRcdG9yaWdpblggKyAobW91c2VNb3ZlRXZlbnQucG9zeCAtIG9yaWdpbkV2ZW50LnBvc3gpIC8gYWN0aXZlV2luZG93LmlubmVyV2lkdGgsXG5cdFx0XHRcdFx0b3JpZ2luWSArIG1vdXNlTW92ZUV2ZW50LnBvc3kgLSBvcmlnaW5FdmVudC5wb3N5LFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IG1vdXNlVXBMaXN0ZW5lciA9IGRvbS5hZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlVXBMaXN0ZW5lcihhY3RpdmVXaW5kb3csIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdHRoaXMuc3RvcmVQb3NpdGlvbigpO1xuXHRcdFx0XHR0aGlzLmRyYWdBcmVhLmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWdnZWQnKTtcblxuXHRcdFx0XHRtb3VzZU1vdmVMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdG1vdXNlVXBMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxheW91dFNlcnZpY2Uub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eSgoKSA9PiB0aGlzLnNldENvb3JkaW5hdGVzKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGF5b3V0U2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZUNvbnRhaW5lcihhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLl95UmFuZ2UgPSB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIG5vdGU6IHdlIGludGVudGlvbmFsbHkgZG9uJ3Qga2VlcCB0aGUgYWN0aXZlQ29udGFpbmVyIGJlZm9yZSB0aGVcblx0XHRcdC8vIGBhd2FpdGAgY2xhdXNlIHRvIGF2b2lkIGFueSByYWNlcyBkdWUgdG8gcXVpY2tseSBzd2l0Y2hpbmcgd2luZG93cy5cblx0XHRcdGF3YWl0IHRoaXMubGF5b3V0U2VydmljZS53aGVuQ29udGFpbmVyU3R5bGVzTG9hZGVkKGRvbS5nZXRXaW5kb3codGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcikpO1xuXHRcdFx0aWYgKHRoaXMuaXNCdWlsdCkge1xuXHRcdFx0XHR0aGlzLmRvU2hvd0luQWN0aXZlQ29udGFpbmVyKCk7XG5cdFx0XHRcdHRoaXMuc2V0Q29vcmRpbmF0ZXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZXMgdGhlIHggcGVyY2VudCBwb3NpdGlvbiBhdCB3aGljaCB0aGUgdG9vbGJhciBpcyBjdXJyZW50bHkgZGlzcGxheWVkLlxuXHQgKi9cblx0cHJpdmF0ZSBjb21wdXRlQ3VycmVudFhQZXJjZW50KCk6IG51bWJlciB7XG5cdFx0Y29uc3QgeyBsZWZ0LCB3aWR0aCB9ID0gdGhpcy4kZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0cmV0dXJuIChsZWZ0ICsgd2lkdGggLyAyKSAvIGRvbS5nZXRXaW5kb3codGhpcy4kZWwpLmlubmVyV2lkdGg7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgeCBwb3NpdGlvbiBzZXQgaW4gdGhlIHN0eWxlIG9mIHRoZSB0b29sYmFyLiBUaGlzIG1heSBub3QgYmUgaXRzXG5cdCAqIGFjdHVhbCBwb3NpdGlvbiBvbiBzY3JlZW4gZGVwZW5kaW5nIG9uIHRvb2xiYXIgbG9jYXRpb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRDdXJyZW50WFBlcmNlbnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gTnVtYmVyKHRoaXMuJGVsLnN0eWxlLmdldFByb3BlcnR5VmFsdWUoJy0teC1wb3NpdGlvbicpKTtcblx0fVxuXG5cdC8qKiBHZXRzIHRoZSB5IHBvc2l0aW9uIHNldCBpbiB0aGUgc3R5bGUgb2YgdGhlIHRvb2xiYXIgKi9cblx0cHJpdmF0ZSBnZXRDdXJyZW50WVBvc2l0aW9uKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHBhcnNlSW50KHRoaXMuJGVsLnN0eWxlLmdldFByb3BlcnR5VmFsdWUoJy0teS1wb3NpdGlvbicpKTtcblx0fVxuXG5cdHByaXZhdGUgc3RvcmVQb3NpdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVXaW5kb3cgPSBkb20uZ2V0V2luZG93KHRoaXMubGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXIpO1xuXHRcdGNvbnN0IGlzTWFpbldpbmRvdyA9IHRoaXMubGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXIgPT09IHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyO1xuXG5cdFx0Y29uc3QgeCA9IHRoaXMuZ2V0Q3VycmVudFhQZXJjZW50KCk7XG5cdFx0Y29uc3QgeSA9IHRoaXMuZ2V0Q3VycmVudFlQb3NpdGlvbigpO1xuXHRcdGlmIChpc01haW5XaW5kb3cpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoREVCVUdfVE9PTEJBUl9QT1NJVElPTl9LRVksIHgsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShERUJVR19UT09MQkFSX1lfS0VZLCB5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hdXhXaW5kb3dDb29yZGluYXRlcy5zZXQoYWN0aXZlV2luZG93LCB7IHgsIHkgfSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlU3R5bGVzKCk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZVN0eWxlcygpO1xuXG5cdFx0aWYgKHRoaXMuJGVsKSB7XG5cdFx0XHR0aGlzLiRlbC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLmdldENvbG9yKGRlYnVnVG9vbEJhckJhY2tncm91bmQpIHx8ICcnO1xuXG5cdFx0XHRjb25zdCBjb250cmFzdEJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcih3aWRnZXRCb3JkZXIpO1xuXHRcdFx0Y29uc3QgYm9yZGVyQ29sb3IgPSB0aGlzLmdldENvbG9yKGRlYnVnVG9vbEJhckJvcmRlcik7XG5cblx0XHRcdGlmIChjb250cmFzdEJvcmRlckNvbG9yKSB7XG5cdFx0XHRcdHRoaXMuJGVsLnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHtjb250cmFzdEJvcmRlckNvbG9yfWA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLiRlbC5zdHlsZS5ib3JkZXIgPSBib3JkZXJDb2xvciA/IGBzb2xpZCAke2JvcmRlckNvbG9yfWAgOiAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuJGVsLnN0eWxlLmJvcmRlciA9ICcxcHggMCc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqIEdldHMgdGhlIHN0b3JlZCBYIHBvc2l0aW9uIG9mIHRoZSBtaWRkbGUgb2YgdGhlIHRvb2xiYXIgYmFzZWQgb24gdGhlIGN1cnJlbnQgd2luZG93IHdpZHRoICovXG5cdHByaXZhdGUgZ2V0U3RvcmVkWFBvc2l0aW9uKCkge1xuXHRcdGNvbnN0IGN1cnJlbnRXaW5kb3cgPSBkb20uZ2V0V2luZG93KHRoaXMubGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXIpO1xuXHRcdGNvbnN0IGlzTWFpbldpbmRvdyA9IGN1cnJlbnRXaW5kb3cgPT09IG1haW5XaW5kb3c7XG5cdFx0Y29uc3Qgc3RvcmVkUGVyY2VudGFnZSA9IGlzTWFpbldpbmRvd1xuXHRcdFx0PyBOdW1iZXIodGhpcy5zdG9yYWdlU2VydmljZS5nZXQoREVCVUdfVE9PTEJBUl9QT1NJVElPTl9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSlcblx0XHRcdDogdGhpcy5hdXhXaW5kb3dDb29yZGluYXRlcy5nZXQoY3VycmVudFdpbmRvdyk/Lng7XG5cdFx0cmV0dXJuIHN0b3JlZFBlcmNlbnRhZ2UgIT09IHVuZGVmaW5lZCAmJiAhaXNOYU4oc3RvcmVkUGVyY2VudGFnZSkgPyBzdG9yZWRQZXJjZW50YWdlIDogMC41O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdG9yZWRZUG9zaXRpb24oKSB7XG5cdFx0Y29uc3QgY3VycmVudFdpbmRvdyA9IGRvbS5nZXRXaW5kb3codGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcik7XG5cdFx0Y29uc3QgaXNNYWluV2luZG93ID0gY3VycmVudFdpbmRvdyA9PT0gbWFpbldpbmRvdztcblx0XHRjb25zdCBzdG9yZWRZID0gaXNNYWluV2luZG93XG5cdFx0XHQ/IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKERFQlVHX1RPT0xCQVJfWV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKVxuXHRcdFx0OiB0aGlzLmF1eFdpbmRvd0Nvb3JkaW5hdGVzLmdldChjdXJyZW50V2luZG93KT8ueTtcblx0XHRyZXR1cm4gc3RvcmVkWSA/PyB0aGlzLnlEZWZhdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRDb29yZGluYXRlcyh4PzogbnVtYmVyLCB5PzogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzVmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHggPz89IHRoaXMuZ2V0U3RvcmVkWFBvc2l0aW9uKCk7XG5cdFx0eSA/Pz0gdGhpcy5nZXRTdG9yZWRZUG9zaXRpb24oKTtcblxuXHRcdGNvbnN0IFt5TWluLCB5TWF4XSA9IHRoaXMueVJhbmdlO1xuXHRcdHkgPSBNYXRoLm1heCh5TWluLCBNYXRoLm1pbih5LCB5TWF4KSk7XG5cdFx0dGhpcy4kZWwuc3R5bGUuc2V0UHJvcGVydHkoJy0teC1wb3NpdGlvbicsIGAke3h9YCk7XG5cdFx0dGhpcy4kZWwuc3R5bGUuc2V0UHJvcGVydHkoJy0teS1wb3NpdGlvbicsIGAke3l9cHhgKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IHlEZWZhdWx0KCkge1xuXHRcdHJldHVybiB0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lck9mZnNldC50b3A7XG5cdH1cblxuXHRwcml2YXRlIF95UmFuZ2U6IFtudW1iZXIsIG51bWJlcl0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IHlSYW5nZSgpOiBbbnVtYmVyLCBudW1iZXJdIHtcblx0XHRpZiAoIXRoaXMuX3lSYW5nZSkge1xuXHRcdFx0Y29uc3QgaXNUaXRsZUJhclZpc2libGUgPSB0aGlzLmxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlRJVExFQkFSX1BBUlQsIGRvbS5nZXRXaW5kb3codGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcikpO1xuXHRcdFx0Y29uc3QgeU1pbiA9IGlzVGl0bGVCYXJWaXNpYmxlID8gMCA6IHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyT2Zmc2V0LnRvcDtcblx0XHRcdGxldCB5TWF4ID0gMDtcblxuXHRcdFx0aWYgKGlzVGl0bGVCYXJWaXNpYmxlKSB7XG5cdFx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKExheW91dFNldHRpbmdzLkNPTU1BTkRfQ0VOVEVSKSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdHlNYXggKz0gMzU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0eU1heCArPSAyODtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShMYXlvdXRTZXR0aW5ncy5FRElUT1JfVEFCU19NT0RFKSAhPT0gRWRpdG9yVGFic01vZGUuTk9ORSkge1xuXHRcdFx0XHR5TWF4ICs9IDM1O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5feVJhbmdlID0gW3lNaW4sIHlNYXhdO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5feVJhbmdlO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5zZXRDb29yZGluYXRlcygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuaXNCdWlsdCkge1xuXHRcdFx0dGhpcy5pc0J1aWx0ID0gdHJ1ZTtcblx0XHRcdHRoaXMuZG9TaG93SW5BY3RpdmVDb250YWluZXIoKTtcblx0XHR9XG5cblx0XHR0aGlzLmlzVmlzaWJsZSA9IHRydWU7XG5cdFx0ZG9tLnNob3codGhpcy4kZWwpO1xuXHRcdHRoaXMuc2V0Q29vcmRpbmF0ZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9TaG93SW5BY3RpdmVDb250YWluZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLiRlbCk7XG5cdFx0dGhpcy50cmFja1BpeGVsUmF0aW9MaXN0ZW5lci52YWx1ZSA9IFBpeGVsUmF0aW8uZ2V0SW5zdGFuY2UoZG9tLmdldFdpbmRvdyh0aGlzLiRlbCkpLm9uRGlkQ2hhbmdlKFxuXHRcdFx0KCkgPT4gdGhpcy5zZXRDb29yZGluYXRlcygpXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgaGlkZSgpOiB2b2lkIHtcblx0XHR0aGlzLmlzVmlzaWJsZSA9IGZhbHNlO1xuXHRcdGRvbS5oaWRlKHRoaXMuJGVsKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy4kZWw/LnJlbW92ZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVEaXNjb25uZWN0TWVudUl0ZW1BY3Rpb24oYWN0aW9uOiBNZW51SXRlbUFjdGlvbiwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG9wdGlvbnM6IElEcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW1PcHRpb25zKTogSUFjdGlvblZpZXdJdGVtIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbWVudVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU1lbnVTZXJ2aWNlKTtcblx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRjb25zdCBtZW51ID0gbWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkRlYnVnVG9vbEJhclN0b3AsIGNvbnRleHRLZXlTZXJ2aWNlLCB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pO1xuXHRjb25zdCBzZWNvbmRhcnkgPSBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyhtZW51KTtcblxuXHRpZiAoIXNlY29uZGFyeS5sZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgZHJvcGRvd25BY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbignbm90ZWJvb2subW9yZVJ1bkFjdGlvbnMnLCBsb2NhbGl6ZSgnbm90ZWJvb2subW9yZVJ1bkFjdGlvbnNMYWJlbCcsIFwiTW9yZS4uLlwiKSwgJ2NvZGljb24tY2hldnJvbi1kb3duJywgdHJ1ZSkpO1xuXHRjb25zdCBpdGVtID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtLFxuXHRcdGFjdGlvbiBhcyBNZW51SXRlbUFjdGlvbixcblx0XHRkcm9wZG93bkFjdGlvbixcblx0XHRzZWNvbmRhcnksXG5cdFx0J2RlYnVnLXN0b3AtYWN0aW9ucycsXG5cdFx0b3B0aW9ucyk7XG5cdHJldHVybiBpdGVtO1xufVxuXG4vLyBEZWJ1ZyB0b29sYmFyXG5cbmNvbnN0IGRlYnVnVmlld1RpdGxlSXRlbXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5jb25zdCByZWdpc3RlckRlYnVnVG9vbEJhckl0ZW0gPSAoaWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZyB8IElDb21tYW5kQWN0aW9uVGl0bGUsIG9yZGVyOiBudW1iZXIsIGljb24/OiB7IGxpZ2h0PzogVVJJOyBkYXJrPzogVVJJIH0gfCBUaGVtZUljb24sIHdoZW4/OiBDb250ZXh0S2V5RXhwcmVzc2lvbiwgcHJlY29uZGl0aW9uPzogQ29udGV4dEtleUV4cHJlc3Npb24sIGFsdD86IElDb21tYW5kQWN0aW9uKSA9PiB7XG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRGVidWdUb29sQmFyLCB7XG5cdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHR3aGVuLFxuXHRcdG9yZGVyLFxuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRpY29uLFxuXHRcdFx0cHJlY29uZGl0aW9uXG5cdFx0fSxcblx0XHRhbHRcblx0fSk7XG5cblx0Ly8gUmVnaXN0ZXIgYWN0aW9ucyBpbiBkZWJ1ZyB2aWV3bGV0IHdoZW4gdG9vbGJhciBpcyBkb2NrZWRcblx0ZGVidWdWaWV3VGl0bGVJdGVtcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUsIHtcblx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZCh3aGVuLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXInLCBWSUVXTEVUX0lEKSwgQ09OVEVYVF9ERUJVR19TVEFURS5ub3RFcXVhbHNUbygnaW5hY3RpdmUnKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuZGVidWcudG9vbEJhckxvY2F0aW9uJywgJ2RvY2tlZCcpKSxcblx0XHRvcmRlcixcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZCxcblx0XHRcdHRpdGxlLFxuXHRcdFx0aWNvbixcblx0XHRcdHByZWNvbmRpdGlvblxuXHRcdH1cblx0fSkpO1xufTtcblxubWFya0FzU2luZ2xldG9uKE1lbnVSZWdpc3RyeS5vbkRpZENoYW5nZU1lbnUoZSA9PiB7XG5cdC8vIEluIGNhc2UgdGhlIGRlYnVnIHRvb2xiYXIgaXMgZG9ja2VkIHdlIG5lZWQgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIGRvY2tlZCB0b29sYmFyIGhhcyB0aGUgdXAgdG8gZGF0ZSBjb21tYW5kcyByZWdpc3RlcmVkICMxMTU5NDVcblx0aWYgKGUuaGFzKE1lbnVJZC5EZWJ1Z1Rvb2xCYXIpKSB7XG5cdFx0ZGVidWdWaWV3VGl0bGVJdGVtcy5jbGVhcigpO1xuXHRcdGNvbnN0IGl0ZW1zID0gTWVudVJlZ2lzdHJ5LmdldE1lbnVJdGVtcyhNZW51SWQuRGVidWdUb29sQmFyKTtcblx0XHRmb3IgKGNvbnN0IGkgb2YgaXRlbXMpIHtcblx0XHRcdGRlYnVnVmlld1RpdGxlSXRlbXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlLCB7XG5cdFx0XHRcdC4uLmksXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChpLndoZW4sIENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lcicsIFZJRVdMRVRfSUQpLCBDT05URVhUX0RFQlVHX1NUQVRFLm5vdEVxdWFsc1RvKCdpbmFjdGl2ZScpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5kZWJ1Zy50b29sQmFyTG9jYXRpb24nLCAnZG9ja2VkJykpXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG59KSk7XG5cblxuY29uc3QgQ09OVEVYVF9UT09MQkFSX0NPTU1BTkRfQ0VOVEVSID0gQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuZGVidWcudG9vbEJhckxvY2F0aW9uJywgJ2NvbW1hbmRDZW50ZXInKTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kQ2VudGVyQ2VudGVyLCB7XG5cdHN1Ym1lbnU6IE1lbnVJZC5EZWJ1Z1Rvb2xCYXIsXG5cdHRpdGxlOiAnRGVidWcnLFxuXHRpY29uOiBDb2RpY29uLmRlYnVnLFxuXHRvcmRlcjogMSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfSU5fREVCVUdfTU9ERSwgQ09OVEVYVF9UT09MQkFSX0NPTU1BTkRfQ0VOVEVSKVxufSk7XG5cbnJlZ2lzdGVyRGVidWdUb29sQmFySXRlbShDT05USU5VRV9JRCwgQ09OVElOVUVfTEFCRUwsIDEwLCBpY29ucy5kZWJ1Z0NvbnRpbnVlLCBDT05URVhUX0RFQlVHX1NUQVRFLmlzRXF1YWxUbygnc3RvcHBlZCcpKTtcbnJlZ2lzdGVyRGVidWdUb29sQmFySXRlbShQQVVTRV9JRCwgUEFVU0VfTEFCRUwsIDEwLCBpY29ucy5kZWJ1Z1BhdXNlLCBDT05URVhUX0RFQlVHX1NUQVRFLm5vdEVxdWFsc1RvKCdzdG9wcGVkJyksIENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0RFQlVHX1NUQVRFLmlzRXF1YWxUbygncnVubmluZycpLCBDT05URVhUX0ZPQ1VTRURfU0VTU0lPTl9JU19OT19ERUJVRy50b05lZ2F0ZWQoKSkpO1xucmVnaXN0ZXJEZWJ1Z1Rvb2xCYXJJdGVtKFNUT1BfSUQsIFNUT1BfTEFCRUwsIDcwLCBpY29ucy5kZWJ1Z1N0b3AsIENPTlRFWFRfRk9DVVNFRF9TRVNTSU9OX0lTX0FUVEFDSC50b05lZ2F0ZWQoKSwgdW5kZWZpbmVkLCB7IGlkOiBESVNDT05ORUNUX0lELCB0aXRsZTogRElTQ09OTkVDVF9MQUJFTCwgaWNvbjogaWNvbnMuZGVidWdEaXNjb25uZWN0LCBwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0ZPQ1VTRURfU0VTU0lPTl9JU19BVFRBQ0gudG9OZWdhdGVkKCksIENPTlRFWFRfVEVSTUlOQVRFX0RFQlVHR0VFX1NVUFBPUlRFRCksIH0pO1xucmVnaXN0ZXJEZWJ1Z1Rvb2xCYXJJdGVtKERJU0NPTk5FQ1RfSUQsIERJU0NPTk5FQ1RfTEFCRUwsIDcwLCBpY29ucy5kZWJ1Z0Rpc2Nvbm5lY3QsIENPTlRFWFRfRk9DVVNFRF9TRVNTSU9OX0lTX0FUVEFDSCwgdW5kZWZpbmVkLCB7IGlkOiBTVE9QX0lELCB0aXRsZTogU1RPUF9MQUJFTCwgaWNvbjogaWNvbnMuZGVidWdTdG9wLCBwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0ZPQ1VTRURfU0VTU0lPTl9JU19BVFRBQ0gsIENPTlRFWFRfVEVSTUlOQVRFX0RFQlVHR0VFX1NVUFBPUlRFRCksIH0pO1xucmVnaXN0ZXJEZWJ1Z1Rvb2xCYXJJdGVtKFNURVBfT1ZFUl9JRCwgU1RFUF9PVkVSX0xBQkVMLCAyMCwgaWNvbnMuZGVidWdTdGVwT3ZlciwgdW5kZWZpbmVkLCBDT05URVhUX0RFQlVHX1NUQVRFLmlzRXF1YWxUbygnc3RvcHBlZCcpKTtcbnJlZ2lzdGVyRGVidWdUb29sQmFySXRlbShTVEVQX0lOVE9fSUQsIFNURVBfSU5UT19MQUJFTCwgMzAsIGljb25zLmRlYnVnU3RlcEludG8sIHVuZGVmaW5lZCwgQ09OVEVYVF9ERUJVR19TVEFURS5pc0VxdWFsVG8oJ3N0b3BwZWQnKSk7XG5yZWdpc3RlckRlYnVnVG9vbEJhckl0ZW0oU1RFUF9PVVRfSUQsIFNURVBfT1VUX0xBQkVMLCA0MCwgaWNvbnMuZGVidWdTdGVwT3V0LCB1bmRlZmluZWQsIENPTlRFWFRfREVCVUdfU1RBVEUuaXNFcXVhbFRvKCdzdG9wcGVkJykpO1xucmVnaXN0ZXJEZWJ1Z1Rvb2xCYXJJdGVtKFJFU1RBUlRfU0VTU0lPTl9JRCwgUkVTVEFSVF9MQUJFTCwgNjAsIGljb25zLmRlYnVnUmVzdGFydCk7XG5yZWdpc3RlckRlYnVnVG9vbEJhckl0ZW0oU1RFUF9CQUNLX0lELCBsb2NhbGl6ZSgnc3RlcEJhY2tEZWJ1ZycsIFwiU3RlcCBCYWNrXCIpLCA1MCwgaWNvbnMuZGVidWdTdGVwQmFjaywgQ09OVEVYVF9TVEVQX0JBQ0tfU1VQUE9SVEVELCBDT05URVhUX0RFQlVHX1NUQVRFLmlzRXF1YWxUbygnc3RvcHBlZCcpKTtcbnJlZ2lzdGVyRGVidWdUb29sQmFySXRlbShSRVZFUlNFX0NPTlRJTlVFX0lELCBsb2NhbGl6ZSgncmV2ZXJzZUNvbnRpbnVlJywgXCJSZXZlcnNlXCIpLCA1NSwgaWNvbnMuZGVidWdSZXZlcnNlQ29udGludWUsIENPTlRFWFRfU1RFUF9CQUNLX1NVUFBPUlRFRCwgQ09OVEVYVF9ERUJVR19TVEFURS5pc0VxdWFsVG8oJ3N0b3BwZWQnKSk7XG5yZWdpc3RlckRlYnVnVG9vbEJhckl0ZW0oRk9DVVNfU0VTU0lPTl9JRCwgRk9DVVNfU0VTU0lPTl9MQUJFTCwgMTAwLCBDb2RpY29uLmxpc3RUcmVlLCBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9NVUxUSV9TRVNTSU9OX0RFQlVHLCBDT05URVhUX1RPT0xCQVJfQ09NTUFORF9DRU5URVIubmVnYXRlKCkpKTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5EZWJ1Z1Rvb2xCYXJTdG9wLCB7XG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0ZPQ1VTRURfU0VTU0lPTl9JU19BVFRBQ0gudG9OZWdhdGVkKCksIENPTlRFWFRfVEVSTUlOQVRFX0RFQlVHR0VFX1NVUFBPUlRFRCksXG5cdG9yZGVyOiAwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IERJU0NPTk5FQ1RfSUQsXG5cdFx0dGl0bGU6IERJU0NPTk5FQ1RfTEFCRUwsXG5cdFx0aWNvbjogaWNvbnMuZGVidWdEaXNjb25uZWN0XG5cdH1cbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkRlYnVnVG9vbEJhclN0b3AsIHtcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfRk9DVVNFRF9TRVNTSU9OX0lTX0FUVEFDSCwgQ09OVEVYVF9URVJNSU5BVEVfREVCVUdHRUVfU1VQUE9SVEVEKSxcblx0b3JkZXI6IDAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU1RPUF9JRCxcblx0XHR0aXRsZTogU1RPUF9MQUJFTCxcblx0XHRpY29uOiBpY29ucy5kZWJ1Z1N0b3Bcblx0fVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRGVidWdUb29sQmFyU3RvcCwge1xuXHRncm91cDogJ25hdmlnYXRpb24nLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihcblx0XHRDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9GT0NVU0VEX1NFU1NJT05fSVNfQVRUQUNILnRvTmVnYXRlZCgpLCBDT05URVhUX1NVU1BFTkRfREVCVUdHRUVfU1VQUE9SVEVELCBDT05URVhUX1RFUk1JTkFURV9ERUJVR0dFRV9TVVBQT1JURUQpLFxuXHRcdENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0ZPQ1VTRURfU0VTU0lPTl9JU19BVFRBQ0gsIENPTlRFWFRfU1VTUEVORF9ERUJVR0dFRV9TVVBQT1JURUQpLFxuXHQpLFxuXHRvcmRlcjogMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBESVNDT05ORUNUX0FORF9TVVNQRU5EX0lELFxuXHRcdHRpdGxlOiBESVNDT05ORUNUX0FORF9TVVNQRU5EX0xBQkVMLFxuXHRcdGljb246IGljb25zLmRlYnVnRGlzY29ubmVjdFxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVywwQkFBMkM7QUFFL0QsU0FBcUIsa0JBQWtCO0FBQ3ZDLFNBQVMsY0FBdUc7QUFDaEgsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBZTtBQUN4QixZQUFZLFlBQVk7QUFDeEIsU0FBUyxpQkFBaUIsaUJBQWlCLHlCQUF5QjtBQUNwRSxTQUFTLFVBQVUsZ0JBQWdCO0FBQ25DLFNBQVMsaUJBQWlCO0FBRzFCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMseUNBQW9GO0FBQzdGLFNBQVMsc0JBQXNCLCtCQUErQjtBQUM5RCxTQUFnQixjQUFjLFFBQXdCLG9CQUFvQjtBQUMxRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFzQywwQkFBMEI7QUFDekUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxlQUFlLGdCQUFnQjtBQUN4QyxTQUFTLGtCQUFrQixxQkFBcUI7QUFFaEQsU0FBUyxnQkFBZ0IseUJBQXlCLGdCQUFnQixhQUFhO0FBQy9FLFNBQVMscUJBQXFCLG1DQUFtQyxx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
