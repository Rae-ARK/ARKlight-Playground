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
import * as nls from "../../../nls.js";
import * as path from "../../../base/common/path.js";
import * as performance from "../../../base/common/performance.js";
import { originalFSPath, joinPath, extUriBiasedIgnorePathCase } from "../../../base/common/resources.js";
import { asPromise, Barrier, IntervalTimer, timeout } from "../../../base/common/async.js";
import { dispose, toDisposable, Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { TernarySearchTree } from "../../../base/common/ternarySearchTree.js";
import { URI } from "../../../base/common/uri.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { MainContext } from "./extHost.protocol.js";
import { IExtHostConfiguration } from "./extHostConfiguration.js";
import { ActivatedExtension, EmptyExtension, ExtensionActivationTimes, ExtensionActivationTimesBuilder, ExtensionsActivator, HostExtension } from "./extHostExtensionActivator.js";
import { ExtHostStorage, IExtHostStorage } from "./extHostStorage.js";
import { IExtHostWorkspace } from "./extHostWorkspace.js";
import { ActivationKind, checkProposedApiEnabled, isProposedApiEnabled, setProposedApiUsageReporter, setEnabledApiProposalsFallbackExperiment } from "../../services/extensions/common/extensions.js";
import { ExtensionDescriptionRegistry } from "../../services/extensions/common/extensionDescriptionRegistry.js";
import * as errors from "../../../base/common/errors.js";
import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionIdentifierSet } from "../../../platform/extensions/common/extensions.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { ExtensionGlobalMemento, ExtensionMemento } from "./extHostMemento.js";
import { RemoteAuthorityResolverError, ExtensionKind, ExtensionMode, ManagedResolvedAuthority as ExtHostManagedResolvedAuthority } from "./extHostTypes.js";
import { RemoteAuthorityResolverErrorCode, getRemoteAuthorityPrefix, ManagedRemoteConnection, WebSocketRemoteConnection } from "../../../platform/remote/common/remoteAuthorityResolver.js";
import { IInstantiationService, createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
import { IExtensionStoragePaths } from "./extHostStoragePaths.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { ServiceCollection } from "../../../platform/instantiation/common/serviceCollection.js";
import { IExtHostTunnelService } from "./extHostTunnelService.js";
import { IExtHostTerminalService } from "./extHostTerminalService.js";
import { IExtHostLanguageModels } from "./extHostLanguageModels.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { checkActivateWorkspaceContainsExtension } from "../../services/extensions/common/workspaceContains.js";
import { ExtHostSecretState, IExtHostSecretState } from "./extHostSecretState.js";
import { ExtensionSecrets } from "./extHostSecrets.js";
import { Schemas } from "../../../base/common/network.js";
import { IExtHostLocalizationService } from "./extHostLocalizationService.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { isCI, setTimeout0 } from "../../../base/common/platform.js";
import { IExtHostManagedSockets } from "./extHostManagedSockets.js";
const IHostUtils = createDecorator("IHostUtils");
let AbstractExtHostExtensionService = class extends Disposable {
  constructor(instaService, hostUtils, extHostContext, extHostWorkspace, extHostConfiguration, logService, initData, storagePath, extHostTunnelService, extHostTerminalService, extHostLocalizationService, _extHostManagedSockets, _extHostLanguageModels) {
    super();
    this._extHostManagedSockets = _extHostManagedSockets;
    this._extHostLanguageModels = _extHostLanguageModels;
    this._onDidChangeRemoteConnectionData = this._register(new Emitter());
    this.onDidChangeRemoteConnectionData = this._onDidChangeRemoteConnectionData.event;
    this._realPathCache = /* @__PURE__ */ new Map();
    this._isTerminating = false;
    this._hostUtils = hostUtils;
    this._extHostContext = extHostContext;
    this._initData = initData;
    this._extHostWorkspace = extHostWorkspace;
    this._extHostConfiguration = extHostConfiguration;
    this._logService = logService;
    this._extHostTunnelService = extHostTunnelService;
    this._extHostTerminalService = extHostTerminalService;
    this._extHostLocalizationService = extHostLocalizationService;
    this._mainThreadWorkspaceProxy = this._extHostContext.getProxy(MainContext.MainThreadWorkspace);
    this._mainThreadTelemetryProxy = this._extHostContext.getProxy(MainContext.MainThreadTelemetry);
    this._mainThreadExtensionsProxy = this._extHostContext.getProxy(MainContext.MainThreadExtensionService);
    this._almostReadyToRunExtensions = new Barrier();
    this._readyToStartExtensionHost = new Barrier();
    this._readyToRunExtensions = new Barrier();
    this._eagerExtensionsActivated = new Barrier();
    this._activationEventsReader = new SyncedActivationEventsReader(this._initData.extensions.activationEvents);
    this._globalRegistry = new ExtensionDescriptionRegistry(this._activationEventsReader, this._initData.extensions.allExtensions);
    const myExtensionsSet = new ExtensionIdentifierSet(this._initData.extensions.myExtensions);
    this._myRegistry = new ExtensionDescriptionRegistry(
      this._activationEventsReader,
      filterExtensions(this._globalRegistry, myExtensionsSet)
    );
    if (isCI) {
      this._logService.info(`Creating extension host with the following global extensions: ${printExtIds(this._globalRegistry)}`);
      this._logService.info(`Creating extension host with the following local extensions: ${printExtIds(this._myRegistry)}`);
    }
    this._storage = new ExtHostStorage(this._extHostContext, this._logService);
    this._secretState = new ExtHostSecretState(this._extHostContext);
    this._storagePath = storagePath;
    this._instaService = this._store.add(instaService.createChild(new ServiceCollection(
      [IExtHostStorage, this._storage],
      [IExtHostSecretState, this._secretState]
    )));
    this._activator = this._register(new ExtensionsActivator(
      this._myRegistry,
      this._globalRegistry,
      {
        onExtensionActivationError: (extensionId, error, missingExtensionDependency) => {
          this._mainThreadExtensionsProxy.$onExtensionActivationError(extensionId, errors.transformErrorForSerialization(error), missingExtensionDependency);
        },
        actualActivateExtension: async (extensionId, reason) => {
          if (ExtensionDescriptionRegistry.isHostExtension(extensionId, this._myRegistry, this._globalRegistry)) {
            await this._mainThreadExtensionsProxy.$activateExtension(extensionId, reason);
            return new HostExtension();
          }
          const extensionDescription = this._myRegistry.getExtensionDescription(extensionId);
          return this._activateExtension(extensionDescription, reason);
        }
      },
      this._logService
    ));
    this._extensionPathIndex = null;
    this._resolvers = /* @__PURE__ */ Object.create(null);
    this._started = false;
    this._remoteConnectionData = this._initData.remote.connectionData;
    this._register(setProposedApiUsageReporter((usage) => this._reportProposedApiUsage(usage)));
    this._register(setEnabledApiProposalsFallbackExperiment(this._initData.enabledApiProposalsFallback, this._initData.quality));
  }
  _reportProposedApiUsage(usage) {
    this._mainThreadTelemetryProxy.$publicLog2("extensionProposedApiNotEnabled", {
      extensionId: usage.extensionId,
      proposalName: usage.proposalName
    });
  }
  getRemoteConnectionData() {
    return this._remoteConnectionData;
  }
  async initialize() {
    try {
      await this._beforeAlmostReadyToRunExtensions();
      this._almostReadyToRunExtensions.open();
      await this._extHostWorkspace.waitForInitializeCall();
      performance.mark("code/extHost/ready");
      this._readyToStartExtensionHost.open();
      if (this._initData.autoStart) {
        this._startExtensionHost();
      }
    } catch (err) {
      errors.onUnexpectedError(err);
    }
  }
  async _deactivateAll() {
    this._storagePath.onWillDeactivateAll();
    let allPromises = [];
    try {
      const allExtensions = this._myRegistry.getAllExtensionDescriptions();
      const allExtensionsIds = allExtensions.map((ext) => ext.identifier);
      const activatedExtensions = allExtensionsIds.filter((id) => this.isActivated(id));
      allPromises = activatedExtensions.map((extensionId) => {
        return this._deactivate(extensionId);
      });
    } catch (err) {
    }
    await Promise.all(allPromises);
  }
  terminate(reason, code = 0) {
    if (this._isTerminating) {
      return;
    }
    this._isTerminating = true;
    this._logService.info(`Extension host terminating: ${reason}`);
    this._logService.flush();
    this._extHostTerminalService.dispose();
    this._activator.dispose();
    errors.setUnexpectedErrorHandler((err) => {
      this._logService.error(err);
    });
    this._extHostContext.dispose();
    const extensionsDeactivated = this._deactivateAll();
    Promise.race([timeout(5e3), extensionsDeactivated]).finally(() => {
      if (this._hostUtils.pid) {
        this._logService.info(`Extension host with pid ${this._hostUtils.pid} exiting with code ${code}`);
      } else {
        this._logService.info(`Extension host exiting with code ${code}`);
      }
      this._logService.flush();
      this._logService.dispose();
      this._hostUtils.exit(code);
    });
  }
  isActivated(extensionId) {
    if (this._readyToRunExtensions.isOpen()) {
      return this._activator.isActivated(extensionId);
    }
    return false;
  }
  async getExtension(extensionId) {
    const ext = await this._mainThreadExtensionsProxy.$getExtension(extensionId);
    return ext && {
      ...ext,
      identifier: new ExtensionIdentifier(ext.identifier.value),
      extensionLocation: URI.revive(ext.extensionLocation)
    };
  }
  _activateByEvent(activationEvent, startup) {
    return this._activator.activateByEvent(activationEvent, startup);
  }
  _activateById(extensionId, reason) {
    return this._activator.activateById(extensionId, reason);
  }
  activateByIdWithErrors(extensionId, reason) {
    return this._activateById(extensionId, reason).then(() => {
      const extension = this._activator.getActivatedExtension(extensionId);
      if (extension.activationFailed) {
        return Promise.reject(extension.activationFailedError);
      }
      return void 0;
    });
  }
  getExtensionRegistry() {
    return this._readyToRunExtensions.wait().then((_) => this._myRegistry);
  }
  getExtensionExports(extensionId) {
    if (this._readyToRunExtensions.isOpen()) {
      return this._activator.getActivatedExtension(extensionId).exports;
    } else {
      try {
        return this._activator.getActivatedExtension(extensionId).exports;
      } catch (err) {
        return null;
      }
    }
  }
  /**
   * Applies realpath to file-uris and returns all others uris unmodified.
   * The real path is cached for the lifetime of the extension host.
   */
  async _realPathExtensionUri(uri) {
    if (uri.scheme === Schemas.file && this._hostUtils.fsRealpath) {
      const fsPath = uri.fsPath;
      if (!this._realPathCache.has(fsPath)) {
        this._realPathCache.set(fsPath, this._hostUtils.fsRealpath(fsPath));
      }
      const realpathValue = await this._realPathCache.get(fsPath);
      return URI.file(realpathValue);
    }
    return uri;
  }
  // create trie to enable fast 'filename -> extension id' look up
  async getExtensionPathIndex() {
    if (!this._extensionPathIndex) {
      this._extensionPathIndex = this._createExtensionPathIndex(this._myRegistry.getAllExtensionDescriptions()).then((searchTree) => {
        return new ExtensionPaths(searchTree);
      });
    }
    return this._extensionPathIndex;
  }
  /**
   * create trie to enable fast 'filename -> extension id' look up
   */
  async _createExtensionPathIndex(extensions) {
    const tst = TernarySearchTree.forUris((key) => {
      return extUriBiasedIgnorePathCase.ignorePathCasing(key);
    });
    await Promise.all(extensions.map(async (ext) => {
      if (this._getEntryPoint(ext)) {
        const uri = await this._realPathExtensionUri(ext.extensionLocation);
        tst.set(uri, ext);
      }
    }));
    return tst;
  }
  _deactivate(extensionId) {
    let result = Promise.resolve(void 0);
    if (!this._readyToRunExtensions.isOpen()) {
      return result;
    }
    if (!this._activator.isActivated(extensionId)) {
      return result;
    }
    const extension = this._activator.getActivatedExtension(extensionId);
    if (!extension) {
      return result;
    }
    try {
      if (typeof extension.module.deactivate === "function") {
        result = Promise.resolve(extension.module.deactivate()).then(void 0, (err) => {
          this._logService.error(err);
          return Promise.resolve(void 0);
        });
      }
    } catch (err) {
      this._logService.error(`An error occurred when deactivating the extension '${extensionId.value}':`);
      this._logService.error(err);
    }
    try {
      extension.disposable.dispose();
    } catch (err) {
      this._logService.error(`An error occurred when disposing the subscriptions for extension '${extensionId.value}':`);
      this._logService.error(err);
    }
    return result;
  }
  // --- impl
  async _activateExtension(extensionDescription, reason) {
    if (!this._initData.remote.isRemote) {
      await this._mainThreadExtensionsProxy.$onWillActivateExtension(extensionDescription.identifier);
    } else {
      this._mainThreadExtensionsProxy.$onWillActivateExtension(extensionDescription.identifier);
    }
    return this._doActivateExtension(extensionDescription, reason).then((activatedExtension) => {
      const activationTimes = activatedExtension.activationTimes;
      this._mainThreadExtensionsProxy.$onDidActivateExtension(extensionDescription.identifier, activationTimes.codeLoadingTime, activationTimes.activateCallTime, activationTimes.activateResolvedTime, reason);
      this._logExtensionActivationTimes(extensionDescription, reason, "success", activationTimes);
      return activatedExtension;
    }, (err) => {
      this._logExtensionActivationTimes(extensionDescription, reason, "failure");
      throw err;
    });
  }
  _logExtensionActivationTimes(extensionDescription, reason, outcome, activationTimes) {
    const event = getTelemetryActivationEvent(extensionDescription, reason);
    this._mainThreadTelemetryProxy.$publicLog2("extensionActivationTimes", {
      ...event,
      ...activationTimes || {},
      outcome
    });
  }
  _doActivateExtension(extensionDescription, reason) {
    const event = getTelemetryActivationEvent(extensionDescription, reason);
    this._mainThreadTelemetryProxy.$publicLog2("activatePlugin", event);
    const entryPoint = this._getEntryPoint(extensionDescription);
    if (!entryPoint) {
      return Promise.resolve(new EmptyExtension(ExtensionActivationTimes.NONE));
    }
    this._logService.info(`ExtensionService#_doActivateExtension ${extensionDescription.identifier.value}, startup: ${reason.startup}, activationEvent: '${reason.activationEvent}'${extensionDescription.identifier.value !== reason.extensionId.value ? `, root cause: ${reason.extensionId.value}` : ``}`);
    this._logService.flush();
    const isESM = this._isESM(extensionDescription);
    const extensionInternalStore = new DisposableStore();
    const activationTimesBuilder = new ExtensionActivationTimesBuilder(reason.startup);
    return Promise.all([
      isESM ? this._loadESMModule(extensionDescription, joinPath(extensionDescription.extensionLocation, entryPoint), activationTimesBuilder) : this._loadCommonJSModule(extensionDescription, joinPath(extensionDescription.extensionLocation, entryPoint), activationTimesBuilder),
      this._loadExtensionContext(extensionDescription, extensionInternalStore)
    ]).then((values) => {
      performance.mark(`code/extHost/willActivateExtension/${extensionDescription.identifier.value}`);
      return AbstractExtHostExtensionService._callActivate(this._logService, extensionDescription.identifier, values[0], values[1], extensionInternalStore, activationTimesBuilder);
    }).then((activatedExtension) => {
      performance.mark(`code/extHost/didActivateExtension/${extensionDescription.identifier.value}`);
      return activatedExtension;
    });
  }
  _loadExtensionContext(extensionDescription, extensionInternalStore) {
    const languageModelAccessInformation = this._extHostLanguageModels.createLanguageModelAccessInformation(extensionDescription);
    const globalState = extensionInternalStore.add(new ExtensionGlobalMemento(extensionDescription, this._storage));
    const workspaceState = extensionInternalStore.add(new ExtensionMemento(extensionDescription.identifier.value, false, this._storage));
    const secrets = extensionInternalStore.add(new ExtensionSecrets(extensionDescription, this._secretState));
    const extensionMode = extensionDescription.isUnderDevelopment ? this._initData.environment.extensionTestsLocationURI ? ExtensionMode.Test : ExtensionMode.Development : ExtensionMode.Production;
    const extensionKind = this._initData.remote.isRemote ? ExtensionKind.Workspace : ExtensionKind.UI;
    this._logService.trace(`ExtensionService#loadExtensionContext ${extensionDescription.identifier.value}`);
    return Promise.all([
      globalState.whenReady,
      workspaceState.whenReady,
      this._storagePath.whenReady
    ]).then(() => {
      const that = this;
      let extension;
      let messagePassingProtocol;
      const messagePort = isProposedApiEnabled(extensionDescription, "ipc") ? this._initData.messagePorts?.get(ExtensionIdentifier.toKey(extensionDescription.identifier)) : void 0;
      return Object.freeze({
        globalState,
        workspaceState,
        secrets,
        subscriptions: [],
        get languageModelAccessInformation() {
          return languageModelAccessInformation;
        },
        get extensionUri() {
          return extensionDescription.extensionLocation;
        },
        get extensionPath() {
          return extensionDescription.extensionLocation.fsPath;
        },
        asAbsolutePath(relativePath) {
          return path.join(extensionDescription.extensionLocation.fsPath, relativePath);
        },
        get storagePath() {
          return that._storagePath.workspaceValue(extensionDescription)?.fsPath;
        },
        get globalStoragePath() {
          return that._storagePath.globalValue(extensionDescription).fsPath;
        },
        get logPath() {
          return path.join(that._initData.logsLocation.fsPath, extensionDescription.identifier.value);
        },
        get logUri() {
          return URI.joinPath(that._initData.logsLocation, extensionDescription.identifier.value);
        },
        get storageUri() {
          return that._storagePath.workspaceValue(extensionDescription);
        },
        get globalStorageUri() {
          return that._storagePath.globalValue(extensionDescription);
        },
        get extensionMode() {
          return extensionMode;
        },
        get extension() {
          if (extension === void 0) {
            extension = new Extension(that, extensionDescription.identifier, extensionDescription, extensionKind, false);
          }
          return extension;
        },
        get extensionRuntime() {
          checkProposedApiEnabled(extensionDescription, "extensionRuntime");
          return that.extensionRuntime;
        },
        get environmentVariableCollection() {
          return that._extHostTerminalService.getEnvironmentVariableCollection(extensionDescription);
        },
        get messagePassingProtocol() {
          if (!messagePassingProtocol) {
            if (!messagePort) {
              return void 0;
            }
            const onDidReceiveMessage = Event.buffer(Event.fromDOMEventEmitter(messagePort, "message", (e) => e.data), "onDidReceiveMessage");
            messagePort.start();
            messagePassingProtocol = {
              onDidReceiveMessage,
              // eslint-disable-next-line local/code-no-any-casts
              postMessage: messagePort.postMessage.bind(messagePort)
            };
          }
          return messagePassingProtocol;
        }
      });
    });
  }
  static _callActivate(logService, extensionId, extensionModule, context, extensionInternalStore, activationTimesBuilder) {
    extensionModule = extensionModule || {
      activate: void 0,
      deactivate: void 0
    };
    return this._callActivateOptional(logService, extensionId, extensionModule, context, activationTimesBuilder).then((extensionExports) => {
      return new ActivatedExtension(false, null, activationTimesBuilder.build(), extensionModule, extensionExports, toDisposable(() => {
        extensionInternalStore.dispose();
        dispose(context.subscriptions);
      }));
    });
  }
  static _callActivateOptional(logService, extensionId, extensionModule, context, activationTimesBuilder) {
    if (typeof extensionModule.activate === "function") {
      try {
        activationTimesBuilder.activateCallStart();
        logService.trace(`ExtensionService#_callActivateOptional ${extensionId.value}`);
        const activateResult = extensionModule.activate.apply(globalThis, [context]);
        activationTimesBuilder.activateCallStop();
        activationTimesBuilder.activateResolveStart();
        return Promise.resolve(activateResult).then((value) => {
          activationTimesBuilder.activateResolveStop();
          return value;
        });
      } catch (err) {
        return Promise.reject(err);
      }
    } else {
      return Promise.resolve(extensionModule);
    }
  }
  // -- eager activation
  _activateOneStartupFinished(desc, activationEvent) {
    this._activateById(desc.identifier, {
      startup: false,
      extensionId: desc.identifier,
      activationEvent
    }).then(void 0, (err) => {
      this._logService.error(err);
    });
  }
  _activateAllStartupFinishedDeferred(extensions, start = 0) {
    const timeBudget = 50;
    const startTime = Date.now();
    setTimeout0(() => {
      for (let i = start; i < extensions.length; i += 1) {
        const desc = extensions[i];
        for (const activationEvent of desc.activationEvents ?? []) {
          if (activationEvent === "onStartupFinished") {
            if (Date.now() - startTime > timeBudget) {
              this._activateAllStartupFinishedDeferred(extensions, i);
              break;
            } else {
              this._activateOneStartupFinished(desc, activationEvent);
            }
          }
        }
      }
    });
  }
  _activateAllStartupFinished() {
    this._mainThreadExtensionsProxy.$setPerformanceMarks(performance.getMarks());
    this._extHostConfiguration.getConfigProvider().then((configProvider) => {
      const shouldDeferActivation = configProvider.getConfiguration("extensions.experimental").get("deferredStartupFinishedActivation");
      const allExtensionDescriptions = this._myRegistry.getAllExtensionDescriptions();
      if (shouldDeferActivation) {
        this._activateAllStartupFinishedDeferred(allExtensionDescriptions);
      } else {
        for (const desc of allExtensionDescriptions) {
          if (desc.activationEvents) {
            for (const activationEvent of desc.activationEvents) {
              if (activationEvent === "onStartupFinished") {
                this._activateOneStartupFinished(desc, activationEvent);
              }
            }
          }
        }
      }
    });
  }
  // Handle "eager" activation extensions
  _handleEagerExtensions() {
    const starActivation = this._activateByEvent("*", true).then(void 0, (err) => {
      this._logService.error(err);
    });
    this._register(this._extHostWorkspace.onDidChangeWorkspace((e) => this._handleWorkspaceContainsEagerExtensions(e.added)));
    const folders = this._extHostWorkspace.workspace ? this._extHostWorkspace.workspace.folders : [];
    const workspaceContainsActivation = this._handleWorkspaceContainsEagerExtensions(folders);
    const remoteResolverActivation = this._handleRemoteResolverEagerExtensions();
    const eagerExtensionsActivation = Promise.all([remoteResolverActivation, starActivation, workspaceContainsActivation]).then(() => {
    });
    Promise.race([eagerExtensionsActivation, timeout(1e4)]).then(() => {
      this._activateAllStartupFinished();
    });
    return eagerExtensionsActivation;
  }
  _handleWorkspaceContainsEagerExtensions(folders) {
    if (folders.length === 0) {
      return Promise.resolve(void 0);
    }
    return Promise.all(
      this._myRegistry.getAllExtensionDescriptions().map((desc) => {
        return this._handleWorkspaceContainsEagerExtension(folders, desc);
      })
    ).then(() => {
    });
  }
  async _handleWorkspaceContainsEagerExtension(folders, desc) {
    if (this.isActivated(desc.identifier)) {
      return;
    }
    const localWithRemote = !this._initData.remote.isRemote && !!this._initData.remote.authority;
    const host = {
      logService: this._logService,
      folders: folders.map((folder) => folder.uri),
      forceUsingSearch: localWithRemote || !this._hostUtils.fsExists,
      exists: (uri) => this._hostUtils.fsExists(uri.fsPath),
      checkExists: (folders2, includes, token) => this._mainThreadWorkspaceProxy.$checkExists(folders2, includes, token)
    };
    const result = await checkActivateWorkspaceContainsExtension(host, desc);
    if (!result) {
      return;
    }
    return this._activateById(desc.identifier, { startup: true, extensionId: desc.identifier, activationEvent: result.activationEvent }).then(void 0, (err) => this._logService.error(err));
  }
  async _handleRemoteResolverEagerExtensions() {
    if (this._initData.remote.authority) {
      return this._activateByEvent(`onResolveRemoteAuthority:${this._initData.remote.authority}`, false);
    }
  }
  async $extensionTestsExecute() {
    await this._eagerExtensionsActivated.wait();
    try {
      return await this._doHandleExtensionTests();
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
  async _doHandleExtensionTests() {
    const { extensionDevelopmentLocationURI, extensionTestsLocationURI } = this._initData.environment;
    if (!extensionDevelopmentLocationURI || !extensionTestsLocationURI) {
      throw new Error(nls.localize("extensionTestError1", "Cannot load test runner."));
    }
    const extensionDescription = (await this.getExtensionPathIndex()).findSubstr(extensionTestsLocationURI);
    const isESM = this._isESM(extensionDescription, extensionTestsLocationURI.path);
    const testRunner = await (isESM ? this._loadESMModule(null, extensionTestsLocationURI, new ExtensionActivationTimesBuilder(false)) : this._loadCommonJSModule(null, extensionTestsLocationURI, new ExtensionActivationTimesBuilder(false)));
    if (!testRunner || typeof testRunner.run !== "function") {
      throw new Error(nls.localize("extensionTestError", "Path {0} does not point to a valid extension test runner.", extensionTestsLocationURI.toString()));
    }
    return new Promise((resolve, reject) => {
      const oldTestRunnerCallback = (error, failures) => {
        if (error) {
          if (isCI) {
            this._logService.error(`Test runner called back with error`, error);
          }
          reject(error);
        } else {
          if (isCI) {
            if (failures) {
              this._logService.info(`Test runner called back with ${failures} failures.`);
            } else {
              this._logService.info(`Test runner called back with successful outcome.`);
            }
          }
          resolve(
            typeof failures === "number" && failures > 0 ? 1 : 0
            /* OK */
          );
        }
      };
      const extensionTestsPath = originalFSPath(extensionTestsLocationURI);
      const runResult = testRunner.run(extensionTestsPath, oldTestRunnerCallback);
      if (runResult && runResult.then) {
        runResult.then(() => {
          if (isCI) {
            this._logService.info(`Test runner finished successfully.`);
          }
          resolve(0);
        }).catch((err) => {
          if (isCI) {
            this._logService.error(`Test runner finished with error`, err);
          }
          reject(err instanceof Error && err.stack ? err.stack : String(err));
        });
      }
    });
  }
  _startExtensionHost() {
    if (this._started) {
      throw new Error(`Extension host is already started!`);
    }
    this._started = true;
    return this._readyToStartExtensionHost.wait().then(() => this._readyToRunExtensions.open()).then(() => {
      return Promise.race([this._activator.waitForActivatingExtensions(), timeout(1e3)]);
    }).then(() => this._handleEagerExtensions()).then(() => {
      this._eagerExtensionsActivated.open();
      this._logService.info(`Eager extensions activated`);
    });
  }
  // -- called by extensions
  registerRemoteAuthorityResolver(authorityPrefix, resolver) {
    this._resolvers[authorityPrefix] = resolver;
    return toDisposable(() => {
      delete this._resolvers[authorityPrefix];
    });
  }
  async getRemoteExecServer(remoteAuthority) {
    const { resolver } = await this._activateAndGetResolver(remoteAuthority);
    return resolver?.resolveExecServer?.(remoteAuthority, { resolveAttempt: 0 });
  }
  // -- called by main thread
  async _activateAndGetResolver(remoteAuthority) {
    const authorityPlusIndex = remoteAuthority.indexOf("+");
    if (authorityPlusIndex === -1) {
      throw new RemoteAuthorityResolverError(`Not an authority that can be resolved!`, RemoteAuthorityResolverErrorCode.InvalidAuthority);
    }
    const authorityPrefix = remoteAuthority.substr(0, authorityPlusIndex);
    await this._almostReadyToRunExtensions.wait();
    await this._activateByEvent(`onResolveRemoteAuthority:${authorityPrefix}`, false);
    return { authorityPrefix, resolver: this._resolvers[authorityPrefix] };
  }
  async $resolveAuthority(remoteAuthorityChain, resolveAttempt) {
    const sw = StopWatch.create(false);
    const prefix = () => `[resolveAuthority(${getRemoteAuthorityPrefix(remoteAuthorityChain)},${resolveAttempt})][${sw.elapsed()}ms] `;
    const logInfo = (msg) => this._logService.info(`${prefix()}${msg}`);
    const logWarning = (msg) => this._logService.warn(`${prefix()}${msg}`);
    const logError = (msg, err = void 0) => this._logService.error(`${prefix()}${msg}`, err);
    const normalizeError = (err) => {
      if (err instanceof RemoteAuthorityResolverError) {
        return {
          type: "error",
          error: {
            code: err._code,
            message: err._message,
            detail: err._detail
          }
        };
      }
      throw err;
    };
    const getResolver = async (remoteAuthority) => {
      logInfo(`activating resolver for ${remoteAuthority}...`);
      const { resolver, authorityPrefix } = await this._activateAndGetResolver(remoteAuthority);
      if (!resolver) {
        logError(`no resolver for ${authorityPrefix}`);
        throw new RemoteAuthorityResolverError(`No remote extension installed to resolve ${authorityPrefix}.`, RemoteAuthorityResolverErrorCode.NoResolverFound);
      }
      return { resolver, authorityPrefix, remoteAuthority };
    };
    const chain = remoteAuthorityChain.split(/@|%40/g).reverse();
    logInfo(`activating remote resolvers ${chain.join(" -> ")}`);
    let resolvers;
    try {
      resolvers = await Promise.all(chain.map(getResolver)).catch(async (e) => {
        if (!(e instanceof RemoteAuthorityResolverError) || e._code !== RemoteAuthorityResolverErrorCode.InvalidAuthority) {
          throw e;
        }
        logWarning(`resolving nested authorities failed: ${e.message}`);
        return [await getResolver(remoteAuthorityChain)];
      });
    } catch (e) {
      return normalizeError(e);
    }
    const intervalLogger = new IntervalTimer();
    intervalLogger.cancelAndSet(() => logInfo("waiting..."), 1e3);
    let result;
    let execServer;
    for (const [i, { authorityPrefix, resolver, remoteAuthority }] of resolvers.entries()) {
      try {
        if (i === resolvers.length - 1) {
          logInfo(`invoking final resolve()...`);
          performance.mark(`code/extHost/willResolveAuthority/${authorityPrefix}`);
          result = await resolver.resolve(remoteAuthority, { resolveAttempt, execServer });
          performance.mark(`code/extHost/didResolveAuthorityOK/${authorityPrefix}`);
          logInfo(`setting tunnel factory...`);
          this._register(await this._extHostTunnelService.setTunnelFactory(
            resolver,
            ExtHostManagedResolvedAuthority.isManagedResolvedAuthority(result) ? result : void 0
          ));
        } else {
          logInfo(`invoking resolveExecServer() for ${remoteAuthority}`);
          performance.mark(`code/extHost/willResolveExecServer/${authorityPrefix}`);
          execServer = await resolver.resolveExecServer?.(remoteAuthority, { resolveAttempt, execServer });
          if (!execServer) {
            throw new RemoteAuthorityResolverError(`Exec server was not available for ${remoteAuthority}`, RemoteAuthorityResolverErrorCode.NoResolverFound);
          }
          performance.mark(`code/extHost/didResolveExecServerOK/${authorityPrefix}`);
        }
      } catch (e) {
        performance.mark(`code/extHost/didResolveAuthorityError/${authorityPrefix}`);
        logError(`returned an error`, e);
        intervalLogger.dispose();
        return normalizeError(e);
      }
    }
    intervalLogger.dispose();
    const tunnelInformation = {
      environmentTunnels: result.environmentTunnels,
      features: result.tunnelFeatures ? {
        elevation: result.tunnelFeatures.elevation,
        privacyOptions: result.tunnelFeatures.privacyOptions,
        protocol: result.tunnelFeatures.protocol === void 0 ? true : result.tunnelFeatures.protocol
      } : void 0
    };
    const options = {
      extensionHostEnv: result.extensionHostEnv,
      isTrusted: result.isTrusted,
      authenticationSession: result.authenticationSessionForInitializingExtensions ? { id: result.authenticationSessionForInitializingExtensions.id, providerId: result.authenticationSessionForInitializingExtensions.providerId } : void 0
    };
    logInfo(`returned ${ExtHostManagedResolvedAuthority.isManagedResolvedAuthority(result) ? "managed authority" : `${result.host}:${result.port}`}`);
    let authority;
    if (ExtHostManagedResolvedAuthority.isManagedResolvedAuthority(result)) {
      const socketFactoryId = resolveAttempt;
      this._extHostManagedSockets.setFactory(socketFactoryId, result.makeConnection);
      authority = {
        authority: remoteAuthorityChain,
        connectTo: new ManagedRemoteConnection(socketFactoryId),
        connectionToken: result.connectionToken
      };
    } else {
      authority = {
        authority: remoteAuthorityChain,
        connectTo: new WebSocketRemoteConnection(result.host, result.port),
        connectionToken: result.connectionToken
      };
    }
    return {
      type: "ok",
      value: {
        authority,
        options,
        tunnelInformation
      }
    };
  }
  async $getCanonicalURI(remoteAuthority, uriComponents) {
    this._logService.info(`$getCanonicalURI invoked for authority (${getRemoteAuthorityPrefix(remoteAuthority)})`);
    const { resolver } = await this._activateAndGetResolver(remoteAuthority);
    if (!resolver) {
      return null;
    }
    const uri = URI.revive(uriComponents);
    if (typeof resolver.getCanonicalURI === "undefined") {
      return uri;
    }
    const result = await asPromise(() => resolver.getCanonicalURI(uri));
    if (!result) {
      return uri;
    }
    return result;
  }
  async $startExtensionHost(extensionsDelta) {
    extensionsDelta.toAdd.forEach((extension) => extension.extensionLocation = URI.revive(extension.extensionLocation));
    const { globalRegistry, myExtensions } = applyExtensionsDelta(this._activationEventsReader, this._globalRegistry, this._myRegistry, extensionsDelta);
    const newSearchTree = await this._createExtensionPathIndex(myExtensions);
    const extensionsPaths = await this.getExtensionPathIndex();
    extensionsPaths.setSearchTree(newSearchTree);
    this._globalRegistry.set(globalRegistry.getAllExtensionDescriptions());
    this._myRegistry.set(myExtensions);
    if (isCI) {
      this._logService.info(`$startExtensionHost: global extensions: ${printExtIds(this._globalRegistry)}`);
      this._logService.info(`$startExtensionHost: local extensions: ${printExtIds(this._myRegistry)}`);
    }
    return this._startExtensionHost();
  }
  $activateByEvent(activationEvent, activationKind) {
    if (activationKind === ActivationKind.Immediate) {
      return this._almostReadyToRunExtensions.wait().then((_) => this._activateByEvent(activationEvent, false));
    }
    return this._readyToRunExtensions.wait().then((_) => this._activateByEvent(activationEvent, false));
  }
  async $activate(extensionId, reason) {
    await this._readyToRunExtensions.wait();
    if (!this._myRegistry.getExtensionDescription(extensionId)) {
      return false;
    }
    await this._activateById(extensionId, reason);
    return true;
  }
  async $deltaExtensions(extensionsDelta) {
    extensionsDelta.toAdd.forEach((extension) => extension.extensionLocation = URI.revive(extension.extensionLocation));
    const { globalRegistry, myExtensions } = applyExtensionsDelta(this._activationEventsReader, this._globalRegistry, this._myRegistry, extensionsDelta);
    const newSearchTree = await this._createExtensionPathIndex(myExtensions);
    const extensionsPaths = await this.getExtensionPathIndex();
    extensionsPaths.setSearchTree(newSearchTree);
    this._globalRegistry.set(globalRegistry.getAllExtensionDescriptions());
    this._myRegistry.set(myExtensions);
    if (isCI) {
      this._logService.info(`$deltaExtensions: global extensions: ${printExtIds(this._globalRegistry)}`);
      this._logService.info(`$deltaExtensions: local extensions: ${printExtIds(this._myRegistry)}`);
    }
    return Promise.resolve(void 0);
  }
  async $test_latency(n) {
    return n;
  }
  async $test_up(b) {
    return b.byteLength;
  }
  async $test_down(size) {
    const buff = VSBuffer.alloc(size);
    const value = Math.random() % 256;
    for (let i = 0; i < size; i++) {
      buff.writeUInt8(value, i);
    }
    return buff;
  }
  async $updateRemoteConnectionData(connectionData) {
    this._remoteConnectionData = connectionData;
    this._onDidChangeRemoteConnectionData.fire();
  }
  _isESM(extensionDescription, modulePath) {
    modulePath ??= extensionDescription ? this._getEntryPoint(extensionDescription) : modulePath;
    return modulePath?.endsWith(".mjs") || extensionDescription?.type === "module" && !modulePath?.endsWith(".cjs");
  }
};
AbstractExtHostExtensionService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IHostUtils),
  __decorateParam(2, IExtHostRpcService),
  __decorateParam(3, IExtHostWorkspace),
  __decorateParam(4, IExtHostConfiguration),
  __decorateParam(5, ILogService),
  __decorateParam(6, IExtHostInitDataService),
  __decorateParam(7, IExtensionStoragePaths),
  __decorateParam(8, IExtHostTunnelService),
  __decorateParam(9, IExtHostTerminalService),
  __decorateParam(10, IExtHostLocalizationService),
  __decorateParam(11, IExtHostManagedSockets),
  __decorateParam(12, IExtHostLanguageModels)
], AbstractExtHostExtensionService);
function applyExtensionsDelta(activationEventsReader, oldGlobalRegistry, oldMyRegistry, extensionsDelta) {
  activationEventsReader.addActivationEvents(extensionsDelta.addActivationEvents);
  const globalRegistry = new ExtensionDescriptionRegistry(activationEventsReader, oldGlobalRegistry.getAllExtensionDescriptions());
  globalRegistry.deltaExtensions(extensionsDelta.toAdd, extensionsDelta.toRemove);
  const myExtensionsSet = new ExtensionIdentifierSet(oldMyRegistry.getAllExtensionDescriptions().map((extension) => extension.identifier));
  for (const extensionId of extensionsDelta.myToRemove) {
    myExtensionsSet.delete(extensionId);
  }
  for (const extensionId of extensionsDelta.myToAdd) {
    myExtensionsSet.add(extensionId);
  }
  const myExtensions = filterExtensions(globalRegistry, myExtensionsSet);
  return { globalRegistry, myExtensions };
}
function getTelemetryActivationEvent(extensionDescription, reason) {
  const event = {
    id: extensionDescription.identifier.value,
    name: extensionDescription.name,
    extensionVersion: extensionDescription.version,
    publisherDisplayName: extensionDescription.publisher,
    activationEvents: extensionDescription.activationEvents ? extensionDescription.activationEvents.join(",") : null,
    isBuiltin: extensionDescription.isBuiltin,
    reason: reason.activationEvent,
    reasonId: reason.extensionId.value
  };
  return event;
}
function printExtIds(registry) {
  return registry.getAllExtensionDescriptions().map((ext) => ext.identifier.value).join(",");
}
const IExtHostExtensionService = createDecorator("IExtHostExtensionService");
class Extension {
  #extensionService;
  #originExtensionId;
  #identifier;
  constructor(extensionService, originExtensionId, description, kind, isFromDifferentExtensionHost) {
    this.#extensionService = extensionService;
    this.#originExtensionId = originExtensionId;
    this.#identifier = description.identifier;
    this.id = description.identifier.value;
    this.extensionUri = description.extensionLocation;
    this.extensionPath = path.normalize(originalFSPath(description.extensionLocation));
    this.packageJSON = description;
    this.extensionKind = kind;
    this.isFromDifferentExtensionHost = isFromDifferentExtensionHost;
  }
  get isActive() {
    return this.#extensionService.isActivated(this.#identifier);
  }
  get exports() {
    if (this.packageJSON.api === "none" || this.isFromDifferentExtensionHost) {
      return void 0;
    }
    return this.#extensionService.getExtensionExports(this.#identifier);
  }
  async activate() {
    if (this.isFromDifferentExtensionHost) {
      throw new Error("Cannot activate foreign extension");
    }
    await this.#extensionService.activateByIdWithErrors(this.#identifier, { startup: false, extensionId: this.#originExtensionId, activationEvent: "api" });
    return this.exports;
  }
}
function filterExtensions(globalRegistry, desiredExtensions) {
  return globalRegistry.getAllExtensionDescriptions().filter(
    (extension) => desiredExtensions.has(extension.identifier)
  );
}
class ExtensionPaths {
  constructor(_searchTree) {
    this._searchTree = _searchTree;
  }
  setSearchTree(searchTree) {
    this._searchTree = searchTree;
  }
  findSubstr(key) {
    return this._searchTree.findSubstr(key);
  }
  forEach(callback) {
    return this._searchTree.forEach(callback);
  }
}
class SyncedActivationEventsReader {
  constructor(activationEvents) {
    this._map = new ExtensionIdentifierMap();
    this.addActivationEvents(activationEvents);
  }
  readActivationEvents(extensionDescription) {
    return this._map.get(extensionDescription.identifier) ?? [];
  }
  addActivationEvents(activationEvents) {
    for (const extensionId of Object.keys(activationEvents)) {
      this._map.set(extensionId, activationEvents[extensionId]);
    }
  }
}
export {
  AbstractExtHostExtensionService,
  Extension,
  ExtensionPaths,
  IExtHostExtensionService,
  IHostUtils
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RFeHRlbnNpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0ICogYXMgcGVyZm9ybWFuY2UgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgb3JpZ2luYWxGU1BhdGgsIGpvaW5QYXRoLCBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBhc1Byb21pc2UsIEJhcnJpZXIsIEludGVydmFsVGltZXIsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBkaXNwb3NlLCB0b0Rpc3Bvc2FibGUsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGVybmFyeVNlYXJjaFRyZWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90ZXJuYXJ5U2VhcmNoVHJlZS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RXh0ZW5zaW9uU2VydmljZVNoYXBlLCBNYWluQ29udGV4dCwgTWFpblRocmVhZEV4dGVuc2lvblNlcnZpY2VTaGFwZSwgTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlLCBNYWluVGhyZWFkV29ya3NwYWNlU2hhcGUgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uRGVsdGEsIElFeHRlbnNpb25Ib3N0SW5pdERhdGEgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25Ib3N0UHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbmZpZ3VyYXRpb24sIElFeHRIb3N0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4vZXh0SG9zdENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQWN0aXZhdGVkRXh0ZW5zaW9uLCBFbXB0eUV4dGVuc2lvbiwgRXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzLCBFeHRlbnNpb25BY3RpdmF0aW9uVGltZXNCdWlsZGVyLCBFeHRlbnNpb25zQWN0aXZhdG9yLCBJRXh0ZW5zaW9uQVBJLCBJRXh0ZW5zaW9uTW9kdWxlLCBIb3N0RXh0ZW5zaW9uLCBFeHRlbnNpb25BY3RpdmF0aW9uVGltZXNGcmFnbWVudCB9IGZyb20gJy4vZXh0SG9zdEV4dGVuc2lvbkFjdGl2YXRvci5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0U3RvcmFnZSwgSUV4dEhvc3RTdG9yYWdlIH0gZnJvbSAnLi9leHRIb3N0U3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0V29ya3NwYWNlLCBJRXh0SG9zdFdvcmtzcGFjZSB9IGZyb20gJy4vZXh0SG9zdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBNaXNzaW5nRXh0ZW5zaW9uRGVwZW5kZW5jeSwgQWN0aXZhdGlvbktpbmQsIGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkLCBpc1Byb3Bvc2VkQXBpRW5hYmxlZCwgRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbiwgSVByb3Bvc2VkQXBpVXNhZ2UsIHNldFByb3Bvc2VkQXBpVXNhZ2VSZXBvcnRlciwgc2V0RW5hYmxlZEFwaVByb3Bvc2Fsc0ZhbGxiYWNrRXhwZXJpbWVudCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeSwgSUFjdGl2YXRpb25FdmVudHNSZWFkZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCAqIGFzIGVycm9ycyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIEV4dGVuc2lvbklkZW50aWZpZXJNYXAsIEV4dGVuc2lvbklkZW50aWZpZXJTZXQsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uR2xvYmFsTWVtZW50bywgRXh0ZW5zaW9uTWVtZW50byB9IGZyb20gJy4vZXh0SG9zdE1lbWVudG8uanMnO1xuaW1wb3J0IHsgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvciwgRXh0ZW5zaW9uS2luZCwgRXh0ZW5zaW9uTW9kZSwgRXh0ZW5zaW9uUnVudGltZSwgTWFuYWdlZFJlc29sdmVkQXV0aG9yaXR5IGFzIEV4dEhvc3RNYW5hZ2VkUmVzb2x2ZWRBdXRob3JpdHkgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEF1dGhvcml0eSwgUmVzb2x2ZWRPcHRpb25zLCBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yQ29kZSwgSVJlbW90ZUNvbm5lY3Rpb25EYXRhLCBnZXRSZW1vdGVBdXRob3JpdHlQcmVmaXgsIFR1bm5lbEluZm9ybWF0aW9uLCBNYW5hZ2VkUmVtb3RlQ29ubmVjdGlvbiwgV2ViU29ja2V0UmVtb3RlQ29ubmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0SW5pdERhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TdG9yYWdlUGF0aHMgfSBmcm9tICcuL2V4dEhvc3RTdG9yYWdlUGF0aHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RScGNTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0UnBjU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VHVubmVsU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFR1bm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RUZXJtaW5hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RMYW5ndWFnZU1vZGVscyB9IGZyb20gJy4vZXh0SG9zdExhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkFjdGl2YXRpb25Ib3N0LCBjaGVja0FjdGl2YXRlV29ya3NwYWNlQ29udGFpbnNFeHRlbnNpb24gfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi93b3Jrc3BhY2VDb250YWlucy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0U2VjcmV0U3RhdGUsIElFeHRIb3N0U2VjcmV0U3RhdGUgfSBmcm9tICcuL2V4dEhvc3RTZWNyZXRTdGF0ZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25TZWNyZXRzIH0gZnJvbSAnLi9leHRIb3N0U2VjcmV0cy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZUF1dGhvcml0eVJlc3VsdCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbkhvc3RQcm94eS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdExvY2FsaXphdGlvblNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RMb2NhbGl6YXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBpc0NJLCBzZXRUaW1lb3V0MCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElFeHRIb3N0TWFuYWdlZFNvY2tldHMgfSBmcm9tICcuL2V4dEhvc3RNYW5hZ2VkU29ja2V0cy5qcyc7XG5pbXBvcnQgeyBEdG8gfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuXG5pbnRlcmZhY2UgSVRlc3RSdW5uZXIge1xuXHQvKiogT2xkIHRlc3QgcnVubmVyIEFQSSwgYXMgZXhwb3J0ZWQgZnJvbSBgdnNjb2RlL2xpYi90ZXN0cnVubmVyYCAqL1xuXHRydW4odGVzdHNSb290OiBzdHJpbmcsIGNsYjogKGVycm9yOiBFcnJvciwgZmFpbHVyZXM/OiBudW1iZXIpID0+IHZvaWQpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSU5ld1Rlc3RSdW5uZXIge1xuXHQvKiogTmV3IHRlc3QgcnVubmVyIEFQSSwgYXMgZXhwbGFpbmVkIGluIHRoZSBleHRlbnNpb24gdGVzdCBkb2MgKi9cblx0cnVuKCk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBjb25zdCBJSG9zdFV0aWxzID0gY3JlYXRlRGVjb3JhdG9yPElIb3N0VXRpbHM+KCdJSG9zdFV0aWxzJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUhvc3RVdGlscyB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcGlkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGV4aXQoY29kZTogbnVtYmVyKTogdm9pZDtcblx0ZnNFeGlzdHM/KHBhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj47XG5cdGZzUmVhbHBhdGg/KHBhdGg6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPjtcbn1cblxudHlwZSBUZWxlbWV0cnlBY3RpdmF0aW9uRXZlbnRGcmFnbWVudCA9IHtcblx0aWQ6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkZW50aWZpZXIgb2YgYW4gZXh0ZW5zaW9uJyB9O1xuXHRuYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBuYW1lIG9mIHRoZSBleHRlbnNpb24nIH07XG5cdGV4dGVuc2lvblZlcnNpb246IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHZlcnNpb24gb2YgdGhlIGV4dGVuc2lvbicgfTtcblx0cHVibGlzaGVyRGlzcGxheU5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgcHVibGlzaGVyIG9mIHRoZSBleHRlbnNpb24nIH07XG5cdGFjdGl2YXRpb25FdmVudHM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdBbGwgYWN0aXZhdGlvbiBldmVudHMgb2YgdGhlIGV4dGVuc2lvbicgfTtcblx0aXNCdWlsdGluOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSWYgdGhlIGV4dGVuc2lvbiBpcyBidWlsdGluIG9yIGdpdCBpbnN0YWxsZWQnIH07XG5cdHJlYXNvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhY3RpdmF0aW9uIGV2ZW50JyB9O1xuXHRyZWFzb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaWRlbnRpZmllciBvZiB0aGUgYWN0aXZhdGlvbiBldmVudCcgfTtcbn07XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdEV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIEV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlU2hhcGUge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRhYnN0cmFjdCByZWFkb25seSBleHRlbnNpb25SdW50aW1lOiBFeHRlbnNpb25SdW50aW1lO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUmVtb3RlQ29ubmVjdGlvbkRhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVtb3RlQ29ubmVjdGlvbkRhdGEgPSB0aGlzLl9vbkRpZENoYW5nZVJlbW90ZUNvbm5lY3Rpb25EYXRhLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfaG9zdFV0aWxzOiBJSG9zdFV0aWxzO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2luaXREYXRhOiBJRXh0ZW5zaW9uSG9zdEluaXREYXRhO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2V4dEhvc3RDb250ZXh0OiBJRXh0SG9zdFJwY1NlcnZpY2U7XG5cdHByb3RlY3RlZCByZWFkb25seSBfaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdHByb3RlY3RlZCByZWFkb25seSBfZXh0SG9zdFdvcmtzcGFjZTogRXh0SG9zdFdvcmtzcGFjZTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9leHRIb3N0Q29uZmlndXJhdGlvbjogRXh0SG9zdENvbmZpZ3VyYXRpb247XG5cdHByb3RlY3RlZCByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG5cdHByb3RlY3RlZCByZWFkb25seSBfZXh0SG9zdFR1bm5lbFNlcnZpY2U6IElFeHRIb3N0VHVubmVsU2VydmljZTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9leHRIb3N0VGVybWluYWxTZXJ2aWNlOiBJRXh0SG9zdFRlcm1pbmFsU2VydmljZTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9leHRIb3N0TG9jYWxpemF0aW9uU2VydmljZTogSUV4dEhvc3RMb2NhbGl6YXRpb25TZXJ2aWNlO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfbWFpblRocmVhZFdvcmtzcGFjZVByb3h5OiBNYWluVGhyZWFkV29ya3NwYWNlU2hhcGU7XG5cdHByb3RlY3RlZCByZWFkb25seSBfbWFpblRocmVhZFRlbGVtZXRyeVByb3h5OiBNYWluVGhyZWFkVGVsZW1ldHJ5U2hhcGU7XG5cdHByb3RlY3RlZCByZWFkb25seSBfbWFpblRocmVhZEV4dGVuc2lvbnNQcm94eTogTWFpblRocmVhZEV4dGVuc2lvblNlcnZpY2VTaGFwZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hbG1vc3RSZWFkeVRvUnVuRXh0ZW5zaW9uczogQmFycmllcjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVhZHlUb1N0YXJ0RXh0ZW5zaW9uSG9zdDogQmFycmllcjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVhZHlUb1J1bkV4dGVuc2lvbnM6IEJhcnJpZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VhZ2VyRXh0ZW5zaW9uc0FjdGl2YXRlZDogQmFycmllcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmF0aW9uRXZlbnRzUmVhZGVyOiBTeW5jZWRBY3RpdmF0aW9uRXZlbnRzUmVhZGVyO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX215UmVnaXN0cnk6IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnk7XG5cdHByb3RlY3RlZCByZWFkb25seSBfZ2xvYmFsUmVnaXN0cnk6IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2U6IEV4dEhvc3RTdG9yYWdlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWNyZXRTdGF0ZTogRXh0SG9zdFNlY3JldFN0YXRlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlUGF0aDogSUV4dGVuc2lvblN0b3JhZ2VQYXRocztcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZhdG9yOiBFeHRlbnNpb25zQWN0aXZhdG9yO1xuXHRwcml2YXRlIF9leHRlbnNpb25QYXRoSW5kZXg6IFByb21pc2U8RXh0ZW5zaW9uUGF0aHM+IHwgbnVsbDtcblx0cHJpdmF0ZSBfcmVhbFBhdGhDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPHN0cmluZz4+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb2x2ZXJzOiB7IFthdXRob3JpdHlQcmVmaXg6IHN0cmluZ106IHZzY29kZS5SZW1vdGVBdXRob3JpdHlSZXNvbHZlciB9O1xuXG5cdHByaXZhdGUgX3N0YXJ0ZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX2lzVGVybWluYXRpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfcmVtb3RlQ29ubmVjdGlvbkRhdGE6IElSZW1vdGVDb25uZWN0aW9uRGF0YSB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUhvc3RVdGlscyBob3N0VXRpbHM6IElIb3N0VXRpbHMsXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0Q29udGV4dDogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdFdvcmtzcGFjZSBleHRIb3N0V29ya3NwYWNlOiBJRXh0SG9zdFdvcmtzcGFjZSxcblx0XHRASUV4dEhvc3RDb25maWd1cmF0aW9uIGV4dEhvc3RDb25maWd1cmF0aW9uOiBJRXh0SG9zdENvbmZpZ3VyYXRpb24sXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdEluaXREYXRhU2VydmljZSBpbml0RGF0YTogSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TdG9yYWdlUGF0aHMgc3RvcmFnZVBhdGg6IElFeHRlbnNpb25TdG9yYWdlUGF0aHMsXG5cdFx0QElFeHRIb3N0VHVubmVsU2VydmljZSBleHRIb3N0VHVubmVsU2VydmljZTogSUV4dEhvc3RUdW5uZWxTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdFRlcm1pbmFsU2VydmljZSBleHRIb3N0VGVybWluYWxTZXJ2aWNlOiBJRXh0SG9zdFRlcm1pbmFsU2VydmljZSxcblx0XHRASUV4dEhvc3RMb2NhbGl6YXRpb25TZXJ2aWNlIGV4dEhvc3RMb2NhbGl6YXRpb25TZXJ2aWNlOiBJRXh0SG9zdExvY2FsaXphdGlvblNlcnZpY2UsXG5cdFx0QElFeHRIb3N0TWFuYWdlZFNvY2tldHMgcHJpdmF0ZSByZWFkb25seSBfZXh0SG9zdE1hbmFnZWRTb2NrZXRzOiBJRXh0SG9zdE1hbmFnZWRTb2NrZXRzLFxuXHRcdEBJRXh0SG9zdExhbmd1YWdlTW9kZWxzIHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RMYW5ndWFnZU1vZGVsczogSUV4dEhvc3RMYW5ndWFnZU1vZGVscyxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9ob3N0VXRpbHMgPSBob3N0VXRpbHM7XG5cdFx0dGhpcy5fZXh0SG9zdENvbnRleHQgPSBleHRIb3N0Q29udGV4dDtcblx0XHR0aGlzLl9pbml0RGF0YSA9IGluaXREYXRhO1xuXG5cdFx0dGhpcy5fZXh0SG9zdFdvcmtzcGFjZSA9IGV4dEhvc3RXb3Jrc3BhY2U7XG5cdFx0dGhpcy5fZXh0SG9zdENvbmZpZ3VyYXRpb24gPSBleHRIb3N0Q29uZmlndXJhdGlvbjtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlID0gbG9nU2VydmljZTtcblx0XHR0aGlzLl9leHRIb3N0VHVubmVsU2VydmljZSA9IGV4dEhvc3RUdW5uZWxTZXJ2aWNlO1xuXHRcdHRoaXMuX2V4dEhvc3RUZXJtaW5hbFNlcnZpY2UgPSBleHRIb3N0VGVybWluYWxTZXJ2aWNlO1xuXHRcdHRoaXMuX2V4dEhvc3RMb2NhbGl6YXRpb25TZXJ2aWNlID0gZXh0SG9zdExvY2FsaXphdGlvblNlcnZpY2U7XG5cblx0XHR0aGlzLl9tYWluVGhyZWFkV29ya3NwYWNlUHJveHkgPSB0aGlzLl9leHRIb3N0Q29udGV4dC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlKTtcblx0XHR0aGlzLl9tYWluVGhyZWFkVGVsZW1ldHJ5UHJveHkgPSB0aGlzLl9leHRIb3N0Q29udGV4dC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkVGVsZW1ldHJ5KTtcblx0XHR0aGlzLl9tYWluVGhyZWFkRXh0ZW5zaW9uc1Byb3h5ID0gdGhpcy5fZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZEV4dGVuc2lvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fYWxtb3N0UmVhZHlUb1J1bkV4dGVuc2lvbnMgPSBuZXcgQmFycmllcigpO1xuXHRcdHRoaXMuX3JlYWR5VG9TdGFydEV4dGVuc2lvbkhvc3QgPSBuZXcgQmFycmllcigpO1xuXHRcdHRoaXMuX3JlYWR5VG9SdW5FeHRlbnNpb25zID0gbmV3IEJhcnJpZXIoKTtcblx0XHR0aGlzLl9lYWdlckV4dGVuc2lvbnNBY3RpdmF0ZWQgPSBuZXcgQmFycmllcigpO1xuXHRcdHRoaXMuX2FjdGl2YXRpb25FdmVudHNSZWFkZXIgPSBuZXcgU3luY2VkQWN0aXZhdGlvbkV2ZW50c1JlYWRlcih0aGlzLl9pbml0RGF0YS5leHRlbnNpb25zLmFjdGl2YXRpb25FdmVudHMpO1xuXHRcdHRoaXMuX2dsb2JhbFJlZ2lzdHJ5ID0gbmV3IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnkodGhpcy5fYWN0aXZhdGlvbkV2ZW50c1JlYWRlciwgdGhpcy5faW5pdERhdGEuZXh0ZW5zaW9ucy5hbGxFeHRlbnNpb25zKTtcblx0XHRjb25zdCBteUV4dGVuc2lvbnNTZXQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllclNldCh0aGlzLl9pbml0RGF0YS5leHRlbnNpb25zLm15RXh0ZW5zaW9ucyk7XG5cdFx0dGhpcy5fbXlSZWdpc3RyeSA9IG5ldyBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5KFxuXHRcdFx0dGhpcy5fYWN0aXZhdGlvbkV2ZW50c1JlYWRlcixcblx0XHRcdGZpbHRlckV4dGVuc2lvbnModGhpcy5fZ2xvYmFsUmVnaXN0cnksIG15RXh0ZW5zaW9uc1NldClcblx0XHQpO1xuXG5cdFx0aWYgKGlzQ0kpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgQ3JlYXRpbmcgZXh0ZW5zaW9uIGhvc3Qgd2l0aCB0aGUgZm9sbG93aW5nIGdsb2JhbCBleHRlbnNpb25zOiAke3ByaW50RXh0SWRzKHRoaXMuX2dsb2JhbFJlZ2lzdHJ5KX1gKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgQ3JlYXRpbmcgZXh0ZW5zaW9uIGhvc3Qgd2l0aCB0aGUgZm9sbG93aW5nIGxvY2FsIGV4dGVuc2lvbnM6ICR7cHJpbnRFeHRJZHModGhpcy5fbXlSZWdpc3RyeSl9YCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RvcmFnZSA9IG5ldyBFeHRIb3N0U3RvcmFnZSh0aGlzLl9leHRIb3N0Q29udGV4dCwgdGhpcy5fbG9nU2VydmljZSk7XG5cdFx0dGhpcy5fc2VjcmV0U3RhdGUgPSBuZXcgRXh0SG9zdFNlY3JldFN0YXRlKHRoaXMuX2V4dEhvc3RDb250ZXh0KTtcblx0XHR0aGlzLl9zdG9yYWdlUGF0aCA9IHN0b3JhZ2VQYXRoO1xuXG5cdFx0dGhpcy5faW5zdGFTZXJ2aWNlID0gdGhpcy5fc3RvcmUuYWRkKGluc3RhU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUV4dEhvc3RTdG9yYWdlLCB0aGlzLl9zdG9yYWdlXSxcblx0XHRcdFtJRXh0SG9zdFNlY3JldFN0YXRlLCB0aGlzLl9zZWNyZXRTdGF0ZV1cblx0XHQpKSk7XG5cblx0XHR0aGlzLl9hY3RpdmF0b3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRXh0ZW5zaW9uc0FjdGl2YXRvcihcblx0XHRcdHRoaXMuX215UmVnaXN0cnksXG5cdFx0XHR0aGlzLl9nbG9iYWxSZWdpc3RyeSxcblx0XHRcdHtcblx0XHRcdFx0b25FeHRlbnNpb25BY3RpdmF0aW9uRXJyb3I6IChleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgZXJyb3I6IEVycm9yLCBtaXNzaW5nRXh0ZW5zaW9uRGVwZW5kZW5jeTogTWlzc2luZ0V4dGVuc2lvbkRlcGVuZGVuY3kgfCBudWxsKTogdm9pZCA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fbWFpblRocmVhZEV4dGVuc2lvbnNQcm94eS4kb25FeHRlbnNpb25BY3RpdmF0aW9uRXJyb3IoZXh0ZW5zaW9uSWQsIGVycm9ycy50cmFuc2Zvcm1FcnJvckZvclNlcmlhbGl6YXRpb24oZXJyb3IpLCBtaXNzaW5nRXh0ZW5zaW9uRGVwZW5kZW5jeSk7XG5cdFx0XHRcdH0sXG5cblx0XHRcdFx0YWN0dWFsQWN0aXZhdGVFeHRlbnNpb246IGFzeW5jIChleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgcmVhc29uOiBFeHRlbnNpb25BY3RpdmF0aW9uUmVhc29uKTogUHJvbWlzZTxBY3RpdmF0ZWRFeHRlbnNpb24+ID0+IHtcblx0XHRcdFx0XHRpZiAoRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeS5pc0hvc3RFeHRlbnNpb24oZXh0ZW5zaW9uSWQsIHRoaXMuX215UmVnaXN0cnksIHRoaXMuX2dsb2JhbFJlZ2lzdHJ5KSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fbWFpblRocmVhZEV4dGVuc2lvbnNQcm94eS4kYWN0aXZhdGVFeHRlbnNpb24oZXh0ZW5zaW9uSWQsIHJlYXNvbik7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IEhvc3RFeHRlbnNpb24oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uRGVzY3JpcHRpb24gPSB0aGlzLl9teVJlZ2lzdHJ5LmdldEV4dGVuc2lvbkRlc2NyaXB0aW9uKGV4dGVuc2lvbklkKSE7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2FjdGl2YXRlRXh0ZW5zaW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uLCByZWFzb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0dGhpcy5fbG9nU2VydmljZVxuXHRcdCkpO1xuXHRcdHRoaXMuX2V4dGVuc2lvblBhdGhJbmRleCA9IG51bGw7XG5cdFx0dGhpcy5fcmVzb2x2ZXJzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl9zdGFydGVkID0gZmFsc2U7XG5cdFx0dGhpcy5fcmVtb3RlQ29ubmVjdGlvbkRhdGEgPSB0aGlzLl9pbml0RGF0YS5yZW1vdGUuY29ubmVjdGlvbkRhdGE7XG5cblx0XHQvLyByZXBvcnQgdGVsZW1ldHJ5IHdoZW4gYW4gZXh0ZW5zaW9uIGF0dGVtcHRzIHRvIHVzZSBhIHByb3Bvc2VkIEFQSSBpdCBpcyBub3QgZW50aXRsZWQgdG8gdXNlXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2V0UHJvcG9zZWRBcGlVc2FnZVJlcG9ydGVyKHVzYWdlID0+IHRoaXMuX3JlcG9ydFByb3Bvc2VkQXBpVXNhZ2UodXNhZ2UpKSk7XG5cblx0XHQvLyBleHBlcmltZW50OiBncmFudCBwcm9wb3NlZCBBUEkgYWNjZXNzIHRvIGV4dGVuc2lvbi9wcm9wb3NhbCBjb21iaW5hdGlvbnMgdGhhdCBoYXZlIG5vdFxuXHRcdC8vIGRlY2xhcmVkIHRoZSBwcm9wb3NhbCB0aGVtc2VsdmVzIChvbmx5IHRha2VzIGVmZmVjdCBvbiBgc3RhYmxlYClcblx0XHR0aGlzLl9yZWdpc3RlcihzZXRFbmFibGVkQXBpUHJvcG9zYWxzRmFsbGJhY2tFeHBlcmltZW50KHRoaXMuX2luaXREYXRhLmVuYWJsZWRBcGlQcm9wb3NhbHNGYWxsYmFjaywgdGhpcy5faW5pdERhdGEucXVhbGl0eSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVwb3J0UHJvcG9zZWRBcGlVc2FnZSh1c2FnZTogSVByb3Bvc2VkQXBpVXNhZ2UpOiB2b2lkIHtcblx0XHR0eXBlIFByb3Bvc2VkQXBpVXNhZ2VDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnYWxleHIwMCc7XG5cdFx0XHRjb21tZW50OiAnQW4gZXh0ZW5zaW9uIGF0dGVtcHRlZCB0byB1c2UgYSBwcm9wb3NlZCBBUEkgaXQgaGFzIG5vdCBiZWVuIGFsbG93bGlzdGVkIHRvIHVzZS4nO1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaWRlbnRpZmllciBvZiB0aGUgZXh0ZW5zaW9uIGF0dGVtcHRpbmcgdG8gdXNlIHRoZSBwcm9wb3NlZCBBUEkuJyB9O1xuXHRcdFx0cHJvcG9zYWxOYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG5hbWUgb2YgdGhlIHByb3Bvc2VkIEFQSSB0aGUgZXh0ZW5zaW9uIGlzIG5vdCBlbnRpdGxlZCB0byB1c2UuJyB9O1xuXHRcdH07XG5cdFx0dHlwZSBQcm9wb3NlZEFwaVVzYWdlRXZlbnQgPSB7XG5cdFx0XHRleHRlbnNpb25JZDogc3RyaW5nO1xuXHRcdFx0cHJvcG9zYWxOYW1lOiBzdHJpbmc7XG5cdFx0fTtcblx0XHR0aGlzLl9tYWluVGhyZWFkVGVsZW1ldHJ5UHJveHkuJHB1YmxpY0xvZzI8UHJvcG9zZWRBcGlVc2FnZUV2ZW50LCBQcm9wb3NlZEFwaVVzYWdlQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25Qcm9wb3NlZEFwaU5vdEVuYWJsZWQnLCB7XG5cdFx0XHRleHRlbnNpb25JZDogdXNhZ2UuZXh0ZW5zaW9uSWQsXG5cdFx0XHRwcm9wb3NhbE5hbWU6IHVzYWdlLnByb3Bvc2FsTmFtZVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldFJlbW90ZUNvbm5lY3Rpb25EYXRhKCk6IElSZW1vdGVDb25uZWN0aW9uRGF0YSB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9yZW1vdGVDb25uZWN0aW9uRGF0YTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cblx0XHRcdGF3YWl0IHRoaXMuX2JlZm9yZUFsbW9zdFJlYWR5VG9SdW5FeHRlbnNpb25zKCk7XG5cdFx0XHR0aGlzLl9hbG1vc3RSZWFkeVRvUnVuRXh0ZW5zaW9ucy5vcGVuKCk7XG5cblx0XHRcdGF3YWl0IHRoaXMuX2V4dEhvc3RXb3Jrc3BhY2Uud2FpdEZvckluaXRpYWxpemVDYWxsKCk7XG5cdFx0XHRwZXJmb3JtYW5jZS5tYXJrKCdjb2RlL2V4dEhvc3QvcmVhZHknKTtcblx0XHRcdHRoaXMuX3JlYWR5VG9TdGFydEV4dGVuc2lvbkhvc3Qub3BlbigpO1xuXG5cdFx0XHRpZiAodGhpcy5faW5pdERhdGEuYXV0b1N0YXJ0KSB7XG5cdFx0XHRcdHRoaXMuX3N0YXJ0RXh0ZW5zaW9uSG9zdCgpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGVhY3RpdmF0ZUFsbCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9zdG9yYWdlUGF0aC5vbldpbGxEZWFjdGl2YXRlQWxsKCk7XG5cblx0XHRsZXQgYWxsUHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhbGxFeHRlbnNpb25zID0gdGhpcy5fbXlSZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKTtcblx0XHRcdGNvbnN0IGFsbEV4dGVuc2lvbnNJZHMgPSBhbGxFeHRlbnNpb25zLm1hcChleHQgPT4gZXh0LmlkZW50aWZpZXIpO1xuXHRcdFx0Y29uc3QgYWN0aXZhdGVkRXh0ZW5zaW9ucyA9IGFsbEV4dGVuc2lvbnNJZHMuZmlsdGVyKGlkID0+IHRoaXMuaXNBY3RpdmF0ZWQoaWQpKTtcblxuXHRcdFx0YWxsUHJvbWlzZXMgPSBhY3RpdmF0ZWRFeHRlbnNpb25zLm1hcCgoZXh0ZW5zaW9uSWQpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2RlYWN0aXZhdGUoZXh0ZW5zaW9uSWQpO1xuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBUT0RPOiB3cml0ZSB0byBsb2cgb25jZSB3ZSBoYXZlIG9uZVxuXHRcdH1cblx0XHRhd2FpdCBQcm9taXNlLmFsbChhbGxQcm9taXNlcyk7XG5cdH1cblxuXHRwdWJsaWMgdGVybWluYXRlKHJlYXNvbjogc3RyaW5nLCBjb2RlOiBudW1iZXIgPSAwKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzVGVybWluYXRpbmcpIHtcblx0XHRcdC8vIHdlIGFyZSBhbHJlYWR5IHNodXR0aW5nIGRvd24uLi5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faXNUZXJtaW5hdGluZyA9IHRydWU7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBFeHRlbnNpb24gaG9zdCB0ZXJtaW5hdGluZzogJHtyZWFzb259YCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5mbHVzaCgpO1xuXG5cdFx0dGhpcy5fZXh0SG9zdFRlcm1pbmFsU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fYWN0aXZhdG9yLmRpc3Bvc2UoKTtcblxuXHRcdGVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKChlcnIpID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHR9KTtcblxuXHRcdC8vIEludmFsaWRhdGUgYWxsIHByb3hpZXNcblx0XHR0aGlzLl9leHRIb3N0Q29udGV4dC5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCBleHRlbnNpb25zRGVhY3RpdmF0ZWQgPSB0aGlzLl9kZWFjdGl2YXRlQWxsKCk7XG5cblx0XHQvLyBHaXZlIGV4dGVuc2lvbnMgYXQgbW9zdCA1IHNlY29uZHMgdG8gd3JhcCB1cCBhbnkgYXN5bmMgZGVhY3RpdmF0ZSwgdGhlbiBleGl0XG5cdFx0UHJvbWlzZS5yYWNlKFt0aW1lb3V0KDUwMDApLCBleHRlbnNpb25zRGVhY3RpdmF0ZWRdKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9ob3N0VXRpbHMucGlkKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgRXh0ZW5zaW9uIGhvc3Qgd2l0aCBwaWQgJHt0aGlzLl9ob3N0VXRpbHMucGlkfSBleGl0aW5nIHdpdGggY29kZSAke2NvZGV9YCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEV4dGVuc2lvbiBob3N0IGV4aXRpbmcgd2l0aCBjb2RlICR7Y29kZX1gKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZmx1c2goKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5faG9zdFV0aWxzLmV4aXQoY29kZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgaXNBY3RpdmF0ZWQoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fcmVhZHlUb1J1bkV4dGVuc2lvbnMuaXNPcGVuKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9hY3RpdmF0b3IuaXNBY3RpdmF0ZWQoZXh0ZW5zaW9uSWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0RXh0ZW5zaW9uKGV4dGVuc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPElFeHRlbnNpb25EZXNjcmlwdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGV4dCA9IGF3YWl0IHRoaXMuX21haW5UaHJlYWRFeHRlbnNpb25zUHJveHkuJGdldEV4dGVuc2lvbihleHRlbnNpb25JZCk7XG5cdFx0cmV0dXJuIGV4dCAmJiB7XG5cdFx0XHQuLi5leHQsXG5cdFx0XHRpZGVudGlmaWVyOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcihleHQuaWRlbnRpZmllci52YWx1ZSksXG5cdFx0XHRleHRlbnNpb25Mb2NhdGlvbjogVVJJLnJldml2ZShleHQuZXh0ZW5zaW9uTG9jYXRpb24pXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2FjdGl2YXRlQnlFdmVudChhY3RpdmF0aW9uRXZlbnQ6IHN0cmluZywgc3RhcnR1cDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmF0b3IuYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudCwgc3RhcnR1cCk7XG5cdH1cblxuXHRwcml2YXRlIF9hY3RpdmF0ZUJ5SWQoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIHJlYXNvbjogRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmF0b3IuYWN0aXZhdGVCeUlkKGV4dGVuc2lvbklkLCByZWFzb24pO1xuXHR9XG5cblx0cHVibGljIGFjdGl2YXRlQnlJZFdpdGhFcnJvcnMoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIHJlYXNvbjogRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmF0ZUJ5SWQoZXh0ZW5zaW9uSWQsIHJlYXNvbikudGhlbigoKSA9PiB7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLl9hY3RpdmF0b3IuZ2V0QWN0aXZhdGVkRXh0ZW5zaW9uKGV4dGVuc2lvbklkKTtcblx0XHRcdGlmIChleHRlbnNpb24uYWN0aXZhdGlvbkZhaWxlZCkge1xuXHRcdFx0XHQvLyBhY3RpdmF0aW9uIGZhaWxlZCA9PiBidWJibGUgdXAgdGhlIGVycm9yIGFzIHRoZSBwcm9taXNlIHJlc3VsdFxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoZXh0ZW5zaW9uLmFjdGl2YXRpb25GYWlsZWRFcnJvcik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldEV4dGVuc2lvblJlZ2lzdHJ5KCk6IFByb21pc2U8RXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeT4ge1xuXHRcdHJldHVybiB0aGlzLl9yZWFkeVRvUnVuRXh0ZW5zaW9ucy53YWl0KCkudGhlbihfID0+IHRoaXMuX215UmVnaXN0cnkpO1xuXHR9XG5cblx0cHVibGljIGdldEV4dGVuc2lvbkV4cG9ydHMoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIpOiBJRXh0ZW5zaW9uQVBJIHwgbnVsbCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX3JlYWR5VG9SdW5FeHRlbnNpb25zLmlzT3BlbigpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0aXZhdG9yLmdldEFjdGl2YXRlZEV4dGVuc2lvbihleHRlbnNpb25JZCkuZXhwb3J0cztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2FjdGl2YXRvci5nZXRBY3RpdmF0ZWRFeHRlbnNpb24oZXh0ZW5zaW9uSWQpLmV4cG9ydHM7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGxpZXMgcmVhbHBhdGggdG8gZmlsZS11cmlzIGFuZCByZXR1cm5zIGFsbCBvdGhlcnMgdXJpcyB1bm1vZGlmaWVkLlxuXHQgKiBUaGUgcmVhbCBwYXRoIGlzIGNhY2hlZCBmb3IgdGhlIGxpZmV0aW1lIG9mIHRoZSBleHRlbnNpb24gaG9zdC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3JlYWxQYXRoRXh0ZW5zaW9uVXJpKHVyaTogVVJJKTogUHJvbWlzZTxVUkk+IHtcblx0XHRpZiAodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlICYmIHRoaXMuX2hvc3RVdGlscy5mc1JlYWxwYXRoKSB7XG5cdFx0XHRjb25zdCBmc1BhdGggPSB1cmkuZnNQYXRoO1xuXHRcdFx0aWYgKCF0aGlzLl9yZWFsUGF0aENhY2hlLmhhcyhmc1BhdGgpKSB7XG5cdFx0XHRcdHRoaXMuX3JlYWxQYXRoQ2FjaGUuc2V0KGZzUGF0aCwgdGhpcy5faG9zdFV0aWxzLmZzUmVhbHBhdGgoZnNQYXRoKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZWFscGF0aFZhbHVlID0gYXdhaXQgdGhpcy5fcmVhbFBhdGhDYWNoZS5nZXQoZnNQYXRoKSE7XG5cdFx0XHRyZXR1cm4gVVJJLmZpbGUocmVhbHBhdGhWYWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB1cmk7XG5cdH1cblxuXHQvLyBjcmVhdGUgdHJpZSB0byBlbmFibGUgZmFzdCAnZmlsZW5hbWUgLT4gZXh0ZW5zaW9uIGlkJyBsb29rIHVwXG5cdHB1YmxpYyBhc3luYyBnZXRFeHRlbnNpb25QYXRoSW5kZXgoKTogUHJvbWlzZTxFeHRlbnNpb25QYXRocz4ge1xuXHRcdGlmICghdGhpcy5fZXh0ZW5zaW9uUGF0aEluZGV4KSB7XG5cdFx0XHR0aGlzLl9leHRlbnNpb25QYXRoSW5kZXggPSB0aGlzLl9jcmVhdGVFeHRlbnNpb25QYXRoSW5kZXgodGhpcy5fbXlSZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKSkudGhlbigoc2VhcmNoVHJlZSkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gbmV3IEV4dGVuc2lvblBhdGhzKHNlYXJjaFRyZWUpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25QYXRoSW5kZXg7XG5cdH1cblxuXHQvKipcblx0ICogY3JlYXRlIHRyaWUgdG8gZW5hYmxlIGZhc3QgJ2ZpbGVuYW1lIC0+IGV4dGVuc2lvbiBpZCcgbG9vayB1cFxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlRXh0ZW5zaW9uUGF0aEluZGV4KGV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdKTogUHJvbWlzZTxUZXJuYXJ5U2VhcmNoVHJlZTxVUkksIElFeHRlbnNpb25EZXNjcmlwdGlvbj4+IHtcblx0XHRjb25zdCB0c3QgPSBUZXJuYXJ5U2VhcmNoVHJlZS5mb3JVcmlzPElFeHRlbnNpb25EZXNjcmlwdGlvbj4oa2V5ID0+IHtcblx0XHRcdC8vIHVzaW5nIHRoZSBkZWZhdWx0L2JpYXNlZCBleHRVcmktdXRpbCBiZWNhdXNlIHRoZSBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvLXNlcnZpY2Vcblx0XHRcdC8vIGlzbid0IHJlYWR5IHRvIGJlIHVzZWQgeWV0LCBlLmcgdGhlIGtub3dsZWRnZSBhYm91dCBgZmlsZWAgcHJvdG9jb2wgYW5kIG90aGVyc1xuXHRcdFx0Ly8gY29tZXMgaW4gd2hpbGUgdGhpcyBjb2RlIHJ1bnNcblx0XHRcdHJldHVybiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pZ25vcmVQYXRoQ2FzaW5nKGtleSk7XG5cdFx0fSk7XG5cdFx0Ly8gY29uc3QgdHN0ID0gVGVybmFyeVNlYXJjaFRyZWUuZm9yVXJpczxJRXh0ZW5zaW9uRGVzY3JpcHRpb24+KGtleSA9PiB0cnVlKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChleHRlbnNpb25zLm1hcChhc3luYyAoZXh0KSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZ2V0RW50cnlQb2ludChleHQpKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IGF3YWl0IHRoaXMuX3JlYWxQYXRoRXh0ZW5zaW9uVXJpKGV4dC5leHRlbnNpb25Mb2NhdGlvbik7XG5cdFx0XHRcdHRzdC5zZXQodXJpLCBleHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRyZXR1cm4gdHN0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVhY3RpdmF0ZShleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCByZXN1bHQgPSBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdGlmICghdGhpcy5fcmVhZHlUb1J1bkV4dGVuc2lvbnMuaXNPcGVuKCkpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9hY3RpdmF0b3IuaXNBY3RpdmF0ZWQoZXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuX2FjdGl2YXRvci5nZXRBY3RpdmF0ZWRFeHRlbnNpb24oZXh0ZW5zaW9uSWQpO1xuXHRcdGlmICghZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdC8vIGNhbGwgZGVhY3RpdmF0ZSBpZiBhdmFpbGFibGVcblx0XHR0cnkge1xuXHRcdFx0aWYgKHR5cGVvZiBleHRlbnNpb24ubW9kdWxlLmRlYWN0aXZhdGUgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0cmVzdWx0ID0gUHJvbWlzZS5yZXNvbHZlKGV4dGVuc2lvbi5tb2R1bGUuZGVhY3RpdmF0ZSgpKS50aGVuKHVuZGVmaW5lZCwgKGVycikgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgQW4gZXJyb3Igb2NjdXJyZWQgd2hlbiBkZWFjdGl2YXRpbmcgdGhlIGV4dGVuc2lvbiAnJHtleHRlbnNpb25JZC52YWx1ZX0nOmApO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdH1cblxuXHRcdC8vIGNsZWFuIHVwIHN1YnNjcmlwdGlvbnNcblx0XHR0cnkge1xuXHRcdFx0ZXh0ZW5zaW9uLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgQW4gZXJyb3Igb2NjdXJyZWQgd2hlbiBkaXNwb3NpbmcgdGhlIHN1YnNjcmlwdGlvbnMgZm9yIGV4dGVuc2lvbiAnJHtleHRlbnNpb25JZC52YWx1ZX0nOmApO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyAtLS0gaW1wbFxuXG5cdHByaXZhdGUgYXN5bmMgX2FjdGl2YXRlRXh0ZW5zaW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHJlYXNvbjogRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbik6IFByb21pc2U8QWN0aXZhdGVkRXh0ZW5zaW9uPiB7XG5cdFx0aWYgKCF0aGlzLl9pbml0RGF0YS5yZW1vdGUuaXNSZW1vdGUpIHtcblx0XHRcdC8vIGxvY2FsIGV4dGVuc2lvbiBob3N0IHByb2Nlc3Ncblx0XHRcdGF3YWl0IHRoaXMuX21haW5UaHJlYWRFeHRlbnNpb25zUHJveHkuJG9uV2lsbEFjdGl2YXRlRXh0ZW5zaW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyByZW1vdGUgZXh0ZW5zaW9uIGhvc3QgcHJvY2Vzc1xuXHRcdFx0Ly8gZG8gbm90IHdhaXQgZm9yIHJlbmRlcmVyIGNvbmZpcm1hdGlvblxuXHRcdFx0dGhpcy5fbWFpblRocmVhZEV4dGVuc2lvbnNQcm94eS4kb25XaWxsQWN0aXZhdGVFeHRlbnNpb24oZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcik7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9kb0FjdGl2YXRlRXh0ZW5zaW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uLCByZWFzb24pLnRoZW4oKGFjdGl2YXRlZEV4dGVuc2lvbikgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZhdGlvblRpbWVzID0gYWN0aXZhdGVkRXh0ZW5zaW9uLmFjdGl2YXRpb25UaW1lcztcblx0XHRcdHRoaXMuX21haW5UaHJlYWRFeHRlbnNpb25zUHJveHkuJG9uRGlkQWN0aXZhdGVFeHRlbnNpb24oZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllciwgYWN0aXZhdGlvblRpbWVzLmNvZGVMb2FkaW5nVGltZSwgYWN0aXZhdGlvblRpbWVzLmFjdGl2YXRlQ2FsbFRpbWUsIGFjdGl2YXRpb25UaW1lcy5hY3RpdmF0ZVJlc29sdmVkVGltZSwgcmVhc29uKTtcblx0XHRcdHRoaXMuX2xvZ0V4dGVuc2lvbkFjdGl2YXRpb25UaW1lcyhleHRlbnNpb25EZXNjcmlwdGlvbiwgcmVhc29uLCAnc3VjY2VzcycsIGFjdGl2YXRpb25UaW1lcyk7XG5cdFx0XHRyZXR1cm4gYWN0aXZhdGVkRXh0ZW5zaW9uO1xuXHRcdH0sIChlcnIpID0+IHtcblx0XHRcdHRoaXMuX2xvZ0V4dGVuc2lvbkFjdGl2YXRpb25UaW1lcyhleHRlbnNpb25EZXNjcmlwdGlvbiwgcmVhc29uLCAnZmFpbHVyZScpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9nRXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzKGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHJlYXNvbjogRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbiwgb3V0Y29tZTogc3RyaW5nLCBhY3RpdmF0aW9uVGltZXM/OiBFeHRlbnNpb25BY3RpdmF0aW9uVGltZXMpIHtcblx0XHRjb25zdCBldmVudCA9IGdldFRlbGVtZXRyeUFjdGl2YXRpb25FdmVudChleHRlbnNpb25EZXNjcmlwdGlvbiwgcmVhc29uKTtcblx0XHR0eXBlIEV4dGVuc2lvbkFjdGl2YXRpb25UaW1lc0NsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdqcmlla2VuJztcblx0XHRcdGNvbW1lbnQ6ICdUaW1lc3RhbXBzIGZvciBleHRlbnNpb24gYWN0aXZhdGlvbic7XG5cdFx0XHRvdXRjb21lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRGlkIGV4dGVuc2lvbiBhY3RpdmF0aW9uIHN1Y2NlZWQgb3IgZmFpbCcgfTtcblx0XHR9ICYgVGVsZW1ldHJ5QWN0aXZhdGlvbkV2ZW50RnJhZ21lbnQgJiBFeHRlbnNpb25BY3RpdmF0aW9uVGltZXNGcmFnbWVudDtcblxuXHRcdHR5cGUgRXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzRXZlbnQgPSB7XG5cdFx0XHRvdXRjb21lOiBzdHJpbmc7XG5cdFx0fSAmIEFjdGl2YXRpb25UaW1lc0V2ZW50ICYgVGVsZW1ldHJ5QWN0aXZhdGlvbkV2ZW50O1xuXG5cdFx0dHlwZSBBY3RpdmF0aW9uVGltZXNFdmVudCA9IHtcblx0XHRcdHN0YXJ0dXA/OiBib29sZWFuO1xuXHRcdFx0Y29kZUxvYWRpbmdUaW1lPzogbnVtYmVyO1xuXHRcdFx0YWN0aXZhdGVDYWxsVGltZT86IG51bWJlcjtcblx0XHRcdGFjdGl2YXRlUmVzb2x2ZWRUaW1lPzogbnVtYmVyO1xuXHRcdH07XG5cblx0XHR0aGlzLl9tYWluVGhyZWFkVGVsZW1ldHJ5UHJveHkuJHB1YmxpY0xvZzI8RXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzRXZlbnQsIEV4dGVuc2lvbkFjdGl2YXRpb25UaW1lc0NsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzJywge1xuXHRcdFx0Li4uZXZlbnQsXG5cdFx0XHQuLi4oYWN0aXZhdGlvblRpbWVzIHx8IHt9KSxcblx0XHRcdG91dGNvbWVcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2RvQWN0aXZhdGVFeHRlbnNpb24oZXh0ZW5zaW9uRGVzY3JpcHRpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgcmVhc29uOiBFeHRlbnNpb25BY3RpdmF0aW9uUmVhc29uKTogUHJvbWlzZTxBY3RpdmF0ZWRFeHRlbnNpb24+IHtcblx0XHRjb25zdCBldmVudCA9IGdldFRlbGVtZXRyeUFjdGl2YXRpb25FdmVudChleHRlbnNpb25EZXNjcmlwdGlvbiwgcmVhc29uKTtcblx0XHR0eXBlIEFjdGl2YXRlUGx1Z2luQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2pyaWVrZW4nO1xuXHRcdFx0Y29tbWVudDogJ0RhdGEgYWJvdXQgaG93L3doeSBhbiBleHRlbnNpb24gd2FzIGFjdGl2YXRlZCc7XG5cdFx0fSAmIFRlbGVtZXRyeUFjdGl2YXRpb25FdmVudEZyYWdtZW50O1xuXHRcdHRoaXMuX21haW5UaHJlYWRUZWxlbWV0cnlQcm94eS4kcHVibGljTG9nMjxUZWxlbWV0cnlBY3RpdmF0aW9uRXZlbnQsIEFjdGl2YXRlUGx1Z2luQ2xhc3NpZmljYXRpb24+KCdhY3RpdmF0ZVBsdWdpbicsIGV2ZW50KTtcblx0XHRjb25zdCBlbnRyeVBvaW50ID0gdGhpcy5fZ2V0RW50cnlQb2ludChleHRlbnNpb25EZXNjcmlwdGlvbik7XG5cdFx0aWYgKCFlbnRyeVBvaW50KSB7XG5cdFx0XHQvLyBUcmVhdCB0aGUgZXh0ZW5zaW9uIGFzIGJlaW5nIGVtcHR5ID0+IE5PVCBBTiBFUlJPUiBDQVNFXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5ldyBFbXB0eUV4dGVuc2lvbihFeHRlbnNpb25BY3RpdmF0aW9uVGltZXMuTk9ORSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgRXh0ZW5zaW9uU2VydmljZSNfZG9BY3RpdmF0ZUV4dGVuc2lvbiAke2V4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWV9LCBzdGFydHVwOiAke3JlYXNvbi5zdGFydHVwfSwgYWN0aXZhdGlvbkV2ZW50OiAnJHtyZWFzb24uYWN0aXZhdGlvbkV2ZW50fScke2V4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUgIT09IHJlYXNvbi5leHRlbnNpb25JZC52YWx1ZSA/IGAsIHJvb3QgY2F1c2U6ICR7cmVhc29uLmV4dGVuc2lvbklkLnZhbHVlfWAgOiBgYH1gKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmZsdXNoKCk7XG5cblx0XHRjb25zdCBpc0VTTSA9IHRoaXMuX2lzRVNNKGV4dGVuc2lvbkRlc2NyaXB0aW9uKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbkludGVybmFsU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7IC8vIGRpc3Bvc2FibGVzIHRoYXQgZm9sbG93IHRoZSBleHRlbnNpb24gbGlmZWN5Y2xlXG5cdFx0Y29uc3QgYWN0aXZhdGlvblRpbWVzQnVpbGRlciA9IG5ldyBFeHRlbnNpb25BY3RpdmF0aW9uVGltZXNCdWlsZGVyKHJlYXNvbi5zdGFydHVwKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoW1xuXHRcdFx0aXNFU01cblx0XHRcdFx0PyB0aGlzLl9sb2FkRVNNTW9kdWxlPElFeHRlbnNpb25Nb2R1bGU+KGV4dGVuc2lvbkRlc2NyaXB0aW9uLCBqb2luUGF0aChleHRlbnNpb25EZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbiwgZW50cnlQb2ludCksIGFjdGl2YXRpb25UaW1lc0J1aWxkZXIpXG5cdFx0XHRcdDogdGhpcy5fbG9hZENvbW1vbkpTTW9kdWxlPElFeHRlbnNpb25Nb2R1bGU+KGV4dGVuc2lvbkRlc2NyaXB0aW9uLCBqb2luUGF0aChleHRlbnNpb25EZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbiwgZW50cnlQb2ludCksIGFjdGl2YXRpb25UaW1lc0J1aWxkZXIpLFxuXHRcdFx0dGhpcy5fbG9hZEV4dGVuc2lvbkNvbnRleHQoZXh0ZW5zaW9uRGVzY3JpcHRpb24sIGV4dGVuc2lvbkludGVybmFsU3RvcmUpXG5cdFx0XSkudGhlbih2YWx1ZXMgPT4ge1xuXHRcdFx0cGVyZm9ybWFuY2UubWFyayhgY29kZS9leHRIb3N0L3dpbGxBY3RpdmF0ZUV4dGVuc2lvbi8ke2V4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWV9YCk7XG5cdFx0XHRyZXR1cm4gQWJzdHJhY3RFeHRIb3N0RXh0ZW5zaW9uU2VydmljZS5fY2FsbEFjdGl2YXRlKHRoaXMuX2xvZ1NlcnZpY2UsIGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsIHZhbHVlc1swXSwgdmFsdWVzWzFdLCBleHRlbnNpb25JbnRlcm5hbFN0b3JlLCBhY3RpdmF0aW9uVGltZXNCdWlsZGVyKTtcblx0XHR9KS50aGVuKChhY3RpdmF0ZWRFeHRlbnNpb24pID0+IHtcblx0XHRcdHBlcmZvcm1hbmNlLm1hcmsoYGNvZGUvZXh0SG9zdC9kaWRBY3RpdmF0ZUV4dGVuc2lvbi8ke2V4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWV9YCk7XG5cdFx0XHRyZXR1cm4gYWN0aXZhdGVkRXh0ZW5zaW9uO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9hZEV4dGVuc2lvbkNvbnRleHQoZXh0ZW5zaW9uRGVzY3JpcHRpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgZXh0ZW5zaW9uSW50ZXJuYWxTdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogUHJvbWlzZTx2c2NvZGUuRXh0ZW5zaW9uQ29udGV4dD4ge1xuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbEFjY2Vzc0luZm9ybWF0aW9uID0gdGhpcy5fZXh0SG9zdExhbmd1YWdlTW9kZWxzLmNyZWF0ZUxhbmd1YWdlTW9kZWxBY2Nlc3NJbmZvcm1hdGlvbihleHRlbnNpb25EZXNjcmlwdGlvbik7XG5cdFx0Y29uc3QgZ2xvYmFsU3RhdGUgPSBleHRlbnNpb25JbnRlcm5hbFN0b3JlLmFkZChuZXcgRXh0ZW5zaW9uR2xvYmFsTWVtZW50byhleHRlbnNpb25EZXNjcmlwdGlvbiwgdGhpcy5fc3RvcmFnZSkpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVN0YXRlID0gZXh0ZW5zaW9uSW50ZXJuYWxTdG9yZS5hZGQobmV3IEV4dGVuc2lvbk1lbWVudG8oZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSwgZmFsc2UsIHRoaXMuX3N0b3JhZ2UpKTtcblx0XHRjb25zdCBzZWNyZXRzID0gZXh0ZW5zaW9uSW50ZXJuYWxTdG9yZS5hZGQobmV3IEV4dGVuc2lvblNlY3JldHMoZXh0ZW5zaW9uRGVzY3JpcHRpb24sIHRoaXMuX3NlY3JldFN0YXRlKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uTW9kZSA9IGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlzVW5kZXJEZXZlbG9wbWVudFxuXHRcdFx0PyAodGhpcy5faW5pdERhdGEuZW52aXJvbm1lbnQuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSA/IEV4dGVuc2lvbk1vZGUuVGVzdCA6IEV4dGVuc2lvbk1vZGUuRGV2ZWxvcG1lbnQpXG5cdFx0XHQ6IEV4dGVuc2lvbk1vZGUuUHJvZHVjdGlvbjtcblx0XHRjb25zdCBleHRlbnNpb25LaW5kID0gdGhpcy5faW5pdERhdGEucmVtb3RlLmlzUmVtb3RlID8gRXh0ZW5zaW9uS2luZC5Xb3Jrc3BhY2UgOiBFeHRlbnNpb25LaW5kLlVJO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgRXh0ZW5zaW9uU2VydmljZSNsb2FkRXh0ZW5zaW9uQ29udGV4dCAke2V4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWV9YCk7XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoW1xuXHRcdFx0Z2xvYmFsU3RhdGUud2hlblJlYWR5LFxuXHRcdFx0d29ya3NwYWNlU3RhdGUud2hlblJlYWR5LFxuXHRcdFx0dGhpcy5fc3RvcmFnZVBhdGgud2hlblJlYWR5XG5cdFx0XSkudGhlbigoKSA9PiB7XG5cdFx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRcdGxldCBleHRlbnNpb246IHZzY29kZS5FeHRlbnNpb248YW55PiB8IHVuZGVmaW5lZDtcblxuXHRcdFx0bGV0IG1lc3NhZ2VQYXNzaW5nUHJvdG9jb2w6IHZzY29kZS5NZXNzYWdlUGFzc2luZ1Byb3RvY29sIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgbWVzc2FnZVBvcnQgPSBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb25EZXNjcmlwdGlvbiwgJ2lwYycpXG5cdFx0XHRcdD8gdGhpcy5faW5pdERhdGEubWVzc2FnZVBvcnRzPy5nZXQoRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyKSlcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRcdHJldHVybiBPYmplY3QuZnJlZXplPHZzY29kZS5FeHRlbnNpb25Db250ZXh0Pih7XG5cdFx0XHRcdGdsb2JhbFN0YXRlLFxuXHRcdFx0XHR3b3Jrc3BhY2VTdGF0ZSxcblx0XHRcdFx0c2VjcmV0cyxcblx0XHRcdFx0c3Vic2NyaXB0aW9uczogW10sXG5cdFx0XHRcdGdldCBsYW5ndWFnZU1vZGVsQWNjZXNzSW5mb3JtYXRpb24oKSB7IHJldHVybiBsYW5ndWFnZU1vZGVsQWNjZXNzSW5mb3JtYXRpb247IH0sXG5cdFx0XHRcdGdldCBleHRlbnNpb25VcmkoKSB7IHJldHVybiBleHRlbnNpb25EZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbjsgfSxcblx0XHRcdFx0Z2V0IGV4dGVuc2lvblBhdGgoKSB7IHJldHVybiBleHRlbnNpb25EZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbi5mc1BhdGg7IH0sXG5cdFx0XHRcdGFzQWJzb2x1dGVQYXRoKHJlbGF0aXZlUGF0aDogc3RyaW5nKSB7IHJldHVybiBwYXRoLmpvaW4oZXh0ZW5zaW9uRGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24uZnNQYXRoLCByZWxhdGl2ZVBhdGgpOyB9LFxuXHRcdFx0XHRnZXQgc3RvcmFnZVBhdGgoKSB7IHJldHVybiB0aGF0Ll9zdG9yYWdlUGF0aC53b3Jrc3BhY2VWYWx1ZShleHRlbnNpb25EZXNjcmlwdGlvbik/LmZzUGF0aDsgfSxcblx0XHRcdFx0Z2V0IGdsb2JhbFN0b3JhZ2VQYXRoKCkgeyByZXR1cm4gdGhhdC5fc3RvcmFnZVBhdGguZ2xvYmFsVmFsdWUoZXh0ZW5zaW9uRGVzY3JpcHRpb24pLmZzUGF0aDsgfSxcblx0XHRcdFx0Z2V0IGxvZ1BhdGgoKSB7IHJldHVybiBwYXRoLmpvaW4odGhhdC5faW5pdERhdGEubG9nc0xvY2F0aW9uLmZzUGF0aCwgZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSk7IH0sXG5cdFx0XHRcdGdldCBsb2dVcmkoKSB7IHJldHVybiBVUkkuam9pblBhdGgodGhhdC5faW5pdERhdGEubG9nc0xvY2F0aW9uLCBleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlKTsgfSxcblx0XHRcdFx0Z2V0IHN0b3JhZ2VVcmkoKSB7IHJldHVybiB0aGF0Ll9zdG9yYWdlUGF0aC53b3Jrc3BhY2VWYWx1ZShleHRlbnNpb25EZXNjcmlwdGlvbik7IH0sXG5cdFx0XHRcdGdldCBnbG9iYWxTdG9yYWdlVXJpKCkgeyByZXR1cm4gdGhhdC5fc3RvcmFnZVBhdGguZ2xvYmFsVmFsdWUoZXh0ZW5zaW9uRGVzY3JpcHRpb24pOyB9LFxuXHRcdFx0XHRnZXQgZXh0ZW5zaW9uTW9kZSgpIHsgcmV0dXJuIGV4dGVuc2lvbk1vZGU7IH0sXG5cdFx0XHRcdGdldCBleHRlbnNpb24oKSB7XG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24gPSBuZXcgRXh0ZW5zaW9uKHRoYXQsIGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsIGV4dGVuc2lvbkRlc2NyaXB0aW9uLCBleHRlbnNpb25LaW5kLCBmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBleHRlbnNpb247XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldCBleHRlbnNpb25SdW50aW1lKCkge1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbkRlc2NyaXB0aW9uLCAnZXh0ZW5zaW9uUnVudGltZScpO1xuXHRcdFx0XHRcdHJldHVybiB0aGF0LmV4dGVuc2lvblJ1bnRpbWU7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldCBlbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbigpIHsgcmV0dXJuIHRoYXQuX2V4dEhvc3RUZXJtaW5hbFNlcnZpY2UuZ2V0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oZXh0ZW5zaW9uRGVzY3JpcHRpb24pOyB9LFxuXHRcdFx0XHRnZXQgbWVzc2FnZVBhc3NpbmdQcm90b2NvbCgpIHtcblx0XHRcdFx0XHRpZiAoIW1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wpIHtcblx0XHRcdFx0XHRcdGlmICghbWVzc2FnZVBvcnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3Qgb25EaWRSZWNlaXZlTWVzc2FnZSA9IEV2ZW50LmJ1ZmZlcihFdmVudC5mcm9tRE9NRXZlbnRFbWl0dGVyKG1lc3NhZ2VQb3J0LCAnbWVzc2FnZScsIGUgPT4gZS5kYXRhKSwgJ29uRGlkUmVjZWl2ZU1lc3NhZ2UnKTtcblx0XHRcdFx0XHRcdG1lc3NhZ2VQb3J0LnN0YXJ0KCk7XG5cdFx0XHRcdFx0XHRtZXNzYWdlUGFzc2luZ1Byb3RvY29sID0ge1xuXHRcdFx0XHRcdFx0XHRvbkRpZFJlY2VpdmVNZXNzYWdlLFxuXHRcdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0XHRcdFx0cG9zdE1lc3NhZ2U6IG1lc3NhZ2VQb3J0LnBvc3RNZXNzYWdlLmJpbmQobWVzc2FnZVBvcnQpIGFzIGFueVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gbWVzc2FnZVBhc3NpbmdQcm90b2NvbDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY2FsbEFjdGl2YXRlKGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLCBleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgZXh0ZW5zaW9uTW9kdWxlOiBJRXh0ZW5zaW9uTW9kdWxlLCBjb250ZXh0OiB2c2NvZGUuRXh0ZW5zaW9uQ29udGV4dCwgZXh0ZW5zaW9uSW50ZXJuYWxTdG9yZTogSURpc3Bvc2FibGUsIGFjdGl2YXRpb25UaW1lc0J1aWxkZXI6IEV4dGVuc2lvbkFjdGl2YXRpb25UaW1lc0J1aWxkZXIpOiBQcm9taXNlPEFjdGl2YXRlZEV4dGVuc2lvbj4ge1xuXHRcdC8vIE1ha2Ugc3VyZSB0aGUgZXh0ZW5zaW9uJ3Mgc3VyZmFjZSBpcyBub3QgdW5kZWZpbmVkXG5cdFx0ZXh0ZW5zaW9uTW9kdWxlID0gZXh0ZW5zaW9uTW9kdWxlIHx8IHtcblx0XHRcdGFjdGl2YXRlOiB1bmRlZmluZWQsXG5cdFx0XHRkZWFjdGl2YXRlOiB1bmRlZmluZWRcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHRoaXMuX2NhbGxBY3RpdmF0ZU9wdGlvbmFsKGxvZ1NlcnZpY2UsIGV4dGVuc2lvbklkLCBleHRlbnNpb25Nb2R1bGUsIGNvbnRleHQsIGFjdGl2YXRpb25UaW1lc0J1aWxkZXIpLnRoZW4oKGV4dGVuc2lvbkV4cG9ydHMpID0+IHtcblx0XHRcdHJldHVybiBuZXcgQWN0aXZhdGVkRXh0ZW5zaW9uKGZhbHNlLCBudWxsLCBhY3RpdmF0aW9uVGltZXNCdWlsZGVyLmJ1aWxkKCksIGV4dGVuc2lvbk1vZHVsZSwgZXh0ZW5zaW9uRXhwb3J0cywgdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0ZXh0ZW5zaW9uSW50ZXJuYWxTdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdGRpc3Bvc2UoY29udGV4dC5zdWJzY3JpcHRpb25zKTtcblx0XHRcdH0pKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jYWxsQWN0aXZhdGVPcHRpb25hbChsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSwgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGV4dGVuc2lvbk1vZHVsZTogSUV4dGVuc2lvbk1vZHVsZSwgY29udGV4dDogdnNjb2RlLkV4dGVuc2lvbkNvbnRleHQsIGFjdGl2YXRpb25UaW1lc0J1aWxkZXI6IEV4dGVuc2lvbkFjdGl2YXRpb25UaW1lc0J1aWxkZXIpOiBQcm9taXNlPElFeHRlbnNpb25BUEk+IHtcblx0XHRpZiAodHlwZW9mIGV4dGVuc2lvbk1vZHVsZS5hY3RpdmF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YWN0aXZhdGlvblRpbWVzQnVpbGRlci5hY3RpdmF0ZUNhbGxTdGFydCgpO1xuXHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKGBFeHRlbnNpb25TZXJ2aWNlI19jYWxsQWN0aXZhdGVPcHRpb25hbCAke2V4dGVuc2lvbklkLnZhbHVlfWApO1xuXHRcdFx0XHRjb25zdCBhY3RpdmF0ZVJlc3VsdDogUHJvbWlzZTxJRXh0ZW5zaW9uQVBJPiA9IGV4dGVuc2lvbk1vZHVsZS5hY3RpdmF0ZS5hcHBseShnbG9iYWxUaGlzLCBbY29udGV4dF0pO1xuXHRcdFx0XHRhY3RpdmF0aW9uVGltZXNCdWlsZGVyLmFjdGl2YXRlQ2FsbFN0b3AoKTtcblxuXHRcdFx0XHRhY3RpdmF0aW9uVGltZXNCdWlsZGVyLmFjdGl2YXRlUmVzb2x2ZVN0YXJ0KCk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoYWN0aXZhdGVSZXN1bHQpLnRoZW4oKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0YWN0aXZhdGlvblRpbWVzQnVpbGRlci5hY3RpdmF0ZVJlc29sdmVTdG9wKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTm8gYWN0aXZhdGUgZm91bmQgPT4gdGhlIG1vZHVsZSBpcyB0aGUgZXh0ZW5zaW9uJ3MgZXhwb3J0c1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZTxJRXh0ZW5zaW9uQVBJPihleHRlbnNpb25Nb2R1bGUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tIGVhZ2VyIGFjdGl2YXRpb25cblxuXHRwcml2YXRlIF9hY3RpdmF0ZU9uZVN0YXJ0dXBGaW5pc2hlZChkZXNjOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGFjdGl2YXRpb25FdmVudDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZhdGVCeUlkKGRlc2MuaWRlbnRpZmllciwge1xuXHRcdFx0c3RhcnR1cDogZmFsc2UsXG5cdFx0XHRleHRlbnNpb25JZDogZGVzYy5pZGVudGlmaWVyLFxuXHRcdFx0YWN0aXZhdGlvbkV2ZW50OiBhY3RpdmF0aW9uRXZlbnRcblx0XHR9KS50aGVuKHVuZGVmaW5lZCwgKGVycikgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aXZhdGVBbGxTdGFydHVwRmluaXNoZWREZWZlcnJlZChleHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSwgc3RhcnQ6IG51bWJlciA9IDApOiB2b2lkIHtcblx0XHRjb25zdCB0aW1lQnVkZ2V0ID0gNTA7IC8vIDUwIG1pbGxpc2Vjb25kc1xuXHRcdGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cblx0XHRzZXRUaW1lb3V0MCgoKSA9PiB7XG5cdFx0XHRmb3IgKGxldCBpID0gc3RhcnQ7IGkgPCBleHRlbnNpb25zLmxlbmd0aDsgaSArPSAxKSB7XG5cdFx0XHRcdGNvbnN0IGRlc2MgPSBleHRlbnNpb25zW2ldO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGFjdGl2YXRpb25FdmVudCBvZiAoZGVzYy5hY3RpdmF0aW9uRXZlbnRzID8/IFtdKSkge1xuXHRcdFx0XHRcdGlmIChhY3RpdmF0aW9uRXZlbnQgPT09ICdvblN0YXJ0dXBGaW5pc2hlZCcpIHtcblx0XHRcdFx0XHRcdGlmIChEYXRlLm5vdygpIC0gc3RhcnRUaW1lID4gdGltZUJ1ZGdldCkge1xuXHRcdFx0XHRcdFx0XHQvLyB0aW1lIGJ1ZGdldCBmb3IgY3VycmVudCB0YXNrIGhhcyBiZWVuIGV4Y2VlZGVkXG5cdFx0XHRcdFx0XHRcdC8vIHNldCBhIG5ldyB0YXNrIHRvIGFjdGl2YXRlIGN1cnJlbnQgYW5kIHJlbWFpbmluZyBleHRlbnNpb25zXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2FjdGl2YXRlQWxsU3RhcnR1cEZpbmlzaGVkRGVmZXJyZWQoZXh0ZW5zaW9ucywgaSk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fYWN0aXZhdGVPbmVTdGFydHVwRmluaXNoZWQoZGVzYywgYWN0aXZhdGlvbkV2ZW50KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2FjdGl2YXRlQWxsU3RhcnR1cEZpbmlzaGVkKCk6IHZvaWQge1xuXHRcdC8vIHN0YXJ0dXAgaXMgY29uc2lkZXJlZCBmaW5pc2hlZFxuXHRcdHRoaXMuX21haW5UaHJlYWRFeHRlbnNpb25zUHJveHkuJHNldFBlcmZvcm1hbmNlTWFya3MocGVyZm9ybWFuY2UuZ2V0TWFya3MoKSk7XG5cblx0XHR0aGlzLl9leHRIb3N0Q29uZmlndXJhdGlvbi5nZXRDb25maWdQcm92aWRlcigpLnRoZW4oKGNvbmZpZ1Byb3ZpZGVyKSA9PiB7XG5cdFx0XHRjb25zdCBzaG91bGREZWZlckFjdGl2YXRpb24gPSBjb25maWdQcm92aWRlci5nZXRDb25maWd1cmF0aW9uKCdleHRlbnNpb25zLmV4cGVyaW1lbnRhbCcpLmdldDxib29sZWFuPignZGVmZXJyZWRTdGFydHVwRmluaXNoZWRBY3RpdmF0aW9uJyk7XG5cdFx0XHRjb25zdCBhbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMgPSB0aGlzLl9teVJlZ2lzdHJ5LmdldEFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucygpO1xuXHRcdFx0aWYgKHNob3VsZERlZmVyQWN0aXZhdGlvbikge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmF0ZUFsbFN0YXJ0dXBGaW5pc2hlZERlZmVycmVkKGFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGRlc2Mgb2YgYWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKSB7XG5cdFx0XHRcdFx0aWYgKGRlc2MuYWN0aXZhdGlvbkV2ZW50cykge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBhY3RpdmF0aW9uRXZlbnQgb2YgZGVzYy5hY3RpdmF0aW9uRXZlbnRzKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChhY3RpdmF0aW9uRXZlbnQgPT09ICdvblN0YXJ0dXBGaW5pc2hlZCcpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9hY3RpdmF0ZU9uZVN0YXJ0dXBGaW5pc2hlZChkZXNjLCBhY3RpdmF0aW9uRXZlbnQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvLyBIYW5kbGUgXCJlYWdlclwiIGFjdGl2YXRpb24gZXh0ZW5zaW9uc1xuXHRwcml2YXRlIF9oYW5kbGVFYWdlckV4dGVuc2lvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc3RhckFjdGl2YXRpb24gPSB0aGlzLl9hY3RpdmF0ZUJ5RXZlbnQoJyonLCB0cnVlKS50aGVuKHVuZGVmaW5lZCwgKGVycikgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZXh0SG9zdFdvcmtzcGFjZS5vbkRpZENoYW5nZVdvcmtzcGFjZSgoZSkgPT4gdGhpcy5faGFuZGxlV29ya3NwYWNlQ29udGFpbnNFYWdlckV4dGVuc2lvbnMoZS5hZGRlZCkpKTtcblx0XHRjb25zdCBmb2xkZXJzID0gdGhpcy5fZXh0SG9zdFdvcmtzcGFjZS53b3Jrc3BhY2UgPyB0aGlzLl9leHRIb3N0V29ya3NwYWNlLndvcmtzcGFjZS5mb2xkZXJzIDogW107XG5cdFx0Y29uc3Qgd29ya3NwYWNlQ29udGFpbnNBY3RpdmF0aW9uID0gdGhpcy5faGFuZGxlV29ya3NwYWNlQ29udGFpbnNFYWdlckV4dGVuc2lvbnMoZm9sZGVycyk7XG5cdFx0Y29uc3QgcmVtb3RlUmVzb2x2ZXJBY3RpdmF0aW9uID0gdGhpcy5faGFuZGxlUmVtb3RlUmVzb2x2ZXJFYWdlckV4dGVuc2lvbnMoKTtcblx0XHRjb25zdCBlYWdlckV4dGVuc2lvbnNBY3RpdmF0aW9uID0gUHJvbWlzZS5hbGwoW3JlbW90ZVJlc29sdmVyQWN0aXZhdGlvbiwgc3RhckFjdGl2YXRpb24sIHdvcmtzcGFjZUNvbnRhaW5zQWN0aXZhdGlvbl0pLnRoZW4oKCkgPT4geyB9KTtcblxuXHRcdFByb21pc2UucmFjZShbZWFnZXJFeHRlbnNpb25zQWN0aXZhdGlvbiwgdGltZW91dCgxMDAwMCldKS50aGVuKCgpID0+IHtcblx0XHRcdHRoaXMuX2FjdGl2YXRlQWxsU3RhcnR1cEZpbmlzaGVkKCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZWFnZXJFeHRlbnNpb25zQWN0aXZhdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVdvcmtzcGFjZUNvbnRhaW5zRWFnZXJFeHRlbnNpb25zKGZvbGRlcnM6IFJlYWRvbmx5QXJyYXk8dnNjb2RlLldvcmtzcGFjZUZvbGRlcj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZm9sZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoXG5cdFx0XHR0aGlzLl9teVJlZ2lzdHJ5LmdldEFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucygpLm1hcCgoZGVzYykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlV29ya3NwYWNlQ29udGFpbnNFYWdlckV4dGVuc2lvbihmb2xkZXJzLCBkZXNjKTtcblx0XHRcdH0pXG5cdFx0KS50aGVuKCgpID0+IHsgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVXb3Jrc3BhY2VDb250YWluc0VhZ2VyRXh0ZW5zaW9uKGZvbGRlcnM6IFJlYWRvbmx5QXJyYXk8dnNjb2RlLldvcmtzcGFjZUZvbGRlcj4sIGRlc2M6IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmlzQWN0aXZhdGVkKGRlc2MuaWRlbnRpZmllcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsb2NhbFdpdGhSZW1vdGUgPSAhdGhpcy5faW5pdERhdGEucmVtb3RlLmlzUmVtb3RlICYmICEhdGhpcy5faW5pdERhdGEucmVtb3RlLmF1dGhvcml0eTtcblx0XHRjb25zdCBob3N0OiBJRXh0ZW5zaW9uQWN0aXZhdGlvbkhvc3QgPSB7XG5cdFx0XHRsb2dTZXJ2aWNlOiB0aGlzLl9sb2dTZXJ2aWNlLFxuXHRcdFx0Zm9sZGVyczogZm9sZGVycy5tYXAoZm9sZGVyID0+IGZvbGRlci51cmkpLFxuXHRcdFx0Zm9yY2VVc2luZ1NlYXJjaDogbG9jYWxXaXRoUmVtb3RlIHx8ICF0aGlzLl9ob3N0VXRpbHMuZnNFeGlzdHMsXG5cdFx0XHRleGlzdHM6ICh1cmkpID0+IHRoaXMuX2hvc3RVdGlscy5mc0V4aXN0cyEodXJpLmZzUGF0aCksXG5cdFx0XHRjaGVja0V4aXN0czogKGZvbGRlcnMsIGluY2x1ZGVzLCB0b2tlbikgPT4gdGhpcy5fbWFpblRocmVhZFdvcmtzcGFjZVByb3h5LiRjaGVja0V4aXN0cyhmb2xkZXJzLCBpbmNsdWRlcywgdG9rZW4pXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNoZWNrQWN0aXZhdGVXb3Jrc3BhY2VDb250YWluc0V4dGVuc2lvbihob3N0LCBkZXNjKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiAoXG5cdFx0XHR0aGlzLl9hY3RpdmF0ZUJ5SWQoZGVzYy5pZGVudGlmaWVyLCB7IHN0YXJ0dXA6IHRydWUsIGV4dGVuc2lvbklkOiBkZXNjLmlkZW50aWZpZXIsIGFjdGl2YXRpb25FdmVudDogcmVzdWx0LmFjdGl2YXRpb25FdmVudCB9KVxuXHRcdFx0XHQudGhlbih1bmRlZmluZWQsIGVyciA9PiB0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycikpXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVJlbW90ZVJlc29sdmVyRWFnZXJFeHRlbnNpb25zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9pbml0RGF0YS5yZW1vdGUuYXV0aG9yaXR5KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0aXZhdGVCeUV2ZW50KGBvblJlc29sdmVSZW1vdGVBdXRob3JpdHk6JHt0aGlzLl9pbml0RGF0YS5yZW1vdGUuYXV0aG9yaXR5fWAsIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGV4dGVuc2lvblRlc3RzRXhlY3V0ZSgpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGF3YWl0IHRoaXMuX2VhZ2VyRXh0ZW5zaW9uc0FjdGl2YXRlZC53YWl0KCk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9kb0hhbmRsZUV4dGVuc2lvblRlc3RzKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyb3IpOyAvLyBlbnN1cmUgYW55IGVycm9yIG1lc3NhZ2UgbWFrZXMgaXQgb250byB0aGUgY29uc29sZVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9IYW5kbGVFeHRlbnNpb25UZXN0cygpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IHsgZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSSwgZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSB9ID0gdGhpcy5faW5pdERhdGEuZW52aXJvbm1lbnQ7XG5cdFx0aWYgKCFleHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJIHx8ICFleHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdleHRlbnNpb25UZXN0RXJyb3IxJywgXCJDYW5ub3QgbG9hZCB0ZXN0IHJ1bm5lci5cIikpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbkRlc2NyaXB0aW9uID0gKGF3YWl0IHRoaXMuZ2V0RXh0ZW5zaW9uUGF0aEluZGV4KCkpLmZpbmRTdWJzdHIoZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSk7XG5cdFx0Y29uc3QgaXNFU00gPSB0aGlzLl9pc0VTTShleHRlbnNpb25EZXNjcmlwdGlvbiwgZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSS5wYXRoKTtcblxuXHRcdC8vIFJlcXVpcmUgdGhlIHRlc3QgcnVubmVyIHZpYSBub2RlIHJlcXVpcmUgZnJvbSB0aGUgcHJvdmlkZWQgcGF0aFxuXHRcdGNvbnN0IHRlc3RSdW5uZXIgPSBhd2FpdCAoaXNFU01cblx0XHRcdD8gdGhpcy5fbG9hZEVTTU1vZHVsZTxJVGVzdFJ1bm5lciB8IElOZXdUZXN0UnVubmVyIHwgdW5kZWZpbmVkPihudWxsLCBleHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJLCBuZXcgRXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzQnVpbGRlcihmYWxzZSkpXG5cdFx0XHQ6IHRoaXMuX2xvYWRDb21tb25KU01vZHVsZTxJVGVzdFJ1bm5lciB8IElOZXdUZXN0UnVubmVyIHwgdW5kZWZpbmVkPihudWxsLCBleHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJLCBuZXcgRXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzQnVpbGRlcihmYWxzZSkpKTtcblxuXHRcdGlmICghdGVzdFJ1bm5lciB8fCB0eXBlb2YgdGVzdFJ1bm5lci5ydW4gIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2V4dGVuc2lvblRlc3RFcnJvcicsIFwiUGF0aCB7MH0gZG9lcyBub3QgcG9pbnQgdG8gYSB2YWxpZCBleHRlbnNpb24gdGVzdCBydW5uZXIuXCIsIGV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkudG9TdHJpbmcoKSkpO1xuXHRcdH1cblxuXHRcdC8vIEV4ZWN1dGUgdGhlIHJ1bm5lciBpZiBpdCBmb2xsb3dzIHRoZSBvbGQgYHJ1bmAgc3BlY1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxudW1iZXI+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IG9sZFRlc3RSdW5uZXJDYWxsYmFjayA9IChlcnJvcjogRXJyb3IsIGZhaWx1cmVzOiBudW1iZXIgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdFx0aWYgKGlzQ0kpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFRlc3QgcnVubmVyIGNhbGxlZCBiYWNrIHdpdGggZXJyb3JgLCBlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlamVjdChlcnJvcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKGlzQ0kpIHtcblx0XHRcdFx0XHRcdGlmIChmYWlsdXJlcykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFRlc3QgcnVubmVyIGNhbGxlZCBiYWNrIHdpdGggJHtmYWlsdXJlc30gZmFpbHVyZXMuYCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFRlc3QgcnVubmVyIGNhbGxlZCBiYWNrIHdpdGggc3VjY2Vzc2Z1bCBvdXRjb21lLmApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXNvbHZlKCh0eXBlb2YgZmFpbHVyZXMgPT09ICdudW1iZXInICYmIGZhaWx1cmVzID4gMCkgPyAxIC8qIEVSUk9SICovIDogMCAvKiBPSyAqLyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGV4dGVuc2lvblRlc3RzUGF0aCA9IG9yaWdpbmFsRlNQYXRoKGV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkpOyAvLyBmb3IgdGhlIG9sZCB0ZXN0IHJ1bm5lciBBUElcblxuXHRcdFx0Y29uc3QgcnVuUmVzdWx0ID0gdGVzdFJ1bm5lci5ydW4oZXh0ZW5zaW9uVGVzdHNQYXRoLCBvbGRUZXN0UnVubmVyQ2FsbGJhY2spO1xuXG5cdFx0XHQvLyBVc2luZyB0aGUgbmV3IEFQSSBgcnVuKCk6IFByb21pc2U8dm9pZD5gXG5cdFx0XHRpZiAocnVuUmVzdWx0ICYmIHJ1blJlc3VsdC50aGVuKSB7XG5cdFx0XHRcdHJ1blJlc3VsdFxuXHRcdFx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdGlmIChpc0NJKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgVGVzdCBydW5uZXIgZmluaXNoZWQgc3VjY2Vzc2Z1bGx5LmApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmVzb2x2ZSgwKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdC5jYXRjaCgoZXJyOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBUZXN0IHJ1bm5lciBmaW5pc2hlZCB3aXRoIGVycm9yYCwgZXJyKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJlamVjdChlcnIgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnIuc3RhY2sgPyBlcnIuc3RhY2sgOiBTdHJpbmcoZXJyKSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydEV4dGVuc2lvbkhvc3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3N0YXJ0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRXh0ZW5zaW9uIGhvc3QgaXMgYWxyZWFkeSBzdGFydGVkIWApO1xuXHRcdH1cblx0XHR0aGlzLl9zdGFydGVkID0gdHJ1ZTtcblxuXHRcdHJldHVybiB0aGlzLl9yZWFkeVRvU3RhcnRFeHRlbnNpb25Ib3N0LndhaXQoKVxuXHRcdFx0LnRoZW4oKCkgPT4gdGhpcy5fcmVhZHlUb1J1bkV4dGVuc2lvbnMub3BlbigpKVxuXHRcdFx0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHQvLyB3YWl0IGZvciBhbGwgYWN0aXZhdGlvbiBldmVudHMgdGhhdCBjYW1lIGluIGR1cmluZyB3b3JrYmVuY2ggc3RhcnR1cCwgYnV0IGF0IG1heGltdW0gMXNcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmFjZShbdGhpcy5fYWN0aXZhdG9yLndhaXRGb3JBY3RpdmF0aW5nRXh0ZW5zaW9ucygpLCB0aW1lb3V0KDEwMDApXSk7XG5cdFx0XHR9KVxuXHRcdFx0LnRoZW4oKCkgPT4gdGhpcy5faGFuZGxlRWFnZXJFeHRlbnNpb25zKCkpXG5cdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2VhZ2VyRXh0ZW5zaW9uc0FjdGl2YXRlZC5vcGVuKCk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgRWFnZXIgZXh0ZW5zaW9ucyBhY3RpdmF0ZWRgKTtcblx0XHRcdH0pO1xuXHR9XG5cblx0Ly8gLS0gY2FsbGVkIGJ5IGV4dGVuc2lvbnNcblxuXHRwdWJsaWMgcmVnaXN0ZXJSZW1vdGVBdXRob3JpdHlSZXNvbHZlcihhdXRob3JpdHlQcmVmaXg6IHN0cmluZywgcmVzb2x2ZXI6IHZzY29kZS5SZW1vdGVBdXRob3JpdHlSZXNvbHZlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9yZXNvbHZlcnNbYXV0aG9yaXR5UHJlZml4XSA9IHJlc29sdmVyO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0ZGVsZXRlIHRoaXMuX3Jlc29sdmVyc1thdXRob3JpdHlQcmVmaXhdO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldFJlbW90ZUV4ZWNTZXJ2ZXIocmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcpOiBQcm9taXNlPHZzY29kZS5FeGVjU2VydmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgeyByZXNvbHZlciB9ID0gYXdhaXQgdGhpcy5fYWN0aXZhdGVBbmRHZXRSZXNvbHZlcihyZW1vdGVBdXRob3JpdHkpO1xuXHRcdHJldHVybiByZXNvbHZlcj8ucmVzb2x2ZUV4ZWNTZXJ2ZXI/LihyZW1vdGVBdXRob3JpdHksIHsgcmVzb2x2ZUF0dGVtcHQ6IDAgfSk7XG5cdH1cblxuXHQvLyAtLSBjYWxsZWQgYnkgbWFpbiB0aHJlYWRcblxuXHRwcml2YXRlIGFzeW5jIF9hY3RpdmF0ZUFuZEdldFJlc29sdmVyKHJlbW90ZUF1dGhvcml0eTogc3RyaW5nKTogUHJvbWlzZTx7IGF1dGhvcml0eVByZWZpeDogc3RyaW5nOyByZXNvbHZlcjogdnNjb2RlLlJlbW90ZUF1dGhvcml0eVJlc29sdmVyIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRjb25zdCBhdXRob3JpdHlQbHVzSW5kZXggPSByZW1vdGVBdXRob3JpdHkuaW5kZXhPZignKycpO1xuXHRcdGlmIChhdXRob3JpdHlQbHVzSW5kZXggPT09IC0xKSB7XG5cdFx0XHR0aHJvdyBuZXcgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvcihgTm90IGFuIGF1dGhvcml0eSB0aGF0IGNhbiBiZSByZXNvbHZlZCFgLCBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yQ29kZS5JbnZhbGlkQXV0aG9yaXR5KTtcblx0XHR9XG5cdFx0Y29uc3QgYXV0aG9yaXR5UHJlZml4ID0gcmVtb3RlQXV0aG9yaXR5LnN1YnN0cigwLCBhdXRob3JpdHlQbHVzSW5kZXgpO1xuXG5cdFx0YXdhaXQgdGhpcy5fYWxtb3N0UmVhZHlUb1J1bkV4dGVuc2lvbnMud2FpdCgpO1xuXHRcdGF3YWl0IHRoaXMuX2FjdGl2YXRlQnlFdmVudChgb25SZXNvbHZlUmVtb3RlQXV0aG9yaXR5OiR7YXV0aG9yaXR5UHJlZml4fWAsIGZhbHNlKTtcblxuXHRcdHJldHVybiB7IGF1dGhvcml0eVByZWZpeCwgcmVzb2x2ZXI6IHRoaXMuX3Jlc29sdmVyc1thdXRob3JpdHlQcmVmaXhdIH07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJHJlc29sdmVBdXRob3JpdHkocmVtb3RlQXV0aG9yaXR5Q2hhaW46IHN0cmluZywgcmVzb2x2ZUF0dGVtcHQ6IG51bWJlcik6IFByb21pc2U8RHRvPElSZXNvbHZlQXV0aG9yaXR5UmVzdWx0Pj4ge1xuXHRcdGNvbnN0IHN3ID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cdFx0Y29uc3QgcHJlZml4ID0gKCkgPT4gYFtyZXNvbHZlQXV0aG9yaXR5KCR7Z2V0UmVtb3RlQXV0aG9yaXR5UHJlZml4KHJlbW90ZUF1dGhvcml0eUNoYWluKX0sJHtyZXNvbHZlQXR0ZW1wdH0pXVske3N3LmVsYXBzZWQoKX1tc10gYDtcblx0XHRjb25zdCBsb2dJbmZvID0gKG1zZzogc3RyaW5nKSA9PiB0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7cHJlZml4KCl9JHttc2d9YCk7XG5cdFx0Y29uc3QgbG9nV2FybmluZyA9IChtc2c6IHN0cmluZykgPT4gdGhpcy5fbG9nU2VydmljZS53YXJuKGAke3ByZWZpeCgpfSR7bXNnfWApO1xuXHRcdGNvbnN0IGxvZ0Vycm9yID0gKG1zZzogc3RyaW5nLCBlcnI6IGFueSA9IHVuZGVmaW5lZCkgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihgJHtwcmVmaXgoKX0ke21zZ31gLCBlcnIpO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZUVycm9yID0gKGVycjogdW5rbm93bikgPT4ge1xuXHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiAnZXJyb3InIGFzIGNvbnN0LFxuXHRcdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0XHRjb2RlOiBlcnIuX2NvZGUsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBlcnIuX21lc3NhZ2UsXG5cdFx0XHRcdFx0XHRkZXRhaWw6IGVyci5fZGV0YWlsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH07XG5cblx0XHRjb25zdCBnZXRSZXNvbHZlciA9IGFzeW5jIChyZW1vdGVBdXRob3JpdHk6IHN0cmluZykgPT4ge1xuXHRcdFx0bG9nSW5mbyhgYWN0aXZhdGluZyByZXNvbHZlciBmb3IgJHtyZW1vdGVBdXRob3JpdHl9Li4uYCk7XG5cdFx0XHRjb25zdCB7IHJlc29sdmVyLCBhdXRob3JpdHlQcmVmaXggfSA9IGF3YWl0IHRoaXMuX2FjdGl2YXRlQW5kR2V0UmVzb2x2ZXIocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRcdGlmICghcmVzb2x2ZXIpIHtcblx0XHRcdFx0bG9nRXJyb3IoYG5vIHJlc29sdmVyIGZvciAke2F1dGhvcml0eVByZWZpeH1gKTtcblx0XHRcdFx0dGhyb3cgbmV3IFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IoYE5vIHJlbW90ZSBleHRlbnNpb24gaW5zdGFsbGVkIHRvIHJlc29sdmUgJHthdXRob3JpdHlQcmVmaXh9LmAsIFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3JDb2RlLk5vUmVzb2x2ZXJGb3VuZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyByZXNvbHZlciwgYXV0aG9yaXR5UHJlZml4LCByZW1vdGVBdXRob3JpdHkgfTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgY2hhaW4gPSByZW1vdGVBdXRob3JpdHlDaGFpbi5zcGxpdCgvQHwlNDAvZykucmV2ZXJzZSgpO1xuXHRcdGxvZ0luZm8oYGFjdGl2YXRpbmcgcmVtb3RlIHJlc29sdmVycyAke2NoYWluLmpvaW4oJyAtPiAnKX1gKTtcblxuXHRcdGxldCByZXNvbHZlcnM7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc29sdmVycyA9IGF3YWl0IFByb21pc2UuYWxsKGNoYWluLm1hcChnZXRSZXNvbHZlcikpLmNhdGNoKGFzeW5jIChlOiBFcnJvcikgPT4ge1xuXHRcdFx0XHRpZiAoIShlIGluc3RhbmNlb2YgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvcikgfHwgZS5fY29kZSAhPT0gUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvckNvZGUuSW52YWxpZEF1dGhvcml0eSkgeyB0aHJvdyBlOyB9XG5cdFx0XHRcdGxvZ1dhcm5pbmcoYHJlc29sdmluZyBuZXN0ZWQgYXV0aG9yaXRpZXMgZmFpbGVkOiAke2UubWVzc2FnZX1gKTtcblx0XHRcdFx0cmV0dXJuIFthd2FpdCBnZXRSZXNvbHZlcihyZW1vdGVBdXRob3JpdHlDaGFpbildO1xuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0cmV0dXJuIG5vcm1hbGl6ZUVycm9yKGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGludGVydmFsTG9nZ2VyID0gbmV3IEludGVydmFsVGltZXIoKTtcblx0XHRpbnRlcnZhbExvZ2dlci5jYW5jZWxBbmRTZXQoKCkgPT4gbG9nSW5mbygnd2FpdGluZy4uLicpLCAxMDAwKTtcblxuXHRcdGxldCByZXN1bHQhOiB2c2NvZGUuUmVzb2x2ZXJSZXN1bHQ7XG5cdFx0bGV0IGV4ZWNTZXJ2ZXI6IHZzY29kZS5FeGVjU2VydmVyIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgW2ksIHsgYXV0aG9yaXR5UHJlZml4LCByZXNvbHZlciwgcmVtb3RlQXV0aG9yaXR5IH1dIG9mIHJlc29sdmVycy5lbnRyaWVzKCkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmIChpID09PSByZXNvbHZlcnMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRcdGxvZ0luZm8oYGludm9raW5nIGZpbmFsIHJlc29sdmUoKS4uLmApO1xuXHRcdFx0XHRcdHBlcmZvcm1hbmNlLm1hcmsoYGNvZGUvZXh0SG9zdC93aWxsUmVzb2x2ZUF1dGhvcml0eS8ke2F1dGhvcml0eVByZWZpeH1gKTtcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCByZXNvbHZlci5yZXNvbHZlKHJlbW90ZUF1dGhvcml0eSwgeyByZXNvbHZlQXR0ZW1wdCwgZXhlY1NlcnZlciB9KTtcblx0XHRcdFx0XHRwZXJmb3JtYW5jZS5tYXJrKGBjb2RlL2V4dEhvc3QvZGlkUmVzb2x2ZUF1dGhvcml0eU9LLyR7YXV0aG9yaXR5UHJlZml4fWApO1xuXHRcdFx0XHRcdGxvZ0luZm8oYHNldHRpbmcgdHVubmVsIGZhY3RvcnkuLi5gKTtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihhd2FpdCB0aGlzLl9leHRIb3N0VHVubmVsU2VydmljZS5zZXRUdW5uZWxGYWN0b3J5KFxuXHRcdFx0XHRcdFx0cmVzb2x2ZXIsXG5cdFx0XHRcdFx0XHRFeHRIb3N0TWFuYWdlZFJlc29sdmVkQXV0aG9yaXR5LmlzTWFuYWdlZFJlc29sdmVkQXV0aG9yaXR5KHJlc3VsdCkgPyByZXN1bHQgOiB1bmRlZmluZWRcblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsb2dJbmZvKGBpbnZva2luZyByZXNvbHZlRXhlY1NlcnZlcigpIGZvciAke3JlbW90ZUF1dGhvcml0eX1gKTtcblx0XHRcdFx0XHRwZXJmb3JtYW5jZS5tYXJrKGBjb2RlL2V4dEhvc3Qvd2lsbFJlc29sdmVFeGVjU2VydmVyLyR7YXV0aG9yaXR5UHJlZml4fWApO1xuXHRcdFx0XHRcdGV4ZWNTZXJ2ZXIgPSBhd2FpdCByZXNvbHZlci5yZXNvbHZlRXhlY1NlcnZlcj8uKHJlbW90ZUF1dGhvcml0eSwgeyByZXNvbHZlQXR0ZW1wdCwgZXhlY1NlcnZlciB9KTtcblx0XHRcdFx0XHRpZiAoIWV4ZWNTZXJ2ZXIpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yKGBFeGVjIHNlcnZlciB3YXMgbm90IGF2YWlsYWJsZSBmb3IgJHtyZW1vdGVBdXRob3JpdHl9YCwgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvckNvZGUuTm9SZXNvbHZlckZvdW5kKTsgLy8gd2UgZGlkLCBpbiBmYWN0LCBicmVhayB0aGUgY2hhaW4gOihcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cGVyZm9ybWFuY2UubWFyayhgY29kZS9leHRIb3N0L2RpZFJlc29sdmVFeGVjU2VydmVyT0svJHthdXRob3JpdHlQcmVmaXh9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0cGVyZm9ybWFuY2UubWFyayhgY29kZS9leHRIb3N0L2RpZFJlc29sdmVBdXRob3JpdHlFcnJvci8ke2F1dGhvcml0eVByZWZpeH1gKTtcblx0XHRcdFx0bG9nRXJyb3IoYHJldHVybmVkIGFuIGVycm9yYCwgZSk7XG5cdFx0XHRcdGludGVydmFsTG9nZ2VyLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuIG5vcm1hbGl6ZUVycm9yKGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGludGVydmFsTG9nZ2VyLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IHR1bm5lbEluZm9ybWF0aW9uOiBUdW5uZWxJbmZvcm1hdGlvbiA9IHtcblx0XHRcdGVudmlyb25tZW50VHVubmVsczogcmVzdWx0LmVudmlyb25tZW50VHVubmVscyxcblx0XHRcdGZlYXR1cmVzOiByZXN1bHQudHVubmVsRmVhdHVyZXMgPyB7XG5cdFx0XHRcdGVsZXZhdGlvbjogcmVzdWx0LnR1bm5lbEZlYXR1cmVzLmVsZXZhdGlvbixcblx0XHRcdFx0cHJpdmFjeU9wdGlvbnM6IHJlc3VsdC50dW5uZWxGZWF0dXJlcy5wcml2YWN5T3B0aW9ucyxcblx0XHRcdFx0cHJvdG9jb2w6IHJlc3VsdC50dW5uZWxGZWF0dXJlcy5wcm90b2NvbCA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IHJlc3VsdC50dW5uZWxGZWF0dXJlcy5wcm90b2NvbCxcblx0XHRcdH0gOiB1bmRlZmluZWRcblx0XHR9O1xuXG5cdFx0Ly8gU3BsaXQgbWVyZ2VkIEFQSSByZXN1bHQgaW50byBzZXBhcmF0ZSBhdXRob3JpdHkvb3B0aW9uc1xuXHRcdGNvbnN0IG9wdGlvbnM6IFJlc29sdmVkT3B0aW9ucyA9IHtcblx0XHRcdGV4dGVuc2lvbkhvc3RFbnY6IHJlc3VsdC5leHRlbnNpb25Ib3N0RW52LFxuXHRcdFx0aXNUcnVzdGVkOiByZXN1bHQuaXNUcnVzdGVkLFxuXHRcdFx0YXV0aGVudGljYXRpb25TZXNzaW9uOiByZXN1bHQuYXV0aGVudGljYXRpb25TZXNzaW9uRm9ySW5pdGlhbGl6aW5nRXh0ZW5zaW9ucyA/IHsgaWQ6IHJlc3VsdC5hdXRoZW50aWNhdGlvblNlc3Npb25Gb3JJbml0aWFsaXppbmdFeHRlbnNpb25zLmlkLCBwcm92aWRlcklkOiByZXN1bHQuYXV0aGVudGljYXRpb25TZXNzaW9uRm9ySW5pdGlhbGl6aW5nRXh0ZW5zaW9ucy5wcm92aWRlcklkIH0gOiB1bmRlZmluZWRcblx0XHR9O1xuXG5cdFx0Ly8gZXh0ZW5zaW9uIGFyZSBub3QgcmVxdWlyZWQgdG8gcmV0dXJuIGFuIGluc3RhbmNlIG9mIFJlc29sdmVkQXV0aG9yaXR5IG9yIE1hbmFnZWRSZXNvbHZlZEF1dGhvcml0eSwgc28gZG9uJ3QgdXNlIGBpbnN0YW5jZW9mYFxuXHRcdGxvZ0luZm8oYHJldHVybmVkICR7RXh0SG9zdE1hbmFnZWRSZXNvbHZlZEF1dGhvcml0eS5pc01hbmFnZWRSZXNvbHZlZEF1dGhvcml0eShyZXN1bHQpID8gJ21hbmFnZWQgYXV0aG9yaXR5JyA6IGAke3Jlc3VsdC5ob3N0fToke3Jlc3VsdC5wb3J0fWB9YCk7XG5cblx0XHRsZXQgYXV0aG9yaXR5OiBSZXNvbHZlZEF1dGhvcml0eTtcblx0XHRpZiAoRXh0SG9zdE1hbmFnZWRSZXNvbHZlZEF1dGhvcml0eS5pc01hbmFnZWRSZXNvbHZlZEF1dGhvcml0eShyZXN1bHQpKSB7XG5cdFx0XHQvLyBUaGUgc29ja2V0IGZhY3RvcnkgaXMgaWRlbnRpZmllZCBieSB0aGUgYHJlc29sdmVBdHRlbXB0YCwgc2luY2UgdGhhdCBpcyBhIG51bWJlciB3aGljaFxuXHRcdFx0Ly8gYWx3YXlzIGluY3JlbWVudHMgYW5kIGlzIHVuaXF1ZSBvdmVyIGFsbCByZXNvbHZlKCkgY2FsbHMgaW4gYSB3b3JrYmVuY2ggc2Vzc2lvbi5cblx0XHRcdGNvbnN0IHNvY2tldEZhY3RvcnlJZCA9IHJlc29sdmVBdHRlbXB0O1xuXG5cdFx0XHQvLyBUaGVyZSBpcyBvbmx5IG9uIG1hbmFnZWQgc29ja2V0IGZhY3RvcnkgYXQgYSB0aW1lLCBzbyB3ZSBjYW4ganVzdCBvdmVyd3JpdGUgdGhlIG9sZCBvbmUuXG5cdFx0XHR0aGlzLl9leHRIb3N0TWFuYWdlZFNvY2tldHMuc2V0RmFjdG9yeShzb2NrZXRGYWN0b3J5SWQsIHJlc3VsdC5tYWtlQ29ubmVjdGlvbik7XG5cblx0XHRcdGF1dGhvcml0eSA9IHtcblx0XHRcdFx0YXV0aG9yaXR5OiByZW1vdGVBdXRob3JpdHlDaGFpbixcblx0XHRcdFx0Y29ubmVjdFRvOiBuZXcgTWFuYWdlZFJlbW90ZUNvbm5lY3Rpb24oc29ja2V0RmFjdG9yeUlkKSxcblx0XHRcdFx0Y29ubmVjdGlvblRva2VuOiByZXN1bHQuY29ubmVjdGlvblRva2VuXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhdXRob3JpdHkgPSB7XG5cdFx0XHRcdGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5Q2hhaW4sXG5cdFx0XHRcdGNvbm5lY3RUbzogbmV3IFdlYlNvY2tldFJlbW90ZUNvbm5lY3Rpb24ocmVzdWx0Lmhvc3QsIHJlc3VsdC5wb3J0KSxcblx0XHRcdFx0Y29ubmVjdGlvblRva2VuOiByZXN1bHQuY29ubmVjdGlvblRva2VuXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnb2snLFxuXHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0YXV0aG9yaXR5OiBhdXRob3JpdHkgYXMgRHRvPFJlc29sdmVkQXV0aG9yaXR5Pixcblx0XHRcdFx0b3B0aW9ucyxcblx0XHRcdFx0dHVubmVsSW5mb3JtYXRpb24sXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkZ2V0Q2Fub25pY2FsVVJJKHJlbW90ZUF1dGhvcml0eTogc3RyaW5nLCB1cmlDb21wb25lbnRzOiBVcmlDb21wb25lbnRzKTogUHJvbWlzZTxVcmlDb21wb25lbnRzIHwgbnVsbD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJGdldENhbm9uaWNhbFVSSSBpbnZva2VkIGZvciBhdXRob3JpdHkgKCR7Z2V0UmVtb3RlQXV0aG9yaXR5UHJlZml4KHJlbW90ZUF1dGhvcml0eSl9KWApO1xuXG5cdFx0Y29uc3QgeyByZXNvbHZlciB9ID0gYXdhaXQgdGhpcy5fYWN0aXZhdGVBbmRHZXRSZXNvbHZlcihyZW1vdGVBdXRob3JpdHkpO1xuXHRcdGlmICghcmVzb2x2ZXIpIHtcblx0XHRcdC8vIFJldHVybiBgbnVsbGAgaWYgbm8gcmVzb2x2ZXIgZm9yIGByZW1vdGVBdXRob3JpdHlgIGlzIGZvdW5kLlxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZSh1cmlDb21wb25lbnRzKTtcblxuXHRcdGlmICh0eXBlb2YgcmVzb2x2ZXIuZ2V0Q2Fub25pY2FsVVJJID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Ly8gcmVzb2x2ZXIgY2Fubm90IGNvbXB1dGUgY2Fub25pY2FsIFVSSVxuXHRcdFx0cmV0dXJuIHVyaTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhc1Byb21pc2UoKCkgPT4gcmVzb2x2ZXIuZ2V0Q2Fub25pY2FsVVJJISh1cmkpKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVyaTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRzdGFydEV4dGVuc2lvbkhvc3QoZXh0ZW5zaW9uc0RlbHRhOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25EZWx0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGV4dGVuc2lvbnNEZWx0YS50b0FkZC5mb3JFYWNoKChleHRlbnNpb24pID0+ICg8YW55PmV4dGVuc2lvbikuZXh0ZW5zaW9uTG9jYXRpb24gPSBVUkkucmV2aXZlKGV4dGVuc2lvbi5leHRlbnNpb25Mb2NhdGlvbikpO1xuXG5cdFx0Y29uc3QgeyBnbG9iYWxSZWdpc3RyeSwgbXlFeHRlbnNpb25zIH0gPSBhcHBseUV4dGVuc2lvbnNEZWx0YSh0aGlzLl9hY3RpdmF0aW9uRXZlbnRzUmVhZGVyLCB0aGlzLl9nbG9iYWxSZWdpc3RyeSwgdGhpcy5fbXlSZWdpc3RyeSwgZXh0ZW5zaW9uc0RlbHRhKTtcblx0XHRjb25zdCBuZXdTZWFyY2hUcmVlID0gYXdhaXQgdGhpcy5fY3JlYXRlRXh0ZW5zaW9uUGF0aEluZGV4KG15RXh0ZW5zaW9ucyk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1BhdGhzID0gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25QYXRoSW5kZXgoKTtcblx0XHRleHRlbnNpb25zUGF0aHMuc2V0U2VhcmNoVHJlZShuZXdTZWFyY2hUcmVlKTtcblx0XHR0aGlzLl9nbG9iYWxSZWdpc3RyeS5zZXQoZ2xvYmFsUmVnaXN0cnkuZ2V0QWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKCkpO1xuXHRcdHRoaXMuX215UmVnaXN0cnkuc2V0KG15RXh0ZW5zaW9ucyk7XG5cblx0XHRpZiAoaXNDSSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAkc3RhcnRFeHRlbnNpb25Ib3N0OiBnbG9iYWwgZXh0ZW5zaW9uczogJHtwcmludEV4dElkcyh0aGlzLl9nbG9iYWxSZWdpc3RyeSl9YCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCRzdGFydEV4dGVuc2lvbkhvc3Q6IGxvY2FsIGV4dGVuc2lvbnM6ICR7cHJpbnRFeHRJZHModGhpcy5fbXlSZWdpc3RyeSl9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3N0YXJ0RXh0ZW5zaW9uSG9zdCgpO1xuXHR9XG5cblx0cHVibGljICRhY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50OiBzdHJpbmcsIGFjdGl2YXRpb25LaW5kOiBBY3RpdmF0aW9uS2luZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChhY3RpdmF0aW9uS2luZCA9PT0gQWN0aXZhdGlvbktpbmQuSW1tZWRpYXRlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWxtb3N0UmVhZHlUb1J1bkV4dGVuc2lvbnMud2FpdCgpXG5cdFx0XHRcdC50aGVuKF8gPT4gdGhpcy5fYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudCwgZmFsc2UpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gKFxuXHRcdFx0dGhpcy5fcmVhZHlUb1J1bkV4dGVuc2lvbnMud2FpdCgpXG5cdFx0XHRcdC50aGVuKF8gPT4gdGhpcy5fYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudCwgZmFsc2UpKVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGFjdGl2YXRlKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCByZWFzb246IEV4dGVuc2lvbkFjdGl2YXRpb25SZWFzb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRhd2FpdCB0aGlzLl9yZWFkeVRvUnVuRXh0ZW5zaW9ucy53YWl0KCk7XG5cdFx0aWYgKCF0aGlzLl9teVJlZ2lzdHJ5LmdldEV4dGVuc2lvbkRlc2NyaXB0aW9uKGV4dGVuc2lvbklkKSkge1xuXHRcdFx0Ly8gdW5rbm93biBleHRlbnNpb24gPT4gaWdub3JlXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2FjdGl2YXRlQnlJZChleHRlbnNpb25JZCwgcmVhc29uKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkZGVsdGFFeHRlbnNpb25zKGV4dGVuc2lvbnNEZWx0YTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uRGVsdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRleHRlbnNpb25zRGVsdGEudG9BZGQuZm9yRWFjaCgoZXh0ZW5zaW9uKSA9PiAoPGFueT5leHRlbnNpb24pLmV4dGVuc2lvbkxvY2F0aW9uID0gVVJJLnJldml2ZShleHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24pKTtcblxuXHRcdC8vIEZpcnN0IGJ1aWxkIHVwIGFuZCB1cGRhdGUgdGhlIHRyaWUgYW5kIG9ubHkgYWZ0ZXJ3YXJkcyBhcHBseSB0aGUgZGVsdGFcblx0XHRjb25zdCB7IGdsb2JhbFJlZ2lzdHJ5LCBteUV4dGVuc2lvbnMgfSA9IGFwcGx5RXh0ZW5zaW9uc0RlbHRhKHRoaXMuX2FjdGl2YXRpb25FdmVudHNSZWFkZXIsIHRoaXMuX2dsb2JhbFJlZ2lzdHJ5LCB0aGlzLl9teVJlZ2lzdHJ5LCBleHRlbnNpb25zRGVsdGEpO1xuXHRcdGNvbnN0IG5ld1NlYXJjaFRyZWUgPSBhd2FpdCB0aGlzLl9jcmVhdGVFeHRlbnNpb25QYXRoSW5kZXgobXlFeHRlbnNpb25zKTtcblx0XHRjb25zdCBleHRlbnNpb25zUGF0aHMgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvblBhdGhJbmRleCgpO1xuXHRcdGV4dGVuc2lvbnNQYXRocy5zZXRTZWFyY2hUcmVlKG5ld1NlYXJjaFRyZWUpO1xuXHRcdHRoaXMuX2dsb2JhbFJlZ2lzdHJ5LnNldChnbG9iYWxSZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKSk7XG5cdFx0dGhpcy5fbXlSZWdpc3RyeS5zZXQobXlFeHRlbnNpb25zKTtcblxuXHRcdGlmIChpc0NJKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCRkZWx0YUV4dGVuc2lvbnM6IGdsb2JhbCBleHRlbnNpb25zOiAke3ByaW50RXh0SWRzKHRoaXMuX2dsb2JhbFJlZ2lzdHJ5KX1gKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJGRlbHRhRXh0ZW5zaW9uczogbG9jYWwgZXh0ZW5zaW9uczogJHtwcmludEV4dElkcyh0aGlzLl9teVJlZ2lzdHJ5KX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJHRlc3RfbGF0ZW5jeShuOiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdHJldHVybiBuO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICR0ZXN0X3VwKGI6IFZTQnVmZmVyKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRyZXR1cm4gYi5ieXRlTGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICR0ZXN0X2Rvd24oc2l6ZTogbnVtYmVyKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdGNvbnN0IGJ1ZmYgPSBWU0J1ZmZlci5hbGxvYyhzaXplKTtcblx0XHRjb25zdCB2YWx1ZSA9IE1hdGgucmFuZG9tKCkgJSAyNTY7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzaXplOyBpKyspIHtcblx0XHRcdGJ1ZmYud3JpdGVVSW50OCh2YWx1ZSwgaSk7XG5cdFx0fVxuXHRcdHJldHVybiBidWZmO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICR1cGRhdGVSZW1vdGVDb25uZWN0aW9uRGF0YShjb25uZWN0aW9uRGF0YTogSVJlbW90ZUNvbm5lY3Rpb25EYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcmVtb3RlQ29ubmVjdGlvbkRhdGEgPSBjb25uZWN0aW9uRGF0YTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVJlbW90ZUNvbm5lY3Rpb25EYXRhLmZpcmUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfaXNFU00oZXh0ZW5zaW9uRGVzY3JpcHRpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiB8IHVuZGVmaW5lZCwgbW9kdWxlUGF0aD86IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdG1vZHVsZVBhdGggPz89IGV4dGVuc2lvbkRlc2NyaXB0aW9uID8gdGhpcy5fZ2V0RW50cnlQb2ludChleHRlbnNpb25EZXNjcmlwdGlvbikgOiBtb2R1bGVQYXRoO1xuXHRcdHJldHVybiBtb2R1bGVQYXRoPy5lbmRzV2l0aCgnLm1qcycpIHx8IChleHRlbnNpb25EZXNjcmlwdGlvbj8udHlwZSA9PT0gJ21vZHVsZScgJiYgIW1vZHVsZVBhdGg/LmVuZHNXaXRoKCcuY2pzJykpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9iZWZvcmVBbG1vc3RSZWFkeVRvUnVuRXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+O1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2dldEVudHJ5UG9pbnQoZXh0ZW5zaW9uRGVzY3JpcHRpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIGFic3RyYWN0IF9sb2FkQ29tbW9uSlNNb2R1bGU8VCBleHRlbmRzIG9iamVjdCB8IHVuZGVmaW5lZD4oZXh0ZW5zaW9uSWQ6IElFeHRlbnNpb25EZXNjcmlwdGlvbiB8IG51bGwsIG1vZHVsZTogVVJJLCBhY3RpdmF0aW9uVGltZXNCdWlsZGVyOiBFeHRlbnNpb25BY3RpdmF0aW9uVGltZXNCdWlsZGVyKTogUHJvbWlzZTxUPjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IF9sb2FkRVNNTW9kdWxlPFQ+KGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uIHwgbnVsbCwgbW9kdWxlOiBVUkksIGFjdGl2YXRpb25UaW1lc0J1aWxkZXI6IEV4dGVuc2lvbkFjdGl2YXRpb25UaW1lc0J1aWxkZXIpOiBQcm9taXNlPFQ+O1xuXHRwdWJsaWMgYWJzdHJhY3QgJHNldFJlbW90ZUVudmlyb25tZW50KGVudjogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfCBudWxsIH0pOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5mdW5jdGlvbiBhcHBseUV4dGVuc2lvbnNEZWx0YShhY3RpdmF0aW9uRXZlbnRzUmVhZGVyOiBTeW5jZWRBY3RpdmF0aW9uRXZlbnRzUmVhZGVyLCBvbGRHbG9iYWxSZWdpc3RyeTogRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeSwgb2xkTXlSZWdpc3RyeTogRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeSwgZXh0ZW5zaW9uc0RlbHRhOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25EZWx0YSkge1xuXHRhY3RpdmF0aW9uRXZlbnRzUmVhZGVyLmFkZEFjdGl2YXRpb25FdmVudHMoZXh0ZW5zaW9uc0RlbHRhLmFkZEFjdGl2YXRpb25FdmVudHMpO1xuXHRjb25zdCBnbG9iYWxSZWdpc3RyeSA9IG5ldyBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5KGFjdGl2YXRpb25FdmVudHNSZWFkZXIsIG9sZEdsb2JhbFJlZ2lzdHJ5LmdldEFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucygpKTtcblx0Z2xvYmFsUmVnaXN0cnkuZGVsdGFFeHRlbnNpb25zKGV4dGVuc2lvbnNEZWx0YS50b0FkZCwgZXh0ZW5zaW9uc0RlbHRhLnRvUmVtb3ZlKTtcblxuXHRjb25zdCBteUV4dGVuc2lvbnNTZXQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllclNldChvbGRNeVJlZ2lzdHJ5LmdldEFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucygpLm1hcChleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0Zm9yIChjb25zdCBleHRlbnNpb25JZCBvZiBleHRlbnNpb25zRGVsdGEubXlUb1JlbW92ZSkge1xuXHRcdG15RXh0ZW5zaW9uc1NldC5kZWxldGUoZXh0ZW5zaW9uSWQpO1xuXHR9XG5cdGZvciAoY29uc3QgZXh0ZW5zaW9uSWQgb2YgZXh0ZW5zaW9uc0RlbHRhLm15VG9BZGQpIHtcblx0XHRteUV4dGVuc2lvbnNTZXQuYWRkKGV4dGVuc2lvbklkKTtcblx0fVxuXHRjb25zdCBteUV4dGVuc2lvbnMgPSBmaWx0ZXJFeHRlbnNpb25zKGdsb2JhbFJlZ2lzdHJ5LCBteUV4dGVuc2lvbnNTZXQpO1xuXG5cdHJldHVybiB7IGdsb2JhbFJlZ2lzdHJ5LCBteUV4dGVuc2lvbnMgfTtcbn1cblxudHlwZSBUZWxlbWV0cnlBY3RpdmF0aW9uRXZlbnQgPSB7XG5cdGlkOiBzdHJpbmc7XG5cdG5hbWU6IHN0cmluZztcblx0ZXh0ZW5zaW9uVmVyc2lvbjogc3RyaW5nO1xuXHRwdWJsaXNoZXJEaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRhY3RpdmF0aW9uRXZlbnRzOiBzdHJpbmcgfCBudWxsO1xuXHRpc0J1aWx0aW46IGJvb2xlYW47XG5cdHJlYXNvbjogc3RyaW5nO1xuXHRyZWFzb25JZDogc3RyaW5nO1xufTtcblxuZnVuY3Rpb24gZ2V0VGVsZW1ldHJ5QWN0aXZhdGlvbkV2ZW50KGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHJlYXNvbjogRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbik6IFRlbGVtZXRyeUFjdGl2YXRpb25FdmVudCB7XG5cdGNvbnN0IGV2ZW50ID0ge1xuXHRcdGlkOiBleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlLFxuXHRcdG5hbWU6IGV4dGVuc2lvbkRlc2NyaXB0aW9uLm5hbWUsXG5cdFx0ZXh0ZW5zaW9uVmVyc2lvbjogZXh0ZW5zaW9uRGVzY3JpcHRpb24udmVyc2lvbixcblx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZTogZXh0ZW5zaW9uRGVzY3JpcHRpb24ucHVibGlzaGVyLFxuXHRcdGFjdGl2YXRpb25FdmVudHM6IGV4dGVuc2lvbkRlc2NyaXB0aW9uLmFjdGl2YXRpb25FdmVudHMgPyBleHRlbnNpb25EZXNjcmlwdGlvbi5hY3RpdmF0aW9uRXZlbnRzLmpvaW4oJywnKSA6IG51bGwsXG5cdFx0aXNCdWlsdGluOiBleHRlbnNpb25EZXNjcmlwdGlvbi5pc0J1aWx0aW4sXG5cdFx0cmVhc29uOiByZWFzb24uYWN0aXZhdGlvbkV2ZW50LFxuXHRcdHJlYXNvbklkOiByZWFzb24uZXh0ZW5zaW9uSWQudmFsdWUsXG5cdH07XG5cblx0cmV0dXJuIGV2ZW50O1xufVxuXG5mdW5jdGlvbiBwcmludEV4dElkcyhyZWdpc3RyeTogRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeSkge1xuXHRyZXR1cm4gcmVnaXN0cnkuZ2V0QWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKCkubWFwKGV4dCA9PiBleHQuaWRlbnRpZmllci52YWx1ZSkuam9pbignLCcpO1xufVxuXG5leHBvcnQgY29uc3QgSUV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElFeHRIb3N0RXh0ZW5zaW9uU2VydmljZT4oJ0lFeHRIb3N0RXh0ZW5zaW9uU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRIb3N0RXh0ZW5zaW9uU2VydmljZSBleHRlbmRzIEFic3RyYWN0RXh0SG9zdEV4dGVuc2lvblNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPjtcblx0dGVybWluYXRlKHJlYXNvbjogc3RyaW5nKTogdm9pZDtcblx0Z2V0RXh0ZW5zaW9uKGV4dGVuc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPElFeHRlbnNpb25EZXNjcmlwdGlvbiB8IHVuZGVmaW5lZD47XG5cdGlzQWN0aXZhdGVkKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyKTogYm9vbGVhbjtcblx0YWN0aXZhdGVCeUlkV2l0aEVycm9ycyhleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgcmVhc29uOiBFeHRlbnNpb25BY3RpdmF0aW9uUmVhc29uKTogUHJvbWlzZTx2b2lkPjtcblx0Z2V0RXh0ZW5zaW9uRXhwb3J0cyhleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcik6IElFeHRlbnNpb25BUEkgfCBudWxsIHwgdW5kZWZpbmVkO1xuXHRnZXRFeHRlbnNpb25SZWdpc3RyeSgpOiBQcm9taXNlPEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnk+O1xuXHRnZXRFeHRlbnNpb25QYXRoSW5kZXgoKTogUHJvbWlzZTxFeHRlbnNpb25QYXRocz47XG5cdHJlZ2lzdGVyUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIoYXV0aG9yaXR5UHJlZml4OiBzdHJpbmcsIHJlc29sdmVyOiB2c2NvZGUuUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIpOiB2c2NvZGUuRGlzcG9zYWJsZTtcblx0Z2V0UmVtb3RlRXhlY1NlcnZlcihhdXRob3JpdHk6IHN0cmluZyk6IFByb21pc2U8dnNjb2RlLkV4ZWNTZXJ2ZXIgfCB1bmRlZmluZWQ+O1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVtb3RlQ29ubmVjdGlvbkRhdGE6IEV2ZW50PHZvaWQ+O1xuXHRnZXRSZW1vdGVDb25uZWN0aW9uRGF0YSgpOiBJUmVtb3RlQ29ubmVjdGlvbkRhdGEgfCBudWxsO1xufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uPFQgZXh0ZW5kcyBvYmplY3QgfCBudWxsIHwgdW5kZWZpbmVkPiBpbXBsZW1lbnRzIHZzY29kZS5FeHRlbnNpb248VD4ge1xuXG5cdCNleHRlbnNpb25TZXJ2aWNlOiBJRXh0SG9zdEV4dGVuc2lvblNlcnZpY2U7XG5cdCNvcmlnaW5FeHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcjtcblx0I2lkZW50aWZpZXI6IEV4dGVuc2lvbklkZW50aWZpZXI7XG5cblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgZXh0ZW5zaW9uVXJpOiBVUkk7XG5cdHJlYWRvbmx5IGV4dGVuc2lvblBhdGg6IHN0cmluZztcblx0cmVhZG9ubHkgcGFja2FnZUpTT046IElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uS2luZDogdnNjb2RlLkV4dGVuc2lvbktpbmQ7XG5cdHJlYWRvbmx5IGlzRnJvbURpZmZlcmVudEV4dGVuc2lvbkhvc3Q6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoZXh0ZW5zaW9uU2VydmljZTogSUV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlLCBvcmlnaW5FeHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgZGVzY3JpcHRpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwga2luZDogRXh0ZW5zaW9uS2luZCwgaXNGcm9tRGlmZmVyZW50RXh0ZW5zaW9uSG9zdDogYm9vbGVhbikge1xuXHRcdHRoaXMuI2V4dGVuc2lvblNlcnZpY2UgPSBleHRlbnNpb25TZXJ2aWNlO1xuXHRcdHRoaXMuI29yaWdpbkV4dGVuc2lvbklkID0gb3JpZ2luRXh0ZW5zaW9uSWQ7XG5cdFx0dGhpcy4jaWRlbnRpZmllciA9IGRlc2NyaXB0aW9uLmlkZW50aWZpZXI7XG5cdFx0dGhpcy5pZCA9IGRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWU7XG5cdFx0dGhpcy5leHRlbnNpb25VcmkgPSBkZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbjtcblx0XHR0aGlzLmV4dGVuc2lvblBhdGggPSBwYXRoLm5vcm1hbGl6ZShvcmlnaW5hbEZTUGF0aChkZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbikpO1xuXHRcdHRoaXMucGFja2FnZUpTT04gPSBkZXNjcmlwdGlvbjtcblx0XHR0aGlzLmV4dGVuc2lvbktpbmQgPSBraW5kO1xuXHRcdHRoaXMuaXNGcm9tRGlmZmVyZW50RXh0ZW5zaW9uSG9zdCA9IGlzRnJvbURpZmZlcmVudEV4dGVuc2lvbkhvc3Q7XG5cdH1cblxuXHRnZXQgaXNBY3RpdmUoKTogYm9vbGVhbiB7XG5cdFx0Ly8gVE9ET0BhbGV4ZGltYSBzdXBwb3J0IHRoaXNcblx0XHRyZXR1cm4gdGhpcy4jZXh0ZW5zaW9uU2VydmljZS5pc0FjdGl2YXRlZCh0aGlzLiNpZGVudGlmaWVyKTtcblx0fVxuXG5cdGdldCBleHBvcnRzKCk6IFQge1xuXHRcdGlmICh0aGlzLnBhY2thZ2VKU09OLmFwaSA9PT0gJ25vbmUnIHx8IHRoaXMuaXNGcm9tRGlmZmVyZW50RXh0ZW5zaW9uSG9zdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZCE7IC8vIFN0cmljdCBudWxsb3ZlcnJpZGUgLSBQdWJsaWMgYXBpXG5cdFx0fVxuXHRcdHJldHVybiA8VD50aGlzLiNleHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbkV4cG9ydHModGhpcy4jaWRlbnRpZmllcik7XG5cdH1cblxuXHRhc3luYyBhY3RpdmF0ZSgpOiBQcm9taXNlPFQ+IHtcblx0XHRpZiAodGhpcy5pc0Zyb21EaWZmZXJlbnRFeHRlbnNpb25Ib3N0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBhY3RpdmF0ZSBmb3JlaWduIGV4dGVuc2lvbicpOyAvLyBUT0RPQGFsZXhkaW1hIHN1cHBvcnQgdGhpc1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLiNleHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlJZFdpdGhFcnJvcnModGhpcy4jaWRlbnRpZmllciwgeyBzdGFydHVwOiBmYWxzZSwgZXh0ZW5zaW9uSWQ6IHRoaXMuI29yaWdpbkV4dGVuc2lvbklkLCBhY3RpdmF0aW9uRXZlbnQ6ICdhcGknIH0pO1xuXHRcdHJldHVybiB0aGlzLmV4cG9ydHM7XG5cdH1cbn1cblxuZnVuY3Rpb24gZmlsdGVyRXh0ZW5zaW9ucyhnbG9iYWxSZWdpc3RyeTogRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeSwgZGVzaXJlZEV4dGVuc2lvbnM6IEV4dGVuc2lvbklkZW50aWZpZXJTZXQpOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSB7XG5cdHJldHVybiBnbG9iYWxSZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKS5maWx0ZXIoXG5cdFx0ZXh0ZW5zaW9uID0+IGRlc2lyZWRFeHRlbnNpb25zLmhhcyhleHRlbnNpb24uaWRlbnRpZmllcilcblx0KTtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvblBhdGhzIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9zZWFyY2hUcmVlOiBUZXJuYXJ5U2VhcmNoVHJlZTxVUkksIElFeHRlbnNpb25EZXNjcmlwdGlvbj5cblx0KSB7IH1cblxuXHRzZXRTZWFyY2hUcmVlKHNlYXJjaFRyZWU6IFRlcm5hcnlTZWFyY2hUcmVlPFVSSSwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uPik6IHZvaWQge1xuXHRcdHRoaXMuX3NlYXJjaFRyZWUgPSBzZWFyY2hUcmVlO1xuXHR9XG5cblx0ZmluZFN1YnN0cihrZXk6IFVSSSk6IElFeHRlbnNpb25EZXNjcmlwdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlYXJjaFRyZWUuZmluZFN1YnN0cihrZXkpO1xuXHR9XG5cblx0Zm9yRWFjaChjYWxsYmFjazogKHZhbHVlOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGluZGV4OiBVUkkpID0+IGFueSk6IHZvaWQge1xuXHRcdHJldHVybiB0aGlzLl9zZWFyY2hUcmVlLmZvckVhY2goY2FsbGJhY2spO1xuXHR9XG59XG5cbi8qKlxuICogVGhpcyBtaXJyb3JzIHRoZSBhY3RpdmF0aW9uIGV2ZW50cyBhcyBzZWVuIGJ5IHRoZSByZW5kZXJlci4gVGhlIHJlbmRlcmVyXG4gKiBpcyB0aGUgb25seSBvbmUgd2hpY2ggY2FuIGhhdmUgYSByZWxpYWJsZSB2aWV3IG9mIGFjdGl2YXRpb24gZXZlbnRzIGJlY2F1c2VcbiAqIGltcGxpY2l0IGFjdGl2YXRpb24gZXZlbnRzIGFyZSBnZW5lcmF0ZWQgdmlhIGV4dGVuc2lvbiBwb2ludHMsIGFuZCB0aGV5XG4gKiBhcmUgcmVnaXN0ZXJlZCBvbmx5IG9uIHRoZSByZW5kZXJlciBzaWRlLlxuICovXG5jbGFzcyBTeW5jZWRBY3RpdmF0aW9uRXZlbnRzUmVhZGVyIGltcGxlbWVudHMgSUFjdGl2YXRpb25FdmVudHNSZWFkZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21hcCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPHN0cmluZ1tdPigpO1xuXG5cdGNvbnN0cnVjdG9yKGFjdGl2YXRpb25FdmVudHM6IHsgW2V4dGVuc2lvbklkOiBzdHJpbmddOiBzdHJpbmdbXSB9KSB7XG5cdFx0dGhpcy5hZGRBY3RpdmF0aW9uRXZlbnRzKGFjdGl2YXRpb25FdmVudHMpO1xuXHR9XG5cblx0cHVibGljIHJlYWRBY3RpdmF0aW9uRXZlbnRzKGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX21hcC5nZXQoZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcikgPz8gW107XG5cdH1cblxuXHRwdWJsaWMgYWRkQWN0aXZhdGlvbkV2ZW50cyhhY3RpdmF0aW9uRXZlbnRzOiB7IFtleHRlbnNpb25JZDogc3RyaW5nXTogc3RyaW5nW10gfSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uSWQgb2YgT2JqZWN0LmtleXMoYWN0aXZhdGlvbkV2ZW50cykpIHtcblx0XHRcdHRoaXMuX21hcC5zZXQoZXh0ZW5zaW9uSWQsIGFjdGl2YXRpb25FdmVudHNbZXh0ZW5zaW9uSWRdKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksVUFBVTtBQUN0QixZQUFZLGlCQUFpQjtBQUM3QixTQUFTLGdCQUFnQixVQUFVLGtDQUFrQztBQUNyRSxTQUFTLFdBQVcsU0FBUyxlQUFlLGVBQWU7QUFDM0QsU0FBUyxTQUFTLGNBQWMsWUFBWSx1QkFBb0M7QUFDaEYsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLG1CQUFtQjtBQUM1QixTQUF1QyxtQkFBd0c7QUFFL0ksU0FBK0IsNkJBQTZCO0FBQzVELFNBQVMsb0JBQW9CLGdCQUFnQiww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
