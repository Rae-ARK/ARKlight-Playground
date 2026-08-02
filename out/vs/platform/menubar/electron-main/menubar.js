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
import { app, BrowserWindow, Menu, MenuItem } from "electron";
import { RunOnceScheduler } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { mnemonicMenuLabel } from "../../../base/common/labels.js";
import { isMacintosh, language } from "../../../base/common/platform.js";
import { URI } from "../../../base/common/uri.js";
import * as nls from "../../../nls.js";
import { IAuxiliaryWindowsMainService } from "../../auxiliaryWindow/electron-main/auxiliaryWindows.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { isMenubarMenuItemAction, isMenubarMenuItemRecentAction, isMenubarMenuItemSeparator, isMenubarMenuItemSubmenu } from "../common/menubar.js";
import { INativeHostMainService } from "../../native/electron-main/nativeHostMainService.js";
import { IProductService } from "../../product/common/productService.js";
import { IStateService } from "../../state/node/state.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUpdateService, StateType } from "../../update/common/update.js";
import { hasNativeMenu } from "../../window/common/window.js";
import { IWindowsMainService, OpenContext } from "../../windows/electron-main/windows.js";
import { IWorkspacesHistoryMainService } from "../../workspaces/electron-main/workspacesHistoryMainService.js";
import { Disposable } from "../../../base/common/lifecycle.js";
const telemetryFrom = "menu";
let Menubar = class extends Disposable {
  constructor(updateService, configurationService, windowsMainService, environmentMainService, telemetryService, workspacesHistoryMainService, stateService, lifecycleMainService, logService, nativeHostMainService, productService, auxiliaryWindowsMainService) {
    super();
    this.updateService = updateService;
    this.configurationService = configurationService;
    this.windowsMainService = windowsMainService;
    this.environmentMainService = environmentMainService;
    this.telemetryService = telemetryService;
    this.workspacesHistoryMainService = workspacesHistoryMainService;
    this.stateService = stateService;
    this.lifecycleMainService = lifecycleMainService;
    this.logService = logService;
    this.nativeHostMainService = nativeHostMainService;
    this.productService = productService;
    this.auxiliaryWindowsMainService = auxiliaryWindowsMainService;
    this.fallbackMenuHandlers = /* @__PURE__ */ Object.create(null);
    this.menuUpdater = this._register(new RunOnceScheduler(() => this.doUpdateMenu(), 0));
    this.menuGC = this._register(new RunOnceScheduler(() => {
      this.oldMenus = [];
    }, 1e4));
    this.menubarMenus = /* @__PURE__ */ Object.create(null);
    this.keybindings = /* @__PURE__ */ Object.create(null);
    this.showNativeMenu = hasNativeMenu(configurationService);
    if (isMacintosh || this.showNativeMenu) {
      this.restoreCachedMenubarData();
    }
    this.addFallbackHandlers();
    this.closedLastWindow = false;
    this.noActiveMainWindow = false;
    this.oldMenus = [];
    this.install();
    this.registerListeners();
  }
  restoreCachedMenubarData() {
    const menubarData = this.stateService.getItem(Menubar.lastKnownMenubarStorageKey);
    if (menubarData) {
      if (menubarData.menus) {
        this.menubarMenus = menubarData.menus;
      }
      if (menubarData.keybindings) {
        this.keybindings = menubarData.keybindings;
      }
    }
  }
  addFallbackHandlers() {
    this.fallbackMenuHandlers["workbench.action.files.newUntitledFile"] = (menuItem, win, event) => {
      if (!this.runActionInRenderer({ type: "commandId", commandId: "workbench.action.files.newUntitledFile" })) {
        this.windowsMainService.openEmptyWindow({ context: OpenContext.MENU, contextWindowId: win?.id });
      }
    };
    this.fallbackMenuHandlers["workbench.action.newWindow"] = (menuItem, win, event) => this.windowsMainService.openEmptyWindow({ context: OpenContext.MENU, contextWindowId: win?.id });
    this.fallbackMenuHandlers["workbench.action.files.openFileFolder"] = (menuItem, win, event) => this.nativeHostMainService.pickFileFolderAndOpen(void 0, { forceNewWindow: this.isOptionClick(event), telemetryExtraData: { from: telemetryFrom } });
    this.fallbackMenuHandlers["workbench.action.files.openFolder"] = (menuItem, win, event) => this.nativeHostMainService.pickFolderAndOpen(void 0, { forceNewWindow: this.isOptionClick(event), telemetryExtraData: { from: telemetryFrom } });
    this.fallbackMenuHandlers["workbench.action.openWorkspace"] = (menuItem, win, event) => this.nativeHostMainService.pickWorkspaceAndOpen(void 0, { forceNewWindow: this.isOptionClick(event), telemetryExtraData: { from: telemetryFrom } });
    this.fallbackMenuHandlers["workbench.action.clearRecentFiles"] = () => this.workspacesHistoryMainService.clearRecentlyOpened({
      confirm: true
      /* ask for confirmation */
    });
    const youTubeUrl = this.productService.youTubeUrl;
    if (youTubeUrl) {
      this.fallbackMenuHandlers["workbench.action.openYouTubeUrl"] = () => this.openUrl(youTubeUrl, "openYouTubeUrl");
    }
    const requestFeatureUrl = this.productService.requestFeatureUrl;
    if (requestFeatureUrl) {
      this.fallbackMenuHandlers["workbench.action.openRequestFeatureUrl"] = () => this.openUrl(requestFeatureUrl, "openUserVoiceUrl");
    }
    const reportIssueUrl = this.productService.reportIssueUrl;
    if (reportIssueUrl) {
      this.fallbackMenuHandlers["workbench.action.openIssueReporter"] = () => this.openUrl(reportIssueUrl, "openReportIssues");
    }
    const licenseUrl = this.productService.licenseUrl;
    if (licenseUrl) {
      this.fallbackMenuHandlers["workbench.action.openLicenseUrl"] = () => {
        if (language) {
          const queryArgChar = licenseUrl.indexOf("?") > 0 ? "&" : "?";
          this.openUrl(`${licenseUrl}${queryArgChar}lang=${language}`, "openLicenseUrl");
        } else {
          this.openUrl(licenseUrl, "openLicenseUrl");
        }
      };
    }
    const privacyStatementUrl = this.productService.privacyStatementUrl;
    if (privacyStatementUrl && licenseUrl) {
      this.fallbackMenuHandlers["workbench.action.openPrivacyStatementUrl"] = () => {
        this.openUrl(privacyStatementUrl, "openPrivacyStatement");
      };
    }
  }
  registerListeners() {
    this._register(this.lifecycleMainService.onWillShutdown(() => this.willShutdown = true));
    this._register(this.windowsMainService.onDidChangeWindowsCount((e) => this.onDidChangeWindowsCount(e)));
    this._register(this.nativeHostMainService.onDidBlurMainWindow(() => this.onDidChangeWindowFocus()));
    this._register(this.nativeHostMainService.onDidFocusMainWindow(() => this.onDidChangeWindowFocus()));
    this._register(this.updateService.onStateChange(() => this.scheduleUpdateMenu()));
  }
  get currentEnableMenuBarMnemonics() {
    const enableMenuBarMnemonics = this.configurationService.getValue("window.enableMenuBarMnemonics");
    if (typeof enableMenuBarMnemonics !== "boolean") {
      return true;
    }
    return enableMenuBarMnemonics;
  }
  get currentEnableNativeTabs() {
    if (!isMacintosh) {
      return false;
    }
    const enableNativeTabs = this.configurationService.getValue("window.nativeTabs");
    if (typeof enableNativeTabs !== "boolean") {
      return false;
    }
    return enableNativeTabs;
  }
  updateMenu(menubarData, windowId) {
    this.menubarMenus = menubarData.menus;
    this.keybindings = menubarData.keybindings;
    this.stateService.setItem(Menubar.lastKnownMenubarStorageKey, menubarData);
    this.scheduleUpdateMenu();
  }
  scheduleUpdateMenu() {
    this.menuUpdater.schedule();
  }
  doUpdateMenu() {
    if (!this.willShutdown) {
      setTimeout(
        () => {
          if (!this.willShutdown) {
            this.install();
          }
        },
        10
        /* delay this because there is an issue with updating a menu when it is open */
      );
    }
  }
  onDidChangeWindowsCount(e) {
    if (!isMacintosh) {
      return;
    }
    if (e.oldCount === 0 && e.newCount > 0 || e.oldCount > 0 && e.newCount === 0) {
      this.closedLastWindow = e.newCount === 0;
      this.scheduleUpdateMenu();
    }
  }
  onDidChangeWindowFocus() {
    if (!isMacintosh) {
      return;
    }
    const focusedWindow = BrowserWindow.getFocusedWindow();
    this.noActiveMainWindow = !focusedWindow || !!this.auxiliaryWindowsMainService.getWindowByWebContents(focusedWindow.webContents);
    this.scheduleUpdateMenu();
  }
  install() {
    const oldMenu = Menu.getApplicationMenu();
    if (oldMenu) {
      this.oldMenus.push(oldMenu);
    }
    if (Object.keys(this.menubarMenus).length === 0) {
      this.doSetApplicationMenu(isMacintosh ? new Menu() : null);
      return;
    }
    const menubar = new Menu();
    let macApplicationMenuItem;
    if (isMacintosh) {
      const applicationMenu = new Menu();
      macApplicationMenuItem = new MenuItem({ label: this.productService.nameShort, submenu: applicationMenu });
      this.setMacApplicationMenu(applicationMenu);
      menubar.append(macApplicationMenuItem);
    }
    if (isMacintosh && !this.appMenuInstalled) {
      this.appMenuInstalled = true;
      const dockMenu = new Menu();
      dockMenu.append(new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "miNewWindow", comment: ["&& denotes a mnemonic"] }, "New &&Window")), click: () => this.windowsMainService.openEmptyWindow({ context: OpenContext.DOCK }) }));
      app.dock.setMenu(dockMenu);
    }
    if (this.shouldDrawMenu("File")) {
      const fileMenu = new Menu();
      const fileMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mFile", comment: ["&& denotes a mnemonic"] }, "&&File")), submenu: fileMenu });
      this.setMenuById(fileMenu, "File");
      menubar.append(fileMenuItem);
    }
    if (this.shouldDrawMenu("Edit")) {
      const editMenu = new Menu();
      const editMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mEdit", comment: ["&& denotes a mnemonic"] }, "&&Edit")), submenu: editMenu });
      this.setMenuById(editMenu, "Edit");
      menubar.append(editMenuItem);
    }
    if (this.shouldDrawMenu("Selection")) {
      const selectionMenu = new Menu();
      const selectionMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mSelection", comment: ["&& denotes a mnemonic"] }, "&&Selection")), submenu: selectionMenu });
      this.setMenuById(selectionMenu, "Selection");
      menubar.append(selectionMenuItem);
    }
    if (this.shouldDrawMenu("View")) {
      const viewMenu = new Menu();
      const viewMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mView", comment: ["&& denotes a mnemonic"] }, "&&View")), submenu: viewMenu });
      this.setMenuById(viewMenu, "View");
      menubar.append(viewMenuItem);
    }
    if (this.shouldDrawMenu("Go")) {
      const gotoMenu = new Menu();
      const gotoMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mGoto", comment: ["&& denotes a mnemonic"] }, "&&Go")), submenu: gotoMenu });
      this.setMenuById(gotoMenu, "Go");
      menubar.append(gotoMenuItem);
    }
    if (this.shouldDrawMenu("Run")) {
      const debugMenu = new Menu();
      const debugMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mRun", comment: ["&& denotes a mnemonic"] }, "&&Run")), submenu: debugMenu });
      this.setMenuById(debugMenu, "Run");
      menubar.append(debugMenuItem);
    }
    if (this.shouldDrawMenu("Terminal")) {
      const terminalMenu = new Menu();
      const terminalMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mTerminal", comment: ["&& denotes a mnemonic"] }, "&&Terminal")), submenu: terminalMenu });
      this.setMenuById(terminalMenu, "Terminal");
      menubar.append(terminalMenuItem);
    }
    let macWindowMenuItem;
    if (this.shouldDrawMenu("Window")) {
      const windowMenu = new Menu();
      macWindowMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize("mWindow", "Window")), submenu: windowMenu, role: "window" });
      this.setMacWindowMenu(windowMenu);
    }
    if (macWindowMenuItem) {
      menubar.append(macWindowMenuItem);
    }
    if (this.shouldDrawMenu("Help")) {
      const helpMenu = new Menu();
      const helpMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mHelp", comment: ["&& denotes a mnemonic"] }, "&&Help")), submenu: helpMenu, role: "help" });
      this.setMenuById(helpMenu, "Help");
      menubar.append(helpMenuItem);
    }
    if (menubar.items && menubar.items.length > 0) {
      this.doSetApplicationMenu(menubar);
    } else {
      this.doSetApplicationMenu(null);
    }
    this.menuGC.schedule();
  }
  doSetApplicationMenu(menu) {
    Menu.setApplicationMenu(menu);
    if (menu) {
      for (const window of this.auxiliaryWindowsMainService.getWindows()) {
        window.win?.setMenu(null);
      }
    }
  }
  setMacApplicationMenu(macApplicationMenu) {
    const about = this.createMenuItem(nls.localize("mAbout", "About {0}", this.productService.nameLong), "workbench.action.showAboutDialog");
    const checkForUpdates = this.getUpdateMenuItems();
    let preferences;
    if (this.shouldDrawMenu("Preferences")) {
      const preferencesMenu = new Menu();
      this.setMenuById(preferencesMenu, "Preferences");
      preferences = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "miPreferences", comment: ["&& denotes a mnemonic"] }, "&&Preferences")), submenu: preferencesMenu });
    }
    const servicesMenu = new Menu();
    const services = new MenuItem({ label: nls.localize("mServices", "Services"), role: "services", submenu: servicesMenu });
    const hide = new MenuItem({ label: nls.localize("mHide", "Hide {0}", this.productService.nameLong), role: "hide", accelerator: "Command+H" });
    const hideOthers = new MenuItem({ label: nls.localize("mHideOthers", "Hide Others"), role: "hideOthers", accelerator: "Command+Alt+H" });
    const showAll = new MenuItem({ label: nls.localize("mShowAll", "Show All"), role: "unhide" });
    const quit = new MenuItem(this.likeAction("workbench.action.quit", {
      label: nls.localize("miQuit", "Quit {0}", this.productService.nameLong),
      click: async (item, window, event) => {
        const lastActiveWindow = this.windowsMainService.getLastActiveWindow();
        if (this.windowsMainService.getWindowCount() === 0 || // allow to quit when no more windows are open
        !!BrowserWindow.getFocusedWindow() || // allow to quit when window has focus (fix for https://github.com/microsoft/vscode/issues/39191)
        lastActiveWindow?.win?.isMinimized()) {
          const confirmed = await this.confirmBeforeQuit(event);
          if (confirmed) {
            this.nativeHostMainService.quit(void 0);
          }
        }
      }
    }));
    const actions = [about];
    actions.push(...checkForUpdates);
    if (preferences) {
      actions.push(...[
        __separator__(),
        preferences
      ]);
    }
    actions.push(...[
      __separator__(),
      services,
      __separator__(),
      hide,
      hideOthers,
      showAll,
      __separator__(),
      quit
    ]);
    actions.forEach((i) => macApplicationMenu.append(i));
  }
  async confirmBeforeQuit(event) {
    if (this.windowsMainService.getWindowCount() === 0) {
      return true;
    }
    const confirmBeforeClose = this.configurationService.getValue("window.confirmBeforeClose");
    if (confirmBeforeClose === "always" || confirmBeforeClose === "keyboardOnly" && this.isKeyboardEvent(event)) {
      const { response } = await this.nativeHostMainService.showMessageBox(this.windowsMainService.getFocusedWindow()?.id, {
        type: "question",
        buttons: [
          isMacintosh ? nls.localize({ key: "quit", comment: ["&& denotes a mnemonic"] }, "&&Quit") : nls.localize({ key: "exit", comment: ["&& denotes a mnemonic"] }, "&&Exit"),
          nls.localize("cancel", "Cancel")
        ],
        message: isMacintosh ? nls.localize("quitMessageMac", "Are you sure you want to quit?") : nls.localize("quitMessage", "Are you sure you want to exit?")
      });
      return response === 0;
    }
    return true;
  }
  shouldDrawMenu(menuId) {
    if (!isMacintosh && !this.showNativeMenu) {
      return false;
    }
    switch (menuId) {
      case "File":
      case "Help":
        if (isMacintosh) {
          return this.windowsMainService.getWindowCount() === 0 && this.closedLastWindow || this.windowsMainService.getWindowCount() > 0 && this.noActiveMainWindow || !!this.menubarMenus && !!this.menubarMenus[menuId];
        }
      case "Window":
        if (isMacintosh) {
          return this.windowsMainService.getWindowCount() === 0 && this.closedLastWindow || this.windowsMainService.getWindowCount() > 0 && this.noActiveMainWindow || !!this.menubarMenus;
        }
      default:
        return this.windowsMainService.getWindowCount() > 0 && (!!this.menubarMenus && !!this.menubarMenus[menuId]);
    }
  }
  setMenu(menu, items) {
    items.forEach((item) => {
      if (isMenubarMenuItemSeparator(item)) {
        menu.append(__separator__());
      } else if (isMenubarMenuItemSubmenu(item)) {
        const submenu = new Menu();
        const submenuItem = new MenuItem({ label: this.mnemonicLabel(item.label), submenu });
        this.setMenu(submenu, item.submenu.items);
        menu.append(submenuItem);
      } else if (isMenubarMenuItemRecentAction(item)) {
        menu.append(this.createOpenRecentMenuItem(item));
      } else if (isMenubarMenuItemAction(item)) {
        if (item.id === "workbench.action.showAboutDialog") {
          this.insertCheckForUpdatesItems(menu);
        }
        if (isMacintosh) {
          if (this.windowsMainService.getWindowCount() === 0 && this.closedLastWindow || this.windowsMainService.getWindowCount() > 0 && this.noActiveMainWindow) {
            if (this.fallbackMenuHandlers[item.id]) {
              menu.append(new MenuItem(this.likeAction(item.id, { label: this.mnemonicLabel(item.label), click: this.fallbackMenuHandlers[item.id] })));
            } else {
              menu.append(this.createMenuItem(item.label, item.id, false, item.checked));
            }
          } else {
            menu.append(this.createMenuItem(item.label, item.id, item.enabled !== false, !!item.checked));
          }
        } else {
          menu.append(this.createMenuItem(item.label, item.id, item.enabled !== false, !!item.checked));
        }
      }
    });
  }
  setMenuById(menu, menuId) {
    if (this.menubarMenus?.[menuId]) {
      this.setMenu(menu, this.menubarMenus[menuId].items);
    }
  }
  insertCheckForUpdatesItems(menu) {
    const updateItems = this.getUpdateMenuItems();
    if (updateItems.length) {
      updateItems.forEach((i) => menu.append(i));
      menu.append(__separator__());
    }
  }
  createOpenRecentMenuItem(item) {
    const revivedUri = URI.revive(item.uri);
    const commandId = item.id;
    const openable = commandId === "openRecentFile" ? { fileUri: revivedUri } : commandId === "openRecentWorkspace" ? { workspaceUri: revivedUri } : { folderUri: revivedUri };
    return new MenuItem(this.likeAction(commandId, {
      label: item.label,
      click: async (menuItem, win, event) => {
        const openInNewWindow = this.isOptionClick(event);
        const success = (await this.windowsMainService.open({
          context: OpenContext.MENU,
          cli: this.environmentMainService.args,
          urisToOpen: [openable],
          forceNewWindow: openInNewWindow,
          gotoLineMode: false,
          remoteAuthority: item.remoteAuthority
        })).length > 0;
        if (!success) {
          await this.workspacesHistoryMainService.removeRecentlyOpened([revivedUri]);
        }
      }
    }, false));
  }
  isOptionClick(event) {
    return !!(event && (!isMacintosh && (event.ctrlKey || event.shiftKey) || isMacintosh && (event.metaKey || event.altKey)));
  }
  isKeyboardEvent(event) {
    return !!(event.triggeredByAccelerator || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);
  }
  createRoleMenuItem(label, commandId, role) {
    const options = {
      label: this.mnemonicLabel(label),
      role,
      enabled: true
    };
    return new MenuItem(this.withKeybinding(commandId, options));
  }
  setMacWindowMenu(macWindowMenu) {
    const minimize = new MenuItem({ label: nls.localize("mMinimize", "Minimize"), role: "minimize", accelerator: "Command+M", enabled: this.windowsMainService.getWindowCount() > 0 });
    const zoom = new MenuItem({ label: nls.localize("mZoom", "Zoom"), role: "zoom", enabled: this.windowsMainService.getWindowCount() > 0 });
    const bringAllToFront = new MenuItem({ label: nls.localize("mBringToFront", "Bring All to Front"), role: "front", enabled: this.windowsMainService.getWindowCount() > 0 });
    const switchWindow = this.createMenuItem(nls.localize({ key: "miSwitchWindow", comment: ["&& denotes a mnemonic"] }, "Switch &&Window..."), "workbench.action.switchWindow");
    const nativeTabMenuItems = [];
    if (this.currentEnableNativeTabs) {
      nativeTabMenuItems.push(__separator__());
      nativeTabMenuItems.push(this.createMenuItem(nls.localize("mNewTab", "New Tab"), "workbench.action.newWindowTab"));
      nativeTabMenuItems.push(this.createRoleMenuItem(nls.localize("mShowPreviousTab", "Show Previous Tab"), "workbench.action.showPreviousWindowTab", "selectPreviousTab"));
      nativeTabMenuItems.push(this.createRoleMenuItem(nls.localize("mShowNextTab", "Show Next Tab"), "workbench.action.showNextWindowTab", "selectNextTab"));
      nativeTabMenuItems.push(this.createRoleMenuItem(nls.localize("mMoveTabToNewWindow", "Move Tab to New Window"), "workbench.action.moveWindowTabToNewWindow", "moveTabToNewWindow"));
      nativeTabMenuItems.push(this.createRoleMenuItem(nls.localize("mMergeAllWindows", "Merge All Windows"), "workbench.action.mergeAllWindowTabs", "mergeAllWindows"));
    }
    [
      minimize,
      zoom,
      __separator__(),
      switchWindow,
      ...nativeTabMenuItems,
      __separator__(),
      bringAllToFront
    ].forEach((item) => macWindowMenu.append(item));
  }
  getUpdateMenuItems() {
    const state = this.updateService.state;
    switch (state.type) {
      case StateType.Idle:
        return [new MenuItem({
          label: this.mnemonicLabel(nls.localize("miCheckForUpdates", "Check for &&Updates...")),
          click: () => setTimeout(() => {
            this.reportMenuActionTelemetry("CheckForUpdate");
            this.updateService.checkForUpdates(true);
          }, 0)
        })];
      case StateType.CheckingForUpdates:
        return [new MenuItem({ label: nls.localize("miCheckingForUpdates", "Checking for Updates..."), enabled: false })];
      case StateType.AvailableForDownload:
        return [new MenuItem({
          label: this.mnemonicLabel(nls.localize("miDownloadUpdate", "D&&ownload Available Update")),
          click: () => {
            this.updateService.downloadUpdate(true);
          }
        })];
      case StateType.Downloading:
      case StateType.Overwriting:
        return [new MenuItem({ label: nls.localize("miDownloadingUpdate", "Downloading Update..."), enabled: false })];
      case StateType.Downloaded:
        return isMacintosh ? [] : [new MenuItem({
          label: this.mnemonicLabel(nls.localize("miInstallUpdate", "Install &&Update...")),
          click: () => {
            this.reportMenuActionTelemetry("InstallUpdate");
            this.updateService.applyUpdate();
          }
        })];
      case StateType.Updating:
        return [new MenuItem({ label: nls.localize("miInstallingUpdate", "Installing Update..."), enabled: false })];
      case StateType.Cancelling:
        return [new MenuItem({ label: nls.localize("miCancellingUpdate", "Cancelling Update..."), enabled: false })];
      case StateType.Ready:
        return [new MenuItem({
          label: this.mnemonicLabel(nls.localize("miRestartToUpdate", "Restart to &&Update")),
          click: () => {
            this.reportMenuActionTelemetry("RestartToUpdate");
            this.updateService.quitAndInstall();
          }
        })];
      default:
        return [];
    }
  }
  createMenuItem(labelOpt, commandId, enabledOpt, checkedOpt) {
    const label = this.mnemonicLabel(labelOpt);
    const click = (menuItem, window, event) => {
      const userSettingsLabel = menuItem ? menuItem.userSettingsLabel : null;
      if (userSettingsLabel && event.triggeredByAccelerator) {
        this.runActionInRenderer({ type: "keybinding", userSettingsLabel });
      } else {
        this.runActionInRenderer({ type: "commandId", commandId });
      }
    };
    const enabled = typeof enabledOpt === "boolean" ? enabledOpt : this.windowsMainService.getWindowCount() > 0;
    const checked = typeof checkedOpt === "boolean" ? checkedOpt : false;
    const options = {
      label,
      click,
      enabled
    };
    if (checked) {
      options.type = "checkbox";
      options.checked = checked;
    }
    if (isMacintosh) {
      if (commandId === "editor.action.clipboardCutAction") {
        options.role = "cut";
      } else if (commandId === "editor.action.clipboardCopyAction") {
        options.role = "copy";
      } else if (commandId === "editor.action.clipboardPasteAction") {
        options.role = "paste";
      }
      if (commandId === "undo") {
        options.click = this.makeContextAwareClickHandler(click, {
          inDevTools: (devTools) => devTools.undo(),
          inNoWindow: () => Menu.sendActionToFirstResponder("undo:")
        });
      } else if (commandId === "redo") {
        options.click = this.makeContextAwareClickHandler(click, {
          inDevTools: (devTools) => devTools.redo(),
          inNoWindow: () => Menu.sendActionToFirstResponder("redo:")
        });
      } else if (commandId === "editor.action.selectAll") {
        options.click = this.makeContextAwareClickHandler(click, {
          inDevTools: (devTools) => devTools.selectAll(),
          inNoWindow: () => Menu.sendActionToFirstResponder("selectAll:")
        });
      }
    }
    return new MenuItem(this.withKeybinding(commandId, options));
  }
  makeContextAwareClickHandler(click, contextSpecificHandlers) {
    return (menuItem, win, event) => {
      const activeWindow = BrowserWindow.getFocusedWindow();
      if (!activeWindow) {
        return contextSpecificHandlers.inNoWindow();
      }
      if (activeWindow.webContents.isDevToolsFocused() && activeWindow.webContents.devToolsWebContents) {
        return contextSpecificHandlers.inDevTools(activeWindow.webContents.devToolsWebContents);
      }
      if (!activeWindow.webContents.isFocused()) {
        return contextSpecificHandlers.inNoWindow();
      }
      click(menuItem, win || activeWindow, event);
    };
  }
  runActionInRenderer(invocation) {
    let activeBrowserWindow = BrowserWindow.getFocusedWindow();
    if (activeBrowserWindow) {
      const auxiliaryWindowCandidate = this.auxiliaryWindowsMainService.getWindowByWebContents(activeBrowserWindow.webContents);
      if (auxiliaryWindowCandidate) {
        activeBrowserWindow = this.windowsMainService.getWindowById(auxiliaryWindowCandidate.parentId)?.win ?? null;
      }
    }
    if (!activeBrowserWindow) {
      const lastActiveWindow = this.windowsMainService.getLastActiveWindow();
      if (lastActiveWindow?.win?.isMinimized()) {
        activeBrowserWindow = lastActiveWindow.win;
      }
    }
    const activeWindow = activeBrowserWindow ? this.windowsMainService.getWindowById(activeBrowserWindow.id) : void 0;
    if (activeWindow) {
      this.logService.trace("menubar#runActionInRenderer", invocation);
      if (isMacintosh && !this.environmentMainService.isBuilt && !activeWindow.isReady) {
        if (invocation.type === "commandId" && invocation.commandId === "workbench.action.toggleDevTools" || invocation.type !== "commandId" && invocation.userSettingsLabel === "alt+cmd+i") {
          return false;
        }
      }
      if (invocation.type === "commandId") {
        const runActionPayload = { id: invocation.commandId, from: "menu" };
        activeWindow.sendWhenReady("vscode:runAction", CancellationToken.None, runActionPayload);
      } else {
        const runKeybindingPayload = { userSettingsLabel: invocation.userSettingsLabel };
        activeWindow.sendWhenReady("vscode:runKeybinding", CancellationToken.None, runKeybindingPayload);
      }
      return true;
    } else {
      this.logService.trace("menubar#runActionInRenderer: no active window found", invocation);
      return false;
    }
  }
  withKeybinding(commandId, options) {
    const binding = typeof commandId === "string" ? this.keybindings[commandId] : void 0;
    if (binding?.label) {
      if (binding.isNative !== false) {
        options.accelerator = binding.label;
        options.userSettingsLabel = binding.userSettingsLabel;
      } else if (typeof options.label === "string") {
        const bindingIndex = options.label.indexOf("[");
        if (bindingIndex >= 0) {
          options.label = `${options.label.substr(0, bindingIndex)} [${binding.label}]`;
        } else {
          options.label = `${options.label} [${binding.label}]`;
        }
      }
    } else {
      options.accelerator = void 0;
    }
    return options;
  }
  likeAction(commandId, options, setAccelerator = !options.accelerator) {
    if (setAccelerator) {
      options = this.withKeybinding(commandId, options);
    }
    const originalClick = options.click;
    options.click = (item, window, event) => {
      this.reportMenuActionTelemetry(commandId);
      originalClick?.(item, window, event);
    };
    return options;
  }
  openUrl(url, id) {
    this.nativeHostMainService.openExternal(void 0, url);
    this.reportMenuActionTelemetry(id);
  }
  reportMenuActionTelemetry(id) {
    this.telemetryService.publicLog2("workbenchActionExecuted", { id, from: telemetryFrom });
  }
  mnemonicLabel(label) {
    return mnemonicMenuLabel(label, !this.currentEnableMenuBarMnemonics);
  }
};
Menubar.lastKnownMenubarStorageKey = "lastKnownMenubarData";
Menubar = __decorateClass([
  __decorateParam(0, IUpdateService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IWindowsMainService),
  __decorateParam(3, IEnvironmentMainService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IWorkspacesHistoryMainService),
  __decorateParam(6, IStateService),
  __decorateParam(7, ILifecycleMainService),
  __decorateParam(8, ILogService),
  __decorateParam(9, INativeHostMainService),
  __decorateParam(10, IProductService),
  __decorateParam(11, IAuxiliaryWindowsMainService)
], Menubar);
function __separator__() {
  return new MenuItem({ type: "separator" });
}
export {
  Menubar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL21lbnViYXIvZWxlY3Ryb24tbWFpbi9tZW51YmFyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXBwLCBCcm93c2VyV2luZG93LCBCYXNlV2luZG93LCBLZXlib2FyZEV2ZW50LCBNZW51LCBNZW51SXRlbSwgTWVudUl0ZW1Db25zdHJ1Y3Rvck9wdGlvbnMsIFdlYkNvbnRlbnRzIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHsgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IG1uZW1vbmljTWVudUxhYmVsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBsYW5ndWFnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9hdXhpbGlhcnlXaW5kb3cvZWxlY3Ryb24tbWFpbi9hdXhpbGlhcnlXaW5kb3dzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9lbGVjdHJvbi1tYWluL2Vudmlyb25tZW50TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2VsZWN0cm9uLW1haW4vbGlmZWN5Y2xlTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTWVudWJhckRhdGEsIElNZW51YmFyS2V5YmluZGluZywgSU1lbnViYXJNZW51LCBJTWVudWJhck1lbnVSZWNlbnRJdGVtQWN0aW9uLCBpc01lbnViYXJNZW51SXRlbUFjdGlvbiwgaXNNZW51YmFyTWVudUl0ZW1SZWNlbnRBY3Rpb24sIGlzTWVudWJhck1lbnVJdGVtU2VwYXJhdG9yLCBpc01lbnViYXJNZW51SXRlbVN1Ym1lbnUsIE1lbnViYXJNZW51SXRlbSB9IGZyb20gJy4uL2NvbW1vbi9tZW51YmFyLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9uYXRpdmUvZWxlY3Ryb24tbWFpbi9uYXRpdmVIb3N0TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0YXRlU2VydmljZSB9IGZyb20gJy4uLy4uL3N0YXRlL25vZGUvc3RhdGUuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVXBkYXRlU2VydmljZSwgU3RhdGVUeXBlIH0gZnJvbSAnLi4vLi4vdXBkYXRlL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZVJ1bkFjdGlvbkluV2luZG93UmVxdWVzdCwgSU5hdGl2ZVJ1bktleWJpbmRpbmdJbldpbmRvd1JlcXVlc3QsIElXaW5kb3dPcGVuYWJsZSwgaGFzTmF0aXZlTWVudSB9IGZyb20gJy4uLy4uL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElXaW5kb3dzQ291bnRDaGFuZ2VkRXZlbnQsIElXaW5kb3dzTWFpblNlcnZpY2UsIE9wZW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vd2luZG93cy9lbGVjdHJvbi1tYWluL3dpbmRvd3MuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2VzL2VsZWN0cm9uLW1haW4vd29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuY29uc3QgdGVsZW1ldHJ5RnJvbSA9ICdtZW51JztcblxuaW50ZXJmYWNlIElNZW51SXRlbUNsaWNrSGFuZGxlciB7XG5cdGluRGV2VG9vbHM6IChjb250ZW50czogV2ViQ29udGVudHMpID0+IHZvaWQ7XG5cdGluTm9XaW5kb3c6ICgpID0+IHZvaWQ7XG59XG5cbnR5cGUgSU1lbnVJdGVtSW52b2NhdGlvbiA9IChcblx0eyB0eXBlOiAnY29tbWFuZElkJzsgY29tbWFuZElkOiBzdHJpbmcgfVxuXHR8IHsgdHlwZTogJ2tleWJpbmRpbmcnOyB1c2VyU2V0dGluZ3NMYWJlbDogc3RyaW5nIH1cbik7XG5cbmludGVyZmFjZSBJTWVudUl0ZW1XaXRoS2V5YmluZGluZyB7XG5cdHVzZXJTZXR0aW5nc0xhYmVsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgTWVudWJhciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGxhc3RLbm93bk1lbnViYXJTdG9yYWdlS2V5ID0gJ2xhc3RLbm93bk1lbnViYXJEYXRhJztcblxuXHRwcml2YXRlIHdpbGxTaHV0ZG93bjogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhcHBNZW51SW5zdGFsbGVkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNsb3NlZExhc3RXaW5kb3c6IGJvb2xlYW47XG5cdHByaXZhdGUgbm9BY3RpdmVNYWluV2luZG93OiBib29sZWFuO1xuXHRwcml2YXRlIHNob3dOYXRpdmVNZW51OiBib29sZWFuO1xuXG5cdHByaXZhdGUgbWVudVVwZGF0ZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgbWVudUdDOiBSdW5PbmNlU2NoZWR1bGVyO1xuXG5cdC8vIEFycmF5IHRvIGtlZXAgbWVudXMgYXJvdW5kIHNvIHRoYXQgR0MgZG9lc24ndCBjYXVzZSBjcmFzaCBhcyBleHBsYWluZWQgaW4gIzU1MzQ3XG5cdC8vIFRPRE9Ac2JhdHRlbiBSZW1vdmUgdGhpcyB3aGVuIGZpeGVkIHVwc3RyZWFtIGJ5IEVsZWN0cm9uXG5cdHByaXZhdGUgb2xkTWVudXM6IE1lbnVbXTtcblxuXHRwcml2YXRlIG1lbnViYXJNZW51czogeyBbaWQ6IHN0cmluZ106IElNZW51YmFyTWVudSB9O1xuXG5cdHByaXZhdGUga2V5YmluZGluZ3M6IHsgW2NvbW1hbmRJZDogc3RyaW5nXTogSU1lbnViYXJLZXliaW5kaW5nIH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBmYWxsYmFja01lbnVIYW5kbGVyczogeyBbaWQ6IHN0cmluZ106IChtZW51SXRlbTogTWVudUl0ZW0sIGJyb3dzZXJXaW5kb3c6IEJhc2VXaW5kb3cgfCB1bmRlZmluZWQsIGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB2b2lkIH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXBkYXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZVNlcnZpY2U6IElVcGRhdGVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV2luZG93c01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd2luZG93c01haW5TZXJ2aWNlOiBJV2luZG93c01haW5TZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50TWFpblNlcnZpY2U6IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2U6IElXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLFxuXHRcdEBJU3RhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RhdGVTZXJ2aWNlOiBJU3RhdGVTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVNYWluU2VydmljZTogSUxpZmVjeWNsZU1haW5TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdE1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmF0aXZlSG9zdE1haW5TZXJ2aWNlOiBJTmF0aXZlSG9zdE1haW5TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlOiBJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLm1lbnVVcGRhdGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5kb1VwZGF0ZU1lbnUoKSwgMCkpO1xuXG5cdFx0dGhpcy5tZW51R0MgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7IHRoaXMub2xkTWVudXMgPSBbXTsgfSwgMTAwMDApKTtcblxuXHRcdHRoaXMubWVudWJhck1lbnVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLmtleWJpbmRpbmdzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLnNob3dOYXRpdmVNZW51ID0gaGFzTmF0aXZlTWVudShjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRpZiAoaXNNYWNpbnRvc2ggfHwgdGhpcy5zaG93TmF0aXZlTWVudSkge1xuXHRcdFx0dGhpcy5yZXN0b3JlQ2FjaGVkTWVudWJhckRhdGEoKTtcblx0XHR9XG5cblx0XHR0aGlzLmFkZEZhbGxiYWNrSGFuZGxlcnMoKTtcblxuXHRcdHRoaXMuY2xvc2VkTGFzdFdpbmRvdyA9IGZhbHNlO1xuXHRcdHRoaXMubm9BY3RpdmVNYWluV2luZG93ID0gZmFsc2U7XG5cblx0XHR0aGlzLm9sZE1lbnVzID0gW107XG5cblx0XHR0aGlzLmluc3RhbGwoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzdG9yZUNhY2hlZE1lbnViYXJEYXRhKCkge1xuXHRcdGNvbnN0IG1lbnViYXJEYXRhID0gdGhpcy5zdGF0ZVNlcnZpY2UuZ2V0SXRlbTxJTWVudWJhckRhdGE+KE1lbnViYXIubGFzdEtub3duTWVudWJhclN0b3JhZ2VLZXkpO1xuXHRcdGlmIChtZW51YmFyRGF0YSkge1xuXHRcdFx0aWYgKG1lbnViYXJEYXRhLm1lbnVzKSB7XG5cdFx0XHRcdHRoaXMubWVudWJhck1lbnVzID0gbWVudWJhckRhdGEubWVudXM7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtZW51YmFyRGF0YS5rZXliaW5kaW5ncykge1xuXHRcdFx0XHR0aGlzLmtleWJpbmRpbmdzID0gbWVudWJhckRhdGEua2V5YmluZGluZ3M7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhZGRGYWxsYmFja0hhbmRsZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gRmlsZSBNZW51IEl0ZW1zXG5cdFx0dGhpcy5mYWxsYmFja01lbnVIYW5kbGVyc1snd29ya2JlbmNoLmFjdGlvbi5maWxlcy5uZXdVbnRpdGxlZEZpbGUnXSA9IChtZW51SXRlbSwgd2luLCBldmVudCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnJ1bkFjdGlvbkluUmVuZGVyZXIoeyB0eXBlOiAnY29tbWFuZElkJywgY29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5uZXdVbnRpdGxlZEZpbGUnIH0pKSB7IC8vIHRoaXMgaXMgb25lIG9mIHRoZSBmZXcgc3VwcG9ydGVkIGFjdGlvbnMgd2hlbiBhdXggd2luZG93IGhhcyBmb2N1c1xuXHRcdFx0XHR0aGlzLndpbmRvd3NNYWluU2VydmljZS5vcGVuRW1wdHlXaW5kb3coeyBjb250ZXh0OiBPcGVuQ29udGV4dC5NRU5VLCBjb250ZXh0V2luZG93SWQ6IHdpbj8uaWQgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLmZhbGxiYWNrTWVudUhhbmRsZXJzWyd3b3JrYmVuY2guYWN0aW9uLm5ld1dpbmRvdyddID0gKG1lbnVJdGVtLCB3aW4sIGV2ZW50KSA9PiB0aGlzLndpbmRvd3NNYWluU2VydmljZS5vcGVuRW1wdHlXaW5kb3coeyBjb250ZXh0OiBPcGVuQ29udGV4dC5NRU5VLCBjb250ZXh0V2luZG93SWQ6IHdpbj8uaWQgfSk7XG5cdFx0dGhpcy5mYWxsYmFja01lbnVIYW5kbGVyc1snd29ya2JlbmNoLmFjdGlvbi5maWxlcy5vcGVuRmlsZUZvbGRlciddID0gKG1lbnVJdGVtLCB3aW4sIGV2ZW50KSA9PiB0aGlzLm5hdGl2ZUhvc3RNYWluU2VydmljZS5waWNrRmlsZUZvbGRlckFuZE9wZW4odW5kZWZpbmVkLCB7IGZvcmNlTmV3V2luZG93OiB0aGlzLmlzT3B0aW9uQ2xpY2soZXZlbnQpLCB0ZWxlbWV0cnlFeHRyYURhdGE6IHsgZnJvbTogdGVsZW1ldHJ5RnJvbSB9IH0pO1xuXHRcdHRoaXMuZmFsbGJhY2tNZW51SGFuZGxlcnNbJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMub3BlbkZvbGRlciddID0gKG1lbnVJdGVtLCB3aW4sIGV2ZW50KSA9PiB0aGlzLm5hdGl2ZUhvc3RNYWluU2VydmljZS5waWNrRm9sZGVyQW5kT3Blbih1bmRlZmluZWQsIHsgZm9yY2VOZXdXaW5kb3c6IHRoaXMuaXNPcHRpb25DbGljayhldmVudCksIHRlbGVtZXRyeUV4dHJhRGF0YTogeyBmcm9tOiB0ZWxlbWV0cnlGcm9tIH0gfSk7XG5cdFx0dGhpcy5mYWxsYmFja01lbnVIYW5kbGVyc1snd29ya2JlbmNoLmFjdGlvbi5vcGVuV29ya3NwYWNlJ10gPSAobWVudUl0ZW0sIHdpbiwgZXZlbnQpID0+IHRoaXMubmF0aXZlSG9zdE1haW5TZXJ2aWNlLnBpY2tXb3Jrc3BhY2VBbmRPcGVuKHVuZGVmaW5lZCwgeyBmb3JjZU5ld1dpbmRvdzogdGhpcy5pc09wdGlvbkNsaWNrKGV2ZW50KSwgdGVsZW1ldHJ5RXh0cmFEYXRhOiB7IGZyb206IHRlbGVtZXRyeUZyb20gfSB9KTtcblxuXHRcdC8vIFJlY2VudCBNZW51IEl0ZW1zXG5cdFx0dGhpcy5mYWxsYmFja01lbnVIYW5kbGVyc1snd29ya2JlbmNoLmFjdGlvbi5jbGVhclJlY2VudEZpbGVzJ10gPSAoKSA9PiB0aGlzLndvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UuY2xlYXJSZWNlbnRseU9wZW5lZCh7IGNvbmZpcm06IHRydWUgLyogYXNrIGZvciBjb25maXJtYXRpb24gKi8gfSk7XG5cblx0XHQvLyBIZWxwIE1lbnUgSXRlbXNcblx0XHRjb25zdCB5b3VUdWJlVXJsID0gdGhpcy5wcm9kdWN0U2VydmljZS55b3VUdWJlVXJsO1xuXHRcdGlmICh5b3VUdWJlVXJsKSB7XG5cdFx0XHR0aGlzLmZhbGxiYWNrTWVudUhhbmRsZXJzWyd3b3JrYmVuY2guYWN0aW9uLm9wZW5Zb3VUdWJlVXJsJ10gPSAoKSA9PiB0aGlzLm9wZW5VcmwoeW91VHViZVVybCwgJ29wZW5Zb3VUdWJlVXJsJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVxdWVzdEZlYXR1cmVVcmwgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLnJlcXVlc3RGZWF0dXJlVXJsO1xuXHRcdGlmIChyZXF1ZXN0RmVhdHVyZVVybCkge1xuXHRcdFx0dGhpcy5mYWxsYmFja01lbnVIYW5kbGVyc1snd29ya2JlbmNoLmFjdGlvbi5vcGVuUmVxdWVzdEZlYXR1cmVVcmwnXSA9ICgpID0+IHRoaXMub3BlblVybChyZXF1ZXN0RmVhdHVyZVVybCwgJ29wZW5Vc2VyVm9pY2VVcmwnKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXBvcnRJc3N1ZVVybCA9IHRoaXMucHJvZHVjdFNlcnZpY2UucmVwb3J0SXNzdWVVcmw7XG5cdFx0aWYgKHJlcG9ydElzc3VlVXJsKSB7XG5cdFx0XHR0aGlzLmZhbGxiYWNrTWVudUhhbmRsZXJzWyd3b3JrYmVuY2guYWN0aW9uLm9wZW5Jc3N1ZVJlcG9ydGVyJ10gPSAoKSA9PiB0aGlzLm9wZW5VcmwocmVwb3J0SXNzdWVVcmwsICdvcGVuUmVwb3J0SXNzdWVzJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGljZW5zZVVybCA9IHRoaXMucHJvZHVjdFNlcnZpY2UubGljZW5zZVVybDtcblx0XHRpZiAobGljZW5zZVVybCkge1xuXHRcdFx0dGhpcy5mYWxsYmFja01lbnVIYW5kbGVyc1snd29ya2JlbmNoLmFjdGlvbi5vcGVuTGljZW5zZVVybCddID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAobGFuZ3VhZ2UpIHtcblx0XHRcdFx0XHRjb25zdCBxdWVyeUFyZ0NoYXIgPSBsaWNlbnNlVXJsLmluZGV4T2YoJz8nKSA+IDAgPyAnJicgOiAnPyc7XG5cdFx0XHRcdFx0dGhpcy5vcGVuVXJsKGAke2xpY2Vuc2VVcmx9JHtxdWVyeUFyZ0NoYXJ9bGFuZz0ke2xhbmd1YWdlfWAsICdvcGVuTGljZW5zZVVybCcpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMub3BlblVybChsaWNlbnNlVXJsLCAnb3BlbkxpY2Vuc2VVcmwnKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBwcml2YWN5U3RhdGVtZW50VXJsID0gdGhpcy5wcm9kdWN0U2VydmljZS5wcml2YWN5U3RhdGVtZW50VXJsO1xuXHRcdGlmIChwcml2YWN5U3RhdGVtZW50VXJsICYmIGxpY2Vuc2VVcmwpIHtcblx0XHRcdHRoaXMuZmFsbGJhY2tNZW51SGFuZGxlcnNbJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblByaXZhY3lTdGF0ZW1lbnRVcmwnXSA9ICgpID0+IHtcblx0XHRcdFx0dGhpcy5vcGVuVXJsKHByaXZhY3lTdGF0ZW1lbnRVcmwsICdvcGVuUHJpdmFjeVN0YXRlbWVudCcpO1xuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gS2VlcCBmbGFnIHdoZW4gYXBwIHF1aXRzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saWZlY3ljbGVNYWluU2VydmljZS5vbldpbGxTaHV0ZG93bigoKSA9PiB0aGlzLndpbGxTaHV0ZG93biA9IHRydWUpKTtcblxuXHRcdC8vIExpc3RlbiB0byBzb21lIGV2ZW50cyBmcm9tIHdpbmRvdyBzZXJ2aWNlIHRvIHVwZGF0ZSBtZW51XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub25EaWRDaGFuZ2VXaW5kb3dzQ291bnQoZSA9PiB0aGlzLm9uRGlkQ2hhbmdlV2luZG93c0NvdW50KGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5uYXRpdmVIb3N0TWFpblNlcnZpY2Uub25EaWRCbHVyTWFpbldpbmRvdygoKSA9PiB0aGlzLm9uRGlkQ2hhbmdlV2luZG93Rm9jdXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubmF0aXZlSG9zdE1haW5TZXJ2aWNlLm9uRGlkRm9jdXNNYWluV2luZG93KCgpID0+IHRoaXMub25EaWRDaGFuZ2VXaW5kb3dGb2N1cygpKSk7XG5cblx0XHQvLyBSZWJ1aWxkIG1lbnUgd2hlbiB1cGRhdGUgc3RhdGUgY2hhbmdlcyBzbyB1cGRhdGUgbWVudSBpdGVtcyByZWZsZWN0XG5cdFx0Ly8gdGhlIGN1cnJlbnQgc3RhdGUgKGUuZy4gXCJSZXN0YXJ0IHRvIFVwZGF0ZVwiIGluc3RlYWQgb2YgXCJDaGVjayBmb3IgVXBkYXRlcy4uLlwiKS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnVwZGF0ZVNlcnZpY2Uub25TdGF0ZUNoYW5nZSgoKSA9PiB0aGlzLnNjaGVkdWxlVXBkYXRlTWVudSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBjdXJyZW50RW5hYmxlTWVudUJhck1uZW1vbmljcygpOiBib29sZWFuIHtcblx0XHRjb25zdCBlbmFibGVNZW51QmFyTW5lbW9uaWNzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnd2luZG93LmVuYWJsZU1lbnVCYXJNbmVtb25pY3MnKTtcblx0XHRpZiAodHlwZW9mIGVuYWJsZU1lbnVCYXJNbmVtb25pY3MgIT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVuYWJsZU1lbnVCYXJNbmVtb25pY3M7XG5cdH1cblxuXHRwcml2YXRlIGdldCBjdXJyZW50RW5hYmxlTmF0aXZlVGFicygpOiBib29sZWFuIHtcblx0XHRpZiAoIWlzTWFjaW50b3NoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW5hYmxlTmF0aXZlVGFicyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3dpbmRvdy5uYXRpdmVUYWJzJyk7XG5cdFx0aWYgKHR5cGVvZiBlbmFibGVOYXRpdmVUYWJzICE9PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGVuYWJsZU5hdGl2ZVRhYnM7XG5cdH1cblxuXHR1cGRhdGVNZW51KG1lbnViYXJEYXRhOiBJTWVudWJhckRhdGEsIHdpbmRvd0lkOiBudW1iZXIpIHtcblx0XHR0aGlzLm1lbnViYXJNZW51cyA9IG1lbnViYXJEYXRhLm1lbnVzO1xuXHRcdHRoaXMua2V5YmluZGluZ3MgPSBtZW51YmFyRGF0YS5rZXliaW5kaW5ncztcblxuXHRcdC8vIFNhdmUgb2ZmIG5ldyBtZW51IGFuZCBrZXliaW5kaW5nc1xuXHRcdHRoaXMuc3RhdGVTZXJ2aWNlLnNldEl0ZW0oTWVudWJhci5sYXN0S25vd25NZW51YmFyU3RvcmFnZUtleSwgbWVudWJhckRhdGEpO1xuXG5cdFx0dGhpcy5zY2hlZHVsZVVwZGF0ZU1lbnUoKTtcblx0fVxuXG5cblx0cHJpdmF0ZSBzY2hlZHVsZVVwZGF0ZU1lbnUoKTogdm9pZCB7XG5cdFx0dGhpcy5tZW51VXBkYXRlci5zY2hlZHVsZSgpOyAvLyBidWZmZXIgbXVsdGlwbGUgYXR0ZW1wdHMgdG8gdXBkYXRlIHRoZSBtZW51XG5cdH1cblxuXHRwcml2YXRlIGRvVXBkYXRlTWVudSgpOiB2b2lkIHtcblxuXHRcdC8vIER1ZSB0byBsaW1pdGF0aW9ucyBpbiBFbGVjdHJvbiwgaXQgaXMgbm90IHBvc3NpYmxlIHRvIHVwZGF0ZSBtZW51IGl0ZW1zIGR5bmFtaWNhbGx5LiBUaGUgc3VnZ2VzdGVkXG5cdFx0Ly8gd29ya2Fyb3VuZCBmcm9tIEVsZWN0cm9uIGlzIHRvIHNldCB0aGUgYXBwbGljYXRpb24gbWVudSBhZ2Fpbi5cblx0XHQvLyBTZWUgYWxzbyBodHRwczovL2dpdGh1Yi5jb20vZWxlY3Ryb24vZWxlY3Ryb24vaXNzdWVzLzg0NlxuXHRcdC8vXG5cdFx0Ly8gUnVuIGRlbGF5ZWQgdG8gcHJldmVudCB1cGRhdGluZyBtZW51IHdoaWxlIGl0IGlzIG9wZW5cblx0XHRpZiAoIXRoaXMud2lsbFNodXRkb3duKSB7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLndpbGxTaHV0ZG93bikge1xuXHRcdFx0XHRcdHRoaXMuaW5zdGFsbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAxMCAvKiBkZWxheSB0aGlzIGJlY2F1c2UgdGhlcmUgaXMgYW4gaXNzdWUgd2l0aCB1cGRhdGluZyBhIG1lbnUgd2hlbiBpdCBpcyBvcGVuICovKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlV2luZG93c0NvdW50KGU6IElXaW5kb3dzQ291bnRDaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIWlzTWFjaW50b3NoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIG1lbnUgaWYgd2luZG93IGNvdW50IGdvZXMgZnJvbSBOID4gMCBvciAwID4gTiB0byB1cGRhdGUgbWVudSBpdGVtIGVuYWJsZW1lbnRcblx0XHRpZiAoKGUub2xkQ291bnQgPT09IDAgJiYgZS5uZXdDb3VudCA+IDApIHx8IChlLm9sZENvdW50ID4gMCAmJiBlLm5ld0NvdW50ID09PSAwKSkge1xuXHRcdFx0dGhpcy5jbG9zZWRMYXN0V2luZG93ID0gZS5uZXdDb3VudCA9PT0gMDtcblx0XHRcdHRoaXMuc2NoZWR1bGVVcGRhdGVNZW51KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVdpbmRvd0ZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICghaXNNYWNpbnRvc2gpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1c2VkV2luZG93ID0gQnJvd3NlcldpbmRvdy5nZXRGb2N1c2VkV2luZG93KCk7XG5cdFx0dGhpcy5ub0FjdGl2ZU1haW5XaW5kb3cgPSAhZm9jdXNlZFdpbmRvdyB8fCAhIXRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0J5V2ViQ29udGVudHMoZm9jdXNlZFdpbmRvdy53ZWJDb250ZW50cyk7XG5cdFx0dGhpcy5zY2hlZHVsZVVwZGF0ZU1lbnUoKTtcblx0fVxuXG5cdHByaXZhdGUgaW5zdGFsbCgpOiB2b2lkIHtcblx0XHQvLyBTdG9yZSBvbGQgbWVudSBpbiBvdXIgYXJyYXkgdG8gYXZvaWQgR0MgdG8gY29sbGVjdCB0aGUgbWVudSBhbmQgY3Jhc2guIFNlZSAjNTUzNDdcblx0XHQvLyBUT0RPQHNiYXR0ZW4gUmVtb3ZlIHRoaXMgd2hlbiBmaXhlZCB1cHN0cmVhbSBieSBFbGVjdHJvblxuXHRcdGNvbnN0IG9sZE1lbnUgPSBNZW51LmdldEFwcGxpY2F0aW9uTWVudSgpO1xuXHRcdGlmIChvbGRNZW51KSB7XG5cdFx0XHR0aGlzLm9sZE1lbnVzLnB1c2gob2xkTWVudSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgZG9uJ3QgaGF2ZSBhIG1lbnUgeWV0LCBzZXQgaXQgdG8gbnVsbCB0byBhdm9pZCB0aGUgZWxlY3Ryb24gbWVudS5cblx0XHQvLyBUaGlzIHNob3VsZCBvbmx5IGhhcHBlbiBvbiB0aGUgZmlyc3QgbGF1bmNoIGV2ZXJcblx0XHRpZiAoT2JqZWN0LmtleXModGhpcy5tZW51YmFyTWVudXMpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5kb1NldEFwcGxpY2F0aW9uTWVudShpc01hY2ludG9zaCA/IG5ldyBNZW51KCkgOiBudWxsKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBNZW51c1xuXHRcdGNvbnN0IG1lbnViYXIgPSBuZXcgTWVudSgpO1xuXG5cdFx0Ly8gTWFjOiBBcHBsaWNhdGlvblxuXHRcdGxldCBtYWNBcHBsaWNhdGlvbk1lbnVJdGVtOiBNZW51SXRlbTtcblx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdGNvbnN0IGFwcGxpY2F0aW9uTWVudSA9IG5ldyBNZW51KCk7XG5cdFx0XHRtYWNBcHBsaWNhdGlvbk1lbnVJdGVtID0gbmV3IE1lbnVJdGVtKHsgbGFiZWw6IHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0LCBzdWJtZW51OiBhcHBsaWNhdGlvbk1lbnUgfSk7XG5cdFx0XHR0aGlzLnNldE1hY0FwcGxpY2F0aW9uTWVudShhcHBsaWNhdGlvbk1lbnUpO1xuXHRcdFx0bWVudWJhci5hcHBlbmQobWFjQXBwbGljYXRpb25NZW51SXRlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFjOiBEb2NrXG5cdFx0aWYgKGlzTWFjaW50b3NoICYmICF0aGlzLmFwcE1lbnVJbnN0YWxsZWQpIHtcblx0XHRcdHRoaXMuYXBwTWVudUluc3RhbGxlZCA9IHRydWU7XG5cblx0XHRcdGNvbnN0IGRvY2tNZW51ID0gbmV3IE1lbnUoKTtcblx0XHRcdGRvY2tNZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oeyBsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKG5scy5sb2NhbGl6ZSh7IGtleTogJ21pTmV3V2luZG93JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIk5ldyAmJldpbmRvd1wiKSksIGNsaWNrOiAoKSA9PiB0aGlzLndpbmRvd3NNYWluU2VydmljZS5vcGVuRW1wdHlXaW5kb3coeyBjb250ZXh0OiBPcGVuQ29udGV4dC5ET0NLIH0pIH0pKTtcblxuXHRcdFx0YXBwLmRvY2shLnNldE1lbnUoZG9ja01lbnUpO1xuXHRcdH1cblxuXHRcdC8vIEZpbGVcblx0XHRpZiAodGhpcy5zaG91bGREcmF3TWVudSgnRmlsZScpKSB7XG5cdFx0XHRjb25zdCBmaWxlTWVudSA9IG5ldyBNZW51KCk7XG5cdFx0XHRjb25zdCBmaWxlTWVudUl0ZW0gPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKG5scy5sb2NhbGl6ZSh7IGtleTogJ21GaWxlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRmlsZVwiKSksIHN1Ym1lbnU6IGZpbGVNZW51IH0pO1xuXHRcdFx0dGhpcy5zZXRNZW51QnlJZChmaWxlTWVudSwgJ0ZpbGUnKTtcblx0XHRcdG1lbnViYXIuYXBwZW5kKGZpbGVNZW51SXRlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gRWRpdFxuXHRcdGlmICh0aGlzLnNob3VsZERyYXdNZW51KCdFZGl0JykpIHtcblx0XHRcdGNvbnN0IGVkaXRNZW51ID0gbmV3IE1lbnUoKTtcblx0XHRcdGNvbnN0IGVkaXRNZW51SXRlbSA9IG5ldyBNZW51SXRlbSh7IGxhYmVsOiB0aGlzLm1uZW1vbmljTGFiZWwobmxzLmxvY2FsaXplKHsga2V5OiAnbUVkaXQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZFZGl0XCIpKSwgc3VibWVudTogZWRpdE1lbnUgfSk7XG5cdFx0XHR0aGlzLnNldE1lbnVCeUlkKGVkaXRNZW51LCAnRWRpdCcpO1xuXHRcdFx0bWVudWJhci5hcHBlbmQoZWRpdE1lbnVJdGVtKTtcblx0XHR9XG5cblx0XHQvLyBTZWxlY3Rpb25cblx0XHRpZiAodGhpcy5zaG91bGREcmF3TWVudSgnU2VsZWN0aW9uJykpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbk1lbnUgPSBuZXcgTWVudSgpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uTWVudUl0ZW0gPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKG5scy5sb2NhbGl6ZSh7IGtleTogJ21TZWxlY3Rpb24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTZWxlY3Rpb25cIikpLCBzdWJtZW51OiBzZWxlY3Rpb25NZW51IH0pO1xuXHRcdFx0dGhpcy5zZXRNZW51QnlJZChzZWxlY3Rpb25NZW51LCAnU2VsZWN0aW9uJyk7XG5cdFx0XHRtZW51YmFyLmFwcGVuZChzZWxlY3Rpb25NZW51SXRlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gVmlld1xuXHRcdGlmICh0aGlzLnNob3VsZERyYXdNZW51KCdWaWV3JykpIHtcblx0XHRcdGNvbnN0IHZpZXdNZW51ID0gbmV3IE1lbnUoKTtcblx0XHRcdGNvbnN0IHZpZXdNZW51SXRlbSA9IG5ldyBNZW51SXRlbSh7IGxhYmVsOiB0aGlzLm1uZW1vbmljTGFiZWwobmxzLmxvY2FsaXplKHsga2V5OiAnbVZpZXcnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZWaWV3XCIpKSwgc3VibWVudTogdmlld01lbnUgfSk7XG5cdFx0XHR0aGlzLnNldE1lbnVCeUlkKHZpZXdNZW51LCAnVmlldycpO1xuXHRcdFx0bWVudWJhci5hcHBlbmQodmlld01lbnVJdGVtKTtcblx0XHR9XG5cblx0XHQvLyBHb1xuXHRcdGlmICh0aGlzLnNob3VsZERyYXdNZW51KCdHbycpKSB7XG5cdFx0XHRjb25zdCBnb3RvTWVudSA9IG5ldyBNZW51KCk7XG5cdFx0XHRjb25zdCBnb3RvTWVudUl0ZW0gPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKG5scy5sb2NhbGl6ZSh7IGtleTogJ21Hb3RvJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmR29cIikpLCBzdWJtZW51OiBnb3RvTWVudSB9KTtcblx0XHRcdHRoaXMuc2V0TWVudUJ5SWQoZ290b01lbnUsICdHbycpO1xuXHRcdFx0bWVudWJhci5hcHBlbmQoZ290b01lbnVJdGVtKTtcblx0XHR9XG5cblx0XHQvLyBEZWJ1Z1xuXHRcdGlmICh0aGlzLnNob3VsZERyYXdNZW51KCdSdW4nKSkge1xuXHRcdFx0Y29uc3QgZGVidWdNZW51ID0gbmV3IE1lbnUoKTtcblx0XHRcdGNvbnN0IGRlYnVnTWVudUl0ZW0gPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKG5scy5sb2NhbGl6ZSh7IGtleTogJ21SdW4nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSdW5cIikpLCBzdWJtZW51OiBkZWJ1Z01lbnUgfSk7XG5cdFx0XHR0aGlzLnNldE1lbnVCeUlkKGRlYnVnTWVudSwgJ1J1bicpO1xuXHRcdFx0bWVudWJhci5hcHBlbmQoZGVidWdNZW51SXRlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gVGVybWluYWxcblx0XHRpZiAodGhpcy5zaG91bGREcmF3TWVudSgnVGVybWluYWwnKSkge1xuXHRcdFx0Y29uc3QgdGVybWluYWxNZW51ID0gbmV3IE1lbnUoKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTWVudUl0ZW0gPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKG5scy5sb2NhbGl6ZSh7IGtleTogJ21UZXJtaW5hbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlRlcm1pbmFsXCIpKSwgc3VibWVudTogdGVybWluYWxNZW51IH0pO1xuXHRcdFx0dGhpcy5zZXRNZW51QnlJZCh0ZXJtaW5hbE1lbnUsICdUZXJtaW5hbCcpO1xuXHRcdFx0bWVudWJhci5hcHBlbmQodGVybWluYWxNZW51SXRlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFjOiBXaW5kb3dcblx0XHRsZXQgbWFjV2luZG93TWVudUl0ZW06IE1lbnVJdGVtIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLnNob3VsZERyYXdNZW51KCdXaW5kb3cnKSkge1xuXHRcdFx0Y29uc3Qgd2luZG93TWVudSA9IG5ldyBNZW51KCk7XG5cdFx0XHRtYWNXaW5kb3dNZW51SXRlbSA9IG5ldyBNZW51SXRlbSh7IGxhYmVsOiB0aGlzLm1uZW1vbmljTGFiZWwobmxzLmxvY2FsaXplKCdtV2luZG93JywgXCJXaW5kb3dcIikpLCBzdWJtZW51OiB3aW5kb3dNZW51LCByb2xlOiAnd2luZG93JyB9KTtcblx0XHRcdHRoaXMuc2V0TWFjV2luZG93TWVudSh3aW5kb3dNZW51KTtcblx0XHR9XG5cblx0XHRpZiAobWFjV2luZG93TWVudUl0ZW0pIHtcblx0XHRcdG1lbnViYXIuYXBwZW5kKG1hY1dpbmRvd01lbnVJdGVtKTtcblx0XHR9XG5cblx0XHQvLyBIZWxwXG5cdFx0aWYgKHRoaXMuc2hvdWxkRHJhd01lbnUoJ0hlbHAnKSkge1xuXHRcdFx0Y29uc3QgaGVscE1lbnUgPSBuZXcgTWVudSgpO1xuXHRcdFx0Y29uc3QgaGVscE1lbnVJdGVtID0gbmV3IE1lbnVJdGVtKHsgbGFiZWw6IHRoaXMubW5lbW9uaWNMYWJlbChubHMubG9jYWxpemUoeyBrZXk6ICdtSGVscCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkhlbHBcIikpLCBzdWJtZW51OiBoZWxwTWVudSwgcm9sZTogJ2hlbHAnIH0pO1xuXHRcdFx0dGhpcy5zZXRNZW51QnlJZChoZWxwTWVudSwgJ0hlbHAnKTtcblx0XHRcdG1lbnViYXIuYXBwZW5kKGhlbHBNZW51SXRlbSk7XG5cdFx0fVxuXG5cdFx0aWYgKG1lbnViYXIuaXRlbXMgJiYgbWVudWJhci5pdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmRvU2V0QXBwbGljYXRpb25NZW51KG1lbnViYXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRvU2V0QXBwbGljYXRpb25NZW51KG51bGwpO1xuXHRcdH1cblxuXHRcdC8vIERpc3Bvc2Ugb2Ygb2xkZXIgbWVudXMgYWZ0ZXIgc29tZSB0aW1lXG5cdFx0dGhpcy5tZW51R0Muc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9TZXRBcHBsaWNhdGlvbk1lbnUobWVudTogKE1lbnUpIHwgKG51bGwpKTogdm9pZCB7XG5cblx0XHQvLyBTZXR0aW5nIHRoZSBhcHBsaWNhdGlvbiBtZW51IHNldHMgaXQgdG8gYWxsIG9wZW5lZCB3aW5kb3dzLFxuXHRcdC8vIGJ1dCB3ZSBjdXJyZW50bHkgZG8gbm90IHN1cHBvcnQgYSBtZW51IGluIGF1eGlsaWFyeSB3aW5kb3dzLFxuXHRcdC8vIHNvIHdlIG5lZWQgdG8gdW5zZXQgaXQgdGhlcmUuXG5cdFx0Ly9cblx0XHQvLyBUaGlzIGlzIGEgYml0IHVnbHkgYnV0IGBzZXRBcHBsaWNhdGlvbk1lbnUoKWAgaGFzIHNvbWUgbmljZVxuXHRcdC8vIGJlaGF2aW91ciB3ZSB3YW50OlxuXHRcdC8vIC0gb24gbWFjT1MgaXQgaXMgcmVxdWlyZWQgYmVjYXVzZSBtZW51cyBhcmUgYXBwbGljYXRpb24gc2V0XG5cdFx0Ly8gLSB3ZSB1c2UgYGdldEFwcGxpY2F0aW9uTWVudSgpYCB0byBhY2Nlc3MgdGhlIGN1cnJlbnQgc3RhdGVcblx0XHQvLyAtIG5ldyB3aW5kb3dzIGltbWVkaWF0ZWx5IGdldCB0aGUgc2FtZSBtZW51IHdoZW4gb3BlbmluZ1xuXHRcdC8vICAgcmVkdWNpbmcgb3ZlcmFsbCBmbGlja2VyIGZvciB0aGVzZVxuXG5cdFx0TWVudS5zZXRBcHBsaWNhdGlvbk1lbnUobWVudSk7XG5cblx0XHRpZiAobWVudSkge1xuXHRcdFx0Zm9yIChjb25zdCB3aW5kb3cgb2YgdGhpcy5hdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93cygpKSB7XG5cdFx0XHRcdHdpbmRvdy53aW4/LnNldE1lbnUobnVsbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRNYWNBcHBsaWNhdGlvbk1lbnUobWFjQXBwbGljYXRpb25NZW51OiBNZW51KTogdm9pZCB7XG5cdFx0Y29uc3QgYWJvdXQgPSB0aGlzLmNyZWF0ZU1lbnVJdGVtKG5scy5sb2NhbGl6ZSgnbUFib3V0JywgXCJBYm91dCB7MH1cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZyksICd3b3JrYmVuY2guYWN0aW9uLnNob3dBYm91dERpYWxvZycpO1xuXHRcdGNvbnN0IGNoZWNrRm9yVXBkYXRlcyA9IHRoaXMuZ2V0VXBkYXRlTWVudUl0ZW1zKCk7XG5cblx0XHRsZXQgcHJlZmVyZW5jZXM7XG5cdFx0aWYgKHRoaXMuc2hvdWxkRHJhd01lbnUoJ1ByZWZlcmVuY2VzJykpIHtcblx0XHRcdGNvbnN0IHByZWZlcmVuY2VzTWVudSA9IG5ldyBNZW51KCk7XG5cdFx0XHR0aGlzLnNldE1lbnVCeUlkKHByZWZlcmVuY2VzTWVudSwgJ1ByZWZlcmVuY2VzJyk7XG5cdFx0XHRwcmVmZXJlbmNlcyA9IG5ldyBNZW51SXRlbSh7IGxhYmVsOiB0aGlzLm1uZW1vbmljTGFiZWwobmxzLmxvY2FsaXplKHsga2V5OiAnbWlQcmVmZXJlbmNlcycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlByZWZlcmVuY2VzXCIpKSwgc3VibWVudTogcHJlZmVyZW5jZXNNZW51IH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlcnZpY2VzTWVudSA9IG5ldyBNZW51KCk7XG5cdFx0Y29uc3Qgc2VydmljZXMgPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogbmxzLmxvY2FsaXplKCdtU2VydmljZXMnLCBcIlNlcnZpY2VzXCIpLCByb2xlOiAnc2VydmljZXMnLCBzdWJtZW51OiBzZXJ2aWNlc01lbnUgfSk7XG5cdFx0Y29uc3QgaGlkZSA9IG5ldyBNZW51SXRlbSh7IGxhYmVsOiBubHMubG9jYWxpemUoJ21IaWRlJywgXCJIaWRlIHswfVwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSwgcm9sZTogJ2hpZGUnLCBhY2NlbGVyYXRvcjogJ0NvbW1hbmQrSCcgfSk7XG5cdFx0Y29uc3QgaGlkZU90aGVycyA9IG5ldyBNZW51SXRlbSh7IGxhYmVsOiBubHMubG9jYWxpemUoJ21IaWRlT3RoZXJzJywgXCJIaWRlIE90aGVyc1wiKSwgcm9sZTogJ2hpZGVPdGhlcnMnLCBhY2NlbGVyYXRvcjogJ0NvbW1hbmQrQWx0K0gnIH0pO1xuXHRcdGNvbnN0IHNob3dBbGwgPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogbmxzLmxvY2FsaXplKCdtU2hvd0FsbCcsIFwiU2hvdyBBbGxcIiksIHJvbGU6ICd1bmhpZGUnIH0pO1xuXHRcdGNvbnN0IHF1aXQgPSBuZXcgTWVudUl0ZW0odGhpcy5saWtlQWN0aW9uKCd3b3JrYmVuY2guYWN0aW9uLnF1aXQnLCB7XG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdtaVF1aXQnLCBcIlF1aXQgezB9XCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpLCBjbGljazogYXN5bmMgKGl0ZW0sIHdpbmRvdywgZXZlbnQpID0+IHtcblx0XHRcdFx0Y29uc3QgbGFzdEFjdGl2ZVdpbmRvdyA9IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldExhc3RBY3RpdmVXaW5kb3coKTtcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0NvdW50KCkgPT09IDAgfHwgXHQvLyBhbGxvdyB0byBxdWl0IHdoZW4gbm8gbW9yZSB3aW5kb3dzIGFyZSBvcGVuXG5cdFx0XHRcdFx0ISFCcm93c2VyV2luZG93LmdldEZvY3VzZWRXaW5kb3coKSB8fFx0XHRcdFx0Ly8gYWxsb3cgdG8gcXVpdCB3aGVuIHdpbmRvdyBoYXMgZm9jdXMgKGZpeCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzM5MTkxKVxuXHRcdFx0XHRcdGxhc3RBY3RpdmVXaW5kb3c/Lndpbj8uaXNNaW5pbWl6ZWQoKVx0XHRcdFx0Ly8gYWxsb3cgdG8gcXVpdCB3aGVuIHdpbmRvdyBoYXMgbm8gZm9jdXMgYnV0IGlzIG1pbmltaXplZCAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzYzMDAwKVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCB0aGlzLmNvbmZpcm1CZWZvcmVRdWl0KGV2ZW50KTtcblx0XHRcdFx0XHRpZiAoY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm5hdGl2ZUhvc3RNYWluU2VydmljZS5xdWl0KHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IFthYm91dF07XG5cdFx0YWN0aW9ucy5wdXNoKC4uLmNoZWNrRm9yVXBkYXRlcyk7XG5cblx0XHRpZiAocHJlZmVyZW5jZXMpIHtcblx0XHRcdGFjdGlvbnMucHVzaCguLi5bXG5cdFx0XHRcdF9fc2VwYXJhdG9yX18oKSxcblx0XHRcdFx0cHJlZmVyZW5jZXNcblx0XHRcdF0pO1xuXHRcdH1cblxuXHRcdGFjdGlvbnMucHVzaCguLi5bXG5cdFx0XHRfX3NlcGFyYXRvcl9fKCksXG5cdFx0XHRzZXJ2aWNlcyxcblx0XHRcdF9fc2VwYXJhdG9yX18oKSxcblx0XHRcdGhpZGUsXG5cdFx0XHRoaWRlT3RoZXJzLFxuXHRcdFx0c2hvd0FsbCxcblx0XHRcdF9fc2VwYXJhdG9yX18oKSxcblx0XHRcdHF1aXRcblx0XHRdKTtcblxuXHRcdGFjdGlvbnMuZm9yRWFjaChpID0+IG1hY0FwcGxpY2F0aW9uTWVudS5hcHBlbmQoaSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb25maXJtQmVmb3JlUXVpdChldmVudDogS2V5Ym9hcmRFdmVudCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dDb3VudCgpID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gbmV2ZXIgY29uZmlybSB3aGVuIG5vIHdpbmRvd3MgYXJlIG9wZW5lZFxuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpcm1CZWZvcmVDbG9zZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J2Fsd2F5cycgfCAnbmV2ZXInIHwgJ2tleWJvYXJkT25seSc+KCd3aW5kb3cuY29uZmlybUJlZm9yZUNsb3NlJyk7XG5cdFx0aWYgKGNvbmZpcm1CZWZvcmVDbG9zZSA9PT0gJ2Fsd2F5cycgfHwgKGNvbmZpcm1CZWZvcmVDbG9zZSA9PT0gJ2tleWJvYXJkT25seScgJiYgdGhpcy5pc0tleWJvYXJkRXZlbnQoZXZlbnQpKSkge1xuXHRcdFx0Y29uc3QgeyByZXNwb25zZSB9ID0gYXdhaXQgdGhpcy5uYXRpdmVIb3N0TWFpblNlcnZpY2Uuc2hvd01lc3NhZ2VCb3godGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0Rm9jdXNlZFdpbmRvdygpPy5pZCwge1xuXHRcdFx0XHR0eXBlOiAncXVlc3Rpb24nLFxuXHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0aXNNYWNpbnRvc2ggPyBubHMubG9jYWxpemUoeyBrZXk6ICdxdWl0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUXVpdFwiKSA6IG5scy5sb2NhbGl6ZSh7IGtleTogJ2V4aXQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZFeGl0XCIpLFxuXHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2FuY2VsJywgXCJDYW5jZWxcIilcblx0XHRcdFx0XSxcblx0XHRcdFx0bWVzc2FnZTogaXNNYWNpbnRvc2ggPyBubHMubG9jYWxpemUoJ3F1aXRNZXNzYWdlTWFjJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gcXVpdD9cIikgOiBubHMubG9jYWxpemUoJ3F1aXRNZXNzYWdlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZXhpdD9cIilcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gcmVzcG9uc2UgPT09IDA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZERyYXdNZW51KG1lbnVJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFpc01hY2ludG9zaCAmJiAhdGhpcy5zaG93TmF0aXZlTWVudSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBXZSBuZWVkIHRvIGRyYXcgYW4gZW1wdHkgbWVudSB0byBvdmVycmlkZSB0aGUgZWxlY3Ryb24gZGVmYXVsdFxuXHRcdH1cblxuXHRcdHN3aXRjaCAobWVudUlkKSB7XG5cdFx0XHRjYXNlICdGaWxlJzpcblx0XHRcdGNhc2UgJ0hlbHAnOlxuXHRcdFx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdFx0XHRyZXR1cm4gKHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0NvdW50KCkgPT09IDAgJiYgdGhpcy5jbG9zZWRMYXN0V2luZG93KSB8fCAodGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKSA+IDAgJiYgdGhpcy5ub0FjdGl2ZU1haW5XaW5kb3cpIHx8ICghIXRoaXMubWVudWJhck1lbnVzICYmICEhdGhpcy5tZW51YmFyTWVudXNbbWVudUlkXSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0Y2FzZSAnV2luZG93Jzpcblx0XHRcdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdFx0cmV0dXJuICh0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dDb3VudCgpID09PSAwICYmIHRoaXMuY2xvc2VkTGFzdFdpbmRvdykgfHwgKHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0NvdW50KCkgPiAwICYmIHRoaXMubm9BY3RpdmVNYWluV2luZG93KSB8fCAhIXRoaXMubWVudWJhck1lbnVzO1xuXHRcdFx0XHR9XG5cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dDb3VudCgpID4gMCAmJiAoISF0aGlzLm1lbnViYXJNZW51cyAmJiAhIXRoaXMubWVudWJhck1lbnVzW21lbnVJZF0pO1xuXHRcdH1cblx0fVxuXG5cblx0cHJpdmF0ZSBzZXRNZW51KG1lbnU6IE1lbnUsIGl0ZW1zOiBBcnJheTxNZW51YmFyTWVudUl0ZW0+KSB7XG5cdFx0aXRlbXMuZm9yRWFjaCgoaXRlbTogTWVudWJhck1lbnVJdGVtKSA9PiB7XG5cdFx0XHRpZiAoaXNNZW51YmFyTWVudUl0ZW1TZXBhcmF0b3IoaXRlbSkpIHtcblx0XHRcdFx0bWVudS5hcHBlbmQoX19zZXBhcmF0b3JfXygpKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNNZW51YmFyTWVudUl0ZW1TdWJtZW51KGl0ZW0pKSB7XG5cdFx0XHRcdGNvbnN0IHN1Ym1lbnUgPSBuZXcgTWVudSgpO1xuXHRcdFx0XHRjb25zdCBzdWJtZW51SXRlbSA9IG5ldyBNZW51SXRlbSh7IGxhYmVsOiB0aGlzLm1uZW1vbmljTGFiZWwoaXRlbS5sYWJlbCksIHN1Ym1lbnUgfSk7XG5cdFx0XHRcdHRoaXMuc2V0TWVudShzdWJtZW51LCBpdGVtLnN1Ym1lbnUuaXRlbXMpO1xuXHRcdFx0XHRtZW51LmFwcGVuZChzdWJtZW51SXRlbSk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzTWVudWJhck1lbnVJdGVtUmVjZW50QWN0aW9uKGl0ZW0pKSB7XG5cdFx0XHRcdG1lbnUuYXBwZW5kKHRoaXMuY3JlYXRlT3BlblJlY2VudE1lbnVJdGVtKGl0ZW0pKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNNZW51YmFyTWVudUl0ZW1BY3Rpb24oaXRlbSkpIHtcblx0XHRcdFx0aWYgKGl0ZW0uaWQgPT09ICd3b3JrYmVuY2guYWN0aW9uLnNob3dBYm91dERpYWxvZycpIHtcblx0XHRcdFx0XHR0aGlzLmluc2VydENoZWNrRm9yVXBkYXRlc0l0ZW1zKG1lbnUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdFx0aWYgKCh0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dDb3VudCgpID09PSAwICYmIHRoaXMuY2xvc2VkTGFzdFdpbmRvdykgfHxcblx0XHRcdFx0XHRcdCh0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dDb3VudCgpID4gMCAmJiB0aGlzLm5vQWN0aXZlTWFpbldpbmRvdykpIHtcblx0XHRcdFx0XHRcdC8vIEluIHRoZSBmYWxsYmFjayBzY2VuYXJpbywgd2UgYXJlIGVpdGhlciBkaXNhYmxlZCBvciB1c2luZyBhIGZhbGxiYWNrIGhhbmRsZXJcblx0XHRcdFx0XHRcdGlmICh0aGlzLmZhbGxiYWNrTWVudUhhbmRsZXJzW2l0ZW0uaWRdKSB7XG5cdFx0XHRcdFx0XHRcdG1lbnUuYXBwZW5kKG5ldyBNZW51SXRlbSh0aGlzLmxpa2VBY3Rpb24oaXRlbS5pZCwgeyBsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKGl0ZW0ubGFiZWwpLCBjbGljazogdGhpcy5mYWxsYmFja01lbnVIYW5kbGVyc1tpdGVtLmlkXSB9KSkpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0bWVudS5hcHBlbmQodGhpcy5jcmVhdGVNZW51SXRlbShpdGVtLmxhYmVsLCBpdGVtLmlkLCBmYWxzZSwgaXRlbS5jaGVja2VkKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG1lbnUuYXBwZW5kKHRoaXMuY3JlYXRlTWVudUl0ZW0oaXRlbS5sYWJlbCwgaXRlbS5pZCwgaXRlbS5lbmFibGVkICE9PSBmYWxzZSwgISFpdGVtLmNoZWNrZWQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bWVudS5hcHBlbmQodGhpcy5jcmVhdGVNZW51SXRlbShpdGVtLmxhYmVsLCBpdGVtLmlkLCBpdGVtLmVuYWJsZWQgIT09IGZhbHNlLCAhIWl0ZW0uY2hlY2tlZCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHNldE1lbnVCeUlkKG1lbnU6IE1lbnUsIG1lbnVJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubWVudWJhck1lbnVzPy5bbWVudUlkXSkge1xuXHRcdFx0dGhpcy5zZXRNZW51KG1lbnUsIHRoaXMubWVudWJhck1lbnVzW21lbnVJZF0uaXRlbXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaW5zZXJ0Q2hlY2tGb3JVcGRhdGVzSXRlbXMobWVudTogTWVudSkge1xuXHRcdGNvbnN0IHVwZGF0ZUl0ZW1zID0gdGhpcy5nZXRVcGRhdGVNZW51SXRlbXMoKTtcblx0XHRpZiAodXBkYXRlSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHR1cGRhdGVJdGVtcy5mb3JFYWNoKGkgPT4gbWVudS5hcHBlbmQoaSkpO1xuXHRcdFx0bWVudS5hcHBlbmQoX19zZXBhcmF0b3JfXygpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU9wZW5SZWNlbnRNZW51SXRlbShpdGVtOiBJTWVudWJhck1lbnVSZWNlbnRJdGVtQWN0aW9uKTogTWVudUl0ZW0ge1xuXHRcdGNvbnN0IHJldml2ZWRVcmkgPSBVUkkucmV2aXZlKGl0ZW0udXJpKTtcblx0XHRjb25zdCBjb21tYW5kSWQgPSBpdGVtLmlkO1xuXHRcdGNvbnN0IG9wZW5hYmxlOiBJV2luZG93T3BlbmFibGUgPVxuXHRcdFx0KGNvbW1hbmRJZCA9PT0gJ29wZW5SZWNlbnRGaWxlJykgPyB7IGZpbGVVcmk6IHJldml2ZWRVcmkgfSA6XG5cdFx0XHRcdChjb21tYW5kSWQgPT09ICdvcGVuUmVjZW50V29ya3NwYWNlJykgPyB7IHdvcmtzcGFjZVVyaTogcmV2aXZlZFVyaSB9IDogeyBmb2xkZXJVcmk6IHJldml2ZWRVcmkgfTtcblxuXHRcdHJldHVybiBuZXcgTWVudUl0ZW0odGhpcy5saWtlQWN0aW9uKGNvbW1hbmRJZCwge1xuXHRcdFx0bGFiZWw6IGl0ZW0ubGFiZWwsXG5cdFx0XHRjbGljazogYXN5bmMgKG1lbnVJdGVtLCB3aW4sIGV2ZW50KSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9wZW5Jbk5ld1dpbmRvdyA9IHRoaXMuaXNPcHRpb25DbGljayhldmVudCk7XG5cdFx0XHRcdGNvbnN0IHN1Y2Nlc3MgPSAoYXdhaXQgdGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub3Blbih7XG5cdFx0XHRcdFx0Y29udGV4dDogT3BlbkNvbnRleHQuTUVOVSxcblx0XHRcdFx0XHRjbGk6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzLFxuXHRcdFx0XHRcdHVyaXNUb09wZW46IFtvcGVuYWJsZV0sXG5cdFx0XHRcdFx0Zm9yY2VOZXdXaW5kb3c6IG9wZW5Jbk5ld1dpbmRvdyxcblx0XHRcdFx0XHRnb3RvTGluZU1vZGU6IGZhbHNlLFxuXHRcdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogaXRlbS5yZW1vdGVBdXRob3JpdHlcblx0XHRcdFx0fSkpLmxlbmd0aCA+IDA7XG5cblx0XHRcdFx0aWYgKCFzdWNjZXNzKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLnJlbW92ZVJlY2VudGx5T3BlbmVkKFtyZXZpdmVkVXJpXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCBmYWxzZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc09wdGlvbkNsaWNrKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhKGV2ZW50ICYmICgoIWlzTWFjaW50b3NoICYmIChldmVudC5jdHJsS2V5IHx8IGV2ZW50LnNoaWZ0S2V5KSkgfHwgKGlzTWFjaW50b3NoICYmIChldmVudC5tZXRhS2V5IHx8IGV2ZW50LmFsdEtleSkpKSk7XG5cdH1cblxuXHRwcml2YXRlIGlzS2V5Ym9hcmRFdmVudChldmVudDogS2V5Ym9hcmRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIShldmVudC50cmlnZ2VyZWRCeUFjY2VsZXJhdG9yIHx8IGV2ZW50LmFsdEtleSB8fCBldmVudC5jdHJsS2V5IHx8IGV2ZW50Lm1ldGFLZXkgfHwgZXZlbnQuc2hpZnRLZXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVSb2xlTWVudUl0ZW0obGFiZWw6IHN0cmluZywgY29tbWFuZElkOiBzdHJpbmcsIHJvbGU6ICd1bmRvJyB8ICdyZWRvJyB8ICdjdXQnIHwgJ2NvcHknIHwgJ3Bhc3RlJyB8ICdwYXN0ZUFuZE1hdGNoU3R5bGUnIHwgJ2RlbGV0ZScgfCAnc2VsZWN0QWxsJyB8ICdyZWxvYWQnIHwgJ2ZvcmNlUmVsb2FkJyB8ICd0b2dnbGVEZXZUb29scycgfCAncmVzZXRab29tJyB8ICd6b29tSW4nIHwgJ3pvb21PdXQnIHwgJ3RvZ2dsZVNwZWxsQ2hlY2tlcicgfCAndG9nZ2xlZnVsbHNjcmVlbicgfCAnd2luZG93JyB8ICdtaW5pbWl6ZScgfCAnY2xvc2UnIHwgJ2hlbHAnIHwgJ2Fib3V0JyB8ICdzZXJ2aWNlcycgfCAnaGlkZScgfCAnaGlkZU90aGVycycgfCAndW5oaWRlJyB8ICdxdWl0JyB8ICdzaG93U3Vic3RpdHV0aW9ucycgfCAndG9nZ2xlU21hcnRRdW90ZXMnIHwgJ3RvZ2dsZVNtYXJ0RGFzaGVzJyB8ICd0b2dnbGVUZXh0UmVwbGFjZW1lbnQnIHwgJ3N0YXJ0U3BlYWtpbmcnIHwgJ3N0b3BTcGVha2luZycgfCAnem9vbScgfCAnZnJvbnQnIHwgJ2FwcE1lbnUnIHwgJ2ZpbGVNZW51JyB8ICdlZGl0TWVudScgfCAndmlld01lbnUnIHwgJ3NoYXJlTWVudScgfCAncmVjZW50RG9jdW1lbnRzJyB8ICd0b2dnbGVUYWJCYXInIHwgJ3NlbGVjdE5leHRUYWInIHwgJ3NlbGVjdFByZXZpb3VzVGFiJyB8ICdzaG93QWxsVGFicycgfCAnbWVyZ2VBbGxXaW5kb3dzJyB8ICdjbGVhclJlY2VudERvY3VtZW50cycgfCAnbW92ZVRhYlRvTmV3V2luZG93JyB8ICd3aW5kb3dNZW51Jyk6IE1lbnVJdGVtIHtcblx0XHRjb25zdCBvcHRpb25zOiBNZW51SXRlbUNvbnN0cnVjdG9yT3B0aW9ucyA9IHtcblx0XHRcdGxhYmVsOiB0aGlzLm1uZW1vbmljTGFiZWwobGFiZWwpLFxuXHRcdFx0cm9sZSxcblx0XHRcdGVuYWJsZWQ6IHRydWVcblx0XHR9O1xuXG5cdFx0cmV0dXJuIG5ldyBNZW51SXRlbSh0aGlzLndpdGhLZXliaW5kaW5nKGNvbW1hbmRJZCwgb3B0aW9ucykpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRNYWNXaW5kb3dNZW51KG1hY1dpbmRvd01lbnU6IE1lbnUpOiB2b2lkIHtcblx0XHRjb25zdCBtaW5pbWl6ZSA9IG5ldyBNZW51SXRlbSh7IGxhYmVsOiBubHMubG9jYWxpemUoJ21NaW5pbWl6ZScsIFwiTWluaW1pemVcIiksIHJvbGU6ICdtaW5pbWl6ZScsIGFjY2VsZXJhdG9yOiAnQ29tbWFuZCtNJywgZW5hYmxlZDogdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKSA+IDAgfSk7XG5cdFx0Y29uc3Qgem9vbSA9IG5ldyBNZW51SXRlbSh7IGxhYmVsOiBubHMubG9jYWxpemUoJ21ab29tJywgXCJab29tXCIpLCByb2xlOiAnem9vbScsIGVuYWJsZWQ6IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0NvdW50KCkgPiAwIH0pO1xuXHRcdGNvbnN0IGJyaW5nQWxsVG9Gcm9udCA9IG5ldyBNZW51SXRlbSh7IGxhYmVsOiBubHMubG9jYWxpemUoJ21CcmluZ1RvRnJvbnQnLCBcIkJyaW5nIEFsbCB0byBGcm9udFwiKSwgcm9sZTogJ2Zyb250JywgZW5hYmxlZDogdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKSA+IDAgfSk7XG5cdFx0Y29uc3Qgc3dpdGNoV2luZG93ID0gdGhpcy5jcmVhdGVNZW51SXRlbShubHMubG9jYWxpemUoeyBrZXk6ICdtaVN3aXRjaFdpbmRvdycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJTd2l0Y2ggJiZXaW5kb3cuLi5cIiksICd3b3JrYmVuY2guYWN0aW9uLnN3aXRjaFdpbmRvdycpO1xuXG5cdFx0Y29uc3QgbmF0aXZlVGFiTWVudUl0ZW1zOiBNZW51SXRlbVtdID0gW107XG5cdFx0aWYgKHRoaXMuY3VycmVudEVuYWJsZU5hdGl2ZVRhYnMpIHtcblx0XHRcdG5hdGl2ZVRhYk1lbnVJdGVtcy5wdXNoKF9fc2VwYXJhdG9yX18oKSk7XG5cblx0XHRcdG5hdGl2ZVRhYk1lbnVJdGVtcy5wdXNoKHRoaXMuY3JlYXRlTWVudUl0ZW0obmxzLmxvY2FsaXplKCdtTmV3VGFiJywgXCJOZXcgVGFiXCIpLCAnd29ya2JlbmNoLmFjdGlvbi5uZXdXaW5kb3dUYWInKSk7XG5cblx0XHRcdG5hdGl2ZVRhYk1lbnVJdGVtcy5wdXNoKHRoaXMuY3JlYXRlUm9sZU1lbnVJdGVtKG5scy5sb2NhbGl6ZSgnbVNob3dQcmV2aW91c1RhYicsIFwiU2hvdyBQcmV2aW91cyBUYWJcIiksICd3b3JrYmVuY2guYWN0aW9uLnNob3dQcmV2aW91c1dpbmRvd1RhYicsICdzZWxlY3RQcmV2aW91c1RhYicpKTtcblx0XHRcdG5hdGl2ZVRhYk1lbnVJdGVtcy5wdXNoKHRoaXMuY3JlYXRlUm9sZU1lbnVJdGVtKG5scy5sb2NhbGl6ZSgnbVNob3dOZXh0VGFiJywgXCJTaG93IE5leHQgVGFiXCIpLCAnd29ya2JlbmNoLmFjdGlvbi5zaG93TmV4dFdpbmRvd1RhYicsICdzZWxlY3ROZXh0VGFiJykpO1xuXHRcdFx0bmF0aXZlVGFiTWVudUl0ZW1zLnB1c2godGhpcy5jcmVhdGVSb2xlTWVudUl0ZW0obmxzLmxvY2FsaXplKCdtTW92ZVRhYlRvTmV3V2luZG93JywgXCJNb3ZlIFRhYiB0byBOZXcgV2luZG93XCIpLCAnd29ya2JlbmNoLmFjdGlvbi5tb3ZlV2luZG93VGFiVG9OZXdXaW5kb3cnLCAnbW92ZVRhYlRvTmV3V2luZG93JykpO1xuXHRcdFx0bmF0aXZlVGFiTWVudUl0ZW1zLnB1c2godGhpcy5jcmVhdGVSb2xlTWVudUl0ZW0obmxzLmxvY2FsaXplKCdtTWVyZ2VBbGxXaW5kb3dzJywgXCJNZXJnZSBBbGwgV2luZG93c1wiKSwgJ3dvcmtiZW5jaC5hY3Rpb24ubWVyZ2VBbGxXaW5kb3dUYWJzJywgJ21lcmdlQWxsV2luZG93cycpKTtcblx0XHR9XG5cblx0XHRbXG5cdFx0XHRtaW5pbWl6ZSxcblx0XHRcdHpvb20sXG5cdFx0XHRfX3NlcGFyYXRvcl9fKCksXG5cdFx0XHRzd2l0Y2hXaW5kb3csXG5cdFx0XHQuLi5uYXRpdmVUYWJNZW51SXRlbXMsXG5cdFx0XHRfX3NlcGFyYXRvcl9fKCksXG5cdFx0XHRicmluZ0FsbFRvRnJvbnRcblx0XHRdLmZvckVhY2goaXRlbSA9PiBtYWNXaW5kb3dNZW51LmFwcGVuZChpdGVtKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFVwZGF0ZU1lbnVJdGVtcygpOiBNZW51SXRlbVtdIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMudXBkYXRlU2VydmljZS5zdGF0ZTtcblxuXHRcdHN3aXRjaCAoc3RhdGUudHlwZSkge1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuSWRsZTpcblx0XHRcdFx0cmV0dXJuIFtuZXcgTWVudUl0ZW0oe1xuXHRcdFx0XHRcdGxhYmVsOiB0aGlzLm1uZW1vbmljTGFiZWwobmxzLmxvY2FsaXplKCdtaUNoZWNrRm9yVXBkYXRlcycsIFwiQ2hlY2sgZm9yICYmVXBkYXRlcy4uLlwiKSksIGNsaWNrOiAoKSA9PiBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMucmVwb3J0TWVudUFjdGlvblRlbGVtZXRyeSgnQ2hlY2tGb3JVcGRhdGUnKTtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlU2VydmljZS5jaGVja0ZvclVwZGF0ZXModHJ1ZSk7XG5cdFx0XHRcdFx0fSwgMClcblx0XHRcdFx0fSldO1xuXG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5DaGVja2luZ0ZvclVwZGF0ZXM6XG5cdFx0XHRcdHJldHVybiBbbmV3IE1lbnVJdGVtKHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnbWlDaGVja2luZ0ZvclVwZGF0ZXMnLCBcIkNoZWNraW5nIGZvciBVcGRhdGVzLi4uXCIpLCBlbmFibGVkOiBmYWxzZSB9KV07XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLkF2YWlsYWJsZUZvckRvd25sb2FkOlxuXHRcdFx0XHRyZXR1cm4gW25ldyBNZW51SXRlbSh7XG5cdFx0XHRcdFx0bGFiZWw6IHRoaXMubW5lbW9uaWNMYWJlbChubHMubG9jYWxpemUoJ21pRG93bmxvYWRVcGRhdGUnLCBcIkQmJm93bmxvYWQgQXZhaWxhYmxlIFVwZGF0ZVwiKSksIGNsaWNrOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVNlcnZpY2UuZG93bmxvYWRVcGRhdGUodHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KV07XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLkRvd25sb2FkaW5nOlxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuT3ZlcndyaXRpbmc6XG5cdFx0XHRcdHJldHVybiBbbmV3IE1lbnVJdGVtKHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnbWlEb3dubG9hZGluZ1VwZGF0ZScsIFwiRG93bmxvYWRpbmcgVXBkYXRlLi4uXCIpLCBlbmFibGVkOiBmYWxzZSB9KV07XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLkRvd25sb2FkZWQ6XG5cdFx0XHRcdHJldHVybiBpc01hY2ludG9zaCA/IFtdIDogW25ldyBNZW51SXRlbSh7XG5cdFx0XHRcdFx0bGFiZWw6IHRoaXMubW5lbW9uaWNMYWJlbChubHMubG9jYWxpemUoJ21pSW5zdGFsbFVwZGF0ZScsIFwiSW5zdGFsbCAmJlVwZGF0ZS4uLlwiKSksIGNsaWNrOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnJlcG9ydE1lbnVBY3Rpb25UZWxlbWV0cnkoJ0luc3RhbGxVcGRhdGUnKTtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlU2VydmljZS5hcHBseVVwZGF0ZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSldO1xuXG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5VcGRhdGluZzpcblx0XHRcdFx0cmV0dXJuIFtuZXcgTWVudUl0ZW0oeyBsYWJlbDogbmxzLmxvY2FsaXplKCdtaUluc3RhbGxpbmdVcGRhdGUnLCBcIkluc3RhbGxpbmcgVXBkYXRlLi4uXCIpLCBlbmFibGVkOiBmYWxzZSB9KV07XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLkNhbmNlbGxpbmc6XG5cdFx0XHRcdHJldHVybiBbbmV3IE1lbnVJdGVtKHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnbWlDYW5jZWxsaW5nVXBkYXRlJywgXCJDYW5jZWxsaW5nIFVwZGF0ZS4uLlwiKSwgZW5hYmxlZDogZmFsc2UgfSldO1xuXG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5SZWFkeTpcblx0XHRcdFx0cmV0dXJuIFtuZXcgTWVudUl0ZW0oe1xuXHRcdFx0XHRcdGxhYmVsOiB0aGlzLm1uZW1vbmljTGFiZWwobmxzLmxvY2FsaXplKCdtaVJlc3RhcnRUb1VwZGF0ZScsIFwiUmVzdGFydCB0byAmJlVwZGF0ZVwiKSksIGNsaWNrOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnJlcG9ydE1lbnVBY3Rpb25UZWxlbWV0cnkoJ1Jlc3RhcnRUb1VwZGF0ZScpO1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVTZXJ2aWNlLnF1aXRBbmRJbnN0YWxsKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KV07XG5cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU1lbnVJdGVtKGxhYmVsT3B0OiBzdHJpbmcsIGNvbW1hbmRJZDogc3RyaW5nLCBlbmFibGVkT3B0PzogYm9vbGVhbiwgY2hlY2tlZE9wdD86IGJvb2xlYW4pOiBNZW51SXRlbSB7XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLm1uZW1vbmljTGFiZWwobGFiZWxPcHQpO1xuXHRcdGNvbnN0IGNsaWNrID0gKG1lbnVJdGVtOiBNZW51SXRlbSAmIElNZW51SXRlbVdpdGhLZXliaW5kaW5nLCB3aW5kb3c6IEJhc2VXaW5kb3cgfCB1bmRlZmluZWQsIGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCB1c2VyU2V0dGluZ3NMYWJlbCA9IG1lbnVJdGVtID8gbWVudUl0ZW0udXNlclNldHRpbmdzTGFiZWwgOiBudWxsO1xuXHRcdFx0aWYgKHVzZXJTZXR0aW5nc0xhYmVsICYmIGV2ZW50LnRyaWdnZXJlZEJ5QWNjZWxlcmF0b3IpIHtcblx0XHRcdFx0dGhpcy5ydW5BY3Rpb25JblJlbmRlcmVyKHsgdHlwZTogJ2tleWJpbmRpbmcnLCB1c2VyU2V0dGluZ3NMYWJlbCB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucnVuQWN0aW9uSW5SZW5kZXJlcih7IHR5cGU6ICdjb21tYW5kSWQnLCBjb21tYW5kSWQgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBlbmFibGVkID0gdHlwZW9mIGVuYWJsZWRPcHQgPT09ICdib29sZWFuJyA/IGVuYWJsZWRPcHQgOiB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dDb3VudCgpID4gMDtcblx0XHRjb25zdCBjaGVja2VkID0gdHlwZW9mIGNoZWNrZWRPcHQgPT09ICdib29sZWFuJyA/IGNoZWNrZWRPcHQgOiBmYWxzZTtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IE1lbnVJdGVtQ29uc3RydWN0b3JPcHRpb25zID0ge1xuXHRcdFx0bGFiZWwsXG5cdFx0XHRjbGljayxcblx0XHRcdGVuYWJsZWRcblx0XHR9O1xuXG5cdFx0aWYgKGNoZWNrZWQpIHtcblx0XHRcdG9wdGlvbnMudHlwZSA9ICdjaGVja2JveCc7XG5cdFx0XHRvcHRpb25zLmNoZWNrZWQgPSBjaGVja2VkO1xuXHRcdH1cblxuXHRcdGlmIChpc01hY2ludG9zaCkge1xuXG5cdFx0XHQvLyBBZGQgcm9sZSBmb3Igc3BlY2lhbCBjYXNlIG1lbnUgaXRlbXNcblx0XHRcdGlmIChjb21tYW5kSWQgPT09ICdlZGl0b3IuYWN0aW9uLmNsaXBib2FyZEN1dEFjdGlvbicpIHtcblx0XHRcdFx0b3B0aW9ucy5yb2xlID0gJ2N1dCc7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbW1hbmRJZCA9PT0gJ2VkaXRvci5hY3Rpb24uY2xpcGJvYXJkQ29weUFjdGlvbicpIHtcblx0XHRcdFx0b3B0aW9ucy5yb2xlID0gJ2NvcHknO1xuXHRcdFx0fSBlbHNlIGlmIChjb21tYW5kSWQgPT09ICdlZGl0b3IuYWN0aW9uLmNsaXBib2FyZFBhc3RlQWN0aW9uJykge1xuXHRcdFx0XHRvcHRpb25zLnJvbGUgPSAncGFzdGUnO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBZGQgY29udGV4dCBhd2FyZSBjbGljayBoYW5kbGVycyBmb3Igc3BlY2lhbCBjYXNlIG1lbnUgaXRlbXNcblx0XHRcdGlmIChjb21tYW5kSWQgPT09ICd1bmRvJykge1xuXHRcdFx0XHRvcHRpb25zLmNsaWNrID0gdGhpcy5tYWtlQ29udGV4dEF3YXJlQ2xpY2tIYW5kbGVyKGNsaWNrLCB7XG5cdFx0XHRcdFx0aW5EZXZUb29sczogZGV2VG9vbHMgPT4gZGV2VG9vbHMudW5kbygpLFxuXHRcdFx0XHRcdGluTm9XaW5kb3c6ICgpID0+IE1lbnUuc2VuZEFjdGlvblRvRmlyc3RSZXNwb25kZXIoJ3VuZG86Jylcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbW1hbmRJZCA9PT0gJ3JlZG8nKSB7XG5cdFx0XHRcdG9wdGlvbnMuY2xpY2sgPSB0aGlzLm1ha2VDb250ZXh0QXdhcmVDbGlja0hhbmRsZXIoY2xpY2ssIHtcblx0XHRcdFx0XHRpbkRldlRvb2xzOiBkZXZUb29scyA9PiBkZXZUb29scy5yZWRvKCksXG5cdFx0XHRcdFx0aW5Ob1dpbmRvdzogKCkgPT4gTWVudS5zZW5kQWN0aW9uVG9GaXJzdFJlc3BvbmRlcigncmVkbzonKVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoY29tbWFuZElkID09PSAnZWRpdG9yLmFjdGlvbi5zZWxlY3RBbGwnKSB7XG5cdFx0XHRcdG9wdGlvbnMuY2xpY2sgPSB0aGlzLm1ha2VDb250ZXh0QXdhcmVDbGlja0hhbmRsZXIoY2xpY2ssIHtcblx0XHRcdFx0XHRpbkRldlRvb2xzOiBkZXZUb29scyA9PiBkZXZUb29scy5zZWxlY3RBbGwoKSxcblx0XHRcdFx0XHRpbk5vV2luZG93OiAoKSA9PiBNZW51LnNlbmRBY3Rpb25Ub0ZpcnN0UmVzcG9uZGVyKCdzZWxlY3RBbGw6Jylcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBNZW51SXRlbSh0aGlzLndpdGhLZXliaW5kaW5nKGNvbW1hbmRJZCwgb3B0aW9ucykpO1xuXHR9XG5cblx0cHJpdmF0ZSBtYWtlQ29udGV4dEF3YXJlQ2xpY2tIYW5kbGVyKGNsaWNrOiAobWVudUl0ZW06IE1lbnVJdGVtLCB3aW46IEJhc2VXaW5kb3csIGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB2b2lkLCBjb250ZXh0U3BlY2lmaWNIYW5kbGVyczogSU1lbnVJdGVtQ2xpY2tIYW5kbGVyKTogKG1lbnVJdGVtOiBNZW51SXRlbSwgd2luOiBCYXNlV2luZG93IHwgdW5kZWZpbmVkLCBldmVudDogS2V5Ym9hcmRFdmVudCkgPT4gdm9pZCB7XG5cdFx0cmV0dXJuIChtZW51SXRlbTogTWVudUl0ZW0sIHdpbjogQmFzZVdpbmRvdyB8IHVuZGVmaW5lZCwgZXZlbnQ6IEtleWJvYXJkRXZlbnQpID0+IHtcblxuXHRcdFx0Ly8gTm8gQWN0aXZlIFdpbmRvd1xuXHRcdFx0Y29uc3QgYWN0aXZlV2luZG93ID0gQnJvd3NlcldpbmRvdy5nZXRGb2N1c2VkV2luZG93KCk7XG5cdFx0XHRpZiAoIWFjdGl2ZVdpbmRvdykge1xuXHRcdFx0XHRyZXR1cm4gY29udGV4dFNwZWNpZmljSGFuZGxlcnMuaW5Ob1dpbmRvdygpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEZXZUb29scyBmb2N1c2VkXG5cdFx0XHRpZiAoYWN0aXZlV2luZG93LndlYkNvbnRlbnRzLmlzRGV2VG9vbHNGb2N1c2VkKCkgJiZcblx0XHRcdFx0YWN0aXZlV2luZG93LndlYkNvbnRlbnRzLmRldlRvb2xzV2ViQ29udGVudHMpIHtcblx0XHRcdFx0cmV0dXJuIGNvbnRleHRTcGVjaWZpY0hhbmRsZXJzLmluRGV2VG9vbHMoYWN0aXZlV2luZG93LndlYkNvbnRlbnRzLmRldlRvb2xzV2ViQ29udGVudHMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGb2N1cyBpcyBub3QgaW4gdGhlIHdvcmtiZW5jaCB3ZWJDb250ZW50c1xuXHRcdFx0aWYgKCFhY3RpdmVXaW5kb3cud2ViQ29udGVudHMuaXNGb2N1c2VkKCkpIHtcblx0XHRcdFx0cmV0dXJuIGNvbnRleHRTcGVjaWZpY0hhbmRsZXJzLmluTm9XaW5kb3coKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmluYWxseSBleGVjdXRlIGNvbW1hbmQgaW4gV2luZG93XG5cdFx0XHRjbGljayhtZW51SXRlbSwgd2luIHx8IGFjdGl2ZVdpbmRvdywgZXZlbnQpO1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHJ1bkFjdGlvbkluUmVuZGVyZXIoaW52b2NhdGlvbjogSU1lbnVJdGVtSW52b2NhdGlvbik6IGJvb2xlYW4ge1xuXG5cdFx0Ly8gV2Ugd2FudCB0byBzdXBwb3J0IGF1eGlsaWxhcnkgd2luZG93cyB0aGF0IG1heSBoYXZlIGZvY3VzIGJ5XG5cdFx0Ly8gcmV0dXJuaW5nIHRoZWlyIHBhcmVudCB3aW5kb3dzIGFzIHRhcmdldCB0byBzdXBwb3J0IHJ1bm5pbmdcblx0XHQvLyBhY3Rpb25zIHZpYSB0aGUgbWFpbiB3aW5kb3cuXG5cdFx0bGV0IGFjdGl2ZUJyb3dzZXJXaW5kb3cgPSBCcm93c2VyV2luZG93LmdldEZvY3VzZWRXaW5kb3coKTtcblx0XHRpZiAoYWN0aXZlQnJvd3NlcldpbmRvdykge1xuXHRcdFx0Y29uc3QgYXV4aWxpYXJ5V2luZG93Q2FuZGlkYXRlID0gdGhpcy5hdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93QnlXZWJDb250ZW50cyhhY3RpdmVCcm93c2VyV2luZG93LndlYkNvbnRlbnRzKTtcblx0XHRcdGlmIChhdXhpbGlhcnlXaW5kb3dDYW5kaWRhdGUpIHtcblx0XHRcdFx0YWN0aXZlQnJvd3NlcldpbmRvdyA9IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0J5SWQoYXV4aWxpYXJ5V2luZG93Q2FuZGlkYXRlLnBhcmVudElkKT8ud2luID8/IG51bGw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2UgbWFrZSBzdXJlIHRvIG5vdCBydW4gYWN0aW9ucyB3aGVuIHRoZSB3aW5kb3cgaGFzIG5vIGZvY3VzLCB0aGlzIGhlbHBzXG5cdFx0Ly8gZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNTkwNyBhbmQgc3BlY2lmaWNhbGx5IGZvclxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTkyOFxuXHRcdC8vIFN0aWxsIGFsbG93IHRvIHJ1biB3aGVuIHRoZSBsYXN0IGFjdGl2ZSB3aW5kb3cgaXMgbWluaW1pemVkIHRob3VnaCBmb3Jcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNjMwMDBcblx0XHRpZiAoIWFjdGl2ZUJyb3dzZXJXaW5kb3cpIHtcblx0XHRcdGNvbnN0IGxhc3RBY3RpdmVXaW5kb3cgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRMYXN0QWN0aXZlV2luZG93KCk7XG5cdFx0XHRpZiAobGFzdEFjdGl2ZVdpbmRvdz8ud2luPy5pc01pbmltaXplZCgpKSB7XG5cdFx0XHRcdGFjdGl2ZUJyb3dzZXJXaW5kb3cgPSBsYXN0QWN0aXZlV2luZG93Lndpbjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVXaW5kb3cgPSBhY3RpdmVCcm93c2VyV2luZG93ID8gdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93QnlJZChhY3RpdmVCcm93c2VyV2luZG93LmlkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoYWN0aXZlV2luZG93KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ21lbnViYXIjcnVuQWN0aW9uSW5SZW5kZXJlcicsIGludm9jYXRpb24pO1xuXG5cdFx0XHRpZiAoaXNNYWNpbnRvc2ggJiYgIXRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5pc0J1aWx0ICYmICFhY3RpdmVXaW5kb3cuaXNSZWFkeSkge1xuXHRcdFx0XHRpZiAoKGludm9jYXRpb24udHlwZSA9PT0gJ2NvbW1hbmRJZCcgJiYgaW52b2NhdGlvbi5jb21tYW5kSWQgPT09ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZURldlRvb2xzJykgfHwgKGludm9jYXRpb24udHlwZSAhPT0gJ2NvbW1hbmRJZCcgJiYgaW52b2NhdGlvbi51c2VyU2V0dGluZ3NMYWJlbCA9PT0gJ2FsdCtjbWQraScpKSB7XG5cdFx0XHRcdFx0Ly8gcHJldmVudCB0aGlzIGFjdGlvbiBmcm9tIHJ1bm5pbmcgdHdpY2Ugb24gbWFjT1MgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy82MjcxOSlcblx0XHRcdFx0XHQvLyB3ZSBhbHJlYWR5IHJlZ2lzdGVyIGEga2V5YmluZGluZyBpbiB3b3JrYmVuY2gudHMgZm9yIG9wZW5pbmcgZGV2ZWxvcGVyIHRvb2xzIGluIGNhc2Ugc29tZXRoaW5nXG5cdFx0XHRcdFx0Ly8gZ29lcyB3cm9uZyBhbmQgdGhhdCBrZXliaW5kaW5nIGlzIG9ubHkgcmVtb3ZlZCB3aGVuIHRoZSBhcHBsaWNhdGlvbiBoYXMgbG9hZGVkICg9IHdpbmRvdyByZWFkeSkuXG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpbnZvY2F0aW9uLnR5cGUgPT09ICdjb21tYW5kSWQnKSB7XG5cdFx0XHRcdGNvbnN0IHJ1bkFjdGlvblBheWxvYWQ6IElOYXRpdmVSdW5BY3Rpb25JbldpbmRvd1JlcXVlc3QgPSB7IGlkOiBpbnZvY2F0aW9uLmNvbW1hbmRJZCwgZnJvbTogJ21lbnUnIH07XG5cdFx0XHRcdGFjdGl2ZVdpbmRvdy5zZW5kV2hlblJlYWR5KCd2c2NvZGU6cnVuQWN0aW9uJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgcnVuQWN0aW9uUGF5bG9hZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBydW5LZXliaW5kaW5nUGF5bG9hZDogSU5hdGl2ZVJ1bktleWJpbmRpbmdJbldpbmRvd1JlcXVlc3QgPSB7IHVzZXJTZXR0aW5nc0xhYmVsOiBpbnZvY2F0aW9uLnVzZXJTZXR0aW5nc0xhYmVsIH07XG5cdFx0XHRcdGFjdGl2ZVdpbmRvdy5zZW5kV2hlblJlYWR5KCd2c2NvZGU6cnVuS2V5YmluZGluZycsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHJ1bktleWJpbmRpbmdQYXlsb2FkKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnbWVudWJhciNydW5BY3Rpb25JblJlbmRlcmVyOiBubyBhY3RpdmUgd2luZG93IGZvdW5kJywgaW52b2NhdGlvbik7XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHdpdGhLZXliaW5kaW5nKGNvbW1hbmRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcHRpb25zOiBNZW51SXRlbUNvbnN0cnVjdG9yT3B0aW9ucyAmIElNZW51SXRlbVdpdGhLZXliaW5kaW5nKTogTWVudUl0ZW1Db25zdHJ1Y3Rvck9wdGlvbnMge1xuXHRcdGNvbnN0IGJpbmRpbmcgPSB0eXBlb2YgY29tbWFuZElkID09PSAnc3RyaW5nJyA/IHRoaXMua2V5YmluZGluZ3NbY29tbWFuZElkXSA6IHVuZGVmaW5lZDtcblxuXHRcdC8vIEFwcGx5IGJpbmRpbmcgaWYgdGhlcmUgaXMgb25lXG5cdFx0aWYgKGJpbmRpbmc/LmxhYmVsKSB7XG5cblx0XHRcdC8vIGlmIHRoZSBiaW5kaW5nIGlzIG5hdGl2ZSwgd2UgY2FuIGp1c3QgYXBwbHkgaXRcblx0XHRcdGlmIChiaW5kaW5nLmlzTmF0aXZlICE9PSBmYWxzZSkge1xuXHRcdFx0XHRvcHRpb25zLmFjY2VsZXJhdG9yID0gYmluZGluZy5sYWJlbDtcblx0XHRcdFx0b3B0aW9ucy51c2VyU2V0dGluZ3NMYWJlbCA9IGJpbmRpbmcudXNlclNldHRpbmdzTGFiZWw7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHRoZSBrZXliaW5kaW5nIGlzIG5vdCBuYXRpdmUgc28gd2UgY2Fubm90IHNob3cgaXQgYXMgcGFydCBvZiB0aGUgYWNjZWxlcmF0b3Igb2Zcblx0XHRcdC8vIHRoZSBtZW51IGl0ZW0uIHdlIGZhbGxiYWNrIHRvIGEgZGlmZmVyZW50IHN0cmF0ZWd5IHNvIHRoYXQgd2UgYWx3YXlzIGRpc3BsYXkgaXRcblx0XHRcdGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zLmxhYmVsID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb25zdCBiaW5kaW5nSW5kZXggPSBvcHRpb25zLmxhYmVsLmluZGV4T2YoJ1snKTtcblx0XHRcdFx0aWYgKGJpbmRpbmdJbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0b3B0aW9ucy5sYWJlbCA9IGAke29wdGlvbnMubGFiZWwuc3Vic3RyKDAsIGJpbmRpbmdJbmRleCl9IFske2JpbmRpbmcubGFiZWx9XWA7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0b3B0aW9ucy5sYWJlbCA9IGAke29wdGlvbnMubGFiZWx9IFske2JpbmRpbmcubGFiZWx9XWA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVbnNldCBiaW5kaW5ncyBpZiB0aGVyZSBpcyBub25lXG5cdFx0ZWxzZSB7XG5cdFx0XHRvcHRpb25zLmFjY2VsZXJhdG9yID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBvcHRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBsaWtlQWN0aW9uKGNvbW1hbmRJZDogc3RyaW5nLCBvcHRpb25zOiBNZW51SXRlbUNvbnN0cnVjdG9yT3B0aW9ucywgc2V0QWNjZWxlcmF0b3IgPSAhb3B0aW9ucy5hY2NlbGVyYXRvcik6IE1lbnVJdGVtQ29uc3RydWN0b3JPcHRpb25zIHtcblx0XHRpZiAoc2V0QWNjZWxlcmF0b3IpIHtcblx0XHRcdG9wdGlvbnMgPSB0aGlzLndpdGhLZXliaW5kaW5nKGNvbW1hbmRJZCwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZ2luYWxDbGljayA9IG9wdGlvbnMuY2xpY2s7XG5cdFx0b3B0aW9ucy5jbGljayA9IChpdGVtLCB3aW5kb3csIGV2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLnJlcG9ydE1lbnVBY3Rpb25UZWxlbWV0cnkoY29tbWFuZElkKTtcblx0XHRcdG9yaWdpbmFsQ2xpY2s/LihpdGVtLCB3aW5kb3csIGV2ZW50KTtcblx0XHR9O1xuXG5cdFx0cmV0dXJuIG9wdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIG9wZW5VcmwodXJsOiBzdHJpbmcsIGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLm5hdGl2ZUhvc3RNYWluU2VydmljZS5vcGVuRXh0ZXJuYWwodW5kZWZpbmVkLCB1cmwpO1xuXHRcdHRoaXMucmVwb3J0TWVudUFjdGlvblRlbGVtZXRyeShpZCk7XG5cdH1cblxuXHRwcml2YXRlIHJlcG9ydE1lbnVBY3Rpb25UZWxlbWV0cnkoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQsIGZyb206IHRlbGVtZXRyeUZyb20gfSk7XG5cdH1cblxuXHRwcml2YXRlIG1uZW1vbmljTGFiZWwobGFiZWw6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG1uZW1vbmljTWVudUxhYmVsKGxhYmVsLCAhdGhpcy5jdXJyZW50RW5hYmxlTWVudUJhck1uZW1vbmljcyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gX19zZXBhcmF0b3JfXygpOiBNZW51SXRlbSB7XG5cdHJldHVybiBuZXcgTWVudUl0ZW0oeyB0eXBlOiAnc2VwYXJhdG9yJyB9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxLQUFLLGVBQTBDLE1BQU0sZ0JBQXlEO0FBRXZILFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYSxnQkFBZ0I7QUFDdEMsU0FBUyxXQUFXO0FBQ3BCLFlBQVksU0FBUztBQUNyQixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUF1Rix5QkFBeUIsK0JBQStCLDRCQUE0QixnQ0FBaUQ7QUFDNU4sU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0IsaUJBQWlCO0FBQzFDLFNBQWdHLHFCQUFxQjtBQUNySCxTQUFvQyxxQkFBcUIsbUJBQW1CO0FBQzVFLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsa0JBQWtCO0FBRTNCLE1BQU0sZ0JBQWdCO0FBZ0JmLElBQU0sVUFBTixjQUFzQixXQUFXO0FBQUEsRUF1QnZDLFlBQ2tDLGVBQ08sc0JBQ0Ysb0JBQ0ksd0JBQ04sa0JBQ1ksOEJBQ2hCLGNBQ1Esc0JBQ1YsWUFDVyx1QkFDUCxnQkFDYSw2QkFDOUM7QUFDRCxVQUFNO0FBYjJCO0FBQ087QUFDRjtBQUNJO0FBQ047QUFDWTtBQUNoQjtBQUNRO0FBQ1Y7QUFDVztBQUNQO0FBQ2E7QUFkaEQsU0FBaUIsdUJBQW9JLHVCQUFPLE9BQU8sSUFBSTtBQWtCdEssU0FBSyxjQUFjLEtBQUss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
