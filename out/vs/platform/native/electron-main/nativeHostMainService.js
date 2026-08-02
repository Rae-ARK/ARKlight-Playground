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
import * as fs from "fs";
import { exec } from "child_process";
import { app, BrowserWindow, clipboard, contentTracing, Menu, Notification, powerMonitor, powerSaveBlocker, screen, shell, systemPreferences, webContents } from "electron";
import { arch, cpus, freemem, loadavg, platform, release, totalmem, type } from "os";
import { promisify } from "util";
import { memoize } from "../../../base/common/decorators.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { matchesSomeScheme, Schemas } from "../../../base/common/network.js";
import { dirname, join, posix, resolve, win32 } from "../../../base/common/path.js";
import { isLinux, isMacintosh, isWindows } from "../../../base/common/platform.js";
import { hasKey } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { virtualMachineHint } from "../../../base/node/id.js";
import { Promises, SymlinkSupport } from "../../../base/node/pfs.js";
import { findFreePort, isPortFree } from "../../../base/node/ports.js";
import { localize } from "../../../nls.js";
import { IDialogMainService } from "../../dialogs/electron-main/dialogMainService.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { createDecorator, IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { FocusMode } from "../common/native.js";
import { IGlobalKeybindingsMainService } from "../../globalKeybindings/electron-main/globalKeybindingsMainService.js";
import { IProductService } from "../../product/common/productService.js";
import { IThemeMainService } from "../../theme/electron-main/themeMainService.js";
import { defaultWindowState } from "../../window/electron-main/window.js";
import { defaultBrowserWindowOptions, IWindowsMainService, OpenContext } from "../../windows/electron-main/windows.js";
import { isWorkspaceIdentifier, toWorkspaceIdentifier } from "../../workspace/common/workspace.js";
import { IWorkspacesManagementMainService } from "../../workspaces/electron-main/workspacesManagementMainService.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { hasWSLFeatureInstalled } from "../../remote/node/wsl.js";
import { WindowProfiler } from "../../profiling/electron-main/windowProfiling.js";
import { IAuxiliaryWindowsMainService } from "../../auxiliaryWindow/electron-main/auxiliaryWindows.js";
import { CancellationError } from "../../../base/common/errors.js";
import { zip } from "../../../base/node/zip.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IProxyAuthService } from "./auth.js";
import { IRequestService } from "../../request/common/request.js";
import { randomPath } from "../../../base/common/extpath.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
const INativeHostMainService = createDecorator("nativeHostMainService");
let NativeHostMainService = class extends Disposable {
  constructor(windowsMainService, auxiliaryWindowsMainService, dialogMainService, lifecycleMainService, environmentMainService, logService, productService, themeMainService, workspacesManagementMainService, configurationService, requestService, proxyAuthService, instantiationService, globalKeybindingsMainService) {
    super();
    this.windowsMainService = windowsMainService;
    this.auxiliaryWindowsMainService = auxiliaryWindowsMainService;
    this.dialogMainService = dialogMainService;
    this.lifecycleMainService = lifecycleMainService;
    this.environmentMainService = environmentMainService;
    this.logService = logService;
    this.productService = productService;
    this.themeMainService = themeMainService;
    this.workspacesManagementMainService = workspacesManagementMainService;
    this.configurationService = configurationService;
    this.requestService = requestService;
    this.proxyAuthService = proxyAuthService;
    this.instantiationService = instantiationService;
    this.globalKeybindingsMainService = globalKeybindingsMainService;
    this._onDidChangePassword = this._register(new Emitter());
    this.onDidChangePassword = this._onDidChangePassword.event;
    this._isTracing = false;
    // #endregion
    //#region Toast Notifications
    this.activeToasts = this._register(new DisposableMap());
    {
      this.onDidOpenMainWindow = Event.map(this.windowsMainService.onDidOpenWindow, (window) => window.id);
      this.onDidTriggerWindowSystemContextMenu = Event.any(
        Event.map(this.windowsMainService.onDidTriggerSystemContextMenu, ({ window, x, y }) => ({ windowId: window.id, x, y })),
        Event.map(this.auxiliaryWindowsMainService.onDidTriggerSystemContextMenu, ({ window, x, y }) => ({ windowId: window.id, x, y }))
      );
      this.onDidMaximizeWindow = Event.any(
        Event.map(this.windowsMainService.onDidMaximizeWindow, (window) => window.id),
        Event.map(this.auxiliaryWindowsMainService.onDidMaximizeWindow, (window) => window.id)
      );
      this.onDidUnmaximizeWindow = Event.any(
        Event.map(this.windowsMainService.onDidUnmaximizeWindow, (window) => window.id),
        Event.map(this.auxiliaryWindowsMainService.onDidUnmaximizeWindow, (window) => window.id)
      );
      this.onDidChangeWindowFullScreen = Event.any(
        Event.map(this.windowsMainService.onDidChangeFullScreen, (e) => ({ windowId: e.window.id, fullscreen: e.fullscreen })),
        Event.map(this.auxiliaryWindowsMainService.onDidChangeFullScreen, (e) => ({ windowId: e.window.id, fullscreen: e.fullscreen }))
      );
      this.onDidChangeWindowAlwaysOnTop = Event.any(
        Event.None,
        // always on top is unsupported in main windows currently
        Event.map(this.auxiliaryWindowsMainService.onDidChangeAlwaysOnTop, (e) => ({ windowId: e.window.id, alwaysOnTop: e.alwaysOnTop }))
      );
      this.onDidBlurMainWindow = Event.filter(Event.fromNodeEventEmitter(app, "browser-window-blur", (event, window) => window.id), (windowId) => !!this.windowsMainService.getWindowById(windowId));
      this.onDidFocusMainWindow = Event.any(
        Event.map(Event.filter(Event.map(this.windowsMainService.onDidChangeWindowsCount, () => this.windowsMainService.getLastActiveWindow()), (window) => !!window), (window) => window.id),
        Event.filter(Event.fromNodeEventEmitter(app, "browser-window-focus", (event, window) => window.id), (windowId) => !!this.windowsMainService.getWindowById(windowId))
      );
      this.onDidBlurMainOrAuxiliaryWindow = Event.any(
        this.onDidBlurMainWindow,
        Event.map(Event.filter(Event.fromNodeEventEmitter(app, "browser-window-blur", (event, window) => this.auxiliaryWindowsMainService.getWindowByWebContents(window.webContents)), (window) => !!window), (window) => window.id)
      );
      this.onDidFocusMainOrAuxiliaryWindow = Event.any(
        this.onDidFocusMainWindow,
        Event.map(Event.filter(Event.fromNodeEventEmitter(app, "browser-window-focus", (event, window) => this.auxiliaryWindowsMainService.getWindowByWebContents(window.webContents)), (window) => !!window), (window) => window.id)
      );
      this.onDidSuspendOS = Event.fromNodeEventEmitter(powerMonitor, "suspend");
      this.onDidResumeOS = Event.fromNodeEventEmitter(powerMonitor, "resume");
      this.onDidChangeOnBatteryPower = Event.any(
        Event.map(Event.fromNodeEventEmitter(powerMonitor, "on-ac"), () => false),
        Event.map(Event.fromNodeEventEmitter(powerMonitor, "on-battery"), () => true)
      );
      this.onDidChangeThermalState = Event.map(
        Event.fromNodeEventEmitter(powerMonitor, "thermal-state-change"),
        (e) => e.state
      );
      this.onDidChangeSpeedLimit = Event.map(
        Event.fromNodeEventEmitter(powerMonitor, "speed-limit-change"),
        (e) => e.limit
      );
      this.onWillShutdownOS = Event.fromNodeEventEmitter(powerMonitor, "shutdown");
      this.onDidLockScreen = Event.fromNodeEventEmitter(powerMonitor, "lock-screen");
      this.onDidUnlockScreen = Event.fromNodeEventEmitter(powerMonitor, "unlock-screen");
      this.onDidChangeColorScheme = this.themeMainService.onDidChangeColorScheme;
      this.onDidChangeDisplay = Event.debounce(Event.any(
        Event.filter(Event.fromNodeEventEmitter(screen, "display-metrics-changed", (event, display, changedMetrics) => changedMetrics), (changedMetrics) => {
          return !(Array.isArray(changedMetrics) && changedMetrics.length === 1 && changedMetrics[0] === "workArea");
        }),
        Event.fromNodeEventEmitter(screen, "display-added"),
        Event.fromNodeEventEmitter(screen, "display-removed")
      ), () => {
      }, 100);
    }
  }
  //#region Properties
  get windowId() {
    throw new Error("Not implemented in electron-main");
  }
  async getWindows(windowId, options) {
    const mainWindows = this.windowsMainService.getWindows().map((window) => ({
      id: window.id,
      workspace: window.openedWorkspace ?? toWorkspaceIdentifier(window.backupPath, window.isExtensionDevelopmentHost),
      title: window.win?.getTitle() ?? "",
      filename: window.getRepresentedFilename(),
      dirty: window.isDocumentEdited()
    }));
    const auxiliaryWindows = [];
    if (options.includeAuxiliaryWindows) {
      auxiliaryWindows.push(...this.auxiliaryWindowsMainService.getWindows().map((window) => ({
        id: window.id,
        parentId: window.parentId,
        title: window.win?.getTitle() ?? "",
        filename: window.getRepresentedFilename()
      })));
    }
    return [...mainWindows, ...auxiliaryWindows];
  }
  async getWindowCount(windowId) {
    return this.windowsMainService.getWindowCount();
  }
  async getActiveWindowId(windowId) {
    const activeWindow = this.windowsMainService.getFocusedWindow() || this.windowsMainService.getLastActiveWindow();
    if (activeWindow) {
      return activeWindow.id;
    }
    return void 0;
  }
  async getActiveWindowPosition() {
    const activeWindow = this.windowsMainService.getFocusedWindow() || this.windowsMainService.getLastActiveWindow();
    if (activeWindow) {
      return activeWindow.getBounds();
    }
    return void 0;
  }
  async getNativeWindowHandle(fallbackWindowId, windowId) {
    const window = this.windowById(windowId, fallbackWindowId);
    if (window?.win) {
      return VSBuffer.wrap(window.win.getNativeWindowHandle());
    }
    return void 0;
  }
  openWindow(windowId, arg1, arg2) {
    if (Array.isArray(arg1)) {
      return this.doOpenWindow(windowId, arg1, arg2);
    }
    return this.doOpenEmptyWindow(windowId, arg1);
  }
  async doOpenWindow(windowId, toOpen, options = /* @__PURE__ */ Object.create(null)) {
    if (toOpen.length > 0) {
      const windows = await this.windowsMainService.open({
        context: OpenContext.API,
        contextWindowId: windowId,
        urisToOpen: toOpen,
        cli: this.environmentMainService.args,
        forceNewWindow: options.forceNewWindow,
        forceReuseWindow: options.forceReuseWindow,
        preferNewWindow: options.preferNewWindow,
        diffMode: options.diffMode,
        mergeMode: options.mergeMode,
        addMode: options.addMode,
        removeMode: options.removeMode,
        gotoLineMode: options.gotoLineMode,
        noRecentEntry: options.noRecentEntry,
        waitMarkerFileURI: options.waitMarkerFileURI,
        remoteAuthority: options.remoteAuthority || void 0,
        forceProfile: options.forceProfile,
        forceTempProfile: options.forceTempProfile
      });
      const chatSessionToOpen = options.chatSessionToOpen;
      if (chatSessionToOpen && windows.length === 1) {
        windows[0].sendWhenReady("vscode:openChatSession", CancellationToken.None, URI.revive(chatSessionToOpen).toString());
      }
    }
  }
  async doOpenEmptyWindow(windowId, options) {
    await this.windowsMainService.openEmptyWindow({
      context: OpenContext.API,
      contextWindowId: windowId
    }, options);
  }
  async openAgentsWindow(windowId, options) {
    const windows = await this.windowsMainService.openAgentsWindow({
      context: OpenContext.API,
      contextWindowId: windowId,
      cli: this.environmentMainService.args
    }, options?.folderUri ? URI.revive(options.folderUri) : void 0, options?.sessionResource ? URI.revive(options.sessionResource) : void 0, options?.source);
    if (windows.length > 0) {
      windows[0].focus();
    }
  }
  async syncSystemWideKeybindings(windowId, keybindings) {
    if (typeof windowId !== "number") {
      return { failed: [] };
    }
    return this.globalKeybindingsMainService.updateKeybindings(windowId, keybindings);
  }
  async isFullScreen(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    return window?.isFullScreen ?? false;
  }
  async toggleFullScreen(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.toggleFullScreen();
  }
  async getCursorScreenPoint(windowId) {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    return { point, display: display.bounds };
  }
  async isMaximized(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    return window?.win?.isMaximized() ?? false;
  }
  async maximizeWindow(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.maximize();
  }
  async unmaximizeWindow(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.unmaximize();
  }
  async minimizeWindow(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.minimize();
  }
  async moveWindowTop(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.moveTop();
  }
  async isWindowAlwaysOnTop(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    return window?.win?.isAlwaysOnTop() ?? false;
  }
  async toggleWindowAlwaysOnTop(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.setAlwaysOnTop(!window.win.isAlwaysOnTop());
  }
  async setWindowAlwaysOnTop(windowId, alwaysOnTop, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.setAlwaysOnTop(alwaysOnTop);
  }
  async positionWindow(windowId, position, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    if (window?.win) {
      if (window.win.isFullScreen()) {
        const fullscreenLeftFuture = Event.toPromise(Event.once(Event.fromNodeEventEmitter(window.win, "leave-full-screen")));
        window.win.setFullScreen(false);
        await fullscreenLeftFuture;
      }
      window.win.setBounds(position);
    }
  }
  async updateWindowControls(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.updateWindowControls(options);
  }
  async updateWindowAccentColor(windowId, color, inactiveColor) {
    if (!isWindows) {
      return;
    }
    const window = this.windowById(windowId);
    if (!window) {
      return;
    }
    let activeWindowAccentColor;
    let inactiveWindowAccentColor;
    if (color === "default") {
      activeWindowAccentColor = null;
      inactiveWindowAccentColor = null;
    } else if (color === "off") {
      activeWindowAccentColor = false;
      inactiveWindowAccentColor = false;
    } else {
      activeWindowAccentColor = color;
      inactiveWindowAccentColor = inactiveColor ?? color;
    }
    const windows = [window];
    for (const auxiliaryWindow of this.auxiliaryWindowsMainService.getWindows()) {
      if (auxiliaryWindow.parentId === windowId) {
        windows.push(auxiliaryWindow);
      }
    }
    for (const window2 of windows) {
      window2.win?.setAccentColor(window2.win.isFocused() ? activeWindowAccentColor : inactiveWindowAccentColor);
    }
  }
  async focusWindow(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.focus({ mode: options?.mode ?? FocusMode.Transfer });
  }
  async setMinimumSize(windowId, width, height) {
    const window = this.codeWindowById(windowId);
    if (window?.win) {
      const [windowWidth, windowHeight] = window.win.getSize();
      const [minWindowWidth, minWindowHeight] = window.win.getMinimumSize();
      const [newMinWindowWidth, newMinWindowHeight] = [width ?? minWindowWidth, height ?? minWindowHeight];
      const [newWindowWidth, newWindowHeight] = [Math.max(windowWidth, newMinWindowWidth), Math.max(windowHeight, newMinWindowHeight)];
      if (minWindowWidth !== newMinWindowWidth || minWindowHeight !== newMinWindowHeight) {
        window.win.setMinimumSize(newMinWindowWidth, newMinWindowHeight);
      }
      if (windowWidth !== newWindowWidth || windowHeight !== newWindowHeight) {
        window.win.setSize(newWindowWidth, newWindowHeight);
      }
    }
  }
  async saveWindowSplash(windowId, splash) {
    const window = this.codeWindowById(windowId);
    this.themeMainService.saveWindowSplash(windowId, window?.openedWorkspace, splash);
  }
  async setBackgroundThrottling(windowId, allowed) {
    const window = this.codeWindowById(windowId);
    this.logService.trace(`Setting background throttling for window ${windowId} to '${allowed}'`);
    window?.win?.webContents?.setBackgroundThrottling(allowed);
  }
  //#endregion
  //#region macOS Shell Command
  async installShellCommand(windowId) {
    const { source, target } = await this.getShellCommandLink();
    try {
      const { symbolicLink } = await SymlinkSupport.stat(source);
      if (symbolicLink && !symbolicLink.dangling) {
        const linkTargetRealPath = await Promises.realpath(source);
        if (target === linkTargetRealPath) {
          return;
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    await this.installShellCommandWithPrivileges(windowId, source, target);
  }
  async installShellCommandWithPrivileges(windowId, source, target) {
    const { response } = await this.showMessageBox(windowId, {
      type: "info",
      message: localize("warnEscalation", "{0} will now prompt with 'osascript' for Administrator privileges to install the shell command.", this.productService.nameShort),
      buttons: [
        localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK"),
        localize("cancel", "Cancel")
      ]
    });
    if (response === 1) {
      throw new CancellationError();
    }
    try {
      const command = `osascript -e "do shell script \\"mkdir -p /usr/local/bin && ln -sf '${target}' '${source}'\\" with administrator privileges"`;
      await promisify(exec)(command);
    } catch (error) {
      throw new Error(localize("cantCreateBinFolder", "Unable to install the shell command '{0}'.", source));
    }
  }
  async uninstallShellCommand(windowId) {
    const { source } = await this.getShellCommandLink();
    try {
      await fs.promises.unlink(source);
    } catch (error) {
      switch (error.code) {
        case "EACCES": {
          const { response } = await this.showMessageBox(windowId, {
            type: "info",
            message: localize("warnEscalationUninstall", "{0} will now prompt with 'osascript' for Administrator privileges to uninstall the shell command.", this.productService.nameShort),
            buttons: [
              localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK"),
              localize("cancel", "Cancel")
            ]
          });
          if (response === 1) {
            throw new CancellationError();
          }
          try {
            const command = `osascript -e "do shell script \\"rm '${source}'\\" with administrator privileges"`;
            await promisify(exec)(command);
          } catch (error2) {
            throw new Error(localize("cantUninstall", "Unable to uninstall the shell command '{0}'.", source));
          }
          break;
        }
        case "ENOENT":
          break;
        // ignore file not found
        default:
          throw error;
      }
    }
  }
  async getShellCommandLink() {
    const target = resolve(this.environmentMainService.appRoot, "bin", "code");
    const source = `/usr/local/bin/${this.productService.applicationName}`;
    const sourceExists = await Promises.exists(target);
    if (!sourceExists) {
      throw new Error(localize("sourceMissing", "Unable to find shell script in '{0}'", target));
    }
    return { source, target };
  }
  //#endregion
  //#region Dialog
  async showMessageBox(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    return this.dialogMainService.showMessageBox(options, window?.win ?? void 0);
  }
  async showSaveDialog(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    return this.dialogMainService.showSaveDialog(options, window?.win ?? void 0);
  }
  async showOpenDialog(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    return this.dialogMainService.showOpenDialog(options, window?.win ?? void 0);
  }
  async pickFileFolderAndOpen(windowId, options) {
    const paths = await this.dialogMainService.pickFileFolder(options);
    if (paths) {
      await this.doOpenPicked(await Promise.all(paths.map(async (path) => await SymlinkSupport.existsDirectory(path) ? { folderUri: URI.file(path) } : { fileUri: URI.file(path) })), options, windowId);
    }
  }
  async pickFolderAndOpen(windowId, options) {
    const paths = await this.dialogMainService.pickFolder(options);
    if (paths) {
      await this.doOpenPicked(paths.map((path) => ({ folderUri: URI.file(path) })), options, windowId);
    }
  }
  async pickFileAndOpen(windowId, options) {
    const paths = await this.dialogMainService.pickFile(options);
    if (paths) {
      await this.doOpenPicked(paths.map((path) => ({ fileUri: URI.file(path) })), options, windowId);
    }
  }
  async pickWorkspaceAndOpen(windowId, options) {
    const paths = await this.dialogMainService.pickWorkspace(options);
    if (paths) {
      await this.doOpenPicked(paths.map((path) => ({ workspaceUri: URI.file(path) })), options, windowId);
    }
  }
  async doOpenPicked(openable, options, windowId) {
    await this.windowsMainService.open({
      context: OpenContext.DIALOG,
      contextWindowId: windowId,
      cli: this.environmentMainService.args,
      urisToOpen: openable,
      forceNewWindow: options.forceNewWindow
      /* remoteAuthority will be determined based on openable */
    });
  }
  //#endregion
  //#region OS
  async showItemInFolder(windowId, path) {
    shell.showItemInFolder(path);
  }
  async setRepresentedFilename(windowId, path, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.setRepresentedFilename(path);
  }
  async setDocumentEdited(windowId, edited, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.setDocumentEdited(edited);
  }
  async openExternal(windowId, url, defaultApplication) {
    this.environmentMainService.unsetSnapExportedVariables();
    try {
      if (matchesSomeScheme(url, Schemas.http, Schemas.https)) {
        this.openExternalBrowser(windowId, url, defaultApplication);
      } else {
        this.doOpenShellExternal(windowId, url);
      }
    } finally {
      this.environmentMainService.restoreSnapExportedVariables();
    }
    return true;
  }
  async openExternalBrowser(windowId, url, defaultApplication) {
    const configuredBrowser = defaultApplication ?? this.configurationService.getValue("workbench.externalBrowser");
    if (!configuredBrowser) {
      return this.doOpenShellExternal(windowId, url);
    }
    if (configuredBrowser.includes(posix.sep) || configuredBrowser.includes(win32.sep)) {
      const browserPathExists = await Promises.exists(configuredBrowser);
      if (!browserPathExists) {
        this.logService.error(`Configured external browser path does not exist: ${configuredBrowser}`);
        return this.doOpenShellExternal(windowId, url);
      }
    }
    try {
      const { default: open, apps } = await import("open");
      const res = await open(url, {
        app: {
          // Use `open.apps` helper to allow cross-platform browser
          // aliases to be looked up properly. Fallback to the
          // configured value if not found.
          name: Object.hasOwn(apps, configuredBrowser) ? apps[configuredBrowser] : configuredBrowser
        }
      });
      if (!isWindows) {
        res.stderr?.once("data", (data) => {
          this.logService.error(`Error openening external URL '${url}' using browser '${configuredBrowser}': ${data.toString()}`);
          return this.doOpenShellExternal(windowId, url);
        });
      }
    } catch (error) {
      this.logService.error(`Unable to open external URL '${url}' using browser '${configuredBrowser}' due to ${error}.`);
      return this.doOpenShellExternal(windowId, url);
    }
  }
  async doOpenShellExternal(windowId, url) {
    try {
      await shell.openExternal(url);
    } catch (error) {
      let isLink;
      let message;
      if (matchesSomeScheme(url, Schemas.http, Schemas.https)) {
        isLink = true;
        message = localize("openExternalErrorLinkMessage", "An error occurred opening a link in your default browser.");
      } else {
        isLink = false;
        message = localize("openExternalProgramErrorMessage", "An error occurred opening an external program.");
      }
      const { response } = await this.dialogMainService.showMessageBox({
        type: "error",
        message,
        detail: error.message,
        buttons: isLink ? [
          localize({ key: "copyLink", comment: ["&& denotes a mnemonic"] }, "&&Copy Link"),
          localize("cancel", "Cancel")
        ] : [
          localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK")
        ]
      }, this.windowById(windowId)?.win ?? void 0);
      if (response === 1) {
        return;
      }
      this.writeClipboardText(windowId, url);
    }
  }
  moveItemToTrash(windowId, fullPath) {
    return shell.trashItem(fullPath);
  }
  async getMediaAccessStatus(windowId, mediaType) {
    if (isMacintosh) {
      return systemPreferences.getMediaAccessStatus(mediaType);
    }
    return "granted";
  }
  async isAdmin() {
    let isAdmin;
    if (isWindows) {
      isAdmin = (await import("native-is-elevated")).default();
    } else {
      isAdmin = process.getuid?.() === 0;
    }
    return isAdmin;
  }
  async writeElevated(windowId, source, target, options) {
    const sudoPrompt = await import("@vscode/sudo-prompt");
    const argsFile = randomPath(this.environmentMainService.userDataPath, "code-elevated");
    await Promises.writeFile(argsFile, JSON.stringify({ source: source.fsPath, target: target.fsPath }));
    try {
      await new Promise((resolve2, reject) => {
        const sudoCommand = [`"${this.cliPath}"`];
        if (options?.unlock) {
          sudoCommand.push("--file-chmod");
        }
        sudoCommand.push("--file-write", `"${argsFile}"`);
        const promptOptions = {
          name: this.productService.nameLong.replace("-", ""),
          icns: isMacintosh && this.environmentMainService.isBuilt ? join(dirname(this.environmentMainService.appRoot), `${this.productService.nameShort}.icns`) : void 0
        };
        this.logService.trace(`[sudo-prompt] running command: ${sudoCommand.join(" ")}`);
        sudoPrompt.exec(sudoCommand.join(" "), promptOptions, (error, stdout, stderr) => {
          if (stdout) {
            this.logService.trace(`[sudo-prompt] received stdout: ${stdout}`);
          }
          if (stderr) {
            this.logService.error(`[sudo-prompt] received stderr: ${stderr}`);
          }
          if (error) {
            reject(error);
          } else {
            resolve2(void 0);
          }
        });
      });
    } finally {
      await fs.promises.unlink(argsFile);
    }
  }
  async isRunningUnderARM64Translation() {
    if (isLinux || isWindows) {
      return false;
    }
    return app.runningUnderARM64Translation;
  }
  get cliPath() {
    if (isWindows) {
      if (this.environmentMainService.isBuilt) {
        return join(dirname(process.execPath), "bin", `${this.productService.applicationName}.cmd`);
      }
      return join(this.environmentMainService.appRoot, "scripts", "code-cli.bat");
    }
    if (isLinux) {
      if (this.environmentMainService.isBuilt) {
        return join(dirname(process.execPath), "bin", `${this.productService.applicationName}`);
      }
      return join(this.environmentMainService.appRoot, "scripts", "code-cli.sh");
    }
    if (this.environmentMainService.isBuilt) {
      return join(this.environmentMainService.appRoot, "bin", "code");
    }
    return join(this.environmentMainService.appRoot, "scripts", "code-cli.sh");
  }
  async getOSStatistics() {
    return {
      totalmem: totalmem(),
      freemem: freemem(),
      loadavg: loadavg()
    };
  }
  async getOSProperties() {
    return {
      arch: arch(),
      platform: platform(),
      release: release(),
      type: type(),
      cpus: cpus()
    };
  }
  async getOSVirtualMachineHint() {
    return virtualMachineHint.value();
  }
  async getOSColorScheme() {
    return this.themeMainService.getColorScheme();
  }
  // WSL
  async hasWSLFeatureInstalled() {
    return isWindows && hasWSLFeatureInstalled();
  }
  //#endregion
  //#region Screenshots
  async getScreenshot(windowId, rect, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    const captured = await window?.win?.webContents.capturePage(rect);
    const buf = captured?.toJPEG(95);
    return buf && VSBuffer.wrap(buf);
  }
  //#endregion
  //#region GitHub mobile upload API
  async uploadFileViaMobileApi(_windowId, token, repoId, fileName, fileBytes, contentType) {
    const { net } = await import("electron");
    const policyResponse = await net.fetch("https://api.github.com/mobile/upload/policy", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        name: fileName,
        size: fileBytes.byteLength,
        content_type: contentType,
        repository_id: parseInt(repoId, 10)
      })
    });
    if (!policyResponse.ok) {
      const text = await policyResponse.text();
      throw new Error(`Policy request failed ${policyResponse.status}: ${text.substring(0, 300)}`);
    }
    const policy = await policyResponse.json();
    const asset = policy.asset;
    const formFields = policy.form;
    const boundary = `----VSCodeUpload${Date.now()}`;
    let multipartBody = "";
    for (const [key, value] of Object.entries(formFields)) {
      multipartBody += `--${boundary}\r
Content-Disposition: form-data; name="${key}"\r
\r
${value}\r
`;
    }
    const safeName = String(asset.name).replace(/[\r\n]+/g, " ").replace(/[\\"]/g, "_");
    multipartBody += `--${boundary}\r
Content-Disposition: form-data; name="file"; filename="${safeName}"\r
Content-Type: ${contentType}\r
\r
`;
    const epilogue = `\r
--${boundary}--\r
`;
    const preambleBytes = Buffer.from(multipartBody, "utf-8");
    const epilogueBytes = Buffer.from(epilogue, "utf-8");
    const bodyBuffer = Buffer.concat([preambleBytes, fileBytes.buffer, epilogueBytes]);
    const s3Response = await net.fetch(policy.upload_url, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: bodyBuffer
    });
    if (s3Response.status !== 204 && s3Response.status !== 201) {
      const text = await s3Response.text();
      throw new Error(`S3 upload failed ${s3Response.status}: ${text.substring(0, 300)}`);
    }
    const confirmResponse = await net.fetch(`https://api.github.com${policy.asset_upload_url}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      }
    });
    if (!confirmResponse.ok) {
      const text = await confirmResponse.text();
      throw new Error(`Asset upload confirmation failed ${confirmResponse.status}: ${text.substring(0, 300)}`);
    }
    return { fileName, assetUrl: asset.href, contentType };
  }
  //#endregion
  //#region Process
  async getProcessId(windowId) {
    const window = this.windowById(void 0, windowId);
    return window?.win?.webContents.getOSProcessId();
  }
  async killProcess(windowId, pid, code) {
    process.kill(pid, code);
  }
  //#endregion
  //#region Clipboard
  async readClipboardText(windowId, type2) {
    this.logService.trace(`readClipboardText in window ${windowId} with type:`, type2);
    const clipboardText = clipboard.readText(type2);
    this.logService.trace(`clipboardText.length :`, clipboardText.length);
    return clipboardText;
  }
  async triggerPaste(windowId, options) {
    this.logService.trace(`Triggering paste in window ${windowId} with options:`, options);
    const window = this.windowById(options?.targetWindowId, windowId);
    return window?.win?.webContents.paste() ?? Promise.resolve();
  }
  async readImage() {
    return clipboard.readImage().toPNG();
  }
  async writeClipboardText(windowId, text, type2) {
    return clipboard.writeText(text, type2);
  }
  async readClipboardFindText(windowId) {
    return clipboard.readFindText();
  }
  async writeClipboardFindText(windowId, text) {
    return clipboard.writeFindText(text);
  }
  async writeClipboardBuffer(windowId, format, buffer, type2) {
    return clipboard.writeBuffer(format, Buffer.from(buffer.buffer), type2);
  }
  async readClipboardBuffer(windowId, format) {
    return VSBuffer.wrap(clipboard.readBuffer(format));
  }
  async hasClipboard(windowId, format, type2) {
    return clipboard.has(format, type2);
  }
  //#endregion
  //#region macOS Touchbar
  async newWindowTab() {
    await this.windowsMainService.open({
      context: OpenContext.API,
      cli: this.environmentMainService.args,
      forceNewTabbedWindow: true,
      forceEmpty: true,
      remoteAuthority: this.environmentMainService.args.remote || void 0
    });
  }
  async showPreviousWindowTab() {
    Menu.sendActionToFirstResponder("selectPreviousTab:");
  }
  async showNextWindowTab() {
    Menu.sendActionToFirstResponder("selectNextTab:");
  }
  async moveWindowTabToNewWindow() {
    Menu.sendActionToFirstResponder("moveTabToNewWindow:");
  }
  async mergeAllWindowTabs() {
    Menu.sendActionToFirstResponder("mergeAllWindows:");
  }
  async toggleWindowTabsBar() {
    Menu.sendActionToFirstResponder("toggleTabBar:");
  }
  async updateTouchBar(windowId, items) {
    const window = this.codeWindowById(windowId);
    window?.updateTouchBar(items);
  }
  //#endregion
  //#region Lifecycle
  async notifyReady(windowId) {
    const window = this.codeWindowById(windowId);
    window?.setReady();
  }
  async relaunch(windowId, options) {
    return this.lifecycleMainService.relaunch(options);
  }
  async reload(windowId, options) {
    const window = this.codeWindowById(windowId);
    if (window) {
      if (isWorkspaceIdentifier(window.openedWorkspace)) {
        const configPath = window.openedWorkspace.configPath;
        if (configPath.scheme === Schemas.file) {
          const workspace = await this.workspacesManagementMainService.resolveLocalWorkspace(configPath);
          if (workspace?.transient) {
            return this.openWindow(window.id, { forceReuseWindow: true });
          }
        }
      }
      return this.lifecycleMainService.reload(window, options?.disableExtensions !== void 0 ? { _: [], "disable-extensions": options.disableExtensions } : void 0);
    }
  }
  async closeWindow(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    return window?.win?.close();
  }
  async quit(windowId) {
    const window = this.windowsMainService.getLastActiveWindow();
    if (window?.isExtensionDevelopmentHost && this.windowsMainService.getWindowCount() > 1 && window.win) {
      window.win.close();
    } else {
      this.lifecycleMainService.quit();
    }
  }
  async exit(windowId, code) {
    await this.lifecycleMainService.kill(code);
  }
  //#endregion
  //#region Connectivity
  async resolveProxy(windowId, url) {
    const window = this.codeWindowById(windowId);
    const session = window?.win?.webContents?.session;
    return session?.resolveProxy(url);
  }
  async resolveProxyWithPackage(_windowId, url) {
    const { resolveProxy } = await import("@vscode/os-proxy-resolver");
    return resolveProxy(url);
  }
  async readProxyConfigWithPackage(_windowId) {
    const { readProxyConfig } = await import("@vscode/os-proxy-resolver");
    return readProxyConfig();
  }
  async lookupAuthorization(_windowId, authInfo) {
    return this.proxyAuthService.lookupAuthorization(authInfo);
  }
  async lookupKerberosAuthorization(_windowId, url) {
    return this.requestService.lookupKerberosAuthorization(url);
  }
  async loadCertificates(_windowId) {
    return this.requestService.loadCertificates();
  }
  isPortFree(windowId, port) {
    return isPortFree(port, 1e3);
  }
  findFreePort(windowId, startPort, giveUpAfter, timeout, stride = 1) {
    return findFreePort(startPort, giveUpAfter, timeout, stride);
  }
  async openDevTools(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.webContents.openDevTools(options?.mode ? { mode: options.mode, activate: options.activate } : void 0);
  }
  async toggleDevTools(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.webContents.toggleDevTools();
  }
  async openDevToolsWindow(windowId, url) {
    const parentWindow = this.codeWindowById(windowId);
    if (!parentWindow) {
      return;
    }
    this.openChildWindow(parentWindow.win, url);
  }
  openChildWindow(parentWindow, url, overrideWindowOptions = {}) {
    const options = this.instantiationService.invokeFunction(defaultBrowserWindowOptions, defaultWindowState(), { forceNativeTitlebar: true });
    const windowOptions = {
      ...options,
      parent: parentWindow ?? void 0,
      ...overrideWindowOptions
    };
    const window = new BrowserWindow(windowOptions);
    window.setMenuBarVisibility(false);
    window.loadURL(url);
    window.once("ready-to-show", () => window.show());
    return window;
  }
  async openGPUInfoWindow(windowId) {
    const parentWindow = this.codeWindowById(windowId);
    if (!parentWindow) {
      return;
    }
    if (typeof this.gpuInfoWindowId !== "number") {
      const gpuInfoWindow = this.openChildWindow(parentWindow.win, "chrome://gpu");
      gpuInfoWindow.once("close", () => this.gpuInfoWindowId = void 0);
      this.gpuInfoWindowId = gpuInfoWindow.id;
    }
    if (typeof this.gpuInfoWindowId === "number") {
      const window = BrowserWindow.fromId(this.gpuInfoWindowId);
      if (window?.isMinimized()) {
        window?.restore();
      }
      window?.focus();
    }
  }
  async openContentTracingWindow() {
    if (typeof this.contentTracingWindowId !== "number") {
      const contentTracingWindow = this.openChildWindow(null, "chrome://tracing", {
        paintWhenInitiallyHidden: false,
        webPreferences: {
          backgroundThrottling: false
        }
      });
      contentTracingWindow.webContents.once("did-finish-load", async () => {
        await contentTracingWindow.webContents.executeJavaScript(`
					window.prompt = () => '';
					null
				`);
        contentTracingWindow.show();
      });
      contentTracingWindow.once("close", () => this.contentTracingWindowId = void 0);
      this.contentTracingWindowId = contentTracingWindow.id;
    }
    if (typeof this.contentTracingWindowId === "number") {
      const window = BrowserWindow.fromId(this.contentTracingWindowId);
      if (window?.isMinimized()) {
        window?.restore();
      }
      window?.focus();
    }
  }
  async startTracing(windowId, categories, options) {
    if (this._isTracing) {
      throw new Error(localize("tracing.alreadyInProgress", 'A tracing session is already in progress. Use command `"{0}"` to stop it first.', "workbench.action.stopTracing"));
    }
    if (options?.enableHeapProfiling) {
      await contentTracing.enableHeapProfiling();
      await contentTracing.startRecording({
        recording_mode: "record-until-full",
        included_categories: categories.split(","),
        memory_dump_config: {
          triggers: [
            { mode: "detailed", type: "periodic_interval", periodic_interval_ms: 1e4 }
          ]
        }
      });
    } else {
      const traceOptions = ["record-until-full", "enable-sampling"];
      await contentTracing.startRecording({
        categoryFilter: categories,
        traceOptions: traceOptions.join(",")
      });
    }
    this._isTracing = true;
  }
  async stopTracing(windowId) {
    if (!this._isTracing && !this.environmentMainService.args.trace) {
      return;
    }
    this._isTracing = false;
    const path = await contentTracing.stopRecording(`${randomPath(this.environmentMainService.userHome.fsPath, this.productService.applicationName)}.trace.txt`);
    await this.dialogMainService.showMessageBox({
      type: "info",
      message: localize("trace.message", "Successfully created the trace file"),
      detail: localize("trace.detail", "Please create an issue and manually attach the following file:\n{0}", path),
      buttons: [localize({ key: "trace.ok", comment: ["&& denotes a mnemonic"] }, "&&OK")]
    }, BrowserWindow.getFocusedWindow() ?? void 0);
    this.showItemInFolder(void 0, path);
  }
  //#endregion
  // #region Performance
  async profileRenderer(windowId, session, duration) {
    const window = this.codeWindowById(windowId);
    if (!window?.win) {
      throw new Error();
    }
    const profiler = new WindowProfiler(window.win, session, this.logService);
    const result = await profiler.inspect(duration);
    return result;
  }
  async showToast(windowId, options) {
    if (!Notification.isSupported()) {
      return { supported: false, clicked: false };
    }
    const toast = new Notification({
      title: options.title,
      body: options.body,
      silent: options.silent,
      actions: options.actions?.map((action) => ({
        type: "button",
        text: action
      }))
    });
    const disposables = new DisposableStore();
    this.activeToasts.set(options.id, disposables);
    const cts = new CancellationTokenSource();
    disposables.add(toDisposable(() => {
      this.activeToasts.deleteAndDispose(options.id);
      toast.removeAllListeners();
      toast.close();
      cts.dispose(true);
    }));
    return new Promise((r) => {
      const resolve2 = (result) => {
        r(result);
        disposables.dispose();
      };
      disposables.add(cts.token.onCancellationRequested(() => resolve2({ supported: true, clicked: false })));
      toast.on("click", () => resolve2({ supported: true, clicked: true }));
      toast.on("action", (_event, actionIndex) => resolve2({ supported: true, clicked: true, actionIndex }));
      toast.on("close", () => resolve2({ supported: true, clicked: false }));
      toast.on("failed", () => resolve2({ supported: false, clicked: false }));
      toast.show();
    });
  }
  async clearToast(windowId, toastId) {
    this.activeToasts.deleteAndDispose(toastId);
  }
  async clearToasts() {
    this.activeToasts.clearAndDisposeAll();
  }
  //#endregion
  //#region Registry (windows)
  async windowsGetStringRegKey(windowId, hive, path, name) {
    if (!isWindows) {
      return void 0;
    }
    const Registry = await import("@vscode/windows-registry");
    try {
      return Registry.GetStringRegKey(hive, path, name);
    } catch {
      return void 0;
    }
  }
  //#endregion
  //#region Zip
  async createZipFile(windowId, zipPath, files) {
    await zip(zipPath.fsPath, files.map((file) => {
      if (hasKey(file, { contents: true })) {
        return file;
      }
      const source = URI.revive(file.source);
      if (source.scheme !== Schemas.file) {
        throw new Error(`Cannot add non-local resource '${source.toString()}' to a zip file`);
      }
      return { path: file.path, localPath: source.fsPath, localPathSize: file.size };
    }));
  }
  //#endregion
  //#region Power
  async getSystemIdleState(windowId, idleThreshold) {
    return powerMonitor.getSystemIdleState(idleThreshold);
  }
  async getSystemIdleTime(windowId) {
    return powerMonitor.getSystemIdleTime();
  }
  async getCurrentThermalState(windowId) {
    return powerMonitor.getCurrentThermalState();
  }
  async isOnBatteryPower(windowId) {
    return powerMonitor.isOnBatteryPower();
  }
  async startPowerSaveBlocker(windowId, type2) {
    return powerSaveBlocker.start(type2);
  }
  async stopPowerSaveBlocker(windowId, id) {
    return powerSaveBlocker.stop(id);
  }
  async isPowerSaveBlockerStarted(windowId, id) {
    return powerSaveBlocker.isStarted(id);
  }
  //#endregion
  windowById(windowId, fallbackCodeWindowId) {
    return this.codeWindowById(windowId) ?? this.auxiliaryWindowById(windowId) ?? this.codeWindowById(fallbackCodeWindowId);
  }
  codeWindowById(windowId) {
    if (typeof windowId !== "number") {
      return void 0;
    }
    return this.windowsMainService.getWindowById(windowId);
  }
  auxiliaryWindowById(windowId) {
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
__decorateClass([
  memoize
], NativeHostMainService.prototype, "cliPath", 1);
NativeHostMainService = __decorateClass([
  __decorateParam(0, IWindowsMainService),
  __decorateParam(1, IAuxiliaryWindowsMainService),
  __decorateParam(2, IDialogMainService),
  __decorateParam(3, ILifecycleMainService),
  __decorateParam(4, IEnvironmentMainService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IThemeMainService),
  __decorateParam(8, IWorkspacesManagementMainService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IRequestService),
  __decorateParam(11, IProxyAuthService),
  __decorateParam(12, IInstantiationService),
  __decorateParam(13, IGlobalKeybindingsMainService)
], NativeHostMainService);
export {
  INativeHostMainService,
  NativeHostMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL25hdGl2ZS9lbGVjdHJvbi1tYWluL25hdGl2ZUhvc3RNYWluU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IGV4ZWMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IGFwcCwgQnJvd3NlcldpbmRvdywgY2xpcGJvYXJkLCBjb250ZW50VHJhY2luZywgRGlzcGxheSwgTWVudSwgTWVzc2FnZUJveE9wdGlvbnMsIE1lc3NhZ2VCb3hSZXR1cm5WYWx1ZSwgTm90aWZpY2F0aW9uLCBPcGVuRGV2VG9vbHNPcHRpb25zLCBPcGVuRGlhbG9nT3B0aW9ucywgT3BlbkRpYWxvZ1JldHVyblZhbHVlLCBwb3dlck1vbml0b3IsIHBvd2VyU2F2ZUJsb2NrZXIsIFNhdmVEaWFsb2dPcHRpb25zLCBTYXZlRGlhbG9nUmV0dXJuVmFsdWUsIHNjcmVlbiwgc2hlbGwsIHN5c3RlbVByZWZlcmVuY2VzLCB3ZWJDb250ZW50cyB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IGFyY2gsIGNwdXMsIGZyZWVtZW0sIGxvYWRhdmcsIHBsYXRmb3JtLCByZWxlYXNlLCB0b3RhbG1lbSwgdHlwZSB9IGZyb20gJ29zJztcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgbWVtb2l6ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBtYXRjaGVzU29tZVNjaGVtZSwgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgam9pbiwgcG9zaXgsIHJlc29sdmUsIHdpbjMyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4LCBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQWRkRmlyc3RQYXJhbWV0ZXJUb0Z1bmN0aW9ucywgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHZpcnR1YWxNYWNoaW5lSGludCB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9pZC5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcywgU3ltbGlua1N1cHBvcnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IGZpbmRGcmVlUG9ydCwgaXNQb3J0RnJlZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9wb3J0cy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJU2VyaWFsaXphYmxlQ29tbWFuZEFjdGlvbiB9IGZyb20gJy4uLy4uL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IElOYXRpdmVPcGVuRGlhbG9nT3B0aW9ucyB9IGZyb20gJy4uLy4uL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSURpYWxvZ01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZGlhbG9ncy9lbGVjdHJvbi1tYWluL2RpYWxvZ01haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvZWxlY3Ryb24tbWFpbi9lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlTWFpblNlcnZpY2UsIElSZWxhdW5jaE9wdGlvbnMgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvZWxlY3Ryb24tbWFpbi9saWZlY3ljbGVNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEZvY3VzTW9kZSwgSUNvbW1vbk5hdGl2ZUhvc3RTZXJ2aWNlLCBJTmF0aXZlSG9zdE9wdGlvbnMsIElOYXRpdmVTeXN0ZW1XaWRlS2V5YmluZGluZywgSU5hdGl2ZVN5c3RlbVdpZGVLZXliaW5kaW5nUmVzdWx0LCBJTmF0aXZlWmlwRmlsZSwgSU9wZW5BZ2VudHNXaW5kb3dPcHRpb25zLCBJT1NQcm9wZXJ0aWVzLCBJT1NQcm94eSwgSU9TUHJveHlDb25maWcsIElPU1N0YXRpc3RpY3MsIElTdGFydFRyYWNpbmdPcHRpb25zLCBJVG9hc3RPcHRpb25zLCBJVG9hc3RSZXN1bHQsIFBvd2VyU2F2ZUJsb2NrZXJUeXBlLCBTeXN0ZW1JZGxlU3RhdGUsIFRoZXJtYWxTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9uYXRpdmUuanMnO1xuaW1wb3J0IHsgSUdsb2JhbEtleWJpbmRpbmdzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9nbG9iYWxLZXliaW5kaW5ncy9lbGVjdHJvbi1tYWluL2dsb2JhbEtleWJpbmRpbmdzTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhcnRzU3BsYXNoIH0gZnJvbSAnLi4vLi4vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3RoZW1lL2VsZWN0cm9uLW1haW4vdGhlbWVNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0V2luZG93U3RhdGUsIElDb2RlV2luZG93IH0gZnJvbSAnLi4vLi4vd2luZG93L2VsZWN0cm9uLW1haW4vd2luZG93LmpzJztcbmltcG9ydCB7IElDb2xvclNjaGVtZSwgSU9wZW5lZEF1eGlsaWFyeVdpbmRvdywgSU9wZW5lZE1haW5XaW5kb3csIElPcGVuRW1wdHlXaW5kb3dPcHRpb25zLCBJT3BlbldpbmRvd09wdGlvbnMsIElQb2ludCwgSVJlY3RhbmdsZSwgSVdpbmRvd09wZW5hYmxlIH0gZnJvbSAnLi4vLi4vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJyb3dzZXJXaW5kb3dPcHRpb25zLCBJV2luZG93c01haW5TZXJ2aWNlLCBPcGVuQ29udGV4dCB9IGZyb20gJy4uLy4uL3dpbmRvd3MvZWxlY3Ryb24tbWFpbi93aW5kb3dzLmpzJztcbmltcG9ydCB7IGlzV29ya3NwYWNlSWRlbnRpZmllciwgdG9Xb3Jrc3BhY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2VzL2VsZWN0cm9uLW1haW4vd29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBoYXNXU0xGZWF0dXJlSW5zdGFsbGVkIH0gZnJvbSAnLi4vLi4vcmVtb3RlL25vZGUvd3NsLmpzJztcbmltcG9ydCB7IFdpbmRvd1Byb2ZpbGVyIH0gZnJvbSAnLi4vLi4vcHJvZmlsaW5nL2VsZWN0cm9uLW1haW4vd2luZG93UHJvZmlsaW5nLmpzJztcbmltcG9ydCB7IElWOFByb2ZpbGUgfSBmcm9tICcuLi8uLi9wcm9maWxpbmcvY29tbW9uL3Byb2ZpbGluZy5qcyc7XG5pbXBvcnQgeyBJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYXV4aWxpYXJ5V2luZG93L2VsZWN0cm9uLW1haW4vYXV4aWxpYXJ5V2luZG93cy5qcyc7XG5pbXBvcnQgeyBJQXV4aWxpYXJ5V2luZG93IH0gZnJvbSAnLi4vLi4vYXV4aWxpYXJ5V2luZG93L2VsZWN0cm9uLW1haW4vYXV4aWxpYXJ5V2luZG93LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IHppcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS96aXAuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJveHlBdXRoU2VydmljZSB9IGZyb20gJy4vYXV0aC5qcyc7XG5pbXBvcnQgeyBBdXRoSW5mbywgQ3JlZGVudGlhbHMsIElSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgcmFuZG9tUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTmF0aXZlSG9zdE1haW5TZXJ2aWNlIGV4dGVuZHMgQWRkRmlyc3RQYXJhbWV0ZXJUb0Z1bmN0aW9uczxJQ29tbW9uTmF0aXZlSG9zdFNlcnZpY2UsIFByb21pc2U8dW5rbm93bj4gLyogb25seSBtZXRob2RzLCBub3QgZXZlbnRzICovLCBudW1iZXIgfCB1bmRlZmluZWQgLyogd2luZG93IElEICovPiB7IH1cblxuZXhwb3J0IGNvbnN0IElOYXRpdmVIb3N0TWFpblNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SU5hdGl2ZUhvc3RNYWluU2VydmljZT4oJ25hdGl2ZUhvc3RNYWluU2VydmljZScpO1xuXG5leHBvcnQgY2xhc3MgTmF0aXZlSG9zdE1haW5TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElOYXRpdmVIb3N0TWFpblNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV2luZG93c01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd2luZG93c01haW5TZXJ2aWNlOiBJV2luZG93c01haW5TZXJ2aWNlLFxuXHRcdEBJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlOiBJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dNYWluU2VydmljZTogSURpYWxvZ01haW5TZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVNYWluU2VydmljZTogSUxpZmVjeWNsZU1haW5TZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50TWFpblNlcnZpY2U6IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJVGhlbWVNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lTWFpblNlcnZpY2U6IElUaGVtZU1haW5TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2U6IElXb3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJUHJveHlBdXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb3h5QXV0aFNlcnZpY2U6IElQcm94eUF1dGhTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJR2xvYmFsS2V5YmluZGluZ3NNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGdsb2JhbEtleWJpbmRpbmdzTWFpblNlcnZpY2U6IElHbG9iYWxLZXliaW5kaW5nc01haW5TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBFdmVudHNcblx0XHR7XG5cdFx0XHR0aGlzLm9uRGlkT3Blbk1haW5XaW5kb3cgPSBFdmVudC5tYXAodGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub25EaWRPcGVuV2luZG93LCB3aW5kb3cgPT4gd2luZG93LmlkKTtcblxuXHRcdFx0dGhpcy5vbkRpZFRyaWdnZXJXaW5kb3dTeXN0ZW1Db250ZXh0TWVudSA9IEV2ZW50LmFueShcblx0XHRcdFx0RXZlbnQubWFwKHRoaXMud2luZG93c01haW5TZXJ2aWNlLm9uRGlkVHJpZ2dlclN5c3RlbUNvbnRleHRNZW51LCAoeyB3aW5kb3csIHgsIHkgfSkgPT4gKHsgd2luZG93SWQ6IHdpbmRvdy5pZCwgeCwgeSB9KSksXG5cdFx0XHRcdEV2ZW50Lm1hcCh0aGlzLmF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZS5vbkRpZFRyaWdnZXJTeXN0ZW1Db250ZXh0TWVudSwgKHsgd2luZG93LCB4LCB5IH0pID0+ICh7IHdpbmRvd0lkOiB3aW5kb3cuaWQsIHgsIHkgfSkpXG5cdFx0XHQpO1xuXG5cdFx0XHR0aGlzLm9uRGlkTWF4aW1pemVXaW5kb3cgPSBFdmVudC5hbnkoXG5cdFx0XHRcdEV2ZW50Lm1hcCh0aGlzLndpbmRvd3NNYWluU2VydmljZS5vbkRpZE1heGltaXplV2luZG93LCB3aW5kb3cgPT4gd2luZG93LmlkKSxcblx0XHRcdFx0RXZlbnQubWFwKHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLm9uRGlkTWF4aW1pemVXaW5kb3csIHdpbmRvdyA9PiB3aW5kb3cuaWQpXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5vbkRpZFVubWF4aW1pemVXaW5kb3cgPSBFdmVudC5hbnkoXG5cdFx0XHRcdEV2ZW50Lm1hcCh0aGlzLndpbmRvd3NNYWluU2VydmljZS5vbkRpZFVubWF4aW1pemVXaW5kb3csIHdpbmRvdyA9PiB3aW5kb3cuaWQpLFxuXHRcdFx0XHRFdmVudC5tYXAodGhpcy5hdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2Uub25EaWRVbm1heGltaXplV2luZG93LCB3aW5kb3cgPT4gd2luZG93LmlkKVxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy5vbkRpZENoYW5nZVdpbmRvd0Z1bGxTY3JlZW4gPSBFdmVudC5hbnkoXG5cdFx0XHRcdEV2ZW50Lm1hcCh0aGlzLndpbmRvd3NNYWluU2VydmljZS5vbkRpZENoYW5nZUZ1bGxTY3JlZW4sIGUgPT4gKHsgd2luZG93SWQ6IGUud2luZG93LmlkLCBmdWxsc2NyZWVuOiBlLmZ1bGxzY3JlZW4gfSkpLFxuXHRcdFx0XHRFdmVudC5tYXAodGhpcy5hdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2Uub25EaWRDaGFuZ2VGdWxsU2NyZWVuLCBlID0+ICh7IHdpbmRvd0lkOiBlLndpbmRvdy5pZCwgZnVsbHNjcmVlbjogZS5mdWxsc2NyZWVuIH0pKVxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy5vbkRpZENoYW5nZVdpbmRvd0Fsd2F5c09uVG9wID0gRXZlbnQuYW55KFxuXHRcdFx0XHRFdmVudC5Ob25lLCAvLyBhbHdheXMgb24gdG9wIGlzIHVuc3VwcG9ydGVkIGluIG1haW4gd2luZG93cyBjdXJyZW50bHlcblx0XHRcdFx0RXZlbnQubWFwKHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLm9uRGlkQ2hhbmdlQWx3YXlzT25Ub3AsIGUgPT4gKHsgd2luZG93SWQ6IGUud2luZG93LmlkLCBhbHdheXNPblRvcDogZS5hbHdheXNPblRvcCB9KSlcblx0XHRcdCk7XG5cblx0XHRcdHRoaXMub25EaWRCbHVyTWFpbldpbmRvdyA9IEV2ZW50LmZpbHRlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihhcHAsICdicm93c2VyLXdpbmRvdy1ibHVyJywgKGV2ZW50LCB3aW5kb3c6IEJyb3dzZXJXaW5kb3cpID0+IHdpbmRvdy5pZCksIHdpbmRvd0lkID0+ICEhdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93QnlJZCh3aW5kb3dJZCkpO1xuXHRcdFx0dGhpcy5vbkRpZEZvY3VzTWFpbldpbmRvdyA9IEV2ZW50LmFueShcblx0XHRcdFx0RXZlbnQubWFwKEV2ZW50LmZpbHRlcihFdmVudC5tYXAodGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub25EaWRDaGFuZ2VXaW5kb3dzQ291bnQsICgpID0+IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldExhc3RBY3RpdmVXaW5kb3coKSksIHdpbmRvdyA9PiAhIXdpbmRvdyksIHdpbmRvdyA9PiB3aW5kb3chLmlkKSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKGFwcCwgJ2Jyb3dzZXItd2luZG93LWZvY3VzJywgKGV2ZW50LCB3aW5kb3c6IEJyb3dzZXJXaW5kb3cpID0+IHdpbmRvdy5pZCksIHdpbmRvd0lkID0+ICEhdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93QnlJZCh3aW5kb3dJZCkpXG5cdFx0XHQpO1xuXG5cdFx0XHR0aGlzLm9uRGlkQmx1ck1haW5PckF1eGlsaWFyeVdpbmRvdyA9IEV2ZW50LmFueShcblx0XHRcdFx0dGhpcy5vbkRpZEJsdXJNYWluV2luZG93LFxuXHRcdFx0XHRFdmVudC5tYXAoRXZlbnQuZmlsdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKGFwcCwgJ2Jyb3dzZXItd2luZG93LWJsdXInLCAoZXZlbnQsIHdpbmRvdzogQnJvd3NlcldpbmRvdykgPT4gdGhpcy5hdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93QnlXZWJDb250ZW50cyh3aW5kb3cud2ViQ29udGVudHMpKSwgd2luZG93ID0+ICEhd2luZG93KSwgd2luZG93ID0+IHdpbmRvdyEuaWQpXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5vbkRpZEZvY3VzTWFpbk9yQXV4aWxpYXJ5V2luZG93ID0gRXZlbnQuYW55KFxuXHRcdFx0XHR0aGlzLm9uRGlkRm9jdXNNYWluV2luZG93LFxuXHRcdFx0XHRFdmVudC5tYXAoRXZlbnQuZmlsdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKGFwcCwgJ2Jyb3dzZXItd2luZG93LWZvY3VzJywgKGV2ZW50LCB3aW5kb3c6IEJyb3dzZXJXaW5kb3cpID0+IHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0J5V2ViQ29udGVudHMod2luZG93LndlYkNvbnRlbnRzKSksIHdpbmRvdyA9PiAhIXdpbmRvdyksIHdpbmRvdyA9PiB3aW5kb3chLmlkKVxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy5vbkRpZFN1c3BlbmRPUyA9IEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHBvd2VyTW9uaXRvciwgJ3N1c3BlbmQnKTtcblx0XHRcdHRoaXMub25EaWRSZXN1bWVPUyA9IEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHBvd2VyTW9uaXRvciwgJ3Jlc3VtZScpO1xuXG5cdFx0XHQvLyBCYXR0ZXJ5IHBvd2VyIGV2ZW50cyAobWFjT1MgYW5kIFdpbmRvd3Mgb25seSlcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VPbkJhdHRlcnlQb3dlciA9IEV2ZW50LmFueShcblx0XHRcdFx0RXZlbnQubWFwKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHBvd2VyTW9uaXRvciwgJ29uLWFjJyksICgpID0+IGZhbHNlKSxcblx0XHRcdFx0RXZlbnQubWFwKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHBvd2VyTW9uaXRvciwgJ29uLWJhdHRlcnknKSwgKCkgPT4gdHJ1ZSlcblx0XHRcdCk7XG5cblx0XHRcdC8vIFRoZXJtYWwgc3RhdGUgZXZlbnRzIChtYWNPUyBvbmx5KVxuXHRcdFx0dGhpcy5vbkRpZENoYW5nZVRoZXJtYWxTdGF0ZSA9IEV2ZW50Lm1hcChcblx0XHRcdFx0RXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXI8eyBzdGF0ZTogVGhlcm1hbFN0YXRlIH0+KHBvd2VyTW9uaXRvciwgJ3RoZXJtYWwtc3RhdGUtY2hhbmdlJyksXG5cdFx0XHRcdGUgPT4gZS5zdGF0ZVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gU3BlZWQgbGltaXQgZXZlbnRzIChtYWNPUyBhbmQgV2luZG93cyBvbmx5KVxuXHRcdFx0dGhpcy5vbkRpZENoYW5nZVNwZWVkTGltaXQgPSBFdmVudC5tYXAoXG5cdFx0XHRcdEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPHsgbGltaXQ6IG51bWJlciB9Pihwb3dlck1vbml0b3IsICdzcGVlZC1saW1pdC1jaGFuZ2UnKSxcblx0XHRcdFx0ZSA9PiBlLmxpbWl0XG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBTaHV0ZG93biBldmVudCAoTGludXggYW5kIG1hY09TIG9ubHkpXG5cdFx0XHR0aGlzLm9uV2lsbFNodXRkb3duT1MgPSBFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihwb3dlck1vbml0b3IsICdzaHV0ZG93bicpO1xuXG5cdFx0XHQvLyBTY3JlZW4gbG9jayBldmVudHMgKG1hY09TIGFuZCBXaW5kb3dzIG9ubHkpXG5cdFx0XHR0aGlzLm9uRGlkTG9ja1NjcmVlbiA9IEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHBvd2VyTW9uaXRvciwgJ2xvY2stc2NyZWVuJyk7XG5cdFx0XHR0aGlzLm9uRGlkVW5sb2NrU2NyZWVuID0gRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIocG93ZXJNb25pdG9yLCAndW5sb2NrLXNjcmVlbicpO1xuXG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlQ29sb3JTY2hlbWUgPSB0aGlzLnRoZW1lTWFpblNlcnZpY2Uub25EaWRDaGFuZ2VDb2xvclNjaGVtZTtcblxuXHRcdFx0dGhpcy5vbkRpZENoYW5nZURpc3BsYXkgPSBFdmVudC5kZWJvdW5jZShFdmVudC5hbnkoXG5cdFx0XHRcdEV2ZW50LmZpbHRlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihzY3JlZW4sICdkaXNwbGF5LW1ldHJpY3MtY2hhbmdlZCcsIChldmVudDogRWxlY3Ryb24uRXZlbnQsIGRpc3BsYXk6IERpc3BsYXksIGNoYW5nZWRNZXRyaWNzPzogc3RyaW5nW10pID0+IGNoYW5nZWRNZXRyaWNzKSwgY2hhbmdlZE1ldHJpY3MgPT4ge1xuXHRcdFx0XHRcdC8vIEVsZWN0cm9uIHdpbGwgZW1pdCAnZGlzcGxheS1tZXRyaWNzLWNoYW5nZWQnIGV2ZW50cyBldmVuIHdoZW4gYWN0dWFsbHlcblx0XHRcdFx0XHQvLyBnb2luZyBmdWxsc2NyZWVuLCBiZWNhdXNlIHRoZSBkb2NrIGhpZGVzLiBIb3dldmVyLCB3ZSBkbyBub3Qgd2FudCB0b1xuXHRcdFx0XHRcdC8vIHJlYWN0IG9uIHRoaXMgZXZlbnQgYXMgdGhlcmUgaXMgbm8gY2hhbmdlIGluIGRpc3BsYXkgYm91bmRzLlxuXHRcdFx0XHRcdHJldHVybiAhKEFycmF5LmlzQXJyYXkoY2hhbmdlZE1ldHJpY3MpICYmIGNoYW5nZWRNZXRyaWNzLmxlbmd0aCA9PT0gMSAmJiBjaGFuZ2VkTWV0cmljc1swXSA9PT0gJ3dvcmtBcmVhJyk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihzY3JlZW4sICdkaXNwbGF5LWFkZGVkJyksXG5cdFx0XHRcdEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHNjcmVlbiwgJ2Rpc3BsYXktcmVtb3ZlZCcpXG5cdFx0XHQpLCAoKSA9PiB7IH0sIDEwMCk7XG5cdFx0fVxuXHR9XG5cblxuXHQvLyNyZWdpb24gUHJvcGVydGllc1xuXG5cdGdldCB3aW5kb3dJZCgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkIGluIGVsZWN0cm9uLW1haW4nKTsgfVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cblx0Ly8jcmVnaW9uIEV2ZW50c1xuXG5cdHJlYWRvbmx5IG9uRGlkT3Blbk1haW5XaW5kb3c6IEV2ZW50PG51bWJlcj47XG5cblx0cmVhZG9ubHkgb25EaWRUcmlnZ2VyV2luZG93U3lzdGVtQ29udGV4dE1lbnU6IEV2ZW50PHsgd2luZG93SWQ6IG51bWJlcjsgeDogbnVtYmVyOyB5OiBudW1iZXIgfT47XG5cblx0cmVhZG9ubHkgb25EaWRNYXhpbWl6ZVdpbmRvdzogRXZlbnQ8bnVtYmVyPjtcblx0cmVhZG9ubHkgb25EaWRVbm1heGltaXplV2luZG93OiBFdmVudDxudW1iZXI+O1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlV2luZG93RnVsbFNjcmVlbjogRXZlbnQ8eyByZWFkb25seSB3aW5kb3dJZDogbnVtYmVyOyByZWFkb25seSBmdWxsc2NyZWVuOiBib29sZWFuIH0+O1xuXG5cdHJlYWRvbmx5IG9uRGlkQmx1ck1haW5XaW5kb3c6IEV2ZW50PG51bWJlcj47XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXNNYWluV2luZG93OiBFdmVudDxudW1iZXI+O1xuXG5cdHJlYWRvbmx5IG9uRGlkQmx1ck1haW5PckF1eGlsaWFyeVdpbmRvdzogRXZlbnQ8bnVtYmVyPjtcblx0cmVhZG9ubHkgb25EaWRGb2N1c01haW5PckF1eGlsaWFyeVdpbmRvdzogRXZlbnQ8bnVtYmVyPjtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVdpbmRvd0Fsd2F5c09uVG9wOiBFdmVudDx7IHJlYWRvbmx5IHdpbmRvd0lkOiBudW1iZXI7IHJlYWRvbmx5IGFsd2F5c09uVG9wOiBib29sZWFuIH0+O1xuXG5cdHJlYWRvbmx5IG9uRGlkU3VzcGVuZE9TOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRSZXN1bWVPUzogRXZlbnQ8dm9pZD47XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VPbkJhdHRlcnlQb3dlcjogRXZlbnQ8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVGhlcm1hbFN0YXRlOiBFdmVudDxUaGVybWFsU3RhdGU+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNwZWVkTGltaXQ6IEV2ZW50PG51bWJlcj47XG5cdHJlYWRvbmx5IG9uV2lsbFNodXRkb3duT1M6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbkRpZExvY2tTY3JlZW46IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbkRpZFVubG9ja1NjcmVlbjogRXZlbnQ8dm9pZD47XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb2xvclNjaGVtZTogRXZlbnQ8SUNvbG9yU2NoZW1lPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVBhc3N3b3JkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBhY2NvdW50OiBzdHJpbmc7IHNlcnZpY2U6IHN0cmluZyB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQYXNzd29yZCA9IHRoaXMuX29uRGlkQ2hhbmdlUGFzc3dvcmQuZXZlbnQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEaXNwbGF5OiBFdmVudDx2b2lkPjtcblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBXaW5kb3dcblxuXHRnZXRXaW5kb3dzKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM6IHsgaW5jbHVkZUF1eGlsaWFyeVdpbmRvd3M6IHRydWUgfSk6IFByb21pc2U8QXJyYXk8SU9wZW5lZE1haW5XaW5kb3cgfCBJT3BlbmVkQXV4aWxpYXJ5V2luZG93Pj47XG5cdGdldFdpbmRvd3Mod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9uczogeyBpbmNsdWRlQXV4aWxpYXJ5V2luZG93czogZmFsc2UgfSk6IFByb21pc2U8QXJyYXk8SU9wZW5lZE1haW5XaW5kb3c+Pjtcblx0YXN5bmMgZ2V0V2luZG93cyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zOiB7IGluY2x1ZGVBdXhpbGlhcnlXaW5kb3dzOiBib29sZWFuIH0pOiBQcm9taXNlPEFycmF5PElPcGVuZWRNYWluV2luZG93IHwgSU9wZW5lZEF1eGlsaWFyeVdpbmRvdz4+IHtcblx0XHRjb25zdCBtYWluV2luZG93cyA9IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd3MoKS5tYXAod2luZG93ID0+ICh7XG5cdFx0XHRpZDogd2luZG93LmlkLFxuXHRcdFx0d29ya3NwYWNlOiB3aW5kb3cub3BlbmVkV29ya3NwYWNlID8/IHRvV29ya3NwYWNlSWRlbnRpZmllcih3aW5kb3cuYmFja3VwUGF0aCwgd2luZG93LmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnRIb3N0KSxcblx0XHRcdHRpdGxlOiB3aW5kb3cud2luPy5nZXRUaXRsZSgpID8/ICcnLFxuXHRcdFx0ZmlsZW5hbWU6IHdpbmRvdy5nZXRSZXByZXNlbnRlZEZpbGVuYW1lKCksXG5cdFx0XHRkaXJ0eTogd2luZG93LmlzRG9jdW1lbnRFZGl0ZWQoKVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGF1eGlsaWFyeVdpbmRvd3MgPSBbXTtcblx0XHRpZiAob3B0aW9ucy5pbmNsdWRlQXV4aWxpYXJ5V2luZG93cykge1xuXHRcdFx0YXV4aWxpYXJ5V2luZG93cy5wdXNoKC4uLnRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd3MoKS5tYXAod2luZG93ID0+ICh7XG5cdFx0XHRcdGlkOiB3aW5kb3cuaWQsXG5cdFx0XHRcdHBhcmVudElkOiB3aW5kb3cucGFyZW50SWQsXG5cdFx0XHRcdHRpdGxlOiB3aW5kb3cud2luPy5nZXRUaXRsZSgpID8/ICcnLFxuXHRcdFx0XHRmaWxlbmFtZTogd2luZG93LmdldFJlcHJlc2VudGVkRmlsZW5hbWUoKVxuXHRcdFx0fSkpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gWy4uLm1haW5XaW5kb3dzLCAuLi5hdXhpbGlhcnlXaW5kb3dzXTtcblx0fVxuXG5cdGFzeW5jIGdldFdpbmRvd0NvdW50KHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdHJldHVybiB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dDb3VudCgpO1xuXHR9XG5cblx0YXN5bmMgZ2V0QWN0aXZlV2luZG93SWQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWN0aXZlV2luZG93ID0gdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0Rm9jdXNlZFdpbmRvdygpIHx8IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldExhc3RBY3RpdmVXaW5kb3coKTtcblx0XHRpZiAoYWN0aXZlV2luZG93KSB7XG5cdFx0XHRyZXR1cm4gYWN0aXZlV2luZG93LmlkO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBnZXRBY3RpdmVXaW5kb3dQb3NpdGlvbigpOiBQcm9taXNlPElSZWN0YW5nbGUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhY3RpdmVXaW5kb3cgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRGb2N1c2VkV2luZG93KCkgfHwgdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0TGFzdEFjdGl2ZVdpbmRvdygpO1xuXHRcdGlmIChhY3RpdmVXaW5kb3cpIHtcblx0XHRcdHJldHVybiBhY3RpdmVXaW5kb3cuZ2V0Qm91bmRzKCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBnZXROYXRpdmVXaW5kb3dIYW5kbGUoZmFsbGJhY2tXaW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCB3aW5kb3dJZDogbnVtYmVyKTogUHJvbWlzZTxWU0J1ZmZlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZCh3aW5kb3dJZCwgZmFsbGJhY2tXaW5kb3dJZCk7XG5cdFx0aWYgKHdpbmRvdz8ud2luKSB7XG5cdFx0XHRyZXR1cm4gVlNCdWZmZXIud3JhcCh3aW5kb3cud2luLmdldE5hdGl2ZVdpbmRvd0hhbmRsZSgpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG9wZW5XaW5kb3cod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElPcGVuRW1wdHlXaW5kb3dPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0b3BlbldpbmRvdyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0b09wZW46IElXaW5kb3dPcGVuYWJsZVtdLCBvcHRpb25zPzogSU9wZW5XaW5kb3dPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0b3BlbldpbmRvdyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBhcmcxPzogSU9wZW5FbXB0eVdpbmRvd09wdGlvbnMgfCBJV2luZG93T3BlbmFibGVbXSwgYXJnMj86IElPcGVuV2luZG93T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGFyZzEpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb09wZW5XaW5kb3cod2luZG93SWQsIGFyZzEsIGFyZzIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRvT3BlbkVtcHR5V2luZG93KHdpbmRvd0lkLCBhcmcxKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9PcGVuV2luZG93KHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHRvT3BlbjogSVdpbmRvd09wZW5hYmxlW10sIG9wdGlvbnM6IElPcGVuV2luZG93T3B0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodG9PcGVuLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHdpbmRvd3MgPSBhd2FpdCB0aGlzLndpbmRvd3NNYWluU2VydmljZS5vcGVuKHtcblx0XHRcdFx0Y29udGV4dDogT3BlbkNvbnRleHQuQVBJLFxuXHRcdFx0XHRjb250ZXh0V2luZG93SWQ6IHdpbmRvd0lkLFxuXHRcdFx0XHR1cmlzVG9PcGVuOiB0b09wZW4sXG5cdFx0XHRcdGNsaTogdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3MsXG5cdFx0XHRcdGZvcmNlTmV3V2luZG93OiBvcHRpb25zLmZvcmNlTmV3V2luZG93LFxuXHRcdFx0XHRmb3JjZVJldXNlV2luZG93OiBvcHRpb25zLmZvcmNlUmV1c2VXaW5kb3csXG5cdFx0XHRcdHByZWZlck5ld1dpbmRvdzogb3B0aW9ucy5wcmVmZXJOZXdXaW5kb3csXG5cdFx0XHRcdGRpZmZNb2RlOiBvcHRpb25zLmRpZmZNb2RlLFxuXHRcdFx0XHRtZXJnZU1vZGU6IG9wdGlvbnMubWVyZ2VNb2RlLFxuXHRcdFx0XHRhZGRNb2RlOiBvcHRpb25zLmFkZE1vZGUsXG5cdFx0XHRcdHJlbW92ZU1vZGU6IG9wdGlvbnMucmVtb3ZlTW9kZSxcblx0XHRcdFx0Z290b0xpbmVNb2RlOiBvcHRpb25zLmdvdG9MaW5lTW9kZSxcblx0XHRcdFx0bm9SZWNlbnRFbnRyeTogb3B0aW9ucy5ub1JlY2VudEVudHJ5LFxuXHRcdFx0XHR3YWl0TWFya2VyRmlsZVVSSTogb3B0aW9ucy53YWl0TWFya2VyRmlsZVVSSSxcblx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiBvcHRpb25zLnJlbW90ZUF1dGhvcml0eSB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdGZvcmNlUHJvZmlsZTogb3B0aW9ucy5mb3JjZVByb2ZpbGUsXG5cdFx0XHRcdGZvcmNlVGVtcFByb2ZpbGU6IG9wdGlvbnMuZm9yY2VUZW1wUHJvZmlsZSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBIYW5kIG9mZiBhIGNoYXQgc2Vzc2lvbiB0byB0aGUgb3BlbmVkIHdpbmRvdyBzbyBpdCByZXN0b3JlcyBib3RoIHRoZVxuXHRcdFx0Ly8gZm9sZGVyIGFuZCB0aGUgc2Vzc2lvbiAoZS5nLiB0aGUgQWdlbnRzIHdpbmRvdyBcIk9wZW4gaW4gVlMgQ29kZVwiIGZsb3cpLlxuXHRcdFx0Ly8gT25seSBtZWFuaW5nZnVsIHdoZW4gZXhhY3RseSBvbmUgd2luZG93IGlzIG9wZW5lZCBzbyB0aGUgc2Vzc2lvbiBpc1xuXHRcdFx0Ly8gbm90IHNlbnQgdG8gYW4gYW1iaWd1b3VzIHRhcmdldC5cblx0XHRcdGNvbnN0IGNoYXRTZXNzaW9uVG9PcGVuID0gb3B0aW9ucy5jaGF0U2Vzc2lvblRvT3Blbjtcblx0XHRcdGlmIChjaGF0U2Vzc2lvblRvT3BlbiAmJiB3aW5kb3dzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHR3aW5kb3dzWzBdLnNlbmRXaGVuUmVhZHkoJ3ZzY29kZTpvcGVuQ2hhdFNlc3Npb24nLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCBVUkkucmV2aXZlKGNoYXRTZXNzaW9uVG9PcGVuKS50b1N0cmluZygpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvT3BlbkVtcHR5V2luZG93KHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJT3BlbkVtcHR5V2luZG93T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMud2luZG93c01haW5TZXJ2aWNlLm9wZW5FbXB0eVdpbmRvdyh7XG5cdFx0XHRjb250ZXh0OiBPcGVuQ29udGV4dC5BUEksXG5cdFx0XHRjb250ZXh0V2luZG93SWQ6IHdpbmRvd0lkXG5cdFx0fSwgb3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBvcGVuQWdlbnRzV2luZG93KHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJT3BlbkFnZW50c1dpbmRvd09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aW5kb3dzID0gYXdhaXQgdGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub3BlbkFnZW50c1dpbmRvdyh7XG5cdFx0XHRjb250ZXh0OiBPcGVuQ29udGV4dC5BUEksXG5cdFx0XHRjb250ZXh0V2luZG93SWQ6IHdpbmRvd0lkLFxuXHRcdFx0Y2xpOiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncyxcblx0XHR9LCBvcHRpb25zPy5mb2xkZXJVcmkgPyBVUkkucmV2aXZlKG9wdGlvbnMuZm9sZGVyVXJpKSA6IHVuZGVmaW5lZCwgb3B0aW9ucz8uc2Vzc2lvblJlc291cmNlID8gVVJJLnJldml2ZShvcHRpb25zLnNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQsIG9wdGlvbnM/LnNvdXJjZSk7XG5cdFx0aWYgKHdpbmRvd3MubGVuZ3RoID4gMCkge1xuXHRcdFx0d2luZG93c1swXS5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHN5bmNTeXN0ZW1XaWRlS2V5YmluZGluZ3Mod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwga2V5YmluZGluZ3M6IElOYXRpdmVTeXN0ZW1XaWRlS2V5YmluZGluZ1tdKTogUHJvbWlzZTxJTmF0aXZlU3lzdGVtV2lkZUtleWJpbmRpbmdSZXN1bHQ+IHtcblx0XHRpZiAodHlwZW9mIHdpbmRvd0lkICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIHsgZmFpbGVkOiBbXSB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nbG9iYWxLZXliaW5kaW5nc01haW5TZXJ2aWNlLnVwZGF0ZUtleWJpbmRpbmdzKHdpbmRvd0lkLCBrZXliaW5kaW5ncyk7XG5cdH1cblxuXHRhc3luYyBpc0Z1bGxTY3JlZW4od2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdHJldHVybiB3aW5kb3c/LmlzRnVsbFNjcmVlbiA/PyBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIHRvZ2dsZUZ1bGxTY3JlZW4od2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdHdpbmRvdz8udG9nZ2xlRnVsbFNjcmVlbigpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q3Vyc29yU2NyZWVuUG9pbnQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8eyByZWFkb25seSBwb2ludDogSVBvaW50OyByZWFkb25seSBkaXNwbGF5OiBJUmVjdGFuZ2xlIH0+IHtcblx0XHRjb25zdCBwb2ludCA9IHNjcmVlbi5nZXRDdXJzb3JTY3JlZW5Qb2ludCgpO1xuXHRcdGNvbnN0IGRpc3BsYXkgPSBzY3JlZW4uZ2V0RGlzcGxheU5lYXJlc3RQb2ludChwb2ludCk7XG5cblx0XHRyZXR1cm4geyBwb2ludCwgZGlzcGxheTogZGlzcGxheS5ib3VuZHMgfTtcblx0fVxuXG5cdGFzeW5jIGlzTWF4aW1pemVkKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKTtcblx0XHRyZXR1cm4gd2luZG93Py53aW4/LmlzTWF4aW1pemVkKCkgPz8gZmFsc2U7XG5cdH1cblxuXHRhc3luYyBtYXhpbWl6ZVdpbmRvdyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0d2luZG93Py53aW4/Lm1heGltaXplKCk7XG5cdH1cblxuXHRhc3luYyB1bm1heGltaXplV2luZG93KHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKTtcblx0XHR3aW5kb3c/Lndpbj8udW5tYXhpbWl6ZSgpO1xuXHR9XG5cblx0YXN5bmMgbWluaW1pemVXaW5kb3cod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdHdpbmRvdz8ud2luPy5taW5pbWl6ZSgpO1xuXHR9XG5cblx0YXN5bmMgbW92ZVdpbmRvd1RvcCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0d2luZG93Py53aW4/Lm1vdmVUb3AoKTtcblx0fVxuXG5cdGFzeW5jIGlzV2luZG93QWx3YXlzT25Ub3Aod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdHJldHVybiB3aW5kb3c/Lndpbj8uaXNBbHdheXNPblRvcCgpID8/IGZhbHNlO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlV2luZG93QWx3YXlzT25Ub3Aod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdHdpbmRvdz8ud2luPy5zZXRBbHdheXNPblRvcCghd2luZG93Lndpbi5pc0Fsd2F5c09uVG9wKCkpO1xuXHR9XG5cblx0YXN5bmMgc2V0V2luZG93QWx3YXlzT25Ub3Aod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgYWx3YXlzT25Ub3A6IGJvb2xlYW4sIG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKTtcblx0XHR3aW5kb3c/Lndpbj8uc2V0QWx3YXlzT25Ub3AoYWx3YXlzT25Ub3ApO1xuXHR9XG5cblx0YXN5bmMgcG9zaXRpb25XaW5kb3cod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgcG9zaXRpb246IElSZWN0YW5nbGUsIG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKTtcblx0XHRpZiAod2luZG93Py53aW4pIHtcblx0XHRcdGlmICh3aW5kb3cud2luLmlzRnVsbFNjcmVlbigpKSB7XG5cdFx0XHRcdGNvbnN0IGZ1bGxzY3JlZW5MZWZ0RnV0dXJlID0gRXZlbnQudG9Qcm9taXNlKEV2ZW50Lm9uY2UoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIod2luZG93LndpbiwgJ2xlYXZlLWZ1bGwtc2NyZWVuJykpKTtcblx0XHRcdFx0d2luZG93Lndpbi5zZXRGdWxsU2NyZWVuKGZhbHNlKTtcblx0XHRcdFx0YXdhaXQgZnVsbHNjcmVlbkxlZnRGdXR1cmU7XG5cdFx0XHR9XG5cblx0XHRcdHdpbmRvdy53aW4uc2V0Qm91bmRzKHBvc2l0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB1cGRhdGVXaW5kb3dDb250cm9scyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zOiBJTmF0aXZlSG9zdE9wdGlvbnMgJiB7IGhlaWdodD86IG51bWJlcjsgYmFja2dyb3VuZENvbG9yPzogc3RyaW5nOyBmb3JlZ3JvdW5kQ29sb3I/OiBzdHJpbmc7IGRpbW1lZD86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdHdpbmRvdz8udXBkYXRlV2luZG93Q29udHJvbHMob3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVXaW5kb3dBY2NlbnRDb2xvcih3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBjb2xvcjogJ2RlZmF1bHQnIHwgJ29mZicgfCBzdHJpbmcsIGluYWN0aXZlQ29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRyZXR1cm47IC8vIHdpbmRvd3Mgb25seVxuXHRcdH1cblxuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZCh3aW5kb3dJZCk7XG5cdFx0aWYgKCF3aW5kb3cpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgYWN0aXZlV2luZG93QWNjZW50Q29sb3I6IHN0cmluZyB8IGJvb2xlYW4gfCBudWxsO1xuXHRcdGxldCBpbmFjdGl2ZVdpbmRvd0FjY2VudENvbG9yOiBzdHJpbmcgfCBib29sZWFuIHwgbnVsbDtcblxuXHRcdGlmIChjb2xvciA9PT0gJ2RlZmF1bHQnKSB7XG5cdFx0XHRhY3RpdmVXaW5kb3dBY2NlbnRDb2xvciA9IG51bGw7XG5cdFx0XHRpbmFjdGl2ZVdpbmRvd0FjY2VudENvbG9yID0gbnVsbDtcblx0XHR9IGVsc2UgaWYgKGNvbG9yID09PSAnb2ZmJykge1xuXHRcdFx0YWN0aXZlV2luZG93QWNjZW50Q29sb3IgPSBmYWxzZTtcblx0XHRcdGluYWN0aXZlV2luZG93QWNjZW50Q29sb3IgPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YWN0aXZlV2luZG93QWNjZW50Q29sb3IgPSBjb2xvcjtcblx0XHRcdGluYWN0aXZlV2luZG93QWNjZW50Q29sb3IgPSBpbmFjdGl2ZUNvbG9yID8/IGNvbG9yO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpbmRvd3MgPSBbd2luZG93XTtcblx0XHRmb3IgKGNvbnN0IGF1eGlsaWFyeVdpbmRvdyBvZiB0aGlzLmF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dzKCkpIHtcblx0XHRcdGlmIChhdXhpbGlhcnlXaW5kb3cucGFyZW50SWQgPT09IHdpbmRvd0lkKSB7XG5cdFx0XHRcdHdpbmRvd3MucHVzaChhdXhpbGlhcnlXaW5kb3cpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgd2luZG93IG9mIHdpbmRvd3MpIHtcblx0XHRcdHdpbmRvdy53aW4/LnNldEFjY2VudENvbG9yKHdpbmRvdy53aW4uaXNGb2N1c2VkKCkgPyBhY3RpdmVXaW5kb3dBY2NlbnRDb2xvciA6IGluYWN0aXZlV2luZG93QWNjZW50Q29sb3IpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGZvY3VzV2luZG93KHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMgJiB7IG1vZGU/OiBGb2N1c01vZGUgfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdHdpbmRvdz8uZm9jdXMoeyBtb2RlOiBvcHRpb25zPy5tb2RlID8/IEZvY3VzTW9kZS5UcmFuc2ZlciB9KTtcblx0fVxuXG5cdGFzeW5jIHNldE1pbmltdW1TaXplKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQsIGhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy5jb2RlV2luZG93QnlJZCh3aW5kb3dJZCk7XG5cdFx0aWYgKHdpbmRvdz8ud2luKSB7XG5cdFx0XHRjb25zdCBbd2luZG93V2lkdGgsIHdpbmRvd0hlaWdodF0gPSB3aW5kb3cud2luLmdldFNpemUoKTtcblx0XHRcdGNvbnN0IFttaW5XaW5kb3dXaWR0aCwgbWluV2luZG93SGVpZ2h0XSA9IHdpbmRvdy53aW4uZ2V0TWluaW11bVNpemUoKTtcblx0XHRcdGNvbnN0IFtuZXdNaW5XaW5kb3dXaWR0aCwgbmV3TWluV2luZG93SGVpZ2h0XSA9IFt3aWR0aCA/PyBtaW5XaW5kb3dXaWR0aCwgaGVpZ2h0ID8/IG1pbldpbmRvd0hlaWdodF07XG5cdFx0XHRjb25zdCBbbmV3V2luZG93V2lkdGgsIG5ld1dpbmRvd0hlaWdodF0gPSBbTWF0aC5tYXgod2luZG93V2lkdGgsIG5ld01pbldpbmRvd1dpZHRoKSwgTWF0aC5tYXgod2luZG93SGVpZ2h0LCBuZXdNaW5XaW5kb3dIZWlnaHQpXTtcblxuXHRcdFx0aWYgKG1pbldpbmRvd1dpZHRoICE9PSBuZXdNaW5XaW5kb3dXaWR0aCB8fCBtaW5XaW5kb3dIZWlnaHQgIT09IG5ld01pbldpbmRvd0hlaWdodCkge1xuXHRcdFx0XHR3aW5kb3cud2luLnNldE1pbmltdW1TaXplKG5ld01pbldpbmRvd1dpZHRoLCBuZXdNaW5XaW5kb3dIZWlnaHQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHdpbmRvd1dpZHRoICE9PSBuZXdXaW5kb3dXaWR0aCB8fCB3aW5kb3dIZWlnaHQgIT09IG5ld1dpbmRvd0hlaWdodCkge1xuXHRcdFx0XHR3aW5kb3cud2luLnNldFNpemUobmV3V2luZG93V2lkdGgsIG5ld1dpbmRvd0hlaWdodCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2F2ZVdpbmRvd1NwbGFzaCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBzcGxhc2g6IElQYXJ0c1NwbGFzaCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMuY29kZVdpbmRvd0J5SWQod2luZG93SWQpO1xuXG5cdFx0dGhpcy50aGVtZU1haW5TZXJ2aWNlLnNhdmVXaW5kb3dTcGxhc2god2luZG93SWQsIHdpbmRvdz8ub3BlbmVkV29ya3NwYWNlLCBzcGxhc2gpO1xuXHR9XG5cblx0YXN5bmMgc2V0QmFja2dyb3VuZFRocm90dGxpbmcod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgYWxsb3dlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMuY29kZVdpbmRvd0J5SWQod2luZG93SWQpO1xuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBTZXR0aW5nIGJhY2tncm91bmQgdGhyb3R0bGluZyBmb3Igd2luZG93ICR7d2luZG93SWR9IHRvICcke2FsbG93ZWR9J2ApO1xuXG5cdFx0d2luZG93Py53aW4/LndlYkNvbnRlbnRzPy5zZXRCYWNrZ3JvdW5kVGhyb3R0bGluZyhhbGxvd2VkKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cblx0Ly8jcmVnaW9uIG1hY09TIFNoZWxsIENvbW1hbmRcblxuXHRhc3luYyBpbnN0YWxsU2hlbGxDb21tYW5kKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IHNvdXJjZSwgdGFyZ2V0IH0gPSBhd2FpdCB0aGlzLmdldFNoZWxsQ29tbWFuZExpbmsoKTtcblxuXHRcdC8vIE9ubHkgaW5zdGFsbCB1bmxlc3MgYWxyZWFkeSBleGlzdGluZ1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB7IHN5bWJvbGljTGluayB9ID0gYXdhaXQgU3ltbGlua1N1cHBvcnQuc3RhdChzb3VyY2UpO1xuXHRcdFx0aWYgKHN5bWJvbGljTGluayAmJiAhc3ltYm9saWNMaW5rLmRhbmdsaW5nKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmtUYXJnZXRSZWFsUGF0aCA9IGF3YWl0IFByb21pc2VzLnJlYWxwYXRoKHNvdXJjZSk7XG5cdFx0XHRcdGlmICh0YXJnZXQgPT09IGxpbmtUYXJnZXRSZWFsUGF0aCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoZXJyb3IuY29kZSAhPT0gJ0VOT0VOVCcpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7IC8vIHRocm93IG9uIGFueSBlcnJvciBidXQgZmlsZSBub3QgZm91bmRcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmluc3RhbGxTaGVsbENvbW1hbmRXaXRoUHJpdmlsZWdlcyh3aW5kb3dJZCwgc291cmNlLCB0YXJnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbnN0YWxsU2hlbGxDb21tYW5kV2l0aFByaXZpbGVnZXMod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgc291cmNlOiBzdHJpbmcsIHRhcmdldDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyByZXNwb25zZSB9ID0gYXdhaXQgdGhpcy5zaG93TWVzc2FnZUJveCh3aW5kb3dJZCwge1xuXHRcdFx0dHlwZTogJ2luZm8nLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3dhcm5Fc2NhbGF0aW9uJywgXCJ7MH0gd2lsbCBub3cgcHJvbXB0IHdpdGggJ29zYXNjcmlwdCcgZm9yIEFkbWluaXN0cmF0b3IgcHJpdmlsZWdlcyB0byBpbnN0YWxsIHRoZSBzaGVsbCBjb21tYW5kLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCksXG5cdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKHsga2V5OiAnb2snLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZPS1wiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2NhbmNlbCcsIFwiQ2FuY2VsXCIpXG5cdFx0XHRdXG5cdFx0fSk7XG5cblx0XHRpZiAocmVzcG9uc2UgPT09IDEgLyogQ2FuY2VsICovKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGBvc2FzY3JpcHQgLWUgXCJkbyBzaGVsbCBzY3JpcHQgXFxcXFwibWtkaXIgLXAgL3Vzci9sb2NhbC9iaW4gJiYgbG4gLXNmIFxcJyR7dGFyZ2V0fVxcJyBcXCcke3NvdXJjZX1cXCdcXFxcXCIgd2l0aCBhZG1pbmlzdHJhdG9yIHByaXZpbGVnZXNcImA7XG5cdFx0XHRhd2FpdCBwcm9taXNpZnkoZXhlYykoY29tbWFuZCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnY2FudENyZWF0ZUJpbkZvbGRlcicsIFwiVW5hYmxlIHRvIGluc3RhbGwgdGhlIHNoZWxsIGNvbW1hbmQgJ3swfScuXCIsIHNvdXJjZSkpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHVuaW5zdGFsbFNoZWxsQ29tbWFuZCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyBzb3VyY2UgfSA9IGF3YWl0IHRoaXMuZ2V0U2hlbGxDb21tYW5kTGluaygpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZzLnByb21pc2VzLnVubGluayhzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRzd2l0Y2ggKGVycm9yLmNvZGUpIHtcblx0XHRcdFx0Y2FzZSAnRUFDQ0VTJzoge1xuXHRcdFx0XHRcdGNvbnN0IHsgcmVzcG9uc2UgfSA9IGF3YWl0IHRoaXMuc2hvd01lc3NhZ2VCb3god2luZG93SWQsIHtcblx0XHRcdFx0XHRcdHR5cGU6ICdpbmZvJyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd3YXJuRXNjYWxhdGlvblVuaW5zdGFsbCcsIFwiezB9IHdpbGwgbm93IHByb21wdCB3aXRoICdvc2FzY3JpcHQnIGZvciBBZG1pbmlzdHJhdG9yIHByaXZpbGVnZXMgdG8gdW5pbnN0YWxsIHRoZSBzaGVsbCBjb21tYW5kLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCksXG5cdFx0XHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKHsga2V5OiAnb2snLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZPS1wiKSxcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2NhbmNlbCcsIFwiQ2FuY2VsXCIpXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRpZiAocmVzcG9uc2UgPT09IDEgLyogQ2FuY2VsICovKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IGBvc2FzY3JpcHQgLWUgXCJkbyBzaGVsbCBzY3JpcHQgXFxcXFwicm0gXFwnJHtzb3VyY2V9XFwnXFxcXFwiIHdpdGggYWRtaW5pc3RyYXRvciBwcml2aWxlZ2VzXCJgO1xuXHRcdFx0XHRcdFx0YXdhaXQgcHJvbWlzaWZ5KGV4ZWMpKGNvbW1hbmQpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2NhbnRVbmluc3RhbGwnLCBcIlVuYWJsZSB0byB1bmluc3RhbGwgdGhlIHNoZWxsIGNvbW1hbmQgJ3swfScuXCIsIHNvdXJjZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdFTk9FTlQnOlxuXHRcdFx0XHRcdGJyZWFrOyAvLyBpZ25vcmUgZmlsZSBub3QgZm91bmRcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFNoZWxsQ29tbWFuZExpbmsoKTogUHJvbWlzZTx7IHJlYWRvbmx5IHNvdXJjZTogc3RyaW5nOyByZWFkb25seSB0YXJnZXQ6IHN0cmluZyB9PiB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gcmVzb2x2ZSh0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXBwUm9vdCwgJ2JpbicsICdjb2RlJyk7XG5cdFx0Y29uc3Qgc291cmNlID0gYC91c3IvbG9jYWwvYmluLyR7dGhpcy5wcm9kdWN0U2VydmljZS5hcHBsaWNhdGlvbk5hbWV9YDtcblxuXHRcdC8vIEVuc3VyZSBzb3VyY2UgZXhpc3RzXG5cdFx0Y29uc3Qgc291cmNlRXhpc3RzID0gYXdhaXQgUHJvbWlzZXMuZXhpc3RzKHRhcmdldCk7XG5cdFx0aWYgKCFzb3VyY2VFeGlzdHMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnc291cmNlTWlzc2luZycsIFwiVW5hYmxlIHRvIGZpbmQgc2hlbGwgc2NyaXB0IGluICd7MH0nXCIsIHRhcmdldCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHNvdXJjZSwgdGFyZ2V0IH07XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRGlhbG9nXG5cblx0YXN5bmMgc2hvd01lc3NhZ2VCb3god2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9uczogTWVzc2FnZUJveE9wdGlvbnMgJiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPE1lc3NhZ2VCb3hSZXR1cm5WYWx1ZT4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdHJldHVybiB0aGlzLmRpYWxvZ01haW5TZXJ2aWNlLnNob3dNZXNzYWdlQm94KG9wdGlvbnMsIHdpbmRvdz8ud2luID8/IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRhc3luYyBzaG93U2F2ZURpYWxvZyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zOiBTYXZlRGlhbG9nT3B0aW9ucyAmIElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8U2F2ZURpYWxvZ1JldHVyblZhbHVlPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0cmV0dXJuIHRoaXMuZGlhbG9nTWFpblNlcnZpY2Uuc2hvd1NhdmVEaWFsb2cob3B0aW9ucywgd2luZG93Py53aW4gPz8gdW5kZWZpbmVkKTtcblx0fVxuXG5cdGFzeW5jIHNob3dPcGVuRGlhbG9nKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM6IE9wZW5EaWFsb2dPcHRpb25zICYgSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTxPcGVuRGlhbG9nUmV0dXJuVmFsdWU+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKTtcblx0XHRyZXR1cm4gdGhpcy5kaWFsb2dNYWluU2VydmljZS5zaG93T3BlbkRpYWxvZyhvcHRpb25zLCB3aW5kb3c/LndpbiA/PyB1bmRlZmluZWQpO1xuXHR9XG5cblx0YXN5bmMgcGlja0ZpbGVGb2xkZXJBbmRPcGVuKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM6IElOYXRpdmVPcGVuRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBhdGhzID0gYXdhaXQgdGhpcy5kaWFsb2dNYWluU2VydmljZS5waWNrRmlsZUZvbGRlcihvcHRpb25zKTtcblx0XHRpZiAocGF0aHMpIHtcblx0XHRcdGF3YWl0IHRoaXMuZG9PcGVuUGlja2VkKGF3YWl0IFByb21pc2UuYWxsKHBhdGhzLm1hcChhc3luYyBwYXRoID0+IChhd2FpdCBTeW1saW5rU3VwcG9ydC5leGlzdHNEaXJlY3RvcnkocGF0aCkpID8geyBmb2xkZXJVcmk6IFVSSS5maWxlKHBhdGgpIH0gOiB7IGZpbGVVcmk6IFVSSS5maWxlKHBhdGgpIH0pKSwgb3B0aW9ucywgd2luZG93SWQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHBpY2tGb2xkZXJBbmRPcGVuKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM6IElOYXRpdmVPcGVuRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBhdGhzID0gYXdhaXQgdGhpcy5kaWFsb2dNYWluU2VydmljZS5waWNrRm9sZGVyKG9wdGlvbnMpO1xuXHRcdGlmIChwYXRocykge1xuXHRcdFx0YXdhaXQgdGhpcy5kb09wZW5QaWNrZWQocGF0aHMubWFwKHBhdGggPT4gKHsgZm9sZGVyVXJpOiBVUkkuZmlsZShwYXRoKSB9KSksIG9wdGlvbnMsIHdpbmRvd0lkKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBwaWNrRmlsZUFuZE9wZW4od2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9uczogSU5hdGl2ZU9wZW5EaWFsb2dPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcGF0aHMgPSBhd2FpdCB0aGlzLmRpYWxvZ01haW5TZXJ2aWNlLnBpY2tGaWxlKG9wdGlvbnMpO1xuXHRcdGlmIChwYXRocykge1xuXHRcdFx0YXdhaXQgdGhpcy5kb09wZW5QaWNrZWQocGF0aHMubWFwKHBhdGggPT4gKHsgZmlsZVVyaTogVVJJLmZpbGUocGF0aCkgfSkpLCBvcHRpb25zLCB3aW5kb3dJZCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcGlja1dvcmtzcGFjZUFuZE9wZW4od2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9uczogSU5hdGl2ZU9wZW5EaWFsb2dPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcGF0aHMgPSBhd2FpdCB0aGlzLmRpYWxvZ01haW5TZXJ2aWNlLnBpY2tXb3Jrc3BhY2Uob3B0aW9ucyk7XG5cdFx0aWYgKHBhdGhzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvT3BlblBpY2tlZChwYXRocy5tYXAocGF0aCA9PiAoeyB3b3Jrc3BhY2VVcmk6IFVSSS5maWxlKHBhdGgpIH0pKSwgb3B0aW9ucywgd2luZG93SWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9PcGVuUGlja2VkKG9wZW5hYmxlOiBJV2luZG93T3BlbmFibGVbXSwgb3B0aW9uczogSU5hdGl2ZU9wZW5EaWFsb2dPcHRpb25zLCB3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub3Blbih7XG5cdFx0XHRjb250ZXh0OiBPcGVuQ29udGV4dC5ESUFMT0csXG5cdFx0XHRjb250ZXh0V2luZG93SWQ6IHdpbmRvd0lkLFxuXHRcdFx0Y2xpOiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncyxcblx0XHRcdHVyaXNUb09wZW46IG9wZW5hYmxlLFxuXHRcdFx0Zm9yY2VOZXdXaW5kb3c6IG9wdGlvbnMuZm9yY2VOZXdXaW5kb3csXG5cdFx0XHQvKiByZW1vdGVBdXRob3JpdHkgd2lsbCBiZSBkZXRlcm1pbmVkIGJhc2VkIG9uIG9wZW5hYmxlICovXG5cdFx0fSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBPU1xuXG5cdGFzeW5jIHNob3dJdGVtSW5Gb2xkZXIod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgcGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0c2hlbGwuc2hvd0l0ZW1JbkZvbGRlcihwYXRoKTtcblx0fVxuXG5cdGFzeW5jIHNldFJlcHJlc2VudGVkRmlsZW5hbWUod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgcGF0aDogc3RyaW5nLCBvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0d2luZG93Py5zZXRSZXByZXNlbnRlZEZpbGVuYW1lKHBhdGgpO1xuXHR9XG5cblx0YXN5bmMgc2V0RG9jdW1lbnRFZGl0ZWQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgZWRpdGVkOiBib29sZWFuLCBvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0d2luZG93Py5zZXREb2N1bWVudEVkaXRlZChlZGl0ZWQpO1xuXHR9XG5cblx0YXN5bmMgb3BlbkV4dGVybmFsKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHVybDogc3RyaW5nLCBkZWZhdWx0QXBwbGljYXRpb24/OiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UudW5zZXRTbmFwRXhwb3J0ZWRWYXJpYWJsZXMoKTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKG1hdGNoZXNTb21lU2NoZW1lKHVybCwgU2NoZW1hcy5odHRwLCBTY2hlbWFzLmh0dHBzKSkge1xuXHRcdFx0XHR0aGlzLm9wZW5FeHRlcm5hbEJyb3dzZXIod2luZG93SWQsIHVybCwgZGVmYXVsdEFwcGxpY2F0aW9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZG9PcGVuU2hlbGxFeHRlcm5hbCh3aW5kb3dJZCwgdXJsKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLnJlc3RvcmVTbmFwRXhwb3J0ZWRWYXJpYWJsZXMoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkV4dGVybmFsQnJvd3Nlcih3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCB1cmw6IHN0cmluZywgZGVmYXVsdEFwcGxpY2F0aW9uPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJlZEJyb3dzZXIgPSBkZWZhdWx0QXBwbGljYXRpb24gPz8gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCd3b3JrYmVuY2guZXh0ZXJuYWxCcm93c2VyJyk7XG5cdFx0aWYgKCFjb25maWd1cmVkQnJvd3Nlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9PcGVuU2hlbGxFeHRlcm5hbCh3aW5kb3dJZCwgdXJsKTtcblx0XHR9XG5cblx0XHRpZiAoY29uZmlndXJlZEJyb3dzZXIuaW5jbHVkZXMocG9zaXguc2VwKSB8fCBjb25maWd1cmVkQnJvd3Nlci5pbmNsdWRlcyh3aW4zMi5zZXApKSB7XG5cdFx0XHRjb25zdCBicm93c2VyUGF0aEV4aXN0cyA9IGF3YWl0IFByb21pc2VzLmV4aXN0cyhjb25maWd1cmVkQnJvd3Nlcik7XG5cdFx0XHRpZiAoIWJyb3dzZXJQYXRoRXhpc3RzKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgQ29uZmlndXJlZCBleHRlcm5hbCBicm93c2VyIHBhdGggZG9lcyBub3QgZXhpc3Q6ICR7Y29uZmlndXJlZEJyb3dzZXJ9YCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLmRvT3BlblNoZWxsRXh0ZXJuYWwod2luZG93SWQsIHVybCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHsgZGVmYXVsdDogb3BlbiwgYXBwcyB9ID0gYXdhaXQgaW1wb3J0KCdvcGVuJyk7XG5cdFx0XHRjb25zdCByZXMgPSBhd2FpdCBvcGVuKHVybCwge1xuXHRcdFx0XHRhcHA6IHtcblx0XHRcdFx0XHQvLyBVc2UgYG9wZW4uYXBwc2AgaGVscGVyIHRvIGFsbG93IGNyb3NzLXBsYXRmb3JtIGJyb3dzZXJcblx0XHRcdFx0XHQvLyBhbGlhc2VzIHRvIGJlIGxvb2tlZCB1cCBwcm9wZXJseS4gRmFsbGJhY2sgdG8gdGhlXG5cdFx0XHRcdFx0Ly8gY29uZmlndXJlZCB2YWx1ZSBpZiBub3QgZm91bmQuXG5cdFx0XHRcdFx0bmFtZTogT2JqZWN0Lmhhc093bihhcHBzLCBjb25maWd1cmVkQnJvd3NlcikgPyBhcHBzWyhjb25maWd1cmVkQnJvd3NlciBhcyBrZXlvZiB0eXBlb2YgYXBwcyldIDogY29uZmlndXJlZEJyb3dzZXJcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRcdC8vIE9uIExpbnV4L21hY09TLCBsaXN0ZW4gdG8gc3RkZXJyIGFuZCB0cmVhdCB0aGF0IGFzIGZhaWx1cmVcblx0XHRcdFx0Ly8gZm9yIG9wZW5pbmcgdGhlIGJyb3dzZXIgdG8gZmFsbGJhY2sgdG8gdGhlIGRlZmF1bHQuXG5cdFx0XHRcdC8vIE9uIFdpbmRvd3MsIHVuZm9ydHVuYXRlbHkgUG93ZXJTaGVsbCBzZWVtcyB0byBhbHdheXMgd3JpdGVcblx0XHRcdFx0Ly8gdG8gc3RkZXJyIHNvIHdlIGNhbm5vdCB1c2UgaXQgdGhlcmVcblx0XHRcdFx0Ly8gKHNlZSBhbHNvIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzA2MzYpXG5cdFx0XHRcdHJlcy5zdGRlcnI/Lm9uY2UoJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciBvcGVuZW5pbmcgZXh0ZXJuYWwgVVJMICcke3VybH0nIHVzaW5nIGJyb3dzZXIgJyR7Y29uZmlndXJlZEJyb3dzZXJ9JzogJHtkYXRhLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZG9PcGVuU2hlbGxFeHRlcm5hbCh3aW5kb3dJZCwgdXJsKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgVW5hYmxlIHRvIG9wZW4gZXh0ZXJuYWwgVVJMICcke3VybH0nIHVzaW5nIGJyb3dzZXIgJyR7Y29uZmlndXJlZEJyb3dzZXJ9JyBkdWUgdG8gJHtlcnJvcn0uYCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb09wZW5TaGVsbEV4dGVybmFsKHdpbmRvd0lkLCB1cmwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9PcGVuU2hlbGxFeHRlcm5hbCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCB1cmw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzaGVsbC5vcGVuRXh0ZXJuYWwodXJsKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0bGV0IGlzTGluazogYm9vbGVhbjtcblx0XHRcdGxldCBtZXNzYWdlOiBzdHJpbmc7XG5cdFx0XHRpZiAobWF0Y2hlc1NvbWVTY2hlbWUodXJsLCBTY2hlbWFzLmh0dHAsIFNjaGVtYXMuaHR0cHMpKSB7XG5cdFx0XHRcdGlzTGluayA9IHRydWU7XG5cdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnb3BlbkV4dGVybmFsRXJyb3JMaW5rTWVzc2FnZScsIFwiQW4gZXJyb3Igb2NjdXJyZWQgb3BlbmluZyBhIGxpbmsgaW4geW91ciBkZWZhdWx0IGJyb3dzZXIuXCIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aXNMaW5rID0gZmFsc2U7XG5cdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnb3BlbkV4dGVybmFsUHJvZ3JhbUVycm9yTWVzc2FnZScsIFwiQW4gZXJyb3Igb2NjdXJyZWQgb3BlbmluZyBhbiBleHRlcm5hbCBwcm9ncmFtLlwiKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgeyByZXNwb25zZSB9ID0gYXdhaXQgdGhpcy5kaWFsb2dNYWluU2VydmljZS5zaG93TWVzc2FnZUJveCh7XG5cdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdGRldGFpbDogZXJyb3IubWVzc2FnZSxcblx0XHRcdFx0YnV0dG9uczogaXNMaW5rID8gW1xuXHRcdFx0XHRcdGxvY2FsaXplKHsga2V5OiAnY29weUxpbmsnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDb3B5IExpbmtcIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2NhbmNlbCcsIFwiQ2FuY2VsXCIpXG5cdFx0XHRcdF0gOiBbXG5cdFx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdvaycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk9LXCIpXG5cdFx0XHRcdF1cblx0XHRcdH0sIHRoaXMud2luZG93QnlJZCh3aW5kb3dJZCk/LndpbiA/PyB1bmRlZmluZWQpO1xuXG5cdFx0XHRpZiAocmVzcG9uc2UgPT09IDEgLyogQ2FuY2VsICovKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy53cml0ZUNsaXBib2FyZFRleHQod2luZG93SWQsIHVybCk7XG5cdFx0fVxuXHR9XG5cblx0bW92ZUl0ZW1Ub1RyYXNoKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIGZ1bGxQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gc2hlbGwudHJhc2hJdGVtKGZ1bGxQYXRoKTtcblx0fVxuXG5cdGFzeW5jIGdldE1lZGlhQWNjZXNzU3RhdHVzKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG1lZGlhVHlwZTogJ21pY3JvcGhvbmUnIHwgJ2NhbWVyYScgfCAnc2NyZWVuJyk6IFByb21pc2U8J25vdC1kZXRlcm1pbmVkJyB8ICdncmFudGVkJyB8ICdkZW5pZWQnIHwgJ3Jlc3RyaWN0ZWQnIHwgJ3Vua25vd24nPiB7XG5cdFx0Ly8gc3lzdGVtUHJlZmVyZW5jZXMuZ2V0TWVkaWFBY2Nlc3NTdGF0dXMgaXMgaW1wbGVtZW50ZWQgb24gbWFjT1Mgb25seS5cblx0XHQvLyBPbiBMaW51eCBhbmQgV2luZG93cyB0aGVyZSdzIG5vIHBlci1hcHAgc2NyZWVuLXJlY29yZGluZyBwZXJtaXNzaW9uXG5cdFx0Ly8gY29uY2VwdDsgdGhlIE9TIGhhbmRsZXMgY2FwdHVyZSB3aXRob3V0IGFuIGFwcC1sZXZlbCBnYXRlLCBzbyByZXBvcnRcblx0XHQvLyAnZ3JhbnRlZCcgc28gdGhlIHJlbmRlcmVyIGNhbiBwcm9jZWVkIHN0cmFpZ2h0IHRvIGdldERpc3BsYXlNZWRpYS5cblx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdHJldHVybiBzeXN0ZW1QcmVmZXJlbmNlcy5nZXRNZWRpYUFjY2Vzc1N0YXR1cyhtZWRpYVR5cGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gJ2dyYW50ZWQnO1xuXHR9XG5cblx0YXN5bmMgaXNBZG1pbigpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgaXNBZG1pbjogYm9vbGVhbjtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRpc0FkbWluID0gKGF3YWl0IGltcG9ydCgnbmF0aXZlLWlzLWVsZXZhdGVkJykpLmRlZmF1bHQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aXNBZG1pbiA9IHByb2Nlc3MuZ2V0dWlkPy4oKSA9PT0gMDtcblx0XHR9XG5cblx0XHRyZXR1cm4gaXNBZG1pbjtcblx0fVxuXG5cdGFzeW5jIHdyaXRlRWxldmF0ZWQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgc291cmNlOiBVUkksIHRhcmdldDogVVJJLCBvcHRpb25zPzogeyB1bmxvY2s/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdWRvUHJvbXB0ID0gYXdhaXQgaW1wb3J0KCdAdnNjb2RlL3N1ZG8tcHJvbXB0Jyk7XG5cblx0XHRjb25zdCBhcmdzRmlsZSA9IHJhbmRvbVBhdGgodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLnVzZXJEYXRhUGF0aCwgJ2NvZGUtZWxldmF0ZWQnKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUoYXJnc0ZpbGUsIEpTT04uc3RyaW5naWZ5KHsgc291cmNlOiBzb3VyY2UuZnNQYXRoLCB0YXJnZXQ6IHRhcmdldC5mc1BhdGggfSkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0Y29uc3Qgc3Vkb0NvbW1hbmQ6IHN0cmluZ1tdID0gW2BcIiR7dGhpcy5jbGlQYXRofVwiYF07XG5cdFx0XHRcdGlmIChvcHRpb25zPy51bmxvY2spIHtcblx0XHRcdFx0XHRzdWRvQ29tbWFuZC5wdXNoKCctLWZpbGUtY2htb2QnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHN1ZG9Db21tYW5kLnB1c2goJy0tZmlsZS13cml0ZScsIGBcIiR7YXJnc0ZpbGV9XCJgKTtcblxuXHRcdFx0XHRjb25zdCBwcm9tcHRPcHRpb25zID0ge1xuXHRcdFx0XHRcdG5hbWU6IHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcucmVwbGFjZSgnLScsICcnKSxcblx0XHRcdFx0XHRpY25zOiAoaXNNYWNpbnRvc2ggJiYgdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmlzQnVpbHQpID8gam9pbihkaXJuYW1lKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcHBSb290KSwgYCR7dGhpcy5wcm9kdWN0U2VydmljZS5uYW1lU2hvcnR9LmljbnNgKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3N1ZG8tcHJvbXB0XSBydW5uaW5nIGNvbW1hbmQ6ICR7c3Vkb0NvbW1hbmQuam9pbignICcpfWApO1xuXG5cdFx0XHRcdHN1ZG9Qcm9tcHQuZXhlYyhzdWRvQ29tbWFuZC5qb2luKCcgJyksIHByb21wdE9wdGlvbnMsIChlcnJvcj8sIHN0ZG91dD8sIHN0ZGVycj8pID0+IHtcblx0XHRcdFx0XHRpZiAoc3Rkb3V0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtzdWRvLXByb21wdF0gcmVjZWl2ZWQgc3Rkb3V0OiAke3N0ZG91dH1gKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoc3RkZXJyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtzdWRvLXByb21wdF0gcmVjZWl2ZWQgc3RkZXJyOiAke3N0ZGVycn1gKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdHJlamVjdChlcnJvcik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGZzLnByb21pc2VzLnVubGluayhhcmdzRmlsZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgaXNSdW5uaW5nVW5kZXJBUk02NFRyYW5zbGF0aW9uKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChpc0xpbnV4IHx8IGlzV2luZG93cykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBhcHAucnVubmluZ1VuZGVyQVJNNjRUcmFuc2xhdGlvbjtcblx0fVxuXG5cdEBtZW1vaXplXG5cdHByaXZhdGUgZ2V0IGNsaVBhdGgoKTogc3RyaW5nIHtcblxuXHRcdC8vIFdpbmRvd3Ncblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRpZiAodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmlzQnVpbHQpIHtcblx0XHRcdFx0cmV0dXJuIGpvaW4oZGlybmFtZShwcm9jZXNzLmV4ZWNQYXRoKSwgJ2JpbicsIGAke3RoaXMucHJvZHVjdFNlcnZpY2UuYXBwbGljYXRpb25OYW1lfS5jbWRgKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGpvaW4odGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFwcFJvb3QsICdzY3JpcHRzJywgJ2NvZGUtY2xpLmJhdCcpO1xuXHRcdH1cblxuXHRcdC8vIExpbnV4XG5cdFx0aWYgKGlzTGludXgpIHtcblx0XHRcdGlmICh0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuaXNCdWlsdCkge1xuXHRcdFx0XHRyZXR1cm4gam9pbihkaXJuYW1lKHByb2Nlc3MuZXhlY1BhdGgpLCAnYmluJywgYCR7dGhpcy5wcm9kdWN0U2VydmljZS5hcHBsaWNhdGlvbk5hbWV9YCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBqb2luKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcHBSb290LCAnc2NyaXB0cycsICdjb2RlLWNsaS5zaCcpO1xuXHRcdH1cblxuXHRcdC8vIG1hY09TXG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5pc0J1aWx0KSB7XG5cdFx0XHRyZXR1cm4gam9pbih0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXBwUm9vdCwgJ2JpbicsICdjb2RlJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGpvaW4odGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFwcFJvb3QsICdzY3JpcHRzJywgJ2NvZGUtY2xpLnNoJyk7XG5cdH1cblxuXHRhc3luYyBnZXRPU1N0YXRpc3RpY3MoKTogUHJvbWlzZTxJT1NTdGF0aXN0aWNzPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvdGFsbWVtOiB0b3RhbG1lbSgpLFxuXHRcdFx0ZnJlZW1lbTogZnJlZW1lbSgpLFxuXHRcdFx0bG9hZGF2ZzogbG9hZGF2ZygpXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGdldE9TUHJvcGVydGllcygpOiBQcm9taXNlPElPU1Byb3BlcnRpZXM+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YXJjaDogYXJjaCgpLFxuXHRcdFx0cGxhdGZvcm06IHBsYXRmb3JtKCksXG5cdFx0XHRyZWxlYXNlOiByZWxlYXNlKCksXG5cdFx0XHR0eXBlOiB0eXBlKCksXG5cdFx0XHRjcHVzOiBjcHVzKClcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZ2V0T1NWaXJ0dWFsTWFjaGluZUhpbnQoKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRyZXR1cm4gdmlydHVhbE1hY2hpbmVIaW50LnZhbHVlKCk7XG5cdH1cblxuXHRhc3luYyBnZXRPU0NvbG9yU2NoZW1lKCk6IFByb21pc2U8SUNvbG9yU2NoZW1lPiB7XG5cdFx0cmV0dXJuIHRoaXMudGhlbWVNYWluU2VydmljZS5nZXRDb2xvclNjaGVtZSgpO1xuXHR9XG5cblx0Ly8gV1NMXG5cdGFzeW5jIGhhc1dTTEZlYXR1cmVJbnN0YWxsZWQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIGlzV2luZG93cyAmJiBoYXNXU0xGZWF0dXJlSW5zdGFsbGVkKCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBTY3JlZW5zaG90c1xuXG5cdGFzeW5jIGdldFNjcmVlbnNob3Qod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgcmVjdD86IElSZWN0YW5nbGUsIG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPFZTQnVmZmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0Y29uc3QgY2FwdHVyZWQgPSBhd2FpdCB3aW5kb3c/Lndpbj8ud2ViQ29udGVudHMuY2FwdHVyZVBhZ2UocmVjdCk7XG5cblx0XHRjb25zdCBidWYgPSBjYXB0dXJlZD8udG9KUEVHKDk1KTtcblx0XHRyZXR1cm4gYnVmICYmIFZTQnVmZmVyLndyYXAoYnVmKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cblx0Ly8jcmVnaW9uIEdpdEh1YiBtb2JpbGUgdXBsb2FkIEFQSVxuXG5cdGFzeW5jIHVwbG9hZEZpbGVWaWFNb2JpbGVBcGkoX3dpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHRva2VuOiBzdHJpbmcsIHJlcG9JZDogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nLCBmaWxlQnl0ZXM6IFZTQnVmZmVyLCBjb250ZW50VHlwZTogc3RyaW5nKTogUHJvbWlzZTx7IGZpbGVOYW1lOiBzdHJpbmc7IGFzc2V0VXJsOiBzdHJpbmc7IGNvbnRlbnRUeXBlOiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHsgbmV0IH0gPSBhd2FpdCBpbXBvcnQoJ2VsZWN0cm9uJyk7XG5cblx0XHQvLyBTdGVwIDE6IEdldCB1cGxvYWQgcG9saWN5XG5cdFx0Y29uc3QgcG9saWN5UmVzcG9uc2UgPSBhd2FpdCBuZXQuZmV0Y2goJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20vbW9iaWxlL3VwbG9hZC9wb2xpY3knLCB7XG5cdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7dG9rZW59YCxcblx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0J0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdH0sXG5cdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdG5hbWU6IGZpbGVOYW1lLFxuXHRcdFx0XHRzaXplOiBmaWxlQnl0ZXMuYnl0ZUxlbmd0aCxcblx0XHRcdFx0Y29udGVudF90eXBlOiBjb250ZW50VHlwZSxcblx0XHRcdFx0cmVwb3NpdG9yeV9pZDogcGFyc2VJbnQocmVwb0lkLCAxMCksXG5cdFx0XHR9KSxcblx0XHR9KTtcblx0XHRpZiAoIXBvbGljeVJlc3BvbnNlLm9rKSB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYXdhaXQgcG9saWN5UmVzcG9uc2UudGV4dCgpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQb2xpY3kgcmVxdWVzdCBmYWlsZWQgJHtwb2xpY3lSZXNwb25zZS5zdGF0dXN9OiAke3RleHQuc3Vic3RyaW5nKDAsIDMwMCl9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHBvbGljeSA9IGF3YWl0IHBvbGljeVJlc3BvbnNlLmpzb24oKTtcblx0XHRjb25zdCBhc3NldCA9IHBvbGljeS5hc3NldCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblxuXHRcdC8vIFN0ZXAgMjogVXBsb2FkIHRvIFMzICh1c2VzIG5ldC5mZXRjaCB3aGljaCBieXBhc3NlcyBDT1JTKVxuXHRcdGNvbnN0IGZvcm1GaWVsZHMgPSBwb2xpY3kuZm9ybSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHRcdGNvbnN0IGJvdW5kYXJ5ID0gYC0tLS1WU0NvZGVVcGxvYWQke0RhdGUubm93KCl9YDtcblx0XHRsZXQgbXVsdGlwYXJ0Qm9keSA9ICcnO1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGZvcm1GaWVsZHMpKSB7XG5cdFx0XHRtdWx0aXBhcnRCb2R5ICs9IGAtLSR7Ym91bmRhcnl9XFxyXFxuQ29udGVudC1EaXNwb3NpdGlvbjogZm9ybS1kYXRhOyBuYW1lPVwiJHtrZXl9XCJcXHJcXG5cXHJcXG4ke3ZhbHVlfVxcclxcbmA7XG5cdFx0fVxuXHRcdC8vIFNhbml0aXplIHRoZSBmaWxlbmFtZSBmb3IgbXVsdGlwYXJ0IGhlYWRlciBzYWZldHk6IHN0cmlwIENSL0xGICh3aGljaCB3b3VsZFxuXHRcdC8vIHRlcm1pbmF0ZSB0aGUgaGVhZGVyIC8gaW5qZWN0IGV4dHJhIGZpZWxkcykgYW5kIGVzY2FwZSBiYWNrc2xhc2hlcyBhbmQgZG91YmxlXG5cdFx0Ly8gcXVvdGVzIChSRkMgMjYxNiBxdW90ZWQtc3RyaW5nIHNlbWFudGljcykuXG5cdFx0Y29uc3Qgc2FmZU5hbWUgPSBTdHJpbmcoYXNzZXQubmFtZSkucmVwbGFjZSgvW1xcclxcbl0rL2csICcgJykucmVwbGFjZSgvW1xcXFxcIl0vZywgJ18nKTtcblx0XHRtdWx0aXBhcnRCb2R5ICs9IGAtLSR7Ym91bmRhcnl9XFxyXFxuQ29udGVudC1EaXNwb3NpdGlvbjogZm9ybS1kYXRhOyBuYW1lPVwiZmlsZVwiOyBmaWxlbmFtZT1cIiR7c2FmZU5hbWV9XCJcXHJcXG5Db250ZW50LVR5cGU6ICR7Y29udGVudFR5cGV9XFxyXFxuXFxyXFxuYDtcblx0XHRjb25zdCBlcGlsb2d1ZSA9IGBcXHJcXG4tLSR7Ym91bmRhcnl9LS1cXHJcXG5gO1xuXG5cdFx0Y29uc3QgcHJlYW1ibGVCeXRlcyA9IEJ1ZmZlci5mcm9tKG11bHRpcGFydEJvZHksICd1dGYtOCcpO1xuXHRcdGNvbnN0IGVwaWxvZ3VlQnl0ZXMgPSBCdWZmZXIuZnJvbShlcGlsb2d1ZSwgJ3V0Zi04Jyk7XG5cdFx0Ly8gUGFzcyBmaWxlQnl0ZXMuYnVmZmVyIChVaW50OEFycmF5KSBkaXJlY3RseSB0byBCdWZmZXIuY29uY2F0IGluc3RlYWQgb2Ygd3JhcHBpbmdcblx0XHQvLyBpbiBCdWZmZXIuZnJvbSguLi4pIHdoaWNoIHdvdWxkIGZvcmNlIGFuIGV4dHJhIGZ1bGwtc2l6ZSBjb3B5IG9mIHRoZSBwYXlsb2FkLlxuXHRcdGNvbnN0IGJvZHlCdWZmZXIgPSBCdWZmZXIuY29uY2F0KFtwcmVhbWJsZUJ5dGVzLCBmaWxlQnl0ZXMuYnVmZmVyLCBlcGlsb2d1ZUJ5dGVzXSk7XG5cblx0XHRjb25zdCBzM1Jlc3BvbnNlID0gYXdhaXQgbmV0LmZldGNoKHBvbGljeS51cGxvYWRfdXJsIGFzIHN0cmluZywge1xuXHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiBgbXVsdGlwYXJ0L2Zvcm0tZGF0YTsgYm91bmRhcnk9JHtib3VuZGFyeX1gIH0sXG5cdFx0XHRib2R5OiBib2R5QnVmZmVyLFxuXHRcdH0pO1xuXHRcdGlmIChzM1Jlc3BvbnNlLnN0YXR1cyAhPT0gMjA0ICYmIHMzUmVzcG9uc2Uuc3RhdHVzICE9PSAyMDEpIHtcblx0XHRcdGNvbnN0IHRleHQgPSBhd2FpdCBzM1Jlc3BvbnNlLnRleHQoKTtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgUzMgdXBsb2FkIGZhaWxlZCAke3MzUmVzcG9uc2Uuc3RhdHVzfTogJHt0ZXh0LnN1YnN0cmluZygwLCAzMDApfWApO1xuXHRcdH1cblxuXHRcdC8vIFN0ZXAgMzogQ29uZmlybSB1cGxvYWRcblx0XHRjb25zdCBjb25maXJtUmVzcG9uc2UgPSBhd2FpdCBuZXQuZmV0Y2goYGh0dHBzOi8vYXBpLmdpdGh1Yi5jb20ke3BvbGljeS5hc3NldF91cGxvYWRfdXJsfWAsIHtcblx0XHRcdG1ldGhvZDogJ1BVVCcsXG5cdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke3Rva2VufWAsXG5cdFx0XHRcdCdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGlmICghY29uZmlybVJlc3BvbnNlLm9rKSB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYXdhaXQgY29uZmlybVJlc3BvbnNlLnRleHQoKTtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQXNzZXQgdXBsb2FkIGNvbmZpcm1hdGlvbiBmYWlsZWQgJHtjb25maXJtUmVzcG9uc2Uuc3RhdHVzfTogJHt0ZXh0LnN1YnN0cmluZygwLCAzMDApfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGZpbGVOYW1lLCBhc3NldFVybDogYXNzZXQuaHJlZiBhcyBzdHJpbmcsIGNvbnRlbnRUeXBlIH07XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBQcm9jZXNzXG5cblx0YXN5bmMgZ2V0UHJvY2Vzc0lkKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZCh1bmRlZmluZWQsIHdpbmRvd0lkKTtcblx0XHRyZXR1cm4gd2luZG93Py53aW4/LndlYkNvbnRlbnRzLmdldE9TUHJvY2Vzc0lkKCk7XG5cdH1cblxuXHRhc3luYyBraWxsUHJvY2Vzcyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBwaWQ6IG51bWJlciwgY29kZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cHJvY2Vzcy5raWxsKHBpZCwgY29kZSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBDbGlwYm9hcmRcblxuXHRhc3luYyByZWFkQ2xpcGJvYXJkVGV4dCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0eXBlPzogJ3NlbGVjdGlvbicgfCAnY2xpcGJvYXJkJyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGByZWFkQ2xpcGJvYXJkVGV4dCBpbiB3aW5kb3cgJHt3aW5kb3dJZH0gd2l0aCB0eXBlOmAsIHR5cGUpO1xuXHRcdGNvbnN0IGNsaXBib2FyZFRleHQgPSBjbGlwYm9hcmQucmVhZFRleHQodHlwZSk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBjbGlwYm9hcmRUZXh0Lmxlbmd0aCA6YCwgY2xpcGJvYXJkVGV4dC5sZW5ndGgpO1xuXHRcdHJldHVybiBjbGlwYm9hcmRUZXh0O1xuXHR9XG5cblx0YXN5bmMgdHJpZ2dlclBhc3RlKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFRyaWdnZXJpbmcgcGFzdGUgaW4gd2luZG93ICR7d2luZG93SWR9IHdpdGggb3B0aW9uczpgLCBvcHRpb25zKTtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKTtcblx0XHRyZXR1cm4gd2luZG93Py53aW4/LndlYkNvbnRlbnRzLnBhc3RlKCkgPz8gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRhc3luYyByZWFkSW1hZ2UoKTogUHJvbWlzZTxVaW50OEFycmF5PiB7XG5cdFx0cmV0dXJuIGNsaXBib2FyZC5yZWFkSW1hZ2UoKS50b1BORygpO1xuXHR9XG5cblx0YXN5bmMgd3JpdGVDbGlwYm9hcmRUZXh0KHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHRleHQ6IHN0cmluZywgdHlwZT86ICdzZWxlY3Rpb24nIHwgJ2NsaXBib2FyZCcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gY2xpcGJvYXJkLndyaXRlVGV4dCh0ZXh0LCB0eXBlKTtcblx0fVxuXG5cdGFzeW5jIHJlYWRDbGlwYm9hcmRGaW5kVGV4dCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIGNsaXBib2FyZC5yZWFkRmluZFRleHQoKTtcblx0fVxuXG5cdGFzeW5jIHdyaXRlQ2xpcGJvYXJkRmluZFRleHQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgdGV4dDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIGNsaXBib2FyZC53cml0ZUZpbmRUZXh0KHRleHQpO1xuXHR9XG5cblx0YXN5bmMgd3JpdGVDbGlwYm9hcmRCdWZmZXIod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgZm9ybWF0OiBzdHJpbmcsIGJ1ZmZlcjogVlNCdWZmZXIsIHR5cGU/OiAnc2VsZWN0aW9uJyB8ICdjbGlwYm9hcmQnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIGNsaXBib2FyZC53cml0ZUJ1ZmZlcihmb3JtYXQsIEJ1ZmZlci5mcm9tKGJ1ZmZlci5idWZmZXIpLCB0eXBlKTtcblx0fVxuXG5cdGFzeW5jIHJlYWRDbGlwYm9hcmRCdWZmZXIod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgZm9ybWF0OiBzdHJpbmcpOiBQcm9taXNlPFZTQnVmZmVyPiB7XG5cdFx0cmV0dXJuIFZTQnVmZmVyLndyYXAoY2xpcGJvYXJkLnJlYWRCdWZmZXIoZm9ybWF0KSk7XG5cdH1cblxuXHRhc3luYyBoYXNDbGlwYm9hcmQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgZm9ybWF0OiBzdHJpbmcsIHR5cGU/OiAnc2VsZWN0aW9uJyB8ICdjbGlwYm9hcmQnKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIGNsaXBib2FyZC5oYXMoZm9ybWF0LCB0eXBlKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cblx0Ly8jcmVnaW9uIG1hY09TIFRvdWNoYmFyXG5cblx0YXN5bmMgbmV3V2luZG93VGFiKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMud2luZG93c01haW5TZXJ2aWNlLm9wZW4oe1xuXHRcdFx0Y29udGV4dDogT3BlbkNvbnRleHQuQVBJLFxuXHRcdFx0Y2xpOiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncyxcblx0XHRcdGZvcmNlTmV3VGFiYmVkV2luZG93OiB0cnVlLFxuXHRcdFx0Zm9yY2VFbXB0eTogdHJ1ZSxcblx0XHRcdHJlbW90ZUF1dGhvcml0eTogdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3MucmVtb3RlIHx8IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgc2hvd1ByZXZpb3VzV2luZG93VGFiKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdE1lbnUuc2VuZEFjdGlvblRvRmlyc3RSZXNwb25kZXIoJ3NlbGVjdFByZXZpb3VzVGFiOicpO1xuXHR9XG5cblx0YXN5bmMgc2hvd05leHRXaW5kb3dUYWIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0TWVudS5zZW5kQWN0aW9uVG9GaXJzdFJlc3BvbmRlcignc2VsZWN0TmV4dFRhYjonKTtcblx0fVxuXG5cdGFzeW5jIG1vdmVXaW5kb3dUYWJUb05ld1dpbmRvdygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRNZW51LnNlbmRBY3Rpb25Ub0ZpcnN0UmVzcG9uZGVyKCdtb3ZlVGFiVG9OZXdXaW5kb3c6Jyk7XG5cdH1cblxuXHRhc3luYyBtZXJnZUFsbFdpbmRvd1RhYnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0TWVudS5zZW5kQWN0aW9uVG9GaXJzdFJlc3BvbmRlcignbWVyZ2VBbGxXaW5kb3dzOicpO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlV2luZG93VGFic0JhcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRNZW51LnNlbmRBY3Rpb25Ub0ZpcnN0UmVzcG9uZGVyKCd0b2dnbGVUYWJCYXI6Jyk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVUb3VjaEJhcih3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBpdGVtczogSVNlcmlhbGl6YWJsZUNvbW1hbmRBY3Rpb25bXVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy5jb2RlV2luZG93QnlJZCh3aW5kb3dJZCk7XG5cdFx0d2luZG93Py51cGRhdGVUb3VjaEJhcihpdGVtcyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBMaWZlY3ljbGVcblxuXHRhc3luYyBub3RpZnlSZWFkeSh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy5jb2RlV2luZG93QnlJZCh3aW5kb3dJZCk7XG5cdFx0d2luZG93Py5zZXRSZWFkeSgpO1xuXHR9XG5cblx0YXN5bmMgcmVsYXVuY2god2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElSZWxhdW5jaE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5saWZlY3ljbGVNYWluU2VydmljZS5yZWxhdW5jaChvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIHJlbG9hZCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogeyBkaXNhYmxlRXh0ZW5zaW9ucz86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMuY29kZVdpbmRvd0J5SWQod2luZG93SWQpO1xuXHRcdGlmICh3aW5kb3cpIHtcblxuXHRcdFx0Ly8gU3BlY2lhbCBjYXNlOiBzdXBwb3J0IGB0cmFuc2llbnRgIHdvcmtzcGFjZXMgYnkgcHJldmVudGluZ1xuXHRcdFx0Ly8gdGhlIHJlbG9hZCBhbmQgcmF0aGVyIGdvIGJhY2sgdG8gYW4gZW1wdHkgd2luZG93LiBUcmFuc2llbnRcblx0XHRcdC8vIHdvcmtzcGFjZXMgc2hvdWxkIG5ldmVyIHJlc3RvcmUsIGV2ZW4gd2hlbiB0aGUgdXNlciB3YW50c1xuXHRcdFx0Ly8gdG8gcmVsb2FkLlxuXHRcdFx0Ly8gRm9yOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE5Njk1XG5cdFx0XHRpZiAoaXNXb3Jrc3BhY2VJZGVudGlmaWVyKHdpbmRvdy5vcGVuZWRXb3Jrc3BhY2UpKSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ1BhdGggPSB3aW5kb3cub3BlbmVkV29ya3NwYWNlLmNvbmZpZ1BhdGg7XG5cdFx0XHRcdGlmIChjb25maWdQYXRoLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLnJlc29sdmVMb2NhbFdvcmtzcGFjZShjb25maWdQYXRoKTtcblx0XHRcdFx0XHRpZiAod29ya3NwYWNlPy50cmFuc2llbnQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLm9wZW5XaW5kb3cod2luZG93LmlkLCB7IGZvcmNlUmV1c2VXaW5kb3c6IHRydWUgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFByb2NlZWQgbm9ybWFsbHkgdG8gcmVsb2FkIHRoZSB3aW5kb3dcblx0XHRcdHJldHVybiB0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLnJlbG9hZCh3aW5kb3csIG9wdGlvbnM/LmRpc2FibGVFeHRlbnNpb25zICE9PSB1bmRlZmluZWQgPyB7IF86IFtdLCAnZGlzYWJsZS1leHRlbnNpb25zJzogb3B0aW9ucy5kaXNhYmxlRXh0ZW5zaW9ucyB9IDogdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjbG9zZVdpbmRvdyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0cmV0dXJuIHdpbmRvdz8ud2luPy5jbG9zZSgpO1xuXHR9XG5cblx0YXN5bmMgcXVpdCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBJZiB0aGUgdXNlciBzZWxlY3RlZCB0byBleGl0IGZyb20gYW4gZXh0ZW5zaW9uIGRldmVsb3BtZW50IGhvc3Qgd2luZG93LCBkbyBub3QgcXVpdCwgYnV0IGp1c3Rcblx0XHQvLyBjbG9zZSB0aGUgd2luZG93IHVubGVzcyB0aGlzIGlzIHRoZSBsYXN0IHdpbmRvdyB0aGF0IGlzIG9wZW5lZC5cblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRMYXN0QWN0aXZlV2luZG93KCk7XG5cdFx0aWYgKHdpbmRvdz8uaXNFeHRlbnNpb25EZXZlbG9wbWVudEhvc3QgJiYgdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKSA+IDEgJiYgd2luZG93Lndpbikge1xuXHRcdFx0d2luZG93Lndpbi5jbG9zZSgpO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZTogbm9ybWFsIHF1aXRcblx0XHRlbHNlIHtcblx0XHRcdHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2UucXVpdCgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGV4aXQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgY29kZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5saWZlY3ljbGVNYWluU2VydmljZS5raWxsKGNvZGUpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHQvLyNyZWdpb24gQ29ubmVjdGl2aXR5XG5cblx0YXN5bmMgcmVzb2x2ZVByb3h5KHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLmNvZGVXaW5kb3dCeUlkKHdpbmRvd0lkKTtcblx0XHRjb25zdCBzZXNzaW9uID0gd2luZG93Py53aW4/LndlYkNvbnRlbnRzPy5zZXNzaW9uO1xuXG5cdFx0cmV0dXJuIHNlc3Npb24/LnJlc29sdmVQcm94eSh1cmwpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVByb3h5V2l0aFBhY2thZ2UoX3dpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHVybDogc3RyaW5nKTogUHJvbWlzZTxJT1NQcm94eVtdPiB7XG5cdFx0Y29uc3QgeyByZXNvbHZlUHJveHkgfSA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS9vcy1wcm94eS1yZXNvbHZlcicpO1xuXHRcdHJldHVybiByZXNvbHZlUHJveHkodXJsKTtcblx0fVxuXG5cdGFzeW5jIHJlYWRQcm94eUNvbmZpZ1dpdGhQYWNrYWdlKF93aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJT1NQcm94eUNvbmZpZz4ge1xuXHRcdGNvbnN0IHsgcmVhZFByb3h5Q29uZmlnIH0gPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvb3MtcHJveHktcmVzb2x2ZXInKTtcblx0XHRyZXR1cm4gcmVhZFByb3h5Q29uZmlnKCk7XG5cdH1cblxuXHRhc3luYyBsb29rdXBBdXRob3JpemF0aW9uKF93aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBhdXRoSW5mbzogQXV0aEluZm8pOiBQcm9taXNlPENyZWRlbnRpYWxzIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMucHJveHlBdXRoU2VydmljZS5sb29rdXBBdXRob3JpemF0aW9uKGF1dGhJbmZvKTtcblx0fVxuXG5cdGFzeW5jIGxvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbihfd2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgdXJsOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnJlcXVlc3RTZXJ2aWNlLmxvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbih1cmwpO1xuXHR9XG5cblx0YXN5bmMgbG9hZENlcnRpZmljYXRlcyhfd2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRyZXR1cm4gdGhpcy5yZXF1ZXN0U2VydmljZS5sb2FkQ2VydGlmaWNhdGVzKCk7XG5cdH1cblxuXHRpc1BvcnRGcmVlKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHBvcnQ6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiBpc1BvcnRGcmVlKHBvcnQsIDFfMDAwKTtcblx0fVxuXG5cdGZpbmRGcmVlUG9ydCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBzdGFydFBvcnQ6IG51bWJlciwgZ2l2ZVVwQWZ0ZXI6IG51bWJlciwgdGltZW91dDogbnVtYmVyLCBzdHJpZGUgPSAxKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRyZXR1cm4gZmluZEZyZWVQb3J0KHN0YXJ0UG9ydCwgZ2l2ZVVwQWZ0ZXIsIHRpbWVvdXQsIHN0cmlkZSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBEZXZlbG9wbWVudFxuXG5cdHByaXZhdGUgZ3B1SW5mb1dpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29udGVudFRyYWNpbmdXaW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdGFzeW5jIG9wZW5EZXZUb29scyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogUGFydGlhbDxPcGVuRGV2VG9vbHNPcHRpb25zPiAmIElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdHdpbmRvdz8ud2luPy53ZWJDb250ZW50cy5vcGVuRGV2VG9vbHMob3B0aW9ucz8ubW9kZSA/IHsgbW9kZTogb3B0aW9ucy5tb2RlLCBhY3RpdmF0ZTogb3B0aW9ucy5hY3RpdmF0ZSB9IDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdGFzeW5jIHRvZ2dsZURldlRvb2xzKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKTtcblx0XHR3aW5kb3c/Lndpbj8ud2ViQ29udGVudHMudG9nZ2xlRGV2VG9vbHMoKTtcblx0fVxuXG5cdGFzeW5jIG9wZW5EZXZUb29sc1dpbmRvdyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCB1cmw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBhcmVudFdpbmRvdyA9IHRoaXMuY29kZVdpbmRvd0J5SWQod2luZG93SWQpO1xuXHRcdGlmICghcGFyZW50V2luZG93KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5vcGVuQ2hpbGRXaW5kb3cocGFyZW50V2luZG93LndpbiwgdXJsKTtcblx0fVxuXG5cdHByaXZhdGUgb3BlbkNoaWxkV2luZG93KHBhcmVudFdpbmRvdzogQnJvd3NlcldpbmRvdyB8IG51bGwsIHVybDogc3RyaW5nLCBvdmVycmlkZVdpbmRvd09wdGlvbnM6IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3dDb25zdHJ1Y3Rvck9wdGlvbnMgPSB7fSk6IEJyb3dzZXJXaW5kb3cge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGRlZmF1bHRCcm93c2VyV2luZG93T3B0aW9ucywgZGVmYXVsdFdpbmRvd1N0YXRlKCksIHsgZm9yY2VOYXRpdmVUaXRsZWJhcjogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IHdpbmRvd09wdGlvbnM6IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3dDb25zdHJ1Y3Rvck9wdGlvbnMgPSB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0cGFyZW50OiBwYXJlbnRXaW5kb3cgPz8gdW5kZWZpbmVkLFxuXHRcdFx0Li4ub3ZlcnJpZGVXaW5kb3dPcHRpb25zXG5cdFx0fTtcblxuXHRcdGNvbnN0IHdpbmRvdyA9IG5ldyBCcm93c2VyV2luZG93KHdpbmRvd09wdGlvbnMpO1xuXHRcdHdpbmRvdy5zZXRNZW51QmFyVmlzaWJpbGl0eShmYWxzZSk7XG5cdFx0d2luZG93LmxvYWRVUkwodXJsKTtcblxuXHRcdHdpbmRvdy5vbmNlKCdyZWFkeS10by1zaG93JywgKCkgPT4gd2luZG93LnNob3coKSk7XG5cblx0XHRyZXR1cm4gd2luZG93O1xuXHR9XG5cblx0YXN5bmMgb3BlbkdQVUluZm9XaW5kb3cod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBhcmVudFdpbmRvdyA9IHRoaXMuY29kZVdpbmRvd0J5SWQod2luZG93SWQpO1xuXHRcdGlmICghcGFyZW50V2luZG93KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB0aGlzLmdwdUluZm9XaW5kb3dJZCAhPT0gJ251bWJlcicpIHtcblx0XHRcdGNvbnN0IGdwdUluZm9XaW5kb3cgPSB0aGlzLm9wZW5DaGlsZFdpbmRvdyhwYXJlbnRXaW5kb3cud2luLCAnY2hyb21lOi8vZ3B1Jyk7XG5cdFx0XHRncHVJbmZvV2luZG93Lm9uY2UoJ2Nsb3NlJywgKCkgPT4gdGhpcy5ncHVJbmZvV2luZG93SWQgPSB1bmRlZmluZWQpO1xuXG5cdFx0XHR0aGlzLmdwdUluZm9XaW5kb3dJZCA9IGdwdUluZm9XaW5kb3cuaWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB0aGlzLmdwdUluZm9XaW5kb3dJZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGNvbnN0IHdpbmRvdyA9IEJyb3dzZXJXaW5kb3cuZnJvbUlkKHRoaXMuZ3B1SW5mb1dpbmRvd0lkKTtcblx0XHRcdGlmICh3aW5kb3c/LmlzTWluaW1pemVkKCkpIHtcblx0XHRcdFx0d2luZG93Py5yZXN0b3JlKCk7XG5cdFx0XHR9XG5cdFx0XHR3aW5kb3c/LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgb3BlbkNvbnRlbnRUcmFjaW5nV2luZG93KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5jb250ZW50VHJhY2luZ1dpbmRvd0lkICE9PSAnbnVtYmVyJykge1xuXHRcdFx0Ly8gRGlzYWJsZSByZWFkeS10by1zaG93IGV2ZW50IHdpdGggcGFpbnRXaGVuSW5pdGlhbGx5SGlkZGVuIHRvXG5cdFx0XHQvLyBjdXN0b21pemUgY29udGVudCB0cmFjaW5nIHdpbmRvdyBiZWxvdy5cblx0XHRcdGNvbnN0IGNvbnRlbnRUcmFjaW5nV2luZG93ID0gdGhpcy5vcGVuQ2hpbGRXaW5kb3cobnVsbCwgJ2Nocm9tZTovL3RyYWNpbmcnLCB7XG5cdFx0XHRcdHBhaW50V2hlbkluaXRpYWxseUhpZGRlbjogZmFsc2UsXG5cdFx0XHRcdHdlYlByZWZlcmVuY2VzOiB7XG5cdFx0XHRcdFx0YmFja2dyb3VuZFRocm90dGxpbmc6IGZhbHNlXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29udGVudFRyYWNpbmdXaW5kb3cud2ViQ29udGVudHMub25jZSgnZGlkLWZpbmlzaC1sb2FkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHQvLyBNb2NrIHdpbmRvdy5wcm9tcHQgdG8gc3VwcG9ydCBzYXZlIGFjdGlvbiBmcm9tIHRoZSB0cmFjaW5nIFVJXG5cdFx0XHRcdC8vIHNpbmNlIEVsZWN0cm9uIGJ5IGRlZmF1bHQgZG9lc24ndCBwcm92aWRlIHRoZSBhcGkuXG5cdFx0XHRcdC8vIFNlZSByZXF1ZXN0RmlsZW5hbWVfIGltcGxlbWVudGF0aW9uIHVuZGVyXG5cdFx0XHRcdC8vIGh0dHBzOi8vc291cmNlLmNocm9taXVtLm9yZy9jaHJvbWl1bS9jaHJvbWl1bS9zcmMvKy9tYWluOnRoaXJkX3BhcnR5L2NhdGFwdWx0L3RyYWNpbmcvdHJhY2luZy91aS9leHRyYXMvYWJvdXRfdHJhY2luZy9wcm9maWxpbmdfdmlldy5odG1sO2w9MzM0LTM3OVxuXHRcdFx0XHRhd2FpdCBjb250ZW50VHJhY2luZ1dpbmRvdy53ZWJDb250ZW50cy5leGVjdXRlSmF2YVNjcmlwdChgXG5cdFx0XHRcdFx0d2luZG93LnByb21wdCA9ICgpID0+ICcnO1xuXHRcdFx0XHRcdG51bGxcblx0XHRcdFx0YCk7XG5cdFx0XHRcdGNvbnRlbnRUcmFjaW5nV2luZG93LnNob3coKTtcblx0XHRcdH0pO1xuXHRcdFx0Y29udGVudFRyYWNpbmdXaW5kb3cub25jZSgnY2xvc2UnLCAoKSA9PiB0aGlzLmNvbnRlbnRUcmFjaW5nV2luZG93SWQgPSB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5jb250ZW50VHJhY2luZ1dpbmRvd0lkID0gY29udGVudFRyYWNpbmdXaW5kb3cuaWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB0aGlzLmNvbnRlbnRUcmFjaW5nV2luZG93SWQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCB3aW5kb3cgPSBCcm93c2VyV2luZG93LmZyb21JZCh0aGlzLmNvbnRlbnRUcmFjaW5nV2luZG93SWQpO1xuXHRcdFx0aWYgKHdpbmRvdz8uaXNNaW5pbWl6ZWQoKSkge1xuXHRcdFx0XHR3aW5kb3c/LnJlc3RvcmUoKTtcblx0XHRcdH1cblx0XHRcdHdpbmRvdz8uZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc1RyYWNpbmcgPSBmYWxzZTtcblxuXHRhc3luYyBzdGFydFRyYWNpbmcod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgY2F0ZWdvcmllczogc3RyaW5nLCBvcHRpb25zPzogSVN0YXJ0VHJhY2luZ09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5faXNUcmFjaW5nKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3RyYWNpbmcuYWxyZWFkeUluUHJvZ3Jlc3MnLCAnQSB0cmFjaW5nIHNlc3Npb24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcy4gVXNlIGNvbW1hbmQgYFwiezB9XCJgIHRvIHN0b3AgaXQgZmlyc3QuJywgJ3dvcmtiZW5jaC5hY3Rpb24uc3RvcFRyYWNpbmcnKSk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnM/LmVuYWJsZUhlYXBQcm9maWxpbmcpIHtcblx0XHRcdGF3YWl0IGNvbnRlbnRUcmFjaW5nLmVuYWJsZUhlYXBQcm9maWxpbmcoKTtcblx0XHRcdGF3YWl0IGNvbnRlbnRUcmFjaW5nLnN0YXJ0UmVjb3JkaW5nKHtcblx0XHRcdFx0cmVjb3JkaW5nX21vZGU6ICdyZWNvcmQtdW50aWwtZnVsbCcsXG5cdFx0XHRcdGluY2x1ZGVkX2NhdGVnb3JpZXM6IGNhdGVnb3JpZXMuc3BsaXQoJywnKSxcblx0XHRcdFx0bWVtb3J5X2R1bXBfY29uZmlnOiB7XG5cdFx0XHRcdFx0dHJpZ2dlcnM6IFtcblx0XHRcdFx0XHRcdHsgbW9kZTogJ2RldGFpbGVkJywgdHlwZTogJ3BlcmlvZGljX2ludGVydmFsJywgcGVyaW9kaWNfaW50ZXJ2YWxfbXM6IDEwMDAwIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB0cmFjZU9wdGlvbnMgPSBbJ3JlY29yZC11bnRpbC1mdWxsJywgJ2VuYWJsZS1zYW1wbGluZyddO1xuXG5cdFx0XHRhd2FpdCBjb250ZW50VHJhY2luZy5zdGFydFJlY29yZGluZyh7XG5cdFx0XHRcdGNhdGVnb3J5RmlsdGVyOiBjYXRlZ29yaWVzLFxuXHRcdFx0XHR0cmFjZU9wdGlvbnM6IHRyYWNlT3B0aW9ucy5qb2luKCcsJylcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzVHJhY2luZyA9IHRydWU7XG5cdH1cblxuXHRhc3luYyBzdG9wVHJhY2luZyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9pc1RyYWNpbmcgJiYgIXRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzLnRyYWNlKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vIHRyYWNpbmcgaW4gcHJvZ3Jlc3Ncblx0XHR9XG5cblx0XHR0aGlzLl9pc1RyYWNpbmcgPSBmYWxzZTtcblxuXHRcdGNvbnN0IHBhdGggPSBhd2FpdCBjb250ZW50VHJhY2luZy5zdG9wUmVjb3JkaW5nKGAke3JhbmRvbVBhdGgodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLnVzZXJIb21lLmZzUGF0aCwgdGhpcy5wcm9kdWN0U2VydmljZS5hcHBsaWNhdGlvbk5hbWUpfS50cmFjZS50eHRgKTtcblxuXHRcdC8vIEluZm9ybSB1c2VyIHRvIHJlcG9ydCBhbiBpc3N1ZVxuXHRcdGF3YWl0IHRoaXMuZGlhbG9nTWFpblNlcnZpY2Uuc2hvd01lc3NhZ2VCb3goe1xuXHRcdFx0dHlwZTogJ2luZm8nLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3RyYWNlLm1lc3NhZ2UnLCBcIlN1Y2Nlc3NmdWxseSBjcmVhdGVkIHRoZSB0cmFjZSBmaWxlXCIpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgndHJhY2UuZGV0YWlsJywgXCJQbGVhc2UgY3JlYXRlIGFuIGlzc3VlIGFuZCBtYW51YWxseSBhdHRhY2ggdGhlIGZvbGxvd2luZyBmaWxlOlxcbnswfVwiLCBwYXRoKSxcblx0XHRcdGJ1dHRvbnM6IFtsb2NhbGl6ZSh7IGtleTogJ3RyYWNlLm9rJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmT0tcIildLFxuXHRcdH0sIEJyb3dzZXJXaW5kb3cuZ2V0Rm9jdXNlZFdpbmRvdygpID8/IHVuZGVmaW5lZCk7XG5cblx0XHQvLyBTaG93IGl0ZW0gaW4gZXhwbG9yZXJcblx0XHR0aGlzLnNob3dJdGVtSW5Gb2xkZXIodW5kZWZpbmVkLCBwYXRoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gUGVyZm9ybWFuY2VcblxuXHRhc3luYyBwcm9maWxlUmVuZGVyZXIod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgc2Vzc2lvbjogc3RyaW5nLCBkdXJhdGlvbjogbnVtYmVyKTogUHJvbWlzZTxJVjhQcm9maWxlPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy5jb2RlV2luZG93QnlJZCh3aW5kb3dJZCk7XG5cdFx0aWYgKCF3aW5kb3c/Lndpbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvZmlsZXIgPSBuZXcgV2luZG93UHJvZmlsZXIod2luZG93Lndpbiwgc2Vzc2lvbiwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm9maWxlci5pbnNwZWN0KGR1cmF0aW9uKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBUb2FzdCBOb3RpZmljYXRpb25zXG5cblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVUb2FzdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmc+KCkpO1xuXG5cdGFzeW5jIHNob3dUb2FzdCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zOiBJVG9hc3RPcHRpb25zKTogUHJvbWlzZTxJVG9hc3RSZXN1bHQ+IHtcblx0XHRpZiAoIU5vdGlmaWNhdGlvbi5pc1N1cHBvcnRlZCgpKSB7XG5cdFx0XHRyZXR1cm4geyBzdXBwb3J0ZWQ6IGZhbHNlLCBjbGlja2VkOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvYXN0ID0gbmV3IE5vdGlmaWNhdGlvbih7XG5cdFx0XHR0aXRsZTogb3B0aW9ucy50aXRsZSxcblx0XHRcdGJvZHk6IG9wdGlvbnMuYm9keSxcblx0XHRcdHNpbGVudDogb3B0aW9ucy5zaWxlbnQsXG5cdFx0XHRhY3Rpb25zOiBvcHRpb25zLmFjdGlvbnM/Lm1hcChhY3Rpb24gPT4gKHtcblx0XHRcdFx0dHlwZTogJ2J1dHRvbicsXG5cdFx0XHRcdHRleHQ6IGFjdGlvblxuXHRcdFx0fSkpXG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLmFjdGl2ZVRvYXN0cy5zZXQob3B0aW9ucy5pZCwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuYWN0aXZlVG9hc3RzLmRlbGV0ZUFuZERpc3Bvc2Uob3B0aW9ucy5pZCk7XG5cdFx0XHR0b2FzdC5yZW1vdmVBbGxMaXN0ZW5lcnMoKTtcblx0XHRcdHRvYXN0LmNsb3NlKCk7XG5cdFx0XHRjdHMuZGlzcG9zZSh0cnVlKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SVRvYXN0UmVzdWx0PihyID0+IHtcblx0XHRcdGNvbnN0IHJlc29sdmUgPSAocmVzdWx0OiBJVG9hc3RSZXN1bHQpID0+IHtcblx0XHRcdFx0cihyZXN1bHQpO1x0XHRcdFx0Ly8gZmlyc3QgcmV0dXJuIHRoZSByZXN1bHQgYmVmb3JlLi4uXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcdC8vIC4uLmRpc3Bvc2luZyB3aGljaCB3b3VsZCBpbnZhbGlkYXRlIHRoZSByZXN1bHQgb2JqZWN0XG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY3RzLnRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHJlc29sdmUoeyBzdXBwb3J0ZWQ6IHRydWUsIGNsaWNrZWQ6IGZhbHNlIH0pKSk7XG5cblx0XHRcdHRvYXN0Lm9uKCdjbGljaycsICgpID0+IHJlc29sdmUoeyBzdXBwb3J0ZWQ6IHRydWUsIGNsaWNrZWQ6IHRydWUgfSkpO1xuXHRcdFx0dG9hc3Qub24oJ2FjdGlvbicsIChfZXZlbnQsIGFjdGlvbkluZGV4KSA9PiByZXNvbHZlKHsgc3VwcG9ydGVkOiB0cnVlLCBjbGlja2VkOiB0cnVlLCBhY3Rpb25JbmRleCB9KSk7XG5cdFx0XHR0b2FzdC5vbignY2xvc2UnLCAoKSA9PiByZXNvbHZlKHsgc3VwcG9ydGVkOiB0cnVlLCBjbGlja2VkOiBmYWxzZSB9KSk7XG5cdFx0XHR0b2FzdC5vbignZmFpbGVkJywgKCkgPT4gcmVzb2x2ZSh7IHN1cHBvcnRlZDogZmFsc2UsIGNsaWNrZWQ6IGZhbHNlIH0pKTtcblxuXHRcdFx0dG9hc3Quc2hvdygpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgY2xlYXJUb2FzdCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0b2FzdElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmFjdGl2ZVRvYXN0cy5kZWxldGVBbmREaXNwb3NlKHRvYXN0SWQpO1xuXHR9XG5cblx0YXN5bmMgY2xlYXJUb2FzdHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5hY3RpdmVUb2FzdHMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUmVnaXN0cnkgKHdpbmRvd3MpXG5cblx0YXN5bmMgd2luZG93c0dldFN0cmluZ1JlZ0tleSh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBoaXZlOiAnSEtFWV9DVVJSRU5UX1VTRVInIHwgJ0hLRVlfTE9DQUxfTUFDSElORScgfCAnSEtFWV9DTEFTU0VTX1JPT1QnIHwgJ0hLRVlfVVNFUlMnIHwgJ0hLRVlfQ1VSUkVOVF9DT05GSUcnLCBwYXRoOiBzdHJpbmcsIG5hbWU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgUmVnaXN0cnkgPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvd2luZG93cy1yZWdpc3RyeScpO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gUmVnaXN0cnkuR2V0U3RyaW5nUmVnS2V5KGhpdmUsIHBhdGgsIG5hbWUpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gWmlwXG5cblx0YXN5bmMgY3JlYXRlWmlwRmlsZSh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCB6aXBQYXRoOiBVUkksIGZpbGVzOiBJTmF0aXZlWmlwRmlsZVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgemlwKHppcFBhdGguZnNQYXRoLCBmaWxlcy5tYXAoZmlsZSA9PiB7XG5cdFx0XHRpZiAoaGFzS2V5KGZpbGUsIHsgY29udGVudHM6IHRydWUgfSkpIHtcblx0XHRcdFx0cmV0dXJuIGZpbGU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBVUkkucmV2aXZlKGZpbGUuc291cmNlKTtcblx0XHRcdGlmIChzb3VyY2Uuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgYWRkIG5vbi1sb2NhbCByZXNvdXJjZSAnJHtzb3VyY2UudG9TdHJpbmcoKX0nIHRvIGEgemlwIGZpbGVgKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHBhdGg6IGZpbGUucGF0aCwgbG9jYWxQYXRoOiBzb3VyY2UuZnNQYXRoLCBsb2NhbFBhdGhTaXplOiBmaWxlLnNpemUgfTtcblx0XHR9KSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBQb3dlclxuXG5cdGFzeW5jIGdldFN5c3RlbUlkbGVTdGF0ZSh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBpZGxlVGhyZXNob2xkOiBudW1iZXIpOiBQcm9taXNlPFN5c3RlbUlkbGVTdGF0ZT4ge1xuXHRcdHJldHVybiBwb3dlck1vbml0b3IuZ2V0U3lzdGVtSWRsZVN0YXRlKGlkbGVUaHJlc2hvbGQpO1xuXHR9XG5cblx0YXN5bmMgZ2V0U3lzdGVtSWRsZVRpbWUod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0cmV0dXJuIHBvd2VyTW9uaXRvci5nZXRTeXN0ZW1JZGxlVGltZSgpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q3VycmVudFRoZXJtYWxTdGF0ZSh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxUaGVybWFsU3RhdGU+IHtcblx0XHRyZXR1cm4gcG93ZXJNb25pdG9yLmdldEN1cnJlbnRUaGVybWFsU3RhdGUoKTtcblx0fVxuXG5cdGFzeW5jIGlzT25CYXR0ZXJ5UG93ZXIod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiBwb3dlck1vbml0b3IuaXNPbkJhdHRlcnlQb3dlcigpO1xuXHR9XG5cblx0YXN5bmMgc3RhcnRQb3dlclNhdmVCbG9ja2VyKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHR5cGU6IFBvd2VyU2F2ZUJsb2NrZXJUeXBlKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRyZXR1cm4gcG93ZXJTYXZlQmxvY2tlci5zdGFydCh0eXBlKTtcblx0fVxuXG5cdGFzeW5jIHN0b3BQb3dlclNhdmVCbG9ja2VyKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIGlkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gcG93ZXJTYXZlQmxvY2tlci5zdG9wKGlkKTtcblx0fVxuXG5cdGFzeW5jIGlzUG93ZXJTYXZlQmxvY2tlclN0YXJ0ZWQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgaWQ6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiBwb3dlclNhdmVCbG9ja2VyLmlzU3RhcnRlZChpZCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIHdpbmRvd0J5SWQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgZmFsbGJhY2tDb2RlV2luZG93SWQ/OiBudW1iZXIpOiBJQ29kZVdpbmRvdyB8IElBdXhpbGlhcnlXaW5kb3cgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNvZGVXaW5kb3dCeUlkKHdpbmRvd0lkKSA/PyB0aGlzLmF1eGlsaWFyeVdpbmRvd0J5SWQod2luZG93SWQpID8/IHRoaXMuY29kZVdpbmRvd0J5SWQoZmFsbGJhY2tDb2RlV2luZG93SWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb2RlV2luZG93QnlJZCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogSUNvZGVXaW5kb3cgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2Ygd2luZG93SWQgIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dCeUlkKHdpbmRvd0lkKTtcblx0fVxuXG5cdHByaXZhdGUgYXV4aWxpYXJ5V2luZG93QnlJZCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogSUF1eGlsaWFyeVdpbmRvdyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHR5cGVvZiB3aW5kb3dJZCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudHMgPSB3ZWJDb250ZW50cy5mcm9tSWQod2luZG93SWQpO1xuXHRcdGlmICghY29udGVudHMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0J5V2ViQ29udGVudHMoY29udGVudHMpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksUUFBUTtBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUyxLQUFLLGVBQWUsV0FBVyxnQkFBeUIsTUFBZ0QsY0FBNkUsY0FBYyxrQkFBNEQsUUFBUSxPQUFPLG1CQUFtQixtQkFBbUI7QUFDN1QsU0FBUyxNQUFNLE1BQU0sU0FBUyxTQUFTLFVBQVUsU0FBUyxVQUFVLFlBQVk7QUFDaEYsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxlQUFlLGlCQUFpQixvQkFBb0I7QUFDekUsU0FBUyxtQkFBbUIsZUFBZTtBQUMzQyxTQUFTLFNBQVMsTUFBTSxPQUFPLFNBQVMsYUFBYTtBQUNyRCxTQUFTLFNBQVMsYUFBYSxpQkFBaUI7QUFDaEQsU0FBdUMsY0FBYztBQUNyRCxTQUFTLFdBQVc7QUFDcEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxVQUFVLHNCQUFzQjtBQUN6QyxTQUFTLGNBQWMsa0JBQWtCO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBR3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMs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QVE7QUFBQSxFQUN0RDtBQUFBLEVBRVEsb0JBQW9CLFVBQTREO0FBQ3ZGLFFBQUksT0FBTyxhQUFhLFVBQVU7QUFDakMsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFdBQVcsWUFBWSxPQUFPLFFBQVE7QUFDNUMsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sS0FBSyw0QkFBNEIsdUJBQXVCLFFBQVE7QUFBQSxFQUN4RTtBQUNEO0FBOXBCYTtBQUFBLEVBRFg7QUFBQSxHQWh3Qlcsc0JBaXdCQTtBQWp3QkEsd0JBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBbEJVOyIsCiAgIm5hbWVzIjogWyJ3aW5kb3ciLCAiZXJyb3IiLCAicmVzb2x2ZSIsICJ0eXBlIl0KfQo=
