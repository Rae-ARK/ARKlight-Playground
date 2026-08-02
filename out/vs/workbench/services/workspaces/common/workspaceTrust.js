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
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IRemoteAuthorityResolverService } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { getRemoteAuthority } from "../../../../platform/remote/common/remoteHosts.js";
import { isVirtualResource } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { AGENT_HOST_SCHEME } from "../../../../platform/agentHost/common/agentHostUri.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { isSavedWorkspace, isSingleFolderWorkspaceIdentifier, isTemporaryWorkspace, IWorkspaceContextService, toWorkspaceIdentifier, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, WorkspaceTrustUriResponse, IWorkspaceTrustEnablementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { Memento } from "../../../common/memento.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { isEqualAuthority } from "../../../../base/common/resources.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { promiseWithResolvers } from "../../../../base/common/async.js";
import { ResourceMap } from "../../../../base/common/map.js";
const WORKSPACE_TRUST_ENABLED = "security.workspace.trust.enabled";
const WORKSPACE_TRUST_STARTUP_PROMPT = "security.workspace.trust.startupPrompt";
const WORKSPACE_TRUST_BANNER = "security.workspace.trust.banner";
const WORKSPACE_TRUST_UNTRUSTED_FILES = "security.workspace.trust.untrustedFiles";
const WORKSPACE_TRUST_EMPTY_WINDOW = "security.workspace.trust.emptyWindow";
const WORKSPACE_TRUST_EXTENSION_SUPPORT = "extensions.supportUntrustedWorkspaces";
const WORKSPACE_TRUST_STORAGE_KEY = "content.trust.model.key";
class CanonicalWorkspace {
  constructor(originalWorkspace, canonicalFolderUris, canonicalConfiguration) {
    this.originalWorkspace = originalWorkspace;
    this.canonicalFolderUris = canonicalFolderUris;
    this.canonicalConfiguration = canonicalConfiguration;
  }
  get folders() {
    return this.originalWorkspace.folders.map((folder, index) => {
      return {
        index: folder.index,
        name: folder.name,
        toResource: folder.toResource,
        uri: this.canonicalFolderUris[index]
      };
    });
  }
  get transient() {
    return this.originalWorkspace.transient;
  }
  get configuration() {
    return this.canonicalConfiguration ?? this.originalWorkspace.configuration;
  }
  get id() {
    return this.originalWorkspace.id;
  }
}
let WorkspaceTrustEnablementService = class extends Disposable {
  constructor(configurationService, environmentService) {
    super();
    this.configurationService = configurationService;
    this.environmentService = environmentService;
  }
  isWorkspaceTrustEnabled() {
    if (this.environmentService.disableWorkspaceTrust) {
      return false;
    }
    return !!this.configurationService.getValue(WORKSPACE_TRUST_ENABLED);
  }
};
WorkspaceTrustEnablementService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IWorkbenchEnvironmentService)
], WorkspaceTrustEnablementService);
let WorkspaceTrustManagementService = class extends Disposable {
  constructor(configurationService, remoteAuthorityResolverService, storageService, uriIdentityService, environmentService, workspaceService, workspaceTrustEnablementService, fileService) {
    super();
    this.configurationService = configurationService;
    this.remoteAuthorityResolverService = remoteAuthorityResolverService;
    this.storageService = storageService;
    this.uriIdentityService = uriIdentityService;
    this.environmentService = environmentService;
    this.workspaceService = workspaceService;
    this.workspaceTrustEnablementService = workspaceTrustEnablementService;
    this.fileService = fileService;
    this.storageKey = WORKSPACE_TRUST_STORAGE_KEY;
    this._onDidChangeTrust = this._register(new Emitter());
    this.onDidChangeTrust = this._onDidChangeTrust.event;
    this._onDidChangeTrustedFolders = this._register(new Emitter());
    this.onDidChangeTrustedFolders = this._onDidChangeTrustedFolders.event;
    this._canonicalStartupFiles = [];
    this._canonicalUrisResolved = false;
    this._canonicalWorkspace = this.workspaceService.getWorkspace();
    ({ promise: this._workspaceResolvedPromise, resolve: this._workspaceResolvedPromiseResolve } = promiseWithResolvers());
    ({ promise: this._workspaceTrustInitializedPromise, resolve: this._workspaceTrustInitializedPromiseResolve } = promiseWithResolvers());
    this._storedTrustState = new WorkspaceTrustMemento(isWeb && this.isEmptyWorkspace() ? void 0 : this.storageService);
    this._trustTransitionManager = this._register(new WorkspaceTrustTransitionManager());
    this._trustStateInfo = this.loadTrustInfo();
    this._isTrusted = this.calculateWorkspaceTrust();
    this.initializeWorkspaceTrust();
    this.registerListeners();
  }
  //#region initialize
  initializeWorkspaceTrust() {
    this.resolveCanonicalUris().then(async () => {
      this._canonicalUrisResolved = true;
      await this.updateWorkspaceTrust();
    }).finally(() => {
      this._workspaceResolvedPromiseResolve();
      if (!this.environmentService.remoteAuthority) {
        this._workspaceTrustInitializedPromiseResolve();
      }
    });
    if (this.environmentService.remoteAuthority) {
      this.remoteAuthorityResolverService.resolveAuthority(this.environmentService.remoteAuthority).then(async (result) => {
        this._remoteAuthority = result;
        await this.fileService.activateProvider(Schemas.vscodeRemote);
        await this.updateWorkspaceTrust();
      }).finally(() => {
        this._workspaceTrustInitializedPromiseResolve();
      });
    }
    if (this.isEmptyWorkspace()) {
      this._workspaceTrustInitializedPromise.then(() => {
        if (this._storedTrustState.isEmptyWorkspaceTrusted === void 0) {
          this._storedTrustState.isEmptyWorkspaceTrusted = this.isWorkspaceTrusted();
        }
      });
    }
  }
  //#endregion
  //#region private interface
  registerListeners() {
    this._register(this.workspaceService.onDidChangeWorkspaceFolders(async () => await this.updateWorkspaceTrust()));
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION_SHARED, this.storageKey, this._store)(async () => {
      if (JSON.stringify(this._trustStateInfo) !== JSON.stringify(this.loadTrustInfo())) {
        this._trustStateInfo = this.loadTrustInfo();
        this._onDidChangeTrustedFolders.fire();
        await this.updateWorkspaceTrust();
      }
    }));
  }
  async getCanonicalUri(uri) {
    let canonicalUri = uri;
    if (this.environmentService.remoteAuthority && uri.scheme === Schemas.vscodeRemote) {
      canonicalUri = await this.remoteAuthorityResolverService.getCanonicalURI(uri);
    } else if (uri.scheme === "vscode-vfs") {
      const index = uri.authority.indexOf("+");
      if (index !== -1) {
        canonicalUri = uri.with({ authority: uri.authority.substr(0, index) });
      }
    }
    return canonicalUri.with({ query: null, fragment: null });
  }
  async resolveCanonicalUris() {
    const filesToOpen = [];
    if (this.environmentService.filesToOpenOrCreate) {
      filesToOpen.push(...this.environmentService.filesToOpenOrCreate);
    }
    if (this.environmentService.filesToDiff) {
      filesToOpen.push(...this.environmentService.filesToDiff);
    }
    if (this.environmentService.filesToMerge) {
      filesToOpen.push(...this.environmentService.filesToMerge);
    }
    if (filesToOpen.length) {
      const filesToOpenOrCreateUris = filesToOpen.filter((f) => !!f.fileUri).map((f) => f.fileUri);
      const canonicalFilesToOpen = await Promise.all(filesToOpenOrCreateUris.map((uri) => this.getCanonicalUri(uri)));
      this._canonicalStartupFiles.push(...canonicalFilesToOpen.filter((uri) => this._canonicalStartupFiles.every((u) => !this.uriIdentityService.extUri.isEqual(uri, u))));
    }
    const workspaceUris = this.workspaceService.getWorkspace().folders.map((f) => f.uri);
    const canonicalWorkspaceFolders = await Promise.all(workspaceUris.map((uri) => this.getCanonicalUri(uri)));
    let canonicalWorkspaceConfiguration = this.workspaceService.getWorkspace().configuration;
    if (canonicalWorkspaceConfiguration && isSavedWorkspace(canonicalWorkspaceConfiguration, this.environmentService)) {
      canonicalWorkspaceConfiguration = await this.getCanonicalUri(canonicalWorkspaceConfiguration);
    }
    this._canonicalWorkspace = new CanonicalWorkspace(this.workspaceService.getWorkspace(), canonicalWorkspaceFolders, canonicalWorkspaceConfiguration);
  }
  loadTrustInfo() {
    const infoAsString = this.storageService.get(this.storageKey, StorageScope.APPLICATION_SHARED);
    let result;
    try {
      if (infoAsString) {
        result = JSON.parse(infoAsString);
      }
    } catch {
    }
    if (!result) {
      result = {
        uriTrustInfo: []
      };
    }
    if (!result.uriTrustInfo) {
      result.uriTrustInfo = [];
    }
    result.uriTrustInfo = result.uriTrustInfo.map((info) => {
      return { uri: URI.revive(info.uri), trusted: info.trusted };
    });
    result.uriTrustInfo = result.uriTrustInfo.filter((info) => info.trusted);
    return result;
  }
  async saveTrustInfo() {
    this.storageService.store(this.storageKey, JSON.stringify(this._trustStateInfo), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
    this._onDidChangeTrustedFolders.fire();
    await this.updateWorkspaceTrust();
  }
  getWorkspaceUris() {
    const workspaceUris = this._canonicalWorkspace.folders.map((f) => f.uri);
    const workspaceConfiguration = this._canonicalWorkspace.configuration;
    if (workspaceConfiguration && isSavedWorkspace(workspaceConfiguration, this.environmentService)) {
      workspaceUris.push(workspaceConfiguration);
    }
    return workspaceUris;
  }
  calculateWorkspaceTrust() {
    if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
      return true;
    }
    if (!this._canonicalUrisResolved) {
      return false;
    }
    if (this.environmentService.remoteAuthority && this._remoteAuthority?.options?.isTrusted) {
      return this._remoteAuthority.options.isTrusted;
    }
    if (this.isEmptyWorkspace()) {
      if (this._storedTrustState.isEmptyWorkspaceTrusted !== void 0) {
        return this._storedTrustState.isEmptyWorkspaceTrusted;
      }
      if (this._canonicalStartupFiles.length) {
        return this.getUrisTrust(this._canonicalStartupFiles);
      }
      return !!this.configurationService.getValue(WORKSPACE_TRUST_EMPTY_WINDOW);
    }
    return this.getUrisTrust(this.getWorkspaceUris());
  }
  async updateWorkspaceTrust(trusted) {
    if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
      return;
    }
    if (trusted === void 0) {
      await this.resolveCanonicalUris();
      trusted = this.calculateWorkspaceTrust();
    }
    if (this.isWorkspaceTrusted() === trusted) {
      return;
    }
    this.isTrusted = trusted;
    await this._trustTransitionManager.participate(trusted);
    this._onDidChangeTrust.fire(trusted);
  }
  getUrisTrust(uris) {
    let state = true;
    for (const uri of uris) {
      const { trusted } = this.doGetUriTrustInfo(uri);
      if (!trusted) {
        state = trusted;
        return state;
      }
    }
    return state;
  }
  doGetUriTrustInfo(uri) {
    if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
      return { trusted: true, uri };
    }
    if (this.uriIdentityService.extUri.isEqual(uri, this.environmentService.agentSessionsWorkspace)) {
      return { trusted: true, uri };
    }
    if (this.isTrustedVirtualResource(uri)) {
      return { trusted: true, uri };
    }
    if (this.isTrustedByRemote(uri)) {
      return { trusted: true, uri };
    }
    let resultState = false;
    let maxLength = -1;
    let resultUri = uri;
    for (const trustInfo of this._trustStateInfo.uriTrustInfo) {
      if (this.uriIdentityService.extUri.isEqualOrParent(uri, trustInfo.uri)) {
        const fsPath = trustInfo.uri.fsPath;
        if (fsPath.length > maxLength) {
          maxLength = fsPath.length;
          resultState = trustInfo.trusted;
          resultUri = trustInfo.uri;
        }
      }
    }
    return { trusted: resultState, uri: resultUri };
  }
  async doSetUrisTrust(uris, trusted) {
    let changed = false;
    for (const uri of uris) {
      if (trusted) {
        if (this.isTrustedVirtualResource(uri)) {
          continue;
        }
        if (this.isTrustedByRemote(uri)) {
          continue;
        }
        const foundItem = this._trustStateInfo.uriTrustInfo.find((trustInfo) => this.uriIdentityService.extUri.isEqual(trustInfo.uri, uri));
        if (!foundItem) {
          this._trustStateInfo.uriTrustInfo.push({ uri, trusted: true });
          changed = true;
        }
      } else {
        const previousLength = this._trustStateInfo.uriTrustInfo.length;
        this._trustStateInfo.uriTrustInfo = this._trustStateInfo.uriTrustInfo.filter((trustInfo) => !this.uriIdentityService.extUri.isEqual(trustInfo.uri, uri));
        if (previousLength !== this._trustStateInfo.uriTrustInfo.length) {
          changed = true;
        }
      }
    }
    if (changed) {
      await this.saveTrustInfo();
    }
  }
  isEmptyWorkspace() {
    if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
      return true;
    }
    const workspace = this.workspaceService.getWorkspace();
    if (workspace) {
      return isTemporaryWorkspace(this.workspaceService.getWorkspace()) && workspace.folders.length === 0;
    }
    return false;
  }
  isTrustedVirtualResource(uri) {
    return isVirtualResource(uri) && uri.scheme !== "vscode-vfs" && uri.scheme !== AGENT_HOST_SCHEME;
  }
  isTrustedByRemote(uri) {
    if (!this.environmentService.remoteAuthority) {
      return false;
    }
    if (!this._remoteAuthority) {
      return false;
    }
    return isEqualAuthority(getRemoteAuthority(uri), this._remoteAuthority.authority.authority) && !!this._remoteAuthority.options?.isTrusted;
  }
  set isTrusted(value) {
    this._isTrusted = value;
    if (!value) {
      this._storedTrustState.acceptsOutOfWorkspaceFiles = false;
    }
    if (this.isEmptyWorkspace()) {
      this._storedTrustState.isEmptyWorkspaceTrusted = value;
    }
  }
  //#endregion
  //#region public interface
  get workspaceResolved() {
    return this._workspaceResolvedPromise;
  }
  get workspaceTrustInitialized() {
    return this._workspaceTrustInitializedPromise;
  }
  get acceptsOutOfWorkspaceFiles() {
    return this._storedTrustState.acceptsOutOfWorkspaceFiles;
  }
  set acceptsOutOfWorkspaceFiles(value) {
    this._storedTrustState.acceptsOutOfWorkspaceFiles = value;
  }
  isWorkspaceTrusted() {
    return this._isTrusted;
  }
  isWorkspaceTrustForced() {
    if (this.environmentService.remoteAuthority && this._remoteAuthority?.options?.isTrusted !== void 0) {
      return true;
    }
    const workspaceUris = this.getWorkspaceUris().filter((uri) => !this.isTrustedVirtualResource(uri));
    if (workspaceUris.length === 0) {
      return true;
    }
    return false;
  }
  canSetParentFolderTrust() {
    const workspaceIdentifier = toWorkspaceIdentifier(this._canonicalWorkspace);
    if (!isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
      return false;
    }
    if (workspaceIdentifier.uri.scheme !== Schemas.file && workspaceIdentifier.uri.scheme !== Schemas.vscodeRemote) {
      return false;
    }
    const parentFolder = this.uriIdentityService.extUri.dirname(workspaceIdentifier.uri);
    if (this.uriIdentityService.extUri.isEqual(workspaceIdentifier.uri, parentFolder)) {
      return false;
    }
    return true;
  }
  async setParentFolderTrust(trusted) {
    if (this.canSetParentFolderTrust()) {
      const workspaceUri = toWorkspaceIdentifier(this._canonicalWorkspace).uri;
      const parentFolder = this.uriIdentityService.extUri.dirname(workspaceUri);
      await this.setUrisTrust([parentFolder], trusted);
    }
  }
  canSetWorkspaceTrust() {
    if (this.environmentService.remoteAuthority && (!this._remoteAuthority || this._remoteAuthority.options?.isTrusted !== void 0)) {
      return false;
    }
    if (this.isEmptyWorkspace()) {
      return true;
    }
    const workspaceUris = this.getWorkspaceUris().filter((uri) => !this.isTrustedVirtualResource(uri));
    if (workspaceUris.length === 0) {
      return false;
    }
    if (!this.isWorkspaceTrusted()) {
      return true;
    }
    const workspaceIdentifier = toWorkspaceIdentifier(this._canonicalWorkspace);
    if (!isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
      return false;
    }
    if (workspaceIdentifier.uri.scheme !== Schemas.file && workspaceIdentifier.uri.scheme !== "vscode-vfs") {
      return false;
    }
    const trustInfo = this.doGetUriTrustInfo(workspaceIdentifier.uri);
    if (!trustInfo.trusted || !this.uriIdentityService.extUri.isEqual(workspaceIdentifier.uri, trustInfo.uri)) {
      return false;
    }
    if (this.canSetParentFolderTrust()) {
      const parentFolder = this.uriIdentityService.extUri.dirname(workspaceIdentifier.uri);
      const parentPathTrustInfo = this.doGetUriTrustInfo(parentFolder);
      if (parentPathTrustInfo.trusted) {
        return false;
      }
    }
    return true;
  }
  async setWorkspaceTrust(trusted) {
    if (this.isEmptyWorkspace()) {
      await this.updateWorkspaceTrust(trusted);
      return;
    }
    const workspaceFolders = this.getWorkspaceUris();
    await this.setUrisTrust(workspaceFolders, trusted);
  }
  async getUriTrustInfo(uri) {
    if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
      return { trusted: true, uri };
    }
    if (this.isTrustedByRemote(uri)) {
      return { trusted: true, uri };
    }
    return this.doGetUriTrustInfo(await this.getCanonicalUri(uri));
  }
  async setUrisTrust(uris, trusted) {
    this.doSetUrisTrust(await Promise.all(uris.map((uri) => this.getCanonicalUri(uri))), trusted);
  }
  getTrustedUris() {
    return this._trustStateInfo.uriTrustInfo.map((info) => info.uri);
  }
  async setTrustedUris(uris) {
    this._trustStateInfo.uriTrustInfo = [];
    for (const uri of uris) {
      const canonicalUri = await this.getCanonicalUri(uri);
      const cleanUri = this.uriIdentityService.extUri.removeTrailingPathSeparator(canonicalUri);
      let added = false;
      for (const addedUri of this._trustStateInfo.uriTrustInfo) {
        if (this.uriIdentityService.extUri.isEqual(addedUri.uri, cleanUri)) {
          added = true;
          break;
        }
      }
      if (added) {
        continue;
      }
      this._trustStateInfo.uriTrustInfo.push({
        trusted: true,
        uri: cleanUri
      });
    }
    await this.saveTrustInfo();
  }
  addWorkspaceTrustTransitionParticipant(participant) {
    return this._trustTransitionManager.addWorkspaceTrustTransitionParticipant(participant);
  }
  //#endregion
};
WorkspaceTrustManagementService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IRemoteAuthorityResolverService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IWorkspaceTrustEnablementService),
  __decorateParam(7, IFileService)
], WorkspaceTrustManagementService);
let WorkspaceTrustRequestService = class extends Disposable {
  constructor(configurationService, workspaceTrustManagementService) {
    super();
    this.configurationService = configurationService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this._resourcesTrustRequestPromises = new ResourceMap();
    this._resourcesTrustRequestResolvers = new ResourceMap();
    this._onDidInitiateOpenFilesTrustRequest = this._register(new Emitter());
    this.onDidInitiateOpenFilesTrustRequest = this._onDidInitiateOpenFilesTrustRequest.event;
    this._onDidInitiateResourcesTrustRequest = this._register(new Emitter());
    this.onDidInitiateResourcesTrustRequest = this._onDidInitiateResourcesTrustRequest.event;
    this._onDidInitiateWorkspaceTrustRequest = this._register(new Emitter());
    this.onDidInitiateWorkspaceTrustRequest = this._onDidInitiateWorkspaceTrustRequest.event;
    this._onDidInitiateWorkspaceTrustRequestOnStartup = this._register(new Emitter());
    this.onDidInitiateWorkspaceTrustRequestOnStartup = this._onDidInitiateWorkspaceTrustRequestOnStartup.event;
  }
  //#region Open file(s) trust request
  get untrustedFilesSetting() {
    return this.configurationService.getValue(WORKSPACE_TRUST_UNTRUSTED_FILES);
  }
  set untrustedFilesSetting(value) {
    this.configurationService.updateValue(WORKSPACE_TRUST_UNTRUSTED_FILES, value);
  }
  async completeOpenFilesTrustRequest(result, saveResponse) {
    if (!this._openFilesTrustRequestResolver) {
      return;
    }
    if (result === WorkspaceTrustUriResponse.Open) {
      this.workspaceTrustManagementService.acceptsOutOfWorkspaceFiles = true;
    }
    if (saveResponse) {
      if (result === WorkspaceTrustUriResponse.Open) {
        this.untrustedFilesSetting = "open";
      }
      if (result === WorkspaceTrustUriResponse.OpenInNewWindow) {
        this.untrustedFilesSetting = "newWindow";
      }
    }
    this._openFilesTrustRequestResolver(result);
    this._openFilesTrustRequestResolver = void 0;
    this._openFilesTrustRequestPromise = void 0;
  }
  async requestOpenFilesTrust(uris) {
    if (!this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      return WorkspaceTrustUriResponse.Open;
    }
    const openFilesTrustInfo = await Promise.all(uris.map((uri) => this.workspaceTrustManagementService.getUriTrustInfo(uri)));
    if (openFilesTrustInfo.map((info) => info.trusted).every((trusted) => trusted)) {
      return WorkspaceTrustUriResponse.Open;
    }
    if (this.untrustedFilesSetting !== "prompt") {
      if (this.untrustedFilesSetting === "newWindow") {
        return WorkspaceTrustUriResponse.OpenInNewWindow;
      }
      if (this.untrustedFilesSetting === "open") {
        return WorkspaceTrustUriResponse.Open;
      }
    }
    if (this.workspaceTrustManagementService.acceptsOutOfWorkspaceFiles) {
      return WorkspaceTrustUriResponse.Open;
    }
    if (!this._openFilesTrustRequestPromise) {
      this._openFilesTrustRequestPromise = new Promise((resolve) => {
        this._openFilesTrustRequestResolver = resolve;
      });
    } else {
      return this._openFilesTrustRequestPromise;
    }
    this._onDidInitiateOpenFilesTrustRequest.fire();
    return this._openFilesTrustRequestPromise;
  }
  //#endregion
  //#region Resource(s) trust request
  async completeResourcesTrustRequest(uri, result) {
    const resolver = this._resourcesTrustRequestResolvers.get(uri);
    if (!resolver) {
      return;
    }
    const trusted = result === WorkspaceTrustUriResponse.Open;
    await this.workspaceTrustManagementService.setUrisTrust([uri], trusted);
    resolver(trusted);
    this._resourcesTrustRequestResolvers.delete(uri);
    this._resourcesTrustRequestPromises.delete(uri);
  }
  async requestResourcesTrust(options) {
    const resourcesTrustInfo = await this.workspaceTrustManagementService.getUriTrustInfo(options.uri);
    if (resourcesTrustInfo.trusted) {
      return true;
    }
    const existingPromise = this._resourcesTrustRequestPromises.get(options.uri);
    if (existingPromise) {
      return existingPromise;
    }
    const promise = new Promise((resolve) => {
      this._resourcesTrustRequestResolvers.set(options.uri, resolve);
    });
    this._resourcesTrustRequestPromises.set(options.uri, promise);
    this._onDidInitiateResourcesTrustRequest.fire(options);
    return promise;
  }
  //#endregion
  //#region Workspace trust request
  resolveWorkspaceTrustRequest(trusted) {
    if (this._workspaceTrustRequestResolver) {
      this._workspaceTrustRequestResolver(trusted ?? this.workspaceTrustManagementService.isWorkspaceTrusted());
      this._workspaceTrustRequestResolver = void 0;
      this._workspaceTrustRequestPromise = void 0;
    }
  }
  cancelWorkspaceTrustRequest() {
    if (this._workspaceTrustRequestResolver) {
      this._workspaceTrustRequestResolver(void 0);
      this._workspaceTrustRequestResolver = void 0;
      this._workspaceTrustRequestPromise = void 0;
    }
  }
  async completeWorkspaceTrustRequest(trusted) {
    if (trusted === void 0 || trusted === this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      this.resolveWorkspaceTrustRequest(trusted);
      return;
    }
    Event.once(this.workspaceTrustManagementService.onDidChangeTrust)((trusted2) => this.resolveWorkspaceTrustRequest(trusted2));
    await this.workspaceTrustManagementService.setWorkspaceTrust(trusted);
  }
  async requestWorkspaceTrust(options) {
    if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      return this.workspaceTrustManagementService.isWorkspaceTrusted();
    }
    if (!this._workspaceTrustRequestPromise) {
      this._workspaceTrustRequestPromise = new Promise((resolve) => {
        this._workspaceTrustRequestResolver = resolve;
      });
    } else {
      return this._workspaceTrustRequestPromise;
    }
    this._onDidInitiateWorkspaceTrustRequest.fire(options);
    return this._workspaceTrustRequestPromise;
  }
  requestWorkspaceTrustOnStartup() {
    if (!this._workspaceTrustRequestPromise) {
      this._workspaceTrustRequestPromise = new Promise((resolve) => {
        this._workspaceTrustRequestResolver = resolve;
      });
    }
    this._onDidInitiateWorkspaceTrustRequestOnStartup.fire();
  }
  //#endregion
};
WorkspaceTrustRequestService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IWorkspaceTrustManagementService)
], WorkspaceTrustRequestService);
class WorkspaceTrustTransitionManager extends Disposable {
  constructor() {
    super(...arguments);
    this.participants = new LinkedList();
  }
  addWorkspaceTrustTransitionParticipant(participant) {
    const remove = this.participants.push(participant);
    return toDisposable(() => remove());
  }
  async participate(trusted) {
    for (const participant of this.participants) {
      await participant.participate(trusted);
    }
  }
  dispose() {
    this.participants.clear();
    super.dispose();
  }
}
class WorkspaceTrustMemento {
  constructor(storageService) {
    this._acceptsOutOfWorkspaceFilesKey = "acceptsOutOfWorkspaceFiles";
    this._isEmptyWorkspaceTrustedKey = "isEmptyWorkspaceTrusted";
    if (storageService) {
      this._memento = new Memento("workspaceTrust", storageService);
      this._mementoObject = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this._mementoObject = {};
    }
  }
  get acceptsOutOfWorkspaceFiles() {
    return this._mementoObject[this._acceptsOutOfWorkspaceFilesKey] ?? false;
  }
  set acceptsOutOfWorkspaceFiles(value) {
    this._mementoObject[this._acceptsOutOfWorkspaceFilesKey] = value;
    this._memento?.saveMemento();
  }
  get isEmptyWorkspaceTrusted() {
    return this._mementoObject[this._isEmptyWorkspaceTrustedKey];
  }
  set isEmptyWorkspaceTrusted(value) {
    this._mementoObject[this._isEmptyWorkspaceTrustedKey] = value;
    this._memento?.saveMemento();
  }
}
registerSingleton(IWorkspaceTrustRequestService, WorkspaceTrustRequestService, InstantiationType.Delayed);
export {
  CanonicalWorkspace,
  WORKSPACE_TRUST_BANNER,
  WORKSPACE_TRUST_EMPTY_WINDOW,
  WORKSPACE_TRUST_ENABLED,
  WORKSPACE_TRUST_EXTENSION_SUPPORT,
  WORKSPACE_TRUST_STARTUP_PROMPT,
  WORKSPACE_TRUST_STORAGE_KEY,
  WORKSPACE_TRUST_UNTRUSTED_FILES,
  WorkspaceTrustEnablementService,
  WorkspaceTrustManagementService,
  WorkspaceTrustRequestService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMaW5rZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkTGlzdC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSwgUmVzb2x2ZXJSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyLmpzJztcbmltcG9ydCB7IGdldFJlbW90ZUF1dGhvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlSG9zdHMuanMnO1xuaW1wb3J0IHsgaXNWaXJ0dWFsUmVzb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3ZpcnR1YWxXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9TQ0hFTUUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIGlzU2F2ZWRXb3Jrc3BhY2UsIGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgaXNUZW1wb3JhcnlXb3Jrc3BhY2UsIElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciwgdG9Xb3Jrc3BhY2VJZGVudGlmaWVyLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZVRydXN0UmVxdWVzdE9wdGlvbnMsIElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RJbmZvLCBJV29ya3NwYWNlVHJ1c3RVcmlJbmZvLCBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSwgSVdvcmtzcGFjZVRydXN0VHJhbnNpdGlvblBhcnRpY2lwYW50LCBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLCBJV29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZSwgUmVzb3VyY2VUcnVzdFJlcXVlc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBNZW1lbnRvIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21lbWVudG8uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsQXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IHByb21pc2VXaXRoUmVzb2x2ZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuXG5leHBvcnQgY29uc3QgV09SS1NQQUNFX1RSVVNUX0VOQUJMRUQgPSAnc2VjdXJpdHkud29ya3NwYWNlLnRydXN0LmVuYWJsZWQnO1xuZXhwb3J0IGNvbnN0IFdPUktTUEFDRV9UUlVTVF9TVEFSVFVQX1BST01QVCA9ICdzZWN1cml0eS53b3Jrc3BhY2UudHJ1c3Quc3RhcnR1cFByb21wdCc7XG5leHBvcnQgY29uc3QgV09SS1NQQUNFX1RSVVNUX0JBTk5FUiA9ICdzZWN1cml0eS53b3Jrc3BhY2UudHJ1c3QuYmFubmVyJztcbmV4cG9ydCBjb25zdCBXT1JLU1BBQ0VfVFJVU1RfVU5UUlVTVEVEX0ZJTEVTID0gJ3NlY3VyaXR5LndvcmtzcGFjZS50cnVzdC51bnRydXN0ZWRGaWxlcyc7XG5leHBvcnQgY29uc3QgV09SS1NQQUNFX1RSVVNUX0VNUFRZX1dJTkRPVyA9ICdzZWN1cml0eS53b3Jrc3BhY2UudHJ1c3QuZW1wdHlXaW5kb3cnO1xuZXhwb3J0IGNvbnN0IFdPUktTUEFDRV9UUlVTVF9FWFRFTlNJT05fU1VQUE9SVCA9ICdleHRlbnNpb25zLnN1cHBvcnRVbnRydXN0ZWRXb3Jrc3BhY2VzJztcbmV4cG9ydCBjb25zdCBXT1JLU1BBQ0VfVFJVU1RfU1RPUkFHRV9LRVkgPSAnY29udGVudC50cnVzdC5tb2RlbC5rZXknO1xuXG5leHBvcnQgY2xhc3MgQ2Fub25pY2FsV29ya3NwYWNlIGltcGxlbWVudHMgSVdvcmtzcGFjZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3JpZ2luYWxXb3Jrc3BhY2U6IElXb3Jrc3BhY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjYW5vbmljYWxGb2xkZXJVcmlzOiBVUklbXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNhbm9uaWNhbENvbmZpZ3VyYXRpb246IFVSSSB8IG51bGwgfCB1bmRlZmluZWRcblx0KSB7IH1cblxuXG5cdGdldCBmb2xkZXJzKCk6IElXb3Jrc3BhY2VGb2xkZXJbXSB7XG5cdFx0cmV0dXJuIHRoaXMub3JpZ2luYWxXb3Jrc3BhY2UuZm9sZGVycy5tYXAoKGZvbGRlciwgaW5kZXgpID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGluZGV4OiBmb2xkZXIuaW5kZXgsXG5cdFx0XHRcdG5hbWU6IGZvbGRlci5uYW1lLFxuXHRcdFx0XHR0b1Jlc291cmNlOiBmb2xkZXIudG9SZXNvdXJjZSxcblx0XHRcdFx0dXJpOiB0aGlzLmNhbm9uaWNhbEZvbGRlclVyaXNbaW5kZXhdXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0IHRyYW5zaWVudCgpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5vcmlnaW5hbFdvcmtzcGFjZS50cmFuc2llbnQ7XG5cdH1cblxuXHRnZXQgY29uZmlndXJhdGlvbigpOiBVUkkgfCBudWxsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jYW5vbmljYWxDb25maWd1cmF0aW9uID8/IHRoaXMub3JpZ2luYWxXb3Jrc3BhY2UuY29uZmlndXJhdGlvbjtcblx0fVxuXG5cdGdldCBpZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLm9yaWdpbmFsV29ya3NwYWNlLmlkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGlzV29ya3NwYWNlVHJ1c3RFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5kaXNhYmxlV29ya3NwYWNlVHJ1c3QpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gISF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFdPUktTUEFDRV9UUlVTVF9FTkFCTEVEKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB7XG5cblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZUtleSA9IFdPUktTUEFDRV9UUlVTVF9TVE9SQUdFX0tFWTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VSZXNvbHZlZFByb21pc2U6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVJlc29sdmVkUHJvbWlzZVJlc29sdmU6ICgpID0+IHZvaWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVRydXN0SW5pdGlhbGl6ZWRQcm9taXNlOiBQcm9taXNlPHZvaWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkUHJvbWlzZVJlc29sdmU6ICgpID0+IHZvaWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VUcnVzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVRydXN0ID0gdGhpcy5fb25EaWRDaGFuZ2VUcnVzdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRydXN0ZWRGb2xkZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnMgPSB0aGlzLl9vbkRpZENoYW5nZVRydXN0ZWRGb2xkZXJzLmV2ZW50O1xuXG5cdHByaXZhdGUgX2Nhbm9uaWNhbFN0YXJ0dXBGaWxlczogVVJJW10gPSBbXTtcblx0cHJpdmF0ZSBfY2Fub25pY2FsV29ya3NwYWNlOiBJV29ya3NwYWNlO1xuXHRwcml2YXRlIF9jYW5vbmljYWxVcmlzUmVzb2x2ZWQ6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSBfaXNUcnVzdGVkOiBib29sZWFuO1xuXHRwcml2YXRlIF90cnVzdFN0YXRlSW5mbzogSVdvcmtzcGFjZVRydXN0SW5mbztcblx0cHJpdmF0ZSBfcmVtb3RlQXV0aG9yaXR5OiBSZXNvbHZlclJlc3VsdCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdG9yZWRUcnVzdFN0YXRlOiBXb3Jrc3BhY2VUcnVzdE1lbWVudG87XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RydXN0VHJhbnNpdGlvbk1hbmFnZXI6IFdvcmtzcGFjZVRydXN0VHJhbnNpdGlvbk1hbmFnZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2U6IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fY2Fub25pY2FsVXJpc1Jlc29sdmVkID0gZmFsc2U7XG5cdFx0dGhpcy5fY2Fub25pY2FsV29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXG5cdFx0KHsgcHJvbWlzZTogdGhpcy5fd29ya3NwYWNlUmVzb2x2ZWRQcm9taXNlLCByZXNvbHZlOiB0aGlzLl93b3Jrc3BhY2VSZXNvbHZlZFByb21pc2VSZXNvbHZlIH0gPSBwcm9taXNlV2l0aFJlc29sdmVycygpKTtcblx0XHQoeyBwcm9taXNlOiB0aGlzLl93b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkUHJvbWlzZSwgcmVzb2x2ZTogdGhpcy5fd29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZFByb21pc2VSZXNvbHZlIH0gPSBwcm9taXNlV2l0aFJlc29sdmVycygpKTtcblxuXHRcdHRoaXMuX3N0b3JlZFRydXN0U3RhdGUgPSBuZXcgV29ya3NwYWNlVHJ1c3RNZW1lbnRvKGlzV2ViICYmIHRoaXMuaXNFbXB0eVdvcmtzcGFjZSgpID8gdW5kZWZpbmVkIDogdGhpcy5zdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5fdHJ1c3RUcmFuc2l0aW9uTWFuYWdlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBXb3Jrc3BhY2VUcnVzdFRyYW5zaXRpb25NYW5hZ2VyKCkpO1xuXG5cdFx0dGhpcy5fdHJ1c3RTdGF0ZUluZm8gPSB0aGlzLmxvYWRUcnVzdEluZm8oKTtcblx0XHR0aGlzLl9pc1RydXN0ZWQgPSB0aGlzLmNhbGN1bGF0ZVdvcmtzcGFjZVRydXN0KCk7XG5cblx0XHR0aGlzLmluaXRpYWxpemVXb3Jrc3BhY2VUcnVzdCgpO1xuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBpbml0aWFsaXplXG5cblx0cHJpdmF0ZSBpbml0aWFsaXplV29ya3NwYWNlVHJ1c3QoKTogdm9pZCB7XG5cdFx0Ly8gUmVzb2x2ZSBjYW5vbmljYWwgVXJpc1xuXHRcdHRoaXMucmVzb2x2ZUNhbm9uaWNhbFVyaXMoKVxuXHRcdFx0LnRoZW4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jYW5vbmljYWxVcmlzUmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZVdvcmtzcGFjZVRydXN0KCk7XG5cdFx0XHR9KVxuXHRcdFx0LmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl93b3Jrc3BhY2VSZXNvbHZlZFByb21pc2VSZXNvbHZlKCk7XG5cblx0XHRcdFx0aWYgKCF0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0XHR0aGlzLl93b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkUHJvbWlzZVJlc29sdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHQvLyBSZW1vdGUgLSByZXNvbHZlIHJlbW90ZSBhdXRob3JpdHlcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHR0aGlzLnJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5yZXNvbHZlQXV0aG9yaXR5KHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSlcblx0XHRcdFx0LnRoZW4oYXN5bmMgcmVzdWx0ID0+IHtcblx0XHRcdFx0XHR0aGlzLl9yZW1vdGVBdXRob3JpdHkgPSByZXN1bHQ7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5hY3RpdmF0ZVByb3ZpZGVyKFNjaGVtYXMudnNjb2RlUmVtb3RlKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZVdvcmtzcGFjZVRydXN0KCk7XG5cdFx0XHRcdH0pXG5cdFx0XHRcdC5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl93b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkUHJvbWlzZVJlc29sdmUoKTtcblx0XHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gRW1wdHkgd29ya3NwYWNlIC0gc2F2ZSBpbml0aWFsIHN0YXRlIHRvIG1lbWVudG9cblx0XHRpZiAodGhpcy5pc0VtcHR5V29ya3NwYWNlKCkpIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZVRydXN0SW5pdGlhbGl6ZWRQcm9taXNlLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RvcmVkVHJ1c3RTdGF0ZS5pc0VtcHR5V29ya3NwYWNlVHJ1c3RlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RvcmVkVHJ1c3RTdGF0ZS5pc0VtcHR5V29ya3NwYWNlVHJ1c3RlZCA9IHRoaXMuaXNXb3Jrc3BhY2VUcnVzdGVkKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBwcml2YXRlIGludGVyZmFjZVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyhhc3luYyAoKSA9PiBhd2FpdCB0aGlzLnVwZGF0ZVdvcmtzcGFjZVRydXN0KCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCwgdGhpcy5zdG9yYWdlS2V5LCB0aGlzLl9zdG9yZSkoYXN5bmMgKCkgPT4ge1xuXHRcdFx0LyogVGhpcyB3aWxsIG9ubHkgZXhlY3V0ZSBpZiBzdG9yYWdlIHdhcyBjaGFuZ2VkIGJ5IGEgdXNlciBhY3Rpb24gaW4gYSBzZXBhcmF0ZSB3aW5kb3cgKi9cblx0XHRcdGlmIChKU09OLnN0cmluZ2lmeSh0aGlzLl90cnVzdFN0YXRlSW5mbykgIT09IEpTT04uc3RyaW5naWZ5KHRoaXMubG9hZFRydXN0SW5mbygpKSkge1xuXHRcdFx0XHR0aGlzLl90cnVzdFN0YXRlSW5mbyA9IHRoaXMubG9hZFRydXN0SW5mbygpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRydXN0ZWRGb2xkZXJzLmZpcmUoKTtcblxuXHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZVdvcmtzcGFjZVRydXN0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRDYW5vbmljYWxVcmkodXJpOiBVUkkpOiBQcm9taXNlPFVSST4ge1xuXHRcdGxldCBjYW5vbmljYWxVcmkgPSB1cmk7XG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSAmJiB1cmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZSkge1xuXHRcdFx0Y2Fub25pY2FsVXJpID0gYXdhaXQgdGhpcy5yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UuZ2V0Q2Fub25pY2FsVVJJKHVyaSk7XG5cdFx0fSBlbHNlIGlmICh1cmkuc2NoZW1lID09PSAndnNjb2RlLXZmcycpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdXJpLmF1dGhvcml0eS5pbmRleE9mKCcrJyk7XG5cdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdGNhbm9uaWNhbFVyaSA9IHVyaS53aXRoKHsgYXV0aG9yaXR5OiB1cmkuYXV0aG9yaXR5LnN1YnN0cigwLCBpbmRleCkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gaWdub3JlIHF1ZXJ5IGFuZCBmcmFnZW50IHNlY3Rpb24gb2YgdXJpcyBhbHdheXNcblx0XHRyZXR1cm4gY2Fub25pY2FsVXJpLndpdGgoeyBxdWVyeTogbnVsbCwgZnJhZ21lbnQ6IG51bGwgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVDYW5vbmljYWxVcmlzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE9wZW4gZWRpdG9yc1xuXHRcdGNvbnN0IGZpbGVzVG9PcGVuOiBJUGF0aFtdID0gW107XG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmZpbGVzVG9PcGVuT3JDcmVhdGUpIHtcblx0XHRcdGZpbGVzVG9PcGVuLnB1c2goLi4udGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZmlsZXNUb09wZW5PckNyZWF0ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmZpbGVzVG9EaWZmKSB7XG5cdFx0XHRmaWxlc1RvT3Blbi5wdXNoKC4uLnRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmZpbGVzVG9EaWZmKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZmlsZXNUb01lcmdlKSB7XG5cdFx0XHRmaWxlc1RvT3Blbi5wdXNoKC4uLnRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmZpbGVzVG9NZXJnZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGZpbGVzVG9PcGVuLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZmlsZXNUb09wZW5PckNyZWF0ZVVyaXMgPSBmaWxlc1RvT3Blbi5maWx0ZXIoZiA9PiAhIWYuZmlsZVVyaSkubWFwKGYgPT4gZi5maWxlVXJpISk7XG5cdFx0XHRjb25zdCBjYW5vbmljYWxGaWxlc1RvT3BlbiA9IGF3YWl0IFByb21pc2UuYWxsKGZpbGVzVG9PcGVuT3JDcmVhdGVVcmlzLm1hcCh1cmkgPT4gdGhpcy5nZXRDYW5vbmljYWxVcmkodXJpKSkpO1xuXG5cdFx0XHR0aGlzLl9jYW5vbmljYWxTdGFydHVwRmlsZXMucHVzaCguLi5jYW5vbmljYWxGaWxlc1RvT3Blbi5maWx0ZXIodXJpID0+IHRoaXMuX2Nhbm9uaWNhbFN0YXJ0dXBGaWxlcy5ldmVyeSh1ID0+ICF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh1cmksIHUpKSkpO1xuXHRcdH1cblxuXHRcdC8vIFdvcmtzcGFjZVxuXHRcdGNvbnN0IHdvcmtzcGFjZVVyaXMgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5tYXAoZiA9PiBmLnVyaSk7XG5cdFx0Y29uc3QgY2Fub25pY2FsV29ya3NwYWNlRm9sZGVycyA9IGF3YWl0IFByb21pc2UuYWxsKHdvcmtzcGFjZVVyaXMubWFwKHVyaSA9PiB0aGlzLmdldENhbm9uaWNhbFVyaSh1cmkpKSk7XG5cblx0XHRsZXQgY2Fub25pY2FsV29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKS5jb25maWd1cmF0aW9uO1xuXHRcdGlmIChjYW5vbmljYWxXb3Jrc3BhY2VDb25maWd1cmF0aW9uICYmIGlzU2F2ZWRXb3Jrc3BhY2UoY2Fub25pY2FsV29ya3NwYWNlQ29uZmlndXJhdGlvbiwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UpKSB7XG5cdFx0XHRjYW5vbmljYWxXb3Jrc3BhY2VDb25maWd1cmF0aW9uID0gYXdhaXQgdGhpcy5nZXRDYW5vbmljYWxVcmkoY2Fub25pY2FsV29ya3NwYWNlQ29uZmlndXJhdGlvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2Fub25pY2FsV29ya3NwYWNlID0gbmV3IENhbm9uaWNhbFdvcmtzcGFjZSh0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCksIGNhbm9uaWNhbFdvcmtzcGFjZUZvbGRlcnMsIGNhbm9uaWNhbFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2FkVHJ1c3RJbmZvKCk6IElXb3Jrc3BhY2VUcnVzdEluZm8ge1xuXHRcdGNvbnN0IGluZm9Bc1N0cmluZyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMuc3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCk7XG5cblx0XHRsZXQgcmVzdWx0OiBJV29ya3NwYWNlVHJ1c3RJbmZvIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoaW5mb0FzU3RyaW5nKSB7XG5cdFx0XHRcdHJlc3VsdCA9IEpTT04ucGFyc2UoaW5mb0FzU3RyaW5nKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHsgfVxuXG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJlc3VsdCA9IHtcblx0XHRcdFx0dXJpVHJ1c3RJbmZvOiBbXVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoIXJlc3VsdC51cmlUcnVzdEluZm8pIHtcblx0XHRcdHJlc3VsdC51cmlUcnVzdEluZm8gPSBbXTtcblx0XHR9XG5cblx0XHRyZXN1bHQudXJpVHJ1c3RJbmZvID0gcmVzdWx0LnVyaVRydXN0SW5mby5tYXAoaW5mbyA9PiB7IHJldHVybiB7IHVyaTogVVJJLnJldml2ZShpbmZvLnVyaSksIHRydXN0ZWQ6IGluZm8udHJ1c3RlZCB9OyB9KTtcblx0XHRyZXN1bHQudXJpVHJ1c3RJbmZvID0gcmVzdWx0LnVyaVRydXN0SW5mby5maWx0ZXIoaW5mbyA9PiBpbmZvLnRydXN0ZWQpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2F2ZVRydXN0SW5mbygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHRoaXMuc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkodGhpcy5fdHJ1c3RTdGF0ZUluZm8pLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVELCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnMuZmlyZSgpO1xuXG5cdFx0YXdhaXQgdGhpcy51cGRhdGVXb3Jrc3BhY2VUcnVzdCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXb3Jrc3BhY2VVcmlzKCk6IFVSSVtdIHtcblx0XHRjb25zdCB3b3Jrc3BhY2VVcmlzID0gdGhpcy5fY2Fub25pY2FsV29ya3NwYWNlLmZvbGRlcnMubWFwKGYgPT4gZi51cmkpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbmZpZ3VyYXRpb24gPSB0aGlzLl9jYW5vbmljYWxXb3Jrc3BhY2UuY29uZmlndXJhdGlvbjtcblx0XHRpZiAod29ya3NwYWNlQ29uZmlndXJhdGlvbiAmJiBpc1NhdmVkV29ya3NwYWNlKHdvcmtzcGFjZUNvbmZpZ3VyYXRpb24sIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlKSkge1xuXHRcdFx0d29ya3NwYWNlVXJpcy5wdXNoKHdvcmtzcGFjZUNvbmZpZ3VyYXRpb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiB3b3Jrc3BhY2VVcmlzO1xuXHR9XG5cblx0cHJpdmF0ZSBjYWxjdWxhdGVXb3Jrc3BhY2VUcnVzdCgpOiBib29sZWFuIHtcblx0XHQvLyBGZWF0dXJlIGlzIGRpc2FibGVkXG5cdFx0aWYgKCF0aGlzLndvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdEVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gQ2Fub25pY2FsIFVyaXMgbm90IHlldCByZXNvbHZlZFxuXHRcdGlmICghdGhpcy5fY2Fub25pY2FsVXJpc1Jlc29sdmVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3RlIC0gcmVzb2x2ZXIgZXhwbGljaXRseSBzZXRzIHdvcmtzcGFjZSB0cnVzdCB0byBUUlVFXG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSAmJiB0aGlzLl9yZW1vdGVBdXRob3JpdHk/Lm9wdGlvbnM/LmlzVHJ1c3RlZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlbW90ZUF1dGhvcml0eS5vcHRpb25zLmlzVHJ1c3RlZDtcblx0XHR9XG5cblx0XHQvLyBFbXB0eSB3b3Jrc3BhY2UgLSB1c2UgbWVtZW50bywgb3BlbiBlZGlvcnMsIG9yIHVzZXIgc2V0dGluZ1xuXHRcdGlmICh0aGlzLmlzRW1wdHlXb3Jrc3BhY2UoKSkge1xuXHRcdFx0Ly8gVXNlIG1lbWVudG8gaWYgcHJlc2VudFxuXHRcdFx0aWYgKHRoaXMuX3N0b3JlZFRydXN0U3RhdGUuaXNFbXB0eVdvcmtzcGFjZVRydXN0ZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fc3RvcmVkVHJ1c3RTdGF0ZS5pc0VtcHR5V29ya3NwYWNlVHJ1c3RlZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3RhcnR1cCBmaWxlc1xuXHRcdFx0aWYgKHRoaXMuX2Nhbm9uaWNhbFN0YXJ0dXBGaWxlcy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0VXJpc1RydXN0KHRoaXMuX2Nhbm9uaWNhbFN0YXJ0dXBGaWxlcyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVzZXIgc2V0dGluZ1xuXHRcdFx0cmV0dXJuICEhdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShXT1JLU1BBQ0VfVFJVU1RfRU1QVFlfV0lORE9XKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRVcmlzVHJ1c3QodGhpcy5nZXRXb3Jrc3BhY2VVcmlzKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVXb3Jrc3BhY2VUcnVzdCh0cnVzdGVkPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy53b3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodHJ1c3RlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJlc29sdmVDYW5vbmljYWxVcmlzKCk7XG5cdFx0XHR0cnVzdGVkID0gdGhpcy5jYWxjdWxhdGVXb3Jrc3BhY2VUcnVzdCgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzV29ya3NwYWNlVHJ1c3RlZCgpID09PSB0cnVzdGVkKSB7IHJldHVybjsgfVxuXG5cdFx0Ly8gVXBkYXRlIHdvcmtzcGFjZSB0cnVzdFxuXHRcdHRoaXMuaXNUcnVzdGVkID0gdHJ1c3RlZDtcblxuXHRcdC8vIFJ1biB3b3Jrc3BhY2UgdHJ1c3QgdHJhbnNpdGlvbiBwYXJ0aWNpcGFudHNcblx0XHRhd2FpdCB0aGlzLl90cnVzdFRyYW5zaXRpb25NYW5hZ2VyLnBhcnRpY2lwYXRlKHRydXN0ZWQpO1xuXG5cdFx0Ly8gRmlyZSB3b3Jrc3BhY2UgdHJ1c3QgY2hhbmdlIGV2ZW50XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUcnVzdC5maXJlKHRydXN0ZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRVcmlzVHJ1c3QodXJpczogVVJJW10pOiBib29sZWFuIHtcblx0XHRsZXQgc3RhdGUgPSB0cnVlO1xuXHRcdGZvciAoY29uc3QgdXJpIG9mIHVyaXMpIHtcblx0XHRcdGNvbnN0IHsgdHJ1c3RlZCB9ID0gdGhpcy5kb0dldFVyaVRydXN0SW5mbyh1cmkpO1xuXG5cdFx0XHRpZiAoIXRydXN0ZWQpIHtcblx0XHRcdFx0c3RhdGUgPSB0cnVzdGVkO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0dldFVyaVRydXN0SW5mbyh1cmk6IFVSSSk6IElXb3Jrc3BhY2VUcnVzdFVyaUluZm8ge1xuXHRcdC8vIFJldHVybiB0cnVzdGVkIHdoZW4gd29ya3NwYWNlIHRydXN0IGlzIGRpc2FibGVkXG5cdFx0aWYgKCF0aGlzLndvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdEVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIHsgdHJ1c3RlZDogdHJ1ZSwgdXJpIH07XG5cdFx0fVxuXG5cdFx0Ly8gQWdlbnQgc2Vzc2lvbnMgd29ya3NwYWNlIGZpbGUgaXMgYWx3YXlzIHRydXN0ZWRcblx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodXJpLCB0aGlzLmVudmlyb25tZW50U2VydmljZS5hZ2VudFNlc3Npb25zV29ya3NwYWNlKSkge1xuXHRcdFx0cmV0dXJuIHsgdHJ1c3RlZDogdHJ1ZSwgdXJpIH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNUcnVzdGVkVmlydHVhbFJlc291cmNlKHVyaSkpIHtcblx0XHRcdHJldHVybiB7IHRydXN0ZWQ6IHRydWUsIHVyaSB9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzVHJ1c3RlZEJ5UmVtb3RlKHVyaSkpIHtcblx0XHRcdHJldHVybiB7IHRydXN0ZWQ6IHRydWUsIHVyaSB9O1xuXHRcdH1cblxuXHRcdGxldCByZXN1bHRTdGF0ZSA9IGZhbHNlO1xuXHRcdGxldCBtYXhMZW5ndGggPSAtMTtcblxuXHRcdGxldCByZXN1bHRVcmkgPSB1cmk7XG5cblx0XHRmb3IgKGNvbnN0IHRydXN0SW5mbyBvZiB0aGlzLl90cnVzdFN0YXRlSW5mby51cmlUcnVzdEluZm8pIHtcblx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHVyaSwgdHJ1c3RJbmZvLnVyaSkpIHtcblx0XHRcdFx0Y29uc3QgZnNQYXRoID0gdHJ1c3RJbmZvLnVyaS5mc1BhdGg7XG5cdFx0XHRcdGlmIChmc1BhdGgubGVuZ3RoID4gbWF4TGVuZ3RoKSB7XG5cdFx0XHRcdFx0bWF4TGVuZ3RoID0gZnNQYXRoLmxlbmd0aDtcblx0XHRcdFx0XHRyZXN1bHRTdGF0ZSA9IHRydXN0SW5mby50cnVzdGVkO1xuXHRcdFx0XHRcdHJlc3VsdFVyaSA9IHRydXN0SW5mby51cmk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyB0cnVzdGVkOiByZXN1bHRTdGF0ZSwgdXJpOiByZXN1bHRVcmkgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TZXRVcmlzVHJ1c3QodXJpczogVVJJW10sIHRydXN0ZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgdXJpcykge1xuXHRcdFx0aWYgKHRydXN0ZWQpIHtcblx0XHRcdFx0aWYgKHRoaXMuaXNUcnVzdGVkVmlydHVhbFJlc291cmNlKHVyaSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLmlzVHJ1c3RlZEJ5UmVtb3RlKHVyaSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGZvdW5kSXRlbSA9IHRoaXMuX3RydXN0U3RhdGVJbmZvLnVyaVRydXN0SW5mby5maW5kKHRydXN0SW5mbyA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh0cnVzdEluZm8udXJpLCB1cmkpKTtcblx0XHRcdFx0aWYgKCFmb3VuZEl0ZW0pIHtcblx0XHRcdFx0XHR0aGlzLl90cnVzdFN0YXRlSW5mby51cmlUcnVzdEluZm8ucHVzaCh7IHVyaSwgdHJ1c3RlZDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXNMZW5ndGggPSB0aGlzLl90cnVzdFN0YXRlSW5mby51cmlUcnVzdEluZm8ubGVuZ3RoO1xuXHRcdFx0XHR0aGlzLl90cnVzdFN0YXRlSW5mby51cmlUcnVzdEluZm8gPSB0aGlzLl90cnVzdFN0YXRlSW5mby51cmlUcnVzdEluZm8uZmlsdGVyKHRydXN0SW5mbyA9PiAhdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodHJ1c3RJbmZvLnVyaSwgdXJpKSk7XG5cdFx0XHRcdGlmIChwcmV2aW91c0xlbmd0aCAhPT0gdGhpcy5fdHJ1c3RTdGF0ZUluZm8udXJpVHJ1c3RJbmZvLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuc2F2ZVRydXN0SW5mbygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNFbXB0eVdvcmtzcGFjZSgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0aWYgKHdvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIGlzVGVtcG9yYXJ5V29ya3NwYWNlKHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKSkgJiYgd29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoID09PSAwO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgaXNUcnVzdGVkVmlydHVhbFJlc291cmNlKHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0Ly8gYHZzY29kZS12ZnNgIChlLmcuIEdpdEh1YiBSZXBvc2l0b3JpZXMpIGFuZCBgdnNjb2RlLWFnZW50LWhvc3RgXG5cdFx0Ly8gKHJlbW90ZSBhZ2VudCBob3N0IGZvbGRlcnMpIHJlcHJlc2VudCByZWFsLCB3cml0YWJsZSByZXNvdXJjZXMgd2hlcmVcblx0XHQvLyBjb2RlIGNhbiBydW4gb3IgZmlsZXMgY2FuIGNoYW5nZSwgc28gdGhleSBtdXN0IGdvIHRocm91Z2ggbm9ybWFsXG5cdFx0Ly8gd29ya3NwYWNlIHRydXN0IHJhdGhlciB0aGFuIGJlaW5nIGF1dG8tdHJ1c3RlZCBhcyB2aXJ0dWFsIHJlc291cmNlcy5cblx0XHRyZXR1cm4gaXNWaXJ0dWFsUmVzb3VyY2UodXJpKSAmJiB1cmkuc2NoZW1lICE9PSAndnNjb2RlLXZmcycgJiYgdXJpLnNjaGVtZSAhPT0gQUdFTlRfSE9TVF9TQ0hFTUU7XG5cdH1cblxuXHRwcml2YXRlIGlzVHJ1c3RlZEJ5UmVtb3RlKHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3JlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiAoaXNFcXVhbEF1dGhvcml0eShnZXRSZW1vdGVBdXRob3JpdHkodXJpKSwgdGhpcy5fcmVtb3RlQXV0aG9yaXR5LmF1dGhvcml0eS5hdXRob3JpdHkpKSAmJiAhIXRoaXMuX3JlbW90ZUF1dGhvcml0eS5vcHRpb25zPy5pc1RydXN0ZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNldCBpc1RydXN0ZWQodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9pc1RydXN0ZWQgPSB2YWx1ZTtcblxuXHRcdC8vIFJlc2V0IGFjY2VwdHNPdXRPZldvcmtzcGFjZUZpbGVzXG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0dGhpcy5fc3RvcmVkVHJ1c3RTdGF0ZS5hY2NlcHRzT3V0T2ZXb3Jrc3BhY2VGaWxlcyA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIEVtcHR5IHdvcmtzcGFjZSAtIHNhdmUgbWVtZW50b1xuXHRcdGlmICh0aGlzLmlzRW1wdHlXb3Jrc3BhY2UoKSkge1xuXHRcdFx0dGhpcy5fc3RvcmVkVHJ1c3RTdGF0ZS5pc0VtcHR5V29ya3NwYWNlVHJ1c3RlZCA9IHZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBwdWJsaWMgaW50ZXJmYWNlXG5cblx0Z2V0IHdvcmtzcGFjZVJlc29sdmVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VSZXNvbHZlZFByb21pc2U7XG5cdH1cblxuXHRnZXQgd29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZFByb21pc2U7XG5cdH1cblxuXHRnZXQgYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0b3JlZFRydXN0U3RhdGUuYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXM7XG5cdH1cblxuXHRzZXQgYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXModmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9zdG9yZWRUcnVzdFN0YXRlLmFjY2VwdHNPdXRPZldvcmtzcGFjZUZpbGVzID0gdmFsdWU7XG5cdH1cblxuXHRpc1dvcmtzcGFjZVRydXN0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzVHJ1c3RlZDtcblx0fVxuXG5cdGlzV29ya3NwYWNlVHJ1c3RGb3JjZWQoKTogYm9vbGVhbiB7XG5cdFx0Ly8gUmVtb3RlIC0gcmVtb3RlIGF1dGhvcml0eSBleHBsaWNpdGx5IHNldHMgd29ya3NwYWNlIHRydXN0XG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSAmJiB0aGlzLl9yZW1vdGVBdXRob3JpdHk/Lm9wdGlvbnM/LmlzVHJ1c3RlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBBbGwgd29ya3NwYWNlIHVyaXMgYXJlIHRydXN0ZWQgYXV0b21hdGljYWxseVxuXHRcdGNvbnN0IHdvcmtzcGFjZVVyaXMgPSB0aGlzLmdldFdvcmtzcGFjZVVyaXMoKS5maWx0ZXIodXJpID0+ICF0aGlzLmlzVHJ1c3RlZFZpcnR1YWxSZXNvdXJjZSh1cmkpKTtcblx0XHRpZiAod29ya3NwYWNlVXJpcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNhblNldFBhcmVudEZvbGRlclRydXN0KCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUlkZW50aWZpZXIgPSB0b1dvcmtzcGFjZUlkZW50aWZpZXIodGhpcy5fY2Fub25pY2FsV29ya3NwYWNlKTtcblxuXHRcdGlmICghaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZUlkZW50aWZpZXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHdvcmtzcGFjZUlkZW50aWZpZXIudXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlICYmIHdvcmtzcGFjZUlkZW50aWZpZXIudXJpLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVSZW1vdGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJlbnRGb2xkZXIgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZGlybmFtZSh3b3Jrc3BhY2VJZGVudGlmaWVyLnVyaSk7XG5cdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHdvcmtzcGFjZUlkZW50aWZpZXIudXJpLCBwYXJlbnRGb2xkZXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyBzZXRQYXJlbnRGb2xkZXJUcnVzdCh0cnVzdGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuY2FuU2V0UGFyZW50Rm9sZGVyVHJ1c3QoKSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlVXJpID0gKHRvV29ya3NwYWNlSWRlbnRpZmllcih0aGlzLl9jYW5vbmljYWxXb3Jrc3BhY2UpIGFzIElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKS51cmk7XG5cdFx0XHRjb25zdCBwYXJlbnRGb2xkZXIgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZGlybmFtZSh3b3Jrc3BhY2VVcmkpO1xuXG5cdFx0XHRhd2FpdCB0aGlzLnNldFVyaXNUcnVzdChbcGFyZW50Rm9sZGVyXSwgdHJ1c3RlZCk7XG5cdFx0fVxuXHR9XG5cblx0Y2FuU2V0V29ya3NwYWNlVHJ1c3QoKTogYm9vbGVhbiB7XG5cdFx0Ly8gUmVtb3RlIC0gcmVtb3RlIGF1dGhvcml0eSBub3QgeWV0IHJlc29sdmVkLCBvciByZW1vdGUgYXV0aG9yaXR5IGV4cGxpY2l0bHkgc2V0cyB3b3Jrc3BhY2UgdHJ1c3Rcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ICYmICghdGhpcy5fcmVtb3RlQXV0aG9yaXR5IHx8IHRoaXMuX3JlbW90ZUF1dGhvcml0eS5vcHRpb25zPy5pc1RydXN0ZWQgIT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBFbXB0eSB3b3Jrc3BhY2Vcblx0XHRpZiAodGhpcy5pc0VtcHR5V29ya3NwYWNlKCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIEFsbCB3b3Jrc3BhY2UgdXJpcyBhcmUgdHJ1c3RlZCBhdXRvbWF0aWNhbGx5XG5cdFx0Y29uc3Qgd29ya3NwYWNlVXJpcyA9IHRoaXMuZ2V0V29ya3NwYWNlVXJpcygpLmZpbHRlcih1cmkgPT4gIXRoaXMuaXNUcnVzdGVkVmlydHVhbFJlc291cmNlKHVyaSkpO1xuXHRcdGlmICh3b3Jrc3BhY2VVcmlzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFVudHJ1c3RlZCB3b3Jrc3BhY2Vcblx0XHRpZiAoIXRoaXMuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFRydXN0ZWQgd29ya3NwYWNlc1xuXHRcdC8vIENhbiBvbmx5IHVudHJ1c3RlZCBpbiB0aGUgc2luZ2xlIGZvbGRlciBzY2VuYXJpb1xuXHRcdGNvbnN0IHdvcmtzcGFjZUlkZW50aWZpZXIgPSB0b1dvcmtzcGFjZUlkZW50aWZpZXIodGhpcy5fY2Fub25pY2FsV29ya3NwYWNlKTtcblx0XHRpZiAoIWlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih3b3Jrc3BhY2VJZGVudGlmaWVyKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIENhbiBvbmx5IGJlIHVudHJ1c3RlZCBpbiBjZXJ0YWluIHNjaGVtZXNcblx0XHRpZiAod29ya3NwYWNlSWRlbnRpZmllci51cmkuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUgJiYgd29ya3NwYWNlSWRlbnRpZmllci51cmkuc2NoZW1lICE9PSAndnNjb2RlLXZmcycpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgY3VycmVudCBmb2xkZXIgaXNuJ3QgdHJ1c3RlZCBkaXJlY3RseSwgcmV0dXJuIGZhbHNlXG5cdFx0Y29uc3QgdHJ1c3RJbmZvID0gdGhpcy5kb0dldFVyaVRydXN0SW5mbyh3b3Jrc3BhY2VJZGVudGlmaWVyLnVyaSk7XG5cdFx0aWYgKCF0cnVzdEluZm8udHJ1c3RlZCB8fCAhdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwod29ya3NwYWNlSWRlbnRpZmllci51cmksIHRydXN0SW5mby51cmkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIHBhcmVudCBpcyBhbHNvIHRydXN0ZWRcblx0XHRpZiAodGhpcy5jYW5TZXRQYXJlbnRGb2xkZXJUcnVzdCgpKSB7XG5cdFx0XHRjb25zdCBwYXJlbnRGb2xkZXIgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZGlybmFtZSh3b3Jrc3BhY2VJZGVudGlmaWVyLnVyaSk7XG5cdFx0XHRjb25zdCBwYXJlbnRQYXRoVHJ1c3RJbmZvID0gdGhpcy5kb0dldFVyaVRydXN0SW5mbyhwYXJlbnRGb2xkZXIpO1xuXHRcdFx0aWYgKHBhcmVudFBhdGhUcnVzdEluZm8udHJ1c3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyBzZXRXb3Jrc3BhY2VUcnVzdCh0cnVzdGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gRW1wdHkgd29ya3NwYWNlXG5cdFx0aWYgKHRoaXMuaXNFbXB0eVdvcmtzcGFjZSgpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZVdvcmtzcGFjZVRydXN0KHRydXN0ZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSB0aGlzLmdldFdvcmtzcGFjZVVyaXMoKTtcblx0XHRhd2FpdCB0aGlzLnNldFVyaXNUcnVzdCh3b3Jrc3BhY2VGb2xkZXJzLCB0cnVzdGVkKTtcblx0fVxuXG5cdGFzeW5jIGdldFVyaVRydXN0SW5mbyh1cmk6IFVSSSk6IFByb21pc2U8SVdvcmtzcGFjZVRydXN0VXJpSW5mbz4ge1xuXHRcdC8vIFJldHVybiB0cnVzdGVkIHdoZW4gd29ya3NwYWNlIHRydXN0IGlzIGRpc2FibGVkXG5cdFx0aWYgKCF0aGlzLndvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdEVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIHsgdHJ1c3RlZDogdHJ1ZSwgdXJpIH07XG5cdFx0fVxuXG5cdFx0Ly8gVXJpIGlzIHRydXN0ZWQgYXV0b21hdGljYWxseSBieSB0aGUgcmVtb3RlXG5cdFx0aWYgKHRoaXMuaXNUcnVzdGVkQnlSZW1vdGUodXJpKSkge1xuXHRcdFx0cmV0dXJuIHsgdHJ1c3RlZDogdHJ1ZSwgdXJpIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZG9HZXRVcmlUcnVzdEluZm8oYXdhaXQgdGhpcy5nZXRDYW5vbmljYWxVcmkodXJpKSk7XG5cdH1cblxuXHRhc3luYyBzZXRVcmlzVHJ1c3QodXJpczogVVJJW10sIHRydXN0ZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmRvU2V0VXJpc1RydXN0KGF3YWl0IFByb21pc2UuYWxsKHVyaXMubWFwKHVyaSA9PiB0aGlzLmdldENhbm9uaWNhbFVyaSh1cmkpKSksIHRydXN0ZWQpO1xuXHR9XG5cblx0Z2V0VHJ1c3RlZFVyaXMoKTogVVJJW10ge1xuXHRcdHJldHVybiB0aGlzLl90cnVzdFN0YXRlSW5mby51cmlUcnVzdEluZm8ubWFwKGluZm8gPT4gaW5mby51cmkpO1xuXHR9XG5cblx0YXN5bmMgc2V0VHJ1c3RlZFVyaXModXJpczogVVJJW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl90cnVzdFN0YXRlSW5mby51cmlUcnVzdEluZm8gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHVyaSBvZiB1cmlzKSB7XG5cdFx0XHRjb25zdCBjYW5vbmljYWxVcmkgPSBhd2FpdCB0aGlzLmdldENhbm9uaWNhbFVyaSh1cmkpO1xuXHRcdFx0Y29uc3QgY2xlYW5VcmkgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkucmVtb3ZlVHJhaWxpbmdQYXRoU2VwYXJhdG9yKGNhbm9uaWNhbFVyaSk7XG5cdFx0XHRsZXQgYWRkZWQgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3QgYWRkZWRVcmkgb2YgdGhpcy5fdHJ1c3RTdGF0ZUluZm8udXJpVHJ1c3RJbmZvKSB7XG5cdFx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChhZGRlZFVyaS51cmksIGNsZWFuVXJpKSkge1xuXHRcdFx0XHRcdGFkZGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWRkZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3RydXN0U3RhdGVJbmZvLnVyaVRydXN0SW5mby5wdXNoKHtcblx0XHRcdFx0dHJ1c3RlZDogdHJ1ZSxcblx0XHRcdFx0dXJpOiBjbGVhblVyaVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5zYXZlVHJ1c3RJbmZvKCk7XG5cdH1cblxuXHRhZGRXb3Jrc3BhY2VUcnVzdFRyYW5zaXRpb25QYXJ0aWNpcGFudChwYXJ0aWNpcGFudDogSVdvcmtzcGFjZVRydXN0VHJhbnNpdGlvblBhcnRpY2lwYW50KTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLl90cnVzdFRyYW5zaXRpb25NYW5hZ2VyLmFkZFdvcmtzcGFjZVRydXN0VHJhbnNpdGlvblBhcnRpY2lwYW50KHBhcnRpY2lwYW50KTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuXG5leHBvcnQgY2xhc3MgV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9vcGVuRmlsZXNUcnVzdFJlcXVlc3RQcm9taXNlPzogUHJvbWlzZTxXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlPjtcblx0cHJpdmF0ZSBfb3BlbkZpbGVzVHJ1c3RSZXF1ZXN0UmVzb2x2ZXI/OiAocmVzcG9uc2U6IFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2UpID0+IHZvaWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2VzVHJ1c3RSZXF1ZXN0UHJvbWlzZXMgPSBuZXcgUmVzb3VyY2VNYXA8UHJvbWlzZTxib29sZWFuIHwgdW5kZWZpbmVkPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2VzVHJ1c3RSZXF1ZXN0UmVzb2x2ZXJzID0gbmV3IFJlc291cmNlTWFwPCh0cnVzdGVkOiBib29sZWFuIHwgdW5kZWZpbmVkKSA9PiB2b2lkPigpO1xuXG5cdHByaXZhdGUgX3dvcmtzcGFjZVRydXN0UmVxdWVzdFByb21pc2U/OiBQcm9taXNlPGJvb2xlYW4gfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIF93b3Jrc3BhY2VUcnVzdFJlcXVlc3RSZXNvbHZlcj86ICh0cnVzdGVkOiBib29sZWFuIHwgdW5kZWZpbmVkKSA9PiB2b2lkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW5pdGlhdGVPcGVuRmlsZXNUcnVzdFJlcXVlc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRJbml0aWF0ZU9wZW5GaWxlc1RydXN0UmVxdWVzdCA9IHRoaXMuX29uRGlkSW5pdGlhdGVPcGVuRmlsZXNUcnVzdFJlcXVlc3QuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbml0aWF0ZVJlc291cmNlc1RydXN0UmVxdWVzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFJlc291cmNlVHJ1c3RSZXF1ZXN0T3B0aW9ucz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSW5pdGlhdGVSZXNvdXJjZXNUcnVzdFJlcXVlc3QgPSB0aGlzLl9vbkRpZEluaXRpYXRlUmVzb3VyY2VzVHJ1c3RSZXF1ZXN0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW5pdGlhdGVXb3Jrc3BhY2VUcnVzdFJlcXVlc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxXb3Jrc3BhY2VUcnVzdFJlcXVlc3RPcHRpb25zIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRJbml0aWF0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdCA9IHRoaXMuX29uRGlkSW5pdGlhdGVXb3Jrc3BhY2VUcnVzdFJlcXVlc3QuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbml0aWF0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdE9uU3RhcnR1cCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEluaXRpYXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0T25TdGFydHVwID0gdGhpcy5fb25EaWRJbml0aWF0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdE9uU3RhcnR1cC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIE9wZW4gZmlsZShzKSB0cnVzdCByZXF1ZXN0XG5cblx0cHJpdmF0ZSBnZXQgdW50cnVzdGVkRmlsZXNTZXR0aW5nKCk6ICdwcm9tcHQnIHwgJ29wZW4nIHwgJ25ld1dpbmRvdycge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFdPUktTUEFDRV9UUlVTVF9VTlRSVVNURURfRklMRVMpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgdW50cnVzdGVkRmlsZXNTZXR0aW5nKHZhbHVlOiAncHJvbXB0JyB8ICdvcGVuJyB8ICduZXdXaW5kb3cnKSB7XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShXT1JLU1BBQ0VfVFJVU1RfVU5UUlVTVEVEX0ZJTEVTLCB2YWx1ZSk7XG5cdH1cblxuXHRhc3luYyBjb21wbGV0ZU9wZW5GaWxlc1RydXN0UmVxdWVzdChyZXN1bHQ6IFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2UsIHNhdmVSZXNwb25zZT86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX29wZW5GaWxlc1RydXN0UmVxdWVzdFJlc29sdmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IGFjY2VwdHNPdXRPZldvcmtzcGFjZUZpbGVzXG5cdFx0aWYgKHJlc3VsdCA9PT0gV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZS5PcGVuKSB7XG5cdFx0XHR0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXMgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFNhdmUgcmVzcG9uc2Vcblx0XHRpZiAoc2F2ZVJlc3BvbnNlKSB7XG5cdFx0XHRpZiAocmVzdWx0ID09PSBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLk9wZW4pIHtcblx0XHRcdFx0dGhpcy51bnRydXN0ZWRGaWxlc1NldHRpbmcgPSAnb3Blbic7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXN1bHQgPT09IFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2UuT3BlbkluTmV3V2luZG93KSB7XG5cdFx0XHRcdHRoaXMudW50cnVzdGVkRmlsZXNTZXR0aW5nID0gJ25ld1dpbmRvdyc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSBwcm9taXNlXG5cdFx0dGhpcy5fb3BlbkZpbGVzVHJ1c3RSZXF1ZXN0UmVzb2x2ZXIocmVzdWx0KTtcblxuXHRcdHRoaXMuX29wZW5GaWxlc1RydXN0UmVxdWVzdFJlc29sdmVyID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX29wZW5GaWxlc1RydXN0UmVxdWVzdFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyByZXF1ZXN0T3BlbkZpbGVzVHJ1c3QodXJpczogVVJJW10pOiBQcm9taXNlPFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2U+IHtcblx0XHQvLyBJZiB3b3Jrc3BhY2UgaXMgdW50cnVzdGVkLCB0aGVyZSBpcyBubyBjb25mbGljdFxuXHRcdGlmICghdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKSB7XG5cdFx0XHRyZXR1cm4gV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZS5PcGVuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wZW5GaWxlc1RydXN0SW5mbyA9IGF3YWl0IFByb21pc2UuYWxsKHVyaXMubWFwKHVyaSA9PiB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuZ2V0VXJpVHJ1c3RJbmZvKHVyaSkpKTtcblxuXHRcdC8vIElmIGFsbCB1cmlzIGFyZSB0cnVzdGVkLCB0aGVyZSBpcyBubyBjb25mbGljdFxuXHRcdGlmIChvcGVuRmlsZXNUcnVzdEluZm8ubWFwKGluZm8gPT4gaW5mby50cnVzdGVkKS5ldmVyeSh0cnVzdGVkID0+IHRydXN0ZWQpKSB7XG5cdFx0XHRyZXR1cm4gV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZS5PcGVuO1xuXHRcdH1cblxuXHRcdC8vIElmIHVzZXIgaGFzIHNldHRpbmcsIGRvbid0IG5lZWQgdG8gYXNrXG5cdFx0aWYgKHRoaXMudW50cnVzdGVkRmlsZXNTZXR0aW5nICE9PSAncHJvbXB0Jykge1xuXHRcdFx0aWYgKHRoaXMudW50cnVzdGVkRmlsZXNTZXR0aW5nID09PSAnbmV3V2luZG93Jykge1xuXHRcdFx0XHRyZXR1cm4gV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZS5PcGVuSW5OZXdXaW5kb3c7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnVudHJ1c3RlZEZpbGVzU2V0dGluZyA9PT0gJ29wZW4nKSB7XG5cdFx0XHRcdHJldHVybiBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLk9wZW47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgYWxyZWFkeSBhc2tlZCB0aGUgdXNlciwgZG9uJ3QgbmVlZCB0byBhc2sgYWdhaW5cblx0XHRpZiAodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmFjY2VwdHNPdXRPZldvcmtzcGFjZUZpbGVzKSB7XG5cdFx0XHRyZXR1cm4gV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZS5PcGVuO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZS9yZXR1cm4gYSBwcm9taXNlXG5cdFx0aWYgKCF0aGlzLl9vcGVuRmlsZXNUcnVzdFJlcXVlc3RQcm9taXNlKSB7XG5cdFx0XHR0aGlzLl9vcGVuRmlsZXNUcnVzdFJlcXVlc3RQcm9taXNlID0gbmV3IFByb21pc2U8V29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZT4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdHRoaXMuX29wZW5GaWxlc1RydXN0UmVxdWVzdFJlc29sdmVyID0gcmVzb2x2ZTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb3BlbkZpbGVzVHJ1c3RSZXF1ZXN0UHJvbWlzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZEluaXRpYXRlT3BlbkZpbGVzVHJ1c3RSZXF1ZXN0LmZpcmUoKTtcblx0XHRyZXR1cm4gdGhpcy5fb3BlbkZpbGVzVHJ1c3RSZXF1ZXN0UHJvbWlzZTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBSZXNvdXJjZShzKSB0cnVzdCByZXF1ZXN0XG5cblx0YXN5bmMgY29tcGxldGVSZXNvdXJjZXNUcnVzdFJlcXVlc3QodXJpOiBVUkksIHJlc3VsdDogV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc29sdmVyID0gdGhpcy5fcmVzb3VyY2VzVHJ1c3RSZXF1ZXN0UmVzb2x2ZXJzLmdldCh1cmkpO1xuXHRcdGlmICghcmVzb2x2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0cnVzdGVkID0gcmVzdWx0ID09PSBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLk9wZW47XG5cdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLnNldFVyaXNUcnVzdChbdXJpXSwgdHJ1c3RlZCk7XG5cblx0XHRyZXNvbHZlcih0cnVzdGVkKTtcblxuXHRcdHRoaXMuX3Jlc291cmNlc1RydXN0UmVxdWVzdFJlc29sdmVycy5kZWxldGUodXJpKTtcblx0XHR0aGlzLl9yZXNvdXJjZXNUcnVzdFJlcXVlc3RQcm9taXNlcy5kZWxldGUodXJpKTtcblx0fVxuXG5cdGFzeW5jIHJlcXVlc3RSZXNvdXJjZXNUcnVzdChvcHRpb25zOiBSZXNvdXJjZVRydXN0UmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4gfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBDaGVjayBpZiBhbGwgcmVzb3VyY2VzIGFyZSBhbHJlYWR5IHRydXN0ZWRcblx0XHRjb25zdCByZXNvdXJjZXNUcnVzdEluZm8gPSBhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuZ2V0VXJpVHJ1c3RJbmZvKG9wdGlvbnMudXJpKTtcblx0XHRpZiAocmVzb3VyY2VzVHJ1c3RJbmZvLnRydXN0ZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFJldHVybiBleGlzdGluZyBwcm9taXNlIGZvciB0aGlzIFVSSVxuXHRcdGNvbnN0IGV4aXN0aW5nUHJvbWlzZSA9IHRoaXMuX3Jlc291cmNlc1RydXN0UmVxdWVzdFByb21pc2VzLmdldChvcHRpb25zLnVyaSk7XG5cdFx0aWYgKGV4aXN0aW5nUHJvbWlzZSkge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nUHJvbWlzZTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgYSBuZXcgcHJvbWlzZSBmb3IgdGhpcyBVUklcblx0XHRjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2U8Ym9vbGVhbiB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHR0aGlzLl9yZXNvdXJjZXNUcnVzdFJlcXVlc3RSZXNvbHZlcnMuc2V0KG9wdGlvbnMudXJpLCByZXNvbHZlKTtcblx0XHR9KTtcblx0XHR0aGlzLl9yZXNvdXJjZXNUcnVzdFJlcXVlc3RQcm9taXNlcy5zZXQob3B0aW9ucy51cmksIHByb21pc2UpO1xuXHRcdHRoaXMuX29uRGlkSW5pdGlhdGVSZXNvdXJjZXNUcnVzdFJlcXVlc3QuZmlyZShvcHRpb25zKTtcblxuXHRcdHJldHVybiBwcm9taXNlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFdvcmtzcGFjZSB0cnVzdCByZXF1ZXN0XG5cblx0cHJpdmF0ZSByZXNvbHZlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0KHRydXN0ZWQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFJlc29sdmVyKSB7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VUcnVzdFJlcXVlc3RSZXNvbHZlcih0cnVzdGVkID8/IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSk7XG5cblx0XHRcdHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFJlc29sdmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0UHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRjYW5jZWxXb3Jrc3BhY2VUcnVzdFJlcXVlc3QoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFJlc29sdmVyKSB7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VUcnVzdFJlcXVlc3RSZXNvbHZlcih1bmRlZmluZWQpO1xuXG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VUcnVzdFJlcXVlc3RSZXNvbHZlciA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY29tcGxldGVXb3Jrc3BhY2VUcnVzdFJlcXVlc3QodHJ1c3RlZD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodHJ1c3RlZCA9PT0gdW5kZWZpbmVkIHx8IHRydXN0ZWQgPT09IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSkge1xuXHRcdFx0dGhpcy5yZXNvbHZlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0KHRydXN0ZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlZ2lzdGVyIG9uZS10aW1lIGV2ZW50IGhhbmRsZXIgdG8gcmVzb2x2ZSB0aGUgcHJvbWlzZSB3aGVuIHdvcmtzcGFjZSB0cnVzdCBjaGFuZ2VkXG5cdFx0RXZlbnQub25jZSh0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VUcnVzdCkodHJ1c3RlZCA9PiB0aGlzLnJlc29sdmVXb3Jrc3BhY2VUcnVzdFJlcXVlc3QodHJ1c3RlZCkpO1xuXG5cdFx0Ly8gVXBkYXRlIHN0b3JhZ2UsIHRyYW5zaXRpb24gd29ya3NwYWNlIHN0YXRlXG5cdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLnNldFdvcmtzcGFjZVRydXN0KHRydXN0ZWQpO1xuXHR9XG5cblx0YXN5bmMgcmVxdWVzdFdvcmtzcGFjZVRydXN0KG9wdGlvbnM/OiBXb3Jrc3BhY2VUcnVzdFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxib29sZWFuIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gVHJ1c3RlZCB3b3Jrc3BhY2Vcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpO1xuXHRcdH1cblxuXHRcdC8vIE1vZGFsIHJlcXVlc3Rcblx0XHRpZiAoIXRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFByb21pc2UpIHtcblx0XHRcdC8vIENyZWF0ZSBwcm9taXNlXG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VUcnVzdFJlcXVlc3RQcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFJlc29sdmVyID0gcmVzb2x2ZTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBSZXR1cm4gZXhpc3RpbmcgcHJvbWlzZVxuXHRcdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFByb21pc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRJbml0aWF0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdC5maXJlKG9wdGlvbnMpO1xuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VUcnVzdFJlcXVlc3RQcm9taXNlO1xuXHR9XG5cblx0cmVxdWVzdFdvcmtzcGFjZVRydXN0T25TdGFydHVwKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0UHJvbWlzZSkge1xuXHRcdFx0Ly8gQ3JlYXRlIHByb21pc2Vcblx0XHRcdHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdFx0dGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0UmVzb2x2ZXIgPSByZXNvbHZlO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRJbml0aWF0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdE9uU3RhcnR1cC5maXJlKCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cblxuY2xhc3MgV29ya3NwYWNlVHJ1c3RUcmFuc2l0aW9uTWFuYWdlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcGFydGljaXBhbnRzID0gbmV3IExpbmtlZExpc3Q8SVdvcmtzcGFjZVRydXN0VHJhbnNpdGlvblBhcnRpY2lwYW50PigpO1xuXG5cdGFkZFdvcmtzcGFjZVRydXN0VHJhbnNpdGlvblBhcnRpY2lwYW50KHBhcnRpY2lwYW50OiBJV29ya3NwYWNlVHJ1c3RUcmFuc2l0aW9uUGFydGljaXBhbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgcmVtb3ZlID0gdGhpcy5wYXJ0aWNpcGFudHMucHVzaChwYXJ0aWNpcGFudCk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiByZW1vdmUoKSk7XG5cdH1cblxuXHRhc3luYyBwYXJ0aWNpcGF0ZSh0cnVzdGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCBwYXJ0aWNpcGFudCBvZiB0aGlzLnBhcnRpY2lwYW50cykge1xuXHRcdFx0YXdhaXQgcGFydGljaXBhbnQucGFydGljaXBhdGUodHJ1c3RlZCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnBhcnRpY2lwYW50cy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgV29ya3NwYWNlVHJ1c3RNZW1lbnRvRGF0YSB7XG5cdGFjY2VwdHNPdXRPZldvcmtzcGFjZUZpbGVzPzogYm9vbGVhbjtcblx0aXNFbXB0eVdvcmtzcGFjZVRydXN0ZWQ/OiBib29sZWFuIHwgdW5kZWZpbmVkO1xufVxuXG5jbGFzcyBXb3Jrc3BhY2VUcnVzdE1lbWVudG8ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21lbWVudG8/OiBNZW1lbnRvPFdvcmtzcGFjZVRydXN0TWVtZW50b0RhdGE+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZW1lbnRvT2JqZWN0OiBXb3Jrc3BhY2VUcnVzdE1lbWVudG9EYXRhO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjY2VwdHNPdXRPZldvcmtzcGFjZUZpbGVzS2V5ID0gJ2FjY2VwdHNPdXRPZldvcmtzcGFjZUZpbGVzJztcblx0cHJpdmF0ZSByZWFkb25seSBfaXNFbXB0eVdvcmtzcGFjZVRydXN0ZWRLZXkgPSAnaXNFbXB0eVdvcmtzcGFjZVRydXN0ZWQnO1xuXG5cdGNvbnN0cnVjdG9yKHN0b3JhZ2VTZXJ2aWNlPzogSVN0b3JhZ2VTZXJ2aWNlKSB7XG5cdFx0aWYgKHN0b3JhZ2VTZXJ2aWNlKSB7XG5cdFx0XHR0aGlzLl9tZW1lbnRvID0gbmV3IE1lbWVudG8oJ3dvcmtzcGFjZVRydXN0Jywgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0dGhpcy5fbWVtZW50b09iamVjdCA9IHRoaXMuX21lbWVudG8uZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9tZW1lbnRvT2JqZWN0ID0ge307XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGFjY2VwdHNPdXRPZldvcmtzcGFjZUZpbGVzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9tZW1lbnRvT2JqZWN0W3RoaXMuX2FjY2VwdHNPdXRPZldvcmtzcGFjZUZpbGVzS2V5XSA/PyBmYWxzZTtcblx0fVxuXG5cdHNldCBhY2NlcHRzT3V0T2ZXb3Jrc3BhY2VGaWxlcyh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX21lbWVudG9PYmplY3RbdGhpcy5fYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXNLZXldID0gdmFsdWU7XG5cblx0XHR0aGlzLl9tZW1lbnRvPy5zYXZlTWVtZW50bygpO1xuXHR9XG5cblx0Z2V0IGlzRW1wdHlXb3Jrc3BhY2VUcnVzdGVkKCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tZW1lbnRvT2JqZWN0W3RoaXMuX2lzRW1wdHlXb3Jrc3BhY2VUcnVzdGVkS2V5XTtcblx0fVxuXG5cdHNldCBpc0VtcHR5V29ya3NwYWNlVHJ1c3RlZCh2YWx1ZTogYm9vbGVhbiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX21lbWVudG9PYmplY3RbdGhpcy5faXNFbXB0eVdvcmtzcGFjZVRydXN0ZWRLZXldID0gdmFsdWU7XG5cblx0XHR0aGlzLl9tZW1lbnRvPy5zYXZlTWVtZW50bygpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLCBXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUF5QixvQkFBb0I7QUFDdEQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUVwQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyx1Q0FBdUQ7QUFDaEUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBMkMsa0JBQWtCLG1DQUFtQyxzQkFBa0MsMEJBQTRDLHVCQUF1QixzQkFBc0I7QUFDM04sU0FBdUMsa0NBQStFLCtCQUFxRSwyQkFBMkIsd0NBQXFFO0FBQzNSLFNB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
