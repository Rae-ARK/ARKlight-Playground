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
import * as resources from "../../../../base/common/resources.js";
import * as objects from "../../../../base/common/objects.js";
import { IFileService, FileKind, FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from "../../../../platform/files/common/files.js";
import { IQuickInputService, ItemActivation } from "../../../../platform/quickinput/common/quickInput.js";
import { URI } from "../../../../base/common/uri.js";
import { isWindows, OperatingSystem } from "../../../../base/common/platform.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { Schemas } from "../../../../base/common/network.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { equalsIgnoreCase, format, startsWithIgnoreCase } from "../../../../base/common/strings.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { isValidBasename } from "../../../../base/common/extpath.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { createCancelablePromise } from "../../../../base/common/async.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import { SaveReason } from "../../../common/editor.js";
import { IPathService } from "../../path/common/pathService.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { getActiveDocument } from "../../../../base/browser/dom.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
var OpenLocalFileCommand;
((OpenLocalFileCommand2) => {
  OpenLocalFileCommand2.ID = "workbench.action.files.openLocalFile";
  OpenLocalFileCommand2.LABEL = nls.localize("openLocalFile", "Open Local File...");
  function handler() {
    return (accessor) => {
      const dialogService = accessor.get(IFileDialogService);
      return dialogService.pickFileAndOpen({ forceNewWindow: false, availableFileSystems: [Schemas.file] });
    };
  }
  OpenLocalFileCommand2.handler = handler;
})(OpenLocalFileCommand || (OpenLocalFileCommand = {}));
var SaveLocalFileCommand;
((SaveLocalFileCommand2) => {
  SaveLocalFileCommand2.ID = "workbench.action.files.saveLocalFile";
  SaveLocalFileCommand2.LABEL = nls.localize("saveLocalFile", "Save Local File...");
  function handler() {
    return (accessor) => {
      const editorService = accessor.get(IEditorService);
      const activeEditorPane = editorService.activeEditorPane;
      if (activeEditorPane) {
        return editorService.save({ groupId: activeEditorPane.group.id, editor: activeEditorPane.input }, { saveAs: true, availableFileSystems: [Schemas.file], reason: SaveReason.EXPLICIT });
      }
      return Promise.resolve(void 0);
    };
  }
  SaveLocalFileCommand2.handler = handler;
})(SaveLocalFileCommand || (SaveLocalFileCommand = {}));
var OpenLocalFolderCommand;
((OpenLocalFolderCommand2) => {
  OpenLocalFolderCommand2.ID = "workbench.action.files.openLocalFolder";
  OpenLocalFolderCommand2.LABEL = nls.localize("openLocalFolder", "Open Local Folder...");
  function handler() {
    return (accessor) => {
      const dialogService = accessor.get(IFileDialogService);
      return dialogService.pickFolderAndOpen({ forceNewWindow: false, availableFileSystems: [Schemas.file] });
    };
  }
  OpenLocalFolderCommand2.handler = handler;
})(OpenLocalFolderCommand || (OpenLocalFolderCommand = {}));
var OpenLocalFileFolderCommand;
((OpenLocalFileFolderCommand2) => {
  OpenLocalFileFolderCommand2.ID = "workbench.action.files.openLocalFileFolder";
  OpenLocalFileFolderCommand2.LABEL = nls.localize("openLocalFileFolder", "Open Local...");
  function handler() {
    return (accessor) => {
      const dialogService = accessor.get(IFileDialogService);
      return dialogService.pickFileFolderAndOpen({ forceNewWindow: false, availableFileSystems: [Schemas.file] });
    };
  }
  OpenLocalFileFolderCommand2.handler = handler;
})(OpenLocalFileFolderCommand || (OpenLocalFileFolderCommand = {}));
var UpdateResult = /* @__PURE__ */ ((UpdateResult2) => {
  UpdateResult2[UpdateResult2["Updated"] = 0] = "Updated";
  UpdateResult2[UpdateResult2["UpdatedWithTrailing"] = 1] = "UpdatedWithTrailing";
  UpdateResult2[UpdateResult2["Updating"] = 2] = "Updating";
  UpdateResult2[UpdateResult2["NotUpdated"] = 3] = "NotUpdated";
  UpdateResult2[UpdateResult2["InvalidPath"] = 4] = "InvalidPath";
  return UpdateResult2;
})(UpdateResult || {});
const RemoteFileDialogContext = new RawContextKey("remoteFileDialogVisible", false);
let SimpleFileDialog = class extends Disposable {
  constructor(fileService, quickInputService, labelService, workspaceContextService, notificationService, fileDialogService, modelService, languageService, environmentService, remoteAgentService, pathService, keybindingService, contextKeyService, accessibilityService, storageService) {
    super();
    this.fileService = fileService;
    this.quickInputService = quickInputService;
    this.labelService = labelService;
    this.workspaceContextService = workspaceContextService;
    this.notificationService = notificationService;
    this.fileDialogService = fileDialogService;
    this.modelService = modelService;
    this.languageService = languageService;
    this.environmentService = environmentService;
    this.remoteAgentService = remoteAgentService;
    this.pathService = pathService;
    this.keybindingService = keybindingService;
    this.accessibilityService = accessibilityService;
    this.storageService = storageService;
    this.hidden = false;
    this.allowFileSelection = true;
    this.allowFolderSelection = false;
    this.requiresTrailing = false;
    this.userEnteredPathSegment = "";
    this.autoCompletePathSegment = "";
    this.isWindows = false;
    this.separator = "/";
    this.onBusyChangeEmitter = this._register(new Emitter());
    this._showDotFiles = true;
    this.remoteAuthority = this.environmentService.remoteAuthority;
    this.contextKey = RemoteFileDialogContext.bindTo(contextKeyService);
    this.scheme = this.pathService.defaultUriScheme;
    this.getShowDotFiles();
    const disposableStore = this._register(new DisposableStore());
    disposableStore.add(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, "remoteFileDialog.showDotFiles", disposableStore)(async (_) => {
      this.getShowDotFiles();
      this.setButtons();
      const startingValue = this.filePickBox.value;
      const folderValue = this.pathFromUri(this.currentFolder, true);
      this.filePickBox.value = folderValue;
      await this.tryUpdateItems(folderValue, this.currentFolder, true);
      this.filePickBox.value = startingValue;
    }));
  }
  setShowDotFiles(showDotFiles) {
    this.storageService.store("remoteFileDialog.showDotFiles", showDotFiles, StorageScope.WORKSPACE, StorageTarget.USER);
  }
  getShowDotFiles() {
    this._showDotFiles = this.storageService.getBoolean("remoteFileDialog.showDotFiles", StorageScope.WORKSPACE, true);
  }
  set busy(busy) {
    if (this.filePickBox.busy !== busy) {
      this.filePickBox.busy = busy;
      this.onBusyChangeEmitter.fire(busy);
    }
  }
  get busy() {
    return this.filePickBox.busy;
  }
  async showOpenDialog(options = {}) {
    this.scheme = this.getScheme(options.availableFileSystems, options.defaultUri);
    this.scopedAuthority = this.getScopedAuthority(options.defaultUri);
    this.userHome = await this.getUserHome();
    this.trueHome = await this.getUserHome(true);
    const newOptions = this.getOptions(options);
    if (!newOptions) {
      return Promise.resolve(void 0);
    }
    this.options = newOptions;
    const result = await this.pickResource();
    if (Array.isArray(result)) {
      return result;
    }
    return result ? [result] : void 0;
  }
  async showSaveDialog(options) {
    this.scheme = this.getScheme(options.availableFileSystems, options.defaultUri);
    this.scopedAuthority = this.getScopedAuthority(options.defaultUri);
    this.userHome = await this.getUserHome();
    this.trueHome = await this.getUserHome(true);
    this.requiresTrailing = true;
    const newOptions = this.getOptions(options, true);
    if (!newOptions) {
      return Promise.resolve(void 0);
    }
    this.options = newOptions;
    this.options.canSelectFolders = true;
    this.options.canSelectFiles = true;
    return new Promise((resolve) => {
      this.pickResource(true).then((result) => {
        resolve(Array.isArray(result) ? result[0] : result);
      });
    });
  }
  getOptions(options, isSave = false) {
    let defaultUri = void 0;
    let filename = void 0;
    if (options.defaultUri) {
      defaultUri = this.scheme === options.defaultUri.scheme ? options.defaultUri : void 0;
      filename = isSave ? resources.basename(options.defaultUri) : void 0;
    }
    if (!defaultUri) {
      defaultUri = this.userHome;
      if (filename) {
        defaultUri = resources.joinPath(defaultUri, filename);
      }
    }
    if (this.scheme !== Schemas.file && !this.fileService.hasProvider(defaultUri)) {
      this.notificationService.info(nls.localize("remoteFileDialog.notConnectedToRemote", "File system provider for {0} is not available.", defaultUri.toString()));
      return void 0;
    }
    const newOptions = objects.deepClone(options);
    newOptions.defaultUri = defaultUri;
    return newOptions;
  }
  remoteUriFrom(path, hintUri) {
    if (!path.startsWith("\\\\")) {
      path = path.replace(/\\/g, "/");
    }
    if (this.scopedAuthority) {
      return URI.from({ scheme: this.scheme, authority: this.scopedAuthority, path, query: hintUri?.query, fragment: hintUri?.fragment });
    }
    const uri = this.scheme === Schemas.file ? URI.file(path) : URI.from({ scheme: this.scheme, path, query: hintUri?.query, fragment: hintUri?.fragment });
    const authority = uri.scheme === Schemas.file ? void 0 : this.remoteAuthority ?? hintUri?.authority;
    return resources.toLocalResource(
      uri,
      authority,
      // If there is a remote authority, then we should use the system's default URI as the local scheme.
      // If there is *no* remote authority, then we should use the default scheme for this dialog as that is already local.
      authority ? this.pathService.defaultUriScheme : uri.scheme
    );
  }
  getScheme(available, defaultUri) {
    if (available && available.length > 0) {
      if (defaultUri && available.indexOf(defaultUri.scheme) >= 0) {
        return defaultUri.scheme;
      }
      return available[0];
    } else if (defaultUri) {
      return defaultUri.scheme;
    }
    return Schemas.file;
  }
  /**
   * Returns the per-URI authority from {@link defaultUri} if the dialog
   * should be scoped to a specific authority (e.g. `agenthost://host/...`).
   *
   * Returns `undefined` when the authority matches the global
   * {@link remoteAuthority} (standard SSH remotes), since that path is
   * already handled by the existing logic.
   */
  getScopedAuthority(defaultUri) {
    if (defaultUri && defaultUri.scheme === this.scheme && defaultUri.authority && defaultUri.authority !== this.remoteAuthority) {
      return defaultUri.authority;
    }
    return void 0;
  }
  async getRemoteAgentEnvironment() {
    if (this.remoteAgentEnvironment === void 0) {
      this.remoteAgentEnvironment = await this.remoteAgentService.getEnvironment();
    }
    return this.remoteAgentEnvironment;
  }
  getUserHome(trueHome = false) {
    if (this.scopedAuthority) {
      return Promise.resolve(URI.from({ scheme: this.scheme, authority: this.scopedAuthority, path: "/" }));
    }
    return trueHome ? this.pathService.userHome({ preferLocal: this.scheme === Schemas.file }) : this.fileDialogService.preferredHome(this.scheme);
  }
  normalizeUri(uri) {
    uri = resources.addTrailingPathSeparator(uri, this.separator);
    uri = resources.removeTrailingPathSeparator(uri);
    return uri;
  }
  async pickResource(isSave = false) {
    this.allowFolderSelection = !!this.options.canSelectFolders;
    this.allowFileSelection = !!this.options.canSelectFiles;
    this.separator = this.scopedAuthority ? "/" : this.labelService.getSeparator(this.scheme, this.remoteAuthority);
    this.hidden = false;
    this.isWindows = this.scopedAuthority ? false : await this.checkIsWindowsOS();
    let homedir = this.options.defaultUri ? this.options.defaultUri : this.workspaceContextService.getWorkspace().folders[0].uri;
    let stat;
    const ext = resources.extname(homedir);
    if (this.options.defaultUri) {
      try {
        stat = await this.fileService.stat(this.options.defaultUri);
      } catch (e) {
      }
      if (!stat || !stat.isDirectory) {
        homedir = resources.dirname(this.options.defaultUri);
        this.trailing = resources.basename(this.options.defaultUri);
      }
    }
    return new Promise((resolve) => {
      this.filePickBox = this._register(this.quickInputService.createQuickPick());
      this.busy = true;
      this.filePickBox.matchOnLabel = false;
      this.filePickBox.sortByLabel = false;
      this.filePickBox.ignoreFocusOut = true;
      this.filePickBox.placeholder = nls.localize("remoteFileDialog.placeholder", "Folder path");
      this.filePickBox.ok = true;
      this.filePickBox.okLabel = typeof this.options.openLabel === "string" ? this.options.openLabel : this.options.openLabel?.withoutMnemonic;
      if (this.scheme !== Schemas.file && this.options && this.options.availableFileSystems && this.options.availableFileSystems.length > 1 && this.options.availableFileSystems.indexOf(Schemas.file) > -1) {
        this.filePickBox.customButton = true;
        this.filePickBox.customLabel = nls.localize("remoteFileDialog.local", "Show Local");
        this.filePickBox.customButtonSecondary = true;
        let action;
        if (isSave) {
          action = SaveLocalFileCommand;
        } else {
          action = this.allowFileSelection ? this.allowFolderSelection ? OpenLocalFileFolderCommand : OpenLocalFileCommand : OpenLocalFolderCommand;
        }
        const keybinding = this.keybindingService.lookupKeybinding(action.ID);
        if (keybinding) {
          const label = keybinding.getLabel();
          if (label) {
            this.filePickBox.customHover = format("{0} ({1})", action.LABEL, label);
          }
        }
      }
      this.setButtons();
      this._register(this.filePickBox.onDidTriggerButton((e) => {
        this.setShowDotFiles(!this._showDotFiles);
      }));
      let isResolving = 0;
      let isAcceptHandled = false;
      this.currentFolder = resources.dirname(homedir);
      this.userEnteredPathSegment = "";
      this.autoCompletePathSegment = "";
      this.filePickBox.title = this.options.title;
      this.filePickBox.value = this.pathFromUri(this.currentFolder, true);
      this.filePickBox.valueSelection = [this.filePickBox.value.length, this.filePickBox.value.length];
      const doResolve = (uriOrUris) => {
        if (uriOrUris) {
          if (Array.isArray(uriOrUris)) {
            uriOrUris = uriOrUris.map((uri) => this.normalizeUri(uri));
          } else {
            uriOrUris = this.normalizeUri(uriOrUris);
          }
        }
        resolve(uriOrUris);
        this.contextKey.set(false);
        this.dispose();
      };
      this._register(this.filePickBox.onDidCustom(() => {
        if (isAcceptHandled || this.busy) {
          return;
        }
        isAcceptHandled = true;
        isResolving++;
        if (this.options.availableFileSystems && this.options.availableFileSystems.length > 1) {
          this.options.availableFileSystems = this.options.availableFileSystems.slice(1);
        }
        this.filePickBox.hide();
        if (isSave) {
          return this.fileDialogService.showSaveDialog(this.options).then((result) => {
            doResolve(result);
          });
        } else {
          return this.fileDialogService.showOpenDialog(this.options).then((result) => {
            doResolve(result);
          });
        }
      }));
      const busyDisposable = this._register(new MutableDisposable());
      const handleAccept = () => {
        if (this.busy) {
          busyDisposable.value = this.onBusyChangeEmitter.event((busy) => {
            if (!busy) {
              handleAccept();
            }
          });
          return;
        } else if (isAcceptHandled) {
          return;
        }
        isAcceptHandled = true;
        isResolving++;
        this.onDidAccept().then((resolveValue) => {
          if (resolveValue) {
            this.filePickBox.hide();
            doResolve(resolveValue);
          } else if (this.hidden) {
            doResolve(void 0);
          } else {
            isResolving--;
            isAcceptHandled = false;
          }
        });
      };
      this._register(this.filePickBox.onDidAccept((_) => {
        handleAccept();
      }));
      this._register(this.filePickBox.onDidChangeActive((i) => {
        isAcceptHandled = false;
        if (i.length === 1 && this.isSelectionChangeFromUser()) {
          this.filePickBox.validationMessage = void 0;
          const userPath = this.constructFullUserPath();
          if (!equalsIgnoreCase(this.filePickBox.value.substring(0, userPath.length), userPath)) {
            this.filePickBox.valueSelection = [0, this.filePickBox.value.length];
            this.insertText(userPath, userPath);
          }
          this.setAutoComplete(userPath, this.userEnteredPathSegment, i[0], true);
        }
      }));
      this._register(this.filePickBox.onDidChangeValue(async (value) => {
        return this.handleValueChange(value);
      }));
      this._register(this.filePickBox.onDidHide(() => {
        this.hidden = true;
        if (isResolving === 0) {
          doResolve(void 0);
        }
      }));
      this.filePickBox.show();
      this.contextKey.set(true);
      this.updateItems(homedir, true, this.trailing).then(() => {
        if (this.trailing) {
          this.filePickBox.valueSelection = [this.filePickBox.value.length - this.trailing.length, this.filePickBox.value.length - ext.length];
        } else {
          this.filePickBox.valueSelection = [this.filePickBox.value.length, this.filePickBox.value.length];
        }
        this.busy = false;
      });
    });
  }
  async handleValueChange(value) {
    try {
      if (this.isValueChangeFromUser()) {
        if (!equalsIgnoreCase(value, this.constructFullUserPath()) && (!this.isBadSubpath(value) || this.canTildaEscapeHatch(value))) {
          this.filePickBox.validationMessage = void 0;
          const filePickBoxUri = this.filePickBoxValue();
          let updated = 3 /* NotUpdated */;
          if (!resources.extUriIgnorePathCase.isEqual(this.currentFolder, filePickBoxUri)) {
            updated = await this.tryUpdateItems(value, filePickBoxUri);
          }
          if (updated === 3 /* NotUpdated */ || updated === 1 /* UpdatedWithTrailing */) {
            this.setActiveItems(value);
          }
        } else {
          this.filePickBox.activeItems = [];
          this.userEnteredPathSegment = "";
        }
      }
    } catch {
    }
  }
  setButtons() {
    this.filePickBox.buttons = [{
      iconClass: this._showDotFiles ? ThemeIcon.asClassName(Codicon.eye) : ThemeIcon.asClassName(Codicon.eyeClosed),
      tooltip: this._showDotFiles ? nls.localize("remoteFileDialog.hideDotFiles", "Hide dot files") : nls.localize("remoteFileDialog.showDotFiles", "Show dot files"),
      alwaysVisible: true
    }];
  }
  isBadSubpath(value) {
    return this.badPath && value.length > this.badPath.length && equalsIgnoreCase(value.substring(0, this.badPath.length), this.badPath);
  }
  isValueChangeFromUser() {
    if (equalsIgnoreCase(this.filePickBox.value, this.pathAppend(this.currentFolder, this.userEnteredPathSegment + this.autoCompletePathSegment))) {
      return false;
    }
    return true;
  }
  isSelectionChangeFromUser() {
    if (this.activeItem === (this.filePickBox.activeItems ? this.filePickBox.activeItems[0] : void 0)) {
      return false;
    }
    return true;
  }
  constructFullUserPath() {
    const currentFolderPath = this.pathFromUri(this.currentFolder);
    if (equalsIgnoreCase(this.filePickBox.value.substr(0, this.userEnteredPathSegment.length), this.userEnteredPathSegment)) {
      if (equalsIgnoreCase(this.filePickBox.value.substr(0, currentFolderPath.length), currentFolderPath)) {
        return currentFolderPath;
      } else {
        return this.userEnteredPathSegment;
      }
    } else {
      return this.pathAppend(this.currentFolder, this.userEnteredPathSegment);
    }
  }
  filePickBoxValue() {
    const directUri = this.remoteUriFrom(this.filePickBox.value.trimRight(), this.currentFolder);
    const currentPath = this.pathFromUri(this.currentFolder);
    if (equalsIgnoreCase(this.filePickBox.value, currentPath)) {
      return this.currentFolder;
    }
    const currentDisplayUri = this.remoteUriFrom(currentPath, this.currentFolder);
    const relativePath = resources.relativePath(currentDisplayUri, directUri);
    const isSameRoot = this.filePickBox.value.length > 1 && currentPath.length > 1 ? equalsIgnoreCase(this.filePickBox.value.substr(0, 2), currentPath.substr(0, 2)) : false;
    if (relativePath && isSameRoot) {
      let path = resources.joinPath(this.currentFolder, relativePath);
      const directBasename = resources.basename(directUri);
      if (directBasename === "." || directBasename === "..") {
        path = this.remoteUriFrom(this.pathAppend(path, directBasename), this.currentFolder);
      }
      return resources.hasTrailingPathSeparator(directUri) ? resources.addTrailingPathSeparator(path) : path;
    } else {
      return directUri;
    }
  }
  async onDidAccept() {
    this.busy = true;
    if (!this.updatingPromise && this.filePickBox.activeItems.length === 1) {
      const item = this.filePickBox.selectedItems[0];
      if (item.isFolder) {
        if (this.trailing) {
          await this.updateItems(item.uri, true, this.trailing);
        } else {
          const newPath = this.pathFromUri(item.uri);
          if (startsWithIgnoreCase(newPath, this.filePickBox.value) && equalsIgnoreCase(item.label, resources.basename(item.uri))) {
            this.filePickBox.valueSelection = [this.pathFromUri(this.currentFolder).length, this.filePickBox.value.length];
            this.insertText(newPath, this.basenameWithTrailingSlash(item.uri));
          } else if (item.label === ".." && startsWithIgnoreCase(this.filePickBox.value, newPath)) {
            this.filePickBox.valueSelection = [newPath.length, this.filePickBox.value.length];
            this.insertText(newPath, "");
          } else {
            await this.updateItems(item.uri, true);
          }
        }
        this.filePickBox.busy = false;
        return;
      }
    } else if (!this.updatingPromise) {
      if (await this.tryUpdateItems(this.filePickBox.value, this.filePickBoxValue()) !== 3 /* NotUpdated */) {
        this.filePickBox.busy = false;
        return;
      }
    }
    let resolveValue;
    if (this.filePickBox.activeItems.length === 0) {
      resolveValue = this.filePickBoxValue();
    } else if (this.filePickBox.activeItems.length === 1) {
      resolveValue = this.filePickBox.selectedItems[0].uri;
    }
    if (resolveValue) {
      resolveValue = this.addPostfix(resolveValue);
    }
    if (await this.validate(resolveValue)) {
      this.busy = false;
      return resolveValue;
    }
    this.busy = false;
    return void 0;
  }
  root(value) {
    let lastDir = value;
    let dir = resources.dirname(value);
    while (!resources.isEqual(lastDir, dir)) {
      lastDir = dir;
      dir = resources.dirname(dir);
    }
    return dir;
  }
  canTildaEscapeHatch(value) {
    return !!(value.endsWith("~") && this.isBadSubpath(value));
  }
  tildaReplace(value) {
    const home = this.trueHome;
    if (value.length > 0 && value[0] === "~") {
      return resources.joinPath(home, value.substring(1));
    } else if (this.canTildaEscapeHatch(value)) {
      return home;
    }
    return this.remoteUriFrom(value);
  }
  tryAddTrailingSeparatorToDirectory(uri, stat) {
    if (stat.isDirectory) {
      if (!this.endsWithSlash(uri.path)) {
        return resources.addTrailingPathSeparator(uri);
      }
    }
    return uri;
  }
  async tryUpdateItems(value, valueUri, reset = false) {
    if (value.length > 0 && (value[0] === "~" || this.canTildaEscapeHatch(value))) {
      const newDir = this.tildaReplace(value);
      return await this.updateItems(newDir, true) ? 1 /* UpdatedWithTrailing */ : 0 /* Updated */;
    } else if (value === "\\") {
      valueUri = this.root(this.currentFolder);
      value = this.pathFromUri(valueUri);
      return await this.updateItems(valueUri, true) ? 1 /* UpdatedWithTrailing */ : 0 /* Updated */;
    } else {
      const newFolderIsOldFolder = resources.extUriIgnorePathCase.isEqual(this.currentFolder, valueUri);
      const newFolderIsSubFolder = resources.extUriIgnorePathCase.isEqual(this.currentFolder, resources.dirname(valueUri));
      const newFolderIsParent = resources.extUriIgnorePathCase.isEqualOrParent(this.currentFolder, resources.dirname(valueUri));
      const newFolderIsUnrelated = !newFolderIsParent && !newFolderIsSubFolder;
      if (!newFolderIsOldFolder && (this.endsWithSlash(value) || newFolderIsParent || newFolderIsUnrelated) || reset) {
        let stat;
        try {
          stat = await this.fileService.stat(valueUri);
        } catch (e) {
        }
        if (stat?.isDirectory && resources.basename(valueUri) !== "." && this.endsWithSlash(value)) {
          valueUri = this.tryAddTrailingSeparatorToDirectory(valueUri, stat);
          return await this.updateItems(valueUri) ? 1 /* UpdatedWithTrailing */ : 0 /* Updated */;
        } else if (this.endsWithSlash(value)) {
          this.filePickBox.validationMessage = nls.localize("remoteFileDialog.badPath", "The path does not exist. Use ~ to go to your home directory.");
          this.badPath = value;
          return 4 /* InvalidPath */;
        } else {
          let inputUriDirname = resources.dirname(valueUri);
          const currentFolderWithoutSep = resources.removeTrailingPathSeparator(resources.addTrailingPathSeparator(this.currentFolder));
          const inputUriDirnameWithoutSep = resources.removeTrailingPathSeparator(resources.addTrailingPathSeparator(inputUriDirname));
          if (!resources.extUriIgnorePathCase.isEqual(currentFolderWithoutSep, inputUriDirnameWithoutSep) && (!/^[a-zA-Z]:$/.test(this.filePickBox.value) || !equalsIgnoreCase(this.pathFromUri(this.currentFolder).substring(0, this.filePickBox.value.length), this.filePickBox.value))) {
            let statWithoutTrailing;
            try {
              statWithoutTrailing = await this.fileService.stat(inputUriDirname);
            } catch (e) {
            }
            if (statWithoutTrailing?.isDirectory) {
              this.badPath = void 0;
              inputUriDirname = this.tryAddTrailingSeparatorToDirectory(inputUriDirname, statWithoutTrailing);
              return await this.updateItems(inputUriDirname, false, resources.basename(valueUri)) ? 1 /* UpdatedWithTrailing */ : 0 /* Updated */;
            }
          }
        }
      }
    }
    this.badPath = void 0;
    return 3 /* NotUpdated */;
  }
  tryUpdateTrailing(value) {
    const ext = resources.extname(value);
    if (this.trailing && ext) {
      this.trailing = resources.basename(value);
    }
  }
  setActiveItems(value) {
    value = this.pathFromUri(this.tildaReplace(value));
    const asUri = this.remoteUriFrom(value);
    const inputBasename = resources.basename(asUri);
    const userPath = this.constructFullUserPath();
    const pathsEqual = equalsIgnoreCase(userPath, value.substring(0, userPath.length)) || equalsIgnoreCase(value, userPath.substring(0, value.length));
    if (pathsEqual) {
      let hasMatch = false;
      for (let i = 0; i < this.filePickBox.items.length; i++) {
        const item = this.filePickBox.items[i];
        if (this.setAutoComplete(value, inputBasename, item)) {
          hasMatch = true;
          break;
        }
      }
      if (!hasMatch) {
        const userBasename = inputBasename.length >= 2 ? userPath.substring(userPath.length - inputBasename.length + 2) : "";
        this.userEnteredPathSegment = userBasename === inputBasename ? inputBasename : "";
        this.autoCompletePathSegment = "";
        this.filePickBox.activeItems = [];
        this.tryUpdateTrailing(asUri);
      }
    } else {
      this.userEnteredPathSegment = inputBasename;
      this.autoCompletePathSegment = "";
      this.filePickBox.activeItems = [];
      this.tryUpdateTrailing(asUri);
    }
  }
  setAutoComplete(startingValue, startingBasename, quickPickItem, force = false) {
    if (this.busy) {
      this.userEnteredPathSegment = startingBasename;
      this.autoCompletePathSegment = "";
      return false;
    }
    const itemBasename = quickPickItem.label;
    if (itemBasename === "..") {
      this.userEnteredPathSegment = "";
      this.autoCompletePathSegment = "";
      this.activeItem = quickPickItem;
      if (force) {
        getActiveDocument().execCommand("insertText", false, "");
      }
      return false;
    } else if (!force && itemBasename.length >= startingBasename.length && equalsIgnoreCase(itemBasename.substr(0, startingBasename.length), startingBasename)) {
      this.userEnteredPathSegment = startingBasename;
      this.activeItem = quickPickItem;
      this.autoCompletePathSegment = "";
      if (quickPickItem.isFolder || !this.trailing) {
        this.filePickBox.activeItems = [quickPickItem];
      } else {
        this.filePickBox.activeItems = [];
      }
      return true;
    } else if (force && !equalsIgnoreCase(this.basenameWithTrailingSlash(quickPickItem.uri), this.userEnteredPathSegment + this.autoCompletePathSegment)) {
      this.userEnteredPathSegment = "";
      if (!this.accessibilityService.isScreenReaderOptimized()) {
        this.autoCompletePathSegment = this.trimTrailingSlash(itemBasename);
      }
      this.activeItem = quickPickItem;
      if (!this.accessibilityService.isScreenReaderOptimized()) {
        this.filePickBox.valueSelection = [this.pathFromUri(this.currentFolder, true).length, this.filePickBox.value.length];
        this.insertText(this.pathAppend(this.currentFolder, this.autoCompletePathSegment), this.autoCompletePathSegment);
        this.filePickBox.valueSelection = [this.filePickBox.value.length - this.autoCompletePathSegment.length, this.filePickBox.value.length];
      }
      return true;
    } else {
      this.userEnteredPathSegment = startingBasename;
      this.autoCompletePathSegment = "";
      return false;
    }
  }
  insertText(wholeValue, insertText) {
    if (this.filePickBox.inputHasFocus()) {
      getActiveDocument().execCommand("insertText", false, insertText);
      if (this.filePickBox.value !== wholeValue) {
        this.filePickBox.value = wholeValue;
        this.handleValueChange(wholeValue);
      }
    } else {
      this.filePickBox.value = wholeValue;
      this.handleValueChange(wholeValue);
    }
  }
  addPostfix(uri) {
    let result = uri;
    if (this.requiresTrailing && this.options.filters && this.options.filters.length > 0 && !resources.hasTrailingPathSeparator(uri)) {
      let hasExt = false;
      const currentExt = resources.extname(uri).substr(1);
      for (let i = 0; i < this.options.filters.length; i++) {
        for (let j = 0; j < this.options.filters[i].extensions.length; j++) {
          if (this.options.filters[i].extensions[j] === "*" || this.options.filters[i].extensions[j] === currentExt) {
            hasExt = true;
            break;
          }
        }
        if (hasExt) {
          break;
        }
      }
      if (!hasExt) {
        result = resources.joinPath(resources.dirname(uri), resources.basename(uri) + "." + this.options.filters[0].extensions[0]);
      }
    }
    return result;
  }
  trimTrailingSlash(path) {
    return path.length > 1 && this.endsWithSlash(path) ? path.substr(0, path.length - 1) : path;
  }
  yesNoPrompt(uri, message) {
    const disposableStore = new DisposableStore();
    const prompt = disposableStore.add(this.quickInputService.createQuickPick());
    prompt.title = message;
    prompt.ignoreFocusOut = true;
    prompt.ok = true;
    prompt.customButton = true;
    prompt.customLabel = nls.localize("remoteFileDialog.cancel", "Cancel");
    prompt.customButtonSecondary = true;
    prompt.value = this.pathFromUri(uri);
    let isResolving = false;
    return new Promise((resolve) => {
      disposableStore.add(prompt.onDidAccept(() => {
        isResolving = true;
        prompt.hide();
        resolve(true);
      }));
      disposableStore.add(prompt.onDidHide(() => {
        if (!isResolving) {
          resolve(false);
          this.filePickBox.show();
          const currentItems = this.filePickBox.items;
          this.filePickBox.items = currentItems;
        }
        this.hidden = false;
        disposableStore.dispose();
      }));
      disposableStore.add(prompt.onDidChangeValue(() => {
        prompt.hide();
      }));
      disposableStore.add(prompt.onDidCustom(() => {
        prompt.hide();
      }));
      prompt.show();
    });
  }
  async validate(uri) {
    if (uri === void 0) {
      this.filePickBox.validationMessage = nls.localize("remoteFileDialog.invalidPath", "Please enter a valid path.");
      return Promise.resolve(false);
    }
    let stat;
    let statDirname;
    try {
      statDirname = await this.fileService.stat(resources.dirname(uri));
      stat = await this.fileService.stat(uri);
    } catch (e) {
    }
    if (this.requiresTrailing) {
      if (stat?.isDirectory) {
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.validateFolder", "The folder already exists. Please use a new file name.");
        return false;
      } else if (stat) {
        const message = nls.localize("remoteFileDialog.validateExisting", "{0} already exists. Are you sure you want to overwrite it?", resources.basename(uri));
        return this.yesNoPrompt(uri, message);
      } else if (!isValidBasename(resources.basename(uri), this.isWindows)) {
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.validateBadFilename", "Please enter a valid file name.");
        return false;
      } else if (!statDirname) {
        const message = nls.localize("remoteFileDialog.validateCreateDirectory", "The folder {0} does not exist. Would you like to create it?", resources.basename(resources.dirname(uri)));
        return this.yesNoPrompt(uri, message);
      } else if (!statDirname.isDirectory) {
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.validateNonexistentDir", "Please enter a path that exists.");
        return false;
      } else if (statDirname.readonly) {
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.validateReadonlyFolder", "This folder cannot be used as a save destination. Please choose another folder");
        return false;
      }
    } else {
      if (!stat) {
        if (this.allowFolderSelection && !this.allowFileSelection && await this.canCreateFolder(uri, statDirname)) {
          const message = nls.localize("remoteFileDialog.validateCreateDirectoryOpen", "The folder {0} does not exist. Would you like to create it?", resources.basename(uri));
          const shouldCreate = await this.yesNoPrompt(uri, message);
          if (!shouldCreate) {
            return false;
          }
          try {
            await this.fileService.createFolder(uri);
            return true;
          } catch (e) {
            this.filePickBox.validationMessage = nls.localize("remoteFileDialog.createFolderFailed", "Could not create folder: {0}", e.message);
            return false;
          }
        }
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.validateNonexistentDir", "Please enter a path that exists.");
        return false;
      } else if (uri.path === "/" && this.isWindows) {
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.windowsDriveLetter", "Please start the path with a drive letter.");
        return false;
      } else if (stat.isDirectory && !this.allowFolderSelection) {
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.validateFileOnly", "Please select a file.");
        return false;
      } else if (!stat.isDirectory && !this.allowFileSelection) {
        this.filePickBox.validationMessage = nls.localize("remoteFileDialog.validateFolderOnly", "Please select a folder.");
        return false;
      }
    }
    return true;
  }
  async canCreateFolder(uri, parentStat) {
    const immediateParent = resources.dirname(uri);
    let candidate = uri;
    while (true) {
      const name = resources.basename(candidate);
      if (!name || !isValidBasename(name, this.isWindows)) {
        return false;
      }
      const parent = resources.dirname(candidate);
      if (resources.isEqual(parent, candidate)) {
        return false;
      }
      try {
        const stat = parentStat && resources.isEqual(parent, immediateParent) ? parentStat : await this.fileService.stat(parent);
        return stat.isDirectory && !stat.readonly;
      } catch (e) {
        if (toFileSystemProviderErrorCode(e instanceof Error ? e : void 0) !== FileSystemProviderErrorCode.FileNotFound) {
          return false;
        }
        candidate = parent;
      }
    }
  }
  // Returns true if there is a file at the end of the URI.
  async updateItems(newFolder, force = false, trailing) {
    this.busy = true;
    this.autoCompletePathSegment = "";
    const wasDotDot = trailing === "..";
    trailing = wasDotDot ? void 0 : trailing;
    const isSave = !!trailing;
    let result = false;
    const updatingPromise = createCancelablePromise(async (token) => {
      let folderStat;
      try {
        folderStat = await this.fileService.resolve(newFolder);
        if (!folderStat.isDirectory) {
          trailing = resources.basename(newFolder);
          newFolder = resources.dirname(newFolder);
          folderStat = void 0;
          result = true;
        }
      } catch (e) {
      }
      const newValue = trailing ? this.pathAppend(newFolder, trailing) : this.pathFromUri(newFolder, true);
      const currentFolder = this.endsWithSlash(newFolder.path) ? newFolder : resources.addTrailingPathSeparator(newFolder, this.separator);
      const userEnteredPathSegment = trailing ? trailing : "";
      return this.createItems(folderStat, currentFolder, token).then((items) => {
        if (token.isCancellationRequested) {
          this.busy = false;
          return false;
        }
        this.currentFolder = currentFolder;
        this.userEnteredPathSegment = userEnteredPathSegment;
        this.filePickBox.itemActivation = ItemActivation.NONE;
        this.filePickBox.items = items;
        if (!equalsIgnoreCase(this.filePickBox.value, newValue) && (force || wasDotDot)) {
          this.filePickBox.valueSelection = [0, this.filePickBox.value.length];
          this.insertText(newValue, newValue);
        }
        if (force && trailing && isSave) {
          this.filePickBox.valueSelection = [this.filePickBox.value.length - trailing.length, this.filePickBox.value.length - trailing.length];
        } else if (!trailing) {
          this.filePickBox.valueSelection = [this.filePickBox.value.length, this.filePickBox.value.length];
        }
        this.busy = false;
        this.updatingPromise = void 0;
        return result;
      });
    });
    if (this.updatingPromise !== void 0) {
      this.updatingPromise.cancel();
    }
    this.updatingPromise = updatingPromise;
    return updatingPromise;
  }
  pathFromUri(uri, endWithSeparator = false) {
    let result;
    if (this.scopedAuthority) {
      result = uri.path.replace(/\n/g, "");
    } else {
      result = normalizeDriveLetter(uri.fsPath, this.isWindows).replace(/\n/g, "");
    }
    if (this.separator === "/") {
      result = result.replace(/\\/g, this.separator);
    } else {
      result = result.replace(/\//g, this.separator);
    }
    if (endWithSeparator && !this.endsWithSlash(result)) {
      result = result + this.separator;
    }
    return result;
  }
  pathAppend(uri, additional) {
    if (additional === ".." || additional === ".") {
      const basePath = this.pathFromUri(uri, true);
      return basePath + additional;
    } else {
      return this.pathFromUri(resources.joinPath(uri, additional));
    }
  }
  async checkIsWindowsOS() {
    let isWindowsOS = isWindows;
    const env = await this.getRemoteAgentEnvironment();
    if (env) {
      isWindowsOS = env.os === OperatingSystem.Windows;
    }
    return isWindowsOS;
  }
  endsWithSlash(s) {
    return /[\/\\]$/.test(s);
  }
  basenameWithTrailingSlash(fullPath) {
    const child = this.pathFromUri(fullPath, true);
    const parent = this.pathFromUri(resources.dirname(fullPath), true);
    return child.substring(parent.length);
  }
  async createBackItem(currFolder) {
    const compareScheme = this.scopedAuthority ? this.scheme : Schemas.file;
    const compareAuthority = this.scopedAuthority ?? "";
    const fileRepresentationCurr = currFolder.with({ scheme: compareScheme, authority: compareAuthority });
    const fileRepresentationParent = resources.dirname(fileRepresentationCurr);
    if (!resources.isEqual(fileRepresentationCurr, fileRepresentationParent)) {
      const parentFolder = resources.dirname(currFolder);
      if (await this.fileService.exists(parentFolder)) {
        return { label: "..", uri: resources.addTrailingPathSeparator(parentFolder, this.separator), isFolder: true };
      }
    }
    return void 0;
  }
  async createItems(folder, currentFolder, token) {
    const result = [];
    const backDir = await this.createBackItem(currentFolder);
    try {
      if (!folder) {
        folder = await this.fileService.resolve(currentFolder);
      }
      const filteredChildren = this._showDotFiles ? folder.children : folder.children?.filter((child) => !child.name.startsWith("."));
      const items = filteredChildren ? await Promise.all(filteredChildren.map((child) => this.createItem(child, currentFolder, token))) : [];
      for (const item of items) {
        if (item) {
          result.push(item);
        }
      }
    } catch (e) {
      console.log(e);
    }
    if (token.isCancellationRequested) {
      return [];
    }
    const sorted = result.sort((i1, i2) => {
      if (i1.isFolder !== i2.isFolder) {
        return i1.isFolder ? -1 : 1;
      }
      const trimmed1 = this.endsWithSlash(i1.label) ? i1.label.substr(0, i1.label.length - 1) : i1.label;
      const trimmed2 = this.endsWithSlash(i2.label) ? i2.label.substr(0, i2.label.length - 1) : i2.label;
      return trimmed1.localeCompare(trimmed2);
    });
    if (backDir) {
      sorted.unshift(backDir);
    }
    return sorted;
  }
  filterFile(file) {
    if (this.options.filters) {
      for (let i = 0; i < this.options.filters.length; i++) {
        for (let j = 0; j < this.options.filters[i].extensions.length; j++) {
          const testExt = this.options.filters[i].extensions[j];
          if (testExt === "*" || file.path.endsWith("." + testExt)) {
            return true;
          }
        }
      }
      return false;
    }
    return true;
  }
  async createItem(stat, parent, token) {
    if (token.isCancellationRequested) {
      return void 0;
    }
    let fullPath = resources.joinPath(parent, stat.name);
    if (stat.isDirectory) {
      const filename = resources.basename(fullPath);
      fullPath = resources.addTrailingPathSeparator(fullPath, this.separator);
      return { label: filename, uri: fullPath, isFolder: true, iconClasses: getIconClasses(this.modelService, this.languageService, fullPath || void 0, FileKind.FOLDER) };
    } else if (!stat.isDirectory && this.allowFileSelection && this.filterFile(fullPath)) {
      return { label: stat.name, uri: fullPath, isFolder: false, iconClasses: getIconClasses(this.modelService, this.languageService, fullPath || void 0) };
    }
    return void 0;
  }
};
SimpleFileDialog = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IFileDialogService),
  __decorateParam(6, IModelService),
  __decorateParam(7, ILanguageService),
  __decorateParam(8, IWorkbenchEnvironmentService),
  __decorateParam(9, IRemoteAgentService),
  __decorateParam(10, IPathService),
  __decorateParam(11, IKeybindingService),
  __decorateParam(12, IContextKeyService),
  __decorateParam(13, IAccessibilityService),
  __decorateParam(14, IStorageService)
], SimpleFileDialog);
export {
  OpenLocalFileCommand,
  OpenLocalFileFolderCommand,
  OpenLocalFolderCommand,
  RemoteFileDialogContext,
  SaveLocalFileCommand,
  SimpleFileDialog
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9kaWFsb2dzL2Jyb3dzZXIvc2ltcGxlRmlsZURpYWxvZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXQsIEZpbGVLaW5kLCBJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUsIHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2ssIEl0ZW1BY3RpdmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzLCBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJU2F2ZURpYWxvZ09wdGlvbnMsIElPcGVuRGlhbG9nT3B0aW9ucywgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBJQ29udGV4dEtleSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgZXF1YWxzSWdub3JlQ2FzZSwgZm9ybWF0LCBzdGFydHNXaXRoSWdub3JlQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBpc1ZhbGlkQmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgQ2FuY2VsYWJsZVByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplRHJpdmVMZXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgU2F2ZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVEb2N1bWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuXG5leHBvcnQgbmFtZXNwYWNlIE9wZW5Mb2NhbEZpbGVDb21tYW5kIHtcblx0ZXhwb3J0IGNvbnN0IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMub3BlbkxvY2FsRmlsZSc7XG5cdGV4cG9ydCBjb25zdCBMQUJFTCA9IG5scy5sb2NhbGl6ZSgnb3BlbkxvY2FsRmlsZScsIFwiT3BlbiBMb2NhbCBGaWxlLi4uXCIpO1xuXHRleHBvcnQgZnVuY3Rpb24gaGFuZGxlcigpOiBJQ29tbWFuZEhhbmRsZXIge1xuXHRcdHJldHVybiBhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlRGlhbG9nU2VydmljZSk7XG5cdFx0XHRyZXR1cm4gZGlhbG9nU2VydmljZS5waWNrRmlsZUFuZE9wZW4oeyBmb3JjZU5ld1dpbmRvdzogZmFsc2UsIGF2YWlsYWJsZUZpbGVTeXN0ZW1zOiBbU2NoZW1hcy5maWxlXSB9KTtcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgU2F2ZUxvY2FsRmlsZUNvbW1hbmQge1xuXHRleHBvcnQgY29uc3QgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5zYXZlTG9jYWxGaWxlJztcblx0ZXhwb3J0IGNvbnN0IExBQkVMID0gbmxzLmxvY2FsaXplKCdzYXZlTG9jYWxGaWxlJywgXCJTYXZlIExvY2FsIEZpbGUuLi5cIik7XG5cdGV4cG9ydCBmdW5jdGlvbiBoYW5kbGVyKCk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdGlmIChhY3RpdmVFZGl0b3JQYW5lKSB7XG5cdFx0XHRcdHJldHVybiBlZGl0b3JTZXJ2aWNlLnNhdmUoeyBncm91cElkOiBhY3RpdmVFZGl0b3JQYW5lLmdyb3VwLmlkLCBlZGl0b3I6IGFjdGl2ZUVkaXRvclBhbmUuaW5wdXQgfSwgeyBzYXZlQXM6IHRydWUsIGF2YWlsYWJsZUZpbGVTeXN0ZW1zOiBbU2NoZW1hcy5maWxlXSwgcmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lUIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE9wZW5Mb2NhbEZvbGRlckNvbW1hbmQge1xuXHRleHBvcnQgY29uc3QgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5vcGVuTG9jYWxGb2xkZXInO1xuXHRleHBvcnQgY29uc3QgTEFCRUwgPSBubHMubG9jYWxpemUoJ29wZW5Mb2NhbEZvbGRlcicsIFwiT3BlbiBMb2NhbCBGb2xkZXIuLi5cIik7XG5cdGV4cG9ydCBmdW5jdGlvbiBoYW5kbGVyKCk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdHJldHVybiBkaWFsb2dTZXJ2aWNlLnBpY2tGb2xkZXJBbmRPcGVuKHsgZm9yY2VOZXdXaW5kb3c6IGZhbHNlLCBhdmFpbGFibGVGaWxlU3lzdGVtczogW1NjaGVtYXMuZmlsZV0gfSk7XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE9wZW5Mb2NhbEZpbGVGb2xkZXJDb21tYW5kIHtcblx0ZXhwb3J0IGNvbnN0IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMub3BlbkxvY2FsRmlsZUZvbGRlcic7XG5cdGV4cG9ydCBjb25zdCBMQUJFTCA9IG5scy5sb2NhbGl6ZSgnb3BlbkxvY2FsRmlsZUZvbGRlcicsIFwiT3BlbiBMb2NhbC4uLlwiKTtcblx0ZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZXIoKTogSUNvbW1hbmRIYW5kbGVyIHtcblx0XHRyZXR1cm4gYWNjZXNzb3IgPT4ge1xuXHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZURpYWxvZ1NlcnZpY2UpO1xuXHRcdFx0cmV0dXJuIGRpYWxvZ1NlcnZpY2UucGlja0ZpbGVGb2xkZXJBbmRPcGVuKHsgZm9yY2VOZXdXaW5kb3c6IGZhbHNlLCBhdmFpbGFibGVGaWxlU3lzdGVtczogW1NjaGVtYXMuZmlsZV0gfSk7XG5cdFx0fTtcblx0fVxufVxuXG5pbnRlcmZhY2UgRmlsZVF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHVyaTogVVJJO1xuXHRpc0ZvbGRlcjogYm9vbGVhbjtcbn1cblxuZW51bSBVcGRhdGVSZXN1bHQge1xuXHRVcGRhdGVkLFxuXHRVcGRhdGVkV2l0aFRyYWlsaW5nLFxuXHRVcGRhdGluZyxcblx0Tm90VXBkYXRlZCxcblx0SW52YWxpZFBhdGhcbn1cblxuZXhwb3J0IGNvbnN0IFJlbW90ZUZpbGVEaWFsb2dDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3JlbW90ZUZpbGVEaWFsb2dWaXNpYmxlJywgZmFsc2UpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTaW1wbGVGaWxlRGlhbG9nIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRzaG93T3BlbkRpYWxvZyhvcHRpb25zOiBJT3BlbkRpYWxvZ09wdGlvbnMpOiBQcm9taXNlPFVSSVtdIHwgdW5kZWZpbmVkPjtcblx0c2hvd1NhdmVEaWFsb2cob3B0aW9uczogSVNhdmVEaWFsb2dPcHRpb25zKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+O1xufVxuXG5leHBvcnQgY2xhc3MgU2ltcGxlRmlsZURpYWxvZyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2ltcGxlRmlsZURpYWxvZyB7XG5cdHByaXZhdGUgb3B0aW9ucyE6IElPcGVuRGlhbG9nT3B0aW9ucztcblx0cHJpdmF0ZSBjdXJyZW50Rm9sZGVyITogVVJJO1xuXHRwcml2YXRlIGZpbGVQaWNrQm94ITogSVF1aWNrUGljazxGaWxlUXVpY2tQaWNrSXRlbT47XG5cdHByaXZhdGUgaGlkZGVuOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgYWxsb3dGaWxlU2VsZWN0aW9uOiBib29sZWFuID0gdHJ1ZTtcblx0cHJpdmF0ZSBhbGxvd0ZvbGRlclNlbGVjdGlvbjogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlbW90ZUF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlcXVpcmVzVHJhaWxpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSB0cmFpbGluZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcm90ZWN0ZWQgc2NoZW1lOiBzdHJpbmc7XG5cdHByaXZhdGUgY29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgdXNlckVudGVyZWRQYXRoU2VnbWVudDogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgYXV0b0NvbXBsZXRlUGF0aFNlZ21lbnQ6IHN0cmluZyA9ICcnO1xuXHRwcml2YXRlIGFjdGl2ZUl0ZW06IEZpbGVRdWlja1BpY2tJdGVtIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHVzZXJIb21lITogVVJJO1xuXHRwcml2YXRlIHRydWVIb21lITogVVJJO1xuXHRwcml2YXRlIGlzV2luZG93czogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGJhZFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZW1vdGVBZ2VudEVudmlyb25tZW50OiBJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2VwYXJhdG9yOiBzdHJpbmcgPSAnLyc7XG5cblx0LyoqXG5cdCAqIFdoZW4gc2V0LCB0aGUgZGlhbG9nIGlzIHNjb3BlZCB0byBhIHNwZWNpZmljIFVSSSBhdXRob3JpdHkgKGUuZy5cblx0ICogZm9yIGJyb3dzaW5nIGFuIGBhZ2VudGhvc3Q6Ly97YXV0aG9yaXR5fS8uLi5gIGZpbGVzeXN0ZW0gdGhhdFxuXHQgKiB1c2VzIHBlci1jb25uZWN0aW9uIGF1dGhvcml0aWVzIHJhdGhlciB0aGFuIHRoZSBnbG9iYWxcblx0ICoge0BsaW5rIHJlbW90ZUF1dGhvcml0eX0pLlxuXHQgKi9cblx0cHJpdmF0ZSBzY29wZWRBdXRob3JpdHk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBvbkJ1c3lDaGFuZ2VFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHByaXZhdGUgdXBkYXRpbmdQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTxib29sZWFuPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9zaG93RG90RmlsZXM6IGJvb2xlYW4gPSB0cnVlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlbW90ZUF1dGhvcml0eSA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHR0aGlzLmNvbnRleHRLZXkgPSBSZW1vdGVGaWxlRGlhbG9nQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2NoZW1lID0gdGhpcy5wYXRoU2VydmljZS5kZWZhdWx0VXJpU2NoZW1lO1xuXG5cdFx0dGhpcy5nZXRTaG93RG90RmlsZXMoKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsICdyZW1vdGVGaWxlRGlhbG9nLnNob3dEb3RGaWxlcycsIGRpc3Bvc2FibGVTdG9yZSkoYXN5bmMgXyA9PiB7XG5cdFx0XHR0aGlzLmdldFNob3dEb3RGaWxlcygpO1xuXHRcdFx0dGhpcy5zZXRCdXR0b25zKCk7XG5cdFx0XHRjb25zdCBzdGFydGluZ1ZhbHVlID0gdGhpcy5maWxlUGlja0JveC52YWx1ZTtcblx0XHRcdGNvbnN0IGZvbGRlclZhbHVlID0gdGhpcy5wYXRoRnJvbVVyaSh0aGlzLmN1cnJlbnRGb2xkZXIsIHRydWUpO1xuXHRcdFx0dGhpcy5maWxlUGlja0JveC52YWx1ZSA9IGZvbGRlclZhbHVlO1xuXHRcdFx0YXdhaXQgdGhpcy50cnlVcGRhdGVJdGVtcyhmb2xkZXJWYWx1ZSwgdGhpcy5jdXJyZW50Rm9sZGVyLCB0cnVlKTtcblx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsdWUgPSBzdGFydGluZ1ZhbHVlO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0U2hvd0RvdEZpbGVzKHNob3dEb3RGaWxlczogYm9vbGVhbikge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3JlbW90ZUZpbGVEaWFsb2cuc2hvd0RvdEZpbGVzJywgc2hvd0RvdEZpbGVzLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTaG93RG90RmlsZXMoKSB7XG5cdFx0dGhpcy5fc2hvd0RvdEZpbGVzID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdyZW1vdGVGaWxlRGlhbG9nLnNob3dEb3RGaWxlcycsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIHRydWUpO1xuXHR9XG5cblx0c2V0IGJ1c3koYnVzeTogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLmZpbGVQaWNrQm94LmJ1c3kgIT09IGJ1c3kpIHtcblx0XHRcdHRoaXMuZmlsZVBpY2tCb3guYnVzeSA9IGJ1c3k7XG5cdFx0XHR0aGlzLm9uQnVzeUNoYW5nZUVtaXR0ZXIuZmlyZShidXN5KTtcblx0XHR9XG5cdH1cblxuXHRnZXQgYnVzeSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5maWxlUGlja0JveC5idXN5O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHNob3dPcGVuRGlhbG9nKG9wdGlvbnM6IElPcGVuRGlhbG9nT3B0aW9ucyA9IHt9KTogUHJvbWlzZTxVUklbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuc2NoZW1lID0gdGhpcy5nZXRTY2hlbWUob3B0aW9ucy5hdmFpbGFibGVGaWxlU3lzdGVtcywgb3B0aW9ucy5kZWZhdWx0VXJpKTtcblx0XHR0aGlzLnNjb3BlZEF1dGhvcml0eSA9IHRoaXMuZ2V0U2NvcGVkQXV0aG9yaXR5KG9wdGlvbnMuZGVmYXVsdFVyaSk7XG5cdFx0dGhpcy51c2VySG9tZSA9IGF3YWl0IHRoaXMuZ2V0VXNlckhvbWUoKTtcblx0XHR0aGlzLnRydWVIb21lID0gYXdhaXQgdGhpcy5nZXRVc2VySG9tZSh0cnVlKTtcblx0XHRjb25zdCBuZXdPcHRpb25zID0gdGhpcy5nZXRPcHRpb25zKG9wdGlvbnMpO1xuXHRcdGlmICghbmV3T3B0aW9ucykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0XHR0aGlzLm9wdGlvbnMgPSBuZXdPcHRpb25zO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucGlja1Jlc291cmNlKCk7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkocmVzdWx0KSkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdCA/IFtyZXN1bHRdIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHNob3dTYXZlRGlhbG9nKG9wdGlvbnM6IElTYXZlRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5zY2hlbWUgPSB0aGlzLmdldFNjaGVtZShvcHRpb25zLmF2YWlsYWJsZUZpbGVTeXN0ZW1zLCBvcHRpb25zLmRlZmF1bHRVcmkpO1xuXHRcdHRoaXMuc2NvcGVkQXV0aG9yaXR5ID0gdGhpcy5nZXRTY29wZWRBdXRob3JpdHkob3B0aW9ucy5kZWZhdWx0VXJpKTtcblx0XHR0aGlzLnVzZXJIb21lID0gYXdhaXQgdGhpcy5nZXRVc2VySG9tZSgpO1xuXHRcdHRoaXMudHJ1ZUhvbWUgPSBhd2FpdCB0aGlzLmdldFVzZXJIb21lKHRydWUpO1xuXHRcdHRoaXMucmVxdWlyZXNUcmFpbGluZyA9IHRydWU7XG5cdFx0Y29uc3QgbmV3T3B0aW9ucyA9IHRoaXMuZ2V0T3B0aW9ucyhvcHRpb25zLCB0cnVlKTtcblx0XHRpZiAoIW5ld09wdGlvbnMpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0dGhpcy5vcHRpb25zID0gbmV3T3B0aW9ucztcblx0XHR0aGlzLm9wdGlvbnMuY2FuU2VsZWN0Rm9sZGVycyA9IHRydWU7XG5cdFx0dGhpcy5vcHRpb25zLmNhblNlbGVjdEZpbGVzID0gdHJ1ZTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+KChyZXNvbHZlKSA9PiB7XG5cdFx0XHR0aGlzLnBpY2tSZXNvdXJjZSh0cnVlKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdHJlc29sdmUoQXJyYXkuaXNBcnJheShyZXN1bHQpID8gcmVzdWx0WzBdIDogcmVzdWx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRPcHRpb25zKG9wdGlvbnM6IElTYXZlRGlhbG9nT3B0aW9ucyB8IElPcGVuRGlhbG9nT3B0aW9ucywgaXNTYXZlOiBib29sZWFuID0gZmFsc2UpOiBJT3BlbkRpYWxvZ09wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdGxldCBkZWZhdWx0VXJpOiBVUkkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGZpbGVuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKG9wdGlvbnMuZGVmYXVsdFVyaSkge1xuXHRcdFx0ZGVmYXVsdFVyaSA9ICh0aGlzLnNjaGVtZSA9PT0gb3B0aW9ucy5kZWZhdWx0VXJpLnNjaGVtZSkgPyBvcHRpb25zLmRlZmF1bHRVcmkgOiB1bmRlZmluZWQ7XG5cdFx0XHRmaWxlbmFtZSA9IGlzU2F2ZSA/IHJlc291cmNlcy5iYXNlbmFtZShvcHRpb25zLmRlZmF1bHRVcmkpIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIWRlZmF1bHRVcmkpIHtcblx0XHRcdGRlZmF1bHRVcmkgPSB0aGlzLnVzZXJIb21lO1xuXHRcdFx0aWYgKGZpbGVuYW1lKSB7XG5cdFx0XHRcdGRlZmF1bHRVcmkgPSByZXNvdXJjZXMuam9pblBhdGgoZGVmYXVsdFVyaSwgZmlsZW5hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoKHRoaXMuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpICYmICF0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKGRlZmF1bHRVcmkpKSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhubHMubG9jYWxpemUoJ3JlbW90ZUZpbGVEaWFsb2cubm90Q29ubmVjdGVkVG9SZW1vdGUnLCAnRmlsZSBzeXN0ZW0gcHJvdmlkZXIgZm9yIHswfSBpcyBub3QgYXZhaWxhYmxlLicsIGRlZmF1bHRVcmkudG9TdHJpbmcoKSkpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbmV3T3B0aW9uczogSU9wZW5EaWFsb2dPcHRpb25zID0gb2JqZWN0cy5kZWVwQ2xvbmUob3B0aW9ucyk7XG5cdFx0bmV3T3B0aW9ucy5kZWZhdWx0VXJpID0gZGVmYXVsdFVyaTtcblx0XHRyZXR1cm4gbmV3T3B0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgcmVtb3RlVXJpRnJvbShwYXRoOiBzdHJpbmcsIGhpbnRVcmk/OiBVUkkpOiBVUkkge1xuXHRcdGlmICghcGF0aC5zdGFydHNXaXRoKCdcXFxcXFxcXCcpKSB7XG5cdFx0XHRwYXRoID0gcGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG5cdFx0fVxuXHRcdC8vIFdoZW4gc2NvcGVkIHRvIGEgc3BlY2lmaWMgYXV0aG9yaXR5IChlLmcuIGFnZW50aG9zdDovL2hvc3QvLi4uKSxcblx0XHQvLyBjb25zdHJ1Y3QgdGhlIFVSSSBkaXJlY3RseSB3aXRoIHRoZSBhdXRob3JpdHkgdG8gYXZvaWRcblx0XHQvLyB0b0xvY2FsUmVzb3VyY2Ugc3RyaXBwaW5nIG9yIHJlcGxhY2luZyBpdC5cblx0XHRpZiAodGhpcy5zY29wZWRBdXRob3JpdHkpIHtcblx0XHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogdGhpcy5zY2hlbWUsIGF1dGhvcml0eTogdGhpcy5zY29wZWRBdXRob3JpdHksIHBhdGgsIHF1ZXJ5OiBoaW50VXJpPy5xdWVyeSwgZnJhZ21lbnQ6IGhpbnRVcmk/LmZyYWdtZW50IH0pO1xuXHRcdH1cblx0XHRjb25zdCB1cmk6IFVSSSA9IHRoaXMuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgPyBVUkkuZmlsZShwYXRoKSA6IFVSSS5mcm9tKHsgc2NoZW1lOiB0aGlzLnNjaGVtZSwgcGF0aCwgcXVlcnk6IGhpbnRVcmk/LnF1ZXJ5LCBmcmFnbWVudDogaGludFVyaT8uZnJhZ21lbnQgfSk7XG5cdFx0Ly8gSWYgdGhlIGRlZmF1bHQgc2NoZW1lIGlzIGZpbGUsIHRoZW4gd2UgZG9uJ3QgY2FyZSBhYm91dCB0aGUgcmVtb3RlIGF1dGhvcml0eSBvciB0aGUgaGludCBhdXRob3JpdHlcblx0XHRjb25zdCBhdXRob3JpdHkgPSAodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSA/IHVuZGVmaW5lZCA6ICh0aGlzLnJlbW90ZUF1dGhvcml0eSA/PyBoaW50VXJpPy5hdXRob3JpdHkpO1xuXHRcdHJldHVybiByZXNvdXJjZXMudG9Mb2NhbFJlc291cmNlKHVyaSwgYXV0aG9yaXR5LFxuXHRcdFx0Ly8gSWYgdGhlcmUgaXMgYSByZW1vdGUgYXV0aG9yaXR5LCB0aGVuIHdlIHNob3VsZCB1c2UgdGhlIHN5c3RlbSdzIGRlZmF1bHQgVVJJIGFzIHRoZSBsb2NhbCBzY2hlbWUuXG5cdFx0XHQvLyBJZiB0aGVyZSBpcyAqbm8qIHJlbW90ZSBhdXRob3JpdHksIHRoZW4gd2Ugc2hvdWxkIHVzZSB0aGUgZGVmYXVsdCBzY2hlbWUgZm9yIHRoaXMgZGlhbG9nIGFzIHRoYXQgaXMgYWxyZWFkeSBsb2NhbC5cblx0XHRcdGF1dGhvcml0eSA/IHRoaXMucGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZSA6IHVyaS5zY2hlbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTY2hlbWUoYXZhaWxhYmxlOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgZGVmYXVsdFVyaTogVVJJIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRpZiAoYXZhaWxhYmxlICYmIGF2YWlsYWJsZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAoZGVmYXVsdFVyaSAmJiAoYXZhaWxhYmxlLmluZGV4T2YoZGVmYXVsdFVyaS5zY2hlbWUpID49IDApKSB7XG5cdFx0XHRcdHJldHVybiBkZWZhdWx0VXJpLnNjaGVtZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhdmFpbGFibGVbMF07XG5cdFx0fSBlbHNlIGlmIChkZWZhdWx0VXJpKSB7XG5cdFx0XHRyZXR1cm4gZGVmYXVsdFVyaS5zY2hlbWU7XG5cdFx0fVxuXHRcdHJldHVybiBTY2hlbWFzLmZpbGU7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgcGVyLVVSSSBhdXRob3JpdHkgZnJvbSB7QGxpbmsgZGVmYXVsdFVyaX0gaWYgdGhlIGRpYWxvZ1xuXHQgKiBzaG91bGQgYmUgc2NvcGVkIHRvIGEgc3BlY2lmaWMgYXV0aG9yaXR5IChlLmcuIGBhZ2VudGhvc3Q6Ly9ob3N0Ly4uLmApLlxuXHQgKlxuXHQgKiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gdGhlIGF1dGhvcml0eSBtYXRjaGVzIHRoZSBnbG9iYWxcblx0ICoge0BsaW5rIHJlbW90ZUF1dGhvcml0eX0gKHN0YW5kYXJkIFNTSCByZW1vdGVzKSwgc2luY2UgdGhhdCBwYXRoIGlzXG5cdCAqIGFscmVhZHkgaGFuZGxlZCBieSB0aGUgZXhpc3RpbmcgbG9naWMuXG5cdCAqL1xuXHRwcml2YXRlIGdldFNjb3BlZEF1dGhvcml0eShkZWZhdWx0VXJpOiBVUkkgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChkZWZhdWx0VXJpXG5cdFx0XHQmJiBkZWZhdWx0VXJpLnNjaGVtZSA9PT0gdGhpcy5zY2hlbWVcblx0XHRcdCYmIGRlZmF1bHRVcmkuYXV0aG9yaXR5XG5cdFx0XHQmJiBkZWZhdWx0VXJpLmF1dGhvcml0eSAhPT0gdGhpcy5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdHJldHVybiBkZWZhdWx0VXJpLmF1dGhvcml0eTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0UmVtb3RlQWdlbnRFbnZpcm9ubWVudCgpOiBQcm9taXNlPElSZW1vdGVBZ2VudEVudmlyb25tZW50IHwgbnVsbD4ge1xuXHRcdGlmICh0aGlzLnJlbW90ZUFnZW50RW52aXJvbm1lbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5yZW1vdGVBZ2VudEVudmlyb25tZW50ID0gYXdhaXQgdGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMucmVtb3RlQWdlbnRFbnZpcm9ubWVudDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRVc2VySG9tZSh0cnVlSG9tZSA9IGZhbHNlKTogUHJvbWlzZTxVUkk+IHtcblx0XHQvLyBXaGVuIHNjb3BlZCB0byBhIGN1c3RvbSBhdXRob3JpdHksIHRoZSBwbGF0Zm9ybSB1c2VySG9tZSBpcyBub3Rcblx0XHQvLyBtZWFuaW5nZnVsIChpdCB3b3VsZCByZXR1cm4gYSBsb2NhbCBmaWxlOi8vIHBhdGgpLiBVc2UgdGhlIHJvb3Rcblx0XHQvLyBvZiB0aGUgc2NvcGVkIGZpbGVzeXN0ZW0gYXMgdGhlIGhvbWUgZGlyZWN0b3J5IGluc3RlYWQuXG5cdFx0aWYgKHRoaXMuc2NvcGVkQXV0aG9yaXR5KSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFVSSS5mcm9tKHsgc2NoZW1lOiB0aGlzLnNjaGVtZSwgYXV0aG9yaXR5OiB0aGlzLnNjb3BlZEF1dGhvcml0eSwgcGF0aDogJy8nIH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWVIb21lXG5cdFx0XHQ/IHRoaXMucGF0aFNlcnZpY2UudXNlckhvbWUoeyBwcmVmZXJMb2NhbDogdGhpcy5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSB9KVxuXHRcdFx0OiB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnByZWZlcnJlZEhvbWUodGhpcy5zY2hlbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBub3JtYWxpemVVcmkodXJpOiBVUkkpOiBVUkkge1xuXHRcdHVyaSA9IHJlc291cmNlcy5hZGRUcmFpbGluZ1BhdGhTZXBhcmF0b3IodXJpLCB0aGlzLnNlcGFyYXRvcik7IC8vIEVuc3VyZXMgdGhhdCBjOiBpcyBjOi8gc2luY2UgdGhpcyBjb21lcyBmcm9tIHVzZXIgaW5wdXQgYW5kIGNhbiBiZSBpbmNvcnJlY3QuXG5cdFx0Ly8gVG8gYmUgY29uc2lzdGVudCwgd2Ugc2hvdWxkIG5ldmVyIGhhdmUgYSB0cmFpbGluZyBwYXRoIHNlcGFyYXRvciBvbiBkaXJlY3RvcmllcyAob3IgYW55dGhpbmcgZWxzZSkuIFdpbGwgbm90IHJlbW92ZSBmcm9tIGM6Ly5cblx0XHR1cmkgPSByZXNvdXJjZXMucmVtb3ZlVHJhaWxpbmdQYXRoU2VwYXJhdG9yKHVyaSk7XG5cdFx0cmV0dXJuIHVyaTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcGlja1Jlc291cmNlKGlzU2F2ZTogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxVUklbXSB8IFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuYWxsb3dGb2xkZXJTZWxlY3Rpb24gPSAhIXRoaXMub3B0aW9ucy5jYW5TZWxlY3RGb2xkZXJzO1xuXHRcdHRoaXMuYWxsb3dGaWxlU2VsZWN0aW9uID0gISF0aGlzLm9wdGlvbnMuY2FuU2VsZWN0RmlsZXM7XG5cdFx0dGhpcy5zZXBhcmF0b3IgPSB0aGlzLnNjb3BlZEF1dGhvcml0eSA/ICcvJyA6IHRoaXMubGFiZWxTZXJ2aWNlLmdldFNlcGFyYXRvcih0aGlzLnNjaGVtZSwgdGhpcy5yZW1vdGVBdXRob3JpdHkpO1xuXHRcdHRoaXMuaGlkZGVuID0gZmFsc2U7XG5cdFx0dGhpcy5pc1dpbmRvd3MgPSB0aGlzLnNjb3BlZEF1dGhvcml0eSA/IGZhbHNlIDogYXdhaXQgdGhpcy5jaGVja0lzV2luZG93c09TKCk7XG5cdFx0bGV0IGhvbWVkaXI6IFVSSSA9IHRoaXMub3B0aW9ucy5kZWZhdWx0VXJpID8gdGhpcy5vcHRpb25zLmRlZmF1bHRVcmkgOiB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF0udXJpO1xuXHRcdGxldCBzdGF0OiBJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGV4dDogc3RyaW5nID0gcmVzb3VyY2VzLmV4dG5hbWUoaG9tZWRpcik7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5kZWZhdWx0VXJpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5zdGF0KHRoaXMub3B0aW9ucy5kZWZhdWx0VXJpKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gVGhlIGZpbGUgb3IgZm9sZGVyIGRvZXNuJ3QgZXhpc3Rcblx0XHRcdH1cblx0XHRcdGlmICghc3RhdCB8fCAhc3RhdC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRob21lZGlyID0gcmVzb3VyY2VzLmRpcm5hbWUodGhpcy5vcHRpb25zLmRlZmF1bHRVcmkpO1xuXHRcdFx0XHR0aGlzLnRyYWlsaW5nID0gcmVzb3VyY2VzLmJhc2VuYW1lKHRoaXMub3B0aW9ucy5kZWZhdWx0VXJpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8VVJJW10gfCBVUkkgfCB1bmRlZmluZWQ+KChyZXNvbHZlKSA9PiB7XG5cdFx0XHR0aGlzLmZpbGVQaWNrQm94ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8RmlsZVF1aWNrUGlja0l0ZW0+KCkpO1xuXHRcdFx0dGhpcy5idXN5ID0gdHJ1ZTtcblx0XHRcdHRoaXMuZmlsZVBpY2tCb3gubWF0Y2hPbkxhYmVsID0gZmFsc2U7XG5cdFx0XHR0aGlzLmZpbGVQaWNrQm94LnNvcnRCeUxhYmVsID0gZmFsc2U7XG5cdFx0XHR0aGlzLmZpbGVQaWNrQm94Lmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRcdHRoaXMuZmlsZVBpY2tCb3gucGxhY2Vob2xkZXIgPSBubHMubG9jYWxpemUoJ3JlbW90ZUZpbGVEaWFsb2cucGxhY2Vob2xkZXInLCBcIkZvbGRlciBwYXRoXCIpO1xuXHRcdFx0dGhpcy5maWxlUGlja0JveC5vayA9IHRydWU7XG5cdFx0XHR0aGlzLmZpbGVQaWNrQm94Lm9rTGFiZWwgPSB0eXBlb2YgdGhpcy5vcHRpb25zLm9wZW5MYWJlbCA9PT0gJ3N0cmluZycgPyB0aGlzLm9wdGlvbnMub3BlbkxhYmVsIDogdGhpcy5vcHRpb25zLm9wZW5MYWJlbD8ud2l0aG91dE1uZW1vbmljO1xuXHRcdFx0aWYgKCh0aGlzLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSAmJiB0aGlzLm9wdGlvbnMgJiYgdGhpcy5vcHRpb25zLmF2YWlsYWJsZUZpbGVTeXN0ZW1zICYmICh0aGlzLm9wdGlvbnMuYXZhaWxhYmxlRmlsZVN5c3RlbXMubGVuZ3RoID4gMSkgJiYgKHRoaXMub3B0aW9ucy5hdmFpbGFibGVGaWxlU3lzdGVtcy5pbmRleE9mKFNjaGVtYXMuZmlsZSkgPiAtMSkpIHtcblx0XHRcdFx0dGhpcy5maWxlUGlja0JveC5jdXN0b21CdXR0b24gPSB0cnVlO1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LmN1c3RvbUxhYmVsID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLmxvY2FsJywgJ1Nob3cgTG9jYWwnKTtcblx0XHRcdFx0dGhpcy5maWxlUGlja0JveC5jdXN0b21CdXR0b25TZWNvbmRhcnkgPSB0cnVlO1xuXHRcdFx0XHRsZXQgYWN0aW9uO1xuXHRcdFx0XHRpZiAoaXNTYXZlKSB7XG5cdFx0XHRcdFx0YWN0aW9uID0gU2F2ZUxvY2FsRmlsZUNvbW1hbmQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YWN0aW9uID0gdGhpcy5hbGxvd0ZpbGVTZWxlY3Rpb24gPyAodGhpcy5hbGxvd0ZvbGRlclNlbGVjdGlvbiA/IE9wZW5Mb2NhbEZpbGVGb2xkZXJDb21tYW5kIDogT3BlbkxvY2FsRmlsZUNvbW1hbmQpIDogT3BlbkxvY2FsRm9sZGVyQ29tbWFuZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5JRCk7XG5cdFx0XHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBrZXliaW5kaW5nLmdldExhYmVsKCk7XG5cdFx0XHRcdFx0aWYgKGxhYmVsKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LmN1c3RvbUhvdmVyID0gZm9ybWF0KCd7MH0gKHsxfSknLCBhY3Rpb24uTEFCRUwsIGxhYmVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zZXRCdXR0b25zKCk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVQaWNrQm94Lm9uRGlkVHJpZ2dlckJ1dHRvbihlID0+IHtcblx0XHRcdFx0dGhpcy5zZXRTaG93RG90RmlsZXMoIXRoaXMuX3Nob3dEb3RGaWxlcyk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGxldCBpc1Jlc29sdmluZzogbnVtYmVyID0gMDtcblx0XHRcdGxldCBpc0FjY2VwdEhhbmRsZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuY3VycmVudEZvbGRlciA9IHJlc291cmNlcy5kaXJuYW1lKGhvbWVkaXIpO1xuXHRcdFx0dGhpcy51c2VyRW50ZXJlZFBhdGhTZWdtZW50ID0gJyc7XG5cdFx0XHR0aGlzLmF1dG9Db21wbGV0ZVBhdGhTZWdtZW50ID0gJyc7XG5cblx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudGl0bGUgPSB0aGlzLm9wdGlvbnMudGl0bGU7XG5cdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbHVlID0gdGhpcy5wYXRoRnJvbVVyaSh0aGlzLmN1cnJlbnRGb2xkZXIsIHRydWUpO1xuXHRcdFx0dGhpcy5maWxlUGlja0JveC52YWx1ZVNlbGVjdGlvbiA9IFt0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aCwgdGhpcy5maWxlUGlja0JveC52YWx1ZS5sZW5ndGhdO1xuXG5cdFx0XHRjb25zdCBkb1Jlc29sdmUgPSAodXJpT3JVcmlzOiBVUkkgfCBVUklbXSB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRpZiAodXJpT3JVcmlzKSB7XG5cdFx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkodXJpT3JVcmlzKSkge1xuXHRcdFx0XHRcdFx0dXJpT3JVcmlzID0gdXJpT3JVcmlzLm1hcCh1cmkgPT4gdGhpcy5ub3JtYWxpemVVcmkodXJpKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHVyaU9yVXJpcyA9IHRoaXMubm9ybWFsaXplVXJpKHVyaU9yVXJpcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc29sdmUodXJpT3JVcmlzKTtcblx0XHRcdFx0dGhpcy5jb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlUGlja0JveC5vbkRpZEN1c3RvbSgoKSA9PiB7XG5cdFx0XHRcdGlmIChpc0FjY2VwdEhhbmRsZWQgfHwgdGhpcy5idXN5KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aXNBY2NlcHRIYW5kbGVkID0gdHJ1ZTtcblx0XHRcdFx0aXNSZXNvbHZpbmcrKztcblx0XHRcdFx0aWYgKHRoaXMub3B0aW9ucy5hdmFpbGFibGVGaWxlU3lzdGVtcyAmJiAodGhpcy5vcHRpb25zLmF2YWlsYWJsZUZpbGVTeXN0ZW1zLmxlbmd0aCA+IDEpKSB7XG5cdFx0XHRcdFx0dGhpcy5vcHRpb25zLmF2YWlsYWJsZUZpbGVTeXN0ZW1zID0gdGhpcy5vcHRpb25zLmF2YWlsYWJsZUZpbGVTeXN0ZW1zLnNsaWNlKDEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3guaGlkZSgpO1xuXHRcdFx0XHRpZiAoaXNTYXZlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd1NhdmVEaWFsb2codGhpcy5vcHRpb25zKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdFx0XHRkb1Jlc29sdmUocmVzdWx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh0aGlzLm9wdGlvbnMpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0XHRcdGRvUmVzb2x2ZShyZXN1bHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IGJ1c3lEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdFx0Y29uc3QgaGFuZGxlQWNjZXB0ID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5idXN5KSB7XG5cdFx0XHRcdFx0Ly8gU2F2ZSB0aGUgYWNjZXB0IHVudGlsIHRoZSBmaWxlIHBpY2tlciBpcyBub3QgYnVzeS5cblx0XHRcdFx0XHRidXN5RGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMub25CdXN5Q2hhbmdlRW1pdHRlci5ldmVudCgoYnVzeTogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFidXN5KSB7XG5cdFx0XHRcdFx0XHRcdGhhbmRsZUFjY2VwdCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBlbHNlIGlmIChpc0FjY2VwdEhhbmRsZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpc0FjY2VwdEhhbmRsZWQgPSB0cnVlO1xuXHRcdFx0XHRpc1Jlc29sdmluZysrO1xuXHRcdFx0XHR0aGlzLm9uRGlkQWNjZXB0KCkudGhlbihyZXNvbHZlVmFsdWUgPT4ge1xuXHRcdFx0XHRcdGlmIChyZXNvbHZlVmFsdWUpIHtcblx0XHRcdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3guaGlkZSgpO1xuXHRcdFx0XHRcdFx0ZG9SZXNvbHZlKHJlc29sdmVWYWx1ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLmhpZGRlbikge1xuXHRcdFx0XHRcdFx0ZG9SZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlzUmVzb2x2aW5nLS07XG5cdFx0XHRcdFx0XHRpc0FjY2VwdEhhbmRsZWQgPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlUGlja0JveC5vbkRpZEFjY2VwdChfID0+IHtcblx0XHRcdFx0aGFuZGxlQWNjZXB0KCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVBpY2tCb3gub25EaWRDaGFuZ2VBY3RpdmUoaSA9PiB7XG5cdFx0XHRcdGlzQWNjZXB0SGFuZGxlZCA9IGZhbHNlO1xuXHRcdFx0XHQvLyB1cGRhdGUgaW5wdXQgYm94IHRvIG1hdGNoIHRoZSBmaXJzdCBzZWxlY3RlZCBpdGVtXG5cdFx0XHRcdGlmICgoaS5sZW5ndGggPT09IDEpICYmIHRoaXMuaXNTZWxlY3Rpb25DaGFuZ2VGcm9tVXNlcigpKSB7XG5cdFx0XHRcdFx0dGhpcy5maWxlUGlja0JveC52YWxpZGF0aW9uTWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCB1c2VyUGF0aCA9IHRoaXMuY29uc3RydWN0RnVsbFVzZXJQYXRoKCk7XG5cdFx0XHRcdFx0aWYgKCFlcXVhbHNJZ25vcmVDYXNlKHRoaXMuZmlsZVBpY2tCb3gudmFsdWUuc3Vic3RyaW5nKDAsIHVzZXJQYXRoLmxlbmd0aCksIHVzZXJQYXRoKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5maWxlUGlja0JveC52YWx1ZVNlbGVjdGlvbiA9IFswLCB0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aF07XG5cdFx0XHRcdFx0XHR0aGlzLmluc2VydFRleHQodXNlclBhdGgsIHVzZXJQYXRoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5zZXRBdXRvQ29tcGxldGUodXNlclBhdGgsIHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudCwgaVswXSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlUGlja0JveC5vbkRpZENoYW5nZVZhbHVlKGFzeW5jIHZhbHVlID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaGFuZGxlVmFsdWVDaGFuZ2UodmFsdWUpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlUGlja0JveC5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmhpZGRlbiA9IHRydWU7XG5cdFx0XHRcdGlmIChpc1Jlc29sdmluZyA9PT0gMCkge1xuXHRcdFx0XHRcdGRvUmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuZmlsZVBpY2tCb3guc2hvdygpO1xuXHRcdFx0dGhpcy5jb250ZXh0S2V5LnNldCh0cnVlKTtcblx0XHRcdHRoaXMudXBkYXRlSXRlbXMoaG9tZWRpciwgdHJ1ZSwgdGhpcy50cmFpbGluZykudGhlbigoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLnRyYWlsaW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5maWxlUGlja0JveC52YWx1ZVNlbGVjdGlvbiA9IFt0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aCAtIHRoaXMudHJhaWxpbmcubGVuZ3RoLCB0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aCAtIGV4dC5sZW5ndGhdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsdWVTZWxlY3Rpb24gPSBbdGhpcy5maWxlUGlja0JveC52YWx1ZS5sZW5ndGgsIHRoaXMuZmlsZVBpY2tCb3gudmFsdWUubGVuZ3RoXTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmJ1c3kgPSBmYWxzZTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZVZhbHVlQ2hhbmdlKHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0cnkge1xuXHRcdFx0Ly8gb25EaWRDaGFuZ2VWYWx1ZSBjYW4gYWxzbyBiZSB0cmlnZ2VyZWQgYnkgdGhlIGF1dG8gY29tcGxldGUsIHNvIGlmIGl0IGxvb2tzIGxpa2UgdGhlIGF1dG8gY29tcGxldGUsIGRvbid0IGRvIGFueXRoaW5nXG5cdFx0XHRpZiAodGhpcy5pc1ZhbHVlQ2hhbmdlRnJvbVVzZXIoKSkge1xuXHRcdFx0XHQvLyBJZiB0aGUgdXNlciBoYXMganVzdCBlbnRlcmVkIG1vcmUgYmFkIHBhdGgsIGRvbid0IGNoYW5nZSBhbnl0aGluZ1xuXHRcdFx0XHRpZiAoIWVxdWFsc0lnbm9yZUNhc2UodmFsdWUsIHRoaXMuY29uc3RydWN0RnVsbFVzZXJQYXRoKCkpICYmICghdGhpcy5pc0JhZFN1YnBhdGgodmFsdWUpIHx8IHRoaXMuY2FuVGlsZGFFc2NhcGVIYXRjaCh2YWx1ZSkpKSB7XG5cdFx0XHRcdFx0dGhpcy5maWxlUGlja0JveC52YWxpZGF0aW9uTWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBmaWxlUGlja0JveFVyaSA9IHRoaXMuZmlsZVBpY2tCb3hWYWx1ZSgpO1xuXHRcdFx0XHRcdGxldCB1cGRhdGVkOiBVcGRhdGVSZXN1bHQgPSBVcGRhdGVSZXN1bHQuTm90VXBkYXRlZDtcblx0XHRcdFx0XHRpZiAoIXJlc291cmNlcy5leHRVcmlJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKHRoaXMuY3VycmVudEZvbGRlciwgZmlsZVBpY2tCb3hVcmkpKSB7XG5cdFx0XHRcdFx0XHR1cGRhdGVkID0gYXdhaXQgdGhpcy50cnlVcGRhdGVJdGVtcyh2YWx1ZSwgZmlsZVBpY2tCb3hVcmkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoKHVwZGF0ZWQgPT09IFVwZGF0ZVJlc3VsdC5Ob3RVcGRhdGVkKSB8fCAodXBkYXRlZCA9PT0gVXBkYXRlUmVzdWx0LlVwZGF0ZWRXaXRoVHJhaWxpbmcpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNldEFjdGl2ZUl0ZW1zKHZhbHVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5maWxlUGlja0JveC5hY3RpdmVJdGVtcyA9IFtdO1xuXHRcdFx0XHRcdHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudCA9ICcnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBTaW5jZSBhbnkgdGV4dCBjYW4gYmUgZW50ZXJlZCBpbiB0aGUgaW5wdXQgYm94LCB0aGVyZSBpcyBwb3RlbnRpYWwgZm9yIGVycm9yIGNhdXNpbmcgaW5wdXQuIElmIHRoaXMgaGFwcGVucywgZG8gbm90aGluZy5cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldEJ1dHRvbnMoKSB7XG5cdFx0dGhpcy5maWxlUGlja0JveC5idXR0b25zID0gW3tcblx0XHRcdGljb25DbGFzczogdGhpcy5fc2hvd0RvdEZpbGVzID8gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZXllKSA6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmV5ZUNsb3NlZCksXG5cdFx0XHR0b29sdGlwOiB0aGlzLl9zaG93RG90RmlsZXMgPyBubHMubG9jYWxpemUoJ3JlbW90ZUZpbGVEaWFsb2cuaGlkZURvdEZpbGVzJywgXCJIaWRlIGRvdCBmaWxlc1wiKSA6IG5scy5sb2NhbGl6ZSgncmVtb3RlRmlsZURpYWxvZy5zaG93RG90RmlsZXMnLCBcIlNob3cgZG90IGZpbGVzXCIpLFxuXHRcdFx0YWx3YXlzVmlzaWJsZTogdHJ1ZVxuXHRcdH1dO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0JhZFN1YnBhdGgodmFsdWU6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLmJhZFBhdGggJiYgKHZhbHVlLmxlbmd0aCA+IHRoaXMuYmFkUGF0aC5sZW5ndGgpICYmIGVxdWFsc0lnbm9yZUNhc2UodmFsdWUuc3Vic3RyaW5nKDAsIHRoaXMuYmFkUGF0aC5sZW5ndGgpLCB0aGlzLmJhZFBhdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1ZhbHVlQ2hhbmdlRnJvbVVzZXIoKTogYm9vbGVhbiB7XG5cdFx0aWYgKGVxdWFsc0lnbm9yZUNhc2UodGhpcy5maWxlUGlja0JveC52YWx1ZSwgdGhpcy5wYXRoQXBwZW5kKHRoaXMuY3VycmVudEZvbGRlciwgdGhpcy51c2VyRW50ZXJlZFBhdGhTZWdtZW50ICsgdGhpcy5hdXRvQ29tcGxldGVQYXRoU2VnbWVudCkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1NlbGVjdGlvbkNoYW5nZUZyb21Vc2VyKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmFjdGl2ZUl0ZW0gPT09ICh0aGlzLmZpbGVQaWNrQm94LmFjdGl2ZUl0ZW1zID8gdGhpcy5maWxlUGlja0JveC5hY3RpdmVJdGVtc1swXSA6IHVuZGVmaW5lZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdEZ1bGxVc2VyUGF0aCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGN1cnJlbnRGb2xkZXJQYXRoID0gdGhpcy5wYXRoRnJvbVVyaSh0aGlzLmN1cnJlbnRGb2xkZXIpO1xuXHRcdGlmIChlcXVhbHNJZ25vcmVDYXNlKHRoaXMuZmlsZVBpY2tCb3gudmFsdWUuc3Vic3RyKDAsIHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudC5sZW5ndGgpLCB0aGlzLnVzZXJFbnRlcmVkUGF0aFNlZ21lbnQpKSB7XG5cdFx0XHRpZiAoZXF1YWxzSWdub3JlQ2FzZSh0aGlzLmZpbGVQaWNrQm94LnZhbHVlLnN1YnN0cigwLCBjdXJyZW50Rm9sZGVyUGF0aC5sZW5ndGgpLCBjdXJyZW50Rm9sZGVyUGF0aCkpIHtcblx0XHRcdFx0cmV0dXJuIGN1cnJlbnRGb2xkZXJQYXRoO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMucGF0aEFwcGVuZCh0aGlzLmN1cnJlbnRGb2xkZXIsIHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmaWxlUGlja0JveFZhbHVlKCk6IFVSSSB7XG5cdFx0Ly8gVGhlIGZpbGUgcGljayBib3ggY2FuJ3QgcmVuZGVyIGV2ZXJ5dGhpbmcsIHNvIHdlIHVzZSB0aGUgY3VycmVudCBmb2xkZXIgdG8gY3JlYXRlIHRoZSB1cmkgc28gdGhhdCBpdCBpcyBhbiBleGlzdGluZyBwYXRoLlxuXHRcdGNvbnN0IGRpcmVjdFVyaSA9IHRoaXMucmVtb3RlVXJpRnJvbSh0aGlzLmZpbGVQaWNrQm94LnZhbHVlLnRyaW1SaWdodCgpLCB0aGlzLmN1cnJlbnRGb2xkZXIpO1xuXHRcdGNvbnN0IGN1cnJlbnRQYXRoID0gdGhpcy5wYXRoRnJvbVVyaSh0aGlzLmN1cnJlbnRGb2xkZXIpO1xuXHRcdGlmIChlcXVhbHNJZ25vcmVDYXNlKHRoaXMuZmlsZVBpY2tCb3gudmFsdWUsIGN1cnJlbnRQYXRoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3VycmVudEZvbGRlcjtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudERpc3BsYXlVcmkgPSB0aGlzLnJlbW90ZVVyaUZyb20oY3VycmVudFBhdGgsIHRoaXMuY3VycmVudEZvbGRlcik7XG5cdFx0Y29uc3QgcmVsYXRpdmVQYXRoID0gcmVzb3VyY2VzLnJlbGF0aXZlUGF0aChjdXJyZW50RGlzcGxheVVyaSwgZGlyZWN0VXJpKTtcblx0XHRjb25zdCBpc1NhbWVSb290ID0gKHRoaXMuZmlsZVBpY2tCb3gudmFsdWUubGVuZ3RoID4gMSAmJiBjdXJyZW50UGF0aC5sZW5ndGggPiAxKSA/IGVxdWFsc0lnbm9yZUNhc2UodGhpcy5maWxlUGlja0JveC52YWx1ZS5zdWJzdHIoMCwgMiksIGN1cnJlbnRQYXRoLnN1YnN0cigwLCAyKSkgOiBmYWxzZTtcblx0XHRpZiAocmVsYXRpdmVQYXRoICYmIGlzU2FtZVJvb3QpIHtcblx0XHRcdGxldCBwYXRoID0gcmVzb3VyY2VzLmpvaW5QYXRoKHRoaXMuY3VycmVudEZvbGRlciwgcmVsYXRpdmVQYXRoKTtcblx0XHRcdGNvbnN0IGRpcmVjdEJhc2VuYW1lID0gcmVzb3VyY2VzLmJhc2VuYW1lKGRpcmVjdFVyaSk7XG5cdFx0XHRpZiAoKGRpcmVjdEJhc2VuYW1lID09PSAnLicpIHx8IChkaXJlY3RCYXNlbmFtZSA9PT0gJy4uJykpIHtcblx0XHRcdFx0cGF0aCA9IHRoaXMucmVtb3RlVXJpRnJvbSh0aGlzLnBhdGhBcHBlbmQocGF0aCwgZGlyZWN0QmFzZW5hbWUpLCB0aGlzLmN1cnJlbnRGb2xkZXIpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc291cmNlcy5oYXNUcmFpbGluZ1BhdGhTZXBhcmF0b3IoZGlyZWN0VXJpKSA/IHJlc291cmNlcy5hZGRUcmFpbGluZ1BhdGhTZXBhcmF0b3IocGF0aCkgOiBwYXRoO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZGlyZWN0VXJpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRBY2NlcHQoKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLmJ1c3kgPSB0cnVlO1xuXHRcdGlmICghdGhpcy51cGRhdGluZ1Byb21pc2UgJiYgdGhpcy5maWxlUGlja0JveC5hY3RpdmVJdGVtcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLmZpbGVQaWNrQm94LnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRpZiAoaXRlbS5pc0ZvbGRlcikge1xuXHRcdFx0XHRpZiAodGhpcy50cmFpbGluZykge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudXBkYXRlSXRlbXMoaXRlbS51cmksIHRydWUsIHRoaXMudHJhaWxpbmcpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFdoZW4gcG9zc2libGUsIGNhdXNlIHRoZSB1cGRhdGUgdG8gaGFwcGVuIGJ5IG1vZGlmeWluZyB0aGUgaW5wdXQgYm94LlxuXHRcdFx0XHRcdC8vIFRoaXMgYWxsb3dzIGFsbCBpbnB1dCBib3ggdXBkYXRlcyB0byBoYXBwZW4gZmlyc3QsIGFuZCB1c2VzIHRoZSBzYW1lIGNvZGUgcGF0aCBhcyB0aGUgdXNlciB0eXBpbmcuXG5cdFx0XHRcdFx0Y29uc3QgbmV3UGF0aCA9IHRoaXMucGF0aEZyb21VcmkoaXRlbS51cmkpO1xuXHRcdFx0XHRcdGlmIChzdGFydHNXaXRoSWdub3JlQ2FzZShuZXdQYXRoLCB0aGlzLmZpbGVQaWNrQm94LnZhbHVlKSAmJiAoZXF1YWxzSWdub3JlQ2FzZShpdGVtLmxhYmVsLCByZXNvdXJjZXMuYmFzZW5hbWUoaXRlbS51cmkpKSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsdWVTZWxlY3Rpb24gPSBbdGhpcy5wYXRoRnJvbVVyaSh0aGlzLmN1cnJlbnRGb2xkZXIpLmxlbmd0aCwgdGhpcy5maWxlUGlja0JveC52YWx1ZS5sZW5ndGhdO1xuXHRcdFx0XHRcdFx0dGhpcy5pbnNlcnRUZXh0KG5ld1BhdGgsIHRoaXMuYmFzZW5hbWVXaXRoVHJhaWxpbmdTbGFzaChpdGVtLnVyaSkpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoKGl0ZW0ubGFiZWwgPT09ICcuLicpICYmIHN0YXJ0c1dpdGhJZ25vcmVDYXNlKHRoaXMuZmlsZVBpY2tCb3gudmFsdWUsIG5ld1BhdGgpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbHVlU2VsZWN0aW9uID0gW25ld1BhdGgubGVuZ3RoLCB0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aF07XG5cdFx0XHRcdFx0XHR0aGlzLmluc2VydFRleHQobmV3UGF0aCwgJycpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUl0ZW1zKGl0ZW0udXJpLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5maWxlUGlja0JveC5idXN5ID0gZmFsc2U7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCF0aGlzLnVwZGF0aW5nUHJvbWlzZSkge1xuXHRcdFx0Ly8gSWYgdGhlIGl0ZW1zIGhhdmUgdXBkYXRlZCwgZG9uJ3QgdHJ5IHRvIHJlc29sdmVcblx0XHRcdGlmICgoYXdhaXQgdGhpcy50cnlVcGRhdGVJdGVtcyh0aGlzLmZpbGVQaWNrQm94LnZhbHVlLCB0aGlzLmZpbGVQaWNrQm94VmFsdWUoKSkpICE9PSBVcGRhdGVSZXN1bHQuTm90VXBkYXRlZCkge1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LmJ1c3kgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCByZXNvbHZlVmFsdWU6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHQvLyBGaW5kIHJlc29sdmUgdmFsdWVcblx0XHRpZiAodGhpcy5maWxlUGlja0JveC5hY3RpdmVJdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJlc29sdmVWYWx1ZSA9IHRoaXMuZmlsZVBpY2tCb3hWYWx1ZSgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5maWxlUGlja0JveC5hY3RpdmVJdGVtcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJlc29sdmVWYWx1ZSA9IHRoaXMuZmlsZVBpY2tCb3guc2VsZWN0ZWRJdGVtc1swXS51cmk7XG5cdFx0fVxuXHRcdGlmIChyZXNvbHZlVmFsdWUpIHtcblx0XHRcdHJlc29sdmVWYWx1ZSA9IHRoaXMuYWRkUG9zdGZpeChyZXNvbHZlVmFsdWUpO1xuXHRcdH1cblx0XHRpZiAoYXdhaXQgdGhpcy52YWxpZGF0ZShyZXNvbHZlVmFsdWUpKSB7XG5cdFx0XHR0aGlzLmJ1c3kgPSBmYWxzZTtcblx0XHRcdHJldHVybiByZXNvbHZlVmFsdWU7XG5cdFx0fVxuXHRcdHRoaXMuYnVzeSA9IGZhbHNlO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJvb3QodmFsdWU6IFVSSSkge1xuXHRcdGxldCBsYXN0RGlyID0gdmFsdWU7XG5cdFx0bGV0IGRpciA9IHJlc291cmNlcy5kaXJuYW1lKHZhbHVlKTtcblx0XHR3aGlsZSAoIXJlc291cmNlcy5pc0VxdWFsKGxhc3REaXIsIGRpcikpIHtcblx0XHRcdGxhc3REaXIgPSBkaXI7XG5cdFx0XHRkaXIgPSByZXNvdXJjZXMuZGlybmFtZShkaXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGlyO1xuXHR9XG5cblx0cHJpdmF0ZSBjYW5UaWxkYUVzY2FwZUhhdGNoKHZhbHVlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISEodmFsdWUuZW5kc1dpdGgoJ34nKSAmJiB0aGlzLmlzQmFkU3VicGF0aCh2YWx1ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB0aWxkYVJlcGxhY2UodmFsdWU6IHN0cmluZyk6IFVSSSB7XG5cdFx0Y29uc3QgaG9tZSA9IHRoaXMudHJ1ZUhvbWU7XG5cdFx0aWYgKCh2YWx1ZS5sZW5ndGggPiAwKSAmJiAodmFsdWVbMF0gPT09ICd+JykpIHtcblx0XHRcdHJldHVybiByZXNvdXJjZXMuam9pblBhdGgoaG9tZSwgdmFsdWUuc3Vic3RyaW5nKDEpKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuY2FuVGlsZGFFc2NhcGVIYXRjaCh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiBob21lO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5yZW1vdGVVcmlGcm9tKHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgdHJ5QWRkVHJhaWxpbmdTZXBhcmF0b3JUb0RpcmVjdG9yeSh1cmk6IFVSSSwgc3RhdDogSUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YSk6IFVSSSB7XG5cdFx0aWYgKHN0YXQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdC8vIEF0IHRoaXMgcG9pbnQgd2Uga25vdyBpdCdzIGEgZGlyZWN0b3J5IGFuZCBjYW4gYWRkIHRoZSB0cmFpbGluZyBwYXRoIHNlcGFyYXRvclxuXHRcdFx0aWYgKCF0aGlzLmVuZHNXaXRoU2xhc2godXJpLnBhdGgpKSB7XG5cdFx0XHRcdHJldHVybiByZXNvdXJjZXMuYWRkVHJhaWxpbmdQYXRoU2VwYXJhdG9yKHVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1cmk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHRyeVVwZGF0ZUl0ZW1zKHZhbHVlOiBzdHJpbmcsIHZhbHVlVXJpOiBVUkksIHJlc2V0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFVwZGF0ZVJlc3VsdD4ge1xuXHRcdGlmICgodmFsdWUubGVuZ3RoID4gMCkgJiYgKCh2YWx1ZVswXSA9PT0gJ34nKSB8fCB0aGlzLmNhblRpbGRhRXNjYXBlSGF0Y2godmFsdWUpKSkge1xuXHRcdFx0Y29uc3QgbmV3RGlyID0gdGhpcy50aWxkYVJlcGxhY2UodmFsdWUpO1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMudXBkYXRlSXRlbXMobmV3RGlyLCB0cnVlKSA/IFVwZGF0ZVJlc3VsdC5VcGRhdGVkV2l0aFRyYWlsaW5nIDogVXBkYXRlUmVzdWx0LlVwZGF0ZWQ7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gJ1xcXFwnKSB7XG5cdFx0XHR2YWx1ZVVyaSA9IHRoaXMucm9vdCh0aGlzLmN1cnJlbnRGb2xkZXIpO1xuXHRcdFx0dmFsdWUgPSB0aGlzLnBhdGhGcm9tVXJpKHZhbHVlVXJpKTtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLnVwZGF0ZUl0ZW1zKHZhbHVlVXJpLCB0cnVlKSA/IFVwZGF0ZVJlc3VsdC5VcGRhdGVkV2l0aFRyYWlsaW5nIDogVXBkYXRlUmVzdWx0LlVwZGF0ZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG5ld0ZvbGRlcklzT2xkRm9sZGVyID0gcmVzb3VyY2VzLmV4dFVyaUlnbm9yZVBhdGhDYXNlLmlzRXF1YWwodGhpcy5jdXJyZW50Rm9sZGVyLCB2YWx1ZVVyaSk7XG5cdFx0XHRjb25zdCBuZXdGb2xkZXJJc1N1YkZvbGRlciA9IHJlc291cmNlcy5leHRVcmlJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKHRoaXMuY3VycmVudEZvbGRlciwgcmVzb3VyY2VzLmRpcm5hbWUodmFsdWVVcmkpKTtcblx0XHRcdGNvbnN0IG5ld0ZvbGRlcklzUGFyZW50ID0gcmVzb3VyY2VzLmV4dFVyaUlnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudCh0aGlzLmN1cnJlbnRGb2xkZXIsIHJlc291cmNlcy5kaXJuYW1lKHZhbHVlVXJpKSk7XG5cdFx0XHRjb25zdCBuZXdGb2xkZXJJc1VucmVsYXRlZCA9ICFuZXdGb2xkZXJJc1BhcmVudCAmJiAhbmV3Rm9sZGVySXNTdWJGb2xkZXI7XG5cdFx0XHRpZiAoKCFuZXdGb2xkZXJJc09sZEZvbGRlciAmJiAodGhpcy5lbmRzV2l0aFNsYXNoKHZhbHVlKSB8fCBuZXdGb2xkZXJJc1BhcmVudCB8fCBuZXdGb2xkZXJJc1VucmVsYXRlZCkpIHx8IHJlc2V0KSB7XG5cdFx0XHRcdGxldCBzdGF0OiBJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQodmFsdWVVcmkpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Ly8gZG8gbm90aGluZ1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzdGF0Py5pc0RpcmVjdG9yeSAmJiAocmVzb3VyY2VzLmJhc2VuYW1lKHZhbHVlVXJpKSAhPT0gJy4nKSAmJiB0aGlzLmVuZHNXaXRoU2xhc2godmFsdWUpKSB7XG5cdFx0XHRcdFx0dmFsdWVVcmkgPSB0aGlzLnRyeUFkZFRyYWlsaW5nU2VwYXJhdG9yVG9EaXJlY3RvcnkodmFsdWVVcmksIHN0YXQpO1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLnVwZGF0ZUl0ZW1zKHZhbHVlVXJpKSA/IFVwZGF0ZVJlc3VsdC5VcGRhdGVkV2l0aFRyYWlsaW5nIDogVXBkYXRlUmVzdWx0LlVwZGF0ZWQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5lbmRzV2l0aFNsYXNoKHZhbHVlKSkge1xuXHRcdFx0XHRcdC8vIFRoZSBpbnB1dCBib3ggY29udGFpbnMgYSBwYXRoIHRoYXQgZG9lc24ndCBleGlzdCBvbiB0aGUgc3lzdGVtLlxuXHRcdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ3JlbW90ZUZpbGVEaWFsb2cuYmFkUGF0aCcsICdUaGUgcGF0aCBkb2VzIG5vdCBleGlzdC4gVXNlIH4gdG8gZ28gdG8geW91ciBob21lIGRpcmVjdG9yeS4nKTtcblx0XHRcdFx0XHQvLyBTYXZlIHRoaXMgYmFkIHBhdGguIEl0IGNhbiB0YWtlIHRvbyBsb25nIHRvIGEgc3RhdCBvbiBldmVyeSB1c2VyIGVudGVyZWQgY2hhcmFjdGVyLCBidXQgb25jZSBhIHVzZXIgZW50ZXJzIGEgYmFkIHBhdGggdGhleSBhcmUgbGlrZWx5XG5cdFx0XHRcdFx0Ly8gdG8ga2VlcCB0eXBpbmcgbW9yZSBiYWQgcGF0aC4gV2UgY2FuIGNvbXBhcmUgYWdhaW5zdCB0aGlzIGJhZCBwYXRoIGFuZCBzZWUgaWYgdGhlIHVzZXIgZW50ZXJlZCBwYXRoIHN0YXJ0cyB3aXRoIGl0LlxuXHRcdFx0XHRcdHRoaXMuYmFkUGF0aCA9IHZhbHVlO1xuXHRcdFx0XHRcdHJldHVybiBVcGRhdGVSZXN1bHQuSW52YWxpZFBhdGg7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGV0IGlucHV0VXJpRGlybmFtZSA9IHJlc291cmNlcy5kaXJuYW1lKHZhbHVlVXJpKTtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50Rm9sZGVyV2l0aG91dFNlcCA9IHJlc291cmNlcy5yZW1vdmVUcmFpbGluZ1BhdGhTZXBhcmF0b3IocmVzb3VyY2VzLmFkZFRyYWlsaW5nUGF0aFNlcGFyYXRvcih0aGlzLmN1cnJlbnRGb2xkZXIpKTtcblx0XHRcdFx0XHRjb25zdCBpbnB1dFVyaURpcm5hbWVXaXRob3V0U2VwID0gcmVzb3VyY2VzLnJlbW92ZVRyYWlsaW5nUGF0aFNlcGFyYXRvcihyZXNvdXJjZXMuYWRkVHJhaWxpbmdQYXRoU2VwYXJhdG9yKGlucHV0VXJpRGlybmFtZSkpO1xuXHRcdFx0XHRcdGlmICghcmVzb3VyY2VzLmV4dFVyaUlnbm9yZVBhdGhDYXNlLmlzRXF1YWwoY3VycmVudEZvbGRlcldpdGhvdXRTZXAsIGlucHV0VXJpRGlybmFtZVdpdGhvdXRTZXApXG5cdFx0XHRcdFx0XHQmJiAoIS9eW2EtekEtWl06JC8udGVzdCh0aGlzLmZpbGVQaWNrQm94LnZhbHVlKVxuXHRcdFx0XHRcdFx0XHR8fCAhZXF1YWxzSWdub3JlQ2FzZSh0aGlzLnBhdGhGcm9tVXJpKHRoaXMuY3VycmVudEZvbGRlcikuc3Vic3RyaW5nKDAsIHRoaXMuZmlsZVBpY2tCb3gudmFsdWUubGVuZ3RoKSwgdGhpcy5maWxlUGlja0JveC52YWx1ZSkpKSB7XG5cdFx0XHRcdFx0XHRsZXQgc3RhdFdpdGhvdXRUcmFpbGluZzogSUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdHN0YXRXaXRob3V0VHJhaWxpbmcgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQoaW5wdXRVcmlEaXJuYW1lKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0Ly8gZG8gbm90aGluZ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHN0YXRXaXRob3V0VHJhaWxpbmc/LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuYmFkUGF0aCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0aW5wdXRVcmlEaXJuYW1lID0gdGhpcy50cnlBZGRUcmFpbGluZ1NlcGFyYXRvclRvRGlyZWN0b3J5KGlucHV0VXJpRGlybmFtZSwgc3RhdFdpdGhvdXRUcmFpbGluZyk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLnVwZGF0ZUl0ZW1zKGlucHV0VXJpRGlybmFtZSwgZmFsc2UsIHJlc291cmNlcy5iYXNlbmFtZSh2YWx1ZVVyaSkpID8gVXBkYXRlUmVzdWx0LlVwZGF0ZWRXaXRoVHJhaWxpbmcgOiBVcGRhdGVSZXN1bHQuVXBkYXRlZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5iYWRQYXRoID0gdW5kZWZpbmVkO1xuXHRcdHJldHVybiBVcGRhdGVSZXN1bHQuTm90VXBkYXRlZDtcblx0fVxuXG5cdHByaXZhdGUgdHJ5VXBkYXRlVHJhaWxpbmcodmFsdWU6IFVSSSkge1xuXHRcdGNvbnN0IGV4dCA9IHJlc291cmNlcy5leHRuYW1lKHZhbHVlKTtcblx0XHRpZiAodGhpcy50cmFpbGluZyAmJiBleHQpIHtcblx0XHRcdHRoaXMudHJhaWxpbmcgPSByZXNvdXJjZXMuYmFzZW5hbWUodmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0QWN0aXZlSXRlbXModmFsdWU6IHN0cmluZykge1xuXHRcdHZhbHVlID0gdGhpcy5wYXRoRnJvbVVyaSh0aGlzLnRpbGRhUmVwbGFjZSh2YWx1ZSkpO1xuXHRcdGNvbnN0IGFzVXJpID0gdGhpcy5yZW1vdGVVcmlGcm9tKHZhbHVlKTtcblx0XHRjb25zdCBpbnB1dEJhc2VuYW1lID0gcmVzb3VyY2VzLmJhc2VuYW1lKGFzVXJpKTtcblx0XHRjb25zdCB1c2VyUGF0aCA9IHRoaXMuY29uc3RydWN0RnVsbFVzZXJQYXRoKCk7XG5cdFx0Ly8gTWFrZSBzdXJlIHRoYXQgdGhlIGZvbGRlciB3aG9zZSBjaGlsZHJlbiB3ZSBhcmUgY3VycmVudGx5IHZpZXdpbmcgbWF0Y2hlcyB0aGUgcGF0aCBpbiB0aGUgaW5wdXRcblx0XHRjb25zdCBwYXRoc0VxdWFsID0gZXF1YWxzSWdub3JlQ2FzZSh1c2VyUGF0aCwgdmFsdWUuc3Vic3RyaW5nKDAsIHVzZXJQYXRoLmxlbmd0aCkpIHx8XG5cdFx0XHRlcXVhbHNJZ25vcmVDYXNlKHZhbHVlLCB1c2VyUGF0aC5zdWJzdHJpbmcoMCwgdmFsdWUubGVuZ3RoKSk7XG5cdFx0aWYgKHBhdGhzRXF1YWwpIHtcblx0XHRcdGxldCBoYXNNYXRjaCA9IGZhbHNlO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmZpbGVQaWNrQm94Lml0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSA8RmlsZVF1aWNrUGlja0l0ZW0+dGhpcy5maWxlUGlja0JveC5pdGVtc1tpXTtcblx0XHRcdFx0aWYgKHRoaXMuc2V0QXV0b0NvbXBsZXRlKHZhbHVlLCBpbnB1dEJhc2VuYW1lLCBpdGVtKSkge1xuXHRcdFx0XHRcdGhhc01hdGNoID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFoYXNNYXRjaCkge1xuXHRcdFx0XHRjb25zdCB1c2VyQmFzZW5hbWUgPSBpbnB1dEJhc2VuYW1lLmxlbmd0aCA+PSAyID8gdXNlclBhdGguc3Vic3RyaW5nKHVzZXJQYXRoLmxlbmd0aCAtIGlucHV0QmFzZW5hbWUubGVuZ3RoICsgMikgOiAnJztcblx0XHRcdFx0dGhpcy51c2VyRW50ZXJlZFBhdGhTZWdtZW50ID0gKHVzZXJCYXNlbmFtZSA9PT0gaW5wdXRCYXNlbmFtZSkgPyBpbnB1dEJhc2VuYW1lIDogJyc7XG5cdFx0XHRcdHRoaXMuYXV0b0NvbXBsZXRlUGF0aFNlZ21lbnQgPSAnJztcblx0XHRcdFx0dGhpcy5maWxlUGlja0JveC5hY3RpdmVJdGVtcyA9IFtdO1xuXHRcdFx0XHR0aGlzLnRyeVVwZGF0ZVRyYWlsaW5nKGFzVXJpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy51c2VyRW50ZXJlZFBhdGhTZWdtZW50ID0gaW5wdXRCYXNlbmFtZTtcblx0XHRcdHRoaXMuYXV0b0NvbXBsZXRlUGF0aFNlZ21lbnQgPSAnJztcblx0XHRcdHRoaXMuZmlsZVBpY2tCb3guYWN0aXZlSXRlbXMgPSBbXTtcblx0XHRcdHRoaXMudHJ5VXBkYXRlVHJhaWxpbmcoYXNVcmkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0QXV0b0NvbXBsZXRlKHN0YXJ0aW5nVmFsdWU6IHN0cmluZywgc3RhcnRpbmdCYXNlbmFtZTogc3RyaW5nLCBxdWlja1BpY2tJdGVtOiBGaWxlUXVpY2tQaWNrSXRlbSwgZm9yY2U6IGJvb2xlYW4gPSBmYWxzZSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmJ1c3kpIHtcblx0XHRcdC8vIFdlJ3JlIGluIHRoZSBtaWRkbGUgb2Ygc29tZXRoaW5nIGVsc2UuIERvaW5nIGFuIGF1dG8gY29tcGxldGUgbm93IGNhbiByZXN1bHQganVtYmxlZCBvciBpbmNvcnJlY3QgYXV0b2NvbXBsZXRlcy5cblx0XHRcdHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudCA9IHN0YXJ0aW5nQmFzZW5hbWU7XG5cdFx0XHR0aGlzLmF1dG9Db21wbGV0ZVBhdGhTZWdtZW50ID0gJyc7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW1CYXNlbmFtZSA9IHF1aWNrUGlja0l0ZW0ubGFiZWw7XG5cdFx0Ly8gRWl0aGVyIGZvcmNlIHRoZSBhdXRvY29tcGxldGUsIG9yIHRoZSBvbGQgdmFsdWUgc2hvdWxkIGJlIG9uZSBzbWFsbGVyIHRoYW4gdGhlIG5ldyB2YWx1ZSBhbmQgbWF0Y2ggdGhlIG5ldyB2YWx1ZS5cblx0XHRpZiAoaXRlbUJhc2VuYW1lID09PSAnLi4nKSB7XG5cdFx0XHQvLyBEb24ndCBtYXRjaCBvbiB0aGUgdXAgZGlyZWN0b3J5IGl0ZW0gZXZlci5cblx0XHRcdHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudCA9ICcnO1xuXHRcdFx0dGhpcy5hdXRvQ29tcGxldGVQYXRoU2VnbWVudCA9ICcnO1xuXHRcdFx0dGhpcy5hY3RpdmVJdGVtID0gcXVpY2tQaWNrSXRlbTtcblx0XHRcdGlmIChmb3JjZSkge1xuXHRcdFx0XHQvLyBjbGVhciBhbnkgc2VsZWN0ZWQgdGV4dFxuXHRcdFx0XHRnZXRBY3RpdmVEb2N1bWVudCgpLmV4ZWNDb21tYW5kKCdpbnNlcnRUZXh0JywgZmFsc2UsICcnKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKCFmb3JjZSAmJiAoaXRlbUJhc2VuYW1lLmxlbmd0aCA+PSBzdGFydGluZ0Jhc2VuYW1lLmxlbmd0aCkgJiYgZXF1YWxzSWdub3JlQ2FzZShpdGVtQmFzZW5hbWUuc3Vic3RyKDAsIHN0YXJ0aW5nQmFzZW5hbWUubGVuZ3RoKSwgc3RhcnRpbmdCYXNlbmFtZSkpIHtcblx0XHRcdHRoaXMudXNlckVudGVyZWRQYXRoU2VnbWVudCA9IHN0YXJ0aW5nQmFzZW5hbWU7XG5cdFx0XHR0aGlzLmFjdGl2ZUl0ZW0gPSBxdWlja1BpY2tJdGVtO1xuXHRcdFx0Ly8gQ2hhbmdpbmcgdGhlIGFjdGl2ZSBpdGVtcyB3aWxsIHRyaWdnZXIgdGhlIG9uRGlkQWN0aXZlSXRlbXNDaGFuZ2VkLiBDbGVhciB0aGUgYXV0b2NvbXBsZXRlIGZpcnN0LCB0aGVuIHNldCBpdCBhZnRlci5cblx0XHRcdHRoaXMuYXV0b0NvbXBsZXRlUGF0aFNlZ21lbnQgPSAnJztcblx0XHRcdGlmIChxdWlja1BpY2tJdGVtLmlzRm9sZGVyIHx8ICF0aGlzLnRyYWlsaW5nKSB7XG5cdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3guYWN0aXZlSXRlbXMgPSBbcXVpY2tQaWNrSXRlbV07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LmFjdGl2ZUl0ZW1zID0gW107XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGZvcmNlICYmICghZXF1YWxzSWdub3JlQ2FzZSh0aGlzLmJhc2VuYW1lV2l0aFRyYWlsaW5nU2xhc2gocXVpY2tQaWNrSXRlbS51cmkpLCAodGhpcy51c2VyRW50ZXJlZFBhdGhTZWdtZW50ICsgdGhpcy5hdXRvQ29tcGxldGVQYXRoU2VnbWVudCkpKSkge1xuXHRcdFx0dGhpcy51c2VyRW50ZXJlZFBhdGhTZWdtZW50ID0gJyc7XG5cdFx0XHRpZiAoIXRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0XHR0aGlzLmF1dG9Db21wbGV0ZVBhdGhTZWdtZW50ID0gdGhpcy50cmltVHJhaWxpbmdTbGFzaChpdGVtQmFzZW5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5hY3RpdmVJdGVtID0gcXVpY2tQaWNrSXRlbTtcblx0XHRcdGlmICghdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpKSB7XG5cdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsdWVTZWxlY3Rpb24gPSBbdGhpcy5wYXRoRnJvbVVyaSh0aGlzLmN1cnJlbnRGb2xkZXIsIHRydWUpLmxlbmd0aCwgdGhpcy5maWxlUGlja0JveC52YWx1ZS5sZW5ndGhdO1xuXHRcdFx0XHQvLyB1c2UgaW5zZXJ0IHRleHQgdG8gcHJlc2VydmUgdW5kbyBidWZmZXJcblx0XHRcdFx0dGhpcy5pbnNlcnRUZXh0KHRoaXMucGF0aEFwcGVuZCh0aGlzLmN1cnJlbnRGb2xkZXIsIHRoaXMuYXV0b0NvbXBsZXRlUGF0aFNlZ21lbnQpLCB0aGlzLmF1dG9Db21wbGV0ZVBhdGhTZWdtZW50KTtcblx0XHRcdFx0dGhpcy5maWxlUGlja0JveC52YWx1ZVNlbGVjdGlvbiA9IFt0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aCAtIHRoaXMuYXV0b0NvbXBsZXRlUGF0aFNlZ21lbnQubGVuZ3RoLCB0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aF07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy51c2VyRW50ZXJlZFBhdGhTZWdtZW50ID0gc3RhcnRpbmdCYXNlbmFtZTtcblx0XHRcdHRoaXMuYXV0b0NvbXBsZXRlUGF0aFNlZ21lbnQgPSAnJztcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluc2VydFRleHQod2hvbGVWYWx1ZTogc3RyaW5nLCBpbnNlcnRUZXh0OiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5maWxlUGlja0JveC5pbnB1dEhhc0ZvY3VzKCkpIHtcblx0XHRcdGdldEFjdGl2ZURvY3VtZW50KCkuZXhlY0NvbW1hbmQoJ2luc2VydFRleHQnLCBmYWxzZSwgaW5zZXJ0VGV4dCk7XG5cdFx0XHRpZiAodGhpcy5maWxlUGlja0JveC52YWx1ZSAhPT0gd2hvbGVWYWx1ZSkge1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbHVlID0gd2hvbGVWYWx1ZTtcblx0XHRcdFx0dGhpcy5oYW5kbGVWYWx1ZUNoYW5nZSh3aG9sZVZhbHVlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5maWxlUGlja0JveC52YWx1ZSA9IHdob2xlVmFsdWU7XG5cdFx0XHR0aGlzLmhhbmRsZVZhbHVlQ2hhbmdlKHdob2xlVmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWRkUG9zdGZpeCh1cmk6IFVSSSk6IFVSSSB7XG5cdFx0bGV0IHJlc3VsdCA9IHVyaTtcblx0XHRpZiAodGhpcy5yZXF1aXJlc1RyYWlsaW5nICYmIHRoaXMub3B0aW9ucy5maWx0ZXJzICYmIHRoaXMub3B0aW9ucy5maWx0ZXJzLmxlbmd0aCA+IDAgJiYgIXJlc291cmNlcy5oYXNUcmFpbGluZ1BhdGhTZXBhcmF0b3IodXJpKSkge1xuXHRcdFx0Ly8gTWFrZSBzdXJlIHRoYXQgdGhlIHN1ZmZpeCBpcyBhZGRlZC4gSWYgdGhlIHVzZXIgZGVsZXRlZCBpdCwgd2UgYXV0b21hdGljYWxseSBhZGQgaXQgaGVyZVxuXHRcdFx0bGV0IGhhc0V4dDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgY3VycmVudEV4dCA9IHJlc291cmNlcy5leHRuYW1lKHVyaSkuc3Vic3RyKDEpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLm9wdGlvbnMuZmlsdGVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRmb3IgKGxldCBqID0gMDsgaiA8IHRoaXMub3B0aW9ucy5maWx0ZXJzW2ldLmV4dGVuc2lvbnMubGVuZ3RoOyBqKyspIHtcblx0XHRcdFx0XHRpZiAoKHRoaXMub3B0aW9ucy5maWx0ZXJzW2ldLmV4dGVuc2lvbnNbal0gPT09ICcqJykgfHwgKHRoaXMub3B0aW9ucy5maWx0ZXJzW2ldLmV4dGVuc2lvbnNbal0gPT09IGN1cnJlbnRFeHQpKSB7XG5cdFx0XHRcdFx0XHRoYXNFeHQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChoYXNFeHQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFoYXNFeHQpIHtcblx0XHRcdFx0cmVzdWx0ID0gcmVzb3VyY2VzLmpvaW5QYXRoKHJlc291cmNlcy5kaXJuYW1lKHVyaSksIHJlc291cmNlcy5iYXNlbmFtZSh1cmkpICsgJy4nICsgdGhpcy5vcHRpb25zLmZpbHRlcnNbMF0uZXh0ZW5zaW9uc1swXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHRyaW1UcmFpbGluZ1NsYXNoKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICgocGF0aC5sZW5ndGggPiAxKSAmJiB0aGlzLmVuZHNXaXRoU2xhc2gocGF0aCkpID8gcGF0aC5zdWJzdHIoMCwgcGF0aC5sZW5ndGggLSAxKSA6IHBhdGg7XG5cdH1cblxuXHRwcml2YXRlIHllc05vUHJvbXB0KHVyaTogVVJJLCBtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpbnRlcmZhY2UgWWVzTm9JdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRcdFx0dmFsdWU6IGJvb2xlYW47XG5cdFx0fVxuXHRcdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwcm9tcHQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPFllc05vSXRlbT4oKSk7XG5cdFx0cHJvbXB0LnRpdGxlID0gbWVzc2FnZTtcblx0XHRwcm9tcHQuaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdHByb21wdC5vayA9IHRydWU7XG5cdFx0cHJvbXB0LmN1c3RvbUJ1dHRvbiA9IHRydWU7XG5cdFx0cHJvbXB0LmN1c3RvbUxhYmVsID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLmNhbmNlbCcsICdDYW5jZWwnKTtcblx0XHRwcm9tcHQuY3VzdG9tQnV0dG9uU2Vjb25kYXJ5ID0gdHJ1ZTtcblx0XHRwcm9tcHQudmFsdWUgPSB0aGlzLnBhdGhGcm9tVXJpKHVyaSk7XG5cblx0XHRsZXQgaXNSZXNvbHZpbmcgPSBmYWxzZTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8Ym9vbGVhbj4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHByb21wdC5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdGlzUmVzb2x2aW5nID0gdHJ1ZTtcblx0XHRcdFx0cHJvbXB0LmhpZGUoKTtcblx0XHRcdFx0cmVzb2x2ZSh0cnVlKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQocHJvbXB0Lm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdGlmICghaXNSZXNvbHZpbmcpIHtcblx0XHRcdFx0XHRyZXNvbHZlKGZhbHNlKTtcblx0XHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnNob3coKTtcblx0XHRcdFx0XHQvLyBUaGUgcXVpY2sgcGljayBVSSdzIGxpc3QgaXMgc2hhcmVkIGJldHdlZW4gcXVpY2sgcGlja3MsIHNvIHNob3dpbmcgdGhlXG5cdFx0XHRcdFx0Ly8geWVzL25vIHByb21wdCBhYm92ZSByZXBsYWNlZCB0aGUgaXRlbXMgaW4gdGhlIHVuZGVybHlpbmcgbGlzdC4gUmUtYXNzaWduXG5cdFx0XHRcdFx0Ly8gdGhlIGl0ZW1zIHNvIHRoZXkgYXJlIHJlbmRlcmVkIGFnYWluIHdoZW4gdGhlIGZpbGUgcGlja2VyIGlzIHNob3duLlxuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRJdGVtcyA9IHRoaXMuZmlsZVBpY2tCb3guaXRlbXM7XG5cdFx0XHRcdFx0dGhpcy5maWxlUGlja0JveC5pdGVtcyA9IGN1cnJlbnRJdGVtcztcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmhpZGRlbiA9IGZhbHNlO1xuXHRcdFx0XHRkaXNwb3NhYmxlU3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChwcm9tcHQub25EaWRDaGFuZ2VWYWx1ZSgoKSA9PiB7XG5cdFx0XHRcdHByb21wdC5oaWRlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHByb21wdC5vbkRpZEN1c3RvbSgoKSA9PiB7XG5cdFx0XHRcdHByb21wdC5oaWRlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRwcm9tcHQuc2hvdygpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZSh1cmk6IFVSSSB8IHVuZGVmaW5lZCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh1cmkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5maWxlUGlja0JveC52YWxpZGF0aW9uTWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgncmVtb3RlRmlsZURpYWxvZy5pbnZhbGlkUGF0aCcsICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBwYXRoLicpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG5cdFx0fVxuXG5cdFx0bGV0IHN0YXQ6IElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGEgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHN0YXREaXJuYW1lOiBJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRzdGF0RGlybmFtZSA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uuc3RhdChyZXNvdXJjZXMuZGlybmFtZSh1cmkpKTtcblx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQodXJpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBkbyBub3RoaW5nXG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucmVxdWlyZXNUcmFpbGluZykgeyAvLyBzYXZlXG5cdFx0XHRpZiAoc3RhdD8uaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0Ly8gQ2FuJ3QgZG8gdGhpc1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbGlkYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLnZhbGlkYXRlRm9sZGVyJywgJ1RoZSBmb2xkZXIgYWxyZWFkeSBleGlzdHMuIFBsZWFzZSB1c2UgYSBuZXcgZmlsZSBuYW1lLicpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXQpIHtcblx0XHRcdFx0Ly8gUmVwbGFjaW5nIGEgZmlsZS5cblx0XHRcdFx0Ly8gU2hvdyBhIHllcy9ubyBwcm9tcHRcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgncmVtb3RlRmlsZURpYWxvZy52YWxpZGF0ZUV4aXN0aW5nJywgJ3swfSBhbHJlYWR5IGV4aXN0cy4gQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIG92ZXJ3cml0ZSBpdD8nLCByZXNvdXJjZXMuYmFzZW5hbWUodXJpKSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLnllc05vUHJvbXB0KHVyaSwgbWVzc2FnZSk7XG5cdFx0XHR9IGVsc2UgaWYgKCEoaXNWYWxpZEJhc2VuYW1lKHJlc291cmNlcy5iYXNlbmFtZSh1cmkpLCB0aGlzLmlzV2luZG93cykpKSB7XG5cdFx0XHRcdC8vIEZpbGVuYW1lIG5vdCBhbGxvd2VkXG5cdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ3JlbW90ZUZpbGVEaWFsb2cudmFsaWRhdGVCYWRGaWxlbmFtZScsICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBmaWxlIG5hbWUuJyk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0gZWxzZSBpZiAoIXN0YXREaXJuYW1lKSB7XG5cdFx0XHRcdC8vIEZvbGRlciB0byBzYXZlIGluIGRvZXNuJ3QgZXhpc3Rcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgncmVtb3RlRmlsZURpYWxvZy52YWxpZGF0ZUNyZWF0ZURpcmVjdG9yeScsICdUaGUgZm9sZGVyIHswfSBkb2VzIG5vdCBleGlzdC4gV291bGQgeW91IGxpa2UgdG8gY3JlYXRlIGl0PycsIHJlc291cmNlcy5iYXNlbmFtZShyZXNvdXJjZXMuZGlybmFtZSh1cmkpKSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLnllc05vUHJvbXB0KHVyaSwgbWVzc2FnZSk7XG5cdFx0XHR9IGVsc2UgaWYgKCFzdGF0RGlybmFtZS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbGlkYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLnZhbGlkYXRlTm9uZXhpc3RlbnREaXInLCAnUGxlYXNlIGVudGVyIGEgcGF0aCB0aGF0IGV4aXN0cy4nKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSBlbHNlIGlmIChzdGF0RGlybmFtZS5yZWFkb25seSkge1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbGlkYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLnZhbGlkYXRlUmVhZG9ubHlGb2xkZXInLCAnVGhpcyBmb2xkZXIgY2Fubm90IGJlIHVzZWQgYXMgYSBzYXZlIGRlc3RpbmF0aW9uLiBQbGVhc2UgY2hvb3NlIGFub3RoZXIgZm9sZGVyJyk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9IGVsc2UgeyAvLyBvcGVuXG5cdFx0XHRpZiAoIXN0YXQpIHtcblx0XHRcdFx0Ly8gRm9yIGEgZm9sZGVyLW9ubHkgcGlja2VyLCBvZmZlciB0byBjcmVhdGUgdGhlIGZvbGRlciBpZiBhIHdyaXRhYmxlIGFuY2VzdG9yIGV4aXN0cy5cblx0XHRcdFx0aWYgKHRoaXMuYWxsb3dGb2xkZXJTZWxlY3Rpb24gJiYgIXRoaXMuYWxsb3dGaWxlU2VsZWN0aW9uXG5cdFx0XHRcdFx0JiYgYXdhaXQgdGhpcy5jYW5DcmVhdGVGb2xkZXIodXJpLCBzdGF0RGlybmFtZSkpIHtcblx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLnZhbGlkYXRlQ3JlYXRlRGlyZWN0b3J5T3BlbicsICdUaGUgZm9sZGVyIHswfSBkb2VzIG5vdCBleGlzdC4gV291bGQgeW91IGxpa2UgdG8gY3JlYXRlIGl0PycsIHJlc291cmNlcy5iYXNlbmFtZSh1cmkpKTtcblx0XHRcdFx0XHRjb25zdCBzaG91bGRDcmVhdGUgPSBhd2FpdCB0aGlzLnllc05vUHJvbXB0KHVyaSwgbWVzc2FnZSk7XG5cdFx0XHRcdFx0aWYgKCFzaG91bGRDcmVhdGUpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHVyaSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbGlkYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLmNyZWF0ZUZvbGRlckZhaWxlZCcsICdDb3VsZCBub3QgY3JlYXRlIGZvbGRlcjogezB9JywgZS5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRmlsZSBvciBmb2xkZXIgZG9lc24ndCBleGlzdFxuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbGlkYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKCdyZW1vdGVGaWxlRGlhbG9nLnZhbGlkYXRlTm9uZXhpc3RlbnREaXInLCAnUGxlYXNlIGVudGVyIGEgcGF0aCB0aGF0IGV4aXN0cy4nKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSBlbHNlIGlmICh1cmkucGF0aCA9PT0gJy8nICYmIHRoaXMuaXNXaW5kb3dzKSB7XG5cdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ3JlbW90ZUZpbGVEaWFsb2cud2luZG93c0RyaXZlTGV0dGVyJywgJ1BsZWFzZSBzdGFydCB0aGUgcGF0aCB3aXRoIGEgZHJpdmUgbGV0dGVyLicpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXQuaXNEaXJlY3RvcnkgJiYgIXRoaXMuYWxsb3dGb2xkZXJTZWxlY3Rpb24pIHtcblx0XHRcdFx0Ly8gRm9sZGVyIHNlbGVjdGVkIHdoZW4gZm9sZGVyIHNlbGVjdGlvbiBub3QgcGVybWl0dGVkXG5cdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ3JlbW90ZUZpbGVEaWFsb2cudmFsaWRhdGVGaWxlT25seScsICdQbGVhc2Ugc2VsZWN0IGEgZmlsZS4nKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSBlbHNlIGlmICghc3RhdC5pc0RpcmVjdG9yeSAmJiAhdGhpcy5hbGxvd0ZpbGVTZWxlY3Rpb24pIHtcblx0XHRcdFx0Ly8gRmlsZSBzZWxlY3RlZCB3aGVuIGZpbGUgc2VsZWN0aW9uIG5vdCBwZXJtaXR0ZWRcblx0XHRcdFx0dGhpcy5maWxlUGlja0JveC52YWxpZGF0aW9uTWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgncmVtb3RlRmlsZURpYWxvZy52YWxpZGF0ZUZvbGRlck9ubHknLCAnUGxlYXNlIHNlbGVjdCBhIGZvbGRlci4nKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2FuQ3JlYXRlRm9sZGVyKHVyaTogVVJJLCBwYXJlbnRTdGF0PzogSUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGltbWVkaWF0ZVBhcmVudCA9IHJlc291cmNlcy5kaXJuYW1lKHVyaSk7XG5cdFx0bGV0IGNhbmRpZGF0ZSA9IHVyaTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgbmFtZSA9IHJlc291cmNlcy5iYXNlbmFtZShjYW5kaWRhdGUpO1xuXHRcdFx0aWYgKCFuYW1lIHx8ICFpc1ZhbGlkQmFzZW5hbWUobmFtZSwgdGhpcy5pc1dpbmRvd3MpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGFyZW50ID0gcmVzb3VyY2VzLmRpcm5hbWUoY2FuZGlkYXRlKTtcblx0XHRcdGlmIChyZXNvdXJjZXMuaXNFcXVhbChwYXJlbnQsIGNhbmRpZGF0ZSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gcGFyZW50U3RhdCAmJiByZXNvdXJjZXMuaXNFcXVhbChwYXJlbnQsIGltbWVkaWF0ZVBhcmVudCkgPyBwYXJlbnRTdGF0IDogYXdhaXQgdGhpcy5maWxlU2VydmljZS5zdGF0KHBhcmVudCk7XG5cdFx0XHRcdHJldHVybiBzdGF0LmlzRGlyZWN0b3J5ICYmICFzdGF0LnJlYWRvbmx5O1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRpZiAodG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUoZSBpbnN0YW5jZW9mIEVycm9yID8gZSA6IHVuZGVmaW5lZCkgIT09IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FuZGlkYXRlID0gcGFyZW50O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIFJldHVybnMgdHJ1ZSBpZiB0aGVyZSBpcyBhIGZpbGUgYXQgdGhlIGVuZCBvZiB0aGUgVVJJLlxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUl0ZW1zKG5ld0ZvbGRlcjogVVJJLCBmb3JjZTogYm9vbGVhbiA9IGZhbHNlLCB0cmFpbGluZz86IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRoaXMuYnVzeSA9IHRydWU7XG5cdFx0dGhpcy5hdXRvQ29tcGxldGVQYXRoU2VnbWVudCA9ICcnO1xuXHRcdGNvbnN0IHdhc0RvdERvdCA9IHRyYWlsaW5nID09PSAnLi4nO1xuXHRcdHRyYWlsaW5nID0gd2FzRG90RG90ID8gdW5kZWZpbmVkIDogdHJhaWxpbmc7XG5cdFx0Y29uc3QgaXNTYXZlID0gISF0cmFpbGluZztcblx0XHRsZXQgcmVzdWx0ID0gZmFsc2U7XG5cblx0XHRjb25zdCB1cGRhdGluZ1Byb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyB0b2tlbiA9PiB7XG5cdFx0XHRsZXQgZm9sZGVyU3RhdDogSUZpbGVTdGF0IHwgdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Zm9sZGVyU3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShuZXdGb2xkZXIpO1xuXHRcdFx0XHRpZiAoIWZvbGRlclN0YXQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHR0cmFpbGluZyA9IHJlc291cmNlcy5iYXNlbmFtZShuZXdGb2xkZXIpO1xuXHRcdFx0XHRcdG5ld0ZvbGRlciA9IHJlc291cmNlcy5kaXJuYW1lKG5ld0ZvbGRlcik7XG5cdFx0XHRcdFx0Zm9sZGVyU3RhdCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRyZXN1bHQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIFRoZSBmaWxlL2RpcmVjdG9yeSBkb2Vzbid0IGV4aXN0XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBuZXdWYWx1ZSA9IHRyYWlsaW5nID8gdGhpcy5wYXRoQXBwZW5kKG5ld0ZvbGRlciwgdHJhaWxpbmcpIDogdGhpcy5wYXRoRnJvbVVyaShuZXdGb2xkZXIsIHRydWUpO1xuXHRcdFx0Y29uc3QgY3VycmVudEZvbGRlciA9IHRoaXMuZW5kc1dpdGhTbGFzaChuZXdGb2xkZXIucGF0aCkgPyBuZXdGb2xkZXIgOiByZXNvdXJjZXMuYWRkVHJhaWxpbmdQYXRoU2VwYXJhdG9yKG5ld0ZvbGRlciwgdGhpcy5zZXBhcmF0b3IpO1xuXHRcdFx0Y29uc3QgdXNlckVudGVyZWRQYXRoU2VnbWVudCA9IHRyYWlsaW5nID8gdHJhaWxpbmcgOiAnJztcblxuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlSXRlbXMoZm9sZGVyU3RhdCwgY3VycmVudEZvbGRlciwgdG9rZW4pLnRoZW4oaXRlbXMgPT4ge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLmJ1c3kgPSBmYWxzZTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmN1cnJlbnRGb2xkZXIgPSBjdXJyZW50Rm9sZGVyO1xuXHRcdFx0XHR0aGlzLnVzZXJFbnRlcmVkUGF0aFNlZ21lbnQgPSB1c2VyRW50ZXJlZFBhdGhTZWdtZW50O1xuXHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94Lml0ZW1BY3RpdmF0aW9uID0gSXRlbUFjdGl2YXRpb24uTk9ORTtcblx0XHRcdFx0dGhpcy5maWxlUGlja0JveC5pdGVtcyA9IGl0ZW1zO1xuXG5cdFx0XHRcdC8vIHRoZSB1c2VyIG1pZ2h0IGhhdmUgY29udGludWVkIHR5cGluZyB3aGlsZSB3ZSB3ZXJlIHVwZGF0aW5nLiBPbmx5IHVwZGF0ZSB0aGUgaW5wdXQgYm94IGlmIGl0IGRvZXNuJ3QgbWF0Y2ggdGhlIGRpcmVjdG9yeS5cblx0XHRcdFx0aWYgKCFlcXVhbHNJZ25vcmVDYXNlKHRoaXMuZmlsZVBpY2tCb3gudmFsdWUsIG5ld1ZhbHVlKSAmJiAoZm9yY2UgfHwgd2FzRG90RG90KSkge1xuXHRcdFx0XHRcdHRoaXMuZmlsZVBpY2tCb3gudmFsdWVTZWxlY3Rpb24gPSBbMCwgdGhpcy5maWxlUGlja0JveC52YWx1ZS5sZW5ndGhdO1xuXHRcdFx0XHRcdHRoaXMuaW5zZXJ0VGV4dChuZXdWYWx1ZSwgbmV3VmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmb3JjZSAmJiB0cmFpbGluZyAmJiBpc1NhdmUpIHtcblx0XHRcdFx0XHQvLyBLZWVwIHRoZSBjdXJzb3IgcG9zaXRpb24gaW4gZnJvbnQgb2YgdGhlIHNhdmUgYXMgbmFtZS5cblx0XHRcdFx0XHR0aGlzLmZpbGVQaWNrQm94LnZhbHVlU2VsZWN0aW9uID0gW3RoaXMuZmlsZVBpY2tCb3gudmFsdWUubGVuZ3RoIC0gdHJhaWxpbmcubGVuZ3RoLCB0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aCAtIHRyYWlsaW5nLmxlbmd0aF07XG5cdFx0XHRcdH0gZWxzZSBpZiAoIXRyYWlsaW5nKSB7XG5cdFx0XHRcdFx0Ly8gSWYgdGhlcmUgaXMgdHJhaWxpbmcsIHdlIGRvbid0IG1vdmUgdGhlIGN1cnNvci4gSWYgdGhlcmUgaXMgbm8gdHJhaWxpbmcsIGN1cnNvciBnb2VzIGF0IHRoZSBlbmQuXG5cdFx0XHRcdFx0dGhpcy5maWxlUGlja0JveC52YWx1ZVNlbGVjdGlvbiA9IFt0aGlzLmZpbGVQaWNrQm94LnZhbHVlLmxlbmd0aCwgdGhpcy5maWxlUGlja0JveC52YWx1ZS5sZW5ndGhdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuYnVzeSA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLnVwZGF0aW5nUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0aWYgKHRoaXMudXBkYXRpbmdQcm9taXNlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMudXBkYXRpbmdQcm9taXNlLmNhbmNlbCgpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0aW5nUHJvbWlzZSA9IHVwZGF0aW5nUHJvbWlzZTtcblxuXHRcdHJldHVybiB1cGRhdGluZ1Byb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIHBhdGhGcm9tVXJpKHVyaTogVVJJLCBlbmRXaXRoU2VwYXJhdG9yOiBib29sZWFuID0gZmFsc2UpOiBzdHJpbmcge1xuXHRcdC8vIEZvciBhdXRob3JpdHktc2NvcGVkIHNjaGVtZXMsIHVzZSB0aGUgcmF3IHBhdGggY29tcG9uZW50IGluc3RlYWRcblx0XHQvLyBvZiBmc1BhdGgsIHdoaWNoIHdvdWxkIHByZXBlbmQgdGhlIGF1dGhvcml0eSBhcyBhIFVOQyBwcmVmaXguXG5cdFx0bGV0IHJlc3VsdDogc3RyaW5nO1xuXHRcdGlmICh0aGlzLnNjb3BlZEF1dGhvcml0eSkge1xuXHRcdFx0cmVzdWx0ID0gdXJpLnBhdGgucmVwbGFjZSgvXFxuL2csICcnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0ID0gbm9ybWFsaXplRHJpdmVMZXR0ZXIodXJpLmZzUGF0aCwgdGhpcy5pc1dpbmRvd3MpLnJlcGxhY2UoL1xcbi9nLCAnJyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnNlcGFyYXRvciA9PT0gJy8nKSB7XG5cdFx0XHRyZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFxcXC9nLCB0aGlzLnNlcGFyYXRvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKC9cXC8vZywgdGhpcy5zZXBhcmF0b3IpO1xuXHRcdH1cblx0XHRpZiAoZW5kV2l0aFNlcGFyYXRvciAmJiAhdGhpcy5lbmRzV2l0aFNsYXNoKHJlc3VsdCkpIHtcblx0XHRcdHJlc3VsdCA9IHJlc3VsdCArIHRoaXMuc2VwYXJhdG9yO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBwYXRoQXBwZW5kKHVyaTogVVJJLCBhZGRpdGlvbmFsOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmICgoYWRkaXRpb25hbCA9PT0gJy4uJykgfHwgKGFkZGl0aW9uYWwgPT09ICcuJykpIHtcblx0XHRcdGNvbnN0IGJhc2VQYXRoID0gdGhpcy5wYXRoRnJvbVVyaSh1cmksIHRydWUpO1xuXHRcdFx0cmV0dXJuIGJhc2VQYXRoICsgYWRkaXRpb25hbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMucGF0aEZyb21VcmkocmVzb3VyY2VzLmpvaW5QYXRoKHVyaSwgYWRkaXRpb25hbCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2hlY2tJc1dpbmRvd3NPUygpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgaXNXaW5kb3dzT1MgPSBpc1dpbmRvd3M7XG5cdFx0Y29uc3QgZW52ID0gYXdhaXQgdGhpcy5nZXRSZW1vdGVBZ2VudEVudmlyb25tZW50KCk7XG5cdFx0aWYgKGVudikge1xuXHRcdFx0aXNXaW5kb3dzT1MgPSBlbnYub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzO1xuXHRcdH1cblx0XHRyZXR1cm4gaXNXaW5kb3dzT1M7XG5cdH1cblxuXHRwcml2YXRlIGVuZHNXaXRoU2xhc2goczogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIC9bXFwvXFxcXF0kLy50ZXN0KHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBiYXNlbmFtZVdpdGhUcmFpbGluZ1NsYXNoKGZ1bGxQYXRoOiBVUkkpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNoaWxkID0gdGhpcy5wYXRoRnJvbVVyaShmdWxsUGF0aCwgdHJ1ZSk7XG5cdFx0Y29uc3QgcGFyZW50ID0gdGhpcy5wYXRoRnJvbVVyaShyZXNvdXJjZXMuZGlybmFtZShmdWxsUGF0aCksIHRydWUpO1xuXHRcdHJldHVybiBjaGlsZC5zdWJzdHJpbmcocGFyZW50Lmxlbmd0aCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZUJhY2tJdGVtKGN1cnJGb2xkZXI6IFVSSSk6IFByb21pc2U8RmlsZVF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBGb3IgYXV0aG9yaXR5LXNjb3BlZCBVUklzLCBjb21wYXJlIHdpdGhpbiB0aGUgb3JpZ2luYWwgc2NoZW1lIHNvXG5cdFx0Ly8gdGhhdCB0aGUgYXV0aG9yaXR5IGlzIHByZXNlcnZlZCBhbmQgdGhlIHJvb3QgaXMgZGV0ZWN0ZWQgY29ycmVjdGx5LlxuXHRcdGNvbnN0IGNvbXBhcmVTY2hlbWUgPSB0aGlzLnNjb3BlZEF1dGhvcml0eSA/IHRoaXMuc2NoZW1lIDogU2NoZW1hcy5maWxlO1xuXHRcdGNvbnN0IGNvbXBhcmVBdXRob3JpdHkgPSB0aGlzLnNjb3BlZEF1dGhvcml0eSA/PyAnJztcblx0XHRjb25zdCBmaWxlUmVwcmVzZW50YXRpb25DdXJyID0gY3VyckZvbGRlci53aXRoKHsgc2NoZW1lOiBjb21wYXJlU2NoZW1lLCBhdXRob3JpdHk6IGNvbXBhcmVBdXRob3JpdHkgfSk7XG5cdFx0Y29uc3QgZmlsZVJlcHJlc2VudGF0aW9uUGFyZW50ID0gcmVzb3VyY2VzLmRpcm5hbWUoZmlsZVJlcHJlc2VudGF0aW9uQ3Vycik7XG5cdFx0aWYgKCFyZXNvdXJjZXMuaXNFcXVhbChmaWxlUmVwcmVzZW50YXRpb25DdXJyLCBmaWxlUmVwcmVzZW50YXRpb25QYXJlbnQpKSB7XG5cdFx0XHRjb25zdCBwYXJlbnRGb2xkZXIgPSByZXNvdXJjZXMuZGlybmFtZShjdXJyRm9sZGVyKTtcblx0XHRcdGlmIChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhwYXJlbnRGb2xkZXIpKSB7XG5cdFx0XHRcdHJldHVybiB7IGxhYmVsOiAnLi4nLCB1cmk6IHJlc291cmNlcy5hZGRUcmFpbGluZ1BhdGhTZXBhcmF0b3IocGFyZW50Rm9sZGVyLCB0aGlzLnNlcGFyYXRvciksIGlzRm9sZGVyOiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZUl0ZW1zKGZvbGRlcjogSUZpbGVTdGF0IHwgdW5kZWZpbmVkLCBjdXJyZW50Rm9sZGVyOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RmlsZVF1aWNrUGlja0l0ZW1bXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogRmlsZVF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXG5cdFx0Y29uc3QgYmFja0RpciA9IGF3YWl0IHRoaXMuY3JlYXRlQmFja0l0ZW0oY3VycmVudEZvbGRlcik7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghZm9sZGVyKSB7XG5cdFx0XHRcdGZvbGRlciA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShjdXJyZW50Rm9sZGVyKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZpbHRlcmVkQ2hpbGRyZW4gPSB0aGlzLl9zaG93RG90RmlsZXMgPyBmb2xkZXIuY2hpbGRyZW4gOiBmb2xkZXIuY2hpbGRyZW4/LmZpbHRlcihjaGlsZCA9PiAhY2hpbGQubmFtZS5zdGFydHNXaXRoKCcuJykpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBmaWx0ZXJlZENoaWxkcmVuID8gYXdhaXQgUHJvbWlzZS5hbGwoZmlsdGVyZWRDaGlsZHJlbi5tYXAoY2hpbGQgPT4gdGhpcy5jcmVhdGVJdGVtKGNoaWxkLCBjdXJyZW50Rm9sZGVyLCB0b2tlbikpKSA6IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHRcdGNvbnNvbGUubG9nKGUpO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3Qgc29ydGVkID0gcmVzdWx0LnNvcnQoKGkxLCBpMikgPT4ge1xuXHRcdFx0aWYgKGkxLmlzRm9sZGVyICE9PSBpMi5pc0ZvbGRlcikge1xuXHRcdFx0XHRyZXR1cm4gaTEuaXNGb2xkZXIgPyAtMSA6IDE7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0cmltbWVkMSA9IHRoaXMuZW5kc1dpdGhTbGFzaChpMS5sYWJlbCkgPyBpMS5sYWJlbC5zdWJzdHIoMCwgaTEubGFiZWwubGVuZ3RoIC0gMSkgOiBpMS5sYWJlbDtcblx0XHRcdGNvbnN0IHRyaW1tZWQyID0gdGhpcy5lbmRzV2l0aFNsYXNoKGkyLmxhYmVsKSA/IGkyLmxhYmVsLnN1YnN0cigwLCBpMi5sYWJlbC5sZW5ndGggLSAxKSA6IGkyLmxhYmVsO1xuXHRcdFx0cmV0dXJuIHRyaW1tZWQxLmxvY2FsZUNvbXBhcmUodHJpbW1lZDIpO1xuXHRcdH0pO1xuXG5cdFx0aWYgKGJhY2tEaXIpIHtcblx0XHRcdHNvcnRlZC51bnNoaWZ0KGJhY2tEaXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gc29ydGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJGaWxlKGZpbGU6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuZmlsdGVycykge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLm9wdGlvbnMuZmlsdGVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRmb3IgKGxldCBqID0gMDsgaiA8IHRoaXMub3B0aW9ucy5maWx0ZXJzW2ldLmV4dGVuc2lvbnMubGVuZ3RoOyBqKyspIHtcblx0XHRcdFx0XHRjb25zdCB0ZXN0RXh0ID0gdGhpcy5vcHRpb25zLmZpbHRlcnNbaV0uZXh0ZW5zaW9uc1tqXTtcblx0XHRcdFx0XHRpZiAoKHRlc3RFeHQgPT09ICcqJykgfHwgKGZpbGUucGF0aC5lbmRzV2l0aCgnLicgKyB0ZXN0RXh0KSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlSXRlbShzdGF0OiBJRmlsZVN0YXQsIHBhcmVudDogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEZpbGVRdWlja1BpY2tJdGVtIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgZnVsbFBhdGggPSByZXNvdXJjZXMuam9pblBhdGgocGFyZW50LCBzdGF0Lm5hbWUpO1xuXHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRjb25zdCBmaWxlbmFtZSA9IHJlc291cmNlcy5iYXNlbmFtZShmdWxsUGF0aCk7XG5cdFx0XHRmdWxsUGF0aCA9IHJlc291cmNlcy5hZGRUcmFpbGluZ1BhdGhTZXBhcmF0b3IoZnVsbFBhdGgsIHRoaXMuc2VwYXJhdG9yKTtcblx0XHRcdHJldHVybiB7IGxhYmVsOiBmaWxlbmFtZSwgdXJpOiBmdWxsUGF0aCwgaXNGb2xkZXI6IHRydWUsIGljb25DbGFzc2VzOiBnZXRJY29uQ2xhc3Nlcyh0aGlzLm1vZGVsU2VydmljZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIGZ1bGxQYXRoIHx8IHVuZGVmaW5lZCwgRmlsZUtpbmQuRk9MREVSKSB9O1xuXHRcdH0gZWxzZSBpZiAoIXN0YXQuaXNEaXJlY3RvcnkgJiYgdGhpcy5hbGxvd0ZpbGVTZWxlY3Rpb24gJiYgdGhpcy5maWx0ZXJGaWxlKGZ1bGxQYXRoKSkge1xuXHRcdFx0cmV0dXJuIHsgbGFiZWw6IHN0YXQubmFtZSwgdXJpOiBmdWxsUGF0aCwgaXNGb2xkZXI6IGZhbHNlLCBpY29uQ2xhc3NlczogZ2V0SWNvbkNsYXNzZXModGhpcy5tb2RlbFNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCBmdWxsUGF0aCB8fCB1bmRlZmluZWQpIH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksZUFBZTtBQUMzQixZQUFZLGFBQWE7QUFDekIsU0FBUyxjQUF5QixVQUF3Qyw2QkFBNkIscUNBQXFDO0FBQzVJLFNBQVMsb0JBQWdELHNCQUFzQjtBQUMvRSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxXQUFXLHVCQUF1QjtBQUMzQyxTQUFpRCwwQkFBMEI7QUFDM0UsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQWlDLHFCQUFxQjtBQUMvRCxTQUFTLGtCQUFrQixRQUFRLDRCQUE0QjtBQUMvRCxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUE4Qix5QkFBeUI7QUFDNUUsU0FBUywrQkFBa0Q7QUFHM0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBRXRELElBQVU7QUFBQSxDQUFWLENBQVVBLDBCQUFWO0FBQ0MsRUFBTUEsc0JBQUEsS0FBSztBQUNYLEVBQU1BLHNCQUFBLFFBQVEsSUFBSSxTQUFTLGlCQUFpQixvQkFB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RUFFQSxNQUFjLFdBQVcsTUFBaUIsUUFBYSxPQUFrRTtBQUN4SCxRQUFJLE1BQU0seUJBQXlCO0FBQ2xDLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxXQUFXLFVBQVUsU0FBUyxRQUFRLEtBQUssSUFBSTtBQUNuRCxRQUFJLEtBQUssYUFBYTtBQUNyQixZQUFNLFdBQVcsVUFBVSxTQUFTLFFBQVE7QUFDNUMsaUJBQVcsVUFBVSx5QkFBeUIsVUFBVSxLQUFLLFNBQVM7QUFDdEUsYUFBTyxFQUFFLE9BQU8sVUFBVSxLQUFLLFVBQVUsVUFBVSxNQUFNLGFBQWEsZUFBZSxLQUFLLGNBQWMsS0FBSyxpQkFBaUIsWUFBWSxRQUFXLFNBQVMsTUFBTSxFQUFFO0FBQUEsSUFDdkssV0FBVyxDQUFDLEtBQUssZUFBZSxLQUFLLHNCQUFzQixLQUFLLFdBQVcsUUFBUSxHQUFHO0FBQ3JGLGFBQU8sRUFBRSxPQUFPLEtBQUssTUFBTSxLQUFLLFVBQVUsVUFBVSxPQUFPLGFBQWEsZUFBZSxLQUFLLGNBQWMsS0FBSyxpQkFBaUIsWUFBWSxNQUFTLEVBQUU7QUFBQSxJQUN4SjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFqa0NhLG1CQUFOO0FBQUEsRUFtQ0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBakRVOyIsCiAgIm5hbWVzIjogWyJPcGVuTG9jYWxGaWxlQ29tbWFuZCIsICJTYXZlTG9jYWxGaWxlQ29tbWFuZCIsICJPcGVuTG9jYWxGb2xkZXJDb21tYW5kIiwgIk9wZW5Mb2NhbEZpbGVGb2xkZXJDb21tYW5kIiwgIlVwZGF0ZVJlc3VsdCJdCn0K
