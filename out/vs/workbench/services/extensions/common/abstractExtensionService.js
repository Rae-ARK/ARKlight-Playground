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
import { Barrier } from "../../../../base/common/async.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import * as perf from "../../../../base/common/performance.js";
import { isCI } from "../../../../base/common/platform.js";
import { isEqualOrParent } from "../../../../base/common/resources.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { isDefined } from "../../../../base/common/types.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { InstallOperation } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { ImplicitActivationEvents } from "../../../../platform/extensionManagement/common/implicitActivationEvents.js";
import { ExtensionIdentifier, ExtensionIdentifierMap } from "../../../../platform/extensions/common/extensions.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { handleVetos } from "../../../../platform/lifecycle/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode, getRemoteAuthorityPrefix } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { IRemoteExtensionsScannerService } from "../../../../platform/remote/common/remoteExtensionsScanner.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { Extensions as ExtensionFeaturesExtensions } from "../../extensionManagement/common/extensionFeatures.js";
import { IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from "../../extensionManagement/common/extensionManagement.js";
import { LockableExtensionDescriptionRegistry } from "./extensionDescriptionRegistry.js";
import { parseExtensionDevOptions } from "./extensionDevOptions.js";
import { ExtensionHostKind, ExtensionRunningPreference } from "./extensionHostKind.js";
import { ExtensionHostManager } from "./extensionHostManager.js";
import { IExtensionManifestPropertiesService } from "./extensionManifestPropertiesService.js";
import { LocalProcessRunningLocation, LocalWebWorkerRunningLocation, RemoteRunningLocation } from "./extensionRunningLocation.js";
import { ExtensionRunningLocationTracker, filterExtensionIdentifiers } from "./extensionRunningLocationTracker.js";
import { ActivationKind, ActivationTimes, ExtensionHostStartup, ExtensionPointContribution, setProposedApiUsageReporter, toExtension, toExtensionDescription } from "./extensions.js";
import { ExtensionMessageCollector, ExtensionsRegistry } from "./extensionsRegistry.js";
import { LazyCreateExtensionHostManager } from "./lazyCreateExtensionHostManager.js";
import { ResponsiveState } from "./rpcProtocol.js";
import { checkActivateWorkspaceContainsExtension, checkGlobFileExists } from "./workspaceContains.js";
import { ILifecycleService, WillShutdownJoinerOrder } from "../../lifecycle/common/lifecycle.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
const hasOwnProperty = Object.hasOwnProperty;
const NO_OP_VOID_PROMISE = Promise.resolve(void 0);
let AbstractExtensionService = class extends Disposable {
  constructor(options, _extensionsProposedApi, _extensionHostFactory, _extensionHostKindPicker, _instantiationService, _notificationService, _environmentService, _telemetryService, _extensionEnablementService, _fileService, _productService, _extensionManagementService, _contextService, _configurationService, _extensionManifestPropertiesService, _logService, _remoteAgentService, _remoteExtensionsScannerService, _lifecycleService, _remoteAuthorityResolverService, _dialogService) {
    super();
    this._extensionsProposedApi = _extensionsProposedApi;
    this._extensionHostFactory = _extensionHostFactory;
    this._extensionHostKindPicker = _extensionHostKindPicker;
    this._instantiationService = _instantiationService;
    this._notificationService = _notificationService;
    this._environmentService = _environmentService;
    this._telemetryService = _telemetryService;
    this._extensionEnablementService = _extensionEnablementService;
    this._fileService = _fileService;
    this._productService = _productService;
    this._extensionManagementService = _extensionManagementService;
    this._contextService = _contextService;
    this._configurationService = _configurationService;
    this._extensionManifestPropertiesService = _extensionManifestPropertiesService;
    this._logService = _logService;
    this._remoteAgentService = _remoteAgentService;
    this._remoteExtensionsScannerService = _remoteExtensionsScannerService;
    this._lifecycleService = _lifecycleService;
    this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
    this._dialogService = _dialogService;
    this._onDidRegisterExtensions = this._register(new Emitter());
    this.onDidRegisterExtensions = this._onDidRegisterExtensions.event;
    this._onDidChangeExtensionsStatus = this._register(new Emitter());
    this.onDidChangeExtensionsStatus = this._onDidChangeExtensionsStatus.event;
    this._onDidChangeExtensions = this._register(new Emitter({ leakWarningThreshold: 400, leakWarningName: "ExtensionService._onDidChangeExtensions" }));
    this.onDidChangeExtensions = this._onDidChangeExtensions.event;
    this._onWillActivateByEvent = this._register(new Emitter());
    this.onWillActivateByEvent = this._onWillActivateByEvent.event;
    this._onDidChangeResponsiveChange = this._register(new Emitter());
    this.onDidChangeResponsiveChange = this._onDidChangeResponsiveChange.event;
    this._onWillStop = this._register(new Emitter());
    this.onWillStop = this._onWillStop.event;
    this._activationEventReader = new ImplicitActivationAwareReader();
    this._registry = new LockableExtensionDescriptionRegistry(this._activationEventReader);
    this._installedExtensionsReady = new Barrier();
    this._extensionStatus = new ExtensionIdentifierMap();
    this._allRequestedActivateEvents = /* @__PURE__ */ new Set();
    this._pendingRemoteActivationEvents = /* @__PURE__ */ new Set();
    this._remoteCrashTracker = new ExtensionHostCrashTracker();
    this._deltaExtensionsQueue = [];
    this._inHandleDeltaExtensions = false;
    this._extensionHostManagers = this._register(new ExtensionHostCollection());
    this._resolveAuthorityAttempt = 0;
    //#endregion
    this._initializePromise = null;
    this._hasLocalProcess = options.hasLocalProcess;
    this._allowRemoteExtensionsInLocalWebWorker = options.allowRemoteExtensionsInLocalWebWorker;
    this._register(this._fileService.onWillActivateFileSystemProvider((e) => {
      if (e.scheme !== Schemas.vscodeRemote) {
        e.join(this.activateByEvent(`onFileSystem:${e.scheme}`));
      }
    }));
    this._register(setProposedApiUsageReporter((usage) => this._reportProposedApiUsage(usage)));
    this._runningLocations = new ExtensionRunningLocationTracker(
      this._registry,
      this._extensionHostKindPicker,
      this._environmentService,
      this._configurationService,
      this._logService,
      this._extensionManifestPropertiesService
    );
    this._register(this._extensionEnablementService.onEnablementChanged((extensions) => {
      const toAdd = [];
      const toRemove = [];
      for (const extension of extensions) {
        if (this._safeInvokeIsEnabled(extension)) {
          toAdd.push(extension);
        } else {
          toRemove.push(extension);
        }
      }
      if (isCI) {
        this._logService.info(`AbstractExtensionService.onEnablementChanged fired for ${extensions.map((e) => e.identifier.id).join(", ")}`);
      }
      this._handleDeltaExtensions(new DeltaExtensionsQueueItem(toAdd, toRemove));
    }));
    this._register(this._extensionManagementService.onDidChangeProfile(({ added, removed }) => {
      if (added.length || removed.length) {
        if (isCI) {
          this._logService.info(`AbstractExtensionService.onDidChangeProfile fired`);
        }
        this._handleDeltaExtensions(new DeltaExtensionsQueueItem(added, removed));
      }
    }));
    this._register(this._extensionManagementService.onDidEnableExtensions((extensions) => {
      if (extensions.length) {
        if (isCI) {
          this._logService.info(`AbstractExtensionService.onDidEnableExtensions fired`);
        }
        this._handleDeltaExtensions(new DeltaExtensionsQueueItem(extensions, []));
      }
    }));
    this._register(this._extensionManagementService.onDidInstallExtensions((result) => {
      const extensions = [];
      const toRemove = [];
      for (const { local, operation } of result) {
        if (local && local.isValid && operation !== InstallOperation.Migrate && this._safeInvokeIsEnabled(local)) {
          extensions.push(local);
          if (operation === InstallOperation.Update) {
            toRemove.push(local.identifier.id);
          }
        }
      }
      if (extensions.length) {
        if (isCI) {
          this._logService.info(`AbstractExtensionService.onDidInstallExtensions fired for ${extensions.map((e) => e.identifier.id).join(", ")}`);
        }
        this._handleDeltaExtensions(new DeltaExtensionsQueueItem(extensions, toRemove));
      }
    }));
    this._register(this._extensionManagementService.onDidUninstallExtension((event) => {
      if (!event.error) {
        if (isCI) {
          this._logService.info(`AbstractExtensionService.onDidUninstallExtension fired for ${event.identifier.id}`);
        }
        this._handleDeltaExtensions(new DeltaExtensionsQueueItem([], [event.identifier.id]));
      }
    }));
    this._register(this._lifecycleService.onWillShutdown((event) => {
      if (this._remoteAgentService.getConnection()) {
        event.join(async () => {
          try {
            await this._remoteAgentService.endConnection();
            await this._doStopExtensionHosts();
            this._remoteAgentService.getConnection()?.dispose();
          } catch {
            this._logService.warn("Error while disconnecting remote agent");
          }
        }, {
          id: "join.disconnectRemote",
          label: nls.localize("disconnectRemote", "Disconnect Remote Agent"),
          order: WillShutdownJoinerOrder.Last
          // after others have joined that might depend on a remote connection
        });
      } else {
        event.join(this._doStopExtensionHosts(), {
          id: "join.stopExtensionHosts",
          label: nls.localize("stopExtensionHosts", "Stopping Extension Hosts")
        });
      }
    }));
  }
  _getExtensionHostManagers(kind) {
    return this._extensionHostManagers.getByKind(kind);
  }
  //#region deltaExtensions
  async _handleDeltaExtensions(item) {
    this._deltaExtensionsQueue.push(item);
    if (this._inHandleDeltaExtensions) {
      return;
    }
    let lock = null;
    try {
      this._inHandleDeltaExtensions = true;
      await this._installedExtensionsReady.wait();
      lock = await this._registry.acquireLock("handleDeltaExtensions");
      while (this._deltaExtensionsQueue.length > 0) {
        const item2 = this._deltaExtensionsQueue.shift();
        await this._deltaExtensions(lock, item2.toAdd, item2.toRemove);
      }
    } finally {
      this._inHandleDeltaExtensions = false;
      lock?.dispose();
    }
  }
  async _deltaExtensions(lock, _toAdd, _toRemove) {
    if (isCI) {
      this._logService.info(`AbstractExtensionService._deltaExtensions: toAdd: [${_toAdd.map((e) => e.identifier.id).join(",")}] toRemove: [${_toRemove.map((e) => typeof e === "string" ? e : e.identifier.id).join(",")}]`);
    }
    let toRemove = [];
    for (let i = 0, len = _toRemove.length; i < len; i++) {
      const extensionOrId = _toRemove[i];
      const extensionId = typeof extensionOrId === "string" ? extensionOrId : extensionOrId.identifier.id;
      const extension = typeof extensionOrId === "string" ? null : extensionOrId;
      const extensionDescription = this._registry.getExtensionDescription(extensionId);
      if (!extensionDescription) {
        continue;
      }
      if (extension && extensionDescription.extensionLocation.scheme !== extension.location.scheme) {
        continue;
      }
      if (!this.canRemoveExtension(extensionDescription)) {
        continue;
      }
      toRemove.push(extensionDescription);
    }
    const toAdd = [];
    for (let i = 0, len = _toAdd.length; i < len; i++) {
      const extension = _toAdd[i];
      const extensionDescription = toExtensionDescription(extension, false);
      if (!extensionDescription) {
        continue;
      }
      if (!this._canAddExtension(extensionDescription, toRemove)) {
        continue;
      }
      toAdd.push(extensionDescription);
    }
    if (toAdd.length === 0 && toRemove.length === 0) {
      return;
    }
    const result = this._registry.deltaExtensions(lock, toAdd, toRemove.map((e) => e.identifier));
    this._onDidChangeExtensions.fire({ added: toAdd, removed: toRemove });
    toRemove = toRemove.concat(result.removedDueToLooping);
    if (result.removedDueToLooping.length > 0) {
      this._notificationService.notify({
        severity: Severity.Error,
        message: nls.localize("looping", "The following extensions contain dependency loops and have been disabled: {0}", result.removedDueToLooping.map((e) => `'${e.identifier.value}'`).join(", "))
      });
    }
    this._extensionsProposedApi.updateEnabledApiProposals(toAdd);
    this._doHandleExtensionPoints([].concat(toAdd).concat(toRemove), false);
    await this._updateExtensionsOnExtHosts(result.versionId, toAdd, toRemove.map((e) => e.identifier));
    for (let i = 0; i < toAdd.length; i++) {
      this._activateAddedExtensionIfNeeded(toAdd[i]);
    }
  }
  async _updateExtensionsOnExtHosts(versionId, toAdd, toRemove) {
    const removedRunningLocation = this._runningLocations.deltaExtensions(toAdd, toRemove);
    const promises = this._extensionHostManagers.map(
      (extHostManager) => this._updateExtensionsOnExtHost(extHostManager, versionId, toAdd, toRemove, removedRunningLocation)
    );
    await Promise.all(promises);
  }
  async _updateExtensionsOnExtHost(extensionHostManager, versionId, toAdd, toRemove, removedRunningLocation) {
    const myToAdd = this._runningLocations.filterByExtensionHostManager(toAdd, extensionHostManager);
    const myToRemove = filterExtensionIdentifiers(toRemove, removedRunningLocation, (extRunningLocation) => extensionHostManager.representsRunningLocation(extRunningLocation));
    const addActivationEvents = ImplicitActivationEvents.createActivationEventsMap(toAdd);
    if (isCI) {
      const printExtIds = (extensions) => extensions.map((e) => e.identifier.value).join(",");
      const printIds = (extensions) => extensions.map((e) => e.value).join(",");
      this._logService.info(`AbstractExtensionService: Calling deltaExtensions: toRemove: [${printIds(toRemove)}], toAdd: [${printExtIds(toAdd)}], myToRemove: [${printIds(myToRemove)}], myToAdd: [${printExtIds(myToAdd)}],`);
    }
    await extensionHostManager.deltaExtensions({ versionId, toRemove, toAdd, addActivationEvents, myToRemove, myToAdd: myToAdd.map((extension) => extension.identifier) });
  }
  canAddExtension(extension) {
    return this._canAddExtension(extension, []);
  }
  _canAddExtension(extension, extensionsBeingRemoved) {
    const existing = this._registry.getExtensionDescriptionByIdOrUUID(extension.identifier, extension.id);
    if (existing) {
      const isBeingRemoved = extensionsBeingRemoved.some((extensionDescription) => ExtensionIdentifier.equals(extension.identifier, extensionDescription.identifier));
      if (!isBeingRemoved) {
        return false;
      }
    }
    const extensionKinds = this._runningLocations.readExtensionKinds(extension);
    const isRemote = extension.extensionLocation.scheme === Schemas.vscodeRemote;
    const extensionHostKind = this._extensionHostKindPicker.pickExtensionHostKind(extension.identifier, extensionKinds, !isRemote, isRemote, ExtensionRunningPreference.None);
    if (extensionHostKind === null) {
      return false;
    }
    return true;
  }
  canRemoveExtension(extension) {
    const extensionDescription = this._registry.getExtensionDescription(extension.identifier);
    if (!extensionDescription) {
      return false;
    }
    if (this._extensionStatus.get(extensionDescription.identifier)?.activationStarted) {
      return false;
    }
    return true;
  }
  async _activateAddedExtensionIfNeeded(extensionDescription) {
    let shouldActivateReason = null;
    let hasWorkspaceContains = false;
    const activationEvents = this._activationEventReader.readActivationEvents(extensionDescription);
    for (const activationEvent of activationEvents) {
      if (this._allRequestedActivateEvents.has(activationEvent)) {
        shouldActivateReason = activationEvent;
        break;
      }
      if (activationEvent === "*") {
        shouldActivateReason = activationEvent;
        break;
      }
      if (/^workspaceContains/.test(activationEvent)) {
        hasWorkspaceContains = true;
      }
      if (activationEvent === "onStartupFinished") {
        shouldActivateReason = activationEvent;
        break;
      }
    }
    if (!shouldActivateReason && hasWorkspaceContains) {
      const workspace = await this._contextService.getCompleteWorkspace();
      const forceUsingSearch = !!this._environmentService.remoteAuthority;
      const host = {
        logService: this._logService,
        folders: workspace.folders.map((folder) => folder.uri),
        forceUsingSearch,
        exists: (uri) => this._fileService.exists(uri),
        checkExists: (folders, includes2, token) => this._instantiationService.invokeFunction((accessor) => checkGlobFileExists(accessor, folders, includes2, token))
      };
      const result = await checkActivateWorkspaceContainsExtension(host, extensionDescription);
      if (result) {
        shouldActivateReason = result.activationEvent;
      }
    }
    if (shouldActivateReason) {
      await Promise.all(
        this._extensionHostManagers.map((extHostManager) => extHostManager.activate(extensionDescription.identifier, { startup: false, extensionId: extensionDescription.identifier, activationEvent: shouldActivateReason }))
      );
    }
  }
  _initializeIfNeeded() {
    if (!this._initializePromise) {
      this._initializePromise = this._initialize();
    }
    return this._initializePromise;
  }
  async _initialize() {
    perf.mark("code/willLoadExtensions");
    this._startExtensionHostsIfNecessary(true, []);
    const lock = await this._registry.acquireLock("_initialize");
    try {
      await this._resolveAndProcessExtensions(lock);
      this._startOnDemandExtensionHosts();
    } finally {
      lock.dispose();
    }
    this._releaseBarrier();
    perf.mark("code/didLoadExtensions");
    this._activateDeferredRemoteEvents();
    await this._handleExtensionTests();
  }
  async _activateDeferredRemoteEvents() {
    if (this._pendingRemoteActivationEvents.size === 0) {
      return;
    }
    const remoteExtensionHosts = this._getExtensionHostManagers(ExtensionHostKind.Remote);
    if (remoteExtensionHosts.length === 0) {
      this._pendingRemoteActivationEvents.clear();
      return;
    }
    await Promise.all(remoteExtensionHosts.map((extHost) => extHost.ready()));
    for (const activationEvent of this._pendingRemoteActivationEvents) {
      const result = Promise.all(
        remoteExtensionHosts.map((extHostManager) => extHostManager.activateByEvent(activationEvent, ActivationKind.Normal))
      ).then(() => {
      });
      this._onWillActivateByEvent.fire({
        event: activationEvent,
        activation: result,
        activationKind: ActivationKind.Normal
      });
    }
    this._pendingRemoteActivationEvents.clear();
  }
  async _resolveAndProcessExtensions(lock) {
    let resolverExtensions = [];
    let localExtensions = [];
    let remoteExtensions = [];
    for await (const extensions of this._resolveExtensions()) {
      if (extensions instanceof ResolverExtensions) {
        resolverExtensions = checkEnabledAndProposedAPI(this._logService, this._extensionEnablementService, this._extensionsProposedApi, extensions.extensions, false);
        this._registry.deltaExtensions(lock, resolverExtensions, []);
        this._doHandleExtensionPoints(resolverExtensions, true);
      }
      if (extensions instanceof LocalExtensions) {
        localExtensions = checkEnabledAndProposedAPI(this._logService, this._extensionEnablementService, this._extensionsProposedApi, extensions.extensions, false);
      }
      if (extensions instanceof RemoteExtensions) {
        remoteExtensions = checkEnabledAndProposedAPI(this._logService, this._extensionEnablementService, this._extensionsProposedApi, extensions.extensions, false);
      }
    }
    this._runningLocations.initializeRunningLocation(localExtensions, remoteExtensions);
    this._startExtensionHostsIfNecessary(true, []);
    const remoteExtensionsThatNeedToRunLocally = this._allowRemoteExtensionsInLocalWebWorker ? this._runningLocations.filterByExtensionHostKind(remoteExtensions, ExtensionHostKind.LocalWebWorker) : [];
    const localProcessExtensions = this._hasLocalProcess ? this._runningLocations.filterByExtensionHostKind(localExtensions, ExtensionHostKind.LocalProcess) : [];
    const localWebWorkerExtensions = this._runningLocations.filterByExtensionHostKind(localExtensions, ExtensionHostKind.LocalWebWorker);
    remoteExtensions = this._runningLocations.filterByExtensionHostKind(remoteExtensions, ExtensionHostKind.Remote);
    for (const ext of remoteExtensionsThatNeedToRunLocally) {
      if (!includes(localWebWorkerExtensions, ext.identifier)) {
        localWebWorkerExtensions.push(ext);
      }
    }
    const allExtensions = remoteExtensions.concat(localProcessExtensions).concat(localWebWorkerExtensions);
    let toAdd = allExtensions;
    if (resolverExtensions.length) {
      toAdd = allExtensions.filter((extension) => !resolverExtensions.some((e) => ExtensionIdentifier.equals(e.identifier, extension.identifier) && e.extensionLocation.toString() === extension.extensionLocation.toString()));
      if (allExtensions.length < toAdd.length + resolverExtensions.length) {
        const toRemove = resolverExtensions.filter((registered) => !allExtensions.some((e) => ExtensionIdentifier.equals(e.identifier, registered.identifier) && e.extensionLocation.toString() === registered.extensionLocation.toString()));
        if (toRemove.length) {
          this._registry.deltaExtensions(lock, [], toRemove.map((e) => e.identifier));
          this._doHandleExtensionPoints(toRemove, true);
        }
      }
    }
    const result = this._registry.deltaExtensions(lock, toAdd, []);
    if (result.removedDueToLooping.length > 0) {
      this._notificationService.notify({
        severity: Severity.Error,
        message: nls.localize("looping", "The following extensions contain dependency loops and have been disabled: {0}", result.removedDueToLooping.map((e) => `'${e.identifier.value}'`).join(", "))
      });
    }
    this._doHandleExtensionPoints(this._registry.getAllExtensionDescriptions(), false);
  }
  async _handleExtensionTests() {
    if (!this._environmentService.isExtensionDevelopment || !this._environmentService.extensionTestsLocationURI) {
      return;
    }
    const extensionHostManager = this.findTestExtensionHost(this._environmentService.extensionTestsLocationURI);
    if (!extensionHostManager) {
      const msg = nls.localize("extensionTestError", "No extension host found that can launch the test runner at {0}.", this._environmentService.extensionTestsLocationURI.toString());
      console.error(msg);
      this._notificationService.error(msg);
      return;
    }
    let exitCode;
    try {
      exitCode = await extensionHostManager.extensionTestsExecute();
      if (isCI) {
        this._logService.info(`Extension host test runner exit code: ${exitCode}`);
      }
    } catch (err) {
      if (isCI) {
        this._logService.error(`Extension host test runner error`, err);
      }
      console.error(err);
      exitCode = 1;
    }
    this._onExtensionHostExit(exitCode);
  }
  findTestExtensionHost(testLocation) {
    let runningLocation = null;
    for (const extension of this._registry.getAllExtensionDescriptions()) {
      if (isEqualOrParent(testLocation, extension.extensionLocation)) {
        runningLocation = this._runningLocations.getRunningLocation(extension.identifier);
        break;
      }
    }
    if (runningLocation === null) {
      if (testLocation.scheme === Schemas.vscodeRemote) {
        runningLocation = new RemoteRunningLocation();
      } else {
        runningLocation = new LocalProcessRunningLocation(0);
      }
    }
    if (runningLocation !== null) {
      return this._extensionHostManagers.getByRunningLocation(runningLocation);
    }
    return null;
  }
  _releaseBarrier() {
    this._installedExtensionsReady.open();
    this._onDidRegisterExtensions.fire(void 0);
    this._onDidChangeExtensionsStatus.fire(this._registry.getAllExtensionDescriptions().map((e) => e.identifier));
  }
  //#region remote authority resolving
  async _resolveAuthorityInitial(remoteAuthority) {
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; ; attempt++) {
      try {
        return this._resolveAuthorityWithLogging(remoteAuthority);
      } catch (err) {
        if (RemoteAuthorityResolverError.isNoResolverFound(err)) {
          throw err;
        }
        if (RemoteAuthorityResolverError.isNotAvailable(err)) {
          throw err;
        }
        if (attempt >= MAX_ATTEMPTS) {
          throw err;
        }
      }
    }
  }
  async _resolveAuthorityAgain() {
    const remoteAuthority = this._environmentService.remoteAuthority;
    if (!remoteAuthority) {
      return;
    }
    this._remoteAuthorityResolverService._clearResolvedAuthority(remoteAuthority);
    try {
      const result = await this._resolveAuthorityWithLogging(remoteAuthority);
      this._remoteAuthorityResolverService._setResolvedAuthority(result.authority, result.options);
    } catch (err) {
      this._remoteAuthorityResolverService._setResolvedAuthorityError(remoteAuthority, err);
    }
  }
  async _resolveAuthorityWithLogging(remoteAuthority) {
    const authorityPrefix = getRemoteAuthorityPrefix(remoteAuthority);
    const sw = StopWatch.create(false);
    this._logService.info(`Invoking resolveAuthority(${authorityPrefix})...`);
    try {
      perf.mark(`code/willResolveAuthority/${authorityPrefix}`);
      const result = await this._resolveAuthority(remoteAuthority);
      perf.mark(`code/didResolveAuthorityOK/${authorityPrefix}`);
      this._logService.info(`resolveAuthority(${authorityPrefix}) returned '${result.authority.connectTo}' after ${sw.elapsed()} ms`);
      return result;
    } catch (err) {
      perf.mark(`code/didResolveAuthorityError/${authorityPrefix}`);
      this._logService.error(`resolveAuthority(${authorityPrefix}) returned an error after ${sw.elapsed()} ms`, err);
      throw err;
    }
  }
  async _resolveAuthorityOnExtensionHosts(kind, remoteAuthority) {
    const extensionHosts = this._getExtensionHostManagers(kind);
    if (extensionHosts.length === 0) {
      throw new Error(`Cannot resolve authority`);
    }
    this._resolveAuthorityAttempt++;
    const results = await Promise.all(extensionHosts.map((extHost) => extHost.resolveAuthority(remoteAuthority, this._resolveAuthorityAttempt)));
    let bestErrorResult = null;
    for (const result of results) {
      if (result.type === "ok") {
        return result.value;
      }
      if (!bestErrorResult) {
        bestErrorResult = result;
        continue;
      }
      const bestErrorIsUnknown = bestErrorResult.error.code === RemoteAuthorityResolverErrorCode.Unknown;
      const errorIsUnknown = result.error.code === RemoteAuthorityResolverErrorCode.Unknown;
      if (bestErrorIsUnknown && !errorIsUnknown) {
        bestErrorResult = result;
      }
    }
    throw new RemoteAuthorityResolverError(bestErrorResult.error.message, bestErrorResult.error.code, bestErrorResult.error.detail);
  }
  //#endregion
  //#region Stopping / Starting / Restarting
  async stopExtensionHosts(reason, auto) {
    await this._initializeIfNeeded();
    return this._doStopExtensionHostsWithVeto(reason, auto);
  }
  async _doStopExtensionHosts() {
    const previouslyActivatedExtensionIds = [];
    for (const extensionStatus of this._extensionStatus.values()) {
      if (extensionStatus.activationStarted) {
        previouslyActivatedExtensionIds.push(extensionStatus.id);
      }
    }
    await this._extensionHostManagers.stopAllInReverse();
    for (const extensionStatus of this._extensionStatus.values()) {
      extensionStatus.clearRuntimeStatus();
    }
    if (previouslyActivatedExtensionIds.length > 0) {
      this._onDidChangeExtensionsStatus.fire(previouslyActivatedExtensionIds);
    }
  }
  async _doStopExtensionHostsWithVeto(reason, auto = false) {
    if (auto && this._environmentService.isExtensionDevelopment) {
      return false;
    }
    const vetos = [];
    const vetoReasons = /* @__PURE__ */ new Set();
    this._onWillStop.fire({
      reason,
      auto,
      veto(value, reason2) {
        vetos.push(value);
        if (typeof value === "boolean") {
          if (value === true) {
            vetoReasons.add(reason2);
          }
        } else {
          value.then((value2) => {
            if (value2) {
              vetoReasons.add(reason2);
            }
          }).catch((error) => {
            vetoReasons.add(nls.localize("extensionStopVetoError", "{0} (Error: {1})", reason2, toErrorMessage(error)));
          });
        }
      }
    });
    const veto = await handleVetos(vetos, (error) => this._logService.error(error));
    if (!veto) {
      await this._doStopExtensionHosts();
    } else {
      if (!auto) {
        const vetoReasonsArray = Array.from(vetoReasons);
        this._logService.warn(`Extension host was not stopped because of veto (stop reason: ${reason}, veto reason: ${vetoReasonsArray.join(", ")})`);
        const { confirmed } = await this._dialogService.confirm({
          type: Severity.Warning,
          message: nls.localize("extensionStopVetoMessage", "Please confirm restart of extensions."),
          detail: vetoReasonsArray.length === 1 ? vetoReasonsArray[0] : vetoReasonsArray.join("\n -"),
          primaryButton: nls.localize("proceedAnyways", "Restart Anyway")
        });
        if (confirmed) {
          return true;
        }
      }
    }
    return !veto;
  }
  _startExtensionHostsIfNecessary(isInitialStart, initialActivationEvents) {
    const locations = [];
    for (let affinity = 0; affinity <= this._runningLocations.maxLocalProcessAffinity; affinity++) {
      locations.push(new LocalProcessRunningLocation(affinity));
    }
    for (let affinity = 0; affinity <= this._runningLocations.maxLocalWebWorkerAffinity; affinity++) {
      locations.push(new LocalWebWorkerRunningLocation(affinity));
    }
    locations.push(new RemoteRunningLocation());
    for (const location of locations) {
      if (this._extensionHostManagers.getByRunningLocation(location)) {
        continue;
      }
      const res = this._createExtensionHostManager(location, isInitialStart, initialActivationEvents);
      if (res) {
        const [extHostManager, disposableStore] = res;
        this._extensionHostManagers.add(extHostManager, disposableStore);
      }
    }
  }
  _createExtensionHostManager(runningLocation, isInitialStart, initialActivationEvents) {
    const extensionHost = this._extensionHostFactory.createExtensionHost(this._runningLocations, runningLocation, isInitialStart);
    if (!extensionHost) {
      return null;
    }
    const processManager = this._doCreateExtensionHostManager(extensionHost, initialActivationEvents);
    const disposableStore = new DisposableStore();
    disposableStore.add(processManager.onDidExit(([code, signal]) => this._onExtensionHostCrashOrExit(processManager, code, signal)));
    disposableStore.add(processManager.onDidChangeResponsiveState((responsiveState) => {
      this._logService.info(`Extension host (${processManager.friendyName}) is ${responsiveState === ResponsiveState.Responsive ? "responsive" : "unresponsive"}.`);
      this._onDidChangeResponsiveChange.fire({
        extensionHostKind: processManager.kind,
        isResponsive: responsiveState === ResponsiveState.Responsive,
        getInspectListener: (tryEnableInspector) => {
          return processManager.getInspectPort(tryEnableInspector);
        }
      });
    }));
    return [processManager, disposableStore];
  }
  _doCreateExtensionHostManager(extensionHost, initialActivationEvents) {
    const internalExtensionService = this._acquireInternalAPI(extensionHost);
    if (extensionHost.startup === ExtensionHostStartup.LazyAutoStart) {
      return this._instantiationService.createInstance(LazyCreateExtensionHostManager, extensionHost, initialActivationEvents, internalExtensionService);
    }
    return this._instantiationService.createInstance(ExtensionHostManager, extensionHost, initialActivationEvents, internalExtensionService);
  }
  _onExtensionHostCrashOrExit(extensionHost, code, signal) {
    const isExtensionDevHost = parseExtensionDevOptions(this._environmentService).isExtensionDevHost;
    if (!isExtensionDevHost) {
      this._onExtensionHostCrashed(extensionHost, code, signal);
      return;
    }
    this._onExtensionHostExit(code);
  }
  _onExtensionHostCrashed(extensionHost, code, signal) {
    console.error(`Extension host (${extensionHost.friendyName}) terminated unexpectedly. Code: ${code}, Signal: ${signal}`);
    if (extensionHost.kind === ExtensionHostKind.LocalProcess) {
      this._doStopExtensionHosts();
    } else if (extensionHost.kind === ExtensionHostKind.Remote) {
      if (signal) {
        this._onRemoteExtensionHostCrashed(extensionHost, signal);
      }
      this._extensionHostManagers.stopOne(extensionHost);
    }
  }
  _getExtensionHostExitInfoWithTimeout(reconnectionToken) {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error("getExtensionHostExitInfo timed out"));
      }, 2e3);
      this._remoteAgentService.getExtensionHostExitInfo(reconnectionToken).then(
        (r) => {
          clearTimeout(timeoutHandle);
          resolve(r);
        },
        reject
      );
    });
  }
  async _onRemoteExtensionHostCrashed(extensionHost, reconnectionToken) {
    try {
      const info = await this._getExtensionHostExitInfoWithTimeout(reconnectionToken);
      if (info) {
        this._logService.error(`Extension host (${extensionHost.friendyName}) terminated unexpectedly with code ${info.code}.`);
      }
      this._logExtensionHostCrash(extensionHost);
      this._remoteCrashTracker.registerCrash();
      if (this._remoteCrashTracker.shouldAutomaticallyRestart()) {
        this._logService.info(`Automatically restarting the remote extension host.`);
        this._notificationService.status(nls.localize("extensionService.autoRestart", "The remote extension host terminated unexpectedly. Restarting..."), { hideAfter: 5e3 });
        this._startExtensionHostsIfNecessary(false, Array.from(this._allRequestedActivateEvents.keys()));
      } else {
        this._notificationService.prompt(
          Severity.Error,
          nls.localize("extensionService.crash", "Remote Extension host terminated unexpectedly 3 times within the last 5 minutes."),
          [{
            label: nls.localize("restart", "Restart Remote Extension Host"),
            run: () => {
              this._startExtensionHostsIfNecessary(false, Array.from(this._allRequestedActivateEvents.keys()));
            }
          }]
        );
      }
    } catch (err) {
    }
  }
  _logExtensionHostCrash(extensionHost) {
    const activatedExtensions = [];
    for (const extensionStatus of this._extensionStatus.values()) {
      if (extensionStatus.activationStarted && extensionHost.containsExtension(extensionStatus.id)) {
        activatedExtensions.push(extensionStatus.id);
      }
    }
    if (activatedExtensions.length > 0) {
      this._logService.error(`Extension host (${extensionHost.friendyName}) terminated unexpectedly. The following extensions were running: ${activatedExtensions.map((id) => id.value).join(", ")}`);
    } else {
      this._logService.error(`Extension host (${extensionHost.friendyName}) terminated unexpectedly. No extensions were activated.`);
    }
  }
  async startExtensionHosts(updates) {
    await this._doStopExtensionHosts();
    if (updates) {
      await this._handleDeltaExtensions(new DeltaExtensionsQueueItem(updates.toAdd, updates.toRemove));
    }
    const lock = await this._registry.acquireLock("startExtensionHosts");
    try {
      this._startExtensionHostsIfNecessary(false, Array.from(this._allRequestedActivateEvents.keys()));
      this._startOnDemandExtensionHosts();
      const localProcessExtensionHosts = this._getExtensionHostManagers(ExtensionHostKind.LocalProcess);
      await Promise.all(localProcessExtensionHosts.map((extHost) => extHost.ready()));
    } finally {
      lock.dispose();
    }
  }
  _startOnDemandExtensionHosts() {
    const snapshot = this._registry.getSnapshot();
    for (const extHostManager of this._extensionHostManagers) {
      if (extHostManager.startup !== ExtensionHostStartup.EagerAutoStart) {
        const extensions = this._runningLocations.filterByExtensionHostManager(snapshot.extensions, extHostManager);
        extHostManager.start(snapshot.versionId, snapshot.extensions, extensions.map((extension) => extension.identifier));
      }
    }
  }
  //#endregion
  //#region IExtensionService
  activateByEvent(activationEvent, activationKind = ActivationKind.Normal) {
    if (this._installedExtensionsReady.isOpen()) {
      this._allRequestedActivateEvents.add(activationEvent);
      if (!this._registry.containsActivationEvent(activationEvent)) {
        return NO_OP_VOID_PROMISE;
      }
      return this._activateByEvent(activationEvent, activationKind);
    } else {
      this._allRequestedActivateEvents.add(activationEvent);
      if (activationKind === ActivationKind.Immediate) {
        void this._initializeIfNeeded();
        return this._activateByEvent(activationEvent, activationKind);
      }
      return this._installedExtensionsReady.wait().then(() => this._activateByEvent(activationEvent, activationKind));
    }
  }
  _activateByEvent(activationEvent, activationKind) {
    let managers;
    if (activationKind === ActivationKind.Immediate) {
      managers = this._extensionHostManagers.filter(
        (extHostManager) => extHostManager.kind === ExtensionHostKind.LocalProcess || extHostManager.kind === ExtensionHostKind.LocalWebWorker || extHostManager.isReady
      );
      this._pendingRemoteActivationEvents.add(activationEvent);
    } else {
      managers = [...this._extensionHostManagers];
    }
    const result = Promise.all(
      managers.map((extHostManager) => extHostManager.activateByEvent(activationEvent, activationKind))
    ).then(() => {
    });
    this._onWillActivateByEvent.fire({
      event: activationEvent,
      activation: result,
      activationKind
    });
    return result;
  }
  activateById(extensionId, reason) {
    return this._activateById(extensionId, reason);
  }
  activationEventIsDone(activationEvent) {
    if (!this._installedExtensionsReady.isOpen()) {
      return false;
    }
    if (!this._registry.containsActivationEvent(activationEvent)) {
      return true;
    }
    return this._extensionHostManagers.every((manager) => manager.activationEventIsDone(activationEvent));
  }
  whenInstalledExtensionsRegistered() {
    return this._installedExtensionsReady.wait();
  }
  get extensions() {
    return this._registry.getAllExtensionDescriptions();
  }
  _getExtensionRegistrySnapshotWhenReady() {
    return this._installedExtensionsReady.wait().then(() => this._registry.getSnapshot());
  }
  getExtension(id) {
    return this._installedExtensionsReady.wait().then(() => {
      return this._registry.getExtensionDescription(id);
    });
  }
  readExtensionPointContributions(extPoint) {
    return this._installedExtensionsReady.wait().then(() => {
      const availableExtensions = this._registry.getAllExtensionDescriptions();
      const result = [];
      for (const desc of availableExtensions) {
        if (desc.contributes && hasOwnProperty.call(desc.contributes, extPoint.name)) {
          result.push(new ExtensionPointContribution(desc, desc.contributes[extPoint.name]));
        }
      }
      return result;
    });
  }
  getExtensionsStatus() {
    const result = /* @__PURE__ */ Object.create(null);
    if (this._registry) {
      const extensions = this._registry.getAllExtensionDescriptions();
      for (const extension of extensions) {
        const extensionStatus = this._extensionStatus.get(extension.identifier);
        result[extension.identifier.value] = {
          id: extension.identifier,
          messages: extensionStatus?.messages ?? [],
          activationStarted: extensionStatus?.activationStarted ?? false,
          activationTimes: extensionStatus?.activationTimes ?? void 0,
          runtimeErrors: extensionStatus?.runtimeErrors ?? [],
          runningLocation: this._runningLocations.getRunningLocation(extension.identifier)
        };
      }
    }
    return result;
  }
  async getInspectPorts(extensionHostKind, tryEnableInspector) {
    const result = await Promise.all(
      this._getExtensionHostManagers(extensionHostKind).map(async (extHost) => {
        let portInfo = await extHost.getInspectPort(tryEnableInspector);
        if (portInfo !== void 0) {
          portInfo = { ...portInfo, devtoolsLabel: extHost.friendyName };
        }
        return portInfo;
      })
    );
    return result.filter(isDefined);
  }
  async setRemoteEnvironment(env) {
    await this._extensionHostManagers.map((manager) => manager.setRemoteEnvironment(env));
  }
  //#endregion
  // --- impl
  _safeInvokeIsEnabled(extension) {
    try {
      return this._extensionEnablementService.isEnabled(extension);
    } catch (err) {
      return false;
    }
  }
  _doHandleExtensionPoints(affectedExtensions, onlyResolverExtensionPoints) {
    const affectedExtensionPoints = /* @__PURE__ */ Object.create(null);
    for (const extensionDescription of affectedExtensions) {
      if (extensionDescription.contributes) {
        for (const extPointName in extensionDescription.contributes) {
          if (hasOwnProperty.call(extensionDescription.contributes, extPointName)) {
            affectedExtensionPoints[extPointName] = true;
          }
        }
      }
    }
    const messageHandler = (msg) => this._handleExtensionPointMessage(msg);
    const availableExtensions = this._registry.getAllExtensionDescriptions();
    const extensionPoints = ExtensionsRegistry.getExtensionPoints();
    perf.mark(onlyResolverExtensionPoints ? "code/willHandleResolverExtensionPoints" : "code/willHandleExtensionPoints");
    for (const extensionPoint of extensionPoints) {
      if (affectedExtensionPoints[extensionPoint.name] && (!onlyResolverExtensionPoints || extensionPoint.canHandleResolver)) {
        perf.mark(`code/willHandleExtensionPoint/${extensionPoint.name}`);
        AbstractExtensionService._handleExtensionPoint(extensionPoint, availableExtensions, messageHandler);
        perf.mark(`code/didHandleExtensionPoint/${extensionPoint.name}`);
      }
    }
    perf.mark(onlyResolverExtensionPoints ? "code/didHandleResolverExtensionPoints" : "code/didHandleExtensionPoints");
  }
  _getOrCreateExtensionStatus(extensionId) {
    if (!this._extensionStatus.has(extensionId)) {
      this._extensionStatus.set(extensionId, new ExtensionStatus(extensionId));
    }
    return this._extensionStatus.get(extensionId);
  }
  _handleExtensionPointMessage(msg) {
    const extensionStatus = this._getOrCreateExtensionStatus(msg.extensionId);
    extensionStatus.addMessage(msg);
    const extension = this._registry.getExtensionDescription(msg.extensionId);
    const strMsg = `[${msg.extensionId.value}]: ${msg.message}`;
    if (msg.type === Severity.Error) {
      if (extension && extension.isUnderDevelopment) {
        this._notificationService.notify({ severity: Severity.Error, message: strMsg });
      }
      this._logService.error(strMsg);
    } else if (msg.type === Severity.Warning) {
      if (extension && extension.isUnderDevelopment) {
        this._notificationService.notify({ severity: Severity.Warning, message: strMsg });
      }
      this._logService.warn(strMsg);
    } else {
      this._logService.info(strMsg);
    }
    if (msg.extensionId && this._environmentService.isBuilt && !this._environmentService.isExtensionDevelopment) {
      const { type, extensionId, extensionPointId, message } = msg;
      this._telemetryService.publicLog2("extensionsMessage", {
        type,
        extensionId: extensionId.value,
        extensionPointId,
        message
      });
    }
  }
  static _handleExtensionPoint(extensionPoint, availableExtensions, messageHandler) {
    const users = [];
    for (const desc of availableExtensions) {
      if (desc.contributes && hasOwnProperty.call(desc.contributes, extensionPoint.name)) {
        users.push({
          description: desc,
          value: desc.contributes[extensionPoint.name],
          collector: new ExtensionMessageCollector(messageHandler, desc, extensionPoint.name)
        });
      }
    }
    extensionPoint.acceptUsers(users);
  }
  //#region Called by extension host
  _acquireInternalAPI(extensionHost) {
    return {
      _activateById: (extensionId, reason) => {
        return this._activateById(extensionId, reason);
      },
      _onWillActivateExtension: (extensionId) => {
        return this._onWillActivateExtension(extensionId, extensionHost.runningLocation);
      },
      _onDidActivateExtension: (extensionId, codeLoadingTime, activateCallTime, activateResolvedTime, activationReason) => {
        return this._onDidActivateExtension(extensionId, codeLoadingTime, activateCallTime, activateResolvedTime, activationReason);
      },
      _onDidActivateExtensionError: (extensionId, error) => {
        return this._onDidActivateExtensionError(extensionId, error);
      },
      _onExtensionRuntimeError: (extensionId, err) => {
        return this._onExtensionRuntimeError(extensionId, err);
      }
    };
  }
  async _activateById(extensionId, reason) {
    const results = await Promise.all(
      this._extensionHostManagers.map((manager) => manager.activate(extensionId, reason))
    );
    const activated = results.some((e) => e);
    if (!activated) {
      throw new Error(`Unknown extension ${extensionId.value}`);
    }
  }
  _onWillActivateExtension(extensionId, runningLocation) {
    this._runningLocations.set(extensionId, runningLocation);
    const extensionStatus = this._getOrCreateExtensionStatus(extensionId);
    extensionStatus.onWillActivate();
  }
  _onDidActivateExtension(extensionId, codeLoadingTime, activateCallTime, activateResolvedTime, activationReason) {
    const extensionStatus = this._getOrCreateExtensionStatus(extensionId);
    extensionStatus.setActivationTimes(new ActivationTimes(codeLoadingTime, activateCallTime, activateResolvedTime, activationReason));
    this._onDidChangeExtensionsStatus.fire([extensionId]);
  }
  _onDidActivateExtensionError(extensionId, error) {
    this._telemetryService.publicLog2("extensionActivationError", {
      extensionId: extensionId.value,
      error: error.message
    });
  }
  _onExtensionRuntimeError(extensionId, err) {
    const extensionStatus = this._getOrCreateExtensionStatus(extensionId);
    extensionStatus.addRuntimeError(err);
    this._onDidChangeExtensionsStatus.fire([extensionId]);
  }
  _reportProposedApiUsage(usage) {
    this._telemetryService.publicLog2("extensionProposedApiNotEnabled", {
      extensionId: usage.extensionId,
      proposalName: usage.proposalName
    });
  }
};
AbstractExtensionService = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IWorkbenchEnvironmentService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IWorkbenchExtensionEnablementService),
  __decorateParam(9, IFileService),
  __decorateParam(10, IProductService),
  __decorateParam(11, IWorkbenchExtensionManagementService),
  __decorateParam(12, IWorkspaceContextService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IExtensionManifestPropertiesService),
  __decorateParam(15, ILogService),
  __decorateParam(16, IRemoteAgentService),
  __decorateParam(17, IRemoteExtensionsScannerService),
  __decorateParam(18, ILifecycleService),
  __decorateParam(19, IRemoteAuthorityResolverService),
  __decorateParam(20, IDialogService)
], AbstractExtensionService);
class ExtensionHostCollection extends Disposable {
  constructor() {
    super(...arguments);
    this._extensionHostManagers = [];
  }
  dispose() {
    for (let i = this._extensionHostManagers.length - 1; i >= 0; i--) {
      const manager = this._extensionHostManagers[i];
      manager.extensionHost.disconnect();
      manager.dispose();
    }
    this._extensionHostManagers = [];
    super.dispose();
  }
  add(extensionHostManager, disposableStore) {
    this._extensionHostManagers.push(new ExtensionHostManagerData(extensionHostManager, disposableStore));
  }
  async stopAllInReverse() {
    for (let i = this._extensionHostManagers.length - 1; i >= 0; i--) {
      const manager = this._extensionHostManagers[i];
      await manager.extensionHost.disconnect();
      manager.dispose();
    }
    this._extensionHostManagers = [];
  }
  async stopOne(extensionHostManager) {
    const index = this._extensionHostManagers.findIndex((el) => el.extensionHost === extensionHostManager);
    if (index >= 0) {
      this._extensionHostManagers.splice(index, 1);
      await extensionHostManager.disconnect();
      extensionHostManager.dispose();
    }
  }
  getByKind(kind) {
    return this.filter((el) => el.kind === kind);
  }
  getByRunningLocation(runningLocation) {
    for (const el of this._extensionHostManagers) {
      if (el.extensionHost.representsRunningLocation(runningLocation)) {
        return el.extensionHost;
      }
    }
    return null;
  }
  *[Symbol.iterator]() {
    for (const extensionHostManager of this._extensionHostManagers) {
      yield extensionHostManager.extensionHost;
    }
  }
  map(callback) {
    return this._extensionHostManagers.map((el) => callback(el.extensionHost));
  }
  every(callback) {
    return this._extensionHostManagers.every((el) => callback(el.extensionHost));
  }
  filter(callback) {
    return this._extensionHostManagers.filter((el) => callback(el.extensionHost)).map((el) => el.extensionHost);
  }
}
class ExtensionHostManagerData {
  constructor(extensionHost, disposableStore) {
    this.extensionHost = extensionHost;
    this.disposableStore = disposableStore;
  }
  dispose() {
    this.disposableStore.dispose();
    this.extensionHost.dispose();
  }
}
class ResolverExtensions {
  constructor(extensions) {
    this.extensions = extensions;
  }
}
class LocalExtensions {
  constructor(extensions) {
    this.extensions = extensions;
  }
}
class RemoteExtensions {
  constructor(extensions) {
    this.extensions = extensions;
  }
}
class DeltaExtensionsQueueItem {
  constructor(toAdd, toRemove) {
    this.toAdd = toAdd;
    this.toRemove = toRemove;
  }
}
function isResolverExtension(extension) {
  return !!extension.activationEvents?.some((activationEvent) => activationEvent.startsWith("onResolveRemoteAuthority:"));
}
function checkEnabledAndProposedAPI(logService, extensionEnablementService, extensionsProposedApi, extensions, ignoreWorkspaceTrust) {
  extensionsProposedApi.updateEnabledApiProposals(extensions);
  return filterEnabledExtensions(logService, extensionEnablementService, extensions, ignoreWorkspaceTrust);
}
function filterEnabledExtensions(logService, extensionEnablementService, extensions, ignoreWorkspaceTrust) {
  const enabledExtensions = [], extensionsToCheck = [], mappedExtensions = [];
  for (const extension of extensions) {
    if (extension.isUnderDevelopment) {
      enabledExtensions.push(extension);
    } else {
      extensionsToCheck.push(extension);
      mappedExtensions.push(toExtension(extension));
    }
  }
  const enablementStates = extensionEnablementService.getEnablementStates(mappedExtensions, ignoreWorkspaceTrust ? { trusted: true } : void 0);
  for (let index = 0; index < enablementStates.length; index++) {
    if (extensionEnablementService.isEnabledEnablementState(enablementStates[index])) {
      enabledExtensions.push(extensionsToCheck[index]);
    } else {
      if (isCI) {
        logService.info(`filterEnabledExtensions: extension '${extensionsToCheck[index].identifier.value}' is disabled`);
      }
    }
  }
  return enabledExtensions;
}
function extensionIsEnabled(logService, extensionEnablementService, extension, ignoreWorkspaceTrust) {
  return filterEnabledExtensions(logService, extensionEnablementService, [extension], ignoreWorkspaceTrust).includes(extension);
}
function includes(extensions, identifier) {
  for (const extension of extensions) {
    if (ExtensionIdentifier.equals(extension.identifier, identifier)) {
      return true;
    }
  }
  return false;
}
class ExtensionStatus {
  constructor(id) {
    this.id = id;
    this._messages = [];
    this._activationTimes = null;
    this._runtimeErrors = [];
    this._activationStarted = false;
  }
  get messages() {
    return this._messages;
  }
  get activationTimes() {
    return this._activationTimes;
  }
  get runtimeErrors() {
    return this._runtimeErrors;
  }
  get activationStarted() {
    return this._activationStarted;
  }
  clearRuntimeStatus() {
    this._activationStarted = false;
    this._activationTimes = null;
    this._runtimeErrors = [];
  }
  addMessage(msg) {
    this._messages.push(msg);
  }
  setActivationTimes(activationTimes) {
    this._activationTimes = activationTimes;
  }
  addRuntimeError(err) {
    this._runtimeErrors.push(err);
  }
  onWillActivate() {
    this._activationStarted = true;
  }
}
const _ExtensionHostCrashTracker = class _ExtensionHostCrashTracker {
  constructor() {
    this._recentCrashes = [];
  }
  _removeOldCrashes() {
    const limit = Date.now() - _ExtensionHostCrashTracker._TIME_LIMIT;
    while (this._recentCrashes.length > 0 && this._recentCrashes[0].timestamp < limit) {
      this._recentCrashes.shift();
    }
  }
  registerCrash() {
    this._removeOldCrashes();
    this._recentCrashes.push({ timestamp: Date.now() });
  }
  shouldAutomaticallyRestart() {
    this._removeOldCrashes();
    return this._recentCrashes.length < _ExtensionHostCrashTracker._CRASH_LIMIT;
  }
};
_ExtensionHostCrashTracker._TIME_LIMIT = 5 * 60 * 1e3;
// 5 minutes
_ExtensionHostCrashTracker._CRASH_LIMIT = 3;
let ExtensionHostCrashTracker = _ExtensionHostCrashTracker;
class ImplicitActivationAwareReader {
  readActivationEvents(extensionDescription) {
    return ImplicitActivationEvents.readActivationEvents(extensionDescription);
  }
}
class ActivationFeatureMarkdowneRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "markdown";
  }
  shouldRender(manifest) {
    return !!manifest.activationEvents;
  }
  render(manifest) {
    const activationEvents = manifest.activationEvents || [];
    const data = new MarkdownString();
    if (activationEvents.length) {
      for (const activationEvent of activationEvents) {
        data.appendMarkdown(`- \`${activationEvent}\`
`);
      }
    }
    return {
      data,
      dispose: () => {
      }
    };
  }
}
Registry.as(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "activationEvents",
  label: nls.localize("activation", "Activation Events"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ActivationFeatureMarkdowneRenderer)
});
export {
  AbstractExtensionService,
  ExtensionHostCrashTracker,
  ExtensionStatus,
  ImplicitActivationAwareReader,
  LocalExtensions,
  RemoteExtensions,
  ResolverExtensions,
  checkEnabledAndProposedAPI,
  extensionIsEnabled,
  filterEnabledExtensions,
  isResolverExtension
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9hYnN0cmFjdEV4dGVuc2lvblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBCYXJyaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICogYXMgcGVyZiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBpc0NJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgaXNFcXVhbE9yUGFyZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJbnN0YWxsT3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJbXBsaWNpdEFjdGl2YXRpb25FdmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9pbXBsaWNpdEFjdGl2YXRpb25FdmVudHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgRXh0ZW5zaW9uSWRlbnRpZmllck1hcCwgSUV4dGVuc2lvbiwgSUV4dGVuc2lvbkNvbnRyaWJ1dGlvbnMsIElFeHRlbnNpb25EZXNjcmlwdGlvbiwgSUV4dGVuc2lvbk1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGhhbmRsZVZldG9zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLCBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yLCBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yQ29kZSwgUmVzb2x2ZXJSZXN1bHQsIGdldFJlbW90ZUF1dGhvcml0eVByZWZpeCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXIuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBFeHRlbnNpb25GZWF0dXJlc0V4dGVuc2lvbnMsIElFeHRlbnNpb25GZWF0dXJlTWFya2Rvd25SZW5kZXJlciwgSVJlbmRlcmVkRGF0YSwgfSBmcm9tICcuLi8uLi9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeUxvY2ssIEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnlTbmFwc2hvdCwgSUFjdGl2YXRpb25FdmVudHNSZWFkZXIsIExvY2thYmxlRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeSB9IGZyb20gJy4vZXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBwYXJzZUV4dGVuc2lvbkRldk9wdGlvbnMgfSBmcm9tICcuL2V4dGVuc2lvbkRldk9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdEtpbmQsIEV4dGVuc2lvblJ1bm5pbmdQcmVmZXJlbmNlLCBJRXh0ZW5zaW9uSG9zdEtpbmRQaWNrZXIgfSBmcm9tICcuL2V4dGVuc2lvbkhvc3RLaW5kLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RNYW5hZ2VyIH0gZnJvbSAnLi9leHRlbnNpb25Ib3N0TWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uSG9zdE1hbmFnZXIgfSBmcm9tICcuL2V4dGVuc2lvbkhvc3RNYW5hZ2Vycy5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZUF1dGhvcml0eUVycm9yUmVzdWx0IH0gZnJvbSAnLi9leHRlbnNpb25Ib3N0UHJveHkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuL2V4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uLCBMb2NhbFByb2Nlc3NSdW5uaW5nTG9jYXRpb24sIExvY2FsV2ViV29ya2VyUnVubmluZ0xvY2F0aW9uLCBSZW1vdGVSdW5uaW5nTG9jYXRpb24gfSBmcm9tICcuL2V4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb25UcmFja2VyLCBmaWx0ZXJFeHRlbnNpb25JZGVudGlmaWVycyB9IGZyb20gJy4vZXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlci5qcyc7XG5pbXBvcnQgeyBBY3RpdmF0aW9uS2luZCwgQWN0aXZhdGlvblRpbWVzLCBFeHRlbnNpb25BY3RpdmF0aW9uUmVhc29uLCBFeHRlbnNpb25Ib3N0U3RhcnR1cCwgRXh0ZW5zaW9uUG9pbnRDb250cmlidXRpb24sIElFeHRlbnNpb25Ib3N0LCBJRXh0ZW5zaW9uSW5zcGVjdEluZm8sIElFeHRlbnNpb25TZXJ2aWNlLCBJRXh0ZW5zaW9uc1N0YXR1cywgSUludGVybmFsRXh0ZW5zaW9uU2VydmljZSwgSU1lc3NhZ2UsIElQcm9wb3NlZEFwaVVzYWdlLCBJUmVzcG9uc2l2ZVN0YXRlQ2hhbmdlRXZlbnQsIElXaWxsQWN0aXZhdGVFdmVudCwgc2V0UHJvcG9zZWRBcGlVc2FnZVJlcG9ydGVyLCBXaWxsU3RvcEV4dGVuc2lvbkhvc3RzRXZlbnQsIHRvRXh0ZW5zaW9uLCB0b0V4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNQcm9wb3NlZEFwaSB9IGZyb20gJy4vZXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IsIEV4dGVuc2lvblBvaW50LCBFeHRlbnNpb25zUmVnaXN0cnksIElFeHRlbnNpb25Qb2ludCwgSUV4dGVuc2lvblBvaW50VXNlciB9IGZyb20gJy4vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExhenlDcmVhdGVFeHRlbnNpb25Ib3N0TWFuYWdlciB9IGZyb20gJy4vbGF6eUNyZWF0ZUV4dGVuc2lvbkhvc3RNYW5hZ2VyLmpzJztcbmltcG9ydCB7IFJlc3BvbnNpdmVTdGF0ZSB9IGZyb20gJy4vcnBjUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkFjdGl2YXRpb25Ib3N0IGFzIElXb3Jrc3BhY2VDb250YWluc0FjdGl2YXRpb25Ib3N0LCBjaGVja0FjdGl2YXRlV29ya3NwYWNlQ29udGFpbnNFeHRlbnNpb24sIGNoZWNrR2xvYkZpbGVFeGlzdHMgfSBmcm9tICcuL3dvcmtzcGFjZUNvbnRhaW5zLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBXaWxsU2h1dGRvd25Kb2luZXJPcmRlciB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25Ib3N0RXhpdEluZm8sIElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5cbmNvbnN0IGhhc093blByb3BlcnR5ID0gT2JqZWN0Lmhhc093blByb3BlcnR5O1xuY29uc3QgTk9fT1BfVk9JRF9QUk9NSVNFID0gUHJvbWlzZS5yZXNvbHZlPHZvaWQ+KHVuZGVmaW5lZCk7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdEV4dGVuc2lvblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvblNlcnZpY2Uge1xuXG5cdHB1YmxpYyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaGFzTG9jYWxQcm9jZXNzOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hbGxvd1JlbW90ZUV4dGVuc2lvbnNJbkxvY2FsV2ViV29ya2VyOiBib29sZWFuO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVnaXN0ZXJFeHRlbnNpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFJlZ2lzdGVyRXh0ZW5zaW9ucyA9IHRoaXMuX29uRGlkUmVnaXN0ZXJFeHRlbnNpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRXh0ZW5zaW9uc1N0YXR1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEV4dGVuc2lvbklkZW50aWZpZXJbXT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUV4dGVuc2lvbnNTdGF0dXMgPSB0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnNTdGF0dXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VFeHRlbnNpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSBhZGRlZDogUmVhZG9ubHlBcnJheTxJRXh0ZW5zaW9uRGVzY3JpcHRpb24+OyByZWFkb25seSByZW1vdmVkOiBSZWFkb25seUFycmF5PElFeHRlbnNpb25EZXNjcmlwdGlvbj4gfT4oeyBsZWFrV2FybmluZ1RocmVzaG9sZDogNDAwLCBsZWFrV2FybmluZ05hbWU6ICdFeHRlbnNpb25TZXJ2aWNlLl9vbkRpZENoYW5nZUV4dGVuc2lvbnMnIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRXh0ZW5zaW9ucyA9IHRoaXMuX29uRGlkQ2hhbmdlRXh0ZW5zaW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxBY3RpdmF0ZUJ5RXZlbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJV2lsbEFjdGl2YXRlRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25XaWxsQWN0aXZhdGVCeUV2ZW50ID0gdGhpcy5fb25XaWxsQWN0aXZhdGVCeUV2ZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUmVzcG9uc2l2ZUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElSZXNwb25zaXZlU3RhdGVDaGFuZ2VFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVJlc3BvbnNpdmVDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZVJlc3BvbnNpdmVDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsU3RvcCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFdpbGxTdG9wRXh0ZW5zaW9uSG9zdHNFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbldpbGxTdG9wID0gdGhpcy5fb25XaWxsU3RvcC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmF0aW9uRXZlbnRSZWFkZXIgPSBuZXcgSW1wbGljaXRBY3RpdmF0aW9uQXdhcmVSZWFkZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0cnkgPSBuZXcgTG9ja2FibGVFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5KHRoaXMuX2FjdGl2YXRpb25FdmVudFJlYWRlcik7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbGxlZEV4dGVuc2lvbnNSZWFkeSA9IG5ldyBCYXJyaWVyKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblN0YXR1cyA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPEV4dGVuc2lvblN0YXR1cz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWxsUmVxdWVzdGVkQWN0aXZhdGVFdmVudHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1JlbW90ZUFjdGl2YXRpb25FdmVudHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcnVubmluZ0xvY2F0aW9uczogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQ3Jhc2hUcmFja2VyID0gbmV3IEV4dGVuc2lvbkhvc3RDcmFzaFRyYWNrZXIoKTtcblxuXHRwcml2YXRlIF9kZWx0YUV4dGVuc2lvbnNRdWV1ZTogRGVsdGFFeHRlbnNpb25zUXVldWVJdGVtW10gPSBbXTtcblx0cHJpdmF0ZSBfaW5IYW5kbGVEZWx0YUV4dGVuc2lvbnMgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25Ib3N0TWFuYWdlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRXh0ZW5zaW9uSG9zdENvbGxlY3Rpb24oKSk7XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUF1dGhvcml0eUF0dGVtcHQ6IG51bWJlciA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogeyBoYXNMb2NhbFByb2Nlc3M6IGJvb2xlYW47IGFsbG93UmVtb3RlRXh0ZW5zaW9uc0luTG9jYWxXZWJXb3JrZXI6IGJvb2xlYW4gfSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25zUHJvcG9zZWRBcGk6IEV4dGVuc2lvbnNQcm9wb3NlZEFwaSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25Ib3N0RmFjdG9yeTogSUV4dGVuc2lvbkhvc3RGYWN0b3J5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbkhvc3RLaW5kUGlja2VyOiBJRXh0ZW5zaW9uSG9zdEtpbmRQaWNrZXIsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2V4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3JlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3JlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZTogSVJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2U6IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9oYXNMb2NhbFByb2Nlc3MgPSBvcHRpb25zLmhhc0xvY2FsUHJvY2Vzcztcblx0XHR0aGlzLl9hbGxvd1JlbW90ZUV4dGVuc2lvbnNJbkxvY2FsV2ViV29ya2VyID0gb3B0aW9ucy5hbGxvd1JlbW90ZUV4dGVuc2lvbnNJbkxvY2FsV2ViV29ya2VyO1xuXG5cdFx0Ly8gaGVscCB0aGUgZmlsZSBzZXJ2aWNlIHRvIGFjdGl2YXRlIHByb3ZpZGVycyBieSBhY3RpdmF0aW5nIGV4dGVuc2lvbnMgYnkgZmlsZSBzeXN0ZW0gZXZlbnRcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maWxlU2VydmljZS5vbldpbGxBY3RpdmF0ZUZpbGVTeXN0ZW1Qcm92aWRlcihlID0+IHtcblx0XHRcdGlmIChlLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVSZW1vdGUpIHtcblx0XHRcdFx0ZS5qb2luKHRoaXMuYWN0aXZhdGVCeUV2ZW50KGBvbkZpbGVTeXN0ZW06JHtlLnNjaGVtZX1gKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gcmVwb3J0IHRlbGVtZXRyeSB3aGVuIGFuIGV4dGVuc2lvbiBhdHRlbXB0cyB0byB1c2UgYSBwcm9wb3NlZCBBUEkgaXQgaXMgbm90IGVudGl0bGVkIHRvIHVzZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHNldFByb3Bvc2VkQXBpVXNhZ2VSZXBvcnRlcih1c2FnZSA9PiB0aGlzLl9yZXBvcnRQcm9wb3NlZEFwaVVzYWdlKHVzYWdlKSkpO1xuXG5cdFx0dGhpcy5fcnVubmluZ0xvY2F0aW9ucyA9IG5ldyBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb25UcmFja2VyKFxuXHRcdFx0dGhpcy5fcmVnaXN0cnksXG5cdFx0XHR0aGlzLl9leHRlbnNpb25Ib3N0S2luZFBpY2tlcixcblx0XHRcdHRoaXMuX2Vudmlyb25tZW50U2VydmljZSxcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0dGhpcy5fbG9nU2VydmljZSxcblx0XHRcdHRoaXMuX2V4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2Vcblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2Uub25FbmFibGVtZW50Q2hhbmdlZCgoZXh0ZW5zaW9ucykgPT4ge1xuXHRcdFx0Y29uc3QgdG9BZGQ6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgdG9SZW1vdmU6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRpZiAodGhpcy5fc2FmZUludm9rZUlzRW5hYmxlZChleHRlbnNpb24pKSB7XG5cdFx0XHRcdFx0Ly8gYW4gZXh0ZW5zaW9uIGhhcyBiZWVuIGVuYWJsZWRcblx0XHRcdFx0XHR0b0FkZC5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gYW4gZXh0ZW5zaW9uIGhhcyBiZWVuIGRpc2FibGVkXG5cdFx0XHRcdFx0dG9SZW1vdmUucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEFic3RyYWN0RXh0ZW5zaW9uU2VydmljZS5vbkVuYWJsZW1lbnRDaGFuZ2VkIGZpcmVkIGZvciAke2V4dGVuc2lvbnMubWFwKGUgPT4gZS5pZGVudGlmaWVyLmlkKS5qb2luKCcsICcpfWApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faGFuZGxlRGVsdGFFeHRlbnNpb25zKG5ldyBEZWx0YUV4dGVuc2lvbnNRdWV1ZUl0ZW0odG9BZGQsIHRvUmVtb3ZlKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VQcm9maWxlKCh7IGFkZGVkLCByZW1vdmVkIH0pID0+IHtcblx0XHRcdGlmIChhZGRlZC5sZW5ndGggfHwgcmVtb3ZlZC5sZW5ndGgpIHtcblx0XHRcdFx0aWYgKGlzQ0kpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEFic3RyYWN0RXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZVByb2ZpbGUgZmlyZWRgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9oYW5kbGVEZWx0YUV4dGVuc2lvbnMobmV3IERlbHRhRXh0ZW5zaW9uc1F1ZXVlSXRlbShhZGRlZCwgcmVtb3ZlZCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkRW5hYmxlRXh0ZW5zaW9ucyhleHRlbnNpb25zID0+IHtcblx0XHRcdGlmIChleHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgQWJzdHJhY3RFeHRlbnNpb25TZXJ2aWNlLm9uRGlkRW5hYmxlRXh0ZW5zaW9ucyBmaXJlZGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2hhbmRsZURlbHRhRXh0ZW5zaW9ucyhuZXcgRGVsdGFFeHRlbnNpb25zUXVldWVJdGVtKGV4dGVuc2lvbnMsIFtdKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRJbnN0YWxsRXh0ZW5zaW9ucygocmVzdWx0KSA9PiB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdGNvbnN0IHRvUmVtb3ZlOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCB7IGxvY2FsLCBvcGVyYXRpb24gfSBvZiByZXN1bHQpIHtcblx0XHRcdFx0aWYgKGxvY2FsICYmIGxvY2FsLmlzVmFsaWQgJiYgb3BlcmF0aW9uICE9PSBJbnN0YWxsT3BlcmF0aW9uLk1pZ3JhdGUgJiYgdGhpcy5fc2FmZUludm9rZUlzRW5hYmxlZChsb2NhbCkpIHtcblx0XHRcdFx0XHRleHRlbnNpb25zLnB1c2gobG9jYWwpO1xuXHRcdFx0XHRcdGlmIChvcGVyYXRpb24gPT09IEluc3RhbGxPcGVyYXRpb24uVXBkYXRlKSB7XG5cdFx0XHRcdFx0XHR0b1JlbW92ZS5wdXNoKGxvY2FsLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGlmIChpc0NJKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBBYnN0cmFjdEV4dGVuc2lvblNlcnZpY2Uub25EaWRJbnN0YWxsRXh0ZW5zaW9ucyBmaXJlZCBmb3IgJHtleHRlbnNpb25zLm1hcChlID0+IGUuaWRlbnRpZmllci5pZCkuam9pbignLCAnKX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9oYW5kbGVEZWx0YUV4dGVuc2lvbnMobmV3IERlbHRhRXh0ZW5zaW9uc1F1ZXVlSXRlbShleHRlbnNpb25zLCB0b1JlbW92ZSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uKChldmVudCkgPT4ge1xuXHRcdFx0aWYgKCFldmVudC5lcnJvcikge1xuXHRcdFx0XHQvLyBhbiBleHRlbnNpb24gaGFzIGJlZW4gdW5pbnN0YWxsZWRcblx0XHRcdFx0aWYgKGlzQ0kpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEFic3RyYWN0RXh0ZW5zaW9uU2VydmljZS5vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbiBmaXJlZCBmb3IgJHtldmVudC5pZGVudGlmaWVyLmlkfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2hhbmRsZURlbHRhRXh0ZW5zaW9ucyhuZXcgRGVsdGFFeHRlbnNpb25zUXVldWVJdGVtKFtdLCBbZXZlbnQuaWRlbnRpZmllci5pZF0pKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKGV2ZW50ID0+IHtcblx0XHRcdGlmICh0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpKSB7XG5cdFx0XHRcdGV2ZW50LmpvaW4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdC8vIFdlIG5lZWQgdG8gZGlzY29ubmVjdCB0aGUgbWFuYWdlbWVudCBjb25uZWN0aW9uIGJlZm9yZSBraWxsaW5nIHRoZSBsb2NhbCBleHRlbnNpb24gaG9zdC5cblx0XHRcdFx0XHQvLyBPdGhlcndpc2UsIHRoZSBsb2NhbCBleHRlbnNpb24gaG9zdCBtaWdodCB0ZXJtaW5hdGUgdGhlIHVuZGVybHlpbmcgdHVubmVsIGJlZm9yZSB0aGVcblx0XHRcdFx0XHQvLyBtYW5hZ2VtZW50IGNvbm5lY3Rpb24gaGFzIGEgY2hhbmNlIHRvIHNlbmQgaXRzIGRpc2Nvbm5lY3Rpb24gbWVzc2FnZS5cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmVuZENvbm5lY3Rpb24oKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2RvU3RvcEV4dGVuc2lvbkhvc3RzKCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ0Vycm9yIHdoaWxlIGRpc2Nvbm5lY3RpbmcgcmVtb3RlIGFnZW50Jyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0aWQ6ICdqb2luLmRpc2Nvbm5lY3RSZW1vdGUnLFxuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2Rpc2Nvbm5lY3RSZW1vdGUnLCBcIkRpc2Nvbm5lY3QgUmVtb3RlIEFnZW50XCIpLFxuXHRcdFx0XHRcdG9yZGVyOiBXaWxsU2h1dGRvd25Kb2luZXJPcmRlci5MYXN0IC8vIGFmdGVyIG90aGVycyBoYXZlIGpvaW5lZCB0aGF0IG1pZ2h0IGRlcGVuZCBvbiBhIHJlbW90ZSBjb25uZWN0aW9uXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXZlbnQuam9pbih0aGlzLl9kb1N0b3BFeHRlbnNpb25Ib3N0cygpLCB7XG5cdFx0XHRcdFx0aWQ6ICdqb2luLnN0b3BFeHRlbnNpb25Ib3N0cycsXG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnc3RvcEV4dGVuc2lvbkhvc3RzJywgXCJTdG9wcGluZyBFeHRlbnNpb24gSG9zdHNcIiksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0RXh0ZW5zaW9uSG9zdE1hbmFnZXJzKGtpbmQ6IEV4dGVuc2lvbkhvc3RLaW5kKTogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyW10ge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMuZ2V0QnlLaW5kKGtpbmQpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIGRlbHRhRXh0ZW5zaW9uc1xuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZURlbHRhRXh0ZW5zaW9ucyhpdGVtOiBEZWx0YUV4dGVuc2lvbnNRdWV1ZUl0ZW0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9kZWx0YUV4dGVuc2lvbnNRdWV1ZS5wdXNoKGl0ZW0pO1xuXHRcdGlmICh0aGlzLl9pbkhhbmRsZURlbHRhRXh0ZW5zaW9ucykge1xuXHRcdFx0Ly8gTGV0IHRoZSBjdXJyZW50IGl0ZW0gZmluaXNoLCB0aGUgbmV3IG9uZSB3aWxsIGJlIHBpY2tlZCB1cFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBsb2NrOiBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5TG9jayB8IG51bGwgPSBudWxsO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9pbkhhbmRsZURlbHRhRXh0ZW5zaW9ucyA9IHRydWU7XG5cblx0XHRcdC8vIHdhaXQgZm9yIF9pbml0aWFsaXplIHRvIGZpbmlzaCBiZWZvcmUgaGFubGRpbmcgYW55IGRlbHRhIGV4dGVuc2lvbiBldmVudHNcblx0XHRcdGF3YWl0IHRoaXMuX2luc3RhbGxlZEV4dGVuc2lvbnNSZWFkeS53YWl0KCk7XG5cblx0XHRcdGxvY2sgPSBhd2FpdCB0aGlzLl9yZWdpc3RyeS5hY3F1aXJlTG9jaygnaGFuZGxlRGVsdGFFeHRlbnNpb25zJyk7XG5cdFx0XHR3aGlsZSAodGhpcy5fZGVsdGFFeHRlbnNpb25zUXVldWUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gdGhpcy5fZGVsdGFFeHRlbnNpb25zUXVldWUuc2hpZnQoKSE7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2RlbHRhRXh0ZW5zaW9ucyhsb2NrLCBpdGVtLnRvQWRkLCBpdGVtLnRvUmVtb3ZlKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faW5IYW5kbGVEZWx0YUV4dGVuc2lvbnMgPSBmYWxzZTtcblx0XHRcdGxvY2s/LmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kZWx0YUV4dGVuc2lvbnMobG9jazogRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeUxvY2ssIF90b0FkZDogSUV4dGVuc2lvbltdLCBfdG9SZW1vdmU6IHN0cmluZ1tdIHwgSUV4dGVuc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGlzQ0kpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgQWJzdHJhY3RFeHRlbnNpb25TZXJ2aWNlLl9kZWx0YUV4dGVuc2lvbnM6IHRvQWRkOiBbJHtfdG9BZGQubWFwKGUgPT4gZS5pZGVudGlmaWVyLmlkKS5qb2luKCcsJyl9XSB0b1JlbW92ZTogWyR7X3RvUmVtb3ZlLm1hcChlID0+IHR5cGVvZiBlID09PSAnc3RyaW5nJyA/IGUgOiBlLmlkZW50aWZpZXIuaWQpLmpvaW4oJywnKX1dYCk7XG5cdFx0fVxuXHRcdGxldCB0b1JlbW92ZTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gX3RvUmVtb3ZlLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25PcklkID0gX3RvUmVtb3ZlW2ldO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSAodHlwZW9mIGV4dGVuc2lvbk9ySWQgPT09ICdzdHJpbmcnID8gZXh0ZW5zaW9uT3JJZCA6IGV4dGVuc2lvbk9ySWQuaWRlbnRpZmllci5pZCk7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSAodHlwZW9mIGV4dGVuc2lvbk9ySWQgPT09ICdzdHJpbmcnID8gbnVsbCA6IGV4dGVuc2lvbk9ySWQpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uRGVzY3JpcHRpb24gPSB0aGlzLl9yZWdpc3RyeS5nZXRFeHRlbnNpb25EZXNjcmlwdGlvbihleHRlbnNpb25JZCk7XG5cdFx0XHRpZiAoIWV4dGVuc2lvbkRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdC8vIGlnbm9yZSBkaXNhYmxpbmcvdW5pbnN0YWxsaW5nIGFuIGV4dGVuc2lvbiB3aGljaCBpcyBub3QgcnVubmluZ1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGV4dGVuc2lvbiAmJiBleHRlbnNpb25EZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbi5zY2hlbWUgIT09IGV4dGVuc2lvbi5sb2NhdGlvbi5zY2hlbWUpIHtcblx0XHRcdFx0Ly8gdGhpcyBldmVudCBpcyBmb3IgYSBkaWZmZXJlbnQgZXh0ZW5zaW9uIHRoYW4gbWluZSAobWF5YmUgZm9yIHRoZSBsb2NhbCBleHRlbnNpb24sIHdoaWxlIEkgaGF2ZSB0aGUgcmVtb3RlIGV4dGVuc2lvbilcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5jYW5SZW1vdmVFeHRlbnNpb24oZXh0ZW5zaW9uRGVzY3JpcHRpb24pKSB7XG5cdFx0XHRcdC8vIHVzZXMgbm9uLWR5bmFtaWMgZXh0ZW5zaW9uIHBvaW50IG9yIGlzIGFjdGl2YXRlZFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0dG9SZW1vdmUucHVzaChleHRlbnNpb25EZXNjcmlwdGlvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9BZGQ6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IF90b0FkZC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gX3RvQWRkW2ldO1xuXG5cdFx0XHRjb25zdCBleHRlbnNpb25EZXNjcmlwdGlvbiA9IHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24oZXh0ZW5zaW9uLCBmYWxzZSk7XG5cdFx0XHRpZiAoIWV4dGVuc2lvbkRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdC8vIGNvdWxkIG5vdCBzY2FuIGV4dGVuc2lvbi4uLlxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl9jYW5BZGRFeHRlbnNpb24oZXh0ZW5zaW9uRGVzY3JpcHRpb24sIHRvUmVtb3ZlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0dG9BZGQucHVzaChleHRlbnNpb25EZXNjcmlwdGlvbik7XG5cdFx0fVxuXG5cdFx0aWYgKHRvQWRkLmxlbmd0aCA9PT0gMCAmJiB0b1JlbW92ZS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdGhlIGxvY2FsIHJlZ2lzdHJ5XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fcmVnaXN0cnkuZGVsdGFFeHRlbnNpb25zKGxvY2ssIHRvQWRkLCB0b1JlbW92ZS5tYXAoZSA9PiBlLmlkZW50aWZpZXIpKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnMuZmlyZSh7IGFkZGVkOiB0b0FkZCwgcmVtb3ZlZDogdG9SZW1vdmUgfSk7XG5cblx0XHR0b1JlbW92ZSA9IHRvUmVtb3ZlLmNvbmNhdChyZXN1bHQucmVtb3ZlZER1ZVRvTG9vcGluZyk7XG5cdFx0aWYgKHJlc3VsdC5yZW1vdmVkRHVlVG9Mb29waW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2xvb3BpbmcnLCBcIlRoZSBmb2xsb3dpbmcgZXh0ZW5zaW9ucyBjb250YWluIGRlcGVuZGVuY3kgbG9vcHMgYW5kIGhhdmUgYmVlbiBkaXNhYmxlZDogezB9XCIsIHJlc3VsdC5yZW1vdmVkRHVlVG9Mb29waW5nLm1hcChlID0+IGAnJHtlLmlkZW50aWZpZXIudmFsdWV9J2ApLmpvaW4oJywgJykpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBlbmFibGUgb3IgZGlzYWJsZSBwcm9wb3NlZCBBUEkgcGVyIGV4dGVuc2lvblxuXHRcdHRoaXMuX2V4dGVuc2lvbnNQcm9wb3NlZEFwaS51cGRhdGVFbmFibGVkQXBpUHJvcG9zYWxzKHRvQWRkKTtcblxuXHRcdC8vIFVwZGF0ZSBleHRlbnNpb24gcG9pbnRzXG5cdFx0dGhpcy5fZG9IYW5kbGVFeHRlbnNpb25Qb2ludHMoKDxJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXT5bXSkuY29uY2F0KHRvQWRkKS5jb25jYXQodG9SZW1vdmUpLCBmYWxzZSk7XG5cblx0XHQvLyBVcGRhdGUgdGhlIGV4dGVuc2lvbiBob3N0XG5cdFx0YXdhaXQgdGhpcy5fdXBkYXRlRXh0ZW5zaW9uc09uRXh0SG9zdHMocmVzdWx0LnZlcnNpb25JZCwgdG9BZGQsIHRvUmVtb3ZlLm1hcChlID0+IGUuaWRlbnRpZmllcikpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b0FkZC5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5fYWN0aXZhdGVBZGRlZEV4dGVuc2lvbklmTmVlZGVkKHRvQWRkW2ldKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVFeHRlbnNpb25zT25FeHRIb3N0cyh2ZXJzaW9uSWQ6IG51bWJlciwgdG9BZGQ6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCB0b1JlbW92ZTogRXh0ZW5zaW9uSWRlbnRpZmllcltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVtb3ZlZFJ1bm5pbmdMb2NhdGlvbiA9IHRoaXMuX3J1bm5pbmdMb2NhdGlvbnMuZGVsdGFFeHRlbnNpb25zKHRvQWRkLCB0b1JlbW92ZSk7XG5cdFx0Y29uc3QgcHJvbWlzZXMgPSB0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMubWFwKFxuXHRcdFx0ZXh0SG9zdE1hbmFnZXIgPT4gdGhpcy5fdXBkYXRlRXh0ZW5zaW9uc09uRXh0SG9zdChleHRIb3N0TWFuYWdlciwgdmVyc2lvbklkLCB0b0FkZCwgdG9SZW1vdmUsIHJlbW92ZWRSdW5uaW5nTG9jYXRpb24pXG5cdFx0KTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVFeHRlbnNpb25zT25FeHRIb3N0KGV4dGVuc2lvbkhvc3RNYW5hZ2VyOiBJRXh0ZW5zaW9uSG9zdE1hbmFnZXIsIHZlcnNpb25JZDogbnVtYmVyLCB0b0FkZDogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIHRvUmVtb3ZlOiBFeHRlbnNpb25JZGVudGlmaWVyW10sIHJlbW92ZWRSdW5uaW5nTG9jYXRpb246IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8RXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uIHwgbnVsbD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBteVRvQWRkID0gdGhpcy5fcnVubmluZ0xvY2F0aW9ucy5maWx0ZXJCeUV4dGVuc2lvbkhvc3RNYW5hZ2VyKHRvQWRkLCBleHRlbnNpb25Ib3N0TWFuYWdlcik7XG5cdFx0Y29uc3QgbXlUb1JlbW92ZSA9IGZpbHRlckV4dGVuc2lvbklkZW50aWZpZXJzKHRvUmVtb3ZlLCByZW1vdmVkUnVubmluZ0xvY2F0aW9uLCBleHRSdW5uaW5nTG9jYXRpb24gPT4gZXh0ZW5zaW9uSG9zdE1hbmFnZXIucmVwcmVzZW50c1J1bm5pbmdMb2NhdGlvbihleHRSdW5uaW5nTG9jYXRpb24pKTtcblx0XHRjb25zdCBhZGRBY3RpdmF0aW9uRXZlbnRzID0gSW1wbGljaXRBY3RpdmF0aW9uRXZlbnRzLmNyZWF0ZUFjdGl2YXRpb25FdmVudHNNYXAodG9BZGQpO1xuXHRcdGlmIChpc0NJKSB7XG5cdFx0XHRjb25zdCBwcmludEV4dElkcyA9IChleHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSkgPT4gZXh0ZW5zaW9ucy5tYXAoZSA9PiBlLmlkZW50aWZpZXIudmFsdWUpLmpvaW4oJywnKTtcblx0XHRcdGNvbnN0IHByaW50SWRzID0gKGV4dGVuc2lvbnM6IEV4dGVuc2lvbklkZW50aWZpZXJbXSkgPT4gZXh0ZW5zaW9ucy5tYXAoZSA9PiBlLnZhbHVlKS5qb2luKCcsJyk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEFic3RyYWN0RXh0ZW5zaW9uU2VydmljZTogQ2FsbGluZyBkZWx0YUV4dGVuc2lvbnM6IHRvUmVtb3ZlOiBbJHtwcmludElkcyh0b1JlbW92ZSl9XSwgdG9BZGQ6IFske3ByaW50RXh0SWRzKHRvQWRkKX1dLCBteVRvUmVtb3ZlOiBbJHtwcmludElkcyhteVRvUmVtb3ZlKX1dLCBteVRvQWRkOiBbJHtwcmludEV4dElkcyhteVRvQWRkKX1dLGApO1xuXHRcdH1cblx0XHRhd2FpdCBleHRlbnNpb25Ib3N0TWFuYWdlci5kZWx0YUV4dGVuc2lvbnMoeyB2ZXJzaW9uSWQsIHRvUmVtb3ZlLCB0b0FkZCwgYWRkQWN0aXZhdGlvbkV2ZW50cywgbXlUb1JlbW92ZSwgbXlUb0FkZDogbXlUb0FkZC5tYXAoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5pZGVudGlmaWVyKSB9KTtcblx0fVxuXG5cdHB1YmxpYyBjYW5BZGRFeHRlbnNpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FuQWRkRXh0ZW5zaW9uKGV4dGVuc2lvbiwgW10pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuQWRkRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBleHRlbnNpb25zQmVpbmdSZW1vdmVkOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSk6IGJvb2xlYW4ge1xuXHRcdC8vIChBbHNvIGNoZWNrIGZvciByZW5hbWVkIGV4dGVuc2lvbnMpXG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9yZWdpc3RyeS5nZXRFeHRlbnNpb25EZXNjcmlwdGlvbkJ5SWRPclVVSUQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHQvLyBUaGlzIGV4dGVuc2lvbiBpcyBhbHJlYWR5IGtub3duIChtb3N0IGxpa2VseSBhdCBhIGRpZmZlcmVudCB2ZXJzaW9uKVxuXHRcdFx0Ly8gc28gaXQgY2Fubm90IGJlIGFkZGVkIGFnYWluIHVubGVzcyBpdCBpcyByZW1vdmVkIGZpcnN0XG5cdFx0XHRjb25zdCBpc0JlaW5nUmVtb3ZlZCA9IGV4dGVuc2lvbnNCZWluZ1JlbW92ZWQuc29tZSgoZXh0ZW5zaW9uRGVzY3JpcHRpb24pID0+IEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyKSk7XG5cdFx0XHRpZiAoIWlzQmVpbmdSZW1vdmVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25LaW5kcyA9IHRoaXMuX3J1bm5pbmdMb2NhdGlvbnMucmVhZEV4dGVuc2lvbktpbmRzKGV4dGVuc2lvbik7XG5cdFx0Y29uc3QgaXNSZW1vdGUgPSBleHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24uc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZTtcblx0XHRjb25zdCBleHRlbnNpb25Ib3N0S2luZCA9IHRoaXMuX2V4dGVuc2lvbkhvc3RLaW5kUGlja2VyLnBpY2tFeHRlbnNpb25Ib3N0S2luZChleHRlbnNpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uS2luZHMsICFpc1JlbW90ZSwgaXNSZW1vdGUsIEV4dGVuc2lvblJ1bm5pbmdQcmVmZXJlbmNlLk5vbmUpO1xuXHRcdGlmIChleHRlbnNpb25Ib3N0S2luZCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIGNhblJlbW92ZUV4dGVuc2lvbihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbkRlc2NyaXB0aW9uID0gdGhpcy5fcmVnaXN0cnkuZ2V0RXh0ZW5zaW9uRGVzY3JpcHRpb24oZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdGlmICghZXh0ZW5zaW9uRGVzY3JpcHRpb24pIHtcblx0XHRcdC8vIENhbid0IHJlbW92ZSBhbiBleHRlbnNpb24gdGhhdCBpcyB1bmtub3duIVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9leHRlbnNpb25TdGF0dXMuZ2V0KGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIpPy5hY3RpdmF0aW9uU3RhcnRlZCkge1xuXHRcdFx0Ly8gRXh0ZW5zaW9uIGlzIHJ1bm5pbmcsIGNhbm5vdCByZW1vdmUgaXQgc2FmZWx5XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hY3RpdmF0ZUFkZGVkRXh0ZW5zaW9uSWZOZWVkZWQoZXh0ZW5zaW9uRGVzY3JpcHRpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBzaG91bGRBY3RpdmF0ZVJlYXNvbjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IGhhc1dvcmtzcGFjZUNvbnRhaW5zID0gZmFsc2U7XG5cdFx0Y29uc3QgYWN0aXZhdGlvbkV2ZW50cyA9IHRoaXMuX2FjdGl2YXRpb25FdmVudFJlYWRlci5yZWFkQWN0aXZhdGlvbkV2ZW50cyhleHRlbnNpb25EZXNjcmlwdGlvbik7XG5cdFx0Zm9yIChjb25zdCBhY3RpdmF0aW9uRXZlbnQgb2YgYWN0aXZhdGlvbkV2ZW50cykge1xuXHRcdFx0aWYgKHRoaXMuX2FsbFJlcXVlc3RlZEFjdGl2YXRlRXZlbnRzLmhhcyhhY3RpdmF0aW9uRXZlbnQpKSB7XG5cdFx0XHRcdC8vIFRoaXMgYWN0aXZhdGlvbiBldmVudCB3YXMgZmlyZWQgYmVmb3JlIHRoZSBleHRlbnNpb24gd2FzIGFkZGVkXG5cdFx0XHRcdHNob3VsZEFjdGl2YXRlUmVhc29uID0gYWN0aXZhdGlvbkV2ZW50O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFjdGl2YXRpb25FdmVudCA9PT0gJyonKSB7XG5cdFx0XHRcdHNob3VsZEFjdGl2YXRlUmVhc29uID0gYWN0aXZhdGlvbkV2ZW50O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0aWYgKC9ed29ya3NwYWNlQ29udGFpbnMvLnRlc3QoYWN0aXZhdGlvbkV2ZW50KSkge1xuXHRcdFx0XHRoYXNXb3Jrc3BhY2VDb250YWlucyA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhY3RpdmF0aW9uRXZlbnQgPT09ICdvblN0YXJ0dXBGaW5pc2hlZCcpIHtcblx0XHRcdFx0c2hvdWxkQWN0aXZhdGVSZWFzb24gPSBhY3RpdmF0aW9uRXZlbnQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghc2hvdWxkQWN0aXZhdGVSZWFzb24gJiYgaGFzV29ya3NwYWNlQ29udGFpbnMpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldENvbXBsZXRlV29ya3NwYWNlKCk7XG5cdFx0XHRjb25zdCBmb3JjZVVzaW5nU2VhcmNoID0gISF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHRcdFx0Y29uc3QgaG9zdDogSVdvcmtzcGFjZUNvbnRhaW5zQWN0aXZhdGlvbkhvc3QgPSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2U6IHRoaXMuX2xvZ1NlcnZpY2UsXG5cdFx0XHRcdGZvbGRlcnM6IHdvcmtzcGFjZS5mb2xkZXJzLm1hcChmb2xkZXIgPT4gZm9sZGVyLnVyaSksXG5cdFx0XHRcdGZvcmNlVXNpbmdTZWFyY2g6IGZvcmNlVXNpbmdTZWFyY2gsXG5cdFx0XHRcdGV4aXN0czogKHVyaSkgPT4gdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHVyaSksXG5cdFx0XHRcdGNoZWNrRXhpc3RzOiAoZm9sZGVycywgaW5jbHVkZXMsIHRva2VuKSA9PiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbigoYWNjZXNzb3IpID0+IGNoZWNrR2xvYkZpbGVFeGlzdHMoYWNjZXNzb3IsIGZvbGRlcnMsIGluY2x1ZGVzLCB0b2tlbikpXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjaGVja0FjdGl2YXRlV29ya3NwYWNlQ29udGFpbnNFeHRlbnNpb24oaG9zdCwgZXh0ZW5zaW9uRGVzY3JpcHRpb24pO1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRzaG91bGRBY3RpdmF0ZVJlYXNvbiA9IHJlc3VsdC5hY3RpdmF0aW9uRXZlbnQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHNob3VsZEFjdGl2YXRlUmVhc29uKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChcblx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLm1hcChleHRIb3N0TWFuYWdlciA9PiBleHRIb3N0TWFuYWdlci5hY3RpdmF0ZShleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLCB7IHN0YXJ0dXA6IGZhbHNlLCBleHRlbnNpb25JZDogZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllciwgYWN0aXZhdGlvbkV2ZW50OiBzaG91bGRBY3RpdmF0ZVJlYXNvbiB9KSlcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSBfaW5pdGlhbGl6ZVByb21pc2U6IFByb21pc2U8dm9pZD4gfCBudWxsID0gbnVsbDtcblx0cHJvdGVjdGVkIF9pbml0aWFsaXplSWZOZWVkZWQoKTogUHJvbWlzZTx2b2lkPiB8IG51bGwge1xuXHRcdGlmICghdGhpcy5faW5pdGlhbGl6ZVByb21pc2UpIHtcblx0XHRcdHRoaXMuX2luaXRpYWxpemVQcm9taXNlID0gdGhpcy5faW5pdGlhbGl6ZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faW5pdGlhbGl6ZVByb21pc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX2luaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cGVyZi5tYXJrKCdjb2RlL3dpbGxMb2FkRXh0ZW5zaW9ucycpO1xuXHRcdHRoaXMuX3N0YXJ0RXh0ZW5zaW9uSG9zdHNJZk5lY2Vzc2FyeSh0cnVlLCBbXSk7XG5cblx0XHRjb25zdCBsb2NrID0gYXdhaXQgdGhpcy5fcmVnaXN0cnkuYWNxdWlyZUxvY2soJ19pbml0aWFsaXplJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3Jlc29sdmVBbmRQcm9jZXNzRXh0ZW5zaW9ucyhsb2NrKTtcblx0XHRcdC8vIFN0YXJ0IGV4dGVuc2lvbiBob3N0cyB3aGljaCBhcmUgbm90IGF1dG9tYXRpY2FsbHkgc3RhcnRlZFxuXHRcdFx0dGhpcy5fc3RhcnRPbkRlbWFuZEV4dGVuc2lvbkhvc3RzKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGxvY2suZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbGVhc2VCYXJyaWVyKCk7XG5cdFx0cGVyZi5tYXJrKCdjb2RlL2RpZExvYWRFeHRlbnNpb25zJyk7XG5cblx0XHQvLyBBY3RpdmF0ZSBkZWZlcnJlZCByZW1vdGUgZXZlbnRzIG5vdyB0aGF0IHJlbW90ZSBob3N0cyBhcmUgc3RhcnRpbmdcblx0XHQvLyBUaGlzIGlzIGRvbmUgYWZ0ZXIgdGhlIGJhcnJpZXIgaXMgcmVsZWFzZWQgdG8gYXZvaWQgYmxvY2tpbmcgaW5pdGlhbGl6YXRpb25cblx0XHR0aGlzLl9hY3RpdmF0ZURlZmVycmVkUmVtb3RlRXZlbnRzKCk7XG5cblx0XHRhd2FpdCB0aGlzLl9oYW5kbGVFeHRlbnNpb25UZXN0cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWN0aXZhdGVEZWZlcnJlZFJlbW90ZUV2ZW50cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ1JlbW90ZUFjdGl2YXRpb25FdmVudHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbkhvc3RzID0gdGhpcy5fZ2V0RXh0ZW5zaW9uSG9zdE1hbmFnZXJzKEV4dGVuc2lvbkhvc3RLaW5kLlJlbW90ZSk7XG5cdFx0aWYgKHJlbW90ZUV4dGVuc2lvbkhvc3RzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlbW90ZUFjdGl2YXRpb25FdmVudHMuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBXYWl0IGZvciByZW1vdGUgZXh0ZW5zaW9uIGhvc3RzIHRvIGJlIHJlYWR5XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocmVtb3RlRXh0ZW5zaW9uSG9zdHMubWFwKGV4dEhvc3QgPT4gZXh0SG9zdC5yZWFkeSgpKSk7XG5cblx0XHQvLyBSZXBsYXkgZGVmZXJyZWQgYWN0aXZhdGlvbiBldmVudHMgb24gcmVtb3RlIGhvc3RzXG5cdFx0Zm9yIChjb25zdCBhY3RpdmF0aW9uRXZlbnQgb2YgdGhpcy5fcGVuZGluZ1JlbW90ZUFjdGl2YXRpb25FdmVudHMpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IFByb21pc2UuYWxsKFxuXHRcdFx0XHRyZW1vdGVFeHRlbnNpb25Ib3N0cy5tYXAoZXh0SG9zdE1hbmFnZXIgPT4gZXh0SG9zdE1hbmFnZXIuYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudCwgQWN0aXZhdGlvbktpbmQuTm9ybWFsKSlcblx0XHRcdCkudGhlbigoKSA9PiB7IH0pO1xuXHRcdFx0dGhpcy5fb25XaWxsQWN0aXZhdGVCeUV2ZW50LmZpcmUoe1xuXHRcdFx0XHRldmVudDogYWN0aXZhdGlvbkV2ZW50LFxuXHRcdFx0XHRhY3RpdmF0aW9uOiByZXN1bHQsXG5cdFx0XHRcdGFjdGl2YXRpb25LaW5kOiBBY3RpdmF0aW9uS2luZC5Ob3JtYWxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX3BlbmRpbmdSZW1vdGVBY3RpdmF0aW9uRXZlbnRzLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlQW5kUHJvY2Vzc0V4dGVuc2lvbnMobG9jazogRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeUxvY2ssKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHJlc29sdmVyRXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10gPSBbXTtcblx0XHRsZXQgbG9jYWxFeHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSA9IFtdO1xuXHRcdGxldCByZW1vdGVFeHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSA9IFtdO1xuXG5cdFx0Zm9yIGF3YWl0IChjb25zdCBleHRlbnNpb25zIG9mIHRoaXMuX3Jlc29sdmVFeHRlbnNpb25zKCkpIHtcblx0XHRcdGlmIChleHRlbnNpb25zIGluc3RhbmNlb2YgUmVzb2x2ZXJFeHRlbnNpb25zKSB7XG5cdFx0XHRcdHJlc29sdmVyRXh0ZW5zaW9ucyA9IGNoZWNrRW5hYmxlZEFuZFByb3Bvc2VkQVBJKHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX2V4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCB0aGlzLl9leHRlbnNpb25zUHJvcG9zZWRBcGksIGV4dGVuc2lvbnMuZXh0ZW5zaW9ucywgZmFsc2UpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RyeS5kZWx0YUV4dGVuc2lvbnMobG9jaywgcmVzb2x2ZXJFeHRlbnNpb25zLCBbXSk7XG5cdFx0XHRcdHRoaXMuX2RvSGFuZGxlRXh0ZW5zaW9uUG9pbnRzKHJlc29sdmVyRXh0ZW5zaW9ucywgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9ucyBpbnN0YW5jZW9mIExvY2FsRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRsb2NhbEV4dGVuc2lvbnMgPSBjaGVja0VuYWJsZWRBbmRQcm9wb3NlZEFQSSh0aGlzLl9sb2dTZXJ2aWNlLCB0aGlzLl9leHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgdGhpcy5fZXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLCBleHRlbnNpb25zLmV4dGVuc2lvbnMsIGZhbHNlKTtcblx0XHRcdH1cblx0XHRcdGlmIChleHRlbnNpb25zIGluc3RhbmNlb2YgUmVtb3RlRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRyZW1vdGVFeHRlbnNpb25zID0gY2hlY2tFbmFibGVkQW5kUHJvcG9zZWRBUEkodGhpcy5fbG9nU2VydmljZSwgdGhpcy5fZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIHRoaXMuX2V4dGVuc2lvbnNQcm9wb3NlZEFwaSwgZXh0ZW5zaW9ucy5leHRlbnNpb25zLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gYGluaXRpYWxpemVSdW5uaW5nTG9jYXRpb25gIHdpbGwgbG9vayBhdCB0aGUgY29tcGxldGUgcGljdHVyZSAoZS5nLiBhbiBleHRlbnNpb24gaW5zdGFsbGVkIG9uIGJvdGggc2lkZXMpLFxuXHRcdC8vIHRha2VzIGNhcmUgb2YgZHVwbGljYXRlcyBhbmQgcGlja3MgYSBydW5uaW5nIGxvY2F0aW9uIGZvciBlYWNoIGV4dGVuc2lvblxuXHRcdHRoaXMuX3J1bm5pbmdMb2NhdGlvbnMuaW5pdGlhbGl6ZVJ1bm5pbmdMb2NhdGlvbihsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMpO1xuXG5cdFx0dGhpcy5fc3RhcnRFeHRlbnNpb25Ib3N0c0lmTmVjZXNzYXJ5KHRydWUsIFtdKTtcblxuXHRcdC8vIFNvbWUgcmVtb3RlIGV4dGVuc2lvbnMgY291bGQgcnVuIGxvY2FsbHkgaW4gdGhlIHdlYiB3b3JrZXIsIHNvIHN0b3JlIHRoZW1cblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zVGhhdE5lZWRUb1J1bkxvY2FsbHkgPSAodGhpcy5fYWxsb3dSZW1vdGVFeHRlbnNpb25zSW5Mb2NhbFdlYldvcmtlciA/IHRoaXMuX3J1bm5pbmdMb2NhdGlvbnMuZmlsdGVyQnlFeHRlbnNpb25Ib3N0S2luZChyZW1vdGVFeHRlbnNpb25zLCBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlcikgOiBbXSk7XG5cdFx0Y29uc3QgbG9jYWxQcm9jZXNzRXh0ZW5zaW9ucyA9ICh0aGlzLl9oYXNMb2NhbFByb2Nlc3MgPyB0aGlzLl9ydW5uaW5nTG9jYXRpb25zLmZpbHRlckJ5RXh0ZW5zaW9uSG9zdEtpbmQobG9jYWxFeHRlbnNpb25zLCBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3MpIDogW10pO1xuXHRcdGNvbnN0IGxvY2FsV2ViV29ya2VyRXh0ZW5zaW9ucyA9IHRoaXMuX3J1bm5pbmdMb2NhdGlvbnMuZmlsdGVyQnlFeHRlbnNpb25Ib3N0S2luZChsb2NhbEV4dGVuc2lvbnMsIEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsV2ViV29ya2VyKTtcblx0XHRyZW1vdGVFeHRlbnNpb25zID0gdGhpcy5fcnVubmluZ0xvY2F0aW9ucy5maWx0ZXJCeUV4dGVuc2lvbkhvc3RLaW5kKHJlbW90ZUV4dGVuc2lvbnMsIEV4dGVuc2lvbkhvc3RLaW5kLlJlbW90ZSk7XG5cblx0XHQvLyBBZGQgbG9jYWxseSB0aGUgcmVtb3RlIGV4dGVuc2lvbnMgdGhhdCBuZWVkIHRvIHJ1biBsb2NhbGx5IGluIHRoZSB3ZWIgd29ya2VyXG5cdFx0Zm9yIChjb25zdCBleHQgb2YgcmVtb3RlRXh0ZW5zaW9uc1RoYXROZWVkVG9SdW5Mb2NhbGx5KSB7XG5cdFx0XHRpZiAoIWluY2x1ZGVzKGxvY2FsV2ViV29ya2VyRXh0ZW5zaW9ucywgZXh0LmlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdGxvY2FsV2ViV29ya2VyRXh0ZW5zaW9ucy5wdXNoKGV4dCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsRXh0ZW5zaW9ucyA9IHJlbW90ZUV4dGVuc2lvbnMuY29uY2F0KGxvY2FsUHJvY2Vzc0V4dGVuc2lvbnMpLmNvbmNhdChsb2NhbFdlYldvcmtlckV4dGVuc2lvbnMpO1xuXHRcdGxldCB0b0FkZCA9IGFsbEV4dGVuc2lvbnM7XG5cblx0XHRpZiAocmVzb2x2ZXJFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0Ly8gQWRkIGV4dGVuc2lvbnMgdGhhdCBhcmUgbm90IHJlZ2lzdGVyZWQgYXMgcmVzb2x2ZXJzIGJ1dCBhcmUgaW4gdGhlIGZpbmFsIHJlc29sdmVkIHNldFxuXHRcdFx0dG9BZGQgPSBhbGxFeHRlbnNpb25zLmZpbHRlcihleHRlbnNpb24gPT4gIXJlc29sdmVyRXh0ZW5zaW9ucy5zb21lKGUgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikgJiYgZS5leHRlbnNpb25Mb2NhdGlvbi50b1N0cmluZygpID09PSBleHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24udG9TdHJpbmcoKSkpO1xuXHRcdFx0Ly8gUmVtb3ZlIGV4dGVuc2lvbnMgdGhhdCBhcmUgcmVnaXN0ZXJlZCBhcyByZXNvbHZlcnMgYnV0IGFyZSBub3QgaW4gdGhlIGZpbmFsIHJlc29sdmVkIHNldFxuXHRcdFx0aWYgKGFsbEV4dGVuc2lvbnMubGVuZ3RoIDwgdG9BZGQubGVuZ3RoICsgcmVzb2x2ZXJFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCB0b1JlbW92ZSA9IHJlc29sdmVyRXh0ZW5zaW9ucy5maWx0ZXIocmVnaXN0ZXJlZCA9PiAhYWxsRXh0ZW5zaW9ucy5zb21lKGUgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZS5pZGVudGlmaWVyLCByZWdpc3RlcmVkLmlkZW50aWZpZXIpICYmIGUuZXh0ZW5zaW9uTG9jYXRpb24udG9TdHJpbmcoKSA9PT0gcmVnaXN0ZXJlZC5leHRlbnNpb25Mb2NhdGlvbi50b1N0cmluZygpKSk7XG5cdFx0XHRcdGlmICh0b1JlbW92ZS5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3RyeS5kZWx0YUV4dGVuc2lvbnMobG9jaywgW10sIHRvUmVtb3ZlLm1hcChlID0+IGUuaWRlbnRpZmllcikpO1xuXHRcdFx0XHRcdHRoaXMuX2RvSGFuZGxlRXh0ZW5zaW9uUG9pbnRzKHRvUmVtb3ZlLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX3JlZ2lzdHJ5LmRlbHRhRXh0ZW5zaW9ucyhsb2NrLCB0b0FkZCwgW10pO1xuXHRcdGlmIChyZXN1bHQucmVtb3ZlZER1ZVRvTG9vcGluZy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdsb29waW5nJywgXCJUaGUgZm9sbG93aW5nIGV4dGVuc2lvbnMgY29udGFpbiBkZXBlbmRlbmN5IGxvb3BzIGFuZCBoYXZlIGJlZW4gZGlzYWJsZWQ6IHswfVwiLCByZXN1bHQucmVtb3ZlZER1ZVRvTG9vcGluZy5tYXAoZSA9PiBgJyR7ZS5pZGVudGlmaWVyLnZhbHVlfSdgKS5qb2luKCcsICcpKVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZG9IYW5kbGVFeHRlbnNpb25Qb2ludHModGhpcy5fcmVnaXN0cnkuZ2V0QWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKCksIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUV4dGVuc2lvblRlc3RzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQgfHwgIXRoaXMuX2Vudmlyb25tZW50U2VydmljZS5leHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uSG9zdE1hbmFnZXIgPSB0aGlzLmZpbmRUZXN0RXh0ZW5zaW9uSG9zdCh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSk7XG5cdFx0aWYgKCFleHRlbnNpb25Ib3N0TWFuYWdlcikge1xuXHRcdFx0Y29uc3QgbXNnID0gbmxzLmxvY2FsaXplKCdleHRlbnNpb25UZXN0RXJyb3InLCBcIk5vIGV4dGVuc2lvbiBob3N0IGZvdW5kIHRoYXQgY2FuIGxhdW5jaCB0aGUgdGVzdCBydW5uZXIgYXQgezB9LlwiLCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSS50b1N0cmluZygpKTtcblx0XHRcdGNvbnNvbGUuZXJyb3IobXNnKTtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobXNnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblxuXHRcdGxldCBleGl0Q29kZTogbnVtYmVyO1xuXHRcdHRyeSB7XG5cdFx0XHRleGl0Q29kZSA9IGF3YWl0IGV4dGVuc2lvbkhvc3RNYW5hZ2VyLmV4dGVuc2lvblRlc3RzRXhlY3V0ZSgpO1xuXHRcdFx0aWYgKGlzQ0kpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBFeHRlbnNpb24gaG9zdCB0ZXN0IHJ1bm5lciBleGl0IGNvZGU6ICR7ZXhpdENvZGV9YCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBFeHRlbnNpb24gaG9zdCB0ZXN0IHJ1bm5lciBlcnJvcmAsIGVycik7XG5cdFx0XHR9XG5cdFx0XHRjb25zb2xlLmVycm9yKGVycik7XG5cdFx0XHRleGl0Q29kZSA9IDEgLyogRVJST1IgKi87XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25FeHRlbnNpb25Ib3N0RXhpdChleGl0Q29kZSk7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRUZXN0RXh0ZW5zaW9uSG9zdCh0ZXN0TG9jYXRpb246IFVSSSk6IElFeHRlbnNpb25Ib3N0TWFuYWdlciB8IG51bGwge1xuXHRcdGxldCBydW5uaW5nTG9jYXRpb246IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiB8IG51bGwgPSBudWxsO1xuXG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgdGhpcy5fcmVnaXN0cnkuZ2V0QWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKCkpIHtcblx0XHRcdGlmIChpc0VxdWFsT3JQYXJlbnQodGVzdExvY2F0aW9uLCBleHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24pKSB7XG5cdFx0XHRcdHJ1bm5pbmdMb2NhdGlvbiA9IHRoaXMuX3J1bm5pbmdMb2NhdGlvbnMuZ2V0UnVubmluZ0xvY2F0aW9uKGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChydW5uaW5nTG9jYXRpb24gPT09IG51bGwpIHtcblx0XHRcdC8vIG5vdCBzdXJlIGlmIHdlIHNob3VsZCBzdXBwb3J0IHRoYXQsIGJ1dCBpdCB3YXMgcG9zc2libGUgdG8gaGF2ZSBhbiB0ZXN0IG91dHNpZGUgYW4gZXh0ZW5zaW9uXG5cblx0XHRcdGlmICh0ZXN0TG9jYXRpb24uc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZSkge1xuXHRcdFx0XHRydW5uaW5nTG9jYXRpb24gPSBuZXcgUmVtb3RlUnVubmluZ0xvY2F0aW9uKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBXaGVuIGEgZGVidWdnZXIgYXR0YWNoZXMgdG8gdGhlIGV4dGVuc2lvbiBob3N0LCBpdCB3aWxsIHN1cmZhY2UgYWxsIGNvbnNvbGUubG9nIG1lc3NhZ2VzIGZyb20gdGhlIGV4dGVuc2lvbiBob3N0LFxuXHRcdFx0XHQvLyBidXQgbm90IG5lY2Vzc2FyaWx5IGZyb20gdGhlIHdpbmRvdy4gU28gaXQgd291bGQgYmUgYmVzdCBpZiBhbnkgZXJyb3JzIGdldCBwcmludGVkIHRvIHRoZSBjb25zb2xlIG9mIHRoZSBleHRlbnNpb24gaG9zdC5cblx0XHRcdFx0Ly8gVGhhdCBpcyB3aHkgaGVyZSB3ZSB1c2UgdGhlIGxvY2FsIHByb2Nlc3MgZXh0ZW5zaW9uIGhvc3QgZXZlbiBmb3Igbm9uLWZpbGUgVVJJc1xuXHRcdFx0XHRydW5uaW5nTG9jYXRpb24gPSBuZXcgTG9jYWxQcm9jZXNzUnVubmluZ0xvY2F0aW9uKDApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocnVubmluZ0xvY2F0aW9uICE9PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLmdldEJ5UnVubmluZ0xvY2F0aW9uKHJ1bm5pbmdMb2NhdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVsZWFzZUJhcnJpZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5faW5zdGFsbGVkRXh0ZW5zaW9uc1JlYWR5Lm9wZW4oKTtcblx0XHR0aGlzLl9vbkRpZFJlZ2lzdGVyRXh0ZW5zaW9ucy5maXJlKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VFeHRlbnNpb25zU3RhdHVzLmZpcmUodGhpcy5fcmVnaXN0cnkuZ2V0QWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKCkubWFwKGUgPT4gZS5pZGVudGlmaWVyKSk7XG5cdH1cblxuXHQvLyNyZWdpb24gcmVtb3RlIGF1dGhvcml0eSByZXNvbHZpbmdcblxuXHRwcm90ZWN0ZWQgYXN5bmMgX3Jlc29sdmVBdXRob3JpdHlJbml0aWFsKHJlbW90ZUF1dGhvcml0eTogc3RyaW5nKTogUHJvbWlzZTxSZXNvbHZlclJlc3VsdD4ge1xuXHRcdGNvbnN0IE1BWF9BVFRFTVBUUyA9IDU7XG5cblx0XHRmb3IgKGxldCBhdHRlbXB0ID0gMTsgOyBhdHRlbXB0KyspIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXNvbHZlQXV0aG9yaXR5V2l0aExvZ2dpbmcocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRpZiAoUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvci5pc05vUmVzb2x2ZXJGb3VuZChlcnIpKSB7XG5cdFx0XHRcdFx0Ly8gVGhlcmUgaXMgbm8gcG9pbnQgaW4gcmV0cnlpbmcgaWYgdGhlcmUgaXMgbm8gcmVzb2x2ZXIgZm91bmRcblx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvci5pc05vdEF2YWlsYWJsZShlcnIpKSB7XG5cdFx0XHRcdFx0Ly8gVGhlIHJlc29sdmVyIGlzIG5vdCBhdmFpbGFibGUgYW5kIGFza2VkIHVzIHRvIG5vdCByZXRyeVxuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhdHRlbXB0ID49IE1BWF9BVFRFTVBUUykge1xuXHRcdFx0XHRcdC8vIFRvbyBtYW55IGZhaWxlZCBhdHRlbXB0cywgZ2l2ZSB1cFxuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfcmVzb2x2ZUF1dGhvcml0eUFnYWluKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0aWYgKCFyZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UuX2NsZWFyUmVzb2x2ZWRBdXRob3JpdHkocmVtb3RlQXV0aG9yaXR5KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUF1dGhvcml0eVdpdGhMb2dnaW5nKHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0XHR0aGlzLl9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UuX3NldFJlc29sdmVkQXV0aG9yaXR5KHJlc3VsdC5hdXRob3JpdHksIHJlc3VsdC5vcHRpb25zKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX3JlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5fc2V0UmVzb2x2ZWRBdXRob3JpdHlFcnJvcihyZW1vdGVBdXRob3JpdHksIGVycik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUF1dGhvcml0eVdpdGhMb2dnaW5nKHJlbW90ZUF1dGhvcml0eTogc3RyaW5nKTogUHJvbWlzZTxSZXNvbHZlclJlc3VsdD4ge1xuXHRcdGNvbnN0IGF1dGhvcml0eVByZWZpeCA9IGdldFJlbW90ZUF1dGhvcml0eVByZWZpeChyZW1vdGVBdXRob3JpdHkpO1xuXHRcdGNvbnN0IHN3ID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBJbnZva2luZyByZXNvbHZlQXV0aG9yaXR5KCR7YXV0aG9yaXR5UHJlZml4fSkuLi5gKTtcblx0XHR0cnkge1xuXHRcdFx0cGVyZi5tYXJrKGBjb2RlL3dpbGxSZXNvbHZlQXV0aG9yaXR5LyR7YXV0aG9yaXR5UHJlZml4fWApO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUF1dGhvcml0eShyZW1vdGVBdXRob3JpdHkpO1xuXHRcdFx0cGVyZi5tYXJrKGBjb2RlL2RpZFJlc29sdmVBdXRob3JpdHlPSy8ke2F1dGhvcml0eVByZWZpeH1gKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgcmVzb2x2ZUF1dGhvcml0eSgke2F1dGhvcml0eVByZWZpeH0pIHJldHVybmVkICcke3Jlc3VsdC5hdXRob3JpdHkuY29ubmVjdFRvfScgYWZ0ZXIgJHtzdy5lbGFwc2VkKCl9IG1zYCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0cGVyZi5tYXJrKGBjb2RlL2RpZFJlc29sdmVBdXRob3JpdHlFcnJvci8ke2F1dGhvcml0eVByZWZpeH1gKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYHJlc29sdmVBdXRob3JpdHkoJHthdXRob3JpdHlQcmVmaXh9KSByZXR1cm5lZCBhbiBlcnJvciBhZnRlciAke3N3LmVsYXBzZWQoKX0gbXNgLCBlcnIpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfcmVzb2x2ZUF1dGhvcml0eU9uRXh0ZW5zaW9uSG9zdHMoa2luZDogRXh0ZW5zaW9uSG9zdEtpbmQsIHJlbW90ZUF1dGhvcml0eTogc3RyaW5nKTogUHJvbWlzZTxSZXNvbHZlclJlc3VsdD4ge1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uSG9zdHMgPSB0aGlzLl9nZXRFeHRlbnNpb25Ib3N0TWFuYWdlcnMoa2luZCk7XG5cdFx0aWYgKGV4dGVuc2lvbkhvc3RzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gbm8gbG9jYWwgcHJvY2VzcyBleHRlbnNpb24gaG9zdHNcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlc29sdmUgYXV0aG9yaXR5YCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVzb2x2ZUF1dGhvcml0eUF0dGVtcHQrKztcblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwoZXh0ZW5zaW9uSG9zdHMubWFwKGV4dEhvc3QgPT4gZXh0SG9zdC5yZXNvbHZlQXV0aG9yaXR5KHJlbW90ZUF1dGhvcml0eSwgdGhpcy5fcmVzb2x2ZUF1dGhvcml0eUF0dGVtcHQpKSk7XG5cblx0XHRsZXQgYmVzdEVycm9yUmVzdWx0OiBJUmVzb2x2ZUF1dGhvcml0eUVycm9yUmVzdWx0IHwgbnVsbCA9IG51bGw7XG5cdFx0Zm9yIChjb25zdCByZXN1bHQgb2YgcmVzdWx0cykge1xuXHRcdFx0aWYgKHJlc3VsdC50eXBlID09PSAnb2snKSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQudmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWJlc3RFcnJvclJlc3VsdCkge1xuXHRcdFx0XHRiZXN0RXJyb3JSZXN1bHQgPSByZXN1bHQ7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYmVzdEVycm9ySXNVbmtub3duID0gKGJlc3RFcnJvclJlc3VsdC5lcnJvci5jb2RlID09PSBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yQ29kZS5Vbmtub3duKTtcblx0XHRcdGNvbnN0IGVycm9ySXNVbmtub3duID0gKHJlc3VsdC5lcnJvci5jb2RlID09PSBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yQ29kZS5Vbmtub3duKTtcblx0XHRcdGlmIChiZXN0RXJyb3JJc1Vua25vd24gJiYgIWVycm9ySXNVbmtub3duKSB7XG5cdFx0XHRcdGJlc3RFcnJvclJlc3VsdCA9IHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyB3ZSBjYW4gb25seSByZWFjaCB0aGlzIGlmIHRoZXJlIGlzIGFuIGVycm9yXG5cdFx0dGhyb3cgbmV3IFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IoYmVzdEVycm9yUmVzdWx0IS5lcnJvci5tZXNzYWdlLCBiZXN0RXJyb3JSZXN1bHQhLmVycm9yLmNvZGUsIGJlc3RFcnJvclJlc3VsdCEuZXJyb3IuZGV0YWlsKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBTdG9wcGluZyAvIFN0YXJ0aW5nIC8gUmVzdGFydGluZ1xuXG5cdHB1YmxpYyBhc3luYyBzdG9wRXh0ZW5zaW9uSG9zdHMocmVhc29uOiBzdHJpbmcsIGF1dG8/OiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0YXdhaXQgdGhpcy5faW5pdGlhbGl6ZUlmTmVlZGVkKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2RvU3RvcEV4dGVuc2lvbkhvc3RzV2l0aFZldG8ocmVhc29uLCBhdXRvKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfZG9TdG9wRXh0ZW5zaW9uSG9zdHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJldmlvdXNseUFjdGl2YXRlZEV4dGVuc2lvbklkczogRXh0ZW5zaW9uSWRlbnRpZmllcltdID0gW107XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb25TdGF0dXMgb2YgdGhpcy5fZXh0ZW5zaW9uU3RhdHVzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uU3RhdHVzLmFjdGl2YXRpb25TdGFydGVkKSB7XG5cdFx0XHRcdHByZXZpb3VzbHlBY3RpdmF0ZWRFeHRlbnNpb25JZHMucHVzaChleHRlbnNpb25TdGF0dXMuaWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2Vycy5zdG9wQWxsSW5SZXZlcnNlKCk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb25TdGF0dXMgb2YgdGhpcy5fZXh0ZW5zaW9uU3RhdHVzLnZhbHVlcygpKSB7XG5cdFx0XHRleHRlbnNpb25TdGF0dXMuY2xlYXJSdW50aW1lU3RhdHVzKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHByZXZpb3VzbHlBY3RpdmF0ZWRFeHRlbnNpb25JZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VFeHRlbnNpb25zU3RhdHVzLmZpcmUocHJldmlvdXNseUFjdGl2YXRlZEV4dGVuc2lvbklkcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9TdG9wRXh0ZW5zaW9uSG9zdHNXaXRoVmV0byhyZWFzb246IHN0cmluZywgYXV0bzogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKGF1dG8gJiYgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB2ZXRvczogKGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+KVtdID0gW107XG5cdFx0Y29uc3QgdmV0b1JlYXNvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdHRoaXMuX29uV2lsbFN0b3AuZmlyZSh7XG5cdFx0XHRyZWFzb24sXG5cdFx0XHRhdXRvLFxuXHRcdFx0dmV0byh2YWx1ZSwgcmVhc29uKSB7XG5cdFx0XHRcdHZldG9zLnB1c2godmFsdWUpO1xuXG5cdFx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRcdGlmICh2YWx1ZSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0dmV0b1JlYXNvbnMuYWRkKHJlYXNvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHZhbHVlLnRoZW4odmFsdWUgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdFx0XHRcdHZldG9SZWFzb25zLmFkZChyZWFzb24pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdFx0XHRcdHZldG9SZWFzb25zLmFkZChubHMubG9jYWxpemUoJ2V4dGVuc2lvblN0b3BWZXRvRXJyb3InLCBcInswfSAoRXJyb3I6IHsxfSlcIiwgcmVhc29uLCB0b0Vycm9yTWVzc2FnZShlcnJvcikpKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdmV0byA9IGF3YWl0IGhhbmRsZVZldG9zKHZldG9zLCBlcnJvciA9PiB0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycm9yKSk7XG5cdFx0aWYgKCF2ZXRvKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9kb1N0b3BFeHRlbnNpb25Ib3N0cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIWF1dG8pIHtcblx0XHRcdFx0Y29uc3QgdmV0b1JlYXNvbnNBcnJheSA9IEFycmF5LmZyb20odmV0b1JlYXNvbnMpO1xuXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgRXh0ZW5zaW9uIGhvc3Qgd2FzIG5vdCBzdG9wcGVkIGJlY2F1c2Ugb2YgdmV0byAoc3RvcCByZWFzb246ICR7cmVhc29ufSwgdmV0byByZWFzb246ICR7dmV0b1JlYXNvbnNBcnJheS5qb2luKCcsICcpfSlgKTtcblxuXHRcdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uU3RvcFZldG9NZXNzYWdlJywgXCJQbGVhc2UgY29uZmlybSByZXN0YXJ0IG9mIGV4dGVuc2lvbnMuXCIpLFxuXHRcdFx0XHRcdGRldGFpbDogdmV0b1JlYXNvbnNBcnJheS5sZW5ndGggPT09IDEgP1xuXHRcdFx0XHRcdFx0dmV0b1JlYXNvbnNBcnJheVswXSA6XG5cdFx0XHRcdFx0XHR2ZXRvUmVhc29uc0FycmF5LmpvaW4oJ1xcbiAtJyksXG5cdFx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbmxzLmxvY2FsaXplKCdwcm9jZWVkQW55d2F5cycsIFwiUmVzdGFydCBBbnl3YXlcIilcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKGNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9XG5cblx0XHRyZXR1cm4gIXZldG87XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydEV4dGVuc2lvbkhvc3RzSWZOZWNlc3NhcnkoaXNJbml0aWFsU3RhcnQ6IGJvb2xlYW4sIGluaXRpYWxBY3RpdmF0aW9uRXZlbnRzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGxvY2F0aW9uczogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uW10gPSBbXTtcblx0XHRmb3IgKGxldCBhZmZpbml0eSA9IDA7IGFmZmluaXR5IDw9IHRoaXMuX3J1bm5pbmdMb2NhdGlvbnMubWF4TG9jYWxQcm9jZXNzQWZmaW5pdHk7IGFmZmluaXR5KyspIHtcblx0XHRcdGxvY2F0aW9ucy5wdXNoKG5ldyBMb2NhbFByb2Nlc3NSdW5uaW5nTG9jYXRpb24oYWZmaW5pdHkpKTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgYWZmaW5pdHkgPSAwOyBhZmZpbml0eSA8PSB0aGlzLl9ydW5uaW5nTG9jYXRpb25zLm1heExvY2FsV2ViV29ya2VyQWZmaW5pdHk7IGFmZmluaXR5KyspIHtcblx0XHRcdGxvY2F0aW9ucy5wdXNoKG5ldyBMb2NhbFdlYldvcmtlclJ1bm5pbmdMb2NhdGlvbihhZmZpbml0eSkpO1xuXHRcdH1cblx0XHRsb2NhdGlvbnMucHVzaChuZXcgUmVtb3RlUnVubmluZ0xvY2F0aW9uKCkpO1xuXHRcdGZvciAoY29uc3QgbG9jYXRpb24gb2YgbG9jYXRpb25zKSB7XG5cdFx0XHRpZiAodGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLmdldEJ5UnVubmluZ0xvY2F0aW9uKGxvY2F0aW9uKSkge1xuXHRcdFx0XHQvLyBhbHJlYWR5IHJ1bm5pbmdcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXMgPSB0aGlzLl9jcmVhdGVFeHRlbnNpb25Ib3N0TWFuYWdlcihsb2NhdGlvbiwgaXNJbml0aWFsU3RhcnQsIGluaXRpYWxBY3RpdmF0aW9uRXZlbnRzKTtcblx0XHRcdGlmIChyZXMpIHtcblx0XHRcdFx0Y29uc3QgW2V4dEhvc3RNYW5hZ2VyLCBkaXNwb3NhYmxlU3RvcmVdID0gcmVzO1xuXHRcdFx0XHR0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMuYWRkKGV4dEhvc3RNYW5hZ2VyLCBkaXNwb3NhYmxlU3RvcmUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUV4dGVuc2lvbkhvc3RNYW5hZ2VyKHJ1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uLCBpc0luaXRpYWxTdGFydDogYm9vbGVhbiwgaW5pdGlhbEFjdGl2YXRpb25FdmVudHM6IHN0cmluZ1tdKTogbnVsbCB8IFtJRXh0ZW5zaW9uSG9zdE1hbmFnZXIsIERpc3Bvc2FibGVTdG9yZV0ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbkhvc3QgPSB0aGlzLl9leHRlbnNpb25Ib3N0RmFjdG9yeS5jcmVhdGVFeHRlbnNpb25Ib3N0KHRoaXMuX3J1bm5pbmdMb2NhdGlvbnMsIHJ1bm5pbmdMb2NhdGlvbiwgaXNJbml0aWFsU3RhcnQpO1xuXHRcdGlmICghZXh0ZW5zaW9uSG9zdCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvY2Vzc01hbmFnZXI6IElFeHRlbnNpb25Ib3N0TWFuYWdlciA9IHRoaXMuX2RvQ3JlYXRlRXh0ZW5zaW9uSG9zdE1hbmFnZXIoZXh0ZW5zaW9uSG9zdCwgaW5pdGlhbEFjdGl2YXRpb25FdmVudHMpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHByb2Nlc3NNYW5hZ2VyLm9uRGlkRXhpdCgoW2NvZGUsIHNpZ25hbF0pID0+IHRoaXMuX29uRXh0ZW5zaW9uSG9zdENyYXNoT3JFeGl0KHByb2Nlc3NNYW5hZ2VyLCBjb2RlLCBzaWduYWwpKSk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChwcm9jZXNzTWFuYWdlci5vbkRpZENoYW5nZVJlc3BvbnNpdmVTdGF0ZSgocmVzcG9uc2l2ZVN0YXRlKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEV4dGVuc2lvbiBob3N0ICgke3Byb2Nlc3NNYW5hZ2VyLmZyaWVuZHlOYW1lfSkgaXMgJHtyZXNwb25zaXZlU3RhdGUgPT09IFJlc3BvbnNpdmVTdGF0ZS5SZXNwb25zaXZlID8gJ3Jlc3BvbnNpdmUnIDogJ3VucmVzcG9uc2l2ZSd9LmApO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSZXNwb25zaXZlQ2hhbmdlLmZpcmUoe1xuXHRcdFx0XHRleHRlbnNpb25Ib3N0S2luZDogcHJvY2Vzc01hbmFnZXIua2luZCxcblx0XHRcdFx0aXNSZXNwb25zaXZlOiByZXNwb25zaXZlU3RhdGUgPT09IFJlc3BvbnNpdmVTdGF0ZS5SZXNwb25zaXZlLFxuXHRcdFx0XHRnZXRJbnNwZWN0TGlzdGVuZXI6ICh0cnlFbmFibGVJbnNwZWN0b3I6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gcHJvY2Vzc01hbmFnZXIuZ2V0SW5zcGVjdFBvcnQodHJ5RW5hYmxlSW5zcGVjdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdHJldHVybiBbcHJvY2Vzc01hbmFnZXIsIGRpc3Bvc2FibGVTdG9yZV07XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2RvQ3JlYXRlRXh0ZW5zaW9uSG9zdE1hbmFnZXIoZXh0ZW5zaW9uSG9zdDogSUV4dGVuc2lvbkhvc3QsIGluaXRpYWxBY3RpdmF0aW9uRXZlbnRzOiBzdHJpbmdbXSk6IElFeHRlbnNpb25Ib3N0TWFuYWdlciB7XG5cdFx0Y29uc3QgaW50ZXJuYWxFeHRlbnNpb25TZXJ2aWNlID0gdGhpcy5fYWNxdWlyZUludGVybmFsQVBJKGV4dGVuc2lvbkhvc3QpO1xuXHRcdGlmIChleHRlbnNpb25Ib3N0LnN0YXJ0dXAgPT09IEV4dGVuc2lvbkhvc3RTdGFydHVwLkxhenlBdXRvU3RhcnQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYXp5Q3JlYXRlRXh0ZW5zaW9uSG9zdE1hbmFnZXIsIGV4dGVuc2lvbkhvc3QsIGluaXRpYWxBY3RpdmF0aW9uRXZlbnRzLCBpbnRlcm5hbEV4dGVuc2lvblNlcnZpY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uSG9zdE1hbmFnZXIsIGV4dGVuc2lvbkhvc3QsIGluaXRpYWxBY3RpdmF0aW9uRXZlbnRzLCBpbnRlcm5hbEV4dGVuc2lvblNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25FeHRlbnNpb25Ib3N0Q3Jhc2hPckV4aXQoZXh0ZW5zaW9uSG9zdDogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyLCBjb2RlOiBudW1iZXIsIHNpZ25hbDogc3RyaW5nIHwgbnVsbCk6IHZvaWQge1xuXG5cdFx0Ly8gVW5leHBlY3RlZCB0ZXJtaW5hdGlvblxuXHRcdGNvbnN0IGlzRXh0ZW5zaW9uRGV2SG9zdCA9IHBhcnNlRXh0ZW5zaW9uRGV2T3B0aW9ucyh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UpLmlzRXh0ZW5zaW9uRGV2SG9zdDtcblx0XHRpZiAoIWlzRXh0ZW5zaW9uRGV2SG9zdCkge1xuXHRcdFx0dGhpcy5fb25FeHRlbnNpb25Ib3N0Q3Jhc2hlZChleHRlbnNpb25Ib3N0LCBjb2RlLCBzaWduYWwpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRXh0ZW5zaW9uSG9zdEV4aXQoY29kZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX29uRXh0ZW5zaW9uSG9zdENyYXNoZWQoZXh0ZW5zaW9uSG9zdDogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyLCBjb2RlOiBudW1iZXIsIHNpZ25hbDogc3RyaW5nIHwgbnVsbCk6IHZvaWQge1xuXHRcdGNvbnNvbGUuZXJyb3IoYEV4dGVuc2lvbiBob3N0ICgke2V4dGVuc2lvbkhvc3QuZnJpZW5keU5hbWV9KSB0ZXJtaW5hdGVkIHVuZXhwZWN0ZWRseS4gQ29kZTogJHtjb2RlfSwgU2lnbmFsOiAke3NpZ25hbH1gKTtcblx0XHRpZiAoZXh0ZW5zaW9uSG9zdC5raW5kID09PSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3MpIHtcblx0XHRcdHRoaXMuX2RvU3RvcEV4dGVuc2lvbkhvc3RzKCk7XG5cdFx0fSBlbHNlIGlmIChleHRlbnNpb25Ib3N0LmtpbmQgPT09IEV4dGVuc2lvbkhvc3RLaW5kLlJlbW90ZSkge1xuXHRcdFx0aWYgKHNpZ25hbCkge1xuXHRcdFx0XHR0aGlzLl9vblJlbW90ZUV4dGVuc2lvbkhvc3RDcmFzaGVkKGV4dGVuc2lvbkhvc3QsIHNpZ25hbCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMuc3RvcE9uZShleHRlbnNpb25Ib3N0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFeHRlbnNpb25Ib3N0RXhpdEluZm9XaXRoVGltZW91dChyZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nKTogUHJvbWlzZTxJRXh0ZW5zaW9uSG9zdEV4aXRJbmZvIHwgbnVsbD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCB0aW1lb3V0SGFuZGxlID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ2dldEV4dGVuc2lvbkhvc3RFeGl0SW5mbyB0aW1lZCBvdXQnKSk7XG5cdFx0XHR9LCAyMDAwKTtcblx0XHRcdHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRFeHRlbnNpb25Ib3N0RXhpdEluZm8ocmVjb25uZWN0aW9uVG9rZW4pLnRoZW4oXG5cdFx0XHRcdChyKSA9PiB7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXRIYW5kbGUpO1xuXHRcdFx0XHRcdHJlc29sdmUocik7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlamVjdFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29uUmVtb3RlRXh0ZW5zaW9uSG9zdENyYXNoZWQoZXh0ZW5zaW9uSG9zdDogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyLCByZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGluZm8gPSBhd2FpdCB0aGlzLl9nZXRFeHRlbnNpb25Ib3N0RXhpdEluZm9XaXRoVGltZW91dChyZWNvbm5lY3Rpb25Ub2tlbik7XG5cdFx0XHRpZiAoaW5mbykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBFeHRlbnNpb24gaG9zdCAoJHtleHRlbnNpb25Ib3N0LmZyaWVuZHlOYW1lfSkgdGVybWluYXRlZCB1bmV4cGVjdGVkbHkgd2l0aCBjb2RlICR7aW5mby5jb2RlfS5gKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbG9nRXh0ZW5zaW9uSG9zdENyYXNoKGV4dGVuc2lvbkhvc3QpO1xuXHRcdFx0dGhpcy5fcmVtb3RlQ3Jhc2hUcmFja2VyLnJlZ2lzdGVyQ3Jhc2goKTtcblxuXHRcdFx0aWYgKHRoaXMuX3JlbW90ZUNyYXNoVHJhY2tlci5zaG91bGRBdXRvbWF0aWNhbGx5UmVzdGFydCgpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgQXV0b21hdGljYWxseSByZXN0YXJ0aW5nIHRoZSByZW1vdGUgZXh0ZW5zaW9uIGhvc3QuYCk7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uuc3RhdHVzKG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uU2VydmljZS5hdXRvUmVzdGFydCcsIFwiVGhlIHJlbW90ZSBleHRlbnNpb24gaG9zdCB0ZXJtaW5hdGVkIHVuZXhwZWN0ZWRseS4gUmVzdGFydGluZy4uLlwiKSwgeyBoaWRlQWZ0ZXI6IDUwMDAgfSk7XG5cdFx0XHRcdHRoaXMuX3N0YXJ0RXh0ZW5zaW9uSG9zdHNJZk5lY2Vzc2FyeShmYWxzZSwgQXJyYXkuZnJvbSh0aGlzLl9hbGxSZXF1ZXN0ZWRBY3RpdmF0ZUV2ZW50cy5rZXlzKCkpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFNldmVyaXR5LkVycm9yLCBubHMubG9jYWxpemUoJ2V4dGVuc2lvblNlcnZpY2UuY3Jhc2gnLCBcIlJlbW90ZSBFeHRlbnNpb24gaG9zdCB0ZXJtaW5hdGVkIHVuZXhwZWN0ZWRseSAzIHRpbWVzIHdpdGhpbiB0aGUgbGFzdCA1IG1pbnV0ZXMuXCIpLFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdyZXN0YXJ0JywgXCJSZXN0YXJ0IFJlbW90ZSBFeHRlbnNpb24gSG9zdFwiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9zdGFydEV4dGVuc2lvbkhvc3RzSWZOZWNlc3NhcnkoZmFsc2UsIEFycmF5LmZyb20odGhpcy5fYWxsUmVxdWVzdGVkQWN0aXZhdGVFdmVudHMua2V5cygpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIG1heWJlIHRoaXMgd2Fzbid0IGFuIGV4dGVuc2lvbiBob3N0IGNyYXNoIGFuZCBpdCB3YXMgYSBwZXJtYW5lbnQgZGlzY29ubmVjdGlvblxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfbG9nRXh0ZW5zaW9uSG9zdENyYXNoKGV4dGVuc2lvbkhvc3Q6IElFeHRlbnNpb25Ib3N0TWFuYWdlcik6IHZvaWQge1xuXG5cdFx0Y29uc3QgYWN0aXZhdGVkRXh0ZW5zaW9uczogRXh0ZW5zaW9uSWRlbnRpZmllcltdID0gW107XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb25TdGF0dXMgb2YgdGhpcy5fZXh0ZW5zaW9uU3RhdHVzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uU3RhdHVzLmFjdGl2YXRpb25TdGFydGVkICYmIGV4dGVuc2lvbkhvc3QuY29udGFpbnNFeHRlbnNpb24oZXh0ZW5zaW9uU3RhdHVzLmlkKSkge1xuXHRcdFx0XHRhY3RpdmF0ZWRFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uU3RhdHVzLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoYWN0aXZhdGVkRXh0ZW5zaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBFeHRlbnNpb24gaG9zdCAoJHtleHRlbnNpb25Ib3N0LmZyaWVuZHlOYW1lfSkgdGVybWluYXRlZCB1bmV4cGVjdGVkbHkuIFRoZSBmb2xsb3dpbmcgZXh0ZW5zaW9ucyB3ZXJlIHJ1bm5pbmc6ICR7YWN0aXZhdGVkRXh0ZW5zaW9ucy5tYXAoaWQgPT4gaWQudmFsdWUpLmpvaW4oJywgJyl9YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEV4dGVuc2lvbiBob3N0ICgke2V4dGVuc2lvbkhvc3QuZnJpZW5keU5hbWV9KSB0ZXJtaW5hdGVkIHVuZXhwZWN0ZWRseS4gTm8gZXh0ZW5zaW9ucyB3ZXJlIGFjdGl2YXRlZC5gKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc3RhcnRFeHRlbnNpb25Ib3N0cyh1cGRhdGVzPzogeyB0b0FkZDogSUV4dGVuc2lvbltdOyB0b1JlbW92ZTogc3RyaW5nW10gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2RvU3RvcEV4dGVuc2lvbkhvc3RzKCk7XG5cblx0XHRpZiAodXBkYXRlcykge1xuXHRcdFx0YXdhaXQgdGhpcy5faGFuZGxlRGVsdGFFeHRlbnNpb25zKG5ldyBEZWx0YUV4dGVuc2lvbnNRdWV1ZUl0ZW0odXBkYXRlcy50b0FkZCwgdXBkYXRlcy50b1JlbW92ZSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvY2sgPSBhd2FpdCB0aGlzLl9yZWdpc3RyeS5hY3F1aXJlTG9jaygnc3RhcnRFeHRlbnNpb25Ib3N0cycpO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9zdGFydEV4dGVuc2lvbkhvc3RzSWZOZWNlc3NhcnkoZmFsc2UsIEFycmF5LmZyb20odGhpcy5fYWxsUmVxdWVzdGVkQWN0aXZhdGVFdmVudHMua2V5cygpKSk7XG5cdFx0XHR0aGlzLl9zdGFydE9uRGVtYW5kRXh0ZW5zaW9uSG9zdHMoKTtcblxuXHRcdFx0Y29uc3QgbG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdHMgPSB0aGlzLl9nZXRFeHRlbnNpb25Ib3N0TWFuYWdlcnMoRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzKTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGxvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3RzLm1hcChleHRIb3N0ID0+IGV4dEhvc3QucmVhZHkoKSkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRsb2NrLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydE9uRGVtYW5kRXh0ZW5zaW9uSG9zdHMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSB0aGlzLl9yZWdpc3RyeS5nZXRTbmFwc2hvdCgpO1xuXHRcdGZvciAoY29uc3QgZXh0SG9zdE1hbmFnZXIgb2YgdGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzKSB7XG5cdFx0XHRpZiAoZXh0SG9zdE1hbmFnZXIuc3RhcnR1cCAhPT0gRXh0ZW5zaW9uSG9zdFN0YXJ0dXAuRWFnZXJBdXRvU3RhcnQpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IHRoaXMuX3J1bm5pbmdMb2NhdGlvbnMuZmlsdGVyQnlFeHRlbnNpb25Ib3N0TWFuYWdlcihzbmFwc2hvdC5leHRlbnNpb25zLCBleHRIb3N0TWFuYWdlcik7XG5cdFx0XHRcdGV4dEhvc3RNYW5hZ2VyLnN0YXJ0KHNuYXBzaG90LnZlcnNpb25JZCwgc25hcHNob3QuZXh0ZW5zaW9ucywgZXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIElFeHRlbnNpb25TZXJ2aWNlXG5cblx0cHVibGljIGFjdGl2YXRlQnlFdmVudChhY3RpdmF0aW9uRXZlbnQ6IHN0cmluZywgYWN0aXZhdGlvbktpbmQ6IEFjdGl2YXRpb25LaW5kID0gQWN0aXZhdGlvbktpbmQuTm9ybWFsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2luc3RhbGxlZEV4dGVuc2lvbnNSZWFkeS5pc09wZW4oKSkge1xuXHRcdFx0Ly8gRXh0ZW5zaW9ucyBoYXZlIGJlZW4gc2Nhbm5lZCBhbmQgaW50ZXJwcmV0ZWRcblxuXHRcdFx0Ly8gUmVjb3JkIHRoZSBmYWN0IHRoYXQgdGhpcyBhY3RpdmF0aW9uRXZlbnQgd2FzIHJlcXVlc3RlZCAoaW4gY2FzZSBvZiBhIHJlc3RhcnQpXG5cdFx0XHR0aGlzLl9hbGxSZXF1ZXN0ZWRBY3RpdmF0ZUV2ZW50cy5hZGQoYWN0aXZhdGlvbkV2ZW50KTtcblxuXHRcdFx0aWYgKCF0aGlzLl9yZWdpc3RyeS5jb250YWluc0FjdGl2YXRpb25FdmVudChhY3RpdmF0aW9uRXZlbnQpKSB7XG5cdFx0XHRcdC8vIFRoZXJlIGlzIG5vIGV4dGVuc2lvbiB0aGF0IGlzIGludGVyZXN0ZWQgaW4gdGhpcyBhY3RpdmF0aW9uIGV2ZW50XG5cdFx0XHRcdHJldHVybiBOT19PUF9WT0lEX1BST01JU0U7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLl9hY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50LCBhY3RpdmF0aW9uS2luZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEV4dGVuc2lvbnMgaGF2ZSBub3QgYmVlbiBzY2FubmVkIHlldC5cblxuXHRcdFx0Ly8gUmVjb3JkIHRoZSBmYWN0IHRoYXQgdGhpcyBhY3RpdmF0aW9uRXZlbnQgd2FzIHJlcXVlc3RlZCAoaW4gY2FzZSBvZiBhIHJlc3RhcnQpXG5cdFx0XHR0aGlzLl9hbGxSZXF1ZXN0ZWRBY3RpdmF0ZUV2ZW50cy5hZGQoYWN0aXZhdGlvbkV2ZW50KTtcblxuXHRcdFx0aWYgKGFjdGl2YXRpb25LaW5kID09PSBBY3RpdmF0aW9uS2luZC5JbW1lZGlhdGUpIHtcblx0XHRcdFx0Ly8gRG8gbm90IHdhaXQgZm9yIHRoZSBub3JtYWwgc3RhcnQtdXAgb2YgdGhlIGV4dGVuc2lvbiBob3N0KHMpXG5cblx0XHRcdFx0Ly8gTm90ZTogc29tZSBjYWxsZXJzIGNvbWUgaW4gc28gZWFybHkgdGhhdCB0aGUgZXh0ZW5zaW9uIGhvc3RzIGhhdmUgbm90IGV2ZW4gYmVlbiBjcmVhdGVkIHlldC5cblx0XHRcdFx0Ly8gVGhlcmVmb3JlIHdlIGtpY2sgb2ZmIHRoZSBleHRlbnNpb24gaG9zdCBjcmVhdGlvbiwgYnV0IHdpdGhvdXQgYXdhaXRpbmcgaXQuXG5cdFx0XHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjYwMDYxXG5cdFx0XHRcdHZvaWQgdGhpcy5faW5pdGlhbGl6ZUlmTmVlZGVkKCk7XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMuX2FjdGl2YXRlQnlFdmVudChhY3RpdmF0aW9uRXZlbnQsIGFjdGl2YXRpb25LaW5kKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMuX2luc3RhbGxlZEV4dGVuc2lvbnNSZWFkeS53YWl0KCkudGhlbigoKSA9PiB0aGlzLl9hY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50LCBhY3RpdmF0aW9uS2luZCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FjdGl2YXRlQnlFdmVudChhY3RpdmF0aW9uRXZlbnQ6IHN0cmluZywgYWN0aXZhdGlvbktpbmQ6IEFjdGl2YXRpb25LaW5kKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IG1hbmFnZXJzOiBJRXh0ZW5zaW9uSG9zdE1hbmFnZXJbXTtcblx0XHRpZiAoYWN0aXZhdGlvbktpbmQgPT09IEFjdGl2YXRpb25LaW5kLkltbWVkaWF0ZSkge1xuXHRcdFx0Ly8gRm9yIGltbWVkaWF0ZSBhY3RpdmF0aW9uLCBvbmx5IGFjdGl2YXRlIG9uIGxvY2FsIGV4dGVuc2lvbiBob3N0c1xuXHRcdFx0Ly8gYW5kIG9uIHJlbW90ZSBleHRlbnNpb24gaG9zdHMgdGhhdCBhcmUgYWxyZWFkeSByZWFkeS5cblx0XHRcdC8vIERlZmVyIGFjdGl2YXRpb24gZm9yIHJlbW90ZSBob3N0cyB0aGF0IGFyZSBub3QgeWV0IHJlYWR5IHRvIGF2b2lkXG5cdFx0XHQvLyBibG9ja2luZyAoZS5nLiBkdXJpbmcgcmVtb3RlIGF1dGhvcml0eSByZXNvbHV0aW9uKS5cblx0XHRcdG1hbmFnZXJzID0gdGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLmZpbHRlcihcblx0XHRcdFx0ZXh0SG9zdE1hbmFnZXIgPT4gZXh0SG9zdE1hbmFnZXIua2luZCA9PT0gRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzXG5cdFx0XHRcdFx0fHwgZXh0SG9zdE1hbmFnZXIua2luZCA9PT0gRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxXZWJXb3JrZXJcblx0XHRcdFx0XHR8fCBleHRIb3N0TWFuYWdlci5pc1JlYWR5XG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlbW90ZUFjdGl2YXRpb25FdmVudHMuYWRkKGFjdGl2YXRpb25FdmVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1hbmFnZXJzID0gWy4uLnRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2Vyc107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gUHJvbWlzZS5hbGwoXG5cdFx0XHRtYW5hZ2Vycy5tYXAoZXh0SG9zdE1hbmFnZXIgPT4gZXh0SG9zdE1hbmFnZXIuYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudCwgYWN0aXZhdGlvbktpbmQpKVxuXHRcdCkudGhlbigoKSA9PiB7IH0pO1xuXHRcdHRoaXMuX29uV2lsbEFjdGl2YXRlQnlFdmVudC5maXJlKHtcblx0XHRcdGV2ZW50OiBhY3RpdmF0aW9uRXZlbnQsXG5cdFx0XHRhY3RpdmF0aW9uOiByZXN1bHQsXG5cdFx0XHRhY3RpdmF0aW9uS2luZFxuXHRcdH0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgYWN0aXZhdGVCeUlkKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCByZWFzb246IEV4dGVuc2lvbkFjdGl2YXRpb25SZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZhdGVCeUlkKGV4dGVuc2lvbklkLCByZWFzb24pO1xuXHR9XG5cblx0cHVibGljIGFjdGl2YXRpb25FdmVudElzRG9uZShhY3RpdmF0aW9uRXZlbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5faW5zdGFsbGVkRXh0ZW5zaW9uc1JlYWR5LmlzT3BlbigpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fcmVnaXN0cnkuY29udGFpbnNBY3RpdmF0aW9uRXZlbnQoYWN0aXZhdGlvbkV2ZW50KSkge1xuXHRcdFx0Ly8gVGhlcmUgaXMgbm8gZXh0ZW5zaW9uIHRoYXQgaXMgaW50ZXJlc3RlZCBpbiB0aGlzIGFjdGl2YXRpb24gZXZlbnRcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLmV2ZXJ5KG1hbmFnZXIgPT4gbWFuYWdlci5hY3RpdmF0aW9uRXZlbnRJc0RvbmUoYWN0aXZhdGlvbkV2ZW50KSk7XG5cdH1cblxuXHRwdWJsaWMgd2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9pbnN0YWxsZWRFeHRlbnNpb25zUmVhZHkud2FpdCgpO1xuXHR9XG5cblx0Z2V0IGV4dGVuc2lvbnMoKTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9yZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0RXh0ZW5zaW9uUmVnaXN0cnlTbmFwc2hvdFdoZW5SZWFkeSgpOiBQcm9taXNlPEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnlTbmFwc2hvdD4ge1xuXHRcdHJldHVybiB0aGlzLl9pbnN0YWxsZWRFeHRlbnNpb25zUmVhZHkud2FpdCgpLnRoZW4oKCkgPT4gdGhpcy5fcmVnaXN0cnkuZ2V0U25hcHNob3QoKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RXh0ZW5zaW9uKGlkOiBzdHJpbmcpOiBQcm9taXNlPElFeHRlbnNpb25EZXNjcmlwdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9pbnN0YWxsZWRFeHRlbnNpb25zUmVhZHkud2FpdCgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdHJ5LmdldEV4dGVuc2lvbkRlc2NyaXB0aW9uKGlkKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyByZWFkRXh0ZW5zaW9uUG9pbnRDb250cmlidXRpb25zPFQgZXh0ZW5kcyBJRXh0ZW5zaW9uQ29udHJpYnV0aW9uc1trZXlvZiBJRXh0ZW5zaW9uQ29udHJpYnV0aW9uc10+KGV4dFBvaW50OiBJRXh0ZW5zaW9uUG9pbnQ8VD4pOiBQcm9taXNlPEV4dGVuc2lvblBvaW50Q29udHJpYnV0aW9uPFQ+W10+IHtcblx0XHRyZXR1cm4gdGhpcy5faW5zdGFsbGVkRXh0ZW5zaW9uc1JlYWR5LndhaXQoKS50aGVuKCgpID0+IHtcblx0XHRcdGNvbnN0IGF2YWlsYWJsZUV4dGVuc2lvbnMgPSB0aGlzLl9yZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBFeHRlbnNpb25Qb2ludENvbnRyaWJ1dGlvbjxUPltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGRlc2Mgb2YgYXZhaWxhYmxlRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRpZiAoZGVzYy5jb250cmlidXRlcyAmJiBoYXNPd25Qcm9wZXJ0eS5jYWxsKGRlc2MuY29udHJpYnV0ZXMsIGV4dFBvaW50Lm5hbWUpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2gobmV3IEV4dGVuc2lvblBvaW50Q29udHJpYnV0aW9uPFQ+KGRlc2MsIGRlc2MuY29udHJpYnV0ZXNbZXh0UG9pbnQubmFtZSBhcyBrZXlvZiB0eXBlb2YgZGVzYy5jb250cmlidXRlc10gYXMgVCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RXh0ZW5zaW9uc1N0YXR1cygpOiB7IFtpZDogc3RyaW5nXTogSUV4dGVuc2lvbnNTdGF0dXMgfSB7XG5cdFx0Y29uc3QgcmVzdWx0OiB7IFtpZDogc3RyaW5nXTogSUV4dGVuc2lvbnNTdGF0dXMgfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0aWYgKHRoaXMuX3JlZ2lzdHJ5KSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zID0gdGhpcy5fcmVnaXN0cnkuZ2V0QWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblN0YXR1cyA9IHRoaXMuX2V4dGVuc2lvblN0YXR1cy5nZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRyZXN1bHRbZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWVdID0ge1xuXHRcdFx0XHRcdGlkOiBleHRlbnNpb24uaWRlbnRpZmllcixcblx0XHRcdFx0XHRtZXNzYWdlczogZXh0ZW5zaW9uU3RhdHVzPy5tZXNzYWdlcyA/PyBbXSxcblx0XHRcdFx0XHRhY3RpdmF0aW9uU3RhcnRlZDogZXh0ZW5zaW9uU3RhdHVzPy5hY3RpdmF0aW9uU3RhcnRlZCA/PyBmYWxzZSxcblx0XHRcdFx0XHRhY3RpdmF0aW9uVGltZXM6IGV4dGVuc2lvblN0YXR1cz8uYWN0aXZhdGlvblRpbWVzID8/IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRydW50aW1lRXJyb3JzOiBleHRlbnNpb25TdGF0dXM/LnJ1bnRpbWVFcnJvcnMgPz8gW10sXG5cdFx0XHRcdFx0cnVubmluZ0xvY2F0aW9uOiB0aGlzLl9ydW5uaW5nTG9jYXRpb25zLmdldFJ1bm5pbmdMb2NhdGlvbihleHRlbnNpb24uaWRlbnRpZmllciksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0SW5zcGVjdFBvcnRzKGV4dGVuc2lvbkhvc3RLaW5kOiBFeHRlbnNpb25Ib3N0S2luZCwgdHJ5RW5hYmxlSW5zcGVjdG9yOiBib29sZWFuKTogUHJvbWlzZTxJRXh0ZW5zaW9uSW5zcGVjdEluZm9bXT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFByb21pc2UuYWxsKFxuXHRcdFx0dGhpcy5fZ2V0RXh0ZW5zaW9uSG9zdE1hbmFnZXJzKGV4dGVuc2lvbkhvc3RLaW5kKS5tYXAoYXN5bmMgZXh0SG9zdCA9PiB7XG5cdFx0XHRcdGxldCBwb3J0SW5mbyA9IGF3YWl0IGV4dEhvc3QuZ2V0SW5zcGVjdFBvcnQodHJ5RW5hYmxlSW5zcGVjdG9yKTtcblx0XHRcdFx0aWYgKHBvcnRJbmZvICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRwb3J0SW5mbyA9IHsgLi4ucG9ydEluZm8sIGRldnRvb2xzTGFiZWw6IGV4dEhvc3QuZnJpZW5keU5hbWUgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcG9ydEluZm87XG5cdFx0XHR9KVxuXHRcdCk7XG5cdFx0Ly8gcmVtb3ZlIDBzOlxuXHRcdHJldHVybiByZXN1bHQuZmlsdGVyKGlzRGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc2V0UmVtb3RlRW52aXJvbm1lbnQoZW52OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB8IG51bGwgfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2Vyc1xuXHRcdFx0Lm1hcChtYW5hZ2VyID0+IG1hbmFnZXIuc2V0UmVtb3RlRW52aXJvbm1lbnQoZW52KSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyAtLS0gaW1wbFxuXG5cdHByaXZhdGUgX3NhZmVJbnZva2VJc0VuYWJsZWQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoZXh0ZW5zaW9uKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kb0hhbmRsZUV4dGVuc2lvblBvaW50cyhhZmZlY3RlZEV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCBvbmx5UmVzb2x2ZXJFeHRlbnNpb25Qb2ludHM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBhZmZlY3RlZEV4dGVuc2lvblBvaW50czogeyBbZXh0UG9pbnROYW1lOiBzdHJpbmddOiBib29sZWFuIH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uRGVzY3JpcHRpb24gb2YgYWZmZWN0ZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uRGVzY3JpcHRpb24uY29udHJpYnV0ZXMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRQb2ludE5hbWUgaW4gZXh0ZW5zaW9uRGVzY3JpcHRpb24uY29udHJpYnV0ZXMpIHtcblx0XHRcdFx0XHRpZiAoaGFzT3duUHJvcGVydHkuY2FsbChleHRlbnNpb25EZXNjcmlwdGlvbi5jb250cmlidXRlcywgZXh0UG9pbnROYW1lKSkge1xuXHRcdFx0XHRcdFx0YWZmZWN0ZWRFeHRlbnNpb25Qb2ludHNbZXh0UG9pbnROYW1lXSA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVzc2FnZUhhbmRsZXIgPSAobXNnOiBJTWVzc2FnZSkgPT4gdGhpcy5faGFuZGxlRXh0ZW5zaW9uUG9pbnRNZXNzYWdlKG1zZyk7XG5cdFx0Y29uc3QgYXZhaWxhYmxlRXh0ZW5zaW9ucyA9IHRoaXMuX3JlZ2lzdHJ5LmdldEFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucygpO1xuXHRcdGNvbnN0IGV4dGVuc2lvblBvaW50cyA9IEV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFeHRlbnNpb25Qb2ludHMoKTtcblx0XHRwZXJmLm1hcmsob25seVJlc29sdmVyRXh0ZW5zaW9uUG9pbnRzID8gJ2NvZGUvd2lsbEhhbmRsZVJlc29sdmVyRXh0ZW5zaW9uUG9pbnRzJyA6ICdjb2RlL3dpbGxIYW5kbGVFeHRlbnNpb25Qb2ludHMnKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvblBvaW50IG9mIGV4dGVuc2lvblBvaW50cykge1xuXHRcdFx0aWYgKGFmZmVjdGVkRXh0ZW5zaW9uUG9pbnRzW2V4dGVuc2lvblBvaW50Lm5hbWVdICYmICghb25seVJlc29sdmVyRXh0ZW5zaW9uUG9pbnRzIHx8IGV4dGVuc2lvblBvaW50LmNhbkhhbmRsZVJlc29sdmVyKSkge1xuXHRcdFx0XHRwZXJmLm1hcmsoYGNvZGUvd2lsbEhhbmRsZUV4dGVuc2lvblBvaW50LyR7ZXh0ZW5zaW9uUG9pbnQubmFtZX1gKTtcblx0XHRcdFx0QWJzdHJhY3RFeHRlbnNpb25TZXJ2aWNlLl9oYW5kbGVFeHRlbnNpb25Qb2ludChleHRlbnNpb25Qb2ludCwgYXZhaWxhYmxlRXh0ZW5zaW9ucywgbWVzc2FnZUhhbmRsZXIpO1xuXHRcdFx0XHRwZXJmLm1hcmsoYGNvZGUvZGlkSGFuZGxlRXh0ZW5zaW9uUG9pbnQvJHtleHRlbnNpb25Qb2ludC5uYW1lfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRwZXJmLm1hcmsob25seVJlc29sdmVyRXh0ZW5zaW9uUG9pbnRzID8gJ2NvZGUvZGlkSGFuZGxlUmVzb2x2ZXJFeHRlbnNpb25Qb2ludHMnIDogJ2NvZGUvZGlkSGFuZGxlRXh0ZW5zaW9uUG9pbnRzJyk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPckNyZWF0ZUV4dGVuc2lvblN0YXR1cyhleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcik6IEV4dGVuc2lvblN0YXR1cyB7XG5cdFx0aWYgKCF0aGlzLl9leHRlbnNpb25TdGF0dXMuaGFzKGV4dGVuc2lvbklkKSkge1xuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uU3RhdHVzLnNldChleHRlbnNpb25JZCwgbmV3IEV4dGVuc2lvblN0YXR1cyhleHRlbnNpb25JZCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uU3RhdHVzLmdldChleHRlbnNpb25JZCkhO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlRXh0ZW5zaW9uUG9pbnRNZXNzYWdlKG1zZzogSU1lc3NhZ2UpIHtcblx0XHRjb25zdCBleHRlbnNpb25TdGF0dXMgPSB0aGlzLl9nZXRPckNyZWF0ZUV4dGVuc2lvblN0YXR1cyhtc2cuZXh0ZW5zaW9uSWQpO1xuXHRcdGV4dGVuc2lvblN0YXR1cy5hZGRNZXNzYWdlKG1zZyk7XG5cblx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLl9yZWdpc3RyeS5nZXRFeHRlbnNpb25EZXNjcmlwdGlvbihtc2cuZXh0ZW5zaW9uSWQpO1xuXHRcdGNvbnN0IHN0ck1zZyA9IGBbJHttc2cuZXh0ZW5zaW9uSWQudmFsdWV9XTogJHttc2cubWVzc2FnZX1gO1xuXG5cdFx0aWYgKG1zZy50eXBlID09PSBTZXZlcml0eS5FcnJvcikge1xuXHRcdFx0aWYgKGV4dGVuc2lvbiAmJiBleHRlbnNpb24uaXNVbmRlckRldmVsb3BtZW50KSB7XG5cdFx0XHRcdC8vIFRoaXMgbWVzc2FnZSBpcyBhYm91dCB0aGUgZXh0ZW5zaW9uIGN1cnJlbnRseSBiZWluZyBkZXZlbG9wZWRcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoeyBzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IHN0ck1zZyB9KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3Ioc3RyTXNnKTtcblx0XHR9IGVsc2UgaWYgKG1zZy50eXBlID09PSBTZXZlcml0eS5XYXJuaW5nKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uICYmIGV4dGVuc2lvbi5pc1VuZGVyRGV2ZWxvcG1lbnQpIHtcblx0XHRcdFx0Ly8gVGhpcyBtZXNzYWdlIGlzIGFib3V0IHRoZSBleHRlbnNpb24gY3VycmVudGx5IGJlaW5nIGRldmVsb3BlZFxuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7IHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLCBtZXNzYWdlOiBzdHJNc2cgfSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oc3RyTXNnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKHN0ck1zZyk7XG5cdFx0fVxuXG5cdFx0aWYgKG1zZy5leHRlbnNpb25JZCAmJiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCAmJiAhdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQpIHtcblx0XHRcdGNvbnN0IHsgdHlwZSwgZXh0ZW5zaW9uSWQsIGV4dGVuc2lvblBvaW50SWQsIG1lc3NhZ2UgfSA9IG1zZztcblx0XHRcdHR5cGUgRXh0ZW5zaW9uc01lc3NhZ2VDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0b3duZXI6ICdhbGV4ZGltYSc7XG5cdFx0XHRcdGNvbW1lbnQ6ICdBIHZhbGlkYXRpb24gbWVzc2FnZSBmb3IgYW4gZXh0ZW5zaW9uJztcblx0XHRcdFx0dHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1NldmVyaXR5IG9mIHByb2JsZW0uJyB9O1xuXHRcdFx0XHRleHRlbnNpb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBpZGVudGlmaWVyIG9mIHRoZSBleHRlbnNpb24gdGhhdCBoYXMgYSBwcm9ibGVtLicgfTtcblx0XHRcdFx0ZXh0ZW5zaW9uUG9pbnRJZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBleHRlbnNpb24gcG9pbnQgdGhhdCBoYXMgYSBwcm9ibGVtLicgfTtcblx0XHRcdFx0bWVzc2FnZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBtZXNzYWdlIG9mIHRoZSBwcm9ibGVtLicgfTtcblx0XHRcdH07XG5cdFx0XHR0eXBlIEV4dGVuc2lvbnNNZXNzYWdlRXZlbnQgPSB7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5O1xuXHRcdFx0XHRleHRlbnNpb25JZDogc3RyaW5nO1xuXHRcdFx0XHRleHRlbnNpb25Qb2ludElkOiBzdHJpbmc7XG5cdFx0XHRcdG1lc3NhZ2U6IHN0cmluZztcblx0XHRcdH07XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RXh0ZW5zaW9uc01lc3NhZ2VFdmVudCwgRXh0ZW5zaW9uc01lc3NhZ2VDbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbnNNZXNzYWdlJywge1xuXHRcdFx0XHR0eXBlLCBleHRlbnNpb25JZDogZXh0ZW5zaW9uSWQudmFsdWUsIGV4dGVuc2lvblBvaW50SWQsIG1lc3NhZ2Vcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9oYW5kbGVFeHRlbnNpb25Qb2ludDxUIGV4dGVuZHMgSUV4dGVuc2lvbkNvbnRyaWJ1dGlvbnNba2V5b2YgSUV4dGVuc2lvbkNvbnRyaWJ1dGlvbnNdPihleHRlbnNpb25Qb2ludDogRXh0ZW5zaW9uUG9pbnQ8VD4sIGF2YWlsYWJsZUV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCBtZXNzYWdlSGFuZGxlcjogKG1zZzogSU1lc3NhZ2UpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCB1c2VyczogSUV4dGVuc2lvblBvaW50VXNlcjxUPltdID0gW107XG5cdFx0Zm9yIChjb25zdCBkZXNjIG9mIGF2YWlsYWJsZUV4dGVuc2lvbnMpIHtcblx0XHRcdGlmIChkZXNjLmNvbnRyaWJ1dGVzICYmIGhhc093blByb3BlcnR5LmNhbGwoZGVzYy5jb250cmlidXRlcywgZXh0ZW5zaW9uUG9pbnQubmFtZSkpIHtcblx0XHRcdFx0dXNlcnMucHVzaCh7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGRlc2MsXG5cdFx0XHRcdFx0dmFsdWU6IGRlc2MuY29udHJpYnV0ZXNbZXh0ZW5zaW9uUG9pbnQubmFtZSBhcyBrZXlvZiB0eXBlb2YgZGVzYy5jb250cmlidXRlc10gYXMgVCxcblx0XHRcdFx0XHRjb2xsZWN0b3I6IG5ldyBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yKG1lc3NhZ2VIYW5kbGVyLCBkZXNjLCBleHRlbnNpb25Qb2ludC5uYW1lKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZXh0ZW5zaW9uUG9pbnQuYWNjZXB0VXNlcnModXNlcnMpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIENhbGxlZCBieSBleHRlbnNpb24gaG9zdFxuXG5cdHByaXZhdGUgX2FjcXVpcmVJbnRlcm5hbEFQSShleHRlbnNpb25Ib3N0OiBJRXh0ZW5zaW9uSG9zdCk6IElJbnRlcm5hbEV4dGVuc2lvblNlcnZpY2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRfYWN0aXZhdGVCeUlkOiAoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIHJlYXNvbjogRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbik6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fYWN0aXZhdGVCeUlkKGV4dGVuc2lvbklkLCByZWFzb24pO1xuXHRcdFx0fSxcblx0XHRcdF9vbldpbGxBY3RpdmF0ZUV4dGVuc2lvbjogKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyKTogdm9pZCA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9vbldpbGxBY3RpdmF0ZUV4dGVuc2lvbihleHRlbnNpb25JZCwgZXh0ZW5zaW9uSG9zdC5ydW5uaW5nTG9jYXRpb24pO1xuXHRcdFx0fSxcblx0XHRcdF9vbkRpZEFjdGl2YXRlRXh0ZW5zaW9uOiAoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGNvZGVMb2FkaW5nVGltZTogbnVtYmVyLCBhY3RpdmF0ZUNhbGxUaW1lOiBudW1iZXIsIGFjdGl2YXRlUmVzb2x2ZWRUaW1lOiBudW1iZXIsIGFjdGl2YXRpb25SZWFzb246IEV4dGVuc2lvbkFjdGl2YXRpb25SZWFzb24pOiB2b2lkID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX29uRGlkQWN0aXZhdGVFeHRlbnNpb24oZXh0ZW5zaW9uSWQsIGNvZGVMb2FkaW5nVGltZSwgYWN0aXZhdGVDYWxsVGltZSwgYWN0aXZhdGVSZXNvbHZlZFRpbWUsIGFjdGl2YXRpb25SZWFzb24pO1xuXHRcdFx0fSxcblx0XHRcdF9vbkRpZEFjdGl2YXRlRXh0ZW5zaW9uRXJyb3I6IChleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgZXJyb3I6IEVycm9yKTogdm9pZCA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9vbkRpZEFjdGl2YXRlRXh0ZW5zaW9uRXJyb3IoZXh0ZW5zaW9uSWQsIGVycm9yKTtcblx0XHRcdH0sXG5cdFx0XHRfb25FeHRlbnNpb25SdW50aW1lRXJyb3I6IChleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgZXJyOiBFcnJvcik6IHZvaWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fb25FeHRlbnNpb25SdW50aW1lRXJyb3IoZXh0ZW5zaW9uSWQsIGVycik7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBfYWN0aXZhdGVCeUlkKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCByZWFzb246IEV4dGVuc2lvbkFjdGl2YXRpb25SZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwoXG5cdFx0XHR0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMubWFwKG1hbmFnZXIgPT4gbWFuYWdlci5hY3RpdmF0ZShleHRlbnNpb25JZCwgcmVhc29uKSlcblx0XHQpO1xuXHRcdGNvbnN0IGFjdGl2YXRlZCA9IHJlc3VsdHMuc29tZShlID0+IGUpO1xuXHRcdGlmICghYWN0aXZhdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uSWQudmFsdWV9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25XaWxsQWN0aXZhdGVFeHRlbnNpb24oZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIHJ1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fcnVubmluZ0xvY2F0aW9ucy5zZXQoZXh0ZW5zaW9uSWQsIHJ1bm5pbmdMb2NhdGlvbik7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU3RhdHVzID0gdGhpcy5fZ2V0T3JDcmVhdGVFeHRlbnNpb25TdGF0dXMoZXh0ZW5zaW9uSWQpO1xuXHRcdGV4dGVuc2lvblN0YXR1cy5vbldpbGxBY3RpdmF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRBY3RpdmF0ZUV4dGVuc2lvbihleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgY29kZUxvYWRpbmdUaW1lOiBudW1iZXIsIGFjdGl2YXRlQ2FsbFRpbWU6IG51bWJlciwgYWN0aXZhdGVSZXNvbHZlZFRpbWU6IG51bWJlciwgYWN0aXZhdGlvblJlYXNvbjogRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbik6IHZvaWQge1xuXHRcdGNvbnN0IGV4dGVuc2lvblN0YXR1cyA9IHRoaXMuX2dldE9yQ3JlYXRlRXh0ZW5zaW9uU3RhdHVzKGV4dGVuc2lvbklkKTtcblx0XHRleHRlbnNpb25TdGF0dXMuc2V0QWN0aXZhdGlvblRpbWVzKG5ldyBBY3RpdmF0aW9uVGltZXMoY29kZUxvYWRpbmdUaW1lLCBhY3RpdmF0ZUNhbGxUaW1lLCBhY3RpdmF0ZVJlc29sdmVkVGltZSwgYWN0aXZhdGlvblJlYXNvbikpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRXh0ZW5zaW9uc1N0YXR1cy5maXJlKFtleHRlbnNpb25JZF0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRBY3RpdmF0ZUV4dGVuc2lvbkVycm9yKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBlcnJvcjogRXJyb3IpOiB2b2lkIHtcblx0XHR0eXBlIEV4dGVuc2lvbkFjdGl2YXRpb25FcnJvckNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdhbGV4ZGltYSc7XG5cdFx0XHRjb21tZW50OiAnQW4gZXh0ZW5zaW9uIGZhaWxlZCB0byBhY3RpdmF0ZSc7XG5cdFx0XHRleHRlbnNpb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBpZGVudGlmaWVyIG9mIHRoZSBleHRlbnNpb24uJyB9O1xuXHRcdFx0ZXJyb3I6IHsgY2xhc3NpZmljYXRpb246ICdDYWxsc3RhY2tPckV4Y2VwdGlvbic7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgZXJyb3IgbWVzc2FnZS4nIH07XG5cdFx0fTtcblx0XHR0eXBlIEV4dGVuc2lvbkFjdGl2YXRpb25FcnJvckV2ZW50ID0ge1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0XHRcdGVycm9yOiBzdHJpbmc7XG5cdFx0fTtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RXh0ZW5zaW9uQWN0aXZhdGlvbkVycm9yRXZlbnQsIEV4dGVuc2lvbkFjdGl2YXRpb25FcnJvckNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uQWN0aXZhdGlvbkVycm9yJywge1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbklkLnZhbHVlLFxuXHRcdFx0ZXJyb3I6IGVycm9yLm1lc3NhZ2Vcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX29uRXh0ZW5zaW9uUnVudGltZUVycm9yKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBlcnI6IEVycm9yKTogdm9pZCB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU3RhdHVzID0gdGhpcy5fZ2V0T3JDcmVhdGVFeHRlbnNpb25TdGF0dXMoZXh0ZW5zaW9uSWQpO1xuXHRcdGV4dGVuc2lvblN0YXR1cy5hZGRSdW50aW1lRXJyb3IoZXJyKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnNTdGF0dXMuZmlyZShbZXh0ZW5zaW9uSWRdKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlcG9ydFByb3Bvc2VkQXBpVXNhZ2UodXNhZ2U6IElQcm9wb3NlZEFwaVVzYWdlKTogdm9pZCB7XG5cdFx0dHlwZSBQcm9wb3NlZEFwaVVzYWdlQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2FsZXhyMDAnO1xuXHRcdFx0Y29tbWVudDogJ0FuIGV4dGVuc2lvbiBhdHRlbXB0ZWQgdG8gdXNlIGEgcHJvcG9zZWQgQVBJIGl0IGhhcyBub3QgYmVlbiBhbGxvd2xpc3RlZCB0byB1c2UuJztcblx0XHRcdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIGV4dGVuc2lvbiBhdHRlbXB0aW5nIHRvIHVzZSB0aGUgcHJvcG9zZWQgQVBJLicgfTtcblx0XHRcdHByb3Bvc2FsTmFtZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBuYW1lIG9mIHRoZSBwcm9wb3NlZCBBUEkgdGhlIGV4dGVuc2lvbiBpcyBub3QgZW50aXRsZWQgdG8gdXNlLicgfTtcblx0XHR9O1xuXHRcdHR5cGUgUHJvcG9zZWRBcGlVc2FnZUV2ZW50ID0ge1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0XHRcdHByb3Bvc2FsTmFtZTogc3RyaW5nO1xuXHRcdH07XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFByb3Bvc2VkQXBpVXNhZ2VFdmVudCwgUHJvcG9zZWRBcGlVc2FnZUNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uUHJvcG9zZWRBcGlOb3RFbmFibGVkJywge1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHVzYWdlLmV4dGVuc2lvbklkLFxuXHRcdFx0cHJvcG9zYWxOYW1lOiB1c2FnZS5wcm9wb3NhbE5hbWVcblx0XHR9KTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfcmVzb2x2ZUV4dGVuc2lvbnMoKTogQXN5bmNJdGVyYWJsZTxSZXNvbHZlZEV4dGVuc2lvbnM+O1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX29uRXh0ZW5zaW9uSG9zdEV4aXQoY29kZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IF9yZXNvbHZlQXV0aG9yaXR5KHJlbW90ZUF1dGhvcml0eTogc3RyaW5nKTogUHJvbWlzZTxSZXNvbHZlclJlc3VsdD47XG59XG5cbmNsYXNzIEV4dGVuc2lvbkhvc3RDb2xsZWN0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfZXh0ZW5zaW9uSG9zdE1hbmFnZXJzOiBFeHRlbnNpb25Ib3N0TWFuYWdlckRhdGFbXSA9IFtdO1xuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IG1hbmFnZXIgPSB0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnNbaV07XG5cdFx0XHRtYW5hZ2VyLmV4dGVuc2lvbkhvc3QuZGlzY29ubmVjdCgpO1xuXHRcdFx0bWFuYWdlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2VycyA9IFtdO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyBhZGQoZXh0ZW5zaW9uSG9zdE1hbmFnZXI6IElFeHRlbnNpb25Ib3N0TWFuYWdlciwgZGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHR0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMucHVzaChuZXcgRXh0ZW5zaW9uSG9zdE1hbmFnZXJEYXRhKGV4dGVuc2lvbkhvc3RNYW5hZ2VyLCBkaXNwb3NhYmxlU3RvcmUpKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzdG9wQWxsSW5SZXZlcnNlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTUyMjA0XG5cdFx0Ly8gRGlzcG9zZSBleHRlbnNpb24gaG9zdHMgaW4gcmV2ZXJzZSBjcmVhdGlvbiBvcmRlciBiZWNhdXNlIHRoZSBsb2NhbCBleHRlbnNpb24gaG9zdFxuXHRcdC8vIG1pZ2h0IGJlIGNyaXRpY2FsIGluIHN1c3RhaW5pbmcgYSBjb25uZWN0aW9uIHRvIHRoZSByZW1vdGUgZXh0ZW5zaW9uIGhvc3Rcblx0XHRmb3IgKGxldCBpID0gdGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBtYW5hZ2VyID0gdGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzW2ldO1xuXHRcdFx0YXdhaXQgbWFuYWdlci5leHRlbnNpb25Ib3N0LmRpc2Nvbm5lY3QoKTtcblx0XHRcdG1hbmFnZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMgPSBbXTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzdG9wT25lKGV4dGVuc2lvbkhvc3RNYW5hZ2VyOiBJRXh0ZW5zaW9uSG9zdE1hbmFnZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2Vycy5maW5kSW5kZXgoZWwgPT4gZWwuZXh0ZW5zaW9uSG9zdCA9PT0gZXh0ZW5zaW9uSG9zdE1hbmFnZXIpO1xuXHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHR0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdGF3YWl0IGV4dGVuc2lvbkhvc3RNYW5hZ2VyLmRpc2Nvbm5lY3QoKTtcblx0XHRcdGV4dGVuc2lvbkhvc3RNYW5hZ2VyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0QnlLaW5kKGtpbmQ6IEV4dGVuc2lvbkhvc3RLaW5kKTogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyW10ge1xuXHRcdHJldHVybiB0aGlzLmZpbHRlcihlbCA9PiBlbC5raW5kID09PSBraW5kKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRCeVJ1bm5pbmdMb2NhdGlvbihydW5uaW5nTG9jYXRpb246IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbik6IElFeHRlbnNpb25Ib3N0TWFuYWdlciB8IG51bGwge1xuXHRcdGZvciAoY29uc3QgZWwgb2YgdGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzKSB7XG5cdFx0XHRpZiAoZWwuZXh0ZW5zaW9uSG9zdC5yZXByZXNlbnRzUnVubmluZ0xvY2F0aW9uKHJ1bm5pbmdMb2NhdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIGVsLmV4dGVuc2lvbkhvc3Q7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0KltTeW1ib2wuaXRlcmF0b3JdKCkge1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uSG9zdE1hbmFnZXIgb2YgdGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzKSB7XG5cdFx0XHR5aWVsZCBleHRlbnNpb25Ib3N0TWFuYWdlci5leHRlbnNpb25Ib3N0O1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBtYXA8VD4oY2FsbGJhY2s6IChleHRIb3N0TWFuYWdlcjogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyKSA9PiBUKTogVFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLm1hcChlbCA9PiBjYWxsYmFjayhlbC5leHRlbnNpb25Ib3N0KSk7XG5cdH1cblxuXHRwdWJsaWMgZXZlcnkoY2FsbGJhY2s6IChleHRIb3N0TWFuYWdlcjogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyKSA9PiB1bmtub3duKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2Vycy5ldmVyeShlbCA9PiBjYWxsYmFjayhlbC5leHRlbnNpb25Ib3N0KSk7XG5cdH1cblxuXHRwdWJsaWMgZmlsdGVyKGNhbGxiYWNrOiAoZXh0SG9zdE1hbmFnZXI6IElFeHRlbnNpb25Ib3N0TWFuYWdlcikgPT4gdW5rbm93bik6IElFeHRlbnNpb25Ib3N0TWFuYWdlcltdIHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLmZpbHRlcihlbCA9PiBjYWxsYmFjayhlbC5leHRlbnNpb25Ib3N0KSkubWFwKGVsID0+IGVsLmV4dGVuc2lvbkhvc3QpO1xuXHR9XG59XG5cbmNsYXNzIEV4dGVuc2lvbkhvc3RNYW5hZ2VyRGF0YSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBleHRlbnNpb25Ib3N0OiBJRXh0ZW5zaW9uSG9zdE1hbmFnZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGRpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlXG5cdCkgeyB9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlU3RvcmUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uSG9zdC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlc29sdmVyRXh0ZW5zaW9ucyB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBleHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSxcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIExvY2FsRXh0ZW5zaW9ucyB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBleHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSxcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlbW90ZUV4dGVuc2lvbnMge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgZXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sXG5cdCkgeyB9XG59XG5cbmV4cG9ydCB0eXBlIFJlc29sdmVkRXh0ZW5zaW9ucyA9IFJlc29sdmVyRXh0ZW5zaW9ucyB8IExvY2FsRXh0ZW5zaW9ucyB8IFJlbW90ZUV4dGVuc2lvbnM7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvbkhvc3RGYWN0b3J5IHtcblx0Y3JlYXRlRXh0ZW5zaW9uSG9zdChydW5uaW5nTG9jYXRpb25zOiBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb25UcmFja2VyLCBydW5uaW5nTG9jYXRpb246IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiwgaXNJbml0aWFsU3RhcnQ6IGJvb2xlYW4pOiBJRXh0ZW5zaW9uSG9zdCB8IG51bGw7XG59XG5cbmNsYXNzIERlbHRhRXh0ZW5zaW9uc1F1ZXVlSXRlbSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB0b0FkZDogSUV4dGVuc2lvbltdLFxuXHRcdHB1YmxpYyByZWFkb25seSB0b1JlbW92ZTogc3RyaW5nW10gfCBJRXh0ZW5zaW9uW11cblx0KSB7IH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUmVzb2x2ZXJFeHRlbnNpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBib29sZWFuIHtcblx0cmV0dXJuICEhZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHM/LnNvbWUoYWN0aXZhdGlvbkV2ZW50ID0+IGFjdGl2YXRpb25FdmVudC5zdGFydHNXaXRoKCdvblJlc29sdmVSZW1vdGVBdXRob3JpdHk6JykpO1xufVxuXG4vKipcbiAqIEBhcmd1bWVudCBleHRlbnNpb25zIFRoZSBleHRlbnNpb25zIHRvIGJlIGNoZWNrZWQuXG4gKiBAYXJndW1lbnQgaWdub3JlV29ya3NwYWNlVHJ1c3QgRG8gbm90IHRha2Ugd29ya3NwYWNlIHRydXN0IGludG8gYWNjb3VudC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrRW5hYmxlZEFuZFByb3Bvc2VkQVBJKGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBleHRlbnNpb25zUHJvcG9zZWRBcGk6IEV4dGVuc2lvbnNQcm9wb3NlZEFwaSwgZXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIGlnbm9yZVdvcmtzcGFjZVRydXN0OiBib29sZWFuKTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10ge1xuXHQvLyBlbmFibGUgb3IgZGlzYWJsZSBwcm9wb3NlZCBBUEkgcGVyIGV4dGVuc2lvblxuXHRleHRlbnNpb25zUHJvcG9zZWRBcGkudXBkYXRlRW5hYmxlZEFwaVByb3Bvc2FscyhleHRlbnNpb25zKTtcblxuXHQvLyBrZWVwIG9ubHkgZW5hYmxlZCBleHRlbnNpb25zXG5cdHJldHVybiBmaWx0ZXJFbmFibGVkRXh0ZW5zaW9ucyhsb2dTZXJ2aWNlLCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgZXh0ZW5zaW9ucywgaWdub3JlV29ya3NwYWNlVHJ1c3QpO1xufVxuXG4vKipcbiAqIFJldHVybiB0aGUgc3Vic2V0IG9mIGV4dGVuc2lvbnMgdGhhdCBhcmUgZW5hYmxlZC5cbiAqIEBhcmd1bWVudCBpZ25vcmVXb3Jrc3BhY2VUcnVzdCBEbyBub3QgdGFrZSB3b3Jrc3BhY2UgdHJ1c3QgaW50byBhY2NvdW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZmlsdGVyRW5hYmxlZEV4dGVuc2lvbnMobG9nU2VydmljZTogSUxvZ1NlcnZpY2UsIGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIGV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCBpZ25vcmVXb3Jrc3BhY2VUcnVzdDogYm9vbGVhbik6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdIHtcblx0Y29uc3QgZW5hYmxlZEV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdID0gW10sIGV4dGVuc2lvbnNUb0NoZWNrOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSA9IFtdLCBtYXBwZWRFeHRlbnNpb25zOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdGlmIChleHRlbnNpb24uaXNVbmRlckRldmVsb3BtZW50KSB7XG5cdFx0XHQvLyBOZXZlciBkaXNhYmxlIGV4dGVuc2lvbnMgdW5kZXIgZGV2ZWxvcG1lbnRcblx0XHRcdGVuYWJsZWRFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZXh0ZW5zaW9uc1RvQ2hlY2sucHVzaChleHRlbnNpb24pO1xuXHRcdFx0bWFwcGVkRXh0ZW5zaW9ucy5wdXNoKHRvRXh0ZW5zaW9uKGV4dGVuc2lvbikpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGVuYWJsZW1lbnRTdGF0ZXMgPSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXRFbmFibGVtZW50U3RhdGVzKG1hcHBlZEV4dGVuc2lvbnMsIGlnbm9yZVdvcmtzcGFjZVRydXN0ID8geyB0cnVzdGVkOiB0cnVlIH0gOiB1bmRlZmluZWQpO1xuXHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgZW5hYmxlbWVudFN0YXRlcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRpZiAoZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKGVuYWJsZW1lbnRTdGF0ZXNbaW5kZXhdKSkge1xuXHRcdFx0ZW5hYmxlZEV4dGVuc2lvbnMucHVzaChleHRlbnNpb25zVG9DaGVja1tpbmRleF0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLmluZm8oYGZpbHRlckVuYWJsZWRFeHRlbnNpb25zOiBleHRlbnNpb24gJyR7ZXh0ZW5zaW9uc1RvQ2hlY2tbaW5kZXhdLmlkZW50aWZpZXIudmFsdWV9JyBpcyBkaXNhYmxlZGApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBlbmFibGVkRXh0ZW5zaW9ucztcbn1cblxuLyoqXG4gKiBAYXJndW1lbnQgZXh0ZW5zaW9uIFRoZSBleHRlbnNpb24gdG8gYmUgY2hlY2tlZC5cbiAqIEBhcmd1bWVudCBpZ25vcmVXb3Jrc3BhY2VUcnVzdCBEbyBub3QgdGFrZSB3b3Jrc3BhY2UgdHJ1c3QgaW50byBhY2NvdW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZXh0ZW5zaW9uSXNFbmFibGVkKGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWdub3JlV29ya3NwYWNlVHJ1c3Q6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0cmV0dXJuIGZpbHRlckVuYWJsZWRFeHRlbnNpb25zKGxvZ1NlcnZpY2UsIGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBbZXh0ZW5zaW9uXSwgaWdub3JlV29ya3NwYWNlVHJ1c3QpLmluY2x1ZGVzKGV4dGVuc2lvbik7XG59XG5cbmZ1bmN0aW9uIGluY2x1ZGVzKGV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCBpZGVudGlmaWVyOiBFeHRlbnNpb25JZGVudGlmaWVyKTogYm9vbGVhbiB7XG5cdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRpZiAoRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGlkZW50aWZpZXIpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uU3RhdHVzIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlczogSU1lc3NhZ2VbXSA9IFtdO1xuXHRwdWJsaWMgZ2V0IG1lc3NhZ2VzKCk6IElNZXNzYWdlW10ge1xuXHRcdHJldHVybiB0aGlzLl9tZXNzYWdlcztcblx0fVxuXG5cdHByaXZhdGUgX2FjdGl2YXRpb25UaW1lczogQWN0aXZhdGlvblRpbWVzIHwgbnVsbCA9IG51bGw7XG5cdHB1YmxpYyBnZXQgYWN0aXZhdGlvblRpbWVzKCk6IEFjdGl2YXRpb25UaW1lcyB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmF0aW9uVGltZXM7XG5cdH1cblxuXHRwcml2YXRlIF9ydW50aW1lRXJyb3JzOiBFcnJvcltdID0gW107XG5cdHB1YmxpYyBnZXQgcnVudGltZUVycm9ycygpOiBFcnJvcltdIHtcblx0XHRyZXR1cm4gdGhpcy5fcnVudGltZUVycm9ycztcblx0fVxuXG5cdHByaXZhdGUgX2FjdGl2YXRpb25TdGFydGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHB1YmxpYyBnZXQgYWN0aXZhdGlvblN0YXJ0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2YXRpb25TdGFydGVkO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGlkOiBFeHRlbnNpb25JZGVudGlmaWVyLFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBjbGVhclJ1bnRpbWVTdGF0dXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZhdGlvblN0YXJ0ZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9hY3RpdmF0aW9uVGltZXMgPSBudWxsO1xuXHRcdHRoaXMuX3J1bnRpbWVFcnJvcnMgPSBbXTtcblx0fVxuXG5cdHB1YmxpYyBhZGRNZXNzYWdlKG1zZzogSU1lc3NhZ2UpOiB2b2lkIHtcblx0XHR0aGlzLl9tZXNzYWdlcy5wdXNoKG1zZyk7XG5cdH1cblxuXHRwdWJsaWMgc2V0QWN0aXZhdGlvblRpbWVzKGFjdGl2YXRpb25UaW1lczogQWN0aXZhdGlvblRpbWVzKSB7XG5cdFx0dGhpcy5fYWN0aXZhdGlvblRpbWVzID0gYWN0aXZhdGlvblRpbWVzO1xuXHR9XG5cblx0cHVibGljIGFkZFJ1bnRpbWVFcnJvcihlcnI6IEVycm9yKTogdm9pZCB7XG5cdFx0dGhpcy5fcnVudGltZUVycm9ycy5wdXNoKGVycik7XG5cdH1cblxuXHRwdWJsaWMgb25XaWxsQWN0aXZhdGUoKSB7XG5cdFx0dGhpcy5fYWN0aXZhdGlvblN0YXJ0ZWQgPSB0cnVlO1xuXHR9XG59XG5cbmludGVyZmFjZSBJRXh0ZW5zaW9uSG9zdENyYXNoSW5mbyB7XG5cdHRpbWVzdGFtcDogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uSG9zdENyYXNoVHJhY2tlciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX1RJTUVfTElNSVQgPSA1ICogNjAgKiAxMDAwOyAvLyA1IG1pbnV0ZXNcblx0cHJpdmF0ZSBzdGF0aWMgX0NSQVNIX0xJTUlUID0gMztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWNlbnRDcmFzaGVzOiBJRXh0ZW5zaW9uSG9zdENyYXNoSW5mb1tdID0gW107XG5cblx0cHJpdmF0ZSBfcmVtb3ZlT2xkQ3Jhc2hlcygpOiB2b2lkIHtcblx0XHRjb25zdCBsaW1pdCA9IERhdGUubm93KCkgLSBFeHRlbnNpb25Ib3N0Q3Jhc2hUcmFja2VyLl9USU1FX0xJTUlUO1xuXHRcdHdoaWxlICh0aGlzLl9yZWNlbnRDcmFzaGVzLmxlbmd0aCA+IDAgJiYgdGhpcy5fcmVjZW50Q3Jhc2hlc1swXS50aW1lc3RhbXAgPCBsaW1pdCkge1xuXHRcdFx0dGhpcy5fcmVjZW50Q3Jhc2hlcy5zaGlmdCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlckNyYXNoKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbW92ZU9sZENyYXNoZXMoKTtcblx0XHR0aGlzLl9yZWNlbnRDcmFzaGVzLnB1c2goeyB0aW1lc3RhbXA6IERhdGUubm93KCkgfSk7XG5cdH1cblxuXHRwdWJsaWMgc2hvdWxkQXV0b21hdGljYWxseVJlc3RhcnQoKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fcmVtb3ZlT2xkQ3Jhc2hlcygpO1xuXHRcdHJldHVybiAodGhpcy5fcmVjZW50Q3Jhc2hlcy5sZW5ndGggPCBFeHRlbnNpb25Ib3N0Q3Jhc2hUcmFja2VyLl9DUkFTSF9MSU1JVCk7XG5cdH1cbn1cblxuLyoqXG4gKiBUaGlzIGNhbiBydW4gY29ycmVjdGx5IG9ubHkgb24gdGhlIHJlbmRlcmVyIHByb2Nlc3MgYmVjYXVzZSB0aGF0IGlzIHRoZSBvbmx5IHBsYWNlXG4gKiB3aGVyZSBhbGwgZXh0ZW5zaW9uIHBvaW50cyBhbmQgYWxsIGltcGxpY2l0IGFjdGl2YXRpb24gZXZlbnRzIGdlbmVyYXRvcnMgYXJlIGtub3duLlxuICovXG5leHBvcnQgY2xhc3MgSW1wbGljaXRBY3RpdmF0aW9uQXdhcmVSZWFkZXIgaW1wbGVtZW50cyBJQWN0aXZhdGlvbkV2ZW50c1JlYWRlciB7XG5cdHB1YmxpYyByZWFkQWN0aXZhdGlvbkV2ZW50cyhleHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBJbXBsaWNpdEFjdGl2YXRpb25FdmVudHMucmVhZEFjdGl2YXRpb25FdmVudHMoZXh0ZW5zaW9uRGVzY3JpcHRpb24pO1xuXHR9XG59XG5cbmNsYXNzIEFjdGl2YXRpb25GZWF0dXJlTWFya2Rvd25lUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkZlYXR1cmVNYXJrZG93blJlbmRlcmVyIHtcblxuXHRyZWFkb25seSB0eXBlID0gJ21hcmtkb3duJztcblxuXHRzaG91bGRSZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIW1hbmlmZXN0LmFjdGl2YXRpb25FdmVudHM7XG5cdH1cblxuXHRyZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElSZW5kZXJlZERhdGE8SU1hcmtkb3duU3RyaW5nPiB7XG5cdFx0Y29uc3QgYWN0aXZhdGlvbkV2ZW50cyA9IG1hbmlmZXN0LmFjdGl2YXRpb25FdmVudHMgfHwgW107XG5cdFx0Y29uc3QgZGF0YSA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXHRcdGlmIChhY3RpdmF0aW9uRXZlbnRzLmxlbmd0aCkge1xuXHRcdFx0Zm9yIChjb25zdCBhY3RpdmF0aW9uRXZlbnQgb2YgYWN0aXZhdGlvbkV2ZW50cykge1xuXHRcdFx0XHRkYXRhLmFwcGVuZE1hcmtkb3duKGAtIFxcYCR7YWN0aXZhdGlvbkV2ZW50fVxcYFxcbmApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbkZlYXR1cmVzRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5yZWdpc3RlckV4dGVuc2lvbkZlYXR1cmUoe1xuXHRpZDogJ2FjdGl2YXRpb25FdmVudHMnLFxuXHRsYWJlbDogbmxzLmxvY2FsaXplKCdhY3RpdmF0aW9uJywgXCJBY3RpdmF0aW9uIEV2ZW50c1wiKSxcblx0YWNjZXNzOiB7XG5cdFx0Y2FuVG9nZ2xlOiBmYWxzZVxuXHR9LFxuXHRyZW5kZXJlcjogbmV3IFN5bmNEZXNjcmlwdG9yKEFjdGl2YXRpb25GZWF0dXJlTWFya2Rvd25lUmVuZGVyZXIpLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztB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
