import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../base/common/lifecycle.js";
import { Event, Emitter } from "../../base/common/event.js";
import { alert } from "../../base/browser/ui/aria/aria.js";
import { EventType, addDisposableListener, getClientArea, size, isAncestorUsingFlowTo, computeScreenAwareSize, getActiveDocument, getWindows, getActiveWindow, isActiveDocument, getWindow, getWindowId, getActiveElement, Dimension } from "../../base/browser/dom.js";
import { onDidChangeFullscreen, isFullscreen, isWCOEnabled } from "../../base/browser/browser.js";
import { isWindows, isLinux, isMacintosh, isWeb, isIOS } from "../../base/common/platform.js";
import { EditorInputCapabilities, isResourceEditorInput, pathsToEditors } from "../common/editor.js";
import { SidebarPart } from "./parts/sidebar/sidebarPart.js";
import { PanelPart } from "./parts/panel/panelPart.js";
import { Position, Parts, PartOpensMaximizedOptions, positionFromString, positionToString, partOpensMaximizedFromString, ActivityBarPosition, LayoutSettings, ZenModeSettings, EditorActionsLocation, shouldShowCustomTitleBar, isHorizontal, isMultiWindowPart } from "../services/layout/browser/layoutService.js";
import { isTemporaryWorkspace, IWorkspaceContextService, WorkbenchState } from "../../platform/workspace/common/workspace.js";
import { IStorageService, StorageScope, StorageTarget } from "../../platform/storage/common/storage.js";
import { IConfigurationService, isConfigured } from "../../platform/configuration/common/configuration.js";
import { ChatAIDisabledSettingId } from "../../platform/chat/common/chatSettings.js";
import { ITitleService } from "../services/title/browser/titleService.js";
import { StartupKind, ILifecycleService } from "../services/lifecycle/common/lifecycle.js";
import { getMenuBarVisibility, hasNativeTitlebar, hasCustomTitlebar, TitleBarSetting, CustomTitleBarVisibility, useWindowControlsOverlay, DEFAULT_EMPTY_WINDOW_SIZE, DEFAULT_WORKSPACE_WINDOW_SIZE, hasNativeMenu, MenuSettings } from "../../platform/window/common/window.js";
import { IHostService } from "../services/host/browser/host.js";
import { IBrowserWorkbenchEnvironmentService } from "../services/environment/browser/environmentService.js";
import { IEditorService } from "../services/editor/common/editorService.js";
import { GroupActivationReason, GroupOrientation, GroupsOrder, IEditorGroupsService } from "../services/editor/common/editorGroupsService.js";
import { SerializableGrid, Orientation, Direction, Sizing } from "../../base/browser/ui/grid/grid.js";
import { Part } from "./part.js";
import { IStatusbarService } from "../services/statusbar/browser/statusbar.js";
import { IFileService } from "../../platform/files/common/files.js";
import { isCodeEditor } from "../../editor/browser/editorBrowser.js";
import { coalesce } from "../../base/common/arrays.js";
import { assertReturnsDefined } from "../../base/common/types.js";
import { INotificationService, NotificationsFilter } from "../../platform/notification/common/notification.js";
import { IThemeService } from "../../platform/theme/common/themeService.js";
import { WINDOW_ACTIVE_BORDER, WINDOW_INACTIVE_BORDER } from "../common/theme.js";
import { URI } from "../../base/common/uri.js";
import { IViewDescriptorService, ViewContainerLocation } from "../common/views.js";
import { DiffEditorInput } from "../common/editor/diffEditorInput.js";
import { mark } from "../../base/common/performance.js";
import { IExtensionService } from "../services/extensions/common/extensions.js";
import { ILogService } from "../../platform/log/common/log.js";
import { DeferredPromise, Promises } from "../../base/common/async.js";
import { IBannerService } from "../services/banner/browser/bannerService.js";
import { IPaneCompositePartService } from "../services/panecomposite/browser/panecomposite.js";
import { AuxiliaryBarPart } from "./parts/auxiliarybar/auxiliaryBarPart.js";
import { ITelemetryService } from "../../platform/telemetry/common/telemetry.js";
import { IAuxiliaryWindowService } from "../services/auxiliaryWindow/browser/auxiliaryWindowService.js";
import { mainWindow } from "../../base/browser/window.js";
import { localize } from "../../nls.js";
var LayoutClasses = /* @__PURE__ */ ((LayoutClasses2) => {
  LayoutClasses2["SIDEBAR_HIDDEN"] = "nosidebar";
  LayoutClasses2["MAIN_EDITOR_AREA_HIDDEN"] = "nomaineditorarea";
  LayoutClasses2["PANEL_HIDDEN"] = "nopanel";
  LayoutClasses2["AUXILIARYBAR_HIDDEN"] = "noauxiliarybar";
  LayoutClasses2["ACTIVITYBAR_HIDDEN"] = "noactivitybar";
  LayoutClasses2["STATUSBAR_HIDDEN"] = "nostatusbar";
  LayoutClasses2["FULLSCREEN"] = "fullscreen";
  LayoutClasses2["MAXIMIZED"] = "maximized";
  LayoutClasses2["WINDOW_BORDER"] = "border";
  LayoutClasses2["NO_SHADOWS"] = "no-shadows";
  LayoutClasses2["FLOATING_PANELS"] = "floating-panels";
  LayoutClasses2["STYLE_OVERRIDE"] = "style-override";
  return LayoutClasses2;
})(LayoutClasses || {});
const COMMAND_CENTER_SETTINGS = [
  "chat.agentsControl.enabled",
  "chat.unifiedAgentsBar.enabled",
  "workbench.navigationControl.enabled",
  "workbench.experimental.share.enabled"
];
const TITLE_BAR_SETTINGS = [
  LayoutSettings.ACTIVITY_BAR_LOCATION,
  LayoutSettings.COMMAND_CENTER,
  ...COMMAND_CENTER_SETTINGS,
  LayoutSettings.EDITOR_ACTIONS_LOCATION,
  LayoutSettings.LAYOUT_ACTIONS,
  MenuSettings.MenuBarVisibility,
  TitleBarSetting.TITLE_BAR_STYLE,
  TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY
];
const DEFAULT_EMPTY_WINDOW_DIMENSIONS = new Dimension(DEFAULT_EMPTY_WINDOW_SIZE.width, DEFAULT_EMPTY_WINDOW_SIZE.height);
const DEFAULT_WORKSPACE_WINDOW_DIMENSIONS = new Dimension(DEFAULT_WORKSPACE_WINDOW_SIZE.width, DEFAULT_WORKSPACE_WINDOW_SIZE.height);
class Layout extends Disposable {
  constructor(parent, layoutOptions) {
    super();
    this.parent = parent;
    this.layoutOptions = layoutOptions;
    //#region Events
    this._onDidChangeZenMode = this._register(new Emitter());
    this.onDidChangeZenMode = this._onDidChangeZenMode.event;
    this._onDidChangeMainEditorCenteredLayout = this._register(new Emitter());
    this.onDidChangeMainEditorCenteredLayout = this._onDidChangeMainEditorCenteredLayout.event;
    this._onDidChangePanelAlignment = this._register(new Emitter());
    this.onDidChangePanelAlignment = this._onDidChangePanelAlignment.event;
    this._onDidChangeWindowMaximized = this._register(new Emitter());
    this.onDidChangeWindowMaximized = this._onDidChangeWindowMaximized.event;
    this._onDidChangePanelPosition = this._register(new Emitter());
    this.onDidChangePanelPosition = this._onDidChangePanelPosition.event;
    this._onDidChangePartVisibility = this._register(new Emitter());
    this.onDidChangePartVisibility = this._onDidChangePartVisibility.event;
    this._onDidChangeNotificationsVisibility = this._register(new Emitter());
    this.onDidChangeNotificationsVisibility = this._onDidChangeNotificationsVisibility.event;
    this._onDidChangeAuxiliaryBarMaximized = this._register(new Emitter());
    this.onDidChangeAuxiliaryBarMaximized = this._onDidChangeAuxiliaryBarMaximized.event;
    this._onDidLayoutMainContainer = this._register(new Emitter());
    this.onDidLayoutMainContainer = this._onDidLayoutMainContainer.event;
    this._onDidLayoutActiveContainer = this._register(new Emitter());
    this.onDidLayoutActiveContainer = this._onDidLayoutActiveContainer.event;
    this._onDidLayoutContainer = this._register(new Emitter());
    this.onDidLayoutContainer = this._onDidLayoutContainer.event;
    this._onDidAddContainer = this._register(new Emitter());
    this.onDidAddContainer = this._onDidAddContainer.event;
    this._onDidChangeActiveContainer = this._register(new Emitter());
    this.onDidChangeActiveContainer = this._onDidChangeActiveContainer.event;
    //#endregion
    //#region Properties
    this.mainContainer = document.createElement("div");
    this.containerStylesLoaded = /* @__PURE__ */ new Map();
    //#endregion
    this.parts = /* @__PURE__ */ new Map();
    this.initialized = false;
    this.disposed = false;
    this._openedDefaultEditors = false;
    this.whenReadyPromise = new DeferredPromise();
    this.whenReady = this.whenReadyPromise.p;
    this.whenRestoredPromise = new DeferredPromise();
    this.whenRestored = this.whenRestoredPromise.p;
    this.restored = false;
    this.inMaximizedAuxiliaryBarTransition = false;
  }
  get activeContainer() {
    return this.getContainerFromDocument(getActiveDocument());
  }
  get containers() {
    const containers = [];
    for (const { window } of getWindows()) {
      containers.push(this.getContainerFromDocument(window.document));
    }
    return containers;
  }
  getContainerFromDocument(targetDocument) {
    if (targetDocument === this.mainContainer.ownerDocument) {
      return this.mainContainer;
    } else {
      return targetDocument.body.getElementsByClassName("monaco-workbench")[0];
    }
  }
  whenContainerStylesLoaded(window) {
    return this.containerStylesLoaded.get(window.vscodeWindowId);
  }
  get mainContainerDimension() {
    return this._mainContainerDimension;
  }
  get activeContainerDimension() {
    return this.getContainerDimension(this.activeContainer);
  }
  getContainerDimension(container) {
    if (container === this.mainContainer) {
      return this.mainContainerDimension;
    } else {
      return getClientArea(container);
    }
  }
  get mainContainerOffset() {
    return this.computeContainerOffset(mainWindow);
  }
  get activeContainerOffset() {
    return this.computeContainerOffset(getWindow(this.activeContainer));
  }
  computeContainerOffset(targetWindow) {
    let top = 0;
    let quickPickTop = 0;
    if (this.isVisible(Parts.BANNER_PART)) {
      top = this.getPart(Parts.BANNER_PART).maximumHeight;
      quickPickTop = top;
    }
    const titlebarVisible = this.isVisible(Parts.TITLEBAR_PART, targetWindow);
    if (titlebarVisible) {
      top += this.getPart(Parts.TITLEBAR_PART).maximumHeight;
      quickPickTop = top;
    }
    const isCommandCenterVisible = titlebarVisible && this.configurationService.getValue(LayoutSettings.COMMAND_CENTER) !== false;
    if (isCommandCenterVisible) {
      quickPickTop = 6;
    }
    return { top, quickPickTop };
  }
  initLayout(accessor) {
    this.environmentService = accessor.get(IBrowserWorkbenchEnvironmentService);
    this.configurationService = accessor.get(IConfigurationService);
    this.hostService = accessor.get(IHostService);
    this.contextService = accessor.get(IWorkspaceContextService);
    this.storageService = accessor.get(IStorageService);
    this.themeService = accessor.get(IThemeService);
    this.extensionService = accessor.get(IExtensionService);
    this.logService = accessor.get(ILogService);
    this.telemetryService = accessor.get(ITelemetryService);
    this.auxiliaryWindowService = accessor.get(IAuxiliaryWindowService);
    this.editorService = accessor.get(IEditorService);
    this.editorGroupService = accessor.get(IEditorGroupsService);
    this.mainPartEditorService = this.editorService.createScoped(this.editorGroupService.mainPart, this._store);
    this.paneCompositeService = accessor.get(IPaneCompositePartService);
    this.viewDescriptorService = accessor.get(IViewDescriptorService);
    this.titleService = accessor.get(ITitleService);
    this.notificationService = accessor.get(INotificationService);
    this.statusBarService = accessor.get(IStatusbarService);
    accessor.get(IBannerService);
    this.registerLayoutListeners();
    this.initLayoutState(accessor.get(ILifecycleService), accessor.get(IFileService));
  }
  registerLayoutListeners() {
    const showEditorIfHidden = (explicitUserAction) => {
      if (this.isVisible(Parts.EDITOR_PART, mainWindow) || // already visible
      this.mainPartEditorService.visibleEditors.length === 0) {
        return;
      }
      if (this.isAuxiliaryBarMaximized()) {
        if (explicitUserAction !== false) {
          this.toggleMaximizedAuxiliaryBar();
        }
      } else {
        this.toggleMaximizedPanel();
      }
    };
    const maybeMaximizeAuxiliaryBar = () => {
      if (this.mainPartEditorService.visibleEditors.length === 0 && this.configurationService.getValue("workbench.secondarySideBar.forceMaximized" /* AUXILIARYBAR_FORCE_MAXIMIZED */) === true) {
        this.setAuxiliaryBarMaximized(true);
        return true;
      }
      return false;
    };
    this.editorGroupService.whenRestored.then(() => {
      this._register(this.mainPartEditorService.onDidVisibleEditorsChange((e) => {
        const handled = maybeMaximizeAuxiliaryBar();
        if (!handled) {
          showEditorIfHidden(e.isExplicit);
        }
      }));
      this._register(this.editorGroupService.mainPart.onDidActivateGroup((e) => {
        if (e.reason !== GroupActivationReason.PART_CLOSE) {
          showEditorIfHidden();
        }
      }));
      this._register(this.mainPartEditorService.onDidActiveEditorChange(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
    });
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if ([
        ...TITLE_BAR_SETTINGS,
        "workbench.sideBar.location" /* SIDEBAR_POSITION */,
        "workbench.statusBar.visible" /* STATUSBAR_VISIBLE */
      ].some((setting) => e.affectsConfiguration(setting))) {
        const enabledCommandCenterAction = COMMAND_CENTER_SETTINGS.some((setting) => e.affectsConfiguration(setting) && this.configurationService.getValue(setting) === true);
        if (enabledCommandCenterAction) {
          if (this.configurationService.getValue(LayoutSettings.COMMAND_CENTER) === false) {
            this.configurationService.updateValue(LayoutSettings.COMMAND_CENTER, true);
            return;
          }
        }
        const editorActionsMovedToTitlebar = e.affectsConfiguration(LayoutSettings.EDITOR_ACTIONS_LOCATION) && this.configurationService.getValue(LayoutSettings.EDITOR_ACTIONS_LOCATION) === EditorActionsLocation.TITLEBAR;
        const commandCenterEnabled = e.affectsConfiguration(LayoutSettings.COMMAND_CENTER) && this.configurationService.getValue(LayoutSettings.COMMAND_CENTER);
        const layoutControlsEnabled = e.affectsConfiguration(LayoutSettings.LAYOUT_ACTIONS) && this.configurationService.getValue(LayoutSettings.LAYOUT_ACTIONS);
        const activityBarMovedToTopOrBottom = e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION) && [ActivityBarPosition.TOP, ActivityBarPosition.BOTTOM].includes(this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION));
        if (activityBarMovedToTopOrBottom || editorActionsMovedToTitlebar || commandCenterEnabled || layoutControlsEnabled) {
          if (this.configurationService.getValue(TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY) === CustomTitleBarVisibility.NEVER) {
            this.configurationService.updateValue(TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY, CustomTitleBarVisibility.AUTO);
            return;
          }
        }
        this.doUpdateLayoutConfiguration();
      }
      if (e.affectsConfiguration(LayoutSettings.SHADOWS)) {
        this.updateShadows();
      }
      if (e.affectsConfiguration(LayoutSettings.MODERN_UI)) {
        this.updateFloatingPanels();
        this.layout();
      }
      if (e.affectsConfiguration("workbench.secondarySideBar.forceMaximized" /* AUXILIARYBAR_FORCE_MAXIMIZED */)) {
        const forceMaximized = this.configurationService.getValue("workbench.secondarySideBar.forceMaximized" /* AUXILIARYBAR_FORCE_MAXIMIZED */);
        if (forceMaximized === true && this.mainPartEditorService.visibleEditors.length === 0) {
          this.setAuxiliaryBarMaximized(true);
        } else if (forceMaximized === false && this.isAuxiliaryBarMaximized()) {
          this.setAuxiliaryBarMaximized(false);
        }
      }
    }));
    this._register(onDidChangeFullscreen((windowId) => this.onFullscreenChanged(windowId)));
    this._register(this.editorGroupService.mainPart.onDidAddGroup(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
    this._register(this.editorGroupService.mainPart.onDidRemoveGroup(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
    this._register(this.editorGroupService.mainPart.onDidChangeGroupMaximized(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
    this._register(addDisposableListener(this.mainContainer, EventType.SCROLL, () => this.mainContainer.scrollTop = 0));
    const showingCustomMenu = (isWindows || isLinux || isWeb) && !hasNativeTitlebar(this.configurationService);
    if (showingCustomMenu) {
      this._register(this.titleService.onMenubarVisibilityChange((visible) => this.onMenubarToggled(visible)));
    }
    this._register(this.themeService.onDidColorThemeChange(() => this.updateWindowBorder()));
    this._register(this.hostService.onDidChangeFocus((focused) => this.onWindowFocusChanged(focused)));
    this._register(this.hostService.onDidChangeActiveWindow(() => this.onActiveWindowChanged()));
    if (isWeb && typeof navigator.windowControlsOverlay === "object") {
      this._register(addDisposableListener(navigator.windowControlsOverlay, "geometrychange", () => this.onDidChangeWCO()));
    }
    this._register(this.auxiliaryWindowService.onDidOpenAuxiliaryWindow(({ window, disposables }) => {
      const windowId = window.window.vscodeWindowId;
      this.containerStylesLoaded.set(windowId, window.whenStylesHaveLoaded);
      window.whenStylesHaveLoaded.then(() => this.containerStylesLoaded.delete(windowId));
      disposables.add(toDisposable(() => this.containerStylesLoaded.delete(windowId)));
      const eventDisposables = disposables.add(new DisposableStore());
      this._onDidAddContainer.fire({ container: window.container, disposables: eventDisposables });
      disposables.add(window.onDidLayout((dimension) => this.handleContainerDidLayout(window.container, dimension)));
    }));
  }
  onMenubarToggled(visible) {
    if (visible !== this.state.runtime.menuBar.toggled) {
      this.state.runtime.menuBar.toggled = visible;
      const menuBarVisibility = getMenuBarVisibility(this.configurationService);
      if (isWeb && menuBarVisibility === "toggle") {
        this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled));
      } else if (this.state.runtime.mainWindowFullscreen && (menuBarVisibility === "toggle" || menuBarVisibility === "classic")) {
        this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled));
      }
      this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
    }
  }
  handleContainerDidLayout(container, dimension) {
    if (container === this.mainContainer) {
      this._onDidLayoutMainContainer.fire(dimension);
    }
    if (isActiveDocument(container)) {
      this._onDidLayoutActiveContainer.fire(dimension);
    }
    this._onDidLayoutContainer.fire({ container, dimension });
  }
  onFullscreenChanged(windowId) {
    if (windowId !== mainWindow.vscodeWindowId) {
      return;
    }
    this.state.runtime.mainWindowFullscreen = isFullscreen(mainWindow);
    if (this.state.runtime.mainWindowFullscreen) {
      this.mainContainer.classList.add("fullscreen" /* FULLSCREEN */);
    } else {
      this.mainContainer.classList.remove("fullscreen" /* FULLSCREEN */);
      const zenModeExitInfo = this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_EXIT_INFO);
      if (zenModeExitInfo.transitionedToFullScreen && this.isZenModeActive()) {
        this.toggleZenMode();
      }
    }
    this.workbenchGrid.edgeSnapping = this.state.runtime.mainWindowFullscreen;
    if (hasCustomTitlebar(this.configurationService)) {
      this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled));
      this.updateWindowBorder(true);
    }
  }
  onActiveWindowChanged() {
    const activeContainerId = this.getActiveContainerId();
    if (this.state.runtime.activeContainerId !== activeContainerId) {
      this.state.runtime.activeContainerId = activeContainerId;
      this.updateWindowBorder();
      this._onDidChangeActiveContainer.fire();
    }
  }
  onWindowFocusChanged(hasFocus) {
    if (this.state.runtime.hasFocus !== hasFocus) {
      this.state.runtime.hasFocus = hasFocus;
      this.updateWindowBorder();
    }
  }
  getActiveContainerId() {
    const activeContainer = this.activeContainer;
    return getWindow(activeContainer).vscodeWindowId;
  }
  doUpdateLayoutConfiguration(skipLayout) {
    this.updateCustomTitleBarVisibility();
    this.updateMenubarVisibility(!!skipLayout);
    this.editorGroupService.whenRestored.then(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED), skipLayout));
  }
  isShadowsDisabled() {
    return this.configurationService.getValue(LayoutSettings.SHADOWS) === false;
  }
  updateShadows() {
    const noShadows = this.isShadowsDisabled();
    for (const container of Array.from(this.containers)) {
      container.classList.toggle("no-shadows" /* NO_SHADOWS */, noShadows);
    }
  }
  isFloatingPanelsEnabled() {
    return this.configurationService.getValue(LayoutSettings.MODERN_UI) === true;
  }
  updateFloatingPanels() {
    this.mainContainer.classList.toggle("floating-panels" /* FLOATING_PANELS */, this.isFloatingPanelsEnabled());
  }
  setSideBarPosition(position) {
    const activityBar = this.getPart(Parts.ACTIVITYBAR_PART);
    const sideBar = this.getPart(Parts.SIDEBAR_PART);
    const auxiliaryBar = this.getPart(Parts.AUXILIARYBAR_PART);
    const newPositionValue = position === Position.LEFT ? "left" : "right";
    const oldPositionValue = position === Position.RIGHT ? "left" : "right";
    const panelAlignment = this.getPanelAlignment();
    const panelPosition = this.getPanelPosition();
    this.stateModel.setRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON, position);
    const activityBarContainer = assertReturnsDefined(activityBar.getContainer());
    const sideBarContainer = assertReturnsDefined(sideBar.getContainer());
    const auxiliaryBarContainer = assertReturnsDefined(auxiliaryBar.getContainer());
    activityBarContainer.classList.remove(oldPositionValue);
    sideBarContainer.classList.remove(oldPositionValue);
    activityBarContainer.classList.add(newPositionValue);
    sideBarContainer.classList.add(newPositionValue);
    auxiliaryBarContainer.classList.remove(newPositionValue);
    auxiliaryBarContainer.classList.add(oldPositionValue);
    activityBar.updateStyles();
    sideBar.updateStyles();
    auxiliaryBar.updateStyles();
    this.adjustPartPositions(position, panelAlignment, panelPosition);
  }
  updateWindowBorder(skipLayout = false) {
    if (isWeb || isWindows || // not working well with zooming (border often not visible)
    (isWindows || isLinux) && useWindowControlsOverlay(this.configurationService) || hasNativeTitlebar(this.configurationService)) {
      return;
    }
    const theme = this.themeService.getColorTheme();
    const activeBorder = theme.getColor(WINDOW_ACTIVE_BORDER);
    const inactiveBorder = theme.getColor(WINDOW_INACTIVE_BORDER);
    const didHaveMainWindowBorder = this.hasMainWindowBorder();
    for (const container of this.containers) {
      const isMainContainer = container === this.mainContainer;
      const isActiveContainer = this.activeContainer === container;
      let windowBorder = false;
      if (!this.state.runtime.mainWindowFullscreen && (activeBorder || inactiveBorder)) {
        windowBorder = true;
        const borderColor = isActiveContainer && this.state.runtime.hasFocus ? activeBorder : inactiveBorder ?? activeBorder;
        container.style.setProperty("--window-border-color", borderColor?.toString() ?? "transparent");
      }
      if (isMainContainer) {
        this.state.runtime.mainWindowBorder = windowBorder;
      }
      container.classList.toggle("border" /* WINDOW_BORDER */, windowBorder);
    }
    if (!skipLayout && didHaveMainWindowBorder !== this.hasMainWindowBorder()) {
      this.layout();
    }
  }
  initLayoutState(lifecycleService, fileService) {
    this._mainContainerDimension = getClientArea(this.parent, this.contextService.getWorkbenchState() === WorkbenchState.EMPTY ? DEFAULT_EMPTY_WINDOW_DIMENSIONS : DEFAULT_WORKSPACE_WINDOW_DIMENSIONS);
    this.stateModel = new LayoutStateModel(this.storageService, this.configurationService, this.contextService, this.environmentService);
    this.stateModel.load({
      mainContainerDimension: this._mainContainerDimension,
      resetLayout: Boolean(this.layoutOptions?.resetLayout)
    });
    this._register(this.stateModel.onDidChangeState((change) => {
      if (change.key === LayoutStateKeys.ACTIVITYBAR_HIDDEN) {
        this.setActivityBarHidden(change.value);
      }
      if (change.key === LayoutStateKeys.STATUSBAR_HIDDEN) {
        this.setStatusBarHidden(change.value);
      }
      if (change.key === LayoutStateKeys.SIDEBAR_POSITON) {
        this.setSideBarPosition(change.value);
      }
      if (change.key === LayoutStateKeys.PANEL_POSITION) {
        this.setPanelPosition(change.value);
      }
      if (change.key === LayoutStateKeys.PANEL_ALIGNMENT) {
        this.setPanelAlignment(change.value);
      }
      this.doUpdateLayoutConfiguration();
    }));
    const initialEditorsState = this.getInitialEditorsState();
    if (initialEditorsState) {
      this.logService.trace("Initial editor state", initialEditorsState);
    }
    const initialLayoutState = {
      layout: {
        editors: initialEditorsState?.layout
      },
      editor: {
        restoreEditors: this.shouldRestoreEditors(this.contextService, initialEditorsState),
        editorsToOpen: this.resolveEditorsToOpen(fileService, initialEditorsState)
      },
      views: {
        defaults: this.getDefaultLayoutViews(this.environmentService, this.storageService),
        containerToRestore: {}
      }
    };
    const layoutRuntimeState = {
      activeContainerId: this.getActiveContainerId(),
      mainWindowFullscreen: isFullscreen(mainWindow),
      hasFocus: this.hostService.hasFocus,
      maximized: /* @__PURE__ */ new Set(),
      mainWindowBorder: false,
      menuBar: {
        toggled: false
      },
      zenMode: {
        transitionDisposables: new DisposableMap()
      }
    };
    this.state = {
      initialization: initialLayoutState,
      runtime: layoutRuntimeState
    };
    if (this.isVisible(Parts.SIDEBAR_PART)) {
      let viewContainerToRestore = this.storageService.get(SidebarPart.activeViewletSettingsKey, StorageScope.WORKSPACE, this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Sidebar)?.id);
      if (!this.environmentService.isBuilt || lifecycleService.startupKind === StartupKind.ReloadedWindow || this.environmentService.isExtensionDevelopment && !this.environmentService.extensionTestsLocationURI) {
      } else if (viewContainerToRestore !== this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Sidebar)?.id && viewContainerToRestore !== this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.AuxiliaryBar)?.id) {
        viewContainerToRestore = this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Sidebar)?.id;
      }
      if (viewContainerToRestore) {
        this.state.initialization.views.containerToRestore.sideBar = viewContainerToRestore;
      } else {
        this.stateModel.setRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN, true);
      }
    }
    if (this.isVisible(Parts.PANEL_PART)) {
      const viewContainerToRestore = this.storageService.get(PanelPart.activePanelSettingsKey, StorageScope.WORKSPACE, this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Panel)?.id);
      if (viewContainerToRestore) {
        this.state.initialization.views.containerToRestore.panel = viewContainerToRestore;
      } else {
        this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_HIDDEN, true);
      }
    }
    if (this.isVisible(Parts.AUXILIARYBAR_PART)) {
      const viewContainerToRestore = this.storageService.get(AuxiliaryBarPart.activeViewSettingsKey, StorageScope.WORKSPACE, this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.AuxiliaryBar)?.id);
      if (viewContainerToRestore) {
        this.state.initialization.views.containerToRestore.auxiliaryBar = viewContainerToRestore;
      } else {
        this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, true);
      }
    }
    this.updateWindowBorder(true);
  }
  getDefaultLayoutViews(environmentService, storageService) {
    const defaultLayout = environmentService.options?.defaultLayout;
    if (!defaultLayout) {
      return void 0;
    }
    if (!defaultLayout.force && !storageService.isNew(StorageScope.WORKSPACE)) {
      return void 0;
    }
    const { views } = defaultLayout;
    if (views?.length) {
      return views.map((view) => view.id);
    }
    return void 0;
  }
  shouldRestoreEditors(contextService, initialEditorsState) {
    if (isTemporaryWorkspace(contextService.getWorkspace())) {
      return false;
    }
    if (this.configurationService.getValue("workbench.editor.restoreEditors" /* EDITOR_RESTORE_EDITORS */) === false) {
      return false;
    }
    const forceRestoreEditors = this.configurationService.getValue("window.restoreWindows") === "preserve";
    return !!forceRestoreEditors || initialEditorsState === void 0;
  }
  willRestoreEditors() {
    return this.state.initialization.editor.restoreEditors;
  }
  async resolveEditorsToOpen(fileService, initialEditorsState) {
    if (initialEditorsState) {
      const filesToMerge = coalesce(await pathsToEditors(initialEditorsState.filesToMerge, fileService, this.logService));
      if (filesToMerge.length === 4 && isResourceEditorInput(filesToMerge[0]) && isResourceEditorInput(filesToMerge[1]) && isResourceEditorInput(filesToMerge[2]) && isResourceEditorInput(filesToMerge[3])) {
        return [{
          editor: {
            input1: { resource: filesToMerge[0].resource },
            input2: { resource: filesToMerge[1].resource },
            base: { resource: filesToMerge[2].resource },
            result: { resource: filesToMerge[3].resource },
            options: { pinned: true }
          }
        }];
      }
      const filesToDiff = coalesce(await pathsToEditors(initialEditorsState.filesToDiff, fileService, this.logService));
      if (filesToDiff.length === 2) {
        return [{
          editor: {
            original: { resource: filesToDiff[0].resource },
            modified: { resource: filesToDiff[1].resource },
            options: { pinned: true }
          }
        }];
      }
      const filesToOpenOrCreate = [];
      const resolvedFilesToOpenOrCreate = await pathsToEditors(initialEditorsState.filesToOpenOrCreate, fileService, this.logService);
      for (let i = 0; i < resolvedFilesToOpenOrCreate.length; i++) {
        const resolvedFileToOpenOrCreate = resolvedFilesToOpenOrCreate[i];
        if (resolvedFileToOpenOrCreate) {
          filesToOpenOrCreate.push({
            editor: resolvedFileToOpenOrCreate,
            viewColumn: initialEditorsState.filesToOpenOrCreate?.[i].viewColumn
            // take over `viewColumn` from initial state
          });
        }
      }
      return filesToOpenOrCreate;
    } else if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY && this.configurationService.getValue("workbench.startupEditor") === "newUntitledFile") {
      if (this.editorGroupService.hasRestorableState) {
        return [];
      }
      return [{
        editor: { resource: void 0 }
        // open empty untitled file
      }];
    }
    return [];
  }
  get openedDefaultEditors() {
    return this._openedDefaultEditors;
  }
  getInitialEditorsState() {
    const defaultLayout = this.environmentService.options?.defaultLayout;
    if ((defaultLayout?.editors?.length || defaultLayout?.layout?.editors) && (defaultLayout.force || this.storageService.isNew(StorageScope.WORKSPACE))) {
      this._openedDefaultEditors = true;
      return {
        layout: defaultLayout.layout?.editors,
        filesToOpenOrCreate: defaultLayout?.editors?.map((editor) => {
          return {
            viewColumn: editor.viewColumn,
            fileUri: URI.revive(editor.uri),
            openOnlyIfExists: editor.openOnlyIfExists,
            options: editor.options
          };
        })
      };
    }
    const { filesToOpenOrCreate, filesToDiff, filesToMerge } = this.environmentService;
    if (filesToOpenOrCreate || filesToDiff || filesToMerge) {
      return { filesToOpenOrCreate, filesToDiff, filesToMerge };
    }
    return void 0;
  }
  isRestored() {
    return this.restored;
  }
  restoreParts() {
    const layoutReadyPromises = [];
    const layoutRestoredPromises = [];
    layoutReadyPromises.push((async () => {
      mark("code/willRestoreEditors");
      await this.editorGroupService.whenReady;
      mark("code/restoreEditors/editorGroupsReady");
      if (this.state.initialization.layout?.editors) {
        this.editorGroupService.mainPart.applyLayout(this.state.initialization.layout.editors);
      }
      const editors = await this.state.initialization.editor.editorsToOpen;
      mark("code/restoreEditors/editorsToOpenResolved");
      let openEditorsPromise = void 0;
      if (editors.length) {
        const editorGroupsInVisualOrder = this.editorGroupService.mainPart.getGroups(GroupsOrder.GRID_APPEARANCE);
        const mapEditorsToGroup = /* @__PURE__ */ new Map();
        for (const editor of editors) {
          const group = editorGroupsInVisualOrder[(editor.viewColumn ?? 1) - 1];
          let editorsByGroup = mapEditorsToGroup.get(group.id);
          if (!editorsByGroup) {
            editorsByGroup = /* @__PURE__ */ new Set();
            mapEditorsToGroup.set(group.id, editorsByGroup);
          }
          editorsByGroup.add(editor.editor);
        }
        openEditorsPromise = Promise.all(Array.from(mapEditorsToGroup).map(async ([groupId, editors2]) => {
          try {
            await this.editorService.openEditors(Array.from(editors2), groupId, { validateTrust: true });
          } catch (error) {
            this.logService.error(error);
          }
        }));
      }
      layoutRestoredPromises.push(
        Promise.all([
          openEditorsPromise?.finally(() => mark("code/restoreEditors/editorsOpened")),
          this.editorGroupService.whenRestored.finally(() => mark("code/restoreEditors/editorGroupsRestored"))
        ]).finally(() => {
          mark("code/didRestoreEditors");
        })
      );
    })());
    const restoreDefaultViewsPromise = (async () => {
      if (this.state.initialization.views.defaults?.length) {
        mark("code/willOpenDefaultViews");
        const locationsRestored = [];
        const tryOpenView = (view) => {
          const location = this.viewDescriptorService.getViewLocationById(view.id);
          if (location !== null) {
            const container = this.viewDescriptorService.getViewContainerByViewId(view.id);
            if (container) {
              if (view.order >= (locationsRestored?.[location]?.order ?? 0)) {
                locationsRestored[location] = { id: container.id, order: view.order };
              }
              const containerModel = this.viewDescriptorService.getViewContainerModel(container);
              containerModel.setCollapsed(view.id, false);
              containerModel.setVisible(view.id, true);
              return true;
            }
          }
          return false;
        };
        const defaultViews = [...this.state.initialization.views.defaults].reverse().map((v, index) => ({ id: v, order: index }));
        let i = defaultViews.length;
        while (i) {
          i--;
          if (tryOpenView(defaultViews[i])) {
            defaultViews.splice(i, 1);
          }
        }
        if (defaultViews.length) {
          await this.extensionService.whenInstalledExtensionsRegistered();
          let i2 = defaultViews.length;
          while (i2) {
            i2--;
            if (tryOpenView(defaultViews[i2])) {
              defaultViews.splice(i2, 1);
            }
          }
        }
        if (locationsRestored[ViewContainerLocation.Sidebar]) {
          this.state.initialization.views.containerToRestore.sideBar = locationsRestored[ViewContainerLocation.Sidebar].id;
        }
        if (locationsRestored[ViewContainerLocation.Panel]) {
          this.state.initialization.views.containerToRestore.panel = locationsRestored[ViewContainerLocation.Panel].id;
        }
        if (locationsRestored[ViewContainerLocation.AuxiliaryBar]) {
          this.state.initialization.views.containerToRestore.auxiliaryBar = locationsRestored[ViewContainerLocation.AuxiliaryBar].id;
        }
        mark("code/didOpenDefaultViews");
      }
    })();
    layoutReadyPromises.push(restoreDefaultViewsPromise);
    layoutReadyPromises.push((async () => {
      await restoreDefaultViewsPromise;
      if (!this.state.initialization.views.containerToRestore.sideBar) {
        return;
      }
      mark("code/willRestoreViewlet");
      await this.openViewContainer(ViewContainerLocation.Sidebar, this.state.initialization.views.containerToRestore.sideBar);
      mark("code/didRestoreViewlet");
    })());
    layoutReadyPromises.push((async () => {
      await restoreDefaultViewsPromise;
      if (!this.state.initialization.views.containerToRestore.panel) {
        return;
      }
      mark("code/willRestorePanel");
      await this.openViewContainer(ViewContainerLocation.Panel, this.state.initialization.views.containerToRestore.panel);
      mark("code/didRestorePanel");
    })());
    layoutReadyPromises.push((async () => {
      await restoreDefaultViewsPromise;
      if (!this.state.initialization.views.containerToRestore.auxiliaryBar) {
        return;
      }
      mark("code/willRestoreAuxiliaryBar");
      await this.openViewContainer(ViewContainerLocation.AuxiliaryBar, this.state.initialization.views.containerToRestore.auxiliaryBar);
      mark("code/didRestoreAuxiliaryBar");
    })());
    const zenModeWasActive = this.isZenModeActive();
    const restoreZenMode = getZenModeConfiguration(this.configurationService).restore;
    if (zenModeWasActive) {
      this.setZenModeActive(!restoreZenMode);
      this.toggleZenMode(false, true);
    }
    if (this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED)) {
      this.centerMainEditorLayout(true, true);
    }
    Promises.settled(layoutReadyPromises).finally(() => {
      if (getActiveElement() === mainWindow.document.body && (this.isPanelMaximized() || this.isAuxiliaryBarMaximized())) {
        this.focus();
      }
      this.whenReadyPromise.complete();
      Promises.settled(layoutRestoredPromises).finally(() => {
        if (this.editorService.editors.length === 0 && // no editors opened or restored
        this.isVisible(Parts.AUXILIARYBAR_PART) && // auxiliary bar is visible
        !this.hasFocus(Parts.AUXILIARYBAR_PART) && // auxiliary bar does not have focus yet
        !this.environmentService.enableSmokeTestDriver) {
          this.focusPart(Parts.AUXILIARYBAR_PART);
        }
        this.restored = true;
        this.whenRestoredPromise.complete();
      });
    });
  }
  async openViewContainer(location, id, focus) {
    let viewContainer = await this.paneCompositeService.openPaneComposite(id, location, focus);
    if (viewContainer) {
      return;
    }
    viewContainer = await this.paneCompositeService.openPaneComposite(this.viewDescriptorService.getDefaultViewContainer(location)?.id, location, focus);
    if (viewContainer) {
      return;
    }
    await this.paneCompositeService.openPaneComposite(this.paneCompositeService.getVisiblePaneCompositeIds(location).at(0), location, focus);
  }
  registerPart(part) {
    const id = part.getId();
    this.parts.set(id, part);
    return toDisposable(() => this.parts.delete(id));
  }
  getPart(key) {
    const part = this.parts.get(key);
    if (!part) {
      throw new Error(`Unknown part ${key}`);
    }
    return part;
  }
  registerNotifications(delegate) {
    this._register(delegate.onDidChangeNotificationsVisibility((visible) => this._onDidChangeNotificationsVisibility.fire(visible)));
  }
  hasFocus(part) {
    const container = this.getContainer(getActiveWindow(), part);
    if (!container) {
      return false;
    }
    const activeElement = getActiveElement();
    if (!activeElement) {
      return false;
    }
    return isAncestorUsingFlowTo(activeElement, container);
  }
  _getFocusedPart() {
    for (const part of this.parts.keys()) {
      if (this.hasFocus(part)) {
        return part;
      }
    }
    return void 0;
  }
  focusPart(part, targetWindow = mainWindow) {
    const container = this.getContainer(targetWindow, part) ?? this.mainContainer;
    switch (part) {
      case Parts.EDITOR_PART:
        this.editorGroupService.getPart(container).activeGroup.focus();
        break;
      case Parts.PANEL_PART: {
        this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)?.focus();
        break;
      }
      case Parts.SIDEBAR_PART: {
        this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)?.focus();
        break;
      }
      case Parts.AUXILIARYBAR_PART: {
        this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.focus();
        break;
      }
      case Parts.ACTIVITYBAR_PART:
        this.getPart(Parts.SIDEBAR_PART).focusActivityBar();
        break;
      case Parts.STATUSBAR_PART:
        this.statusBarService.getPart(container).focus();
        break;
      default: {
        container?.focus();
      }
    }
  }
  getContainer(targetWindow, part) {
    if (typeof part === "undefined") {
      return this.getContainerFromDocument(targetWindow.document);
    }
    if (targetWindow === mainWindow) {
      return this.getPart(part).getContainer();
    }
    let partCandidate;
    if (part === Parts.EDITOR_PART) {
      partCandidate = this.editorGroupService.getPart(this.getContainerFromDocument(targetWindow.document));
    } else if (part === Parts.STATUSBAR_PART) {
      partCandidate = this.statusBarService.getPart(this.getContainerFromDocument(targetWindow.document));
    } else if (part === Parts.TITLEBAR_PART) {
      partCandidate = this.titleService.getPart(this.getContainerFromDocument(targetWindow.document));
    }
    if (partCandidate instanceof Part) {
      return partCandidate.getContainer();
    }
    return void 0;
  }
  isVisible(part, targetWindow = mainWindow) {
    if (targetWindow !== mainWindow && part === Parts.EDITOR_PART) {
      return true;
    }
    switch (part) {
      case Parts.TITLEBAR_PART:
        return this.initialized ? this.workbenchGrid.isViewVisible(this.titleBarPartView) : shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled);
      case Parts.SIDEBAR_PART:
        return !this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN);
      case Parts.PANEL_PART:
        return !this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN);
      case Parts.AUXILIARYBAR_PART:
        return !this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN);
      case Parts.STATUSBAR_PART:
        return !this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN);
      case Parts.ACTIVITYBAR_PART:
        return !this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN);
      case Parts.EDITOR_PART:
        return !this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN);
      case Parts.BANNER_PART:
        return this.initialized ? this.workbenchGrid.isViewVisible(this.bannerPartView) : false;
      default:
        return false;
    }
  }
  shouldShowBannerFirst() {
    return isWeb && !isWCOEnabled();
  }
  focus() {
    if (this.isPanelMaximized() && this.mainContainer === this.activeContainer) {
      this.focusPart(Parts.PANEL_PART);
    } else if (this.isAuxiliaryBarMaximized() && this.mainContainer === this.activeContainer) {
      this.focusPart(Parts.AUXILIARYBAR_PART);
    } else {
      this.focusPart(Parts.EDITOR_PART, getWindow(this.activeContainer));
    }
  }
  focusPanelOrEditor() {
    const activePanel = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
    if ((this.hasFocus(Parts.PANEL_PART) || !this.isVisible(Parts.EDITOR_PART)) && activePanel) {
      activePanel.focus();
    } else {
      this.focus();
    }
  }
  getMaximumEditorDimensions(container) {
    const targetWindow = getWindow(container);
    const containerDimension = this.getContainerDimension(container);
    if (container === this.mainContainer) {
      const isPanelHorizontal = isHorizontal(this.getPanelPosition());
      const takenWidth = (this.isVisible(Parts.ACTIVITYBAR_PART) ? this.activityBarPartView.minimumWidth : 0) + (this.isVisible(Parts.SIDEBAR_PART) ? this.sideBarPartView.minimumWidth : 0) + (this.isVisible(Parts.PANEL_PART) && !isPanelHorizontal ? this.panelPartView.minimumWidth : 0) + (this.isVisible(Parts.AUXILIARYBAR_PART) ? this.auxiliaryBarPartView.minimumWidth : 0);
      const takenHeight = (this.isVisible(Parts.TITLEBAR_PART, targetWindow) ? this.titleBarPartView.minimumHeight : 0) + (this.isVisible(Parts.STATUSBAR_PART, targetWindow) ? this.statusBarPartView.minimumHeight : 0) + (this.isVisible(Parts.PANEL_PART) && isPanelHorizontal ? this.panelPartView.minimumHeight : 0);
      const availableWidth = containerDimension.width - takenWidth;
      const availableHeight = containerDimension.height - takenHeight;
      return { width: availableWidth, height: availableHeight };
    } else {
      const takenHeight = (this.isVisible(Parts.TITLEBAR_PART, targetWindow) ? this.titleBarPartView.minimumHeight : 0) + (this.isVisible(Parts.STATUSBAR_PART, targetWindow) ? this.statusBarPartView.minimumHeight : 0);
      return { width: containerDimension.width, height: containerDimension.height - takenHeight };
    }
  }
  isZenModeActive() {
    return this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
  }
  setZenModeActive(active) {
    this.stateModel.setRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE, active);
  }
  toggleZenMode(skipLayout, restoring = false) {
    const focusedPartPreTransition = this._getFocusedPart();
    this.setZenModeActive(!this.isZenModeActive());
    this.state.runtime.zenMode.transitionDisposables.clearAndDisposeAll();
    const setLineNumbers = (lineNumbers) => {
      for (const editor of this.mainPartEditorService.visibleTextEditorControls) {
        if (!lineNumbers && isCodeEditor(editor) && editor.hasModel()) {
          const model = editor.getModel();
          lineNumbers = this.configurationService.getValue("editor.lineNumbers", { resource: model.uri, overrideIdentifier: model.getLanguageId() });
        }
        if (!lineNumbers) {
          lineNumbers = this.configurationService.getValue("editor.lineNumbers");
        }
        editor.updateOptions({ lineNumbers });
      }
    };
    let toggleMainWindowFullScreen = false;
    const config = getZenModeConfiguration(this.configurationService);
    const zenModeExitInfo = this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_EXIT_INFO);
    if (this.isZenModeActive()) {
      toggleMainWindowFullScreen = !this.state.runtime.mainWindowFullscreen && config.fullScreen && !isIOS;
      if (!restoring) {
        zenModeExitInfo.transitionedToFullScreen = toggleMainWindowFullScreen;
        zenModeExitInfo.transitionedToCenteredEditorLayout = !this.isMainEditorLayoutCentered() && config.centerLayout;
        zenModeExitInfo.handleNotificationsDoNotDisturbMode = this.notificationService.getFilter() === NotificationsFilter.OFF;
        zenModeExitInfo.wasVisible.sideBar = this.isVisible(Parts.SIDEBAR_PART);
        zenModeExitInfo.wasVisible.panel = this.isVisible(Parts.PANEL_PART);
        zenModeExitInfo.wasVisible.auxiliaryBar = this.isVisible(Parts.AUXILIARYBAR_PART);
        this.stateModel.setRuntimeValue(LayoutStateKeys.ZEN_MODE_EXIT_INFO, zenModeExitInfo);
      }
      this.setPanelHidden(true, true);
      this.setAuxiliaryBarHidden(true, true);
      this.setSideBarHidden(true);
      if (config.hideActivityBar) {
        this.setActivityBarHidden(true);
      }
      if (config.hideStatusBar) {
        this.setStatusBarHidden(true);
      }
      if (config.hideLineNumbers) {
        setLineNumbers("off");
        this.state.runtime.zenMode.transitionDisposables.set(ZenModeSettings.HIDE_LINENUMBERS, this.mainPartEditorService.onDidVisibleEditorsChange(() => setLineNumbers("off")));
      }
      if (config.showTabs !== this.editorGroupService.partOptions.showTabs) {
        this.state.runtime.zenMode.transitionDisposables.set(ZenModeSettings.SHOW_TABS, this.editorGroupService.mainPart.enforcePartOptions({ showTabs: config.showTabs }));
      }
      if (config.silentNotifications && zenModeExitInfo.handleNotificationsDoNotDisturbMode) {
        this.notificationService.setFilter(NotificationsFilter.ERROR);
      }
      if (config.centerLayout) {
        this.centerMainEditorLayout(true, true);
      }
      this.state.runtime.zenMode.transitionDisposables.set("configurationChange", this.configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(ZenModeSettings.HIDE_ACTIVITYBAR) || e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
          const zenModeHideActivityBar = this.configurationService.getValue(ZenModeSettings.HIDE_ACTIVITYBAR);
          const activityBarLocation = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION);
          this.setActivityBarHidden(zenModeHideActivityBar ? true : activityBarLocation === ActivityBarPosition.TOP || activityBarLocation === ActivityBarPosition.BOTTOM);
        }
        if (e.affectsConfiguration(ZenModeSettings.HIDE_STATUSBAR)) {
          const zenModeHideStatusBar = this.configurationService.getValue(ZenModeSettings.HIDE_STATUSBAR);
          this.setStatusBarHidden(zenModeHideStatusBar);
        }
        if (e.affectsConfiguration(ZenModeSettings.CENTER_LAYOUT)) {
          const zenModeCenterLayout = this.configurationService.getValue(ZenModeSettings.CENTER_LAYOUT);
          this.centerMainEditorLayout(zenModeCenterLayout, true);
        }
        if (e.affectsConfiguration(ZenModeSettings.SHOW_TABS)) {
          const zenModeShowTabs = this.configurationService.getValue(ZenModeSettings.SHOW_TABS) ?? "multiple";
          this.state.runtime.zenMode.transitionDisposables.set(ZenModeSettings.SHOW_TABS, this.editorGroupService.mainPart.enforcePartOptions({ showTabs: zenModeShowTabs }));
        }
        if (e.affectsConfiguration(ZenModeSettings.SILENT_NOTIFICATIONS)) {
          const zenModeSilentNotifications = !!this.configurationService.getValue(ZenModeSettings.SILENT_NOTIFICATIONS);
          if (zenModeExitInfo.handleNotificationsDoNotDisturbMode) {
            this.notificationService.setFilter(zenModeSilentNotifications ? NotificationsFilter.ERROR : NotificationsFilter.OFF);
          }
        }
        if (e.affectsConfiguration(ZenModeSettings.HIDE_LINENUMBERS)) {
          const lineNumbersType = this.configurationService.getValue(ZenModeSettings.HIDE_LINENUMBERS) ? "off" : void 0;
          setLineNumbers(lineNumbersType);
          this.state.runtime.zenMode.transitionDisposables.set(ZenModeSettings.HIDE_LINENUMBERS, this.mainPartEditorService.onDidVisibleEditorsChange(() => setLineNumbers(lineNumbersType)));
        }
      }));
    } else {
      if (zenModeExitInfo.wasVisible.panel) {
        this.setPanelHidden(false, true);
      }
      if (zenModeExitInfo.wasVisible.auxiliaryBar) {
        this.setAuxiliaryBarHidden(false, true);
      }
      if (zenModeExitInfo.wasVisible.sideBar) {
        this.setSideBarHidden(false);
      }
      if (!this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN, true)) {
        this.setActivityBarHidden(false);
      }
      if (!this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN, true)) {
        this.setStatusBarHidden(false);
      }
      if (zenModeExitInfo.transitionedToCenteredEditorLayout) {
        this.centerMainEditorLayout(false, true);
      }
      if (zenModeExitInfo.handleNotificationsDoNotDisturbMode) {
        this.notificationService.setFilter(NotificationsFilter.OFF);
      }
      setLineNumbers();
      toggleMainWindowFullScreen = zenModeExitInfo.transitionedToFullScreen && this.state.runtime.mainWindowFullscreen;
    }
    if (!skipLayout) {
      this.layout();
    }
    if (toggleMainWindowFullScreen) {
      this.hostService.toggleFullScreen(mainWindow);
    }
    if (focusedPartPreTransition && this.isVisible(focusedPartPreTransition, getWindow(this.activeContainer))) {
      if (isMultiWindowPart(focusedPartPreTransition)) {
        this.focusPart(focusedPartPreTransition, getWindow(this.activeContainer));
      } else {
        this.focusPart(focusedPartPreTransition);
      }
    } else {
      this.focus();
    }
    this._onDidChangeZenMode.fire(this.isZenModeActive());
  }
  setStatusBarHidden(hidden) {
    this.stateModel.setRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN, hidden);
    if (hidden) {
      this.mainContainer.classList.add("nostatusbar" /* STATUSBAR_HIDDEN */);
    } else {
      this.mainContainer.classList.remove("nostatusbar" /* STATUSBAR_HIDDEN */);
    }
    this.workbenchGrid.setViewVisible(this.statusBarPartView, !hidden);
  }
  createWorkbenchLayout() {
    const titleBar = this.getPart(Parts.TITLEBAR_PART);
    const bannerPart = this.getPart(Parts.BANNER_PART);
    const editorPart = this.getPart(Parts.EDITOR_PART);
    const activityBar = this.getPart(Parts.ACTIVITYBAR_PART);
    const panelPart = this.getPart(Parts.PANEL_PART);
    const auxiliaryBarPart = this.getPart(Parts.AUXILIARYBAR_PART);
    const sideBar = this.getPart(Parts.SIDEBAR_PART);
    const statusBar = this.getPart(Parts.STATUSBAR_PART);
    this.titleBarPartView = titleBar;
    this.bannerPartView = bannerPart;
    this.sideBarPartView = sideBar;
    this.activityBarPartView = activityBar;
    this.editorPartView = editorPart;
    this.panelPartView = panelPart;
    this.auxiliaryBarPartView = auxiliaryBarPart;
    this.statusBarPartView = statusBar;
    const viewMap = {
      [Parts.ACTIVITYBAR_PART]: this.activityBarPartView,
      [Parts.BANNER_PART]: this.bannerPartView,
      [Parts.TITLEBAR_PART]: this.titleBarPartView,
      [Parts.EDITOR_PART]: this.editorPartView,
      [Parts.PANEL_PART]: this.panelPartView,
      [Parts.SIDEBAR_PART]: this.sideBarPartView,
      [Parts.STATUSBAR_PART]: this.statusBarPartView,
      [Parts.AUXILIARYBAR_PART]: this.auxiliaryBarPartView
    };
    const fromJSON = ({ type }) => viewMap[type];
    const workbenchGrid = SerializableGrid.deserialize(
      this.createGridDescriptor(),
      { fromJSON },
      { proportionalLayout: false }
    );
    this.mainContainer.prepend(workbenchGrid.element);
    this.mainContainer.setAttribute("role", "application");
    this.workbenchGrid = workbenchGrid;
    this.workbenchGrid.edgeSnapping = this.state.runtime.mainWindowFullscreen;
    for (const part of [titleBar, editorPart, activityBar, panelPart, sideBar, statusBar, auxiliaryBarPart, bannerPart]) {
      this._register(part.onDidVisibilityChange((visible) => {
        if (!this.inMaximizedAuxiliaryBarTransition) {
          if (part === sideBar) {
            this.setSideBarHidden(!visible);
          } else if (part === panelPart && this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN) === visible) {
            this.setPanelHidden(!visible, true);
          } else if (part === auxiliaryBarPart) {
            this.setAuxiliaryBarHidden(!visible, true);
          } else if (part === editorPart) {
            this.setEditorHidden(!visible);
          }
        }
        this._onDidChangePartVisibility.fire({ partId: part.getId(), visible });
        this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
      }));
    }
    this._register(this.storageService.onWillSaveState(() => {
      const sideBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN) ? this.workbenchGrid.getViewCachedVisibleSize(this.sideBarPartView) : this.workbenchGrid.getViewSize(this.sideBarPartView).width;
      this.stateModel.setInitializationValue(LayoutStateKeys.SIDEBAR_SIZE, sideBarSize);
      const panelSize = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN) ? this.workbenchGrid.getViewCachedVisibleSize(this.panelPartView) : isHorizontal(this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION)) ? this.workbenchGrid.getViewSize(this.panelPartView).height : this.workbenchGrid.getViewSize(this.panelPartView).width;
      this.stateModel.setInitializationValue(LayoutStateKeys.PANEL_SIZE, panelSize);
      const auxiliaryBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN) ? this.workbenchGrid.getViewCachedVisibleSize(this.auxiliaryBarPartView) : this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width;
      this.stateModel.setInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE, auxiliaryBarSize);
      this.stateModel.save(true, true);
    }));
    this._register(Event.any(this.paneCompositeService.onDidPaneCompositeOpen, this.paneCompositeService.onDidPaneCompositeClose)(() => {
      this.stateModel.setInitializationValue(LayoutStateKeys.AUXILIARYBAR_EMPTY, this.paneCompositeService.getPaneCompositeIds(ViewContainerLocation.AuxiliaryBar).length === 0);
    }));
  }
  layout() {
    if (!this.disposed) {
      this._mainContainerDimension = getClientArea(
        this.state.runtime.mainWindowFullscreen ? mainWindow.document.body : (
          // in fullscreen mode, make sure to use <body> element because
          this.parent
        ),
        // in that case the workbench will span the entire site
        this.contextService.getWorkbenchState() === WorkbenchState.EMPTY ? DEFAULT_EMPTY_WINDOW_DIMENSIONS : DEFAULT_WORKSPACE_WINDOW_DIMENSIONS
        // running with fallback to ensure no error is thrown (https://github.com/microsoft/vscode/issues/240242)
      );
      this.logService.trace(`Layout#layout, height: ${this._mainContainerDimension.height}, width: ${this._mainContainerDimension.width}`);
      size(this.mainContainer, this._mainContainerDimension.width, this._mainContainerDimension.height);
      this.workbenchGrid.layout(this._mainContainerDimension.width, this._mainContainerDimension.height);
      this.initialized = true;
      this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
    }
  }
  isMainEditorLayoutCentered() {
    return this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED);
  }
  centerMainEditorLayout(active, skipLayout) {
    this.stateModel.setRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED, active);
    const mainVisibleEditors = coalesce(this.editorGroupService.mainPart.groups.map((group) => group.activeEditor));
    const isEditorComplex = mainVisibleEditors.some((editor) => {
      if (editor instanceof DiffEditorInput) {
        return this.configurationService.getValue("diffEditor.renderSideBySide");
      }
      if (editor?.hasCapability(EditorInputCapabilities.MultipleEditors)) {
        return true;
      }
      return false;
    });
    const layout = this.editorGroupService.getLayout();
    let hasMoreThanOneColumn = false;
    if (layout.orientation === GroupOrientation.HORIZONTAL) {
      hasMoreThanOneColumn = layout.groups.length > 1;
    } else {
      hasMoreThanOneColumn = layout.groups.some((group) => group.groups && group.groups.length > 1);
    }
    const isCenteredLayoutAutoResizing = this.configurationService.getValue("workbench.editor.centeredLayoutAutoResize");
    if (isCenteredLayoutAutoResizing && (hasMoreThanOneColumn && !this.editorGroupService.mainPart.hasMaximizedGroup() || isEditorComplex)) {
      active = false;
    }
    if (this.editorGroupService.mainPart.isLayoutCentered() !== active) {
      this.editorGroupService.mainPart.centerLayout(active);
      if (!skipLayout) {
        this.layout();
      }
    }
    this._onDidChangeMainEditorCenteredLayout.fire(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED));
  }
  getSize(part) {
    return this.workbenchGrid.getViewSize(this.getPart(part));
  }
  setSize(part, size2) {
    this.workbenchGrid.resizeView(this.getPart(part), size2);
  }
  resizePart(part, sizeChangeWidth, sizeChangeHeight) {
    const sizeChangePxWidth = Math.sign(sizeChangeWidth) * computeScreenAwareSize(getActiveWindow(), Math.abs(sizeChangeWidth));
    const sizeChangePxHeight = Math.sign(sizeChangeHeight) * computeScreenAwareSize(getActiveWindow(), Math.abs(sizeChangeHeight));
    let viewSize;
    switch (part) {
      case Parts.SIDEBAR_PART:
        viewSize = this.workbenchGrid.getViewSize(this.sideBarPartView);
        this.workbenchGrid.resizeView(this.sideBarPartView, {
          width: viewSize.width + sizeChangePxWidth,
          height: viewSize.height
        });
        break;
      case Parts.PANEL_PART:
        viewSize = this.workbenchGrid.getViewSize(this.panelPartView);
        this.workbenchGrid.resizeView(this.panelPartView, {
          width: viewSize.width + (isHorizontal(this.getPanelPosition()) ? 0 : sizeChangePxWidth),
          height: viewSize.height + (isHorizontal(this.getPanelPosition()) ? sizeChangePxHeight : 0)
        });
        break;
      case Parts.AUXILIARYBAR_PART:
        viewSize = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);
        this.workbenchGrid.resizeView(this.auxiliaryBarPartView, {
          width: viewSize.width + sizeChangePxWidth,
          height: viewSize.height
        });
        break;
      case Parts.EDITOR_PART:
        viewSize = this.workbenchGrid.getViewSize(this.editorPartView);
        if (this.editorGroupService.mainPart.count === 1) {
          this.workbenchGrid.resizeView(this.editorPartView, {
            width: viewSize.width + sizeChangePxWidth,
            height: viewSize.height + sizeChangePxHeight
          });
        } else {
          const activeGroup = this.editorGroupService.mainPart.activeGroup;
          const { width, height } = this.editorGroupService.mainPart.getSize(activeGroup);
          this.editorGroupService.mainPart.setSize(activeGroup, { width: width + sizeChangePxWidth, height: height + sizeChangePxHeight });
          const { width: newWidth, height: newHeight } = this.editorGroupService.mainPart.getSize(activeGroup);
          if (sizeChangePxHeight && height === newHeight || sizeChangePxWidth && width === newWidth) {
            this.workbenchGrid.resizeView(this.editorPartView, {
              width: viewSize.width + (sizeChangePxWidth && width === newWidth ? sizeChangePxWidth : 0),
              height: viewSize.height + (sizeChangePxHeight && height === newHeight ? sizeChangePxHeight : 0)
            });
          }
        }
        break;
      default:
        return;
    }
  }
  setActivityBarHidden(hidden) {
    this.stateModel.setRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN, hidden);
    this.mainContainer.classList.toggle("noactivitybar" /* ACTIVITYBAR_HIDDEN */, hidden);
    this.workbenchGrid.setViewVisible(this.activityBarPartView, !hidden);
  }
  setBannerHidden(hidden) {
    this.workbenchGrid.setViewVisible(this.bannerPartView, !hidden);
  }
  setEditorHidden(hidden) {
    if (!hidden && this.setAuxiliaryBarMaximized(false) && this.isVisible(Parts.EDITOR_PART)) {
      return;
    }
    this.stateModel.setRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN, hidden);
    if (hidden) {
      this.mainContainer.classList.add("nomaineditorarea" /* MAIN_EDITOR_AREA_HIDDEN */);
    } else {
      this.mainContainer.classList.remove("nomaineditorarea" /* MAIN_EDITOR_AREA_HIDDEN */);
    }
    this.workbenchGrid.setViewVisible(this.editorPartView, !hidden);
    if (hidden && !this.isVisible(Parts.PANEL_PART) && !this.isAuxiliaryBarMaximized()) {
      this.setPanelHidden(false, true);
    }
  }
  getLayoutClasses() {
    return coalesce([
      !this.isVisible(Parts.SIDEBAR_PART) ? "nosidebar" /* SIDEBAR_HIDDEN */ : void 0,
      !this.isVisible(Parts.EDITOR_PART, mainWindow) ? "nomaineditorarea" /* MAIN_EDITOR_AREA_HIDDEN */ : void 0,
      !this.isVisible(Parts.PANEL_PART) ? "nopanel" /* PANEL_HIDDEN */ : void 0,
      !this.isVisible(Parts.AUXILIARYBAR_PART) ? "noauxiliarybar" /* AUXILIARYBAR_HIDDEN */ : void 0,
      !this.isVisible(Parts.ACTIVITYBAR_PART) ? "noactivitybar" /* ACTIVITYBAR_HIDDEN */ : void 0,
      !this.isVisible(Parts.STATUSBAR_PART) ? "nostatusbar" /* STATUSBAR_HIDDEN */ : void 0,
      this.state.runtime.mainWindowFullscreen ? "fullscreen" /* FULLSCREEN */ : void 0,
      this.isShadowsDisabled() ? "no-shadows" /* NO_SHADOWS */ : void 0,
      this.isFloatingPanelsEnabled() ? "floating-panels" /* FLOATING_PANELS */ : void 0,
      // Also seed the style-override class here (see `LayoutClasses.STYLE_OVERRIDE`).
      this.isFloatingPanelsEnabled() ? "style-override" /* STYLE_OVERRIDE */ : void 0,
      `panel-position-${positionToString(this.getPanelPosition())}`,
      `panel-alignment-${this.getPanelAlignment()}`
    ]);
  }
  setSideBarHidden(hidden) {
    if (!hidden && this.setAuxiliaryBarMaximized(false) && this.isVisible(Parts.SIDEBAR_PART)) {
      return;
    }
    this.stateModel.setRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN, hidden);
    if (hidden) {
      this.mainContainer.classList.add("nosidebar" /* SIDEBAR_HIDDEN */);
    } else {
      this.mainContainer.classList.remove("nosidebar" /* SIDEBAR_HIDDEN */);
    }
    this.workbenchGrid.setViewVisible(this.sideBarPartView, !hidden);
    if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)) {
      this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Sidebar);
      if (!this.isAuxiliaryBarMaximized()) {
        this.focusPanelOrEditor();
      }
    } else if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)) {
      const viewletToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.Sidebar);
      if (viewletToOpen) {
        this.openViewContainer(ViewContainerLocation.Sidebar, viewletToOpen);
      }
    }
  }
  hasViews(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    if (!viewContainer) {
      return false;
    }
    const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
    if (!viewContainerModel) {
      return false;
    }
    return viewContainerModel.activeViewDescriptors.length >= 1;
  }
  adjustPartPositions(sideBarPosition, panelAlignment, panelPosition) {
    const isPanelVertical = !isHorizontal(panelPosition);
    const sideBarSiblingToEditor = isPanelVertical || !(panelAlignment === "center" || sideBarPosition === Position.LEFT && panelAlignment === "right" || sideBarPosition === Position.RIGHT && panelAlignment === "left");
    const auxiliaryBarSiblingToEditor = isPanelVertical || !(panelAlignment === "center" || sideBarPosition === Position.RIGHT && panelAlignment === "right" || sideBarPosition === Position.LEFT && panelAlignment === "left");
    const preMovePanelWidth = !this.isVisible(Parts.PANEL_PART) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.panelPartView) ?? this.panelPartView.minimumWidth) : this.workbenchGrid.getViewSize(this.panelPartView).width;
    const preMovePanelHeight = !this.isVisible(Parts.PANEL_PART) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.panelPartView) ?? this.panelPartView.minimumHeight) : this.workbenchGrid.getViewSize(this.panelPartView).height;
    const preMoveSideBarSize = !this.isVisible(Parts.SIDEBAR_PART) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.sideBarPartView) ?? this.sideBarPartView.minimumWidth) : this.workbenchGrid.getViewSize(this.sideBarPartView).width;
    const preMoveAuxiliaryBarSize = !this.isVisible(Parts.AUXILIARYBAR_PART) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.auxiliaryBarPartView) ?? this.auxiliaryBarPartView.minimumWidth) : this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width;
    const focusedPart = [Parts.PANEL_PART, Parts.SIDEBAR_PART, Parts.AUXILIARYBAR_PART].find((part) => this.hasFocus(part));
    if (sideBarPosition === Position.LEFT) {
      this.workbenchGrid.moveViewTo(this.activityBarPartView, [2, 0]);
      this.workbenchGrid.moveView(this.sideBarPartView, preMoveSideBarSize, sideBarSiblingToEditor ? this.editorPartView : this.activityBarPartView, sideBarSiblingToEditor ? Direction.Left : Direction.Right);
      if (auxiliaryBarSiblingToEditor) {
        this.workbenchGrid.moveView(this.auxiliaryBarPartView, preMoveAuxiliaryBarSize, this.editorPartView, Direction.Right);
      } else {
        this.workbenchGrid.moveViewTo(this.auxiliaryBarPartView, [2, -1]);
      }
    } else {
      this.workbenchGrid.moveViewTo(this.activityBarPartView, [2, -1]);
      this.workbenchGrid.moveView(this.sideBarPartView, preMoveSideBarSize, sideBarSiblingToEditor ? this.editorPartView : this.activityBarPartView, sideBarSiblingToEditor ? Direction.Right : Direction.Left);
      if (auxiliaryBarSiblingToEditor) {
        this.workbenchGrid.moveView(this.auxiliaryBarPartView, preMoveAuxiliaryBarSize, this.editorPartView, Direction.Left);
      } else {
        this.workbenchGrid.moveViewTo(this.auxiliaryBarPartView, [2, 0]);
      }
    }
    if (focusedPart) {
      this.focusPart(focusedPart);
    }
    if (isPanelVertical) {
      this.workbenchGrid.moveView(this.panelPartView, preMovePanelWidth, this.editorPartView, panelPosition === Position.LEFT ? Direction.Left : Direction.Right);
      this.workbenchGrid.resizeView(this.panelPartView, {
        height: preMovePanelHeight,
        width: preMovePanelWidth
      });
    }
    if (this.isVisible(Parts.SIDEBAR_PART)) {
      this.workbenchGrid.resizeView(this.sideBarPartView, {
        height: this.workbenchGrid.getViewSize(this.sideBarPartView).height,
        width: preMoveSideBarSize
      });
    }
    if (this.isVisible(Parts.AUXILIARYBAR_PART)) {
      this.workbenchGrid.resizeView(this.auxiliaryBarPartView, {
        height: this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).height,
        width: preMoveAuxiliaryBarSize
      });
    }
  }
  setPanelAlignment(alignment) {
    if (!isHorizontal(this.getPanelPosition())) {
      this.setPanelPosition(Position.BOTTOM);
    }
    if (alignment !== "center" && this.isPanelMaximized()) {
      this.toggleMaximizedPanel();
    }
    this.setAuxiliaryBarMaximized(false);
    const oldAlignmentValue = this.getPanelAlignment();
    this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_ALIGNMENT, alignment);
    this.mainContainer.classList.remove(`panel-alignment-${oldAlignmentValue}`);
    this.mainContainer.classList.add(`panel-alignment-${alignment}`);
    this.adjustPartPositions(this.getSideBarPosition(), alignment, this.getPanelPosition());
    this._onDidChangePanelAlignment.fire(alignment);
  }
  setPanelHidden(hidden, skipLayout) {
    if (!this.workbenchGrid) {
      return;
    }
    if (!hidden && this.setAuxiliaryBarMaximized(false) && this.isVisible(Parts.PANEL_PART)) {
      return;
    }
    const wasHidden = !this.isVisible(Parts.PANEL_PART);
    const isPanelMaximized = this.isPanelMaximized();
    this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_HIDDEN, hidden);
    const panelOpensMaximized = this.panelOpensMaximized();
    if (hidden) {
      this.mainContainer.classList.add("nopanel" /* PANEL_HIDDEN */);
    } else {
      this.mainContainer.classList.remove("nopanel" /* PANEL_HIDDEN */);
    }
    if (hidden && isPanelMaximized) {
      this.toggleMaximizedPanel();
    }
    this.workbenchGrid.setViewVisible(this.panelPartView, !hidden);
    let focusEditor = false;
    if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)) {
      this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Panel);
      if (!isIOS && // do not auto focus on iOS (https://github.com/microsoft/vscode/issues/127832)
      !this.isAuxiliaryBarMaximized()) {
        focusEditor = true;
      }
    } else if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)) {
      let panelToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.Panel);
      if (!panelToOpen || !this.hasViews(panelToOpen)) {
        panelToOpen = this.viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.Panel).find((viewContainer) => this.hasViews(viewContainer.id))?.id;
      }
      if (panelToOpen) {
        this.openViewContainer(ViewContainerLocation.Panel, panelToOpen, !skipLayout);
      }
    }
    if (wasHidden === hidden) {
      return;
    }
    if (!hidden) {
      if (!skipLayout && isPanelMaximized !== panelOpensMaximized) {
        this.toggleMaximizedPanel();
      }
    } else {
      this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_WAS_LAST_MAXIMIZED, isPanelMaximized);
    }
    if (focusEditor) {
      this.editorGroupService.mainPart.activeGroup.focus();
    }
  }
  isAuxiliaryBarMaximized() {
    return this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED);
  }
  toggleMaximizedAuxiliaryBar() {
    this.setAuxiliaryBarMaximized(!this.isAuxiliaryBarMaximized());
  }
  setAuxiliaryBarMaximized(maximized) {
    if (this.inMaximizedAuxiliaryBarTransition || // prevent re-entrance
    maximized === this.isAuxiliaryBarMaximized()) {
      return false;
    }
    if (maximized) {
      const state = {
        sideBarVisible: this.isVisible(Parts.SIDEBAR_PART),
        editorVisible: this.isVisible(Parts.EDITOR_PART),
        panelVisible: this.isVisible(Parts.PANEL_PART),
        auxiliaryBarVisible: this.isVisible(Parts.AUXILIARYBAR_PART)
      };
      this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED, true);
      this.inMaximizedAuxiliaryBarTransition = true;
      try {
        if (!state.auxiliaryBarVisible) {
          this.setAuxiliaryBarHidden(false);
        }
        const size2 = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width;
        this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_SIZE, size2);
        if (state.sideBarVisible) {
          this.setSideBarHidden(true);
        }
        if (state.panelVisible) {
          this.setPanelHidden(true);
        }
        if (state.editorVisible) {
          this.setEditorHidden(true);
        }
        this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_VISIBILITY, state);
      } finally {
        this.inMaximizedAuxiliaryBarTransition = false;
      }
    } else {
      const state = assertReturnsDefined(this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_VISIBILITY));
      this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED, false);
      this.inMaximizedAuxiliaryBarTransition = true;
      try {
        this.setEditorHidden(!state?.editorVisible);
        this.setPanelHidden(!state?.panelVisible);
        this.setSideBarHidden(!state?.sideBarVisible);
        const size2 = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);
        this.workbenchGrid.resizeView(this.auxiliaryBarPartView, {
          width: this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_SIZE),
          height: size2.height
        });
      } finally {
        this.inMaximizedAuxiliaryBarTransition = false;
      }
    }
    this.focusPart(Parts.AUXILIARYBAR_PART);
    this._onDidChangeAuxiliaryBarMaximized.fire();
    return true;
  }
  isPanelMaximized() {
    return (this.getPanelAlignment() === "center" || // the workbench grid currently prevents us from supporting panel
    !isHorizontal(this.getPanelPosition())) && !this.isVisible(Parts.EDITOR_PART, mainWindow) && !this.isAuxiliaryBarMaximized();
  }
  toggleMaximizedPanel() {
    const size2 = this.workbenchGrid.getViewSize(this.panelPartView);
    const panelPosition = this.getPanelPosition();
    const maximize = !this.isPanelMaximized();
    if (maximize) {
      if (this.isVisible(Parts.PANEL_PART)) {
        if (isHorizontal(panelPosition)) {
          this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT, size2.height);
        } else {
          this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH, size2.width);
        }
      }
      this.setEditorHidden(true);
    } else {
      this.setEditorHidden(false);
      this.workbenchGrid.resizeView(this.panelPartView, {
        width: isHorizontal(panelPosition) ? size2.width : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH),
        height: isHorizontal(panelPosition) ? this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT) : size2.height
      });
    }
    this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_WAS_LAST_MAXIMIZED, maximize);
  }
  panelOpensMaximized() {
    if (this.getPanelAlignment() !== "center" && isHorizontal(this.getPanelPosition())) {
      return false;
    }
    const panelOpensMaximized = partOpensMaximizedFromString(this.configurationService.getValue("workbench.panel.opensMaximized" /* PANEL_OPENS_MAXIMIZED */));
    const panelLastIsMaximized = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_WAS_LAST_MAXIMIZED);
    return panelOpensMaximized === PartOpensMaximizedOptions.ALWAYS || panelOpensMaximized === PartOpensMaximizedOptions.REMEMBER_LAST && panelLastIsMaximized;
  }
  setAuxiliaryBarHidden(hidden, skipLayout) {
    if (hidden && this.setAuxiliaryBarMaximized(false) && !this.isVisible(Parts.AUXILIARYBAR_PART)) {
      return;
    }
    this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, hidden);
    if (hidden) {
      this.mainContainer.classList.add("noauxiliarybar" /* AUXILIARYBAR_HIDDEN */);
    } else {
      this.mainContainer.classList.remove("noauxiliarybar" /* AUXILIARYBAR_HIDDEN */);
    }
    this.workbenchGrid.setViewVisible(this.auxiliaryBarPartView, !hidden);
    if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)) {
      this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.AuxiliaryBar);
      this.focusPanelOrEditor();
    } else if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)) {
      let viewletToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.AuxiliaryBar);
      if (!viewletToOpen || !this.hasViews(viewletToOpen)) {
        viewletToOpen = this.viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar).find((viewContainer) => this.hasViews(viewContainer.id))?.id;
      }
      if (viewletToOpen) {
        this.openViewContainer(ViewContainerLocation.AuxiliaryBar, viewletToOpen, !skipLayout);
      }
    }
  }
  setPartHidden(hidden, part) {
    switch (part) {
      case Parts.ACTIVITYBAR_PART:
        return this.setActivityBarHidden(hidden);
      case Parts.SIDEBAR_PART:
        return this.setSideBarHidden(hidden);
      case Parts.EDITOR_PART:
        return this.setEditorHidden(hidden);
      case Parts.BANNER_PART:
        return this.setBannerHidden(hidden);
      case Parts.AUXILIARYBAR_PART:
        return this.setAuxiliaryBarHidden(hidden);
      case Parts.PANEL_PART:
        return this.setPanelHidden(hidden);
    }
  }
  toggleSecondarySideBar() {
    const visible = !this.isSecondarySideBarVisible();
    this.setPartHidden(!visible, Parts.AUXILIARYBAR_PART);
    alert(visible ? localize("auxiliaryBarVisible", "Secondary Side Bar shown") : localize("auxiliaryBarHidden", "Secondary Side Bar hidden"));
  }
  isSecondarySideBarVisible() {
    return this.isVisible(Parts.AUXILIARYBAR_PART);
  }
  hasMainWindowBorder() {
    return this.state.runtime.mainWindowBorder;
  }
  getMainWindowBorderRadius() {
    return this.state.runtime.mainWindowBorder && isMacintosh ? "10px" : void 0;
  }
  getSideBarPosition() {
    return this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON);
  }
  getPanelAlignment() {
    return this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_ALIGNMENT);
  }
  updateMenubarVisibility(skipLayout) {
    const shouldShowTitleBar = shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled);
    if (!skipLayout && this.workbenchGrid && shouldShowTitleBar !== this.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
      this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowTitleBar);
    }
  }
  updateCustomTitleBarVisibility() {
    const shouldShowTitleBar = shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled);
    const titlebarVisible = this.isVisible(Parts.TITLEBAR_PART);
    if (shouldShowTitleBar !== titlebarVisible) {
      this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowTitleBar);
    }
  }
  toggleMenuBar() {
    let currentVisibilityValue = getMenuBarVisibility(this.configurationService);
    if (typeof currentVisibilityValue !== "string") {
      currentVisibilityValue = "classic";
    }
    let newVisibilityValue;
    if (currentVisibilityValue === "visible" || currentVisibilityValue === "classic") {
      newVisibilityValue = hasNativeMenu(this.configurationService) ? "toggle" : "compact";
    } else {
      newVisibilityValue = "classic";
    }
    this.configurationService.updateValue(MenuSettings.MenuBarVisibility, newVisibilityValue);
  }
  getPanelPosition() {
    return this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION);
  }
  setPanelPosition(position) {
    if (!this.isVisible(Parts.PANEL_PART)) {
      this.setPanelHidden(false);
    }
    const panelPart = this.getPart(Parts.PANEL_PART);
    const oldPositionValue = positionToString(this.getPanelPosition());
    const newPositionValue = positionToString(position);
    const panelContainer = assertReturnsDefined(panelPart.getContainer());
    panelContainer.classList.remove(oldPositionValue);
    panelContainer.classList.add(newPositionValue);
    this.mainContainer.classList.remove(`panel-position-${oldPositionValue}`);
    this.mainContainer.classList.add(`panel-position-${newPositionValue}`);
    panelPart.updateStyles();
    const size2 = this.workbenchGrid.getViewSize(this.panelPartView);
    const sideBarSize = this.workbenchGrid.getViewSize(this.sideBarPartView);
    const auxiliaryBarSize = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);
    let editorHidden = !this.isVisible(Parts.EDITOR_PART, mainWindow);
    if (newPositionValue !== oldPositionValue && !editorHidden) {
      if (isHorizontal(position)) {
        this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH, size2.width);
      } else if (isHorizontal(positionFromString(oldPositionValue))) {
        this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT, size2.height);
      }
    }
    if (isHorizontal(position) && this.getPanelAlignment() !== "center" && editorHidden) {
      this.toggleMaximizedPanel();
      editorHidden = false;
    }
    this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_POSITION, position);
    const sideBarVisible = this.isVisible(Parts.SIDEBAR_PART);
    const auxiliaryBarVisible = this.isVisible(Parts.AUXILIARYBAR_PART);
    const hadFocus = this.hasFocus(Parts.PANEL_PART);
    if (position === Position.BOTTOM) {
      this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size2.height : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT), this.editorPartView, Direction.Down);
    } else if (position === Position.TOP) {
      this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size2.height : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT), this.editorPartView, Direction.Up);
    } else if (position === Position.RIGHT) {
      this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size2.width : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH), this.editorPartView, Direction.Right);
    } else {
      this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size2.width : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH), this.editorPartView, Direction.Left);
    }
    if (hadFocus) {
      this.focusPart(Parts.PANEL_PART);
    }
    this.workbenchGrid.resizeView(this.sideBarPartView, sideBarSize);
    if (!sideBarVisible) {
      this.setSideBarHidden(true);
    }
    this.workbenchGrid.resizeView(this.auxiliaryBarPartView, auxiliaryBarSize);
    if (!auxiliaryBarVisible) {
      this.setAuxiliaryBarHidden(true);
    }
    if (isHorizontal(position)) {
      this.adjustPartPositions(this.getSideBarPosition(), this.getPanelAlignment(), position);
    }
    this._onDidChangePanelPosition.fire(newPositionValue);
  }
  isWindowMaximized(targetWindow) {
    return this.state.runtime.maximized.has(getWindowId(targetWindow));
  }
  updateWindowMaximizedState(targetWindow, maximized) {
    this.mainContainer.classList.toggle("maximized" /* MAXIMIZED */, maximized);
    const targetWindowId = getWindowId(targetWindow);
    if (maximized === this.state.runtime.maximized.has(targetWindowId)) {
      return;
    }
    if (maximized) {
      this.state.runtime.maximized.add(targetWindowId);
    } else {
      this.state.runtime.maximized.delete(targetWindowId);
    }
    this.updateWindowBorder();
    this._onDidChangeWindowMaximized.fire({ windowId: targetWindowId, maximized });
  }
  getVisibleNeighborPart(part, direction) {
    if (!this.workbenchGrid) {
      return void 0;
    }
    if (!this.isVisible(part, mainWindow)) {
      return void 0;
    }
    const neighborViews = this.workbenchGrid.getNeighborViews(this.getPart(part), direction, false);
    if (!neighborViews) {
      return void 0;
    }
    for (const neighborView of neighborViews) {
      const neighborPart = [Parts.ACTIVITYBAR_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART, Parts.SIDEBAR_PART, Parts.STATUSBAR_PART, Parts.TITLEBAR_PART].find((partId) => this.getPart(partId) === neighborView && this.isVisible(partId, mainWindow));
      if (neighborPart !== void 0) {
        return neighborPart;
      }
    }
    return void 0;
  }
  onDidChangeWCO() {
    const bannerFirst = this.workbenchGrid.getNeighborViews(this.titleBarPartView, Direction.Up, false).length > 0;
    const shouldBannerBeFirst = this.shouldShowBannerFirst();
    if (bannerFirst !== shouldBannerBeFirst) {
      this.workbenchGrid.moveView(this.bannerPartView, Sizing.Distribute, this.titleBarPartView, shouldBannerBeFirst ? Direction.Up : Direction.Down);
    }
    this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled));
  }
  arrangeEditorNodes(nodes, availableHeight, availableWidth) {
    if (!nodes.sideBar && !nodes.auxiliaryBar) {
      nodes.editor.size = availableHeight;
      return nodes.editor;
    }
    const result = [nodes.editor];
    nodes.editor.size = availableWidth;
    if (nodes.sideBar) {
      if (this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON) === Position.LEFT) {
        result.splice(0, 0, nodes.sideBar);
      } else {
        result.push(nodes.sideBar);
      }
      nodes.editor.size -= this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN) ? 0 : nodes.sideBar.size;
    }
    if (nodes.auxiliaryBar) {
      if (this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON) === Position.RIGHT) {
        result.splice(0, 0, nodes.auxiliaryBar);
      } else {
        result.push(nodes.auxiliaryBar);
      }
      nodes.editor.size -= this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN) ? 0 : nodes.auxiliaryBar.size;
    }
    return {
      type: "branch",
      data: result,
      size: availableHeight,
      visible: result.some((node) => node.visible)
    };
  }
  arrangeMiddleSectionNodes(nodes, availableWidth, availableHeight) {
    const activityBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN) ? 0 : nodes.activityBar.size;
    const sideBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN) ? 0 : nodes.sideBar.size;
    const auxiliaryBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN) ? 0 : nodes.auxiliaryBar.size;
    const panelSize = this.stateModel.getInitializationValue(LayoutStateKeys.PANEL_SIZE) ? 0 : nodes.panel.size;
    const panelPostion = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION);
    const sideBarPosition = this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON);
    const result = [];
    if (!isHorizontal(panelPostion)) {
      result.push(nodes.editor);
      nodes.editor.size = availableWidth - activityBarSize - sideBarSize - panelSize - auxiliaryBarSize;
      if (panelPostion === Position.RIGHT) {
        result.push(nodes.panel);
      } else {
        result.splice(0, 0, nodes.panel);
      }
      if (sideBarPosition === Position.LEFT) {
        result.push(nodes.auxiliaryBar);
        result.splice(0, 0, nodes.sideBar);
        result.splice(0, 0, nodes.activityBar);
      } else {
        result.splice(0, 0, nodes.auxiliaryBar);
        result.push(nodes.sideBar);
        result.push(nodes.activityBar);
      }
    } else {
      const panelAlignment = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_ALIGNMENT);
      const sideBarNextToEditor = !(panelAlignment === "center" || sideBarPosition === Position.LEFT && panelAlignment === "right" || sideBarPosition === Position.RIGHT && panelAlignment === "left");
      const auxiliaryBarNextToEditor = !(panelAlignment === "center" || sideBarPosition === Position.RIGHT && panelAlignment === "right" || sideBarPosition === Position.LEFT && panelAlignment === "left");
      const editorSectionWidth = availableWidth - activityBarSize - (sideBarNextToEditor ? 0 : sideBarSize) - (auxiliaryBarNextToEditor ? 0 : auxiliaryBarSize);
      const editorNodes = this.arrangeEditorNodes({
        editor: nodes.editor,
        sideBar: sideBarNextToEditor ? nodes.sideBar : void 0,
        auxiliaryBar: auxiliaryBarNextToEditor ? nodes.auxiliaryBar : void 0
      }, availableHeight - panelSize, editorSectionWidth);
      const data = panelPostion === Position.BOTTOM ? [editorNodes, nodes.panel] : [nodes.panel, editorNodes];
      result.push({
        type: "branch",
        data,
        size: editorSectionWidth,
        visible: data.some((node) => node.visible)
      });
      if (!sideBarNextToEditor) {
        if (sideBarPosition === Position.LEFT) {
          result.splice(0, 0, nodes.sideBar);
        } else {
          result.push(nodes.sideBar);
        }
      }
      if (!auxiliaryBarNextToEditor) {
        if (sideBarPosition === Position.RIGHT) {
          result.splice(0, 0, nodes.auxiliaryBar);
        } else {
          result.push(nodes.auxiliaryBar);
        }
      }
      if (sideBarPosition === Position.LEFT) {
        result.splice(0, 0, nodes.activityBar);
      } else {
        result.push(nodes.activityBar);
      }
    }
    return result;
  }
  createGridDescriptor() {
    const { width, height } = this._mainContainerDimension;
    const sideBarSize = this.stateModel.getInitializationValue(LayoutStateKeys.SIDEBAR_SIZE);
    const auxiliaryBarSize = this.stateModel.getInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE);
    const panelSize = this.stateModel.getInitializationValue(LayoutStateKeys.PANEL_SIZE);
    const titleBarHeight = this.titleBarPartView.minimumHeight;
    const bannerHeight = this.bannerPartView.minimumHeight;
    const statusBarHeight = this.statusBarPartView.minimumHeight;
    const activityBarWidth = this.activityBarPartView.minimumWidth;
    const middleSectionHeight = height - titleBarHeight - statusBarHeight;
    const titleAndBanner = [
      {
        type: "leaf",
        data: { type: Parts.TITLEBAR_PART },
        size: titleBarHeight,
        visible: this.isVisible(Parts.TITLEBAR_PART, mainWindow)
      },
      {
        type: "leaf",
        data: { type: Parts.BANNER_PART },
        size: bannerHeight,
        visible: false
      }
    ];
    const activityBarNode = {
      type: "leaf",
      data: { type: Parts.ACTIVITYBAR_PART },
      size: activityBarWidth,
      visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN)
    };
    const sideBarNode = {
      type: "leaf",
      data: { type: Parts.SIDEBAR_PART },
      size: sideBarSize,
      visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN)
    };
    const auxiliaryBarNode = {
      type: "leaf",
      data: { type: Parts.AUXILIARYBAR_PART },
      size: auxiliaryBarSize,
      visible: this.isVisible(Parts.AUXILIARYBAR_PART)
    };
    const editorNode = {
      type: "leaf",
      data: { type: Parts.EDITOR_PART },
      size: 0,
      // Update based on sibling sizes
      visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN)
    };
    const panelNode = {
      type: "leaf",
      data: { type: Parts.PANEL_PART },
      size: panelSize,
      visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN)
    };
    const middleSection = this.arrangeMiddleSectionNodes({
      activityBar: activityBarNode,
      auxiliaryBar: auxiliaryBarNode,
      editor: editorNode,
      panel: panelNode,
      sideBar: sideBarNode
    }, width, middleSectionHeight);
    const result = {
      root: {
        type: "branch",
        size: width,
        data: [
          ...this.shouldShowBannerFirst() ? titleAndBanner.reverse() : titleAndBanner,
          {
            type: "branch",
            data: middleSection,
            size: middleSectionHeight
          },
          {
            type: "leaf",
            data: { type: Parts.STATUSBAR_PART },
            size: statusBarHeight,
            visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN)
          }
        ]
      },
      orientation: Orientation.VERTICAL,
      width,
      height
    };
    const layoutDescriptor = {
      activityBarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN),
      sideBarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN),
      auxiliaryBarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN),
      panelVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN),
      statusbarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN),
      sideBarPosition: positionToString(this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON)),
      panelPosition: positionToString(this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION))
    };
    this.telemetryService.publicLog2("startupLayout", layoutDescriptor);
    return result;
  }
  dispose() {
    super.dispose();
    this.disposed = true;
  }
}
function getZenModeConfiguration(configurationService) {
  return configurationService.getValue("zenMode" /* ZEN_MODE_CONFIG */);
}
class WorkbenchLayoutStateKey {
  constructor(name, scope, target, defaultValue) {
    this.name = name;
    this.scope = scope;
    this.target = target;
    this.defaultValue = defaultValue;
  }
}
class RuntimeStateKey extends WorkbenchLayoutStateKey {
  constructor(name, scope, target, defaultValue, zenModeIgnore) {
    super(name, scope, target, defaultValue);
    this.zenModeIgnore = zenModeIgnore;
    this.runtime = true;
  }
}
class InitializationStateKey extends WorkbenchLayoutStateKey {
  constructor() {
    super(...arguments);
    this.runtime = false;
  }
}
const LayoutStateKeys = {
  // Editor
  MAIN_EDITOR_CENTERED: new RuntimeStateKey("editor.centered", StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
  // Zen Mode
  ZEN_MODE_ACTIVE: new RuntimeStateKey("zenMode.active", StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
  ZEN_MODE_EXIT_INFO: new RuntimeStateKey("zenMode.exitInfo", StorageScope.WORKSPACE, StorageTarget.MACHINE, {
    transitionedToCenteredEditorLayout: false,
    transitionedToFullScreen: false,
    handleNotificationsDoNotDisturbMode: false,
    wasVisible: {
      auxiliaryBar: false,
      panel: false,
      sideBar: false
    }
  }),
  // Part Sizing
  SIDEBAR_SIZE: new InitializationStateKey("sideBar.size", StorageScope.PROFILE, StorageTarget.MACHINE, 300),
  AUXILIARYBAR_SIZE: new InitializationStateKey("auxiliaryBar.size", StorageScope.PROFILE, StorageTarget.MACHINE, 300),
  PANEL_SIZE: new InitializationStateKey("panel.size", StorageScope.PROFILE, StorageTarget.MACHINE, 300),
  // Part State
  PANEL_LAST_NON_MAXIMIZED_HEIGHT: new RuntimeStateKey("panel.lastNonMaximizedHeight", StorageScope.PROFILE, StorageTarget.MACHINE, 300),
  PANEL_LAST_NON_MAXIMIZED_WIDTH: new RuntimeStateKey("panel.lastNonMaximizedWidth", StorageScope.PROFILE, StorageTarget.MACHINE, 300),
  PANEL_WAS_LAST_MAXIMIZED: new RuntimeStateKey("panel.wasLastMaximized", StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
  AUXILIARYBAR_WAS_LAST_MAXIMIZED: new RuntimeStateKey("auxiliaryBar.wasLastMaximized", StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
  AUXILIARYBAR_LAST_NON_MAXIMIZED_SIZE: new RuntimeStateKey("auxiliaryBar.lastNonMaximizedSize", StorageScope.PROFILE, StorageTarget.MACHINE, 300),
  AUXILIARYBAR_LAST_NON_MAXIMIZED_VISIBILITY: new RuntimeStateKey("auxiliaryBar.lastNonMaximizedVisibility", StorageScope.WORKSPACE, StorageTarget.MACHINE, {
    sideBarVisible: false,
    editorVisible: false,
    panelVisible: false,
    auxiliaryBarVisible: false
  }),
  AUXILIARYBAR_EMPTY: new InitializationStateKey("auxiliaryBar.empty", StorageScope.PROFILE, StorageTarget.MACHINE, false),
  // Part Positions
  SIDEBAR_POSITON: new RuntimeStateKey("sideBar.position", StorageScope.WORKSPACE, StorageTarget.MACHINE, Position.LEFT),
  PANEL_POSITION: new RuntimeStateKey("panel.position", StorageScope.WORKSPACE, StorageTarget.MACHINE, Position.BOTTOM),
  PANEL_ALIGNMENT: new RuntimeStateKey("panel.alignment", StorageScope.PROFILE, StorageTarget.USER, "center"),
  // Part Visibility
  ACTIVITYBAR_HIDDEN: new RuntimeStateKey("activityBar.hidden", StorageScope.WORKSPACE, StorageTarget.MACHINE, false, true),
  SIDEBAR_HIDDEN: new RuntimeStateKey("sideBar.hidden", StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
  EDITOR_HIDDEN: new RuntimeStateKey("editor.hidden", StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
  PANEL_HIDDEN: new RuntimeStateKey("panel.hidden", StorageScope.WORKSPACE, StorageTarget.MACHINE, true),
  AUXILIARYBAR_HIDDEN: new RuntimeStateKey("auxiliaryBar.hidden", StorageScope.WORKSPACE, StorageTarget.MACHINE, true),
  STATUSBAR_HIDDEN: new RuntimeStateKey("statusBar.hidden", StorageScope.WORKSPACE, StorageTarget.MACHINE, false, true)
};
var WorkbenchLayoutSettings = /* @__PURE__ */ ((WorkbenchLayoutSettings2) => {
  WorkbenchLayoutSettings2["AUXILIARYBAR_DEFAULT_VISIBILITY"] = "workbench.secondarySideBar.defaultVisibility";
  WorkbenchLayoutSettings2["AUXILIARYBAR_FORCE_MAXIMIZED"] = "workbench.secondarySideBar.forceMaximized";
  WorkbenchLayoutSettings2["ACTIVITY_BAR_VISIBLE"] = "workbench.activityBar.visible";
  WorkbenchLayoutSettings2["PANEL_POSITION"] = "workbench.panel.defaultLocation";
  WorkbenchLayoutSettings2["PANEL_OPENS_MAXIMIZED"] = "workbench.panel.opensMaximized";
  WorkbenchLayoutSettings2["ZEN_MODE_CONFIG"] = "zenMode";
  WorkbenchLayoutSettings2["EDITOR_CENTERED_LAYOUT_AUTO_RESIZE"] = "workbench.editor.centeredLayoutAutoResize";
  WorkbenchLayoutSettings2["EDITOR_RESTORE_EDITORS"] = "workbench.editor.restoreEditors";
  return WorkbenchLayoutSettings2;
})(WorkbenchLayoutSettings || {});
var LegacyWorkbenchLayoutSettings = /* @__PURE__ */ ((LegacyWorkbenchLayoutSettings2) => {
  LegacyWorkbenchLayoutSettings2["STATUSBAR_VISIBLE"] = "workbench.statusBar.visible";
  LegacyWorkbenchLayoutSettings2["SIDEBAR_POSITION"] = "workbench.sideBar.location";
  return LegacyWorkbenchLayoutSettings2;
})(LegacyWorkbenchLayoutSettings || {});
const _LayoutStateModel = class _LayoutStateModel extends Disposable {
  constructor(storageService, configurationService, contextService, environmentService) {
    super();
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.contextService = contextService;
    this.environmentService = environmentService;
    this._onDidChangeState = this._register(new Emitter());
    this.onDidChangeState = this._onDidChangeState.event;
    this.stateCache = /* @__PURE__ */ new Map();
    this.isNew = {
      [StorageScope.WORKSPACE]: this.storageService.isNew(StorageScope.WORKSPACE),
      [StorageScope.PROFILE]: this.storageService.isNew(StorageScope.PROFILE),
      [StorageScope.APPLICATION]: this.storageService.isNew(StorageScope.APPLICATION),
      [StorageScope.APPLICATION_SHARED]: this.storageService.isNew(StorageScope.APPLICATION_SHARED)
    };
    this._register(this.configurationService.onDidChangeConfiguration((configurationChange) => this.updateStateFromLegacySettings(configurationChange)));
  }
  updateStateFromLegacySettings(configurationChangeEvent) {
    if (configurationChangeEvent.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
      this.setRuntimeValueAndFire(LayoutStateKeys.ACTIVITYBAR_HIDDEN, this.isActivityBarHidden());
    }
    if (configurationChangeEvent.affectsConfiguration("workbench.statusBar.visible" /* STATUSBAR_VISIBLE */)) {
      this.setRuntimeValueAndFire(LayoutStateKeys.STATUSBAR_HIDDEN, !this.configurationService.getValue("workbench.statusBar.visible" /* STATUSBAR_VISIBLE */));
    }
    if (configurationChangeEvent.affectsConfiguration("workbench.sideBar.location" /* SIDEBAR_POSITION */)) {
      this.setRuntimeValueAndFire(LayoutStateKeys.SIDEBAR_POSITON, positionFromString(this.configurationService.getValue("workbench.sideBar.location" /* SIDEBAR_POSITION */) ?? "left"));
    }
  }
  updateLegacySettingsFromState(key, value) {
    const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
    if (key.zenModeIgnore && isZenMode) {
      return;
    }
    if (key === LayoutStateKeys.ACTIVITYBAR_HIDDEN) {
      this.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, value ? ActivityBarPosition.HIDDEN : void 0);
    } else if (key === LayoutStateKeys.STATUSBAR_HIDDEN) {
      this.configurationService.updateValue("workbench.statusBar.visible" /* STATUSBAR_VISIBLE */, !value);
    } else if (key === LayoutStateKeys.SIDEBAR_POSITON) {
      this.configurationService.updateValue("workbench.sideBar.location" /* SIDEBAR_POSITION */, positionToString(value));
    }
  }
  load(configuration) {
    let key;
    if (!configuration.resetLayout) {
      for (key in LayoutStateKeys) {
        const stateKey = LayoutStateKeys[key];
        const value = this.loadKeyFromStorage(stateKey);
        if (value !== void 0) {
          this.stateCache.set(stateKey.name, value);
        }
      }
    }
    this.stateCache.set(LayoutStateKeys.ACTIVITYBAR_HIDDEN.name, this.isActivityBarHidden());
    this.stateCache.set(LayoutStateKeys.STATUSBAR_HIDDEN.name, !this.configurationService.getValue("workbench.statusBar.visible" /* STATUSBAR_VISIBLE */));
    this.stateCache.set(LayoutStateKeys.SIDEBAR_POSITON.name, positionFromString(this.configurationService.getValue("workbench.sideBar.location" /* SIDEBAR_POSITION */) ?? "left"));
    const auxiliaryBarForceMaximized = this.configurationService.getValue("workbench.secondarySideBar.forceMaximized" /* AUXILIARYBAR_FORCE_MAXIMIZED */);
    const workbenchState = this.contextService.getWorkbenchState();
    const mainContainerDimension = configuration.mainContainerDimension;
    LayoutStateKeys.SIDEBAR_SIZE.defaultValue = Math.min(300, mainContainerDimension.width / 4);
    LayoutStateKeys.SIDEBAR_HIDDEN.defaultValue = workbenchState === WorkbenchState.EMPTY || auxiliaryBarForceMaximized === true;
    LayoutStateKeys.AUXILIARYBAR_SIZE.defaultValue = auxiliaryBarForceMaximized ? Math.max(300, mainContainerDimension.width / 2) : Math.min(300, mainContainerDimension.width / 4);
    LayoutStateKeys.AUXILIARYBAR_HIDDEN.defaultValue = (() => {
      if (isWeb && !this.environmentService.remoteAuthority) {
        return true;
      }
      if (auxiliaryBarForceMaximized === true) {
        return false;
      }
      const configuration2 = this.configurationService.inspect("workbench.secondarySideBar.defaultVisibility" /* AUXILIARYBAR_DEFAULT_VISIBILITY */);
      if (configuration2.defaultValue !== "hidden" && !isConfigured(configuration2) && this.stateCache.get(LayoutStateKeys.AUXILIARYBAR_EMPTY.name)) {
        return true;
      }
      if (this.isNew[StorageScope.APPLICATION] && configuration2.value !== "hidden" && !this.configurationService.getValue(ChatAIDisabledSettingId)) {
        return false;
      }
      switch (configuration2.value) {
        case "hidden":
          return true;
        case "visibleInWorkspace":
        case "maximizedInWorkspace":
          return workbenchState === WorkbenchState.EMPTY;
        default:
          return false;
      }
    })();
    LayoutStateKeys.PANEL_SIZE.defaultValue = this.stateCache.get(LayoutStateKeys.PANEL_POSITION.name) ?? isHorizontal(LayoutStateKeys.PANEL_POSITION.defaultValue) ? mainContainerDimension.height / 3 : mainContainerDimension.width / 4;
    LayoutStateKeys.PANEL_POSITION.defaultValue = positionFromString(this.configurationService.getValue("workbench.panel.defaultLocation" /* PANEL_POSITION */) ?? "bottom");
    for (key in LayoutStateKeys) {
      const stateKey = LayoutStateKeys[key];
      if (this.stateCache.get(stateKey.name) === void 0) {
        this.stateCache.set(stateKey.name, stateKey.defaultValue);
      }
    }
    this.applyOverrides(configuration);
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, void 0, this._store)((storageChangeEvent) => {
      let key2;
      for (key2 in LayoutStateKeys) {
        const stateKey = LayoutStateKeys[key2];
        if (stateKey instanceof RuntimeStateKey && stateKey.scope === StorageScope.PROFILE && stateKey.target === StorageTarget.USER) {
          if (`${_LayoutStateModel.STORAGE_PREFIX}${stateKey.name}` === storageChangeEvent.key) {
            const value = this.loadKeyFromStorage(stateKey) ?? stateKey.defaultValue;
            if (this.stateCache.get(stateKey.name) !== value) {
              this.stateCache.set(stateKey.name, value);
              this._onDidChangeState.fire({ key: stateKey, value });
            }
          }
        }
      }
    }));
  }
  applyOverrides(configuration) {
    if (this.isNew[StorageScope.WORKSPACE]) {
      const defaultAuxiliaryBarVisibility = this.configurationService.getValue("workbench.secondarySideBar.defaultVisibility" /* AUXILIARYBAR_DEFAULT_VISIBILITY */);
      const startupEditor = this.configurationService.getValue("workbench.startupEditor");
      if (startupEditor === "agentSessionsWelcomePage") {
        this.applyAuxiliaryBarHiddenOverride(true);
      } else if (defaultAuxiliaryBarVisibility === "maximized" || defaultAuxiliaryBarVisibility === "maximizedInWorkspace" && this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
        this.applyAuxiliaryBarMaximizedOverride();
      }
    }
    if (this.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN) && this.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN) && !this.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED)) {
      this.setRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN, false);
    }
    if (this.isNew[StorageScope.WORKSPACE] && configuration.mainContainerDimension.width <= DEFAULT_WORKSPACE_WINDOW_DIMENSIONS.width) {
      this.setInitializationValue(LayoutStateKeys.SIDEBAR_SIZE, Math.min(300, configuration.mainContainerDimension.width / 4));
      this.setInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE, Math.min(300, configuration.mainContainerDimension.width / 4));
    }
  }
  applyAuxiliaryBarMaximizedOverride() {
    this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_VISIBILITY, {
      sideBarVisible: !this.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN),
      panelVisible: !this.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN),
      editorVisible: !this.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN),
      auxiliaryBarVisible: !this.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN)
    });
    this.setRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN, true);
    this.setRuntimeValue(LayoutStateKeys.PANEL_HIDDEN, true);
    this.setRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN, true);
    this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, false);
    this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_SIZE, this.getInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE));
    this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED, true);
  }
  applyAuxiliaryBarHiddenOverride(value) {
    this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, value);
  }
  save(workspace, global) {
    let key;
    const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
    for (key in LayoutStateKeys) {
      const stateKey = LayoutStateKeys[key];
      if (workspace && stateKey.scope === StorageScope.WORKSPACE || global && stateKey.scope === StorageScope.PROFILE) {
        if (isZenMode && stateKey instanceof RuntimeStateKey && stateKey.zenModeIgnore) {
          continue;
        }
        this.saveKeyToStorage(stateKey);
      }
    }
  }
  getInitializationValue(key) {
    return this.stateCache.get(key.name);
  }
  setInitializationValue(key, value) {
    this.stateCache.set(key.name, value);
  }
  getRuntimeValue(key, fallbackToSetting) {
    if (fallbackToSetting) {
      switch (key) {
        case LayoutStateKeys.ACTIVITYBAR_HIDDEN:
          this.stateCache.set(key.name, this.isActivityBarHidden());
          break;
        case LayoutStateKeys.STATUSBAR_HIDDEN:
          this.stateCache.set(key.name, !this.configurationService.getValue("workbench.statusBar.visible" /* STATUSBAR_VISIBLE */));
          break;
        case LayoutStateKeys.SIDEBAR_POSITON:
          this.stateCache.set(key.name, this.configurationService.getValue("workbench.sideBar.location" /* SIDEBAR_POSITION */) ?? "left");
          break;
      }
    }
    return this.stateCache.get(key.name);
  }
  setRuntimeValue(key, value) {
    this.stateCache.set(key.name, value);
    const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
    if (key.scope === StorageScope.PROFILE) {
      if (!isZenMode || !key.zenModeIgnore) {
        this.saveKeyToStorage(key);
        this.updateLegacySettingsFromState(key, value);
      }
    }
  }
  isActivityBarHidden() {
    const oldValue = this.configurationService.getValue("workbench.activityBar.visible" /* ACTIVITY_BAR_VISIBLE */);
    if (oldValue !== void 0) {
      return !oldValue;
    }
    return this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) !== ActivityBarPosition.DEFAULT;
  }
  setRuntimeValueAndFire(key, value) {
    const previousValue = this.stateCache.get(key.name);
    if (previousValue === value) {
      return;
    }
    this.setRuntimeValue(key, value);
    this._onDidChangeState.fire({ key, value });
  }
  saveKeyToStorage(key) {
    const value = this.stateCache.get(key.name);
    this.storageService.store(`${_LayoutStateModel.STORAGE_PREFIX}${key.name}`, typeof value === "object" ? JSON.stringify(value) : value, key.scope, key.target);
  }
  loadKeyFromStorage(key) {
    const value = this.storageService.get(`${_LayoutStateModel.STORAGE_PREFIX}${key.name}`, key.scope);
    if (value !== void 0) {
      this.isNew[key.scope] = false;
      switch (typeof key.defaultValue) {
        case "boolean":
          return value === "true";
        case "number":
          return parseInt(value);
        case "object":
          return JSON.parse(value);
      }
    }
    return value;
  }
};
_LayoutStateModel.STORAGE_PREFIX = "workbench.";
let LayoutStateModel = _LayoutStateModel;
export {
  Layout,
  TITLE_BAR_SETTINGS
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL2xheW91dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBFdmVudFR5cGUsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgZ2V0Q2xpZW50QXJlYSwgc2l6ZSwgSURpbWVuc2lvbiwgaXNBbmNlc3RvclVzaW5nRmxvd1RvLCBjb21wdXRlU2NyZWVuQXdhcmVTaXplLCBnZXRBY3RpdmVEb2N1bWVudCwgZ2V0V2luZG93cywgZ2V0QWN0aXZlV2luZG93LCBpc0FjdGl2ZURvY3VtZW50LCBnZXRXaW5kb3csIGdldFdpbmRvd0lkLCBnZXRBY3RpdmVFbGVtZW50LCBEaW1lbnNpb24gfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG9uRGlkQ2hhbmdlRnVsbHNjcmVlbiwgaXNGdWxsc2NyZWVuLCBpc1dDT0VuYWJsZWQgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MsIGlzTGludXgsIGlzTWFjaW50b3NoLCBpc1dlYiwgaXNJT1MgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgR3JvdXBJZGVudGlmaWVyLCBpc1Jlc291cmNlRWRpdG9ySW5wdXQsIElVbnR5cGVkRWRpdG9ySW5wdXQsIHBhdGhzVG9FZGl0b3JzIH0gZnJvbSAnLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBTaWRlYmFyUGFydCB9IGZyb20gJy4vcGFydHMvc2lkZWJhci9zaWRlYmFyUGFydC5qcyc7XG5pbXBvcnQgeyBQYW5lbFBhcnQgfSBmcm9tICcuL3BhcnRzL3BhbmVsL3BhbmVsUGFydC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiwgUGFydHMsIFBhcnRPcGVuc01heGltaXplZE9wdGlvbnMsIElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBwb3NpdGlvbkZyb21TdHJpbmcsIHBvc2l0aW9uVG9TdHJpbmcsIHBhcnRPcGVuc01heGltaXplZEZyb21TdHJpbmcsIFBhbmVsQWxpZ25tZW50LCBBY3Rpdml0eUJhclBvc2l0aW9uLCBMYXlvdXRTZXR0aW5ncywgTVVMVElfV0lORE9XX1BBUlRTLCBTSU5HTEVfV0lORE9XX1BBUlRTLCBaZW5Nb2RlU2V0dGluZ3MsIEVkaXRvclRhYnNNb2RlLCBFZGl0b3JBY3Rpb25zTG9jYXRpb24sIHNob3VsZFNob3dDdXN0b21UaXRsZUJhciwgaXNIb3Jpem9udGFsLCBpc011bHRpV2luZG93UGFydCwgSVBhcnRWaXNpYmlsaXR5Q2hhbmdlRXZlbnQgfSBmcm9tICcuLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzVGVtcG9yYXJ5V29ya3NwYWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElDb25maWd1cmF0aW9uU2VydmljZSwgaXNDb25maWd1cmVkIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2NoYXQvY29tbW9uL2NoYXRTZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBJVGl0bGVTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvdGl0bGUvYnJvd3Nlci90aXRsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU3RhcnR1cEtpbmQsIElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZ2V0TWVudUJhclZpc2liaWxpdHksIElQYXRoLCBoYXNOYXRpdmVUaXRsZWJhciwgaGFzQ3VzdG9tVGl0bGViYXIsIFRpdGxlQmFyU2V0dGluZywgQ3VzdG9tVGl0bGVCYXJWaXNpYmlsaXR5LCB1c2VXaW5kb3dDb250cm9sc092ZXJsYXksIERFRkFVTFRfRU1QVFlfV0lORE9XX1NJWkUsIERFRkFVTFRfV09SS1NQQUNFX1dJTkRPV19TSVpFLCBoYXNOYXRpdmVNZW51LCBNZW51U2V0dGluZ3MgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvckdyb3VwTGF5b3V0LCBHcm91cEFjdGl2YXRpb25SZWFzb24sIEdyb3VwT3JpZW50YXRpb24sIEdyb3Vwc09yZGVyLCBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXJpYWxpemFibGVHcmlkLCBJU2VyaWFsaXphYmxlVmlldywgSVNlcmlhbGl6ZWRHcmlkLCBPcmllbnRhdGlvbiwgSVNlcmlhbGl6ZWROb2RlLCBJU2VyaWFsaXplZExlYWZOb2RlLCBEaXJlY3Rpb24sIElWaWV3U2l6ZSwgU2l6aW5nIH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL3VpL2dyaWQvZ3JpZC5qcyc7XG5pbXBvcnQgeyBQYXJ0IH0gZnJvbSAnLi9wYXJ0LmpzJztcbmltcG9ydCB7IElTdGF0dXNiYXJTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBpc0NvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIE5vdGlmaWNhdGlvbnNGaWx0ZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBXSU5ET1dfQUNUSVZFX0JPUkRFUiwgV0lORE9XX0lOQUNUSVZFX0JPUkRFUiB9IGZyb20gJy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBMaW5lTnVtYmVyc1R5cGUgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vY29tbW9uL2VkaXRvci9kaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgbWFyayB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJQmFubmVyU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2Jhbm5lci9icm93c2VyL2Jhbm5lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IEF1eGlsaWFyeUJhclBhcnQgfSBmcm9tICcuL3BhcnRzL2F1eGlsaWFyeWJhci9hdXhpbGlhcnlCYXJQYXJ0LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUF1eGlsaWFyeVdpbmRvd1NlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9hdXhpbGlhcnlXaW5kb3cvYnJvd3Nlci9hdXhpbGlhcnlXaW5kb3dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGVXaW5kb3csIG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vbmxzLmpzJztcblxuLy8jcmVnaW9uIExheW91dCBJbXBsZW1lbnRhdGlvblxuXG5pbnRlcmZhY2UgSUxheW91dFJ1bnRpbWVTdGF0ZSB7XG5cdGFjdGl2ZUNvbnRhaW5lcklkOiBudW1iZXI7XG5cdG1haW5XaW5kb3dGdWxsc2NyZWVuOiBib29sZWFuO1xuXHRyZWFkb25seSBtYXhpbWl6ZWQ6IFNldDxudW1iZXI+O1xuXHRoYXNGb2N1czogYm9vbGVhbjtcblx0bWFpbldpbmRvd0JvcmRlcjogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWVudUJhcjoge1xuXHRcdHRvZ2dsZWQ6IGJvb2xlYW47XG5cdH07XG5cdHJlYWRvbmx5IHplbk1vZGU6IHtcblx0XHRyZWFkb25seSB0cmFuc2l0aW9uRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT47XG5cdH07XG59XG5cbmludGVyZmFjZSBJRWRpdG9yVG9PcGVuIHtcblx0cmVhZG9ubHkgZWRpdG9yOiBJVW50eXBlZEVkaXRvcklucHV0O1xuXHRyZWFkb25seSB2aWV3Q29sdW1uPzogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSUxheW91dEluaXRpYWxpemF0aW9uU3RhdGUge1xuXHRyZWFkb25seSB2aWV3czoge1xuXHRcdHJlYWRvbmx5IGRlZmF1bHRzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0XHRyZWFkb25seSBjb250YWluZXJUb1Jlc3RvcmU6IHtcblx0XHRcdHNpZGVCYXI/OiBzdHJpbmc7XG5cdFx0XHRwYW5lbD86IHN0cmluZztcblx0XHRcdGF1eGlsaWFyeUJhcj86IHN0cmluZztcblx0XHR9O1xuXHR9O1xuXHRyZWFkb25seSBlZGl0b3I6IHtcblx0XHRyZWFkb25seSByZXN0b3JlRWRpdG9yczogYm9vbGVhbjtcblx0XHRyZWFkb25seSBlZGl0b3JzVG9PcGVuOiBQcm9taXNlPElFZGl0b3JUb09wZW5bXT47XG5cdH07XG5cdHJlYWRvbmx5IGxheW91dD86IHtcblx0XHRyZWFkb25seSBlZGl0b3JzPzogRWRpdG9yR3JvdXBMYXlvdXQ7XG5cdH07XG59XG5cbmludGVyZmFjZSBJTGF5b3V0U3RhdGUge1xuXHRyZWFkb25seSBydW50aW1lOiBJTGF5b3V0UnVudGltZVN0YXRlO1xuXHRyZWFkb25seSBpbml0aWFsaXphdGlvbjogSUxheW91dEluaXRpYWxpemF0aW9uU3RhdGU7XG59XG5cbmVudW0gTGF5b3V0Q2xhc3NlcyB7XG5cdFNJREVCQVJfSElEREVOID0gJ25vc2lkZWJhcicsXG5cdE1BSU5fRURJVE9SX0FSRUFfSElEREVOID0gJ25vbWFpbmVkaXRvcmFyZWEnLFxuXHRQQU5FTF9ISURERU4gPSAnbm9wYW5lbCcsXG5cdEFVWElMSUFSWUJBUl9ISURERU4gPSAnbm9hdXhpbGlhcnliYXInLFxuXHRBQ1RJVklUWUJBUl9ISURERU4gPSAnbm9hY3Rpdml0eWJhcicsXG5cdFNUQVRVU0JBUl9ISURERU4gPSAnbm9zdGF0dXNiYXInLFxuXHRGVUxMU0NSRUVOID0gJ2Z1bGxzY3JlZW4nLFxuXHRNQVhJTUlaRUQgPSAnbWF4aW1pemVkJyxcblx0V0lORE9XX0JPUkRFUiA9ICdib3JkZXInLFxuXHROT19TSEFET1dTID0gJ25vLXNoYWRvd3MnLFxuXHRGTE9BVElOR19QQU5FTFMgPSAnZmxvYXRpbmctcGFuZWxzJyxcblx0Ly8gUHJlc2VudGF0aW9uIGNsYXNzIGZvciB0aGUgTW9kZXJuIFVJIFVwZGF0ZSBleHBlcmltZW50LCBvd25lZC90b2dnbGVkIGF0XG5cdC8vIHJ1bnRpbWUgYnkgYFN0eWxlT3ZlcnJpZGVzQ29udHJpYnV0aW9uYC4gSXQgaXMgKmFsc28qIGFwcGxpZWQgaGVyZSBhdCByZW5kZXJcblx0Ly8gdGltZSAoc2VlIGBnZXRMYXlvdXRDbGFzc2VzYCkgYmVjYXVzZSBwYXJ0cyByZWFkIGl0IGJhY2sgZHVyaW5nIGxheW91dCAoZS5nLlxuXHQvLyB0aGUgMzJweCB2cyAzNXB4IHBhcnQgdGl0bGUgaGVpZ2h0IGluIGBQYXJ0TGF5b3V0YCwgYW5kIHRoZSBlZGl0b3IgdGFiXG5cdC8vIGhlaWdodCkgdmlhIGAuY2xvc2VzdCgnLnN0eWxlLW92ZXJyaWRlJylgLiBUaGUgY29udHJpYnV0aW9uIHJ1bnMgaW4gdGhlXG5cdC8vIGBSZXN0b3JlZGAgcGhhc2UgXHUyMDE0IGFmdGVyIHRoZSBmaXJzdCBsYXlvdXQgXHUyMDE0IHNvIHdpdGhvdXQgdGhpcyBlYXJseVxuXHQvLyBhcHBsaWNhdGlvbiB0aGUgZmlyc3QgbGF5b3V0IHdvdWxkIHNpemUgcGFydHMgYWdhaW5zdCB0aGUgZGVmYXVsdCAoMzVweClcblx0Ly8gdGl0bGUgYW5kIGxlYXZlIHRoZW0gbWlzbWF0Y2hlZCB1bnRpbCB0aGUgbmV4dCByZWxheW91dC5cblx0U1RZTEVfT1ZFUlJJREUgPSAnc3R5bGUtb3ZlcnJpZGUnXG59XG5cbmludGVyZmFjZSBJUGF0aFRvT3BlbiBleHRlbmRzIElQYXRoIHtcblx0cmVhZG9ubHkgdmlld0NvbHVtbj86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElJbml0aWFsRWRpdG9yc1N0YXRlIHtcblx0cmVhZG9ubHkgZmlsZXNUb09wZW5PckNyZWF0ZT86IElQYXRoVG9PcGVuW107XG5cdHJlYWRvbmx5IGZpbGVzVG9EaWZmPzogSVBhdGhUb09wZW5bXTtcblx0cmVhZG9ubHkgZmlsZXNUb01lcmdlPzogSVBhdGhUb09wZW5bXTtcblxuXHRyZWFkb25seSBsYXlvdXQ/OiBFZGl0b3JHcm91cExheW91dDtcbn1cblxuY29uc3QgQ09NTUFORF9DRU5URVJfU0VUVElOR1MgPSBbXG5cdCdjaGF0LmFnZW50c0NvbnRyb2wuZW5hYmxlZCcsXG5cdCdjaGF0LnVuaWZpZWRBZ2VudHNCYXIuZW5hYmxlZCcsXG5cdCd3b3JrYmVuY2gubmF2aWdhdGlvbkNvbnRyb2wuZW5hYmxlZCcsXG5cdCd3b3JrYmVuY2guZXhwZXJpbWVudGFsLnNoYXJlLmVuYWJsZWQnLFxuXTtcblxuZXhwb3J0IGNvbnN0IFRJVExFX0JBUl9TRVRUSU5HUyA9IFtcblx0TGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OLFxuXHRMYXlvdXRTZXR0aW5ncy5DT01NQU5EX0NFTlRFUixcblx0Li4uQ09NTUFORF9DRU5URVJfU0VUVElOR1MsXG5cdExheW91dFNldHRpbmdzLkVESVRPUl9BQ1RJT05TX0xPQ0FUSU9OLFxuXHRMYXlvdXRTZXR0aW5ncy5MQVlPVVRfQUNUSU9OUyxcblx0TWVudVNldHRpbmdzLk1lbnVCYXJWaXNpYmlsaXR5LFxuXHRUaXRsZUJhclNldHRpbmcuVElUTEVfQkFSX1NUWUxFLFxuXHRUaXRsZUJhclNldHRpbmcuQ1VTVE9NX1RJVExFX0JBUl9WSVNJQklMSVRZLFxuXTtcblxuY29uc3QgREVGQVVMVF9FTVBUWV9XSU5ET1dfRElNRU5TSU9OUyA9IG5ldyBEaW1lbnNpb24oREVGQVVMVF9FTVBUWV9XSU5ET1dfU0laRS53aWR0aCwgREVGQVVMVF9FTVBUWV9XSU5ET1dfU0laRS5oZWlnaHQpO1xuY29uc3QgREVGQVVMVF9XT1JLU1BBQ0VfV0lORE9XX0RJTUVOU0lPTlMgPSBuZXcgRGltZW5zaW9uKERFRkFVTFRfV09SS1NQQUNFX1dJTkRPV19TSVpFLndpZHRoLCBERUZBVUxUX1dPUktTUEFDRV9XSU5ET1dfU0laRS5oZWlnaHQpO1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgTGF5b3V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvLyNyZWdpb24gRXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VaZW5Nb2RlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlWmVuTW9kZSA9IHRoaXMuX29uRGlkQ2hhbmdlWmVuTW9kZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1haW5FZGl0b3JDZW50ZXJlZExheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1haW5FZGl0b3JDZW50ZXJlZExheW91dCA9IHRoaXMuX29uRGlkQ2hhbmdlTWFpbkVkaXRvckNlbnRlcmVkTGF5b3V0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUGFuZWxBbGlnbm1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxQYW5lbEFsaWdubWVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGFuZWxBbGlnbm1lbnQgPSB0aGlzLl9vbkRpZENoYW5nZVBhbmVsQWxpZ25tZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV2luZG93TWF4aW1pemVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyB3aW5kb3dJZDogbnVtYmVyOyBtYXhpbWl6ZWQ6IGJvb2xlYW4gfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlV2luZG93TWF4aW1pemVkID0gdGhpcy5fb25EaWRDaGFuZ2VXaW5kb3dNYXhpbWl6ZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQYW5lbFBvc2l0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQYW5lbFBvc2l0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VQYW5lbFBvc2l0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUGFydFZpc2liaWxpdHlDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkgPSB0aGlzLl9vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTm90aWZpY2F0aW9uc1Zpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VOb3RpZmljYXRpb25zVmlzaWJpbGl0eSA9IHRoaXMuX29uRGlkQ2hhbmdlTm90aWZpY2F0aW9uc1Zpc2liaWxpdHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBdXhpbGlhcnlCYXJNYXhpbWl6ZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBdXhpbGlhcnlCYXJNYXhpbWl6ZWQgPSB0aGlzLl9vbkRpZENoYW5nZUF1eGlsaWFyeUJhck1heGltaXplZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZExheW91dE1haW5Db250YWluZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRGltZW5zaW9uPigpKTtcblx0cmVhZG9ubHkgb25EaWRMYXlvdXRNYWluQ29udGFpbmVyID0gdGhpcy5fb25EaWRMYXlvdXRNYWluQ29udGFpbmVyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTGF5b3V0QWN0aXZlQ29udGFpbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SURpbWVuc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTGF5b3V0QWN0aXZlQ29udGFpbmVyID0gdGhpcy5fb25EaWRMYXlvdXRBY3RpdmVDb250YWluZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRMYXlvdXRDb250YWluZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7IGRpbWVuc2lvbjogSURpbWVuc2lvbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRMYXlvdXRDb250YWluZXIgPSB0aGlzLl9vbkRpZExheW91dENvbnRhaW5lci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFkZENvbnRhaW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgY29udGFpbmVyOiBIVE1MRWxlbWVudDsgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRBZGRDb250YWluZXIgPSB0aGlzLl9vbkRpZEFkZENvbnRhaW5lci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZUNvbnRhaW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZUNvbnRhaW5lciA9IHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlQ29udGFpbmVyLmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBQcm9wZXJ0aWVzXG5cblx0cmVhZG9ubHkgbWFpbkNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRnZXQgYWN0aXZlQ29udGFpbmVyKCkgeyByZXR1cm4gdGhpcy5nZXRDb250YWluZXJGcm9tRG9jdW1lbnQoZ2V0QWN0aXZlRG9jdW1lbnQoKSk7IH1cblx0Z2V0IGNvbnRhaW5lcnMoKTogSXRlcmFibGU8SFRNTEVsZW1lbnQ+IHtcblx0XHRjb25zdCBjb250YWluZXJzOiBIVE1MRWxlbWVudFtdID0gW107XG5cdFx0Zm9yIChjb25zdCB7IHdpbmRvdyB9IG9mIGdldFdpbmRvd3MoKSkge1xuXHRcdFx0Y29udGFpbmVycy5wdXNoKHRoaXMuZ2V0Q29udGFpbmVyRnJvbURvY3VtZW50KHdpbmRvdy5kb2N1bWVudCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb250YWluZXJzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb250YWluZXJGcm9tRG9jdW1lbnQodGFyZ2V0RG9jdW1lbnQ6IERvY3VtZW50KTogSFRNTEVsZW1lbnQge1xuXHRcdGlmICh0YXJnZXREb2N1bWVudCA9PT0gdGhpcy5tYWluQ29udGFpbmVyLm93bmVyRG9jdW1lbnQpIHtcblx0XHRcdHJldHVybiB0aGlzLm1haW5Db250YWluZXI7IC8vIG1haW4gd2luZG93XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0cmV0dXJuIHRhcmdldERvY3VtZW50LmJvZHkuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZSgnbW9uYWNvLXdvcmtiZW5jaCcpWzBdIGFzIEhUTUxFbGVtZW50OyAvLyBhdXhpbGlhcnkgd2luZG93XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXJTdHlsZXNMb2FkZWQgPSBuZXcgTWFwPG51bWJlciAvKiB3aW5kb3cgSUQgKi8sIFByb21pc2U8dm9pZD4+KCk7XG5cdHdoZW5Db250YWluZXJTdHlsZXNMb2FkZWQod2luZG93OiBDb2RlV2luZG93KTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGFpbmVyU3R5bGVzTG9hZGVkLmdldCh3aW5kb3cudnNjb2RlV2luZG93SWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWFpbkNvbnRhaW5lckRpbWVuc2lvbiE6IElEaW1lbnNpb247XG5cdGdldCBtYWluQ29udGFpbmVyRGltZW5zaW9uKCk6IElEaW1lbnNpb24geyByZXR1cm4gdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbjsgfVxuXG5cdGdldCBhY3RpdmVDb250YWluZXJEaW1lbnNpb24oKTogSURpbWVuc2lvbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Q29udGFpbmVyRGltZW5zaW9uKHRoaXMuYWN0aXZlQ29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29udGFpbmVyRGltZW5zaW9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGltZW5zaW9uIHtcblx0XHRpZiAoY29udGFpbmVyID09PSB0aGlzLm1haW5Db250YWluZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLm1haW5Db250YWluZXJEaW1lbnNpb247IC8vIG1haW4gd2luZG93XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBnZXRDbGllbnRBcmVhKGNvbnRhaW5lcik7IFx0Ly8gYXV4aWxpYXJ5IHdpbmRvd1xuXHRcdH1cblx0fVxuXG5cdGdldCBtYWluQ29udGFpbmVyT2Zmc2V0KCkge1xuXHRcdHJldHVybiB0aGlzLmNvbXB1dGVDb250YWluZXJPZmZzZXQobWFpbldpbmRvdyk7XG5cdH1cblxuXHRnZXQgYWN0aXZlQ29udGFpbmVyT2Zmc2V0KCkge1xuXHRcdHJldHVybiB0aGlzLmNvbXB1dGVDb250YWluZXJPZmZzZXQoZ2V0V2luZG93KHRoaXMuYWN0aXZlQ29udGFpbmVyKSk7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVDb250YWluZXJPZmZzZXQodGFyZ2V0V2luZG93OiBXaW5kb3cpIHtcblx0XHRsZXQgdG9wID0gMDtcblx0XHRsZXQgcXVpY2tQaWNrVG9wID0gMDtcblxuXHRcdGlmICh0aGlzLmlzVmlzaWJsZShQYXJ0cy5CQU5ORVJfUEFSVCkpIHtcblx0XHRcdHRvcCA9IHRoaXMuZ2V0UGFydChQYXJ0cy5CQU5ORVJfUEFSVCkubWF4aW11bUhlaWdodDtcblx0XHRcdHF1aWNrUGlja1RvcCA9IHRvcDtcblx0XHR9XG5cblx0XHRjb25zdCB0aXRsZWJhclZpc2libGUgPSB0aGlzLmlzVmlzaWJsZShQYXJ0cy5USVRMRUJBUl9QQVJULCB0YXJnZXRXaW5kb3cpO1xuXHRcdGlmICh0aXRsZWJhclZpc2libGUpIHtcblx0XHRcdHRvcCArPSB0aGlzLmdldFBhcnQoUGFydHMuVElUTEVCQVJfUEFSVCkubWF4aW11bUhlaWdodDtcblx0XHRcdHF1aWNrUGlja1RvcCA9IHRvcDtcblx0XHR9XG5cblx0XHRjb25zdCBpc0NvbW1hbmRDZW50ZXJWaXNpYmxlID0gdGl0bGViYXJWaXNpYmxlICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTGF5b3V0U2V0dGluZ3MuQ09NTUFORF9DRU5URVIpICE9PSBmYWxzZTtcblx0XHRpZiAoaXNDb21tYW5kQ2VudGVyVmlzaWJsZSkge1xuXHRcdFx0Ly8gSWYgdGhlIGNvbW1hbmQgY2VudGVyIGlzIHZpc2libGUgdGhlbiB0aGUgcXVpY2tpbnB1dFxuXHRcdFx0Ly8gc2hvdWxkIGdvIG92ZXIgdGhlIHRpdGxlIGJhciBhbmQgdGhlIGJhbm5lclxuXHRcdFx0cXVpY2tQaWNrVG9wID0gNjtcblx0XHR9XG5cblx0XHRyZXR1cm4geyB0b3AsIHF1aWNrUGlja1RvcCB9O1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSByZWFkb25seSBwYXJ0cyA9IG5ldyBNYXA8c3RyaW5nLCBQYXJ0PigpO1xuXG5cdHByaXZhdGUgaW5pdGlhbGl6ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSB3b3JrYmVuY2hHcmlkITogU2VyaWFsaXphYmxlR3JpZDxJU2VyaWFsaXphYmxlVmlldz47XG5cblx0cHJpdmF0ZSB0aXRsZUJhclBhcnRWaWV3ITogSVNlcmlhbGl6YWJsZVZpZXc7XG5cdHByaXZhdGUgYmFubmVyUGFydFZpZXchOiBJU2VyaWFsaXphYmxlVmlldztcblx0cHJpdmF0ZSBhY3Rpdml0eUJhclBhcnRWaWV3ITogSVNlcmlhbGl6YWJsZVZpZXc7XG5cdHByaXZhdGUgc2lkZUJhclBhcnRWaWV3ITogSVNlcmlhbGl6YWJsZVZpZXc7XG5cdHByaXZhdGUgcGFuZWxQYXJ0VmlldyE6IElTZXJpYWxpemFibGVWaWV3O1xuXHRwcml2YXRlIGF1eGlsaWFyeUJhclBhcnRWaWV3ITogSVNlcmlhbGl6YWJsZVZpZXc7XG5cdHByaXZhdGUgZWRpdG9yUGFydFZpZXchOiBJU2VyaWFsaXphYmxlVmlldztcblx0cHJpdmF0ZSBzdGF0dXNCYXJQYXJ0VmlldyE6IElTZXJpYWxpemFibGVWaWV3O1xuXG5cdHByaXZhdGUgZW52aXJvbm1lbnRTZXJ2aWNlITogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2U7XG5cdHByaXZhdGUgZXh0ZW5zaW9uU2VydmljZSE6IElFeHRlbnNpb25TZXJ2aWNlO1xuXHRwcml2YXRlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlITogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRwcml2YXRlIHN0b3JhZ2VTZXJ2aWNlITogSVN0b3JhZ2VTZXJ2aWNlO1xuXHRwcml2YXRlIGhvc3RTZXJ2aWNlITogSUhvc3RTZXJ2aWNlO1xuXHRwcml2YXRlIGVkaXRvclNlcnZpY2UhOiBJRWRpdG9yU2VydmljZTtcblx0cHJpdmF0ZSBtYWluUGFydEVkaXRvclNlcnZpY2UhOiBJRWRpdG9yU2VydmljZTtcblx0cHJpdmF0ZSBlZGl0b3JHcm91cFNlcnZpY2UhOiBJRWRpdG9yR3JvdXBzU2VydmljZTtcblx0cHJpdmF0ZSBwYW5lQ29tcG9zaXRlU2VydmljZSE6IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2U7XG5cdHByaXZhdGUgdGl0bGVTZXJ2aWNlITogSVRpdGxlU2VydmljZTtcblx0cHJpdmF0ZSB2aWV3RGVzY3JpcHRvclNlcnZpY2UhOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlO1xuXHRwcml2YXRlIGNvbnRleHRTZXJ2aWNlITogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlO1xuXHRwcml2YXRlIG5vdGlmaWNhdGlvblNlcnZpY2UhOiBJTm90aWZpY2F0aW9uU2VydmljZTtcblx0cHJpdmF0ZSB0aGVtZVNlcnZpY2UhOiBJVGhlbWVTZXJ2aWNlO1xuXHRwcml2YXRlIHN0YXR1c0JhclNlcnZpY2UhOiBJU3RhdHVzYmFyU2VydmljZTtcblx0cHJpdmF0ZSBsb2dTZXJ2aWNlITogSUxvZ1NlcnZpY2U7XG5cdHByaXZhdGUgdGVsZW1ldHJ5U2VydmljZSE6IElUZWxlbWV0cnlTZXJ2aWNlO1xuXHRwcml2YXRlIGF1eGlsaWFyeVdpbmRvd1NlcnZpY2UhOiBJQXV4aWxpYXJ5V2luZG93U2VydmljZTtcblxuXHRwcml2YXRlIHN0YXRlITogSUxheW91dFN0YXRlO1xuXHRwcml2YXRlIHN0YXRlTW9kZWwhOiBMYXlvdXRTdGF0ZU1vZGVsO1xuXG5cdHByaXZhdGUgZGlzcG9zZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgcGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxheW91dE9wdGlvbnM/OiB7IHJlc2V0TGF5b3V0OiBib29sZWFuIH1cblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBpbml0TGF5b3V0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cblx0XHQvLyBTZXJ2aWNlc1xuXHRcdHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5ob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXHRcdHRoaXMuY29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy50aGVtZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRoZW1lU2VydmljZSk7XG5cdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25TZXJ2aWNlKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0dGhpcy5hdXhpbGlhcnlXaW5kb3dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlKTtcblxuXHRcdC8vIFBhcnRzXG5cdFx0dGhpcy5lZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0dGhpcy5tYWluUGFydEVkaXRvclNlcnZpY2UgPSB0aGlzLmVkaXRvclNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0LCB0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblx0XHR0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKTtcblx0XHR0aGlzLnRpdGxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGl0bGVTZXJ2aWNlKTtcblx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuc3RhdHVzQmFyU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RhdHVzYmFyU2VydmljZSk7XG5cdFx0YWNjZXNzb3IuZ2V0KElCYW5uZXJTZXJ2aWNlKTtcblxuXHRcdC8vIExpc3RlbmVyc1xuXHRcdHRoaXMucmVnaXN0ZXJMYXlvdXRMaXN0ZW5lcnMoKTtcblxuXHRcdC8vIFN0YXRlXG5cdFx0dGhpcy5pbml0TGF5b3V0U3RhdGUoYWNjZXNzb3IuZ2V0KElMaWZlY3ljbGVTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckxheW91dExpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIFJlc3RvcmUgZWRpdG9yIGlmIGhpZGRlbiBhbmQgYW4gZWRpdG9yIGlzIHRvIHNob3dcblx0XHRjb25zdCBzaG93RWRpdG9ySWZIaWRkZW4gPSAoZXhwbGljaXRVc2VyQWN0aW9uPzogYm9vbGVhbikgPT4ge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHR0aGlzLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykgfHxcdFx0Ly8gYWxyZWFkeSB2aXNpYmxlXG5cdFx0XHRcdHRoaXMubWFpblBhcnRFZGl0b3JTZXJ2aWNlLnZpc2libGVFZGl0b3JzLmxlbmd0aCA9PT0gMFx0Ly8gbm8gZWRpdG9yIHRvIHNob3dcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmlzQXV4aWxpYXJ5QmFyTWF4aW1pemVkKCkpIHtcblx0XHRcdFx0Ly8gRG8gbm90IHVubWF4aW1pemUgdGhlIGF1eGlsaWFyeSBzaWRlIGJhciB3aGVuIHRoZSBlZGl0b3Igd2FzXG5cdFx0XHRcdC8vIG9wZW5lZCBhdXRvbWF0aWNhbGx5IChlLmcuIGJ5IHRoZSBjaGF0IGFnZW50IGFwcGx5aW5nIGVkaXRzKS5cblx0XHRcdFx0Ly8gT25seSBhbiBleHBsaWNpdCB1c2VyIGFjdGlvbiBzaG91bGQgZGlzcnVwdCB0aGUgY2hvc2VuIGxheW91dC5cblx0XHRcdFx0aWYgKGV4cGxpY2l0VXNlckFjdGlvbiAhPT0gZmFsc2UpIHtcblx0XHRcdFx0XHR0aGlzLnRvZ2dsZU1heGltaXplZEF1eGlsaWFyeUJhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRvZ2dsZU1heGltaXplZFBhbmVsKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIE1heWJlIG1heGltaXplIGF1eGlsaWFyeSBiYXIgd2hlbiBubyBlZGl0b3JzIGFyZSB2aXNpYmxlXG5cdFx0Y29uc3QgbWF5YmVNYXhpbWl6ZUF1eGlsaWFyeUJhciA9ICgpID0+IHtcblx0XHRcdGlmIChcblx0XHRcdFx0dGhpcy5tYWluUGFydEVkaXRvclNlcnZpY2UudmlzaWJsZUVkaXRvcnMubGVuZ3RoID09PSAwICYmXG5cdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoV29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuQVVYSUxJQVJZQkFSX0ZPUkNFX01BWElNSVpFRCkgPT09IHRydWVcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLnNldEF1eGlsaWFyeUJhck1heGltaXplZCh0cnVlKTtcblxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH07XG5cblx0XHQvLyBXYWl0IHRvIHJlZ2lzdGVyIHRoZXNlIGxpc3RlbmVycyBhZnRlciB0aGUgZWRpdG9yIGdyb3VwIHNlcnZpY2Vcblx0XHQvLyBpcyByZWFkeSB0byBhdm9pZCBjb25mbGljdHMgb24gc3RhcnR1cFxuXHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLndoZW5SZXN0b3JlZC50aGVuKCgpID0+IHtcblxuXHRcdFx0Ly8gSGFuZGxlIHZpc2libGUgZWRpdG9ycyBjaGFuZ2luZyBmb3IgcGFydHMgdmlzaWJpbGl0eVxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tYWluUGFydEVkaXRvclNlcnZpY2Uub25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZShlID0+IHtcblx0XHRcdFx0Y29uc3QgaGFuZGxlZCA9IG1heWJlTWF4aW1pemVBdXhpbGlhcnlCYXIoKTtcblx0XHRcdFx0aWYgKCFoYW5kbGVkKSB7XG5cdFx0XHRcdFx0c2hvd0VkaXRvcklmSGlkZGVuKGUuaXNFeHBsaWNpdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0Lm9uRGlkQWN0aXZhdGVHcm91cChlID0+IHtcblx0XHRcdFx0aWYgKGUucmVhc29uICE9PSBHcm91cEFjdGl2YXRpb25SZWFzb24uUEFSVF9DTE9TRSkge1xuXHRcdFx0XHRcdHNob3dFZGl0b3JJZkhpZGRlbigpOyAvLyBvbmx5IHNob3cgdW5sZXNzIGEgbW9kYWwvYXV4aWxpYXJ5IHBhcnQgY2xvc2VzXG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gUmV2YWxpZGF0ZSBjZW50ZXIgbGF5b3V0IHdoZW4gYWN0aXZlIGVkaXRvciBjaGFuZ2VzOiBkaWZmIGVkaXRvciBxdWl0cyBjZW50ZXJlZCBtb2RlXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1haW5QYXJ0RWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB0aGlzLmNlbnRlck1haW5FZGl0b3JMYXlvdXQodGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuTUFJTl9FRElUT1JfQ0VOVEVSRUQpKSkpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQ29uZmlndXJhdGlvbiBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cblx0XHRcdC8vIExheW91dCByZWxhdGVkXG5cdFx0XHRpZiAoW1xuXHRcdFx0XHQuLi5USVRMRV9CQVJfU0VUVElOR1MsXG5cdFx0XHRcdExlZ2FjeVdvcmtiZW5jaExheW91dFNldHRpbmdzLlNJREVCQVJfUE9TSVRJT04sXG5cdFx0XHRcdExlZ2FjeVdvcmtiZW5jaExheW91dFNldHRpbmdzLlNUQVRVU0JBUl9WSVNJQkxFLFxuXHRcdFx0XS5zb21lKHNldHRpbmcgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihzZXR0aW5nKSkpIHtcblxuXHRcdFx0XHQvLyBTaG93IENvbW1hbmQgQ2VudGVyIGlmIGNvbW1hbmQgY2VudGVyIGFjdGlvbnMgZW5hYmxlZFxuXHRcdFx0XHRjb25zdCBlbmFibGVkQ29tbWFuZENlbnRlckFjdGlvbiA9IENPTU1BTkRfQ0VOVEVSX1NFVFRJTkdTLnNvbWUoc2V0dGluZyA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKHNldHRpbmcpICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oc2V0dGluZykgPT09IHRydWUpO1xuXG5cdFx0XHRcdGlmIChlbmFibGVkQ29tbWFuZENlbnRlckFjdGlvbikge1xuXHRcdFx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KExheW91dFNldHRpbmdzLkNPTU1BTkRfQ0VOVEVSKSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoTGF5b3V0U2V0dGluZ3MuQ09NTUFORF9DRU5URVIsIHRydWUpO1xuXHRcdFx0XHRcdFx0cmV0dXJuOyAvLyBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gd2lsbCBiZSB0cmlnZ2VyZWQgYWdhaW5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTaG93IEN1c3RvbSBUaXRsZUJhciBpZiBhY3Rpb25zIGVuYWJsZWQgaW4gKG9yIG1vdmVkIHRvKSB0aGUgdGl0bGViYXJcblx0XHRcdFx0Y29uc3QgZWRpdG9yQWN0aW9uc01vdmVkVG9UaXRsZWJhciA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuRURJVE9SX0FDVElPTlNfTE9DQVRJT04pICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8RWRpdG9yQWN0aW9uc0xvY2F0aW9uPihMYXlvdXRTZXR0aW5ncy5FRElUT1JfQUNUSU9OU19MT0NBVElPTikgPT09IEVkaXRvckFjdGlvbnNMb2NhdGlvbi5USVRMRUJBUjtcblx0XHRcdFx0Y29uc3QgY29tbWFuZENlbnRlckVuYWJsZWQgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLkNPTU1BTkRfQ0VOVEVSKSAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KExheW91dFNldHRpbmdzLkNPTU1BTkRfQ0VOVEVSKTtcblx0XHRcdFx0Y29uc3QgbGF5b3V0Q29udHJvbHNFbmFibGVkID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5MQVlPVVRfQUNUSU9OUykgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihMYXlvdXRTZXR0aW5ncy5MQVlPVVRfQUNUSU9OUyk7XG5cdFx0XHRcdGNvbnN0IGFjdGl2aXR5QmFyTW92ZWRUb1RvcE9yQm90dG9tID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pICYmIFtBY3Rpdml0eUJhclBvc2l0aW9uLlRPUCwgQWN0aXZpdHlCYXJQb3NpdGlvbi5CT1RUT01dLmluY2x1ZGVzKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8QWN0aXZpdHlCYXJQb3NpdGlvbj4oTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OKSk7XG5cblx0XHRcdFx0aWYgKGFjdGl2aXR5QmFyTW92ZWRUb1RvcE9yQm90dG9tIHx8IGVkaXRvckFjdGlvbnNNb3ZlZFRvVGl0bGViYXIgfHwgY29tbWFuZENlbnRlckVuYWJsZWQgfHwgbGF5b3V0Q29udHJvbHNFbmFibGVkKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Q3VzdG9tVGl0bGVCYXJWaXNpYmlsaXR5PihUaXRsZUJhclNldHRpbmcuQ1VTVE9NX1RJVExFX0JBUl9WSVNJQklMSVRZKSA9PT0gQ3VzdG9tVGl0bGVCYXJWaXNpYmlsaXR5Lk5FVkVSKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFRpdGxlQmFyU2V0dGluZy5DVVNUT01fVElUTEVfQkFSX1ZJU0lCSUxJVFksIEN1c3RvbVRpdGxlQmFyVmlzaWJpbGl0eS5BVVRPKTtcblx0XHRcdFx0XHRcdHJldHVybjsgLy8gb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uIHdpbGwgYmUgdHJpZ2dlcmVkIGFnYWluXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5kb1VwZGF0ZUxheW91dENvbmZpZ3VyYXRpb24oKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2hhZG93c1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuU0hBRE9XUykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTaGFkb3dzKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1vZGVybiBVSSBVcGRhdGUgKGZsb2F0aW5nIHBhbmVscyBwcmVzZW50YXRpb24pXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5NT0RFUk5fVUkpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRmxvYXRpbmdQYW5lbHMoKTtcblx0XHRcdFx0dGhpcy5sYXlvdXQoKTsgLy8gcmUtbGF5b3V0IHNvIHBhcnRzIHBpY2sgdXAgdGhlIG5ldyBmbG9hdGluZyBtYXJnaW5zXG5cdFx0XHR9XG5cblx0XHRcdC8vIEF1eGlsaWFyeSBTaWRlYmFyXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihXb3JrYmVuY2hMYXlvdXRTZXR0aW5ncy5BVVhJTElBUllCQVJfRk9SQ0VfTUFYSU1JWkVEKSkge1xuXHRcdFx0XHRjb25zdCBmb3JjZU1heGltaXplZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoV29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuQVVYSUxJQVJZQkFSX0ZPUkNFX01BWElNSVpFRCk7XG5cdFx0XHRcdGlmIChmb3JjZU1heGltaXplZCA9PT0gdHJ1ZSAmJiB0aGlzLm1haW5QYXJ0RWRpdG9yU2VydmljZS52aXNpYmxlRWRpdG9ycy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLnNldEF1eGlsaWFyeUJhck1heGltaXplZCh0cnVlKTtcblx0XHRcdFx0fSBlbHNlIGlmIChmb3JjZU1heGltaXplZCA9PT0gZmFsc2UgJiYgdGhpcy5pc0F1eGlsaWFyeUJhck1heGltaXplZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRnVsbHNjcmVlbiBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VGdWxsc2NyZWVuKHdpbmRvd0lkID0+IHRoaXMub25GdWxsc2NyZWVuQ2hhbmdlZCh3aW5kb3dJZCkpKTtcblxuXHRcdC8vIEdyb3VwIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5vbkRpZEFkZEdyb3VwKCgpID0+IHRoaXMuY2VudGVyTWFpbkVkaXRvckxheW91dCh0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5NQUlOX0VESVRPUl9DRU5URVJFRCkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JHcm91cFNlcnZpY2UubWFpblBhcnQub25EaWRSZW1vdmVHcm91cCgoKSA9PiB0aGlzLmNlbnRlck1haW5FZGl0b3JMYXlvdXQodGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuTUFJTl9FRElUT1JfQ0VOVEVSRUQpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0Lm9uRGlkQ2hhbmdlR3JvdXBNYXhpbWl6ZWQoKCkgPT4gdGhpcy5jZW50ZXJNYWluRWRpdG9yTGF5b3V0KHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLk1BSU5fRURJVE9SX0NFTlRFUkVEKSkpKTtcblxuXHRcdC8vIFByZXZlbnQgd29ya2JlbmNoIGZyb20gc2Nyb2xsaW5nICM1NTQ1NlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLm1haW5Db250YWluZXIsIEV2ZW50VHlwZS5TQ1JPTEwsICgpID0+IHRoaXMubWFpbkNvbnRhaW5lci5zY3JvbGxUb3AgPSAwKSk7XG5cblx0XHQvLyBNZW51YmFyIHZpc2liaWxpdHkgY2hhbmdlc1xuXHRcdGNvbnN0IHNob3dpbmdDdXN0b21NZW51ID0gKGlzV2luZG93cyB8fCBpc0xpbnV4IHx8IGlzV2ViKSAmJiAhaGFzTmF0aXZlVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aWYgKHNob3dpbmdDdXN0b21NZW51KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRpdGxlU2VydmljZS5vbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlKHZpc2libGUgPT4gdGhpcy5vbk1lbnViYXJUb2dnbGVkKHZpc2libGUpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlbWUgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZVdpbmRvd0JvcmRlcigpKSk7XG5cblx0XHQvLyBXaW5kb3cgYWN0aXZlIC8gZm9jdXMgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1cyhmb2N1c2VkID0+IHRoaXMub25XaW5kb3dGb2N1c0NoYW5nZWQoZm9jdXNlZCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZlV2luZG93KCgpID0+IHRoaXMub25BY3RpdmVXaW5kb3dDaGFuZ2VkKCkpKTtcblxuXHRcdC8vIFdDTyBjaGFuZ2VzXG5cdFx0aWYgKGlzV2ViICYmIHR5cGVvZiAobmF2aWdhdG9yIGFzIHsgd2luZG93Q29udHJvbHNPdmVybGF5PzogRXZlbnRUYXJnZXQgfSkud2luZG93Q29udHJvbHNPdmVybGF5ID09PSAnb2JqZWN0Jykge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKChuYXZpZ2F0b3IgYXMgdW5rbm93biBhcyB7IHdpbmRvd0NvbnRyb2xzT3ZlcmxheTogRXZlbnRUYXJnZXQgfSkud2luZG93Q29udHJvbHNPdmVybGF5LCAnZ2VvbWV0cnljaGFuZ2UnLCAoKSA9PiB0aGlzLm9uRGlkQ2hhbmdlV0NPKCkpKTtcblx0XHR9XG5cblx0XHQvLyBBdXhpbGlhcnkgd2luZG93c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV4aWxpYXJ5V2luZG93U2VydmljZS5vbkRpZE9wZW5BdXhpbGlhcnlXaW5kb3coKHsgd2luZG93LCBkaXNwb3NhYmxlcyB9KSA9PiB7XG5cdFx0XHRjb25zdCB3aW5kb3dJZCA9IHdpbmRvdy53aW5kb3cudnNjb2RlV2luZG93SWQ7XG5cdFx0XHR0aGlzLmNvbnRhaW5lclN0eWxlc0xvYWRlZC5zZXQod2luZG93SWQsIHdpbmRvdy53aGVuU3R5bGVzSGF2ZUxvYWRlZCk7XG5cdFx0XHR3aW5kb3cud2hlblN0eWxlc0hhdmVMb2FkZWQudGhlbigoKSA9PiB0aGlzLmNvbnRhaW5lclN0eWxlc0xvYWRlZC5kZWxldGUod2luZG93SWQpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jb250YWluZXJTdHlsZXNMb2FkZWQuZGVsZXRlKHdpbmRvd0lkKSkpO1xuXG5cdFx0XHRjb25zdCBldmVudERpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0XHR0aGlzLl9vbkRpZEFkZENvbnRhaW5lci5maXJlKHsgY29udGFpbmVyOiB3aW5kb3cuY29udGFpbmVyLCBkaXNwb3NhYmxlczogZXZlbnREaXNwb3NhYmxlcyB9KTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHdpbmRvdy5vbkRpZExheW91dChkaW1lbnNpb24gPT4gdGhpcy5oYW5kbGVDb250YWluZXJEaWRMYXlvdXQod2luZG93LmNvbnRhaW5lciwgZGltZW5zaW9uKSkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgb25NZW51YmFyVG9nZ2xlZCh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHZpc2libGUgIT09IHRoaXMuc3RhdGUucnVudGltZS5tZW51QmFyLnRvZ2dsZWQpIHtcblx0XHRcdHRoaXMuc3RhdGUucnVudGltZS5tZW51QmFyLnRvZ2dsZWQgPSB2aXNpYmxlO1xuXG5cdFx0XHRjb25zdCBtZW51QmFyVmlzaWJpbGl0eSA9IGdldE1lbnVCYXJWaXNpYmlsaXR5KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHQvLyBUaGUgbWVudSBiYXIgdG9nZ2xlcyB0aGUgdGl0bGUgYmFyIGluIHdlYiBiZWNhdXNlIGl0IGRvZXMgbm90IG5lZWQgdG8gYmUgc2hvd24gZm9yIHdpbmRvdyBjb250cm9scyBvbmx5XG5cdFx0XHRpZiAoaXNXZWIgJiYgbWVudUJhclZpc2liaWxpdHkgPT09ICd0b2dnbGUnKSB7XG5cdFx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLnRpdGxlQmFyUGFydFZpZXcsIHNob3VsZFNob3dDdXN0b21UaXRsZUJhcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtYWluV2luZG93LCB0aGlzLnN0YXRlLnJ1bnRpbWUubWVudUJhci50b2dnbGVkKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoZSBtZW51IGJhciB0b2dnbGVzIHRoZSB0aXRsZSBiYXIgaW4gZnVsbCBzY3JlZW4gZm9yIHRvZ2dsZSBhbmQgY2xhc3NpYyBzZXR0aW5nc1xuXHRcdFx0ZWxzZSBpZiAodGhpcy5zdGF0ZS5ydW50aW1lLm1haW5XaW5kb3dGdWxsc2NyZWVuICYmIChtZW51QmFyVmlzaWJpbGl0eSA9PT0gJ3RvZ2dsZScgfHwgbWVudUJhclZpc2liaWxpdHkgPT09ICdjbGFzc2ljJykpIHtcblx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKHRoaXMudGl0bGVCYXJQYXJ0Vmlldywgc2hvdWxkU2hvd0N1c3RvbVRpdGxlQmFyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIG1haW5XaW5kb3csIHRoaXMuc3RhdGUucnVudGltZS5tZW51QmFyLnRvZ2dsZWQpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTW92ZSBsYXlvdXQgY2FsbCB0byBhbnkgdGltZSB0aGUgbWVudWJhclxuXHRcdFx0Ly8gaXMgdG9nZ2xlZCB0byB1cGRhdGUgY29uc3VtZXJzIG9mIG9mZnNldFxuXHRcdFx0Ly8gc2VlIGlzc3VlICMxMTUyNjdcblx0XHRcdHRoaXMuaGFuZGxlQ29udGFpbmVyRGlkTGF5b3V0KHRoaXMubWFpbkNvbnRhaW5lciwgdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVDb250YWluZXJEaWRMYXlvdXQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZGltZW5zaW9uOiBJRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0aWYgKGNvbnRhaW5lciA9PT0gdGhpcy5tYWluQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLl9vbkRpZExheW91dE1haW5Db250YWluZXIuZmlyZShkaW1lbnNpb24pO1xuXHRcdH1cblxuXHRcdGlmIChpc0FjdGl2ZURvY3VtZW50KGNvbnRhaW5lcikpIHtcblx0XHRcdHRoaXMuX29uRGlkTGF5b3V0QWN0aXZlQ29udGFpbmVyLmZpcmUoZGltZW5zaW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZExheW91dENvbnRhaW5lci5maXJlKHsgY29udGFpbmVyLCBkaW1lbnNpb24gfSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRnVsbHNjcmVlbkNoYW5nZWQod2luZG93SWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh3aW5kb3dJZCAhPT0gbWFpbldpbmRvdy52c2NvZGVXaW5kb3dJZCkge1xuXHRcdFx0cmV0dXJuOyAvLyBpZ25vcmUgYWxsIGJ1dCBtYWluIHdpbmRvd1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhdGUucnVudGltZS5tYWluV2luZG93RnVsbHNjcmVlbiA9IGlzRnVsbHNjcmVlbihtYWluV2luZG93KTtcblxuXHRcdC8vIEFwcGx5IGFzIENTUyBjbGFzc1xuXHRcdGlmICh0aGlzLnN0YXRlLnJ1bnRpbWUubWFpbldpbmRvd0Z1bGxzY3JlZW4pIHtcblx0XHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKExheW91dENsYXNzZXMuRlVMTFNDUkVFTik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKExheW91dENsYXNzZXMuRlVMTFNDUkVFTik7XG5cblx0XHRcdGNvbnN0IHplbk1vZGVFeGl0SW5mbyA9IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlpFTl9NT0RFX0VYSVRfSU5GTyk7XG5cdFx0XHRpZiAoemVuTW9kZUV4aXRJbmZvLnRyYW5zaXRpb25lZFRvRnVsbFNjcmVlbiAmJiB0aGlzLmlzWmVuTW9kZUFjdGl2ZSgpKSB7XG5cdFx0XHRcdHRoaXMudG9nZ2xlWmVuTW9kZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoYW5nZSBlZGdlIHNuYXBwaW5nIGFjY29yZGluZ2x5XG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLmVkZ2VTbmFwcGluZyA9IHRoaXMuc3RhdGUucnVudGltZS5tYWluV2luZG93RnVsbHNjcmVlbjtcblxuXHRcdC8vIENoYW5naW5nIGZ1bGxzY3JlZW4gc3RhdGUgb2YgdGhlIG1haW4gd2luZG93IGhhcyBhbiBpbXBhY3Rcblx0XHQvLyBvbiBjdXN0b20gdGl0bGUgYmFyIHZpc2liaWxpdHksIHNvIHdlIG5lZWQgdG8gdXBkYXRlXG5cdFx0aWYgKGhhc0N1c3RvbVRpdGxlYmFyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cblx0XHRcdC8vIFByb3BhZ2F0ZSB0byBncmlkXG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy50aXRsZUJhclBhcnRWaWV3LCBzaG91bGRTaG93Q3VzdG9tVGl0bGVCYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgbWFpbldpbmRvdywgdGhpcy5zdGF0ZS5ydW50aW1lLm1lbnVCYXIudG9nZ2xlZCkpO1xuXG5cdFx0XHQvLyBJbmRpY2F0ZSBhY3RpdmUgd2luZG93IGJvcmRlclxuXHRcdFx0dGhpcy51cGRhdGVXaW5kb3dCb3JkZXIodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkFjdGl2ZVdpbmRvd0NoYW5nZWQoKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlQ29udGFpbmVySWQgPSB0aGlzLmdldEFjdGl2ZUNvbnRhaW5lcklkKCk7XG5cdFx0aWYgKHRoaXMuc3RhdGUucnVudGltZS5hY3RpdmVDb250YWluZXJJZCAhPT0gYWN0aXZlQ29udGFpbmVySWQpIHtcblx0XHRcdHRoaXMuc3RhdGUucnVudGltZS5hY3RpdmVDb250YWluZXJJZCA9IGFjdGl2ZUNvbnRhaW5lcklkO1xuXG5cdFx0XHQvLyBJbmRpY2F0ZSBhY3RpdmUgd2luZG93IGJvcmRlclxuXHRcdFx0dGhpcy51cGRhdGVXaW5kb3dCb3JkZXIoKTtcblxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVDb250YWluZXIuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25XaW5kb3dGb2N1c0NoYW5nZWQoaGFzRm9jdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zdGF0ZS5ydW50aW1lLmhhc0ZvY3VzICE9PSBoYXNGb2N1cykge1xuXHRcdFx0dGhpcy5zdGF0ZS5ydW50aW1lLmhhc0ZvY3VzID0gaGFzRm9jdXM7XG5cblx0XHRcdC8vIEluZGljYXRlIGFjdGl2ZSB3aW5kb3cgYm9yZGVyXG5cdFx0XHR0aGlzLnVwZGF0ZVdpbmRvd0JvcmRlcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aXZlQ29udGFpbmVySWQoKTogbnVtYmVyIHtcblx0XHRjb25zdCBhY3RpdmVDb250YWluZXIgPSB0aGlzLmFjdGl2ZUNvbnRhaW5lcjtcblxuXHRcdHJldHVybiBnZXRXaW5kb3coYWN0aXZlQ29udGFpbmVyKS52c2NvZGVXaW5kb3dJZDtcblx0fVxuXG5cdHByaXZhdGUgZG9VcGRhdGVMYXlvdXRDb25maWd1cmF0aW9uKHNraXBMYXlvdXQ/OiBib29sZWFuKTogdm9pZCB7XG5cblx0XHQvLyBDdXN0b20gVGl0bGViYXIgdmlzaWJpbGl0eSB3aXRoIG5hdGl2ZSB0aXRsZWJhclxuXHRcdHRoaXMudXBkYXRlQ3VzdG9tVGl0bGVCYXJWaXNpYmlsaXR5KCk7XG5cblx0XHQvLyBNZW51YmFyIHZpc2liaWxpdHlcblx0XHR0aGlzLnVwZGF0ZU1lbnViYXJWaXNpYmlsaXR5KCEhc2tpcExheW91dCk7XG5cblx0XHQvLyBDZW50ZXJlZCBMYXlvdXRcblx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS53aGVuUmVzdG9yZWQudGhlbigoKSA9PiB0aGlzLmNlbnRlck1haW5FZGl0b3JMYXlvdXQodGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuTUFJTl9FRElUT1JfQ0VOVEVSRUQpLCBza2lwTGF5b3V0KSk7XG5cdH1cblxuXHRwcml2YXRlIGlzU2hhZG93c0Rpc2FibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KExheW91dFNldHRpbmdzLlNIQURPV1MpID09PSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2hhZG93cygpOiB2b2lkIHtcblx0XHRjb25zdCBub1NoYWRvd3MgPSB0aGlzLmlzU2hhZG93c0Rpc2FibGVkKCk7XG5cblx0XHRmb3IgKGNvbnN0IGNvbnRhaW5lciBvZiBBcnJheS5mcm9tKHRoaXMuY29udGFpbmVycykpIHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuTk9fU0hBRE9XUywgbm9TaGFkb3dzKTtcblx0XHR9XG5cdH1cblxuXHRpc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihMYXlvdXRTZXR0aW5ncy5NT0RFUk5fVUkpID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGbG9hdGluZ1BhbmVscygpOiB2b2lkIHtcblx0XHQvLyBGbG9hdGluZyBwYW5lbHMgaXMgYSBtYWluLXdpbmRvdyBjb25jZXB0OiBvbmx5IHRoZSBtYWluIGNvbnRhaW5lciBob3N0c1xuXHRcdC8vIHRoZSBzaWRlIGJhcnMgYW5kIGJvdHRvbSBwYW5lbC4gU2NvcGUgdGhlIGNsYXNzIChhbmQgdGhlcmVmb3JlIHRoZSBDU1Ncblx0XHQvLyBjYXJkIG1hcmdpbnMpIHRvIHRoZSBtYWluIGNvbnRhaW5lciBzbyBhdXhpbGlhcnkgd2luZG93cyBcdTIwMTQgd2hvc2UgcGFydHMgZG9cblx0XHQvLyBub3QgYXBwbHkgdGhlIG1hdGNoaW5nIGNvbnRlbnQgaW5zZXRzIGluIGNvZGUgXHUyMDE0IGFyZSBsZWZ0IHVudG91Y2hlZC5cblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShMYXlvdXRDbGFzc2VzLkZMT0FUSU5HX1BBTkVMUywgdGhpcy5pc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0U2lkZUJhclBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2aXR5QmFyID0gdGhpcy5nZXRQYXJ0KFBhcnRzLkFDVElWSVRZQkFSX1BBUlQpO1xuXHRcdGNvbnN0IHNpZGVCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuU0lERUJBUl9QQVJUKTtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdGNvbnN0IG5ld1Bvc2l0aW9uVmFsdWUgPSAocG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQpID8gJ2xlZnQnIDogJ3JpZ2h0Jztcblx0XHRjb25zdCBvbGRQb3NpdGlvblZhbHVlID0gKHBvc2l0aW9uID09PSBQb3NpdGlvbi5SSUdIVCkgPyAnbGVmdCcgOiAncmlnaHQnO1xuXHRcdGNvbnN0IHBhbmVsQWxpZ25tZW50ID0gdGhpcy5nZXRQYW5lbEFsaWdubWVudCgpO1xuXHRcdGNvbnN0IHBhbmVsUG9zaXRpb24gPSB0aGlzLmdldFBhbmVsUG9zaXRpb24oKTtcblxuXHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfUE9TSVRPTiwgcG9zaXRpb24pO1xuXG5cdFx0Ly8gQWRqdXN0IENTU1xuXHRcdGNvbnN0IGFjdGl2aXR5QmFyQ29udGFpbmVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQoYWN0aXZpdHlCYXIuZ2V0Q29udGFpbmVyKCkpO1xuXHRcdGNvbnN0IHNpZGVCYXJDb250YWluZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChzaWRlQmFyLmdldENvbnRhaW5lcigpKTtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJDb250YWluZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChhdXhpbGlhcnlCYXIuZ2V0Q29udGFpbmVyKCkpO1xuXHRcdGFjdGl2aXR5QmFyQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUob2xkUG9zaXRpb25WYWx1ZSk7XG5cdFx0c2lkZUJhckNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKG9sZFBvc2l0aW9uVmFsdWUpO1xuXHRcdGFjdGl2aXR5QmFyQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQobmV3UG9zaXRpb25WYWx1ZSk7XG5cdFx0c2lkZUJhckNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKG5ld1Bvc2l0aW9uVmFsdWUpO1xuXG5cdFx0Ly8gQXV4aWxpYXJ5IEJhciBoYXMgb3Bwb3NpdGUgdmFsdWVzXG5cdFx0YXV4aWxpYXJ5QmFyQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUobmV3UG9zaXRpb25WYWx1ZSk7XG5cdFx0YXV4aWxpYXJ5QmFyQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQob2xkUG9zaXRpb25WYWx1ZSk7XG5cblx0XHQvLyBVcGRhdGUgU3R5bGVzXG5cdFx0YWN0aXZpdHlCYXIudXBkYXRlU3R5bGVzKCk7XG5cdFx0c2lkZUJhci51cGRhdGVTdHlsZXMoKTtcblx0XHRhdXhpbGlhcnlCYXIudXBkYXRlU3R5bGVzKCk7XG5cblx0XHQvLyBNb3ZlIGFjdGl2aXR5IGJhciBhbmQgc2lkZSBiYXJzXG5cdFx0dGhpcy5hZGp1c3RQYXJ0UG9zaXRpb25zKHBvc2l0aW9uLCBwYW5lbEFsaWdubWVudCwgcGFuZWxQb3NpdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVdpbmRvd0JvcmRlcihza2lwTGF5b3V0ID0gZmFsc2UpIHtcblx0XHRpZiAoXG5cdFx0XHRpc1dlYiB8fFxuXHRcdFx0aXNXaW5kb3dzIHx8IFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBub3Qgd29ya2luZyB3ZWxsIHdpdGggem9vbWluZyAoYm9yZGVyIG9mdGVuIG5vdCB2aXNpYmxlKVxuXHRcdFx0KFxuXHRcdFx0XHQoaXNXaW5kb3dzIHx8IGlzTGludXgpICYmXG5cdFx0XHRcdHVzZVdpbmRvd0NvbnRyb2xzT3ZlcmxheSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKVx0Ly8gV2luZG93cy9MaW51eDogbm90IHdvcmtpbmcgd2l0aCBXQ08gKGJvcmRlciBjYW5ub3QgZHJhdyBvdmVyIHRoZSBvdmVybGF5KVxuXHRcdFx0KSB8fFxuXHRcdFx0aGFzTmF0aXZlVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSlcblx0XHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0aGVtZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUJvcmRlciA9IHRoZW1lLmdldENvbG9yKFdJTkRPV19BQ1RJVkVfQk9SREVSKTtcblx0XHRjb25zdCBpbmFjdGl2ZUJvcmRlciA9IHRoZW1lLmdldENvbG9yKFdJTkRPV19JTkFDVElWRV9CT1JERVIpO1xuXG5cdFx0Y29uc3QgZGlkSGF2ZU1haW5XaW5kb3dCb3JkZXIgPSB0aGlzLmhhc01haW5XaW5kb3dCb3JkZXIoKTtcblxuXHRcdGZvciAoY29uc3QgY29udGFpbmVyIG9mIHRoaXMuY29udGFpbmVycykge1xuXHRcdFx0Y29uc3QgaXNNYWluQ29udGFpbmVyID0gY29udGFpbmVyID09PSB0aGlzLm1haW5Db250YWluZXI7XG5cdFx0XHRjb25zdCBpc0FjdGl2ZUNvbnRhaW5lciA9IHRoaXMuYWN0aXZlQ29udGFpbmVyID09PSBjb250YWluZXI7XG5cblx0XHRcdGxldCB3aW5kb3dCb3JkZXIgPSBmYWxzZTtcblx0XHRcdGlmICghdGhpcy5zdGF0ZS5ydW50aW1lLm1haW5XaW5kb3dGdWxsc2NyZWVuICYmIChhY3RpdmVCb3JkZXIgfHwgaW5hY3RpdmVCb3JkZXIpKSB7XG5cdFx0XHRcdHdpbmRvd0JvcmRlciA9IHRydWU7XG5cblx0XHRcdFx0Ly8gSWYgdGhlIGluYWN0aXZlIGNvbG9yIGlzIG1pc3NpbmcsIGZhbGxiYWNrIHRvIHRoZSBhY3RpdmUgb25lXG5cdFx0XHRcdGNvbnN0IGJvcmRlckNvbG9yID0gaXNBY3RpdmVDb250YWluZXIgJiYgdGhpcy5zdGF0ZS5ydW50aW1lLmhhc0ZvY3VzID8gYWN0aXZlQm9yZGVyIDogaW5hY3RpdmVCb3JkZXIgPz8gYWN0aXZlQm9yZGVyO1xuXHRcdFx0XHRjb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0td2luZG93LWJvcmRlci1jb2xvcicsIGJvcmRlckNvbG9yPy50b1N0cmluZygpID8/ICd0cmFuc3BhcmVudCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNNYWluQ29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMuc3RhdGUucnVudGltZS5tYWluV2luZG93Qm9yZGVyID0gd2luZG93Qm9yZGVyO1xuXHRcdFx0fVxuXG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShMYXlvdXRDbGFzc2VzLldJTkRPV19CT1JERVIsIHdpbmRvd0JvcmRlcik7XG5cdFx0fVxuXG5cdFx0aWYgKCFza2lwTGF5b3V0ICYmIGRpZEhhdmVNYWluV2luZG93Qm9yZGVyICE9PSB0aGlzLmhhc01haW5XaW5kb3dCb3JkZXIoKSkge1xuXHRcdFx0dGhpcy5sYXlvdXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluaXRMYXlvdXRTdGF0ZShsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IHZvaWQge1xuXHRcdHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24gPSBnZXRDbGllbnRBcmVhKHRoaXMucGFyZW50LCB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZID8gREVGQVVMVF9FTVBUWV9XSU5ET1dfRElNRU5TSU9OUyA6IERFRkFVTFRfV09SS1NQQUNFX1dJTkRPV19ESU1FTlNJT05TKTsgLy8gcnVubmluZyB3aXRoIGZhbGxiYWNrIHRvIGVuc3VyZSBubyBlcnJvciBpcyB0aHJvd24gKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNDAyNDIpXG5cblx0XHR0aGlzLnN0YXRlTW9kZWwgPSBuZXcgTGF5b3V0U3RhdGVNb2RlbCh0aGlzLnN0b3JhZ2VTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmNvbnRleHRTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSk7XG5cdFx0dGhpcy5zdGF0ZU1vZGVsLmxvYWQoe1xuXHRcdFx0bWFpbkNvbnRhaW5lckRpbWVuc2lvbjogdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbixcblx0XHRcdHJlc2V0TGF5b3V0OiBCb29sZWFuKHRoaXMubGF5b3V0T3B0aW9ucz8ucmVzZXRMYXlvdXQpXG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0YXRlTW9kZWwub25EaWRDaGFuZ2VTdGF0ZShjaGFuZ2UgPT4ge1xuXHRcdFx0aWYgKGNoYW5nZS5rZXkgPT09IExheW91dFN0YXRlS2V5cy5BQ1RJVklUWUJBUl9ISURERU4pIHtcblx0XHRcdFx0dGhpcy5zZXRBY3Rpdml0eUJhckhpZGRlbihjaGFuZ2UudmFsdWUgYXMgYm9vbGVhbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2Uua2V5ID09PSBMYXlvdXRTdGF0ZUtleXMuU1RBVFVTQkFSX0hJRERFTikge1xuXHRcdFx0XHR0aGlzLnNldFN0YXR1c0JhckhpZGRlbihjaGFuZ2UudmFsdWUgYXMgYm9vbGVhbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2Uua2V5ID09PSBMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9QT1NJVE9OKSB7XG5cdFx0XHRcdHRoaXMuc2V0U2lkZUJhclBvc2l0aW9uKGNoYW5nZS52YWx1ZSBhcyBQb3NpdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2Uua2V5ID09PSBMYXlvdXRTdGF0ZUtleXMuUEFORUxfUE9TSVRJT04pIHtcblx0XHRcdFx0dGhpcy5zZXRQYW5lbFBvc2l0aW9uKGNoYW5nZS52YWx1ZSBhcyBQb3NpdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2Uua2V5ID09PSBMYXlvdXRTdGF0ZUtleXMuUEFORUxfQUxJR05NRU5UKSB7XG5cdFx0XHRcdHRoaXMuc2V0UGFuZWxBbGlnbm1lbnQoY2hhbmdlLnZhbHVlIGFzIFBhbmVsQWxpZ25tZW50KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5kb1VwZGF0ZUxheW91dENvbmZpZ3VyYXRpb24oKTtcblx0XHR9KSk7XG5cblx0XHQvLyBMYXlvdXQgSW5pdGlhbGl6YXRpb24gU3RhdGVcblx0XHRjb25zdCBpbml0aWFsRWRpdG9yc1N0YXRlID0gdGhpcy5nZXRJbml0aWFsRWRpdG9yc1N0YXRlKCk7XG5cdFx0aWYgKGluaXRpYWxFZGl0b3JzU3RhdGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnSW5pdGlhbCBlZGl0b3Igc3RhdGUnLCBpbml0aWFsRWRpdG9yc1N0YXRlKTtcblx0XHR9XG5cdFx0Y29uc3QgaW5pdGlhbExheW91dFN0YXRlOiBJTGF5b3V0SW5pdGlhbGl6YXRpb25TdGF0ZSA9IHtcblx0XHRcdGxheW91dDoge1xuXHRcdFx0XHRlZGl0b3JzOiBpbml0aWFsRWRpdG9yc1N0YXRlPy5sYXlvdXRcblx0XHRcdH0sXG5cdFx0XHRlZGl0b3I6IHtcblx0XHRcdFx0cmVzdG9yZUVkaXRvcnM6IHRoaXMuc2hvdWxkUmVzdG9yZUVkaXRvcnModGhpcy5jb250ZXh0U2VydmljZSwgaW5pdGlhbEVkaXRvcnNTdGF0ZSksXG5cdFx0XHRcdGVkaXRvcnNUb09wZW46IHRoaXMucmVzb2x2ZUVkaXRvcnNUb09wZW4oZmlsZVNlcnZpY2UsIGluaXRpYWxFZGl0b3JzU3RhdGUpLFxuXHRcdFx0fSxcblx0XHRcdHZpZXdzOiB7XG5cdFx0XHRcdGRlZmF1bHRzOiB0aGlzLmdldERlZmF1bHRMYXlvdXRWaWV3cyh0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSksXG5cdFx0XHRcdGNvbnRhaW5lclRvUmVzdG9yZToge31cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gTGF5b3V0IFJ1bnRpbWUgU3RhdGVcblx0XHRjb25zdCBsYXlvdXRSdW50aW1lU3RhdGU6IElMYXlvdXRSdW50aW1lU3RhdGUgPSB7XG5cdFx0XHRhY3RpdmVDb250YWluZXJJZDogdGhpcy5nZXRBY3RpdmVDb250YWluZXJJZCgpLFxuXHRcdFx0bWFpbldpbmRvd0Z1bGxzY3JlZW46IGlzRnVsbHNjcmVlbihtYWluV2luZG93KSxcblx0XHRcdGhhc0ZvY3VzOiB0aGlzLmhvc3RTZXJ2aWNlLmhhc0ZvY3VzLFxuXHRcdFx0bWF4aW1pemVkOiBuZXcgU2V0PG51bWJlcj4oKSxcblx0XHRcdG1haW5XaW5kb3dCb3JkZXI6IGZhbHNlLFxuXHRcdFx0bWVudUJhcjoge1xuXHRcdFx0XHR0b2dnbGVkOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHR6ZW5Nb2RlOiB7XG5cdFx0XHRcdHRyYW5zaXRpb25EaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVNYXAoKSxcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5zdGF0ZSA9IHtcblx0XHRcdGluaXRpYWxpemF0aW9uOiBpbml0aWFsTGF5b3V0U3RhdGUsXG5cdFx0XHRydW50aW1lOiBsYXlvdXRSdW50aW1lU3RhdGUsXG5cdFx0fTtcblxuXHRcdC8vIFNpZGViYXIgVmlldyBDb250YWluZXIgVG8gUmVzdG9yZVxuXHRcdGlmICh0aGlzLmlzVmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQpKSB7XG5cdFx0XHRsZXQgdmlld0NvbnRhaW5lclRvUmVzdG9yZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFNpZGViYXJQYXJ0LmFjdGl2ZVZpZXdsZXRTZXR0aW5nc0tleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpPy5pZCk7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdCF0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0J1aWx0IHx8XG5cdFx0XHRcdGxpZmVjeWNsZVNlcnZpY2Uuc3RhcnR1cEtpbmQgPT09IFN0YXJ0dXBLaW5kLlJlbG9hZGVkV2luZG93IHx8XG5cdFx0XHRcdHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQgJiYgIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUklcblx0XHRcdCkge1xuXHRcdFx0XHQvLyBhbGxvdyB0byByZXN0b3JlIGEgbm9uLWRlZmF1bHQgdmlld2xldCBpbiBkZXZlbG9wbWVudCBtb2RlIG9yIHdoZW4gd2luZG93IHJlbG9hZHNcblx0XHRcdH0gZWxzZSBpZiAoXG5cdFx0XHRcdHZpZXdDb250YWluZXJUb1Jlc3RvcmUgIT09IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRWaWV3Q29udGFpbmVyKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKT8uaWQgJiZcblx0XHRcdFx0dmlld0NvbnRhaW5lclRvUmVzdG9yZSAhPT0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik/LmlkXG5cdFx0XHQpIHtcblx0XHRcdFx0Ly8gZmFsbGJhY2sgdG8gZGVmYXVsdCB2aWV3bGV0IG90aGVyd2lzZSBpZiB0aGUgdmlld2xldCBpcyBub3QgYSBkZWZhdWx0IHZpZXdsZXRcblx0XHRcdFx0dmlld0NvbnRhaW5lclRvUmVzdG9yZSA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRWaWV3Q29udGFpbmVyKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKT8uaWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh2aWV3Q29udGFpbmVyVG9SZXN0b3JlKSB7XG5cdFx0XHRcdHRoaXMuc3RhdGUuaW5pdGlhbGl6YXRpb24udmlld3MuY29udGFpbmVyVG9SZXN0b3JlLnNpZGVCYXIgPSB2aWV3Q29udGFpbmVyVG9SZXN0b3JlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9ISURERU4sIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFBhbmVsIFZpZXcgQ29udGFpbmVyIFRvIFJlc3RvcmVcblx0XHRpZiAodGhpcy5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCkpIHtcblx0XHRcdGNvbnN0IHZpZXdDb250YWluZXJUb1Jlc3RvcmUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChQYW5lbFBhcnQuYWN0aXZlUGFuZWxTZXR0aW5nc0tleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKT8uaWQpO1xuXG5cdFx0XHRpZiAodmlld0NvbnRhaW5lclRvUmVzdG9yZSkge1xuXHRcdFx0XHR0aGlzLnN0YXRlLmluaXRpYWxpemF0aW9uLnZpZXdzLmNvbnRhaW5lclRvUmVzdG9yZS5wYW5lbCA9IHZpZXdDb250YWluZXJUb1Jlc3RvcmU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnN0YXRlTW9kZWwuc2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9ISURERU4sIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEF1eGlsaWFyeSBWaWV3IHRvIHJlc3RvcmVcblx0XHRpZiAodGhpcy5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpKSB7XG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyVG9SZXN0b3JlID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQXV4aWxpYXJ5QmFyUGFydC5hY3RpdmVWaWV3U2V0dGluZ3NLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRWaWV3Q29udGFpbmVyKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpPy5pZCk7XG5cdFx0XHRpZiAodmlld0NvbnRhaW5lclRvUmVzdG9yZSkge1xuXHRcdFx0XHR0aGlzLnN0YXRlLmluaXRpYWxpemF0aW9uLnZpZXdzLmNvbnRhaW5lclRvUmVzdG9yZS5hdXhpbGlhcnlCYXIgPSB2aWV3Q29udGFpbmVyVG9SZXN0b3JlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX0hJRERFTiwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2luZG93IGJvcmRlclxuXHRcdHRoaXMudXBkYXRlV2luZG93Qm9yZGVyKHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREZWZhdWx0TGF5b3V0Vmlld3MoZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSwgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSk6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkZWZhdWx0TGF5b3V0ID0gZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LmRlZmF1bHRMYXlvdXQ7XG5cdFx0aWYgKCFkZWZhdWx0TGF5b3V0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghZGVmYXVsdExheW91dC5mb3JjZSAmJiAhc3RvcmFnZVNlcnZpY2UuaXNOZXcoU3RvcmFnZVNjb3BlLldPUktTUEFDRSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB2aWV3cyB9ID0gZGVmYXVsdExheW91dDtcblx0XHRpZiAodmlld3M/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHZpZXdzLm1hcCh2aWV3ID0+IHZpZXcuaWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFJlc3RvcmVFZGl0b3JzKGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIGluaXRpYWxFZGl0b3JzU3RhdGU6IElJbml0aWFsRWRpdG9yc1N0YXRlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cblx0XHQvLyBSZXN0b3JlIGVkaXRvcnMgYmFzZWQgb24gYSBzZXQgb2YgcnVsZXM6XG5cdFx0Ly8gLSBuZXZlciB3aGVuIHJ1bm5pbmcgb24gdGVtcG9yYXJ5IHdvcmtzcGFjZVxuXHRcdC8vIC0gbmV2ZXIgd2hlbiBgd29ya2JlbmNoLmVkaXRvci5yZXN0b3JlRWRpdG9yc2AgaXMgZGlzYWJsZWRcblx0XHQvLyAtIG5vdCB3aGVuIHdlIGhhdmUgZmlsZXMgdG8gb3BlbiwgdW5sZXNzOlxuXHRcdC8vIC0gYWx3YXlzIHdoZW4gYHdpbmRvdy5yZXN0b3JlV2luZG93czogcHJlc2VydmVgXG5cblx0XHRpZiAoaXNUZW1wb3JhcnlXb3Jrc3BhY2UoY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oV29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuRURJVE9SX1JFU1RPUkVfRURJVE9SUykgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9yY2VSZXN0b3JlRWRpdG9ycyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignd2luZG93LnJlc3RvcmVXaW5kb3dzJykgPT09ICdwcmVzZXJ2ZSc7XG5cdFx0cmV0dXJuICEhZm9yY2VSZXN0b3JlRWRpdG9ycyB8fCBpbml0aWFsRWRpdG9yc1N0YXRlID09PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgd2lsbFJlc3RvcmVFZGl0b3JzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0YXRlLmluaXRpYWxpemF0aW9uLmVkaXRvci5yZXN0b3JlRWRpdG9ycztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUVkaXRvcnNUb09wZW4oZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSwgaW5pdGlhbEVkaXRvcnNTdGF0ZTogSUluaXRpYWxFZGl0b3JzU3RhdGUgfCB1bmRlZmluZWQpOiBQcm9taXNlPElFZGl0b3JUb09wZW5bXT4ge1xuXHRcdGlmIChpbml0aWFsRWRpdG9yc1N0YXRlKSB7XG5cblx0XHRcdC8vIE1lcmdlIGVkaXRvciAoc2luZ2xlKVxuXHRcdFx0Y29uc3QgZmlsZXNUb01lcmdlID0gY29hbGVzY2UoYXdhaXQgcGF0aHNUb0VkaXRvcnMoaW5pdGlhbEVkaXRvcnNTdGF0ZS5maWxlc1RvTWVyZ2UsIGZpbGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpKTtcblx0XHRcdGlmIChmaWxlc1RvTWVyZ2UubGVuZ3RoID09PSA0ICYmIGlzUmVzb3VyY2VFZGl0b3JJbnB1dChmaWxlc1RvTWVyZ2VbMF0pICYmIGlzUmVzb3VyY2VFZGl0b3JJbnB1dChmaWxlc1RvTWVyZ2VbMV0pICYmIGlzUmVzb3VyY2VFZGl0b3JJbnB1dChmaWxlc1RvTWVyZ2VbMl0pICYmIGlzUmVzb3VyY2VFZGl0b3JJbnB1dChmaWxlc1RvTWVyZ2VbM10pKSB7XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRcdFx0aW5wdXQxOiB7IHJlc291cmNlOiBmaWxlc1RvTWVyZ2VbMF0ucmVzb3VyY2UgfSxcblx0XHRcdFx0XHRcdGlucHV0MjogeyByZXNvdXJjZTogZmlsZXNUb01lcmdlWzFdLnJlc291cmNlIH0sXG5cdFx0XHRcdFx0XHRiYXNlOiB7IHJlc291cmNlOiBmaWxlc1RvTWVyZ2VbMl0ucmVzb3VyY2UgfSxcblx0XHRcdFx0XHRcdHJlc3VsdDogeyByZXNvdXJjZTogZmlsZXNUb01lcmdlWzNdLnJlc291cmNlIH0sXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGlmZiBlZGl0b3IgKHNpbmdsZSlcblx0XHRcdGNvbnN0IGZpbGVzVG9EaWZmID0gY29hbGVzY2UoYXdhaXQgcGF0aHNUb0VkaXRvcnMoaW5pdGlhbEVkaXRvcnNTdGF0ZS5maWxlc1RvRGlmZiwgZmlsZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSkpO1xuXHRcdFx0aWYgKGZpbGVzVG9EaWZmLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRlZGl0b3I6IHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBmaWxlc1RvRGlmZlswXS5yZXNvdXJjZSB9LFxuXHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IGZpbGVzVG9EaWZmWzFdLnJlc291cmNlIH0sXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTm9ybWFsIGVkaXRvciAobXVsdGlwbGUpXG5cdFx0XHRjb25zdCBmaWxlc1RvT3Blbk9yQ3JlYXRlOiBJRWRpdG9yVG9PcGVuW10gPSBbXTtcblx0XHRcdGNvbnN0IHJlc29sdmVkRmlsZXNUb09wZW5PckNyZWF0ZSA9IGF3YWl0IHBhdGhzVG9FZGl0b3JzKGluaXRpYWxFZGl0b3JzU3RhdGUuZmlsZXNUb09wZW5PckNyZWF0ZSwgZmlsZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHJlc29sdmVkRmlsZXNUb09wZW5PckNyZWF0ZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZEZpbGVUb09wZW5PckNyZWF0ZSA9IHJlc29sdmVkRmlsZXNUb09wZW5PckNyZWF0ZVtpXTtcblx0XHRcdFx0aWYgKHJlc29sdmVkRmlsZVRvT3Blbk9yQ3JlYXRlKSB7XG5cdFx0XHRcdFx0ZmlsZXNUb09wZW5PckNyZWF0ZS5wdXNoKHtcblx0XHRcdFx0XHRcdGVkaXRvcjogcmVzb2x2ZWRGaWxlVG9PcGVuT3JDcmVhdGUsXG5cdFx0XHRcdFx0XHR2aWV3Q29sdW1uOiBpbml0aWFsRWRpdG9yc1N0YXRlLmZpbGVzVG9PcGVuT3JDcmVhdGU/LltpXS52aWV3Q29sdW1uIC8vIHRha2Ugb3ZlciBgdmlld0NvbHVtbmAgZnJvbSBpbml0aWFsIHN0YXRlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZpbGVzVG9PcGVuT3JDcmVhdGU7XG5cdFx0fVxuXG5cdFx0Ly8gRW1wdHkgd29ya2JlbmNoIGNvbmZpZ3VyZWQgdG8gb3BlbiB1bnRpdGxlZCBmaWxlIGlmIGVtcHR5XG5cdFx0ZWxzZSBpZiAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3b3JrYmVuY2guc3RhcnR1cEVkaXRvcicpID09PSAnbmV3VW50aXRsZWRGaWxlJykge1xuXHRcdFx0aWYgKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmhhc1Jlc3RvcmFibGVTdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm4gW107IC8vIGRvIG5vdCBvcGVuIGFueSBlbXB0eSB1bnRpdGxlZCBmaWxlIGlmIHdlIHJlc3RvcmVkIGdyb3Vwcy9lZGl0b3JzIGZyb20gcHJldmlvdXMgc2Vzc2lvblxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0ZWRpdG9yOiB7IHJlc291cmNlOiB1bmRlZmluZWQgfSAvLyBvcGVuIGVtcHR5IHVudGl0bGVkIGZpbGVcblx0XHRcdH1dO1xuXHRcdH1cblxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgX29wZW5lZERlZmF1bHRFZGl0b3JzOiBib29sZWFuID0gZmFsc2U7XG5cdGdldCBvcGVuZWREZWZhdWx0RWRpdG9ycygpIHsgcmV0dXJuIHRoaXMuX29wZW5lZERlZmF1bHRFZGl0b3JzOyB9XG5cblx0cHJpdmF0ZSBnZXRJbml0aWFsRWRpdG9yc1N0YXRlKCk6IElJbml0aWFsRWRpdG9yc1N0YXRlIHwgdW5kZWZpbmVkIHtcblxuXHRcdC8vIENoZWNrIGZvciBlZGl0b3JzIC8gZWRpdG9yIGxheW91dCBmcm9tIGBkZWZhdWx0TGF5b3V0YCBvcHRpb25zIGZpcnN0XG5cdFx0Y29uc3QgZGVmYXVsdExheW91dCA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LmRlZmF1bHRMYXlvdXQ7XG5cdFx0aWYgKChkZWZhdWx0TGF5b3V0Py5lZGl0b3JzPy5sZW5ndGggfHwgZGVmYXVsdExheW91dD8ubGF5b3V0Py5lZGl0b3JzKSAmJiAoZGVmYXVsdExheW91dC5mb3JjZSB8fCB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmlzTmV3KFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpKSkge1xuXHRcdFx0dGhpcy5fb3BlbmVkRGVmYXVsdEVkaXRvcnMgPSB0cnVlO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYXlvdXQ6IGRlZmF1bHRMYXlvdXQubGF5b3V0Py5lZGl0b3JzLFxuXHRcdFx0XHRmaWxlc1RvT3Blbk9yQ3JlYXRlOiBkZWZhdWx0TGF5b3V0Py5lZGl0b3JzPy5tYXAoZWRpdG9yID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dmlld0NvbHVtbjogZWRpdG9yLnZpZXdDb2x1bW4sXG5cdFx0XHRcdFx0XHRmaWxlVXJpOiBVUkkucmV2aXZlKGVkaXRvci51cmkpLFxuXHRcdFx0XHRcdFx0b3Blbk9ubHlJZkV4aXN0czogZWRpdG9yLm9wZW5Pbmx5SWZFeGlzdHMsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiBlZGl0b3Iub3B0aW9uc1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFRoZW4gY2hlY2sgZm9yIGZpbGVzIHRvIG9wZW4sIGNyZWF0ZSBvciBkaWZmL21lcmdlIGZyb20gbWFpbiBzaWRlXG5cdFx0Y29uc3QgeyBmaWxlc1RvT3Blbk9yQ3JlYXRlLCBmaWxlc1RvRGlmZiwgZmlsZXNUb01lcmdlIH0gPSB0aGlzLmVudmlyb25tZW50U2VydmljZTtcblx0XHRpZiAoZmlsZXNUb09wZW5PckNyZWF0ZSB8fCBmaWxlc1RvRGlmZiB8fCBmaWxlc1RvTWVyZ2UpIHtcblx0XHRcdHJldHVybiB7IGZpbGVzVG9PcGVuT3JDcmVhdGUsIGZpbGVzVG9EaWZmLCBmaWxlc1RvTWVyZ2UgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSB3aGVuUmVhZHlQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgd2hlblJlYWR5ID0gdGhpcy53aGVuUmVhZHlQcm9taXNlLnA7XG5cblx0cHJpdmF0ZSByZWFkb25seSB3aGVuUmVzdG9yZWRQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRyZWFkb25seSB3aGVuUmVzdG9yZWQgPSB0aGlzLndoZW5SZXN0b3JlZFByb21pc2UucDtcblx0cHJpdmF0ZSByZXN0b3JlZCA9IGZhbHNlO1xuXG5cdGlzUmVzdG9yZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmVzdG9yZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVzdG9yZVBhcnRzKCk6IHZvaWQge1xuXG5cdFx0Ly8gZGlzdGluZ3Vpc2ggbG9uZyBydW5uaW5nIHJlc3RvcmUgb3BlcmF0aW9ucyB0aGF0XG5cdFx0Ly8gYXJlIHJlcXVpcmVkIGZvciB0aGUgbGF5b3V0IHRvIGJlIHJlYWR5IGZyb20gdGhvc2Vcblx0XHQvLyB0aGF0IGFyZSBuZWVkZWQgdG8gc2lnbmFsIHJlc3RvcmluZyBpcyBkb25lXG5cdFx0Y29uc3QgbGF5b3V0UmVhZHlQcm9taXNlczogUHJvbWlzZTx1bmtub3duPltdID0gW107XG5cdFx0Y29uc3QgbGF5b3V0UmVzdG9yZWRQcm9taXNlczogUHJvbWlzZTx1bmtub3duPltdID0gW107XG5cblx0XHQvLyBSZXN0b3JlIGVkaXRvcnNcblx0XHRsYXlvdXRSZWFkeVByb21pc2VzLnB1c2goKGFzeW5jICgpID0+IHtcblx0XHRcdG1hcmsoJ2NvZGUvd2lsbFJlc3RvcmVFZGl0b3JzJyk7XG5cblx0XHRcdC8vIGZpcnN0IGVuc3VyZSB0aGUgZWRpdG9yIHBhcnQgaXMgcmVhZHlcblx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLndoZW5SZWFkeTtcblx0XHRcdG1hcmsoJ2NvZGUvcmVzdG9yZUVkaXRvcnMvZWRpdG9yR3JvdXBzUmVhZHknKTtcblxuXHRcdFx0Ly8gYXBwbHkgZWRpdG9yIGxheW91dCBpZiBhbnlcblx0XHRcdGlmICh0aGlzLnN0YXRlLmluaXRpYWxpemF0aW9uLmxheW91dD8uZWRpdG9ycykge1xuXHRcdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5hcHBseUxheW91dCh0aGlzLnN0YXRlLmluaXRpYWxpemF0aW9uLmxheW91dC5lZGl0b3JzKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdGhlbiBzZWUgZm9yIGVkaXRvcnMgdG8gb3BlbiBhcyBpbnN0cnVjdGVkXG5cdFx0XHQvLyBpdCBpcyBpbXBvcnRhbnQgdGhhdCB3ZSB0cmlnZ2VyIHRoaXMgZnJvbVxuXHRcdFx0Ly8gdGhlIG92ZXJhbGwgcmVzdG9yZSBmbG93IHRvIHJlZHVjZSBwb3NzaWJsZVxuXHRcdFx0Ly8gZmxpY2tlciBvbiBzdGFydHVwOiB3ZSB3YW50IGFueSBlZGl0b3IgdG9cblx0XHRcdC8vIG9wZW4gdG8gZ2V0IGEgY2hhbmNlIHRvIG9wZW4gZmlyc3QgYmVmb3JlXG5cdFx0XHQvLyBzaWduYWxpbmcgdGhhdCBsYXlvdXQgaXMgcmVzdG9yZWQsIGJ1dCB3ZSBkb1xuXHRcdFx0Ly8gbm90IG5lZWQgdG8gYXdhaXQgdGhlIGVkaXRvcnMgZnJvbSBoYXZpbmdcblx0XHRcdC8vIGZ1bGx5IGxvYWRlZC5cblxuXHRcdFx0Y29uc3QgZWRpdG9ycyA9IGF3YWl0IHRoaXMuc3RhdGUuaW5pdGlhbGl6YXRpb24uZWRpdG9yLmVkaXRvcnNUb09wZW47XG5cdFx0XHRtYXJrKCdjb2RlL3Jlc3RvcmVFZGl0b3JzL2VkaXRvcnNUb09wZW5SZXNvbHZlZCcpO1xuXG5cdFx0XHRsZXQgb3BlbkVkaXRvcnNQcm9taXNlOiBQcm9taXNlPHVua25vd24+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGVkaXRvcnMubGVuZ3RoKSB7XG5cblx0XHRcdFx0Ly8gd2UgaGF2ZSB0byBtYXAgZWRpdG9ycyB0byB0aGVpciBncm91cHMgYXMgaW5zdHJ1Y3RlZFxuXHRcdFx0XHQvLyBieSB0aGUgaW5wdXQuIHRoaXMgaXMgaW1wb3J0YW50IHRvIGVuc3VyZSB0aGF0IHdlIG9wZW5cblx0XHRcdFx0Ly8gdGhlIGVkaXRvcnMgaW4gdGhlIGdyb3VwcyB0aGV5IGJlbG9uZyB0by5cblxuXHRcdFx0XHRjb25zdCBlZGl0b3JHcm91cHNJblZpc3VhbE9yZGVyID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UubWFpblBhcnQuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSk7XG5cdFx0XHRcdGNvbnN0IG1hcEVkaXRvcnNUb0dyb3VwID0gbmV3IE1hcDxHcm91cElkZW50aWZpZXIsIFNldDxJVW50eXBlZEVkaXRvcklucHV0Pj4oKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBlZGl0b3JHcm91cHNJblZpc3VhbE9yZGVyWyhlZGl0b3Iudmlld0NvbHVtbiA/PyAxKSAtIDFdOyAvLyB2aWV3Q29sdW1uIGlzIGluZGV4KzEgYmFzZWRcblxuXHRcdFx0XHRcdGxldCBlZGl0b3JzQnlHcm91cCA9IG1hcEVkaXRvcnNUb0dyb3VwLmdldChncm91cC5pZCk7XG5cdFx0XHRcdFx0aWYgKCFlZGl0b3JzQnlHcm91cCkge1xuXHRcdFx0XHRcdFx0ZWRpdG9yc0J5R3JvdXAgPSBuZXcgU2V0PElVbnR5cGVkRWRpdG9ySW5wdXQ+KCk7XG5cdFx0XHRcdFx0XHRtYXBFZGl0b3JzVG9Hcm91cC5zZXQoZ3JvdXAuaWQsIGVkaXRvcnNCeUdyb3VwKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRlZGl0b3JzQnlHcm91cC5hZGQoZWRpdG9yLmVkaXRvcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRvcGVuRWRpdG9yc1Byb21pc2UgPSBQcm9taXNlLmFsbChBcnJheS5mcm9tKG1hcEVkaXRvcnNUb0dyb3VwKS5tYXAoYXN5bmMgKFtncm91cElkLCBlZGl0b3JzXSkgPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcnMoQXJyYXkuZnJvbShlZGl0b3JzKSwgZ3JvdXBJZCwgeyB2YWxpZGF0ZVRydXN0OiB0cnVlIH0pO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBkbyBub3QgYmxvY2sgdGhlIG92ZXJhbGwgbGF5b3V0IHJlYWR5IGZsb3cgZnJvbSBwb3RlbnRpYWxseVxuXHRcdFx0Ly8gc2xvdyBlZGl0b3JzIHRvIHJlc29sdmUgb24gc3RhcnR1cFxuXHRcdFx0bGF5b3V0UmVzdG9yZWRQcm9taXNlcy5wdXNoKFxuXHRcdFx0XHRQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0b3BlbkVkaXRvcnNQcm9taXNlPy5maW5hbGx5KCgpID0+IG1hcmsoJ2NvZGUvcmVzdG9yZUVkaXRvcnMvZWRpdG9yc09wZW5lZCcpKSxcblx0XHRcdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS53aGVuUmVzdG9yZWQuZmluYWxseSgoKSA9PiBtYXJrKCdjb2RlL3Jlc3RvcmVFZGl0b3JzL2VkaXRvckdyb3Vwc1Jlc3RvcmVkJykpXG5cdFx0XHRcdF0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRcdC8vIHRoZSBgY29kZS9kaWRSZXN0b3JlRWRpdG9yc2AgcGVyZiBtYXJrIGlzIHNwZWNpZmljYWxseVxuXHRcdFx0XHRcdC8vIGZvciB3aGVuIHZpc2libGUgZWRpdG9ycyBoYXZlIHJlc29sdmVkLCBzbyB3ZSBvbmx5IG1hcmtcblx0XHRcdFx0XHQvLyBpZiB3aGVuIGVkaXRvciBncm91cCBzZXJ2aWNlIGhhcyByZXN0b3JlZC5cblx0XHRcdFx0XHRtYXJrKCdjb2RlL2RpZFJlc3RvcmVFZGl0b3JzJyk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXHRcdH0pKCkpO1xuXG5cdFx0Ly8gUmVzdG9yZSBkZWZhdWx0IHZpZXdzIChvbmx5IHdoZW4gYElEZWZhdWx0TGF5b3V0YCBpcyBwcm92aWRlZClcblx0XHRjb25zdCByZXN0b3JlRGVmYXVsdFZpZXdzUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5zdGF0ZS5pbml0aWFsaXphdGlvbi52aWV3cy5kZWZhdWx0cz8ubGVuZ3RoKSB7XG5cdFx0XHRcdG1hcmsoJ2NvZGUvd2lsbE9wZW5EZWZhdWx0Vmlld3MnKTtcblxuXHRcdFx0XHRjb25zdCBsb2NhdGlvbnNSZXN0b3JlZDogeyBpZDogc3RyaW5nOyBvcmRlcjogbnVtYmVyIH1bXSA9IFtdO1xuXG5cdFx0XHRcdGNvbnN0IHRyeU9wZW5WaWV3ID0gKHZpZXc6IHsgaWQ6IHN0cmluZzsgb3JkZXI6IG51bWJlciB9KTogYm9vbGVhbiA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKHZpZXcuaWQpO1xuXHRcdFx0XHRcdGlmIChsb2NhdGlvbiAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHZpZXcuaWQpO1xuXHRcdFx0XHRcdFx0aWYgKGNvbnRhaW5lcikge1xuXHRcdFx0XHRcdFx0XHRpZiAodmlldy5vcmRlciA+PSAobG9jYXRpb25zUmVzdG9yZWQ/Lltsb2NhdGlvbl0/Lm9yZGVyID8/IDApKSB7XG5cdFx0XHRcdFx0XHRcdFx0bG9jYXRpb25zUmVzdG9yZWRbbG9jYXRpb25dID0geyBpZDogY29udGFpbmVyLmlkLCBvcmRlcjogdmlldy5vcmRlciB9O1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0Y29uc3QgY29udGFpbmVyTW9kZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblx0XHRcdFx0XHRcdFx0Y29udGFpbmVyTW9kZWwuc2V0Q29sbGFwc2VkKHZpZXcuaWQsIGZhbHNlKTtcblx0XHRcdFx0XHRcdFx0Y29udGFpbmVyTW9kZWwuc2V0VmlzaWJsZSh2aWV3LmlkLCB0cnVlKTtcblxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgZGVmYXVsdFZpZXdzID0gWy4uLnRoaXMuc3RhdGUuaW5pdGlhbGl6YXRpb24udmlld3MuZGVmYXVsdHNdLnJldmVyc2UoKS5tYXAoKHYsIGluZGV4KSA9PiAoeyBpZDogdiwgb3JkZXI6IGluZGV4IH0pKTtcblxuXHRcdFx0XHRsZXQgaSA9IGRlZmF1bHRWaWV3cy5sZW5ndGg7XG5cdFx0XHRcdHdoaWxlIChpKSB7XG5cdFx0XHRcdFx0aS0tO1xuXHRcdFx0XHRcdGlmICh0cnlPcGVuVmlldyhkZWZhdWx0Vmlld3NbaV0pKSB7XG5cdFx0XHRcdFx0XHRkZWZhdWx0Vmlld3Muc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIElmIHdlIHN0aWxsIGhhdmUgdmlld3MgbGVmdCBvdmVyLCB3YWl0IHVudGlsIGFsbCBleHRlbnNpb25zIGhhdmUgYmVlbiByZWdpc3RlcmVkIGFuZCB0cnkgYWdhaW5cblx0XHRcdFx0aWYgKGRlZmF1bHRWaWV3cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cblx0XHRcdFx0XHRsZXQgaSA9IGRlZmF1bHRWaWV3cy5sZW5ndGg7XG5cdFx0XHRcdFx0d2hpbGUgKGkpIHtcblx0XHRcdFx0XHRcdGktLTtcblx0XHRcdFx0XHRcdGlmICh0cnlPcGVuVmlldyhkZWZhdWx0Vmlld3NbaV0pKSB7XG5cdFx0XHRcdFx0XHRcdGRlZmF1bHRWaWV3cy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgd2Ugb3BlbmVkIGEgdmlldyBpbiB0aGUgc2lkZWJhciwgc3RvcCBhbnkgcmVzdG9yZSB0aGVyZVxuXHRcdFx0XHRpZiAobG9jYXRpb25zUmVzdG9yZWRbVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXJdKSB7XG5cdFx0XHRcdFx0dGhpcy5zdGF0ZS5pbml0aWFsaXphdGlvbi52aWV3cy5jb250YWluZXJUb1Jlc3RvcmUuc2lkZUJhciA9IGxvY2F0aW9uc1Jlc3RvcmVkW1ZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyXS5pZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIElmIHdlIG9wZW5lZCBhIHZpZXcgaW4gdGhlIHBhbmVsLCBzdG9wIGFueSByZXN0b3JlIHRoZXJlXG5cdFx0XHRcdGlmIChsb2NhdGlvbnNSZXN0b3JlZFtWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWxdKSB7XG5cdFx0XHRcdFx0dGhpcy5zdGF0ZS5pbml0aWFsaXphdGlvbi52aWV3cy5jb250YWluZXJUb1Jlc3RvcmUucGFuZWwgPSBsb2NhdGlvbnNSZXN0b3JlZFtWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWxdLmlkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgd2Ugb3BlbmVkIGEgdmlldyBpbiB0aGUgYXV4aWxpYXJ5IGJhciwgc3RvcCBhbnkgcmVzdG9yZSB0aGVyZVxuXHRcdFx0XHRpZiAobG9jYXRpb25zUmVzdG9yZWRbVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcl0pIHtcblx0XHRcdFx0XHR0aGlzLnN0YXRlLmluaXRpYWxpemF0aW9uLnZpZXdzLmNvbnRhaW5lclRvUmVzdG9yZS5hdXhpbGlhcnlCYXIgPSBsb2NhdGlvbnNSZXN0b3JlZFtWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyXS5pZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG1hcmsoJ2NvZGUvZGlkT3BlbkRlZmF1bHRWaWV3cycpO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cdFx0bGF5b3V0UmVhZHlQcm9taXNlcy5wdXNoKHJlc3RvcmVEZWZhdWx0Vmlld3NQcm9taXNlKTtcblxuXHRcdC8vIFJlc3RvcmUgU2lkZWJhclxuXHRcdGxheW91dFJlYWR5UHJvbWlzZXMucHVzaCgoYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHQvLyBSZXN0b3Jpbmcgdmlld3MgY291bGQgbWVhbiB0aGF0IHNpZGViYXIgYWxyZWFkeVxuXHRcdFx0Ly8gcmVzdG9yZWQsIGFzIHN1Y2ggd2UgbmVlZCB0byB0ZXN0IGFnYWluXG5cdFx0XHRhd2FpdCByZXN0b3JlRGVmYXVsdFZpZXdzUHJvbWlzZTtcblx0XHRcdGlmICghdGhpcy5zdGF0ZS5pbml0aWFsaXphdGlvbi52aWV3cy5jb250YWluZXJUb1Jlc3RvcmUuc2lkZUJhcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdG1hcmsoJ2NvZGUvd2lsbFJlc3RvcmVWaWV3bGV0Jyk7XG5cblx0XHRcdGF3YWl0IHRoaXMub3BlblZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIsIHRoaXMuc3RhdGUuaW5pdGlhbGl6YXRpb24udmlld3MuY29udGFpbmVyVG9SZXN0b3JlLnNpZGVCYXIpO1xuXG5cdFx0XHRtYXJrKCdjb2RlL2RpZFJlc3RvcmVWaWV3bGV0Jyk7XG5cdFx0fSkoKSk7XG5cblx0XHQvLyBSZXN0b3JlIFBhbmVsXG5cdFx0bGF5b3V0UmVhZHlQcm9taXNlcy5wdXNoKChhc3luYyAoKSA9PiB7XG5cblx0XHRcdC8vIFJlc3RvcmluZyB2aWV3cyBjb3VsZCBtZWFuIHRoYXQgcGFuZWwgYWxyZWFkeVxuXHRcdFx0Ly8gcmVzdG9yZWQsIGFzIHN1Y2ggd2UgbmVlZCB0byB0ZXN0IGFnYWluXG5cdFx0XHRhd2FpdCByZXN0b3JlRGVmYXVsdFZpZXdzUHJvbWlzZTtcblx0XHRcdGlmICghdGhpcy5zdGF0ZS5pbml0aWFsaXphdGlvbi52aWV3cy5jb250YWluZXJUb1Jlc3RvcmUucGFuZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRtYXJrKCdjb2RlL3dpbGxSZXN0b3JlUGFuZWwnKTtcblxuXHRcdFx0YXdhaXQgdGhpcy5vcGVuVmlld0NvbnRhaW5lcihWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsIHRoaXMuc3RhdGUuaW5pdGlhbGl6YXRpb24udmlld3MuY29udGFpbmVyVG9SZXN0b3JlLnBhbmVsKTtcblxuXHRcdFx0bWFyaygnY29kZS9kaWRSZXN0b3JlUGFuZWwnKTtcblx0XHR9KSgpKTtcblxuXHRcdC8vIFJlc3RvcmUgQXV4aWxpYXJ5IEJhclxuXHRcdGxheW91dFJlYWR5UHJvbWlzZXMucHVzaCgoYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHQvLyBSZXN0b3Jpbmcgdmlld3MgY291bGQgbWVhbiB0aGF0IGF1eGJhciBhbHJlYWR5XG5cdFx0XHQvLyByZXN0b3JlZCwgYXMgc3VjaCB3ZSBuZWVkIHRvIHRlc3QgYWdhaW5cblx0XHRcdGF3YWl0IHJlc3RvcmVEZWZhdWx0Vmlld3NQcm9taXNlO1xuXHRcdFx0aWYgKCF0aGlzLnN0YXRlLmluaXRpYWxpemF0aW9uLnZpZXdzLmNvbnRhaW5lclRvUmVzdG9yZS5hdXhpbGlhcnlCYXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRtYXJrKCdjb2RlL3dpbGxSZXN0b3JlQXV4aWxpYXJ5QmFyJyk7XG5cblx0XHRcdGF3YWl0IHRoaXMub3BlblZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhciwgdGhpcy5zdGF0ZS5pbml0aWFsaXphdGlvbi52aWV3cy5jb250YWluZXJUb1Jlc3RvcmUuYXV4aWxpYXJ5QmFyKTtcblxuXHRcdFx0bWFyaygnY29kZS9kaWRSZXN0b3JlQXV4aWxpYXJ5QmFyJyk7XG5cdFx0fSkoKSk7XG5cblx0XHQvLyBSZXN0b3JlIFplbiBNb2RlXG5cdFx0Y29uc3QgemVuTW9kZVdhc0FjdGl2ZSA9IHRoaXMuaXNaZW5Nb2RlQWN0aXZlKCk7XG5cdFx0Y29uc3QgcmVzdG9yZVplbk1vZGUgPSBnZXRaZW5Nb2RlQ29uZmlndXJhdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKS5yZXN0b3JlO1xuXG5cdFx0aWYgKHplbk1vZGVXYXNBY3RpdmUpIHtcblx0XHRcdHRoaXMuc2V0WmVuTW9kZUFjdGl2ZSghcmVzdG9yZVplbk1vZGUpO1xuXHRcdFx0dGhpcy50b2dnbGVaZW5Nb2RlKGZhbHNlLCB0cnVlKTtcblx0XHR9XG5cblx0XHQvLyBSZXN0b3JlIE1haW4gRWRpdG9yIENlbnRlciBNb2RlXG5cdFx0aWYgKHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLk1BSU5fRURJVE9SX0NFTlRFUkVEKSkge1xuXHRcdFx0dGhpcy5jZW50ZXJNYWluRWRpdG9yTGF5b3V0KHRydWUsIHRydWUpO1xuXHRcdH1cblxuXHRcdC8vIEF3YWl0IGZvciBwcm9taXNlcyB0aGF0IHdlIHJlY29yZGVkIHRvIHVwZGF0ZVxuXHRcdC8vIG91ciByZWFkeSBhbmQgcmVzdG9yZWQgc3RhdGVzIHByb3Blcmx5LlxuXHRcdFByb21pc2VzLnNldHRsZWQobGF5b3V0UmVhZHlQcm9taXNlcykuZmluYWxseSgoKSA9PiB7XG5cblx0XHRcdC8vIEZvY3VzIHRoZSBhY3RpdmUgbWF4aW1pemVkIHBhcnQgaW4gY2FzZSB3ZSBoYXZlXG5cdFx0XHQvLyBub3QgeWV0IGZvY3VzZWQgYSBzcGVjaWZpYyBlbGVtZW50IGFuZCBwYW5lbFxuXHRcdFx0Ly8gb3IgYXV4aWxpYXJ5IGJhciBhcmUgbWF4aW1pemVkLlxuXHRcdFx0aWYgKGdldEFjdGl2ZUVsZW1lbnQoKSA9PT0gbWFpbldpbmRvdy5kb2N1bWVudC5ib2R5ICYmICh0aGlzLmlzUGFuZWxNYXhpbWl6ZWQoKSB8fCB0aGlzLmlzQXV4aWxpYXJ5QmFyTWF4aW1pemVkKCkpKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy53aGVuUmVhZHlQcm9taXNlLmNvbXBsZXRlKCk7XG5cblx0XHRcdFByb21pc2VzLnNldHRsZWQobGF5b3V0UmVzdG9yZWRQcm9taXNlcykuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHR0aGlzLmVkaXRvclNlcnZpY2UuZWRpdG9ycy5sZW5ndGggPT09IDAgJiYgXHRcdFx0Ly8gbm8gZWRpdG9ycyBvcGVuZWQgb3IgcmVzdG9yZWRcblx0XHRcdFx0XHR0aGlzLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkgJiYgXHRcdFx0Ly8gYXV4aWxpYXJ5IGJhciBpcyB2aXNpYmxlXG5cdFx0XHRcdFx0IXRoaXMuaGFzRm9jdXMoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpICYmIFx0XHRcdC8vIGF1eGlsaWFyeSBiYXIgZG9lcyBub3QgaGF2ZSBmb2N1cyB5ZXRcblx0XHRcdFx0XHQhdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZW5hYmxlU21va2VUZXN0RHJpdmVyIFx0XHQvLyBub3QgaW4gc21va2UgdGVzdCBtb2RlICh3aGVyZSBmb2N1cyBpcyBzZW5zaXRpdmUpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdHRoaXMuZm9jdXNQYXJ0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMucmVzdG9yZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLndoZW5SZXN0b3JlZFByb21pc2UuY29tcGxldGUoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuVmlld0NvbnRhaW5lcihsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLCBpZDogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgdmlld0NvbnRhaW5lciA9IGF3YWl0IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUoaWQsIGxvY2F0aW9uLCBmb2N1cyk7XG5cdFx0aWYgKHZpZXdDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBmYWxsYmFjayB0byBkZWZhdWx0IHZpZXcgY29udGFpbmVyXG5cdFx0dmlld0NvbnRhaW5lciA9IGF3YWl0IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIobG9jYXRpb24pPy5pZCwgbG9jYXRpb24sIGZvY3VzKTtcblx0XHRpZiAodmlld0NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGZpbmFsbHkgdHJ5IHRvIGp1c3Qgb3BlbiB0aGUgZmlyc3QgdmlzaWJsZSB2aWV3IGNvbnRhaW5lclxuXHRcdGF3YWl0IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUodGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcyhsb2NhdGlvbikuYXQoMCksIGxvY2F0aW9uLCBmb2N1cyk7XG5cdH1cblxuXHRyZWdpc3RlclBhcnQocGFydDogUGFydCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBpZCA9IHBhcnQuZ2V0SWQoKTtcblx0XHR0aGlzLnBhcnRzLnNldChpZCwgcGFydCk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMucGFydHMuZGVsZXRlKGlkKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0UGFydChrZXk6IFBhcnRzKTogUGFydCB7XG5cdFx0Y29uc3QgcGFydCA9IHRoaXMucGFydHMuZ2V0KGtleSk7XG5cdFx0aWYgKCFwYXJ0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gcGFydCAke2tleX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdHJlZ2lzdGVyTm90aWZpY2F0aW9ucyhkZWxlZ2F0ZTogeyBvbkRpZENoYW5nZU5vdGlmaWNhdGlvbnNWaXNpYmlsaXR5OiBFdmVudDxib29sZWFuPiB9KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGVsZWdhdGUub25EaWRDaGFuZ2VOb3RpZmljYXRpb25zVmlzaWJpbGl0eSh2aXNpYmxlID0+IHRoaXMuX29uRGlkQ2hhbmdlTm90aWZpY2F0aW9uc1Zpc2liaWxpdHkuZmlyZSh2aXNpYmxlKSkpO1xuXHR9XG5cblx0aGFzRm9jdXMocGFydDogUGFydHMpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmdldENvbnRhaW5lcihnZXRBY3RpdmVXaW5kb3coKSwgcGFydCk7XG5cdFx0aWYgKCFjb250YWluZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdGlmICghYWN0aXZlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBpc0FuY2VzdG9yVXNpbmdGbG93VG8oYWN0aXZlRWxlbWVudCwgY29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEZvY3VzZWRQYXJ0KCk6IFBhcnRzIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5wYXJ0cy5rZXlzKCkpIHtcblx0XHRcdGlmICh0aGlzLmhhc0ZvY3VzKHBhcnQgYXMgUGFydHMpKSB7XG5cdFx0XHRcdHJldHVybiBwYXJ0IGFzIFBhcnRzO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRmb2N1c1BhcnQocGFydDogTVVMVElfV0lORE9XX1BBUlRTLCB0YXJnZXRXaW5kb3c6IFdpbmRvdyk6IHZvaWQ7XG5cdGZvY3VzUGFydChwYXJ0OiBTSU5HTEVfV0lORE9XX1BBUlRTKTogdm9pZDtcblx0Zm9jdXNQYXJ0KHBhcnQ6IFBhcnRzLCB0YXJnZXRXaW5kb3c6IFdpbmRvdyA9IG1haW5XaW5kb3cpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmdldENvbnRhaW5lcih0YXJnZXRXaW5kb3csIHBhcnQpID8/IHRoaXMubWFpbkNvbnRhaW5lcjtcblxuXHRcdHN3aXRjaCAocGFydCkge1xuXHRcdFx0Y2FzZSBQYXJ0cy5FRElUT1JfUEFSVDpcblx0XHRcdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ2V0UGFydChjb250YWluZXIpLmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQYXJ0cy5QQU5FTF9QQVJUOiB7XG5cdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpPy5mb2N1cygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgUGFydHMuU0lERUJBUl9QQVJUOiB7XG5cdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik/LmZvY3VzKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVDoge1xuXHRcdFx0XHR0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik/LmZvY3VzKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBQYXJ0cy5BQ1RJVklUWUJBUl9QQVJUOlxuXHRcdFx0XHQodGhpcy5nZXRQYXJ0KFBhcnRzLlNJREVCQVJfUEFSVCkgYXMgU2lkZWJhclBhcnQpLmZvY3VzQWN0aXZpdHlCYXIoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFBhcnRzLlNUQVRVU0JBUl9QQVJUOlxuXHRcdFx0XHR0aGlzLnN0YXR1c0JhclNlcnZpY2UuZ2V0UGFydChjb250YWluZXIpLmZvY3VzKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRjb250YWluZXI/LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0Q29udGFpbmVyKHRhcmdldFdpbmRvdzogV2luZG93KTogSFRNTEVsZW1lbnQ7XG5cdGdldENvbnRhaW5lcih0YXJnZXRXaW5kb3c6IFdpbmRvdywgcGFydDogUGFydHMpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0Z2V0Q29udGFpbmVyKHRhcmdldFdpbmRvdzogV2luZG93LCBwYXJ0PzogUGFydHMpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHR5cGVvZiBwYXJ0ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0Q29udGFpbmVyRnJvbURvY3VtZW50KHRhcmdldFdpbmRvdy5kb2N1bWVudCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRhcmdldFdpbmRvdyA9PT0gbWFpbldpbmRvdykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0UGFydChwYXJ0KS5nZXRDb250YWluZXIoKTtcblx0XHR9XG5cblx0XHQvLyBPbmx5IHNvbWUgcGFydHMgYXJlIHN1cHBvcnRlZCBmb3IgYXV4aWxpYXJ5IHdpbmRvd3Ncblx0XHRsZXQgcGFydENhbmRpZGF0ZTogdW5rbm93bjtcblx0XHRpZiAocGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQpIHtcblx0XHRcdHBhcnRDYW5kaWRhdGUgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRQYXJ0KHRoaXMuZ2V0Q29udGFpbmVyRnJvbURvY3VtZW50KHRhcmdldFdpbmRvdy5kb2N1bWVudCkpO1xuXHRcdH0gZWxzZSBpZiAocGFydCA9PT0gUGFydHMuU1RBVFVTQkFSX1BBUlQpIHtcblx0XHRcdHBhcnRDYW5kaWRhdGUgPSB0aGlzLnN0YXR1c0JhclNlcnZpY2UuZ2V0UGFydCh0aGlzLmdldENvbnRhaW5lckZyb21Eb2N1bWVudCh0YXJnZXRXaW5kb3cuZG9jdW1lbnQpKTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgPT09IFBhcnRzLlRJVExFQkFSX1BBUlQpIHtcblx0XHRcdHBhcnRDYW5kaWRhdGUgPSB0aGlzLnRpdGxlU2VydmljZS5nZXRQYXJ0KHRoaXMuZ2V0Q29udGFpbmVyRnJvbURvY3VtZW50KHRhcmdldFdpbmRvdy5kb2N1bWVudCkpO1xuXHRcdH1cblxuXHRcdGlmIChwYXJ0Q2FuZGlkYXRlIGluc3RhbmNlb2YgUGFydCkge1xuXHRcdFx0cmV0dXJuIHBhcnRDYW5kaWRhdGUuZ2V0Q29udGFpbmVyKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlzVmlzaWJsZShwYXJ0OiBNVUxUSV9XSU5ET1dfUEFSVFMsIHRhcmdldFdpbmRvdzogV2luZG93KTogYm9vbGVhbjtcblx0aXNWaXNpYmxlKHBhcnQ6IFNJTkdMRV9XSU5ET1dfUEFSVFMpOiBib29sZWFuO1xuXHRpc1Zpc2libGUocGFydDogUGFydHMsIHRhcmdldFdpbmRvdz86IFdpbmRvdyk6IGJvb2xlYW47XG5cdGlzVmlzaWJsZShwYXJ0OiBQYXJ0cywgdGFyZ2V0V2luZG93OiBXaW5kb3cgPSBtYWluV2luZG93KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRhcmdldFdpbmRvdyAhPT0gbWFpbldpbmRvdyAmJiBwYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIGNhbm5vdCBoaWRlIGVkaXRvciBwYXJ0IGluIGF1eGlsaWFyeSB3aW5kb3dzXG5cdFx0fVxuXG5cdFx0c3dpdGNoIChwYXJ0KSB7XG5cdFx0XHRjYXNlIFBhcnRzLlRJVExFQkFSX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLmluaXRpYWxpemVkID9cblx0XHRcdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuaXNWaWV3VmlzaWJsZSh0aGlzLnRpdGxlQmFyUGFydFZpZXcpIDpcblx0XHRcdFx0XHRzaG91bGRTaG93Q3VzdG9tVGl0bGVCYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgbWFpbldpbmRvdywgdGhpcy5zdGF0ZS5ydW50aW1lLm1lbnVCYXIudG9nZ2xlZCk7XG5cdFx0XHRjYXNlIFBhcnRzLlNJREVCQVJfUEFSVDpcblx0XHRcdFx0cmV0dXJuICF0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX0hJRERFTik7XG5cdFx0XHRjYXNlIFBhcnRzLlBBTkVMX1BBUlQ6XG5cdFx0XHRcdHJldHVybiAhdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfSElEREVOKTtcblx0XHRcdGNhc2UgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQ6XG5cdFx0XHRcdHJldHVybiAhdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX0hJRERFTik7XG5cdFx0XHRjYXNlIFBhcnRzLlNUQVRVU0JBUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNUQVRVU0JBUl9ISURERU4pO1xuXHRcdFx0Y2FzZSBQYXJ0cy5BQ1RJVklUWUJBUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFDVElWSVRZQkFSX0hJRERFTik7XG5cdFx0XHRjYXNlIFBhcnRzLkVESVRPUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkVESVRPUl9ISURERU4pO1xuXHRcdFx0Y2FzZSBQYXJ0cy5CQU5ORVJfUEFSVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5pdGlhbGl6ZWQgPyB0aGlzLndvcmtiZW5jaEdyaWQuaXNWaWV3VmlzaWJsZSh0aGlzLmJhbm5lclBhcnRWaWV3KSA6IGZhbHNlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBhbnkgb3RoZXIgcGFydCBjYW5ub3QgYmUgaGlkZGVuXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRTaG93QmFubmVyRmlyc3QoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzV2ViICYmICFpc1dDT0VuYWJsZWQoKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzUGFuZWxNYXhpbWl6ZWQoKSAmJiB0aGlzLm1haW5Db250YWluZXIgPT09IHRoaXMuYWN0aXZlQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmZvY3VzUGFydChQYXJ0cy5QQU5FTF9QQVJUKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoKSAmJiB0aGlzLm1haW5Db250YWluZXIgPT09IHRoaXMuYWN0aXZlQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmZvY3VzUGFydChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZm9jdXNQYXJ0KFBhcnRzLkVESVRPUl9QQVJULCBnZXRXaW5kb3codGhpcy5hY3RpdmVDb250YWluZXIpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzUGFuZWxPckVkaXRvcigpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVQYW5lbCA9IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXHRcdGlmICgodGhpcy5oYXNGb2N1cyhQYXJ0cy5QQU5FTF9QQVJUKSB8fCAhdGhpcy5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQpKSAmJiBhY3RpdmVQYW5lbCkge1xuXHRcdFx0YWN0aXZlUGFuZWwuZm9jdXMoKTsgLy8gcHJlZmVyIHBhbmVsIGlmIGl0IGhhcyBmb2N1cyBvciBlZGl0b3IgaXMgaGlkZGVuXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZm9jdXMoKTsgLy8gb3RoZXJ3aXNlIGZvY3VzIGVkaXRvclxuXHRcdH1cblx0fVxuXG5cdGdldE1heGltdW1FZGl0b3JEaW1lbnNpb25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGltZW5zaW9uIHtcblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBnZXRXaW5kb3coY29udGFpbmVyKTtcblx0XHRjb25zdCBjb250YWluZXJEaW1lbnNpb24gPSB0aGlzLmdldENvbnRhaW5lckRpbWVuc2lvbihjb250YWluZXIpO1xuXG5cdFx0aWYgKGNvbnRhaW5lciA9PT0gdGhpcy5tYWluQ29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCBpc1BhbmVsSG9yaXpvbnRhbCA9IGlzSG9yaXpvbnRhbCh0aGlzLmdldFBhbmVsUG9zaXRpb24oKSk7XG5cdFx0XHRjb25zdCB0YWtlbldpZHRoID1cblx0XHRcdFx0KHRoaXMuaXNWaXNpYmxlKFBhcnRzLkFDVElWSVRZQkFSX1BBUlQpID8gdGhpcy5hY3Rpdml0eUJhclBhcnRWaWV3Lm1pbmltdW1XaWR0aCA6IDApICtcblx0XHRcdFx0KHRoaXMuaXNWaXNpYmxlKFBhcnRzLlNJREVCQVJfUEFSVCkgPyB0aGlzLnNpZGVCYXJQYXJ0Vmlldy5taW5pbXVtV2lkdGggOiAwKSArXG5cdFx0XHRcdCh0aGlzLmlzVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKSAmJiAhaXNQYW5lbEhvcml6b250YWwgPyB0aGlzLnBhbmVsUGFydFZpZXcubWluaW11bVdpZHRoIDogMCkgK1xuXHRcdFx0XHQodGhpcy5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpID8gdGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldy5taW5pbXVtV2lkdGggOiAwKTtcblxuXHRcdFx0Y29uc3QgdGFrZW5IZWlnaHQgPVxuXHRcdFx0XHQodGhpcy5pc1Zpc2libGUoUGFydHMuVElUTEVCQVJfUEFSVCwgdGFyZ2V0V2luZG93KSA/IHRoaXMudGl0bGVCYXJQYXJ0Vmlldy5taW5pbXVtSGVpZ2h0IDogMCkgK1xuXHRcdFx0XHQodGhpcy5pc1Zpc2libGUoUGFydHMuU1RBVFVTQkFSX1BBUlQsIHRhcmdldFdpbmRvdykgPyB0aGlzLnN0YXR1c0JhclBhcnRWaWV3Lm1pbmltdW1IZWlnaHQgOiAwKSArXG5cdFx0XHRcdCh0aGlzLmlzVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKSAmJiBpc1BhbmVsSG9yaXpvbnRhbCA/IHRoaXMucGFuZWxQYXJ0Vmlldy5taW5pbXVtSGVpZ2h0IDogMCk7XG5cblx0XHRcdGNvbnN0IGF2YWlsYWJsZVdpZHRoID0gY29udGFpbmVyRGltZW5zaW9uLndpZHRoIC0gdGFrZW5XaWR0aDtcblx0XHRcdGNvbnN0IGF2YWlsYWJsZUhlaWdodCA9IGNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgLSB0YWtlbkhlaWdodDtcblxuXHRcdFx0cmV0dXJuIHsgd2lkdGg6IGF2YWlsYWJsZVdpZHRoLCBoZWlnaHQ6IGF2YWlsYWJsZUhlaWdodCB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB0YWtlbkhlaWdodCA9XG5cdFx0XHRcdCh0aGlzLmlzVmlzaWJsZShQYXJ0cy5USVRMRUJBUl9QQVJULCB0YXJnZXRXaW5kb3cpID8gdGhpcy50aXRsZUJhclBhcnRWaWV3Lm1pbmltdW1IZWlnaHQgOiAwKSArXG5cdFx0XHRcdCh0aGlzLmlzVmlzaWJsZShQYXJ0cy5TVEFUVVNCQVJfUEFSVCwgdGFyZ2V0V2luZG93KSA/IHRoaXMuc3RhdHVzQmFyUGFydFZpZXcubWluaW11bUhlaWdodCA6IDApO1xuXG5cdFx0XHRyZXR1cm4geyB3aWR0aDogY29udGFpbmVyRGltZW5zaW9uLndpZHRoLCBoZWlnaHQ6IGNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgLSB0YWtlbkhlaWdodCB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNaZW5Nb2RlQWN0aXZlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5aRU5fTU9ERV9BQ1RJVkUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRaZW5Nb2RlQWN0aXZlKGFjdGl2ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlpFTl9NT0RFX0FDVElWRSwgYWN0aXZlKTtcblx0fVxuXG5cdHRvZ2dsZVplbk1vZGUoc2tpcExheW91dD86IGJvb2xlYW4sIHJlc3RvcmluZyA9IGZhbHNlKTogdm9pZCB7XG5cdFx0Y29uc3QgZm9jdXNlZFBhcnRQcmVUcmFuc2l0aW9uID0gdGhpcy5fZ2V0Rm9jdXNlZFBhcnQoKTtcblxuXHRcdHRoaXMuc2V0WmVuTW9kZUFjdGl2ZSghdGhpcy5pc1plbk1vZGVBY3RpdmUoKSk7XG5cdFx0dGhpcy5zdGF0ZS5ydW50aW1lLnplbk1vZGUudHJhbnNpdGlvbkRpc3Bvc2FibGVzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXG5cdFx0Y29uc3Qgc2V0TGluZU51bWJlcnMgPSAobGluZU51bWJlcnM/OiBMaW5lTnVtYmVyc1R5cGUpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHRoaXMubWFpblBhcnRFZGl0b3JTZXJ2aWNlLnZpc2libGVUZXh0RWRpdG9yQ29udHJvbHMpIHtcblxuXHRcdFx0XHQvLyBUbyBwcm9wZXJseSByZXNldCBsaW5lIG51bWJlcnMgd2UgbmVlZCB0byByZWFkIHRoZSBjb25maWd1cmF0aW9uIGZvciBlYWNoIGVkaXRvciByZXNwZWN0aW5nIGl0J3MgdXJpLlxuXHRcdFx0XHRpZiAoIWxpbmVOdW1iZXJzICYmIGlzQ29kZUVkaXRvcihlZGl0b3IpICYmIGVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdFx0XHRsaW5lTnVtYmVycyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvci5saW5lTnVtYmVycycsIHsgcmVzb3VyY2U6IG1vZGVsLnVyaSwgb3ZlcnJpZGVJZGVudGlmaWVyOiBtb2RlbC5nZXRMYW5ndWFnZUlkKCkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFsaW5lTnVtYmVycykge1xuXHRcdFx0XHRcdGxpbmVOdW1iZXJzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLmxpbmVOdW1iZXJzJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlZGl0b3IudXBkYXRlT3B0aW9ucyh7IGxpbmVOdW1iZXJzIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBDaGVjayBpZiB6ZW4gbW9kZSB0cmFuc2l0aW9uZWQgdG8gZnVsbCBzY3JlZW4gYW5kIGlmIG5vdyB3ZSBhcmUgb3V0IG9mIHplbiBtb2RlXG5cdFx0Ly8gLT4gd2UgbmVlZCB0byBnbyBvdXQgb2YgZnVsbCBzY3JlZW4gKHNhbWUgZ29lcyBmb3IgdGhlIGNlbnRlcmVkIGVkaXRvciBsYXlvdXQpXG5cdFx0bGV0IHRvZ2dsZU1haW5XaW5kb3dGdWxsU2NyZWVuID0gZmFsc2U7XG5cdFx0Y29uc3QgY29uZmlnID0gZ2V0WmVuTW9kZUNvbmZpZ3VyYXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgemVuTW9kZUV4aXRJbmZvID0gdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuWkVOX01PREVfRVhJVF9JTkZPKTtcblxuXHRcdC8vIFplbiBNb2RlIEFjdGl2ZVxuXHRcdGlmICh0aGlzLmlzWmVuTW9kZUFjdGl2ZSgpKSB7XG5cblx0XHRcdHRvZ2dsZU1haW5XaW5kb3dGdWxsU2NyZWVuID0gIXRoaXMuc3RhdGUucnVudGltZS5tYWluV2luZG93RnVsbHNjcmVlbiAmJiBjb25maWcuZnVsbFNjcmVlbiAmJiAhaXNJT1M7XG5cblx0XHRcdGlmICghcmVzdG9yaW5nKSB7XG5cdFx0XHRcdHplbk1vZGVFeGl0SW5mby50cmFuc2l0aW9uZWRUb0Z1bGxTY3JlZW4gPSB0b2dnbGVNYWluV2luZG93RnVsbFNjcmVlbjtcblx0XHRcdFx0emVuTW9kZUV4aXRJbmZvLnRyYW5zaXRpb25lZFRvQ2VudGVyZWRFZGl0b3JMYXlvdXQgPSAhdGhpcy5pc01haW5FZGl0b3JMYXlvdXRDZW50ZXJlZCgpICYmIGNvbmZpZy5jZW50ZXJMYXlvdXQ7XG5cdFx0XHRcdHplbk1vZGVFeGl0SW5mby5oYW5kbGVOb3RpZmljYXRpb25zRG9Ob3REaXN0dXJiTW9kZSA9IHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5nZXRGaWx0ZXIoKSA9PT0gTm90aWZpY2F0aW9uc0ZpbHRlci5PRkY7XG5cdFx0XHRcdHplbk1vZGVFeGl0SW5mby53YXNWaXNpYmxlLnNpZGVCYXIgPSB0aGlzLmlzVmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQpO1xuXHRcdFx0XHR6ZW5Nb2RlRXhpdEluZm8ud2FzVmlzaWJsZS5wYW5lbCA9IHRoaXMuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpO1xuXHRcdFx0XHR6ZW5Nb2RlRXhpdEluZm8ud2FzVmlzaWJsZS5hdXhpbGlhcnlCYXIgPSB0aGlzLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0XHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlpFTl9NT0RFX0VYSVRfSU5GTywgemVuTW9kZUV4aXRJbmZvKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbih0cnVlLCB0cnVlKTtcblx0XHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFySGlkZGVuKHRydWUsIHRydWUpO1xuXHRcdFx0dGhpcy5zZXRTaWRlQmFySGlkZGVuKHRydWUpO1xuXG5cdFx0XHRpZiAoY29uZmlnLmhpZGVBY3Rpdml0eUJhcikge1xuXHRcdFx0XHR0aGlzLnNldEFjdGl2aXR5QmFySGlkZGVuKHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29uZmlnLmhpZGVTdGF0dXNCYXIpIHtcblx0XHRcdFx0dGhpcy5zZXRTdGF0dXNCYXJIaWRkZW4odHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb25maWcuaGlkZUxpbmVOdW1iZXJzKSB7XG5cdFx0XHRcdHNldExpbmVOdW1iZXJzKCdvZmYnKTtcblx0XHRcdFx0dGhpcy5zdGF0ZS5ydW50aW1lLnplbk1vZGUudHJhbnNpdGlvbkRpc3Bvc2FibGVzLnNldChaZW5Nb2RlU2V0dGluZ3MuSElERV9MSU5FTlVNQkVSUywgdGhpcy5tYWluUGFydEVkaXRvclNlcnZpY2Uub25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZSgoKSA9PiBzZXRMaW5lTnVtYmVycygnb2ZmJykpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbmZpZy5zaG93VGFicyAhPT0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UucGFydE9wdGlvbnMuc2hvd1RhYnMpIHtcblx0XHRcdFx0dGhpcy5zdGF0ZS5ydW50aW1lLnplbk1vZGUudHJhbnNpdGlvbkRpc3Bvc2FibGVzLnNldChaZW5Nb2RlU2V0dGluZ3MuU0hPV19UQUJTLCB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5lbmZvcmNlUGFydE9wdGlvbnMoeyBzaG93VGFiczogY29uZmlnLnNob3dUYWJzIH0pKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbmZpZy5zaWxlbnROb3RpZmljYXRpb25zICYmIHplbk1vZGVFeGl0SW5mby5oYW5kbGVOb3RpZmljYXRpb25zRG9Ob3REaXN0dXJiTW9kZSkge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0RmlsdGVyKE5vdGlmaWNhdGlvbnNGaWx0ZXIuRVJST1IpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29uZmlnLmNlbnRlckxheW91dCkge1xuXHRcdFx0XHR0aGlzLmNlbnRlck1haW5FZGl0b3JMYXlvdXQodHJ1ZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFplbiBNb2RlIENvbmZpZ3VyYXRpb24gQ2hhbmdlc1xuXHRcdFx0dGhpcy5zdGF0ZS5ydW50aW1lLnplbk1vZGUudHJhbnNpdGlvbkRpc3Bvc2FibGVzLnNldCgnY29uZmlndXJhdGlvbkNoYW5nZScsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXG5cdFx0XHRcdC8vIEFjdGl2aXR5IEJhclxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihaZW5Nb2RlU2V0dGluZ3MuSElERV9BQ1RJVklUWUJBUikgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pKSB7XG5cdFx0XHRcdFx0Y29uc3QgemVuTW9kZUhpZGVBY3Rpdml0eUJhciA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oWmVuTW9kZVNldHRpbmdzLkhJREVfQUNUSVZJVFlCQVIpO1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2aXR5QmFyTG9jYXRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPEFjdGl2aXR5QmFyUG9zaXRpb24+KExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTik7XG5cdFx0XHRcdFx0dGhpcy5zZXRBY3Rpdml0eUJhckhpZGRlbih6ZW5Nb2RlSGlkZUFjdGl2aXR5QmFyID8gdHJ1ZSA6IChhY3Rpdml0eUJhckxvY2F0aW9uID09PSBBY3Rpdml0eUJhclBvc2l0aW9uLlRPUCB8fCBhY3Rpdml0eUJhckxvY2F0aW9uID09PSBBY3Rpdml0eUJhclBvc2l0aW9uLkJPVFRPTSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU3RhdHVzIEJhclxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihaZW5Nb2RlU2V0dGluZ3MuSElERV9TVEFUVVNCQVIpKSB7XG5cdFx0XHRcdFx0Y29uc3QgemVuTW9kZUhpZGVTdGF0dXNCYXIgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFplbk1vZGVTZXR0aW5ncy5ISURFX1NUQVRVU0JBUik7XG5cdFx0XHRcdFx0dGhpcy5zZXRTdGF0dXNCYXJIaWRkZW4oemVuTW9kZUhpZGVTdGF0dXNCYXIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ2VudGVyIExheW91dFxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihaZW5Nb2RlU2V0dGluZ3MuQ0VOVEVSX0xBWU9VVCkpIHtcblx0XHRcdFx0XHRjb25zdCB6ZW5Nb2RlQ2VudGVyTGF5b3V0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihaZW5Nb2RlU2V0dGluZ3MuQ0VOVEVSX0xBWU9VVCk7XG5cdFx0XHRcdFx0dGhpcy5jZW50ZXJNYWluRWRpdG9yTGF5b3V0KHplbk1vZGVDZW50ZXJMYXlvdXQsIHRydWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2hvdyBUYWJzXG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFplbk1vZGVTZXR0aW5ncy5TSE9XX1RBQlMpKSB7XG5cdFx0XHRcdFx0Y29uc3QgemVuTW9kZVNob3dUYWJzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxFZGl0b3JUYWJzTW9kZSB8IHVuZGVmaW5lZD4oWmVuTW9kZVNldHRpbmdzLlNIT1dfVEFCUykgPz8gJ211bHRpcGxlJztcblx0XHRcdFx0XHR0aGlzLnN0YXRlLnJ1bnRpbWUuemVuTW9kZS50cmFuc2l0aW9uRGlzcG9zYWJsZXMuc2V0KFplbk1vZGVTZXR0aW5ncy5TSE9XX1RBQlMsIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0LmVuZm9yY2VQYXJ0T3B0aW9ucyh7IHNob3dUYWJzOiB6ZW5Nb2RlU2hvd1RhYnMgfSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTm90aWZpY2F0aW9uc1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihaZW5Nb2RlU2V0dGluZ3MuU0lMRU5UX05PVElGSUNBVElPTlMpKSB7XG5cdFx0XHRcdFx0Y29uc3QgemVuTW9kZVNpbGVudE5vdGlmaWNhdGlvbnMgPSAhIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoWmVuTW9kZVNldHRpbmdzLlNJTEVOVF9OT1RJRklDQVRJT05TKTtcblx0XHRcdFx0XHRpZiAoemVuTW9kZUV4aXRJbmZvLmhhbmRsZU5vdGlmaWNhdGlvbnNEb05vdERpc3R1cmJNb2RlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0RmlsdGVyKHplbk1vZGVTaWxlbnROb3RpZmljYXRpb25zID8gTm90aWZpY2F0aW9uc0ZpbHRlci5FUlJPUiA6IE5vdGlmaWNhdGlvbnNGaWx0ZXIuT0ZGKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDZW50ZXIgTGF5b3V0XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFplbk1vZGVTZXR0aW5ncy5ISURFX0xJTkVOVU1CRVJTKSkge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXJzVHlwZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oWmVuTW9kZVNldHRpbmdzLkhJREVfTElORU5VTUJFUlMpID8gJ29mZicgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0c2V0TGluZU51bWJlcnMobGluZU51bWJlcnNUeXBlKTtcblx0XHRcdFx0XHR0aGlzLnN0YXRlLnJ1bnRpbWUuemVuTW9kZS50cmFuc2l0aW9uRGlzcG9zYWJsZXMuc2V0KFplbk1vZGVTZXR0aW5ncy5ISURFX0xJTkVOVU1CRVJTLCB0aGlzLm1haW5QYXJ0RWRpdG9yU2VydmljZS5vbkRpZFZpc2libGVFZGl0b3JzQ2hhbmdlKCgpID0+IHNldExpbmVOdW1iZXJzKGxpbmVOdW1iZXJzVHlwZSkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIFplbiBNb2RlIEluYWN0aXZlXG5cdFx0ZWxzZSB7XG5cdFx0XHRpZiAoemVuTW9kZUV4aXRJbmZvLndhc1Zpc2libGUucGFuZWwpIHtcblx0XHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbihmYWxzZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh6ZW5Nb2RlRXhpdEluZm8ud2FzVmlzaWJsZS5hdXhpbGlhcnlCYXIpIHtcblx0XHRcdFx0dGhpcy5zZXRBdXhpbGlhcnlCYXJIaWRkZW4oZmFsc2UsIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoemVuTW9kZUV4aXRJbmZvLndhc1Zpc2libGUuc2lkZUJhcikge1xuXHRcdFx0XHR0aGlzLnNldFNpZGVCYXJIaWRkZW4oZmFsc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFDVElWSVRZQkFSX0hJRERFTiwgdHJ1ZSkpIHtcblx0XHRcdFx0dGhpcy5zZXRBY3Rpdml0eUJhckhpZGRlbihmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuU1RBVFVTQkFSX0hJRERFTiwgdHJ1ZSkpIHtcblx0XHRcdFx0dGhpcy5zZXRTdGF0dXNCYXJIaWRkZW4oZmFsc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoemVuTW9kZUV4aXRJbmZvLnRyYW5zaXRpb25lZFRvQ2VudGVyZWRFZGl0b3JMYXlvdXQpIHtcblx0XHRcdFx0dGhpcy5jZW50ZXJNYWluRWRpdG9yTGF5b3V0KGZhbHNlLCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHplbk1vZGVFeGl0SW5mby5oYW5kbGVOb3RpZmljYXRpb25zRG9Ob3REaXN0dXJiTW9kZSkge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0RmlsdGVyKE5vdGlmaWNhdGlvbnNGaWx0ZXIuT0ZGKTtcblx0XHRcdH1cblxuXHRcdFx0c2V0TGluZU51bWJlcnMoKTtcblxuXHRcdFx0dG9nZ2xlTWFpbldpbmRvd0Z1bGxTY3JlZW4gPSB6ZW5Nb2RlRXhpdEluZm8udHJhbnNpdGlvbmVkVG9GdWxsU2NyZWVuICYmIHRoaXMuc3RhdGUucnVudGltZS5tYWluV2luZG93RnVsbHNjcmVlbjtcblx0XHR9XG5cblx0XHRpZiAoIXNraXBMYXlvdXQpIHtcblx0XHRcdHRoaXMubGF5b3V0KCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRvZ2dsZU1haW5XaW5kb3dGdWxsU2NyZWVuKSB7XG5cdFx0XHR0aGlzLmhvc3RTZXJ2aWNlLnRvZ2dsZUZ1bGxTY3JlZW4obWFpbldpbmRvdyk7XG5cdFx0fVxuXG5cdFx0Ly8gcmVzdG9yZSBmb2N1cyBpZiBwYXJ0IGlzIHN0aWxsIHZpc2libGUsIG90aGVyd2lzZSBmYWxsYmFjayB0byBlZGl0b3Jcblx0XHRpZiAoZm9jdXNlZFBhcnRQcmVUcmFuc2l0aW9uICYmIHRoaXMuaXNWaXNpYmxlKGZvY3VzZWRQYXJ0UHJlVHJhbnNpdGlvbiwgZ2V0V2luZG93KHRoaXMuYWN0aXZlQ29udGFpbmVyKSkpIHtcblx0XHRcdGlmIChpc011bHRpV2luZG93UGFydChmb2N1c2VkUGFydFByZVRyYW5zaXRpb24pKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNQYXJ0KGZvY3VzZWRQYXJ0UHJlVHJhbnNpdGlvbiwgZ2V0V2luZG93KHRoaXMuYWN0aXZlQ29udGFpbmVyKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmZvY3VzUGFydChmb2N1c2VkUGFydFByZVRyYW5zaXRpb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZENoYW5nZVplbk1vZGUuZmlyZSh0aGlzLmlzWmVuTW9kZUFjdGl2ZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0U3RhdHVzQmFySGlkZGVuKGhpZGRlbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNUQVRVU0JBUl9ISURERU4sIGhpZGRlbik7XG5cblx0XHQvLyBBZGp1c3QgQ1NTXG5cdFx0aWYgKGhpZGRlbikge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoTGF5b3V0Q2xhc3Nlcy5TVEFUVVNCQVJfSElEREVOKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoTGF5b3V0Q2xhc3Nlcy5TVEFUVVNCQVJfSElEREVOKTtcblx0XHR9XG5cblx0XHQvLyBQcm9wYWdhdGUgdG8gZ3JpZFxuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLnN0YXR1c0JhclBhcnRWaWV3LCAhaGlkZGVuKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVXb3JrYmVuY2hMYXlvdXQoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGl0bGVCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuVElUTEVCQVJfUEFSVCk7XG5cdFx0Y29uc3QgYmFubmVyUGFydCA9IHRoaXMuZ2V0UGFydChQYXJ0cy5CQU5ORVJfUEFSVCk7XG5cdFx0Y29uc3QgZWRpdG9yUGFydCA9IHRoaXMuZ2V0UGFydChQYXJ0cy5FRElUT1JfUEFSVCk7XG5cdFx0Y29uc3QgYWN0aXZpdHlCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuQUNUSVZJVFlCQVJfUEFSVCk7XG5cdFx0Y29uc3QgcGFuZWxQYXJ0ID0gdGhpcy5nZXRQYXJ0KFBhcnRzLlBBTkVMX1BBUlQpO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclBhcnQgPSB0aGlzLmdldFBhcnQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdGNvbnN0IHNpZGVCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuU0lERUJBUl9QQVJUKTtcblx0XHRjb25zdCBzdGF0dXNCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuU1RBVFVTQkFSX1BBUlQpO1xuXG5cdFx0Ly8gVmlldyByZWZlcmVuY2VzIGZvciBhbGwgcGFydHNcblx0XHR0aGlzLnRpdGxlQmFyUGFydFZpZXcgPSB0aXRsZUJhcjtcblx0XHR0aGlzLmJhbm5lclBhcnRWaWV3ID0gYmFubmVyUGFydDtcblx0XHR0aGlzLnNpZGVCYXJQYXJ0VmlldyA9IHNpZGVCYXI7XG5cdFx0dGhpcy5hY3Rpdml0eUJhclBhcnRWaWV3ID0gYWN0aXZpdHlCYXI7XG5cdFx0dGhpcy5lZGl0b3JQYXJ0VmlldyA9IGVkaXRvclBhcnQ7XG5cdFx0dGhpcy5wYW5lbFBhcnRWaWV3ID0gcGFuZWxQYXJ0O1xuXHRcdHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcgPSBhdXhpbGlhcnlCYXJQYXJ0O1xuXHRcdHRoaXMuc3RhdHVzQmFyUGFydFZpZXcgPSBzdGF0dXNCYXI7XG5cblx0XHRjb25zdCB2aWV3TWFwOiBSZWNvcmQ8c3RyaW5nLCBJU2VyaWFsaXphYmxlVmlldz4gPSB7XG5cdFx0XHRbUGFydHMuQUNUSVZJVFlCQVJfUEFSVF06IHRoaXMuYWN0aXZpdHlCYXJQYXJ0Vmlldyxcblx0XHRcdFtQYXJ0cy5CQU5ORVJfUEFSVF06IHRoaXMuYmFubmVyUGFydFZpZXcsXG5cdFx0XHRbUGFydHMuVElUTEVCQVJfUEFSVF06IHRoaXMudGl0bGVCYXJQYXJ0Vmlldyxcblx0XHRcdFtQYXJ0cy5FRElUT1JfUEFSVF06IHRoaXMuZWRpdG9yUGFydFZpZXcsXG5cdFx0XHRbUGFydHMuUEFORUxfUEFSVF06IHRoaXMucGFuZWxQYXJ0Vmlldyxcblx0XHRcdFtQYXJ0cy5TSURFQkFSX1BBUlRdOiB0aGlzLnNpZGVCYXJQYXJ0Vmlldyxcblx0XHRcdFtQYXJ0cy5TVEFUVVNCQVJfUEFSVF06IHRoaXMuc3RhdHVzQmFyUGFydFZpZXcsXG5cdFx0XHRbUGFydHMuQVVYSUxJQVJZQkFSX1BBUlRdOiB0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3XG5cdFx0fTtcblxuXHRcdGNvbnN0IGZyb21KU09OID0gKHsgdHlwZSB9OiB7IHR5cGU6IFBhcnRzIH0pID0+IHZpZXdNYXBbdHlwZV07XG5cdFx0Y29uc3Qgd29ya2JlbmNoR3JpZCA9IFNlcmlhbGl6YWJsZUdyaWQuZGVzZXJpYWxpemUoXG5cdFx0XHR0aGlzLmNyZWF0ZUdyaWREZXNjcmlwdG9yKCksXG5cdFx0XHR7IGZyb21KU09OIH0sXG5cdFx0XHR7IHByb3BvcnRpb25hbExheW91dDogZmFsc2UgfVxuXHRcdCk7XG5cblx0XHR0aGlzLm1haW5Db250YWluZXIucHJlcGVuZCh3b3JrYmVuY2hHcmlkLmVsZW1lbnQpO1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYXBwbGljYXRpb24nKTtcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQgPSB3b3JrYmVuY2hHcmlkO1xuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5lZGdlU25hcHBpbmcgPSB0aGlzLnN0YXRlLnJ1bnRpbWUubWFpbldpbmRvd0Z1bGxzY3JlZW47XG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgW3RpdGxlQmFyLCBlZGl0b3JQYXJ0LCBhY3Rpdml0eUJhciwgcGFuZWxQYXJ0LCBzaWRlQmFyLCBzdGF0dXNCYXIsIGF1eGlsaWFyeUJhclBhcnQsIGJhbm5lclBhcnRdKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihwYXJ0Lm9uRGlkVmlzaWJpbGl0eUNoYW5nZSh2aXNpYmxlID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLmluTWF4aW1pemVkQXV4aWxpYXJ5QmFyVHJhbnNpdGlvbikge1xuXG5cdFx0XHRcdFx0Ly8gc2tpcCByZWFjdGluZyB3aGVuIHdlIGFyZSB0cmFuc2l0aW9uaW5nXG5cdFx0XHRcdFx0Ly8gaW4gb3Igb3V0IG9mIG1heGltaXNlZCBhdXhpbGlhcnkgYmFyIHRvIHByZXZlbnRcblx0XHRcdFx0XHQvLyBzdGVwcGluZyBvbiBlYWNoIG90aGVyIHRvZXMgYmVjYXVzZSB0aGlzXG5cdFx0XHRcdFx0Ly8gdHJhbnNpdGlvbiBpcyBhbHJlYWR5IGRlYWxpbmcgd2l0aCBhbGwgcGFydHNcblx0XHRcdFx0XHQvLyB2aXNpYmlsaXR5IGVmZmljaWVudGx5LlxuXG5cdFx0XHRcdFx0aWYgKHBhcnQgPT09IHNpZGVCYXIpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2V0U2lkZUJhckhpZGRlbighdmlzaWJsZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0ID09PSBwYW5lbFBhcnQgJiYgdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfSElEREVOKSA9PT0gdmlzaWJsZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbighdmlzaWJsZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0ID09PSBhdXhpbGlhcnlCYXJQYXJ0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNldEF1eGlsaWFyeUJhckhpZGRlbighdmlzaWJsZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0ID09PSBlZGl0b3JQYXJ0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNldEVkaXRvckhpZGRlbighdmlzaWJsZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBwYXJ0LmdldElkKCksIHZpc2libGUgfSk7XG5cdFx0XHRcdHRoaXMuaGFuZGxlQ29udGFpbmVyRGlkTGF5b3V0KHRoaXMubWFpbkNvbnRhaW5lciwgdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4ge1xuXG5cdFx0XHQvLyBTaWRlIEJhciBTaXplXG5cdFx0XHRjb25zdCBzaWRlQmFyU2l6ZSA9IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfSElEREVOKVxuXHRcdFx0XHQ/IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3Q2FjaGVkVmlzaWJsZVNpemUodGhpcy5zaWRlQmFyUGFydFZpZXcpXG5cdFx0XHRcdDogdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuc2lkZUJhclBhcnRWaWV3KS53aWR0aDtcblx0XHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRJbml0aWFsaXphdGlvblZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX1NJWkUsIHNpZGVCYXJTaXplIGFzIG51bWJlcik7XG5cblx0XHRcdC8vIFBhbmVsIFNpemVcblx0XHRcdGNvbnN0IHBhbmVsU2l6ZSA9IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0hJRERFTilcblx0XHRcdFx0PyB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld0NhY2hlZFZpc2libGVTaXplKHRoaXMucGFuZWxQYXJ0Vmlldylcblx0XHRcdFx0OiBpc0hvcml6b250YWwodGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfUE9TSVRJT04pKVxuXHRcdFx0XHRcdD8gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMucGFuZWxQYXJ0VmlldykuaGVpZ2h0XG5cdFx0XHRcdFx0OiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5wYW5lbFBhcnRWaWV3KS53aWR0aDtcblx0XHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRJbml0aWFsaXphdGlvblZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9TSVpFLCBwYW5lbFNpemUgYXMgbnVtYmVyKTtcblxuXHRcdFx0Ly8gQXV4aWxpYXJ5IEJhciBTaXplXG5cdFx0XHRjb25zdCBhdXhpbGlhcnlCYXJTaXplID0gdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX0hJRERFTilcblx0XHRcdFx0PyB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld0NhY2hlZFZpc2libGVTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpXG5cdFx0XHRcdDogdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpLndpZHRoO1xuXHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldEluaXRpYWxpemF0aW9uVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9TSVpFLCBhdXhpbGlhcnlCYXJTaXplIGFzIG51bWJlcik7XG5cblx0XHRcdHRoaXMuc3RhdGVNb2RlbC5zYXZlKHRydWUsIHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSh0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLm9uRGlkUGFuZUNvbXBvc2l0ZU9wZW4sIHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub25EaWRQYW5lQ29tcG9zaXRlQ2xvc2UpKCgpID0+IHtcblxuXHRcdFx0Ly8gQXV4aWxpYXJ5IEJhciBTdGF0ZVxuXHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldEluaXRpYWxpemF0aW9uVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9FTVBUWSwgdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRQYW5lQ29tcG9zaXRlSWRzKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpLmxlbmd0aCA9PT0gMCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0bGF5b3V0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5kaXNwb3NlZCkge1xuXHRcdFx0dGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbiA9IGdldENsaWVudEFyZWEodGhpcy5zdGF0ZS5ydW50aW1lLm1haW5XaW5kb3dGdWxsc2NyZWVuID9cblx0XHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5IDogXHQvLyBpbiBmdWxsc2NyZWVuIG1vZGUsIG1ha2Ugc3VyZSB0byB1c2UgPGJvZHk+IGVsZW1lbnQgYmVjYXVzZVxuXHRcdFx0XHR0aGlzLnBhcmVudCxcdFx0XHRcdC8vIGluIHRoYXQgY2FzZSB0aGUgd29ya2JlbmNoIHdpbGwgc3BhbiB0aGUgZW50aXJlIHNpdGVcblx0XHRcdFx0dGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSA/IERFRkFVTFRfRU1QVFlfV0lORE9XX0RJTUVOU0lPTlMgOiBERUZBVUxUX1dPUktTUEFDRV9XSU5ET1dfRElNRU5TSU9OUyAvLyBydW5uaW5nIHdpdGggZmFsbGJhY2sgdG8gZW5zdXJlIG5vIGVycm9yIGlzIHRocm93biAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI0MDI0Milcblx0XHRcdCk7XG5cblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgTGF5b3V0I2xheW91dCwgaGVpZ2h0OiAke3RoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24uaGVpZ2h0fSwgd2lkdGg6ICR7dGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aH1gKTtcblxuXHRcdFx0c2l6ZSh0aGlzLm1haW5Db250YWluZXIsIHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24ud2lkdGgsIHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24uaGVpZ2h0KTtcblxuXHRcdFx0Ly8gTGF5b3V0IHRoZSBncmlkIHdpZGdldFxuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLmxheW91dCh0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uLndpZHRoLCB0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uLmhlaWdodCk7XG5cdFx0XHR0aGlzLmluaXRpYWxpemVkID0gdHJ1ZTtcblxuXHRcdFx0Ly8gRW1pdCBhcyBldmVudFxuXHRcdFx0dGhpcy5oYW5kbGVDb250YWluZXJEaWRMYXlvdXQodGhpcy5tYWluQ29udGFpbmVyLCB0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRpc01haW5FZGl0b3JMYXlvdXRDZW50ZXJlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuTUFJTl9FRElUT1JfQ0VOVEVSRUQpO1xuXHR9XG5cblx0Y2VudGVyTWFpbkVkaXRvckxheW91dChhY3RpdmU6IGJvb2xlYW4sIHNraXBMYXlvdXQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuTUFJTl9FRElUT1JfQ0VOVEVSRUQsIGFjdGl2ZSk7XG5cblx0XHRjb25zdCBtYWluVmlzaWJsZUVkaXRvcnMgPSBjb2FsZXNjZSh0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmFjdGl2ZUVkaXRvcikpO1xuXHRcdGNvbnN0IGlzRWRpdG9yQ29tcGxleCA9IG1haW5WaXNpYmxlRWRpdG9ycy5zb21lKGVkaXRvciA9PiB7XG5cdFx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdkaWZmRWRpdG9yLnJlbmRlclNpZGVCeVNpZGUnKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVkaXRvcj8uaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5NdWx0aXBsZUVkaXRvcnMpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBsYXlvdXQgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRMYXlvdXQoKTtcblx0XHRsZXQgaGFzTW9yZVRoYW5PbmVDb2x1bW4gPSBmYWxzZTtcblx0XHRpZiAobGF5b3V0Lm9yaWVudGF0aW9uID09PSBHcm91cE9yaWVudGF0aW9uLkhPUklaT05UQUwpIHtcblx0XHRcdGhhc01vcmVUaGFuT25lQ29sdW1uID0gbGF5b3V0Lmdyb3Vwcy5sZW5ndGggPiAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRoYXNNb3JlVGhhbk9uZUNvbHVtbiA9IGxheW91dC5ncm91cHMuc29tZShncm91cCA9PiBncm91cC5ncm91cHMgJiYgZ3JvdXAuZ3JvdXBzLmxlbmd0aCA+IDEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzQ2VudGVyZWRMYXlvdXRBdXRvUmVzaXppbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3b3JrYmVuY2guZWRpdG9yLmNlbnRlcmVkTGF5b3V0QXV0b1Jlc2l6ZScpO1xuXHRcdGlmIChcblx0XHRcdGlzQ2VudGVyZWRMYXlvdXRBdXRvUmVzaXppbmcgJiZcblx0XHRcdCgoaGFzTW9yZVRoYW5PbmVDb2x1bW4gJiYgIXRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0Lmhhc01heGltaXplZEdyb3VwKCkpIHx8IGlzRWRpdG9yQ29tcGxleClcblx0XHQpIHtcblx0XHRcdGFjdGl2ZSA9IGZhbHNlOyAvLyBkaXNhYmxlIGNlbnRlcmVkIGxheW91dCBmb3IgY29tcGxleCBlZGl0b3JzIG9yIHdoZW4gdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBncm91cFxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5pc0xheW91dENlbnRlcmVkKCkgIT09IGFjdGl2ZSkge1xuXHRcdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UubWFpblBhcnQuY2VudGVyTGF5b3V0KGFjdGl2ZSk7XG5cblx0XHRcdGlmICghc2tpcExheW91dCkge1xuXHRcdFx0XHR0aGlzLmxheW91dCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTWFpbkVkaXRvckNlbnRlcmVkTGF5b3V0LmZpcmUodGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuTUFJTl9FRElUT1JfQ0VOVEVSRUQpKTtcblx0fVxuXG5cdGdldFNpemUocGFydDogUGFydHMpOiBJVmlld1NpemUge1xuXHRcdHJldHVybiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5nZXRQYXJ0KHBhcnQpKTtcblx0fVxuXG5cdHNldFNpemUocGFydDogUGFydHMsIHNpemU6IElWaWV3U2l6ZSk6IHZvaWQge1xuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5yZXNpemVWaWV3KHRoaXMuZ2V0UGFydChwYXJ0KSwgc2l6ZSk7XG5cdH1cblxuXHRyZXNpemVQYXJ0KHBhcnQ6IFBhcnRzLCBzaXplQ2hhbmdlV2lkdGg6IG51bWJlciwgc2l6ZUNoYW5nZUhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2l6ZUNoYW5nZVB4V2lkdGggPSBNYXRoLnNpZ24oc2l6ZUNoYW5nZVdpZHRoKSAqIGNvbXB1dGVTY3JlZW5Bd2FyZVNpemUoZ2V0QWN0aXZlV2luZG93KCksIE1hdGguYWJzKHNpemVDaGFuZ2VXaWR0aCkpO1xuXHRcdGNvbnN0IHNpemVDaGFuZ2VQeEhlaWdodCA9IE1hdGguc2lnbihzaXplQ2hhbmdlSGVpZ2h0KSAqIGNvbXB1dGVTY3JlZW5Bd2FyZVNpemUoZ2V0QWN0aXZlV2luZG93KCksIE1hdGguYWJzKHNpemVDaGFuZ2VIZWlnaHQpKTtcblxuXHRcdGxldCB2aWV3U2l6ZTogSVZpZXdTaXplO1xuXG5cdFx0c3dpdGNoIChwYXJ0KSB7XG5cdFx0XHRjYXNlIFBhcnRzLlNJREVCQVJfUEFSVDpcblx0XHRcdFx0dmlld1NpemUgPSB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5zaWRlQmFyUGFydFZpZXcpO1xuXHRcdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLnNpZGVCYXJQYXJ0Vmlldywge1xuXHRcdFx0XHRcdHdpZHRoOiB2aWV3U2l6ZS53aWR0aCArIHNpemVDaGFuZ2VQeFdpZHRoLFxuXHRcdFx0XHRcdGhlaWdodDogdmlld1NpemUuaGVpZ2h0XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQYXJ0cy5QQU5FTF9QQVJUOlxuXHRcdFx0XHR2aWV3U2l6ZSA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLnBhbmVsUGFydFZpZXcpO1xuXG5cdFx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5yZXNpemVWaWV3KHRoaXMucGFuZWxQYXJ0Vmlldywge1xuXHRcdFx0XHRcdHdpZHRoOiB2aWV3U2l6ZS53aWR0aCArIChpc0hvcml6b250YWwodGhpcy5nZXRQYW5lbFBvc2l0aW9uKCkpID8gMCA6IHNpemVDaGFuZ2VQeFdpZHRoKSxcblx0XHRcdFx0XHRoZWlnaHQ6IHZpZXdTaXplLmhlaWdodCArIChpc0hvcml6b250YWwodGhpcy5nZXRQYW5lbFBvc2l0aW9uKCkpID8gc2l6ZUNoYW5nZVB4SGVpZ2h0IDogMClcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUOlxuXHRcdFx0XHR2aWV3U2l6ZSA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3KTtcblx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldywge1xuXHRcdFx0XHRcdHdpZHRoOiB2aWV3U2l6ZS53aWR0aCArIHNpemVDaGFuZ2VQeFdpZHRoLFxuXHRcdFx0XHRcdGhlaWdodDogdmlld1NpemUuaGVpZ2h0XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUGFydHMuRURJVE9SX1BBUlQ6XG5cdFx0XHRcdHZpZXdTaXplID0gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuZWRpdG9yUGFydFZpZXcpO1xuXG5cdFx0XHRcdC8vIFNpbmdsZSBFZGl0b3IgR3JvdXBcblx0XHRcdFx0aWYgKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0LmNvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5lZGl0b3JQYXJ0Vmlldywge1xuXHRcdFx0XHRcdFx0d2lkdGg6IHZpZXdTaXplLndpZHRoICsgc2l6ZUNoYW5nZVB4V2lkdGgsXG5cdFx0XHRcdFx0XHRoZWlnaHQ6IHZpZXdTaXplLmhlaWdodCArIHNpemVDaGFuZ2VQeEhlaWdodFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2ZUdyb3VwID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UubWFpblBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRcdFx0XHRjb25zdCB7IHdpZHRoLCBoZWlnaHQgfSA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0LmdldFNpemUoYWN0aXZlR3JvdXApO1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0LnNldFNpemUoYWN0aXZlR3JvdXAsIHsgd2lkdGg6IHdpZHRoICsgc2l6ZUNoYW5nZVB4V2lkdGgsIGhlaWdodDogaGVpZ2h0ICsgc2l6ZUNoYW5nZVB4SGVpZ2h0IH0pO1xuXG5cdFx0XHRcdFx0Ly8gQWZ0ZXIgcmVzaXppbmcgdGhlIGVkaXRvciBncm91cFxuXHRcdFx0XHRcdC8vIGlmIGl0IGRvZXMgbm90IGNoYW5nZSBpbiBlaXRoZXIgZGlyZWN0aW9uXG5cdFx0XHRcdFx0Ly8gdHJ5IHJlc2l6aW5nIHRoZSBmdWxsIGVkaXRvciBwYXJ0XG5cdFx0XHRcdFx0Y29uc3QgeyB3aWR0aDogbmV3V2lkdGgsIGhlaWdodDogbmV3SGVpZ2h0IH0gPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5nZXRTaXplKGFjdGl2ZUdyb3VwKTtcblx0XHRcdFx0XHRpZiAoKHNpemVDaGFuZ2VQeEhlaWdodCAmJiBoZWlnaHQgPT09IG5ld0hlaWdodCkgfHwgKHNpemVDaGFuZ2VQeFdpZHRoICYmIHdpZHRoID09PSBuZXdXaWR0aCkpIHtcblx0XHRcdFx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5yZXNpemVWaWV3KHRoaXMuZWRpdG9yUGFydFZpZXcsIHtcblx0XHRcdFx0XHRcdFx0d2lkdGg6IHZpZXdTaXplLndpZHRoICsgKHNpemVDaGFuZ2VQeFdpZHRoICYmIHdpZHRoID09PSBuZXdXaWR0aCA/IHNpemVDaGFuZ2VQeFdpZHRoIDogMCksXG5cdFx0XHRcdFx0XHRcdGhlaWdodDogdmlld1NpemUuaGVpZ2h0ICsgKHNpemVDaGFuZ2VQeEhlaWdodCAmJiBoZWlnaHQgPT09IG5ld0hlaWdodCA/IHNpemVDaGFuZ2VQeEhlaWdodCA6IDApXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybjsgLy8gQ2Fubm90IHJlc2l6ZSBvdGhlciBwYXJ0c1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0QWN0aXZpdHlCYXJIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQUNUSVZJVFlCQVJfSElEREVOLCBoaWRkZW4pO1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuQUNUSVZJVFlCQVJfSElEREVOLCBoaWRkZW4pO1xuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLmFjdGl2aXR5QmFyUGFydFZpZXcsICFoaWRkZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRCYW5uZXJIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKHRoaXMuYmFubmVyUGFydFZpZXcsICFoaWRkZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRFZGl0b3JIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCFoaWRkZW4gJiYgdGhpcy5zZXRBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoZmFsc2UpICYmIHRoaXMuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJUKSkge1xuXHRcdFx0cmV0dXJuOyAvLyByZXR1cm46IGxlYXZpbmcgbWF4aW1pc2VkIGF1eGlsaWFyeSBiYXIgbWFkZSB0aGlzIHBhcnQgdmlzaWJsZVxuXHRcdH1cblxuXHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkVESVRPUl9ISURERU4sIGhpZGRlbik7XG5cblx0XHQvLyBBZGp1c3QgQ1NTXG5cdFx0aWYgKGhpZGRlbikge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoTGF5b3V0Q2xhc3Nlcy5NQUlOX0VESVRPUl9BUkVBX0hJRERFTik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKExheW91dENsYXNzZXMuTUFJTl9FRElUT1JfQVJFQV9ISURERU4pO1xuXHRcdH1cblxuXHRcdC8vIFByb3BhZ2F0ZSB0byBncmlkXG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKHRoaXMuZWRpdG9yUGFydFZpZXcsICFoaWRkZW4pO1xuXG5cdFx0Ly8gVGhlIGVkaXRvciBhbmQgcGFuZWwgY2Fubm90IGJlIGhpZGRlbiBhdCB0aGUgc2FtZSB0aW1lXG5cdFx0Ly8gdW5sZXNzIHdlIGhhdmUgYSBtYXhpbWl6ZWQgYXV4aWxpYXJ5IGJhclxuXHRcdGlmIChoaWRkZW4gJiYgIXRoaXMuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpICYmICF0aGlzLmlzQXV4aWxpYXJ5QmFyTWF4aW1pemVkKCkpIHtcblx0XHRcdHRoaXMuc2V0UGFuZWxIaWRkZW4oZmFsc2UsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdGdldExheW91dENsYXNzZXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBjb2FsZXNjZShbXG5cdFx0XHQhdGhpcy5pc1Zpc2libGUoUGFydHMuU0lERUJBUl9QQVJUKSA/IExheW91dENsYXNzZXMuU0lERUJBUl9ISURERU4gOiB1bmRlZmluZWQsXG5cdFx0XHQhdGhpcy5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpID8gTGF5b3V0Q2xhc3Nlcy5NQUlOX0VESVRPUl9BUkVBX0hJRERFTiA6IHVuZGVmaW5lZCxcblx0XHRcdCF0aGlzLmlzVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKSA/IExheW91dENsYXNzZXMuUEFORUxfSElEREVOIDogdW5kZWZpbmVkLFxuXHRcdFx0IXRoaXMuaXNWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSA/IExheW91dENsYXNzZXMuQVVYSUxJQVJZQkFSX0hJRERFTiA6IHVuZGVmaW5lZCxcblx0XHRcdCF0aGlzLmlzVmlzaWJsZShQYXJ0cy5BQ1RJVklUWUJBUl9QQVJUKSA/IExheW91dENsYXNzZXMuQUNUSVZJVFlCQVJfSElEREVOIDogdW5kZWZpbmVkLFxuXHRcdFx0IXRoaXMuaXNWaXNpYmxlKFBhcnRzLlNUQVRVU0JBUl9QQVJUKSA/IExheW91dENsYXNzZXMuU1RBVFVTQkFSX0hJRERFTiA6IHVuZGVmaW5lZCxcblx0XHRcdHRoaXMuc3RhdGUucnVudGltZS5tYWluV2luZG93RnVsbHNjcmVlbiA/IExheW91dENsYXNzZXMuRlVMTFNDUkVFTiA6IHVuZGVmaW5lZCxcblx0XHRcdHRoaXMuaXNTaGFkb3dzRGlzYWJsZWQoKSA/IExheW91dENsYXNzZXMuTk9fU0hBRE9XUyA6IHVuZGVmaW5lZCxcblx0XHRcdHRoaXMuaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKSA/IExheW91dENsYXNzZXMuRkxPQVRJTkdfUEFORUxTIDogdW5kZWZpbmVkLFxuXHRcdFx0Ly8gQWxzbyBzZWVkIHRoZSBzdHlsZS1vdmVycmlkZSBjbGFzcyBoZXJlIChzZWUgYExheW91dENsYXNzZXMuU1RZTEVfT1ZFUlJJREVgKS5cblx0XHRcdHRoaXMuaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKSA/IExheW91dENsYXNzZXMuU1RZTEVfT1ZFUlJJREUgOiB1bmRlZmluZWQsXG5cdFx0XHRgcGFuZWwtcG9zaXRpb24tJHtwb3NpdGlvblRvU3RyaW5nKHRoaXMuZ2V0UGFuZWxQb3NpdGlvbigpKX1gLFxuXHRcdFx0YHBhbmVsLWFsaWdubWVudC0ke3RoaXMuZ2V0UGFuZWxBbGlnbm1lbnQoKX1gXG5cdFx0XSk7XG5cdH1cblxuXHRwcml2YXRlIHNldFNpZGVCYXJIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCFoaWRkZW4gJiYgdGhpcy5zZXRBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoZmFsc2UpICYmIHRoaXMuaXNWaXNpYmxlKFBhcnRzLlNJREVCQVJfUEFSVCkpIHtcblx0XHRcdHJldHVybjsgLy8gcmV0dXJuOiBsZWF2aW5nIG1heGltaXNlZCBhdXhpbGlhcnkgYmFyIG1hZGUgdGhpcyBwYXJ0IHZpc2libGVcblx0XHR9XG5cblx0XHR0aGlzLnN0YXRlTW9kZWwuc2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX0hJRERFTiwgaGlkZGVuKTtcblxuXHRcdC8vIEFkanVzdCBDU1Ncblx0XHRpZiAoaGlkZGVuKSB7XG5cdFx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LmFkZChMYXlvdXRDbGFzc2VzLlNJREVCQVJfSElEREVOKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoTGF5b3V0Q2xhc3Nlcy5TSURFQkFSX0hJRERFTik7XG5cdFx0fVxuXG5cdFx0Ly8gUHJvcGFnYXRlIHRvIGdyaWRcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy5zaWRlQmFyUGFydFZpZXcsICFoaWRkZW4pO1xuXG5cdFx0Ly8gSWYgc2lkZWJhciBiZWNvbWVzIGhpZGRlbiwgYWxzbyBoaWRlIHRoZSBjdXJyZW50IGFjdGl2ZSBWaWV3bGV0IGlmIGFueVxuXHRcdGlmIChoaWRkZW4gJiYgdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSkge1xuXHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5oaWRlQWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cblx0XHRcdGlmICghdGhpcy5pc0F1eGlsaWFyeUJhck1heGltaXplZCgpKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNQYW5lbE9yRWRpdG9yKCk7IC8vIGRvIG5vdCBhdXRvIGZvY3VzIHdoZW4gYXV4aWxpYXJ5IGJhciBpcyBtYXhpbWl6ZWRcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBzaWRlYmFyIGJlY29tZXMgdmlzaWJsZSwgc2hvdyBsYXN0IGFjdGl2ZSBWaWV3bGV0IG9yIGRlZmF1bHQgdmlld2xldFxuXHRcdGVsc2UgaWYgKCFoaWRkZW4gJiYgIXRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcikpIHtcblx0XHRcdGNvbnN0IHZpZXdsZXRUb09wZW4gPSB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldExhc3RBY3RpdmVQYW5lQ29tcG9zaXRlSWQoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXHRcdFx0aWYgKHZpZXdsZXRUb09wZW4pIHtcblx0XHRcdFx0dGhpcy5vcGVuVmlld0NvbnRhaW5lcihWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgdmlld2xldFRvT3Blbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYXNWaWV3cyhpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKGlkKTtcblx0XHRpZiAoIXZpZXdDb250YWluZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3Q29udGFpbmVyTW9kZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lcik7XG5cdFx0aWYgKCF2aWV3Q29udGFpbmVyTW9kZWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdmlld0NvbnRhaW5lck1vZGVsLmFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGggPj0gMTtcblx0fVxuXG5cdHByaXZhdGUgYWRqdXN0UGFydFBvc2l0aW9ucyhzaWRlQmFyUG9zaXRpb246IFBvc2l0aW9uLCBwYW5lbEFsaWdubWVudDogUGFuZWxBbGlnbm1lbnQsIHBhbmVsUG9zaXRpb246IFBvc2l0aW9uKTogdm9pZCB7XG5cblx0XHQvLyBNb3ZlIGFjdGl2aXR5IGJhciBhbmQgc2lkZSBiYXJzXG5cdFx0Y29uc3QgaXNQYW5lbFZlcnRpY2FsID0gIWlzSG9yaXpvbnRhbChwYW5lbFBvc2l0aW9uKTtcblx0XHRjb25zdCBzaWRlQmFyU2libGluZ1RvRWRpdG9yID0gaXNQYW5lbFZlcnRpY2FsIHx8ICEocGFuZWxBbGlnbm1lbnQgPT09ICdjZW50ZXInIHx8IChzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQgJiYgcGFuZWxBbGlnbm1lbnQgPT09ICdyaWdodCcpIHx8IChzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLlJJR0hUICYmIHBhbmVsQWxpZ25tZW50ID09PSAnbGVmdCcpKTtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJTaWJsaW5nVG9FZGl0b3IgPSBpc1BhbmVsVmVydGljYWwgfHwgIShwYW5lbEFsaWdubWVudCA9PT0gJ2NlbnRlcicgfHwgKHNpZGVCYXJQb3NpdGlvbiA9PT0gUG9zaXRpb24uUklHSFQgJiYgcGFuZWxBbGlnbm1lbnQgPT09ICdyaWdodCcpIHx8IChzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQgJiYgcGFuZWxBbGlnbm1lbnQgPT09ICdsZWZ0JykpO1xuXHRcdGNvbnN0IHByZU1vdmVQYW5lbFdpZHRoID0gIXRoaXMuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpID8gU2l6aW5nLkludmlzaWJsZSh0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld0NhY2hlZFZpc2libGVTaXplKHRoaXMucGFuZWxQYXJ0VmlldykgPz8gdGhpcy5wYW5lbFBhcnRWaWV3Lm1pbmltdW1XaWR0aCkgOiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5wYW5lbFBhcnRWaWV3KS53aWR0aDtcblx0XHRjb25zdCBwcmVNb3ZlUGFuZWxIZWlnaHQgPSAhdGhpcy5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCkgPyBTaXppbmcuSW52aXNpYmxlKHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3Q2FjaGVkVmlzaWJsZVNpemUodGhpcy5wYW5lbFBhcnRWaWV3KSA/PyB0aGlzLnBhbmVsUGFydFZpZXcubWluaW11bUhlaWdodCkgOiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5wYW5lbFBhcnRWaWV3KS5oZWlnaHQ7XG5cdFx0Y29uc3QgcHJlTW92ZVNpZGVCYXJTaXplID0gIXRoaXMuaXNWaXNpYmxlKFBhcnRzLlNJREVCQVJfUEFSVCkgPyBTaXppbmcuSW52aXNpYmxlKHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3Q2FjaGVkVmlzaWJsZVNpemUodGhpcy5zaWRlQmFyUGFydFZpZXcpID8/IHRoaXMuc2lkZUJhclBhcnRWaWV3Lm1pbmltdW1XaWR0aCkgOiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5zaWRlQmFyUGFydFZpZXcpLndpZHRoO1xuXHRcdGNvbnN0IHByZU1vdmVBdXhpbGlhcnlCYXJTaXplID0gIXRoaXMuaXNWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSA/IFNpemluZy5JbnZpc2libGUodGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdDYWNoZWRWaXNpYmxlU2l6ZSh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3KSA/PyB0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3Lm1pbmltdW1XaWR0aCkgOiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldykud2lkdGg7XG5cblx0XHRjb25zdCBmb2N1c2VkUGFydCA9IFtQYXJ0cy5QQU5FTF9QQVJULCBQYXJ0cy5TSURFQkFSX1BBUlQsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUXS5maW5kKHBhcnQgPT4gdGhpcy5oYXNGb2N1cyhwYXJ0KSkgYXMgU0lOR0xFX1dJTkRPV19QQVJUUyB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQpIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlld1RvKHRoaXMuYWN0aXZpdHlCYXJQYXJ0VmlldywgWzIsIDBdKTtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlldyh0aGlzLnNpZGVCYXJQYXJ0VmlldywgcHJlTW92ZVNpZGVCYXJTaXplLCBzaWRlQmFyU2libGluZ1RvRWRpdG9yID8gdGhpcy5lZGl0b3JQYXJ0VmlldyA6IHRoaXMuYWN0aXZpdHlCYXJQYXJ0Vmlldywgc2lkZUJhclNpYmxpbmdUb0VkaXRvciA/IERpcmVjdGlvbi5MZWZ0IDogRGlyZWN0aW9uLlJpZ2h0KTtcblx0XHRcdGlmIChhdXhpbGlhcnlCYXJTaWJsaW5nVG9FZGl0b3IpIHtcblx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLm1vdmVWaWV3KHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcsIHByZU1vdmVBdXhpbGlhcnlCYXJTaXplLCB0aGlzLmVkaXRvclBhcnRWaWV3LCBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLm1vdmVWaWV3VG8odGhpcy5hdXhpbGlhcnlCYXJQYXJ0VmlldywgWzIsIC0xXSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlld1RvKHRoaXMuYWN0aXZpdHlCYXJQYXJ0VmlldywgWzIsIC0xXSk7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQubW92ZVZpZXcodGhpcy5zaWRlQmFyUGFydFZpZXcsIHByZU1vdmVTaWRlQmFyU2l6ZSwgc2lkZUJhclNpYmxpbmdUb0VkaXRvciA/IHRoaXMuZWRpdG9yUGFydFZpZXcgOiB0aGlzLmFjdGl2aXR5QmFyUGFydFZpZXcsIHNpZGVCYXJTaWJsaW5nVG9FZGl0b3IgPyBEaXJlY3Rpb24uUmlnaHQgOiBEaXJlY3Rpb24uTGVmdCk7XG5cdFx0XHRpZiAoYXV4aWxpYXJ5QmFyU2libGluZ1RvRWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlldyh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3LCBwcmVNb3ZlQXV4aWxpYXJ5QmFyU2l6ZSwgdGhpcy5lZGl0b3JQYXJ0VmlldywgRGlyZWN0aW9uLkxlZnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLm1vdmVWaWV3VG8odGhpcy5hdXhpbGlhcnlCYXJQYXJ0VmlldywgWzIsIDBdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBNYWludGFpbiBmb2N1cyBhZnRlciBtb3ZpbmcgcGFydHNcblx0XHRpZiAoZm9jdXNlZFBhcnQpIHtcblx0XHRcdHRoaXMuZm9jdXNQYXJ0KGZvY3VzZWRQYXJ0KTtcblx0XHR9XG5cblx0XHQvLyBXZSBtb3ZlZCBhbGwgdGhlIHNpZGUgcGFydHMgYmFzZWQgb24gdGhlIGVkaXRvciBhbmQgaWdub3JlZCB0aGUgcGFuZWxcblx0XHQvLyBOb3csIHdlIG5lZWQgdG8gcHV0IHRoZSBwYW5lbCBiYWNrIGluIHRoZSByaWdodCBwb3NpdGlvbiB3aGVuIGl0IGlzIG5leHQgdG8gdGhlIGVkaXRvclxuXHRcdGlmIChpc1BhbmVsVmVydGljYWwpIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlldyh0aGlzLnBhbmVsUGFydFZpZXcsIHByZU1vdmVQYW5lbFdpZHRoLCB0aGlzLmVkaXRvclBhcnRWaWV3LCBwYW5lbFBvc2l0aW9uID09PSBQb3NpdGlvbi5MRUZUID8gRGlyZWN0aW9uLkxlZnQgOiBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5wYW5lbFBhcnRWaWV3LCB7XG5cdFx0XHRcdGhlaWdodDogcHJlTW92ZVBhbmVsSGVpZ2h0IGFzIG51bWJlcixcblx0XHRcdFx0d2lkdGg6IHByZU1vdmVQYW5lbFdpZHRoIGFzIG51bWJlclxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gTW92aW5nIHZpZXdzIGluIHRoZSBncmlkIGNhbiBjYXVzZSB0aGVtIHRvIHJlLWRpc3RyaWJ1dGUgc2l6aW5nIHVubmVjZXNzYXJpbHlcblx0XHQvLyBSZXNpemUgdmlzaWJsZSBwYXJ0cyB0byB0aGUgd2lkdGggdGhleSB3ZXJlIGJlZm9yZSB0aGUgb3BlcmF0aW9uXG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKFBhcnRzLlNJREVCQVJfUEFSVCkpIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5yZXNpemVWaWV3KHRoaXMuc2lkZUJhclBhcnRWaWV3LCB7XG5cdFx0XHRcdGhlaWdodDogdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuc2lkZUJhclBhcnRWaWV3KS5oZWlnaHQsXG5cdFx0XHRcdHdpZHRoOiBwcmVNb3ZlU2lkZUJhclNpemUgYXMgbnVtYmVyXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpKSB7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3LCB7XG5cdFx0XHRcdGhlaWdodDogdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpLmhlaWdodCxcblx0XHRcdFx0d2lkdGg6IHByZU1vdmVBdXhpbGlhcnlCYXJTaXplIGFzIG51bWJlclxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0c2V0UGFuZWxBbGlnbm1lbnQoYWxpZ25tZW50OiBQYW5lbEFsaWdubWVudCk6IHZvaWQge1xuXG5cdFx0Ly8gUGFuZWwgYWxpZ25tZW50IG9ubHkgYXBwbGllcyB0byBhIHBhbmVsIGluIHRoZSB0b3AvYm90dG9tIHBvc2l0aW9uXG5cdFx0aWYgKCFpc0hvcml6b250YWwodGhpcy5nZXRQYW5lbFBvc2l0aW9uKCkpKSB7XG5cdFx0XHR0aGlzLnNldFBhbmVsUG9zaXRpb24oUG9zaXRpb24uQk9UVE9NKTtcblx0XHR9XG5cblx0XHQvLyB0aGUgd29ya2JlbmNoIGdyaWQgY3VycmVudGx5IHByZXZlbnRzIHVzIGZyb20gc3VwcG9ydGluZyBwYW5lbCBtYXhpbWl6YXRpb24gd2l0aCBub24tY2VudGVyIHBhbmVsIGFsaWdubWVudFxuXHRcdGlmIChhbGlnbm1lbnQgIT09ICdjZW50ZXInICYmIHRoaXMuaXNQYW5lbE1heGltaXplZCgpKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZU1heGltaXplZFBhbmVsKCk7XG5cdFx0fVxuXG5cdFx0Ly8gTGVhdmUgYXV4aWxpYXJ5IGJhciBtYXhpbWl6ZWQgc3RhdGUgYmVjYXVzZSBjaGFuZ2luZ1xuXHRcdC8vIHBhbmVsIGFsaWdubWVudCByZXF1aXJlcyB0aGUgZWRpdG9yIHBhcnQgdG8gYmUgdmlzaWJsZVxuXHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFyTWF4aW1pemVkKGZhbHNlKTtcblxuXHRcdC8vIEFkanVzdCBDU1MgXHUyMDE0IGNhcHR1cmUgb2xkIHZhbHVlIGJlZm9yZSB1cGRhdGluZyBzdGF0ZSBtb2RlbFxuXHRcdGNvbnN0IG9sZEFsaWdubWVudFZhbHVlID0gdGhpcy5nZXRQYW5lbEFsaWdubWVudCgpO1xuXHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0FMSUdOTUVOVCwgYWxpZ25tZW50KTtcblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShgcGFuZWwtYWxpZ25tZW50LSR7b2xkQWxpZ25tZW50VmFsdWV9YCk7XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoYHBhbmVsLWFsaWdubWVudC0ke2FsaWdubWVudH1gKTtcblxuXHRcdHRoaXMuYWRqdXN0UGFydFBvc2l0aW9ucyh0aGlzLmdldFNpZGVCYXJQb3NpdGlvbigpLCBhbGlnbm1lbnQsIHRoaXMuZ2V0UGFuZWxQb3NpdGlvbigpKTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUGFuZWxBbGlnbm1lbnQuZmlyZShhbGlnbm1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRQYW5lbEhpZGRlbihoaWRkZW46IGJvb2xlYW4sIHNraXBMYXlvdXQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLndvcmtiZW5jaEdyaWQpIHtcblx0XHRcdHJldHVybjsgLy8gUmV0dXJuIGlmIG5vdCBpbml0aWFsaXplZCBmdWxseSAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwNTQ4MClcblx0XHR9XG5cblx0XHRpZiAoIWhpZGRlbiAmJiB0aGlzLnNldEF1eGlsaWFyeUJhck1heGltaXplZChmYWxzZSkgJiYgdGhpcy5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCkpIHtcblx0XHRcdHJldHVybjsgLy8gcmV0dXJuOiBsZWF2aW5nIG1heGltaXNlZCBhdXhpbGlhcnkgYmFyIG1hZGUgdGhpcyBwYXJ0IHZpc2libGVcblx0XHR9XG5cblx0XHRjb25zdCB3YXNIaWRkZW4gPSAhdGhpcy5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCk7XG5cdFx0Y29uc3QgaXNQYW5lbE1heGltaXplZCA9IHRoaXMuaXNQYW5lbE1heGltaXplZCgpO1xuXG5cdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfSElEREVOLCBoaWRkZW4pO1xuXG5cdFx0Y29uc3QgcGFuZWxPcGVuc01heGltaXplZCA9IHRoaXMucGFuZWxPcGVuc01heGltaXplZCgpO1xuXG5cdFx0Ly8gQWRqdXN0IENTU1xuXHRcdGlmIChoaWRkZW4pIHtcblx0XHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKExheW91dENsYXNzZXMuUEFORUxfSElEREVOKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoTGF5b3V0Q2xhc3Nlcy5QQU5FTF9ISURERU4pO1xuXHRcdH1cblxuXHRcdC8vIElmIG1heGltaXplZCBhbmQgaW4gcHJvY2VzcyBvZiBoaWRpbmcsIHVubWF4aW1pemUgRklSU1QgYmVmb3JlXG5cdFx0Ly8gY2hhbmdpbmcgdmlzaWJpbGl0eSB0byBwcmV2ZW50IGNvbmZsaWN0IHdpdGggc2V0RWRpdG9ySGlkZGVuXG5cdFx0Ly8gd2hpY2ggd291bGQgZm9yY2UgcGFuZWwgdmlzaWJsZSBhZ2FpbiAoZml4ZXMgIzI4MTc3Milcblx0XHRpZiAoaGlkZGVuICYmIGlzUGFuZWxNYXhpbWl6ZWQpIHtcblx0XHRcdHRoaXMudG9nZ2xlTWF4aW1pemVkUGFuZWwoKTtcblx0XHR9XG5cblx0XHQvLyBQcm9wYWdhdGUgbGF5b3V0IGNoYW5nZXMgdG8gZ3JpZFxuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLnBhbmVsUGFydFZpZXcsICFoaWRkZW4pO1xuXG5cdFx0Ly8gSWYgcGFuZWwgcGFydCBiZWNvbWVzIGhpZGRlbiwgYWxzbyBoaWRlIHRoZSBjdXJyZW50IGFjdGl2ZSBwYW5lbCBpZiBhbnlcblx0XHRsZXQgZm9jdXNFZGl0b3IgPSBmYWxzZTtcblx0XHRpZiAoaGlkZGVuICYmIHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpKSB7XG5cdFx0XHR0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmhpZGVBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdCFpc0lPUyAmJlx0XHRcdFx0XHRcdC8vIGRvIG5vdCBhdXRvIGZvY3VzIG9uIGlPUyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyNzgzMilcblx0XHRcdFx0IXRoaXMuaXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoKVx0Ly8gZG8gbm90IGF1dG8gZm9jdXMgd2hlbiBhdXhpbGlhcnkgYmFyIGlzIG1heGltaXplZFxuXHRcdFx0KSB7XG5cdFx0XHRcdGZvY3VzRWRpdG9yID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBwYW5lbCBwYXJ0IGJlY29tZXMgdmlzaWJsZSwgc2hvdyBsYXN0IGFjdGl2ZSBwYW5lbCBvciBkZWZhdWx0IHBhbmVsXG5cdFx0ZWxzZSBpZiAoIWhpZGRlbiAmJiAhdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCkpIHtcblx0XHRcdGxldCBwYW5lbFRvT3Blbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRMYXN0QWN0aXZlUGFuZUNvbXBvc2l0ZUlkKFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cblx0XHRcdC8vIHZlcmlmeSB0aGF0IHRoZSBwYW5lbCB3ZSB0cnkgdG8gb3BlbiBoYXMgdmlld3MgYmVmb3JlIHdlIGRlZmF1bHQgdG8gaXRcblx0XHRcdC8vIG90aGVyd2lzZSBmYWxsIGJhY2sgdG8gYW55IHZpZXcgdGhhdCBoYXMgdmlld3Mgc3RpbGwgcmVmcyAjMTExNDYzXG5cdFx0XHRpZiAoIXBhbmVsVG9PcGVuIHx8ICF0aGlzLmhhc1ZpZXdzKHBhbmVsVG9PcGVuKSkge1xuXHRcdFx0XHRwYW5lbFRvT3BlbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlXG5cdFx0XHRcdFx0LmdldFZpZXdDb250YWluZXJzQnlMb2NhdGlvbihWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpXG5cdFx0XHRcdFx0LmZpbmQodmlld0NvbnRhaW5lciA9PiB0aGlzLmhhc1ZpZXdzKHZpZXdDb250YWluZXIuaWQpKT8uaWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwYW5lbFRvT3Blbikge1xuXHRcdFx0XHR0aGlzLm9wZW5WaWV3Q29udGFpbmVyKFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCwgcGFuZWxUb09wZW4sICFza2lwTGF5b3V0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEb24ndCBwcm9jZWVkIGlmIHdlIGhhdmUgYWxyZWFkeSBkb25lIHRoaXMgYmVmb3JlXG5cdFx0aWYgKHdhc0hpZGRlbiA9PT0gaGlkZGVuKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgaW4gcHJvY2VzcyBvZiBzaG93aW5nLCB0b2dnbGUgd2hldGhlciBvciBub3QgcGFuZWwgaXMgbWF4aW1pemVkXG5cdFx0aWYgKCFoaWRkZW4pIHtcblx0XHRcdGlmICghc2tpcExheW91dCAmJiBpc1BhbmVsTWF4aW1pemVkICE9PSBwYW5lbE9wZW5zTWF4aW1pemVkKSB7XG5cdFx0XHRcdHRoaXMudG9nZ2xlTWF4aW1pemVkUGFuZWwoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSWYgaW4gcHJvY2VzcyBvZiBoaWRpbmcsIHJlbWVtYmVyIHdoZXRoZXIgdGhlIHBhbmVsIGlzIG1heGltaXplZCBvciBub3Rcblx0XHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX1dBU19MQVNUX01BWElNSVpFRCwgaXNQYW5lbE1heGltaXplZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGZvY3VzRWRpdG9yKSB7XG5cdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5hY3RpdmVHcm91cC5mb2N1cygpOyAvLyBQYXNzIGZvY3VzIHRvIGVkaXRvciBncm91cCBpZiBwYW5lbCBwYXJ0IGlzIG5vdyBoaWRkZW5cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluTWF4aW1pemVkQXV4aWxpYXJ5QmFyVHJhbnNpdGlvbiA9IGZhbHNlO1xuXG5cdGlzQXV4aWxpYXJ5QmFyTWF4aW1pemVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfV0FTX0xBU1RfTUFYSU1JWkVEKTtcblx0fVxuXG5cdHRvZ2dsZU1heGltaXplZEF1eGlsaWFyeUJhcigpOiB2b2lkIHtcblx0XHR0aGlzLnNldEF1eGlsaWFyeUJhck1heGltaXplZCghdGhpcy5pc0F1eGlsaWFyeUJhck1heGltaXplZCgpKTtcblx0fVxuXG5cdHNldEF1eGlsaWFyeUJhck1heGltaXplZChtYXhpbWl6ZWQ6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAoXG5cdFx0XHR0aGlzLmluTWF4aW1pemVkQXV4aWxpYXJ5QmFyVHJhbnNpdGlvbiB8fFx0XHQvLyBwcmV2ZW50IHJlLWVudHJhbmNlXG5cdFx0XHQobWF4aW1pemVkID09PSB0aGlzLmlzQXV4aWxpYXJ5QmFyTWF4aW1pemVkKCkpXHQvLyByZXR1cm4gZWFybHkgaWYgc3RhdGUgaXMgYWxyZWFkeSBwcmVzZW50XG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKG1heGltaXplZCkge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB7XG5cdFx0XHRcdHNpZGVCYXJWaXNpYmxlOiB0aGlzLmlzVmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQpLFxuXHRcdFx0XHRlZGl0b3JWaXNpYmxlOiB0aGlzLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRcdHBhbmVsVmlzaWJsZTogdGhpcy5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCksXG5cdFx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IHRoaXMuaXNWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9XQVNfTEFTVF9NQVhJTUlaRUQsIHRydWUpO1xuXG5cdFx0XHR0aGlzLmluTWF4aW1pemVkQXV4aWxpYXJ5QmFyVHJhbnNpdGlvbiA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoIXN0YXRlLmF1eGlsaWFyeUJhclZpc2libGUpIHtcblx0XHRcdFx0XHR0aGlzLnNldEF1eGlsaWFyeUJhckhpZGRlbihmYWxzZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzaXplID0gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpLndpZHRoO1xuXHRcdFx0XHR0aGlzLnN0YXRlTW9kZWwuc2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfTEFTVF9OT05fTUFYSU1JWkVEX1NJWkUsIHNpemUpO1xuXG5cdFx0XHRcdGlmIChzdGF0ZS5zaWRlQmFyVmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuc2V0U2lkZUJhckhpZGRlbih0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc3RhdGUucGFuZWxWaXNpYmxlKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbih0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc3RhdGUuZWRpdG9yVmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuc2V0RWRpdG9ySGlkZGVuKHRydWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX0xBU1RfTk9OX01BWElNSVpFRF9WSVNJQklMSVRZLCBzdGF0ZSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLmluTWF4aW1pemVkQXV4aWxpYXJ5QmFyVHJhbnNpdGlvbiA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9MQVNUX05PTl9NQVhJTUlaRURfVklTSUJJTElUWSkpO1xuXHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX1dBU19MQVNUX01BWElNSVpFRCwgZmFsc2UpO1xuXG5cdFx0XHR0aGlzLmluTWF4aW1pemVkQXV4aWxpYXJ5QmFyVHJhbnNpdGlvbiA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLnNldEVkaXRvckhpZGRlbighc3RhdGU/LmVkaXRvclZpc2libGUpO1x0Ly8gdGhpcyBvcmRlciBvZiB1cGRhdGluZyB2aWV3IHZpc2liaWxpdHlcblx0XHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbighc3RhdGU/LnBhbmVsVmlzaWJsZSk7XHRcdC8vIGhlbHBzIGluIHJlc3RvcmluZyB0aGUgcHJldmlvdXMgdmlld1xuXHRcdFx0XHR0aGlzLnNldFNpZGVCYXJIaWRkZW4oIXN0YXRlPy5zaWRlQmFyVmlzaWJsZSk7XHQvLyBzaXplcyB3ZSBoYWRcblxuXHRcdFx0XHRjb25zdCBzaXplID0gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpO1xuXHRcdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3LCB7XG5cdFx0XHRcdFx0d2lkdGg6IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9MQVNUX05PTl9NQVhJTUlaRURfU0laRSksXG5cdFx0XHRcdFx0aGVpZ2h0OiBzaXplLmhlaWdodFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuaW5NYXhpbWl6ZWRBdXhpbGlhcnlCYXJUcmFuc2l0aW9uID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5mb2N1c1BhcnQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBdXhpbGlhcnlCYXJNYXhpbWl6ZWQuZmlyZSgpO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpc1BhbmVsTWF4aW1pemVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHR0aGlzLmdldFBhbmVsQWxpZ25tZW50KCkgPT09ICdjZW50ZXInIHx8IFx0Ly8gdGhlIHdvcmtiZW5jaCBncmlkIGN1cnJlbnRseSBwcmV2ZW50cyB1cyBmcm9tIHN1cHBvcnRpbmcgcGFuZWxcblx0XHRcdCFpc0hvcml6b250YWwodGhpcy5nZXRQYW5lbFBvc2l0aW9uKCkpXHRcdC8vIG1heGltaXphdGlvbiB3aXRoIG5vbi1jZW50ZXIgcGFuZWwgYWxpZ25tZW50XG5cdFx0KSAmJiAhdGhpcy5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpICYmICF0aGlzLmlzQXV4aWxpYXJ5QmFyTWF4aW1pemVkKCk7XG5cdH1cblxuXHR0b2dnbGVNYXhpbWl6ZWRQYW5lbCgpOiB2b2lkIHtcblx0XHRjb25zdCBzaXplID0gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMucGFuZWxQYXJ0Vmlldyk7XG5cdFx0Y29uc3QgcGFuZWxQb3NpdGlvbiA9IHRoaXMuZ2V0UGFuZWxQb3NpdGlvbigpO1xuXHRcdGNvbnN0IG1heGltaXplID0gIXRoaXMuaXNQYW5lbE1heGltaXplZCgpO1xuXHRcdGlmIChtYXhpbWl6ZSkge1xuXHRcdFx0aWYgKHRoaXMuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpKSB7XG5cdFx0XHRcdGlmIChpc0hvcml6b250YWwocGFuZWxQb3NpdGlvbikpIHtcblx0XHRcdFx0XHR0aGlzLnN0YXRlTW9kZWwuc2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9MQVNUX05PTl9NQVhJTUlaRURfSEVJR0hULCBzaXplLmhlaWdodCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfTEFTVF9OT05fTUFYSU1JWkVEX1dJRFRILCBzaXplLndpZHRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNldEVkaXRvckhpZGRlbih0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZXRFZGl0b3JIaWRkZW4oZmFsc2UpO1xuXG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLnBhbmVsUGFydFZpZXcsIHtcblx0XHRcdFx0d2lkdGg6IGlzSG9yaXpvbnRhbChwYW5lbFBvc2l0aW9uKSA/IHNpemUud2lkdGggOiB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9MQVNUX05PTl9NQVhJTUlaRURfV0lEVEgpLFxuXHRcdFx0XHRoZWlnaHQ6IGlzSG9yaXpvbnRhbChwYW5lbFBvc2l0aW9uKSA/IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0xBU1RfTk9OX01BWElNSVpFRF9IRUlHSFQpIDogc2l6ZS5oZWlnaHRcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX1dBU19MQVNUX01BWElNSVpFRCwgbWF4aW1pemUpO1xuXHR9XG5cblx0cHJpdmF0ZSBwYW5lbE9wZW5zTWF4aW1pemVkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmdldFBhbmVsQWxpZ25tZW50KCkgIT09ICdjZW50ZXInICYmIGlzSG9yaXpvbnRhbCh0aGlzLmdldFBhbmVsUG9zaXRpb24oKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gVGhlIHdvcmtiZW5jaCBncmlkIGN1cnJlbnRseSBwcmV2ZW50cyB1cyBmcm9tIHN1cHBvcnRpbmcgcGFuZWwgbWF4aW1pemF0aW9uIHdpdGggbm9uLWNlbnRlciBwYW5lbCBhbGlnbm1lbnRcblx0XHR9XG5cblx0XHRjb25zdCBwYW5lbE9wZW5zTWF4aW1pemVkID0gcGFydE9wZW5zTWF4aW1pemVkRnJvbVN0cmluZyh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oV29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuUEFORUxfT1BFTlNfTUFYSU1JWkVEKSk7XG5cdFx0Y29uc3QgcGFuZWxMYXN0SXNNYXhpbWl6ZWQgPSB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9XQVNfTEFTVF9NQVhJTUlaRUQpO1xuXG5cdFx0cmV0dXJuIHBhbmVsT3BlbnNNYXhpbWl6ZWQgPT09IFBhcnRPcGVuc01heGltaXplZE9wdGlvbnMuQUxXQVlTIHx8IChwYW5lbE9wZW5zTWF4aW1pemVkID09PSBQYXJ0T3BlbnNNYXhpbWl6ZWRPcHRpb25zLlJFTUVNQkVSX0xBU1QgJiYgcGFuZWxMYXN0SXNNYXhpbWl6ZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRBdXhpbGlhcnlCYXJIaWRkZW4oaGlkZGVuOiBib29sZWFuLCBza2lwTGF5b3V0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChoaWRkZW4gJiYgdGhpcy5zZXRBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoZmFsc2UpICYmICF0aGlzLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpIHtcblx0XHRcdHJldHVybjsgLy8gcmV0dXJuOiBsZWF2aW5nIG1heGltaXNlZCBhdXhpbGlhcnkgYmFyIG1hZGUgdGhpcyBwYXJ0IGhpZGRlblxuXHRcdH1cblxuXHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9ISURERU4sIGhpZGRlbik7XG5cblx0XHQvLyBBZGp1c3QgQ1NTXG5cdFx0aWYgKGhpZGRlbikge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoTGF5b3V0Q2xhc3Nlcy5BVVhJTElBUllCQVJfSElEREVOKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoTGF5b3V0Q2xhc3Nlcy5BVVhJTElBUllCQVJfSElEREVOKTtcblx0XHR9XG5cblx0XHQvLyBQcm9wYWdhdGUgdG8gZ3JpZFxuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3LCAhaGlkZGVuKTtcblxuXHRcdC8vIElmIGF1eGlsaWFyeSBiYXIgYmVjb21lcyBoaWRkZW4sIGFsc28gaGlkZSB0aGUgY3VycmVudCBhY3RpdmUgcGFuZSBjb21wb3NpdGUgaWYgYW55XG5cdFx0aWYgKGhpZGRlbiAmJiB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikpIHtcblx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuaGlkZUFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik7XG5cdFx0XHR0aGlzLmZvY3VzUGFuZWxPckVkaXRvcigpO1xuXHRcdH1cblxuXHRcdC8vIElmIGF1eGlsaWFyeSBiYXIgYmVjb21lcyB2aXNpYmxlLCBzaG93IGxhc3QgYWN0aXZlIHBhbmUgY29tcG9zaXRlIG9yIGRlZmF1bHQgcGFuZSBjb21wb3NpdGVcblx0XHRlbHNlIGlmICghaGlkZGVuICYmICF0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikpIHtcblx0XHRcdGxldCB2aWV3bGV0VG9PcGVuOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldExhc3RBY3RpdmVQYW5lQ29tcG9zaXRlSWQoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik7XG5cblx0XHRcdC8vIHZlcmlmeSB0aGF0IHRoZSB2aWV3bGV0IHdlIHRyeSB0byBvcGVuIGhhcyB2aWV3cyBiZWZvcmUgd2UgZGVmYXVsdCB0byBpdFxuXHRcdFx0Ly8gb3RoZXJ3aXNlIGZhbGwgYmFjayB0byBhbnkgdmlldyB0aGF0IGhhcyB2aWV3cyBzdGlsbCByZWZzICMxMTE0NjNcblx0XHRcdGlmICghdmlld2xldFRvT3BlbiB8fCAhdGhpcy5oYXNWaWV3cyh2aWV3bGV0VG9PcGVuKSkge1xuXHRcdFx0XHR2aWV3bGV0VG9PcGVuID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2Vcblx0XHRcdFx0XHQuZ2V0Vmlld0NvbnRhaW5lcnNCeUxvY2F0aW9uKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpXG5cdFx0XHRcdFx0LmZpbmQodmlld0NvbnRhaW5lciA9PiB0aGlzLmhhc1ZpZXdzKHZpZXdDb250YWluZXIuaWQpKT8uaWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh2aWV3bGV0VG9PcGVuKSB7XG5cdFx0XHRcdHRoaXMub3BlblZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhciwgdmlld2xldFRvT3BlbiwgIXNraXBMYXlvdXQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHNldFBhcnRIaWRkZW4oaGlkZGVuOiBib29sZWFuLCBwYXJ0OiBQYXJ0cyk6IHZvaWQge1xuXHRcdHN3aXRjaCAocGFydCkge1xuXHRcdFx0Y2FzZSBQYXJ0cy5BQ1RJVklUWUJBUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXRBY3Rpdml0eUJhckhpZGRlbihoaWRkZW4pO1xuXHRcdFx0Y2FzZSBQYXJ0cy5TSURFQkFSX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLnNldFNpZGVCYXJIaWRkZW4oaGlkZGVuKTtcblx0XHRcdGNhc2UgUGFydHMuRURJVE9SX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLnNldEVkaXRvckhpZGRlbihoaWRkZW4pO1xuXHRcdFx0Y2FzZSBQYXJ0cy5CQU5ORVJfUEFSVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2V0QmFubmVySGlkZGVuKGhpZGRlbik7XG5cdFx0XHRjYXNlIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXRBdXhpbGlhcnlCYXJIaWRkZW4oaGlkZGVuKTtcblx0XHRcdGNhc2UgUGFydHMuUEFORUxfUEFSVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2V0UGFuZWxIaWRkZW4oaGlkZGVuKTtcblx0XHR9XG5cdH1cblxuXHR0b2dnbGVTZWNvbmRhcnlTaWRlQmFyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHZpc2libGUgPSAhdGhpcy5pc1NlY29uZGFyeVNpZGVCYXJWaXNpYmxlKCk7XG5cdFx0dGhpcy5zZXRQYXJ0SGlkZGVuKCF2aXNpYmxlLCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0YWxlcnQodmlzaWJsZVxuXHRcdFx0PyBsb2NhbGl6ZSgnYXV4aWxpYXJ5QmFyVmlzaWJsZScsIFwiU2Vjb25kYXJ5IFNpZGUgQmFyIHNob3duXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdhdXhpbGlhcnlCYXJIaWRkZW4nLCBcIlNlY29uZGFyeSBTaWRlIEJhciBoaWRkZW5cIikpO1xuXHR9XG5cblx0aXNTZWNvbmRhcnlTaWRlQmFyVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHR9XG5cblx0aGFzTWFpbldpbmRvd0JvcmRlcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0ZS5ydW50aW1lLm1haW5XaW5kb3dCb3JkZXI7XG5cdH1cblxuXHRnZXRNYWluV2luZG93Qm9yZGVyUmFkaXVzKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhdGUucnVudGltZS5tYWluV2luZG93Qm9yZGVyICYmIGlzTWFjaW50b3NoID8gJzEwcHgnIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0U2lkZUJhclBvc2l0aW9uKCk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9QT1NJVE9OKTtcblx0fVxuXG5cdGdldFBhbmVsQWxpZ25tZW50KCk6IFBhbmVsQWxpZ25tZW50IHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfQUxJR05NRU5UKTtcblx0fVxuXG5cdHVwZGF0ZU1lbnViYXJWaXNpYmlsaXR5KHNraXBMYXlvdXQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBzaG91bGRTaG93VGl0bGVCYXIgPSBzaG91bGRTaG93Q3VzdG9tVGl0bGVCYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgbWFpbldpbmRvdywgdGhpcy5zdGF0ZS5ydW50aW1lLm1lbnVCYXIudG9nZ2xlZCk7XG5cdFx0aWYgKCFza2lwTGF5b3V0ICYmIHRoaXMud29ya2JlbmNoR3JpZCAmJiBzaG91bGRTaG93VGl0bGVCYXIgIT09IHRoaXMuaXNWaXNpYmxlKFBhcnRzLlRJVExFQkFSX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy50aXRsZUJhclBhcnRWaWV3LCBzaG91bGRTaG93VGl0bGVCYXIpO1xuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZUN1c3RvbVRpdGxlQmFyVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRjb25zdCBzaG91bGRTaG93VGl0bGVCYXIgPSBzaG91bGRTaG93Q3VzdG9tVGl0bGVCYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgbWFpbldpbmRvdywgdGhpcy5zdGF0ZS5ydW50aW1lLm1lbnVCYXIudG9nZ2xlZCk7XG5cdFx0Y29uc3QgdGl0bGViYXJWaXNpYmxlID0gdGhpcy5pc1Zpc2libGUoUGFydHMuVElUTEVCQVJfUEFSVCk7XG5cdFx0aWYgKHNob3VsZFNob3dUaXRsZUJhciAhPT0gdGl0bGViYXJWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy50aXRsZUJhclBhcnRWaWV3LCBzaG91bGRTaG93VGl0bGVCYXIpO1xuXHRcdH1cblx0fVxuXG5cdHRvZ2dsZU1lbnVCYXIoKTogdm9pZCB7XG5cdFx0bGV0IGN1cnJlbnRWaXNpYmlsaXR5VmFsdWUgPSBnZXRNZW51QmFyVmlzaWJpbGl0eSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAodHlwZW9mIGN1cnJlbnRWaXNpYmlsaXR5VmFsdWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjdXJyZW50VmlzaWJpbGl0eVZhbHVlID0gJ2NsYXNzaWMnO1xuXHRcdH1cblxuXHRcdGxldCBuZXdWaXNpYmlsaXR5VmFsdWU6IHN0cmluZztcblx0XHRpZiAoY3VycmVudFZpc2liaWxpdHlWYWx1ZSA9PT0gJ3Zpc2libGUnIHx8IGN1cnJlbnRWaXNpYmlsaXR5VmFsdWUgPT09ICdjbGFzc2ljJykge1xuXHRcdFx0bmV3VmlzaWJpbGl0eVZhbHVlID0gaGFzTmF0aXZlTWVudSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSA/ICd0b2dnbGUnIDogJ2NvbXBhY3QnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRuZXdWaXNpYmlsaXR5VmFsdWUgPSAnY2xhc3NpYyc7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShNZW51U2V0dGluZ3MuTWVudUJhclZpc2liaWxpdHksIG5ld1Zpc2liaWxpdHlWYWx1ZSk7XG5cdH1cblxuXHRnZXRQYW5lbFBvc2l0aW9uKCk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfUE9TSVRJT04pO1xuXHR9XG5cblx0c2V0UGFuZWxQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpKSB7XG5cdFx0XHR0aGlzLnNldFBhbmVsSGlkZGVuKGZhbHNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYW5lbFBhcnQgPSB0aGlzLmdldFBhcnQoUGFydHMuUEFORUxfUEFSVCk7XG5cdFx0Y29uc3Qgb2xkUG9zaXRpb25WYWx1ZSA9IHBvc2l0aW9uVG9TdHJpbmcodGhpcy5nZXRQYW5lbFBvc2l0aW9uKCkpO1xuXHRcdGNvbnN0IG5ld1Bvc2l0aW9uVmFsdWUgPSBwb3NpdGlvblRvU3RyaW5nKHBvc2l0aW9uKTtcblxuXHRcdC8vIEFkanVzdCBDU1Ncblx0XHRjb25zdCBwYW5lbENvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHBhbmVsUGFydC5nZXRDb250YWluZXIoKSk7XG5cdFx0cGFuZWxDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShvbGRQb3NpdGlvblZhbHVlKTtcblx0XHRwYW5lbENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKG5ld1Bvc2l0aW9uVmFsdWUpO1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKGBwYW5lbC1wb3NpdGlvbi0ke29sZFBvc2l0aW9uVmFsdWV9YCk7XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoYHBhbmVsLXBvc2l0aW9uLSR7bmV3UG9zaXRpb25WYWx1ZX1gKTtcblxuXHRcdC8vIFVwZGF0ZSBTdHlsZXNcblx0XHRwYW5lbFBhcnQudXBkYXRlU3R5bGVzKCk7XG5cblx0XHQvLyBMYXlvdXRcblx0XHRjb25zdCBzaXplID0gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMucGFuZWxQYXJ0Vmlldyk7XG5cdFx0Y29uc3Qgc2lkZUJhclNpemUgPSB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5zaWRlQmFyUGFydFZpZXcpO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclNpemUgPSB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldyk7XG5cblx0XHRsZXQgZWRpdG9ySGlkZGVuID0gIXRoaXMuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KTtcblxuXHRcdC8vIFNhdmUgbGFzdCBub24tbWF4aW1pemVkIHNpemUgZm9yIHBhbmVsIGJlZm9yZSBtb3ZlXG5cdFx0aWYgKG5ld1Bvc2l0aW9uVmFsdWUgIT09IG9sZFBvc2l0aW9uVmFsdWUgJiYgIWVkaXRvckhpZGRlbikge1xuXG5cdFx0XHQvLyBTYXZlIHRoZSBjdXJyZW50IHNpemUgb2YgdGhlIHBhbmVsIGZvciB0aGUgbmV3IG9ydGhvZ29uYWwgZGlyZWN0aW9uXG5cdFx0XHQvLyBJZiBtb3ZpbmcgZG93biwgc2F2ZSB0aGUgd2lkdGggb2YgdGhlIHBhbmVsXG5cdFx0XHQvLyBPdGhlcndpc2UsIHNhdmUgdGhlIGhlaWdodCBvZiB0aGUgcGFuZWxcblx0XHRcdGlmIChpc0hvcml6b250YWwocG9zaXRpb24pKSB7XG5cdFx0XHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0xBU1RfTk9OX01BWElNSVpFRF9XSURUSCwgc2l6ZS53aWR0aCk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzSG9yaXpvbnRhbChwb3NpdGlvbkZyb21TdHJpbmcob2xkUG9zaXRpb25WYWx1ZSkpKSB7XG5cdFx0XHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0xBU1RfTk9OX01BWElNSVpFRF9IRUlHSFQsIHNpemUuaGVpZ2h0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaXNIb3Jpem9udGFsKHBvc2l0aW9uKSAmJiB0aGlzLmdldFBhbmVsQWxpZ25tZW50KCkgIT09ICdjZW50ZXInICYmIGVkaXRvckhpZGRlbikge1xuXHRcdFx0dGhpcy50b2dnbGVNYXhpbWl6ZWRQYW5lbCgpO1xuXHRcdFx0ZWRpdG9ySGlkZGVuID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfUE9TSVRJT04sIHBvc2l0aW9uKTtcblxuXHRcdGNvbnN0IHNpZGVCYXJWaXNpYmxlID0gdGhpcy5pc1Zpc2libGUoUGFydHMuU0lERUJBUl9QQVJUKTtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJWaXNpYmxlID0gdGhpcy5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXG5cdFx0Y29uc3QgaGFkRm9jdXMgPSB0aGlzLmhhc0ZvY3VzKFBhcnRzLlBBTkVMX1BBUlQpO1xuXG5cdFx0aWYgKHBvc2l0aW9uID09PSBQb3NpdGlvbi5CT1RUT00pIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlldyh0aGlzLnBhbmVsUGFydFZpZXcsIGVkaXRvckhpZGRlbiA/IHNpemUuaGVpZ2h0IDogdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfTEFTVF9OT05fTUFYSU1JWkVEX0hFSUdIVCksIHRoaXMuZWRpdG9yUGFydFZpZXcsIERpcmVjdGlvbi5Eb3duKTtcblx0XHR9IGVsc2UgaWYgKHBvc2l0aW9uID09PSBQb3NpdGlvbi5UT1ApIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlldyh0aGlzLnBhbmVsUGFydFZpZXcsIGVkaXRvckhpZGRlbiA/IHNpemUuaGVpZ2h0IDogdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfTEFTVF9OT05fTUFYSU1JWkVEX0hFSUdIVCksIHRoaXMuZWRpdG9yUGFydFZpZXcsIERpcmVjdGlvbi5VcCk7XG5cdFx0fSBlbHNlIGlmIChwb3NpdGlvbiA9PT0gUG9zaXRpb24uUklHSFQpIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlldyh0aGlzLnBhbmVsUGFydFZpZXcsIGVkaXRvckhpZGRlbiA/IHNpemUud2lkdGggOiB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9MQVNUX05PTl9NQVhJTUlaRURfV0lEVEgpLCB0aGlzLmVkaXRvclBhcnRWaWV3LCBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQubW92ZVZpZXcodGhpcy5wYW5lbFBhcnRWaWV3LCBlZGl0b3JIaWRkZW4gPyBzaXplLndpZHRoIDogdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfTEFTVF9OT05fTUFYSU1JWkVEX1dJRFRIKSwgdGhpcy5lZGl0b3JQYXJ0VmlldywgRGlyZWN0aW9uLkxlZnQpO1xuXHRcdH1cblxuXHRcdGlmIChoYWRGb2N1cykge1xuXHRcdFx0dGhpcy5mb2N1c1BhcnQoUGFydHMuUEFORUxfUEFSVCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzZXQgc2lkZWJhciB0byBvcmlnaW5hbCBzaXplIGJlZm9yZSBzaGlmdGluZyB0aGUgcGFuZWxcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLnNpZGVCYXJQYXJ0Vmlldywgc2lkZUJhclNpemUpO1xuXHRcdGlmICghc2lkZUJhclZpc2libGUpIHtcblx0XHRcdHRoaXMuc2V0U2lkZUJhckhpZGRlbih0cnVlKTtcblx0XHR9XG5cblx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3LCBhdXhpbGlhcnlCYXJTaXplKTtcblx0XHRpZiAoIWF1eGlsaWFyeUJhclZpc2libGUpIHtcblx0XHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFySGlkZGVuKHRydWUpO1xuXHRcdH1cblxuXHRcdGlmIChpc0hvcml6b250YWwocG9zaXRpb24pKSB7XG5cdFx0XHR0aGlzLmFkanVzdFBhcnRQb3NpdGlvbnModGhpcy5nZXRTaWRlQmFyUG9zaXRpb24oKSwgdGhpcy5nZXRQYW5lbEFsaWdubWVudCgpLCBwb3NpdGlvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQYW5lbFBvc2l0aW9uLmZpcmUobmV3UG9zaXRpb25WYWx1ZSk7XG5cdH1cblxuXHRpc1dpbmRvd01heGltaXplZCh0YXJnZXRXaW5kb3c6IFdpbmRvdyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0YXRlLnJ1bnRpbWUubWF4aW1pemVkLmhhcyhnZXRXaW5kb3dJZCh0YXJnZXRXaW5kb3cpKTtcblx0fVxuXG5cdHVwZGF0ZVdpbmRvd01heGltaXplZFN0YXRlKHRhcmdldFdpbmRvdzogV2luZG93LCBtYXhpbWl6ZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShMYXlvdXRDbGFzc2VzLk1BWElNSVpFRCwgbWF4aW1pemVkKTtcblxuXHRcdGNvbnN0IHRhcmdldFdpbmRvd0lkID0gZ2V0V2luZG93SWQodGFyZ2V0V2luZG93KTtcblx0XHRpZiAobWF4aW1pemVkID09PSB0aGlzLnN0YXRlLnJ1bnRpbWUubWF4aW1pemVkLmhhcyh0YXJnZXRXaW5kb3dJZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAobWF4aW1pemVkKSB7XG5cdFx0XHR0aGlzLnN0YXRlLnJ1bnRpbWUubWF4aW1pemVkLmFkZCh0YXJnZXRXaW5kb3dJZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RhdGUucnVudGltZS5tYXhpbWl6ZWQuZGVsZXRlKHRhcmdldFdpbmRvd0lkKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVdpbmRvd0JvcmRlcigpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlV2luZG93TWF4aW1pemVkLmZpcmUoeyB3aW5kb3dJZDogdGFyZ2V0V2luZG93SWQsIG1heGltaXplZCB9KTtcblx0fVxuXG5cdGdldFZpc2libGVOZWlnaGJvclBhcnQocGFydDogUGFydHMsIGRpcmVjdGlvbjogRGlyZWN0aW9uKTogUGFydHMgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy53b3JrYmVuY2hHcmlkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5pc1Zpc2libGUocGFydCwgbWFpbldpbmRvdykpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmVpZ2hib3JWaWV3cyA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXROZWlnaGJvclZpZXdzKHRoaXMuZ2V0UGFydChwYXJ0KSwgZGlyZWN0aW9uLCBmYWxzZSk7XG5cblx0XHRpZiAoIW5laWdoYm9yVmlld3MpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBuZWlnaGJvclZpZXcgb2YgbmVpZ2hib3JWaWV3cykge1xuXHRcdFx0Y29uc3QgbmVpZ2hib3JQYXJ0ID1cblx0XHRcdFx0W1BhcnRzLkFDVElWSVRZQkFSX1BBUlQsIFBhcnRzLkVESVRPUl9QQVJULCBQYXJ0cy5QQU5FTF9QQVJULCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgUGFydHMuU0lERUJBUl9QQVJULCBQYXJ0cy5TVEFUVVNCQVJfUEFSVCwgUGFydHMuVElUTEVCQVJfUEFSVF1cblx0XHRcdFx0XHQuZmluZChwYXJ0SWQgPT4gdGhpcy5nZXRQYXJ0KHBhcnRJZCkgPT09IG5laWdoYm9yVmlldyAmJiB0aGlzLmlzVmlzaWJsZShwYXJ0SWQsIG1haW5XaW5kb3cpKTtcblxuXHRcdFx0aWYgKG5laWdoYm9yUGFydCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBuZWlnaGJvclBhcnQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VXQ08oKTogdm9pZCB7XG5cdFx0Y29uc3QgYmFubmVyRmlyc3QgPSB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh0aGlzLnRpdGxlQmFyUGFydFZpZXcsIERpcmVjdGlvbi5VcCwgZmFsc2UpLmxlbmd0aCA+IDA7XG5cdFx0Y29uc3Qgc2hvdWxkQmFubmVyQmVGaXJzdCA9IHRoaXMuc2hvdWxkU2hvd0Jhbm5lckZpcnN0KCk7XG5cblx0XHRpZiAoYmFubmVyRmlyc3QgIT09IHNob3VsZEJhbm5lckJlRmlyc3QpIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlldyh0aGlzLmJhbm5lclBhcnRWaWV3LCBTaXppbmcuRGlzdHJpYnV0ZSwgdGhpcy50aXRsZUJhclBhcnRWaWV3LCBzaG91bGRCYW5uZXJCZUZpcnN0ID8gRGlyZWN0aW9uLlVwIDogRGlyZWN0aW9uLkRvd24pO1xuXHRcdH1cblxuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLnRpdGxlQmFyUGFydFZpZXcsIHNob3VsZFNob3dDdXN0b21UaXRsZUJhcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtYWluV2luZG93LCB0aGlzLnN0YXRlLnJ1bnRpbWUubWVudUJhci50b2dnbGVkKSk7XG5cdH1cblxuXHRwcml2YXRlIGFycmFuZ2VFZGl0b3JOb2Rlcyhub2RlczogeyBlZGl0b3I6IElTZXJpYWxpemVkTm9kZTsgc2lkZUJhcj86IElTZXJpYWxpemVkTm9kZTsgYXV4aWxpYXJ5QmFyPzogSVNlcmlhbGl6ZWROb2RlIH0sIGF2YWlsYWJsZUhlaWdodDogbnVtYmVyLCBhdmFpbGFibGVXaWR0aDogbnVtYmVyKTogSVNlcmlhbGl6ZWROb2RlIHtcblx0XHRpZiAoIW5vZGVzLnNpZGVCYXIgJiYgIW5vZGVzLmF1eGlsaWFyeUJhcikge1xuXHRcdFx0bm9kZXMuZWRpdG9yLnNpemUgPSBhdmFpbGFibGVIZWlnaHQ7XG5cdFx0XHRyZXR1cm4gbm9kZXMuZWRpdG9yO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IFtub2Rlcy5lZGl0b3JdO1xuXHRcdG5vZGVzLmVkaXRvci5zaXplID0gYXZhaWxhYmxlV2lkdGg7XG5cdFx0aWYgKG5vZGVzLnNpZGVCYXIpIHtcblx0XHRcdGlmICh0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX1BPU0lUT04pID09PSBQb3NpdGlvbi5MRUZUKSB7XG5cdFx0XHRcdHJlc3VsdC5zcGxpY2UoMCwgMCwgbm9kZXMuc2lkZUJhcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQucHVzaChub2Rlcy5zaWRlQmFyKTtcblx0XHRcdH1cblxuXHRcdFx0bm9kZXMuZWRpdG9yLnNpemUgLT0gdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9ISURERU4pID8gMCA6IG5vZGVzLnNpZGVCYXIuc2l6ZTtcblx0XHR9XG5cblx0XHRpZiAobm9kZXMuYXV4aWxpYXJ5QmFyKSB7XG5cdFx0XHRpZiAodGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9QT1NJVE9OKSA9PT0gUG9zaXRpb24uUklHSFQpIHtcblx0XHRcdFx0cmVzdWx0LnNwbGljZSgwLCAwLCBub2Rlcy5hdXhpbGlhcnlCYXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobm9kZXMuYXV4aWxpYXJ5QmFyKTtcblx0XHRcdH1cblxuXHRcdFx0bm9kZXMuZWRpdG9yLnNpemUgLT0gdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX0hJRERFTikgPyAwIDogbm9kZXMuYXV4aWxpYXJ5QmFyLnNpemU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0ZGF0YTogcmVzdWx0LFxuXHRcdFx0c2l6ZTogYXZhaWxhYmxlSGVpZ2h0LFxuXHRcdFx0dmlzaWJsZTogcmVzdWx0LnNvbWUobm9kZSA9PiBub2RlLnZpc2libGUpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXJyYW5nZU1pZGRsZVNlY3Rpb25Ob2Rlcyhub2RlczogeyBlZGl0b3I6IElTZXJpYWxpemVkTm9kZTsgcGFuZWw6IElTZXJpYWxpemVkTm9kZTsgYWN0aXZpdHlCYXI6IElTZXJpYWxpemVkTm9kZTsgc2lkZUJhcjogSVNlcmlhbGl6ZWROb2RlOyBhdXhpbGlhcnlCYXI6IElTZXJpYWxpemVkTm9kZSB9LCBhdmFpbGFibGVXaWR0aDogbnVtYmVyLCBhdmFpbGFibGVIZWlnaHQ6IG51bWJlcik6IElTZXJpYWxpemVkTm9kZVtdIHtcblx0XHRjb25zdCBhY3Rpdml0eUJhclNpemUgPSB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5BQ1RJVklUWUJBUl9ISURERU4pID8gMCA6IG5vZGVzLmFjdGl2aXR5QmFyLnNpemU7XG5cdFx0Y29uc3Qgc2lkZUJhclNpemUgPSB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX0hJRERFTikgPyAwIDogbm9kZXMuc2lkZUJhci5zaXplO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclNpemUgPSB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfSElEREVOKSA/IDAgOiBub2Rlcy5hdXhpbGlhcnlCYXIuc2l6ZTtcblx0XHRjb25zdCBwYW5lbFNpemUgPSB0aGlzLnN0YXRlTW9kZWwuZ2V0SW5pdGlhbGl6YXRpb25WYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfU0laRSkgPyAwIDogbm9kZXMucGFuZWwuc2l6ZTtcblxuXHRcdGNvbnN0IHBhbmVsUG9zdGlvbiA9IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX1BPU0lUSU9OKTtcblx0XHRjb25zdCBzaWRlQmFyUG9zaXRpb24gPSB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX1BPU0lUT04pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gW10gYXMgSVNlcmlhbGl6ZWROb2RlW107XG5cdFx0aWYgKCFpc0hvcml6b250YWwocGFuZWxQb3N0aW9uKSkge1xuXHRcdFx0cmVzdWx0LnB1c2gobm9kZXMuZWRpdG9yKTtcblx0XHRcdG5vZGVzLmVkaXRvci5zaXplID0gYXZhaWxhYmxlV2lkdGggLSBhY3Rpdml0eUJhclNpemUgLSBzaWRlQmFyU2l6ZSAtIHBhbmVsU2l6ZSAtIGF1eGlsaWFyeUJhclNpemU7XG5cdFx0XHRpZiAocGFuZWxQb3N0aW9uID09PSBQb3NpdGlvbi5SSUdIVCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChub2Rlcy5wYW5lbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQuc3BsaWNlKDAsIDAsIG5vZGVzLnBhbmVsKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNpZGVCYXJQb3NpdGlvbiA9PT0gUG9zaXRpb24uTEVGVCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChub2Rlcy5hdXhpbGlhcnlCYXIpO1xuXHRcdFx0XHRyZXN1bHQuc3BsaWNlKDAsIDAsIG5vZGVzLnNpZGVCYXIpO1xuXHRcdFx0XHRyZXN1bHQuc3BsaWNlKDAsIDAsIG5vZGVzLmFjdGl2aXR5QmFyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC5zcGxpY2UoMCwgMCwgbm9kZXMuYXV4aWxpYXJ5QmFyKTtcblx0XHRcdFx0cmVzdWx0LnB1c2gobm9kZXMuc2lkZUJhcik7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5vZGVzLmFjdGl2aXR5QmFyKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcGFuZWxBbGlnbm1lbnQgPSB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9BTElHTk1FTlQpO1xuXHRcdFx0Y29uc3Qgc2lkZUJhck5leHRUb0VkaXRvciA9ICEocGFuZWxBbGlnbm1lbnQgPT09ICdjZW50ZXInIHx8IChzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQgJiYgcGFuZWxBbGlnbm1lbnQgPT09ICdyaWdodCcpIHx8IChzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLlJJR0hUICYmIHBhbmVsQWxpZ25tZW50ID09PSAnbGVmdCcpKTtcblx0XHRcdGNvbnN0IGF1eGlsaWFyeUJhck5leHRUb0VkaXRvciA9ICEocGFuZWxBbGlnbm1lbnQgPT09ICdjZW50ZXInIHx8IChzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLlJJR0hUICYmIHBhbmVsQWxpZ25tZW50ID09PSAncmlnaHQnKSB8fCAoc2lkZUJhclBvc2l0aW9uID09PSBQb3NpdGlvbi5MRUZUICYmIHBhbmVsQWxpZ25tZW50ID09PSAnbGVmdCcpKTtcblxuXHRcdFx0Y29uc3QgZWRpdG9yU2VjdGlvbldpZHRoID0gYXZhaWxhYmxlV2lkdGggLSBhY3Rpdml0eUJhclNpemUgLSAoc2lkZUJhck5leHRUb0VkaXRvciA/IDAgOiBzaWRlQmFyU2l6ZSkgLSAoYXV4aWxpYXJ5QmFyTmV4dFRvRWRpdG9yID8gMCA6IGF1eGlsaWFyeUJhclNpemUpO1xuXG5cdFx0XHRjb25zdCBlZGl0b3JOb2RlcyA9IHRoaXMuYXJyYW5nZUVkaXRvck5vZGVzKHtcblx0XHRcdFx0ZWRpdG9yOiBub2Rlcy5lZGl0b3IsXG5cdFx0XHRcdHNpZGVCYXI6IHNpZGVCYXJOZXh0VG9FZGl0b3IgPyBub2Rlcy5zaWRlQmFyIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRhdXhpbGlhcnlCYXI6IGF1eGlsaWFyeUJhck5leHRUb0VkaXRvciA/IG5vZGVzLmF1eGlsaWFyeUJhciA6IHVuZGVmaW5lZFxuXHRcdFx0fSwgYXZhaWxhYmxlSGVpZ2h0IC0gcGFuZWxTaXplLCBlZGl0b3JTZWN0aW9uV2lkdGgpO1xuXG5cdFx0XHRjb25zdCBkYXRhID0gcGFuZWxQb3N0aW9uID09PSBQb3NpdGlvbi5CT1RUT00gPyBbZWRpdG9yTm9kZXMsIG5vZGVzLnBhbmVsXSA6IFtub2Rlcy5wYW5lbCwgZWRpdG9yTm9kZXNdO1xuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHR0eXBlOiAnYnJhbmNoJyxcblx0XHRcdFx0ZGF0YSxcblx0XHRcdFx0c2l6ZTogZWRpdG9yU2VjdGlvbldpZHRoLFxuXHRcdFx0XHR2aXNpYmxlOiBkYXRhLnNvbWUobm9kZSA9PiBub2RlLnZpc2libGUpXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCFzaWRlQmFyTmV4dFRvRWRpdG9yKSB7XG5cdFx0XHRcdGlmIChzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQpIHtcblx0XHRcdFx0XHRyZXN1bHQuc3BsaWNlKDAsIDAsIG5vZGVzLnNpZGVCYXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKG5vZGVzLnNpZGVCYXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghYXV4aWxpYXJ5QmFyTmV4dFRvRWRpdG9yKSB7XG5cdFx0XHRcdGlmIChzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLlJJR0hUKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnNwbGljZSgwLCAwLCBub2Rlcy5hdXhpbGlhcnlCYXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKG5vZGVzLmF1eGlsaWFyeUJhcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHNpZGVCYXJQb3NpdGlvbiA9PT0gUG9zaXRpb24uTEVGVCkge1xuXHRcdFx0XHRyZXN1bHQuc3BsaWNlKDAsIDAsIG5vZGVzLmFjdGl2aXR5QmFyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5vZGVzLmFjdGl2aXR5QmFyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVHcmlkRGVzY3JpcHRvcigpOiBJU2VyaWFsaXplZEdyaWQge1xuXHRcdGNvbnN0IHsgd2lkdGgsIGhlaWdodCB9ID0gdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbjtcblx0XHRjb25zdCBzaWRlQmFyU2l6ZSA9IHRoaXMuc3RhdGVNb2RlbC5nZXRJbml0aWFsaXphdGlvblZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX1NJWkUpO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclNpemUgPSB0aGlzLnN0YXRlTW9kZWwuZ2V0SW5pdGlhbGl6YXRpb25WYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX1NJWkUpO1xuXHRcdGNvbnN0IHBhbmVsU2l6ZSA9IHRoaXMuc3RhdGVNb2RlbC5nZXRJbml0aWFsaXphdGlvblZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9TSVpFKTtcblxuXHRcdGNvbnN0IHRpdGxlQmFySGVpZ2h0ID0gdGhpcy50aXRsZUJhclBhcnRWaWV3Lm1pbmltdW1IZWlnaHQ7XG5cdFx0Y29uc3QgYmFubmVySGVpZ2h0ID0gdGhpcy5iYW5uZXJQYXJ0Vmlldy5taW5pbXVtSGVpZ2h0O1xuXHRcdGNvbnN0IHN0YXR1c0JhckhlaWdodCA9IHRoaXMuc3RhdHVzQmFyUGFydFZpZXcubWluaW11bUhlaWdodDtcblx0XHRjb25zdCBhY3Rpdml0eUJhcldpZHRoID0gdGhpcy5hY3Rpdml0eUJhclBhcnRWaWV3Lm1pbmltdW1XaWR0aDtcblx0XHRjb25zdCBtaWRkbGVTZWN0aW9uSGVpZ2h0ID0gaGVpZ2h0IC0gdGl0bGVCYXJIZWlnaHQgLSBzdGF0dXNCYXJIZWlnaHQ7XG5cblx0XHRjb25zdCB0aXRsZUFuZEJhbm5lcjogSVNlcmlhbGl6ZWROb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdFx0ZGF0YTogeyB0eXBlOiBQYXJ0cy5USVRMRUJBUl9QQVJUIH0sXG5cdFx0XHRcdHNpemU6IHRpdGxlQmFySGVpZ2h0LFxuXHRcdFx0XHR2aXNpYmxlOiB0aGlzLmlzVmlzaWJsZShQYXJ0cy5USVRMRUJBUl9QQVJULCBtYWluV2luZG93KVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2xlYWYnLFxuXHRcdFx0XHRkYXRhOiB7IHR5cGU6IFBhcnRzLkJBTk5FUl9QQVJUIH0sXG5cdFx0XHRcdHNpemU6IGJhbm5lckhlaWdodCxcblx0XHRcdFx0dmlzaWJsZTogZmFsc2Vcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0aXZpdHlCYXJOb2RlOiBJU2VyaWFsaXplZExlYWZOb2RlID0ge1xuXHRcdFx0dHlwZTogJ2xlYWYnLFxuXHRcdFx0ZGF0YTogeyB0eXBlOiBQYXJ0cy5BQ1RJVklUWUJBUl9QQVJUIH0sXG5cdFx0XHRzaXplOiBhY3Rpdml0eUJhcldpZHRoLFxuXHRcdFx0dmlzaWJsZTogIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFDVElWSVRZQkFSX0hJRERFTilcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2lkZUJhck5vZGU6IElTZXJpYWxpemVkTGVhZk5vZGUgPSB7XG5cdFx0XHR0eXBlOiAnbGVhZicsXG5cdFx0XHRkYXRhOiB7IHR5cGU6IFBhcnRzLlNJREVCQVJfUEFSVCB9LFxuXHRcdFx0c2l6ZTogc2lkZUJhclNpemUsXG5cdFx0XHR2aXNpYmxlOiAhdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9ISURERU4pXG5cdFx0fTtcblxuXHRcdGNvbnN0IGF1eGlsaWFyeUJhck5vZGU6IElTZXJpYWxpemVkTGVhZk5vZGUgPSB7XG5cdFx0XHR0eXBlOiAnbGVhZicsXG5cdFx0XHRkYXRhOiB7IHR5cGU6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUIH0sXG5cdFx0XHRzaXplOiBhdXhpbGlhcnlCYXJTaXplLFxuXHRcdFx0dmlzaWJsZTogdGhpcy5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpXG5cdFx0fTtcblxuXHRcdGNvbnN0IGVkaXRvck5vZGU6IElTZXJpYWxpemVkTGVhZk5vZGUgPSB7XG5cdFx0XHR0eXBlOiAnbGVhZicsXG5cdFx0XHRkYXRhOiB7IHR5cGU6IFBhcnRzLkVESVRPUl9QQVJUIH0sXG5cdFx0XHRzaXplOiAwLCAvLyBVcGRhdGUgYmFzZWQgb24gc2libGluZyBzaXplc1xuXHRcdFx0dmlzaWJsZTogIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkVESVRPUl9ISURERU4pXG5cdFx0fTtcblxuXHRcdGNvbnN0IHBhbmVsTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuUEFORUxfUEFSVCB9LFxuXHRcdFx0c2l6ZTogcGFuZWxTaXplLFxuXHRcdFx0dmlzaWJsZTogIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0hJRERFTilcblx0XHR9O1xuXG5cdFx0Y29uc3QgbWlkZGxlU2VjdGlvbjogSVNlcmlhbGl6ZWROb2RlW10gPSB0aGlzLmFycmFuZ2VNaWRkbGVTZWN0aW9uTm9kZXMoe1xuXHRcdFx0YWN0aXZpdHlCYXI6IGFjdGl2aXR5QmFyTm9kZSxcblx0XHRcdGF1eGlsaWFyeUJhcjogYXV4aWxpYXJ5QmFyTm9kZSxcblx0XHRcdGVkaXRvcjogZWRpdG9yTm9kZSxcblx0XHRcdHBhbmVsOiBwYW5lbE5vZGUsXG5cdFx0XHRzaWRlQmFyOiBzaWRlQmFyTm9kZVxuXHRcdH0sIHdpZHRoLCBtaWRkbGVTZWN0aW9uSGVpZ2h0KTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSVNlcmlhbGl6ZWRHcmlkID0ge1xuXHRcdFx0cm9vdDoge1xuXHRcdFx0XHR0eXBlOiAnYnJhbmNoJyxcblx0XHRcdFx0c2l6ZTogd2lkdGgsXG5cdFx0XHRcdGRhdGE6IFtcblx0XHRcdFx0XHQuLi4odGhpcy5zaG91bGRTaG93QmFubmVyRmlyc3QoKSA/IHRpdGxlQW5kQmFubmVyLnJldmVyc2UoKSA6IHRpdGxlQW5kQmFubmVyKSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYnJhbmNoJyxcblx0XHRcdFx0XHRcdGRhdGE6IG1pZGRsZVNlY3Rpb24sXG5cdFx0XHRcdFx0XHRzaXplOiBtaWRkbGVTZWN0aW9uSGVpZ2h0XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbGVhZicsXG5cdFx0XHRcdFx0XHRkYXRhOiB7IHR5cGU6IFBhcnRzLlNUQVRVU0JBUl9QQVJUIH0sXG5cdFx0XHRcdFx0XHRzaXplOiBzdGF0dXNCYXJIZWlnaHQsXG5cdFx0XHRcdFx0XHR2aXNpYmxlOiAhdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuU1RBVFVTQkFSX0hJRERFTilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHRvcmllbnRhdGlvbjogT3JpZW50YXRpb24uVkVSVElDQUwsXG5cdFx0XHR3aWR0aCxcblx0XHRcdGhlaWdodFxuXHRcdH07XG5cblx0XHR0eXBlIFN0YXJ0dXBMYXlvdXRFdmVudCA9IHtcblx0XHRcdGFjdGl2aXR5QmFyVmlzaWJsZTogYm9vbGVhbjtcblx0XHRcdHNpZGVCYXJWaXNpYmxlOiBib29sZWFuO1xuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogYm9vbGVhbjtcblx0XHRcdHBhbmVsVmlzaWJsZTogYm9vbGVhbjtcblx0XHRcdHN0YXR1c2JhclZpc2libGU6IGJvb2xlYW47XG5cdFx0XHRzaWRlQmFyUG9zaXRpb246IHN0cmluZztcblx0XHRcdHBhbmVsUG9zaXRpb246IHN0cmluZztcblx0XHR9O1xuXG5cdFx0dHlwZSBTdGFydHVwTGF5b3V0RXZlbnRDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnYmVuaWJlbmonO1xuXHRcdFx0Y29tbWVudDogJ0luZm9ybWF0aW9uIGFib3V0IHRoZSBsYXlvdXQgb2YgdGhlIHdvcmtiZW5jaCBkdXJpbmcgc3RhdHVwJztcblx0XHRcdGFjdGl2aXR5QmFyVmlzaWJsZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgb3IgdGhlIG5vdCB0aGUgYWN0aXZpdHkgYmFyIGlzIHZpc2libGUnIH07XG5cdFx0XHRzaWRlQmFyVmlzaWJsZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgb3IgdGhlIG5vdCB0aGUgcHJpbWFyeSBzaWRlIGJhciBpcyB2aXNpYmxlJyB9O1xuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgb3IgdGhlIG5vdCB0aGUgc2Vjb25kYXJ5IHNpZGUgYmFyIGlzIHZpc2libGUnIH07XG5cdFx0XHRwYW5lbFZpc2libGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIG9yIHRoZSBub3QgdGhlIHBhbmVsIGlzIHZpc2libGUnIH07XG5cdFx0XHRzdGF0dXNiYXJWaXNpYmxlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBvciB0aGUgbm90IHRoZSBzdGF0dXMgYmFyIGlzIHZpc2libGUnIH07XG5cdFx0XHRzaWRlQmFyUG9zaXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBwcmltYXJ5IHNpZGUgYmFyIGlzIG9uIHRoZSBsZWZ0IG9yIHJpZ2h0JyB9O1xuXHRcdFx0cGFuZWxQb3NpdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIHBhbmVsIGlzIG9uIHRoZSB0b3AsIGJvdHRvbSwgbGVmdCwgb3IgcmlnaHQnIH07XG5cdFx0fTtcblxuXHRcdGNvbnN0IGxheW91dERlc2NyaXB0b3I6IFN0YXJ0dXBMYXlvdXRFdmVudCA9IHtcblx0XHRcdGFjdGl2aXR5QmFyVmlzaWJsZTogIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFDVElWSVRZQkFSX0hJRERFTiksXG5cdFx0XHRzaWRlQmFyVmlzaWJsZTogIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfSElEREVOKSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6ICF0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfSElEREVOKSxcblx0XHRcdHBhbmVsVmlzaWJsZTogIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0hJRERFTiksXG5cdFx0XHRzdGF0dXNiYXJWaXNpYmxlOiAhdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuU1RBVFVTQkFSX0hJRERFTiksXG5cdFx0XHRzaWRlQmFyUG9zaXRpb246IHBvc2l0aW9uVG9TdHJpbmcodGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9QT1NJVE9OKSksXG5cdFx0XHRwYW5lbFBvc2l0aW9uOiBwb3NpdGlvblRvU3RyaW5nKHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX1BPU0lUSU9OKSksXG5cdFx0fTtcblxuXHRcdC8vIFdBUk5JTkc6IERvIG5vdCByZW1vdmUgdGhpcyBldmVudCwgaXQncyB1c2VkIHRvIHRyYWNrIGJ1aWxkIHJvbGxvdXQgcHJvZ3Jlc3Ncblx0XHQvLyBUYWxrIHRvIEBqb2FvbW9yZW5vLCBAbHN6b21vcnUgb3IgQGpydWFsZXMgYmVmb3JlIGRvaW5nIHNvXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8U3RhcnR1cExheW91dEV2ZW50LCBTdGFydHVwTGF5b3V0RXZlbnRDbGFzc2lmaWNhdGlvbj4oJ3N0YXJ0dXBMYXlvdXQnLCBsYXlvdXREZXNjcmlwdG9yKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuZGlzcG9zZWQgPSB0cnVlO1xuXHR9XG59XG5cbnR5cGUgWmVuTW9kZUNvbmZpZ3VyYXRpb24gPSB7XG5cdGNlbnRlckxheW91dDogYm9vbGVhbjtcblx0ZnVsbFNjcmVlbjogYm9vbGVhbjtcblx0aGlkZUFjdGl2aXR5QmFyOiBib29sZWFuO1xuXHRoaWRlTGluZU51bWJlcnM6IGJvb2xlYW47XG5cdGhpZGVTdGF0dXNCYXI6IGJvb2xlYW47XG5cdHNob3dUYWJzOiAnbXVsdGlwbGUnIHwgJ3NpbmdsZScgfCAnbm9uZSc7XG5cdHJlc3RvcmU6IGJvb2xlYW47XG5cdHNpbGVudE5vdGlmaWNhdGlvbnM6IGJvb2xlYW47XG59O1xuXG5mdW5jdGlvbiBnZXRaZW5Nb2RlQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogWmVuTW9kZUNvbmZpZ3VyYXRpb24ge1xuXHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8WmVuTW9kZUNvbmZpZ3VyYXRpb24+KFdvcmtiZW5jaExheW91dFNldHRpbmdzLlpFTl9NT0RFX0NPTkZJRyk7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gTGF5b3V0IFN0YXRlIE1vZGVsXG5cbmludGVyZmFjZSBJV29ya2JlbmNoTGF5b3V0U3RhdGVLZXkge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJ1bnRpbWU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGRlZmF1bHRWYWx1ZTogdW5rbm93bjtcblx0cmVhZG9ubHkgc2NvcGU6IFN0b3JhZ2VTY29wZTtcblx0cmVhZG9ubHkgdGFyZ2V0OiBTdG9yYWdlVGFyZ2V0O1xuXHRyZWFkb25seSB6ZW5Nb2RlSWdub3JlPzogYm9vbGVhbjtcbn1cblxudHlwZSBTdG9yYWdlS2V5VHlwZSA9IHN0cmluZyB8IGJvb2xlYW4gfCBudW1iZXIgfCBvYmplY3Q7XG5cbmFic3RyYWN0IGNsYXNzIFdvcmtiZW5jaExheW91dFN0YXRlS2V5PFQgZXh0ZW5kcyBTdG9yYWdlS2V5VHlwZT4gaW1wbGVtZW50cyBJV29ya2JlbmNoTGF5b3V0U3RhdGVLZXkge1xuXG5cdGFic3RyYWN0IHJlYWRvbmx5IHJ1bnRpbWU6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgbmFtZTogc3RyaW5nLCByZWFkb25seSBzY29wZTogU3RvcmFnZVNjb3BlLCByZWFkb25seSB0YXJnZXQ6IFN0b3JhZ2VUYXJnZXQsIHB1YmxpYyBkZWZhdWx0VmFsdWU6IFQpIHsgfVxufVxuXG5jbGFzcyBSdW50aW1lU3RhdGVLZXk8VCBleHRlbmRzIFN0b3JhZ2VLZXlUeXBlPiBleHRlbmRzIFdvcmtiZW5jaExheW91dFN0YXRlS2V5PFQ+IHtcblxuXHRyZWFkb25seSBydW50aW1lID0gdHJ1ZTtcblxuXHRjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIHRhcmdldDogU3RvcmFnZVRhcmdldCwgZGVmYXVsdFZhbHVlOiBULCByZWFkb25seSB6ZW5Nb2RlSWdub3JlPzogYm9vbGVhbikge1xuXHRcdHN1cGVyKG5hbWUsIHNjb3BlLCB0YXJnZXQsIGRlZmF1bHRWYWx1ZSk7XG5cdH1cbn1cblxuY2xhc3MgSW5pdGlhbGl6YXRpb25TdGF0ZUtleTxUIGV4dGVuZHMgU3RvcmFnZUtleVR5cGU+IGV4dGVuZHMgV29ya2JlbmNoTGF5b3V0U3RhdGVLZXk8VD4ge1xuXHRyZWFkb25seSBydW50aW1lID0gZmFsc2U7XG59XG5cbmNvbnN0IExheW91dFN0YXRlS2V5cyA9IHtcblxuXHQvLyBFZGl0b3Jcblx0TUFJTl9FRElUT1JfQ0VOVEVSRUQ6IG5ldyBSdW50aW1lU3RhdGVLZXk8Ym9vbGVhbj4oJ2VkaXRvci5jZW50ZXJlZCcsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgZmFsc2UpLFxuXG5cdC8vIFplbiBNb2RlXG5cdFpFTl9NT0RFX0FDVElWRTogbmV3IFJ1bnRpbWVTdGF0ZUtleTxib29sZWFuPignemVuTW9kZS5hY3RpdmUnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIGZhbHNlKSxcblx0WkVOX01PREVfRVhJVF9JTkZPOiBuZXcgUnVudGltZVN0YXRlS2V5KCd6ZW5Nb2RlLmV4aXRJbmZvJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCB7XG5cdFx0dHJhbnNpdGlvbmVkVG9DZW50ZXJlZEVkaXRvckxheW91dDogZmFsc2UsXG5cdFx0dHJhbnNpdGlvbmVkVG9GdWxsU2NyZWVuOiBmYWxzZSxcblx0XHRoYW5kbGVOb3RpZmljYXRpb25zRG9Ob3REaXN0dXJiTW9kZTogZmFsc2UsXG5cdFx0d2FzVmlzaWJsZToge1xuXHRcdFx0YXV4aWxpYXJ5QmFyOiBmYWxzZSxcblx0XHRcdHBhbmVsOiBmYWxzZSxcblx0XHRcdHNpZGVCYXI6IGZhbHNlLFxuXHRcdH0sXG5cdH0pLFxuXG5cdC8vIFBhcnQgU2l6aW5nXG5cdFNJREVCQVJfU0laRTogbmV3IEluaXRpYWxpemF0aW9uU3RhdGVLZXk8bnVtYmVyPignc2lkZUJhci5zaXplJywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgMzAwKSxcblx0QVVYSUxJQVJZQkFSX1NJWkU6IG5ldyBJbml0aWFsaXphdGlvblN0YXRlS2V5PG51bWJlcj4oJ2F1eGlsaWFyeUJhci5zaXplJywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgMzAwKSxcblx0UEFORUxfU0laRTogbmV3IEluaXRpYWxpemF0aW9uU3RhdGVLZXk8bnVtYmVyPigncGFuZWwuc2l6ZScsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIDMwMCksXG5cblx0Ly8gUGFydCBTdGF0ZVxuXHRQQU5FTF9MQVNUX05PTl9NQVhJTUlaRURfSEVJR0hUOiBuZXcgUnVudGltZVN0YXRlS2V5PG51bWJlcj4oJ3BhbmVsLmxhc3ROb25NYXhpbWl6ZWRIZWlnaHQnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCAzMDApLFxuXHRQQU5FTF9MQVNUX05PTl9NQVhJTUlaRURfV0lEVEg6IG5ldyBSdW50aW1lU3RhdGVLZXk8bnVtYmVyPigncGFuZWwubGFzdE5vbk1heGltaXplZFdpZHRoJywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgMzAwKSxcblx0UEFORUxfV0FTX0xBU1RfTUFYSU1JWkVEOiBuZXcgUnVudGltZVN0YXRlS2V5PGJvb2xlYW4+KCdwYW5lbC53YXNMYXN0TWF4aW1pemVkJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCBmYWxzZSksXG5cblx0QVVYSUxJQVJZQkFSX1dBU19MQVNUX01BWElNSVpFRDogbmV3IFJ1bnRpbWVTdGF0ZUtleTxib29sZWFuPignYXV4aWxpYXJ5QmFyLndhc0xhc3RNYXhpbWl6ZWQnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIGZhbHNlKSxcblx0QVVYSUxJQVJZQkFSX0xBU1RfTk9OX01BWElNSVpFRF9TSVpFOiBuZXcgUnVudGltZVN0YXRlS2V5PG51bWJlcj4oJ2F1eGlsaWFyeUJhci5sYXN0Tm9uTWF4aW1pemVkU2l6ZScsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIDMwMCksXG5cdEFVWElMSUFSWUJBUl9MQVNUX05PTl9NQVhJTUlaRURfVklTSUJJTElUWTogbmV3IFJ1bnRpbWVTdGF0ZUtleSgnYXV4aWxpYXJ5QmFyLmxhc3ROb25NYXhpbWl6ZWRWaXNpYmlsaXR5JywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCB7XG5cdFx0c2lkZUJhclZpc2libGU6IGZhbHNlLFxuXHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdHBhbmVsVmlzaWJsZTogZmFsc2UsXG5cdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2Vcblx0fSksXG5cdEFVWElMSUFSWUJBUl9FTVBUWTogbmV3IEluaXRpYWxpemF0aW9uU3RhdGVLZXk8Ym9vbGVhbj4oJ2F1eGlsaWFyeUJhci5lbXB0eScsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIGZhbHNlKSxcblxuXHQvLyBQYXJ0IFBvc2l0aW9uc1xuXHRTSURFQkFSX1BPU0lUT046IG5ldyBSdW50aW1lU3RhdGVLZXk8UG9zaXRpb24+KCdzaWRlQmFyLnBvc2l0aW9uJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCBQb3NpdGlvbi5MRUZUKSxcblx0UEFORUxfUE9TSVRJT046IG5ldyBSdW50aW1lU3RhdGVLZXk8UG9zaXRpb24+KCdwYW5lbC5wb3NpdGlvbicsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgUG9zaXRpb24uQk9UVE9NKSxcblx0UEFORUxfQUxJR05NRU5UOiBuZXcgUnVudGltZVN0YXRlS2V5PFBhbmVsQWxpZ25tZW50PigncGFuZWwuYWxpZ25tZW50JywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUiwgJ2NlbnRlcicpLFxuXG5cdC8vIFBhcnQgVmlzaWJpbGl0eVxuXHRBQ1RJVklUWUJBUl9ISURERU46IG5ldyBSdW50aW1lU3RhdGVLZXk8Ym9vbGVhbj4oJ2FjdGl2aXR5QmFyLmhpZGRlbicsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgZmFsc2UsIHRydWUpLFxuXHRTSURFQkFSX0hJRERFTjogbmV3IFJ1bnRpbWVTdGF0ZUtleTxib29sZWFuPignc2lkZUJhci5oaWRkZW4nLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIGZhbHNlKSxcblx0RURJVE9SX0hJRERFTjogbmV3IFJ1bnRpbWVTdGF0ZUtleTxib29sZWFuPignZWRpdG9yLmhpZGRlbicsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgZmFsc2UpLFxuXHRQQU5FTF9ISURERU46IG5ldyBSdW50aW1lU3RhdGVLZXk8Ym9vbGVhbj4oJ3BhbmVsLmhpZGRlbicsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgdHJ1ZSksXG5cdEFVWElMSUFSWUJBUl9ISURERU46IG5ldyBSdW50aW1lU3RhdGVLZXk8Ym9vbGVhbj4oJ2F1eGlsaWFyeUJhci5oaWRkZW4nLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIHRydWUpLFxuXHRTVEFUVVNCQVJfSElEREVOOiBuZXcgUnVudGltZVN0YXRlS2V5PGJvb2xlYW4+KCdzdGF0dXNCYXIuaGlkZGVuJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCBmYWxzZSwgdHJ1ZSlcblxufSBhcyBjb25zdDtcblxuaW50ZXJmYWNlIElMYXlvdXRTdGF0ZUNoYW5nZUV2ZW50PFQgZXh0ZW5kcyBTdG9yYWdlS2V5VHlwZT4ge1xuXHRyZWFkb25seSBrZXk6IFJ1bnRpbWVTdGF0ZUtleTxUPjtcblx0cmVhZG9ubHkgdmFsdWU6IFQ7XG59XG5cbmVudW0gV29ya2JlbmNoTGF5b3V0U2V0dGluZ3Mge1xuXHRBVVhJTElBUllCQVJfREVGQVVMVF9WSVNJQklMSVRZID0gJ3dvcmtiZW5jaC5zZWNvbmRhcnlTaWRlQmFyLmRlZmF1bHRWaXNpYmlsaXR5Jyxcblx0QVVYSUxJQVJZQkFSX0ZPUkNFX01BWElNSVpFRCA9ICd3b3JrYmVuY2guc2Vjb25kYXJ5U2lkZUJhci5mb3JjZU1heGltaXplZCcsXG5cdEFDVElWSVRZX0JBUl9WSVNJQkxFID0gJ3dvcmtiZW5jaC5hY3Rpdml0eUJhci52aXNpYmxlJyxcblx0UEFORUxfUE9TSVRJT04gPSAnd29ya2JlbmNoLnBhbmVsLmRlZmF1bHRMb2NhdGlvbicsXG5cdFBBTkVMX09QRU5TX01BWElNSVpFRCA9ICd3b3JrYmVuY2gucGFuZWwub3BlbnNNYXhpbWl6ZWQnLFxuXHRaRU5fTU9ERV9DT05GSUcgPSAnemVuTW9kZScsXG5cdEVESVRPUl9DRU5URVJFRF9MQVlPVVRfQVVUT19SRVNJWkUgPSAnd29ya2JlbmNoLmVkaXRvci5jZW50ZXJlZExheW91dEF1dG9SZXNpemUnLFxuXHRFRElUT1JfUkVTVE9SRV9FRElUT1JTID0gJ3dvcmtiZW5jaC5lZGl0b3IucmVzdG9yZUVkaXRvcnMnLFxufVxuXG5lbnVtIExlZ2FjeVdvcmtiZW5jaExheW91dFNldHRpbmdzIHtcblx0U1RBVFVTQkFSX1ZJU0lCTEUgPSAnd29ya2JlbmNoLnN0YXR1c0Jhci52aXNpYmxlJywgXHQvLyBEZXByZWNhdGVkIHRvIFVJIFN0YXRlXG5cdFNJREVCQVJfUE9TSVRJT04gPSAnd29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nLCBcdC8vIERlcHJlY2F0ZWQgdG8gVUkgU3RhdGVcbn1cblxuaW50ZXJmYWNlIElMYXlvdXRTdGF0ZUxvYWRDb25maWd1cmF0aW9uIHtcblx0cmVhZG9ubHkgbWFpbkNvbnRhaW5lckRpbWVuc2lvbjogSURpbWVuc2lvbjtcblx0cmVhZG9ubHkgcmVzZXRMYXlvdXQ6IGJvb2xlYW47XG59XG5cbmNsYXNzIExheW91dFN0YXRlTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgU1RPUkFHRV9QUkVGSVggPSAnd29ya2JlbmNoLic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElMYXlvdXRTdGF0ZUNoYW5nZUV2ZW50PFN0b3JhZ2VLZXlUeXBlPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RhdGUgPSB0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RhdGVDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCB1bmtub3duPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaXNOZXc6IHtcblx0XHRbU3RvcmFnZVNjb3BlLldPUktTUEFDRV06IGJvb2xlYW47XG5cdFx0W1N0b3JhZ2VTY29wZS5QUk9GSUxFXTogYm9vbGVhbjtcblx0XHRbU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OXTogYm9vbGVhbjtcblx0XHRbU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRF06IGJvb2xlYW47XG5cdH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5pc05ldyA9IHtcblx0XHRcdFtTdG9yYWdlU2NvcGUuV09SS1NQQUNFXTogdGhpcy5zdG9yYWdlU2VydmljZS5pc05ldyhTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSxcblx0XHRcdFtTdG9yYWdlU2NvcGUuUFJPRklMRV06IHRoaXMuc3RvcmFnZVNlcnZpY2UuaXNOZXcoU3RvcmFnZVNjb3BlLlBST0ZJTEUpLFxuXHRcdFx0W1N0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl06IHRoaXMuc3RvcmFnZVNlcnZpY2UuaXNOZXcoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSxcblx0XHRcdFtTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEXTogdGhpcy5zdG9yYWdlU2VydmljZS5pc05ldyhTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEKVxuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uQ2hhbmdlID0+IHRoaXMudXBkYXRlU3RhdGVGcm9tTGVnYWN5U2V0dGluZ3MoY29uZmlndXJhdGlvbkNoYW5nZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU3RhdGVGcm9tTGVnYWN5U2V0dGluZ3MoY29uZmlndXJhdGlvbkNoYW5nZUV2ZW50OiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pKSB7XG5cdFx0XHR0aGlzLnNldFJ1bnRpbWVWYWx1ZUFuZEZpcmUoTGF5b3V0U3RhdGVLZXlzLkFDVElWSVRZQkFSX0hJRERFTiwgdGhpcy5pc0FjdGl2aXR5QmFySGlkZGVuKCkpO1xuXHRcdH1cblxuXHRcdGlmIChjb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTGVnYWN5V29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuU1RBVFVTQkFSX1ZJU0lCTEUpKSB7XG5cdFx0XHR0aGlzLnNldFJ1bnRpbWVWYWx1ZUFuZEZpcmUoTGF5b3V0U3RhdGVLZXlzLlNUQVRVU0JBUl9ISURERU4sICF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKExlZ2FjeVdvcmtiZW5jaExheW91dFNldHRpbmdzLlNUQVRVU0JBUl9WSVNJQkxFKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihMZWdhY3lXb3JrYmVuY2hMYXlvdXRTZXR0aW5ncy5TSURFQkFSX1BPU0lUSU9OKSkge1xuXHRcdFx0dGhpcy5zZXRSdW50aW1lVmFsdWVBbmRGaXJlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX1BPU0lUT04sIHBvc2l0aW9uRnJvbVN0cmluZyh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKExlZ2FjeVdvcmtiZW5jaExheW91dFNldHRpbmdzLlNJREVCQVJfUE9TSVRJT04pID8/ICdsZWZ0JykpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTGVnYWN5U2V0dGluZ3NGcm9tU3RhdGU8VCBleHRlbmRzIFN0b3JhZ2VLZXlUeXBlPihrZXk6IFJ1bnRpbWVTdGF0ZUtleTxUPiwgdmFsdWU6IFQpOiB2b2lkIHtcblx0XHRjb25zdCBpc1plbk1vZGUgPSB0aGlzLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuWkVOX01PREVfQUNUSVZFKTtcblx0XHRpZiAoa2V5Lnplbk1vZGVJZ25vcmUgJiYgaXNaZW5Nb2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGtleSA9PT0gTGF5b3V0U3RhdGVLZXlzLkFDVElWSVRZQkFSX0hJRERFTikge1xuXHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04sIHZhbHVlID8gQWN0aXZpdHlCYXJQb3NpdGlvbi5ISURERU4gOiB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSBpZiAoa2V5ID09PSBMYXlvdXRTdGF0ZUtleXMuU1RBVFVTQkFSX0hJRERFTikge1xuXHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShMZWdhY3lXb3JrYmVuY2hMYXlvdXRTZXR0aW5ncy5TVEFUVVNCQVJfVklTSUJMRSwgIXZhbHVlKTtcblx0XHR9IGVsc2UgaWYgKGtleSA9PT0gTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfUE9TSVRPTikge1xuXHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShMZWdhY3lXb3JrYmVuY2hMYXlvdXRTZXR0aW5ncy5TSURFQkFSX1BPU0lUSU9OLCBwb3NpdGlvblRvU3RyaW5nKHZhbHVlIGFzIFBvc2l0aW9uKSk7XG5cdFx0fVxuXHR9XG5cblx0bG9hZChjb25maWd1cmF0aW9uOiBJTGF5b3V0U3RhdGVMb2FkQ29uZmlndXJhdGlvbik6IHZvaWQge1xuXHRcdGxldCBrZXk6IGtleW9mIHR5cGVvZiBMYXlvdXRTdGF0ZUtleXM7XG5cblx0XHQvLyBMb2FkIHN0b3JlZCB2YWx1ZXMgZm9yIGFsbCBrZXlzIHVubGVzcyB3ZSBleHBsaWNpdGx5IHNldCB0byByZXNldFxuXHRcdGlmICghY29uZmlndXJhdGlvbi5yZXNldExheW91dCkge1xuXHRcdFx0Zm9yIChrZXkgaW4gTGF5b3V0U3RhdGVLZXlzKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlS2V5ID0gTGF5b3V0U3RhdGVLZXlzW2tleV0gYXMgV29ya2JlbmNoTGF5b3V0U3RhdGVLZXk8U3RvcmFnZUtleVR5cGU+O1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMubG9hZEtleUZyb21TdG9yYWdlKHN0YXRlS2V5KTtcblxuXHRcdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuc3RhdGVDYWNoZS5zZXQoc3RhdGVLZXkubmFtZSwgdmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQXBwbHkgbGVnYWN5IHNldHRpbmdzXG5cdFx0dGhpcy5zdGF0ZUNhY2hlLnNldChMYXlvdXRTdGF0ZUtleXMuQUNUSVZJVFlCQVJfSElEREVOLm5hbWUsIHRoaXMuaXNBY3Rpdml0eUJhckhpZGRlbigpKTtcblx0XHR0aGlzLnN0YXRlQ2FjaGUuc2V0KExheW91dFN0YXRlS2V5cy5TVEFUVVNCQVJfSElEREVOLm5hbWUsICF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKExlZ2FjeVdvcmtiZW5jaExheW91dFNldHRpbmdzLlNUQVRVU0JBUl9WSVNJQkxFKSk7XG5cdFx0dGhpcy5zdGF0ZUNhY2hlLnNldChMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9QT1NJVE9OLm5hbWUsIHBvc2l0aW9uRnJvbVN0cmluZyh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKExlZ2FjeVdvcmtiZW5jaExheW91dFNldHRpbmdzLlNJREVCQVJfUE9TSVRJT04pID8/ICdsZWZ0JykpO1xuXG5cdFx0Ly8gU2V0IGR5bmFtaWMgZGVmYXVsdHM6IHBhcnQgc2l6aW5nIGFuZCBzaWRlIGJhciB2aXNpYmlsaXR5XG5cdFx0Y29uc3QgYXV4aWxpYXJ5QmFyRm9yY2VNYXhpbWl6ZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFdvcmtiZW5jaExheW91dFNldHRpbmdzLkFVWElMSUFSWUJBUl9GT1JDRV9NQVhJTUlaRUQpO1xuXHRcdGNvbnN0IHdvcmtiZW5jaFN0YXRlID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpO1xuXHRcdGNvbnN0IG1haW5Db250YWluZXJEaW1lbnNpb24gPSBjb25maWd1cmF0aW9uLm1haW5Db250YWluZXJEaW1lbnNpb247XG5cdFx0TGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfU0laRS5kZWZhdWx0VmFsdWUgPSBNYXRoLm1pbigzMDAsIG1haW5Db250YWluZXJEaW1lbnNpb24ud2lkdGggLyA0KTtcblx0XHRMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9ISURERU4uZGVmYXVsdFZhbHVlID0gd29ya2JlbmNoU3RhdGUgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZIHx8IGF1eGlsaWFyeUJhckZvcmNlTWF4aW1pemVkID09PSB0cnVlO1xuXHRcdExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfU0laRS5kZWZhdWx0VmFsdWUgPSBhdXhpbGlhcnlCYXJGb3JjZU1heGltaXplZCA/IE1hdGgubWF4KDMwMCwgbWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCAvIDIpIDogTWF0aC5taW4oMzAwLCBtYWluQ29udGFpbmVyRGltZW5zaW9uLndpZHRoIC8gNCk7XG5cdFx0TGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9ISURERU4uZGVmYXVsdFZhbHVlID0gKCgpID0+IHtcblx0XHRcdGlmIChpc1dlYiAmJiAhdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRcdHJldHVybiB0cnVlOyAvLyBub3QgcmVxdWlyZWQgaW4gd2ViIGlmIHVuc3VwcG9ydGVkXG5cdFx0XHR9XG5cblx0XHRcdGlmIChhdXhpbGlhcnlCYXJGb3JjZU1heGltaXplZCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGZvcmNlZCB0byBiZSB2aXNpYmxlXG5cdFx0XHR9XG5cblx0XHRcdC8vIFVubGVzcyBhdXhpbGlhcnkgYmFyIHZpc2liaWxpdHkgaXMgZXhwbGljaXRseSBjb25maWd1cmVkLCBtYWtlXG5cdFx0XHQvLyBzdXJlIHRvIG5vdCBmb3JjZSBvcGVuIGl0IGluIGNhc2Ugd2Uga25vdyBpdCB3YXMgZW1wdHkgYmVmb3JlLlxuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChXb3JrYmVuY2hMYXlvdXRTZXR0aW5ncy5BVVhJTElBUllCQVJfREVGQVVMVF9WSVNJQklMSVRZKTtcblx0XHRcdGlmIChjb25maWd1cmF0aW9uLmRlZmF1bHRWYWx1ZSAhPT0gJ2hpZGRlbicgJiYgIWlzQ29uZmlndXJlZChjb25maWd1cmF0aW9uKSAmJiB0aGlzLnN0YXRlQ2FjaGUuZ2V0KExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfRU1QVFkubmFtZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE5ldyB1c2VyczogU2hvdyBhdXhpbGlhcnkgYmFyIGV2ZW4gaW4gZW1wdHkgd29ya3NwYWNlcyxcblx0XHRcdC8vIGJ1dCBub3QgaWYgdGhlIHVzZXIgZXhwbGljaXRseSBoaWRlcyBpdCBvciBBSSBmZWF0dXJlcyBhcmUgZGlzYWJsZWQuXG5cdFx0XHRpZiAoXG5cdFx0XHRcdHRoaXMuaXNOZXdbU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OXSAmJlxuXHRcdFx0XHRjb25maWd1cmF0aW9uLnZhbHVlICE9PSAnaGlkZGVuJyAmJlxuXHRcdFx0XHQhdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0QUlEaXNhYmxlZFNldHRpbmdJZClcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEV4aXN0aW5nIHVzZXJzOiByZXNwZWN0IHZpc2liaWxpdHkgc2V0dGluZ1xuXHRcdFx0c3dpdGNoIChjb25maWd1cmF0aW9uLnZhbHVlKSB7XG5cdFx0XHRcdGNhc2UgJ2hpZGRlbic6XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdGNhc2UgJ3Zpc2libGVJbldvcmtzcGFjZSc6XG5cdFx0XHRcdGNhc2UgJ21heGltaXplZEluV29ya3NwYWNlJzpcblx0XHRcdFx0XHRyZXR1cm4gd29ya2JlbmNoU3RhdGUgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSgpO1xuXHRcdExheW91dFN0YXRlS2V5cy5QQU5FTF9TSVpFLmRlZmF1bHRWYWx1ZSA9ICh0aGlzLnN0YXRlQ2FjaGUuZ2V0KExheW91dFN0YXRlS2V5cy5QQU5FTF9QT1NJVElPTi5uYW1lKSA/PyBpc0hvcml6b250YWwoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX1BPU0lUSU9OLmRlZmF1bHRWYWx1ZSkpID8gbWFpbkNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgLyAzIDogbWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCAvIDQ7XG5cdFx0TGF5b3V0U3RhdGVLZXlzLlBBTkVMX1BPU0lUSU9OLmRlZmF1bHRWYWx1ZSA9IHBvc2l0aW9uRnJvbVN0cmluZyh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFdvcmtiZW5jaExheW91dFNldHRpbmdzLlBBTkVMX1BPU0lUSU9OKSA/PyAnYm90dG9tJyk7XG5cblx0XHQvLyBBcHBseSBhbGwgZGVmYXVsdHNcblx0XHRmb3IgKGtleSBpbiBMYXlvdXRTdGF0ZUtleXMpIHtcblx0XHRcdGNvbnN0IHN0YXRlS2V5ID0gTGF5b3V0U3RhdGVLZXlzW2tleV07XG5cdFx0XHRpZiAodGhpcy5zdGF0ZUNhY2hlLmdldChzdGF0ZUtleS5uYW1lKSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuc3RhdGVDYWNoZS5zZXQoc3RhdGVLZXkubmFtZSwgc3RhdGVLZXkuZGVmYXVsdFZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBcHBseSBhbGwgb3ZlcnJpZGVzXG5cdFx0dGhpcy5hcHBseU92ZXJyaWRlcyhjb25maWd1cmF0aW9uKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGZvciBydW50aW1lIGtleSBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB1bmRlZmluZWQsIHRoaXMuX3N0b3JlKShzdG9yYWdlQ2hhbmdlRXZlbnQgPT4ge1xuXHRcdFx0bGV0IGtleToga2V5b2YgdHlwZW9mIExheW91dFN0YXRlS2V5cztcblx0XHRcdGZvciAoa2V5IGluIExheW91dFN0YXRlS2V5cykge1xuXHRcdFx0XHRjb25zdCBzdGF0ZUtleSA9IExheW91dFN0YXRlS2V5c1trZXldIGFzIFdvcmtiZW5jaExheW91dFN0YXRlS2V5PFN0b3JhZ2VLZXlUeXBlPjtcblx0XHRcdFx0aWYgKHN0YXRlS2V5IGluc3RhbmNlb2YgUnVudGltZVN0YXRlS2V5ICYmIHN0YXRlS2V5LnNjb3BlID09PSBTdG9yYWdlU2NvcGUuUFJPRklMRSAmJiBzdGF0ZUtleS50YXJnZXQgPT09IFN0b3JhZ2VUYXJnZXQuVVNFUikge1xuXHRcdFx0XHRcdGlmIChgJHtMYXlvdXRTdGF0ZU1vZGVsLlNUT1JBR0VfUFJFRklYfSR7c3RhdGVLZXkubmFtZX1gID09PSBzdG9yYWdlQ2hhbmdlRXZlbnQua2V5KSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMubG9hZEtleUZyb21TdG9yYWdlKHN0YXRlS2V5KSA/PyBzdGF0ZUtleS5kZWZhdWx0VmFsdWU7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5zdGF0ZUNhY2hlLmdldChzdGF0ZUtleS5uYW1lKSAhPT0gdmFsdWUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5zdGF0ZUNhY2hlLnNldChzdGF0ZUtleS5uYW1lLCB2YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZmlyZSh7IGtleTogc3RhdGVLZXksIHZhbHVlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlPdmVycmlkZXMoY29uZmlndXJhdGlvbjogSUxheW91dFN0YXRlTG9hZENvbmZpZ3VyYXRpb24pOiB2b2lkIHtcblxuXHRcdC8vIEF1eGlsaWFyeSBiYXI6IE1heGltaXplZCBzZXR0aW5nc1xuXHRcdGlmICh0aGlzLmlzTmV3W1N0b3JhZ2VTY29wZS5XT1JLU1BBQ0VdKSB7XG5cdFx0XHRjb25zdCBkZWZhdWx0QXV4aWxpYXJ5QmFyVmlzaWJpbGl0eSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoV29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuQVVYSUxJQVJZQkFSX0RFRkFVTFRfVklTSUJJTElUWSk7XG5cdFx0XHRjb25zdCBzdGFydHVwRWRpdG9yID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnbm9uZScgfCAnd2VsY29tZVBhZ2UnIHwgJ3JlYWRtZScgfCAnbmV3VW50aXRsZWRGaWxlJyB8ICd3ZWxjb21lUGFnZUluRW1wdHlXb3JrYmVuY2gnIHwgJ3Rlcm1pbmFsJyB8ICdhZ2VudFNlc3Npb25zV2VsY29tZVBhZ2UnPignd29ya2JlbmNoLnN0YXJ0dXBFZGl0b3InKTtcblx0XHRcdGlmIChzdGFydHVwRWRpdG9yID09PSAnYWdlbnRTZXNzaW9uc1dlbGNvbWVQYWdlJykge1xuXHRcdFx0XHR0aGlzLmFwcGx5QXV4aWxpYXJ5QmFySGlkZGVuT3ZlcnJpZGUodHJ1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKFxuXHRcdFx0XHRkZWZhdWx0QXV4aWxpYXJ5QmFyVmlzaWJpbGl0eSA9PT0gJ21heGltaXplZCcgfHxcblx0XHRcdFx0KGRlZmF1bHRBdXhpbGlhcnlCYXJWaXNpYmlsaXR5ID09PSAnbWF4aW1pemVkSW5Xb3Jrc3BhY2UnICYmIHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpXG5cdFx0XHQpIHtcblx0XHRcdFx0dGhpcy5hcHBseUF1eGlsaWFyeUJhck1heGltaXplZE92ZXJyaWRlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQm90aCBlZGl0b3IgYW5kIHBhbmVsIHNob3VsZCBub3QgYmUgaGlkZGVuIG9uIHN0YXJ0dXAgdW5sZXNzIGF1eGlsaWFyeSBiYXIgaXMgbWF4aW1pemVkXG5cdFx0aWYgKFxuXHRcdFx0dGhpcy5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0hJRERFTikgJiZcblx0XHRcdHRoaXMuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5FRElUT1JfSElEREVOKSAmJlxuXHRcdFx0IXRoaXMuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfV0FTX0xBU1RfTUFYSU1JWkVEKVxuXHRcdCkge1xuXHRcdFx0dGhpcy5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkVESVRPUl9ISURERU4sIGZhbHNlKTtcblx0XHR9XG5cblx0XHQvLyBSZXN0cmljdCBhdXhpbGlhcnkgYmFyIHNpemUgaW4gY2FzZSBvZiBzbWFsbCB3aW5kb3cgZGltZW5zaW9uc1xuXHRcdGlmICh0aGlzLmlzTmV3W1N0b3JhZ2VTY29wZS5XT1JLU1BBQ0VdICYmIGNvbmZpZ3VyYXRpb24ubWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCA8PSBERUZBVUxUX1dPUktTUEFDRV9XSU5ET1dfRElNRU5TSU9OUy53aWR0aCkge1xuXHRcdFx0dGhpcy5zZXRJbml0aWFsaXphdGlvblZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX1NJWkUsIE1hdGgubWluKDMwMCwgY29uZmlndXJhdGlvbi5tYWluQ29udGFpbmVyRGltZW5zaW9uLndpZHRoIC8gNCkpO1xuXHRcdFx0dGhpcy5zZXRJbml0aWFsaXphdGlvblZhbHVlKExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfU0laRSwgTWF0aC5taW4oMzAwLCBjb25maWd1cmF0aW9uLm1haW5Db250YWluZXJEaW1lbnNpb24ud2lkdGggLyA0KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUF1eGlsaWFyeUJhck1heGltaXplZE92ZXJyaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfTEFTVF9OT05fTUFYSU1JWkVEX1ZJU0lCSUxJVFksIHtcblx0XHRcdHNpZGVCYXJWaXNpYmxlOiAhdGhpcy5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfSElEREVOKSxcblx0XHRcdHBhbmVsVmlzaWJsZTogIXRoaXMuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9ISURERU4pLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogIXRoaXMuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5FRElUT1JfSElEREVOKSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6ICF0aGlzLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX0hJRERFTilcblx0XHR9KTtcblxuXHRcdHRoaXMuc2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX0hJRERFTiwgdHJ1ZSk7XG5cdFx0dGhpcy5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0hJRERFTiwgdHJ1ZSk7XG5cdFx0dGhpcy5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkVESVRPUl9ISURERU4sIHRydWUpO1xuXHRcdHRoaXMuc2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfSElEREVOLCBmYWxzZSk7XG5cblx0XHR0aGlzLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX0xBU1RfTk9OX01BWElNSVpFRF9TSVpFLCB0aGlzLmdldEluaXRpYWxpemF0aW9uVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9TSVpFKSk7XG5cdFx0dGhpcy5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9XQVNfTEFTVF9NQVhJTUlaRUQsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUF1eGlsaWFyeUJhckhpZGRlbk92ZXJyaWRlKHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9ISURERU4sIHZhbHVlKTtcblx0fVxuXG5cdHNhdmUod29ya3NwYWNlOiBib29sZWFuLCBnbG9iYWw6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRsZXQga2V5OiBrZXlvZiB0eXBlb2YgTGF5b3V0U3RhdGVLZXlzO1xuXG5cdFx0Y29uc3QgaXNaZW5Nb2RlID0gdGhpcy5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlpFTl9NT0RFX0FDVElWRSk7XG5cblx0XHRmb3IgKGtleSBpbiBMYXlvdXRTdGF0ZUtleXMpIHtcblx0XHRcdGNvbnN0IHN0YXRlS2V5ID0gTGF5b3V0U3RhdGVLZXlzW2tleV0gYXMgV29ya2JlbmNoTGF5b3V0U3RhdGVLZXk8U3RvcmFnZUtleVR5cGU+O1xuXHRcdFx0aWYgKCh3b3Jrc3BhY2UgJiYgc3RhdGVLZXkuc2NvcGUgPT09IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpIHx8XG5cdFx0XHRcdChnbG9iYWwgJiYgc3RhdGVLZXkuc2NvcGUgPT09IFN0b3JhZ2VTY29wZS5QUk9GSUxFKSkge1xuXHRcdFx0XHRpZiAoaXNaZW5Nb2RlICYmIHN0YXRlS2V5IGluc3RhbmNlb2YgUnVudGltZVN0YXRlS2V5ICYmIHN0YXRlS2V5Lnplbk1vZGVJZ25vcmUpIHtcblx0XHRcdFx0XHRjb250aW51ZTsgLy8gRG9uJ3Qgd3JpdGUgb3V0IHNwZWNpZmljIGtleXMgd2hpbGUgaW4gemVuIG1vZGVcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuc2F2ZUtleVRvU3RvcmFnZShzdGF0ZUtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0SW5pdGlhbGl6YXRpb25WYWx1ZTxUIGV4dGVuZHMgU3RvcmFnZUtleVR5cGU+KGtleTogSW5pdGlhbGl6YXRpb25TdGF0ZUtleTxUPik6IFQge1xuXHRcdHJldHVybiB0aGlzLnN0YXRlQ2FjaGUuZ2V0KGtleS5uYW1lKSBhcyBUO1xuXHR9XG5cblx0c2V0SW5pdGlhbGl6YXRpb25WYWx1ZTxUIGV4dGVuZHMgU3RvcmFnZUtleVR5cGU+KGtleTogSW5pdGlhbGl6YXRpb25TdGF0ZUtleTxUPiwgdmFsdWU6IFQpOiB2b2lkIHtcblx0XHR0aGlzLnN0YXRlQ2FjaGUuc2V0KGtleS5uYW1lLCB2YWx1ZSk7XG5cdH1cblxuXHRnZXRSdW50aW1lVmFsdWU8VCBleHRlbmRzIFN0b3JhZ2VLZXlUeXBlPihrZXk6IFJ1bnRpbWVTdGF0ZUtleTxUPiwgZmFsbGJhY2tUb1NldHRpbmc/OiBib29sZWFuKTogVCB7XG5cdFx0aWYgKGZhbGxiYWNrVG9TZXR0aW5nKSB7XG5cdFx0XHRzd2l0Y2ggKGtleSkge1xuXHRcdFx0XHRjYXNlIExheW91dFN0YXRlS2V5cy5BQ1RJVklUWUJBUl9ISURERU46XG5cdFx0XHRcdFx0dGhpcy5zdGF0ZUNhY2hlLnNldChrZXkubmFtZSwgdGhpcy5pc0FjdGl2aXR5QmFySGlkZGVuKCkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIExheW91dFN0YXRlS2V5cy5TVEFUVVNCQVJfSElEREVOOlxuXHRcdFx0XHRcdHRoaXMuc3RhdGVDYWNoZS5zZXQoa2V5Lm5hbWUsICF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKExlZ2FjeVdvcmtiZW5jaExheW91dFNldHRpbmdzLlNUQVRVU0JBUl9WSVNJQkxFKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfUE9TSVRPTjpcblx0XHRcdFx0XHR0aGlzLnN0YXRlQ2FjaGUuc2V0KGtleS5uYW1lLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKExlZ2FjeVdvcmtiZW5jaExheW91dFNldHRpbmdzLlNJREVCQVJfUE9TSVRJT04pID8/ICdsZWZ0Jyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc3RhdGVDYWNoZS5nZXQoa2V5Lm5hbWUpIGFzIFQ7XG5cdH1cblxuXHRzZXRSdW50aW1lVmFsdWU8VCBleHRlbmRzIFN0b3JhZ2VLZXlUeXBlPihrZXk6IFJ1bnRpbWVTdGF0ZUtleTxUPiwgdmFsdWU6IFQpOiB2b2lkIHtcblx0XHR0aGlzLnN0YXRlQ2FjaGUuc2V0KGtleS5uYW1lLCB2YWx1ZSk7XG5cdFx0Y29uc3QgaXNaZW5Nb2RlID0gdGhpcy5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlpFTl9NT0RFX0FDVElWRSk7XG5cblx0XHRpZiAoa2V5LnNjb3BlID09PSBTdG9yYWdlU2NvcGUuUFJPRklMRSkge1xuXHRcdFx0aWYgKCFpc1plbk1vZGUgfHwgIWtleS56ZW5Nb2RlSWdub3JlKSB7XG5cdFx0XHRcdHRoaXMuc2F2ZUtleVRvU3RvcmFnZTxUPihrZXkpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUxlZ2FjeVNldHRpbmdzRnJvbVN0YXRlKGtleSwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNBY3Rpdml0eUJhckhpZGRlbigpOiBib29sZWFuIHtcblx0XHRjb25zdCBvbGRWYWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbiB8IHVuZGVmaW5lZD4oV29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX1ZJU0lCTEUpO1xuXHRcdGlmIChvbGRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gIW9sZFZhbHVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTikgIT09IEFjdGl2aXR5QmFyUG9zaXRpb24uREVGQVVMVDtcblx0fVxuXG5cdHByaXZhdGUgc2V0UnVudGltZVZhbHVlQW5kRmlyZTxUIGV4dGVuZHMgU3RvcmFnZUtleVR5cGU+KGtleTogUnVudGltZVN0YXRlS2V5PFQ+LCB2YWx1ZTogVCk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZpb3VzVmFsdWUgPSB0aGlzLnN0YXRlQ2FjaGUuZ2V0KGtleS5uYW1lKTtcblx0XHRpZiAocHJldmlvdXNWYWx1ZSA9PT0gdmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnNldFJ1bnRpbWVWYWx1ZShrZXksIHZhbHVlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoeyBrZXksIHZhbHVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlS2V5VG9TdG9yYWdlPFQgZXh0ZW5kcyBTdG9yYWdlS2V5VHlwZT4oa2V5OiBXb3JrYmVuY2hMYXlvdXRTdGF0ZUtleTxUPik6IHZvaWQge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5zdGF0ZUNhY2hlLmdldChrZXkubmFtZSkgYXMgVDtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGAke0xheW91dFN0YXRlTW9kZWwuU1RPUkFHRV9QUkVGSVh9JHtrZXkubmFtZX1gLCB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnID8gSlNPTi5zdHJpbmdpZnkodmFsdWUpIDogdmFsdWUsIGtleS5zY29wZSwga2V5LnRhcmdldCk7XG5cdH1cblxuXHRwcml2YXRlIGxvYWRLZXlGcm9tU3RvcmFnZTxUIGV4dGVuZHMgU3RvcmFnZUtleVR5cGU+KGtleTogV29ya2JlbmNoTGF5b3V0U3RhdGVLZXk8VD4pOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KGAke0xheW91dFN0YXRlTW9kZWwuU1RPUkFHRV9QUkVGSVh9JHtrZXkubmFtZX1gLCBrZXkuc2NvcGUpO1xuXHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmlzTmV3W2tleS5zY29wZV0gPSBmYWxzZTsgLy8gcmVtZW1iZXIgdGhhdCB3ZSBoYWQgcHJldmlvdXMgc3RhdGUgZm9yIHRoaXMgc2NvcGVcblxuXHRcdFx0c3dpdGNoICh0eXBlb2Yga2V5LmRlZmF1bHRWYWx1ZSkge1xuXHRcdFx0XHRjYXNlICdib29sZWFuJzogcmV0dXJuICh2YWx1ZSA9PT0gJ3RydWUnKSBhcyBUO1xuXHRcdFx0XHRjYXNlICdudW1iZXInOiByZXR1cm4gcGFyc2VJbnQodmFsdWUpIGFzIFQ7XG5cdFx0XHRcdGNhc2UgJ29iamVjdCc6IHJldHVybiBKU09OLnBhcnNlKHZhbHVlKSBhcyBUO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB2YWx1ZSBhcyBUIHwgdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxZQUFZLGVBQWUsaUJBQThCLG9CQUFvQjtBQUN0RixTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXLHVCQUF1QixlQUFlLE1BQWtCLHVCQUF1Qix3QkFBd0IsbUJBQW1CLFlBQVksaUJBQWlCLGtCQUFrQixXQUFXLGFBQWEsa0JBQWtCLGlCQUFpQjtBQUN4UCxTQUFTLHVCQUF1QixjQUFjLG9CQUFvQjtBQUNsRSxTQUFTLFdBQVcsU0FBUyxhQUFhLE9BQU8sYUFBYTtBQUM5RCxTQUFTLHlCQUEwQyx1QkFBNEMsc0JBQXNCO0FBQ3JILFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsVUFBVSxPQUFPLDJCQUFvRCxvQkFBb0Isa0JBQWtCLDhCQUE4QyxxQkFBcUIsZ0JBQXlELGlCQUFpQyx1QkFBdUIsMEJBQTBCLGNBQWMseUJBQXFEO0FBQ3JZLFNBQVMsc0JBQXNCLDBCQUEwQixzQkFBc0I7QUFDL0UsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBb0MsdUJBQXVCLG9CQUFvQjtBQUMvRSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLGFBQWEseUJBQXlCO0FBQy9DLFNBQVMsc0JBQTZCLG1CQUFtQixtQkFBbUIsaUJBQWlCLDBCQUEwQiwwQkFBMEIsMkJBQTJCLCtCQUErQixlQUFlLG9CQUFvQjtBQUM5TyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDJDQUEyQztBQUNwRCxTQUFTLHNCQUFzQjtBQUMvQixTQUE0Qix1QkFBdUIsa0JBQWtCLGFBQWEsNEJBQTRCO0FBQzlHLFNBQVMs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LElBQUksSUFBSSxJQUFJO0FBQzFDLFNBQUssZUFBZSxNQUFNLEdBQUcsa0JBQWlCLGNBQWMsR0FBRyxJQUFJLElBQUksSUFBSSxPQUFPLFVBQVUsV0FBVyxLQUFLLFVBQVUsS0FBSyxJQUFJLE9BQU8sSUFBSSxPQUFPLElBQUksTUFBTTtBQUFBLEVBQzVKO0FBQUEsRUFFUSxtQkFBNkMsS0FBZ0Q7QUFDcEcsVUFBTSxRQUFRLEtBQUssZUFBZSxJQUFJLEdBQUcsa0JBQWlCLGNBQWMsR0FBRyxJQUFJLElBQUksSUFBSSxJQUFJLEtBQUs7QUFDaEcsUUFBSSxVQUFVLFFBQVc7QUFDeEIsV0FBSyxNQUFNLElBQUksS0FBSyxJQUFJO0FBRXhCLGNBQVEsT0FBTyxJQUFJLGNBQWM7QUFBQSxRQUNoQyxLQUFLO0FBQVcsaUJBQVEsVUFBVTtBQUFBLFFBQ2xDLEtBQUs7QUFBVSxpQkFBTyxTQUFTLEtBQUs7QUFBQSxRQUNwQyxLQUFLO0FBQVUsaUJBQU8sS0FBSyxNQUFNLEtBQUs7QUFBQSxNQUN2QztBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBbFRNLGtCQUVXLGlCQUFpQjtBQUZsQyxJQUFNLG1CQUFOOyIsCiAgIm5hbWVzIjogWyJMYXlvdXRDbGFzc2VzIiwgImVkaXRvcnMiLCAiaSIsICJzaXplIiwgIldvcmtiZW5jaExheW91dFNldHRpbmdzIiwgIkxlZ2FjeVdvcmtiZW5jaExheW91dFNldHRpbmdzIiwgImNvbmZpZ3VyYXRpb24iLCAia2V5Il0KfQo=
