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
import { mainWindow } from "../../../../base/browser/window.js";
import { Schemas } from "../../../../base/common/network.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { getLogs } from "../../../../platform/log/browser/log.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { PersistentConnectionEventType } from "../../../../platform/remote/common/remoteAgentConnection.js";
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { IRemoteExtensionsScannerService } from "../../../../platform/remote/common/remoteExtensionsScanner.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { IWebExtensionsScannerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from "../../extensionManagement/common/extensionManagement.js";
import { WebWorkerExtensionHost } from "./webWorkerExtensionHost.js";
import { FetchFileSystemProvider } from "./webWorkerFileSystemProvider.js";
import { AbstractExtensionService, LocalExtensions, RemoteExtensions, ResolverExtensions, checkEnabledAndProposedAPI, isResolverExtension } from "../common/abstractExtensionService.js";
import { ExtensionHostKind, ExtensionRunningPreference, extensionHostKindToString, extensionRunningPreferenceToString } from "../common/extensionHostKind.js";
import { IExtensionManifestPropertiesService } from "../common/extensionManifestPropertiesService.js";
import { filterExtensionDescriptions } from "../common/extensionRunningLocationTracker.js";
import { ExtensionHostExtensions, ExtensionHostStartup, IExtensionService, toExtensionDescription } from "../common/extensions.js";
import { ExtensionsProposedApi } from "../common/extensionsProposedApi.js";
import { dedupExtensions } from "../common/extensionsUtil.js";
import { RemoteExtensionHost } from "../common/remoteExtensionHost.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
import { IRemoteExplorerService } from "../../remote/common/remoteExplorerService.js";
import { IUserDataInitializationService } from "../../userData/browser/userDataInit.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { AsyncIterableProducer } from "../../../../base/common/async.js";
let ExtensionService = class extends AbstractExtensionService {
  constructor(instantiationService, notificationService, _browserEnvironmentService, telemetryService, extensionEnablementService, fileService, productService, extensionManagementService, contextService, configurationService, extensionManifestPropertiesService, _webExtensionsScannerService, logService, remoteAgentService, remoteExtensionsScannerService, lifecycleService, remoteAuthorityResolverService, _userDataInitializationService, _userDataProfileService, _workspaceTrustManagementService, _remoteExplorerService, dialogService) {
    const extensionsProposedApi = instantiationService.createInstance(ExtensionsProposedApi);
    const extensionHostFactory = new BrowserExtensionHostFactory(
      extensionsProposedApi,
      () => this._scanWebExtensions(),
      () => this._getExtensionRegistrySnapshotWhenReady(),
      instantiationService,
      remoteAgentService,
      remoteAuthorityResolverService,
      extensionEnablementService,
      logService
    );
    super(
      { hasLocalProcess: false, allowRemoteExtensionsInLocalWebWorker: true },
      extensionsProposedApi,
      extensionHostFactory,
      new BrowserExtensionHostKindPicker(logService),
      instantiationService,
      notificationService,
      _browserEnvironmentService,
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
    this._browserEnvironmentService = _browserEnvironmentService;
    this._webExtensionsScannerService = _webExtensionsScannerService;
    this._userDataInitializationService = _userDataInitializationService;
    this._userDataProfileService = _userDataProfileService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._remoteExplorerService = _remoteExplorerService;
    lifecycleService.when(LifecyclePhase.Ready).then(async () => {
      await this._initializeIfNeeded();
    });
    this._initFetchFileSystem();
  }
  _initFetchFileSystem() {
    const provider = new FetchFileSystemProvider();
    this._register(this._fileService.registerProvider(Schemas.http, provider));
    this._register(this._fileService.registerProvider(Schemas.https, provider));
  }
  async _initialize() {
    await this._userDataInitializationService.initializeInstalledExtensions(this._instantiationService);
    await super._initialize();
  }
  async _scanWebExtensions() {
    if (!this._scanWebExtensionsPromise) {
      this._scanWebExtensionsPromise = (async () => {
        const system = [], user = [], development = [];
        try {
          await Promise.all([
            this._webExtensionsScannerService.scanSystemExtensions().then((extensions) => system.push(...extensions.map((e) => toExtensionDescription(e)))),
            this._webExtensionsScannerService.scanUserExtensions(this._userDataProfileService.currentProfile.extensionsResource, { skipInvalidExtensions: true }).then((extensions) => user.push(...extensions.map((e) => toExtensionDescription(e)))),
            this._webExtensionsScannerService.scanExtensionsUnderDevelopment().then((extensions) => development.push(...extensions.map((e) => toExtensionDescription(e, true))))
          ]);
        } catch (error) {
          this._logService.error(error);
        }
        return dedupExtensions(system, user, [], development, this._logService);
      })();
    }
    return this._scanWebExtensionsPromise;
  }
  async _resolveExtensionsDefault(emitter) {
    const [localExtensions, remoteExtensions] = await Promise.all([
      this._scanWebExtensions(),
      this._remoteExtensionsScannerService.scanExtensions()
    ]);
    if (remoteExtensions.length) {
      emitter.emitOne(new RemoteExtensions(remoteExtensions));
    }
    emitter.emitOne(new LocalExtensions(localExtensions));
  }
  _resolveExtensions() {
    return new AsyncIterableProducer((emitter) => this._doResolveExtensions(emitter));
  }
  async _doResolveExtensions(emitter) {
    if (!this._browserEnvironmentService.expectsResolverExtension) {
      return this._resolveExtensionsDefault(emitter);
    }
    const remoteAuthority = this._environmentService.remoteAuthority;
    await this._workspaceTrustManagementService.workspaceResolved;
    const localExtensions = await this._scanWebExtensions();
    const resolverExtensions = localExtensions.filter((extension) => isResolverExtension(extension));
    if (resolverExtensions.length) {
      emitter.emitOne(new ResolverExtensions(resolverExtensions));
    }
    let resolverResult;
    try {
      resolverResult = await this._resolveAuthorityInitial(remoteAuthority);
    } catch (err) {
      if (RemoteAuthorityResolverError.isHandled(err)) {
        console.log(`Error handled: Not showing a notification for the error`);
      }
      this._remoteAuthorityResolverService._setResolvedAuthorityError(remoteAuthority, err);
      return this._resolveExtensionsDefault(emitter);
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
    return this._resolveExtensionsDefault(emitter);
  }
  async _onExtensionHostExit(code) {
    await this._doStopExtensionHosts();
    const automatedWindow = mainWindow;
    if (typeof automatedWindow.codeAutomationExit === "function") {
      automatedWindow.codeAutomationExit(code, await getLogs(this._fileService, this._environmentService));
    }
  }
  async _resolveAuthority(remoteAuthority) {
    return this._resolveAuthorityOnExtensionHosts(ExtensionHostKind.LocalWebWorker, remoteAuthority);
  }
};
ExtensionService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IBrowserWorkbenchEnvironmentService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IWorkbenchExtensionEnablementService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IWorkbenchExtensionManagementService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IExtensionManifestPropertiesService),
  __decorateParam(11, IWebExtensionsScannerService),
  __decorateParam(12, ILogService),
  __decorateParam(13, IRemoteAgentService),
  __decorateParam(14, IRemoteExtensionsScannerService),
  __decorateParam(15, ILifecycleService),
  __decorateParam(16, IRemoteAuthorityResolverService),
  __decorateParam(17, IUserDataInitializationService),
  __decorateParam(18, IUserDataProfileService),
  __decorateParam(19, IWorkspaceTrustManagementService),
  __decorateParam(20, IRemoteExplorerService),
  __decorateParam(21, IDialogService)
], ExtensionService);
let BrowserExtensionHostFactory = class {
  constructor(_extensionsProposedApi, _scanWebExtensions, _getExtensionRegistrySnapshotWhenReady, _instantiationService, _remoteAgentService, _remoteAuthorityResolverService, _extensionEnablementService, _logService) {
    this._extensionsProposedApi = _extensionsProposedApi;
    this._scanWebExtensions = _scanWebExtensions;
    this._getExtensionRegistrySnapshotWhenReady = _getExtensionRegistrySnapshotWhenReady;
    this._instantiationService = _instantiationService;
    this._remoteAgentService = _remoteAgentService;
    this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
    this._extensionEnablementService = _extensionEnablementService;
    this._logService = _logService;
  }
  createExtensionHost(runningLocations, runningLocation, isInitialStart) {
    switch (runningLocation.kind) {
      case ExtensionHostKind.LocalProcess: {
        return null;
      }
      case ExtensionHostKind.LocalWebWorker: {
        const startup = isInitialStart ? ExtensionHostStartup.EagerManualStart : ExtensionHostStartup.EagerAutoStart;
        return this._instantiationService.createInstance(WebWorkerExtensionHost, runningLocation, startup, this._createLocalExtensionHostDataProvider(runningLocations, runningLocation, isInitialStart));
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
  _createLocalExtensionHostDataProvider(runningLocations, desiredRunningLocation, isInitialStart) {
    return {
      getInitData: async () => {
        if (isInitialStart) {
          const localExtensions = checkEnabledAndProposedAPI(
            this._logService,
            this._extensionEnablementService,
            this._extensionsProposedApi,
            await this._scanWebExtensions(),
            /* ignore workspace trust */
            true
          );
          const runningLocation = runningLocations.computeRunningLocation(localExtensions, [], false);
          const myExtensions = filterExtensionDescriptions(localExtensions, runningLocation, (extRunningLocation) => desiredRunningLocation.equals(extRunningLocation));
          const extensions = new ExtensionHostExtensions(0, localExtensions, myExtensions.map((extension) => extension.identifier));
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
BrowserExtensionHostFactory = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IRemoteAgentService),
  __decorateParam(5, IRemoteAuthorityResolverService),
  __decorateParam(6, IWorkbenchExtensionEnablementService),
  __decorateParam(7, ILogService)
], BrowserExtensionHostFactory);
let BrowserExtensionHostKindPicker = class {
  constructor(_logService) {
    this._logService = _logService;
  }
  pickExtensionHostKind(extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference) {
    const result = BrowserExtensionHostKindPicker.pickRunningLocation(extensionKinds, isInstalledLocally, isInstalledRemotely, preference);
    this._logService.trace(`pickRunningLocation for ${extensionId.value}, extension kinds: [${extensionKinds.join(", ")}], isInstalledLocally: ${isInstalledLocally}, isInstalledRemotely: ${isInstalledRemotely}, preference: ${extensionRunningPreferenceToString(preference)} => ${extensionHostKindToString(result)}`);
    return result;
  }
  static pickRunningLocation(extensionKinds, isInstalledLocally, isInstalledRemotely, preference) {
    const result = [];
    let canRunRemotely = false;
    for (const extensionKind of extensionKinds) {
      if (extensionKind === "ui" && isInstalledRemotely) {
        if (preference === ExtensionRunningPreference.Remote) {
          return ExtensionHostKind.Remote;
        } else {
          canRunRemotely = true;
        }
      }
      if (extensionKind === "workspace" && isInstalledRemotely) {
        if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Remote) {
          return ExtensionHostKind.Remote;
        } else {
          result.push(ExtensionHostKind.Remote);
        }
      }
      if (extensionKind === "web" && (isInstalledLocally || isInstalledRemotely)) {
        if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Local) {
          return ExtensionHostKind.LocalWebWorker;
        } else {
          result.push(ExtensionHostKind.LocalWebWorker);
        }
      }
    }
    if (canRunRemotely) {
      result.push(ExtensionHostKind.Remote);
    }
    return result.length > 0 ? result[0] : null;
  }
};
BrowserExtensionHostKindPicker = __decorateClass([
  __decorateParam(0, ILogService)
], BrowserExtensionHostKindPicker);
registerSingleton(IExtensionService, ExtensionService, InstantiationType.Eager);
export {
  BrowserExtensionHostKindPicker,
  ExtensionService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElBdXRvbWF0ZWRXaW5kb3csIGdldExvZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvYnJvd3Nlci9sb2cuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgSVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSwgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvciwgUmVzb2x2ZXJSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyLmpzJztcbmltcG9ydCB7IElSZW1vdGVFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUV4dGVuc2lvbnNTY2FubmVyLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZSwgSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElXZWJXb3JrZXJFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyLCBJV2ViV29ya2VyRXh0ZW5zaW9uSG9zdEluaXREYXRhLCBXZWJXb3JrZXJFeHRlbnNpb25Ib3N0IH0gZnJvbSAnLi93ZWJXb3JrZXJFeHRlbnNpb25Ib3N0LmpzJztcbmltcG9ydCB7IEZldGNoRmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi93ZWJXb3JrZXJGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RFeHRlbnNpb25TZXJ2aWNlLCBJRXh0ZW5zaW9uSG9zdEZhY3RvcnksIExvY2FsRXh0ZW5zaW9ucywgUmVtb3RlRXh0ZW5zaW9ucywgUmVzb2x2ZWRFeHRlbnNpb25zLCBSZXNvbHZlckV4dGVuc2lvbnMsIGNoZWNrRW5hYmxlZEFuZFByb3Bvc2VkQVBJLCBpc1Jlc29sdmVyRXh0ZW5zaW9uIH0gZnJvbSAnLi4vY29tbW9uL2Fic3RyYWN0RXh0ZW5zaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5U25hcHNob3QgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25Ib3N0S2luZCwgRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UsIElFeHRlbnNpb25Ib3N0S2luZFBpY2tlciwgZXh0ZW5zaW9uSG9zdEtpbmRUb1N0cmluZywgZXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2VUb1N0cmluZyB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25Ib3N0S2luZC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25SdW5uaW5nTG9jYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlciwgZmlsdGVyRXh0ZW5zaW9uRGVzY3JpcHRpb25zIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvblJ1bm5pbmdMb2NhdGlvblRyYWNrZXIuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdEV4dGVuc2lvbnMsIEV4dGVuc2lvbkhvc3RTdGFydHVwLCBJRXh0ZW5zaW9uSG9zdCwgSUV4dGVuc2lvblNlcnZpY2UsIHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUHJvcG9zZWRBcGkgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLmpzJztcbmltcG9ydCB7IGRlZHVwRXh0ZW5zaW9ucyB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zVXRpbC5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlciwgSVJlbW90ZUV4dGVuc2lvbkhvc3RJbml0RGF0YSwgUmVtb3RlRXh0ZW5zaW9uSG9zdCB9IGZyb20gJy4uL2NvbW1vbi9yZW1vdGVFeHRlbnNpb25Ib3N0LmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcmVtb3RlL2NvbW1vbi9yZW1vdGVFeHBsb3JlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGEvYnJvd3Nlci91c2VyRGF0YUluaXQuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBBc3luY0l0ZXJhYmxlRW1pdHRlciwgQXN5bmNJdGVyYWJsZVByb2R1Y2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uU2VydmljZSBleHRlbmRzIEFic3RyYWN0RXh0ZW5zaW9uU2VydmljZSBpbXBsZW1lbnRzIElFeHRlbnNpb25TZXJ2aWNlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9icm93c2VyRW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2U6IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHRcdEBJV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZTogSVdlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZTogSVJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UgcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlOiBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFJbml0aWFsaXphdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXNlckRhdGFJbml0aWFsaXphdGlvblNlcnZpY2U6IElVc2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNQcm9wb3NlZEFwaSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNQcm9wb3NlZEFwaSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSG9zdEZhY3RvcnkgPSBuZXcgQnJvd3NlckV4dGVuc2lvbkhvc3RGYWN0b3J5KFxuXHRcdFx0ZXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLFxuXHRcdFx0KCkgPT4gdGhpcy5fc2NhbldlYkV4dGVuc2lvbnMoKSxcblx0XHRcdCgpID0+IHRoaXMuX2dldEV4dGVuc2lvblJlZ2lzdHJ5U25hcHNob3RXaGVuUmVhZHkoKSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0cmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdFx0ZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0XHRsb2dTZXJ2aWNlXG5cdFx0KTtcblx0XHRzdXBlcihcblx0XHRcdHsgaGFzTG9jYWxQcm9jZXNzOiBmYWxzZSwgYWxsb3dSZW1vdGVFeHRlbnNpb25zSW5Mb2NhbFdlYldvcmtlcjogdHJ1ZSB9LFxuXHRcdFx0ZXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLFxuXHRcdFx0ZXh0ZW5zaW9uSG9zdEZhY3RvcnksXG5cdFx0XHRuZXcgQnJvd3NlckV4dGVuc2lvbkhvc3RLaW5kUGlja2VyKGxvZ1NlcnZpY2UpLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdFx0X2Jyb3dzZXJFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0ZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0ZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0XHRjb250ZXh0U2VydmljZSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0ZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSxcblx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0XHRyZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0XHRyZW1vdGVFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsXG5cdFx0XHRsaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdFx0ZGlhbG9nU2VydmljZVxuXHRcdCk7XG5cblx0XHQvLyBJbml0aWFsaXplIGluc3RhbGxlZCBleHRlbnNpb25zIGZpcnN0IGFuZCBkbyBpdCBvbmx5IGFmdGVyIHdvcmtiZW5jaCBpcyByZWFkeVxuXHRcdGxpZmVjeWNsZVNlcnZpY2Uud2hlbihMaWZlY3ljbGVQaGFzZS5SZWFkeSkudGhlbihhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLl9pbml0aWFsaXplSWZOZWVkZWQoKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2luaXRGZXRjaEZpbGVTeXN0ZW0oKTtcblx0fVxuXG5cdHByaXZhdGUgX2luaXRGZXRjaEZpbGVTeXN0ZW0oKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgRmV0Y2hGaWxlU3lzdGVtUHJvdmlkZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuaHR0cCwgcHJvdmlkZXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuaHR0cHMsIHByb3ZpZGVyKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgX2luaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fdXNlckRhdGFJbml0aWFsaXphdGlvblNlcnZpY2UuaW5pdGlhbGl6ZUluc3RhbGxlZEV4dGVuc2lvbnModGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGF3YWl0IHN1cGVyLl9pbml0aWFsaXplKCk7XG5cdH1cblxuXHRwcml2YXRlIF9zY2FuV2ViRXh0ZW5zaW9uc1Byb21pc2U6IFByb21pc2U8SUV4dGVuc2lvbkRlc2NyaXB0aW9uW10+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFzeW5jIF9zY2FuV2ViRXh0ZW5zaW9ucygpOiBQcm9taXNlPElFeHRlbnNpb25EZXNjcmlwdGlvbltdPiB7XG5cdFx0aWYgKCF0aGlzLl9zY2FuV2ViRXh0ZW5zaW9uc1Byb21pc2UpIHtcblx0XHRcdHRoaXMuX3NjYW5XZWJFeHRlbnNpb25zUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN5c3RlbTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10gPSBbXSwgdXNlcjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10gPSBbXSwgZGV2ZWxvcG1lbnQ6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdID0gW107XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdFx0dGhpcy5fd2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5TeXN0ZW1FeHRlbnNpb25zKCkudGhlbihleHRlbnNpb25zID0+IHN5c3RlbS5wdXNoKC4uLmV4dGVuc2lvbnMubWFwKGUgPT4gdG9FeHRlbnNpb25EZXNjcmlwdGlvbihlKSkpKSxcblx0XHRcdFx0XHRcdHRoaXMuX3dlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuVXNlckV4dGVuc2lvbnModGhpcy5fdXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsIHsgc2tpcEludmFsaWRFeHRlbnNpb25zOiB0cnVlIH0pLnRoZW4oZXh0ZW5zaW9ucyA9PiB1c2VyLnB1c2goLi4uZXh0ZW5zaW9ucy5tYXAoZSA9PiB0b0V4dGVuc2lvbkRlc2NyaXB0aW9uKGUpKSkpLFxuXHRcdFx0XHRcdFx0dGhpcy5fd2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5FeHRlbnNpb25zVW5kZXJEZXZlbG9wbWVudCgpLnRoZW4oZXh0ZW5zaW9ucyA9PiBkZXZlbG9wbWVudC5wdXNoKC4uLmV4dGVuc2lvbnMubWFwKGUgPT4gdG9FeHRlbnNpb25EZXNjcmlwdGlvbihlLCB0cnVlKSkpKVxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBkZWR1cEV4dGVuc2lvbnMoc3lzdGVtLCB1c2VyLCBbXSwgZGV2ZWxvcG1lbnQsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NjYW5XZWJFeHRlbnNpb25zUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVFeHRlbnNpb25zRGVmYXVsdChlbWl0dGVyOiBBc3luY0l0ZXJhYmxlRW1pdHRlcjxSZXNvbHZlZEV4dGVuc2lvbnM+KSB7XG5cdFx0Y29uc3QgW2xvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9uc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLl9zY2FuV2ViRXh0ZW5zaW9ucygpLFxuXHRcdFx0dGhpcy5fcmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5FeHRlbnNpb25zKClcblx0XHRdKTtcblxuXHRcdGlmIChyZW1vdGVFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0ZW1pdHRlci5lbWl0T25lKG5ldyBSZW1vdGVFeHRlbnNpb25zKHJlbW90ZUV4dGVuc2lvbnMpKTtcblx0XHR9XG5cdFx0ZW1pdHRlci5lbWl0T25lKG5ldyBMb2NhbEV4dGVuc2lvbnMobG9jYWxFeHRlbnNpb25zKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3Jlc29sdmVFeHRlbnNpb25zKCk6IEFzeW5jSXRlcmFibGU8UmVzb2x2ZWRFeHRlbnNpb25zPiB7XG5cdFx0cmV0dXJuIG5ldyBBc3luY0l0ZXJhYmxlUHJvZHVjZXIoZW1pdHRlciA9PiB0aGlzLl9kb1Jlc29sdmVFeHRlbnNpb25zKGVtaXR0ZXIpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvUmVzb2x2ZUV4dGVuc2lvbnMoZW1pdHRlcjogQXN5bmNJdGVyYWJsZUVtaXR0ZXI8UmVzb2x2ZWRFeHRlbnNpb25zPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fYnJvd3NlckVudmlyb25tZW50U2VydmljZS5leHBlY3RzUmVzb2x2ZXJFeHRlbnNpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZXNvbHZlRXh0ZW5zaW9uc0RlZmF1bHQoZW1pdHRlcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSE7XG5cblx0XHQvLyBOb3cgdGhhdCB0aGUgY2Fub25pY2FsIFVSSSBwcm92aWRlciBoYXMgYmVlbiByZWdpc3RlcmVkLCB3ZSBuZWVkIHRvIHdhaXQgZm9yIHRoZSB0cnVzdCBzdGF0ZSB0byBiZVxuXHRcdC8vIGNhbGN1bGF0ZWQuIFRoZSB0cnVzdCBzdGF0ZSB3aWxsIGJlIHVzZWQgd2hpbGUgcmVzb2x2aW5nIHRoZSBhdXRob3JpdHksIGhvd2V2ZXIgdGhlIHJlc29sdmVyIGNhblxuXHRcdC8vIG92ZXJyaWRlIHRoZSB0cnVzdCBzdGF0ZSB0aHJvdWdoIHRoZSByZXNvbHZlciByZXN1bHQuXG5cdFx0YXdhaXQgdGhpcy5fd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS53b3Jrc3BhY2VSZXNvbHZlZDtcblxuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuX3NjYW5XZWJFeHRlbnNpb25zKCk7XG5cdFx0Y29uc3QgcmVzb2x2ZXJFeHRlbnNpb25zID0gbG9jYWxFeHRlbnNpb25zLmZpbHRlcihleHRlbnNpb24gPT4gaXNSZXNvbHZlckV4dGVuc2lvbihleHRlbnNpb24pKTtcblx0XHRpZiAocmVzb2x2ZXJFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0ZW1pdHRlci5lbWl0T25lKG5ldyBSZXNvbHZlckV4dGVuc2lvbnMocmVzb2x2ZXJFeHRlbnNpb25zKSk7XG5cdFx0fVxuXG5cdFx0bGV0IHJlc29sdmVyUmVzdWx0OiBSZXNvbHZlclJlc3VsdDtcblx0XHR0cnkge1xuXHRcdFx0cmVzb2x2ZXJSZXN1bHQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQXV0aG9yaXR5SW5pdGlhbChyZW1vdGVBdXRob3JpdHkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IuaXNIYW5kbGVkKGVycikpIHtcblx0XHRcdFx0Y29uc29sZS5sb2coYEVycm9yIGhhbmRsZWQ6IE5vdCBzaG93aW5nIGEgbm90aWZpY2F0aW9uIGZvciB0aGUgZXJyb3JgKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5fc2V0UmVzb2x2ZWRBdXRob3JpdHlFcnJvcihyZW1vdGVBdXRob3JpdHksIGVycik7XG5cblx0XHRcdC8vIFByb2NlZWQgd2l0aCB0aGUgbG9jYWwgZXh0ZW5zaW9uIGhvc3Rcblx0XHRcdHJldHVybiB0aGlzLl9yZXNvbHZlRXh0ZW5zaW9uc0RlZmF1bHQoZW1pdHRlcik7XG5cdFx0fVxuXG5cdFx0Ly8gc2V0IHRoZSByZXNvbHZlZCBhdXRob3JpdHlcblx0XHR0aGlzLl9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UuX3NldFJlc29sdmVkQXV0aG9yaXR5KHJlc29sdmVyUmVzdWx0LmF1dGhvcml0eSwgcmVzb2x2ZXJSZXN1bHQub3B0aW9ucyk7XG5cdFx0dGhpcy5fcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnNldFR1bm5lbEluZm9ybWF0aW9uKHJlc29sdmVyUmVzdWx0LnR1bm5lbEluZm9ybWF0aW9uKTtcblxuXHRcdC8vIG1vbml0b3IgZm9yIGJyZWFrYWdlXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk7XG5cdFx0aWYgKGNvbm5lY3Rpb24pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGNvbm5lY3Rpb24ub25EaWRTdGF0ZUNoYW5nZShhc3luYyAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS50eXBlID09PSBQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZS5Db25uZWN0aW9uTG9zdCkge1xuXHRcdFx0XHRcdHRoaXMuX3JlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5fY2xlYXJSZXNvbHZlZEF1dGhvcml0eShyZW1vdGVBdXRob3JpdHkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihjb25uZWN0aW9uLm9uUmVjb25uZWN0aW5nKCgpID0+IHRoaXMuX3Jlc29sdmVBdXRob3JpdHlBZ2FpbigpKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVFeHRlbnNpb25zRGVmYXVsdChlbWl0dGVyKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfb25FeHRlbnNpb25Ib3N0RXhpdChjb2RlOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBEaXNwb3NlIGV2ZXJ5dGhpbmcgYXNzb2NpYXRlZCB3aXRoIHRoZSBleHRlbnNpb24gaG9zdFxuXHRcdGF3YWl0IHRoaXMuX2RvU3RvcEV4dGVuc2lvbkhvc3RzKCk7XG5cblx0XHQvLyBJZiB3ZSBhcmUgcnVubmluZyBleHRlbnNpb24gdGVzdHMsIGZvcndhcmQgbG9ncyBhbmQgZXhpdCBjb2RlXG5cdFx0Y29uc3QgYXV0b21hdGVkV2luZG93ID0gbWFpbldpbmRvdyBhcyB1bmtub3duIGFzIElBdXRvbWF0ZWRXaW5kb3c7XG5cdFx0aWYgKHR5cGVvZiBhdXRvbWF0ZWRXaW5kb3cuY29kZUF1dG9tYXRpb25FeGl0ID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRhdXRvbWF0ZWRXaW5kb3cuY29kZUF1dG9tYXRpb25FeGl0KGNvZGUsIGF3YWl0IGdldExvZ3ModGhpcy5fZmlsZVNlcnZpY2UsIHRoaXMuX2Vudmlyb25tZW50U2VydmljZSkpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfcmVzb2x2ZUF1dGhvcml0eShyZW1vdGVBdXRob3JpdHk6IHN0cmluZyk6IFByb21pc2U8UmVzb2x2ZXJSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZUF1dGhvcml0eU9uRXh0ZW5zaW9uSG9zdHMoRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxXZWJXb3JrZXIsIHJlbW90ZUF1dGhvcml0eSk7XG5cdH1cbn1cblxuY2xhc3MgQnJvd3NlckV4dGVuc2lvbkhvc3RGYWN0b3J5IGltcGxlbWVudHMgSUV4dGVuc2lvbkhvc3RGYWN0b3J5IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25zUHJvcG9zZWRBcGk6IEV4dGVuc2lvbnNQcm9wb3NlZEFwaSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zY2FuV2ViRXh0ZW5zaW9uczogKCkgPT4gUHJvbWlzZTxJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0RXh0ZW5zaW9uUmVnaXN0cnlTbmFwc2hvdFdoZW5SZWFkeTogKCkgPT4gUHJvbWlzZTxFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5U25hcHNob3Q+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlOiBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0Y3JlYXRlRXh0ZW5zaW9uSG9zdChydW5uaW5nTG9jYXRpb25zOiBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb25UcmFja2VyLCBydW5uaW5nTG9jYXRpb246IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiwgaXNJbml0aWFsU3RhcnQ6IGJvb2xlYW4pOiBJRXh0ZW5zaW9uSG9zdCB8IG51bGwge1xuXHRcdHN3aXRjaCAocnVubmluZ0xvY2F0aW9uLmtpbmQpIHtcblx0XHRcdGNhc2UgRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzOiB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlcjoge1xuXHRcdFx0XHRjb25zdCBzdGFydHVwID0gKFxuXHRcdFx0XHRcdGlzSW5pdGlhbFN0YXJ0XG5cdFx0XHRcdFx0XHQ/IEV4dGVuc2lvbkhvc3RTdGFydHVwLkVhZ2VyTWFudWFsU3RhcnRcblx0XHRcdFx0XHRcdDogRXh0ZW5zaW9uSG9zdFN0YXJ0dXAuRWFnZXJBdXRvU3RhcnRcblx0XHRcdFx0KTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdlYldvcmtlckV4dGVuc2lvbkhvc3QsIHJ1bm5pbmdMb2NhdGlvbiwgc3RhcnR1cCwgdGhpcy5fY3JlYXRlTG9jYWxFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyKHJ1bm5pbmdMb2NhdGlvbnMsIHJ1bm5pbmdMb2NhdGlvbiwgaXNJbml0aWFsU3RhcnQpKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgRXh0ZW5zaW9uSG9zdEtpbmQuUmVtb3RlOiB7XG5cdFx0XHRcdGNvbnN0IHJlbW90ZUFnZW50Q29ubmVjdGlvbiA9IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk7XG5cdFx0XHRcdGlmIChyZW1vdGVBZ2VudENvbm5lY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlRXh0ZW5zaW9uSG9zdCwgcnVubmluZ0xvY2F0aW9uLCB0aGlzLl9jcmVhdGVSZW1vdGVFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyKHJ1bm5pbmdMb2NhdGlvbnMsIHJlbW90ZUFnZW50Q29ubmVjdGlvbi5yZW1vdGVBdXRob3JpdHkpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVMb2NhbEV4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIocnVubmluZ0xvY2F0aW9uczogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlciwgZGVzaXJlZFJ1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uLCBpc0luaXRpYWxTdGFydDogYm9vbGVhbik6IElXZWJXb3JrZXJFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0SW5pdERhdGE6IGFzeW5jICgpOiBQcm9taXNlPElXZWJXb3JrZXJFeHRlbnNpb25Ib3N0SW5pdERhdGE+ID0+IHtcblx0XHRcdFx0aWYgKGlzSW5pdGlhbFN0YXJ0KSB7XG5cdFx0XHRcdFx0Ly8gSGVyZSB3ZSBsb2FkIGV2ZW4gZXh0ZW5zaW9ucyB0aGF0IHdvdWxkIGJlIGRpc2FibGVkIGJ5IHdvcmtzcGFjZSB0cnVzdFxuXHRcdFx0XHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IGNoZWNrRW5hYmxlZEFuZFByb3Bvc2VkQVBJKHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX2V4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCB0aGlzLl9leHRlbnNpb25zUHJvcG9zZWRBcGksIGF3YWl0IHRoaXMuX3NjYW5XZWJFeHRlbnNpb25zKCksIC8qIGlnbm9yZSB3b3Jrc3BhY2UgdHJ1c3QgKi90cnVlKTtcblx0XHRcdFx0XHRjb25zdCBydW5uaW5nTG9jYXRpb24gPSBydW5uaW5nTG9jYXRpb25zLmNvbXB1dGVSdW5uaW5nTG9jYXRpb24obG9jYWxFeHRlbnNpb25zLCBbXSwgZmFsc2UpO1xuXHRcdFx0XHRcdGNvbnN0IG15RXh0ZW5zaW9ucyA9IGZpbHRlckV4dGVuc2lvbkRlc2NyaXB0aW9ucyhsb2NhbEV4dGVuc2lvbnMsIHJ1bm5pbmdMb2NhdGlvbiwgZXh0UnVubmluZ0xvY2F0aW9uID0+IGRlc2lyZWRSdW5uaW5nTG9jYXRpb24uZXF1YWxzKGV4dFJ1bm5pbmdMb2NhdGlvbikpO1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBuZXcgRXh0ZW5zaW9uSG9zdEV4dGVuc2lvbnMoMCwgbG9jYWxFeHRlbnNpb25zLCBteUV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiBleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0XHRcdHJldHVybiB7IGV4dGVuc2lvbnMgfTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyByZXN0YXJ0IGNhc2Vcblx0XHRcdFx0XHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IHRoaXMuX2dldEV4dGVuc2lvblJlZ2lzdHJ5U25hcHNob3RXaGVuUmVhZHkoKTtcblx0XHRcdFx0XHRjb25zdCBteUV4dGVuc2lvbnMgPSBydW5uaW5nTG9jYXRpb25zLmZpbHRlckJ5UnVubmluZ0xvY2F0aW9uKHNuYXBzaG90LmV4dGVuc2lvbnMsIGRlc2lyZWRSdW5uaW5nTG9jYXRpb24pO1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBuZXcgRXh0ZW5zaW9uSG9zdEV4dGVuc2lvbnMoc25hcHNob3QudmVyc2lvbklkLCBzbmFwc2hvdC5leHRlbnNpb25zLCBteUV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiBleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0XHRcdHJldHVybiB7IGV4dGVuc2lvbnMgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVSZW1vdGVFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyKHJ1bm5pbmdMb2NhdGlvbnM6IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvblRyYWNrZXIsIHJlbW90ZUF1dGhvcml0eTogc3RyaW5nKTogSVJlbW90ZUV4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSxcblx0XHRcdGdldEluaXREYXRhOiBhc3luYyAoKTogUHJvbWlzZTxJUmVtb3RlRXh0ZW5zaW9uSG9zdEluaXREYXRhPiA9PiB7XG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGhpcy5fZ2V0RXh0ZW5zaW9uUmVnaXN0cnlTbmFwc2hvdFdoZW5SZWFkeSgpO1xuXG5cdFx0XHRcdGNvbnN0IHJlbW90ZUVudiA9IGF3YWl0IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdFx0XHRpZiAoIXJlbW90ZUVudikge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHByb3ZpZGUgaW5pdCBkYXRhIGZvciByZW1vdGUgZXh0ZW5zaW9uIGhvc3QhJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBteUV4dGVuc2lvbnMgPSBydW5uaW5nTG9jYXRpb25zLmZpbHRlckJ5RXh0ZW5zaW9uSG9zdEtpbmQoc25hcHNob3QuZXh0ZW5zaW9ucywgRXh0ZW5zaW9uSG9zdEtpbmQuUmVtb3RlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IG5ldyBFeHRlbnNpb25Ib3N0RXh0ZW5zaW9ucyhzbmFwc2hvdC52ZXJzaW9uSWQsIHNuYXBzaG90LmV4dGVuc2lvbnMsIG15RXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjb25uZWN0aW9uRGF0YTogdGhpcy5fcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLmdldENvbm5lY3Rpb25EYXRhKHJlbW90ZUF1dGhvcml0eSksXG5cdFx0XHRcdFx0cGlkOiByZW1vdGVFbnYucGlkLFxuXHRcdFx0XHRcdGFwcFJvb3Q6IHJlbW90ZUVudi5hcHBSb290LFxuXHRcdFx0XHRcdGV4dGVuc2lvbkhvc3RMb2dzUGF0aDogcmVtb3RlRW52LmV4dGVuc2lvbkhvc3RMb2dzUGF0aCxcblx0XHRcdFx0XHRnbG9iYWxTdG9yYWdlSG9tZTogcmVtb3RlRW52Lmdsb2JhbFN0b3JhZ2VIb21lLFxuXHRcdFx0XHRcdHdvcmtzcGFjZVN0b3JhZ2VIb21lOiByZW1vdGVFbnYud29ya3NwYWNlU3RvcmFnZUhvbWUsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9ucyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyRXh0ZW5zaW9uSG9zdEtpbmRQaWNrZXIgaW1wbGVtZW50cyBJRXh0ZW5zaW9uSG9zdEtpbmRQaWNrZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7IH1cblxuXHRwaWNrRXh0ZW5zaW9uSG9zdEtpbmQoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGV4dGVuc2lvbktpbmRzOiBFeHRlbnNpb25LaW5kW10sIGlzSW5zdGFsbGVkTG9jYWxseTogYm9vbGVhbiwgaXNJbnN0YWxsZWRSZW1vdGVseTogYm9vbGVhbiwgcHJlZmVyZW5jZTogRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UpOiBFeHRlbnNpb25Ib3N0S2luZCB8IG51bGwge1xuXHRcdGNvbnN0IHJlc3VsdCA9IEJyb3dzZXJFeHRlbnNpb25Ib3N0S2luZFBpY2tlci5waWNrUnVubmluZ0xvY2F0aW9uKGV4dGVuc2lvbktpbmRzLCBpc0luc3RhbGxlZExvY2FsbHksIGlzSW5zdGFsbGVkUmVtb3RlbHksIHByZWZlcmVuY2UpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYHBpY2tSdW5uaW5nTG9jYXRpb24gZm9yICR7ZXh0ZW5zaW9uSWQudmFsdWV9LCBleHRlbnNpb24ga2luZHM6IFske2V4dGVuc2lvbktpbmRzLmpvaW4oJywgJyl9XSwgaXNJbnN0YWxsZWRMb2NhbGx5OiAke2lzSW5zdGFsbGVkTG9jYWxseX0sIGlzSW5zdGFsbGVkUmVtb3RlbHk6ICR7aXNJbnN0YWxsZWRSZW1vdGVseX0sIHByZWZlcmVuY2U6ICR7ZXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2VUb1N0cmluZyhwcmVmZXJlbmNlKX0gPT4gJHtleHRlbnNpb25Ib3N0S2luZFRvU3RyaW5nKHJlc3VsdCl9YCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgcGlja1J1bm5pbmdMb2NhdGlvbihleHRlbnNpb25LaW5kczogRXh0ZW5zaW9uS2luZFtdLCBpc0luc3RhbGxlZExvY2FsbHk6IGJvb2xlYW4sIGlzSW5zdGFsbGVkUmVtb3RlbHk6IGJvb2xlYW4sIHByZWZlcmVuY2U6IEV4dGVuc2lvblJ1bm5pbmdQcmVmZXJlbmNlKTogRXh0ZW5zaW9uSG9zdEtpbmQgfCBudWxsIHtcblx0XHRjb25zdCByZXN1bHQ6IEV4dGVuc2lvbkhvc3RLaW5kW10gPSBbXTtcblx0XHRsZXQgY2FuUnVuUmVtb3RlbHkgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbktpbmQgb2YgZXh0ZW5zaW9uS2luZHMpIHtcblx0XHRcdGlmIChleHRlbnNpb25LaW5kID09PSAndWknICYmIGlzSW5zdGFsbGVkUmVtb3RlbHkpIHtcblx0XHRcdFx0Ly8gdWkgZXh0ZW5zaW9ucyBydW4gcmVtb3RlbHkgaWYgcG9zc2libGUgKGJ1dCBvbmx5IGFzIGEgbGFzdCByZXNvcnQpXG5cdFx0XHRcdGlmIChwcmVmZXJlbmNlID09PSBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZS5SZW1vdGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gRXh0ZW5zaW9uSG9zdEtpbmQuUmVtb3RlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNhblJ1blJlbW90ZWx5ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbktpbmQgPT09ICd3b3Jrc3BhY2UnICYmIGlzSW5zdGFsbGVkUmVtb3RlbHkpIHtcblx0XHRcdFx0Ly8gd29ya3NwYWNlIGV4dGVuc2lvbnMgcnVuIHJlbW90ZWx5IGlmIHBvc3NpYmxlXG5cdFx0XHRcdGlmIChwcmVmZXJlbmNlID09PSBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZS5Ob25lIHx8IHByZWZlcmVuY2UgPT09IEV4dGVuc2lvblJ1bm5pbmdQcmVmZXJlbmNlLlJlbW90ZSkge1xuXHRcdFx0XHRcdHJldHVybiBFeHRlbnNpb25Ib3N0S2luZC5SZW1vdGU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goRXh0ZW5zaW9uSG9zdEtpbmQuUmVtb3RlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbktpbmQgPT09ICd3ZWInICYmIChpc0luc3RhbGxlZExvY2FsbHkgfHwgaXNJbnN0YWxsZWRSZW1vdGVseSkpIHtcblx0XHRcdFx0Ly8gd2ViIHdvcmtlciBleHRlbnNpb25zIHJ1biBpbiB0aGUgbG9jYWwgd2ViIHdvcmtlciBpZiBwb3NzaWJsZVxuXHRcdFx0XHRpZiAocHJlZmVyZW5jZSA9PT0gRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UuTm9uZSB8fCBwcmVmZXJlbmNlID09PSBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZS5Mb2NhbCkge1xuXHRcdFx0XHRcdHJldHVybiBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlcjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNhblJ1blJlbW90ZWx5KSB7XG5cdFx0XHRyZXN1bHQucHVzaChFeHRlbnNpb25Ib3N0S2luZC5SZW1vdGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gKHJlc3VsdC5sZW5ndGggPiAwID8gcmVzdWx0WzBdIDogbnVsbCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUV4dGVuc2lvblNlcnZpY2UsIEV4dGVuc2lvblNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtc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
