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
import { app, BrowserWindow, shell } from "electron";
import { addUNCHostToAllowlist } from "../../../base/node/unc.js";
import { hostname, release, arch } from "os";
import { coalesce, distinct } from "../../../base/common/arrays.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { CharCode } from "../../../base/common/charCode.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { isWindowsDriveLetter, parseLineAndColumnAware, sanitizeFilePath, toSlashes } from "../../../base/common/extpath.js";
import { getPathLabel } from "../../../base/common/labels.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { basename, join, normalize, posix } from "../../../base/common/path.js";
import { getMarks, mark } from "../../../base/common/performance.js";
import { isMacintosh, isWindows, OS } from "../../../base/common/platform.js";
import { cwd } from "../../../base/common/process.js";
import { extUriBiasedIgnorePathCase, isEqual, isEqualAuthority, normalizePath, originalFSPath, removeTrailingPathSeparator } from "../../../base/common/resources.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { getNLSLanguage, getNLSMessages, localize } from "../../../nls.js";
import { IBackupMainService } from "../../backup/electron-main/backup.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IDialogMainService } from "../../dialogs/electron-main/dialogMainService.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { FileType, IFileService } from "../../files/common/files.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import product from "../../product/common/product.js";
import { IProtocolMainService } from "../../protocol/electron-main/protocol.js";
import { getRemoteAuthority } from "../../remote/common/remoteHosts.js";
import { IStateService } from "../../state/node/state.js";
import { AgentsWindowOpenSource, isFileToOpen, isFolderToOpen, isWorkspaceToOpen } from "../../window/common/window.js";
import { CodeWindow } from "./windowImpl.js";
import { OpenContext, getLastFocused } from "./windows.js";
import { findWindowOnExtensionDevelopmentPath, findWindowOnFile, findWindowOnWorkspaceOrFolder } from "./windowsFinder.js";
import { WindowsStateHandler } from "./windowsStateHandler.js";
import { hasWorkspaceFileExtension, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, toWorkspaceIdentifier } from "../../workspace/common/workspace.js";
import { createEmptyWorkspaceIdentifier, getSingleFolderWorkspaceIdentifier, getWorkspaceIdentifier } from "../../workspaces/node/workspaces.js";
import { IWorkspacesHistoryMainService } from "../../workspaces/electron-main/workspacesHistoryMainService.js";
import { IWorkspacesManagementMainService } from "../../workspaces/electron-main/workspacesManagementMainService.js";
import { UnloadReason } from "../../window/electron-main/window.js";
import { IThemeMainService } from "../../theme/electron-main/themeMainService.js";
import { IPolicyService } from "../../policy/common/policy.js";
import { IUserDataProfilesMainService } from "../../userDataProfile/electron-main/userDataProfile.js";
import { ILoggerMainService } from "../../log/electron-main/loggerService.js";
import { IAuxiliaryWindowsMainService } from "../../auxiliaryWindow/electron-main/auxiliaryWindows.js";
import { ICSSDevelopmentService } from "../../cssDev/node/cssDevService.js";
import { ResourceSet } from "../../../base/common/map.js";
import { VSBuffer } from "../../../base/common/buffer.js";
const EMPTY_WINDOW = /* @__PURE__ */ Object.create(null);
function isWorkspacePathToOpen(path) {
  return isWorkspaceIdentifier(path?.workspace);
}
function isSingleFolderWorkspacePathToOpen(path) {
  return isSingleFolderWorkspaceIdentifier(path?.workspace);
}
let WindowsMainService = class extends Disposable {
  constructor(machineId, sqmId, devDeviceId, initialUserEnv, logService, loggerService, stateService, policyService, environmentMainService, userDataProfilesMainService, lifecycleMainService, backupMainService, configurationService, workspacesHistoryMainService, workspacesManagementMainService, instantiationService, dialogMainService, fileService, protocolMainService, themeMainService, auxiliaryWindowsMainService, cssDevelopmentService) {
    super();
    this.machineId = machineId;
    this.sqmId = sqmId;
    this.devDeviceId = devDeviceId;
    this.initialUserEnv = initialUserEnv;
    this.logService = logService;
    this.loggerService = loggerService;
    this.policyService = policyService;
    this.environmentMainService = environmentMainService;
    this.userDataProfilesMainService = userDataProfilesMainService;
    this.lifecycleMainService = lifecycleMainService;
    this.backupMainService = backupMainService;
    this.configurationService = configurationService;
    this.workspacesHistoryMainService = workspacesHistoryMainService;
    this.workspacesManagementMainService = workspacesManagementMainService;
    this.instantiationService = instantiationService;
    this.dialogMainService = dialogMainService;
    this.fileService = fileService;
    this.protocolMainService = protocolMainService;
    this.themeMainService = themeMainService;
    this.auxiliaryWindowsMainService = auxiliaryWindowsMainService;
    this.cssDevelopmentService = cssDevelopmentService;
    this._onDidOpenWindow = this._register(new Emitter());
    this.onDidOpenWindow = this._onDidOpenWindow.event;
    this._onDidSignalReadyWindow = this._register(new Emitter());
    this.onDidSignalReadyWindow = this._onDidSignalReadyWindow.event;
    this._onDidDestroyWindow = this._register(new Emitter());
    this.onDidDestroyWindow = this._onDidDestroyWindow.event;
    this._onDidChangeWindowsCount = this._register(new Emitter());
    this.onDidChangeWindowsCount = this._onDidChangeWindowsCount.event;
    this._onDidMaximizeWindow = this._register(new Emitter());
    this.onDidMaximizeWindow = this._onDidMaximizeWindow.event;
    this._onDidUnmaximizeWindow = this._register(new Emitter());
    this.onDidUnmaximizeWindow = this._onDidUnmaximizeWindow.event;
    this._onDidChangeFullScreen = this._register(new Emitter());
    this.onDidChangeFullScreen = this._onDidChangeFullScreen.event;
    this._onDidTriggerSystemContextMenu = this._register(new Emitter());
    this.onDidTriggerSystemContextMenu = this._onDidTriggerSystemContextMenu.event;
    this.windows = /* @__PURE__ */ new Map();
    this.windowsStateHandler = this._register(new WindowsStateHandler(this, stateService, this.lifecycleMainService, this.logService, this.configurationService));
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.workspacesManagementMainService.onDidEnterWorkspace((event) => this._onDidSignalReadyWindow.fire(event.window)));
    this._register(this.onDidSignalReadyWindow((window) => {
      if (window.config?.extensionDevelopmentPath || window.config?.extensionTestsPath) {
        const disposables = new DisposableStore();
        disposables.add(Event.any(window.onDidClose, window.onDidDestroy)(() => disposables.dispose()));
        if (window.config.extensionDevelopmentPath) {
          for (const extensionDevelopmentPath of window.config.extensionDevelopmentPath) {
            disposables.add(this.protocolMainService.addValidFileRoot(extensionDevelopmentPath));
          }
        }
        if (window.config.extensionTestsPath) {
          disposables.add(this.protocolMainService.addValidFileRoot(window.config.extensionTestsPath));
        }
      }
    }));
  }
  openEmptyWindow(openConfig, options) {
    const cli = this.environmentMainService.args;
    const remoteAuthority = options?.remoteAuthority || void 0;
    const forceEmpty = true;
    const forceReuseWindow = options?.forceReuseWindow;
    const forceNewWindow = !forceReuseWindow;
    return this.open({ ...openConfig, cli, forceEmpty, forceNewWindow, forceReuseWindow, remoteAuthority, forceTempProfile: options?.forceTempProfile, forceProfile: options?.forceProfile });
  }
  openExistingWindow(window, openConfig) {
    window.focus();
    this.handleWaitMarkerFile(openConfig, [window]);
    this.handleChatRequest(openConfig, [window]);
  }
  async openAgentsWindow(openConfig, folderUri, sessionResource, source) {
    this.logService.trace("windowsManager#openAgentsWindow");
    const windows = await this.open(await this.ensureAgentsWindow(openConfig));
    if (windows.length > 0) {
      const openSource = source ?? (openConfig.cli.agents ? AgentsWindowOpenSource.CommandLine : AgentsWindowOpenSource.Unknown);
      windows[0].sendWhenReady("vscode:selectAgentsFolder", CancellationToken.None, folderUri?.toJSON(), sessionResource?.toJSON(), openSource);
    }
    return windows;
  }
  async ensureAgentsWindow(openConfig) {
    const agentSessionsWorkspaceUri = this.environmentMainService.agentSessionsWorkspace;
    if (!agentSessionsWorkspaceUri) {
      throw new Error("Agents workspace is not configured");
    }
    const workspaceExists = await this.fileService.exists(agentSessionsWorkspaceUri);
    if (!workspaceExists) {
      const emptyWorkspaceContent = JSON.stringify({ folders: [] }, null, "	");
      await this.fileService.writeFile(agentSessionsWorkspaceUri, VSBuffer.fromString(emptyWorkspaceContent));
    }
    return {
      urisToOpen: [{ workspaceUri: agentSessionsWorkspaceUri }],
      userEnv: openConfig.userEnv,
      cli: openConfig.cli,
      noRecentEntry: true,
      context: openConfig.context,
      contextWindowId: openConfig.contextWindowId,
      initialStartup: openConfig.initialStartup,
      forceNewWindow: true
    };
  }
  async open(openConfig) {
    this.logService.trace("windowsManager#open");
    if ((openConfig.addMode || openConfig.removeMode) && (openConfig.initialStartup || !this.getLastActiveWindow())) {
      openConfig.addMode = false;
      openConfig.removeMode = false;
    }
    const foldersToAdd = [];
    const foldersToRemove = [];
    const foldersToOpen = [];
    const workspacesToOpen = [];
    const untitledWorkspacesToRestore = [];
    const emptyWindowsWithBackupsToRestore = [];
    let filesToOpen;
    let maybeOpenEmptyWindow = false;
    const pathsToOpen = await this.getPathsToOpen(openConfig);
    this.logService.trace("windowsManager#open pathsToOpen", pathsToOpen);
    for (const path of pathsToOpen) {
      if (isSingleFolderWorkspacePathToOpen(path)) {
        if (openConfig.addMode) {
          foldersToAdd.push(path);
        } else if (openConfig.removeMode) {
          foldersToRemove.push(path);
        } else {
          foldersToOpen.push(path);
        }
      } else if (isWorkspacePathToOpen(path)) {
        workspacesToOpen.push(path);
      } else if (path.fileUri) {
        if (!filesToOpen) {
          filesToOpen = { filesToOpenOrCreate: [], filesToDiff: [], filesToMerge: [], remoteAuthority: path.remoteAuthority };
        }
        filesToOpen.filesToOpenOrCreate.push(path);
      } else if (path.backupPath) {
        emptyWindowsWithBackupsToRestore.push({ backupFolder: basename(path.backupPath), remoteAuthority: path.remoteAuthority });
      } else {
        maybeOpenEmptyWindow = true;
      }
    }
    if (openConfig.diffMode && filesToOpen && filesToOpen.filesToOpenOrCreate.length >= 2) {
      filesToOpen.filesToDiff = filesToOpen.filesToOpenOrCreate.slice(0, 2);
      filesToOpen.filesToOpenOrCreate = [];
    }
    if (openConfig.mergeMode && filesToOpen && filesToOpen.filesToOpenOrCreate.length === 4) {
      filesToOpen.filesToMerge = filesToOpen.filesToOpenOrCreate.slice(0, 4);
      filesToOpen.filesToOpenOrCreate = [];
      filesToOpen.filesToDiff = [];
    }
    if (filesToOpen && openConfig.waitMarkerFileURI) {
      filesToOpen.filesToWait = { paths: coalesce([...filesToOpen.filesToDiff, filesToOpen.filesToMerge[3], ...filesToOpen.filesToOpenOrCreate]), waitMarkerFileUri: openConfig.waitMarkerFileURI };
    }
    if (openConfig.initialStartup) {
      untitledWorkspacesToRestore.push(...this.workspacesManagementMainService.getUntitledWorkspaces());
      workspacesToOpen.push(...untitledWorkspacesToRestore);
      emptyWindowsWithBackupsToRestore.push(...this.backupMainService.getEmptyWindowBackups());
    } else {
      emptyWindowsWithBackupsToRestore.length = 0;
    }
    const { windows: usedWindows, filesOpenedInWindow } = await this.doOpen(openConfig, workspacesToOpen, foldersToOpen, emptyWindowsWithBackupsToRestore, maybeOpenEmptyWindow, filesToOpen, foldersToAdd, foldersToRemove);
    this.logService.trace(`windowsManager#open used window count ${usedWindows.length} (workspacesToOpen: ${workspacesToOpen.length}, foldersToOpen: ${foldersToOpen.length}, emptyToRestore: ${emptyWindowsWithBackupsToRestore.length}, maybeOpenEmptyWindow: ${maybeOpenEmptyWindow})`);
    if (usedWindows.length > 1) {
      if (filesOpenedInWindow) {
        filesOpenedInWindow.focus();
      } else {
        const focusLastActive = this.windowsStateHandler.state.lastActiveWindow && !openConfig.forceEmpty && !openConfig.cli._.length && !openConfig.cli["file-uri"] && !openConfig.cli["folder-uri"] && !openConfig.urisToOpen?.length;
        let focusLastOpened = true;
        let focusLastWindow = true;
        if (focusLastActive) {
          const lastActiveWindow = usedWindows.filter((window) => this.windowsStateHandler.state.lastActiveWindow && window.backupPath === this.windowsStateHandler.state.lastActiveWindow.backupPath);
          if (lastActiveWindow.length) {
            lastActiveWindow[0].focus();
            focusLastOpened = false;
            focusLastWindow = false;
          }
        }
        if (focusLastOpened) {
          for (let i = usedWindows.length - 1; i >= 0; i--) {
            const usedWindow = usedWindows[i];
            if (usedWindow.openedWorkspace && untitledWorkspacesToRestore.some((workspace) => usedWindow.openedWorkspace && workspace.workspace.id === usedWindow.openedWorkspace.id) || // skip over restored workspace
            usedWindow.backupPath && emptyWindowsWithBackupsToRestore.some((empty) => usedWindow.backupPath && empty.backupFolder === basename(usedWindow.backupPath))) {
              continue;
            }
            usedWindow.focus();
            focusLastWindow = false;
            break;
          }
        }
        if (focusLastWindow) {
          usedWindows[usedWindows.length - 1].focus();
        }
      }
    }
    const isDiff = filesToOpen && filesToOpen.filesToDiff.length > 0;
    const isMerge = filesToOpen && filesToOpen.filesToMerge.length > 0;
    if (!usedWindows.some((window) => window.isExtensionDevelopmentHost) && !isDiff && !isMerge && !openConfig.noRecentEntry) {
      const recents = [];
      for (const pathToOpen of pathsToOpen) {
        if (isWorkspacePathToOpen(pathToOpen) && !pathToOpen.transient) {
          recents.push({ label: pathToOpen.label, workspace: pathToOpen.workspace, remoteAuthority: pathToOpen.remoteAuthority });
        } else if (isSingleFolderWorkspacePathToOpen(pathToOpen)) {
          recents.push({ label: pathToOpen.label, folderUri: pathToOpen.workspace.uri, remoteAuthority: pathToOpen.remoteAuthority });
        } else if (pathToOpen.fileUri) {
          recents.push({ label: pathToOpen.label, fileUri: pathToOpen.fileUri, remoteAuthority: pathToOpen.remoteAuthority });
        }
      }
      this.workspacesHistoryMainService.addRecentlyOpened(recents);
    }
    this.handleWaitMarkerFile(openConfig, usedWindows);
    this.handleChatRequest(openConfig, usedWindows);
    return usedWindows;
  }
  handleWaitMarkerFile(openConfig, usedWindows) {
    const waitMarkerFileURI = openConfig.waitMarkerFileURI;
    if (openConfig.context === OpenContext.CLI && waitMarkerFileURI && usedWindows.length === 1 && usedWindows[0]) {
      (async () => {
        await usedWindows[0].whenClosedOrLoaded;
        try {
          await this.fileService.del(waitMarkerFileURI);
        } catch (error) {
        }
      })();
    }
  }
  handleChatRequest(openConfig, usedWindows) {
    if (openConfig.context !== OpenContext.CLI || !openConfig.cli.chat || usedWindows.length === 0) {
      return;
    }
    let windowHandlingChatRequest;
    if (usedWindows.length === 1) {
      windowHandlingChatRequest = usedWindows[0];
    } else {
      const chatRequestFolder = openConfig.cli._[0];
      if (chatRequestFolder) {
        windowHandlingChatRequest = findWindowOnWorkspaceOrFolder(usedWindows, URI.file(chatRequestFolder));
      }
    }
    if (windowHandlingChatRequest) {
      windowHandlingChatRequest.sendWhenReady("vscode:handleChatRequest", CancellationToken.None, openConfig.cli.chat);
      windowHandlingChatRequest.focus();
    }
  }
  async doOpen(openConfig, workspacesToOpen, foldersToOpen, emptyToRestore, maybeOpenEmptyWindow, filesToOpen, foldersToAdd, foldersToRemove) {
    const usedWindows = [];
    let filesOpenedInWindow = void 0;
    function addUsedWindow(window, openedFiles) {
      usedWindows.push(window);
      if (openedFiles) {
        filesOpenedInWindow = window;
        filesToOpen = void 0;
      }
    }
    let { openFolderInNewWindow, openFilesInNewWindow } = this.shouldOpenNewWindow(openConfig);
    if (!openConfig.initialStartup && (foldersToAdd.length > 0 || foldersToRemove.length > 0)) {
      const authority = foldersToAdd.at(0)?.remoteAuthority ?? foldersToRemove.at(0)?.remoteAuthority;
      const lastActiveWindow = this.getLastActiveWindowForAuthority(authority);
      if (lastActiveWindow) {
        addUsedWindow(this.doAddRemoveFoldersInExistingWindow(lastActiveWindow, foldersToAdd.map((folderToAdd) => folderToAdd.workspace.uri), foldersToRemove.map((folderToRemove) => folderToRemove.workspace.uri)));
      }
    }
    const potentialNewWindowsCount = foldersToOpen.length + workspacesToOpen.length + emptyToRestore.length;
    if (filesToOpen && potentialNewWindowsCount === 0) {
      const fileToCheck = filesToOpen.filesToOpenOrCreate[0] || filesToOpen.filesToDiff[0] || filesToOpen.filesToMerge[3];
      const windows = this.getWindows().filter((window) => filesToOpen && isEqualAuthority(window.remoteAuthority, filesToOpen.remoteAuthority));
      let windowToUseForFiles = void 0;
      if (fileToCheck?.fileUri && !openFilesInNewWindow) {
        if (openConfig.context === OpenContext.DESKTOP || openConfig.context === OpenContext.CLI || openConfig.context === OpenContext.DOCK || openConfig.context === OpenContext.LINK) {
          windowToUseForFiles = await findWindowOnFile(windows, fileToCheck.fileUri, async (workspace) => workspace.configPath.scheme === Schemas.file ? this.workspacesManagementMainService.resolveLocalWorkspace(workspace.configPath) : void 0);
        }
        if (!windowToUseForFiles) {
          windowToUseForFiles = this.doGetLastActiveWindow(windows);
        }
      }
      if (windowToUseForFiles) {
        if (isWorkspaceIdentifier(windowToUseForFiles.openedWorkspace)) {
          workspacesToOpen.push({ workspace: windowToUseForFiles.openedWorkspace, remoteAuthority: windowToUseForFiles.remoteAuthority });
        } else if (isSingleFolderWorkspaceIdentifier(windowToUseForFiles.openedWorkspace)) {
          foldersToOpen.push({ workspace: windowToUseForFiles.openedWorkspace, remoteAuthority: windowToUseForFiles.remoteAuthority });
        } else {
          addUsedWindow(this.doOpenFilesInExistingWindow(openConfig, windowToUseForFiles, filesToOpen), true);
        }
      } else {
        addUsedWindow(await this.openInBrowserWindow({
          userEnv: openConfig.userEnv,
          cli: openConfig.cli,
          initialStartup: openConfig.initialStartup,
          filesToOpen,
          forceNewWindow: true,
          remoteAuthority: filesToOpen.remoteAuthority,
          forceNewTabbedWindow: openConfig.forceNewTabbedWindow,
          forceProfile: openConfig.forceProfile,
          forceTempProfile: openConfig.forceTempProfile
        }), true);
      }
    }
    const allWorkspacesToOpen = distinct(workspacesToOpen, (workspace) => workspace.workspace.id);
    if (allWorkspacesToOpen.length > 0) {
      const windowsOnWorkspace = coalesce(allWorkspacesToOpen.map((workspaceToOpen) => findWindowOnWorkspaceOrFolder(this.getWindows(), workspaceToOpen.workspace.configPath)));
      if (windowsOnWorkspace.length > 0) {
        const windowOnWorkspace = windowsOnWorkspace[0];
        const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, windowOnWorkspace.remoteAuthority) ? filesToOpen : void 0;
        addUsedWindow(this.doOpenFilesInExistingWindow(openConfig, windowOnWorkspace, filesToOpenInWindow), !!filesToOpenInWindow);
        openFolderInNewWindow = true;
      }
      for (const workspaceToOpen of allWorkspacesToOpen) {
        if (windowsOnWorkspace.some((window) => window.openedWorkspace && window.openedWorkspace.id === workspaceToOpen.workspace.id)) {
          continue;
        }
        const remoteAuthority = workspaceToOpen.remoteAuthority;
        const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, remoteAuthority) ? filesToOpen : void 0;
        addUsedWindow(await this.doOpenFolderOrWorkspace(openConfig, workspaceToOpen, openFolderInNewWindow, filesToOpenInWindow), !!filesToOpenInWindow);
        openFolderInNewWindow = true;
      }
    }
    const allFoldersToOpen = distinct(foldersToOpen, (folder) => extUriBiasedIgnorePathCase.getComparisonKey(folder.workspace.uri));
    if (allFoldersToOpen.length > 0) {
      const windowsOnFolderPath = coalesce(allFoldersToOpen.map((folderToOpen) => findWindowOnWorkspaceOrFolder(this.getWindows(), folderToOpen.workspace.uri)));
      if (windowsOnFolderPath.length > 0) {
        const windowOnFolderPath = windowsOnFolderPath[0];
        const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, windowOnFolderPath.remoteAuthority) ? filesToOpen : void 0;
        addUsedWindow(this.doOpenFilesInExistingWindow(openConfig, windowOnFolderPath, filesToOpenInWindow), !!filesToOpenInWindow);
        openFolderInNewWindow = true;
      }
      for (const folderToOpen of allFoldersToOpen) {
        if (windowsOnFolderPath.some((window) => isSingleFolderWorkspaceIdentifier(window.openedWorkspace) && extUriBiasedIgnorePathCase.isEqual(window.openedWorkspace.uri, folderToOpen.workspace.uri))) {
          continue;
        }
        const remoteAuthority = folderToOpen.remoteAuthority;
        const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, remoteAuthority) ? filesToOpen : void 0;
        addUsedWindow(await this.doOpenFolderOrWorkspace(openConfig, folderToOpen, openFolderInNewWindow, filesToOpenInWindow), !!filesToOpenInWindow);
        openFolderInNewWindow = true;
      }
    }
    const allEmptyToRestore = distinct(emptyToRestore, (info) => info.backupFolder);
    if (allEmptyToRestore.length > 0) {
      for (const emptyWindowBackupInfo of allEmptyToRestore) {
        const remoteAuthority = emptyWindowBackupInfo.remoteAuthority;
        const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, remoteAuthority) ? filesToOpen : void 0;
        addUsedWindow(await this.doOpenEmpty(openConfig, true, remoteAuthority, filesToOpenInWindow, emptyWindowBackupInfo), !!filesToOpenInWindow);
        openFolderInNewWindow = true;
      }
    }
    if (filesToOpen || maybeOpenEmptyWindow && (openConfig.forceEmpty || usedWindows.length === 0)) {
      const remoteAuthority = filesToOpen ? filesToOpen.remoteAuthority : openConfig.remoteAuthority;
      addUsedWindow(await this.doOpenEmpty(openConfig, openFolderInNewWindow, remoteAuthority, filesToOpen), !!filesToOpen);
    }
    return { windows: distinct(usedWindows), filesOpenedInWindow };
  }
  doOpenFilesInExistingWindow(configuration, window, filesToOpen) {
    this.logService.trace("windowsManager#doOpenFilesInExistingWindow", { filesToOpen });
    this.focusMainOrChildWindow(window);
    const params = {
      filesToOpenOrCreate: filesToOpen?.filesToOpenOrCreate,
      filesToDiff: filesToOpen?.filesToDiff,
      filesToMerge: filesToOpen?.filesToMerge,
      filesToWait: filesToOpen?.filesToWait,
      termProgram: configuration?.userEnv?.["TERM_PROGRAM"]
    };
    window.sendWhenReady("vscode:openFiles", CancellationToken.None, params);
    return window;
  }
  focusMainOrChildWindow(mainWindow) {
    let windowToFocus = mainWindow;
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow && focusedWindow.id !== mainWindow.id) {
      const auxiliaryWindowCandidate = this.auxiliaryWindowsMainService.getWindowByWebContents(focusedWindow.webContents);
      if (auxiliaryWindowCandidate && auxiliaryWindowCandidate.parentId === mainWindow.id) {
        windowToFocus = auxiliaryWindowCandidate;
      }
    }
    windowToFocus.focus();
  }
  doAddRemoveFoldersInExistingWindow(window, foldersToAdd, foldersToRemove) {
    this.logService.trace("windowsManager#doAddRemoveFoldersToExistingWindow", { foldersToAdd, foldersToRemove });
    window.focus();
    const request = { foldersToAdd, foldersToRemove };
    window.sendWhenReady("vscode:addRemoveFolders", CancellationToken.None, request);
    return window;
  }
  resolveContextWindow(openConfig, forceNewWindow) {
    if (!forceNewWindow && typeof openConfig.contextWindowId === "number") {
      const contextWindow = this.getWindowById(openConfig.contextWindowId);
      if (contextWindow?.config?.isSessionsWindow) {
        return { windowToUse: void 0, forceNewWindow: true };
      }
      return { windowToUse: contextWindow, forceNewWindow };
    }
    return { windowToUse: void 0, forceNewWindow };
  }
  doOpenEmpty(openConfig, forceNewWindow, remoteAuthority, filesToOpen, emptyWindowBackupInfo) {
    this.logService.trace("windowsManager#doOpenEmpty", { restore: !!emptyWindowBackupInfo, remoteAuthority, filesToOpen, forceNewWindow });
    const resolved = this.resolveContextWindow(openConfig, forceNewWindow);
    return this.openInBrowserWindow({
      userEnv: openConfig.userEnv,
      cli: openConfig.cli,
      initialStartup: openConfig.initialStartup,
      remoteAuthority,
      forceNewWindow: resolved.forceNewWindow,
      forceNewTabbedWindow: openConfig.forceNewTabbedWindow,
      filesToOpen,
      windowToUse: resolved.windowToUse,
      emptyWindowBackupInfo,
      forceProfile: openConfig.forceProfile,
      forceTempProfile: openConfig.forceTempProfile
    });
  }
  doOpenFolderOrWorkspace(openConfig, folderOrWorkspace, forceNewWindow, filesToOpen, windowToUse) {
    this.logService.trace("windowsManager#doOpenFolderOrWorkspace", { folderOrWorkspace, filesToOpen });
    if (!windowToUse) {
      const resolved = this.resolveContextWindow(openConfig, forceNewWindow);
      windowToUse = resolved.windowToUse;
      forceNewWindow = resolved.forceNewWindow;
    }
    return this.openInBrowserWindow({
      workspace: folderOrWorkspace.workspace,
      userEnv: openConfig.userEnv,
      cli: openConfig.cli,
      initialStartup: openConfig.initialStartup,
      remoteAuthority: folderOrWorkspace.remoteAuthority,
      forceNewWindow,
      forceNewTabbedWindow: openConfig.forceNewTabbedWindow,
      filesToOpen,
      windowToUse,
      forceProfile: openConfig.forceProfile,
      forceTempProfile: openConfig.forceTempProfile
    });
  }
  async getPathsToOpen(openConfig) {
    let pathsToOpen;
    let isCommandLineOrAPICall = false;
    let isRestoringPaths = false;
    if (openConfig.urisToOpen && openConfig.urisToOpen.length > 0) {
      pathsToOpen = await this.doExtractPathsFromAPI(openConfig);
      isCommandLineOrAPICall = true;
    } else if (openConfig.forceEmpty) {
      pathsToOpen = [EMPTY_WINDOW];
    } else if (openConfig.cli._.length || openConfig.cli["folder-uri"] || openConfig.cli["file-uri"]) {
      pathsToOpen = await this.doExtractPathsFromCLI(openConfig.cli);
      if (pathsToOpen.length === 0) {
        pathsToOpen.push(EMPTY_WINDOW);
      }
      isCommandLineOrAPICall = true;
    } else {
      pathsToOpen = await this.doGetPathsFromLastSession();
      if (pathsToOpen.length === 0) {
        pathsToOpen.push(EMPTY_WINDOW);
      }
      isRestoringPaths = true;
    }
    if (!openConfig.addMode && !openConfig.removeMode && isCommandLineOrAPICall) {
      const foldersToOpen = pathsToOpen.filter((path) => isSingleFolderWorkspacePathToOpen(path));
      if (foldersToOpen.length > 1) {
        const remoteAuthority = foldersToOpen[0].remoteAuthority;
        if (foldersToOpen.every((folderToOpen) => isEqualAuthority(folderToOpen.remoteAuthority, remoteAuthority))) {
          let workspace;
          const lastSessionWorkspaceMatchingFolders = await this.doGetWorkspaceMatchingFoldersFromLastSession(remoteAuthority, foldersToOpen);
          if (lastSessionWorkspaceMatchingFolders) {
            workspace = lastSessionWorkspaceMatchingFolders;
          } else {
            workspace = await this.workspacesManagementMainService.createUntitledWorkspace(foldersToOpen.map((folder) => ({ uri: folder.workspace.uri })));
          }
          pathsToOpen.push({ workspace, remoteAuthority });
          pathsToOpen = pathsToOpen.filter((path) => !isSingleFolderWorkspacePathToOpen(path));
        }
      }
    }
    if (openConfig.initialStartup && !isRestoringPaths && this.configurationService.getValue("window")?.restoreWindows === "preserve") {
      const lastSessionPaths = await this.doGetPathsFromLastSession();
      pathsToOpen.unshift(...lastSessionPaths.filter((path) => isWorkspacePathToOpen(path) || isSingleFolderWorkspacePathToOpen(path) || path.backupPath));
    }
    return pathsToOpen;
  }
  async doExtractPathsFromAPI(openConfig) {
    const pathResolveOptions = {
      gotoLineMode: openConfig.gotoLineMode,
      remoteAuthority: openConfig.remoteAuthority
    };
    const pathsToOpen = await Promise.all(coalesce(openConfig.urisToOpen || []).map(async (pathToOpen) => {
      const path = await this.resolveOpenable(pathToOpen, pathResolveOptions);
      if (path) {
        path.label = pathToOpen.label;
        return path;
      }
      const uri = this.resourceFromOpenable(pathToOpen);
      this.dialogMainService.showMessageBox({
        type: "info",
        buttons: [localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK")],
        message: uri.scheme === Schemas.file ? localize("pathNotExistTitle", "Path does not exist") : localize("uriInvalidTitle", "URI can not be opened"),
        detail: uri.scheme === Schemas.file ? localize("pathNotExistDetail", "The path '{0}' does not exist on this computer.", getPathLabel(uri, { os: OS, tildify: this.environmentMainService })) : localize("uriInvalidDetail", "The URI '{0}' is not valid and can not be opened.", uri.toString(true))
      }, BrowserWindow.getFocusedWindow() ?? void 0);
      return void 0;
    }));
    return coalesce(pathsToOpen);
  }
  async doExtractPathsFromCLI(cli) {
    const pathsToOpen = [];
    const pathResolveOptions = {
      ignoreFileNotFound: true,
      gotoLineMode: cli.goto,
      remoteAuthority: cli.remote || void 0,
      forceOpenWorkspaceAsFile: (
        // special case diff / merge mode to force open
        // workspace as file
        // https://github.com/microsoft/vscode/issues/149731
        cli.diff && cli._.length === 2 || cli.merge && cli._.length === 4
      )
    };
    const folderUris = cli["folder-uri"];
    if (folderUris) {
      const resolvedFolderUris = await Promise.all(folderUris.map((rawFolderUri) => {
        const folderUri = this.cliArgToUri(rawFolderUri);
        if (!folderUri) {
          return void 0;
        }
        return this.resolveOpenable({ folderUri }, pathResolveOptions);
      }));
      pathsToOpen.push(...coalesce(resolvedFolderUris));
    }
    const fileUris = cli["file-uri"];
    if (fileUris) {
      const resolvedFileUris = await Promise.all(fileUris.map((rawFileUri) => {
        const fileUri = this.cliArgToUri(rawFileUri);
        if (!fileUri) {
          return void 0;
        }
        return this.resolveOpenable(hasWorkspaceFileExtension(rawFileUri) ? { workspaceUri: fileUri } : { fileUri }, pathResolveOptions);
      }));
      pathsToOpen.push(...coalesce(resolvedFileUris));
    }
    const resolvedCliPaths = await Promise.all(cli._.map((cliPath) => {
      return pathResolveOptions.remoteAuthority ? this.doResolveRemotePath(cliPath, pathResolveOptions) : this.doResolveFilePath(cliPath, pathResolveOptions);
    }));
    pathsToOpen.push(...coalesce(resolvedCliPaths));
    return pathsToOpen;
  }
  cliArgToUri(arg) {
    try {
      const uri = URI.parse(arg);
      if (!uri.scheme) {
        this.logService.error(`Invalid URI input string, scheme missing: ${arg}`);
        return void 0;
      }
      if (!uri.path) {
        return uri.with({ path: "/" });
      }
      return uri;
    } catch (e) {
      this.logService.error(`Invalid URI input string: ${arg}, ${e.message}`);
    }
    return void 0;
  }
  async doGetPathsFromLastSession() {
    const restoreWindowsSetting = this.getRestoreWindowsSetting();
    switch (restoreWindowsSetting) {
      // none: no window to restore
      case "none":
        return [];
      // one: restore last opened workspace/folder or empty window
      // all: restore all windows
      // folders: restore last opened folders only
      case "one":
      case "all":
      case "preserve":
      case "folders": {
        const lastSessionWindows = [];
        if (restoreWindowsSetting !== "one") {
          lastSessionWindows.push(...this.windowsStateHandler.state.openedWindows);
        }
        if (this.windowsStateHandler.state.lastActiveWindow) {
          lastSessionWindows.push(this.windowsStateHandler.state.lastActiveWindow);
        }
        const pathsToOpen = await Promise.all(lastSessionWindows.map(async (lastSessionWindow) => {
          if (lastSessionWindow.workspace) {
            const pathToOpen = await this.resolveOpenable({ workspaceUri: lastSessionWindow.workspace.configPath }, {
              remoteAuthority: lastSessionWindow.remoteAuthority,
              rejectTransientWorkspaces: true
              /* https://github.com/microsoft/vscode/issues/119695 */
            });
            if (isWorkspacePathToOpen(pathToOpen)) {
              return pathToOpen;
            }
          } else if (lastSessionWindow.folderUri) {
            const pathToOpen = await this.resolveOpenable({ folderUri: lastSessionWindow.folderUri }, { remoteAuthority: lastSessionWindow.remoteAuthority });
            if (isSingleFolderWorkspacePathToOpen(pathToOpen)) {
              return pathToOpen;
            }
          } else if (restoreWindowsSetting !== "folders" && lastSessionWindow.backupPath) {
            return { backupPath: lastSessionWindow.backupPath, remoteAuthority: lastSessionWindow.remoteAuthority };
          }
          return void 0;
        }));
        return coalesce(pathsToOpen);
      }
    }
  }
  getRestoreWindowsSetting() {
    let restoreWindows;
    if (this.lifecycleMainService.wasRestarted) {
      restoreWindows = "all";
    } else {
      const windowConfig = this.configurationService.getValue("window");
      restoreWindows = windowConfig?.restoreWindows || "all";
      if (!["preserve", "all", "folders", "one", "none"].includes(restoreWindows)) {
        restoreWindows = "all";
      }
    }
    return restoreWindows;
  }
  async doGetWorkspaceMatchingFoldersFromLastSession(remoteAuthority, folders) {
    const workspaces = (await this.doGetPathsFromLastSession()).filter((path) => isWorkspacePathToOpen(path));
    const folderUris = folders.map((folder) => folder.workspace.uri);
    for (const { workspace } of workspaces) {
      const resolvedWorkspace = await this.workspacesManagementMainService.resolveLocalWorkspace(workspace.configPath);
      if (!resolvedWorkspace || resolvedWorkspace.remoteAuthority !== remoteAuthority || resolvedWorkspace.transient || resolvedWorkspace.folders.length !== folders.length) {
        continue;
      }
      const folderSet = new ResourceSet(folderUris, (uri) => extUriBiasedIgnorePathCase.getComparisonKey(uri));
      if (resolvedWorkspace.folders.every((folder) => folderSet.has(folder.uri))) {
        return resolvedWorkspace;
      }
    }
    return void 0;
  }
  async resolveOpenable(openable, options = /* @__PURE__ */ Object.create(null)) {
    const uri = this.resourceFromOpenable(openable);
    if (uri.scheme === Schemas.file) {
      if (isFileToOpen(openable)) {
        options = { ...options, forceOpenWorkspaceAsFile: true };
      }
      return this.doResolveFilePath(uri.fsPath, options);
    }
    return this.doResolveRemoteOpenable(openable, options);
  }
  doResolveRemoteOpenable(openable, options) {
    let uri = this.resourceFromOpenable(openable);
    const remoteAuthority = getRemoteAuthority(uri) || options.remoteAuthority;
    uri = removeTrailingPathSeparator(normalizePath(uri));
    if (isFileToOpen(openable)) {
      if (options.gotoLineMode) {
        const { path, line, column } = parseLineAndColumnAware(uri.path);
        return {
          fileUri: uri.with({ path }),
          options: {
            selection: line ? { startLineNumber: line, startColumn: column || 1 } : void 0
          },
          remoteAuthority
        };
      }
      return { fileUri: uri, remoteAuthority };
    } else if (isWorkspaceToOpen(openable)) {
      return { workspace: getWorkspaceIdentifier(uri), remoteAuthority };
    }
    return { workspace: getSingleFolderWorkspaceIdentifier(uri), remoteAuthority };
  }
  resourceFromOpenable(openable) {
    if (isWorkspaceToOpen(openable)) {
      return openable.workspaceUri;
    }
    if (isFolderToOpen(openable)) {
      return openable.folderUri;
    }
    return openable.fileUri;
  }
  async doResolveFilePath(path, options, skipHandleUNCError) {
    let lineNumber;
    let columnNumber;
    if (options.gotoLineMode) {
      ({ path, line: lineNumber, column: columnNumber } = parseLineAndColumnAware(path));
    }
    path = sanitizeFilePath(normalize(path), cwd());
    try {
      const pathStat = await fs.promises.stat(path);
      if (pathStat.isFile()) {
        if (!options.forceOpenWorkspaceAsFile) {
          const workspace = await this.workspacesManagementMainService.resolveLocalWorkspace(URI.file(path));
          if (workspace) {
            if (workspace.transient && options.rejectTransientWorkspaces) {
              return void 0;
            }
            return {
              workspace: { id: workspace.id, configPath: workspace.configPath },
              type: FileType.File,
              exists: true,
              remoteAuthority: workspace.remoteAuthority,
              transient: workspace.transient
            };
          }
        }
        return {
          fileUri: URI.file(path),
          type: FileType.File,
          exists: true,
          options: {
            selection: lineNumber ? { startLineNumber: lineNumber, startColumn: columnNumber || 1 } : void 0
          }
        };
      } else if (pathStat.isDirectory()) {
        return {
          workspace: getSingleFolderWorkspaceIdentifier(URI.file(path), pathStat),
          type: FileType.Directory,
          exists: true
        };
      } else if (!isWindows && path === "/dev/null") {
        return {
          fileUri: URI.file(path),
          type: FileType.File,
          exists: true
        };
      }
    } catch (error) {
      if (error.code === "ERR_UNC_HOST_NOT_ALLOWED" && !skipHandleUNCError) {
        return this.onUNCHostNotAllowed(path, options);
      }
      const fileUri = URI.file(path);
      this.workspacesHistoryMainService.removeRecentlyOpened([fileUri]);
      if (options.ignoreFileNotFound && error.code === "ENOENT") {
        return {
          fileUri,
          type: FileType.File,
          exists: false
        };
      }
      this.logService.error(`Invalid path provided: ${path}, ${error.message}`);
    }
    return void 0;
  }
  async onUNCHostNotAllowed(path, options) {
    const uri = URI.file(path);
    const { response, checkboxChecked } = await this.dialogMainService.showMessageBox({
      type: "warning",
      buttons: [
        localize({ key: "allow", comment: ["&& denotes a mnemonic"] }, "&&Allow"),
        localize({ key: "cancel", comment: ["&& denotes a mnemonic"] }, "&&Cancel"),
        localize({ key: "learnMore", comment: ["&& denotes a mnemonic"] }, "&&Learn More")
      ],
      message: localize("confirmOpenMessage", "The host '{0}' was not found in the list of allowed hosts. Do you want to allow it anyway?", uri.authority),
      detail: localize("confirmOpenDetail", "The path '{0}' uses a host that is not allowed. Unless you trust the host, you should press 'Cancel'", getPathLabel(uri, { os: OS, tildify: this.environmentMainService })),
      checkboxLabel: localize("doNotAskAgain", "Permanently allow host '{0}'", uri.authority),
      cancelId: 1
    });
    if (response === 0) {
      addUNCHostToAllowlist(uri.authority);
      if (checkboxChecked) {
        const request = { channel: "vscode:configureAllowedUNCHost", args: uri.authority };
        this.sendToFocused(request.channel, request.args);
        this.sendToOpeningWindow(request.channel, request.args);
      }
      return this.doResolveFilePath(
        path,
        options,
        true
        /* do not handle UNC error again */
      );
    }
    if (response === 2) {
      shell.openExternal("https://aka.ms/vscode-windows-unc");
      return this.onUNCHostNotAllowed(path, options);
    }
    return void 0;
  }
  doResolveRemotePath(path, options) {
    const first = path.charCodeAt(0);
    const remoteAuthority = options.remoteAuthority;
    let lineNumber;
    let columnNumber;
    if (options.gotoLineMode) {
      ({ path, line: lineNumber, column: columnNumber } = parseLineAndColumnAware(path));
    }
    if (first !== CharCode.Slash) {
      if (isWindowsDriveLetter(first) && path.charCodeAt(path.charCodeAt(1)) === CharCode.Colon) {
        path = toSlashes(path);
      }
      path = `/${path}`;
    }
    const uri = URI.from({ scheme: Schemas.vscodeRemote, authority: remoteAuthority, path });
    if (path.charCodeAt(path.length - 1) !== CharCode.Slash) {
      if (hasWorkspaceFileExtension(path)) {
        if (options.forceOpenWorkspaceAsFile) {
          return {
            fileUri: uri,
            options: {
              selection: lineNumber ? { startLineNumber: lineNumber, startColumn: columnNumber || 1 } : void 0
            },
            remoteAuthority: options.remoteAuthority
          };
        }
        return { workspace: getWorkspaceIdentifier(uri), remoteAuthority };
      } else if (options.gotoLineMode || posix.basename(path).indexOf(".") !== -1) {
        return {
          fileUri: uri,
          options: {
            selection: lineNumber ? { startLineNumber: lineNumber, startColumn: columnNumber || 1 } : void 0
          },
          remoteAuthority
        };
      }
    }
    return { workspace: getSingleFolderWorkspaceIdentifier(uri), remoteAuthority };
  }
  shouldOpenNewWindow(openConfig) {
    const windowConfig = this.configurationService.getValue("window");
    const openFolderInNewWindowConfig = windowConfig?.openFoldersInNewWindow || "default";
    const openFilesInNewWindowConfig = windowConfig?.openFilesInNewWindow || "off";
    let openFolderInNewWindow = (openConfig.preferNewWindow || openConfig.forceNewWindow) && !openConfig.forceReuseWindow;
    if (!openConfig.forceNewWindow && !openConfig.forceReuseWindow && (openFolderInNewWindowConfig === "on" || openFolderInNewWindowConfig === "off")) {
      openFolderInNewWindow = openFolderInNewWindowConfig === "on";
    }
    let openFilesInNewWindow = false;
    if (openConfig.forceNewWindow || openConfig.forceReuseWindow) {
      openFilesInNewWindow = !!openConfig.forceNewWindow && !openConfig.forceReuseWindow;
    } else {
      if (isMacintosh) {
        if (openConfig.context === OpenContext.DOCK) {
          openFilesInNewWindow = true;
        }
      } else {
        if (openConfig.context !== OpenContext.DIALOG && openConfig.context !== OpenContext.MENU && !(openConfig.userEnv && openConfig.userEnv["TERM_PROGRAM"] === "vscode")) {
          openFilesInNewWindow = true;
        }
      }
      if (!openConfig.cli.extensionDevelopmentPath && (openFilesInNewWindowConfig === "on" || openFilesInNewWindowConfig === "off")) {
        openFilesInNewWindow = openFilesInNewWindowConfig === "on";
      }
    }
    return { openFolderInNewWindow: !!openFolderInNewWindow, openFilesInNewWindow };
  }
  async openExtensionDevelopmentHostWindow(extensionDevelopmentPaths, openConfig) {
    const existingWindow = findWindowOnExtensionDevelopmentPath(this.getWindows(), extensionDevelopmentPaths);
    if (existingWindow) {
      this.lifecycleMainService.reload(existingWindow, openConfig.cli);
      existingWindow.focus();
      return [existingWindow];
    }
    let folderUris = openConfig.cli["folder-uri"] || [];
    let fileUris = openConfig.cli["file-uri"] || [];
    let cliArgs = openConfig.cli._;
    if (!cliArgs.length && !folderUris.length && !fileUris.length && !openConfig.cli.extensionTestsPath) {
      const extensionDevelopmentWindowState = this.windowsStateHandler.state.lastPluginDevelopmentHostWindow;
      const workspaceToOpen = extensionDevelopmentWindowState?.workspace ?? extensionDevelopmentWindowState?.folderUri;
      if (workspaceToOpen) {
        if (URI.isUri(workspaceToOpen)) {
          if (workspaceToOpen.scheme === Schemas.file) {
            cliArgs = [workspaceToOpen.fsPath];
          } else {
            folderUris = [workspaceToOpen.toString()];
          }
        } else {
          if (workspaceToOpen.configPath.scheme === Schemas.file) {
            cliArgs = [originalFSPath(workspaceToOpen.configPath)];
          } else {
            fileUris = [workspaceToOpen.configPath.toString()];
          }
        }
      }
    }
    let remoteAuthority = openConfig.remoteAuthority;
    for (const extensionDevelopmentPath of extensionDevelopmentPaths) {
      if (extensionDevelopmentPath.match(/^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/)) {
        const url = URI.parse(extensionDevelopmentPath);
        const extensionDevelopmentPathRemoteAuthority = getRemoteAuthority(url);
        if (extensionDevelopmentPathRemoteAuthority) {
          if (remoteAuthority) {
            if (!isEqualAuthority(extensionDevelopmentPathRemoteAuthority, remoteAuthority)) {
              this.logService.error("more than one extension development path authority");
            }
          } else {
            remoteAuthority = extensionDevelopmentPathRemoteAuthority;
          }
        }
      }
    }
    cliArgs = cliArgs.filter((path) => {
      const uri = URI.file(path);
      if (findWindowOnWorkspaceOrFolder(this.getWindows(), uri)) {
        return false;
      }
      return isEqualAuthority(getRemoteAuthority(uri), remoteAuthority);
    });
    folderUris = folderUris.filter((folderUriStr) => {
      const folderUri = this.cliArgToUri(folderUriStr);
      if (folderUri && findWindowOnWorkspaceOrFolder(this.getWindows(), folderUri)) {
        return false;
      }
      return folderUri ? isEqualAuthority(getRemoteAuthority(folderUri), remoteAuthority) : false;
    });
    fileUris = fileUris.filter((fileUriStr) => {
      const fileUri = this.cliArgToUri(fileUriStr);
      if (fileUri && findWindowOnWorkspaceOrFolder(this.getWindows(), fileUri)) {
        return false;
      }
      return fileUri ? isEqualAuthority(getRemoteAuthority(fileUri), remoteAuthority) : false;
    });
    openConfig.cli._ = cliArgs;
    openConfig.cli["folder-uri"] = folderUris;
    openConfig.cli["file-uri"] = fileUris;
    const openArgs = {
      context: openConfig.context,
      cli: openConfig.cli,
      forceNewWindow: true,
      forceEmpty: !cliArgs.length && !folderUris.length && !fileUris.length,
      userEnv: openConfig.userEnv,
      noRecentEntry: true,
      waitMarkerFileURI: openConfig.waitMarkerFileURI,
      remoteAuthority,
      forceProfile: openConfig.forceProfile,
      forceTempProfile: openConfig.forceTempProfile
    };
    return this.open(openArgs);
  }
  async openInBrowserWindow(options) {
    const windowConfig = this.configurationService.getValue("window");
    const lastActiveWindow = this.getLastActiveWindow();
    const newWindowProfile = windowConfig?.newWindowProfile ? this.userDataProfilesMainService.profiles.find((profile) => profile.name === windowConfig.newWindowProfile) : void 0;
    const defaultProfile = newWindowProfile ?? (lastActiveWindow?.profile?.isAgentsWindowProfile ? void 0 : lastActiveWindow?.profile) ?? this.userDataProfilesMainService.defaultProfile;
    let window;
    if (!options.forceNewWindow && !options.forceNewTabbedWindow) {
      window = options.windowToUse || (lastActiveWindow?.config?.isSessionsWindow ? void 0 : lastActiveWindow);
      if (window) {
        window.focus();
      }
    }
    const configuration = {
      // Inherit CLI arguments from environment and/or
      // the specific properties from this launch if provided
      ...this.environmentMainService.args,
      ...options.cli,
      machineId: this.machineId,
      sqmId: this.sqmId,
      devDeviceId: this.devDeviceId,
      isPortable: this.environmentMainService.isPortable,
      windowId: -1,
      // Will be filled in by the window once loaded later
      mainPid: process.pid,
      appRoot: this.environmentMainService.appRoot,
      execPath: process.execPath,
      codeCachePath: this.environmentMainService.codeCachePath,
      // If we know the backup folder upfront (for empty windows to restore), we can set it
      // directly here which helps for restoring UI state associated with that window.
      // For all other cases we first call into registerEmptyWindowBackup() to set it before
      // loading the window.
      backupPath: options.emptyWindowBackupInfo ? join(this.environmentMainService.backupHome, options.emptyWindowBackupInfo.backupFolder) : void 0,
      profiles: {
        home: this.userDataProfilesMainService.profilesHome,
        all: this.userDataProfilesMainService.profiles,
        // Set to default profile first and resolve and update the profile
        // only after the workspace-backup is registered.
        // Because, workspace identifier of an empty window is known only then.
        profile: defaultProfile
      },
      homeDir: this.environmentMainService.userHome.with({ scheme: Schemas.file }).fsPath,
      tmpDir: this.environmentMainService.tmpDir.with({ scheme: Schemas.file }).fsPath,
      userDataDir: this.environmentMainService.userDataPath,
      remoteAuthority: options.remoteAuthority,
      workspace: options.workspace,
      userEnv: { ...this.initialUserEnv, ...options.userEnv },
      nls: {
        messages: getNLSMessages(),
        language: getNLSLanguage()
      },
      filesToOpenOrCreate: options.filesToOpen?.filesToOpenOrCreate,
      filesToDiff: options.filesToOpen?.filesToDiff,
      filesToMerge: options.filesToOpen?.filesToMerge,
      filesToWait: options.filesToOpen?.filesToWait,
      logLevel: this.loggerService.getLogLevel(),
      loggers: this.loggerService.getGlobalLoggers(),
      logsPath: this.environmentMainService.logsHome.with({ scheme: Schemas.file }).fsPath,
      product,
      isInitialStartup: options.initialStartup,
      perfMarks: getMarks(),
      os: { release: release(), hostname: hostname(), arch: arch() },
      autoDetectHighContrast: windowConfig?.autoDetectHighContrast ?? true,
      autoDetectColorScheme: windowConfig?.autoDetectColorScheme ?? false,
      accessibilitySupport: app.accessibilitySupportEnabled,
      colorScheme: this.themeMainService.getColorScheme(),
      policiesData: this.policyService.serialize(),
      continueOn: this.environmentMainService.continueOn,
      cssModules: this.cssDevelopmentService.isEnabled ? await this.cssDevelopmentService.getCssModules() : void 0,
      isSessionsWindow: isWorkspaceIdentifier(options.workspace) && isEqual(options.workspace.configPath, this.environmentMainService.agentSessionsWorkspace)
    };
    if (!window) {
      const state = this.windowsStateHandler.getNewWindowState(configuration);
      mark("code/willCreateCodeWindow");
      const createdWindow = window = this.instantiationService.createInstance(CodeWindow, {
        state,
        extensionDevelopmentPath: configuration.extensionDevelopmentPath,
        isExtensionTestHost: !!configuration.extensionTestsPath,
        isSessionsWindow: configuration.isSessionsWindow
      });
      mark("code/didCreateCodeWindow");
      if (options.forceNewTabbedWindow) {
        const activeWindow = this.getLastActiveWindow();
        activeWindow?.addTabbedWindow(createdWindow);
      }
      this.windows.set(createdWindow.id, createdWindow);
      this._onDidOpenWindow.fire(createdWindow);
      this._onDidChangeWindowsCount.fire({ oldCount: this.getWindowCount() - 1, newCount: this.getWindowCount() });
      const disposables = new DisposableStore();
      disposables.add(createdWindow.onDidSignalReady(() => this._onDidSignalReadyWindow.fire(createdWindow)));
      disposables.add(Event.once(createdWindow.onDidClose)(() => this.onWindowClosed(createdWindow, disposables)));
      disposables.add(Event.once(createdWindow.onDidDestroy)(() => this.onWindowDestroyed(createdWindow)));
      disposables.add(createdWindow.onDidMaximize(() => this._onDidMaximizeWindow.fire(createdWindow)));
      disposables.add(createdWindow.onDidUnmaximize(() => this._onDidUnmaximizeWindow.fire(createdWindow)));
      disposables.add(createdWindow.onDidEnterFullScreen(() => this._onDidChangeFullScreen.fire({ window: createdWindow, fullscreen: true })));
      disposables.add(createdWindow.onDidLeaveFullScreen(() => this._onDidChangeFullScreen.fire({ window: createdWindow, fullscreen: false })));
      disposables.add(createdWindow.onDidTriggerSystemContextMenu(({ x, y }) => this._onDidTriggerSystemContextMenu.fire({ window: createdWindow, x, y })));
      const webContents = assertReturnsDefined(createdWindow.win?.webContents);
      webContents.removeAllListeners("devtools-reload-page");
      disposables.add(Event.fromNodeEventEmitter(webContents, "devtools-reload-page")(() => this.lifecycleMainService.reload(createdWindow)));
      this.lifecycleMainService.registerWindow(createdWindow);
    } else {
      const currentWindowConfig = window.config;
      if (!configuration.extensionDevelopmentPath && currentWindowConfig?.extensionDevelopmentPath) {
        configuration.extensionDevelopmentPath = currentWindowConfig.extensionDevelopmentPath;
        configuration.extensionDevelopmentKind = currentWindowConfig.extensionDevelopmentKind;
        configuration["enable-proposed-api"] = currentWindowConfig["enable-proposed-api"];
        configuration.verbose = currentWindowConfig.verbose;
        configuration["inspect-extensions"] = currentWindowConfig["inspect-extensions"];
        configuration["inspect-brk-extensions"] = currentWindowConfig["inspect-brk-extensions"];
        configuration.debugId = currentWindowConfig.debugId;
        configuration.extensionEnvironment = currentWindowConfig.extensionEnvironment;
        configuration["extensions-dir"] = currentWindowConfig["extensions-dir"];
        configuration["disable-extensions"] = currentWindowConfig["disable-extensions"];
        configuration["disable-extension"] = currentWindowConfig["disable-extension"];
      }
    }
    configuration.windowId = window.id;
    if (window.isReady) {
      this.lifecycleMainService.unload(window, UnloadReason.LOAD).then(async (veto) => {
        if (!veto) {
          await this.doOpenInBrowserWindow(window, configuration, options, defaultProfile);
        }
      });
    } else {
      await this.doOpenInBrowserWindow(window, configuration, options, defaultProfile);
    }
    return window;
  }
  async doOpenInBrowserWindow(window, configuration, options, defaultProfile) {
    if (!configuration.extensionDevelopmentPath) {
      if (isWorkspaceIdentifier(configuration.workspace)) {
        configuration.backupPath = this.backupMainService.registerWorkspaceBackup({
          workspace: configuration.workspace,
          remoteAuthority: configuration.remoteAuthority
        });
      } else if (isSingleFolderWorkspaceIdentifier(configuration.workspace)) {
        configuration.backupPath = this.backupMainService.registerFolderBackup({
          folderUri: configuration.workspace.uri,
          remoteAuthority: configuration.remoteAuthority
        });
      } else {
        configuration.backupPath = this.backupMainService.registerEmptyWindowBackup({
          backupFolder: options.emptyWindowBackupInfo?.backupFolder ?? createEmptyWorkspaceIdentifier().id,
          remoteAuthority: configuration.remoteAuthority
        });
      }
    }
    const workspace = configuration.workspace ?? toWorkspaceIdentifier(configuration.backupPath, false);
    if (configuration.isSessionsWindow) {
      configuration.profiles.profile = this.userDataProfilesMainService.profiles.find((p) => p.isAgentsWindowProfile) ?? await this.userDataProfilesMainService.createAgentsWindowProfile();
    } else {
      const profilePromise = this.resolveProfileForBrowserWindow(options, workspace, defaultProfile);
      const profile = profilePromise instanceof Promise ? await profilePromise : profilePromise;
      configuration.profiles.profile = profile;
      if (!configuration.extensionDevelopmentPath) {
        await this.userDataProfilesMainService.setProfileForWorkspace(workspace, profile);
      }
    }
    window.load(configuration);
  }
  resolveProfileForBrowserWindow(options, workspace, defaultProfile) {
    if (options.forceProfile) {
      return this.userDataProfilesMainService.profiles.find((p) => p.name === options.forceProfile) ?? this.userDataProfilesMainService.createNamedProfile(options.forceProfile);
    }
    if (options.forceTempProfile) {
      return this.userDataProfilesMainService.createTransientProfile();
    }
    return this.userDataProfilesMainService.getProfileForWorkspace(workspace) ?? defaultProfile;
  }
  onWindowClosed(window, disposables) {
    this.windows.delete(window.id);
    this._onDidChangeWindowsCount.fire({ oldCount: this.getWindowCount() + 1, newCount: this.getWindowCount() });
    disposables.dispose();
  }
  onWindowDestroyed(window) {
    this.windows.delete(window.id);
    this._onDidDestroyWindow.fire(window);
  }
  getFocusedWindow() {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
      return this.getWindowById(window.id);
    }
    return void 0;
  }
  getLastActiveWindow() {
    return this.doGetLastActiveWindow(this.getWindows());
  }
  getLastActiveWindowForAuthority(remoteAuthority) {
    return this.doGetLastActiveWindow(this.getWindows().filter((window) => isEqualAuthority(window.remoteAuthority, remoteAuthority)));
  }
  doGetLastActiveWindow(windows) {
    return getLastFocused(windows);
  }
  sendToFocused(channel, ...args) {
    const focusedWindow = this.getFocusedWindow() || this.getLastActiveWindow();
    focusedWindow?.sendWhenReady(channel, CancellationToken.None, ...args);
  }
  sendToOpeningWindow(channel, ...args) {
    this._register(Event.once(this.onDidSignalReadyWindow)((window) => {
      window.sendWhenReady(channel, CancellationToken.None, ...args);
    }));
  }
  sendToAll(channel, payload, windowIdsToIgnore) {
    for (const window of this.getWindows()) {
      if (windowIdsToIgnore && windowIdsToIgnore.indexOf(window.id) >= 0) {
        continue;
      }
      window.sendWhenReady(channel, CancellationToken.None, payload);
    }
  }
  getWindows() {
    return Array.from(this.windows.values());
  }
  getWindowCount() {
    return this.windows.size;
  }
  getWindowById(windowId) {
    return this.windows.get(windowId);
  }
  getWindowByWebContents(webContents) {
    const browserWindow = BrowserWindow.fromWebContents(webContents);
    if (!browserWindow) {
      return void 0;
    }
    const window = this.getWindowById(browserWindow.id);
    return window?.matches(webContents) ? window : void 0;
  }
};
WindowsMainService = __decorateClass([
  __decorateParam(4, ILogService),
  __decorateParam(5, ILoggerMainService),
  __decorateParam(6, IStateService),
  __decorateParam(7, IPolicyService),
  __decorateParam(8, IEnvironmentMainService),
  __decorateParam(9, IUserDataProfilesMainService),
  __decorateParam(10, ILifecycleMainService),
  __decorateParam(11, IBackupMainService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IWorkspacesHistoryMainService),
  __decorateParam(14, IWorkspacesManagementMainService),
  __decorateParam(15, IInstantiationService),
  __decorateParam(16, IDialogMainService),
  __decorateParam(17, IFileService),
  __decorateParam(18, IProtocolMainService),
  __decorateParam(19, IThemeMainService),
  __decorateParam(20, IAuxiliaryWindowsMainService),
  __decorateParam(21, ICSSDevelopmentService)
], WindowsMainService);
export {
  WindowsMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3dpbmRvd3MvZWxlY3Ryb24tbWFpbi93aW5kb3dzTWFpblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgeyBhcHAsIEJyb3dzZXJXaW5kb3csIFdlYkNvbnRlbnRzLCBzaGVsbCB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IGFkZFVOQ0hvc3RUb0FsbG93bGlzdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS91bmMuanMnO1xuaW1wb3J0IHsgaG9zdG5hbWUsIHJlbGVhc2UsIGFyY2ggfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSwgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGlzV2luZG93c0RyaXZlTGV0dGVyLCBwYXJzZUxpbmVBbmRDb2x1bW5Bd2FyZSwgc2FuaXRpemVGaWxlUGF0aCwgdG9TbGFzaGVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgeyBnZXRQYXRoTGFiZWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgam9pbiwgbm9ybWFsaXplLCBwb3NpeCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZ2V0TWFya3MsIG1hcmsgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0Vudmlyb25tZW50LCBpc01hY2ludG9zaCwgaXNXaW5kb3dzLCBPUyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGN3ZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UsIGlzRXF1YWwsIGlzRXF1YWxBdXRob3JpdHksIG5vcm1hbGl6ZVBhdGgsIG9yaWdpbmFsRlNQYXRoLCByZW1vdmVUcmFpbGluZ1BhdGhTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2V0TkxTTGFuZ3VhZ2UsIGdldE5MU01lc3NhZ2VzLCBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQmFja3VwTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9iYWNrdXAvZWxlY3Ryb24tbWFpbi9iYWNrdXAuanMnO1xuaW1wb3J0IHsgSUVtcHR5V2luZG93QmFja3VwSW5mbyB9IGZyb20gJy4uLy4uL2JhY2t1cC9ub2RlL2JhY2t1cC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2RpYWxvZ3MvZWxlY3Ryb24tbWFpbi9kaWFsb2dNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOYXRpdmVQYXJzZWRBcmdzIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2FyZ3YuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9lbGVjdHJvbi1tYWluL2Vudmlyb25tZW50TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmlsZVR5cGUsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9lbGVjdHJvbi1tYWluL2xpZmVjeWNsZU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJUHJvdG9jb2xNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3Byb3RvY29sL2VsZWN0cm9uLW1haW4vcHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgZ2V0UmVtb3RlQXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vcmVtb3RlL2NvbW1vbi9yZW1vdGVIb3N0cy5qcyc7XG5pbXBvcnQgeyBJU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RhdGUvbm9kZS9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBBZ2VudHNXaW5kb3dPcGVuU291cmNlLCBJQWRkUmVtb3ZlRm9sZGVyc1JlcXVlc3QsIElOYXRpdmVPcGVuRmlsZVJlcXVlc3QsIElOYXRpdmVXaW5kb3dDb25maWd1cmF0aW9uLCBJT3BlbkVtcHR5V2luZG93T3B0aW9ucywgSVBhdGgsIElQYXRoc1RvV2FpdEZvciwgaXNGaWxlVG9PcGVuLCBpc0ZvbGRlclRvT3BlbiwgaXNXb3Jrc3BhY2VUb09wZW4sIElXaW5kb3dPcGVuYWJsZSwgSVdpbmRvd1NldHRpbmdzIH0gZnJvbSAnLi4vLi4vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgQ29kZVdpbmRvdyB9IGZyb20gJy4vd2luZG93SW1wbC5qcyc7XG5pbXBvcnQgeyBJT3BlbkNvbmZpZ3VyYXRpb24sIElPcGVuRW1wdHlDb25maWd1cmF0aW9uLCBJV2luZG93c0NvdW50Q2hhbmdlZEV2ZW50LCBJV2luZG93c01haW5TZXJ2aWNlLCBPcGVuQ29udGV4dCwgZ2V0TGFzdEZvY3VzZWQgfSBmcm9tICcuL3dpbmRvd3MuanMnO1xuaW1wb3J0IHsgZmluZFdpbmRvd09uRXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoLCBmaW5kV2luZG93T25GaWxlLCBmaW5kV2luZG93T25Xb3Jrc3BhY2VPckZvbGRlciB9IGZyb20gJy4vd2luZG93c0ZpbmRlci5qcyc7XG5pbXBvcnQgeyBJV2luZG93U3RhdGUsIFdpbmRvd3NTdGF0ZUhhbmRsZXIgfSBmcm9tICcuL3dpbmRvd3NTdGF0ZUhhbmRsZXIuanMnO1xuaW1wb3J0IHsgSVJlY2VudCB9IGZyb20gJy4uLy4uL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZXMuanMnO1xuaW1wb3J0IHsgaGFzV29ya3NwYWNlRmlsZUV4dGVuc2lvbiwgSUFueVdvcmtzcGFjZUlkZW50aWZpZXIsIElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIGlzV29ya3NwYWNlSWRlbnRpZmllciwgSVdvcmtzcGFjZUlkZW50aWZpZXIsIHRvV29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUVtcHR5V29ya3NwYWNlSWRlbnRpZmllciwgZ2V0U2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgZ2V0V29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uL3dvcmtzcGFjZXMvbm9kZS93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlcy9lbGVjdHJvbi1tYWluL3dvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2VzL2VsZWN0cm9uLW1haW4vd29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29kZVdpbmRvdywgVW5sb2FkUmVhc29uIH0gZnJvbSAnLi4vLi4vd2luZG93L2VsZWN0cm9uLW1haW4vd2luZG93LmpzJztcbmltcG9ydCB7IElUaGVtZU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGhlbWUvZWxlY3Ryb24tbWFpbi90aGVtZU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zLCBJVGV4dEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVBvbGljeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wb2xpY3kvY29tbW9uL3BvbGljeS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2VsZWN0cm9uLW1haW4vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElMb2dnZXJNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9lbGVjdHJvbi1tYWluL2xvZ2dlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2F1eGlsaWFyeVdpbmRvdy9lbGVjdHJvbi1tYWluL2F1eGlsaWFyeVdpbmRvd3MuanMnO1xuaW1wb3J0IHsgSUF1eGlsaWFyeVdpbmRvdyB9IGZyb20gJy4uLy4uL2F1eGlsaWFyeVdpbmRvdy9lbGVjdHJvbi1tYWluL2F1eGlsaWFyeVdpbmRvdy5qcyc7XG5pbXBvcnQgeyBJQ1NTRGV2ZWxvcG1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY3NzRGV2L25vZGUvY3NzRGV2U2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5cbi8vI3JlZ2lvbiBIZWxwZXIgSW50ZXJmYWNlc1xuXG50eXBlIFJlc3RvcmVXaW5kb3dzU2V0dGluZyA9ICdwcmVzZXJ2ZScgfCAnYWxsJyB8ICdmb2xkZXJzJyB8ICdvbmUnIHwgJ25vbmUnO1xuXG5pbnRlcmZhY2UgSU9wZW5Ccm93c2VyV2luZG93T3B0aW9ucyB7XG5cdHJlYWRvbmx5IHVzZXJFbnY/OiBJUHJvY2Vzc0Vudmlyb25tZW50O1xuXHRyZWFkb25seSBjbGk/OiBOYXRpdmVQYXJzZWRBcmdzO1xuXG5cdHJlYWRvbmx5IHdvcmtzcGFjZT86IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXI7XG5cblx0cmVhZG9ubHkgcmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nO1xuXG5cdHJlYWRvbmx5IGluaXRpYWxTdGFydHVwPzogYm9vbGVhbjtcblxuXHRyZWFkb25seSBmaWxlc1RvT3Blbj86IElGaWxlc1RvT3BlbjtcblxuXHRyZWFkb25seSBmb3JjZU5ld1dpbmRvdz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGZvcmNlTmV3VGFiYmVkV2luZG93PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgd2luZG93VG9Vc2U/OiBJQ29kZVdpbmRvdztcblxuXHRyZWFkb25seSBlbXB0eVdpbmRvd0JhY2t1cEluZm8/OiBJRW1wdHlXaW5kb3dCYWNrdXBJbmZvO1xuXHRyZWFkb25seSBmb3JjZVByb2ZpbGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZvcmNlVGVtcFByb2ZpbGU/OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSVBhdGhSZXNvbHZlT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIEJ5IGRlZmF1bHQsIHJlc29sdmluZyBhIHBhdGggd2lsbCBjaGVja1xuXHQgKiBpZiB0aGUgcGF0aCBleGlzdHMuIFRoaXMgY2FuIGJlIGRpc2FibGVkXG5cdCAqIHdpdGggdGhpcyBmbGFnLlxuXHQgKi9cblx0cmVhZG9ubHkgaWdub3JlRmlsZU5vdEZvdW5kPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2lsbCByZWplY3QgYSBwYXRoIGlmIGl0IHBvaW50cyB0byBhIHRyYW5zaWVudFxuXHQgKiB3b3Jrc3BhY2UgYXMgaW5kaWNhdGVkIGJ5IGEgYHRyYW5zaWVudDogdHJ1ZWBcblx0ICogcHJvcGVydHkgaW4gdGhlIHdvcmtzcGFjZSBmaWxlLlxuXHQgKi9cblx0cmVhZG9ubHkgcmVqZWN0VHJhbnNpZW50V29ya3NwYWNlcz86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIElmIGVuYWJsZWQsIHdpbGwgcmVzb2x2ZSB0aGUgcGF0aCBsaW5lL2NvbHVtblxuXHQgKiBhd2FyZSBhbmQgcHJvcGVybHkgcmVtb3ZlIHRoaXMgaW5mb3JtYXRpb25cblx0ICogZnJvbSB0aGUgcmVzdWx0aW5nIGZpbGUgcGF0aC5cblx0ICovXG5cdHJlYWRvbmx5IGdvdG9MaW5lTW9kZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEZvcmNlcyB0byByZXNvbHZlIHRoZSBwcm92aWRlZCBwYXRoIGFzIHdvcmtzcGFjZVxuXHQgKiBmaWxlIGluc3RlYWQgb2Ygb3BlbmluZyBpdCBhcyBhIGZpbGUuXG5cdCAqL1xuXHRyZWFkb25seSBmb3JjZU9wZW5Xb3Jrc3BhY2VBc0ZpbGU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGUgcmVtb3RlQXV0aG9yaXR5IHRvIHVzZSBpZiB0aGUgVVJMIHRvIG9wZW4gaXNcblx0ICogbmVpdGhlciBgZmlsZWAgbm9yIGB2c2NvZGUtcmVtb3RlYC5cblx0ICovXG5cdHJlYWRvbmx5IHJlbW90ZUF1dGhvcml0eT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElGaWxlc1RvT3BlbiB7XG5cdHJlYWRvbmx5IHJlbW90ZUF1dGhvcml0eT86IHN0cmluZztcblxuXHRmaWxlc1RvT3Blbk9yQ3JlYXRlOiBJUGF0aFtdO1xuXHRmaWxlc1RvRGlmZjogSVBhdGhbXTtcblx0ZmlsZXNUb01lcmdlOiBJUGF0aFtdO1xuXG5cdGZpbGVzVG9XYWl0PzogSVBhdGhzVG9XYWl0Rm9yO1xufVxuXG5pbnRlcmZhY2UgSVBhdGhUb09wZW48VCA9IElFZGl0b3JPcHRpb25zPiBleHRlbmRzIElQYXRoPFQ+IHtcblxuXHQvKipcblx0ICogVGhlIHdvcmtzcGFjZSB0byBvcGVuXG5cdCAqL1xuXHRyZWFkb25seSB3b3Jrc3BhY2U/OiBJV29ya3NwYWNlSWRlbnRpZmllciB8IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBwYXRoIGlzIGNvbnNpZGVyZWQgdG8gYmUgdHJhbnNpZW50IG9yIG5vdFxuXHQgKiBmb3IgZXhhbXBsZSwgYSB0cmFuc2llbnQgd29ya3NwYWNlIHNob3VsZCBub3QgYWRkIHRvXG5cdCAqIHRoZSB3b3Jrc3BhY2VzIGhpc3RvcnkgYW5kIHNob3VsZCBuZXZlciByZXN0b3JlLlxuXHQgKi9cblx0cmVhZG9ubHkgdHJhbnNpZW50PzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVGhlIGJhY2t1cCBwYXRoIHRvIHVzZVxuXHQgKi9cblx0cmVhZG9ubHkgYmFja3VwUGF0aD86IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIHJlbW90ZSBhdXRob3JpdHkgZm9yIHRoZSBDb2RlIGluc3RhbmNlIHRvIG9wZW4uIFVuZGVmaW5lZCBpZiBub3QgcmVtb3RlLlxuXHQgKi9cblx0cmVhZG9ubHkgcmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBsYWJlbCBmb3IgdGhlIHJlY2VudCBoaXN0b3J5XG5cdCAqL1xuXHRsYWJlbD86IHN0cmluZztcbn1cblxuY29uc3QgRU1QVFlfV0lORE9XOiBJUGF0aFRvT3BlbiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cbmludGVyZmFjZSBJV29ya3NwYWNlUGF0aFRvT3BlbiBleHRlbmRzIElQYXRoVG9PcGVuIHtcblx0cmVhZG9ubHkgd29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllcjtcbn1cblxuaW50ZXJmYWNlIElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VQYXRoVG9PcGVuIGV4dGVuZHMgSVBhdGhUb09wZW4ge1xuXHRyZWFkb25seSB3b3Jrc3BhY2U6IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyO1xufVxuXG5mdW5jdGlvbiBpc1dvcmtzcGFjZVBhdGhUb09wZW4ocGF0aDogSVBhdGhUb09wZW4gfCB1bmRlZmluZWQpOiBwYXRoIGlzIElXb3Jrc3BhY2VQYXRoVG9PcGVuIHtcblx0cmV0dXJuIGlzV29ya3NwYWNlSWRlbnRpZmllcihwYXRoPy53b3Jrc3BhY2UpO1xufVxuXG5mdW5jdGlvbiBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZVBhdGhUb09wZW4ocGF0aDogSVBhdGhUb09wZW4gfCB1bmRlZmluZWQpOiBwYXRoIGlzIElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VQYXRoVG9PcGVuIHtcblx0cmV0dXJuIGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcihwYXRoPy53b3Jrc3BhY2UpO1xufVxuXG4vLyNlbmRyZWdpb25cblxuZXhwb3J0IGNsYXNzIFdpbmRvd3NNYWluU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV2luZG93c01haW5TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE9wZW5XaW5kb3cgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ29kZVdpbmRvdz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkT3BlbldpbmRvdyA9IHRoaXMuX29uRGlkT3BlbldpbmRvdy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNpZ25hbFJlYWR5V2luZG93ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNvZGVXaW5kb3c+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNpZ25hbFJlYWR5V2luZG93ID0gdGhpcy5fb25EaWRTaWduYWxSZWFkeVdpbmRvdy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERlc3Ryb3lXaW5kb3cgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ29kZVdpbmRvdz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGVzdHJveVdpbmRvdyA9IHRoaXMuX29uRGlkRGVzdHJveVdpbmRvdy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVdpbmRvd3NDb3VudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElXaW5kb3dzQ291bnRDaGFuZ2VkRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVdpbmRvd3NDb3VudCA9IHRoaXMuX29uRGlkQ2hhbmdlV2luZG93c0NvdW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTWF4aW1pemVXaW5kb3cgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ29kZVdpbmRvdz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTWF4aW1pemVXaW5kb3cgPSB0aGlzLl9vbkRpZE1heGltaXplV2luZG93LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVW5tYXhpbWl6ZVdpbmRvdyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDb2RlV2luZG93PigpKTtcblx0cmVhZG9ubHkgb25EaWRVbm1heGltaXplV2luZG93ID0gdGhpcy5fb25EaWRVbm1heGltaXplV2luZG93LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRnVsbFNjcmVlbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgd2luZG93OiBJQ29kZVdpbmRvdzsgZnVsbHNjcmVlbjogYm9vbGVhbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGdWxsU2NyZWVuID0gdGhpcy5fb25EaWRDaGFuZ2VGdWxsU2NyZWVuLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVHJpZ2dlclN5c3RlbUNvbnRleHRNZW51ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyB3aW5kb3c6IElDb2RlV2luZG93OyB4OiBudW1iZXI7IHk6IG51bWJlciB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRUcmlnZ2VyU3lzdGVtQ29udGV4dE1lbnUgPSB0aGlzLl9vbkRpZFRyaWdnZXJTeXN0ZW1Db250ZXh0TWVudS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHdpbmRvd3MgPSBuZXcgTWFwPG51bWJlciwgSUNvZGVXaW5kb3c+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSB3aW5kb3dzU3RhdGVIYW5kbGVyOiBXaW5kb3dzU3RhdGVIYW5kbGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWFjaGluZUlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzcW1JZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGV2RGV2aWNlSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGluaXRpYWxVc2VyRW52OiBJUHJvY2Vzc0Vudmlyb25tZW50LFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTG9nZ2VyTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyTWFpblNlcnZpY2UsXG5cdFx0QElTdGF0ZVNlcnZpY2Ugc3RhdGVTZXJ2aWNlOiBJU3RhdGVTZXJ2aWNlLFxuXHRcdEBJUG9saWN5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBvbGljeVNlcnZpY2U6IElQb2xpY3lTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50TWFpblNlcnZpY2U6IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVNYWluU2VydmljZTogSUxpZmVjeWNsZU1haW5TZXJ2aWNlLFxuXHRcdEBJQmFja3VwTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBiYWNrdXBNYWluU2VydmljZTogSUJhY2t1cE1haW5TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2U6IElXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2U6IElXb3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dNYWluU2VydmljZTogSURpYWxvZ01haW5TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvdG9jb2xNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb3RvY29sTWFpblNlcnZpY2U6IElQcm90b2NvbE1haW5TZXJ2aWNlLFxuXHRcdEBJVGhlbWVNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lTWFpblNlcnZpY2U6IElUaGVtZU1haW5TZXJ2aWNlLFxuXHRcdEBJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlOiBJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLFxuXHRcdEBJQ1NTRGV2ZWxvcG1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY3NzRGV2ZWxvcG1lbnRTZXJ2aWNlOiBJQ1NTRGV2ZWxvcG1lbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLndpbmRvd3NTdGF0ZUhhbmRsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgV2luZG93c1N0YXRlSGFuZGxlcih0aGlzLCBzdGF0ZVNlcnZpY2UsIHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIFNpZ25hbCBhIHdpbmRvdyBpcyByZWFkeSBhZnRlciBoYXZpbmcgZW50ZXJlZCBhIHdvcmtzcGFjZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS5vbkRpZEVudGVyV29ya3NwYWNlKGV2ZW50ID0+IHRoaXMuX29uRGlkU2lnbmFsUmVhZHlXaW5kb3cuZmlyZShldmVudC53aW5kb3cpKSk7XG5cblx0XHQvLyBVcGRhdGUgdmFsaWQgcm9vdHMgaW4gcHJvdG9jb2wgc2VydmljZSBmb3IgZXh0ZW5zaW9uIGRldiB3aW5kb3dzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZFNpZ25hbFJlYWR5V2luZG93KHdpbmRvdyA9PiB7XG5cdFx0XHRpZiAod2luZG93LmNvbmZpZz8uZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoIHx8IHdpbmRvdy5jb25maWc/LmV4dGVuc2lvblRlc3RzUGF0aCkge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmFueSh3aW5kb3cub25EaWRDbG9zZSwgd2luZG93Lm9uRGlkRGVzdHJveSkoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cblx0XHRcdFx0Ly8gQWxsb3cgYWNjZXNzIHRvIGV4dGVuc2lvbiBkZXZlbG9wbWVudCBwYXRoXG5cdFx0XHRcdGlmICh3aW5kb3cuY29uZmlnLmV4dGVuc2lvbkRldmVsb3BtZW50UGF0aCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoIG9mIHdpbmRvdy5jb25maWcuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoKSB7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5wcm90b2NvbE1haW5TZXJ2aWNlLmFkZFZhbGlkRmlsZVJvb3QoZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQWxsb3cgYWNjZXNzIHRvIGV4dGVuc2lvbiB0ZXN0cyBwYXRoXG5cdFx0XHRcdGlmICh3aW5kb3cuY29uZmlnLmV4dGVuc2lvblRlc3RzUGF0aCkge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnByb3RvY29sTWFpblNlcnZpY2UuYWRkVmFsaWRGaWxlUm9vdCh3aW5kb3cuY29uZmlnLmV4dGVuc2lvblRlc3RzUGF0aCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3BlbkVtcHR5V2luZG93KG9wZW5Db25maWc6IElPcGVuRW1wdHlDb25maWd1cmF0aW9uLCBvcHRpb25zPzogSU9wZW5FbXB0eVdpbmRvd09wdGlvbnMpOiBQcm9taXNlPElDb2RlV2luZG93W10+IHtcblx0XHRjb25zdCBjbGkgPSB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncztcblx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSBvcHRpb25zPy5yZW1vdGVBdXRob3JpdHkgfHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGZvcmNlRW1wdHkgPSB0cnVlO1xuXHRcdGNvbnN0IGZvcmNlUmV1c2VXaW5kb3cgPSBvcHRpb25zPy5mb3JjZVJldXNlV2luZG93O1xuXHRcdGNvbnN0IGZvcmNlTmV3V2luZG93ID0gIWZvcmNlUmV1c2VXaW5kb3c7XG5cblx0XHRyZXR1cm4gdGhpcy5vcGVuKHsgLi4ub3BlbkNvbmZpZywgY2xpLCBmb3JjZUVtcHR5LCBmb3JjZU5ld1dpbmRvdywgZm9yY2VSZXVzZVdpbmRvdywgcmVtb3RlQXV0aG9yaXR5LCBmb3JjZVRlbXBQcm9maWxlOiBvcHRpb25zPy5mb3JjZVRlbXBQcm9maWxlLCBmb3JjZVByb2ZpbGU6IG9wdGlvbnM/LmZvcmNlUHJvZmlsZSB9KTtcblx0fVxuXG5cdG9wZW5FeGlzdGluZ1dpbmRvdyh3aW5kb3c6IElDb2RlV2luZG93LCBvcGVuQ29uZmlnOiBJT3BlbkNvbmZpZ3VyYXRpb24pOiB2b2lkIHtcblxuXHRcdC8vIEJyaW5nIHdpbmRvdyB0byBmcm9udFxuXHRcdHdpbmRvdy5mb2N1cygpO1xuXG5cdFx0Ly8gSGFuZGxlIGA8YXBwPiAtLXdhaXRgXG5cdFx0dGhpcy5oYW5kbGVXYWl0TWFya2VyRmlsZShvcGVuQ29uZmlnLCBbd2luZG93XSk7XG5cblx0XHQvLyBIYW5kbGUgYDxhcHA+IGNoYXRgXG5cdFx0dGhpcy5oYW5kbGVDaGF0UmVxdWVzdChvcGVuQ29uZmlnLCBbd2luZG93XSk7XG5cdH1cblxuXHRhc3luYyBvcGVuQWdlbnRzV2luZG93KG9wZW5Db25maWc6IElPcGVuQ29uZmlndXJhdGlvbiwgZm9sZGVyVXJpPzogVVJJLCBzZXNzaW9uUmVzb3VyY2U/OiBVUkksIHNvdXJjZT86IEFnZW50c1dpbmRvd09wZW5Tb3VyY2UpOiBQcm9taXNlPElDb2RlV2luZG93W10+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3dpbmRvd3NNYW5hZ2VyI29wZW5BZ2VudHNXaW5kb3cnKTtcblxuXHRcdC8vIE9wZW4gaW4gYSBuZXcgYnJvd3NlciB3aW5kb3cgd2l0aCB0aGUgYWdlbnQgc2Vzc2lvbnMgd29ya3NwYWNlXG5cdFx0Y29uc3Qgd2luZG93cyA9IGF3YWl0IHRoaXMub3Blbihhd2FpdCB0aGlzLmVuc3VyZUFnZW50c1dpbmRvdyhvcGVuQ29uZmlnKSk7XG5cblx0XHQvLyBTaW5nbGUgSVBDIGNhcnJ5aW5nIHRoZSBmb2xkZXIgdG8gcHJlLXNlbGVjdCBhbmQgYW4gb3B0aW9uYWwgZXhpc3RpbmctXG5cdFx0Ly8gc2Vzc2lvbiByZXNvdXJjZSB0byBvcGVuLiBUaGUgaGFuZGxlciBpbiB0aGUgYWdlbnRzIHdpbmRvdyBzZXF1ZW5jZXNcblx0XHQvLyB0aGVtIChmb2xkZXIgXHUyMTkyIG9wZW4gc2Vzc2lvbikgc28gdGhlIHNlc3Npb24tb3BlbiBkb2Vzbid0IHJhY2UgdGhlXG5cdFx0Ly8gZm9sZGVyLXJlc29sdmUuXG5cdFx0aWYgKHdpbmRvd3MubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgb3BlblNvdXJjZSA9IHNvdXJjZSA/PyAob3BlbkNvbmZpZy5jbGkuYWdlbnRzID8gQWdlbnRzV2luZG93T3BlblNvdXJjZS5Db21tYW5kTGluZSA6IEFnZW50c1dpbmRvd09wZW5Tb3VyY2UuVW5rbm93bik7XG5cdFx0XHR3aW5kb3dzWzBdLnNlbmRXaGVuUmVhZHkoJ3ZzY29kZTpzZWxlY3RBZ2VudHNGb2xkZXInLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCBmb2xkZXJVcmk/LnRvSlNPTigpLCBzZXNzaW9uUmVzb3VyY2U/LnRvSlNPTigpLCBvcGVuU291cmNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gd2luZG93cztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZW5zdXJlQWdlbnRzV2luZG93KG9wZW5Db25maWc6IElPcGVuQ29uZmlndXJhdGlvbik6IFByb21pc2U8SU9wZW5Db25maWd1cmF0aW9uPiB7XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uc1dvcmtzcGFjZVVyaSA9IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hZ2VudFNlc3Npb25zV29ya3NwYWNlO1xuXHRcdGlmICghYWdlbnRTZXNzaW9uc1dvcmtzcGFjZVVyaSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBZ2VudHMgd29ya3NwYWNlIGlzIG5vdCBjb25maWd1cmVkJyk7XG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIHRoZSB3b3Jrc3BhY2UgZmlsZSBleGlzdHNcblx0XHRjb25zdCB3b3Jrc3BhY2VFeGlzdHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhhZ2VudFNlc3Npb25zV29ya3NwYWNlVXJpKTtcblx0XHRpZiAoIXdvcmtzcGFjZUV4aXN0cykge1xuXHRcdFx0Y29uc3QgZW1wdHlXb3Jrc3BhY2VDb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoeyBmb2xkZXJzOiBbXSB9LCBudWxsLCAnXFx0Jyk7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShhZ2VudFNlc3Npb25zV29ya3NwYWNlVXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGVtcHR5V29ya3NwYWNlQ29udGVudCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR1cmlzVG9PcGVuOiBbeyB3b3Jrc3BhY2VVcmk6IGFnZW50U2Vzc2lvbnNXb3Jrc3BhY2VVcmkgfV0sXG5cdFx0XHR1c2VyRW52OiBvcGVuQ29uZmlnLnVzZXJFbnYsXG5cdFx0XHRjbGk6IG9wZW5Db25maWcuY2xpLFxuXHRcdFx0bm9SZWNlbnRFbnRyeTogdHJ1ZSxcblx0XHRcdGNvbnRleHQ6IG9wZW5Db25maWcuY29udGV4dCxcblx0XHRcdGNvbnRleHRXaW5kb3dJZDogb3BlbkNvbmZpZy5jb250ZXh0V2luZG93SWQsXG5cdFx0XHRpbml0aWFsU3RhcnR1cDogb3BlbkNvbmZpZy5pbml0aWFsU3RhcnR1cCxcblx0XHRcdGZvcmNlTmV3V2luZG93OiB0cnVlLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBvcGVuKG9wZW5Db25maWc6IElPcGVuQ29uZmlndXJhdGlvbik6IFByb21pc2U8SUNvZGVXaW5kb3dbXT4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnd2luZG93c01hbmFnZXIjb3BlbicpO1xuXG5cdFx0Ly8gTWFrZSBzdXJlIGFkZE1vZGUvcmVtb3ZlTW9kZSBpcyBvbmx5IGVuYWJsZWQgaWYgd2UgaGF2ZSBhbiBhY3RpdmUgd2luZG93XG5cdFx0aWYgKChvcGVuQ29uZmlnLmFkZE1vZGUgfHwgb3BlbkNvbmZpZy5yZW1vdmVNb2RlKSAmJiAob3BlbkNvbmZpZy5pbml0aWFsU3RhcnR1cCB8fCAhdGhpcy5nZXRMYXN0QWN0aXZlV2luZG93KCkpKSB7XG5cdFx0XHRvcGVuQ29uZmlnLmFkZE1vZGUgPSBmYWxzZTtcblx0XHRcdG9wZW5Db25maWcucmVtb3ZlTW9kZSA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvbGRlcnNUb0FkZDogSVNpbmdsZUZvbGRlcldvcmtzcGFjZVBhdGhUb09wZW5bXSA9IFtdO1xuXHRcdGNvbnN0IGZvbGRlcnNUb1JlbW92ZTogSVNpbmdsZUZvbGRlcldvcmtzcGFjZVBhdGhUb09wZW5bXSA9IFtdO1xuXG5cdFx0Y29uc3QgZm9sZGVyc1RvT3BlbjogSVNpbmdsZUZvbGRlcldvcmtzcGFjZVBhdGhUb09wZW5bXSA9IFtdO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlc1RvT3BlbjogSVdvcmtzcGFjZVBhdGhUb09wZW5bXSA9IFtdO1xuXHRcdGNvbnN0IHVudGl0bGVkV29ya3NwYWNlc1RvUmVzdG9yZTogSVdvcmtzcGFjZVBhdGhUb09wZW5bXSA9IFtdO1xuXG5cdFx0Y29uc3QgZW1wdHlXaW5kb3dzV2l0aEJhY2t1cHNUb1Jlc3RvcmU6IElFbXB0eVdpbmRvd0JhY2t1cEluZm9bXSA9IFtdO1xuXG5cdFx0bGV0IGZpbGVzVG9PcGVuOiBJRmlsZXNUb09wZW4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IG1heWJlT3BlbkVtcHR5V2luZG93ID0gZmFsc2U7XG5cblx0XHQvLyBJZGVudGlmeSB0aGluZ3MgdG8gb3BlbiBmcm9tIG9wZW4gY29uZmlnXG5cdFx0Y29uc3QgcGF0aHNUb09wZW4gPSBhd2FpdCB0aGlzLmdldFBhdGhzVG9PcGVuKG9wZW5Db25maWcpO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnd2luZG93c01hbmFnZXIjb3BlbiBwYXRoc1RvT3BlbicsIHBhdGhzVG9PcGVuKTtcblx0XHRmb3IgKGNvbnN0IHBhdGggb2YgcGF0aHNUb09wZW4pIHtcblx0XHRcdGlmIChpc1NpbmdsZUZvbGRlcldvcmtzcGFjZVBhdGhUb09wZW4ocGF0aCkpIHtcblx0XHRcdFx0aWYgKG9wZW5Db25maWcuYWRkTW9kZSkge1xuXHRcdFx0XHRcdC8vIFdoZW4gcnVuIHdpdGggLS1hZGQsIHRha2UgdGhlIGZvbGRlcnMgdGhhdCBhcmUgdG8gYmUgb3BlbmVkIGFzXG5cdFx0XHRcdFx0Ly8gZm9sZGVycyB0aGF0IHNob3VsZCBiZSBhZGRlZCB0byB0aGUgY3VycmVudGx5IGFjdGl2ZSB3aW5kb3cuXG5cdFx0XHRcdFx0Zm9sZGVyc1RvQWRkLnB1c2gocGF0aCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAob3BlbkNvbmZpZy5yZW1vdmVNb2RlKSB7XG5cdFx0XHRcdFx0Ly8gV2hlbiBydW4gd2l0aCAtLXJlbW92ZSwgdGFrZSB0aGUgZm9sZGVycyB0aGF0IGFyZSB0byBiZSBvcGVuZWQgYXNcblx0XHRcdFx0XHQvLyBmb2xkZXJzIHRoYXQgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSB0aGUgY3VycmVudGx5IGFjdGl2ZSB3aW5kb3cuXG5cdFx0XHRcdFx0Zm9sZGVyc1RvUmVtb3ZlLnB1c2gocGF0aCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Zm9sZGVyc1RvT3Blbi5wdXNoKHBhdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGlzV29ya3NwYWNlUGF0aFRvT3BlbihwYXRoKSkge1xuXHRcdFx0XHR3b3Jrc3BhY2VzVG9PcGVuLnB1c2gocGF0aCk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhdGguZmlsZVVyaSkge1xuXHRcdFx0XHRpZiAoIWZpbGVzVG9PcGVuKSB7XG5cdFx0XHRcdFx0ZmlsZXNUb09wZW4gPSB7IGZpbGVzVG9PcGVuT3JDcmVhdGU6IFtdLCBmaWxlc1RvRGlmZjogW10sIGZpbGVzVG9NZXJnZTogW10sIHJlbW90ZUF1dGhvcml0eTogcGF0aC5yZW1vdGVBdXRob3JpdHkgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmaWxlc1RvT3Blbi5maWxlc1RvT3Blbk9yQ3JlYXRlLnB1c2gocGF0aCk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhdGguYmFja3VwUGF0aCkge1xuXHRcdFx0XHRlbXB0eVdpbmRvd3NXaXRoQmFja3Vwc1RvUmVzdG9yZS5wdXNoKHsgYmFja3VwRm9sZGVyOiBiYXNlbmFtZShwYXRoLmJhY2t1cFBhdGgpLCByZW1vdGVBdXRob3JpdHk6IHBhdGgucmVtb3RlQXV0aG9yaXR5IH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWF5YmVPcGVuRW1wdHlXaW5kb3cgPSB0cnVlOyAvLyBkZXBlbmRzIG9uIG90aGVyIHBhcmFtZXRlcnMgc3VjaCBhcyBgZm9yY2VFbXB0eWAgYW5kIGhvdyBtYW55IHdpbmRvd3MgaGF2ZSBvcGVuZWQgYWxyZWFkeVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFdoZW4gcnVuIHdpdGggLS1kaWZmLCB0YWtlIHRoZSBmaXJzdCAyIGZpbGVzIHRvIG9wZW4gYXMgZmlsZXMgdG8gZGlmZlxuXHRcdGlmIChvcGVuQ29uZmlnLmRpZmZNb2RlICYmIGZpbGVzVG9PcGVuICYmIGZpbGVzVG9PcGVuLmZpbGVzVG9PcGVuT3JDcmVhdGUubGVuZ3RoID49IDIpIHtcblx0XHRcdGZpbGVzVG9PcGVuLmZpbGVzVG9EaWZmID0gZmlsZXNUb09wZW4uZmlsZXNUb09wZW5PckNyZWF0ZS5zbGljZSgwLCAyKTtcblx0XHRcdGZpbGVzVG9PcGVuLmZpbGVzVG9PcGVuT3JDcmVhdGUgPSBbXTtcblx0XHR9XG5cblx0XHQvLyBXaGVuIHJ1biB3aXRoIC0tbWVyZ2UsIHRha2UgdGhlIGZpcnN0IDQgZmlsZXMgdG8gb3BlbiBhcyBmaWxlcyB0byBtZXJnZVxuXHRcdGlmIChvcGVuQ29uZmlnLm1lcmdlTW9kZSAmJiBmaWxlc1RvT3BlbiAmJiBmaWxlc1RvT3Blbi5maWxlc1RvT3Blbk9yQ3JlYXRlLmxlbmd0aCA9PT0gNCkge1xuXHRcdFx0ZmlsZXNUb09wZW4uZmlsZXNUb01lcmdlID0gZmlsZXNUb09wZW4uZmlsZXNUb09wZW5PckNyZWF0ZS5zbGljZSgwLCA0KTtcblx0XHRcdGZpbGVzVG9PcGVuLmZpbGVzVG9PcGVuT3JDcmVhdGUgPSBbXTtcblx0XHRcdGZpbGVzVG9PcGVuLmZpbGVzVG9EaWZmID0gW107XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiBydW4gd2l0aCAtLXdhaXQsIG1ha2Ugc3VyZSB3ZSBrZWVwIHRoZSBwYXRocyB0byB3YWl0IGZvclxuXHRcdGlmIChmaWxlc1RvT3BlbiAmJiBvcGVuQ29uZmlnLndhaXRNYXJrZXJGaWxlVVJJKSB7XG5cdFx0XHRmaWxlc1RvT3Blbi5maWxlc1RvV2FpdCA9IHsgcGF0aHM6IGNvYWxlc2NlKFsuLi5maWxlc1RvT3Blbi5maWxlc1RvRGlmZiwgZmlsZXNUb09wZW4uZmlsZXNUb01lcmdlWzNdIC8qIFszXSBpcyB0aGUgcmVzdWx0aW5nIG1lcmdlIGZpbGUgKi8sIC4uLmZpbGVzVG9PcGVuLmZpbGVzVG9PcGVuT3JDcmVhdGVdKSwgd2FpdE1hcmtlckZpbGVVcmk6IG9wZW5Db25maWcud2FpdE1hcmtlckZpbGVVUkkgfTtcblx0XHR9XG5cblx0XHQvLyBUaGVzZSBhcmUgd2luZG93cyB0byByZXN0b3JlIGJlY2F1c2Ugb2YgaG90LWV4aXQgb3IgZnJvbSBwcmV2aW91cyBzZXNzaW9uIChvbmx5IHBlcmZvcm1lZCBvbmNlIG9uIHN0YXJ0dXAhKVxuXHRcdGlmIChvcGVuQ29uZmlnLmluaXRpYWxTdGFydHVwKSB7XG5cblx0XHRcdC8vIFVudGl0bGVkIHdvcmtzcGFjZXMgYXJlIGFsd2F5cyByZXN0b3JlZFxuXHRcdFx0dW50aXRsZWRXb3Jrc3BhY2VzVG9SZXN0b3JlLnB1c2goLi4udGhpcy53b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLmdldFVudGl0bGVkV29ya3NwYWNlcygpKTtcblx0XHRcdHdvcmtzcGFjZXNUb09wZW4ucHVzaCguLi51bnRpdGxlZFdvcmtzcGFjZXNUb1Jlc3RvcmUpO1xuXG5cdFx0XHQvLyBFbXB0eSB3aW5kb3dzIHdpdGggYmFja3VwcyBhcmUgYWx3YXlzIHJlc3RvcmVkXG5cdFx0XHRlbXB0eVdpbmRvd3NXaXRoQmFja3Vwc1RvUmVzdG9yZS5wdXNoKC4uLnRoaXMuYmFja3VwTWFpblNlcnZpY2UuZ2V0RW1wdHlXaW5kb3dCYWNrdXBzKCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlbXB0eVdpbmRvd3NXaXRoQmFja3Vwc1RvUmVzdG9yZS5sZW5ndGggPSAwO1xuXHRcdH1cblxuXHRcdC8vIE9wZW4gYmFzZWQgb24gY29uZmlnXG5cdFx0Y29uc3QgeyB3aW5kb3dzOiB1c2VkV2luZG93cywgZmlsZXNPcGVuZWRJbldpbmRvdyB9ID0gYXdhaXQgdGhpcy5kb09wZW4ob3BlbkNvbmZpZywgd29ya3NwYWNlc1RvT3BlbiwgZm9sZGVyc1RvT3BlbiwgZW1wdHlXaW5kb3dzV2l0aEJhY2t1cHNUb1Jlc3RvcmUsIG1heWJlT3BlbkVtcHR5V2luZG93LCBmaWxlc1RvT3BlbiwgZm9sZGVyc1RvQWRkLCBmb2xkZXJzVG9SZW1vdmUpO1xuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGB3aW5kb3dzTWFuYWdlciNvcGVuIHVzZWQgd2luZG93IGNvdW50ICR7dXNlZFdpbmRvd3MubGVuZ3RofSAod29ya3NwYWNlc1RvT3BlbjogJHt3b3Jrc3BhY2VzVG9PcGVuLmxlbmd0aH0sIGZvbGRlcnNUb09wZW46ICR7Zm9sZGVyc1RvT3Blbi5sZW5ndGh9LCBlbXB0eVRvUmVzdG9yZTogJHtlbXB0eVdpbmRvd3NXaXRoQmFja3Vwc1RvUmVzdG9yZS5sZW5ndGh9LCBtYXliZU9wZW5FbXB0eVdpbmRvdzogJHttYXliZU9wZW5FbXB0eVdpbmRvd30pYCk7XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gcGFzcyBmb2N1cyB0byB0aGUgbW9zdCByZWxldmFudCBvZiB0aGUgd2luZG93cyBpZiB3ZSBvcGVuIG11bHRpcGxlXG5cdFx0aWYgKHVzZWRXaW5kb3dzLmxlbmd0aCA+IDEpIHtcblxuXHRcdFx0Ly8gMS4pIGZvY3VzIHdpbmRvdyB3ZSBvcGVuZWQgZmlsZXMgaW4gYWx3YXlzIHdpdGggaGlnaGVzdCBwcmlvcml0eVxuXHRcdFx0aWYgKGZpbGVzT3BlbmVkSW5XaW5kb3cpIHtcblx0XHRcdFx0ZmlsZXNPcGVuZWRJbldpbmRvdy5mb2N1cygpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdGhlcndpc2UsIGZpbmQgYSBnb29kIHdpbmRvdyBiYXNlZCBvbiBvcGVuIHBhcmFtc1xuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGZvY3VzTGFzdEFjdGl2ZSA9IHRoaXMud2luZG93c1N0YXRlSGFuZGxlci5zdGF0ZS5sYXN0QWN0aXZlV2luZG93ICYmICFvcGVuQ29uZmlnLmZvcmNlRW1wdHkgJiYgIW9wZW5Db25maWcuY2xpLl8ubGVuZ3RoICYmICFvcGVuQ29uZmlnLmNsaVsnZmlsZS11cmknXSAmJiAhb3BlbkNvbmZpZy5jbGlbJ2ZvbGRlci11cmknXSAmJiAhb3BlbkNvbmZpZy51cmlzVG9PcGVuPy5sZW5ndGg7XG5cdFx0XHRcdGxldCBmb2N1c0xhc3RPcGVuZWQgPSB0cnVlO1xuXHRcdFx0XHRsZXQgZm9jdXNMYXN0V2luZG93ID0gdHJ1ZTtcblxuXHRcdFx0XHQvLyAyLikgZm9jdXMgbGFzdCBhY3RpdmUgd2luZG93IGlmIHdlIGFyZSBub3QgaW5zdHJ1Y3RlZCB0byBvcGVuIGFueSBwYXRoc1xuXHRcdFx0XHRpZiAoZm9jdXNMYXN0QWN0aXZlKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGFzdEFjdGl2ZVdpbmRvdyA9IHVzZWRXaW5kb3dzLmZpbHRlcih3aW5kb3cgPT4gdGhpcy53aW5kb3dzU3RhdGVIYW5kbGVyLnN0YXRlLmxhc3RBY3RpdmVXaW5kb3cgJiYgd2luZG93LmJhY2t1cFBhdGggPT09IHRoaXMud2luZG93c1N0YXRlSGFuZGxlci5zdGF0ZS5sYXN0QWN0aXZlV2luZG93LmJhY2t1cFBhdGgpO1xuXHRcdFx0XHRcdGlmIChsYXN0QWN0aXZlV2luZG93Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0bGFzdEFjdGl2ZVdpbmRvd1swXS5mb2N1cygpO1xuXHRcdFx0XHRcdFx0Zm9jdXNMYXN0T3BlbmVkID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRmb2N1c0xhc3RXaW5kb3cgPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyAzLikgaWYgaW5zdHJ1Y3RlZCB0byBvcGVuIHBhdGhzLCBmb2N1cyBsYXN0IHdpbmRvdyB3aGljaCBpcyBub3QgcmVzdG9yZWRcblx0XHRcdFx0aWYgKGZvY3VzTGFzdE9wZW5lZCkge1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSB1c2VkV2luZG93cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdXNlZFdpbmRvdyA9IHVzZWRXaW5kb3dzW2ldO1xuXHRcdFx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdFx0XHQodXNlZFdpbmRvdy5vcGVuZWRXb3Jrc3BhY2UgJiYgdW50aXRsZWRXb3Jrc3BhY2VzVG9SZXN0b3JlLnNvbWUod29ya3NwYWNlID0+IHVzZWRXaW5kb3cub3BlbmVkV29ya3NwYWNlICYmIHdvcmtzcGFjZS53b3Jrc3BhY2UuaWQgPT09IHVzZWRXaW5kb3cub3BlbmVkV29ya3NwYWNlLmlkKSkgfHxcdC8vIHNraXAgb3ZlciByZXN0b3JlZCB3b3Jrc3BhY2Vcblx0XHRcdFx0XHRcdFx0KHVzZWRXaW5kb3cuYmFja3VwUGF0aCAmJiBlbXB0eVdpbmRvd3NXaXRoQmFja3Vwc1RvUmVzdG9yZS5zb21lKGVtcHR5ID0+IHVzZWRXaW5kb3cuYmFja3VwUGF0aCAmJiBlbXB0eS5iYWNrdXBGb2xkZXIgPT09IGJhc2VuYW1lKHVzZWRXaW5kb3cuYmFja3VwUGF0aCkpKVx0XHRcdFx0XHRcdFx0Ly8gc2tpcCBvdmVyIHJlc3RvcmVkIGVtcHR5IHdpbmRvd1xuXHRcdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR1c2VkV2luZG93LmZvY3VzKCk7XG5cdFx0XHRcdFx0XHRmb2N1c0xhc3RXaW5kb3cgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIDQuKSBmaW5hbGx5LCBhbHdheXMgZW5zdXJlIHRvIGhhdmUgYXQgbGVhc3QgbGFzdCB1c2VkIHdpbmRvdyBmb2N1c2VkXG5cdFx0XHRcdGlmIChmb2N1c0xhc3RXaW5kb3cpIHtcblx0XHRcdFx0XHR1c2VkV2luZG93c1t1c2VkV2luZG93cy5sZW5ndGggLSAxXS5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVtZW1iZXIgaW4gcmVjZW50IGRvY3VtZW50IGxpc3QgKHVubGVzcyB0aGlzIG9wZW5zIGZvciBleHRlbnNpb24gZGV2ZWxvcG1lbnQpXG5cdFx0Ly8gQWxzbyBkbyBub3QgYWRkIHBhdGhzIHdoZW4gZmlsZXMgYXJlIG9wZW5lZCBmb3IgZGlmZmluZyBvciBtZXJnaW5nLCBvbmx5IGlmIG9wZW5lZCBpbmRpdmlkdWFsbHlcblx0XHRjb25zdCBpc0RpZmYgPSBmaWxlc1RvT3BlbiAmJiBmaWxlc1RvT3Blbi5maWxlc1RvRGlmZi5sZW5ndGggPiAwO1xuXHRcdGNvbnN0IGlzTWVyZ2UgPSBmaWxlc1RvT3BlbiAmJiBmaWxlc1RvT3Blbi5maWxlc1RvTWVyZ2UubGVuZ3RoID4gMDtcblx0XHRpZiAoIXVzZWRXaW5kb3dzLnNvbWUod2luZG93ID0+IHdpbmRvdy5pc0V4dGVuc2lvbkRldmVsb3BtZW50SG9zdCkgJiYgIWlzRGlmZiAmJiAhaXNNZXJnZSAmJiAhb3BlbkNvbmZpZy5ub1JlY2VudEVudHJ5KSB7XG5cdFx0XHRjb25zdCByZWNlbnRzOiBJUmVjZW50W10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgcGF0aFRvT3BlbiBvZiBwYXRoc1RvT3Blbikge1xuXHRcdFx0XHRpZiAoaXNXb3Jrc3BhY2VQYXRoVG9PcGVuKHBhdGhUb09wZW4pICYmICFwYXRoVG9PcGVuLnRyYW5zaWVudCAvKiBuZXZlciBhZGQgdHJhbnNpZW50IHdvcmtzcGFjZXMgdG8gaGlzdG9yeSAqLykge1xuXHRcdFx0XHRcdHJlY2VudHMucHVzaCh7IGxhYmVsOiBwYXRoVG9PcGVuLmxhYmVsLCB3b3Jrc3BhY2U6IHBhdGhUb09wZW4ud29ya3NwYWNlLCByZW1vdGVBdXRob3JpdHk6IHBhdGhUb09wZW4ucmVtb3RlQXV0aG9yaXR5IH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlUGF0aFRvT3BlbihwYXRoVG9PcGVuKSkge1xuXHRcdFx0XHRcdHJlY2VudHMucHVzaCh7IGxhYmVsOiBwYXRoVG9PcGVuLmxhYmVsLCBmb2xkZXJVcmk6IHBhdGhUb09wZW4ud29ya3NwYWNlLnVyaSwgcmVtb3RlQXV0aG9yaXR5OiBwYXRoVG9PcGVuLnJlbW90ZUF1dGhvcml0eSB9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChwYXRoVG9PcGVuLmZpbGVVcmkpIHtcblx0XHRcdFx0XHRyZWNlbnRzLnB1c2goeyBsYWJlbDogcGF0aFRvT3Blbi5sYWJlbCwgZmlsZVVyaTogcGF0aFRvT3Blbi5maWxlVXJpLCByZW1vdGVBdXRob3JpdHk6IHBhdGhUb09wZW4ucmVtb3RlQXV0aG9yaXR5IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMud29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZS5hZGRSZWNlbnRseU9wZW5lZChyZWNlbnRzKTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgYDxhcHA+IC0td2FpdGBcblx0XHR0aGlzLmhhbmRsZVdhaXRNYXJrZXJGaWxlKG9wZW5Db25maWcsIHVzZWRXaW5kb3dzKTtcblxuXHRcdC8vIEhhbmRsZSBgPGFwcD4gY2hhdGBcblx0XHR0aGlzLmhhbmRsZUNoYXRSZXF1ZXN0KG9wZW5Db25maWcsIHVzZWRXaW5kb3dzKTtcblxuXHRcdHJldHVybiB1c2VkV2luZG93cztcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlV2FpdE1hcmtlckZpbGUob3BlbkNvbmZpZzogSU9wZW5Db25maWd1cmF0aW9uLCB1c2VkV2luZG93czogSUNvZGVXaW5kb3dbXSk6IHZvaWQge1xuXG5cdFx0Ly8gSWYgd2UgZ290IHN0YXJ0ZWQgd2l0aCAtLXdhaXQgZnJvbSB0aGUgQ0xJLCB3ZSBuZWVkIHRvIHNpZ25hbCB0byB0aGUgb3V0c2lkZSB3aGVuIHRoZSB3aW5kb3dcblx0XHQvLyB1c2VkIGZvciB0aGUgZWRpdCBvcGVyYXRpb24gaXMgY2xvc2VkIG9yIGxvYWRlZCB0byBhIGRpZmZlcmVudCBmb2xkZXIgc28gdGhhdCB0aGUgd2FpdGluZ1xuXHRcdC8vIHByb2Nlc3MgY2FuIGNvbnRpbnVlLiBXZSBkbyB0aGlzIGJ5IGRlbGV0aW5nIHRoZSB3YWl0TWFya2VyRmlsZVBhdGguXG5cdFx0Y29uc3Qgd2FpdE1hcmtlckZpbGVVUkkgPSBvcGVuQ29uZmlnLndhaXRNYXJrZXJGaWxlVVJJO1xuXHRcdGlmIChvcGVuQ29uZmlnLmNvbnRleHQgPT09IE9wZW5Db250ZXh0LkNMSSAmJiB3YWl0TWFya2VyRmlsZVVSSSAmJiB1c2VkV2luZG93cy5sZW5ndGggPT09IDEgJiYgdXNlZFdpbmRvd3NbMF0pIHtcblx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHVzZWRXaW5kb3dzWzBdLndoZW5DbG9zZWRPckxvYWRlZDtcblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHdhaXRNYXJrZXJGaWxlVVJJKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHQvLyBpZ25vcmUgLSBjb3VsZCBoYXZlIGJlZW4gZGVsZXRlZCBmcm9tIHRoZSB3aW5kb3cgYWxyZWFkeVxuXHRcdFx0XHR9XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQ2hhdFJlcXVlc3Qob3BlbkNvbmZpZzogSU9wZW5Db25maWd1cmF0aW9uLCB1c2VkV2luZG93czogSUNvZGVXaW5kb3dbXSk6IHZvaWQge1xuXHRcdGlmIChvcGVuQ29uZmlnLmNvbnRleHQgIT09IE9wZW5Db250ZXh0LkNMSSB8fCAhb3BlbkNvbmZpZy5jbGkuY2hhdCB8fCB1c2VkV2luZG93cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgd2luZG93SGFuZGxpbmdDaGF0UmVxdWVzdDogSUNvZGVXaW5kb3cgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHVzZWRXaW5kb3dzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0d2luZG93SGFuZGxpbmdDaGF0UmVxdWVzdCA9IHVzZWRXaW5kb3dzWzBdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBjaGF0UmVxdWVzdEZvbGRlciA9IG9wZW5Db25maWcuY2xpLl9bMF07IC8vIGNoYXQgcmVxdWVzdCBnZXRzIGN3ZCgpIGFzIGZvbGRlciB0byBvcGVuXG5cdFx0XHRpZiAoY2hhdFJlcXVlc3RGb2xkZXIpIHtcblx0XHRcdFx0d2luZG93SGFuZGxpbmdDaGF0UmVxdWVzdCA9IGZpbmRXaW5kb3dPbldvcmtzcGFjZU9yRm9sZGVyKHVzZWRXaW5kb3dzLCBVUkkuZmlsZShjaGF0UmVxdWVzdEZvbGRlcikpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh3aW5kb3dIYW5kbGluZ0NoYXRSZXF1ZXN0KSB7XG5cdFx0XHR3aW5kb3dIYW5kbGluZ0NoYXRSZXF1ZXN0LnNlbmRXaGVuUmVhZHkoJ3ZzY29kZTpoYW5kbGVDaGF0UmVxdWVzdCcsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIG9wZW5Db25maWcuY2xpLmNoYXQpO1xuXHRcdFx0d2luZG93SGFuZGxpbmdDaGF0UmVxdWVzdC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9PcGVuKFxuXHRcdG9wZW5Db25maWc6IElPcGVuQ29uZmlndXJhdGlvbixcblx0XHR3b3Jrc3BhY2VzVG9PcGVuOiBJV29ya3NwYWNlUGF0aFRvT3BlbltdLFxuXHRcdGZvbGRlcnNUb09wZW46IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VQYXRoVG9PcGVuW10sXG5cdFx0ZW1wdHlUb1Jlc3RvcmU6IElFbXB0eVdpbmRvd0JhY2t1cEluZm9bXSxcblx0XHRtYXliZU9wZW5FbXB0eVdpbmRvdzogYm9vbGVhbixcblx0XHRmaWxlc1RvT3BlbjogSUZpbGVzVG9PcGVuIHwgdW5kZWZpbmVkLFxuXHRcdGZvbGRlcnNUb0FkZDogSVNpbmdsZUZvbGRlcldvcmtzcGFjZVBhdGhUb09wZW5bXSxcblx0XHRmb2xkZXJzVG9SZW1vdmU6IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VQYXRoVG9PcGVuW11cblx0KTogUHJvbWlzZTx7IHdpbmRvd3M6IElDb2RlV2luZG93W107IGZpbGVzT3BlbmVkSW5XaW5kb3c6IElDb2RlV2luZG93IHwgdW5kZWZpbmVkIH0+IHtcblxuXHRcdC8vIEtlZXAgdHJhY2sgb2YgdXNlZCB3aW5kb3dzIGFuZCByZW1lbWJlclxuXHRcdC8vIGlmIGZpbGVzIGhhdmUgYmVlbiBvcGVuZWQgaW4gb25lIG9mIHRoZW1cblx0XHRjb25zdCB1c2VkV2luZG93czogSUNvZGVXaW5kb3dbXSA9IFtdO1xuXHRcdGxldCBmaWxlc09wZW5lZEluV2luZG93OiBJQ29kZVdpbmRvdyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRmdW5jdGlvbiBhZGRVc2VkV2luZG93KHdpbmRvdzogSUNvZGVXaW5kb3csIG9wZW5lZEZpbGVzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0dXNlZFdpbmRvd3MucHVzaCh3aW5kb3cpO1xuXG5cdFx0XHRpZiAob3BlbmVkRmlsZXMpIHtcblx0XHRcdFx0ZmlsZXNPcGVuZWRJbldpbmRvdyA9IHdpbmRvdztcblx0XHRcdFx0ZmlsZXNUb09wZW4gPSB1bmRlZmluZWQ7IC8vIHJlc2V0IGBmaWxlc1RvT3BlbmAgc2luY2UgZmlsZXMgaGF2ZSBiZWVuIG9wZW5lZFxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNldHRpbmdzIGNhbiBkZWNpZGUgaWYgZmlsZXMvZm9sZGVycyBvcGVuIGluIG5ldyB3aW5kb3cgb3Igbm90XG5cdFx0bGV0IHsgb3BlbkZvbGRlckluTmV3V2luZG93LCBvcGVuRmlsZXNJbk5ld1dpbmRvdyB9ID0gdGhpcy5zaG91bGRPcGVuTmV3V2luZG93KG9wZW5Db25maWcpO1xuXG5cdFx0Ly8gSGFuZGxlIGZvbGRlcnMgdG8gYWRkL3JlbW92ZSBieSBsb29raW5nIGZvciB0aGUgbGFzdCBhY3RpdmUgd29ya3NwYWNlIChub3Qgb24gaW5pdGlhbCBzdGFydHVwKVxuXHRcdGlmICghb3BlbkNvbmZpZy5pbml0aWFsU3RhcnR1cCAmJiAoZm9sZGVyc1RvQWRkLmxlbmd0aCA+IDAgfHwgZm9sZGVyc1RvUmVtb3ZlLmxlbmd0aCA+IDApKSB7XG5cdFx0XHRjb25zdCBhdXRob3JpdHkgPSBmb2xkZXJzVG9BZGQuYXQoMCk/LnJlbW90ZUF1dGhvcml0eSA/PyBmb2xkZXJzVG9SZW1vdmUuYXQoMCk/LnJlbW90ZUF1dGhvcml0eTtcblx0XHRcdGNvbnN0IGxhc3RBY3RpdmVXaW5kb3cgPSB0aGlzLmdldExhc3RBY3RpdmVXaW5kb3dGb3JBdXRob3JpdHkoYXV0aG9yaXR5KTtcblx0XHRcdGlmIChsYXN0QWN0aXZlV2luZG93KSB7XG5cdFx0XHRcdGFkZFVzZWRXaW5kb3codGhpcy5kb0FkZFJlbW92ZUZvbGRlcnNJbkV4aXN0aW5nV2luZG93KGxhc3RBY3RpdmVXaW5kb3csIGZvbGRlcnNUb0FkZC5tYXAoZm9sZGVyVG9BZGQgPT4gZm9sZGVyVG9BZGQud29ya3NwYWNlLnVyaSksIGZvbGRlcnNUb1JlbW92ZS5tYXAoZm9sZGVyVG9SZW1vdmUgPT4gZm9sZGVyVG9SZW1vdmUud29ya3NwYWNlLnVyaSkpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgZmlsZXMgdG8gb3Blbi9kaWZmL21lcmdlIG9yIHRvIGNyZWF0ZSB3aGVuIHdlIGRvbnQgb3BlbiBhIGZvbGRlciBhbmQgd2UgZG8gbm90IHJlc3RvcmUgYW55XG5cdFx0Ly8gZm9sZGVyL3VudGl0bGVkIGZyb20gaG90LWV4aXQgYnkgdHJ5aW5nIHRvIG9wZW4gdGhlbSBpbiB0aGUgd2luZG93IHRoYXQgZml0cyBiZXN0XG5cdFx0Y29uc3QgcG90ZW50aWFsTmV3V2luZG93c0NvdW50ID0gZm9sZGVyc1RvT3Blbi5sZW5ndGggKyB3b3Jrc3BhY2VzVG9PcGVuLmxlbmd0aCArIGVtcHR5VG9SZXN0b3JlLmxlbmd0aDtcblx0XHRpZiAoZmlsZXNUb09wZW4gJiYgcG90ZW50aWFsTmV3V2luZG93c0NvdW50ID09PSAwKSB7XG5cblx0XHRcdC8vIEZpbmQgc3VpdGFibGUgd2luZG93IG9yIGZvbGRlciBwYXRoIHRvIG9wZW4gZmlsZXMgaW5cblx0XHRcdGNvbnN0IGZpbGVUb0NoZWNrOiBJUGF0aDxJRWRpdG9yT3B0aW9ucz4gfCB1bmRlZmluZWQgPSBmaWxlc1RvT3Blbi5maWxlc1RvT3Blbk9yQ3JlYXRlWzBdIHx8IGZpbGVzVG9PcGVuLmZpbGVzVG9EaWZmWzBdIHx8IGZpbGVzVG9PcGVuLmZpbGVzVG9NZXJnZVszXSAvKiBbM10gaXMgdGhlIHJlc3VsdGluZyBtZXJnZSBmaWxlICovO1xuXG5cdFx0XHQvLyBvbmx5IGxvb2sgYXQgdGhlIHdpbmRvd3Mgd2l0aCBjb3JyZWN0IGF1dGhvcml0eVxuXHRcdFx0Y29uc3Qgd2luZG93cyA9IHRoaXMuZ2V0V2luZG93cygpLmZpbHRlcih3aW5kb3cgPT4gZmlsZXNUb09wZW4gJiYgaXNFcXVhbEF1dGhvcml0eSh3aW5kb3cucmVtb3RlQXV0aG9yaXR5LCBmaWxlc1RvT3Blbi5yZW1vdGVBdXRob3JpdHkpKTtcblxuXHRcdFx0Ly8gZmlndXJlIG91dCBhIGdvb2Qgd2luZG93IHRvIG9wZW4gdGhlIGZpbGVzIGluIGlmIGFueVxuXHRcdFx0Ly8gd2l0aCBhIGZhbGxiYWNrIHRvIHRoZSBsYXN0IGFjdGl2ZSB3aW5kb3cuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gaW4gY2FzZSBgb3BlbkZpbGVzSW5OZXdXaW5kb3dgIGlzIGVuZm9yY2VkLCB3ZSBza2lwXG5cdFx0XHQvLyB0aGlzIHN0ZXAuXG5cdFx0XHRsZXQgd2luZG93VG9Vc2VGb3JGaWxlczogSUNvZGVXaW5kb3cgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZmlsZVRvQ2hlY2s/LmZpbGVVcmkgJiYgIW9wZW5GaWxlc0luTmV3V2luZG93KSB7XG5cdFx0XHRcdGlmIChvcGVuQ29uZmlnLmNvbnRleHQgPT09IE9wZW5Db250ZXh0LkRFU0tUT1AgfHwgb3BlbkNvbmZpZy5jb250ZXh0ID09PSBPcGVuQ29udGV4dC5DTEkgfHwgb3BlbkNvbmZpZy5jb250ZXh0ID09PSBPcGVuQ29udGV4dC5ET0NLIHx8IG9wZW5Db25maWcuY29udGV4dCA9PT0gT3BlbkNvbnRleHQuTElOSykge1xuXHRcdFx0XHRcdHdpbmRvd1RvVXNlRm9yRmlsZXMgPSBhd2FpdCBmaW5kV2luZG93T25GaWxlKHdpbmRvd3MsIGZpbGVUb0NoZWNrLmZpbGVVcmksIGFzeW5jIHdvcmtzcGFjZSA9PiB3b3Jrc3BhY2UuY29uZmlnUGF0aC5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/IHRoaXMud29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS5yZXNvbHZlTG9jYWxXb3Jrc3BhY2Uod29ya3NwYWNlLmNvbmZpZ1BhdGgpIDogdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghd2luZG93VG9Vc2VGb3JGaWxlcykge1xuXHRcdFx0XHRcdHdpbmRvd1RvVXNlRm9yRmlsZXMgPSB0aGlzLmRvR2V0TGFzdEFjdGl2ZVdpbmRvdyh3aW5kb3dzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBXZSBmb3VuZCBhIHdpbmRvdyB0byBvcGVuIHRoZSBmaWxlcyBpblxuXHRcdFx0aWYgKHdpbmRvd1RvVXNlRm9yRmlsZXMpIHtcblxuXHRcdFx0XHQvLyBXaW5kb3cgaXMgd29ya3NwYWNlXG5cdFx0XHRcdGlmIChpc1dvcmtzcGFjZUlkZW50aWZpZXIod2luZG93VG9Vc2VGb3JGaWxlcy5vcGVuZWRXb3Jrc3BhY2UpKSB7XG5cdFx0XHRcdFx0d29ya3NwYWNlc1RvT3Blbi5wdXNoKHsgd29ya3NwYWNlOiB3aW5kb3dUb1VzZUZvckZpbGVzLm9wZW5lZFdvcmtzcGFjZSwgcmVtb3RlQXV0aG9yaXR5OiB3aW5kb3dUb1VzZUZvckZpbGVzLnJlbW90ZUF1dGhvcml0eSB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFdpbmRvdyBpcyBzaW5nbGUgZm9sZGVyXG5cdFx0XHRcdGVsc2UgaWYgKGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih3aW5kb3dUb1VzZUZvckZpbGVzLm9wZW5lZFdvcmtzcGFjZSkpIHtcblx0XHRcdFx0XHRmb2xkZXJzVG9PcGVuLnB1c2goeyB3b3Jrc3BhY2U6IHdpbmRvd1RvVXNlRm9yRmlsZXMub3BlbmVkV29ya3NwYWNlLCByZW1vdGVBdXRob3JpdHk6IHdpbmRvd1RvVXNlRm9yRmlsZXMucmVtb3RlQXV0aG9yaXR5IH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gV2luZG93IGlzIGVtcHR5XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGFkZFVzZWRXaW5kb3codGhpcy5kb09wZW5GaWxlc0luRXhpc3RpbmdXaW5kb3cob3BlbkNvbmZpZywgd2luZG93VG9Vc2VGb3JGaWxlcywgZmlsZXNUb09wZW4pLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBGaW5hbGx5LCBpZiBubyB3aW5kb3cgb3IgZm9sZGVyIGlzIGZvdW5kLCBqdXN0IG9wZW4gdGhlIGZpbGVzIGluIGFuIGVtcHR5IHdpbmRvd1xuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGFkZFVzZWRXaW5kb3coYXdhaXQgdGhpcy5vcGVuSW5Ccm93c2VyV2luZG93KHtcblx0XHRcdFx0XHR1c2VyRW52OiBvcGVuQ29uZmlnLnVzZXJFbnYsXG5cdFx0XHRcdFx0Y2xpOiBvcGVuQ29uZmlnLmNsaSxcblx0XHRcdFx0XHRpbml0aWFsU3RhcnR1cDogb3BlbkNvbmZpZy5pbml0aWFsU3RhcnR1cCxcblx0XHRcdFx0XHRmaWxlc1RvT3Blbixcblx0XHRcdFx0XHRmb3JjZU5ld1dpbmRvdzogdHJ1ZSxcblx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IGZpbGVzVG9PcGVuLnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0XHRmb3JjZU5ld1RhYmJlZFdpbmRvdzogb3BlbkNvbmZpZy5mb3JjZU5ld1RhYmJlZFdpbmRvdyxcblx0XHRcdFx0XHRmb3JjZVByb2ZpbGU6IG9wZW5Db25maWcuZm9yY2VQcm9maWxlLFxuXHRcdFx0XHRcdGZvcmNlVGVtcFByb2ZpbGU6IG9wZW5Db25maWcuZm9yY2VUZW1wUHJvZmlsZVxuXHRcdFx0XHR9KSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIHdvcmtzcGFjZXMgdG8gb3BlbiAoaW5zdHJ1Y3RlZCBhbmQgdG8gcmVzdG9yZSlcblx0XHRjb25zdCBhbGxXb3Jrc3BhY2VzVG9PcGVuID0gZGlzdGluY3Qod29ya3NwYWNlc1RvT3Blbiwgd29ya3NwYWNlID0+IHdvcmtzcGFjZS53b3Jrc3BhY2UuaWQpOyAvLyBwcmV2ZW50IGR1cGxpY2F0ZXNcblx0XHRpZiAoYWxsV29ya3NwYWNlc1RvT3Blbi5sZW5ndGggPiAwKSB7XG5cblx0XHRcdC8vIENoZWNrIGZvciBleGlzdGluZyBpbnN0YW5jZXNcblx0XHRcdGNvbnN0IHdpbmRvd3NPbldvcmtzcGFjZSA9IGNvYWxlc2NlKGFsbFdvcmtzcGFjZXNUb09wZW4ubWFwKHdvcmtzcGFjZVRvT3BlbiA9PiBmaW5kV2luZG93T25Xb3Jrc3BhY2VPckZvbGRlcih0aGlzLmdldFdpbmRvd3MoKSwgd29ya3NwYWNlVG9PcGVuLndvcmtzcGFjZS5jb25maWdQYXRoKSkpO1xuXHRcdFx0aWYgKHdpbmRvd3NPbldvcmtzcGFjZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHdpbmRvd09uV29ya3NwYWNlID0gd2luZG93c09uV29ya3NwYWNlWzBdO1xuXHRcdFx0XHRjb25zdCBmaWxlc1RvT3BlbkluV2luZG93ID0gaXNFcXVhbEF1dGhvcml0eShmaWxlc1RvT3Blbj8ucmVtb3RlQXV0aG9yaXR5LCB3aW5kb3dPbldvcmtzcGFjZS5yZW1vdGVBdXRob3JpdHkpID8gZmlsZXNUb09wZW4gOiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0Ly8gRG8gb3BlbiBmaWxlc1xuXHRcdFx0XHRhZGRVc2VkV2luZG93KHRoaXMuZG9PcGVuRmlsZXNJbkV4aXN0aW5nV2luZG93KG9wZW5Db25maWcsIHdpbmRvd09uV29ya3NwYWNlLCBmaWxlc1RvT3BlbkluV2luZG93KSwgISFmaWxlc1RvT3BlbkluV2luZG93KTtcblxuXHRcdFx0XHRvcGVuRm9sZGVySW5OZXdXaW5kb3cgPSB0cnVlOyAvLyBhbnkgb3RoZXIgZm9sZGVycyB0byBvcGVuIG11c3Qgb3BlbiBpbiBuZXcgd2luZG93IHRoZW5cblx0XHRcdH1cblxuXHRcdFx0Ly8gT3BlbiByZW1haW5pbmcgb25lc1xuXHRcdFx0Zm9yIChjb25zdCB3b3Jrc3BhY2VUb09wZW4gb2YgYWxsV29ya3NwYWNlc1RvT3Blbikge1xuXHRcdFx0XHRpZiAod2luZG93c09uV29ya3NwYWNlLnNvbWUod2luZG93ID0+IHdpbmRvdy5vcGVuZWRXb3Jrc3BhY2UgJiYgd2luZG93Lm9wZW5lZFdvcmtzcGFjZS5pZCA9PT0gd29ya3NwYWNlVG9PcGVuLndvcmtzcGFjZS5pZCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTsgLy8gaWdub3JlIGZvbGRlcnMgdGhhdCBhcmUgYWxyZWFkeSBvcGVuXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB3b3Jrc3BhY2VUb09wZW4ucmVtb3RlQXV0aG9yaXR5O1xuXHRcdFx0XHRjb25zdCBmaWxlc1RvT3BlbkluV2luZG93ID0gaXNFcXVhbEF1dGhvcml0eShmaWxlc1RvT3Blbj8ucmVtb3RlQXV0aG9yaXR5LCByZW1vdGVBdXRob3JpdHkpID8gZmlsZXNUb09wZW4gOiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0Ly8gRG8gb3BlbiBmb2xkZXJcblx0XHRcdFx0YWRkVXNlZFdpbmRvdyhhd2FpdCB0aGlzLmRvT3BlbkZvbGRlck9yV29ya3NwYWNlKG9wZW5Db25maWcsIHdvcmtzcGFjZVRvT3Blbiwgb3BlbkZvbGRlckluTmV3V2luZG93LCBmaWxlc1RvT3BlbkluV2luZG93KSwgISFmaWxlc1RvT3BlbkluV2luZG93KTtcblxuXHRcdFx0XHRvcGVuRm9sZGVySW5OZXdXaW5kb3cgPSB0cnVlOyAvLyBhbnkgb3RoZXIgZm9sZGVycyB0byBvcGVuIG11c3Qgb3BlbiBpbiBuZXcgd2luZG93IHRoZW5cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgZm9sZGVycyB0byBvcGVuIChpbnN0cnVjdGVkIGFuZCB0byByZXN0b3JlKVxuXHRcdGNvbnN0IGFsbEZvbGRlcnNUb09wZW4gPSBkaXN0aW5jdChmb2xkZXJzVG9PcGVuLCBmb2xkZXIgPT4gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuZ2V0Q29tcGFyaXNvbktleShmb2xkZXIud29ya3NwYWNlLnVyaSkpOyAvLyBwcmV2ZW50IGR1cGxpY2F0ZXNcblx0XHRpZiAoYWxsRm9sZGVyc1RvT3Blbi5sZW5ndGggPiAwKSB7XG5cblx0XHRcdC8vIENoZWNrIGZvciBleGlzdGluZyBpbnN0YW5jZXNcblx0XHRcdGNvbnN0IHdpbmRvd3NPbkZvbGRlclBhdGggPSBjb2FsZXNjZShhbGxGb2xkZXJzVG9PcGVuLm1hcChmb2xkZXJUb09wZW4gPT4gZmluZFdpbmRvd09uV29ya3NwYWNlT3JGb2xkZXIodGhpcy5nZXRXaW5kb3dzKCksIGZvbGRlclRvT3Blbi53b3Jrc3BhY2UudXJpKSkpO1xuXHRcdFx0aWYgKHdpbmRvd3NPbkZvbGRlclBhdGgubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCB3aW5kb3dPbkZvbGRlclBhdGggPSB3aW5kb3dzT25Gb2xkZXJQYXRoWzBdO1xuXHRcdFx0XHRjb25zdCBmaWxlc1RvT3BlbkluV2luZG93ID0gaXNFcXVhbEF1dGhvcml0eShmaWxlc1RvT3Blbj8ucmVtb3RlQXV0aG9yaXR5LCB3aW5kb3dPbkZvbGRlclBhdGgucmVtb3RlQXV0aG9yaXR5KSA/IGZpbGVzVG9PcGVuIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdC8vIERvIG9wZW4gZmlsZXNcblx0XHRcdFx0YWRkVXNlZFdpbmRvdyh0aGlzLmRvT3BlbkZpbGVzSW5FeGlzdGluZ1dpbmRvdyhvcGVuQ29uZmlnLCB3aW5kb3dPbkZvbGRlclBhdGgsIGZpbGVzVG9PcGVuSW5XaW5kb3cpLCAhIWZpbGVzVG9PcGVuSW5XaW5kb3cpO1xuXG5cdFx0XHRcdG9wZW5Gb2xkZXJJbk5ld1dpbmRvdyA9IHRydWU7IC8vIGFueSBvdGhlciBmb2xkZXJzIHRvIG9wZW4gbXVzdCBvcGVuIGluIG5ldyB3aW5kb3cgdGhlblxuXHRcdFx0fVxuXG5cdFx0XHQvLyBPcGVuIHJlbWFpbmluZyBvbmVzXG5cdFx0XHRmb3IgKGNvbnN0IGZvbGRlclRvT3BlbiBvZiBhbGxGb2xkZXJzVG9PcGVuKSB7XG5cdFx0XHRcdGlmICh3aW5kb3dzT25Gb2xkZXJQYXRoLnNvbWUod2luZG93ID0+IGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih3aW5kb3cub3BlbmVkV29ya3NwYWNlKSAmJiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKHdpbmRvdy5vcGVuZWRXb3Jrc3BhY2UudXJpLCBmb2xkZXJUb09wZW4ud29ya3NwYWNlLnVyaSkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7IC8vIGlnbm9yZSBmb2xkZXJzIHRoYXQgYXJlIGFscmVhZHkgb3BlblxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gZm9sZGVyVG9PcGVuLnJlbW90ZUF1dGhvcml0eTtcblx0XHRcdFx0Y29uc3QgZmlsZXNUb09wZW5JbldpbmRvdyA9IGlzRXF1YWxBdXRob3JpdHkoZmlsZXNUb09wZW4/LnJlbW90ZUF1dGhvcml0eSwgcmVtb3RlQXV0aG9yaXR5KSA/IGZpbGVzVG9PcGVuIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdC8vIERvIG9wZW4gZm9sZGVyXG5cdFx0XHRcdGFkZFVzZWRXaW5kb3coYXdhaXQgdGhpcy5kb09wZW5Gb2xkZXJPcldvcmtzcGFjZShvcGVuQ29uZmlnLCBmb2xkZXJUb09wZW4sIG9wZW5Gb2xkZXJJbk5ld1dpbmRvdywgZmlsZXNUb09wZW5JbldpbmRvdyksICEhZmlsZXNUb09wZW5JbldpbmRvdyk7XG5cblx0XHRcdFx0b3BlbkZvbGRlckluTmV3V2luZG93ID0gdHJ1ZTsgLy8gYW55IG90aGVyIGZvbGRlcnMgdG8gb3BlbiBtdXN0IG9wZW4gaW4gbmV3IHdpbmRvdyB0aGVuXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGVtcHR5IHRvIHJlc3RvcmVcblx0XHRjb25zdCBhbGxFbXB0eVRvUmVzdG9yZSA9IGRpc3RpbmN0KGVtcHR5VG9SZXN0b3JlLCBpbmZvID0+IGluZm8uYmFja3VwRm9sZGVyKTsgLy8gcHJldmVudCBkdXBsaWNhdGVzXG5cdFx0aWYgKGFsbEVtcHR5VG9SZXN0b3JlLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvciAoY29uc3QgZW1wdHlXaW5kb3dCYWNrdXBJbmZvIG9mIGFsbEVtcHR5VG9SZXN0b3JlKSB7XG5cdFx0XHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IGVtcHR5V2luZG93QmFja3VwSW5mby5yZW1vdGVBdXRob3JpdHk7XG5cdFx0XHRcdGNvbnN0IGZpbGVzVG9PcGVuSW5XaW5kb3cgPSBpc0VxdWFsQXV0aG9yaXR5KGZpbGVzVG9PcGVuPy5yZW1vdGVBdXRob3JpdHksIHJlbW90ZUF1dGhvcml0eSkgPyBmaWxlc1RvT3BlbiA6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRhZGRVc2VkV2luZG93KGF3YWl0IHRoaXMuZG9PcGVuRW1wdHkob3BlbkNvbmZpZywgdHJ1ZSwgcmVtb3RlQXV0aG9yaXR5LCBmaWxlc1RvT3BlbkluV2luZG93LCBlbXB0eVdpbmRvd0JhY2t1cEluZm8pLCAhIWZpbGVzVG9PcGVuSW5XaW5kb3cpO1xuXG5cdFx0XHRcdG9wZW5Gb2xkZXJJbk5ld1dpbmRvdyA9IHRydWU7IC8vIGFueSBvdGhlciBmb2xkZXJzIHRvIG9wZW4gbXVzdCBvcGVuIGluIG5ldyB3aW5kb3cgdGhlblxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpbmFsbHksIG9wZW4gYW4gZW1wdHkgd2luZG93IGlmXG5cdFx0Ly8gLSB3ZSBzdGlsbCBoYXZlIGZpbGVzIHRvIG9wZW5cblx0XHQvLyAtIHVzZXIgZm9yY2VzIGFuIGVtcHR5IHdpbmRvdyAoZS5nLiB2aWEgY29tbWFuZCBsaW5lKVxuXHRcdC8vIC0gbm8gd2luZG93IGhhcyBvcGVuZWQgeWV0XG5cdFx0aWYgKGZpbGVzVG9PcGVuIHx8IChtYXliZU9wZW5FbXB0eVdpbmRvdyAmJiAob3BlbkNvbmZpZy5mb3JjZUVtcHR5IHx8IHVzZWRXaW5kb3dzLmxlbmd0aCA9PT0gMCkpKSB7XG5cdFx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSBmaWxlc1RvT3BlbiA/IGZpbGVzVG9PcGVuLnJlbW90ZUF1dGhvcml0eSA6IG9wZW5Db25maWcucmVtb3RlQXV0aG9yaXR5O1xuXG5cdFx0XHRhZGRVc2VkV2luZG93KGF3YWl0IHRoaXMuZG9PcGVuRW1wdHkob3BlbkNvbmZpZywgb3BlbkZvbGRlckluTmV3V2luZG93LCByZW1vdGVBdXRob3JpdHksIGZpbGVzVG9PcGVuKSwgISFmaWxlc1RvT3Blbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgd2luZG93czogZGlzdGluY3QodXNlZFdpbmRvd3MpLCBmaWxlc09wZW5lZEluV2luZG93IH07XG5cdH1cblxuXHRwcml2YXRlIGRvT3BlbkZpbGVzSW5FeGlzdGluZ1dpbmRvdyhjb25maWd1cmF0aW9uOiBJT3BlbkNvbmZpZ3VyYXRpb24sIHdpbmRvdzogSUNvZGVXaW5kb3csIGZpbGVzVG9PcGVuPzogSUZpbGVzVG9PcGVuKTogSUNvZGVXaW5kb3cge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnd2luZG93c01hbmFnZXIjZG9PcGVuRmlsZXNJbkV4aXN0aW5nV2luZG93JywgeyBmaWxlc1RvT3BlbiB9KTtcblxuXHRcdHRoaXMuZm9jdXNNYWluT3JDaGlsZFdpbmRvdyh3aW5kb3cpOyAvLyBtYWtlIHN1cmUgd2luZG93IG9yIGFueSBvZiB0aGUgY2hpbGRyZW4gaGFzIGZvY3VzXG5cblx0XHRjb25zdCBwYXJhbXM6IElOYXRpdmVPcGVuRmlsZVJlcXVlc3QgPSB7XG5cdFx0XHRmaWxlc1RvT3Blbk9yQ3JlYXRlOiBmaWxlc1RvT3Blbj8uZmlsZXNUb09wZW5PckNyZWF0ZSxcblx0XHRcdGZpbGVzVG9EaWZmOiBmaWxlc1RvT3Blbj8uZmlsZXNUb0RpZmYsXG5cdFx0XHRmaWxlc1RvTWVyZ2U6IGZpbGVzVG9PcGVuPy5maWxlc1RvTWVyZ2UsXG5cdFx0XHRmaWxlc1RvV2FpdDogZmlsZXNUb09wZW4/LmZpbGVzVG9XYWl0LFxuXHRcdFx0dGVybVByb2dyYW06IGNvbmZpZ3VyYXRpb24/LnVzZXJFbnY/LlsnVEVSTV9QUk9HUkFNJ11cblx0XHR9O1xuXHRcdHdpbmRvdy5zZW5kV2hlblJlYWR5KCd2c2NvZGU6b3BlbkZpbGVzJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgcGFyYW1zKTtcblxuXHRcdHJldHVybiB3aW5kb3c7XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzTWFpbk9yQ2hpbGRXaW5kb3cobWFpbldpbmRvdzogSUNvZGVXaW5kb3cpOiB2b2lkIHtcblx0XHRsZXQgd2luZG93VG9Gb2N1czogSUNvZGVXaW5kb3cgfCBJQXV4aWxpYXJ5V2luZG93ID0gbWFpbldpbmRvdztcblxuXHRcdGNvbnN0IGZvY3VzZWRXaW5kb3cgPSBCcm93c2VyV2luZG93LmdldEZvY3VzZWRXaW5kb3coKTtcblx0XHRpZiAoZm9jdXNlZFdpbmRvdyAmJiBmb2N1c2VkV2luZG93LmlkICE9PSBtYWluV2luZG93LmlkKSB7XG5cdFx0XHRjb25zdCBhdXhpbGlhcnlXaW5kb3dDYW5kaWRhdGUgPSB0aGlzLmF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dCeVdlYkNvbnRlbnRzKGZvY3VzZWRXaW5kb3cud2ViQ29udGVudHMpO1xuXHRcdFx0aWYgKGF1eGlsaWFyeVdpbmRvd0NhbmRpZGF0ZSAmJiBhdXhpbGlhcnlXaW5kb3dDYW5kaWRhdGUucGFyZW50SWQgPT09IG1haW5XaW5kb3cuaWQpIHtcblx0XHRcdFx0d2luZG93VG9Gb2N1cyA9IGF1eGlsaWFyeVdpbmRvd0NhbmRpZGF0ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR3aW5kb3dUb0ZvY3VzLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIGRvQWRkUmVtb3ZlRm9sZGVyc0luRXhpc3RpbmdXaW5kb3cod2luZG93OiBJQ29kZVdpbmRvdywgZm9sZGVyc1RvQWRkOiBVUklbXSwgZm9sZGVyc1RvUmVtb3ZlOiBVUklbXSk6IElDb2RlV2luZG93IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3dpbmRvd3NNYW5hZ2VyI2RvQWRkUmVtb3ZlRm9sZGVyc1RvRXhpc3RpbmdXaW5kb3cnLCB7IGZvbGRlcnNUb0FkZCwgZm9sZGVyc1RvUmVtb3ZlIH0pO1xuXG5cdFx0d2luZG93LmZvY3VzKCk7IC8vIG1ha2Ugc3VyZSB3aW5kb3cgaGFzIGZvY3VzXG5cblx0XHRjb25zdCByZXF1ZXN0OiBJQWRkUmVtb3ZlRm9sZGVyc1JlcXVlc3QgPSB7IGZvbGRlcnNUb0FkZCwgZm9sZGVyc1RvUmVtb3ZlIH07XG5cdFx0d2luZG93LnNlbmRXaGVuUmVhZHkoJ3ZzY29kZTphZGRSZW1vdmVGb2xkZXJzJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgcmVxdWVzdCk7XG5cblx0XHRyZXR1cm4gd2luZG93O1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlQ29udGV4dFdpbmRvdyhvcGVuQ29uZmlnOiBJT3BlbkNvbmZpZ3VyYXRpb24sIGZvcmNlTmV3V2luZG93OiBib29sZWFuKTogeyB3aW5kb3dUb1VzZTogSUNvZGVXaW5kb3cgfCB1bmRlZmluZWQ7IGZvcmNlTmV3V2luZG93OiBib29sZWFuIH0ge1xuXHRcdGlmICghZm9yY2VOZXdXaW5kb3cgJiYgdHlwZW9mIG9wZW5Db25maWcuY29udGV4dFdpbmRvd0lkID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgY29udGV4dFdpbmRvdyA9IHRoaXMuZ2V0V2luZG93QnlJZChvcGVuQ29uZmlnLmNvbnRleHRXaW5kb3dJZCk7XG5cdFx0XHRpZiAoY29udGV4dFdpbmRvdz8uY29uZmlnPy5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRcdHJldHVybiB7IHdpbmRvd1RvVXNlOiB1bmRlZmluZWQsIGZvcmNlTmV3V2luZG93OiB0cnVlIH07IC8vIGRvIG5vdCByZXBsYWNlIHRoZSBhZ2VudHMgd2luZG93XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyB3aW5kb3dUb1VzZTogY29udGV4dFdpbmRvdywgZm9yY2VOZXdXaW5kb3cgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgd2luZG93VG9Vc2U6IHVuZGVmaW5lZCwgZm9yY2VOZXdXaW5kb3cgfTtcblx0fVxuXG5cdHByaXZhdGUgZG9PcGVuRW1wdHkob3BlbkNvbmZpZzogSU9wZW5Db25maWd1cmF0aW9uLCBmb3JjZU5ld1dpbmRvdzogYm9vbGVhbiwgcmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQsIGZpbGVzVG9PcGVuOiBJRmlsZXNUb09wZW4gfCB1bmRlZmluZWQsIGVtcHR5V2luZG93QmFja3VwSW5mbz86IElFbXB0eVdpbmRvd0JhY2t1cEluZm8pOiBQcm9taXNlPElDb2RlV2luZG93PiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd3aW5kb3dzTWFuYWdlciNkb09wZW5FbXB0eScsIHsgcmVzdG9yZTogISFlbXB0eVdpbmRvd0JhY2t1cEluZm8sIHJlbW90ZUF1dGhvcml0eSwgZmlsZXNUb09wZW4sIGZvcmNlTmV3V2luZG93IH0pO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVDb250ZXh0V2luZG93KG9wZW5Db25maWcsIGZvcmNlTmV3V2luZG93KTtcblxuXHRcdHJldHVybiB0aGlzLm9wZW5JbkJyb3dzZXJXaW5kb3coe1xuXHRcdFx0dXNlckVudjogb3BlbkNvbmZpZy51c2VyRW52LFxuXHRcdFx0Y2xpOiBvcGVuQ29uZmlnLmNsaSxcblx0XHRcdGluaXRpYWxTdGFydHVwOiBvcGVuQ29uZmlnLmluaXRpYWxTdGFydHVwLFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0Zm9yY2VOZXdXaW5kb3c6IHJlc29sdmVkLmZvcmNlTmV3V2luZG93LFxuXHRcdFx0Zm9yY2VOZXdUYWJiZWRXaW5kb3c6IG9wZW5Db25maWcuZm9yY2VOZXdUYWJiZWRXaW5kb3csXG5cdFx0XHRmaWxlc1RvT3Blbixcblx0XHRcdHdpbmRvd1RvVXNlOiByZXNvbHZlZC53aW5kb3dUb1VzZSxcblx0XHRcdGVtcHR5V2luZG93QmFja3VwSW5mbyxcblx0XHRcdGZvcmNlUHJvZmlsZTogb3BlbkNvbmZpZy5mb3JjZVByb2ZpbGUsXG5cdFx0XHRmb3JjZVRlbXBQcm9maWxlOiBvcGVuQ29uZmlnLmZvcmNlVGVtcFByb2ZpbGVcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZG9PcGVuRm9sZGVyT3JXb3Jrc3BhY2Uob3BlbkNvbmZpZzogSU9wZW5Db25maWd1cmF0aW9uLCBmb2xkZXJPcldvcmtzcGFjZTogSVdvcmtzcGFjZVBhdGhUb09wZW4gfCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlUGF0aFRvT3BlbiwgZm9yY2VOZXdXaW5kb3c6IGJvb2xlYW4sIGZpbGVzVG9PcGVuOiBJRmlsZXNUb09wZW4gfCB1bmRlZmluZWQsIHdpbmRvd1RvVXNlPzogSUNvZGVXaW5kb3cpOiBQcm9taXNlPElDb2RlV2luZG93PiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd3aW5kb3dzTWFuYWdlciNkb09wZW5Gb2xkZXJPcldvcmtzcGFjZScsIHsgZm9sZGVyT3JXb3Jrc3BhY2UsIGZpbGVzVG9PcGVuIH0pO1xuXG5cdFx0aWYgKCF3aW5kb3dUb1VzZSkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVDb250ZXh0V2luZG93KG9wZW5Db25maWcsIGZvcmNlTmV3V2luZG93KTtcblx0XHRcdHdpbmRvd1RvVXNlID0gcmVzb2x2ZWQud2luZG93VG9Vc2U7XG5cdFx0XHRmb3JjZU5ld1dpbmRvdyA9IHJlc29sdmVkLmZvcmNlTmV3V2luZG93O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm9wZW5JbkJyb3dzZXJXaW5kb3coe1xuXHRcdFx0d29ya3NwYWNlOiBmb2xkZXJPcldvcmtzcGFjZS53b3Jrc3BhY2UsXG5cdFx0XHR1c2VyRW52OiBvcGVuQ29uZmlnLnVzZXJFbnYsXG5cdFx0XHRjbGk6IG9wZW5Db25maWcuY2xpLFxuXHRcdFx0aW5pdGlhbFN0YXJ0dXA6IG9wZW5Db25maWcuaW5pdGlhbFN0YXJ0dXAsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IGZvbGRlck9yV29ya3NwYWNlLnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdGZvcmNlTmV3V2luZG93LFxuXHRcdFx0Zm9yY2VOZXdUYWJiZWRXaW5kb3c6IG9wZW5Db25maWcuZm9yY2VOZXdUYWJiZWRXaW5kb3csXG5cdFx0XHRmaWxlc1RvT3Blbixcblx0XHRcdHdpbmRvd1RvVXNlLFxuXHRcdFx0Zm9yY2VQcm9maWxlOiBvcGVuQ29uZmlnLmZvcmNlUHJvZmlsZSxcblx0XHRcdGZvcmNlVGVtcFByb2ZpbGU6IG9wZW5Db25maWcuZm9yY2VUZW1wUHJvZmlsZVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRQYXRoc1RvT3BlbihvcGVuQ29uZmlnOiBJT3BlbkNvbmZpZ3VyYXRpb24pOiBQcm9taXNlPElQYXRoVG9PcGVuW10+IHtcblx0XHRsZXQgcGF0aHNUb09wZW46IElQYXRoVG9PcGVuW107XG5cdFx0bGV0IGlzQ29tbWFuZExpbmVPckFQSUNhbGwgPSBmYWxzZTtcblx0XHRsZXQgaXNSZXN0b3JpbmdQYXRocyA9IGZhbHNlO1xuXG5cdFx0Ly8gRXh0cmFjdCBwYXRoczogZnJvbSBBUElcblx0XHRpZiAob3BlbkNvbmZpZy51cmlzVG9PcGVuICYmIG9wZW5Db25maWcudXJpc1RvT3Blbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRwYXRoc1RvT3BlbiA9IGF3YWl0IHRoaXMuZG9FeHRyYWN0UGF0aHNGcm9tQVBJKG9wZW5Db25maWcpO1xuXHRcdFx0aXNDb21tYW5kTGluZU9yQVBJQ2FsbCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZm9yIGZvcmNlIGVtcHR5XG5cdFx0ZWxzZSBpZiAob3BlbkNvbmZpZy5mb3JjZUVtcHR5KSB7XG5cdFx0XHRwYXRoc1RvT3BlbiA9IFtFTVBUWV9XSU5ET1ddO1xuXHRcdH1cblxuXHRcdC8vIEV4dHJhY3QgcGF0aHM6IGZyb20gQ0xJXG5cdFx0ZWxzZSBpZiAob3BlbkNvbmZpZy5jbGkuXy5sZW5ndGggfHwgb3BlbkNvbmZpZy5jbGlbJ2ZvbGRlci11cmknXSB8fCBvcGVuQ29uZmlnLmNsaVsnZmlsZS11cmknXSkge1xuXHRcdFx0cGF0aHNUb09wZW4gPSBhd2FpdCB0aGlzLmRvRXh0cmFjdFBhdGhzRnJvbUNMSShvcGVuQ29uZmlnLmNsaSk7XG5cdFx0XHRpZiAocGF0aHNUb09wZW4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHBhdGhzVG9PcGVuLnB1c2goRU1QVFlfV0lORE9XKTsgLy8gYWRkIGFuIGVtcHR5IHdpbmRvdyBpZiB3ZSBkaWQgbm90IGhhdmUgd2luZG93cyB0byBvcGVuIGZyb20gY29tbWFuZCBsaW5lXG5cdFx0XHR9XG5cblx0XHRcdGlzQ29tbWFuZExpbmVPckFQSUNhbGwgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIEV4dHJhY3QgcGF0aHM6IGZyb20gcHJldmlvdXMgc2Vzc2lvblxuXHRcdGVsc2Uge1xuXHRcdFx0cGF0aHNUb09wZW4gPSBhd2FpdCB0aGlzLmRvR2V0UGF0aHNGcm9tTGFzdFNlc3Npb24oKTtcblx0XHRcdGlmIChwYXRoc1RvT3Blbi5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cGF0aHNUb09wZW4ucHVzaChFTVBUWV9XSU5ET1cpOyAvLyBhZGQgYW4gZW1wdHkgd2luZG93IGlmIHdlIGRpZCBub3QgaGF2ZSB3aW5kb3dzIHRvIHJlc3RvcmVcblx0XHRcdH1cblxuXHRcdFx0aXNSZXN0b3JpbmdQYXRocyA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIHRoZSBjYXNlIG9mIG11bHRpcGxlIGZvbGRlcnMgYmVpbmcgb3BlbmVkIGZyb20gQ0xJIHdoaWxlIHdlIGFyZVxuXHRcdC8vIG5vdCBpbiBgLS1hZGRgIG9yIGAtLXJlbW92ZWAgbW9kZSBieSBjcmVhdGluZyBhbiB1bnRpdGxlZCB3b3Jrc3BhY2UsIG9ubHkgaWY6XG5cdFx0Ly8gLSB0aGV5IGFsbCBzaGFyZSB0aGUgc2FtZSByZW1vdGUgYXV0aG9yaXR5XG5cdFx0Ly8gLSB0aGVyZSBpcyBubyBleGlzdGluZyB3b3Jrc3BhY2UgdG8gb3BlbiB0aGF0IG1hdGNoZXMgdGhlc2UgZm9sZGVyc1xuXHRcdGlmICghb3BlbkNvbmZpZy5hZGRNb2RlICYmICFvcGVuQ29uZmlnLnJlbW92ZU1vZGUgJiYgaXNDb21tYW5kTGluZU9yQVBJQ2FsbCkge1xuXHRcdFx0Y29uc3QgZm9sZGVyc1RvT3BlbiA9IHBhdGhzVG9PcGVuLmZpbHRlcihwYXRoID0+IGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlUGF0aFRvT3BlbihwYXRoKSk7XG5cdFx0XHRpZiAoZm9sZGVyc1RvT3Blbi5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IGZvbGRlcnNUb09wZW5bMF0ucmVtb3RlQXV0aG9yaXR5O1xuXHRcdFx0XHRpZiAoZm9sZGVyc1RvT3Blbi5ldmVyeShmb2xkZXJUb09wZW4gPT4gaXNFcXVhbEF1dGhvcml0eShmb2xkZXJUb09wZW4ucmVtb3RlQXV0aG9yaXR5LCByZW1vdGVBdXRob3JpdHkpKSkge1xuXHRcdFx0XHRcdGxldCB3b3Jrc3BhY2U6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRcdFx0Y29uc3QgbGFzdFNlc3Npb25Xb3Jrc3BhY2VNYXRjaGluZ0ZvbGRlcnMgPSBhd2FpdCB0aGlzLmRvR2V0V29ya3NwYWNlTWF0Y2hpbmdGb2xkZXJzRnJvbUxhc3RTZXNzaW9uKHJlbW90ZUF1dGhvcml0eSwgZm9sZGVyc1RvT3Blbik7XG5cdFx0XHRcdFx0aWYgKGxhc3RTZXNzaW9uV29ya3NwYWNlTWF0Y2hpbmdGb2xkZXJzKSB7XG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2UgPSBsYXN0U2Vzc2lvbldvcmtzcGFjZU1hdGNoaW5nRm9sZGVycztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0d29ya3NwYWNlID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLmNyZWF0ZVVudGl0bGVkV29ya3NwYWNlKGZvbGRlcnNUb09wZW4ubWFwKGZvbGRlciA9PiAoeyB1cmk6IGZvbGRlci53b3Jrc3BhY2UudXJpIH0pKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gQWRkIHdvcmtzcGFjZSBhbmQgcmVtb3ZlIGZvbGRlcnMgdGhlcmVieVxuXHRcdFx0XHRcdHBhdGhzVG9PcGVuLnB1c2goeyB3b3Jrc3BhY2UsIHJlbW90ZUF1dGhvcml0eSB9KTtcblx0XHRcdFx0XHRwYXRoc1RvT3BlbiA9IHBhdGhzVG9PcGVuLmZpbHRlcihwYXRoID0+ICFpc1NpbmdsZUZvbGRlcldvcmtzcGFjZVBhdGhUb09wZW4ocGF0aCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZm9yIGB3aW5kb3cucmVzdG9yZVdpbmRvd3NgIHNldHRpbmcgdG8gaW5jbHVkZSBhbGwgd2luZG93c1xuXHRcdC8vIGZyb20gdGhlIHByZXZpb3VzIHNlc3Npb24gaWYgdGhpcyBpcyB0aGUgaW5pdGlhbCBzdGFydHVwIGFuZCB3ZSBoYXZlXG5cdFx0Ly8gbm90IHJlc3RvcmVkIHdpbmRvd3MgYWxyZWFkeSBvdGhlcndpc2UuXG5cdFx0Ly8gVXNlIGB1bnNoaWZ0YCB0byBlbnN1cmUgYW55IG5ldyB3aW5kb3cgdG8gb3BlbiBjb21lcyBsYXN0IGZvciBwcm9wZXJcblx0XHQvLyBmb2N1cyB0cmVhdG1lbnQuXG5cdFx0aWYgKG9wZW5Db25maWcuaW5pdGlhbFN0YXJ0dXAgJiYgIWlzUmVzdG9yaW5nUGF0aHMgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV2luZG93U2V0dGluZ3MgfCB1bmRlZmluZWQ+KCd3aW5kb3cnKT8ucmVzdG9yZVdpbmRvd3MgPT09ICdwcmVzZXJ2ZScpIHtcblx0XHRcdGNvbnN0IGxhc3RTZXNzaW9uUGF0aHMgPSBhd2FpdCB0aGlzLmRvR2V0UGF0aHNGcm9tTGFzdFNlc3Npb24oKTtcblx0XHRcdHBhdGhzVG9PcGVuLnVuc2hpZnQoLi4ubGFzdFNlc3Npb25QYXRocy5maWx0ZXIocGF0aCA9PiBpc1dvcmtzcGFjZVBhdGhUb09wZW4ocGF0aCkgfHwgaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VQYXRoVG9PcGVuKHBhdGgpIHx8IHBhdGguYmFja3VwUGF0aCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwYXRoc1RvT3Blbjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9FeHRyYWN0UGF0aHNGcm9tQVBJKG9wZW5Db25maWc6IElPcGVuQ29uZmlndXJhdGlvbik6IFByb21pc2U8SVBhdGhUb09wZW5bXT4ge1xuXHRcdGNvbnN0IHBhdGhSZXNvbHZlT3B0aW9uczogSVBhdGhSZXNvbHZlT3B0aW9ucyA9IHtcblx0XHRcdGdvdG9MaW5lTW9kZTogb3BlbkNvbmZpZy5nb3RvTGluZU1vZGUsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IG9wZW5Db25maWcucmVtb3RlQXV0aG9yaXR5XG5cdFx0fTtcblxuXHRcdGNvbnN0IHBhdGhzVG9PcGVuID0gYXdhaXQgUHJvbWlzZS5hbGwoY29hbGVzY2Uob3BlbkNvbmZpZy51cmlzVG9PcGVuIHx8IFtdKS5tYXAoYXN5bmMgcGF0aFRvT3BlbiA9PiB7XG5cdFx0XHRjb25zdCBwYXRoID0gYXdhaXQgdGhpcy5yZXNvbHZlT3BlbmFibGUocGF0aFRvT3BlbiwgcGF0aFJlc29sdmVPcHRpb25zKTtcblxuXHRcdFx0Ly8gUGF0aCBleGlzdHNcblx0XHRcdGlmIChwYXRoKSB7XG5cdFx0XHRcdHBhdGgubGFiZWwgPSBwYXRoVG9PcGVuLmxhYmVsO1xuXG5cdFx0XHRcdHJldHVybiBwYXRoO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBQYXRoIGRvZXMgbm90IGV4aXN0OiBzaG93IGEgd2FybmluZyBib3hcblx0XHRcdGNvbnN0IHVyaSA9IHRoaXMucmVzb3VyY2VGcm9tT3BlbmFibGUocGF0aFRvT3Blbik7XG5cblx0XHRcdHRoaXMuZGlhbG9nTWFpblNlcnZpY2Uuc2hvd01lc3NhZ2VCb3goe1xuXHRcdFx0XHR0eXBlOiAnaW5mbycsXG5cdFx0XHRcdGJ1dHRvbnM6IFtsb2NhbGl6ZSh7IGtleTogJ29rJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmT0tcIildLFxuXHRcdFx0XHRtZXNzYWdlOiB1cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgPyBsb2NhbGl6ZSgncGF0aE5vdEV4aXN0VGl0bGUnLCBcIlBhdGggZG9lcyBub3QgZXhpc3RcIikgOiBsb2NhbGl6ZSgndXJpSW52YWxpZFRpdGxlJywgXCJVUkkgY2FuIG5vdCBiZSBvcGVuZWRcIiksXG5cdFx0XHRcdGRldGFpbDogdXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID9cblx0XHRcdFx0XHRsb2NhbGl6ZSgncGF0aE5vdEV4aXN0RGV0YWlsJywgXCJUaGUgcGF0aCAnezB9JyBkb2VzIG5vdCBleGlzdCBvbiB0aGlzIGNvbXB1dGVyLlwiLCBnZXRQYXRoTGFiZWwodXJpLCB7IG9zOiBPUywgdGlsZGlmeTogdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0pKSA6XG5cdFx0XHRcdFx0bG9jYWxpemUoJ3VyaUludmFsaWREZXRhaWwnLCBcIlRoZSBVUkkgJ3swfScgaXMgbm90IHZhbGlkIGFuZCBjYW4gbm90IGJlIG9wZW5lZC5cIiwgdXJpLnRvU3RyaW5nKHRydWUpKVxuXHRcdFx0fSwgQnJvd3NlcldpbmRvdy5nZXRGb2N1c2VkV2luZG93KCkgPz8gdW5kZWZpbmVkKTtcblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gY29hbGVzY2UocGF0aHNUb09wZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0V4dHJhY3RQYXRoc0Zyb21DTEkoY2xpOiBOYXRpdmVQYXJzZWRBcmdzKTogUHJvbWlzZTxJUGF0aFtdPiB7XG5cdFx0Y29uc3QgcGF0aHNUb09wZW46IElQYXRoVG9PcGVuW10gPSBbXTtcblx0XHRjb25zdCBwYXRoUmVzb2x2ZU9wdGlvbnM6IElQYXRoUmVzb2x2ZU9wdGlvbnMgPSB7XG5cdFx0XHRpZ25vcmVGaWxlTm90Rm91bmQ6IHRydWUsXG5cdFx0XHRnb3RvTGluZU1vZGU6IGNsaS5nb3RvLFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5OiBjbGkucmVtb3RlIHx8IHVuZGVmaW5lZCxcblx0XHRcdGZvcmNlT3BlbldvcmtzcGFjZUFzRmlsZTpcblx0XHRcdFx0Ly8gc3BlY2lhbCBjYXNlIGRpZmYgLyBtZXJnZSBtb2RlIHRvIGZvcmNlIG9wZW5cblx0XHRcdFx0Ly8gd29ya3NwYWNlIGFzIGZpbGVcblx0XHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE0OTczMVxuXHRcdFx0XHRjbGkuZGlmZiAmJiBjbGkuXy5sZW5ndGggPT09IDIgfHxcblx0XHRcdFx0Y2xpLm1lcmdlICYmIGNsaS5fLmxlbmd0aCA9PT0gNFxuXHRcdH07XG5cblx0XHQvLyBmb2xkZXIgdXJpc1xuXHRcdGNvbnN0IGZvbGRlclVyaXMgPSBjbGlbJ2ZvbGRlci11cmknXTtcblx0XHRpZiAoZm9sZGVyVXJpcykge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRGb2xkZXJVcmlzID0gYXdhaXQgUHJvbWlzZS5hbGwoZm9sZGVyVXJpcy5tYXAocmF3Rm9sZGVyVXJpID0+IHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gdGhpcy5jbGlBcmdUb1VyaShyYXdGb2xkZXJVcmkpO1xuXHRcdFx0XHRpZiAoIWZvbGRlclVyaSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlT3BlbmFibGUoeyBmb2xkZXJVcmkgfSwgcGF0aFJlc29sdmVPcHRpb25zKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0cGF0aHNUb09wZW4ucHVzaCguLi5jb2FsZXNjZShyZXNvbHZlZEZvbGRlclVyaXMpKTtcblx0XHR9XG5cblx0XHQvLyBmaWxlIHVyaXNcblx0XHRjb25zdCBmaWxlVXJpcyA9IGNsaVsnZmlsZS11cmknXTtcblx0XHRpZiAoZmlsZVVyaXMpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkRmlsZVVyaXMgPSBhd2FpdCBQcm9taXNlLmFsbChmaWxlVXJpcy5tYXAocmF3RmlsZVVyaSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZpbGVVcmkgPSB0aGlzLmNsaUFyZ1RvVXJpKHJhd0ZpbGVVcmkpO1xuXHRcdFx0XHRpZiAoIWZpbGVVcmkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMucmVzb2x2ZU9wZW5hYmxlKGhhc1dvcmtzcGFjZUZpbGVFeHRlbnNpb24ocmF3RmlsZVVyaSkgPyB7IHdvcmtzcGFjZVVyaTogZmlsZVVyaSB9IDogeyBmaWxlVXJpIH0sIHBhdGhSZXNvbHZlT3B0aW9ucyk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHBhdGhzVG9PcGVuLnB1c2goLi4uY29hbGVzY2UocmVzb2x2ZWRGaWxlVXJpcykpO1xuXHRcdH1cblxuXHRcdC8vIGZvbGRlciBvciBmaWxlIHBhdGhzXG5cdFx0Y29uc3QgcmVzb2x2ZWRDbGlQYXRocyA9IGF3YWl0IFByb21pc2UuYWxsKGNsaS5fLm1hcChjbGlQYXRoID0+IHtcblx0XHRcdHJldHVybiBwYXRoUmVzb2x2ZU9wdGlvbnMucmVtb3RlQXV0aG9yaXR5ID8gdGhpcy5kb1Jlc29sdmVSZW1vdGVQYXRoKGNsaVBhdGgsIHBhdGhSZXNvbHZlT3B0aW9ucykgOiB0aGlzLmRvUmVzb2x2ZUZpbGVQYXRoKGNsaVBhdGgsIHBhdGhSZXNvbHZlT3B0aW9ucyk7XG5cdFx0fSkpO1xuXG5cdFx0cGF0aHNUb09wZW4ucHVzaCguLi5jb2FsZXNjZShyZXNvbHZlZENsaVBhdGhzKSk7XG5cblx0XHRyZXR1cm4gcGF0aHNUb09wZW47XG5cdH1cblxuXHRwcml2YXRlIGNsaUFyZ1RvVXJpKGFyZzogc3RyaW5nKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKGFyZyk7XG5cdFx0XHRpZiAoIXVyaS5zY2hlbWUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBJbnZhbGlkIFVSSSBpbnB1dCBzdHJpbmcsIHNjaGVtZSBtaXNzaW5nOiAke2FyZ31gKTtcblxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF1cmkucGF0aCkge1xuXHRcdFx0XHRyZXR1cm4gdXJpLndpdGgoeyBwYXRoOiAnLycgfSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB1cmk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBJbnZhbGlkIFVSSSBpbnB1dCBzdHJpbmc6ICR7YXJnfSwgJHtlLm1lc3NhZ2V9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9HZXRQYXRoc0Zyb21MYXN0U2Vzc2lvbigpOiBQcm9taXNlPElQYXRoVG9PcGVuW10+IHtcblx0XHRjb25zdCByZXN0b3JlV2luZG93c1NldHRpbmcgPSB0aGlzLmdldFJlc3RvcmVXaW5kb3dzU2V0dGluZygpO1xuXG5cdFx0c3dpdGNoIChyZXN0b3JlV2luZG93c1NldHRpbmcpIHtcblxuXHRcdFx0Ly8gbm9uZTogbm8gd2luZG93IHRvIHJlc3RvcmVcblx0XHRcdGNhc2UgJ25vbmUnOlxuXHRcdFx0XHRyZXR1cm4gW107XG5cblx0XHRcdC8vIG9uZTogcmVzdG9yZSBsYXN0IG9wZW5lZCB3b3Jrc3BhY2UvZm9sZGVyIG9yIGVtcHR5IHdpbmRvd1xuXHRcdFx0Ly8gYWxsOiByZXN0b3JlIGFsbCB3aW5kb3dzXG5cdFx0XHQvLyBmb2xkZXJzOiByZXN0b3JlIGxhc3Qgb3BlbmVkIGZvbGRlcnMgb25seVxuXHRcdFx0Y2FzZSAnb25lJzpcblx0XHRcdGNhc2UgJ2FsbCc6XG5cdFx0XHRjYXNlICdwcmVzZXJ2ZSc6XG5cdFx0XHRjYXNlICdmb2xkZXJzJzoge1xuXG5cdFx0XHRcdC8vIENvbGxlY3QgcHJldmlvdXNseSBvcGVuZWQgd2luZG93c1xuXHRcdFx0XHRjb25zdCBsYXN0U2Vzc2lvbldpbmRvd3M6IElXaW5kb3dTdGF0ZVtdID0gW107XG5cdFx0XHRcdGlmIChyZXN0b3JlV2luZG93c1NldHRpbmcgIT09ICdvbmUnKSB7XG5cdFx0XHRcdFx0bGFzdFNlc3Npb25XaW5kb3dzLnB1c2goLi4udGhpcy53aW5kb3dzU3RhdGVIYW5kbGVyLnN0YXRlLm9wZW5lZFdpbmRvd3MpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLndpbmRvd3NTdGF0ZUhhbmRsZXIuc3RhdGUubGFzdEFjdGl2ZVdpbmRvdykge1xuXHRcdFx0XHRcdGxhc3RTZXNzaW9uV2luZG93cy5wdXNoKHRoaXMud2luZG93c1N0YXRlSGFuZGxlci5zdGF0ZS5sYXN0QWN0aXZlV2luZG93KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHBhdGhzVG9PcGVuID0gYXdhaXQgUHJvbWlzZS5hbGwobGFzdFNlc3Npb25XaW5kb3dzLm1hcChhc3luYyBsYXN0U2Vzc2lvbldpbmRvdyA9PiB7XG5cblx0XHRcdFx0XHQvLyBXb3Jrc3BhY2VzXG5cdFx0XHRcdFx0aWYgKGxhc3RTZXNzaW9uV2luZG93LndvcmtzcGFjZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcGF0aFRvT3BlbiA9IGF3YWl0IHRoaXMucmVzb2x2ZU9wZW5hYmxlKHsgd29ya3NwYWNlVXJpOiBsYXN0U2Vzc2lvbldpbmRvdy53b3Jrc3BhY2UuY29uZmlnUGF0aCB9LCB7IHJlbW90ZUF1dGhvcml0eTogbGFzdFNlc3Npb25XaW5kb3cucmVtb3RlQXV0aG9yaXR5LCByZWplY3RUcmFuc2llbnRXb3Jrc3BhY2VzOiB0cnVlIC8qIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTk2OTUgKi8gfSk7XG5cdFx0XHRcdFx0XHRpZiAoaXNXb3Jrc3BhY2VQYXRoVG9PcGVuKHBhdGhUb09wZW4pKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBwYXRoVG9PcGVuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEZvbGRlcnNcblx0XHRcdFx0XHRlbHNlIGlmIChsYXN0U2Vzc2lvbldpbmRvdy5mb2xkZXJVcmkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBhdGhUb09wZW4gPSBhd2FpdCB0aGlzLnJlc29sdmVPcGVuYWJsZSh7IGZvbGRlclVyaTogbGFzdFNlc3Npb25XaW5kb3cuZm9sZGVyVXJpIH0sIHsgcmVtb3RlQXV0aG9yaXR5OiBsYXN0U2Vzc2lvbldpbmRvdy5yZW1vdGVBdXRob3JpdHkgfSk7XG5cdFx0XHRcdFx0XHRpZiAoaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VQYXRoVG9PcGVuKHBhdGhUb09wZW4pKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBwYXRoVG9PcGVuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEVtcHR5IHdpbmRvdywgcG90ZW50aWFsbHkgZWRpdG9ycyBvcGVuIHRvIGJlIHJlc3RvcmVkXG5cdFx0XHRcdFx0ZWxzZSBpZiAocmVzdG9yZVdpbmRvd3NTZXR0aW5nICE9PSAnZm9sZGVycycgJiYgbGFzdFNlc3Npb25XaW5kb3cuYmFja3VwUGF0aCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgYmFja3VwUGF0aDogbGFzdFNlc3Npb25XaW5kb3cuYmFja3VwUGF0aCwgcmVtb3RlQXV0aG9yaXR5OiBsYXN0U2Vzc2lvbldpbmRvdy5yZW1vdGVBdXRob3JpdHkgfTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0cmV0dXJuIGNvYWxlc2NlKHBhdGhzVG9PcGVuKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFJlc3RvcmVXaW5kb3dzU2V0dGluZygpOiBSZXN0b3JlV2luZG93c1NldHRpbmcge1xuXHRcdGxldCByZXN0b3JlV2luZG93czogUmVzdG9yZVdpbmRvd3NTZXR0aW5nO1xuXHRcdGlmICh0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLndhc1Jlc3RhcnRlZCkge1xuXHRcdFx0cmVzdG9yZVdpbmRvd3MgPSAnYWxsJzsgLy8gYWx3YXlzIHJlb3BlbiBhbGwgd2luZG93cyB3aGVuIGFuIHVwZGF0ZSB3YXMgYXBwbGllZFxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB3aW5kb3dDb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElXaW5kb3dTZXR0aW5ncyB8IHVuZGVmaW5lZD4oJ3dpbmRvdycpO1xuXHRcdFx0cmVzdG9yZVdpbmRvd3MgPSB3aW5kb3dDb25maWc/LnJlc3RvcmVXaW5kb3dzIHx8ICdhbGwnOyAvLyBieSBkZWZhdWx0IHJlc3RvcmUgYWxsIHdpbmRvd3NcblxuXHRcdFx0aWYgKCFbJ3ByZXNlcnZlJywgJ2FsbCcsICdmb2xkZXJzJywgJ29uZScsICdub25lJ10uaW5jbHVkZXMocmVzdG9yZVdpbmRvd3MpKSB7XG5cdFx0XHRcdHJlc3RvcmVXaW5kb3dzID0gJ2FsbCc7IC8vIGJ5IGRlZmF1bHQgcmVzdG9yZSBhbGwgd2luZG93c1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN0b3JlV2luZG93cztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9HZXRXb3Jrc3BhY2VNYXRjaGluZ0ZvbGRlcnNGcm9tTGFzdFNlc3Npb24ocmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQsIGZvbGRlcnM6IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VQYXRoVG9PcGVuW10pOiBQcm9taXNlPElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlcyA9IChhd2FpdCB0aGlzLmRvR2V0UGF0aHNGcm9tTGFzdFNlc3Npb24oKSkuZmlsdGVyKHBhdGggPT4gaXNXb3Jrc3BhY2VQYXRoVG9PcGVuKHBhdGgpKTtcblx0XHRjb25zdCBmb2xkZXJVcmlzID0gZm9sZGVycy5tYXAoZm9sZGVyID0+IGZvbGRlci53b3Jrc3BhY2UudXJpKTtcblxuXHRcdGZvciAoY29uc3QgeyB3b3Jrc3BhY2UgfSBvZiB3b3Jrc3BhY2VzKSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZFdvcmtzcGFjZSA9IGF3YWl0IHRoaXMud29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS5yZXNvbHZlTG9jYWxXb3Jrc3BhY2Uod29ya3NwYWNlLmNvbmZpZ1BhdGgpO1xuXHRcdFx0aWYgKFxuXHRcdFx0XHQhcmVzb2x2ZWRXb3Jrc3BhY2UgfHxcblx0XHRcdFx0cmVzb2x2ZWRXb3Jrc3BhY2UucmVtb3RlQXV0aG9yaXR5ICE9PSByZW1vdGVBdXRob3JpdHkgfHxcblx0XHRcdFx0cmVzb2x2ZWRXb3Jrc3BhY2UudHJhbnNpZW50IHx8XG5cdFx0XHRcdHJlc29sdmVkV29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoICE9PSBmb2xkZXJzLmxlbmd0aFxuXHRcdFx0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmb2xkZXJTZXQgPSBuZXcgUmVzb3VyY2VTZXQoZm9sZGVyVXJpcywgdXJpID0+IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmdldENvbXBhcmlzb25LZXkodXJpKSk7XG5cdFx0XHRpZiAocmVzb2x2ZWRXb3Jrc3BhY2UuZm9sZGVycy5ldmVyeShmb2xkZXIgPT4gZm9sZGVyU2V0Lmhhcyhmb2xkZXIudXJpKSkpIHtcblx0XHRcdFx0cmV0dXJuIHJlc29sdmVkV29ya3NwYWNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVPcGVuYWJsZShvcGVuYWJsZTogSVdpbmRvd09wZW5hYmxlLCBvcHRpb25zOiBJUGF0aFJlc29sdmVPcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKSk6IFByb21pc2U8SVBhdGhUb09wZW4gfCB1bmRlZmluZWQ+IHtcblxuXHRcdC8vIGhhbmRsZSBmaWxlOi8vIG9wZW5hYmxlcyB3aXRoIHNvbWUgZXh0cmEgdmFsaWRhdGlvblxuXHRcdGNvbnN0IHVyaSA9IHRoaXMucmVzb3VyY2VGcm9tT3BlbmFibGUob3BlbmFibGUpO1xuXHRcdGlmICh1cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdGlmIChpc0ZpbGVUb09wZW4ob3BlbmFibGUpKSB7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGZvcmNlT3BlbldvcmtzcGFjZUFzRmlsZTogdHJ1ZSB9O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5kb1Jlc29sdmVGaWxlUGF0aCh1cmkuZnNQYXRoLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBoYW5kbGUgbm9uIGZpbGU6Ly8gb3BlbmFibGVzXG5cdFx0cmV0dXJuIHRoaXMuZG9SZXNvbHZlUmVtb3RlT3BlbmFibGUob3BlbmFibGUsIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1Jlc29sdmVSZW1vdGVPcGVuYWJsZShvcGVuYWJsZTogSVdpbmRvd09wZW5hYmxlLCBvcHRpb25zOiBJUGF0aFJlc29sdmVPcHRpb25zKTogSVBhdGhUb09wZW48SVRleHRFZGl0b3JPcHRpb25zPiB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHVyaSA9IHRoaXMucmVzb3VyY2VGcm9tT3BlbmFibGUob3BlbmFibGUpO1xuXG5cdFx0Ly8gdXNlIHJlbW90ZSBhdXRob3JpdHkgZnJvbSB2c2NvZGVcblx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSBnZXRSZW1vdGVBdXRob3JpdHkodXJpKSB8fCBvcHRpb25zLnJlbW90ZUF1dGhvcml0eTtcblxuXHRcdC8vIG5vcm1hbGl6ZSBVUklcblx0XHR1cmkgPSByZW1vdmVUcmFpbGluZ1BhdGhTZXBhcmF0b3Iobm9ybWFsaXplUGF0aCh1cmkpKTtcblxuXHRcdC8vIEZpbGVcblx0XHRpZiAoaXNGaWxlVG9PcGVuKG9wZW5hYmxlKSkge1xuXHRcdFx0aWYgKG9wdGlvbnMuZ290b0xpbmVNb2RlKSB7XG5cdFx0XHRcdGNvbnN0IHsgcGF0aCwgbGluZSwgY29sdW1uIH0gPSBwYXJzZUxpbmVBbmRDb2x1bW5Bd2FyZSh1cmkucGF0aCk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRmaWxlVXJpOiB1cmkud2l0aCh7IHBhdGggfSksXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0c2VsZWN0aW9uOiBsaW5lID8geyBzdGFydExpbmVOdW1iZXI6IGxpbmUsIHN0YXJ0Q29sdW1uOiBjb2x1bW4gfHwgMSB9IDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHlcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgZmlsZVVyaTogdXJpLCByZW1vdGVBdXRob3JpdHkgfTtcblx0XHR9XG5cblx0XHQvLyBXb3Jrc3BhY2Vcblx0XHRlbHNlIGlmIChpc1dvcmtzcGFjZVRvT3BlbihvcGVuYWJsZSkpIHtcblx0XHRcdHJldHVybiB7IHdvcmtzcGFjZTogZ2V0V29ya3NwYWNlSWRlbnRpZmllcih1cmkpLCByZW1vdGVBdXRob3JpdHkgfTtcblx0XHR9XG5cblx0XHQvLyBGb2xkZXJcblx0XHRyZXR1cm4geyB3b3Jrc3BhY2U6IGdldFNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIodXJpKSwgcmVtb3RlQXV0aG9yaXR5IH07XG5cdH1cblxuXHRwcml2YXRlIHJlc291cmNlRnJvbU9wZW5hYmxlKG9wZW5hYmxlOiBJV2luZG93T3BlbmFibGUpOiBVUkkge1xuXHRcdGlmIChpc1dvcmtzcGFjZVRvT3BlbihvcGVuYWJsZSkpIHtcblx0XHRcdHJldHVybiBvcGVuYWJsZS53b3Jrc3BhY2VVcmk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzRm9sZGVyVG9PcGVuKG9wZW5hYmxlKSkge1xuXHRcdFx0cmV0dXJuIG9wZW5hYmxlLmZvbGRlclVyaTtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3BlbmFibGUuZmlsZVVyaTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZXNvbHZlRmlsZVBhdGgocGF0aDogc3RyaW5nLCBvcHRpb25zOiBJUGF0aFJlc29sdmVPcHRpb25zLCBza2lwSGFuZGxlVU5DRXJyb3I/OiBib29sZWFuKTogUHJvbWlzZTxJUGF0aFRvT3BlbjxJVGV4dEVkaXRvck9wdGlvbnM+IHwgdW5kZWZpbmVkPiB7XG5cblx0XHQvLyBFeHRyYWN0IGxpbmUvY29sIGluZm9ybWF0aW9uIGZyb20gcGF0aFxuXHRcdGxldCBsaW5lTnVtYmVyOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNvbHVtbk51bWJlcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChvcHRpb25zLmdvdG9MaW5lTW9kZSkge1xuXHRcdFx0KHsgcGF0aCwgbGluZTogbGluZU51bWJlciwgY29sdW1uOiBjb2x1bW5OdW1iZXIgfSA9IHBhcnNlTGluZUFuZENvbHVtbkF3YXJlKHBhdGgpKTtcblx0XHR9XG5cblx0XHQvLyBFbnN1cmUgdGhlIHBhdGggaXMgbm9ybWFsaXplZCBhbmQgYWJzb2x1dGVcblx0XHRwYXRoID0gc2FuaXRpemVGaWxlUGF0aChub3JtYWxpemUocGF0aCksIGN3ZCgpKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXRoU3RhdCA9IGF3YWl0IGZzLnByb21pc2VzLnN0YXQocGF0aCk7XG5cblx0XHRcdC8vIEZpbGVcblx0XHRcdGlmIChwYXRoU3RhdC5pc0ZpbGUoKSkge1xuXG5cdFx0XHRcdC8vIFdvcmtzcGFjZSAodW5sZXNzIGRpc2FibGVkIHZpYSBmbGFnKVxuXHRcdFx0XHRpZiAoIW9wdGlvbnMuZm9yY2VPcGVuV29ya3NwYWNlQXNGaWxlKSB7XG5cdFx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLnJlc29sdmVMb2NhbFdvcmtzcGFjZShVUkkuZmlsZShwYXRoKSk7XG5cdFx0XHRcdFx0aWYgKHdvcmtzcGFjZSkge1xuXG5cdFx0XHRcdFx0XHQvLyBJZiB0aGUgd29ya3NwYWNlIGlzIHRyYW5zaWVudCBhbmQgd2UgYXJlIHRvIGlnbm9yZVxuXHRcdFx0XHRcdFx0Ly8gdHJhbnNpZW50IHdvcmtzcGFjZXMsIHJlamVjdCBpdC5cblx0XHRcdFx0XHRcdGlmICh3b3Jrc3BhY2UudHJhbnNpZW50ICYmIG9wdGlvbnMucmVqZWN0VHJhbnNpZW50V29ya3NwYWNlcykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHR3b3Jrc3BhY2U6IHsgaWQ6IHdvcmtzcGFjZS5pZCwgY29uZmlnUGF0aDogd29ya3NwYWNlLmNvbmZpZ1BhdGggfSxcblx0XHRcdFx0XHRcdFx0dHlwZTogRmlsZVR5cGUuRmlsZSxcblx0XHRcdFx0XHRcdFx0ZXhpc3RzOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IHdvcmtzcGFjZS5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHRcdFx0XHRcdHRyYW5zaWVudDogd29ya3NwYWNlLnRyYW5zaWVudFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGZpbGVVcmk6IFVSSS5maWxlKHBhdGgpLFxuXHRcdFx0XHRcdHR5cGU6IEZpbGVUeXBlLkZpbGUsXG5cdFx0XHRcdFx0ZXhpc3RzOiB0cnVlLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdHNlbGVjdGlvbjogbGluZU51bWJlciA/IHsgc3RhcnRMaW5lTnVtYmVyOiBsaW5lTnVtYmVyLCBzdGFydENvbHVtbjogY29sdW1uTnVtYmVyIHx8IDEgfSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRm9sZGVyXG5cdFx0XHRlbHNlIGlmIChwYXRoU3RhdC5pc0RpcmVjdG9yeSgpKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0d29ya3NwYWNlOiBnZXRTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKFVSSS5maWxlKHBhdGgpLCBwYXRoU3RhdCksXG5cdFx0XHRcdFx0dHlwZTogRmlsZVR5cGUuRGlyZWN0b3J5LFxuXHRcdFx0XHRcdGV4aXN0czogdHJ1ZVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTcGVjaWFsIGRldmljZTogaW4gUE9TSVggZW52aXJvbm1lbnRzLCB3ZSBtYXkgZ2V0IC9kZXYvbnVsbCBwYXNzZWRcblx0XHRcdC8vIGluIChmb3IgZXhhbXBsZSBnaXQgdXNlcyBpdCB0byBzaWduYWwgb25lIHNpZGUgb2YgYSBkaWZmIGRvZXMgbm90XG5cdFx0XHQvLyBleGlzdCkuIEluIHRoYXQgc3BlY2lhbCBjYXNlLCB0cmVhdCBpdCBsaWtlIGEgZmlsZSB0byBzdXBwb3J0IHRoaXNcblx0XHRcdC8vIHNjZW5hcmlvICgpXG5cdFx0XHRlbHNlIGlmICghaXNXaW5kb3dzICYmIHBhdGggPT09ICcvZGV2L251bGwnKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZmlsZVVyaTogVVJJLmZpbGUocGF0aCksXG5cdFx0XHRcdFx0dHlwZTogRmlsZVR5cGUuRmlsZSxcblx0XHRcdFx0XHRleGlzdHM6IHRydWVcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHRpZiAoZXJyb3IuY29kZSA9PT0gJ0VSUl9VTkNfSE9TVF9OT1RfQUxMT1dFRCcgJiYgIXNraXBIYW5kbGVVTkNFcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5vblVOQ0hvc3ROb3RBbGxvd2VkKHBhdGgsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmaWxlVXJpID0gVVJJLmZpbGUocGF0aCk7XG5cblx0XHRcdC8vIHNpbmNlIGZpbGUgZG9lcyBub3Qgc2VlbSB0byBleGlzdCBhbnltb3JlLCByZW1vdmUgZnJvbSByZWNlbnRcblx0XHRcdHRoaXMud29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZS5yZW1vdmVSZWNlbnRseU9wZW5lZChbZmlsZVVyaV0pO1xuXG5cdFx0XHQvLyBhc3N1bWUgdGhpcyBpcyBhIGZpbGUgdGhhdCBkb2VzIG5vdCB5ZXQgZXhpc3Rcblx0XHRcdGlmIChvcHRpb25zLmlnbm9yZUZpbGVOb3RGb3VuZCAmJiBlcnJvci5jb2RlID09PSAnRU5PRU5UJykge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGZpbGVVcmksXG5cdFx0XHRcdFx0dHlwZTogRmlsZVR5cGUuRmlsZSxcblx0XHRcdFx0XHRleGlzdHM6IGZhbHNlXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgSW52YWxpZCBwYXRoIHByb3ZpZGVkOiAke3BhdGh9LCAke2Vycm9yLm1lc3NhZ2V9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25VTkNIb3N0Tm90QWxsb3dlZChwYXRoOiBzdHJpbmcsIG9wdGlvbnM6IElQYXRoUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPElQYXRoVG9PcGVuPElUZXh0RWRpdG9yT3B0aW9ucz4gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZShwYXRoKTtcblxuXHRcdGNvbnN0IHsgcmVzcG9uc2UsIGNoZWNrYm94Q2hlY2tlZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dNYWluU2VydmljZS5zaG93TWVzc2FnZUJveCh7XG5cdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKHsga2V5OiAnYWxsb3cnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZBbGxvd1wiKSxcblx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdjYW5jZWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDYW5jZWxcIiksXG5cdFx0XHRcdGxvY2FsaXplKHsga2V5OiAnbGVhcm5Nb3JlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTGVhcm4gTW9yZVwiKSxcblx0XHRcdF0sXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybU9wZW5NZXNzYWdlJywgXCJUaGUgaG9zdCAnezB9JyB3YXMgbm90IGZvdW5kIGluIHRoZSBsaXN0IG9mIGFsbG93ZWQgaG9zdHMuIERvIHlvdSB3YW50IHRvIGFsbG93IGl0IGFueXdheT9cIiwgdXJpLmF1dGhvcml0eSksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjb25maXJtT3BlbkRldGFpbCcsIFwiVGhlIHBhdGggJ3swfScgdXNlcyBhIGhvc3QgdGhhdCBpcyBub3QgYWxsb3dlZC4gVW5sZXNzIHlvdSB0cnVzdCB0aGUgaG9zdCwgeW91IHNob3VsZCBwcmVzcyAnQ2FuY2VsJ1wiLCBnZXRQYXRoTGFiZWwodXJpLCB7IG9zOiBPUywgdGlsZGlmeTogdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0pKSxcblx0XHRcdGNoZWNrYm94TGFiZWw6IGxvY2FsaXplKCdkb05vdEFza0FnYWluJywgXCJQZXJtYW5lbnRseSBhbGxvdyBob3N0ICd7MH0nXCIsIHVyaS5hdXRob3JpdHkpLFxuXHRcdFx0Y2FuY2VsSWQ6IDFcblx0XHR9KTtcblxuXHRcdGlmIChyZXNwb25zZSA9PT0gMCkge1xuXHRcdFx0YWRkVU5DSG9zdFRvQWxsb3dsaXN0KHVyaS5hdXRob3JpdHkpO1xuXG5cdFx0XHRpZiAoY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHRcdC8vIER1ZSB0byBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTk1NDM2LCB3ZSBjYW4gb25seVxuXHRcdFx0XHQvLyB1cGRhdGUgc2V0dGluZ3MgZnJvbSB3aXRoaW4gYSB3aW5kb3cuIEJ1dCB3ZSBkbyBub3Qga25vdyBpZiBhIHdpbmRvd1xuXHRcdFx0XHQvLyBpcyBhYm91dCB0byBvcGVuIG9yIGNhbiBhbHJlYWR5IGhhbmRsZSB0aGUgcmVxdWVzdCwgc28gd2UgaGF2ZSB0byBzZW5kXG5cdFx0XHRcdC8vIHRvIGFueSBjdXJyZW50IHdpbmRvdyBhbmQgYW55IG5ld2x5IG9wZW5pbmcgd2luZG93LlxuXHRcdFx0XHRjb25zdCByZXF1ZXN0ID0geyBjaGFubmVsOiAndnNjb2RlOmNvbmZpZ3VyZUFsbG93ZWRVTkNIb3N0JywgYXJnczogdXJpLmF1dGhvcml0eSB9O1xuXHRcdFx0XHR0aGlzLnNlbmRUb0ZvY3VzZWQocmVxdWVzdC5jaGFubmVsLCByZXF1ZXN0LmFyZ3MpO1xuXHRcdFx0XHR0aGlzLnNlbmRUb09wZW5pbmdXaW5kb3cocmVxdWVzdC5jaGFubmVsLCByZXF1ZXN0LmFyZ3MpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5kb1Jlc29sdmVGaWxlUGF0aChwYXRoLCBvcHRpb25zLCB0cnVlIC8qIGRvIG5vdCBoYW5kbGUgVU5DIGVycm9yIGFnYWluICovKTtcblx0XHR9XG5cblx0XHRpZiAocmVzcG9uc2UgPT09IDIpIHtcblx0XHRcdHNoZWxsLm9wZW5FeHRlcm5hbCgnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXdpbmRvd3MtdW5jJyk7XG5cblx0XHRcdHJldHVybiB0aGlzLm9uVU5DSG9zdE5vdEFsbG93ZWQocGF0aCwgb3B0aW9ucyk7IC8vIGtlZXAgc2hvd2luZyB0aGUgZGlhbG9nIHVudGlsIGRlY2lzaW9uIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTgxOTU2KVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGRvUmVzb2x2ZVJlbW90ZVBhdGgocGF0aDogc3RyaW5nLCBvcHRpb25zOiBJUGF0aFJlc29sdmVPcHRpb25zKTogSVBhdGhUb09wZW48SVRleHRFZGl0b3JPcHRpb25zPiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZmlyc3QgPSBwYXRoLmNoYXJDb2RlQXQoMCk7XG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gb3B0aW9ucy5yZW1vdGVBdXRob3JpdHk7XG5cblx0XHQvLyBFeHRyYWN0IGxpbmUvY29sIGluZm9ybWF0aW9uIGZyb20gcGF0aFxuXHRcdGxldCBsaW5lTnVtYmVyOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNvbHVtbk51bWJlcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKG9wdGlvbnMuZ290b0xpbmVNb2RlKSB7XG5cdFx0XHQoeyBwYXRoLCBsaW5lOiBsaW5lTnVtYmVyLCBjb2x1bW46IGNvbHVtbk51bWJlciB9ID0gcGFyc2VMaW5lQW5kQ29sdW1uQXdhcmUocGF0aCkpO1xuXHRcdH1cblxuXHRcdC8vIG1ha2UgYWJzb2x1dGVcblx0XHRpZiAoZmlyc3QgIT09IENoYXJDb2RlLlNsYXNoKSB7XG5cdFx0XHRpZiAoaXNXaW5kb3dzRHJpdmVMZXR0ZXIoZmlyc3QpICYmIHBhdGguY2hhckNvZGVBdChwYXRoLmNoYXJDb2RlQXQoMSkpID09PSBDaGFyQ29kZS5Db2xvbikge1xuXHRcdFx0XHRwYXRoID0gdG9TbGFzaGVzKHBhdGgpO1xuXHRcdFx0fVxuXG5cdFx0XHRwYXRoID0gYC8ke3BhdGh9YDtcblx0XHR9XG5cblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVSZW1vdGUsIGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5LCBwYXRoOiBwYXRoIH0pO1xuXG5cdFx0Ly8gZ3Vlc3MgdGhlIGZpbGUgdHlwZTpcblx0XHQvLyAtIGlmIGl0IGVuZHMgd2l0aCBhIHNsYXNoIGl0J3MgYSBmb2xkZXJcblx0XHQvLyAtIGlmIGluIGdvdG8gbGluZSBtb2RlIG9yIGlmIGl0IGhhcyBhIGZpbGUgZXh0ZW5zaW9uLCBpdCdzIGEgZmlsZSBvciBhIHdvcmtzcGFjZVxuXHRcdC8vIC0gYnkgZGVmYXVsdHMgaXQncyBhIGZvbGRlclxuXHRcdGlmIChwYXRoLmNoYXJDb2RlQXQocGF0aC5sZW5ndGggLSAxKSAhPT0gQ2hhckNvZGUuU2xhc2gpIHtcblxuXHRcdFx0Ly8gZmlsZSBuYW1lIGVuZHMgd2l0aCAuY29kZS13b3Jrc3BhY2Vcblx0XHRcdGlmIChoYXNXb3Jrc3BhY2VGaWxlRXh0ZW5zaW9uKHBhdGgpKSB7XG5cdFx0XHRcdGlmIChvcHRpb25zLmZvcmNlT3BlbldvcmtzcGFjZUFzRmlsZSkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRmaWxlVXJpOiB1cmksXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdHNlbGVjdGlvbjogbGluZU51bWJlciA/IHsgc3RhcnRMaW5lTnVtYmVyOiBsaW5lTnVtYmVyLCBzdGFydENvbHVtbjogY29sdW1uTnVtYmVyIHx8IDEgfSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogb3B0aW9ucy5yZW1vdGVBdXRob3JpdHlcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHsgd29ya3NwYWNlOiBnZXRXb3Jrc3BhY2VJZGVudGlmaWVyKHVyaSksIHJlbW90ZUF1dGhvcml0eSB9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBmaWxlIG5hbWUgc3RhcnRzIHdpdGggYSBkb3Qgb3IgaGFzIGFuIGZpbGUgZXh0ZW5zaW9uXG5cdFx0XHRlbHNlIGlmIChvcHRpb25zLmdvdG9MaW5lTW9kZSB8fCBwb3NpeC5iYXNlbmFtZShwYXRoKS5pbmRleE9mKCcuJykgIT09IC0xKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZmlsZVVyaTogdXJpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdHNlbGVjdGlvbjogbGluZU51bWJlciA/IHsgc3RhcnRMaW5lTnVtYmVyOiBsaW5lTnVtYmVyLCBzdGFydENvbHVtbjogY29sdW1uTnVtYmVyIHx8IDEgfSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgd29ya3NwYWNlOiBnZXRTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHVyaSksIHJlbW90ZUF1dGhvcml0eSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRPcGVuTmV3V2luZG93KG9wZW5Db25maWc6IElPcGVuQ29uZmlndXJhdGlvbik6IHsgb3BlbkZvbGRlckluTmV3V2luZG93OiBib29sZWFuOyBvcGVuRmlsZXNJbk5ld1dpbmRvdzogYm9vbGVhbiB9IHtcblxuXHRcdC8vIGxldCB0aGUgdXNlciBzZXR0aW5ncyBvdmVycmlkZSBob3cgZm9sZGVycyBhcmUgb3BlbiBpbiBhIG5ldyB3aW5kb3cgb3Igc2FtZSB3aW5kb3cgdW5sZXNzIHdlIGFyZSBmb3JjZWRcblx0XHRjb25zdCB3aW5kb3dDb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElXaW5kb3dTZXR0aW5ncyB8IHVuZGVmaW5lZD4oJ3dpbmRvdycpO1xuXHRcdGNvbnN0IG9wZW5Gb2xkZXJJbk5ld1dpbmRvd0NvbmZpZyA9IHdpbmRvd0NvbmZpZz8ub3BlbkZvbGRlcnNJbk5ld1dpbmRvdyB8fCAnZGVmYXVsdCcgLyogZGVmYXVsdCAqLztcblx0XHRjb25zdCBvcGVuRmlsZXNJbk5ld1dpbmRvd0NvbmZpZyA9IHdpbmRvd0NvbmZpZz8ub3BlbkZpbGVzSW5OZXdXaW5kb3cgfHwgJ29mZicgLyogZGVmYXVsdCAqLztcblxuXHRcdGxldCBvcGVuRm9sZGVySW5OZXdXaW5kb3cgPSAob3BlbkNvbmZpZy5wcmVmZXJOZXdXaW5kb3cgfHwgb3BlbkNvbmZpZy5mb3JjZU5ld1dpbmRvdykgJiYgIW9wZW5Db25maWcuZm9yY2VSZXVzZVdpbmRvdztcblx0XHRpZiAoIW9wZW5Db25maWcuZm9yY2VOZXdXaW5kb3cgJiYgIW9wZW5Db25maWcuZm9yY2VSZXVzZVdpbmRvdyAmJiAob3BlbkZvbGRlckluTmV3V2luZG93Q29uZmlnID09PSAnb24nIHx8IG9wZW5Gb2xkZXJJbk5ld1dpbmRvd0NvbmZpZyA9PT0gJ29mZicpKSB7XG5cdFx0XHRvcGVuRm9sZGVySW5OZXdXaW5kb3cgPSAob3BlbkZvbGRlckluTmV3V2luZG93Q29uZmlnID09PSAnb24nKTtcblx0XHR9XG5cblx0XHQvLyBsZXQgdGhlIHVzZXIgc2V0dGluZ3Mgb3ZlcnJpZGUgaG93IGZpbGVzIGFyZSBvcGVuIGluIGEgbmV3IHdpbmRvdyBvciBzYW1lIHdpbmRvdyB1bmxlc3Mgd2UgYXJlIGZvcmNlZCAobm90IGZvciBleHRlbnNpb24gZGV2ZWxvcG1lbnQgdGhvdWdoKVxuXHRcdGxldCBvcGVuRmlsZXNJbk5ld1dpbmRvdyA9IGZhbHNlO1xuXHRcdGlmIChvcGVuQ29uZmlnLmZvcmNlTmV3V2luZG93IHx8IG9wZW5Db25maWcuZm9yY2VSZXVzZVdpbmRvdykge1xuXHRcdFx0b3BlbkZpbGVzSW5OZXdXaW5kb3cgPSAhIW9wZW5Db25maWcuZm9yY2VOZXdXaW5kb3cgJiYgIW9wZW5Db25maWcuZm9yY2VSZXVzZVdpbmRvdztcblx0XHR9IGVsc2Uge1xuXG5cdFx0XHQvLyBtYWNPUzogYnkgZGVmYXVsdCB3ZSBvcGVuIGZpbGVzIGluIGEgbmV3IHdpbmRvdyBpZiB0aGlzIGlzIHRyaWdnZXJlZCB2aWEgRE9DSyBjb250ZXh0XG5cdFx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdFx0aWYgKG9wZW5Db25maWcuY29udGV4dCA9PT0gT3BlbkNvbnRleHQuRE9DSykge1xuXHRcdFx0XHRcdG9wZW5GaWxlc0luTmV3V2luZG93ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBMaW51eC9XaW5kb3dzOiBieSBkZWZhdWx0IHdlIG9wZW4gZmlsZXMgaW4gdGhlIG5ldyB3aW5kb3cgdW5sZXNzIHRyaWdnZXJlZCB2aWEgRElBTE9HIC8gTUVOVSBjb250ZXh0XG5cdFx0XHQvLyBvciBmcm9tIHRoZSBpbnRlZ3JhdGVkIHRlcm1pbmFsIHdoZXJlIHdlIGFzc3VtZSB0aGUgdXNlciBwcmVmZXJzIHRvIG9wZW4gaW4gdGhlIGN1cnJlbnQgd2luZG93XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0aWYgKG9wZW5Db25maWcuY29udGV4dCAhPT0gT3BlbkNvbnRleHQuRElBTE9HICYmIG9wZW5Db25maWcuY29udGV4dCAhPT0gT3BlbkNvbnRleHQuTUVOVSAmJiAhKG9wZW5Db25maWcudXNlckVudiAmJiBvcGVuQ29uZmlnLnVzZXJFbnZbJ1RFUk1fUFJPR1JBTSddID09PSAndnNjb2RlJykpIHtcblx0XHRcdFx0XHRvcGVuRmlsZXNJbk5ld1dpbmRvdyA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gZmluYWxseSBjaGVjayBmb3Igb3ZlcnJpZGVzIG9mIGRlZmF1bHRcblx0XHRcdGlmICghb3BlbkNvbmZpZy5jbGkuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoICYmIChvcGVuRmlsZXNJbk5ld1dpbmRvd0NvbmZpZyA9PT0gJ29uJyB8fCBvcGVuRmlsZXNJbk5ld1dpbmRvd0NvbmZpZyA9PT0gJ29mZicpKSB7XG5cdFx0XHRcdG9wZW5GaWxlc0luTmV3V2luZG93ID0gKG9wZW5GaWxlc0luTmV3V2luZG93Q29uZmlnID09PSAnb24nKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBvcGVuRm9sZGVySW5OZXdXaW5kb3c6ICEhb3BlbkZvbGRlckluTmV3V2luZG93LCBvcGVuRmlsZXNJbk5ld1dpbmRvdyB9O1xuXHR9XG5cblx0YXN5bmMgb3BlbkV4dGVuc2lvbkRldmVsb3BtZW50SG9zdFdpbmRvdyhleHRlbnNpb25EZXZlbG9wbWVudFBhdGhzOiBzdHJpbmdbXSwgb3BlbkNvbmZpZzogSU9wZW5Db25maWd1cmF0aW9uKTogUHJvbWlzZTxJQ29kZVdpbmRvd1tdPiB7XG5cblx0XHQvLyBSZWxvYWQgYW4gZXhpc3RpbmcgZXh0ZW5zaW9uIGRldmVsb3BtZW50IGhvc3Qgd2luZG93IG9uIHRoZSBzYW1lIHBhdGhcblx0XHQvLyBXZSBjdXJyZW50bHkgZG8gbm90IGFsbG93IG1vcmUgdGhhbiBvbmUgZXh0ZW5zaW9uIGRldmVsb3BtZW50IHdpbmRvd1xuXHRcdC8vIG9uIHRoZSBzYW1lIGV4dGVuc2lvbiBwYXRoLlxuXHRcdGNvbnN0IGV4aXN0aW5nV2luZG93ID0gZmluZFdpbmRvd09uRXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoKHRoaXMuZ2V0V2luZG93cygpLCBleHRlbnNpb25EZXZlbG9wbWVudFBhdGhzKTtcblx0XHRpZiAoZXhpc3RpbmdXaW5kb3cpIHtcblx0XHRcdHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2UucmVsb2FkKGV4aXN0aW5nV2luZG93LCBvcGVuQ29uZmlnLmNsaSk7XG5cdFx0XHRleGlzdGluZ1dpbmRvdy5mb2N1cygpOyAvLyBtYWtlIHN1cmUgaXQgZ2V0cyBmb2N1cyBhbmQgaXMgcmVzdG9yZWRcblxuXHRcdFx0cmV0dXJuIFtleGlzdGluZ1dpbmRvd107XG5cdFx0fVxuXG5cdFx0bGV0IGZvbGRlclVyaXMgPSBvcGVuQ29uZmlnLmNsaVsnZm9sZGVyLXVyaSddIHx8IFtdO1xuXHRcdGxldCBmaWxlVXJpcyA9IG9wZW5Db25maWcuY2xpWydmaWxlLXVyaSddIHx8IFtdO1xuXHRcdGxldCBjbGlBcmdzID0gb3BlbkNvbmZpZy5jbGkuXztcblxuXHRcdC8vIEZpbGwgaW4gcHJldmlvdXNseSBvcGVuZWQgd29ya3NwYWNlIHVubGVzcyBhbiBleHBsaWNpdCBwYXRoIGlzIHByb3ZpZGVkIGFuZCB3ZSBhcmUgbm90IHVuaXQgdGVzdGluZ1xuXHRcdGlmICghY2xpQXJncy5sZW5ndGggJiYgIWZvbGRlclVyaXMubGVuZ3RoICYmICFmaWxlVXJpcy5sZW5ndGggJiYgIW9wZW5Db25maWcuY2xpLmV4dGVuc2lvblRlc3RzUGF0aCkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uRGV2ZWxvcG1lbnRXaW5kb3dTdGF0ZSA9IHRoaXMud2luZG93c1N0YXRlSGFuZGxlci5zdGF0ZS5sYXN0UGx1Z2luRGV2ZWxvcG1lbnRIb3N0V2luZG93O1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlVG9PcGVuID0gZXh0ZW5zaW9uRGV2ZWxvcG1lbnRXaW5kb3dTdGF0ZT8ud29ya3NwYWNlID8/IGV4dGVuc2lvbkRldmVsb3BtZW50V2luZG93U3RhdGU/LmZvbGRlclVyaTtcblx0XHRcdGlmICh3b3Jrc3BhY2VUb09wZW4pIHtcblx0XHRcdFx0aWYgKFVSSS5pc1VyaSh3b3Jrc3BhY2VUb09wZW4pKSB7XG5cdFx0XHRcdFx0aWYgKHdvcmtzcGFjZVRvT3Blbi5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRcdFx0Y2xpQXJncyA9IFt3b3Jrc3BhY2VUb09wZW4uZnNQYXRoXTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Zm9sZGVyVXJpcyA9IFt3b3Jrc3BhY2VUb09wZW4udG9TdHJpbmcoKV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmICh3b3Jrc3BhY2VUb09wZW4uY29uZmlnUGF0aC5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRcdFx0Y2xpQXJncyA9IFtvcmlnaW5hbEZTUGF0aCh3b3Jrc3BhY2VUb09wZW4uY29uZmlnUGF0aCldO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRmaWxlVXJpcyA9IFt3b3Jrc3BhY2VUb09wZW4uY29uZmlnUGF0aC50b1N0cmluZygpXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgcmVtb3RlQXV0aG9yaXR5ID0gb3BlbkNvbmZpZy5yZW1vdGVBdXRob3JpdHk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb25EZXZlbG9wbWVudFBhdGggb2YgZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRocykge1xuXHRcdFx0aWYgKGV4dGVuc2lvbkRldmVsb3BtZW50UGF0aC5tYXRjaCgvXlthLXpBLVpdW2EtekEtWjAtOVxcK1xcLVxcLl0rOi8pKSB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZShleHRlbnNpb25EZXZlbG9wbWVudFBhdGgpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25EZXZlbG9wbWVudFBhdGhSZW1vdGVBdXRob3JpdHkgPSBnZXRSZW1vdGVBdXRob3JpdHkodXJsKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbkRldmVsb3BtZW50UGF0aFJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdGlmIChyZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0XHRcdGlmICghaXNFcXVhbEF1dGhvcml0eShleHRlbnNpb25EZXZlbG9wbWVudFBhdGhSZW1vdGVBdXRob3JpdHksIHJlbW90ZUF1dGhvcml0eSkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdtb3JlIHRoYW4gb25lIGV4dGVuc2lvbiBkZXZlbG9wbWVudCBwYXRoIGF1dGhvcml0eScpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHkgPSBleHRlbnNpb25EZXZlbG9wbWVudFBhdGhSZW1vdGVBdXRob3JpdHk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTWFrZSBzdXJlIHRoYXQgd2UgZG8gbm90IHRyeSB0byBvcGVuOlxuXHRcdC8vIC0gYSB3b3Jrc3BhY2Ugb3IgZm9sZGVyIHRoYXQgaXMgYWxyZWFkeSBvcGVuZWRcblx0XHQvLyAtIGEgd29ya3NwYWNlIG9yIGZpbGUgdGhhdCBoYXMgYSBkaWZmZXJlbnQgYXV0aG9yaXR5IGFzIHRoZSBleHRlbnNpb24gZGV2ZWxvcG1lbnQuXG5cblx0XHRjbGlBcmdzID0gY2xpQXJncy5maWx0ZXIocGF0aCA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZShwYXRoKTtcblx0XHRcdGlmIChmaW5kV2luZG93T25Xb3Jrc3BhY2VPckZvbGRlcih0aGlzLmdldFdpbmRvd3MoKSwgdXJpKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBpc0VxdWFsQXV0aG9yaXR5KGdldFJlbW90ZUF1dGhvcml0eSh1cmkpLCByZW1vdGVBdXRob3JpdHkpO1xuXHRcdH0pO1xuXG5cdFx0Zm9sZGVyVXJpcyA9IGZvbGRlclVyaXMuZmlsdGVyKGZvbGRlclVyaVN0ciA9PiB7XG5cdFx0XHRjb25zdCBmb2xkZXJVcmkgPSB0aGlzLmNsaUFyZ1RvVXJpKGZvbGRlclVyaVN0cik7XG5cdFx0XHRpZiAoZm9sZGVyVXJpICYmIGZpbmRXaW5kb3dPbldvcmtzcGFjZU9yRm9sZGVyKHRoaXMuZ2V0V2luZG93cygpLCBmb2xkZXJVcmkpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZvbGRlclVyaSA/IGlzRXF1YWxBdXRob3JpdHkoZ2V0UmVtb3RlQXV0aG9yaXR5KGZvbGRlclVyaSksIHJlbW90ZUF1dGhvcml0eSkgOiBmYWxzZTtcblx0XHR9KTtcblxuXHRcdGZpbGVVcmlzID0gZmlsZVVyaXMuZmlsdGVyKGZpbGVVcmlTdHIgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVVyaSA9IHRoaXMuY2xpQXJnVG9VcmkoZmlsZVVyaVN0cik7XG5cdFx0XHRpZiAoZmlsZVVyaSAmJiBmaW5kV2luZG93T25Xb3Jrc3BhY2VPckZvbGRlcih0aGlzLmdldFdpbmRvd3MoKSwgZmlsZVVyaSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmlsZVVyaSA/IGlzRXF1YWxBdXRob3JpdHkoZ2V0UmVtb3RlQXV0aG9yaXR5KGZpbGVVcmkpLCByZW1vdGVBdXRob3JpdHkpIDogZmFsc2U7XG5cdFx0fSk7XG5cblx0XHRvcGVuQ29uZmlnLmNsaS5fID0gY2xpQXJncztcblx0XHRvcGVuQ29uZmlnLmNsaVsnZm9sZGVyLXVyaSddID0gZm9sZGVyVXJpcztcblx0XHRvcGVuQ29uZmlnLmNsaVsnZmlsZS11cmknXSA9IGZpbGVVcmlzO1xuXG5cdFx0Ly8gT3BlbiBpdFxuXHRcdGNvbnN0IG9wZW5BcmdzOiBJT3BlbkNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRjb250ZXh0OiBvcGVuQ29uZmlnLmNvbnRleHQsXG5cdFx0XHRjbGk6IG9wZW5Db25maWcuY2xpLFxuXHRcdFx0Zm9yY2VOZXdXaW5kb3c6IHRydWUsXG5cdFx0XHRmb3JjZUVtcHR5OiAhY2xpQXJncy5sZW5ndGggJiYgIWZvbGRlclVyaXMubGVuZ3RoICYmICFmaWxlVXJpcy5sZW5ndGgsXG5cdFx0XHR1c2VyRW52OiBvcGVuQ29uZmlnLnVzZXJFbnYsXG5cdFx0XHRub1JlY2VudEVudHJ5OiB0cnVlLFxuXHRcdFx0d2FpdE1hcmtlckZpbGVVUkk6IG9wZW5Db25maWcud2FpdE1hcmtlckZpbGVVUkksXG5cdFx0XHRyZW1vdGVBdXRob3JpdHksXG5cdFx0XHRmb3JjZVByb2ZpbGU6IG9wZW5Db25maWcuZm9yY2VQcm9maWxlLFxuXHRcdFx0Zm9yY2VUZW1wUHJvZmlsZTogb3BlbkNvbmZpZy5mb3JjZVRlbXBQcm9maWxlXG5cdFx0fTtcblxuXHRcdHJldHVybiB0aGlzLm9wZW4ob3BlbkFyZ3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuSW5Ccm93c2VyV2luZG93KG9wdGlvbnM6IElPcGVuQnJvd3NlcldpbmRvd09wdGlvbnMpOiBQcm9taXNlPElDb2RlV2luZG93PiB7XG5cdFx0Y29uc3Qgd2luZG93Q29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV2luZG93U2V0dGluZ3MgfCB1bmRlZmluZWQ+KCd3aW5kb3cnKTtcblxuXHRcdGNvbnN0IGxhc3RBY3RpdmVXaW5kb3cgPSB0aGlzLmdldExhc3RBY3RpdmVXaW5kb3coKTtcblx0XHRjb25zdCBuZXdXaW5kb3dQcm9maWxlID0gd2luZG93Q29uZmlnPy5uZXdXaW5kb3dQcm9maWxlXG5cdFx0XHQ/IHRoaXMudXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlLnByb2ZpbGVzLmZpbmQocHJvZmlsZSA9PiBwcm9maWxlLm5hbWUgPT09IHdpbmRvd0NvbmZpZy5uZXdXaW5kb3dQcm9maWxlKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBkZWZhdWx0UHJvZmlsZSA9IG5ld1dpbmRvd1Byb2ZpbGUgPz8gKGxhc3RBY3RpdmVXaW5kb3c/LnByb2ZpbGU/LmlzQWdlbnRzV2luZG93UHJvZmlsZSA/IHVuZGVmaW5lZCA6IGxhc3RBY3RpdmVXaW5kb3c/LnByb2ZpbGUpID8/IHRoaXMudXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlLmRlZmF1bHRQcm9maWxlO1xuXG5cdFx0bGV0IHdpbmRvdzogSUNvZGVXaW5kb3cgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFvcHRpb25zLmZvcmNlTmV3V2luZG93ICYmICFvcHRpb25zLmZvcmNlTmV3VGFiYmVkV2luZG93KSB7XG5cdFx0XHR3aW5kb3cgPSBvcHRpb25zLndpbmRvd1RvVXNlIHx8IChsYXN0QWN0aXZlV2luZG93Py5jb25maWc/LmlzU2Vzc2lvbnNXaW5kb3cgPyB1bmRlZmluZWQgOiBsYXN0QWN0aXZlV2luZG93KTtcblx0XHRcdGlmICh3aW5kb3cpIHtcblx0XHRcdFx0d2luZG93LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbGQgdXAgdGhlIHdpbmRvdyBjb25maWd1cmF0aW9uIGZyb20gcHJvdmlkZWQgb3B0aW9ucywgY29uZmlnIGFuZCBlbnZpcm9ubWVudFxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb246IElOYXRpdmVXaW5kb3dDb25maWd1cmF0aW9uID0ge1xuXG5cdFx0XHQvLyBJbmhlcml0IENMSSBhcmd1bWVudHMgZnJvbSBlbnZpcm9ubWVudCBhbmQvb3Jcblx0XHRcdC8vIHRoZSBzcGVjaWZpYyBwcm9wZXJ0aWVzIGZyb20gdGhpcyBsYXVuY2ggaWYgcHJvdmlkZWRcblx0XHRcdC4uLnRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzLFxuXHRcdFx0Li4ub3B0aW9ucy5jbGksXG5cblx0XHRcdG1hY2hpbmVJZDogdGhpcy5tYWNoaW5lSWQsXG5cdFx0XHRzcW1JZDogdGhpcy5zcW1JZCxcblx0XHRcdGRldkRldmljZUlkOiB0aGlzLmRldkRldmljZUlkLFxuXHRcdFx0aXNQb3J0YWJsZTogdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmlzUG9ydGFibGUsXG5cblx0XHRcdHdpbmRvd0lkOiAtMSxcdC8vIFdpbGwgYmUgZmlsbGVkIGluIGJ5IHRoZSB3aW5kb3cgb25jZSBsb2FkZWQgbGF0ZXJcblxuXHRcdFx0bWFpblBpZDogcHJvY2Vzcy5waWQsXG5cblx0XHRcdGFwcFJvb3Q6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcHBSb290LFxuXHRcdFx0ZXhlY1BhdGg6IHByb2Nlc3MuZXhlY1BhdGgsXG5cdFx0XHRjb2RlQ2FjaGVQYXRoOiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuY29kZUNhY2hlUGF0aCxcblx0XHRcdC8vIElmIHdlIGtub3cgdGhlIGJhY2t1cCBmb2xkZXIgdXBmcm9udCAoZm9yIGVtcHR5IHdpbmRvd3MgdG8gcmVzdG9yZSksIHdlIGNhbiBzZXQgaXRcblx0XHRcdC8vIGRpcmVjdGx5IGhlcmUgd2hpY2ggaGVscHMgZm9yIHJlc3RvcmluZyBVSSBzdGF0ZSBhc3NvY2lhdGVkIHdpdGggdGhhdCB3aW5kb3cuXG5cdFx0XHQvLyBGb3IgYWxsIG90aGVyIGNhc2VzIHdlIGZpcnN0IGNhbGwgaW50byByZWdpc3RlckVtcHR5V2luZG93QmFja3VwKCkgdG8gc2V0IGl0IGJlZm9yZVxuXHRcdFx0Ly8gbG9hZGluZyB0aGUgd2luZG93LlxuXHRcdFx0YmFja3VwUGF0aDogb3B0aW9ucy5lbXB0eVdpbmRvd0JhY2t1cEluZm8gPyBqb2luKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5iYWNrdXBIb21lLCBvcHRpb25zLmVtcHR5V2luZG93QmFja3VwSW5mby5iYWNrdXBGb2xkZXIpIDogdW5kZWZpbmVkLFxuXG5cdFx0XHRwcm9maWxlczoge1xuXHRcdFx0XHRob21lOiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZS5wcm9maWxlc0hvbWUsXG5cdFx0XHRcdGFsbDogdGhpcy51c2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UucHJvZmlsZXMsXG5cdFx0XHRcdC8vIFNldCB0byBkZWZhdWx0IHByb2ZpbGUgZmlyc3QgYW5kIHJlc29sdmUgYW5kIHVwZGF0ZSB0aGUgcHJvZmlsZVxuXHRcdFx0XHQvLyBvbmx5IGFmdGVyIHRoZSB3b3Jrc3BhY2UtYmFja3VwIGlzIHJlZ2lzdGVyZWQuXG5cdFx0XHRcdC8vIEJlY2F1c2UsIHdvcmtzcGFjZSBpZGVudGlmaWVyIG9mIGFuIGVtcHR5IHdpbmRvdyBpcyBrbm93biBvbmx5IHRoZW4uXG5cdFx0XHRcdHByb2ZpbGU6IGRlZmF1bHRQcm9maWxlXG5cdFx0XHR9LFxuXG5cdFx0XHRob21lRGlyOiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UudXNlckhvbWUud2l0aCh7IHNjaGVtZTogU2NoZW1hcy5maWxlIH0pLmZzUGF0aCxcblx0XHRcdHRtcERpcjogdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLnRtcERpci53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUgfSkuZnNQYXRoLFxuXHRcdFx0dXNlckRhdGFEaXI6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS51c2VyRGF0YVBhdGgsXG5cblx0XHRcdHJlbW90ZUF1dGhvcml0eTogb3B0aW9ucy5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHR3b3Jrc3BhY2U6IG9wdGlvbnMud29ya3NwYWNlLFxuXHRcdFx0dXNlckVudjogeyAuLi50aGlzLmluaXRpYWxVc2VyRW52LCAuLi5vcHRpb25zLnVzZXJFbnYgfSxcblxuXHRcdFx0bmxzOiB7XG5cdFx0XHRcdG1lc3NhZ2VzOiBnZXROTFNNZXNzYWdlcygpLFxuXHRcdFx0XHRsYW5ndWFnZTogZ2V0TkxTTGFuZ3VhZ2UoKVxuXHRcdFx0fSxcblxuXHRcdFx0ZmlsZXNUb09wZW5PckNyZWF0ZTogb3B0aW9ucy5maWxlc1RvT3Blbj8uZmlsZXNUb09wZW5PckNyZWF0ZSxcblx0XHRcdGZpbGVzVG9EaWZmOiBvcHRpb25zLmZpbGVzVG9PcGVuPy5maWxlc1RvRGlmZixcblx0XHRcdGZpbGVzVG9NZXJnZTogb3B0aW9ucy5maWxlc1RvT3Blbj8uZmlsZXNUb01lcmdlLFxuXHRcdFx0ZmlsZXNUb1dhaXQ6IG9wdGlvbnMuZmlsZXNUb09wZW4/LmZpbGVzVG9XYWl0LFxuXG5cdFx0XHRsb2dMZXZlbDogdGhpcy5sb2dnZXJTZXJ2aWNlLmdldExvZ0xldmVsKCksXG5cdFx0XHRsb2dnZXJzOiB0aGlzLmxvZ2dlclNlcnZpY2UuZ2V0R2xvYmFsTG9nZ2VycygpLFxuXHRcdFx0bG9nc1BhdGg6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5sb2dzSG9tZS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUgfSkuZnNQYXRoLFxuXG5cdFx0XHRwcm9kdWN0LFxuXHRcdFx0aXNJbml0aWFsU3RhcnR1cDogb3B0aW9ucy5pbml0aWFsU3RhcnR1cCxcblx0XHRcdHBlcmZNYXJrczogZ2V0TWFya3MoKSxcblx0XHRcdG9zOiB7IHJlbGVhc2U6IHJlbGVhc2UoKSwgaG9zdG5hbWU6IGhvc3RuYW1lKCksIGFyY2g6IGFyY2goKSB9LFxuXG5cdFx0XHRhdXRvRGV0ZWN0SGlnaENvbnRyYXN0OiB3aW5kb3dDb25maWc/LmF1dG9EZXRlY3RIaWdoQ29udHJhc3QgPz8gdHJ1ZSxcblx0XHRcdGF1dG9EZXRlY3RDb2xvclNjaGVtZTogd2luZG93Q29uZmlnPy5hdXRvRGV0ZWN0Q29sb3JTY2hlbWUgPz8gZmFsc2UsXG5cdFx0XHRhY2Nlc3NpYmlsaXR5U3VwcG9ydDogYXBwLmFjY2Vzc2liaWxpdHlTdXBwb3J0RW5hYmxlZCxcblx0XHRcdGNvbG9yU2NoZW1lOiB0aGlzLnRoZW1lTWFpblNlcnZpY2UuZ2V0Q29sb3JTY2hlbWUoKSxcblx0XHRcdHBvbGljaWVzRGF0YTogdGhpcy5wb2xpY3lTZXJ2aWNlLnNlcmlhbGl6ZSgpLFxuXHRcdFx0Y29udGludWVPbjogdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmNvbnRpbnVlT24sXG5cblx0XHRcdGNzc01vZHVsZXM6IHRoaXMuY3NzRGV2ZWxvcG1lbnRTZXJ2aWNlLmlzRW5hYmxlZCA/IGF3YWl0IHRoaXMuY3NzRGV2ZWxvcG1lbnRTZXJ2aWNlLmdldENzc01vZHVsZXMoKSA6IHVuZGVmaW5lZCxcblxuXHRcdFx0aXNTZXNzaW9uc1dpbmRvdzogaXNXb3Jrc3BhY2VJZGVudGlmaWVyKG9wdGlvbnMud29ya3NwYWNlKSAmJiBpc0VxdWFsKG9wdGlvbnMud29ya3NwYWNlLmNvbmZpZ1BhdGgsIHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hZ2VudFNlc3Npb25zV29ya3NwYWNlKSxcblx0XHR9O1xuXG5cdFx0Ly8gTmV3IHdpbmRvd1xuXHRcdGlmICghd2luZG93KSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMud2luZG93c1N0YXRlSGFuZGxlci5nZXROZXdXaW5kb3dTdGF0ZShjb25maWd1cmF0aW9uKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIHRoZSB3aW5kb3dcblx0XHRcdG1hcmsoJ2NvZGUvd2lsbENyZWF0ZUNvZGVXaW5kb3cnKTtcblx0XHRcdGNvbnN0IGNyZWF0ZWRXaW5kb3cgPSB3aW5kb3cgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVXaW5kb3csIHtcblx0XHRcdFx0c3RhdGUsXG5cdFx0XHRcdGV4dGVuc2lvbkRldmVsb3BtZW50UGF0aDogY29uZmlndXJhdGlvbi5leHRlbnNpb25EZXZlbG9wbWVudFBhdGgsXG5cdFx0XHRcdGlzRXh0ZW5zaW9uVGVzdEhvc3Q6ICEhY29uZmlndXJhdGlvbi5leHRlbnNpb25UZXN0c1BhdGgsXG5cdFx0XHRcdGlzU2Vzc2lvbnNXaW5kb3c6IGNvbmZpZ3VyYXRpb24uaXNTZXNzaW9uc1dpbmRvd1xuXHRcdFx0fSk7XG5cdFx0XHRtYXJrKCdjb2RlL2RpZENyZWF0ZUNvZGVXaW5kb3cnKTtcblxuXHRcdFx0Ly8gQWRkIGFzIHdpbmRvdyB0YWIgaWYgY29uZmlndXJlZCAobWFjT1Mgb25seSlcblx0XHRcdGlmIChvcHRpb25zLmZvcmNlTmV3VGFiYmVkV2luZG93KSB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZVdpbmRvdyA9IHRoaXMuZ2V0TGFzdEFjdGl2ZVdpbmRvdygpO1xuXHRcdFx0XHRhY3RpdmVXaW5kb3c/LmFkZFRhYmJlZFdpbmRvdyhjcmVhdGVkV2luZG93KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQWRkIHRvIG91ciBsaXN0IG9mIHdpbmRvd3Ncblx0XHRcdHRoaXMud2luZG93cy5zZXQoY3JlYXRlZFdpbmRvdy5pZCwgY3JlYXRlZFdpbmRvdyk7XG5cblx0XHRcdC8vIEluZGljYXRlIG5ldyB3aW5kb3cgdmlhIGV2ZW50XG5cdFx0XHR0aGlzLl9vbkRpZE9wZW5XaW5kb3cuZmlyZShjcmVhdGVkV2luZG93KTtcblxuXHRcdFx0Ly8gSW5kaWNhdGUgbnVtYmVyIGNoYW5nZSB2aWEgZXZlbnRcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlV2luZG93c0NvdW50LmZpcmUoeyBvbGRDb3VudDogdGhpcy5nZXRXaW5kb3dDb3VudCgpIC0gMSwgbmV3Q291bnQ6IHRoaXMuZ2V0V2luZG93Q291bnQoKSB9KTtcblxuXHRcdFx0Ly8gV2luZG93IEV2ZW50c1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY3JlYXRlZFdpbmRvdy5vbkRpZFNpZ25hbFJlYWR5KCgpID0+IHRoaXMuX29uRGlkU2lnbmFsUmVhZHlXaW5kb3cuZmlyZShjcmVhdGVkV2luZG93KSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50Lm9uY2UoY3JlYXRlZFdpbmRvdy5vbkRpZENsb3NlKSgoKSA9PiB0aGlzLm9uV2luZG93Q2xvc2VkKGNyZWF0ZWRXaW5kb3csIGRpc3Bvc2FibGVzKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50Lm9uY2UoY3JlYXRlZFdpbmRvdy5vbkRpZERlc3Ryb3kpKCgpID0+IHRoaXMub25XaW5kb3dEZXN0cm95ZWQoY3JlYXRlZFdpbmRvdykpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChjcmVhdGVkV2luZG93Lm9uRGlkTWF4aW1pemUoKCkgPT4gdGhpcy5fb25EaWRNYXhpbWl6ZVdpbmRvdy5maXJlKGNyZWF0ZWRXaW5kb3cpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY3JlYXRlZFdpbmRvdy5vbkRpZFVubWF4aW1pemUoKCkgPT4gdGhpcy5fb25EaWRVbm1heGltaXplV2luZG93LmZpcmUoY3JlYXRlZFdpbmRvdykpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChjcmVhdGVkV2luZG93Lm9uRGlkRW50ZXJGdWxsU2NyZWVuKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlRnVsbFNjcmVlbi5maXJlKHsgd2luZG93OiBjcmVhdGVkV2luZG93LCBmdWxsc2NyZWVuOiB0cnVlIH0pKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY3JlYXRlZFdpbmRvdy5vbkRpZExlYXZlRnVsbFNjcmVlbigoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUZ1bGxTY3JlZW4uZmlyZSh7IHdpbmRvdzogY3JlYXRlZFdpbmRvdywgZnVsbHNjcmVlbjogZmFsc2UgfSkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChjcmVhdGVkV2luZG93Lm9uRGlkVHJpZ2dlclN5c3RlbUNvbnRleHRNZW51KCh7IHgsIHkgfSkgPT4gdGhpcy5fb25EaWRUcmlnZ2VyU3lzdGVtQ29udGV4dE1lbnUuZmlyZSh7IHdpbmRvdzogY3JlYXRlZFdpbmRvdywgeCwgeSB9KSkpO1xuXG5cdFx0XHRjb25zdCB3ZWJDb250ZW50cyA9IGFzc2VydFJldHVybnNEZWZpbmVkKGNyZWF0ZWRXaW5kb3cud2luPy53ZWJDb250ZW50cyk7XG5cdFx0XHR3ZWJDb250ZW50cy5yZW1vdmVBbGxMaXN0ZW5lcnMoJ2RldnRvb2xzLXJlbG9hZC1wYWdlJyk7IC8vIHJlbW92ZSBidWlsdCBpbiBsaXN0ZW5lciBzbyB3ZSBjYW4gaGFuZGxlIHRoaXMgb24gb3VyIG93blxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHdlYkNvbnRlbnRzLCAnZGV2dG9vbHMtcmVsb2FkLXBhZ2UnKSgoKSA9PiB0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLnJlbG9hZChjcmVhdGVkV2luZG93KSkpO1xuXG5cdFx0XHQvLyBMaWZlY3ljbGVcblx0XHRcdHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2UucmVnaXN0ZXJXaW5kb3coY3JlYXRlZFdpbmRvdyk7XG5cdFx0fVxuXG5cdFx0Ly8gRXhpc3Rpbmcgd2luZG93XG5cdFx0ZWxzZSB7XG5cblx0XHRcdC8vIFNvbWUgY29uZmlndXJhdGlvbiB0aGluZ3MgZ2V0IGluaGVyaXRlZCBpZiB0aGUgd2luZG93IGlzIGJlaW5nIHJldXNlZCBhbmQgd2UgYXJlXG5cdFx0XHQvLyBpbiBleHRlbnNpb24gZGV2ZWxvcG1lbnQgaG9zdCBtb2RlLiBUaGVzZSBvcHRpb25zIGFyZSBhbGwgZGV2ZWxvcG1lbnQgcmVsYXRlZC5cblx0XHRcdGNvbnN0IGN1cnJlbnRXaW5kb3dDb25maWcgPSB3aW5kb3cuY29uZmlnO1xuXHRcdFx0aWYgKCFjb25maWd1cmF0aW9uLmV4dGVuc2lvbkRldmVsb3BtZW50UGF0aCAmJiBjdXJyZW50V2luZG93Q29uZmlnPy5leHRlbnNpb25EZXZlbG9wbWVudFBhdGgpIHtcblx0XHRcdFx0Y29uZmlndXJhdGlvbi5leHRlbnNpb25EZXZlbG9wbWVudFBhdGggPSBjdXJyZW50V2luZG93Q29uZmlnLmV4dGVuc2lvbkRldmVsb3BtZW50UGF0aDtcblx0XHRcdFx0Y29uZmlndXJhdGlvbi5leHRlbnNpb25EZXZlbG9wbWVudEtpbmQgPSBjdXJyZW50V2luZG93Q29uZmlnLmV4dGVuc2lvbkRldmVsb3BtZW50S2luZDtcblx0XHRcdFx0Y29uZmlndXJhdGlvblsnZW5hYmxlLXByb3Bvc2VkLWFwaSddID0gY3VycmVudFdpbmRvd0NvbmZpZ1snZW5hYmxlLXByb3Bvc2VkLWFwaSddO1xuXHRcdFx0XHRjb25maWd1cmF0aW9uLnZlcmJvc2UgPSBjdXJyZW50V2luZG93Q29uZmlnLnZlcmJvc2U7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25bJ2luc3BlY3QtZXh0ZW5zaW9ucyddID0gY3VycmVudFdpbmRvd0NvbmZpZ1snaW5zcGVjdC1leHRlbnNpb25zJ107XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25bJ2luc3BlY3QtYnJrLWV4dGVuc2lvbnMnXSA9IGN1cnJlbnRXaW5kb3dDb25maWdbJ2luc3BlY3QtYnJrLWV4dGVuc2lvbnMnXTtcblx0XHRcdFx0Y29uZmlndXJhdGlvbi5kZWJ1Z0lkID0gY3VycmVudFdpbmRvd0NvbmZpZy5kZWJ1Z0lkO1xuXHRcdFx0XHRjb25maWd1cmF0aW9uLmV4dGVuc2lvbkVudmlyb25tZW50ID0gY3VycmVudFdpbmRvd0NvbmZpZy5leHRlbnNpb25FbnZpcm9ubWVudDtcblx0XHRcdFx0Y29uZmlndXJhdGlvblsnZXh0ZW5zaW9ucy1kaXInXSA9IGN1cnJlbnRXaW5kb3dDb25maWdbJ2V4dGVuc2lvbnMtZGlyJ107XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25bJ2Rpc2FibGUtZXh0ZW5zaW9ucyddID0gY3VycmVudFdpbmRvd0NvbmZpZ1snZGlzYWJsZS1leHRlbnNpb25zJ107XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25bJ2Rpc2FibGUtZXh0ZW5zaW9uJ10gPSBjdXJyZW50V2luZG93Q29uZmlnWydkaXNhYmxlLWV4dGVuc2lvbiddO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB3aW5kb3cgaWRlbnRpZmllciBhbmQgc2Vzc2lvbiBub3dcblx0XHQvLyB0aGF0IHdlIGhhdmUgdGhlIHdpbmRvdyBvYmplY3QgaW4gaGFuZC5cblx0XHRjb25maWd1cmF0aW9uLndpbmRvd0lkID0gd2luZG93LmlkO1xuXG5cdFx0Ly8gSWYgdGhlIHdpbmRvdyB3YXMgYWxyZWFkeSBsb2FkZWQsIG1ha2Ugc3VyZSB0byB1bmxvYWQgaXRcblx0XHQvLyBmaXJzdCBhbmQgb25seSBsb2FkIHRoZSBuZXcgY29uZmlndXJhdGlvbiBpZiB0aGF0IHdhc1xuXHRcdC8vIG5vdCB2ZXRvZWRcblx0XHRpZiAod2luZG93LmlzUmVhZHkpIHtcblx0XHRcdHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2UudW5sb2FkKHdpbmRvdywgVW5sb2FkUmVhc29uLkxPQUQpLnRoZW4oYXN5bmMgdmV0byA9PiB7XG5cdFx0XHRcdGlmICghdmV0bykge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZG9PcGVuSW5Ccm93c2VyV2luZG93KHdpbmRvdywgY29uZmlndXJhdGlvbiwgb3B0aW9ucywgZGVmYXVsdFByb2ZpbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5kb09wZW5JbkJyb3dzZXJXaW5kb3cod2luZG93LCBjb25maWd1cmF0aW9uLCBvcHRpb25zLCBkZWZhdWx0UHJvZmlsZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHdpbmRvdztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9PcGVuSW5Ccm93c2VyV2luZG93KHdpbmRvdzogSUNvZGVXaW5kb3csIGNvbmZpZ3VyYXRpb246IElOYXRpdmVXaW5kb3dDb25maWd1cmF0aW9uLCBvcHRpb25zOiBJT3BlbkJyb3dzZXJXaW5kb3dPcHRpb25zLCBkZWZhdWx0UHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gUmVnaXN0ZXIgd2luZG93IGZvciBiYWNrdXBzIHVubGVzcyB0aGUgd2luZG93XG5cdFx0Ly8gaXMgZm9yIGV4dGVuc2lvbiBkZXZlbG9wbWVudCwgd2hlcmUgd2UgZG8gbm90XG5cdFx0Ly8ga2VlcCBhbnkgYmFja3Vwcy5cblxuXHRcdGlmICghY29uZmlndXJhdGlvbi5leHRlbnNpb25EZXZlbG9wbWVudFBhdGgpIHtcblx0XHRcdGlmIChpc1dvcmtzcGFjZUlkZW50aWZpZXIoY29uZmlndXJhdGlvbi53b3Jrc3BhY2UpKSB7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb24uYmFja3VwUGF0aCA9IHRoaXMuYmFja3VwTWFpblNlcnZpY2UucmVnaXN0ZXJXb3Jrc3BhY2VCYWNrdXAoe1xuXHRcdFx0XHRcdHdvcmtzcGFjZTogY29uZmlndXJhdGlvbi53b3Jrc3BhY2UsXG5cdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiBjb25maWd1cmF0aW9uLnJlbW90ZUF1dGhvcml0eVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlKSkge1xuXHRcdFx0XHRjb25maWd1cmF0aW9uLmJhY2t1cFBhdGggPSB0aGlzLmJhY2t1cE1haW5TZXJ2aWNlLnJlZ2lzdGVyRm9sZGVyQmFja3VwKHtcblx0XHRcdFx0XHRmb2xkZXJVcmk6IGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlLnVyaSxcblx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IGNvbmZpZ3VyYXRpb24ucmVtb3RlQXV0aG9yaXR5XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblxuXHRcdFx0XHQvLyBFbXB0eSB3aW5kb3dzIGFyZSBzcGVjaWFsIGluIHRoYXQgdGhleSBwcm92aWRlIG5vIHdvcmtzcGFjZSBvblxuXHRcdFx0XHQvLyB0aGVpciBjb25maWd1cmF0aW9uLiBUbyBwcm9wZXJseSByZWdpc3RlciB0aGVtIHdpdGggdGhlIGJhY2t1cFxuXHRcdFx0XHQvLyBzZXJ2aWNlLCB3ZSBlaXRoZXIgdXNlIHRoZSBwcm92aWRlZCBhc3NvY2lhdGVkIGBiYWNrdXBGb2xkZXJgXG5cdFx0XHRcdC8vIGluIGNhc2Ugd2UgcmVzdG9yZSBhIHByZXZpb3VzbHkgb3BlbmVkIGVtcHR5IHdpbmRvdyBvciB3ZSBoYXZlXG5cdFx0XHRcdC8vIHRvIGdlbmVyYXRlIGEgbmV3IGVtcHR5IHdpbmRvdyB3b3Jrc3BhY2UgaWRlbnRpZmllciB0byBiZSB1c2VkXG5cdFx0XHRcdC8vIGFzIGBiYWNrdXBGb2xkZXJgLlxuXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb24uYmFja3VwUGF0aCA9IHRoaXMuYmFja3VwTWFpblNlcnZpY2UucmVnaXN0ZXJFbXB0eVdpbmRvd0JhY2t1cCh7XG5cdFx0XHRcdFx0YmFja3VwRm9sZGVyOiBvcHRpb25zLmVtcHR5V2luZG93QmFja3VwSW5mbz8uYmFja3VwRm9sZGVyID8/IGNyZWF0ZUVtcHR5V29ya3NwYWNlSWRlbnRpZmllcigpLmlkLFxuXHRcdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogY29uZmlndXJhdGlvbi5yZW1vdGVBdXRob3JpdHlcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY29uZmlndXJhdGlvbi53b3Jrc3BhY2UgPz8gdG9Xb3Jrc3BhY2VJZGVudGlmaWVyKGNvbmZpZ3VyYXRpb24uYmFja3VwUGF0aCwgZmFsc2UpO1xuXG5cdFx0aWYgKGNvbmZpZ3VyYXRpb24uaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5wcm9maWxlcy5wcm9maWxlID0gdGhpcy51c2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UucHJvZmlsZXMuZmluZChwID0+IHAuaXNBZ2VudHNXaW5kb3dQcm9maWxlKSA/PyBhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZS5jcmVhdGVBZ2VudHNXaW5kb3dQcm9maWxlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHByb2ZpbGVQcm9taXNlID0gdGhpcy5yZXNvbHZlUHJvZmlsZUZvckJyb3dzZXJXaW5kb3cob3B0aW9ucywgd29ya3NwYWNlLCBkZWZhdWx0UHJvZmlsZSk7XG5cdFx0XHRjb25zdCBwcm9maWxlID0gcHJvZmlsZVByb21pc2UgaW5zdGFuY2VvZiBQcm9taXNlID8gYXdhaXQgcHJvZmlsZVByb21pc2UgOiBwcm9maWxlUHJvbWlzZTtcblx0XHRcdGNvbmZpZ3VyYXRpb24ucHJvZmlsZXMucHJvZmlsZSA9IHByb2ZpbGU7XG5cblx0XHRcdGlmICghY29uZmlndXJhdGlvbi5leHRlbnNpb25EZXZlbG9wbWVudFBhdGgpIHtcblx0XHRcdFx0Ly8gQXNzb2NpYXRlIHRoZSBjb25maWd1cmVkIHByb2ZpbGUgdG8gdGhlIHdvcmtzcGFjZVxuXHRcdFx0XHQvLyB1bmxlc3MgdGhlIHdpbmRvdyBpcyBmb3IgZXh0ZW5zaW9uIGRldmVsb3BtZW50LFxuXHRcdFx0XHQvLyB3aGVyZSB3ZSBkbyBub3QgcGVyc2lzdCB0aGUgYXNzb2NpYXRpb25zXG5cdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlLnNldFByb2ZpbGVGb3JXb3Jrc3BhY2Uod29ya3NwYWNlLCBwcm9maWxlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBMb2FkIGl0XG5cdFx0d2luZG93LmxvYWQoY29uZmlndXJhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVQcm9maWxlRm9yQnJvd3NlcldpbmRvdyhvcHRpb25zOiBJT3BlbkJyb3dzZXJXaW5kb3dPcHRpb25zLCB3b3Jrc3BhY2U6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyLCBkZWZhdWx0UHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8SVVzZXJEYXRhUHJvZmlsZT4gfCBJVXNlckRhdGFQcm9maWxlIHtcblx0XHRpZiAob3B0aW9ucy5mb3JjZVByb2ZpbGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZS5wcm9maWxlcy5maW5kKHAgPT4gcC5uYW1lID09PSBvcHRpb25zLmZvcmNlUHJvZmlsZSkgPz8gdGhpcy51c2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UuY3JlYXRlTmFtZWRQcm9maWxlKG9wdGlvbnMuZm9yY2VQcm9maWxlKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5mb3JjZVRlbXBQcm9maWxlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UuY3JlYXRlVHJhbnNpZW50UHJvZmlsZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZS5nZXRQcm9maWxlRm9yV29ya3NwYWNlKHdvcmtzcGFjZSkgPz8gZGVmYXVsdFByb2ZpbGU7XG5cdH1cblxuXHRwcml2YXRlIG9uV2luZG93Q2xvc2VkKHdpbmRvdzogSUNvZGVXaW5kb3csIGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXG5cdFx0Ly8gUmVtb3ZlIGZyb20gb3VyIGxpc3Qgc28gdGhhdCBFbGVjdHJvbiBjYW4gY2xlYW4gaXQgdXBcblx0XHR0aGlzLndpbmRvd3MuZGVsZXRlKHdpbmRvdy5pZCk7XG5cblx0XHQvLyBFbWl0XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VXaW5kb3dzQ291bnQuZmlyZSh7IG9sZENvdW50OiB0aGlzLmdldFdpbmRvd0NvdW50KCkgKyAxLCBuZXdDb3VudDogdGhpcy5nZXRXaW5kb3dDb3VudCgpIH0pO1xuXG5cdFx0Ly8gQ2xlYW4gdXBcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uV2luZG93RGVzdHJveWVkKHdpbmRvdzogSUNvZGVXaW5kb3cpOiB2b2lkIHtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIG91ciBsaXN0IHNvIHRoYXQgRWxlY3Ryb24gY2FuIGNsZWFuIGl0IHVwXG5cdFx0dGhpcy53aW5kb3dzLmRlbGV0ZSh3aW5kb3cuaWQpO1xuXG5cdFx0Ly8gRW1pdFxuXHRcdHRoaXMuX29uRGlkRGVzdHJveVdpbmRvdy5maXJlKHdpbmRvdyk7XG5cdH1cblxuXHRnZXRGb2N1c2VkV2luZG93KCk6IElDb2RlV2luZG93IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB3aW5kb3cgPSBCcm93c2VyV2luZG93LmdldEZvY3VzZWRXaW5kb3coKTtcblx0XHRpZiAod2luZG93KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRXaW5kb3dCeUlkKHdpbmRvdy5pZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldExhc3RBY3RpdmVXaW5kb3coKTogSUNvZGVXaW5kb3cgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmRvR2V0TGFzdEFjdGl2ZVdpbmRvdyh0aGlzLmdldFdpbmRvd3MoKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldExhc3RBY3RpdmVXaW5kb3dGb3JBdXRob3JpdHkocmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJQ29kZVdpbmRvdyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZG9HZXRMYXN0QWN0aXZlV2luZG93KHRoaXMuZ2V0V2luZG93cygpLmZpbHRlcih3aW5kb3cgPT4gaXNFcXVhbEF1dGhvcml0eSh3aW5kb3cucmVtb3RlQXV0aG9yaXR5LCByZW1vdGVBdXRob3JpdHkpKSk7XG5cdH1cblxuXHRwcml2YXRlIGRvR2V0TGFzdEFjdGl2ZVdpbmRvdyh3aW5kb3dzOiBJQ29kZVdpbmRvd1tdKTogSUNvZGVXaW5kb3cgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBnZXRMYXN0Rm9jdXNlZCh3aW5kb3dzKTtcblx0fVxuXG5cdHNlbmRUb0ZvY3VzZWQoY2hhbm5lbDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjb25zdCBmb2N1c2VkV2luZG93ID0gdGhpcy5nZXRGb2N1c2VkV2luZG93KCkgfHwgdGhpcy5nZXRMYXN0QWN0aXZlV2luZG93KCk7XG5cblx0XHRmb2N1c2VkV2luZG93Py5zZW5kV2hlblJlYWR5KGNoYW5uZWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIC4uLmFyZ3MpO1xuXHR9XG5cblx0c2VuZFRvT3BlbmluZ1dpbmRvdyhjaGFubmVsOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50Lm9uY2UodGhpcy5vbkRpZFNpZ25hbFJlYWR5V2luZG93KSh3aW5kb3cgPT4ge1xuXHRcdFx0d2luZG93LnNlbmRXaGVuUmVhZHkoY2hhbm5lbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgLi4uYXJncyk7XG5cdFx0fSkpO1xuXHR9XG5cblx0c2VuZFRvQWxsKGNoYW5uZWw6IHN0cmluZywgcGF5bG9hZD86IHVua25vd24sIHdpbmRvd0lkc1RvSWdub3JlPzogbnVtYmVyW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLmdldFdpbmRvd3MoKSkge1xuXHRcdFx0aWYgKHdpbmRvd0lkc1RvSWdub3JlICYmIHdpbmRvd0lkc1RvSWdub3JlLmluZGV4T2Yod2luZG93LmlkKSA+PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBkbyBub3Qgc2VuZCBpZiB3ZSBhcmUgaW5zdHJ1Y3RlZCB0byBpZ25vcmUgaXRcblx0XHRcdH1cblxuXHRcdFx0d2luZG93LnNlbmRXaGVuUmVhZHkoY2hhbm5lbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgcGF5bG9hZCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0V2luZG93cygpOiBJQ29kZVdpbmRvd1tdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLndpbmRvd3MudmFsdWVzKCkpO1xuXHR9XG5cblx0Z2V0V2luZG93Q291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy53aW5kb3dzLnNpemU7XG5cdH1cblxuXHRnZXRXaW5kb3dCeUlkKHdpbmRvd0lkOiBudW1iZXIpOiBJQ29kZVdpbmRvdyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMud2luZG93cy5nZXQod2luZG93SWQpO1xuXHR9XG5cblx0Z2V0V2luZG93QnlXZWJDb250ZW50cyh3ZWJDb250ZW50czogV2ViQ29udGVudHMpOiBJQ29kZVdpbmRvdyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYnJvd3NlcldpbmRvdyA9IEJyb3dzZXJXaW5kb3cuZnJvbVdlYkNvbnRlbnRzKHdlYkNvbnRlbnRzKTtcblx0XHRpZiAoIWJyb3dzZXJXaW5kb3cpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy5nZXRXaW5kb3dCeUlkKGJyb3dzZXJXaW5kb3cuaWQpO1xuXG5cdFx0cmV0dXJuIHdpbmRvdz8ubWF0Y2hlcyh3ZWJDb250ZW50cykgPyB3aW5kb3cgOiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsS0FBSyxlQUE0QixhQUFhO0FBQ3ZELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsVUFBVSxTQUFTLFlBQVk7QUFDeEMsU0FBUyxVQUFVLGdCQUFnQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHNCQUFzQix5QkFBeUIsa0JBQWtCLGlCQUFpQjtBQUMzRixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFlBQVksdUJBQW9DO0FBQ3pELFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsTUFBTSxXQUFXLGFBQWE7QUFDakQsU0FBUyxVQUFVLFlBQVk7QUFDL0IsU0FBOEIsYUFBYSxXQUFXLFVBQVU7QUFDaEUsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNEJBQTRCLFNBQVMsa0JBQWtCLGVBQWUsZ0JBQWdCLG1DQUFtQztBQUNsSSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0IsZ0JBQWdCLGdCQUFnQjtBQUN6RCxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFVBQVUsb0JBQW9CO0FBQ3ZDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLE9BQU8sYUFBYTtBQUNwQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHdCQUF1SixjQUFjLGdCQUFnQix5QkFBMkQ7QUFDelAsU0FBUyxr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
