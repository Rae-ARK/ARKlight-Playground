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
import { runWhenWindowIdle } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Schemas } from "../../../../base/common/network.js";
import * as performance from "../../../../base/common/performance.js";
import { isCI } from "../../../../base/common/platform.js";
import * as nls from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IExtensionGalleryService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { PersistentConnectionEventType } from "../../../../platform/remote/common/remoteAgentConnection.js";
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode, RemoteConnectionType, getRemoteAuthorityPrefix } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { IRemoteExtensionsScannerService } from "../../../../platform/remote/common/remoteExtensionsScanner.js";
import { getRemoteName, isLoopbackHost, parseAuthorityWithPort } from "../../../../platform/remote/common/remoteHosts.js";
import { updateProxyConfigurationsScope } from "../../../../platform/request/common/request.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { EnablementState, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from "../../extensionManagement/common/extensionManagement.js";
import { WebWorkerExtensionHost } from "../browser/webWorkerExtensionHost.js";
import { AbstractExtensionService, ExtensionHostCrashTracker, LocalExtensions, RemoteExtensions, ResolverExtensions, checkEnabledAndProposedAPI, extensionIsEnabled, isResolverExtension } from "../common/abstractExtensionService.js";
import { parseExtensionDevOptions } from "../common/extensionDevOptions.js";
import { ExtensionHostKind, ExtensionRunningPreference, extensionHostKindToString, extensionRunningPreferenceToString } from "../common/extensionHostKind.js";
import { ExtensionHostExitCode } from "../common/extensionHostProtocol.js";
import { IExtensionManifestPropertiesService } from "../common/extensionManifestPropertiesService.js";
import { filterExtensionDescriptions } from "../common/extensionRunningLocationTracker.js";
import { ExtensionHostExtensions, ExtensionHostStartup, IExtensionService, toExtension, webWorkerExtHostConfig } from "../common/extensions.js";
import { ExtensionsProposedApi } from "../common/extensionsProposedApi.js";
import { RemoteExtensionHost } from "../common/remoteExtensionHost.js";
import { CachedExtensionScanner } from "./cachedExtensionScanner.js";
import { NativeLocalProcessExtensionHost } from "./localProcessExtensionHost.js";
import { IHostService } from "../../host/browser/host.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
import { IRemoteExplorerService } from "../../remote/common/remoteExplorerService.js";
import { AsyncIterableProducer } from "../../../../base/common/async.js";
let NativeExtensionService = class extends AbstractExtensionService {
  constructor(instantiationService, notificationService, environmentService, telemetryService, extensionEnablementService, fileService, productService, extensionManagementService, contextService, configurationService, extensionManifestPropertiesService, logService, remoteAgentService, remoteExtensionsScannerService, lifecycleService, remoteAuthorityResolverService, _nativeHostService, _hostService, _remoteExplorerService, _extensionGalleryService, _workspaceTrustManagementService, dialogService) {
    const extensionsProposedApi = instantiationService.createInstance(ExtensionsProposedApi);
    const extensionScanner = instantiationService.createInstance(CachedExtensionScanner);
    const extensionHostFactory = new NativeExtensionHostFactory(
      extensionsProposedApi,
      extensionScanner,
      () => this._getExtensionRegistrySnapshotWhenReady(),
      instantiationService,
      environmentService,
      extensionEnablementService,
      configurationService,
      remoteAgentService,
      remoteAuthorityResolverService,
      logService
    );
    super(
      { hasLocalProcess: true, allowRemoteExtensionsInLocalWebWorker: false },
      extensionsProposedApi,
      extensionHostFactory,
      new NativeExtensionHostKindPicker(environmentService, configurationService, logService),
      instantiationService,
      notificationService,
      environmentService,
      telemetryService,
      extensionEnablementService,
      fileService,
      productService,
      extensionManagementService,
      contextService,
      configurationService,
      extensionManifestPropertiesService,
      logService,
      remoteAgentService,
      remoteExtensionsScannerService,
      lifecycleService,
      remoteAuthorityResolverService,
      dialogService
    );
    this._nativeHostService = _nativeHostService;
    this._hostService = _hostService;
    this._remoteExplorerService = _remoteExplorerService;
    this._extensionGalleryService = _extensionGalleryService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._localCrashTracker = new ExtensionHostCrashTracker();
    this._extensionScanner = extensionScanner;
    lifecycleService.when(LifecyclePhase.Ready).then(() => {
      runWhenWindowIdle(
        mainWindow,
        () => {
          this._initializeIfNeeded();
        },
        50
        /*max delay*/
      );
    });
  }
  async _scanAllLocalExtensions() {
    return this._extensionScanner.scannedExtensions;
  }
  _onExtensionHostCrashed(extensionHost, code, signal) {
    const activatedExtensions = [];
    const extensionsStatus = this.getExtensionsStatus();
    for (const key of Object.keys(extensionsStatus)) {
      const extensionStatus = extensionsStatus[key];
      if (extensionStatus.activationStarted && extensionHost.containsExtension(extensionStatus.id)) {
        activatedExtensions.push(extensionStatus.id);
      }
    }
    super._onExtensionHostCrashed(extensionHost, code, signal);
    if (extensionHost.kind === ExtensionHostKind.LocalProcess) {
      if (code === ExtensionHostExitCode.VersionMismatch) {
        this._notificationService.prompt(
          Severity.Error,
          nls.localize("extensionService.versionMismatchCrash", "Extension host cannot start: version mismatch."),
          [{
            label: nls.localize("relaunch", "Relaunch VS Code"),
            run: () => {
              this._instantiationService.invokeFunction((accessor) => {
                const hostService = accessor.get(IHostService);
                hostService.restart();
              });
            }
          }]
        );
        return;
      }
      this._logExtensionHostCrash(extensionHost);
      this._sendExtensionHostCrashTelemetry(code, signal, activatedExtensions);
      this._localCrashTracker.registerCrash();
      if (this._localCrashTracker.shouldAutomaticallyRestart()) {
        this._logService.info(`Automatically restarting the extension host.`);
        this._notificationService.status(nls.localize("extensionService.autoRestart", "The extension host terminated unexpectedly. Restarting..."), { hideAfter: 5e3 });
        this.startExtensionHosts();
      } else {
        const choices = [];
        if (this._environmentService.isBuilt) {
          choices.push({
            label: nls.localize("startBisect", "Start Extension Bisect"),
            run: () => {
              this._instantiationService.invokeFunction((accessor) => {
                const commandService = accessor.get(ICommandService);
                commandService.executeCommand("extension.bisect.start");
              });
            }
          });
        } else {
          choices.push({
            label: nls.localize("devTools", "Open Developer Tools"),
            run: () => this._nativeHostService.openDevTools()
          });
        }
        choices.push({
          label: nls.localize("restart", "Restart Extension Host"),
          run: () => this.startExtensionHosts()
        });
        if (this._environmentService.isBuilt) {
          choices.push({
            label: nls.localize("learnMore", "Learn More"),
            run: () => {
              this._instantiationService.invokeFunction((accessor) => {
                const openerService = accessor.get(IOpenerService);
                openerService.open("https://aka.ms/vscode-extension-bisect");
              });
            }
          });
        }
        this._notificationService.prompt(Severity.Error, nls.localize("extensionService.crash", "Extension host terminated unexpectedly 3 times within the last 5 minutes."), choices);
      }
    }
  }
  _sendExtensionHostCrashTelemetry(code, signal, activatedExtensions) {
    this._telemetryService.publicLog2("extensionHostCrash", {
      code,
      signal,
      extensionIds: activatedExtensions.map((e) => e.value)
    });
    for (const extensionId of activatedExtensions) {
      this._telemetryService.publicLog2("extensionHostCrashExtension", {
        code,
        signal,
        extensionId: extensionId.value
      });
    }
  }
  // --- impl
  async _resolveAuthority(remoteAuthority) {
    const authorityPlusIndex = remoteAuthority.indexOf("+");
    if (authorityPlusIndex === -1) {
      const { host, port } = parseAuthorityWithPort(remoteAuthority);
      if (!isLoopbackHost(host)) {
        await this._confirmDirectRemoteConnection(host, port);
      }
      return {
        authority: {
          authority: remoteAuthority,
          connectTo: {
            type: RemoteConnectionType.WebSocket,
            host,
            port
          },
          connectionToken: void 0
        }
      };
    }
    return this._resolveAuthorityOnExtensionHosts(ExtensionHostKind.LocalProcess, remoteAuthority);
  }
  async _confirmDirectRemoteConnection(host, port) {
    const { confirmed } = await this._dialogService.confirm({
      type: Severity.Warning,
      message: nls.localize("remoteConnectionConfirm", "Allow connecting to the remote server '{0}:{1}'?", host, port),
      detail: nls.localize("remoteConnectionConfirmDetail", "Code is about to connect to '{0}:{1}' to host a remote extension host. Only continue if you trust this server, as it will be able to run code and access files on your behalf.", host, port),
      primaryButton: nls.localize("remoteConnectionConfirmButton", "Connect")
    });
    if (!confirmed) {
      throw new RemoteAuthorityResolverError(
        nls.localize("remoteConnectionRejected", "Connection to '{0}:{1}' was not allowed.", host, port),
        RemoteAuthorityResolverErrorCode.NotAvailable
      );
    }
  }
  async _getCanonicalURI(remoteAuthority, uri) {
    const authorityPlusIndex = remoteAuthority.indexOf("+");
    if (authorityPlusIndex === -1) {
      return uri;
    }
    const localProcessExtensionHosts = this._getExtensionHostManagers(ExtensionHostKind.LocalProcess);
    if (localProcessExtensionHosts.length === 0) {
      throw new Error(`Cannot resolve canonical URI`);
    }
    const results = await Promise.all(localProcessExtensionHosts.map((extHost) => extHost.getCanonicalURI(remoteAuthority, uri)));
    for (const result of results) {
      if (result) {
        return result;
      }
    }
    throw new Error(`Cannot get canonical URI because no extension is installed to resolve ${getRemoteAuthorityPrefix(remoteAuthority)}`);
  }
  _resolveExtensions() {
    return new AsyncIterableProducer((emitter) => this._doResolveExtensions(emitter));
  }
  async _doResolveExtensions(emitter) {
    this._extensionScanner.startScanningExtensions();
    const remoteAuthority = this._environmentService.remoteAuthority;
    let remoteEnv = null;
    let remoteExtensions = [];
    if (remoteAuthority) {
      this._remoteAuthorityResolverService._setCanonicalURIProvider(async (uri) => {
        if (uri.scheme !== Schemas.vscodeRemote || uri.authority !== remoteAuthority) {
          return uri;
        }
        performance.mark(`code/willGetCanonicalURI/${getRemoteAuthorityPrefix(remoteAuthority)}`);
        if (isCI) {
          this._logService.info(`Invoking getCanonicalURI for authority ${getRemoteAuthorityPrefix(remoteAuthority)}...`);
        }
        try {
          return this._getCanonicalURI(remoteAuthority, uri);
        } finally {
          performance.mark(`code/didGetCanonicalURI/${getRemoteAuthorityPrefix(remoteAuthority)}`);
          if (isCI) {
            this._logService.info(`getCanonicalURI returned for authority ${getRemoteAuthorityPrefix(remoteAuthority)}.`);
          }
        }
      });
      if (isCI) {
        this._logService.info(`Starting to wait on IWorkspaceTrustManagementService.workspaceResolved...`);
      }
      await this._workspaceTrustManagementService.workspaceResolved;
      if (isCI) {
        this._logService.info(`Finished waiting on IWorkspaceTrustManagementService.workspaceResolved.`);
      }
      const localExtensions = await this._scanAllLocalExtensions();
      const resolverExtensions = localExtensions.filter((extension) => isResolverExtension(extension));
      if (resolverExtensions.length) {
        emitter.emitOne(new ResolverExtensions(resolverExtensions));
      }
      let resolverResult;
      try {
        resolverResult = await this._resolveAuthorityInitial(remoteAuthority);
      } catch (err) {
        if (RemoteAuthorityResolverError.isNoResolverFound(err)) {
          err.isHandled = await this._handleNoResolverFound(remoteAuthority);
        } else {
          if (RemoteAuthorityResolverError.isHandled(err)) {
            console.log(`Error handled: Not showing a notification for the error`);
          }
        }
        this._remoteAuthorityResolverService._setResolvedAuthorityError(remoteAuthority, err);
        return this._startLocalExtensionHost(emitter);
      }
      this._remoteAuthorityResolverService._setResolvedAuthority(resolverResult.authority, resolverResult.options);
      this._remoteExplorerService.setTunnelInformation(resolverResult.tunnelInformation);
      const connection = this._remoteAgentService.getConnection();
      if (connection) {
        this._register(connection.onDidStateChange(async (e) => {
          if (e.type === PersistentConnectionEventType.ConnectionLost) {
            this._remoteAuthorityResolverService._clearResolvedAuthority(remoteAuthority);
          }
        }));
        this._register(connection.onReconnecting(() => this._resolveAuthorityAgain()));
      }
      [remoteEnv, remoteExtensions] = await Promise.all([
        this._remoteAgentService.getEnvironment(),
        this._remoteExtensionsScannerService.scanExtensions()
      ]);
      if (!remoteEnv) {
        this._notificationService.notify({ severity: Severity.Error, message: nls.localize("getEnvironmentFailure", "Could not fetch remote environment") });
        return this._startLocalExtensionHost(emitter);
      }
      const useHostProxyDefault = remoteEnv.useHostProxy;
      this._register(this._configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("http.useLocalProxyConfiguration")) {
          updateProxyConfigurationsScope(this._configurationService.getValue("http.useLocalProxyConfiguration"), useHostProxyDefault);
        }
      }));
      updateProxyConfigurationsScope(this._configurationService.getValue("http.useLocalProxyConfiguration"), useHostProxyDefault);
    } else {
      this._remoteAuthorityResolverService._setCanonicalURIProvider(async (uri) => uri);
    }
    return this._startLocalExtensionHost(emitter, remoteExtensions);
  }
  async _startLocalExtensionHost(emitter, remoteExtensions = []) {
    await this._workspaceTrustManagementService.workspaceTrustInitialized;
    if (remoteExtensions.length) {
      emitter.emitOne(new RemoteExtensions(remoteExtensions));
    }
    emitter.emitOne(new LocalExtensions(await this._scanAllLocalExtensions()));
  }
  async _onExtensionHostExit(code) {
    await this._doStopExtensionHosts();
    const connection = this._remoteAgentService.getConnection();
    connection?.dispose();
    if (parseExtensionDevOptions(this._environmentService).isExtensionDevTestFromCli) {
      if (isCI) {
        this._logService.info(`Asking native host service to exit with code ${code}.`);
      }
      this._nativeHostService.exit(code);
    } else {
      this._nativeHostService.closeWindow();
    }
  }
  async _handleNoResolverFound(remoteAuthority) {
    const remoteName = getRemoteName(remoteAuthority);
    const recommendation = this._productService.remoteExtensionTips?.[remoteName];
    if (!recommendation) {
      return false;
    }
    const resolverExtensionId = recommendation.extensionId;
    const allExtensions = await this._scanAllLocalExtensions();
    const extension = allExtensions.filter((e) => e.identifier.value === resolverExtensionId)[0];
    if (extension) {
      if (!extensionIsEnabled(this._logService, this._extensionEnablementService, extension, false)) {
        const message = nls.localize("enableResolver", "Extension '{0}' is required to open the remote window.\nOK to enable?", recommendation.friendlyName);
        this._notificationService.prompt(
          Severity.Info,
          message,
          [{
            label: nls.localize("enable", "Enable and Reload"),
            run: async () => {
              await this._extensionEnablementService.setEnablement([toExtension(extension)], EnablementState.EnabledGlobally);
              await this._hostService.reload();
            }
          }],
          {
            sticky: true,
            priority: NotificationPriority.URGENT
          }
        );
      }
    } else {
      const message = nls.localize("installResolver", "Extension '{0}' is required to open the remote window.\nDo you want to install the extension?", recommendation.friendlyName);
      this._notificationService.prompt(
        Severity.Info,
        message,
        [{
          label: nls.localize("install", "Install and Reload"),
          run: async () => {
            const [galleryExtension] = await this._extensionGalleryService.getExtensions([{ id: resolverExtensionId }], CancellationToken.None);
            if (galleryExtension) {
              await this._extensionManagementService.installFromGallery(galleryExtension);
              await this._hostService.reload();
            } else {
              this._notificationService.error(nls.localize("resolverExtensionNotFound", "`{0}` not found on marketplace"));
            }
          }
        }],
        {
          sticky: true,
          priority: NotificationPriority.URGENT
        }
      );
    }
    return true;
  }
};
NativeExtensionService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IWorkbenchExtensionEnablementService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IWorkbenchExtensionManagementService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IExtensionManifestPropertiesService),
  __decorateParam(11, ILogService),
  __decorateParam(12, IRemoteAgentService),
  __decorateParam(13, IRemoteExtensionsScannerService),
  __decorateParam(14, ILifecycleService),
  __decorateParam(15, IRemoteAuthorityResolverService),
  __decorateParam(16, INativeHostService),
  __decorateParam(17, IHostService),
  __decorateParam(18, IRemoteExplorerService),
  __decorateParam(19, IExtensionGalleryService),
  __decorateParam(20, IWorkspaceTrustManagementService),
  __decorateParam(21, IDialogService)
], NativeExtensionService);
let NativeExtensionHostFactory = class {
  constructor(_extensionsProposedApi, _extensionScanner, _getExtensionRegistrySnapshotWhenReady, _instantiationService, environmentService, _extensionEnablementService, configurationService, _remoteAgentService, _remoteAuthorityResolverService, _logService) {
    this._extensionsProposedApi = _extensionsProposedApi;
    this._extensionScanner = _extensionScanner;
    this._getExtensionRegistrySnapshotWhenReady = _getExtensionRegistrySnapshotWhenReady;
    this._instantiationService = _instantiationService;
    this._extensionEnablementService = _extensionEnablementService;
    this._remoteAgentService = _remoteAgentService;
    this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
    this._logService = _logService;
    this._webWorkerExtHostEnablement = determineLocalWebWorkerExtHostEnablement(environmentService, configurationService);
  }
  createExtensionHost(runningLocations, runningLocation, isInitialStart) {
    switch (runningLocation.kind) {
      case ExtensionHostKind.LocalProcess: {
        const startup = isInitialStart ? ExtensionHostStartup.EagerManualStart : ExtensionHostStartup.EagerAutoStart;
        return this._instantiationService.createInstance(NativeLocalProcessExtensionHost, runningLocation, startup, this._createLocalProcessExtensionHostDataProvider(runningLocations, isInitialStart, runningLocation));
      }
      case ExtensionHostKind.LocalWebWorker: {
        if (this._webWorkerExtHostEnablement !== 0 /* Disabled */) {
          const startup = this._webWorkerExtHostEnablement === 2 /* Lazy */ ? ExtensionHostStartup.LazyAutoStart : ExtensionHostStartup.EagerManualStart;
          return this._instantiationService.createInstance(WebWorkerExtensionHost, runningLocation, startup, this._createWebWorkerExtensionHostDataProvider(runningLocations, runningLocation));
        }
        return null;
      }
      case ExtensionHostKind.Remote: {
        const remoteAgentConnection = this._remoteAgentService.getConnection();
        if (remoteAgentConnection) {
          return this._instantiationService.createInstance(RemoteExtensionHost, runningLocation, this._createRemoteExtensionHostDataProvider(runningLocations, remoteAgentConnection.remoteAuthority));
        }
        return null;
      }
    }
  }
  _createLocalProcessExtensionHostDataProvider(runningLocations, isInitialStart, desiredRunningLocation) {
    return {
      getInitData: async () => {
        if (isInitialStart) {
          const scannedExtensions = await this._extensionScanner.scannedExtensions;
          if (isCI) {
            this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.scannedExtensions: ${scannedExtensions.map((ext) => ext.identifier.value).join(",")}`);
          }
          const localExtensions = checkEnabledAndProposedAPI(
            this._logService,
            this._extensionEnablementService,
            this._extensionsProposedApi,
            scannedExtensions,
            /* ignore workspace trust */
            true
          );
          if (isCI) {
            this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.localExtensions: ${localExtensions.map((ext) => ext.identifier.value).join(",")}`);
          }
          const runningLocation = runningLocations.computeRunningLocation(localExtensions, [], false);
          const myExtensions = filterExtensionDescriptions(localExtensions, runningLocation, (extRunningLocation) => desiredRunningLocation.equals(extRunningLocation));
          const extensions = new ExtensionHostExtensions(0, localExtensions, myExtensions.map((extension) => extension.identifier));
          if (isCI) {
            this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.myExtensions: ${myExtensions.map((ext) => ext.identifier.value).join(",")}`);
          }
          return { extensions };
        } else {
          const snapshot = await this._getExtensionRegistrySnapshotWhenReady();
          const myExtensions = runningLocations.filterByRunningLocation(snapshot.extensions, desiredRunningLocation);
          const extensions = new ExtensionHostExtensions(snapshot.versionId, snapshot.extensions, myExtensions.map((extension) => extension.identifier));
          return { extensions };
        }
      }
    };
  }
  _createWebWorkerExtensionHostDataProvider(runningLocations, desiredRunningLocation) {
    return {
      getInitData: async () => {
        const snapshot = await this._getExtensionRegistrySnapshotWhenReady();
        const myExtensions = runningLocations.filterByRunningLocation(snapshot.extensions, desiredRunningLocation);
        const extensions = new ExtensionHostExtensions(snapshot.versionId, snapshot.extensions, myExtensions.map((extension) => extension.identifier));
        return { extensions };
      }
    };
  }
  _createRemoteExtensionHostDataProvider(runningLocations, remoteAuthority) {
    return {
      remoteAuthority,
      getInitData: async () => {
        const snapshot = await this._getExtensionRegistrySnapshotWhenReady();
        const remoteEnv = await this._remoteAgentService.getEnvironment();
        if (!remoteEnv) {
          throw new Error("Cannot provide init data for remote extension host!");
        }
        const myExtensions = runningLocations.filterByExtensionHostKind(snapshot.extensions, ExtensionHostKind.Remote);
        const extensions = new ExtensionHostExtensions(snapshot.versionId, snapshot.extensions, myExtensions.map((extension) => extension.identifier));
        return {
          connectionData: this._remoteAuthorityResolverService.getConnectionData(remoteAuthority),
          pid: remoteEnv.pid,
          appRoot: remoteEnv.appRoot,
          extensionHostLogsPath: remoteEnv.extensionHostLogsPath,
          globalStorageHome: remoteEnv.globalStorageHome,
          workspaceStorageHome: remoteEnv.workspaceStorageHome,
          extensions
        };
      }
    };
  }
};
NativeExtensionHostFactory = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, IWorkbenchExtensionEnablementService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IRemoteAgentService),
  __decorateParam(8, IRemoteAuthorityResolverService),
  __decorateParam(9, ILogService)
], NativeExtensionHostFactory);
function determineLocalWebWorkerExtHostEnablement(environmentService, configurationService) {
  if (environmentService.isExtensionDevelopment && environmentService.extensionDevelopmentKind?.some((k) => k === "web")) {
    return 1 /* Eager */;
  } else {
    const config = configurationService.getValue(webWorkerExtHostConfig);
    if (config === true) {
      return 1 /* Eager */;
    } else if (config === "auto") {
      return 2 /* Lazy */;
    } else {
      return 0 /* Disabled */;
    }
  }
}
var LocalWebWorkerExtHostEnablement = /* @__PURE__ */ ((LocalWebWorkerExtHostEnablement2) => {
  LocalWebWorkerExtHostEnablement2[LocalWebWorkerExtHostEnablement2["Disabled"] = 0] = "Disabled";
  LocalWebWorkerExtHostEnablement2[LocalWebWorkerExtHostEnablement2["Eager"] = 1] = "Eager";
  LocalWebWorkerExtHostEnablement2[LocalWebWorkerExtHostEnablement2["Lazy"] = 2] = "Lazy";
  return LocalWebWorkerExtHostEnablement2;
})(LocalWebWorkerExtHostEnablement || {});
let NativeExtensionHostKindPicker = class {
  constructor(environmentService, configurationService, _logService) {
    this._logService = _logService;
    this._hasRemoteExtHost = Boolean(environmentService.remoteAuthority);
    const webWorkerExtHostEnablement = determineLocalWebWorkerExtHostEnablement(environmentService, configurationService);
    this._hasWebWorkerExtHost = webWorkerExtHostEnablement !== 0 /* Disabled */;
  }
  pickExtensionHostKind(extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference) {
    const result = NativeExtensionHostKindPicker.pickExtensionHostKind(extensionKinds, isInstalledLocally, isInstalledRemotely, preference, this._hasRemoteExtHost, this._hasWebWorkerExtHost);
    this._logService.trace(`pickRunningLocation for ${extensionId.value}, extension kinds: [${extensionKinds.join(", ")}], isInstalledLocally: ${isInstalledLocally}, isInstalledRemotely: ${isInstalledRemotely}, preference: ${extensionRunningPreferenceToString(preference)} => ${extensionHostKindToString(result)}`);
    return result;
  }
  static pickExtensionHostKind(extensionKinds, isInstalledLocally, isInstalledRemotely, preference, hasRemoteExtHost, hasWebWorkerExtHost) {
    const result = [];
    for (const extensionKind of extensionKinds) {
      if (extensionKind === "ui" && isInstalledLocally) {
        if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Local) {
          return ExtensionHostKind.LocalProcess;
        } else {
          result.push(ExtensionHostKind.LocalProcess);
        }
      }
      if (extensionKind === "workspace" && isInstalledRemotely) {
        if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Remote) {
          return ExtensionHostKind.Remote;
        } else {
          result.push(ExtensionHostKind.Remote);
        }
      }
      if (extensionKind === "workspace" && !hasRemoteExtHost) {
        if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Local) {
          return ExtensionHostKind.LocalProcess;
        } else {
          result.push(ExtensionHostKind.LocalProcess);
        }
      }
      if (extensionKind === "web" && isInstalledLocally && hasWebWorkerExtHost) {
        if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Local) {
          return ExtensionHostKind.LocalWebWorker;
        } else {
          result.push(ExtensionHostKind.LocalWebWorker);
        }
      }
    }
    return result.length > 0 ? result[0] : null;
  }
};
NativeExtensionHostKindPicker = __decorateClass([
  __decorateParam(0, IWorkbenchEnvironmentService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ILogService)
], NativeExtensionHostKindPicker);
class RestartExtensionHostAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.restartExtensionHost",
      title: nls.localize2("restartExtensionHost", "Restart Extension Host"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const extensionService = accessor.get(IExtensionService);
    const stopped = await extensionService.stopExtensionHosts(nls.localize("restartExtensionHost.reason", "An explicit request"));
    if (stopped) {
      extensionService.startExtensionHosts();
    }
  }
}
registerAction2(RestartExtensionHostAction);
registerSingleton(IExtensionService, NativeExtensionService, InstantiationType.Eager);
export {
  NativeExtensionHostKindPicker,
  NativeExtensionService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2VsZWN0cm9uLWJyb3dzZXIvbmF0aXZlRXh0ZW5zaW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJ1bldoZW5XaW5kb3dJZGxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBwZXJmb3JtYW5jZSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBpc0NJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmF0aXZlL2NvbW1vbi9uYXRpdmUuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIElQcm9tcHRDaG9pY2UsIE5vdGlmaWNhdGlvblByaW9yaXR5LCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50Q29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLCBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yLCBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yQ29kZSwgUmVtb3RlQ29ubmVjdGlvblR5cGUsIFJlc29sdmVyUmVzdWx0LCBnZXRSZW1vdGVBdXRob3JpdHlQcmVmaXggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyLmpzJztcbmltcG9ydCB7IElSZW1vdGVFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUV4dGVuc2lvbnNTY2FubmVyLmpzJztcbmltcG9ydCB7IGdldFJlbW90ZU5hbWUsIGlzTG9vcGJhY2tIb3N0LCBwYXJzZUF1dGhvcml0eVdpdGhQb3J0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVIb3N0cy5qcyc7XG5pbXBvcnQgeyB1cGRhdGVQcm94eUNvbmZpZ3VyYXRpb25zU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVuYWJsZW1lbnRTdGF0ZSwgSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElXZWJXb3JrZXJFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyLCBJV2ViV29ya2VyRXh0ZW5zaW9uSG9zdEluaXREYXRhLCBXZWJXb3JrZXJFeHRlbnNpb25Ib3N0IH0gZnJvbSAnLi4vYnJvd3Nlci93ZWJXb3JrZXJFeHRlbnNpb25Ib3N0LmpzJztcbmltcG9ydCB7IEFic3RyYWN0RXh0ZW5zaW9uU2VydmljZSwgRXh0ZW5zaW9uSG9zdENyYXNoVHJhY2tlciwgSUV4dGVuc2lvbkhvc3RGYWN0b3J5LCBMb2NhbEV4dGVuc2lvbnMsIFJlbW90ZUV4dGVuc2lvbnMsIFJlc29sdmVkRXh0ZW5zaW9ucywgUmVzb2x2ZXJFeHRlbnNpb25zLCBjaGVja0VuYWJsZWRBbmRQcm9wb3NlZEFQSSwgZXh0ZW5zaW9uSXNFbmFibGVkLCBpc1Jlc29sdmVyRXh0ZW5zaW9uIH0gZnJvbSAnLi4vY29tbW9uL2Fic3RyYWN0RXh0ZW5zaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5U25hcHNob3QgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBwYXJzZUV4dGVuc2lvbkRldk9wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uRGV2T3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25Ib3N0S2luZCwgRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UsIElFeHRlbnNpb25Ib3N0S2luZFBpY2tlciwgZXh0ZW5zaW9uSG9zdEtpbmRUb1N0cmluZywgZXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2VUb1N0cmluZyB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25Ib3N0S2luZC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uSG9zdE1hbmFnZXIgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RFeGl0Q29kZSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25Ib3N0UHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24sIExvY2FsUHJvY2Vzc1J1bm5pbmdMb2NhdGlvbiwgTG9jYWxXZWJXb3JrZXJSdW5uaW5nTG9jYXRpb24gfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvblRyYWNrZXIsIGZpbHRlckV4dGVuc2lvbkRlc2NyaXB0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25SdW5uaW5nTG9jYXRpb25UcmFja2VyLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RFeHRlbnNpb25zLCBFeHRlbnNpb25Ib3N0U3RhcnR1cCwgSUV4dGVuc2lvbkhvc3QsIElFeHRlbnNpb25TZXJ2aWNlLCBXZWJXb3JrZXJFeHRIb3N0Q29uZmlnVmFsdWUsIHRvRXh0ZW5zaW9uLCB3ZWJXb3JrZXJFeHRIb3N0Q29uZmlnIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1Byb3Bvc2VkQXBpIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnNQcm9wb3NlZEFwaS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlciwgSVJlbW90ZUV4dGVuc2lvbkhvc3RJbml0RGF0YSwgUmVtb3RlRXh0ZW5zaW9uSG9zdCB9IGZyb20gJy4uL2NvbW1vbi9yZW1vdGVFeHRlbnNpb25Ib3N0LmpzJztcbmltcG9ydCB7IENhY2hlZEV4dGVuc2lvblNjYW5uZXIgfSBmcm9tICcuL2NhY2hlZEV4dGVuc2lvblNjYW5uZXIuanMnO1xuaW1wb3J0IHsgSUxvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIsIElMb2NhbFByb2Nlc3NFeHRlbnNpb25Ib3N0SW5pdERhdGEsIE5hdGl2ZUxvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3QgfSBmcm9tICcuL2xvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3QuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW1vdGVFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9yZW1vdGUvY29tbW9uL3JlbW90ZUV4cGxvcmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBc3luY0l0ZXJhYmxlRW1pdHRlciwgQXN5bmNJdGVyYWJsZVByb2R1Y2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG5leHBvcnQgY2xhc3MgTmF0aXZlRXh0ZW5zaW9uU2VydmljZSBleHRlbmRzIEFic3RyYWN0RXh0ZW5zaW9uU2VydmljZSBpbXBsZW1lbnRzIElFeHRlbnNpb25TZXJ2aWNlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TY2FubmVyOiBDYWNoZWRFeHRlbnNpb25TY2FubmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbENyYXNoVHJhY2tlciA9IG5ldyBFeHRlbnNpb25Ib3N0Q3Jhc2hUcmFja2VyKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSBleHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZTogSVJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UgcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlOiBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElSZW1vdGVFeHBsb3JlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBleHRlbnNpb25zUHJvcG9zZWRBcGkgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zUHJvcG9zZWRBcGkpO1xuXHRcdGNvbnN0IGV4dGVuc2lvblNjYW5uZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDYWNoZWRFeHRlbnNpb25TY2FubmVyKTtcblx0XHRjb25zdCBleHRlbnNpb25Ib3N0RmFjdG9yeSA9IG5ldyBOYXRpdmVFeHRlbnNpb25Ib3N0RmFjdG9yeShcblx0XHRcdGV4dGVuc2lvbnNQcm9wb3NlZEFwaSxcblx0XHRcdGV4dGVuc2lvblNjYW5uZXIsXG5cdFx0XHQoKSA9PiB0aGlzLl9nZXRFeHRlbnNpb25SZWdpc3RyeVNuYXBzaG90V2hlblJlYWR5KCksXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdGVudmlyb25tZW50U2VydmljZSxcblx0XHRcdGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRyZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsXG5cdFx0XHRsb2dTZXJ2aWNlXG5cdFx0KTtcblx0XHRzdXBlcihcblx0XHRcdHsgaGFzTG9jYWxQcm9jZXNzOiB0cnVlLCBhbGxvd1JlbW90ZUV4dGVuc2lvbnNJbkxvY2FsV2ViV29ya2VyOiBmYWxzZSB9LFxuXHRcdFx0ZXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLFxuXHRcdFx0ZXh0ZW5zaW9uSG9zdEZhY3RvcnksXG5cdFx0XHRuZXcgTmF0aXZlRXh0ZW5zaW9uSG9zdEtpbmRQaWNrZXIoZW52aXJvbm1lbnRTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgbG9nU2VydmljZSksXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHRlbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0ZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0ZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0XHRjb250ZXh0U2VydmljZSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0ZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSxcblx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0XHRyZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0XHRyZW1vdGVFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsXG5cdFx0XHRsaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdFx0ZGlhbG9nU2VydmljZVxuXHRcdCk7XG5cblx0XHR0aGlzLl9leHRlbnNpb25TY2FubmVyID0gZXh0ZW5zaW9uU2Nhbm5lcjtcblxuXHRcdC8vIGRlbGF5IGV4dGVuc2lvbiBob3N0IGNyZWF0aW9uIGFuZCBleHRlbnNpb24gc2Nhbm5pbmdcblx0XHQvLyB1bnRpbCB0aGUgd29ya2JlbmNoIGlzIHJ1bm5pbmcuIHdlIGNhbm5vdCBkZWZlciB0aGVcblx0XHQvLyBleHRlbnNpb24gaG9zdCBtb3JlIChMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCkgYmVjYXVzZVxuXHRcdC8vIHNvbWUgZWRpdG9ycyByZXF1aXJlIHRoZSBleHRlbnNpb24gaG9zdCB0byByZXN0b3JlXG5cdFx0Ly8gYW5kIHRoaXMgd291bGQgcmVzdWx0IGluIGEgZGVhZGxvY2tcblx0XHQvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzQxMzIyXG5cdFx0bGlmZWN5Y2xlU2VydmljZS53aGVuKExpZmVjeWNsZVBoYXNlLlJlYWR5KS50aGVuKCgpID0+IHtcblx0XHRcdC8vIHJlc2NoZWR1bGUgdG8gZW5zdXJlIHRoaXMgcnVucyBhZnRlciByZXN0b3Jpbmcgdmlld2xldHMsIHBhbmVscywgYW5kIGVkaXRvcnNcblx0XHRcdHJ1bldoZW5XaW5kb3dJZGxlKG1haW5XaW5kb3csICgpID0+IHtcblx0XHRcdFx0dGhpcy5faW5pdGlhbGl6ZUlmTmVlZGVkKCk7XG5cdFx0XHR9LCA1MCAvKm1heCBkZWxheSovKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NjYW5BbGxMb2NhbEV4dGVuc2lvbnMoKTogUHJvbWlzZTxJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25TY2FubmVyLnNjYW5uZWRFeHRlbnNpb25zO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vbkV4dGVuc2lvbkhvc3RDcmFzaGVkKGV4dGVuc2lvbkhvc3Q6IElFeHRlbnNpb25Ib3N0TWFuYWdlciwgY29kZTogbnVtYmVyLCBzaWduYWw6IHN0cmluZyB8IG51bGwpOiB2b2lkIHtcblxuXHRcdGNvbnN0IGFjdGl2YXRlZEV4dGVuc2lvbnM6IEV4dGVuc2lvbklkZW50aWZpZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNTdGF0dXMgPSB0aGlzLmdldEV4dGVuc2lvbnNTdGF0dXMoKTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhleHRlbnNpb25zU3RhdHVzKSkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uU3RhdHVzID0gZXh0ZW5zaW9uc1N0YXR1c1trZXldO1xuXHRcdFx0aWYgKGV4dGVuc2lvblN0YXR1cy5hY3RpdmF0aW9uU3RhcnRlZCAmJiBleHRlbnNpb25Ib3N0LmNvbnRhaW5zRXh0ZW5zaW9uKGV4dGVuc2lvblN0YXR1cy5pZCkpIHtcblx0XHRcdFx0YWN0aXZhdGVkRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvblN0YXR1cy5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c3VwZXIuX29uRXh0ZW5zaW9uSG9zdENyYXNoZWQoZXh0ZW5zaW9uSG9zdCwgY29kZSwgc2lnbmFsKTtcblxuXHRcdGlmIChleHRlbnNpb25Ib3N0LmtpbmQgPT09IEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsUHJvY2Vzcykge1xuXHRcdFx0aWYgKGNvZGUgPT09IEV4dGVuc2lvbkhvc3RFeGl0Q29kZS5WZXJzaW9uTWlzbWF0Y2gpIHtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFx0U2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdleHRlbnNpb25TZXJ2aWNlLnZlcnNpb25NaXNtYXRjaENyYXNoJywgXCJFeHRlbnNpb24gaG9zdCBjYW5ub3Qgc3RhcnQ6IHZlcnNpb24gbWlzbWF0Y2guXCIpLFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdyZWxhdW5jaCcsIFwiUmVsYXVuY2ggVlMgQ29kZVwiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbigoYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXHRcdFx0XHRcdFx0XHRcdGhvc3RTZXJ2aWNlLnJlc3RhcnQoKTtcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dFeHRlbnNpb25Ib3N0Q3Jhc2goZXh0ZW5zaW9uSG9zdCk7XG5cdFx0XHR0aGlzLl9zZW5kRXh0ZW5zaW9uSG9zdENyYXNoVGVsZW1ldHJ5KGNvZGUsIHNpZ25hbCwgYWN0aXZhdGVkRXh0ZW5zaW9ucyk7XG5cblx0XHRcdHRoaXMuX2xvY2FsQ3Jhc2hUcmFja2VyLnJlZ2lzdGVyQ3Jhc2goKTtcblxuXHRcdFx0aWYgKHRoaXMuX2xvY2FsQ3Jhc2hUcmFja2VyLnNob3VsZEF1dG9tYXRpY2FsbHlSZXN0YXJ0KCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBBdXRvbWF0aWNhbGx5IHJlc3RhcnRpbmcgdGhlIGV4dGVuc2lvbiBob3N0LmApO1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnN0YXR1cyhubHMubG9jYWxpemUoJ2V4dGVuc2lvblNlcnZpY2UuYXV0b1Jlc3RhcnQnLCBcIlRoZSBleHRlbnNpb24gaG9zdCB0ZXJtaW5hdGVkIHVuZXhwZWN0ZWRseS4gUmVzdGFydGluZy4uLlwiKSwgeyBoaWRlQWZ0ZXI6IDUwMDAgfSk7XG5cdFx0XHRcdHRoaXMuc3RhcnRFeHRlbnNpb25Ib3N0cygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgY2hvaWNlczogSVByb21wdENob2ljZVtdID0gW107XG5cdFx0XHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCkge1xuXHRcdFx0XHRcdGNob2ljZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdzdGFydEJpc2VjdCcsIFwiU3RhcnQgRXh0ZW5zaW9uIEJpc2VjdFwiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0XHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZXh0ZW5zaW9uLmJpc2VjdC5zdGFydCcpO1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjaG9pY2VzLnB1c2goe1xuXHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnZGV2VG9vbHMnLCBcIk9wZW4gRGV2ZWxvcGVyIFRvb2xzXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9uYXRpdmVIb3N0U2VydmljZS5vcGVuRGV2VG9vbHMoKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2hvaWNlcy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdyZXN0YXJ0JywgXCJSZXN0YXJ0IEV4dGVuc2lvbiBIb3N0XCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5zdGFydEV4dGVuc2lvbkhvc3RzKClcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc0J1aWx0KSB7XG5cdFx0XHRcdFx0Y2hvaWNlcy5wdXNoKHtcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2xlYXJuTW9yZScsIFwiTGVhcm4gTW9yZVwiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3Qgb3BlbmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJT3BlbmVyU2VydmljZSk7XG5cdFx0XHRcdFx0XHRcdFx0b3BlbmVyU2VydmljZS5vcGVuKCdodHRwczovL2FrYS5tcy92c2NvZGUtZXh0ZW5zaW9uLWJpc2VjdCcpO1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFNldmVyaXR5LkVycm9yLCBubHMubG9jYWxpemUoJ2V4dGVuc2lvblNlcnZpY2UuY3Jhc2gnLCBcIkV4dGVuc2lvbiBob3N0IHRlcm1pbmF0ZWQgdW5leHBlY3RlZGx5IDMgdGltZXMgd2l0aGluIHRoZSBsYXN0IDUgbWludXRlcy5cIiksIGNob2ljZXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NlbmRFeHRlbnNpb25Ib3N0Q3Jhc2hUZWxlbWV0cnkoY29kZTogbnVtYmVyLCBzaWduYWw6IHN0cmluZyB8IG51bGwsIGFjdGl2YXRlZEV4dGVuc2lvbnM6IEV4dGVuc2lvbklkZW50aWZpZXJbXSk6IHZvaWQge1xuXHRcdHR5cGUgRXh0ZW5zaW9uSG9zdENyYXNoQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2FsZXhkaW1hJztcblx0XHRcdGNvbW1lbnQ6ICdUaGUgZXh0ZW5zaW9uIGhvc3QgaGFzIHRlcm1pbmF0ZWQgdW5leHBlY3RlZGx5Jztcblx0XHRcdGNvZGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgZXhpdCBjb2RlIG9mIHRoZSBleHRlbnNpb24gaG9zdCBwcm9jZXNzLicgfTtcblx0XHRcdHNpZ25hbDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBzaWduYWwgdGhhdCBjYXVzZWQgdGhlIGV4dGVuc2lvbiBob3N0IHByb2Nlc3MgdG8gZXhpdC4nIH07XG5cdFx0XHRleHRlbnNpb25JZHM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgbGlzdCBvZiBsb2FkZWQgZXh0ZW5zaW9ucy4nIH07XG5cdFx0fTtcblx0XHR0eXBlIEV4dGVuc2lvbkhvc3RDcmFzaEV2ZW50ID0ge1xuXHRcdFx0Y29kZTogbnVtYmVyO1xuXHRcdFx0c2lnbmFsOiBzdHJpbmcgfCBudWxsO1xuXHRcdFx0ZXh0ZW5zaW9uSWRzOiBzdHJpbmdbXTtcblx0XHR9O1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFeHRlbnNpb25Ib3N0Q3Jhc2hFdmVudCwgRXh0ZW5zaW9uSG9zdENyYXNoQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25Ib3N0Q3Jhc2gnLCB7XG5cdFx0XHRjb2RlLFxuXHRcdFx0c2lnbmFsLFxuXHRcdFx0ZXh0ZW5zaW9uSWRzOiBhY3RpdmF0ZWRFeHRlbnNpb25zLm1hcChlID0+IGUudmFsdWUpXG5cdFx0fSk7XG5cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbklkIG9mIGFjdGl2YXRlZEV4dGVuc2lvbnMpIHtcblx0XHRcdHR5cGUgRXh0ZW5zaW9uSG9zdENyYXNoRXh0ZW5zaW9uQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnYWxleGRpbWEnO1xuXHRcdFx0XHRjb21tZW50OiAnVGhlIGV4dGVuc2lvbiBob3N0IGhhcyB0ZXJtaW5hdGVkIHVuZXhwZWN0ZWRseSc7XG5cdFx0XHRcdGNvZGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgZXhpdCBjb2RlIG9mIHRoZSBleHRlbnNpb24gaG9zdCBwcm9jZXNzLicgfTtcblx0XHRcdFx0c2lnbmFsOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHNpZ25hbCB0aGF0IGNhdXNlZCB0aGUgZXh0ZW5zaW9uIGhvc3QgcHJvY2VzcyB0byBleGl0LicgfTtcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgaWRlbnRpZmllciBvZiB0aGUgZXh0ZW5zaW9uLicgfTtcblx0XHRcdH07XG5cdFx0XHR0eXBlIEV4dGVuc2lvbkhvc3RDcmFzaEV4dGVuc2lvbkV2ZW50ID0ge1xuXHRcdFx0XHRjb2RlOiBudW1iZXI7XG5cdFx0XHRcdHNpZ25hbDogc3RyaW5nIHwgbnVsbDtcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0XHRcdH07XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RXh0ZW5zaW9uSG9zdENyYXNoRXh0ZW5zaW9uRXZlbnQsIEV4dGVuc2lvbkhvc3RDcmFzaEV4dGVuc2lvbkNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uSG9zdENyYXNoRXh0ZW5zaW9uJywge1xuXHRcdFx0XHRjb2RlLFxuXHRcdFx0XHRzaWduYWwsXG5cdFx0XHRcdGV4dGVuc2lvbklkOiBleHRlbnNpb25JZC52YWx1ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIGltcGxcblxuXHRwcm90ZWN0ZWQgYXN5bmMgX3Jlc29sdmVBdXRob3JpdHkocmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcpOiBQcm9taXNlPFJlc29sdmVyUmVzdWx0PiB7XG5cblx0XHRjb25zdCBhdXRob3JpdHlQbHVzSW5kZXggPSByZW1vdGVBdXRob3JpdHkuaW5kZXhPZignKycpO1xuXHRcdGlmIChhdXRob3JpdHlQbHVzSW5kZXggPT09IC0xKSB7XG5cdFx0XHQvLyBUaGlzIGF1dGhvcml0eSBkb2VzIG5vdCBuZWVkIHRvIGJlIHJlc29sdmVkLCBzaW1wbHkgcGFyc2UgdGhlIHBvcnQgbnVtYmVyXG5cdFx0XHRjb25zdCB7IGhvc3QsIHBvcnQgfSA9IHBhcnNlQXV0aG9yaXR5V2l0aFBvcnQocmVtb3RlQXV0aG9yaXR5KTtcblxuXHRcdFx0Ly8gQSBkaXJlY3QgYDxob3N0Pjo8cG9ydD5gIGF1dGhvcml0eSBieXBhc3NlcyByZXNvbHZlciBleHRlbnNpb25zIGFuZCBjb25uZWN0c1xuXHRcdFx0Ly8gc3RyYWlnaHQgdG8gdGhlIGdpdmVuIHNlcnZlci4gVGhpcyBmb3JtIGNhbiBvcmlnaW5hdGUgZnJvbSB1bnRydXN0ZWQgc291cmNlc1xuXHRcdFx0Ly8gKGUuZy4gdGhlIGByZW1vdGVBdXRob3JpdHlgIG9mIGEgYC5jb2RlLXdvcmtzcGFjZWAgZmlsZSksIHNvIGJlZm9yZSBjb25uZWN0aW5nXG5cdFx0XHQvLyB0byBhbnl0aGluZyB0aGF0IGlzIG5vdCB0aGUgbG9jYWwgbG9vcGJhY2sgaW50ZXJmYWNlIHdlIGFzayB0aGUgdXNlciB0byBjb25maXJtLlxuXHRcdFx0Ly8gVGhpcyBwcmV2ZW50cyBhIGNyYWZ0ZWQgd29ya3NwYWNlIGZyb20gc2lsZW50bHkgcG9pbnRpbmcgdGhlIHdpbmRvdydzIGJhY2tlbmQgYXRcblx0XHRcdC8vIGFuIGF0dGFja2VyIGNvbnRyb2xsZWQgc2VydmVyLlxuXHRcdFx0aWYgKCFpc0xvb3BiYWNrSG9zdChob3N0KSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jb25maXJtRGlyZWN0UmVtb3RlQ29ubmVjdGlvbihob3N0LCBwb3J0KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YXV0aG9yaXR5OiB7XG5cdFx0XHRcdFx0YXV0aG9yaXR5OiByZW1vdGVBdXRob3JpdHksXG5cdFx0XHRcdFx0Y29ubmVjdFRvOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBSZW1vdGVDb25uZWN0aW9uVHlwZS5XZWJTb2NrZXQsXG5cdFx0XHRcdFx0XHRob3N0LFxuXHRcdFx0XHRcdFx0cG9ydFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y29ubmVjdGlvblRva2VuOiB1bmRlZmluZWRcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZUF1dGhvcml0eU9uRXh0ZW5zaW9uSG9zdHMoRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzLCByZW1vdGVBdXRob3JpdHkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29uZmlybURpcmVjdFJlbW90ZUNvbm5lY3Rpb24oaG9zdDogc3RyaW5nLCBwb3J0OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3JlbW90ZUNvbm5lY3Rpb25Db25maXJtJywgXCJBbGxvdyBjb25uZWN0aW5nIHRvIHRoZSByZW1vdGUgc2VydmVyICd7MH06ezF9Jz9cIiwgaG9zdCwgcG9ydCksXG5cdFx0XHRkZXRhaWw6IG5scy5sb2NhbGl6ZSgncmVtb3RlQ29ubmVjdGlvbkNvbmZpcm1EZXRhaWwnLCBcIkNvZGUgaXMgYWJvdXQgdG8gY29ubmVjdCB0byAnezB9OnsxfScgdG8gaG9zdCBhIHJlbW90ZSBleHRlbnNpb24gaG9zdC4gT25seSBjb250aW51ZSBpZiB5b3UgdHJ1c3QgdGhpcyBzZXJ2ZXIsIGFzIGl0IHdpbGwgYmUgYWJsZSB0byBydW4gY29kZSBhbmQgYWNjZXNzIGZpbGVzIG9uIHlvdXIgYmVoYWxmLlwiLCBob3N0LCBwb3J0KSxcblx0XHRcdHByaW1hcnlCdXR0b246IG5scy5sb2NhbGl6ZSgncmVtb3RlQ29ubmVjdGlvbkNvbmZpcm1CdXR0b24nLCBcIkNvbm5lY3RcIilcblx0XHR9KTtcblxuXHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvcihcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdyZW1vdGVDb25uZWN0aW9uUmVqZWN0ZWQnLCBcIkNvbm5lY3Rpb24gdG8gJ3swfTp7MX0nIHdhcyBub3QgYWxsb3dlZC5cIiwgaG9zdCwgcG9ydCksXG5cdFx0XHRcdFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3JDb2RlLk5vdEF2YWlsYWJsZVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRDYW5vbmljYWxVUkkocmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcsIHVyaTogVVJJKTogUHJvbWlzZTxVUkk+IHtcblxuXHRcdGNvbnN0IGF1dGhvcml0eVBsdXNJbmRleCA9IHJlbW90ZUF1dGhvcml0eS5pbmRleE9mKCcrJyk7XG5cdFx0aWYgKGF1dGhvcml0eVBsdXNJbmRleCA9PT0gLTEpIHtcblx0XHRcdC8vIFRoaXMgYXV0aG9yaXR5IGRvZXMgbm90IHVzZSBhIHJlc29sdmVyXG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3RzID0gdGhpcy5fZ2V0RXh0ZW5zaW9uSG9zdE1hbmFnZXJzKEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsUHJvY2Vzcyk7XG5cdFx0aWYgKGxvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3RzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gbm8gbG9jYWwgcHJvY2VzcyBleHRlbnNpb24gaG9zdHNcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlc29sdmUgY2Fub25pY2FsIFVSSWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChsb2NhbFByb2Nlc3NFeHRlbnNpb25Ib3N0cy5tYXAoZXh0SG9zdCA9PiBleHRIb3N0LmdldENhbm9uaWNhbFVSSShyZW1vdGVBdXRob3JpdHksIHVyaSkpKTtcblxuXHRcdGZvciAoY29uc3QgcmVzdWx0IG9mIHJlc3VsdHMpIHtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyB3ZSBjYW4gb25seSByZWFjaCB0aGlzIGlmIHRoZXJlIHdhcyBubyByZXNvbHZlciBleHRlbnNpb24gdGhhdCBjYW4gcmV0dXJuIHRoZSBjYW5ub25pY2FsIHVyaVxuXHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGdldCBjYW5vbmljYWwgVVJJIGJlY2F1c2Ugbm8gZXh0ZW5zaW9uIGlzIGluc3RhbGxlZCB0byByZXNvbHZlICR7Z2V0UmVtb3RlQXV0aG9yaXR5UHJlZml4KHJlbW90ZUF1dGhvcml0eSl9YCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3Jlc29sdmVFeHRlbnNpb25zKCk6IEFzeW5jSXRlcmFibGU8UmVzb2x2ZWRFeHRlbnNpb25zPiB7XG5cdFx0cmV0dXJuIG5ldyBBc3luY0l0ZXJhYmxlUHJvZHVjZXIoZW1pdHRlciA9PiB0aGlzLl9kb1Jlc29sdmVFeHRlbnNpb25zKGVtaXR0ZXIpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvUmVzb2x2ZUV4dGVuc2lvbnMoZW1pdHRlcjogQXN5bmNJdGVyYWJsZUVtaXR0ZXI8UmVzb2x2ZWRFeHRlbnNpb25zPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2V4dGVuc2lvblNjYW5uZXIuc3RhcnRTY2FubmluZ0V4dGVuc2lvbnMoKTtcblxuXHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cblx0XHRsZXQgcmVtb3RlRW52OiBJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCB8IG51bGwgPSBudWxsO1xuXHRcdGxldCByZW1vdGVFeHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSA9IFtdO1xuXG5cdFx0aWYgKHJlbW90ZUF1dGhvcml0eSkge1xuXG5cdFx0XHR0aGlzLl9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UuX3NldENhbm9uaWNhbFVSSVByb3ZpZGVyKGFzeW5jICh1cmkpID0+IHtcblx0XHRcdFx0aWYgKHVyaS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlUmVtb3RlIHx8IHVyaS5hdXRob3JpdHkgIT09IHJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdC8vIFRoZSBjdXJyZW50IHJlbW90ZSBhdXRob3JpdHkgcmVzb2x2ZXIgY2Fubm90IGdpdmUgdGhlIGNhbm9uaWNhbCBVUkkgZm9yIHRoaXMgVVJJXG5cdFx0XHRcdFx0cmV0dXJuIHVyaTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwZXJmb3JtYW5jZS5tYXJrKGBjb2RlL3dpbGxHZXRDYW5vbmljYWxVUkkvJHtnZXRSZW1vdGVBdXRob3JpdHlQcmVmaXgocmVtb3RlQXV0aG9yaXR5KX1gKTtcblx0XHRcdFx0aWYgKGlzQ0kpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEludm9raW5nIGdldENhbm9uaWNhbFVSSSBmb3IgYXV0aG9yaXR5ICR7Z2V0UmVtb3RlQXV0aG9yaXR5UHJlZml4KHJlbW90ZUF1dGhvcml0eSl9Li4uYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fZ2V0Q2Fub25pY2FsVVJJKHJlbW90ZUF1dGhvcml0eSwgdXJpKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRwZXJmb3JtYW5jZS5tYXJrKGBjb2RlL2RpZEdldENhbm9uaWNhbFVSSS8ke2dldFJlbW90ZUF1dGhvcml0eVByZWZpeChyZW1vdGVBdXRob3JpdHkpfWApO1xuXHRcdFx0XHRcdGlmIChpc0NJKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYGdldENhbm9uaWNhbFVSSSByZXR1cm5lZCBmb3IgYXV0aG9yaXR5ICR7Z2V0UmVtb3RlQXV0aG9yaXR5UHJlZml4KHJlbW90ZUF1dGhvcml0eSl9LmApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChpc0NJKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgU3RhcnRpbmcgdG8gd2FpdCBvbiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS53b3Jrc3BhY2VSZXNvbHZlZC4uLmApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBOb3cgdGhhdCB0aGUgY2Fub25pY2FsIFVSSSBwcm92aWRlciBoYXMgYmVlbiByZWdpc3RlcmVkLCB3ZSBuZWVkIHRvIHdhaXQgZm9yIHRoZSB0cnVzdCBzdGF0ZSB0byBiZVxuXHRcdFx0Ly8gY2FsY3VsYXRlZC4gVGhlIHRydXN0IHN0YXRlIHdpbGwgYmUgdXNlZCB3aGlsZSByZXNvbHZpbmcgdGhlIGF1dGhvcml0eSwgaG93ZXZlciB0aGUgcmVzb2x2ZXIgY2FuXG5cdFx0XHQvLyBvdmVycmlkZSB0aGUgdHJ1c3Qgc3RhdGUgdGhyb3VnaCB0aGUgcmVzb2x2ZXIgcmVzdWx0LlxuXHRcdFx0YXdhaXQgdGhpcy5fd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS53b3Jrc3BhY2VSZXNvbHZlZDtcblxuXHRcdFx0aWYgKGlzQ0kpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBGaW5pc2hlZCB3YWl0aW5nIG9uIElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLndvcmtzcGFjZVJlc29sdmVkLmApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLl9zY2FuQWxsTG9jYWxFeHRlbnNpb25zKCk7XG5cdFx0XHRjb25zdCByZXNvbHZlckV4dGVuc2lvbnMgPSBsb2NhbEV4dGVuc2lvbnMuZmlsdGVyKGV4dGVuc2lvbiA9PiBpc1Jlc29sdmVyRXh0ZW5zaW9uKGV4dGVuc2lvbikpO1xuXHRcdFx0aWYgKHJlc29sdmVyRXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKG5ldyBSZXNvbHZlckV4dGVuc2lvbnMocmVzb2x2ZXJFeHRlbnNpb25zKSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCByZXNvbHZlclJlc3VsdDogUmVzb2x2ZXJSZXN1bHQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXNvbHZlclJlc3VsdCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVBdXRob3JpdHlJbml0aWFsKHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0aWYgKFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IuaXNOb1Jlc29sdmVyRm91bmQoZXJyKSkge1xuXHRcdFx0XHRcdGVyci5pc0hhbmRsZWQgPSBhd2FpdCB0aGlzLl9oYW5kbGVOb1Jlc29sdmVyRm91bmQocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvci5pc0hhbmRsZWQoZXJyKSkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5sb2coYEVycm9yIGhhbmRsZWQ6IE5vdCBzaG93aW5nIGEgbm90aWZpY2F0aW9uIGZvciB0aGUgZXJyb3JgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLl9zZXRSZXNvbHZlZEF1dGhvcml0eUVycm9yKHJlbW90ZUF1dGhvcml0eSwgZXJyKTtcblxuXHRcdFx0XHQvLyBQcm9jZWVkIHdpdGggdGhlIGxvY2FsIGV4dGVuc2lvbiBob3N0XG5cdFx0XHRcdHJldHVybiB0aGlzLl9zdGFydExvY2FsRXh0ZW5zaW9uSG9zdChlbWl0dGVyKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc2V0IHRoZSByZXNvbHZlZCBhdXRob3JpdHlcblx0XHRcdHRoaXMuX3JlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5fc2V0UmVzb2x2ZWRBdXRob3JpdHkocmVzb2x2ZXJSZXN1bHQuYXV0aG9yaXR5LCByZXNvbHZlclJlc3VsdC5vcHRpb25zKTtcblx0XHRcdHRoaXMuX3JlbW90ZUV4cGxvcmVyU2VydmljZS5zZXRUdW5uZWxJbmZvcm1hdGlvbihyZXNvbHZlclJlc3VsdC50dW5uZWxJbmZvcm1hdGlvbik7XG5cblx0XHRcdC8vIG1vbml0b3IgZm9yIGJyZWFrYWdlXG5cdFx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKTtcblx0XHRcdGlmIChjb25uZWN0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGNvbm5lY3Rpb24ub25EaWRTdGF0ZUNoYW5nZShhc3luYyAoZSkgPT4ge1xuXHRcdFx0XHRcdGlmIChlLnR5cGUgPT09IFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnRUeXBlLkNvbm5lY3Rpb25Mb3N0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UuX2NsZWFyUmVzb2x2ZWRBdXRob3JpdHkocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoY29ubmVjdGlvbi5vblJlY29ubmVjdGluZygoKSA9PiB0aGlzLl9yZXNvbHZlQXV0aG9yaXR5QWdhaW4oKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBmZXRjaCB0aGUgcmVtb3RlIGVudmlyb25tZW50XG5cdFx0XHRbcmVtb3RlRW52LCByZW1vdGVFeHRlbnNpb25zXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCksXG5cdFx0XHRcdHRoaXMuX3JlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuRXh0ZW5zaW9ucygpXG5cdFx0XHRdKTtcblxuXHRcdFx0aWYgKCFyZW1vdGVFbnYpIHtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoeyBzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnZ2V0RW52aXJvbm1lbnRGYWlsdXJlJywgXCJDb3VsZCBub3QgZmV0Y2ggcmVtb3RlIGVudmlyb25tZW50XCIpIH0pO1xuXHRcdFx0XHQvLyBQcm9jZWVkIHdpdGggdGhlIGxvY2FsIGV4dGVuc2lvbiBob3N0XG5cdFx0XHRcdHJldHVybiB0aGlzLl9zdGFydExvY2FsRXh0ZW5zaW9uSG9zdChlbWl0dGVyKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdXNlSG9zdFByb3h5RGVmYXVsdCA9IHJlbW90ZUVudi51c2VIb3N0UHJveHk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdodHRwLnVzZUxvY2FsUHJveHlDb25maWd1cmF0aW9uJykpIHtcblx0XHRcdFx0XHR1cGRhdGVQcm94eUNvbmZpZ3VyYXRpb25zU2NvcGUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2h0dHAudXNlTG9jYWxQcm94eUNvbmZpZ3VyYXRpb24nKSwgdXNlSG9zdFByb3h5RGVmYXVsdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHVwZGF0ZVByb3h5Q29uZmlndXJhdGlvbnNTY29wZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnaHR0cC51c2VMb2NhbFByb3h5Q29uZmlndXJhdGlvbicpLCB1c2VIb3N0UHJveHlEZWZhdWx0KTtcblx0XHR9IGVsc2Uge1xuXG5cdFx0XHR0aGlzLl9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UuX3NldENhbm9uaWNhbFVSSVByb3ZpZGVyKGFzeW5jICh1cmkpID0+IHVyaSk7XG5cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fc3RhcnRMb2NhbEV4dGVuc2lvbkhvc3QoZW1pdHRlciwgcmVtb3RlRXh0ZW5zaW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zdGFydExvY2FsRXh0ZW5zaW9uSG9zdChlbWl0dGVyOiBBc3luY0l0ZXJhYmxlRW1pdHRlcjxSZXNvbHZlZEV4dGVuc2lvbnM+LCByZW1vdGVFeHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSA9IFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gRW5zdXJlIHRoYXQgdGhlIHdvcmtzcGFjZSB0cnVzdCBzdGF0ZSBoYXMgYmVlbiBmdWxseSBpbml0aWFsaXplZCBzb1xuXHRcdC8vIHRoYXQgdGhlIGV4dGVuc2lvbiBob3N0IGNhbiBzdGFydCB3aXRoIHRoZSBjb3JyZWN0IHNldCBvZiBleHRlbnNpb25zLlxuXHRcdGF3YWl0IHRoaXMuX3dvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uud29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZDtcblxuXHRcdGlmIChyZW1vdGVFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0ZW1pdHRlci5lbWl0T25lKG5ldyBSZW1vdGVFeHRlbnNpb25zKHJlbW90ZUV4dGVuc2lvbnMpKTtcblx0XHR9XG5cblx0XHRlbWl0dGVyLmVtaXRPbmUobmV3IExvY2FsRXh0ZW5zaW9ucyhhd2FpdCB0aGlzLl9zY2FuQWxsTG9jYWxFeHRlbnNpb25zKCkpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfb25FeHRlbnNpb25Ib3N0RXhpdChjb2RlOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBEaXNwb3NlIGV2ZXJ5dGhpbmcgYXNzb2NpYXRlZCB3aXRoIHRoZSBleHRlbnNpb24gaG9zdFxuXHRcdGF3YWl0IHRoaXMuX2RvU3RvcEV4dGVuc2lvbkhvc3RzKCk7XG5cblx0XHQvLyBEaXNwb3NlIHRoZSBtYW5hZ2VtZW50IGNvbm5lY3Rpb24gdG8gYXZvaWQgcmVjb25uZWN0aW5nIGFmdGVyIHRoZSBleHRlbnNpb24gaG9zdCBleGl0c1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpO1xuXHRcdGNvbm5lY3Rpb24/LmRpc3Bvc2UoKTtcblxuXHRcdGlmIChwYXJzZUV4dGVuc2lvbkRldk9wdGlvbnModGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlKS5pc0V4dGVuc2lvbkRldlRlc3RGcm9tQ2xpKSB7XG5cdFx0XHQvLyBXaGVuIENMSSB0ZXN0aW5nIG1ha2Ugc3VyZSB0byBleGl0IHdpdGggcHJvcGVyIGV4aXQgY29kZVxuXHRcdFx0aWYgKGlzQ0kpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBBc2tpbmcgbmF0aXZlIGhvc3Qgc2VydmljZSB0byBleGl0IHdpdGggY29kZSAke2NvZGV9LmApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbmF0aXZlSG9zdFNlcnZpY2UuZXhpdChjb2RlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRXhwZWN0ZWQgZGV2ZWxvcG1lbnQgZXh0ZW5zaW9uIHRlcm1pbmF0aW9uOiBXaGVuIHRoZSBleHRlbnNpb24gaG9zdCBnb2VzIGRvd24gd2UgYWxzbyBzaHV0ZG93biB0aGUgd2luZG93XG5cdFx0XHR0aGlzLl9uYXRpdmVIb3N0U2VydmljZS5jbG9zZVdpbmRvdygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZU5vUmVzb2x2ZXJGb3VuZChyZW1vdGVBdXRob3JpdHk6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHJlbW90ZU5hbWUgPSBnZXRSZW1vdGVOYW1lKHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0Y29uc3QgcmVjb21tZW5kYXRpb24gPSB0aGlzLl9wcm9kdWN0U2VydmljZS5yZW1vdGVFeHRlbnNpb25UaXBzPy5bcmVtb3RlTmFtZV07XG5cdFx0aWYgKCFyZWNvbW1lbmRhdGlvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc29sdmVyRXh0ZW5zaW9uSWQgPSByZWNvbW1lbmRhdGlvbi5leHRlbnNpb25JZDtcblx0XHRjb25zdCBhbGxFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5fc2NhbkFsbExvY2FsRXh0ZW5zaW9ucygpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IGFsbEV4dGVuc2lvbnMuZmlsdGVyKGUgPT4gZS5pZGVudGlmaWVyLnZhbHVlID09PSByZXNvbHZlckV4dGVuc2lvbklkKVswXTtcblx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRpZiAoIWV4dGVuc2lvbklzRW5hYmxlZCh0aGlzLl9sb2dTZXJ2aWNlLCB0aGlzLl9leHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgZXh0ZW5zaW9uLCBmYWxzZSkpIHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnZW5hYmxlUmVzb2x2ZXInLCBcIkV4dGVuc2lvbiAnezB9JyBpcyByZXF1aXJlZCB0byBvcGVuIHRoZSByZW1vdGUgd2luZG93Llxcbk9LIHRvIGVuYWJsZT9cIiwgcmVjb21tZW5kYXRpb24uZnJpZW5kbHlOYW1lKTtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuSW5mbywgbWVzc2FnZSxcblx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnZW5hYmxlJywgJ0VuYWJsZSBhbmQgUmVsb2FkJyksXG5cdFx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2Uuc2V0RW5hYmxlbWVudChbdG9FeHRlbnNpb24oZXh0ZW5zaW9uKV0sIEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkR2xvYmFsbHkpO1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9ob3N0U2VydmljZS5yZWxvYWQoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzdGlja3k6IHRydWUsXG5cdFx0XHRcdFx0XHRwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuVVJHRU5UXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBJbnN0YWxsIHRoZSBFeHRlbnNpb24gYW5kIHJlbG9hZCB0aGUgd2luZG93IHRvIGhhbmRsZS5cblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ2luc3RhbGxSZXNvbHZlcicsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIHJlcXVpcmVkIHRvIG9wZW4gdGhlIHJlbW90ZSB3aW5kb3cuXFxuRG8geW91IHdhbnQgdG8gaW5zdGFsbCB0aGUgZXh0ZW5zaW9uP1wiLCByZWNvbW1lbmRhdGlvbi5mcmllbmRseU5hbWUpO1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuSW5mbywgbWVzc2FnZSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdpbnN0YWxsJywgJ0luc3RhbGwgYW5kIFJlbG9hZCcpLFxuXHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgW2dhbGxlcnlFeHRlbnNpb25dID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyBpZDogcmVzb2x2ZXJFeHRlbnNpb25JZCB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdFx0XHRpZiAoZ2FsbGVyeUV4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUdhbGxlcnkoZ2FsbGVyeUV4dGVuc2lvbik7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2hvc3RTZXJ2aWNlLnJlbG9hZCgpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihubHMubG9jYWxpemUoJ3Jlc29sdmVyRXh0ZW5zaW9uTm90Rm91bmQnLCBcImB7MH1gIG5vdCBmb3VuZCBvbiBtYXJrZXRwbGFjZVwiKSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c3RpY2t5OiB0cnVlLFxuXHRcdFx0XHRcdHByaW9yaXR5OiBOb3RpZmljYXRpb25Qcmlvcml0eS5VUkdFTlQsXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuY2xhc3MgTmF0aXZlRXh0ZW5zaW9uSG9zdEZhY3RvcnkgaW1wbGVtZW50cyBJRXh0ZW5zaW9uSG9zdEZhY3Rvcnkge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dlYldvcmtlckV4dEhvc3RFbmFibGVtZW50OiBMb2NhbFdlYldvcmtlckV4dEhvc3RFbmFibGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbnNQcm9wb3NlZEFwaTogRXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNjYW5uZXI6IENhY2hlZEV4dGVuc2lvblNjYW5uZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0RXh0ZW5zaW9uUmVnaXN0cnlTbmFwc2hvdFdoZW5SZWFkeTogKCkgPT4gUHJvbWlzZTxFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5U25hcHNob3Q+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlOiBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fd2ViV29ya2VyRXh0SG9zdEVuYWJsZW1lbnQgPSBkZXRlcm1pbmVMb2NhbFdlYldvcmtlckV4dEhvc3RFbmFibGVtZW50KGVudmlyb25tZW50U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZUV4dGVuc2lvbkhvc3QocnVubmluZ0xvY2F0aW9uczogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlciwgcnVubmluZ0xvY2F0aW9uOiBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24sIGlzSW5pdGlhbFN0YXJ0OiBib29sZWFuKTogSUV4dGVuc2lvbkhvc3QgfCBudWxsIHtcblx0XHRzd2l0Y2ggKHJ1bm5pbmdMb2NhdGlvbi5raW5kKSB7XG5cdFx0XHRjYXNlIEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsUHJvY2Vzczoge1xuXHRcdFx0XHRjb25zdCBzdGFydHVwID0gKFxuXHRcdFx0XHRcdGlzSW5pdGlhbFN0YXJ0XG5cdFx0XHRcdFx0XHQ/IEV4dGVuc2lvbkhvc3RTdGFydHVwLkVhZ2VyTWFudWFsU3RhcnRcblx0XHRcdFx0XHRcdDogRXh0ZW5zaW9uSG9zdFN0YXJ0dXAuRWFnZXJBdXRvU3RhcnRcblx0XHRcdFx0KTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5hdGl2ZUxvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3QsIHJ1bm5pbmdMb2NhdGlvbiwgc3RhcnR1cCwgdGhpcy5fY3JlYXRlTG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlcihydW5uaW5nTG9jYXRpb25zLCBpc0luaXRpYWxTdGFydCwgcnVubmluZ0xvY2F0aW9uKSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsV2ViV29ya2VyOiB7XG5cdFx0XHRcdGlmICh0aGlzLl93ZWJXb3JrZXJFeHRIb3N0RW5hYmxlbWVudCAhPT0gTG9jYWxXZWJXb3JrZXJFeHRIb3N0RW5hYmxlbWVudC5EaXNhYmxlZCkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0dXAgPSB0aGlzLl93ZWJXb3JrZXJFeHRIb3N0RW5hYmxlbWVudCA9PT0gTG9jYWxXZWJXb3JrZXJFeHRIb3N0RW5hYmxlbWVudC5MYXp5ID8gRXh0ZW5zaW9uSG9zdFN0YXJ0dXAuTGF6eUF1dG9TdGFydCA6IEV4dGVuc2lvbkhvc3RTdGFydHVwLkVhZ2VyTWFudWFsU3RhcnQ7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdlYldvcmtlckV4dGVuc2lvbkhvc3QsIHJ1bm5pbmdMb2NhdGlvbiwgc3RhcnR1cCwgdGhpcy5fY3JlYXRlV2ViV29ya2VyRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlcihydW5uaW5nTG9jYXRpb25zLCBydW5uaW5nTG9jYXRpb24pKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGNhc2UgRXh0ZW5zaW9uSG9zdEtpbmQuUmVtb3RlOiB7XG5cdFx0XHRcdGNvbnN0IHJlbW90ZUFnZW50Q29ubmVjdGlvbiA9IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk7XG5cdFx0XHRcdGlmIChyZW1vdGVBZ2VudENvbm5lY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlRXh0ZW5zaW9uSG9zdCwgcnVubmluZ0xvY2F0aW9uLCB0aGlzLl9jcmVhdGVSZW1vdGVFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyKHJ1bm5pbmdMb2NhdGlvbnMsIHJlbW90ZUFnZW50Q29ubmVjdGlvbi5yZW1vdGVBdXRob3JpdHkpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVMb2NhbFByb2Nlc3NFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyKHJ1bm5pbmdMb2NhdGlvbnM6IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvblRyYWNrZXIsIGlzSW5pdGlhbFN0YXJ0OiBib29sZWFuLCBkZXNpcmVkUnVubmluZ0xvY2F0aW9uOiBMb2NhbFByb2Nlc3NSdW5uaW5nTG9jYXRpb24pOiBJTG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGdldEluaXREYXRhOiBhc3luYyAoKTogUHJvbWlzZTxJTG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdEluaXREYXRhPiA9PiB7XG5cdFx0XHRcdGlmIChpc0luaXRpYWxTdGFydCkge1xuXHRcdFx0XHRcdC8vIEhlcmUgd2UgbG9hZCBldmVuIGV4dGVuc2lvbnMgdGhhdCB3b3VsZCBiZSBkaXNhYmxlZCBieSB3b3Jrc3BhY2UgdHJ1c3Rcblx0XHRcdFx0XHRjb25zdCBzY2FubmVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuX2V4dGVuc2lvblNjYW5uZXIuc2Nhbm5lZEV4dGVuc2lvbnM7XG5cdFx0XHRcdFx0aWYgKGlzQ0kpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgTmF0aXZlRXh0ZW5zaW9uSG9zdEZhY3RvcnkuX2NyZWF0ZUxvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIuc2Nhbm5lZEV4dGVuc2lvbnM6ICR7c2Nhbm5lZEV4dGVuc2lvbnMubWFwKGV4dCA9PiBleHQuaWRlbnRpZmllci52YWx1ZSkuam9pbignLCcpfWApO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IGNoZWNrRW5hYmxlZEFuZFByb3Bvc2VkQVBJKHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX2V4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCB0aGlzLl9leHRlbnNpb25zUHJvcG9zZWRBcGksIHNjYW5uZWRFeHRlbnNpb25zLCAvKiBpZ25vcmUgd29ya3NwYWNlIHRydXN0ICovdHJ1ZSk7XG5cdFx0XHRcdFx0aWYgKGlzQ0kpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgTmF0aXZlRXh0ZW5zaW9uSG9zdEZhY3RvcnkuX2NyZWF0ZUxvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIubG9jYWxFeHRlbnNpb25zOiAke2xvY2FsRXh0ZW5zaW9ucy5tYXAoZXh0ID0+IGV4dC5pZGVudGlmaWVyLnZhbHVlKS5qb2luKCcsJyl9YCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcnVubmluZ0xvY2F0aW9uID0gcnVubmluZ0xvY2F0aW9ucy5jb21wdXRlUnVubmluZ0xvY2F0aW9uKGxvY2FsRXh0ZW5zaW9ucywgW10sIGZhbHNlKTtcblx0XHRcdFx0XHRjb25zdCBteUV4dGVuc2lvbnMgPSBmaWx0ZXJFeHRlbnNpb25EZXNjcmlwdGlvbnMobG9jYWxFeHRlbnNpb25zLCBydW5uaW5nTG9jYXRpb24sIGV4dFJ1bm5pbmdMb2NhdGlvbiA9PiBkZXNpcmVkUnVubmluZ0xvY2F0aW9uLmVxdWFscyhleHRSdW5uaW5nTG9jYXRpb24pKTtcblx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25zID0gbmV3IEV4dGVuc2lvbkhvc3RFeHRlbnNpb25zKDAsIGxvY2FsRXh0ZW5zaW9ucywgbXlFeHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBOYXRpdmVFeHRlbnNpb25Ib3N0RmFjdG9yeS5fY3JlYXRlTG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlci5teUV4dGVuc2lvbnM6ICR7bXlFeHRlbnNpb25zLm1hcChleHQgPT4gZXh0LmlkZW50aWZpZXIudmFsdWUpLmpvaW4oJywnKX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHsgZXh0ZW5zaW9ucyB9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHJlc3RhcnQgY2FzZVxuXHRcdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGhpcy5fZ2V0RXh0ZW5zaW9uUmVnaXN0cnlTbmFwc2hvdFdoZW5SZWFkeSgpO1xuXHRcdFx0XHRcdGNvbnN0IG15RXh0ZW5zaW9ucyA9IHJ1bm5pbmdMb2NhdGlvbnMuZmlsdGVyQnlSdW5uaW5nTG9jYXRpb24oc25hcHNob3QuZXh0ZW5zaW9ucywgZGVzaXJlZFJ1bm5pbmdMb2NhdGlvbik7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IG5ldyBFeHRlbnNpb25Ib3N0RXh0ZW5zaW9ucyhzbmFwc2hvdC52ZXJzaW9uSWQsIHNuYXBzaG90LmV4dGVuc2lvbnMsIG15RXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZXh0ZW5zaW9ucyB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVdlYldvcmtlckV4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIocnVubmluZ0xvY2F0aW9uczogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlciwgZGVzaXJlZFJ1bm5pbmdMb2NhdGlvbjogTG9jYWxXZWJXb3JrZXJSdW5uaW5nTG9jYXRpb24pOiBJV2ViV29ya2VyRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGdldEluaXREYXRhOiBhc3luYyAoKTogUHJvbWlzZTxJV2ViV29ya2VyRXh0ZW5zaW9uSG9zdEluaXREYXRhPiA9PiB7XG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGhpcy5fZ2V0RXh0ZW5zaW9uUmVnaXN0cnlTbmFwc2hvdFdoZW5SZWFkeSgpO1xuXHRcdFx0XHRjb25zdCBteUV4dGVuc2lvbnMgPSBydW5uaW5nTG9jYXRpb25zLmZpbHRlckJ5UnVubmluZ0xvY2F0aW9uKHNuYXBzaG90LmV4dGVuc2lvbnMsIGRlc2lyZWRSdW5uaW5nTG9jYXRpb24pO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zID0gbmV3IEV4dGVuc2lvbkhvc3RFeHRlbnNpb25zKHNuYXBzaG90LnZlcnNpb25JZCwgc25hcHNob3QuZXh0ZW5zaW9ucywgbXlFeHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0cmV0dXJuIHsgZXh0ZW5zaW9ucyB9O1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVSZW1vdGVFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyKHJ1bm5pbmdMb2NhdGlvbnM6IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvblRyYWNrZXIsIHJlbW90ZUF1dGhvcml0eTogc3RyaW5nKTogSVJlbW90ZUV4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSxcblx0XHRcdGdldEluaXREYXRhOiBhc3luYyAoKTogUHJvbWlzZTxJUmVtb3RlRXh0ZW5zaW9uSG9zdEluaXREYXRhPiA9PiB7XG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGhpcy5fZ2V0RXh0ZW5zaW9uUmVnaXN0cnlTbmFwc2hvdFdoZW5SZWFkeSgpO1xuXG5cdFx0XHRcdGNvbnN0IHJlbW90ZUVudiA9IGF3YWl0IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdFx0XHRpZiAoIXJlbW90ZUVudikge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHByb3ZpZGUgaW5pdCBkYXRhIGZvciByZW1vdGUgZXh0ZW5zaW9uIGhvc3QhJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBteUV4dGVuc2lvbnMgPSBydW5uaW5nTG9jYXRpb25zLmZpbHRlckJ5RXh0ZW5zaW9uSG9zdEtpbmQoc25hcHNob3QuZXh0ZW5zaW9ucywgRXh0ZW5zaW9uSG9zdEtpbmQuUmVtb3RlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IG5ldyBFeHRlbnNpb25Ib3N0RXh0ZW5zaW9ucyhzbmFwc2hvdC52ZXJzaW9uSWQsIHNuYXBzaG90LmV4dGVuc2lvbnMsIG15RXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjb25uZWN0aW9uRGF0YTogdGhpcy5fcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLmdldENvbm5lY3Rpb25EYXRhKHJlbW90ZUF1dGhvcml0eSksXG5cdFx0XHRcdFx0cGlkOiByZW1vdGVFbnYucGlkLFxuXHRcdFx0XHRcdGFwcFJvb3Q6IHJlbW90ZUVudi5hcHBSb290LFxuXHRcdFx0XHRcdGV4dGVuc2lvbkhvc3RMb2dzUGF0aDogcmVtb3RlRW52LmV4dGVuc2lvbkhvc3RMb2dzUGF0aCxcblx0XHRcdFx0XHRnbG9iYWxTdG9yYWdlSG9tZTogcmVtb3RlRW52Lmdsb2JhbFN0b3JhZ2VIb21lLFxuXHRcdFx0XHRcdHdvcmtzcGFjZVN0b3JhZ2VIb21lOiByZW1vdGVFbnYud29ya3NwYWNlU3RvcmFnZUhvbWUsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9ucyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGRldGVybWluZUxvY2FsV2ViV29ya2VyRXh0SG9zdEVuYWJsZW1lbnQoZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogTG9jYWxXZWJXb3JrZXJFeHRIb3N0RW5hYmxlbWVudCB7XG5cdGlmIChlbnZpcm9ubWVudFNlcnZpY2UuaXNFeHRlbnNpb25EZXZlbG9wbWVudCAmJiBlbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRLaW5kPy5zb21lKGsgPT4gayA9PT0gJ3dlYicpKSB7XG5cdFx0cmV0dXJuIExvY2FsV2ViV29ya2VyRXh0SG9zdEVuYWJsZW1lbnQuRWFnZXI7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgY29uZmlnID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8V2ViV29ya2VyRXh0SG9zdENvbmZpZ1ZhbHVlPih3ZWJXb3JrZXJFeHRIb3N0Q29uZmlnKTtcblx0XHRpZiAoY29uZmlnID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gTG9jYWxXZWJXb3JrZXJFeHRIb3N0RW5hYmxlbWVudC5FYWdlcjtcblx0XHR9IGVsc2UgaWYgKGNvbmZpZyA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRyZXR1cm4gTG9jYWxXZWJXb3JrZXJFeHRIb3N0RW5hYmxlbWVudC5MYXp5O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gTG9jYWxXZWJXb3JrZXJFeHRIb3N0RW5hYmxlbWVudC5EaXNhYmxlZDtcblx0XHR9XG5cdH1cbn1cblxuY29uc3QgZW51bSBMb2NhbFdlYldvcmtlckV4dEhvc3RFbmFibGVtZW50IHtcblx0RGlzYWJsZWQgPSAwLFxuXHRFYWdlciA9IDEsXG5cdExhenkgPSAyXG59XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVFeHRlbnNpb25Ib3N0S2luZFBpY2tlciBpbXBsZW1lbnRzIElFeHRlbnNpb25Ib3N0S2luZFBpY2tlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaGFzUmVtb3RlRXh0SG9zdDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzV2ViV29ya2VyRXh0SG9zdDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5faGFzUmVtb3RlRXh0SG9zdCA9IEJvb2xlYW4oZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSk7XG5cdFx0Y29uc3Qgd2ViV29ya2VyRXh0SG9zdEVuYWJsZW1lbnQgPSBkZXRlcm1pbmVMb2NhbFdlYldvcmtlckV4dEhvc3RFbmFibGVtZW50KGVudmlyb25tZW50U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc1dlYldvcmtlckV4dEhvc3QgPSAod2ViV29ya2VyRXh0SG9zdEVuYWJsZW1lbnQgIT09IExvY2FsV2ViV29ya2VyRXh0SG9zdEVuYWJsZW1lbnQuRGlzYWJsZWQpO1xuXHR9XG5cblx0cHVibGljIHBpY2tFeHRlbnNpb25Ib3N0S2luZChleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgZXh0ZW5zaW9uS2luZHM6IEV4dGVuc2lvbktpbmRbXSwgaXNJbnN0YWxsZWRMb2NhbGx5OiBib29sZWFuLCBpc0luc3RhbGxlZFJlbW90ZWx5OiBib29sZWFuLCBwcmVmZXJlbmNlOiBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZSk6IEV4dGVuc2lvbkhvc3RLaW5kIHwgbnVsbCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gTmF0aXZlRXh0ZW5zaW9uSG9zdEtpbmRQaWNrZXIucGlja0V4dGVuc2lvbkhvc3RLaW5kKGV4dGVuc2lvbktpbmRzLCBpc0luc3RhbGxlZExvY2FsbHksIGlzSW5zdGFsbGVkUmVtb3RlbHksIHByZWZlcmVuY2UsIHRoaXMuX2hhc1JlbW90ZUV4dEhvc3QsIHRoaXMuX2hhc1dlYldvcmtlckV4dEhvc3QpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYHBpY2tSdW5uaW5nTG9jYXRpb24gZm9yICR7ZXh0ZW5zaW9uSWQudmFsdWV9LCBleHRlbnNpb24ga2luZHM6IFske2V4dGVuc2lvbktpbmRzLmpvaW4oJywgJyl9XSwgaXNJbnN0YWxsZWRMb2NhbGx5OiAke2lzSW5zdGFsbGVkTG9jYWxseX0sIGlzSW5zdGFsbGVkUmVtb3RlbHk6ICR7aXNJbnN0YWxsZWRSZW1vdGVseX0sIHByZWZlcmVuY2U6ICR7ZXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2VUb1N0cmluZyhwcmVmZXJlbmNlKX0gPT4gJHtleHRlbnNpb25Ib3N0S2luZFRvU3RyaW5nKHJlc3VsdCl9YCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgcGlja0V4dGVuc2lvbkhvc3RLaW5kKGV4dGVuc2lvbktpbmRzOiBFeHRlbnNpb25LaW5kW10sIGlzSW5zdGFsbGVkTG9jYWxseTogYm9vbGVhbiwgaXNJbnN0YWxsZWRSZW1vdGVseTogYm9vbGVhbiwgcHJlZmVyZW5jZTogRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UsIGhhc1JlbW90ZUV4dEhvc3Q6IGJvb2xlYW4sIGhhc1dlYldvcmtlckV4dEhvc3Q6IGJvb2xlYW4pOiBFeHRlbnNpb25Ib3N0S2luZCB8IG51bGwge1xuXHRcdGNvbnN0IHJlc3VsdDogRXh0ZW5zaW9uSG9zdEtpbmRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uS2luZCBvZiBleHRlbnNpb25LaW5kcykge1xuXHRcdFx0aWYgKGV4dGVuc2lvbktpbmQgPT09ICd1aScgJiYgaXNJbnN0YWxsZWRMb2NhbGx5KSB7XG5cdFx0XHRcdC8vIHVpIGV4dGVuc2lvbnMgcnVuIGxvY2FsbHkgaWYgcG9zc2libGVcblx0XHRcdFx0aWYgKHByZWZlcmVuY2UgPT09IEV4dGVuc2lvblJ1bm5pbmdQcmVmZXJlbmNlLk5vbmUgfHwgcHJlZmVyZW5jZSA9PT0gRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UuTG9jYWwpIHtcblx0XHRcdFx0XHRyZXR1cm4gRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsUHJvY2Vzcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChleHRlbnNpb25LaW5kID09PSAnd29ya3NwYWNlJyAmJiBpc0luc3RhbGxlZFJlbW90ZWx5KSB7XG5cdFx0XHRcdC8vIHdvcmtzcGFjZSBleHRlbnNpb25zIHJ1biByZW1vdGVseSBpZiBwb3NzaWJsZVxuXHRcdFx0XHRpZiAocHJlZmVyZW5jZSA9PT0gRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UuTm9uZSB8fCBwcmVmZXJlbmNlID09PSBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZS5SZW1vdGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gRXh0ZW5zaW9uSG9zdEtpbmQuUmVtb3RlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKEV4dGVuc2lvbkhvc3RLaW5kLlJlbW90ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChleHRlbnNpb25LaW5kID09PSAnd29ya3NwYWNlJyAmJiAhaGFzUmVtb3RlRXh0SG9zdCkge1xuXHRcdFx0XHQvLyB3b3Jrc3BhY2UgZXh0ZW5zaW9ucyBhbHNvIHJ1biBsb2NhbGx5IGlmIHRoZXJlIGlzIG5vIHJlbW90ZVxuXHRcdFx0XHRpZiAocHJlZmVyZW5jZSA9PT0gRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UuTm9uZSB8fCBwcmVmZXJlbmNlID09PSBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZS5Mb2NhbCkge1xuXHRcdFx0XHRcdHJldHVybiBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3M7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbktpbmQgPT09ICd3ZWInICYmIGlzSW5zdGFsbGVkTG9jYWxseSAmJiBoYXNXZWJXb3JrZXJFeHRIb3N0KSB7XG5cdFx0XHRcdC8vIHdlYiB3b3JrZXIgZXh0ZW5zaW9ucyBydW4gaW4gdGhlIGxvY2FsIHdlYiB3b3JrZXIgaWYgcG9zc2libGVcblx0XHRcdFx0aWYgKHByZWZlcmVuY2UgPT09IEV4dGVuc2lvblJ1bm5pbmdQcmVmZXJlbmNlLk5vbmUgfHwgcHJlZmVyZW5jZSA9PT0gRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UuTG9jYWwpIHtcblx0XHRcdFx0XHRyZXR1cm4gRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxXZWJXb3JrZXI7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxXZWJXb3JrZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiAocmVzdWx0Lmxlbmd0aCA+IDAgPyByZXN1bHRbMF0gOiBudWxsKTtcblx0fVxufVxuXG5jbGFzcyBSZXN0YXJ0RXh0ZW5zaW9uSG9zdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5yZXN0YXJ0RXh0ZW5zaW9uSG9zdCcsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMigncmVzdGFydEV4dGVuc2lvbkhvc3QnLCBcIlJlc3RhcnQgRXh0ZW5zaW9uIEhvc3RcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBzdG9wcGVkID0gYXdhaXQgZXh0ZW5zaW9uU2VydmljZS5zdG9wRXh0ZW5zaW9uSG9zdHMobmxzLmxvY2FsaXplKCdyZXN0YXJ0RXh0ZW5zaW9uSG9zdC5yZWFzb24nLCBcIkFuIGV4cGxpY2l0IHJlcXVlc3RcIikpO1xuXHRcdGlmIChzdG9wcGVkKSB7XG5cdFx0XHRleHRlbnNpb25TZXJ2aWNlLnN0YXJ0RXh0ZW5zaW9uSG9zdHMoKTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFJlc3RhcnRFeHRlbnNpb25Ib3N0QWN0aW9uKTtcblxucmVnaXN0ZXJTaW5nbGV0b24oSUV4dGVuc2lvblNlcnZpY2UsIE5hdGl2ZUV4dGVuc2lvblNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFlBQVksaUJBQWlCO0FBQzdCLFNBQVMs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
