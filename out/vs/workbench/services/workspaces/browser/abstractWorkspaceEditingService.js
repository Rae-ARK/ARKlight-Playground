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
import { localize } from "../../../../nls.js";
import { hasWorkspaceFileExtension, isSavedWorkspace, isUntitledWorkspace, isWorkspaceIdentifier, IWorkspaceContextService, toWorkspaceIdentifier, WorkbenchState, WORKSPACE_EXTENSION, WORKSPACE_FILTER } from "../../../../platform/workspace/common/workspace.js";
import { IJSONEditingService, JSONEditingErrorCode } from "../../configuration/common/jsonEditing.js";
import { IWorkspacesService, rewriteWorkspaceFileForNewLocation } from "../../../../platform/workspaces/common/workspaces.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { distinct } from "../../../../base/common/arrays.js";
import { basename, isEqual, isEqualAuthority, joinPath, removeTrailingPathSeparator } from "../../../../base/common/resources.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IFileDialogService, IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ITextFileService } from "../../textfile/common/textfiles.js";
import { IHostService } from "../../host/browser/host.js";
import { Schemas } from "../../../../base/common/network.js";
import { SaveReason } from "../../../common/editor.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IWorkbenchConfigurationService } from "../../configuration/common/configuration.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Promises } from "../../../../base/common/async.js";
class DidEnterWorkspaceEvent {
  constructor(oldWorkspace, newWorkspace) {
    this.oldWorkspace = oldWorkspace;
    this.newWorkspace = newWorkspace;
    this.promises = [];
  }
  join(promise) {
    this.promises.push(promise);
  }
  async wait() {
    await Promises.settled(this.promises);
  }
}
let AbstractWorkspaceEditingService = class extends Disposable {
  constructor(jsonEditingService, contextService, configurationService, notificationService, commandService, fileService, textFileService, workspacesService, environmentService, fileDialogService, dialogService, hostService, uriIdentityService, workspaceTrustManagementService, userDataProfilesService, userDataProfileService, logService) {
    super();
    this.jsonEditingService = jsonEditingService;
    this.contextService = contextService;
    this.configurationService = configurationService;
    this.notificationService = notificationService;
    this.commandService = commandService;
    this.fileService = fileService;
    this.textFileService = textFileService;
    this.workspacesService = workspacesService;
    this.environmentService = environmentService;
    this.fileDialogService = fileDialogService;
    this.dialogService = dialogService;
    this.hostService = hostService;
    this.uriIdentityService = uriIdentityService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.userDataProfilesService = userDataProfilesService;
    this.userDataProfileService = userDataProfileService;
    this.logService = logService;
    this._onDidEnterWorkspace = this._register(new Emitter());
    this.onDidEnterWorkspace = this._onDidEnterWorkspace.event;
  }
  async pickNewWorkspacePath() {
    const availableFileSystems = [Schemas.file];
    if (this.environmentService.remoteAuthority) {
      availableFileSystems.unshift(Schemas.vscodeRemote);
    }
    let workspacePath = await this.fileDialogService.showSaveDialog({
      saveLabel: localize("save", "Save"),
      title: localize("saveWorkspace", "Save Workspace"),
      filters: WORKSPACE_FILTER,
      defaultUri: joinPath(await this.fileDialogService.defaultWorkspacePath(), this.getNewWorkspaceName()),
      availableFileSystems
    });
    if (!workspacePath) {
      return;
    }
    if (!hasWorkspaceFileExtension(workspacePath)) {
      workspacePath = workspacePath.with({ path: `${workspacePath.path}.${WORKSPACE_EXTENSION}` });
    }
    return workspacePath;
  }
  getNewWorkspaceName() {
    const configPathURI = this.getCurrentWorkspaceIdentifier()?.configPath;
    if (configPathURI && isSavedWorkspace(configPathURI, this.environmentService)) {
      return basename(configPathURI);
    }
    const folder = this.contextService.getWorkspace().folders.at(0);
    if (folder) {
      return `${basename(folder.uri)}.${WORKSPACE_EXTENSION}`;
    }
    return `workspace.${WORKSPACE_EXTENSION}`;
  }
  async updateFolders(index, deleteCount, foldersToAddCandidates, donotNotifyError) {
    const folders = this.contextService.getWorkspace().folders;
    let foldersToDelete = [];
    if (typeof deleteCount === "number") {
      foldersToDelete = folders.slice(index, index + deleteCount).map((folder) => folder.uri);
    }
    let foldersToAdd = [];
    if (Array.isArray(foldersToAddCandidates)) {
      foldersToAdd = foldersToAddCandidates.map((folderToAdd) => ({ uri: removeTrailingPathSeparator(folderToAdd.uri), name: folderToAdd.name }));
    }
    const wantsToDelete = foldersToDelete.length > 0;
    const wantsToAdd = foldersToAdd.length > 0;
    if (!wantsToAdd && !wantsToDelete) {
      return;
    }
    if (wantsToAdd && !wantsToDelete) {
      return this.doAddFolders(foldersToAdd, index, donotNotifyError);
    }
    if (wantsToDelete && !wantsToAdd) {
      return this.removeFolders(foldersToDelete);
    } else {
      if (this.includesSingleFolderWorkspace(foldersToDelete)) {
        return this.createAndEnterWorkspace(foldersToAdd);
      }
      if (this.contextService.getWorkbenchState() !== WorkbenchState.WORKSPACE) {
        return this.doAddFolders(foldersToAdd, index, donotNotifyError);
      }
      return this.doUpdateFolders(foldersToAdd, foldersToDelete, index, donotNotifyError);
    }
  }
  async doUpdateFolders(foldersToAdd, foldersToDelete, index, donotNotifyError = false) {
    try {
      await this.contextService.updateFolders(foldersToAdd, foldersToDelete, index);
    } catch (error) {
      if (donotNotifyError) {
        throw error;
      }
      this.handleWorkspaceConfigurationEditingError(error);
    }
  }
  addFolders(foldersToAddCandidates, donotNotifyError = false) {
    const foldersToAdd = foldersToAddCandidates.map((folderToAdd) => ({ uri: removeTrailingPathSeparator(folderToAdd.uri), name: folderToAdd.name }));
    return this.doAddFolders(foldersToAdd, void 0, donotNotifyError);
  }
  async doAddFolders(foldersToAdd, index, donotNotifyError = false) {
    const state = this.contextService.getWorkbenchState();
    const remoteAuthority = this.environmentService.remoteAuthority;
    if (remoteAuthority) {
      foldersToAdd = foldersToAdd.filter((folder) => folder.uri.scheme !== Schemas.file && (folder.uri.scheme !== Schemas.vscodeRemote || isEqualAuthority(folder.uri.authority, remoteAuthority)));
    }
    if (state !== WorkbenchState.WORKSPACE) {
      let newWorkspaceFolders = this.contextService.getWorkspace().folders.map((folder) => ({ uri: folder.uri }));
      newWorkspaceFolders.splice(typeof index === "number" ? index : newWorkspaceFolders.length, 0, ...foldersToAdd);
      newWorkspaceFolders = distinct(newWorkspaceFolders, (folder) => this.uriIdentityService.extUri.getComparisonKey(folder.uri));
      if (state === WorkbenchState.EMPTY && newWorkspaceFolders.length === 0 || state === WorkbenchState.FOLDER && newWorkspaceFolders.length === 1) {
        return;
      }
      return this.createAndEnterWorkspace(newWorkspaceFolders);
    }
    try {
      await this.contextService.addFolders(foldersToAdd, index);
    } catch (error) {
      if (donotNotifyError) {
        throw error;
      }
      this.handleWorkspaceConfigurationEditingError(error);
    }
  }
  async removeFolders(foldersToRemove, donotNotifyError = false) {
    if (this.includesSingleFolderWorkspace(foldersToRemove)) {
      return this.createAndEnterWorkspace([]);
    }
    try {
      await this.contextService.removeFolders(foldersToRemove);
    } catch (error) {
      if (donotNotifyError) {
        throw error;
      }
      this.handleWorkspaceConfigurationEditingError(error);
    }
  }
  includesSingleFolderWorkspace(folders) {
    if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
      const workspaceFolder = this.contextService.getWorkspace().folders[0];
      return folders.some((folder) => this.uriIdentityService.extUri.isEqual(folder, workspaceFolder.uri));
    }
    return false;
  }
  async createAndEnterWorkspace(folders, path) {
    if (path && !await this.isValidTargetWorkspacePath(path)) {
      return;
    }
    const remoteAuthority = this.environmentService.remoteAuthority;
    const untitledWorkspace = await this.workspacesService.createUntitledWorkspace(folders, remoteAuthority);
    if (path) {
      try {
        await this.saveWorkspaceAs(untitledWorkspace, path);
      } finally {
        await this.workspacesService.deleteUntitledWorkspace(untitledWorkspace);
      }
    } else {
      path = untitledWorkspace.configPath;
      if (!this.userDataProfileService.currentProfile.isDefault) {
        await this.userDataProfilesService.setProfileForWorkspace(untitledWorkspace, this.userDataProfileService.currentProfile);
      }
    }
    return this.enterWorkspace(path);
  }
  async saveAndEnterWorkspace(workspaceUri) {
    const workspaceIdentifier = this.getCurrentWorkspaceIdentifier();
    if (!workspaceIdentifier) {
      return;
    }
    if (isEqual(workspaceIdentifier.configPath, workspaceUri)) {
      return this.saveWorkspace(workspaceIdentifier);
    }
    if (!await this.isValidTargetWorkspacePath(workspaceUri)) {
      return;
    }
    await this.saveWorkspaceAs(workspaceIdentifier, workspaceUri);
    return this.enterWorkspace(workspaceUri);
  }
  async isValidTargetWorkspacePath(workspaceUri) {
    return true;
  }
  async saveWorkspaceAs(workspace, targetConfigPathURI) {
    const configPathURI = workspace.configPath;
    const isNotUntitledWorkspace = !isUntitledWorkspace(targetConfigPathURI, this.environmentService);
    if (isNotUntitledWorkspace && !this.userDataProfileService.currentProfile.isDefault) {
      const newWorkspace = await this.workspacesService.getWorkspaceIdentifier(targetConfigPathURI);
      await this.userDataProfilesService.setProfileForWorkspace(newWorkspace, this.userDataProfileService.currentProfile);
    }
    if (this.uriIdentityService.extUri.isEqual(configPathURI, targetConfigPathURI)) {
      return;
    }
    const isFromUntitledWorkspace = isUntitledWorkspace(configPathURI, this.environmentService);
    const raw = await this.fileService.readFile(configPathURI);
    const newRawWorkspaceContents = rewriteWorkspaceFileForNewLocation(raw.value.toString(), configPathURI, isFromUntitledWorkspace, targetConfigPathURI, this.uriIdentityService.extUri);
    await this.textFileService.create([{ resource: targetConfigPathURI, value: newRawWorkspaceContents, options: { overwrite: true } }]);
    await this.trustWorkspaceConfiguration(targetConfigPathURI);
  }
  async saveWorkspace(workspace) {
    const configPathURI = workspace.configPath;
    const existingModel = this.textFileService.files.get(configPathURI);
    if (existingModel) {
      await existingModel.save({ force: true, reason: SaveReason.EXPLICIT });
      return;
    }
    const workspaceFileExists = await this.fileService.exists(configPathURI);
    if (workspaceFileExists) {
      return;
    }
    const newWorkspace = { folders: [] };
    const newRawWorkspaceContents = rewriteWorkspaceFileForNewLocation(JSON.stringify(newWorkspace, null, "	"), configPathURI, false, configPathURI, this.uriIdentityService.extUri);
    await this.textFileService.create([{ resource: configPathURI, value: newRawWorkspaceContents }]);
  }
  handleWorkspaceConfigurationEditingError(error) {
    switch (error.code) {
      case JSONEditingErrorCode.ERROR_INVALID_FILE:
        this.onInvalidWorkspaceConfigurationFileError();
        break;
      default:
        this.notificationService.error(error.message);
    }
  }
  onInvalidWorkspaceConfigurationFileError() {
    const message = localize("errorInvalidTaskConfiguration", "Unable to write into workspace configuration file. Please open the file to correct errors/warnings in it and try again.");
    this.askToOpenWorkspaceConfigurationFile(message);
  }
  askToOpenWorkspaceConfigurationFile(message) {
    this.notificationService.prompt(
      Severity.Error,
      message,
      [{
        label: localize("openWorkspaceConfigurationFile", "Open Workspace Configuration"),
        run: () => this.commandService.executeCommand("workbench.action.openWorkspaceConfigFile")
      }]
    );
  }
  async fireDidEnterWorkspace(oldWorkspace, newWorkspace) {
    const event = new DidEnterWorkspaceEvent(oldWorkspace, newWorkspace);
    this._onDidEnterWorkspace.fire(event);
    try {
      await event.wait();
    } catch (error) {
      this.logService.error("Error while waiting for participants of onDidEnterWorkspace to join:", error);
    }
  }
  async doEnterWorkspace(workspaceUri) {
    if (this.environmentService.extensionTestsLocationURI) {
      throw new Error("Entering a new workspace is not possible in tests.");
    }
    const workspace = await this.workspacesService.getWorkspaceIdentifier(workspaceUri);
    if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
      await this.migrateWorkspaceSettings(workspace);
    }
    await this.configurationService.initialize(workspace);
    return this.workspacesService.enterWorkspace(workspaceUri);
  }
  migrateWorkspaceSettings(toWorkspace) {
    return this.doCopyWorkspaceSettings(toWorkspace, (setting) => setting.scope === ConfigurationScope.WINDOW);
  }
  copyWorkspaceSettings(toWorkspace) {
    return this.doCopyWorkspaceSettings(toWorkspace);
  }
  doCopyWorkspaceSettings(toWorkspace, filter) {
    const configurationProperties = Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
    const targetWorkspaceConfiguration = {};
    for (const key of this.configurationService.keys().workspace) {
      if (configurationProperties[key]) {
        if (filter && !filter(configurationProperties[key])) {
          continue;
        }
        targetWorkspaceConfiguration[key] = this.configurationService.inspect(key).workspaceValue;
      }
    }
    return this.jsonEditingService.write(toWorkspace.configPath, [{ path: ["settings"], value: targetWorkspaceConfiguration }], true);
  }
  async trustWorkspaceConfiguration(configPathURI) {
    if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      await this.workspaceTrustManagementService.setUrisTrust([configPathURI], true);
    }
  }
  getCurrentWorkspaceIdentifier() {
    const identifier = toWorkspaceIdentifier(this.contextService.getWorkspace());
    if (isWorkspaceIdentifier(identifier)) {
      return identifier;
    }
    return void 0;
  }
};
AbstractWorkspaceEditingService = __decorateClass([
  __decorateParam(0, IJSONEditingService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IWorkbenchConfigurationService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IFileService),
  __decorateParam(6, ITextFileService),
  __decorateParam(7, IWorkspacesService),
  __decorateParam(8, IWorkbenchEnvironmentService),
  __decorateParam(9, IFileDialogService),
  __decorateParam(10, IDialogService),
  __decorateParam(11, IHostService),
  __decorateParam(12, IUriIdentityService),
  __decorateParam(13, IWorkspaceTrustManagementService),
  __decorateParam(14, IUserDataProfilesService),
  __decorateParam(15, IUserDataProfileService),
  __decorateParam(16, ILogService)
], AbstractWorkspaceEditingService);
export {
  AbstractWorkspaceEditingService,
  DidEnterWorkspaceEvent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3Jrc3BhY2VzL2Jyb3dzZXIvYWJzdHJhY3RXb3Jrc3BhY2VFZGl0aW5nU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElEaWRFbnRlcldvcmtzcGFjZUV2ZW50LCBJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vd29ya3NwYWNlRWRpdGluZy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgaGFzV29ya3NwYWNlRmlsZUV4dGVuc2lvbiwgSUFueVdvcmtzcGFjZUlkZW50aWZpZXIsIGlzU2F2ZWRXb3Jrc3BhY2UsIGlzVW50aXRsZWRXb3Jrc3BhY2UsIGlzV29ya3NwYWNlSWRlbnRpZmllciwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlSWRlbnRpZmllciwgdG9Xb3Jrc3BhY2VJZGVudGlmaWVyLCBXb3JrYmVuY2hTdGF0ZSwgV09SS1NQQUNFX0VYVEVOU0lPTiwgV09SS1NQQUNFX0ZJTFRFUiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElKU09ORWRpdGluZ1NlcnZpY2UsIEpTT05FZGl0aW5nRXJyb3IsIEpTT05FZGl0aW5nRXJyb3JDb2RlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vanNvbkVkaXRpbmcuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YSwgSVdvcmtzcGFjZXNTZXJ2aWNlLCByZXdyaXRlV29ya3NwYWNlRmlsZUZvck5ld0xvY2F0aW9uLCBJRW50ZXJXb3Jrc3BhY2VSZXN1bHQsIElTdG9yZWRXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2Jyb3dzZXIvY29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgaXNFcXVhbCwgaXNFcXVhbEF1dGhvcml0eSwgam9pblBhdGgsIHJlbW92ZVRyYWlsaW5nUGF0aFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlLCBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgU2F2ZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG5leHBvcnQgY2xhc3MgRGlkRW50ZXJXb3Jrc3BhY2VFdmVudCBpbXBsZW1lbnRzIElEaWRFbnRlcldvcmtzcGFjZUV2ZW50IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBvbGRXb3Jrc3BhY2U6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyLFxuXHRcdHJlYWRvbmx5IG5ld1dvcmtzcGFjZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXJcblx0KSB7IH1cblxuXHRqb2luKHByb21pc2U6IFByb21pc2U8dm9pZD4pOiB2b2lkIHtcblx0XHR0aGlzLnByb21pc2VzLnB1c2gocHJvbWlzZSk7XG5cdH1cblxuXHRhc3luYyB3YWl0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQodGhpcy5wcm9taXNlcyk7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0V29ya3NwYWNlRWRpdGluZ1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEVudGVyV29ya3NwYWNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SURpZEVudGVyV29ya3NwYWNlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEVudGVyV29ya3NwYWNlOiBFdmVudDxJRGlkRW50ZXJXb3Jrc3BhY2VFdmVudD4gPSB0aGlzLl9vbkRpZEVudGVyV29ya3NwYWNlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSlNPTkVkaXRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkganNvbkVkaXRpbmdTZXJ2aWNlOiBJSlNPTkVkaXRpbmdTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBXb3Jrc3BhY2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VzU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgd29ya3NwYWNlc1NlcnZpY2U6IElXb3Jrc3BhY2VzU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBwaWNrTmV3V29ya3NwYWNlUGF0aCgpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGF2YWlsYWJsZUZpbGVTeXN0ZW1zID0gW1NjaGVtYXMuZmlsZV07XG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0YXZhaWxhYmxlRmlsZVN5c3RlbXMudW5zaGlmdChTY2hlbWFzLnZzY29kZVJlbW90ZSk7XG5cdFx0fVxuXHRcdGxldCB3b3Jrc3BhY2VQYXRoID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93U2F2ZURpYWxvZyh7XG5cdFx0XHRzYXZlTGFiZWw6IGxvY2FsaXplKCdzYXZlJywgXCJTYXZlXCIpLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzYXZlV29ya3NwYWNlJywgXCJTYXZlIFdvcmtzcGFjZVwiKSxcblx0XHRcdGZpbHRlcnM6IFdPUktTUEFDRV9GSUxURVIsXG5cdFx0XHRkZWZhdWx0VXJpOiBqb2luUGF0aChhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLmRlZmF1bHRXb3Jrc3BhY2VQYXRoKCksIHRoaXMuZ2V0TmV3V29ya3NwYWNlTmFtZSgpKSxcblx0XHRcdGF2YWlsYWJsZUZpbGVTeXN0ZW1zXG5cdFx0fSk7XG5cblx0XHRpZiAoIXdvcmtzcGFjZVBhdGgpIHtcblx0XHRcdHJldHVybjsgLy8gY2FuY2VsZWRcblx0XHR9XG5cblx0XHRpZiAoIWhhc1dvcmtzcGFjZUZpbGVFeHRlbnNpb24od29ya3NwYWNlUGF0aCkpIHtcblx0XHRcdC8vIEFsd2F5cyBlbnN1cmUgd2UgaGF2ZSB3b3Jrc3BhY2UgZmlsZSBleHRlbnNpb25cblx0XHRcdC8vIChzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzg0ODE4KVxuXHRcdFx0d29ya3NwYWNlUGF0aCA9IHdvcmtzcGFjZVBhdGgud2l0aCh7IHBhdGg6IGAke3dvcmtzcGFjZVBhdGgucGF0aH0uJHtXT1JLU1BBQ0VfRVhURU5TSU9OfWAgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHdvcmtzcGFjZVBhdGg7XG5cdH1cblxuXHRwcml2YXRlIGdldE5ld1dvcmtzcGFjZU5hbWUoKTogc3RyaW5nIHtcblxuXHRcdC8vIEZpcnN0IHRyeSB3aXRoIGV4aXN0aW5nIHdvcmtzcGFjZSBuYW1lXG5cdFx0Y29uc3QgY29uZmlnUGF0aFVSSSA9IHRoaXMuZ2V0Q3VycmVudFdvcmtzcGFjZUlkZW50aWZpZXIoKT8uY29uZmlnUGF0aDtcblx0XHRpZiAoY29uZmlnUGF0aFVSSSAmJiBpc1NhdmVkV29ya3NwYWNlKGNvbmZpZ1BhdGhVUkksIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlKSkge1xuXHRcdFx0cmV0dXJuIGJhc2VuYW1lKGNvbmZpZ1BhdGhVUkkpO1xuXHRcdH1cblxuXHRcdC8vIFRoZW4gZmFsbGJhY2sgdG8gZmlyc3QgZm9sZGVyIGlmIGFueVxuXHRcdGNvbnN0IGZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5hdCgwKTtcblx0XHRpZiAoZm9sZGVyKSB7XG5cdFx0XHRyZXR1cm4gYCR7YmFzZW5hbWUoZm9sZGVyLnVyaSl9LiR7V09SS1NQQUNFX0VYVEVOU0lPTn1gO1xuXHRcdH1cblxuXHRcdC8vIEZpbmFsbHkgcGljayBhIGdvb2QgZGVmYXVsdFxuXHRcdHJldHVybiBgd29ya3NwYWNlLiR7V09SS1NQQUNFX0VYVEVOU0lPTn1gO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlRm9sZGVycyhpbmRleDogbnVtYmVyLCBkZWxldGVDb3VudD86IG51bWJlciwgZm9sZGVyc1RvQWRkQ2FuZGlkYXRlcz86IElXb3Jrc3BhY2VGb2xkZXJDcmVhdGlvbkRhdGFbXSwgZG9ub3ROb3RpZnlFcnJvcj86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmb2xkZXJzID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXG5cdFx0bGV0IGZvbGRlcnNUb0RlbGV0ZTogVVJJW10gPSBbXTtcblx0XHRpZiAodHlwZW9mIGRlbGV0ZUNvdW50ID09PSAnbnVtYmVyJykge1xuXHRcdFx0Zm9sZGVyc1RvRGVsZXRlID0gZm9sZGVycy5zbGljZShpbmRleCwgaW5kZXggKyBkZWxldGVDb3VudCkubWFwKGZvbGRlciA9PiBmb2xkZXIudXJpKTtcblx0XHR9XG5cblx0XHRsZXQgZm9sZGVyc1RvQWRkOiBJV29ya3NwYWNlRm9sZGVyQ3JlYXRpb25EYXRhW10gPSBbXTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShmb2xkZXJzVG9BZGRDYW5kaWRhdGVzKSkge1xuXHRcdFx0Zm9sZGVyc1RvQWRkID0gZm9sZGVyc1RvQWRkQ2FuZGlkYXRlcy5tYXAoZm9sZGVyVG9BZGQgPT4gKHsgdXJpOiByZW1vdmVUcmFpbGluZ1BhdGhTZXBhcmF0b3IoZm9sZGVyVG9BZGQudXJpKSwgbmFtZTogZm9sZGVyVG9BZGQubmFtZSB9KSk7IC8vIE5vcm1hbGl6ZVxuXHRcdH1cblxuXHRcdGNvbnN0IHdhbnRzVG9EZWxldGUgPSBmb2xkZXJzVG9EZWxldGUubGVuZ3RoID4gMDtcblx0XHRjb25zdCB3YW50c1RvQWRkID0gZm9sZGVyc1RvQWRkLmxlbmd0aCA+IDA7XG5cblx0XHRpZiAoIXdhbnRzVG9BZGQgJiYgIXdhbnRzVG9EZWxldGUpIHtcblx0XHRcdHJldHVybjsgLy8gcmV0dXJuIGVhcmx5IGlmIHRoZXJlIGlzIG5vdGhpbmcgdG8gZG9cblx0XHR9XG5cblx0XHQvLyBBZGQgRm9sZGVyc1xuXHRcdGlmICh3YW50c1RvQWRkICYmICF3YW50c1RvRGVsZXRlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb0FkZEZvbGRlcnMoZm9sZGVyc1RvQWRkLCBpbmRleCwgZG9ub3ROb3RpZnlFcnJvcik7XG5cdFx0fVxuXG5cdFx0Ly8gRGVsZXRlIEZvbGRlcnNcblx0XHRpZiAod2FudHNUb0RlbGV0ZSAmJiAhd2FudHNUb0FkZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVtb3ZlRm9sZGVycyhmb2xkZXJzVG9EZWxldGUpO1xuXHRcdH1cblxuXHRcdC8vIEFkZCAmIERlbGV0ZSBGb2xkZXJzXG5cdFx0ZWxzZSB7XG5cblx0XHRcdC8vIGlmIHdlIGFyZSBpbiBzaW5nbGUtZm9sZGVyIHN0YXRlIGFuZCB0aGUgZm9sZGVyIGlzIHJlcGxhY2VkIHdpdGhcblx0XHRcdC8vIG90aGVyIGZvbGRlcnMsIHdlIGhhbmRsZSB0aGlzIHNwZWNpYWxseSBhbmQganVzdCBlbnRlciB3b3Jrc3BhY2Vcblx0XHRcdC8vIG1vZGUgd2l0aCB0aGUgZm9sZGVycyB0aGF0IGFyZSBiZWluZyBhZGRlZC5cblx0XHRcdGlmICh0aGlzLmluY2x1ZGVzU2luZ2xlRm9sZGVyV29ya3NwYWNlKGZvbGRlcnNUb0RlbGV0ZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlQW5kRW50ZXJXb3Jrc3BhY2UoZm9sZGVyc1RvQWRkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gaWYgd2UgYXJlIG5vdCBpbiB3b3Jrc3BhY2Utc3RhdGUsIHdlIGp1c3QgYWRkIHRoZSBmb2xkZXJzXG5cdFx0XHRpZiAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZG9BZGRGb2xkZXJzKGZvbGRlcnNUb0FkZCwgaW5kZXgsIGRvbm90Tm90aWZ5RXJyb3IpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBmaW5hbGx5LCB1cGRhdGUgZm9sZGVycyB3aXRoaW4gdGhlIHdvcmtzcGFjZVxuXHRcdFx0cmV0dXJuIHRoaXMuZG9VcGRhdGVGb2xkZXJzKGZvbGRlcnNUb0FkZCwgZm9sZGVyc1RvRGVsZXRlLCBpbmRleCwgZG9ub3ROb3RpZnlFcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1VwZGF0ZUZvbGRlcnMoZm9sZGVyc1RvQWRkOiBJV29ya3NwYWNlRm9sZGVyQ3JlYXRpb25EYXRhW10sIGZvbGRlcnNUb0RlbGV0ZTogVVJJW10sIGluZGV4PzogbnVtYmVyLCBkb25vdE5vdGlmeUVycm9yID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5jb250ZXh0U2VydmljZS51cGRhdGVGb2xkZXJzKGZvbGRlcnNUb0FkZCwgZm9sZGVyc1RvRGVsZXRlLCBpbmRleCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChkb25vdE5vdGlmeUVycm9yKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmhhbmRsZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdGFkZEZvbGRlcnMoZm9sZGVyc1RvQWRkQ2FuZGlkYXRlczogSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YVtdLCBkb25vdE5vdGlmeUVycm9yID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIE5vcm1hbGl6ZVxuXHRcdGNvbnN0IGZvbGRlcnNUb0FkZCA9IGZvbGRlcnNUb0FkZENhbmRpZGF0ZXMubWFwKGZvbGRlclRvQWRkID0+ICh7IHVyaTogcmVtb3ZlVHJhaWxpbmdQYXRoU2VwYXJhdG9yKGZvbGRlclRvQWRkLnVyaSksIG5hbWU6IGZvbGRlclRvQWRkLm5hbWUgfSkpO1xuXG5cdFx0cmV0dXJuIHRoaXMuZG9BZGRGb2xkZXJzKGZvbGRlcnNUb0FkZCwgdW5kZWZpbmVkLCBkb25vdE5vdGlmeUVycm9yKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9BZGRGb2xkZXJzKGZvbGRlcnNUb0FkZDogSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YVtdLCBpbmRleD86IG51bWJlciwgZG9ub3ROb3RpZnlFcnJvciA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCk7XG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHRcdGlmIChyZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy85NDE5MVxuXHRcdFx0Zm9sZGVyc1RvQWRkID0gZm9sZGVyc1RvQWRkLmZpbHRlcihmb2xkZXIgPT4gZm9sZGVyLnVyaS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSAmJiAoZm9sZGVyLnVyaS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlUmVtb3RlIHx8IGlzRXF1YWxBdXRob3JpdHkoZm9sZGVyLnVyaS5hdXRob3JpdHksIHJlbW90ZUF1dGhvcml0eSkpKTtcblx0XHR9XG5cblx0XHQvLyBJZiB3ZSBhcmUgaW4gbm8td29ya3NwYWNlIG9yIHNpbmdsZS1mb2xkZXIgd29ya3NwYWNlLCBhZGRpbmcgZm9sZGVycyBoYXMgdG9cblx0XHQvLyBlbnRlciBhIHdvcmtzcGFjZS5cblx0XHRpZiAoc3RhdGUgIT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSkge1xuXHRcdFx0bGV0IG5ld1dvcmtzcGFjZUZvbGRlcnMgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwKGZvbGRlciA9PiAoeyB1cmk6IGZvbGRlci51cmkgfSkpO1xuXHRcdFx0bmV3V29ya3NwYWNlRm9sZGVycy5zcGxpY2UodHlwZW9mIGluZGV4ID09PSAnbnVtYmVyJyA/IGluZGV4IDogbmV3V29ya3NwYWNlRm9sZGVycy5sZW5ndGgsIDAsIC4uLmZvbGRlcnNUb0FkZCk7XG5cdFx0XHRuZXdXb3Jrc3BhY2VGb2xkZXJzID0gZGlzdGluY3QobmV3V29ya3NwYWNlRm9sZGVycywgZm9sZGVyID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5nZXRDb21wYXJpc29uS2V5KGZvbGRlci51cmkpKTtcblxuXHRcdFx0aWYgKHN0YXRlID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSAmJiBuZXdXb3Jrc3BhY2VGb2xkZXJzLmxlbmd0aCA9PT0gMCB8fCBzdGF0ZSA9PT0gV29ya2JlbmNoU3RhdGUuRk9MREVSICYmIG5ld1dvcmtzcGFjZUZvbGRlcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gcmV0dXJuIGlmIHRoZSBvcGVyYXRpb24gaXMgYSBuby1vcCBmb3IgdGhlIGN1cnJlbnQgc3RhdGVcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlQW5kRW50ZXJXb3Jrc3BhY2UobmV3V29ya3NwYWNlRm9sZGVycyk7XG5cdFx0fVxuXG5cdFx0Ly8gRGVsZWdhdGUgYWRkaXRpb24gb2YgZm9sZGVycyB0byB3b3Jrc3BhY2Ugc2VydmljZSBvdGhlcndpc2Vcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5jb250ZXh0U2VydmljZS5hZGRGb2xkZXJzKGZvbGRlcnNUb0FkZCwgaW5kZXgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoZG9ub3ROb3RpZnlFcnJvcikge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5oYW5kbGVXb3Jrc3BhY2VDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZW1vdmVGb2xkZXJzKGZvbGRlcnNUb1JlbW92ZTogVVJJW10sIGRvbm90Tm90aWZ5RXJyb3IgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gSWYgd2UgYXJlIGluIHNpbmdsZS1mb2xkZXIgc3RhdGUgYW5kIHRoZSBvcGVuZWQgZm9sZGVyIGlzIHRvIGJlIHJlbW92ZWQsXG5cdFx0Ly8gd2UgY3JlYXRlIGFuIGVtcHR5IHdvcmtzcGFjZSBhbmQgZW50ZXIgaXQuXG5cdFx0aWYgKHRoaXMuaW5jbHVkZXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2UoZm9sZGVyc1RvUmVtb3ZlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlQW5kRW50ZXJXb3Jrc3BhY2UoW10pO1xuXHRcdH1cblxuXHRcdC8vIERlbGVnYXRlIHJlbW92YWwgb2YgZm9sZGVycyB0byB3b3Jrc3BhY2Ugc2VydmljZSBvdGhlcndpc2Vcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5jb250ZXh0U2VydmljZS5yZW1vdmVGb2xkZXJzKGZvbGRlcnNUb1JlbW92ZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChkb25vdE5vdGlmeUVycm9yKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmhhbmRsZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaW5jbHVkZXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2UoZm9sZGVyczogVVJJW10pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5GT0xERVIpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXTtcblx0XHRcdHJldHVybiAoZm9sZGVycy5zb21lKGZvbGRlciA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChmb2xkZXIsIHdvcmtzcGFjZUZvbGRlci51cmkpKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlQW5kRW50ZXJXb3Jrc3BhY2UoZm9sZGVyczogSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YVtdLCBwYXRoPzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHBhdGggJiYgIWF3YWl0IHRoaXMuaXNWYWxpZFRhcmdldFdvcmtzcGFjZVBhdGgocGF0aCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0Y29uc3QgdW50aXRsZWRXb3Jrc3BhY2UgPSBhd2FpdCB0aGlzLndvcmtzcGFjZXNTZXJ2aWNlLmNyZWF0ZVVudGl0bGVkV29ya3NwYWNlKGZvbGRlcnMsIHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0aWYgKHBhdGgpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2F2ZVdvcmtzcGFjZUFzKHVudGl0bGVkV29ya3NwYWNlLCBwYXRoKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlc1NlcnZpY2UuZGVsZXRlVW50aXRsZWRXb3Jrc3BhY2UodW50aXRsZWRXb3Jrc3BhY2UpOyAvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTAwMjc2XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBhdGggPSB1bnRpdGxlZFdvcmtzcGFjZS5jb25maWdQYXRoO1xuXHRcdFx0aWYgKCF0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2Uuc2V0UHJvZmlsZUZvcldvcmtzcGFjZSh1bnRpdGxlZFdvcmtzcGFjZSwgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5lbnRlcldvcmtzcGFjZShwYXRoKTtcblx0fVxuXG5cdGFzeW5jIHNhdmVBbmRFbnRlcldvcmtzcGFjZSh3b3Jrc3BhY2VVcmk6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUlkZW50aWZpZXIgPSB0aGlzLmdldEN1cnJlbnRXb3Jrc3BhY2VJZGVudGlmaWVyKCk7XG5cdFx0aWYgKCF3b3Jrc3BhY2VJZGVudGlmaWVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQWxsb3cgdG8gc2F2ZSB0aGUgd29ya3NwYWNlIG9mIHRoZSBjdXJyZW50IHdpbmRvd1xuXHRcdC8vIGlmIHdlIGhhdmUgYW4gaWRlbnRpY2FsIG1hdGNoIG9uIHRoZSBwYXRoXG5cdFx0aWYgKGlzRXF1YWwod29ya3NwYWNlSWRlbnRpZmllci5jb25maWdQYXRoLCB3b3Jrc3BhY2VVcmkpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zYXZlV29ya3NwYWNlKHdvcmtzcGFjZUlkZW50aWZpZXIpO1xuXHRcdH1cblxuXHRcdC8vIEZyb20gdGhpcyBtb21lbnQgb24gd2UgcmVxdWlyZSBhIHZhbGlkIHRhcmdldCB0aGF0IGlzIG5vdCBvcGVuZWQgYWxyZWFkeVxuXHRcdGlmICghYXdhaXQgdGhpcy5pc1ZhbGlkVGFyZ2V0V29ya3NwYWNlUGF0aCh3b3Jrc3BhY2VVcmkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5zYXZlV29ya3NwYWNlQXMod29ya3NwYWNlSWRlbnRpZmllciwgd29ya3NwYWNlVXJpKTtcblxuXHRcdHJldHVybiB0aGlzLmVudGVyV29ya3NwYWNlKHdvcmtzcGFjZVVyaSk7XG5cdH1cblxuXHRhc3luYyBpc1ZhbGlkVGFyZ2V0V29ya3NwYWNlUGF0aCh3b3Jrc3BhY2VVcmk6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0cnVlOyAvLyBPS1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHNhdmVXb3Jrc3BhY2VBcyh3b3Jrc3BhY2U6IElXb3Jrc3BhY2VJZGVudGlmaWVyLCB0YXJnZXRDb25maWdQYXRoVVJJOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWdQYXRoVVJJID0gd29ya3NwYWNlLmNvbmZpZ1BhdGg7XG5cblx0XHRjb25zdCBpc05vdFVudGl0bGVkV29ya3NwYWNlID0gIWlzVW50aXRsZWRXb3Jrc3BhY2UodGFyZ2V0Q29uZmlnUGF0aFVSSSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGlmIChpc05vdFVudGl0bGVkV29ya3NwYWNlICYmICF0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRjb25zdCBuZXdXb3Jrc3BhY2UgPSBhd2FpdCB0aGlzLndvcmtzcGFjZXNTZXJ2aWNlLmdldFdvcmtzcGFjZUlkZW50aWZpZXIodGFyZ2V0Q29uZmlnUGF0aFVSSSk7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnNldFByb2ZpbGVGb3JXb3Jrc3BhY2UobmV3V29ya3NwYWNlLCB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUpO1xuXHRcdH1cblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiB0YXJnZXQgaXMgc2FtZSBhcyBzb3VyY2Vcblx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoY29uZmlnUGF0aFVSSSwgdGFyZ2V0Q29uZmlnUGF0aFVSSSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc0Zyb21VbnRpdGxlZFdvcmtzcGFjZSA9IGlzVW50aXRsZWRXb3Jrc3BhY2UoY29uZmlnUGF0aFVSSSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0Ly8gUmVhZCB0aGUgY29udGVudHMgb2YgdGhlIHdvcmtzcGFjZSBmaWxlLCB1cGRhdGUgaXQgdG8gbmV3IGxvY2F0aW9uIGFuZCBzYXZlIGl0LlxuXHRcdGNvbnN0IHJhdyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoY29uZmlnUGF0aFVSSSk7XG5cdFx0Y29uc3QgbmV3UmF3V29ya3NwYWNlQ29udGVudHMgPSByZXdyaXRlV29ya3NwYWNlRmlsZUZvck5ld0xvY2F0aW9uKHJhdy52YWx1ZS50b1N0cmluZygpLCBjb25maWdQYXRoVVJJLCBpc0Zyb21VbnRpdGxlZFdvcmtzcGFjZSwgdGFyZ2V0Q29uZmlnUGF0aFVSSSwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpKTtcblx0XHRhd2FpdCB0aGlzLnRleHRGaWxlU2VydmljZS5jcmVhdGUoW3sgcmVzb3VyY2U6IHRhcmdldENvbmZpZ1BhdGhVUkksIHZhbHVlOiBuZXdSYXdXb3Jrc3BhY2VDb250ZW50cywgb3B0aW9uczogeyBvdmVyd3JpdGU6IHRydWUgfSB9XSk7XG5cblx0XHQvLyBTZXQgdHJ1c3QgZm9yIHRoZSB3b3Jrc3BhY2UgZmlsZVxuXHRcdGF3YWl0IHRoaXMudHJ1c3RXb3Jrc3BhY2VDb25maWd1cmF0aW9uKHRhcmdldENvbmZpZ1BhdGhVUkkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHNhdmVXb3Jrc3BhY2Uod29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbmZpZ1BhdGhVUkkgPSB3b3Jrc3BhY2UuY29uZmlnUGF0aDtcblxuXHRcdC8vIEZpcnN0OiB0cnkgdG8gc2F2ZSBhbnkgZXhpc3RpbmcgbW9kZWwgYXMgaXQgY291bGQgYmUgZGlydHlcblx0XHRjb25zdCBleGlzdGluZ01vZGVsID0gdGhpcy50ZXh0RmlsZVNlcnZpY2UuZmlsZXMuZ2V0KGNvbmZpZ1BhdGhVUkkpO1xuXHRcdGlmIChleGlzdGluZ01vZGVsKSB7XG5cdFx0XHRhd2FpdCBleGlzdGluZ01vZGVsLnNhdmUoeyBmb3JjZTogdHJ1ZSwgcmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lUIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNlY29uZDogaWYgdGhlIGZpbGUgZXhpc3RzIG9uIGRpc2ssIHNpbXBseSByZXR1cm5cblx0XHRjb25zdCB3b3Jrc3BhY2VGaWxlRXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMoY29uZmlnUGF0aFVSSSk7XG5cdFx0aWYgKHdvcmtzcGFjZUZpbGVFeGlzdHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBGaW5hbGx5LCB3ZSBuZWVkIHRvIHJlLWNyZWF0ZSB0aGUgZmlsZSBhcyBpdCB3YXMgZGVsZXRlZFxuXHRcdGNvbnN0IG5ld1dvcmtzcGFjZTogSVN0b3JlZFdvcmtzcGFjZSA9IHsgZm9sZGVyczogW10gfTtcblx0XHRjb25zdCBuZXdSYXdXb3Jrc3BhY2VDb250ZW50cyA9IHJld3JpdGVXb3Jrc3BhY2VGaWxlRm9yTmV3TG9jYXRpb24oSlNPTi5zdHJpbmdpZnkobmV3V29ya3NwYWNlLCBudWxsLCAnXFx0JyksIGNvbmZpZ1BhdGhVUkksIGZhbHNlLCBjb25maWdQYXRoVVJJLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkpO1xuXHRcdGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLmNyZWF0ZShbeyByZXNvdXJjZTogY29uZmlnUGF0aFVSSSwgdmFsdWU6IG5ld1Jhd1dvcmtzcGFjZUNvbnRlbnRzIH1dKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlV29ya3NwYWNlQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvcihlcnJvcjogSlNPTkVkaXRpbmdFcnJvcik6IHZvaWQge1xuXHRcdHN3aXRjaCAoZXJyb3IuY29kZSkge1xuXHRcdFx0Y2FzZSBKU09ORWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9JTlZBTElEX0ZJTEU6XG5cdFx0XHRcdHRoaXMub25JbnZhbGlkV29ya3NwYWNlQ29uZmlndXJhdGlvbkZpbGVFcnJvcigpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvci5tZXNzYWdlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uSW52YWxpZFdvcmtzcGFjZUNvbmZpZ3VyYXRpb25GaWxlRXJyb3IoKTogdm9pZCB7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKCdlcnJvckludmFsaWRUYXNrQ29uZmlndXJhdGlvbicsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gd29ya3NwYWNlIGNvbmZpZ3VyYXRpb24gZmlsZS4gUGxlYXNlIG9wZW4gdGhlIGZpbGUgdG8gY29ycmVjdCBlcnJvcnMvd2FybmluZ3MgaW4gaXQgYW5kIHRyeSBhZ2Fpbi5cIik7XG5cdFx0dGhpcy5hc2tUb09wZW5Xb3Jrc3BhY2VDb25maWd1cmF0aW9uRmlsZShtZXNzYWdlKTtcblx0fVxuXG5cdHByaXZhdGUgYXNrVG9PcGVuV29ya3NwYWNlQ29uZmlndXJhdGlvbkZpbGUobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5FcnJvciwgbWVzc2FnZSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnb3BlbldvcmtzcGFjZUNvbmZpZ3VyYXRpb25GaWxlJywgXCJPcGVuIFdvcmtzcGFjZSBDb25maWd1cmF0aW9uXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbldvcmtzcGFjZUNvbmZpZ0ZpbGUnKVxuXHRcdFx0fV1cblx0XHQpO1xuXHR9XG5cblx0YWJzdHJhY3QgZW50ZXJXb3Jrc3BhY2Uod29ya3NwYWNlVXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdHByb3RlY3RlZCBhc3luYyBmaXJlRGlkRW50ZXJXb3Jrc3BhY2Uob2xkV29ya3NwYWNlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciwgbmV3V29ya3NwYWNlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IERpZEVudGVyV29ya3NwYWNlRXZlbnQob2xkV29ya3NwYWNlLCBuZXdXb3Jrc3BhY2UpO1xuXHRcdHRoaXMuX29uRGlkRW50ZXJXb3Jrc3BhY2UuZmlyZShldmVudCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZXZlbnQud2FpdCgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Vycm9yIHdoaWxlIHdhaXRpbmcgZm9yIHBhcnRpY2lwYW50cyBvZiBvbkRpZEVudGVyV29ya3NwYWNlIHRvIGpvaW46JywgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBkb0VudGVyV29ya3NwYWNlKHdvcmtzcGFjZVVyaTogVVJJKTogUHJvbWlzZTxJRW50ZXJXb3Jrc3BhY2VSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFbnRlcmluZyBhIG5ldyB3b3Jrc3BhY2UgaXMgbm90IHBvc3NpYmxlIGluIHRlc3RzLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IHRoaXMud29ya3NwYWNlc1NlcnZpY2UuZ2V0V29ya3NwYWNlSWRlbnRpZmllcih3b3Jrc3BhY2VVcmkpO1xuXG5cdFx0Ly8gU2V0dGluZ3MgbWlncmF0aW9uIChvbmx5IGlmIHdlIGNvbWUgZnJvbSBhIGZvbGRlciB3b3Jrc3BhY2UpXG5cdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRk9MREVSKSB7XG5cdFx0XHRhd2FpdCB0aGlzLm1pZ3JhdGVXb3Jrc3BhY2VTZXR0aW5ncyh3b3Jrc3BhY2UpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5pdGlhbGl6ZSh3b3Jrc3BhY2UpO1xuXG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlc1NlcnZpY2UuZW50ZXJXb3Jrc3BhY2Uod29ya3NwYWNlVXJpKTtcblx0fVxuXG5cdHByaXZhdGUgbWlncmF0ZVdvcmtzcGFjZVNldHRpbmdzKHRvV29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmRvQ29weVdvcmtzcGFjZVNldHRpbmdzKHRvV29ya3NwYWNlLCBzZXR0aW5nID0+IHNldHRpbmcuc2NvcGUgPT09IENvbmZpZ3VyYXRpb25TY29wZS5XSU5ET1cpO1xuXHR9XG5cblx0Y29weVdvcmtzcGFjZVNldHRpbmdzKHRvV29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmRvQ29weVdvcmtzcGFjZVNldHRpbmdzKHRvV29ya3NwYWNlKTtcblx0fVxuXG5cdHByaXZhdGUgZG9Db3B5V29ya3NwYWNlU2V0dGluZ3ModG9Xb3Jrc3BhY2U6IElXb3Jrc3BhY2VJZGVudGlmaWVyLCBmaWx0ZXI/OiAoY29uZmlnOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hKSA9PiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblByb3BlcnRpZXMgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGNvbnN0IHRhcmdldFdvcmtzcGFjZUNvbmZpZ3VyYXRpb246IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5rZXlzKCkud29ya3NwYWNlKSB7XG5cdFx0XHRpZiAoY29uZmlndXJhdGlvblByb3BlcnRpZXNba2V5XSkge1xuXHRcdFx0XHRpZiAoZmlsdGVyICYmICFmaWx0ZXIoY29uZmlndXJhdGlvblByb3BlcnRpZXNba2V5XSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRhcmdldFdvcmtzcGFjZUNvbmZpZ3VyYXRpb25ba2V5XSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChrZXkpLndvcmtzcGFjZVZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmpzb25FZGl0aW5nU2VydmljZS53cml0ZSh0b1dvcmtzcGFjZS5jb25maWdQYXRoLCBbeyBwYXRoOiBbJ3NldHRpbmdzJ10sIHZhbHVlOiB0YXJnZXRXb3Jrc3BhY2VDb25maWd1cmF0aW9uIH1dLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJ1c3RXb3Jrc3BhY2VDb25maWd1cmF0aW9uKGNvbmZpZ1BhdGhVUkk6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZICYmIHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSkge1xuXHRcdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLnNldFVyaXNUcnVzdChbY29uZmlnUGF0aFVSSV0sIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBnZXRDdXJyZW50V29ya3NwYWNlSWRlbnRpZmllcigpOiBJV29ya3NwYWNlSWRlbnRpZmllciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaWRlbnRpZmllciA9IHRvV29ya3NwYWNlSWRlbnRpZmllcih0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKTtcblx0XHRpZiAoaXNXb3Jrc3BhY2VJZGVudGlmaWVyKGlkZW50aWZpZXIpKSB7XG5cdFx0XHRyZXR1cm4gaWRlbnRpZmllcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU9BLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQW9ELGtCQUFrQixxQkFBcUIsdUJBQXVCLDBCQUFnRCx1QkFBdUIsZ0JBQWdCLHFCQUFxQix3QkFBd0I7QUFDL1AsU0FBUyxxQkFBdUMsNEJBQTRCO0FBQzVFLFNBQXVDLG9CQUFvQiwwQ0FBbUY7QUFFOUksU0FBUyxvQkFBNEMsY0FBYywrQkFBNkQ7QUFDaEksU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxVQUFVLFNBQVMsa0JBQWtCLFVBQVUsbUNBQW1DO0FBQzNGLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLG9CQUFvQixzQkFBc0I7QUFDbkQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxn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
