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
import { app } from "electron";
import { coalesce } from "../../../base/common/arrays.js";
import { ThrottledDelayer } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { normalizeDriveLetter, splitRecentLabel } from "../../../base/common/labels.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { isMacintosh, isWindows } from "../../../base/common/platform.js";
import { basename, dirname, extUriBiasedIgnorePathCase, isEqual, originalFSPath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { Promises } from "../../../base/node/pfs.js";
import { localize } from "../../../nls.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILifecycleMainService, LifecycleMainPhase } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { IApplicationStorageMainService } from "../../storage/electron-main/storageMainService.js";
import { isRecentFile, isRecentFolder, isRecentWorkspace, restoreRecentlyOpened, toStoreData } from "../common/workspaces.js";
import { WORKSPACE_EXTENSION } from "../../workspace/common/workspace.js";
import { getWorkspaceIdentifier } from "../common/workspaceIdentifier.js";
import { IWorkspacesManagementMainService } from "./workspacesManagementMainService.js";
import { ResourceMap } from "../../../base/common/map.js";
import { IDialogMainService } from "../../dialogs/electron-main/dialogMainService.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
const IWorkspacesHistoryMainService = createDecorator("workspacesHistoryMainService");
let WorkspacesHistoryMainService = class extends Disposable {
  constructor(logService, workspacesManagementMainService, lifecycleMainService, applicationStorageMainService, dialogMainService, environmentMainService) {
    super();
    this.logService = logService;
    this.workspacesManagementMainService = workspacesManagementMainService;
    this.lifecycleMainService = lifecycleMainService;
    this.applicationStorageMainService = applicationStorageMainService;
    this.dialogMainService = dialogMainService;
    this.environmentMainService = environmentMainService;
    this._onDidChangeRecentlyOpened = this._register(new Emitter());
    this.onDidChangeRecentlyOpened = this._onDidChangeRecentlyOpened.event;
    this.macOSRecentDocumentsUpdater = this._register(new ThrottledDelayer(800));
    this.registerListeners();
  }
  registerListeners() {
    this.lifecycleMainService.when(LifecycleMainPhase.Eventually).then(() => this.handleWindowsJumpList());
    this._register(this.workspacesManagementMainService.onDidEnterWorkspace((event) => this.addRecentlyOpened([{ workspace: event.workspace, remoteAuthority: event.window.remoteAuthority }])));
  }
  //#region Workspaces History
  async addRecentlyOpened(recentToAdd) {
    let workspaces = [];
    let files = [];
    for (const recent of recentToAdd) {
      if (isRecentWorkspace(recent)) {
        if (!this.workspacesManagementMainService.isUntitledWorkspace(recent.workspace) && !this.containsWorkspace(workspaces, recent.workspace)) {
          workspaces.push(recent);
        }
      } else if (isRecentFolder(recent)) {
        if (!this.containsFolder(workspaces, recent.folderUri)) {
          workspaces.push(recent);
        }
      } else {
        const alreadyExistsInHistory = this.containsFile(files, recent.fileUri);
        const shouldBeFiltered = recent.fileUri.scheme === Schemas.file && WorkspacesHistoryMainService.COMMON_FILES_FILTER.indexOf(basename(recent.fileUri)) >= 0;
        if (!alreadyExistsInHistory && !shouldBeFiltered) {
          files.push(recent);
          if (isWindows && recent.fileUri.scheme === Schemas.file && !this.environmentMainService.isPortable) {
            app.addRecentDocument(recent.fileUri.fsPath);
          }
        }
      }
    }
    const mergedEntries = await this.mergeEntriesFromStorage({ workspaces, files });
    workspaces = this.canonicalizeAgentSessionsWorkspaces(mergedEntries.workspaces);
    files = mergedEntries.files;
    if (workspaces.length > WorkspacesHistoryMainService.MAX_TOTAL_RECENT_ENTRIES) {
      workspaces.length = WorkspacesHistoryMainService.MAX_TOTAL_RECENT_ENTRIES;
    }
    if (files.length > WorkspacesHistoryMainService.MAX_TOTAL_RECENT_ENTRIES) {
      files.length = WorkspacesHistoryMainService.MAX_TOTAL_RECENT_ENTRIES;
    }
    await this.saveRecentlyOpened({ workspaces, files });
    this._onDidChangeRecentlyOpened.fire();
    if (isMacintosh && !this.environmentMainService.isPortable) {
      this.macOSRecentDocumentsUpdater.trigger(() => this.updateMacOSRecentDocuments());
    }
  }
  async removeRecentlyOpened(recentToRemove) {
    const keep = (recent) => {
      const uri = this.location(recent);
      for (const resourceToRemove of recentToRemove) {
        if (extUriBiasedIgnorePathCase.isEqual(resourceToRemove, uri)) {
          return false;
        }
      }
      return true;
    };
    const mru = await this.getRecentlyOpened();
    const workspaces = mru.workspaces.filter(keep);
    const files = mru.files.filter(keep);
    if (workspaces.length !== mru.workspaces.length || files.length !== mru.files.length) {
      await this.saveRecentlyOpened({ files, workspaces });
      this._onDidChangeRecentlyOpened.fire();
      if (isMacintosh && !this.environmentMainService.isPortable) {
        this.macOSRecentDocumentsUpdater.trigger(() => this.updateMacOSRecentDocuments());
      }
    }
  }
  async clearRecentlyOpened(options) {
    if (options?.confirm) {
      const { response } = await this.dialogMainService.showMessageBox({
        type: "warning",
        buttons: [
          localize({ key: "clearButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Clear"),
          localize({ key: "cancel", comment: ["&& denotes a mnemonic"] }, "&&Cancel")
        ],
        message: localize("confirmClearRecentsMessage", "Do you want to clear all recently opened files and workspaces?"),
        detail: localize("confirmClearDetail", "This action is irreversible!"),
        cancelId: 1
      });
      if (response !== 0) {
        return;
      }
    }
    await this.saveRecentlyOpened({ workspaces: [], files: [] });
    if (!this.environmentMainService.isPortable) {
      app.clearRecentDocuments();
    }
    this._onDidChangeRecentlyOpened.fire();
  }
  async getRecentlyOpened() {
    const recentlyOpened = await this.mergeEntriesFromStorage();
    return {
      workspaces: this.canonicalizeAgentSessionsWorkspaces(recentlyOpened.workspaces),
      files: recentlyOpened.files
    };
  }
  canonicalizeAgentSessionsWorkspaces(workspaces) {
    const result = [];
    let agentsWindowAdded = false;
    for (const recent of workspaces) {
      if (isRecentWorkspace(recent) && this.isAgentSessionsWorkspace(recent.workspace)) {
        if (!agentsWindowAdded) {
          agentsWindowAdded = true;
          result.push({
            workspace: getWorkspaceIdentifier(this.environmentMainService.agentSessionsWorkspace),
            label: localize("agentsWindowRecentWorkspace", "Agents Window")
          });
        }
      } else {
        result.push(recent);
      }
    }
    return result;
  }
  isAgentSessionsWorkspace(workspace) {
    if (isEqual(workspace.configPath, this.environmentMainService.agentSessionsWorkspace)) {
      return true;
    }
    const agentSessionsWorkspace = this.environmentMainService.agentSessionsWorkspace;
    return basename(workspace.configPath) === basename(agentSessionsWorkspace) && basename(dirname(workspace.configPath)) === basename(dirname(agentSessionsWorkspace));
  }
  async mergeEntriesFromStorage(existingEntries) {
    const mapWorkspaceIdToWorkspace = new ResourceMap((uri) => extUriBiasedIgnorePathCase.getComparisonKey(uri));
    if (existingEntries?.workspaces) {
      for (const workspace of existingEntries.workspaces) {
        mapWorkspaceIdToWorkspace.set(this.location(workspace), workspace);
      }
    }
    const mapFileIdToFile = new ResourceMap((uri) => extUriBiasedIgnorePathCase.getComparisonKey(uri));
    if (existingEntries?.files) {
      for (const file of existingEntries.files) {
        mapFileIdToFile.set(this.location(file), file);
      }
    }
    const recentFromStorage = await this.getRecentlyOpenedFromStorage();
    for (const recentWorkspaceFromStorage of recentFromStorage.workspaces) {
      const existingRecentWorkspace = mapWorkspaceIdToWorkspace.get(this.location(recentWorkspaceFromStorage));
      if (existingRecentWorkspace) {
        existingRecentWorkspace.label = existingRecentWorkspace.label ?? recentWorkspaceFromStorage.label;
      } else {
        mapWorkspaceIdToWorkspace.set(this.location(recentWorkspaceFromStorage), recentWorkspaceFromStorage);
      }
    }
    for (const recentFileFromStorage of recentFromStorage.files) {
      const existingRecentFile = mapFileIdToFile.get(this.location(recentFileFromStorage));
      if (existingRecentFile) {
        existingRecentFile.label = existingRecentFile.label ?? recentFileFromStorage.label;
      } else {
        mapFileIdToFile.set(this.location(recentFileFromStorage), recentFileFromStorage);
      }
    }
    return {
      workspaces: [...mapWorkspaceIdToWorkspace.values()],
      files: [...mapFileIdToFile.values()]
    };
  }
  async getRecentlyOpenedFromStorage() {
    await this.applicationStorageMainService.whenReady;
    let storedRecentlyOpened = void 0;
    const storedRecentlyOpenedRaw = this.applicationStorageMainService.get(WorkspacesHistoryMainService.RECENTLY_OPENED_STORAGE_KEY, StorageScope.APPLICATION_SHARED);
    if (typeof storedRecentlyOpenedRaw === "string") {
      try {
        storedRecentlyOpened = JSON.parse(storedRecentlyOpenedRaw);
      } catch (error) {
        this.logService.error("Unexpected error parsing opened paths list", error);
      }
    }
    return restoreRecentlyOpened(storedRecentlyOpened, this.logService);
  }
  async saveRecentlyOpened(recent) {
    await this.applicationStorageMainService.whenReady;
    this.applicationStorageMainService.store(WorkspacesHistoryMainService.RECENTLY_OPENED_STORAGE_KEY, JSON.stringify(toStoreData(recent)), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
  }
  location(recent) {
    if (isRecentFolder(recent)) {
      return recent.folderUri;
    }
    if (isRecentFile(recent)) {
      return recent.fileUri;
    }
    return recent.workspace.configPath;
  }
  containsWorkspace(recents, candidate) {
    return !!recents.find((recent) => isRecentWorkspace(recent) && recent.workspace.id === candidate.id);
  }
  containsFolder(recents, candidate) {
    return !!recents.find((recent) => isRecentFolder(recent) && extUriBiasedIgnorePathCase.isEqual(recent.folderUri, candidate));
  }
  containsFile(recents, candidate) {
    return !!recents.find((recent) => extUriBiasedIgnorePathCase.isEqual(recent.fileUri, candidate));
  }
  async handleWindowsJumpList() {
    if (!isWindows) {
      return;
    }
    if (this.environmentMainService.isPortable) {
      return;
    }
    await this.updateWindowsJumpList();
    this._register(this.onDidChangeRecentlyOpened(() => this.updateWindowsJumpList()));
  }
  async updateWindowsJumpList() {
    if (!isWindows) {
      return;
    }
    const jumpList = [];
    jumpList.push({
      type: "tasks",
      items: [
        {
          type: "task",
          title: localize("newWindow", "New Window"),
          description: localize("newWindowDesc", "Opens a new window"),
          program: process.execPath,
          args: "-n",
          // force new window
          iconPath: process.execPath,
          iconIndex: 0
        }
      ]
    });
    if ((await this.getRecentlyOpened()).workspaces.length > 0) {
      const jumpListSettings = app.getJumpListSettings();
      const toRemove = [];
      for (const item of jumpListSettings.removedItems) {
        const args = item.args;
        if (args) {
          const match = /^--(folder|file)-uri\s+"([^"]+)"$/.exec(args);
          if (match) {
            toRemove.push(URI.parse(match[2]));
          }
        }
      }
      await this.removeRecentlyOpened(toRemove);
      let hasWorkspaces = false;
      const items = coalesce((await this.getRecentlyOpened()).workspaces.slice(0, jumpListSettings.minItems).map((recent) => {
        const workspace = isRecentWorkspace(recent) ? recent.workspace : recent.folderUri;
        const { title, description } = this.getWindowsJumpListLabel(workspace, recent.label);
        let args;
        if (URI.isUri(workspace)) {
          args = `--folder-uri "${workspace.toString()}"`;
        } else {
          hasWorkspaces = true;
          args = `--file-uri "${workspace.configPath.toString()}"`;
        }
        return {
          type: "task",
          title: title.substr(0, 255),
          // Windows seems to be picky around the length of entries
          description: description.substr(0, 255),
          // (see https://github.com/microsoft/vscode/issues/111177)
          program: process.execPath,
          args,
          iconPath: "explorer.exe",
          // simulate folder icon
          iconIndex: 0
        };
      }));
      if (items.length > 0) {
        jumpList.push({
          type: "custom",
          name: hasWorkspaces ? localize("recentFoldersAndWorkspaces", "Recent Folders & Workspaces") : localize("recentFolders", "Recent Folders"),
          items
        });
      }
    }
    jumpList.push({
      type: "recent"
      // this enables to show files in the "recent" category
    });
    try {
      const res = app.setJumpList(jumpList);
      if (res && res !== "ok") {
        this.logService.warn(`updateWindowsJumpList#setJumpList unexpected result: ${res}`);
      }
    } catch (error) {
      this.logService.warn("updateWindowsJumpList#setJumpList", error);
    }
  }
  getWindowsJumpListLabel(workspace, recentLabel) {
    if (recentLabel) {
      return { title: splitRecentLabel(recentLabel).name, description: recentLabel };
    }
    if (URI.isUri(workspace)) {
      return { title: basename(workspace), description: this.renderJumpListPathDescription(workspace) };
    }
    if (this.workspacesManagementMainService.isUntitledWorkspace(workspace)) {
      return { title: localize("untitledWorkspace", "Untitled (Workspace)"), description: "" };
    }
    let filename = basename(workspace.configPath);
    if (filename.endsWith(WORKSPACE_EXTENSION)) {
      filename = filename.substr(0, filename.length - WORKSPACE_EXTENSION.length - 1);
    }
    return { title: localize("workspaceName", "{0} (Workspace)", filename), description: this.renderJumpListPathDescription(workspace.configPath) };
  }
  renderJumpListPathDescription(uri) {
    return uri.scheme === "file" ? normalizeDriveLetter(uri.fsPath) : uri.toString();
  }
  async updateMacOSRecentDocuments() {
    if (!isMacintosh) {
      return;
    }
    app.clearRecentDocuments();
    const mru = await this.getRecentlyOpened();
    const workspaceEntries = [];
    let entries = 0;
    for (let i = 0; i < mru.workspaces.length && entries < WorkspacesHistoryMainService.MAX_MACOS_DOCK_RECENT_WORKSPACES; i++) {
      const loc = this.location(mru.workspaces[i]);
      if (loc.scheme === Schemas.file) {
        const workspacePath = originalFSPath(loc);
        if (await Promises.exists(workspacePath)) {
          workspaceEntries.push(workspacePath);
          entries++;
        }
      }
    }
    const fileEntries = [];
    for (let i = 0; i < mru.files.length && entries < WorkspacesHistoryMainService.MAX_MACOS_DOCK_RECENT_ENTRIES_TOTAL; i++) {
      const loc = this.location(mru.files[i]);
      if (loc.scheme === Schemas.file) {
        const filePath = originalFSPath(loc);
        if (WorkspacesHistoryMainService.COMMON_FILES_FILTER.includes(basename(loc)) || // skip some well known file entries
        workspaceEntries.includes(filePath)) {
          continue;
        }
        if (await Promises.exists(filePath)) {
          fileEntries.push(filePath);
          entries++;
        }
      }
    }
    fileEntries.reverse().forEach((fileEntry) => app.addRecentDocument(fileEntry));
    workspaceEntries.reverse().forEach((workspaceEntry) => app.addRecentDocument(workspaceEntry));
  }
  //#endregion
};
WorkspacesHistoryMainService.MAX_TOTAL_RECENT_ENTRIES = 500;
WorkspacesHistoryMainService.RECENTLY_OPENED_STORAGE_KEY = "history.recentlyOpenedPathsList";
//#endregion
//#region macOS Dock / Windows JumpList
WorkspacesHistoryMainService.MAX_MACOS_DOCK_RECENT_WORKSPACES = 7;
// prefer higher number of workspaces...
WorkspacesHistoryMainService.MAX_MACOS_DOCK_RECENT_ENTRIES_TOTAL = 10;
// ...over number of files
// Exclude some very common files from the dock/taskbar
WorkspacesHistoryMainService.COMMON_FILES_FILTER = [
  "COMMIT_EDITMSG",
  "MERGE_MSG",
  "git-rebase-todo"
];
WorkspacesHistoryMainService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IWorkspacesManagementMainService),
  __decorateParam(2, ILifecycleMainService),
  __decorateParam(3, IApplicationStorageMainService),
  __decorateParam(4, IDialogMainService),
  __decorateParam(5, IEnvironmentMainService)
], WorkspacesHistoryMainService);
export {
  IWorkspacesHistoryMainService,
  WorkspacesHistoryMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3dvcmtzcGFjZXMvZWxlY3Ryb24tbWFpbi93b3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXBwLCBKdW1wTGlzdENhdGVnb3J5LCBKdW1wTGlzdEl0ZW0gfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBUaHJvdHRsZWREZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgYXMgQ29tbW9uRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVEcml2ZUxldHRlciwgc3BsaXRSZWNlbnRMYWJlbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UsIGlzRXF1YWwsIG9yaWdpbmFsRlNQYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlTWFpblNlcnZpY2UsIExpZmVjeWNsZU1haW5QaGFzZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9lbGVjdHJvbi1tYWluL2xpZmVjeWNsZU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2VsZWN0cm9uLW1haW4vc3RvcmFnZU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZWNlbnQsIElSZWNlbnRGaWxlLCBJUmVjZW50Rm9sZGVyLCBJUmVjZW50bHlPcGVuZWQsIElSZWNlbnRXb3Jrc3BhY2UsIGlzUmVjZW50RmlsZSwgaXNSZWNlbnRGb2xkZXIsIGlzUmVjZW50V29ya3NwYWNlLCByZXN0b3JlUmVjZW50bHlPcGVuZWQsIHRvU3RvcmVEYXRhIH0gZnJvbSAnLi4vY29tbW9uL3dvcmtzcGFjZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUlkZW50aWZpZXIsIFdPUktTUEFDRV9FWFRFTlNJT04gfSBmcm9tICcuLi8uLi93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBnZXRXb3Jrc3BhY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vY29tbW9uL3dvcmtzcGFjZUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UgfSBmcm9tICcuL3dvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgSURpYWxvZ01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZGlhbG9ncy9lbGVjdHJvbi1tYWluL2RpYWxvZ01haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvZWxlY3Ryb24tbWFpbi9lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IElXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlPignd29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZDogQ29tbW9uRXZlbnQ8dm9pZD47XG5cblx0YWRkUmVjZW50bHlPcGVuZWQocmVjZW50czogSVJlY2VudFtdKTogUHJvbWlzZTx2b2lkPjtcblx0Z2V0UmVjZW50bHlPcGVuZWQoKTogUHJvbWlzZTxJUmVjZW50bHlPcGVuZWQ+O1xuXHRyZW1vdmVSZWNlbnRseU9wZW5lZChwYXRoczogVVJJW10pOiBQcm9taXNlPHZvaWQ+O1xuXHRjbGVhclJlY2VudGx5T3BlbmVkKG9wdGlvbnM/OiB7IGNvbmZpcm0/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgY2xhc3MgV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX1RPVEFMX1JFQ0VOVF9FTlRSSUVTID0gNTAwO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFQ0VOVExZX09QRU5FRF9TVE9SQUdFX0tFWSA9ICdoaXN0b3J5LnJlY2VudGx5T3BlbmVkUGF0aHNMaXN0JztcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJlY2VudGx5T3BlbmVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVjZW50bHlPcGVuZWQgPSB0aGlzLl9vbkRpZENoYW5nZVJlY2VudGx5T3BlbmVkLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2U6IElXb3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVNYWluU2VydmljZTogSUxpZmVjeWNsZU1haW5TZXJ2aWNlLFxuXHRcdEBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZTogSUFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dNYWluU2VydmljZTogSURpYWxvZ01haW5TZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50TWFpblNlcnZpY2U6IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gSW5zdGFsbCB3aW5kb3cganVtcCBsaXN0IGRlbGF5ZWQgYWZ0ZXIgb3BlbmluZyB3aW5kb3dcblx0XHQvLyBiZWNhdXNlIHBlcmYgbWVhc3VyZW1lbnRzIGhhdmUgc2hvd24gdGhpcyB0byBiZSBzbG93XG5cdFx0dGhpcy5saWZlY3ljbGVNYWluU2VydmljZS53aGVuKExpZmVjeWNsZU1haW5QaGFzZS5FdmVudHVhbGx5KS50aGVuKCgpID0+IHRoaXMuaGFuZGxlV2luZG93c0p1bXBMaXN0KCkpO1xuXG5cdFx0Ly8gQWRkIHRvIGhpc3Rvcnkgd2hlbiBlbnRlcmluZyB3b3Jrc3BhY2Vcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2Uub25EaWRFbnRlcldvcmtzcGFjZShldmVudCA9PiB0aGlzLmFkZFJlY2VudGx5T3BlbmVkKFt7IHdvcmtzcGFjZTogZXZlbnQud29ya3NwYWNlLCByZW1vdGVBdXRob3JpdHk6IGV2ZW50LndpbmRvdy5yZW1vdGVBdXRob3JpdHkgfV0pKSk7XG5cdH1cblxuXHQvLyNyZWdpb24gV29ya3NwYWNlcyBIaXN0b3J5XG5cblx0YXN5bmMgYWRkUmVjZW50bHlPcGVuZWQocmVjZW50VG9BZGQ6IElSZWNlbnRbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCB3b3Jrc3BhY2VzOiBBcnJheTxJUmVjZW50Rm9sZGVyIHwgSVJlY2VudFdvcmtzcGFjZT4gPSBbXTtcblx0XHRsZXQgZmlsZXM6IElSZWNlbnRGaWxlW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgcmVjZW50IG9mIHJlY2VudFRvQWRkKSB7XG5cblx0XHRcdC8vIFdvcmtzcGFjZVxuXHRcdFx0aWYgKGlzUmVjZW50V29ya3NwYWNlKHJlY2VudCkpIHtcblx0XHRcdFx0aWYgKCF0aGlzLndvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UuaXNVbnRpdGxlZFdvcmtzcGFjZShyZWNlbnQud29ya3NwYWNlKSAmJiAhdGhpcy5jb250YWluc1dvcmtzcGFjZSh3b3Jrc3BhY2VzLCByZWNlbnQud29ya3NwYWNlKSkge1xuXHRcdFx0XHRcdHdvcmtzcGFjZXMucHVzaChyZWNlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZvbGRlclxuXHRcdFx0ZWxzZSBpZiAoaXNSZWNlbnRGb2xkZXIocmVjZW50KSkge1xuXHRcdFx0XHRpZiAoIXRoaXMuY29udGFpbnNGb2xkZXIod29ya3NwYWNlcywgcmVjZW50LmZvbGRlclVyaSkpIHtcblx0XHRcdFx0XHR3b3Jrc3BhY2VzLnB1c2gocmVjZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBGaWxlXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Y29uc3QgYWxyZWFkeUV4aXN0c0luSGlzdG9yeSA9IHRoaXMuY29udGFpbnNGaWxlKGZpbGVzLCByZWNlbnQuZmlsZVVyaSk7XG5cdFx0XHRcdGNvbnN0IHNob3VsZEJlRmlsdGVyZWQgPSByZWNlbnQuZmlsZVVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSAmJiBXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLkNPTU1PTl9GSUxFU19GSUxURVIuaW5kZXhPZihiYXNlbmFtZShyZWNlbnQuZmlsZVVyaSkpID49IDA7XG5cblx0XHRcdFx0aWYgKCFhbHJlYWR5RXhpc3RzSW5IaXN0b3J5ICYmICFzaG91bGRCZUZpbHRlcmVkKSB7XG5cdFx0XHRcdFx0ZmlsZXMucHVzaChyZWNlbnQpO1xuXG5cdFx0XHRcdFx0Ly8gQWRkIHRvIHJlY2VudCBkb2N1bWVudHMgKFdpbmRvd3Mgb25seSwgbWFjT1MgbGF0ZXIpXG5cdFx0XHRcdFx0Ly8gU2tpcCBpbiBwb3J0YWJsZSBtb2RlIHRvIGF2b2lkIGxlYXZpbmcgdHJhY2VzIG9uIHRoZSBtYWNoaW5lXG5cdFx0XHRcdFx0Ly8gU2tpcCBpbiB0aGUgc2Vzc2lvbnMgYXBwIHRvIGF2b2lkIHBvbGx1dGluZyB0aGUganVtcCBsaXN0XG5cdFx0XHRcdFx0aWYgKGlzV2luZG93cyAmJiByZWNlbnQuZmlsZVVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSAmJiAhdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmlzUG9ydGFibGUpIHtcblx0XHRcdFx0XHRcdGFwcC5hZGRSZWNlbnREb2N1bWVudChyZWNlbnQuZmlsZVVyaS5mc1BhdGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1lcmdlZEVudHJpZXMgPSBhd2FpdCB0aGlzLm1lcmdlRW50cmllc0Zyb21TdG9yYWdlKHsgd29ya3NwYWNlcywgZmlsZXMgfSk7XG5cdFx0d29ya3NwYWNlcyA9IHRoaXMuY2Fub25pY2FsaXplQWdlbnRTZXNzaW9uc1dvcmtzcGFjZXMobWVyZ2VkRW50cmllcy53b3Jrc3BhY2VzKTtcblx0XHRmaWxlcyA9IG1lcmdlZEVudHJpZXMuZmlsZXM7XG5cblx0XHRpZiAod29ya3NwYWNlcy5sZW5ndGggPiBXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLk1BWF9UT1RBTF9SRUNFTlRfRU5UUklFUykge1xuXHRcdFx0d29ya3NwYWNlcy5sZW5ndGggPSBXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLk1BWF9UT1RBTF9SRUNFTlRfRU5UUklFUztcblx0XHR9XG5cblx0XHRpZiAoZmlsZXMubGVuZ3RoID4gV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZS5NQVhfVE9UQUxfUkVDRU5UX0VOVFJJRVMpIHtcblx0XHRcdGZpbGVzLmxlbmd0aCA9IFdvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UuTUFYX1RPVEFMX1JFQ0VOVF9FTlRSSUVTO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuc2F2ZVJlY2VudGx5T3BlbmVkKHsgd29ya3NwYWNlcywgZmlsZXMgfSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZC5maXJlKCk7XG5cblx0XHQvLyBTY2hlZHVsZSB1cGRhdGUgdG8gcmVjZW50IGRvY3VtZW50cyBvbiBtYWNPUyBkb2NrXG5cdFx0Ly8gU2tpcCBpbiBwb3J0YWJsZSBtb2RlIHRvIGF2b2lkIGxlYXZpbmcgdHJhY2VzIG9uIHRoZSBtYWNoaW5lXG5cdFx0aWYgKGlzTWFjaW50b3NoICYmICF0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuaXNQb3J0YWJsZSkge1xuXHRcdFx0dGhpcy5tYWNPU1JlY2VudERvY3VtZW50c1VwZGF0ZXIudHJpZ2dlcigoKSA9PiB0aGlzLnVwZGF0ZU1hY09TUmVjZW50RG9jdW1lbnRzKCkpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlbW92ZVJlY2VudGx5T3BlbmVkKHJlY2VudFRvUmVtb3ZlOiBVUklbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGtlZXAgPSAocmVjZW50OiBJUmVjZW50KSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSB0aGlzLmxvY2F0aW9uKHJlY2VudCk7XG5cdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlVG9SZW1vdmUgb2YgcmVjZW50VG9SZW1vdmUpIHtcblx0XHRcdFx0aWYgKGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwocmVzb3VyY2VUb1JlbW92ZSwgdXJpKSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgbXJ1ID0gYXdhaXQgdGhpcy5nZXRSZWNlbnRseU9wZW5lZCgpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZXMgPSBtcnUud29ya3NwYWNlcy5maWx0ZXIoa2VlcCk7XG5cdFx0Y29uc3QgZmlsZXMgPSBtcnUuZmlsZXMuZmlsdGVyKGtlZXApO1xuXG5cdFx0aWYgKHdvcmtzcGFjZXMubGVuZ3RoICE9PSBtcnUud29ya3NwYWNlcy5sZW5ndGggfHwgZmlsZXMubGVuZ3RoICE9PSBtcnUuZmlsZXMubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnNhdmVSZWNlbnRseU9wZW5lZCh7IGZpbGVzLCB3b3Jrc3BhY2VzIH0pO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZC5maXJlKCk7XG5cblx0XHRcdC8vIFNjaGVkdWxlIHVwZGF0ZSB0byByZWNlbnQgZG9jdW1lbnRzIG9uIG1hY09TIGRvY2tcblx0XHRcdC8vIFNraXAgaW4gcG9ydGFibGUgbW9kZSB0byBhdm9pZCBsZWF2aW5nIHRyYWNlcyBvbiB0aGUgbWFjaGluZVxuXHRcdFx0aWYgKGlzTWFjaW50b3NoICYmICF0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuaXNQb3J0YWJsZSkge1xuXHRcdFx0XHR0aGlzLm1hY09TUmVjZW50RG9jdW1lbnRzVXBkYXRlci50cmlnZ2VyKCgpID0+IHRoaXMudXBkYXRlTWFjT1NSZWNlbnREb2N1bWVudHMoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY2xlYXJSZWNlbnRseU9wZW5lZChvcHRpb25zPzogeyBjb25maXJtPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKG9wdGlvbnM/LmNvbmZpcm0pIHtcblx0XHRcdGNvbnN0IHsgcmVzcG9uc2UgfSA9IGF3YWl0IHRoaXMuZGlhbG9nTWFpblNlcnZpY2Uuc2hvd01lc3NhZ2VCb3goe1xuXHRcdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHRsb2NhbGl6ZSh7IGtleTogJ2NsZWFyQnV0dG9uTGFiZWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDbGVhclwiKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSh7IGtleTogJ2NhbmNlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNhbmNlbFwiKVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybUNsZWFyUmVjZW50c01lc3NhZ2UnLCBcIkRvIHlvdSB3YW50IHRvIGNsZWFyIGFsbCByZWNlbnRseSBvcGVuZWQgZmlsZXMgYW5kIHdvcmtzcGFjZXM/XCIpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjb25maXJtQ2xlYXJEZXRhaWwnLCBcIlRoaXMgYWN0aW9uIGlzIGlycmV2ZXJzaWJsZSFcIiksXG5cdFx0XHRcdGNhbmNlbElkOiAxXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHJlc3BvbnNlICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnNhdmVSZWNlbnRseU9wZW5lZCh7IHdvcmtzcGFjZXM6IFtdLCBmaWxlczogW10gfSk7XG5cblx0XHQvLyBTa2lwIGluIHBvcnRhYmxlIG1vZGUgdG8gYXZvaWQgbGVhdmluZyB0cmFjZXMgb24gdGhlIG1hY2hpbmVcblx0XHRpZiAoIXRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5pc1BvcnRhYmxlKSB7XG5cdFx0XHRhcHAuY2xlYXJSZWNlbnREb2N1bWVudHMoKTtcblx0XHR9XG5cblx0XHQvLyBFdmVudFxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVjZW50bHlPcGVuZWQuZmlyZSgpO1xuXHR9XG5cblx0YXN5bmMgZ2V0UmVjZW50bHlPcGVuZWQoKTogUHJvbWlzZTxJUmVjZW50bHlPcGVuZWQ+IHtcblx0XHRjb25zdCByZWNlbnRseU9wZW5lZCA9IGF3YWl0IHRoaXMubWVyZ2VFbnRyaWVzRnJvbVN0b3JhZ2UoKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHR3b3Jrc3BhY2VzOiB0aGlzLmNhbm9uaWNhbGl6ZUFnZW50U2Vzc2lvbnNXb3Jrc3BhY2VzKHJlY2VudGx5T3BlbmVkLndvcmtzcGFjZXMpLFxuXHRcdFx0ZmlsZXM6IHJlY2VudGx5T3BlbmVkLmZpbGVzXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY2Fub25pY2FsaXplQWdlbnRTZXNzaW9uc1dvcmtzcGFjZXMod29ya3NwYWNlczogQXJyYXk8SVJlY2VudFdvcmtzcGFjZSB8IElSZWNlbnRGb2xkZXI+KTogQXJyYXk8SVJlY2VudFdvcmtzcGFjZSB8IElSZWNlbnRGb2xkZXI+IHtcblx0XHRjb25zdCByZXN1bHQ6IEFycmF5PElSZWNlbnRXb3Jrc3BhY2UgfCBJUmVjZW50Rm9sZGVyPiA9IFtdO1xuXHRcdGxldCBhZ2VudHNXaW5kb3dBZGRlZCA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCByZWNlbnQgb2Ygd29ya3NwYWNlcykge1xuXHRcdFx0aWYgKGlzUmVjZW50V29ya3NwYWNlKHJlY2VudCkgJiYgdGhpcy5pc0FnZW50U2Vzc2lvbnNXb3Jrc3BhY2UocmVjZW50LndvcmtzcGFjZSkpIHtcblx0XHRcdFx0aWYgKCFhZ2VudHNXaW5kb3dBZGRlZCkge1xuXHRcdFx0XHRcdGFnZW50c1dpbmRvd0FkZGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2U6IGdldFdvcmtzcGFjZUlkZW50aWZpZXIodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFnZW50U2Vzc2lvbnNXb3Jrc3BhY2UpLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudHNXaW5kb3dSZWNlbnRXb3Jrc3BhY2UnLCBcIkFnZW50cyBXaW5kb3dcIilcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gocmVjZW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBpc0FnZW50U2Vzc2lvbnNXb3Jrc3BhY2Uod29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllcik6IGJvb2xlYW4ge1xuXHRcdGlmIChpc0VxdWFsKHdvcmtzcGFjZS5jb25maWdQYXRoLCB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYWdlbnRTZXNzaW9uc1dvcmtzcGFjZSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFJlY2VudHMgY2FuIHJldGFpbiBBZ2VudHMgd29ya3NwYWNlcyBmcm9tIG90aGVyIHByb2ZpbGUgYW5kIHdvcmt0cmVlIHVzZXItZGF0YSBkaXJlY3Rvcmllcy5cblx0XHRjb25zdCBhZ2VudFNlc3Npb25zV29ya3NwYWNlID0gdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFnZW50U2Vzc2lvbnNXb3Jrc3BhY2U7XG5cdFx0cmV0dXJuIGJhc2VuYW1lKHdvcmtzcGFjZS5jb25maWdQYXRoKSA9PT0gYmFzZW5hbWUoYWdlbnRTZXNzaW9uc1dvcmtzcGFjZSlcblx0XHRcdCYmIGJhc2VuYW1lKGRpcm5hbWUod29ya3NwYWNlLmNvbmZpZ1BhdGgpKSA9PT0gYmFzZW5hbWUoZGlybmFtZShhZ2VudFNlc3Npb25zV29ya3NwYWNlKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1lcmdlRW50cmllc0Zyb21TdG9yYWdlKGV4aXN0aW5nRW50cmllcz86IElSZWNlbnRseU9wZW5lZCk6IFByb21pc2U8SVJlY2VudGx5T3BlbmVkPiB7XG5cblx0XHQvLyBCdWlsZCBtYXBzIGZvciBtb3JlIGVmZmljaWVudCBsb29rdXAgb2YgZXhpc3RpbmcgZW50cmllcyB0aGF0XG5cdFx0Ly8gYXJlIHBhc3NlZCBpbiBieSBzdG9yaW5nIGJhc2VkIG9uIHdvcmtzcGFjZS9maWxlIGlkZW50aWZpZXJcblxuXHRcdGNvbnN0IG1hcFdvcmtzcGFjZUlkVG9Xb3Jrc3BhY2UgPSBuZXcgUmVzb3VyY2VNYXA8SVJlY2VudEZvbGRlciB8IElSZWNlbnRXb3Jrc3BhY2U+KHVyaSA9PiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5nZXRDb21wYXJpc29uS2V5KHVyaSkpO1xuXHRcdGlmIChleGlzdGluZ0VudHJpZXM/LndvcmtzcGFjZXMpIHtcblx0XHRcdGZvciAoY29uc3Qgd29ya3NwYWNlIG9mIGV4aXN0aW5nRW50cmllcy53b3Jrc3BhY2VzKSB7XG5cdFx0XHRcdG1hcFdvcmtzcGFjZUlkVG9Xb3Jrc3BhY2Uuc2V0KHRoaXMubG9jYXRpb24od29ya3NwYWNlKSwgd29ya3NwYWNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtYXBGaWxlSWRUb0ZpbGUgPSBuZXcgUmVzb3VyY2VNYXA8SVJlY2VudEZpbGU+KHVyaSA9PiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5nZXRDb21wYXJpc29uS2V5KHVyaSkpO1xuXHRcdGlmIChleGlzdGluZ0VudHJpZXM/LmZpbGVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZXhpc3RpbmdFbnRyaWVzLmZpbGVzKSB7XG5cdFx0XHRcdG1hcEZpbGVJZFRvRmlsZS5zZXQodGhpcy5sb2NhdGlvbihmaWxlKSwgZmlsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTWVyZ2UgaW4gZW50cmllcyBmcm9tIHN0b3JhZ2UsIHByZXNlcnZpbmcgZXhpc3Rpbmcga25vd24gZW50cmllc1xuXG5cdFx0Y29uc3QgcmVjZW50RnJvbVN0b3JhZ2UgPSBhd2FpdCB0aGlzLmdldFJlY2VudGx5T3BlbmVkRnJvbVN0b3JhZ2UoKTtcblx0XHRmb3IgKGNvbnN0IHJlY2VudFdvcmtzcGFjZUZyb21TdG9yYWdlIG9mIHJlY2VudEZyb21TdG9yYWdlLndvcmtzcGFjZXMpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nUmVjZW50V29ya3NwYWNlID0gbWFwV29ya3NwYWNlSWRUb1dvcmtzcGFjZS5nZXQodGhpcy5sb2NhdGlvbihyZWNlbnRXb3Jrc3BhY2VGcm9tU3RvcmFnZSkpO1xuXHRcdFx0aWYgKGV4aXN0aW5nUmVjZW50V29ya3NwYWNlKSB7XG5cdFx0XHRcdGV4aXN0aW5nUmVjZW50V29ya3NwYWNlLmxhYmVsID0gZXhpc3RpbmdSZWNlbnRXb3Jrc3BhY2UubGFiZWwgPz8gcmVjZW50V29ya3NwYWNlRnJvbVN0b3JhZ2UubGFiZWw7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtYXBXb3Jrc3BhY2VJZFRvV29ya3NwYWNlLnNldCh0aGlzLmxvY2F0aW9uKHJlY2VudFdvcmtzcGFjZUZyb21TdG9yYWdlKSwgcmVjZW50V29ya3NwYWNlRnJvbVN0b3JhZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcmVjZW50RmlsZUZyb21TdG9yYWdlIG9mIHJlY2VudEZyb21TdG9yYWdlLmZpbGVzKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZ1JlY2VudEZpbGUgPSBtYXBGaWxlSWRUb0ZpbGUuZ2V0KHRoaXMubG9jYXRpb24ocmVjZW50RmlsZUZyb21TdG9yYWdlKSk7XG5cdFx0XHRpZiAoZXhpc3RpbmdSZWNlbnRGaWxlKSB7XG5cdFx0XHRcdGV4aXN0aW5nUmVjZW50RmlsZS5sYWJlbCA9IGV4aXN0aW5nUmVjZW50RmlsZS5sYWJlbCA/PyByZWNlbnRGaWxlRnJvbVN0b3JhZ2UubGFiZWw7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtYXBGaWxlSWRUb0ZpbGUuc2V0KHRoaXMubG9jYXRpb24ocmVjZW50RmlsZUZyb21TdG9yYWdlKSwgcmVjZW50RmlsZUZyb21TdG9yYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0d29ya3NwYWNlczogWy4uLm1hcFdvcmtzcGFjZUlkVG9Xb3Jrc3BhY2UudmFsdWVzKCldLFxuXHRcdFx0ZmlsZXM6IFsuLi5tYXBGaWxlSWRUb0ZpbGUudmFsdWVzKCldXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0UmVjZW50bHlPcGVuZWRGcm9tU3RvcmFnZSgpOiBQcm9taXNlPElSZWNlbnRseU9wZW5lZD4ge1xuXG5cdFx0Ly8gV2FpdCBmb3IgZ2xvYmFsIHN0b3JhZ2UgdG8gYmUgcmVhZHlcblx0XHRhd2FpdCB0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlLndoZW5SZWFkeTtcblxuXHRcdGxldCBzdG9yZWRSZWNlbnRseU9wZW5lZDogb2JqZWN0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gRmlyc3QgdHJ5IHdpdGggc3RvcmFnZSBzZXJ2aWNlXG5cdFx0Y29uc3Qgc3RvcmVkUmVjZW50bHlPcGVuZWRSYXcgPSB0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlLmdldChXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLlJFQ0VOVExZX09QRU5FRF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCk7XG5cdFx0aWYgKHR5cGVvZiBzdG9yZWRSZWNlbnRseU9wZW5lZFJhdyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHN0b3JlZFJlY2VudGx5T3BlbmVkID0gSlNPTi5wYXJzZShzdG9yZWRSZWNlbnRseU9wZW5lZFJhdyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1VuZXhwZWN0ZWQgZXJyb3IgcGFyc2luZyBvcGVuZWQgcGF0aHMgbGlzdCcsIGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdG9yZVJlY2VudGx5T3BlbmVkKHN0b3JlZFJlY2VudGx5T3BlbmVkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzYXZlUmVjZW50bHlPcGVuZWQocmVjZW50OiBJUmVjZW50bHlPcGVuZWQpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFdhaXQgZm9yIGdsb2JhbCBzdG9yYWdlIHRvIGJlIHJlYWR5XG5cdFx0YXdhaXQgdGhpcy5hcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZS53aGVuUmVhZHk7XG5cblx0XHQvLyBTdG9yZSBpbiBhcHBsaWNhdGlvbiBzaGFyZWQgc3RvcmFnZSAoYnV0IGRvIG5vdCBzeW5jIHNpbmNlIHRoaXMgaXMgbWFpbmx5IGxvY2FsIHBhdGhzKVxuXHRcdHRoaXMuYXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2Uuc3RvcmUoV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZS5SRUNFTlRMWV9PUEVORURfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KHRvU3RvcmVEYXRhKHJlY2VudCkpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVELCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2NhdGlvbihyZWNlbnQ6IElSZWNlbnQpOiBVUkkge1xuXHRcdGlmIChpc1JlY2VudEZvbGRlcihyZWNlbnQpKSB7XG5cdFx0XHRyZXR1cm4gcmVjZW50LmZvbGRlclVyaTtcblx0XHR9XG5cblx0XHRpZiAoaXNSZWNlbnRGaWxlKHJlY2VudCkpIHtcblx0XHRcdHJldHVybiByZWNlbnQuZmlsZVVyaTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVjZW50LndvcmtzcGFjZS5jb25maWdQYXRoO1xuXHR9XG5cblx0cHJpdmF0ZSBjb250YWluc1dvcmtzcGFjZShyZWNlbnRzOiBJUmVjZW50W10sIGNhbmRpZGF0ZTogSVdvcmtzcGFjZUlkZW50aWZpZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFyZWNlbnRzLmZpbmQocmVjZW50ID0+IGlzUmVjZW50V29ya3NwYWNlKHJlY2VudCkgJiYgcmVjZW50LndvcmtzcGFjZS5pZCA9PT0gY2FuZGlkYXRlLmlkKTtcblx0fVxuXG5cdHByaXZhdGUgY29udGFpbnNGb2xkZXIocmVjZW50czogSVJlY2VudFtdLCBjYW5kaWRhdGU6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXJlY2VudHMuZmluZChyZWNlbnQgPT4gaXNSZWNlbnRGb2xkZXIocmVjZW50KSAmJiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKHJlY2VudC5mb2xkZXJVcmksIGNhbmRpZGF0ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb250YWluc0ZpbGUocmVjZW50czogSVJlY2VudEZpbGVbXSwgY2FuZGlkYXRlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFyZWNlbnRzLmZpbmQocmVjZW50ID0+IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwocmVjZW50LmZpbGVVcmksIGNhbmRpZGF0ZSkpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHQvLyNyZWdpb24gbWFjT1MgRG9jayAvIFdpbmRvd3MgSnVtcExpc3RcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfTUFDT1NfRE9DS19SRUNFTlRfV09SS1NQQUNFUyA9IDc7IFx0XHQvLyBwcmVmZXIgaGlnaGVyIG51bWJlciBvZiB3b3Jrc3BhY2VzLi4uXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9NQUNPU19ET0NLX1JFQ0VOVF9FTlRSSUVTX1RPVEFMID0gMTA7IFx0Ly8gLi4ub3ZlciBudW1iZXIgb2YgZmlsZXNcblxuXHQvLyBFeGNsdWRlIHNvbWUgdmVyeSBjb21tb24gZmlsZXMgZnJvbSB0aGUgZG9jay90YXNrYmFyXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENPTU1PTl9GSUxFU19GSUxURVIgPSBbXG5cdFx0J0NPTU1JVF9FRElUTVNHJyxcblx0XHQnTUVSR0VfTVNHJyxcblx0XHQnZ2l0LXJlYmFzZS10b2RvJ1xuXHRdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWFjT1NSZWNlbnREb2N1bWVudHNVcGRhdGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlZERlbGF5ZXI8dm9pZD4oODAwKSk7XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVXaW5kb3dzSnVtcExpc3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdHJldHVybjsgLy8gb25seSBvbiB3aW5kb3dzXG5cdFx0fVxuXG5cdFx0Ly8gU2tpcCBpbiBwb3J0YWJsZSBtb2RlIHRvIGF2b2lkIGxlYXZpbmcgdHJhY2VzIG9uIHRoZSBtYWNoaW5lXG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5pc1BvcnRhYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy51cGRhdGVXaW5kb3dzSnVtcExpc3QoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlUmVjZW50bHlPcGVuZWQoKCkgPT4gdGhpcy51cGRhdGVXaW5kb3dzSnVtcExpc3QoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVXaW5kb3dzSnVtcExpc3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdHJldHVybjsgLy8gb25seSBvbiB3aW5kb3dzXG5cdFx0fVxuXG5cdFx0Y29uc3QganVtcExpc3Q6IEp1bXBMaXN0Q2F0ZWdvcnlbXSA9IFtdO1xuXG5cdFx0Ly8gVGFza3Ncblx0XHRqdW1wTGlzdC5wdXNoKHtcblx0XHRcdHR5cGU6ICd0YXNrcycsXG5cdFx0XHRpdGVtczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3Rhc2snLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbmV3V2luZG93JywgXCJOZXcgV2luZG93XCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbmV3V2luZG93RGVzYycsIFwiT3BlbnMgYSBuZXcgd2luZG93XCIpLFxuXHRcdFx0XHRcdHByb2dyYW06IHByb2Nlc3MuZXhlY1BhdGgsXG5cdFx0XHRcdFx0YXJnczogJy1uJywgLy8gZm9yY2UgbmV3IHdpbmRvd1xuXHRcdFx0XHRcdGljb25QYXRoOiBwcm9jZXNzLmV4ZWNQYXRoLFxuXHRcdFx0XHRcdGljb25JbmRleDogMFxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cblx0XHQvLyBSZWNlbnQgV29ya3NwYWNlc1xuXHRcdGlmICgoYXdhaXQgdGhpcy5nZXRSZWNlbnRseU9wZW5lZCgpKS53b3Jrc3BhY2VzLmxlbmd0aCA+IDApIHtcblxuXHRcdFx0Ly8gVGhlIHVzZXIgbWlnaHQgaGF2ZSBtZWFud2hpbGUgcmVtb3ZlZCBpdGVtcyBmcm9tIHRoZSBqdW1wIGxpc3QgYW5kIHdlIGhhdmUgdG8gcmVzcGVjdCB0aGF0XG5cdFx0XHQvLyBzbyB3ZSBuZWVkIHRvIHVwZGF0ZSBvdXIgbGlzdCBvZiByZWNlbnQgcGF0aHMgd2l0aCB0aGUgY2hvaWNlIG9mIHRoZSB1c2VyIHRvIG5vdCBhZGQgdGhlbSBhZ2FpblxuXHRcdFx0Ly8gQWxzbzogV2luZG93cyB3aWxsIG5vdCBzaG93IG91ciBjdXN0b20gY2F0ZWdvcnkgYXQgYWxsIGlmIHRoZXJlIGlzIGFueSBlbnRyeSB3aGljaCB3YXMgcmVtb3ZlZFxuXHRcdFx0Ly8gYnkgdGhlIHVzZXIhIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTUwNTJcblx0XHRcdGNvbnN0IGp1bXBMaXN0U2V0dGluZ3MgPSBhcHAuZ2V0SnVtcExpc3RTZXR0aW5ncygpO1xuXHRcdFx0Y29uc3QgdG9SZW1vdmU6IFVSSVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YganVtcExpc3RTZXR0aW5ncy5yZW1vdmVkSXRlbXMpIHtcblx0XHRcdFx0Y29uc3QgYXJncyA9IGl0ZW0uYXJncztcblx0XHRcdFx0aWYgKGFyZ3MpIHtcblx0XHRcdFx0XHRjb25zdCBtYXRjaCA9IC9eLS0oZm9sZGVyfGZpbGUpLXVyaVxccytcIihbXlwiXSspXCIkLy5leGVjKGFyZ3MpO1xuXHRcdFx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRcdFx0dG9SZW1vdmUucHVzaChVUkkucGFyc2UobWF0Y2hbMl0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMucmVtb3ZlUmVjZW50bHlPcGVuZWQodG9SZW1vdmUpO1xuXG5cdFx0XHQvLyBBZGQgZW50cmllcyB1cCB0byB0aGUgc2xvdCBjb3VudCBFeHBsb3JlciByZXF1ZXN0ZWQgKGp1bXBMaXN0U2V0dGluZ3MubWluSXRlbXMpLlxuXHRcdFx0bGV0IGhhc1dvcmtzcGFjZXMgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGl0ZW1zOiBKdW1wTGlzdEl0ZW1bXSA9IGNvYWxlc2NlKChhd2FpdCB0aGlzLmdldFJlY2VudGx5T3BlbmVkKCkpLndvcmtzcGFjZXMuc2xpY2UoMCwganVtcExpc3RTZXR0aW5ncy5taW5JdGVtcykubWFwKHJlY2VudCA9PiB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IGlzUmVjZW50V29ya3NwYWNlKHJlY2VudCkgPyByZWNlbnQud29ya3NwYWNlIDogcmVjZW50LmZvbGRlclVyaTtcblxuXHRcdFx0XHRjb25zdCB7IHRpdGxlLCBkZXNjcmlwdGlvbiB9ID0gdGhpcy5nZXRXaW5kb3dzSnVtcExpc3RMYWJlbCh3b3Jrc3BhY2UsIHJlY2VudC5sYWJlbCk7XG5cdFx0XHRcdGxldCBhcmdzO1xuXHRcdFx0XHRpZiAoVVJJLmlzVXJpKHdvcmtzcGFjZSkpIHtcblx0XHRcdFx0XHRhcmdzID0gYC0tZm9sZGVyLXVyaSBcIiR7d29ya3NwYWNlLnRvU3RyaW5nKCl9XCJgO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGhhc1dvcmtzcGFjZXMgPSB0cnVlO1xuXHRcdFx0XHRcdGFyZ3MgPSBgLS1maWxlLXVyaSBcIiR7d29ya3NwYWNlLmNvbmZpZ1BhdGgudG9TdHJpbmcoKX1cImA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICd0YXNrJyxcblx0XHRcdFx0XHR0aXRsZTogdGl0bGUuc3Vic3RyKDAsIDI1NSksIFx0XHRcdFx0Ly8gV2luZG93cyBzZWVtcyB0byBiZSBwaWNreSBhcm91bmQgdGhlIGxlbmd0aCBvZiBlbnRyaWVzXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uLnN1YnN0cigwLCAyNTUpLFx0Ly8gKHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTExMTc3KVxuXHRcdFx0XHRcdHByb2dyYW06IHByb2Nlc3MuZXhlY1BhdGgsXG5cdFx0XHRcdFx0YXJncyxcblx0XHRcdFx0XHRpY29uUGF0aDogJ2V4cGxvcmVyLmV4ZScsIC8vIHNpbXVsYXRlIGZvbGRlciBpY29uXG5cdFx0XHRcdFx0aWNvbkluZGV4OiAwXG5cdFx0XHRcdH07XG5cdFx0XHR9KSk7XG5cblx0XHRcdGlmIChpdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGp1bXBMaXN0LnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6ICdjdXN0b20nLFxuXHRcdFx0XHRcdG5hbWU6IGhhc1dvcmtzcGFjZXMgPyBsb2NhbGl6ZSgncmVjZW50Rm9sZGVyc0FuZFdvcmtzcGFjZXMnLCBcIlJlY2VudCBGb2xkZXJzICYgV29ya3NwYWNlc1wiKSA6IGxvY2FsaXplKCdyZWNlbnRGb2xkZXJzJywgXCJSZWNlbnQgRm9sZGVyc1wiKSxcblx0XHRcdFx0XHRpdGVtc1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZWNlbnRcblx0XHRqdW1wTGlzdC5wdXNoKHtcblx0XHRcdHR5cGU6ICdyZWNlbnQnIC8vIHRoaXMgZW5hYmxlcyB0byBzaG93IGZpbGVzIGluIHRoZSBcInJlY2VudFwiIGNhdGVnb3J5XG5cdFx0fSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzID0gYXBwLnNldEp1bXBMaXN0KGp1bXBMaXN0KTtcblx0XHRcdGlmIChyZXMgJiYgcmVzICE9PSAnb2snKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGB1cGRhdGVXaW5kb3dzSnVtcExpc3Qjc2V0SnVtcExpc3QgdW5leHBlY3RlZCByZXN1bHQ6ICR7cmVzfWApO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybigndXBkYXRlV2luZG93c0p1bXBMaXN0I3NldEp1bXBMaXN0JywgZXJyb3IpOyAvLyBzaW5jZSBzZXRKdW1wTGlzdCBpcyByZWxhdGl2ZWx5IG5ldyBBUEksIG1ha2Ugc3VyZSB0byBndWFyZCBmb3IgZXJyb3JzXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRXaW5kb3dzSnVtcExpc3RMYWJlbCh3b3Jrc3BhY2U6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgVVJJLCByZWNlbnRMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKTogeyB0aXRsZTogc3RyaW5nOyBkZXNjcmlwdGlvbjogc3RyaW5nIH0ge1xuXG5cdFx0Ly8gUHJlZmVyIHJlY2VudCBsYWJlbFxuXHRcdGlmIChyZWNlbnRMYWJlbCkge1xuXHRcdFx0cmV0dXJuIHsgdGl0bGU6IHNwbGl0UmVjZW50TGFiZWwocmVjZW50TGFiZWwpLm5hbWUsIGRlc2NyaXB0aW9uOiByZWNlbnRMYWJlbCB9O1xuXHRcdH1cblxuXHRcdC8vIFNpbmdsZSBGb2xkZXJcblx0XHRpZiAoVVJJLmlzVXJpKHdvcmtzcGFjZSkpIHtcblx0XHRcdHJldHVybiB7IHRpdGxlOiBiYXNlbmFtZSh3b3Jrc3BhY2UpLCBkZXNjcmlwdGlvbjogdGhpcy5yZW5kZXJKdW1wTGlzdFBhdGhEZXNjcmlwdGlvbih3b3Jrc3BhY2UpIH07XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3NwYWNlOiBVbnRpdGxlZFxuXHRcdGlmICh0aGlzLndvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UuaXNVbnRpdGxlZFdvcmtzcGFjZSh3b3Jrc3BhY2UpKSB7XG5cdFx0XHRyZXR1cm4geyB0aXRsZTogbG9jYWxpemUoJ3VudGl0bGVkV29ya3NwYWNlJywgXCJVbnRpdGxlZCAoV29ya3NwYWNlKVwiKSwgZGVzY3JpcHRpb246ICcnIH07XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3NwYWNlOiBub3JtYWxcblx0XHRsZXQgZmlsZW5hbWUgPSBiYXNlbmFtZSh3b3Jrc3BhY2UuY29uZmlnUGF0aCk7XG5cdFx0aWYgKGZpbGVuYW1lLmVuZHNXaXRoKFdPUktTUEFDRV9FWFRFTlNJT04pKSB7XG5cdFx0XHRmaWxlbmFtZSA9IGZpbGVuYW1lLnN1YnN0cigwLCBmaWxlbmFtZS5sZW5ndGggLSBXT1JLU1BBQ0VfRVhURU5TSU9OLmxlbmd0aCAtIDEpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHRpdGxlOiBsb2NhbGl6ZSgnd29ya3NwYWNlTmFtZScsIFwiezB9IChXb3Jrc3BhY2UpXCIsIGZpbGVuYW1lKSwgZGVzY3JpcHRpb246IHRoaXMucmVuZGVySnVtcExpc3RQYXRoRGVzY3JpcHRpb24od29ya3NwYWNlLmNvbmZpZ1BhdGgpIH07XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckp1bXBMaXN0UGF0aERlc2NyaXB0aW9uKHVyaTogVVJJKSB7XG5cdFx0cmV0dXJuIHVyaS5zY2hlbWUgPT09ICdmaWxlJyA/IG5vcm1hbGl6ZURyaXZlTGV0dGVyKHVyaS5mc1BhdGgpIDogdXJpLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZU1hY09TUmVjZW50RG9jdW1lbnRzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghaXNNYWNpbnRvc2gpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBXZSBjbGVhciBhbGwgZG9jdW1lbnRzIGZpcnN0IHRvIGVuc3VyZSBhbiB1cC10by1kYXRlIHZpZXcgb24gdGhlIHNldC4gU2luY2UgZW50cmllc1xuXHRcdC8vIGNhbiBnZXQgZGVsZXRlZCBvbiBkaXNrLCB0aGlzIGVuc3VyZXMgdGhhdCB0aGUgbGlzdCBpcyBhbHdheXMgdmFsaWRcblx0XHRhcHAuY2xlYXJSZWNlbnREb2N1bWVudHMoKTtcblxuXHRcdGNvbnN0IG1ydSA9IGF3YWl0IHRoaXMuZ2V0UmVjZW50bHlPcGVuZWQoKTtcblxuXHRcdC8vIENvbGxlY3QgbWF4LU4gcmVjZW50IHdvcmtzcGFjZXMgdGhhdCBhcmUga25vd24gdG8gZXhpc3Rcblx0XHRjb25zdCB3b3Jrc3BhY2VFbnRyaWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBlbnRyaWVzID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1ydS53b3Jrc3BhY2VzLmxlbmd0aCAmJiBlbnRyaWVzIDwgV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZS5NQVhfTUFDT1NfRE9DS19SRUNFTlRfV09SS1NQQUNFUzsgaSsrKSB7XG5cdFx0XHRjb25zdCBsb2MgPSB0aGlzLmxvY2F0aW9uKG1ydS53b3Jrc3BhY2VzW2ldKTtcblx0XHRcdGlmIChsb2Muc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlUGF0aCA9IG9yaWdpbmFsRlNQYXRoKGxvYyk7XG5cdFx0XHRcdGlmIChhd2FpdCBQcm9taXNlcy5leGlzdHMod29ya3NwYWNlUGF0aCkpIHtcblx0XHRcdFx0XHR3b3Jrc3BhY2VFbnRyaWVzLnB1c2god29ya3NwYWNlUGF0aCk7XG5cdFx0XHRcdFx0ZW50cmllcysrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ29sbGVjdCBtYXgtTiByZWNlbnQgZmlsZXMgdGhhdCBhcmUga25vd24gdG8gZXhpc3Rcblx0XHRjb25zdCBmaWxlRW50cmllczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1ydS5maWxlcy5sZW5ndGggJiYgZW50cmllcyA8IFdvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UuTUFYX01BQ09TX0RPQ0tfUkVDRU5UX0VOVFJJRVNfVE9UQUw7IGkrKykge1xuXHRcdFx0Y29uc3QgbG9jID0gdGhpcy5sb2NhdGlvbihtcnUuZmlsZXNbaV0pO1xuXHRcdFx0aWYgKGxvYy5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRjb25zdCBmaWxlUGF0aCA9IG9yaWdpbmFsRlNQYXRoKGxvYyk7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHRXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLkNPTU1PTl9GSUxFU19GSUxURVIuaW5jbHVkZXMoYmFzZW5hbWUobG9jKSkgfHwgLy8gc2tpcCBzb21lIHdlbGwga25vd24gZmlsZSBlbnRyaWVzXG5cdFx0XHRcdFx0d29ya3NwYWNlRW50cmllcy5pbmNsdWRlcyhmaWxlUGF0aClcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gcHJlZmVyIGEgd29ya3NwYWNlIGVudHJ5IG92ZXIgYSBmaWxlIGVudHJ5IChlLmcuIGZvciAuY29kZS13b3Jrc3BhY2UpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGF3YWl0IFByb21pc2VzLmV4aXN0cyhmaWxlUGF0aCkpIHtcblx0XHRcdFx0XHRmaWxlRW50cmllcy5wdXNoKGZpbGVQYXRoKTtcblx0XHRcdFx0XHRlbnRyaWVzKys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUaGUgYXBwbGUgZ3VpZGVsaW5lcyAoaHR0cHM6Ly9kZXZlbG9wZXIuYXBwbGUuY29tL2Rlc2lnbi9odW1hbi1pbnRlcmZhY2UtZ3VpZGVsaW5lcy9tYWNvcy9tZW51cy9tZW51LWFuYXRvbXkvKVxuXHRcdC8vIGV4cGxhaW4gdGhhdCBtb3N0IHJlY2VudCBlbnRyaWVzIHNob3VsZCBhcHBlYXIgY2xvc2UgdG8gdGhlIGludGVyYWN0aW9uIGJ5IHRoZSB1c2VyIChlLmcuIGNsb3NlIHRvIHRoZVxuXHRcdC8vIG1vdXNlIGNsaWNrKS4gTW9zdCBuYXRpdmUgbWFjT1MgYXBwbGljYXRpb25zIHRoYXQgYWRkIHJlY2VudCBkb2N1bWVudHMgdG8gdGhlIGRvY2ssIHNob3cgdGhlIG1vc3QgcmVjZW50IGRvY3VtZW50XG5cdFx0Ly8gdG8gdGhlIGJvdHRvbSAoYmVjYXVzZSB0aGUgZG9jayBtZW51IGlzIG5vdCBhcHBlYXJpbmcgZnJvbSB0b3AgdG8gYm90dG9tLCBidXQgZnJvbSB0aGUgYm90dG9tIHRvIHRoZSB0b3ApLiBBcyBzdWNoXG5cdFx0Ly8gd2UgZmlsbCBpbiB0aGUgZW50cmllcyBpbiByZXZlcnNlIG9yZGVyIHNvIHRoYXQgdGhlIG1vc3QgcmVjZW50IHNob3dzIHVwIGF0IHRoZSBib3R0b20gb2YgdGhlIG1lbnUuXG5cdFx0Ly9cblx0XHQvLyBPbiB0b3Agb2YgdGhhdCwgdGhlIG1heGltdW0gbnVtYmVyIG9mIGRvY3VtZW50cyBjYW4gYmUgY29uZmlndXJlZCBieSB0aGUgdXNlciAoZGVmYXVsdHMgdG8gMTApLiBUbyBlbnN1cmUgdGhhdFxuXHRcdC8vIHdlIGFyZSBub3QgZmFpbGluZyB0byBzaG93IHRoZSBtb3N0IHJlY2VudCBlbnRyaWVzLCB3ZSBzdGFydCBieSBhZGRpbmcgZmlsZXMgZmlyc3QgKGluIHJldmVyc2Ugb3JkZXIgb2YgcmVjZW5jeSlcblx0XHQvLyBhbmQgdGhlbiBhZGQgZm9sZGVycyAoaW4gcmV2ZXJzZSBvcmRlciBvZiByZWNlbmN5KS4gR2l2ZW4gdGhhdCBzdHJhdGVneSwgd2UgY2FuIGVuc3VyZSB0aGF0IHRoZSBtb3N0IHJlY2VudFxuXHRcdC8vIE4gZm9sZGVycyBhcmUgYWx3YXlzIGFwcGVhcmluZywgZXZlbiBpZiB0aGUgbGltaXQgaXMgbG93IChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNzQ3ODgpXG5cdFx0ZmlsZUVudHJpZXMucmV2ZXJzZSgpLmZvckVhY2goZmlsZUVudHJ5ID0+IGFwcC5hZGRSZWNlbnREb2N1bWVudChmaWxlRW50cnkpKTtcblx0XHR3b3Jrc3BhY2VFbnRyaWVzLnJldmVyc2UoKS5mb3JFYWNoKHdvcmtzcGFjZUVudHJ5ID0+IGFwcC5hZGRSZWNlbnREb2N1bWVudCh3b3Jrc3BhY2VFbnRyeSkpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsV0FBMkM7QUFDcEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFxQztBQUM5QyxTQUFTLHNCQUFzQix3QkFBd0I7QUFDdkQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYSxpQkFBaUI7QUFDdkMsU0FBUyxVQUFVLFNBQVMsNEJBQTRCLFNBQVMsc0JBQXNCO0FBQ3ZGLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QiwwQkFBMEI7QUFDMUQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxjQUFjLHFCQUFxQjtBQUM1QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFpRixjQUFjLGdCQUFnQixtQkFBbUIsdUJBQXVCLG1CQUFtQjtBQUM1SyxTQUErQiwyQkFBMkI7QUFDMUQsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQkFBK0I7QUFFakMsTUFBTSxnQ0FBZ0MsZ0JBQStDLDhCQUE4QjtBQWNuSCxJQUFNLCtCQUFOLGNBQTJDLFdBQW9EO0FBQUEsRUFXckcsWUFDK0IsWUFDcUIsaUNBQ1gsc0JBQ1MsK0JBQ1osbUJBQ0ss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
