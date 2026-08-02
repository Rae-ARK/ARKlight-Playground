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
import { DeferredPromise, timeout } from "../../../base/common/async.js";
import { bufferToStream, readableToBuffer, VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../base/common/map.js";
import { Schemas } from "../../../base/common/network.js";
import { observableValue } from "../../../base/common/observable.js";
import { join } from "../../../base/common/path.js";
import { isLinux, isMacintosh } from "../../../base/common/platform.js";
import { basename, isEqual, isEqualOrParent } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { FileSystemProviderCapabilities } from "../../../platform/files/common/files.js";
import { AbstractLoggerService, LogLevel, NullLogger } from "../../../platform/log/common/log.js";
import product from "../../../platform/product/common/product.js";
import { InMemoryStorageService } from "../../../platform/storage/common/storage.js";
import { toUserDataProfile } from "../../../platform/userDataProfile/common/userDataProfile.js";
import { WorkbenchState } from "../../../platform/workspace/common/workspace.js";
import { WorkspaceTrustUriResponse } from "../../../platform/workspace/common/workspaceTrust.js";
import { TestWorkspace } from "../../../platform/workspace/test/common/testWorkspace.js";
import { SaveReason } from "../../common/editor.js";
import { ChatEntitlement } from "../../services/chat/common/chatEntitlementService.js";
import { NullExtensionService } from "../../services/extensions/common/extensions.js";
import { LifecyclePhase, ShutdownReason } from "../../services/lifecycle/common/lifecycle.js";
import { WorkingCopyCapabilities } from "../../services/workingCopy/common/workingCopy.js";
class TestLoggerService extends AbstractLoggerService {
  constructor(logsHome) {
    super(LogLevel.Info, logsHome ?? URI.file("tests").with({ scheme: "vscode-tests" }));
  }
  doCreateLogger() {
    return new NullLogger();
  }
}
let TestTextResourcePropertiesService = class {
  constructor(configurationService) {
    this.configurationService = configurationService;
  }
  getEOL(resource, language) {
    const eol = this.configurationService.getValue("files.eol", { overrideIdentifier: language, resource });
    if (eol && typeof eol === "string" && eol !== "auto") {
      return eol;
    }
    return isLinux || isMacintosh ? "\n" : "\r\n";
  }
};
TestTextResourcePropertiesService = __decorateClass([
  __decorateParam(0, IConfigurationService)
], TestTextResourcePropertiesService);
class TestUserDataProfileService {
  constructor() {
    this.onDidChangeCurrentProfile = Event.None;
    this.currentProfile = toUserDataProfile("test", "test", URI.file("tests").with({ scheme: "vscode-tests" }), URI.file("tests").with({ scheme: "vscode-tests" }));
  }
  async updateCurrentProfile() {
  }
}
class TestContextService {
  get onDidChangeWorkspaceName() {
    return this._onDidChangeWorkspaceName.event;
  }
  get onWillChangeWorkspaceFolders() {
    return this._onWillChangeWorkspaceFolders.event;
  }
  get onDidChangeWorkspaceFolders() {
    return this._onDidChangeWorkspaceFolders.event;
  }
  get onDidChangeWorkbenchState() {
    return this._onDidChangeWorkbenchState.event;
  }
  constructor(workspace = TestWorkspace, options = null) {
    this.workspace = workspace;
    this.options = options || /* @__PURE__ */ Object.create(null);
    this._onDidChangeWorkspaceName = new Emitter();
    this._onWillChangeWorkspaceFolders = new Emitter();
    this._onDidChangeWorkspaceFolders = new Emitter();
    this._onDidChangeWorkbenchState = new Emitter();
  }
  getFolders() {
    return this.workspace ? this.workspace.folders : [];
  }
  getWorkbenchState() {
    if (this.workspace.configuration) {
      return WorkbenchState.WORKSPACE;
    }
    if (this.workspace.folders.length) {
      return WorkbenchState.FOLDER;
    }
    return WorkbenchState.EMPTY;
  }
  hasWorkspaceData() {
    return this.getWorkbenchState() !== WorkbenchState.EMPTY;
  }
  getCompleteWorkspace() {
    return Promise.resolve(this.getWorkspace());
  }
  getWorkspace() {
    return this.workspace;
  }
  getWorkspaceFolder(resource) {
    return this.workspace.getFolder(resource);
  }
  setWorkspace(workspace) {
    this.workspace = workspace;
  }
  getOptions() {
    return this.options;
  }
  updateOptions() {
  }
  isInsideWorkspace(resource) {
    if (resource && this.workspace) {
      return isEqualOrParent(resource, this.workspace.folders[0].uri);
    }
    return false;
  }
  toResource(workspaceRelativePath) {
    return URI.file(join("C:\\", workspaceRelativePath));
  }
  isCurrentWorkspace(workspaceIdOrFolder) {
    return URI.isUri(workspaceIdOrFolder) && isEqual(this.workspace.folders[0].uri, workspaceIdOrFolder);
  }
}
class TestStorageService extends InMemoryStorageService {
  testEmitWillSaveState(reason) {
    super.emitWillSaveState(reason);
  }
}
class TestHistoryService {
  constructor(root) {
    this.root = root;
  }
  async reopenLastClosedEditor() {
  }
  async goForward() {
  }
  async goBack() {
  }
  async goPrevious() {
  }
  async goLast() {
  }
  removeFromHistory(_input) {
  }
  clear() {
  }
  clearRecentlyOpened() {
  }
  getHistory() {
    return [];
  }
  async openNextRecentlyUsedEditor(group) {
  }
  async openPreviouslyUsedEditor(group) {
  }
  getLastActiveWorkspaceRoot(_schemeFilter) {
    return this.root;
  }
  getLastActiveFile(_schemeFilter) {
    return void 0;
  }
}
class TestWorkingCopy extends Disposable {
  constructor(resource, isDirty = false, typeId = "testWorkingCopyType") {
    super();
    this.resource = resource;
    this.typeId = typeId;
    this._onDidChangeDirty = this._register(new Emitter());
    this.onDidChangeDirty = this._onDidChangeDirty.event;
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this._onDidSave = this._register(new Emitter());
    this.onDidSave = this._onDidSave.event;
    this.capabilities = WorkingCopyCapabilities.None;
    this.dirty = false;
    this.name = basename(this.resource);
    this.dirty = isDirty;
  }
  setDirty(dirty) {
    if (this.dirty !== dirty) {
      this.dirty = dirty;
      this._onDidChangeDirty.fire();
    }
  }
  setContent(content) {
    this._onDidChangeContent.fire();
  }
  isDirty() {
    return this.dirty;
  }
  isModified() {
    return this.isDirty();
  }
  async save(options, stat) {
    this._onDidSave.fire({ reason: options?.reason ?? SaveReason.EXPLICIT, stat: stat ?? createFileStat(this.resource), source: options?.source });
    return true;
  }
  async revert(options) {
    this.setDirty(false);
  }
  async backup(token) {
    return {};
  }
}
function createFileStat(resource, readonly = false, isFile, isDirectory, isSymbolicLink, children, executable) {
  return {
    resource,
    etag: Date.now().toString(),
    mtime: Date.now(),
    ctime: Date.now(),
    size: 42,
    isFile: isFile ?? true,
    isDirectory: isDirectory ?? false,
    isSymbolicLink: isSymbolicLink ?? false,
    readonly,
    locked: false,
    executable: executable ?? false,
    name: basename(resource),
    children: children?.map((c) => createFileStat(c.resource, false, c.isFile, c.isDirectory, c.isSymbolicLink, void 0, c.executable))
  };
}
class TestWorkingCopyFileService {
  constructor() {
    this.onWillRunWorkingCopyFileOperation = Event.None;
    this.onDidFailWorkingCopyFileOperation = Event.None;
    this.onDidRunWorkingCopyFileOperation = Event.None;
    this.hasSaveParticipants = false;
  }
  addFileOperationParticipant(participant) {
    return Disposable.None;
  }
  addSaveParticipant(participant) {
    return Disposable.None;
  }
  async runSaveParticipants(workingCopy, context, progress, token) {
  }
  async delete(operations, token, undoInfo) {
  }
  registerWorkingCopyProvider(provider) {
    return Disposable.None;
  }
  getDirty(resource) {
    return [];
  }
  create(operations, token, undoInfo) {
    throw new Error("Method not implemented.");
  }
  createFolder(operations, token, undoInfo) {
    throw new Error("Method not implemented.");
  }
  move(operations, token, undoInfo) {
    throw new Error("Method not implemented.");
  }
  copy(operations, token, undoInfo) {
    throw new Error("Method not implemented.");
  }
}
function mock() {
  return function() {
  };
}
class TestExtensionService extends NullExtensionService {
}
const TestProductService = { _serviceBrand: void 0, ...product };
class TestActivityService {
  constructor() {
    this.onDidChangeActivity = Event.None;
  }
  getViewContainerActivities(viewContainerId) {
    return [];
  }
  getActivity(id) {
    return [];
  }
  showViewContainerActivity(viewContainerId, badge) {
    return this;
  }
  showViewActivity(viewId, badge) {
    return this;
  }
  showAccountsActivity(activity) {
    return this;
  }
  showGlobalActivity(activity) {
    return this;
  }
  dispose() {
  }
}
const NullFilesConfigurationService = new class {
  constructor() {
    this.onDidChangeAutoSaveConfiguration = Event.None;
    this.onDidChangeAutoSaveDisabled = Event.None;
    this.onDidChangeReadonly = Event.None;
    this.onDidChangeFilesAssociation = Event.None;
    this.isHotExitEnabled = false;
    this.hotExitConfiguration = void 0;
  }
  getAutoSaveConfiguration() {
    throw new Error("Method not implemented.");
  }
  getAutoSaveMode() {
    throw new Error("Method not implemented.");
  }
  hasShortAutoSaveDelay() {
    throw new Error("Method not implemented.");
  }
  toggleAutoSave() {
    throw new Error("Method not implemented.");
  }
  enableAutoSaveAfterShortDelay(resourceOrEditor) {
    throw new Error("Method not implemented.");
  }
  disableAutoSave(resourceOrEditor) {
    throw new Error("Method not implemented.");
  }
  isReadonly(resource, stat) {
    return false;
  }
  async updateReadonly(_resource, _readonly) {
  }
  preventSaveConflicts(resource, language) {
    throw new Error("Method not implemented.");
  }
}();
class TestWorkspaceTrustEnablementService {
  constructor(isEnabled = true) {
    this.isEnabled = isEnabled;
  }
  isWorkspaceTrustEnabled() {
    return this.isEnabled;
  }
}
class TestWorkspaceTrustManagementService extends Disposable {
  constructor(trusted = true, trustedUris = new ResourceSet()) {
    super();
    this.trusted = trusted;
    this.trustedUris = trustedUris;
    this._onDidChangeTrust = this._register(new Emitter());
    this.onDidChangeTrust = this._onDidChangeTrust.event;
    this._onDidChangeTrustedFolders = this._register(new Emitter());
    this.onDidChangeTrustedFolders = this._onDidChangeTrustedFolders.event;
    this._onDidInitiateWorkspaceTrustRequestOnStartup = this._register(new Emitter());
    this.onDidInitiateWorkspaceTrustRequestOnStartup = this._onDidInitiateWorkspaceTrustRequestOnStartup.event;
  }
  get acceptsOutOfWorkspaceFiles() {
    throw new Error("Method not implemented.");
  }
  set acceptsOutOfWorkspaceFiles(value) {
    throw new Error("Method not implemented.");
  }
  addWorkspaceTrustTransitionParticipant(participant) {
    throw new Error("Method not implemented.");
  }
  getTrustedUris() {
    throw new Error("Method not implemented.");
  }
  setParentFolderTrust(trusted) {
    throw new Error("Method not implemented.");
  }
  getUriTrustInfo(uri) {
    return Promise.resolve({ trusted: this.trustedUris.has(uri), uri });
  }
  async setTrustedUris(folders) {
    this.trustedUris = new ResourceSet(folders);
  }
  async setUrisTrust(uris, trusted) {
    throw new Error("Method not implemented.");
  }
  canSetParentFolderTrust() {
    throw new Error("Method not implemented.");
  }
  canSetWorkspaceTrust() {
    throw new Error("Method not implemented.");
  }
  isWorkspaceTrusted() {
    return this.trusted;
  }
  isWorkspaceTrustForced() {
    return false;
  }
  get workspaceTrustInitialized() {
    return Promise.resolve();
  }
  get workspaceResolved() {
    return Promise.resolve();
  }
  async setWorkspaceTrust(trusted) {
    if (this.trusted !== trusted) {
      this.trusted = trusted;
      this._onDidChangeTrust.fire(this.trusted);
    }
  }
}
class TestWorkspaceTrustRequestService extends Disposable {
  constructor(_trusted) {
    super();
    this._trusted = _trusted;
    this._onDidInitiateOpenFilesTrustRequest = this._register(new Emitter());
    this.onDidInitiateOpenFilesTrustRequest = this._onDidInitiateOpenFilesTrustRequest.event;
    this._onDidInitiateResourcesTrustRequest = this._register(new Emitter());
    this.onDidInitiateResourcesTrustRequest = this._onDidInitiateResourcesTrustRequest.event;
    this._onDidInitiateWorkspaceTrustRequest = this._register(new Emitter());
    this.onDidInitiateWorkspaceTrustRequest = this._onDidInitiateWorkspaceTrustRequest.event;
    this._onDidInitiateWorkspaceTrustRequestOnStartup = this._register(new Emitter());
    this.onDidInitiateWorkspaceTrustRequestOnStartup = this._onDidInitiateWorkspaceTrustRequestOnStartup.event;
    this.requestOpenUrisHandler = async (uris) => {
      return WorkspaceTrustUriResponse.Open;
    };
  }
  requestOpenFilesTrust(uris) {
    return this.requestOpenUrisHandler(uris);
  }
  async completeOpenFilesTrustRequest(result, saveResponse) {
    throw new Error("Method not implemented.");
  }
  async completeResourcesTrustRequest(uri, result) {
    throw new Error("Method not implemented.");
  }
  async requestResourcesTrust(options) {
    return this._trusted;
  }
  cancelWorkspaceTrustRequest() {
    throw new Error("Method not implemented.");
  }
  async completeWorkspaceTrustRequest(trusted) {
    throw new Error("Method not implemented.");
  }
  async requestWorkspaceTrust(options) {
    return this._trusted;
  }
  requestWorkspaceTrustOnStartup() {
    throw new Error("Method not implemented.");
  }
}
class TestMarkerService {
  constructor() {
    this.onMarkerChanged = Event.None;
  }
  getStatistics() {
    throw new Error("Method not implemented.");
  }
  changeOne(owner, resource, markers) {
  }
  changeAll(owner, data) {
  }
  remove(owner, resources) {
  }
  read(filter) {
    return [];
  }
  installResourceFilter(resource, reason) {
    return { dispose: () => {
    } };
  }
}
class TestFileService {
  constructor() {
    this._onDidFilesChange = new Emitter();
    this._onDidRunOperation = new Emitter();
    this._onDidChangeFileSystemProviderCapabilities = new Emitter();
    this._onWillActivateFileSystemProvider = new Emitter();
    this.onWillActivateFileSystemProvider = this._onWillActivateFileSystemProvider.event;
    this.onDidWatchError = Event.None;
    this.content = "Hello Html";
    this.readonly = false;
    // Tracking functionality for tests
    this.writeOperations = [];
    this.readOperations = [];
    this.notExistsSet = new ResourceMap();
    this.readShouldThrowError = void 0;
    this.writeShouldThrowError = void 0;
    this.onDidChangeFileSystemProviderRegistrations = Event.None;
    this.providers = /* @__PURE__ */ new Map();
    this.watches = [];
  }
  get onDidFilesChange() {
    return this._onDidFilesChange.event;
  }
  fireFileChanges(event) {
    this._onDidFilesChange.fire(event);
  }
  get onDidRunOperation() {
    return this._onDidRunOperation.event;
  }
  fireAfterOperation(event) {
    this._onDidRunOperation.fire(event);
  }
  get onDidChangeFileSystemProviderCapabilities() {
    return this._onDidChangeFileSystemProviderCapabilities.event;
  }
  fireFileSystemProviderCapabilitiesChangeEvent(event) {
    this._onDidChangeFileSystemProviderCapabilities.fire(event);
  }
  setContent(content) {
    this.content = content;
  }
  getContent() {
    return this.content;
  }
  getLastReadFileUri() {
    return this.lastReadFileUri;
  }
  // Clear tracking data for tests
  clearTracking() {
    this.writeOperations.length = 0;
    this.readOperations.length = 0;
  }
  async resolve(resource, _options) {
    return createFileStat(resource, this.readonly);
  }
  stat(resource) {
    return this.resolve(resource, { resolveMetadata: true });
  }
  async realpath(resource) {
    return resource;
  }
  async resolveAll(toResolve) {
    const stats = await Promise.all(toResolve.map((resourceAndOption) => this.resolve(resourceAndOption.resource, resourceAndOption.options)));
    return stats.map((stat) => ({ stat, success: true }));
  }
  async exists(_resource) {
    return !this.notExistsSet.has(_resource);
  }
  async readFile(resource, options) {
    if (this.readShouldThrowError) {
      throw this.readShouldThrowError;
    }
    this.lastReadFileUri = resource;
    this.readOperations.push({ resource });
    return {
      ...createFileStat(resource, this.readonly),
      value: VSBuffer.fromString(this.content)
    };
  }
  async readFileStream(resource, options) {
    if (this.readShouldThrowError) {
      throw this.readShouldThrowError;
    }
    this.lastReadFileUri = resource;
    return {
      ...createFileStat(resource, this.readonly),
      value: bufferToStream(VSBuffer.fromString(this.content))
    };
  }
  async writeFile(resource, bufferOrReadable, options) {
    await timeout(0);
    if (this.writeShouldThrowError) {
      throw this.writeShouldThrowError;
    }
    let content;
    if (bufferOrReadable instanceof VSBuffer) {
      content = bufferOrReadable;
    } else {
      try {
        content = readableToBuffer(bufferOrReadable);
      } catch {
      }
    }
    if (content) {
      this.writeOperations.push({ resource, content: content.toString() });
    }
    return createFileStat(resource, this.readonly);
  }
  move(_source, _target, _overwrite) {
    return Promise.resolve(null);
  }
  copy(_source, _target, _overwrite) {
    return Promise.resolve(null);
  }
  async cloneFile(_source, _target) {
  }
  createFile(_resource, _content, _options) {
    return Promise.resolve(null);
  }
  createFolder(_resource) {
    return Promise.resolve(null);
  }
  registerProvider(scheme, provider) {
    this.providers.set(scheme, provider);
    return toDisposable(() => this.providers.delete(scheme));
  }
  getProvider(scheme) {
    return this.providers.get(scheme);
  }
  async activateProvider(_scheme) {
    this._onWillActivateFileSystemProvider.fire({ scheme: _scheme, join: () => {
    } });
  }
  async canHandleResource(resource) {
    return this.hasProvider(resource);
  }
  hasProvider(resource) {
    return resource.scheme === Schemas.file || this.providers.has(resource.scheme);
  }
  listCapabilities() {
    return [
      { scheme: Schemas.file, capabilities: FileSystemProviderCapabilities.FileOpenReadWriteClose },
      ...Iterable.map(this.providers, ([scheme, p]) => {
        return { scheme, capabilities: p.capabilities };
      })
    ];
  }
  hasCapability(resource, capability) {
    if (capability === FileSystemProviderCapabilities.PathCaseSensitive && isLinux) {
      return true;
    }
    const provider = this.getProvider(resource.scheme);
    return !!(provider && provider.capabilities & capability);
  }
  async del(_resource, _options) {
  }
  createWatcher(resource, options) {
    return {
      onDidChange: Event.None,
      dispose: () => {
      }
    };
  }
  watch(_resource) {
    this.watches.push(_resource);
    return toDisposable(() => this.watches.splice(this.watches.indexOf(_resource), 1));
  }
  getWriteEncoding(_resource) {
    return { encoding: "utf8", hasBOM: false };
  }
  dispose() {
  }
  async canCreateFile(source, options) {
    return true;
  }
  async canMove(source, target, overwrite) {
    return true;
  }
  async canCopy(source, target, overwrite) {
    return true;
  }
  async canDelete(resource, options) {
    return true;
  }
}
class InMemoryTestFileService extends TestFileService {
  constructor() {
    super(...arguments);
    this.files = new ResourceMap();
  }
  clearTracking() {
    super.clearTracking();
    this.files.clear();
  }
  async readFile(resource, options) {
    if (this.readShouldThrowError) {
      throw this.readShouldThrowError;
    }
    this.lastReadFileUri = resource;
    this.readOperations.push({ resource });
    const content = this.files.get(resource);
    if (content) {
      return {
        ...createFileStat(resource, this.readonly),
        value: content
      };
    }
    return {
      ...createFileStat(resource, this.readonly),
      value: VSBuffer.fromString(this.content)
    };
  }
  async writeFile(resource, bufferOrReadable, options) {
    await timeout(0);
    if (this.writeShouldThrowError) {
      throw this.writeShouldThrowError;
    }
    let content;
    if (bufferOrReadable instanceof VSBuffer) {
      content = bufferOrReadable;
    } else {
      content = readableToBuffer(bufferOrReadable);
    }
    this.files.set(resource, content);
    this.writeOperations.push({ resource, content: content.toString() });
    return createFileStat(resource, this.readonly);
  }
  async del(resource, _options) {
    this.files.delete(resource);
    this.notExistsSet.set(resource, true);
  }
  async exists(resource) {
    const inMemory = this.files.has(resource);
    if (inMemory) {
      return true;
    }
    return super.exists(resource);
  }
}
class TestChatEntitlementService {
  constructor() {
    this.isInternal = false;
    this.sku = void 0;
    this.copilotTrackingId = void 0;
    this.onDidChangeQuotaExceeded = Event.None;
    this.onDidChangeQuotaRemaining = Event.None;
    this.onDidChangeUsageBasedBilling = Event.None;
    this.quotas = {};
    this.onDidChangeSentiment = Event.None;
    this.sentimentObs = observableValue({}, {});
    this.sentiment = {};
    this.onDidChangeEntitlement = Event.None;
    this.entitlement = ChatEntitlement.Unknown;
    this.entitlementObs = observableValue({}, ChatEntitlement.Unknown);
    this.anonymous = false;
    this.onDidChangeAnonymous = Event.None;
    this.anonymousObs = observableValue({}, false);
    this.clientByokEnabled = false;
    this.hasByokModels = false;
  }
  update(token) {
    throw new Error("Method not implemented.");
  }
  acceptQuotas() {
  }
  clearQuotas() {
  }
  markAnonymousRateLimited() {
  }
  markSetupCompleted() {
  }
  setForceHidden(_hidden) {
  }
}
class TestLifecycleService extends Disposable {
  constructor() {
    super(...arguments);
    this.usePhases = false;
    this.whenStarted = new DeferredPromise();
    this.whenReady = new DeferredPromise();
    this.whenRestored = new DeferredPromise();
    this.whenEventually = new DeferredPromise();
    this.willShutdown = false;
    this._onBeforeShutdown = this._register(new Emitter());
    this._onBeforeShutdownError = this._register(new Emitter());
    this._onShutdownVeto = this._register(new Emitter());
    this._onWillShutdown = this._register(new Emitter());
    this._onDidShutdown = this._register(new Emitter());
    this.shutdownJoiners = [];
  }
  get phase() {
    return this._phase;
  }
  set phase(value) {
    this._phase = value;
    if (value === LifecyclePhase.Starting) {
      this.whenStarted.complete();
    } else if (value === LifecyclePhase.Ready) {
      this.whenReady.complete();
    } else if (value === LifecyclePhase.Restored) {
      this.whenRestored.complete();
    } else if (value === LifecyclePhase.Eventually) {
      this.whenEventually.complete();
    }
  }
  async when(phase) {
    if (!this.usePhases) {
      return;
    }
    if (phase === LifecyclePhase.Starting) {
      await this.whenStarted.p;
    } else if (phase === LifecyclePhase.Ready) {
      await this.whenReady.p;
    } else if (phase === LifecyclePhase.Restored) {
      await this.whenRestored.p;
    } else if (phase === LifecyclePhase.Eventually) {
      await this.whenEventually.p;
    }
  }
  get onBeforeShutdown() {
    return this._onBeforeShutdown.event;
  }
  get onBeforeShutdownError() {
    return this._onBeforeShutdownError.event;
  }
  get onShutdownVeto() {
    return this._onShutdownVeto.event;
  }
  get onWillShutdown() {
    return this._onWillShutdown.event;
  }
  get onDidShutdown() {
    return this._onDidShutdown.event;
  }
  fireShutdown(reason = ShutdownReason.QUIT) {
    this.shutdownJoiners = [];
    this._onWillShutdown.fire({
      join: (p) => {
        this.shutdownJoiners.push(typeof p === "function" ? p() : p);
      },
      joiners: () => [],
      force: () => {
      },
      token: CancellationToken.None,
      reason
    });
  }
  fireBeforeShutdown(event) {
    this._onBeforeShutdown.fire(event);
  }
  fireWillShutdown(event) {
    this._onWillShutdown.fire(event);
  }
  async shutdown() {
    this.fireShutdown();
  }
}
export {
  InMemoryTestFileService,
  NullFilesConfigurationService,
  TestActivityService,
  TestChatEntitlementService,
  TestContextService,
  TestExtensionService,
  TestFileService,
  TestHistoryService,
  TestLifecycleService,
  TestLoggerService,
  TestMarkerService,
  TestProductService,
  TestStorageService,
  TestTextResourcePropertiesService,
  TestUserDataProfileService,
  TestWorkingCopy,
  TestWorkingCopyFileService,
  TestWorkspaceTrustEnablementService,
  TestWorkspaceTrustManagementService,
  TestWorkspaceTrustRequestService,
  createFileStat,
  mock
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBidWZmZXJUb1N0cmVhbSwgcmVhZGFibGVUb0J1ZmZlciwgVlNCdWZmZXIsIFZTQnVmZmVyUmVhZGFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAsIFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgaXNFcXVhbCwgaXNFcXVhbE9yUGFyZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEZpbGVDaGFuZ2VzRXZlbnQsIEZpbGVPcGVyYXRpb25FdmVudCwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBJQmFzZUZpbGVTdGF0LCBJQ3JlYXRlRmlsZU9wdGlvbnMsIElGaWxlQ29udGVudCwgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXQsIElGaWxlU3RhdFJlc3VsdCwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhLCBJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhLCBJRmlsZVN0cmVhbUNvbnRlbnQsIElGaWxlU3lzdGVtUHJvdmlkZXIsIElGaWxlU3lzdGVtUHJvdmlkZXJBY3RpdmF0aW9uRXZlbnQsIElGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXNDaGFuZ2VFdmVudCwgSUZpbGVTeXN0ZW1XYXRjaGVyLCBJUmVhZEZpbGVPcHRpb25zLCBJUmVhZEZpbGVTdHJlYW1PcHRpb25zLCBJUmVzb2x2ZUZpbGVPcHRpb25zLCBJUmVzb2x2ZU1ldGFkYXRhRmlsZU9wdGlvbnMsIElXYXRjaE9wdGlvbnMsIElXYXRjaE9wdGlvbnNXaXRoQ29ycmVsYXRpb24sIElXcml0ZUZpbGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEFic3RyYWN0TG9nZ2VyU2VydmljZSwgSUxvZ2dlciwgTG9nTGV2ZWwsIE51bGxMb2dnZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTWFya2VyLCBJTWFya2VyRGF0YSwgSU1hcmtlclNlcnZpY2UsIElSZXNvdXJjZU1hcmtlciwgTWFya2VyU3RhdGlzdGljcyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3MsIElQcm9ncmVzc1N0ZXAgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlU2VydmljZSwgV2lsbFNhdmVTdGF0ZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgdG9Vc2VyRGF0YVByb2ZpbGUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyLCBJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50LCBJV29ya3NwYWNlRm9sZGVyc1dpbGxDaGFuZ2VFdmVudCwgSVdvcmtzcGFjZUlkZW50aWZpZXIsIFdvcmtiZW5jaFN0YXRlLCBXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZSwgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RUcmFuc2l0aW9uUGFydGljaXBhbnQsIElXb3Jrc3BhY2VUcnVzdFVyaUluZm8sIFJlc291cmNlVHJ1c3RSZXF1ZXN0T3B0aW9ucywgV29ya3NwYWNlVHJ1c3RSZXF1ZXN0T3B0aW9ucywgV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgVGVzdFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS90ZXN0L2NvbW1vbi90ZXN0V29ya3NwYWNlLmpzJztcbmltcG9ydCB7IEdyb3VwSWRlbnRpZmllciwgSVJldmVydE9wdGlvbnMsIElTYXZlT3B0aW9ucywgU2F2ZVJlYXNvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElBY3Rpdml0eSwgSUFjdGl2aXR5U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2FjdGl2aXR5L2NvbW1vbi9hY3Rpdml0eS5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIENoYXRFbnRpdGxlbWVudENvbnRleHQsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBOdWxsRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUF1dG9TYXZlQ29uZmlndXJhdGlvbiwgSUF1dG9TYXZlTW9kZSwgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvaGlzdG9yeS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBCZWZvcmVTaHV0ZG93bkVycm9yRXZlbnQsIElMaWZlY3ljbGVTZXJ2aWNlLCBJbnRlcm5hbEJlZm9yZVNodXRkb3duRXZlbnQsIExpZmVjeWNsZVBoYXNlLCBTaHV0ZG93blJlYXNvbiwgU3RhcnR1cEtpbmQsIFdpbGxTaHV0ZG93bkV2ZW50IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlRW5jb2RpbmcgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi9zdG9yZWRGaWxlV29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5LCBJV29ya2luZ0NvcHlCYWNrdXAsIFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IElDb3B5T3BlcmF0aW9uLCBJQ3JlYXRlRmlsZU9wZXJhdGlvbiwgSUNyZWF0ZU9wZXJhdGlvbiwgSURlbGV0ZU9wZXJhdGlvbiwgSUZpbGVPcGVyYXRpb25VbmRvUmVkb0luZm8sIElNb3ZlT3BlcmF0aW9uLCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50LCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50Q29udGV4dCwgSVdvcmtpbmdDb3B5RmlsZU9wZXJhdGlvblBhcnRpY2lwYW50LCBJV29ya2luZ0NvcHlGaWxlU2VydmljZSwgV29ya2luZ0NvcHlGaWxlRXZlbnQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlGaWxlU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUZXN0TG9nZ2VyU2VydmljZSBleHRlbmRzIEFic3RyYWN0TG9nZ2VyU2VydmljZSB7XG5cdGNvbnN0cnVjdG9yKGxvZ3NIb21lPzogVVJJKSB7XG5cdFx0c3VwZXIoTG9nTGV2ZWwuSW5mbywgbG9nc0hvbWUgPz8gVVJJLmZpbGUoJ3Rlc3RzJykud2l0aCh7IHNjaGVtZTogJ3ZzY29kZS10ZXN0cycgfSkpO1xuXHR9XG5cdHByb3RlY3RlZCBkb0NyZWF0ZUxvZ2dlcigpOiBJTG9nZ2VyIHsgcmV0dXJuIG5ldyBOdWxsTG9nZ2VyKCk7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSBpbXBsZW1lbnRzIElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0Z2V0RU9MKHJlc291cmNlOiBVUkksIGxhbmd1YWdlPzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBlb2wgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdmaWxlcy5lb2wnLCB7IG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UsIHJlc291cmNlIH0pO1xuXHRcdGlmIChlb2wgJiYgdHlwZW9mIGVvbCA9PT0gJ3N0cmluZycgJiYgZW9sICE9PSAnYXV0bycpIHtcblx0XHRcdHJldHVybiBlb2w7XG5cdFx0fVxuXHRcdHJldHVybiAoaXNMaW51eCB8fCBpc01hY2ludG9zaCkgPyAnXFxuJyA6ICdcXHJcXG4nO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0VXNlckRhdGFQcm9maWxlU2VydmljZSBpbXBsZW1lbnRzIElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VycmVudFByb2ZpbGUgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBjdXJyZW50UHJvZmlsZSA9IHRvVXNlckRhdGFQcm9maWxlKCd0ZXN0JywgJ3Rlc3QnLCBVUkkuZmlsZSgndGVzdHMnKS53aXRoKHsgc2NoZW1lOiAndnNjb2RlLXRlc3RzJyB9KSwgVVJJLmZpbGUoJ3Rlc3RzJykud2l0aCh7IHNjaGVtZTogJ3ZzY29kZS10ZXN0cycgfSkpO1xuXHRhc3luYyB1cGRhdGVDdXJyZW50UHJvZmlsZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdENvbnRleHRTZXJ2aWNlIGltcGxlbWVudHMgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHdvcmtzcGFjZTogV29ya3NwYWNlO1xuXHRwcml2YXRlIG9wdGlvbnM6IG9iamVjdDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVdvcmtzcGFjZU5hbWU6IEVtaXR0ZXI8dm9pZD47XG5cdGdldCBvbkRpZENoYW5nZVdvcmtzcGFjZU5hbWUoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VXb3Jrc3BhY2VOYW1lLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsQ2hhbmdlV29ya3NwYWNlRm9sZGVyczogRW1pdHRlcjxJV29ya3NwYWNlRm9sZGVyc1dpbGxDaGFuZ2VFdmVudD47XG5cdGdldCBvbldpbGxDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCk6IEV2ZW50PElXb3Jrc3BhY2VGb2xkZXJzV2lsbENoYW5nZUV2ZW50PiB7IHJldHVybiB0aGlzLl9vbldpbGxDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzOiBFbWl0dGVyPElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQ+O1xuXHRnZXQgb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCk6IEV2ZW50PElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycy5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGU6IEVtaXR0ZXI8V29ya2JlbmNoU3RhdGU+O1xuXHRnZXQgb25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZSgpOiBFdmVudDxXb3JrYmVuY2hTdGF0ZT4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZS5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKHdvcmtzcGFjZSA9IFRlc3RXb3Jrc3BhY2UsIG9wdGlvbnMgPSBudWxsKSB7XG5cdFx0dGhpcy53b3Jrc3BhY2UgPSB3b3Jrc3BhY2U7XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucyB8fCBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlV29ya3NwYWNlTmFtZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0dGhpcy5fb25XaWxsQ2hhbmdlV29ya3NwYWNlRm9sZGVycyA9IG5ldyBFbWl0dGVyPElXb3Jrc3BhY2VGb2xkZXJzV2lsbENoYW5nZUV2ZW50PigpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyA9IG5ldyBFbWl0dGVyPElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQ+KCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZSA9IG5ldyBFbWl0dGVyPFdvcmtiZW5jaFN0YXRlPigpO1xuXHR9XG5cblx0Z2V0Rm9sZGVycygpOiBJV29ya3NwYWNlRm9sZGVyW10ge1xuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZSA/IHRoaXMud29ya3NwYWNlLmZvbGRlcnMgOiBbXTtcblx0fVxuXG5cdGdldFdvcmtiZW5jaFN0YXRlKCk6IFdvcmtiZW5jaFN0YXRlIHtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2UuY29uZmlndXJhdGlvbikge1xuXHRcdFx0cmV0dXJuIFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy53b3Jrc3BhY2UuZm9sZGVycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBXb3JrYmVuY2hTdGF0ZS5GT0xERVI7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFdvcmtiZW5jaFN0YXRlLkVNUFRZO1xuXHR9XG5cblx0aGFzV29ya3NwYWNlRGF0YSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWTtcblx0fVxuXG5cdGdldENvbXBsZXRlV29ya3NwYWNlKCk6IFByb21pc2U8SVdvcmtzcGFjZT4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5nZXRXb3Jrc3BhY2UoKSk7XG5cdH1cblxuXHRnZXRXb3Jrc3BhY2UoKTogSVdvcmtzcGFjZSB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlO1xuXHR9XG5cblx0Z2V0V29ya3NwYWNlRm9sZGVyKHJlc291cmNlOiBVUkkpOiBJV29ya3NwYWNlRm9sZGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlLmdldEZvbGRlcihyZXNvdXJjZSk7XG5cdH1cblxuXHRzZXRXb3Jrc3BhY2Uod29ya3NwYWNlOiBhbnkpOiB2b2lkIHtcblx0XHR0aGlzLndvcmtzcGFjZSA9IHdvcmtzcGFjZTtcblx0fVxuXG5cdGdldE9wdGlvbnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucztcblx0fVxuXG5cdHVwZGF0ZU9wdGlvbnMoKSB7IH1cblxuXHRpc0luc2lkZVdvcmtzcGFjZShyZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0aWYgKHJlc291cmNlICYmIHRoaXMud29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm4gaXNFcXVhbE9yUGFyZW50KHJlc291cmNlLCB0aGlzLndvcmtzcGFjZS5mb2xkZXJzWzBdLnVyaSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0dG9SZXNvdXJjZSh3b3Jrc3BhY2VSZWxhdGl2ZVBhdGg6IHN0cmluZyk6IFVSSSB7XG5cdFx0cmV0dXJuIFVSSS5maWxlKGpvaW4oJ0M6XFxcXCcsIHdvcmtzcGFjZVJlbGF0aXZlUGF0aCkpO1xuXHR9XG5cblx0aXNDdXJyZW50V29ya3NwYWNlKHdvcmtzcGFjZUlkT3JGb2xkZXI6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIgfCBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gVVJJLmlzVXJpKHdvcmtzcGFjZUlkT3JGb2xkZXIpICYmIGlzRXF1YWwodGhpcy53b3Jrc3BhY2UuZm9sZGVyc1swXS51cmksIHdvcmtzcGFjZUlkT3JGb2xkZXIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0U3RvcmFnZVNlcnZpY2UgZXh0ZW5kcyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlIHtcblxuXHR0ZXN0RW1pdFdpbGxTYXZlU3RhdGUocmVhc29uOiBXaWxsU2F2ZVN0YXRlUmVhc29uKTogdm9pZCB7XG5cdFx0c3VwZXIuZW1pdFdpbGxTYXZlU3RhdGUocmVhc29uKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdEhpc3RvcnlTZXJ2aWNlIGltcGxlbWVudHMgSUhpc3RvcnlTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJvb3Q/OiBVUkkpIHsgfVxuXG5cdGFzeW5jIHJlb3Blbkxhc3RDbG9zZWRFZGl0b3IoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgZ29Gb3J3YXJkKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGdvQmFjaygpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBnb1ByZXZpb3VzKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGdvTGFzdCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRyZW1vdmVGcm9tSGlzdG9yeShfaW5wdXQ6IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQpOiB2b2lkIHsgfVxuXHRjbGVhcigpOiB2b2lkIHsgfVxuXHRjbGVhclJlY2VudGx5T3BlbmVkKCk6IHZvaWQgeyB9XG5cdGdldEhpc3RvcnkoKTogcmVhZG9ubHkgKEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQpW10geyByZXR1cm4gW107IH1cblx0YXN5bmMgb3Blbk5leHRSZWNlbnRseVVzZWRFZGl0b3IoZ3JvdXA/OiBHcm91cElkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBvcGVuUHJldmlvdXNseVVzZWRFZGl0b3IoZ3JvdXA/OiBHcm91cElkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRnZXRMYXN0QWN0aXZlV29ya3NwYWNlUm9vdChfc2NoZW1lRmlsdGVyOiBzdHJpbmcpOiBVUkkgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5yb290OyB9XG5cdGdldExhc3RBY3RpdmVGaWxlKF9zY2hlbWVGaWx0ZXI6IHN0cmluZyk6IFVSSSB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RXb3JraW5nQ29weSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2luZ0NvcHkge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRGlydHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEaXJ0eSA9IHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudCA9IHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNhdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTYXZlID0gdGhpcy5fb25EaWRTYXZlLmV2ZW50O1xuXG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllcyA9IFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzLk5vbmU7XG5cblx0cmVhZG9ubHkgbmFtZTtcblxuXHRwcml2YXRlIGRpcnR5ID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgcmVzb3VyY2U6IFVSSSwgaXNEaXJ0eSA9IGZhbHNlLCByZWFkb25seSB0eXBlSWQgPSAndGVzdFdvcmtpbmdDb3B5VHlwZScpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5uYW1lID0gYmFzZW5hbWUodGhpcy5yZXNvdXJjZSk7XG5cdFx0dGhpcy5kaXJ0eSA9IGlzRGlydHk7XG5cdH1cblxuXHRzZXREaXJ0eShkaXJ0eTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRpcnR5ICE9PSBkaXJ0eSkge1xuXHRcdFx0dGhpcy5kaXJ0eSA9IGRpcnR5O1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0Q29udGVudChjb250ZW50OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSgpO1xuXHR9XG5cblx0aXNEaXJ0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5kaXJ0eTtcblx0fVxuXG5cdGlzTW9kaWZpZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaXNEaXJ0eSgpO1xuXHR9XG5cblx0YXN5bmMgc2F2ZShvcHRpb25zPzogSVNhdmVPcHRpb25zLCBzdGF0PzogSUZpbGVTdGF0V2l0aE1ldGFkYXRhKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5fb25EaWRTYXZlLmZpcmUoeyByZWFzb246IG9wdGlvbnM/LnJlYXNvbiA/PyBTYXZlUmVhc29uLkVYUExJQ0lULCBzdGF0OiBzdGF0ID8/IGNyZWF0ZUZpbGVTdGF0KHRoaXMucmVzb3VyY2UpLCBzb3VyY2U6IG9wdGlvbnM/LnNvdXJjZSB9KTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0YXN5bmMgcmV2ZXJ0KG9wdGlvbnM/OiBJUmV2ZXJ0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc2V0RGlydHkoZmFsc2UpO1xuXHR9XG5cblx0YXN5bmMgYmFja3VwKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVdvcmtpbmdDb3B5QmFja3VwPiB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVGaWxlU3RhdChyZXNvdXJjZTogVVJJLCByZWFkb25seSA9IGZhbHNlLCBpc0ZpbGU/OiBib29sZWFuLCBpc0RpcmVjdG9yeT86IGJvb2xlYW4sIGlzU3ltYm9saWNMaW5rPzogYm9vbGVhbiwgY2hpbGRyZW4/OiB7IHJlc291cmNlOiBVUkk7IGlzRmlsZT86IGJvb2xlYW47IGlzRGlyZWN0b3J5PzogYm9vbGVhbjsgaXNTeW1ib2xpY0xpbms/OiBib29sZWFuOyBleGVjdXRhYmxlPzogYm9vbGVhbiB9W10gfCB1bmRlZmluZWQsIGV4ZWN1dGFibGU/OiBib29sZWFuKTogSUZpbGVTdGF0V2l0aE1ldGFkYXRhIHtcblx0cmV0dXJuIHtcblx0XHRyZXNvdXJjZSxcblx0XHRldGFnOiBEYXRlLm5vdygpLnRvU3RyaW5nKCksXG5cdFx0bXRpbWU6IERhdGUubm93KCksXG5cdFx0Y3RpbWU6IERhdGUubm93KCksXG5cdFx0c2l6ZTogNDIsXG5cdFx0aXNGaWxlOiBpc0ZpbGUgPz8gdHJ1ZSxcblx0XHRpc0RpcmVjdG9yeTogaXNEaXJlY3RvcnkgPz8gZmFsc2UsXG5cdFx0aXNTeW1ib2xpY0xpbms6IGlzU3ltYm9saWNMaW5rID8/IGZhbHNlLFxuXHRcdHJlYWRvbmx5LFxuXHRcdGxvY2tlZDogZmFsc2UsXG5cdFx0ZXhlY3V0YWJsZTogZXhlY3V0YWJsZSA/PyBmYWxzZSxcblx0XHRuYW1lOiBiYXNlbmFtZShyZXNvdXJjZSksXG5cdFx0Y2hpbGRyZW46IGNoaWxkcmVuPy5tYXAoYyA9PiBjcmVhdGVGaWxlU3RhdChjLnJlc291cmNlLCBmYWxzZSwgYy5pc0ZpbGUsIGMuaXNEaXJlY3RvcnksIGMuaXNTeW1ib2xpY0xpbmssIHVuZGVmaW5lZCwgYy5leGVjdXRhYmxlKSksXG5cdH07XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0V29ya2luZ0NvcHlGaWxlU2VydmljZSBpbXBsZW1lbnRzIElXb3JraW5nQ29weUZpbGVTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbldpbGxSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb246IEV2ZW50PFdvcmtpbmdDb3B5RmlsZUV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkRmFpbFdvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbjogRXZlbnQ8V29ya2luZ0NvcHlGaWxlRXZlbnQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb246IEV2ZW50PFdvcmtpbmdDb3B5RmlsZUV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cblx0YWRkRmlsZU9wZXJhdGlvblBhcnRpY2lwYW50KHBhcnRpY2lwYW50OiBJV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uUGFydGljaXBhbnQpOiBJRGlzcG9zYWJsZSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblxuXHRyZWFkb25seSBoYXNTYXZlUGFydGljaXBhbnRzID0gZmFsc2U7XG5cdGFkZFNhdmVQYXJ0aWNpcGFudChwYXJ0aWNpcGFudDogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudCk6IElEaXNwb3NhYmxlIHsgcmV0dXJuIERpc3Bvc2FibGUuTm9uZTsgfVxuXHRhc3luYyBydW5TYXZlUGFydGljaXBhbnRzKHdvcmtpbmdDb3B5OiBJV29ya2luZ0NvcHksIGNvbnRleHQ6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnRDb250ZXh0LCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdGFzeW5jIGRlbGV0ZShvcGVyYXRpb25zOiBJRGVsZXRlT3BlcmF0aW9uW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgdW5kb0luZm8/OiBJRmlsZU9wZXJhdGlvblVuZG9SZWRvSW5mbyk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0cmVnaXN0ZXJXb3JraW5nQ29weVByb3ZpZGVyKHByb3ZpZGVyOiAocmVzb3VyY2VPckZvbGRlcjogVVJJKSA9PiBJV29ya2luZ0NvcHlbXSk6IElEaXNwb3NhYmxlIHsgcmV0dXJuIERpc3Bvc2FibGUuTm9uZTsgfVxuXG5cdGdldERpcnR5KHJlc291cmNlOiBVUkkpOiBJV29ya2luZ0NvcHlbXSB7IHJldHVybiBbXTsgfVxuXG5cdGNyZWF0ZShvcGVyYXRpb25zOiBJQ3JlYXRlRmlsZU9wZXJhdGlvbltdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHVuZG9JbmZvPzogSUZpbGVPcGVyYXRpb25VbmRvUmVkb0luZm8pOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YVtdPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRjcmVhdGVGb2xkZXIob3BlcmF0aW9uczogSUNyZWF0ZU9wZXJhdGlvbltdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHVuZG9JbmZvPzogSUZpbGVPcGVyYXRpb25VbmRvUmVkb0luZm8pOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YVtdPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXG5cdG1vdmUob3BlcmF0aW9uczogSU1vdmVPcGVyYXRpb25bXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCB1bmRvSW5mbz86IElGaWxlT3BlcmF0aW9uVW5kb1JlZG9JbmZvKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGFbXT4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblxuXHRjb3B5KG9wZXJhdGlvbnM6IElDb3B5T3BlcmF0aW9uW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgdW5kb0luZm8/OiBJRmlsZU9wZXJhdGlvblVuZG9SZWRvSW5mbyk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhW10+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb2NrPFQ+KCk6IEN0b3I8VD4ge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0cmV0dXJuIGZ1bmN0aW9uICgpIHsgfSBhcyBhbnk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ3RvcjxUPiB7XG5cdG5ldygpOiBUO1xufVxuXG5leHBvcnQgY2xhc3MgVGVzdEV4dGVuc2lvblNlcnZpY2UgZXh0ZW5kcyBOdWxsRXh0ZW5zaW9uU2VydmljZSB7IH1cblxuZXhwb3J0IGNvbnN0IFRlc3RQcm9kdWN0U2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCAuLi5wcm9kdWN0IH07XG5cbmV4cG9ydCBjbGFzcyBUZXN0QWN0aXZpdHlTZXJ2aWNlIGltcGxlbWVudHMgSUFjdGl2aXR5U2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0b25EaWRDaGFuZ2VBY3Rpdml0eSA9IEV2ZW50Lk5vbmU7XG5cdGdldFZpZXdDb250YWluZXJBY3Rpdml0aWVzKHZpZXdDb250YWluZXJJZDogc3RyaW5nKTogSUFjdGl2aXR5W10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRnZXRBY3Rpdml0eShpZDogc3RyaW5nKTogSUFjdGl2aXR5W10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRzaG93Vmlld0NvbnRhaW5lckFjdGl2aXR5KHZpZXdDb250YWluZXJJZDogc3RyaW5nLCBiYWRnZTogSUFjdGl2aXR5KTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cdHNob3dWaWV3QWN0aXZpdHkodmlld0lkOiBzdHJpbmcsIGJhZGdlOiBJQWN0aXZpdHkpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblx0c2hvd0FjY291bnRzQWN0aXZpdHkoYWN0aXZpdHk6IElBY3Rpdml0eSk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXHRzaG93R2xvYmFsQWN0aXZpdHkoYWN0aXZpdHk6IElBY3Rpdml0eSk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGRpc3Bvc2UoKSB7IH1cbn1cblxuZXhwb3J0IGNvbnN0IE51bGxGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUF1dG9TYXZlQ29uZmlndXJhdGlvbiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXV0b1NhdmVEaXNhYmxlZCA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVhZG9ubHkgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbGVzQXNzb2NpYXRpb24gPSBFdmVudC5Ob25lO1xuXG5cdHJlYWRvbmx5IGlzSG90RXhpdEVuYWJsZWQgPSBmYWxzZTtcblx0cmVhZG9ubHkgaG90RXhpdENvbmZpZ3VyYXRpb24gPSB1bmRlZmluZWQ7XG5cblx0Z2V0QXV0b1NhdmVDb25maWd1cmF0aW9uKCk6IElBdXRvU2F2ZUNvbmZpZ3VyYXRpb24geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Z2V0QXV0b1NhdmVNb2RlKCk6IElBdXRvU2F2ZU1vZGUgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0aGFzU2hvcnRBdXRvU2F2ZURlbGF5KCk6IGJvb2xlYW4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0dG9nZ2xlQXV0b1NhdmUoKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRlbmFibGVBdXRvU2F2ZUFmdGVyU2hvcnREZWxheShyZXNvdXJjZU9yRWRpdG9yOiBVUkkgfCBFZGl0b3JJbnB1dCk6IElEaXNwb3NhYmxlIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGRpc2FibGVBdXRvU2F2ZShyZXNvdXJjZU9yRWRpdG9yOiBVUkkgfCBFZGl0b3JJbnB1dCk6IElEaXNwb3NhYmxlIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGlzUmVhZG9ubHkocmVzb3VyY2U6IFVSSSwgc3RhdD86IElCYXNlRmlsZVN0YXQgfCB1bmRlZmluZWQpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGFzeW5jIHVwZGF0ZVJlYWRvbmx5KF9yZXNvdXJjZTogVVJJIHwgVVJJW10sIF9yZWFkb25seTogYm9vbGVhbiB8ICd0b2dnbGUnIHwgJ3Jlc2V0Jyk6IFByb21pc2U8dm9pZD4geyB9XG5cdHByZXZlbnRTYXZlQ29uZmxpY3RzKHJlc291cmNlOiBVUkksIGxhbmd1YWdlPzogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxufTtcblxuZXhwb3J0IGNsYXNzIFRlc3RXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlIGltcGxlbWVudHMgSVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBpc0VuYWJsZWQ6IGJvb2xlYW4gPSB0cnVlKSB7IH1cblxuXHRpc1dvcmtzcGFjZVRydXN0RW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pc0VuYWJsZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlVHJ1c3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0b25EaWRDaGFuZ2VUcnVzdCA9IHRoaXMuX29uRGlkQ2hhbmdlVHJ1c3QuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VUcnVzdGVkRm9sZGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRvbkRpZENoYW5nZVRydXN0ZWRGb2xkZXJzID0gdGhpcy5fb25EaWRDaGFuZ2VUcnVzdGVkRm9sZGVycy5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZEluaXRpYXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0T25TdGFydHVwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdG9uRGlkSW5pdGlhdGVXb3Jrc3BhY2VUcnVzdFJlcXVlc3RPblN0YXJ0dXAgPSB0aGlzLl9vbkRpZEluaXRpYXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0T25TdGFydHVwLmV2ZW50O1xuXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSB0cnVzdGVkOiBib29sZWFuID0gdHJ1ZSxcblx0XHRwcml2YXRlIHRydXN0ZWRVcmlzOiBSZXNvdXJjZVNldCA9IG5ldyBSZXNvdXJjZVNldCgpXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRnZXQgYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXMoKTogYm9vbGVhbiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0c2V0IGFjY2VwdHNPdXRPZldvcmtzcGFjZUZpbGVzKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0YWRkV29ya3NwYWNlVHJ1c3RUcmFuc2l0aW9uUGFydGljaXBhbnQocGFydGljaXBhbnQ6IElXb3Jrc3BhY2VUcnVzdFRyYW5zaXRpb25QYXJ0aWNpcGFudCk6IElEaXNwb3NhYmxlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRnZXRUcnVzdGVkVXJpcygpOiBVUklbXSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0c2V0UGFyZW50Rm9sZGVyVHJ1c3QodHJ1c3RlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGdldFVyaVRydXN0SW5mbyh1cmk6IFVSSSk6IFByb21pc2U8SVdvcmtzcGFjZVRydXN0VXJpSW5mbz4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyB0cnVzdGVkOiB0aGlzLnRydXN0ZWRVcmlzLmhhcyh1cmkpLCB1cmkgfSk7XG5cdH1cblxuXHRhc3luYyBzZXRUcnVzdGVkVXJpcyhmb2xkZXJzOiBVUklbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJ1c3RlZFVyaXMgPSBuZXcgUmVzb3VyY2VTZXQoZm9sZGVycyk7XG5cdH1cblxuXHRhc3luYyBzZXRVcmlzVHJ1c3QodXJpczogVVJJW10sIHRydXN0ZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRjYW5TZXRQYXJlbnRGb2xkZXJUcnVzdCgpOiBib29sZWFuIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRjYW5TZXRXb3Jrc3BhY2VUcnVzdCgpOiBib29sZWFuIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRpc1dvcmtzcGFjZVRydXN0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudHJ1c3RlZDtcblx0fVxuXG5cdGlzV29ya3NwYWNlVHJ1c3RGb3JjZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0IHdvcmtzcGFjZVRydXN0SW5pdGlhbGl6ZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0Z2V0IHdvcmtzcGFjZVJlc29sdmVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdGFzeW5jIHNldFdvcmtzcGFjZVRydXN0KHRydXN0ZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy50cnVzdGVkICE9PSB0cnVzdGVkKSB7XG5cdFx0XHR0aGlzLnRydXN0ZWQgPSB0cnVzdGVkO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUcnVzdC5maXJlKHRoaXMudHJ1c3RlZCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0V29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IGFueTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEluaXRpYXRlT3BlbkZpbGVzVHJ1c3RSZXF1ZXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSW5pdGlhdGVPcGVuRmlsZXNUcnVzdFJlcXVlc3QgPSB0aGlzLl9vbkRpZEluaXRpYXRlT3BlbkZpbGVzVHJ1c3RSZXF1ZXN0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW5pdGlhdGVSZXNvdXJjZXNUcnVzdFJlcXVlc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxSZXNvdXJjZVRydXN0UmVxdWVzdE9wdGlvbnM+KCkpO1xuXHRyZWFkb25seSBvbkRpZEluaXRpYXRlUmVzb3VyY2VzVHJ1c3RSZXF1ZXN0ID0gdGhpcy5fb25EaWRJbml0aWF0ZVJlc291cmNlc1RydXN0UmVxdWVzdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEluaXRpYXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8V29ya3NwYWNlVHJ1c3RSZXF1ZXN0T3B0aW9ucz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSW5pdGlhdGVXb3Jrc3BhY2VUcnVzdFJlcXVlc3QgPSB0aGlzLl9vbkRpZEluaXRpYXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW5pdGlhdGVXb3Jrc3BhY2VUcnVzdFJlcXVlc3RPblN0YXJ0dXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRJbml0aWF0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdE9uU3RhcnR1cCA9IHRoaXMuX29uRGlkSW5pdGlhdGVXb3Jrc3BhY2VUcnVzdFJlcXVlc3RPblN0YXJ0dXAuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfdHJ1c3RlZDogYm9vbGVhbikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZXF1ZXN0T3BlblVyaXNIYW5kbGVyID0gYXN5bmMgKHVyaXM6IFVSSVtdKSA9PiB7XG5cdFx0cmV0dXJuIFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2UuT3Blbjtcblx0fTtcblxuXHRyZXF1ZXN0T3BlbkZpbGVzVHJ1c3QodXJpczogVVJJW10pOiBQcm9taXNlPFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2U+IHtcblx0XHRyZXR1cm4gdGhpcy5yZXF1ZXN0T3BlblVyaXNIYW5kbGVyKHVyaXMpO1xuXHR9XG5cblx0YXN5bmMgY29tcGxldGVPcGVuRmlsZXNUcnVzdFJlcXVlc3QocmVzdWx0OiBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLCBzYXZlUmVzcG9uc2U6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRhc3luYyBjb21wbGV0ZVJlc291cmNlc1RydXN0UmVxdWVzdCh1cmk6IFVSSSwgcmVzdWx0OiBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0YXN5bmMgcmVxdWVzdFJlc291cmNlc1RydXN0KG9wdGlvbnM6IFJlc291cmNlVHJ1c3RSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbiB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl90cnVzdGVkO1xuXHR9XG5cblx0Y2FuY2VsV29ya3NwYWNlVHJ1c3RSZXF1ZXN0KCk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGFzeW5jIGNvbXBsZXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0KHRydXN0ZWQ/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0YXN5bmMgcmVxdWVzdFdvcmtzcGFjZVRydXN0KG9wdGlvbnM/OiBXb3Jrc3BhY2VUcnVzdFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RydXN0ZWQ7XG5cdH1cblxuXHRyZXF1ZXN0V29ya3NwYWNlVHJ1c3RPblN0YXJ0dXAoKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0TWFya2VyU2VydmljZSBpbXBsZW1lbnRzIElNYXJrZXJTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0b25NYXJrZXJDaGFuZ2VkID0gRXZlbnQuTm9uZTtcblxuXHRnZXRTdGF0aXN0aWNzKCk6IE1hcmtlclN0YXRpc3RpY3MgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Y2hhbmdlT25lKG93bmVyOiBzdHJpbmcsIHJlc291cmNlOiBVUkksIG1hcmtlcnM6IElNYXJrZXJEYXRhW10pOiB2b2lkIHsgfVxuXHRjaGFuZ2VBbGwob3duZXI6IHN0cmluZywgZGF0YTogSVJlc291cmNlTWFya2VyW10pOiB2b2lkIHsgfVxuXHRyZW1vdmUob3duZXI6IHN0cmluZywgcmVzb3VyY2VzOiBVUklbXSk6IHZvaWQgeyB9XG5cdHJlYWQoZmlsdGVyPzogeyBvd25lcj86IHN0cmluZyB8IHVuZGVmaW5lZDsgcmVzb3VyY2U/OiBVUkkgfCB1bmRlZmluZWQ7IHNldmVyaXRpZXM/OiBudW1iZXIgfCB1bmRlZmluZWQ7IHRha2U/OiBudW1iZXIgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZCk6IElNYXJrZXJbXSB7IHJldHVybiBbXTsgfVxuXHRpbnN0YWxsUmVzb3VyY2VGaWx0ZXIocmVzb3VyY2U6IFVSSSwgcmVhc29uOiBzdHJpbmcpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyAvKiBUT0RPOiBJbXBsZW1lbnQgY2xlYW51cCBsb2dpYyAqLyB9IH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RGaWxlU2VydmljZSBpbXBsZW1lbnRzIElGaWxlU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGaWxlc0NoYW5nZSA9IG5ldyBFbWl0dGVyPEZpbGVDaGFuZ2VzRXZlbnQ+KCk7XG5cdGdldCBvbkRpZEZpbGVzQ2hhbmdlKCk6IEV2ZW50PEZpbGVDaGFuZ2VzRXZlbnQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkRmlsZXNDaGFuZ2UuZXZlbnQ7IH1cblx0ZmlyZUZpbGVDaGFuZ2VzKGV2ZW50OiBGaWxlQ2hhbmdlc0V2ZW50KTogdm9pZCB7IHRoaXMuX29uRGlkRmlsZXNDaGFuZ2UuZmlyZShldmVudCk7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJ1bk9wZXJhdGlvbiA9IG5ldyBFbWl0dGVyPEZpbGVPcGVyYXRpb25FdmVudD4oKTtcblx0Z2V0IG9uRGlkUnVuT3BlcmF0aW9uKCk6IEV2ZW50PEZpbGVPcGVyYXRpb25FdmVudD4geyByZXR1cm4gdGhpcy5fb25EaWRSdW5PcGVyYXRpb24uZXZlbnQ7IH1cblx0ZmlyZUFmdGVyT3BlcmF0aW9uKGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQpOiB2b2lkIHsgdGhpcy5fb25EaWRSdW5PcGVyYXRpb24uZmlyZShldmVudCk7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyA9IG5ldyBFbWl0dGVyPElGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXNDaGFuZ2VFdmVudD4oKTtcblx0Z2V0IG9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzKCk6IEV2ZW50PElGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXNDaGFuZ2VFdmVudD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuZXZlbnQ7IH1cblx0ZmlyZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllc0NoYW5nZUV2ZW50KGV2ZW50OiBJRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzQ2hhbmdlRXZlbnQpOiB2b2lkIHsgdGhpcy5fb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuZmlyZShldmVudCk7IH1cblxuXHRwcml2YXRlIF9vbldpbGxBY3RpdmF0ZUZpbGVTeXN0ZW1Qcm92aWRlciA9IG5ldyBFbWl0dGVyPElGaWxlU3lzdGVtUHJvdmlkZXJBY3RpdmF0aW9uRXZlbnQ+KCk7XG5cdHJlYWRvbmx5IG9uV2lsbEFjdGl2YXRlRmlsZVN5c3RlbVByb3ZpZGVyID0gdGhpcy5fb25XaWxsQWN0aXZhdGVGaWxlU3lzdGVtUHJvdmlkZXIuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkV2F0Y2hFcnJvciA9IEV2ZW50Lk5vbmU7XG5cblx0cHJvdGVjdGVkIGNvbnRlbnQgPSAnSGVsbG8gSHRtbCc7XG5cdHByb3RlY3RlZCBsYXN0UmVhZEZpbGVVcmkhOiBVUkk7XG5cblx0cmVhZG9ubHkgPSBmYWxzZTtcblxuXHQvLyBUcmFja2luZyBmdW5jdGlvbmFsaXR5IGZvciB0ZXN0c1xuXHRyZWFkb25seSB3cml0ZU9wZXJhdGlvbnM6IEFycmF5PHsgcmVzb3VyY2U6IFVSSTsgY29udGVudDogc3RyaW5nIH0+ID0gW107XG5cdHJlYWRvbmx5IHJlYWRPcGVyYXRpb25zOiBBcnJheTx7IHJlc291cmNlOiBVUkkgfT4gPSBbXTtcblxuXHRzZXRDb250ZW50KGNvbnRlbnQ6IHN0cmluZyk6IHZvaWQgeyB0aGlzLmNvbnRlbnQgPSBjb250ZW50OyB9XG5cdGdldENvbnRlbnQoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuY29udGVudDsgfVxuXHRnZXRMYXN0UmVhZEZpbGVVcmkoKTogVVJJIHsgcmV0dXJuIHRoaXMubGFzdFJlYWRGaWxlVXJpOyB9XG5cblx0Ly8gQ2xlYXIgdHJhY2tpbmcgZGF0YSBmb3IgdGVzdHNcblx0Y2xlYXJUcmFja2luZygpOiB2b2lkIHtcblx0XHR0aGlzLndyaXRlT3BlcmF0aW9ucy5sZW5ndGggPSAwO1xuXHRcdHRoaXMucmVhZE9wZXJhdGlvbnMubGVuZ3RoID0gMDtcblx0fVxuXG5cdHJlc29sdmUocmVzb3VyY2U6IFVSSSwgX29wdGlvbnM6IElSZXNvbHZlTWV0YWRhdGFGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPjtcblx0cmVzb2x2ZShyZXNvdXJjZTogVVJJLCBfb3B0aW9ucz86IElSZXNvbHZlRmlsZU9wdGlvbnMpOiBQcm9taXNlPElGaWxlU3RhdD47XG5cdGFzeW5jIHJlc29sdmUocmVzb3VyY2U6IFVSSSwgX29wdGlvbnM/OiBJUmVzb2x2ZUZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXQ+IHtcblx0XHRyZXR1cm4gY3JlYXRlRmlsZVN0YXQocmVzb3VyY2UsIHRoaXMucmVhZG9ubHkpO1xuXHR9XG5cblx0c3RhdChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhPiB7XG5cdFx0cmV0dXJuIHRoaXMucmVzb2x2ZShyZXNvdXJjZSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdH1cblxuXHRhc3luYyByZWFscGF0aChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxVUkk+IHtcblx0XHRyZXR1cm4gcmVzb3VyY2U7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlQWxsKHRvUmVzb2x2ZTogeyByZXNvdXJjZTogVVJJOyBvcHRpb25zPzogSVJlc29sdmVGaWxlT3B0aW9ucyB9W10pOiBQcm9taXNlPElGaWxlU3RhdFJlc3VsdFtdPiB7XG5cdFx0Y29uc3Qgc3RhdHMgPSBhd2FpdCBQcm9taXNlLmFsbCh0b1Jlc29sdmUubWFwKHJlc291cmNlQW5kT3B0aW9uID0+IHRoaXMucmVzb2x2ZShyZXNvdXJjZUFuZE9wdGlvbi5yZXNvdXJjZSwgcmVzb3VyY2VBbmRPcHRpb24ub3B0aW9ucykpKTtcblxuXHRcdHJldHVybiBzdGF0cy5tYXAoc3RhdCA9PiAoeyBzdGF0LCBzdWNjZXNzOiB0cnVlIH0pKTtcblx0fVxuXG5cdHJlYWRvbmx5IG5vdEV4aXN0c1NldCA9IG5ldyBSZXNvdXJjZU1hcDxib29sZWFuPigpO1xuXG5cdGFzeW5jIGV4aXN0cyhfcmVzb3VyY2U6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gIXRoaXMubm90RXhpc3RzU2V0LmhhcyhfcmVzb3VyY2UpOyB9XG5cblx0cmVhZFNob3VsZFRocm93RXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZEZpbGVPcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJRmlsZUNvbnRlbnQ+IHtcblx0XHRpZiAodGhpcy5yZWFkU2hvdWxkVGhyb3dFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5yZWFkU2hvdWxkVGhyb3dFcnJvcjtcblx0XHR9XG5cblx0XHR0aGlzLmxhc3RSZWFkRmlsZVVyaSA9IHJlc291cmNlO1xuXHRcdHRoaXMucmVhZE9wZXJhdGlvbnMucHVzaCh7IHJlc291cmNlIH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNyZWF0ZUZpbGVTdGF0KHJlc291cmNlLCB0aGlzLnJlYWRvbmx5KSxcblx0XHRcdHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKHRoaXMuY29udGVudClcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcmVhZEZpbGVTdHJlYW0ocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZWFkRmlsZVN0cmVhbU9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPElGaWxlU3RyZWFtQ29udGVudD4ge1xuXHRcdGlmICh0aGlzLnJlYWRTaG91bGRUaHJvd0Vycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLnJlYWRTaG91bGRUaHJvd0Vycm9yO1xuXHRcdH1cblxuXHRcdHRoaXMubGFzdFJlYWRGaWxlVXJpID0gcmVzb3VyY2U7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uY3JlYXRlRmlsZVN0YXQocmVzb3VyY2UsIHRoaXMucmVhZG9ubHkpLFxuXHRcdFx0dmFsdWU6IGJ1ZmZlclRvU3RyZWFtKFZTQnVmZmVyLmZyb21TdHJpbmcodGhpcy5jb250ZW50KSlcblx0XHR9O1xuXHR9XG5cblx0d3JpdGVTaG91bGRUaHJvd0Vycm9yOiBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRhc3luYyB3cml0ZUZpbGUocmVzb3VyY2U6IFVSSSwgYnVmZmVyT3JSZWFkYWJsZTogVlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlLCBvcHRpb25zPzogSVdyaXRlRmlsZU9wdGlvbnMpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4ge1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRpZiAodGhpcy53cml0ZVNob3VsZFRocm93RXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMud3JpdGVTaG91bGRUaHJvd0Vycm9yO1xuXHRcdH1cblxuXHRcdGxldCBjb250ZW50OiBWU0J1ZmZlciB8IHVuZGVmaW5lZDtcblx0XHRpZiAoYnVmZmVyT3JSZWFkYWJsZSBpbnN0YW5jZW9mIFZTQnVmZmVyKSB7XG5cdFx0XHRjb250ZW50ID0gYnVmZmVyT3JSZWFkYWJsZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29udGVudCA9IHJlYWRhYmxlVG9CdWZmZXIoYnVmZmVyT3JSZWFkYWJsZSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gU29tZSBwcmVleGlzdGluZyB0ZXN0cyBhcmUgd3JpdGluZyB3aXRoIGludmFsaWQgb2JqZWN0c1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHR0aGlzLndyaXRlT3BlcmF0aW9ucy5wdXNoKHsgcmVzb3VyY2UsIGNvbnRlbnQ6IGNvbnRlbnQudG9TdHJpbmcoKSB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3JlYXRlRmlsZVN0YXQocmVzb3VyY2UsIHRoaXMucmVhZG9ubHkpO1xuXHR9XG5cblx0bW92ZShfc291cmNlOiBVUkksIF90YXJnZXQ6IFVSSSwgX292ZXJ3cml0ZT86IGJvb2xlYW4pOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTsgfVxuXHRjb3B5KF9zb3VyY2U6IFVSSSwgX3RhcmdldDogVVJJLCBfb3ZlcndyaXRlPzogYm9vbGVhbik6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCEpOyB9XG5cdGFzeW5jIGNsb25lRmlsZShfc291cmNlOiBVUkksIF90YXJnZXQ6IFVSSSk6IFByb21pc2U8dm9pZD4geyB9XG5cdGNyZWF0ZUZpbGUoX3Jlc291cmNlOiBVUkksIF9jb250ZW50PzogVlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlLCBfb3B0aW9ucz86IElDcmVhdGVGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCEpOyB9XG5cdGNyZWF0ZUZvbGRlcihfcmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCEpOyB9XG5cblx0b25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zID0gRXZlbnQuTm9uZTtcblxuXHRwcml2YXRlIHByb3ZpZGVycyA9IG5ldyBNYXA8c3RyaW5nLCBJRmlsZVN5c3RlbVByb3ZpZGVyPigpO1xuXG5cdHJlZ2lzdGVyUHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcsIHByb3ZpZGVyOiBJRmlsZVN5c3RlbVByb3ZpZGVyKSB7XG5cdFx0dGhpcy5wcm92aWRlcnMuc2V0KHNjaGVtZSwgcHJvdmlkZXIpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnByb3ZpZGVycy5kZWxldGUoc2NoZW1lKSk7XG5cdH1cblxuXHRnZXRQcm92aWRlcihzY2hlbWU6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLnByb3ZpZGVycy5nZXQoc2NoZW1lKTtcblx0fVxuXG5cdGFzeW5jIGFjdGl2YXRlUHJvdmlkZXIoX3NjaGVtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fb25XaWxsQWN0aXZhdGVGaWxlU3lzdGVtUHJvdmlkZXIuZmlyZSh7IHNjaGVtZTogX3NjaGVtZSwgam9pbjogKCkgPT4geyB9IH0pO1xuXHR9XG5cdGFzeW5jIGNhbkhhbmRsZVJlc291cmNlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIHRoaXMuaGFzUHJvdmlkZXIocmVzb3VyY2UpOyB9XG5cdGhhc1Byb3ZpZGVyKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHsgcmV0dXJuIHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlIHx8IHRoaXMucHJvdmlkZXJzLmhhcyhyZXNvdXJjZS5zY2hlbWUpOyB9XG5cdGxpc3RDYXBhYmlsaXRpZXMoKSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIGNhcGFiaWxpdGllczogRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UgfSxcblx0XHRcdC4uLkl0ZXJhYmxlLm1hcCh0aGlzLnByb3ZpZGVycywgKFtzY2hlbWUsIHBdKSA9PiB7IHJldHVybiB7IHNjaGVtZSwgY2FwYWJpbGl0aWVzOiBwLmNhcGFiaWxpdGllcyB9OyB9KVxuXHRcdF07XG5cdH1cblx0aGFzQ2FwYWJpbGl0eShyZXNvdXJjZTogVVJJLCBjYXBhYmlsaXR5OiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMpOiBib29sZWFuIHtcblx0XHRpZiAoY2FwYWJpbGl0eSA9PT0gRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlBhdGhDYXNlU2Vuc2l0aXZlICYmIGlzTGludXgpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5nZXRQcm92aWRlcihyZXNvdXJjZS5zY2hlbWUpO1xuXG5cdFx0cmV0dXJuICEhKHByb3ZpZGVyICYmIChwcm92aWRlci5jYXBhYmlsaXRpZXMgJiBjYXBhYmlsaXR5KSk7XG5cdH1cblxuXHRhc3luYyBkZWwoX3Jlc291cmNlOiBVUkksIF9vcHRpb25zPzogeyB1c2VUcmFzaD86IGJvb2xlYW47IHJlY3Vyc2l2ZT86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0Y3JlYXRlV2F0Y2hlcihyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJV2F0Y2hPcHRpb25zKTogSUZpbGVTeXN0ZW1XYXRjaGVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHR9O1xuXHR9XG5cblxuXHRyZWFkb25seSB3YXRjaGVzOiBVUklbXSA9IFtdO1xuXHR3YXRjaChfcmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVdhdGNoT3B0aW9uc1dpdGhDb3JyZWxhdGlvbik6IElGaWxlU3lzdGVtV2F0Y2hlcjtcblx0d2F0Y2goX3Jlc291cmNlOiBVUkkpOiBJRGlzcG9zYWJsZTtcblx0d2F0Y2goX3Jlc291cmNlOiBVUkkpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy53YXRjaGVzLnB1c2goX3Jlc291cmNlKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy53YXRjaGVzLnNwbGljZSh0aGlzLndhdGNoZXMuaW5kZXhPZihfcmVzb3VyY2UpLCAxKSk7XG5cdH1cblxuXHRnZXRXcml0ZUVuY29kaW5nKF9yZXNvdXJjZTogVVJJKTogSVJlc291cmNlRW5jb2RpbmcgeyByZXR1cm4geyBlbmNvZGluZzogJ3V0ZjgnLCBoYXNCT006IGZhbHNlIH07IH1cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxuXG5cdGFzeW5jIGNhbkNyZWF0ZUZpbGUoc291cmNlOiBVUkksIG9wdGlvbnM/OiBJQ3JlYXRlRmlsZU9wdGlvbnMpOiBQcm9taXNlPEVycm9yIHwgdHJ1ZT4geyByZXR1cm4gdHJ1ZTsgfVxuXHRhc3luYyBjYW5Nb3ZlKHNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSwgb3ZlcndyaXRlPzogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8RXJyb3IgfCB0cnVlPiB7IHJldHVybiB0cnVlOyB9XG5cdGFzeW5jIGNhbkNvcHkoc291cmNlOiBVUkksIHRhcmdldDogVVJJLCBvdmVyd3JpdGU/OiBib29sZWFuIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxFcnJvciB8IHRydWU+IHsgcmV0dXJuIHRydWU7IH1cblx0YXN5bmMgY2FuRGVsZXRlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiB7IHVzZVRyYXNoPzogYm9vbGVhbiB8IHVuZGVmaW5lZDsgcmVjdXJzaXZlPzogYm9vbGVhbiB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkKTogUHJvbWlzZTxFcnJvciB8IHRydWU+IHsgcmV0dXJuIHRydWU7IH1cbn1cblxuLyoqXG4gKiBUZXN0RmlsZVNlcnZpY2Ugd2l0aCBpbi1tZW1vcnkgZmlsZSBzdG9yYWdlLlxuICogVXNlIHRoaXMgd2hlbiB5b3VyIHRlc3QgbmVlZHMgdG8gd3JpdGUgZmlsZXMgYW5kIHJlYWQgdGhlbSBiYWNrLlxuICovXG5leHBvcnQgY2xhc3MgSW5NZW1vcnlUZXN0RmlsZVNlcnZpY2UgZXh0ZW5kcyBUZXN0RmlsZVNlcnZpY2Uge1xuXG5cdHByaXZhdGUgZmlsZXMgPSBuZXcgUmVzb3VyY2VNYXA8VlNCdWZmZXI+KCk7XG5cblx0b3ZlcnJpZGUgY2xlYXJUcmFja2luZygpOiB2b2lkIHtcblx0XHRzdXBlci5jbGVhclRyYWNraW5nKCk7XG5cdFx0dGhpcy5maWxlcy5jbGVhcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZWFkRmlsZU9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPElGaWxlQ29udGVudD4ge1xuXHRcdGlmICh0aGlzLnJlYWRTaG91bGRUaHJvd0Vycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLnJlYWRTaG91bGRUaHJvd0Vycm9yO1xuXHRcdH1cblxuXHRcdHRoaXMubGFzdFJlYWRGaWxlVXJpID0gcmVzb3VyY2U7XG5cdFx0dGhpcy5yZWFkT3BlcmF0aW9ucy5wdXNoKHsgcmVzb3VyY2UgfSk7XG5cblx0XHQvLyBDaGVjayBpZiB3ZSBoYXZlIGNvbnRlbnQgaW4gb3VyIGluLW1lbW9yeSBzdG9yZVxuXHRcdGNvbnN0IGNvbnRlbnQgPSB0aGlzLmZpbGVzLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmNyZWF0ZUZpbGVTdGF0KHJlc291cmNlLCB0aGlzLnJlYWRvbmx5KSxcblx0XHRcdFx0dmFsdWU6IGNvbnRlbnRcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNyZWF0ZUZpbGVTdGF0KHJlc291cmNlLCB0aGlzLnJlYWRvbmx5KSxcblx0XHRcdHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKHRoaXMuY29udGVudClcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgd3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGJ1ZmZlck9yUmVhZGFibGU6IFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSwgb3B0aW9ucz86IElXcml0ZUZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+IHtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0aWYgKHRoaXMud3JpdGVTaG91bGRUaHJvd0Vycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLndyaXRlU2hvdWxkVGhyb3dFcnJvcjtcblx0XHR9XG5cblx0XHRsZXQgY29udGVudDogVlNCdWZmZXI7XG5cdFx0aWYgKGJ1ZmZlck9yUmVhZGFibGUgaW5zdGFuY2VvZiBWU0J1ZmZlcikge1xuXHRcdFx0Y29udGVudCA9IGJ1ZmZlck9yUmVhZGFibGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnRlbnQgPSByZWFkYWJsZVRvQnVmZmVyKGJ1ZmZlck9yUmVhZGFibGUpO1xuXHRcdH1cblxuXHRcdC8vIFN0b3JlIGluIG1lbW9yeSBhbmQgdHJhY2tcblx0XHR0aGlzLmZpbGVzLnNldChyZXNvdXJjZSwgY29udGVudCk7XG5cdFx0dGhpcy53cml0ZU9wZXJhdGlvbnMucHVzaCh7IHJlc291cmNlLCBjb250ZW50OiBjb250ZW50LnRvU3RyaW5nKCkgfSk7XG5cblx0XHRyZXR1cm4gY3JlYXRlRmlsZVN0YXQocmVzb3VyY2UsIHRoaXMucmVhZG9ubHkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZGVsKHJlc291cmNlOiBVUkksIF9vcHRpb25zPzogeyB1c2VUcmFzaD86IGJvb2xlYW47IHJlY3Vyc2l2ZT86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZmlsZXMuZGVsZXRlKHJlc291cmNlKTtcblx0XHR0aGlzLm5vdEV4aXN0c1NldC5zZXQocmVzb3VyY2UsIHRydWUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZXhpc3RzKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBpbk1lbW9yeSA9IHRoaXMuZmlsZXMuaGFzKHJlc291cmNlKTtcblx0XHRpZiAoaW5NZW1vcnkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5leGlzdHMocmVzb3VyY2UpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0Q2hhdEVudGl0bGVtZW50U2VydmljZSBpbXBsZW1lbnRzIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29udGV4dDogTGF6eTxDaGF0RW50aXRsZW1lbnRDb250ZXh0PiB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvcmdhbmlzYXRpb25zOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlzSW50ZXJuYWwgPSBmYWxzZTtcblx0cmVhZG9ubHkgc2t1ID0gdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjb3BpbG90VHJhY2tpbmdJZCA9IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VVc2FnZUJhc2VkQmlsbGluZyA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IHF1b3RhcyA9IHt9O1xuXG5cdHVwZGF0ZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlbnRpbWVudCA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IHNlbnRpbWVudE9icyA9IG9ic2VydmFibGVWYWx1ZSh7fSwge30pO1xuXHRyZWFkb25seSBzZW50aW1lbnQgPSB7fTtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUVudGl0bGVtZW50ID0gRXZlbnQuTm9uZTtcblx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudCA9IENoYXRFbnRpdGxlbWVudC5Vbmtub3duO1xuXHRyZWFkb25seSBlbnRpdGxlbWVudE9icyA9IG9ic2VydmFibGVWYWx1ZSh7fSwgQ2hhdEVudGl0bGVtZW50LlVua25vd24pO1xuXG5cdHJlYWRvbmx5IGFub255bW91cyA9IGZhbHNlO1xuXHRvbkRpZENoYW5nZUFub255bW91cyA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IGFub255bW91c09icyA9IG9ic2VydmFibGVWYWx1ZSh7fSwgZmFsc2UpO1xuXG5cdGFjY2VwdFF1b3RhcygpOiB2b2lkIHsgfVxuXHRjbGVhclF1b3RhcygpOiB2b2lkIHsgfVxuXHRtYXJrQW5vbnltb3VzUmF0ZUxpbWl0ZWQoKTogdm9pZCB7IH1cblx0bWFya1NldHVwQ29tcGxldGVkKCk6IHZvaWQgeyB9XG5cdHNldEZvcmNlSGlkZGVuKF9oaWRkZW46IGJvb2xlYW4pOiB2b2lkIHsgfVxuXG5cdHJlYWRvbmx5IGNsaWVudEJ5b2tFbmFibGVkID0gZmFsc2U7XG5cdHJlYWRvbmx5IGhhc0J5b2tNb2RlbHMgPSBmYWxzZTtcbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RMaWZlY3ljbGVTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElMaWZlY3ljbGVTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHR1c2VQaGFzZXMgPSBmYWxzZTtcblx0X3BoYXNlITogTGlmZWN5Y2xlUGhhc2U7XG5cdGdldCBwaGFzZSgpOiBMaWZlY3ljbGVQaGFzZSB7IHJldHVybiB0aGlzLl9waGFzZTsgfVxuXHRzZXQgcGhhc2UodmFsdWU6IExpZmVjeWNsZVBoYXNlKSB7XG5cdFx0dGhpcy5fcGhhc2UgPSB2YWx1ZTtcblx0XHRpZiAodmFsdWUgPT09IExpZmVjeWNsZVBoYXNlLlN0YXJ0aW5nKSB7XG5cdFx0XHR0aGlzLndoZW5TdGFydGVkLmNvbXBsZXRlKCk7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gTGlmZWN5Y2xlUGhhc2UuUmVhZHkpIHtcblx0XHRcdHRoaXMud2hlblJlYWR5LmNvbXBsZXRlKCk7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpIHtcblx0XHRcdHRoaXMud2hlblJlc3RvcmVkLmNvbXBsZXRlKCk7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSkge1xuXHRcdFx0dGhpcy53aGVuRXZlbnR1YWxseS5jb21wbGV0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2hlblN0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgd2hlblJlYWR5ID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHdoZW5SZXN0b3JlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB3aGVuRXZlbnR1YWxseSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0YXN5bmMgd2hlbihwaGFzZTogTGlmZWN5Y2xlUGhhc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMudXNlUGhhc2VzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChwaGFzZSA9PT0gTGlmZWN5Y2xlUGhhc2UuU3RhcnRpbmcpIHtcblx0XHRcdGF3YWl0IHRoaXMud2hlblN0YXJ0ZWQucDtcblx0XHR9IGVsc2UgaWYgKHBoYXNlID09PSBMaWZlY3ljbGVQaGFzZS5SZWFkeSkge1xuXHRcdFx0YXdhaXQgdGhpcy53aGVuUmVhZHkucDtcblx0XHR9IGVsc2UgaWYgKHBoYXNlID09PSBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCkge1xuXHRcdFx0YXdhaXQgdGhpcy53aGVuUmVzdG9yZWQucDtcblx0XHR9IGVsc2UgaWYgKHBoYXNlID09PSBMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KSB7XG5cdFx0XHRhd2FpdCB0aGlzLndoZW5FdmVudHVhbGx5LnA7XG5cdFx0fVxuXHR9XG5cblx0c3RhcnR1cEtpbmQhOiBTdGFydHVwS2luZDtcblx0d2lsbFNodXRkb3duID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25CZWZvcmVTaHV0ZG93biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEludGVybmFsQmVmb3JlU2h1dGRvd25FdmVudD4oKSk7XG5cdGdldCBvbkJlZm9yZVNodXRkb3duKCk6IEV2ZW50PEludGVybmFsQmVmb3JlU2h1dGRvd25FdmVudD4geyByZXR1cm4gdGhpcy5fb25CZWZvcmVTaHV0ZG93bi5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQmVmb3JlU2h1dGRvd25FcnJvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEJlZm9yZVNodXRkb3duRXJyb3JFdmVudD4oKSk7XG5cdGdldCBvbkJlZm9yZVNodXRkb3duRXJyb3IoKTogRXZlbnQ8QmVmb3JlU2h1dGRvd25FcnJvckV2ZW50PiB7IHJldHVybiB0aGlzLl9vbkJlZm9yZVNodXRkb3duRXJyb3IuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblNodXRkb3duVmV0byA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25TaHV0ZG93blZldG8oKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25TaHV0ZG93blZldG8uZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxTaHV0ZG93biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFdpbGxTaHV0ZG93bkV2ZW50PigpKTtcblx0Z2V0IG9uV2lsbFNodXRkb3duKCk6IEV2ZW50PFdpbGxTaHV0ZG93bkV2ZW50PiB7IHJldHVybiB0aGlzLl9vbldpbGxTaHV0ZG93bi5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2h1dGRvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkU2h1dGRvd24oKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25EaWRTaHV0ZG93bi5ldmVudDsgfVxuXG5cdHNodXRkb3duSm9pbmVyczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cblx0ZmlyZVNodXRkb3duKHJlYXNvbiA9IFNodXRkb3duUmVhc29uLlFVSVQpOiB2b2lkIHtcblx0XHR0aGlzLnNodXRkb3duSm9pbmVycyA9IFtdO1xuXG5cdFx0dGhpcy5fb25XaWxsU2h1dGRvd24uZmlyZSh7XG5cdFx0XHRqb2luOiBwID0+IHtcblx0XHRcdFx0dGhpcy5zaHV0ZG93bkpvaW5lcnMucHVzaCh0eXBlb2YgcCA9PT0gJ2Z1bmN0aW9uJyA/IHAoKSA6IHApO1xuXHRcdFx0fSxcblx0XHRcdGpvaW5lcnM6ICgpID0+IFtdLFxuXHRcdFx0Zm9yY2U6ICgpID0+IHsgLyogTm8tT3AgaW4gdGVzdHMgKi8gfSxcblx0XHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0cmVhc29uXG5cdFx0fSk7XG5cdH1cblxuXHRmaXJlQmVmb3JlU2h1dGRvd24oZXZlbnQ6IEludGVybmFsQmVmb3JlU2h1dGRvd25FdmVudCk6IHZvaWQgeyB0aGlzLl9vbkJlZm9yZVNodXRkb3duLmZpcmUoZXZlbnQpOyB9XG5cblx0ZmlyZVdpbGxTaHV0ZG93bihldmVudDogV2lsbFNodXRkb3duRXZlbnQpOiB2b2lkIHsgdGhpcy5fb25XaWxsU2h1dGRvd24uZmlyZShldmVudCk7IH1cblxuXHRhc3luYyBzaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmZpcmVTaHV0ZG93bigpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyxnQkFBZ0Isa0JBQWtCLGdCQUFrQztBQUM3RSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQXlCLG9CQUFvQjtBQUN0RCxTQUFTLGFBQWEsbUJBQW1CO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxTQUFTLG1CQUFtQjtBQUNyQyxTQUFTLFVBQVUsU0FBUyx1QkFBdUI7QUFDbkQsU0FBUyxXQUFXO0FBRXBCLFNBQVMsNkJBQTZCO0FBRXRDLFNBQStDLHNDQUErZDtBQUM5Z0IsU0FBUyx1QkFBZ0MsVUFBVSxrQkFBa0I7QUFFckUsT0FBTyxhQUFhO0FBRXBCLFNBQVMsOEJBQW1EO0FBQzVELFNBQVMseUJBQXlCO0FBQ2xDLFNBQXlMLHNCQUFpQztBQUMxTixTQUFxTyxpQ0FBaUM7QUFDdFEsU0FBUyxxQkFBcUI7QUFDOUIsU0FBd0Qsa0JBQWtCO0FBRzFFLFNBQVMsdUJBQXdFO0FBRWpGLFNBQVMsNEJBQTRCO0FBR3JDLFNBQW1GLGdCQUFnQixzQkFBc0Q7QUFJekosU0FBMkMsK0JBQStCO0FBR25FLE1BQU0sMEJBQTBCLHNCQUFzQjtBQUFBLEVBQzVELFlBQVksVUFBZ0I7QUFDM0IsVUFBTSxTQUFTLE1BQU0sWUFBWSxJQUFJLEtBQUssT0FBTyxF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
