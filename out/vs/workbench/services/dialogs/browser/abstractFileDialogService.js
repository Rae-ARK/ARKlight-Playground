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
import * as nls from "../../../../nls.js";
import { isWorkspaceToOpen, isFileToOpen } from "../../../../platform/window/common/window.js";
import { IDialogService, ConfirmResult, getFileNamesMessage } from "../../../../platform/dialogs/common/dialogs.js";
import { isSavedWorkspace, isTemporaryWorkspace, IWorkspaceContextService, WorkbenchState, WORKSPACE_EXTENSION } from "../../../../platform/workspace/common/workspace.js";
import { IHistoryService } from "../../history/common/history.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import * as resources from "../../../../base/common/resources.js";
import { isAbsolute as localPathIsAbsolute, normalize as localPathNormalize } from "../../../../base/common/path.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { SimpleFileDialog } from "./simpleFileDialog.js";
import { IWorkspacesService } from "../../../../platform/workspaces/common/workspaces.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IHostService } from "../../host/browser/host.js";
import Severity from "../../../../base/common/severity.js";
import { coalesce, distinct } from "../../../../base/common/arrays.js";
import { trim } from "../../../../base/common/strings.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IPathService } from "../../path/common/pathService.js";
import { Schemas } from "../../../../base/common/network.js";
import { PLAINTEXT_EXTENSION } from "../../../../editor/common/languages/modesRegistry.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { EditorOpenSource } from "../../../../platform/editor/common/editor.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
let AbstractFileDialogService = class {
  constructor(hostService, contextService, historyService, environmentService, instantiationService, configurationService, fileService, openerService, dialogService, languageService, workspacesService, labelService, pathService, commandService, editorService, codeEditorService, logService, remoteAgentService) {
    this.hostService = hostService;
    this.contextService = contextService;
    this.historyService = historyService;
    this.environmentService = environmentService;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.fileService = fileService;
    this.openerService = openerService;
    this.dialogService = dialogService;
    this.languageService = languageService;
    this.workspacesService = workspacesService;
    this.labelService = labelService;
    this.pathService = pathService;
    this.commandService = commandService;
    this.editorService = editorService;
    this.codeEditorService = codeEditorService;
    this.logService = logService;
    this.remoteAgentService = remoteAgentService;
  }
  async defaultFilePath(schemeFilter = this.getSchemeFilterForWindow(), authorityFilter = this.getAuthorityFilterForWindow()) {
    let candidate = this.historyService.getLastActiveFile(schemeFilter, authorityFilter);
    if (candidate && await this.isRemoteUserData(candidate)) {
      this.logService.debug(`[FileDialogService] Skipping last active file as it is a remote user data resource: ${candidate}`);
      candidate = void 0;
    }
    if (!candidate) {
      candidate = this.historyService.getLastActiveWorkspaceRoot(schemeFilter, authorityFilter);
      if (candidate) {
        this.logService.debug(`[FileDialogService] Default file path using last active workspace root: ${candidate}`);
      }
    } else {
      this.logService.debug(`[FileDialogService] Default file path using parent of last active file: ${candidate}`);
      candidate = resources.dirname(candidate);
    }
    if (!candidate) {
      candidate = await this.preferredHome(schemeFilter);
      this.logService.debug(`[FileDialogService] Default file path using preferred home: ${candidate}`);
    }
    return candidate;
  }
  async defaultFolderPath(schemeFilter = this.getSchemeFilterForWindow(), authorityFilter = this.getAuthorityFilterForWindow()) {
    let candidate = this.historyService.getLastActiveWorkspaceRoot(schemeFilter, authorityFilter);
    if (!candidate) {
      candidate = this.historyService.getLastActiveFile(schemeFilter, authorityFilter);
      if (candidate && await this.isRemoteUserData(candidate)) {
        this.logService.debug(`[FileDialogService] Skipping last active file as it is a remote user data resource: ${candidate}`);
        candidate = void 0;
      }
      if (candidate) {
        this.logService.debug(`[FileDialogService] Default folder path using parent of last active file: ${candidate}`);
      }
    } else {
      this.logService.debug(`[FileDialogService] Default folder path using last active workspace root: ${candidate}`);
    }
    if (!candidate) {
      const preferredHome = await this.preferredHome(schemeFilter);
      this.logService.debug(`[FileDialogService] Default folder path using preferred home: ${preferredHome}`);
      return preferredHome;
    }
    return resources.dirname(candidate);
  }
  async preferredHome(schemeFilter = this.getSchemeFilterForWindow()) {
    const preferLocal = schemeFilter === Schemas.file;
    const preferredHomeConfig = this.configurationService.inspect("files.dialog.defaultPath");
    const preferredHomeCandidate = preferLocal ? preferredHomeConfig.userLocalValue : preferredHomeConfig.userRemoteValue;
    this.logService.debug(`[FileDialogService] Preferred home: preferLocal=${preferLocal}, userLocalValue=${preferredHomeConfig.userLocalValue}, userRemoteValue=${preferredHomeConfig.userRemoteValue}`);
    if (preferredHomeCandidate) {
      const isPreferredHomeCandidateAbsolute = preferLocal ? localPathIsAbsolute(preferredHomeCandidate) : (await this.pathService.path).isAbsolute(preferredHomeCandidate);
      if (isPreferredHomeCandidateAbsolute) {
        const preferredHomeNormalized = preferLocal ? localPathNormalize(preferredHomeCandidate) : (await this.pathService.path).normalize(preferredHomeCandidate);
        const preferredHome = resources.toLocalResource(await this.pathService.fileURI(preferredHomeNormalized), this.environmentService.remoteAuthority, this.pathService.defaultUriScheme);
        if (await this.fileService.exists(preferredHome)) {
          this.logService.debug(`[FileDialogService] Preferred home using files.dialog.defaultPath setting: ${preferredHome}`);
          return preferredHome;
        }
        this.logService.debug(`[FileDialogService] Preferred home files.dialog.defaultPath path does not exist: ${preferredHome}`);
      } else {
        this.logService.debug(`[FileDialogService] Preferred home files.dialog.defaultPath is not absolute: ${preferredHomeCandidate}`);
      }
    }
    const userHome = this.pathService.userHome({ preferLocal });
    this.logService.debug(`[FileDialogService] Preferred home using user home: ${userHome}`);
    return userHome;
  }
  async defaultWorkspacePath(schemeFilter = this.getSchemeFilterForWindow()) {
    let defaultWorkspacePath;
    if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      const configuration = this.contextService.getWorkspace().configuration;
      if (configuration?.scheme === schemeFilter && isSavedWorkspace(configuration, this.environmentService) && !isTemporaryWorkspace(configuration)) {
        defaultWorkspacePath = resources.dirname(configuration);
      }
    }
    if (!defaultWorkspacePath) {
      defaultWorkspacePath = await this.defaultFilePath(schemeFilter);
    }
    return defaultWorkspacePath;
  }
  async showSaveConfirm(fileNamesOrResources) {
    if (this.skipDialogs()) {
      this.logService.trace("FileDialogService: refused to show save confirmation dialog in tests.");
      return ConfirmResult.DONT_SAVE;
    }
    return this.doShowSaveConfirm(fileNamesOrResources);
  }
  skipDialogs() {
    if (this.environmentService.enableSmokeTestDriver) {
      this.logService.warn("DialogService: Dialog requested during smoke test.");
    }
    return this.environmentService.isExtensionDevelopment && !!this.environmentService.extensionTestsLocationURI;
  }
  async doShowSaveConfirm(fileNamesOrResources) {
    if (fileNamesOrResources.length === 0) {
      return ConfirmResult.DONT_SAVE;
    }
    let message;
    let detail = nls.localize("saveChangesDetail", "Your changes will be lost if you don't save them.");
    if (fileNamesOrResources.length === 1) {
      message = nls.localize("saveChangesMessage", "Do you want to save the changes you made to {0}?", typeof fileNamesOrResources[0] === "string" ? fileNamesOrResources[0] : resources.basename(fileNamesOrResources[0]));
    } else {
      message = nls.localize("saveChangesMessages", "Do you want to save the changes to the following {0} files?", fileNamesOrResources.length);
      detail = getFileNamesMessage(fileNamesOrResources) + "\n" + detail;
    }
    const { result } = await this.dialogService.prompt({
      type: Severity.Warning,
      message,
      detail,
      buttons: [
        {
          label: fileNamesOrResources.length > 1 ? nls.localize({ key: "saveAll", comment: ["&& denotes a mnemonic"] }, "&&Save All") : nls.localize({ key: "save", comment: ["&& denotes a mnemonic"] }, "&&Save"),
          run: () => ConfirmResult.SAVE
        },
        {
          label: nls.localize({ key: "dontSave", comment: ["&& denotes a mnemonic"] }, "Do&&n't Save"),
          run: () => ConfirmResult.DONT_SAVE
        }
      ],
      cancelButton: {
        run: () => ConfirmResult.CANCEL
      }
    });
    return result;
  }
  addFileSchemaIfNeeded(schema, _isFolder) {
    return schema === Schemas.untitled ? [Schemas.file] : schema !== Schemas.file ? [schema, Schemas.file] : [schema];
  }
  async pickFileFolderAndOpenSimplified(schema, options, preferNewWindow) {
    const title = nls.localize("openFileOrFolder.title", "Open File or Folder");
    const availableFileSystems = this.addFileSchemaIfNeeded(schema);
    const uris = await this.pickResource({ canSelectFiles: true, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
    const uri = uris?.[0];
    if (uri) {
      const stat = await this.fileService.stat(uri);
      const toOpen = stat.isDirectory ? { folderUri: uri } : { fileUri: uri };
      if (!isWorkspaceToOpen(toOpen) && isFileToOpen(toOpen)) {
        this.addFileToRecentlyOpened(toOpen.fileUri);
      }
      if (stat.isDirectory || options.forceNewWindow || preferNewWindow) {
        await this.hostService.openWindow([toOpen], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
      } else {
        await this.editorService.openEditors([{ resource: uri, options: { source: EditorOpenSource.USER, pinned: true } }], void 0, { validateTrust: true });
      }
    }
  }
  async pickFileAndOpenSimplified(schema, options, preferNewWindow) {
    const title = nls.localize("openFile.title", "Open File");
    const availableFileSystems = this.addFileSchemaIfNeeded(schema);
    const uris = await this.pickResource({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
    const uri = uris?.[0];
    if (uri) {
      this.addFileToRecentlyOpened(uri);
      if (options.forceNewWindow || preferNewWindow) {
        await this.hostService.openWindow([{ fileUri: uri }], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
      } else {
        await this.editorService.openEditors([{ resource: uri, options: { source: EditorOpenSource.USER, pinned: true } }], void 0, { validateTrust: true });
      }
    }
  }
  addFileToRecentlyOpened(uri) {
    this.workspacesService.addRecentlyOpened([{ fileUri: uri, label: this.labelService.getUriLabel(uri, { appendWorkspaceSuffix: true }) }]);
  }
  async pickFolderAndOpenSimplified(schema, options) {
    const title = nls.localize("openFolder.title", "Open Folder");
    const availableFileSystems = this.addFileSchemaIfNeeded(schema, true);
    const uris = await this.pickResource({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
    const uri = uris?.[0];
    if (uri) {
      return this.hostService.openWindow([{ folderUri: uri }], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
    }
  }
  async pickWorkspaceAndOpenSimplified(schema, options) {
    const title = nls.localize("openWorkspace.title", "Open Workspace from File");
    const filters = [{ name: nls.localize("filterName.workspace", "Workspace"), extensions: [WORKSPACE_EXTENSION] }];
    const availableFileSystems = this.addFileSchemaIfNeeded(schema, true);
    const uris = await this.pickResource({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, filters, availableFileSystems });
    const uri = uris?.[0];
    if (uri) {
      return this.hostService.openWindow([{ workspaceUri: uri }], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
    }
  }
  async pickFileToSaveSimplified(schema, options) {
    if (!options.availableFileSystems) {
      options.availableFileSystems = this.addFileSchemaIfNeeded(schema);
    }
    options.title = nls.localize("saveFileAs.title", "Save As");
    const uri = await this.saveRemoteResource(options);
    if (uri) {
      this.addFileToRecentlyOpened(uri);
    }
    return uri;
  }
  async showSaveDialogSimplified(schema, options) {
    if (!options.availableFileSystems) {
      options.availableFileSystems = this.addFileSchemaIfNeeded(schema);
    }
    return this.saveRemoteResource(options);
  }
  async showOpenDialogSimplified(schema, options) {
    if (!options.availableFileSystems) {
      options.availableFileSystems = this.addFileSchemaIfNeeded(schema, options.canSelectFolders);
    }
    return this.pickResource(options);
  }
  getSimpleFileDialog() {
    return this.instantiationService.createInstance(SimpleFileDialog);
  }
  pickResource(options) {
    return this.getSimpleFileDialog().showOpenDialog(options);
  }
  saveRemoteResource(options) {
    return this.getSimpleFileDialog().showSaveDialog(options);
  }
  /**
   * Checks whether the given resource is a remote user data file
   * that should not be used as a default file dialog path candidate.
   * This covers remote user data files such as settings.json, keybindings.json, etc.
   */
  async isRemoteUserData(resource) {
    if (!this.environmentService.remoteAuthority) {
      return false;
    }
    const remoteEnv = await this.remoteAgentService.getEnvironment();
    if (remoteEnv) {
      const remoteDataHome = resources.dirname(resources.dirname(remoteEnv.settingsPath));
      if (!resources.isEqual(remoteDataHome, remoteDataHome.with({ path: "/" })) && resources.isEqualOrParent(resource, remoteDataHome)) {
        return true;
      }
    }
    return false;
  }
  getSchemeFilterForWindow(defaultUriScheme) {
    return defaultUriScheme ?? this.pathService.defaultUriScheme;
  }
  getAuthorityFilterForWindow() {
    return this.environmentService.remoteAuthority;
  }
  getFileSystemSchema(options) {
    return options.availableFileSystems?.[0] || this.getSchemeFilterForWindow(options.defaultUri?.scheme);
  }
  getWorkspaceAvailableFileSystems(options) {
    if (options.availableFileSystems && options.availableFileSystems.length > 0) {
      return options.availableFileSystems;
    }
    const availableFileSystems = [Schemas.file];
    if (this.environmentService.remoteAuthority) {
      availableFileSystems.unshift(Schemas.vscodeRemote);
    }
    return availableFileSystems;
  }
  getPickFileToSaveDialogOptions(defaultUri, availableFileSystems) {
    const options = {
      defaultUri,
      title: nls.localize("saveAsTitle", "Save As"),
      availableFileSystems
    };
    const ext = defaultUri ? resources.extname(defaultUri) : void 0;
    let matchingFilter;
    const registeredLanguageNames = this.languageService.getSortedRegisteredLanguageNames();
    const registeredLanguageFilters = coalesce(registeredLanguageNames.map(({ languageName, languageId }) => {
      const extensions = this.languageService.getExtensions(languageId);
      if (!extensions.length) {
        return null;
      }
      const filter = { name: languageName, extensions: distinct(extensions).slice(0, 10).map((e) => trim(e, ".")) };
      const extOrPlaintext = ext || PLAINTEXT_EXTENSION;
      if (!matchingFilter && extensions.includes(extOrPlaintext)) {
        matchingFilter = filter;
        const trimmedExt = trim(extOrPlaintext, ".");
        if (!filter.extensions.includes(trimmedExt)) {
          filter.extensions.unshift(trimmedExt);
        }
        return null;
      }
      return filter;
    }));
    if (!matchingFilter && ext) {
      matchingFilter = { name: trim(ext, ".").toUpperCase(), extensions: [trim(ext, ".")] };
    }
    options.filters = coalesce([
      { name: nls.localize("allFiles", "All Files"), extensions: ["*"] },
      matchingFilter,
      ...registeredLanguageFilters,
      { name: nls.localize("noExt", "No Extension"), extensions: [""] }
    ]);
    return options;
  }
};
AbstractFileDialogService = __decorateClass([
  __decorateParam(0, IHostService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IHistoryService),
  __decorateParam(3, IWorkbenchEnvironmentService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, ILanguageService),
  __decorateParam(10, IWorkspacesService),
  __decorateParam(11, ILabelService),
  __decorateParam(12, IPathService),
  __decorateParam(13, ICommandService),
  __decorateParam(14, IEditorService),
  __decorateParam(15, ICodeEditorService),
  __decorateParam(16, ILogService),
  __decorateParam(17, IRemoteAgentService)
], AbstractFileDialogService);
export {
  AbstractFileDialogService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9kaWFsb2dzL2Jyb3dzZXIvYWJzdHJhY3RGaWxlRGlhbG9nU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVdpbmRvd09wZW5hYmxlLCBpc1dvcmtzcGFjZVRvT3BlbiwgaXNGaWxlVG9PcGVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSVBpY2tBbmRPcGVuT3B0aW9ucywgSVNhdmVEaWFsb2dPcHRpb25zLCBJT3BlbkRpYWxvZ09wdGlvbnMsIEZpbGVGaWx0ZXIsIElGaWxlRGlhbG9nU2VydmljZSwgSURpYWxvZ1NlcnZpY2UsIENvbmZpcm1SZXN1bHQsIGdldEZpbGVOYW1lc01lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IGlzU2F2ZWRXb3Jrc3BhY2UsIGlzVGVtcG9yYXJ5V29ya3NwYWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFdvcmtiZW5jaFN0YXRlLCBXT1JLU1BBQ0VfRVhURU5TSU9OIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaGlzdG9yeS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc0Fic29sdXRlIGFzIGxvY2FsUGF0aElzQWJzb2x1dGUsIG5vcm1hbGl6ZSBhcyBsb2NhbFBhdGhOb3JtYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTaW1wbGVGaWxlRGlhbG9nLCBTaW1wbGVGaWxlRGlhbG9nIH0gZnJvbSAnLi9zaW1wbGVGaWxlRGlhbG9nLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UsIGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IHRyaW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9FWFRFTlNJT04gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9tb2Rlc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcGVuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RGaWxlRGlhbG9nU2VydmljZSBpbXBsZW1lbnRzIElGaWxlRGlhbG9nU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElIb3N0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJSGlzdG9yeVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGhpc3RvcnlTZXJ2aWNlOiBJSGlzdG9yeVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZXNTZXJ2aWNlOiBJV29ya3NwYWNlc1NlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2Vcblx0KSB7IH1cblxuXHRhc3luYyBkZWZhdWx0RmlsZVBhdGgoc2NoZW1lRmlsdGVyID0gdGhpcy5nZXRTY2hlbWVGaWx0ZXJGb3JXaW5kb3coKSwgYXV0aG9yaXR5RmlsdGVyID0gdGhpcy5nZXRBdXRob3JpdHlGaWx0ZXJGb3JXaW5kb3coKSk6IFByb21pc2U8VVJJPiB7XG5cblx0XHQvLyBDaGVjayBmb3IgbGFzdCBhY3RpdmUgZmlsZSBmaXJzdC4uLlxuXHRcdGxldCBjYW5kaWRhdGUgPSB0aGlzLmhpc3RvcnlTZXJ2aWNlLmdldExhc3RBY3RpdmVGaWxlKHNjaGVtZUZpbHRlciwgYXV0aG9yaXR5RmlsdGVyKTtcblxuXHRcdC8vIFNraXAgdXNlciBkYXRhIGZpbGVzIChlLmcuIE1hY2hpbmUvc2V0dGluZ3MuanNvbikgYXMgZGVmYXVsdCBwYXRoIGNhbmRpZGF0ZXNcblx0XHRpZiAoY2FuZGlkYXRlICYmIGF3YWl0IHRoaXMuaXNSZW1vdGVVc2VyRGF0YShjYW5kaWRhdGUpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtGaWxlRGlhbG9nU2VydmljZV0gU2tpcHBpbmcgbGFzdCBhY3RpdmUgZmlsZSBhcyBpdCBpcyBhIHJlbW90ZSB1c2VyIGRhdGEgcmVzb3VyY2U6ICR7Y2FuZGlkYXRlfWApO1xuXHRcdFx0Y2FuZGlkYXRlID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIC4uLnRoZW4gZm9yIGxhc3QgYWN0aXZlIGZpbGUgcm9vdFxuXHRcdGlmICghY2FuZGlkYXRlKSB7XG5cdFx0XHRjYW5kaWRhdGUgPSB0aGlzLmhpc3RvcnlTZXJ2aWNlLmdldExhc3RBY3RpdmVXb3Jrc3BhY2VSb290KHNjaGVtZUZpbHRlciwgYXV0aG9yaXR5RmlsdGVyKTtcblx0XHRcdGlmIChjYW5kaWRhdGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbRmlsZURpYWxvZ1NlcnZpY2VdIERlZmF1bHQgZmlsZSBwYXRoIHVzaW5nIGxhc3QgYWN0aXZlIHdvcmtzcGFjZSByb290OiAke2NhbmRpZGF0ZX1gKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbRmlsZURpYWxvZ1NlcnZpY2VdIERlZmF1bHQgZmlsZSBwYXRoIHVzaW5nIHBhcmVudCBvZiBsYXN0IGFjdGl2ZSBmaWxlOiAke2NhbmRpZGF0ZX1gKTtcblx0XHRcdGNhbmRpZGF0ZSA9IHJlc291cmNlcy5kaXJuYW1lKGNhbmRpZGF0ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFjYW5kaWRhdGUpIHtcblx0XHRcdGNhbmRpZGF0ZSA9IGF3YWl0IHRoaXMucHJlZmVycmVkSG9tZShzY2hlbWVGaWx0ZXIpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbRmlsZURpYWxvZ1NlcnZpY2VdIERlZmF1bHQgZmlsZSBwYXRoIHVzaW5nIHByZWZlcnJlZCBob21lOiAke2NhbmRpZGF0ZX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2FuZGlkYXRlO1xuXHR9XG5cblx0YXN5bmMgZGVmYXVsdEZvbGRlclBhdGgoc2NoZW1lRmlsdGVyID0gdGhpcy5nZXRTY2hlbWVGaWx0ZXJGb3JXaW5kb3coKSwgYXV0aG9yaXR5RmlsdGVyID0gdGhpcy5nZXRBdXRob3JpdHlGaWx0ZXJGb3JXaW5kb3coKSk6IFByb21pc2U8VVJJPiB7XG5cblx0XHQvLyBDaGVjayBmb3IgbGFzdCBhY3RpdmUgZmlsZSByb290IGZpcnN0Li4uXG5cdFx0bGV0IGNhbmRpZGF0ZSA9IHRoaXMuaGlzdG9yeVNlcnZpY2UuZ2V0TGFzdEFjdGl2ZVdvcmtzcGFjZVJvb3Qoc2NoZW1lRmlsdGVyLCBhdXRob3JpdHlGaWx0ZXIpO1xuXG5cdFx0Ly8gLi4udGhlbiBmb3IgbGFzdCBhY3RpdmUgZmlsZVxuXHRcdGlmICghY2FuZGlkYXRlKSB7XG5cdFx0XHRjYW5kaWRhdGUgPSB0aGlzLmhpc3RvcnlTZXJ2aWNlLmdldExhc3RBY3RpdmVGaWxlKHNjaGVtZUZpbHRlciwgYXV0aG9yaXR5RmlsdGVyKTtcblxuXHRcdFx0Ly8gU2tpcCB1c2VyIGRhdGEgZmlsZXMgKGUuZy4gTWFjaGluZS9zZXR0aW5ncy5qc29uKSBhcyBkZWZhdWx0IHBhdGggY2FuZGlkYXRlc1xuXHRcdFx0aWYgKGNhbmRpZGF0ZSAmJiBhd2FpdCB0aGlzLmlzUmVtb3RlVXNlckRhdGEoY2FuZGlkYXRlKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtGaWxlRGlhbG9nU2VydmljZV0gU2tpcHBpbmcgbGFzdCBhY3RpdmUgZmlsZSBhcyBpdCBpcyBhIHJlbW90ZSB1c2VyIGRhdGEgcmVzb3VyY2U6ICR7Y2FuZGlkYXRlfWApO1xuXHRcdFx0XHRjYW5kaWRhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjYW5kaWRhdGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbRmlsZURpYWxvZ1NlcnZpY2VdIERlZmF1bHQgZm9sZGVyIHBhdGggdXNpbmcgcGFyZW50IG9mIGxhc3QgYWN0aXZlIGZpbGU6ICR7Y2FuZGlkYXRlfWApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtGaWxlRGlhbG9nU2VydmljZV0gRGVmYXVsdCBmb2xkZXIgcGF0aCB1c2luZyBsYXN0IGFjdGl2ZSB3b3Jrc3BhY2Ugcm9vdDogJHtjYW5kaWRhdGV9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFjYW5kaWRhdGUpIHtcblx0XHRcdGNvbnN0IHByZWZlcnJlZEhvbWUgPSBhd2FpdCB0aGlzLnByZWZlcnJlZEhvbWUoc2NoZW1lRmlsdGVyKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0ZpbGVEaWFsb2dTZXJ2aWNlXSBEZWZhdWx0IGZvbGRlciBwYXRoIHVzaW5nIHByZWZlcnJlZCBob21lOiAke3ByZWZlcnJlZEhvbWV9YCk7XG5cdFx0XHRyZXR1cm4gcHJlZmVycmVkSG9tZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzb3VyY2VzLmRpcm5hbWUoY2FuZGlkYXRlKTtcblx0fVxuXG5cdGFzeW5jIHByZWZlcnJlZEhvbWUoc2NoZW1lRmlsdGVyID0gdGhpcy5nZXRTY2hlbWVGaWx0ZXJGb3JXaW5kb3coKSk6IFByb21pc2U8VVJJPiB7XG5cdFx0Y29uc3QgcHJlZmVyTG9jYWwgPSBzY2hlbWVGaWx0ZXIgPT09IFNjaGVtYXMuZmlsZTtcblx0XHRjb25zdCBwcmVmZXJyZWRIb21lQ29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PHN0cmluZz4oJ2ZpbGVzLmRpYWxvZy5kZWZhdWx0UGF0aCcpO1xuXHRcdGNvbnN0IHByZWZlcnJlZEhvbWVDYW5kaWRhdGUgPSBwcmVmZXJMb2NhbCA/IHByZWZlcnJlZEhvbWVDb25maWcudXNlckxvY2FsVmFsdWUgOiBwcmVmZXJyZWRIb21lQ29uZmlnLnVzZXJSZW1vdGVWYWx1ZTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtGaWxlRGlhbG9nU2VydmljZV0gUHJlZmVycmVkIGhvbWU6IHByZWZlckxvY2FsPSR7cHJlZmVyTG9jYWx9LCB1c2VyTG9jYWxWYWx1ZT0ke3ByZWZlcnJlZEhvbWVDb25maWcudXNlckxvY2FsVmFsdWV9LCB1c2VyUmVtb3RlVmFsdWU9JHtwcmVmZXJyZWRIb21lQ29uZmlnLnVzZXJSZW1vdGVWYWx1ZX1gKTtcblx0XHRpZiAocHJlZmVycmVkSG9tZUNhbmRpZGF0ZSkge1xuXHRcdFx0Y29uc3QgaXNQcmVmZXJyZWRIb21lQ2FuZGlkYXRlQWJzb2x1dGUgPSBwcmVmZXJMb2NhbCA/IGxvY2FsUGF0aElzQWJzb2x1dGUocHJlZmVycmVkSG9tZUNhbmRpZGF0ZSkgOiAoYXdhaXQgdGhpcy5wYXRoU2VydmljZS5wYXRoKS5pc0Fic29sdXRlKHByZWZlcnJlZEhvbWVDYW5kaWRhdGUpO1xuXHRcdFx0aWYgKGlzUHJlZmVycmVkSG9tZUNhbmRpZGF0ZUFic29sdXRlKSB7XG5cdFx0XHRcdGNvbnN0IHByZWZlcnJlZEhvbWVOb3JtYWxpemVkID0gcHJlZmVyTG9jYWwgPyBsb2NhbFBhdGhOb3JtYWxpemUocHJlZmVycmVkSG9tZUNhbmRpZGF0ZSkgOiAoYXdhaXQgdGhpcy5wYXRoU2VydmljZS5wYXRoKS5ub3JtYWxpemUocHJlZmVycmVkSG9tZUNhbmRpZGF0ZSk7XG5cdFx0XHRcdGNvbnN0IHByZWZlcnJlZEhvbWUgPSByZXNvdXJjZXMudG9Mb2NhbFJlc291cmNlKGF3YWl0IHRoaXMucGF0aFNlcnZpY2UuZmlsZVVSSShwcmVmZXJyZWRIb21lTm9ybWFsaXplZCksIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSwgdGhpcy5wYXRoU2VydmljZS5kZWZhdWx0VXJpU2NoZW1lKTtcblx0XHRcdFx0aWYgKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKHByZWZlcnJlZEhvbWUpKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbRmlsZURpYWxvZ1NlcnZpY2VdIFByZWZlcnJlZCBob21lIHVzaW5nIGZpbGVzLmRpYWxvZy5kZWZhdWx0UGF0aCBzZXR0aW5nOiAke3ByZWZlcnJlZEhvbWV9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIHByZWZlcnJlZEhvbWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbRmlsZURpYWxvZ1NlcnZpY2VdIFByZWZlcnJlZCBob21lIGZpbGVzLmRpYWxvZy5kZWZhdWx0UGF0aCBwYXRoIGRvZXMgbm90IGV4aXN0OiAke3ByZWZlcnJlZEhvbWV9YCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtGaWxlRGlhbG9nU2VydmljZV0gUHJlZmVycmVkIGhvbWUgZmlsZXMuZGlhbG9nLmRlZmF1bHRQYXRoIGlzIG5vdCBhYnNvbHV0ZTogJHtwcmVmZXJyZWRIb21lQ2FuZGlkYXRlfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHVzZXJIb21lID0gdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSh7IHByZWZlckxvY2FsIH0pO1xuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0ZpbGVEaWFsb2dTZXJ2aWNlXSBQcmVmZXJyZWQgaG9tZSB1c2luZyB1c2VyIGhvbWU6ICR7dXNlckhvbWV9YCk7XG5cdFx0cmV0dXJuIHVzZXJIb21lO1xuXHR9XG5cblx0YXN5bmMgZGVmYXVsdFdvcmtzcGFjZVBhdGgoc2NoZW1lRmlsdGVyID0gdGhpcy5nZXRTY2hlbWVGaWx0ZXJGb3JXaW5kb3coKSk6IFByb21pc2U8VVJJPiB7XG5cdFx0bGV0IGRlZmF1bHRXb3Jrc3BhY2VQYXRoOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0XHQvLyBDaGVjayBmb3IgY3VycmVudCB3b3Jrc3BhY2UgY29uZmlnIGZpbGUgZmlyc3QuLi5cblx0XHRpZiAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UpIHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmNvbmZpZ3VyYXRpb247XG5cdFx0XHRpZiAoY29uZmlndXJhdGlvbj8uc2NoZW1lID09PSBzY2hlbWVGaWx0ZXIgJiYgaXNTYXZlZFdvcmtzcGFjZShjb25maWd1cmF0aW9uLCB0aGlzLmVudmlyb25tZW50U2VydmljZSkgJiYgIWlzVGVtcG9yYXJ5V29ya3NwYWNlKGNvbmZpZ3VyYXRpb24pKSB7XG5cdFx0XHRcdGRlZmF1bHRXb3Jrc3BhY2VQYXRoID0gcmVzb3VyY2VzLmRpcm5hbWUoY29uZmlndXJhdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gLi4udGhlbiBmYWxsYmFjayB0byBkZWZhdWx0IGZpbGUgcGF0aFxuXHRcdGlmICghZGVmYXVsdFdvcmtzcGFjZVBhdGgpIHtcblx0XHRcdGRlZmF1bHRXb3Jrc3BhY2VQYXRoID0gYXdhaXQgdGhpcy5kZWZhdWx0RmlsZVBhdGgoc2NoZW1lRmlsdGVyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGVmYXVsdFdvcmtzcGFjZVBhdGg7XG5cdH1cblxuXHRhc3luYyBzaG93U2F2ZUNvbmZpcm0oZmlsZU5hbWVzT3JSZXNvdXJjZXM6IChzdHJpbmcgfCBVUkkpW10pOiBQcm9taXNlPENvbmZpcm1SZXN1bHQ+IHtcblx0XHRpZiAodGhpcy5za2lwRGlhbG9ncygpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0ZpbGVEaWFsb2dTZXJ2aWNlOiByZWZ1c2VkIHRvIHNob3cgc2F2ZSBjb25maXJtYXRpb24gZGlhbG9nIGluIHRlc3RzLicpO1xuXG5cdFx0XHQvLyBubyB2ZXRvIHdoZW4gd2UgYXJlIGluIGV4dGVuc2lvbiBkZXYgdGVzdGluZyBtb2RlIGJlY2F1c2Ugd2UgY2Fubm90IGFzc3VtZSB3ZSBydW4gaW50ZXJhY3RpdmVcblx0XHRcdHJldHVybiBDb25maXJtUmVzdWx0LkRPTlRfU0FWRTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kb1Nob3dTYXZlQ29uZmlybShmaWxlTmFtZXNPclJlc291cmNlcyk7XG5cdH1cblxuXHRwcml2YXRlIHNraXBEaWFsb2dzKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5lbmFibGVTbW9rZVRlc3REcml2ZXIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdEaWFsb2dTZXJ2aWNlOiBEaWFsb2cgcmVxdWVzdGVkIGR1cmluZyBzbW9rZSB0ZXN0LicpO1xuXHRcdH1cblx0XHQvLyBpbnRlZ3JhdGlvbiB0ZXN0c1xuXHRcdHJldHVybiB0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0V4dGVuc2lvbkRldmVsb3BtZW50ICYmICEhdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TaG93U2F2ZUNvbmZpcm0oZmlsZU5hbWVzT3JSZXNvdXJjZXM6IChzdHJpbmcgfCBVUkkpW10pOiBQcm9taXNlPENvbmZpcm1SZXN1bHQ+IHtcblx0XHRpZiAoZmlsZU5hbWVzT3JSZXNvdXJjZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gQ29uZmlybVJlc3VsdC5ET05UX1NBVkU7XG5cdFx0fVxuXG5cdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRsZXQgZGV0YWlsID0gbmxzLmxvY2FsaXplKCdzYXZlQ2hhbmdlc0RldGFpbCcsIFwiWW91ciBjaGFuZ2VzIHdpbGwgYmUgbG9zdCBpZiB5b3UgZG9uJ3Qgc2F2ZSB0aGVtLlwiKTtcblx0XHRpZiAoZmlsZU5hbWVzT3JSZXNvdXJjZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdzYXZlQ2hhbmdlc01lc3NhZ2UnLCBcIkRvIHlvdSB3YW50IHRvIHNhdmUgdGhlIGNoYW5nZXMgeW91IG1hZGUgdG8gezB9P1wiLCB0eXBlb2YgZmlsZU5hbWVzT3JSZXNvdXJjZXNbMF0gPT09ICdzdHJpbmcnID8gZmlsZU5hbWVzT3JSZXNvdXJjZXNbMF0gOiByZXNvdXJjZXMuYmFzZW5hbWUoZmlsZU5hbWVzT3JSZXNvdXJjZXNbMF0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnc2F2ZUNoYW5nZXNNZXNzYWdlcycsIFwiRG8geW91IHdhbnQgdG8gc2F2ZSB0aGUgY2hhbmdlcyB0byB0aGUgZm9sbG93aW5nIHswfSBmaWxlcz9cIiwgZmlsZU5hbWVzT3JSZXNvdXJjZXMubGVuZ3RoKTtcblx0XHRcdGRldGFpbCA9IGdldEZpbGVOYW1lc01lc3NhZ2UoZmlsZU5hbWVzT3JSZXNvdXJjZXMpICsgJ1xcbicgKyBkZXRhaWw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQ8Q29uZmlybVJlc3VsdD4oe1xuXHRcdFx0dHlwZTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRkZXRhaWwsXG5cdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogZmlsZU5hbWVzT3JSZXNvdXJjZXMubGVuZ3RoID4gMSA/XG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoeyBrZXk6ICdzYXZlQWxsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmU2F2ZSBBbGxcIikgOlxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKHsga2V5OiAnc2F2ZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlNhdmVcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBDb25maXJtUmVzdWx0LlNBVkVcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoeyBrZXk6ICdkb250U2F2ZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJEbyYmbid0IFNhdmVcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBDb25maXJtUmVzdWx0LkRPTlRfU0FWRVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdHJ1bjogKCkgPT4gQ29uZmlybVJlc3VsdC5DQU5DRUxcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWRkRmlsZVNjaGVtYUlmTmVlZGVkKHNjaGVtYTogc3RyaW5nLCBfaXNGb2xkZXI/OiBib29sZWFuKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBzY2hlbWEgPT09IFNjaGVtYXMudW50aXRsZWQgPyBbU2NoZW1hcy5maWxlXSA6IChzY2hlbWEgIT09IFNjaGVtYXMuZmlsZSA/IFtzY2hlbWEsIFNjaGVtYXMuZmlsZV0gOiBbc2NoZW1hXSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgcGlja0ZpbGVGb2xkZXJBbmRPcGVuU2ltcGxpZmllZChzY2hlbWE6IHN0cmluZywgb3B0aW9uczogSVBpY2tBbmRPcGVuT3B0aW9ucywgcHJlZmVyTmV3V2luZG93OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGl0bGUgPSBubHMubG9jYWxpemUoJ29wZW5GaWxlT3JGb2xkZXIudGl0bGUnLCAnT3BlbiBGaWxlIG9yIEZvbGRlcicpO1xuXHRcdGNvbnN0IGF2YWlsYWJsZUZpbGVTeXN0ZW1zID0gdGhpcy5hZGRGaWxlU2NoZW1hSWZOZWVkZWQoc2NoZW1hKTtcblxuXHRcdGNvbnN0IHVyaXMgPSBhd2FpdCB0aGlzLnBpY2tSZXNvdXJjZSh7IGNhblNlbGVjdEZpbGVzOiB0cnVlLCBjYW5TZWxlY3RGb2xkZXJzOiB0cnVlLCBjYW5TZWxlY3RNYW55OiBmYWxzZSwgZGVmYXVsdFVyaTogb3B0aW9ucy5kZWZhdWx0VXJpLCB0aXRsZSwgYXZhaWxhYmxlRmlsZVN5c3RlbXMgfSk7XG5cdFx0Y29uc3QgdXJpID0gdXJpcz8uWzBdO1xuXG5cdFx0aWYgKHVyaSkge1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uuc3RhdCh1cmkpO1xuXG5cdFx0XHRjb25zdCB0b09wZW46IElXaW5kb3dPcGVuYWJsZSA9IHN0YXQuaXNEaXJlY3RvcnkgPyB7IGZvbGRlclVyaTogdXJpIH0gOiB7IGZpbGVVcmk6IHVyaSB9O1xuXHRcdFx0aWYgKCFpc1dvcmtzcGFjZVRvT3Blbih0b09wZW4pICYmIGlzRmlsZVRvT3Blbih0b09wZW4pKSB7XG5cdFx0XHRcdHRoaXMuYWRkRmlsZVRvUmVjZW50bHlPcGVuZWQodG9PcGVuLmZpbGVVcmkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3RhdC5pc0RpcmVjdG9yeSB8fCBvcHRpb25zLmZvcmNlTmV3V2luZG93IHx8IHByZWZlck5ld1dpbmRvdykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coW3RvT3Blbl0sIHsgZm9yY2VOZXdXaW5kb3c6IG9wdGlvbnMuZm9yY2VOZXdXaW5kb3csIHJlbW90ZUF1dGhvcml0eTogb3B0aW9ucy5yZW1vdGVBdXRob3JpdHkgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcnMoW3sgcmVzb3VyY2U6IHVyaSwgb3B0aW9uczogeyBzb3VyY2U6IEVkaXRvck9wZW5Tb3VyY2UuVVNFUiwgcGlubmVkOiB0cnVlIH0gfV0sIHVuZGVmaW5lZCwgeyB2YWxpZGF0ZVRydXN0OiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBwaWNrRmlsZUFuZE9wZW5TaW1wbGlmaWVkKHNjaGVtYTogc3RyaW5nLCBvcHRpb25zOiBJUGlja0FuZE9wZW5PcHRpb25zLCBwcmVmZXJOZXdXaW5kb3c6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0aXRsZSA9IG5scy5sb2NhbGl6ZSgnb3BlbkZpbGUudGl0bGUnLCAnT3BlbiBGaWxlJyk7XG5cdFx0Y29uc3QgYXZhaWxhYmxlRmlsZVN5c3RlbXMgPSB0aGlzLmFkZEZpbGVTY2hlbWFJZk5lZWRlZChzY2hlbWEpO1xuXG5cdFx0Y29uc3QgdXJpcyA9IGF3YWl0IHRoaXMucGlja1Jlc291cmNlKHsgY2FuU2VsZWN0RmlsZXM6IHRydWUsIGNhblNlbGVjdEZvbGRlcnM6IGZhbHNlLCBjYW5TZWxlY3RNYW55OiBmYWxzZSwgZGVmYXVsdFVyaTogb3B0aW9ucy5kZWZhdWx0VXJpLCB0aXRsZSwgYXZhaWxhYmxlRmlsZVN5c3RlbXMgfSk7XG5cdFx0Y29uc3QgdXJpID0gdXJpcz8uWzBdO1xuXHRcdGlmICh1cmkpIHtcblx0XHRcdHRoaXMuYWRkRmlsZVRvUmVjZW50bHlPcGVuZWQodXJpKTtcblxuXHRcdFx0aWYgKG9wdGlvbnMuZm9yY2VOZXdXaW5kb3cgfHwgcHJlZmVyTmV3V2luZG93KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuaG9zdFNlcnZpY2Uub3BlbldpbmRvdyhbeyBmaWxlVXJpOiB1cmkgfV0sIHsgZm9yY2VOZXdXaW5kb3c6IG9wdGlvbnMuZm9yY2VOZXdXaW5kb3csIHJlbW90ZUF1dGhvcml0eTogb3B0aW9ucy5yZW1vdGVBdXRob3JpdHkgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcnMoW3sgcmVzb3VyY2U6IHVyaSwgb3B0aW9uczogeyBzb3VyY2U6IEVkaXRvck9wZW5Tb3VyY2UuVVNFUiwgcGlubmVkOiB0cnVlIH0gfV0sIHVuZGVmaW5lZCwgeyB2YWxpZGF0ZVRydXN0OiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhZGRGaWxlVG9SZWNlbnRseU9wZW5lZCh1cmk6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMud29ya3NwYWNlc1NlcnZpY2UuYWRkUmVjZW50bHlPcGVuZWQoW3sgZmlsZVVyaTogdXJpLCBsYWJlbDogdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodXJpLCB7IGFwcGVuZFdvcmtzcGFjZVN1ZmZpeDogdHJ1ZSB9KSB9XSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgcGlja0ZvbGRlckFuZE9wZW5TaW1wbGlmaWVkKHNjaGVtYTogc3RyaW5nLCBvcHRpb25zOiBJUGlja0FuZE9wZW5PcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGl0bGUgPSBubHMubG9jYWxpemUoJ29wZW5Gb2xkZXIudGl0bGUnLCAnT3BlbiBGb2xkZXInKTtcblx0XHRjb25zdCBhdmFpbGFibGVGaWxlU3lzdGVtcyA9IHRoaXMuYWRkRmlsZVNjaGVtYUlmTmVlZGVkKHNjaGVtYSwgdHJ1ZSk7XG5cblx0XHRjb25zdCB1cmlzID0gYXdhaXQgdGhpcy5waWNrUmVzb3VyY2UoeyBjYW5TZWxlY3RGaWxlczogZmFsc2UsIGNhblNlbGVjdEZvbGRlcnM6IHRydWUsIGNhblNlbGVjdE1hbnk6IGZhbHNlLCBkZWZhdWx0VXJpOiBvcHRpb25zLmRlZmF1bHRVcmksIHRpdGxlLCBhdmFpbGFibGVGaWxlU3lzdGVtcyB9KTtcblx0XHRjb25zdCB1cmkgPSB1cmlzPy5bMF07XG5cdFx0aWYgKHVyaSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaG9zdFNlcnZpY2Uub3BlbldpbmRvdyhbeyBmb2xkZXJVcmk6IHVyaSB9XSwgeyBmb3JjZU5ld1dpbmRvdzogb3B0aW9ucy5mb3JjZU5ld1dpbmRvdywgcmVtb3RlQXV0aG9yaXR5OiBvcHRpb25zLnJlbW90ZUF1dGhvcml0eSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgcGlja1dvcmtzcGFjZUFuZE9wZW5TaW1wbGlmaWVkKHNjaGVtYTogc3RyaW5nLCBvcHRpb25zOiBJUGlja0FuZE9wZW5PcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGl0bGUgPSBubHMubG9jYWxpemUoJ29wZW5Xb3Jrc3BhY2UudGl0bGUnLCAnT3BlbiBXb3Jrc3BhY2UgZnJvbSBGaWxlJyk7XG5cdFx0Y29uc3QgZmlsdGVyczogRmlsZUZpbHRlcltdID0gW3sgbmFtZTogbmxzLmxvY2FsaXplKCdmaWx0ZXJOYW1lLndvcmtzcGFjZScsICdXb3Jrc3BhY2UnKSwgZXh0ZW5zaW9uczogW1dPUktTUEFDRV9FWFRFTlNJT05dIH1dO1xuXHRcdGNvbnN0IGF2YWlsYWJsZUZpbGVTeXN0ZW1zID0gdGhpcy5hZGRGaWxlU2NoZW1hSWZOZWVkZWQoc2NoZW1hLCB0cnVlKTtcblxuXHRcdGNvbnN0IHVyaXMgPSBhd2FpdCB0aGlzLnBpY2tSZXNvdXJjZSh7IGNhblNlbGVjdEZpbGVzOiB0cnVlLCBjYW5TZWxlY3RGb2xkZXJzOiBmYWxzZSwgY2FuU2VsZWN0TWFueTogZmFsc2UsIGRlZmF1bHRVcmk6IG9wdGlvbnMuZGVmYXVsdFVyaSwgdGl0bGUsIGZpbHRlcnMsIGF2YWlsYWJsZUZpbGVTeXN0ZW1zIH0pO1xuXHRcdGNvbnN0IHVyaSA9IHVyaXM/LlswXTtcblx0XHRpZiAodXJpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5ob3N0U2VydmljZS5vcGVuV2luZG93KFt7IHdvcmtzcGFjZVVyaTogdXJpIH1dLCB7IGZvcmNlTmV3V2luZG93OiBvcHRpb25zLmZvcmNlTmV3V2luZG93LCByZW1vdGVBdXRob3JpdHk6IG9wdGlvbnMucmVtb3RlQXV0aG9yaXR5IH0pO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBwaWNrRmlsZVRvU2F2ZVNpbXBsaWZpZWQoc2NoZW1hOiBzdHJpbmcsIG9wdGlvbnM6IElTYXZlRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFvcHRpb25zLmF2YWlsYWJsZUZpbGVTeXN0ZW1zKSB7XG5cdFx0XHRvcHRpb25zLmF2YWlsYWJsZUZpbGVTeXN0ZW1zID0gdGhpcy5hZGRGaWxlU2NoZW1hSWZOZWVkZWQoc2NoZW1hKTtcblx0XHR9XG5cblx0XHRvcHRpb25zLnRpdGxlID0gbmxzLmxvY2FsaXplKCdzYXZlRmlsZUFzLnRpdGxlJywgJ1NhdmUgQXMnKTtcblx0XHRjb25zdCB1cmkgPSBhd2FpdCB0aGlzLnNhdmVSZW1vdGVSZXNvdXJjZShvcHRpb25zKTtcblxuXHRcdGlmICh1cmkpIHtcblx0XHRcdHRoaXMuYWRkRmlsZVRvUmVjZW50bHlPcGVuZWQodXJpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdXJpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHNob3dTYXZlRGlhbG9nU2ltcGxpZmllZChzY2hlbWE6IHN0cmluZywgb3B0aW9uczogSVNhdmVEaWFsb2dPcHRpb25zKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIW9wdGlvbnMuYXZhaWxhYmxlRmlsZVN5c3RlbXMpIHtcblx0XHRcdG9wdGlvbnMuYXZhaWxhYmxlRmlsZVN5c3RlbXMgPSB0aGlzLmFkZEZpbGVTY2hlbWFJZk5lZWRlZChzY2hlbWEpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnNhdmVSZW1vdGVSZXNvdXJjZShvcHRpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBzaG93T3BlbkRpYWxvZ1NpbXBsaWZpZWQoc2NoZW1hOiBzdHJpbmcsIG9wdGlvbnM6IElPcGVuRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8VVJJW10gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIW9wdGlvbnMuYXZhaWxhYmxlRmlsZVN5c3RlbXMpIHtcblx0XHRcdG9wdGlvbnMuYXZhaWxhYmxlRmlsZVN5c3RlbXMgPSB0aGlzLmFkZEZpbGVTY2hlbWFJZk5lZWRlZChzY2hlbWEsIG9wdGlvbnMuY2FuU2VsZWN0Rm9sZGVycyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucGlja1Jlc291cmNlKG9wdGlvbnMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFNpbXBsZUZpbGVEaWFsb2coKTogSVNpbXBsZUZpbGVEaWFsb2cge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNpbXBsZUZpbGVEaWFsb2cpO1xuXHR9XG5cblx0cHJpdmF0ZSBwaWNrUmVzb3VyY2Uob3B0aW9uczogSU9wZW5EaWFsb2dPcHRpb25zKTogUHJvbWlzZTxVUklbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLmdldFNpbXBsZUZpbGVEaWFsb2coKS5zaG93T3BlbkRpYWxvZyhvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgc2F2ZVJlbW90ZVJlc291cmNlKG9wdGlvbnM6IElTYXZlRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U2ltcGxlRmlsZURpYWxvZygpLnNob3dTYXZlRGlhbG9nKG9wdGlvbnMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyB3aGV0aGVyIHRoZSBnaXZlbiByZXNvdXJjZSBpcyBhIHJlbW90ZSB1c2VyIGRhdGEgZmlsZVxuXHQgKiB0aGF0IHNob3VsZCBub3QgYmUgdXNlZCBhcyBhIGRlZmF1bHQgZmlsZSBkaWFsb2cgcGF0aCBjYW5kaWRhdGUuXG5cdCAqIFRoaXMgY292ZXJzIHJlbW90ZSB1c2VyIGRhdGEgZmlsZXMgc3VjaCBhcyBzZXR0aW5ncy5qc29uLCBrZXliaW5kaW5ncy5qc29uLCBldGMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGlzUmVtb3RlVXNlckRhdGEocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVtb3RlRW52ID0gYXdhaXQgdGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKTtcblx0XHRpZiAocmVtb3RlRW52KSB7XG5cblx0XHRcdGNvbnN0IHJlbW90ZURhdGFIb21lID0gcmVzb3VyY2VzLmRpcm5hbWUocmVzb3VyY2VzLmRpcm5hbWUocmVtb3RlRW52LnNldHRpbmdzUGF0aCkpO1xuXHRcdFx0aWYgKCFyZXNvdXJjZXMuaXNFcXVhbChyZW1vdGVEYXRhSG9tZSwgcmVtb3RlRGF0YUhvbWUud2l0aCh7IHBhdGg6ICcvJyB9KSkgJiYgcmVzb3VyY2VzLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgcmVtb3RlRGF0YUhvbWUpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2NoZW1lRmlsdGVyRm9yV2luZG93KGRlZmF1bHRVcmlTY2hlbWU/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBkZWZhdWx0VXJpU2NoZW1lID8/IHRoaXMucGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QXV0aG9yaXR5RmlsdGVyRm9yV2luZG93KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRGaWxlU3lzdGVtU2NoZW1hKG9wdGlvbnM6IHsgYXZhaWxhYmxlRmlsZVN5c3RlbXM/OiByZWFkb25seSBzdHJpbmdbXTsgZGVmYXVsdFVyaT86IFVSSSB9KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gb3B0aW9ucy5hdmFpbGFibGVGaWxlU3lzdGVtcz8uWzBdIHx8IHRoaXMuZ2V0U2NoZW1lRmlsdGVyRm9yV2luZG93KG9wdGlvbnMuZGVmYXVsdFVyaT8uc2NoZW1lKTtcblx0fVxuXG5cdGFic3RyYWN0IHBpY2tGaWxlRm9sZGVyQW5kT3BlbihvcHRpb25zOiBJUGlja0FuZE9wZW5PcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0YWJzdHJhY3QgcGlja0ZpbGVBbmRPcGVuKG9wdGlvbnM6IElQaWNrQW5kT3Blbk9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRhYnN0cmFjdCBwaWNrRm9sZGVyQW5kT3BlbihvcHRpb25zOiBJUGlja0FuZE9wZW5PcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0YWJzdHJhY3QgcGlja1dvcmtzcGFjZUFuZE9wZW4ob3B0aW9uczogSVBpY2tBbmRPcGVuT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cdHByb3RlY3RlZCBnZXRXb3Jrc3BhY2VBdmFpbGFibGVGaWxlU3lzdGVtcyhvcHRpb25zOiBJUGlja0FuZE9wZW5PcHRpb25zKTogc3RyaW5nW10ge1xuXHRcdGlmIChvcHRpb25zLmF2YWlsYWJsZUZpbGVTeXN0ZW1zICYmIChvcHRpb25zLmF2YWlsYWJsZUZpbGVTeXN0ZW1zLmxlbmd0aCA+IDApKSB7XG5cdFx0XHRyZXR1cm4gb3B0aW9ucy5hdmFpbGFibGVGaWxlU3lzdGVtcztcblx0XHR9XG5cdFx0Y29uc3QgYXZhaWxhYmxlRmlsZVN5c3RlbXMgPSBbU2NoZW1hcy5maWxlXTtcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRhdmFpbGFibGVGaWxlU3lzdGVtcy51bnNoaWZ0KFNjaGVtYXMudnNjb2RlUmVtb3RlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGF2YWlsYWJsZUZpbGVTeXN0ZW1zO1xuXHR9XG5cdGFic3RyYWN0IHNob3dTYXZlRGlhbG9nKG9wdGlvbnM6IElTYXZlRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPjtcblx0YWJzdHJhY3Qgc2hvd09wZW5EaWFsb2cob3B0aW9uczogSU9wZW5EaWFsb2dPcHRpb25zKTogUHJvbWlzZTxVUklbXSB8IHVuZGVmaW5lZD47XG5cblx0YWJzdHJhY3QgcGlja0ZpbGVUb1NhdmUoZGVmYXVsdFVyaTogVVJJLCBhdmFpbGFibGVGaWxlU3lzdGVtcz86IHN0cmluZ1tdKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+O1xuXG5cdHByb3RlY3RlZCBnZXRQaWNrRmlsZVRvU2F2ZURpYWxvZ09wdGlvbnMoZGVmYXVsdFVyaTogVVJJLCBhdmFpbGFibGVGaWxlU3lzdGVtcz86IHN0cmluZ1tdKTogSVNhdmVEaWFsb2dPcHRpb25zIHtcblx0XHRjb25zdCBvcHRpb25zOiBJU2F2ZURpYWxvZ09wdGlvbnMgPSB7XG5cdFx0XHRkZWZhdWx0VXJpLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnc2F2ZUFzVGl0bGUnLCBcIlNhdmUgQXNcIiksXG5cdFx0XHRhdmFpbGFibGVGaWxlU3lzdGVtc1xuXHRcdH07XG5cblx0XHRpbnRlcmZhY2UgSUZpbHRlciB7IG5hbWU6IHN0cmluZzsgZXh0ZW5zaW9uczogc3RyaW5nW10gfVxuXG5cdFx0Ly8gQnVpbGQgdGhlIGZpbGUgZmlsdGVyIGJ5IHVzaW5nIG91ciBrbm93biBsYW5ndWFnZXNcblx0XHRjb25zdCBleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IGRlZmF1bHRVcmkgPyByZXNvdXJjZXMuZXh0bmFtZShkZWZhdWx0VXJpKSA6IHVuZGVmaW5lZDtcblx0XHRsZXQgbWF0Y2hpbmdGaWx0ZXI6IElGaWx0ZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCByZWdpc3RlcmVkTGFuZ3VhZ2VOYW1lcyA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmdldFNvcnRlZFJlZ2lzdGVyZWRMYW5ndWFnZU5hbWVzKCk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZExhbmd1YWdlRmlsdGVyczogSUZpbHRlcltdID0gY29hbGVzY2UocmVnaXN0ZXJlZExhbmd1YWdlTmFtZXMubWFwKCh7IGxhbmd1YWdlTmFtZSwgbGFuZ3VhZ2VJZCB9KSA9PiB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhsYW5ndWFnZUlkKTtcblx0XHRcdGlmICghZXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZpbHRlcjogSUZpbHRlciA9IHsgbmFtZTogbGFuZ3VhZ2VOYW1lLCBleHRlbnNpb25zOiBkaXN0aW5jdChleHRlbnNpb25zKS5zbGljZSgwLCAxMCkubWFwKGUgPT4gdHJpbShlLCAnLicpKSB9O1xuXG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE1ODYwXG5cdFx0XHRjb25zdCBleHRPclBsYWludGV4dCA9IGV4dCB8fCBQTEFJTlRFWFRfRVhURU5TSU9OO1xuXHRcdFx0aWYgKCFtYXRjaGluZ0ZpbHRlciAmJiBleHRlbnNpb25zLmluY2x1ZGVzKGV4dE9yUGxhaW50ZXh0KSkge1xuXHRcdFx0XHRtYXRjaGluZ0ZpbHRlciA9IGZpbHRlcjtcblxuXHRcdFx0XHQvLyBUaGUgc2VsZWN0ZWQgZXh0ZW5zaW9uIG11c3QgYmUgaW4gdGhlIHNldCBvZiBleHRlbnNpb25zIHRoYXQgYXJlIGluIHRoZSBmaWx0ZXIgbGlzdCB0aGF0IGlzIHNlbnQgdG8gdGhlIHNhdmUgZGlhbG9nLlxuXHRcdFx0XHQvLyBJZiBpdCBpc24ndCwgYWRkIGl0IG1hbnVhbGx5LiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTQ3NjU3XG5cdFx0XHRcdGNvbnN0IHRyaW1tZWRFeHQgPSB0cmltKGV4dE9yUGxhaW50ZXh0LCAnLicpO1xuXHRcdFx0XHRpZiAoIWZpbHRlci5leHRlbnNpb25zLmluY2x1ZGVzKHRyaW1tZWRFeHQpKSB7XG5cdFx0XHRcdFx0ZmlsdGVyLmV4dGVuc2lvbnMudW5zaGlmdCh0cmltbWVkRXh0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBudWxsOyAvLyBmaXJzdCBtYXRjaGluZyBmaWx0ZXIgd2lsbCBiZSBhZGRlZCB0byB0aGUgdG9wXG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmaWx0ZXI7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV2UgaGF2ZSBubyBtYXRjaGluZyBmaWx0ZXIsIGUuZy4gYmVjYXVzZSB0aGUgbGFuZ3VhZ2Vcblx0XHQvLyBpcyB1bmtub3duLiBXZSBzdGlsbCBhZGQgdGhlIGV4dGVuc2lvbiB0byB0aGUgbGlzdCBvZlxuXHRcdC8vIGZpbHRlcnMgdGhvdWdoIHNvIHRoYXQgaXQgY2FuIGJlIHBpY2tlZFxuXHRcdC8vIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTYyODMpXG5cdFx0aWYgKCFtYXRjaGluZ0ZpbHRlciAmJiBleHQpIHtcblx0XHRcdG1hdGNoaW5nRmlsdGVyID0geyBuYW1lOiB0cmltKGV4dCwgJy4nKS50b1VwcGVyQ2FzZSgpLCBleHRlbnNpb25zOiBbdHJpbShleHQsICcuJyldIH07XG5cdFx0fVxuXG5cdFx0Ly8gT3JkZXIgb2YgZmlsdGVycyBpc1xuXHRcdC8vIC0gQWxsIEZpbGVzICh3ZSBNVVNUIGRvIHRoaXMgdG8gZml4IG1hY09TIGlzc3VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDI3MTMpXG5cdFx0Ly8gLSBGaWxlIEV4dGVuc2lvbiBNYXRjaCAoaWYgYW55KVxuXHRcdC8vIC0gQWxsIExhbmd1YWdlc1xuXHRcdC8vIC0gTm8gRXh0ZW5zaW9uXG5cdFx0b3B0aW9ucy5maWx0ZXJzID0gY29hbGVzY2UoW1xuXHRcdFx0eyBuYW1lOiBubHMubG9jYWxpemUoJ2FsbEZpbGVzJywgXCJBbGwgRmlsZXNcIiksIGV4dGVuc2lvbnM6IFsnKiddIH0sXG5cdFx0XHRtYXRjaGluZ0ZpbHRlcixcblx0XHRcdC4uLnJlZ2lzdGVyZWRMYW5ndWFnZUZpbHRlcnMsXG5cdFx0XHR7IG5hbWU6IG5scy5sb2NhbGl6ZSgnbm9FeHQnLCBcIk5vIEV4dGVuc2lvblwiKSwgZXh0ZW5zaW9uczogWycnXSB9XG5cdFx0XSk7XG5cblx0XHRyZXR1cm4gb3B0aW9ucztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBMEIsbUJBQW1CLG9CQUFvQjtBQUNqRSxTQUFzRyxnQkFBZ0IsZUFBZSwyQkFBMkI7QUFDaEssU0FBUyxrQkFBa0Isc0JBQXNCLDBCQUEwQixnQkFBZ0IsMkJBQTJCO0FBQ3RILFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0NBQW9DO0FBRTdDLFlBQVksZUFBZTtBQUMzQixTQUFTLGNBQWMscUJBQXFCLGFBQWEsMEJBQTBCO0FBQ25GLFNBQVMsNkJBQThCO0FBQ3ZDLFNBQTRCLHdCQUF3QjtBQUNwRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQjtBQUM3QixPQUFPLGNBQWM7QUFDckIsU0FBUyxVQUFVLGdCQUFnQjtBQUNuQyxTQUFTLFlB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QUFJO0FBRUosVUFBTSwwQkFBMEIsS0FBSyxnQkFBZ0IsaUNBQWlDO0FBQ3RGLFVBQU0sNEJBQXVDLFNBQVMsd0JBQXdCLElBQUksQ0FBQyxFQUFFLGNBQWMsV0FBVyxNQUFNO0FBQ25ILFlBQU0sYUFBYSxLQUFLLGdCQUFnQixjQUFjLFVBQVU7QUFDaEUsVUFBSSxDQUFDLFdBQVcsUUFBUTtBQUN2QixlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU0sU0FBa0IsRUFBRSxNQUFNLGNBQWMsWUFBWSxTQUFTLFVBQVUsRUFBRSxNQUFNLEdBQUcsRUFBRSxFQUFFLElBQUksT0FBSyxLQUFLLEdBQUcsR0FBRyxDQUFDLEVBQUU7QUFHbkgsWUFBTSxpQkFBaUIsT0FBTztBQUM5QixVQUFJLENBQUMsa0JBQWtCLFdBQVcsU0FBUyxjQUFjLEdBQUc7QUFDM0QseUJBQWlCO0FBSWpCLGNBQU0sYUFBYSxLQUFLLGdCQUFnQixHQUFHO0FBQzNDLFlBQUksQ0FBQyxPQUFPLFdBQVcsU0FBUyxVQUFVLEdBQUc7QUFDNUMsaUJBQU8sV0FBVyxRQUFRLFVBQVU7QUFBQSxRQUNyQztBQUVBLGVBQU87QUFBQSxNQUNSO0FBRUEsYUFBTztBQUFBLElBQ1IsQ0FBQyxDQUFDO0FBTUYsUUFBSSxDQUFDLGtCQUFrQixLQUFLO0FBQzNCLHVCQUFpQixFQUFFLE1BQU0sS0FBSyxLQUFLLEdBQUcsRUFBRSxZQUFZLEdBQUcsWUFBWSxDQUFDLEtBQUssS0FBSyxHQUFHLENBQUMsRUFBRTtBQUFBLElBQ3JGO0FBT0EsWUFBUSxVQUFVLFNBQVM7QUFBQSxNQUMxQixFQUFFLE1BQU0sSUFBSSxTQUFTLFlBQVksV0FBVyxHQUFHLFlBQVksQ0FBQyxHQUFHLEVBQUU7QUFBQSxNQUNqRTtBQUFBLE1BQ0EsR0FBRztBQUFBLE1BQ0gsRUFBRSxNQUFNLElBQUksU0FBUyxTQUFTLGNBQWMsR0FBRyxZQUFZLENBQUMsRUFBRSxFQUFFO0FBQUEsSUFDakUsQ0FBQztBQUVELFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFoYXNCLDRCQUFmO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F0Qm1COyIsCiAgIm5hbWVzIjogW10KfQo=
