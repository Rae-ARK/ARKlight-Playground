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
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableMap } from "../../../base/common/lifecycle.js";
import { BrowserViewCommandId } from "../common/browserView.js";
import { clipboard, Menu, MenuItem } from "electron";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { createDecorator, IInstantiationService } from "../../instantiation/common/instantiation.js";
import { BrowserView } from "./browserView.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { IWindowsMainService } from "../../windows/electron-main/windows.js";
import { BrowserSession } from "./browserSession.js";
import { IApplicationStorageMainService } from "../../storage/electron-main/storageMainService.js";
import { logBrowserOpen } from "../common/browserViewTelemetry.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { localize } from "../../../nls.js";
import { INativeHostMainService } from "../../native/electron-main/nativeHostMainService.js";
import { htmlAttributeEncodeValue } from "../../../base/common/strings.js";
import { BrowserViewInspectElementId } from "./browserViewInspector.js";
import { equals } from "../../../base/common/objects.js";
const IBrowserViewMainService = createDecorator("browserViewMainService");
let BrowserViewMainService = class extends Disposable {
  constructor(environmentMainService, instantiationService, windowsMainService, telemetryService, nativeHostMainService, applicationStorageMainService) {
    super();
    this.environmentMainService = environmentMainService;
    this.instantiationService = instantiationService;
    this.windowsMainService = windowsMainService;
    this.telemetryService = telemetryService;
    this.nativeHostMainService = nativeHostMainService;
    this.applicationStorageMainService = applicationStorageMainService;
    this.browserViews = this._register(new DisposableMap());
    /**
     * Per-window configuration applied to the browser views that window owns.
     * Entries are dropped when the window is destroyed.
     */
    this._windowConfigurations = /* @__PURE__ */ new Map();
    this._windowCloseSubscriptions = this._register(new DisposableMap());
    this._onDidCreateBrowserView = this._register(new Emitter());
    this.onDidCreateBrowserView = this._onDidCreateBrowserView.event;
  }
  /**
   * Check if a webContents belongs to an integrated browser view.
   * Delegates to {@link BrowserSession.isBrowserViewWebContents}.
   */
  static isBrowserViewWebContents(contents) {
    return BrowserSession.isBrowserViewWebContents(contents);
  }
  async getOrCreateBrowserView(id, options) {
    if (this.browserViews.has(id)) {
      const view2 = this.browserViews.get(id);
      return view2.getState();
    }
    const ownerWindow = this.windowsMainService.getWindowById(options.owner.mainWindowId);
    if (!ownerWindow) {
      throw new Error(`Owner window with ID ${options.owner.mainWindowId} not found`);
    }
    const browserSession = BrowserSession.getOrCreate(
      this.instantiationService,
      id,
      options.sessionOptions,
      this.environmentMainService.workspaceStorageHome,
      ownerWindow.openedWorkspace?.id
    );
    const view = this.createBrowserView(id, options.owner, browserSession);
    if (options.initialState?.url) {
      void view.loadURL(options.initialState.url);
    }
    return {
      ...view.getState(),
      ...options.initialState
    };
  }
  tryGetBrowserView(id) {
    return this.browserViews.get(id);
  }
  async createTarget(url, owner, browserContextId) {
    const browserSession = browserContextId ? BrowserSession.get(browserContextId) : void 0;
    return this.openNew(url, {
      owner,
      session: browserSession,
      openOptions: { preserveFocus: true },
      source: "cdpCreated"
    });
  }
  /**
   * Get a browser view or throw if not found
   */
  _getBrowserView(id) {
    const view = this.browserViews.get(id);
    if (!view) {
      throw new Error(`Browser view ${id} not found`);
    }
    return view;
  }
  _getViewInfo(view) {
    return {
      id: view.id,
      owner: view.owner,
      state: view.getState()
    };
  }
  async getBrowserViews(windowId) {
    const result = [];
    for (const [, view] of this.browserViews) {
      if (windowId !== void 0 && view.owner.mainWindowId !== windowId) {
        continue;
      }
      result.push(this._getViewInfo(view));
    }
    return result;
  }
  onDynamicDidNavigate(id) {
    return this._getBrowserView(id).onDidNavigate;
  }
  onDynamicDidChangeLoadingState(id) {
    return this._getBrowserView(id).onDidChangeLoadingState;
  }
  onDynamicDidChangeFocus(id) {
    return this._getBrowserView(id).onDidChangeFocus;
  }
  onDynamicDidChangeVisibility(id) {
    return this._getBrowserView(id).onDidChangeVisibility;
  }
  onDynamicDidChangeDevToolsState(id) {
    return this._getBrowserView(id).onDidChangeDevToolsState;
  }
  onDynamicDidKeyCommand(id) {
    return this._getBrowserView(id).onDidKeyCommand;
  }
  onDynamicDidChangeTitle(id) {
    return this._getBrowserView(id).onDidChangeTitle;
  }
  onDynamicDidChangeFavicon(id) {
    return this._getBrowserView(id).onDidChangeFavicon;
  }
  onDynamicDidFindInPage(id) {
    return this._getBrowserView(id).onDidFindInPage;
  }
  onDynamicDidClose(id) {
    return this._getBrowserView(id).onDidClose;
  }
  onDynamicDidSelectElement(id) {
    return this._getBrowserView(id).inspector.onDidSelectElement;
  }
  onDynamicDidRemoveElementComment(id) {
    return this._getBrowserView(id).inspector.onDidRemoveElementComment;
  }
  onDynamicDidChangeElementSelectionState(id) {
    return this._getBrowserView(id).inspector.onDidChangeElementSelectionState;
  }
  onDynamicDidPickArea(id) {
    return this._getBrowserView(id).inspector.onDidPickArea;
  }
  onDynamicDidChangeAreaSelectionActive(id) {
    return this._getBrowserView(id).inspector.onDidChangeAreaSelectionActive;
  }
  onDynamicDidChangeDeviceEmulation(id) {
    return this._getBrowserView(id).emulator.onDidChange;
  }
  onDynamicDidChangeRemoteStatus(id) {
    return this._getBrowserView(id).onDidChangeRemoteStatus;
  }
  onDynamicDidRequestPermission(id) {
    return this._getBrowserView(id).onDidRequestPermission;
  }
  onDynamicDidChangePermissions(id) {
    return this._getBrowserView(id).onDidChangePermissions;
  }
  async getState(id) {
    return this._getBrowserView(id).getState();
  }
  async destroyBrowserView(id) {
    return this.browserViews.deleteAndDispose(id);
  }
  async layout(id, bounds) {
    return this._getBrowserView(id).layout(bounds);
  }
  async setVisible(id, visible) {
    return this._getBrowserView(id).setVisible(visible);
  }
  async loadURL(id, url) {
    return this._getBrowserView(id).loadURL(url);
  }
  async getURL(id) {
    return this._getBrowserView(id).getURL();
  }
  async goBack(id) {
    return this._getBrowserView(id).goBack();
  }
  async goForward(id) {
    return this._getBrowserView(id).goForward();
  }
  async reload(id, hard) {
    return this._getBrowserView(id).reload(hard);
  }
  async toggleDevTools(id) {
    return this._getBrowserView(id).toggleDevTools();
  }
  async canGoBack(id) {
    return this._getBrowserView(id).canGoBack();
  }
  async canGoForward(id) {
    return this._getBrowserView(id).canGoForward();
  }
  async captureScreenshot(id, options) {
    return this._getBrowserView(id).captureScreenshot(options);
  }
  async focus(id, force) {
    return this._getBrowserView(id).focus(force);
  }
  async findInPage(id, text, options) {
    return this._getBrowserView(id).findInPage(text, options);
  }
  async stopFindInPage(id, keepSelection) {
    return this._getBrowserView(id).stopFindInPage(keepSelection);
  }
  async getSelectedText(id) {
    return this._getBrowserView(id).getSelectedText();
  }
  async clearStorage(id) {
    return this._getBrowserView(id).clearStorage();
  }
  async setBrowserZoomIndex(id, zoomIndex) {
    return this._getBrowserView(id).setBrowserZoomIndex(zoomIndex);
  }
  async setDeviceEmulation(id, device) {
    return this._getBrowserView(id).emulator.setDevice(device);
  }
  async trustCertificate(id, host, fingerprint) {
    return this._getBrowserView(id).trustCertificate(host, fingerprint);
  }
  async untrustCertificate(id, host, fingerprint) {
    return this._getBrowserView(id).untrustCertificate(host, fingerprint);
  }
  async deleteBrowserHistory(id, entryIds) {
    this._getBrowserView(id).session.history.delete(entryIds);
  }
  async setPermissions(id, origin, grants) {
    this._getBrowserView(id).session.permissions.set(origin, grants);
  }
  async selectDevice(id, requestId, deviceId) {
    this._getBrowserView(id).selectDevice(requestId, deviceId);
  }
  async clearGlobalStorage() {
    const browserSession = BrowserSession.getOrCreateGlobal(this.instantiationService);
    browserSession.connectStorage(this.applicationStorageMainService);
    await browserSession.clearData();
  }
  async clearWorkspaceStorage(workspaceId) {
    const browserSession = BrowserSession.getOrCreateWorkspace(
      this.instantiationService,
      workspaceId,
      this.environmentMainService.workspaceStorageHome
    );
    browserSession.connectStorage(this.applicationStorageMainService);
    await browserSession.clearData();
  }
  async getConsoleLogs(id) {
    return this._getBrowserView(id).getConsoleLogs();
  }
  async toggleElementSelection(id, enabled, options) {
    return this._getBrowserView(id).inspector.toggleElementSelection(enabled, options);
  }
  async setElementComments(id, update) {
    this._getBrowserView(id).inspector.setElementComments(update);
  }
  async toggleAreaSelection(id, enabled) {
    return this._getBrowserView(id).inspector.toggleAreaSelection(enabled);
  }
  async updateWindowConfiguration(windowId, config) {
    const oldConfig = this._windowConfigurations.get(windowId);
    const didThemeChange = !equals(oldConfig?.theme, config.theme);
    const didProxyChange = !equals(oldConfig?.proxyInfo, config.proxyInfo);
    this._windowConfigurations.set(windowId, config);
    this._ensureWindowCloseSubscription(windowId);
    for (const [, view] of this.browserViews) {
      if (view.owner.mainWindowId === windowId) {
        if (didThemeChange) {
          view.inspector.setTheme(config.theme);
        }
        if (didProxyChange) {
          view.session.remote.acquire(view.id, config.proxyInfo);
        }
        if (typeof config.maxHistoryEntries === "number") {
          view.session.history.setMaxEntries(config.maxHistoryEntries);
        }
      }
    }
    this._recomputeTrustedFileRoots();
  }
  _ensureWindowCloseSubscription(windowId) {
    if (this._windowCloseSubscriptions.has(windowId)) {
      return;
    }
    const window = this.windowsMainService.getWindowById(windowId);
    if (!window) {
      return;
    }
    const onWindowGone = Event.any(window.onDidClose, window.onDidDestroy);
    this._windowCloseSubscriptions.set(windowId, Event.once(onWindowGone)(() => {
      this._windowCloseSubscriptions.deleteAndDispose(windowId);
      if (this._windowConfigurations.delete(windowId)) {
        this._recomputeTrustedFileRoots();
      }
    }));
  }
  _recomputeTrustedFileRoots() {
    const roots = /* @__PURE__ */ new Set();
    let trustAllFiles = false;
    for (const configuration of this._windowConfigurations.values()) {
      for (const root of configuration.trustedFileRoots) {
        roots.add(root);
      }
      trustAllFiles ||= configuration.trustAllFiles;
    }
    BrowserSession.setTrustedFileRoots([...roots], trustAllFiles);
  }
  /**
   * Create a browser view backed by the given {@link BrowserSession}.
   */
  createBrowserView(id, owner, browserSession, options) {
    if (this.browserViews.has(id)) {
      throw new Error(`Browser view with id ${id} already exists`);
    }
    browserSession.connectStorage(this.applicationStorageMainService);
    const windowConfiguration = this._windowConfigurations.get(owner.mainWindowId);
    if (typeof windowConfiguration?.maxHistoryEntries === "number") {
      browserSession.history.setMaxEntries(windowConfiguration.maxHistoryEntries);
    }
    browserSession.remote.acquire(id, windowConfiguration?.proxyInfo);
    const view = this.instantiationService.createInstance(
      BrowserView,
      id,
      owner,
      browserSession,
      // Recursive factory for nested windows (child views share the same session and owner).
      (url, electronOptions, openOptions) => {
        const child = this.createBrowserView(generateUuid(), owner, browserSession, electronOptions);
        if (url) {
          void child.loadURL(url).catch(() => {
          });
        }
        const info = this._getViewInfo(child);
        this._onDidCreateBrowserView.fire({
          info: url ? { ...info, state: { ...info.state, url } } : info,
          openOptions
        });
        return child;
      },
      (v, params) => this.showContextMenu(v, params),
      options
    );
    this.browserViews.set(id, view);
    if (windowConfiguration?.theme) {
      view.inspector.setTheme(windowConfiguration.theme);
    }
    Event.once(view.onDidClose)(() => {
      browserSession.remote.release(id);
      this.browserViews.deleteAndDispose(id);
    });
    return view;
  }
  async openNew(url, {
    owner,
    session,
    openOptions,
    source
  }) {
    const targetId = generateUuid();
    const view = this.createBrowserView(targetId, owner, session || BrowserSession.getOrCreateEphemeral(this.instantiationService, targetId));
    if (url) {
      void view.loadURL(url).catch(() => {
      });
    }
    logBrowserOpen(this.telemetryService, source);
    const info = this._getViewInfo(view);
    this._onDidCreateBrowserView.fire({
      info: url ? { ...info, state: { ...info.state, url } } : info,
      openOptions
    });
    return view;
  }
  async showContextMenu(view, params) {
    const win = view.getElectronWindow();
    if (!win) {
      return;
    }
    const webContents = view.webContents;
    if (webContents.isDestroyed()) {
      return;
    }
    const windowConfiguration = this._windowConfigurations.get(view.owner.mainWindowId);
    const inspectTarget = windowConfiguration?.aiFeaturesDisabled ? void 0 : params.frame && await view.inspector.getElementHandle(BrowserViewInspectElementId.ContextMenuTarget, params.frame);
    const menu = new Menu();
    if (params.linkURL) {
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.openLinkInNewTab", "Open Link in New Tab"),
        click: () => {
          void this.openNew(params.linkURL, {
            owner: view.owner,
            session: view.session,
            openOptions: { preserveFocus: true, background: true },
            source: "browserLinkBackground"
          });
        }
      }));
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.openLinkInExternalBrowser", "Open Link in External Browser"),
        click: () => {
          void this.nativeHostMainService.openExternal(void 0, params.linkURL);
        }
      }));
      menu.append(new MenuItem({ type: "separator" }));
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.copyLink", "Copy Link"),
        click: () => {
          clipboard.write({
            text: params.linkURL,
            html: `<a href="${encodeURI(params.linkURL)}">${htmlAttributeEncodeValue(params.linkText || params.linkURL)}</a>`
          });
        }
      }));
    }
    if (params.hasImageContents && params.srcURL) {
      if (menu.items.length > 0) {
        menu.append(new MenuItem({ type: "separator" }));
      }
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.openImageInNewTab", "Open Image in New Tab"),
        click: () => {
          void this.openNew(params.srcURL, {
            owner: view.owner,
            session: view.session,
            openOptions: { preserveFocus: true, background: true },
            source: "browserLinkBackground"
          });
        }
      }));
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.copyImage", "Copy Image"),
        click: () => {
          view.webContents.copyImageAt(params.x, params.y);
        }
      }));
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.copyImageUrl", "Copy Image URL"),
        click: () => {
          clipboard.writeText(params.srcURL);
        }
      }));
    }
    if (params.isEditable) {
      menu.append(new MenuItem({ role: "cut", enabled: params.editFlags.canCut }));
      menu.append(new MenuItem({ role: "copy", enabled: params.editFlags.canCopy }));
      menu.append(new MenuItem({ role: "paste", enabled: params.editFlags.canPaste }));
      menu.append(new MenuItem({ role: "pasteAndMatchStyle", enabled: params.editFlags.canPaste }));
      menu.append(new MenuItem({ role: "selectAll", enabled: params.editFlags.canSelectAll }));
    } else if (params.selectionText) {
      menu.append(new MenuItem({ role: "copy" }));
    }
    if (menu.items.length === 0) {
      if (webContents.navigationHistory.canGoBack()) {
        menu.append(new MenuItem({
          label: localize("browser.contextMenu.back", "Back"),
          accelerator: windowConfiguration?.keybindings[BrowserViewCommandId.GoBack],
          click: () => webContents.navigationHistory.goBack()
        }));
      }
      if (webContents.navigationHistory.canGoForward()) {
        menu.append(new MenuItem({
          label: localize("browser.contextMenu.forward", "Forward"),
          accelerator: windowConfiguration?.keybindings[BrowserViewCommandId.GoForward],
          click: () => webContents.navigationHistory.goForward()
        }));
      }
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.reload", "Reload"),
        accelerator: windowConfiguration?.keybindings[BrowserViewCommandId.Reload],
        click: () => webContents.reload()
      }));
    }
    if (inspectTarget) {
      menu.append(new MenuItem({ type: "separator" }));
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.addElementToChat", "Add Element to Chat"),
        click: () => inspectTarget.addToChat()
      }));
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.addComment", "Add Comment..."),
        click: () => inspectTarget.addComment()
      }));
      void inspectTarget.highlight().catch(() => {
      });
      menu.on("menu-will-close", () => inspectTarget.dispose());
    }
    menu.append(new MenuItem({ type: "separator" }));
    menu.append(new MenuItem({
      label: localize("browser.contextMenu.inspect", "Inspect"),
      click: () => webContents.inspectElement(params.x, params.y)
    }));
    const viewBounds = view.getWebContentsView().getBounds();
    menu.popup({
      window: win,
      x: viewBounds.x + params.x,
      y: viewBounds.y + params.y,
      sourceType: params.menuSourceType
    });
  }
};
BrowserViewMainService = __decorateClass([
  __decorateParam(0, IEnvironmentMainService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IWindowsMainService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, INativeHostMainService),
  __decorateParam(5, IApplicationStorageMainService)
], BrowserViewMainService);
export {
  BrowserViewMainService,
  IBrowserViewMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLW1haW4vYnJvd3NlclZpZXdNYWluU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlckVsZW1lbnRDb21tZW50c1VwZGF0ZSwgSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucywgSUJyb3dzZXJWaWV3Qm91bmRzLCBJQnJvd3NlclZpZXdTdGF0ZSwgSUJyb3dzZXJWaWV3U2VydmljZSwgSUJyb3dzZXJWaWV3Q2FwdHVyZVNjcmVlbnNob3RPcHRpb25zLCBJQnJvd3NlclZpZXdGaW5kSW5QYWdlT3B0aW9ucywgQnJvd3NlclZpZXdDb21tYW5kSWQsIElCcm93c2VyVmlld093bmVyLCBJQnJvd3NlclZpZXdJbmZvLCBJQnJvd3NlclZpZXdDcmVhdGVkRXZlbnQsIElCcm93c2VyVmlld09wZW5PcHRpb25zLCBJQnJvd3NlclZpZXdDcmVhdGVPcHRpb25zLCBJQnJvd3NlclZpZXdXaW5kb3dDb25maWd1cmF0aW9uLCBJQnJvd3NlckRldmljZVByb2ZpbGUgfSBmcm9tICcuLi9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgY2xpcGJvYXJkLCBNZW51LCBNZW51SXRlbSB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvZWxlY3Ryb24tbWFpbi9lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVmlldyB9IGZyb20gJy4vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJV2luZG93c01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd2luZG93cy9lbGVjdHJvbi1tYWluL3dpbmRvd3MuanMnO1xuaW1wb3J0IHsgQnJvd3NlclNlc3Npb24gfSBmcm9tICcuL2Jyb3dzZXJTZXNzaW9uLmpzJztcbmltcG9ydCB7IElBcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvZWxlY3Ryb24tbWFpbi9zdG9yYWdlTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBlcm1pc3Npb25DYXRlZ29yeVN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL2Jyb3dzZXJQZXJtaXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBJbnRlZ3JhdGVkQnJvd3Nlck9wZW5Tb3VyY2UsIGxvZ0Jyb3dzZXJPcGVuIH0gZnJvbSAnLi4vY29tbW9uL2Jyb3dzZXJWaWV3VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUhvc3RNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL25hdGl2ZS9lbGVjdHJvbi1tYWluL25hdGl2ZUhvc3RNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBodG1sQXR0cmlidXRlRW5jb2RlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3SW5zcGVjdEVsZW1lbnRJZCB9IGZyb20gJy4vYnJvd3NlclZpZXdJbnNwZWN0b3IuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5cbmV4cG9ydCBjb25zdCBJQnJvd3NlclZpZXdNYWluU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQnJvd3NlclZpZXdNYWluU2VydmljZT4oJ2Jyb3dzZXJWaWV3TWFpblNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQnJvd3NlclZpZXdNYWluU2VydmljZSBleHRlbmRzIElCcm93c2VyVmlld1NlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0dHJ5R2V0QnJvd3NlclZpZXcoaWQ6IHN0cmluZyk6IEJyb3dzZXJWaWV3IHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBDcmVhdGUgYSBuZXcgdGFyZ2V0IGFuZCByZXR1cm4gaXQuICovXG5cdGNyZWF0ZVRhcmdldCh1cmw6IHN0cmluZywgb3duZXI6IElCcm93c2VyVmlld093bmVyLCBicm93c2VyQ29udGV4dElkPzogc3RyaW5nKTogUHJvbWlzZTxCcm93c2VyVmlldz47XG59XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyVmlld01haW5TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElCcm93c2VyVmlld01haW5TZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIENoZWNrIGlmIGEgd2ViQ29udGVudHMgYmVsb25ncyB0byBhbiBpbnRlZ3JhdGVkIGJyb3dzZXIgdmlldy5cblx0ICogRGVsZWdhdGVzIHRvIHtAbGluayBCcm93c2VyU2Vzc2lvbi5pc0Jyb3dzZXJWaWV3V2ViQ29udGVudHN9LlxuXHQgKi9cblx0c3RhdGljIGlzQnJvd3NlclZpZXdXZWJDb250ZW50cyhjb250ZW50czogRWxlY3Ryb24uV2ViQ29udGVudHMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gQnJvd3NlclNlc3Npb24uaXNCcm93c2VyVmlld1dlYkNvbnRlbnRzKGNvbnRlbnRzKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgYnJvd3NlclZpZXdzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBCcm93c2VyVmlldz4oKSk7XG5cblx0LyoqXG5cdCAqIFBlci13aW5kb3cgY29uZmlndXJhdGlvbiBhcHBsaWVkIHRvIHRoZSBicm93c2VyIHZpZXdzIHRoYXQgd2luZG93IG93bnMuXG5cdCAqIEVudHJpZXMgYXJlIGRyb3BwZWQgd2hlbiB0aGUgd2luZG93IGlzIGRlc3Ryb3llZC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dpbmRvd0NvbmZpZ3VyYXRpb25zID0gbmV3IE1hcDxudW1iZXIsIElCcm93c2VyVmlld1dpbmRvd0NvbmZpZ3VyYXRpb24+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dpbmRvd0Nsb3NlU3Vic2NyaXB0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlcj4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDcmVhdGVCcm93c2VyVmlldyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElCcm93c2VyVmlld0NyZWF0ZWRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ3JlYXRlQnJvd3NlclZpZXc6IEV2ZW50PElCcm93c2VyVmlld0NyZWF0ZWRFdmVudD4gPSB0aGlzLl9vbkRpZENyZWF0ZUJyb3dzZXJWaWV3LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRW52aXJvbm1lbnRNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50TWFpblNlcnZpY2U6IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV2luZG93c01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd2luZG93c01haW5TZXJ2aWNlOiBJV2luZG93c01haW5TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdE1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmF0aXZlSG9zdE1haW5TZXJ2aWNlOiBJTmF0aXZlSG9zdE1haW5TZXJ2aWNlLFxuXHRcdEBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZTogSUFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBnZXRPckNyZWF0ZUJyb3dzZXJWaWV3KGlkOiBzdHJpbmcsIG9wdGlvbnM6IElCcm93c2VyVmlld0NyZWF0ZU9wdGlvbnMpOiBQcm9taXNlPElCcm93c2VyVmlld1N0YXRlPiB7XG5cdFx0aWYgKHRoaXMuYnJvd3NlclZpZXdzLmhhcyhpZCkpIHtcblx0XHRcdC8vIE5vdGU6IG9wdGlvbnMgd2lsbCBiZSBpZ25vcmVkIGlmIHRoZSB2aWV3IGFscmVhZHkgZXhpc3RzLlxuXHRcdFx0Y29uc3QgdmlldyA9IHRoaXMuYnJvd3NlclZpZXdzLmdldChpZCkhO1xuXHRcdFx0cmV0dXJuIHZpZXcuZ2V0U3RhdGUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBvd25lcldpbmRvdyA9IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0J5SWQob3B0aW9ucy5vd25lci5tYWluV2luZG93SWQpO1xuXHRcdGlmICghb3duZXJXaW5kb3cpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgT3duZXIgd2luZG93IHdpdGggSUQgJHtvcHRpb25zLm93bmVyLm1haW5XaW5kb3dJZH0gbm90IGZvdW5kYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnJvd3NlclNlc3Npb24gPSBCcm93c2VyU2Vzc2lvbi5nZXRPckNyZWF0ZShcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRpZCxcblx0XHRcdG9wdGlvbnMuc2Vzc2lvbk9wdGlvbnMsXG5cdFx0XHR0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2Uud29ya3NwYWNlU3RvcmFnZUhvbWUsXG5cdFx0XHRvd25lcldpbmRvdy5vcGVuZWRXb3Jrc3BhY2U/LmlkXG5cdFx0KTtcblxuXHRcdGNvbnN0IHZpZXcgPSB0aGlzLmNyZWF0ZUJyb3dzZXJWaWV3KGlkLCBvcHRpb25zLm93bmVyLCBicm93c2VyU2Vzc2lvbik7XG5cblx0XHRpZiAob3B0aW9ucy5pbml0aWFsU3RhdGU/LnVybCkge1xuXHRcdFx0dm9pZCB2aWV3LmxvYWRVUkwob3B0aW9ucy5pbml0aWFsU3RhdGUudXJsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4udmlldy5nZXRTdGF0ZSgpLFxuXHRcdFx0Li4ub3B0aW9ucy5pbml0aWFsU3RhdGVcblx0XHR9O1xuXHR9XG5cblx0dHJ5R2V0QnJvd3NlclZpZXcoaWQ6IHN0cmluZyk6IEJyb3dzZXJWaWV3IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld3MuZ2V0KGlkKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVRhcmdldCh1cmw6IHN0cmluZywgb3duZXI6IElCcm93c2VyVmlld093bmVyLCBicm93c2VyQ29udGV4dElkPzogc3RyaW5nKTogUHJvbWlzZTxCcm93c2VyVmlldz4ge1xuXHRcdGNvbnN0IGJyb3dzZXJTZXNzaW9uID0gYnJvd3NlckNvbnRleHRJZCA/IEJyb3dzZXJTZXNzaW9uLmdldChicm93c2VyQ29udGV4dElkKSA6IHVuZGVmaW5lZDtcblxuXHRcdHJldHVybiB0aGlzLm9wZW5OZXcodXJsLCB7XG5cdFx0XHRvd25lcixcblx0XHRcdHNlc3Npb246IGJyb3dzZXJTZXNzaW9uLFxuXHRcdFx0b3Blbk9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9LFxuXHRcdFx0c291cmNlOiAnY2RwQ3JlYXRlZCdcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgYSBicm93c2VyIHZpZXcgb3IgdGhyb3cgaWYgbm90IGZvdW5kXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRCcm93c2VyVmlldyhpZDogc3RyaW5nKTogQnJvd3NlclZpZXcge1xuXHRcdGNvbnN0IHZpZXcgPSB0aGlzLmJyb3dzZXJWaWV3cy5nZXQoaWQpO1xuXHRcdGlmICghdmlldykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBCcm93c2VyIHZpZXcgJHtpZH0gbm90IGZvdW5kYCk7XG5cdFx0fVxuXHRcdHJldHVybiB2aWV3O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Vmlld0luZm8odmlldzogQnJvd3NlclZpZXcpOiBJQnJvd3NlclZpZXdJbmZvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHZpZXcuaWQsXG5cdFx0XHRvd25lcjogdmlldy5vd25lcixcblx0XHRcdHN0YXRlOiB2aWV3LmdldFN0YXRlKClcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZ2V0QnJvd3NlclZpZXdzKHdpbmRvd0lkPzogbnVtYmVyKTogUHJvbWlzZTxJQnJvd3NlclZpZXdJbmZvW10+IHtcblx0XHRjb25zdCByZXN1bHQ6IElCcm93c2VyVmlld0luZm9bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgWywgdmlld10gb2YgdGhpcy5icm93c2VyVmlld3MpIHtcblx0XHRcdGlmICh3aW5kb3dJZCAhPT0gdW5kZWZpbmVkICYmIHZpZXcub3duZXIubWFpbldpbmRvd0lkICE9PSB3aW5kb3dJZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuX2dldFZpZXdJbmZvKHZpZXcpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdG9uRHluYW1pY0RpZE5hdmlnYXRlKGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLm9uRGlkTmF2aWdhdGU7XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRDaGFuZ2VMb2FkaW5nU3RhdGUoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkub25EaWRDaGFuZ2VMb2FkaW5nU3RhdGU7XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRDaGFuZ2VGb2N1cyhpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5vbkRpZENoYW5nZUZvY3VzO1xuXHR9XG5cblx0b25EeW5hbWljRGlkQ2hhbmdlVmlzaWJpbGl0eShpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5vbkRpZENoYW5nZVZpc2liaWxpdHk7XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRDaGFuZ2VEZXZUb29sc1N0YXRlKGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLm9uRGlkQ2hhbmdlRGV2VG9vbHNTdGF0ZTtcblx0fVxuXG5cdG9uRHluYW1pY0RpZEtleUNvbW1hbmQoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkub25EaWRLZXlDb21tYW5kO1xuXHR9XG5cblx0b25EeW5hbWljRGlkQ2hhbmdlVGl0bGUoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkub25EaWRDaGFuZ2VUaXRsZTtcblx0fVxuXG5cdG9uRHluYW1pY0RpZENoYW5nZUZhdmljb24oaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkub25EaWRDaGFuZ2VGYXZpY29uO1xuXHR9XG5cblx0b25EeW5hbWljRGlkRmluZEluUGFnZShpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5vbkRpZEZpbmRJblBhZ2U7XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRDbG9zZShpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5vbkRpZENsb3NlO1xuXHR9XG5cblx0b25EeW5hbWljRGlkU2VsZWN0RWxlbWVudChpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5pbnNwZWN0b3Iub25EaWRTZWxlY3RFbGVtZW50O1xuXHR9XG5cblx0b25EeW5hbWljRGlkUmVtb3ZlRWxlbWVudENvbW1lbnQoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuaW5zcGVjdG9yLm9uRGlkUmVtb3ZlRWxlbWVudENvbW1lbnQ7XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRDaGFuZ2VFbGVtZW50U2VsZWN0aW9uU3RhdGUoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuaW5zcGVjdG9yLm9uRGlkQ2hhbmdlRWxlbWVudFNlbGVjdGlvblN0YXRlO1xuXHR9XG5cblx0b25EeW5hbWljRGlkUGlja0FyZWEoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuaW5zcGVjdG9yLm9uRGlkUGlja0FyZWE7XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRDaGFuZ2VBcmVhU2VsZWN0aW9uQWN0aXZlKGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLmluc3BlY3Rvci5vbkRpZENoYW5nZUFyZWFTZWxlY3Rpb25BY3RpdmU7XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRDaGFuZ2VEZXZpY2VFbXVsYXRpb24oaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuZW11bGF0b3Iub25EaWRDaGFuZ2U7XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRDaGFuZ2VSZW1vdGVTdGF0dXMoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkub25EaWRDaGFuZ2VSZW1vdGVTdGF0dXM7XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRSZXF1ZXN0UGVybWlzc2lvbihpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5vbkRpZFJlcXVlc3RQZXJtaXNzaW9uO1xuXHR9XG5cblx0b25EeW5hbWljRGlkQ2hhbmdlUGVybWlzc2lvbnMoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkub25EaWRDaGFuZ2VQZXJtaXNzaW9ucztcblx0fVxuXG5cdGFzeW5jIGdldFN0YXRlKGlkOiBzdHJpbmcpOiBQcm9taXNlPElCcm93c2VyVmlld1N0YXRlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5nZXRTdGF0ZSgpO1xuXHR9XG5cblx0YXN5bmMgZGVzdHJveUJyb3dzZXJWaWV3KGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld3MuZGVsZXRlQW5kRGlzcG9zZShpZCk7XG5cdH1cblxuXHRhc3luYyBsYXlvdXQoaWQ6IHN0cmluZywgYm91bmRzOiBJQnJvd3NlclZpZXdCb3VuZHMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLmxheW91dChib3VuZHMpO1xuXHR9XG5cblx0YXN5bmMgc2V0VmlzaWJsZShpZDogc3RyaW5nLCB2aXNpYmxlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5zZXRWaXNpYmxlKHZpc2libGUpO1xuXHR9XG5cblx0YXN5bmMgbG9hZFVSTChpZDogc3RyaW5nLCB1cmw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkubG9hZFVSTCh1cmwpO1xuXHR9XG5cblx0YXN5bmMgZ2V0VVJMKGlkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuZ2V0VVJMKCk7XG5cdH1cblxuXHRhc3luYyBnb0JhY2soaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuZ29CYWNrKCk7XG5cdH1cblxuXHRhc3luYyBnb0ZvcndhcmQoaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuZ29Gb3J3YXJkKCk7XG5cdH1cblxuXHRhc3luYyByZWxvYWQoaWQ6IHN0cmluZywgaGFyZD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLnJlbG9hZChoYXJkKTtcblx0fVxuXG5cdGFzeW5jIHRvZ2dsZURldlRvb2xzKGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLnRvZ2dsZURldlRvb2xzKCk7XG5cdH1cblxuXHRhc3luYyBjYW5Hb0JhY2soaWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuY2FuR29CYWNrKCk7XG5cdH1cblxuXHRhc3luYyBjYW5Hb0ZvcndhcmQoaWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuY2FuR29Gb3J3YXJkKCk7XG5cdH1cblxuXHRhc3luYyBjYXB0dXJlU2NyZWVuc2hvdChpZDogc3RyaW5nLCBvcHRpb25zPzogSUJyb3dzZXJWaWV3Q2FwdHVyZVNjcmVlbnNob3RPcHRpb25zKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuY2FwdHVyZVNjcmVlbnNob3Qob3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBmb2N1cyhpZDogc3RyaW5nLCBmb3JjZT86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLmZvY3VzKGZvcmNlKTtcblx0fVxuXG5cdGFzeW5jIGZpbmRJblBhZ2UoaWQ6IHN0cmluZywgdGV4dDogc3RyaW5nLCBvcHRpb25zPzogSUJyb3dzZXJWaWV3RmluZEluUGFnZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLmZpbmRJblBhZ2UodGV4dCwgb3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBzdG9wRmluZEluUGFnZShpZDogc3RyaW5nLCBrZWVwU2VsZWN0aW9uPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuc3RvcEZpbmRJblBhZ2Uoa2VlcFNlbGVjdGlvbik7XG5cdH1cblxuXHRhc3luYyBnZXRTZWxlY3RlZFRleHQoaWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5nZXRTZWxlY3RlZFRleHQoKTtcblx0fVxuXG5cdGFzeW5jIGNsZWFyU3RvcmFnZShpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5jbGVhclN0b3JhZ2UoKTtcblx0fVxuXG5cdGFzeW5jIHNldEJyb3dzZXJab29tSW5kZXgoaWQ6IHN0cmluZywgem9vbUluZGV4OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLnNldEJyb3dzZXJab29tSW5kZXgoem9vbUluZGV4KTtcblx0fVxuXG5cdGFzeW5jIHNldERldmljZUVtdWxhdGlvbihpZDogc3RyaW5nLCBkZXZpY2U6IElCcm93c2VyRGV2aWNlUHJvZmlsZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuZW11bGF0b3Iuc2V0RGV2aWNlKGRldmljZSk7XG5cdH1cblxuXHRhc3luYyB0cnVzdENlcnRpZmljYXRlKGlkOiBzdHJpbmcsIGhvc3Q6IHN0cmluZywgZmluZ2VycHJpbnQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkudHJ1c3RDZXJ0aWZpY2F0ZShob3N0LCBmaW5nZXJwcmludCk7XG5cdH1cblxuXHRhc3luYyB1bnRydXN0Q2VydGlmaWNhdGUoaWQ6IHN0cmluZywgaG9zdDogc3RyaW5nLCBmaW5nZXJwcmludDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS51bnRydXN0Q2VydGlmaWNhdGUoaG9zdCwgZmluZ2VycHJpbnQpO1xuXHR9XG5cblx0YXN5bmMgZGVsZXRlQnJvd3Nlckhpc3RvcnkoaWQ6IHN0cmluZywgZW50cnlJZHM/OiByZWFkb25seSBudW1iZXJbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5zZXNzaW9uLmhpc3RvcnkuZGVsZXRlKGVudHJ5SWRzKTtcblx0fVxuXG5cdGFzeW5jIHNldFBlcm1pc3Npb25zKGlkOiBzdHJpbmcsIG9yaWdpbjogc3RyaW5nLCBncmFudHM6IHJlYWRvbmx5IElQZXJtaXNzaW9uQ2F0ZWdvcnlTdGF0ZVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLnNlc3Npb24ucGVybWlzc2lvbnMuc2V0KG9yaWdpbiwgZ3JhbnRzKTtcblx0fVxuXG5cdGFzeW5jIHNlbGVjdERldmljZShpZDogc3RyaW5nLCByZXF1ZXN0SWQ6IHN0cmluZywgZGV2aWNlSWQ6IHN0cmluZyB8IG51bGwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuc2VsZWN0RGV2aWNlKHJlcXVlc3RJZCwgZGV2aWNlSWQpO1xuXHR9XG5cblx0YXN5bmMgY2xlYXJHbG9iYWxTdG9yYWdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGJyb3dzZXJTZXNzaW9uID0gQnJvd3NlclNlc3Npb24uZ2V0T3JDcmVhdGVHbG9iYWwodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0YnJvd3NlclNlc3Npb24uY29ubmVjdFN0b3JhZ2UodGhpcy5hcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSk7XG5cdFx0YXdhaXQgYnJvd3NlclNlc3Npb24uY2xlYXJEYXRhKCk7XG5cdH1cblxuXHRhc3luYyBjbGVhcldvcmtzcGFjZVN0b3JhZ2Uod29ya3NwYWNlSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGJyb3dzZXJTZXNzaW9uID0gQnJvd3NlclNlc3Npb24uZ2V0T3JDcmVhdGVXb3Jrc3BhY2UoXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0d29ya3NwYWNlSWQsXG5cdFx0XHR0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2Uud29ya3NwYWNlU3RvcmFnZUhvbWVcblx0XHQpO1xuXHRcdGJyb3dzZXJTZXNzaW9uLmNvbm5lY3RTdG9yYWdlKHRoaXMuYXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UpO1xuXHRcdGF3YWl0IGJyb3dzZXJTZXNzaW9uLmNsZWFyRGF0YSgpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29uc29sZUxvZ3MoaWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5nZXRDb25zb2xlTG9ncygpO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlRWxlbWVudFNlbGVjdGlvbihpZDogc3RyaW5nLCBlbmFibGVkPzogYm9vbGVhbiwgb3B0aW9ucz86IElCcm93c2VyRWxlbWVudFNlbGVjdGlvbk9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLmluc3BlY3Rvci50b2dnbGVFbGVtZW50U2VsZWN0aW9uKGVuYWJsZWQsIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgc2V0RWxlbWVudENvbW1lbnRzKGlkOiBzdHJpbmcsIHVwZGF0ZTogSUJyb3dzZXJFbGVtZW50Q29tbWVudHNVcGRhdGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuaW5zcGVjdG9yLnNldEVsZW1lbnRDb21tZW50cyh1cGRhdGUpO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlQXJlYVNlbGVjdGlvbihpZDogc3RyaW5nLCBlbmFibGVkPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuaW5zcGVjdG9yLnRvZ2dsZUFyZWFTZWxlY3Rpb24oZW5hYmxlZCk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVXaW5kb3dDb25maWd1cmF0aW9uKHdpbmRvd0lkOiBudW1iZXIsIGNvbmZpZzogSUJyb3dzZXJWaWV3V2luZG93Q29uZmlndXJhdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9sZENvbmZpZyA9IHRoaXMuX3dpbmRvd0NvbmZpZ3VyYXRpb25zLmdldCh3aW5kb3dJZCk7XG5cdFx0Y29uc3QgZGlkVGhlbWVDaGFuZ2UgPSAhZXF1YWxzKG9sZENvbmZpZz8udGhlbWUsIGNvbmZpZy50aGVtZSk7XG5cdFx0Y29uc3QgZGlkUHJveHlDaGFuZ2UgPSAhZXF1YWxzKG9sZENvbmZpZz8ucHJveHlJbmZvLCBjb25maWcucHJveHlJbmZvKTtcblxuXHRcdHRoaXMuX3dpbmRvd0NvbmZpZ3VyYXRpb25zLnNldCh3aW5kb3dJZCwgY29uZmlnKTtcblx0XHR0aGlzLl9lbnN1cmVXaW5kb3dDbG9zZVN1YnNjcmlwdGlvbih3aW5kb3dJZCk7XG5cblx0XHRmb3IgKGNvbnN0IFssIHZpZXddIG9mIHRoaXMuYnJvd3NlclZpZXdzKSB7XG5cdFx0XHRpZiAodmlldy5vd25lci5tYWluV2luZG93SWQgPT09IHdpbmRvd0lkKSB7XG5cdFx0XHRcdGlmIChkaWRUaGVtZUNoYW5nZSkge1xuXHRcdFx0XHRcdHZpZXcuaW5zcGVjdG9yLnNldFRoZW1lKGNvbmZpZy50aGVtZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGRpZFByb3h5Q2hhbmdlKSB7XG5cdFx0XHRcdFx0dmlldy5zZXNzaW9uLnJlbW90ZS5hY3F1aXJlKHZpZXcuaWQsIGNvbmZpZy5wcm94eUluZm8pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0eXBlb2YgY29uZmlnLm1heEhpc3RvcnlFbnRyaWVzID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHZpZXcuc2Vzc2lvbi5oaXN0b3J5LnNldE1heEVudHJpZXMoY29uZmlnLm1heEhpc3RvcnlFbnRyaWVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3JlY29tcHV0ZVRydXN0ZWRGaWxlUm9vdHMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZVdpbmRvd0Nsb3NlU3Vic2NyaXB0aW9uKHdpbmRvd0lkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd2luZG93Q2xvc2VTdWJzY3JpcHRpb25zLmhhcyh3aW5kb3dJZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93QnlJZCh3aW5kb3dJZCk7XG5cdFx0aWYgKCF3aW5kb3cpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgb25XaW5kb3dHb25lID0gRXZlbnQuYW55KHdpbmRvdy5vbkRpZENsb3NlLCB3aW5kb3cub25EaWREZXN0cm95KTtcblx0XHR0aGlzLl93aW5kb3dDbG9zZVN1YnNjcmlwdGlvbnMuc2V0KHdpbmRvd0lkLCBFdmVudC5vbmNlKG9uV2luZG93R29uZSkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fd2luZG93Q2xvc2VTdWJzY3JpcHRpb25zLmRlbGV0ZUFuZERpc3Bvc2Uod2luZG93SWQpO1xuXHRcdFx0aWYgKHRoaXMuX3dpbmRvd0NvbmZpZ3VyYXRpb25zLmRlbGV0ZSh3aW5kb3dJZCkpIHtcblx0XHRcdFx0dGhpcy5fcmVjb21wdXRlVHJ1c3RlZEZpbGVSb290cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlY29tcHV0ZVRydXN0ZWRGaWxlUm9vdHMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgcm9vdHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRsZXQgdHJ1c3RBbGxGaWxlcyA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgY29uZmlndXJhdGlvbiBvZiB0aGlzLl93aW5kb3dDb25maWd1cmF0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCByb290IG9mIGNvbmZpZ3VyYXRpb24udHJ1c3RlZEZpbGVSb290cykge1xuXHRcdFx0XHRyb290cy5hZGQocm9vdCk7XG5cdFx0XHR9XG5cdFx0XHR0cnVzdEFsbEZpbGVzIHx8PSBjb25maWd1cmF0aW9uLnRydXN0QWxsRmlsZXM7XG5cdFx0fVxuXHRcdEJyb3dzZXJTZXNzaW9uLnNldFRydXN0ZWRGaWxlUm9vdHMoWy4uLnJvb3RzXSwgdHJ1c3RBbGxGaWxlcyk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgYnJvd3NlciB2aWV3IGJhY2tlZCBieSB0aGUgZ2l2ZW4ge0BsaW5rIEJyb3dzZXJTZXNzaW9ufS5cblx0ICovXG5cdHByaXZhdGUgY3JlYXRlQnJvd3NlclZpZXcoaWQ6IHN0cmluZywgb3duZXI6IElCcm93c2VyVmlld093bmVyLCBicm93c2VyU2Vzc2lvbjogQnJvd3NlclNlc3Npb24sIG9wdGlvbnM/OiBFbGVjdHJvbi5XZWJDb250ZW50c1ZpZXdDb25zdHJ1Y3Rvck9wdGlvbnMpOiBCcm93c2VyVmlldyB7XG5cdFx0aWYgKHRoaXMuYnJvd3NlclZpZXdzLmhhcyhpZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQnJvd3NlciB2aWV3IHdpdGggaWQgJHtpZH0gYWxyZWFkeSBleGlzdHNgKTtcblx0XHR9XG5cblx0XHRicm93c2VyU2Vzc2lvbi5jb25uZWN0U3RvcmFnZSh0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlKTtcblx0XHRjb25zdCB3aW5kb3dDb25maWd1cmF0aW9uID0gdGhpcy5fd2luZG93Q29uZmlndXJhdGlvbnMuZ2V0KG93bmVyLm1haW5XaW5kb3dJZCk7XG5cdFx0aWYgKHR5cGVvZiB3aW5kb3dDb25maWd1cmF0aW9uPy5tYXhIaXN0b3J5RW50cmllcyA9PT0gJ251bWJlcicpIHtcblx0XHRcdGJyb3dzZXJTZXNzaW9uLmhpc3Rvcnkuc2V0TWF4RW50cmllcyh3aW5kb3dDb25maWd1cmF0aW9uLm1heEhpc3RvcnlFbnRyaWVzKTtcblx0XHR9XG5cblx0XHQvLyBIb2xkIGEgcmVmIHRvIHRoZSB0dW5uZWwgcHJveHkgZm9yIGFzIGxvbmcgYXMgdGhpcyB2aWV3IGlzIGFsaXZlLlxuXHRcdGJyb3dzZXJTZXNzaW9uLnJlbW90ZS5hY3F1aXJlKGlkLCB3aW5kb3dDb25maWd1cmF0aW9uPy5wcm94eUluZm8pO1xuXG5cdFx0Y29uc3QgdmlldyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRCcm93c2VyVmlldyxcblx0XHRcdGlkLFxuXHRcdFx0b3duZXIsXG5cdFx0XHRicm93c2VyU2Vzc2lvbixcblx0XHRcdC8vIFJlY3Vyc2l2ZSBmYWN0b3J5IGZvciBuZXN0ZWQgd2luZG93cyAoY2hpbGQgdmlld3Mgc2hhcmUgdGhlIHNhbWUgc2Vzc2lvbiBhbmQgb3duZXIpLlxuXHRcdFx0KHVybCwgZWxlY3Ryb25PcHRpb25zLCBvcGVuT3B0aW9ucykgPT4ge1xuXHRcdFx0XHRjb25zdCBjaGlsZCA9IHRoaXMuY3JlYXRlQnJvd3NlclZpZXcoZ2VuZXJhdGVVdWlkKCksIG93bmVyLCBicm93c2VyU2Vzc2lvbiwgZWxlY3Ryb25PcHRpb25zKTtcblxuXHRcdFx0XHRpZiAodXJsKSB7XG5cdFx0XHRcdFx0dm9pZCBjaGlsZC5sb2FkVVJMKHVybCkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl9nZXRWaWV3SW5mbyhjaGlsZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ3JlYXRlQnJvd3NlclZpZXcuZmlyZSh7XG5cdFx0XHRcdFx0aW5mbzogdXJsID8geyAuLi5pbmZvLCBzdGF0ZTogeyAuLi5pbmZvLnN0YXRlLCB1cmwgfSB9IDogaW5mbyxcblx0XHRcdFx0XHRvcGVuT3B0aW9uc1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRyZXR1cm4gY2hpbGQ7XG5cdFx0XHR9LFxuXHRcdFx0KHYsIHBhcmFtcykgPT4gdGhpcy5zaG93Q29udGV4dE1lbnUodiwgcGFyYW1zKSxcblx0XHRcdG9wdGlvbnNcblx0XHQpO1xuXHRcdHRoaXMuYnJvd3NlclZpZXdzLnNldChpZCwgdmlldyk7XG5cdFx0aWYgKHdpbmRvd0NvbmZpZ3VyYXRpb24/LnRoZW1lKSB7XG5cdFx0XHR2aWV3Lmluc3BlY3Rvci5zZXRUaGVtZSh3aW5kb3dDb25maWd1cmF0aW9uLnRoZW1lKTtcblx0XHR9XG5cblx0XHRFdmVudC5vbmNlKHZpZXcub25EaWRDbG9zZSkoKCkgPT4ge1xuXHRcdFx0YnJvd3NlclNlc3Npb24ucmVtb3RlLnJlbGVhc2UoaWQpO1xuXHRcdFx0dGhpcy5icm93c2VyVmlld3MuZGVsZXRlQW5kRGlzcG9zZShpZCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdmlldztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3Blbk5ldyhcblx0XHR1cmw6IHN0cmluZyxcblx0XHR7XG5cdFx0XHRvd25lcixcblx0XHRcdHNlc3Npb24sXG5cdFx0XHRvcGVuT3B0aW9ucyxcblx0XHRcdHNvdXJjZVxuXHRcdH06IHtcblx0XHRcdG93bmVyOiBJQnJvd3NlclZpZXdPd25lcjtcblx0XHRcdHNlc3Npb246IEJyb3dzZXJTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdFx0b3Blbk9wdGlvbnM6IElCcm93c2VyVmlld09wZW5PcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRcdFx0c291cmNlOiBJbnRlZ3JhdGVkQnJvd3Nlck9wZW5Tb3VyY2U7XG5cdFx0fVxuXHQpOiBQcm9taXNlPEJyb3dzZXJWaWV3PiB7XG5cdFx0Y29uc3QgdGFyZ2V0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCB2aWV3ID0gdGhpcy5jcmVhdGVCcm93c2VyVmlldyh0YXJnZXRJZCwgb3duZXIsIHNlc3Npb24gfHwgQnJvd3NlclNlc3Npb24uZ2V0T3JDcmVhdGVFcGhlbWVyYWwodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGFyZ2V0SWQpKTtcblxuXHRcdGlmICh1cmwpIHtcblx0XHRcdHZvaWQgdmlldy5sb2FkVVJMKHVybCkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHR9XG5cblx0XHRsb2dCcm93c2VyT3Blbih0aGlzLnRlbGVtZXRyeVNlcnZpY2UsIHNvdXJjZSk7XG5cblx0XHQvLyBGaXJlIGNyZWF0aW9uIGV2ZW50IHNvIHRoZSB3b3JrYmVuY2ggY2FuIG9wZW4gYW4gZWRpdG9yIHRhYlxuXHRcdGNvbnN0IGluZm8gPSB0aGlzLl9nZXRWaWV3SW5mbyh2aWV3KTtcblx0XHR0aGlzLl9vbkRpZENyZWF0ZUJyb3dzZXJWaWV3LmZpcmUoe1xuXHRcdFx0aW5mbzogdXJsID8geyAuLi5pbmZvLCBzdGF0ZTogeyAuLi5pbmZvLnN0YXRlLCB1cmwgfSB9IDogaW5mbyxcblx0XHRcdG9wZW5PcHRpb25zXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdmlldztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0NvbnRleHRNZW51KHZpZXc6IEJyb3dzZXJWaWV3LCBwYXJhbXM6IEVsZWN0cm9uLkNvbnRleHRNZW51UGFyYW1zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luID0gdmlldy5nZXRFbGVjdHJvbldpbmRvdygpO1xuXHRcdGlmICghd2luKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHdlYkNvbnRlbnRzID0gdmlldy53ZWJDb250ZW50cztcblx0XHRpZiAod2ViQ29udGVudHMuaXNEZXN0cm95ZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpbmRvd0NvbmZpZ3VyYXRpb24gPSB0aGlzLl93aW5kb3dDb25maWd1cmF0aW9ucy5nZXQodmlldy5vd25lci5tYWluV2luZG93SWQpO1xuXHRcdGNvbnN0IGluc3BlY3RUYXJnZXQgPSB3aW5kb3dDb25maWd1cmF0aW9uPy5haUZlYXR1cmVzRGlzYWJsZWRcblx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHQ6IHBhcmFtcy5mcmFtZSAmJiBhd2FpdCB2aWV3Lmluc3BlY3Rvci5nZXRFbGVtZW50SGFuZGxlKEJyb3dzZXJWaWV3SW5zcGVjdEVsZW1lbnRJZC5Db250ZXh0TWVudVRhcmdldCwgcGFyYW1zLmZyYW1lKTtcblx0XHRjb25zdCBtZW51ID0gbmV3IE1lbnUoKTtcblxuXHRcdGlmIChwYXJhbXMubGlua1VSTCkge1xuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmNvbnRleHRNZW51Lm9wZW5MaW5rSW5OZXdUYWInLCAnT3BlbiBMaW5rIGluIE5ldyBUYWInKSxcblx0XHRcdFx0Y2xpY2s6ICgpID0+IHtcblx0XHRcdFx0XHR2b2lkIHRoaXMub3Blbk5ldyhwYXJhbXMubGlua1VSTCwge1xuXHRcdFx0XHRcdFx0b3duZXI6IHZpZXcub3duZXIsXG5cdFx0XHRcdFx0XHRzZXNzaW9uOiB2aWV3LnNlc3Npb24sXG5cdFx0XHRcdFx0XHRvcGVuT3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlLCBiYWNrZ3JvdW5kOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHRzb3VyY2U6ICdicm93c2VyTGlua0JhY2tncm91bmQnXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdG1lbnUuYXBwZW5kKG5ldyBNZW51SXRlbSh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYnJvd3Nlci5jb250ZXh0TWVudS5vcGVuTGlua0luRXh0ZXJuYWxCcm93c2VyJywgJ09wZW4gTGluayBpbiBFeHRlcm5hbCBCcm93c2VyJyksXG5cdFx0XHRcdGNsaWNrOiAoKSA9PiB7IHZvaWQgdGhpcy5uYXRpdmVIb3N0TWFpblNlcnZpY2Uub3BlbkV4dGVybmFsKHVuZGVmaW5lZCwgcGFyYW1zLmxpbmtVUkwpOyB9XG5cdFx0XHR9KSk7XG5cdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oeyB0eXBlOiAnc2VwYXJhdG9yJyB9KSk7XG5cdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIuY29udGV4dE1lbnUuY29weUxpbmsnLCAnQ29weSBMaW5rJyksXG5cdFx0XHRcdGNsaWNrOiAoKSA9PiB7XG5cdFx0XHRcdFx0Y2xpcGJvYXJkLndyaXRlKHtcblx0XHRcdFx0XHRcdHRleHQ6IHBhcmFtcy5saW5rVVJMLFxuXHRcdFx0XHRcdFx0aHRtbDogYDxhIGhyZWY9XCIke2VuY29kZVVSSShwYXJhbXMubGlua1VSTCl9XCI+JHtodG1sQXR0cmlidXRlRW5jb2RlVmFsdWUocGFyYW1zLmxpbmtUZXh0IHx8IHBhcmFtcy5saW5rVVJMKX08L2E+YFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0aWYgKHBhcmFtcy5oYXNJbWFnZUNvbnRlbnRzICYmIHBhcmFtcy5zcmNVUkwpIHtcblx0XHRcdGlmIChtZW51Lml0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHsgdHlwZTogJ3NlcGFyYXRvcicgfSkpO1xuXHRcdFx0fVxuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmNvbnRleHRNZW51Lm9wZW5JbWFnZUluTmV3VGFiJywgJ09wZW4gSW1hZ2UgaW4gTmV3IFRhYicpLFxuXHRcdFx0XHRjbGljazogKCkgPT4ge1xuXHRcdFx0XHRcdHZvaWQgdGhpcy5vcGVuTmV3KHBhcmFtcy5zcmNVUkwhLCB7XG5cdFx0XHRcdFx0XHRvd25lcjogdmlldy5vd25lcixcblx0XHRcdFx0XHRcdHNlc3Npb246IHZpZXcuc2Vzc2lvbixcblx0XHRcdFx0XHRcdG9wZW5PcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IHRydWUsIGJhY2tncm91bmQ6IHRydWUgfSxcblx0XHRcdFx0XHRcdHNvdXJjZTogJ2Jyb3dzZXJMaW5rQmFja2dyb3VuZCdcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmNvbnRleHRNZW51LmNvcHlJbWFnZScsICdDb3B5IEltYWdlJyksXG5cdFx0XHRcdGNsaWNrOiAoKSA9PiB7IHZpZXcud2ViQ29udGVudHMuY29weUltYWdlQXQocGFyYW1zLngsIHBhcmFtcy55KTsgfVxuXHRcdFx0fSkpO1xuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmNvbnRleHRNZW51LmNvcHlJbWFnZVVybCcsICdDb3B5IEltYWdlIFVSTCcpLFxuXHRcdFx0XHRjbGljazogKCkgPT4geyBjbGlwYm9hcmQud3JpdGVUZXh0KHBhcmFtcy5zcmNVUkwhKTsgfVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmIChwYXJhbXMuaXNFZGl0YWJsZSkge1xuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHsgcm9sZTogJ2N1dCcsIGVuYWJsZWQ6IHBhcmFtcy5lZGl0RmxhZ3MuY2FuQ3V0IH0pKTtcblx0XHRcdG1lbnUuYXBwZW5kKG5ldyBNZW51SXRlbSh7IHJvbGU6ICdjb3B5JywgZW5hYmxlZDogcGFyYW1zLmVkaXRGbGFncy5jYW5Db3B5IH0pKTtcblx0XHRcdG1lbnUuYXBwZW5kKG5ldyBNZW51SXRlbSh7IHJvbGU6ICdwYXN0ZScsIGVuYWJsZWQ6IHBhcmFtcy5lZGl0RmxhZ3MuY2FuUGFzdGUgfSkpO1xuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHsgcm9sZTogJ3Bhc3RlQW5kTWF0Y2hTdHlsZScsIGVuYWJsZWQ6IHBhcmFtcy5lZGl0RmxhZ3MuY2FuUGFzdGUgfSkpO1xuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHsgcm9sZTogJ3NlbGVjdEFsbCcsIGVuYWJsZWQ6IHBhcmFtcy5lZGl0RmxhZ3MuY2FuU2VsZWN0QWxsIH0pKTtcblx0XHR9IGVsc2UgaWYgKHBhcmFtcy5zZWxlY3Rpb25UZXh0KSB7XG5cdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oeyByb2xlOiAnY29weScgfSkpO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBuYXZpZ2F0aW9uIGl0ZW1zIGFzIGRlZmF1bHRzXG5cdFx0aWYgKG1lbnUuaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRpZiAod2ViQ29udGVudHMubmF2aWdhdGlvbkhpc3RvcnkuY2FuR29CYWNrKCkpIHtcblx0XHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIuY29udGV4dE1lbnUuYmFjaycsICdCYWNrJyksXG5cdFx0XHRcdFx0YWNjZWxlcmF0b3I6IHdpbmRvd0NvbmZpZ3VyYXRpb24/LmtleWJpbmRpbmdzW0Jyb3dzZXJWaWV3Q29tbWFuZElkLkdvQmFja10sXG5cdFx0XHRcdFx0Y2xpY2s6ICgpID0+IHdlYkNvbnRlbnRzLm5hdmlnYXRpb25IaXN0b3J5LmdvQmFjaygpXG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdGlmICh3ZWJDb250ZW50cy5uYXZpZ2F0aW9uSGlzdG9yeS5jYW5Hb0ZvcndhcmQoKSkge1xuXHRcdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYnJvd3Nlci5jb250ZXh0TWVudS5mb3J3YXJkJywgJ0ZvcndhcmQnKSxcblx0XHRcdFx0XHRhY2NlbGVyYXRvcjogd2luZG93Q29uZmlndXJhdGlvbj8ua2V5YmluZGluZ3NbQnJvd3NlclZpZXdDb21tYW5kSWQuR29Gb3J3YXJkXSxcblx0XHRcdFx0XHRjbGljazogKCkgPT4gd2ViQ29udGVudHMubmF2aWdhdGlvbkhpc3RvcnkuZ29Gb3J3YXJkKClcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmNvbnRleHRNZW51LnJlbG9hZCcsICdSZWxvYWQnKSxcblx0XHRcdFx0YWNjZWxlcmF0b3I6IHdpbmRvd0NvbmZpZ3VyYXRpb24/LmtleWJpbmRpbmdzW0Jyb3dzZXJWaWV3Q29tbWFuZElkLlJlbG9hZF0sXG5cdFx0XHRcdGNsaWNrOiAoKSA9PiB3ZWJDb250ZW50cy5yZWxvYWQoKVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmIChpbnNwZWN0VGFyZ2V0KSB7XG5cdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oeyB0eXBlOiAnc2VwYXJhdG9yJyB9KSk7XG5cdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIuY29udGV4dE1lbnUuYWRkRWxlbWVudFRvQ2hhdCcsICdBZGQgRWxlbWVudCB0byBDaGF0JyksXG5cdFx0XHRcdGNsaWNrOiAoKSA9PiBpbnNwZWN0VGFyZ2V0LmFkZFRvQ2hhdCgpXG5cdFx0XHR9KSk7XG5cdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIuY29udGV4dE1lbnUuYWRkQ29tbWVudCcsICdBZGQgQ29tbWVudC4uLicpLFxuXHRcdFx0XHRjbGljazogKCkgPT4gaW5zcGVjdFRhcmdldC5hZGRDb21tZW50KClcblx0XHRcdH0pKTtcblx0XHRcdHZvaWQgaW5zcGVjdFRhcmdldC5oaWdobGlnaHQoKS5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdFx0bWVudS5vbignbWVudS13aWxsLWNsb3NlJywgKCkgPT4gaW5zcGVjdFRhcmdldC5kaXNwb3NlKCkpO1xuXHRcdH1cblxuXHRcdG1lbnUuYXBwZW5kKG5ldyBNZW51SXRlbSh7IHR5cGU6ICdzZXBhcmF0b3InIH0pKTtcblx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oe1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmNvbnRleHRNZW51Lmluc3BlY3QnLCAnSW5zcGVjdCcpLFxuXHRcdFx0Y2xpY2s6ICgpID0+IHdlYkNvbnRlbnRzLmluc3BlY3RFbGVtZW50KHBhcmFtcy54LCBwYXJhbXMueSlcblx0XHR9KSk7XG5cblx0XHRjb25zdCB2aWV3Qm91bmRzID0gdmlldy5nZXRXZWJDb250ZW50c1ZpZXcoKS5nZXRCb3VuZHMoKTtcblx0XHRtZW51LnBvcHVwKHtcblx0XHRcdHdpbmRvdzogd2luLFxuXHRcdFx0eDogdmlld0JvdW5kcy54ICsgcGFyYW1zLngsXG5cdFx0XHR5OiB2aWV3Qm91bmRzLnkgKyBwYXJhbXMueSxcblx0XHRcdHNvdXJjZVR5cGU6IHBhcmFtcy5tZW51U291cmNlVHlwZVxuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxxQkFBcUI7QUFFMUMsU0FBME0sNEJBQXVNO0FBQ2paLFNBQVMsV0FBVyxNQUFNLGdCQUFnQjtBQUMxQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGlCQUFpQiw2QkFBNkI7QUFDdkQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQ0FBc0M7QUFFL0MsU0FBc0Msc0JBQXNCO0FBQzVELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsY0FBYztBQUVoQixNQUFNLDBCQUEwQixnQkFBeUMsd0JBQXdCO0FBV2pHLElBQU0seUJBQU4sY0FBcUMsV0FBOEM7QUFBQSxFQXVCekYsWUFDMkMsd0JBQ0Ysc0JBQ0Ysb0JBQ0Ysa0JBQ0ssdUJBQ1EsK0JBQ2hEO0FBQ0QsVUFBTTtBQVBvQztBQUNGO0FBQ0Y7QUFDRjtBQUNLO0FBQ1E7QUFsQmxELFNBQWlCLGVBQWUsS0FBSyxVQUFVLElBQUksY0FBbUMsQ0FBQztBQU12RjtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLHdCQUF3QixvQkFBSSxJQUE2QztBQUMxRixTQUFpQiw0QkFBNEIsS0FBSyxVQUFVLElBQUksY0FBc0IsQ0FBQztBQUV2RixTQUFpQiwwQkFBMEIsS0FBSyxVQUFVLElBQUksUUFBa0MsQ0FBQztBQUNqRyxTQUFTLHlCQUEwRCxLQUFLLHdCQUF3QjtBQUFBLEVBV2hHO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQXpCQSxPQUFPLHlCQUF5QixVQUF5QztBQUN4RSxXQUFPLGVBQWUseUJBQXlCLFFBQVE7QUFBQSxFQUN4RDtBQUFBLEVBeUJBLE1BQU0sdUJBQXVCLElBQVksU0FBZ0U7QUFDeEcsUUFBSSxLQUFLLGFBQWEsSUFBSSxFQUFFLEdBQUc7QUFFOUIsWUFBTUEsUUFBTyxLQUFLLGFBQWEsSUFBSSxFQUFFO0FBQ3JDLGFBQU9BLE1BQUssU0FBUztBQUFBLElBQ3RCO0FBRUEsVUFBTSxjQUFjLEtBQUssbUJBQW1CLGNBQWMsUUFBUSxNQUFNLFlBQVk7QUFDcEYsUUFBSSxDQUFDLGFBQWE7QUFDakIsWUFBTSxJQUFJLE1BQU0sd0JBQXdCLFFBQVEsTUFBTSxZQUFZLFlBQVk7QUFBQSxJQUMvRTtBQUVBLFVBQU0saUJBQWlCLGVBQWU7QUFBQSxNQUNyQyxLQUFLO0FBQUEsTUFDTDtBQUFBLE1BQ0EsUUFBUTtBQUFBLE1BQ1IsS0FBSyx1QkFBdUI7QUFBQSxNQUM1QixZQUFZLGlCQUFpQjtBQUFBLElBQzlCO0FBRUEsVUFBTSxPQUFPLEtBQUssa0JBQWtCLElBQUksUUFBUSxPQUFPLGNBQWM7QUFFckUsUUFBSSxRQUFRLGNBQWMsS0FBSztBQUM5QixXQUFLLEtBQUssUUFBUSxRQUFRLGFBQWEsR0FBRztBQUFBLElBQzNDO0FBRUEsV0FBTztBQUFBLE1BQ04sR0FBRyxLQUFLLFNBQVM7QUFBQSxNQUNqQixHQUFHLFFBQVE7QUFBQSxJQUNaO0FBQUEsRUFDRDtBQUFBLEVBRUEsa0JBQWtCLElBQXFDO0FBQ3RELFdBQU8sS0FBSyxhQUFhLElBQUksRUFBRTtBQUFBLEVBQ2hDO0FBQUEsRUFFQSxNQUFNLGFBQWEsS0FBYSxPQUEwQixrQkFBaUQ7QUFDMUcsVUFBTSxpQkFBaUIsbUJBQW1CLGVBQWUsSUFBSSxnQkFBZ0IsSUFBSTtBQUVqRixXQUFPLEtBQUssUUFBUSxLQUFLO0FBQUEsTUFDeEI7QUFBQSxNQUNBLFNBQVM7QUFBQSxNQUNULGFBQWEsRUFBRSxlQUFlLEtBQUs7QUFBQSxNQUNuQyxRQUFRO0FBQUEsSUFDVCxDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsZ0JBQWdCLElBQXlCO0FBQ2hELFVBQU0sT0FBTyxLQUFLLGFBQWEsSUFBSSxFQUFFO0FBQ3JDLFFBQUksQ0FBQyxNQUFNO0FBQ1YsWUFBTSxJQUFJLE1BQU0sZ0JBQWdCLEVBQUUsWUFBWTtBQUFBLElBQy9DO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGFBQWEsTUFBcUM7QUFDekQsV0FBTztBQUFBLE1BQ04sSUFBSSxLQUFLO0FBQUEsTUFDVCxPQUFPLEtBQUs7QUFBQSxNQUNaLE9BQU8sS0FBSyxTQUFTO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLGdCQUFnQixVQUFnRDtBQUNyRSxVQUFNLFNBQTZCLENBQUM7QUFDcEMsZUFBVyxDQUFDLEVBQUUsSUFBSSxLQUFLLEtBQUssY0FBYztBQUN6QyxVQUFJLGFBQWEsVUFBYSxLQUFLLE1BQU0saUJBQWlCLFVBQVU7QUFDbkU7QUFBQSxNQUNEO0FBQ0EsYUFBTyxLQUFLLEtBQUssYUFBYSxJQUFJLENBQUM7QUFBQSxJQUNwQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxxQkFBcUIsSUFBWTtBQUNoQyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRTtBQUFBLEVBQ2pDO0FBQUEsRUFFQSwrQkFBK0IsSUFBWTtBQUMxQyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRTtBQUFBLEVBQ2pDO0FBQUEsRUFFQSx3QkFBd0IsSUFBWTtBQUNuQyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRTtBQUFBLEVBQ2pDO0FBQUEsRUFFQSw2QkFBNkIsSUFBWTtBQUN4QyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRTtBQUFBLEVBQ2pDO0FBQUEsRUFFQSxnQ0FBZ0MsSUFBWTtBQUMzQyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRTtBQUFBLEVBQ2pDO0FBQUEsRUFFQSx1QkFBdUIsSUFBWTtBQUNsQyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRTtBQUFBLEVBQ2pDO0FBQUEsRUFFQSx3QkFBd0IsSUFBWTtBQUNuQyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRTtBQUFBLEVBQ2pDO0FBQUEsRUFFQSwwQkFBMEIsSUFBWTtBQUNyQyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRTtBQUFBLEVBQ2pDO0FBQUEsRUFFQSx1QkFBdUIsSUFBWTtBQUNsQyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRTtBQUFBLEVBQ2pDO0FBQUEsRUFFQSxrQkFBa0IsSUFBWTtBQUM3QixXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRTtBQUFBLEVBQ2pDO0FBQUEsRUFFQSwwQkFBMEIsSUFBWTtBQUNyQyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRSxVQUFVO0FBQUEsRUFDM0M7QUFBQSxFQUVBLGlDQUFpQyxJQUFZO0FBQzVDLFdBQU8sS0FBSyxnQkFBZ0IsRUFBRSxFQUFFLFVBQVU7QUFBQSxFQUMzQztBQUFBLEVBRUEsd0NBQXdDLElBQVk7QUFDbkQsV0FBTyxLQUFLLGdCQUFnQixFQUFFLEVBQUUsVUFBVTtBQUFBLEVBQzNDO0FBQUEsRUFFQSxxQkFBcUIsSUFBWTtBQUNoQyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRSxVQUFVO0FBQUEsRUFDM0M7QUFBQSxFQUVBLHNDQUFzQyxJQUFZO0FBQ2pELFdBQU8sS0FBSyxnQkFBZ0IsRUFBRSxFQUFFLFVBQVU7QUFBQSxFQUMzQztBQUFBLEVBRUEsa0NBQWtDLElBQVk7QUFDN0MsV0FBTyxLQUFLLGdCQUFnQixFQUFFLEVBQUUsU0FBUztBQUFBLEVBQzFDO0FBQUEsRUFFQSwrQkFBK0IsSUFBWTtBQUMxQyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRTtBQUFBLEVBQ2pDO0FBQUEsRUFFQSw4QkFBOEIsSUFBWTtBQUN6QyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRTtBQUFBLEVBQ2pDO0FBQUEsRUFFQSw4QkFBOEIsSUFBWTtBQUN6QyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRTtBQUFBLEVBQ2pDO0FBQUEsRUFFQSxNQUFNLFNBQVMsSUFBd0M7QUFDdEQsV0FBTyxLQUFLLGdCQUFnQixFQUFFLEVBQUUsU0FBUztBQUFBLEVBQzFDO0FBQUEsRUFFQSxNQUFNLG1CQUFtQixJQUEyQjtBQUNuRCxXQUFPLEtBQUssYUFBYSxpQkFBaUIsRUFBRTtBQUFBLEVBQzdDO0FBQUEsRUFFQSxNQUFNLE9BQU8sSUFBWSxRQUEyQztBQUNuRSxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRSxPQUFPLE1BQU07QUFBQSxFQUM5QztBQUFBLEVBRUEsTUFBTSxXQUFXLElBQVksU0FBaUM7QUFDN0QsV0FBTyxLQUFLLGdCQUFnQixFQUFFLEVBQUUsV0FBVyxPQUFPO0FBQUEsRUFDbkQ7QUFBQSxFQUVBLE1BQU0sUUFBUSxJQUFZLEtBQTRCO0FBQ3JELFdBQU8sS0FBSyxnQkFBZ0IsRUFBRSxFQUFFLFFBQVEsR0FBRztBQUFBLEVBQzVDO0FBQUEsRUFFQSxNQUFNLE9BQU8sSUFBNkI7QUFDekMsV0FBTyxLQUFLLGdCQUFnQixFQUFFLEVBQUUsT0FBTztBQUFBLEVBQ3hDO0FBQUEsRUFFQSxNQUFNLE9BQU8sSUFBMkI7QUFDdkMsV0FBTyxLQUFLLGdCQUFnQixFQUFFLEVBQUUsT0FBTztBQUFBLEVBQ3hDO0FBQUEsRUFFQSxNQUFNLFVBQVUsSUFBMkI7QUFDMUMsV0FBTyxLQUFLLGdCQUFnQixFQUFFLEVBQUUsVUFBVTtBQUFBLEVBQzNDO0FBQUEsRUFFQSxNQUFNLE9BQU8sSUFBWSxNQUErQjtBQUN2RCxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRSxPQUFPLElBQUk7QUFBQSxFQUM1QztBQUFBLEVBRUEsTUFBTSxlQUFlLElBQTJCO0FBQy9DLFdBQU8sS0FBSyxnQkFBZ0IsRUFBRSxFQUFFLGVBQWU7QUFBQSxFQUNoRDtBQUFBLEVBRUEsTUFBTSxVQUFVLElBQThCO0FBQzdDLFdBQU8sS0FBSyxnQkFBZ0IsRUFBRSxFQUFFLFVBQVU7QUFBQSxFQUMzQztBQUFBLEVBRUEsTUFBTSxhQUFhLElBQThCO0FBQ2hELFdBQU8sS0FBSyxnQkFBZ0IsRUFBRSxFQUFFLGFBQWE7QUFBQSxFQUM5QztBQUFBLEVBRUEsTUFBTSxrQkFBa0IsSUFBWSxTQUFtRTtBQUN0RyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRSxrQkFBa0IsT0FBTztBQUFBLEVBQzFEO0FBQUEsRUFFQSxNQUFNLE1BQU0sSUFBWSxPQUFnQztBQUN2RCxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRSxNQUFNLEtBQUs7QUFBQSxFQUM1QztBQUFBLEVBRUEsTUFBTSxXQUFXLElBQVksTUFBYyxTQUF3RDtBQUNsRyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRSxXQUFXLE1BQU0sT0FBTztBQUFBLEVBQ3pEO0FBQUEsRUFFQSxNQUFNLGVBQWUsSUFBWSxlQUF3QztBQUN4RSxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRSxlQUFlLGFBQWE7QUFBQSxFQUM3RDtBQUFBLEVBRUEsTUFBTSxnQkFBZ0IsSUFBNkI7QUFDbEQsV0FBTyxLQUFLLGdCQUFnQixFQUFFLEVBQUUsZ0JBQWdCO0FBQUEsRUFDakQ7QUFBQSxFQUVBLE1BQU0sYUFBYSxJQUEyQjtBQUM3QyxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRSxhQUFhO0FBQUEsRUFDOUM7QUFBQSxFQUVBLE1BQU0sb0JBQW9CLElBQVksV0FBa0M7QUFDdkUsV0FBTyxLQUFLLGdCQUFnQixFQUFFLEVBQUUsb0JBQW9CLFNBQVM7QUFBQSxFQUM5RDtBQUFBLEVBRUEsTUFBTSxtQkFBbUIsSUFBWSxRQUEwRDtBQUM5RixXQUFPLEtBQUssZ0JBQWdCLEVBQUUsRUFBRSxTQUFTLFVBQVUsTUFBTTtBQUFBLEVBQzFEO0FBQUEsRUFFQSxNQUFNLGlCQUFpQixJQUFZLE1BQWMsYUFBb0M7QUFDcEYsV0FBTyxLQUFLLGdCQUFnQixFQUFFLEVBQUUsaUJBQWlCLE1BQU0sV0FBVztBQUFBLEVBQ25FO0FBQUEsRUFFQSxNQUFNLG1CQUFtQixJQUFZLE1BQWMsYUFBb0M7QUFDdEYsV0FBTyxLQUFLLGdCQUFnQixFQUFFLEVBQUUsbUJBQW1CLE1BQU0sV0FBVztBQUFBLEVBQ3JFO0FBQUEsRUFFQSxNQUFNLHFCQUFxQixJQUFZLFVBQTZDO0FBQ25GLFNBQUssZ0JBQWdCLEVBQUUsRUFBRSxRQUFRLFFBQVEsT0FBTyxRQUFRO0FBQUEsRUFDekQ7QUFBQSxFQUVBLE1BQU0sZUFBZSxJQUFZLFFBQWdCLFFBQTREO0FBQzVHLFNBQUssZ0JBQWdCLEVBQUUsRUFBRSxRQUFRLFlBQVksSUFBSSxRQUFRLE1BQU07QUFBQSxFQUNoRTtBQUFBLEVBRUEsTUFBTSxhQUFhLElBQVksV0FBbUIsVUFBd0M7QUFDekYsU0FBSyxnQkFBZ0IsRUFBRSxFQUFFLGFBQWEsV0FBVyxRQUFRO0FBQUEsRUFDMUQ7QUFBQSxFQUVBLE1BQU0scUJBQW9DO0FBQ3pDLFVBQU0saUJBQWlCLGVBQWUsa0JBQWtCLEtBQUssb0JBQW9CO0FBQ2pGLG1CQUFlLGVBQWUsS0FBSyw2QkFBNkI7QUFDaEUsVUFBTSxlQUFlLFVBQVU7QUFBQSxFQUNoQztBQUFBLEVBRUEsTUFBTSxzQkFBc0IsYUFBb0M7QUFDL0QsVUFBTSxpQkFBaUIsZUFBZTtBQUFBLE1BQ3JDLEtBQUs7QUFBQSxNQUNMO0FBQUEsTUFDQSxLQUFLLHVCQUF1QjtBQUFBLElBQzdCO0FBQ0EsbUJBQWUsZUFBZSxLQUFLLDZCQUE2QjtBQUNoRSxVQUFNLGVBQWUsVUFBVTtBQUFBLEVBQ2hDO0FBQUEsRUFFQSxNQUFNLGVBQWUsSUFBNkI7QUFDakQsV0FBTyxLQUFLLGdCQUFnQixFQUFFLEVBQUUsZUFBZTtBQUFBLEVBQ2hEO0FBQUEsRUFFQSxNQUFNLHVCQUF1QixJQUFZLFNBQW1CLFNBQTBEO0FBQ3JILFdBQU8sS0FBSyxnQkFBZ0IsRUFBRSxFQUFFLFVBQVUsdUJBQXVCLFNBQVMsT0FBTztBQUFBLEVBQ2xGO0FBQUEsRUFFQSxNQUFNLG1CQUFtQixJQUFZLFFBQXNEO0FBQzFGLFNBQUssZ0JBQWdCLEVBQUUsRUFBRSxVQUFVLG1CQUFtQixNQUFNO0FBQUEsRUFDN0Q7QUFBQSxFQUVBLE1BQU0sb0JBQW9CLElBQVksU0FBa0M7QUFDdkUsV0FBTyxLQUFLLGdCQUFnQixFQUFFLEVBQUUsVUFBVSxvQkFBb0IsT0FBTztBQUFBLEVBQ3RFO0FBQUEsRUFFQSxNQUFNLDBCQUEwQixVQUFrQixRQUF3RDtBQUN6RyxVQUFNLFlBQVksS0FBSyxzQkFBc0IsSUFBSSxRQUFRO0FBQ3pELFVBQU0saUJBQWlCLENBQUMsT0FBTyxXQUFXLE9BQU8sT0FBTyxLQUFLO0FBQzdELFVBQU0saUJBQWlCLENBQUMsT0FBTyxXQUFXLFdBQVcsT0FBTyxTQUFTO0FBRXJFLFNBQUssc0JBQXNCLElBQUksVUFBVSxNQUFNO0FBQy9DLFNBQUssK0JBQStCLFFBQVE7QUFFNUMsZUFBVyxDQUFDLEVBQUUsSUFBSSxLQUFLLEtBQUssY0FBYztBQUN6QyxVQUFJLEtBQUssTUFBTSxpQkFBaUIsVUFBVTtBQUN6QyxZQUFJLGdCQUFnQjtBQUNuQixlQUFLLFVBQVUsU0FBUyxPQUFPLEtBQUs7QUFBQSxRQUNyQztBQUNBLFlBQUksZ0JBQWdCO0FBQ25CLGVBQUssUUFBUSxPQUFPLFFBQVEsS0FBSyxJQUFJLE9BQU8sU0FBUztBQUFBLFFBQ3REO0FBQ0EsWUFBSSxPQUFPLE9BQU8sc0JBQXNCLFVBQVU7QUFDakQsZUFBSyxRQUFRLFFBQVEsY0FBYyxPQUFPLGlCQUFpQjtBQUFBLFFBQzVEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLDJCQUEyQjtBQUFBLEVBQ2pDO0FBQUEsRUFFUSwrQkFBK0IsVUFBd0I7QUFDOUQsUUFBSSxLQUFLLDBCQUEwQixJQUFJLFFBQVEsR0FBRztBQUNqRDtBQUFBLElBQ0Q7QUFDQSxVQUFNLFNBQVMsS0FBSyxtQkFBbUIsY0FBYyxRQUFRO0FBQzdELFFBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxJQUNEO0FBQ0EsVUFBTSxlQUFlLE1BQU0sSUFBSSxPQUFPLFlBQVksT0FBTyxZQUFZO0FBQ3JFLFNBQUssMEJBQTBCLElBQUksVUFBVSxNQUFNLEtBQUssWUFBWSxFQUFFLE1BQU07QUFDM0UsV0FBSywwQkFBMEIsaUJBQWlCLFFBQVE7QUFDeEQsVUFBSSxLQUFLLHNCQUFzQixPQUFPLFFBQVEsR0FBRztBQUNoRCxhQUFLLDJCQUEyQjtBQUFBLE1BQ2pDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSw2QkFBbUM7QUFDMUMsVUFBTSxRQUFRLG9CQUFJLElBQVk7QUFDOUIsUUFBSSxnQkFBZ0I7QUFDcEIsZUFBVyxpQkFBaUIsS0FBSyxzQkFBc0IsT0FBTyxHQUFHO0FBQ2hFLGlCQUFXLFFBQVEsY0FBYyxrQkFBa0I7QUFDbEQsY0FBTSxJQUFJLElBQUk7QUFBQSxNQUNmO0FBQ0Esd0JBQWtCLGNBQWM7QUFBQSxJQUNqQztBQUNBLG1CQUFlLG9CQUFvQixDQUFDLEdBQUcsS0FBSyxHQUFHLGFBQWE7QUFBQSxFQUM3RDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1Esa0JBQWtCLElBQVksT0FBMEIsZ0JBQWdDLFNBQW1FO0FBQ2xLLFFBQUksS0FBSyxhQUFhLElBQUksRUFBRSxHQUFHO0FBQzlCLFlBQU0sSUFBSSxNQUFNLHdCQUF3QixFQUFFLGlCQUFpQjtBQUFBLElBQzVEO0FBRUEsbUJBQWUsZUFBZSxLQUFLLDZCQUE2QjtBQUNoRSxVQUFNLHNCQUFzQixLQUFLLHNCQUFzQixJQUFJLE1BQU0sWUFBWTtBQUM3RSxRQUFJLE9BQU8scUJBQXFCLHNCQUFzQixVQUFVO0FBQy9ELHFCQUFlLFFBQVEsY0FBYyxvQkFBb0IsaUJBQWlCO0FBQUEsSUFDM0U7QUFHQSxtQkFBZSxPQUFPLFFBQVEsSUFBSSxxQkFBcUIsU0FBUztBQUVoRSxVQUFNLE9BQU8sS0FBSyxxQkFBcUI7QUFBQSxNQUN0QztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFFQSxDQUFDLEtBQUssaUJBQWlCLGdCQUFnQjtBQUN0QyxjQUFNLFFBQVEsS0FBSyxrQkFBa0IsYUFBYSxHQUFHLE9BQU8sZ0JBQWdCLGVBQWU7QUFFM0YsWUFBSSxLQUFLO0FBQ1IsZUFBSyxNQUFNLFFBQVEsR0FBRyxFQUFFLE1BQU0sTUFBTTtBQUFBLFVBQUUsQ0FBQztBQUFBLFFBQ3hDO0FBRUEsY0FBTSxPQUFPLEtBQUssYUFBYSxLQUFLO0FBQ3BDLGFBQUssd0JBQXdCLEtBQUs7QUFBQSxVQUNqQyxNQUFNLE1BQU0sRUFBRSxHQUFHLE1BQU0sT0FBTyxFQUFFLEdBQUcsS0FBSyxPQUFPLElBQUksRUFBRSxJQUFJO0FBQUEsVUFDekQ7QUFBQSxRQUNELENBQUM7QUFFRCxlQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0EsQ0FBQyxHQUFHLFdBQVcsS0FBSyxnQkFBZ0IsR0FBRyxNQUFNO0FBQUEsTUFDN0M7QUFBQSxJQUNEO0FBQ0EsU0FBSyxhQUFhLElBQUksSUFBSSxJQUFJO0FBQzlCLFFBQUkscUJBQXFCLE9BQU87QUFDL0IsV0FBSyxVQUFVLFNBQVMsb0JBQW9CLEtBQUs7QUFBQSxJQUNsRDtBQUVBLFVBQU0sS0FBSyxLQUFLLFVBQVUsRUFBRSxNQUFNO0FBQ2pDLHFCQUFlLE9BQU8sUUFBUSxFQUFFO0FBQ2hDLFdBQUssYUFBYSxpQkFBaUIsRUFBRTtBQUFBLElBQ3RDLENBQUM7QUFFRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxRQUNiLEtBQ0E7QUFBQSxJQUNDO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRCxHQU11QjtBQUN2QixVQUFNLFdBQVcsYUFBYTtBQUM5QixVQUFNLE9BQU8sS0FBSyxrQkFBa0IsVUFBVSxPQUFPLFdBQVcsZUFBZSxxQkFBcUIsS0FBSyxzQkFBc0IsUUFBUSxDQUFDO0FBRXhJLFFBQUksS0FBSztBQUNSLFdBQUssS0FBSyxRQUFRLEdBQUcsRUFBRSxNQUFNLE1BQU07QUFBQSxNQUFFLENBQUM7QUFBQSxJQUN2QztBQUVBLG1CQUFlLEtBQUssa0JBQWtCLE1BQU07QUFHNUMsVUFBTSxPQUFPLEtBQUssYUFBYSxJQUFJO0FBQ25DLFNBQUssd0JBQXdCLEtBQUs7QUFBQSxNQUNqQyxNQUFNLE1BQU0sRUFBRSxHQUFHLE1BQU0sT0FBTyxFQUFFLEdBQUcsS0FBSyxPQUFPLElBQUksRUFBRSxJQUFJO0FBQUEsTUFDekQ7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxnQkFBZ0IsTUFBbUIsUUFBbUQ7QUFDbkcsVUFBTSxNQUFNLEtBQUssa0JBQWtCO0FBQ25DLFFBQUksQ0FBQyxLQUFLO0FBQ1Q7QUFBQSxJQUNEO0FBQ0EsVUFBTSxjQUFjLEtBQUs7QUFDekIsUUFBSSxZQUFZLFlBQVksR0FBRztBQUM5QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLHNCQUFzQixLQUFLLHNCQUFzQixJQUFJLEtBQUssTUFBTSxZQUFZO0FBQ2xGLFVBQU0sZ0JBQWdCLHFCQUFxQixxQkFDeEMsU0FDQSxPQUFPLFNBQVMsTUFBTSxLQUFLLFVBQVUsaUJBQWlCLDRCQUE0QixtQkFBbUIsT0FBTyxLQUFLO0FBQ3BILFVBQU0sT0FBTyxJQUFJLEtBQUs7QUFFdEIsUUFBSSxPQUFPLFNBQVM7QUFDbkIsV0FBSyxPQUFPLElBQUksU0FBUztBQUFBLFFBQ3hCLE9BQU8sU0FBUyx3Q0FBd0Msc0JBQXNCO0FBQUEsUUFDOUUsT0FBTyxNQUFNO0FBQ1osZUFBSyxLQUFLLFFBQVEsT0FBTyxTQUFTO0FBQUEsWUFDakMsT0FBTyxLQUFLO0FBQUEsWUFDWixTQUFTLEtBQUs7QUFBQSxZQUNkLGFBQWEsRUFBRSxlQUFlLE1BQU0sWUFBWSxLQUFLO0FBQUEsWUFDckQsUUFBUTtBQUFBLFVBQ1QsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNELENBQUMsQ0FBQztBQUNGLFdBQUssT0FBTyxJQUFJLFNBQVM7QUFBQSxRQUN4QixPQUFPLFNBQVMsaURBQWlELCtCQUErQjtBQUFBLFFBQ2hHLE9BQU8sTUFBTTtBQUFFLGVBQUssS0FBSyxzQkFBc0IsYUFBYSxRQUFXLE9BQU8sT0FBTztBQUFBLFFBQUc7QUFBQSxNQUN6RixDQUFDLENBQUM7QUFDRixXQUFLLE9BQU8sSUFBSSxTQUFTLEVBQUUsTUFBTSxZQUFZLENBQUMsQ0FBQztBQUMvQyxXQUFLLE9BQU8sSUFBSSxTQUFTO0FBQUEsUUFDeEIsT0FBTyxTQUFTLGdDQUFnQyxXQUFXO0FBQUEsUUFDM0QsT0FBTyxNQUFNO0FBQ1osb0JBQVUsTUFBTTtBQUFBLFlBQ2YsTUFBTSxPQUFPO0FBQUEsWUFDYixNQUFNLFlBQVksVUFBVSxPQUFPLE9BQU8sQ0FBQyxLQUFLLHlCQUF5QixPQUFPLFlBQVksT0FBTyxPQUFPLENBQUM7QUFBQSxVQUM1RyxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUVBLFFBQUksT0FBTyxvQkFBb0IsT0FBTyxRQUFRO0FBQzdDLFVBQUksS0FBSyxNQUFNLFNBQVMsR0FBRztBQUMxQixhQUFLLE9BQU8sSUFBSSxTQUFTLEVBQUUsTUFBTSxZQUFZLENBQUMsQ0FBQztBQUFBLE1BQ2hEO0FBQ0EsV0FBSyxPQUFPLElBQUksU0FBUztBQUFBLFFBQ3hCLE9BQU8sU0FBUyx5Q0FBeUMsdUJBQXVCO0FBQUEsUUFDaEYsT0FBTyxNQUFNO0FBQ1osZUFBSyxLQUFLLFFBQVEsT0FBTyxRQUFTO0FBQUEsWUFDakMsT0FBTyxLQUFLO0FBQUEsWUFDWixTQUFTLEtBQUs7QUFBQSxZQUNkLGFBQWEsRUFBRSxlQUFlLE1BQU0sWUFBWSxLQUFLO0FBQUEsWUFDckQsUUFBUTtBQUFBLFVBQ1QsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNELENBQUMsQ0FBQztBQUNGLFdBQUssT0FBTyxJQUFJLFNBQVM7QUFBQSxRQUN4QixPQUFPLFNBQVMsaUNBQWlDLFlBQVk7QUFBQSxRQUM3RCxPQUFPLE1BQU07QUFBRSxlQUFLLFlBQVksWUFBWSxPQUFPLEdBQUcsT0FBTyxDQUFDO0FBQUEsUUFBRztBQUFBLE1BQ2xFLENBQUMsQ0FBQztBQUNGLFdBQUssT0FBTyxJQUFJLFNBQVM7QUFBQSxRQUN4QixPQUFPLFNBQVMsb0NBQW9DLGdCQUFnQjtBQUFBLFFBQ3BFLE9BQU8sTUFBTTtBQUFFLG9CQUFVLFVBQVUsT0FBTyxNQUFPO0FBQUEsUUFBRztBQUFBLE1BQ3JELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFFQSxRQUFJLE9BQU8sWUFBWTtBQUN0QixXQUFLLE9BQU8sSUFBSSxTQUFTLEVBQUUsTUFBTSxPQUFPLFNBQVMsT0FBTyxVQUFVLE9BQU8sQ0FBQyxDQUFDO0FBQzNFLFdBQUssT0FBTyxJQUFJLFNBQVMsRUFBRSxNQUFNLFFBQVEsU0FBUyxPQUFPLFVBQVUsUUFBUSxDQUFDLENBQUM7QUFDN0UsV0FBSyxPQUFPLElBQUksU0FBUyxFQUFFLE1BQU0sU0FBUyxTQUFTLE9BQU8sVUFBVSxTQUFTLENBQUMsQ0FBQztBQUMvRSxXQUFLLE9BQU8sSUFBSSxTQUFTLEVBQUUsTUFBTSxzQkFBc0IsU0FBUyxPQUFPLFVBQVUsU0FBUyxDQUFDLENBQUM7QUFDNUYsV0FBSyxPQUFPLElBQUksU0FBUyxFQUFFLE1BQU0sYUFBYSxTQUFTLE9BQU8sVUFBVSxhQUFhLENBQUMsQ0FBQztBQUFBLElBQ3hGLFdBQVcsT0FBTyxlQUFlO0FBQ2hDLFdBQUssT0FBTyxJQUFJLFNBQVMsRUFBRSxNQUFNLE9BQU8sQ0FBQyxDQUFDO0FBQUEsSUFDM0M7QUFHQSxRQUFJLEtBQUssTUFBTSxXQUFXLEdBQUc7QUFDNUIsVUFBSSxZQUFZLGtCQUFrQixVQUFVLEdBQUc7QUFDOUMsYUFBSyxPQUFPLElBQUksU0FBUztBQUFBLFVBQ3hCLE9BQU8sU0FBUyw0QkFBNEIsTUFBTTtBQUFBLFVBQ2xELGFBQWEscUJBQXFCLFlBQVkscUJBQXFCLE1BQU07QUFBQSxVQUN6RSxPQUFPLE1BQU0sWUFBWSxrQkFBa0IsT0FBTztBQUFBLFFBQ25ELENBQUMsQ0FBQztBQUFBLE1BQ0g7QUFDQSxVQUFJLFlBQVksa0JBQWtCLGFBQWEsR0FBRztBQUNqRCxhQUFLLE9BQU8sSUFBSSxTQUFTO0FBQUEsVUFDeEIsT0FBTyxTQUFTLCtCQUErQixTQUFTO0FBQUEsVUFDeEQsYUFBYSxxQkFBcUIsWUFBWSxxQkFBcUIsU0FBUztBQUFBLFVBQzVFLE9BQU8sTUFBTSxZQUFZLGtCQUFrQixVQUFVO0FBQUEsUUFDdEQsQ0FBQyxDQUFDO0FBQUEsTUFDSDtBQUNBLFdBQUssT0FBTyxJQUFJLFNBQVM7QUFBQSxRQUN4QixPQUFPLFNBQVMsOEJBQThCLFFBQVE7QUFBQSxRQUN0RCxhQUFhLHFCQUFxQixZQUFZLHFCQUFxQixNQUFNO0FBQUEsUUFDekUsT0FBTyxNQUFNLFlBQVksT0FBTztBQUFBLE1BQ2pDLENBQUMsQ0FBQztBQUFBLElBQ0g7QUFFQSxRQUFJLGVBQWU7QUFDbEIsV0FBSyxPQUFPLElBQUksU0FBUyxFQUFFLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDL0MsV0FBSyxPQUFPLElBQUksU0FBUztBQUFBLFFBQ3hCLE9BQU8sU0FBUyx3Q0FBd0MscUJBQXFCO0FBQUEsUUFDN0UsT0FBTyxNQUFNLGNBQWMsVUFBVTtBQUFBLE1BQ3RDLENBQUMsQ0FBQztBQUNGLFdBQUssT0FBTyxJQUFJLFNBQVM7QUFBQSxRQUN4QixPQUFPLFNBQVMsa0NBQWtDLGdCQUFnQjtBQUFBLFFBQ2xFLE9BQU8sTUFBTSxjQUFjLFdBQVc7QUFBQSxNQUN2QyxDQUFDLENBQUM7QUFDRixXQUFLLGNBQWMsVUFBVSxFQUFFLE1BQU0sTUFBTTtBQUFBLE1BQUUsQ0FBQztBQUM5QyxXQUFLLEdBQUcsbUJBQW1CLE1BQU0sY0FBYyxRQUFRLENBQUM7QUFBQSxJQUN6RDtBQUVBLFNBQUssT0FBTyxJQUFJLFNBQVMsRUFBRSxNQUFNLFlBQVksQ0FBQyxDQUFDO0FBQy9DLFNBQUssT0FBTyxJQUFJLFNBQVM7QUFBQSxNQUN4QixPQUFPLFNBQVMsK0JBQStCLFNBQVM7QUFBQSxNQUN4RCxPQUFPLE1BQU0sWUFBWSxlQUFlLE9BQU8sR0FBRyxPQUFPLENBQUM7QUFBQSxJQUMzRCxDQUFDLENBQUM7QUFFRixVQUFNLGFBQWEsS0FBSyxtQkFBbUIsRUFBRSxVQUFVO0FBQ3ZELFNBQUssTUFBTTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQ1IsR0FBRyxXQUFXLElBQUksT0FBTztBQUFBLE1BQ3pCLEdBQUcsV0FBVyxJQUFJLE9BQU87QUFBQSxNQUN6QixZQUFZLE9BQU87QUFBQSxJQUNwQixDQUFDO0FBQUEsRUFDRjtBQUNEO0FBOWtCYSx5QkFBTjtBQUFBLEVBd0JKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTdCVTsiLAogICJuYW1lcyI6IFsidmlldyJdCn0K
