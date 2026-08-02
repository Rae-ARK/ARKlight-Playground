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
import { app, BrowserWindow, desktopCapturer, globalShortcut, powerMonitor, protocol, screen as electronScreen, session, systemPreferences } from "electron";
import { addUNCHostToAllowlist, disableUNCAccessRestrictions } from "../../base/node/unc.js";
import { validatedIpcMain } from "../../base/parts/ipc/electron-main/ipcMain.js";
import { hostname, release } from "os";
import { initWindowsVersionInfo } from "../../base/node/windowsVersion.js";
import { VSBuffer } from "../../base/common/buffer.js";
import { toErrorMessage } from "../../base/common/errorMessage.js";
import { Event } from "../../base/common/event.js";
import { parse } from "../../base/common/jsonc.js";
import { getPathLabel } from "../../base/common/labels.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../base/common/lifecycle.js";
import { Schemas, VSCODE_AUTHORITY } from "../../base/common/network.js";
import { join, posix } from "../../base/common/path.js";
import { isLinux, isLinuxSnap, isMacintosh, isWindows, OS } from "../../base/common/platform.js";
import { assertType } from "../../base/common/types.js";
import { URI } from "../../base/common/uri.js";
import { generateUuid } from "../../base/common/uuid.js";
import { registerContextMenuListener } from "../../base/parts/contextmenu/electron-main/contextmenu.js";
import { getDelayedChannel, ProxyChannel, StaticRouter } from "../../base/parts/ipc/common/ipc.js";
import { Server as ElectronIPCServer } from "../../base/parts/ipc/electron-main/ipc.electron.js";
import { Client as MessagePortClient } from "../../base/parts/ipc/electron-main/ipc.mp.js";
import { IProxyAuthService, ProxyAuthService } from "../../platform/native/electron-main/auth.js";
import { localize } from "../../nls.js";
import { IBackupMainService } from "../../platform/backup/electron-main/backup.js";
import { BackupMainService } from "../../platform/backup/electron-main/backupMainService.js";
import { IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { ElectronExtensionHostDebugBroadcastChannel } from "../../platform/debug/electron-main/extensionHostDebugIpc.js";
import { IDiagnosticsService } from "../../platform/diagnostics/common/diagnostics.js";
import { DiagnosticsMainService, IDiagnosticsMainService } from "../../platform/diagnostics/electron-main/diagnosticsMainService.js";
import { DialogMainService, IDialogMainService } from "../../platform/dialogs/electron-main/dialogMainService.js";
import { IEncryptionMainService } from "../../platform/encryption/common/encryptionService.js";
import { EncryptionMainService } from "../../platform/encryption/electron-main/encryptionMainService.js";
import { ipcBrowserViewChannelName } from "../../platform/browserView/common/browserView.js";
import { ipcBrowserViewGroupChannelName } from "../../platform/browserView/common/browserViewGroup.js";
import { BrowserViewMainService, IBrowserViewMainService } from "../../platform/browserView/electron-main/browserViewMainService.js";
import { BrowserViewGroupMainService, IBrowserViewGroupMainService } from "../../platform/browserView/electron-main/browserViewGroupMainService.js";
import { IEnvironmentMainService } from "../../platform/environment/electron-main/environmentMainService.js";
import { isLaunchedFromCli } from "../../platform/environment/node/argvHelper.js";
import { getResolvedShellEnv } from "../../platform/shell/node/shellEnv.js";
import { IExtensionHostStarter, ipcExtensionHostStarterChannelName } from "../../platform/extensions/common/extensionHostStarter.js";
import { ExtensionHostStarter } from "../../platform/extensions/electron-main/extensionHostStarter.js";
import { IExternalTerminalMainService } from "../../platform/externalTerminal/electron-main/externalTerminal.js";
import { LinuxExternalTerminalService, MacExternalTerminalService, WindowsExternalTerminalService } from "../../platform/externalTerminal/node/externalTerminalService.js";
import { ISandboxHelperMainService } from "../../platform/sandbox/electron-main/sandboxHelperService.js";
import { SandboxHelperService } from "../../platform/sandbox/node/sandboxHelper.js";
import { LOCAL_FILE_SYSTEM_CHANNEL_NAME } from "../../platform/files/common/diskFileSystemProviderClient.js";
import { IFileService } from "../../platform/files/common/files.js";
import { DiskFileSystemProviderChannel } from "../../platform/files/electron-main/diskFileSystemProviderServer.js";
import { DiskFileSystemProvider } from "../../platform/files/node/diskFileSystemProvider.js";
import { SyncDescriptor } from "../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../platform/instantiation/common/serviceCollection.js";
import { ProcessMainService } from "../../platform/process/electron-main/processMainService.js";
import { IKeyboardLayoutMainService, KeyboardLayoutMainService } from "../../platform/keyboardLayout/electron-main/keyboardLayoutMainService.js";
import { ILaunchMainService, LaunchMainService } from "../../platform/launch/electron-main/launchMainService.js";
import { ILifecycleMainService, LifecycleMainPhase, ShutdownReason } from "../../platform/lifecycle/electron-main/lifecycleMainService.js";
import { ILoggerService, ILogService } from "../../platform/log/common/log.js";
import { IMenubarMainService, MenubarMainService } from "../../platform/menubar/electron-main/menubarMainService.js";
import { INativeHostMainService, NativeHostMainService } from "../../platform/native/electron-main/nativeHostMainService.js";
import { GlobalKeybindingsMainService, IGlobalKeybindingsMainService } from "../../platform/globalKeybindings/electron-main/globalKeybindingsMainService.js";
import { IMeteredConnectionService } from "../../platform/meteredConnection/common/meteredConnection.js";
import { METERED_CONNECTION_CHANNEL } from "../../platform/meteredConnection/common/meteredConnectionIpc.js";
import { MeteredConnectionChannel } from "../../platform/meteredConnection/electron-main/meteredConnectionChannel.js";
import { MeteredConnectionMainService } from "../../platform/meteredConnection/electron-main/meteredConnectionMainService.js";
import { IProductService } from "../../platform/product/common/productService.js";
import { getRemoteAuthority } from "../../platform/remote/common/remoteHosts.js";
import { SharedProcess } from "../../platform/sharedProcess/electron-main/sharedProcess.js";
import { ISignService } from "../../platform/sign/common/sign.js";
import { IStateService } from "../../platform/state/node/state.js";
import { StorageDatabaseChannel } from "../../platform/storage/electron-main/storageIpc.js";
import { ApplicationStorageMainService, IApplicationStorageMainService, IStorageMainService, StorageMainService } from "../../platform/storage/electron-main/storageMainService.js";
import { resolveCommonProperties } from "../../platform/telemetry/common/commonProperties.js";
import { ITelemetryService, TelemetryLevel } from "../../platform/telemetry/common/telemetry.js";
import { TelemetryAppenderClient } from "../../platform/telemetry/common/telemetryIpc.js";
import { TelemetryService } from "../../platform/telemetry/common/telemetryService.js";
import { getPiiPathsFromEnvironment, getTelemetryLevel, isInternalTelemetry, NullTelemetryService, supportsTelemetry } from "../../platform/telemetry/common/telemetryUtils.js";
import { IUpdateService } from "../../platform/update/common/update.js";
import { UpdateChannel } from "../../platform/update/common/updateIpc.js";
import { NotAvailableUpdateDialog } from "../../platform/update/electron-main/notAvailableUpdateDialog.js";
import { DarwinUpdateService } from "../../platform/update/electron-main/updateService.darwin.js";
import { LinuxUpdateService } from "../../platform/update/electron-main/updateService.linux.js";
import { SnapUpdateService } from "../../platform/update/electron-main/updateService.snap.js";
import { Win32UpdateService } from "../../platform/update/electron-main/updateService.win32.js";
import { isInnoSetupInstall } from "../../platform/update/electron-main/win32UpdateType.js";
import { IURLService } from "../../platform/url/common/url.js";
import { URLHandlerChannelClient, URLHandlerRouter } from "../../platform/url/common/urlIpc.js";
import { NativeURLService } from "../../platform/url/common/urlService.js";
import { ElectronURLListener } from "../../platform/url/electron-main/electronUrlListener.js";
import { IWebviewManagerService } from "../../platform/webview/common/webviewManagerService.js";
import { WebviewMainService } from "../../platform/webview/electron-main/webviewMainService.js";
import { isFolderToOpen, isWorkspaceToOpen } from "../../platform/window/common/window.js";
import { getAllWindowsExcludingOffscreen, IWindowsMainService, OpenContext } from "../../platform/windows/electron-main/windows.js";
import { WindowsMainService } from "../../platform/windows/electron-main/windowsMainService.js";
import { ActiveWindowManager } from "../../platform/windows/node/windowTracker.js";
import { hasWorkspaceFileExtension } from "../../platform/workspace/common/workspace.js";
import { IWorkspacesService } from "../../platform/workspaces/common/workspaces.js";
import { IWorkspacesHistoryMainService, WorkspacesHistoryMainService } from "../../platform/workspaces/electron-main/workspacesHistoryMainService.js";
import { WorkspacesMainService } from "../../platform/workspaces/electron-main/workspacesMainService.js";
import { IWorkspacesManagementMainService, WorkspacesManagementMainService } from "../../platform/workspaces/electron-main/workspacesManagementMainService.js";
import { IPolicyService } from "../../platform/policy/common/policy.js";
import { INativeManagedSettingsService, IFileManagedSettingsService } from "../../platform/policy/common/copilotManagedSettings.js";
import { NativeManagedSettingsChannel } from "../../platform/policy/common/nativeManagedSettingsIpc.js";
import { FileManagedSettingsChannel } from "../../platform/policy/common/fileManagedSettingsIpc.js";
import { PolicyChannel } from "../../platform/policy/common/policyIpc.js";
import { IUserDataProfilesMainService } from "../../platform/userDataProfile/electron-main/userDataProfile.js";
import { IExtensionsProfileScannerService } from "../../platform/extensionManagement/common/extensionsProfileScannerService.js";
import { IExtensionsScannerService } from "../../platform/extensionManagement/common/extensionsScannerService.js";
import { ExtensionsScannerService } from "../../platform/extensionManagement/node/extensionsScannerService.js";
import { UserDataProfilesHandler } from "../../platform/userDataProfile/electron-main/userDataProfilesHandler.js";
import { ProfileStorageChangesListenerChannel } from "../../platform/userDataProfile/electron-main/userDataProfileStorageIpc.js";
import { Promises, RunOnceScheduler, runWhenGlobalIdle } from "../../base/common/async.js";
import { CancellationToken } from "../../base/common/cancellation.js";
import { resolveMachineId, resolveSqmId, resolveDevDeviceId, validateDevDeviceId } from "../../platform/telemetry/electron-main/telemetryUtils.js";
import { ExtensionsProfileScannerService } from "../../platform/extensionManagement/node/extensionsProfileScannerService.js";
import { LoggerChannel } from "../../platform/log/electron-main/logIpc.js";
import { ILoggerMainService } from "../../platform/log/electron-main/loggerService.js";
import { IUtilityProcessWorkerMainService, UtilityProcessWorkerMainService } from "../../platform/utilityProcess/electron-main/utilityProcessWorkerMainService.js";
import { ipcUtilityProcessWorkerChannelName } from "../../platform/utilityProcess/common/utilityProcessWorkerService.js";
import { ILocalPtyService, LocalReconnectConstants, TerminalIpcChannels, TerminalSettingId } from "../../platform/terminal/common/terminal.js";
import { ElectronPtyHostStarter } from "../../platform/terminal/electron-main/electronPtyHostStarter.js";
import { PtyHostService } from "../../platform/terminal/node/ptyHostService.js";
import { ElectronAgentHostStarter } from "../../platform/agentHost/electron-main/electronAgentHostStarter.js";
import { AgentHostProcessManager } from "../../platform/agentHost/node/agentHostService.js";
import { NODE_REMOTE_RESOURCE_CHANNEL_NAME, NODE_REMOTE_RESOURCE_IPC_METHOD_NAME, NodeRemoteResourceRouter } from "../../platform/remote/common/electronRemoteResources.js";
import { Lazy } from "../../base/common/lazy.js";
import { IAuxiliaryWindowsMainService } from "../../platform/auxiliaryWindow/electron-main/auxiliaryWindows.js";
import { AuxiliaryWindowsMainService } from "../../platform/auxiliaryWindow/electron-main/auxiliaryWindowsMainService.js";
import { normalizeNFC } from "../../base/common/normalization.js";
import { ICSSDevelopmentService, CSSDevelopmentService } from "../../platform/cssDev/node/cssDevService.js";
import { INativeMcpDiscoveryHelperService, NativeMcpDiscoveryHelperChannelName } from "../../platform/mcp/common/nativeMcpDiscoveryHelper.js";
import { NativeMcpDiscoveryHelperService } from "../../platform/mcp/node/nativeMcpDiscoveryHelperService.js";
import { IMcpGatewayService, McpGatewayChannelName } from "../../platform/mcp/common/mcpGateway.js";
import { McpGatewayService } from "../../platform/mcp/node/mcpGatewayService.js";
import { McpGatewayChannel } from "../../platform/mcp/node/mcpGatewayChannel.js";
import { IWebContentExtractorService } from "../../platform/webContentExtractor/common/webContentExtractor.js";
import { NativeWebContentExtractorService } from "../../platform/webContentExtractor/electron-main/webContentExtractorService.js";
import { AgentNetworkFilterService, IAgentNetworkFilterService } from "../../platform/networkFilter/common/networkFilterService.js";
import { ITerminalSandboxService, NullTerminalSandboxService } from "../../platform/sandbox/common/terminalSandboxService.js";
import ErrorTelemetry from "../../platform/telemetry/electron-main/errorTelemetry.js";
let CodeApplication = class extends Disposable {
  constructor(mainProcessNodeIpcServer, userEnv, mainInstantiationService, logService, loggerService, environmentMainService, lifecycleMainService, configurationService, stateService, fileService, productService, userDataProfilesMainService) {
    super();
    this.mainProcessNodeIpcServer = mainProcessNodeIpcServer;
    this.userEnv = userEnv;
    this.mainInstantiationService = mainInstantiationService;
    this.logService = logService;
    this.loggerService = loggerService;
    this.environmentMainService = environmentMainService;
    this.lifecycleMainService = lifecycleMainService;
    this.configurationService = configurationService;
    this.stateService = stateService;
    this.fileService = fileService;
    this.productService = productService;
    this.userDataProfilesMainService = userDataProfilesMainService;
    this.configureSession();
    this.registerListeners();
  }
  configureSession() {
    const isUrlFromWindow = (requestingUrl) => requestingUrl?.startsWith(`${Schemas.vscodeFileResource}://${VSCODE_AUTHORITY}`);
    const isUrlFromWebview = (requestingUrl) => requestingUrl?.startsWith(`${Schemas.vscodeWebview}://`);
    const alwaysAllowedPermissions = /* @__PURE__ */ new Set(["pointerLock", "notifications"]);
    const allowedPermissionsInWebview = /* @__PURE__ */ new Set([
      ...alwaysAllowedPermissions,
      "clipboard-read",
      "clipboard-sanitized-write",
      // TODO(deepak1556): Should be removed once migration is complete
      // https://github.com/microsoft/vscode/issues/239228
      "deprecated-sync-clipboard-read"
    ]);
    const allowedPermissionsInCore = /* @__PURE__ */ new Set([
      ...alwaysAllowedPermissions,
      "media",
      "local-fonts",
      // TODO(deepak1556): Should be removed once migration is complete
      // https://github.com/microsoft/vscode/issues/239228
      "deprecated-sync-clipboard-read"
    ]);
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
      if (isUrlFromWebview(details.requestingUrl)) {
        return callback(allowedPermissionsInWebview.has(permission));
      }
      if (isUrlFromWindow(details.requestingUrl)) {
        return callback(allowedPermissionsInCore.has(permission));
      }
      return callback(false);
    });
    session.defaultSession.setPermissionCheckHandler((_webContents, permission, _origin, details) => {
      if (isUrlFromWebview(details.requestingUrl)) {
        return allowedPermissionsInWebview.has(permission);
      }
      if (isUrlFromWindow(details.requestingUrl)) {
        return allowedPermissionsInCore.has(permission);
      }
      return false;
    });
    let cachedScreenSources;
    const invalidateScreenSourceCache = () => {
      cachedScreenSources = void 0;
    };
    electronScreen.on("display-added", invalidateScreenSourceCache);
    electronScreen.on("display-removed", invalidateScreenSourceCache);
    electronScreen.on("display-metrics-changed", invalidateScreenSourceCache);
    this._register(toDisposable(() => {
      electronScreen.off("display-added", invalidateScreenSourceCache);
      electronScreen.off("display-removed", invalidateScreenSourceCache);
      electronScreen.off("display-metrics-changed", invalidateScreenSourceCache);
    }));
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        const frame = request.frame;
        const win = frame ? BrowserWindow.getAllWindows().find((w) => w.webContents.mainFrame === frame) : void 0;
        const displays = electronScreen.getAllDisplays();
        let targetDisplay = displays[0];
        if (win) {
          const winBounds = win.getBounds();
          targetDisplay = electronScreen.getDisplayNearestPoint({
            x: winBounds.x + winBounds.width / 2,
            y: winBounds.y + winBounds.height / 2
          });
        }
        if (!cachedScreenSources) {
          cachedScreenSources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 0, height: 0 }
          });
        }
        let match = cachedScreenSources.find((s) => s.display_id === String(targetDisplay.id));
        if (!match) {
          cachedScreenSources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 0, height: 0 }
          });
          match = cachedScreenSources.find((s) => s.display_id === String(targetDisplay.id));
        }
        const chosen = match ?? cachedScreenSources[0];
        if (!chosen) {
          callback({});
          return;
        }
        callback({ video: chosen });
      } catch {
        callback({});
      }
    });
    const supportedSvgSchemes = /* @__PURE__ */ new Set([Schemas.file, Schemas.vscodeFileResource, Schemas.vscodeRemoteResource, Schemas.vscodeManagedRemoteResource, "devtools"]);
    const isSafeFrame = (requestFrame) => {
      for (let frame = requestFrame; frame; frame = frame.parent) {
        if (frame.isDestroyed()) {
          return false;
        }
        if (frame.url.startsWith(`${Schemas.vscodeWebview}://`)) {
          return true;
        }
      }
      return false;
    };
    const isSvgRequestFromSafeContext = (details) => {
      return details.resourceType === "xhr" || isSafeFrame(details.frame);
    };
    const isAllowedVsCodeFileRequest = (details) => {
      const frame = details.frame;
      if (!frame || frame.isDestroyed() || !this.windowsMainService) {
        return false;
      }
      const windows = getAllWindowsExcludingOffscreen();
      for (const window of windows) {
        if (frame.processId === window.webContents.mainFrame.processId) {
          return true;
        }
      }
      return false;
    };
    const isAllowedWebviewRequest = (uri, details) => {
      if (uri.path !== "/index.html") {
        return true;
      }
      const frame = details.frame;
      if (!frame || frame.isDestroyed() || !this.windowsMainService) {
        return false;
      }
      for (const window of this.windowsMainService.getWindows()) {
        if (window.win) {
          if (frame.processId === window.win.webContents.mainFrame.processId) {
            return true;
          }
        }
      }
      return false;
    };
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const uri = URI.parse(details.url);
      if (uri.scheme === Schemas.vscodeWebview) {
        if (!isAllowedWebviewRequest(uri, details)) {
          this.logService.error("Blocked vscode-webview request", details.url);
          return callback({ cancel: true });
        }
      }
      if (uri.scheme === Schemas.vscodeFileResource) {
        if (!isAllowedVsCodeFileRequest(details)) {
          this.logService.error("Blocked vscode-file request", details.url);
          return callback({ cancel: true });
        }
      }
      if (uri.path.endsWith(".svg")) {
        const isSafeResourceUrl = supportedSvgSchemes.has(uri.scheme);
        if (!isSafeResourceUrl) {
          return callback({ cancel: !isSvgRequestFromSafeContext(details) });
        }
      }
      return callback({ cancel: false });
    });
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = details.responseHeaders;
      const contentTypes = responseHeaders["content-type"] || responseHeaders["Content-Type"];
      if (contentTypes && Array.isArray(contentTypes)) {
        const uri = URI.parse(details.url);
        if (uri.path.endsWith(".svg")) {
          if (supportedSvgSchemes.has(uri.scheme)) {
            responseHeaders["Content-Type"] = ["image/svg+xml"];
            return callback({ cancel: false, responseHeaders });
          }
        }
        if (!uri.path.endsWith(Schemas.vscodeRemoteResource) && contentTypes.some((contentType) => contentType.toLowerCase().includes("image/svg"))) {
          return callback({ cancel: !isSvgRequestFromSafeContext(details) });
        }
      }
      return callback({ cancel: false });
    });
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (details.url.startsWith("https://vscode.download.prss.microsoft.com/")) {
        const responseHeaders = details.responseHeaders ?? /* @__PURE__ */ Object.create(null);
        if (responseHeaders["Access-Control-Allow-Origin"] === void 0) {
          responseHeaders["Access-Control-Allow-Origin"] = ["*"];
          return callback({ cancel: false, responseHeaders });
        }
      }
      return callback({ cancel: false });
    });
    const defaultSession = session.defaultSession;
    if (typeof defaultSession.setCodeCachePath === "function" && this.environmentMainService.codeCachePath) {
      defaultSession.setCodeCachePath(join(this.environmentMainService.codeCachePath, "chrome"));
    }
    if (isWindows) {
      if (this.configurationService.getValue("security.restrictUNCAccess") === false) {
        disableUNCAccessRestrictions();
      } else {
        addUNCHostToAllowlist(this.configurationService.getValue("security.allowedUNCHosts"));
      }
    }
  }
  registerListeners() {
    Event.once(this.lifecycleMainService.onWillShutdown)(() => this.dispose());
    registerContextMenuListener();
    app.on("accessibility-support-changed", (event, accessibilitySupportEnabled) => {
      this.windowsMainService?.sendToAll("vscode:accessibilitySupportChanged", accessibilitySupportEnabled);
    });
    app.on("activate", async (event, hasVisibleWindows) => {
      this.logService.trace("app#activate");
      if (!hasVisibleWindows) {
        await this.windowsMainService?.openEmptyWindow({ context: OpenContext.DOCK });
      }
    });
    app.on("web-contents-created", (event, contents) => {
      if (contents?.opener?.url.startsWith(`${Schemas.vscodeFileResource}://${VSCODE_AUTHORITY}/`)) {
        this.logService.trace('[aux window]  app.on("web-contents-created"): Registering auxiliary window');
        this.auxiliaryWindowsMainService?.registerWindow(contents);
      }
      contents.on("will-navigate", (event2) => {
        if (BrowserViewMainService.isBrowserViewWebContents(contents)) {
          return;
        }
        this.logService.error("webContents#will-navigate: Prevented webcontent navigation");
        event2.preventDefault();
      });
      contents.setWindowOpenHandler((details) => {
        if (details.url === "about:blank") {
          this.logService.trace("[aux window] webContents#setWindowOpenHandler: Allowing auxiliary window to open on about:blank");
          return {
            action: "allow",
            overrideBrowserWindowOptions: this.auxiliaryWindowsMainService?.createWindow(details)
          };
        } else {
          this.logService.trace(`webContents#setWindowOpenHandler: Prevented opening window with URL ${details.url}}`);
          this.nativeHostMainService?.openExternal(void 0, details.url);
          return { action: "deny" };
        }
      });
    });
    let macOpenFileURIs = [];
    let runningTimeout = void 0;
    app.on("open-file", (event, path) => {
      path = normalizeNFC(path);
      this.logService.trace("app#open-file: ", path);
      event.preventDefault();
      macOpenFileURIs.push(hasWorkspaceFileExtension(path) ? { workspaceUri: URI.file(path) } : { fileUri: URI.file(path) });
      if (runningTimeout !== void 0) {
        clearTimeout(runningTimeout);
        runningTimeout = void 0;
      }
      runningTimeout = setTimeout(async () => {
        await this.windowsMainService?.open({
          context: OpenContext.DOCK,
          cli: this.environmentMainService.args,
          urisToOpen: macOpenFileURIs,
          gotoLineMode: false,
          preferNewWindow: true
          /* dropping on the dock or opening from finder prefers to open in a new window */
        });
        macOpenFileURIs = [];
        runningTimeout = void 0;
      }, 100);
    });
    app.on("new-window-for-tab", async () => {
      await this.windowsMainService?.openEmptyWindow({ context: OpenContext.DESKTOP });
    });
    validatedIpcMain.handle("vscode:fetchShellEnv", (event) => {
      const window = this.windowsMainService?.getWindowByWebContents(event.sender);
      let args;
      let env;
      if (window?.config) {
        args = window.config;
        env = { ...process.env, ...window.config.userEnv };
      } else {
        args = this.environmentMainService.args;
        env = process.env;
      }
      return this.resolveShellEnvironment(args, env, false);
    });
    validatedIpcMain.on("vscode:toggleDevTools", (event) => event.sender.toggleDevTools());
    validatedIpcMain.on("vscode:openDevTools", (event) => event.sender.openDevTools());
    validatedIpcMain.on("vscode:reloadWindow", (event) => event.sender.reload());
    validatedIpcMain.handle("vscode:notifyZoomLevel", async (event, zoomLevel) => {
      const window = this.windowsMainService?.getWindowByWebContents(event.sender);
      if (window) {
        window.notifyZoomLevel(zoomLevel);
      }
    });
  }
  async startup() {
    this.logService.debug("Starting VS Code");
    this.logService.debug(`from: ${this.environmentMainService.appRoot}`);
    this.logService.debug("args:", this.environmentMainService.args);
    const win32AppUserModelId = this.productService.win32AppUserModelId;
    if (isWindows && win32AppUserModelId) {
      app.setAppUserModelId(win32AppUserModelId);
    }
    try {
      if (isMacintosh && this.configurationService.getValue("window.nativeTabs") === true && !systemPreferences.getUserDefault("NSUseImprovedLayoutPass", "boolean")) {
        systemPreferences.setUserDefault("NSUseImprovedLayoutPass", "boolean", true);
      }
    } catch (error) {
      this.logService.error(error);
    }
    const mainProcessElectronServer = new ElectronIPCServer();
    Event.once(this.lifecycleMainService.onWillShutdown)((e) => {
      if (e.reason === ShutdownReason.KILL) {
        mainProcessElectronServer.dispose();
      }
    });
    const [machineId, sqmId, devDeviceId] = await Promise.all([
      resolveMachineId(this.stateService, this.logService),
      resolveSqmId(this.stateService, this.logService),
      resolveDevDeviceId(this.stateService, this.logService)
    ]);
    const { sharedProcessReady, sharedProcessClient } = this.setupSharedProcess(machineId, sqmId, devDeviceId);
    const appInstantiationService = await this.initServices(machineId, sqmId, devDeviceId, sharedProcessReady);
    appInstantiationService.invokeFunction((accessor) => this._register(new ErrorTelemetry(accessor.get(ILogService), accessor.get(ITelemetryService))));
    const agentHostStarter = new ElectronAgentHostStarter({ machineId, sqmId, devDeviceId }, this.configurationService, this.environmentMainService, this.lifecycleMainService, this.logService);
    this._register(appInstantiationService.createInstance(AgentHostProcessManager, agentHostStarter));
    appInstantiationService.invokeFunction((accessor) => {
      accessor.get(IMeteredConnectionService).setTelemetryService(accessor.get(ITelemetryService));
    });
    appInstantiationService.invokeFunction((accessor) => accessor.get(IProxyAuthService));
    this._register(appInstantiationService.createInstance(UserDataProfilesHandler));
    appInstantiationService.invokeFunction((accessor) => this.initChannels(accessor, mainProcessElectronServer, sharedProcessClient));
    const initialProtocolUrls = await appInstantiationService.invokeFunction((accessor) => this.setupProtocolUrlHandlers(accessor, mainProcessElectronServer));
    this.setupManagedRemoteResourceUrlHandler(mainProcessElectronServer);
    this.lifecycleMainService.phase = LifecycleMainPhase.Ready;
    await appInstantiationService.invokeFunction((accessor) => this.openFirstWindow(accessor, initialProtocolUrls));
    this.lifecycleMainService.phase = LifecycleMainPhase.AfterWindowOpen;
    this.afterWindowOpen(appInstantiationService);
    const eventuallyPhaseScheduler = this._register(new RunOnceScheduler(() => {
      this._register(runWhenGlobalIdle(() => {
        this.lifecycleMainService.phase = LifecycleMainPhase.Eventually;
        this.eventuallyAfterWindowOpen(appInstantiationService);
      }, 2500));
    }, 2500));
    eventuallyPhaseScheduler.schedule();
  }
  async setupProtocolUrlHandlers(accessor, mainProcessElectronServer) {
    const windowsMainService = this.windowsMainService = accessor.get(IWindowsMainService);
    const urlService = accessor.get(IURLService);
    const nativeHostMainService = this.nativeHostMainService = accessor.get(INativeHostMainService);
    const dialogMainService = accessor.get(IDialogMainService);
    const app2 = this;
    urlService.registerHandler({
      async handleURL(uri, options) {
        return app2.handleProtocolUrl(windowsMainService, dialogMainService, urlService, uri, options);
      }
    });
    const activeWindowManager = this._register(new ActiveWindowManager({
      onDidOpenMainWindow: nativeHostMainService.onDidOpenMainWindow,
      onDidFocusMainWindow: nativeHostMainService.onDidFocusMainWindow,
      getActiveWindowId: () => nativeHostMainService.getActiveWindowId(-1)
    }));
    const activeWindowRouter = new StaticRouter((ctx) => activeWindowManager.getActiveClientId().then((id) => ctx === id));
    const urlHandlerRouter = new URLHandlerRouter(activeWindowRouter, this.logService);
    const urlHandlerChannel = mainProcessElectronServer.getChannel("urlHandler", urlHandlerRouter);
    urlService.registerHandler(new URLHandlerChannelClient(urlHandlerChannel));
    const initialProtocolUrls = await this.resolveInitialProtocolUrls(windowsMainService, dialogMainService);
    this._register(new ElectronURLListener(initialProtocolUrls?.urls, urlService, windowsMainService, this.environmentMainService, this.productService, this.logService));
    return initialProtocolUrls;
  }
  setupManagedRemoteResourceUrlHandler(mainProcessElectronServer) {
    const notFound = () => ({ statusCode: 404, data: "Not found" });
    const remoteResourceChannel = new Lazy(() => mainProcessElectronServer.getChannel(
      NODE_REMOTE_RESOURCE_CHANNEL_NAME,
      new NodeRemoteResourceRouter()
    ));
    protocol.registerBufferProtocol(Schemas.vscodeManagedRemoteResource, (request, callback) => {
      const url = URI.parse(request.url);
      if (!url.authority.startsWith("window:")) {
        return callback(notFound());
      }
      remoteResourceChannel.value.call(NODE_REMOTE_RESOURCE_IPC_METHOD_NAME, [url]).then(
        (r) => callback({ ...r, data: Buffer.from(r.body, "base64") }),
        (err) => {
          this.logService.warn("error dispatching remote resource call", err);
          callback({ statusCode: 500, data: String(err) });
        }
      );
    });
  }
  async resolveInitialProtocolUrls(windowsMainService, dialogMainService) {
    const protocolUrlsFromCommandLine = this.environmentMainService.args["open-url"] ? this.environmentMainService.args._urls || [] : [];
    if (protocolUrlsFromCommandLine.length > 0) {
      this.logService.trace("app#resolveInitialProtocolUrls() protocol urls from command line:", protocolUrlsFromCommandLine);
    }
    const protocolUrlsFromEvent = global.getOpenUrls?.() || [];
    if (protocolUrlsFromEvent.length > 0) {
      this.logService.trace(`app#resolveInitialProtocolUrls() protocol urls from macOS 'open-url' event:`, protocolUrlsFromEvent);
    }
    if (protocolUrlsFromCommandLine.length + protocolUrlsFromEvent.length === 0) {
      return void 0;
    }
    const protocolUrls = [
      ...protocolUrlsFromCommandLine,
      ...protocolUrlsFromEvent
    ].map((url) => {
      try {
        return { uri: URI.parse(url), originalUrl: url };
      } catch {
        this.logService.trace("app#resolveInitialProtocolUrls() protocol url failed to parse:", url);
        return void 0;
      }
    });
    const openables = [];
    const urls = [];
    for (const protocolUrl of protocolUrls) {
      if (!protocolUrl) {
        continue;
      }
      const windowOpenable = this.getWindowOpenableFromProtocolUrl(protocolUrl.uri);
      if (windowOpenable) {
        if (await this.shouldBlockOpenable(windowOpenable, windowsMainService, dialogMainService)) {
          this.logService.trace("app#resolveInitialProtocolUrls() protocol url was blocked:", protocolUrl.uri.toString(true));
          continue;
        } else {
          this.logService.trace("app#resolveInitialProtocolUrls() protocol url will be handled as window to open:", protocolUrl.uri.toString(true), windowOpenable);
          openables.push(windowOpenable);
        }
      } else {
        this.logService.trace("app#resolveInitialProtocolUrls() protocol url will be passed to active window for handling:", protocolUrl.uri.toString(true));
        urls.push(protocolUrl);
      }
    }
    return { urls, openables };
  }
  async shouldBlockOpenable(openable, windowsMainService, dialogMainService) {
    let openableUri;
    let message;
    if (isWorkspaceToOpen(openable)) {
      openableUri = openable.workspaceUri;
      message = localize("confirmOpenMessageWorkspace", "An external application wants to open '{0}' in {1}. Do you want to open this workspace file?", openableUri.scheme === Schemas.file ? getPathLabel(openableUri, { os: OS, tildify: this.environmentMainService }) : openableUri.toString(true), this.productService.nameShort);
    } else if (isFolderToOpen(openable)) {
      openableUri = openable.folderUri;
      message = localize("confirmOpenMessageFolder", "An external application wants to open '{0}' in {1}. Do you want to open this folder?", openableUri.scheme === Schemas.file ? getPathLabel(openableUri, { os: OS, tildify: this.environmentMainService }) : openableUri.toString(true), this.productService.nameShort);
    } else {
      openableUri = openable.fileUri;
      message = localize("confirmOpenMessageFileOrFolder", "An external application wants to open '{0}' in {1}. Do you want to open this file or folder?", openableUri.scheme === Schemas.file ? getPathLabel(openableUri, { os: OS, tildify: this.environmentMainService }) : openableUri.toString(true), this.productService.nameShort);
    }
    if (openableUri.scheme !== Schemas.file && openableUri.scheme !== Schemas.vscodeRemote) {
      return false;
    }
    const askForConfirmation = this.configurationService.getValue(CodeApplication.SECURITY_PROTOCOL_HANDLING_CONFIRMATION_SETTING_KEY[openableUri.scheme]);
    if (askForConfirmation === false) {
      return false;
    }
    const { response, checkboxChecked } = await dialogMainService.showMessageBox({
      type: "warning",
      buttons: [
        localize({ key: "open", comment: ["&& denotes a mnemonic"] }, "&&Yes"),
        localize({ key: "cancel", comment: ["&& denotes a mnemonic"] }, "&&No")
      ],
      message,
      detail: localize("confirmOpenDetail", "If you did not initiate this request, it may represent an attempted attack on your system. Unless you took an explicit action to initiate this request, you should press 'No'"),
      checkboxLabel: openableUri.scheme === Schemas.file ? localize("doNotAskAgainLocal", "Allow opening local paths without asking") : localize("doNotAskAgainRemote", "Allow opening remote paths without asking"),
      cancelId: 1
    });
    if (response !== 0) {
      return true;
    }
    if (checkboxChecked) {
      const request = { channel: "vscode:disablePromptForProtocolHandling", args: openableUri.scheme === Schemas.file ? "local" : "remote" };
      windowsMainService.sendToFocused(request.channel, request.args);
      windowsMainService.sendToOpeningWindow(request.channel, request.args);
    }
    return false;
  }
  getWindowOpenableFromProtocolUrl(uri) {
    if (!uri.path) {
      return void 0;
    }
    if (uri.authority === Schemas.file) {
      const fileUri = URI.file(uri.fsPath);
      if (hasWorkspaceFileExtension(fileUri)) {
        return { workspaceUri: fileUri };
      }
      return { fileUri };
    } else if (uri.authority === Schemas.vscodeRemote) {
      const secondSlash = uri.path.indexOf(
        posix.sep,
        1
        /* skip over the leading slash */
      );
      let authority;
      let path;
      if (secondSlash !== -1) {
        authority = uri.path.substring(1, secondSlash);
        path = uri.path.substring(secondSlash);
      } else {
        authority = uri.path.substring(1);
        path = "/";
      }
      let query = uri.query;
      const params = new URLSearchParams(uri.query);
      if (params.get("windowId") === "_blank") {
        params.delete("windowId");
        query = params.toString();
      }
      const remoteUri = URI.from({ scheme: Schemas.vscodeRemote, authority, path, query, fragment: uri.fragment });
      if (hasWorkspaceFileExtension(path)) {
        return { workspaceUri: remoteUri };
      }
      if (/:[\d]+$/.test(path)) {
        return { fileUri: remoteUri };
      }
      return { folderUri: remoteUri };
    }
    return void 0;
  }
  async handleProtocolUrl(windowsMainService, dialogMainService, urlService, uri, options) {
    this.logService.trace("app#handleProtocolUrl():", uri.toString(true), options);
    if (uri.scheme === this.productService.urlProtocol && uri.path === "workspace") {
      uri = uri.with({
        authority: Schemas.file,
        path: URI.parse(uri.query).path,
        query: ""
      });
    }
    let shouldOpenInNewWindow = false;
    const params = new URLSearchParams(uri.query);
    if (params.get("windowId") === "_blank") {
      this.logService.trace(`app#handleProtocolUrl() found 'windowId=_blank' as parameter, setting shouldOpenInNewWindow=true:`, uri.toString(true));
      params.delete("windowId");
      uri = uri.with({ query: params.toString() });
      shouldOpenInNewWindow = true;
    } else if (isMacintosh && windowsMainService.getWindowCount() === 0) {
      this.logService.trace(`app#handleProtocolUrl() running on macOS with no window open, setting shouldOpenInNewWindow=true:`, uri.toString(true));
      shouldOpenInNewWindow = true;
    }
    const continueOn = params.get("continueOn");
    if (continueOn !== null) {
      this.logService.trace(`app#handleProtocolUrl() found 'continueOn' as parameter:`, uri.toString(true));
      params.delete("continueOn");
      uri = uri.with({ query: params.toString() });
      this.environmentMainService.continueOn = continueOn ?? void 0;
    }
    const session2 = params.get("session");
    if (session2 !== null) {
      this.logService.trace(`app#handleProtocolUrl() found 'session' as parameter:`, uri.toString(true));
      params.delete("session");
      uri = uri.with({ query: params.toString() });
    }
    const windowOpenableFromProtocolUrl = this.getWindowOpenableFromProtocolUrl(uri);
    if (windowOpenableFromProtocolUrl) {
      if (await this.shouldBlockOpenable(windowOpenableFromProtocolUrl, windowsMainService, dialogMainService)) {
        this.logService.trace("app#handleProtocolUrl() protocol url was blocked:", uri.toString(true));
        return true;
      } else {
        this.logService.trace("app#handleProtocolUrl() opening protocol url as window:", windowOpenableFromProtocolUrl, uri.toString(true));
        const window = (await windowsMainService.open({
          context: OpenContext.LINK,
          cli: { ...this.environmentMainService.args },
          urisToOpen: [windowOpenableFromProtocolUrl],
          forceNewWindow: shouldOpenInNewWindow,
          gotoLineMode: true
          // remoteAuthority: will be determined based on windowOpenableFromProtocolUrl
        })).at(0);
        window?.focus();
        if (window && session2) {
          window.sendWhenReady("vscode:openChatSession", CancellationToken.None, session2);
        }
        return true;
      }
    }
    if (shouldOpenInNewWindow) {
      this.logService.trace("app#handleProtocolUrl() opening empty window and passing in protocol url:", uri.toString(true));
      const window = (await windowsMainService.open({
        context: OpenContext.LINK,
        cli: { ...this.environmentMainService.args },
        forceNewWindow: true,
        forceEmpty: true,
        gotoLineMode: true,
        remoteAuthority: getRemoteAuthority(uri)
      })).at(0);
      await window?.ready();
      return urlService.open(uri, options);
    }
    this.logService.trace("app#handleProtocolUrl(): not handled", uri.toString(true), options);
    return false;
  }
  setupSharedProcess(machineId, sqmId, devDeviceId) {
    const sharedProcess = this._register(this.mainInstantiationService.createInstance(SharedProcess, machineId, sqmId, devDeviceId));
    this._register(sharedProcess.onDidCrash(() => this.windowsMainService?.sendToFocused("vscode:reportSharedProcessCrash")));
    const sharedProcessClient = (async () => {
      this.logService.trace("Main->SharedProcess#connect");
      const port = await sharedProcess.connect();
      this.logService.trace("Main->SharedProcess#connect: connection established");
      return new MessagePortClient(port, "main");
    })();
    const sharedProcessReady = (async () => {
      await sharedProcess.whenReady();
      return sharedProcessClient;
    })();
    return { sharedProcessReady, sharedProcessClient };
  }
  async initServices(machineId, sqmId, devDeviceId, sharedProcessReady) {
    const services = new ServiceCollection();
    switch (process.platform) {
      case "win32":
        services.set(IUpdateService, new SyncDescriptor(Win32UpdateService));
        break;
      case "linux":
        if (isLinuxSnap) {
          services.set(IUpdateService, new SyncDescriptor(SnapUpdateService, [process.env["SNAP"], process.env["SNAP_REVISION"]]));
        } else {
          services.set(IUpdateService, new SyncDescriptor(LinuxUpdateService));
        }
        break;
      case "darwin":
        services.set(IUpdateService, new SyncDescriptor(DarwinUpdateService));
        break;
    }
    services.set(IWindowsMainService, new SyncDescriptor(WindowsMainService, [machineId, sqmId, devDeviceId, this.userEnv], false));
    services.set(IAuxiliaryWindowsMainService, new SyncDescriptor(AuxiliaryWindowsMainService, void 0, false));
    const dialogMainService = new DialogMainService(this.logService, this.productService);
    services.set(IDialogMainService, dialogMainService);
    services.set(ILaunchMainService, new SyncDescriptor(
      LaunchMainService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(IDiagnosticsMainService, new SyncDescriptor(
      DiagnosticsMainService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(IDiagnosticsService, ProxyChannel.toService(getDelayedChannel(sharedProcessReady.then((client) => client.getChannel("diagnostics")))));
    services.set(IEncryptionMainService, new SyncDescriptor(EncryptionMainService));
    services.set(IBrowserViewMainService, new SyncDescriptor(
      BrowserViewMainService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(IBrowserViewGroupMainService, new SyncDescriptor(
      BrowserViewGroupMainService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(IKeyboardLayoutMainService, new SyncDescriptor(KeyboardLayoutMainService));
    services.set(INativeHostMainService, new SyncDescriptor(
      NativeHostMainService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(IGlobalKeybindingsMainService, new SyncDescriptor(GlobalKeybindingsMainService, [globalShortcut]));
    const meteredConnectionService = new MeteredConnectionMainService(this.configurationService);
    services.set(IMeteredConnectionService, meteredConnectionService);
    services.set(ITerminalSandboxService, new SyncDescriptor(NullTerminalSandboxService));
    services.set(IAgentNetworkFilterService, new SyncDescriptor(AgentNetworkFilterService, void 0, true));
    services.set(IWebContentExtractorService, new SyncDescriptor(
      NativeWebContentExtractorService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(IWebviewManagerService, new SyncDescriptor(WebviewMainService));
    services.set(IMenubarMainService, new SyncDescriptor(MenubarMainService));
    services.set(IExtensionHostStarter, new SyncDescriptor(ExtensionHostStarter));
    services.set(IStorageMainService, new SyncDescriptor(StorageMainService));
    services.set(IApplicationStorageMainService, new SyncDescriptor(ApplicationStorageMainService));
    const ptyHostStarter = new ElectronPtyHostStarter({
      graceTime: LocalReconnectConstants.GraceTime,
      shortGraceTime: LocalReconnectConstants.ShortGraceTime,
      scrollback: this.configurationService.getValue(TerminalSettingId.PersistentSessionScrollback) ?? 100
    }, this.configurationService, this.environmentMainService, this.lifecycleMainService, this.logService);
    const ptyHostService = new PtyHostService(
      ptyHostStarter,
      this.configurationService,
      this.logService,
      this.loggerService
    );
    services.set(ILocalPtyService, ptyHostService);
    if (isWindows) {
      services.set(IExternalTerminalMainService, new SyncDescriptor(WindowsExternalTerminalService));
    } else if (isMacintosh) {
      services.set(IExternalTerminalMainService, new SyncDescriptor(MacExternalTerminalService));
    } else if (isLinux) {
      services.set(IExternalTerminalMainService, new SyncDescriptor(LinuxExternalTerminalService));
    }
    services.set(ISandboxHelperMainService, new SyncDescriptor(SandboxHelperService));
    const backupMainService = new BackupMainService(this.environmentMainService, this.configurationService, this.logService, this.stateService);
    services.set(IBackupMainService, backupMainService);
    const workspacesManagementMainService = new WorkspacesManagementMainService(this.environmentMainService, this.logService, this.userDataProfilesMainService, backupMainService, dialogMainService);
    services.set(IWorkspacesManagementMainService, workspacesManagementMainService);
    services.set(IWorkspacesService, new SyncDescriptor(
      WorkspacesMainService,
      void 0,
      false
      /* proxied to other processes */
    ));
    services.set(IWorkspacesHistoryMainService, new SyncDescriptor(WorkspacesHistoryMainService, void 0, false));
    services.set(IURLService, new SyncDescriptor(
      NativeURLService,
      void 0,
      false
      /* proxied to other processes */
    ));
    if (supportsTelemetry(this.productService, this.environmentMainService)) {
      const isInternal = isInternalTelemetry(this.productService, this.configurationService);
      const channel = getDelayedChannel(sharedProcessReady.then((client) => client.getChannel("telemetryAppender")));
      const appender = new TelemetryAppenderClient(channel);
      const commonProperties = resolveCommonProperties(release(), hostname(), process.arch, this.productService.commit, this.productService.version, machineId, sqmId, devDeviceId, isInternal, this.productService.date);
      const piiPaths = getPiiPathsFromEnvironment(this.environmentMainService);
      const config = { appenders: [appender], commonProperties, piiPaths, sendErrorTelemetry: true };
      services.set(ITelemetryService, new SyncDescriptor(TelemetryService, [config], false));
    } else {
      services.set(ITelemetryService, NullTelemetryService);
    }
    services.set(IExtensionsProfileScannerService, new SyncDescriptor(ExtensionsProfileScannerService, void 0, true));
    services.set(IExtensionsScannerService, new SyncDescriptor(ExtensionsScannerService, void 0, true));
    services.set(IUtilityProcessWorkerMainService, new SyncDescriptor(UtilityProcessWorkerMainService, void 0, true));
    services.set(IProxyAuthService, new SyncDescriptor(ProxyAuthService));
    services.set(INativeMcpDiscoveryHelperService, new SyncDescriptor(NativeMcpDiscoveryHelperService));
    services.set(IMcpGatewayService, new SyncDescriptor(McpGatewayService));
    services.set(ICSSDevelopmentService, new SyncDescriptor(CSSDevelopmentService, void 0, true));
    await Promises.settled([
      backupMainService.initialize(),
      workspacesManagementMainService.initialize()
    ]);
    return this.mainInstantiationService.createChild(services);
  }
  initChannels(accessor, mainProcessElectronServer, sharedProcessClient) {
    const disposables = this._register(new DisposableStore());
    const launchChannel = ProxyChannel.fromService(accessor.get(ILaunchMainService), disposables, { disableMarshalling: true });
    this.mainProcessNodeIpcServer.registerChannel("launch", launchChannel);
    const diagnosticsChannel = ProxyChannel.fromService(accessor.get(IDiagnosticsMainService), disposables, { disableMarshalling: true });
    this.mainProcessNodeIpcServer.registerChannel("diagnostics", diagnosticsChannel);
    const policyChannel = disposables.add(new PolicyChannel(accessor.get(IPolicyService)));
    mainProcessElectronServer.registerChannel("policy", policyChannel);
    sharedProcessClient.then((client) => client.registerChannel("policy", policyChannel));
    const nativeManagedSettingsChannel = disposables.add(new NativeManagedSettingsChannel(accessor.get(INativeManagedSettingsService)));
    mainProcessElectronServer.registerChannel("nativeManagedSettings", nativeManagedSettingsChannel);
    const fileManagedSettingsChannel = disposables.add(new FileManagedSettingsChannel(accessor.get(IFileManagedSettingsService)));
    mainProcessElectronServer.registerChannel("fileManagedSettings", fileManagedSettingsChannel);
    const diskFileSystemProvider = this.fileService.getProvider(Schemas.file);
    assertType(diskFileSystemProvider instanceof DiskFileSystemProvider);
    const fileSystemProviderChannel = disposables.add(new DiskFileSystemProviderChannel(diskFileSystemProvider, this.logService, this.environmentMainService));
    mainProcessElectronServer.registerChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME, fileSystemProviderChannel);
    sharedProcessClient.then((client) => client.registerChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME, fileSystemProviderChannel));
    const userDataProfilesService = ProxyChannel.fromService(accessor.get(IUserDataProfilesMainService), disposables);
    mainProcessElectronServer.registerChannel("userDataProfiles", userDataProfilesService);
    sharedProcessClient.then((client) => client.registerChannel("userDataProfiles", userDataProfilesService));
    const updateService = accessor.get(IUpdateService);
    const updateChannel = new UpdateChannel(updateService);
    mainProcessElectronServer.registerChannel("update", updateChannel);
    this._register(new NotAvailableUpdateDialog(updateService, accessor.get(IDialogMainService), accessor.get(IWindowsMainService)));
    const meteredConnectionChannel = new MeteredConnectionChannel(accessor.get(IMeteredConnectionService));
    mainProcessElectronServer.registerChannel(METERED_CONNECTION_CHANNEL, meteredConnectionChannel);
    sharedProcessClient.then((client) => client.registerChannel(METERED_CONNECTION_CHANNEL, meteredConnectionChannel));
    const processChannel = ProxyChannel.fromService(new ProcessMainService(this.logService, accessor.get(IDiagnosticsService), accessor.get(IDiagnosticsMainService)), disposables);
    mainProcessElectronServer.registerChannel("process", processChannel);
    const encryptionChannel = ProxyChannel.fromService(accessor.get(IEncryptionMainService), disposables);
    mainProcessElectronServer.registerChannel("encryption", encryptionChannel);
    const browserViewChannel = ProxyChannel.fromService(accessor.get(IBrowserViewMainService), disposables);
    mainProcessElectronServer.registerChannel(ipcBrowserViewChannelName, browserViewChannel);
    sharedProcessClient.then((client) => client.registerChannel(ipcBrowserViewChannelName, browserViewChannel));
    const browserViewGroupChannel = ProxyChannel.fromService(accessor.get(IBrowserViewGroupMainService), disposables);
    mainProcessElectronServer.registerChannel(ipcBrowserViewGroupChannelName, browserViewGroupChannel);
    sharedProcessClient.then((client) => client.registerChannel(ipcBrowserViewGroupChannelName, browserViewGroupChannel));
    const signChannel = ProxyChannel.fromService(accessor.get(ISignService), disposables);
    mainProcessElectronServer.registerChannel("sign", signChannel);
    const keyboardLayoutChannel = ProxyChannel.fromService(accessor.get(IKeyboardLayoutMainService), disposables);
    mainProcessElectronServer.registerChannel("keyboardLayout", keyboardLayoutChannel);
    this.nativeHostMainService = accessor.get(INativeHostMainService);
    const nativeHostChannel = ProxyChannel.fromService(this.nativeHostMainService, disposables, {
      // This event has main-process consumers but no IPC consumer, so its buffer would never drain.
      unbufferedEvents: ["onDidBlurMainWindow"]
    });
    mainProcessElectronServer.registerChannel("nativeHost", nativeHostChannel);
    sharedProcessClient.then((client) => client.registerChannel("nativeHost", nativeHostChannel));
    const webContentExtractorChannel = ProxyChannel.fromService(accessor.get(IWebContentExtractorService), disposables);
    mainProcessElectronServer.registerChannel("webContentExtractor", webContentExtractorChannel);
    const workspacesChannel = ProxyChannel.fromService(accessor.get(IWorkspacesService), disposables);
    mainProcessElectronServer.registerChannel("workspaces", workspacesChannel);
    const menubarChannel = ProxyChannel.fromService(accessor.get(IMenubarMainService), disposables);
    mainProcessElectronServer.registerChannel("menubar", menubarChannel);
    const urlChannel = ProxyChannel.fromService(accessor.get(IURLService), disposables);
    mainProcessElectronServer.registerChannel("url", urlChannel);
    const webviewChannel = ProxyChannel.fromService(accessor.get(IWebviewManagerService), disposables);
    mainProcessElectronServer.registerChannel("webview", webviewChannel);
    const storageChannel = disposables.add(new StorageDatabaseChannel(this.logService, accessor.get(IStorageMainService)));
    mainProcessElectronServer.registerChannel("storage", storageChannel);
    sharedProcessClient.then((client) => client.registerChannel("storage", storageChannel));
    const profileStorageListener = disposables.add(new ProfileStorageChangesListenerChannel(accessor.get(IStorageMainService), accessor.get(IUserDataProfilesMainService), this.logService));
    sharedProcessClient.then((client) => client.registerChannel("profileStorageListener", profileStorageListener));
    const ptyHostChannel = ProxyChannel.fromService(accessor.get(ILocalPtyService), disposables);
    mainProcessElectronServer.registerChannel(TerminalIpcChannels.LocalPty, ptyHostChannel);
    const externalTerminalChannel = ProxyChannel.fromService(accessor.get(IExternalTerminalMainService), disposables);
    mainProcessElectronServer.registerChannel("externalTerminal", externalTerminalChannel);
    const sandboxHelperChannel = ProxyChannel.fromService(accessor.get(ISandboxHelperMainService), disposables);
    mainProcessElectronServer.registerChannel("sandboxHelper", sandboxHelperChannel);
    const mcpDiscoveryChannel = ProxyChannel.fromService(accessor.get(INativeMcpDiscoveryHelperService), disposables);
    mainProcessElectronServer.registerChannel(NativeMcpDiscoveryHelperChannelName, mcpDiscoveryChannel);
    const mcpGatewayChannel = this._register(new McpGatewayChannel(mainProcessElectronServer, accessor.get(IMcpGatewayService), accessor.get(ILoggerMainService)));
    mainProcessElectronServer.registerChannel(McpGatewayChannelName, mcpGatewayChannel);
    const loggerChannel = this._register(new LoggerChannel(accessor.get(ILoggerMainService)));
    mainProcessElectronServer.registerChannel("logger", loggerChannel);
    sharedProcessClient.then((client) => client.registerChannel("logger", loggerChannel));
    const electronExtensionHostDebugBroadcastChannel = new ElectronExtensionHostDebugBroadcastChannel(accessor.get(IWindowsMainService));
    mainProcessElectronServer.registerChannel("extensionhostdebugservice", electronExtensionHostDebugBroadcastChannel);
    const extensionHostStarterChannel = ProxyChannel.fromService(accessor.get(IExtensionHostStarter), disposables);
    mainProcessElectronServer.registerChannel(ipcExtensionHostStarterChannelName, extensionHostStarterChannel);
    const utilityProcessWorkerChannel = ProxyChannel.fromService(accessor.get(IUtilityProcessWorkerMainService), disposables);
    mainProcessElectronServer.registerChannel(ipcUtilityProcessWorkerChannelName, utilityProcessWorkerChannel);
  }
  async openFirstWindow(accessor, initialProtocolUrls) {
    const windowsMainService = this.windowsMainService = accessor.get(IWindowsMainService);
    this.auxiliaryWindowsMainService = accessor.get(IAuxiliaryWindowsMainService);
    const context = isLaunchedFromCli(process.env) ? OpenContext.CLI : OpenContext.DESKTOP;
    const args = this.environmentMainService.args;
    if (args["agents"]) {
      return windowsMainService.openAgentsWindow({
        context,
        cli: args,
        initialStartup: true
      });
    }
    if (initialProtocolUrls) {
      if (initialProtocolUrls.openables.length > 0) {
        return windowsMainService.open({
          context,
          cli: args,
          urisToOpen: initialProtocolUrls.openables,
          gotoLineMode: true,
          initialStartup: true
          // remoteAuthority: will be determined based on openables
        });
      }
      if (initialProtocolUrls.urls.length > 0) {
        for (const protocolUrl of initialProtocolUrls.urls) {
          const params = new URLSearchParams(protocolUrl.uri.query);
          if (params.get("windowId") === "_blank") {
            params.delete("windowId");
            protocolUrl.originalUrl = protocolUrl.uri.toString(true);
            protocolUrl.uri = protocolUrl.uri.with({ query: params.toString() });
            return windowsMainService.open({
              context,
              cli: args,
              forceNewWindow: true,
              forceEmpty: true,
              gotoLineMode: true,
              initialStartup: true
              // remoteAuthority: will be determined based on openables
            });
          }
        }
      }
    }
    const macOpenFiles = global.macOpenFiles ?? [];
    const hasCliArgs = args._.length;
    const hasFolderURIs = !!args["folder-uri"];
    const hasFileURIs = !!args["file-uri"];
    const noRecentEntry = args["skip-add-to-recently-opened"] === true;
    const waitMarkerFileURI = args.wait && args.waitMarkerFilePath ? URI.file(args.waitMarkerFilePath) : void 0;
    const remoteAuthority = args.remote || void 0;
    const forceProfile = args.profile;
    const forceTempProfile = args["profile-temp"];
    if (!hasCliArgs && !hasFolderURIs && !hasFileURIs) {
      if (args["new-window"] || forceProfile || forceTempProfile) {
        return windowsMainService.open({
          context,
          cli: args,
          forceNewWindow: true,
          forceEmpty: true,
          noRecentEntry,
          waitMarkerFileURI,
          initialStartup: true,
          remoteAuthority,
          forceProfile,
          forceTempProfile
        });
      }
      if (macOpenFiles.length) {
        return windowsMainService.open({
          context: OpenContext.DOCK,
          cli: args,
          urisToOpen: macOpenFiles.map((path) => {
            path = normalizeNFC(path);
            return hasWorkspaceFileExtension(path) ? { workspaceUri: URI.file(path) } : { fileUri: URI.file(path) };
          }),
          noRecentEntry,
          waitMarkerFileURI,
          initialStartup: true
          // remoteAuthority: will be determined based on macOpenFiles
        });
      }
    }
    return windowsMainService.open({
      context,
      cli: args,
      forceNewWindow: args["new-window"],
      diffMode: args.diff,
      mergeMode: args.merge,
      noRecentEntry,
      waitMarkerFileURI,
      gotoLineMode: args.goto,
      initialStartup: true,
      remoteAuthority,
      forceProfile,
      forceTempProfile
    });
  }
  afterWindowOpen(instantiationService) {
    if (isWindows) {
      initWindowsVersionInfo();
    }
    this.installMutex();
    protocol.registerHttpProtocol(Schemas.vscodeRemoteResource, (request, callback) => {
      callback({
        url: request.url.replace(/^vscode-remote-resource:/, "http:"),
        method: request.method
      });
    });
    this.resolveShellEnvironment(this.environmentMainService.args, process.env, true);
    this.updateCrashReporterEnablement();
    if (isMacintosh && app.runningUnderARM64Translation) {
      this.windowsMainService?.sendToFocused("vscode:showTranslatedBuildWarning");
    }
    instantiationService.invokeFunction((accessor) => {
      const telemetryService = accessor.get(ITelemetryService);
      const getPowerEventData = () => ({
        idleState: powerMonitor.getSystemIdleState(60),
        idleTime: powerMonitor.getSystemIdleTime(),
        thermalState: powerMonitor.getCurrentThermalState(),
        onBattery: powerMonitor.isOnBatteryPower()
      });
      this._register(Event.fromNodeEventEmitter(powerMonitor, "suspend")(() => {
        telemetryService.publicLog2("power.suspend", getPowerEventData());
      }));
      this._register(Event.fromNodeEventEmitter(powerMonitor, "resume")(() => {
        telemetryService.publicLog2("power.resume", getPowerEventData());
      }));
    });
    if (isMacintosh) {
      instantiationService.invokeFunction((accessor) => {
        const telemetryService = accessor.get(ITelemetryService);
        const initialGpuFeatureStatus = app.getGPUFeatureStatus();
        const skiaGraphiteEnabled = initialGpuFeatureStatus["skia_graphite"];
        if (skiaGraphiteEnabled === "enabled") {
          const gpuInfoUpdate = Event.fromNodeEventEmitter(app, "gpu-info-update");
          const pendingGpuInfoListener = this._register(new MutableDisposable());
          this._register(Event.fromNodeEventEmitter(app, "child-process-gone", (event, details) => ({ event, details }))(({ details }) => {
            if (details.type === "GPU" && details.reason === "crashed") {
              pendingGpuInfoListener.value = Event.once(gpuInfoUpdate)(() => {
                const currentGpuFeatureStatus = app.getGPUFeatureStatus();
                const currentRasterizationStatus = currentGpuFeatureStatus["rasterization"];
                if (currentRasterizationStatus !== "enabled") {
                  let gpuLogMessages = [];
                  const customApp = app;
                  if (typeof customApp.getGPULogMessages === "function") {
                    gpuLogMessages = customApp.getGPULogMessages().slice(-10).map((log) => log.message);
                  }
                  telemetryService.publicLog2("gpu.crash.fallback", {
                    gpuFeatureStatus: JSON.stringify(currentGpuFeatureStatus),
                    gpuLogMessages: JSON.stringify(gpuLogMessages)
                  });
                }
              });
            }
          }));
        }
      });
    }
    {
      const customApp = app;
      instantiationService.invokeFunction((accessor) => {
        const telemetryService = accessor.get(ITelemetryService);
        this._register(Event.fromNodeEventEmitter(customApp, "network-process-launched", (_event, details) => details)((details) => {
          this.logService.info(`[network process] launched with pid ${details.pid}`);
          telemetryService.publicLog2("networkProcess.launched", {});
        }));
        this._register(Event.fromNodeEventEmitter(customApp, "network-process-gone", (_event, details) => details)((details) => {
          this.logService.info(`[network process] gone - pid: ${details.pid}, exitCode: ${details.exitCode}, crashed: ${details.crashed}, crashedPreIPC: ${details.crashedPreIPC}`);
          telemetryService.publicLog2("networkProcess.gone", {
            exitCode: details.exitCode,
            crashed: details.crashed,
            crashedPreIPC: details.crashedPreIPC
          });
        }));
      });
    }
  }
  async installMutex() {
    const win32MutexName = this.productService.win32MutexName;
    if (isWindows && win32MutexName && isInnoSetupInstall()) {
      try {
        const WindowsMutex = await import("@vscode/windows-mutex");
        const mutex = new WindowsMutex.Mutex(win32MutexName);
        Event.once(this.lifecycleMainService.onWillShutdown)(() => mutex.release());
      } catch (error) {
        this.logService.error(error);
      }
    }
  }
  async resolveShellEnvironment(args, env, notifyOnError) {
    try {
      return await getResolvedShellEnv(this.configurationService, this.logService, args, env);
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      if (notifyOnError) {
        this.windowsMainService?.sendToFocused("vscode:showResolveShellEnvError", errorMessage);
      } else {
        this.logService.error(errorMessage);
      }
    }
    return {};
  }
  async updateCrashReporterEnablement() {
    try {
      const argvContent = await this.fileService.readFile(this.environmentMainService.argvResource);
      const argvString = argvContent.value.toString();
      const argvJSON = parse(argvString);
      const telemetryLevel = getTelemetryLevel(this.configurationService);
      const enableCrashReporter = telemetryLevel >= TelemetryLevel.CRASH;
      if (argvJSON["enable-crash-reporter"] === void 0) {
        const additionalArgvContent = [
          "",
          "	// Allows to disable crash reporting.",
          "	// Should restart the app if the value is changed.",
          `	"enable-crash-reporter": ${enableCrashReporter},`,
          "",
          "	// Unique id used for correlating crash reports sent from this instance.",
          "	// Do not edit this value.",
          `	"crash-reporter-id": "${generateUuid()}"`,
          "}"
        ];
        const newArgvString = argvString.substring(0, argvString.length - 2).concat(",\n", additionalArgvContent.join("\n"));
        await this.fileService.writeFile(this.environmentMainService.argvResource, VSBuffer.fromString(newArgvString));
      } else {
        const newArgvString = argvString.replace(/"enable-crash-reporter": .*,/, `"enable-crash-reporter": ${enableCrashReporter},`);
        if (newArgvString !== argvString) {
          await this.fileService.writeFile(this.environmentMainService.argvResource, VSBuffer.fromString(newArgvString));
        }
      }
    } catch (error) {
      this.logService.error(error);
      this.windowsMainService?.sendToFocused("vscode:showArgvParseWarning");
    }
  }
  eventuallyAfterWindowOpen(instantiationService) {
    validateDevDeviceId(this.stateService, this.logService);
    instantiationService.invokeFunction((accessor) => {
      const telemetryService = accessor.get(ITelemetryService);
      if (telemetryService.telemetryLevel < TelemetryLevel.USAGE) {
        return;
      }
      const nativeHostMainService = accessor.get(INativeHostMainService);
      void this.logOSProxyConfigTelemetry(nativeHostMainService, telemetryService);
    });
  }
  async logOSProxyConfigTelemetry(nativeHostMainService, telemetryService) {
    const startTime = Date.now();
    try {
      const config = await nativeHostMainService.readProxyConfigWithPackage(void 0);
      const durationMs = Date.now() - startTime;
      const pacScriptStats = config.pac ? getPACScriptStats(config.pac.content) : void 0;
      telemetryService.publicLog2("osProxyConfig", {
        success: true,
        durationMs,
        platformKind: config.platform?.kind ?? "none",
        autoDetect: config.autoDetect,
        httpProxyEnvironmentState: getOSProxyEnvironmentState(config.environment.httpProxy),
        httpsProxyEnvironmentState: getOSProxyEnvironmentState(config.environment.httpsProxy),
        allProxyEnvironmentState: getOSProxyEnvironmentState(config.environment.allProxy),
        noProxyEnvironmentState: getOSProxyEnvironmentState(config.environment.noProxy),
        wpadDhcpState: config.wpadDhcp.state,
        wpadDnsState: config.wpadDns.state,
        configuredPacState: config.configuredPac.state,
        hasConfiguredPac: !!config.pacUrl,
        hasLoadedPac: !!config.pac,
        pacSource: config.pac?.source ?? "none",
        pacScriptCharacterCount: pacScriptStats?.characterCount,
        pacScriptLineCount: pacScriptStats?.lineCount,
        pacScriptReturnCount: pacScriptStats?.returnCount,
        hasHttpProxy: !!config.staticRules?.http,
        hasHttpsProxy: !!config.staticRules?.https,
        hasSocksProxy: !!config.staticRules?.socks,
        hasBypassRules: hasOSProxyBypassRules(config),
        excludeSimpleHostnames: config.platform?.kind === "macos" ? config.platform.excludeSimpleHostnames : void 0
      });
    } catch {
      telemetryService.publicLog2("osProxyConfig", {
        success: false,
        durationMs: Date.now() - startTime
      });
    }
  }
};
CodeApplication.SECURITY_PROTOCOL_HANDLING_CONFIRMATION_SETTING_KEY = {
  [Schemas.file]: "security.promptForLocalFileProtocolHandling",
  [Schemas.vscodeRemote]: "security.promptForRemoteFileProtocolHandling"
};
CodeApplication = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ILogService),
  __decorateParam(4, ILoggerService),
  __decorateParam(5, IEnvironmentMainService),
  __decorateParam(6, ILifecycleMainService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IStateService),
  __decorateParam(9, IFileService),
  __decorateParam(10, IProductService),
  __decorateParam(11, IUserDataProfilesMainService)
], CodeApplication);
function hasOSProxyBypassRules(config) {
  switch (config.platform?.kind) {
    case "windows":
      return !!config.platform.proxyBypass;
    case "macos":
      return config.platform.excludeSimpleHostnames || config.platform.exceptions.length > 0;
    case "linux":
      return config.platform.ignoreHosts.length > 0;
    default:
      return false;
  }
}
function getOSProxyEnvironmentState(status) {
  return status ? status.error ? "invalid" : "configured" : "unset";
}
function getPACScriptStats(content) {
  return {
    characterCount: content.length,
    lineCount: content.length === 0 ? 0 : content.split(/\r\n|\r|\n/).length,
    returnCount: content.match(/\breturn\b/g)?.length ?? 0
  };
}
export {
  CodeApplication
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2NvZGUvZWxlY3Ryb24tbWFpbi9hcHAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhcHAsIEJyb3dzZXJXaW5kb3csIGRlc2t0b3BDYXB0dXJlciwgRGV0YWlscywgZ2xvYmFsU2hvcnRjdXQsIEdQVUZlYXR1cmVTdGF0dXMsIHBvd2VyTW9uaXRvciwgcHJvdG9jb2wsIHNjcmVlbiBhcyBlbGVjdHJvblNjcmVlbiwgc2Vzc2lvbiwgU2Vzc2lvbiwgc3lzdGVtUHJlZmVyZW5jZXMsIFdlYkZyYW1lTWFpbiB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IGFkZFVOQ0hvc3RUb0FsbG93bGlzdCwgZGlzYWJsZVVOQ0FjY2Vzc1Jlc3RyaWN0aW9ucyB9IGZyb20gJy4uLy4uL2Jhc2Uvbm9kZS91bmMuanMnO1xuaW1wb3J0IHsgdmFsaWRhdGVkSXBjTWFpbiB9IGZyb20gJy4uLy4uL2Jhc2UvcGFydHMvaXBjL2VsZWN0cm9uLW1haW4vaXBjTWFpbi5qcyc7XG5pbXBvcnQgeyBob3N0bmFtZSwgcmVsZWFzZSB9IGZyb20gJ29zJztcbmltcG9ydCB7IGluaXRXaW5kb3dzVmVyc2lvbkluZm8gfSBmcm9tICcuLi8uLi9iYXNlL25vZGUvd2luZG93c1ZlcnNpb24uanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2pzb25jLmpzJztcbmltcG9ydCB7IGdldFBhdGhMYWJlbCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcywgVlNDT0RFX0FVVEhPUklUWSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgam9pbiwgcG9zaXggfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IElQcm9jZXNzRW52aXJvbm1lbnQsIGlzTGludXgsIGlzTGludXhTbmFwLCBpc01hY2ludG9zaCwgaXNXaW5kb3dzLCBPUyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNvbnRleHRNZW51TGlzdGVuZXIgfSBmcm9tICcuLi8uLi9iYXNlL3BhcnRzL2NvbnRleHRtZW51L2VsZWN0cm9uLW1haW4vY29udGV4dG1lbnUuanMnO1xuaW1wb3J0IHsgZ2V0RGVsYXllZENoYW5uZWwsIFByb3h5Q2hhbm5lbCwgU3RhdGljUm91dGVyIH0gZnJvbSAnLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBTZXJ2ZXIgYXMgRWxlY3Ryb25JUENTZXJ2ZXIgfSBmcm9tICcuLi8uLi9iYXNlL3BhcnRzL2lwYy9lbGVjdHJvbi1tYWluL2lwYy5lbGVjdHJvbi5qcyc7XG5pbXBvcnQgeyBDbGllbnQgYXMgTWVzc2FnZVBvcnRDbGllbnQgfSBmcm9tICcuLi8uLi9iYXNlL3BhcnRzL2lwYy9lbGVjdHJvbi1tYWluL2lwYy5tcC5qcyc7XG5pbXBvcnQgeyBTZXJ2ZXIgYXMgTm9kZUlQQ1NlcnZlciB9IGZyb20gJy4uLy4uL2Jhc2UvcGFydHMvaXBjL25vZGUvaXBjLm5ldC5qcyc7XG5pbXBvcnQgeyBJUHJveHlBdXRoU2VydmljZSwgUHJveHlBdXRoU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9lbGVjdHJvbi1tYWluL2F1dGguanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUJhY2t1cE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYmFja3VwL2VsZWN0cm9uLW1haW4vYmFja3VwLmpzJztcbmltcG9ydCB7IEJhY2t1cE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYmFja3VwL2VsZWN0cm9uLW1haW4vYmFja3VwTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbGVjdHJvbkV4dGVuc2lvbkhvc3REZWJ1Z0Jyb2FkY2FzdENoYW5uZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9kZWJ1Zy9lbGVjdHJvbi1tYWluL2V4dGVuc2lvbkhvc3REZWJ1Z0lwYy5qcyc7XG5pbXBvcnQgeyBJRGlhZ25vc3RpY3NTZXJ2aWNlLCBJR1BVTG9nTWVzc2FnZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2RpYWdub3N0aWNzL2NvbW1vbi9kaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgeyBEaWFnbm9zdGljc01haW5TZXJ2aWNlLCBJRGlhZ25vc3RpY3NNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2RpYWdub3N0aWNzL2VsZWN0cm9uLW1haW4vZGlhZ25vc3RpY3NNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaWFsb2dNYWluU2VydmljZSwgSURpYWxvZ01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9lbGVjdHJvbi1tYWluL2RpYWxvZ01haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFbmNyeXB0aW9uTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9lbmNyeXB0aW9uL2NvbW1vbi9lbmNyeXB0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbmNyeXB0aW9uTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9lbmNyeXB0aW9uL2VsZWN0cm9uLW1haW4vZW5jcnlwdGlvbk1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlwY0Jyb3dzZXJWaWV3Q2hhbm5lbE5hbWUgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgaXBjQnJvd3NlclZpZXdHcm91cENoYW5uZWxOYW1lIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3R3JvdXAuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdNYWluU2VydmljZSwgSUJyb3dzZXJWaWV3TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9lbGVjdHJvbi1tYWluL2Jyb3dzZXJWaWV3TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdHcm91cE1haW5TZXJ2aWNlLCBJQnJvd3NlclZpZXdHcm91cE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvZWxlY3Ryb24tbWFpbi9icm93c2VyVmlld0dyb3VwTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTmF0aXZlUGFyc2VkQXJncyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9hcmd2LmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvZWxlY3Ryb24tbWFpbi9lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzTGF1bmNoZWRGcm9tQ2xpIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvbm9kZS9hcmd2SGVscGVyLmpzJztcbmltcG9ydCB7IGdldFJlc29sdmVkU2hlbGxFbnYgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9zaGVsbC9ub2RlL3NoZWxsRW52LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25Ib3N0U3RhcnRlciwgaXBjRXh0ZW5zaW9uSG9zdFN0YXJ0ZXJDaGFubmVsTmFtZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbkhvc3RTdGFydGVyLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RTdGFydGVyIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9lbGVjdHJvbi1tYWluL2V4dGVuc2lvbkhvc3RTdGFydGVyLmpzJztcbmltcG9ydCB7IElFeHRlcm5hbFRlcm1pbmFsTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9leHRlcm5hbFRlcm1pbmFsL2VsZWN0cm9uLW1haW4vZXh0ZXJuYWxUZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBMaW51eEV4dGVybmFsVGVybWluYWxTZXJ2aWNlLCBNYWNFeHRlcm5hbFRlcm1pbmFsU2VydmljZSwgV2luZG93c0V4dGVybmFsVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZXh0ZXJuYWxUZXJtaW5hbC9ub2RlL2V4dGVybmFsVGVybWluYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTYW5kYm94SGVscGVyTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9zYW5kYm94L2VsZWN0cm9uLW1haW4vc2FuZGJveEhlbHBlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2FuZGJveEhlbHBlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9zYW5kYm94L25vZGUvc2FuZGJveEhlbHBlci5qcyc7XG5pbXBvcnQgeyBMT0NBTF9GSUxFX1NZU1RFTV9DSEFOTkVMX05BTUUgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZGlza0ZpbGVTeXN0ZW1Qcm92aWRlckNsaWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRGlza0ZpbGVTeXN0ZW1Qcm92aWRlckNoYW5uZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9maWxlcy9lbGVjdHJvbi1tYWluL2Rpc2tGaWxlU3lzdGVtUHJvdmlkZXJTZXJ2ZXIuanMnO1xuaW1wb3J0IHsgRGlza0ZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2ZpbGVzL25vZGUvZGlza0ZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBQcm9jZXNzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9wcm9jZXNzL2VsZWN0cm9uLW1haW4vcHJvY2Vzc01haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElLZXlib2FyZExheW91dE1haW5TZXJ2aWNlLCBLZXlib2FyZExheW91dE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0va2V5Ym9hcmRMYXlvdXQvZWxlY3Ryb24tbWFpbi9rZXlib2FyZExheW91dE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYXVuY2hNYWluU2VydmljZSwgTGF1bmNoTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sYXVuY2gvZWxlY3Ryb24tbWFpbi9sYXVuY2hNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlTWFpblNlcnZpY2UsIExpZmVjeWNsZU1haW5QaGFzZSwgU2h1dGRvd25SZWFzb24gfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9saWZlY3ljbGUvZWxlY3Ryb24tbWFpbi9saWZlY3ljbGVNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyU2VydmljZSwgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTWVudWJhck1haW5TZXJ2aWNlLCBNZW51YmFyTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9tZW51YmFyL2VsZWN0cm9uLW1haW4vbWVudWJhck1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSU9TUHJveHlDb25maWcgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdE1haW5TZXJ2aWNlLCBOYXRpdmVIb3N0TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9uYXRpdmUvZWxlY3Ryb24tbWFpbi9uYXRpdmVIb3N0TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2xvYmFsS2V5YmluZGluZ3NNYWluU2VydmljZSwgSUdsb2JhbEtleWJpbmRpbmdzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9nbG9iYWxLZXliaW5kaW5ncy9lbGVjdHJvbi1tYWluL2dsb2JhbEtleWJpbmRpbmdzTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL21ldGVyZWRDb25uZWN0aW9uL2NvbW1vbi9tZXRlcmVkQ29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBNRVRFUkVEX0NPTk5FQ1RJT05fQ0hBTk5FTCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL21ldGVyZWRDb25uZWN0aW9uL2NvbW1vbi9tZXRlcmVkQ29ubmVjdGlvbklwYy5qcyc7XG5pbXBvcnQgeyBNZXRlcmVkQ29ubmVjdGlvbkNoYW5uZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9tZXRlcmVkQ29ubmVjdGlvbi9lbGVjdHJvbi1tYWluL21ldGVyZWRDb25uZWN0aW9uQ2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBNZXRlcmVkQ29ubmVjdGlvbk1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbWV0ZXJlZENvbm5lY3Rpb24vZWxlY3Ryb24tbWFpbi9tZXRlcmVkQ29ubmVjdGlvbk1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFJlbW90ZUF1dGhvcml0eSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlSG9zdHMuanMnO1xuaW1wb3J0IHsgU2hhcmVkUHJvY2VzcyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3NoYXJlZFByb2Nlc3MvZWxlY3Ryb24tbWFpbi9zaGFyZWRQcm9jZXNzLmpzJztcbmltcG9ydCB7IElTaWduU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3NpZ24vY29tbW9uL3NpZ24uanMnO1xuaW1wb3J0IHsgSVN0YXRlU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3N0YXRlL25vZGUvc3RhdGUuanMnO1xuaW1wb3J0IHsgU3RvcmFnZURhdGFiYXNlQ2hhbm5lbCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvZWxlY3Ryb24tbWFpbi9zdG9yYWdlSXBjLmpzJztcbmltcG9ydCB7IEFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlLCBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UsIElTdG9yYWdlTWFpblNlcnZpY2UsIFN0b3JhZ2VNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvZWxlY3Ryb24tbWFpbi9zdG9yYWdlTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUNvbW1vblByb3BlcnRpZXMgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL2NvbW1vblByb3BlcnRpZXMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5QXBwZW5kZXJDbGllbnQgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeUlwYy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZUNvbmZpZywgVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRQaWlQYXRoc0Zyb21FbnZpcm9ubWVudCwgZ2V0VGVsZW1ldHJ5TGV2ZWwsIGlzSW50ZXJuYWxUZWxlbWV0cnksIE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBzdXBwb3J0c1RlbGVtZXRyeSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVVwZGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBVcGRhdGVDaGFubmVsIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2NvbW1vbi91cGRhdGVJcGMuanMnO1xuaW1wb3J0IHsgTm90QXZhaWxhYmxlVXBkYXRlRGlhbG9nIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2VsZWN0cm9uLW1haW4vbm90QXZhaWxhYmxlVXBkYXRlRGlhbG9nLmpzJztcbmltcG9ydCB7IERhcndpblVwZGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91cGRhdGUvZWxlY3Ryb24tbWFpbi91cGRhdGVTZXJ2aWNlLmRhcndpbi5qcyc7XG5pbXBvcnQgeyBMaW51eFVwZGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91cGRhdGUvZWxlY3Ryb24tbWFpbi91cGRhdGVTZXJ2aWNlLmxpbnV4LmpzJztcbmltcG9ydCB7IFNuYXBVcGRhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2VsZWN0cm9uLW1haW4vdXBkYXRlU2VydmljZS5zbmFwLmpzJztcbmltcG9ydCB7IFdpbjMyVXBkYXRlU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3VwZGF0ZS9lbGVjdHJvbi1tYWluL3VwZGF0ZVNlcnZpY2Uud2luMzIuanMnO1xuaW1wb3J0IHsgaXNJbm5vU2V0dXBJbnN0YWxsIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2VsZWN0cm9uLW1haW4vd2luMzJVcGRhdGVUeXBlLmpzJztcbmltcG9ydCB7IElPcGVuVVJMT3B0aW9ucywgSVVSTFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91cmwvY29tbW9uL3VybC5qcyc7XG5pbXBvcnQgeyBVUkxIYW5kbGVyQ2hhbm5lbENsaWVudCwgVVJMSGFuZGxlclJvdXRlciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3VybC9jb21tb24vdXJsSXBjLmpzJztcbmltcG9ydCB7IE5hdGl2ZVVSTFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91cmwvY29tbW9uL3VybFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWxlY3Ryb25VUkxMaXN0ZW5lciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3VybC9lbGVjdHJvbi1tYWluL2VsZWN0cm9uVXJsTGlzdGVuZXIuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXdNYW5hZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3dlYnZpZXcvY29tbW9uL3dlYnZpZXdNYW5hZ2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBXZWJ2aWV3TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93ZWJ2aWV3L2VsZWN0cm9uLW1haW4vd2Vidmlld01haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzRm9sZGVyVG9PcGVuLCBpc1dvcmtzcGFjZVRvT3BlbiwgSVdpbmRvd09wZW5hYmxlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgZ2V0QWxsV2luZG93c0V4Y2x1ZGluZ09mZnNjcmVlbiwgSVdpbmRvd3NNYWluU2VydmljZSwgT3BlbkNvbnRleHQgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93aW5kb3dzL2VsZWN0cm9uLW1haW4vd2luZG93cy5qcyc7XG5pbXBvcnQgeyBJQ29kZVdpbmRvdyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9lbGVjdHJvbi1tYWluL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBXaW5kb3dzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93aW5kb3dzL2VsZWN0cm9uLW1haW4vd2luZG93c01haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGl2ZVdpbmRvd01hbmFnZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93aW5kb3dzL25vZGUvd2luZG93VHJhY2tlci5qcyc7XG5pbXBvcnQgeyBoYXNXb3Jrc3BhY2VGaWxlRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZSwgV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvZWxlY3Ryb24tbWFpbi93b3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZXNNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvZWxlY3Ryb24tbWFpbi93b3Jrc3BhY2VzTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UsIFdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2VsZWN0cm9uLW1haW4vd29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUG9saWN5U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3BvbGljeS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IElOYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLCBJRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL2NvcGlsb3RNYW5hZ2VkU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgTmF0aXZlTWFuYWdlZFNldHRpbmdzQ2hhbm5lbCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3BvbGljeS9jb21tb24vbmF0aXZlTWFuYWdlZFNldHRpbmdzSXBjLmpzJztcbmltcG9ydCB7IEZpbGVNYW5hZ2VkU2V0dGluZ3NDaGFubmVsIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcG9saWN5L2NvbW1vbi9maWxlTWFuYWdlZFNldHRpbmdzSXBjLmpzJztcbmltcG9ydCB7IFBvbGljeUNoYW5uZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL3BvbGljeUlwYy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2VsZWN0cm9uLW1haW4vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNTY2FubmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvbm9kZS9leHRlbnNpb25zU2Nhbm5lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFQcm9maWxlc0hhbmRsZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvZWxlY3Ryb24tbWFpbi91c2VyRGF0YVByb2ZpbGVzSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBQcm9maWxlU3RvcmFnZUNoYW5nZXNMaXN0ZW5lckNoYW5uZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvZWxlY3Ryb24tbWFpbi91c2VyRGF0YVByb2ZpbGVTdG9yYWdlSXBjLmpzJztcbmltcG9ydCB7IFByb21pc2VzLCBSdW5PbmNlU2NoZWR1bGVyLCBydW5XaGVuR2xvYmFsSWRsZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IHJlc29sdmVNYWNoaW5lSWQsIHJlc29sdmVTcW1JZCwgcmVzb2x2ZURldkRldmljZUlkLCB2YWxpZGF0ZURldkRldmljZUlkIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2VsZWN0cm9uLW1haW4vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvbm9kZS9leHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExvZ2dlckNoYW5uZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sb2cvZWxlY3Ryb24tbWFpbi9sb2dJcGMuanMnO1xuaW1wb3J0IHsgSUxvZ2dlck1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbG9nL2VsZWN0cm9uLW1haW4vbG9nZ2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5pdGlhbFByb3RvY29sVXJscywgSVByb3RvY29sVXJsIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXJsL2VsZWN0cm9uLW1haW4vdXJsLmpzJztcbmltcG9ydCB7IElVdGlsaXR5UHJvY2Vzc1dvcmtlck1haW5TZXJ2aWNlLCBVdGlsaXR5UHJvY2Vzc1dvcmtlck1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdXRpbGl0eVByb2Nlc3MvZWxlY3Ryb24tbWFpbi91dGlsaXR5UHJvY2Vzc1dvcmtlck1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlwY1V0aWxpdHlQcm9jZXNzV29ya2VyQ2hhbm5lbE5hbWUgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91dGlsaXR5UHJvY2Vzcy9jb21tb24vdXRpbGl0eVByb2Nlc3NXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2NhbFB0eVNlcnZpY2UsIExvY2FsUmVjb25uZWN0Q29uc3RhbnRzLCBUZXJtaW5hbElwY0NoYW5uZWxzLCBUZXJtaW5hbFNldHRpbmdJZCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBFbGVjdHJvblB0eUhvc3RTdGFydGVyIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvZWxlY3Ryb24tbWFpbi9lbGVjdHJvblB0eUhvc3RTdGFydGVyLmpzJztcbmltcG9ydCB7IFB0eUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvbm9kZS9wdHlIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbGVjdHJvbkFnZW50SG9zdFN0YXJ0ZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvZWxlY3Ryb24tbWFpbi9lbGVjdHJvbkFnZW50SG9zdFN0YXJ0ZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UHJvY2Vzc01hbmFnZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3Qvbm9kZS9hZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5PREVfUkVNT1RFX1JFU09VUkNFX0NIQU5ORUxfTkFNRSwgTk9ERV9SRU1PVEVfUkVTT1VSQ0VfSVBDX01FVEhPRF9OQU1FLCBOb2RlUmVtb3RlUmVzb3VyY2VSZXNwb25zZSwgTm9kZVJlbW90ZVJlc291cmNlUm91dGVyIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9lbGVjdHJvblJlbW90ZVJlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYXV4aWxpYXJ5V2luZG93L2VsZWN0cm9uLW1haW4vYXV4aWxpYXJ5V2luZG93cy5qcyc7XG5pbXBvcnQgeyBBdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9hdXhpbGlhcnlXaW5kb3cvZWxlY3Ryb24tbWFpbi9hdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplTkZDIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbm9ybWFsaXphdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ1NTRGV2ZWxvcG1lbnRTZXJ2aWNlLCBDU1NEZXZlbG9wbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9jc3NEZXYvbm9kZS9jc3NEZXZTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXJTZXJ2aWNlLCBOYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXJDaGFubmVsTmFtZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbmF0aXZlTWNwRGlzY292ZXJ5SGVscGVyLmpzJztcbmltcG9ydCB7IE5hdGl2ZU1jcERpc2NvdmVyeUhlbHBlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9tY3Avbm9kZS9uYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNY3BHYXRld2F5U2VydmljZSwgTWNwR2F0ZXdheUNoYW5uZWxOYW1lIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BHYXRld2F5LmpzJztcbmltcG9ydCB7IE1jcEdhdGV3YXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbWNwL25vZGUvbWNwR2F0ZXdheVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWNwR2F0ZXdheUNoYW5uZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9tY3Avbm9kZS9tY3BHYXRld2F5Q2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBJV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93ZWJDb250ZW50RXh0cmFjdG9yL2NvbW1vbi93ZWJDb250ZW50RXh0cmFjdG9yLmpzJztcbmltcG9ydCB7IE5hdGl2ZVdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vd2ViQ29udGVudEV4dHJhY3Rvci9lbGVjdHJvbi1tYWluL3dlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsIElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbmV0d29ya0ZpbHRlci9jb21tb24vbmV0d29ya0ZpbHRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsU2FuZGJveFNlcnZpY2UsIE51bGxUZXJtaW5hbFNhbmRib3hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vc2FuZGJveC9jb21tb24vdGVybWluYWxTYW5kYm94U2VydmljZS5qcyc7XG5pbXBvcnQgRXJyb3JUZWxlbWV0cnkgZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2VsZWN0cm9uLW1haW4vZXJyb3JUZWxlbWV0cnkuanMnO1xuXG50eXBlIE9TUHJveHlDb25maWdFdmVudCA9IHtcblx0cmVhZG9ubHkgc3VjY2VzczogYm9vbGVhbjtcblx0cmVhZG9ubHkgZHVyYXRpb25NczogbnVtYmVyO1xuXHRyZWFkb25seSBwbGF0Zm9ybUtpbmQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGF1dG9EZXRlY3Q/OiBib29sZWFuO1xuXHRyZWFkb25seSBodHRwUHJveHlFbnZpcm9ubWVudFN0YXRlPzogc3RyaW5nO1xuXHRyZWFkb25seSBodHRwc1Byb3h5RW52aXJvbm1lbnRTdGF0ZT86IHN0cmluZztcblx0cmVhZG9ubHkgYWxsUHJveHlFbnZpcm9ubWVudFN0YXRlPzogc3RyaW5nO1xuXHRyZWFkb25seSBub1Byb3h5RW52aXJvbm1lbnRTdGF0ZT86IHN0cmluZztcblx0cmVhZG9ubHkgd3BhZERoY3BTdGF0ZT86IHN0cmluZztcblx0cmVhZG9ubHkgd3BhZERuc1N0YXRlPzogc3RyaW5nO1xuXHRyZWFkb25seSBjb25maWd1cmVkUGFjU3RhdGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGhhc0NvbmZpZ3VyZWRQYWM/OiBib29sZWFuO1xuXHRyZWFkb25seSBoYXNMb2FkZWRQYWM/OiBib29sZWFuO1xuXHRyZWFkb25seSBwYWNTb3VyY2U/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhY1NjcmlwdENoYXJhY3RlckNvdW50PzogbnVtYmVyO1xuXHRyZWFkb25seSBwYWNTY3JpcHRMaW5lQ291bnQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHBhY1NjcmlwdFJldHVybkNvdW50PzogbnVtYmVyO1xuXHRyZWFkb25seSBoYXNIdHRwUHJveHk/OiBib29sZWFuO1xuXHRyZWFkb25seSBoYXNIdHRwc1Byb3h5PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaGFzU29ja3NQcm94eT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGhhc0J5cGFzc1J1bGVzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZXhjbHVkZVNpbXBsZUhvc3RuYW1lcz86IGJvb2xlYW47XG59O1xuXG50eXBlIE9TUHJveHlDb25maWdDbGFzc2lmaWNhdGlvbiA9IHtcblx0c3VjY2VzczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgcmVhZGluZyB0aGUgb3BlcmF0aW5nIHN5c3RlbSBwcm94eSBjb25maWd1cmF0aW9uIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHkuJyB9O1xuXHRkdXJhdGlvbk1zOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2FsbC1jbG9jayBkdXJhdGlvbiBvZiB0aGUgb3BlcmF0aW5nIHN5c3RlbSBwcm94eSBjb25maWd1cmF0aW9uIHJlYWQgaW4gbWlsbGlzZWNvbmRzLicgfTtcblx0cGxhdGZvcm1LaW5kPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBvcGVyYXRpbmcgc3lzdGVtIHByb3h5IGNvbmZpZ3VyYXRpb24gc291cmNlICh3aW5kb3dzLCBtYWNvcywgbGludXgsIHVua25vd24sIG9yIG5vbmUpLicgfTtcblx0YXV0b0RldGVjdD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIGF1dG9tYXRpYyBwcm94eSBkaXNjb3ZlcnkgaXMgZW5hYmxlZC4nIH07XG5cdGh0dHBQcm94eUVudmlyb25tZW50U3RhdGU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgZWZmZWN0aXZlIEhUVFAgcHJveHkgZW52aXJvbm1lbnQgdmFyaWFibGUgaXMgdW5zZXQsIGNvbmZpZ3VyZWQsIG9yIGludmFsaWQuIFRoZSB2YXJpYWJsZSBuYW1lIGFuZCB2YWx1ZSBhcmUgbm90IGNvbGxlY3RlZC4nIH07XG5cdGh0dHBzUHJveHlFbnZpcm9ubWVudFN0YXRlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGVmZmVjdGl2ZSBIVFRQUyBwcm94eSBlbnZpcm9ubWVudCB2YXJpYWJsZSBpcyB1bnNldCwgY29uZmlndXJlZCwgb3IgaW52YWxpZC4gVGhlIHZhcmlhYmxlIG5hbWUgYW5kIHZhbHVlIGFyZSBub3QgY29sbGVjdGVkLicgfTtcblx0YWxsUHJveHlFbnZpcm9ubWVudFN0YXRlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGVmZmVjdGl2ZSBhbGwtcHJveHkgZW52aXJvbm1lbnQgdmFyaWFibGUgaXMgdW5zZXQsIGNvbmZpZ3VyZWQsIG9yIGludmFsaWQuIFRoZSB2YXJpYWJsZSBuYW1lIGFuZCB2YWx1ZSBhcmUgbm90IGNvbGxlY3RlZC4nIH07XG5cdG5vUHJveHlFbnZpcm9ubWVudFN0YXRlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGVmZmVjdGl2ZSBuby1wcm94eSBlbnZpcm9ubWVudCB2YXJpYWJsZSBpcyB1bnNldCwgY29uZmlndXJlZCwgb3IgaW52YWxpZC4gVGhlIHZhcmlhYmxlIG5hbWUgYW5kIHZhbHVlIGFyZSBub3QgY29sbGVjdGVkLicgfTtcblx0d3BhZERoY3BTdGF0ZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgREhDUCBXUEFEIGluc3BlY3Rpb24gc3RhdGUuIERpc2NvdmVyZWQgVVJMcyBhbmQgZXJyb3JzIGFyZSBub3QgY29sbGVjdGVkLicgfTtcblx0d3BhZERuc1N0YXRlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBETlMgV1BBRCBpbnNwZWN0aW9uIHN0YXRlLiBEaXNjb3ZlcmVkIFVSTHMgYW5kIGVycm9ycyBhcmUgbm90IGNvbGxlY3RlZC4nIH07XG5cdGNvbmZpZ3VyZWRQYWNTdGF0ZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY29uZmlndXJlZCBQQUMgaW5zcGVjdGlvbiBzdGF0ZS4gQ29uZmlndXJlZCBVUkxzIGFuZCBlcnJvcnMgYXJlIG5vdCBjb2xsZWN0ZWQuJyB9O1xuXHRoYXNDb25maWd1cmVkUGFjPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgdGhlIG9wZXJhdGluZyBzeXN0ZW0gaGFzIGEgUEFDIFVSTCBjb25maWd1cmVkLiBUaGUgVVJMIGlzIG5vdCBjb2xsZWN0ZWQuJyB9O1xuXHRoYXNMb2FkZWRQYWM/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciBhIFBBQyBzY3JpcHQgd2FzIGRpc2NvdmVyZWQgYW5kIGxvYWRlZC4gVGhlIFVSTCBhbmQgc2NyaXB0IGNvbnRlbnRzIGFyZSBub3QgY29sbGVjdGVkLicgfTtcblx0cGFjU291cmNlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0hvdyB0aGUgbG9hZGVkIFBBQyBzY3JpcHQgd2FzIHNlbGVjdGVkICh3cGFkLWRoY3AsIHdwYWQtZG5zLCBjb25maWd1cmVkLCB1bmtub3duLCBvciBub25lKS4nIH07XG5cdHBhY1NjcmlwdENoYXJhY3RlckNvdW50PzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBjaGFyYWN0ZXJzIGluIHRoZSBsb2FkZWQgUEFDIHNjcmlwdC4gVGhlIHNjcmlwdCBjb250ZW50cyBhcmUgbm90IGNvbGxlY3RlZC4nIH07XG5cdHBhY1NjcmlwdExpbmVDb3VudD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgbGluZXMgaW4gdGhlIGxvYWRlZCBQQUMgc2NyaXB0LiBUaGUgc2NyaXB0IGNvbnRlbnRzIGFyZSBub3QgY29sbGVjdGVkLicgfTtcblx0cGFjU2NyaXB0UmV0dXJuQ291bnQ/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIHJldHVybiBrZXl3b3JkIG9jY3VycmVuY2VzIGluIHRoZSBsb2FkZWQgUEFDIHNjcmlwdC4gVGhlIHNjcmlwdCBjb250ZW50cyBhcmUgbm90IGNvbGxlY3RlZC4nIH07XG5cdGhhc0h0dHBQcm94eT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIG5vcm1hbGl6ZWQgc3RhdGljIEhUVFAgcHJveHkgc2V0dGluZ3MgYXJlIHByZXNlbnQuIFByb3h5IGFkZHJlc3NlcyBhcmUgbm90IGNvbGxlY3RlZC4nIH07XG5cdGhhc0h0dHBzUHJveHk/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciBub3JtYWxpemVkIHN0YXRpYyBIVFRQUyBwcm94eSBzZXR0aW5ncyBhcmUgcHJlc2VudC4gUHJveHkgYWRkcmVzc2VzIGFyZSBub3QgY29sbGVjdGVkLicgfTtcblx0aGFzU29ja3NQcm94eT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIG5vcm1hbGl6ZWQgc3RhdGljIFNPQ0tTIHByb3h5IHNldHRpbmdzIGFyZSBwcmVzZW50LiBQcm94eSBhZGRyZXNzZXMgYXJlIG5vdCBjb2xsZWN0ZWQuJyB9O1xuXHRoYXNCeXBhc3NSdWxlcz86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIG9wZXJhdGluZyBzeXN0ZW0gcHJveHkgYnlwYXNzIHJ1bGVzIGFyZSBwcmVzZW50LiBCeXBhc3MgZW50cmllcyBhcmUgbm90IGNvbGxlY3RlZC4nIH07XG5cdGV4Y2x1ZGVTaW1wbGVIb3N0bmFtZXM/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciBtYWNPUyBleGNsdWRlcyBzaW1wbGUgaG9zdG5hbWVzIGZyb20gcHJveHlpbmcuIFVuZGVmaW5lZCBvbiBvdGhlciBwbGF0Zm9ybXMuJyB9O1xuXHRvd25lcjogJ2Nocm1hcnRpJztcblx0Y29tbWVudDogJ1RyYWNrcyBjYXRlZ29yaXplZCBvcGVyYXRpbmcgc3lzdGVtIHByb3h5IGNvbmZpZ3VyYXRpb24gYWZ0ZXIgc3RhcnR1cCB3aXRob3V0IGNvbGxlY3RpbmcgcHJveHkgYWRkcmVzc2VzLCBVUkxzLCBzY3JpcHRzLCBieXBhc3MgZW50cmllcywgb3IgZXJyb3IgdGV4dC4nO1xufTtcblxuLyoqXG4gKiBUaGUgbWFpbiBWUyBDb2RlIGFwcGxpY2F0aW9uLiBUaGVyZSB3aWxsIG9ubHkgZXZlciBiZSBvbmUgaW5zdGFuY2UsXG4gKiBldmVuIGlmIHRoZSB1c2VyIHN0YXJ0cyBtYW55IGluc3RhbmNlcyAoZS5nLiBmcm9tIHRoZSBjb21tYW5kIGxpbmUpLlxuICovXG5leHBvcnQgY2xhc3MgQ29kZUFwcGxpY2F0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VDVVJJVFlfUFJPVE9DT0xfSEFORExJTkdfQ09ORklSTUFUSU9OX1NFVFRJTkdfS0VZID0ge1xuXHRcdFtTY2hlbWFzLmZpbGVdOiAnc2VjdXJpdHkucHJvbXB0Rm9yTG9jYWxGaWxlUHJvdG9jb2xIYW5kbGluZycgYXMgY29uc3QsXG5cdFx0W1NjaGVtYXMudnNjb2RlUmVtb3RlXTogJ3NlY3VyaXR5LnByb21wdEZvclJlbW90ZUZpbGVQcm90b2NvbEhhbmRsaW5nJyBhcyBjb25zdFxuXHR9O1xuXG5cdHByaXZhdGUgd2luZG93c01haW5TZXJ2aWNlOiBJV2luZG93c01haW5TZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZTogSUF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBuYXRpdmVIb3N0TWFpblNlcnZpY2U6IElOYXRpdmVIb3N0TWFpblNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYWluUHJvY2Vzc05vZGVJcGNTZXJ2ZXI6IE5vZGVJUENTZXJ2ZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1c2VyRW52OiBJUHJvY2Vzc0Vudmlyb25tZW50LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYWluSW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUxvZ2dlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0XHRASUVudmlyb25tZW50TWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudE1haW5TZXJ2aWNlOiBJRW52aXJvbm1lbnRNYWluU2VydmljZSxcblx0XHRASUxpZmVjeWNsZU1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlTWFpblNlcnZpY2U6IElMaWZlY3ljbGVNYWluU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0YXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXRlU2VydmljZTogSVN0YXRlU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5jb25maWd1cmVTZXNzaW9uKCk7XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25maWd1cmVTZXNzaW9uKCk6IHZvaWQge1xuXG5cdFx0Ly8jcmVnaW9uIFNlY3VyaXR5IHJlbGF0ZWQgbWVhc3VyZXMgKGh0dHBzOi8vZWxlY3Ryb25qcy5vcmcvZG9jcy90dXRvcmlhbC9zZWN1cml0eSlcblx0XHQvL1xuXHRcdC8vICEhISBETyBOT1QgQ0hBTkdFIHdpdGhvdXQgY29uc3VsdGluZyB0aGUgZG9jdW1lbnRhdGlvbiAhISFcblx0XHQvL1xuXG5cdFx0Y29uc3QgaXNVcmxGcm9tV2luZG93ID0gKHJlcXVlc3RpbmdVcmw/OiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHJlcXVlc3RpbmdVcmw/LnN0YXJ0c1dpdGgoYCR7U2NoZW1hcy52c2NvZGVGaWxlUmVzb3VyY2V9Oi8vJHtWU0NPREVfQVVUSE9SSVRZfWApO1xuXHRcdGNvbnN0IGlzVXJsRnJvbVdlYnZpZXcgPSAocmVxdWVzdGluZ1VybDogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiByZXF1ZXN0aW5nVXJsPy5zdGFydHNXaXRoKGAke1NjaGVtYXMudnNjb2RlV2Vidmlld306Ly9gKTtcblxuXHRcdGNvbnN0IGFsd2F5c0FsbG93ZWRQZXJtaXNzaW9ucyA9IG5ldyBTZXQoWydwb2ludGVyTG9jaycsICdub3RpZmljYXRpb25zJ10pO1xuXG5cdFx0Y29uc3QgYWxsb3dlZFBlcm1pc3Npb25zSW5XZWJ2aWV3ID0gbmV3IFNldChbXG5cdFx0XHQuLi5hbHdheXNBbGxvd2VkUGVybWlzc2lvbnMsXG5cdFx0XHQnY2xpcGJvYXJkLXJlYWQnLFxuXHRcdFx0J2NsaXBib2FyZC1zYW5pdGl6ZWQtd3JpdGUnLFxuXHRcdFx0Ly8gVE9ETyhkZWVwYWsxNTU2KTogU2hvdWxkIGJlIHJlbW92ZWQgb25jZSBtaWdyYXRpb24gaXMgY29tcGxldGVcblx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzkyMjhcblx0XHRcdCdkZXByZWNhdGVkLXN5bmMtY2xpcGJvYXJkLXJlYWQnLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgYWxsb3dlZFBlcm1pc3Npb25zSW5Db3JlID0gbmV3IFNldChbXG5cdFx0XHQuLi5hbHdheXNBbGxvd2VkUGVybWlzc2lvbnMsXG5cdFx0XHQnbWVkaWEnLFxuXHRcdFx0J2xvY2FsLWZvbnRzJyxcblx0XHRcdC8vIFRPRE8oZGVlcGFrMTU1Nik6IFNob3VsZCBiZSByZW1vdmVkIG9uY2UgbWlncmF0aW9uIGlzIGNvbXBsZXRlXG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjM5MjI4XG5cdFx0XHQnZGVwcmVjYXRlZC1zeW5jLWNsaXBib2FyZC1yZWFkJyxcblx0XHRdKTtcblxuXHRcdHNlc3Npb24uZGVmYXVsdFNlc3Npb24uc2V0UGVybWlzc2lvblJlcXVlc3RIYW5kbGVyKChfd2ViQ29udGVudHMsIHBlcm1pc3Npb24sIGNhbGxiYWNrLCBkZXRhaWxzKSA9PiB7XG5cdFx0XHRpZiAoaXNVcmxGcm9tV2VidmlldyhkZXRhaWxzLnJlcXVlc3RpbmdVcmwpKSB7XG5cdFx0XHRcdHJldHVybiBjYWxsYmFjayhhbGxvd2VkUGVybWlzc2lvbnNJbldlYnZpZXcuaGFzKHBlcm1pc3Npb24pKTtcblx0XHRcdH1cblx0XHRcdGlmIChpc1VybEZyb21XaW5kb3coZGV0YWlscy5yZXF1ZXN0aW5nVXJsKSkge1xuXHRcdFx0XHRyZXR1cm4gY2FsbGJhY2soYWxsb3dlZFBlcm1pc3Npb25zSW5Db3JlLmhhcyhwZXJtaXNzaW9uKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY2FsbGJhY2soZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0c2Vzc2lvbi5kZWZhdWx0U2Vzc2lvbi5zZXRQZXJtaXNzaW9uQ2hlY2tIYW5kbGVyKChfd2ViQ29udGVudHMsIHBlcm1pc3Npb24sIF9vcmlnaW4sIGRldGFpbHMpID0+IHtcblx0XHRcdGlmIChpc1VybEZyb21XZWJ2aWV3KGRldGFpbHMucmVxdWVzdGluZ1VybCkpIHtcblx0XHRcdFx0cmV0dXJuIGFsbG93ZWRQZXJtaXNzaW9uc0luV2Vidmlldy5oYXMocGVybWlzc2lvbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNVcmxGcm9tV2luZG93KGRldGFpbHMucmVxdWVzdGluZ1VybCkpIHtcblx0XHRcdFx0cmV0dXJuIGFsbG93ZWRQZXJtaXNzaW9uc0luQ29yZS5oYXMocGVybWlzc2lvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cblx0XHRsZXQgY2FjaGVkU2NyZWVuU291cmNlczogRWxlY3Ryb24uRGVza3RvcENhcHR1cmVyU291cmNlW10gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaW52YWxpZGF0ZVNjcmVlblNvdXJjZUNhY2hlID0gKCkgPT4ge1xuXHRcdFx0Y2FjaGVkU2NyZWVuU291cmNlcyA9IHVuZGVmaW5lZDtcblx0XHR9O1xuXHRcdGVsZWN0cm9uU2NyZWVuLm9uKCdkaXNwbGF5LWFkZGVkJywgaW52YWxpZGF0ZVNjcmVlblNvdXJjZUNhY2hlKTtcblx0XHRlbGVjdHJvblNjcmVlbi5vbignZGlzcGxheS1yZW1vdmVkJywgaW52YWxpZGF0ZVNjcmVlblNvdXJjZUNhY2hlKTtcblx0XHRlbGVjdHJvblNjcmVlbi5vbignZGlzcGxheS1tZXRyaWNzLWNoYW5nZWQnLCBpbnZhbGlkYXRlU2NyZWVuU291cmNlQ2FjaGUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRlbGVjdHJvblNjcmVlbi5vZmYoJ2Rpc3BsYXktYWRkZWQnLCBpbnZhbGlkYXRlU2NyZWVuU291cmNlQ2FjaGUpO1xuXHRcdFx0ZWxlY3Ryb25TY3JlZW4ub2ZmKCdkaXNwbGF5LXJlbW92ZWQnLCBpbnZhbGlkYXRlU2NyZWVuU291cmNlQ2FjaGUpO1xuXHRcdFx0ZWxlY3Ryb25TY3JlZW4ub2ZmKCdkaXNwbGF5LW1ldHJpY3MtY2hhbmdlZCcsIGludmFsaWRhdGVTY3JlZW5Tb3VyY2VDYWNoZSk7XG5cdFx0fSkpO1xuXHRcdHNlc3Npb24uZGVmYXVsdFNlc3Npb24uc2V0RGlzcGxheU1lZGlhUmVxdWVzdEhhbmRsZXIoYXN5bmMgKHJlcXVlc3QsIGNhbGxiYWNrKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBmcmFtZSA9IHJlcXVlc3QuZnJhbWU7XG5cdFx0XHRcdGNvbnN0IHdpbiA9IGZyYW1lID8gQnJvd3NlcldpbmRvdy5nZXRBbGxXaW5kb3dzKCkuZmluZCh3ID0+IHcud2ViQ29udGVudHMubWFpbkZyYW1lID09PSBmcmFtZSkgOiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0Y29uc3QgZGlzcGxheXMgPSBlbGVjdHJvblNjcmVlbi5nZXRBbGxEaXNwbGF5cygpO1xuXHRcdFx0XHRsZXQgdGFyZ2V0RGlzcGxheSA9IGRpc3BsYXlzWzBdO1xuXHRcdFx0XHRpZiAod2luKSB7XG5cdFx0XHRcdFx0Y29uc3Qgd2luQm91bmRzID0gd2luLmdldEJvdW5kcygpO1xuXHRcdFx0XHRcdHRhcmdldERpc3BsYXkgPSBlbGVjdHJvblNjcmVlbi5nZXREaXNwbGF5TmVhcmVzdFBvaW50KHtcblx0XHRcdFx0XHRcdHg6IHdpbkJvdW5kcy54ICsgd2luQm91bmRzLndpZHRoIC8gMixcblx0XHRcdFx0XHRcdHk6IHdpbkJvdW5kcy55ICsgd2luQm91bmRzLmhlaWdodCAvIDIsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWNhY2hlZFNjcmVlblNvdXJjZXMpIHtcblx0XHRcdFx0XHRjYWNoZWRTY3JlZW5Tb3VyY2VzID0gYXdhaXQgZGVza3RvcENhcHR1cmVyLmdldFNvdXJjZXMoe1xuXHRcdFx0XHRcdFx0dHlwZXM6IFsnc2NyZWVuJ10sXG5cdFx0XHRcdFx0XHR0aHVtYm5haWxTaXplOiB7IHdpZHRoOiAwLCBoZWlnaHQ6IDAgfSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBtYXRjaCA9IGNhY2hlZFNjcmVlblNvdXJjZXMuZmluZChzID0+IHMuZGlzcGxheV9pZCA9PT0gU3RyaW5nKHRhcmdldERpc3BsYXkuaWQpKTtcblx0XHRcdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0XHRcdC8vIENhY2hlIG1heSBiZSBzdGFsZSBldmVuIHdpdGhvdXQgYSB0b3BvbG9neSBldmVudFxuXHRcdFx0XHRcdGNhY2hlZFNjcmVlblNvdXJjZXMgPSBhd2FpdCBkZXNrdG9wQ2FwdHVyZXIuZ2V0U291cmNlcyh7XG5cdFx0XHRcdFx0XHR0eXBlczogWydzY3JlZW4nXSxcblx0XHRcdFx0XHRcdHRodW1ibmFpbFNpemU6IHsgd2lkdGg6IDAsIGhlaWdodDogMCB9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdG1hdGNoID0gY2FjaGVkU2NyZWVuU291cmNlcy5maW5kKHMgPT4gcy5kaXNwbGF5X2lkID09PSBTdHJpbmcodGFyZ2V0RGlzcGxheS5pZCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY2hvc2VuID0gbWF0Y2ggPz8gY2FjaGVkU2NyZWVuU291cmNlc1swXTtcblx0XHRcdFx0aWYgKCFjaG9zZW4pIHtcblx0XHRcdFx0XHQvLyBObyBzY3JlZW4gc291cmNlcyBhdmFpbGFibGUgKHBlcm1pc3Npb24gZGVuaWVkIG9yIHRyYW5zaWVudCBmYWlsdXJlKS5cblx0XHRcdFx0XHRjYWxsYmFjayh7fSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhbGxiYWNrKHsgdmlkZW86IGNob3NlbiB9KTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRjYWxsYmFjayh7fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyNlbmRyZWdpb25cblxuXHRcdC8vI3JlZ2lvbiBSZXF1ZXN0IGZpbHRlcmluZ1xuXG5cdFx0Ly8gQmxvY2sgYWxsIFNWRyByZXF1ZXN0cyBmcm9tIHVuc3VwcG9ydGVkIG9yaWdpbnNcblx0XHRjb25zdCBzdXBwb3J0ZWRTdmdTY2hlbWVzID0gbmV3IFNldChbU2NoZW1hcy5maWxlLCBTY2hlbWFzLnZzY29kZUZpbGVSZXNvdXJjZSwgU2NoZW1hcy52c2NvZGVSZW1vdGVSZXNvdXJjZSwgU2NoZW1hcy52c2NvZGVNYW5hZ2VkUmVtb3RlUmVzb3VyY2UsICdkZXZ0b29scyddKTtcblxuXHRcdC8vIEJ1dCBhbGxvdyB0aGVtIGlmIHRoZXkgYXJlIG1hZGUgZnJvbSBpbnNpZGUgYW4gd2Vidmlld1xuXHRcdGNvbnN0IGlzU2FmZUZyYW1lID0gKHJlcXVlc3RGcmFtZTogV2ViRnJhbWVNYWluIHwgbnVsbCB8IHVuZGVmaW5lZCk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0Zm9yIChsZXQgZnJhbWU6IFdlYkZyYW1lTWFpbiB8IG51bGwgfCB1bmRlZmluZWQgPSByZXF1ZXN0RnJhbWU7IGZyYW1lOyBmcmFtZSA9IGZyYW1lLnBhcmVudCkge1xuXHRcdFx0XHQvLyBUaGUgcmVuZGVyIGZyYW1lIGJhY2tpbmcgdGhpcyBXZWJGcmFtZU1haW4gbWF5IGFscmVhZHkgYmUgZGlzcG9zZWRcblx0XHRcdFx0Ly8gKGUuZy4gdGhlIG9yaWdpbmF0aW5nIHdlYnZpZXcvd2luZG93IHdhcyBjbG9zZWQgb3IgbmF2aWdhdGVkIGF3YXkpXG5cdFx0XHRcdC8vIGJ5IHRoZSB0aW1lIHRoaXMgd2ViUmVxdWVzdCBjYWxsYmFjayBydW5zLiBBY2Nlc3NpbmcgYW55IHByb3BlcnR5XG5cdFx0XHRcdC8vIG9mIGEgZGlzcG9zZWQgZnJhbWUgdGhyb3dzIFwiUmVuZGVyIGZyYW1lIHdhcyBkaXNwb3NlZCBiZWZvcmVcblx0XHRcdFx0Ly8gV2ViRnJhbWVNYWluIGNvdWxkIGJlIGFjY2Vzc2VkXCIsIHNvIGd1YXJkIGJlZm9yZSByZWFkaW5nIGl0LlxuXHRcdFx0XHRpZiAoZnJhbWUuaXNEZXN0cm95ZWQoKSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZnJhbWUudXJsLnN0YXJ0c1dpdGgoYCR7U2NoZW1hcy52c2NvZGVXZWJ2aWV3fTovL2ApKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgaXNTdmdSZXF1ZXN0RnJvbVNhZmVDb250ZXh0ID0gKGRldGFpbHM6IEVsZWN0cm9uLk9uQmVmb3JlUmVxdWVzdExpc3RlbmVyRGV0YWlscyB8IEVsZWN0cm9uLk9uSGVhZGVyc1JlY2VpdmVkTGlzdGVuZXJEZXRhaWxzKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRyZXR1cm4gZGV0YWlscy5yZXNvdXJjZVR5cGUgPT09ICd4aHInIHx8IGlzU2FmZUZyYW1lKGRldGFpbHMuZnJhbWUpO1xuXHRcdH07XG5cblx0XHRjb25zdCBpc0FsbG93ZWRWc0NvZGVGaWxlUmVxdWVzdCA9IChkZXRhaWxzOiBFbGVjdHJvbi5PbkJlZm9yZVJlcXVlc3RMaXN0ZW5lckRldGFpbHMpID0+IHtcblx0XHRcdGNvbnN0IGZyYW1lID0gZGV0YWlscy5mcmFtZTtcblx0XHRcdGlmICghZnJhbWUgfHwgZnJhbWUuaXNEZXN0cm95ZWQoKSB8fCAhdGhpcy53aW5kb3dzTWFpblNlcnZpY2UpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayB0byBzZWUgaWYgdGhlIHJlcXVlc3QgY29tZXMgZnJvbSBvbmUgb2YgdGhlIG1haW4gd2luZG93cyAob3Igc2hhcmVkIHByb2Nlc3MpIGFuZCBub3QgZnJvbSBlbWJlZGRlZCBjb250ZW50XG5cdFx0XHRjb25zdCB3aW5kb3dzID0gZ2V0QWxsV2luZG93c0V4Y2x1ZGluZ09mZnNjcmVlbigpO1xuXHRcdFx0Zm9yIChjb25zdCB3aW5kb3cgb2Ygd2luZG93cykge1xuXHRcdFx0XHRpZiAoZnJhbWUucHJvY2Vzc0lkID09PSB3aW5kb3cud2ViQ29udGVudHMubWFpbkZyYW1lLnByb2Nlc3NJZCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgaXNBbGxvd2VkV2Vidmlld1JlcXVlc3QgPSAodXJpOiBVUkksIGRldGFpbHM6IEVsZWN0cm9uLk9uQmVmb3JlUmVxdWVzdExpc3RlbmVyRGV0YWlscyk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0aWYgKHVyaS5wYXRoICE9PSAnL2luZGV4Lmh0bWwnKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlOyAvLyBPbmx5IHJlc3RyaWN0IHRvcCBsZXZlbCBwYWdlIG9mIHdlYnZpZXdzOiBpbmRleC5odG1sXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZyYW1lID0gZGV0YWlscy5mcmFtZTtcblx0XHRcdGlmICghZnJhbWUgfHwgZnJhbWUuaXNEZXN0cm95ZWQoKSB8fCAhdGhpcy53aW5kb3dzTWFpblNlcnZpY2UpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayB0byBzZWUgaWYgdGhlIHJlcXVlc3QgY29tZXMgZnJvbSBvbmUgb2YgdGhlIG1haW4gZWRpdG9yIHdpbmRvd3MuXG5cdFx0XHRmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dzKCkpIHtcblx0XHRcdFx0aWYgKHdpbmRvdy53aW4pIHtcblx0XHRcdFx0XHRpZiAoZnJhbWUucHJvY2Vzc0lkID09PSB3aW5kb3cud2luLndlYkNvbnRlbnRzLm1haW5GcmFtZS5wcm9jZXNzSWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fTtcblxuXHRcdHNlc3Npb24uZGVmYXVsdFNlc3Npb24ud2ViUmVxdWVzdC5vbkJlZm9yZVJlcXVlc3QoKGRldGFpbHMsIGNhbGxiYWNrKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoZGV0YWlscy51cmwpO1xuXHRcdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlV2Vidmlldykge1xuXHRcdFx0XHRpZiAoIWlzQWxsb3dlZFdlYnZpZXdSZXF1ZXN0KHVyaSwgZGV0YWlscykpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Jsb2NrZWQgdnNjb2RlLXdlYnZpZXcgcmVxdWVzdCcsIGRldGFpbHMudXJsKTtcblx0XHRcdFx0XHRyZXR1cm4gY2FsbGJhY2soeyBjYW5jZWw6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlRmlsZVJlc291cmNlKSB7XG5cdFx0XHRcdGlmICghaXNBbGxvd2VkVnNDb2RlRmlsZVJlcXVlc3QoZGV0YWlscykpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Jsb2NrZWQgdnNjb2RlLWZpbGUgcmVxdWVzdCcsIGRldGFpbHMudXJsKTtcblx0XHRcdFx0XHRyZXR1cm4gY2FsbGJhY2soeyBjYW5jZWw6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQmxvY2sgbW9zdCBzdmdzXG5cdFx0XHRpZiAodXJpLnBhdGguZW5kc1dpdGgoJy5zdmcnKSkge1xuXHRcdFx0XHRjb25zdCBpc1NhZmVSZXNvdXJjZVVybCA9IHN1cHBvcnRlZFN2Z1NjaGVtZXMuaGFzKHVyaS5zY2hlbWUpO1xuXHRcdFx0XHRpZiAoIWlzU2FmZVJlc291cmNlVXJsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNhbGxiYWNrKHsgY2FuY2VsOiAhaXNTdmdSZXF1ZXN0RnJvbVNhZmVDb250ZXh0KGRldGFpbHMpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjYWxsYmFjayh7IGNhbmNlbDogZmFsc2UgfSk7XG5cdFx0fSk7XG5cblx0XHQvLyBDb25maWd1cmUgU1ZHIGhlYWRlciBjb250ZW50IHR5cGUgcHJvcGVybHlcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTc1NjRcblx0XHRzZXNzaW9uLmRlZmF1bHRTZXNzaW9uLndlYlJlcXVlc3Qub25IZWFkZXJzUmVjZWl2ZWQoKGRldGFpbHMsIGNhbGxiYWNrKSA9PiB7XG5cdFx0XHRjb25zdCByZXNwb25zZUhlYWRlcnMgPSBkZXRhaWxzLnJlc3BvbnNlSGVhZGVycyBhcyBSZWNvcmQ8c3RyaW5nLCAoc3RyaW5nKSB8IChzdHJpbmdbXSk+O1xuXHRcdFx0Y29uc3QgY29udGVudFR5cGVzID0gKHJlc3BvbnNlSGVhZGVyc1snY29udGVudC10eXBlJ10gfHwgcmVzcG9uc2VIZWFkZXJzWydDb250ZW50LVR5cGUnXSk7XG5cblx0XHRcdGlmIChjb250ZW50VHlwZXMgJiYgQXJyYXkuaXNBcnJheShjb250ZW50VHlwZXMpKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShkZXRhaWxzLnVybCk7XG5cdFx0XHRcdGlmICh1cmkucGF0aC5lbmRzV2l0aCgnLnN2ZycpKSB7XG5cdFx0XHRcdFx0aWYgKHN1cHBvcnRlZFN2Z1NjaGVtZXMuaGFzKHVyaS5zY2hlbWUpKSB7XG5cdFx0XHRcdFx0XHRyZXNwb25zZUhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddID0gWydpbWFnZS9zdmcreG1sJ107XG5cblx0XHRcdFx0XHRcdHJldHVybiBjYWxsYmFjayh7IGNhbmNlbDogZmFsc2UsIHJlc3BvbnNlSGVhZGVycyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyByZW1vdGUgZXh0ZW5zaW9uIHNjaGVtZXMgaGF2ZSB0aGUgZm9sbG93aW5nIGZvcm1hdFxuXHRcdFx0XHQvLyBodHRwOi8vMTI3LjAuMC4xOjxwb3J0Pi92c2NvZGUtcmVtb3RlLXJlc291cmNlP3BhdGg9XG5cdFx0XHRcdGlmICghdXJpLnBhdGguZW5kc1dpdGgoU2NoZW1hcy52c2NvZGVSZW1vdGVSZXNvdXJjZSkgJiYgY29udGVudFR5cGVzLnNvbWUoY29udGVudFR5cGUgPT4gY29udGVudFR5cGUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnaW1hZ2Uvc3ZnJykpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNhbGxiYWNrKHsgY2FuY2VsOiAhaXNTdmdSZXF1ZXN0RnJvbVNhZmVDb250ZXh0KGRldGFpbHMpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjYWxsYmFjayh7IGNhbmNlbDogZmFsc2UgfSk7XG5cdFx0fSk7XG5cblx0XHQvLyNlbmRyZWdpb25cblxuXHRcdC8vI3JlZ2lvbiBBbGxvdyBDT1JTIGZvciB0aGUgUFJTUyBDRE5cblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLXJlbW90ZS1yZWxlYXNlL2lzc3Vlcy85MjQ2XG5cdFx0c2Vzc2lvbi5kZWZhdWx0U2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uSGVhZGVyc1JlY2VpdmVkKChkZXRhaWxzLCBjYWxsYmFjaykgPT4ge1xuXHRcdFx0aWYgKGRldGFpbHMudXJsLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vdnNjb2RlLmRvd25sb2FkLnByc3MubWljcm9zb2Z0LmNvbS8nKSkge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZUhlYWRlcnMgPSBkZXRhaWxzLnJlc3BvbnNlSGVhZGVycyA/PyBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdFx0XHRcdGlmIChyZXNwb25zZUhlYWRlcnNbJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbiddID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXNwb25zZUhlYWRlcnNbJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbiddID0gWycqJ107XG5cdFx0XHRcdFx0cmV0dXJuIGNhbGxiYWNrKHsgY2FuY2VsOiBmYWxzZSwgcmVzcG9uc2VIZWFkZXJzIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjYWxsYmFjayh7IGNhbmNlbDogZmFsc2UgfSk7XG5cdFx0fSk7XG5cblx0XHQvLyNlbmRyZWdpb25cblxuXHRcdC8vI3JlZ2lvbiBDb2RlIENhY2hlXG5cblx0XHR0eXBlIFNlc3Npb25XaXRoQ29kZUNhY2hlUGF0aFN1cHBvcnQgPSBTZXNzaW9uICYge1xuXHRcdFx0LyoqXG5cdFx0XHQgKiBTZXRzIGNvZGUgY2FjaGUgZGlyZWN0b3J5LiBCeSBkZWZhdWx0LCB0aGUgZGlyZWN0b3J5IHdpbGwgYmUgYENvZGUgQ2FjaGVgIHVuZGVyXG5cdFx0XHQgKiB0aGUgcmVzcGVjdGl2ZSB1c2VyIGRhdGEgZm9sZGVyLlxuXHRcdFx0ICovXG5cdFx0XHRzZXRDb2RlQ2FjaGVQYXRoPyhwYXRoOiBzdHJpbmcpOiB2b2lkO1xuXHRcdH07XG5cblx0XHRjb25zdCBkZWZhdWx0U2Vzc2lvbiA9IHNlc3Npb24uZGVmYXVsdFNlc3Npb24gYXMgdW5rbm93biBhcyBTZXNzaW9uV2l0aENvZGVDYWNoZVBhdGhTdXBwb3J0O1xuXHRcdGlmICh0eXBlb2YgZGVmYXVsdFNlc3Npb24uc2V0Q29kZUNhY2hlUGF0aCA9PT0gJ2Z1bmN0aW9uJyAmJiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuY29kZUNhY2hlUGF0aCkge1xuXHRcdFx0Ly8gTWFrZSBzdXJlIHRvIHBhcnRpdGlvbiBDaHJvbWUncyBjb2RlIGNhY2hlIGZvbGRlclxuXHRcdFx0Ly8gaW4gdGhlIHNhbWUgd2F5IGFzIG91ciBjb2RlIGNhY2hlIHBhdGggdG8gaGVscFxuXHRcdFx0Ly8gaW52YWxpZGF0ZSBjYWNoZXMgdGhhdCB3ZSBrbm93IGFyZSBpbnZhbGlkXG5cdFx0XHQvLyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyMDY1NSlcblx0XHRcdGRlZmF1bHRTZXNzaW9uLnNldENvZGVDYWNoZVBhdGgoam9pbih0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuY29kZUNhY2hlUGF0aCwgJ2Nocm9tZScpKTtcblx0XHR9XG5cblx0XHQvLyNlbmRyZWdpb25cblxuXHRcdC8vI3JlZ2lvbiBVTkMgSG9zdCBBbGxvd2xpc3QgKFdpbmRvd3MpXG5cblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnc2VjdXJpdHkucmVzdHJpY3RVTkNBY2Nlc3MnKSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0ZGlzYWJsZVVOQ0FjY2Vzc1Jlc3RyaWN0aW9ucygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YWRkVU5DSG9zdFRvQWxsb3dsaXN0KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3NlY3VyaXR5LmFsbG93ZWRVTkNIb3N0cycpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyNlbmRyZWdpb25cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBEaXNwb3NlIG9uIHNodXRkb3duXG5cdFx0RXZlbnQub25jZSh0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLm9uV2lsbFNodXRkb3duKSgoKSA9PiB0aGlzLmRpc3Bvc2UoKSk7XG5cblx0XHQvLyBDb250ZXh0bWVudSB2aWEgSVBDIHN1cHBvcnRcblx0XHRyZWdpc3RlckNvbnRleHRNZW51TGlzdGVuZXIoKTtcblxuXHRcdC8vIEFjY2Vzc2liaWxpdHkgY2hhbmdlIGV2ZW50XG5cdFx0YXBwLm9uKCdhY2Nlc3NpYmlsaXR5LXN1cHBvcnQtY2hhbmdlZCcsIChldmVudCwgYWNjZXNzaWJpbGl0eVN1cHBvcnRFbmFibGVkKSA9PiB7XG5cdFx0XHR0aGlzLndpbmRvd3NNYWluU2VydmljZT8uc2VuZFRvQWxsKCd2c2NvZGU6YWNjZXNzaWJpbGl0eVN1cHBvcnRDaGFuZ2VkJywgYWNjZXNzaWJpbGl0eVN1cHBvcnRFbmFibGVkKTtcblx0XHR9KTtcblxuXHRcdC8vIG1hY09TIGRvY2sgYWN0aXZhdGVcblx0XHRhcHAub24oJ2FjdGl2YXRlJywgYXN5bmMgKGV2ZW50LCBoYXNWaXNpYmxlV2luZG93cykgPT4ge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdhcHAjYWN0aXZhdGUnKTtcblxuXHRcdFx0Ly8gTWFjIG9ubHkgZXZlbnQ6IG9wZW4gbmV3IHdpbmRvdyB3aGVuIHdlIGdldCBhY3RpdmF0ZWRcblx0XHRcdGlmICghaGFzVmlzaWJsZVdpbmRvd3MpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy53aW5kb3dzTWFpblNlcnZpY2U/Lm9wZW5FbXB0eVdpbmRvdyh7IGNvbnRleHQ6IE9wZW5Db250ZXh0LkRPQ0sgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyNyZWdpb24gU2VjdXJpdHkgcmVsYXRlZCBtZWFzdXJlcyAoaHR0cHM6Ly9lbGVjdHJvbmpzLm9yZy9kb2NzL3R1dG9yaWFsL3NlY3VyaXR5KVxuXHRcdC8vXG5cdFx0Ly8gISEhIERPIE5PVCBDSEFOR0Ugd2l0aG91dCBjb25zdWx0aW5nIHRoZSBkb2N1bWVudGF0aW9uICEhIVxuXHRcdC8vXG5cdFx0YXBwLm9uKCd3ZWItY29udGVudHMtY3JlYXRlZCcsIChldmVudCwgY29udGVudHMpID0+IHtcblxuXHRcdFx0Ly8gQXV4aWxpYXJ5IFdpbmRvdzogZGVsZWdhdGUgdG8gYEF1eGlsaWFyeVdpbmRvd2AgY2xhc3Ncblx0XHRcdGlmIChjb250ZW50cz8ub3BlbmVyPy51cmwuc3RhcnRzV2l0aChgJHtTY2hlbWFzLnZzY29kZUZpbGVSZXNvdXJjZX06Ly8ke1ZTQ09ERV9BVVRIT1JJVFl9L2ApKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW2F1eCB3aW5kb3ddICBhcHAub24oXCJ3ZWItY29udGVudHMtY3JlYXRlZFwiKTogUmVnaXN0ZXJpbmcgYXV4aWxpYXJ5IHdpbmRvdycpO1xuXG5cdFx0XHRcdHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlPy5yZWdpc3RlcldpbmRvdyhjb250ZW50cyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEhhbmRsZSBhbnkgaW4tcGFnZSBuYXZpZ2F0aW9uXG5cdFx0XHRjb250ZW50cy5vbignd2lsbC1uYXZpZ2F0ZScsIGV2ZW50ID0+IHtcblx0XHRcdFx0aWYgKEJyb3dzZXJWaWV3TWFpblNlcnZpY2UuaXNCcm93c2VyVmlld1dlYkNvbnRlbnRzKGNvbnRlbnRzKSkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gQWxsb3cgbmF2aWdhdGlvbiBpbiBpbnRlZ3JhdGVkIGJyb3dzZXIgdmlld3Ncblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignd2ViQ29udGVudHMjd2lsbC1uYXZpZ2F0ZTogUHJldmVudGVkIHdlYmNvbnRlbnQgbmF2aWdhdGlvbicpO1xuXG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7IC8vIFByZXZlbnQgYW55IGluLXBhZ2UgbmF2aWdhdGlvblxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEFsbCBXaW5kb3dzOiBvbmx5IGFsbG93IGFib3V0OmJsYW5rIGF1eGlsaWFyeSB3aW5kb3dzIHRvIG9wZW5cblx0XHRcdC8vIEZvciBhbGwgb3RoZXIgVVJMcywgZGVsZWdhdGUgdG8gdGhlIE9TLlxuXHRcdFx0Y29udGVudHMuc2V0V2luZG93T3BlbkhhbmRsZXIoZGV0YWlscyA9PiB7XG5cblx0XHRcdFx0Ly8gYWJvdXQ6Ymxhbmsgd2luZG93cyBjYW4gb3BlbiBhcyB3aW5kb3cgd2l0aG8gb3VyIGRlZmF1bHQgb3B0aW9uc1xuXHRcdFx0XHRpZiAoZGV0YWlscy51cmwgPT09ICdhYm91dDpibGFuaycpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1thdXggd2luZG93XSB3ZWJDb250ZW50cyNzZXRXaW5kb3dPcGVuSGFuZGxlcjogQWxsb3dpbmcgYXV4aWxpYXJ5IHdpbmRvdyB0byBvcGVuIG9uIGFib3V0OmJsYW5rJyk7XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0YWN0aW9uOiAnYWxsb3cnLFxuXHRcdFx0XHRcdFx0b3ZlcnJpZGVCcm93c2VyV2luZG93T3B0aW9uczogdGhpcy5hdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2U/LmNyZWF0ZVdpbmRvdyhkZXRhaWxzKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBbnkgb3RoZXIgVVJMOiBkZWxlZ2F0ZSB0byBPU1xuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYHdlYkNvbnRlbnRzI3NldFdpbmRvd09wZW5IYW5kbGVyOiBQcmV2ZW50ZWQgb3BlbmluZyB3aW5kb3cgd2l0aCBVUkwgJHtkZXRhaWxzLnVybH19YCk7XG5cblx0XHRcdFx0XHR0aGlzLm5hdGl2ZUhvc3RNYWluU2VydmljZT8ub3BlbkV4dGVybmFsKHVuZGVmaW5lZCwgZGV0YWlscy51cmwpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHsgYWN0aW9uOiAnZGVueScgfTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyNlbmRyZWdpb25cblxuXHRcdGxldCBtYWNPcGVuRmlsZVVSSXM6IElXaW5kb3dPcGVuYWJsZVtdID0gW107XG5cdFx0bGV0IHJ1bm5pbmdUaW1lb3V0OiBUaW1lb3V0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGFwcC5vbignb3Blbi1maWxlJywgKGV2ZW50LCBwYXRoKSA9PiB7XG5cdFx0XHRwYXRoID0gbm9ybWFsaXplTkZDKHBhdGgpOyAvLyBtYWNPUyBvbmx5OiBub3JtYWxpemUgcGF0aHMgdG8gTkZDIGZvcm1cblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdhcHAjb3Blbi1maWxlOiAnLCBwYXRoKTtcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdC8vIEtlZXAgaW4gYXJyYXkgYmVjYXVzZSBtb3JlIG1pZ2h0IGNvbWUhXG5cdFx0XHRtYWNPcGVuRmlsZVVSSXMucHVzaChoYXNXb3Jrc3BhY2VGaWxlRXh0ZW5zaW9uKHBhdGgpID8geyB3b3Jrc3BhY2VVcmk6IFVSSS5maWxlKHBhdGgpIH0gOiB7IGZpbGVVcmk6IFVSSS5maWxlKHBhdGgpIH0pO1xuXG5cdFx0XHQvLyBDbGVhciBwcmV2aW91cyBoYW5kbGVyIGlmIGFueVxuXHRcdFx0aWYgKHJ1bm5pbmdUaW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHJ1bm5pbmdUaW1lb3V0KTtcblx0XHRcdFx0cnVubmluZ1RpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEhhbmRsZSBwYXRocyBkZWxheWVkIGluIGNhc2UgbW9yZSBhcmUgY29taW5nIVxuXHRcdFx0cnVubmluZ1RpbWVvdXQgPSBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy53aW5kb3dzTWFpblNlcnZpY2U/Lm9wZW4oe1xuXHRcdFx0XHRcdGNvbnRleHQ6IE9wZW5Db250ZXh0LkRPQ0sgLyogY2FuIGFsc28gYmUgb3BlbmluZyBmcm9tIGZpbmRlciB3aGlsZSBhcHAgaXMgcnVubmluZyAqLyxcblx0XHRcdFx0XHRjbGk6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzLFxuXHRcdFx0XHRcdHVyaXNUb09wZW46IG1hY09wZW5GaWxlVVJJcyxcblx0XHRcdFx0XHRnb3RvTGluZU1vZGU6IGZhbHNlLFxuXHRcdFx0XHRcdHByZWZlck5ld1dpbmRvdzogdHJ1ZSAvKiBkcm9wcGluZyBvbiB0aGUgZG9jayBvciBvcGVuaW5nIGZyb20gZmluZGVyIHByZWZlcnMgdG8gb3BlbiBpbiBhIG5ldyB3aW5kb3cgKi9cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bWFjT3BlbkZpbGVVUklzID0gW107XG5cdFx0XHRcdHJ1bm5pbmdUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fSwgMTAwKTtcblx0XHR9KTtcblxuXHRcdGFwcC5vbignbmV3LXdpbmRvdy1mb3ItdGFiJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy53aW5kb3dzTWFpblNlcnZpY2U/Lm9wZW5FbXB0eVdpbmRvdyh7IGNvbnRleHQ6IE9wZW5Db250ZXh0LkRFU0tUT1AgfSk7IC8vbWFjT1MgbmF0aXZlIHRhYiBcIitcIiBidXR0b25cblx0XHR9KTtcblxuXHRcdC8vI3JlZ2lvbiBCb290c3RyYXAgSVBDIEhhbmRsZXJzXG5cblx0XHR2YWxpZGF0ZWRJcGNNYWluLmhhbmRsZSgndnNjb2RlOmZldGNoU2hlbGxFbnYnLCBldmVudCA9PiB7XG5cblx0XHRcdC8vIFByZWZlciB0byB1c2UgdGhlIGFyZ3MgYW5kIGVudiBmcm9tIHRoZSB0YXJnZXQgd2luZG93XG5cdFx0XHQvLyB3aGVuIHJlc29sdmluZyB0aGUgc2hlbGwgZW52LiBJdCBpcyBwb3NzaWJsZSB0aGF0XG5cdFx0XHQvLyBhIGZpcnN0IHdpbmRvdyB3YXMgb3BlbmVkIGZyb20gdGhlIFVJIGJ1dCBhIHNlY29uZFxuXHRcdFx0Ly8gZnJvbSB0aGUgQ0xJIGFuZCB0aGF0IGhhcyBpbXBsaWNhdGlvbnMgZm9yIHdoZXRoZXIgdG9cblx0XHRcdC8vIHJlc29sdmUgdGhlIHNoZWxsIGVudmlyb25tZW50IG9yIG5vdC5cblx0XHRcdC8vXG5cdFx0XHQvLyBXaW5kb3cgY2FuIGJlIHVuZGVmaW5lZCBmb3IgZS5nLiB0aGUgc2hhcmVkIHByb2Nlc3Ncblx0XHRcdC8vIHRoYXQgaXMgbm90IHBhcnQgb2Ygb3VyIHdpbmRvd3MgcmVnaXN0cnkhXG5cdFx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZT8uZ2V0V2luZG93QnlXZWJDb250ZW50cyhldmVudC5zZW5kZXIpOyAvLyBOb3RlOiB0aGlzIGNhbiBiZSBgdW5kZWZpbmVkYCBmb3IgdGhlIHNoYXJlZCBwcm9jZXNzXG5cdFx0XHRsZXQgYXJnczogTmF0aXZlUGFyc2VkQXJncztcblx0XHRcdGxldCBlbnY6IElQcm9jZXNzRW52aXJvbm1lbnQ7XG5cdFx0XHRpZiAod2luZG93Py5jb25maWcpIHtcblx0XHRcdFx0YXJncyA9IHdpbmRvdy5jb25maWc7XG5cdFx0XHRcdGVudiA9IHsgLi4ucHJvY2Vzcy5lbnYsIC4uLndpbmRvdy5jb25maWcudXNlckVudiB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXJncyA9IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzO1xuXHRcdFx0XHRlbnYgPSBwcm9jZXNzLmVudjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVzb2x2ZSBzaGVsbCBlbnZcblx0XHRcdHJldHVybiB0aGlzLnJlc29sdmVTaGVsbEVudmlyb25tZW50KGFyZ3MsIGVudiwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dmFsaWRhdGVkSXBjTWFpbi5vbigndnNjb2RlOnRvZ2dsZURldlRvb2xzJywgZXZlbnQgPT4gZXZlbnQuc2VuZGVyLnRvZ2dsZURldlRvb2xzKCkpO1xuXHRcdHZhbGlkYXRlZElwY01haW4ub24oJ3ZzY29kZTpvcGVuRGV2VG9vbHMnLCBldmVudCA9PiBldmVudC5zZW5kZXIub3BlbkRldlRvb2xzKCkpO1xuXG5cdFx0dmFsaWRhdGVkSXBjTWFpbi5vbigndnNjb2RlOnJlbG9hZFdpbmRvdycsIGV2ZW50ID0+IGV2ZW50LnNlbmRlci5yZWxvYWQoKSk7XG5cblx0XHR2YWxpZGF0ZWRJcGNNYWluLmhhbmRsZSgndnNjb2RlOm5vdGlmeVpvb21MZXZlbCcsIGFzeW5jIChldmVudCwgem9vbUxldmVsOiBudW1iZXIgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93c01haW5TZXJ2aWNlPy5nZXRXaW5kb3dCeVdlYkNvbnRlbnRzKGV2ZW50LnNlbmRlcik7XG5cdFx0XHRpZiAod2luZG93KSB7XG5cdFx0XHRcdHdpbmRvdy5ub3RpZnlab29tTGV2ZWwoem9vbUxldmVsKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vI2VuZHJlZ2lvblxuXHR9XG5cblx0YXN5bmMgc3RhcnR1cCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1N0YXJ0aW5nIFZTIENvZGUnKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYGZyb206ICR7dGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFwcFJvb3R9YCk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdhcmdzOicsIHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzKTtcblxuXHRcdC8vIE1ha2Ugc3VyZSB3ZSBhc3NvY2lhdGUgdGhlIHByb2dyYW0gd2l0aCB0aGUgYXBwIHVzZXIgbW9kZWwgaWRcblx0XHQvLyBUaGlzIHdpbGwgaGVscCBXaW5kb3dzIHRvIGFzc29jaWF0ZSB0aGUgcnVubmluZyBwcm9ncmFtIHdpdGhcblx0XHQvLyBhbnkgc2hvcnRjdXQgdGhhdCBpcyBwaW5uZWQgdG8gdGhlIHRhc2tiYXIgYW5kIHByZXZlbnQgc2hvd2luZ1xuXHRcdC8vIHR3byBpY29ucyBpbiB0aGUgdGFza2JhciBmb3IgdGhlIHNhbWUgYXBwLlxuXHRcdGNvbnN0IHdpbjMyQXBwVXNlck1vZGVsSWQgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLndpbjMyQXBwVXNlck1vZGVsSWQ7XG5cdFx0aWYgKGlzV2luZG93cyAmJiB3aW4zMkFwcFVzZXJNb2RlbElkKSB7XG5cdFx0XHRhcHAuc2V0QXBwVXNlck1vZGVsSWQod2luMzJBcHBVc2VyTW9kZWxJZCk7XG5cdFx0fVxuXG5cdFx0Ly8gRml4IG5hdGl2ZSB0YWJzIG9uIG1hY09TIDEwLjEzXG5cdFx0Ly8gbWFjT1MgZW5hYmxlcyBhIGNvbXBhdGliaWxpdHkgcGF0Y2ggZm9yIGFueSBidW5kbGUgSUQgYmVnaW5uaW5nIHdpdGhcblx0XHQvLyBcImNvbS5taWNyb3NvZnQuXCIsIHdoaWNoIGJyZWFrcyBuYXRpdmUgdGFicyBmb3IgVlMgQ29kZSB3aGVuIHVzaW5nIHRoaXNcblx0XHQvLyBpZGVudGlmaWVyIChmcm9tIHRoZSBvZmZpY2lhbCBidWlsZCkuXG5cdFx0Ly8gRXhwbGljaXRseSBvcHQgb3V0IG9mIHRoZSBwYXRjaCBoZXJlIGJlZm9yZSBjcmVhdGluZyBhbnkgd2luZG93cy5cblx0XHQvLyBTZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zNTM2MSNpc3N1ZWNvbW1lbnQtMzk5Nzk0MDg1XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChpc01hY2ludG9zaCAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3aW5kb3cubmF0aXZlVGFicycpID09PSB0cnVlICYmICFzeXN0ZW1QcmVmZXJlbmNlcy5nZXRVc2VyRGVmYXVsdCgnTlNVc2VJbXByb3ZlZExheW91dFBhc3MnLCAnYm9vbGVhbicpKSB7XG5cdFx0XHRcdHN5c3RlbVByZWZlcmVuY2VzLnNldFVzZXJEZWZhdWx0KCdOU1VzZUltcHJvdmVkTGF5b3V0UGFzcycsICdib29sZWFuJywgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0fVxuXG5cdFx0Ly8gTWFpbiBwcm9jZXNzIHNlcnZlciAoZWxlY3Ryb24gSVBDIGJhc2VkKVxuXHRcdGNvbnN0IG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIgPSBuZXcgRWxlY3Ryb25JUENTZXJ2ZXIoKTtcblx0XHRFdmVudC5vbmNlKHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2Uub25XaWxsU2h1dGRvd24pKGUgPT4ge1xuXHRcdFx0aWYgKGUucmVhc29uID09PSBTaHV0ZG93blJlYXNvbi5LSUxMKSB7XG5cdFx0XHRcdC8vIFdoZW4gd2UgZ28gZG93biBhYm5vcm1hbGx5LCBtYWtlIHN1cmUgdG8gZnJlZSB1cFxuXHRcdFx0XHQvLyBhbnkgSVBDIHdlIGFjY2VwdCBmcm9tIG90aGVyIHdpbmRvd3MgdG8gcmVkdWNlXG5cdFx0XHRcdC8vIHRoZSBjaGFuY2Ugb2YgZG9pbmcgd29yayBhZnRlciB3ZSBnbyBkb3duLiBLaWxsXG5cdFx0XHRcdC8vIGlzIHNwZWNpYWwgaW4gdGhhdCBpdCBkb2VzIG5vdCBvcmRlcmx5IHNodXRkb3duXG5cdFx0XHRcdC8vIHdpbmRvd3MuXG5cdFx0XHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gUmVzb2x2ZSB1bmlxdWUgbWFjaGluZSBJRFxuXHRcdGNvbnN0IFttYWNoaW5lSWQsIHNxbUlkLCBkZXZEZXZpY2VJZF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRyZXNvbHZlTWFjaGluZUlkKHRoaXMuc3RhdGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpLFxuXHRcdFx0cmVzb2x2ZVNxbUlkKHRoaXMuc3RhdGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpLFxuXHRcdFx0cmVzb2x2ZURldkRldmljZUlkKHRoaXMuc3RhdGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpXG5cdFx0XSk7XG5cblx0XHQvLyBTaGFyZWQgcHJvY2Vzc1xuXHRcdGNvbnN0IHsgc2hhcmVkUHJvY2Vzc1JlYWR5LCBzaGFyZWRQcm9jZXNzQ2xpZW50IH0gPSB0aGlzLnNldHVwU2hhcmVkUHJvY2VzcyhtYWNoaW5lSWQsIHNxbUlkLCBkZXZEZXZpY2VJZCk7XG5cblx0XHQvLyBTZXJ2aWNlc1xuXHRcdGNvbnN0IGFwcEluc3RhbnRpYXRpb25TZXJ2aWNlID0gYXdhaXQgdGhpcy5pbml0U2VydmljZXMobWFjaGluZUlkLCBzcW1JZCwgZGV2RGV2aWNlSWQsIHNoYXJlZFByb2Nlc3NSZWFkeSk7XG5cblx0XHQvLyBFcnJvciB0ZWxlbWV0cnlcblx0XHRhcHBJbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB0aGlzLl9yZWdpc3RlcihuZXcgRXJyb3JUZWxlbWV0cnkoYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKSkpKTtcblxuXHRcdC8vIEFnZW50IEhvc3Rcblx0XHQvLyBBbHdheXMgaW5zdGFudGlhdGUgdGhlIHN0YXJ0ZXIgKyBtYW5hZ2VyLiBUaGV5IGFyZSBjaGVhcCAodGhlXG5cdFx0Ly8gY29uc3RydWN0b3JzIG9ubHkgcmVnaXN0ZXIgYW4gSVBDIGxpc3RlbmVyIGFuZCBlbWl0dGVycykgYW5kIHRoZSBhZ2VudFxuXHRcdC8vIGhvc3QgdXRpbGl0eSBwcm9jZXNzIGlzIHNwYXduZWQgbGF6aWx5IG9uIHRoZSBmaXJzdCB3aW5kb3cgY29ubmVjdGlvblxuXHRcdC8vIHJlcXVlc3QuIFRoZSByZW5kZXJlciBpcyB0aGUgZ2F0ZTogaXQgb25seSByZXF1ZXN0cyBhIGNvbm5lY3Rpb24gd2hlblxuXHRcdC8vIGBjaGF0LmFnZW50SG9zdC5lbmFibGVkYCByZXNvbHZlcyB0byBgdHJ1ZWAgYW5kIEFJIGZlYXR1cmVzIGFyZSBlbmFibGVkXG5cdFx0Ly8gdGhlcmUgKGhvbm9yaW5nIGV4cGVyaW1lbnQgb3ZlcnJpZGVzICsgcG9saWN5ICsgd2ViKSwgd2hpY2ggdGhlIG1haW5cblx0XHQvLyBwcm9jZXNzIGNhbm5vdCBmdWxseSBvYnNlcnZlLlxuXHRcdGNvbnN0IGFnZW50SG9zdFN0YXJ0ZXIgPSBuZXcgRWxlY3Ryb25BZ2VudEhvc3RTdGFydGVyKHsgbWFjaGluZUlkLCBzcW1JZCwgZGV2RGV2aWNlSWQgfSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLCB0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFwcEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFByb2Nlc3NNYW5hZ2VyLCBhZ2VudEhvc3RTdGFydGVyKSk7XG5cblx0XHQvLyBNZXRlcmVkIGNvbm5lY3Rpb24gdGVsZW1ldHJ5XG5cdFx0YXBwSW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0KGFjY2Vzc29yLmdldChJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlKSBhcyBNZXRlcmVkQ29ubmVjdGlvbk1haW5TZXJ2aWNlKS5zZXRUZWxlbWV0cnlTZXJ2aWNlKGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQXV0aCBIYW5kbGVyXG5cdFx0YXBwSW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElQcm94eUF1dGhTZXJ2aWNlKSk7XG5cblx0XHQvLyBUcmFuc2llbnQgcHJvZmlsZXMgaGFuZGxlclxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFwcEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhUHJvZmlsZXNIYW5kbGVyKSk7XG5cblx0XHQvLyBJbml0IENoYW5uZWxzXG5cdFx0YXBwSW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gdGhpcy5pbml0Q2hhbm5lbHMoYWNjZXNzb3IsIG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIsIHNoYXJlZFByb2Nlc3NDbGllbnQpKTtcblxuXHRcdC8vIFNldHVwIFByb3RvY29sIFVSTCBIYW5kbGVyc1xuXHRcdGNvbnN0IGluaXRpYWxQcm90b2NvbFVybHMgPSBhd2FpdCBhcHBJbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB0aGlzLnNldHVwUHJvdG9jb2xVcmxIYW5kbGVycyhhY2Nlc3NvciwgbWFpblByb2Nlc3NFbGVjdHJvblNlcnZlcikpO1xuXG5cdFx0Ly8gU2V0dXAgdnNjb2RlLXJlbW90ZS1yZXNvdXJjZSBwcm90b2NvbCBoYW5kbGVyXG5cdFx0dGhpcy5zZXR1cE1hbmFnZWRSZW1vdGVSZXNvdXJjZVVybEhhbmRsZXIobWFpblByb2Nlc3NFbGVjdHJvblNlcnZlcik7XG5cblx0XHQvLyBTaWduYWwgcGhhc2U6IHJlYWR5IC0gYmVmb3JlIG9wZW5pbmcgZmlyc3Qgd2luZG93XG5cdFx0dGhpcy5saWZlY3ljbGVNYWluU2VydmljZS5waGFzZSA9IExpZmVjeWNsZU1haW5QaGFzZS5SZWFkeTtcblxuXHRcdC8vIE9wZW4gV2luZG93c1xuXHRcdGF3YWl0IGFwcEluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHRoaXMub3BlbkZpcnN0V2luZG93KGFjY2Vzc29yLCBpbml0aWFsUHJvdG9jb2xVcmxzKSk7XG5cblx0XHQvLyBTaWduYWwgcGhhc2U6IGFmdGVyIHdpbmRvdyBvcGVuXG5cdFx0dGhpcy5saWZlY3ljbGVNYWluU2VydmljZS5waGFzZSA9IExpZmVjeWNsZU1haW5QaGFzZS5BZnRlcldpbmRvd09wZW47XG5cblx0XHQvLyBQb3N0IE9wZW4gV2luZG93cyBUYXNrc1xuXHRcdHRoaXMuYWZ0ZXJXaW5kb3dPcGVuKGFwcEluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdC8vIFNldCBsaWZlY3ljbGUgcGhhc2UgdG8gYEV2ZW50dWFsbHlgIGFmdGVyIGEgc2hvcnQgZGVsYXkgYW5kIHdoZW4gaWRsZSAobWluIDIuNXNlYywgbWF4IDVzZWMpXG5cdFx0Y29uc3QgZXZlbnR1YWxseVBoYXNlU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocnVuV2hlbkdsb2JhbElkbGUoKCkgPT4ge1xuXG5cdFx0XHRcdC8vIFNpZ25hbCBwaGFzZTogZXZlbnR1YWxseVxuXHRcdFx0XHR0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLnBoYXNlID0gTGlmZWN5Y2xlTWFpblBoYXNlLkV2ZW50dWFsbHk7XG5cblx0XHRcdFx0Ly8gRXZlbnR1YWxseSBQb3N0IE9wZW4gV2luZG93IFRhc2tzXG5cdFx0XHRcdHRoaXMuZXZlbnR1YWxseUFmdGVyV2luZG93T3BlbihhcHBJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHR9LCAyNTAwKSk7XG5cdFx0fSwgMjUwMCkpO1xuXHRcdGV2ZW50dWFsbHlQaGFzZVNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZXR1cFByb3RvY29sVXJsSGFuZGxlcnMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXI6IEVsZWN0cm9uSVBDU2VydmVyKTogUHJvbWlzZTxJSW5pdGlhbFByb3RvY29sVXJscyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHdpbmRvd3NNYWluU2VydmljZSA9IHRoaXMud2luZG93c01haW5TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXaW5kb3dzTWFpblNlcnZpY2UpO1xuXHRcdGNvbnN0IHVybFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVSTFNlcnZpY2UpO1xuXHRcdGNvbnN0IG5hdGl2ZUhvc3RNYWluU2VydmljZSA9IHRoaXMubmF0aXZlSG9zdE1haW5TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOYXRpdmVIb3N0TWFpblNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ01haW5TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dNYWluU2VydmljZSk7XG5cblx0XHQvLyBJbnN0YWxsIFVSTCBoYW5kbGVycyB0aGF0IGRlYWwgd2l0aCBwcm90b2NsIFVSTHMgZWl0aGVyXG5cdFx0Ly8gZnJvbSB0aGlzIHByb2Nlc3MgYnkgb3BlbmluZyB3aW5kb3dzIGFuZC9vciBieSBmb3J3YXJkaW5nXG5cdFx0Ly8gdGhlIFVSTHMgaW50byBhIHdpbmRvdyBwcm9jZXNzIHRvIGJlIGhhbmRsZWQgdGhlcmUuXG5cblx0XHRjb25zdCBhcHAgPSB0aGlzO1xuXHRcdHVybFNlcnZpY2UucmVnaXN0ZXJIYW5kbGVyKHtcblx0XHRcdGFzeW5jIGhhbmRsZVVSTCh1cmk6IFVSSSwgb3B0aW9ucz86IElPcGVuVVJMT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdFx0XHRyZXR1cm4gYXBwLmhhbmRsZVByb3RvY29sVXJsKHdpbmRvd3NNYWluU2VydmljZSwgZGlhbG9nTWFpblNlcnZpY2UsIHVybFNlcnZpY2UsIHVyaSwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBhY3RpdmVXaW5kb3dNYW5hZ2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGl2ZVdpbmRvd01hbmFnZXIoe1xuXHRcdFx0b25EaWRPcGVuTWFpbldpbmRvdzogbmF0aXZlSG9zdE1haW5TZXJ2aWNlLm9uRGlkT3Blbk1haW5XaW5kb3csXG5cdFx0XHRvbkRpZEZvY3VzTWFpbldpbmRvdzogbmF0aXZlSG9zdE1haW5TZXJ2aWNlLm9uRGlkRm9jdXNNYWluV2luZG93LFxuXHRcdFx0Z2V0QWN0aXZlV2luZG93SWQ6ICgpID0+IG5hdGl2ZUhvc3RNYWluU2VydmljZS5nZXRBY3RpdmVXaW5kb3dJZCgtMSlcblx0XHR9KSk7XG5cdFx0Y29uc3QgYWN0aXZlV2luZG93Um91dGVyID0gbmV3IFN0YXRpY1JvdXRlcihjdHggPT4gYWN0aXZlV2luZG93TWFuYWdlci5nZXRBY3RpdmVDbGllbnRJZCgpLnRoZW4oaWQgPT4gY3R4ID09PSBpZCkpO1xuXHRcdGNvbnN0IHVybEhhbmRsZXJSb3V0ZXIgPSBuZXcgVVJMSGFuZGxlclJvdXRlcihhY3RpdmVXaW5kb3dSb3V0ZXIsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0Y29uc3QgdXJsSGFuZGxlckNoYW5uZWwgPSBtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLmdldENoYW5uZWwoJ3VybEhhbmRsZXInLCB1cmxIYW5kbGVyUm91dGVyKTtcblx0XHR1cmxTZXJ2aWNlLnJlZ2lzdGVySGFuZGxlcihuZXcgVVJMSGFuZGxlckNoYW5uZWxDbGllbnQodXJsSGFuZGxlckNoYW5uZWwpKTtcblxuXHRcdGNvbnN0IGluaXRpYWxQcm90b2NvbFVybHMgPSBhd2FpdCB0aGlzLnJlc29sdmVJbml0aWFsUHJvdG9jb2xVcmxzKHdpbmRvd3NNYWluU2VydmljZSwgZGlhbG9nTWFpblNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG5ldyBFbGVjdHJvblVSTExpc3RlbmVyKGluaXRpYWxQcm90b2NvbFVybHM/LnVybHMsIHVybFNlcnZpY2UsIHdpbmRvd3NNYWluU2VydmljZSwgdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpKTtcblxuXHRcdHJldHVybiBpbml0aWFsUHJvdG9jb2xVcmxzO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXR1cE1hbmFnZWRSZW1vdGVSZXNvdXJjZVVybEhhbmRsZXIobWFpblByb2Nlc3NFbGVjdHJvblNlcnZlcjogRWxlY3Ryb25JUENTZXJ2ZXIpIHtcblx0XHRjb25zdCBub3RGb3VuZCA9ICgpOiBFbGVjdHJvbi5Qcm90b2NvbFJlc3BvbnNlID0+ICh7IHN0YXR1c0NvZGU6IDQwNCwgZGF0YTogJ05vdCBmb3VuZCcgfSk7XG5cdFx0Y29uc3QgcmVtb3RlUmVzb3VyY2VDaGFubmVsID0gbmV3IExhenkoKCkgPT4gbWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5nZXRDaGFubmVsKFxuXHRcdFx0Tk9ERV9SRU1PVEVfUkVTT1VSQ0VfQ0hBTk5FTF9OQU1FLFxuXHRcdFx0bmV3IE5vZGVSZW1vdGVSZXNvdXJjZVJvdXRlcigpLFxuXHRcdCkpO1xuXG5cdFx0cHJvdG9jb2wucmVnaXN0ZXJCdWZmZXJQcm90b2NvbChTY2hlbWFzLnZzY29kZU1hbmFnZWRSZW1vdGVSZXNvdXJjZSwgKHJlcXVlc3QsIGNhbGxiYWNrKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UocmVxdWVzdC51cmwpO1xuXHRcdFx0aWYgKCF1cmwuYXV0aG9yaXR5LnN0YXJ0c1dpdGgoJ3dpbmRvdzonKSkge1xuXHRcdFx0XHRyZXR1cm4gY2FsbGJhY2sobm90Rm91bmQoKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJlbW90ZVJlc291cmNlQ2hhbm5lbC52YWx1ZS5jYWxsPE5vZGVSZW1vdGVSZXNvdXJjZVJlc3BvbnNlPihOT0RFX1JFTU9URV9SRVNPVVJDRV9JUENfTUVUSE9EX05BTUUsIFt1cmxdKS50aGVuKFxuXHRcdFx0XHRyID0+IGNhbGxiYWNrKHsgLi4uciwgZGF0YTogQnVmZmVyLmZyb20oci5ib2R5LCAnYmFzZTY0JykgfSksXG5cdFx0XHRcdGVyciA9PiB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ2Vycm9yIGRpc3BhdGNoaW5nIHJlbW90ZSByZXNvdXJjZSBjYWxsJywgZXJyKTtcblx0XHRcdFx0XHRjYWxsYmFjayh7IHN0YXR1c0NvZGU6IDUwMCwgZGF0YTogU3RyaW5nKGVycikgfSk7XG5cdFx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlSW5pdGlhbFByb3RvY29sVXJscyh3aW5kb3dzTWFpblNlcnZpY2U6IElXaW5kb3dzTWFpblNlcnZpY2UsIGRpYWxvZ01haW5TZXJ2aWNlOiBJRGlhbG9nTWFpblNlcnZpY2UpOiBQcm9taXNlPElJbml0aWFsUHJvdG9jb2xVcmxzIHwgdW5kZWZpbmVkPiB7XG5cblx0XHQvKipcblx0XHQgKiBQcm90b2NvbCBVUkwgaGFuZGxpbmcgb24gc3RhcnR1cCBpcyBjb21wbGV4LCByZWZlciB0b1xuXHRcdCAqIHtAbGluayBJSW5pdGlhbFByb3RvY29sVXJsc30gZm9yIGFuIGV4cGxhaW5lci5cblx0XHQgKi9cblxuXHRcdC8vIFdpbmRvd3MvTGludXg6IHByb3RvY29sIGhhbmRsZXIgaW52b2tlcyBDTEkgd2l0aCAtLW9wZW4tdXJsXG5cdFx0Y29uc3QgcHJvdG9jb2xVcmxzRnJvbUNvbW1hbmRMaW5lID0gdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3NbJ29wZW4tdXJsJ10gPyB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncy5fdXJscyB8fCBbXSA6IFtdO1xuXHRcdGlmIChwcm90b2NvbFVybHNGcm9tQ29tbWFuZExpbmUubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdhcHAjcmVzb2x2ZUluaXRpYWxQcm90b2NvbFVybHMoKSBwcm90b2NvbCB1cmxzIGZyb20gY29tbWFuZCBsaW5lOicsIHByb3RvY29sVXJsc0Zyb21Db21tYW5kTGluZSk7XG5cdFx0fVxuXG5cdFx0Ly8gbWFjT1M6IG9wZW4tdXJsIGV2ZW50cyB0aGF0IHdlcmUgcmVjZWl2ZWQgYmVmb3JlIHRoZSBhcHAgaXMgcmVhZHlcblx0XHRjb25zdCBwcm90b2NvbFVybHNGcm9tRXZlbnQgPSAoKGdsb2JhbCBhcyB7IGdldE9wZW5VcmxzPzogKCkgPT4gc3RyaW5nW10gfSkuZ2V0T3BlblVybHM/LigpIHx8IFtdKTtcblx0XHRpZiAocHJvdG9jb2xVcmxzRnJvbUV2ZW50Lmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgYXBwI3Jlc29sdmVJbml0aWFsUHJvdG9jb2xVcmxzKCkgcHJvdG9jb2wgdXJscyBmcm9tIG1hY09TICdvcGVuLXVybCcgZXZlbnQ6YCwgcHJvdG9jb2xVcmxzRnJvbUV2ZW50KTtcblx0XHR9XG5cblx0XHRpZiAocHJvdG9jb2xVcmxzRnJvbUNvbW1hbmRMaW5lLmxlbmd0aCArIHByb3RvY29sVXJsc0Zyb21FdmVudC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdG9jb2xVcmxzID0gW1xuXHRcdFx0Li4ucHJvdG9jb2xVcmxzRnJvbUNvbW1hbmRMaW5lLFxuXHRcdFx0Li4ucHJvdG9jb2xVcmxzRnJvbUV2ZW50XG5cdFx0XS5tYXAodXJsID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiB7IHVyaTogVVJJLnBhcnNlKHVybCksIG9yaWdpbmFsVXJsOiB1cmwgfTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ2FwcCNyZXNvbHZlSW5pdGlhbFByb3RvY29sVXJscygpIHByb3RvY29sIHVybCBmYWlsZWQgdG8gcGFyc2U6JywgdXJsKTtcblxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb3BlbmFibGVzOiBJV2luZG93T3BlbmFibGVbXSA9IFtdO1xuXHRcdGNvbnN0IHVybHM6IElQcm90b2NvbFVybFtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHByb3RvY29sVXJsIG9mIHByb3RvY29sVXJscykge1xuXHRcdFx0aWYgKCFwcm90b2NvbFVybCkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gaW52YWxpZFxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB3aW5kb3dPcGVuYWJsZSA9IHRoaXMuZ2V0V2luZG93T3BlbmFibGVGcm9tUHJvdG9jb2xVcmwocHJvdG9jb2xVcmwudXJpKTtcblx0XHRcdGlmICh3aW5kb3dPcGVuYWJsZSkge1xuXHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5zaG91bGRCbG9ja09wZW5hYmxlKHdpbmRvd09wZW5hYmxlLCB3aW5kb3dzTWFpblNlcnZpY2UsIGRpYWxvZ01haW5TZXJ2aWNlKSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnYXBwI3Jlc29sdmVJbml0aWFsUHJvdG9jb2xVcmxzKCkgcHJvdG9jb2wgdXJsIHdhcyBibG9ja2VkOicsIHByb3RvY29sVXJsLnVyaS50b1N0cmluZyh0cnVlKSk7XG5cblx0XHRcdFx0XHRjb250aW51ZTsgLy8gYmxvY2tlZFxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnYXBwI3Jlc29sdmVJbml0aWFsUHJvdG9jb2xVcmxzKCkgcHJvdG9jb2wgdXJsIHdpbGwgYmUgaGFuZGxlZCBhcyB3aW5kb3cgdG8gb3BlbjonLCBwcm90b2NvbFVybC51cmkudG9TdHJpbmcodHJ1ZSksIHdpbmRvd09wZW5hYmxlKTtcblxuXHRcdFx0XHRcdG9wZW5hYmxlcy5wdXNoKHdpbmRvd09wZW5hYmxlKTsgLy8gaGFuZGxlZCBhcyB3aW5kb3cgdG8gb3BlblxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ2FwcCNyZXNvbHZlSW5pdGlhbFByb3RvY29sVXJscygpIHByb3RvY29sIHVybCB3aWxsIGJlIHBhc3NlZCB0byBhY3RpdmUgd2luZG93IGZvciBoYW5kbGluZzonLCBwcm90b2NvbFVybC51cmkudG9TdHJpbmcodHJ1ZSkpO1xuXG5cdFx0XHRcdHVybHMucHVzaChwcm90b2NvbFVybCk7IC8vIGhhbmRsZWQgd2l0aGluIGFjdGl2ZSB3aW5kb3dcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyB1cmxzLCBvcGVuYWJsZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvdWxkQmxvY2tPcGVuYWJsZShvcGVuYWJsZTogSVdpbmRvd09wZW5hYmxlLCB3aW5kb3dzTWFpblNlcnZpY2U6IElXaW5kb3dzTWFpblNlcnZpY2UsIGRpYWxvZ01haW5TZXJ2aWNlOiBJRGlhbG9nTWFpblNlcnZpY2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgb3BlbmFibGVVcmk6IFVSSTtcblx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXHRcdGlmIChpc1dvcmtzcGFjZVRvT3BlbihvcGVuYWJsZSkpIHtcblx0XHRcdG9wZW5hYmxlVXJpID0gb3BlbmFibGUud29ya3NwYWNlVXJpO1xuXHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjb25maXJtT3Blbk1lc3NhZ2VXb3Jrc3BhY2UnLCBcIkFuIGV4dGVybmFsIGFwcGxpY2F0aW9uIHdhbnRzIHRvIG9wZW4gJ3swfScgaW4gezF9LiBEbyB5b3Ugd2FudCB0byBvcGVuIHRoaXMgd29ya3NwYWNlIGZpbGU/XCIsIG9wZW5hYmxlVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gZ2V0UGF0aExhYmVsKG9wZW5hYmxlVXJpLCB7IG9zOiBPUywgdGlsZGlmeTogdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0pIDogb3BlbmFibGVVcmkudG9TdHJpbmcodHJ1ZSksIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KTtcblx0XHR9IGVsc2UgaWYgKGlzRm9sZGVyVG9PcGVuKG9wZW5hYmxlKSkge1xuXHRcdFx0b3BlbmFibGVVcmkgPSBvcGVuYWJsZS5mb2xkZXJVcmk7XG5cdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2NvbmZpcm1PcGVuTWVzc2FnZUZvbGRlcicsIFwiQW4gZXh0ZXJuYWwgYXBwbGljYXRpb24gd2FudHMgdG8gb3BlbiAnezB9JyBpbiB7MX0uIERvIHlvdSB3YW50IHRvIG9wZW4gdGhpcyBmb2xkZXI/XCIsIG9wZW5hYmxlVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gZ2V0UGF0aExhYmVsKG9wZW5hYmxlVXJpLCB7IG9zOiBPUywgdGlsZGlmeTogdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0pIDogb3BlbmFibGVVcmkudG9TdHJpbmcodHJ1ZSksIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3BlbmFibGVVcmkgPSBvcGVuYWJsZS5maWxlVXJpO1xuXHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjb25maXJtT3Blbk1lc3NhZ2VGaWxlT3JGb2xkZXInLCBcIkFuIGV4dGVybmFsIGFwcGxpY2F0aW9uIHdhbnRzIHRvIG9wZW4gJ3swfScgaW4gezF9LiBEbyB5b3Ugd2FudCB0byBvcGVuIHRoaXMgZmlsZSBvciBmb2xkZXI/XCIsIG9wZW5hYmxlVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gZ2V0UGF0aExhYmVsKG9wZW5hYmxlVXJpLCB7IG9zOiBPUywgdGlsZGlmeTogdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0pIDogb3BlbmFibGVVcmkudG9TdHJpbmcodHJ1ZSksIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KTtcblx0XHR9XG5cblx0XHRpZiAob3BlbmFibGVVcmkuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUgJiYgb3BlbmFibGVVcmkuc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZVJlbW90ZSkge1xuXG5cdFx0XHQvLyAhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhXG5cdFx0XHQvL1xuXHRcdFx0Ly8gTk9URTogd2UgY3VycmVudGx5IG9ubHkgYXNrIGZvciBjb25maXJtYXRpb24gZm9yIGBmaWxlYCBhbmQgYHZzY29kZS1yZW1vdGVgXG5cdFx0XHQvLyBhdXRob3JpdGllcyBoZXJlLiBUaGVyZSBpcyBhbiBhZGRpdGlvbmFsIGNvbmZpcm1hdGlvbiBmb3IgYGV4dGVuc2lvbi5pZGBcblx0XHRcdC8vIGF1dGhvcml0aWVzIGZyb20gd2l0aGluIHRoZSB3aW5kb3cuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gSUYgWU9VIEFSRSBQTEFOTklORyBPTiBBRERJTkcgQU5PVEhFUiBBVVRIT1JJVFkgSEVSRSwgTUFLRSBTVVJFIFRPIEFMU09cblx0XHRcdC8vIEFERCBJVCBUTyBUSEUgQ09ORklSTUFUSU9OIENPREUgQkVMT1cgT1IgSU5TSURFIFRIRSBXSU5ET1chXG5cdFx0XHQvL1xuXHRcdFx0Ly8gISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhIVxuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXNrRm9yQ29uZmlybWF0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx1bmtub3duPihDb2RlQXBwbGljYXRpb24uU0VDVVJJVFlfUFJPVE9DT0xfSEFORExJTkdfQ09ORklSTUFUSU9OX1NFVFRJTkdfS0VZW29wZW5hYmxlVXJpLnNjaGVtZV0pO1xuXHRcdGlmIChhc2tGb3JDb25maXJtYXRpb24gPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIG5vdCBibG9ja2VkIHZpYSBzZXR0aW5nc1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgcmVzcG9uc2UsIGNoZWNrYm94Q2hlY2tlZCB9ID0gYXdhaXQgZGlhbG9nTWFpblNlcnZpY2Uuc2hvd01lc3NhZ2VCb3goe1xuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSh7IGtleTogJ29wZW4nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZZZXNcIiksXG5cdFx0XHRcdGxvY2FsaXplKHsga2V5OiAnY2FuY2VsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTm9cIilcblx0XHRcdF0sXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY29uZmlybU9wZW5EZXRhaWwnLCBcIklmIHlvdSBkaWQgbm90IGluaXRpYXRlIHRoaXMgcmVxdWVzdCwgaXQgbWF5IHJlcHJlc2VudCBhbiBhdHRlbXB0ZWQgYXR0YWNrIG9uIHlvdXIgc3lzdGVtLiBVbmxlc3MgeW91IHRvb2sgYW4gZXhwbGljaXQgYWN0aW9uIHRvIGluaXRpYXRlIHRoaXMgcmVxdWVzdCwgeW91IHNob3VsZCBwcmVzcyAnTm8nXCIpLFxuXHRcdFx0Y2hlY2tib3hMYWJlbDogb3BlbmFibGVVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgPyBsb2NhbGl6ZSgnZG9Ob3RBc2tBZ2FpbkxvY2FsJywgXCJBbGxvdyBvcGVuaW5nIGxvY2FsIHBhdGhzIHdpdGhvdXQgYXNraW5nXCIpIDogbG9jYWxpemUoJ2RvTm90QXNrQWdhaW5SZW1vdGUnLCBcIkFsbG93IG9wZW5pbmcgcmVtb3RlIHBhdGhzIHdpdGhvdXQgYXNraW5nXCIpLFxuXHRcdFx0Y2FuY2VsSWQ6IDFcblx0XHR9KTtcblxuXHRcdGlmIChyZXNwb25zZSAhPT0gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIGJsb2NrZWQgYnkgdXNlciBjaG9pY2Vcblx0XHR9XG5cblx0XHRpZiAoY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHQvLyBEdWUgdG8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE5NTQzNiwgd2UgY2FuIG9ubHlcblx0XHRcdC8vIHVwZGF0ZSBzZXR0aW5ncyBmcm9tIHdpdGhpbiBhIHdpbmRvdy4gQnV0IHdlIGRvIG5vdCBrbm93IGlmIGEgd2luZG93XG5cdFx0XHQvLyBpcyBhYm91dCB0byBvcGVuIG9yIGNhbiBhbHJlYWR5IGhhbmRsZSB0aGUgcmVxdWVzdCwgc28gd2UgaGF2ZSB0byBzZW5kXG5cdFx0XHQvLyB0byBhbnkgY3VycmVudCB3aW5kb3cgYW5kIGFueSBuZXdseSBvcGVuaW5nIHdpbmRvdy5cblx0XHRcdGNvbnN0IHJlcXVlc3QgPSB7IGNoYW5uZWw6ICd2c2NvZGU6ZGlzYWJsZVByb21wdEZvclByb3RvY29sSGFuZGxpbmcnLCBhcmdzOiBvcGVuYWJsZVVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/ICdsb2NhbCcgOiAncmVtb3RlJyB9O1xuXHRcdFx0d2luZG93c01haW5TZXJ2aWNlLnNlbmRUb0ZvY3VzZWQocmVxdWVzdC5jaGFubmVsLCByZXF1ZXN0LmFyZ3MpO1xuXHRcdFx0d2luZG93c01haW5TZXJ2aWNlLnNlbmRUb09wZW5pbmdXaW5kb3cocmVxdWVzdC5jaGFubmVsLCByZXF1ZXN0LmFyZ3MpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTsgLy8gbm90IGJsb2NrZWQgYnkgdXNlciBjaG9pY2Vcblx0fVxuXG5cdHByaXZhdGUgZ2V0V2luZG93T3BlbmFibGVGcm9tUHJvdG9jb2xVcmwodXJpOiBVUkkpOiBJV2luZG93T3BlbmFibGUgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdXJpLnBhdGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gRmlsZSBwYXRoXG5cdFx0aWYgKHVyaS5hdXRob3JpdHkgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5maWxlKHVyaS5mc1BhdGgpO1xuXG5cdFx0XHRpZiAoaGFzV29ya3NwYWNlRmlsZUV4dGVuc2lvbihmaWxlVXJpKSkge1xuXHRcdFx0XHRyZXR1cm4geyB3b3Jrc3BhY2VVcmk6IGZpbGVVcmkgfTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgZmlsZVVyaSB9O1xuXHRcdH1cblxuXHRcdC8vIFJlbW90ZSBwYXRoXG5cdFx0ZWxzZSBpZiAodXJpLmF1dGhvcml0eSA9PT0gU2NoZW1hcy52c2NvZGVSZW1vdGUpIHtcblxuXHRcdFx0Ly8gRXhhbXBsZSBjb252ZXJzaW9uOlxuXHRcdFx0Ly8gRnJvbTogdnNjb2RlOi8vdnNjb2RlLXJlbW90ZS93c2wrdWJ1bnR1L21udC9jL0dpdERldmVsb3BtZW50L21vbmFjb1xuXHRcdFx0Ly8gICBUbzogdnNjb2RlLXJlbW90ZTovL3dzbCt1YnVudHUvbW50L2MvR2l0RGV2ZWxvcG1lbnQvbW9uYWNvXG5cblx0XHRcdGNvbnN0IHNlY29uZFNsYXNoID0gdXJpLnBhdGguaW5kZXhPZihwb3NpeC5zZXAsIDEgLyogc2tpcCBvdmVyIHRoZSBsZWFkaW5nIHNsYXNoICovKTtcblx0XHRcdGxldCBhdXRob3JpdHk6IHN0cmluZztcblx0XHRcdGxldCBwYXRoOiBzdHJpbmc7XG5cdFx0XHRpZiAoc2Vjb25kU2xhc2ggIT09IC0xKSB7XG5cdFx0XHRcdGF1dGhvcml0eSA9IHVyaS5wYXRoLnN1YnN0cmluZygxLCBzZWNvbmRTbGFzaCk7XG5cdFx0XHRcdHBhdGggPSB1cmkucGF0aC5zdWJzdHJpbmcoc2Vjb25kU2xhc2gpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXV0aG9yaXR5ID0gdXJpLnBhdGguc3Vic3RyaW5nKDEpO1xuXHRcdFx0XHRwYXRoID0gJy8nO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcXVlcnkgPSB1cmkucXVlcnk7XG5cdFx0XHRjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHVyaS5xdWVyeSk7XG5cdFx0XHRpZiAocGFyYW1zLmdldCgnd2luZG93SWQnKSA9PT0gJ19ibGFuaycpIHtcblx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRvIHVuc2V0IGFueSBgd2luZG93SWQ9X2JsYW5rYCBoZXJlXG5cdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xOTE5MDJcblx0XHRcdFx0cGFyYW1zLmRlbGV0ZSgnd2luZG93SWQnKTtcblx0XHRcdFx0cXVlcnkgPSBwYXJhbXMudG9TdHJpbmcoKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVtb3RlVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlUmVtb3RlLCBhdXRob3JpdHksIHBhdGgsIHF1ZXJ5LCBmcmFnbWVudDogdXJpLmZyYWdtZW50IH0pO1xuXG5cdFx0XHRpZiAoaGFzV29ya3NwYWNlRmlsZUV4dGVuc2lvbihwYXRoKSkge1xuXHRcdFx0XHRyZXR1cm4geyB3b3Jrc3BhY2VVcmk6IHJlbW90ZVVyaSB9O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoLzpbXFxkXSskLy50ZXN0KHBhdGgpKSB7XG5cdFx0XHRcdC8vIHBhdGggd2l0aCA6bGluZTpjb2x1bW4gc3ludGF4XG5cdFx0XHRcdHJldHVybiB7IGZpbGVVcmk6IHJlbW90ZVVyaSB9O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBmb2xkZXJVcmk6IHJlbW90ZVVyaSB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVQcm90b2NvbFVybCh3aW5kb3dzTWFpblNlcnZpY2U6IElXaW5kb3dzTWFpblNlcnZpY2UsIGRpYWxvZ01haW5TZXJ2aWNlOiBJRGlhbG9nTWFpblNlcnZpY2UsIHVybFNlcnZpY2U6IElVUkxTZXJ2aWNlLCB1cmk6IFVSSSwgb3B0aW9ucz86IElPcGVuVVJMT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnYXBwI2hhbmRsZVByb3RvY29sVXJsKCk6JywgdXJpLnRvU3RyaW5nKHRydWUpLCBvcHRpb25zKTtcblxuXHRcdC8vIFN1cHBvcnQgJ3dvcmtzcGFjZScgVVJMcyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyNDI2Mylcblx0XHRpZiAodXJpLnNjaGVtZSA9PT0gdGhpcy5wcm9kdWN0U2VydmljZS51cmxQcm90b2NvbCAmJiB1cmkucGF0aCA9PT0gJ3dvcmtzcGFjZScpIHtcblx0XHRcdHVyaSA9IHVyaS53aXRoKHtcblx0XHRcdFx0YXV0aG9yaXR5OiBTY2hlbWFzLmZpbGUsXG5cdFx0XHRcdHBhdGg6IFVSSS5wYXJzZSh1cmkucXVlcnkpLnBhdGgsXG5cdFx0XHRcdHF1ZXJ5OiAnJ1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0bGV0IHNob3VsZE9wZW5Jbk5ld1dpbmRvdyA9IGZhbHNlO1xuXG5cdFx0Ly8gV2Ugc2hvdWxkIGhhbmRsZSB0aGUgVVJJIGluIGEgbmV3IHdpbmRvdyBpZiB0aGUgVVJMIGNvbnRhaW5zIGB3aW5kb3dJZD1fYmxhbmtgXG5cdFx0Y29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh1cmkucXVlcnkpO1xuXHRcdGlmIChwYXJhbXMuZ2V0KCd3aW5kb3dJZCcpID09PSAnX2JsYW5rJykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBhcHAjaGFuZGxlUHJvdG9jb2xVcmwoKSBmb3VuZCAnd2luZG93SWQ9X2JsYW5rJyBhcyBwYXJhbWV0ZXIsIHNldHRpbmcgc2hvdWxkT3BlbkluTmV3V2luZG93PXRydWU6YCwgdXJpLnRvU3RyaW5nKHRydWUpKTtcblxuXHRcdFx0cGFyYW1zLmRlbGV0ZSgnd2luZG93SWQnKTtcblx0XHRcdHVyaSA9IHVyaS53aXRoKHsgcXVlcnk6IHBhcmFtcy50b1N0cmluZygpIH0pO1xuXG5cdFx0XHRzaG91bGRPcGVuSW5OZXdXaW5kb3cgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIG9yIGlmIG5vIHdpbmRvdyBpcyBvcGVuIChtYWNPUyBvbmx5KVxuXHRcdGVsc2UgaWYgKGlzTWFjaW50b3NoICYmIHdpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dDb3VudCgpID09PSAwKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYGFwcCNoYW5kbGVQcm90b2NvbFVybCgpIHJ1bm5pbmcgb24gbWFjT1Mgd2l0aCBubyB3aW5kb3cgb3Blbiwgc2V0dGluZyBzaG91bGRPcGVuSW5OZXdXaW5kb3c9dHJ1ZTpgLCB1cmkudG9TdHJpbmcodHJ1ZSkpO1xuXG5cdFx0XHRzaG91bGRPcGVuSW5OZXdXaW5kb3cgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFBhc3MgYWxvbmcgd2hldGhlciB0aGUgYXBwbGljYXRpb24gaXMgYmVpbmcgb3BlbmVkIHZpYSBhIENvbnRpbnVlIE9uIGZsb3dcblx0XHRjb25zdCBjb250aW51ZU9uID0gcGFyYW1zLmdldCgnY29udGludWVPbicpO1xuXHRcdGlmIChjb250aW51ZU9uICE9PSBudWxsKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYGFwcCNoYW5kbGVQcm90b2NvbFVybCgpIGZvdW5kICdjb250aW51ZU9uJyBhcyBwYXJhbWV0ZXI6YCwgdXJpLnRvU3RyaW5nKHRydWUpKTtcblxuXHRcdFx0cGFyYW1zLmRlbGV0ZSgnY29udGludWVPbicpO1xuXHRcdFx0dXJpID0gdXJpLndpdGgoeyBxdWVyeTogcGFyYW1zLnRvU3RyaW5nKCkgfSk7XG5cblx0XHRcdHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5jb250aW51ZU9uID0gY29udGludWVPbiA/PyB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gRXh0cmFjdCBzZXNzaW9uIHBhcmFtZXRlciB0byBvcGVuIGEgc3BlY2lmaWMgY2hhdCBzZXNzaW9uIGluIHRoZSB0YXJnZXQgd2luZG93XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHBhcmFtcy5nZXQoJ3Nlc3Npb24nKTtcblx0XHRpZiAoc2Vzc2lvbiAhPT0gbnVsbCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBhcHAjaGFuZGxlUHJvdG9jb2xVcmwoKSBmb3VuZCAnc2Vzc2lvbicgYXMgcGFyYW1ldGVyOmAsIHVyaS50b1N0cmluZyh0cnVlKSk7XG5cblx0XHRcdHBhcmFtcy5kZWxldGUoJ3Nlc3Npb24nKTtcblx0XHRcdHVyaSA9IHVyaS53aXRoKHsgcXVlcnk6IHBhcmFtcy50b1N0cmluZygpIH0pO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoZSBwcm90b2NvbCBVUkwgaXMgYSB3aW5kb3cgb3BlbmFibGUgdG8gb3Blbi4uLlxuXHRcdGNvbnN0IHdpbmRvd09wZW5hYmxlRnJvbVByb3RvY29sVXJsID0gdGhpcy5nZXRXaW5kb3dPcGVuYWJsZUZyb21Qcm90b2NvbFVybCh1cmkpO1xuXHRcdGlmICh3aW5kb3dPcGVuYWJsZUZyb21Qcm90b2NvbFVybCkge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuc2hvdWxkQmxvY2tPcGVuYWJsZSh3aW5kb3dPcGVuYWJsZUZyb21Qcm90b2NvbFVybCwgd2luZG93c01haW5TZXJ2aWNlLCBkaWFsb2dNYWluU2VydmljZSkpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdhcHAjaGFuZGxlUHJvdG9jb2xVcmwoKSBwcm90b2NvbCB1cmwgd2FzIGJsb2NrZWQ6JywgdXJpLnRvU3RyaW5nKHRydWUpKTtcblxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gSWYgb3BlbmFibGUgc2hvdWxkIGJlIGJsb2NrZWQsIGJlaGF2ZSBhcyBpZiBpdCdzIGhhbmRsZWRcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnYXBwI2hhbmRsZVByb3RvY29sVXJsKCkgb3BlbmluZyBwcm90b2NvbCB1cmwgYXMgd2luZG93OicsIHdpbmRvd09wZW5hYmxlRnJvbVByb3RvY29sVXJsLCB1cmkudG9TdHJpbmcodHJ1ZSkpO1xuXG5cdFx0XHRcdGNvbnN0IHdpbmRvdyA9IChhd2FpdCB3aW5kb3dzTWFpblNlcnZpY2Uub3Blbih7XG5cdFx0XHRcdFx0Y29udGV4dDogT3BlbkNvbnRleHQuTElOSyxcblx0XHRcdFx0XHRjbGk6IHsgLi4udGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3MgfSxcblx0XHRcdFx0XHR1cmlzVG9PcGVuOiBbd2luZG93T3BlbmFibGVGcm9tUHJvdG9jb2xVcmxdLFxuXHRcdFx0XHRcdGZvcmNlTmV3V2luZG93OiBzaG91bGRPcGVuSW5OZXdXaW5kb3csXG5cdFx0XHRcdFx0Z290b0xpbmVNb2RlOiB0cnVlXG5cdFx0XHRcdFx0Ly8gcmVtb3RlQXV0aG9yaXR5OiB3aWxsIGJlIGRldGVybWluZWQgYmFzZWQgb24gd2luZG93T3BlbmFibGVGcm9tUHJvdG9jb2xVcmxcblx0XHRcdFx0fSkpLmF0KDApO1xuXG5cdFx0XHRcdHdpbmRvdz8uZm9jdXMoKTsgLy8gdGhpcyBzaG91bGQgaGVscCBlbnN1cmluZyB0aGF0IHRoZSByaWdodCB3aW5kb3cgZ2V0cyBmb2N1cyB3aGVuIG11bHRpcGxlIGFyZSBvcGVuZWRcblxuXHRcdFx0XHQvLyBPcGVuIGNoYXQgc2Vzc2lvbiBpbiB0aGUgdGFyZ2V0IHdpbmRvdyBpZiByZXF1ZXN0ZWRcblx0XHRcdFx0aWYgKHdpbmRvdyAmJiBzZXNzaW9uKSB7XG5cdFx0XHRcdFx0d2luZG93LnNlbmRXaGVuUmVhZHkoJ3ZzY29kZTpvcGVuQ2hhdFNlc3Npb24nLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCBzZXNzaW9uKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIC4uLm9yIGlmIHdlIHNob3VsZCBvcGVuIGluIGEgbmV3IHdpbmRvdyBhbmQgdGhlbiBoYW5kbGUgaXQgd2l0aGluIHRoYXQgd2luZG93XG5cdFx0aWYgKHNob3VsZE9wZW5Jbk5ld1dpbmRvdykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdhcHAjaGFuZGxlUHJvdG9jb2xVcmwoKSBvcGVuaW5nIGVtcHR5IHdpbmRvdyBhbmQgcGFzc2luZyBpbiBwcm90b2NvbCB1cmw6JywgdXJpLnRvU3RyaW5nKHRydWUpKTtcblxuXHRcdFx0Y29uc3Qgd2luZG93ID0gKGF3YWl0IHdpbmRvd3NNYWluU2VydmljZS5vcGVuKHtcblx0XHRcdFx0Y29udGV4dDogT3BlbkNvbnRleHQuTElOSyxcblx0XHRcdFx0Y2xpOiB7IC4uLnRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzIH0sXG5cdFx0XHRcdGZvcmNlTmV3V2luZG93OiB0cnVlLFxuXHRcdFx0XHRmb3JjZUVtcHR5OiB0cnVlLFxuXHRcdFx0XHRnb3RvTGluZU1vZGU6IHRydWUsXG5cdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogZ2V0UmVtb3RlQXV0aG9yaXR5KHVyaSlcblx0XHRcdH0pKS5hdCgwKTtcblxuXHRcdFx0YXdhaXQgd2luZG93Py5yZWFkeSgpO1xuXG5cdFx0XHRyZXR1cm4gdXJsU2VydmljZS5vcGVuKHVyaSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdhcHAjaGFuZGxlUHJvdG9jb2xVcmwoKTogbm90IGhhbmRsZWQnLCB1cmkudG9TdHJpbmcodHJ1ZSksIG9wdGlvbnMpO1xuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXR1cFNoYXJlZFByb2Nlc3MobWFjaGluZUlkOiBzdHJpbmcsIHNxbUlkOiBzdHJpbmcsIGRldkRldmljZUlkOiBzdHJpbmcpOiB7IHNoYXJlZFByb2Nlc3NSZWFkeTogUHJvbWlzZTxNZXNzYWdlUG9ydENsaWVudD47IHNoYXJlZFByb2Nlc3NDbGllbnQ6IFByb21pc2U8TWVzc2FnZVBvcnRDbGllbnQ+IH0ge1xuXHRcdGNvbnN0IHNoYXJlZFByb2Nlc3MgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLm1haW5JbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaGFyZWRQcm9jZXNzLCBtYWNoaW5lSWQsIHNxbUlkLCBkZXZEZXZpY2VJZCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2hhcmVkUHJvY2Vzcy5vbkRpZENyYXNoKCgpID0+IHRoaXMud2luZG93c01haW5TZXJ2aWNlPy5zZW5kVG9Gb2N1c2VkKCd2c2NvZGU6cmVwb3J0U2hhcmVkUHJvY2Vzc0NyYXNoJykpKTtcblxuXHRcdGNvbnN0IHNoYXJlZFByb2Nlc3NDbGllbnQgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdNYWluLT5TaGFyZWRQcm9jZXNzI2Nvbm5lY3QnKTtcblxuXHRcdFx0Y29uc3QgcG9ydCA9IGF3YWl0IHNoYXJlZFByb2Nlc3MuY29ubmVjdCgpO1xuXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ01haW4tPlNoYXJlZFByb2Nlc3MjY29ubmVjdDogY29ubmVjdGlvbiBlc3RhYmxpc2hlZCcpO1xuXG5cdFx0XHRyZXR1cm4gbmV3IE1lc3NhZ2VQb3J0Q2xpZW50KHBvcnQsICdtYWluJyk7XG5cdFx0fSkoKTtcblxuXHRcdGNvbnN0IHNoYXJlZFByb2Nlc3NSZWFkeSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBzaGFyZWRQcm9jZXNzLndoZW5SZWFkeSgpO1xuXG5cdFx0XHRyZXR1cm4gc2hhcmVkUHJvY2Vzc0NsaWVudDtcblx0XHR9KSgpO1xuXG5cdFx0cmV0dXJuIHsgc2hhcmVkUHJvY2Vzc1JlYWR5LCBzaGFyZWRQcm9jZXNzQ2xpZW50IH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluaXRTZXJ2aWNlcyhtYWNoaW5lSWQ6IHN0cmluZywgc3FtSWQ6IHN0cmluZywgZGV2RGV2aWNlSWQ6IHN0cmluZywgc2hhcmVkUHJvY2Vzc1JlYWR5OiBQcm9taXNlPE1lc3NhZ2VQb3J0Q2xpZW50Pik6IFByb21pc2U8SUluc3RhbnRpYXRpb25TZXJ2aWNlPiB7XG5cdFx0Y29uc3Qgc2VydmljZXMgPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblxuXHRcdC8vIFVwZGF0ZVxuXHRcdHN3aXRjaCAocHJvY2Vzcy5wbGF0Zm9ybSkge1xuXHRcdFx0Y2FzZSAnd2luMzInOlxuXHRcdFx0XHRzZXJ2aWNlcy5zZXQoSVVwZGF0ZVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihXaW4zMlVwZGF0ZVNlcnZpY2UpKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ2xpbnV4Jzpcblx0XHRcdFx0aWYgKGlzTGludXhTbmFwKSB7XG5cdFx0XHRcdFx0c2VydmljZXMuc2V0KElVcGRhdGVTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoU25hcFVwZGF0ZVNlcnZpY2UsIFtwcm9jZXNzLmVudlsnU05BUCddLCBwcm9jZXNzLmVudlsnU05BUF9SRVZJU0lPTiddXSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNlcnZpY2VzLnNldChJVXBkYXRlU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKExpbnV4VXBkYXRlU2VydmljZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdkYXJ3aW4nOlxuXHRcdFx0XHRzZXJ2aWNlcy5zZXQoSVVwZGF0ZVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihEYXJ3aW5VcGRhdGVTZXJ2aWNlKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdC8vIFdpbmRvd3Ncblx0XHRzZXJ2aWNlcy5zZXQoSVdpbmRvd3NNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFdpbmRvd3NNYWluU2VydmljZSwgW21hY2hpbmVJZCwgc3FtSWQsIGRldkRldmljZUlkLCB0aGlzLnVzZXJFbnZdLCBmYWxzZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLCB1bmRlZmluZWQsIGZhbHNlKSk7XG5cblx0XHQvLyBEaWFsb2dzXG5cdFx0Y29uc3QgZGlhbG9nTWFpblNlcnZpY2UgPSBuZXcgRGlhbG9nTWFpblNlcnZpY2UodGhpcy5sb2dTZXJ2aWNlLCB0aGlzLnByb2R1Y3RTZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSURpYWxvZ01haW5TZXJ2aWNlLCBkaWFsb2dNYWluU2VydmljZSk7XG5cblx0XHQvLyBMYXVuY2hcblx0XHRzZXJ2aWNlcy5zZXQoSUxhdW5jaE1haW5TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTGF1bmNoTWFpblNlcnZpY2UsIHVuZGVmaW5lZCwgZmFsc2UgLyogcHJveGllZCB0byBvdGhlciBwcm9jZXNzZXMgKi8pKTtcblxuXHRcdC8vIERpYWdub3N0aWNzXG5cdFx0c2VydmljZXMuc2V0KElEaWFnbm9zdGljc01haW5TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoRGlhZ25vc3RpY3NNYWluU2VydmljZSwgdW5kZWZpbmVkLCBmYWxzZSAvKiBwcm94aWVkIHRvIG90aGVyIHByb2Nlc3NlcyAqLykpO1xuXHRcdHNlcnZpY2VzLnNldChJRGlhZ25vc3RpY3NTZXJ2aWNlLCBQcm94eUNoYW5uZWwudG9TZXJ2aWNlKGdldERlbGF5ZWRDaGFubmVsKHNoYXJlZFByb2Nlc3NSZWFkeS50aGVuKGNsaWVudCA9PiBjbGllbnQuZ2V0Q2hhbm5lbCgnZGlhZ25vc3RpY3MnKSkpKSk7XG5cblx0XHQvLyBFbmNyeXB0aW9uXG5cdFx0c2VydmljZXMuc2V0KElFbmNyeXB0aW9uTWFpblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihFbmNyeXB0aW9uTWFpblNlcnZpY2UpKTtcblxuXHRcdC8vIEJyb3dzZXIgVmlld1xuXHRcdHNlcnZpY2VzLnNldChJQnJvd3NlclZpZXdNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKEJyb3dzZXJWaWV3TWFpblNlcnZpY2UsIHVuZGVmaW5lZCwgZmFsc2UgLyogcHJveGllZCB0byBvdGhlciBwcm9jZXNzZXMgKi8pKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUJyb3dzZXJWaWV3R3JvdXBNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKEJyb3dzZXJWaWV3R3JvdXBNYWluU2VydmljZSwgdW5kZWZpbmVkLCBmYWxzZSAvKiBwcm94aWVkIHRvIG90aGVyIHByb2Nlc3NlcyAqLykpO1xuXG5cdFx0Ly8gS2V5Ym9hcmQgTGF5b3V0XG5cdFx0c2VydmljZXMuc2V0KElLZXlib2FyZExheW91dE1haW5TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoS2V5Ym9hcmRMYXlvdXRNYWluU2VydmljZSkpO1xuXG5cdFx0Ly8gTmF0aXZlIEhvc3Rcblx0XHRzZXJ2aWNlcy5zZXQoSU5hdGl2ZUhvc3RNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKE5hdGl2ZUhvc3RNYWluU2VydmljZSwgdW5kZWZpbmVkLCBmYWxzZSAvKiBwcm94aWVkIHRvIG90aGVyIHByb2Nlc3NlcyAqLykpO1xuXG5cdFx0Ly8gU3lzdGVtLXdpZGUgKE9TIGdsb2JhbCkga2V5YmluZGluZ3Ncblx0XHRzZXJ2aWNlcy5zZXQoSUdsb2JhbEtleWJpbmRpbmdzTWFpblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihHbG9iYWxLZXliaW5kaW5nc01haW5TZXJ2aWNlLCBbZ2xvYmFsU2hvcnRjdXRdKSk7XG5cblx0XHQvLyBNZXRlcmVkIENvbm5lY3Rpb25cblx0XHRjb25zdCBtZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UgPSBuZXcgTWV0ZXJlZENvbm5lY3Rpb25NYWluU2VydmljZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSwgbWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlKTtcblxuXHRcdC8vIFdlYiBDb250ZW50cyBFeHRyYWN0b3Jcblx0XHRzZXJ2aWNlcy5zZXQoSVRlcm1pbmFsU2FuZGJveFNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihOdWxsVGVybWluYWxTYW5kYm94U2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKEFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsIHVuZGVmaW5lZCwgdHJ1ZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihOYXRpdmVXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSwgdW5kZWZpbmVkLCBmYWxzZSAvKiBwcm94aWVkIHRvIG90aGVyIHByb2Nlc3NlcyAqLykpO1xuXG5cdFx0Ly8gV2VidmlldyBNYW5hZ2VyXG5cdFx0c2VydmljZXMuc2V0KElXZWJ2aWV3TWFuYWdlclNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihXZWJ2aWV3TWFpblNlcnZpY2UpKTtcblxuXHRcdC8vIE1lbnViYXJcblx0XHRzZXJ2aWNlcy5zZXQoSU1lbnViYXJNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKE1lbnViYXJNYWluU2VydmljZSkpO1xuXG5cdFx0Ly8gRXh0ZW5zaW9uIEhvc3QgU3RhcnRlclxuXHRcdHNlcnZpY2VzLnNldChJRXh0ZW5zaW9uSG9zdFN0YXJ0ZXIsIG5ldyBTeW5jRGVzY3JpcHRvcihFeHRlbnNpb25Ib3N0U3RhcnRlcikpO1xuXG5cdFx0Ly8gU3RvcmFnZVxuXHRcdHNlcnZpY2VzLnNldChJU3RvcmFnZU1haW5TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoU3RvcmFnZU1haW5TZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElBcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKEFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlKSk7XG5cblx0XHQvLyBUZXJtaW5hbFxuXHRcdGNvbnN0IHB0eUhvc3RTdGFydGVyID0gbmV3IEVsZWN0cm9uUHR5SG9zdFN0YXJ0ZXIoe1xuXHRcdFx0Z3JhY2VUaW1lOiBMb2NhbFJlY29ubmVjdENvbnN0YW50cy5HcmFjZVRpbWUsXG5cdFx0XHRzaG9ydEdyYWNlVGltZTogTG9jYWxSZWNvbm5lY3RDb25zdGFudHMuU2hvcnRHcmFjZVRpbWUsXG5cdFx0XHRzY3JvbGxiYWNrOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oVGVybWluYWxTZXR0aW5nSWQuUGVyc2lzdGVudFNlc3Npb25TY3JvbGxiYWNrKSA/PyAxMDBcblx0XHR9LCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UsIHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2UsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0Y29uc3QgcHR5SG9zdFNlcnZpY2UgPSBuZXcgUHR5SG9zdFNlcnZpY2UoXG5cdFx0XHRwdHlIb3N0U3RhcnRlcixcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UsXG5cdFx0XHR0aGlzLmxvZ2dlclNlcnZpY2Vcblx0XHQpO1xuXHRcdHNlcnZpY2VzLnNldChJTG9jYWxQdHlTZXJ2aWNlLCBwdHlIb3N0U2VydmljZSk7XG5cblx0XHQvLyBFeHRlcm5hbCB0ZXJtaW5hbFxuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdHNlcnZpY2VzLnNldChJRXh0ZXJuYWxUZXJtaW5hbE1haW5TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoV2luZG93c0V4dGVybmFsVGVybWluYWxTZXJ2aWNlKSk7XG5cdFx0fSBlbHNlIGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0c2VydmljZXMuc2V0KElFeHRlcm5hbFRlcm1pbmFsTWFpblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihNYWNFeHRlcm5hbFRlcm1pbmFsU2VydmljZSkpO1xuXHRcdH0gZWxzZSBpZiAoaXNMaW51eCkge1xuXHRcdFx0c2VydmljZXMuc2V0KElFeHRlcm5hbFRlcm1pbmFsTWFpblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihMaW51eEV4dGVybmFsVGVybWluYWxTZXJ2aWNlKSk7XG5cdFx0fVxuXHRcdHNlcnZpY2VzLnNldChJU2FuZGJveEhlbHBlck1haW5TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoU2FuZGJveEhlbHBlclNlcnZpY2UpKTtcblxuXHRcdC8vIEJhY2t1cHNcblx0XHRjb25zdCBiYWNrdXBNYWluU2VydmljZSA9IG5ldyBCYWNrdXBNYWluU2VydmljZSh0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy5zdGF0ZVNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJQmFja3VwTWFpblNlcnZpY2UsIGJhY2t1cE1haW5TZXJ2aWNlKTtcblxuXHRcdC8vIFdvcmtzcGFjZXNcblx0XHRjb25zdCB3b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlID0gbmV3IFdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMudXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlLCBiYWNrdXBNYWluU2VydmljZSwgZGlhbG9nTWFpblNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJV29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZSwgd29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZSk7XG5cdFx0c2VydmljZXMuc2V0KElXb3Jrc3BhY2VzU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFdvcmtzcGFjZXNNYWluU2VydmljZSwgdW5kZWZpbmVkLCBmYWxzZSAvKiBwcm94aWVkIHRvIG90aGVyIHByb2Nlc3NlcyAqLykpO1xuXHRcdHNlcnZpY2VzLnNldChJV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFdvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UsIHVuZGVmaW5lZCwgZmFsc2UpKTtcblxuXHRcdC8vIFVSTCBoYW5kbGluZ1xuXHRcdHNlcnZpY2VzLnNldChJVVJMU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKE5hdGl2ZVVSTFNlcnZpY2UsIHVuZGVmaW5lZCwgZmFsc2UgLyogcHJveGllZCB0byBvdGhlciBwcm9jZXNzZXMgKi8pKTtcblxuXHRcdC8vIFRlbGVtZXRyeVxuXHRcdGlmIChzdXBwb3J0c1RlbGVtZXRyeSh0aGlzLnByb2R1Y3RTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UpKSB7XG5cdFx0XHRjb25zdCBpc0ludGVybmFsID0gaXNJbnRlcm5hbFRlbGVtZXRyeSh0aGlzLnByb2R1Y3RTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNoYW5uZWwgPSBnZXREZWxheWVkQ2hhbm5lbChzaGFyZWRQcm9jZXNzUmVhZHkudGhlbihjbGllbnQgPT4gY2xpZW50LmdldENoYW5uZWwoJ3RlbGVtZXRyeUFwcGVuZGVyJykpKTtcblx0XHRcdGNvbnN0IGFwcGVuZGVyID0gbmV3IFRlbGVtZXRyeUFwcGVuZGVyQ2xpZW50KGNoYW5uZWwpO1xuXHRcdFx0Y29uc3QgY29tbW9uUHJvcGVydGllcyA9IHJlc29sdmVDb21tb25Qcm9wZXJ0aWVzKHJlbGVhc2UoKSwgaG9zdG5hbWUoKSwgcHJvY2Vzcy5hcmNoLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdCwgdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLCBtYWNoaW5lSWQsIHNxbUlkLCBkZXZEZXZpY2VJZCwgaXNJbnRlcm5hbCwgdGhpcy5wcm9kdWN0U2VydmljZS5kYXRlKTtcblx0XHRcdGNvbnN0IHBpaVBhdGhzID0gZ2V0UGlpUGF0aHNGcm9tRW52aXJvbm1lbnQodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNvbmZpZzogSVRlbGVtZXRyeVNlcnZpY2VDb25maWcgPSB7IGFwcGVuZGVyczogW2FwcGVuZGVyXSwgY29tbW9uUHJvcGVydGllcywgcGlpUGF0aHMsIHNlbmRFcnJvclRlbGVtZXRyeTogdHJ1ZSB9O1xuXG5cdFx0XHRzZXJ2aWNlcy5zZXQoSVRlbGVtZXRyeVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihUZWxlbWV0cnlTZXJ2aWNlLCBbY29uZmlnXSwgZmFsc2UpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2VydmljZXMuc2V0KElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGVmYXVsdCBFeHRlbnNpb25zIFByb2ZpbGUgSW5pdFxuXHRcdHNlcnZpY2VzLnNldChJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKEV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UsIHVuZGVmaW5lZCwgdHJ1ZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLCB1bmRlZmluZWQsIHRydWUpKTtcblxuXHRcdC8vIFV0aWxpdHkgUHJvY2VzcyBXb3JrZXJcblx0XHRzZXJ2aWNlcy5zZXQoSVV0aWxpdHlQcm9jZXNzV29ya2VyTWFpblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihVdGlsaXR5UHJvY2Vzc1dvcmtlck1haW5TZXJ2aWNlLCB1bmRlZmluZWQsIHRydWUpKTtcblxuXHRcdC8vIFByb3h5IEF1dGhcblx0XHRzZXJ2aWNlcy5zZXQoSVByb3h5QXV0aFNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihQcm94eUF1dGhTZXJ2aWNlKSk7XG5cblx0XHQvLyBNQ1Bcblx0XHRzZXJ2aWNlcy5zZXQoSU5hdGl2ZU1jcERpc2NvdmVyeUhlbHBlclNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihOYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXJTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElNY3BHYXRld2F5U2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKE1jcEdhdGV3YXlTZXJ2aWNlKSk7XG5cblx0XHQvLyBEZXYgT25seTogQ1NTIHNlcnZpY2UgKGZvciBFU00pXG5cdFx0c2VydmljZXMuc2V0KElDU1NEZXZlbG9wbWVudFNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihDU1NEZXZlbG9wbWVudFNlcnZpY2UsIHVuZGVmaW5lZCwgdHJ1ZSkpO1xuXG5cdFx0Ly8gSW5pdCBzZXJ2aWNlcyB0aGF0IHJlcXVpcmUgaXRcblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKFtcblx0XHRcdGJhY2t1cE1haW5TZXJ2aWNlLmluaXRpYWxpemUoKSxcblx0XHRcdHdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UuaW5pdGlhbGl6ZSgpXG5cdFx0XSk7XG5cblx0XHRyZXR1cm4gdGhpcy5tYWluSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQoc2VydmljZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0Q2hhbm5lbHMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXI6IEVsZWN0cm9uSVBDU2VydmVyLCBzaGFyZWRQcm9jZXNzQ2xpZW50OiBQcm9taXNlPE1lc3NhZ2VQb3J0Q2xpZW50Pik6IHZvaWQge1xuXG5cdFx0Ly8gQ2hhbm5lbHMgcmVnaXN0ZXJlZCB0byBub2RlLmpzIGFyZSBleHBvc2VkIHRvIHNlY29uZCBpbnN0YW5jZXNcblx0XHQvLyBsYXVuY2hpbmcgYmVjYXVzZSB0aGF0IGlzIHRoZSBvbmx5IHdheSB0aGUgc2Vjb25kIGluc3RhbmNlXG5cdFx0Ly8gY2FuIHRhbGsgdG8gdGhlIGZpcnN0IGluc3RhbmNlLiBFbGVjdHJvbiBJUEMgZG9lcyBub3Qgd29ya1xuXHRcdC8vIGFjcm9zcyBhcHBzIHVudGlsIGByZXF1ZXN0U2luZ2xlSW5zdGFuY2VgIEFQSXMgYXJlIGFkb3B0ZWQuXG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHRjb25zdCBsYXVuY2hDaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKGFjY2Vzc29yLmdldChJTGF1bmNoTWFpblNlcnZpY2UpLCBkaXNwb3NhYmxlcywgeyBkaXNhYmxlTWFyc2hhbGxpbmc6IHRydWUgfSk7XG5cdFx0dGhpcy5tYWluUHJvY2Vzc05vZGVJcGNTZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCdsYXVuY2gnLCBsYXVuY2hDaGFubmVsKTtcblxuXHRcdGNvbnN0IGRpYWdub3N0aWNzQ2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShhY2Nlc3Nvci5nZXQoSURpYWdub3N0aWNzTWFpblNlcnZpY2UpLCBkaXNwb3NhYmxlcywgeyBkaXNhYmxlTWFyc2hhbGxpbmc6IHRydWUgfSk7XG5cdFx0dGhpcy5tYWluUHJvY2Vzc05vZGVJcGNTZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCdkaWFnbm9zdGljcycsIGRpYWdub3N0aWNzQ2hhbm5lbCk7XG5cblx0XHQvLyBQb2xpY2llcyAobWFpbiAmIHNoYXJlZCBwcm9jZXNzKVxuXHRcdGNvbnN0IHBvbGljeUNoYW5uZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFBvbGljeUNoYW5uZWwoYWNjZXNzb3IuZ2V0KElQb2xpY3lTZXJ2aWNlKSkpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCdwb2xpY3knLCBwb2xpY3lDaGFubmVsKTtcblx0XHRzaGFyZWRQcm9jZXNzQ2xpZW50LnRoZW4oY2xpZW50ID0+IGNsaWVudC5yZWdpc3RlckNoYW5uZWwoJ3BvbGljeScsIHBvbGljeUNoYW5uZWwpKTtcblxuXHRcdGNvbnN0IG5hdGl2ZU1hbmFnZWRTZXR0aW5nc0NoYW5uZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5hdGl2ZU1hbmFnZWRTZXR0aW5nc0NoYW5uZWwoYWNjZXNzb3IuZ2V0KElOYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKSkpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCduYXRpdmVNYW5hZ2VkU2V0dGluZ3MnLCBuYXRpdmVNYW5hZ2VkU2V0dGluZ3NDaGFubmVsKTtcblxuXHRcdGNvbnN0IGZpbGVNYW5hZ2VkU2V0dGluZ3NDaGFubmVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlTWFuYWdlZFNldHRpbmdzQ2hhbm5lbChhY2Nlc3Nvci5nZXQoSUZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKSkpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCdmaWxlTWFuYWdlZFNldHRpbmdzJywgZmlsZU1hbmFnZWRTZXR0aW5nc0NoYW5uZWwpO1xuXG5cdFx0Ly8gTG9jYWwgRmlsZXNcblx0XHRjb25zdCBkaXNrRmlsZVN5c3RlbVByb3ZpZGVyID0gdGhpcy5maWxlU2VydmljZS5nZXRQcm92aWRlcihTY2hlbWFzLmZpbGUpO1xuXHRcdGFzc2VydFR5cGUoZGlza0ZpbGVTeXN0ZW1Qcm92aWRlciBpbnN0YW5jZW9mIERpc2tGaWxlU3lzdGVtUHJvdmlkZXIpO1xuXHRcdGNvbnN0IGZpbGVTeXN0ZW1Qcm92aWRlckNoYW5uZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc2tGaWxlU3lzdGVtUHJvdmlkZXJDaGFubmVsKGRpc2tGaWxlU3lzdGVtUHJvdmlkZXIsIHRoaXMubG9nU2VydmljZSwgdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlKSk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoTE9DQUxfRklMRV9TWVNURU1fQ0hBTk5FTF9OQU1FLCBmaWxlU3lzdGVtUHJvdmlkZXJDaGFubmVsKTtcblx0XHRzaGFyZWRQcm9jZXNzQ2xpZW50LnRoZW4oY2xpZW50ID0+IGNsaWVudC5yZWdpc3RlckNoYW5uZWwoTE9DQUxfRklMRV9TWVNURU1fQ0hBTk5FTF9OQU1FLCBmaWxlU3lzdGVtUHJvdmlkZXJDaGFubmVsKSk7XG5cblx0XHQvLyBVc2VyIERhdGEgUHJvZmlsZXNcblx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShhY2Nlc3Nvci5nZXQoSVVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZSksIGRpc3Bvc2FibGVzKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgndXNlckRhdGFQcm9maWxlcycsIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0XHRzaGFyZWRQcm9jZXNzQ2xpZW50LnRoZW4oY2xpZW50ID0+IGNsaWVudC5yZWdpc3RlckNoYW5uZWwoJ3VzZXJEYXRhUHJvZmlsZXMnLCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSkpO1xuXG5cdFx0Ly8gVXBkYXRlXG5cdFx0Y29uc3QgdXBkYXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVXBkYXRlU2VydmljZSk7XG5cdFx0Y29uc3QgdXBkYXRlQ2hhbm5lbCA9IG5ldyBVcGRhdGVDaGFubmVsKHVwZGF0ZVNlcnZpY2UpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCd1cGRhdGUnLCB1cGRhdGVDaGFubmVsKTtcblxuXHRcdC8vIFNob3cgYSBuYXRpdmUgXCJubyB1cGRhdGVzIGF2YWlsYWJsZVwiIGRpYWxvZyBmcm9tIHRoZSBtYWluIHByb2Nlc3Mgb25seSBpbiB3aW5kb3dsZXNzIG1hY09TIGNhc2UuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IE5vdEF2YWlsYWJsZVVwZGF0ZURpYWxvZyh1cGRhdGVTZXJ2aWNlLCBhY2Nlc3Nvci5nZXQoSURpYWxvZ01haW5TZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElXaW5kb3dzTWFpblNlcnZpY2UpKSk7XG5cblx0XHQvLyBNZXRlcmVkIENvbm5lY3Rpb25cblx0XHRjb25zdCBtZXRlcmVkQ29ubmVjdGlvbkNoYW5uZWwgPSBuZXcgTWV0ZXJlZENvbm5lY3Rpb25DaGFubmVsKGFjY2Vzc29yLmdldChJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlKSBhcyBNZXRlcmVkQ29ubmVjdGlvbk1haW5TZXJ2aWNlKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbChNRVRFUkVEX0NPTk5FQ1RJT05fQ0hBTk5FTCwgbWV0ZXJlZENvbm5lY3Rpb25DaGFubmVsKTtcblx0XHRzaGFyZWRQcm9jZXNzQ2xpZW50LnRoZW4oY2xpZW50ID0+IGNsaWVudC5yZWdpc3RlckNoYW5uZWwoTUVURVJFRF9DT05ORUNUSU9OX0NIQU5ORUwsIG1ldGVyZWRDb25uZWN0aW9uQ2hhbm5lbCkpO1xuXG5cdFx0Ly8gUHJvY2Vzc1xuXHRcdGNvbnN0IHByb2Nlc3NDaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKG5ldyBQcm9jZXNzTWFpblNlcnZpY2UodGhpcy5sb2dTZXJ2aWNlLCBhY2Nlc3Nvci5nZXQoSURpYWdub3N0aWNzU2VydmljZSksIGFjY2Vzc29yLmdldChJRGlhZ25vc3RpY3NNYWluU2VydmljZSkpLCBkaXNwb3NhYmxlcyk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoJ3Byb2Nlc3MnLCBwcm9jZXNzQ2hhbm5lbCk7XG5cblx0XHQvLyBFbmNyeXB0aW9uXG5cdFx0Y29uc3QgZW5jcnlwdGlvbkNoYW5uZWwgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoYWNjZXNzb3IuZ2V0KElFbmNyeXB0aW9uTWFpblNlcnZpY2UpLCBkaXNwb3NhYmxlcyk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoJ2VuY3J5cHRpb24nLCBlbmNyeXB0aW9uQ2hhbm5lbCk7XG5cblx0XHQvLyBCcm93c2VyIFZpZXdcblx0XHRjb25zdCBicm93c2VyVmlld0NoYW5uZWwgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoYWNjZXNzb3IuZ2V0KElCcm93c2VyVmlld01haW5TZXJ2aWNlKSwgZGlzcG9zYWJsZXMpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKGlwY0Jyb3dzZXJWaWV3Q2hhbm5lbE5hbWUsIGJyb3dzZXJWaWV3Q2hhbm5lbCk7XG5cdFx0c2hhcmVkUHJvY2Vzc0NsaWVudC50aGVuKGNsaWVudCA9PiBjbGllbnQucmVnaXN0ZXJDaGFubmVsKGlwY0Jyb3dzZXJWaWV3Q2hhbm5lbE5hbWUsIGJyb3dzZXJWaWV3Q2hhbm5lbCkpO1xuXG5cdFx0Ly8gQnJvd3NlciBWaWV3IEdyb3VwXG5cdFx0Y29uc3QgYnJvd3NlclZpZXdHcm91cENoYW5uZWwgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoYWNjZXNzb3IuZ2V0KElCcm93c2VyVmlld0dyb3VwTWFpblNlcnZpY2UpLCBkaXNwb3NhYmxlcyk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoaXBjQnJvd3NlclZpZXdHcm91cENoYW5uZWxOYW1lLCBicm93c2VyVmlld0dyb3VwQ2hhbm5lbCk7XG5cdFx0c2hhcmVkUHJvY2Vzc0NsaWVudC50aGVuKGNsaWVudCA9PiBjbGllbnQucmVnaXN0ZXJDaGFubmVsKGlwY0Jyb3dzZXJWaWV3R3JvdXBDaGFubmVsTmFtZSwgYnJvd3NlclZpZXdHcm91cENoYW5uZWwpKTtcblxuXHRcdC8vIFNpZ25pbmdcblx0XHRjb25zdCBzaWduQ2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShhY2Nlc3Nvci5nZXQoSVNpZ25TZXJ2aWNlKSwgZGlzcG9zYWJsZXMpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCdzaWduJywgc2lnbkNoYW5uZWwpO1xuXG5cdFx0Ly8gS2V5Ym9hcmQgTGF5b3V0XG5cdFx0Y29uc3Qga2V5Ym9hcmRMYXlvdXRDaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKGFjY2Vzc29yLmdldChJS2V5Ym9hcmRMYXlvdXRNYWluU2VydmljZSksIGRpc3Bvc2FibGVzKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgna2V5Ym9hcmRMYXlvdXQnLCBrZXlib2FyZExheW91dENoYW5uZWwpO1xuXG5cdFx0Ly8gTmF0aXZlIGhvc3QgKG1haW4gJiBzaGFyZWQgcHJvY2Vzcylcblx0XHR0aGlzLm5hdGl2ZUhvc3RNYWluU2VydmljZSA9IGFjY2Vzc29yLmdldChJTmF0aXZlSG9zdE1haW5TZXJ2aWNlKTtcblx0XHRjb25zdCBuYXRpdmVIb3N0Q2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZSh0aGlzLm5hdGl2ZUhvc3RNYWluU2VydmljZSwgZGlzcG9zYWJsZXMsIHtcblx0XHRcdC8vIFRoaXMgZXZlbnQgaGFzIG1haW4tcHJvY2VzcyBjb25zdW1lcnMgYnV0IG5vIElQQyBjb25zdW1lciwgc28gaXRzIGJ1ZmZlciB3b3VsZCBuZXZlciBkcmFpbi5cblx0XHRcdHVuYnVmZmVyZWRFdmVudHM6IFsnb25EaWRCbHVyTWFpbldpbmRvdyddXG5cdFx0fSk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoJ25hdGl2ZUhvc3QnLCBuYXRpdmVIb3N0Q2hhbm5lbCk7XG5cdFx0c2hhcmVkUHJvY2Vzc0NsaWVudC50aGVuKGNsaWVudCA9PiBjbGllbnQucmVnaXN0ZXJDaGFubmVsKCduYXRpdmVIb3N0JywgbmF0aXZlSG9zdENoYW5uZWwpKTtcblxuXHRcdC8vIFdlYiBDb250ZW50IEV4dHJhY3RvclxuXHRcdGNvbnN0IHdlYkNvbnRlbnRFeHRyYWN0b3JDaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKGFjY2Vzc29yLmdldChJV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UpLCBkaXNwb3NhYmxlcyk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoJ3dlYkNvbnRlbnRFeHRyYWN0b3InLCB3ZWJDb250ZW50RXh0cmFjdG9yQ2hhbm5lbCk7XG5cblx0XHQvLyBXb3Jrc3BhY2VzXG5cdFx0Y29uc3Qgd29ya3NwYWNlc0NoYW5uZWwgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VzU2VydmljZSksIGRpc3Bvc2FibGVzKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgnd29ya3NwYWNlcycsIHdvcmtzcGFjZXNDaGFubmVsKTtcblxuXHRcdC8vIE1lbnViYXJcblx0XHRjb25zdCBtZW51YmFyQ2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShhY2Nlc3Nvci5nZXQoSU1lbnViYXJNYWluU2VydmljZSksIGRpc3Bvc2FibGVzKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgnbWVudWJhcicsIG1lbnViYXJDaGFubmVsKTtcblxuXHRcdC8vIFVSTCBoYW5kbGluZ1xuXHRcdGNvbnN0IHVybENoYW5uZWwgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoYWNjZXNzb3IuZ2V0KElVUkxTZXJ2aWNlKSwgZGlzcG9zYWJsZXMpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCd1cmwnLCB1cmxDaGFubmVsKTtcblxuXHRcdC8vIFdlYnZpZXcgTWFuYWdlclxuXHRcdGNvbnN0IHdlYnZpZXdDaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKGFjY2Vzc29yLmdldChJV2Vidmlld01hbmFnZXJTZXJ2aWNlKSwgZGlzcG9zYWJsZXMpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCd3ZWJ2aWV3Jywgd2Vidmlld0NoYW5uZWwpO1xuXG5cdFx0Ly8gU3RvcmFnZSAobWFpbiAmIHNoYXJlZCBwcm9jZXNzKVxuXHRcdGNvbnN0IHN0b3JhZ2VDaGFubmVsID0gZGlzcG9zYWJsZXMuYWRkKChuZXcgU3RvcmFnZURhdGFiYXNlQ2hhbm5lbCh0aGlzLmxvZ1NlcnZpY2UsIGFjY2Vzc29yLmdldChJU3RvcmFnZU1haW5TZXJ2aWNlKSkpKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbCgnc3RvcmFnZScsIHN0b3JhZ2VDaGFubmVsKTtcblx0XHRzaGFyZWRQcm9jZXNzQ2xpZW50LnRoZW4oY2xpZW50ID0+IGNsaWVudC5yZWdpc3RlckNoYW5uZWwoJ3N0b3JhZ2UnLCBzdG9yYWdlQ2hhbm5lbCkpO1xuXG5cdFx0Ly8gUHJvZmlsZSBTdG9yYWdlIENoYW5nZXMgTGlzdGVuZXIgKHNoYXJlZCBwcm9jZXNzKVxuXHRcdGNvbnN0IHByb2ZpbGVTdG9yYWdlTGlzdGVuZXIgPSBkaXNwb3NhYmxlcy5hZGQoKG5ldyBQcm9maWxlU3RvcmFnZUNoYW5nZXNMaXN0ZW5lckNoYW5uZWwoYWNjZXNzb3IuZ2V0KElTdG9yYWdlTWFpblNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSVVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZSksIHRoaXMubG9nU2VydmljZSkpKTtcblx0XHRzaGFyZWRQcm9jZXNzQ2xpZW50LnRoZW4oY2xpZW50ID0+IGNsaWVudC5yZWdpc3RlckNoYW5uZWwoJ3Byb2ZpbGVTdG9yYWdlTGlzdGVuZXInLCBwcm9maWxlU3RvcmFnZUxpc3RlbmVyKSk7XG5cblx0XHQvLyBUZXJtaW5hbFxuXHRcdGNvbnN0IHB0eUhvc3RDaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKGFjY2Vzc29yLmdldChJTG9jYWxQdHlTZXJ2aWNlKSwgZGlzcG9zYWJsZXMpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKFRlcm1pbmFsSXBjQ2hhbm5lbHMuTG9jYWxQdHksIHB0eUhvc3RDaGFubmVsKTtcblxuXHRcdC8vIEV4dGVybmFsIFRlcm1pbmFsXG5cdFx0Y29uc3QgZXh0ZXJuYWxUZXJtaW5hbENoYW5uZWwgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoYWNjZXNzb3IuZ2V0KElFeHRlcm5hbFRlcm1pbmFsTWFpblNlcnZpY2UpLCBkaXNwb3NhYmxlcyk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoJ2V4dGVybmFsVGVybWluYWwnLCBleHRlcm5hbFRlcm1pbmFsQ2hhbm5lbCk7XG5cblx0XHQvLyBTYW5kYm94IEhlbHBlclxuXHRcdGNvbnN0IHNhbmRib3hIZWxwZXJDaGFubmVsID0gUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKGFjY2Vzc29yLmdldChJU2FuZGJveEhlbHBlck1haW5TZXJ2aWNlKSwgZGlzcG9zYWJsZXMpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCdzYW5kYm94SGVscGVyJywgc2FuZGJveEhlbHBlckNoYW5uZWwpO1xuXG5cdFx0Ly8gTUNQXG5cdFx0Y29uc3QgbWNwRGlzY292ZXJ5Q2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShhY2Nlc3Nvci5nZXQoSU5hdGl2ZU1jcERpc2NvdmVyeUhlbHBlclNlcnZpY2UpLCBkaXNwb3NhYmxlcyk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoTmF0aXZlTWNwRGlzY292ZXJ5SGVscGVyQ2hhbm5lbE5hbWUsIG1jcERpc2NvdmVyeUNoYW5uZWwpO1xuXHRcdGNvbnN0IG1jcEdhdGV3YXlDaGFubmVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IE1jcEdhdGV3YXlDaGFubmVsKG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIsIGFjY2Vzc29yLmdldChJTWNwR2F0ZXdheVNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxvZ2dlck1haW5TZXJ2aWNlKSkpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKE1jcEdhdGV3YXlDaGFubmVsTmFtZSwgbWNwR2F0ZXdheUNoYW5uZWwpO1xuXG5cdFx0Ly8gTG9nZ2VyXG5cdFx0Y29uc3QgbG9nZ2VyQ2hhbm5lbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBMb2dnZXJDaGFubmVsKGFjY2Vzc29yLmdldChJTG9nZ2VyTWFpblNlcnZpY2UpKSk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoJ2xvZ2dlcicsIGxvZ2dlckNoYW5uZWwpO1xuXHRcdHNoYXJlZFByb2Nlc3NDbGllbnQudGhlbihjbGllbnQgPT4gY2xpZW50LnJlZ2lzdGVyQ2hhbm5lbCgnbG9nZ2VyJywgbG9nZ2VyQ2hhbm5lbCkpO1xuXG5cdFx0Ly8gRXh0ZW5zaW9uIEhvc3QgRGVidWcgQnJvYWRjYXN0aW5nXG5cdFx0Y29uc3QgZWxlY3Ryb25FeHRlbnNpb25Ib3N0RGVidWdCcm9hZGNhc3RDaGFubmVsID0gbmV3IEVsZWN0cm9uRXh0ZW5zaW9uSG9zdERlYnVnQnJvYWRjYXN0Q2hhbm5lbChhY2Nlc3Nvci5nZXQoSVdpbmRvd3NNYWluU2VydmljZSkpO1xuXHRcdG1haW5Qcm9jZXNzRWxlY3Ryb25TZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCdleHRlbnNpb25ob3N0ZGVidWdzZXJ2aWNlJywgZWxlY3Ryb25FeHRlbnNpb25Ib3N0RGVidWdCcm9hZGNhc3RDaGFubmVsKTtcblxuXHRcdC8vIEV4dGVuc2lvbiBIb3N0IFN0YXJ0ZXJcblx0XHRjb25zdCBleHRlbnNpb25Ib3N0U3RhcnRlckNoYW5uZWwgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25Ib3N0U3RhcnRlciksIGRpc3Bvc2FibGVzKTtcblx0XHRtYWluUHJvY2Vzc0VsZWN0cm9uU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbChpcGNFeHRlbnNpb25Ib3N0U3RhcnRlckNoYW5uZWxOYW1lLCBleHRlbnNpb25Ib3N0U3RhcnRlckNoYW5uZWwpO1xuXG5cdFx0Ly8gVXRpbGl0eSBQcm9jZXNzIFdvcmtlclxuXHRcdGNvbnN0IHV0aWxpdHlQcm9jZXNzV29ya2VyQ2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShhY2Nlc3Nvci5nZXQoSVV0aWxpdHlQcm9jZXNzV29ya2VyTWFpblNlcnZpY2UpLCBkaXNwb3NhYmxlcyk7XG5cdFx0bWFpblByb2Nlc3NFbGVjdHJvblNlcnZlci5yZWdpc3RlckNoYW5uZWwoaXBjVXRpbGl0eVByb2Nlc3NXb3JrZXJDaGFubmVsTmFtZSwgdXRpbGl0eVByb2Nlc3NXb3JrZXJDaGFubmVsKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkZpcnN0V2luZG93KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpbml0aWFsUHJvdG9jb2xVcmxzOiBJSW5pdGlhbFByb3RvY29sVXJscyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SUNvZGVXaW5kb3dbXT4ge1xuXHRcdGNvbnN0IHdpbmRvd3NNYWluU2VydmljZSA9IHRoaXMud2luZG93c01haW5TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXaW5kb3dzTWFpblNlcnZpY2UpO1xuXHRcdHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGlzTGF1bmNoZWRGcm9tQ2xpKHByb2Nlc3MuZW52KSA/IE9wZW5Db250ZXh0LkNMSSA6IE9wZW5Db250ZXh0LkRFU0tUT1A7XG5cdFx0Y29uc3QgYXJncyA9IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzO1xuXG5cdFx0Ly8gSGFuZGxlIGFnZW50cyB3aW5kb3cgZmlyc3QgYmFzZWQgb24gY29udGV4dFxuXHRcdGlmIChhcmdzWydhZ2VudHMnXSkge1xuXHRcdFx0cmV0dXJuIHdpbmRvd3NNYWluU2VydmljZS5vcGVuQWdlbnRzV2luZG93KHtcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0Y2xpOiBhcmdzLFxuXHRcdFx0XHRpbml0aWFsU3RhcnR1cDogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlbiBjaGVjayBmb3Igd2luZG93cyBmcm9tIHByb3RvY29sIGxpbmtzIHRvIG9wZW5cblx0XHRpZiAoaW5pdGlhbFByb3RvY29sVXJscykge1xuXG5cdFx0XHQvLyBPcGVuYWJsZXMgY2FuIG9wZW4gYXMgd2luZG93cyBkaXJlY3RseVxuXHRcdFx0aWYgKGluaXRpYWxQcm90b2NvbFVybHMub3BlbmFibGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmV0dXJuIHdpbmRvd3NNYWluU2VydmljZS5vcGVuKHtcblx0XHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRcdGNsaTogYXJncyxcblx0XHRcdFx0XHR1cmlzVG9PcGVuOiBpbml0aWFsUHJvdG9jb2xVcmxzLm9wZW5hYmxlcyxcblx0XHRcdFx0XHRnb3RvTGluZU1vZGU6IHRydWUsXG5cdFx0XHRcdFx0aW5pdGlhbFN0YXJ0dXA6IHRydWVcblx0XHRcdFx0XHQvLyByZW1vdGVBdXRob3JpdHk6IHdpbGwgYmUgZGV0ZXJtaW5lZCBiYXNlZCBvbiBvcGVuYWJsZXNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFByb3RvY29sIGxpbmtzIHdpdGggYHdpbmRvd0lkPV9ibGFua2Agb24gc3RhcnR1cFxuXHRcdFx0Ly8gc2hvdWxkIGJlIGhhbmRsZWQgaW4gYSBzcGVjaWFsIHdheTpcblx0XHRcdC8vIFdlIHRha2UgdGhlIGZpcnN0IG9uZSBvZiB0aGVzZSBhbmQgb3BlbiBhbiBlbXB0eVxuXHRcdFx0Ly8gd2luZG93IGZvciBpdC4gVGhpcyBlbnN1cmVzIHdlIGFyZSBub3QgcmVzdG9yaW5nXG5cdFx0XHQvLyBhbGwgd2luZG93cyBvZiB0aGUgcHJldmlvdXMgc2Vzc2lvbi5cblx0XHRcdC8vIElmIHRoZXJlIGFyZSBhbnkgbW9yZSBVUkxzIGxpa2UgdGhlc2UsIHRoZXkgd2lsbFxuXHRcdFx0Ly8gYmUgaGFuZGxlZCBmcm9tIHRoZSBVUkwgbGlzdGVuZXJzIGluc3RhbGxlZCBsYXRlci5cblxuXHRcdFx0aWYgKGluaXRpYWxQcm90b2NvbFVybHMudXJscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgcHJvdG9jb2xVcmwgb2YgaW5pdGlhbFByb3RvY29sVXJscy51cmxzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyhwcm90b2NvbFVybC51cmkucXVlcnkpO1xuXHRcdFx0XHRcdGlmIChwYXJhbXMuZ2V0KCd3aW5kb3dJZCcpID09PSAnX2JsYW5rJykge1xuXG5cdFx0XHRcdFx0XHQvLyBJdCBpcyBpbXBvcnRhbnQgaGVyZSB0aGF0IHdlIHJlbW92ZSBgd2luZG93SWQ9X2JsYW5rYCBmcm9tXG5cdFx0XHRcdFx0XHQvLyB0aGlzIFVSTCBiZWNhdXNlIGhlcmUgd2Ugb3BlbiBhbiBlbXB0eSB3aW5kb3cgZm9yIGl0LlxuXG5cdFx0XHRcdFx0XHRwYXJhbXMuZGVsZXRlKCd3aW5kb3dJZCcpO1xuXHRcdFx0XHRcdFx0cHJvdG9jb2xVcmwub3JpZ2luYWxVcmwgPSBwcm90b2NvbFVybC51cmkudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRcdFx0XHRwcm90b2NvbFVybC51cmkgPSBwcm90b2NvbFVybC51cmkud2l0aCh7IHF1ZXJ5OiBwYXJhbXMudG9TdHJpbmcoKSB9KTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIHdpbmRvd3NNYWluU2VydmljZS5vcGVuKHtcblx0XHRcdFx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0XHRcdFx0Y2xpOiBhcmdzLFxuXHRcdFx0XHRcdFx0XHRmb3JjZU5ld1dpbmRvdzogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0Zm9yY2VFbXB0eTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0Z290b0xpbmVNb2RlOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRpbml0aWFsU3RhcnR1cDogdHJ1ZVxuXHRcdFx0XHRcdFx0XHQvLyByZW1vdGVBdXRob3JpdHk6IHdpbGwgYmUgZGV0ZXJtaW5lZCBiYXNlZCBvbiBvcGVuYWJsZXNcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1hY09wZW5GaWxlczogc3RyaW5nW10gPSAoZ2xvYmFsIGFzIHsgbWFjT3BlbkZpbGVzPzogc3RyaW5nW10gfSkubWFjT3BlbkZpbGVzID8/IFtdO1xuXHRcdGNvbnN0IGhhc0NsaUFyZ3MgPSBhcmdzLl8ubGVuZ3RoO1xuXHRcdGNvbnN0IGhhc0ZvbGRlclVSSXMgPSAhIWFyZ3NbJ2ZvbGRlci11cmknXTtcblx0XHRjb25zdCBoYXNGaWxlVVJJcyA9ICEhYXJnc1snZmlsZS11cmknXTtcblx0XHRjb25zdCBub1JlY2VudEVudHJ5ID0gYXJnc1snc2tpcC1hZGQtdG8tcmVjZW50bHktb3BlbmVkJ10gPT09IHRydWU7XG5cdFx0Y29uc3Qgd2FpdE1hcmtlckZpbGVVUkkgPSBhcmdzLndhaXQgJiYgYXJncy53YWl0TWFya2VyRmlsZVBhdGggPyBVUkkuZmlsZShhcmdzLndhaXRNYXJrZXJGaWxlUGF0aCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gYXJncy5yZW1vdGUgfHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGZvcmNlUHJvZmlsZSA9IGFyZ3MucHJvZmlsZTtcblx0XHRjb25zdCBmb3JjZVRlbXBQcm9maWxlID0gYXJnc1sncHJvZmlsZS10ZW1wJ107XG5cblx0XHQvLyBTdGFydGVkIHdpdGhvdXQgZmlsZS9mb2xkZXIgYXJndW1lbnRzXG5cdFx0aWYgKCFoYXNDbGlBcmdzICYmICFoYXNGb2xkZXJVUklzICYmICFoYXNGaWxlVVJJcykge1xuXG5cdFx0XHQvLyBGb3JjZSBuZXcgd2luZG93XG5cdFx0XHRpZiAoYXJnc1snbmV3LXdpbmRvdyddIHx8IGZvcmNlUHJvZmlsZSB8fCBmb3JjZVRlbXBQcm9maWxlKSB7XG5cdFx0XHRcdHJldHVybiB3aW5kb3dzTWFpblNlcnZpY2Uub3Blbih7XG5cdFx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0XHRjbGk6IGFyZ3MsXG5cdFx0XHRcdFx0Zm9yY2VOZXdXaW5kb3c6IHRydWUsXG5cdFx0XHRcdFx0Zm9yY2VFbXB0eTogdHJ1ZSxcblx0XHRcdFx0XHRub1JlY2VudEVudHJ5LFxuXHRcdFx0XHRcdHdhaXRNYXJrZXJGaWxlVVJJLFxuXHRcdFx0XHRcdGluaXRpYWxTdGFydHVwOiB0cnVlLFxuXHRcdFx0XHRcdHJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0XHRmb3JjZVByb2ZpbGUsXG5cdFx0XHRcdFx0Zm9yY2VUZW1wUHJvZmlsZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gbWFjOiBvcGVuLWZpbGUgZXZlbnQgcmVjZWl2ZWQgb24gc3RhcnR1cFxuXHRcdFx0aWYgKG1hY09wZW5GaWxlcy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHdpbmRvd3NNYWluU2VydmljZS5vcGVuKHtcblx0XHRcdFx0XHRjb250ZXh0OiBPcGVuQ29udGV4dC5ET0NLLFxuXHRcdFx0XHRcdGNsaTogYXJncyxcblx0XHRcdFx0XHR1cmlzVG9PcGVuOiBtYWNPcGVuRmlsZXMubWFwKHBhdGggPT4ge1xuXHRcdFx0XHRcdFx0cGF0aCA9IG5vcm1hbGl6ZU5GQyhwYXRoKTsgLy8gbWFjT1Mgb25seTogbm9ybWFsaXplIHBhdGhzIHRvIE5GQyBmb3JtXG5cblx0XHRcdFx0XHRcdHJldHVybiAoaGFzV29ya3NwYWNlRmlsZUV4dGVuc2lvbihwYXRoKSA/IHsgd29ya3NwYWNlVXJpOiBVUkkuZmlsZShwYXRoKSB9IDogeyBmaWxlVXJpOiBVUkkuZmlsZShwYXRoKSB9KTtcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRub1JlY2VudEVudHJ5LFxuXHRcdFx0XHRcdHdhaXRNYXJrZXJGaWxlVVJJLFxuXHRcdFx0XHRcdGluaXRpYWxTdGFydHVwOiB0cnVlLFxuXHRcdFx0XHRcdC8vIHJlbW90ZUF1dGhvcml0eTogd2lsbCBiZSBkZXRlcm1pbmVkIGJhc2VkIG9uIG1hY09wZW5GaWxlc1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBkZWZhdWx0OiByZWFkIHBhdGhzIGZyb20gY2xpXG5cdFx0cmV0dXJuIHdpbmRvd3NNYWluU2VydmljZS5vcGVuKHtcblx0XHRcdGNvbnRleHQsXG5cdFx0XHRjbGk6IGFyZ3MsXG5cdFx0XHRmb3JjZU5ld1dpbmRvdzogYXJnc1snbmV3LXdpbmRvdyddLFxuXHRcdFx0ZGlmZk1vZGU6IGFyZ3MuZGlmZixcblx0XHRcdG1lcmdlTW9kZTogYXJncy5tZXJnZSxcblx0XHRcdG5vUmVjZW50RW50cnksXG5cdFx0XHR3YWl0TWFya2VyRmlsZVVSSSxcblx0XHRcdGdvdG9MaW5lTW9kZTogYXJncy5nb3RvLFxuXHRcdFx0aW5pdGlhbFN0YXJ0dXA6IHRydWUsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHksXG5cdFx0XHRmb3JjZVByb2ZpbGUsXG5cdFx0XHRmb3JjZVRlbXBQcm9maWxlXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFmdGVyV2luZG93T3BlbihpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogdm9pZCB7XG5cblx0XHQvLyBBY2N1cmF0ZSBXaW5kb3dzIHZlcnNpb24gaW5mb1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGluaXRXaW5kb3dzVmVyc2lvbkluZm8oKTtcblx0XHR9XG5cblx0XHQvLyBXaW5kb3dzOiBtdXRleFxuXHRcdHRoaXMuaW5zdGFsbE11dGV4KCk7XG5cblx0XHQvLyBSZW1vdGUgQXV0aG9yaXRpZXNcblx0XHRwcm90b2NvbC5yZWdpc3Rlckh0dHBQcm90b2NvbChTY2hlbWFzLnZzY29kZVJlbW90ZVJlc291cmNlLCAocmVxdWVzdCwgY2FsbGJhY2spID0+IHtcblx0XHRcdGNhbGxiYWNrKHtcblx0XHRcdFx0dXJsOiByZXF1ZXN0LnVybC5yZXBsYWNlKC9ednNjb2RlLXJlbW90ZS1yZXNvdXJjZTovLCAnaHR0cDonKSxcblx0XHRcdFx0bWV0aG9kOiByZXF1ZXN0Lm1ldGhvZFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyBTdGFydCB0byBmZXRjaCBzaGVsbCBlbnZpcm9ubWVudCAoaWYgbmVlZGVkKSBhZnRlciB3aW5kb3cgaGFzIG9wZW5lZFxuXHRcdC8vIFNpbmNlIHRoaXMgb3BlcmF0aW9uIGNhbiB0YWtlIGEgbG9uZyB0aW1lLCB3ZSB3YW50IHRvIHdhcm0gaXQgdXAgd2hpbGVcblx0XHQvLyB0aGUgd2luZG93IGlzIG9wZW5pbmcuXG5cdFx0Ly8gV2UgYWxzbyBzaG93IGFuIGVycm9yIHRvIHRoZSB1c2VyIGluIGNhc2UgdGhpcyBmYWlscy5cblx0XHR0aGlzLnJlc29sdmVTaGVsbEVudmlyb25tZW50KHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzLCBwcm9jZXNzLmVudiwgdHJ1ZSk7XG5cblx0XHQvLyBDcmFzaCByZXBvcnRlclxuXHRcdHRoaXMudXBkYXRlQ3Jhc2hSZXBvcnRlckVuYWJsZW1lbnQoKTtcblxuXHRcdC8vIG1hY09TOiByb3NldHRhIHRyYW5zbGF0aW9uIHdhcm5pbmdcblx0XHRpZiAoaXNNYWNpbnRvc2ggJiYgYXBwLnJ1bm5pbmdVbmRlckFSTTY0VHJhbnNsYXRpb24pIHtcblx0XHRcdHRoaXMud2luZG93c01haW5TZXJ2aWNlPy5zZW5kVG9Gb2N1c2VkKCd2c2NvZGU6c2hvd1RyYW5zbGF0ZWRCdWlsZFdhcm5pbmcnKTtcblx0XHR9XG5cblx0XHQvLyBQb3dlciB0ZWxlbWV0cnlcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdFx0dHlwZSBQb3dlckV2ZW50ID0ge1xuXHRcdFx0XHRyZWFkb25seSBpZGxlU3RhdGU6IHN0cmluZztcblx0XHRcdFx0cmVhZG9ubHkgaWRsZVRpbWU6IG51bWJlcjtcblx0XHRcdFx0cmVhZG9ubHkgdGhlcm1hbFN0YXRlOiBzdHJpbmc7XG5cdFx0XHRcdHJlYWRvbmx5IG9uQmF0dGVyeTogYm9vbGVhbjtcblx0XHRcdH07XG5cdFx0XHR0eXBlIFBvd2VyRXZlbnRDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0aWRsZVN0YXRlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHN5c3RlbSBpZGxlIHN0YXRlIChhY3RpdmUsIGlkbGUsIGxvY2tlZCwgdW5rbm93bikuJyB9O1xuXHRcdFx0XHRpZGxlVGltZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBzeXN0ZW0gaWRsZSB0aW1lIGluIHNlY29uZHMuJyB9O1xuXHRcdFx0XHR0aGVybWFsU3RhdGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgc3lzdGVtIHRoZXJtYWwgc3RhdGUgKHVua25vd24sIG5vbWluYWwsIGZhaXIsIHNlcmlvdXMsIGNyaXRpY2FsKS4nIH07XG5cdFx0XHRcdG9uQmF0dGVyeTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgdGhlIHN5c3RlbSBpcyBydW5uaW5nIG9uIGJhdHRlcnkgcG93ZXIuJyB9O1xuXHRcdFx0XHRvd25lcjogJ2Nocm1hcnRpJztcblx0XHRcdFx0Y29tbWVudDogJ1RyYWNrcyBPUyBwb3dlciBzdXNwZW5kIGFuZCByZXN1bWUgZXZlbnRzIGZvciByZWxpYWJpbGl0eSBpbnNpZ2h0cy4nO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZ2V0UG93ZXJFdmVudERhdGEgPSAoKTogUG93ZXJFdmVudCA9PiAoe1xuXHRcdFx0XHRpZGxlU3RhdGU6IHBvd2VyTW9uaXRvci5nZXRTeXN0ZW1JZGxlU3RhdGUoNjApLFxuXHRcdFx0XHRpZGxlVGltZTogcG93ZXJNb25pdG9yLmdldFN5c3RlbUlkbGVUaW1lKCksXG5cdFx0XHRcdHRoZXJtYWxTdGF0ZTogcG93ZXJNb25pdG9yLmdldEN1cnJlbnRUaGVybWFsU3RhdGUoKSxcblx0XHRcdFx0b25CYXR0ZXJ5OiBwb3dlck1vbml0b3IuaXNPbkJhdHRlcnlQb3dlcigpXG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIocG93ZXJNb25pdG9yLCAnc3VzcGVuZCcpKCgpID0+IHtcblx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFBvd2VyRXZlbnQsIFBvd2VyRXZlbnRDbGFzc2lmaWNhdGlvbj4oJ3Bvd2VyLnN1c3BlbmQnLCBnZXRQb3dlckV2ZW50RGF0YSgpKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIocG93ZXJNb25pdG9yLCAncmVzdW1lJykoKCkgPT4ge1xuXHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UG93ZXJFdmVudCwgUG93ZXJFdmVudENsYXNzaWZpY2F0aW9uPigncG93ZXIucmVzdW1lJywgZ2V0UG93ZXJFdmVudERhdGEoKSk7XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHQvLyBHUFUgY3Jhc2ggdGVsZW1ldHJ5IGZvciBza2lhIGdyYXBoaXRlIG91dCBvZiBvcmRlciByZWNvcmRpbmcgZmFpbHVyZXNcblx0XHQvLyBSZWZzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yODQxNjJcblx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0XHRcdHR5cGUgR1BVRmVhdHVyZVN0YXR1c1dpdGhTa2lhR3JhcGhpdGUgPSBHUFVGZWF0dXJlU3RhdHVzICYge1xuXHRcdFx0XHRcdHNraWFfZ3JhcGhpdGU6IHN0cmluZztcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbEdwdUZlYXR1cmVTdGF0dXMgPSBhcHAuZ2V0R1BVRmVhdHVyZVN0YXR1cygpIGFzIEdQVUZlYXR1cmVTdGF0dXNXaXRoU2tpYUdyYXBoaXRlO1xuXHRcdFx0XHRjb25zdCBza2lhR3JhcGhpdGVFbmFibGVkOiBzdHJpbmcgPSBpbml0aWFsR3B1RmVhdHVyZVN0YXR1c1snc2tpYV9ncmFwaGl0ZSddO1xuXHRcdFx0XHRpZiAoc2tpYUdyYXBoaXRlRW5hYmxlZCA9PT0gJ2VuYWJsZWQnKSB7XG5cdFx0XHRcdFx0Y29uc3QgZ3B1SW5mb1VwZGF0ZSA9IEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKGFwcCwgJ2dwdS1pbmZvLXVwZGF0ZScpO1xuXHRcdFx0XHRcdGNvbnN0IHBlbmRpbmdHcHVJbmZvTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXI8eyBkZXRhaWxzOiBEZXRhaWxzIH0+KGFwcCwgJ2NoaWxkLXByb2Nlc3MtZ29uZScsIChldmVudCwgZGV0YWlscykgPT4gKHsgZXZlbnQsIGRldGFpbHMgfSkpKCh7IGRldGFpbHMgfSkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGRldGFpbHMudHlwZSA9PT0gJ0dQVScgJiYgZGV0YWlscy5yZWFzb24gPT09ICdjcmFzaGVkJykge1xuXHRcdFx0XHRcdFx0XHQvLyBXYWl0IGZvciBncHUtaW5mby11cGRhdGUgd2hpY2ggZmlyZXMgYWZ0ZXIgdGhlIEdQVSBwcm9jZXNzXG5cdFx0XHRcdFx0XHRcdC8vIHJlc3RhcnRzIGFuZCB0aGUgZmVhdHVyZSBzdGF0dXMgaXMgcmVmcmVzaGVkLiBBdCB0aGUgdGltZVxuXHRcdFx0XHRcdFx0XHQvLyBjaGlsZC1wcm9jZXNzLWdvbmUgZmlyZXMsIGdldEdQVUZlYXR1cmVTdGF0dXMoKSBzdGlsbFxuXHRcdFx0XHRcdFx0XHQvLyByZXR1cm5zIHRoZSBwcmUtY3Jhc2ggc3RhdHVzLlxuXHRcdFx0XHRcdFx0XHRwZW5kaW5nR3B1SW5mb0xpc3RlbmVyLnZhbHVlID0gRXZlbnQub25jZShncHVJbmZvVXBkYXRlKSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudEdwdUZlYXR1cmVTdGF0dXMgPSBhcHAuZ2V0R1BVRmVhdHVyZVN0YXR1cygpO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRSYXN0ZXJpemF0aW9uU3RhdHVzOiBzdHJpbmcgPSBjdXJyZW50R3B1RmVhdHVyZVN0YXR1c1sncmFzdGVyaXphdGlvbiddO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChjdXJyZW50UmFzdGVyaXphdGlvblN0YXR1cyAhPT0gJ2VuYWJsZWQnKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBHZXQgbGFzdCAxMCBHUFUgbG9nIG1lc3NhZ2VzIChvbmx5IHRoZSBtZXNzYWdlIGZpZWxkKVxuXHRcdFx0XHRcdFx0XHRcdFx0bGV0IGdwdUxvZ01lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZSBBcHBXaXRoR1BVTG9nTWV0aG9kID0gdHlwZW9mIGFwcCAmIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Z2V0R1BVTG9nTWVzc2FnZXMoKTogSUdQVUxvZ01lc3NhZ2VbXTtcblx0XHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBjdXN0b21BcHAgPSBhcHAgYXMgQXBwV2l0aEdQVUxvZ01ldGhvZDtcblx0XHRcdFx0XHRcdFx0XHRcdGlmICh0eXBlb2YgY3VzdG9tQXBwLmdldEdQVUxvZ01lc3NhZ2VzID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGdwdUxvZ01lc3NhZ2VzID0gY3VzdG9tQXBwLmdldEdQVUxvZ01lc3NhZ2VzKCkuc2xpY2UoLTEwKS5tYXAobG9nID0+IGxvZy5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZSBHcHVDcmFzaEV2ZW50ID0ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZWFkb25seSBncHVGZWF0dXJlU3RhdHVzOiBzdHJpbmc7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJlYWRvbmx5IGdwdUxvZ01lc3NhZ2VzOiBzdHJpbmc7XG5cdFx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZSBHcHVDcmFzaENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRncHVGZWF0dXJlU3RhdHVzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnQ3VycmVudCBHUFUgZmVhdHVyZSBzdGF0dXMuJyB9O1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRncHVMb2dNZXNzYWdlczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0xhc3QgMTAgR1BVIGxvZyBtZXNzYWdlcyBjb2xsZWN0ZWQgYWZ0ZXIgdGhlIGNyYXNoIGFuZCBHUFUgcHJvY2VzcyByZXN0YXJ0LicgfTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0b3duZXI6ICdkZWVwYWsxNTU2Jztcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29tbWVudDogJ1RyYWNrcyBHUFUgcHJvY2VzcyBjcmFzaGVzIHRoYXQgd291bGQgcmVzdWx0IGluIGZhbGxiYWNrIG1vZGUuJztcblx0XHRcdFx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxHcHVDcmFzaEV2ZW50LCBHcHVDcmFzaENsYXNzaWZpY2F0aW9uPignZ3B1LmNyYXNoLmZhbGxiYWNrJywge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRncHVGZWF0dXJlU3RhdHVzOiBKU09OLnN0cmluZ2lmeShjdXJyZW50R3B1RmVhdHVyZVN0YXR1cyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGdwdUxvZ01lc3NhZ2VzOiBKU09OLnN0cmluZ2lmeShncHVMb2dNZXNzYWdlcylcblx0XHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHRpbnRlcmZhY2UgTmV0d29ya1Byb2Nlc3NMYXVuY2hlZERldGFpbHMge1xuXHRcdFx0XHRyZWFkb25seSBwaWQ6IG51bWJlcjtcblx0XHRcdH1cblx0XHRcdGludGVyZmFjZSBOZXR3b3JrUHJvY2Vzc0dvbmVEZXRhaWxzIHtcblx0XHRcdFx0cmVhZG9ubHkgcGlkOiBudW1iZXI7XG5cdFx0XHRcdHJlYWRvbmx5IGV4aXRDb2RlOiBudW1iZXI7XG5cdFx0XHRcdHJlYWRvbmx5IGNyYXNoZWQ6IGJvb2xlYW47XG5cdFx0XHRcdHJlYWRvbmx5IGNyYXNoZWRQcmVJUEM6IGJvb2xlYW47XG5cdFx0XHR9XG5cblx0XHRcdHR5cGUgQXBwV2l0aE5ldHdvcmtQcm9jZXNzRXZlbnRzID0gdHlwZW9mIGFwcCAmIHtcblx0XHRcdFx0b24oZXZlbnQ6ICduZXR3b3JrLXByb2Nlc3MtbGF1bmNoZWQnLCBsaXN0ZW5lcjogKGV2ZW50OiBFbGVjdHJvbi5FdmVudCwgZGV0YWlsczogTmV0d29ya1Byb2Nlc3NMYXVuY2hlZERldGFpbHMpID0+IHZvaWQpOiB0eXBlb2YgYXBwO1xuXHRcdFx0XHRvbihldmVudDogJ25ldHdvcmstcHJvY2Vzcy1nb25lJywgbGlzdGVuZXI6IChldmVudDogRWxlY3Ryb24uRXZlbnQsIGRldGFpbHM6IE5ldHdvcmtQcm9jZXNzR29uZURldGFpbHMpID0+IHZvaWQpOiB0eXBlb2YgYXBwO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgY3VzdG9tQXBwID0gYXBwIGFzIEFwcFdpdGhOZXR3b3JrUHJvY2Vzc0V2ZW50cztcblxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdFx0XHR0eXBlIE5ldHdvcmtQcm9jZXNzTGF1bmNoZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRvd25lcjogJ2RlZXBhazE1NTYnO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdUcmFja3MgbmV0d29yayBwcm9jZXNzIGxhdW5jaCBldmVudHMuJztcblx0XHRcdFx0fTtcblxuXHRcdFx0XHR0eXBlIE5ldHdvcmtQcm9jZXNzR29uZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdGV4aXRDb2RlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIGV4aXQgY29kZSBvZiB0aGUgbmV0d29yayBwcm9jZXNzLicgfTtcblx0XHRcdFx0XHRjcmFzaGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnV2hldGhlciB0aGUgbmV0d29yayBwcm9jZXNzIGNyYXNoZWQuJyB9O1xuXHRcdFx0XHRcdGNyYXNoZWRQcmVJUEM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBuZXR3b3JrIHByb2Nlc3MgY3Jhc2hlZCBiZWZvcmUgSVBDIHdhcyBlc3RhYmxpc2hlZC4nIH07XG5cdFx0XHRcdFx0b3duZXI6ICdkZWVwYWsxNTU2Jztcblx0XHRcdFx0XHRjb21tZW50OiAnVHJhY2tzIG5ldHdvcmsgcHJvY2VzcyBnb25lIGV2ZW50cyBmb3IgcmVsaWFiaWxpdHkgaW5zaWdodHMuJztcblx0XHRcdFx0fTtcblxuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcjxOZXR3b3JrUHJvY2Vzc0xhdW5jaGVkRGV0YWlscz4oY3VzdG9tQXBwLCAnbmV0d29yay1wcm9jZXNzLWxhdW5jaGVkJywgKF9ldmVudCwgZGV0YWlscykgPT4gZGV0YWlscykoZGV0YWlscyA9PiB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtuZXR3b3JrIHByb2Nlc3NdIGxhdW5jaGVkIHdpdGggcGlkICR7ZGV0YWlscy5waWR9YCk7XG5cblx0XHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8e30sIE5ldHdvcmtQcm9jZXNzTGF1bmNoZWRDbGFzc2lmaWNhdGlvbj4oJ25ldHdvcmtQcm9jZXNzLmxhdW5jaGVkJywge30pO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXI8TmV0d29ya1Byb2Nlc3NHb25lRGV0YWlscz4oY3VzdG9tQXBwLCAnbmV0d29yay1wcm9jZXNzLWdvbmUnLCAoX2V2ZW50LCBkZXRhaWxzKSA9PiBkZXRhaWxzKShkZXRhaWxzID0+IHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgW25ldHdvcmsgcHJvY2Vzc10gZ29uZSAtIHBpZDogJHtkZXRhaWxzLnBpZH0sIGV4aXRDb2RlOiAke2RldGFpbHMuZXhpdENvZGV9LCBjcmFzaGVkOiAke2RldGFpbHMuY3Jhc2hlZH0sIGNyYXNoZWRQcmVJUEM6ICR7ZGV0YWlscy5jcmFzaGVkUHJlSVBDfWApO1xuXG5cdFx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgZXhpdENvZGU6IG51bWJlcjsgY3Jhc2hlZDogYm9vbGVhbjsgY3Jhc2hlZFByZUlQQzogYm9vbGVhbiB9LCBOZXR3b3JrUHJvY2Vzc0dvbmVDbGFzc2lmaWNhdGlvbj4oJ25ldHdvcmtQcm9jZXNzLmdvbmUnLCB7XG5cdFx0XHRcdFx0XHRleGl0Q29kZTogZGV0YWlscy5leGl0Q29kZSxcblx0XHRcdFx0XHRcdGNyYXNoZWQ6IGRldGFpbHMuY3Jhc2hlZCxcblx0XHRcdFx0XHRcdGNyYXNoZWRQcmVJUEM6IGRldGFpbHMuY3Jhc2hlZFByZUlQQ1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5zdGFsbE11dGV4KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbjMyTXV0ZXhOYW1lID0gdGhpcy5wcm9kdWN0U2VydmljZS53aW4zMk11dGV4TmFtZTtcblx0XHRpZiAoaXNXaW5kb3dzICYmIHdpbjMyTXV0ZXhOYW1lICYmIGlzSW5ub1NldHVwSW5zdGFsbCgpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBXaW5kb3dzTXV0ZXggPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvd2luZG93cy1tdXRleCcpO1xuXHRcdFx0XHRjb25zdCBtdXRleCA9IG5ldyBXaW5kb3dzTXV0ZXguTXV0ZXgod2luMzJNdXRleE5hbWUpO1xuXHRcdFx0XHRFdmVudC5vbmNlKHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2Uub25XaWxsU2h1dGRvd24pKCgpID0+IG11dGV4LnJlbGVhc2UoKSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZVNoZWxsRW52aXJvbm1lbnQoYXJnczogTmF0aXZlUGFyc2VkQXJncywgZW52OiBJUHJvY2Vzc0Vudmlyb25tZW50LCBub3RpZnlPbkVycm9yOiBib29sZWFuKTogUHJvbWlzZTx0eXBlb2YgcHJvY2Vzcy5lbnY+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IGdldFJlc29sdmVkU2hlbGxFbnYodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlLCBhcmdzLCBlbnYpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSB0b0Vycm9yTWVzc2FnZShlcnJvcik7XG5cdFx0XHRpZiAobm90aWZ5T25FcnJvcikge1xuXHRcdFx0XHR0aGlzLndpbmRvd3NNYWluU2VydmljZT8uc2VuZFRvRm9jdXNlZCgndnNjb2RlOnNob3dSZXNvbHZlU2hlbGxFbnZFcnJvcicsIGVycm9yTWVzc2FnZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3JNZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUNyYXNoUmVwb3J0ZXJFbmFibGVtZW50KCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gSWYgZW5hYmxlLWNyYXNoLXJlcG9ydGVyIGFyZ3YgaXMgdW5kZWZpbmVkIHRoZW4gdGhpcyBpcyBhIGZyZXNoIHN0YXJ0LFxuXHRcdC8vIGJhc2VkIG9uIGB0ZWxlbWV0cnkuZW5hYmxlQ3Jhc2hyZXBvcnRlcmAgc2V0dGluZ3MsIGdlbmVyYXRlIGEgVVVJRCB3aGljaFxuXHRcdC8vIHdpbGwgYmUgdXNlZCBhcyBjcmFzaCByZXBvcnRlciBpZCBhbmQgYWxzbyB1cGRhdGUgdGhlIGpzb24gZmlsZS5cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhcmd2Q29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3ZSZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBhcmd2U3RyaW5nID0gYXJndkNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGFyZ3ZKU09OID0gcGFyc2U8eyAnZW5hYmxlLWNyYXNoLXJlcG9ydGVyJz86IGJvb2xlYW4gfT4oYXJndlN0cmluZyk7XG5cdFx0XHRjb25zdCB0ZWxlbWV0cnlMZXZlbCA9IGdldFRlbGVtZXRyeUxldmVsKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZW5hYmxlQ3Jhc2hSZXBvcnRlciA9IHRlbGVtZXRyeUxldmVsID49IFRlbGVtZXRyeUxldmVsLkNSQVNIO1xuXG5cdFx0XHQvLyBJbml0aWFsIHN0YXJ0dXBcblx0XHRcdGlmIChhcmd2SlNPTlsnZW5hYmxlLWNyYXNoLXJlcG9ydGVyJ10gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBhZGRpdGlvbmFsQXJndkNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0J1x0Ly8gQWxsb3dzIHRvIGRpc2FibGUgY3Jhc2ggcmVwb3J0aW5nLicsXG5cdFx0XHRcdFx0J1x0Ly8gU2hvdWxkIHJlc3RhcnQgdGhlIGFwcCBpZiB0aGUgdmFsdWUgaXMgY2hhbmdlZC4nLFxuXHRcdFx0XHRcdGBcdFwiZW5hYmxlLWNyYXNoLXJlcG9ydGVyXCI6ICR7ZW5hYmxlQ3Jhc2hSZXBvcnRlcn0sYCxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnXHQvLyBVbmlxdWUgaWQgdXNlZCBmb3IgY29ycmVsYXRpbmcgY3Jhc2ggcmVwb3J0cyBzZW50IGZyb20gdGhpcyBpbnN0YW5jZS4nLFxuXHRcdFx0XHRcdCdcdC8vIERvIG5vdCBlZGl0IHRoaXMgdmFsdWUuJyxcblx0XHRcdFx0XHRgXHRcImNyYXNoLXJlcG9ydGVyLWlkXCI6IFwiJHtnZW5lcmF0ZVV1aWQoKX1cImAsXG5cdFx0XHRcdFx0J30nXG5cdFx0XHRcdF07XG5cdFx0XHRcdGNvbnN0IG5ld0FyZ3ZTdHJpbmcgPSBhcmd2U3RyaW5nLnN1YnN0cmluZygwLCBhcmd2U3RyaW5nLmxlbmd0aCAtIDIpLmNvbmNhdCgnLFxcbicsIGFkZGl0aW9uYWxBcmd2Q29udGVudC5qb2luKCdcXG4nKSk7XG5cblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3ZSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdBcmd2U3RyaW5nKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN1YnNlcXVlbnQgc3RhcnR1cDogdXBkYXRlIGNyYXNoIHJlcG9ydGVyIHZhbHVlIGlmIGNoYW5nZWRcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRjb25zdCBuZXdBcmd2U3RyaW5nID0gYXJndlN0cmluZy5yZXBsYWNlKC9cImVuYWJsZS1jcmFzaC1yZXBvcnRlclwiOiAuKiwvLCBgXCJlbmFibGUtY3Jhc2gtcmVwb3J0ZXJcIjogJHtlbmFibGVDcmFzaFJlcG9ydGVyfSxgKTtcblx0XHRcdFx0aWYgKG5ld0FyZ3ZTdHJpbmcgIT09IGFyZ3ZTdHJpbmcpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJndlJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0FyZ3ZTdHJpbmcpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXG5cdFx0XHQvLyBJbmZvcm0gdGhlIHVzZXIgdmlhIG5vdGlmaWNhdGlvblxuXHRcdFx0dGhpcy53aW5kb3dzTWFpblNlcnZpY2U/LnNlbmRUb0ZvY3VzZWQoJ3ZzY29kZTpzaG93QXJndlBhcnNlV2FybmluZycpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZXZlbnR1YWxseUFmdGVyV2luZG93T3BlbihpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogdm9pZCB7XG5cblx0XHQvLyBWYWxpZGF0ZSBEZXZpY2UgSUQgaXMgdXAgdG8gZGF0ZSAoZGVsYXkgdGhpcyBhcyBpdCBoYXMgc2hvd24gc2lnbmlmaWNhbnQgcGVyZiBpbXBhY3QpXG5cdFx0Ly8gUmVmczogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIzNDA2NFxuXHRcdHZhbGlkYXRlRGV2RGV2aWNlSWQodGhpcy5zdGF0ZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRcdGlmICh0ZWxlbWV0cnlTZXJ2aWNlLnRlbGVtZXRyeUxldmVsIDwgVGVsZW1ldHJ5TGV2ZWwuVVNBR0UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBuYXRpdmVIb3N0TWFpblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5hdGl2ZUhvc3RNYWluU2VydmljZSk7XG5cdFx0XHR2b2lkIHRoaXMubG9nT1NQcm94eUNvbmZpZ1RlbGVtZXRyeShuYXRpdmVIb3N0TWFpblNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsb2dPU1Byb3h5Q29uZmlnVGVsZW1ldHJ5KG5hdGl2ZUhvc3RNYWluU2VydmljZTogSU5hdGl2ZUhvc3RNYWluU2VydmljZSwgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb25maWcgPSBhd2FpdCBuYXRpdmVIb3N0TWFpblNlcnZpY2UucmVhZFByb3h5Q29uZmlnV2l0aFBhY2thZ2UodW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGR1cmF0aW9uTXMgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuXHRcdFx0Y29uc3QgcGFjU2NyaXB0U3RhdHMgPSBjb25maWcucGFjID8gZ2V0UEFDU2NyaXB0U3RhdHMoY29uZmlnLnBhYy5jb250ZW50KSA6IHVuZGVmaW5lZDtcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxPU1Byb3h5Q29uZmlnRXZlbnQsIE9TUHJveHlDb25maWdDbGFzc2lmaWNhdGlvbj4oJ29zUHJveHlDb25maWcnLCB7XG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdGR1cmF0aW9uTXMsXG5cdFx0XHRcdHBsYXRmb3JtS2luZDogY29uZmlnLnBsYXRmb3JtPy5raW5kID8/ICdub25lJyxcblx0XHRcdFx0YXV0b0RldGVjdDogY29uZmlnLmF1dG9EZXRlY3QsXG5cdFx0XHRcdGh0dHBQcm94eUVudmlyb25tZW50U3RhdGU6IGdldE9TUHJveHlFbnZpcm9ubWVudFN0YXRlKGNvbmZpZy5lbnZpcm9ubWVudC5odHRwUHJveHkpLFxuXHRcdFx0XHRodHRwc1Byb3h5RW52aXJvbm1lbnRTdGF0ZTogZ2V0T1NQcm94eUVudmlyb25tZW50U3RhdGUoY29uZmlnLmVudmlyb25tZW50Lmh0dHBzUHJveHkpLFxuXHRcdFx0XHRhbGxQcm94eUVudmlyb25tZW50U3RhdGU6IGdldE9TUHJveHlFbnZpcm9ubWVudFN0YXRlKGNvbmZpZy5lbnZpcm9ubWVudC5hbGxQcm94eSksXG5cdFx0XHRcdG5vUHJveHlFbnZpcm9ubWVudFN0YXRlOiBnZXRPU1Byb3h5RW52aXJvbm1lbnRTdGF0ZShjb25maWcuZW52aXJvbm1lbnQubm9Qcm94eSksXG5cdFx0XHRcdHdwYWREaGNwU3RhdGU6IGNvbmZpZy53cGFkRGhjcC5zdGF0ZSxcblx0XHRcdFx0d3BhZERuc1N0YXRlOiBjb25maWcud3BhZERucy5zdGF0ZSxcblx0XHRcdFx0Y29uZmlndXJlZFBhY1N0YXRlOiBjb25maWcuY29uZmlndXJlZFBhYy5zdGF0ZSxcblx0XHRcdFx0aGFzQ29uZmlndXJlZFBhYzogISFjb25maWcucGFjVXJsLFxuXHRcdFx0XHRoYXNMb2FkZWRQYWM6ICEhY29uZmlnLnBhYyxcblx0XHRcdFx0cGFjU291cmNlOiBjb25maWcucGFjPy5zb3VyY2UgPz8gJ25vbmUnLFxuXHRcdFx0XHRwYWNTY3JpcHRDaGFyYWN0ZXJDb3VudDogcGFjU2NyaXB0U3RhdHM/LmNoYXJhY3RlckNvdW50LFxuXHRcdFx0XHRwYWNTY3JpcHRMaW5lQ291bnQ6IHBhY1NjcmlwdFN0YXRzPy5saW5lQ291bnQsXG5cdFx0XHRcdHBhY1NjcmlwdFJldHVybkNvdW50OiBwYWNTY3JpcHRTdGF0cz8ucmV0dXJuQ291bnQsXG5cdFx0XHRcdGhhc0h0dHBQcm94eTogISFjb25maWcuc3RhdGljUnVsZXM/Lmh0dHAsXG5cdFx0XHRcdGhhc0h0dHBzUHJveHk6ICEhY29uZmlnLnN0YXRpY1J1bGVzPy5odHRwcyxcblx0XHRcdFx0aGFzU29ja3NQcm94eTogISFjb25maWcuc3RhdGljUnVsZXM/LnNvY2tzLFxuXHRcdFx0XHRoYXNCeXBhc3NSdWxlczogaGFzT1NQcm94eUJ5cGFzc1J1bGVzKGNvbmZpZyksXG5cdFx0XHRcdGV4Y2x1ZGVTaW1wbGVIb3N0bmFtZXM6IGNvbmZpZy5wbGF0Zm9ybT8ua2luZCA9PT0gJ21hY29zJyA/IGNvbmZpZy5wbGF0Zm9ybS5leGNsdWRlU2ltcGxlSG9zdG5hbWVzIDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8T1NQcm94eUNvbmZpZ0V2ZW50LCBPU1Byb3h5Q29uZmlnQ2xhc3NpZmljYXRpb24+KCdvc1Byb3h5Q29uZmlnJywge1xuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0ZHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBoYXNPU1Byb3h5QnlwYXNzUnVsZXMoY29uZmlnOiBJT1NQcm94eUNvbmZpZyk6IGJvb2xlYW4ge1xuXHRzd2l0Y2ggKGNvbmZpZy5wbGF0Zm9ybT8ua2luZCkge1xuXHRcdGNhc2UgJ3dpbmRvd3MnOiByZXR1cm4gISFjb25maWcucGxhdGZvcm0ucHJveHlCeXBhc3M7XG5cdFx0Y2FzZSAnbWFjb3MnOiByZXR1cm4gY29uZmlnLnBsYXRmb3JtLmV4Y2x1ZGVTaW1wbGVIb3N0bmFtZXMgfHwgY29uZmlnLnBsYXRmb3JtLmV4Y2VwdGlvbnMubGVuZ3RoID4gMDtcblx0XHRjYXNlICdsaW51eCc6IHJldHVybiBjb25maWcucGxhdGZvcm0uaWdub3JlSG9zdHMubGVuZ3RoID4gMDtcblx0XHRkZWZhdWx0OiByZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0T1NQcm94eUVudmlyb25tZW50U3RhdGUoc3RhdHVzOiBJT1NQcm94eUNvbmZpZ1snZW52aXJvbm1lbnQnXVsnaHR0cFByb3h5J10pOiAndW5zZXQnIHwgJ2NvbmZpZ3VyZWQnIHwgJ2ludmFsaWQnIHtcblx0cmV0dXJuIHN0YXR1cyA/IHN0YXR1cy5lcnJvciA/ICdpbnZhbGlkJyA6ICdjb25maWd1cmVkJyA6ICd1bnNldCc7XG59XG5cbmZ1bmN0aW9uIGdldFBBQ1NjcmlwdFN0YXRzKGNvbnRlbnQ6IHN0cmluZyk6IHsgY2hhcmFjdGVyQ291bnQ6IG51bWJlcjsgbGluZUNvdW50OiBudW1iZXI7IHJldHVybkNvdW50OiBudW1iZXIgfSB7XG5cdHJldHVybiB7XG5cdFx0Y2hhcmFjdGVyQ291bnQ6IGNvbnRlbnQubGVuZ3RoLFxuXHRcdGxpbmVDb3VudDogY29udGVudC5sZW5ndGggPT09IDAgPyAwIDogY29udGVudC5zcGxpdCgvXFxyXFxufFxccnxcXG4vKS5sZW5ndGgsXG5cdFx0cmV0dXJuQ291bnQ6IGNvbnRlbnQubWF0Y2goL1xcYnJldHVyblxcYi9nKT8ubGVuZ3RoID8/IDAsXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsS0FBSyxlQUFlLGlCQUEwQixnQkFBa0MsY0FBYyxVQUFVLFVBQVUsZ0JBQWdCLFNBQWtCLHlCQUF1QztBQUNwTSxTQUFTLHVCQUF1QixvQ0FBb0M7QUFDcEUsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxVQUFVLGVBQWU7QUFDbEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYTtBQUN0QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFlBQVksaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFDN0UsU0FBUyxTQUFTLHdCQUF3QjtBQUMxQyxTQUFTLE1BQU0sYUFBYTtBQUM1QixTQUE4QixTQUFTLGFBQWEsYUFBYSxXQUFXLFVBQVU7QUFDdEYsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsbUJBQW1CLGNBQWMsb0JBQW9CO0FBQzlELFNBQVMsVUFBVSx5QkFBeUI7QUFDNUMsU0FBUyxVQUFVLHlCQUF5QjtBQUU1QyxTQUFTLG1CQUFtQix3QkFBd0I7QUFDcEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrREFBa0Q7QUFDM0QsU0FBUywyQkFBMkM7QUFDcEQsU0FBUyx3QkFBd0IsK0JBQStCO0FBQ2hFLFNBQVMsbUJBQW1CLDBCQUEwQjtBQUN0RCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHdCQUF3QiwrQkFBK0I7QUFDaEUsU0FBUyw2QkFBNkIsb0NBQW9DO0FBRTFFLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCLDBDQUEwQztBQUMxRSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLDhCQUE4Qiw0QkFBNEIsc0NBQXNDO0FBQ3pHLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNEJBQTRCLGlDQUFpQztBQUN0RSxTQUFTLG9CQUFvQix5QkFBeUI7QUFDdEQsU0FBUyx1QkFBdUIsb0JBQW9CLHNCQUFzQjtBQUMxRSxTQUFTLGdCQUFnQixtQkFBbUI7QUFDNUMsU0FBUyxxQkFBcUIsMEJBQTBCO0FBRXhELFNBQVMsd0JBQXdCLDZCQUE2QjtBQUM5RCxTQUFTLDhCQUE4QixxQ0FBcUM7QUFDNUUsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywrQkFBK0IsZ0NBQWdDLHFCQUFxQiwwQkFBMEI7QUFDdkgsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQVMsK0JBQStCO0FBQ3hDLFNBQWtDLHdCQUF3QjtBQUMxRCxTQUFTLDRCQUE0QixtQkFBbUIscUJBQXFCLHNCQUFzQix5QkFBeUI7QUFDNUgsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywwQkFBMEI7QUFDbkMsU0FBMEIsbUJBQW1CO0FBQzdDLFNBQVMseUJBQXlCLHdCQUF3QjtBQUMxRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdCQUFnQix5QkFBMEM7QUFDbkUsU0FBUyxpQ0FBaUMscUJBQXFCLG1CQUFtQjtBQUVsRixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtCQUErQixvQ0FBb0M7QUFDNUUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQ0FBa0MsdUNBQXVDO0FBQ2xGLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQStCLG1DQUFtQztBQUMzRSxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDRDQUE0QztBQUNyRCxTQUFTLFVBQVUsa0JBQWtCLHlCQUF5QjtBQUM5RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQixjQUFjLG9CQUFvQiwyQkFBMkI7QUFDeEYsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxrQ0FBa0MsdUNBQXVDO0FBQ2xGLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsa0JBQWtCLHlCQUF5QixxQkFBcUIseUJBQXlCO0FBQ2xHLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsbUNBQW1DLHNDQUFrRSxnQ0FBZ0M7QUFDOUksU0FBUyxZQUFZO0FBQ3JCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsd0JBQXdCLDZCQUE2QjtBQUM5RCxTQUFTLGtDQUFrQywyQ0FBMkM7QUFDdEYsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxvQkFBb0IsNkJBQTZCO0FBQzFELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsMkJBQTJCLGtDQUFrQztBQUN0RSxTQUFTLHlCQUF5QixrQ0FBa0M7QUFDcEUsT0FBTyxvQkFBb0I7QUEwRHBCLElBQU0sa0JBQU4sY0FBOEIsV0FBVztBQUFBLEVBVy9DLFlBQ2tCLDBCQUNBLFNBQ3VCLDBCQUNWLFlBQ0csZUFDUyx3QkFDRixzQkFDQSxzQkFDUixjQUNELGFBQ0csZ0JBQ2EsNkJBQzlDO0FBQ0QsVUFBTTtBQWJXO0FBQ0E7QUFDdUI7QUFDVjtBQUNHO0FBQ1M7QUFDRjtBQUNBO0FBQ1I7QUFDRDtBQUNHO0FBQ2E7QUFJL0MsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxrQkFBa0I7QUFBQSxFQUN4QjtBQUFBLEVBRVEsbUJBQXlCO0FBT2hDLFVBQU0sa0JBQWtCLENBQUMsa0JBQXVDLGVBQWUsV0FBVyxHQUFHLFFBQVEsa0JBQWtCLE1BQU0sZ0JBQWdCLEVBQUU7QUFDL0ksVUFBTSxtQkFBbUIsQ0FBQyxrQkFBc0MsZUFBZSxXQUFXLEdBQUcsUUFBUSxhQUFhLEtBQUs7QUFFdkgsVUFBTSwyQkFBMkIsb0JBQUksSUFBSSxDQUFDLGVBQWUsZUFBZSxDQUFDO0FBRXpFLFVBQU0sOEJBQThCLG9CQUFJLElBQUk7QUFBQSxNQUMzQyxHQUFHO0FBQUEsTUFDSDtBQUFBLE1BQ0E7QUFBQTtBQUFBO0FBQUEsTUFHQTtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sMkJBQTJCLG9CQUFJLElBQUk7QUFBQSxNQUN4QyxHQUFHO0FBQUEsTUFDSDtBQUFBLE1BQ0E7QUFBQTtBQUFBO0FBQUEsTUFHQTtBQUFBLElBQ0QsQ0FBQztBQUVELFlBQVEsZUFBZSw0QkFBNEIsQ0FBQyxjQUFjLFlBQVksVUFBVSxZQUFZO0FBQ25HLFVBQUksaUJBQWlCLFFBQVEsYUFBYSxHQUFHO0FBQzVDLGVBQU8sU0FBUyw0QkFBNEIsSUFBSSxVQUFVLENBQUM7QUFBQSxNQUM1RDtBQUNBLFVBQUksZ0JBQWdCLFFBQVEsYUFBYSxHQUFHO0FBQzNDLGVBQU8sU0FBUyx5QkFBeUIsSUFBSSxVQUFVLENBQUM7QUFBQSxNQUN6RDtBQUNBLGFBQU8sU0FBUyxLQUFLO0FBQUEsSUFDdEIsQ0FBQztBQUVELFlBQVEsZUFBZSwwQkFBMEIsQ0FBQyxjQUFjLFlBQVksU0FBUyxZQUFZO0FBQ2hHLFVBQUksaUJBQWlCLFFBQVEsYUFBYSxHQUFHO0FBQzVDLGVBQU8sNEJBQTRCLElBQUksVUFBVTtBQUFBLE1BQ2xEO0FBQ0EsVUFBSSxnQkFBZ0IsUUFBUSxhQUFhLEdBQUc7QUFDM0MsZUFBTyx5QkFBeUIsSUFBSSxVQUFVO0FBQUEsTUFDL0M7QUFDQSxhQUFPO0FBQUEsSUFDUixDQUFDO0FBRUQsUUFBSTtBQUNKLFVBQU0sOEJBQThCLE1BQU07QUFDekMsNEJBQXNCO0FBQUEsSUFDdkI7QUFDQSxtQkFBZSxHQUFHLGlCQUFpQiwyQkFBMkI7QUFDOUQsbUJBQWUsR0FBRyxtQkFBbUIsMkJBQTJCO0FBQ2hFLG1CQUFlLEdBQUcsMkJBQTJCLDJCQUEyQjtBQUN4RSxTQUFLLFVBQVUsYUFBYSxNQUFNO0FBQ2pDLHFCQUFlLElBQUksaUJBQWlCLDJCQUEyQjtBQUMvRCxxQkFBZSxJQUFJLG1CQUFtQiwyQkFBMkI7QUFDakUscUJBQWUsSUFBSSwyQkFBMkIsMkJBQTJCO0FBQUEsSUFDMUUsQ0FBQyxDQUFDO0FBQ0YsWUFBUSxlQUFlLDhCQUE4QixPQUFPLFNBQVMsYUFBYTtBQUNqRixVQUFJO0FBQ0gsY0FBTSxRQUFRLFFBQVE7QUFDdEIsY0FBTSxNQUFNLFFBQVEsY0FBYyxjQUFjLEVBQUUsS0FBSyxPQUFLLEVBQUUsWUFBWSxjQUFjLEtBQUssSUFBSTtBQUVqRyxjQUFNLFdBQVcsZUFBZSxlQUFlO0FBQy9DLFlBQUksZ0JBQWdCLFNBQVMsQ0FBQztBQUM5QixZQUFJLEtBQUs7QUFDUixnQkFBTSxZQUFZLElBQUksVUFBVTtBQUNoQywwQkFBZ0IsZUFBZSx1QkFBdUI7QUFBQSxZQUNyRCxHQUFHLFVBQVUsSUFBSSxVQUFVLFFBQVE7QUFBQSxZQUNuQyxHQUFHLFVBQVUsSUFBSSxVQUFVLFNBQVM7QUFBQSxVQUNyQyxDQUFDO0FBQUEsUUFDRjtBQUVBLFlBQUksQ0FBQyxxQkFBcUI7QUFDekIsZ0NBQXNCLE1BQU0sZ0JBQWdCLFdBQVc7QUFBQSxZQUN0RCxPQUFPLENBQUMsUUFBUTtBQUFBLFlBQ2hCLGVBQWUsRUFBRSxPQUFPLEdBQUcsUUFBUSxFQUFFO0FBQUEsVUFDdEMsQ0FBQztBQUFBLFFBQ0Y7QUFFQSxZQUFJLFFBQVEsb0JBQW9CLEtBQUssT0FBSyxFQUFFLGVBQWUsT0FBTyxjQUFjLEVBQUUsQ0FBQztBQUNuRixZQUFJLENBQUMsT0FBTztBQUVYLGdDQUFzQixNQUFNLGdCQUFnQixXQUFXO0FBQUEsWUFDdEQsT0FBTyxDQUFDLFFBQVE7QUFBQSxZQUNoQixlQUFlLEVBQUUsT0FBTyxHQUFHLFFBQVEsRUFBRTtBQUFBLFVBQ3RDLENBQUM7QUFDRCxrQkFBUSxvQkFBb0IsS0FBSyxPQUFLLEVBQUUsZUFBZSxPQUFPLGNBQWMsRUFBRSxDQUFDO0FBQUEsUUFDaEY7QUFFQSxjQUFNLFNBQVMsU0FBUyxvQkFBb0IsQ0FBQztBQUM3QyxZQUFJLENBQUMsUUFBUTtBQUVaLG1CQUFTLENBQUMsQ0FBQztBQUNYO0FBQUEsUUFDRDtBQUNBLGlCQUFTLEVBQUUsT0FBTyxPQUFPLENBQUM7QUFBQSxNQUMzQixRQUFRO0FBQ1AsaUJBQVMsQ0FBQyxDQUFDO0FBQUEsTUFDWjtBQUFBLElBQ0QsQ0FBQztBQU9ELFVBQU0sc0JBQXNCLG9CQUFJLElBQUksQ0FBQyxRQUFRLE1BQU0sUUFBUSxvQkFBb0IsUUFBUSxzQkFBc0IsUUFBUSw2QkFBNkIsVUFBVSxDQUFDO0FBRzdKLFVBQU0sY0FBYyxDQUFDLGlCQUEyRDtBQUMvRSxlQUFTLFFBQXlDLGNBQWMsT0FBTyxRQUFRLE1BQU0sUUFBUTtBQU01RixZQUFJLE1BQU0sWUFBWSxHQUFHO0FBQ3hCLGlCQUFPO0FBQUEsUUFDUjtBQUNBLFlBQUksTUFBTSxJQUFJLFdBQVcsR0FBRyxRQUFRLGFBQWEsS0FBSyxHQUFHO0FBQ3hELGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sOEJBQThCLENBQUMsWUFBMEc7QUFDOUksYUFBTyxRQUFRLGlCQUFpQixTQUFTLFlBQVksUUFBUSxLQUFLO0FBQUEsSUFDbkU7QUFFQSxVQUFNLDZCQUE2QixDQUFDLFlBQXFEO0FBQ3hGLFlBQU0sUUFBUSxRQUFRO0FBQ3RCLFVBQUksQ0FBQyxTQUFTLE1BQU0sWUFBWSxLQUFLLENBQUMsS0FBSyxvQkFBb0I7QUFDOUQsZUFBTztBQUFBLE1BQ1I7QUFHQSxZQUFNLFVBQVUsZ0NBQWdDO0FBQ2hELGlCQUFXLFVBQVUsU0FBUztBQUM3QixZQUFJLE1BQU0sY0FBYyxPQUFPLFlBQVksVUFBVSxXQUFXO0FBQy9ELGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sMEJBQTBCLENBQUMsS0FBVSxZQUE4RDtBQUN4RyxVQUFJLElBQUksU0FBUyxlQUFlO0FBQy9CLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxRQUFRLFFBQVE7QUFDdEIsVUFBSSxDQUFDLFNBQVMsTUFBTSxZQUFZLEtBQUssQ0FBQyxLQUFLLG9CQUFvQjtBQUM5RCxlQUFPO0FBQUEsTUFDUjtBQUdBLGlCQUFXLFVBQVUsS0FBSyxtQkFBbUIsV0FBVyxHQUFHO0FBQzFELFlBQUksT0FBTyxLQUFLO0FBQ2YsY0FBSSxNQUFNLGNBQWMsT0FBTyxJQUFJLFlBQVksVUFBVSxXQUFXO0FBQ25FLG1CQUFPO0FBQUEsVUFDUjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLElBQ1I7QUFFQSxZQUFRLGVBQWUsV0FBVyxnQkFBZ0IsQ0FBQyxTQUFTLGFBQWE7QUFDeEUsWUFBTSxNQUFNLElBQUksTUFBTSxRQUFRLEdBQUc7QUFDakMsVUFBSSxJQUFJLFdBQVcsUUFBUSxlQUFlO0FBQ3pDLFlBQUksQ0FBQyx3QkFBd0IsS0FBSyxPQUFPLEdBQUc7QUFDM0MsZUFBSyxXQUFXLE1BQU0sa0NBQWtDLFFBQVEsR0FBRztBQUNuRSxpQkFBTyxTQUFTLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFBQSxRQUNqQztBQUFBLE1BQ0Q7QUFFQSxVQUFJLElBQUksV0FBVyxRQUFRLG9CQUFvQjtBQUM5QyxZQUFJLENBQUMsMkJBQTJCLE9BQU8sR0FBRztBQUN6QyxlQUFLLFdBQVcsTUFBTSwrQkFBK0IsUUFBUSxHQUFHO0FBQ2hFLGlCQUFPLFNBQVMsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLFFBQ2pDO0FBQUEsTUFDRDtBQUdBLFVBQUksSUFBSSxLQUFLLFNBQVMsTUFBTSxHQUFHO0FBQzlCLGNBQU0sb0JBQW9CLG9CQUFvQixJQUFJLElBQUksTUFBTTtBQUM1RCxZQUFJLENBQUMsbUJBQW1CO0FBQ3ZCLGlCQUFPLFNBQVMsRUFBRSxRQUFRLENBQUMsNEJBQTRCLE9BQU8sRUFBRSxDQUFDO0FBQUEsUUFDbEU7QUFBQSxNQUNEO0FBRUEsYUFBTyxTQUFTLEVBQUUsUUFBUSxNQUFNLENBQUM7QUFBQSxJQUNsQyxDQUFDO0FBSUQsWUFBUSxlQUFlLFdBQVcsa0JBQWtCLENBQUMsU0FBUyxhQUFhO0FBQzFFLFlBQU0sa0JBQWtCLFFBQVE7QUFDaEMsWUFBTSxlQUFnQixnQkFBZ0IsY0FBYyxLQUFLLGdCQUFnQixjQUFjO0FBRXZGLFVBQUksZ0JBQWdCLE1BQU0sUUFBUSxZQUFZLEdBQUc7QUFDaEQsY0FBTSxNQUFNLElBQUksTUFBTSxRQUFRLEdBQUc7QUFDakMsWUFBSSxJQUFJLEtBQUssU0FBUyxNQUFNLEdBQUc7QUFDOUIsY0FBSSxvQkFBb0IsSUFBSSxJQUFJLE1BQU0sR0FBRztBQUN4Qyw0QkFBZ0IsY0FBYyxJQUFJLENBQUMsZUFBZTtBQUVsRCxtQkFBTyxTQUFTLEVBQUUsUUFBUSxPQUFPLGdCQUFnQixDQUFDO0FBQUEsVUFDbkQ7QUFBQSxRQUNEO0FBSUEsWUFBSSxDQUFDLElBQUksS0FBSyxTQUFTLFFBQVEsb0JBQW9CLEtBQUssYUFBYSxLQUFLLGlCQUFlLFlBQVksWUFBWSxFQUFFLFNBQVMsV0FBVyxDQUFDLEdBQUc7QUFDMUksaUJBQU8sU0FBUyxFQUFFLFFBQVEsQ0FBQyw0QkFBNEIsT0FBTyxFQUFFLENBQUM7QUFBQSxRQUNsRTtBQUFBLE1BQ0Q7QUFFQSxhQUFPLFNBQVMsRUFBRSxRQUFRLE1BQU0sQ0FBQztBQUFBLElBQ2xDLENBQUM7QUFPRCxZQUFRLGVBQWUsV0FBVyxrQkFBa0IsQ0FBQyxTQUFTLGFBQWE7QUFDMUUsVUFBSSxRQUFRLElBQUksV0FBVyw2Q0FBNkMsR0FBRztBQUMxRSxjQUFNLGtCQUFrQixRQUFRLG1CQUFtQix1QkFBTyxPQUFPLElBQUk7QUFFckUsWUFBSSxnQkFBZ0IsNkJBQTZCLE1BQU0sUUFBVztBQUNqRSwwQkFBZ0IsNkJBQTZCLElBQUksQ0FBQyxHQUFHO0FBQ3JELGlCQUFPLFNBQVMsRUFBRSxRQUFRLE9BQU8sZ0JBQWdCLENBQUM7QUFBQSxRQUNuRDtBQUFBLE1BQ0Q7QUFFQSxhQUFPLFNBQVMsRUFBRSxRQUFRLE1BQU0sQ0FBQztBQUFBLElBQ2xDLENBQUM7QUFjRCxVQUFNLGlCQUFpQixRQUFRO0FBQy9CLFFBQUksT0FBTyxlQUFlLHFCQUFxQixjQUFjLEtBQUssdUJBQXVCLGVBQWU7QUFLdkcscUJBQWUsaUJBQWlCLEtBQUssS0FBSyx1QkFBdUIsZUFBZSxRQUFRLENBQUM7QUFBQSxJQUMxRjtBQU1BLFFBQUksV0FBVztBQUNkLFVBQUksS0FBSyxxQkFBcUIsU0FBUyw0QkFBNEIsTUFBTSxPQUFPO0FBQy9FLHFDQUE2QjtBQUFBLE1BQzlCLE9BQU87QUFDTiw4QkFBc0IsS0FBSyxxQkFBcUIsU0FBUywwQkFBMEIsQ0FBQztBQUFBLE1BQ3JGO0FBQUEsSUFDRDtBQUFBLEVBR0Q7QUFBQSxFQUVRLG9CQUEwQjtBQUdqQyxVQUFNLEtBQUssS0FBSyxxQkFBcUIsY0FBYyxFQUFFLE1BQU0sS0FBSyxRQUFRLENBQUM7QUFHekUsZ0NBQTRCO0FBRzVCLFFBQUksR0FBRyxpQ0FBaUMsQ0FBQyxPQUFPLGdDQUFnQztBQUMvRSxXQUFLLG9CQUFvQixVQUFVLHNDQUFzQywyQkFBMkI7QUFBQSxJQUNyRyxDQUFDO0FBR0QsUUFBSSxHQUFHLFlBQVksT0FBTyxPQUFPLHNCQUFzQjtBQUN0RCxXQUFLLFdBQVcsTUFBTSxjQUFjO0FBR3BDLFVBQUksQ0FBQyxtQkFBbUI7QUFDdkIsY0FBTSxLQUFLLG9CQUFvQixnQkFBZ0IsRUFBRSxTQUFTLFlBQVksS0FBSyxDQUFDO0FBQUEsTUFDN0U7QUFBQSxJQUNELENBQUM7QUFNRCxRQUFJLEdBQUcsd0JBQXdCLENBQUMsT0FBTyxhQUFhO0FBR25ELFVBQUksVUFBVSxRQUFRLElBQUksV0FBVyxHQUFHLFFBQVEsa0JBQWtCLE1BQU0sZ0JBQWdCLEdBQUcsR0FBRztBQUM3RixhQUFLLFdBQVcsTUFBTSw0RUFBNEU7QUFFbEcsYUFBSyw2QkFBNkIsZUFBZSxRQUFRO0FBQUEsTUFDMUQ7QUFHQSxlQUFTLEdBQUcsaUJBQWlCLENBQUFBLFdBQVM7QUFDckMsWUFBSSx1QkFBdUIseUJBQXlCLFFBQVEsR0FBRztBQUM5RDtBQUFBLFFBQ0Q7QUFFQSxhQUFLLFdBQVcsTUFBTSw0REFBNEQ7QUFFbEYsUUFBQUEsT0FBTSxlQUFlO0FBQUEsTUFDdEIsQ0FBQztBQUlELGVBQVMscUJBQXFCLGFBQVc7QUFHeEMsWUFBSSxRQUFRLFFBQVEsZUFBZTtBQUNsQyxlQUFLLFdBQVcsTUFBTSxpR0FBaUc7QUFFdkgsaUJBQU87QUFBQSxZQUNOLFFBQVE7QUFBQSxZQUNSLDhCQUE4QixLQUFLLDZCQUE2QixhQUFhLE9BQU87QUFBQSxVQUNyRjtBQUFBLFFBQ0QsT0FHSztBQUNKLGVBQUssV0FBVyxNQUFNLHVFQUF1RSxRQUFRLEdBQUcsR0FBRztBQUUzRyxlQUFLLHVCQUF1QixhQUFhLFFBQVcsUUFBUSxHQUFHO0FBRS9ELGlCQUFPLEVBQUUsUUFBUSxPQUFPO0FBQUEsUUFDekI7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFJRCxRQUFJLGtCQUFxQyxDQUFDO0FBQzFDLFFBQUksaUJBQXNDO0FBQzFDLFFBQUksR0FBRyxhQUFhLENBQUMsT0FBTyxTQUFTO0FBQ3BDLGFBQU8sYUFBYSxJQUFJO0FBRXhCLFdBQUssV0FBVyxNQUFNLG1CQUFtQixJQUFJO0FBQzdDLFlBQU0sZUFBZTtBQUdyQixzQkFBZ0IsS0FBSywwQkFBMEIsSUFBSSxJQUFJLEVBQUUsY0FBYyxJQUFJLEtBQUssSUFBSSxFQUFFLElBQUksRUFBRSxTQUFTLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztBQUdySCxVQUFJLG1CQUFtQixRQUFXO0FBQ2pDLHFCQUFhLGNBQWM7QUFDM0IseUJBQWlCO0FBQUEsTUFDbEI7QUFHQSx1QkFBaUIsV0FBVyxZQUFZO0FBQ3ZDLGNBQU0sS0FBSyxvQkFBb0IsS0FBSztBQUFBLFVBQ25DLFNBQVMsWUFBWTtBQUFBLFVBQ3JCLEtBQUssS0FBSyx1QkFBdUI7QUFBQSxVQUNqQyxZQUFZO0FBQUEsVUFDWixjQUFjO0FBQUEsVUFDZCxpQkFBaUI7QUFBQTtBQUFBLFFBQ2xCLENBQUM7QUFFRCwwQkFBa0IsQ0FBQztBQUNuQix5QkFBaUI7QUFBQSxNQUNsQixHQUFHLEdBQUc7QUFBQSxJQUNQLENBQUM7QUFFRCxRQUFJLEdBQUcsc0JBQXNCLFlBQVk7QUFDeEMsWUFBTSxLQUFLLG9CQUFvQixnQkFBZ0IsRUFBRSxTQUFTLFlBQVksUUFBUSxDQUFDO0FBQUEsSUFDaEYsQ0FBQztBQUlELHFCQUFpQixPQUFPLHdCQUF3QixXQUFTO0FBVXhELFlBQU0sU0FBUyxLQUFLLG9CQUFvQix1QkFBdUIsTUFBTSxNQUFNO0FBQzNFLFVBQUk7QUFDSixVQUFJO0FBQ0osVUFBSSxRQUFRLFFBQVE7QUFDbkIsZUFBTyxPQUFPO0FBQ2QsY0FBTSxFQUFFLEdBQUcsUUFBUSxLQUFLLEdBQUcsT0FBTyxPQUFPLFFBQVE7QUFBQSxNQUNsRCxPQUFPO0FBQ04sZUFBTyxLQUFLLHVCQUF1QjtBQUNuQyxjQUFNLFFBQVE7QUFBQSxNQUNmO0FBR0EsYUFBTyxLQUFLLHdCQUF3QixNQUFNLEtBQUssS0FBSztBQUFBLElBQ3JELENBQUM7QUFFRCxxQkFBaUIsR0FBRyx5QkFBeUIsV0FBUyxNQUFNLE9BQU8sZUFBZSxDQUFDO0FBQ25GLHFCQUFpQixHQUFHLHVCQUF1QixXQUFTLE1BQU0sT0FBTyxhQUFhLENBQUM7QUFFL0UscUJBQWlCLEdBQUcsdUJBQXVCLFdBQVMsTUFBTSxPQUFPLE9BQU8sQ0FBQztBQUV6RSxxQkFBaUIsT0FBTywwQkFBMEIsT0FBTyxPQUFPLGNBQWtDO0FBQ2pHLFlBQU0sU0FBUyxLQUFLLG9CQUFvQix1QkFBdUIsTUFBTSxNQUFNO0FBQzNFLFVBQUksUUFBUTtBQUNYLGVBQU8sZ0JBQWdCLFNBQVM7QUFBQSxNQUNqQztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBR0Y7QUFBQSxFQUVBLE1BQU0sVUFBeUI7QUFDOUIsU0FBSyxXQUFXLE1BQU0sa0JBQWtCO0FBQ3hDLFNBQUssV0FBVyxNQUFNLFNBQVMsS0FBSyx1QkFBdUIsT0FBTyxFQUFFO0FBQ3BFLFNBQUssV0FBVyxNQUFNLFNBQVMsS0FBSyx1QkFBdUIsSUFBSTtBQU0vRCxVQUFNLHNCQUFzQixLQUFLLGVBQWU7QUFDaEQsUUFBSSxhQUFhLHFCQUFxQjtBQUNyQyxVQUFJLGtCQUFrQixtQkFBbUI7QUFBQSxJQUMxQztBQVFBLFFBQUk7QUFDSCxVQUFJLGVBQWUsS0FBSyxxQkFBcUIsU0FBUyxtQkFBbUIsTUFBTSxRQUFRLENBQUMsa0JBQWtCLGVBQWUsMkJBQTJCLFNBQVMsR0FBRztBQUMvSiwwQkFBa0IsZUFBZSwyQkFBMkIsV0FBVyxJQUFJO0FBQUEsTUFDNUU7QUFBQSxJQUNELFNBQVMsT0FBTztBQUNmLFdBQUssV0FBVyxNQUFNLEtBQUs7QUFBQSxJQUM1QjtBQUdBLFVBQU0sNEJBQTRCLElBQUksa0JBQWtCO0FBQ3hELFVBQU0sS0FBSyxLQUFLLHFCQUFxQixjQUFjLEVBQUUsT0FBSztBQUN6RCxVQUFJLEVBQUUsV0FBVyxlQUFlLE1BQU07QUFNckMsa0NBQTBCLFFBQVE7QUFBQSxNQUNuQztBQUFBLElBQ0QsQ0FBQztBQUdELFVBQU0sQ0FBQyxXQUFXLE9BQU8sV0FBVyxJQUFJLE1BQU0sUUFBUSxJQUFJO0FBQUEsTUFDekQsaUJBQWlCLEtBQUssY0FBYyxLQUFLLFVBQVU7QUFBQSxNQUNuRCxhQUFhLEtBQUssY0FBYyxLQUFLLFVBQVU7QUFBQSxNQUMvQyxtQkFBbUIsS0FBSyxjQUFjLEtBQUssVUFBVTtBQUFBLElBQ3RELENBQUM7QUFHRCxVQUFNLEVBQUUsb0JBQW9CLG9CQUFvQixJQUFJLEtBQUssbUJBQW1CLFdBQVcsT0FBTyxXQUFXO0FBR3pHLFVBQU0sMEJBQTBCLE1BQU0sS0FBSyxhQUFhLFdBQVcsT0FBTyxhQUFhLGtCQUFrQjtBQUd6Ryw0QkFBd0IsZUFBZSxjQUFZLEtBQUssVUFBVSxJQUFJLGVBQWUsU0FBUyxJQUFJLFdBQVcsR0FBRyxTQUFTLElBQUksaUJBQWlCLENBQUMsQ0FBQyxDQUFDO0FBVWpKLFVBQU0sbUJBQW1CLElBQUkseUJBQXlCLEVBQUUsV0FBVyxPQUFPLFlBQVksR0FBRyxLQUFLLHNCQUFzQixLQUFLLHdCQUF3QixLQUFLLHNCQUFzQixLQUFLLFVBQVU7QUFDM0wsU0FBSyxVQUFVLHdCQUF3QixlQUFlLHlCQUF5QixnQkFBZ0IsQ0FBQztBQUdoRyw0QkFBd0IsZUFBZSxjQUFZO0FBQ2xELE1BQUMsU0FBUyxJQUFJLHlCQUF5QixFQUFtQyxvQkFBb0IsU0FBUyxJQUFJLGlCQUFpQixDQUFDO0FBQUEsSUFDOUgsQ0FBQztBQUdELDRCQUF3QixlQUFlLGNBQVksU0FBUyxJQUFJLGlCQUFpQixDQUFDO0FBR2xGLFNBQUssVUFBVSx3QkFBd0IsZUFBZSx1QkFBdUIsQ0FBQztBQUc5RSw0QkFBd0IsZUFBZSxjQUFZLEtBQUssYUFBYSxVQUFVLDJCQUEyQixtQkFBbUIsQ0FBQztBQUc5SCxVQUFNLHNCQUFzQixNQUFNLHdCQUF3QixlQUFlLGNBQVksS0FBSyx5QkFBeUIsVUFBVSx5QkFBeUIsQ0FBQztBQUd2SixTQUFLLHFDQUFxQyx5QkFBeUI7QUFHbkUsU0FBSyxxQkFBcUIsUUFBUSxtQkFBbUI7QUFHckQsVUFBTSx3QkFBd0IsZUFBZSxjQUFZLEtBQUssZ0JBQWdCLFVBQVUsbUJBQW1CLENBQUM7QUFHNUcsU0FBSyxxQkFBcUIsUUFBUSxtQkFBbUI7QUFHckQsU0FBSyxnQkFBZ0IsdUJBQXVCO0FBRzVDLFVBQU0sMkJBQTJCLEtBQUssVUFBVSxJQUFJLGlCQUFpQixNQUFNO0FBQzFFLFdBQUssVUFBVSxrQkFBa0IsTUFBTTtBQUd0QyxhQUFLLHFCQUFxQixRQUFRLG1CQUFtQjtBQUdyRCxhQUFLLDBCQUEwQix1QkFBdUI7QUFBQSxNQUN2RCxHQUFHLElBQUksQ0FBQztBQUFBLElBQ1QsR0FBRyxJQUFJLENBQUM7QUFDUiw2QkFBeUIsU0FBUztBQUFBLEVBQ25DO0FBQUEsRUFFQSxNQUFjLHlCQUF5QixVQUE0QiwyQkFBeUY7QUFDM0osVUFBTSxxQkFBcUIsS0FBSyxxQkFBcUIsU0FBUyxJQUFJLG1CQUFtQjtBQUNyRixVQUFNLGFBQWEsU0FBUyxJQUFJLFdBQVc7QUFDM0MsVUFBTSx3QkFBd0IsS0FBSyx3QkFBd0IsU0FBUyxJQUFJLHNCQUFzQjtBQUM5RixVQUFNLG9CQUFvQixTQUFTLElBQUksa0JBQWtCO0FBTXpELFVBQU1DLE9BQU07QUFDWixlQUFXLGdCQUFnQjtBQUFBLE1BQzFCLE1BQU0sVUFBVSxLQUFVLFNBQTZDO0FBQ3RFLGVBQU9BLEtBQUksa0JBQWtCLG9CQUFvQixtQkFBbUIsWUFBWSxLQUFLLE9BQU87QUFBQSxNQUM3RjtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sc0JBQXNCLEtBQUssVUFBVSxJQUFJLG9CQUFvQjtBQUFBLE1BQ2xFLHFCQUFxQixzQkFBc0I7QUFBQSxNQUMzQyxzQkFBc0Isc0JBQXNCO0FBQUEsTUFDNUMsbUJBQW1CLE1BQU0sc0JBQXNCLGtCQUFrQixFQUFFO0FBQUEsSUFDcEUsQ0FBQyxDQUFDO0FBQ0YsVUFBTSxxQkFBcUIsSUFBSSxhQUFhLFNBQU8sb0JBQW9CLGtCQUFrQixFQUFFLEtBQUssUUFBTSxRQUFRLEVBQUUsQ0FBQztBQUNqSCxVQUFNLG1CQUFtQixJQUFJLGlCQUFpQixvQkFBb0IsS0FBSyxVQUFVO0FBQ2pGLFVBQU0sb0JBQW9CLDBCQUEwQixXQUFXLGNBQWMsZ0JBQWdCO0FBQzdGLGVBQVcsZ0JBQWdCLElBQUksd0JBQXdCLGlCQUFpQixDQUFDO0FBRXpFLFVBQU0sc0JBQXNCLE1BQU0sS0FBSywyQkFBMkIsb0JBQW9CLGlCQUFpQjtBQUN2RyxTQUFLLFVBQVUsSUFBSSxvQkFBb0IscUJBQXFCLE1BQU0sWUFBWSxvQkFBb0IsS0FBSyx3QkFBd0IsS0FBSyxnQkFBZ0IsS0FBSyxVQUFVLENBQUM7QUFFcEssV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHFDQUFxQywyQkFBOEM7QUFDMUYsVUFBTSxXQUFXLE9BQWtDLEVBQUUsWUFBWSxLQUFLLE1BQU0sWUFBWTtBQUN4RixVQUFNLHdCQUF3QixJQUFJLEtBQUssTUFBTSwwQkFBMEI7QUFBQSxNQUN0RTtBQUFBLE1BQ0EsSUFBSSx5QkFBeUI7QUFBQSxJQUM5QixDQUFDO0FBRUQsYUFBUyx1QkFBdUIsUUFBUSw2QkFBNkIsQ0FBQyxTQUFTLGFBQWE7QUFDM0YsWUFBTSxNQUFNLElBQUksTUFBTSxRQUFRLEdBQUc7QUFDakMsVUFBSSxDQUFDLElBQUksVUFBVSxXQUFXLFNBQVMsR0FBRztBQUN6QyxlQUFPLFNBQVMsU0FBUyxDQUFDO0FBQUEsTUFDM0I7QUFFQSw0QkFBc0IsTUFBTSxLQUFpQyxzQ0FBc0MsQ0FBQyxHQUFHLENBQUMsRUFBRTtBQUFBLFFBQ3pHLE9BQUssU0FBUyxFQUFFLEdBQUcsR0FBRyxNQUFNLE9BQU8sS0FBSyxFQUFFLE1BQU0sUUFBUSxFQUFFLENBQUM7QUFBQSxRQUMzRCxTQUFPO0FBQ04sZUFBSyxXQUFXLEtBQUssMENBQTBDLEdBQUc7QUFDbEUsbUJBQVMsRUFBRSxZQUFZLEtBQUssTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDO0FBQUEsUUFDaEQ7QUFBQSxNQUFDO0FBQUEsSUFDSCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYywyQkFBMkIsb0JBQXlDLG1CQUFrRjtBQVFuSyxVQUFNLDhCQUE4QixLQUFLLHVCQUF1QixLQUFLLFVBQVUsSUFBSSxLQUFLLHVCQUF1QixLQUFLLFNBQVMsQ0FBQyxJQUFJLENBQUM7QUFDbkksUUFBSSw0QkFBNEIsU0FBUyxHQUFHO0FBQzNDLFdBQUssV0FBVyxNQUFNLHFFQUFxRSwyQkFBMkI7QUFBQSxJQUN2SDtBQUdBLFVBQU0sd0JBQTBCLE9BQTRDLGNBQWMsS0FBSyxDQUFDO0FBQ2hHLFFBQUksc0JBQXNCLFNBQVMsR0FBRztBQUNyQyxXQUFLLFdBQVcsTUFBTSwrRUFBK0UscUJBQXFCO0FBQUEsSUFDM0g7QUFFQSxRQUFJLDRCQUE0QixTQUFTLHNCQUFzQixXQUFXLEdBQUc7QUFDNUUsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGVBQWU7QUFBQSxNQUNwQixHQUFHO0FBQUEsTUFDSCxHQUFHO0FBQUEsSUFDSixFQUFFLElBQUksU0FBTztBQUNaLFVBQUk7QUFDSCxlQUFPLEVBQUUsS0FBSyxJQUFJLE1BQU0sR0FBRyxHQUFHLGFBQWEsSUFBSTtBQUFBLE1BQ2hELFFBQVE7QUFDUCxhQUFLLFdBQVcsTUFBTSxrRUFBa0UsR0FBRztBQUUzRixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sWUFBK0IsQ0FBQztBQUN0QyxVQUFNLE9BQXVCLENBQUM7QUFFOUIsZUFBVyxlQUFlLGNBQWM7QUFDdkMsVUFBSSxDQUFDLGFBQWE7QUFDakI7QUFBQSxNQUNEO0FBRUEsWUFBTSxpQkFBaUIsS0FBSyxpQ0FBaUMsWUFBWSxHQUFHO0FBQzVFLFVBQUksZ0JBQWdCO0FBQ25CLFlBQUksTUFBTSxLQUFLLG9CQUFvQixnQkFBZ0Isb0JBQW9CLGlCQUFpQixHQUFHO0FBQzFGLGVBQUssV0FBVyxNQUFNLDhEQUE4RCxZQUFZLElBQUksU0FBUyxJQUFJLENBQUM7QUFFbEg7QUFBQSxRQUNELE9BQU87QUFDTixlQUFLLFdBQVcsTUFBTSxvRkFBb0YsWUFBWSxJQUFJLFNBQVMsSUFBSSxHQUFHLGNBQWM7QUFFeEosb0JBQVUsS0FBSyxjQUFjO0FBQUEsUUFDOUI7QUFBQSxNQUNELE9BQU87QUFDTixhQUFLLFdBQVcsTUFBTSwrRkFBK0YsWUFBWSxJQUFJLFNBQVMsSUFBSSxDQUFDO0FBRW5KLGFBQUssS0FBSyxXQUFXO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBRUEsV0FBTyxFQUFFLE1BQU0sVUFBVTtBQUFBLEVBQzFCO0FBQUEsRUFFQSxNQUFjLG9CQUFvQixVQUEyQixvQkFBeUMsbUJBQXlEO0FBQzlKLFFBQUk7QUFDSixRQUFJO0FBQ0osUUFBSSxrQkFBa0IsUUFBUSxHQUFHO0FBQ2hDLG9CQUFjLFNBQVM7QUFDdkIsZ0JBQVUsU0FBUywrQkFBK0IsZ0dBQWdHLFlBQVksV0FBVyxRQUFRLE9BQU8sYUFBYSxhQUFhLEVBQUUsSUFBSSxJQUFJLFNBQVMsS0FBSyx1QkFBdUIsQ0FBQyxJQUFJLFlBQVksU0FBUyxJQUFJLEdBQUcsS0FBSyxlQUFlLFNBQVM7QUFBQSxJQUNoVSxXQUFXLGVBQWUsUUFBUSxHQUFHO0FBQ3BDLG9CQUFjLFNBQVM7QUFDdkIsZ0JBQVUsU0FBUyw0QkFBNEIsd0ZBQXdGLFlBQVksV0FBVyxRQUFRLE9BQU8sYUFBYSxhQUFhLEVBQUUsSUFBSSxJQUFJLFNBQVMsS0FBSyx1QkFBdUIsQ0FBQyxJQUFJLFlBQVksU0FBUyxJQUFJLEdBQUcsS0FBSyxlQUFlLFNBQVM7QUFBQSxJQUNyVCxPQUFPO0FBQ04sb0JBQWMsU0FBUztBQUN2QixnQkFBVSxTQUFTLGtDQUFrQyxnR0FBZ0csWUFBWSxXQUFXLFFBQVEsT0FBTyxhQUFhLGFBQWEsRUFBRSxJQUFJLElBQUksU0FBUyxLQUFLLHVCQUF1QixDQUFDLElBQUksWUFBWSxTQUFTLElBQUksR0FBRyxLQUFLLGVBQWUsU0FBUztBQUFBLElBQ25VO0FBRUEsUUFBSSxZQUFZLFdBQVcsUUFBUSxRQUFRLFlBQVksV0FBVyxRQUFRLGNBQWM7QUFhdkYsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLHFCQUFxQixLQUFLLHFCQUFxQixTQUFrQixnQkFBZ0Isb0RBQW9ELFlBQVksTUFBTSxDQUFDO0FBQzlKLFFBQUksdUJBQXVCLE9BQU87QUFDakMsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLEVBQUUsVUFBVSxnQkFBZ0IsSUFBSSxNQUFNLGtCQUFrQixlQUFlO0FBQUEsTUFDNUUsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLFFBQ1IsU0FBUyxFQUFFLEtBQUssUUFBUSxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxPQUFPO0FBQUEsUUFDckUsU0FBUyxFQUFFLEtBQUssVUFBVSxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxNQUFNO0FBQUEsTUFDdkU7QUFBQSxNQUNBO0FBQUEsTUFDQSxRQUFRLFNBQVMscUJBQXFCLCtLQUErSztBQUFBLE1BQ3JOLGVBQWUsWUFBWSxXQUFXLFFBQVEsT0FBTyxTQUFTLHNCQUFzQiwwQ0FBMEMsSUFBSSxTQUFTLHVCQUF1QiwyQ0FBMkM7QUFBQSxNQUM3TSxVQUFVO0FBQUEsSUFDWCxDQUFDO0FBRUQsUUFBSSxhQUFhLEdBQUc7QUFDbkIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLGlCQUFpQjtBQUtwQixZQUFNLFVBQVUsRUFBRSxTQUFTLDJDQUEyQyxNQUFNLFlBQVksV0FBVyxRQUFRLE9BQU8sVUFBVSxTQUFTO0FBQ3JJLHlCQUFtQixjQUFjLFFBQVEsU0FBUyxRQUFRLElBQUk7QUFDOUQseUJBQW1CLG9CQUFvQixRQUFRLFNBQVMsUUFBUSxJQUFJO0FBQUEsSUFDckU7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsaUNBQWlDLEtBQXVDO0FBQy9FLFFBQUksQ0FBQyxJQUFJLE1BQU07QUFDZCxhQUFPO0FBQUEsSUFDUjtBQUdBLFFBQUksSUFBSSxjQUFjLFFBQVEsTUFBTTtBQUNuQyxZQUFNLFVBQVUsSUFBSSxLQUFLLElBQUksTUFBTTtBQUVuQyxVQUFJLDBCQUEwQixPQUFPLEdBQUc7QUFDdkMsZUFBTyxFQUFFLGNBQWMsUUFBUTtBQUFBLE1BQ2hDO0FBRUEsYUFBTyxFQUFFLFFBQVE7QUFBQSxJQUNsQixXQUdTLElBQUksY0FBYyxRQUFRLGNBQWM7QUFNaEQsWUFBTSxjQUFjLElBQUksS0FBSztBQUFBLFFBQVEsTUFBTTtBQUFBLFFBQUs7QUFBQTtBQUFBLE1BQW1DO0FBQ25GLFVBQUk7QUFDSixVQUFJO0FBQ0osVUFBSSxnQkFBZ0IsSUFBSTtBQUN2QixvQkFBWSxJQUFJLEtBQUssVUFBVSxHQUFHLFdBQVc7QUFDN0MsZUFBTyxJQUFJLEtBQUssVUFBVSxXQUFXO0FBQUEsTUFDdEMsT0FBTztBQUNOLG9CQUFZLElBQUksS0FBSyxVQUFVLENBQUM7QUFDaEMsZUFBTztBQUFBLE1BQ1I7QUFFQSxVQUFJLFFBQVEsSUFBSTtBQUNoQixZQUFNLFNBQVMsSUFBSSxnQkFBZ0IsSUFBSSxLQUFLO0FBQzVDLFVBQUksT0FBTyxJQUFJLFVBQVUsTUFBTSxVQUFVO0FBR3hDLGVBQU8sT0FBTyxVQUFVO0FBQ3hCLGdCQUFRLE9BQU8sU0FBUztBQUFBLE1BQ3pCO0FBRUEsWUFBTSxZQUFZLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxjQUFjLFdBQVcsTUFBTSxPQUFPLFVBQVUsSUFBSSxTQUFTLENBQUM7QUFFM0csVUFBSSwwQkFBMEIsSUFBSSxHQUFHO0FBQ3BDLGVBQU8sRUFBRSxjQUFjLFVBQVU7QUFBQSxNQUNsQztBQUVBLFVBQUksVUFBVSxLQUFLLElBQUksR0FBRztBQUV6QixlQUFPLEVBQUUsU0FBUyxVQUFVO0FBQUEsTUFDN0I7QUFFQSxhQUFPLEVBQUUsV0FBVyxVQUFVO0FBQUEsSUFDL0I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxrQkFBa0Isb0JBQXlDLG1CQUF1QyxZQUF5QixLQUFVLFNBQTZDO0FBQy9MLFNBQUssV0FBVyxNQUFNLDRCQUE0QixJQUFJLFNBQVMsSUFBSSxHQUFHLE9BQU87QUFHN0UsUUFBSSxJQUFJLFdBQVcsS0FBSyxlQUFlLGVBQWUsSUFBSSxTQUFTLGFBQWE7QUFDL0UsWUFBTSxJQUFJLEtBQUs7QUFBQSxRQUNkLFdBQVcsUUFBUTtBQUFBLFFBQ25CLE1BQU0sSUFBSSxNQUFNLElBQUksS0FBSyxFQUFFO0FBQUEsUUFDM0IsT0FBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLElBQ0Y7QUFFQSxRQUFJLHdCQUF3QjtBQUc1QixVQUFNLFNBQVMsSUFBSSxnQkFBZ0IsSUFBSSxLQUFLO0FBQzVDLFFBQUksT0FBTyxJQUFJLFVBQVUsTUFBTSxVQUFVO0FBQ3hDLFdBQUssV0FBVyxNQUFNLHFHQUFxRyxJQUFJLFNBQVMsSUFBSSxDQUFDO0FBRTdJLGFBQU8sT0FBTyxVQUFVO0FBQ3hCLFlBQU0sSUFBSSxLQUFLLEVBQUUsT0FBTyxPQUFPLFNBQVMsRUFBRSxDQUFDO0FBRTNDLDhCQUF3QjtBQUFBLElBQ3pCLFdBR1MsZUFBZSxtQkFBbUIsZUFBZSxNQUFNLEdBQUc7QUFDbEUsV0FBSyxXQUFXLE1BQU0scUdBQXFHLElBQUksU0FBUyxJQUFJLENBQUM7QUFFN0ksOEJBQXdCO0FBQUEsSUFDekI7QUFHQSxVQUFNLGFBQWEsT0FBTyxJQUFJLFlBQVk7QUFDMUMsUUFBSSxlQUFlLE1BQU07QUFDeEIsV0FBSyxXQUFXLE1BQU0sNERBQTRELElBQUksU0FBUyxJQUFJLENBQUM7QUFFcEcsYUFBTyxPQUFPLFlBQVk7QUFDMUIsWUFBTSxJQUFJLEtBQUssRUFBRSxPQUFPLE9BQU8sU0FBUyxFQUFFLENBQUM7QUFFM0MsV0FBSyx1QkFBdUIsYUFBYSxjQUFjO0FBQUEsSUFDeEQ7QUFHQSxVQUFNQyxXQUFVLE9BQU8sSUFBSSxTQUFTO0FBQ3BDLFFBQUlBLGFBQVksTUFBTTtBQUNyQixXQUFLLFdBQVcsTUFBTSx5REFBeUQsSUFBSSxTQUFTLElBQUksQ0FBQztBQUVqRyxhQUFPLE9BQU8sU0FBUztBQUN2QixZQUFNLElBQUksS0FBSyxFQUFFLE9BQU8sT0FBTyxTQUFTLEVBQUUsQ0FBQztBQUFBLElBQzVDO0FBR0EsVUFBTSxnQ0FBZ0MsS0FBSyxpQ0FBaUMsR0FBRztBQUMvRSxRQUFJLCtCQUErQjtBQUNsQyxVQUFJLE1BQU0sS0FBSyxvQkFBb0IsK0JBQStCLG9CQUFvQixpQkFBaUIsR0FBRztBQUN6RyxhQUFLLFdBQVcsTUFBTSxxREFBcUQsSUFBSSxTQUFTLElBQUksQ0FBQztBQUU3RixlQUFPO0FBQUEsTUFDUixPQUFPO0FBQ04sYUFBSyxXQUFXLE1BQU0sMkRBQTJELCtCQUErQixJQUFJLFNBQVMsSUFBSSxDQUFDO0FBRWxJLGNBQU0sVUFBVSxNQUFNLG1CQUFtQixLQUFLO0FBQUEsVUFDN0MsU0FBUyxZQUFZO0FBQUEsVUFDckIsS0FBSyxFQUFFLEdBQUcsS0FBSyx1QkFBdUIsS0FBSztBQUFBLFVBQzNDLFlBQVksQ0FBQyw2QkFBNkI7QUFBQSxVQUMxQyxnQkFBZ0I7QUFBQSxVQUNoQixjQUFjO0FBQUE7QUFBQSxRQUVmLENBQUMsR0FBRyxHQUFHLENBQUM7QUFFUixnQkFBUSxNQUFNO0FBR2QsWUFBSSxVQUFVQSxVQUFTO0FBQ3RCLGlCQUFPLGNBQWMsMEJBQTBCLGtCQUFrQixNQUFNQSxRQUFPO0FBQUEsUUFDL0U7QUFFQSxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFHQSxRQUFJLHVCQUF1QjtBQUMxQixXQUFLLFdBQVcsTUFBTSw2RUFBNkUsSUFBSSxTQUFTLElBQUksQ0FBQztBQUVySCxZQUFNLFVBQVUsTUFBTSxtQkFBbUIsS0FBSztBQUFBLFFBQzdDLFNBQVMsWUFBWTtBQUFBLFFBQ3JCLEtBQUssRUFBRSxHQUFHLEtBQUssdUJBQXVCLEtBQUs7QUFBQSxRQUMzQyxnQkFBZ0I7QUFBQSxRQUNoQixZQUFZO0FBQUEsUUFDWixjQUFjO0FBQUEsUUFDZCxpQkFBaUIsbUJBQW1CLEdBQUc7QUFBQSxNQUN4QyxDQUFDLEdBQUcsR0FBRyxDQUFDO0FBRVIsWUFBTSxRQUFRLE1BQU07QUFFcEIsYUFBTyxXQUFXLEtBQUssS0FBSyxPQUFPO0FBQUEsSUFDcEM7QUFFQSxTQUFLLFdBQVcsTUFBTSx3Q0FBd0MsSUFBSSxTQUFTLElBQUksR0FBRyxPQUFPO0FBRXpGLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxtQkFBbUIsV0FBbUIsT0FBZSxhQUEwSDtBQUN0TCxVQUFNLGdCQUFnQixLQUFLLFVBQVUsS0FBSyx5QkFBeUIsZUFBZSxlQUFlLFdBQVcsT0FBTyxXQUFXLENBQUM7QUFFL0gsU0FBSyxVQUFVLGNBQWMsV0FBVyxNQUFNLEtBQUssb0JBQW9CLGNBQWMsaUNBQWlDLENBQUMsQ0FBQztBQUV4SCxVQUFNLHVCQUF1QixZQUFZO0FBQ3hDLFdBQUssV0FBVyxNQUFNLDZCQUE2QjtBQUVuRCxZQUFNLE9BQU8sTUFBTSxjQUFjLFFBQVE7QUFFekMsV0FBSyxXQUFXLE1BQU0scURBQXFEO0FBRTNFLGFBQU8sSUFBSSxrQkFBa0IsTUFBTSxNQUFNO0FBQUEsSUFDMUMsR0FBRztBQUVILFVBQU0sc0JBQXNCLFlBQVk7QUFDdkMsWUFBTSxjQUFjLFVBQVU7QUFFOUIsYUFBTztBQUFBLElBQ1IsR0FBRztBQUVILFdBQU8sRUFBRSxvQkFBb0Isb0JBQW9CO0FBQUEsRUFDbEQ7QUFBQSxFQUVBLE1BQWMsYUFBYSxXQUFtQixPQUFlLGFBQXFCLG9CQUFnRjtBQUNqSyxVQUFNLFdBQVcsSUFBSSxrQkFBa0I7QUFHdkMsWUFBUSxRQUFRLFVBQVU7QUFBQSxNQUN6QixLQUFLO0FBQ0osaUJBQVMsSUFBSSxnQkFBZ0IsSUFBSSxlQUFlLGtCQUFrQixDQUFDO0FBQ25FO0FBQUEsTUFFRCxLQUFLO0FBQ0osWUFBSSxhQUFhO0FBQ2hCLG1CQUFTLElBQUksZ0JBQWdCLElBQUksZUFBZSxtQkFBbUIsQ0FBQyxRQUFRLElBQUksTUFBTSxHQUFHLFFBQVEsSUFBSSxlQUFlLENBQUMsQ0FBQyxDQUFDO0FBQUEsUUFDeEgsT0FBTztBQUNOLG1CQUFTLElBQUksZ0JBQWdCLElBQUksZUFBZSxrQkFBa0IsQ0FBQztBQUFBLFFBQ3BFO0FBQ0E7QUFBQSxNQUVELEtBQUs7QUFDSixpQkFBUyxJQUFJLGdCQUFnQixJQUFJLGVBQWUsbUJBQW1CLENBQUM7QUFDcEU7QUFBQSxJQUNGO0FBR0EsYUFBUyxJQUFJLHFCQUFxQixJQUFJLGVBQWUsb0JBQW9CLENBQUMsV0FBVyxPQUFPLGFBQWEsS0FBSyxPQUFPLEdBQUcsS0FBSyxDQUFDO0FBQzlILGFBQVMsSUFBSSw4QkFBOEIsSUFBSSxlQUFlLDZCQUE2QixRQUFXLEtBQUssQ0FBQztBQUc1RyxVQUFNLG9CQUFvQixJQUFJLGtCQUFrQixLQUFLLFlBQVksS0FBSyxjQUFjO0FBQ3BGLGFBQVMsSUFBSSxvQkFBb0IsaUJBQWlCO0FBR2xELGFBQVMsSUFBSSxvQkFBb0IsSUFBSTtBQUFBLE1BQWU7QUFBQSxNQUFtQjtBQUFBLE1BQVc7QUFBQTtBQUFBLElBQXNDLENBQUM7QUFHekgsYUFBUyxJQUFJLHlCQUF5QixJQUFJO0FBQUEsTUFBZTtBQUFBLE1BQXdCO0FBQUEsTUFBVztBQUFBO0FBQUEsSUFBc0MsQ0FBQztBQUNuSSxhQUFTLElBQUkscUJBQXFCLGFBQWEsVUFBVSxrQkFBa0IsbUJBQW1CLEtBQUssWUFBVSxPQUFPLFdBQVcsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBR2hKLGFBQVMsSUFBSSx3QkFBd0IsSUFBSSxlQUFlLHFCQUFxQixDQUFDO0FBRzlFLGFBQVMsSUFBSSx5QkFBeUIsSUFBSTtBQUFBLE1BQWU7QUFBQSxNQUF3QjtBQUFBLE1BQVc7QUFBQTtBQUFBLElBQXNDLENBQUM7QUFDbkksYUFBUyxJQUFJLDhCQUE4QixJQUFJO0FBQUEsTUFBZTtBQUFBLE1BQTZCO0FBQUEsTUFBVztBQUFBO0FBQUEsSUFBc0MsQ0FBQztBQUc3SSxhQUFTLElBQUksNEJBQTRCLElBQUksZUFBZSx5QkFBeUIsQ0FBQztBQUd0RixhQUFTLElBQUksd0JBQXdCLElBQUk7QUFBQSxNQUFlO0FBQUEsTUFBdUI7QUFBQSxNQUFXO0FBQUE7QUFBQSxJQUFzQyxDQUFDO0FBR2pJLGFBQVMsSUFBSSwrQkFBK0IsSUFBSSxlQUFlLDhCQUE4QixDQUFDLGNBQWMsQ0FBQyxDQUFDO0FBRzlHLFVBQU0sMkJBQTJCLElBQUksNkJBQTZCLEtBQUssb0JBQW9CO0FBQzNGLGFBQVMsSUFBSSwyQkFBMkIsd0JBQXdCO0FBR2hFLGFBQVMsSUFBSSx5QkFBeUIsSUFBSSxlQUFlLDBCQUEwQixDQUFDO0FBQ3BGLGFBQVMsSUFBSSw0QkFBNEIsSUFBSSxlQUFlLDJCQUEyQixRQUFXLElBQUksQ0FBQztBQUN2RyxhQUFTLElBQUksNkJBQTZCLElBQUk7QUFBQSxNQUFlO0FBQUEsTUFBa0M7QUFBQSxNQUFXO0FBQUE7QUFBQSxJQUFzQyxDQUFDO0FBR2pKLGFBQVMsSUFBSSx3QkFBd0IsSUFBSSxlQUFlLGtCQUFrQixDQUFDO0FBRzNFLGFBQVMsSUFBSSxxQkFBcUIsSUFBSSxlQUFlLGtCQUFrQixDQUFDO0FBR3hFLGFBQVMsSUFBSSx1QkFBdUIsSUFBSSxlQUFlLG9CQUFvQixDQUFDO0FBRzVFLGFBQVMsSUFBSSxxQkFBcUIsSUFBSSxlQUFlLGtCQUFrQixDQUFDO0FBQ3hFLGFBQVMsSUFBSSxnQ0FBZ0MsSUFBSSxlQUFlLDZCQUE2QixDQUFDO0FBRzlGLFVBQU0saUJBQWlCLElBQUksdUJBQXVCO0FBQUEsTUFDakQsV0FBVyx3QkFBd0I7QUFBQSxNQUNuQyxnQkFBZ0Isd0JBQXdCO0FBQUEsTUFDeEMsWUFBWSxLQUFLLHFCQUFxQixTQUFpQixrQkFBa0IsMkJBQTJCLEtBQUs7QUFBQSxJQUMxRyxHQUFHLEtBQUssc0JBQXNCLEtBQUssd0JBQXdCLEtBQUssc0JBQXNCLEtBQUssVUFBVTtBQUNyRyxVQUFNLGlCQUFpQixJQUFJO0FBQUEsTUFDMUI7QUFBQSxNQUNBLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxJQUNOO0FBQ0EsYUFBUyxJQUFJLGtCQUFrQixjQUFjO0FBRzdDLFFBQUksV0FBVztBQUNkLGVBQVMsSUFBSSw4QkFBOEIsSUFBSSxlQUFlLDhCQUE4QixDQUFDO0FBQUEsSUFDOUYsV0FBVyxhQUFhO0FBQ3ZCLGVBQVMsSUFBSSw4QkFBOEIsSUFBSSxlQUFlLDBCQUEwQixDQUFDO0FBQUEsSUFDMUYsV0FBVyxTQUFTO0FBQ25CLGVBQVMsSUFBSSw4QkFBOEIsSUFBSSxlQUFlLDRCQUE0QixDQUFDO0FBQUEsSUFDNUY7QUFDQSxhQUFTLElBQUksMkJBQTJCLElBQUksZUFBZSxvQkFBb0IsQ0FBQztBQUdoRixVQUFNLG9CQUFvQixJQUFJLGtCQUFrQixLQUFLLHdCQUF3QixLQUFLLHNCQUFzQixLQUFLLFlBQVksS0FBSyxZQUFZO0FBQzFJLGFBQVMsSUFBSSxvQkFBb0IsaUJBQWlCO0FBR2xELFVBQU0sa0NBQWtDLElBQUksZ0NBQWdDLEtBQUssd0JBQXdCLEtBQUssWUFBWSxLQUFLLDZCQUE2QixtQkFBbUIsaUJBQWlCO0FBQ2hNLGFBQVMsSUFBSSxrQ0FBa0MsK0JBQStCO0FBQzlFLGFBQVMsSUFBSSxvQkFBb0IsSUFBSTtBQUFBLE1BQWU7QUFBQSxNQUF1QjtBQUFBLE1BQVc7QUFBQTtBQUFBLElBQXNDLENBQUM7QUFDN0gsYUFBUyxJQUFJLCtCQUErQixJQUFJLGVBQWUsOEJBQThCLFFBQVcsS0FBSyxDQUFDO0FBRzlHLGFBQVMsSUFBSSxhQUFhLElBQUk7QUFBQSxNQUFlO0FBQUEsTUFBa0I7QUFBQSxNQUFXO0FBQUE7QUFBQSxJQUFzQyxDQUFDO0FBR2pILFFBQUksa0JBQWtCLEtBQUssZ0JBQWdCLEtBQUssc0JBQXNCLEdBQUc7QUFDeEUsWUFBTSxhQUFhLG9CQUFvQixLQUFLLGdCQUFnQixLQUFLLG9CQUFvQjtBQUNyRixZQUFNLFVBQVUsa0JBQWtCLG1CQUFtQixLQUFLLFlBQVUsT0FBTyxXQUFXLG1CQUFtQixDQUFDLENBQUM7QUFDM0csWUFBTSxXQUFXLElBQUksd0JBQXdCLE9BQU87QUFDcEQsWUFBTSxtQkFBbUIsd0JBQXdCLFFBQVEsR0FBRyxTQUFTLEdBQUcsUUFBUSxNQUFNLEtBQUssZUFBZSxRQUFRLEtBQUssZUFBZSxTQUFTLFdBQVcsT0FBTyxhQUFhLFlBQVksS0FBSyxlQUFlLElBQUk7QUFDbE4sWUFBTSxXQUFXLDJCQUEyQixLQUFLLHNCQUFzQjtBQUN2RSxZQUFNLFNBQWtDLEVBQUUsV0FBVyxDQUFDLFFBQVEsR0FBRyxrQkFBa0IsVUFBVSxvQkFBb0IsS0FBSztBQUV0SCxlQUFTLElBQUksbUJBQW1CLElBQUksZUFBZSxrQkFBa0IsQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO0FBQUEsSUFDdEYsT0FBTztBQUNOLGVBQVMsSUFBSSxtQkFBbUIsb0JBQW9CO0FBQUEsSUFDckQ7QUFHQSxhQUFTLElBQUksa0NBQWtDLElBQUksZUFBZSxpQ0FBaUMsUUFBVyxJQUFJLENBQUM7QUFDbkgsYUFBUyxJQUFJLDJCQUEyQixJQUFJLGVBQWUsMEJBQTBCLFFBQVcsSUFBSSxDQUFDO0FBR3JHLGFBQVMsSUFBSSxrQ0FBa0MsSUFBSSxlQUFlLGlDQUFpQyxRQUFXLElBQUksQ0FBQztBQUduSCxhQUFTLElBQUksbUJBQW1CLElBQUksZUFBZSxnQkFBZ0IsQ0FBQztBQUdwRSxhQUFTLElBQUksa0NBQWtDLElBQUksZUFBZSwrQkFBK0IsQ0FBQztBQUNsRyxhQUFTLElBQUksb0JBQW9CLElBQUksZUFBZSxpQkFBaUIsQ0FBQztBQUd0RSxhQUFTLElBQUksd0JBQXdCLElBQUksZUFBZSx1QkFBdUIsUUFBVyxJQUFJLENBQUM7QUFHL0YsVUFBTSxTQUFTLFFBQVE7QUFBQSxNQUN0QixrQkFBa0IsV0FBVztBQUFBLE1BQzdCLGdDQUFnQyxXQUFXO0FBQUEsSUFDNUMsQ0FBQztBQUVELFdBQU8sS0FBSyx5QkFBeUIsWUFBWSxRQUFRO0FBQUEsRUFDMUQ7QUFBQSxFQUVRLGFBQWEsVUFBNEIsMkJBQThDLHFCQUF1RDtBQU9ySixVQUFNLGNBQWMsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFFeEQsVUFBTSxnQkFBZ0IsYUFBYSxZQUFZLFNBQVMsSUFBSSxrQkFBa0IsR0FBRyxhQUFhLEVBQUUsb0JBQW9CLEtBQUssQ0FBQztBQUMxSCxTQUFLLHlCQUF5QixnQkFBZ0IsVUFBVSxhQUFhO0FBRXJFLFVBQU0scUJBQXFCLGFBQWEsWUFBWSxTQUFTLElBQUksdUJBQXVCLEdBQUcsYUFBYSxFQUFFLG9CQUFvQixLQUFLLENBQUM7QUFDcEksU0FBSyx5QkFBeUIsZ0JBQWdCLGVBQWUsa0JBQWtCO0FBRy9FLFVBQU0sZ0JBQWdCLFlBQVksSUFBSSxJQUFJLGNBQWMsU0FBUyxJQUFJLGNBQWMsQ0FBQyxDQUFDO0FBQ3JGLDhCQUEwQixnQkFBZ0IsVUFBVSxhQUFhO0FBQ2pFLHdCQUFvQixLQUFLLFlBQVUsT0FBTyxnQkFBZ0IsVUFBVSxhQUFhLENBQUM7QUFFbEYsVUFBTSwrQkFBK0IsWUFBWSxJQUFJLElBQUksNkJBQTZCLFNBQVMsSUFBSSw2QkFBNkIsQ0FBQyxDQUFDO0FBQ2xJLDhCQUEwQixnQkFBZ0IseUJBQXlCLDRCQUE0QjtBQUUvRixVQUFNLDZCQUE2QixZQUFZLElBQUksSUFBSSwyQkFBMkIsU0FBUyxJQUFJLDJCQUEyQixDQUFDLENBQUM7QUFDNUgsOEJBQTBCLGdCQUFnQix1QkFBdUIsMEJBQTBCO0FBRzNGLFVBQU0seUJBQXlCLEtBQUssWUFBWSxZQUFZLFFBQVEsSUFBSTtBQUN4RSxlQUFXLGtDQUFrQyxzQkFBc0I7QUFDbkUsVUFBTSw0QkFBNEIsWUFBWSxJQUFJLElBQUksOEJBQThCLHdCQUF3QixLQUFLLFlBQVksS0FBSyxzQkFBc0IsQ0FBQztBQUN6Siw4QkFBMEIsZ0JBQWdCLGdDQUFnQyx5QkFBeUI7QUFDbkcsd0JBQW9CLEtBQUssWUFBVSxPQUFPLGdCQUFnQixnQ0FBZ0MseUJBQXlCLENBQUM7QUFHcEgsVUFBTSwwQkFBMEIsYUFBYSxZQUFZLFNBQVMsSUFBSSw0QkFBNEIsR0FBRyxXQUFXO0FBQ2hILDhCQUEwQixnQkFBZ0Isb0JBQW9CLHVCQUF1QjtBQUNyRix3QkFBb0IsS0FBSyxZQUFVLE9BQU8sZ0JBQWdCLG9CQUFvQix1QkFBdUIsQ0FBQztBQUd0RyxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxVQUFNLGdCQUFnQixJQUFJLGNBQWMsYUFBYTtBQUNyRCw4QkFBMEIsZ0JBQWdCLFVBQVUsYUFBYTtBQUdqRSxTQUFLLFVBQVUsSUFBSSx5QkFBeUIsZUFBZSxTQUFTLElBQUksa0JBQWtCLEdBQUcsU0FBUyxJQUFJLG1CQUFtQixDQUFDLENBQUM7QUFHL0gsVUFBTSwyQkFBMkIsSUFBSSx5QkFBeUIsU0FBUyxJQUFJLHlCQUF5QixDQUFpQztBQUNySSw4QkFBMEIsZ0JBQWdCLDRCQUE0Qix3QkFBd0I7QUFDOUYsd0JBQW9CLEtBQUssWUFBVSxPQUFPLGdCQUFnQiw0QkFBNEIsd0JBQXdCLENBQUM7QUFHL0csVUFBTSxpQkFBaUIsYUFBYSxZQUFZLElBQUksbUJBQW1CLEtBQUssWUFBWSxTQUFTLElBQUksbUJBQW1CLEdBQUcsU0FBUyxJQUFJLHVCQUF1QixDQUFDLEdBQUcsV0FBVztBQUM5Syw4QkFBMEIsZ0JBQWdCLFdBQVcsY0FBYztBQUduRSxVQUFNLG9CQUFvQixhQUFhLFlBQVksU0FBUyxJQUFJLHNCQUFzQixHQUFHLFdBQVc7QUFDcEcsOEJBQTBCLGdCQUFnQixjQUFjLGlCQUFpQjtBQUd6RSxVQUFNLHFCQUFxQixhQUFhLFlBQVksU0FBUyxJQUFJLHVCQUF1QixHQUFHLFdBQVc7QUFDdEcsOEJBQTBCLGdCQUFnQiwyQkFBMkIsa0JBQWtCO0FBQ3ZGLHdCQUFvQixLQUFLLFlBQVUsT0FBTyxnQkFBZ0IsMkJBQTJCLGtCQUFrQixDQUFDO0FBR3hHLFVBQU0sMEJBQTBCLGFBQWEsWUFBWSxTQUFTLElBQUksNEJBQTRCLEdBQUcsV0FBVztBQUNoSCw4QkFBMEIsZ0JBQWdCLGdDQUFnQyx1QkFBdUI7QUFDakcsd0JBQW9CLEtBQUssWUFBVSxPQUFPLGdCQUFnQixnQ0FBZ0MsdUJBQXVCLENBQUM7QUFHbEgsVUFBTSxjQUFjLGFBQWEsWUFBWSxTQUFTLElBQUksWUFBWSxHQUFHLFdBQVc7QUFDcEYsOEJBQTBCLGdCQUFnQixRQUFRLFdBQVc7QUFHN0QsVUFBTSx3QkFBd0IsYUFBYSxZQUFZLFNBQVMsSUFBSSwwQkFBMEIsR0FBRyxXQUFXO0FBQzVHLDhCQUEwQixnQkFBZ0Isa0JBQWtCLHFCQUFxQjtBQUdqRixTQUFLLHdCQUF3QixTQUFTLElBQUksc0JBQXNCO0FBQ2hFLFVBQU0sb0JBQW9CLGFBQWEsWUFBWSxLQUFLLHVCQUF1QixhQUFhO0FBQUE7QUFBQSxNQUUzRixrQkFBa0IsQ0FBQyxxQkFBcUI7QUFBQSxJQUN6QyxDQUFDO0FBQ0QsOEJBQTBCLGdCQUFnQixjQUFjLGlCQUFpQjtBQUN6RSx3QkFBb0IsS0FBSyxZQUFVLE9BQU8sZ0JBQWdCLGNBQWMsaUJBQWlCLENBQUM7QUFHMUYsVUFBTSw2QkFBNkIsYUFBYSxZQUFZLFNBQVMsSUFBSSwyQkFBMkIsR0FBRyxXQUFXO0FBQ2xILDhCQUEwQixnQkFBZ0IsdUJBQXVCLDBCQUEwQjtBQUczRixVQUFNLG9CQUFvQixhQUFhLFlBQVksU0FBUyxJQUFJLGtCQUFrQixHQUFHLFdBQVc7QUFDaEcsOEJBQTBCLGdCQUFnQixjQUFjLGlCQUFpQjtBQUd6RSxVQUFNLGlCQUFpQixhQUFhLFlBQVksU0FBUyxJQUFJLG1CQUFtQixHQUFHLFdBQVc7QUFDOUYsOEJBQTBCLGdCQUFnQixXQUFXLGNBQWM7QUFHbkUsVUFBTSxhQUFhLGFBQWEsWUFBWSxTQUFTLElBQUksV0FBVyxHQUFHLFdBQVc7QUFDbEYsOEJBQTBCLGdCQUFnQixPQUFPLFVBQVU7QUFHM0QsVUFBTSxpQkFBaUIsYUFBYSxZQUFZLFNBQVMsSUFBSSxzQkFBc0IsR0FBRyxXQUFXO0FBQ2pHLDhCQUEwQixnQkFBZ0IsV0FBVyxjQUFjO0FBR25FLFVBQU0saUJBQWlCLFlBQVksSUFBSyxJQUFJLHVCQUF1QixLQUFLLFlBQVksU0FBUyxJQUFJLG1CQUFtQixDQUFDLENBQUU7QUFDdkgsOEJBQTBCLGdCQUFnQixXQUFXLGNBQWM7QUFDbkUsd0JBQW9CLEtBQUssWUFBVSxPQUFPLGdCQUFnQixXQUFXLGNBQWMsQ0FBQztBQUdwRixVQUFNLHlCQUF5QixZQUFZLElBQUssSUFBSSxxQ0FBcUMsU0FBUyxJQUFJLG1CQUFtQixHQUFHLFNBQVMsSUFBSSw0QkFBNEIsR0FBRyxLQUFLLFVBQVUsQ0FBRTtBQUN6TCx3QkFBb0IsS0FBSyxZQUFVLE9BQU8sZ0JBQWdCLDBCQUEwQixzQkFBc0IsQ0FBQztBQUczRyxVQUFNLGlCQUFpQixhQUFhLFlBQVksU0FBUyxJQUFJLGdCQUFnQixHQUFHLFdBQVc7QUFDM0YsOEJBQTBCLGdCQUFnQixvQkFBb0IsVUFBVSxjQUFjO0FBR3RGLFVBQU0sMEJBQTBCLGFBQWEsWUFBWSxTQUFTLElBQUksNEJBQTRCLEdBQUcsV0FBVztBQUNoSCw4QkFBMEIsZ0JBQWdCLG9CQUFvQix1QkFBdUI7QUFHckYsVUFBTSx1QkFBdUIsYUFBYSxZQUFZLFNBQVMsSUFBSSx5QkFBeUIsR0FBRyxXQUFXO0FBQzFHLDhCQUEwQixnQkFBZ0IsaUJBQWlCLG9CQUFvQjtBQUcvRSxVQUFNLHNCQUFzQixhQUFhLFlBQVksU0FBUyxJQUFJLGdDQUFnQyxHQUFHLFdBQVc7QUFDaEgsOEJBQTBCLGdCQUFnQixxQ0FBcUMsbUJBQW1CO0FBQ2xHLFVBQU0sb0JBQW9CLEtBQUssVUFBVSxJQUFJLGtCQUFrQiwyQkFBMkIsU0FBUyxJQUFJLGtCQUFrQixHQUFHLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO0FBQzdKLDhCQUEwQixnQkFBZ0IsdUJBQXVCLGlCQUFpQjtBQUdsRixVQUFNLGdCQUFnQixLQUFLLFVBQVUsSUFBSSxjQUFjLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO0FBQ3hGLDhCQUEwQixnQkFBZ0IsVUFBVSxhQUFhO0FBQ2pFLHdCQUFvQixLQUFLLFlBQVUsT0FBTyxnQkFBZ0IsVUFBVSxhQUFhLENBQUM7QUFHbEYsVUFBTSw2Q0FBNkMsSUFBSSwyQ0FBMkMsU0FBUyxJQUFJLG1CQUFtQixDQUFDO0FBQ25JLDhCQUEwQixnQkFBZ0IsNkJBQTZCLDBDQUEwQztBQUdqSCxVQUFNLDhCQUE4QixhQUFhLFlBQVksU0FBUyxJQUFJLHFCQUFxQixHQUFHLFdBQVc7QUFDN0csOEJBQTBCLGdCQUFnQixvQ0FBb0MsMkJBQTJCO0FBR3pHLFVBQU0sOEJBQThCLGFBQWEsWUFBWSxTQUFTLElBQUksZ0NBQWdDLEdBQUcsV0FBVztBQUN4SCw4QkFBMEIsZ0JBQWdCLG9DQUFvQywyQkFBMkI7QUFBQSxFQUMxRztBQUFBLEVBRUEsTUFBYyxnQkFBZ0IsVUFBNEIscUJBQStFO0FBQ3hJLFVBQU0scUJBQXFCLEtBQUsscUJBQXFCLFNBQVMsSUFBSSxtQkFBbUI7QUFDckYsU0FBSyw4QkFBOEIsU0FBUyxJQUFJLDRCQUE0QjtBQUU1RSxVQUFNLFVBQVUsa0JBQWtCLFFBQVEsR0FBRyxJQUFJLFlBQVksTUFBTSxZQUFZO0FBQy9FLFVBQU0sT0FBTyxLQUFLLHVCQUF1QjtBQUd6QyxRQUFJLEtBQUssUUFBUSxHQUFHO0FBQ25CLGFBQU8sbUJBQW1CLGlCQUFpQjtBQUFBLFFBQzFDO0FBQUEsUUFDQSxLQUFLO0FBQUEsUUFDTCxnQkFBZ0I7QUFBQSxNQUNqQixDQUFDO0FBQUEsSUFDRjtBQUdBLFFBQUkscUJBQXFCO0FBR3hCLFVBQUksb0JBQW9CLFVBQVUsU0FBUyxHQUFHO0FBQzdDLGVBQU8sbUJBQW1CLEtBQUs7QUFBQSxVQUM5QjtBQUFBLFVBQ0EsS0FBSztBQUFBLFVBQ0wsWUFBWSxvQkFBb0I7QUFBQSxVQUNoQyxjQUFjO0FBQUEsVUFDZCxnQkFBZ0I7QUFBQTtBQUFBLFFBRWpCLENBQUM7QUFBQSxNQUNGO0FBVUEsVUFBSSxvQkFBb0IsS0FBSyxTQUFTLEdBQUc7QUFDeEMsbUJBQVcsZUFBZSxvQkFBb0IsTUFBTTtBQUNuRCxnQkFBTSxTQUFTLElBQUksZ0JBQWdCLFlBQVksSUFBSSxLQUFLO0FBQ3hELGNBQUksT0FBTyxJQUFJLFVBQVUsTUFBTSxVQUFVO0FBS3hDLG1CQUFPLE9BQU8sVUFBVTtBQUN4Qix3QkFBWSxjQUFjLFlBQVksSUFBSSxTQUFTLElBQUk7QUFDdkQsd0JBQVksTUFBTSxZQUFZLElBQUksS0FBSyxFQUFFLE9BQU8sT0FBTyxTQUFTLEVBQUUsQ0FBQztBQUVuRSxtQkFBTyxtQkFBbUIsS0FBSztBQUFBLGNBQzlCO0FBQUEsY0FDQSxLQUFLO0FBQUEsY0FDTCxnQkFBZ0I7QUFBQSxjQUNoQixZQUFZO0FBQUEsY0FDWixjQUFjO0FBQUEsY0FDZCxnQkFBZ0I7QUFBQTtBQUFBLFlBRWpCLENBQUM7QUFBQSxVQUNGO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxlQUEwQixPQUF1QyxnQkFBZ0IsQ0FBQztBQUN4RixVQUFNLGFBQWEsS0FBSyxFQUFFO0FBQzFCLFVBQU0sZ0JBQWdCLENBQUMsQ0FBQyxLQUFLLFlBQVk7QUFDekMsVUFBTSxjQUFjLENBQUMsQ0FBQyxLQUFLLFVBQVU7QUFDckMsVUFBTSxnQkFBZ0IsS0FBSyw2QkFBNkIsTUFBTTtBQUM5RCxVQUFNLG9CQUFvQixLQUFLLFFBQVEsS0FBSyxxQkFBcUIsSUFBSSxLQUFLLEtBQUssa0JBQWtCLElBQUk7QUFDckcsVUFBTSxrQkFBa0IsS0FBSyxVQUFVO0FBQ3ZDLFVBQU0sZUFBZSxLQUFLO0FBQzFCLFVBQU0sbUJBQW1CLEtBQUssY0FBYztBQUc1QyxRQUFJLENBQUMsY0FBYyxDQUFDLGlCQUFpQixDQUFDLGFBQWE7QUFHbEQsVUFBSSxLQUFLLFlBQVksS0FBSyxnQkFBZ0Isa0JBQWtCO0FBQzNELGVBQU8sbUJBQW1CLEtBQUs7QUFBQSxVQUM5QjtBQUFBLFVBQ0EsS0FBSztBQUFBLFVBQ0wsZ0JBQWdCO0FBQUEsVUFDaEIsWUFBWTtBQUFBLFVBQ1o7QUFBQSxVQUNBO0FBQUEsVUFDQSxnQkFBZ0I7QUFBQSxVQUNoQjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUdBLFVBQUksYUFBYSxRQUFRO0FBQ3hCLGVBQU8sbUJBQW1CLEtBQUs7QUFBQSxVQUM5QixTQUFTLFlBQVk7QUFBQSxVQUNyQixLQUFLO0FBQUEsVUFDTCxZQUFZLGFBQWEsSUFBSSxVQUFRO0FBQ3BDLG1CQUFPLGFBQWEsSUFBSTtBQUV4QixtQkFBUSwwQkFBMEIsSUFBSSxJQUFJLEVBQUUsY0FBYyxJQUFJLEtBQUssSUFBSSxFQUFFLElBQUksRUFBRSxTQUFTLElBQUksS0FBSyxJQUFJLEVBQUU7QUFBQSxVQUN4RyxDQUFDO0FBQUEsVUFDRDtBQUFBLFVBQ0E7QUFBQSxVQUNBLGdCQUFnQjtBQUFBO0FBQUEsUUFFakIsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBR0EsV0FBTyxtQkFBbUIsS0FBSztBQUFBLE1BQzlCO0FBQUEsTUFDQSxLQUFLO0FBQUEsTUFDTCxnQkFBZ0IsS0FBSyxZQUFZO0FBQUEsTUFDakMsVUFBVSxLQUFLO0FBQUEsTUFDZixXQUFXLEtBQUs7QUFBQSxNQUNoQjtBQUFBLE1BQ0E7QUFBQSxNQUNBLGNBQWMsS0FBSztBQUFBLE1BQ25CLGdCQUFnQjtBQUFBLE1BQ2hCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxnQkFBZ0Isc0JBQW1EO0FBRzFFLFFBQUksV0FBVztBQUNkLDZCQUF1QjtBQUFBLElBQ3hCO0FBR0EsU0FBSyxhQUFhO0FBR2xCLGFBQVMscUJBQXFCLFFBQVEsc0JBQXNCLENBQUMsU0FBUyxhQUFhO0FBQ2xGLGVBQVM7QUFBQSxRQUNSLEtBQUssUUFBUSxJQUFJLFFBQVEsNEJBQTRCLE9BQU87QUFBQSxRQUM1RCxRQUFRLFFBQVE7QUFBQSxNQUNqQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBTUQsU0FBSyx3QkFBd0IsS0FBSyx1QkFBdUIsTUFBTSxRQUFRLEtBQUssSUFBSTtBQUdoRixTQUFLLDhCQUE4QjtBQUduQyxRQUFJLGVBQWUsSUFBSSw4QkFBOEI7QUFDcEQsV0FBSyxvQkFBb0IsY0FBYyxtQ0FBbUM7QUFBQSxJQUMzRTtBQUdBLHlCQUFxQixlQUFlLGNBQVk7QUFDL0MsWUFBTSxtQkFBbUIsU0FBUyxJQUFJLGlCQUFpQjtBQWlCdkQsWUFBTSxvQkFBb0IsT0FBbUI7QUFBQSxRQUM1QyxXQUFXLGFBQWEsbUJBQW1CLEVBQUU7QUFBQSxRQUM3QyxVQUFVLGFBQWEsa0JBQWtCO0FBQUEsUUFDekMsY0FBYyxhQUFhLHVCQUF1QjtBQUFBLFFBQ2xELFdBQVcsYUFBYSxpQkFBaUI7QUFBQSxNQUMxQztBQUVBLFdBQUssVUFBVSxNQUFNLHFCQUFxQixjQUFjLFNBQVMsRUFBRSxNQUFNO0FBQ3hFLHlCQUFpQixXQUFpRCxpQkFBaUIsa0JBQWtCLENBQUM7QUFBQSxNQUN2RyxDQUFDLENBQUM7QUFFRixXQUFLLFVBQVUsTUFBTSxxQkFBcUIsY0FBYyxRQUFRLEVBQUUsTUFBTTtBQUN2RSx5QkFBaUIsV0FBaUQsZ0JBQWdCLGtCQUFrQixDQUFDO0FBQUEsTUFDdEcsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDO0FBSUQsUUFBSSxhQUFhO0FBQ2hCLDJCQUFxQixlQUFlLGNBQVk7QUFDL0MsY0FBTSxtQkFBbUIsU0FBUyxJQUFJLGlCQUFpQjtBQUl2RCxjQUFNLDBCQUEwQixJQUFJLG9CQUFvQjtBQUN4RCxjQUFNLHNCQUE4Qix3QkFBd0IsZUFBZTtBQUMzRSxZQUFJLHdCQUF3QixXQUFXO0FBQ3RDLGdCQUFNLGdCQUFnQixNQUFNLHFCQUFxQixLQUFLLGlCQUFpQjtBQUN2RSxnQkFBTSx5QkFBeUIsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFDckUsZUFBSyxVQUFVLE1BQU0scUJBQTJDLEtBQUssc0JBQXNCLENBQUMsT0FBTyxhQUFhLEVBQUUsT0FBTyxRQUFRLEVBQUUsRUFBRSxDQUFDLEVBQUUsUUFBUSxNQUFNO0FBQ3JKLGdCQUFJLFFBQVEsU0FBUyxTQUFTLFFBQVEsV0FBVyxXQUFXO0FBSzNELHFDQUF1QixRQUFRLE1BQU0sS0FBSyxhQUFhLEVBQUUsTUFBTTtBQUM5RCxzQkFBTSwwQkFBMEIsSUFBSSxvQkFBb0I7QUFDeEQsc0JBQU0sNkJBQXFDLHdCQUF3QixlQUFlO0FBQ2xGLG9CQUFJLCtCQUErQixXQUFXO0FBRTdDLHNCQUFJLGlCQUEyQixDQUFDO0FBSWhDLHdCQUFNLFlBQVk7QUFDbEIsc0JBQUksT0FBTyxVQUFVLHNCQUFzQixZQUFZO0FBQ3RELHFDQUFpQixVQUFVLGtCQUFrQixFQUFFLE1BQU0sR0FBRyxFQUFFLElBQUksU0FBTyxJQUFJLE9BQU87QUFBQSxrQkFDakY7QUFhQSxtQ0FBaUIsV0FBa0Qsc0JBQXNCO0FBQUEsb0JBQ3hGLGtCQUFrQixLQUFLLFVBQVUsdUJBQXVCO0FBQUEsb0JBQ3hELGdCQUFnQixLQUFLLFVBQVUsY0FBYztBQUFBLGtCQUM5QyxDQUFDO0FBQUEsZ0JBQ0Y7QUFBQSxjQUNELENBQUM7QUFBQSxZQUNGO0FBQUEsVUFDRCxDQUFDLENBQUM7QUFBQSxRQUNIO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUVBO0FBZ0JDLFlBQU0sWUFBWTtBQUVsQiwyQkFBcUIsZUFBZSxjQUFZO0FBQy9DLGNBQU0sbUJBQW1CLFNBQVMsSUFBSSxpQkFBaUI7QUFldkQsYUFBSyxVQUFVLE1BQU0scUJBQW9ELFdBQVcsNEJBQTRCLENBQUMsUUFBUSxZQUFZLE9BQU8sRUFBRSxhQUFXO0FBQ3hKLGVBQUssV0FBVyxLQUFLLHVDQUF1QyxRQUFRLEdBQUcsRUFBRTtBQUV6RSwyQkFBaUIsV0FBcUQsMkJBQTJCLENBQUMsQ0FBQztBQUFBLFFBQ3BHLENBQUMsQ0FBQztBQUVGLGFBQUssVUFBVSxNQUFNLHFCQUFnRCxXQUFXLHdCQUF3QixDQUFDLFFBQVEsWUFBWSxPQUFPLEVBQUUsYUFBVztBQUNoSixlQUFLLFdBQVcsS0FBSyxpQ0FBaUMsUUFBUSxHQUFHLGVBQWUsUUFBUSxRQUFRLGNBQWMsUUFBUSxPQUFPLG9CQUFvQixRQUFRLGFBQWEsRUFBRTtBQUV4SywyQkFBaUIsV0FBNkcsdUJBQXVCO0FBQUEsWUFDcEosVUFBVSxRQUFRO0FBQUEsWUFDbEIsU0FBUyxRQUFRO0FBQUEsWUFDakIsZUFBZSxRQUFRO0FBQUEsVUFDeEIsQ0FBQztBQUFBLFFBQ0YsQ0FBQyxDQUFDO0FBQUEsTUFDSCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBRUQ7QUFBQSxFQUVBLE1BQWMsZUFBOEI7QUFDM0MsVUFBTSxpQkFBaUIsS0FBSyxlQUFlO0FBQzNDLFFBQUksYUFBYSxrQkFBa0IsbUJBQW1CLEdBQUc7QUFDeEQsVUFBSTtBQUNILGNBQU0sZUFBZSxNQUFNLE9BQU8sdUJBQXVCO0FBQ3pELGNBQU0sUUFBUSxJQUFJLGFBQWEsTUFBTSxjQUFjO0FBQ25ELGNBQU0sS0FBSyxLQUFLLHFCQUFxQixjQUFjLEVBQUUsTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUFBLE1BQzNFLFNBQVMsT0FBTztBQUNmLGFBQUssV0FBVyxNQUFNLEtBQUs7QUFBQSxNQUM1QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLHdCQUF3QixNQUF3QixLQUEwQixlQUFxRDtBQUM1SSxRQUFJO0FBQ0gsYUFBTyxNQUFNLG9CQUFvQixLQUFLLHNCQUFzQixLQUFLLFlBQVksTUFBTSxHQUFHO0FBQUEsSUFDdkYsU0FBUyxPQUFPO0FBQ2YsWUFBTSxlQUFlLGVBQWUsS0FBSztBQUN6QyxVQUFJLGVBQWU7QUFDbEIsYUFBSyxvQkFBb0IsY0FBYyxtQ0FBbUMsWUFBWTtBQUFBLE1BQ3ZGLE9BQU87QUFDTixhQUFLLFdBQVcsTUFBTSxZQUFZO0FBQUEsTUFDbkM7QUFBQSxJQUNEO0FBRUEsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBRUEsTUFBYyxnQ0FBK0M7QUFNNUQsUUFBSTtBQUNILFlBQU0sY0FBYyxNQUFNLEtBQUssWUFBWSxTQUFTLEtBQUssdUJBQXVCLFlBQVk7QUFDNUYsWUFBTSxhQUFhLFlBQVksTUFBTSxTQUFTO0FBQzlDLFlBQU0sV0FBVyxNQUE2QyxVQUFVO0FBQ3hFLFlBQU0saUJBQWlCLGtCQUFrQixLQUFLLG9CQUFvQjtBQUNsRSxZQUFNLHNCQUFzQixrQkFBa0IsZUFBZTtBQUc3RCxVQUFJLFNBQVMsdUJBQXVCLE1BQU0sUUFBVztBQUNwRCxjQUFNLHdCQUF3QjtBQUFBLFVBQzdCO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBLDZCQUE2QixtQkFBbUI7QUFBQSxVQUNoRDtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQSwwQkFBMEIsYUFBYSxDQUFDO0FBQUEsVUFDeEM7QUFBQSxRQUNEO0FBQ0EsY0FBTSxnQkFBZ0IsV0FBVyxVQUFVLEdBQUcsV0FBVyxTQUFTLENBQUMsRUFBRSxPQUFPLE9BQU8sc0JBQXNCLEtBQUssSUFBSSxDQUFDO0FBRW5ILGNBQU0sS0FBSyxZQUFZLFVBQVUsS0FBSyx1QkFBdUIsY0FBYyxTQUFTLFdBQVcsYUFBYSxDQUFDO0FBQUEsTUFDOUcsT0FHSztBQUNKLGNBQU0sZ0JBQWdCLFdBQVcsUUFBUSxnQ0FBZ0MsNEJBQTRCLG1CQUFtQixHQUFHO0FBQzNILFlBQUksa0JBQWtCLFlBQVk7QUFDakMsZ0JBQU0sS0FBSyxZQUFZLFVBQVUsS0FBSyx1QkFBdUIsY0FBYyxTQUFTLFdBQVcsYUFBYSxDQUFDO0FBQUEsUUFDOUc7QUFBQSxNQUNEO0FBQUEsSUFDRCxTQUFTLE9BQU87QUFDZixXQUFLLFdBQVcsTUFBTSxLQUFLO0FBRzNCLFdBQUssb0JBQW9CLGNBQWMsNkJBQTZCO0FBQUEsSUFDckU7QUFBQSxFQUNEO0FBQUEsRUFFUSwwQkFBMEIsc0JBQW1EO0FBSXBGLHdCQUFvQixLQUFLLGNBQWMsS0FBSyxVQUFVO0FBRXRELHlCQUFxQixlQUFlLGNBQVk7QUFDL0MsWUFBTSxtQkFBbUIsU0FBUyxJQUFJLGlCQUFpQjtBQUN2RCxVQUFJLGlCQUFpQixpQkFBaUIsZUFBZSxPQUFPO0FBQzNEO0FBQUEsTUFDRDtBQUVBLFlBQU0sd0JBQXdCLFNBQVMsSUFBSSxzQkFBc0I7QUFDakUsV0FBSyxLQUFLLDBCQUEwQix1QkFBdUIsZ0JBQWdCO0FBQUEsSUFDNUUsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsMEJBQTBCLHVCQUErQyxrQkFBb0Q7QUFDMUksVUFBTSxZQUFZLEtBQUssSUFBSTtBQUMzQixRQUFJO0FBQ0gsWUFBTSxTQUFTLE1BQU0sc0JBQXNCLDJCQUEyQixNQUFTO0FBQy9FLFlBQU0sYUFBYSxLQUFLLElBQUksSUFBSTtBQUNoQyxZQUFNLGlCQUFpQixPQUFPLE1BQU0sa0JBQWtCLE9BQU8sSUFBSSxPQUFPLElBQUk7QUFDNUUsdUJBQWlCLFdBQTRELGlCQUFpQjtBQUFBLFFBQzdGLFNBQVM7QUFBQSxRQUNUO0FBQUEsUUFDQSxjQUFjLE9BQU8sVUFBVSxRQUFRO0FBQUEsUUFDdkMsWUFBWSxPQUFPO0FBQUEsUUFDbkIsMkJBQTJCLDJCQUEyQixPQUFPLFlBQVksU0FBUztBQUFBLFFBQ2xGLDRCQUE0QiwyQkFBMkIsT0FBTyxZQUFZLFVBQVU7QUFBQSxRQUNwRiwwQkFBMEIsMkJBQTJCLE9BQU8sWUFBWSxRQUFRO0FBQUEsUUFDaEYseUJBQXlCLDJCQUEyQixPQUFPLFlBQVksT0FBTztBQUFBLFFBQzlFLGVBQWUsT0FBTyxTQUFTO0FBQUEsUUFDL0IsY0FBYyxPQUFPLFFBQVE7QUFBQSxRQUM3QixvQkFBb0IsT0FBTyxjQUFjO0FBQUEsUUFDekMsa0JBQWtCLENBQUMsQ0FBQyxPQUFPO0FBQUEsUUFDM0IsY0FBYyxDQUFDLENBQUMsT0FBTztBQUFBLFFBQ3ZCLFdBQVcsT0FBTyxLQUFLLFVBQVU7QUFBQSxRQUNqQyx5QkFBeUIsZ0JBQWdCO0FBQUEsUUFDekMsb0JBQW9CLGdCQUFnQjtBQUFBLFFBQ3BDLHNCQUFzQixnQkFBZ0I7QUFBQSxRQUN0QyxjQUFjLENBQUMsQ0FBQyxPQUFPLGFBQWE7QUFBQSxRQUNwQyxlQUFlLENBQUMsQ0FBQyxPQUFPLGFBQWE7QUFBQSxRQUNyQyxlQUFlLENBQUMsQ0FBQyxPQUFPLGFBQWE7QUFBQSxRQUNyQyxnQkFBZ0Isc0JBQXNCLE1BQU07QUFBQSxRQUM1Qyx3QkFBd0IsT0FBTyxVQUFVLFNBQVMsVUFBVSxPQUFPLFNBQVMseUJBQXlCO0FBQUEsTUFDdEcsQ0FBQztBQUFBLElBQ0YsUUFBUTtBQUNQLHVCQUFpQixXQUE0RCxpQkFBaUI7QUFBQSxRQUM3RixTQUFTO0FBQUEsUUFDVCxZQUFZLEtBQUssSUFBSSxJQUFJO0FBQUEsTUFDMUIsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0Q7QUF2cERhLGdCQUVZLHNEQUFzRDtBQUFBLEVBQzdFLENBQUMsUUFBUSxJQUFJLEdBQUc7QUFBQSxFQUNoQixDQUFDLFFBQVEsWUFBWSxHQUFHO0FBQ3pCO0FBTFksa0JBQU47QUFBQSxFQWNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F2QlU7QUF5cERiLFNBQVMsc0JBQXNCLFFBQWlDO0FBQy9ELFVBQVEsT0FBTyxVQUFVLE1BQU07QUFBQSxJQUM5QixLQUFLO0FBQVcsYUFBTyxDQUFDLENBQUMsT0FBTyxTQUFTO0FBQUEsSUFDekMsS0FBSztBQUFTLGFBQU8sT0FBTyxTQUFTLDBCQUEwQixPQUFPLFNBQVMsV0FBVyxTQUFTO0FBQUEsSUFDbkcsS0FBSztBQUFTLGFBQU8sT0FBTyxTQUFTLFlBQVksU0FBUztBQUFBLElBQzFEO0FBQVMsYUFBTztBQUFBLEVBQ2pCO0FBQ0Q7QUFFQSxTQUFTLDJCQUEyQixRQUF3RjtBQUMzSCxTQUFPLFNBQVMsT0FBTyxRQUFRLFlBQVksZUFBZTtBQUMzRDtBQUVBLFNBQVMsa0JBQWtCLFNBQXFGO0FBQy9HLFNBQU87QUFBQSxJQUNOLGdCQUFnQixRQUFRO0FBQUEsSUFDeEIsV0FBVyxRQUFRLFdBQVcsSUFBSSxJQUFJLFFBQVEsTUFBTSxZQUFZLEVBQUU7QUFBQSxJQUNsRSxhQUFhLFFBQVEsTUFBTSxhQUFhLEdBQUcsVUFBVTtBQUFBLEVBQ3REO0FBQ0Q7IiwKICAibmFtZXMiOiBbImV2ZW50IiwgImFwcCIsICJzZXNzaW9uIl0KfQo=
