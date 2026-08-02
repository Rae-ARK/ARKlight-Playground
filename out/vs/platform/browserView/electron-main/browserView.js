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
import { screen, WebContentsView, webContents } from "electron";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { browserViewIsolatedWorldId, browserZoomFactors, browserZoomDefaultIndex } from "../common/browserView.js";
import { BrowserViewEmulator } from "./browserViewEmulator.js";
import { BrowserViewInspector } from "./browserViewInspector.js";
import { IWindowsMainService } from "../../windows/electron-main/windows.js";
import { LoadReason } from "../../window/electron-main/window.js";
import { IAuxiliaryWindowsMainService } from "../../auxiliaryWindow/electron-main/auxiliaryWindows.js";
import { BrowserViewDebugger } from "./browserViewDebugger.js";
import { ILogService } from "../../log/common/log.js";
import { PermissionCategory } from "../common/browserPermissions.js";
import { SCAN_CODE_STR_TO_EVENT_KEY_CODE } from "../../../base/common/keyCodes.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { logBrowserOpen } from "../common/browserViewTelemetry.js";
var NewPageLocation = /* @__PURE__ */ ((NewPageLocation2) => {
  NewPageLocation2["Foreground"] = "foreground";
  NewPageLocation2["Background"] = "background";
  NewPageLocation2["NewWindow"] = "newWindow";
  return NewPageLocation2;
})(NewPageLocation || {});
let BrowserView = class extends Disposable {
  constructor(id, owner, session, createChildView, openContextMenu, options, windowsMainService, auxiliaryWindowsMainService, logService, telemetryService) {
    super();
    this.id = id;
    this.owner = owner;
    this.session = session;
    this.windowsMainService = windowsMainService;
    this.auxiliaryWindowsMainService = auxiliaryWindowsMainService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this._faviconRequestCache = /* @__PURE__ */ new Map();
    this._lastScreenshot = void 0;
    this._lastFavicon = void 0;
    this._lastError = void 0;
    this._lastUserGestureTimestamp = -Infinity;
    this._browserZoomIndex = browserZoomDefaultIndex;
    this._explicitNavigationPending = false;
    /**
     * Active index in the webContents navigation history list.
     * Used to tell whether a navigation appended a new entry or replaced the current one in place.
     */
    this._lastCommittedEntryIndex = -1;
    this._isDisposed = false;
    this._wantsVisibility = false;
    this._hasBeenLaidOut = false;
    this._consoleLogs = [];
    this._onDidNavigate = this._register(new Emitter());
    this.onDidNavigate = this._onDidNavigate.event;
    this._onDidChangeLoadingState = this._register(new Emitter());
    this.onDidChangeLoadingState = this._onDidChangeLoadingState.event;
    this._onDidChangeFocus = this._register(new Emitter());
    this.onDidChangeFocus = this._onDidChangeFocus.event;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._onDidChangeDevToolsState = this._register(new Emitter());
    this.onDidChangeDevToolsState = this._onDidChangeDevToolsState.event;
    this._onDidKeyCommand = this._register(new Emitter());
    this.onDidKeyCommand = this._onDidKeyCommand.event;
    this._onDidChangeTitle = this._register(new Emitter());
    this.onDidChangeTitle = this._onDidChangeTitle.event;
    this._onDidChangeFavicon = this._register(new Emitter());
    this.onDidChangeFavicon = this._onDidChangeFavicon.event;
    this._onDidFindInPage = this._register(new Emitter());
    this.onDidFindInPage = this._onDidFindInPage.event;
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this._onDidChangeRemoteStatus = this._register(new Emitter());
    this.onDidChangeRemoteStatus = this._onDidChangeRemoteStatus.event;
    this._onDidRequestPermission = this._register(new Emitter());
    this.onDidRequestPermission = this._onDidRequestPermission.event;
    this._onDidChangePermissions = this._register(new Emitter());
    this.onDidChangePermissions = this._onDidChangePermissions.event;
    const webPreferences = {
      ...options?.webPreferences,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // NOTE: When `sandbox` is enabled, `nodeIntegrationInSubFrames` doesn't actually enable node integration or prevent sandboxing.
      //       It allows preload scripts to run in subframes, which is important for our features like keyboard shortcut forwarding.
      nodeIntegrationInSubFrames: true,
      webviewTag: false,
      session: this.session.electronSession,
      focusOnNavigation: false
    };
    this._view = new WebContentsView({
      webPreferences,
      // Passing an `undefined` webContents triggers an error in Electron.
      ...options?.webContents ? { webContents: options.webContents } : {}
    });
    this._view.setBounds({ x: 0, y: 0, width: 1024, height: 768 });
    this._view.setBackgroundColor("#FFFFFF");
    this._ownerWindow = this.windowsMainService.getWindowById(owner.mainWindowId);
    if (!this._ownerWindow) {
      throw new Error(`Window with ID ${owner.mainWindowId} not found`);
    }
    this._register(this._ownerWindow.onDidClose(() => this.dispose()));
    this._register(this._ownerWindow.onWillLoad((e) => {
      if (e.reason === LoadReason.LOAD) {
        this.dispose();
      } else if (e.reason === LoadReason.RELOAD) {
        this.setVisible(false);
      }
    }));
    this._view.setVisible(false);
    this._ownerWindow.win?.contentView.addChildView(this._view);
    this._view.webContents.setWindowOpenHandler((details) => {
      const location = (() => {
        switch (details.disposition) {
          case "background-tab":
            return "background" /* Background */;
          case "foreground-tab":
            return "foreground" /* Foreground */;
          case "new-window":
            return "newWindow" /* NewWindow */;
          default:
            return void 0;
        }
      })();
      if (!location || !this.consumePopupPermission(location)) {
        return { action: "deny" };
      }
      return {
        action: "allow",
        createWindow: (options2) => {
          logBrowserOpen(this.telemetryService, (() => {
            switch (location) {
              case "newWindow" /* NewWindow */:
                return "browserLinkNewWindow";
              case "background" /* Background */:
                return "browserLinkBackground";
              case "foreground" /* Foreground */:
                return "browserLinkForeground";
            }
          })());
          const childView = createChildView(details.url, options2, {
            pinned: true,
            background: location === "background" /* Background */,
            parentViewId: id,
            auxiliaryWindow: location === "newWindow" /* NewWindow */ ? { x: options2.x, y: options2.y, width: options2.width, height: options2.height } : void 0
          });
          return childView.webContents;
        },
        // We want the standard browser behavior as opposed to Electron's default of closing the new window when the parent is closed
        outlivesOpener: true
      };
    });
    this._view.webContents.on("context-menu", (_event, params) => {
      openContextMenu(this, params);
    });
    this._view.webContents.on("destroyed", () => {
      this.dispose();
    });
    this.debugger = new BrowserViewDebugger(this, this.logService);
    this.emulator = this._register(new BrowserViewEmulator(this, this.logService));
    this.inspector = this._register(new BrowserViewInspector(this));
    const fireRemoteStatus = () => this._onDidChangeRemoteStatus.fire(this.session.remote.isRemote);
    this._register(this.session.remote.onDidStart(fireRemoteStatus));
    this._register(this.session.remote.onDidStop(fireRemoteStatus));
    this._register(this.session.permissions.onDidRequestPermission((e) => {
      if (e.webContents === this.webContents && !this._isDisposed) {
        e.claim();
        this._onDidRequestPermission.fire(e.request);
      }
    }));
    this._register(this.session.permissions.onDidRequestDevice((e) => {
      if (e.webContents === this.webContents && !this._isDisposed) {
        e.claim();
        this._onDidRequestPermission.fire({
          origin: e.origin,
          category: PermissionCategory.Devices,
          device: {
            requestId: e.requestId,
            deviceType: e.deviceType,
            devices: e.devices
          }
        });
      }
    }));
    this._register(this.session.permissions.onDidChange(() => {
      this._onDidChangePermissions.fire(this.session.permissions.serialize());
    }));
    this.setupEventListeners();
  }
  setupEventListeners() {
    const webContents2 = this._view.webContents;
    webContents2.on("devtools-opened", () => {
      this._onDidChangeDevToolsState.fire({ isDevToolsOpen: true });
    });
    webContents2.on("devtools-closed", () => {
      this._onDidChangeDevToolsState.fire({ isDevToolsOpen: false });
    });
    webContents2.on("page-favicon-updated", async (_event, favicons) => {
      for (const url of favicons) {
        if (!this._faviconRequestCache.has(url)) {
          this._faviconRequestCache.set(url, (async () => {
            if (url.startsWith("data:image/")) {
              return url;
            }
            const response = await webContents2.session.fetch(url, {
              cache: "force-cache"
            });
            if (!response.ok) {
              throw new Error(`Failed to fetch favicon: ${response.status} ${response.statusText}`);
            }
            const type = await response.headers.get("content-type");
            if (!type?.startsWith("image/")) {
              throw new Error(`Favicon is not an image: ${type}`);
            }
            const buffer = await response.arrayBuffer();
            return `data:${type};base64,${Buffer.from(buffer).toString("base64")}`;
          })());
        }
        try {
          this._lastFavicon = await this._faviconRequestCache.get(url);
          this._onDidChangeFavicon.fire({ favicon: this._lastFavicon });
          this._currentHistoryHandle?.update({ favicon: this._lastFavicon });
          return;
        } catch (e) {
        }
      }
      if (this._lastFavicon) {
        this._lastFavicon = void 0;
        this._onDidChangeFavicon.fire({ favicon: this._lastFavicon });
        this._currentHistoryHandle?.update({ favicon: null });
      }
    });
    webContents2.on("will-navigate", (event) => {
      const host = URL.parse(event.url)?.host;
      const currHost = URL.parse(this.webContents.getURL())?.host;
      if (host !== currHost) {
        this._lastFavicon = void 0;
      }
    });
    webContents2.on("page-title-updated", (_event, title) => {
      this._onDidChangeTitle.fire({ title });
      this._currentHistoryHandle?.update({ title });
    });
    const fireNavigationEvent = (url) => {
      this._onDidNavigate.fire({
        url,
        title: webContents2.getTitle(),
        canGoBack: webContents2.navigationHistory.canGoBack(),
        canGoForward: webContents2.navigationHistory.canGoForward(),
        certificateError: this.session.trust.getCertificateError(url)
      });
      this._recordNavigation(url);
    };
    const fireLoadingEvent = (loading) => {
      this._onDidChangeLoadingState.fire({ loading, error: this._lastError });
    };
    webContents2.on("did-start-loading", () => {
      this._lastError = void 0;
      if (webContents2.isLoadingMainFrame()) {
        fireLoadingEvent(true);
      }
    });
    webContents2.on("did-stop-loading", () => fireLoadingEvent(false));
    webContents2.on("did-fail-load", (e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame) {
        if (errorCode === -3) {
          fireLoadingEvent(false);
          return;
        }
        this._lastError = {
          url: validatedURL,
          errorCode,
          errorDescription,
          // -200 - -220 are the range of certificate errors in Chromium.
          certificateError: errorCode <= -200 && errorCode >= -220 ? this.session.trust.getCertificateError(validatedURL) : void 0
        };
        fireLoadingEvent(false);
        this._onDidNavigate.fire({
          url: validatedURL,
          title: "",
          canGoBack: webContents2.navigationHistory.canGoBack(),
          canGoForward: webContents2.navigationHistory.canGoForward(),
          certificateError: this.session.trust.getCertificateError(validatedURL)
        });
      }
    });
    webContents2.on("did-finish-load", () => fireLoadingEvent(false));
    this.session.trust.installCertErrorHandler(webContents2);
    webContents2.on("login", (event, _details, authInfo, callback) => {
      if (this.session.remote.proxy) {
        const { username, password } = this.session.remote.proxy.credentials;
        const proxyPort = this.session.remote.proxy.port;
        if (authInfo.isProxy && authInfo.host === "127.0.0.1" && authInfo.port === proxyPort) {
          event.preventDefault();
          callback(username, password);
        }
      }
    });
    webContents2.on("render-process-gone", (_event, details) => {
      this._lastError = {
        url: webContents2.getURL(),
        errorCode: details.exitCode,
        errorDescription: `Render process gone: ${details.reason}`
      };
      fireLoadingEvent(false);
    });
    webContents2.on("did-navigate", (_, url) => fireNavigationEvent(url));
    webContents2.on("did-navigate-in-page", (_, url, isMainFrame) => {
      if (isMainFrame) {
        fireNavigationEvent(url);
      }
    });
    webContents2.on("did-navigate", () => {
      this._consoleLogs.length = 0;
      this._view.webContents.setZoomFactor(browserZoomFactors[this._browserZoomIndex]);
      void this._view.webContents.setVisualZoomLevelLimits(1, 3).catch((error) => {
        this.logService.error("Failed to set visual zoom level limits for browser view webContents.", error);
      });
    });
    webContents2.on("select-bluetooth-device", (event, devices, callback) => {
      event.preventDefault();
      this.session.permissions.beginBluetoothRequest(this.webContents, devices, callback);
    });
    webContents2.on("focus", () => {
      this._onDidChangeFocus.fire({ focused: true });
    });
    webContents2.on("blur", () => {
      this._onDidChangeFocus.fire({ focused: false });
    });
    const onCommandKeydown = (_event, keyEvent) => {
      this._onDidKeyCommand.fire(keyEvent);
    };
    webContents2.ipc.on("vscode:browserView:keydown", onCommandKeydown);
    webContents2.on("devtools-opened", () => {
      webContents2.devToolsWebContents?.ipc.off("vscode:browserView:keydown", onCommandKeydown);
      webContents2.devToolsWebContents?.ipc.on("vscode:browserView:keydown", onCommandKeydown);
    });
    webContents2.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") {
        return;
      }
      const pageIsAvailable = this._view.getVisible() && !webContents2.isCrashed() && !this.debugger.isPaused;
      if (pageIsAvailable) {
        return;
      }
      if (!(input.control || input.alt || input.meta) && input.key.length === 1) {
        return;
      }
      event.preventDefault();
      const eventKeyCode = SCAN_CODE_STR_TO_EVENT_KEY_CODE[input.code] || 0;
      this._onDidKeyCommand.fire({
        key: input.key,
        keyCode: eventKeyCode,
        code: input.code,
        ctrlKey: input.control,
        shiftKey: input.shift,
        altKey: input.alt,
        metaKey: input.meta,
        repeat: input.isAutoRepeat
      });
    });
    webContents2.on("input-event", (_event, input) => {
      switch (input.type) {
        case "rawKeyDown":
        case "keyDown":
        case "mouseDown":
        case "pointerDown":
        case "pointerUp":
        case "touchEnd":
          this._lastUserGestureTimestamp = Date.now();
      }
    });
    webContents2.on("will-prevent-unload", (e) => {
      e.preventDefault();
    });
    webContents2.on("found-in-page", (_event, result) => {
      this._onDidFindInPage.fire({
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches,
        selectionArea: result.selectionArea,
        finalUpdate: result.finalUpdate
      });
    });
    this._view.webContents.on("console-message", (event) => {
      this._consoleLogs.push(`[${event.level}] ${event.message}`);
      if (this._consoleLogs.length > BrowserView.MAX_CONSOLE_LOG_ENTRIES) {
        this._consoleLogs.splice(0, this._consoleLogs.length - BrowserView.MAX_CONSOLE_LOG_ENTRIES);
      }
    });
  }
  consumePopupPermission(location) {
    switch (location) {
      case "foreground" /* Foreground */:
      case "background" /* Background */:
        return true;
      case "newWindow" /* NewWindow */:
        if (this._lastUserGestureTimestamp > Date.now() - 1e3) {
          this._lastUserGestureTimestamp = -Infinity;
          return true;
        }
        return false;
    }
  }
  /**
   * Record a committed navigation in the session's history.
   */
  _recordNavigation(url) {
    const webContents2 = this._view.webContents;
    const activeIndex = webContents2.navigationHistory.getActiveIndex();
    if (!isTrackableHistoryUrl(url)) {
      this._currentHistoryHandle = void 0;
      this._lastCommittedEntryIndex = activeIndex;
      return;
    }
    const handle = this._currentHistoryHandle;
    if (handle && activeIndex === this._lastCommittedEntryIndex) {
      handle.update({ url, title: webContents2.getTitle() });
      return;
    }
    this._lastCommittedEntryIndex = activeIndex;
    const userInitiated = this._explicitNavigationPending;
    this._explicitNavigationPending = false;
    this._currentHistoryHandle = this.session.history.add(
      url,
      webContents2.getTitle(),
      this._lastFavicon,
      userInitiated
    );
  }
  get webContents() {
    return this._view.webContents;
  }
  /**
   * Get the current state of this browser view
   */
  getState() {
    const webContents2 = this._view.webContents;
    const url = webContents2.getURL();
    return {
      url,
      title: webContents2.getTitle(),
      canGoBack: webContents2.navigationHistory.canGoBack(),
      canGoForward: webContents2.navigationHistory.canGoForward(),
      loading: webContents2.isLoading(),
      focused: webContents2.isFocused(),
      visible: this._view.getVisible(),
      isDevToolsOpen: webContents2.isDevToolsOpened(),
      lastScreenshot: this._lastScreenshot,
      lastFavicon: this._lastFavicon,
      lastError: this._lastError,
      certificateError: this.session.trust.getCertificateError(url),
      storageScope: this.session.storageScope,
      storageKeys: { ...this.session.history.storageKeys, ...this.session.permissions.storageKeys },
      permissions: this.session.permissions.serialize(),
      browserZoomIndex: this._browserZoomIndex,
      elementSelectionState: this.inspector.elementSelectionState,
      isRemoteSession: this.session.remote.isRemote,
      isAreaSelectionActive: this.inspector.isAreaSelectionActive,
      device: this.emulator.device
    };
  }
  /**
   * Toggle developer tools for this browser view.
   */
  toggleDevTools() {
    this._view.webContents.toggleDevTools();
  }
  /**
   * Update the layout bounds of this view
   */
  layout(bounds) {
    if (this._currentWindow?.win?.id !== bounds.windowId) {
      const newWindow = this._windowById(bounds.windowId);
      if (newWindow) {
        this._currentWindow?.win?.contentView.removeChildView(this._view);
        this._currentWindow = newWindow;
        newWindow.win?.contentView.addChildView(this._view);
      }
    }
    this._view.setBorderRadius(Math.round(bounds.cornerRadius * bounds.zoomFactor));
    if (bounds.emulation) {
      this.emulator.applyScreenEmulation(bounds.width, bounds.height, bounds.emulation.scale, bounds.zoomFactor);
    }
    this._view.setBounds({
      x: Math.round(bounds.x * bounds.zoomFactor),
      y: Math.round(bounds.y * bounds.zoomFactor),
      width: Math.round(bounds.width * bounds.zoomFactor),
      height: Math.round(bounds.height * bounds.zoomFactor)
    });
    this._hasBeenLaidOut = true;
    if (this._wantsVisibility && !this._view.getVisible()) {
      this._view.setVisible(true);
    }
  }
  setBrowserZoomIndex(zoomIndex) {
    this._browserZoomIndex = Math.max(0, Math.min(zoomIndex, browserZoomFactors.length - 1));
    const browserZoomFactor = browserZoomFactors[this._browserZoomIndex];
    this._view.webContents.setZoomFactor(browserZoomFactor);
  }
  /**
   * Set the visibility of this view
   */
  setVisible(visible) {
    if (this._wantsVisibility === visible) {
      return;
    }
    if (!visible && this._view.webContents.isFocused()) {
      this._currentWindow?.win?.webContents.focus();
    }
    if (this._hasBeenLaidOut || !visible) {
      this._view.setVisible(visible);
    }
    this._wantsVisibility = visible;
    this._onDidChangeVisibility.fire({ visible });
  }
  /**
   * Get captured console logs.
   */
  getConsoleLogs() {
    return this._consoleLogs.join("\n");
  }
  /**
   * Load a URL in this view
   */
  async loadURL(url) {
    this._explicitNavigationPending = true;
    await this.session.remote.whenReady;
    await this._view.webContents.loadURL(url);
  }
  /**
   * Get the current URL
   */
  getURL() {
    return this._view.webContents.getURL();
  }
  /**
   * Navigate back in history
   */
  goBack() {
    if (this._view.webContents.navigationHistory.canGoBack()) {
      this._view.webContents.navigationHistory.goBack();
    }
  }
  /**
   * Navigate forward in history
   */
  goForward() {
    if (this._view.webContents.navigationHistory.canGoForward()) {
      this._view.webContents.navigationHistory.goForward();
    }
  }
  /**
   * Reload the current page
   */
  reload(hard) {
    if (hard) {
      this._view.webContents.reloadIgnoringCache();
    } else {
      this._view.webContents.reload();
    }
  }
  /**
   * Check if the view can navigate back
   */
  canGoBack() {
    return this._view.webContents.navigationHistory.canGoBack();
  }
  /**
   * Check if the view can navigate forward
   */
  canGoForward() {
    return this._view.webContents.navigationHistory.canGoForward();
  }
  /**
   * Capture a screenshot of this view
   */
  async captureScreenshot(options) {
    if (!this._view.getVisible()) {
      this._view.setVisible(true);
      this._view.setVisible(false);
    }
    const quality = options?.quality ?? 80;
    const format = options?.format ?? "jpeg";
    if (options?.fullPage && !options.screenRect && !options.pageRect) {
      return this._captureFullPageScreenshot(format, quality);
    }
    if (options?.pageRect) {
      const zoomFactor = this._view.webContents.getZoomFactor();
      const visualViewportScale = await this.inspector.getVisualViewportScale();
      const emulationScale = this.emulator.emulatedScaleFactor;
      options.screenRect = {
        x: options.pageRect.x * visualViewportScale * zoomFactor * emulationScale,
        y: options.pageRect.y * visualViewportScale * zoomFactor * emulationScale,
        width: options.pageRect.width * visualViewportScale * zoomFactor * emulationScale,
        height: options.pageRect.height * visualViewportScale * zoomFactor * emulationScale
      };
    }
    if (options?.awaitNextPaint) {
      await this._waitForNextPaint();
    }
    const image = await (async () => {
      const maxAttempts = 5;
      let lastError;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          return await this._view.webContents.capturePage(options?.screenRect, {
            stayHidden: true
          });
        } catch (error) {
          if (error instanceof Error && error.message === "UnknownVizError") {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 16));
            continue;
          } else {
            throw error;
          }
        }
      }
      throw new Error(`Failed to capture screenshot after ${maxAttempts} attempts`, { cause: lastError });
    })();
    const buffer = format === "png" ? image.toPNG() : image.toJPEG(quality);
    const screenshot = VSBuffer.wrap(buffer);
    if (!options?.screenRect) {
      this._lastScreenshot = screenshot;
    }
    return screenshot;
  }
  // Capture a screenshot of the full scrollable document (beyond the viewport) via CDP.
  async _captureFullPageScreenshot(format, quality) {
    const metrics = await this.debugger.sendCommand("Page.getLayoutMetrics");
    const size = metrics.cssContentSize;
    if (!size) {
      throw new Error("Page.getLayoutMetrics did not return a cssContentSize");
    }
    const zoomFactor = this._view.webContents.getZoomFactor();
    const clipWidth = size.width * zoomFactor;
    const clipHeight = size.height * zoomFactor;
    const hostWindow = this._hostWindow;
    const display = hostWindow ? screen.getDisplayMatching(hostWindow.getBounds()) : screen.getPrimaryDisplay();
    const devicePixelRatio = display.scaleFactor;
    const maxClipDimension = BrowserView.MAX_FULL_PAGE_SCREENSHOT_DIMENSION / Math.max(devicePixelRatio, 1);
    const scale = Math.min(1, maxClipDimension / Math.max(clipWidth, clipHeight));
    try {
      const result = await this.debugger.sendCommand("Page.captureScreenshot", {
        format,
        ...format === "jpeg" ? { quality } : {},
        captureBeyondViewport: true,
        // In theory, `clip` defaults to the full area when not explicitly passed, but in practice it doesn't work when
        // the zoom level isn't 100, because it doesn't multiply the width and height by zoomFactor like we do here.
        // Setting the clip explicitly, we can multiply by zoomFactor and thus work around this Chromium bug.
        // Note that even with this workaround, we often see that the page isn't fully captured and might repeat
        // visual content from the top at the bottom, instead of showing the bottom of the page.
        // - Another sidenote: Currently the scrollbar width isn't accounted for. If a scrollbar exists, we should add the
        //   vertical scrollbar's width and horizontal scrollbar's height to the clip dimensions, since the image is currently
        //   clipped by that amount (this also happens when no clip parameter is provided; ideally it should be fixed upstream
        //   in Chromium).
        clip: { x: 0, y: 0, width: clipWidth, height: clipHeight, scale }
      });
      return VSBuffer.wrap(Buffer.from(result.data, "base64"));
    } finally {
      void this._view.webContents.setVisualZoomLevelLimits(1, 3).catch((error) => {
        this.logService.error("Failed to restore visual zoom level limits after full-page screenshot.", error);
      });
    }
  }
  async _waitForNextPaint() {
    const WAIT_TIMEOUT_MS = 100;
    try {
      await Promise.race([
        this.debugger.sendCommand("Runtime.evaluate", {
          expression: "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))",
          awaitPromise: true
        }),
        new Promise((resolve) => setTimeout(resolve, WAIT_TIMEOUT_MS))
      ]);
    } catch {
    }
  }
  /**
   * Focus this view
   */
  async focus(force) {
    if (!force && !this._currentWindow?.win?.isFocused()) {
      return;
    }
    this._view.webContents.focus();
  }
  /**
   * Find text in the page
   */
  async findInPage(text, options) {
    this._view.webContents.findInPage(text, {
      matchCase: options?.matchCase ?? false,
      forward: options?.forward ?? true,
      // `findNext` is not very clearly named. From Electron docs: `Whether to begin a new text finding session with this request`.
      // It needs to be set to `true` if we want a new search to be performed, such as when the text changes.
      // We name it `recompute` in our internal options to better reflect its purpose / behavior.
      findNext: options?.recompute ?? false
    });
  }
  /**
   * Stop finding in page
   */
  async stopFindInPage(keepSelection) {
    this._view.webContents.stopFindInPage(keepSelection ? "keepSelection" : "clearSelection");
  }
  /**
   * Get the currently selected text in the browser view.
   * Returns immediately with empty string if the page is still loading.
   */
  async getSelectedText() {
    if (this._view.webContents.isLoading()) {
      return "";
    }
    try {
      return await this._view.webContents.executeJavaScriptInIsolatedWorld(browserViewIsolatedWorldId, [{ code: 'window.browserViewAPI?.getSelectedText?.() ?? ""' }]);
    } catch {
      return "";
    }
  }
  /**
   * Clear all storage data for this browser view's session
   */
  async clearStorage() {
    await this.session.clearData();
  }
  /**
   * Answer an in-progress hardware-device chooser. Pass the chosen device id,
   * or `null` to cancel the chooser.
   */
  selectDevice(requestId, deviceId) {
    this.session.permissions.resolveDevice(requestId, deviceId);
  }
  /**
   * Trust a certificate for a given host and reload the page.
   */
  async trustCertificate(host, fingerprint) {
    await this.session.trust.trustCertificate(host, fingerprint);
    this._view.webContents.reload();
  }
  /**
   * Revoke trust for a previously trusted certificate and close the view.
   */
  async untrustCertificate(host, fingerprint) {
    await this.session.trust.untrustCertificate(host, fingerprint);
    this.dispose();
  }
  /**
   * Get the underlying WebContentsView
   */
  getWebContentsView() {
    return this._view;
  }
  /**
   * Get the hosting Electron window for this view, if any.
   * This can be an auxiliary window, depending on where the view is currently hosted.
   */
  getElectronWindow() {
    return this._currentWindow?.win ?? void 0;
  }
  /**
   * The Electron window that currently hosts this view, if any. Before `layout()` is first
   * called this is the owner window; after that it's whichever window the view was last moved
   * to. Returns `undefined` if no host window can be resolved (e.g. during teardown).
   */
  get _hostWindow() {
    return this._currentWindow?.win ?? this._ownerWindow.win ?? void 0;
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this.debugger.dispose();
    const currentWin = this._currentWindow?.win;
    if (currentWin && !currentWin.isDestroyed()) {
      currentWin.contentView.removeChildView(this._view);
    }
    this._onDidClose.fire();
    if (!this._view.webContents.isDestroyed()) {
      this._view.webContents.close({ waitForBeforeUnload: false });
    }
    super.dispose();
  }
  _windowById(windowId) {
    return this._codeWindowById(windowId) ?? this._auxiliaryWindowById(windowId);
  }
  _codeWindowById(windowId) {
    if (typeof windowId !== "number") {
      return void 0;
    }
    return this.windowsMainService.getWindowById(windowId);
  }
  _auxiliaryWindowById(windowId) {
    if (typeof windowId !== "number") {
      return void 0;
    }
    const contents = webContents.fromId(windowId);
    if (!contents) {
      return void 0;
    }
    return this.auxiliaryWindowsMainService.getWindowByWebContents(contents);
  }
};
BrowserView.MAX_CONSOLE_LOG_ENTRIES = 1e3;
/**
 * Resize a full-page screenshot so its largest dimension never exceeds this many pixels. A very tall
 * or wide page would otherwise request an enormous bitmap, which is costly to allocate/encode and
 * can stress the browser process. We downscale via `scale` (rather than cropping) so the whole page
 * still fits in the result.
 */
