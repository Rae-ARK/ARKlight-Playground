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
import electron, { screen } from "electron";
import { DeferredPromise, RunOnceScheduler, timeout, Delayer } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { FileAccess, Schemas } from "../../../base/common/network.js";
import { getMarks, mark } from "../../../base/common/performance.js";
import { isTahoeOrNewer, isLinux, isMacintosh, isWindows } from "../../../base/common/platform.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { release } from "os";
import { IBackupMainService } from "../../backup/electron-main/backup.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IDialogMainService } from "../../dialogs/electron-main/dialogMainService.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { isLaunchedFromCli } from "../../environment/node/argvHelper.js";
import { IFileService } from "../../files/common/files.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { IProtocolMainService } from "../../protocol/electron-main/protocol.js";
import { resolveMarketplaceHeaders } from "../../externalServices/common/marketplace.js";
import { IApplicationStorageMainService, IStorageMainService } from "../../storage/electron-main/storageMainService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { IThemeMainService } from "../../theme/electron-main/themeMainService.js";
import { getMenuBarVisibility, hasNativeTitlebar, useNativeFullScreen, useWindowControlsOverlay, DEFAULT_CUSTOM_TITLEBAR_HEIGHT, TitlebarStyle, MenuSettings } from "../../window/common/window.js";
import { defaultBrowserWindowOptions, getAllWindowsExcludingOffscreen, IWindowsMainService, OpenContext, WindowStateValidator } from "./windows.js";
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, toWorkspaceIdentifier } from "../../workspace/common/workspace.js";
import { IWorkspacesManagementMainService } from "../../workspaces/electron-main/workspacesManagementMainService.js";
import { WindowMode, WindowError, LoadReason, defaultWindowState } from "../../window/electron-main/window.js";
import { IPolicyService } from "../../policy/common/policy.js";
import { IStateService } from "../../state/node/state.js";
import { IUserDataProfilesMainService } from "../../userDataProfile/electron-main/userDataProfile.js";
import { ILoggerMainService } from "../../log/electron-main/loggerService.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { errorHandler } from "../../../base/common/errors.js";
import { FocusMode } from "../../native/common/native.js";
import { Color } from "../../../base/common/color.js";
var ReadyState = /* @__PURE__ */ ((ReadyState2) => {
  ReadyState2[ReadyState2["NONE"] = 0] = "NONE";
  ReadyState2[ReadyState2["NAVIGATING"] = 1] = "NAVIGATING";
  ReadyState2[ReadyState2["READY"] = 2] = "READY";
  return ReadyState2;
})(ReadyState || {});
const _DockBadgeManager = class _DockBadgeManager {
  constructor() {
    this.windows = /* @__PURE__ */ new Set();
  }
  acquireBadge(window) {
    this.windows.add(window.id);
    electron.app.setBadgeCount(
      isLinux ? 1 : void 0
      /* generic dot */
    );
    return {
      dispose: () => {
        this.windows.delete(window.id);
        if (this.windows.size === 0) {
          electron.app.setBadgeCount(0);
        }
      }
    };
  }
};
_DockBadgeManager.INSTANCE = new _DockBadgeManager();
let DockBadgeManager = _DockBadgeManager;
const _BaseWindow = class _BaseWindow extends Disposable {
  constructor(configurationService, stateService, environmentMainService, logService) {
    super();
    this.configurationService = configurationService;
    this.stateService = stateService;
    this.environmentMainService = environmentMainService;
    this.logService = logService;
    //#region Events
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this._onDidMaximize = this._register(new Emitter());
    this.onDidMaximize = this._onDidMaximize.event;
    this._onDidUnmaximize = this._register(new Emitter());
    this.onDidUnmaximize = this._onDidUnmaximize.event;
    this._onDidTriggerSystemContextMenu = this._register(new Emitter());
    this.onDidTriggerSystemContextMenu = this._onDidTriggerSystemContextMenu.event;
    this._onDidEnterFullScreen = this._register(new Emitter());
    this.onDidEnterFullScreen = this._onDidEnterFullScreen.event;
    this._onDidLeaveFullScreen = this._register(new Emitter());
    this.onDidLeaveFullScreen = this._onDidLeaveFullScreen.event;
    this._onDidChangeAlwaysOnTop = this._register(new Emitter());
    this.onDidChangeAlwaysOnTop = this._onDidChangeAlwaysOnTop.event;
    this._lastFocusTime = Date.now();
    this._win = null;
    this.notifyFocusDisposable = this._register(new MutableDisposable());
    this.windowControlsDimmed = false;
    //#endregion
    //#region Fullscreen
    this.transientIsNativeFullScreen = void 0;
    this.joinNativeFullScreenTransition = void 0;
  }
  // window is shown on creation so take current time
  get lastFocusTime() {
    return this._lastFocusTime;
  }
  get win() {
    return this._win;
  }
  setWin(win, options) {
    this._win = win;
    this._register(Event.fromNodeEventEmitter(win, "maximize")(() => {
      if (isWindows && this.environmentMainService.enableRDPDisplayTracking && this._win) {
        const [x, y] = this._win.getPosition();
        const [width, height] = this._win.getSize();
        this.maximizedWindowState = { mode: WindowMode.Maximized, width, height, x, y };
        this.logService.debug(`Saved maximized window ${this.id} display state:`, this.maximizedWindowState);
      }
      this._onDidMaximize.fire();
    }));
    this._register(Event.fromNodeEventEmitter(win, "unmaximize")(() => {
      if (isWindows && this.environmentMainService.enableRDPDisplayTracking && this.maximizedWindowState) {
        this.maximizedWindowState = void 0;
        this.logService.debug(`Cleared maximized window ${this.id} state`);
      }
      this._onDidUnmaximize.fire();
    }));
    this._register(Event.fromNodeEventEmitter(win, "closed")(() => {
      this._onDidClose.fire();
      this.dispose();
    }));
    this._register(Event.fromNodeEventEmitter(win, "focus")(() => {
      this.clearNotifyFocus();
      this._lastFocusTime = Date.now();
    }));
    this._register(Event.fromNodeEventEmitter(this._win, "enter-full-screen")(() => this._onDidEnterFullScreen.fire()));
    this._register(Event.fromNodeEventEmitter(this._win, "leave-full-screen")(() => this._onDidLeaveFullScreen.fire()));
    this._register(Event.fromNodeEventEmitter(this._win, "always-on-top-changed", (_, alwaysOnTop) => alwaysOnTop)((alwaysOnTop) => this._onDidChangeAlwaysOnTop.fire(alwaysOnTop)));
    const useCustomTitleStyle = !hasNativeTitlebar(
      this.configurationService,
      options?.titleBarStyle === "hidden" ? TitlebarStyle.CUSTOM : void 0
      /* unknown */
    );
    if (isMacintosh && useCustomTitleStyle) {
      win.setSheetOffset(isTahoeOrNewer(release()) ? 32 : 28);
    }
    if (useCustomTitleStyle && useWindowControlsOverlay(this.configurationService)) {
      const cachedWindowControlHeight = this.stateService.getItem(_BaseWindow.windowControlHeightStateStorageKey);
      if (cachedWindowControlHeight) {
        this.updateWindowControls({ height: cachedWindowControlHeight });
      } else {
        this.updateWindowControls({ height: DEFAULT_CUSTOM_TITLEBAR_HEIGHT });
      }
    }
    if ((isWindows || isLinux) && useCustomTitleStyle) {
      this._register(Event.fromNodeEventEmitter(win, "system-context-menu", (event, point) => ({ event, point }))((e) => {
        const [x, y] = win.getPosition();
        const cursorPos = electron.screen.screenToDipPoint(e.point);
        const cx = Math.floor(cursorPos.x) - x;
        const cy = Math.floor(cursorPos.y) - y;
        if (isLinux) {
          if (cx > 35) {
            e.event.preventDefault();
            this._onDidTriggerSystemContextMenu.fire({ x: cx, y: cy });
          }
        }
      }));
    }
    if (this.environmentMainService.args["open-devtools"] === true) {
      win.webContents.openDevTools();
    }
    if (isMacintosh) {
      this._register(this.onDidEnterFullScreen(() => {
        this.joinNativeFullScreenTransition?.complete(true);
      }));
      this._register(this.onDidLeaveFullScreen(() => {
        this.joinNativeFullScreenTransition?.complete(true);
      }));
    }
    if (isWindows && this.environmentMainService.enableRDPDisplayTracking) {
      this._register(Event.fromNodeEventEmitter(screen, "display-added", (event, display) => ({ event, display }))((e) => {
        this.onDisplayAdded(e.display);
      }));
    }
  }
  onDisplayAdded(display) {
    const state = this.maximizedWindowState;
    if (state && this._win && WindowStateValidator.validateWindowStateOnDisplay(state, display)) {
      this.logService.debug(`Setting maximized window ${this.id} bounds to match newly added display`, state);
      this._win.setBounds(state);
    }
  }
  applyState(state, hasMultipleDisplays = electron.screen.getAllDisplays().length > 0) {
    const windowSettings = this.configurationService.getValue("window");
    const useNativeTabs = isMacintosh && windowSettings?.nativeTabs === true;
    if ((isMacintosh || isWindows) && hasMultipleDisplays && (!useNativeTabs || getAllWindowsExcludingOffscreen().length === 1)) {
      if ([state.width, state.height, state.x, state.y].every((value) => typeof value === "number")) {
        this._win?.setBounds({
          width: state.width,
          height: state.height,
          x: state.x,
          y: state.y
        });
      }
    }
    if (state.mode === WindowMode.Maximized || state.mode === WindowMode.Fullscreen) {
      this._win?.maximize();
      if (state.mode === WindowMode.Fullscreen) {
        this.setFullScreen(true, true);
      }
      this._win?.show();
    }
  }
  setRepresentedFilename(filename) {
    if (isMacintosh) {
      this.win?.setRepresentedFilename(filename);
    } else {
      this.representedFilename = filename;
    }
  }
  getRepresentedFilename() {
    if (isMacintosh) {
      return this.win?.getRepresentedFilename();
    }
    return this.representedFilename;
  }
  setDocumentEdited(edited) {
    if (isMacintosh) {
      this.win?.setDocumentEdited(edited);
    }
    this.documentEdited = edited;
  }
  isDocumentEdited() {
    if (isMacintosh) {
      return Boolean(this.win?.isDocumentEdited());
    }
    return !!this.documentEdited;
  }
  focus(options) {
    switch (options?.mode ?? FocusMode.Transfer) {
      case FocusMode.Transfer:
        this.doFocusWindow();
        break;
      case FocusMode.Notify:
        this.showNotifyFocus();
        break;
      case FocusMode.Force:
        if (isMacintosh) {
          electron.app.focus({ steal: true });
        }
        this.doFocusWindow();
        break;
    }
  }
  showNotifyFocus() {
    const disposables = new DisposableStore();
    this.notifyFocusDisposable.value = disposables;
    disposables.add(DockBadgeManager.INSTANCE.acquireBadge(this));
    if (isWindows || isLinux) {
      this.win?.flashFrame(true);
      disposables.add(toDisposable(() => this.win?.flashFrame(false)));
    } else if (isMacintosh) {
      electron.app.dock?.bounce("informational");
    }
  }
  clearNotifyFocus() {
    this.notifyFocusDisposable.clear();
  }
  doFocusWindow() {
    const win = this.win;
    if (!win) {
      return;
    }
    if (win.isMinimized()) {
      win.restore();
    }
    win.focus();
    win.webContents.focus();
  }
  updateWindowControls(options) {
    const win = this.win;
    if (!win) {
      return;
    }
    if (options.height) {
      this.stateService.setItem(CodeWindow.windowControlHeightStateStorageKey, options.height);
    }
    if (!isMacintosh && useWindowControlsOverlay(this.configurationService)) {
      if (options.dimmed !== void 0) {
        this.windowControlsDimmed = options.dimmed;
      }
      const backgroundColor = options.backgroundColor ?? this.lastWindowControlColors?.backgroundColor;
      const foregroundColor = options.foregroundColor ?? this.lastWindowControlColors?.foregroundColor;
      if (options.backgroundColor !== void 0 || options.foregroundColor !== void 0) {
        this.lastWindowControlColors = { backgroundColor, foregroundColor };
      }
      const effectiveBackgroundColor = this.windowControlsDimmed && backgroundColor ? this.dimColor(backgroundColor) : backgroundColor;
      const effectiveForegroundColor = this.windowControlsDimmed && foregroundColor ? this.dimColor(foregroundColor) : foregroundColor;
      win.setTitleBarOverlay({
        color: effectiveBackgroundColor?.trim() === "" ? void 0 : effectiveBackgroundColor,
        symbolColor: effectiveForegroundColor?.trim() === "" ? void 0 : effectiveForegroundColor,
        height: options.height ? options.height - 1 : void 0
        // account for window border
      });
    } else if (isMacintosh && options.height !== void 0) {
      const buttonHeight = isTahoeOrNewer(release()) ? 14 : 16;
      const offset = Math.floor((options.height - buttonHeight) / 2);
      if (!offset) {
        win.setWindowButtonPosition(null);
      } else {
        win.setWindowButtonPosition({ x: offset + 1, y: offset });
      }
    }
  }
  dimColor(color) {
    const parsed = Color.Format.CSS.parse(color);
    if (!parsed) {
      return color;
    }
    const dimFactor = 0.5;
    const r = Math.round(parsed.rgba.r * dimFactor);
    const g = Math.round(parsed.rgba.g * dimFactor);
    const b = Math.round(parsed.rgba.b * dimFactor);
    return `rgb(${r}, ${g}, ${b})`;
  }
  toggleFullScreen() {
    this.setFullScreen(!this.isFullScreen, false);
  }
  setFullScreen(fullscreen, fromRestore) {
    if (useNativeFullScreen(this.configurationService)) {
      this.setNativeFullScreen(fullscreen, fromRestore);
    } else {
      this.setSimpleFullScreen(fullscreen);
    }
  }
  get isFullScreen() {
    if (isMacintosh && typeof this.transientIsNativeFullScreen === "boolean") {
      return this.transientIsNativeFullScreen;
    }
    const win = this.win;
    const isFullScreen = win?.isFullScreen();
    const isSimpleFullScreen = win?.isSimpleFullScreen();
    return Boolean(isFullScreen || isSimpleFullScreen);
  }
  setNativeFullScreen(fullscreen, fromRestore) {
    const win = this.win;
    if (win?.isSimpleFullScreen()) {
      win?.setSimpleFullScreen(false);
    }
    this.doSetNativeFullScreen(fullscreen, fromRestore);
  }
  doSetNativeFullScreen(fullscreen, fromRestore) {
    if (isMacintosh) {
      this.transientIsNativeFullScreen = fullscreen;
      const joinNativeFullScreenTransition = this.joinNativeFullScreenTransition = new DeferredPromise();
      (async () => {
        const transitioned = await Promise.race([
          joinNativeFullScreenTransition.p,
          timeout(1e4).then(() => false)
        ]);
        if (this.joinNativeFullScreenTransition !== joinNativeFullScreenTransition) {
          return;
        }
        this.transientIsNativeFullScreen = void 0;
        this.joinNativeFullScreenTransition = void 0;
        if (!transitioned && fullscreen && fromRestore && this.win && !this.win.isFullScreen()) {
          this.logService.warn("window: native macOS fullscreen transition did not happen within 10s from restoring");
          this._onDidLeaveFullScreen.fire();
        }
      })();
    }
    const win = this.win;
    win?.setFullScreen(fullscreen);
  }
  setSimpleFullScreen(fullscreen) {
    const win = this.win;
    if (win?.isFullScreen()) {
      this.doSetNativeFullScreen(false, false);
    }
    win?.setSimpleFullScreen(fullscreen);
    win?.webContents.focus();
  }
  dispose() {
    super.dispose();
    this._win = null;
  }
};
//#region Window Control Overlays
_BaseWindow.windowControlHeightStateStorageKey = "windowControlHeight";
let BaseWindow = _BaseWindow;
let CodeWindow = class extends BaseWindow {
  constructor(config, logService, loggerMainService, environmentMainService, policyService, userDataProfilesService, fileService, applicationStorageMainService, storageMainService, configurationService, themeMainService, workspacesManagementMainService, backupMainService, telemetryService, dialogMainService, lifecycleMainService, productService, protocolMainService, windowsMainService, stateService, instantiationService) {
    super(configurationService, stateService, environmentMainService, logService);
    this.loggerMainService = loggerMainService;
    this.policyService = policyService;
    this.userDataProfilesService = userDataProfilesService;
    this.fileService = fileService;
    this.applicationStorageMainService = applicationStorageMainService;
    this.storageMainService = storageMainService;
    this.themeMainService = themeMainService;
    this.workspacesManagementMainService = workspacesManagementMainService;
    this.backupMainService = backupMainService;
    this.telemetryService = telemetryService;
    this.dialogMainService = dialogMainService;
    this.lifecycleMainService = lifecycleMainService;
    this.productService = productService;
    this.windowsMainService = windowsMainService;
    //#region Events
    this._onWillLoad = this._register(new Emitter());
    this.onWillLoad = this._onWillLoad.event;
    this._onDidSignalReady = this._register(new Emitter());
    this.onDidSignalReady = this._onDidSignalReady.event;
    this._onDidDestroy = this._register(new Emitter());
    this.onDidDestroy = this._onDidDestroy.event;
    this.whenReadyCallbacks = [];
    this.touchBarGroups = [];
    this.currentHttpProxy = void 0;
    this.currentNoProxy = void 0;
    this.customZoomLevel = void 0;
    this.wasLoaded = false;
    this.readyState = 0 /* NONE */;
    this.swipeListenerDisposable = this._register(new MutableDisposable());
    {
      this.configObjectUrl = this._register(protocolMainService.createIPCObjectUrl());
      const [state, hasMultipleDisplays] = this.restoreWindowState(config.state);
      this.windowState = state;
      this.logService.trace("window#ctor: using window state", state);
      const webPreferences = {
        preload: FileAccess.asFileUri("vs/base/parts/sandbox/electron-browser/preload.js").fsPath,
        additionalArguments: [`--vscode-window-config=${this.configObjectUrl.resource.toString()}`],
        v8CacheOptions: this.environmentMainService.useCodeCache ? "bypassHeatCheck" : "none"
      };
      if (config.isSessionsWindow) {
        webPreferences.backgroundThrottling = false;
      }
      const options = instantiationService.invokeFunction(defaultBrowserWindowOptions, this.windowState, void 0, webPreferences);
      mark("code/willCreateCodeBrowserWindow");
      this._win = new electron.BrowserWindow(options);
      mark("code/didCreateCodeBrowserWindow");
      this._id = this._win.id;
      this.setWin(this._win, options);
      this.applyState(this.windowState, hasMultipleDisplays);
      this._lastFocusTime = Date.now();
    }
    let sampleInterval = parseInt(this.environmentMainService.args["unresponsive-sample-interval"] || "1000");
    let samplePeriod = parseInt(this.environmentMainService.args["unresponsive-sample-period"] || "15000");
    if (sampleInterval <= 0 || samplePeriod <= 0 || sampleInterval > samplePeriod) {
      this.logService.warn(`Invalid unresponsive sample interval (${sampleInterval}ms) or period (${samplePeriod}ms), using defaults.`);
      sampleInterval = 1e3;
      samplePeriod = 15e3;
    }
    this.jsCallStackMap = /* @__PURE__ */ new Map();
    this.jsCallStackEffectiveSampleCount = Math.round(samplePeriod / sampleInterval);
    this.jsCallStackCollector = this._register(new Delayer(sampleInterval));
    this.jsCallStackCollectorStopScheduler = this._register(new RunOnceScheduler(() => {
      this.stopCollectingJScallStacks();
    }, samplePeriod));
    this.onConfigurationUpdated();
    this.createTouchBar();
    this.registerListeners();
  }
  get id() {
    return this._id;
  }
  get backupPath() {
    return this._config?.backupPath;
  }
  get openedWorkspace() {
    return this._config?.workspace;
  }
  get profile() {
    if (!this.config) {
      return void 0;
    }
    const profile = this.userDataProfilesService.profiles.find((profile2) => profile2.id === this.config?.profiles.profile.id);
    if (this.isExtensionDevelopmentHost && profile) {
      return profile;
    }
    return this.userDataProfilesService.getProfileForWorkspace(this.config.workspace ?? toWorkspaceIdentifier(this.backupPath, this.isExtensionDevelopmentHost)) ?? this.userDataProfilesService.defaultProfile;
  }
  get remoteAuthority() {
    return this._config?.remoteAuthority;
  }
  get config() {
    return this._config;
  }
  get isExtensionDevelopmentHost() {
    return !!this._config?.extensionDevelopmentPath;
  }
  get isExtensionTestHost() {
    return !!this._config?.extensionTestsPath;
  }
  get isExtensionDevelopmentTestFromCli() {
    return this.isExtensionDevelopmentHost && this.isExtensionTestHost && !this._config?.debugId;
  }
  setReady() {
    this.logService.trace(`window#load: window reported ready (id: ${this._id})`);
    this.readyState = 2 /* READY */;
    while (this.whenReadyCallbacks.length) {
      this.whenReadyCallbacks.pop()(this);
    }
    this._onDidSignalReady.fire();
  }
  ready() {
    return new Promise((resolve) => {
      if (this.isReady) {
        return resolve(this);
      }
      this.whenReadyCallbacks.push(resolve);
    });
  }
  get isReady() {
    return this.readyState === 2 /* READY */;
  }
  get whenClosedOrLoaded() {
    return new Promise((resolve) => {
      function handle() {
        closeListener.dispose();
        loadListener.dispose();
        resolve();
      }
      const closeListener = this.onDidClose(() => handle());
      const loadListener = this.onWillLoad(() => handle());
    });
  }
  registerListeners() {
    this._register(Event.fromNodeEventEmitter(this._win, "unresponsive")(() => this.onWindowError(WindowError.UNRESPONSIVE)));
    this._register(Event.fromNodeEventEmitter(this._win, "responsive")(() => this.onWindowError(WindowError.RESPONSIVE)));
    this._register(Event.fromNodeEventEmitter(this._win.webContents, "render-process-gone", (event, details) => details)((details) => this.onWindowError(WindowError.PROCESS_GONE, { ...details })));
    this._register(Event.fromNodeEventEmitter(this._win.webContents, "did-fail-load", (event, exitCode, reason) => ({ exitCode, reason }))(({ exitCode, reason }) => this.onWindowError(WindowError.LOAD, { reason, exitCode })));
    this._register(Event.fromNodeEventEmitter(this._win.webContents, "will-prevent-unload")((event) => event.preventDefault()));
    this._register(Event.fromNodeEventEmitter(this._win.webContents, "did-finish-load")(() => {
      if (this.pendingLoadConfig) {
        this._config = this.pendingLoadConfig;
        this.pendingLoadConfig = void 0;
      }
    }));
    this._register(this.onDidMaximize(() => {
      if (this._config) {
        this._config.maximized = true;
      }
    }));
    this._register(this.onDidUnmaximize(() => {
      if (this._config) {
        this._config.maximized = false;
      }
    }));
    this._register(this.onDidEnterFullScreen(() => {
      this.sendWhenReady("vscode:enterFullScreen", CancellationToken.None);
    }));
    this._register(this.onDidLeaveFullScreen(() => {
      this.sendWhenReady("vscode:leaveFullScreen", CancellationToken.None);
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
    this._register(this.workspacesManagementMainService.onDidDeleteUntitledWorkspace((e) => this.onDidDeleteUntitledWorkspace(e)));
    const urls = ["https://*.vsassets.io/*"];
    if (this.productService.extensionsGallery?.serviceUrl) {
      const serviceUrl = URI.parse(this.productService.extensionsGallery.serviceUrl);
      urls.push(`${serviceUrl.scheme}://${serviceUrl.authority}/*`);
    }
    this._win.webContents.session.webRequest.onBeforeSendHeaders({ urls }, async (details, cb) => {
      const headers = await this.getMarketplaceHeaders();
      cb({ cancel: false, requestHeaders: Object.assign(details.requestHeaders, headers) });
    });
  }
  getMarketplaceHeaders() {
    if (!this.marketplaceHeadersPromise) {
      this.marketplaceHeadersPromise = resolveMarketplaceHeaders(
        this.productService.version,
        this.productService,
        this.environmentMainService,
        this.configurationService,
        this.fileService,
        this.applicationStorageMainService,
        this.telemetryService
      );
    }
    return this.marketplaceHeadersPromise;
  }
  async onWindowError(type, details) {
    switch (type) {
      case WindowError.PROCESS_GONE:
        this.logService.error(`CodeWindow: renderer process gone (reason: ${details?.reason || "<unknown>"}, code: ${details?.exitCode || "<unknown>"})`);
        break;
      case WindowError.UNRESPONSIVE:
        this.logService.error("CodeWindow: detected unresponsive");
        break;
      case WindowError.RESPONSIVE:
        this.logService.error("CodeWindow: recovered from unresponsive");
        break;
      case WindowError.LOAD:
        this.logService.error(`CodeWindow: failed to load (reason: ${details?.reason || "<unknown>"}, code: ${details?.exitCode || "<unknown>"})`);
        break;
    }
    this.telemetryService.publicLog2("windowerror", {
      type,
      reason: details?.reason,
      code: details?.exitCode
    });
    switch (type) {
      case WindowError.UNRESPONSIVE:
      case WindowError.PROCESS_GONE:
        if (this.isExtensionDevelopmentTestFromCli) {
          this.lifecycleMainService.kill(1);
          return;
        }
        if (this.environmentMainService.args["enable-smoke-test-driver"]) {
          await this.destroyWindow(false, false);
          this.lifecycleMainService.quit();
          return;
        }
        if (type === WindowError.UNRESPONSIVE) {
          if (this.isExtensionDevelopmentHost || this.isExtensionTestHost || this._win?.webContents?.isDevToolsOpened()) {
            return;
          }
          this.jsCallStackCollector.trigger(() => this.startCollectingJScallStacks());
          this.jsCallStackCollectorStopScheduler.schedule();
          const { response, checkboxChecked } = await this.dialogMainService.showMessageBox({
            type: "warning",
            buttons: [
              localize({ key: "reopen", comment: ["&& denotes a mnemonic"] }, "&&Reopen"),
              localize({ key: "close", comment: ["&& denotes a mnemonic"] }, "&&Close"),
              localize({ key: "wait", comment: ["&& denotes a mnemonic"] }, "&&Keep Waiting")
            ],
            message: localize("appStalled", "The window is not responding"),
            detail: localize("appStalledDetail", "You can reopen or close the window or keep waiting."),
            checkboxLabel: this._config?.workspace ? localize("doNotRestoreEditors", "Don't restore editors") : void 0
          }, this._win);
          if (response !== 2) {
            const reopen = response === 0;
            this.stopCollectingJScallStacks();
            await this.destroyWindow(reopen, checkboxChecked);
          }
        } else if (type === WindowError.PROCESS_GONE) {
          let message;
          if (!details) {
            message = localize("appGone", "The window terminated unexpectedly");
          } else {
            message = localize("appGoneDetails", "The window terminated unexpectedly (reason: '{0}', code: '{1}')", details.reason, details.exitCode ?? "<unknown>");
          }
          const { response, checkboxChecked } = await this.dialogMainService.showMessageBox({
            type: "warning",
            buttons: [
              this._config?.workspace ? localize({ key: "reopen", comment: ["&& denotes a mnemonic"] }, "&&Reopen") : localize({ key: "newWindow", comment: ["&& denotes a mnemonic"] }, "&&New Window"),
              localize({ key: "close", comment: ["&& denotes a mnemonic"] }, "&&Close")
            ],
            message,
            detail: this._config?.workspace ? localize("appGoneDetailWorkspace", "We are sorry for the inconvenience. You can reopen the window to continue where you left off.") : localize("appGoneDetailEmptyWindow", "We are sorry for the inconvenience. You can open a new empty window to start again."),
            checkboxLabel: this._config?.workspace ? localize("doNotRestoreEditors", "Don't restore editors") : void 0
          }, this._win);
          const reopen = response === 0;
          await this.destroyWindow(reopen, checkboxChecked);
        }
        break;
      case WindowError.RESPONSIVE:
        this.stopCollectingJScallStacks();
        break;
    }
  }
  async destroyWindow(reopen, skipRestoreEditors) {
    const workspace = this._config?.workspace;
    if (skipRestoreEditors && workspace) {
      try {
        const workspaceStorage = this.storageMainService.workspaceStorage(workspace);
        await workspaceStorage.init();
        workspaceStorage.delete("memento/workbench.parts.editor");
        await workspaceStorage.close();
      } catch (error) {
        this.logService.error(error);
      }
    }
    this._onDidDestroy.fire();
    try {
      if (reopen && this._config) {
        let uriToOpen = void 0;
        let forceEmpty = void 0;
        if (isSingleFolderWorkspaceIdentifier(workspace)) {
          uriToOpen = { folderUri: workspace.uri };
        } else if (isWorkspaceIdentifier(workspace)) {
          uriToOpen = { workspaceUri: workspace.configPath };
        } else {
          forceEmpty = true;
        }
        const window = (await this.windowsMainService.open({
          context: OpenContext.API,
          userEnv: this._config.userEnv,
          cli: {
            ...this.environmentMainService.args,
            _: []
            // we pass in the workspace to open explicitly via `urisToOpen`
          },
          urisToOpen: uriToOpen ? [uriToOpen] : void 0,
          forceEmpty,
          forceNewWindow: true,
          remoteAuthority: this.remoteAuthority
        })).at(0);
        window?.focus();
      }
    } finally {
      this._win?.destroy();
    }
  }
  onDidDeleteUntitledWorkspace(workspace) {
    if (this._config?.workspace?.id === workspace.id) {
      this._config.workspace = void 0;
    }
  }
  onConfigurationUpdated(e) {
    if (isMacintosh && (!e || e.affectsConfiguration("workbench.editor.swipeToNavigate"))) {
      const swipeToNavigate = this.configurationService.getValue("workbench.editor.swipeToNavigate");
      if (swipeToNavigate) {
        this.registerSwipeListener();
      } else {
        this.swipeListenerDisposable.clear();
      }
    }
    if (!e || e.affectsConfiguration(MenuSettings.MenuBarVisibility)) {
      const newMenuBarVisibility = this.getMenuBarVisibility();
      if (newMenuBarVisibility !== this.currentMenuBarVisibility) {
        this.currentMenuBarVisibility = newMenuBarVisibility;
        this.setMenuBarVisibility(newMenuBarVisibility);
      }
    }
    if (!e || e.affectsConfiguration("http.proxy") || e.affectsConfiguration("http.noProxy")) {
      const inspect = this.configurationService.inspect("http.proxy");
      let newHttpProxy = (inspect.userLocalValue || "").trim() || (process.env["https_proxy"] || process.env["HTTPS_PROXY"] || process.env["http_proxy"] || process.env["HTTP_PROXY"] || "").trim() || void 0;
      if (newHttpProxy?.indexOf("@") !== -1) {
        const uri = URI.parse(newHttpProxy);
        const i = uri.authority.indexOf("@");
        if (i !== -1) {
          newHttpProxy = uri.with({ authority: uri.authority.substring(i + 1) }).toString();
        }
      }
      if (newHttpProxy?.endsWith("/")) {
        newHttpProxy = newHttpProxy.substr(0, newHttpProxy.length - 1);
      }
      const newNoProxy = (this.configurationService.getValue("http.noProxy") || []).map((item) => item.trim()).join(",") || (process.env["no_proxy"] || process.env["NO_PROXY"] || "").trim() || void 0;
      if ((newHttpProxy || "").indexOf("@") === -1 && (newHttpProxy !== this.currentHttpProxy || newNoProxy !== this.currentNoProxy)) {
        this.currentHttpProxy = newHttpProxy;
        this.currentNoProxy = newNoProxy;
        const proxyRules = newHttpProxy || "";
        const proxyBypassRules = newNoProxy ? `${newNoProxy},<local>` : "<local>";
        this.logService.trace(`Setting proxy to '${proxyRules}', bypassing '${proxyBypassRules}'`);
        this._win.webContents.session.setProxy({ proxyRules, proxyBypassRules, pacScript: "" });
        electron.app.setProxy({ proxyRules, proxyBypassRules, pacScript: "" });
      }
    }
  }
  registerSwipeListener() {
    this.swipeListenerDisposable.value = Event.fromNodeEventEmitter(this._win, "swipe", (event, cmd) => cmd)((cmd) => {
      if (!this.isReady) {
        return;
      }
      if (cmd === "left") {
        this.send("vscode:runAction", { id: "workbench.action.openPreviousRecentlyUsedEditor", from: "mouse" });
      } else if (cmd === "right") {
        this.send("vscode:runAction", { id: "workbench.action.openNextRecentlyUsedEditor", from: "mouse" });
      }
    });
  }
  addTabbedWindow(window) {
    if (isMacintosh && window.win) {
      this._win.addTabbedWindow(window.win);
    }
  }
  load(configuration, options = /* @__PURE__ */ Object.create(null)) {
    this.logService.trace(`window#load: attempt to load window (id: ${this._id})`);
    if (this.isDocumentEdited()) {
      if (!options.isReload || !this.backupMainService.isHotExitEnabled()) {
        this.setDocumentEdited(false);
      }
    }
    if (!options.isReload) {
      if (this.getRepresentedFilename()) {
        this.setRepresentedFilename("");
      }
      this._win.setTitle(this.productService.nameLong);
    }
    this.updateConfiguration(configuration, options);
    if (this.readyState === 0 /* NONE */) {
      this._config = configuration;
    } else {
      this.pendingLoadConfig = configuration;
    }
    this.readyState = 1 /* NAVIGATING */;
    let windowUrl;
    if (process.env.VSCODE_DEV && process.env.VSCODE_DEV_SERVER_URL) {
      windowUrl = process.env.VSCODE_DEV_SERVER_URL;
    } else if (configuration.isSessionsWindow) {
      windowUrl = FileAccess.asBrowserUri(`vs/sessions/electron-browser/sessions${this.environmentMainService.isBuilt ? "" : "-dev"}.html`).toString(true);
    } else {
      windowUrl = FileAccess.asBrowserUri(`vs/code/electron-browser/workbench/workbench${this.environmentMainService.isBuilt ? "" : "-dev"}.html`).toString(true);
    }
    this._win.loadURL(windowUrl);
    const wasLoaded = this.wasLoaded;
    this.wasLoaded = true;
    if (!this.environmentMainService.isBuilt && !this.environmentMainService.extensionTestsLocationURI) {
      this._register(new RunOnceScheduler(() => {
        if (this._win && !this._win.isVisible() && !this._win.isMinimized()) {
          this._win.show();
          this.focus({ mode: FocusMode.Force });
          this._win.webContents.openDevTools();
        }
      }, 1e4)).schedule();
    }
    this._onWillLoad.fire({ workspace: configuration.workspace, reason: options.isReload ? LoadReason.RELOAD : wasLoaded ? LoadReason.LOAD : LoadReason.INITIAL });
  }
  updateConfiguration(configuration, options) {
    const currentUserEnv = (this._config ?? this.pendingLoadConfig)?.userEnv;
    if (currentUserEnv) {
      const shouldPreserveLaunchCliEnvironment = isLaunchedFromCli(currentUserEnv) && !isLaunchedFromCli(configuration.userEnv);
      const shouldPreserveDebugEnvironmnet = this.isExtensionDevelopmentHost;
      if (shouldPreserveLaunchCliEnvironment || shouldPreserveDebugEnvironmnet) {
        configuration.userEnv = { ...currentUserEnv, ...configuration.userEnv };
      }
    }
    if (process.env["CHROME_CRASHPAD_PIPE_NAME"]) {
      Object.assign(configuration.userEnv, {
        CHROME_CRASHPAD_PIPE_NAME: process.env["CHROME_CRASHPAD_PIPE_NAME"]
      });
    }
    if (options.disableExtensions !== void 0) {
      configuration["disable-extensions"] = options.disableExtensions;
    }
    try {
      configuration.handle = VSBuffer.wrap(this._win.getNativeWindowHandle());
    } catch (error) {
      this.logService.error(`Error getting native window handle: ${error}`);
    }
    configuration.fullscreen = this.isFullScreen;
    configuration.maximized = this._win.isMaximized();
    configuration.partsSplash = this.themeMainService.getWindowSplash(configuration.workspace);
    configuration.zoomLevel = this.getZoomLevel();
    configuration.isCustomZoomLevel = typeof this.customZoomLevel === "number";
    if (configuration.isCustomZoomLevel && configuration.partsSplash) {
      configuration.partsSplash.zoomLevel = configuration.zoomLevel;
    }
    mark("code/willOpenNewWindow");
    configuration.perfMarks = getMarks();
    this.configObjectUrl.update(configuration);
  }
  async reload(cli) {
    const configuration = Object.assign({}, this._config);
    configuration.workspace = await this.validateWorkspaceBeforeReload(configuration);
    delete configuration.filesToOpenOrCreate;
    delete configuration.filesToDiff;
    delete configuration.filesToMerge;
    delete configuration.filesToWait;
    if (this.isExtensionDevelopmentHost && cli) {
      configuration.verbose = cli.verbose;
      configuration.debugId = cli.debugId;
      configuration.extensionEnvironment = cli.extensionEnvironment;
      configuration["inspect-extensions"] = cli["inspect-extensions"];
      configuration["inspect-brk-extensions"] = cli["inspect-brk-extensions"];
      configuration["extensions-dir"] = cli["extensions-dir"];
    }
    configuration.accessibilitySupport = electron.app.isAccessibilitySupportEnabled();
    configuration.isInitialStartup = false;
    configuration.policiesData = this.policyService.serialize();
    configuration.continueOn = this.environmentMainService.continueOn;
    configuration.profiles = {
      all: this.userDataProfilesService.profiles,
      profile: this.profile || this.userDataProfilesService.defaultProfile,
      home: this.userDataProfilesService.profilesHome
    };
    configuration.logLevel = this.loggerMainService.getLogLevel();
    configuration.loggers = this.loggerMainService.getGlobalLoggers();
    this.load(configuration, { isReload: true, disableExtensions: cli?.["disable-extensions"] });
  }
  async validateWorkspaceBeforeReload(configuration) {
    if (isWorkspaceIdentifier(configuration.workspace)) {
      const configPath = configuration.workspace.configPath;
      if (configPath.scheme === Schemas.file) {
        const workspaceExists = await this.fileService.exists(configPath);
        if (!workspaceExists) {
          return void 0;
        }
      }
    } else if (isSingleFolderWorkspaceIdentifier(configuration.workspace)) {
      const uri = configuration.workspace.uri;
      if (uri.scheme === Schemas.file) {
        const folderExists = await this.fileService.exists(uri);
        if (!folderExists) {
          return void 0;
        }
      }
    }
    return configuration.workspace;
  }
  serializeWindowState() {
    if (!this._win) {
      return defaultWindowState();
    }
    if (this.isFullScreen) {
      let display;
      try {
        display = electron.screen.getDisplayMatching(this.getBounds());
      } catch (error) {
      }
      const defaultState = defaultWindowState();
      return {
        mode: WindowMode.Fullscreen,
        display: display ? display.id : void 0,
        // Still carry over window dimensions from previous sessions
        // if we can compute it in fullscreen state.
        // does not seem possible in all cases on Linux for example
        // (https://github.com/microsoft/vscode/issues/58218) so we
        // fallback to the defaults in that case.
        width: this.windowState.width || defaultState.width,
        height: this.windowState.height || defaultState.height,
        x: this.windowState.x || 0,
        y: this.windowState.y || 0,
        zoomLevel: this.customZoomLevel
      };
    }
    const state = /* @__PURE__ */ Object.create(null);
    let mode;
    if (!isMacintosh && this._win.isMaximized()) {
      mode = WindowMode.Maximized;
    } else {
      mode = WindowMode.Normal;
    }
    if (mode === WindowMode.Maximized) {
      state.mode = WindowMode.Maximized;
    } else {
      state.mode = WindowMode.Normal;
    }
    if (mode === WindowMode.Normal || mode === WindowMode.Maximized) {
      let bounds;
      if (mode === WindowMode.Normal) {
        bounds = this.getBounds();
      } else {
        bounds = this._win.getNormalBounds();
      }
      state.x = bounds.x;
      state.y = bounds.y;
      state.width = bounds.width;
      state.height = bounds.height;
    }
    state.zoomLevel = this.customZoomLevel;
    return state;
  }
  restoreWindowState(state) {
    mark("code/willRestoreCodeWindowState");
    let hasMultipleDisplays = false;
    if (state) {
      this.customZoomLevel = state.zoomLevel;
      try {
        const displays = electron.screen.getAllDisplays();
        hasMultipleDisplays = displays.length > 1;
        state = WindowStateValidator.validateWindowState(this.logService, state, displays);
      } catch (err) {
        this.logService.warn(`Unexpected error validating window state: ${err}
${err.stack}`);
      }
    }
    mark("code/didRestoreCodeWindowState");
    return [state || defaultWindowState(), hasMultipleDisplays];
  }
  getBounds() {
    const [x, y] = this._win.getPosition();
    const [width, height] = this._win.getSize();
    return { x, y, width, height };
  }
  setFullScreen(fullscreen, fromRestore) {
    super.setFullScreen(fullscreen, fromRestore);
    this.sendWhenReady(fullscreen ? "vscode:enterFullScreen" : "vscode:leaveFullScreen", CancellationToken.None);
    if (this.currentMenuBarVisibility) {
      this.setMenuBarVisibility(this.currentMenuBarVisibility, false);
    }
  }
  getMenuBarVisibility() {
    let menuBarVisibility = getMenuBarVisibility(this.configurationService);
    if (["visible", "toggle", "hidden"].indexOf(menuBarVisibility) < 0) {
      menuBarVisibility = "classic";
    }
    return menuBarVisibility;
  }
  setMenuBarVisibility(visibility, notify = true) {
    if (isMacintosh) {
      return;
    }
    if (visibility === "toggle") {
      if (notify) {
        this.send("vscode:showInfoMessage", localize("hiddenMenuBar", "You can still access the menu bar by pressing the Alt-key."));
      }
    }
    if (visibility === "hidden") {
      setTimeout(() => {
        this.doSetMenuBarVisibility(visibility);
      });
    } else {
      this.doSetMenuBarVisibility(visibility);
    }
  }
  doSetMenuBarVisibility(visibility) {
    const isFullscreen = this.isFullScreen;
    switch (visibility) {
      case "classic":
        this._win.setMenuBarVisibility(!isFullscreen);
        this._win.autoHideMenuBar = isFullscreen;
        break;
      case "visible":
        this._win.setMenuBarVisibility(true);
        this._win.autoHideMenuBar = false;
        break;
      case "toggle":
        this._win.setMenuBarVisibility(false);
        this._win.autoHideMenuBar = true;
        break;
      case "hidden":
        this._win.setMenuBarVisibility(false);
        this._win.autoHideMenuBar = false;
        break;
    }
  }
  notifyZoomLevel(zoomLevel) {
    this.customZoomLevel = zoomLevel;
  }
  getZoomLevel() {
    if (typeof this.customZoomLevel === "number") {
      return this.customZoomLevel;
    }
    const windowSettings = this.configurationService.getValue("window");
    return windowSettings?.zoomLevel;
  }
  close() {
    this._win?.close();
  }
  sendWhenReady(channel, token, ...args) {
    if (this.isReady) {
      this.send(channel, ...args);
    } else {
      this.ready().then(() => {
        if (!token.isCancellationRequested) {
          this.send(channel, ...args);
        }
      });
    }
  }
  send(channel, ...args) {
    if (this._win) {
      if (this._win.isDestroyed() || this._win.webContents.isDestroyed()) {
        this.logService.warn(`Sending IPC message to channel '${channel}' for window that is destroyed`);
        return;
      }
      try {
        this._win.webContents.send(channel, ...args);
      } catch (error) {
        this.logService.warn(`Error sending IPC message to channel '${channel}' of window ${this._id}: ${toErrorMessage(error)}`);
      }
    }
  }
  updateTouchBar(groups) {
    if (!isMacintosh) {
      return;
    }
    this.touchBarGroups.forEach((touchBarGroup, index) => {
      const commands = groups[index];
      touchBarGroup.segments = this.createTouchBarGroupSegments(commands);
    });
  }
  createTouchBar() {
    if (!isMacintosh) {
      return;
    }
    for (let i = 0; i < 10; i++) {
      const groupTouchBar = this.createTouchBarGroup();
      this.touchBarGroups.push(groupTouchBar);
    }
    this._win.setTouchBar(new electron.TouchBar({ items: this.touchBarGroups }));
  }
  createTouchBarGroup(items = []) {
    const segments = this.createTouchBarGroupSegments(items);
    const control = new electron.TouchBar.TouchBarSegmentedControl({
      segments,
      mode: "buttons",
      segmentStyle: "automatic",
      change: (selectedIndex) => {
        this.sendWhenReady("vscode:runAction", CancellationToken.None, { id: control.segments[selectedIndex].id, from: "touchbar" });
      }
    });
    return control;
  }
  createTouchBarGroupSegments(items = []) {
    const segments = items.map((item) => {
      let icon;
      if (item.icon && !ThemeIcon.isThemeIcon(item.icon) && item.icon?.dark?.scheme === Schemas.file) {
        icon = electron.nativeImage.createFromPath(URI.revive(item.icon.dark).fsPath);
        if (icon.isEmpty()) {
          icon = void 0;
        }
      }
      let title;
      if (typeof item.title === "string") {
        title = item.title;
      } else {
        title = item.title.value;
      }
      return {
        id: item.id,
        label: !icon ? title : void 0,
        icon
      };
    });
    return segments;
  }
  async startCollectingJScallStacks() {
    if (!this.jsCallStackCollector.isTriggered()) {
      const stack = await this._win?.webContents.mainFrame.collectJavaScriptCallStack();
      if (stack) {
        const count = this.jsCallStackMap.get(stack) || 0;
        this.jsCallStackMap.set(stack, count + 1);
      }
      this.jsCallStackCollector.trigger(() => this.startCollectingJScallStacks());
    }
  }
  stopCollectingJScallStacks() {
    this.jsCallStackCollectorStopScheduler.cancel();
    this.jsCallStackCollector.cancel();
    if (this.jsCallStackMap.size) {
      let logMessage = `CodeWindow unresponsive samples:
`;
      let samples = 0;
      const sortedEntries = Array.from(this.jsCallStackMap.entries()).sort((a, b) => b[1] - a[1]);
      for (const [stack, count] of sortedEntries) {
        samples += count;
        if (Math.round(count * 100 / this.jsCallStackEffectiveSampleCount) > 20) {
          const fakeError = new UnresponsiveError(stack, this.id, this._win?.webContents.getOSProcessId());
          errorHandler.onUnexpectedError(fakeError);
        }
        logMessage += `<${count}> ${stack}
`;
      }
      logMessage += `Total Samples: ${samples}
`;
      logMessage += "For full overview of the unresponsive period, capture cpu profile via https://aka.ms/vscode-tracing-cpu-profile";
      this.logService.error(logMessage);
    }
    this.jsCallStackMap.clear();
  }
  matches(webContents) {
    return this._win?.webContents.id === webContents.id;
  }
  dispose() {
    super.dispose();
    this.loggerMainService.deregisterLoggers(this.id);
  }
};
CodeWindow = __decorateClass([
  __decorateParam(1, ILogService),
  __decorateParam(2, ILoggerMainService),
  __decorateParam(3, IEnvironmentMainService),
  __decorateParam(4, IPolicyService),
  __decorateParam(5, IUserDataProfilesMainService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IApplicationStorageMainService),
  __decorateParam(8, IStorageMainService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IThemeMainService),
  __decorateParam(11, IWorkspacesManagementMainService),
  __decorateParam(12, IBackupMainService),
  __decorateParam(13, ITelemetryService),
  __decorateParam(14, IDialogMainService),
  __decorateParam(15, ILifecycleMainService),
  __decorateParam(16, IProductService),
  __decorateParam(17, IProtocolMainService),
  __decorateParam(18, IWindowsMainService),
  __decorateParam(19, IStateService),
  __decorateParam(20, IInstantiationService)
], CodeWindow);
class UnresponsiveError extends Error {
  constructor(sample, windowId, pid = 0) {
    const stackTraceLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = 0;
    super(`UnresponsiveSampleError: from window with ID ${windowId} belonging to process with pid ${pid}`);
    Error.stackTraceLimit = stackTraceLimit;
    this.name = "UnresponsiveSampleError";
    this.stack = sample;
  }
}
export {
  BaseWindow,
  CodeWindow
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3dpbmRvd3MvZWxlY3Ryb24tbWFpbi93aW5kb3dJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGVsZWN0cm9uLCB7IEJyb3dzZXJXaW5kb3dDb25zdHJ1Y3Rvck9wdGlvbnMsIERpc3BsYXksIHNjcmVlbiB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgUnVuT25jZVNjaGVkdWxlciwgdGltZW91dCwgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzLCBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBnZXRNYXJrcywgbWFyayB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IGlzVGFob2VPck5ld2VyLCBpc0xpbnV4LCBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IHJlbGVhc2UgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBJU2VyaWFsaXphYmxlQ29tbWFuZEFjdGlvbiB9IGZyb20gJy4uLy4uL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IElCYWNrdXBNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2JhY2t1cC9lbGVjdHJvbi1tYWluL2JhY2t1cC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2RpYWxvZ3MvZWxlY3Ryb24tbWFpbi9kaWFsb2dNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOYXRpdmVQYXJzZWRBcmdzIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2FyZ3YuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9lbGVjdHJvbi1tYWluL2Vudmlyb25tZW50TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNMYXVuY2hlZEZyb21DbGkgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9ub2RlL2FyZ3ZIZWxwZXIuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9lbGVjdHJvbi1tYWluL2xpZmVjeWNsZU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUlQQ09iamVjdFVybCwgSVByb3RvY29sTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm90b2NvbC9lbGVjdHJvbi1tYWluL3Byb3RvY29sLmpzJztcbmltcG9ydCB7IHJlc29sdmVNYXJrZXRwbGFjZUhlYWRlcnMgfSBmcm9tICcuLi8uLi9leHRlcm5hbFNlcnZpY2VzL2NvbW1vbi9tYXJrZXRwbGFjZS5qcyc7XG5pbXBvcnQgeyBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UsIElTdG9yYWdlTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2VsZWN0cm9uLW1haW4vc3RvcmFnZU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElUaGVtZU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGhlbWUvZWxlY3Ryb24tbWFpbi90aGVtZU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldE1lbnVCYXJWaXNpYmlsaXR5LCBJRm9sZGVyVG9PcGVuLCBJTmF0aXZlV2luZG93Q29uZmlndXJhdGlvbiwgSVdpbmRvd1NldHRpbmdzLCBJV29ya3NwYWNlVG9PcGVuLCBNZW51QmFyVmlzaWJpbGl0eSwgaGFzTmF0aXZlVGl0bGViYXIsIHVzZU5hdGl2ZUZ1bGxTY3JlZW4sIHVzZVdpbmRvd0NvbnRyb2xzT3ZlcmxheSwgREVGQVVMVF9DVVNUT01fVElUTEVCQVJfSEVJR0hULCBUaXRsZWJhclN0eWxlLCBNZW51U2V0dGluZ3MgfSBmcm9tICcuLi8uLi93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnJvd3NlcldpbmRvd09wdGlvbnMsIGdldEFsbFdpbmRvd3NFeGNsdWRpbmdPZmZzY3JlZW4sIElXaW5kb3dzTWFpblNlcnZpY2UsIE9wZW5Db250ZXh0LCBXaW5kb3dTdGF0ZVZhbGlkYXRvciB9IGZyb20gJy4vd2luZG93cy5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgSVdvcmtzcGFjZUlkZW50aWZpZXIsIGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgaXNXb3Jrc3BhY2VJZGVudGlmaWVyLCB0b1dvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3dvcmtzcGFjZXMvZWxlY3Ryb24tbWFpbi93b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXaW5kb3dTdGF0ZSwgSUNvZGVXaW5kb3csIElMb2FkRXZlbnQsIFdpbmRvd01vZGUsIFdpbmRvd0Vycm9yLCBMb2FkUmVhc29uLCBkZWZhdWx0V2luZG93U3RhdGUsIElCYXNlV2luZG93IH0gZnJvbSAnLi4vLi4vd2luZG93L2VsZWN0cm9uLW1haW4vd2luZG93LmpzJztcbmltcG9ydCB7IElQb2xpY3lTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcG9saWN5L2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElTdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdGF0ZS9ub2RlL3N0YXRlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvZWxlY3Ryb24tbWFpbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSUxvZ2dlck1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2VsZWN0cm9uLW1haW4vbG9nZ2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGVycm9ySGFuZGxlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBGb2N1c01vZGUgfSBmcm9tICcuLi8uLi9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJV2luZG93Q3JlYXRpb25PcHRpb25zIHtcblx0cmVhZG9ubHkgc3RhdGU6IElXaW5kb3dTdGF0ZTtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoPzogc3RyaW5nW107XG5cdHJlYWRvbmx5IGlzRXh0ZW5zaW9uVGVzdEhvc3Q/OiBib29sZWFuO1xuXHRyZWFkb25seSBpc1Nlc3Npb25zV2luZG93PzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElUb3VjaEJhclNlZ21lbnQgZXh0ZW5kcyBlbGVjdHJvbi5TZWdtZW50ZWRDb250cm9sU2VnbWVudCB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJTG9hZE9wdGlvbnMge1xuXHRyZWFkb25seSBpc1JlbG9hZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGRpc2FibGVFeHRlbnNpb25zPzogYm9vbGVhbjtcbn1cblxuY29uc3QgZW51bSBSZWFkeVN0YXRlIHtcblxuXHQvKipcblx0ICogVGhpcyB3aW5kb3cgaGFzIG5vdCBsb2FkZWQgYW55dGhpbmcgeWV0XG5cdCAqIGFuZCB0aGlzIGlzIHRoZSBpbml0aWFsIHN0YXRlIG9mIGV2ZXJ5XG5cdCAqIHdpbmRvdy5cblx0ICovXG5cdE5PTkUsXG5cblx0LyoqXG5cdCAqIFRoaXMgd2luZG93IGlzIG5hdmlnYXRpbmcsIGVpdGhlciBmb3IgdGhlXG5cdCAqIGZpcnN0IHRpbWUgb3Igc3Vic2VxdWVudCB0aW1lcy5cblx0ICovXG5cdE5BVklHQVRJTkcsXG5cblx0LyoqXG5cdCAqIFRoaXMgd2luZG93IGhhcyBmaW5pc2hlZCBsb2FkaW5nIGFuZCBpcyByZWFkeVxuXHQgKiB0byBmb3J3YXJkIElQQyByZXF1ZXN0cyB0byB0aGUgd2ViIGNvbnRlbnRzLlxuXHQgKi9cblx0UkVBRFlcbn1cblxuY2xhc3MgRG9ja0JhZGdlTWFuYWdlciB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElOU1RBTkNFID0gbmV3IERvY2tCYWRnZU1hbmFnZXIoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHdpbmRvd3MgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuXHRhY3F1aXJlQmFkZ2Uod2luZG93OiBJQmFzZVdpbmRvdyk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLndpbmRvd3MuYWRkKHdpbmRvdy5pZCk7XG5cblx0XHRlbGVjdHJvbi5hcHAuc2V0QmFkZ2VDb3VudChpc0xpbnV4ID8gMSAvKiBvbmx5IG51bWJlcnMgc3VwcG9ydGVkICovIDogdW5kZWZpbmVkIC8qIGdlbmVyaWMgZG90ICovKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMud2luZG93cy5kZWxldGUod2luZG93LmlkKTtcblxuXHRcdFx0XHRpZiAodGhpcy53aW5kb3dzLnNpemUgPT09IDApIHtcblx0XHRcdFx0XHRlbGVjdHJvbi5hcHAuc2V0QmFkZ2VDb3VudCgwKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJhc2VXaW5kb3cgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUJhc2VXaW5kb3cge1xuXG5cdC8vI3JlZ2lvbiBFdmVudHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xvc2UgPSB0aGlzLl9vbkRpZENsb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTWF4aW1pemUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRNYXhpbWl6ZSA9IHRoaXMuX29uRGlkTWF4aW1pemUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRVbm1heGltaXplID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVW5tYXhpbWl6ZSA9IHRoaXMuX29uRGlkVW5tYXhpbWl6ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRyaWdnZXJTeXN0ZW1Db250ZXh0TWVudSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVHJpZ2dlclN5c3RlbUNvbnRleHRNZW51ID0gdGhpcy5fb25EaWRUcmlnZ2VyU3lzdGVtQ29udGV4dE1lbnUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFbnRlckZ1bGxTY3JlZW4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRFbnRlckZ1bGxTY3JlZW4gPSB0aGlzLl9vbkRpZEVudGVyRnVsbFNjcmVlbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZExlYXZlRnVsbFNjcmVlbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZExlYXZlRnVsbFNjcmVlbiA9IHRoaXMuX29uRGlkTGVhdmVGdWxsU2NyZWVuLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWx3YXlzT25Ub3AgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBbHdheXNPblRvcCA9IHRoaXMuX29uRGlkQ2hhbmdlQWx3YXlzT25Ub3AuZXZlbnQ7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0YWJzdHJhY3QgcmVhZG9ubHkgaWQ6IG51bWJlcjtcblxuXHRwcm90ZWN0ZWQgX2xhc3RGb2N1c1RpbWUgPSBEYXRlLm5vdygpOyAvLyB3aW5kb3cgaXMgc2hvd24gb24gY3JlYXRpb24gc28gdGFrZSBjdXJyZW50IHRpbWVcblx0Z2V0IGxhc3RGb2N1c1RpbWUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX2xhc3RGb2N1c1RpbWU7IH1cblxuXHRwcml2YXRlIG1heGltaXplZFdpbmRvd1N0YXRlOiBJV2luZG93U3RhdGUgfCB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIF93aW46IGVsZWN0cm9uLkJyb3dzZXJXaW5kb3cgfCBudWxsID0gbnVsbDtcblx0Z2V0IHdpbigpIHsgcmV0dXJuIHRoaXMuX3dpbjsgfVxuXHRwcm90ZWN0ZWQgc2V0V2luKHdpbjogZWxlY3Ryb24uQnJvd3NlcldpbmRvdywgb3B0aW9ucz86IEJyb3dzZXJXaW5kb3dDb25zdHJ1Y3Rvck9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLl93aW4gPSB3aW47XG5cblx0XHQvLyBXaW5kb3cgRXZlbnRzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIod2luLCAnbWF4aW1pemUnKSgoKSA9PiB7XG5cdFx0XHRpZiAoaXNXaW5kb3dzICYmIHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5lbmFibGVSRFBEaXNwbGF5VHJhY2tpbmcgJiYgdGhpcy5fd2luKSB7XG5cdFx0XHRcdGNvbnN0IFt4LCB5XSA9IHRoaXMuX3dpbi5nZXRQb3NpdGlvbigpO1xuXHRcdFx0XHRjb25zdCBbd2lkdGgsIGhlaWdodF0gPSB0aGlzLl93aW4uZ2V0U2l6ZSgpO1xuXG5cdFx0XHRcdHRoaXMubWF4aW1pemVkV2luZG93U3RhdGUgPSB7IG1vZGU6IFdpbmRvd01vZGUuTWF4aW1pemVkLCB3aWR0aCwgaGVpZ2h0LCB4LCB5IH07XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgU2F2ZWQgbWF4aW1pemVkIHdpbmRvdyAke3RoaXMuaWR9IGRpc3BsYXkgc3RhdGU6YCwgdGhpcy5tYXhpbWl6ZWRXaW5kb3dTdGF0ZSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX29uRGlkTWF4aW1pemUuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcih3aW4sICd1bm1heGltaXplJykoKCkgPT4ge1xuXHRcdFx0aWYgKGlzV2luZG93cyAmJiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuZW5hYmxlUkRQRGlzcGxheVRyYWNraW5nICYmIHRoaXMubWF4aW1pemVkV2luZG93U3RhdGUpIHtcblx0XHRcdFx0dGhpcy5tYXhpbWl6ZWRXaW5kb3dTdGF0ZSA9IHVuZGVmaW5lZDtcblxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYENsZWFyZWQgbWF4aW1pemVkIHdpbmRvdyAke3RoaXMuaWR9IHN0YXRlYCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX29uRGlkVW5tYXhpbWl6ZS5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHdpbiwgJ2Nsb3NlZCcpKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2xvc2UuZmlyZSgpO1xuXG5cdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIod2luLCAnZm9jdXMnKSgoKSA9PiB7XG5cdFx0XHR0aGlzLmNsZWFyTm90aWZ5Rm9jdXMoKTtcblxuXHRcdFx0dGhpcy5fbGFzdEZvY3VzVGltZSA9IERhdGUubm93KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHRoaXMuX3dpbiwgJ2VudGVyLWZ1bGwtc2NyZWVuJykoKCkgPT4gdGhpcy5fb25EaWRFbnRlckZ1bGxTY3JlZW4uZmlyZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIodGhpcy5fd2luLCAnbGVhdmUtZnVsbC1zY3JlZW4nKSgoKSA9PiB0aGlzLl9vbkRpZExlYXZlRnVsbFNjcmVlbi5maXJlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcih0aGlzLl93aW4sICdhbHdheXMtb24tdG9wLWNoYW5nZWQnLCAoXywgYWx3YXlzT25Ub3ApID0+IGFsd2F5c09uVG9wKShhbHdheXNPblRvcCA9PiB0aGlzLl9vbkRpZENoYW5nZUFsd2F5c09uVG9wLmZpcmUoYWx3YXlzT25Ub3ApKSk7XG5cblx0XHQvLyBTaGVldCBPZmZzZXRzXG5cdFx0Y29uc3QgdXNlQ3VzdG9tVGl0bGVTdHlsZSA9ICFoYXNOYXRpdmVUaXRsZWJhcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBvcHRpb25zPy50aXRsZUJhclN0eWxlID09PSAnaGlkZGVuJyA/IFRpdGxlYmFyU3R5bGUuQ1VTVE9NIDogdW5kZWZpbmVkIC8qIHVua25vd24gKi8pO1xuXHRcdGlmIChpc01hY2ludG9zaCAmJiB1c2VDdXN0b21UaXRsZVN0eWxlKSB7XG5cdFx0XHR3aW4uc2V0U2hlZXRPZmZzZXQoaXNUYWhvZU9yTmV3ZXIocmVsZWFzZSgpKSA/IDMyIDogMjgpOyAvLyBvZmZzZXQgZGlhbG9ncyBieSB0aGUgaGVpZ2h0IG9mIHRoZSBjdXN0b20gdGl0bGUgYmFyIGlmIHdlIGhhdmUgYW55XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRoZSB3aW5kb3cgY29udHJvbHMgaW1tZWRpYXRlbHkgYmFzZWQgb24gY2FjaGVkIG9yIGRlZmF1bHQgdmFsdWVzXG5cdFx0aWYgKHVzZUN1c3RvbVRpdGxlU3R5bGUgJiYgdXNlV2luZG93Q29udHJvbHNPdmVybGF5KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHRjb25zdCBjYWNoZWRXaW5kb3dDb250cm9sSGVpZ2h0ID0gdGhpcy5zdGF0ZVNlcnZpY2UuZ2V0SXRlbTxudW1iZXI+KChCYXNlV2luZG93LndpbmRvd0NvbnRyb2xIZWlnaHRTdGF0ZVN0b3JhZ2VLZXkpKTtcblx0XHRcdGlmIChjYWNoZWRXaW5kb3dDb250cm9sSGVpZ2h0KSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlV2luZG93Q29udHJvbHMoeyBoZWlnaHQ6IGNhY2hlZFdpbmRvd0NvbnRyb2xIZWlnaHQgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVdpbmRvd0NvbnRyb2xzKHsgaGVpZ2h0OiBERUZBVUxUX0NVU1RPTV9USVRMRUJBUl9IRUlHSFQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2V0dXAgd2luZG93cy9saW51eCBzeXN0ZW0gY29udGV4dCBtZW51IHNvIGl0IG9ubHkgaXMgYWxsb3dlZCBvdmVyIHRoZSBhcHAgaWNvblxuXHRcdGlmICgoaXNXaW5kb3dzIHx8IGlzTGludXgpICYmIHVzZUN1c3RvbVRpdGxlU3R5bGUpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHdpbiwgJ3N5c3RlbS1jb250ZXh0LW1lbnUnLCAoZXZlbnQ6IEVsZWN0cm9uLkV2ZW50LCBwb2ludDogRWxlY3Ryb24uUG9pbnQpID0+ICh7IGV2ZW50LCBwb2ludCB9KSkoZSA9PiB7XG5cdFx0XHRcdGNvbnN0IFt4LCB5XSA9IHdpbi5nZXRQb3NpdGlvbigpO1xuXHRcdFx0XHRjb25zdCBjdXJzb3JQb3MgPSBlbGVjdHJvbi5zY3JlZW4uc2NyZWVuVG9EaXBQb2ludChlLnBvaW50KTtcblx0XHRcdFx0Y29uc3QgY3ggPSBNYXRoLmZsb29yKGN1cnNvclBvcy54KSAtIHg7XG5cdFx0XHRcdGNvbnN0IGN5ID0gTWF0aC5mbG9vcihjdXJzb3JQb3MueSkgLSB5O1xuXG5cdFx0XHRcdC8vIFRPRE9AZGVlcGFrMTU1NiB3b3JrYXJvdW5kIGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjUwNjMyXG5cdFx0XHRcdC8vIHdoZXJlIHNob3dpbmcgdGhlIGN1c3RvbSBtZW51IHNlZW1zIGJyb2tlbiBvbiBXaW5kb3dzXG5cdFx0XHRcdGlmIChpc0xpbnV4KSB7XG5cdFx0XHRcdFx0aWYgKGN4ID4gMzUgLyogQ3Vyc29yIGlzIGJleW9uZCBhcHAgaWNvbiBpbiB0aXRsZSBiYXIgKi8pIHtcblx0XHRcdFx0XHRcdGUuZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRUcmlnZ2VyU3lzdGVtQ29udGV4dE1lbnUuZmlyZSh7IHg6IGN4LCB5OiBjeSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBPcGVuIGRldnRvb2xzIGlmIGluc3RydWN0ZWQgZnJvbSBjb21tYW5kIGxpbmUgYXJnc1xuXHRcdGlmICh0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJnc1snb3Blbi1kZXZ0b29scyddID09PSB0cnVlKSB7XG5cdFx0XHR3aW4ud2ViQ29udGVudHMub3BlbkRldlRvb2xzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gbWFjT1M6IFdpbmRvdyBGdWxsc2NyZWVuIFRyYW5zaXRpb25zXG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkRW50ZXJGdWxsU2NyZWVuKCgpID0+IHtcblx0XHRcdFx0dGhpcy5qb2luTmF0aXZlRnVsbFNjcmVlblRyYW5zaXRpb24/LmNvbXBsZXRlKHRydWUpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkTGVhdmVGdWxsU2NyZWVuKCgpID0+IHtcblx0XHRcdFx0dGhpcy5qb2luTmF0aXZlRnVsbFNjcmVlblRyYW5zaXRpb24/LmNvbXBsZXRlKHRydWUpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmIChpc1dpbmRvd3MgJiYgdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmVuYWJsZVJEUERpc3BsYXlUcmFja2luZykge1xuXHRcdFx0Ly8gSGFuZGxlcyB0aGUgZGlzcGxheS1hZGRlZCBldmVudCBvbiBXaW5kb3dzIFJEUCBtdWx0aS1tb25pdG9yIHNjZW5hcmlvcy5cblx0XHRcdC8vIFRoaXMgaGVscHMgcmVzdG9yZSBtYXhpbWl6ZWQgd2luZG93cyB0byB0aGVpciBjb3JyZWN0IG1vbml0b3IgYWZ0ZXIgUkRQIHJlY29ubmVjdGlvbi5cblx0XHRcdC8vIFJlZnMgaHR0cHM6Ly9naXRodWIuY29tL2VsZWN0cm9uL2VsZWN0cm9uL2lzc3Vlcy80NzAxNlxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIoc2NyZWVuLCAnZGlzcGxheS1hZGRlZCcsIChldmVudDogRWxlY3Ryb24uRXZlbnQsIGRpc3BsYXk6IERpc3BsYXkpID0+ICh7IGV2ZW50LCBkaXNwbGF5IH0pKSgoZSkgPT4ge1xuXHRcdFx0XHR0aGlzLm9uRGlzcGxheUFkZGVkKGUuZGlzcGxheSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpc3BsYXlBZGRlZChkaXNwbGF5OiBEaXNwbGF5KTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLm1heGltaXplZFdpbmRvd1N0YXRlO1xuXHRcdGlmIChzdGF0ZSAmJiB0aGlzLl93aW4gJiYgV2luZG93U3RhdGVWYWxpZGF0b3IudmFsaWRhdGVXaW5kb3dTdGF0ZU9uRGlzcGxheShzdGF0ZSwgZGlzcGxheSkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgU2V0dGluZyBtYXhpbWl6ZWQgd2luZG93ICR7dGhpcy5pZH0gYm91bmRzIHRvIG1hdGNoIG5ld2x5IGFkZGVkIGRpc3BsYXlgLCBzdGF0ZSk7XG5cblx0XHRcdHRoaXMuX3dpbi5zZXRCb3VuZHMoc3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBzdGF0ZVNlcnZpY2U6IElTdGF0ZVNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGVudmlyb25tZW50TWFpblNlcnZpY2U6IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFwcGx5U3RhdGUoc3RhdGU6IElXaW5kb3dTdGF0ZSwgaGFzTXVsdGlwbGVEaXNwbGF5cyA9IGVsZWN0cm9uLnNjcmVlbi5nZXRBbGxEaXNwbGF5cygpLmxlbmd0aCA+IDApOiB2b2lkIHtcblxuXHRcdC8vIFRPRE9AZWxlY3Ryb24gKEVsZWN0cm9uIDQgcmVncmVzc2lvbik6IHdoZW4gcnVubmluZyBvbiBtdWx0aXBsZSBkaXNwbGF5cyB3aGVyZSB0aGUgdGFyZ2V0IGRpc3BsYXlcblx0XHQvLyB0byBvcGVuIHRoZSB3aW5kb3cgaGFzIGEgbGFyZ2VyIHJlc29sdXRpb24gdGhhbiB0aGUgcHJpbWFyeSBkaXNwbGF5LCB0aGUgd2luZG93IHdpbGwgbm90IHNpemVcblx0XHQvLyBjb3JyZWN0bHkgdW5sZXNzIHdlIHNldCB0aGUgYm91bmRzIGFnYWluIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNzQ4NzIpXG5cdFx0Ly9cblx0XHQvLyBFeHRlbmRlZCB0byBjb3ZlciBXaW5kb3dzIGFzIHdlbGwgYXMgTWFjIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTQ2NDk5KVxuXHRcdC8vXG5cdFx0Ly8gSG93ZXZlciwgd2hlbiBydW5uaW5nIHdpdGggbmF0aXZlIHRhYnMgd2l0aCBtdWx0aXBsZSB3aW5kb3dzIHdlIGNhbm5vdCB1c2UgdGhpcyB3b3JrYXJvdW5kXG5cdFx0Ly8gYmVjYXVzZSB0aGVyZSBpcyBhIHBvdGVudGlhbCB0aGF0IHRoZSBuZXcgd2luZG93IHdpbGwgYmUgYWRkZWQgYXMgbmF0aXZlIHRhYiBpbnN0ZWFkIG9mIGJlaW5nXG5cdFx0Ly8gYSB3aW5kb3cgb24gaXRzIG93bi4gSW4gdGhhdCBjYXNlIGNhbGxpbmcgc2V0Qm91bmRzKCkgd291bGQgY2F1c2UgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzc1ODMwXG5cblx0XHRjb25zdCB3aW5kb3dTZXR0aW5ncyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVdpbmRvd1NldHRpbmdzIHwgdW5kZWZpbmVkPignd2luZG93Jyk7XG5cdFx0Y29uc3QgdXNlTmF0aXZlVGFicyA9IGlzTWFjaW50b3NoICYmIHdpbmRvd1NldHRpbmdzPy5uYXRpdmVUYWJzID09PSB0cnVlO1xuXHRcdGlmICgoaXNNYWNpbnRvc2ggfHwgaXNXaW5kb3dzKSAmJiBoYXNNdWx0aXBsZURpc3BsYXlzICYmICghdXNlTmF0aXZlVGFicyB8fCBnZXRBbGxXaW5kb3dzRXhjbHVkaW5nT2Zmc2NyZWVuKCkubGVuZ3RoID09PSAxKSkge1xuXHRcdFx0aWYgKFtzdGF0ZS53aWR0aCwgc3RhdGUuaGVpZ2h0LCBzdGF0ZS54LCBzdGF0ZS55XS5ldmVyeSh2YWx1ZSA9PiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSkge1xuXHRcdFx0XHR0aGlzLl93aW4/LnNldEJvdW5kcyh7XG5cdFx0XHRcdFx0d2lkdGg6IHN0YXRlLndpZHRoLFxuXHRcdFx0XHRcdGhlaWdodDogc3RhdGUuaGVpZ2h0LFxuXHRcdFx0XHRcdHg6IHN0YXRlLngsXG5cdFx0XHRcdFx0eTogc3RhdGUueVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc3RhdGUubW9kZSA9PT0gV2luZG93TW9kZS5NYXhpbWl6ZWQgfHwgc3RhdGUubW9kZSA9PT0gV2luZG93TW9kZS5GdWxsc2NyZWVuKSB7XG5cblx0XHRcdC8vIHRoaXMgY2FsbCBtYXkgb3IgbWF5IG5vdCBzaG93IHRoZSB3aW5kb3csIGRlcGVuZHNcblx0XHRcdC8vIG9uIHRoZSBwbGF0Zm9ybTogY3VycmVudGx5IG9uIFdpbmRvd3MgYW5kIExpbnV4IHdpbGxcblx0XHRcdC8vIHNob3cgdGhlIHdpbmRvdyBhcyBhY3RpdmUuIFRvIGJlIG9uIHRoZSBzYWZlIHNpZGUsXG5cdFx0XHQvLyB3ZSBzaG93IHRoZSB3aW5kb3cgYXQgdGhlIGVuZCBvZiB0aGlzIGJsb2NrLlxuXHRcdFx0dGhpcy5fd2luPy5tYXhpbWl6ZSgpO1xuXG5cdFx0XHRpZiAoc3RhdGUubW9kZSA9PT0gV2luZG93TW9kZS5GdWxsc2NyZWVuKSB7XG5cdFx0XHRcdHRoaXMuc2V0RnVsbFNjcmVlbih0cnVlLCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdG8gcmVkdWNlIGZsaWNrZXIgZnJvbSB0aGUgZGVmYXVsdCB3aW5kb3cgc2l6ZVxuXHRcdFx0Ly8gdG8gbWF4aW1pemUgb3IgZnVsbHNjcmVlbiwgd2Ugb25seSBzaG93IGFmdGVyXG5cdFx0XHR0aGlzLl93aW4/LnNob3coKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlcHJlc2VudGVkRmlsZW5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRzZXRSZXByZXNlbnRlZEZpbGVuYW1lKGZpbGVuYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdHRoaXMud2luPy5zZXRSZXByZXNlbnRlZEZpbGVuYW1lKGZpbGVuYW1lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZXByZXNlbnRlZEZpbGVuYW1lID0gZmlsZW5hbWU7XG5cdFx0fVxuXHR9XG5cblx0Z2V0UmVwcmVzZW50ZWRGaWxlbmFtZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0cmV0dXJuIHRoaXMud2luPy5nZXRSZXByZXNlbnRlZEZpbGVuYW1lKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucmVwcmVzZW50ZWRGaWxlbmFtZTtcblx0fVxuXG5cdHByaXZhdGUgZG9jdW1lbnRFZGl0ZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0c2V0RG9jdW1lbnRFZGl0ZWQoZWRpdGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHR0aGlzLndpbj8uc2V0RG9jdW1lbnRFZGl0ZWQoZWRpdGVkKTtcblx0XHR9XG5cblx0XHR0aGlzLmRvY3VtZW50RWRpdGVkID0gZWRpdGVkO1xuXHR9XG5cblx0aXNEb2N1bWVudEVkaXRlZCgpOiBib29sZWFuIHtcblx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdHJldHVybiBCb29sZWFuKHRoaXMud2luPy5pc0RvY3VtZW50RWRpdGVkKCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiAhIXRoaXMuZG9jdW1lbnRFZGl0ZWQ7XG5cdH1cblxuXHRmb2N1cyhvcHRpb25zPzogeyBtb2RlOiBGb2N1c01vZGUgfSk6IHZvaWQge1xuXHRcdHN3aXRjaCAob3B0aW9ucz8ubW9kZSA/PyBGb2N1c01vZGUuVHJhbnNmZXIpIHtcblx0XHRcdGNhc2UgRm9jdXNNb2RlLlRyYW5zZmVyOlxuXHRcdFx0XHR0aGlzLmRvRm9jdXNXaW5kb3coKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgRm9jdXNNb2RlLk5vdGlmeTpcblx0XHRcdFx0dGhpcy5zaG93Tm90aWZ5Rm9jdXMoKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgRm9jdXNNb2RlLkZvcmNlOlxuXHRcdFx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdFx0XHRlbGVjdHJvbi5hcHAuZm9jdXMoeyBzdGVhbDogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmRvRm9jdXNXaW5kb3coKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBub3RpZnlGb2N1c0Rpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSBzaG93Tm90aWZ5Rm9jdXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5ub3RpZnlGb2N1c0Rpc3Bvc2FibGUudmFsdWUgPSBkaXNwb3NhYmxlcztcblxuXHRcdC8vIEJhZGdlXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKERvY2tCYWRnZU1hbmFnZXIuSU5TVEFOQ0UuYWNxdWlyZUJhZGdlKHRoaXMpKTtcblxuXHRcdC8vIEZsYXNoL0JvdW5jZVxuXHRcdGlmIChpc1dpbmRvd3MgfHwgaXNMaW51eCkge1xuXHRcdFx0dGhpcy53aW4/LmZsYXNoRnJhbWUodHJ1ZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMud2luPy5mbGFzaEZyYW1lKGZhbHNlKSkpO1xuXHRcdH0gZWxzZSBpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdGVsZWN0cm9uLmFwcC5kb2NrPy5ib3VuY2UoJ2luZm9ybWF0aW9uYWwnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyTm90aWZ5Rm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5ub3RpZnlGb2N1c0Rpc3Bvc2FibGUuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9Gb2N1c1dpbmRvdygpIHtcblx0XHRjb25zdCB3aW4gPSB0aGlzLndpbjtcblx0XHRpZiAoIXdpbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh3aW4uaXNNaW5pbWl6ZWQoKSkge1xuXHRcdFx0d2luLnJlc3RvcmUoKTtcblx0XHR9XG5cblx0XHR3aW4uZm9jdXMoKTtcblxuXHRcdC8vIFdoZW4gZm9jdXNpbmcgdGhlIHdpbmRvdywgdGhlIHdvcmtiZW5jaCBzaG91bGQgYWx3YXlzIGJlIHRoZSB2aWV3IHRoYXQgcmVjZWl2ZXMgZm9jdXMuXG5cdFx0Ly8gSG93ZXZlciwgaW4gc2NlbmFyaW9zIHdoZXJlIHRoZSB3aW5kb3cgaGFzIG11bHRpcGxlIGNoaWxkIHZpZXdzIChlLmcuIGJyb3dzZXIgV2ViQ29udGVudHNWaWV3cyksXG5cdFx0Ly8gdGhlIGxhc3QgZm9jdXNlZCB2aWV3IGluIHRoZSB3aW5kb3cgbWF5IG5vdCBiZSB0aGUgd29ya2JlbmNoLlxuXHRcdC8vIFNvIHdlIGV4cGxpY2l0bHkgZm9jdXMgdGhlIHdvcmtiZW5jaCB3ZWIgY29udGVudHMgaGVyZSB0byBlbnN1cmUgaXQgZ2V0cyBmb2N1cy5cblx0XHR3aW4ud2ViQ29udGVudHMuZm9jdXMoKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBXaW5kb3cgQ29udHJvbCBPdmVybGF5c1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IHdpbmRvd0NvbnRyb2xIZWlnaHRTdGF0ZVN0b3JhZ2VLZXkgPSAnd2luZG93Q29udHJvbEhlaWdodCc7XG5cblx0cHJpdmF0ZSB3aW5kb3dDb250cm9sc0RpbW1lZCA9IGZhbHNlO1xuXHRwcml2YXRlIGxhc3RXaW5kb3dDb250cm9sQ29sb3JzOiB7IGJhY2tncm91bmRDb2xvcj86IHN0cmluZzsgZm9yZWdyb3VuZENvbG9yPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cblx0dXBkYXRlV2luZG93Q29udHJvbHMob3B0aW9uczogeyBoZWlnaHQ/OiBudW1iZXI7IGJhY2tncm91bmRDb2xvcj86IHN0cmluZzsgZm9yZWdyb3VuZENvbG9yPzogc3RyaW5nOyBkaW1tZWQ/OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHRjb25zdCB3aW4gPSB0aGlzLndpbjtcblx0XHRpZiAoIXdpbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENhY2hlIHRoZSBoZWlnaHQgZm9yIHNwZWVkcyBsb29rdXBzIG9uIHN0YXJ0dXBcblx0XHRpZiAob3B0aW9ucy5oZWlnaHQpIHtcblx0XHRcdHRoaXMuc3RhdGVTZXJ2aWNlLnNldEl0ZW0oKENvZGVXaW5kb3cud2luZG93Q29udHJvbEhlaWdodFN0YXRlU3RvcmFnZUtleSksIG9wdGlvbnMuaGVpZ2h0KTtcblx0XHR9XG5cblx0XHQvLyBXaW5kb3dzL0xpbnV4OiB1cGRhdGUgd2luZG93IGNvbnRyb2xzIHZpYSBzZXRUaXRsZUJhck92ZXJsYXkoKVxuXHRcdGlmICghaXNNYWNpbnRvc2ggJiYgdXNlV2luZG93Q29udHJvbHNPdmVybGF5KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cblx0XHRcdC8vIFVwZGF0ZSBkaW1tZWQgc3RhdGUgaWYgZXhwbGljaXRseSBwcm92aWRlZFxuXHRcdFx0aWYgKG9wdGlvbnMuZGltbWVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy53aW5kb3dDb250cm9sc0RpbW1lZCA9IG9wdGlvbnMuZGltbWVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBiYWNrZ3JvdW5kQ29sb3IgPSBvcHRpb25zLmJhY2tncm91bmRDb2xvciA/PyB0aGlzLmxhc3RXaW5kb3dDb250cm9sQ29sb3JzPy5iYWNrZ3JvdW5kQ29sb3I7XG5cdFx0XHRjb25zdCBmb3JlZ3JvdW5kQ29sb3IgPSBvcHRpb25zLmZvcmVncm91bmRDb2xvciA/PyB0aGlzLmxhc3RXaW5kb3dDb250cm9sQ29sb3JzPy5mb3JlZ3JvdW5kQ29sb3I7XG5cblx0XHRcdGlmIChvcHRpb25zLmJhY2tncm91bmRDb2xvciAhPT0gdW5kZWZpbmVkIHx8IG9wdGlvbnMuZm9yZWdyb3VuZENvbG9yICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5sYXN0V2luZG93Q29udHJvbENvbG9ycyA9IHsgYmFja2dyb3VuZENvbG9yLCBmb3JlZ3JvdW5kQ29sb3IgfTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZWZmZWN0aXZlQmFja2dyb3VuZENvbG9yID0gdGhpcy53aW5kb3dDb250cm9sc0RpbW1lZCAmJiBiYWNrZ3JvdW5kQ29sb3IgPyB0aGlzLmRpbUNvbG9yKGJhY2tncm91bmRDb2xvcikgOiBiYWNrZ3JvdW5kQ29sb3I7XG5cdFx0XHRjb25zdCBlZmZlY3RpdmVGb3JlZ3JvdW5kQ29sb3IgPSB0aGlzLndpbmRvd0NvbnRyb2xzRGltbWVkICYmIGZvcmVncm91bmRDb2xvciA/IHRoaXMuZGltQ29sb3IoZm9yZWdyb3VuZENvbG9yKSA6IGZvcmVncm91bmRDb2xvcjtcblxuXHRcdFx0d2luLnNldFRpdGxlQmFyT3ZlcmxheSh7XG5cdFx0XHRcdGNvbG9yOiBlZmZlY3RpdmVCYWNrZ3JvdW5kQ29sb3I/LnRyaW0oKSA9PT0gJycgPyB1bmRlZmluZWQgOiBlZmZlY3RpdmVCYWNrZ3JvdW5kQ29sb3IsXG5cdFx0XHRcdHN5bWJvbENvbG9yOiBlZmZlY3RpdmVGb3JlZ3JvdW5kQ29sb3I/LnRyaW0oKSA9PT0gJycgPyB1bmRlZmluZWQgOiBlZmZlY3RpdmVGb3JlZ3JvdW5kQ29sb3IsXG5cdFx0XHRcdGhlaWdodDogb3B0aW9ucy5oZWlnaHQgPyBvcHRpb25zLmhlaWdodCAtIDEgOiB1bmRlZmluZWQgLy8gYWNjb3VudCBmb3Igd2luZG93IGJvcmRlclxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gbWFjT1M6IHVwZGF0ZSB3aW5kb3cgY29udHJvbHMgdmlhIHNldFdpbmRvd0J1dHRvblBvc2l0aW9uKClcblx0XHRlbHNlIGlmIChpc01hY2ludG9zaCAmJiBvcHRpb25zLmhlaWdodCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBXaGVuIHRoZSBwb3NpdGlvbiBpcyBzZXQsIHRoZSBob3Jpem9udGFsIG1hcmdpbiBpcyBvZmZzZXQgdG8gZW5zdXJlXG5cdFx0XHQvLyB0aGUgZGlzdGFuY2UgYmV0d2VlbiB0aGUgdHJhZmZpYyBsaWdodHMgYW5kIHRoZSB3aW5kb3cgZnJhbWUgaXMgZXF1YWxcblx0XHRcdC8vIGluIGJvdGggZGlyZWN0aW9ucy5cblx0XHRcdGNvbnN0IGJ1dHRvbkhlaWdodCA9IGlzVGFob2VPck5ld2VyKHJlbGVhc2UoKSkgPyAxNCA6IDE2O1xuXHRcdFx0Y29uc3Qgb2Zmc2V0ID0gTWF0aC5mbG9vcigob3B0aW9ucy5oZWlnaHQgLSBidXR0b25IZWlnaHQpIC8gMik7XG5cdFx0XHRpZiAoIW9mZnNldCkge1xuXHRcdFx0XHR3aW4uc2V0V2luZG93QnV0dG9uUG9zaXRpb24obnVsbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3aW4uc2V0V2luZG93QnV0dG9uUG9zaXRpb24oeyB4OiBvZmZzZXQgKyAxLCB5OiBvZmZzZXQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkaW1Db2xvcihjb2xvcjogc3RyaW5nKTogc3RyaW5nIHtcblxuXHRcdC8vIEJsZW5kIGEgQ1NTIGNvbG9yIHdpdGggYmxhY2sgYXQgNTAlIG9wYWNpdHkgdG8gbWF0Y2ggdGhlXG5cdFx0Ly8gZGltbWluZyBvdmVybGF5IG9mIGByZ2JhKDAsIDAsIDAsIDAuNSlgIHVzZWQgYnkgbW9kYWxzLlxuXG5cdFx0Y29uc3QgcGFyc2VkID0gQ29sb3IuRm9ybWF0LkNTUy5wYXJzZShjb2xvcik7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybiBjb2xvcjtcblx0XHR9XG5cblx0XHRjb25zdCBkaW1GYWN0b3IgPSAwLjU7IC8vIDEgLSAwLjUgb3BhY2l0eSBvZiBibGFjayBvdmVybGF5XG5cdFx0Y29uc3QgciA9IE1hdGgucm91bmQocGFyc2VkLnJnYmEuciAqIGRpbUZhY3Rvcik7XG5cdFx0Y29uc3QgZyA9IE1hdGgucm91bmQocGFyc2VkLnJnYmEuZyAqIGRpbUZhY3Rvcik7XG5cdFx0Y29uc3QgYiA9IE1hdGgucm91bmQocGFyc2VkLnJnYmEuYiAqIGRpbUZhY3Rvcik7XG5cblx0XHRyZXR1cm4gYHJnYigke3J9LCAke2d9LCAke2J9KWA7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRnVsbHNjcmVlblxuXG5cdHByaXZhdGUgdHJhbnNpZW50SXNOYXRpdmVGdWxsU2NyZWVuOiBib29sZWFuIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGpvaW5OYXRpdmVGdWxsU2NyZWVuVHJhbnNpdGlvbjogRGVmZXJyZWRQcm9taXNlPGJvb2xlYW4+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHRvZ2dsZUZ1bGxTY3JlZW4oKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRGdWxsU2NyZWVuKCF0aGlzLmlzRnVsbFNjcmVlbiwgZmFsc2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHNldEZ1bGxTY3JlZW4oZnVsbHNjcmVlbjogYm9vbGVhbiwgZnJvbVJlc3RvcmU6IGJvb2xlYW4pOiB2b2lkIHtcblxuXHRcdC8vIFNldCBmdWxsc2NyZWVuIHN0YXRlXG5cdFx0aWYgKHVzZU5hdGl2ZUZ1bGxTY3JlZW4odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRcdHRoaXMuc2V0TmF0aXZlRnVsbFNjcmVlbihmdWxsc2NyZWVuLCBmcm9tUmVzdG9yZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2V0U2ltcGxlRnVsbFNjcmVlbihmdWxsc2NyZWVuKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgaXNGdWxsU2NyZWVuKCk6IGJvb2xlYW4ge1xuXHRcdGlmIChpc01hY2ludG9zaCAmJiB0eXBlb2YgdGhpcy50cmFuc2llbnRJc05hdGl2ZUZ1bGxTY3JlZW4gPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIHRoaXMudHJhbnNpZW50SXNOYXRpdmVGdWxsU2NyZWVuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpbiA9IHRoaXMud2luO1xuXHRcdGNvbnN0IGlzRnVsbFNjcmVlbiA9IHdpbj8uaXNGdWxsU2NyZWVuKCk7XG5cdFx0Y29uc3QgaXNTaW1wbGVGdWxsU2NyZWVuID0gd2luPy5pc1NpbXBsZUZ1bGxTY3JlZW4oKTtcblxuXHRcdHJldHVybiBCb29sZWFuKGlzRnVsbFNjcmVlbiB8fCBpc1NpbXBsZUZ1bGxTY3JlZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXROYXRpdmVGdWxsU2NyZWVuKGZ1bGxzY3JlZW46IGJvb2xlYW4sIGZyb21SZXN0b3JlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2luID0gdGhpcy53aW47XG5cdFx0aWYgKHdpbj8uaXNTaW1wbGVGdWxsU2NyZWVuKCkpIHtcblx0XHRcdHdpbj8uc2V0U2ltcGxlRnVsbFNjcmVlbihmYWxzZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kb1NldE5hdGl2ZUZ1bGxTY3JlZW4oZnVsbHNjcmVlbiwgZnJvbVJlc3RvcmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1NldE5hdGl2ZUZ1bGxTY3JlZW4oZnVsbHNjcmVlbjogYm9vbGVhbiwgZnJvbVJlc3RvcmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblxuXHRcdFx0Ly8gbWFjT1M6IEVsZWN0cm9uIHdpbmRvd3MgcmVwb3J0IGBmYWxzZWAgZm9yIGBpc0Z1bGxTY3JlZW4oKWAgZm9yIGFzIGxvbmdcblx0XHRcdC8vIGFzIHRoZSBmdWxsc2NyZWVuIHRyYW5zaXRpb24gYW5pbWF0aW9uIHRha2VzIHBsYWNlLiBBcyBzdWNoLCB3ZSBuZWVkIHRvXG5cdFx0XHQvLyBsaXN0ZW4gdG8gdGhlIHRyYW5zaXRpb24gZXZlbnRzIGFuZCBjYXJyeSBhcm91bmQgYW4gaW50ZXJtZWRpYXRlIHN0YXRlXG5cdFx0XHQvLyBmb3Iga25vd2luZyBpZiB3ZSBhcmUgaW4gZnVsbHNjcmVlbiBvciBub3Rcblx0XHRcdC8vIFJlZnM6IGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi9lbGVjdHJvbi9pc3N1ZXMvMzUzNjBcblxuXHRcdFx0dGhpcy50cmFuc2llbnRJc05hdGl2ZUZ1bGxTY3JlZW4gPSBmdWxsc2NyZWVuO1xuXG5cdFx0XHRjb25zdCBqb2luTmF0aXZlRnVsbFNjcmVlblRyYW5zaXRpb24gPSB0aGlzLmpvaW5OYXRpdmVGdWxsU2NyZWVuVHJhbnNpdGlvbiA9IG5ldyBEZWZlcnJlZFByb21pc2U8Ym9vbGVhbj4oKTtcblx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRyYW5zaXRpb25lZCA9IGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRcdFx0am9pbk5hdGl2ZUZ1bGxTY3JlZW5UcmFuc2l0aW9uLnAsXG5cdFx0XHRcdFx0dGltZW91dCgxMDAwMCkudGhlbigoKSA9PiBmYWxzZSlcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0aWYgKHRoaXMuam9pbk5hdGl2ZUZ1bGxTY3JlZW5UcmFuc2l0aW9uICE9PSBqb2luTmF0aXZlRnVsbFNjcmVlblRyYW5zaXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIGFub3RoZXIgdHJhbnNpdGlvbiB3YXMgcmVxdWVzdGVkIGxhdGVyXG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLnRyYW5zaWVudElzTmF0aXZlRnVsbFNjcmVlbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5qb2luTmF0aXZlRnVsbFNjcmVlblRyYW5zaXRpb24gPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0Ly8gVGhlcmUgaXMgb25lIGludGVyZXN0aW5nIGdvdGNoYSBvbiBtYWNPUzogd2hlbiB5b3UgYXJlIG9wZW5pbmcgYSBuZXdcblx0XHRcdFx0Ly8gd2luZG93IGZyb20gYSBmdWxsc2NyZWVuIHdpbmRvdywgdGhhdCBuZXcgd2luZG93IHdpbGwgaW1tZWRpYXRlbHlcblx0XHRcdFx0Ly8gb3BlbiBmdWxsc2NyZWVuIGFuZCBlbWl0IHRoZSBgZW50ZXItZnVsbC1zY3JlZW5gIGV2ZW50IGV2ZW4gYmVmb3JlIHdlXG5cdFx0XHRcdC8vIHJlYWNoIHRoaXMgbWV0aG9kLiBJbiB0aGF0IGNhc2UsIHdlIGFjdHVhbGx5IHdpbGwgdGltZW91dCBhZnRlciAxMHNcblx0XHRcdFx0Ly8gZm9yIGRldGVjdGluZyB0aGUgdHJhbnNpdGlvbiBhbmQgYXMgc3VjaCBpdCBpcyBpbXBvcnRhbnQgdGhhdCB3ZSBvbmx5XG5cdFx0XHRcdC8vIHNpZ25hbCB0byBsZWF2ZSBmdWxsc2NyZWVuIGlmIHRoZSB3aW5kb3cgcmVwb3J0cyBhcyBub3QgYmVpbmcgaW4gZnVsbHNjcmVlbi5cblxuXHRcdFx0XHRpZiAoIXRyYW5zaXRpb25lZCAmJiBmdWxsc2NyZWVuICYmIGZyb21SZXN0b3JlICYmIHRoaXMud2luICYmICF0aGlzLndpbi5pc0Z1bGxTY3JlZW4oKSkge1xuXG5cdFx0XHRcdFx0Ly8gV2UgaGF2ZSBzZWVuIHJlcXVlc3RzIGZvciBmdWxsc2NyZWVuIGZhaWxpbmcgZXZlbnR1YWxseSBhZnRlciBzb21lXG5cdFx0XHRcdFx0Ly8gdGltZSwgZm9yIGV4YW1wbGUgd2hlbiBhbiBPUyB1cGRhdGUgd2FzIHBlcmZvcm1lZCBhbmQgd2luZG93cyByZXN0b3JlLlxuXHRcdFx0XHRcdC8vIEluIHRob3NlIGNhc2VzIGEgdXNlciB3b3VsZCBmaW5kIGEgd2luZG93IHRoYXQgaXMgbm90IGluIGZ1bGxzY3JlZW5cblx0XHRcdFx0XHQvLyBidXQgYWxzbyBkb2VzIG5vdCBzaG93IGFueSBjdXN0b20gdGl0bGViYXIgKGFuZCB0aHVzIHdpbmRvdyBjb250cm9scylcblx0XHRcdFx0XHQvLyBiZWNhdXNlIHdlIHRoaW5rIHRoZSB3aW5kb3cgaXMgaW4gZnVsbHNjcmVlbi5cblx0XHRcdFx0XHQvL1xuXHRcdFx0XHRcdC8vIEFzIGEgd29ya2Fyb3VuZCBpbiB0aGF0IGNhc2Ugd2UgZW1pdCBhIHdhcm5pbmcgYW5kIGxlYXZlIGZ1bGxzY3JlZW5cblx0XHRcdFx0XHQvLyBzbyB0aGF0IGF0IGxlYXN0IHRoZSB3aW5kb3cgY29udHJvbHMgYXJlIGJhY2suXG5cblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2Fybignd2luZG93OiBuYXRpdmUgbWFjT1MgZnVsbHNjcmVlbiB0cmFuc2l0aW9uIGRpZCBub3QgaGFwcGVuIHdpdGhpbiAxMHMgZnJvbSByZXN0b3JpbmcnKTtcblxuXHRcdFx0XHRcdHRoaXMuX29uRGlkTGVhdmVGdWxsU2NyZWVuLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHR9XG5cblx0XHRjb25zdCB3aW4gPSB0aGlzLndpbjtcblx0XHR3aW4/LnNldEZ1bGxTY3JlZW4oZnVsbHNjcmVlbik7XG5cdH1cblxuXHRwcml2YXRlIHNldFNpbXBsZUZ1bGxTY3JlZW4oZnVsbHNjcmVlbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHdpbiA9IHRoaXMud2luO1xuXHRcdGlmICh3aW4/LmlzRnVsbFNjcmVlbigpKSB7XG5cdFx0XHR0aGlzLmRvU2V0TmF0aXZlRnVsbFNjcmVlbihmYWxzZSwgZmFsc2UpO1xuXHRcdH1cblxuXHRcdHdpbj8uc2V0U2ltcGxlRnVsbFNjcmVlbihmdWxsc2NyZWVuKTtcblx0XHR3aW4/LndlYkNvbnRlbnRzLmZvY3VzKCk7IC8vIHdvcmthcm91bmQgaXNzdWUgd2hlcmUgZm9jdXMgaXMgbm90IGdvaW5nIGludG8gd2luZG93XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRhYnN0cmFjdCBtYXRjaGVzKHdlYkNvbnRlbnRzOiBlbGVjdHJvbi5XZWJDb250ZW50cyk6IGJvb2xlYW47XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl93aW4gPSBudWxsITsgLy8gSW1wb3J0YW50IHRvIGRlcmVmZXJlbmNlIHRoZSB3aW5kb3cgb2JqZWN0IHRvIGFsbG93IGZvciBHQ1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb2RlV2luZG93IGV4dGVuZHMgQmFzZVdpbmRvdyBpbXBsZW1lbnRzIElDb2RlV2luZG93IHtcblxuXHQvLyNyZWdpb24gRXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsTG9hZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElMb2FkRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxMb2FkID0gdGhpcy5fb25XaWxsTG9hZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNpZ25hbFJlYWR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2lnbmFsUmVhZHkgPSB0aGlzLl9vbkRpZFNpZ25hbFJlYWR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGVzdHJveSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZERlc3Ryb3kgPSB0aGlzLl9vbkRpZERlc3Ryb3kuZXZlbnQ7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHQvLyNyZWdpb24gUHJvcGVydGllc1xuXG5cdHByaXZhdGUgX2lkOiBudW1iZXI7XG5cdGdldCBpZCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5faWQ7IH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3dpbjogZWxlY3Ryb24uQnJvd3NlcldpbmRvdztcblxuXHRnZXQgYmFja3VwUGF0aCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fY29uZmlnPy5iYWNrdXBQYXRoOyB9XG5cblx0Z2V0IG9wZW5lZFdvcmtzcGFjZSgpOiBJV29ya3NwYWNlSWRlbnRpZmllciB8IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2NvbmZpZz8ud29ya3NwYWNlOyB9XG5cblx0Z2V0IHByb2ZpbGUoKTogSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmNvbmZpZykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9maWxlID0gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5maW5kKHByb2ZpbGUgPT4gcHJvZmlsZS5pZCA9PT0gdGhpcy5jb25maWc/LnByb2ZpbGVzLnByb2ZpbGUuaWQpO1xuXHRcdGlmICh0aGlzLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnRIb3N0ICYmIHByb2ZpbGUpIHtcblx0XHRcdHJldHVybiBwcm9maWxlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmdldFByb2ZpbGVGb3JXb3Jrc3BhY2UodGhpcy5jb25maWcud29ya3NwYWNlID8/IHRvV29ya3NwYWNlSWRlbnRpZmllcih0aGlzLmJhY2t1cFBhdGgsIHRoaXMuaXNFeHRlbnNpb25EZXZlbG9wbWVudEhvc3QpKSA/PyB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlO1xuXHR9XG5cblx0Z2V0IHJlbW90ZUF1dGhvcml0eSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fY29uZmlnPy5yZW1vdGVBdXRob3JpdHk7IH1cblxuXHRwcml2YXRlIF9jb25maWc6IElOYXRpdmVXaW5kb3dDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkO1xuXHRnZXQgY29uZmlnKCk6IElOYXRpdmVXaW5kb3dDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2NvbmZpZzsgfVxuXG5cdGdldCBpc0V4dGVuc2lvbkRldmVsb3BtZW50SG9zdCgpOiBib29sZWFuIHsgcmV0dXJuICEhKHRoaXMuX2NvbmZpZz8uZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoKTsgfVxuXG5cdGdldCBpc0V4dGVuc2lvblRlc3RIb3N0KCk6IGJvb2xlYW4geyByZXR1cm4gISEodGhpcy5fY29uZmlnPy5leHRlbnNpb25UZXN0c1BhdGgpOyB9XG5cblx0Z2V0IGlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnRUZXN0RnJvbUNsaSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuaXNFeHRlbnNpb25EZXZlbG9wbWVudEhvc3QgJiYgdGhpcy5pc0V4dGVuc2lvblRlc3RIb3N0ICYmICF0aGlzLl9jb25maWc/LmRlYnVnSWQ7IH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIHJlYWRvbmx5IHdpbmRvd1N0YXRlOiBJV2luZG93U3RhdGU7XG5cdHByaXZhdGUgY3VycmVudE1lbnVCYXJWaXNpYmlsaXR5OiBNZW51QmFyVmlzaWJpbGl0eSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHdoZW5SZWFkeUNhbGxiYWNrczogeyAod2luZG93OiBJQ29kZVdpbmRvdyk6IHZvaWQgfVtdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSB0b3VjaEJhckdyb3VwczogZWxlY3Ryb24uVG91Y2hCYXJTZWdtZW50ZWRDb250cm9sW10gPSBbXTtcblxuXHRwcml2YXRlIGN1cnJlbnRIdHRwUHJveHk6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50Tm9Qcm94eTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgY3VzdG9tWm9vbUxldmVsOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb25maWdPYmplY3RVcmw6IElJUENPYmplY3RVcmw8SU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb24+O1xuXHRwcml2YXRlIHBlbmRpbmdMb2FkQ29uZmlnOiBJTmF0aXZlV2luZG93Q29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB3YXNMb2FkZWQgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGpzQ2FsbFN0YWNrTWFwOiBNYXA8c3RyaW5nLCBudW1iZXI+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGpzQ2FsbFN0YWNrRWZmZWN0aXZlU2FtcGxlQ291bnQ6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBqc0NhbGxTdGFja0NvbGxlY3RvcjogRGVsYXllcjx2b2lkPjtcblx0cHJpdmF0ZSByZWFkb25seSBqc0NhbGxTdGFja0NvbGxlY3RvclN0b3BTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29uZmlnOiBJV2luZG93Q3JlYXRpb25PcHRpb25zLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUxvZ2dlck1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nZ2VyTWFpblNlcnZpY2U6IElMb2dnZXJNYWluU2VydmljZSxcblx0XHRASUVudmlyb25tZW50TWFpblNlcnZpY2UgZW52aXJvbm1lbnRNYWluU2VydmljZTogSUVudmlyb25tZW50TWFpblNlcnZpY2UsXG5cdFx0QElQb2xpY3lTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcG9saWN5U2VydmljZTogSVBvbGljeVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2U6IElBcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSxcblx0XHRASVN0b3JhZ2VNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VNYWluU2VydmljZTogSVN0b3JhZ2VNYWluU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZU1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVNYWluU2VydmljZTogSVRoZW1lTWFpblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZTogSVdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UsXG5cdFx0QElCYWNrdXBNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGJhY2t1cE1haW5TZXJ2aWNlOiBJQmFja3VwTWFpblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElEaWFsb2dNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ01haW5TZXJ2aWNlOiBJRGlhbG9nTWFpblNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZU1haW5TZXJ2aWNlOiBJTGlmZWN5Y2xlTWFpblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElQcm90b2NvbE1haW5TZXJ2aWNlIHByb3RvY29sTWFpblNlcnZpY2U6IElQcm90b2NvbE1haW5TZXJ2aWNlLFxuXHRcdEBJV2luZG93c01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd2luZG93c01haW5TZXJ2aWNlOiBJV2luZG93c01haW5TZXJ2aWNlLFxuXHRcdEBJU3RhdGVTZXJ2aWNlIHN0YXRlU2VydmljZTogSVN0YXRlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoY29uZmlndXJhdGlvblNlcnZpY2UsIHN0YXRlU2VydmljZSwgZW52aXJvbm1lbnRNYWluU2VydmljZSwgbG9nU2VydmljZSk7XG5cblx0XHQvLyNyZWdpb24gY3JlYXRlIGJyb3dzZXIgd2luZG93XG5cdFx0e1xuXHRcdFx0dGhpcy5jb25maWdPYmplY3RVcmwgPSB0aGlzLl9yZWdpc3Rlcihwcm90b2NvbE1haW5TZXJ2aWNlLmNyZWF0ZUlQQ09iamVjdFVybDxJTmF0aXZlV2luZG93Q29uZmlndXJhdGlvbj4oKSk7XG5cblx0XHRcdC8vIExvYWQgd2luZG93IHN0YXRlXG5cdFx0XHRjb25zdCBbc3RhdGUsIGhhc011bHRpcGxlRGlzcGxheXNdID0gdGhpcy5yZXN0b3JlV2luZG93U3RhdGUoY29uZmlnLnN0YXRlKTtcblx0XHRcdHRoaXMud2luZG93U3RhdGUgPSBzdGF0ZTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnd2luZG93I2N0b3I6IHVzaW5nIHdpbmRvdyBzdGF0ZScsIHN0YXRlKTtcblxuXHRcdFx0Y29uc3Qgd2ViUHJlZmVyZW5jZXM6IGVsZWN0cm9uLldlYlByZWZlcmVuY2VzID0ge1xuXHRcdFx0XHRwcmVsb2FkOiBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvYmFzZS9wYXJ0cy9zYW5kYm94L2VsZWN0cm9uLWJyb3dzZXIvcHJlbG9hZC5qcycpLmZzUGF0aCxcblx0XHRcdFx0YWRkaXRpb25hbEFyZ3VtZW50czogW2AtLXZzY29kZS13aW5kb3ctY29uZmlnPSR7dGhpcy5jb25maWdPYmplY3RVcmwucmVzb3VyY2UudG9TdHJpbmcoKX1gXSxcblx0XHRcdFx0djhDYWNoZU9wdGlvbnM6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS51c2VDb2RlQ2FjaGUgPyAnYnlwYXNzSGVhdENoZWNrJyA6ICdub25lJ1xuXHRcdFx0fTtcblx0XHRcdGlmIChjb25maWcuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0XHR3ZWJQcmVmZXJlbmNlcy5iYWNrZ3JvdW5kVGhyb3R0bGluZyA9IGZhbHNlOyAvLyBrZWVwIGFnZW50cyB3aW5kb3cgcmVzcG9uc2l2ZSB3aGVuIGluIGJhY2tncm91bmRcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGRlZmF1bHRCcm93c2VyV2luZG93T3B0aW9ucywgdGhpcy53aW5kb3dTdGF0ZSwgdW5kZWZpbmVkLCB3ZWJQcmVmZXJlbmNlcyk7XG5cblx0XHRcdC8vIENyZWF0ZSB0aGUgYnJvd3NlciB3aW5kb3dcblx0XHRcdG1hcmsoJ2NvZGUvd2lsbENyZWF0ZUNvZGVCcm93c2VyV2luZG93Jyk7XG5cdFx0XHR0aGlzLl93aW4gPSBuZXcgZWxlY3Ryb24uQnJvd3NlcldpbmRvdyhvcHRpb25zKTtcblx0XHRcdG1hcmsoJ2NvZGUvZGlkQ3JlYXRlQ29kZUJyb3dzZXJXaW5kb3cnKTtcblxuXHRcdFx0dGhpcy5faWQgPSB0aGlzLl93aW4uaWQ7XG5cdFx0XHR0aGlzLnNldFdpbih0aGlzLl93aW4sIG9wdGlvbnMpO1xuXG5cdFx0XHQvLyBBcHBseSBzb21lIHN0YXRlIGFmdGVyIHdpbmRvdyBjcmVhdGlvblxuXHRcdFx0dGhpcy5hcHBseVN0YXRlKHRoaXMud2luZG93U3RhdGUsIGhhc011bHRpcGxlRGlzcGxheXMpO1xuXG5cdFx0XHR0aGlzLl9sYXN0Rm9jdXNUaW1lID0gRGF0ZS5ub3coKTsgLy8gc2luY2Ugd2Ugc2hvdyBkaXJlY3RseSwgd2UgbmVlZCB0byBzZXQgdGhlIGxhc3QgZm9jdXMgdGltZSB0b29cblx0XHR9XG5cdFx0Ly8jZW5kcmVnaW9uXG5cblx0XHQvLyNyZWdpb24gSlMgQ2FsbHN0YWNrIENvbGxlY3RvclxuXG5cdFx0bGV0IHNhbXBsZUludGVydmFsID0gcGFyc2VJbnQodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3NbJ3VucmVzcG9uc2l2ZS1zYW1wbGUtaW50ZXJ2YWwnXSB8fCAnMTAwMCcpO1xuXHRcdGxldCBzYW1wbGVQZXJpb2QgPSBwYXJzZUludCh0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJnc1sndW5yZXNwb25zaXZlLXNhbXBsZS1wZXJpb2QnXSB8fCAnMTUwMDAnKTtcblx0XHRpZiAoc2FtcGxlSW50ZXJ2YWwgPD0gMCB8fCBzYW1wbGVQZXJpb2QgPD0gMCB8fCBzYW1wbGVJbnRlcnZhbCA+IHNhbXBsZVBlcmlvZCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEludmFsaWQgdW5yZXNwb25zaXZlIHNhbXBsZSBpbnRlcnZhbCAoJHtzYW1wbGVJbnRlcnZhbH1tcykgb3IgcGVyaW9kICgke3NhbXBsZVBlcmlvZH1tcyksIHVzaW5nIGRlZmF1bHRzLmApO1xuXHRcdFx0c2FtcGxlSW50ZXJ2YWwgPSAxMDAwO1xuXHRcdFx0c2FtcGxlUGVyaW9kID0gMTUwMDA7XG5cdFx0fVxuXG5cdFx0dGhpcy5qc0NhbGxTdGFja01hcCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0dGhpcy5qc0NhbGxTdGFja0VmZmVjdGl2ZVNhbXBsZUNvdW50ID0gTWF0aC5yb3VuZChzYW1wbGVQZXJpb2QgLyBzYW1wbGVJbnRlcnZhbCk7XG5cdFx0dGhpcy5qc0NhbGxTdGFja0NvbGxlY3RvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KHNhbXBsZUludGVydmFsKSk7XG5cdFx0dGhpcy5qc0NhbGxTdGFja0NvbGxlY3RvclN0b3BTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR0aGlzLnN0b3BDb2xsZWN0aW5nSlNjYWxsU3RhY2tzKCk7IC8vIFN0b3AgY29sbGVjdGluZyBhZnRlciAxNXMgbWF4XG5cdFx0fSwgc2FtcGxlUGVyaW9kKSk7XG5cblx0XHQvLyNlbmRyZWdpb25cblxuXHRcdC8vIHJlc3BlY3QgY29uZmlndXJlZCBtZW51IGJhciB2aXNpYmlsaXR5XG5cdFx0dGhpcy5vbkNvbmZpZ3VyYXRpb25VcGRhdGVkKCk7XG5cblx0XHQvLyBtYWNPUzogdG91Y2ggYmFyIHN1cHBvcnRcblx0XHR0aGlzLmNyZWF0ZVRvdWNoQmFyKCk7XG5cblx0XHQvLyBFdmVudGluZ1xuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZHlTdGF0ZSA9IFJlYWR5U3RhdGUuTk9ORTtcblxuXHRzZXRSZWFkeSgpOiB2b2lkIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYHdpbmRvdyNsb2FkOiB3aW5kb3cgcmVwb3J0ZWQgcmVhZHkgKGlkOiAke3RoaXMuX2lkfSlgKTtcblxuXHRcdHRoaXMucmVhZHlTdGF0ZSA9IFJlYWR5U3RhdGUuUkVBRFk7XG5cblx0XHQvLyBpbmZvcm0gYWxsIHdhaXRpbmcgcHJvbWlzZXMgdGhhdCB3ZSBhcmUgcmVhZHkgbm93XG5cdFx0d2hpbGUgKHRoaXMud2hlblJlYWR5Q2FsbGJhY2tzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy53aGVuUmVhZHlDYWxsYmFja3MucG9wKCkhKHRoaXMpO1xuXHRcdH1cblxuXHRcdC8vIEV2ZW50c1xuXHRcdHRoaXMuX29uRGlkU2lnbmFsUmVhZHkuZmlyZSgpO1xuXHR9XG5cblx0cmVhZHkoKTogUHJvbWlzZTxJQ29kZVdpbmRvdz4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxJQ29kZVdpbmRvdz4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc1JlYWR5KSB7XG5cdFx0XHRcdHJldHVybiByZXNvbHZlKHRoaXMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBvdGhlcndpc2Uga2VlcCBhbmQgY2FsbCBsYXRlciB3aGVuIHdlIGFyZSByZWFkeVxuXHRcdFx0dGhpcy53aGVuUmVhZHlDYWxsYmFja3MucHVzaChyZXNvbHZlKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldCBpc1JlYWR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJlYWR5U3RhdGUgPT09IFJlYWR5U3RhdGUuUkVBRFk7XG5cdH1cblxuXHRnZXQgd2hlbkNsb3NlZE9yTG9hZGVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblxuXHRcdFx0ZnVuY3Rpb24gaGFuZGxlKCkge1xuXHRcdFx0XHRjbG9zZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0bG9hZExpc3RlbmVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNsb3NlTGlzdGVuZXIgPSB0aGlzLm9uRGlkQ2xvc2UoKCkgPT4gaGFuZGxlKCkpO1xuXHRcdFx0Y29uc3QgbG9hZExpc3RlbmVyID0gdGhpcy5vbldpbGxMb2FkKCgpID0+IGhhbmRsZSgpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBXaW5kb3cgZXJyb3IgY29uZGl0aW9ucyB0byBoYW5kbGVcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcih0aGlzLl93aW4sICd1bnJlc3BvbnNpdmUnKSgoKSA9PiB0aGlzLm9uV2luZG93RXJyb3IoV2luZG93RXJyb3IuVU5SRVNQT05TSVZFKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHRoaXMuX3dpbiwgJ3Jlc3BvbnNpdmUnKSgoKSA9PiB0aGlzLm9uV2luZG93RXJyb3IoV2luZG93RXJyb3IuUkVTUE9OU0lWRSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcih0aGlzLl93aW4ud2ViQ29udGVudHMsICdyZW5kZXItcHJvY2Vzcy1nb25lJywgKGV2ZW50LCBkZXRhaWxzKSA9PiBkZXRhaWxzKShkZXRhaWxzID0+IHRoaXMub25XaW5kb3dFcnJvcihXaW5kb3dFcnJvci5QUk9DRVNTX0dPTkUsIHsgLi4uZGV0YWlscyB9KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHRoaXMuX3dpbi53ZWJDb250ZW50cywgJ2RpZC1mYWlsLWxvYWQnLCAoZXZlbnQsIGV4aXRDb2RlLCByZWFzb24pID0+ICh7IGV4aXRDb2RlLCByZWFzb24gfSkpKCh7IGV4aXRDb2RlLCByZWFzb24gfSkgPT4gdGhpcy5vbldpbmRvd0Vycm9yKFdpbmRvd0Vycm9yLkxPQUQsIHsgcmVhc29uLCBleGl0Q29kZSB9KSkpO1xuXG5cdFx0Ly8gUHJldmVudCB3aW5kb3dzL2lmcmFtZXMgZnJvbSBibG9ja2luZyB0aGUgdW5sb2FkXG5cdFx0Ly8gdGhyb3VnaCBET00gZXZlbnRzLiBXZSBoYXZlIG91ciBvd24gbG9naWMgZm9yXG5cdFx0Ly8gdW5sb2FkaW5nIGEgd2luZG93IHRoYXQgc2hvdWxkIG5vdCBiZSBjb25mdXNlZFxuXHRcdC8vIHdpdGggdGhlIERPTSB3YXkuXG5cdFx0Ly8gKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjI3MzYpXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXI8ZWxlY3Ryb24uRXZlbnQ+KHRoaXMuX3dpbi53ZWJDb250ZW50cywgJ3dpbGwtcHJldmVudC11bmxvYWQnKShldmVudCA9PiBldmVudC5wcmV2ZW50RGVmYXVsdCgpKSk7XG5cblx0XHQvLyBSZW1lbWJlciB0aGF0IHdlIGxvYWRlZFxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHRoaXMuX3dpbi53ZWJDb250ZW50cywgJ2RpZC1maW5pc2gtbG9hZCcpKCgpID0+IHtcblxuXHRcdFx0Ly8gQXNzb2NpYXRlIHByb3BlcnRpZXMgZnJvbSB0aGUgbG9hZCByZXF1ZXN0IGlmIHByb3ZpZGVkXG5cdFx0XHRpZiAodGhpcy5wZW5kaW5nTG9hZENvbmZpZykge1xuXHRcdFx0XHR0aGlzLl9jb25maWcgPSB0aGlzLnBlbmRpbmdMb2FkQ29uZmlnO1xuXG5cdFx0XHRcdHRoaXMucGVuZGluZ0xvYWRDb25maWcgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV2luZG93IChVbilNYXhpbWl6ZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRNYXhpbWl6ZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY29uZmlnKSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZy5tYXhpbWl6ZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRVbm1heGltaXplKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jb25maWcpIHtcblx0XHRcdFx0dGhpcy5fY29uZmlnLm1heGltaXplZCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdpbmRvdyBGdWxsc2NyZWVuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZEVudGVyRnVsbFNjcmVlbigoKSA9PiB7XG5cdFx0XHR0aGlzLnNlbmRXaGVuUmVhZHkoJ3ZzY29kZTplbnRlckZ1bGxTY3JlZW4nLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkTGVhdmVGdWxsU2NyZWVuKCgpID0+IHtcblx0XHRcdHRoaXMuc2VuZFdoZW5SZWFkeSgndnNjb2RlOmxlYXZlRnVsbFNjcmVlbicsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhhbmRsZSBjb25maWd1cmF0aW9uIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHRoaXMub25Db25maWd1cmF0aW9uVXBkYXRlZChlKSkpO1xuXG5cdFx0Ly8gSGFuZGxlIFdvcmtzcGFjZSBldmVudHNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2Uub25EaWREZWxldGVVbnRpdGxlZFdvcmtzcGFjZShlID0+IHRoaXMub25EaWREZWxldGVVbnRpdGxlZFdvcmtzcGFjZShlKSkpO1xuXG5cdFx0Ly8gSW5qZWN0IGhlYWRlcnMgd2hlbiByZXF1ZXN0cyBhcmUgaW5jb21pbmdcblx0XHRjb25zdCB1cmxzID0gWydodHRwczovLyoudnNhc3NldHMuaW8vKiddO1xuXHRcdGlmICh0aGlzLnByb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvbnNHYWxsZXJ5Py5zZXJ2aWNlVXJsKSB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlVXJsID0gVVJJLnBhcnNlKHRoaXMucHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uc0dhbGxlcnkuc2VydmljZVVybCk7XG5cdFx0XHR1cmxzLnB1c2goYCR7c2VydmljZVVybC5zY2hlbWV9Oi8vJHtzZXJ2aWNlVXJsLmF1dGhvcml0eX0vKmApO1xuXHRcdH1cblx0XHR0aGlzLl93aW4ud2ViQ29udGVudHMuc2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uQmVmb3JlU2VuZEhlYWRlcnMoeyB1cmxzIH0sIGFzeW5jIChkZXRhaWxzLCBjYikgPT4ge1xuXHRcdFx0Y29uc3QgaGVhZGVycyA9IGF3YWl0IHRoaXMuZ2V0TWFya2V0cGxhY2VIZWFkZXJzKCk7XG5cblx0XHRcdGNiKHsgY2FuY2VsOiBmYWxzZSwgcmVxdWVzdEhlYWRlcnM6IE9iamVjdC5hc3NpZ24oZGV0YWlscy5yZXF1ZXN0SGVhZGVycywgaGVhZGVycykgfSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIG1hcmtldHBsYWNlSGVhZGVyc1Byb21pc2U6IFByb21pc2U8b2JqZWN0PiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXRNYXJrZXRwbGFjZUhlYWRlcnMoKTogUHJvbWlzZTxvYmplY3Q+IHtcblx0XHRpZiAoIXRoaXMubWFya2V0cGxhY2VIZWFkZXJzUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5tYXJrZXRwbGFjZUhlYWRlcnNQcm9taXNlID0gcmVzb2x2ZU1hcmtldHBsYWNlSGVhZGVycyhcblx0XHRcdFx0dGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLFxuXHRcdFx0XHR0aGlzLnByb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuZmlsZVNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuYXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UsXG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubWFya2V0cGxhY2VIZWFkZXJzUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25XaW5kb3dFcnJvcihlcnJvcjogV2luZG93RXJyb3IuVU5SRVNQT05TSVZFKTogUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSBhc3luYyBvbldpbmRvd0Vycm9yKGVycm9yOiBXaW5kb3dFcnJvci5SRVNQT05TSVZFKTogUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSBhc3luYyBvbldpbmRvd0Vycm9yKGVycm9yOiBXaW5kb3dFcnJvci5QUk9DRVNTX0dPTkUsIGRldGFpbHM6IHsgcmVhc29uOiBzdHJpbmc7IGV4aXRDb2RlOiBudW1iZXIgfSk6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgYXN5bmMgb25XaW5kb3dFcnJvcihlcnJvcjogV2luZG93RXJyb3IuTE9BRCwgZGV0YWlsczogeyByZWFzb246IHN0cmluZzsgZXhpdENvZGU6IG51bWJlciB9KTogUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSBhc3luYyBvbldpbmRvd0Vycm9yKHR5cGU6IFdpbmRvd0Vycm9yLCBkZXRhaWxzPzogeyByZWFzb24/OiBzdHJpbmc7IGV4aXRDb2RlPzogbnVtYmVyIH0pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBXaW5kb3dFcnJvci5QUk9DRVNTX0dPTkU6XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgQ29kZVdpbmRvdzogcmVuZGVyZXIgcHJvY2VzcyBnb25lIChyZWFzb246ICR7ZGV0YWlscz8ucmVhc29uIHx8ICc8dW5rbm93bj4nfSwgY29kZTogJHtkZXRhaWxzPy5leGl0Q29kZSB8fCAnPHVua25vd24+J30pYCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBXaW5kb3dFcnJvci5VTlJFU1BPTlNJVkU6XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignQ29kZVdpbmRvdzogZGV0ZWN0ZWQgdW5yZXNwb25zaXZlJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBXaW5kb3dFcnJvci5SRVNQT05TSVZFOlxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0NvZGVXaW5kb3c6IHJlY292ZXJlZCBmcm9tIHVucmVzcG9uc2l2ZScpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgV2luZG93RXJyb3IuTE9BRDpcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBDb2RlV2luZG93OiBmYWlsZWQgdG8gbG9hZCAocmVhc29uOiAke2RldGFpbHM/LnJlYXNvbiB8fCAnPHVua25vd24+J30sIGNvZGU6ICR7ZGV0YWlscz8uZXhpdENvZGUgfHwgJzx1bmtub3duPid9KWApO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHQvLyBUZWxlbWV0cnlcblx0XHR0eXBlIFdpbmRvd0Vycm9yQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHR0eXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHR5cGUgb2Ygd2luZG93IGVycm9yIHRvIHVuZGVyc3RhbmQgdGhlIG5hdHVyZSBvZiB0aGUgZXJyb3IgYmV0dGVyLicgfTtcblx0XHRcdHJlYXNvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSByZWFzb24gb2YgdGhlIHdpbmRvdyBlcnJvciB0byB1bmRlcnN0YW5kIHRoZSBuYXR1cmUgb2YgdGhlIGVycm9yIGJldHRlci4nIH07XG5cdFx0XHRjb2RlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGV4aXQgY29kZSBvZiB0aGUgd2luZG93IHByb2Nlc3MgdG8gdW5kZXJzdGFuZCB0aGUgbmF0dXJlIG9mIHRoZSBlcnJvciBiZXR0ZXInIH07XG5cdFx0XHRvd25lcjogJ2JwYXNlcm8nO1xuXHRcdFx0Y29tbWVudDogJ1Byb3ZpZGVzIGluc2lnaHQgaW50byByZWFzb25zIHRoZSB2c2NvZGUgd2luZG93IGhhZCBhbiBlcnJvci4nO1xuXHRcdH07XG5cdFx0dHlwZSBXaW5kb3dFcnJvckV2ZW50ID0ge1xuXHRcdFx0dHlwZTogV2luZG93RXJyb3I7XG5cdFx0XHRyZWFzb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGNvZGU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdpbmRvd0Vycm9yRXZlbnQsIFdpbmRvd0Vycm9yQ2xhc3NpZmljYXRpb24+KCd3aW5kb3dlcnJvcicsIHtcblx0XHRcdHR5cGUsXG5cdFx0XHRyZWFzb246IGRldGFpbHM/LnJlYXNvbixcblx0XHRcdGNvZGU6IGRldGFpbHM/LmV4aXRDb2RlXG5cdFx0fSk7XG5cblx0XHQvLyBJbmZvcm0gVXNlciBpZiBub24tcmVjb3ZlcmFibGVcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgV2luZG93RXJyb3IuVU5SRVNQT05TSVZFOlxuXHRcdFx0Y2FzZSBXaW5kb3dFcnJvci5QUk9DRVNTX0dPTkU6XG5cblx0XHRcdFx0Ly8gSWYgd2UgcnVuIGV4dGVuc2lvbiB0ZXN0cyBmcm9tIENMSSwgd2Ugd2FudCB0byBzaWduYWxcblx0XHRcdFx0Ly8gYmFjayB0aGlzIHN0YXRlIHRvIHRoZSB0ZXN0IHJ1bm5lciBieSBleGl0aW5nIHdpdGggYVxuXHRcdFx0XHQvLyBub24temVybyBleGl0IGNvZGUuXG5cdFx0XHRcdGlmICh0aGlzLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnRUZXN0RnJvbUNsaSkge1xuXHRcdFx0XHRcdHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2Uua2lsbCgxKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJZiB3ZSBydW4gc21va2UgdGVzdHMsIHdhbnQgdG8gcHJvY2VlZCB3aXRoIGFuIG9yZGVybHlcblx0XHRcdFx0Ly8gc2h1dGRvd24gYXMgbXVjaCBhcyBwb3NzaWJsZSBieSBkZXN0cm95aW5nIHRoZSB3aW5kb3dcblx0XHRcdFx0Ly8gYW5kIHRoZW4gY2FsbGluZyB0aGUgbm9ybWFsIGBxdWl0YCByb3V0aW5lLlxuXHRcdFx0XHRpZiAodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3NbJ2VuYWJsZS1zbW9rZS10ZXN0LWRyaXZlciddKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kZXN0cm95V2luZG93KGZhbHNlLCBmYWxzZSk7XG5cdFx0XHRcdFx0dGhpcy5saWZlY3ljbGVNYWluU2VydmljZS5xdWl0KCk7IC8vIHN0aWxsIGFsbG93IGZvciBhbiBvcmRlcmx5IHNodXRkb3duXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVW5yZXNwb25zaXZlXG5cdFx0XHRcdGlmICh0eXBlID09PSBXaW5kb3dFcnJvci5VTlJFU1BPTlNJVkUpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5pc0V4dGVuc2lvbkRldmVsb3BtZW50SG9zdCB8fCB0aGlzLmlzRXh0ZW5zaW9uVGVzdEhvc3QgfHwgdGhpcy5fd2luPy53ZWJDb250ZW50cz8uaXNEZXZUb29sc09wZW5lZCgpKSB7XG5cdFx0XHRcdFx0XHQvLyBUT0RPQGVsZWN0cm9uIFdvcmthcm91bmQgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy81Njk5NFxuXHRcdFx0XHRcdFx0Ly8gSW4gY2VydGFpbiBjYXNlcyB0aGUgd2luZG93IGNhbiByZXBvcnQgdW5yZXNwb25zaXZlbmVzcyBiZWNhdXNlIGEgYnJlYWtwb2ludCB3YXMgaGl0XG5cdFx0XHRcdFx0XHQvLyBhbmQgdGhlIHByb2Nlc3MgaXMgc3RvcHBlZCBleGVjdXRpbmcuIFRoZSBtb3N0IHR5cGljYWwgY2FzZXMgYXJlOlxuXHRcdFx0XHRcdFx0Ly8gLSBkZXZ0b29scyBhcmUgb3BlbmVkIGFuZCBkZWJ1Z2dpbmcgaGFwcGVuc1xuXHRcdFx0XHRcdFx0Ly8gLSB3aW5kb3cgaXMgYW4gZXh0ZW5zaW9ucyBkZXZlbG9wbWVudCBob3N0IHRoYXQgaXMgYmVpbmcgZGVidWdnZWRcblx0XHRcdFx0XHRcdC8vIC0gd2luZG93IGlzIGFuIGV4dGVuc2lvbiB0ZXN0IGRldmVsb3BtZW50IGhvc3QgdGhhdCBpcyBiZWluZyBkZWJ1Z2dlZFxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEludGVycnVwdCBWOCBhbmQgY29sbGVjdCBKYXZhU2NyaXB0IHN0YWNrXG5cdFx0XHRcdFx0dGhpcy5qc0NhbGxTdGFja0NvbGxlY3Rvci50cmlnZ2VyKCgpID0+IHRoaXMuc3RhcnRDb2xsZWN0aW5nSlNjYWxsU3RhY2tzKCkpO1xuXHRcdFx0XHRcdC8vIFN0YWNrIGNvbGxlY3Rpb24gd2lsbCBzdG9wIHVuZGVyIGFueSBvZiB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG5cdFx0XHRcdFx0Ly8gLSBUaGUgd2luZG93IGJlY29tZXMgcmVzcG9uc2l2ZSBhZ2FpblxuXHRcdFx0XHRcdC8vIC0gVGhlIHdpbmRvdyBpcyBkZXN0cm95ZWQgaS1lIHJlb3BlbiBvciBjbG9zZWRcblx0XHRcdFx0XHQvLyAtIHNhbXBsaW5nIHBlcmlvZCBpcyBjb21wbGV0ZSwgZGVmYXVsdCBpcyAxNXNcblx0XHRcdFx0XHR0aGlzLmpzQ2FsbFN0YWNrQ29sbGVjdG9yU3RvcFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXG5cdFx0XHRcdFx0Ly8gU2hvdyBEaWFsb2dcblx0XHRcdFx0XHRjb25zdCB7IHJlc3BvbnNlLCBjaGVja2JveENoZWNrZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nTWFpblNlcnZpY2Uuc2hvd01lc3NhZ2VCb3goe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSh7IGtleTogJ3Jlb3BlbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlb3BlblwiKSxcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdjbG9zZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNsb3NlXCIpLFxuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSh7IGtleTogJ3dhaXQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZLZWVwIFdhaXRpbmdcIilcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnYXBwU3RhbGxlZCcsIFwiVGhlIHdpbmRvdyBpcyBub3QgcmVzcG9uZGluZ1wiKSxcblx0XHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2FwcFN0YWxsZWREZXRhaWwnLCBcIllvdSBjYW4gcmVvcGVuIG9yIGNsb3NlIHRoZSB3aW5kb3cgb3Iga2VlcCB3YWl0aW5nLlwiKSxcblx0XHRcdFx0XHRcdGNoZWNrYm94TGFiZWw6IHRoaXMuX2NvbmZpZz8ud29ya3NwYWNlID8gbG9jYWxpemUoJ2RvTm90UmVzdG9yZUVkaXRvcnMnLCBcIkRvbid0IHJlc3RvcmUgZWRpdG9yc1wiKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sIHRoaXMuX3dpbik7XG5cblx0XHRcdFx0XHQvLyBIYW5kbGUgY2hvaWNlXG5cdFx0XHRcdFx0aWYgKHJlc3BvbnNlICE9PSAyIC8qIGtlZXAgd2FpdGluZyAqLykge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVvcGVuID0gcmVzcG9uc2UgPT09IDA7XG5cdFx0XHRcdFx0XHR0aGlzLnN0b3BDb2xsZWN0aW5nSlNjYWxsU3RhY2tzKCk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmRlc3Ryb3lXaW5kb3cocmVvcGVuLCBjaGVja2JveENoZWNrZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFByb2Nlc3MgZ29uZVxuXHRcdFx0XHRlbHNlIGlmICh0eXBlID09PSBXaW5kb3dFcnJvci5QUk9DRVNTX0dPTkUpIHtcblx0XHRcdFx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXHRcdFx0XHRcdGlmICghZGV0YWlscykge1xuXHRcdFx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdhcHBHb25lJywgXCJUaGUgd2luZG93IHRlcm1pbmF0ZWQgdW5leHBlY3RlZGx5XCIpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2FwcEdvbmVEZXRhaWxzJywgXCJUaGUgd2luZG93IHRlcm1pbmF0ZWQgdW5leHBlY3RlZGx5IChyZWFzb246ICd7MH0nLCBjb2RlOiAnezF9JylcIiwgZGV0YWlscy5yZWFzb24sIGRldGFpbHMuZXhpdENvZGUgPz8gJzx1bmtub3duPicpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFNob3cgRGlhbG9nXG5cdFx0XHRcdFx0Y29uc3QgeyByZXNwb25zZSwgY2hlY2tib3hDaGVja2VkIH0gPSBhd2FpdCB0aGlzLmRpYWxvZ01haW5TZXJ2aWNlLnNob3dNZXNzYWdlQm94KHtcblx0XHRcdFx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHRcdFx0dGhpcy5fY29uZmlnPy53b3Jrc3BhY2UgPyBsb2NhbGl6ZSh7IGtleTogJ3Jlb3BlbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlb3BlblwiKSA6IGxvY2FsaXplKHsga2V5OiAnbmV3V2luZG93JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTmV3IFdpbmRvd1wiKSxcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdjbG9zZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNsb3NlXCIpXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0XHRcdGRldGFpbDogdGhpcy5fY29uZmlnPy53b3Jrc3BhY2UgP1xuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnYXBwR29uZURldGFpbFdvcmtzcGFjZScsIFwiV2UgYXJlIHNvcnJ5IGZvciB0aGUgaW5jb252ZW5pZW5jZS4gWW91IGNhbiByZW9wZW4gdGhlIHdpbmRvdyB0byBjb250aW51ZSB3aGVyZSB5b3UgbGVmdCBvZmYuXCIpIDpcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2FwcEdvbmVEZXRhaWxFbXB0eVdpbmRvdycsIFwiV2UgYXJlIHNvcnJ5IGZvciB0aGUgaW5jb252ZW5pZW5jZS4gWW91IGNhbiBvcGVuIGEgbmV3IGVtcHR5IHdpbmRvdyB0byBzdGFydCBhZ2Fpbi5cIiksXG5cdFx0XHRcdFx0XHRjaGVja2JveExhYmVsOiB0aGlzLl9jb25maWc/LndvcmtzcGFjZSA/IGxvY2FsaXplKCdkb05vdFJlc3RvcmVFZGl0b3JzJywgXCJEb24ndCByZXN0b3JlIGVkaXRvcnNcIikgOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LCB0aGlzLl93aW4pO1xuXG5cdFx0XHRcdFx0Ly8gSGFuZGxlIGNob2ljZVxuXHRcdFx0XHRcdGNvbnN0IHJlb3BlbiA9IHJlc3BvbnNlID09PSAwO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZGVzdHJveVdpbmRvdyhyZW9wZW4sIGNoZWNrYm94Q2hlY2tlZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFdpbmRvd0Vycm9yLlJFU1BPTlNJVkU6XG5cdFx0XHRcdHRoaXMuc3RvcENvbGxlY3RpbmdKU2NhbGxTdGFja3MoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkZXN0cm95V2luZG93KHJlb3BlbjogYm9vbGVhbiwgc2tpcFJlc3RvcmVFZGl0b3JzOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5fY29uZmlnPy53b3Jrc3BhY2U7XG5cblx0XHQvLyBjaGVjayB0byBkaXNjYXJkIGVkaXRvciBzdGF0ZSBmaXJzdFxuXHRcdGlmIChza2lwUmVzdG9yZUVkaXRvcnMgJiYgd29ya3NwYWNlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VTdG9yYWdlID0gdGhpcy5zdG9yYWdlTWFpblNlcnZpY2Uud29ya3NwYWNlU3RvcmFnZSh3b3Jrc3BhY2UpO1xuXHRcdFx0XHRhd2FpdCB3b3Jrc3BhY2VTdG9yYWdlLmluaXQoKTtcblx0XHRcdFx0d29ya3NwYWNlU3RvcmFnZS5kZWxldGUoJ21lbWVudG8vd29ya2JlbmNoLnBhcnRzLmVkaXRvcicpO1xuXHRcdFx0XHRhd2FpdCB3b3Jrc3BhY2VTdG9yYWdlLmNsb3NlKCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vICdjbG9zZScgZXZlbnQgd2lsbCBub3QgYmUgZmlyZWQgb24gZGVzdHJveSgpLCBzbyBzaWduYWwgY3Jhc2ggdmlhIGV4cGxpY2l0IGV2ZW50XG5cdFx0dGhpcy5fb25EaWREZXN0cm95LmZpcmUoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBhc2sgdGhlIHdpbmRvd3Mgc2VydmljZSB0byBvcGVuIGEgbmV3IGZyZXNoIHdpbmRvdyBpZiBzcGVjaWZpZWRcblx0XHRcdGlmIChyZW9wZW4gJiYgdGhpcy5fY29uZmlnKSB7XG5cblx0XHRcdFx0Ly8gV2UgaGF2ZSB0byByZWNvbnN0cnVjdCBhIG9wZW5hYmxlIGZyb20gdGhlIGN1cnJlbnQgd29ya3NwYWNlXG5cdFx0XHRcdGxldCB1cmlUb09wZW46IElXb3Jrc3BhY2VUb09wZW4gfCBJRm9sZGVyVG9PcGVuIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRsZXQgZm9yY2VFbXB0eSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih3b3Jrc3BhY2UpKSB7XG5cdFx0XHRcdFx0dXJpVG9PcGVuID0geyBmb2xkZXJVcmk6IHdvcmtzcGFjZS51cmkgfTtcblx0XHRcdFx0fSBlbHNlIGlmIChpc1dvcmtzcGFjZUlkZW50aWZpZXIod29ya3NwYWNlKSkge1xuXHRcdFx0XHRcdHVyaVRvT3BlbiA9IHsgd29ya3NwYWNlVXJpOiB3b3Jrc3BhY2UuY29uZmlnUGF0aCB9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGZvcmNlRW1wdHkgPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRGVsZWdhdGUgdG8gd2luZG93cyBzZXJ2aWNlXG5cdFx0XHRcdGNvbnN0IHdpbmRvdyA9IChhd2FpdCB0aGlzLndpbmRvd3NNYWluU2VydmljZS5vcGVuKHtcblx0XHRcdFx0XHRjb250ZXh0OiBPcGVuQ29udGV4dC5BUEksXG5cdFx0XHRcdFx0dXNlckVudjogdGhpcy5fY29uZmlnLnVzZXJFbnYsXG5cdFx0XHRcdFx0Y2xpOiB7XG5cdFx0XHRcdFx0XHQuLi50aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncyxcblx0XHRcdFx0XHRcdF86IFtdIC8vIHdlIHBhc3MgaW4gdGhlIHdvcmtzcGFjZSB0byBvcGVuIGV4cGxpY2l0bHkgdmlhIGB1cmlzVG9PcGVuYFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dXJpc1RvT3BlbjogdXJpVG9PcGVuID8gW3VyaVRvT3Blbl0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Zm9yY2VFbXB0eSxcblx0XHRcdFx0XHRmb3JjZU5ld1dpbmRvdzogdHJ1ZSxcblx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IHRoaXMucmVtb3RlQXV0aG9yaXR5XG5cdFx0XHRcdH0pKS5hdCgwKTtcblx0XHRcdFx0d2luZG93Py5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBtYWtlIHN1cmUgdG8gZGVzdHJveSB0aGUgd2luZG93IGFzIGl0cyByZW5kZXJlciBwcm9jZXNzIGlzIGdvbmUuIGRvIHRoaXNcblx0XHRcdC8vIGFmdGVyIHRoZSBjb2RlIGZvciByZW9wZW5pbmcgdGhlIHdpbmRvdywgdG8gcHJldmVudCB0aGUgZW50aXJlIGFwcGxpY2F0aW9uXG5cdFx0XHQvLyBmcm9tIHF1aXR0aW5nIHdoZW4gdGhlIGxhc3Qgd2luZG93IGNsb3NlcyBhcyBhIHJlc3VsdC5cblx0XHRcdHRoaXMuX3dpbj8uZGVzdHJveSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWREZWxldGVVbnRpdGxlZFdvcmtzcGFjZSh3b3Jrc3BhY2U6IElXb3Jrc3BhY2VJZGVudGlmaWVyKTogdm9pZCB7XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gdXBkYXRlIG91ciB3b3Jrc3BhY2UgY29uZmlnIGlmIHdlIGRldGVjdCB0aGF0IGl0XG5cdFx0Ly8gd2FzIGRlbGV0ZWRcblx0XHRpZiAodGhpcy5fY29uZmlnPy53b3Jrc3BhY2U/LmlkID09PSB3b3Jrc3BhY2UuaWQpIHtcblx0XHRcdHRoaXMuX2NvbmZpZy53b3Jrc3BhY2UgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbmZpZ3VyYXRpb25VcGRhdGVkKGU/OiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cblx0XHQvLyBTd2lwZSBjb21tYW5kIHN1cHBvcnQgKG1hY09TKVxuXHRcdGlmIChpc01hY2ludG9zaCAmJiAoIWUgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignd29ya2JlbmNoLmVkaXRvci5zd2lwZVRvTmF2aWdhdGUnKSkpIHtcblx0XHRcdGNvbnN0IHN3aXBlVG9OYXZpZ2F0ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3dvcmtiZW5jaC5lZGl0b3Iuc3dpcGVUb05hdmlnYXRlJyk7XG5cdFx0XHRpZiAoc3dpcGVUb05hdmlnYXRlKSB7XG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJTd2lwZUxpc3RlbmVyKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnN3aXBlTGlzdGVuZXJEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTWVudWJhclxuXHRcdGlmICghZSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE1lbnVTZXR0aW5ncy5NZW51QmFyVmlzaWJpbGl0eSkpIHtcblx0XHRcdGNvbnN0IG5ld01lbnVCYXJWaXNpYmlsaXR5ID0gdGhpcy5nZXRNZW51QmFyVmlzaWJpbGl0eSgpO1xuXHRcdFx0aWYgKG5ld01lbnVCYXJWaXNpYmlsaXR5ICE9PSB0aGlzLmN1cnJlbnRNZW51QmFyVmlzaWJpbGl0eSkge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRNZW51QmFyVmlzaWJpbGl0eSA9IG5ld01lbnVCYXJWaXNpYmlsaXR5O1xuXHRcdFx0XHR0aGlzLnNldE1lbnVCYXJWaXNpYmlsaXR5KG5ld01lbnVCYXJWaXNpYmlsaXR5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBQcm94eVxuXHRcdGlmICghZSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdodHRwLnByb3h5JykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignaHR0cC5ub1Byb3h5JykpIHtcblx0XHRcdGNvbnN0IGluc3BlY3QgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8c3RyaW5nPignaHR0cC5wcm94eScpO1xuXHRcdFx0bGV0IG5ld0h0dHBQcm94eSA9IChpbnNwZWN0LnVzZXJMb2NhbFZhbHVlIHx8ICcnKS50cmltKClcblx0XHRcdFx0fHwgKHByb2Nlc3MuZW52WydodHRwc19wcm94eSddIHx8IHByb2Nlc3MuZW52WydIVFRQU19QUk9YWSddIHx8IHByb2Nlc3MuZW52WydodHRwX3Byb3h5J10gfHwgcHJvY2Vzcy5lbnZbJ0hUVFBfUFJPWFknXSB8fCAnJykudHJpbSgpIC8vIE5vdCBzdGFuZGFyZGl6ZWQuXG5cdFx0XHRcdHx8IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKG5ld0h0dHBQcm94eT8uaW5kZXhPZignQCcpICE9PSAtMSkge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UobmV3SHR0cFByb3h5ISk7XG5cdFx0XHRcdGNvbnN0IGkgPSB1cmkuYXV0aG9yaXR5LmluZGV4T2YoJ0AnKTtcblx0XHRcdFx0aWYgKGkgIT09IC0xKSB7XG5cdFx0XHRcdFx0bmV3SHR0cFByb3h5ID0gdXJpLndpdGgoeyBhdXRob3JpdHk6IHVyaS5hdXRob3JpdHkuc3Vic3RyaW5nKGkgKyAxKSB9KVxuXHRcdFx0XHRcdFx0LnRvU3RyaW5nKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChuZXdIdHRwUHJveHk/LmVuZHNXaXRoKCcvJykpIHtcblx0XHRcdFx0bmV3SHR0cFByb3h5ID0gbmV3SHR0cFByb3h5LnN1YnN0cigwLCBuZXdIdHRwUHJveHkubGVuZ3RoIC0gMSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5ld05vUHJveHkgPSAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmdbXT4oJ2h0dHAubm9Qcm94eScpIHx8IFtdKS5tYXAoKGl0ZW0pID0+IGl0ZW0udHJpbSgpKS5qb2luKCcsJylcblx0XHRcdFx0fHwgKHByb2Nlc3MuZW52Wydub19wcm94eSddIHx8IHByb2Nlc3MuZW52WydOT19QUk9YWSddIHx8ICcnKS50cmltKCkgfHwgdW5kZWZpbmVkOyAvLyBOb3Qgc3RhbmRhcmRpemVkLlxuXHRcdFx0aWYgKChuZXdIdHRwUHJveHkgfHwgJycpLmluZGV4T2YoJ0AnKSA9PT0gLTEgJiYgKG5ld0h0dHBQcm94eSAhPT0gdGhpcy5jdXJyZW50SHR0cFByb3h5IHx8IG5ld05vUHJveHkgIT09IHRoaXMuY3VycmVudE5vUHJveHkpKSB7XG5cdFx0XHRcdHRoaXMuY3VycmVudEh0dHBQcm94eSA9IG5ld0h0dHBQcm94eTtcblx0XHRcdFx0dGhpcy5jdXJyZW50Tm9Qcm94eSA9IG5ld05vUHJveHk7XG5cblx0XHRcdFx0Y29uc3QgcHJveHlSdWxlcyA9IG5ld0h0dHBQcm94eSB8fCAnJztcblx0XHRcdFx0Y29uc3QgcHJveHlCeXBhc3NSdWxlcyA9IG5ld05vUHJveHkgPyBgJHtuZXdOb1Byb3h5fSw8bG9jYWw+YCA6ICc8bG9jYWw+Jztcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBTZXR0aW5nIHByb3h5IHRvICcke3Byb3h5UnVsZXN9JywgYnlwYXNzaW5nICcke3Byb3h5QnlwYXNzUnVsZXN9J2ApO1xuXHRcdFx0XHR0aGlzLl93aW4ud2ViQ29udGVudHMuc2Vzc2lvbi5zZXRQcm94eSh7IHByb3h5UnVsZXMsIHByb3h5QnlwYXNzUnVsZXMsIHBhY1NjcmlwdDogJycgfSk7XG5cdFx0XHRcdGVsZWN0cm9uLmFwcC5zZXRQcm94eSh7IHByb3h5UnVsZXMsIHByb3h5QnlwYXNzUnVsZXMsIHBhY1NjcmlwdDogJycgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBzd2lwZUxpc3RlbmVyRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIHJlZ2lzdGVyU3dpcGVMaXN0ZW5lcigpOiB2b2lkIHtcblx0XHR0aGlzLnN3aXBlTGlzdGVuZXJEaXNwb3NhYmxlLnZhbHVlID0gRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXI8c3RyaW5nPih0aGlzLl93aW4sICdzd2lwZScsIChldmVudDogRWxlY3Ryb24uRXZlbnQsIGNtZDogc3RyaW5nKSA9PiBjbWQpKGNtZCA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaXNSZWFkeSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIHdpbmRvdyBtdXN0IGJlIHJlYWR5XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjbWQgPT09ICdsZWZ0Jykge1xuXHRcdFx0XHR0aGlzLnNlbmQoJ3ZzY29kZTpydW5BY3Rpb24nLCB7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3InLCBmcm9tOiAnbW91c2UnIH0pO1xuXHRcdFx0fSBlbHNlIGlmIChjbWQgPT09ICdyaWdodCcpIHtcblx0XHRcdFx0dGhpcy5zZW5kKCd2c2NvZGU6cnVuQWN0aW9uJywgeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3Blbk5leHRSZWNlbnRseVVzZWRFZGl0b3InLCBmcm9tOiAnbW91c2UnIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YWRkVGFiYmVkV2luZG93KHdpbmRvdzogSUNvZGVXaW5kb3cpOiB2b2lkIHtcblx0XHRpZiAoaXNNYWNpbnRvc2ggJiYgd2luZG93Lndpbikge1xuXHRcdFx0dGhpcy5fd2luLmFkZFRhYmJlZFdpbmRvdyh3aW5kb3cud2luKTtcblx0XHR9XG5cdH1cblxuXHRsb2FkKGNvbmZpZ3VyYXRpb246IElOYXRpdmVXaW5kb3dDb25maWd1cmF0aW9uLCBvcHRpb25zOiBJTG9hZE9wdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGB3aW5kb3cjbG9hZDogYXR0ZW1wdCB0byBsb2FkIHdpbmRvdyAoaWQ6ICR7dGhpcy5faWR9KWApO1xuXG5cdFx0Ly8gQ2xlYXIgRG9jdW1lbnQgRWRpdGVkIGlmIG5lZWRlZFxuXHRcdGlmICh0aGlzLmlzRG9jdW1lbnRFZGl0ZWQoKSkge1xuXHRcdFx0aWYgKCFvcHRpb25zLmlzUmVsb2FkIHx8ICF0aGlzLmJhY2t1cE1haW5TZXJ2aWNlLmlzSG90RXhpdEVuYWJsZWQoKSkge1xuXHRcdFx0XHR0aGlzLnNldERvY3VtZW50RWRpdGVkKGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDbGVhciBUaXRsZSBhbmQgRmlsZW5hbWUgaWYgbmVlZGVkXG5cdFx0aWYgKCFvcHRpb25zLmlzUmVsb2FkKSB7XG5cdFx0XHRpZiAodGhpcy5nZXRSZXByZXNlbnRlZEZpbGVuYW1lKCkpIHtcblx0XHRcdFx0dGhpcy5zZXRSZXByZXNlbnRlZEZpbGVuYW1lKCcnKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fd2luLnNldFRpdGxlKHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBjb25maWd1cmF0aW9uIHZhbHVlcyBiYXNlZCBvbiBvdXIgd2luZG93IGNvbnRleHRcblx0XHQvLyBhbmQgc2V0IGl0IGludG8gdGhlIGNvbmZpZyBvYmplY3QgVVJMIGZvciB1c2FnZS5cblx0XHR0aGlzLnVwZGF0ZUNvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbiwgb3B0aW9ucyk7XG5cblx0XHQvLyBJZiB0aGlzIGlzIHRoZSBmaXJzdCB0aW1lIHRoZSB3aW5kb3cgaXMgbG9hZGVkLCB3ZSBhc3NvY2lhdGUgdGhlIHBhdGhzXG5cdFx0Ly8gZGlyZWN0bHkgd2l0aCB0aGUgd2luZG93IGJlY2F1c2Ugd2UgYXNzdW1lIHRoZSBsb2FkaW5nIHdpbGwganVzdCB3b3JrXG5cdFx0aWYgKHRoaXMucmVhZHlTdGF0ZSA9PT0gUmVhZHlTdGF0ZS5OT05FKSB7XG5cdFx0XHR0aGlzLl9jb25maWcgPSBjb25maWd1cmF0aW9uO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSwgdGhlIHdpbmRvdyBpcyBjdXJyZW50bHkgc2hvd2luZyBhIGZvbGRlciBhbmQgaWYgdGhlcmUgaXMgYW5cblx0XHQvLyB1bmxvYWQgaGFuZGxlciBwcmV2ZW50aW5nIHRoZSBsb2FkLCB3ZSBjYW5ub3QganVzdCBhc3NvY2lhdGUgdGhlIHBhdGhzXG5cdFx0Ly8gYmVjYXVzZSB0aGUgbG9hZGluZyBtaWdodCBiZSB2ZXRvZWQuIEluc3RlYWQgd2UgYXNzb2NpYXRlIGl0IGxhdGVyIHdoZW5cblx0XHQvLyB0aGUgd2luZG93IGxvYWQgZXZlbnQgaGFzIGZpcmVkLlxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5wZW5kaW5nTG9hZENvbmZpZyA9IGNvbmZpZ3VyYXRpb247XG5cdFx0fVxuXG5cdFx0Ly8gSW5kaWNhdGUgd2UgYXJlIG5hdmlndGluZyBub3dcblx0XHR0aGlzLnJlYWR5U3RhdGUgPSBSZWFkeVN0YXRlLk5BVklHQVRJTkc7XG5cblx0XHQvLyBMb2FkIFVSTFxuXHRcdGxldCB3aW5kb3dVcmw6IHN0cmluZztcblx0XHRpZiAocHJvY2Vzcy5lbnYuVlNDT0RFX0RFViAmJiBwcm9jZXNzLmVudi5WU0NPREVfREVWX1NFUlZFUl9VUkwpIHtcblx0XHRcdHdpbmRvd1VybCA9IHByb2Nlc3MuZW52LlZTQ09ERV9ERVZfU0VSVkVSX1VSTDsgLy8gc3VwcG9ydCBVUkwgb3ZlcnJpZGUgZm9yIGRldmVsb3BtZW50XG5cdFx0fSBlbHNlIGlmIChjb25maWd1cmF0aW9uLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdHdpbmRvd1VybCA9IEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKGB2cy9zZXNzaW9ucy9lbGVjdHJvbi1icm93c2VyL3Nlc3Npb25zJHt0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuaXNCdWlsdCA/ICcnIDogJy1kZXYnfS5odG1sYCkudG9TdHJpbmcodHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHdpbmRvd1VybCA9IEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKGB2cy9jb2RlL2VsZWN0cm9uLWJyb3dzZXIvd29ya2JlbmNoL3dvcmtiZW5jaCR7dGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmlzQnVpbHQgPyAnJyA6ICctZGV2J30uaHRtbGApLnRvU3RyaW5nKHRydWUpO1xuXHRcdH1cblx0XHR0aGlzLl93aW4ubG9hZFVSTCh3aW5kb3dVcmwpO1xuXG5cdFx0Ly8gUmVtZW1iZXIgdGhhdCB3ZSBkaWQgbG9hZFxuXHRcdGNvbnN0IHdhc0xvYWRlZCA9IHRoaXMud2FzTG9hZGVkO1xuXHRcdHRoaXMud2FzTG9hZGVkID0gdHJ1ZTtcblxuXHRcdC8vIE1ha2Ugd2luZG93IHZpc2libGUgaWYgaXQgZGlkIG5vdCBvcGVuIGluIE4gc2Vjb25kcyBiZWNhdXNlIHRoaXMgaW5kaWNhdGVzIGFuIGVycm9yXG5cdFx0Ly8gT25seSBkbyB0aGlzIHdoZW4gcnVubmluZyBvdXQgb2Ygc291cmNlcyBhbmQgbm90IHdoZW4gcnVubmluZyB0ZXN0c1xuXHRcdGlmICghdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmlzQnVpbHQgJiYgIXRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5leHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl93aW4gJiYgIXRoaXMuX3dpbi5pc1Zpc2libGUoKSAmJiAhdGhpcy5fd2luLmlzTWluaW1pemVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLl93aW4uc2hvdygpO1xuXHRcdFx0XHRcdHRoaXMuZm9jdXMoeyBtb2RlOiBGb2N1c01vZGUuRm9yY2UgfSk7XG5cdFx0XHRcdFx0dGhpcy5fd2luLndlYkNvbnRlbnRzLm9wZW5EZXZUb29scygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAxMDAwMCkpLnNjaGVkdWxlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbldpbGxMb2FkLmZpcmUoeyB3b3Jrc3BhY2U6IGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlLCByZWFzb246IG9wdGlvbnMuaXNSZWxvYWQgPyBMb2FkUmVhc29uLlJFTE9BRCA6IHdhc0xvYWRlZCA/IExvYWRSZWFzb24uTE9BRCA6IExvYWRSZWFzb24uSU5JVElBTCB9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uOiBJTmF0aXZlV2luZG93Q29uZmlndXJhdGlvbiwgb3B0aW9uczogSUxvYWRPcHRpb25zKTogdm9pZCB7XG5cblx0XHQvLyBJZiB0aGlzIHdpbmRvdyB3YXMgbG9hZGVkIGJlZm9yZSBmcm9tIHRoZSBjb21tYW5kIGxpbmVcblx0XHQvLyAoYXMgaW5kaWNhdGVkIGJ5IFZTQ09ERV9DTEkgZW52aXJvbm1lbnQpLCBtYWtlIHN1cmUgdG9cblx0XHQvLyBwcmVzZXJ2ZSB0aGF0IHVzZXIgZW52aXJvbm1lbnQgaW4gc3Vic2VxdWVudCBsb2Fkcyxcblx0XHQvLyB1bmxlc3MgdGhlIG5ldyBjb25maWd1cmF0aW9uIGNvbnRleHQgd2FzIGFsc28gYSBDTElcblx0XHQvLyAoZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDg1NzEpXG5cdFx0Ly8gQWxzbywgcHJlc2VydmUgdGhlIGVudmlyb25tZW50IGlmIHdlJ3JlIGxvYWRpbmcgZnJvbSBhblxuXHRcdC8vIGV4dGVuc2lvbiBkZXZlbG9wbWVudCBob3N0IHRoYXQgaGFkIGl0cyBlbnZpcm9ubWVudCBzZXRcblx0XHQvLyAoZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjM1MDgpXG5cdFx0Y29uc3QgY3VycmVudFVzZXJFbnYgPSAodGhpcy5fY29uZmlnID8/IHRoaXMucGVuZGluZ0xvYWRDb25maWcpPy51c2VyRW52O1xuXHRcdGlmIChjdXJyZW50VXNlckVudikge1xuXHRcdFx0Y29uc3Qgc2hvdWxkUHJlc2VydmVMYXVuY2hDbGlFbnZpcm9ubWVudCA9IGlzTGF1bmNoZWRGcm9tQ2xpKGN1cnJlbnRVc2VyRW52KSAmJiAhaXNMYXVuY2hlZEZyb21DbGkoY29uZmlndXJhdGlvbi51c2VyRW52KTtcblx0XHRcdGNvbnN0IHNob3VsZFByZXNlcnZlRGVidWdFbnZpcm9ubW5ldCA9IHRoaXMuaXNFeHRlbnNpb25EZXZlbG9wbWVudEhvc3Q7XG5cdFx0XHRpZiAoc2hvdWxkUHJlc2VydmVMYXVuY2hDbGlFbnZpcm9ubWVudCB8fCBzaG91bGRQcmVzZXJ2ZURlYnVnRW52aXJvbm1uZXQpIHtcblx0XHRcdFx0Y29uZmlndXJhdGlvbi51c2VyRW52ID0geyAuLi5jdXJyZW50VXNlckVudiwgLi4uY29uZmlndXJhdGlvbi51c2VyRW52IH07IC8vIHN0aWxsIGFsbG93IHRvIG92ZXJyaWRlIGNlcnRhaW4gZW52aXJvbm1lbnQgYXMgcGFzc2VkIGluXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgbmFtZWQgcGlwZSB3YXMgaW5zdGFudGlhdGVkIGZvciB0aGUgY3Jhc2hwYWRfaGFuZGxlciBwcm9jZXNzLCByZXVzZSB0aGUgc2FtZVxuXHRcdC8vIHBpcGUgZm9yIG5ldyBhcHAgaW5zdGFuY2VzIGNvbm5lY3RpbmcgdG8gdGhlIG9yaWdpbmFsIGFwcCBpbnN0YW5jZS5cblx0XHQvLyBSZWY6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTU4NzRcblx0XHRpZiAocHJvY2Vzcy5lbnZbJ0NIUk9NRV9DUkFTSFBBRF9QSVBFX05BTUUnXSkge1xuXHRcdFx0T2JqZWN0LmFzc2lnbihjb25maWd1cmF0aW9uLnVzZXJFbnYsIHtcblx0XHRcdFx0Q0hST01FX0NSQVNIUEFEX1BJUEVfTkFNRTogcHJvY2Vzcy5lbnZbJ0NIUk9NRV9DUkFTSFBBRF9QSVBFX05BTUUnXVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGRpc2FibGUtZXh0ZW5zaW9ucyB0byB0aGUgY29uZmlnLCBidXQgZG8gbm90IHByZXNlcnZlIGl0IG9uIGN1cnJlbnRDb25maWcgb3Jcblx0XHQvLyBwZW5kaW5nTG9hZENvbmZpZyBzbyB0aGF0IGl0IGlzIGFwcGxpZWQgb25seSBvbiB0aGlzIGxvYWRcblx0XHRpZiAob3B0aW9ucy5kaXNhYmxlRXh0ZW5zaW9ucyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uWydkaXNhYmxlLWV4dGVuc2lvbnMnXSA9IG9wdGlvbnMuZGlzYWJsZUV4dGVuc2lvbnM7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHdpbmRvdyByZWxhdGVkIHByb3BlcnRpZXNcblx0XHR0cnkge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5oYW5kbGUgPSBWU0J1ZmZlci53cmFwKHRoaXMuX3dpbi5nZXROYXRpdmVXaW5kb3dIYW5kbGUoKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRXJyb3IgZ2V0dGluZyBuYXRpdmUgd2luZG93IGhhbmRsZTogJHtlcnJvcn1gKTtcblx0XHR9XG5cdFx0Y29uZmlndXJhdGlvbi5mdWxsc2NyZWVuID0gdGhpcy5pc0Z1bGxTY3JlZW47XG5cdFx0Y29uZmlndXJhdGlvbi5tYXhpbWl6ZWQgPSB0aGlzLl93aW4uaXNNYXhpbWl6ZWQoKTtcblx0XHRjb25maWd1cmF0aW9uLnBhcnRzU3BsYXNoID0gdGhpcy50aGVtZU1haW5TZXJ2aWNlLmdldFdpbmRvd1NwbGFzaChjb25maWd1cmF0aW9uLndvcmtzcGFjZSk7XG5cdFx0Y29uZmlndXJhdGlvbi56b29tTGV2ZWwgPSB0aGlzLmdldFpvb21MZXZlbCgpO1xuXHRcdGNvbmZpZ3VyYXRpb24uaXNDdXN0b21ab29tTGV2ZWwgPSB0eXBlb2YgdGhpcy5jdXN0b21ab29tTGV2ZWwgPT09ICdudW1iZXInO1xuXHRcdGlmIChjb25maWd1cmF0aW9uLmlzQ3VzdG9tWm9vbUxldmVsICYmIGNvbmZpZ3VyYXRpb24ucGFydHNTcGxhc2gpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24ucGFydHNTcGxhc2guem9vbUxldmVsID0gY29uZmlndXJhdGlvbi56b29tTGV2ZWw7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHdpdGggbGF0ZXN0IHBlcmYgbWFya3Ncblx0XHRtYXJrKCdjb2RlL3dpbGxPcGVuTmV3V2luZG93Jyk7XG5cdFx0Y29uZmlndXJhdGlvbi5wZXJmTWFya3MgPSBnZXRNYXJrcygpO1xuXG5cdFx0Ly8gVXBkYXRlIGluIGNvbmZpZyBvYmplY3QgVVJMIGZvciB1c2FnZSBpbiByZW5kZXJlclxuXHRcdHRoaXMuY29uZmlnT2JqZWN0VXJsLnVwZGF0ZShjb25maWd1cmF0aW9uKTtcblx0fVxuXG5cdGFzeW5jIHJlbG9hZChjbGk/OiBOYXRpdmVQYXJzZWRBcmdzKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBDb3B5IG91ciBjdXJyZW50IGNvbmZpZyBmb3IgcmV1c2Vcblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5fY29uZmlnKTtcblxuXHRcdC8vIFZhbGlkYXRlIHdvcmtzcGFjZVxuXHRcdGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlID0gYXdhaXQgdGhpcy52YWxpZGF0ZVdvcmtzcGFjZUJlZm9yZVJlbG9hZChjb25maWd1cmF0aW9uKTtcblxuXHRcdC8vIERlbGV0ZSBzb21lIHByb3BlcnRpZXMgd2UgZG8gbm90IHdhbnQgZHVyaW5nIHJlbG9hZFxuXHRcdGRlbGV0ZSBjb25maWd1cmF0aW9uLmZpbGVzVG9PcGVuT3JDcmVhdGU7XG5cdFx0ZGVsZXRlIGNvbmZpZ3VyYXRpb24uZmlsZXNUb0RpZmY7XG5cdFx0ZGVsZXRlIGNvbmZpZ3VyYXRpb24uZmlsZXNUb01lcmdlO1xuXHRcdGRlbGV0ZSBjb25maWd1cmF0aW9uLmZpbGVzVG9XYWl0O1xuXG5cdFx0Ly8gU29tZSBjb25maWd1cmF0aW9uIHRoaW5ncyBnZXQgaW5oZXJpdGVkIGlmIHRoZSB3aW5kb3cgaXMgYmVpbmcgcmVsb2FkZWQgYW5kIHdlIGFyZVxuXHRcdC8vIGluIGV4dGVuc2lvbiBkZXZlbG9wbWVudCBtb2RlLiBUaGVzZSBvcHRpb25zIGFyZSBhbGwgZGV2ZWxvcG1lbnQgcmVsYXRlZC5cblx0XHRpZiAodGhpcy5pc0V4dGVuc2lvbkRldmVsb3BtZW50SG9zdCAmJiBjbGkpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24udmVyYm9zZSA9IGNsaS52ZXJib3NlO1xuXHRcdFx0Y29uZmlndXJhdGlvbi5kZWJ1Z0lkID0gY2xpLmRlYnVnSWQ7XG5cdFx0XHRjb25maWd1cmF0aW9uLmV4dGVuc2lvbkVudmlyb25tZW50ID0gY2xpLmV4dGVuc2lvbkVudmlyb25tZW50O1xuXHRcdFx0Y29uZmlndXJhdGlvblsnaW5zcGVjdC1leHRlbnNpb25zJ10gPSBjbGlbJ2luc3BlY3QtZXh0ZW5zaW9ucyddO1xuXHRcdFx0Y29uZmlndXJhdGlvblsnaW5zcGVjdC1icmstZXh0ZW5zaW9ucyddID0gY2xpWydpbnNwZWN0LWJyay1leHRlbnNpb25zJ107XG5cdFx0XHRjb25maWd1cmF0aW9uWydleHRlbnNpb25zLWRpciddID0gY2xpWydleHRlbnNpb25zLWRpciddO1xuXHRcdH1cblxuXHRcdGNvbmZpZ3VyYXRpb24uYWNjZXNzaWJpbGl0eVN1cHBvcnQgPSBlbGVjdHJvbi5hcHAuaXNBY2Nlc3NpYmlsaXR5U3VwcG9ydEVuYWJsZWQoKTtcblx0XHRjb25maWd1cmF0aW9uLmlzSW5pdGlhbFN0YXJ0dXAgPSBmYWxzZTsgLy8gc2luY2UgdGhpcyBpcyBhIHJlbG9hZFxuXHRcdGNvbmZpZ3VyYXRpb24ucG9saWNpZXNEYXRhID0gdGhpcy5wb2xpY3lTZXJ2aWNlLnNlcmlhbGl6ZSgpOyAvLyBzZXQgcG9saWNpZXMgZGF0YSBhZ2FpblxuXHRcdGNvbmZpZ3VyYXRpb24uY29udGludWVPbiA9IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5jb250aW51ZU9uO1xuXHRcdGNvbmZpZ3VyYXRpb24ucHJvZmlsZXMgPSB7XG5cdFx0XHRhbGw6IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMsXG5cdFx0XHRwcm9maWxlOiB0aGlzLnByb2ZpbGUgfHwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSxcblx0XHRcdGhvbWU6IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXNIb21lXG5cdFx0fTtcblx0XHRjb25maWd1cmF0aW9uLmxvZ0xldmVsID0gdGhpcy5sb2dnZXJNYWluU2VydmljZS5nZXRMb2dMZXZlbCgpO1xuXHRcdGNvbmZpZ3VyYXRpb24ubG9nZ2VycyA9IHRoaXMubG9nZ2VyTWFpblNlcnZpY2UuZ2V0R2xvYmFsTG9nZ2VycygpO1xuXG5cdFx0Ly8gTG9hZCBjb25maWdcblx0XHR0aGlzLmxvYWQoY29uZmlndXJhdGlvbiwgeyBpc1JlbG9hZDogdHJ1ZSwgZGlzYWJsZUV4dGVuc2lvbnM6IGNsaT8uWydkaXNhYmxlLWV4dGVuc2lvbnMnXSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdmFsaWRhdGVXb3Jrc3BhY2VCZWZvcmVSZWxvYWQoY29uZmlndXJhdGlvbjogSU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb24pOiBQcm9taXNlPElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIgfCB1bmRlZmluZWQ+IHtcblxuXHRcdC8vIE11bHRpIGZvbGRlclxuXHRcdGlmIChpc1dvcmtzcGFjZUlkZW50aWZpZXIoY29uZmlndXJhdGlvbi53b3Jrc3BhY2UpKSB7XG5cdFx0XHRjb25zdCBjb25maWdQYXRoID0gY29uZmlndXJhdGlvbi53b3Jrc3BhY2UuY29uZmlnUGF0aDtcblx0XHRcdGlmIChjb25maWdQYXRoLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUV4aXN0cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKGNvbmZpZ1BhdGgpO1xuXHRcdFx0XHRpZiAoIXdvcmtzcGFjZUV4aXN0cykge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTaW5nbGUgZm9sZGVyXG5cdFx0ZWxzZSBpZiAoaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlKSkge1xuXHRcdFx0Y29uc3QgdXJpID0gY29uZmlndXJhdGlvbi53b3Jrc3BhY2UudXJpO1xuXHRcdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRjb25zdCBmb2xkZXJFeGlzdHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyh1cmkpO1xuXHRcdFx0XHRpZiAoIWZvbGRlckV4aXN0cykge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBXb3Jrc3BhY2UgaXMgdmFsaWRcblx0XHRyZXR1cm4gY29uZmlndXJhdGlvbi53b3Jrc3BhY2U7XG5cdH1cblxuXHRzZXJpYWxpemVXaW5kb3dTdGF0ZSgpOiBJV2luZG93U3RhdGUge1xuXHRcdGlmICghdGhpcy5fd2luKSB7XG5cdFx0XHRyZXR1cm4gZGVmYXVsdFdpbmRvd1N0YXRlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gZnVsbHNjcmVlbiBnZXRzIHNwZWNpYWwgdHJlYXRtZW50XG5cdFx0aWYgKHRoaXMuaXNGdWxsU2NyZWVuKSB7XG5cdFx0XHRsZXQgZGlzcGxheTogZWxlY3Ryb24uRGlzcGxheSB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGRpc3BsYXkgPSBlbGVjdHJvbi5zY3JlZW4uZ2V0RGlzcGxheU1hdGNoaW5nKHRoaXMuZ2V0Qm91bmRzKCkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ly8gRWxlY3Ryb24gaGFzIHdlaXJkIGNvbmRpdGlvbnMgdW5kZXIgd2hpY2ggaXQgdGhyb3dzIGVycm9yc1xuXHRcdFx0XHQvLyBlLmcuIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDAzMzQgd2hlblxuXHRcdFx0XHQvLyBsYXJnZSBudW1iZXJzIGFyZSBwYXNzZWQgaW5cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGVmYXVsdFN0YXRlID0gZGVmYXVsdFdpbmRvd1N0YXRlKCk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG1vZGU6IFdpbmRvd01vZGUuRnVsbHNjcmVlbixcblx0XHRcdFx0ZGlzcGxheTogZGlzcGxheSA/IGRpc3BsYXkuaWQgOiB1bmRlZmluZWQsXG5cblx0XHRcdFx0Ly8gU3RpbGwgY2Fycnkgb3ZlciB3aW5kb3cgZGltZW5zaW9ucyBmcm9tIHByZXZpb3VzIHNlc3Npb25zXG5cdFx0XHRcdC8vIGlmIHdlIGNhbiBjb21wdXRlIGl0IGluIGZ1bGxzY3JlZW4gc3RhdGUuXG5cdFx0XHRcdC8vIGRvZXMgbm90IHNlZW0gcG9zc2libGUgaW4gYWxsIGNhc2VzIG9uIExpbnV4IGZvciBleGFtcGxlXG5cdFx0XHRcdC8vIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNTgyMTgpIHNvIHdlXG5cdFx0XHRcdC8vIGZhbGxiYWNrIHRvIHRoZSBkZWZhdWx0cyBpbiB0aGF0IGNhc2UuXG5cdFx0XHRcdHdpZHRoOiB0aGlzLndpbmRvd1N0YXRlLndpZHRoIHx8IGRlZmF1bHRTdGF0ZS53aWR0aCxcblx0XHRcdFx0aGVpZ2h0OiB0aGlzLndpbmRvd1N0YXRlLmhlaWdodCB8fCBkZWZhdWx0U3RhdGUuaGVpZ2h0LFxuXHRcdFx0XHR4OiB0aGlzLndpbmRvd1N0YXRlLnggfHwgMCxcblx0XHRcdFx0eTogdGhpcy53aW5kb3dTdGF0ZS55IHx8IDAsXG5cdFx0XHRcdHpvb21MZXZlbDogdGhpcy5jdXN0b21ab29tTGV2ZWxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGU6IElXaW5kb3dTdGF0ZSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0bGV0IG1vZGU6IFdpbmRvd01vZGU7XG5cblx0XHQvLyBnZXQgd2luZG93IG1vZGVcblx0XHRpZiAoIWlzTWFjaW50b3NoICYmIHRoaXMuX3dpbi5pc01heGltaXplZCgpKSB7XG5cdFx0XHRtb2RlID0gV2luZG93TW9kZS5NYXhpbWl6ZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZGUgPSBXaW5kb3dNb2RlLk5vcm1hbDtcblx0XHR9XG5cblx0XHQvLyB3ZSBkb24ndCB3YW50IHRvIHNhdmUgbWluaW1pemVkIHN0YXRlLCBvbmx5IG1heGltaXplZCBvciBub3JtYWxcblx0XHRpZiAobW9kZSA9PT0gV2luZG93TW9kZS5NYXhpbWl6ZWQpIHtcblx0XHRcdHN0YXRlLm1vZGUgPSBXaW5kb3dNb2RlLk1heGltaXplZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3RhdGUubW9kZSA9IFdpbmRvd01vZGUuTm9ybWFsO1xuXHRcdH1cblxuXHRcdC8vIG9ubHkgY29uc2lkZXIgbm9uLW1pbmltaXplZCB3aW5kb3cgc3RhdGVzXG5cdFx0aWYgKG1vZGUgPT09IFdpbmRvd01vZGUuTm9ybWFsIHx8IG1vZGUgPT09IFdpbmRvd01vZGUuTWF4aW1pemVkKSB7XG5cdFx0XHRsZXQgYm91bmRzOiBlbGVjdHJvbi5SZWN0YW5nbGU7XG5cdFx0XHRpZiAobW9kZSA9PT0gV2luZG93TW9kZS5Ob3JtYWwpIHtcblx0XHRcdFx0Ym91bmRzID0gdGhpcy5nZXRCb3VuZHMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJvdW5kcyA9IHRoaXMuX3dpbi5nZXROb3JtYWxCb3VuZHMoKTsgLy8gbWFrZSBzdXJlIHRvIHBlcnNpc3QgdGhlIG5vcm1hbCBib3VuZHMgd2hlbiBtYXhpbWl6ZWQgdG8gYmUgYWJsZSB0byByZXN0b3JlIHRoZW1cblx0XHRcdH1cblxuXHRcdFx0c3RhdGUueCA9IGJvdW5kcy54O1xuXHRcdFx0c3RhdGUueSA9IGJvdW5kcy55O1xuXHRcdFx0c3RhdGUud2lkdGggPSBib3VuZHMud2lkdGg7XG5cdFx0XHRzdGF0ZS5oZWlnaHQgPSBib3VuZHMuaGVpZ2h0O1xuXHRcdH1cblxuXHRcdHN0YXRlLnpvb21MZXZlbCA9IHRoaXMuY3VzdG9tWm9vbUxldmVsO1xuXG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlV2luZG93U3RhdGUoc3RhdGU/OiBJV2luZG93U3RhdGUpOiBbSVdpbmRvd1N0YXRlLCBib29sZWFuPyAvKiBoYXMgbXVsdGlwbGUgZGlzcGxheXMgKi9dIHtcblx0XHRtYXJrKCdjb2RlL3dpbGxSZXN0b3JlQ29kZVdpbmRvd1N0YXRlJyk7XG5cblx0XHRsZXQgaGFzTXVsdGlwbGVEaXNwbGF5cyA9IGZhbHNlO1xuXHRcdGlmIChzdGF0ZSkge1xuXG5cdFx0XHQvLyBXaW5kb3cgem9vbVxuXHRcdFx0dGhpcy5jdXN0b21ab29tTGV2ZWwgPSBzdGF0ZS56b29tTGV2ZWw7XG5cblx0XHRcdC8vIFdpbmRvdyBkaW1lbnNpb25zXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBkaXNwbGF5cyA9IGVsZWN0cm9uLnNjcmVlbi5nZXRBbGxEaXNwbGF5cygpO1xuXHRcdFx0XHRoYXNNdWx0aXBsZURpc3BsYXlzID0gZGlzcGxheXMubGVuZ3RoID4gMTtcblxuXHRcdFx0XHRzdGF0ZSA9IFdpbmRvd1N0YXRlVmFsaWRhdG9yLnZhbGlkYXRlV2luZG93U3RhdGUodGhpcy5sb2dTZXJ2aWNlLCBzdGF0ZSwgZGlzcGxheXMpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBVbmV4cGVjdGVkIGVycm9yIHZhbGlkYXRpbmcgd2luZG93IHN0YXRlOiAke2Vycn1cXG4ke2Vyci5zdGFja31gKTsgLy8gc29tZWhvdyBkaXNwbGF5IEFQSSBjYW4gYmUgcGlja3kgYWJvdXQgdGhlIHN0YXRlIHRvIHZhbGlkYXRlXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bWFyaygnY29kZS9kaWRSZXN0b3JlQ29kZVdpbmRvd1N0YXRlJyk7XG5cblx0XHRyZXR1cm4gW3N0YXRlIHx8IGRlZmF1bHRXaW5kb3dTdGF0ZSgpLCBoYXNNdWx0aXBsZURpc3BsYXlzXTtcblx0fVxuXG5cdGdldEJvdW5kcygpOiBlbGVjdHJvbi5SZWN0YW5nbGUge1xuXHRcdGNvbnN0IFt4LCB5XSA9IHRoaXMuX3dpbi5nZXRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IFt3aWR0aCwgaGVpZ2h0XSA9IHRoaXMuX3dpbi5nZXRTaXplKCk7XG5cblx0XHRyZXR1cm4geyB4LCB5LCB3aWR0aCwgaGVpZ2h0IH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2V0RnVsbFNjcmVlbihmdWxsc2NyZWVuOiBib29sZWFuLCBmcm9tUmVzdG9yZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHN1cGVyLnNldEZ1bGxTY3JlZW4oZnVsbHNjcmVlbiwgZnJvbVJlc3RvcmUpO1xuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0dGhpcy5zZW5kV2hlblJlYWR5KGZ1bGxzY3JlZW4gPyAndnNjb2RlOmVudGVyRnVsbFNjcmVlbicgOiAndnNjb2RlOmxlYXZlRnVsbFNjcmVlbicsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Ly8gUmVzcGVjdCBjb25maWd1cmVkIG1lbnUgYmFyIHZpc2liaWxpdHkgb3IgZGVmYXVsdCB0byB0b2dnbGUgaWYgbm90IHNldFxuXHRcdGlmICh0aGlzLmN1cnJlbnRNZW51QmFyVmlzaWJpbGl0eSkge1xuXHRcdFx0dGhpcy5zZXRNZW51QmFyVmlzaWJpbGl0eSh0aGlzLmN1cnJlbnRNZW51QmFyVmlzaWJpbGl0eSwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0TWVudUJhclZpc2liaWxpdHkoKTogTWVudUJhclZpc2liaWxpdHkge1xuXHRcdGxldCBtZW51QmFyVmlzaWJpbGl0eSA9IGdldE1lbnVCYXJWaXNpYmlsaXR5KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChbJ3Zpc2libGUnLCAndG9nZ2xlJywgJ2hpZGRlbiddLmluZGV4T2YobWVudUJhclZpc2liaWxpdHkpIDwgMCkge1xuXHRcdFx0bWVudUJhclZpc2liaWxpdHkgPSAnY2xhc3NpYyc7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1lbnVCYXJWaXNpYmlsaXR5O1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRNZW51QmFyVmlzaWJpbGl0eSh2aXNpYmlsaXR5OiBNZW51QmFyVmlzaWJpbGl0eSwgbm90aWZ5ID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0cmV0dXJuOyAvLyBpZ25vcmUgZm9yIG1hY09TIHBsYXRmb3JtXG5cdFx0fVxuXG5cdFx0aWYgKHZpc2liaWxpdHkgPT09ICd0b2dnbGUnKSB7XG5cdFx0XHRpZiAobm90aWZ5KSB7XG5cdFx0XHRcdHRoaXMuc2VuZCgndnNjb2RlOnNob3dJbmZvTWVzc2FnZScsIGxvY2FsaXplKCdoaWRkZW5NZW51QmFyJywgXCJZb3UgY2FuIHN0aWxsIGFjY2VzcyB0aGUgbWVudSBiYXIgYnkgcHJlc3NpbmcgdGhlIEFsdC1rZXkuXCIpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicpIHtcblx0XHRcdC8vIGZvciBzb21lIHdlaXJkIHJlYXNvbiB0aGF0IEkgaGF2ZSBubyBleHBsYW5hdGlvbiBmb3IsIHRoZSBtZW51IGJhciBpcyBub3QgaGlkaW5nIHdoZW4gY2FsbGluZ1xuXHRcdFx0Ly8gdGhpcyB3aXRob3V0IHRpbWVvdXQgKHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTk3NzcpLiB0aGVyZSBzZWVtcyB0byBiZVxuXHRcdFx0Ly8gYSB0aW1pbmcgaXNzdWUgd2l0aCB1cyBvcGVuaW5nIHRoZSBmaXJzdCB3aW5kb3cgYW5kIHRoZSBtZW51IGJhciBnZXR0aW5nIGNyZWF0ZWQuIHNvbWVob3cgdGhlXG5cdFx0XHQvLyBmYWN0IHRoYXQgd2Ugd2FudCB0byBoaWRlIHRoZSBtZW51IHdpdGhvdXQgYmVpbmcgYWJsZSB0byBicmluZyBpdCBiYWNrIHZpYSBBbHQga2V5IG1ha2VzIEVsZWN0cm9uXG5cdFx0XHQvLyBzdGlsbCBzaG93IHRoZSBtZW51LiBVbmFibGUgdG8gcmVwcm9kdWNlIGZyb20gYSBzaW1wbGUgSGVsbG8gV29ybGQgYXBwbGljYXRpb24gdGhvdWdoLi4uXG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5kb1NldE1lbnVCYXJWaXNpYmlsaXR5KHZpc2liaWxpdHkpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZG9TZXRNZW51QmFyVmlzaWJpbGl0eSh2aXNpYmlsaXR5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvU2V0TWVudUJhclZpc2liaWxpdHkodmlzaWJpbGl0eTogTWVudUJhclZpc2liaWxpdHkpOiB2b2lkIHtcblx0XHRjb25zdCBpc0Z1bGxzY3JlZW4gPSB0aGlzLmlzRnVsbFNjcmVlbjtcblxuXHRcdHN3aXRjaCAodmlzaWJpbGl0eSkge1xuXHRcdFx0Y2FzZSAoJ2NsYXNzaWMnKTpcblx0XHRcdFx0dGhpcy5fd2luLnNldE1lbnVCYXJWaXNpYmlsaXR5KCFpc0Z1bGxzY3JlZW4pO1xuXHRcdFx0XHR0aGlzLl93aW4uYXV0b0hpZGVNZW51QmFyID0gaXNGdWxsc2NyZWVuO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAoJ3Zpc2libGUnKTpcblx0XHRcdFx0dGhpcy5fd2luLnNldE1lbnVCYXJWaXNpYmlsaXR5KHRydWUpO1xuXHRcdFx0XHR0aGlzLl93aW4uYXV0b0hpZGVNZW51QmFyID0gZmFsc2U7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICgndG9nZ2xlJyk6XG5cdFx0XHRcdHRoaXMuX3dpbi5zZXRNZW51QmFyVmlzaWJpbGl0eShmYWxzZSk7XG5cdFx0XHRcdHRoaXMuX3dpbi5hdXRvSGlkZU1lbnVCYXIgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAoJ2hpZGRlbicpOlxuXHRcdFx0XHR0aGlzLl93aW4uc2V0TWVudUJhclZpc2liaWxpdHkoZmFsc2UpO1xuXHRcdFx0XHR0aGlzLl93aW4uYXV0b0hpZGVNZW51QmFyID0gZmFsc2U7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdG5vdGlmeVpvb21MZXZlbCh6b29tTGV2ZWw6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuY3VzdG9tWm9vbUxldmVsID0gem9vbUxldmVsO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRab29tTGV2ZWwoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodHlwZW9mIHRoaXMuY3VzdG9tWm9vbUxldmVsID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3VzdG9tWm9vbUxldmVsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpbmRvd1NldHRpbmdzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV2luZG93U2V0dGluZ3MgfCB1bmRlZmluZWQ+KCd3aW5kb3cnKTtcblx0XHRyZXR1cm4gd2luZG93U2V0dGluZ3M/Lnpvb21MZXZlbDtcblx0fVxuXG5cdGNsb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3dpbj8uY2xvc2UoKTtcblx0fVxuXG5cdHNlbmRXaGVuUmVhZHkoY2hhbm5lbDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzUmVhZHkpIHtcblx0XHRcdHRoaXMuc2VuZChjaGFubmVsLCAuLi5hcmdzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZWFkeSgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5zZW5kKGNoYW5uZWwsIC4uLmFyZ3MpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRzZW5kKGNoYW5uZWw6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dpbikge1xuXHRcdFx0aWYgKHRoaXMuX3dpbi5pc0Rlc3Ryb3llZCgpIHx8IHRoaXMuX3dpbi53ZWJDb250ZW50cy5pc0Rlc3Ryb3llZCgpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBTZW5kaW5nIElQQyBtZXNzYWdlIHRvIGNoYW5uZWwgJyR7Y2hhbm5lbH0nIGZvciB3aW5kb3cgdGhhdCBpcyBkZXN0cm95ZWRgKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl93aW4ud2ViQ29udGVudHMuc2VuZChjaGFubmVsLCAuLi5hcmdzKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBFcnJvciBzZW5kaW5nIElQQyBtZXNzYWdlIHRvIGNoYW5uZWwgJyR7Y2hhbm5lbH0nIG9mIHdpbmRvdyAke3RoaXMuX2lkfTogJHt0b0Vycm9yTWVzc2FnZShlcnJvcil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlVG91Y2hCYXIoZ3JvdXBzOiBJU2VyaWFsaXphYmxlQ29tbWFuZEFjdGlvbltdW10pOiB2b2lkIHtcblx0XHRpZiAoIWlzTWFjaW50b3NoKSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgc3VwcG9ydGVkIG9uIG1hY09TXG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHNlZ21lbnRzIGZvciBhbGwgZ3JvdXBzLiBTZXR0aW5nIHRoZSBzZWdtZW50cyBwcm9wZXJ0eVxuXHRcdC8vIG9mIHRoZSBncm91cCBkaXJlY3RseSBwcmV2ZW50cyB1Z2x5IGZsaWNrZXJpbmcgZnJvbSBoYXBwZW5pbmdcblx0XHR0aGlzLnRvdWNoQmFyR3JvdXBzLmZvckVhY2goKHRvdWNoQmFyR3JvdXAsIGluZGV4KSA9PiB7XG5cdFx0XHRjb25zdCBjb21tYW5kcyA9IGdyb3Vwc1tpbmRleF07XG5cdFx0XHR0b3VjaEJhckdyb3VwLnNlZ21lbnRzID0gdGhpcy5jcmVhdGVUb3VjaEJhckdyb3VwU2VnbWVudHMoY29tbWFuZHMpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUb3VjaEJhcigpOiB2b2lkIHtcblx0XHRpZiAoIWlzTWFjaW50b3NoKSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgc3VwcG9ydGVkIG9uIG1hY09TXG5cdFx0fVxuXG5cdFx0Ly8gVG8gYXZvaWQgZmxpY2tlcmluZywgd2UgdHJ5IHRvIHJldXNlIHRoZSB0b3VjaCBiYXIgZ3JvdXBcblx0XHQvLyBhcyBtdWNoIGFzIHBvc3NpYmxlIGJ5IGNyZWF0aW5nIGEgbGFyZ2UgbnVtYmVyIG9mIGdyb3Vwc1xuXHRcdC8vIGZvciByZXVzaW5nIGxhdGVyLlxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTA7IGkrKykge1xuXHRcdFx0Y29uc3QgZ3JvdXBUb3VjaEJhciA9IHRoaXMuY3JlYXRlVG91Y2hCYXJHcm91cCgpO1xuXHRcdFx0dGhpcy50b3VjaEJhckdyb3Vwcy5wdXNoKGdyb3VwVG91Y2hCYXIpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3dpbi5zZXRUb3VjaEJhcihuZXcgZWxlY3Ryb24uVG91Y2hCYXIoeyBpdGVtczogdGhpcy50b3VjaEJhckdyb3VwcyB9KSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRvdWNoQmFyR3JvdXAoaXRlbXM6IElTZXJpYWxpemFibGVDb21tYW5kQWN0aW9uW10gPSBbXSk6IGVsZWN0cm9uLlRvdWNoQmFyU2VnbWVudGVkQ29udHJvbCB7XG5cblx0XHQvLyBHcm91cCBTZWdtZW50c1xuXHRcdGNvbnN0IHNlZ21lbnRzID0gdGhpcy5jcmVhdGVUb3VjaEJhckdyb3VwU2VnbWVudHMoaXRlbXMpO1xuXG5cdFx0Ly8gR3JvdXAgQ29udHJvbFxuXHRcdGNvbnN0IGNvbnRyb2wgPSBuZXcgZWxlY3Ryb24uVG91Y2hCYXIuVG91Y2hCYXJTZWdtZW50ZWRDb250cm9sKHtcblx0XHRcdHNlZ21lbnRzLFxuXHRcdFx0bW9kZTogJ2J1dHRvbnMnLFxuXHRcdFx0c2VnbWVudFN0eWxlOiAnYXV0b21hdGljJyxcblx0XHRcdGNoYW5nZTogKHNlbGVjdGVkSW5kZXgpID0+IHtcblx0XHRcdFx0dGhpcy5zZW5kV2hlblJlYWR5KCd2c2NvZGU6cnVuQWN0aW9uJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgeyBpZDogKGNvbnRyb2wuc2VnbWVudHNbc2VsZWN0ZWRJbmRleF0gYXMgSVRvdWNoQmFyU2VnbWVudCkuaWQsIGZyb206ICd0b3VjaGJhcicgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gY29udHJvbDtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVG91Y2hCYXJHcm91cFNlZ21lbnRzKGl0ZW1zOiBJU2VyaWFsaXphYmxlQ29tbWFuZEFjdGlvbltdID0gW10pOiBJVG91Y2hCYXJTZWdtZW50W10ge1xuXHRcdGNvbnN0IHNlZ21lbnRzOiBJVG91Y2hCYXJTZWdtZW50W10gPSBpdGVtcy5tYXAoaXRlbSA9PiB7XG5cdFx0XHRsZXQgaWNvbjogZWxlY3Ryb24uTmF0aXZlSW1hZ2UgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaXRlbS5pY29uICYmICFUaGVtZUljb24uaXNUaGVtZUljb24oaXRlbS5pY29uKSAmJiBpdGVtLmljb24/LmRhcms/LnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdGljb24gPSBlbGVjdHJvbi5uYXRpdmVJbWFnZS5jcmVhdGVGcm9tUGF0aChVUkkucmV2aXZlKGl0ZW0uaWNvbi5kYXJrKS5mc1BhdGgpO1xuXHRcdFx0XHRpZiAoaWNvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRpY29uID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGxldCB0aXRsZTogc3RyaW5nO1xuXHRcdFx0aWYgKHR5cGVvZiBpdGVtLnRpdGxlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHR0aXRsZSA9IGl0ZW0udGl0bGU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aXRsZSA9IGl0ZW0udGl0bGUudmFsdWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBpdGVtLmlkLFxuXHRcdFx0XHRsYWJlbDogIWljb24gPyB0aXRsZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aWNvblxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBzZWdtZW50cztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3RhcnRDb2xsZWN0aW5nSlNjYWxsU3RhY2tzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5qc0NhbGxTdGFja0NvbGxlY3Rvci5pc1RyaWdnZXJlZCgpKSB7XG5cdFx0XHRjb25zdCBzdGFjayA9IGF3YWl0IHRoaXMuX3dpbj8ud2ViQ29udGVudHMubWFpbkZyYW1lLmNvbGxlY3RKYXZhU2NyaXB0Q2FsbFN0YWNrKCk7XG5cblx0XHRcdC8vIEluY3JlbWVudCB0aGUgY291bnQgZm9yIHRoaXMgc3RhY2sgdHJhY2Vcblx0XHRcdGlmIChzdGFjaykge1xuXHRcdFx0XHRjb25zdCBjb3VudCA9IHRoaXMuanNDYWxsU3RhY2tNYXAuZ2V0KHN0YWNrKSB8fCAwO1xuXHRcdFx0XHR0aGlzLmpzQ2FsbFN0YWNrTWFwLnNldChzdGFjaywgY291bnQgKyAxKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5qc0NhbGxTdGFja0NvbGxlY3Rvci50cmlnZ2VyKCgpID0+IHRoaXMuc3RhcnRDb2xsZWN0aW5nSlNjYWxsU3RhY2tzKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RvcENvbGxlY3RpbmdKU2NhbGxTdGFja3MoKTogdm9pZCB7XG5cdFx0dGhpcy5qc0NhbGxTdGFja0NvbGxlY3RvclN0b3BTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy5qc0NhbGxTdGFja0NvbGxlY3Rvci5jYW5jZWwoKTtcblxuXHRcdGlmICh0aGlzLmpzQ2FsbFN0YWNrTWFwLnNpemUpIHtcblx0XHRcdGxldCBsb2dNZXNzYWdlID0gYENvZGVXaW5kb3cgdW5yZXNwb25zaXZlIHNhbXBsZXM6XFxuYDtcblx0XHRcdGxldCBzYW1wbGVzID0gMDtcblxuXHRcdFx0Y29uc3Qgc29ydGVkRW50cmllcyA9IEFycmF5LmZyb20odGhpcy5qc0NhbGxTdGFja01hcC5lbnRyaWVzKCkpXG5cdFx0XHRcdC5zb3J0KChhLCBiKSA9PiBiWzFdIC0gYVsxXSk7XG5cblx0XHRcdGZvciAoY29uc3QgW3N0YWNrLCBjb3VudF0gb2Ygc29ydGVkRW50cmllcykge1xuXHRcdFx0XHRzYW1wbGVzICs9IGNvdW50O1xuXHRcdFx0XHQvLyBJZiB0aGUgc3RhY2sgYXBwZWFycyBtb3JlIHRoYW4gMjAgcGVyY2VudCBvZiB0aGUgdGltZSwgbG9nIGl0XG5cdFx0XHRcdC8vIHRvIHRoZSBlcnJvciB0ZWxlbWV0cnkgYXMgVW5yZXNwb25zaXZlU2FtcGxlRXJyb3IuXG5cdFx0XHRcdGlmIChNYXRoLnJvdW5kKChjb3VudCAqIDEwMCkgLyB0aGlzLmpzQ2FsbFN0YWNrRWZmZWN0aXZlU2FtcGxlQ291bnQpID4gMjApIHtcblx0XHRcdFx0XHRjb25zdCBmYWtlRXJyb3IgPSBuZXcgVW5yZXNwb25zaXZlRXJyb3Ioc3RhY2ssIHRoaXMuaWQsIHRoaXMuX3dpbj8ud2ViQ29udGVudHMuZ2V0T1NQcm9jZXNzSWQoKSk7XG5cdFx0XHRcdFx0ZXJyb3JIYW5kbGVyLm9uVW5leHBlY3RlZEVycm9yKGZha2VFcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0bG9nTWVzc2FnZSArPSBgPCR7Y291bnR9PiAke3N0YWNrfVxcbmA7XG5cdFx0XHR9XG5cblx0XHRcdGxvZ01lc3NhZ2UgKz0gYFRvdGFsIFNhbXBsZXM6ICR7c2FtcGxlc31cXG5gO1xuXHRcdFx0bG9nTWVzc2FnZSArPSAnRm9yIGZ1bGwgb3ZlcnZpZXcgb2YgdGhlIHVucmVzcG9uc2l2ZSBwZXJpb2QsIGNhcHR1cmUgY3B1IHByb2ZpbGUgdmlhIGh0dHBzOi8vYWthLm1zL3ZzY29kZS10cmFjaW5nLWNwdS1wcm9maWxlJztcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihsb2dNZXNzYWdlKTtcblx0XHR9XG5cblx0XHR0aGlzLmpzQ2FsbFN0YWNrTWFwLmNsZWFyKCk7XG5cdH1cblxuXHRtYXRjaGVzKHdlYkNvbnRlbnRzOiBlbGVjdHJvbi5XZWJDb250ZW50cyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl93aW4/LndlYkNvbnRlbnRzLmlkID09PSB3ZWJDb250ZW50cy5pZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gRGVyZWdpc3RlciB0aGUgbG9nZ2VycyBmb3IgdGhpcyB3aW5kb3dcblx0XHR0aGlzLmxvZ2dlck1haW5TZXJ2aWNlLmRlcmVnaXN0ZXJMb2dnZXJzKHRoaXMuaWQpO1xuXHR9XG59XG5cbmNsYXNzIFVucmVzcG9uc2l2ZUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXG5cdGNvbnN0cnVjdG9yKHNhbXBsZTogc3RyaW5nLCB3aW5kb3dJZDogbnVtYmVyLCBwaWQgPSAwKSB7XG5cdFx0Ly8gU2luY2UgdGhlIHN0YWNrcyBhcmUgYXZhaWxhYmxlIHZpYSB0aGUgc2FtcGxlXG5cdFx0Ly8gd2UgY2FuIGF2b2lkIGNvbGxlY3RpbmcgdGhlbSB3aGVuIGNvbnN0cnVjdGluZyB0aGUgZXJyb3IuXG5cdFx0Y29uc3Qgc3RhY2tUcmFjZUxpbWl0ID0gRXJyb3Iuc3RhY2tUcmFjZUxpbWl0O1xuXHRcdEVycm9yLnN0YWNrVHJhY2VMaW1pdCA9IDA7XG5cdFx0c3VwZXIoYFVucmVzcG9uc2l2ZVNhbXBsZUVycm9yOiBmcm9tIHdpbmRvdyB3aXRoIElEICR7d2luZG93SWR9IGJlbG9uZ2luZyB0byBwcm9jZXNzIHdpdGggcGlkICR7cGlkfWApO1xuXHRcdEVycm9yLnN0YWNrVHJhY2VMaW1pdCA9IHN0YWNrVHJhY2VMaW1pdDtcblx0XHR0aGlzLm5hbWUgPSAnVW5yZXNwb25zaXZlU2FtcGxlRXJyb3InO1xuXHRcdHRoaXMuc3RhY2sgPSBzYW1wbGU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTyxZQUFzRCxjQUFjO0FBQzNFLFNBQVMsaUJBQWlCLGtCQUFrQixTQUFTLGVBQWU7QUFDcEUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLGlCQUE4QixtQkFBbUIsb0JBQW9CO0FBQzFGLFNBQVMsWUFBWSxlQUFlO0FBQ3BDLFNBQVMsVUFBVSxZQUFZO0FBQy9CLFNBQVMsZ0JBQWdCLFNBQVMsYUFBYSxpQkFBaUI7QUFDaEUsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUV4QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFvQyw2QkFBNkI7QUFDakUsU0FBUywwQkFBMEI7QUFFbkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBd0IsNEJBQTRCO0FB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SztBQUNoRCxhQUFLLGVBQWUsSUFBSSxPQUFPLFFBQVEsQ0FBQztBQUFBLE1BQ3pDO0FBRUEsV0FBSyxxQkFBcUIsUUFBUSxNQUFNLEtBQUssNEJBQTRCLENBQUM7QUFBQSxJQUMzRTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDZCQUFtQztBQUMxQyxTQUFLLGtDQUFrQyxPQUFPO0FBQzlDLFNBQUsscUJBQXFCLE9BQU87QUFFakMsUUFBSSxLQUFLLGVBQWUsTUFBTTtBQUM3QixVQUFJLGFBQWE7QUFBQTtBQUNqQixVQUFJLFVBQVU7QUFFZCxZQUFNLGdCQUFnQixNQUFNLEtBQUssS0FBSyxlQUFlLFFBQVEsQ0FBQyxFQUM1RCxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBRTVCLGlCQUFXLENBQUMsT0FBTyxLQUFLLEtBQUssZUFBZTtBQUMzQyxtQkFBVztBQUdYLFlBQUksS0FBSyxNQUFPLFFBQVEsTUFBTyxLQUFLLCtCQUErQixJQUFJLElBQUk7QUFDMUUsZ0JBQU0sWUFBWSxJQUFJLGtCQUFrQixPQUFPLEtBQUssSUFBSSxLQUFLLE1BQU0sWUFBWSxlQUFlLENBQUM7QUFDL0YsdUJBQWEsa0JBQWtCLFNBQVM7QUFBQSxRQUN6QztBQUNBLHNCQUFjLElBQUksS0FBSyxLQUFLLEtBQUs7QUFBQTtBQUFBLE1BQ2xDO0FBRUEsb0JBQWMsa0JBQWtCLE9BQU87QUFBQTtBQUN2QyxvQkFBYztBQUNkLFdBQUssV0FBVyxNQUFNLFVBQVU7QUFBQSxJQUNqQztBQUVBLFNBQUssZUFBZSxNQUFNO0FBQUEsRUFDM0I7QUFBQSxFQUVBLFFBQVEsYUFBNEM7QUFDbkQsV0FBTyxLQUFLLE1BQU0sWUFBWSxPQUFPLFlBQVk7QUFBQSxFQUNsRDtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsVUFBTSxRQUFRO0FBR2QsU0FBSyxrQkFBa0Isa0JBQWtCLEtBQUssRUFBRTtBQUFBLEVBQ2pEO0FBQ0Q7QUE1bENhLGFBQU47QUFBQSxFQTRFSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQS9GVTtBQThsQ2IsTUFBTSwwQkFBMEIsTUFBTTtBQUFBLEVBRXJDLFlBQVksUUFBZ0IsVUFBa0IsTUFBTSxHQUFHO0FBR3RELFVBQU0sa0JBQWtCLE1BQU07QUFDOUIsVUFBTSxrQkFBa0I7QUFDeEIsVUFBTSxnREFBZ0QsUUFBUSxrQ0FBa0MsR0FBRyxFQUFFO0FBQ3JHLFVBQU0sa0JBQWtCO0FBQ3hCLFNBQUssT0FBTztBQUNaLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFDRDsiLAogICJuYW1lcyI6IFsiUmVhZHlTdGF0ZSIsICJwcm9maWxlIl0KfQo=
