import "../../workbench/browser/style.js";
import "./media/style.css";
import "./media/workbench.css";
import "./media/phoneLayout.css";
import { Disposable, DisposableStore, toDisposable } from "../../base/common/lifecycle.js";
import { Emitter, Event, setGlobalLeakWarningThreshold } from "../../base/common/event.js";
import { addDisposableListener, getActiveDocument, getActiveElement, getClientArea, getWindowId, getWindows, isAncestorUsingFlowTo, isHTMLElement, size, Dimension, runWhenWindowIdle } from "../../base/browser/dom.js";
import { DeferredPromise, RunOnceScheduler } from "../../base/common/async.js";
import { isFullscreen, onDidChangeFullscreen, isChrome, isFirefox, isSafari } from "../../base/browser/browser.js";
import { mark } from "../../base/common/performance.js";
import { onUnexpectedError, setUnexpectedErrorHandler } from "../../base/common/errors.js";
import { isWindows, isLinux, isWeb, isNative, isMacintosh } from "../../base/common/platform.js";
import { Parts, Position, IWorkbenchLayoutService, positionToString } from "../../workbench/services/layout/browser/layoutService.js";
import { Part } from "../../workbench/browser/part.js";
import { Orientation, SerializableGrid } from "../../base/browser/ui/grid/grid.js";
import { IEditorGroupsService } from "../../workbench/services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../workbench/services/editor/common/editorService.js";
import { IPaneCompositePartService } from "../../workbench/services/panecomposite/browser/panecomposite.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../workbench/common/views.js";
import { IInstantiationService, refineServiceDecorator } from "../../platform/instantiation/common/instantiation.js";
import { ITitleService } from "../../workbench/services/title/browser/titleService.js";
import { mainWindow } from "../../base/browser/window.js";
import { coalesce } from "../../base/common/arrays.js";
import { InstantiationService } from "../../platform/instantiation/common/instantiationService.js";
import { getSingletonServiceDescriptors } from "../../platform/instantiation/common/extensions.js";
import { ILifecycleService, LifecyclePhase } from "../../workbench/services/lifecycle/common/lifecycle.js";
import { IStorageService, WillSaveStateReason, StorageScope, StorageTarget } from "../../platform/storage/common/storage.js";
import { IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { IHostService } from "../../workbench/services/host/browser/host.js";
import { IDialogService } from "../../platform/dialogs/common/dialogs.js";
import { INotificationService } from "../../platform/notification/common/notification.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../platform/hover/browser/hover.js";
import { setHoverDelegateFactory } from "../../base/browser/ui/hover/hoverDelegateFactory.js";
import { setBaseLayerHoverDelegate } from "../../base/browser/ui/hover/hoverDelegate2.js";
import { Registry } from "../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../workbench/common/contributions.js";
import { EditorExtensions } from "../../workbench/common/editor.js";
import { alert, setARIAContainer } from "../../base/browser/ui/aria/aria.js";
import { localize } from "../../nls.js";
import { FontMeasurements } from "../../editor/browser/config/fontMeasurements.js";
import { createBareFontInfoFromRawSettings } from "../../editor/common/config/fontInfoFromSettings.js";
import { toErrorMessage } from "../../base/common/errorMessage.js";
import { WorkbenchContextKeysHandler } from "../../workbench/browser/contextkeys.js";
import { PixelRatio } from "../../base/browser/pixelRatio.js";
import { AccessibilityProgressSignalScheduler } from "../../platform/accessibilitySignal/browser/progressAccessibilitySignalScheduler.js";
import { setProgressAccessibilitySignalScheduler } from "../../base/browser/ui/progressbar/progressAccessibilitySignal.js";
import { AccessibleViewRegistry } from "../../platform/accessibility/browser/accessibleViewRegistry.js";
import { NotificationAccessibleView } from "../../workbench/browser/parts/notifications/notificationAccessibleView.js";
import { NotificationsCenter } from "../../workbench/browser/parts/notifications/notificationsCenter.js";
import { NotificationsAlerts } from "../../workbench/browser/parts/notifications/notificationsAlerts.js";
import { NotificationsStatus } from "../../workbench/browser/parts/notifications/notificationsStatus.js";
import { registerNotificationCommands } from "../../workbench/browser/parts/notifications/notificationsCommands.js";
import { CommandsRegistry } from "../../platform/commands/common/commands.js";
import { NotificationsToasts } from "../../workbench/browser/parts/notifications/notificationsToasts.js";
import { IMarkdownRendererService } from "../../platform/markdown/browser/markdownRenderer.js";
import { EditorMarkdownCodeBlockRenderer } from "../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js";
import { SyncDescriptor } from "../../platform/instantiation/common/descriptors.js";
import { TitleService } from "./parts/titlebarPart.js";
import { EDITOR_PART_DEFAULT_WIDTH, EDITOR_PART_MINIMUM_WIDTH } from "./parts/editorPartSizing.js";
import { IContextKeyService } from "../../platform/contextkey/common/contextkey.js";
import { CustomViewVisibleContext, EditorMaximizedContext, IsPhoneLayoutContext, SinglePaneLayoutEnabledContext } from "../common/contextkeys.js";
import {
  NotificationsPosition,
  NotificationsSettings,
  getNotificationsPosition
} from "../../workbench/common/notifications.js";
import { SessionsLayoutPolicy } from "./layoutPolicy.js";
import { AGENTS_PART_CARD_CLASS } from "./parts/agentsPartCard.js";
import { MobileNavigationStack } from "./mobileNavigationStack.js";
import { MobileTitlebarPart } from "./parts/mobile/mobileTitlebarPart.js";
import { IMobileVisualViewport } from "./parts/mobile/mobileVisualViewport.js";
import { autorun } from "../../base/common/observable.js";
import { ISessionsService } from "../services/sessions/browser/sessionsService.js";
import { ISessionsPartService } from "../services/sessions/browser/sessionsPartService.js";
import { ICustomViewService } from "../services/customView/browser/customViewService.js";
import { ICustomViewGridPartService } from "../services/customView/browser/customViewGridPartService.js";
import { ISessionsSetUpService } from "./sessionsSetUpService.js";
var LayoutClasses = /* @__PURE__ */ ((LayoutClasses2) => {
  LayoutClasses2["SIDEBAR_HIDDEN"] = "nosidebar";
  LayoutClasses2["MAIN_EDITOR_AREA_HIDDEN"] = "nomaineditorarea";
  LayoutClasses2["PANEL_HIDDEN"] = "nopanel";
  LayoutClasses2["AUXILIARYBAR_HIDDEN"] = "noauxiliarybar";
  LayoutClasses2["EDITOR_PANE_HIDDEN"] = "noeditorpane";
  LayoutClasses2["SESSIONS_HIDDEN"] = "nosessionspart";
  LayoutClasses2["CUSTOM_VIEW_GRID_HIDDEN"] = "nocustomviewgrid";
  LayoutClasses2["STATUSBAR_HIDDEN"] = "nostatusbar";
  LayoutClasses2["SHELL_GRADIENT_BACKGROUND"] = "shell-gradient-background";
  LayoutClasses2["FULLSCREEN"] = "fullscreen";
  LayoutClasses2["MAXIMIZED"] = "maximized";
  LayoutClasses2["PHONE_LAYOUT"] = "phone-layout";
  return LayoutClasses2;
})(LayoutClasses || {});
const IAgentWorkbenchLayoutService = refineServiceDecorator(IWorkbenchLayoutService);
const CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID = "sessions.closeMobileSidebarDrawer";
const _Workbench = class _Workbench extends Disposable {
  //#endregion
  constructor(parent, options, serviceCollection, logService) {
    super();
    this.parent = parent;
    this.options = options;
    this.serviceCollection = serviceCollection;
    this.logService = logService;
    //#region Lifecycle Events
    this._onWillShutdown = this._register(new Emitter());
    this.onWillShutdown = this._onWillShutdown.event;
    this._onDidShutdown = this._register(new Emitter());
    this.onDidShutdown = this._onDidShutdown.event;
    //#endregion
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
    // The classic/mobile layout has no docked side pane, so it never fires this.
    // {@link SinglePaneWorkbench} overrides it with a real emitter.
    this.onDidRevealSidePane = Event.None;
    this._onDidChangeNotificationsVisibility = this._register(new Emitter());
    this.onDidChangeNotificationsVisibility = this._onDidChangeNotificationsVisibility.event;
    this._onDidChangeAuxiliaryBarMaximized = this._register(new Emitter());
    this.onDidChangeAuxiliaryBarMaximized = this._onDidChangeAuxiliaryBarMaximized.event;
    this._onDidChangeEditorMaximized = this._register(new Emitter());
    this.onDidChangeEditorMaximized = this._onDidChangeEditorMaximized.event;
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
    //#endregion
    //#region State
    this.parts = /* @__PURE__ */ new Map();
    /** `true` while the editor's current visible state was produced by an explicit user reveal (opening an editor, or toggling the detail panel off) rather than an automatic layout/working-set reveal. Read by the single-pane new-session rule (R1) so it does not undo an explicit reveal. */
    this._editorRevealedExplicitly = false;
    this.partVisibility = {
      sidebar: true,
      auxiliaryBar: true,
      editor: false,
      panel: false,
      sessions: true,
      customViewGrid: false
    };
    this.mainWindowFullscreen = false;
    this.maximized = /* @__PURE__ */ new Set();
    this.layoutPolicy = this._register(new SessionsLayoutPolicy());
    this.mobileNavStack = this._register(new MobileNavigationStack());
    this.mobileTopBarDisposables = this._register(new DisposableStore());
    this._editorMaximized = false;
    /** Guards the grid updates that show/hide the custom view from feeding back into the desired part visibility. */
    this._applyingCustomViewGridVisibility = false;
    this._restoreAttachedEditorMaximizedOnShow = false;
    this._editorPartAutoVisibilitySuppressionCount = 0;
    this._hasAppliedInitialEditorSplit = false;
    this.restoredPromise = new DeferredPromise();
    this.whenRestored = this.restoredPromise.p;
    this.restored = false;
    this.openedDefaultEditors = false;
    this._savedPartSizes = {};
    this.previousUnexpectedError = { message: void 0, time: 0 };
    const metaElements = mainWindow.document.head.getElementsByTagName("meta");
    let viewportMeta;
    for (let i = 0; i < metaElements.length; i++) {
      if (metaElements[i].name === "viewport") {
        viewportMeta = metaElements[i];
        break;
      }
    }
    if (viewportMeta && !viewportMeta.content.includes("viewport-fit=")) {
      viewportMeta.content = `${viewportMeta.content}, viewport-fit=cover`;
    }
    mark("code/willStartWorkbench");
    this.registerErrorHandler(logService);
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
    return this.computeContainerOffset();
  }
  get activeContainerOffset() {
    return this.computeContainerOffset();
  }
  computeContainerOffset() {
    let top = 0;
    let quickPickTop = 0;
    if (this.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
      top = this.getPart(Parts.TITLEBAR_PART).maximumHeight;
      quickPickTop = top;
    } else if (this.mobileTopBarElement) {
      top = this.mobileTopBarElement.offsetHeight;
      quickPickTop = top;
    }
    return { top, quickPickTop };
  }
  /** `false` for the classic/mobile layout; {@link SinglePaneWorkbench} overrides to `true`. */
  get isSinglePaneLayoutEnabled() {
    return false;
  }
  //#region Error Handling
  registerErrorHandler(logService) {
    if (!isFirefox) {
      Error.stackTraceLimit = 100;
    }
    mainWindow.addEventListener("unhandledrejection", (event) => {
      onUnexpectedError(event.reason);
      event.preventDefault();
    });
    setUnexpectedErrorHandler((error) => this.handleUnexpectedError(error, logService));
  }
  handleUnexpectedError(error, logService) {
    const message = toErrorMessage(error, true);
    if (!message) {
      return;
    }
    const now = Date.now();
    if (message === this.previousUnexpectedError.message && now - this.previousUnexpectedError.time <= 1e3) {
      return;
    }
    this.previousUnexpectedError.time = now;
    this.previousUnexpectedError.message = message;
    logService.error(message);
  }
  //#endregion
  //#region Startup
  startup() {
    try {
      this._register(setGlobalLeakWarningThreshold(175));
      const instantiationService = this.initServices(this.serviceCollection);
      instantiationService.invokeFunction((accessor) => {
        const lifecycleService = accessor.get(ILifecycleService);
        const storageService = accessor.get(IStorageService);
        const configurationService = accessor.get(IConfigurationService);
        const hostService = accessor.get(IHostService);
        const hoverService = accessor.get(IHoverService);
        const dialogService = accessor.get(IDialogService);
        const notificationService = accessor.get(INotificationService);
        const markdownRendererService = accessor.get(IMarkdownRendererService);
        if (isWeb && typeof configurationService.acquireInstantiationService === "function") {
          configurationService.acquireInstantiationService(instantiationService);
        }
        markdownRendererService.setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
        setHoverDelegateFactory((placement, enableInstantHover) => instantiationService.createInstance(WorkbenchHoverDelegate, placement, { instantHover: enableInstantHover }, {}));
        setBaseLayerHoverDelegate(hoverService);
        this.initLayout(accessor);
        Registry.as(WorkbenchExtensions.Workbench).start(accessor);
        Registry.as(EditorExtensions.EditorFactory).start(accessor);
        this._register(instantiationService.createInstance(WorkbenchContextKeysHandler));
        const editorMaximizedContext = EditorMaximizedContext.bindTo(accessor.get(IContextKeyService));
        this._register(this.onDidChangeEditorMaximized(() => {
          editorMaximizedContext.set(this.isEditorMaximized());
        }));
        const contextKeyService = accessor.get(IContextKeyService);
        const isPhoneLayoutCtx = IsPhoneLayoutContext.bindTo(contextKeyService);
        this._register(autorun((reader) => {
          isPhoneLayoutCtx.set(this.layoutPolicy.viewportClass.read(reader) === "phone");
        }));
        SinglePaneLayoutEnabledContext.bindTo(contextKeyService).set(this.isSinglePaneLayoutEnabled);
        accessor.get(IMobileVisualViewport);
        this.registerListeners(lifecycleService, storageService, configurationService, hostService, dialogService);
        this.renderWorkbench(instantiationService, notificationService, storageService, configurationService);
        this.createWorkbenchLayout();
        if (this.layoutPolicy.viewportClass.get() === "phone") {
          this.createMobileTitlebar();
        }
        this.createWorkbenchManagement(instantiationService);
        this.layout();
        this.restore(lifecycleService);
      });
      return instantiationService;
    } catch (error) {
      onUnexpectedError(error);
      throw error;
    }
  }
  initServices(serviceCollection) {
    serviceCollection.set(IAgentWorkbenchLayoutService, this);
    serviceCollection.set(ITitleService, new SyncDescriptor(TitleService, []));
    const contributedServices = getSingletonServiceDescriptors();
    for (const [id, descriptor] of contributedServices) {
      serviceCollection.set(id, descriptor);
    }
    const instantiationService = new InstantiationService(serviceCollection, true);
    instantiationService.invokeFunction((accessor) => {
      const lifecycleService = accessor.get(ILifecycleService);
      lifecycleService.phase = LifecyclePhase.Ready;
    });
    return instantiationService;
  }
  registerListeners(lifecycleService, storageService, configurationService, hostService, dialogService) {
    this._register(CommandsRegistry.registerCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID, () => {
      if (this.layoutPolicy.viewportClass.get() === "phone") {
        this.closeMobileSidebarDrawer();
      }
    }));
    this._register(configurationService.onDidChangeConfiguration((e) => this.updateFontAliasing(e, configurationService)));
    if (isNative) {
      this._register(storageService.onWillSaveState((e) => {
        if (e.reason === WillSaveStateReason.SHUTDOWN) {
          this.storeFontInfo(storageService);
        }
      }));
    } else {
      this._register(lifecycleService.onWillShutdown(() => this.storeFontInfo(storageService)));
    }
    this._register(storageService.onWillSaveState(() => this._savePartSizes()));
    this._register(lifecycleService.onWillShutdown((event) => this._onWillShutdown.fire(event)));
    this._register(lifecycleService.onDidShutdown(() => {
      this._onDidShutdown.fire();
      this.dispose();
    }));
    this._register(hostService.onDidChangeFocus((focus) => {
      if (!focus) {
        storageService.flush();
      }
    }));
    this._register(dialogService.onWillShowDialog(() => this.mainContainer.classList.add("modal-dialog-visible")));
    this._register(dialogService.onDidShowDialog(() => this.mainContainer.classList.remove("modal-dialog-visible")));
  }
  updateFontAliasing(e, configurationService) {
    if (!isMacintosh) {
      return;
    }
    if (e && !e.affectsConfiguration("workbench.fontAliasing")) {
      return;
    }
    const aliasing = configurationService.getValue("workbench.fontAliasing");
    if (this.fontAliasing === aliasing) {
      return;
    }
    this.fontAliasing = aliasing;
    const fontAliasingValues = ["antialiased", "none", "auto"];
    this.mainContainer.classList.remove(...fontAliasingValues.map((value) => `monaco-font-aliasing-${value}`));
    if (fontAliasingValues.some((option) => option === aliasing)) {
      this.mainContainer.classList.add(`monaco-font-aliasing-${aliasing}`);
    }
  }
  restoreFontInfo(storageService, configurationService) {
    const storedFontInfoRaw = storageService.get("editorFontInfo", StorageScope.APPLICATION);
    if (storedFontInfoRaw) {
      try {
        const storedFontInfo = JSON.parse(storedFontInfoRaw);
        if (Array.isArray(storedFontInfo)) {
          FontMeasurements.restoreFontInfo(mainWindow, storedFontInfo);
        }
      } catch (err) {
      }
    }
    FontMeasurements.readFontInfo(mainWindow, createBareFontInfoFromRawSettings(configurationService.getValue("editor"), PixelRatio.getInstance(mainWindow).value));
  }
  storeFontInfo(storageService) {
    const serializedFontInfo = FontMeasurements.serializeFontInfo(mainWindow);
    if (serializedFontInfo) {
      storageService.store("editorFontInfo", JSON.stringify(serializedFontInfo), StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
  }
  _loadPartVisibility(storageService) {
    if (this.layoutPolicy.viewportClass.get() === "phone") {
      return {};
    }
    const raw = storageService.get(_Workbench._PART_VISIBILITY_KEY, StorageScope.WORKSPACE);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        storageService.remove(_Workbench._PART_VISIBILITY_KEY, StorageScope.WORKSPACE);
      }
    }
    return {};
  }
  /**
   * Overlays the persisted part visibility on top of the current
   * (layout-policy default) `partVisibility` state. Must run before the
   * `WorkbenchContextKeysHandler` reads the initial visibility so that
   * context keys like `auxiliaryBarVisible` reflect the restored state on
   * reload rather than the hardcoded defaults.
   */
  _applyPersistedPartVisibility() {
    const savedPartVisibility = this._loadPartVisibility(this.storageService);
    this.partVisibility.editor = savedPartVisibility.editor ?? this.partVisibility.editor;
    this.partVisibility.auxiliaryBar = savedPartVisibility.auxiliaryBar ?? this.partVisibility.auxiliaryBar;
    this.partVisibility.sidebar = savedPartVisibility.sidebar ?? this.partVisibility.sidebar;
  }
  _savePartVisibility() {
    if (this.layoutPolicy.viewportClass.get() === "phone") {
      return;
    }
    this.storageService.store(_Workbench._PART_VISIBILITY_KEY, JSON.stringify({
      editor: this.partVisibility.editor,
      auxiliaryBar: this.partVisibility.auxiliaryBar,
      sidebar: this.partVisibility.sidebar
    }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  _loadPartSizes(storageService) {
    const raw = storageService.get(_Workbench._PART_SIZES_KEY, StorageScope.WORKSPACE);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        storageService.remove(_Workbench._PART_SIZES_KEY, StorageScope.WORKSPACE);
      }
    }
    return {};
  }
  _savePartSizes() {
    if (!this.workbenchGrid) {
      return;
    }
    const editorNodeVisible = this._editorNodeShouldBeVisible();
    const editorGridWidth = this._persistedGridViewSize(this.editorPartView, "width", editorNodeVisible);
    let editorWidth = this._persistedEditorWidth(editorGridWidth);
    if (editorWidth === void 0 || editorWidth < EDITOR_PART_MINIMUM_WIDTH) {
      editorWidth = this._savedPartSizes.editor !== void 0 && this._savedPartSizes.editor >= EDITOR_PART_MINIMUM_WIDTH ? this._savedPartSizes.editor : void 0;
    } else {
      this._savedPartSizes = { ...this._savedPartSizes, editor: editorWidth };
    }
    const sizes = {
      sidebar: this._persistedGridViewSize(this.sideBarPartView, "width", this.partVisibility.sidebar),
      auxiliaryBar: this._persistedGridViewSize(this.auxiliaryBarPartView, "width", this._effectiveVisible(Parts.AUXILIARYBAR_PART)),
      sessions: this._persistedGridViewSize(this.sessionsPartView, "width", this._effectiveVisible(Parts.SESSIONS_PART)),
      editor: editorWidth,
      panel: this._persistedGridViewSize(this.panelPartView, "height", this._effectiveVisible(Parts.PANEL_PART))
    };
    this.storageService.store(_Workbench._PART_SIZES_KEY, JSON.stringify(sizes), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  //#endregion
  renderWorkbench(instantiationService, notificationService, storageService, configurationService) {
    setARIAContainer(this.mainContainer);
    setProgressAccessibilitySignalScheduler((msDelayTime, msLoopTime) => instantiationService.createInstance(AccessibilityProgressSignalScheduler, msDelayTime, msLoopTime));
    const initialDimension = getClientArea(this.parent);
    this.layoutPolicy.update(initialDimension.width, initialDimension.height);
    const visibilityDefaults = this.layoutPolicy.getPartVisibilityDefaults();
    this.partVisibility.sidebar = visibilityDefaults.sidebar;
    this.partVisibility.auxiliaryBar = visibilityDefaults.auxiliaryBar;
    this.partVisibility.panel = visibilityDefaults.panel;
    this.partVisibility.sessions = visibilityDefaults.sessions;
    this.partVisibility.editor = visibilityDefaults.editor;
    this._applyPersistedPartVisibility();
    this._savedPartSizes = this._loadPartSizes(storageService);
    if (this._savedPartSizes.auxiliaryBar !== void 0) {
      this._restoreAuxiliaryBarWidth(this._savedPartSizes.auxiliaryBar);
    }
    const platformClass = isWindows ? "windows" : isLinux ? "linux" : "mac";
    const workbenchClasses = coalesce([
      "monaco-workbench",
      "agent-sessions-workbench",
      // LayoutClasses.SHELL_GRADIENT_BACKGROUND,
      platformClass,
      isWeb ? "web" : void 0,
      isChrome ? "chromium" : isFirefox ? "firefox" : isSafari ? "safari" : void 0,
      ...this.getLayoutClasses(),
      ...this.options?.extraClasses ? this.options.extraClasses : []
    ]);
    this.mainContainer.classList.add(...workbenchClasses);
    this.updateFontAliasing(void 0, configurationService);
    this.restoreFontInfo(storageService, configurationService);
    for (const { id, role, classes } of [
      { id: Parts.TITLEBAR_PART, role: "none", classes: ["titlebar"] },
      { id: Parts.SIDEBAR_PART, role: "none", classes: ["sidebar", "left"] },
      { id: Parts.AUXILIARYBAR_PART, role: "none", classes: ["auxiliarybar", "basepanel", "right"] },
      { id: Parts.PANEL_PART, role: "none", classes: ["panel", "basepanel", positionToString(this.getPanelPosition())] }
    ]) {
      const partContainer = this.createPartContainer(id, role, classes);
      mark(`code/willCreatePart/${id}`);
      this.getPart(id).create(partContainer);
      mark(`code/didCreatePart/${id}`);
    }
    this.createEditorPart();
    this.createSessionsPart();
    this.createCustomViewGridPart();
    this.createNotificationsHandlers(instantiationService, notificationService, configurationService);
    this.parent.appendChild(this.mainContainer);
  }
  createMobileTitlebar() {
    this.mobileTopBarDisposables.clear();
    const mobileTitlebar = this.mobileTopBarDisposables.add(this.instantiationService.createInstance(MobileTitlebarPart, this.mainContainer));
    this.mobileTopBarElement = mobileTitlebar.element;
    this.mobileTopBarDisposables.add(mobileTitlebar.onDidClickHamburger(() => {
      this.toggleMobileSidebarDrawer();
    }));
    this.mobileTopBarDisposables.add(mobileTitlebar.onDidClickNewSession(() => {
      this.sessionsService.openNewSession();
      this.closeMobileSidebarDrawer();
      this.sessionsPartService.focusSession(this.sessionsService.activeSession.get());
    }));
  }
  toggleMobileSidebarDrawer() {
    const isOpen = this.partVisibility.sidebar;
    if (isOpen) {
      this.closeMobileSidebarDrawer();
    } else {
      this.openMobileSidebarDrawer();
    }
  }
  openMobileSidebarDrawer() {
    if (!this.mobileNavStack.has("sidebar")) {
      this.mobileNavStack.push("sidebar");
    }
    this.setSideBarHidden(false);
  }
  closeMobileSidebarDrawer() {
    this.setSideBarHidden(true);
    if (this.mobileNavStack.has("sidebar")) {
      this.mobileNavStack.popSilently("sidebar");
    }
  }
  createNotificationsHandlers(instantiationService, notificationService, configurationService) {
    const notificationsCenter = this._register(instantiationService.createInstance(NotificationsCenter, this.mainContainer, notificationService.model));
    const notificationsToasts = this._register(instantiationService.createInstance(NotificationsToasts, this.mainContainer, notificationService.model));
    this._register(instantiationService.createInstance(NotificationsAlerts, notificationService.model));
    const notificationsStatus = this._register(instantiationService.createInstance(NotificationsStatus, notificationService.model));
    this._register(notificationsCenter.onDidChangeVisibility(() => {
      notificationsStatus.update(notificationsCenter.isVisible, notificationsToasts.isVisible);
      notificationsToasts.update(notificationsCenter.isVisible);
    }));
    this._register(notificationsToasts.onDidChangeVisibility(() => {
      notificationsStatus.update(notificationsCenter.isVisible, notificationsToasts.isVisible);
    }));
    registerNotificationCommands(notificationsCenter, notificationsToasts, notificationService.model);
    AccessibleViewRegistry.register(new NotificationAccessibleView());
    this.registerSessionsNotificationOffsets(configurationService, notificationsCenter, notificationsToasts);
    this.registerNotifications({
      onDidChangeNotificationsVisibility: Event.map(
        Event.any(notificationsToasts.onDidChangeVisibility, notificationsCenter.onDidChangeVisibility),
        () => notificationsToasts.isVisible || notificationsCenter.isVisible
      )
    });
  }
  registerSessionsNotificationOffsets(configurationService, notificationsCenter, notificationsToasts) {
    const applySessionsNotificationOffsets = () => {
      const position = getNotificationsPosition(configurationService);
      const notificationsCenterContainer = this.getWorkbenchChildByClassName("notifications-center");
      const notificationsToastsContainer = this.getWorkbenchChildByClassName("notifications-toasts");
      if (position === NotificationsPosition.TOP_RIGHT) {
        notificationsCenterContainer?.style.setProperty("top", "40px");
        notificationsToastsContainer?.style.setProperty("top", "40px");
      }
    };
    this._register(this.onDidLayoutMainContainer(() => applySessionsNotificationOffsets()));
    this._register(notificationsCenter.onDidChangeVisibility(() => applySessionsNotificationOffsets()));
    this._register(notificationsToasts.onDidChangeVisibility(() => applySessionsNotificationOffsets()));
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotificationsSettings.NOTIFICATIONS_POSITION)) {
        applySessionsNotificationOffsets();
      }
    }));
  }
  getWorkbenchChildByClassName(className) {
    for (const child of this.mainContainer.children) {
      if (isHTMLElement(child) && child.classList.contains(className)) {
        return child;
      }
    }
    return void 0;
  }
  createPartContainer(id, role, classes) {
    const part = document.createElement("div");
    part.classList.add("part", ...classes);
    part.id = id;
    part.setAttribute("role", role);
    return part;
  }
  createEditorPart() {
    const editorPartContainer = document.createElement("div");
    editorPartContainer.classList.add("part", "editor");
    editorPartContainer.id = Parts.EDITOR_PART;
    editorPartContainer.setAttribute("role", "main");
    this._editorPartContainer = editorPartContainer;
    mark("code/willCreatePart/workbench.parts.editor");
    this.getPart(Parts.EDITOR_PART).create(editorPartContainer, { restorePreviousState: false });
    mark("code/didCreatePart/workbench.parts.editor");
    this.mainContainer.appendChild(editorPartContainer);
  }
  createSessionsPart() {
    const sessionsPartContainer = document.createElement("div");
    sessionsPartContainer.classList.add("part", "sessionspart", "basepanel", "right", AGENTS_PART_CARD_CLASS);
    sessionsPartContainer.id = Parts.SESSIONS_PART;
    sessionsPartContainer.setAttribute("role", "main");
    mark(`code/willCreatePart/${Parts.SESSIONS_PART}`);
    this.getPart(Parts.SESSIONS_PART).create(sessionsPartContainer);
    mark(`code/didCreatePart/${Parts.SESSIONS_PART}`);
    this.mainContainer.appendChild(sessionsPartContainer);
  }
  createCustomViewGridPart() {
    const customViewGridPartContainer = document.createElement("div");
    customViewGridPartContainer.classList.add("part", "customviewgridpart", "basepanel", "right", AGENTS_PART_CARD_CLASS);
    customViewGridPartContainer.id = Parts.CUSTOM_VIEW_GRID_PART;
    customViewGridPartContainer.setAttribute("role", "main");
    mark(`code/willCreatePart/${Parts.CUSTOM_VIEW_GRID_PART}`);
    this.getPart(Parts.CUSTOM_VIEW_GRID_PART).create(customViewGridPartContainer);
    mark(`code/didCreatePart/${Parts.CUSTOM_VIEW_GRID_PART}`);
    this.mainContainer.appendChild(customViewGridPartContainer);
  }
  restore(lifecycleService) {
    mark("code/didStartWorkbench");
    performance.measure("perf: workbench create & restore", "code/didLoadWorkbenchMain", "code/didStartWorkbench");
    this.restoreParts();
    void this.sessionsService.restoreVisibleSessions().catch((e) => {
      this.logService.error("[Workbench] restoreVisibleSessions failed", e);
    });
    lifecycleService.phase = LifecyclePhase.Restored;
    this.setRestored();
    const eventuallyPhaseScheduler = this._register(new RunOnceScheduler(() => {
      this._register(runWhenWindowIdle(mainWindow, () => lifecycleService.phase = LifecyclePhase.Eventually, 2500));
    }, 2500));
    eventuallyPhaseScheduler.schedule();
  }
  restoreParts() {
    const partsToRestore = [
      { location: ViewContainerLocation.Sidebar, visible: this.partVisibility.sidebar },
      { location: ViewContainerLocation.Panel, visible: this.partVisibility.panel },
      { location: ViewContainerLocation.AuxiliaryBar, visible: this.partVisibility.auxiliaryBar }
    ];
    for (const { location, visible } of partsToRestore) {
      if (visible) {
        const defaultViewContainer = this.viewDescriptorService.getDefaultViewContainer(location);
        if (defaultViewContainer) {
          this.paneCompositeService.openPaneComposite(defaultViewContainer.id, location);
        }
      }
    }
  }
  //#endregion
  //#region Initialization
  initLayout(accessor) {
    this.editorGroupService = accessor.get(IEditorGroupsService);
    this.editorService = accessor.get(IEditorService);
    this.paneCompositeService = accessor.get(IPaneCompositePartService);
    this.viewDescriptorService = accessor.get(IViewDescriptorService);
    this.sessionsService = accessor.get(ISessionsService);
    this.sessionsPartService = accessor.get(ISessionsPartService);
    this.customViewService = accessor.get(ICustomViewService);
    this.customViewGridPartService = accessor.get(ICustomViewGridPartService);
    this.instantiationService = accessor.get(IInstantiationService);
    this.storageService = accessor.get(IStorageService);
    accessor.get(ITitleService);
    this.layoutPolicy.setSinglePane(this.isSinglePaneLayoutEnabled);
    this.registerLayoutListeners();
    this._customViewVisibleKey = CustomViewVisibleContext.bindTo(accessor.get(IContextKeyService));
    this._register(autorun((reader) => {
      this._applyCustomViewGridVisibility(this.customViewService.activeCustomView.read(reader));
    }));
    this._register(this.editorService.onWillOpenEditor((e) => this.revealEditorOnOpen(e)));
    this._register(this.editorService.onDidCloseEditor(() => this.handleDidCloseEditor()));
    this._mainContainerDimension = getClientArea(this.parent, new Dimension(800, 600));
    this.layoutPolicy.update(this._mainContainerDimension.width, this._mainContainerDimension.height);
    const visDefaults = this.layoutPolicy.getPartVisibilityDefaults();
    this.partVisibility.sidebar = visDefaults.sidebar;
    this.partVisibility.auxiliaryBar = visDefaults.auxiliaryBar;
    this.partVisibility.panel = visDefaults.panel;
    this.partVisibility.sessions = visDefaults.sessions;
    this.partVisibility.editor = visDefaults.editor;
    this._applyPersistedPartVisibility();
  }
  areAllGroupsInMainPartEmpty() {
    for (const group of this.editorGroupService.mainPart.groups) {
      if (!group.isEmpty) {
        return false;
      }
    }
    return true;
  }
  revealEditorOnOpen(e) {
    if (this._editorPartAutoVisibilitySuppressionCount > 0) {
      return;
    }
    const group = this.editorGroupService.mainPart.groups.find((g) => g.id === e.groupId);
    if (!group) {
      return;
    }
    if (!this.partVisibility.editor) {
      this.setEditorHidden(
        false,
        /* explicit */
        true
      );
      this.restoreAttachedEditorMaximizedState();
    }
  }
  handleDidCloseEditor() {
    if (this._editorPartAutoVisibilitySuppressionCount > 0 || !this.areAllGroupsInMainPartEmpty()) {
      return;
    }
    this._handleAllEditorsClosed();
  }
  suppressEditorPartAutoVisibility() {
    this._editorPartAutoVisibilitySuppressionCount++;
    let disposed = false;
    return toDisposable(() => {
      if (disposed) {
        return;
      }
      disposed = true;
      this._editorPartAutoVisibilitySuppressionCount--;
    });
  }
  rememberAttachedEditorMaximizedState() {
    this._restoreAttachedEditorMaximizedOnShow = this._editorMaximized && this.partVisibility.auxiliaryBar;
  }
  restoreAttachedEditorMaximizedState() {
    const shouldRestore = this._restoreAttachedEditorMaximizedOnShow && this.partVisibility.auxiliaryBar;
    this._restoreAttachedEditorMaximizedOnShow = false;
    if (shouldRestore) {
      this.setEditorMaximized(true);
    }
  }
  //#region Side-pane layout hooks (classic grid defaults; overridden by SinglePaneWorkbench)
  _fireDidChangePartVisibility(partId, visible, source) {
    this._onDidChangePartVisibility.fire({ partId, visible, source });
  }
  _notifyContainerDidLayout() {
    this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
  }
  _setMainEditorAreaHidden(hidden) {
    this.mainContainer.classList.toggle("nomaineditorarea" /* MAIN_EDITOR_AREA_HIDDEN */, hidden);
  }
  /**
   * Handles a change in the editor-part grid view's visibility. In the classic
   * layout the editor part is a standalone grid view, so its view visibility *is*
   * the editor visibility — map it to `setEditorHidden` and raise the part event.
   * Single-pane overrides this: its editor-part grid view also hosts the docked
   * auxiliary bar, so the view can become visible purely to show the detail while
   * the editor content stays hidden; it fires its own editor-part events instead.
   */
  _onEditorPartGridVisibilityChange(visible) {
    this.setEditorHidden(!visible);
    this._onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible });
  }
  get _isEditorPartAutoVisibilitySuppressed() {
    return this._editorPartAutoVisibilitySuppressionCount > 0;
  }
  /** Toggles the container marker class for the side-pane layout. */
  _applyLayoutContainerClass() {
    this.mainContainer.classList.toggle("dock-detail-panel", false);
  }
  /** Width the auxiliary bar occupies when visible (for max-editor-dimension math). */
  _auxiliaryBarLayoutWidth() {
    return this.workbenchGrid ? this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width : 0;
  }
  _auxiliaryBarViewSize() {
    if (!this.workbenchGrid || !this.auxiliaryBarPartView) {
      return { width: 0, height: 0 };
    }
    return this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);
  }
  _setAuxiliaryBarViewSize(size2) {
    if (this.auxiliaryBarPartView) {
      this.workbenchGrid.resizeView(this.auxiliaryBarPartView, size2);
    }
  }
  _resizeAuxiliaryBarBy(deltaWidth, deltaHeight) {
    if (!this.auxiliaryBarPartView) {
      return;
    }
    const currentSize = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);
    this.workbenchGrid.resizeView(this.auxiliaryBarPartView, {
      width: currentSize.width + deltaWidth,
      height: currentSize.height + deltaHeight
    });
  }
  _restoreAuxiliaryBarWidth(_width) {
  }
  /**
   * Reads a part's size from the workbench grid for persistence. For visible
   * parts, the current view size; for hidden parts, the grid's cached visible
   * size (the size it had the last time it was shown) so toggling visibility
   * later restores the same dimensions. Overridden by the single-pane layout for
   * its docked auxiliary bar, which is not a grid view.
   */
  _persistedGridViewSize(view, dimension, visible) {
    if (visible) {
      return this.workbenchGrid.getViewSize(view)[dimension];
    }
    return this.workbenchGrid.getViewCachedVisibleSize(view);
  }
  _persistedEditorWidth(editorGridWidth) {
    return editorGridWidth;
  }
  _defaultSideBarSize(policySideBarSize) {
    return policySideBarSize;
  }
  _editorNodeSize(effectiveEditorWidth, _effectiveAuxBarWidth) {
    return effectiveEditorWidth;
  }
  _editorNodeVisible(editorVisible, _auxBarVisible) {
    return editorVisible;
  }
  _topRightSectionChildren(sessionsNode, editorNode, auxiliaryBarNode, customViewGridNode) {
    return [sessionsNode, editorNode, auxiliaryBarNode, customViewGridNode];
  }
  /** Attach any per-layout controllers once the editor part container exists. */
  _attachSidePane() {
  }
  /** Lay out any docked overlay. */
  _layoutSidePane() {
  }
  /** React to a whole-grid change (e.g. a sash drag) after the grid rebuilds. */
  _onGridDidChange() {
  }
  /** React to the editor grid node being resized to `nodeWidth`. */
  _onEditorNodeResized(_nodeWidth) {
  }
  /** Run editor-node work with the reveal-sync suspended (no-op for the grid layout). */
  _runWithEditorResizeSyncSuspended(fn) {
    fn();
  }
  _applyEditorVisibility(hidden) {
    const shouldApplyEvenSplit = !hidden && !this._hasAppliedInitialEditorSplit;
    const mainAreaWidth = this.workbenchGrid.getViewSize(this.sessionsPartView).width;
    this.workbenchGrid.setViewVisible(this.editorPartView, this._editorNodeShouldBeVisible());
    if (shouldApplyEvenSplit) {
      this._hasAppliedInitialEditorSplit = true;
      this._applyEditorSplitSize(mainAreaWidth);
    }
  }
  _onWillHideAuxiliaryBar(_hidden) {
  }
  _applyAuxiliaryBarVisibility(hidden, _source) {
    if (this.workbenchGrid) {
      this.workbenchGrid.setViewVisible(this.auxiliaryBarPartView, this._effectiveVisible(Parts.AUXILIARYBAR_PART));
    }
  }
  _shouldOpenAuxiliaryPaneComposite(_containerId) {
    return true;
  }
  _handleAllEditorsClosed() {
    if (this.partVisibility.editor) {
      this.rememberAttachedEditorMaximizedState();
      this.setEditorHidden(true);
    }
  }
  _prepareSideBarResize(_hidden) {
    return {};
  }
  _applySideBarResize(_hidden, _context) {
  }
  //#endregion
  registerLayoutListeners() {
    this._register(onDidChangeFullscreen((windowId) => {
      if (windowId === getWindowId(mainWindow)) {
        this.mainWindowFullscreen = isFullscreen(mainWindow);
        this.updateFullscreenClass();
        this.layout();
      }
    }));
    const onWindowResize = () => this.layout();
    this._register(addDisposableListener(mainWindow, "resize", onWindowResize));
  }
  updateFullscreenClass() {
    if (this.mainWindowFullscreen) {
      this.mainContainer.classList.add("fullscreen" /* FULLSCREEN */);
    } else {
      this.mainContainer.classList.remove("fullscreen" /* FULLSCREEN */);
    }
  }
  //#endregion
  //#region Workbench Layout Creation
  createWorkbenchLayout() {
    this._applyLayoutContainerClass();
    const titleBar = this.getPart(Parts.TITLEBAR_PART);
    const editorPart = this.getPart(Parts.EDITOR_PART);
    const panelPart = this.getPart(Parts.PANEL_PART);
    const auxiliaryBarPart = this.getPart(Parts.AUXILIARYBAR_PART);
    const sideBar = this.getPart(Parts.SIDEBAR_PART);
    const sessionsPart = this.getPart(Parts.SESSIONS_PART);
    const customViewGridPart = this.getPart(Parts.CUSTOM_VIEW_GRID_PART);
    this.titleBarPartView = titleBar;
    this.sideBarPartView = sideBar;
    this.panelPartView = panelPart;
    this.auxiliaryBarPartView = auxiliaryBarPart;
    this.sessionsPartView = sessionsPart;
    this.customViewGridPartView = customViewGridPart;
    this.editorPartView = editorPart;
    const viewMap = {
      [Parts.TITLEBAR_PART]: this.titleBarPartView,
      [Parts.PANEL_PART]: this.panelPartView,
      [Parts.SIDEBAR_PART]: this.sideBarPartView,
      [Parts.AUXILIARYBAR_PART]: this.auxiliaryBarPartView,
      [Parts.SESSIONS_PART]: this.sessionsPartView,
      [Parts.CUSTOM_VIEW_GRID_PART]: this.customViewGridPartView,
      [Parts.EDITOR_PART]: this.editorPartView
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
    this.workbenchGrid.edgeSnapping = this.mainWindowFullscreen;
    this._register(this.workbenchGrid.onDidChange(() => {
      this._onGridDidChange();
    }));
    this._hasAppliedInitialEditorSplit = this.partVisibility.editor;
    for (const part of [titleBar, panelPart, sideBar, auxiliaryBarPart, sessionsPart, editorPart]) {
      this._register(part.onDidVisibilityChange((visible) => {
        if (this._applyingCustomViewGridVisibility) {
          return;
        }
        if (part === editorPart) {
          this._onEditorPartGridVisibilityChange(visible);
          this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
          return;
        }
        if (part === sideBar) {
          this.setSideBarHidden(!visible);
        } else if (part === panelPart) {
          this.setPanelHidden(!visible);
        } else if (part === auxiliaryBarPart) {
          this.setAuxiliaryBarHidden(!visible);
        } else if (part === sessionsPart) {
          this.setSessionsHidden(!visible);
        }
        this._onDidChangePartVisibility.fire({ partId: part.getId(), visible });
        this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
      }));
    }
    this._register(this.mobileNavStack.onDidPop((layer) => {
      switch (layer) {
        case "sidebar":
          this.closeMobileSidebarDrawer();
          break;
        case "panel":
          this.setPanelHidden(true);
          break;
        case "auxbar":
          this.setAuxiliaryBarHidden(true);
          break;
        case "customView":
          this.customViewService.hideCustomView();
          break;
        case "editor":
          break;
      }
    }));
  }
  createWorkbenchManagement(instantiationService) {
    instantiationService.invokeFunction((accessor) => accessor.get(ISessionsSetUpService));
  }
  /**
   * Creates the grid descriptor for the Agent Sessions layout.
   *
   * Structure (horizontal orientation):
   * - Sidebar (left, spans full height from top to bottom)
   * - Right section (vertical):
   *   - Titlebar (top of right section)
   *   - Top right (horizontal): Chat Bar | Editor | Auxiliary Bar
   *   - Panel (below chat, editor, and auxiliary bar)
   */
  createGridDescriptor() {
    const { width, height } = this._mainContainerDimension;
    return this.createDesktopGridDescriptor(width, height);
  }
  /**
   * Standard multi-part layout for all viewport classes.
   * On phone, the titlebar is hidden via CSS and a MobileTitlebarPart
   * is prepended before the grid. Sidebar/panel/auxbar are hidden
   * in the grid via partVisibility defaults.
   */
  createDesktopGridDescriptor(width, height) {
    const sizes = this.layoutPolicy.getPartSizes(width, height);
    const defaultSideBarSize = this._defaultSideBarSize(sizes.sideBarSize);
    const sideBarSize = this._savedPartSizes.sidebar ?? (this.partVisibility.sidebar ? defaultSideBarSize : Math.max(defaultSideBarSize, 250));
    const defaultAuxiliaryBarSize = this.isSinglePaneLayoutEnabled ? this.getDockedAuxiliaryBarWidth() : sizes.auxiliaryBarSize;
    const auxiliaryBarSize = this._savedPartSizes.auxiliaryBar ?? (this.partVisibility.auxiliaryBar ? defaultAuxiliaryBarSize : Math.max(defaultAuxiliaryBarSize, 300));
    const panelSize = this._savedPartSizes.panel ?? (this.partVisibility.panel ? sizes.panelSize : Math.max(sizes.panelSize, 250));
    const savedEditorWidth = this._savedPartSizes.editor;
    const editorSize = savedEditorWidth !== void 0 && savedEditorWidth >= EDITOR_PART_MINIMUM_WIDTH ? savedEditorWidth : EDITOR_PART_DEFAULT_WIDTH;
    const titleBarHeight = this.titleBarPartView?.minimumHeight ?? 30;
    const effectiveSideBarWidth = this.partVisibility.sidebar ? sideBarSize : 0;
    const rightSectionWidth = Math.max(0, width - effectiveSideBarWidth);
    const effectiveAuxBarWidth = this.partVisibility.auxiliaryBar ? auxiliaryBarSize : 0;
    const effectiveEditorWidth = this.partVisibility.editor ? editorSize : 0;
    const sessionsWidth = this._savedPartSizes.sessions ?? Math.max(0, rightSectionWidth - effectiveAuxBarWidth - effectiveEditorWidth);
    const contentHeight = Math.max(0, height - titleBarHeight);
    const topRightHeight = Math.max(0, contentHeight - panelSize);
    const isPhone = this.layoutPolicy.viewportClass.get() === "phone";
    const titleBarNode = {
      type: "leaf",
      data: { type: Parts.TITLEBAR_PART },
      size: titleBarHeight,
      visible: !isPhone
    };
    const sideBarNode = {
      type: "leaf",
      data: { type: Parts.SIDEBAR_PART },
      size: sideBarSize,
      visible: this.partVisibility.sidebar
    };
    const sessionsNode = {
      type: "leaf",
      data: { type: Parts.SESSIONS_PART },
      size: sessionsWidth,
      visible: this._effectiveVisible(Parts.SESSIONS_PART)
    };
    const customViewGridNode = {
      type: "leaf",
      data: { type: Parts.CUSTOM_VIEW_GRID_PART },
      size: rightSectionWidth,
      visible: this.partVisibility.customViewGrid
    };
    const editorNode = {
      type: "leaf",
      data: { type: Parts.EDITOR_PART },
      size: this._editorNodeSize(effectiveEditorWidth, effectiveAuxBarWidth),
      visible: this._editorNodeShouldBeVisible()
    };
    const auxiliaryBarNode = {
      type: "leaf",
      data: { type: Parts.AUXILIARYBAR_PART },
      size: auxiliaryBarSize,
      visible: this._effectiveVisible(Parts.AUXILIARYBAR_PART)
    };
    const panelNode = {
      type: "leaf",
      data: { type: Parts.PANEL_PART },
      size: panelSize,
      visible: this._effectiveVisible(Parts.PANEL_PART)
    };
    const topRightSection = {
      type: "branch",
      data: this._topRightSectionChildren(sessionsNode, editorNode, auxiliaryBarNode, customViewGridNode),
      size: topRightHeight
    };
    const rightSection = {
      type: "branch",
      data: [topRightSection, panelNode],
      size: rightSectionWidth
    };
    const contentSection = {
      type: "branch",
      data: [sideBarNode, rightSection],
      size: contentHeight
    };
    const result = {
      root: {
        type: "branch",
        size: width,
        data: [
          titleBarNode,
          contentSection
        ]
      },
      orientation: Orientation.VERTICAL,
      width,
      height
    };
    return result;
  }
  layout() {
    this._mainContainerDimension = getClientArea(
      this.mainWindowFullscreen ? mainWindow.document.body : this.parent
    );
    const previousClass = this._previousViewportClass;
    this.layoutPolicy.update(this._mainContainerDimension.width, this._mainContainerDimension.height);
    const currentClass = this.layoutPolicy.viewportClass.get();
    this.mainContainer.classList.toggle("phone-layout" /* PHONE_LAYOUT */, currentClass === "phone");
    if (previousClass !== void 0 && previousClass !== currentClass) {
      if (currentClass === "phone" && !this.mobileTopBarElement) {
        this.createMobileTitlebar();
        this.workbenchGrid.setViewVisible(this.titleBarPartView, false);
        const defaults = this.layoutPolicy.getPartVisibilityDefaults();
        if (this.partVisibility.sidebar !== defaults.sidebar) {
          this.setSideBarHidden(!defaults.sidebar);
        }
        if (this.partVisibility.auxiliaryBar !== defaults.auxiliaryBar) {
          this.setAuxiliaryBarHidden(!defaults.auxiliaryBar);
        }
        if (this.partVisibility.panel !== defaults.panel) {
          this.setPanelHidden(!defaults.panel);
        }
      } else if (currentClass !== "phone" && this.mobileTopBarElement) {
        this.mobileTopBarDisposables.clear();
        this.mobileTopBarElement = void 0;
        this.workbenchGrid.setViewVisible(this.titleBarPartView, true);
        const defaults = this.layoutPolicy.getPartVisibilityDefaults();
        if (this.partVisibility.sidebar !== defaults.sidebar) {
          this.setSideBarHidden(!defaults.sidebar);
        }
        if (this.partVisibility.sessions !== defaults.sessions) {
          this.setSessionsHidden(!defaults.sessions);
        }
        if (this.partVisibility.auxiliaryBar !== defaults.auxiliaryBar) {
          this.setAuxiliaryBarHidden(!defaults.auxiliaryBar);
        }
        if (this.partVisibility.panel !== defaults.panel) {
          this.setPanelHidden(!defaults.panel);
        }
      }
      for (const partId of [Parts.SESSIONS_PART, Parts.CUSTOM_VIEW_GRID_PART, Parts.SIDEBAR_PART, Parts.AUXILIARYBAR_PART, Parts.PANEL_PART]) {
        this.parts.get(partId)?.updateStyles();
      }
      this._updateMobileCustomViewNavigation();
    }
    this._previousViewportClass = currentClass;
    this.logService.trace(`Workbench#layout, height: ${this._mainContainerDimension.height}, width: ${this._mainContainerDimension.width}`);
    size(this.mainContainer, this._mainContainerDimension.width, this._mainContainerDimension.height);
    this._layoutGrid();
    this._attachSidePane();
    this._layoutSidePane();
    this.layoutMobileSidebar();
    this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
  }
  _layoutGrid() {
    const mobileTopBarHeight = this.mobileTopBarElement?.offsetHeight ?? 0;
    const isPhone = this.layoutPolicy.viewportClass.get() === "phone";
    const gridGutterW = isPhone ? 0 : this.partVisibility.sidebar ? 14 : 20;
    const gridGutterH = isPhone ? 0 : 10;
    this.workbenchGrid.layout(
      this._mainContainerDimension.width - gridGutterW,
      this._mainContainerDimension.height - mobileTopBarHeight - gridGutterH
    );
  }
  handleDockedEditorPartLayout(nodeWidth) {
    this._onEditorNodeResized(nodeWidth);
  }
  isEditorRevealedExplicitly() {
    return this._editorRevealedExplicitly;
  }
  revealEditorPartExplicitly() {
    this._editorRevealedExplicitly = true;
    this.setEditorHidden(
      false,
      /* explicit */
      true
    );
  }
  getDockedAuxiliaryBarWidth() {
    return 0;
  }
  setDockedAuxiliaryBarWidth(_width) {
  }
  layoutMobileSidebar() {
    const sidebarContainer = this.getContainer(mainWindow, Parts.SIDEBAR_PART);
    const sidebarPart = this.getPart(Parts.SIDEBAR_PART);
    if (!sidebarContainer) {
      return;
    }
    const isPhone = this.layoutPolicy.viewportClass.get() === "phone";
    if (!isPhone || !this.partVisibility.sidebar) {
      sidebarContainer.classList.remove("mobile-overlay-sidebar");
      return;
    }
    sidebarContainer.classList.add("mobile-overlay-sidebar");
    const topBarHeight = this.mobileTopBarElement?.offsetHeight ?? 48;
    const drawerWidth = this._mainContainerDimension.width;
    const drawerHeight = Math.max(0, this._mainContainerDimension.height - topBarHeight);
    sidebarPart.layout(drawerWidth, drawerHeight, topBarHeight, 0);
  }
  handleContainerDidLayout(container, dimension) {
    this._onDidLayoutContainer.fire({ container, dimension });
    if (container === this.mainContainer) {
      this._onDidLayoutMainContainer.fire(dimension);
    }
    if (container === this.activeContainer) {
      this._onDidLayoutActiveContainer.fire(dimension);
    }
  }
  isFloatingPanelsEnabled() {
    return false;
  }
  getLayoutClasses() {
    return coalesce([
      !this.partVisibility.sidebar ? "nosidebar" /* SIDEBAR_HIDDEN */ : void 0,
      !this._effectiveVisible(Parts.EDITOR_PART) ? "nomaineditorarea" /* MAIN_EDITOR_AREA_HIDDEN */ : void 0,
      !this._effectiveVisible(Parts.PANEL_PART) ? "nopanel" /* PANEL_HIDDEN */ : void 0,
      !this._effectiveVisible(Parts.AUXILIARYBAR_PART) ? "noauxiliarybar" /* AUXILIARYBAR_HIDDEN */ : void 0,
      !this.isEditorPaneVisible() ? "noeditorpane" /* EDITOR_PANE_HIDDEN */ : void 0,
      !this._effectiveVisible(Parts.SESSIONS_PART) ? "nosessionspart" /* SESSIONS_HIDDEN */ : void 0,
      !this.partVisibility.customViewGrid ? "nocustomviewgrid" /* CUSTOM_VIEW_GRID_HIDDEN */ : void 0,
      "nostatusbar" /* STATUSBAR_HIDDEN */,
      // agents window never has a status bar
      this.mainWindowFullscreen ? "fullscreen" /* FULLSCREEN */ : void 0,
      this.layoutPolicy.viewportClass.get() === "phone" ? "phone-layout" /* PHONE_LAYOUT */ : void 0
    ]);
  }
  isEditorPaneVisible() {
    return this._effectiveVisible(Parts.EDITOR_PART) || this._effectiveVisible(Parts.AUXILIARYBAR_PART);
  }
  _updateEditorPaneVisibilityClass() {
    this.mainContainer.classList.toggle("noeditorpane" /* EDITOR_PANE_HIDDEN */, !this.isEditorPaneVisible());
  }
  //#endregion
  //#region Part Management
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
  hasFocus(part) {
    const container = this.getContainer(mainWindow, part);
    if (!container) {
      return false;
    }
    const activeElement = getActiveElement();
    if (!activeElement) {
      return false;
    }
    return isAncestorUsingFlowTo(activeElement, container);
  }
  focusPart(part, targetWindow = mainWindow) {
    switch (part) {
      case Parts.EDITOR_PART:
        this.editorGroupService.activeGroup.focus();
        break;
      case Parts.PANEL_PART:
        this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)?.focus();
        break;
      case Parts.SIDEBAR_PART:
        this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)?.focus();
        break;
      case Parts.AUXILIARYBAR_PART:
        this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.focus();
        break;
      case Parts.SESSIONS_PART:
        this.getPart(Parts.SESSIONS_PART).getContainer()?.focus();
        break;
      case Parts.CUSTOM_VIEW_GRID_PART:
        this.customViewGridPartService.focusActiveView();
        break;
      default: {
        const container = this.getContainer(targetWindow, part);
        container?.focus();
      }
    }
  }
  focus() {
    this.focusPart(Parts.SESSIONS_PART);
  }
  getContainer(targetWindow, part) {
    if (typeof part === "undefined") {
      return this.getContainerFromDocument(targetWindow.document);
    }
    if (targetWindow === mainWindow) {
      return this.parts.get(part)?.getContainer();
    }
    if (part === Parts.EDITOR_PART) {
      const container = this.getContainerFromDocument(targetWindow.document);
      const partCandidate = this.editorGroupService.getPart(container);
      if (partCandidate instanceof Part) {
        return partCandidate.getContainer();
      }
    }
    return void 0;
  }
  whenContainerStylesLoaded(_window) {
    return void 0;
  }
  //#endregion
  //#region Part Visibility
  isActivityBarHidden() {
    return true;
  }
  /** The desired visibility of a part, ignoring any custom view showing over it. */
  _desiredVisible(part) {
    switch (part) {
      case Parts.SESSIONS_PART:
        return this.partVisibility.sessions;
      case Parts.EDITOR_PART:
        return this.partVisibility.editor;
      case Parts.AUXILIARYBAR_PART:
        return this.partVisibility.auxiliaryBar;
      case Parts.PANEL_PART:
        return this.partVisibility.panel;
      default:
        return false;
    }
  }
  /** Whether a part is actually rendered right now. */
  _effectiveVisible(part) {
    return this._desiredVisible(part) && !this.partVisibility.customViewGrid;
  }
  /**
   * Whether the editor grid node should be shown. In the single-pane layout the
   * node also hosts the docked auxiliary bar, so it follows both parts.
   */
  _editorNodeShouldBeVisible() {
    return this._editorNodeVisible(this._effectiveVisible(Parts.EDITOR_PART), this._effectiveVisible(Parts.AUXILIARYBAR_PART));
  }
  isVisible(part, targetWindow) {
    switch (part) {
      case Parts.TITLEBAR_PART:
        return this.layoutPolicy.viewportClass.get() !== "phone";
      case Parts.SIDEBAR_PART:
        return this.partVisibility.sidebar;
      case Parts.AUXILIARYBAR_PART:
      case Parts.EDITOR_PART:
      case Parts.PANEL_PART:
      case Parts.SESSIONS_PART:
        return this._effectiveVisible(part);
      case Parts.CUSTOM_VIEW_GRID_PART:
        return this.partVisibility.customViewGrid;
      case Parts.ACTIVITYBAR_PART:
      case Parts.STATUSBAR_PART:
      case Parts.BANNER_PART:
      default:
        return false;
    }
  }
  setPartHidden(hidden, part) {
    switch (part) {
      case Parts.SIDEBAR_PART:
        this.setSideBarHidden(hidden);
        break;
      case Parts.AUXILIARYBAR_PART:
        this.setAuxiliaryBarHidden(hidden);
        break;
      case Parts.EDITOR_PART:
        this.setEditorHidden(hidden);
        break;
      case Parts.PANEL_PART:
        this.setPanelHidden(hidden);
        break;
      case Parts.SESSIONS_PART:
        this.setSessionsHidden(hidden);
        break;
    }
  }
  toggleSecondarySideBar() {
    if (this.partVisibility.customViewGrid) {
      return;
    }
    const visible = !this.isSecondarySideBarVisible();
    this.setAuxiliaryBarHidden(!visible);
    alert(visible ? localize("auxiliaryBarVisible", "Secondary Side Bar shown") : localize("auxiliaryBarHidden", "Secondary Side Bar hidden"));
  }
  isSecondarySideBarVisible() {
    return this.isVisible(Parts.AUXILIARYBAR_PART);
  }
  setSideBarHidden(hidden) {
    if (this.partVisibility.sidebar === !hidden) {
      return;
    }
    const resizeContext = this._prepareSideBarResize(hidden);
    this.partVisibility.sidebar = !hidden;
    this.mainContainer.classList.toggle("nosidebar" /* SIDEBAR_HIDDEN */, hidden);
    this.workbenchGrid.setViewVisible(
      this.sideBarPartView,
      !hidden
    );
    this._applySideBarResize(hidden, resizeContext);
    if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)) {
      this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Sidebar);
    }
    if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)) {
      const viewletToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.Sidebar) ?? this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Sidebar)?.id;
      if (viewletToOpen) {
        this.paneCompositeService.openPaneComposite(viewletToOpen, ViewContainerLocation.Sidebar);
      }
    }
    this.layoutMobileSidebar();
    this._savePartVisibility();
    this._layoutGrid();
  }
  setAuxiliaryBarHidden(hidden) {
    this._setAuxiliaryBarHidden(hidden);
  }
  setAuxiliaryBarHiddenForResize(hidden) {
    this._setAuxiliaryBarHidden(hidden, "resize");
  }
  _setAuxiliaryBarHidden(hidden, source) {
    if (this.partVisibility.auxiliaryBar === !hidden) {
      return;
    }
    const sidePaneWasClosed = !this.partVisibility.editor && !this.partVisibility.auxiliaryBar;
    if (hidden) {
      this._restoreAttachedEditorMaximizedOnShow = false;
    }
    this._onWillHideAuxiliaryBar(hidden);
    this.partVisibility.auxiliaryBar = !hidden;
    this.mainContainer.classList.toggle("noauxiliarybar" /* AUXILIARYBAR_HIDDEN */, !this._effectiveVisible(Parts.AUXILIARYBAR_PART));
    this._applyAuxiliaryBarVisibility(hidden, source);
    this._updateEditorPaneVisibilityClass();
    if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)) {
      this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.AuxiliaryBar);
    }
    if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)) {
      const paneCompositeToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.AuxiliaryBar) ?? this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.AuxiliaryBar)?.id;
      if (paneCompositeToOpen && this._shouldOpenAuxiliaryPaneComposite(paneCompositeToOpen)) {
        this.paneCompositeService.openPaneComposite(paneCompositeToOpen, ViewContainerLocation.AuxiliaryBar);
      }
    }
    if (!source) {
      this._savePartVisibility();
    }
    if (!hidden && sidePaneWasClosed) {
      this._onSidePaneRevealed();
    }
  }
  /**
   * Whether the given auxiliary-bar view container currently has content to show
   * (mirrors `IViewsService.isViewContainerActive`: a `hideIfEmpty` container is
   * only active once it has at least one active view descriptor). Used to avoid
   * presenting an empty docked detail panel.
   */
  _isAuxViewContainerActive(containerId) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(containerId);
    if (!viewContainer) {
      return false;
    }
    if (!viewContainer.hideIfEmpty) {
      return true;
    }
    return this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.length > 0;
  }
  setEditorHidden(hidden, explicit = false) {
    if (this.partVisibility.editor === !hidden) {
      return;
    }
    const sidePaneWasClosed = !this.partVisibility.editor && !this.partVisibility.auxiliaryBar;
    this._editorRevealedExplicitly = !hidden && explicit;
    this._runWithEditorResizeSyncSuspended(() => {
      if (hidden && this._editorMaximized) {
        this.setEditorMaximized(false);
      }
      this.partVisibility.editor = !hidden;
      this.mainContainer.classList.toggle("nomaineditorarea" /* MAIN_EDITOR_AREA_HIDDEN */, !this._effectiveVisible(Parts.EDITOR_PART));
      if (this.editorPartView) {
        this._applyEditorVisibility(hidden);
      }
      this._updateEditorPaneVisibilityClass();
      this._savePartVisibility();
    });
    if (!hidden && sidePaneWasClosed) {
      this._onSidePaneRevealed();
    }
  }
  /**
   * Hook invoked when the side pane (editor part and/or auxiliary bar) transitions
   * from *fully hidden* to visible. The base classic/mobile layout has no docked
   * side pane, so this is a no-op; {@link SinglePaneWorkbench} overrides it to
   * fire {@link onDidRevealSidePane}.
   */
  _onSidePaneRevealed() {
  }
  /**
   * Sizes the editor part when it is first revealed from a hidden state, so it
   * opens as a comfortable split with the sessions part rather than at its
   * minimum/restored width. The default grid layout splits the main area evenly;
   * layouts with different sizing (e.g. the single-pane side pane) override this.
   */
  _applyEditorSplitSize(mainAreaWidth) {
    const targetEditorWidth = Math.max(EDITOR_PART_MINIMUM_WIDTH, Math.floor(mainAreaWidth / 2));
    const currentEditorSize = this.workbenchGrid.getViewSize(this.editorPartView);
    this.workbenchGrid.resizeView(this.editorPartView, {
      width: targetEditorWidth,
      height: currentEditorSize.height
    });
  }
  setPanelHidden(hidden) {
    if (this.partVisibility.panel === !hidden) {
      return;
    }
    if (hidden && this.workbenchGrid.hasMaximizedView()) {
      this.workbenchGrid.exitMaximizedView();
    }
    const panelHadFocus = !hidden || this.hasFocus(Parts.PANEL_PART);
    this.partVisibility.panel = !hidden;
    this.mainContainer.classList.toggle("nopanel" /* PANEL_HIDDEN */, !this._effectiveVisible(Parts.PANEL_PART));
    this.workbenchGrid.setViewVisible(
      this.panelPartView,
      this._effectiveVisible(Parts.PANEL_PART)
    );
    if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)) {
      this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Panel);
      if (panelHadFocus) {
        this.focusPart(Parts.SESSIONS_PART);
      }
    }
    if (!hidden) {
      if (!this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)) {
        const panelToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.Panel) ?? this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Panel)?.id;
        if (panelToOpen) {
          this.paneCompositeService.openPaneComposite(panelToOpen, ViewContainerLocation.Panel);
        }
      }
      if (this._effectiveVisible(Parts.PANEL_PART)) {
        this.focusPart(Parts.PANEL_PART);
      }
    }
  }
  setSessionsHidden(hidden) {
    if (this.partVisibility.sessions === !hidden) {
      return;
    }
    this.partVisibility.sessions = !hidden;
    this.mainContainer.classList.toggle("nosessionspart" /* SESSIONS_HIDDEN */, !this._effectiveVisible(Parts.SESSIONS_PART));
    this.workbenchGrid.setViewVisible(this.sessionsPartView, this._effectiveVisible(Parts.SESSIONS_PART));
  }
  /**
   * Shows or hides the custom view grid. The custom view grid and the sessions
   * grid are mutually exclusive and exactly one of them owns the row, so hiding
   * the custom view always brings the sessions grid back (together with the side
   * panel and panel state the layout wants for the active session). The parts it
   * covers keep their desired visibility while it is shown, so the restore
   * reflects whatever the layout controller last asked for.
   */
  _applyCustomViewGridVisibility(descriptor) {
    const visible = !!descriptor;
    if (this.partVisibility.customViewGrid === visible) {
      this.customViewGridPartService.setView(descriptor);
      return;
    }
    const wasVisible = _Workbench._CUSTOM_VIEW_EXCLUSIVE_PARTS.map((part) => this._effectiveVisible(part));
    if (visible && this._editorMaximized) {
      this.setEditorMaximized(false);
    }
    this.customViewGridPartService.setView(descriptor);
    this.partVisibility.customViewGrid = visible;
    this._customViewVisibleKey.set(visible);
    if (!this.workbenchGrid) {
      return;
    }
    this._applyingCustomViewGridVisibility = true;
    try {
      this._runWithEditorResizeSyncSuspended(() => {
        if (visible) {
          this.workbenchGrid.setViewVisible(this.customViewGridPartView, true);
          this._applyExclusivePartVisibility();
        } else {
          this._applyExclusivePartVisibility();
          this.workbenchGrid.setViewVisible(this.customViewGridPartView, false);
        }
      });
    } finally {
      this._applyingCustomViewGridVisibility = false;
    }
    this._updateExclusiveLayoutClasses();
    this.mainContainer.classList.toggle("nocustomviewgrid" /* CUSTOM_VIEW_GRID_HIDDEN */, !visible);
    this._updateMobileCustomViewNavigation();
    if (visible) {
      this._fireDidChangePartVisibility(Parts.CUSTOM_VIEW_GRID_PART, true);
    }
    _Workbench._CUSTOM_VIEW_EXCLUSIVE_PARTS.forEach((part, index) => {
      const nowVisible = this._effectiveVisible(part);
      if (nowVisible !== wasVisible[index]) {
        this._fireDidChangePartVisibility(part, nowVisible);
      }
    });
    if (!visible) {
      this._fireDidChangePartVisibility(Parts.CUSTOM_VIEW_GRID_PART, false);
    }
    this.layout();
    if (visible) {
      this.focusPart(Parts.CUSTOM_VIEW_GRID_PART);
    } else {
      this.sessionsPartService.focusSession(this.sessionsService.activeSession.get());
    }
  }
  _applyExclusivePartVisibility() {
    this.workbenchGrid.setViewVisible(this.sessionsPartView, this._effectiveVisible(Parts.SESSIONS_PART));
    this.workbenchGrid.setViewVisible(this.panelPartView, this._effectiveVisible(Parts.PANEL_PART));
    this._applyEditorAreaVisibility();
  }
  /** Pushes the editor and auxiliary bar node visibility into the grid. */
  _applyEditorAreaVisibility() {
    this.workbenchGrid.setViewVisible(this.editorPartView, this._editorNodeShouldBeVisible());
    this.workbenchGrid.setViewVisible(this.auxiliaryBarPartView, this._effectiveVisible(Parts.AUXILIARYBAR_PART));
  }
  _updateExclusiveLayoutClasses() {
    this.mainContainer.classList.toggle("nosessionspart" /* SESSIONS_HIDDEN */, !this._effectiveVisible(Parts.SESSIONS_PART));
    this.mainContainer.classList.toggle("nomaineditorarea" /* MAIN_EDITOR_AREA_HIDDEN */, !this._effectiveVisible(Parts.EDITOR_PART));
    this.mainContainer.classList.toggle("noauxiliarybar" /* AUXILIARYBAR_HIDDEN */, !this._effectiveVisible(Parts.AUXILIARYBAR_PART));
    this.mainContainer.classList.toggle("nopanel" /* PANEL_HIDDEN */, !this._effectiveVisible(Parts.PANEL_PART));
    this._updateEditorPaneVisibilityClass();
  }
  /** Keeps the Android back button in sync with a shown custom view. */
  _updateMobileCustomViewNavigation() {
    const tracked = this.layoutPolicy.viewportClass.get() === "phone" && this.partVisibility.customViewGrid;
    if (tracked === this.mobileNavStack.has("customView")) {
      return;
    }
    if (tracked) {
      this.mobileNavStack.push("customView");
    } else {
      this.mobileNavStack.popSilently("customView");
    }
  }
  //#endregion
  //#region Position Methods (Fixed - Not Configurable)
  getSideBarPosition() {
    return Position.LEFT;
  }
  getPanelPosition() {
    return Position.BOTTOM;
  }
  setPanelPosition(_position) {
  }
  getPanelAlignment() {
    return "justify";
  }
  setPanelAlignment(_alignment) {
  }
  //#endregion
  //#region Size Methods
  getSize(part) {
    if (part === Parts.AUXILIARYBAR_PART) {
      return this._auxiliaryBarViewSize();
    }
    const view = this.getPartView(part);
    if (!view) {
      return { width: 0, height: 0 };
    }
    return this.workbenchGrid.getViewSize(view);
  }
  setSize(part, size2) {
    if (part === Parts.AUXILIARYBAR_PART) {
      this._setAuxiliaryBarViewSize(size2);
      return;
    }
    const view = this.getPartView(part);
    if (view) {
      this.workbenchGrid.resizeView(view, size2);
    }
  }
  resizePart(part, sizeChangeWidth, sizeChangeHeight) {
    if (part === Parts.AUXILIARYBAR_PART) {
      this._resizeAuxiliaryBarBy(sizeChangeWidth, sizeChangeHeight);
      return;
    }
    const view = this.getPartView(part);
    if (!view) {
      return;
    }
    const currentSize = this.workbenchGrid.getViewSize(view);
    this.workbenchGrid.resizeView(view, {
      width: currentSize.width + sizeChangeWidth,
      height: currentSize.height + sizeChangeHeight
    });
  }
  getPartView(part) {
    switch (part) {
      case Parts.TITLEBAR_PART:
        return this.titleBarPartView;
      case Parts.SIDEBAR_PART:
        return this.sideBarPartView;
      case Parts.AUXILIARYBAR_PART:
        return this.auxiliaryBarPartView;
      case Parts.EDITOR_PART:
        return this.editorPartView;
      case Parts.PANEL_PART:
        return this.panelPartView;
      case Parts.SESSIONS_PART:
        return this.sessionsPartView;
      case Parts.CUSTOM_VIEW_GRID_PART:
        return this.customViewGridPartView;
      default:
        return void 0;
    }
  }
  getMaximumEditorDimensions(_container) {
    const sidebarWidth = this.partVisibility.sidebar ? this.workbenchGrid.getViewSize(this.sideBarPartView).width : 0;
    const auxiliaryBarWidth = this.partVisibility.auxiliaryBar ? this._auxiliaryBarLayoutWidth() : 0;
    const panelHeight = this.partVisibility.panel ? this.workbenchGrid.getViewSize(this.panelPartView).height : 0;
    const titleBarHeight = this.workbenchGrid.getViewSize(this.titleBarPartView).height;
    return new Dimension(
      this._mainContainerDimension.width - sidebarWidth - auxiliaryBarWidth,
      this._mainContainerDimension.height - titleBarHeight - panelHeight
    );
  }
  //#endregion
  //#region Unsupported Features (No-ops)
  toggleMaximizedPanel() {
    if (!this.workbenchGrid) {
      return;
    }
    if (this.isPanelMaximized()) {
      this.workbenchGrid.exitMaximizedView();
    } else {
      this.workbenchGrid.maximizeView(this.panelPartView, [this.titleBarPartView, this.sideBarPartView]);
    }
  }
  isPanelMaximized() {
    if (!this.workbenchGrid) {
      return false;
    }
    return this.workbenchGrid.isViewMaximized(this.panelPartView);
  }
  toggleMaximizedAuxiliaryBar() {
  }
  setAuxiliaryBarMaximized(_maximized) {
    return false;
  }
  isAuxiliaryBarMaximized() {
    return false;
  }
  isEditorMaximized() {
    return this._editorMaximized;
  }
  setEditorMaximized(maximized) {
    if (maximized === this._editorMaximized) {
      return;
    }
    if (maximized) {
      this._editorLastNonMaximizedVisibility = {
        sidebar: this.partVisibility.sidebar,
        auxiliaryBar: this.partVisibility.auxiliaryBar,
        editor: this.partVisibility.editor,
        panel: this.partVisibility.panel,
        sessions: this.partVisibility.sessions,
        customViewGrid: this.partVisibility.customViewGrid
      };
      this._editorLastNonMaximizedSize = this.editorPartView ? this.workbenchGrid.getViewSize(this.editorPartView) : void 0;
      if (!this.partVisibility.editor) {
        this.setEditorHidden(false);
      }
      if (this.partVisibility.sidebar) {
        this.setSideBarHidden(true);
      }
      if (this.partVisibility.sessions) {
        this.setSessionsHidden(true);
      }
      this._editorMaximized = true;
    } else {
      const state = this._editorLastNonMaximizedVisibility;
      const size2 = this._editorLastNonMaximizedSize;
      this._editorLastNonMaximizedSize = void 0;
      this.setSideBarHidden(!state?.sidebar);
      this.setSessionsHidden(!state?.sessions);
      this.setAuxiliaryBarHidden(!state?.auxiliaryBar);
      this._editorMaximized = false;
      if (this.editorPartView && size2) {
        this.workbenchGrid.resizeView(this.editorPartView, size2);
      }
      this._layoutSidePane();
    }
    this._onDidChangeEditorMaximized.fire();
  }
  toggleZenMode() {
  }
  toggleMenuBar() {
  }
  isMainEditorLayoutCentered() {
    return false;
  }
  centerMainEditorLayout(_active) {
  }
  hasMainWindowBorder() {
    return false;
  }
  getMainWindowBorderRadius() {
    return void 0;
  }
  //#endregion
  //#region Window Maximized State
  isWindowMaximized(targetWindow) {
    return this.maximized.has(getWindowId(targetWindow));
  }
  updateWindowMaximizedState(targetWindow, maximized) {
    const windowId = getWindowId(targetWindow);
    if (maximized) {
      this.maximized.add(windowId);
      if (targetWindow === mainWindow) {
        this.mainContainer.classList.add("maximized" /* MAXIMIZED */);
      }
    } else {
      this.maximized.delete(windowId);
      if (targetWindow === mainWindow) {
        this.mainContainer.classList.remove("maximized" /* MAXIMIZED */);
      }
    }
    this._onDidChangeWindowMaximized.fire({ windowId, maximized });
  }
  //#endregion
  //#region Neighbor Parts
  getVisibleNeighborPart(part, direction) {
    if (!this.workbenchGrid) {
      return void 0;
    }
    const view = this.getPartView(part);
    if (!view) {
      return void 0;
    }
    const neighbor = this.workbenchGrid.getNeighborViews(view, direction, false);
    if (neighbor.length === 0) {
      return void 0;
    }
    const neighborView = neighbor[0];
    if (neighborView === this.titleBarPartView) {
      return Parts.TITLEBAR_PART;
    }
    if (neighborView === this.sideBarPartView) {
      return Parts.SIDEBAR_PART;
    }
    if (neighborView === this.auxiliaryBarPartView) {
      return Parts.AUXILIARYBAR_PART;
    }
    if (neighborView === this.editorPartView) {
      return Parts.EDITOR_PART;
    }
    if (neighborView === this.panelPartView) {
      return Parts.PANEL_PART;
    }
    if (neighborView === this.sessionsPartView) {
      return Parts.SESSIONS_PART;
    }
    return void 0;
  }
  //#endregion
  //#region Restore
  isRestored() {
    return this.restored;
  }
  setRestored() {
    this.restored = true;
    this.restoredPromise.complete();
  }
  //#endregion
  //#region Notifications Registration
  registerNotifications(delegate) {
    this._register(delegate.onDidChangeNotificationsVisibility((visible) => this._onDidChangeNotificationsVisibility.fire(visible)));
  }
  //#endregion
};
//#endregion
_Workbench._PART_VISIBILITY_KEY = "workbench.sessions.partVisibility";
_Workbench._PART_SIZES_KEY = "workbench.sessions.partSizes";
/**
 * Parts a visible custom view replaces. While the custom view grid is shown
 * these keep their desired (per-session) visibility state but are not
 * rendered, so hiding the custom view restores whatever the layout
 * controller last asked for — including changes made while it was shown.
 */
_Workbench._CUSTOM_VIEW_EXCLUSIVE_PARTS = [
  Parts.SESSIONS_PART,
  Parts.EDITOR_PART,
  Parts.AUXILIARYBAR_PART,
  Parts.PANEL_PART
];
let Workbench = _Workbench;
export {
  CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID,
  IAgentWorkbenchLayoutService,
  Workbench
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2Jyb3dzZXIvd29ya2JlbmNoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9zdHlsZS5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvc3R5bGUuY3NzJztcbmltcG9ydCAnLi9tZWRpYS93b3JrYmVuY2guY3NzJztcbmltcG9ydCAnLi9tZWRpYS9waG9uZUxheW91dC5jc3MnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50LCBzZXRHbG9iYWxMZWFrV2FybmluZ1RocmVzaG9sZCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgZ2V0QWN0aXZlRG9jdW1lbnQsIGdldEFjdGl2ZUVsZW1lbnQsIGdldENsaWVudEFyZWEsIGdldFdpbmRvd0lkLCBnZXRXaW5kb3dzLCBJRGltZW5zaW9uLCBpc0FuY2VzdG9yVXNpbmdGbG93VG8sIGlzSFRNTEVsZW1lbnQsIHNpemUsIERpbWVuc2lvbiwgcnVuV2hlbldpbmRvd0lkbGUgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGlzRnVsbHNjcmVlbiwgb25EaWRDaGFuZ2VGdWxsc2NyZWVuLCBpc0Nocm9tZSwgaXNGaXJlZm94LCBpc1NhZmFyaSB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IG1hcmsgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciwgc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlciB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MsIGlzTGludXgsIGlzV2ViLCBpc05hdGl2ZSwgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBQYXJ0cywgUG9zaXRpb24sIFBhbmVsQWxpZ25tZW50LCBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgU0lOR0xFX1dJTkRPV19QQVJUUywgTVVMVElfV0lORE9XX1BBUlRTLCBJUGFydFZpc2liaWxpdHlDaGFuZ2VFdmVudCwgcG9zaXRpb25Ub1N0cmluZyB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYXlvdXRPZmZzZXRJbmZvIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBQYXJ0IH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydC5qcyc7XG5pbXBvcnQgeyBEaXJlY3Rpb24sIElTZXJpYWxpemFibGVWaWV3LCBJU2VyaWFsaXplZEdyaWQsIElTZXJpYWxpemVkTGVhZk5vZGUsIElTZXJpYWxpemVkTm9kZSwgSVZpZXdTaXplLCBPcmllbnRhdGlvbiwgU2VyaWFsaXphYmxlR3JpZCB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ncmlkL2dyaWQuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHJlZmluZVNlcnZpY2VEZWNvcmF0b3IsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElUaXRsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdGl0bGUvYnJvd3Nlci90aXRsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdywgQ29kZVdpbmRvdyB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFNpbmdsZXRvblNlcnZpY2VEZXNjcmlwdG9ycyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIExpZmVjeWNsZVBoYXNlLCBXaWxsU2h1dGRvd25FdmVudCB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFdpbGxTYXZlU3RhdGVSZWFzb24sIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSwgV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgc2V0SG92ZXJEZWxlZ2F0ZUZhY3RvcnkgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgc2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlMi5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvckZhY3RvcnlSZWdpc3RyeSwgRWRpdG9yRXh0ZW5zaW9ucywgSUVkaXRvcldpbGxPcGVuRXZlbnQgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBhbGVydCwgc2V0QVJJQUNvbnRhaW5lciB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRm9udE1lYXN1cmVtZW50cyB9IGZyb20gJy4uLy4uL2VkaXRvci9icm93c2VyL2NvbmZpZy9mb250TWVhc3VyZW1lbnRzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUJhcmVGb250SW5mb0Zyb21SYXdTZXR0aW5ncyB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2ZvbnRJbmZvRnJvbVNldHRpbmdzLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaENvbnRleHRLZXlzSGFuZGxlciB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFBpeGVsUmF0aW8gfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvcGl4ZWxSYXRpby5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5UHJvZ3Jlc3NTaWduYWxTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvcHJvZ3Jlc3NBY2Nlc3NpYmlsaXR5U2lnbmFsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IHNldFByb2dyZXNzQWNjZXNzaWJpbGl0eVNpZ25hbFNjaGVkdWxlciB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9wcm9ncmVzc2Jhci9wcm9ncmVzc0FjY2Vzc2liaWxpdHlTaWduYWwuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJsZVZpZXdSZWdpc3RyeSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IE5vdGlmaWNhdGlvbkFjY2Vzc2libGVWaWV3IH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvbm90aWZpY2F0aW9ucy9ub3RpZmljYXRpb25BY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBOb3RpZmljYXRpb25zQ2VudGVyIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvbm90aWZpY2F0aW9ucy9ub3RpZmljYXRpb25zQ2VudGVyLmpzJztcbmltcG9ydCB7IE5vdGlmaWNhdGlvbnNBbGVydHMgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9ub3RpZmljYXRpb25zL25vdGlmaWNhdGlvbnNBbGVydHMuanMnO1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uc1N0YXR1cyB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL25vdGlmaWNhdGlvbnMvbm90aWZpY2F0aW9uc1N0YXR1cy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck5vdGlmaWNhdGlvbkNvbW1hbmRzIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvbm90aWZpY2F0aW9ucy9ub3RpZmljYXRpb25zQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBOb3RpZmljYXRpb25zVG9hc3RzIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvbm90aWZpY2F0aW9ucy9ub3RpZmljYXRpb25zVG9hc3RzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JNYXJrZG93bkNvZGVCbG9ja1JlbmRlcmVyIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L21hcmtkb3duUmVuZGVyZXIvYnJvd3Nlci9lZGl0b3JNYXJrZG93bkNvZGVCbG9ja1JlbmRlcmVyLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgVGl0bGVTZXJ2aWNlIH0gZnJvbSAnLi9wYXJ0cy90aXRsZWJhclBhcnQuanMnO1xuaW1wb3J0IHsgRURJVE9SX1BBUlRfREVGQVVMVF9XSURUSCwgRURJVE9SX1BBUlRfTUlOSU1VTV9XSURUSCB9IGZyb20gJy4vcGFydHMvZWRpdG9yUGFydFNpemluZy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBDdXN0b21WaWV3VmlzaWJsZUNvbnRleHQsIEVkaXRvck1heGltaXplZENvbnRleHQsIElzUGhvbmVMYXlvdXRDb250ZXh0LCBTaW5nbGVQYW5lTGF5b3V0RW5hYmxlZENvbnRleHQgfSBmcm9tICcuLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHtcblx0Tm90aWZpY2F0aW9uc1Bvc2l0aW9uLFxuXHROb3RpZmljYXRpb25zU2V0dGluZ3MsXG5cdGdldE5vdGlmaWNhdGlvbnNQb3NpdGlvblxufSBmcm9tICcuLi8uLi93b3JrYmVuY2gvY29tbW9uL25vdGlmaWNhdGlvbnMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNMYXlvdXRQb2xpY3kgfSBmcm9tICcuL2xheW91dFBvbGljeS5qcyc7XG5pbXBvcnQgeyBBR0VOVFNfUEFSVF9DQVJEX0NMQVNTIH0gZnJvbSAnLi9wYXJ0cy9hZ2VudHNQYXJ0Q2FyZC5qcyc7XG5pbXBvcnQgeyBNb2JpbGVOYXZpZ2F0aW9uU3RhY2sgfSBmcm9tICcuL21vYmlsZU5hdmlnYXRpb25TdGFjay5qcyc7XG5pbXBvcnQgeyBNb2JpbGVUaXRsZWJhclBhcnQgfSBmcm9tICcuL3BhcnRzL21vYmlsZS9tb2JpbGVUaXRsZWJhclBhcnQuanMnO1xuaW1wb3J0IHsgSU1vYmlsZVZpc3VhbFZpZXdwb3J0IH0gZnJvbSAnLi9wYXJ0cy9tb2JpbGUvbW9iaWxlVmlzdWFsVmlld3BvcnQuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1BhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1BhcnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXN0b21WaWV3U2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2N1c3RvbVZpZXcvYnJvd3Nlci9jdXN0b21WaWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tVmlld0dyaWRQYXJ0U2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2N1c3RvbVZpZXcvYnJvd3Nlci9jdXN0b21WaWV3R3JpZFBhcnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXN0b21WaWV3RGVzY3JpcHRvciB9IGZyb20gJy4uL3NlcnZpY2VzL2N1c3RvbVZpZXcvYnJvd3Nlci9jdXN0b21WaWV3LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NldFVwU2VydmljZSB9IGZyb20gJy4vc2Vzc2lvbnNTZXRVcFNlcnZpY2UuanMnO1xuXG4vLyNyZWdpb24gV29ya2JlbmNoIE9wdGlvbnNcblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBFeHRyYSBjbGFzc2VzIHRvIGJlIGFkZGVkIHRvIHRoZSB3b3JrYmVuY2ggY29udGFpbmVyLlxuXHQgKi9cblx0ZXh0cmFDbGFzc2VzPzogc3RyaW5nW107XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gTGF5b3V0IENsYXNzZXNcblxuZW51bSBMYXlvdXRDbGFzc2VzIHtcblx0U0lERUJBUl9ISURERU4gPSAnbm9zaWRlYmFyJyxcblx0TUFJTl9FRElUT1JfQVJFQV9ISURERU4gPSAnbm9tYWluZWRpdG9yYXJlYScsXG5cdFBBTkVMX0hJRERFTiA9ICdub3BhbmVsJyxcblx0QVVYSUxJQVJZQkFSX0hJRERFTiA9ICdub2F1eGlsaWFyeWJhcicsXG5cdEVESVRPUl9QQU5FX0hJRERFTiA9ICdub2VkaXRvcnBhbmUnLFxuXHRTRVNTSU9OU19ISURERU4gPSAnbm9zZXNzaW9uc3BhcnQnLFxuXHRDVVNUT01fVklFV19HUklEX0hJRERFTiA9ICdub2N1c3RvbXZpZXdncmlkJyxcblx0U1RBVFVTQkFSX0hJRERFTiA9ICdub3N0YXR1c2JhcicsXG5cdFNIRUxMX0dSQURJRU5UX0JBQ0tHUk9VTkQgPSAnc2hlbGwtZ3JhZGllbnQtYmFja2dyb3VuZCcsXG5cdEZVTExTQ1JFRU4gPSAnZnVsbHNjcmVlbicsXG5cdE1BWElNSVpFRCA9ICdtYXhpbWl6ZWQnLFxuXHRQSE9ORV9MQVlPVVQgPSAncGhvbmUtbGF5b3V0J1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFBhcnQgVmlzaWJpbGl0eSBTdGF0ZVxuXG4vKiogVmlzaWJpbGl0eSBvZiBlYWNoIHdvcmtiZW5jaCBwYXJ0IGluIHRoZSBBZ2VudHMgd2luZG93IGxheW91dC4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVBhcnRWaXNpYmlsaXR5U3RhdGUge1xuXHRzaWRlYmFyOiBib29sZWFuO1xuXHRhdXhpbGlhcnlCYXI6IGJvb2xlYW47XG5cdGVkaXRvcjogYm9vbGVhbjtcblx0cGFuZWw6IGJvb2xlYW47XG5cdHNlc3Npb25zOiBib29sZWFuO1xuXHRjdXN0b21WaWV3R3JpZDogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElQYXJ0U2l6ZXNTdGF0ZSB7XG5cdHNpZGViYXI/OiBudW1iZXI7XG5cdGF1eGlsaWFyeUJhcj86IG51bWJlcjtcblx0c2Vzc2lvbnM/OiBudW1iZXI7XG5cdGVkaXRvcj86IG51bWJlcjtcblx0cGFuZWw/OiBudW1iZXI7XG59XG5cbi8qKiBPcGFxdWUgcGVyLXRyYW5zaXRpb24gY2FwdHVyZSByZXR1cm5lZCBieSBgV29ya2JlbmNoLl9wcmVwYXJlU2lkZUJhclJlc2l6ZWAuICovXG5leHBvcnQgaW50ZXJmYWNlIElTaWRlQmFyUmVzaXplQ29udGV4dCB7IH1cblxuLy8jZW5kcmVnaW9uXG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSBleHRlbmRzIElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBJRG9ja2VkRWRpdG9yTGF5b3V0IHtcblx0aXNFZGl0b3JNYXhpbWl6ZWQoKTogYm9vbGVhbjtcblx0c2V0RWRpdG9yTWF4aW1pemVkKG1heGltaXplZDogYm9vbGVhbik6IHZvaWQ7XG5cdGlzRWRpdG9yUGFuZVZpc2libGUoKTogYm9vbGVhbjtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUVkaXRvck1heGltaXplZDogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIEFnZW50cyB3aW5kb3cgaXMgdXNpbmcgdGhlIHNpbmdsZS1wYW5lIChkb2NrZWQgZGV0YWlsIHBhbmVsKVxuXHQgKiBsYXlvdXQuIEZpeGVkIGF0IGNvbnN0cnVjdGlvbiBcdTIwMTQgYGZhbHNlYCBmb3IgdGhlIGNsYXNzaWMvbW9iaWxlIHdvcmtiZW5jaCxcblx0ICogYHRydWVgIGZvciB7QGxpbmsgU2luZ2xlUGFuZVdvcmtiZW5jaH0uXG5cdCAqL1xuXHRyZWFkb25seSBpc1NpbmdsZVBhbmVMYXlvdXRFbmFibGVkOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBTdXBwcmVzc2VzIHRoZSBhdXRvbWF0aWMgZWRpdG9yIHBhcnQgc2hvdy9oaWRlIHRoYXQgbm9ybWFsbHkgZmlyZXMgZnJvbVxuXHQgKiBgZWRpdG9yU2VydmljZS5vbldpbGxPcGVuRWRpdG9yYCAvIGBvbkRpZENsb3NlRWRpdG9yYC4gVXNlIHRoaXMgYXJvdW5kXG5cdCAqIHByb2dyYW1tYXRpYyBlZGl0b3Igb3BlcmF0aW9ucyAoZS5nLiBhcHBseWluZyBhIHdvcmtpbmcgc2V0KSBzbyB0aGF0IHRoZVxuXHQgKiBlZGl0b3IgcGFydCB2aXNpYmlsaXR5IGlzIG5vdCBjaGFuZ2VkIGFzIGEgc2lkZS1lZmZlY3QuIERpc3Bvc2UgdGhlXG5cdCAqIHJldHVybmVkIGhhbmRsZSB0byByZWxlYXNlIHRoZSBzdXBwcmVzc2lvbi4gQ2FsbHMgbmVzdCB2aWEgYSBjb3VudGVyLlxuXHQgKi9cblx0c3VwcHJlc3NFZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHkoKTogSURpc3Bvc2FibGU7XG5cblx0LyoqXG5cdCAqIENoYW5nZXMgZG9ja2VkIGRldGFpbCB2aXNpYmlsaXR5IGluIHJlc3BvbnNlIHRvIGEgc2FzaCByZXNpemUgd2l0aG91dFxuXHQgKiBwZXJzaXN0aW5nIGl0IGFzIGFuIGV4cGxpY2l0IHVzZXIgdmlzaWJpbGl0eSBwcmVmZXJlbmNlLlxuXHQgKi9cblx0c2V0QXV4aWxpYXJ5QmFySGlkZGVuRm9yUmVzaXplKGhpZGRlbjogYm9vbGVhbik6IHZvaWQ7XG59XG5cbi8qKlxuICogRG9ja2VkLWVkaXRvciAoc2luZ2xlLXBhbmUgZGV0YWlsIHBhbmVsKSBjb25jZXJucyBvZiB0aGUgbGF5b3V0IHNlcnZpY2UsIGtlcHRcbiAqIHNlcGFyYXRlIGZyb20gdGhlIGdlbmVyYWwgY29udHJhY3Qgc28gZmVhdHVyZXMgdGhhdCBkbyBub3QgY2FyZSBhYm91dCB0aGVcbiAqIGRvY2tlZCBsYXlvdXQgYXJlIG5vdCBjb3VwbGVkIHRvIGl0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElEb2NrZWRFZGl0b3JMYXlvdXQge1xuXHRoYW5kbGVEb2NrZWRFZGl0b3JQYXJ0TGF5b3V0KG5vZGVXaWR0aDogbnVtYmVyKTogdm9pZDtcblxuXHQvKipcblx0ICogRmlyZWQgd2hlbiB0aGUgc2lkZSBwYW5lICh0aGUgZG9ja2VkIGVkaXRvciBwYXJ0IGFuZC9vciB0aGUgYXV4aWxpYXJ5LWJhclxuXHQgKiBkZXRhaWwgcGFuZWwpIHRyYW5zaXRpb25zIGZyb20gKmZ1bGx5IGhpZGRlbiogdG8gdmlzaWJsZSBcdTIwMTQgaS5lLiB0aGUgdXNlclxuXHQgKiBvcGVucyB0aGUgc2lkZSBwYW5lLiBJdCBmaXJlcyByZWdhcmRsZXNzIG9mIGhvdyB0aGUgcGFuZSBpcyBvcGVuZWQgKHRoZVxuXHQgKiB0b2dnbGUgYWN0aW9uLCByZXZlYWxpbmcgYW4gZWRpdG9yLCBvciByZXZlYWxpbmcgdGhlIGRldGFpbCkuIENvbnN1bWVyc1xuXHQgKiBkZWNpZGUgd2hhdCB0byBkbyBmcm9tIHRoZSBjdXJyZW50IGVkaXRvciBncm91cCBzdGF0ZSAoZS5nLiBwb3B1bGF0ZSB0aGVcblx0ICogZGVmYXVsdCBtYW5hZ2VkIHRhYnMgb25seSB3aGVuIG5vIHJlYWwgZWRpdG9yIGlzIG9wZW4pLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRSZXZlYWxTaWRlUGFuZTogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGVkaXRvcidzIGN1cnJlbnQgdmlzaWJsZSBzdGF0ZSB3YXMgcHJvZHVjZWQgYnkgYW4gZXhwbGljaXQgdXNlclxuXHQgKiByZXZlYWwgKG9wZW5pbmcgYW4gZWRpdG9yLCBvciB0b2dnbGluZyB0aGUgZGV0YWlsIHBhbmVsIG9mZikgcmF0aGVyIHRoYW4gYW5cblx0ICogYXV0b21hdGljIGxheW91dC93b3JraW5nLXNldCByZXZlYWwuIFRoZSBzaW5nbGUtcGFuZSBuZXctc2Vzc2lvbiBydWxlIChSMSlcblx0ICogdXNlcyB0aGlzIHRvIGF2b2lkIHJlLWhpZGluZyBhbiBlZGl0b3IgdGhlIHVzZXIgZXhwbGljaXRseSBhc2tlZCB0byBzaG93LlxuXHQgKi9cblx0aXNFZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHkoKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogUmV2ZWFscyB0aGUgKHBvc3NpYmx5IGhpZGRlbikgZWRpdG9yIHBhcnQgYXMgYW4gKmV4cGxpY2l0KiB1c2VyIHJldmVhbCwgc29cblx0ICogdGhlIGF1dG9tYXRpYyBzaW5nbGUtcGFuZSBoaWRlIHJ1bGVzIChSMSAvIHdvcmtpbmctc2V0IGFwcGx5KSBkbyBub3QgdW5kbyBpdC5cblx0ICogVXNlIGZvciBkZWxpYmVyYXRlIG9wZW5zIGxpa2UgdGhlIHNlc3Npb24taGVhZGVyIENoYW5nZXMgcGlsbCBvciBvcGVuaW5nIGFcblx0ICogZmlsZSBkaWZmIFx1MjAxNCBub3QgZm9yIGF1dG9tYXRpYy9sYXlvdXQtZHJpdmVuIHJldmVhbHMuXG5cdCAqL1xuXHRyZXZlYWxFZGl0b3JQYXJ0RXhwbGljaXRseSgpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBUaGUgZG9ja2VkIGF1eGlsaWFyeSBiYXIgKGRldGFpbCBwYW5lbCkgd2lkdGgsIG93bmVkIGJ5IHRoZSB3b3JrYmVuY2gnc1xuXHQgKiBzaW5nbGUtcGFuZSBsYXlvdXQgc3RhdGUgYW5kIHJlYWQvd3JpdHRlbiBieSB0aGUgZG9ja2VkIGNvbnRyb2xsZXIgdGhhdCB0aGVcblx0ICogZWRpdG9yIHBhcnQgb3ducy4gVHJpdmlhbCBpbiB0aGUgY2xhc3NpYyBsYXlvdXQuXG5cdCAqL1xuXHRnZXREb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCgpOiBudW1iZXI7XG5cdHNldERvY2tlZEF1eGlsaWFyeUJhcldpZHRoKHdpZHRoOiBudW1iZXIpOiB2b2lkO1xufVxuXG5leHBvcnQgY29uc3QgSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSA9IHJlZmluZVNlcnZpY2VEZWNvcmF0b3I8SVdvcmtiZW5jaExheW91dFNlcnZpY2UsIElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2U+KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblxuZXhwb3J0IGNvbnN0IENMT1NFX01PQklMRV9TSURFQkFSX0RSQVdFUl9DT01NQU5EX0lEID0gJ3Nlc3Npb25zLmNsb3NlTW9iaWxlU2lkZWJhckRyYXdlcic7XG5cbmV4cG9ydCBjbGFzcyBXb3JrYmVuY2ggZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Ly8jcmVnaW9uIExpZmVjeWNsZSBFdmVudHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxTaHV0ZG93biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFdpbGxTaHV0ZG93bkV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25XaWxsU2h1dGRvd24gPSB0aGlzLl9vbldpbGxTaHV0ZG93bi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNodXRkb3duID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2h1dGRvd24gPSB0aGlzLl9vbkRpZFNodXRkb3duLmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBFdmVudHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVplbk1vZGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VaZW5Nb2RlID0gdGhpcy5fb25EaWRDaGFuZ2VaZW5Nb2RlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTWFpbkVkaXRvckNlbnRlcmVkTGF5b3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWFpbkVkaXRvckNlbnRlcmVkTGF5b3V0ID0gdGhpcy5fb25EaWRDaGFuZ2VNYWluRWRpdG9yQ2VudGVyZWRMYXlvdXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQYW5lbEFsaWdubWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFBhbmVsQWxpZ25tZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQYW5lbEFsaWdubWVudCA9IHRoaXMuX29uRGlkQ2hhbmdlUGFuZWxBbGlnbm1lbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VXaW5kb3dNYXhpbWl6ZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHdpbmRvd0lkOiBudW1iZXI7IG1heGltaXplZDogYm9vbGVhbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VXaW5kb3dNYXhpbWl6ZWQgPSB0aGlzLl9vbkRpZENoYW5nZVdpbmRvd01heGltaXplZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVBhbmVsUG9zaXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBhbmVsUG9zaXRpb24gPSB0aGlzLl9vbkRpZENoYW5nZVBhbmVsUG9zaXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQYXJ0VmlzaWJpbGl0eUNoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eSA9IHRoaXMuX29uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZXZlbnQ7XG5cblx0Ly8gVGhlIGNsYXNzaWMvbW9iaWxlIGxheW91dCBoYXMgbm8gZG9ja2VkIHNpZGUgcGFuZSwgc28gaXQgbmV2ZXIgZmlyZXMgdGhpcy5cblx0Ly8ge0BsaW5rIFNpbmdsZVBhbmVXb3JrYmVuY2h9IG92ZXJyaWRlcyBpdCB3aXRoIGEgcmVhbCBlbWl0dGVyLlxuXHRyZWFkb25seSBvbkRpZFJldmVhbFNpZGVQYW5lOiBFdmVudDx2b2lkPiA9IEV2ZW50Lk5vbmU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VOb3RpZmljYXRpb25zVmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU5vdGlmaWNhdGlvbnNWaXNpYmlsaXR5ID0gdGhpcy5fb25EaWRDaGFuZ2VOb3RpZmljYXRpb25zVmlzaWJpbGl0eS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUF1eGlsaWFyeUJhck1heGltaXplZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUF1eGlsaWFyeUJhck1heGltaXplZCA9IHRoaXMuX29uRGlkQ2hhbmdlQXV4aWxpYXJ5QmFyTWF4aW1pemVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkID0gdGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JNYXhpbWl6ZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRMYXlvdXRNYWluQ29udGFpbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SURpbWVuc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTGF5b3V0TWFpbkNvbnRhaW5lciA9IHRoaXMuX29uRGlkTGF5b3V0TWFpbkNvbnRhaW5lci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZExheW91dEFjdGl2ZUNvbnRhaW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElEaW1lbnNpb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZExheW91dEFjdGl2ZUNvbnRhaW5lciA9IHRoaXMuX29uRGlkTGF5b3V0QWN0aXZlQ29udGFpbmVyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTGF5b3V0Q29udGFpbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBjb250YWluZXI6IEhUTUxFbGVtZW50OyBkaW1lbnNpb246IElEaW1lbnNpb24gfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTGF5b3V0Q29udGFpbmVyID0gdGhpcy5fb25EaWRMYXlvdXRDb250YWluZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBZGRDb250YWluZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWRkQ29udGFpbmVyID0gdGhpcy5fb25EaWRBZGRDb250YWluZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVDb250YWluZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVDb250YWluZXIgPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUNvbnRhaW5lci5ldmVudDtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUHJvcGVydGllc1xuXG5cdHJlYWRvbmx5IG1haW5Db250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRnZXQgYWN0aXZlQ29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRDb250YWluZXJGcm9tRG9jdW1lbnQoZ2V0QWN0aXZlRG9jdW1lbnQoKSk7XG5cdH1cblxuXHRnZXQgY29udGFpbmVycygpOiBJdGVyYWJsZTxIVE1MRWxlbWVudD4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lcnM6IEhUTUxFbGVtZW50W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHsgd2luZG93IH0gb2YgZ2V0V2luZG93cygpKSB7XG5cdFx0XHRjb250YWluZXJzLnB1c2godGhpcy5nZXRDb250YWluZXJGcm9tRG9jdW1lbnQod2luZG93LmRvY3VtZW50KSk7XG5cdFx0fVxuXHRcdHJldHVybiBjb250YWluZXJzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb250YWluZXJGcm9tRG9jdW1lbnQodGFyZ2V0RG9jdW1lbnQ6IERvY3VtZW50KTogSFRNTEVsZW1lbnQge1xuXHRcdGlmICh0YXJnZXREb2N1bWVudCA9PT0gdGhpcy5tYWluQ29udGFpbmVyLm93bmVyRG9jdW1lbnQpIHtcblx0XHRcdHJldHVybiB0aGlzLm1haW5Db250YWluZXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0cmV0dXJuIHRhcmdldERvY3VtZW50LmJvZHkuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZSgnbW9uYWNvLXdvcmtiZW5jaCcpWzBdIGFzIEhUTUxFbGVtZW50O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX21haW5Db250YWluZXJEaW1lbnNpb24hOiBJRGltZW5zaW9uO1xuXHRnZXQgbWFpbkNvbnRhaW5lckRpbWVuc2lvbigpOiBJRGltZW5zaW9uIHsgcmV0dXJuIHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb247IH1cblxuXHRnZXQgYWN0aXZlQ29udGFpbmVyRGltZW5zaW9uKCk6IElEaW1lbnNpb24ge1xuXHRcdHJldHVybiB0aGlzLmdldENvbnRhaW5lckRpbWVuc2lvbih0aGlzLmFjdGl2ZUNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRhaW5lckRpbWVuc2lvbihjb250YWluZXI6IEhUTUxFbGVtZW50KTogSURpbWVuc2lvbiB7XG5cdFx0aWYgKGNvbnRhaW5lciA9PT0gdGhpcy5tYWluQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5tYWluQ29udGFpbmVyRGltZW5zaW9uO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZ2V0Q2xpZW50QXJlYShjb250YWluZXIpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBtYWluQ29udGFpbmVyT2Zmc2V0KCk6IElMYXlvdXRPZmZzZXRJbmZvIHtcblx0XHRyZXR1cm4gdGhpcy5jb21wdXRlQ29udGFpbmVyT2Zmc2V0KCk7XG5cdH1cblxuXHRnZXQgYWN0aXZlQ29udGFpbmVyT2Zmc2V0KCk6IElMYXlvdXRPZmZzZXRJbmZvIHtcblx0XHRyZXR1cm4gdGhpcy5jb21wdXRlQ29udGFpbmVyT2Zmc2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVDb250YWluZXJPZmZzZXQoKTogSUxheW91dE9mZnNldEluZm8ge1xuXHRcdGxldCB0b3AgPSAwO1xuXHRcdGxldCBxdWlja1BpY2tUb3AgPSAwO1xuXG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKFBhcnRzLlRJVExFQkFSX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHR0b3AgPSB0aGlzLmdldFBhcnQoUGFydHMuVElUTEVCQVJfUEFSVCkubWF4aW11bUhlaWdodDtcblx0XHRcdHF1aWNrUGlja1RvcCA9IHRvcDtcblx0XHR9IGVsc2UgaWYgKHRoaXMubW9iaWxlVG9wQmFyRWxlbWVudCkge1xuXHRcdFx0Ly8gT24gcGhvbmUgbGF5b3V0IHRoZSBNb2JpbGVUaXRsZWJhclBhcnQgcmVwbGFjZXMgdGhlIHRpdGxlYmFyXG5cdFx0XHR0b3AgPSB0aGlzLm1vYmlsZVRvcEJhckVsZW1lbnQub2Zmc2V0SGVpZ2h0O1xuXHRcdFx0cXVpY2tQaWNrVG9wID0gdG9wO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHRvcCwgcXVpY2tQaWNrVG9wIH07XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gU3RhdGVcblxuXHRwcml2YXRlIHJlYWRvbmx5IHBhcnRzID0gbmV3IE1hcDxzdHJpbmcsIFBhcnQ+KCk7XG5cdHByb3RlY3RlZCB3b3JrYmVuY2hHcmlkITogU2VyaWFsaXphYmxlR3JpZDxJU2VyaWFsaXphYmxlVmlldz47XG5cblx0cHJpdmF0ZSB0aXRsZUJhclBhcnRWaWV3ITogSVNlcmlhbGl6YWJsZVZpZXc7XG5cdHByb3RlY3RlZCBzaWRlQmFyUGFydFZpZXchOiBJU2VyaWFsaXphYmxlVmlldztcblx0cHJpdmF0ZSBwYW5lbFBhcnRWaWV3ITogSVNlcmlhbGl6YWJsZVZpZXc7XG5cdHByb3RlY3RlZCBhdXhpbGlhcnlCYXJQYXJ0VmlldyE6IElTZXJpYWxpemFibGVWaWV3O1xuXHRwcm90ZWN0ZWQgZWRpdG9yUGFydFZpZXchOiBJU2VyaWFsaXphYmxlVmlldztcblxuXHRwcm90ZWN0ZWQgc2Vzc2lvbnNQYXJ0VmlldyE6IElTZXJpYWxpemFibGVWaWV3O1xuXHRwcm90ZWN0ZWQgY3VzdG9tVmlld0dyaWRQYXJ0VmlldyE6IElTZXJpYWxpemFibGVWaWV3O1xuXG5cdC8qKiBUaGUgZWRpdG9yIHBhcnQgY29udGFpbmVyOyB0aGUgYXV4aWxpYXJ5IGJhciBpcyBkb2NrZWQgaW5zaWRlIGl0LiAqL1xuXHRwcm90ZWN0ZWQgX2VkaXRvclBhcnRDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHQvKiogYGZhbHNlYCBmb3IgdGhlIGNsYXNzaWMvbW9iaWxlIGxheW91dDsge0BsaW5rIFNpbmdsZVBhbmVXb3JrYmVuY2h9IG92ZXJyaWRlcyB0byBgdHJ1ZWAuICovXG5cdGdldCBpc1NpbmdsZVBhbmVMYXlvdXRFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHQvKiogYHRydWVgIHdoaWxlIHRoZSBlZGl0b3IncyBjdXJyZW50IHZpc2libGUgc3RhdGUgd2FzIHByb2R1Y2VkIGJ5IGFuIGV4cGxpY2l0IHVzZXIgcmV2ZWFsIChvcGVuaW5nIGFuIGVkaXRvciwgb3IgdG9nZ2xpbmcgdGhlIGRldGFpbCBwYW5lbCBvZmYpIHJhdGhlciB0aGFuIGFuIGF1dG9tYXRpYyBsYXlvdXQvd29ya2luZy1zZXQgcmV2ZWFsLiBSZWFkIGJ5IHRoZSBzaW5nbGUtcGFuZSBuZXctc2Vzc2lvbiBydWxlIChSMSkgc28gaXQgZG9lcyBub3QgdW5kbyBhbiBleHBsaWNpdCByZXZlYWwuICovXG5cdHByb3RlY3RlZCBfZWRpdG9yUmV2ZWFsZWRFeHBsaWNpdGx5ID0gZmFsc2U7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IHBhcnRWaXNpYmlsaXR5OiBJUGFydFZpc2liaWxpdHlTdGF0ZSA9IHtcblx0XHRzaWRlYmFyOiB0cnVlLFxuXHRcdGF1eGlsaWFyeUJhcjogdHJ1ZSxcblx0XHRlZGl0b3I6IGZhbHNlLFxuXHRcdHBhbmVsOiBmYWxzZSxcblx0XHRzZXNzaW9uczogdHJ1ZSxcblx0XHRjdXN0b21WaWV3R3JpZDogZmFsc2Vcblx0fTtcblxuXHRwcml2YXRlIG1haW5XaW5kb3dGdWxsc2NyZWVuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWF4aW1pemVkID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBsYXlvdXRQb2xpY3kgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2Vzc2lvbnNMYXlvdXRQb2xpY3koKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbW9iaWxlTmF2U3RhY2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgTW9iaWxlTmF2aWdhdGlvblN0YWNrKCkpO1xuXHRwcml2YXRlIG1vYmlsZVRvcEJhckVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vYmlsZVRvcEJhckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwcml2YXRlIF9lZGl0b3JNYXhpbWl6ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfY3VzdG9tVmlld1Zpc2libGVLZXkhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0LyoqIEd1YXJkcyB0aGUgZ3JpZCB1cGRhdGVzIHRoYXQgc2hvdy9oaWRlIHRoZSBjdXN0b20gdmlldyBmcm9tIGZlZWRpbmcgYmFjayBpbnRvIHRoZSBkZXNpcmVkIHBhcnQgdmlzaWJpbGl0eS4gKi9cblx0cHJpdmF0ZSBfYXBwbHlpbmdDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkgPSBmYWxzZTtcblx0cHJpdmF0ZSBfZWRpdG9yTGFzdE5vbk1heGltaXplZFZpc2liaWxpdHk6IElQYXJ0VmlzaWJpbGl0eVN0YXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9lZGl0b3JMYXN0Tm9uTWF4aW1pemVkU2l6ZTogSVZpZXdTaXplIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRPblNob3cgPSBmYWxzZTtcblx0cHJvdGVjdGVkIF9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50ID0gMDtcblx0cHJvdGVjdGVkIF9oYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0ID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZXN0b3JlZFByb21pc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IHdoZW5SZXN0b3JlZCA9IHRoaXMucmVzdG9yZWRQcm9taXNlLnA7XG5cdHByaXZhdGUgcmVzdG9yZWQgPSBmYWxzZTtcblxuXHRyZWFkb25seSBvcGVuZWREZWZhdWx0RWRpdG9ycyA9IGZhbHNlO1xuXG5cdHByb3RlY3RlZCBfc2F2ZWRQYXJ0U2l6ZXM6IElQYXJ0U2l6ZXNTdGF0ZSA9IHt9O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9QQVJUX1ZJU0lCSUxJVFlfS0VZID0gJ3dvcmtiZW5jaC5zZXNzaW9ucy5wYXJ0VmlzaWJpbGl0eSc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9QQVJUX1NJWkVTX0tFWSA9ICd3b3JrYmVuY2guc2Vzc2lvbnMucGFydFNpemVzJztcblxuXHQvLyNyZWdpb24gU2VydmljZXNcblxuXHRwcm90ZWN0ZWQgZWRpdG9yR3JvdXBTZXJ2aWNlITogSUVkaXRvckdyb3Vwc1NlcnZpY2U7XG5cdHByaXZhdGUgZWRpdG9yU2VydmljZSE6IElFZGl0b3JTZXJ2aWNlO1xuXHRwcml2YXRlIHBhbmVDb21wb3NpdGVTZXJ2aWNlITogSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZTtcblx0cHJpdmF0ZSB2aWV3RGVzY3JpcHRvclNlcnZpY2UhOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlO1xuXHRwcml2YXRlIHNlc3Npb25zU2VydmljZSE6IElTZXNzaW9uc1NlcnZpY2U7XG5cdHByaXZhdGUgc2Vzc2lvbnNQYXJ0U2VydmljZSE6IElTZXNzaW9uc1BhcnRTZXJ2aWNlO1xuXHRwcml2YXRlIGN1c3RvbVZpZXdTZXJ2aWNlITogSUN1c3RvbVZpZXdTZXJ2aWNlO1xuXHRwcml2YXRlIGN1c3RvbVZpZXdHcmlkUGFydFNlcnZpY2UhOiBJQ3VzdG9tVmlld0dyaWRQYXJ0U2VydmljZTtcblx0cHJpdmF0ZSBpbnN0YW50aWF0aW9uU2VydmljZSE6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0cHJpdmF0ZSBzdG9yYWdlU2VydmljZSE6IElTdG9yYWdlU2VydmljZTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgcGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElXb3JrYmVuY2hPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2VydmljZUNvbGxlY3Rpb246IFNlcnZpY2VDb2xsZWN0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFNlc3Npb25zLXNjb3BlZCBtb2JpbGUgdmlld3BvcnQgdHdlYWtzLiBUaGVzZSBhcmUgYXBwbGllZCBoZXJlXG5cdFx0Ly8gKHJhdGhlciB0aGFuIGluIHRoZSBzaGFyZWQgd29ya2JlbmNoLmh0bWwpIHNvIHRoYXQgdGhlIHJlZ3VsYXJcblx0XHQvLyBjb2RlLXdlYiB3b3JrYmVuY2ggXHUyMDE0IHdoaWNoIGRvZXMgbm90IGhhbmRsZSBzYWZlLWFyZWEgaW5zZXRzIFx1MjAxNCBpc1xuXHRcdC8vIG5vdCBhZmZlY3RlZCBvbiBub3RjaGVkIG1vYmlsZSBkZXZpY2VzLlxuXHRcdC8vIFRoZSB2aWV3cG9ydCBgPG1ldGE+YCB0YWcgaXMgaW5qZWN0ZWQgYnkgdGhlIHNoYXJlZCB3b3JrYmVuY2guaHRtbCxcblx0XHQvLyBzbyB3ZSBjYW5ub3QgdXNlIGRvbS50cyBgaCgpYCB0byBjcmVhdGUgaXQuIExvb2sgaXQgdXAgYnkgdGFnIG5hbWVcblx0XHQvLyBhbmQgZmlsdGVyIGJ5IHRoZSBgbmFtZWAgYXR0cmlidXRlIHRvIGF2b2lkIGEgc2VsZWN0b3IgcXVlcnkuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgbWV0YUVsZW1lbnRzID0gbWFpbldpbmRvdy5kb2N1bWVudC5oZWFkLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdtZXRhJyk7XG5cdFx0bGV0IHZpZXdwb3J0TWV0YTogSFRNTE1ldGFFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbWV0YUVsZW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAobWV0YUVsZW1lbnRzW2ldLm5hbWUgPT09ICd2aWV3cG9ydCcpIHtcblx0XHRcdFx0dmlld3BvcnRNZXRhID0gbWV0YUVsZW1lbnRzW2ldO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHZpZXdwb3J0TWV0YSAmJiAhdmlld3BvcnRNZXRhLmNvbnRlbnQuaW5jbHVkZXMoJ3ZpZXdwb3J0LWZpdD0nKSkge1xuXHRcdFx0dmlld3BvcnRNZXRhLmNvbnRlbnQgPSBgJHt2aWV3cG9ydE1ldGEuY29udGVudH0sIHZpZXdwb3J0LWZpdD1jb3ZlcmA7XG5cdFx0fVxuXG5cdFx0Ly8gUGVyZjogbWVhc3VyZSB3b3JrYmVuY2ggc3RhcnR1cCB0aW1lXG5cdFx0bWFyaygnY29kZS93aWxsU3RhcnRXb3JrYmVuY2gnKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFcnJvckhhbmRsZXIobG9nU2VydmljZSk7XG5cdH1cblxuXHQvLyNyZWdpb24gRXJyb3IgSGFuZGxpbmdcblxuXHRwcml2YXRlIHJlZ2lzdGVyRXJyb3JIYW5kbGVyKGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKTogdm9pZCB7XG5cdFx0Ly8gSW5jcmVhc2Ugc3RhY2sgdHJhY2UgbGltaXQgZm9yIGJldHRlciBlcnJvcnMgc3RhY2tzXG5cdFx0aWYgKCFpc0ZpcmVmb3gpIHtcblx0XHRcdEVycm9yLnN0YWNrVHJhY2VMaW1pdCA9IDEwMDtcblx0XHR9XG5cblx0XHQvLyBMaXN0ZW4gb24gdW5oYW5kbGVkIHJlamVjdGlvbiBldmVudHNcblx0XHQvLyBOb3RlOiBpbnRlbnRpb25hbGx5IG5vdCByZWdpc3RlcmVkIGFzIGRpc3Bvc2FibGUgdG8gaGFuZGxlXG5cdFx0Ly8gICAgICAgZXJyb3JzIHRoYXQgY2FuIG9jY3VyIGR1cmluZyBzaHV0ZG93biBwaGFzZS5cblx0XHRtYWluV2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3VuaGFuZGxlZHJlamVjdGlvbicsIChldmVudCkgPT4ge1xuXHRcdFx0Ly8gU2VlIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9Qcm9taXNlUmVqZWN0aW9uRXZlbnRcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGV2ZW50LnJlYXNvbik7XG5cblx0XHRcdC8vIFByZXZlbnQgdGhlIHByaW50aW5nIG9mIHRoaXMgZXZlbnQgdG8gdGhlIGNvbnNvbGVcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0fSk7XG5cblx0XHQvLyBJbnN0YWxsIGhhbmRsZXIgZm9yIHVuZXhwZWN0ZWQgZXJyb3JzXG5cdFx0c2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihlcnJvciA9PiB0aGlzLmhhbmRsZVVuZXhwZWN0ZWRFcnJvcihlcnJvciwgbG9nU2VydmljZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBwcmV2aW91c1VuZXhwZWN0ZWRFcnJvcjogeyBtZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHRpbWU6IG51bWJlciB9ID0geyBtZXNzYWdlOiB1bmRlZmluZWQsIHRpbWU6IDAgfTtcblx0cHJpdmF0ZSBoYW5kbGVVbmV4cGVjdGVkRXJyb3IoZXJyb3I6IHVua25vd24sIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKTogdm9pZCB7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IHRvRXJyb3JNZXNzYWdlKGVycm9yLCB0cnVlKTtcblx0XHRpZiAoIW1lc3NhZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdGlmIChtZXNzYWdlID09PSB0aGlzLnByZXZpb3VzVW5leHBlY3RlZEVycm9yLm1lc3NhZ2UgJiYgbm93IC0gdGhpcy5wcmV2aW91c1VuZXhwZWN0ZWRFcnJvci50aW1lIDw9IDEwMDApIHtcblx0XHRcdHJldHVybjsgLy8gUmV0dXJuIGlmIGVycm9yIG1lc3NhZ2UgaWRlbnRpY2FsIHRvIHByZXZpb3VzIGFuZCBzaG9ydGVyIHRoYW4gMSBzZWNvbmRcblx0XHR9XG5cblx0XHR0aGlzLnByZXZpb3VzVW5leHBlY3RlZEVycm9yLnRpbWUgPSBub3c7XG5cdFx0dGhpcy5wcmV2aW91c1VuZXhwZWN0ZWRFcnJvci5tZXNzYWdlID0gbWVzc2FnZTtcblxuXHRcdC8vIExvZyBpdFxuXHRcdGxvZ1NlcnZpY2UuZXJyb3IobWVzc2FnZSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gU3RhcnR1cFxuXG5cdHN0YXJ0dXAoKTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIHtcblx0XHR0cnkge1xuXHRcdFx0Ly8gQ29uZmlndXJlIGVtaXR0ZXIgbGVhayB3YXJuaW5nIHRocmVzaG9sZFxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoc2V0R2xvYmFsTGVha1dhcm5pbmdUaHJlc2hvbGQoMTc1KSk7XG5cblx0XHRcdC8vIFNlcnZpY2VzXG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuaW5pdFNlcnZpY2VzKHRoaXMuc2VydmljZUNvbGxlY3Rpb24pO1xuXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGNvbnN0IGxpZmVjeWNsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpZmVjeWNsZVNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBob3ZlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhvdmVyU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKSBhcyBOb3RpZmljYXRpb25TZXJ2aWNlO1xuXHRcdFx0XHRjb25zdCBtYXJrZG93blJlbmRlcmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UpO1xuXG5cdFx0XHRcdC8vIE9uIHdlYiwgdGhlIGNvbmZpZ3VyYXRpb24gc2VydmljZSBuZWVkcyBhY2Nlc3MgdG8gdGhlXG5cdFx0XHRcdC8vIGluc3RhbnRpYXRpb24gc2VydmljZSBmb3IgZHluYW1pYyBjb25maWd1cmF0aW9uIHJlc29sdXRpb24uXG5cdFx0XHRcdGlmIChpc1dlYiAmJiB0eXBlb2YgKGNvbmZpZ3VyYXRpb25TZXJ2aWNlIGFzIElDb25maWd1cmF0aW9uU2VydmljZSAmIHsgYWNxdWlyZUluc3RhbnRpYXRpb25TZXJ2aWNlPyhpOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiB2b2lkIH0pLmFjcXVpcmVJbnN0YW50aWF0aW9uU2VydmljZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdChjb25maWd1cmF0aW9uU2VydmljZSBhcyBJQ29uZmlndXJhdGlvblNlcnZpY2UgJiB7IGFjcXVpcmVJbnN0YW50aWF0aW9uU2VydmljZShpOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiB2b2lkIH0pLmFjcXVpcmVJbnN0YW50aWF0aW9uU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTZXQgY29kZSBibG9jayByZW5kZXJlciBmb3IgbWFya2Rvd24gcmVuZGVyaW5nXG5cdFx0XHRcdG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnNldERlZmF1bHRDb2RlQmxvY2tSZW5kZXJlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JNYXJrZG93bkNvZGVCbG9ja1JlbmRlcmVyKSk7XG5cblx0XHRcdFx0Ly8gRGVmYXVsdCBIb3ZlciBEZWxlZ2F0ZSBtdXN0IGJlIHJlZ2lzdGVyZWQgYmVmb3JlIGNyZWF0aW5nIGFueSB3b3JrYmVuY2gvbGF5b3V0IGNvbXBvbmVudHNcblx0XHRcdFx0c2V0SG92ZXJEZWxlZ2F0ZUZhY3RvcnkoKHBsYWNlbWVudCwgZW5hYmxlSW5zdGFudEhvdmVyKSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hIb3ZlckRlbGVnYXRlLCBwbGFjZW1lbnQsIHsgaW5zdGFudEhvdmVyOiBlbmFibGVJbnN0YW50SG92ZXIgfSwge30pKTtcblx0XHRcdFx0c2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZShob3ZlclNlcnZpY2UpO1xuXG5cdFx0XHRcdC8vIExheW91dFxuXHRcdFx0XHR0aGlzLmluaXRMYXlvdXQoYWNjZXNzb3IpO1xuXG5cdFx0XHRcdC8vIFJlZ2lzdHJpZXMgLSB0aGlzIGNyZWF0ZXMgYW5kIHJlZ2lzdGVycyBhbGwgcGFydHNcblx0XHRcdFx0UmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnN0YXJ0KGFjY2Vzc29yKTtcblx0XHRcdFx0UmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5zdGFydChhY2Nlc3Nvcik7XG5cblx0XHRcdFx0Ly8gQ29udGV4dCBLZXlzXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaENvbnRleHRLZXlzSGFuZGxlcikpO1xuXG5cdFx0XHRcdC8vIEVkaXRvciBNYXhpbWl6ZWQgQ29udGV4dCBLZXlcblx0XHRcdFx0Y29uc3QgZWRpdG9yTWF4aW1pemVkQ29udGV4dCA9IEVkaXRvck1heGltaXplZENvbnRleHQuYmluZFRvKGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUVkaXRvck1heGltaXplZCgoKSA9PiB7XG5cdFx0XHRcdFx0ZWRpdG9yTWF4aW1pemVkQ29udGV4dC5zZXQodGhpcy5pc0VkaXRvck1heGltaXplZCgpKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIFBob25lIExheW91dCBDb250ZXh0IEtleVxuXHRcdFx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBpc1Bob25lTGF5b3V0Q3R4ID0gSXNQaG9uZUxheW91dENvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdGlzUGhvbmVMYXlvdXRDdHguc2V0KHRoaXMubGF5b3V0UG9saWN5LnZpZXdwb3J0Q2xhc3MucmVhZChyZWFkZXIpID09PSAncGhvbmUnKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdFNpbmdsZVBhbmVMYXlvdXRFbmFibGVkQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpLnNldCh0aGlzLmlzU2luZ2xlUGFuZUxheW91dEVuYWJsZWQpO1xuXG5cdFx0XHRcdC8vIFZpcnR1YWwga2V5Ym9hcmQgdHJhY2tpbmcgKHZpc3VhbFZpZXdwb3J0KTogcHVibGlzaGVzIHRoZVxuXHRcdFx0XHQvLyBrZXlib2FyZCBoZWlnaHQgYXMgYW4gb2JzZXJ2YWJsZSwgbWlycm9ycyBpdCBvbnRvIHRoZVxuXHRcdFx0XHQvLyBgLS12c2NvZGUta2V5Ym9hcmQtaGVpZ2h0YCBDU1MgdmFyaWFibGUgb24gdGhlIG1haW5cblx0XHRcdFx0Ly8gY29udGFpbmVyLCBhbmQgZHJpdmVzIHRoZSBgS2V5Ym9hcmRWaXNpYmxlQ29udGV4dGBcblx0XHRcdFx0Ly8gY29udGV4dCBrZXkuIFRoZSBzZXJ2aWNlIGlzIGFuIGVhZ2VyIHNpbmdsZXRvbiwgc29cblx0XHRcdFx0Ly8gcmVzb2x2aW5nIGl0IGhlcmUgaXMgd2hhdCB0cmlnZ2VycyBpdHMgY29uc3RydWN0b3IgXHUyMDE0XG5cdFx0XHRcdC8vIHRoZSByZWdpc3RyeSBoYW5kcyBvd25lcnNoaXAvZGlzcG9zYWwgdG8gdGhlXG5cdFx0XHRcdC8vIGluc3RhbnRpYXRpb24gc2VydmljZSBzbyB3ZSBkb24ndCBgX3JlZ2lzdGVyYCBpdC5cblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElNb2JpbGVWaXN1YWxWaWV3cG9ydCk7XG5cblx0XHRcdFx0Ly8gT3JpZW50YXRpb24gY2hhbmdlcyBwcm9kdWNlIGEgd2luZG93IGByZXNpemVgIGV2ZW50IHdoaWNoXG5cdFx0XHRcdC8vIGlzIGFscmVhZHkgaGFuZGxlZCBieSBgcmVnaXN0ZXJMYXlvdXRMaXN0ZW5lcnMoKWAuIE5vXG5cdFx0XHRcdC8vIHNlcGFyYXRlIG1hdGNoTWVkaWEgbGlzdGVuZXIgaXMgbmVlZGVkIFx1MjAxNCB0aGUgcHJldmlvdXNcblx0XHRcdFx0Ly8gaW1wbGVtZW50YXRpb24gY2F1c2VkIGEgcmVkdW5kYW50IHNlY29uZCBsYXlvdXQuXG5cblx0XHRcdFx0Ly8gUmVnaXN0ZXIgTGlzdGVuZXJzXG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMobGlmZWN5Y2xlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBob3N0U2VydmljZSwgZGlhbG9nU2VydmljZSk7XG5cblx0XHRcdFx0Ly8gUmVuZGVyIFdvcmtiZW5jaFxuXHRcdFx0XHR0aGlzLnJlbmRlcldvcmtiZW5jaChpbnN0YW50aWF0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdFx0XHQvLyBXb3JrYmVuY2ggTGF5b3V0XG5cdFx0XHRcdHRoaXMuY3JlYXRlV29ya2JlbmNoTGF5b3V0KCk7XG5cblx0XHRcdFx0Ly8gQ3JlYXRlIG1vYmlsZSBuYXZpZ2F0aW9uIGFmdGVyIGdyaWQgZXhpc3RzIChzbyBET00gb3JkZXIgaXMgY29ycmVjdClcblx0XHRcdFx0aWYgKHRoaXMubGF5b3V0UG9saWN5LnZpZXdwb3J0Q2xhc3MuZ2V0KCkgPT09ICdwaG9uZScpIHtcblx0XHRcdFx0XHR0aGlzLmNyZWF0ZU1vYmlsZVRpdGxlYmFyKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBXb3JrYmVuY2ggTWFuYWdlbWVudFxuXHRcdFx0XHR0aGlzLmNyZWF0ZVdvcmtiZW5jaE1hbmFnZW1lbnQoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRcdC8vIExheW91dFxuXHRcdFx0XHR0aGlzLmxheW91dCgpO1xuXG5cdFx0XHRcdC8vIFJlc3RvcmVcblx0XHRcdFx0dGhpcy5yZXN0b3JlKGxpZmVjeWNsZVNlcnZpY2UpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXG5cdFx0XHR0aHJvdyBlcnJvcjsgLy8gcmV0aHJvdyBiZWNhdXNlIHRoaXMgaXMgYSBjcml0aWNhbCBpc3N1ZSB3ZSBjYW5ub3QgaGFuZGxlIHByb3Blcmx5IGhlcmVcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluaXRTZXJ2aWNlcyhzZXJ2aWNlQ29sbGVjdGlvbjogU2VydmljZUNvbGxlY3Rpb24pOiBJSW5zdGFudGlhdGlvblNlcnZpY2Uge1xuXHRcdC8vIExheW91dCBTZXJ2aWNlXG5cdFx0c2VydmljZUNvbGxlY3Rpb24uc2V0KElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UsIHRoaXMpO1xuXG5cdFx0Ly8gVGl0bGUgU2VydmljZSAtIGFnZW50IHNlc3Npb25zIHRpdGxlYmFyIHdpdGggZGVkaWNhdGVkIHBhcnQgb3ZlcnJpZGVzXG5cdFx0c2VydmljZUNvbGxlY3Rpb24uc2V0KElUaXRsZVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihUaXRsZVNlcnZpY2UsIFtdKSk7XG5cblx0XHQvLyBBbGwgQ29udHJpYnV0ZWQgU2VydmljZXNcblx0XHRjb25zdCBjb250cmlidXRlZFNlcnZpY2VzID0gZ2V0U2luZ2xldG9uU2VydmljZURlc2NyaXB0b3JzKCk7XG5cdFx0Zm9yIChjb25zdCBbaWQsIGRlc2NyaXB0b3JdIG9mIGNvbnRyaWJ1dGVkU2VydmljZXMpIHtcblx0XHRcdHNlcnZpY2VDb2xsZWN0aW9uLnNldChpZCwgZGVzY3JpcHRvcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZUNvbGxlY3Rpb24sIHRydWUpO1xuXG5cdFx0Ly8gV3JhcCB1cFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IGxpZmVjeWNsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpZmVjeWNsZVNlcnZpY2UpO1xuXHRcdFx0bGlmZWN5Y2xlU2VydmljZS5waGFzZSA9IExpZmVjeWNsZVBoYXNlLlJlYWR5O1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycyhsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSwgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSwgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UpOiB2b2lkIHtcblx0XHQvLyBDb21tYW5kOiBjbG9zZSB0aGUgbW9iaWxlIHNpZGViYXIgZHJhd2VyIChuby1vcCBvdXRzaWRlIHBob25lIGxheW91dCkuXG5cdFx0Ly8gUm91dGVzIHRocm91Z2ggdGhlIHByb3BlciBjbG9zZSBwYXRoIHNvIHRoZSBtb2JpbGUgbmF2L2hpc3Rvcnkgc3RhY2tcblx0XHQvLyBzdGF5cyBpbiBzeW5jIChhdm9pZHMgZXh0cmEgQW5kcm9pZCBiYWNrLWJ1dHRvbiBwcmVzc2VzKS5cblx0XHR0aGlzLl9yZWdpc3RlcihDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChDTE9TRV9NT0JJTEVfU0lERUJBUl9EUkFXRVJfQ09NTUFORF9JRCwgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMubGF5b3V0UG9saWN5LnZpZXdwb3J0Q2xhc3MuZ2V0KCkgPT09ICdwaG9uZScpIHtcblx0XHRcdFx0dGhpcy5jbG9zZU1vYmlsZVNpZGViYXJEcmF3ZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBDb25maWd1cmF0aW9uIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB0aGlzLnVwZGF0ZUZvbnRBbGlhc2luZyhlLCBjb25maWd1cmF0aW9uU2VydmljZSkpKTtcblxuXHRcdC8vIEZvbnQgSW5mb1xuXHRcdGlmIChpc05hdGl2ZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5yZWFzb24gPT09IFdpbGxTYXZlU3RhdGVSZWFzb24uU0hVVERPV04pIHtcblx0XHRcdFx0XHR0aGlzLnN0b3JlRm9udEluZm8oc3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oKCkgPT4gdGhpcy5zdG9yZUZvbnRJbmZvKHN0b3JhZ2VTZXJ2aWNlKSkpO1xuXHRcdH1cblxuXHRcdC8vIFBhcnQgU2l6ZXMgXHUyMDE0IHBlcnNpc3QgY3VycmVudCBncmlkIHNpemVzIHNvIHRoZXkgYXJlIHJlc3RvcmVkIG9uIHJlbG9hZFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZSgoKSA9PiB0aGlzLl9zYXZlUGFydFNpemVzKCkpKTtcblxuXHRcdC8vIExpZmVjeWNsZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oZXZlbnQgPT4gdGhpcy5fb25XaWxsU2h1dGRvd24uZmlyZShldmVudCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsaWZlY3ljbGVTZXJ2aWNlLm9uRGlkU2h1dGRvd24oKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRTaHV0ZG93bi5maXJlKCk7XG5cdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBGbHVzaCBzdG9yYWdlIG9uIHdpbmRvdyBmb2N1cyBsb3NzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoaG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1cyhmb2N1cyA9PiB7XG5cdFx0XHRpZiAoIWZvY3VzKSB7XG5cdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLmZsdXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRGlhbG9ncyBzaG93aW5nL2hpZGluZ1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpYWxvZ1NlcnZpY2Uub25XaWxsU2hvd0RpYWxvZygoKSA9PiB0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LmFkZCgnbW9kYWwtZGlhbG9nLXZpc2libGUnKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpYWxvZ1NlcnZpY2Uub25EaWRTaG93RGlhbG9nKCgpID0+IHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdtb2RhbC1kaWFsb2ctdmlzaWJsZScpKSk7XG5cdH1cblxuXHQvLyNyZWdpb24gRm9udCBBbGlhc2luZyBhbmQgQ2FjaGluZ1xuXG5cdHByaXZhdGUgZm9udEFsaWFzaW5nOiAnZGVmYXVsdCcgfCAnYW50aWFsaWFzZWQnIHwgJ25vbmUnIHwgJ2F1dG8nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHVwZGF0ZUZvbnRBbGlhc2luZyhlOiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IHwgdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7XG5cdFx0aWYgKCFpc01hY2ludG9zaCkge1xuXHRcdFx0cmV0dXJuOyAvLyBtYWNPUyBvbmx5XG5cdFx0fVxuXG5cdFx0aWYgKGUgJiYgIWUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaC5mb250QWxpYXNpbmcnKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsaWFzaW5nID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J2RlZmF1bHQnIHwgJ2FudGlhbGlhc2VkJyB8ICdub25lJyB8ICdhdXRvJz4oJ3dvcmtiZW5jaC5mb250QWxpYXNpbmcnKTtcblx0XHRpZiAodGhpcy5mb250QWxpYXNpbmcgPT09IGFsaWFzaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5mb250QWxpYXNpbmcgPSBhbGlhc2luZztcblxuXHRcdC8vIFJlbW92ZSBhbGxcblx0XHRjb25zdCBmb250QWxpYXNpbmdWYWx1ZXM6ICh0eXBlb2YgYWxpYXNpbmcpW10gPSBbJ2FudGlhbGlhc2VkJywgJ25vbmUnLCAnYXV0byddO1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKC4uLmZvbnRBbGlhc2luZ1ZhbHVlcy5tYXAodmFsdWUgPT4gYG1vbmFjby1mb250LWFsaWFzaW5nLSR7dmFsdWV9YCkpO1xuXG5cdFx0Ly8gQWRkIHNwZWNpZmljXG5cdFx0aWYgKGZvbnRBbGlhc2luZ1ZhbHVlcy5zb21lKG9wdGlvbiA9PiBvcHRpb24gPT09IGFsaWFzaW5nKSkge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoYG1vbmFjby1mb250LWFsaWFzaW5nLSR7YWxpYXNpbmd9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlRm9udEluZm8oc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IHZvaWQge1xuXHRcdGNvbnN0IHN0b3JlZEZvbnRJbmZvUmF3ID0gc3RvcmFnZVNlcnZpY2UuZ2V0KCdlZGl0b3JGb250SW5mbycsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKHN0b3JlZEZvbnRJbmZvUmF3KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdG9yZWRGb250SW5mbyA9IEpTT04ucGFyc2Uoc3RvcmVkRm9udEluZm9SYXcpO1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShzdG9yZWRGb250SW5mbykpIHtcblx0XHRcdFx0XHRGb250TWVhc3VyZW1lbnRzLnJlc3RvcmVGb250SW5mbyhtYWluV2luZG93LCBzdG9yZWRGb250SW5mbyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHQvKiBpZ25vcmUgKi9cblx0XHRcdH1cblx0XHR9XG5cblx0XHRGb250TWVhc3VyZW1lbnRzLnJlYWRGb250SW5mbyhtYWluV2luZG93LCBjcmVhdGVCYXJlRm9udEluZm9Gcm9tUmF3U2V0dGluZ3MoY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvcicpLCBQaXhlbFJhdGlvLmdldEluc3RhbmNlKG1haW5XaW5kb3cpLnZhbHVlKSk7XG5cdH1cblxuXHRwcml2YXRlIHN0b3JlRm9udEluZm8oc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlcmlhbGl6ZWRGb250SW5mbyA9IEZvbnRNZWFzdXJlbWVudHMuc2VyaWFsaXplRm9udEluZm8obWFpbldpbmRvdyk7XG5cdFx0aWYgKHNlcmlhbGl6ZWRGb250SW5mbykge1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2VkaXRvckZvbnRJbmZvJywgSlNPTi5zdHJpbmdpZnkoc2VyaWFsaXplZEZvbnRJbmZvKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xvYWRQYXJ0VmlzaWJpbGl0eShzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKTogeyBlZGl0b3I/OiBib29sZWFuOyBhdXhpbGlhcnlCYXI/OiBib29sZWFuOyBzaWRlYmFyPzogYm9vbGVhbiB9IHtcblx0XHRpZiAodGhpcy5sYXlvdXRQb2xpY3kudmlld3BvcnRDbGFzcy5nZXQoKSA9PT0gJ3Bob25lJykge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhdyA9IHN0b3JhZ2VTZXJ2aWNlLmdldChXb3JrYmVuY2guX1BBUlRfVklTSUJJTElUWV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmIChyYXcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gQ29ycnVwdGVkIGRhdGEgXHUyMDE0IHJlbW92ZSB0aGUgYmFkIGtleSBzbyB3ZSBkb24ndCBrZWVwIHdhcm5pbmcgb24gZXZlcnkgc3RhcnR1cFxuXHRcdFx0XHRzdG9yYWdlU2VydmljZS5yZW1vdmUoV29ya2JlbmNoLl9QQVJUX1ZJU0lCSUxJVFlfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0LyoqXG5cdCAqIE92ZXJsYXlzIHRoZSBwZXJzaXN0ZWQgcGFydCB2aXNpYmlsaXR5IG9uIHRvcCBvZiB0aGUgY3VycmVudFxuXHQgKiAobGF5b3V0LXBvbGljeSBkZWZhdWx0KSBgcGFydFZpc2liaWxpdHlgIHN0YXRlLiBNdXN0IHJ1biBiZWZvcmUgdGhlXG5cdCAqIGBXb3JrYmVuY2hDb250ZXh0S2V5c0hhbmRsZXJgIHJlYWRzIHRoZSBpbml0aWFsIHZpc2liaWxpdHkgc28gdGhhdFxuXHQgKiBjb250ZXh0IGtleXMgbGlrZSBgYXV4aWxpYXJ5QmFyVmlzaWJsZWAgcmVmbGVjdCB0aGUgcmVzdG9yZWQgc3RhdGUgb25cblx0ICogcmVsb2FkIHJhdGhlciB0aGFuIHRoZSBoYXJkY29kZWQgZGVmYXVsdHMuXG5cdCAqL1xuXHRwcml2YXRlIF9hcHBseVBlcnNpc3RlZFBhcnRWaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdGNvbnN0IHNhdmVkUGFydFZpc2liaWxpdHkgPSB0aGlzLl9sb2FkUGFydFZpc2liaWxpdHkodGhpcy5zdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IgPSBzYXZlZFBhcnRWaXNpYmlsaXR5LmVkaXRvciA/PyB0aGlzLnBhcnRWaXNpYmlsaXR5LmVkaXRvcjtcblx0XHR0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciA9IHNhdmVkUGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyID8/IHRoaXMucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyO1xuXHRcdHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhciA9IHNhdmVkUGFydFZpc2liaWxpdHkuc2lkZWJhciA/PyB0aGlzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXI7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3NhdmVQYXJ0VmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sYXlvdXRQb2xpY3kudmlld3BvcnRDbGFzcy5nZXQoKSA9PT0gJ3Bob25lJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoV29ya2JlbmNoLl9QQVJUX1ZJU0lCSUxJVFlfS0VZLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRlZGl0b3I6IHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0YXV4aWxpYXJ5QmFyOiB0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhcixcblx0XHRcdHNpZGViYXI6IHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhcixcblx0XHR9KSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvYWRQYXJ0U2l6ZXMoc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSk6IElQYXJ0U2l6ZXNTdGF0ZSB7XG5cdFx0Y29uc3QgcmF3ID0gc3RvcmFnZVNlcnZpY2UuZ2V0KFdvcmtiZW5jaC5fUEFSVF9TSVpFU19LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmIChyYXcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gQ29ycnVwdGVkIGRhdGEgXHUyMDE0IHJlbW92ZSB0aGUgYmFkIGtleSBzbyB3ZSBkb24ndCBrZWVwIHdhcm5pbmcgb24gZXZlcnkgc3RhcnR1cFxuXHRcdFx0XHRzdG9yYWdlU2VydmljZS5yZW1vdmUoV29ya2JlbmNoLl9QQVJUX1NJWkVTX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdHByaXZhdGUgX3NhdmVQYXJ0U2l6ZXMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLndvcmtiZW5jaEdyaWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUaGUgZWRpdG9yLXBhcnQgZ3JpZCBub2RlIGhvc3RzIHRoZSBkb2NrZWQgYXV4aWxpYXJ5IGJhciBpbiBzaW5nbGUtcGFuZSwgc29cblx0XHQvLyBpdCBpcyBcInZpc2libGVcIiB3aGVuZXZlciB0aGUgZWRpdG9yIE9SIHRoZSBkZXRhaWwgaXMgc2hvd24uIFVzZSB0aGUgbm9kZSdzXG5cdFx0Ly8gcmVhbCB2aXNpYmlsaXR5IChub3QganVzdCBgcGFydFZpc2liaWxpdHkuZWRpdG9yYCkgc28gYSBEZXRhaWwtb25seSBzZXNzaW9uXG5cdFx0Ly8gcmVjb3JkcyBpdHMgKmN1cnJlbnQqIGNvbGxhcHNlZCBub2RlIHdpZHRoIFx1MjAxNCByZWFkaW5nIHRoZSBzdGFsZSBjYWNoZWQgdmlzaWJsZVxuXHRcdC8vIHNpemUgKHdpZGUpIGhlcmUgd291bGQgcmVzdG9yZSBhIHdpZGUgbm9kZSBvbiByZWxvYWQgYW5kIGZsaWNrZXIgdGhlIGVkaXRvclxuXHRcdC8vIG9wZW4gdmlhIHRoZSB3aWR0aC1iYXNlZCByZXZlYWwtc3luYy4gQ2xhc3NpYyBsYXlvdXQgaXMgdW5hZmZlY3RlZFxuXHRcdC8vIChgX2VkaXRvck5vZGVWaXNpYmxlYCByZXR1cm5zIGBwYXJ0VmlzaWJpbGl0eS5lZGl0b3JgIHRoZXJlKS5cblx0XHRjb25zdCBlZGl0b3JOb2RlVmlzaWJsZSA9IHRoaXMuX2VkaXRvck5vZGVTaG91bGRCZVZpc2libGUoKTtcblx0XHRjb25zdCBlZGl0b3JHcmlkV2lkdGggPSB0aGlzLl9wZXJzaXN0ZWRHcmlkVmlld1NpemUodGhpcy5lZGl0b3JQYXJ0VmlldywgJ3dpZHRoJywgZWRpdG9yTm9kZVZpc2libGUpO1xuXHRcdGxldCBlZGl0b3JXaWR0aCA9IHRoaXMuX3BlcnNpc3RlZEVkaXRvcldpZHRoKGVkaXRvckdyaWRXaWR0aCk7XG5cblx0XHQvLyBBIHN1Yi1taW5pbXVtIG1lYXN1cmVtZW50IGlzIG5ldmVyIGEgcmVhbCB1c2VyIHdpZHRoOiB0aGUgZWRpdG9yIG1heSBiZVxuXHRcdC8vIGhpZGRlbiAoc2luZ2xlLXBhbmUgcmV0dXJucyB0aGUgZGV0YWlsLW9ubHkgbm9kZSBtaW51cyB0aGUgZGV0YWlsIHdpZHRoLFxuXHRcdC8vIGkuZS4gfjApLCBvciB0aGUgaGlnaC1wcmlvcml0eSBzZXNzaW9ucyBwYXJ0IG1heSBoYXZlIHRyYW5zaWVudGx5IHNxdWVlemVkXG5cdFx0Ly8gdGhlIG5vZGUgYmVsb3cgaXRzIG1pbmltdW0uIFBlcnNpc3RpbmcgaXQgd291bGQgcmVidWlsZCB0aGUgZWRpdG9yIGF0IGl0c1xuXHRcdC8vIDMwMHB4IG1pbmltdW0gb24gcmVsb2FkIGFuZCBsb3NlIHRoZSBsYXN0IHVzZXItc2VsZWN0ZWQgd2lkdGguIFByZXNlcnZlIHRoZVxuXHRcdC8vIGxhc3QgdmFsaWQgZ2xvYmFsIHdpZHRoIGluc3RlYWQgKG9yIG9taXQgaXQgc28gdGhlIGRlZmF1bHQgaXMgdXNlZCkuIFRoZVxuXHRcdC8vIGRlc2NyaXB0b3Iga2VlcHMgdGhlIGVkaXRvciBjb250cmlidXRpb24gYXQgemVybyB3aGlsZSB0aGUgZWRpdG9yIHBhcnQgaXNcblx0XHQvLyBoaWRkZW4sIHNvIGtlZXBpbmcgYSB2YWxpZCB3aWR0aCBoZXJlIGlzIHNhZmUuXG5cdFx0aWYgKGVkaXRvcldpZHRoID09PSB1bmRlZmluZWQgfHwgZWRpdG9yV2lkdGggPCBFRElUT1JfUEFSVF9NSU5JTVVNX1dJRFRIKSB7XG5cdFx0XHRlZGl0b3JXaWR0aCA9ICh0aGlzLl9zYXZlZFBhcnRTaXplcy5lZGl0b3IgIT09IHVuZGVmaW5lZCAmJiB0aGlzLl9zYXZlZFBhcnRTaXplcy5lZGl0b3IgPj0gRURJVE9SX1BBUlRfTUlOSU1VTV9XSURUSClcblx0XHRcdFx0PyB0aGlzLl9zYXZlZFBhcnRTaXplcy5lZGl0b3Jcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFRyYWNrIHRoZSBsYXRlc3QgZ29vZCB3aWR0aCBzbyBhIGxhdGVyIHNodXRkb3duLXRpbWUgc3F1ZWV6ZSBmYWxscyBiYWNrIHRvIGl0LlxuXHRcdFx0dGhpcy5fc2F2ZWRQYXJ0U2l6ZXMgPSB7IC4uLnRoaXMuX3NhdmVkUGFydFNpemVzLCBlZGl0b3I6IGVkaXRvcldpZHRoIH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2l6ZXM6IElQYXJ0U2l6ZXNTdGF0ZSA9IHtcblx0XHRcdHNpZGViYXI6IHRoaXMuX3BlcnNpc3RlZEdyaWRWaWV3U2l6ZSh0aGlzLnNpZGVCYXJQYXJ0VmlldywgJ3dpZHRoJywgdGhpcy5wYXJ0VmlzaWJpbGl0eS5zaWRlYmFyKSxcblx0XHRcdGF1eGlsaWFyeUJhcjogdGhpcy5fcGVyc2lzdGVkR3JpZFZpZXdTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcsICd3aWR0aCcsIHRoaXMuX2VmZmVjdGl2ZVZpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpKSxcblx0XHRcdHNlc3Npb25zOiB0aGlzLl9wZXJzaXN0ZWRHcmlkVmlld1NpemUodGhpcy5zZXNzaW9uc1BhcnRWaWV3LCAnd2lkdGgnLCB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLlNFU1NJT05TX1BBUlQpKSxcblx0XHRcdGVkaXRvcjogZWRpdG9yV2lkdGgsXG5cdFx0XHRwYW5lbDogdGhpcy5fcGVyc2lzdGVkR3JpZFZpZXdTaXplKHRoaXMucGFuZWxQYXJ0VmlldywgJ2hlaWdodCcsIHRoaXMuX2VmZmVjdGl2ZVZpc2libGUoUGFydHMuUEFORUxfUEFSVCkpLFxuXHRcdH07XG5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFdvcmtiZW5jaC5fUEFSVF9TSVpFU19LRVksIEpTT04uc3RyaW5naWZ5KHNpemVzKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgcmVuZGVyV29ya2JlbmNoKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2U6IE5vdGlmaWNhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiB2b2lkIHtcblx0XHQvLyBBUklBICYgU2lnbmFsc1xuXHRcdHNldEFSSUFDb250YWluZXIodGhpcy5tYWluQ29udGFpbmVyKTtcblx0XHRzZXRQcm9ncmVzc0FjY2Vzc2liaWxpdHlTaWduYWxTY2hlZHVsZXIoKG1zRGVsYXlUaW1lOiBudW1iZXIsIG1zTG9vcFRpbWU/OiBudW1iZXIpID0+IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFjY2Vzc2liaWxpdHlQcm9ncmVzc1NpZ25hbFNjaGVkdWxlciwgbXNEZWxheVRpbWUsIG1zTG9vcFRpbWUpKTtcblxuXHRcdC8vIEluaXRpYWxpemUgdmlld3BvcnQgY2xhc3NpZmljYXRpb24gYmVmb3JlIGJ1aWxkaW5nIGxheW91dCBjbGFzc2VzXG5cdFx0Y29uc3QgaW5pdGlhbERpbWVuc2lvbiA9IGdldENsaWVudEFyZWEodGhpcy5wYXJlbnQpO1xuXHRcdHRoaXMubGF5b3V0UG9saWN5LnVwZGF0ZShpbml0aWFsRGltZW5zaW9uLndpZHRoLCBpbml0aWFsRGltZW5zaW9uLmhlaWdodCk7XG5cblx0XHQvLyBBcHBseSBpbml0aWFsIHBhcnQgdmlzaWJpbGl0eSBmcm9tIGxheW91dCBwb2xpY3kgKHBob25lIGhpZGVzIHNpZGViYXIsIGV0Yy4pXG5cdFx0Y29uc3QgdmlzaWJpbGl0eURlZmF1bHRzID0gdGhpcy5sYXlvdXRQb2xpY3kuZ2V0UGFydFZpc2liaWxpdHlEZWZhdWx0cygpO1xuXHRcdHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhciA9IHZpc2liaWxpdHlEZWZhdWx0cy5zaWRlYmFyO1xuXHRcdHRoaXMucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyID0gdmlzaWJpbGl0eURlZmF1bHRzLmF1eGlsaWFyeUJhcjtcblx0XHR0aGlzLnBhcnRWaXNpYmlsaXR5LnBhbmVsID0gdmlzaWJpbGl0eURlZmF1bHRzLnBhbmVsO1xuXHRcdHRoaXMucGFydFZpc2liaWxpdHkuc2Vzc2lvbnMgPSB2aXNpYmlsaXR5RGVmYXVsdHMuc2Vzc2lvbnM7XG5cdFx0dGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IgPSB2aXNpYmlsaXR5RGVmYXVsdHMuZWRpdG9yO1xuXHRcdHRoaXMuX2FwcGx5UGVyc2lzdGVkUGFydFZpc2liaWxpdHkoKTtcblxuXHRcdC8vIExvYWQgc2F2ZWQgZ3JpZCBwYXJ0IHNpemVzIFx1MjAxNCB0aGVzZSB3aWxsIGJlIGNvbnN1bWVkIHdoZW4gYnVpbGRpbmcgdGhlXG5cdFx0Ly8gZ3JpZCBkZXNjcmlwdG9yIHNvIGVkaXRvci9zaWRlYmFyL2F1eGJhci9wYW5lbCByZXN0b3JlIHRvIHRoZWlyIHByZXZpb3VzXG5cdFx0Ly8gZGltZW5zaW9ucyBhY3Jvc3MgcmVsb2Fkcy5cblx0XHR0aGlzLl9zYXZlZFBhcnRTaXplcyA9IHRoaXMuX2xvYWRQYXJ0U2l6ZXMoc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGlmICh0aGlzLl9zYXZlZFBhcnRTaXplcy5hdXhpbGlhcnlCYXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fcmVzdG9yZUF1eGlsaWFyeUJhcldpZHRoKHRoaXMuX3NhdmVkUGFydFNpemVzLmF1eGlsaWFyeUJhcik7XG5cdFx0fVxuXG5cdFx0Ly8gU3RhdGUgc3BlY2lmaWMgY2xhc3Nlc1xuXHRcdGNvbnN0IHBsYXRmb3JtQ2xhc3MgPSBpc1dpbmRvd3MgPyAnd2luZG93cycgOiBpc0xpbnV4ID8gJ2xpbnV4JyA6ICdtYWMnO1xuXHRcdGNvbnN0IHdvcmtiZW5jaENsYXNzZXMgPSBjb2FsZXNjZShbXG5cdFx0XHQnbW9uYWNvLXdvcmtiZW5jaCcsXG5cdFx0XHQnYWdlbnQtc2Vzc2lvbnMtd29ya2JlbmNoJyxcblx0XHRcdC8vIExheW91dENsYXNzZXMuU0hFTExfR1JBRElFTlRfQkFDS0dST1VORCxcblx0XHRcdHBsYXRmb3JtQ2xhc3MsXG5cdFx0XHRpc1dlYiA/ICd3ZWInIDogdW5kZWZpbmVkLFxuXHRcdFx0aXNDaHJvbWUgPyAnY2hyb21pdW0nIDogaXNGaXJlZm94ID8gJ2ZpcmVmb3gnIDogaXNTYWZhcmkgPyAnc2FmYXJpJyA6IHVuZGVmaW5lZCxcblx0XHRcdC4uLnRoaXMuZ2V0TGF5b3V0Q2xhc3NlcygpLFxuXHRcdFx0Li4uKHRoaXMub3B0aW9ucz8uZXh0cmFDbGFzc2VzID8gdGhpcy5vcHRpb25zLmV4dHJhQ2xhc3NlcyA6IFtdKVxuXHRcdF0pO1xuXG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoLi4ud29ya2JlbmNoQ2xhc3Nlcyk7XG5cblx0XHQvLyBBcHBseSBmb250IGFsaWFzaW5nXG5cdFx0dGhpcy51cGRhdGVGb250QWxpYXNpbmcodW5kZWZpbmVkLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHQvLyBXYXJtIHVwIGZvbnQgY2FjaGUgaW5mb3JtYXRpb24gYmVmb3JlIGJ1aWxkaW5nIHVwIHRvbyBtYW55IGRvbSBlbGVtZW50c1xuXHRcdHRoaXMucmVzdG9yZUZvbnRJbmZvKHN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHQvLyBDcmVhdGUgUGFydHMgKGVkaXRvciBzdGFydHMgaGlkZGVuIGFuZCBpcyBzaG93biB3aGVuIGFuIGVkaXRvciBvcGVucylcblx0XHRmb3IgKGNvbnN0IHsgaWQsIHJvbGUsIGNsYXNzZXMgfSBvZiBbXG5cdFx0XHR7IGlkOiBQYXJ0cy5USVRMRUJBUl9QQVJULCByb2xlOiAnbm9uZScsIGNsYXNzZXM6IFsndGl0bGViYXInXSB9LFxuXHRcdFx0eyBpZDogUGFydHMuU0lERUJBUl9QQVJULCByb2xlOiAnbm9uZScsIGNsYXNzZXM6IFsnc2lkZWJhcicsICdsZWZ0J10gfSxcblx0XHRcdHsgaWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCByb2xlOiAnbm9uZScsIGNsYXNzZXM6IFsnYXV4aWxpYXJ5YmFyJywgJ2Jhc2VwYW5lbCcsICdyaWdodCddIH0sXG5cdFx0XHR7IGlkOiBQYXJ0cy5QQU5FTF9QQVJULCByb2xlOiAnbm9uZScsIGNsYXNzZXM6IFsncGFuZWwnLCAnYmFzZXBhbmVsJywgcG9zaXRpb25Ub1N0cmluZyh0aGlzLmdldFBhbmVsUG9zaXRpb24oKSldIH0sXG5cdFx0XSkge1xuXHRcdFx0Y29uc3QgcGFydENvbnRhaW5lciA9IHRoaXMuY3JlYXRlUGFydENvbnRhaW5lcihpZCwgcm9sZSwgY2xhc3Nlcyk7XG5cblx0XHRcdG1hcmsoYGNvZGUvd2lsbENyZWF0ZVBhcnQvJHtpZH1gKTtcblx0XHRcdHRoaXMuZ2V0UGFydChpZCkuY3JlYXRlKHBhcnRDb250YWluZXIpO1xuXHRcdFx0bWFyayhgY29kZS9kaWRDcmVhdGVQYXJ0LyR7aWR9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIEVkaXRvciBQYXJ0IChoaWRkZW4gYnkgZGVmYXVsdClcblx0XHR0aGlzLmNyZWF0ZUVkaXRvclBhcnQoKTtcblxuXHRcdC8vIENyZWF0ZSBTZXNzaW9ucyBQYXJ0XG5cdFx0dGhpcy5jcmVhdGVTZXNzaW9uc1BhcnQoKTtcblxuXHRcdC8vIENyZWF0ZSBDdXN0b20gVmlldyBHcmlkIFBhcnQgKGhpZGRlbiBieSBkZWZhdWx0KVxuXHRcdHRoaXMuY3JlYXRlQ3VzdG9tVmlld0dyaWRQYXJ0KCk7XG5cblx0XHQvLyBOb3RpZmljYXRpb24gSGFuZGxlcnNcblx0XHR0aGlzLmNyZWF0ZU5vdGlmaWNhdGlvbnNIYW5kbGVycyhpbnN0YW50aWF0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Ly8gQWRkIFdvcmtiZW5jaCB0byBET01cblx0XHR0aGlzLnBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLm1haW5Db250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVNb2JpbGVUaXRsZWJhcigpOiB2b2lkIHtcblx0XHR0aGlzLm1vYmlsZVRvcEJhckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29uc3QgbW9iaWxlVGl0bGViYXIgPSB0aGlzLm1vYmlsZVRvcEJhckRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vYmlsZVRpdGxlYmFyUGFydCwgdGhpcy5tYWluQ29udGFpbmVyKSk7XG5cdFx0dGhpcy5tb2JpbGVUb3BCYXJFbGVtZW50ID0gbW9iaWxlVGl0bGViYXIuZWxlbWVudDtcblxuXHRcdC8vIEhhbWJ1cmdlcjogdG9nZ2xlIHNpZGViYXIgZHJhd2VyIG92ZXJsYXlcblx0XHR0aGlzLm1vYmlsZVRvcEJhckRpc3Bvc2FibGVzLmFkZChtb2JpbGVUaXRsZWJhci5vbkRpZENsaWNrSGFtYnVyZ2VyKCgpID0+IHtcblx0XHRcdHRoaXMudG9nZ2xlTW9iaWxlU2lkZWJhckRyYXdlcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIE5ldyBzZXNzaW9uOiBvcGVuIG5ldyBjaGF0IHZpZXcgYW5kIGRpc21pc3MgdGhlIHNpZGViYXIgZHJhd2VyXG5cdFx0Ly8gc28gdGhlIG5ldyBzZXNzaW9uIHZpZXcgYmVjb21lcyB2aXNpYmxlLiBjcmVhdGVNb2JpbGVUaXRsZWJhcigpIGlzXG5cdFx0Ly8gb25seSBpbnZva2VkIGluIHBob25lIGxheW91dCwgc28gY2xvc2luZyB0aGUgZHJhd2VyIGhlcmUgaXMgc2FmZS5cblx0XHR0aGlzLm1vYmlsZVRvcEJhckRpc3Bvc2FibGVzLmFkZChtb2JpbGVUaXRsZWJhci5vbkRpZENsaWNrTmV3U2Vzc2lvbigoKSA9PiB7XG5cdFx0XHR0aGlzLnNlc3Npb25zU2VydmljZS5vcGVuTmV3U2Vzc2lvbigpO1xuXHRcdFx0dGhpcy5jbG9zZU1vYmlsZVNpZGViYXJEcmF3ZXIoKTtcblx0XHRcdHRoaXMuc2Vzc2lvbnNQYXJ0U2VydmljZS5mb2N1c1Nlc3Npb24odGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVNb2JpbGVTaWRlYmFyRHJhd2VyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGlzT3BlbiA9IHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhcjtcblx0XHRpZiAoaXNPcGVuKSB7XG5cdFx0XHR0aGlzLmNsb3NlTW9iaWxlU2lkZWJhckRyYXdlcigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm9wZW5Nb2JpbGVTaWRlYmFyRHJhd2VyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvcGVuTW9iaWxlU2lkZWJhckRyYXdlcigpOiB2b2lkIHtcblx0XHQvLyBQdXNoIGEgaGlzdG9yeSBlbnRyeSBzbyB0aGUgQW5kcm9pZCBiYWNrIGJ1dHRvbiBkaXNtaXNzZXMgdGhlIGRyYXdlci5cblx0XHQvLyBNdXN0IGNvbWUgYmVmb3JlIHNldFNpZGVCYXJIaWRkZW4oZmFsc2UpIHNvIGxheW91dE1vYmlsZVNpZGViYXIoKSBzZWVzXG5cdFx0Ly8gdGhlIGRyYXdlciBzdGF0ZS5cblx0XHRpZiAoIXRoaXMubW9iaWxlTmF2U3RhY2suaGFzKCdzaWRlYmFyJykpIHtcblx0XHRcdHRoaXMubW9iaWxlTmF2U3RhY2sucHVzaCgnc2lkZWJhcicpO1xuXHRcdH1cblxuXHRcdC8vIFNob3cgc2lkZWJhciBpbiBncmlkIFx1MjAxNCB0aGUgYWN0dWFsIGRyYXdlciBkaW1lbnNpb25zIGFyZSBhcHBsaWVkIGJ5XG5cdFx0Ly8gbGF5b3V0TW9iaWxlU2lkZWJhcigpIGZyb20gd2l0aGluIGxheW91dCgpLCB3aGljaCB1c2VzIHRoZSBmdWxsXG5cdFx0Ly8gdmlld3BvcnQgd2lkdGggYmVsb3cgdGhlIG1vYmlsZSB0b3AgYmFyIG9uIHBob25lLiBUaGUgdG9nZ2xlIGJ1dHRvblxuXHRcdC8vIGluIHRoZSB0b3AgYmFyIHJlbWFpbnMgdmlzaWJsZSBhbmQgaXMgdXNlZCB0byBjbG9zZSB0aGUgZHJhd2VyLlxuXHRcdHRoaXMuc2V0U2lkZUJhckhpZGRlbihmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGNsb3NlTW9iaWxlU2lkZWJhckRyYXdlcigpOiB2b2lkIHtcblx0XHQvLyBIaWRlIHNpZGViYXIgaW4gZ3JpZFxuXHRcdHRoaXMuc2V0U2lkZUJhckhpZGRlbih0cnVlKTtcblxuXHRcdC8vIFN5bmMgdGhlIG5hdmlnYXRpb24gc3RhY2sgd2l0aCB0aGUgYnJvd3NlciBoaXN0b3J5OiBpZiB0aGVyZSBpcyBhXG5cdFx0Ly8gcGVuZGluZyAnc2lkZWJhcicgZW50cnkgKFVJLWluaXRpYXRlZCBjbG9zZSksIHJld2luZCBoaXN0b3J5IHdpdGhvdXRcblx0XHQvLyBmaXJpbmcgb25EaWRQb3AuIElmIHdlJ3JlIGJlaW5nIGNhbGxlZCBmcm9tIHRoZSBiYWNrLWJ1dHRvbiBwYXRoXG5cdFx0Ly8gKG9uRGlkUG9wIGFscmVhZHkgZmlyZWQpLCB0aGlzIGlzIGEgbm8tb3AuXG5cdFx0aWYgKHRoaXMubW9iaWxlTmF2U3RhY2suaGFzKCdzaWRlYmFyJykpIHtcblx0XHRcdHRoaXMubW9iaWxlTmF2U3RhY2sucG9wU2lsZW50bHkoJ3NpZGViYXInKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU5vdGlmaWNhdGlvbnNIYW5kbGVycyhcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2U6IE5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpOiB2b2lkIHtcblx0XHQvLyBJbnN0YW50aWF0ZSBOb3RpZmljYXRpb24gY29tcG9uZW50c1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnNDZW50ZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RpZmljYXRpb25zQ2VudGVyLCB0aGlzLm1haW5Db250YWluZXIsIG5vdGlmaWNhdGlvblNlcnZpY2UubW9kZWwpKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25zVG9hc3RzID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90aWZpY2F0aW9uc1RvYXN0cywgdGhpcy5tYWluQ29udGFpbmVyLCBub3RpZmljYXRpb25TZXJ2aWNlLm1vZGVsKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90aWZpY2F0aW9uc0FsZXJ0cywgbm90aWZpY2F0aW9uU2VydmljZS5tb2RlbCkpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnNTdGF0dXMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RpZmljYXRpb25zU3RhdHVzLCBub3RpZmljYXRpb25TZXJ2aWNlLm1vZGVsKSk7XG5cblx0XHQvLyBWaXNpYmlsaXR5XG5cdFx0dGhpcy5fcmVnaXN0ZXIobm90aWZpY2F0aW9uc0NlbnRlci5vbkRpZENoYW5nZVZpc2liaWxpdHkoKCkgPT4ge1xuXHRcdFx0bm90aWZpY2F0aW9uc1N0YXR1cy51cGRhdGUobm90aWZpY2F0aW9uc0NlbnRlci5pc1Zpc2libGUsIG5vdGlmaWNhdGlvbnNUb2FzdHMuaXNWaXNpYmxlKTtcblx0XHRcdG5vdGlmaWNhdGlvbnNUb2FzdHMudXBkYXRlKG5vdGlmaWNhdGlvbnNDZW50ZXIuaXNWaXNpYmxlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihub3RpZmljYXRpb25zVG9hc3RzLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eSgoKSA9PiB7XG5cdFx0XHRub3RpZmljYXRpb25zU3RhdHVzLnVwZGF0ZShub3RpZmljYXRpb25zQ2VudGVyLmlzVmlzaWJsZSwgbm90aWZpY2F0aW9uc1RvYXN0cy5pc1Zpc2libGUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlZ2lzdGVyIENvbW1hbmRzXG5cdFx0cmVnaXN0ZXJOb3RpZmljYXRpb25Db21tYW5kcyhub3RpZmljYXRpb25zQ2VudGVyLCBub3RpZmljYXRpb25zVG9hc3RzLCBub3RpZmljYXRpb25TZXJ2aWNlLm1vZGVsKTtcblxuXHRcdC8vIFJlZ2lzdGVyIG5vdGlmaWNhdGlvbiBhY2Nlc3NpYmxlIHZpZXdcblx0XHRBY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LnJlZ2lzdGVyKG5ldyBOb3RpZmljYXRpb25BY2Nlc3NpYmxlVmlldygpKTtcblxuXHRcdC8vIFRoZSBzaGFyZWQgbm90aWZpY2F0aW9uIGNvbnRyb2xsZXJzIGFwcGx5IGEgdG9wLXJpZ2h0IGlubGluZSBvZmZzZXQgYmFzZWQgb24gdGhlXG5cdFx0Ly8gZGVmYXVsdCB3b3JrYmVuY2ggY3VzdG9tIHRpdGxlYmFyIGhlaWdodC4gVGhlIHNlc3Npb25zIHdvcmtiZW5jaCBoYXMgaXRzIG93blxuXHRcdC8vIGZpeGVkIGNocm9tZSwgc28gcmUtYXBwbHkgdGhlIHNlc3Npb25zLXNwZWNpZmljIHRvcC1yaWdodCBvZmZzZXQgYWZ0ZXIgdGhleSBydW4uXG5cdFx0dGhpcy5yZWdpc3RlclNlc3Npb25zTm90aWZpY2F0aW9uT2Zmc2V0cyhjb25maWd1cmF0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uc0NlbnRlciwgbm90aWZpY2F0aW9uc1RvYXN0cyk7XG5cblx0XHQvLyBSZWdpc3RlciB3aXRoIExheW91dFxuXHRcdHRoaXMucmVnaXN0ZXJOb3RpZmljYXRpb25zKHtcblx0XHRcdG9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uc1Zpc2liaWxpdHk6IEV2ZW50Lm1hcChcblx0XHRcdFx0RXZlbnQuYW55KG5vdGlmaWNhdGlvbnNUb2FzdHMub25EaWRDaGFuZ2VWaXNpYmlsaXR5LCBub3RpZmljYXRpb25zQ2VudGVyLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eSksXG5cdFx0XHRcdCgpID0+IG5vdGlmaWNhdGlvbnNUb2FzdHMuaXNWaXNpYmxlIHx8IG5vdGlmaWNhdGlvbnNDZW50ZXIuaXNWaXNpYmxlXG5cdFx0XHQpXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU2Vzc2lvbnNOb3RpZmljYXRpb25PZmZzZXRzKFxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0bm90aWZpY2F0aW9uc0NlbnRlcjogTm90aWZpY2F0aW9uc0NlbnRlcixcblx0XHRub3RpZmljYXRpb25zVG9hc3RzOiBOb3RpZmljYXRpb25zVG9hc3RzXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IGFwcGx5U2Vzc2lvbnNOb3RpZmljYXRpb25PZmZzZXRzID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBnZXROb3RpZmljYXRpb25zUG9zaXRpb24oY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lciA9IHRoaXMuZ2V0V29ya2JlbmNoQ2hpbGRCeUNsYXNzTmFtZSgnbm90aWZpY2F0aW9ucy1jZW50ZXInKTtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbnNUb2FzdHNDb250YWluZXIgPSB0aGlzLmdldFdvcmtiZW5jaENoaWxkQnlDbGFzc05hbWUoJ25vdGlmaWNhdGlvbnMtdG9hc3RzJyk7XG5cblx0XHRcdGlmIChwb3NpdGlvbiA9PT0gTm90aWZpY2F0aW9uc1Bvc2l0aW9uLlRPUF9SSUdIVCkge1xuXHRcdFx0XHRub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyPy5zdHlsZS5zZXRQcm9wZXJ0eSgndG9wJywgJzQwcHgnKTtcblx0XHRcdFx0bm90aWZpY2F0aW9uc1RvYXN0c0NvbnRhaW5lcj8uc3R5bGUuc2V0UHJvcGVydHkoJ3RvcCcsICc0MHB4Jyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRMYXlvdXRNYWluQ29udGFpbmVyKCgpID0+IGFwcGx5U2Vzc2lvbnNOb3RpZmljYXRpb25PZmZzZXRzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihub3RpZmljYXRpb25zQ2VudGVyLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eSgoKSA9PiBhcHBseVNlc3Npb25zTm90aWZpY2F0aW9uT2Zmc2V0cygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobm90aWZpY2F0aW9uc1RvYXN0cy5vbkRpZENoYW5nZVZpc2liaWxpdHkoKCkgPT4gYXBwbHlTZXNzaW9uc05vdGlmaWNhdGlvbk9mZnNldHMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGlmaWNhdGlvbnNTZXR0aW5ncy5OT1RJRklDQVRJT05TX1BPU0lUSU9OKSkge1xuXHRcdFx0XHRhcHBseVNlc3Npb25zTm90aWZpY2F0aW9uT2Zmc2V0cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0V29ya2JlbmNoQ2hpbGRCeUNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZyk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMubWFpbkNvbnRhaW5lci5jaGlsZHJlbikge1xuXHRcdFx0aWYgKGlzSFRNTEVsZW1lbnQoY2hpbGQpICYmIGNoaWxkLmNsYXNzTGlzdC5jb250YWlucyhjbGFzc05hbWUpKSB7XG5cdFx0XHRcdHJldHVybiBjaGlsZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVQYXJ0Q29udGFpbmVyKGlkOiBzdHJpbmcsIHJvbGU6IHN0cmluZywgY2xhc3Nlczogc3RyaW5nW10pOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgcGFydCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHBhcnQuY2xhc3NMaXN0LmFkZCgncGFydCcsIC4uLmNsYXNzZXMpO1xuXHRcdHBhcnQuaWQgPSBpZDtcblx0XHRwYXJ0LnNldEF0dHJpYnV0ZSgncm9sZScsIHJvbGUpO1xuXHRcdHJldHVybiBwYXJ0O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVFZGl0b3JQYXJ0KCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvclBhcnRDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRlZGl0b3JQYXJ0Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3BhcnQnLCAnZWRpdG9yJyk7XG5cdFx0ZWRpdG9yUGFydENvbnRhaW5lci5pZCA9IFBhcnRzLkVESVRPUl9QQVJUO1xuXHRcdGVkaXRvclBhcnRDb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ21haW4nKTtcblx0XHR0aGlzLl9lZGl0b3JQYXJ0Q29udGFpbmVyID0gZWRpdG9yUGFydENvbnRhaW5lcjtcblxuXHRcdG1hcmsoJ2NvZGUvd2lsbENyZWF0ZVBhcnQvd29ya2JlbmNoLnBhcnRzLmVkaXRvcicpO1xuXHRcdHRoaXMuZ2V0UGFydChQYXJ0cy5FRElUT1JfUEFSVCkuY3JlYXRlKGVkaXRvclBhcnRDb250YWluZXIsIHsgcmVzdG9yZVByZXZpb3VzU3RhdGU6IGZhbHNlIH0pO1xuXHRcdG1hcmsoJ2NvZGUvZGlkQ3JlYXRlUGFydC93b3JrYmVuY2gucGFydHMuZWRpdG9yJyk7XG5cblx0XHR0aGlzLm1haW5Db250YWluZXIuYXBwZW5kQ2hpbGQoZWRpdG9yUGFydENvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNlc3Npb25zUGFydCgpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uc1BhcnRDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRzZXNzaW9uc1BhcnRDb250YWluZXIuY2xhc3NMaXN0LmFkZCgncGFydCcsICdzZXNzaW9uc3BhcnQnLCAnYmFzZXBhbmVsJywgJ3JpZ2h0JywgQUdFTlRTX1BBUlRfQ0FSRF9DTEFTUyk7XG5cdFx0c2Vzc2lvbnNQYXJ0Q29udGFpbmVyLmlkID0gUGFydHMuU0VTU0lPTlNfUEFSVDtcblx0XHRzZXNzaW9uc1BhcnRDb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ21haW4nKTtcblxuXHRcdG1hcmsoYGNvZGUvd2lsbENyZWF0ZVBhcnQvJHtQYXJ0cy5TRVNTSU9OU19QQVJUfWApO1xuXHRcdHRoaXMuZ2V0UGFydChQYXJ0cy5TRVNTSU9OU19QQVJUKS5jcmVhdGUoc2Vzc2lvbnNQYXJ0Q29udGFpbmVyKTtcblx0XHRtYXJrKGBjb2RlL2RpZENyZWF0ZVBhcnQvJHtQYXJ0cy5TRVNTSU9OU19QQVJUfWApO1xuXG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmFwcGVuZENoaWxkKHNlc3Npb25zUGFydENvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUN1c3RvbVZpZXdHcmlkUGFydCgpOiB2b2lkIHtcblx0XHRjb25zdCBjdXN0b21WaWV3R3JpZFBhcnRDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjdXN0b21WaWV3R3JpZFBhcnRDb250YWluZXIuY2xhc3NMaXN0LmFkZCgncGFydCcsICdjdXN0b212aWV3Z3JpZHBhcnQnLCAnYmFzZXBhbmVsJywgJ3JpZ2h0JywgQUdFTlRTX1BBUlRfQ0FSRF9DTEFTUyk7XG5cdFx0Y3VzdG9tVmlld0dyaWRQYXJ0Q29udGFpbmVyLmlkID0gUGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJUO1xuXHRcdGN1c3RvbVZpZXdHcmlkUGFydENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbWFpbicpO1xuXG5cdFx0bWFyayhgY29kZS93aWxsQ3JlYXRlUGFydC8ke1BhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVH1gKTtcblx0XHR0aGlzLmdldFBhcnQoUGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJUKS5jcmVhdGUoY3VzdG9tVmlld0dyaWRQYXJ0Q29udGFpbmVyKTtcblx0XHRtYXJrKGBjb2RlL2RpZENyZWF0ZVBhcnQvJHtQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlR9YCk7XG5cblx0XHR0aGlzLm1haW5Db250YWluZXIuYXBwZW5kQ2hpbGQoY3VzdG9tVmlld0dyaWRQYXJ0Q29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzdG9yZShsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSk6IHZvaWQge1xuXHRcdC8vIFVwZGF0ZSBwZXJmIG1hcmtzXG5cdFx0bWFyaygnY29kZS9kaWRTdGFydFdvcmtiZW5jaCcpO1xuXHRcdHBlcmZvcm1hbmNlLm1lYXN1cmUoJ3BlcmY6IHdvcmtiZW5jaCBjcmVhdGUgJiByZXN0b3JlJywgJ2NvZGUvZGlkTG9hZFdvcmtiZW5jaE1haW4nLCAnY29kZS9kaWRTdGFydFdvcmtiZW5jaCcpO1xuXG5cdFx0Ly8gUmVzdG9yZSBwYXJ0cyAob3BlbiBkZWZhdWx0IHZpZXcgY29udGFpbmVycylcblx0XHR0aGlzLnJlc3RvcmVQYXJ0cygpO1xuXG5cdFx0Ly8gUmVzdG9yZSB0aGUgc2Vzc2lvbnMgdGhhdCB3ZXJlIHZpc2libGUgaW4gdGhlIGdyaWQuXG5cdFx0dm9pZCB0aGlzLnNlc3Npb25zU2VydmljZS5yZXN0b3JlVmlzaWJsZVNlc3Npb25zKCkuY2F0Y2goZSA9PiB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tXb3JrYmVuY2hdIHJlc3RvcmVWaXNpYmxlU2Vzc2lvbnMgZmFpbGVkJywgZSk7XG5cdFx0fSk7XG5cblx0XHQvLyBTZXQgbGlmZWN5Y2xlIHBoYXNlIHRvIGBSZXN0b3JlZGBcblx0XHRsaWZlY3ljbGVTZXJ2aWNlLnBoYXNlID0gTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQ7XG5cblx0XHQvLyBNYXJrIGFzIHJlc3RvcmVkXG5cdFx0dGhpcy5zZXRSZXN0b3JlZCgpO1xuXG5cdFx0Ly8gU2V0IGxpZmVjeWNsZSBwaGFzZSB0byBgRXZlbnR1YWxseWAgYWZ0ZXIgYSBzaG9ydCBkZWxheSBhbmQgd2hlbiBpZGxlIChtaW4gMi41c2VjLCBtYXggNXNlYylcblx0XHRjb25zdCBldmVudHVhbGx5UGhhc2VTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihydW5XaGVuV2luZG93SWRsZShtYWluV2luZG93LCAoKSA9PiBsaWZlY3ljbGVTZXJ2aWNlLnBoYXNlID0gTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSwgMjUwMCkpO1xuXHRcdH0sIDI1MDApKTtcblx0XHRldmVudHVhbGx5UGhhc2VTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzdG9yZVBhcnRzKCk6IHZvaWQge1xuXHRcdC8vIE9wZW4gZGVmYXVsdCB2aWV3IGNvbnRhaW5lcnMgZm9yIGVhY2ggdmlzaWJsZSBwYXJ0XG5cdFx0Y29uc3QgcGFydHNUb1Jlc3RvcmU6IHsgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbjsgdmlzaWJsZTogYm9vbGVhbiB9W10gPSBbXG5cdFx0XHR7IGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgdmlzaWJsZTogdGhpcy5wYXJ0VmlzaWJpbGl0eS5zaWRlYmFyIH0sXG5cdFx0XHR7IGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsIHZpc2libGU6IHRoaXMucGFydFZpc2liaWxpdHkucGFuZWwgfSxcblx0XHRcdHsgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIsIHZpc2libGU6IHRoaXMucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyIH0sXG5cdFx0XTtcblxuXHRcdGZvciAoY29uc3QgeyBsb2NhdGlvbiwgdmlzaWJsZSB9IG9mIHBhcnRzVG9SZXN0b3JlKSB7XG5cdFx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0Vmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRWaWV3Q29udGFpbmVyKGxvY2F0aW9uKTtcblx0XHRcdFx0aWYgKGRlZmF1bHRWaWV3Q29udGFpbmVyKSB7XG5cdFx0XHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5vcGVuUGFuZUNvbXBvc2l0ZShkZWZhdWx0Vmlld0NvbnRhaW5lci5pZCwgbG9jYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEluaXRpYWxpemF0aW9uXG5cblx0aW5pdExheW91dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdC8vIFNlcnZpY2VzIC0gYWNjZXNzaW5nIHRoZXNlIHRyaWdnZXJzIHRoZWlyIGluc3RhbnRpYXRpb25cblx0XHQvLyB3aGljaCBjcmVhdGVzIGFuZCByZWdpc3RlcnMgdGhlIHBhcnRzXG5cdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdHRoaXMuZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0dGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblx0XHR0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKTtcblx0XHR0aGlzLnNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHQvLyBGb3JjZXMgZWFnZXIgY3JlYXRpb24gb2YgdGhlIHNlc3Npb25zIHBhcnQgc28gaXQgcmVnaXN0ZXJzIGl0c2VsZiB3aXRoIHRoZVxuXHRcdC8vIGxheW91dCBzZXJ2aWNlIGJlZm9yZSByZW5kZXJXb3JrYmVuY2goKSBsb29rcyBpdCB1cCB2aWEgZ2V0UGFydCgpLlxuXHRcdHRoaXMuc2Vzc2lvbnNQYXJ0U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQYXJ0U2VydmljZSk7XG5cdFx0dGhpcy5jdXN0b21WaWV3U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ3VzdG9tVmlld1NlcnZpY2UpO1xuXHRcdC8vIFNhbWUgZm9yIHRoZSBjdXN0b20gdmlldyBncmlkIHBhcnQuXG5cdFx0dGhpcy5jdXN0b21WaWV3R3JpZFBhcnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDdXN0b21WaWV3R3JpZFBhcnRTZXJ2aWNlKTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdGFjY2Vzc29yLmdldChJVGl0bGVTZXJ2aWNlKTtcblxuXHRcdC8vIFJlc29sdmUgdGhlIHNpbmdsZS1wYW5lIGxheW91dCBtb2RlIG9uY2UgKHJlbG9hZCB0byB0b2dnbGUpLlxuXHRcdHRoaXMubGF5b3V0UG9saWN5LnNldFNpbmdsZVBhbmUodGhpcy5pc1NpbmdsZVBhbmVMYXlvdXRFbmFibGVkKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGxheW91dCBsaXN0ZW5lcnNcblx0XHR0aGlzLnJlZ2lzdGVyTGF5b3V0TGlzdGVuZXJzKCk7XG5cblx0XHQvLyBBIGN1c3RvbSB2aWV3IHJlcGxhY2VzIHRoZSBzZXNzaW9ucyBncmlkIChhbmQgdGhlIGVkaXRvciwgc2lkZSBwYW5lbCBhbmRcblx0XHQvLyBib3R0b20gcGFuZWwpIGZvciBhcyBsb25nIGFzIGl0IGlzIHNob3duLlxuXHRcdHRoaXMuX2N1c3RvbVZpZXdWaXNpYmxlS2V5ID0gQ3VzdG9tVmlld1Zpc2libGVDb250ZXh0LmJpbmRUbyhhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fYXBwbHlDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkodGhpcy5jdXN0b21WaWV3U2VydmljZS5hY3RpdmVDdXN0b21WaWV3LnJlYWQocmVhZGVyKSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRWRpdG9yIG9wZW5zIHNob3VsZCBvbmx5IGFmZmVjdCB0aGUgbWFpbiBlZGl0b3IgcGFydCB3aGVuXG5cdFx0Ly8gdGhleSBhY3R1YWxseSB0YXJnZXQgb25lIG9mIHRoZSBtYWluIGVkaXRvciBncm91cHMuIE1vZGFsXG5cdFx0Ly8gb3BlbnMgc3RheSBuZXV0cmFsLiBQcm9ncmFtbWF0aWMgb3BlbnMgdGhhdCBzdXBwcmVzcyBhdXRvXG5cdFx0Ly8gdmlzaWJpbGl0eSAoZS5nLiB3b3JraW5nIHNldCBhcHBsaWNhdGlvbikgYXJlIGlnbm9yZWQuXG5cdFx0Ly8gVGhlIGJhc2UgaGFuZGxlciByZXZlYWxzIGEgaGlkZGVuIGVkaXRvciBmb3IgYW55IHN1Y2ggb3Blbjtcblx0XHQvLyBgU2luZ2xlUGFuZVdvcmtiZW5jaGAgb3ZlcnJpZGVzIGByZXZlYWxFZGl0b3JPbk9wZW5gIHRvIGtlZXAgYVxuXHRcdC8vIGRvY2tlZC1kZXRhaWwgZWRpdG9yIChDaGFuZ2VzL0ZpbGVzKSBmcm9tIHJldmVhbGluZyB0aGUgZWRpdG9yIGFyZWFcblx0XHQvLyB3aGlsZSB0aGUgZGV0YWlsIHBhbmVsIGlzIGFscmVhZHkgc2hvd2luZyBpdHMgY29udGVudC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclNlcnZpY2Uub25XaWxsT3BlbkVkaXRvcihlID0+IHRoaXMucmV2ZWFsRWRpdG9yT25PcGVuKGUpKSk7XG5cblx0XHQvLyBIaWRlIGVkaXRvciBwYXJ0IHdoZW4gbGFzdCBlZGl0b3IgY2xvc2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQ2xvc2VFZGl0b3IoKCkgPT4gdGhpcy5oYW5kbGVEaWRDbG9zZUVkaXRvcigpKSk7XG5cblx0XHQvLyBJbml0aWFsaXplIGxheW91dCBzdGF0ZSAobXVzdCBiZSBkb25lIGJlZm9yZSBjcmVhdGVXb3JrYmVuY2hMYXlvdXQpXG5cdFx0dGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbiA9IGdldENsaWVudEFyZWEodGhpcy5wYXJlbnQsIG5ldyBEaW1lbnNpb24oODAwLCA2MDApKTtcblx0XHR0aGlzLmxheW91dFBvbGljeS51cGRhdGUodGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCwgdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQpO1xuXG5cdFx0Ly8gVXBkYXRlIHBhcnQgdmlzaWJpbGl0eSBiYXNlZCBvbiBmaW5hbCB2aWV3cG9ydCBjbGFzc2lmaWNhdGlvblxuXHRcdGNvbnN0IHZpc0RlZmF1bHRzID0gdGhpcy5sYXlvdXRQb2xpY3kuZ2V0UGFydFZpc2liaWxpdHlEZWZhdWx0cygpO1xuXHRcdHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhciA9IHZpc0RlZmF1bHRzLnNpZGViYXI7XG5cdFx0dGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIgPSB2aXNEZWZhdWx0cy5hdXhpbGlhcnlCYXI7XG5cdFx0dGhpcy5wYXJ0VmlzaWJpbGl0eS5wYW5lbCA9IHZpc0RlZmF1bHRzLnBhbmVsO1xuXHRcdHRoaXMucGFydFZpc2liaWxpdHkuc2Vzc2lvbnMgPSB2aXNEZWZhdWx0cy5zZXNzaW9ucztcblx0XHR0aGlzLnBhcnRWaXNpYmlsaXR5LmVkaXRvciA9IHZpc0RlZmF1bHRzLmVkaXRvcjtcblxuXHRcdC8vIE92ZXJsYXkgdGhlIHBlcnNpc3RlZCB2aXNpYmlsaXR5IG5vdyBzbyB0aGF0IHRoZSBjb250ZXh0IGtleXMgaGFuZGxlclxuXHRcdC8vIChjcmVhdGVkIHJpZ2h0IGFmdGVyIGluaXRMYXlvdXQpIGluaXRpYWxpemVzIHBhcnQtdmlzaWJpbGl0eSBjb250ZXh0XG5cdFx0Ly8ga2V5cyAoZS5nLiBhdXhpbGlhcnlCYXJWaXNpYmxlKSBmcm9tIHRoZSByZXN0b3JlZCBzdGF0ZSByYXRoZXIgdGhhbiB0aGVcblx0XHQvLyBkZWZhdWx0cy4gV2l0aG91dCB0aGlzLCB0aGUgZWRpdG9yLXRpdGxlIHRvZ2dsZSBpY29uIGlzIHdyb25nIG9uIHJlbG9hZC5cblx0XHR0aGlzLl9hcHBseVBlcnNpc3RlZFBhcnRWaXNpYmlsaXR5KCk7XG5cdH1cblxuXHRwcml2YXRlIGFyZUFsbEdyb3Vwc0luTWFpblBhcnRFbXB0eSgpOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0Lmdyb3Vwcykge1xuXHRcdFx0aWYgKCFncm91cC5pc0VtcHR5KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmV2ZWFsRWRpdG9yT25PcGVuKGU6IElFZGl0b3JXaWxsT3BlbkV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uQ291bnQgPiAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5ncm91cHMuZmluZChnID0+IGcuaWQgPT09IGUuZ3JvdXBJZCk7XG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IpIHtcblx0XHRcdHRoaXMuc2V0RWRpdG9ySGlkZGVuKGZhbHNlLCAvKiBleHBsaWNpdCAqLyB0cnVlKTtcblx0XHRcdHRoaXMucmVzdG9yZUF0dGFjaGVkRWRpdG9yTWF4aW1pemVkU3RhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZURpZENsb3NlRWRpdG9yKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50ID4gMCB8fCAhdGhpcy5hcmVBbGxHcm91cHNJbk1haW5QYXJ0RW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2hhbmRsZUFsbEVkaXRvcnNDbG9zZWQoKTtcblx0fVxuXG5cdHN1cHByZXNzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5KCk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50Kys7XG5cdFx0bGV0IGRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAoZGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25Db3VudC0tO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbWVtYmVyQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRPblNob3cgPSB0aGlzLl9lZGl0b3JNYXhpbWl6ZWQgJiYgdGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXI7XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmVBdHRhY2hlZEVkaXRvck1heGltaXplZFN0YXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNob3VsZFJlc3RvcmUgPSB0aGlzLl9yZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRPblNob3cgJiYgdGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXI7XG5cdFx0dGhpcy5fcmVzdG9yZUF0dGFjaGVkRWRpdG9yTWF4aW1pemVkT25TaG93ID0gZmFsc2U7XG5cblx0XHRpZiAoc2hvdWxkUmVzdG9yZSkge1xuXHRcdFx0dGhpcy5zZXRFZGl0b3JNYXhpbWl6ZWQodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jcmVnaW9uIFNpZGUtcGFuZSBsYXlvdXQgaG9va3MgKGNsYXNzaWMgZ3JpZCBkZWZhdWx0czsgb3ZlcnJpZGRlbiBieSBTaW5nbGVQYW5lV29ya2JlbmNoKVxuXG5cdHByb3RlY3RlZCBfZmlyZURpZENoYW5nZVBhcnRWaXNpYmlsaXR5KHBhcnRJZDogUGFydHMsIHZpc2libGU6IGJvb2xlYW4sIHNvdXJjZT86ICdyZXNpemUnKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkLCB2aXNpYmxlLCBzb3VyY2UgfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX25vdGlmeUNvbnRhaW5lckRpZExheW91dCgpOiB2b2lkIHtcblx0XHR0aGlzLmhhbmRsZUNvbnRhaW5lckRpZExheW91dCh0aGlzLm1haW5Db250YWluZXIsIHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zZXRNYWluRWRpdG9yQXJlYUhpZGRlbihoaWRkZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShMYXlvdXRDbGFzc2VzLk1BSU5fRURJVE9SX0FSRUFfSElEREVOLCBoaWRkZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgYSBjaGFuZ2UgaW4gdGhlIGVkaXRvci1wYXJ0IGdyaWQgdmlldydzIHZpc2liaWxpdHkuIEluIHRoZSBjbGFzc2ljXG5cdCAqIGxheW91dCB0aGUgZWRpdG9yIHBhcnQgaXMgYSBzdGFuZGFsb25lIGdyaWQgdmlldywgc28gaXRzIHZpZXcgdmlzaWJpbGl0eSAqaXMqXG5cdCAqIHRoZSBlZGl0b3IgdmlzaWJpbGl0eSBcdTIwMTQgbWFwIGl0IHRvIGBzZXRFZGl0b3JIaWRkZW5gIGFuZCByYWlzZSB0aGUgcGFydCBldmVudC5cblx0ICogU2luZ2xlLXBhbmUgb3ZlcnJpZGVzIHRoaXM6IGl0cyBlZGl0b3ItcGFydCBncmlkIHZpZXcgYWxzbyBob3N0cyB0aGUgZG9ja2VkXG5cdCAqIGF1eGlsaWFyeSBiYXIsIHNvIHRoZSB2aWV3IGNhbiBiZWNvbWUgdmlzaWJsZSBwdXJlbHkgdG8gc2hvdyB0aGUgZGV0YWlsIHdoaWxlXG5cdCAqIHRoZSBlZGl0b3IgY29udGVudCBzdGF5cyBoaWRkZW47IGl0IGZpcmVzIGl0cyBvd24gZWRpdG9yLXBhcnQgZXZlbnRzIGluc3RlYWQuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX29uRWRpdG9yUGFydEdyaWRWaXNpYmlsaXR5Q2hhbmdlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnNldEVkaXRvckhpZGRlbighdmlzaWJsZSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZSB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgX2lzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3NlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25Db3VudCA+IDA7XG5cdH1cblxuXHQvKiogVG9nZ2xlcyB0aGUgY29udGFpbmVyIG1hcmtlciBjbGFzcyBmb3IgdGhlIHNpZGUtcGFuZSBsYXlvdXQuICovXG5cdHByb3RlY3RlZCBfYXBwbHlMYXlvdXRDb250YWluZXJDbGFzcygpOiB2b2lkIHtcblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZG9jay1kZXRhaWwtcGFuZWwnLCBmYWxzZSk7XG5cdH1cblxuXHQvKiogV2lkdGggdGhlIGF1eGlsaWFyeSBiYXIgb2NjdXBpZXMgd2hlbiB2aXNpYmxlIChmb3IgbWF4LWVkaXRvci1kaW1lbnNpb24gbWF0aCkuICovXG5cdHByb3RlY3RlZCBfYXV4aWxpYXJ5QmFyTGF5b3V0V2lkdGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy53b3JrYmVuY2hHcmlkID8gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpLndpZHRoIDogMDtcblx0fVxuXG5cdHByb3RlY3RlZCBfYXV4aWxpYXJ5QmFyVmlld1NpemUoKTogSVZpZXdTaXplIHtcblx0XHRpZiAoIXRoaXMud29ya2JlbmNoR3JpZCB8fCAhdGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldykge1xuXHRcdFx0cmV0dXJuIHsgd2lkdGg6IDAsIGhlaWdodDogMCB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zZXRBdXhpbGlhcnlCYXJWaWV3U2l6ZShzaXplOiBJVmlld1NpemUpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldykge1xuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldywgc2l6ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9yZXNpemVBdXhpbGlhcnlCYXJCeShkZWx0YVdpZHRoOiBudW1iZXIsIGRlbHRhSGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudFNpemUgPSB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldyk7XG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldywge1xuXHRcdFx0d2lkdGg6IGN1cnJlbnRTaXplLndpZHRoICsgZGVsdGFXaWR0aCxcblx0XHRcdGhlaWdodDogY3VycmVudFNpemUuaGVpZ2h0ICsgZGVsdGFIZWlnaHRcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfcmVzdG9yZUF1eGlsaWFyeUJhcldpZHRoKF93aWR0aDogbnVtYmVyKTogdm9pZCB7IH1cblxuXHQvKipcblx0ICogUmVhZHMgYSBwYXJ0J3Mgc2l6ZSBmcm9tIHRoZSB3b3JrYmVuY2ggZ3JpZCBmb3IgcGVyc2lzdGVuY2UuIEZvciB2aXNpYmxlXG5cdCAqIHBhcnRzLCB0aGUgY3VycmVudCB2aWV3IHNpemU7IGZvciBoaWRkZW4gcGFydHMsIHRoZSBncmlkJ3MgY2FjaGVkIHZpc2libGVcblx0ICogc2l6ZSAodGhlIHNpemUgaXQgaGFkIHRoZSBsYXN0IHRpbWUgaXQgd2FzIHNob3duKSBzbyB0b2dnbGluZyB2aXNpYmlsaXR5XG5cdCAqIGxhdGVyIHJlc3RvcmVzIHRoZSBzYW1lIGRpbWVuc2lvbnMuIE92ZXJyaWRkZW4gYnkgdGhlIHNpbmdsZS1wYW5lIGxheW91dCBmb3Jcblx0ICogaXRzIGRvY2tlZCBhdXhpbGlhcnkgYmFyLCB3aGljaCBpcyBub3QgYSBncmlkIHZpZXcuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX3BlcnNpc3RlZEdyaWRWaWV3U2l6ZSh2aWV3OiBJU2VyaWFsaXphYmxlVmlldywgZGltZW5zaW9uOiAnd2lkdGgnIHwgJ2hlaWdodCcsIHZpc2libGU6IGJvb2xlYW4pOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHZpZXcpW2RpbWVuc2lvbl07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld0NhY2hlZFZpc2libGVTaXplKHZpZXcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9wZXJzaXN0ZWRFZGl0b3JXaWR0aChlZGl0b3JHcmlkV2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGVkaXRvckdyaWRXaWR0aDtcblx0fVxuXG5cdHByb3RlY3RlZCBfZGVmYXVsdFNpZGVCYXJTaXplKHBvbGljeVNpZGVCYXJTaXplOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBwb2xpY3lTaWRlQmFyU2l6ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZWRpdG9yTm9kZVNpemUoZWZmZWN0aXZlRWRpdG9yV2lkdGg6IG51bWJlciwgX2VmZmVjdGl2ZUF1eEJhcldpZHRoOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBlZmZlY3RpdmVFZGl0b3JXaWR0aDtcblx0fVxuXG5cdHByb3RlY3RlZCBfZWRpdG9yTm9kZVZpc2libGUoZWRpdG9yVmlzaWJsZTogYm9vbGVhbiwgX2F1eEJhclZpc2libGU6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZWRpdG9yVmlzaWJsZTtcblx0fVxuXG5cdHByb3RlY3RlZCBfdG9wUmlnaHRTZWN0aW9uQ2hpbGRyZW4oc2Vzc2lvbnNOb2RlOiBJU2VyaWFsaXplZE5vZGUsIGVkaXRvck5vZGU6IElTZXJpYWxpemVkTm9kZSwgYXV4aWxpYXJ5QmFyTm9kZTogSVNlcmlhbGl6ZWROb2RlLCBjdXN0b21WaWV3R3JpZE5vZGU6IElTZXJpYWxpemVkTm9kZSk6IElTZXJpYWxpemVkTm9kZVtdIHtcblx0XHRyZXR1cm4gW3Nlc3Npb25zTm9kZSwgZWRpdG9yTm9kZSwgYXV4aWxpYXJ5QmFyTm9kZSwgY3VzdG9tVmlld0dyaWROb2RlXTtcblx0fVxuXG5cdC8qKiBBdHRhY2ggYW55IHBlci1sYXlvdXQgY29udHJvbGxlcnMgb25jZSB0aGUgZWRpdG9yIHBhcnQgY29udGFpbmVyIGV4aXN0cy4gKi9cblx0cHJvdGVjdGVkIF9hdHRhY2hTaWRlUGFuZSgpOiB2b2lkIHsgfVxuXHQvKiogTGF5IG91dCBhbnkgZG9ja2VkIG92ZXJsYXkuICovXG5cdHByb3RlY3RlZCBfbGF5b3V0U2lkZVBhbmUoKTogdm9pZCB7IH1cblx0LyoqIFJlYWN0IHRvIGEgd2hvbGUtZ3JpZCBjaGFuZ2UgKGUuZy4gYSBzYXNoIGRyYWcpIGFmdGVyIHRoZSBncmlkIHJlYnVpbGRzLiAqL1xuXHRwcm90ZWN0ZWQgX29uR3JpZERpZENoYW5nZSgpOiB2b2lkIHsgfVxuXHQvKiogUmVhY3QgdG8gdGhlIGVkaXRvciBncmlkIG5vZGUgYmVpbmcgcmVzaXplZCB0byBgbm9kZVdpZHRoYC4gKi9cblx0cHJvdGVjdGVkIF9vbkVkaXRvck5vZGVSZXNpemVkKF9ub2RlV2lkdGg6IG51bWJlcik6IHZvaWQgeyB9XG5cblx0LyoqIFJ1biBlZGl0b3Itbm9kZSB3b3JrIHdpdGggdGhlIHJldmVhbC1zeW5jIHN1c3BlbmRlZCAobm8tb3AgZm9yIHRoZSBncmlkIGxheW91dCkuICovXG5cdHByb3RlY3RlZCBfcnVuV2l0aEVkaXRvclJlc2l6ZVN5bmNTdXNwZW5kZWQoZm46ICgpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRmbigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9hcHBseUVkaXRvclZpc2liaWxpdHkoaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2hvdWxkQXBwbHlFdmVuU3BsaXQgPSAhaGlkZGVuICYmICF0aGlzLl9oYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0O1xuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUgbWFpbi1hcmVhIHdpZHRoICh0aGUgc2Vzc2lvbnMgcGFydCBvY2N1cGllcyBpdCBmdWxseSB3aGlsZSB0aGVcblx0XHQvLyBlZGl0b3IgaXMgaGlkZGVuKSBiZWZvcmUgcmV2ZWFsaW5nLCBzbyB0aGUgZXZlbiBzcGxpdCBjYW4gaGFsdmUgaXQuXG5cdFx0Y29uc3QgbWFpbkFyZWFXaWR0aCA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLnNlc3Npb25zUGFydFZpZXcpLndpZHRoO1xuXG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKHRoaXMuZWRpdG9yUGFydFZpZXcsIHRoaXMuX2VkaXRvck5vZGVTaG91bGRCZVZpc2libGUoKSk7XG5cblx0XHRpZiAoc2hvdWxkQXBwbHlFdmVuU3BsaXQpIHtcblx0XHRcdHRoaXMuX2hhc0FwcGxpZWRJbml0aWFsRWRpdG9yU3BsaXQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fYXBwbHlFZGl0b3JTcGxpdFNpemUobWFpbkFyZWFXaWR0aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9vbldpbGxIaWRlQXV4aWxpYXJ5QmFyKF9oaWRkZW46IGJvb2xlYW4pOiB2b2lkIHsgfVxuXG5cdHByb3RlY3RlZCBfYXBwbHlBdXhpbGlhcnlCYXJWaXNpYmlsaXR5KGhpZGRlbjogYm9vbGVhbiwgX3NvdXJjZT86ICdyZXNpemUnKTogdm9pZCB7XG5cdFx0Ly8gU2tpcHBlZCBiZWZvcmUgdGhlIGdyaWQgZXhpc3RzOiBkdXJpbmcgc3RhcnR1cCB0aGUgbGF5b3V0IGNvbnRyb2xsZXIgKGFcblx0XHQvLyBCbG9ja1Jlc3RvcmUgY29udHJpYnV0aW9uKSBydW5zIGJlZm9yZSBjcmVhdGVXb3JrYmVuY2hMYXlvdXQoKSwgc28gdGhlXG5cdFx0Ly8gdmlzaWJpbGl0eSBpcyByZWNvcmRlZCBpbiBwYXJ0VmlzaWJpbGl0eSBhbmQgYXBwbGllZCB3aGVuIHRoZSBncmlkIGlzIGJ1aWx0LlxuXHRcdGlmICh0aGlzLndvcmtiZW5jaEdyaWQpIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3LCB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9zaG91bGRPcGVuQXV4aWxpYXJ5UGFuZUNvbXBvc2l0ZShfY29udGFpbmVySWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9oYW5kbGVBbGxFZGl0b3JzQ2xvc2VkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnBhcnRWaXNpYmlsaXR5LmVkaXRvcikge1xuXHRcdFx0dGhpcy5yZW1lbWJlckF0dGFjaGVkRWRpdG9yTWF4aW1pemVkU3RhdGUoKTtcblx0XHRcdHRoaXMuc2V0RWRpdG9ySGlkZGVuKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfcHJlcGFyZVNpZGVCYXJSZXNpemUoX2hpZGRlbjogYm9vbGVhbik6IElTaWRlQmFyUmVzaXplQ29udGV4dCB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0cHJvdGVjdGVkIF9hcHBseVNpZGVCYXJSZXNpemUoX2hpZGRlbjogYm9vbGVhbiwgX2NvbnRleHQ6IElTaWRlQmFyUmVzaXplQ29udGV4dCk6IHZvaWQgeyB9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSByZWdpc3RlckxheW91dExpc3RlbmVycygpOiB2b2lkIHtcblx0XHQvLyBGdWxsc2NyZWVuIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZENoYW5nZUZ1bGxzY3JlZW4od2luZG93SWQgPT4ge1xuXHRcdFx0aWYgKHdpbmRvd0lkID09PSBnZXRXaW5kb3dJZChtYWluV2luZG93KSkge1xuXHRcdFx0XHR0aGlzLm1haW5XaW5kb3dGdWxsc2NyZWVuID0gaXNGdWxsc2NyZWVuKG1haW5XaW5kb3cpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUZ1bGxzY3JlZW5DbGFzcygpO1xuXHRcdFx0XHR0aGlzLmxheW91dCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdpbmRvdyByZXNpemUgXHUyMDE0IG5lZWRlZCBmb3IgZGV2aWNlIGVtdWxhdGlvbiBhbmQgbW9iaWxlIHZpZXdwb3J0IGNoYW5nZXNcblx0XHRjb25zdCBvbldpbmRvd1Jlc2l6ZSA9ICgpID0+IHRoaXMubGF5b3V0KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1haW5XaW5kb3csICdyZXNpemUnLCBvbldpbmRvd1Jlc2l6ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGdWxsc2NyZWVuQ2xhc3MoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubWFpbldpbmRvd0Z1bGxzY3JlZW4pIHtcblx0XHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKExheW91dENsYXNzZXMuRlVMTFNDUkVFTik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKExheW91dENsYXNzZXMuRlVMTFNDUkVFTik7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFdvcmtiZW5jaCBMYXlvdXQgQ3JlYXRpb25cblxuXHRjcmVhdGVXb3JrYmVuY2hMYXlvdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fYXBwbHlMYXlvdXRDb250YWluZXJDbGFzcygpO1xuXG5cdFx0Y29uc3QgdGl0bGVCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuVElUTEVCQVJfUEFSVCk7XG5cdFx0Y29uc3QgZWRpdG9yUGFydCA9IHRoaXMuZ2V0UGFydChQYXJ0cy5FRElUT1JfUEFSVCk7XG5cdFx0Y29uc3QgcGFuZWxQYXJ0ID0gdGhpcy5nZXRQYXJ0KFBhcnRzLlBBTkVMX1BBUlQpO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclBhcnQgPSB0aGlzLmdldFBhcnQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdGNvbnN0IHNpZGVCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuU0lERUJBUl9QQVJUKTtcblx0XHRjb25zdCBzZXNzaW9uc1BhcnQgPSB0aGlzLmdldFBhcnQoUGFydHMuU0VTU0lPTlNfUEFSVCk7XG5cdFx0Y29uc3QgY3VzdG9tVmlld0dyaWRQYXJ0ID0gdGhpcy5nZXRQYXJ0KFBhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVCk7XG5cblx0XHQvLyBWaWV3IHJlZmVyZW5jZXMgZm9yIHBhcnRzIGluIHRoZSBncmlkXG5cdFx0dGhpcy50aXRsZUJhclBhcnRWaWV3ID0gdGl0bGVCYXI7XG5cdFx0dGhpcy5zaWRlQmFyUGFydFZpZXcgPSBzaWRlQmFyO1xuXHRcdHRoaXMucGFuZWxQYXJ0VmlldyA9IHBhbmVsUGFydDtcblx0XHR0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3ID0gYXV4aWxpYXJ5QmFyUGFydDtcblx0XHR0aGlzLnNlc3Npb25zUGFydFZpZXcgPSBzZXNzaW9uc1BhcnQ7XG5cdFx0dGhpcy5jdXN0b21WaWV3R3JpZFBhcnRWaWV3ID0gY3VzdG9tVmlld0dyaWRQYXJ0O1xuXHRcdHRoaXMuZWRpdG9yUGFydFZpZXcgPSBlZGl0b3JQYXJ0O1xuXG5cdFx0Y29uc3Qgdmlld01hcDogeyBba2V5OiBzdHJpbmddOiBJU2VyaWFsaXphYmxlVmlldyB9ID0ge1xuXHRcdFx0W1BhcnRzLlRJVExFQkFSX1BBUlRdOiB0aGlzLnRpdGxlQmFyUGFydFZpZXcsXG5cdFx0XHRbUGFydHMuUEFORUxfUEFSVF06IHRoaXMucGFuZWxQYXJ0Vmlldyxcblx0XHRcdFtQYXJ0cy5TSURFQkFSX1BBUlRdOiB0aGlzLnNpZGVCYXJQYXJ0Vmlldyxcblx0XHRcdFtQYXJ0cy5BVVhJTElBUllCQVJfUEFSVF06IHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcsXG5cdFx0XHRbUGFydHMuU0VTU0lPTlNfUEFSVF06IHRoaXMuc2Vzc2lvbnNQYXJ0Vmlldyxcblx0XHRcdFtQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlRdOiB0aGlzLmN1c3RvbVZpZXdHcmlkUGFydFZpZXcsXG5cdFx0XHRbUGFydHMuRURJVE9SX1BBUlRdOiB0aGlzLmVkaXRvclBhcnRWaWV3XG5cdFx0fTtcblxuXHRcdGNvbnN0IGZyb21KU09OID0gKHsgdHlwZSB9OiB7IHR5cGU6IHN0cmluZyB9KSA9PiB2aWV3TWFwW3R5cGVdO1xuXHRcdGNvbnN0IHdvcmtiZW5jaEdyaWQgPSBTZXJpYWxpemFibGVHcmlkLmRlc2VyaWFsaXplKFxuXHRcdFx0dGhpcy5jcmVhdGVHcmlkRGVzY3JpcHRvcigpLFxuXHRcdFx0eyBmcm9tSlNPTiB9LFxuXHRcdFx0eyBwcm9wb3J0aW9uYWxMYXlvdXQ6IGZhbHNlIH1cblx0XHQpO1xuXG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLnByZXBlbmQod29ya2JlbmNoR3JpZC5lbGVtZW50KTtcblx0XHR0aGlzLm1haW5Db250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2FwcGxpY2F0aW9uJyk7XG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkID0gd29ya2JlbmNoR3JpZDtcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQuZWRnZVNuYXBwaW5nID0gdGhpcy5tYWluV2luZG93RnVsbHNjcmVlbjtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtiZW5jaEdyaWQub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25HcmlkRGlkQ2hhbmdlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSWYgdGhlIGVkaXRvciBpcyByZXN0b3JlZCB2aXNpYmxlLCBpdCBhbHJlYWR5IGhhcyBhbiBlc3RhYmxpc2hlZFxuXHRcdC8vIHdpZHRoLCBzbyBhIGxhdGVyIHJldmVhbCBtdXN0IG5vdCBmb3JjZSBhbiBldmVuIHNwbGl0IG92ZXIgaXQuXG5cdFx0dGhpcy5faGFzQXBwbGllZEluaXRpYWxFZGl0b3JTcGxpdCA9IHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBwYXJ0IHZpc2liaWxpdHkgY2hhbmdlcyAoZm9yIHBhcnRzIGluIGdyaWQpXG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIFt0aXRsZUJhciwgcGFuZWxQYXJ0LCBzaWRlQmFyLCBhdXhpbGlhcnlCYXJQYXJ0LCBzZXNzaW9uc1BhcnQsIGVkaXRvclBhcnRdKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihwYXJ0Lm9uRGlkVmlzaWJpbGl0eUNoYW5nZSh2aXNpYmxlID0+IHtcblx0XHRcdFx0Ly8gQSBjdXN0b20gdmlldyByZW5kZXJzIG92ZXIgdGhlc2UgcGFydHMgd2l0aG91dCBjaGFuZ2luZyB3aGF0IHRoZSBsYXlvdXRcblx0XHRcdFx0Ly8gd2FudHMgdGhlbSB0byBiZSwgc28gaXRzIGdyaWQgdXBkYXRlcyBtdXN0IG5vdCBmZWVkIGJhY2sgaW50byB0aGVcblx0XHRcdFx0Ly8gZGVzaXJlZCBzdGF0ZSBcdTIwMTQgb3RoZXJ3aXNlIHRoZXJlIGlzIG5vdGhpbmcgbGVmdCB0byByZXN0b3JlLlxuXHRcdFx0XHRpZiAodGhpcy5fYXBwbHlpbmdDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBUaGUgZWRpdG9yIHBhcnQncyBncmlkLXZpZXcgdmlzaWJpbGl0eSBpcyBmdWxseSBvd25lZCBieVxuXHRcdFx0XHQvLyBgX29uRWRpdG9yUGFydEdyaWRWaXNpYmlsaXR5Q2hhbmdlYDogaW4gdGhlIGNsYXNzaWMgbGF5b3V0IGl0IG1hcHMgdG9cblx0XHRcdFx0Ly8gdGhlIGVkaXRvciB2aXNpYmlsaXR5IGFuZCByYWlzZXMgdGhlIHBhcnQtdmlzaWJpbGl0eSBldmVudDsgc2luZ2xlLXBhbmVcblx0XHRcdFx0Ly8gKHdob3NlIGVkaXRvci1wYXJ0IHZpZXcgYWxzbyBob3N0cyB0aGUgZG9ja2VkIGF1eGlsaWFyeSBiYXIpIG92ZXJyaWRlcyBpdFxuXHRcdFx0XHQvLyBzbyB0aGUgc2hhcmVkIG5vZGUgYmVjb21pbmcgdmlzaWJsZSBmb3IgdGhlIGRldGFpbCBuZWl0aGVyIHJldmVhbHMgdGhlXG5cdFx0XHRcdC8vIGVkaXRvciBjb250ZW50IG5vciBmaXJlcyBhIGJvZ3VzIGVkaXRvci1wYXJ0LXZpc2libGUgZXZlbnQuXG5cdFx0XHRcdGlmIChwYXJ0ID09PSBlZGl0b3JQYXJ0KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25FZGl0b3JQYXJ0R3JpZFZpc2liaWxpdHlDaGFuZ2UodmlzaWJsZSk7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVDb250YWluZXJEaWRMYXlvdXQodGhpcy5tYWluQ29udGFpbmVyLCB0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocGFydCA9PT0gc2lkZUJhcikge1xuXHRcdFx0XHRcdHRoaXMuc2V0U2lkZUJhckhpZGRlbighdmlzaWJsZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocGFydCA9PT0gcGFuZWxQYXJ0KSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbighdmlzaWJsZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocGFydCA9PT0gYXV4aWxpYXJ5QmFyUGFydCkge1xuXHRcdFx0XHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFySGlkZGVuKCF2aXNpYmxlKTtcblx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0ID09PSBzZXNzaW9uc1BhcnQpIHtcblx0XHRcdFx0XHR0aGlzLnNldFNlc3Npb25zSGlkZGVuKCF2aXNpYmxlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogcGFydC5nZXRJZCgpLCB2aXNpYmxlIH0pO1xuXHRcdFx0XHR0aGlzLmhhbmRsZUNvbnRhaW5lckRpZExheW91dCh0aGlzLm1haW5Db250YWluZXIsIHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIFdpcmUgdXAgbW9iaWxlIG5hdiBzdGFjazogYmFjay1idXR0b24gcG9wcyBjbG9zZSB0aGUgY29ycmVzcG9uZGluZyBwYXJ0XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2JpbGVOYXZTdGFjay5vbkRpZFBvcChsYXllciA9PiB7XG5cdFx0XHRzd2l0Y2ggKGxheWVyKSB7XG5cdFx0XHRcdGNhc2UgJ3NpZGViYXInOlxuXHRcdFx0XHRcdHRoaXMuY2xvc2VNb2JpbGVTaWRlYmFyRHJhd2VyKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3BhbmVsJzpcblx0XHRcdFx0XHR0aGlzLnNldFBhbmVsSGlkZGVuKHRydWUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdhdXhiYXInOlxuXHRcdFx0XHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFySGlkZGVuKHRydWUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdjdXN0b21WaWV3Jzpcblx0XHRcdFx0XHR0aGlzLmN1c3RvbVZpZXdTZXJ2aWNlLmhpZGVDdXN0b21WaWV3KCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2VkaXRvcic6XG5cdFx0XHRcdFx0Ly8gRWRpdG9yIG1vZGFsIGNsb3NlIGlzIGhhbmRsZWQgYnkgdGhlIGVkaXRvciBzZXJ2aWNlXG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Y3JlYXRlV29ya2JlbmNoTWFuYWdlbWVudChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogdm9pZCB7XG5cdFx0Ly8gV2VsY29tZSBcdTIwMTQgbXVzdCBiZSBjcmVhdGVkIGVhcmx5IGluIGxheW91dCBzbyB0aGUgd2lkZ2V0IGNhbiBnYXRlXG5cdFx0Ly8gb3RoZXIgVUkgdW50aWwgc2lnbi1pbiAvIGNoYXQgc2V0dXAgaXMgY29tcGxldGUuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NldFVwU2VydmljZSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgdGhlIGdyaWQgZGVzY3JpcHRvciBmb3IgdGhlIEFnZW50IFNlc3Npb25zIGxheW91dC5cblx0ICpcblx0ICogU3RydWN0dXJlIChob3Jpem9udGFsIG9yaWVudGF0aW9uKTpcblx0ICogLSBTaWRlYmFyIChsZWZ0LCBzcGFucyBmdWxsIGhlaWdodCBmcm9tIHRvcCB0byBib3R0b20pXG5cdCAqIC0gUmlnaHQgc2VjdGlvbiAodmVydGljYWwpOlxuXHQgKiAgIC0gVGl0bGViYXIgKHRvcCBvZiByaWdodCBzZWN0aW9uKVxuXHQgKiAgIC0gVG9wIHJpZ2h0IChob3Jpem9udGFsKTogQ2hhdCBCYXIgfCBFZGl0b3IgfCBBdXhpbGlhcnkgQmFyXG5cdCAqICAgLSBQYW5lbCAoYmVsb3cgY2hhdCwgZWRpdG9yLCBhbmQgYXV4aWxpYXJ5IGJhcilcblx0ICovXG5cdHByaXZhdGUgY3JlYXRlR3JpZERlc2NyaXB0b3IoKTogSVNlcmlhbGl6ZWRHcmlkIHtcblx0XHRjb25zdCB7IHdpZHRoLCBoZWlnaHQgfSA9IHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb247XG5cblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVEZXNrdG9wR3JpZERlc2NyaXB0b3Iod2lkdGgsIGhlaWdodCk7XG5cdH1cblxuXHQvKipcblx0ICogU3RhbmRhcmQgbXVsdGktcGFydCBsYXlvdXQgZm9yIGFsbCB2aWV3cG9ydCBjbGFzc2VzLlxuXHQgKiBPbiBwaG9uZSwgdGhlIHRpdGxlYmFyIGlzIGhpZGRlbiB2aWEgQ1NTIGFuZCBhIE1vYmlsZVRpdGxlYmFyUGFydFxuXHQgKiBpcyBwcmVwZW5kZWQgYmVmb3JlIHRoZSBncmlkLiBTaWRlYmFyL3BhbmVsL2F1eGJhciBhcmUgaGlkZGVuXG5cdCAqIGluIHRoZSBncmlkIHZpYSBwYXJ0VmlzaWJpbGl0eSBkZWZhdWx0cy5cblx0ICovXG5cdHByaXZhdGUgY3JlYXRlRGVza3RvcEdyaWREZXNjcmlwdG9yKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogSVNlcmlhbGl6ZWRHcmlkIHtcblxuXHRcdC8vIERlZmF1bHQgc2l6ZXMgZnJvbSBsYXlvdXQgcG9saWN5XG5cdFx0Y29uc3Qgc2l6ZXMgPSB0aGlzLmxheW91dFBvbGljeS5nZXRQYXJ0U2l6ZXMod2lkdGgsIGhlaWdodCk7XG5cdFx0Ly8gRm9yIGhpZGRlbiBwYXJ0cywgc3RpbGwgcHJvdmlkZSBhIHJlYXNvbmFibGUgY2FjaGVkIHNpemUgZm9yIHdoZW4gdGhleSdyZSBzaG93biBsYXRlci5cblx0XHQvLyBTYXZlZCBzaXplcyBmcm9tIGEgcHJldmlvdXMgc2Vzc2lvbiB0YWtlIHByZWNlZGVuY2Ugb3ZlciBwb2xpY3kgZGVmYXVsdHMuXG5cdFx0Y29uc3QgZGVmYXVsdFNpZGVCYXJTaXplID0gdGhpcy5fZGVmYXVsdFNpZGVCYXJTaXplKHNpemVzLnNpZGVCYXJTaXplKTtcblx0XHRjb25zdCBzaWRlQmFyU2l6ZSA9IHRoaXMuX3NhdmVkUGFydFNpemVzLnNpZGViYXJcblx0XHRcdD8/ICh0aGlzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIgPyBkZWZhdWx0U2lkZUJhclNpemUgOiBNYXRoLm1heChkZWZhdWx0U2lkZUJhclNpemUsIDI1MCkpO1xuXHRcdGNvbnN0IGRlZmF1bHRBdXhpbGlhcnlCYXJTaXplID0gdGhpcy5pc1NpbmdsZVBhbmVMYXlvdXRFbmFibGVkXG5cdFx0XHQ/IHRoaXMuZ2V0RG9ja2VkQXV4aWxpYXJ5QmFyV2lkdGgoKVxuXHRcdFx0OiBzaXplcy5hdXhpbGlhcnlCYXJTaXplO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclNpemUgPSB0aGlzLl9zYXZlZFBhcnRTaXplcy5hdXhpbGlhcnlCYXJcblx0XHRcdD8/ICh0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciA/IGRlZmF1bHRBdXhpbGlhcnlCYXJTaXplIDogTWF0aC5tYXgoZGVmYXVsdEF1eGlsaWFyeUJhclNpemUsIDMwMCkpO1xuXHRcdGNvbnN0IHBhbmVsU2l6ZSA9IHRoaXMuX3NhdmVkUGFydFNpemVzLnBhbmVsXG5cdFx0XHQ/PyAodGhpcy5wYXJ0VmlzaWJpbGl0eS5wYW5lbCA/IHNpemVzLnBhbmVsU2l6ZSA6IE1hdGgubWF4KHNpemVzLnBhbmVsU2l6ZSwgMjUwKSk7XG5cdFx0Ly8gRmFsbCBiYWNrIHRvIGEgY29tZm9ydGFibGUgZGVmYXVsdCB3aGVuIHRoZXJlIGlzIG5vIHNhdmVkIGVkaXRvciB3aWR0aCBcdTIwMTQgb3Jcblx0XHQvLyB3aGVuIGEgc3RhbGUvY29ycnVwdCBzdWItbWluaW11bSB2YWx1ZSAoZS5nLiBhIGAwYCBwZXJzaXN0ZWQgd2hpbGUgdGhlIGVkaXRvclxuXHRcdC8vIG5vZGUgd2FzIHRyYW5zaWVudGx5IHNxdWVlemVkIHRvIG5vdGhpbmcgYnkgdGhlIGhpZ2gtcHJpb3JpdHkgc2Vzc2lvbnMgcGFydClcblx0XHQvLyB3YXMgc3RvcmVkLiBBIHBsYWluIGA/PyA2MDBgIHdvdWxkIGxldCBgMGAgdGhyb3VnaCBhbmQgYnVpbGQgdGhlIGVkaXRvciBub2RlIGF0XG5cdFx0Ly8gYDBgLCB3aGljaCB0aGUgZ3JpZCB0aGVuIGNsYW1wcyB0byBpdHMgMzAwcHggbWluaW11bSBvbiBldmVyeSByZWxvYWQuXG5cdFx0Y29uc3Qgc2F2ZWRFZGl0b3JXaWR0aCA9IHRoaXMuX3NhdmVkUGFydFNpemVzLmVkaXRvcjtcblx0XHRjb25zdCBlZGl0b3JTaXplID0gc2F2ZWRFZGl0b3JXaWR0aCAhPT0gdW5kZWZpbmVkICYmIHNhdmVkRWRpdG9yV2lkdGggPj0gRURJVE9SX1BBUlRfTUlOSU1VTV9XSURUSCA/IHNhdmVkRWRpdG9yV2lkdGggOiBFRElUT1JfUEFSVF9ERUZBVUxUX1dJRFRIO1xuXHRcdGNvbnN0IHRpdGxlQmFySGVpZ2h0ID0gdGhpcy50aXRsZUJhclBhcnRWaWV3Py5taW5pbXVtSGVpZ2h0ID8/IDMwO1xuXG5cdFx0Ly8gQ2FsY3VsYXRlIHJpZ2h0IHNlY3Rpb24gd2lkdGggXHUyMDE0IHdoZW4gc2lkZWJhciBpcyBoaWRkZW4gaXQgdGFrZXMgbm8gc3BhY2Vcblx0XHRjb25zdCBlZmZlY3RpdmVTaWRlQmFyV2lkdGggPSB0aGlzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIgPyBzaWRlQmFyU2l6ZSA6IDA7XG5cdFx0Y29uc3QgcmlnaHRTZWN0aW9uV2lkdGggPSBNYXRoLm1heCgwLCB3aWR0aCAtIGVmZmVjdGl2ZVNpZGVCYXJXaWR0aCk7XG5cdFx0Y29uc3QgZWZmZWN0aXZlQXV4QmFyV2lkdGggPSB0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciA/IGF1eGlsaWFyeUJhclNpemUgOiAwO1xuXHRcdGNvbnN0IGVmZmVjdGl2ZUVkaXRvcldpZHRoID0gdGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IgPyBlZGl0b3JTaXplIDogMDtcblx0XHQvLyBQcmVmZXIgdGhlIHNhdmVkIGNoYXQgYmFyIHdpZHRoIHNvIHRoZSB1c2VyJ3MgcHJlZmVycmVkIGNoYXQgYmFyIHNpemVcblx0XHQvLyBpcyBwcmVzZXJ2ZWQgYWNyb3NzIHJlbG9hZHMuIEZhbGwgYmFjayB0byB0aGUgcmVtYWluZGVyIG9mIHRoZSByaWdodFxuXHRcdC8vIHNlY3Rpb24sIHdoaWNoIHRoZSBncmlkIGRpc3RyaWJ1dGVzIHByb3BvcnRpb25hbGx5IHdoZW4gdGhlIHNhdmVkXG5cdFx0Ly8gc2l6ZXMgZG9uJ3QgZml0IHRoZSBjdXJyZW50IGNvbnRhaW5lci5cblx0XHRjb25zdCBzZXNzaW9uc1dpZHRoID0gdGhpcy5fc2F2ZWRQYXJ0U2l6ZXMuc2Vzc2lvbnNcblx0XHRcdD8/IE1hdGgubWF4KDAsIHJpZ2h0U2VjdGlvbldpZHRoIC0gZWZmZWN0aXZlQXV4QmFyV2lkdGggLSBlZmZlY3RpdmVFZGl0b3JXaWR0aCk7XG5cblx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gTWF0aC5tYXgoMCwgaGVpZ2h0IC0gdGl0bGVCYXJIZWlnaHQpO1xuXHRcdGNvbnN0IHRvcFJpZ2h0SGVpZ2h0ID0gTWF0aC5tYXgoMCwgY29udGVudEhlaWdodCAtIHBhbmVsU2l6ZSk7XG5cblx0XHRjb25zdCBpc1Bob25lID0gdGhpcy5sYXlvdXRQb2xpY3kudmlld3BvcnRDbGFzcy5nZXQoKSA9PT0gJ3Bob25lJztcblxuXHRcdGNvbnN0IHRpdGxlQmFyTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuVElUTEVCQVJfUEFSVCB9LFxuXHRcdFx0c2l6ZTogdGl0bGVCYXJIZWlnaHQsXG5cdFx0XHR2aXNpYmxlOiAhaXNQaG9uZVxuXHRcdH07XG5cblx0XHRjb25zdCBzaWRlQmFyTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuU0lERUJBUl9QQVJUIH0sXG5cdFx0XHRzaXplOiBzaWRlQmFyU2l6ZSxcblx0XHRcdHZpc2libGU6IHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhclxuXHRcdH07XG5cblx0XHRjb25zdCBzZXNzaW9uc05vZGU6IElTZXJpYWxpemVkTGVhZk5vZGUgPSB7XG5cdFx0XHR0eXBlOiAnbGVhZicsXG5cdFx0XHRkYXRhOiB7IHR5cGU6IFBhcnRzLlNFU1NJT05TX1BBUlQgfSxcblx0XHRcdHNpemU6IHNlc3Npb25zV2lkdGgsXG5cdFx0XHR2aXNpYmxlOiB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLlNFU1NJT05TX1BBUlQpXG5cdFx0fTtcblxuXHRcdC8vIE11dHVhbGx5IGV4Y2x1c2l2ZSB3aXRoIHRoZSBzZXNzaW9ucyBwYXJ0IChhbmQgdGhlIGVkaXRvciAvIGF1eGlsaWFyeSBiYXIgL1xuXHRcdC8vIHBhbmVsKSwgc28gaXQgYWx3YXlzIGNsYWltcyB0aGUgZnVsbCByb3cgd2hlbiBpdCBpcyB2aXNpYmxlLlxuXHRcdGNvbnN0IGN1c3RvbVZpZXdHcmlkTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJUIH0sXG5cdFx0XHRzaXplOiByaWdodFNlY3Rpb25XaWR0aCxcblx0XHRcdHZpc2libGU6IHRoaXMucGFydFZpc2liaWxpdHkuY3VzdG9tVmlld0dyaWRcblx0XHR9O1xuXG5cdFx0Y29uc3QgZWRpdG9yTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuRURJVE9SX1BBUlQgfSxcblx0XHRcdHNpemU6IHRoaXMuX2VkaXRvck5vZGVTaXplKGVmZmVjdGl2ZUVkaXRvcldpZHRoLCBlZmZlY3RpdmVBdXhCYXJXaWR0aCksXG5cdFx0XHR2aXNpYmxlOiB0aGlzLl9lZGl0b3JOb2RlU2hvdWxkQmVWaXNpYmxlKClcblx0XHR9O1xuXG5cdFx0Y29uc3QgYXV4aWxpYXJ5QmFyTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgfSxcblx0XHRcdHNpemU6IGF1eGlsaWFyeUJhclNpemUsXG5cdFx0XHR2aXNpYmxlOiB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKVxuXHRcdH07XG5cblx0XHRjb25zdCBwYW5lbE5vZGU6IElTZXJpYWxpemVkTGVhZk5vZGUgPSB7XG5cdFx0XHR0eXBlOiAnbGVhZicsXG5cdFx0XHRkYXRhOiB7IHR5cGU6IFBhcnRzLlBBTkVMX1BBUlQgfSxcblx0XHRcdHNpemU6IHBhbmVsU2l6ZSxcblx0XHRcdHZpc2libGU6IHRoaXMuX2VmZmVjdGl2ZVZpc2libGUoUGFydHMuUEFORUxfUEFSVClcblx0XHR9O1xuXG5cdFx0Ly8gVG9wIHJpZ2h0IHNlY3Rpb246IENoYXQgQmFyIHwgRWRpdG9yIFt8IEF1eGlsaWFyeSBCYXJdIHwgQ3VzdG9tIFZpZXcgR3JpZCAoaG9yaXpvbnRhbCkuXG5cdFx0Ly8gV2hlbiBkb2NrZWQsIHRoZSBhdXhpbGlhcnkgYmFyIGlzIGluc2lkZSB0aGUgZWRpdG9yIHBhcnQgYW5kXG5cdFx0Ly8gb21pdHRlZCBmcm9tIHRoZSBncmlkOyBvdGhlcndpc2UgaXQgaXMgaXRzIG93biB0cmFpbGluZyBncmlkIGNvbHVtbi5cblx0XHRjb25zdCB0b3BSaWdodFNlY3Rpb246IElTZXJpYWxpemVkTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0ZGF0YTogdGhpcy5fdG9wUmlnaHRTZWN0aW9uQ2hpbGRyZW4oc2Vzc2lvbnNOb2RlLCBlZGl0b3JOb2RlLCBhdXhpbGlhcnlCYXJOb2RlLCBjdXN0b21WaWV3R3JpZE5vZGUpLFxuXHRcdFx0c2l6ZTogdG9wUmlnaHRIZWlnaHRcblx0XHR9O1xuXG5cdFx0Ly8gUmlnaHQgc2VjdGlvbjogVG9wIFJpZ2h0IHwgUGFuZWwgKHZlcnRpY2FsKVxuXHRcdGNvbnN0IHJpZ2h0U2VjdGlvbjogSVNlcmlhbGl6ZWROb2RlID0ge1xuXHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRkYXRhOiBbdG9wUmlnaHRTZWN0aW9uLCBwYW5lbE5vZGVdLFxuXHRcdFx0c2l6ZTogcmlnaHRTZWN0aW9uV2lkdGhcblx0XHR9O1xuXG5cdFx0Ly8gQ29udGVudCBzZWN0aW9uOiBTaWRlYmFyIHwgUmlnaHQgc2VjdGlvbiAoaG9yaXpvbnRhbClcblx0XHRjb25zdCBjb250ZW50U2VjdGlvbjogSVNlcmlhbGl6ZWROb2RlID0ge1xuXHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRkYXRhOiBbc2lkZUJhck5vZGUsIHJpZ2h0U2VjdGlvbl0sXG5cdFx0XHRzaXplOiBjb250ZW50SGVpZ2h0XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSVNlcmlhbGl6ZWRHcmlkID0ge1xuXHRcdFx0cm9vdDoge1xuXHRcdFx0XHR0eXBlOiAnYnJhbmNoJyxcblx0XHRcdFx0c2l6ZTogd2lkdGgsXG5cdFx0XHRcdGRhdGE6IFtcblx0XHRcdFx0XHR0aXRsZUJhck5vZGUsXG5cdFx0XHRcdFx0Y29udGVudFNlY3Rpb25cblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCxcblx0XHRcdHdpZHRoLFxuXHRcdFx0aGVpZ2h0XG5cdFx0fTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTGF5b3V0IE1ldGhvZHNcblxuXHRwcml2YXRlIF9wcmV2aW91c1ZpZXdwb3J0Q2xhc3M6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRsYXlvdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbiA9IGdldENsaWVudEFyZWEoXG5cdFx0XHR0aGlzLm1haW5XaW5kb3dGdWxsc2NyZWVuID8gbWFpbldpbmRvdy5kb2N1bWVudC5ib2R5IDogdGhpcy5wYXJlbnRcblx0XHQpO1xuXG5cdFx0Ly8gVXBkYXRlIHZpZXdwb3J0IGNsYXNzaWZpY2F0aW9uIGFuZCB0b2dnbGUgbW9iaWxlIENTUyBjbGFzc2VzXG5cdFx0Y29uc3QgcHJldmlvdXNDbGFzcyA9IHRoaXMuX3ByZXZpb3VzVmlld3BvcnRDbGFzcztcblx0XHR0aGlzLmxheW91dFBvbGljeS51cGRhdGUodGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCwgdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQpO1xuXHRcdGNvbnN0IGN1cnJlbnRDbGFzcyA9IHRoaXMubGF5b3V0UG9saWN5LnZpZXdwb3J0Q2xhc3MuZ2V0KCk7XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoTGF5b3V0Q2xhc3Nlcy5QSE9ORV9MQVlPVVQsIGN1cnJlbnRDbGFzcyA9PT0gJ3Bob25lJyk7XG5cblx0XHQvLyBXaGVuIHZpZXdwb3J0IGNsYXNzIGNoYW5nZXMgYXQgcnVudGltZSAoZS5nLiwgZGV2aWNlIGVtdWxhdGlvbiB0b2dnbGUpLFxuXHRcdC8vIHVwZGF0ZSBwYXJ0IHZpc2liaWxpdHkgYW5kIGNyZWF0ZS9kZXN0cm95IG1vYmlsZSBjb21wb25lbnRzXG5cdFx0aWYgKHByZXZpb3VzQ2xhc3MgIT09IHVuZGVmaW5lZCAmJiBwcmV2aW91c0NsYXNzICE9PSBjdXJyZW50Q2xhc3MpIHtcblx0XHRcdGlmIChjdXJyZW50Q2xhc3MgPT09ICdwaG9uZScgJiYgIXRoaXMubW9iaWxlVG9wQmFyRWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZU1vYmlsZVRpdGxlYmFyKCk7XG5cdFx0XHRcdC8vIEhpZGUgdGl0bGViYXIgaW4gZ3JpZCBvbiBwaG9uZSAocmVwbGFjZWQgYnkgTW9iaWxlVGl0bGViYXJQYXJ0KVxuXHRcdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy50aXRsZUJhclBhcnRWaWV3LCBmYWxzZSk7XG5cdFx0XHRcdC8vIE9uIHBob25lLCBvbmx5IGNoYXQgaXMgdmlzaWJsZSBcdTIwMTQgaGlkZSBldmVyeXRoaW5nIGVsc2UgZmlyc3Rcblx0XHRcdFx0Y29uc3QgZGVmYXVsdHMgPSB0aGlzLmxheW91dFBvbGljeS5nZXRQYXJ0VmlzaWJpbGl0eURlZmF1bHRzKCk7XG5cdFx0XHRcdGlmICh0aGlzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIgIT09IGRlZmF1bHRzLnNpZGViYXIpIHtcblx0XHRcdFx0XHR0aGlzLnNldFNpZGVCYXJIaWRkZW4oIWRlZmF1bHRzLnNpZGViYXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciAhPT0gZGVmYXVsdHMuYXV4aWxpYXJ5QmFyKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRBdXhpbGlhcnlCYXJIaWRkZW4oIWRlZmF1bHRzLmF1eGlsaWFyeUJhcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkucGFuZWwgIT09IGRlZmF1bHRzLnBhbmVsKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbighZGVmYXVsdHMucGFuZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGN1cnJlbnRDbGFzcyAhPT0gJ3Bob25lJyAmJiB0aGlzLm1vYmlsZVRvcEJhckVsZW1lbnQpIHtcblx0XHRcdFx0Ly8gUmVtb3ZlIG1vYmlsZSBjb21wb25lbnRzIHdoZW4gbGVhdmluZyBwaG9uZSBsYXlvdXRcblx0XHRcdFx0dGhpcy5tb2JpbGVUb3BCYXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLm1vYmlsZVRvcEJhckVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdC8vIFJlc3RvcmUgdGl0bGViYXIgaW4gZ3JpZFxuXHRcdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy50aXRsZUJhclBhcnRWaWV3LCB0cnVlKTtcblx0XHRcdFx0Ly8gUmVzdG9yZSBkZXNrdG9wIHBhcnQgdmlzaWJpbGl0eVxuXHRcdFx0XHRjb25zdCBkZWZhdWx0cyA9IHRoaXMubGF5b3V0UG9saWN5LmdldFBhcnRWaXNpYmlsaXR5RGVmYXVsdHMoKTtcblx0XHRcdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhciAhPT0gZGVmYXVsdHMuc2lkZWJhcikge1xuXHRcdFx0XHRcdHRoaXMuc2V0U2lkZUJhckhpZGRlbighZGVmYXVsdHMuc2lkZWJhcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuc2Vzc2lvbnMgIT09IGRlZmF1bHRzLnNlc3Npb25zKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRTZXNzaW9uc0hpZGRlbighZGVmYXVsdHMuc2Vzc2lvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciAhPT0gZGVmYXVsdHMuYXV4aWxpYXJ5QmFyKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRBdXhpbGlhcnlCYXJIaWRkZW4oIWRlZmF1bHRzLmF1eGlsaWFyeUJhcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkucGFuZWwgIT09IGRlZmF1bHRzLnBhbmVsKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbighZGVmYXVsdHMucGFuZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlLXJ1biB1cGRhdGVTdHlsZXMoKSBvbiBwYW5lIGNvbXBvc2l0ZSBwYXJ0cyBzbyB0aGF0XG5cdFx0XHQvLyBtb2JpbGUgUGFydCBzdWJjbGFzc2VzIGNhbiByZS1hcHBseSBvciBjbGVhciBjYXJkLWNocm9tZVxuXHRcdFx0Ly8gaW5saW5lIHN0eWxlcyBiYXNlZCBvbiB0aGUgbmV3IGAucGhvbmUtbGF5b3V0YCBjbGFzcy5cblx0XHRcdGZvciAoY29uc3QgcGFydElkIG9mIFtQYXJ0cy5TRVNTSU9OU19QQVJULCBQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlQsIFBhcnRzLlNJREVCQVJfUEFSVCwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIFBhcnRzLlBBTkVMX1BBUlRdKSB7XG5cdFx0XHRcdHRoaXMucGFydHMuZ2V0KHBhcnRJZCk/LnVwZGF0ZVN0eWxlcygpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl91cGRhdGVNb2JpbGVDdXN0b21WaWV3TmF2aWdhdGlvbigpO1xuXHRcdH1cblx0XHR0aGlzLl9wcmV2aW91c1ZpZXdwb3J0Q2xhc3MgPSBjdXJyZW50Q2xhc3M7XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFdvcmtiZW5jaCNsYXlvdXQsIGhlaWdodDogJHt0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uLmhlaWdodH0sIHdpZHRoOiAke3RoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24ud2lkdGh9YCk7XG5cblx0XHRzaXplKHRoaXMubWFpbkNvbnRhaW5lciwgdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCwgdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQpO1xuXG5cblx0XHR0aGlzLl9sYXlvdXRHcmlkKCk7XG5cblx0XHQvLyBEb2NrICsgbGF5b3V0IHRoZSBhdXhpbGlhcnkgYmFyIGluc2lkZSB0aGUgZWRpdG9yIHBhcnQgc28gdGhlXG5cdFx0Ly8gZWRpdG9yIHRhYiBiYXIgc3BhbnMgdGhlIGZ1bGwgd2lkdGggYWJvdmUgYm90aC5cblx0XHR0aGlzLl9hdHRhY2hTaWRlUGFuZSgpO1xuXHRcdHRoaXMuX2xheW91dFNpZGVQYW5lKCk7XG5cblx0XHR0aGlzLmxheW91dE1vYmlsZVNpZGViYXIoKTtcblxuXHRcdC8vIEVtaXQgYXMgZXZlbnRcblx0XHR0aGlzLmhhbmRsZUNvbnRhaW5lckRpZExheW91dCh0aGlzLm1haW5Db250YWluZXIsIHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0R3JpZCgpOiB2b2lkIHtcblx0XHRjb25zdCBtb2JpbGVUb3BCYXJIZWlnaHQgPSB0aGlzLm1vYmlsZVRvcEJhckVsZW1lbnQ/Lm9mZnNldEhlaWdodCA/PyAwO1xuXHRcdC8vIEtlZXAgaW4gc3luYyB3aXRoIHRoZSBkZXNrdG9wIGdyaWQgbWFyZ2luIGluIHdvcmtiZW5jaC5jc3MuXG5cdFx0Y29uc3QgaXNQaG9uZSA9IHRoaXMubGF5b3V0UG9saWN5LnZpZXdwb3J0Q2xhc3MuZ2V0KCkgPT09ICdwaG9uZSc7XG5cdFx0Y29uc3QgZ3JpZEd1dHRlclcgPSBpc1Bob25lID8gMCA6IHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhciA/IDE0IDogMjA7XG5cdFx0Y29uc3QgZ3JpZEd1dHRlckggPSBpc1Bob25lID8gMCA6IDEwO1xuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5sYXlvdXQoXG5cdFx0XHR0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uLndpZHRoIC0gZ3JpZEd1dHRlclcsXG5cdFx0XHR0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uLmhlaWdodCAtIG1vYmlsZVRvcEJhckhlaWdodCAtIGdyaWRHdXR0ZXJIXG5cdFx0KTtcblx0fVxuXG5cdGhhbmRsZURvY2tlZEVkaXRvclBhcnRMYXlvdXQobm9kZVdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkVkaXRvck5vZGVSZXNpemVkKG5vZGVXaWR0aCk7XG5cdH1cblxuXHRpc0VkaXRvclJldmVhbGVkRXhwbGljaXRseSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yUmV2ZWFsZWRFeHBsaWNpdGx5O1xuXHR9XG5cblx0cmV2ZWFsRWRpdG9yUGFydEV4cGxpY2l0bHkoKTogdm9pZCB7XG5cdFx0Ly8gTWFyayB0aGUgcmV2ZWFsIGV4cGxpY2l0IHNvIFIxIC8gdGhlIHdvcmtpbmctc2V0IGFwcGx5IGRvIG5vdCByZS1oaWRlIGl0LlxuXHRcdC8vIFJlLWFzc2VydCB0aGUgZmxhZyBldmVuIHdoZW4gYWxyZWFkeSB2aXNpYmxlICh0aGUgZWFybHktcmV0dXJuIGluXG5cdFx0Ly8gc2V0RWRpdG9ySGlkZGVuIHdvdWxkIG90aGVyd2lzZSBza2lwIGl0KS5cblx0XHR0aGlzLl9lZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHkgPSB0cnVlO1xuXHRcdHRoaXMuc2V0RWRpdG9ySGlkZGVuKGZhbHNlLCAvKiBleHBsaWNpdCAqLyB0cnVlKTtcblx0fVxuXG5cdGdldERvY2tlZEF1eGlsaWFyeUJhcldpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRzZXREb2NrZWRBdXhpbGlhcnlCYXJXaWR0aChfd2lkdGg6IG51bWJlcik6IHZvaWQgeyB9XG5cblx0cHJpdmF0ZSBsYXlvdXRNb2JpbGVTaWRlYmFyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNpZGViYXJDb250YWluZXIgPSB0aGlzLmdldENvbnRhaW5lcihtYWluV2luZG93LCBQYXJ0cy5TSURFQkFSX1BBUlQpO1xuXHRcdGNvbnN0IHNpZGViYXJQYXJ0ID0gdGhpcy5nZXRQYXJ0KFBhcnRzLlNJREVCQVJfUEFSVCk7XG5cdFx0aWYgKCFzaWRlYmFyQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT24gcGhvbmUgdGhlIHNpZGViYXIgcmVuZGVycyBhcyBhIGZ1bGwtdmlld3BvcnQgb3ZlcmxheSBkcmF3ZXIuXG5cdFx0Ly8gR2VvbWV0cnkgaXMgZnVsbHkgZXhwcmVzc2VkIGluIENTUyBcdTIwMTQgc2VlXG5cdFx0Ly8gYG1vYmlsZUNoYXRTaGVsbC5jc3NgIChzcGxpdC12aWV3LXZpZXcgZmlsbHMgdGhlIGdyaWQpIGFuZFxuXHRcdC8vIGBzaWRlYmFyUGFydC5jc3NgIChkcmF3ZXIgYW5pbWF0aW9uLCB6LWluZGV4KS4gV2UgYXZvaWQgc2V0dGluZ1xuXHRcdC8vIGlubGluZSBwb3NpdGlvbi9zaXplIHN0eWxlcyBoZXJlIGJlY2F1c2Ugd3JpdGluZyB0aGVtIGFmdGVyIHRoZVxuXHRcdC8vIGdyaWQgaGFzIGFscmVhZHkgbGFpZCBvdXQgYW5kIHBhaW50ZWQgdGhlIHNpZGViYXIgY2F1c2VzIGFcblx0XHQvLyB2aXNpYmxlIG9uZS1mcmFtZSBzbmFwIG9uIHRvZ2dsZS5cblx0XHRjb25zdCBpc1Bob25lID0gdGhpcy5sYXlvdXRQb2xpY3kudmlld3BvcnRDbGFzcy5nZXQoKSA9PT0gJ3Bob25lJztcblx0XHRpZiAoIWlzUGhvbmUgfHwgIXRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhcikge1xuXHRcdFx0c2lkZWJhckNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdtb2JpbGUtb3ZlcmxheS1zaWRlYmFyJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c2lkZWJhckNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb2JpbGUtb3ZlcmxheS1zaWRlYmFyJyk7XG5cblx0XHQvLyBSZS1sYXlvdXQgdGhlIHNpZGViYXIgUGFydCB3aXRoIHRoZSBkcmF3ZXIncyBjb250ZW50IGRpbWVuc2lvbnNcblx0XHQvLyBzbyBpdHMgaW50ZXJuYWwgY29tcG9zaXRlL2xpc3Qgc2l6aW5nIG1hdGNoZXMgdGhlIENTUy1wb3NpdGlvbmVkXG5cdFx0Ly8gZHJhd2VyIChncmlkIGFyZWEgbWludXMgdGhlIG1vYmlsZSB0b3AgYmFyKS5cblx0XHRjb25zdCB0b3BCYXJIZWlnaHQgPSB0aGlzLm1vYmlsZVRvcEJhckVsZW1lbnQ/Lm9mZnNldEhlaWdodCA/PyA0ODtcblx0XHRjb25zdCBkcmF3ZXJXaWR0aCA9IHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24ud2lkdGg7XG5cdFx0Y29uc3QgZHJhd2VySGVpZ2h0ID0gTWF0aC5tYXgoMCwgdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgLSB0b3BCYXJIZWlnaHQpO1xuXHRcdHNpZGViYXJQYXJ0LmxheW91dChkcmF3ZXJXaWR0aCwgZHJhd2VySGVpZ2h0LCB0b3BCYXJIZWlnaHQsIDApO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVDb250YWluZXJEaWRMYXlvdXQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZGltZW5zaW9uOiBJRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRMYXlvdXRDb250YWluZXIuZmlyZSh7IGNvbnRhaW5lciwgZGltZW5zaW9uIH0pO1xuXHRcdGlmIChjb250YWluZXIgPT09IHRoaXMubWFpbkNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5fb25EaWRMYXlvdXRNYWluQ29udGFpbmVyLmZpcmUoZGltZW5zaW9uKTtcblx0XHR9XG5cdFx0aWYgKGNvbnRhaW5lciA9PT0gdGhpcy5hY3RpdmVDb250YWluZXIpIHtcblx0XHRcdHRoaXMuX29uRGlkTGF5b3V0QWN0aXZlQ29udGFpbmVyLmZpcmUoZGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRpc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7IC8vIHRoZSBhZ2VudHMgd2luZG93IGhhcyBpdHMgb3duIGZsb2F0aW5nIGNhcmQgZGVzaWduXG5cdH1cblxuXHRnZXRMYXlvdXRDbGFzc2VzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gY29hbGVzY2UoW1xuXHRcdFx0IXRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhciA/IExheW91dENsYXNzZXMuU0lERUJBUl9ISURERU4gOiB1bmRlZmluZWQsXG5cdFx0XHQhdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCkgPyBMYXlvdXRDbGFzc2VzLk1BSU5fRURJVE9SX0FSRUFfSElEREVOIDogdW5kZWZpbmVkLFxuXHRcdFx0IXRoaXMuX2VmZmVjdGl2ZVZpc2libGUoUGFydHMuUEFORUxfUEFSVCkgPyBMYXlvdXRDbGFzc2VzLlBBTkVMX0hJRERFTiA6IHVuZGVmaW5lZCxcblx0XHRcdCF0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSA/IExheW91dENsYXNzZXMuQVVYSUxJQVJZQkFSX0hJRERFTiA6IHVuZGVmaW5lZCxcblx0XHRcdCF0aGlzLmlzRWRpdG9yUGFuZVZpc2libGUoKSA/IExheW91dENsYXNzZXMuRURJVE9SX1BBTkVfSElEREVOIDogdW5kZWZpbmVkLFxuXHRcdFx0IXRoaXMuX2VmZmVjdGl2ZVZpc2libGUoUGFydHMuU0VTU0lPTlNfUEFSVCkgPyBMYXlvdXRDbGFzc2VzLlNFU1NJT05TX0hJRERFTiA6IHVuZGVmaW5lZCxcblx0XHRcdCF0aGlzLnBhcnRWaXNpYmlsaXR5LmN1c3RvbVZpZXdHcmlkID8gTGF5b3V0Q2xhc3Nlcy5DVVNUT01fVklFV19HUklEX0hJRERFTiA6IHVuZGVmaW5lZCxcblx0XHRcdExheW91dENsYXNzZXMuU1RBVFVTQkFSX0hJRERFTiwgLy8gYWdlbnRzIHdpbmRvdyBuZXZlciBoYXMgYSBzdGF0dXMgYmFyXG5cdFx0XHR0aGlzLm1haW5XaW5kb3dGdWxsc2NyZWVuID8gTGF5b3V0Q2xhc3Nlcy5GVUxMU0NSRUVOIDogdW5kZWZpbmVkLFxuXHRcdFx0dGhpcy5sYXlvdXRQb2xpY3kudmlld3BvcnRDbGFzcy5nZXQoKSA9PT0gJ3Bob25lJyA/IExheW91dENsYXNzZXMuUEhPTkVfTEFZT1VUIDogdW5kZWZpbmVkLFxuXHRcdF0pO1xuXHR9XG5cblx0aXNFZGl0b3JQYW5lVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCkgfHwgdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVFZGl0b3JQYW5lVmlzaWJpbGl0eUNsYXNzKCk6IHZvaWQge1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuRURJVE9SX1BBTkVfSElEREVOLCAhdGhpcy5pc0VkaXRvclBhbmVWaXNpYmxlKCkpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFBhcnQgTWFuYWdlbWVudFxuXG5cdHJlZ2lzdGVyUGFydChwYXJ0OiBQYXJ0KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGlkID0gcGFydC5nZXRJZCgpO1xuXHRcdHRoaXMucGFydHMuc2V0KGlkLCBwYXJ0KTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMucGFydHMuZGVsZXRlKGlkKSk7XG5cdH1cblxuXHRnZXRQYXJ0KGtleTogUGFydHMpOiBQYXJ0IHtcblx0XHRjb25zdCBwYXJ0ID0gdGhpcy5wYXJ0cy5nZXQoa2V5KTtcblx0XHRpZiAoIXBhcnQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBwYXJ0ICR7a2V5fWApO1xuXHRcdH1cblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdGhhc0ZvY3VzKHBhcnQ6IFBhcnRzKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5nZXRDb250YWluZXIobWFpbldpbmRvdywgcGFydCk7XG5cdFx0aWYgKCFjb250YWluZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdGlmICghYWN0aXZlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBpc0FuY2VzdG9yVXNpbmdGbG93VG8oYWN0aXZlRWxlbWVudCwgY29udGFpbmVyKTtcblx0fVxuXG5cdGZvY3VzUGFydChwYXJ0OiBNVUxUSV9XSU5ET1dfUEFSVFMsIHRhcmdldFdpbmRvdzogV2luZG93KTogdm9pZDtcblx0Zm9jdXNQYXJ0KHBhcnQ6IFNJTkdMRV9XSU5ET1dfUEFSVFMpOiB2b2lkO1xuXHRmb2N1c1BhcnQocGFydDogUGFydHMsIHRhcmdldFdpbmRvdzogV2luZG93ID0gbWFpbldpbmRvdyk6IHZvaWQge1xuXHRcdHN3aXRjaCAocGFydCkge1xuXHRcdFx0Y2FzZSBQYXJ0cy5FRElUT1JfUEFSVDpcblx0XHRcdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXAuZm9jdXMoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFBhcnRzLlBBTkVMX1BBUlQ6XG5cdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpPy5mb2N1cygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUGFydHMuU0lERUJBUl9QQVJUOlxuXHRcdFx0XHR0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpPy5mb2N1cygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQ6XG5cdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKT8uZm9jdXMoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFBhcnRzLlNFU1NJT05TX1BBUlQ6XG5cdFx0XHRcdC8vIFRPRE86IGZvY3VzIGNoYXQgYmFyIGNvbnRlbnQgb25jZSBpdCBpcyB3aXJlZCB1cFxuXHRcdFx0XHR0aGlzLmdldFBhcnQoUGFydHMuU0VTU0lPTlNfUEFSVCkuZ2V0Q29udGFpbmVyKCk/LmZvY3VzKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlQ6XG5cdFx0XHRcdHRoaXMuY3VzdG9tVmlld0dyaWRQYXJ0U2VydmljZS5mb2N1c0FjdGl2ZVZpZXcoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuZ2V0Q29udGFpbmVyKHRhcmdldFdpbmRvdywgcGFydCk7XG5cdFx0XHRcdGNvbnRhaW5lcj8uZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmZvY3VzUGFydChQYXJ0cy5TRVNTSU9OU19QQVJUKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBDb250YWluZXIgTWV0aG9kc1xuXG5cdGdldENvbnRhaW5lcih0YXJnZXRXaW5kb3c6IFdpbmRvdyk6IEhUTUxFbGVtZW50O1xuXHRnZXRDb250YWluZXIodGFyZ2V0V2luZG93OiBXaW5kb3csIHBhcnQ6IFBhcnRzKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdGdldENvbnRhaW5lcih0YXJnZXRXaW5kb3c6IFdpbmRvdywgcGFydD86IFBhcnRzKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2YgcGFydCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldENvbnRhaW5lckZyb21Eb2N1bWVudCh0YXJnZXRXaW5kb3cuZG9jdW1lbnQpO1xuXHRcdH1cblxuXHRcdGlmICh0YXJnZXRXaW5kb3cgPT09IG1haW5XaW5kb3cpIHtcblx0XHRcdHJldHVybiB0aGlzLnBhcnRzLmdldChwYXJ0KT8uZ2V0Q29udGFpbmVyKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIGF1eGlsaWFyeSB3aW5kb3dzLCBvbmx5IGVkaXRvciBwYXJ0IGlzIHN1cHBvcnRlZFxuXHRcdGlmIChwYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCkge1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5nZXRDb250YWluZXJGcm9tRG9jdW1lbnQodGFyZ2V0V2luZG93LmRvY3VtZW50KTtcblx0XHRcdGNvbnN0IHBhcnRDYW5kaWRhdGUgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRQYXJ0KGNvbnRhaW5lcik7XG5cdFx0XHRpZiAocGFydENhbmRpZGF0ZSBpbnN0YW5jZW9mIFBhcnQpIHtcblx0XHRcdFx0cmV0dXJuIHBhcnRDYW5kaWRhdGUuZ2V0Q29udGFpbmVyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHdoZW5Db250YWluZXJTdHlsZXNMb2FkZWQoX3dpbmRvdzogQ29kZVdpbmRvdyk6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUGFydCBWaXNpYmlsaXR5XG5cblx0aXNBY3Rpdml0eUJhckhpZGRlbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTsgLy8gTm8gYWN0aXZpdHkgYmFyIGluIHRoaXMgbGF5b3V0XG5cdH1cblxuXHQvKipcblx0ICogUGFydHMgYSB2aXNpYmxlIGN1c3RvbSB2aWV3IHJlcGxhY2VzLiBXaGlsZSB0aGUgY3VzdG9tIHZpZXcgZ3JpZCBpcyBzaG93blxuXHQgKiB0aGVzZSBrZWVwIHRoZWlyIGRlc2lyZWQgKHBlci1zZXNzaW9uKSB2aXNpYmlsaXR5IHN0YXRlIGJ1dCBhcmUgbm90XG5cdCAqIHJlbmRlcmVkLCBzbyBoaWRpbmcgdGhlIGN1c3RvbSB2aWV3IHJlc3RvcmVzIHdoYXRldmVyIHRoZSBsYXlvdXRcblx0ICogY29udHJvbGxlciBsYXN0IGFza2VkIGZvciBcdTIwMTQgaW5jbHVkaW5nIGNoYW5nZXMgbWFkZSB3aGlsZSBpdCB3YXMgc2hvd24uXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQ1VTVE9NX1ZJRVdfRVhDTFVTSVZFX1BBUlRTID0gW1xuXHRcdFBhcnRzLlNFU1NJT05TX1BBUlQsXG5cdFx0UGFydHMuRURJVE9SX1BBUlQsXG5cdFx0UGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsXG5cdFx0UGFydHMuUEFORUxfUEFSVFxuXHRdIGFzIGNvbnN0O1xuXG5cdC8qKiBUaGUgZGVzaXJlZCB2aXNpYmlsaXR5IG9mIGEgcGFydCwgaWdub3JpbmcgYW55IGN1c3RvbSB2aWV3IHNob3dpbmcgb3ZlciBpdC4gKi9cblx0cHJpdmF0ZSBfZGVzaXJlZFZpc2libGUocGFydDogUGFydHMpOiBib29sZWFuIHtcblx0XHRzd2l0Y2ggKHBhcnQpIHtcblx0XHRcdGNhc2UgUGFydHMuU0VTU0lPTlNfUEFSVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMucGFydFZpc2liaWxpdHkuc2Vzc2lvbnM7XG5cdFx0XHRjYXNlIFBhcnRzLkVESVRPUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3I7XG5cdFx0XHRjYXNlIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXI7XG5cdFx0XHRjYXNlIFBhcnRzLlBBTkVMX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLnBhcnRWaXNpYmlsaXR5LnBhbmVsO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBXaGV0aGVyIGEgcGFydCBpcyBhY3R1YWxseSByZW5kZXJlZCByaWdodCBub3cuICovXG5cdHByb3RlY3RlZCBfZWZmZWN0aXZlVmlzaWJsZShwYXJ0OiBQYXJ0cyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9kZXNpcmVkVmlzaWJsZShwYXJ0KSAmJiAhdGhpcy5wYXJ0VmlzaWJpbGl0eS5jdXN0b21WaWV3R3JpZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBlZGl0b3IgZ3JpZCBub2RlIHNob3VsZCBiZSBzaG93bi4gSW4gdGhlIHNpbmdsZS1wYW5lIGxheW91dCB0aGVcblx0ICogbm9kZSBhbHNvIGhvc3RzIHRoZSBkb2NrZWQgYXV4aWxpYXJ5IGJhciwgc28gaXQgZm9sbG93cyBib3RoIHBhcnRzLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9lZGl0b3JOb2RlU2hvdWxkQmVWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3JOb2RlVmlzaWJsZSh0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJUKSwgdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpO1xuXHR9XG5cblx0aXNWaXNpYmxlKHBhcnQ6IFNJTkdMRV9XSU5ET1dfUEFSVFMpOiBib29sZWFuO1xuXHRpc1Zpc2libGUocGFydDogTVVMVElfV0lORE9XX1BBUlRTLCB0YXJnZXRXaW5kb3c6IFdpbmRvdyk6IGJvb2xlYW47XG5cdGlzVmlzaWJsZShwYXJ0OiBQYXJ0cywgdGFyZ2V0V2luZG93PzogV2luZG93KTogYm9vbGVhbiB7XG5cdFx0c3dpdGNoIChwYXJ0KSB7XG5cdFx0XHRjYXNlIFBhcnRzLlRJVExFQkFSX1BBUlQ6XG5cdFx0XHRcdC8vIE9uIHBob25lIGxheW91dCB0aGUgZ3JpZCB0aXRsZWJhciBpcyBoaWRkZW4gKHJlcGxhY2VkIGJ5IE1vYmlsZVRpdGxlYmFyUGFydClcblx0XHRcdFx0cmV0dXJuIHRoaXMubGF5b3V0UG9saWN5LnZpZXdwb3J0Q2xhc3MuZ2V0KCkgIT09ICdwaG9uZSc7XG5cdFx0XHRjYXNlIFBhcnRzLlNJREVCQVJfUEFSVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhcjtcblx0XHRcdGNhc2UgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQ6XG5cdFx0XHRjYXNlIFBhcnRzLkVESVRPUl9QQVJUOlxuXHRcdFx0Y2FzZSBQYXJ0cy5QQU5FTF9QQVJUOlxuXHRcdFx0Y2FzZSBQYXJ0cy5TRVNTSU9OU19QQVJUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShwYXJ0KTtcblx0XHRcdGNhc2UgUGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5wYXJ0VmlzaWJpbGl0eS5jdXN0b21WaWV3R3JpZDtcblx0XHRcdGNhc2UgUGFydHMuQUNUSVZJVFlCQVJfUEFSVDpcblx0XHRcdGNhc2UgUGFydHMuU1RBVFVTQkFSX1BBUlQ6XG5cdFx0XHRjYXNlIFBhcnRzLkJBTk5FUl9QQVJUOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHNldFBhcnRIaWRkZW4oaGlkZGVuOiBib29sZWFuLCBwYXJ0OiBQYXJ0cyk6IHZvaWQge1xuXHRcdHN3aXRjaCAocGFydCkge1xuXHRcdFx0Y2FzZSBQYXJ0cy5TSURFQkFSX1BBUlQ6XG5cdFx0XHRcdHRoaXMuc2V0U2lkZUJhckhpZGRlbihoaWRkZW4pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQ6XG5cdFx0XHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFySGlkZGVuKGhpZGRlbik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQYXJ0cy5FRElUT1JfUEFSVDpcblx0XHRcdFx0dGhpcy5zZXRFZGl0b3JIaWRkZW4oaGlkZGVuKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFBhcnRzLlBBTkVMX1BBUlQ6XG5cdFx0XHRcdHRoaXMuc2V0UGFuZWxIaWRkZW4oaGlkZGVuKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFBhcnRzLlNFU1NJT05TX1BBUlQ6XG5cdFx0XHRcdHRoaXMuc2V0U2Vzc2lvbnNIaWRkZW4oaGlkZGVuKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0dG9nZ2xlU2Vjb25kYXJ5U2lkZUJhcigpOiB2b2lkIHtcblx0XHQvLyBUaGUgc2lkZSBwYW5lbCBpcyByZXBsYWNlZCBieSB0aGUgY3VzdG9tIHZpZXcgZ3JpZCB3aGlsZSBvbmUgaXMgc2hvd24uXG5cdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuY3VzdG9tVmlld0dyaWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2aXNpYmxlID0gIXRoaXMuaXNTZWNvbmRhcnlTaWRlQmFyVmlzaWJsZSgpO1xuXHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFySGlkZGVuKCF2aXNpYmxlKTtcblx0XHRhbGVydCh2aXNpYmxlXG5cdFx0XHQ/IGxvY2FsaXplKCdhdXhpbGlhcnlCYXJWaXNpYmxlJywgXCJTZWNvbmRhcnkgU2lkZSBCYXIgc2hvd25cIilcblx0XHRcdDogbG9jYWxpemUoJ2F1eGlsaWFyeUJhckhpZGRlbicsIFwiU2Vjb25kYXJ5IFNpZGUgQmFyIGhpZGRlblwiKSk7XG5cdH1cblxuXHRpc1NlY29uZGFyeVNpZGVCYXJWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdH1cblxuXHRwcml2YXRlIHNldFNpZGVCYXJIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhciA9PT0gIWhpZGRlbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc2l6ZUNvbnRleHQgPSB0aGlzLl9wcmVwYXJlU2lkZUJhclJlc2l6ZShoaWRkZW4pO1xuXG5cdFx0dGhpcy5wYXJ0VmlzaWJpbGl0eS5zaWRlYmFyID0gIWhpZGRlbjtcblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShMYXlvdXRDbGFzc2VzLlNJREVCQVJfSElEREVOLCBoaWRkZW4pO1xuXG5cdFx0Ly8gUHJvcGFnYXRlIHRvIGdyaWRcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUoXG5cdFx0XHR0aGlzLnNpZGVCYXJQYXJ0Vmlldyxcblx0XHRcdCFoaWRkZW4sXG5cdFx0KTtcblxuXHRcdHRoaXMuX2FwcGx5U2lkZUJhclJlc2l6ZShoaWRkZW4sIHJlc2l6ZUNvbnRleHQpO1xuXG5cdFx0Ly8gSWYgc2lkZWJhciBiZWNvbWVzIGhpZGRlbiwgYWxzbyBoaWRlIHRoZSBjdXJyZW50IGFjdGl2ZSBwYW5lIGNvbXBvc2l0ZVxuXHRcdGlmIChoaWRkZW4gJiYgdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSkge1xuXHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5oaWRlQWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgc2lkZWJhciBiZWNvbWVzIHZpc2libGUsIHNob3cgbGFzdCBhY3RpdmUgVmlld2xldCBvciBkZWZhdWx0IHZpZXdsZXRcblx0XHRpZiAoIWhpZGRlbiAmJiAhdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSkge1xuXHRcdFx0Y29uc3Qgdmlld2xldFRvT3BlbiA9IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0TGFzdEFjdGl2ZVBhbmVDb21wb3NpdGVJZChWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcikgPz9cblx0XHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpPy5pZDtcblx0XHRcdGlmICh2aWV3bGV0VG9PcGVuKSB7XG5cdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUodmlld2xldFRvT3BlbiwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubGF5b3V0TW9iaWxlU2lkZWJhcigpO1xuXHRcdHRoaXMuX3NhdmVQYXJ0VmlzaWJpbGl0eSgpO1xuXHRcdHRoaXMuX2xheW91dEdyaWQoKTtcblx0fVxuXG5cdHNldEF1eGlsaWFyeUJhckhpZGRlbihoaWRkZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRBdXhpbGlhcnlCYXJIaWRkZW4oaGlkZGVuKTtcblx0fVxuXG5cdHNldEF1eGlsaWFyeUJhckhpZGRlbkZvclJlc2l6ZShoaWRkZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRBdXhpbGlhcnlCYXJIaWRkZW4oaGlkZGVuLCAncmVzaXplJyk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRBdXhpbGlhcnlCYXJIaWRkZW4oaGlkZGVuOiBib29sZWFuLCBzb3VyY2U/OiAncmVzaXplJyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciA9PT0gIWhpZGRlbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNpZGVQYW5lV2FzQ2xvc2VkID0gIXRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yICYmICF0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhcjtcblxuXHRcdGlmIChoaWRkZW4pIHtcblx0XHRcdHRoaXMuX3Jlc3RvcmVBdHRhY2hlZEVkaXRvck1heGltaXplZE9uU2hvdyA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uV2lsbEhpZGVBdXhpbGlhcnlCYXIoaGlkZGVuKTtcblxuXHRcdHRoaXMucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyID0gIWhpZGRlbjtcblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShMYXlvdXRDbGFzc2VzLkFVWElMSUFSWUJBUl9ISURERU4sICF0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSk7XG5cblx0XHR0aGlzLl9hcHBseUF1eGlsaWFyeUJhclZpc2liaWxpdHkoaGlkZGVuLCBzb3VyY2UpO1xuXHRcdHRoaXMuX3VwZGF0ZUVkaXRvclBhbmVWaXNpYmlsaXR5Q2xhc3MoKTtcblxuXHRcdC8vIElmIGF1eGlsaWFyeSBiYXIgYmVjb21lcyBoaWRkZW4sIGFsc28gaGlkZSB0aGUgY3VycmVudCBhY3RpdmUgcGFuZSBjb21wb3NpdGVcblx0XHRpZiAoaGlkZGVuICYmIHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKSkge1xuXHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5oaWRlQWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKTtcblx0XHR9XG5cblx0XHQvLyBJZiBhdXhpbGlhcnkgYmFyIGJlY29tZXMgdmlzaWJsZSwgc2hvdyBsYXN0IGFjdGl2ZSBwYW5lIGNvbXBvc2l0ZSBvciBkZWZhdWx0XG5cdFx0aWYgKCFoaWRkZW4gJiYgIXRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKSkge1xuXHRcdFx0Y29uc3QgcGFuZUNvbXBvc2l0ZVRvT3BlbiA9IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0TGFzdEFjdGl2ZVBhbmVDb21wb3NpdGVJZChWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKSA/P1xuXHRcdFx0XHR0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXREZWZhdWx0Vmlld0NvbnRhaW5lcihWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKT8uaWQ7XG5cdFx0XHRpZiAocGFuZUNvbXBvc2l0ZVRvT3BlbiAmJiB0aGlzLl9zaG91bGRPcGVuQXV4aWxpYXJ5UGFuZUNvbXBvc2l0ZShwYW5lQ29tcG9zaXRlVG9PcGVuKSkge1xuXHRcdFx0XHR0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLm9wZW5QYW5lQ29tcG9zaXRlKHBhbmVDb21wb3NpdGVUb09wZW4sIFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghc291cmNlKSB7XG5cdFx0XHR0aGlzLl9zYXZlUGFydFZpc2liaWxpdHkoKTtcblx0XHR9XG5cblx0XHRpZiAoIWhpZGRlbiAmJiBzaWRlUGFuZVdhc0Nsb3NlZCkge1xuXHRcdFx0dGhpcy5fb25TaWRlUGFuZVJldmVhbGVkKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGdpdmVuIGF1eGlsaWFyeS1iYXIgdmlldyBjb250YWluZXIgY3VycmVudGx5IGhhcyBjb250ZW50IHRvIHNob3dcblx0ICogKG1pcnJvcnMgYElWaWV3c1NlcnZpY2UuaXNWaWV3Q29udGFpbmVyQWN0aXZlYDogYSBgaGlkZUlmRW1wdHlgIGNvbnRhaW5lciBpc1xuXHQgKiBvbmx5IGFjdGl2ZSBvbmNlIGl0IGhhcyBhdCBsZWFzdCBvbmUgYWN0aXZlIHZpZXcgZGVzY3JpcHRvcikuIFVzZWQgdG8gYXZvaWRcblx0ICogcHJlc2VudGluZyBhbiBlbXB0eSBkb2NrZWQgZGV0YWlsIHBhbmVsLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9pc0F1eFZpZXdDb250YWluZXJBY3RpdmUoY29udGFpbmVySWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChjb250YWluZXJJZCk7XG5cdFx0aWYgKCF2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghdmlld0NvbnRhaW5lci5oaWRlSWZFbXB0eSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lcikuYWN0aXZlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRzZXRFZGl0b3JIaWRkZW4oaGlkZGVuOiBib29sZWFuLCBleHBsaWNpdDogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yID09PSAhaGlkZGVuKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2lkZVBhbmVXYXNDbG9zZWQgPSAhdGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IgJiYgIXRoaXMucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyO1xuXG5cdFx0Ly8gVHJhY2sgd2hldGhlciB0aGlzIHZpc2libGUgc3RhdGUgd2FzIGFuIGV4cGxpY2l0IHVzZXIgcmV2ZWFsIHNvIFIxIGRvZXNcblx0XHQvLyBub3QgdW5kbyBpdC4gQW55IGhpZGUgY2xlYXJzIGl0OyBhbiBhdXRvbWF0aWMgcmV2ZWFsIGxlYXZlcyBpdCBmYWxzZS5cblx0XHR0aGlzLl9lZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHkgPSAhaGlkZGVuICYmIGV4cGxpY2l0O1xuXG5cdFx0dGhpcy5fcnVuV2l0aEVkaXRvclJlc2l6ZVN5bmNTdXNwZW5kZWQoKCkgPT4ge1xuXHRcdFx0Ly8gSWYgaGlkaW5nIHRoZSBlZGl0b3Igd2hpbGUgbWF4aW1pemVkXG5cdFx0XHRpZiAoaGlkZGVuICYmIHRoaXMuX2VkaXRvck1heGltaXplZCkge1xuXHRcdFx0XHR0aGlzLnNldEVkaXRvck1heGltaXplZChmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yID0gIWhpZGRlbjtcblx0XHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuTUFJTl9FRElUT1JfQVJFQV9ISURERU4sICF0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJUKSk7XG5cblx0XHRcdGlmICh0aGlzLmVkaXRvclBhcnRWaWV3KSB7XG5cdFx0XHRcdHRoaXMuX2FwcGx5RWRpdG9yVmlzaWJpbGl0eShoaWRkZW4pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdXBkYXRlRWRpdG9yUGFuZVZpc2liaWxpdHlDbGFzcygpO1xuXG5cdFx0XHR0aGlzLl9zYXZlUGFydFZpc2liaWxpdHkoKTtcblx0XHR9KTtcblxuXHRcdGlmICghaGlkZGVuICYmIHNpZGVQYW5lV2FzQ2xvc2VkKSB7XG5cdFx0XHR0aGlzLl9vblNpZGVQYW5lUmV2ZWFsZWQoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSG9vayBpbnZva2VkIHdoZW4gdGhlIHNpZGUgcGFuZSAoZWRpdG9yIHBhcnQgYW5kL29yIGF1eGlsaWFyeSBiYXIpIHRyYW5zaXRpb25zXG5cdCAqIGZyb20gKmZ1bGx5IGhpZGRlbiogdG8gdmlzaWJsZS4gVGhlIGJhc2UgY2xhc3NpYy9tb2JpbGUgbGF5b3V0IGhhcyBubyBkb2NrZWRcblx0ICogc2lkZSBwYW5lLCBzbyB0aGlzIGlzIGEgbm8tb3A7IHtAbGluayBTaW5nbGVQYW5lV29ya2JlbmNofSBvdmVycmlkZXMgaXQgdG9cblx0ICogZmlyZSB7QGxpbmsgb25EaWRSZXZlYWxTaWRlUGFuZX0uXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX29uU2lkZVBhbmVSZXZlYWxlZCgpOiB2b2lkIHsgfVxuXG5cdC8qKlxuXHQgKiBTaXplcyB0aGUgZWRpdG9yIHBhcnQgd2hlbiBpdCBpcyBmaXJzdCByZXZlYWxlZCBmcm9tIGEgaGlkZGVuIHN0YXRlLCBzbyBpdFxuXHQgKiBvcGVucyBhcyBhIGNvbWZvcnRhYmxlIHNwbGl0IHdpdGggdGhlIHNlc3Npb25zIHBhcnQgcmF0aGVyIHRoYW4gYXQgaXRzXG5cdCAqIG1pbmltdW0vcmVzdG9yZWQgd2lkdGguIFRoZSBkZWZhdWx0IGdyaWQgbGF5b3V0IHNwbGl0cyB0aGUgbWFpbiBhcmVhIGV2ZW5seTtcblx0ICogbGF5b3V0cyB3aXRoIGRpZmZlcmVudCBzaXppbmcgKGUuZy4gdGhlIHNpbmdsZS1wYW5lIHNpZGUgcGFuZSkgb3ZlcnJpZGUgdGhpcy5cblx0ICovXG5cdHByb3RlY3RlZCBfYXBwbHlFZGl0b3JTcGxpdFNpemUobWFpbkFyZWFXaWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0RWRpdG9yV2lkdGggPSBNYXRoLm1heChFRElUT1JfUEFSVF9NSU5JTVVNX1dJRFRILCBNYXRoLmZsb29yKG1haW5BcmVhV2lkdGggLyAyKSk7XG5cdFx0Y29uc3QgY3VycmVudEVkaXRvclNpemUgPSB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5lZGl0b3JQYXJ0Vmlldyk7XG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5lZGl0b3JQYXJ0Vmlldywge1xuXHRcdFx0d2lkdGg6IHRhcmdldEVkaXRvcldpZHRoLFxuXHRcdFx0aGVpZ2h0OiBjdXJyZW50RWRpdG9yU2l6ZS5oZWlnaHRcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc2V0UGFuZWxIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkucGFuZWwgPT09ICFoaWRkZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiBoaWRpbmcgYW5kIHRoZSBwYW5lbCBpcyBtYXhpbWl6ZWQsIGV4aXQgbWF4aW1pemVkIHN0YXRlIGZpcnN0XG5cdFx0aWYgKGhpZGRlbiAmJiB0aGlzLndvcmtiZW5jaEdyaWQuaGFzTWF4aW1pemVkVmlldygpKSB7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuZXhpdE1heGltaXplZFZpZXcoKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYW5lbEhhZEZvY3VzID0gIWhpZGRlbiB8fCB0aGlzLmhhc0ZvY3VzKFBhcnRzLlBBTkVMX1BBUlQpO1xuXG5cdFx0dGhpcy5wYXJ0VmlzaWJpbGl0eS5wYW5lbCA9ICFoaWRkZW47XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoTGF5b3V0Q2xhc3Nlcy5QQU5FTF9ISURERU4sICF0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpKTtcblxuXHRcdC8vIFByb3BhZ2F0ZSB0byBncmlkXG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKFxuXHRcdFx0dGhpcy5wYW5lbFBhcnRWaWV3LFxuXHRcdFx0dGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKSxcblx0XHQpO1xuXG5cdFx0Ly8gSWYgcGFuZWwgYmVjb21lcyBoaWRkZW4sIGFsc28gaGlkZSB0aGUgY3VycmVudCBhY3RpdmUgcGFuZSBjb21wb3NpdGVcblx0XHRpZiAoaGlkZGVuICYmIHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpKSB7XG5cdFx0XHR0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmhpZGVBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cblx0XHRcdC8vIEZvY3VzIHRoZSBjaGF0IGJhciB3aGVuIGhpZGluZyB0aGUgcGFuZWwgaWYgaXQgaGFkIGZvY3VzXG5cdFx0XHRpZiAocGFuZWxIYWRGb2N1cykge1xuXHRcdFx0XHR0aGlzLmZvY3VzUGFydChQYXJ0cy5TRVNTSU9OU19QQVJUKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBwYW5lbCBiZWNvbWVzIHZpc2libGUsIHNob3cgbGFzdCBhY3RpdmUgcGFuZWwgb3IgZGVmYXVsdCBhbmQgZm9jdXMgaXRcblx0XHRpZiAoIWhpZGRlbikge1xuXHRcdFx0aWYgKCF0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKSkge1xuXHRcdFx0XHRjb25zdCBwYW5lbFRvT3BlbiA9IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0TGFzdEFjdGl2ZVBhbmVDb21wb3NpdGVJZChWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpID8/XG5cdFx0XHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKT8uaWQ7XG5cdFx0XHRcdGlmIChwYW5lbFRvT3Blbikge1xuXHRcdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUocGFuZWxUb09wZW4sIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQSBjdXN0b20gdmlldyBpcyBzaG93aW5nIG92ZXIgdGhlIHBhbmVsLCBzbyBpdCBtdXN0IG5vdCB0YWtlIGZvY3VzLlxuXHRcdFx0aWYgKHRoaXMuX2VmZmVjdGl2ZVZpc2libGUoUGFydHMuUEFORUxfUEFSVCkpIHtcblx0XHRcdFx0dGhpcy5mb2N1c1BhcnQoUGFydHMuUEFORUxfUEFSVCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRTZXNzaW9uc0hpZGRlbihoaWRkZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wYXJ0VmlzaWJpbGl0eS5zZXNzaW9ucyA9PT0gIWhpZGRlbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucGFydFZpc2liaWxpdHkuc2Vzc2lvbnMgPSAhaGlkZGVuO1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuU0VTU0lPTlNfSElEREVOLCAhdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5TRVNTSU9OU19QQVJUKSk7XG5cblx0XHQvLyBQcm9wYWdhdGUgdG8gZ3JpZFxuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLnNlc3Npb25zUGFydFZpZXcsIHRoaXMuX2VmZmVjdGl2ZVZpc2libGUoUGFydHMuU0VTU0lPTlNfUEFSVCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3dzIG9yIGhpZGVzIHRoZSBjdXN0b20gdmlldyBncmlkLiBUaGUgY3VzdG9tIHZpZXcgZ3JpZCBhbmQgdGhlIHNlc3Npb25zXG5cdCAqIGdyaWQgYXJlIG11dHVhbGx5IGV4Y2x1c2l2ZSBhbmQgZXhhY3RseSBvbmUgb2YgdGhlbSBvd25zIHRoZSByb3csIHNvIGhpZGluZ1xuXHQgKiB0aGUgY3VzdG9tIHZpZXcgYWx3YXlzIGJyaW5ncyB0aGUgc2Vzc2lvbnMgZ3JpZCBiYWNrICh0b2dldGhlciB3aXRoIHRoZSBzaWRlXG5cdCAqIHBhbmVsIGFuZCBwYW5lbCBzdGF0ZSB0aGUgbGF5b3V0IHdhbnRzIGZvciB0aGUgYWN0aXZlIHNlc3Npb24pLiBUaGUgcGFydHMgaXRcblx0ICogY292ZXJzIGtlZXAgdGhlaXIgZGVzaXJlZCB2aXNpYmlsaXR5IHdoaWxlIGl0IGlzIHNob3duLCBzbyB0aGUgcmVzdG9yZVxuXHQgKiByZWZsZWN0cyB3aGF0ZXZlciB0aGUgbGF5b3V0IGNvbnRyb2xsZXIgbGFzdCBhc2tlZCBmb3IuXG5cdCAqL1xuXHRwcml2YXRlIF9hcHBseUN1c3RvbVZpZXdHcmlkVmlzaWJpbGl0eShkZXNjcmlwdG9yOiBJQ3VzdG9tVmlld0Rlc2NyaXB0b3IgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCB2aXNpYmxlID0gISFkZXNjcmlwdG9yO1xuXHRcdGlmICh0aGlzLnBhcnRWaXNpYmlsaXR5LmN1c3RvbVZpZXdHcmlkID09PSB2aXNpYmxlKSB7XG5cdFx0XHQvLyBTd2FwcGluZyBvbmUgY3VzdG9tIHZpZXcgZm9yIGFub3RoZXIgb25seSBjaGFuZ2VzIHdoYXQgaXMgcmVuZGVyZWQuXG5cdFx0XHR0aGlzLmN1c3RvbVZpZXdHcmlkUGFydFNlcnZpY2Uuc2V0VmlldyhkZXNjcmlwdG9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3YXNWaXNpYmxlID0gV29ya2JlbmNoLl9DVVNUT01fVklFV19FWENMVVNJVkVfUEFSVFMubWFwKHBhcnQgPT4gdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShwYXJ0KSk7XG5cblx0XHQvLyBBIG1heGltaXplZCBlZGl0b3Igb3ducyB0aGUgcm93IGluc3RlYWQgb2YgdGhlIHNlc3Npb25zIGdyaWQsIHdoaWNoIHdvdWxkXG5cdFx0Ly8gbGVhdmUgdGhlIHJvdyB3aXRob3V0IGFuIG93bmVyIG9uY2UgdGhlIGN1c3RvbSB2aWV3IGdvZXMgYXdheS5cblx0XHRpZiAodmlzaWJsZSAmJiB0aGlzLl9lZGl0b3JNYXhpbWl6ZWQpIHtcblx0XHRcdHRoaXMuc2V0RWRpdG9yTWF4aW1pemVkKGZhbHNlKTtcblx0XHR9XG5cblx0XHR0aGlzLmN1c3RvbVZpZXdHcmlkUGFydFNlcnZpY2Uuc2V0VmlldyhkZXNjcmlwdG9yKTtcblx0XHR0aGlzLnBhcnRWaXNpYmlsaXR5LmN1c3RvbVZpZXdHcmlkID0gdmlzaWJsZTtcblx0XHR0aGlzLl9jdXN0b21WaWV3VmlzaWJsZUtleS5zZXQodmlzaWJsZSk7XG5cblx0XHRpZiAoIXRoaXMud29ya2JlbmNoR3JpZCkge1xuXHRcdFx0cmV0dXJuOyAvLyBzdGlsbCBzdGFydGluZyB1cDsgdGhlIGdyaWQgZGVzY3JpcHRvciBwaWNrcyB0aGlzIHN0YXRlIHVwXG5cdFx0fVxuXG5cdFx0dGhpcy5fYXBwbHlpbmdDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBTdXNwZW5kZWQgc28gdGhlIHNpbmdsZS1wYW5lIHdpZHRoIHN5bmMgY2Fubm90IHJlYWQgdGhlIHRyYW5zaWVudCBub2RlXG5cdFx0XHQvLyB3aWR0aHMgYXMgYSBzYXNoIGRyYWcgYW5kIHdyaXRlIGJhY2sgdGhlIGRlc2lyZWQgdmlzaWJpbGl0eS5cblx0XHRcdHRoaXMuX3J1bldpdGhFZGl0b3JSZXNpemVTeW5jU3VzcGVuZGVkKCgpID0+IHtcblx0XHRcdFx0Ly8gT25lIHBhc3MsIHJldmVhbGluZyBiZWZvcmUgaGlkaW5nIHNvIHRoZSByb3cgbmV2ZXIgZ29lcyBlbXB0eSBpbiBiZXR3ZWVuLlxuXHRcdFx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLmN1c3RvbVZpZXdHcmlkUGFydFZpZXcsIHRydWUpO1xuXHRcdFx0XHRcdHRoaXMuX2FwcGx5RXhjbHVzaXZlUGFydFZpc2liaWxpdHkoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9hcHBseUV4Y2x1c2l2ZVBhcnRWaXNpYmlsaXR5KCk7XG5cdFx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKHRoaXMuY3VzdG9tVmlld0dyaWRQYXJ0VmlldywgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fYXBwbHlpbmdDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkgPSBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVFeGNsdXNpdmVMYXlvdXRDbGFzc2VzKCk7XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoTGF5b3V0Q2xhc3Nlcy5DVVNUT01fVklFV19HUklEX0hJRERFTiwgIXZpc2libGUpO1xuXHRcdHRoaXMuX3VwZGF0ZU1vYmlsZUN1c3RvbVZpZXdOYXZpZ2F0aW9uKCk7XG5cblx0XHQvLyBNaXJyb3IgdGhlIHJldmVhbC1iZWZvcmUtaGlkZSBvcmRlciBvZiB0aGUgZ3JpZCB1cGRhdGVzLlxuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9maXJlRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkoUGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJULCB0cnVlKTtcblx0XHR9XG5cdFx0V29ya2JlbmNoLl9DVVNUT01fVklFV19FWENMVVNJVkVfUEFSVFMuZm9yRWFjaCgocGFydCwgaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IG5vd1Zpc2libGUgPSB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKHBhcnQpO1xuXHRcdFx0aWYgKG5vd1Zpc2libGUgIT09IHdhc1Zpc2libGVbaW5kZXhdKSB7XG5cdFx0XHRcdHRoaXMuX2ZpcmVEaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eShwYXJ0LCBub3dWaXNpYmxlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdHRoaXMuX2ZpcmVEaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eShQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlQsIGZhbHNlKTtcblx0XHR9XG5cblx0XHR0aGlzLmxheW91dCgpO1xuXG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdHRoaXMuZm9jdXNQYXJ0KFBhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2Vzc2lvbnNQYXJ0U2VydmljZS5mb2N1c1Nlc3Npb24odGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlFeGNsdXNpdmVQYXJ0VmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy5zZXNzaW9uc1BhcnRWaWV3LCB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLlNFU1NJT05TX1BBUlQpKTtcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy5wYW5lbFBhcnRWaWV3LCB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpKTtcblx0XHR0aGlzLl9hcHBseUVkaXRvckFyZWFWaXNpYmlsaXR5KCk7XG5cdH1cblxuXHQvKiogUHVzaGVzIHRoZSBlZGl0b3IgYW5kIGF1eGlsaWFyeSBiYXIgbm9kZSB2aXNpYmlsaXR5IGludG8gdGhlIGdyaWQuICovXG5cdHByb3RlY3RlZCBfYXBwbHlFZGl0b3JBcmVhVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy5lZGl0b3JQYXJ0VmlldywgdGhpcy5fZWRpdG9yTm9kZVNob3VsZEJlVmlzaWJsZSgpKTtcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy5hdXhpbGlhcnlCYXJQYXJ0VmlldywgdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRXhjbHVzaXZlTGF5b3V0Q2xhc3NlcygpOiB2b2lkIHtcblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShMYXlvdXRDbGFzc2VzLlNFU1NJT05TX0hJRERFTiwgIXRoaXMuX2VmZmVjdGl2ZVZpc2libGUoUGFydHMuU0VTU0lPTlNfUEFSVCkpO1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuTUFJTl9FRElUT1JfQVJFQV9ISURERU4sICF0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJUKSk7XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoTGF5b3V0Q2xhc3Nlcy5BVVhJTElBUllCQVJfSElEREVOLCAhdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpO1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuUEFORUxfSElEREVOLCAhdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKSk7XG5cdFx0dGhpcy5fdXBkYXRlRWRpdG9yUGFuZVZpc2liaWxpdHlDbGFzcygpO1xuXHR9XG5cblx0LyoqIEtlZXBzIHRoZSBBbmRyb2lkIGJhY2sgYnV0dG9uIGluIHN5bmMgd2l0aCBhIHNob3duIGN1c3RvbSB2aWV3LiAqL1xuXHRwcml2YXRlIF91cGRhdGVNb2JpbGVDdXN0b21WaWV3TmF2aWdhdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0cmFja2VkID0gdGhpcy5sYXlvdXRQb2xpY3kudmlld3BvcnRDbGFzcy5nZXQoKSA9PT0gJ3Bob25lJyAmJiB0aGlzLnBhcnRWaXNpYmlsaXR5LmN1c3RvbVZpZXdHcmlkO1xuXHRcdGlmICh0cmFja2VkID09PSB0aGlzLm1vYmlsZU5hdlN0YWNrLmhhcygnY3VzdG9tVmlldycpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRyYWNrZWQpIHtcblx0XHRcdHRoaXMubW9iaWxlTmF2U3RhY2sucHVzaCgnY3VzdG9tVmlldycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1vYmlsZU5hdlN0YWNrLnBvcFNpbGVudGx5KCdjdXN0b21WaWV3Jyk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFBvc2l0aW9uIE1ldGhvZHMgKEZpeGVkIC0gTm90IENvbmZpZ3VyYWJsZSlcblxuXHRnZXRTaWRlQmFyUG9zaXRpb24oKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiBQb3NpdGlvbi5MRUZUOyAvLyBBbHdheXMgbGVmdCBpbiB0aGlzIGxheW91dFxuXHR9XG5cblx0Z2V0UGFuZWxQb3NpdGlvbigpOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIFBvc2l0aW9uLkJPVFRPTTsgLy8gQWx3YXlzIGJvdHRvbSBpbiB0aGlzIGxheW91dFxuXHR9XG5cblx0c2V0UGFuZWxQb3NpdGlvbihfcG9zaXRpb246IFBvc2l0aW9uKTogdm9pZCB7XG5cdFx0Ly8gTm8tb3A6IFBhbmVsIHBvc2l0aW9uIGlzIGZpeGVkIGluIHRoaXMgbGF5b3V0XG5cdH1cblxuXHRnZXRQYW5lbEFsaWdubWVudCgpOiBQYW5lbEFsaWdubWVudCB7XG5cdFx0cmV0dXJuICdqdXN0aWZ5JzsgLy8gRnVsbCB3aWR0aCBwYW5lbFxuXHR9XG5cblx0c2V0UGFuZWxBbGlnbm1lbnQoX2FsaWdubWVudDogUGFuZWxBbGlnbm1lbnQpOiB2b2lkIHtcblx0XHQvLyBOby1vcDogUGFuZWwgYWxpZ25tZW50IGlzIGZpeGVkIGluIHRoaXMgbGF5b3V0XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gU2l6ZSBNZXRob2RzXG5cblx0Z2V0U2l6ZShwYXJ0OiBQYXJ0cyk6IElWaWV3U2l6ZSB7XG5cdFx0aWYgKHBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYXV4aWxpYXJ5QmFyVmlld1NpemUoKTtcblx0XHR9XG5cdFx0Y29uc3QgdmlldyA9IHRoaXMuZ2V0UGFydFZpZXcocGFydCk7XG5cdFx0aWYgKCF2aWV3KSB7XG5cdFx0XHRyZXR1cm4geyB3aWR0aDogMCwgaGVpZ2h0OiAwIH07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodmlldyk7XG5cdH1cblxuXHRzZXRTaXplKHBhcnQ6IFBhcnRzLCBzaXplOiBJVmlld1NpemUpOiB2b2lkIHtcblx0XHRpZiAocGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpIHtcblx0XHRcdHRoaXMuX3NldEF1eGlsaWFyeUJhclZpZXdTaXplKHNpemUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB2aWV3ID0gdGhpcy5nZXRQYXJ0VmlldyhwYXJ0KTtcblx0XHRpZiAodmlldykge1xuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodmlldywgc2l6ZSk7XG5cdFx0fVxuXHR9XG5cblx0cmVzaXplUGFydChwYXJ0OiBQYXJ0cywgc2l6ZUNoYW5nZVdpZHRoOiBudW1iZXIsIHNpemVDaGFuZ2VIZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChwYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkge1xuXHRcdFx0dGhpcy5fcmVzaXplQXV4aWxpYXJ5QmFyQnkoc2l6ZUNoYW5nZVdpZHRoLCBzaXplQ2hhbmdlSGVpZ2h0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdmlldyA9IHRoaXMuZ2V0UGFydFZpZXcocGFydCk7XG5cdFx0aWYgKCF2aWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudFNpemUgPSB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodmlldyk7XG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodmlldywge1xuXHRcdFx0d2lkdGg6IGN1cnJlbnRTaXplLndpZHRoICsgc2l6ZUNoYW5nZVdpZHRoLFxuXHRcdFx0aGVpZ2h0OiBjdXJyZW50U2l6ZS5oZWlnaHQgKyBzaXplQ2hhbmdlSGVpZ2h0XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFBhcnRWaWV3KHBhcnQ6IFBhcnRzKTogSVNlcmlhbGl6YWJsZVZpZXcgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAocGFydCkge1xuXHRcdFx0Y2FzZSBQYXJ0cy5USVRMRUJBUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy50aXRsZUJhclBhcnRWaWV3O1xuXHRcdFx0Y2FzZSBQYXJ0cy5TSURFQkFSX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLnNpZGVCYXJQYXJ0Vmlldztcblx0XHRcdGNhc2UgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3O1xuXHRcdFx0Y2FzZSBQYXJ0cy5FRElUT1JfUEFSVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuZWRpdG9yUGFydFZpZXc7XG5cdFx0XHRjYXNlIFBhcnRzLlBBTkVMX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLnBhbmVsUGFydFZpZXc7XG5cdFx0XHRjYXNlIFBhcnRzLlNFU1NJT05TX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLnNlc3Npb25zUGFydFZpZXc7XG5cdFx0XHRjYXNlIFBhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuY3VzdG9tVmlld0dyaWRQYXJ0Vmlldztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0Z2V0TWF4aW11bUVkaXRvckRpbWVuc2lvbnMoX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGltZW5zaW9uIHtcblx0XHQvLyBSZXR1cm4gdGhlIGF2YWlsYWJsZSBzcGFjZSBmb3IgZWRpdG9yIChleGNsdWRpbmcgb3RoZXIgcGFydHMpXG5cdFx0Y29uc3Qgc2lkZWJhcldpZHRoID0gdGhpcy5wYXJ0VmlzaWJpbGl0eS5zaWRlYmFyID8gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuc2lkZUJhclBhcnRWaWV3KS53aWR0aCA6IDA7XG5cdFx0Y29uc3QgYXV4aWxpYXJ5QmFyV2lkdGggPSB0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhclxuXHRcdFx0PyB0aGlzLl9hdXhpbGlhcnlCYXJMYXlvdXRXaWR0aCgpXG5cdFx0XHQ6IDA7XG5cdFx0Y29uc3QgcGFuZWxIZWlnaHQgPSB0aGlzLnBhcnRWaXNpYmlsaXR5LnBhbmVsID8gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMucGFuZWxQYXJ0VmlldykuaGVpZ2h0IDogMDtcblx0XHRjb25zdCB0aXRsZUJhckhlaWdodCA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLnRpdGxlQmFyUGFydFZpZXcpLmhlaWdodDtcblxuXHRcdHJldHVybiBuZXcgRGltZW5zaW9uKFxuXHRcdFx0dGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCAtIHNpZGViYXJXaWR0aCAtIGF1eGlsaWFyeUJhcldpZHRoLFxuXHRcdFx0dGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgLSB0aXRsZUJhckhlaWdodCAtIHBhbmVsSGVpZ2h0XG5cdFx0KTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBVbnN1cHBvcnRlZCBGZWF0dXJlcyAoTm8tb3BzKVxuXG5cdHRvZ2dsZU1heGltaXplZFBhbmVsKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy53b3JrYmVuY2hHcmlkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNQYW5lbE1heGltaXplZCgpKSB7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuZXhpdE1heGltaXplZFZpZXcoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLm1heGltaXplVmlldyh0aGlzLnBhbmVsUGFydFZpZXcsIFt0aGlzLnRpdGxlQmFyUGFydFZpZXcsIHRoaXMuc2lkZUJhclBhcnRWaWV3XSk7XG5cdFx0fVxuXHR9XG5cblx0aXNQYW5lbE1heGltaXplZCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMud29ya2JlbmNoR3JpZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLndvcmtiZW5jaEdyaWQuaXNWaWV3TWF4aW1pemVkKHRoaXMucGFuZWxQYXJ0Vmlldyk7XG5cdH1cblxuXHR0b2dnbGVNYXhpbWl6ZWRBdXhpbGlhcnlCYXIoKTogdm9pZCB7XG5cdFx0Ly8gTm8tb3A6IE1heGltaXplIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBsYXlvdXRcblx0fVxuXG5cdHNldEF1eGlsaWFyeUJhck1heGltaXplZChfbWF4aW1pemVkOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlOyAvLyBNYXhpbWl6ZSBub3Qgc3VwcG9ydGVkXG5cdH1cblxuXHRpc0F1eGlsaWFyeUJhck1heGltaXplZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7IC8vIE1heGltaXplIG5vdCBzdXBwb3J0ZWRcblx0fVxuXG5cdGlzRWRpdG9yTWF4aW1pemVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3JNYXhpbWl6ZWQ7XG5cdH1cblxuXHRzZXRFZGl0b3JNYXhpbWl6ZWQobWF4aW1pemVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKG1heGltaXplZCA9PT0gdGhpcy5fZWRpdG9yTWF4aW1pemVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG1heGltaXplZCkge1xuXHRcdFx0Ly8gU2F2ZSBjdXJyZW50IHZpc2liaWxpdHkgc3RhdGVcblx0XHRcdHRoaXMuX2VkaXRvckxhc3ROb25NYXhpbWl6ZWRWaXNpYmlsaXR5ID0ge1xuXHRcdFx0XHRzaWRlYmFyOiB0aGlzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIsXG5cdFx0XHRcdGF1eGlsaWFyeUJhcjogdGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIsXG5cdFx0XHRcdGVkaXRvcjogdGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IsXG5cdFx0XHRcdHBhbmVsOiB0aGlzLnBhcnRWaXNpYmlsaXR5LnBhbmVsLFxuXHRcdFx0XHRzZXNzaW9uczogdGhpcy5wYXJ0VmlzaWJpbGl0eS5zZXNzaW9ucyxcblx0XHRcdFx0Y3VzdG9tVmlld0dyaWQ6IHRoaXMucGFydFZpc2liaWxpdHkuY3VzdG9tVmlld0dyaWQsXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBTYXZlIHRoZSBlZGl0b3IgcGFydCBzaXplIHNvIGl0IGNhbiBiZSByZXN0b3JlZCBvbiB1bi1tYXhpbWl6ZS5cblx0XHRcdC8vIFdoaWxlIG1heGltaXplZCB0aGUgbGF5b3V0IGNvbnRyb2xsZXIgZm9yY2VzIHRoZSBhdXhpbGlhcnkgYmFyXG5cdFx0XHQvLyAoQ2hhbmdlcykgdmlzaWJsZSwgd2hpY2ggc2hyaW5rcyB0aGUgZWRpdG9yOyB3aXRob3V0IHJlc3RvcmluZyB0aGVcblx0XHRcdC8vIHNpemUgdGhlIGVkaXRvciB3b3VsZCBub3QgcmV0dXJuIHRvIGl0cyBwcmV2aW91cyB3aWR0aC5cblx0XHRcdHRoaXMuX2VkaXRvckxhc3ROb25NYXhpbWl6ZWRTaXplID0gdGhpcy5lZGl0b3JQYXJ0Vmlld1xuXHRcdFx0XHQ/IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLmVkaXRvclBhcnRWaWV3KVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gRW5zdXJlIGVkaXRvciBpcyB2aXNpYmxlXG5cdFx0XHRpZiAoIXRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMuc2V0RWRpdG9ySGlkZGVuKGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSGlkZSBhbGwgb3RoZXIgY29udGVudCBwYXJ0c1xuXHRcdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhcikge1xuXHRcdFx0XHR0aGlzLnNldFNpZGVCYXJIaWRkZW4odHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5wYXJ0VmlzaWJpbGl0eS5zZXNzaW9ucykge1xuXHRcdFx0XHR0aGlzLnNldFNlc3Npb25zSGlkZGVuKHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9lZGl0b3JNYXhpbWl6ZWQgPSB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX2VkaXRvckxhc3ROb25NYXhpbWl6ZWRWaXNpYmlsaXR5O1xuXHRcdFx0Y29uc3Qgc2l6ZSA9IHRoaXMuX2VkaXRvckxhc3ROb25NYXhpbWl6ZWRTaXplO1xuXHRcdFx0dGhpcy5fZWRpdG9yTGFzdE5vbk1heGltaXplZFNpemUgPSB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIFJlc3RvcmUgcHJldmlvdXMgdmlzaWJpbGl0eSBzdGF0ZSwgaW5jbHVkaW5nIHRoZSBhdXhpbGlhcnkgYmFyXG5cdFx0XHQvLyAod2hpY2ggdGhlIGxheW91dCBjb250cm9sbGVyIGZvcmNlZCB2aXNpYmxlIHdoaWxlIG1heGltaXplZCkuXG5cdFx0XHR0aGlzLnNldFNpZGVCYXJIaWRkZW4oIXN0YXRlPy5zaWRlYmFyKTtcblx0XHRcdHRoaXMuc2V0U2Vzc2lvbnNIaWRkZW4oIXN0YXRlPy5zZXNzaW9ucyk7XG5cdFx0XHR0aGlzLnNldEF1eGlsaWFyeUJhckhpZGRlbighc3RhdGU/LmF1eGlsaWFyeUJhcik7XG5cblx0XHRcdHRoaXMuX2VkaXRvck1heGltaXplZCA9IGZhbHNlO1xuXG5cdFx0XHQvLyBSZXN0b3JlIHRoZSBlZGl0b3IgcGFydCB3aWR0aCBjYXB0dXJlZCBiZWZvcmUgbWF4aW1pemluZy5cblx0XHRcdGlmICh0aGlzLmVkaXRvclBhcnRWaWV3ICYmIHNpemUpIHtcblx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5lZGl0b3JQYXJ0Vmlldywgc2l6ZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sYXlvdXRTaWRlUGFuZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkLmZpcmUoKTtcblx0fVxuXG5cdHRvZ2dsZVplbk1vZGUoKTogdm9pZCB7XG5cdFx0Ly8gTm8tb3A6IFplbiBtb2RlIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBsYXlvdXRcblx0fVxuXG5cdHRvZ2dsZU1lbnVCYXIoKTogdm9pZCB7XG5cdFx0Ly8gTm8tb3A6IE1lbnUgYmFyIHRvZ2dsZSBub3Qgc3VwcG9ydGVkIGluIHRoaXMgbGF5b3V0XG5cdH1cblxuXHRpc01haW5FZGl0b3JMYXlvdXRDZW50ZXJlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7IC8vIENlbnRlcmVkIGxheW91dCBub3Qgc3VwcG9ydGVkXG5cdH1cblxuXHRjZW50ZXJNYWluRWRpdG9yTGF5b3V0KF9hY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBOby1vcDogQ2VudGVyZWQgbGF5b3V0IG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBsYXlvdXRcblx0fVxuXG5cdGhhc01haW5XaW5kb3dCb3JkZXIoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0TWFpbldpbmRvd0JvcmRlclJhZGl1cygpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gV2luZG93IE1heGltaXplZCBTdGF0ZVxuXG5cdGlzV2luZG93TWF4aW1pemVkKHRhcmdldFdpbmRvdzogV2luZG93KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubWF4aW1pemVkLmhhcyhnZXRXaW5kb3dJZCh0YXJnZXRXaW5kb3cpKTtcblx0fVxuXG5cdHVwZGF0ZVdpbmRvd01heGltaXplZFN0YXRlKHRhcmdldFdpbmRvdzogV2luZG93LCBtYXhpbWl6ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCB3aW5kb3dJZCA9IGdldFdpbmRvd0lkKHRhcmdldFdpbmRvdyk7XG5cdFx0aWYgKG1heGltaXplZCkge1xuXHRcdFx0dGhpcy5tYXhpbWl6ZWQuYWRkKHdpbmRvd0lkKTtcblx0XHRcdGlmICh0YXJnZXRXaW5kb3cgPT09IG1haW5XaW5kb3cpIHtcblx0XHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoTGF5b3V0Q2xhc3Nlcy5NQVhJTUlaRUQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1heGltaXplZC5kZWxldGUod2luZG93SWQpO1xuXHRcdFx0aWYgKHRhcmdldFdpbmRvdyA9PT0gbWFpbldpbmRvdykge1xuXHRcdFx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShMYXlvdXRDbGFzc2VzLk1BWElNSVpFRCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VXaW5kb3dNYXhpbWl6ZWQuZmlyZSh7IHdpbmRvd0lkLCBtYXhpbWl6ZWQgfSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTmVpZ2hib3IgUGFydHNcblxuXHRnZXRWaXNpYmxlTmVpZ2hib3JQYXJ0KHBhcnQ6IFBhcnRzLCBkaXJlY3Rpb246IERpcmVjdGlvbik6IFBhcnRzIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMud29ya2JlbmNoR3JpZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3ID0gdGhpcy5nZXRQYXJ0VmlldyhwYXJ0KTtcblx0XHRpZiAoIXZpZXcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmVpZ2hib3IgPSB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3LCBkaXJlY3Rpb24sIGZhbHNlKTtcblx0XHRpZiAobmVpZ2hib3IubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5laWdoYm9yVmlldyA9IG5laWdoYm9yWzBdO1xuXG5cdFx0aWYgKG5laWdoYm9yVmlldyA9PT0gdGhpcy50aXRsZUJhclBhcnRWaWV3KSB7XG5cdFx0XHRyZXR1cm4gUGFydHMuVElUTEVCQVJfUEFSVDtcblx0XHR9XG5cdFx0aWYgKG5laWdoYm9yVmlldyA9PT0gdGhpcy5zaWRlQmFyUGFydFZpZXcpIHtcblx0XHRcdHJldHVybiBQYXJ0cy5TSURFQkFSX1BBUlQ7XG5cdFx0fVxuXHRcdGlmIChuZWlnaGJvclZpZXcgPT09IHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpIHtcblx0XHRcdHJldHVybiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVDtcblx0XHR9XG5cdFx0aWYgKG5laWdoYm9yVmlldyA9PT0gdGhpcy5lZGl0b3JQYXJ0Vmlldykge1xuXHRcdFx0cmV0dXJuIFBhcnRzLkVESVRPUl9QQVJUO1xuXHRcdH1cblx0XHRpZiAobmVpZ2hib3JWaWV3ID09PSB0aGlzLnBhbmVsUGFydFZpZXcpIHtcblx0XHRcdHJldHVybiBQYXJ0cy5QQU5FTF9QQVJUO1xuXHRcdH1cblx0XHRpZiAobmVpZ2hib3JWaWV3ID09PSB0aGlzLnNlc3Npb25zUGFydFZpZXcpIHtcblx0XHRcdHJldHVybiBQYXJ0cy5TRVNTSU9OU19QQVJUO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUmVzdG9yZVxuXG5cdGlzUmVzdG9yZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmVzdG9yZWQ7XG5cdH1cblxuXHRzZXRSZXN0b3JlZCgpOiB2b2lkIHtcblx0XHR0aGlzLnJlc3RvcmVkID0gdHJ1ZTtcblx0XHR0aGlzLnJlc3RvcmVkUHJvbWlzZS5jb21wbGV0ZSgpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIE5vdGlmaWNhdGlvbnMgUmVnaXN0cmF0aW9uXG5cblx0cmVnaXN0ZXJOb3RpZmljYXRpb25zKGRlbGVnYXRlOiB7IG9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uc1Zpc2liaWxpdHk6IEV2ZW50PGJvb2xlYW4+IH0pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihkZWxlZ2F0ZS5vbkRpZENoYW5nZU5vdGlmaWNhdGlvbnNWaXNpYmlsaXR5KHZpc2libGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VOb3RpZmljYXRpb25zVmlzaWJpbGl0eS5maXJlKHZpc2libGUpKSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFTLFNBQVMsT0FBTyxxQ0FBcUM7QUFDOUQsU0FBUyx1QkFBdUIsbUJBQW1CLGtCQUFrQixlQUFlLGFBQWEsWUFBd0IsdUJBQXVCLGVBQWUsTUFBTSxXQUFXLHlCQUF5QjtBQUN6TSxTQUFTLGlCQUFpQix3QkFBd0I7QUFDbEQsU0FBUyxjQUFjLHVCQUF1QixVQUFVLFdBQVcsZ0JBQWdCO0FBQ25GLFNBQVMsWUFBWTtBQUNyQixTQUFTLG1CQUFtQixpQ0FBaUM7QUFDN0QsU0FBUyxXQUFXLFNBQVMsT0FBTyxVQUFVLG1CQUFtQjtBQUNqRSxTQUFTLE9BQU8sVUFBMEIseUJBQThGLHdCQUF3QjtBQUVoSyxTQUFTLFlBQVk7QUFDckIsU0FBeUcsYUFBYSx3QkFBd0I7QUFDOUksU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx3QkFBd0IsNkJBQTZCO0FBRTlELFNBQVMsdUJBQXVCLDhCQUFnRDtBQUNoRixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtCQUE4QjtBQUN2QyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLG1CQUFtQixzQkFBeUM7QUFDckUsU0FBUyxpQkFBaUIscUJBQXFCLGNBQWMscUJBQXFCO0FBQ2xGLFNBQW9DLDZCQUE2QjtBQUNqRSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLGVBQWUsOEJBQThCO0FBQ3RELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTBD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