BrowserView.MAX_FULL_PAGE_SCREENSHOT_DIMENSION = 2576;
BrowserView = __decorateClass([
  __decorateParam(6, IWindowsMainService),
  __decorateParam(7, IAuxiliaryWindowsMainService),
  __decorateParam(8, ILogService),
  __decorateParam(9, ITelemetryService)
], BrowserView);
function isTrackableHistoryUrl(url) {
  if (!url) {
    return false;
  }
  const colon = url.indexOf(":");
  if (colon <= 0) {
    return false;
  }
  const scheme = url.substring(0, colon).toLowerCase();
  return scheme === "http" || scheme === "https" || scheme === "file";
}
export {
  BrowserView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLW1haW4vYnJvd3NlclZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBzY3JlZW4sIFdlYkNvbnRlbnRzVmlldywgd2ViQ29udGVudHMgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJWaWV3Qm91bmRzLCBJQnJvd3NlclZpZXdEZXZUb29sc1N0YXRlRXZlbnQsIElCcm93c2VyVmlld0ZvY3VzRXZlbnQsIElCcm93c2VyVmlld0tleURvd25FdmVudCwgSUJyb3dzZXJWaWV3U3RhdGUsIElCcm93c2VyVmlld05hdmlnYXRpb25FdmVudCwgSUJyb3dzZXJWaWV3TG9hZGluZ0V2ZW50LCBJQnJvd3NlclZpZXdMb2FkRXJyb3IsIElCcm93c2VyVmlld1RpdGxlQ2hhbmdlRXZlbnQsIElCcm93c2VyVmlld0Zhdmljb25DaGFuZ2VFdmVudCwgSUJyb3dzZXJWaWV3Q2FwdHVyZVNjcmVlbnNob3RPcHRpb25zLCBJQnJvd3NlclZpZXdGaW5kSW5QYWdlT3B0aW9ucywgSUJyb3dzZXJWaWV3RmluZEluUGFnZVJlc3VsdCwgSUJyb3dzZXJWaWV3VmlzaWJpbGl0eUV2ZW50LCBicm93c2VyVmlld0lzb2xhdGVkV29ybGRJZCwgYnJvd3Nlclpvb21GYWN0b3JzLCBicm93c2VyWm9vbURlZmF1bHRJbmRleCwgSUJyb3dzZXJWaWV3T3duZXIsIElCcm93c2VyVmlld09wZW5PcHRpb25zLCBJQnJvd3NlclZpZXdQZXJtaXNzaW9uUmVxdWVzdEV2ZW50IH0gZnJvbSAnLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3RW11bGF0b3IgfSBmcm9tICcuL2Jyb3dzZXJWaWV3RW11bGF0b3IuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdJbnNwZWN0b3IgfSBmcm9tICcuL2Jyb3dzZXJWaWV3SW5zcGVjdG9yLmpzJztcbmltcG9ydCB7IElXaW5kb3dzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi93aW5kb3dzL2VsZWN0cm9uLW1haW4vd2luZG93cy5qcyc7XG5pbXBvcnQgeyBJQ29kZVdpbmRvdywgTG9hZFJlYXNvbiB9IGZyb20gJy4uLy4uL3dpbmRvdy9lbGVjdHJvbi1tYWluL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYXV4aWxpYXJ5V2luZG93L2VsZWN0cm9uLW1haW4vYXV4aWxpYXJ5V2luZG93cy5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVmlld0RlYnVnZ2VyIH0gZnJvbSAnLi9icm93c2VyVmlld0RlYnVnZ2VyLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQnJvd3NlclNlc3Npb24gfSBmcm9tICcuL2Jyb3dzZXJTZXNzaW9uLmpzJztcbmltcG9ydCB7IElCcm93c2VySGlzdG9yeUl0ZW1IYW5kbGUgfSBmcm9tICcuLi9jb21tb24vYnJvd3Nlckhpc3RvcnkuanMnO1xuaW1wb3J0IHsgSVNlcmlhbGl6ZWRCcm93c2VyUGVybWlzc2lvbnNTbmFwc2hvdCwgUGVybWlzc2lvbkNhdGVnb3J5IH0gZnJvbSAnLi4vY29tbW9uL2Jyb3dzZXJQZXJtaXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBJQXV4aWxpYXJ5V2luZG93IH0gZnJvbSAnLi4vLi4vYXV4aWxpYXJ5V2luZG93L2VsZWN0cm9uLW1haW4vYXV4aWxpYXJ5V2luZG93LmpzJztcbmltcG9ydCB7IFNDQU5fQ09ERV9TVFJfVE9fRVZFTlRfS0VZX0NPREUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGxvZ0Jyb3dzZXJPcGVuIH0gZnJvbSAnLi4vY29tbW9uL2Jyb3dzZXJWaWV3VGVsZW1ldHJ5LmpzJztcblxuZW51bSBOZXdQYWdlTG9jYXRpb24ge1xuXHRGb3JlZ3JvdW5kID0gJ2ZvcmVncm91bmQnLFxuXHRCYWNrZ3JvdW5kID0gJ2JhY2tncm91bmQnLFxuXHROZXdXaW5kb3cgPSAnbmV3V2luZG93J1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBzaW5nbGUgYnJvd3NlciB2aWV3IGluc3RhbmNlIHdpdGggaXRzIFdlYkNvbnRlbnRzVmlldyBhbmQgYWxsIGFzc29jaWF0ZWQgbG9naWMuXG4gKiBUaGlzIGNsYXNzIGVuY2Fwc3VsYXRlcyBhbGwgb3BlcmF0aW9ucyBhbmQgZXZlbnRzIGZvciBhIHNpbmdsZSBicm93c2VyIHZpZXcuXG4gKi9cbmV4cG9ydCBjbGFzcyBCcm93c2VyVmlldyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3OiBXZWJDb250ZW50c1ZpZXc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Zhdmljb25SZXF1ZXN0Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxzdHJpbmc+PigpO1xuXG5cdHByaXZhdGUgX2xhc3RTY3JlZW5zaG90OiBWU0J1ZmZlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdEZhdmljb246IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdEVycm9yOiBJQnJvd3NlclZpZXdMb2FkRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RVc2VyR2VzdHVyZVRpbWVzdGFtcDogbnVtYmVyID0gLUluZmluaXR5O1xuXHRwcml2YXRlIF9icm93c2VyWm9vbUluZGV4OiBudW1iZXIgPSBicm93c2VyWm9vbURlZmF1bHRJbmRleDtcblxuXHRwcml2YXRlIF9jdXJyZW50SGlzdG9yeUhhbmRsZTogSUJyb3dzZXJIaXN0b3J5SXRlbUhhbmRsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZXhwbGljaXROYXZpZ2F0aW9uUGVuZGluZyA9IGZhbHNlO1xuXHQvKipcblx0ICogQWN0aXZlIGluZGV4IGluIHRoZSB3ZWJDb250ZW50cyBuYXZpZ2F0aW9uIGhpc3RvcnkgbGlzdC5cblx0ICogVXNlZCB0byB0ZWxsIHdoZXRoZXIgYSBuYXZpZ2F0aW9uIGFwcGVuZGVkIGEgbmV3IGVudHJ5IG9yIHJlcGxhY2VkIHRoZSBjdXJyZW50IG9uZSBpbiBwbGFjZS5cblx0ICovXG5cdHByaXZhdGUgX2xhc3RDb21taXR0ZWRFbnRyeUluZGV4ID0gLTE7XG5cblx0cmVhZG9ubHkgZGVidWdnZXI6IEJyb3dzZXJWaWV3RGVidWdnZXI7XG5cdHJlYWRvbmx5IGVtdWxhdG9yOiBCcm93c2VyVmlld0VtdWxhdG9yO1xuXHRyZWFkb25seSBpbnNwZWN0b3I6IEJyb3dzZXJWaWV3SW5zcGVjdG9yO1xuXG5cdHByaXZhdGUgX293bmVyV2luZG93OiBJQ29kZVdpbmRvdztcblx0cHJpdmF0ZSBfY3VycmVudFdpbmRvdzogSUNvZGVXaW5kb3cgfCBJQXV4aWxpYXJ5V2luZG93IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfd2FudHNWaXNpYmlsaXR5ID0gZmFsc2U7XG5cdHByaXZhdGUgX2hhc0JlZW5MYWlkT3V0ID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0NPTlNPTEVfTE9HX0VOVFJJRVMgPSAxMDAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25zb2xlTG9nczogc3RyaW5nW10gPSBbXTtcblxuXHQvKipcblx0ICogUmVzaXplIGEgZnVsbC1wYWdlIHNjcmVlbnNob3Qgc28gaXRzIGxhcmdlc3QgZGltZW5zaW9uIG5ldmVyIGV4Y2VlZHMgdGhpcyBtYW55IHBpeGVscy4gQSB2ZXJ5IHRhbGxcblx0ICogb3Igd2lkZSBwYWdlIHdvdWxkIG90aGVyd2lzZSByZXF1ZXN0IGFuIGVub3Jtb3VzIGJpdG1hcCwgd2hpY2ggaXMgY29zdGx5IHRvIGFsbG9jYXRlL2VuY29kZSBhbmRcblx0ICogY2FuIHN0cmVzcyB0aGUgYnJvd3NlciBwcm9jZXNzLiBXZSBkb3duc2NhbGUgdmlhIGBzY2FsZWAgKHJhdGhlciB0aGFuIGNyb3BwaW5nKSBzbyB0aGUgd2hvbGUgcGFnZVxuXHQgKiBzdGlsbCBmaXRzIGluIHRoZSByZXN1bHQuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfRlVMTF9QQUdFX1NDUkVFTlNIT1RfRElNRU5TSU9OID0gMjU3NjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE5hdmlnYXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJyb3dzZXJWaWV3TmF2aWdhdGlvbkV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWROYXZpZ2F0ZTogRXZlbnQ8SUJyb3dzZXJWaWV3TmF2aWdhdGlvbkV2ZW50PiA9IHRoaXMuX29uRGlkTmF2aWdhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMb2FkaW5nU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlclZpZXdMb2FkaW5nRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxvYWRpbmdTdGF0ZTogRXZlbnQ8SUJyb3dzZXJWaWV3TG9hZGluZ0V2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlTG9hZGluZ1N0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRm9jdXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlclZpZXdGb2N1c0V2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGb2N1czogRXZlbnQ8SUJyb3dzZXJWaWV3Rm9jdXNFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZUZvY3VzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElCcm93c2VyVmlld1Zpc2liaWxpdHlFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQ8SUJyb3dzZXJWaWV3VmlzaWJpbGl0eUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURldlRvb2xzU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlclZpZXdEZXZUb29sc1N0YXRlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURldlRvb2xzU3RhdGU6IEV2ZW50PElCcm93c2VyVmlld0RldlRvb2xzU3RhdGVFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZURldlRvb2xzU3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRLZXlDb21tYW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJyb3dzZXJWaWV3S2V5RG93bkV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRLZXlDb21tYW5kOiBFdmVudDxJQnJvd3NlclZpZXdLZXlEb3duRXZlbnQ+ID0gdGhpcy5fb25EaWRLZXlDb21tYW5kLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVGl0bGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlclZpZXdUaXRsZUNoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUaXRsZTogRXZlbnQ8SUJyb3dzZXJWaWV3VGl0bGVDaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZVRpdGxlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRmF2aWNvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElCcm93c2VyVmlld0Zhdmljb25DaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmF2aWNvbjogRXZlbnQ8SUJyb3dzZXJWaWV3RmF2aWNvbkNoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlRmF2aWNvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZpbmRJblBhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlclZpZXdGaW5kSW5QYWdlUmVzdWx0PigpKTtcblx0cmVhZG9ubHkgb25EaWRGaW5kSW5QYWdlOiBFdmVudDxJQnJvd3NlclZpZXdGaW5kSW5QYWdlUmVzdWx0PiA9IHRoaXMuX29uRGlkRmluZEluUGFnZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJlbW90ZVN0YXR1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlbW90ZVN0YXR1czogRXZlbnQ8Ym9vbGVhbj4gPSB0aGlzLl9vbkRpZENoYW5nZVJlbW90ZVN0YXR1cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RQZXJtaXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJyb3dzZXJWaWV3UGVybWlzc2lvblJlcXVlc3RFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdFBlcm1pc3Npb246IEV2ZW50PElCcm93c2VyVmlld1Blcm1pc3Npb25SZXF1ZXN0RXZlbnQ+ID0gdGhpcy5fb25EaWRSZXF1ZXN0UGVybWlzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVBlcm1pc3Npb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlcmlhbGl6ZWRCcm93c2VyUGVybWlzc2lvbnNTbmFwc2hvdD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGVybWlzc2lvbnM6IEV2ZW50PElTZXJpYWxpemVkQnJvd3NlclBlcm1pc3Npb25zU25hcHNob3Q+ID0gdGhpcy5fb25EaWRDaGFuZ2VQZXJtaXNzaW9ucy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgb3duZXI6IElCcm93c2VyVmlld093bmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBzZXNzaW9uOiBCcm93c2VyU2Vzc2lvbixcblx0XHRjcmVhdGVDaGlsZFZpZXc6ICh1cmw6IHN0cmluZywgZWxlY3Ryb25PcHRpb25zOiBFbGVjdHJvbi5XZWJDb250ZW50c1ZpZXdDb25zdHJ1Y3Rvck9wdGlvbnMgfCB1bmRlZmluZWQsIG9wZW5PcHRpb25zOiBJQnJvd3NlclZpZXdPcGVuT3B0aW9ucykgPT4gQnJvd3NlclZpZXcsXG5cdFx0b3BlbkNvbnRleHRNZW51OiAodmlldzogQnJvd3NlclZpZXcsIHBhcmFtczogRWxlY3Ryb24uQ29udGV4dE1lbnVQYXJhbXMpID0+IHZvaWQsXG5cdFx0b3B0aW9uczogRWxlY3Ryb24uV2ViQ29udGVudHNWaWV3Q29uc3RydWN0b3JPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJV2luZG93c01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd2luZG93c01haW5TZXJ2aWNlOiBJV2luZG93c01haW5TZXJ2aWNlLFxuXHRcdEBJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlOiBJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgd2ViUHJlZmVyZW5jZXM6IEVsZWN0cm9uLldlYlByZWZlcmVuY2VzID0ge1xuXHRcdFx0Li4ub3B0aW9ucz8ud2ViUHJlZmVyZW5jZXMsXG5cblx0XHRcdG5vZGVJbnRlZ3JhdGlvbjogZmFsc2UsXG5cdFx0XHRjb250ZXh0SXNvbGF0aW9uOiB0cnVlLFxuXHRcdFx0c2FuZGJveDogdHJ1ZSxcblxuXHRcdFx0Ly8gTk9URTogV2hlbiBgc2FuZGJveGAgaXMgZW5hYmxlZCwgYG5vZGVJbnRlZ3JhdGlvbkluU3ViRnJhbWVzYCBkb2Vzbid0IGFjdHVhbGx5IGVuYWJsZSBub2RlIGludGVncmF0aW9uIG9yIHByZXZlbnQgc2FuZGJveGluZy5cblx0XHRcdC8vICAgICAgIEl0IGFsbG93cyBwcmVsb2FkIHNjcmlwdHMgdG8gcnVuIGluIHN1YmZyYW1lcywgd2hpY2ggaXMgaW1wb3J0YW50IGZvciBvdXIgZmVhdHVyZXMgbGlrZSBrZXlib2FyZCBzaG9ydGN1dCBmb3J3YXJkaW5nLlxuXHRcdFx0bm9kZUludGVncmF0aW9uSW5TdWJGcmFtZXM6IHRydWUsXG5cblx0XHRcdHdlYnZpZXdUYWc6IGZhbHNlLFxuXHRcdFx0c2Vzc2lvbjogdGhpcy5zZXNzaW9uLmVsZWN0cm9uU2Vzc2lvbixcblxuXHRcdFx0Zm9jdXNPbk5hdmlnYXRpb246IGZhbHNlXG5cdFx0fTtcblxuXHRcdHRoaXMuX3ZpZXcgPSBuZXcgV2ViQ29udGVudHNWaWV3KHtcblx0XHRcdHdlYlByZWZlcmVuY2VzLFxuXHRcdFx0Ly8gUGFzc2luZyBhbiBgdW5kZWZpbmVkYCB3ZWJDb250ZW50cyB0cmlnZ2VycyBhbiBlcnJvciBpbiBFbGVjdHJvbi5cblx0XHRcdC4uLihvcHRpb25zPy53ZWJDb250ZW50cyA/IHsgd2ViQ29udGVudHM6IG9wdGlvbnMud2ViQ29udGVudHMgfSA6IHt9KVxuXHRcdH0pO1xuXG5cdFx0Ly8gVXNlIGEgZGVmYXVsdCBzaXplIG9mIDEwMjR4NzY4LlxuXHRcdC8vIEltcG9ydGFudDogVGhlIGJvdW5kcyBoZXJlIG11c3QgYmUgb24tc2NyZWVuLCBvdGhlcndpc2Ugc29tZSBPU2VzIChsaWtlIG1hY09TKSBtYXkgbm90IGFjdHVhbGx5IHN0YXJ0IHJlbmRlcmluZy5cblx0XHQvLyAgICAgICAgICAgIFdlIGp1c3QgaGF2ZSB0byBiZSBjYXJlZnVsIHRvIG5vdCBzaG93IHRoZSB2aWV3IHVudGlsIGEgbGF5b3V0IGhhcyBoYXBwZW5lZCBpbiB0aGUgY29ycmVjdCBsb2NhdGlvbi5cblx0XHR0aGlzLl92aWV3LnNldEJvdW5kcyh7IHg6IDAsIHk6IDAsIHdpZHRoOiAxMDI0LCBoZWlnaHQ6IDc2OCB9KTtcblx0XHR0aGlzLl92aWV3LnNldEJhY2tncm91bmRDb2xvcignI0ZGRkZGRicpO1xuXG5cdFx0dGhpcy5fb3duZXJXaW5kb3cgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dCeUlkKG93bmVyLm1haW5XaW5kb3dJZCkhO1xuXHRcdGlmICghdGhpcy5fb3duZXJXaW5kb3cpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgV2luZG93IHdpdGggSUQgJHtvd25lci5tYWluV2luZG93SWR9IG5vdCBmb3VuZGApO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9vd25lcldpbmRvdy5vbkRpZENsb3NlKCgpID0+IHRoaXMuZGlzcG9zZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fb3duZXJXaW5kb3cub25XaWxsTG9hZCgoZSkgPT4ge1xuXHRcdFx0aWYgKGUucmVhc29uID09PSBMb2FkUmVhc29uLkxPQUQpIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7IC8vIERpc3Bvc2Ugd2hlbiBzd2l0Y2hpbmcgd29ya3NwYWNlcy5cblx0XHRcdH0gZWxzZSBpZiAoZS5yZWFzb24gPT09IExvYWRSZWFzb24uUkVMT0FEKSB7XG5cdFx0XHRcdHRoaXMuc2V0VmlzaWJsZShmYWxzZSk7IC8vIEhpZGUgd2hlbiByZWxvYWRpbmcuXG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdmlldy5zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHR0aGlzLl9vd25lcldpbmRvdy53aW4/LmNvbnRlbnRWaWV3LmFkZENoaWxkVmlldyh0aGlzLl92aWV3KTtcblxuXHRcdHRoaXMuX3ZpZXcud2ViQ29udGVudHMuc2V0V2luZG93T3BlbkhhbmRsZXIoKGRldGFpbHMpID0+IHtcblx0XHRcdGNvbnN0IGxvY2F0aW9uID0gKCgpID0+IHtcblx0XHRcdFx0c3dpdGNoIChkZXRhaWxzLmRpc3Bvc2l0aW9uKSB7XG5cdFx0XHRcdFx0Y2FzZSAnYmFja2dyb3VuZC10YWInOiByZXR1cm4gTmV3UGFnZUxvY2F0aW9uLkJhY2tncm91bmQ7XG5cdFx0XHRcdFx0Y2FzZSAnZm9yZWdyb3VuZC10YWInOiByZXR1cm4gTmV3UGFnZUxvY2F0aW9uLkZvcmVncm91bmQ7XG5cdFx0XHRcdFx0Y2FzZSAnbmV3LXdpbmRvdyc6IHJldHVybiBOZXdQYWdlTG9jYXRpb24uTmV3V2luZG93O1xuXHRcdFx0XHRcdGRlZmF1bHQ6IHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pKCk7XG5cblx0XHRcdGlmICghbG9jYXRpb24gfHwgIXRoaXMuY29uc3VtZVBvcHVwUGVybWlzc2lvbihsb2NhdGlvbikpIHtcblx0XHRcdFx0Ly8gRXZlbnR1YWxseSB3ZSBtYXkgd2FudCB0byBzdXJmYWNlIHRoaXMuIEZvciBub3csIGp1c3Qgc2lsZW50bHkgYmxvY2sgaXQuXG5cdFx0XHRcdHJldHVybiB7IGFjdGlvbjogJ2RlbnknIH07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGFjdGlvbjogJ2FsbG93Jyxcblx0XHRcdFx0Y3JlYXRlV2luZG93OiAob3B0aW9ucykgPT4ge1xuXHRcdFx0XHRcdGxvZ0Jyb3dzZXJPcGVuKHRoaXMudGVsZW1ldHJ5U2VydmljZSwgKCgpID0+IHtcblx0XHRcdFx0XHRcdHN3aXRjaCAobG9jYXRpb24pIHtcblx0XHRcdFx0XHRcdFx0Y2FzZSBOZXdQYWdlTG9jYXRpb24uTmV3V2luZG93OiByZXR1cm4gJ2Jyb3dzZXJMaW5rTmV3V2luZG93Jztcblx0XHRcdFx0XHRcdFx0Y2FzZSBOZXdQYWdlTG9jYXRpb24uQmFja2dyb3VuZDogcmV0dXJuICdicm93c2VyTGlua0JhY2tncm91bmQnO1xuXHRcdFx0XHRcdFx0XHRjYXNlIE5ld1BhZ2VMb2NhdGlvbi5Gb3JlZ3JvdW5kOiByZXR1cm4gJ2Jyb3dzZXJMaW5rRm9yZWdyb3VuZCc7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkoKSk7XG5cblx0XHRcdFx0XHRjb25zdCBjaGlsZFZpZXcgPSBjcmVhdGVDaGlsZFZpZXcoZGV0YWlscy51cmwsIG9wdGlvbnMsIHtcblx0XHRcdFx0XHRcdHBpbm5lZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGJhY2tncm91bmQ6IGxvY2F0aW9uID09PSBOZXdQYWdlTG9jYXRpb24uQmFja2dyb3VuZCxcblx0XHRcdFx0XHRcdHBhcmVudFZpZXdJZDogaWQsXG5cdFx0XHRcdFx0XHRhdXhpbGlhcnlXaW5kb3c6IGxvY2F0aW9uID09PSBOZXdQYWdlTG9jYXRpb24uTmV3V2luZG93XG5cdFx0XHRcdFx0XHRcdD8geyB4OiBvcHRpb25zLngsIHk6IG9wdGlvbnMueSwgd2lkdGg6IG9wdGlvbnMud2lkdGgsIGhlaWdodDogb3B0aW9ucy5oZWlnaHQgfVxuXHRcdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdC8vIFJldHVybiB0aGUgd2ViQ29udGVudHMgc28gRWxlY3Ryb24gY2FuIGNvbXBsZXRlIHRoZSB3aW5kb3cub3BlbigpIGNhbGxcblx0XHRcdFx0XHRyZXR1cm4gY2hpbGRWaWV3LndlYkNvbnRlbnRzO1xuXHRcdFx0XHR9LFxuXG5cdFx0XHRcdC8vIFdlIHdhbnQgdGhlIHN0YW5kYXJkIGJyb3dzZXIgYmVoYXZpb3IgYXMgb3Bwb3NlZCB0byBFbGVjdHJvbidzIGRlZmF1bHQgb2YgY2xvc2luZyB0aGUgbmV3IHdpbmRvdyB3aGVuIHRoZSBwYXJlbnQgaXMgY2xvc2VkXG5cdFx0XHRcdG91dGxpdmVzT3BlbmVyOiB0cnVlXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fdmlldy53ZWJDb250ZW50cy5vbignY29udGV4dC1tZW51JywgKF9ldmVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRvcGVuQ29udGV4dE1lbnUodGhpcywgcGFyYW1zKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3ZpZXcud2ViQ29udGVudHMub24oJ2Rlc3Ryb3llZCcsICgpID0+IHtcblx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5kZWJ1Z2dlciA9IG5ldyBCcm93c2VyVmlld0RlYnVnZ2VyKHRoaXMsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0dGhpcy5lbXVsYXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCcm93c2VyVmlld0VtdWxhdG9yKHRoaXMsIHRoaXMubG9nU2VydmljZSkpO1xuXHRcdHRoaXMuaW5zcGVjdG9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJyb3dzZXJWaWV3SW5zcGVjdG9yKHRoaXMpKTtcblxuXHRcdGNvbnN0IGZpcmVSZW1vdGVTdGF0dXMgPSAoKSA9PiB0aGlzLl9vbkRpZENoYW5nZVJlbW90ZVN0YXR1cy5maXJlKHRoaXMuc2Vzc2lvbi5yZW1vdGUuaXNSZW1vdGUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2Vzc2lvbi5yZW1vdGUub25EaWRTdGFydChmaXJlUmVtb3RlU3RhdHVzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uLnJlbW90ZS5vbkRpZFN0b3AoZmlyZVJlbW90ZVN0YXR1cykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uLnBlcm1pc3Npb25zLm9uRGlkUmVxdWVzdFBlcm1pc3Npb24oZSA9PiB7XG5cdFx0XHRpZiAoZS53ZWJDb250ZW50cyA9PT0gdGhpcy53ZWJDb250ZW50cyAmJiAhdGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0XHRlLmNsYWltKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkUmVxdWVzdFBlcm1pc3Npb24uZmlyZShlLnJlcXVlc3QpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb24ucGVybWlzc2lvbnMub25EaWRSZXF1ZXN0RGV2aWNlKGUgPT4ge1xuXHRcdFx0aWYgKGUud2ViQ29udGVudHMgPT09IHRoaXMud2ViQ29udGVudHMgJiYgIXRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdFx0ZS5jbGFpbSgpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RQZXJtaXNzaW9uLmZpcmUoe1xuXHRcdFx0XHRcdG9yaWdpbjogZS5vcmlnaW4sXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBlcm1pc3Npb25DYXRlZ29yeS5EZXZpY2VzLFxuXHRcdFx0XHRcdGRldmljZToge1xuXHRcdFx0XHRcdFx0cmVxdWVzdElkOiBlLnJlcXVlc3RJZCxcblx0XHRcdFx0XHRcdGRldmljZVR5cGU6IGUuZGV2aWNlVHlwZSxcblx0XHRcdFx0XHRcdGRldmljZXM6IGUuZGV2aWNlcyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uLnBlcm1pc3Npb25zLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUGVybWlzc2lvbnMuZmlyZSh0aGlzLnNlc3Npb24ucGVybWlzc2lvbnMuc2VyaWFsaXplKCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuc2V0dXBFdmVudExpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXR1cEV2ZW50TGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHdlYkNvbnRlbnRzID0gdGhpcy5fdmlldy53ZWJDb250ZW50cztcblxuXHRcdC8vIERldlRvb2xzIHN0YXRlIGV2ZW50c1xuXHRcdHdlYkNvbnRlbnRzLm9uKCdkZXZ0b29scy1vcGVuZWQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURldlRvb2xzU3RhdGUuZmlyZSh7IGlzRGV2VG9vbHNPcGVuOiB0cnVlIH0pO1xuXHRcdH0pO1xuXG5cdFx0d2ViQ29udGVudHMub24oJ2RldnRvb2xzLWNsb3NlZCcsICgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGV2VG9vbHNTdGF0ZS5maXJlKHsgaXNEZXZUb29sc09wZW46IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gRmF2aWNvbiBldmVudHNcblx0XHR3ZWJDb250ZW50cy5vbigncGFnZS1mYXZpY29uLXVwZGF0ZWQnLCBhc3luYyAoX2V2ZW50LCBmYXZpY29ucykgPT4ge1xuXHRcdFx0Ly8gdHJ5IGVhY2ggdXJsIGluIG9yZGVyIHVudGlsIG9uZSB3b3Jrc1xuXHRcdFx0Zm9yIChjb25zdCB1cmwgb2YgZmF2aWNvbnMpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9mYXZpY29uUmVxdWVzdENhY2hlLmhhcyh1cmwpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmF2aWNvblJlcXVlc3RDYWNoZS5zZXQodXJsLCAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHVybC5zdGFydHNXaXRoKCdkYXRhOmltYWdlLycpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB1cmw7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHdlYkNvbnRlbnRzLnNlc3Npb24uZmV0Y2godXJsLCB7XG5cdFx0XHRcdFx0XHRcdGNhY2hlOiAnZm9yY2UtY2FjaGUnXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGlmICghcmVzcG9uc2Uub2spIHtcblx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggZmF2aWNvbjogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHR5cGUgPSBhd2FpdCByZXNwb25zZS5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJyk7XG5cdFx0XHRcdFx0XHRpZiAoIXR5cGU/LnN0YXJ0c1dpdGgoJ2ltYWdlLycpKSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRmF2aWNvbiBpcyBub3QgYW4gaW1hZ2U6ICR7dHlwZX1gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHJlc3BvbnNlLmFycmF5QnVmZmVyKCk7XG5cblx0XHRcdFx0XHRcdHJldHVybiBgZGF0YToke3R5cGV9O2Jhc2U2NCwke0J1ZmZlci5mcm9tKGJ1ZmZlcikudG9TdHJpbmcoJ2Jhc2U2NCcpfWA7XG5cdFx0XHRcdFx0fSkoKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHRoaXMuX2xhc3RGYXZpY29uID0gYXdhaXQgdGhpcy5fZmF2aWNvblJlcXVlc3RDYWNoZS5nZXQodXJsKSE7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VGYXZpY29uLmZpcmUoeyBmYXZpY29uOiB0aGlzLl9sYXN0RmF2aWNvbiB9KTtcblx0XHRcdFx0XHR0aGlzLl9jdXJyZW50SGlzdG9yeUhhbmRsZT8udXBkYXRlKHsgZmF2aWNvbjogdGhpcy5fbGFzdEZhdmljb24gfSk7XG5cdFx0XHRcdFx0Ly8gT24gc3VjY2Vzcywgc3RvcCBzZWFyY2hpbmdcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHQvLyBPbiBmYWlsdXJlLCBqdXN0IHRyeSB0aGUgbmV4dCBvbmVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB3ZSBzZWFyY2hlZCBhbGwgZmF2aWNvbnMgYW5kIG5vbmUgd29ya2VkLCBjbGVhciB0aGUgZmF2aWNvblxuXHRcdFx0aWYgKHRoaXMuX2xhc3RGYXZpY29uKSB7XG5cdFx0XHRcdHRoaXMuX2xhc3RGYXZpY29uID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUZhdmljb24uZmlyZSh7IGZhdmljb246IHRoaXMuX2xhc3RGYXZpY29uIH0pO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50SGlzdG9yeUhhbmRsZT8udXBkYXRlKHsgZmF2aWNvbjogbnVsbCB9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR3ZWJDb250ZW50cy5vbignd2lsbC1uYXZpZ2F0ZScsIChldmVudCkgPT4ge1xuXHRcdFx0Ly8gVVJMLnBhcnNlICh2cyBgbmV3IFVSTGApIHRvbGVyYXRlcyBhYm91dDovYmxvYjovZW1wdHkgc3RyaW5ncyB3aXRob3V0IHRocm93aW5nLlxuXHRcdFx0Y29uc3QgaG9zdCA9IFVSTC5wYXJzZShldmVudC51cmwpPy5ob3N0O1xuXHRcdFx0Y29uc3QgY3Vyckhvc3QgPSBVUkwucGFyc2UodGhpcy53ZWJDb250ZW50cy5nZXRVUkwoKSk/Lmhvc3Q7XG5cdFx0XHRpZiAoaG9zdCAhPT0gY3Vyckhvc3QpIHtcblx0XHRcdFx0dGhpcy5fbGFzdEZhdmljb24gPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBUaXRsZSBldmVudHNcblx0XHR3ZWJDb250ZW50cy5vbigncGFnZS10aXRsZS11cGRhdGVkJywgKF9ldmVudCwgdGl0bGUpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVGl0bGUuZmlyZSh7IHRpdGxlIH0pO1xuXHRcdFx0dGhpcy5fY3VycmVudEhpc3RvcnlIYW5kbGU/LnVwZGF0ZSh7IHRpdGxlIH0pO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZmlyZU5hdmlnYXRpb25FdmVudCA9ICh1cmw6IHN0cmluZykgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWROYXZpZ2F0ZS5maXJlKHtcblx0XHRcdFx0dXJsLFxuXHRcdFx0XHR0aXRsZTogd2ViQ29udGVudHMuZ2V0VGl0bGUoKSxcblx0XHRcdFx0Y2FuR29CYWNrOiB3ZWJDb250ZW50cy5uYXZpZ2F0aW9uSGlzdG9yeS5jYW5Hb0JhY2soKSxcblx0XHRcdFx0Y2FuR29Gb3J3YXJkOiB3ZWJDb250ZW50cy5uYXZpZ2F0aW9uSGlzdG9yeS5jYW5Hb0ZvcndhcmQoKSxcblx0XHRcdFx0Y2VydGlmaWNhdGVFcnJvcjogdGhpcy5zZXNzaW9uLnRydXN0LmdldENlcnRpZmljYXRlRXJyb3IodXJsKVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9yZWNvcmROYXZpZ2F0aW9uKHVybCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGZpcmVMb2FkaW5nRXZlbnQgPSAobG9hZGluZzogYm9vbGVhbikgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMb2FkaW5nU3RhdGUuZmlyZSh7IGxvYWRpbmcsIGVycm9yOiB0aGlzLl9sYXN0RXJyb3IgfSk7XG5cdFx0fTtcblxuXHRcdC8vIExvYWRpbmcgc3RhdGUgZXZlbnRzXG5cdFx0d2ViQ29udGVudHMub24oJ2RpZC1zdGFydC1sb2FkaW5nJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fbGFzdEVycm9yID0gdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBEb24ndCBmaXJlIGxvYWRpbmcgZXZlbnRzIGZvciBlLmcuIHNhbWUtZG9jdW1lbnQgbmF2aWdhdGlvbnNcblx0XHRcdGlmICh3ZWJDb250ZW50cy5pc0xvYWRpbmdNYWluRnJhbWUoKSkge1xuXHRcdFx0XHRmaXJlTG9hZGluZ0V2ZW50KHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHdlYkNvbnRlbnRzLm9uKCdkaWQtc3RvcC1sb2FkaW5nJywgKCkgPT4gZmlyZUxvYWRpbmdFdmVudChmYWxzZSkpO1xuXHRcdHdlYkNvbnRlbnRzLm9uKCdkaWQtZmFpbC1sb2FkJywgKGUsIGVycm9yQ29kZSwgZXJyb3JEZXNjcmlwdGlvbiwgdmFsaWRhdGVkVVJMLCBpc01haW5GcmFtZSkgPT4ge1xuXHRcdFx0aWYgKGlzTWFpbkZyYW1lKSB7XG5cdFx0XHRcdC8vIElnbm9yZSBFUlJfQUJPUlRFRCAoLTMpIHdoaWNoIGlzIHRoZSBleHBlY3RlZCBlcnJvciB3aGVuIHVzZXIgc3RvcHMgYSBwYWdlIGxvYWQuXG5cdFx0XHRcdGlmIChlcnJvckNvZGUgPT09IC0zKSB7XG5cdFx0XHRcdFx0ZmlyZUxvYWRpbmdFdmVudChmYWxzZSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fbGFzdEVycm9yID0ge1xuXHRcdFx0XHRcdHVybDogdmFsaWRhdGVkVVJMLFxuXHRcdFx0XHRcdGVycm9yQ29kZSxcblx0XHRcdFx0XHRlcnJvckRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdC8vIC0yMDAgLSAtMjIwIGFyZSB0aGUgcmFuZ2Ugb2YgY2VydGlmaWNhdGUgZXJyb3JzIGluIENocm9taXVtLlxuXHRcdFx0XHRcdGNlcnRpZmljYXRlRXJyb3I6IGVycm9yQ29kZSA8PSAtMjAwICYmIGVycm9yQ29kZSA+PSAtMjIwID8gdGhpcy5zZXNzaW9uLnRydXN0LmdldENlcnRpZmljYXRlRXJyb3IodmFsaWRhdGVkVVJMKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGZpcmVMb2FkaW5nRXZlbnQoZmFsc2UpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZE5hdmlnYXRlLmZpcmUoe1xuXHRcdFx0XHRcdHVybDogdmFsaWRhdGVkVVJMLFxuXHRcdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0XHRjYW5Hb0JhY2s6IHdlYkNvbnRlbnRzLm5hdmlnYXRpb25IaXN0b3J5LmNhbkdvQmFjaygpLFxuXHRcdFx0XHRcdGNhbkdvRm9yd2FyZDogd2ViQ29udGVudHMubmF2aWdhdGlvbkhpc3RvcnkuY2FuR29Gb3J3YXJkKCksXG5cdFx0XHRcdFx0Y2VydGlmaWNhdGVFcnJvcjogdGhpcy5zZXNzaW9uLnRydXN0LmdldENlcnRpZmljYXRlRXJyb3IodmFsaWRhdGVkVVJMKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR3ZWJDb250ZW50cy5vbignZGlkLWZpbmlzaC1sb2FkJywgKCkgPT4gZmlyZUxvYWRpbmdFdmVudChmYWxzZSkpO1xuXG5cdFx0dGhpcy5zZXNzaW9uLnRydXN0Lmluc3RhbGxDZXJ0RXJyb3JIYW5kbGVyKHdlYkNvbnRlbnRzKTtcblxuXHRcdHdlYkNvbnRlbnRzLm9uKCdsb2dpbicsIChldmVudCwgX2RldGFpbHMsIGF1dGhJbmZvLCBjYWxsYmFjaykgPT4ge1xuXHRcdFx0Ly8gQXV0b21hdGljYWxseSBzdXBwbHkgcHJveHkgYXV0aCBjcmVkZW50aWFscyBmb3IgdGhlIHR1bm5lbCBwcm94eS5cblx0XHRcdGlmICh0aGlzLnNlc3Npb24ucmVtb3RlLnByb3h5KSB7XG5cdFx0XHRcdGNvbnN0IHsgdXNlcm5hbWUsIHBhc3N3b3JkIH0gPSB0aGlzLnNlc3Npb24ucmVtb3RlLnByb3h5LmNyZWRlbnRpYWxzO1xuXHRcdFx0XHRjb25zdCBwcm94eVBvcnQgPSB0aGlzLnNlc3Npb24ucmVtb3RlLnByb3h5LnBvcnQ7XG5cdFx0XHRcdGlmIChhdXRoSW5mby5pc1Byb3h5ICYmIGF1dGhJbmZvLmhvc3QgPT09ICcxMjcuMC4wLjEnICYmIGF1dGhJbmZvLnBvcnQgPT09IHByb3h5UG9ydCkge1xuXHRcdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0Y2FsbGJhY2sodXNlcm5hbWUsIHBhc3N3b3JkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0d2ViQ29udGVudHMub24oJ3JlbmRlci1wcm9jZXNzLWdvbmUnLCAoX2V2ZW50LCBkZXRhaWxzKSA9PiB7XG5cdFx0XHR0aGlzLl9sYXN0RXJyb3IgPSB7XG5cdFx0XHRcdHVybDogd2ViQ29udGVudHMuZ2V0VVJMKCksXG5cdFx0XHRcdGVycm9yQ29kZTogZGV0YWlscy5leGl0Q29kZSxcblx0XHRcdFx0ZXJyb3JEZXNjcmlwdGlvbjogYFJlbmRlciBwcm9jZXNzIGdvbmU6ICR7ZGV0YWlscy5yZWFzb259YFxuXHRcdFx0fTtcblxuXHRcdFx0ZmlyZUxvYWRpbmdFdmVudChmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHQvLyBOYXZpZ2F0aW9uIGV2ZW50cyAod2hlbiBVUkwgYWN0dWFsbHkgY2hhbmdlcylcblx0XHR3ZWJDb250ZW50cy5vbignZGlkLW5hdmlnYXRlJywgKF8sIHVybCkgPT4gZmlyZU5hdmlnYXRpb25FdmVudCh1cmwpKTtcblx0XHR3ZWJDb250ZW50cy5vbignZGlkLW5hdmlnYXRlLWluLXBhZ2UnLCAoXywgdXJsLCBpc01haW5GcmFtZSkgPT4ge1xuXHRcdFx0Ly8gSWdub3JlIHN1YmZyYW1lIChpZnJhbWUpIG5hdmlnYXRpb25zOiB0aGV5IG11c3Qgbm90IHJld3JpdGUgdGhlXG5cdFx0XHQvLyBtYWluIGZyYW1lJ3MgVVJMIGJhciBvciBpdHMgaGlzdG9yeSBlbnRyeS5cblx0XHRcdGlmIChpc01haW5GcmFtZSkge1xuXHRcdFx0XHRmaXJlTmF2aWdhdGlvbkV2ZW50KHVybCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR3ZWJDb250ZW50cy5vbignZGlkLW5hdmlnYXRlJywgKCkgPT4ge1xuXHRcdFx0Ly8gQ2hyb21pdW0gcmVzZXRzIHRoZSB6b29tIGZhY3RvciB0byBpdHMgcGVyLW9yaWdpbiBkZWZhdWx0ICgxMDAlKSB3aGVuXG5cdFx0XHQvLyBuYXZpZ2F0aW5nIHRvIGEgbmV3IGRvY3VtZW50LiBSZS1hcHBseSBvdXIgc3RvcmVkIHpvb20gdG8gb3ZlcnJpZGUgaXQuXG5cdFx0XHR0aGlzLl9jb25zb2xlTG9ncy5sZW5ndGggPSAwOyAvLyBDbGVhciBjb25zb2xlIGxvZ3Mgb24gbmF2aWdhdGlvbiBzaW5jZSB0aGV5IGFyZSBwZXItcGFnZVxuXHRcdFx0dGhpcy5fdmlldy53ZWJDb250ZW50cy5zZXRab29tRmFjdG9yKGJyb3dzZXJab29tRmFjdG9yc1t0aGlzLl9icm93c2VyWm9vbUluZGV4XSk7XG5cblx0XHRcdC8vIEVuYWJsZSBwaW5jaC10by16b29tXG5cdFx0XHR2b2lkIHRoaXMuX3ZpZXcud2ViQ29udGVudHMuc2V0VmlzdWFsWm9vbUxldmVsTGltaXRzKDEsIDMpLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gc2V0IHZpc3VhbCB6b29tIGxldmVsIGxpbWl0cyBmb3IgYnJvd3NlciB2aWV3IHdlYkNvbnRlbnRzLicsIGVycm9yKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0d2ViQ29udGVudHMub24oJ3NlbGVjdC1ibHVldG9vdGgtZGV2aWNlJywgKGV2ZW50LCBkZXZpY2VzLCBjYWxsYmFjaykgPT4ge1xuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHRoaXMuc2Vzc2lvbi5wZXJtaXNzaW9ucy5iZWdpbkJsdWV0b290aFJlcXVlc3QodGhpcy53ZWJDb250ZW50cywgZGV2aWNlcywgY2FsbGJhY2spO1xuXHRcdH0pO1xuXG5cdFx0Ly8gRm9jdXMgZXZlbnRzXG5cdFx0d2ViQ29udGVudHMub24oJ2ZvY3VzJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VGb2N1cy5maXJlKHsgZm9jdXNlZDogdHJ1ZSB9KTtcblx0XHR9KTtcblxuXHRcdHdlYkNvbnRlbnRzLm9uKCdibHVyJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VGb2N1cy5maXJlKHsgZm9jdXNlZDogZmFsc2UgfSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBvbkNvbW1hbmRLZXlkb3duID0gKF9ldmVudDogdW5rbm93biwga2V5RXZlbnQ6IElCcm93c2VyVmlld0tleURvd25FdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRLZXlDb21tYW5kLmZpcmUoa2V5RXZlbnQpO1xuXHRcdH07XG5cblx0XHQvLyBGb3J3YXJkIGtleSBkb3duIGV2ZW50cyB0aGF0IHdlcmVuJ3QgaGFuZGxlZCBieSB0aGUgcGFnZSB0byB0aGUgd29ya2JlbmNoIGZvciBzaG9ydGN1dCBoYW5kbGluZy5cblx0XHR3ZWJDb250ZW50cy5pcGMub24oJ3ZzY29kZTpicm93c2VyVmlldzprZXlkb3duJywgb25Db21tYW5kS2V5ZG93bik7XG5cdFx0d2ViQ29udGVudHMub24oJ2RldnRvb2xzLW9wZW5lZCcsICgpID0+IHtcblx0XHRcdC8vIEF2b2lkIGRvdWJsZS1yZWdpc3RyYXRpb24gaWYgdGhlIHdlYkNvbnRlbnRzIGlzIHJldXNlZC5cblx0XHRcdHdlYkNvbnRlbnRzLmRldlRvb2xzV2ViQ29udGVudHM/LmlwYy5vZmYoJ3ZzY29kZTpicm93c2VyVmlldzprZXlkb3duJywgb25Db21tYW5kS2V5ZG93bik7XG5cdFx0XHR3ZWJDb250ZW50cy5kZXZUb29sc1dlYkNvbnRlbnRzPy5pcGMub24oJ3ZzY29kZTpicm93c2VyVmlldzprZXlkb3duJywgb25Db21tYW5kS2V5ZG93bik7XG5cdFx0fSk7XG5cblx0XHQvLyBJZiB0aGUgcGFnZSB3b24ndCBiZSBhYmxlIHRvIGhhbmRsZSBldmVudHMsIGZvcndhcmQga2V5IGRvd24gZXZlbnRzIGRpcmVjdGx5LlxuXHRcdHdlYkNvbnRlbnRzLm9uKCdiZWZvcmUtaW5wdXQtZXZlbnQnLCAoZXZlbnQsIGlucHV0KSA9PiB7XG5cdFx0XHRpZiAoaW5wdXQudHlwZSAhPT0gJ2tleURvd24nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGFnZUlzQXZhaWxhYmxlID0gdGhpcy5fdmlldy5nZXRWaXNpYmxlKClcblx0XHRcdFx0JiYgIXdlYkNvbnRlbnRzLmlzQ3Jhc2hlZCgpXG5cdFx0XHRcdCYmICF0aGlzLmRlYnVnZ2VyLmlzUGF1c2VkO1xuXHRcdFx0aWYgKHBhZ2VJc0F2YWlsYWJsZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoaXMgbG9naWMgc2hvdWxkIG1pcnJvciB0aGF0IGluIHByZWxvYWQtYnJvd3NlclZpZXcudHMuXG5cdFx0XHRpZiAoIShpbnB1dC5jb250cm9sIHx8IGlucHV0LmFsdCB8fCBpbnB1dC5tZXRhKSAmJiBpbnB1dC5rZXkubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0Y29uc3QgZXZlbnRLZXlDb2RlID0gU0NBTl9DT0RFX1NUUl9UT19FVkVOVF9LRVlfQ09ERVtpbnB1dC5jb2RlXSB8fCAwO1xuXHRcdFx0dGhpcy5fb25EaWRLZXlDb21tYW5kLmZpcmUoe1xuXHRcdFx0XHRrZXk6IGlucHV0LmtleSxcblx0XHRcdFx0a2V5Q29kZTogZXZlbnRLZXlDb2RlLFxuXHRcdFx0XHRjb2RlOiBpbnB1dC5jb2RlLFxuXHRcdFx0XHRjdHJsS2V5OiBpbnB1dC5jb250cm9sLFxuXHRcdFx0XHRzaGlmdEtleTogaW5wdXQuc2hpZnQsXG5cdFx0XHRcdGFsdEtleTogaW5wdXQuYWx0LFxuXHRcdFx0XHRtZXRhS2V5OiBpbnB1dC5tZXRhLFxuXHRcdFx0XHRyZXBlYXQ6IGlucHV0LmlzQXV0b1JlcGVhdFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyBUcmFjayB1c2VyIGdlc3R1cmVzIGZvciBwb3B1cCBibG9ja2luZyBsb2dpYy5cblx0XHQvLyBSb3VnaGx5IGJhc2VkIG9uIGh0dHBzOi8vaHRtbC5zcGVjLndoYXR3Zy5vcmcvbXVsdGlwYWdlL2ludGVyYWN0aW9uLmh0bWwjdHJhY2tpbmctdXNlci1hY3RpdmF0aW9uLlxuXHRcdHdlYkNvbnRlbnRzLm9uKCdpbnB1dC1ldmVudCcsIChfZXZlbnQsIGlucHV0KSA9PiB7XG5cdFx0XHRzd2l0Y2ggKGlucHV0LnR5cGUpIHtcblx0XHRcdFx0Y2FzZSAncmF3S2V5RG93bic6XG5cdFx0XHRcdGNhc2UgJ2tleURvd24nOlxuXHRcdFx0XHRjYXNlICdtb3VzZURvd24nOlxuXHRcdFx0XHRjYXNlICdwb2ludGVyRG93bic6XG5cdFx0XHRcdGNhc2UgJ3BvaW50ZXJVcCc6XG5cdFx0XHRcdGNhc2UgJ3RvdWNoRW5kJzpcblx0XHRcdFx0XHR0aGlzLl9sYXN0VXNlckdlc3R1cmVUaW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gRm9yIG5vdywgYWx3YXlzIHByZXZlbnQgc2l0ZXMgZnJvbSBibG9ja2luZyB1bmxvYWQuXG5cdFx0Ly8gSW4gdGhlIGZ1dHVyZSB3ZSBtYXkgd2FudCB0byBzaG93IGEgZGlhbG9nIHRvIGFzayB0aGUgdXNlcixcblx0XHQvLyB3aXRoIGhlYXZ5IHJlc3RyaWN0aW9ucyByZWdhcmRpbmcgaW50ZXJhY3Rpb24gYW5kIHJlcGVhdGVkIHByb21wdHMuXG5cdFx0d2ViQ29udGVudHMub24oJ3dpbGwtcHJldmVudC11bmxvYWQnLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gRmluZCBpbiBwYWdlIGV2ZW50c1xuXHRcdHdlYkNvbnRlbnRzLm9uKCdmb3VuZC1pbi1wYWdlJywgKF9ldmVudCwgcmVzdWx0KSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZEZpbmRJblBhZ2UuZmlyZSh7XG5cdFx0XHRcdGFjdGl2ZU1hdGNoT3JkaW5hbDogcmVzdWx0LmFjdGl2ZU1hdGNoT3JkaW5hbCxcblx0XHRcdFx0bWF0Y2hlczogcmVzdWx0Lm1hdGNoZXMsXG5cdFx0XHRcdHNlbGVjdGlvbkFyZWE6IHJlc3VsdC5zZWxlY3Rpb25BcmVhLFxuXHRcdFx0XHRmaW5hbFVwZGF0ZTogcmVzdWx0LmZpbmFsVXBkYXRlXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdC8vIENhcHR1cmUgY29uc29sZSBtZXNzYWdlcyBmb3Igc2hhcmluZyB3aXRoIGNoYXRcblx0XHR0aGlzLl92aWV3LndlYkNvbnRlbnRzLm9uKCdjb25zb2xlLW1lc3NhZ2UnLCAoZXZlbnQpID0+IHtcblx0XHRcdHRoaXMuX2NvbnNvbGVMb2dzLnB1c2goYFske2V2ZW50LmxldmVsfV0gJHtldmVudC5tZXNzYWdlfWApO1xuXHRcdFx0aWYgKHRoaXMuX2NvbnNvbGVMb2dzLmxlbmd0aCA+IEJyb3dzZXJWaWV3Lk1BWF9DT05TT0xFX0xPR19FTlRSSUVTKSB7XG5cdFx0XHRcdHRoaXMuX2NvbnNvbGVMb2dzLnNwbGljZSgwLCB0aGlzLl9jb25zb2xlTG9ncy5sZW5ndGggLSBCcm93c2VyVmlldy5NQVhfQ09OU09MRV9MT0dfRU5UUklFUyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN1bWVQb3B1cFBlcm1pc3Npb24obG9jYXRpb246IE5ld1BhZ2VMb2NhdGlvbik6IGJvb2xlYW4ge1xuXHRcdHN3aXRjaCAobG9jYXRpb24pIHtcblx0XHRcdGNhc2UgTmV3UGFnZUxvY2F0aW9uLkZvcmVncm91bmQ6XG5cdFx0XHRjYXNlIE5ld1BhZ2VMb2NhdGlvbi5CYWNrZ3JvdW5kOlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgTmV3UGFnZUxvY2F0aW9uLk5ld1dpbmRvdzpcblx0XHRcdFx0Ly8gRWFjaCB1c2VyIGdlc3R1cmUgYWxsb3dzIG9uZSBwb3B1cCB3aW5kb3cgd2l0aGluIDEgc2Vjb25kXG5cdFx0XHRcdGlmICh0aGlzLl9sYXN0VXNlckdlc3R1cmVUaW1lc3RhbXAgPiBEYXRlLm5vdygpIC0gMTAwMCkge1xuXHRcdFx0XHRcdHRoaXMuX2xhc3RVc2VyR2VzdHVyZVRpbWVzdGFtcCA9IC1JbmZpbml0eTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVjb3JkIGEgY29tbWl0dGVkIG5hdmlnYXRpb24gaW4gdGhlIHNlc3Npb24ncyBoaXN0b3J5LlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVjb3JkTmF2aWdhdGlvbih1cmw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHdlYkNvbnRlbnRzID0gdGhpcy5fdmlldy53ZWJDb250ZW50cztcblx0XHRjb25zdCBhY3RpdmVJbmRleCA9IHdlYkNvbnRlbnRzLm5hdmlnYXRpb25IaXN0b3J5LmdldEFjdGl2ZUluZGV4KCk7XG5cblx0XHRpZiAoIWlzVHJhY2thYmxlSGlzdG9yeVVybCh1cmwpKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50SGlzdG9yeUhhbmRsZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2xhc3RDb21taXR0ZWRFbnRyeUluZGV4ID0gYWN0aXZlSW5kZXg7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQSBjb21taXQgdGhhdCBsZWF2ZXMgdGhlIGFjdGl2ZSBpbmRleCB1bmNoYW5nZWQgcmVwbGFjZWQgdGhlIGN1cnJlbnRcblx0XHQvLyBlbnRyeSBpbiBwbGFjZTsgcmVmaW5lIHRoZSBleGlzdGluZyBoaXN0b3J5IGl0ZW0gcmF0aGVyIHRoYW4gYXBwZW5kaW5nXG5cdFx0Ly8gYSBkdXBsaWNhdGUuXG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fY3VycmVudEhpc3RvcnlIYW5kbGU7XG5cdFx0aWYgKGhhbmRsZSAmJiBhY3RpdmVJbmRleCA9PT0gdGhpcy5fbGFzdENvbW1pdHRlZEVudHJ5SW5kZXgpIHtcblx0XHRcdGhhbmRsZS51cGRhdGUoeyB1cmwsIHRpdGxlOiB3ZWJDb250ZW50cy5nZXRUaXRsZSgpIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0Q29tbWl0dGVkRW50cnlJbmRleCA9IGFjdGl2ZUluZGV4O1xuXG5cdFx0Y29uc3QgdXNlckluaXRpYXRlZCA9IHRoaXMuX2V4cGxpY2l0TmF2aWdhdGlvblBlbmRpbmc7XG5cdFx0dGhpcy5fZXhwbGljaXROYXZpZ2F0aW9uUGVuZGluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX2N1cnJlbnRIaXN0b3J5SGFuZGxlID0gdGhpcy5zZXNzaW9uLmhpc3RvcnkuYWRkKFxuXHRcdFx0dXJsLFxuXHRcdFx0d2ViQ29udGVudHMuZ2V0VGl0bGUoKSxcblx0XHRcdHRoaXMuX2xhc3RGYXZpY29uLFxuXHRcdFx0dXNlckluaXRpYXRlZCxcblx0XHQpO1xuXHR9XG5cblx0Z2V0IHdlYkNvbnRlbnRzKCk6IEVsZWN0cm9uLldlYkNvbnRlbnRzIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlldy53ZWJDb250ZW50cztcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhpcyBicm93c2VyIHZpZXdcblx0ICovXG5cdGdldFN0YXRlKCk6IElCcm93c2VyVmlld1N0YXRlIHtcblx0XHRjb25zdCB3ZWJDb250ZW50cyA9IHRoaXMuX3ZpZXcud2ViQ29udGVudHM7XG5cdFx0Y29uc3QgdXJsID0gd2ViQ29udGVudHMuZ2V0VVJMKCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJsLFxuXHRcdFx0dGl0bGU6IHdlYkNvbnRlbnRzLmdldFRpdGxlKCksXG5cdFx0XHRjYW5Hb0JhY2s6IHdlYkNvbnRlbnRzLm5hdmlnYXRpb25IaXN0b3J5LmNhbkdvQmFjaygpLFxuXHRcdFx0Y2FuR29Gb3J3YXJkOiB3ZWJDb250ZW50cy5uYXZpZ2F0aW9uSGlzdG9yeS5jYW5Hb0ZvcndhcmQoKSxcblx0XHRcdGxvYWRpbmc6IHdlYkNvbnRlbnRzLmlzTG9hZGluZygpLFxuXHRcdFx0Zm9jdXNlZDogd2ViQ29udGVudHMuaXNGb2N1c2VkKCksXG5cdFx0XHR2aXNpYmxlOiB0aGlzLl92aWV3LmdldFZpc2libGUoKSxcblx0XHRcdGlzRGV2VG9vbHNPcGVuOiB3ZWJDb250ZW50cy5pc0RldlRvb2xzT3BlbmVkKCksXG5cdFx0XHRsYXN0U2NyZWVuc2hvdDogdGhpcy5fbGFzdFNjcmVlbnNob3QsXG5cdFx0XHRsYXN0RmF2aWNvbjogdGhpcy5fbGFzdEZhdmljb24sXG5cdFx0XHRsYXN0RXJyb3I6IHRoaXMuX2xhc3RFcnJvcixcblx0XHRcdGNlcnRpZmljYXRlRXJyb3I6IHRoaXMuc2Vzc2lvbi50cnVzdC5nZXRDZXJ0aWZpY2F0ZUVycm9yKHVybCksXG5cdFx0XHRzdG9yYWdlU2NvcGU6IHRoaXMuc2Vzc2lvbi5zdG9yYWdlU2NvcGUsXG5cdFx0XHRzdG9yYWdlS2V5czogeyAuLi50aGlzLnNlc3Npb24uaGlzdG9yeS5zdG9yYWdlS2V5cywgLi4udGhpcy5zZXNzaW9uLnBlcm1pc3Npb25zLnN0b3JhZ2VLZXlzIH0sXG5cdFx0XHRwZXJtaXNzaW9uczogdGhpcy5zZXNzaW9uLnBlcm1pc3Npb25zLnNlcmlhbGl6ZSgpLFxuXHRcdFx0YnJvd3Nlclpvb21JbmRleDogdGhpcy5fYnJvd3Nlclpvb21JbmRleCxcblx0XHRcdGVsZW1lbnRTZWxlY3Rpb25TdGF0ZTogdGhpcy5pbnNwZWN0b3IuZWxlbWVudFNlbGVjdGlvblN0YXRlLFxuXHRcdFx0aXNSZW1vdGVTZXNzaW9uOiB0aGlzLnNlc3Npb24ucmVtb3RlLmlzUmVtb3RlLFxuXHRcdFx0aXNBcmVhU2VsZWN0aW9uQWN0aXZlOiB0aGlzLmluc3BlY3Rvci5pc0FyZWFTZWxlY3Rpb25BY3RpdmUsXG5cdFx0XHRkZXZpY2U6IHRoaXMuZW11bGF0b3IuZGV2aWNlXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUb2dnbGUgZGV2ZWxvcGVyIHRvb2xzIGZvciB0aGlzIGJyb3dzZXIgdmlldy5cblx0ICovXG5cdHRvZ2dsZURldlRvb2xzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3ZpZXcud2ViQ29udGVudHMudG9nZ2xlRGV2VG9vbHMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGUgdGhlIGxheW91dCBib3VuZHMgb2YgdGhpcyB2aWV3XG5cdCAqL1xuXHRsYXlvdXQoYm91bmRzOiBJQnJvd3NlclZpZXdCb3VuZHMpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY3VycmVudFdpbmRvdz8ud2luPy5pZCAhPT0gYm91bmRzLndpbmRvd0lkKSB7XG5cdFx0XHRjb25zdCBuZXdXaW5kb3cgPSB0aGlzLl93aW5kb3dCeUlkKGJvdW5kcy53aW5kb3dJZCk7XG5cdFx0XHRpZiAobmV3V2luZG93KSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRXaW5kb3c/Lndpbj8uY29udGVudFZpZXcucmVtb3ZlQ2hpbGRWaWV3KHRoaXMuX3ZpZXcpO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50V2luZG93ID0gbmV3V2luZG93O1xuXHRcdFx0XHRuZXdXaW5kb3cud2luPy5jb250ZW50Vmlldy5hZGRDaGlsZFZpZXcodGhpcy5fdmlldyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmlldy5zZXRCb3JkZXJSYWRpdXMoTWF0aC5yb3VuZChib3VuZHMuY29ybmVyUmFkaXVzICogYm91bmRzLnpvb21GYWN0b3IpKTtcblxuXHRcdGlmIChib3VuZHMuZW11bGF0aW9uKSB7XG5cdFx0XHR0aGlzLmVtdWxhdG9yLmFwcGx5U2NyZWVuRW11bGF0aW9uKGJvdW5kcy53aWR0aCwgYm91bmRzLmhlaWdodCwgYm91bmRzLmVtdWxhdGlvbi5zY2FsZSwgYm91bmRzLnpvb21GYWN0b3IpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ZpZXcuc2V0Qm91bmRzKHtcblx0XHRcdHg6IE1hdGgucm91bmQoYm91bmRzLnggKiBib3VuZHMuem9vbUZhY3RvciksXG5cdFx0XHR5OiBNYXRoLnJvdW5kKGJvdW5kcy55ICogYm91bmRzLnpvb21GYWN0b3IpLFxuXHRcdFx0d2lkdGg6IE1hdGgucm91bmQoYm91bmRzLndpZHRoICogYm91bmRzLnpvb21GYWN0b3IpLFxuXHRcdFx0aGVpZ2h0OiBNYXRoLnJvdW5kKGJvdW5kcy5oZWlnaHQgKiBib3VuZHMuem9vbUZhY3Rvcilcblx0XHR9KTtcblxuXHRcdHRoaXMuX2hhc0JlZW5MYWlkT3V0ID0gdHJ1ZTtcblx0XHRpZiAodGhpcy5fd2FudHNWaXNpYmlsaXR5ICYmICF0aGlzLl92aWV3LmdldFZpc2libGUoKSkge1xuXHRcdFx0dGhpcy5fdmlldy5zZXRWaXNpYmxlKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHNldEJyb3dzZXJab29tSW5kZXgoem9vbUluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9icm93c2VyWm9vbUluZGV4ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oem9vbUluZGV4LCBicm93c2VyWm9vbUZhY3RvcnMubGVuZ3RoIC0gMSkpO1xuXHRcdGNvbnN0IGJyb3dzZXJab29tRmFjdG9yID0gYnJvd3Nlclpvb21GYWN0b3JzW3RoaXMuX2Jyb3dzZXJab29tSW5kZXhdO1xuXHRcdHRoaXMuX3ZpZXcud2ViQ29udGVudHMuc2V0Wm9vbUZhY3Rvcihicm93c2VyWm9vbUZhY3Rvcik7XG5cdH1cblxuXHQvKipcblx0ICogU2V0IHRoZSB2aXNpYmlsaXR5IG9mIHRoaXMgdmlld1xuXHQgKi9cblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dhbnRzVmlzaWJpbGl0eSA9PT0gdmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSB2aWV3IGlzIGZvY3VzZWQsIHBhc3MgZm9jdXMgYmFjayB0byB0aGUgd2luZG93IHdoZW4gaGlkaW5nXG5cdFx0aWYgKCF2aXNpYmxlICYmIHRoaXMuX3ZpZXcud2ViQ29udGVudHMuaXNGb2N1c2VkKCkpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRXaW5kb3c/Lndpbj8ud2ViQ29udGVudHMuZm9jdXMoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faGFzQmVlbkxhaWRPdXQgfHwgIXZpc2libGUpIHtcblx0XHRcdHRoaXMuX3ZpZXcuc2V0VmlzaWJsZSh2aXNpYmxlKTtcblx0XHR9XG5cblx0XHR0aGlzLl93YW50c1Zpc2liaWxpdHkgPSB2aXNpYmxlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKHsgdmlzaWJsZSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgY2FwdHVyZWQgY29uc29sZSBsb2dzLlxuXHQgKi9cblx0Z2V0Q29uc29sZUxvZ3MoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uc29sZUxvZ3Muam9pbignXFxuJyk7XG5cdH1cblxuXHQvKipcblx0ICogTG9hZCBhIFVSTCBpbiB0aGlzIHZpZXdcblx0ICovXG5cdGFzeW5jIGxvYWRVUkwodXJsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9leHBsaWNpdE5hdmlnYXRpb25QZW5kaW5nID0gdHJ1ZTtcblx0XHQvLyBXYWl0IGZvciB0aGUgdHVubmVsIHByb3h5IChpZiBhbnkpIHRvIGJlIGFwcGxpZWQgc28gdGhlIG5hdmlnYXRpb25cblx0XHQvLyBhbmQgdGhlIHJlcXVlc3RzIGl0IHRyaWdnZXJzIGZsb3cgdGhyb3VnaCB0aGUgcHJveHkuXG5cdFx0YXdhaXQgdGhpcy5zZXNzaW9uLnJlbW90ZS53aGVuUmVhZHk7XG5cdFx0YXdhaXQgdGhpcy5fdmlldy53ZWJDb250ZW50cy5sb2FkVVJMKHVybCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBjdXJyZW50IFVSTFxuXHQgKi9cblx0Z2V0VVJMKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXcud2ViQ29udGVudHMuZ2V0VVJMKCk7XG5cdH1cblxuXHQvKipcblx0ICogTmF2aWdhdGUgYmFjayBpbiBoaXN0b3J5XG5cdCAqL1xuXHRnb0JhY2soKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3ZpZXcud2ViQ29udGVudHMubmF2aWdhdGlvbkhpc3RvcnkuY2FuR29CYWNrKCkpIHtcblx0XHRcdHRoaXMuX3ZpZXcud2ViQ29udGVudHMubmF2aWdhdGlvbkhpc3RvcnkuZ29CYWNrKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE5hdmlnYXRlIGZvcndhcmQgaW4gaGlzdG9yeVxuXHQgKi9cblx0Z29Gb3J3YXJkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl92aWV3LndlYkNvbnRlbnRzLm5hdmlnYXRpb25IaXN0b3J5LmNhbkdvRm9yd2FyZCgpKSB7XG5cdFx0XHR0aGlzLl92aWV3LndlYkNvbnRlbnRzLm5hdmlnYXRpb25IaXN0b3J5LmdvRm9yd2FyZCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWxvYWQgdGhlIGN1cnJlbnQgcGFnZVxuXHQgKi9cblx0cmVsb2FkKGhhcmQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGhhcmQpIHtcblx0XHRcdHRoaXMuX3ZpZXcud2ViQ29udGVudHMucmVsb2FkSWdub3JpbmdDYWNoZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl92aWV3LndlYkNvbnRlbnRzLnJlbG9hZCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVjayBpZiB0aGUgdmlldyBjYW4gbmF2aWdhdGUgYmFja1xuXHQgKi9cblx0Y2FuR29CYWNrKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl92aWV3LndlYkNvbnRlbnRzLm5hdmlnYXRpb25IaXN0b3J5LmNhbkdvQmFjaygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrIGlmIHRoZSB2aWV3IGNhbiBuYXZpZ2F0ZSBmb3J3YXJkXG5cdCAqL1xuXHRjYW5Hb0ZvcndhcmQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXcud2ViQ29udGVudHMubmF2aWdhdGlvbkhpc3RvcnkuY2FuR29Gb3J3YXJkKCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FwdHVyZSBhIHNjcmVlbnNob3Qgb2YgdGhpcyB2aWV3XG5cdCAqL1xuXHRhc3luYyBjYXB0dXJlU2NyZWVuc2hvdChvcHRpb25zPzogSUJyb3dzZXJWaWV3Q2FwdHVyZVNjcmVlbnNob3RPcHRpb25zKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdGlmICghdGhpcy5fdmlldy5nZXRWaXNpYmxlKCkpIHtcblx0XHRcdC8vIFRoaXMgZW5zdXJlcyB0aGUgd2ViQ29udGVudHMgcmVuZGVyaW5nIHBpcGVsaW5lIGlzIHJlYWR5IHNvIGJhY2tncm91bmQgdGFicyBjYW4gYmUgY2FwdHVyZWQgdG9vLlxuXHRcdFx0dGhpcy5fdmlldy5zZXRWaXNpYmxlKHRydWUpO1xuXHRcdFx0dGhpcy5fdmlldy5zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBxdWFsaXR5ID0gb3B0aW9ucz8ucXVhbGl0eSA/PyA4MDtcblx0XHRjb25zdCBmb3JtYXQgPSBvcHRpb25zPy5mb3JtYXQgPz8gJ2pwZWcnO1xuXG5cdFx0aWYgKG9wdGlvbnM/LmZ1bGxQYWdlICYmICFvcHRpb25zLnNjcmVlblJlY3QgJiYgIW9wdGlvbnMucGFnZVJlY3QpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jYXB0dXJlRnVsbFBhZ2VTY3JlZW5zaG90KGZvcm1hdCwgcXVhbGl0eSk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnM/LnBhZ2VSZWN0KSB7XG5cdFx0XHRjb25zdCB6b29tRmFjdG9yID0gdGhpcy5fdmlldy53ZWJDb250ZW50cy5nZXRab29tRmFjdG9yKCk7XG5cdFx0XHQvLyBUaGUgdmlzdWFsIHZpZXdwb3J0IHNjYWxlIGFjY291bnRzIGZvciBwaW5jaC10by16b29tIG1hZ25pZmljYXRpb24sIHdoaWNoIGlzIHNlcGFyYXRlIGZyb20gdGhlIHJlZ3VsYXIgem9vbSBmYWN0b3IuXG5cdFx0XHRjb25zdCB2aXN1YWxWaWV3cG9ydFNjYWxlID0gYXdhaXQgdGhpcy5pbnNwZWN0b3IuZ2V0VmlzdWFsVmlld3BvcnRTY2FsZSgpO1xuXHRcdFx0Y29uc3QgZW11bGF0aW9uU2NhbGUgPSB0aGlzLmVtdWxhdG9yLmVtdWxhdGVkU2NhbGVGYWN0b3I7XG5cdFx0XHRvcHRpb25zLnNjcmVlblJlY3QgPSB7XG5cdFx0XHRcdHg6IG9wdGlvbnMucGFnZVJlY3QueCAqIHZpc3VhbFZpZXdwb3J0U2NhbGUgKiB6b29tRmFjdG9yICogZW11bGF0aW9uU2NhbGUsXG5cdFx0XHRcdHk6IG9wdGlvbnMucGFnZVJlY3QueSAqIHZpc3VhbFZpZXdwb3J0U2NhbGUgKiB6b29tRmFjdG9yICogZW11bGF0aW9uU2NhbGUsXG5cdFx0XHRcdHdpZHRoOiBvcHRpb25zLnBhZ2VSZWN0LndpZHRoICogdmlzdWFsVmlld3BvcnRTY2FsZSAqIHpvb21GYWN0b3IgKiBlbXVsYXRpb25TY2FsZSxcblx0XHRcdFx0aGVpZ2h0OiBvcHRpb25zLnBhZ2VSZWN0LmhlaWdodCAqIHZpc3VhbFZpZXdwb3J0U2NhbGUgKiB6b29tRmFjdG9yICogZW11bGF0aW9uU2NhbGVcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zPy5hd2FpdE5leHRQYWludCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fd2FpdEZvck5leHRQYWludCgpO1xuXHRcdH1cblx0XHRjb25zdCBpbWFnZSA9IGF3YWl0IChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXhBdHRlbXB0cyA9IDU7XG5cdFx0XHRsZXQgbGFzdEVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbWF4QXR0ZW1wdHM7IGkrKykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl92aWV3LndlYkNvbnRlbnRzLmNhcHR1cmVQYWdlKG9wdGlvbnM/LnNjcmVlblJlY3QsIHtcblx0XHRcdFx0XHRcdHN0YXlIaWRkZW46IHRydWVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHQvLyBgVW5rbm93blZpekVycm9yYCBpcyBhIHRyYW5zaWVudCBFbGVjdHJvbiBlcnJvciB3aGVuIG5vIGZyYW1lIGlzIGF2YWlsYWJsZSB5ZXRcblx0XHRcdFx0XHQvLyAoZS5nLiBvZmZzY3JlZW4gc2NlbmFyaW9zIHdoZXJlIHJlbmRlcmluZyBoYXMganVzdCBiZWVuIGtpY2tlZCBvZmYgYnkgYHNldFZpc2libGUodHJ1ZSlgKSxcblx0XHRcdFx0XHQvLyBzbyByZXRyeSBhIGZldyB0aW1lcy5cblx0XHRcdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnJvci5tZXNzYWdlID09PSAnVW5rbm93blZpekVycm9yJykge1xuXHRcdFx0XHRcdFx0bGFzdEVycm9yID0gZXJyb3I7XG5cdFx0XHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTYpKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGNhcHR1cmUgc2NyZWVuc2hvdCBhZnRlciAke21heEF0dGVtcHRzfSBhdHRlbXB0c2AsIHsgY2F1c2U6IGxhc3RFcnJvciB9KTtcblx0XHR9KSgpO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGZvcm1hdCA9PT0gJ3BuZycgPyBpbWFnZS50b1BORygpIDogaW1hZ2UudG9KUEVHKHF1YWxpdHkpO1xuXHRcdGNvbnN0IHNjcmVlbnNob3QgPSBWU0J1ZmZlci53cmFwKGJ1ZmZlcik7XG5cdFx0Ly8gT25seSB1cGRhdGUgX2xhc3RTY3JlZW5zaG90IGlmIGNhcHR1cmluZyB0aGUgZnVsbCB2aWV3XG5cdFx0aWYgKCFvcHRpb25zPy5zY3JlZW5SZWN0KSB7XG5cdFx0XHR0aGlzLl9sYXN0U2NyZWVuc2hvdCA9IHNjcmVlbnNob3Q7XG5cdFx0fVxuXHRcdHJldHVybiBzY3JlZW5zaG90O1xuXHR9XG5cblx0Ly8gQ2FwdHVyZSBhIHNjcmVlbnNob3Qgb2YgdGhlIGZ1bGwgc2Nyb2xsYWJsZSBkb2N1bWVudCAoYmV5b25kIHRoZSB2aWV3cG9ydCkgdmlhIENEUC5cblx0cHJpdmF0ZSBhc3luYyBfY2FwdHVyZUZ1bGxQYWdlU2NyZWVuc2hvdChmb3JtYXQ6ICdqcGVnJyB8ICdwbmcnLCBxdWFsaXR5OiBudW1iZXIpOiBQcm9taXNlPFZTQnVmZmVyPiB7XG5cdFx0Y29uc3QgbWV0cmljcyA9IGF3YWl0IHRoaXMuZGVidWdnZXIuc2VuZENvbW1hbmQoJ1BhZ2UuZ2V0TGF5b3V0TWV0cmljcycpIGFzIHsgY3NzQ29udGVudFNpemU/OiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfTtcblx0XHQvLyBTaXplIGluIENTUyBwaXhlbHNcblx0XHRjb25zdCBzaXplID0gbWV0cmljcy5jc3NDb250ZW50U2l6ZTtcblx0XHRpZiAoIXNpemUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUGFnZS5nZXRMYXlvdXRNZXRyaWNzIGRpZCBub3QgcmV0dXJuIGEgY3NzQ29udGVudFNpemUnKTtcblx0XHR9XG5cdFx0Y29uc3Qgem9vbUZhY3RvciA9IHRoaXMuX3ZpZXcud2ViQ29udGVudHMuZ2V0Wm9vbUZhY3RvcigpO1xuXHRcdGNvbnN0IGNsaXBXaWR0aCA9IHNpemUud2lkdGggKiB6b29tRmFjdG9yO1xuXHRcdGNvbnN0IGNsaXBIZWlnaHQgPSBzaXplLmhlaWdodCAqIHpvb21GYWN0b3I7XG5cdFx0Ly8gQ0RQIHJlbmRlcnMgdGhlIHNjcmVlbnNob3QgYXQgZGV2aWNlIHBpeGVscywgc28gdGhlIG91dHB1dCBiaXRtYXAgZGltZW5zaW9ucyBhcmUgcm91Z2hseVxuXHRcdC8vIGBjbGlwLndpZHRoICogc2NhbGUgKiBkZXZpY2VQaXhlbFJhdGlvYC4gRGl2aWRlIGJ5IERQUiBoZXJlIHNvIGBNQVhfRlVMTF9QQUdFX1NDUkVFTlNIT1RfRElNRU5TSU9OYFxuXHRcdC8vIGlzIGFuIHVwcGVyIGJvdW5kIG9uIHRoZSBmaW5hbCBpbWFnZSBwaXhlbCBzaXplIChub3QganVzdCB0aGUgQ1NTLXBpeGVsIGNsaXAgc2l6ZSkuXG5cdFx0Ly8gV2UgcmVhZCB0aGUgRFBSIGZyb20gdGhlIGRpc3BsYXkgaG9zdGluZyB0aGUgdmlldydzIHdpbmRvdyAocmF0aGVyIHRoYW4gZXZhbHVhdGluZ1xuXHRcdC8vIGB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpb2AgaW4gdGhlIHBhZ2UpIHNvIHRoaXMgd29ya3Mgd2l0aG91dCBhIHJlbmRlcmVyIHJvdW5kLXRyaXAgYW5kXG5cdFx0Ly8gd2hpbGUgdGhlIHBhZ2UgaXMgcGF1c2VkIGF0IGEgYnJlYWtwb2ludC4gRmFsbCBiYWNrIHRvIHRoZSBwcmltYXJ5IGRpc3BsYXkgaWYgbm8gaG9zdFxuXHRcdC8vIHdpbmRvdyBjYW4gYmUgcmVzb2x2ZWQgKGUuZy4gZHVyaW5nIHRlYXJkb3duKS5cblx0XHRjb25zdCBob3N0V2luZG93ID0gdGhpcy5faG9zdFdpbmRvdztcblx0XHRjb25zdCBkaXNwbGF5ID0gaG9zdFdpbmRvdyA/IHNjcmVlbi5nZXREaXNwbGF5TWF0Y2hpbmcoaG9zdFdpbmRvdy5nZXRCb3VuZHMoKSkgOiBzY3JlZW4uZ2V0UHJpbWFyeURpc3BsYXkoKTtcblx0XHRjb25zdCBkZXZpY2VQaXhlbFJhdGlvID0gZGlzcGxheS5zY2FsZUZhY3Rvcjtcblx0XHRjb25zdCBtYXhDbGlwRGltZW5zaW9uID0gQnJvd3NlclZpZXcuTUFYX0ZVTExfUEFHRV9TQ1JFRU5TSE9UX0RJTUVOU0lPTiAvIE1hdGgubWF4KGRldmljZVBpeGVsUmF0aW8sIDEpO1xuXHRcdGNvbnN0IHNjYWxlID0gTWF0aC5taW4oMSwgbWF4Q2xpcERpbWVuc2lvbiAvIE1hdGgubWF4KGNsaXBXaWR0aCwgY2xpcEhlaWdodCkpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRlYnVnZ2VyLnNlbmRDb21tYW5kKCdQYWdlLmNhcHR1cmVTY3JlZW5zaG90Jywge1xuXHRcdFx0XHRmb3JtYXQsXG5cdFx0XHRcdC4uLihmb3JtYXQgPT09ICdqcGVnJyA/IHsgcXVhbGl0eSB9IDoge30pLFxuXHRcdFx0XHRjYXB0dXJlQmV5b25kVmlld3BvcnQ6IHRydWUsXG5cdFx0XHRcdC8vIEluIHRoZW9yeSwgYGNsaXBgIGRlZmF1bHRzIHRvIHRoZSBmdWxsIGFyZWEgd2hlbiBub3QgZXhwbGljaXRseSBwYXNzZWQsIGJ1dCBpbiBwcmFjdGljZSBpdCBkb2Vzbid0IHdvcmsgd2hlblxuXHRcdFx0XHQvLyB0aGUgem9vbSBsZXZlbCBpc24ndCAxMDAsIGJlY2F1c2UgaXQgZG9lc24ndCBtdWx0aXBseSB0aGUgd2lkdGggYW5kIGhlaWdodCBieSB6b29tRmFjdG9yIGxpa2Ugd2UgZG8gaGVyZS5cblx0XHRcdFx0Ly8gU2V0dGluZyB0aGUgY2xpcCBleHBsaWNpdGx5LCB3ZSBjYW4gbXVsdGlwbHkgYnkgem9vbUZhY3RvciBhbmQgdGh1cyB3b3JrIGFyb3VuZCB0aGlzIENocm9taXVtIGJ1Zy5cblx0XHRcdFx0Ly8gTm90ZSB0aGF0IGV2ZW4gd2l0aCB0aGlzIHdvcmthcm91bmQsIHdlIG9mdGVuIHNlZSB0aGF0IHRoZSBwYWdlIGlzbid0IGZ1bGx5IGNhcHR1cmVkIGFuZCBtaWdodCByZXBlYXRcblx0XHRcdFx0Ly8gdmlzdWFsIGNvbnRlbnQgZnJvbSB0aGUgdG9wIGF0IHRoZSBib3R0b20sIGluc3RlYWQgb2Ygc2hvd2luZyB0aGUgYm90dG9tIG9mIHRoZSBwYWdlLlxuXHRcdFx0XHQvLyAtIEFub3RoZXIgc2lkZW5vdGU6IEN1cnJlbnRseSB0aGUgc2Nyb2xsYmFyIHdpZHRoIGlzbid0IGFjY291bnRlZCBmb3IuIElmIGEgc2Nyb2xsYmFyIGV4aXN0cywgd2Ugc2hvdWxkIGFkZCB0aGVcblx0XHRcdFx0Ly8gICB2ZXJ0aWNhbCBzY3JvbGxiYXIncyB3aWR0aCBhbmQgaG9yaXpvbnRhbCBzY3JvbGxiYXIncyBoZWlnaHQgdG8gdGhlIGNsaXAgZGltZW5zaW9ucywgc2luY2UgdGhlIGltYWdlIGlzIGN1cnJlbnRseVxuXHRcdFx0XHQvLyAgIGNsaXBwZWQgYnkgdGhhdCBhbW91bnQgKHRoaXMgYWxzbyBoYXBwZW5zIHdoZW4gbm8gY2xpcCBwYXJhbWV0ZXIgaXMgcHJvdmlkZWQ7IGlkZWFsbHkgaXQgc2hvdWxkIGJlIGZpeGVkIHVwc3RyZWFtXG5cdFx0XHRcdC8vICAgaW4gQ2hyb21pdW0pLlxuXHRcdFx0XHRjbGlwOiB7IHg6IDAsIHk6IDAsIHdpZHRoOiBjbGlwV2lkdGgsIGhlaWdodDogY2xpcEhlaWdodCwgc2NhbGUgfVxuXHRcdFx0fSkgYXMgeyBkYXRhOiBzdHJpbmcgfTtcblx0XHRcdHJldHVybiBWU0J1ZmZlci53cmFwKEJ1ZmZlci5mcm9tKHJlc3VsdC5kYXRhLCAnYmFzZTY0JykpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBgUGFnZS5jYXB0dXJlU2NyZWVuc2hvdGAgd2l0aCBgY2FwdHVyZUJleW9uZFZpZXdwb3J0YCByZXNldHMgYW5kXG5cdFx0XHQvLyBkaXNhYmxlcyBwaW5jaC10by16b29tIHVudGlsIHRoZSBuZXh0IG5hdmlnYXRpb24uIFJlLWVuYWJsZSBpdCBzb1xuXHRcdFx0Ly8gdGhlIHVzZXIgY2FuIHN0aWxsIHBpbmNoLXRvLXpvb20gZXZlbiBpbW1lZGlhdGVseSBhZnRlclxuXHRcdFx0Ly8gY2FwdHVyaW5nIGEgZnVsbC1wYWdlIHNjcmVlbnNob3QuXG5cdFx0XHR2b2lkIHRoaXMuX3ZpZXcud2ViQ29udGVudHMuc2V0VmlzdWFsWm9vbUxldmVsTGltaXRzKDEsIDMpLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gcmVzdG9yZSB2aXN1YWwgem9vbSBsZXZlbCBsaW1pdHMgYWZ0ZXIgZnVsbC1wYWdlIHNjcmVlbnNob3QuJywgZXJyb3IpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd2FpdEZvck5leHRQYWludCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBXQUlUX1RJTUVPVVRfTVMgPSAxMDA7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRcdHRoaXMuZGVidWdnZXIuc2VuZENvbW1hbmQoJ1J1bnRpbWUuZXZhbHVhdGUnLCB7XG5cdFx0XHRcdFx0ZXhwcmVzc2lvbjogJ25ldyBQcm9taXNlKHIgPT4gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHJlcXVlc3RBbmltYXRpb25GcmFtZShyKSkpJyxcblx0XHRcdFx0XHRhd2FpdFByb21pc2U6IHRydWVcblx0XHRcdFx0fSksXG5cdFx0XHRcdG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBXQUlUX1RJTUVPVVRfTVMpKVxuXHRcdFx0XSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBgUnVudGltZS5ldmFsdWF0ZWAgY2FuIHRocm93IGlmIHRoZSBwYWdlIG5hdmlnYXRlcyB3aGlsZSB3ZSdyZSB3YWl0aW5nO1xuXHRcdFx0Ly8ganVzdCBwcm9jZWVkIGluIHRoYXQgY2FzZS5cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRm9jdXMgdGhpcyB2aWV3XG5cdCAqL1xuXHRhc3luYyBmb2N1cyhmb3JjZT86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBCeSBkZWZhdWx0LCBvbmx5IGZvY3VzIHRoZSB2aWV3IGlmIGl0cyB3aW5kb3cgaXMgYWxyZWFkeSBmb2N1c2VkLlxuXHRcdGlmICghZm9yY2UgJiYgIXRoaXMuX2N1cnJlbnRXaW5kb3c/Lndpbj8uaXNGb2N1c2VkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdmlldy53ZWJDb250ZW50cy5mb2N1cygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmQgdGV4dCBpbiB0aGUgcGFnZVxuXHQgKi9cblx0YXN5bmMgZmluZEluUGFnZSh0ZXh0OiBzdHJpbmcsIG9wdGlvbnM/OiBJQnJvd3NlclZpZXdGaW5kSW5QYWdlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3ZpZXcud2ViQ29udGVudHMuZmluZEluUGFnZSh0ZXh0LCB7XG5cdFx0XHRtYXRjaENhc2U6IG9wdGlvbnM/Lm1hdGNoQ2FzZSA/PyBmYWxzZSxcblx0XHRcdGZvcndhcmQ6IG9wdGlvbnM/LmZvcndhcmQgPz8gdHJ1ZSxcblxuXHRcdFx0Ly8gYGZpbmROZXh0YCBpcyBub3QgdmVyeSBjbGVhcmx5IG5hbWVkLiBGcm9tIEVsZWN0cm9uIGRvY3M6IGBXaGV0aGVyIHRvIGJlZ2luIGEgbmV3IHRleHQgZmluZGluZyBzZXNzaW9uIHdpdGggdGhpcyByZXF1ZXN0YC5cblx0XHRcdC8vIEl0IG5lZWRzIHRvIGJlIHNldCB0byBgdHJ1ZWAgaWYgd2Ugd2FudCBhIG5ldyBzZWFyY2ggdG8gYmUgcGVyZm9ybWVkLCBzdWNoIGFzIHdoZW4gdGhlIHRleHQgY2hhbmdlcy5cblx0XHRcdC8vIFdlIG5hbWUgaXQgYHJlY29tcHV0ZWAgaW4gb3VyIGludGVybmFsIG9wdGlvbnMgdG8gYmV0dGVyIHJlZmxlY3QgaXRzIHB1cnBvc2UgLyBiZWhhdmlvci5cblx0XHRcdGZpbmROZXh0OiBvcHRpb25zPy5yZWNvbXB1dGUgPz8gZmFsc2Vcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdG9wIGZpbmRpbmcgaW4gcGFnZVxuXHQgKi9cblx0YXN5bmMgc3RvcEZpbmRJblBhZ2Uoa2VlcFNlbGVjdGlvbj86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl92aWV3LndlYkNvbnRlbnRzLnN0b3BGaW5kSW5QYWdlKGtlZXBTZWxlY3Rpb24gPyAna2VlcFNlbGVjdGlvbicgOiAnY2xlYXJTZWxlY3Rpb24nKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCB0ZXh0IGluIHRoZSBicm93c2VyIHZpZXcuXG5cdCAqIFJldHVybnMgaW1tZWRpYXRlbHkgd2l0aCBlbXB0eSBzdHJpbmcgaWYgdGhlIHBhZ2UgaXMgc3RpbGwgbG9hZGluZy5cblx0ICovXG5cdGFzeW5jIGdldFNlbGVjdGVkVGV4dCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdC8vIHdlIGRvbid0IHdhbnQgdG8gd2FpdCBmb3IgdGhlIHBhZ2UgdG8gZmluaXNoIGxvYWRpbmcsIHdoaWNoIGV4ZWN1dGVKYXZhU2NyaXB0IG5vcm1hbGx5IGRvZXMuXG5cdFx0aWYgKHRoaXMuX3ZpZXcud2ViQ29udGVudHMuaXNMb2FkaW5nKCkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFVzZXMgb3VyIHByZWxvYWRlZCBjb250ZXh0QnJpZGdlLWV4cG9zZWQgQVBJLlxuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3ZpZXcud2ViQ29udGVudHMuZXhlY3V0ZUphdmFTY3JpcHRJbklzb2xhdGVkV29ybGQoYnJvd3NlclZpZXdJc29sYXRlZFdvcmxkSWQsIFt7IGNvZGU6ICd3aW5kb3cuYnJvd3NlclZpZXdBUEk/LmdldFNlbGVjdGVkVGV4dD8uKCkgPz8gXCJcIicgfV0pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhciBhbGwgc3RvcmFnZSBkYXRhIGZvciB0aGlzIGJyb3dzZXIgdmlldydzIHNlc3Npb25cblx0ICovXG5cdGFzeW5jIGNsZWFyU3RvcmFnZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnNlc3Npb24uY2xlYXJEYXRhKCk7XG5cdH1cblxuXHQvKipcblx0ICogQW5zd2VyIGFuIGluLXByb2dyZXNzIGhhcmR3YXJlLWRldmljZSBjaG9vc2VyLiBQYXNzIHRoZSBjaG9zZW4gZGV2aWNlIGlkLFxuXHQgKiBvciBgbnVsbGAgdG8gY2FuY2VsIHRoZSBjaG9vc2VyLlxuXHQgKi9cblx0c2VsZWN0RGV2aWNlKHJlcXVlc3RJZDogc3RyaW5nLCBkZXZpY2VJZDogc3RyaW5nIHwgbnVsbCk6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvbi5wZXJtaXNzaW9ucy5yZXNvbHZlRGV2aWNlKHJlcXVlc3RJZCwgZGV2aWNlSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRydXN0IGEgY2VydGlmaWNhdGUgZm9yIGEgZ2l2ZW4gaG9zdCBhbmQgcmVsb2FkIHRoZSBwYWdlLlxuXHQgKi9cblx0YXN5bmMgdHJ1c3RDZXJ0aWZpY2F0ZShob3N0OiBzdHJpbmcsIGZpbmdlcnByaW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnNlc3Npb24udHJ1c3QudHJ1c3RDZXJ0aWZpY2F0ZShob3N0LCBmaW5nZXJwcmludCk7XG5cdFx0dGhpcy5fdmlldy53ZWJDb250ZW50cy5yZWxvYWQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXZva2UgdHJ1c3QgZm9yIGEgcHJldmlvdXNseSB0cnVzdGVkIGNlcnRpZmljYXRlIGFuZCBjbG9zZSB0aGUgdmlldy5cblx0ICovXG5cdGFzeW5jIHVudHJ1c3RDZXJ0aWZpY2F0ZShob3N0OiBzdHJpbmcsIGZpbmdlcnByaW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnNlc3Npb24udHJ1c3QudW50cnVzdENlcnRpZmljYXRlKGhvc3QsIGZpbmdlcnByaW50KTtcblx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHVuZGVybHlpbmcgV2ViQ29udGVudHNWaWV3XG5cdCAqL1xuXHRnZXRXZWJDb250ZW50c1ZpZXcoKTogV2ViQ29udGVudHNWaWV3IHtcblx0XHRyZXR1cm4gdGhpcy5fdmlldztcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGhvc3RpbmcgRWxlY3Ryb24gd2luZG93IGZvciB0aGlzIHZpZXcsIGlmIGFueS5cblx0ICogVGhpcyBjYW4gYmUgYW4gYXV4aWxpYXJ5IHdpbmRvdywgZGVwZW5kaW5nIG9uIHdoZXJlIHRoZSB2aWV3IGlzIGN1cnJlbnRseSBob3N0ZWQuXG5cdCAqL1xuXHRnZXRFbGVjdHJvbldpbmRvdygpOiBFbGVjdHJvbi5Ccm93c2VyV2luZG93IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY3VycmVudFdpbmRvdz8ud2luID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgRWxlY3Ryb24gd2luZG93IHRoYXQgY3VycmVudGx5IGhvc3RzIHRoaXMgdmlldywgaWYgYW55LiBCZWZvcmUgYGxheW91dCgpYCBpcyBmaXJzdFxuXHQgKiBjYWxsZWQgdGhpcyBpcyB0aGUgb3duZXIgd2luZG93OyBhZnRlciB0aGF0IGl0J3Mgd2hpY2hldmVyIHdpbmRvdyB0aGUgdmlldyB3YXMgbGFzdCBtb3ZlZFxuXHQgKiB0by4gUmV0dXJucyBgdW5kZWZpbmVkYCBpZiBubyBob3N0IHdpbmRvdyBjYW4gYmUgcmVzb2x2ZWQgKGUuZy4gZHVyaW5nIHRlYXJkb3duKS5cblx0ICovXG5cdHByaXZhdGUgZ2V0IF9ob3N0V2luZG93KCk6IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3cgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50V2luZG93Py53aW4gPz8gdGhpcy5fb3duZXJXaW5kb3cud2luID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cblx0XHQvLyBEaXNwb3NlIGRlYnVnZ2VyLiBUaGlzIGRldGFjaGVzIGRlYnVnIHNlc3Npb25zIGZpcnN0LlxuXHRcdHRoaXMuZGVidWdnZXIuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gUmVtb3ZlIGZyb20gcGFyZW50IHdpbmRvdyAoZ3VhcmQgYWdhaW5zdCBhbHJlYWR5LWRlc3Ryb3llZCB3aW5kb3cpXG5cdFx0Y29uc3QgY3VycmVudFdpbiA9IHRoaXMuX2N1cnJlbnRXaW5kb3c/Lndpbjtcblx0XHRpZiAoY3VycmVudFdpbiAmJiAhY3VycmVudFdpbi5pc0Rlc3Ryb3llZCgpKSB7XG5cdFx0XHRjdXJyZW50V2luLmNvbnRlbnRWaWV3LnJlbW92ZUNoaWxkVmlldyh0aGlzLl92aWV3KTtcblx0XHR9XG5cblx0XHQvLyBGaXJlIGNsb3NlIGV2ZW50IEJFRk9SRSBkaXNwb3NpbmcgZW1pdHRlcnMuIFRoaXMgc2lnbmFscyB0aGUgdmlldyBoYXMgYmVlbiBkZXN0cm95ZWQuXG5cdFx0dGhpcy5fb25EaWRDbG9zZS5maXJlKCk7XG5cblx0XHQvLyBDbGVhbiB1cCB0aGUgdmlldyBhbmQgYWxsIGl0cyBldmVudCBsaXN0ZW5lcnNcblx0XHRpZiAoIXRoaXMuX3ZpZXcud2ViQ29udGVudHMuaXNEZXN0cm95ZWQoKSkge1xuXHRcdFx0dGhpcy5fdmlldy53ZWJDb250ZW50cy5jbG9zZSh7IHdhaXRGb3JCZWZvcmVVbmxvYWQ6IGZhbHNlIH0pO1xuXHRcdH1cblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX3dpbmRvd0J5SWQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IElDb2RlV2luZG93IHwgSUF1eGlsaWFyeVdpbmRvdyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvZGVXaW5kb3dCeUlkKHdpbmRvd0lkKSA/PyB0aGlzLl9hdXhpbGlhcnlXaW5kb3dCeUlkKHdpbmRvd0lkKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvZGVXaW5kb3dCeUlkKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQpOiBJQ29kZVdpbmRvdyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHR5cGVvZiB3aW5kb3dJZCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0J5SWQod2luZG93SWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXV4aWxpYXJ5V2luZG93QnlJZCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogSUF1eGlsaWFyeVdpbmRvdyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHR5cGVvZiB3aW5kb3dJZCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudHMgPSB3ZWJDb250ZW50cy5mcm9tSWQod2luZG93SWQpO1xuXHRcdGlmICghY29udGVudHMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0J5V2ViQ29udGVudHMoY29udGVudHMpO1xuXHR9XG59XG5cbi8qKiBUcnVlIGlmZiB0aGlzIFVSTCBzaG91bGQgYmUgcmVjb3JkZWQgaW4gYnJvd3NlciBoaXN0b3J5LiAqL1xuZnVuY3Rpb24gaXNUcmFja2FibGVIaXN0b3J5VXJsKHVybDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmICghdXJsKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdC8vIENoZWFwIHNjaGVtZSBmaWx0ZXIgYXZvaWRzIFVSTCBwYXJzaW5nIG9uIHRoZSBob3QgcGF0aC5cblx0Y29uc3QgY29sb24gPSB1cmwuaW5kZXhPZignOicpO1xuXHRpZiAoY29sb24gPD0gMCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBzY2hlbWUgPSB1cmwuc3Vic3RyaW5nKDAsIGNvbG9uKS50b0xvd2VyQ2FzZSgpO1xuXHRyZXR1cm4gc2NoZW1lID09PSAnaHR0cCcgfHwgc2NoZW1lID09PSAnaHR0cHMnIHx8IHNjaGVtZSA9PT0gJ2ZpbGUnO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFFBQVEsaUJBQWlCLG1CQUFtQjtBQUNyRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQThZLDRCQUE0QixvQkFBb0IsK0JBQStHO0FBQzdpQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFzQixrQkFBa0I7QUFDeEMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQkFBbUI7QUFHNUIsU0FBZ0QsMEJBQTBCO0FBRTFFLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBRS9CLElBQUssa0JBQUwsa0JBQUtBLHFCQUFMO0FBQ0MsRUFBQUEsaUJBQUEsZ0JBQWE7QUFDYixFQUFBQSxpQkFBQSxnQkFBYTtBQUNiLEVBQUFBLGlCQUFBLGVBQVk7QUFIUixTQUFBQTtBQUFBLEdBQUE7QUFVRSxJQUFNLGNBQU4sY0FBMEIsV0FBVztBQUFBLEVBK0UzQyxZQUNpQixJQUNBLE9BQ0EsU0FDaEIsaUJBQ0EsaUJBQ0EsU0FDc0Msb0JBQ1MsNkJBQ2pCLFlBQ00sa0JBQ25DO0FBQ0QsVUFBTTtBQVhVO0FBQ0E7QUFDQTtBQUlzQjtBQUNTO0FBQ2pCO0FBQ007QUF2RnJDLFNBQWlCLHVCQUF1QixvQkFBSSxJQUE2QjtBQUV6RSxTQUFRLGtCQUF3QztBQUNoRCxTQUFRLGVBQW1DO0FBQzNDLFNBQVEsYUFBZ0Q7QUFDeEQsU0FBUSw0QkFBb0M7QUFDNUMsU0FBUSxvQkFBNEI7QUFHcEMsU0FBUSw2QkFBNkI7QUFLckM7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFRLDJCQUEyQjtBQVFuQyxT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QUFPO0FBQUEsRUFDcEM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSxJQUFZLGNBQWtEO0FBQzdELFdBQU8sS0FBSyxnQkFBZ0IsT0FBTyxLQUFLLGFBQWEsT0FBTztBQUFBLEVBQzdEO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixRQUFJLEtBQUssYUFBYTtBQUNyQjtBQUFBLElBQ0Q7QUFDQSxTQUFLLGNBQWM7QUFHbkIsU0FBSyxTQUFTLFFBQVE7QUFHdEIsVUFBTSxhQUFhLEtBQUssZ0JBQWdCO0FBQ3hDLFFBQUksY0FBYyxDQUFDLFdBQVcsWUFBWSxHQUFHO0FBQzVDLGlCQUFXLFlBQVksZ0JBQWdCLEtBQUssS0FBSztBQUFBLElBQ2xEO0FBR0EsU0FBSyxZQUFZLEtBQUs7QUFHdEIsUUFBSSxDQUFDLEtBQUssTUFBTSxZQUFZLFlBQVksR0FBRztBQUMxQyxXQUFLLE1BQU0sWUFBWSxNQUFNLEVBQUUscUJBQXFCLE1BQU0sQ0FBQztBQUFBLElBQzVEO0FBRUEsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUFBLEVBRVEsWUFBWSxVQUEwRTtBQUM3RixXQUFPLEtBQUssZ0JBQWdCLFFBQVEsS0FBSyxLQUFLLHFCQUFxQixRQUFRO0FBQUEsRUFDNUU7QUFBQSxFQUVRLGdCQUFnQixVQUF1RDtBQUM5RSxRQUFJLE9BQU8sYUFBYSxVQUFVO0FBQ2pDLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxLQUFLLG1CQUFtQixjQUFjLFFBQVE7QUFBQSxFQUN0RDtBQUFBLEVBRVEscUJBQXFCLFVBQTREO0FBQ3hGLFFBQUksT0FBTyxhQUFhLFVBQVU7QUFDakMsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFdBQVcsWUFBWSxPQUFPLFFBQVE7QUFDNUMsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sS0FBSyw0QkFBNEIsdUJBQXVCLFFBQVE7QUFBQSxFQUN4RTtBQUNEO0FBcitCYSxZQTZCWSwwQkFBMEI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUE3QnRDLFlBc0NZLHFDQUFxQztBQXRDakQsY0FBTjtBQUFBLEVBc0ZKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F6RlU7QUF3K0JiLFNBQVMsc0JBQXNCLEtBQXNCO0FBQ3BELE1BQUksQ0FBQyxLQUFLO0FBQ1QsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLFFBQVEsSUFBSSxRQUFRLEdBQUc7QUFDN0IsTUFBSSxTQUFTLEdBQUc7QUFDZixXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sU0FBUyxJQUFJLFVBQVUsR0FBRyxLQUFLLEVBQUUsWUFBWTtBQUNuRCxTQUFPLFdBQVcsVUFBVSxXQUFXLFdBQVcsV0FBVztBQUM5RDsiLAogICJuYW1lcyI6IFsiTmV3UGFnZUxvY2F0aW9uIiwgIm9wdGlvbnMiLCAid2ViQ29udGVudHMiXQp9Cg==
