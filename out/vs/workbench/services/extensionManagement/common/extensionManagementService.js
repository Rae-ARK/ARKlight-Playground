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
import { Emitter, Event, EventMultiplexer } from "../../../../base/common/event.js";
import {
  IExtensionGalleryService,
  ExtensionManagementError,
  ExtensionManagementErrorCode,
  InstallOperation,
  EXTENSION_INSTALL_SOURCE_CONTEXT,
  ExtensionInstallSource,
  IAllowedExtensionsService,
  EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT
} from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IExtensionManagementServerService } from "./extensionManagement.js";
import { ExtensionType, isLanguagePackExtension, getWorkspaceSupportTypeMessage } from "../../../../platform/extensions/common/extensions.js";
import { URI } from "../../../../base/common/uri.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { areSameExtensions, computeTargetPlatform } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { localize } from "../../../../nls.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Schemas } from "../../../../base/common/network.js";
import { IDownloadService } from "../../../../platform/download/common/download.js";
import { coalesce, distinct, isNonEmptyArray } from "../../../../base/common/arrays.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import Severity from "../../../../base/common/severity.js";
import { IUserDataSyncEnablementService, SyncResource } from "../../../../platform/userDataSync/common/userDataSync.js";
import { Promises } from "../../../../base/common/async.js";
import { IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IExtensionManifestPropertiesService } from "../../extensions/common/extensionManifestPropertiesService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { isString, isUndefined } from "../../../../base/common/types.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { CancellationError, getErrorMessage } from "../../../../base/common/errors.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IExtensionsScannerService } from "../../../../platform/extensionManagement/common/extensionsScannerService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { createCommandUri, MarkdownString } from "../../../../base/common/htmlContent.js";
import { verifiedPublisherIcon } from "./extensionsIcons.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { CommontExtensionManagementService } from "../../../../platform/extensionManagement/common/abstractExtensionManagementService.js";
const TrustedPublishersStorageKey = "extensions.trustedPublishers";
function isGalleryExtension(extension) {
  return extension.type === "gallery";
}
let ExtensionManagementService = class extends CommontExtensionManagementService {
  constructor(extensionManagementServerService, extensionGalleryService, userDataProfileService, userDataProfilesService, configurationService, productService, downloadService, userDataSyncEnablementService, dialogService, workspaceTrustRequestService, extensionManifestPropertiesService, fileService, logService, instantiationService, extensionsScannerService, allowedExtensionsService, storageService, telemetryService) {
    super(productService, allowedExtensionsService);
    this.extensionManagementServerService = extensionManagementServerService;
    this.extensionGalleryService = extensionGalleryService;
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.configurationService = configurationService;
    this.downloadService = downloadService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.dialogService = dialogService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.fileService = fileService;
    this.logService = logService;
    this.instantiationService = instantiationService;
    this.extensionsScannerService = extensionsScannerService;
    this.storageService = storageService;
    this.telemetryService = telemetryService;
    this._onInstallExtension = this._register(new Emitter());
    this._onDidInstallExtensions = this._register(new Emitter());
    this._onUninstallExtension = this._register(new Emitter());
    this._onDidUninstallExtension = this._register(new Emitter());
    this._onDidProfileAwareInstallExtensions = this._register(new Emitter());
    this._onDidProfileAwareUninstallExtension = this._register(new Emitter());
    this.servers = [];
    this.defaultTrustedPublishers = productService.trustedExtensionPublishers ?? [];
    this.workspaceExtensionManagementService = this._register(this.instantiationService.createInstance(WorkspaceExtensionsManagementService));
    this.onDidEnableExtensions = this.workspaceExtensionManagementService.onDidChangeInvalidExtensions;
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      this.servers.push(this.extensionManagementServerService.localExtensionManagementServer);
    }
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      this.servers.push(this.extensionManagementServerService.remoteExtensionManagementServer);
    }
    if (this.extensionManagementServerService.webExtensionManagementServer) {
      this.servers.push(this.extensionManagementServerService.webExtensionManagementServer);
    }
    const onInstallExtensionEventMultiplexer = this._register(new EventMultiplexer());
    this._register(onInstallExtensionEventMultiplexer.add(this._onInstallExtension.event));
    this.onInstallExtension = onInstallExtensionEventMultiplexer.event;
    const onDidInstallExtensionsEventMultiplexer = this._register(new EventMultiplexer());
    this._register(onDidInstallExtensionsEventMultiplexer.add(this._onDidInstallExtensions.event));
    this.onDidInstallExtensions = onDidInstallExtensionsEventMultiplexer.event;
    const onDidProfileAwareInstallExtensionsEventMultiplexer = this._register(new EventMultiplexer());
    this._register(onDidProfileAwareInstallExtensionsEventMultiplexer.add(this._onDidProfileAwareInstallExtensions.event));
    this.onProfileAwareDidInstallExtensions = onDidProfileAwareInstallExtensionsEventMultiplexer.event;
    const onUninstallExtensionEventMultiplexer = this._register(new EventMultiplexer());
    this._register(onUninstallExtensionEventMultiplexer.add(this._onUninstallExtension.event));
    this.onUninstallExtension = onUninstallExtensionEventMultiplexer.event;
    const onDidUninstallExtensionEventMultiplexer = this._register(new EventMultiplexer());
    this._register(onDidUninstallExtensionEventMultiplexer.add(this._onDidUninstallExtension.event));
    this.onDidUninstallExtension = onDidUninstallExtensionEventMultiplexer.event;
    const onDidProfileAwareUninstallExtensionEventMultiplexer = this._register(new EventMultiplexer());
    this._register(onDidProfileAwareUninstallExtensionEventMultiplexer.add(this._onDidProfileAwareUninstallExtension.event));
    this.onProfileAwareDidUninstallExtension = onDidProfileAwareUninstallExtensionEventMultiplexer.event;
    const onDidUpdateExtensionMetadaEventMultiplexer = this._register(new EventMultiplexer());
    this.onDidUpdateExtensionMetadata = onDidUpdateExtensionMetadaEventMultiplexer.event;
    const onDidProfileAwareUpdateExtensionMetadaEventMultiplexer = this._register(new EventMultiplexer());
    this.onProfileAwareDidUpdateExtensionMetadata = onDidProfileAwareUpdateExtensionMetadaEventMultiplexer.event;
    const onDidChangeProfileEventMultiplexer = this._register(new EventMultiplexer());
    this.onDidChangeProfile = onDidChangeProfileEventMultiplexer.event;
    for (const server of this.servers) {
      this._register(onInstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onInstallExtension, (e) => ({ ...e, server }))));
      this._register(onDidInstallExtensionsEventMultiplexer.add(server.extensionManagementService.onDidInstallExtensions));
      this._register(onDidProfileAwareInstallExtensionsEventMultiplexer.add(server.extensionManagementService.onProfileAwareDidInstallExtensions));
      this._register(onUninstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onUninstallExtension, (e) => ({ ...e, server }))));
      this._register(onDidUninstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onDidUninstallExtension, (e) => ({ ...e, server }))));
      this._register(onDidProfileAwareUninstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onProfileAwareDidUninstallExtension, (e) => ({ ...e, server }))));
      this._register(onDidUpdateExtensionMetadaEventMultiplexer.add(server.extensionManagementService.onDidUpdateExtensionMetadata));
      this._register(onDidProfileAwareUpdateExtensionMetadaEventMultiplexer.add(server.extensionManagementService.onProfileAwareDidUpdateExtensionMetadata));
      this._register(onDidChangeProfileEventMultiplexer.add(Event.map(server.extensionManagementService.onDidChangeProfile, (e) => ({ ...e, server }))));
    }
    this._register(this.onProfileAwareDidInstallExtensions((results) => {
      const untrustedPublishers = /* @__PURE__ */ new Map();
      for (const result of results) {
        if (result.local && result.source && !URI.isUri(result.source) && !this.isPublisherTrusted(result.source)) {
          untrustedPublishers.set(result.source.publisher, { publisher: result.source.publisher, publisherDisplayName: result.source.publisherDisplayName });
        }
      }
      if (untrustedPublishers.size) {
        this.trustPublishers(...untrustedPublishers.values());
      }
    }));
  }
  async getInstalled(type, profileLocation, productVersion) {
    const result = [];
    await Promise.all(this.servers.map(async (server) => {
      const installed = await server.extensionManagementService.getInstalled(type, profileLocation, productVersion);
      if (server === this.getWorkspaceExtensionsServer()) {
        const workspaceExtensions = await this.getInstalledWorkspaceExtensions(true);
        installed.push(...workspaceExtensions);
      }
      result.push(...installed);
    }));
    return result;
  }
  uninstall(extension, options) {
    return this.uninstallExtensions([{ extension, options }]);
  }
  async uninstallExtensions(extensions) {
    const workspaceExtensions = [];
    const groupedExtensions = /* @__PURE__ */ new Map();
    const addExtensionToServer = (server, extension, options) => {
      let extensions2 = groupedExtensions.get(server);
      if (!extensions2) {
        groupedExtensions.set(server, extensions2 = []);
      }
      extensions2.push({ extension, options });
    };
    for (const { extension, options } of extensions) {
      if (extension.isWorkspaceScoped) {
        workspaceExtensions.push(extension);
        continue;
      }
      const server = this.getServer(extension);
      if (!server) {
        throw new Error(`Invalid location ${extension.location.toString()}`);
      }
      addExtensionToServer(server, extension, options);
      if (this.servers.length > 1 && isLanguagePackExtension(extension.manifest)) {
        const otherServers = this.servers.filter((s) => s !== server);
        for (const otherServer of otherServers) {
          const installed = await otherServer.extensionManagementService.getInstalled();
          const extensionInOtherServer = installed.find((i) => !i.isBuiltin && areSameExtensions(i.identifier, extension.identifier));
          if (extensionInOtherServer) {
            addExtensionToServer(otherServer, extensionInOtherServer, options);
          }
        }
      }
    }
    const promises = [];
    for (const workspaceExtension of workspaceExtensions) {
      promises.push(this.uninstallExtensionFromWorkspace(workspaceExtension));
    }
    for (const [server, extensions2] of groupedExtensions.entries()) {
      promises.push(this.uninstallInServer(server, extensions2));
    }
    const result = await Promise.allSettled(promises);
    const errors = result.filter((r) => r.status === "rejected").map((r) => r.reason);
    if (errors.length) {
      throw new Error(errors.map((e) => e.message).join("\n"));
    }
  }
  async uninstallInServer(server, extensions) {
    if (server === this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
      for (const { extension } of extensions) {
        const installedExtensions = await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getInstalled(ExtensionType.User);
        const dependentNonUIExtensions = installedExtensions.filter((i) => !this.extensionManifestPropertiesService.prefersExecuteOnUI(i.manifest) && i.manifest.extensionDependencies && i.manifest.extensionDependencies.some((id) => areSameExtensions({ id }, extension.identifier)));
        if (dependentNonUIExtensions.length) {
          throw new Error(this.getDependentsErrorMessage(extension, dependentNonUIExtensions));
        }
      }
    }
    return server.extensionManagementService.uninstallExtensions(extensions);
  }
  getDependentsErrorMessage(extension, dependents) {
    if (dependents.length === 1) {
      return localize(
        "singleDependentError",
        "Cannot uninstall extension '{0}'. Extension '{1}' depends on this.",
        extension.manifest.displayName || extension.manifest.name,
        dependents[0].manifest.displayName || dependents[0].manifest.name
      );
    }
    if (dependents.length === 2) {
      return localize(
        "twoDependentsError",
        "Cannot uninstall extension '{0}'. Extensions '{1}' and '{2}' depend on this.",
        extension.manifest.displayName || extension.manifest.name,
        dependents[0].manifest.displayName || dependents[0].manifest.name,
        dependents[1].manifest.displayName || dependents[1].manifest.name
      );
    }
    return localize(
      "multipleDependentsError",
      "Cannot uninstall extension '{0}'. Extensions '{1}', '{2}' and others depend on this.",
      extension.manifest.displayName || extension.manifest.name,
      dependents[0].manifest.displayName || dependents[0].manifest.name,
      dependents[1].manifest.displayName || dependents[1].manifest.name
    );
  }
  updateMetadata(extension, metadata) {
    const server = this.getServer(extension);
    if (server) {
      const profile = extension.isApplicationScoped ? this.userDataProfilesService.defaultProfile : this.userDataProfileService.currentProfile;
      return server.extensionManagementService.updateMetadata(extension, metadata, profile.extensionsResource);
    }
    return Promise.reject(`Invalid location ${extension.location.toString()}`);
  }
  async resetPinnedStateForAllUserExtensions(pinned) {
    await Promise.allSettled(this.servers.map((server) => server.extensionManagementService.resetPinnedStateForAllUserExtensions(pinned)));
  }
  zip(extension) {
    const server = this.getServer(extension);
    if (server) {
      return server.extensionManagementService.zip(extension);
    }
    return Promise.reject(`Invalid location ${extension.location.toString()}`);
  }
  download(extension, operation, donotVerifySignature) {
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.download(extension, operation, donotVerifySignature);
    }
    throw new Error("Cannot download extension");
  }
  async install(vsix, options) {
    const manifest = await this.getManifest(vsix);
    return this.installVSIX(vsix, manifest, options);
  }
  async installVSIX(vsix, manifest, options) {
    const serversToInstall = this.getServersToInstall(manifest);
    if (serversToInstall?.length) {
      await this.checkForWorkspaceTrust(manifest, false);
      const [local] = await Promises.settled(serversToInstall.map((server) => this.installVSIXInServer(vsix, server, options)));
      return local;
    }
    return Promise.reject("No Servers to Install");
  }
  getServersToInstall(manifest) {
    if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
      if (isLanguagePackExtension(manifest)) {
        return [this.extensionManagementServerService.localExtensionManagementServer, this.extensionManagementServerService.remoteExtensionManagementServer];
      }
      if (this.extensionManifestPropertiesService.prefersExecuteOnUI(manifest)) {
        return [this.extensionManagementServerService.localExtensionManagementServer];
      }
      return [this.extensionManagementServerService.remoteExtensionManagementServer];
    }
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      return [this.extensionManagementServerService.localExtensionManagementServer];
    }
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      return [this.extensionManagementServerService.remoteExtensionManagementServer];
    }
    return void 0;
  }
  async installFromLocation(location) {
    if (location.scheme === Schemas.file) {
      if (this.extensionManagementServerService.localExtensionManagementServer) {
        return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromLocation(location, this.userDataProfileService.currentProfile.extensionsResource);
      }
      throw new Error("Local extension management server is not found");
    }
    if (location.scheme === Schemas.vscodeRemote) {
      if (this.extensionManagementServerService.remoteExtensionManagementServer) {
        return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.installFromLocation(location, this.userDataProfileService.currentProfile.extensionsResource);
      }
      throw new Error("Remote extension management server is not found");
    }
    if (!this.extensionManagementServerService.webExtensionManagementServer) {
      throw new Error("Web extension management server is not found");
    }
    return this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.installFromLocation(location, this.userDataProfileService.currentProfile.extensionsResource);
  }
  installVSIXInServer(vsix, server, options) {
    return server.extensionManagementService.install(vsix, options);
  }
  getManifest(vsix) {
    if (vsix.scheme === Schemas.file && this.extensionManagementServerService.localExtensionManagementServer) {
      return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getManifest(vsix);
    }
    if (vsix.scheme === Schemas.file && this.extensionManagementServerService.remoteExtensionManagementServer) {
      return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getManifest(vsix);
    }
    if (vsix.scheme === Schemas.vscodeRemote && this.extensionManagementServerService.remoteExtensionManagementServer) {
      return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getManifest(vsix);
    }
    return Promise.reject("No Servers");
  }
  async canInstall(extension) {
    if (isGalleryExtension(extension)) {
      return this.canInstallGalleryExtension(extension);
    }
    return this.canInstallResourceExtension(extension);
  }
  async canInstallGalleryExtension(gallery) {
    if (this.extensionManagementServerService.localExtensionManagementServer && await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(gallery) === true) {
      return true;
    }
    const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
    if (!manifest) {
      return new MarkdownString().appendText(localize("manifest is not found", "Manifest is not found"));
    }
    if (this.extensionManagementServerService.remoteExtensionManagementServer && await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.canInstall(gallery) === true && this.extensionManifestPropertiesService.canExecuteOnWorkspace(manifest)) {
      return true;
    }
    if (this.extensionManagementServerService.webExtensionManagementServer && await this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.canInstall(gallery) === true && this.extensionManifestPropertiesService.canExecuteOnWeb(manifest)) {
      return true;
    }
    return new MarkdownString().appendText(localize("cannot be installed", "Cannot install the '{0}' extension because it is not available in this setup.", gallery.displayName || gallery.name));
  }
  async canInstallResourceExtension(extension) {
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      return true;
    }
    if (this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWorkspace(extension.manifest)) {
      return true;
    }
    if (this.extensionManagementServerService.webExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWeb(extension.manifest)) {
      return true;
    }
    return new MarkdownString().appendText(localize("cannot be installed", "Cannot install the '{0}' extension because it is not available in this setup.", extension.manifest.displayName ?? extension.identifier.id));
  }
  async updateFromGallery(gallery, extension, installOptions) {
    const server = this.getServer(extension);
    if (!server) {
      return Promise.reject(`Invalid location ${extension.location.toString()}`);
    }
    const servers = [];
    if (isLanguagePackExtension(extension.manifest)) {
      servers.push(...this.servers.filter((server2) => server2 !== this.extensionManagementServerService.webExtensionManagementServer));
    } else {
      servers.push(server);
    }
    installOptions = { ...installOptions || {}, isApplicationScoped: extension.isApplicationScoped };
    return Promises.settled(servers.map((server2) => server2.extensionManagementService.installFromGallery(gallery, installOptions))).then(([local]) => local);
  }
  async installGalleryExtensions(extensions) {
    const results = /* @__PURE__ */ new Map();
    const extensionsByServer = /* @__PURE__ */ new Map();
    const manifests = await Promise.all(extensions.map(async ({ extension }) => {
      const manifest = await this.extensionGalleryService.getManifest(extension, CancellationToken.None);
      if (!manifest) {
        throw new Error(localize("Manifest is not found", "Installing Extension {0} failed: Manifest is not found.", extension.displayName || extension.name));
      }
      return manifest;
    }));
    if (extensions.some((e) => e.options?.context?.[EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT] !== true)) {
      await this.checkForTrustedPublishers(extensions.map((e, index) => ({ extension: e.extension, manifest: manifests[index], checkForPackAndDependencies: !e.options?.donotIncludePackAndDependencies })));
    }
    await Promise.all(extensions.map(async ({ extension, options }) => {
      try {
        const manifest = await this.extensionGalleryService.getManifest(extension, CancellationToken.None);
        if (!manifest) {
          throw new Error(localize("Manifest is not found", "Installing Extension {0} failed: Manifest is not found.", extension.displayName || extension.name));
        }
        if (options?.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT] !== ExtensionInstallSource.SETTINGS_SYNC) {
          await this.checkForWorkspaceTrust(manifest, false);
          if (!options?.donotIncludePackAndDependencies) {
            await this.checkInstallingExtensionOnWeb(extension, manifest);
          }
        }
        const servers = await this.getExtensionManagementServersToInstall(extension, manifest);
        if (!options.isMachineScoped && this.isExtensionsSyncEnabled()) {
          if (this.extensionManagementServerService.localExtensionManagementServer && !servers.includes(this.extensionManagementServerService.localExtensionManagementServer) && await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(extension) === true) {
            servers.push(this.extensionManagementServerService.localExtensionManagementServer);
          }
        }
        for (const server of servers) {
          let exensions = extensionsByServer.get(server);
          if (!exensions) {
            extensionsByServer.set(server, exensions = []);
          }
          exensions.push({ extension, options });
        }
      } catch (error) {
        results.set(extension.identifier.id.toLowerCase(), {
          identifier: extension.identifier,
          source: extension,
          error,
          operation: InstallOperation.Install,
          profileLocation: options.profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource
        });
      }
    }));
    await Promise.all([...extensionsByServer.entries()].map(async ([server, extensions2]) => {
      const serverResults = await server.extensionManagementService.installGalleryExtensions(extensions2);
      for (const result of serverResults) {
        results.set(result.identifier.id.toLowerCase(), result);
      }
    }));
    return [...results.values()];
  }
  async installFromGallery(gallery, installOptions, servers) {
    const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
    if (!manifest) {
      throw new Error(localize("Manifest is not found", "Installing Extension {0} failed: Manifest is not found.", gallery.displayName || gallery.name));
    }
    if (installOptions?.context?.[EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT] !== true) {
      await this.checkForTrustedPublishers([{ extension: gallery, manifest, checkForPackAndDependencies: !installOptions?.donotIncludePackAndDependencies }]);
    }
    if (installOptions?.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT] !== ExtensionInstallSource.SETTINGS_SYNC) {
      await this.checkForWorkspaceTrust(manifest, false);
      if (!installOptions?.donotIncludePackAndDependencies) {
        await this.checkInstallingExtensionOnWeb(gallery, manifest);
      }
    }
    servers = servers?.length ? this.validServers(gallery, manifest, servers) : await this.getExtensionManagementServersToInstall(gallery, manifest);
    if (!installOptions || isUndefined(installOptions.isMachineScoped)) {
      const isMachineScoped = await this.hasToFlagExtensionsMachineScoped([gallery]);
      installOptions = { ...installOptions || {}, isMachineScoped };
    }
    if (!installOptions.isMachineScoped && this.isExtensionsSyncEnabled()) {
      if (this.extensionManagementServerService.localExtensionManagementServer && !servers.includes(this.extensionManagementServerService.localExtensionManagementServer) && await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(gallery) === true) {
        servers.push(this.extensionManagementServerService.localExtensionManagementServer);
      }
    }
    return Promises.settled(servers.map((server) => server.extensionManagementService.installFromGallery(gallery, installOptions))).then(([local]) => local);
  }
  async getExtensions(locations) {
    const scannedExtensions = await this.extensionsScannerService.scanMultipleExtensions(locations, ExtensionType.User, { includeInvalid: true });
    const result = [];
    await Promise.all(scannedExtensions.map(async (scannedExtension) => {
      const workspaceExtension = await this.workspaceExtensionManagementService.toLocalWorkspaceExtension(scannedExtension);
      if (workspaceExtension) {
        result.push({
          type: "resource",
          identifier: workspaceExtension.identifier,
          location: workspaceExtension.location,
          manifest: workspaceExtension.manifest,
          changelogUri: workspaceExtension.changelogUrl,
          readmeUri: workspaceExtension.readmeUrl
        });
      }
    }));
    return result;
  }
  getInstalledWorkspaceExtensionLocations() {
    return this.workspaceExtensionManagementService.getInstalledWorkspaceExtensionsLocations();
  }
  async getInstalledWorkspaceExtensions(includeInvalid) {
    return this.workspaceExtensionManagementService.getInstalled(includeInvalid);
  }
  async installResourceExtension(extension, installOptions) {
    if (!this.canInstallResourceExtension(extension)) {
      throw new Error("This extension cannot be installed in the current workspace.");
    }
    if (!installOptions.isWorkspaceScoped) {
      return this.installFromLocation(extension.location);
    }
    this.logService.info(`Installing the extension ${extension.identifier.id} from ${extension.location.toString()} in workspace`);
    const server = this.getWorkspaceExtensionsServer();
    this._onInstallExtension.fire({
      identifier: extension.identifier,
      source: extension.location,
      server,
      applicationScoped: false,
      profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
      workspaceScoped: true
    });
    try {
      await this.checkForWorkspaceTrust(extension.manifest, true);
      const workspaceExtension = await this.workspaceExtensionManagementService.install(extension);
      this.logService.info(`Successfully installed the extension ${workspaceExtension.identifier.id} from ${extension.location.toString()} in the workspace`);
      this._onDidInstallExtensions.fire([{
        identifier: workspaceExtension.identifier,
        source: extension.location,
        operation: InstallOperation.Install,
        applicationScoped: false,
        profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
        local: workspaceExtension,
        workspaceScoped: true
      }]);
      return workspaceExtension;
    } catch (error) {
      this.logService.error(`Failed to install the extension ${extension.identifier.id} from ${extension.location.toString()} in the workspace`, getErrorMessage(error));
      this._onDidInstallExtensions.fire([{
        identifier: extension.identifier,
        source: extension.location,
        operation: InstallOperation.Install,
        applicationScoped: false,
        profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
        error,
        workspaceScoped: true
      }]);
      throw error;
    }
  }
  async getInstallableServers(gallery) {
    const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
    if (!manifest) {
      return Promise.reject(localize("Manifest is not found", "Installing Extension {0} failed: Manifest is not found.", gallery.displayName || gallery.name));
    }
    return this.getInstallableExtensionManagementServers(manifest);
  }
  async uninstallExtensionFromWorkspace(extension) {
    if (!extension.isWorkspaceScoped) {
      throw new Error("The extension is not a workspace extension");
    }
    this.logService.info(`Uninstalling the workspace extension ${extension.identifier.id} from ${extension.location.toString()}`);
    const server = this.getWorkspaceExtensionsServer();
    this._onUninstallExtension.fire({
      identifier: extension.identifier,
      server,
      applicationScoped: false,
      workspaceScoped: true,
      profileLocation: this.userDataProfileService.currentProfile.extensionsResource
    });
    try {
      await this.workspaceExtensionManagementService.uninstall(extension);
      this.logService.info(`Successfully uninstalled the workspace extension ${extension.identifier.id} from ${extension.location.toString()}`);
      this.telemetryService.publicLog2("workspaceextension:uninstall");
      this._onDidUninstallExtension.fire({
        identifier: extension.identifier,
        server,
        applicationScoped: false,
        workspaceScoped: true,
        profileLocation: this.userDataProfileService.currentProfile.extensionsResource
      });
    } catch (error) {
      this.logService.error(`Failed to uninstall the workspace extension ${extension.identifier.id} from ${extension.location.toString()}`, getErrorMessage(error));
      this._onDidUninstallExtension.fire({
        identifier: extension.identifier,
        server,
        error,
        applicationScoped: false,
        workspaceScoped: true,
        profileLocation: this.userDataProfileService.currentProfile.extensionsResource
      });
      throw error;
    }
  }
  validServers(gallery, manifest, servers) {
    const installableServers = this.getInstallableExtensionManagementServers(manifest);
    for (const server of servers) {
      if (!installableServers.includes(server)) {
        const error = new Error(localize("cannot be installed in server", "Cannot install the '{0}' extension because it is not available in the '{1}' setup.", gallery.displayName || gallery.name, server.label));
        error.name = ExtensionManagementErrorCode.Unsupported;
        throw error;
      }
    }
    return servers;
  }
  async getExtensionManagementServersToInstall(gallery, manifest) {
    const servers = [];
    if (isLanguagePackExtension(manifest)) {
      servers.push(...this.servers.filter((server) => server !== this.extensionManagementServerService.webExtensionManagementServer));
    } else {
      const [server] = this.getInstallableExtensionManagementServers(manifest);
      if (server) {
        servers.push(server);
      }
    }
    if (!servers.length) {
      const error = new Error(localize("cannot be installed", "Cannot install the '{0}' extension because it is not available in this setup.", gallery.displayName || gallery.name));
      error.name = ExtensionManagementErrorCode.Unsupported;
      throw error;
    }
    return servers;
  }
  getInstallableExtensionManagementServers(manifest) {
    if (this.servers.length === 1 && this.extensionManagementServerService.localExtensionManagementServer) {
      return [this.extensionManagementServerService.localExtensionManagementServer];
    }
    const servers = [];
    const extensionKind = this.extensionManifestPropertiesService.getExtensionKind(manifest);
    for (const kind of extensionKind) {
      if (kind === "ui" && this.extensionManagementServerService.localExtensionManagementServer) {
        servers.push(this.extensionManagementServerService.localExtensionManagementServer);
      }
      if (kind === "workspace" && this.extensionManagementServerService.remoteExtensionManagementServer) {
        servers.push(this.extensionManagementServerService.remoteExtensionManagementServer);
      }
      if (kind === "web" && this.extensionManagementServerService.webExtensionManagementServer) {
        servers.push(this.extensionManagementServerService.webExtensionManagementServer);
      }
    }
    if (this.extensionManagementServerService.localExtensionManagementServer && !servers.includes(this.extensionManagementServerService.localExtensionManagementServer)) {
      servers.push(this.extensionManagementServerService.localExtensionManagementServer);
    }
    return servers;
  }
  isExtensionsSyncEnabled() {
    return this.userDataSyncEnablementService.isEnabled() && this.userDataSyncEnablementService.isResourceEnabled(SyncResource.Extensions);
  }
  async hasToFlagExtensionsMachineScoped(extensions) {
    if (this.isExtensionsSyncEnabled()) {
      const { result } = await this.dialogService.prompt({
        type: Severity.Info,
        message: extensions.length === 1 ? localize("install extension", "Install Extension") : localize("install extensions", "Install Extensions"),
        detail: extensions.length === 1 ? localize("install single extension", "Would you like to install and synchronize '{0}' extension across your devices?", extensions[0].displayName) : localize("install multiple extensions", "Would you like to install and synchronize extensions across your devices?"),
        buttons: [
          {
            label: localize({ key: "install", comment: ["&& denotes a mnemonic"] }, "&&Install"),
            run: () => false
          },
          {
            label: localize({ key: "install and do no sync", comment: ["&& denotes a mnemonic"] }, "Install (Do &&not sync)"),
            run: () => true
          }
        ],
        cancelButton: {
          run: () => {
            throw new CancellationError();
          }
        }
      });
      return result;
    }
    return false;
  }
  getExtensionsControlManifest() {
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getExtensionsControlManifest();
    }
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getExtensionsControlManifest();
    }
    if (this.extensionManagementServerService.webExtensionManagementServer) {
      return this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.getExtensionsControlManifest();
    }
    return this.extensionGalleryService.getExtensionsControlManifest();
  }
  getServer(extension) {
    if (extension.isWorkspaceScoped) {
      return this.getWorkspaceExtensionsServer();
    }
    return this.extensionManagementServerService.getExtensionManagementServer(extension);
  }
  getWorkspaceExtensionsServer() {
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      return this.extensionManagementServerService.remoteExtensionManagementServer;
    }
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      return this.extensionManagementServerService.localExtensionManagementServer;
    }
    if (this.extensionManagementServerService.webExtensionManagementServer) {
      return this.extensionManagementServerService.webExtensionManagementServer;
    }
    throw new Error("No extension server found");
  }
  async requestPublisherTrust(extensions) {
    const manifests = await Promise.all(extensions.map(async ({ extension }) => {
      const manifest = await this.extensionGalleryService.getManifest(extension, CancellationToken.None);
      if (!manifest) {
        throw new Error(localize("Manifest is not found", "Installing Extension {0} failed: Manifest is not found.", extension.displayName || extension.name));
      }
      return manifest;
    }));
    await this.checkForTrustedPublishers(extensions.map((e, index) => ({ extension: e.extension, manifest: manifests[index], checkForPackAndDependencies: !e.options?.donotIncludePackAndDependencies })));
  }
  async checkForTrustedPublishers(extensions) {
    const untrustedExtensions = [];
    const untrustedExtensionManifests = [];
    const manifestsToGetOtherUntrustedPublishers = [];
    for (const { extension, manifest, checkForPackAndDependencies } of extensions) {
      if (!extension.private && !this.isPublisherTrusted(extension)) {
        untrustedExtensions.push(extension);
        untrustedExtensionManifests.push(manifest);
        if (checkForPackAndDependencies) {
          manifestsToGetOtherUntrustedPublishers.push(manifest);
        }
      }
    }
    if (!untrustedExtensions.length) {
      return;
    }
    const otherUntrustedPublishers = manifestsToGetOtherUntrustedPublishers.length ? await this.getOtherUntrustedPublishers(manifestsToGetOtherUntrustedPublishers) : [];
    const allPublishers = [...distinct(untrustedExtensions, (e) => e.publisher), ...otherUntrustedPublishers];
    const unverfiiedPublishers = allPublishers.filter((p) => !p.publisherDomain?.verified);
    const verifiedPublishers = allPublishers.filter((p) => p.publisherDomain?.verified);
    const installButton = {
      label: allPublishers.length > 1 ? localize({ key: "trust publishers and install", comment: ["&& denotes a mnemonic"] }, "Trust Publishers & &&Install") : localize({ key: "trust and install", comment: ["&& denotes a mnemonic"] }, "Trust Publisher & &&Install"),
      run: () => {
        this.telemetryService.publicLog2("extensions:trustPublisher", { action: "trust", extensionId: untrustedExtensions.map((e) => e.identifier.id).join(",") });
        this.trustPublishers(...allPublishers.map((p) => ({ publisher: p.publisher, publisherDisplayName: p.publisherDisplayName })));
      }
    };
    const learnMoreButton = {
      label: localize({ key: "learnMore", comment: ["&& denotes a mnemonic"] }, "&&Learn More"),
      run: () => {
        this.telemetryService.publicLog2("extensions:trustPublisher", { action: "learn", extensionId: untrustedExtensions.map((e) => e.identifier.id).join(",") });
        this.instantiationService.invokeFunction((accessor) => accessor.get(ICommandService).executeCommand("vscode.open", URI.parse("https://aka.ms/vscode-extension-security")));
        throw new CancellationError();
      }
    };
    const getPublisherLink = ({ publisherDisplayName, publisherLink }) => {
      return publisherLink ? `[${publisherDisplayName}](${publisherLink})` : publisherDisplayName;
    };
    const unverifiedLink = "https://aka.ms/vscode-verify-publisher";
    const title = allPublishers.length === 1 ? localize("checkTrustedPublisherTitle", 'Do you trust the publisher "{0}"?', allPublishers[0].publisherDisplayName) : allPublishers.length === 2 ? localize("checkTwoTrustedPublishersTitle", 'Do you trust publishers "{0}" and "{1}"?', allPublishers[0].publisherDisplayName, allPublishers[1].publisherDisplayName) : localize("checkAllTrustedPublishersTitle", 'Do you trust the publisher "{0}" and {1} others?', allPublishers[0].publisherDisplayName, allPublishers.length - 1);
    const customMessage = new MarkdownString("", { supportThemeIcons: true, isTrusted: true });
    if (untrustedExtensions.length === 1) {
      const extension = untrustedExtensions[0];
      const manifest = untrustedExtensionManifests[0];
      if (otherUntrustedPublishers.length) {
        customMessage.appendMarkdown(localize("extension published by message", "The extension {0} is published by {1}.", `[${extension.displayName}](${extension.detailsLink})`, getPublisherLink(extension)));
        customMessage.appendMarkdown("&nbsp;");
        const commandUri = createCommandUri("extension.open", extension.identifier.id, manifest.extensionPack?.length ? "extensionPack" : "dependencies").toString();
        if (otherUntrustedPublishers.length === 1) {
          customMessage.appendMarkdown(localize("singleUntrustedPublisher", "Installing this extension will also install [extensions]({0}) published by {1}.", commandUri, getPublisherLink(otherUntrustedPublishers[0])));
        } else {
          customMessage.appendMarkdown(localize("message3", "Installing this extension will also install [extensions]({0}) published by {1} and {2}.", commandUri, otherUntrustedPublishers.slice(0, otherUntrustedPublishers.length - 1).map((p) => getPublisherLink(p)).join(", "), getPublisherLink(otherUntrustedPublishers[otherUntrustedPublishers.length - 1])));
        }
        customMessage.appendMarkdown("&nbsp;");
        customMessage.appendMarkdown(localize("firstTimeInstallingMessage", "This is the first time you're installing extensions from these publishers."));
      } else {
        customMessage.appendMarkdown(localize("message1", "The extension {0} is published by {1}. This is the first extension you're installing from this publisher.", `[${extension.displayName}](${extension.detailsLink})`, getPublisherLink(extension)));
      }
    } else {
      customMessage.appendMarkdown(localize("multiInstallMessage", "This is the first time you're installing extensions from publishers {0} and {1}.", getPublisherLink(allPublishers[0]), getPublisherLink(allPublishers[allPublishers.length - 1])));
    }
    if (verifiedPublishers.length || unverfiiedPublishers.length === 1) {
      for (const publisher of verifiedPublishers) {
        customMessage.appendText("\n");
        const publisherVerifiedMessage = localize("verifiedPublisherWithName", "{0} has verified ownership of {1}.", getPublisherLink(publisher), `[$(link-external) ${URI.parse(publisher.publisherDomain.link).authority}](${publisher.publisherDomain.link})`);
        customMessage.appendMarkdown(`$(${verifiedPublisherIcon.id})&nbsp;${publisherVerifiedMessage}`);
      }
      if (unverfiiedPublishers.length) {
        customMessage.appendText("\n");
        if (unverfiiedPublishers.length === 1) {
          customMessage.appendMarkdown(`$(${Codicon.unverified.id})&nbsp;${localize("unverifiedPublisherWithName", "{0} is [**not** verified]({1}).", getPublisherLink(unverfiiedPublishers[0]), unverifiedLink)}`);
        } else {
          customMessage.appendMarkdown(`$(${Codicon.unverified.id})&nbsp;${localize("unverifiedPublishers", "{0} and {1} are [**not** verified]({2}).", unverfiiedPublishers.slice(0, unverfiiedPublishers.length - 1).map((p) => getPublisherLink(p)).join(", "), getPublisherLink(unverfiiedPublishers[unverfiiedPublishers.length - 1]), unverifiedLink)}`);
        }
      }
    } else {
      customMessage.appendText("\n");
      customMessage.appendMarkdown(`$(${Codicon.unverified.id})&nbsp;${localize("allUnverifed", "All publishers are [**not** verified]({0}).", unverifiedLink)}`);
    }
    customMessage.appendText("\n");
    if (allPublishers.length > 1) {
      customMessage.appendMarkdown(localize("message4", "{0} has no control over the behavior of third-party extensions, including how they manage your personal data. Proceed only if you trust the publishers.", this.productService.nameLong));
    } else {
      customMessage.appendMarkdown(localize("message2", "{0} has no control over the behavior of third-party extensions, including how they manage your personal data. Proceed only if you trust the publisher.", this.productService.nameLong));
    }
    await this.dialogService.prompt({
      message: title,
      type: Severity.Warning,
      buttons: [installButton, learnMoreButton],
      cancelButton: {
        run: () => {
          this.telemetryService.publicLog2("extensions:trustPublisher", { action: "cancel", extensionId: untrustedExtensions.map((e) => e.identifier.id).join(",") });
          throw new CancellationError();
        }
      },
      custom: {
        markdownDetails: [{ markdown: customMessage, classes: ["extensions-management-publisher-trust-dialog"] }]
      }
    });
  }
  async getOtherUntrustedPublishers(manifests) {
    const extensionIds = /* @__PURE__ */ new Set();
    for (const manifest of manifests) {
      for (const id of [...manifest.extensionPack ?? [], ...manifest.extensionDependencies ?? []]) {
        const [publisherId] = id.split(".");
        if (publisherId.toLowerCase() === manifest.publisher.toLowerCase()) {
          continue;
        }
        if (this.isPublisherUserTrusted(publisherId.toLowerCase())) {
          continue;
        }
        extensionIds.add(id.toLowerCase());
      }
    }
    if (!extensionIds.size) {
      return [];
    }
    const extensions = /* @__PURE__ */ new Map();
    await this.getDependenciesAndPackedExtensionsRecursively([...extensionIds], extensions, CancellationToken.None);
    const publishers = /* @__PURE__ */ new Map();
    for (const [, extension] of extensions) {
      if (extension.private || this.isPublisherTrusted(extension)) {
        continue;
      }
      publishers.set(extension.publisherDisplayName, extension);
    }
    return [...publishers.values()];
  }
  async getDependenciesAndPackedExtensionsRecursively(toGet, result, token) {
    if (toGet.length === 0) {
      return;
    }
    const extensions = await this.extensionGalleryService.getExtensions(toGet.map((id) => ({ id })), token);
    for (let idx = 0; idx < extensions.length; idx++) {
      const extension = extensions[idx];
      result.set(extension.identifier.id.toLowerCase(), extension);
    }
    toGet = [];
    for (const extension of extensions) {
      if (isNonEmptyArray(extension.properties.dependencies)) {
        for (const id of extension.properties.dependencies) {
          if (!result.has(id.toLowerCase())) {
            toGet.push(id);
          }
        }
      }
      if (isNonEmptyArray(extension.properties.extensionPack)) {
        for (const id of extension.properties.extensionPack) {
          if (!result.has(id.toLowerCase())) {
            toGet.push(id);
          }
        }
      }
    }
    return this.getDependenciesAndPackedExtensionsRecursively(toGet, result, token);
  }
  async checkForWorkspaceTrust(manifest, requireTrust) {
    if (requireTrust || this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(manifest) === false) {
      const buttons = [];
      buttons.push({ label: localize("extensionInstallWorkspaceTrustButton", "Trust Workspace & Install"), type: "ContinueWithTrust" });
      if (!requireTrust) {
        buttons.push({ label: localize("extensionInstallWorkspaceTrustContinueButton", "Install"), type: "ContinueWithoutTrust" });
      }
      buttons.push({ label: localize("extensionInstallWorkspaceTrustManageButton", "Learn More"), type: "Manage" });
      const trustState = await this.workspaceTrustRequestService.requestWorkspaceTrust({
        message: localize("extensionInstallWorkspaceTrustMessage", "Enabling this extension requires a trusted workspace."),
        buttons
      });
      if (trustState === void 0) {
        throw new CancellationError();
      }
    }
  }
  async checkInstallingExtensionOnWeb(extension, manifest) {
    if (this.servers.length !== 1 || this.servers[0] !== this.extensionManagementServerService.webExtensionManagementServer) {
      return;
    }
    const nonWebExtensions = [];
    if (manifest.extensionPack?.length) {
      const extensions = await this.extensionGalleryService.getExtensions(manifest.extensionPack.map((id) => ({ id })), CancellationToken.None);
      for (const extension2 of extensions) {
        if (await this.servers[0].extensionManagementService.canInstall(extension2) !== true) {
          nonWebExtensions.push(extension2);
        }
      }
      if (nonWebExtensions.length && nonWebExtensions.length === extensions.length) {
        throw new ExtensionManagementError("Not supported in Web", ExtensionManagementErrorCode.Unsupported);
      }
    }
    const productName = localize("VS Code for Web", "{0} for the Web", this.productService.nameLong);
    const virtualWorkspaceSupport = this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(manifest);
    const virtualWorkspaceSupportReason = getWorkspaceSupportTypeMessage(manifest.capabilities?.virtualWorkspaces);
    const hasLimitedSupport = virtualWorkspaceSupport === "limited" || !!virtualWorkspaceSupportReason;
    if (!nonWebExtensions.length && !hasLimitedSupport) {
      return;
    }
    const limitedSupportMessage = localize("limited support", "'{0}' has limited functionality in {1}.", extension.displayName || extension.identifier.id, productName);
    let message;
    let buttons = [];
    let detail;
    const installAnywayButton = {
      label: localize({ key: "install anyways", comment: ["&& denotes a mnemonic"] }, "&&Install Anyway"),
      run: () => {
      }
    };
    const showExtensionsButton = {
      label: localize({ key: "showExtensions", comment: ["&& denotes a mnemonic"] }, "&&Show Extensions"),
      run: () => this.instantiationService.invokeFunction((accessor) => accessor.get(ICommandService).executeCommand("extension.open", extension.identifier.id, "extensionPack"))
    };
    if (nonWebExtensions.length && hasLimitedSupport) {
      message = limitedSupportMessage;
      detail = `${virtualWorkspaceSupportReason ? `${virtualWorkspaceSupportReason}
` : ""}${localize("non web extensions detail", "Contains extensions which are not supported.")}`;
      buttons = [
        installAnywayButton,
        showExtensionsButton
      ];
    } else if (hasLimitedSupport) {
      message = limitedSupportMessage;
      detail = virtualWorkspaceSupportReason || void 0;
      buttons = [installAnywayButton];
    } else {
      message = localize("non web extensions", "'{0}' contains extensions which are not supported in {1}.", extension.displayName || extension.identifier.id, productName);
      buttons = [
        installAnywayButton,
        showExtensionsButton
      ];
    }
    await this.dialogService.prompt({
      type: Severity.Info,
      message,
      detail,
      buttons,
      cancelButton: {
        run: () => {
          throw new CancellationError();
        }
      }
    });
  }
  getTargetPlatform() {
    if (!this._targetPlatformPromise) {
      this._targetPlatformPromise = computeTargetPlatform(this.fileService, this.logService);
    }
    return this._targetPlatformPromise;
  }
  async cleanUp() {
    await Promise.allSettled(this.servers.map((server) => server.extensionManagementService.cleanUp()));
  }
  toggleApplicationScope(extension, fromProfileLocation) {
    const server = this.getServer(extension);
    if (server) {
      return server.extensionManagementService.toggleApplicationScope(extension, fromProfileLocation);
    }
    throw new Error("Not Supported");
  }
  copyExtensions(from, to) {
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      throw new Error("Not Supported");
    }
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.copyExtensions(from, to);
    }
    if (this.extensionManagementServerService.webExtensionManagementServer) {
      return this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.copyExtensions(from, to);
    }
    return Promise.resolve();
  }
  registerParticipant() {
    throw new Error("Not Supported");
  }
  installExtensionsFromProfile(extensions, fromProfileLocation, toProfileLocation) {
    throw new Error("Not Supported");
  }
  isPublisherTrusted(extension) {
    const publisher = extension.publisher.toLowerCase();
    if (this.defaultTrustedPublishers.includes(publisher) || this.defaultTrustedPublishers.includes(extension.publisherDisplayName.toLowerCase())) {
      return true;
    }
    if (this.allowedExtensionsService.allowedExtensionsConfigValue && this.allowedExtensionsService.isAllowed(extension)) {
      return true;
    }
    return this.isPublisherUserTrusted(publisher);
  }
  isPublisherUserTrusted(publisher) {
    const trustedPublishers = this.getTrustedPublishersFromStorage();
    return !!trustedPublishers[publisher];
  }
  getTrustedPublishers() {
    const trustedPublishers = this.getTrustedPublishersFromStorage();
    return Object.keys(trustedPublishers).map((publisher) => trustedPublishers[publisher]);
  }
  trustPublishers(...publishers) {
    const trustedPublishers = this.getTrustedPublishersFromStorage();
    for (const publisher of publishers) {
      trustedPublishers[publisher.publisher.toLowerCase()] = publisher;
    }
    this.storageService.store(TrustedPublishersStorageKey, JSON.stringify(trustedPublishers), StorageScope.APPLICATION, StorageTarget.USER);
  }
  untrustPublishers(...publishers) {
    const trustedPublishers = this.getTrustedPublishersFromStorage();
    for (const publisher of publishers) {
      delete trustedPublishers[publisher.toLowerCase()];
    }
    this.storageService.store(TrustedPublishersStorageKey, JSON.stringify(trustedPublishers), StorageScope.APPLICATION, StorageTarget.USER);
  }
  getTrustedPublishersFromStorage() {
    const trustedPublishers = this.storageService.getObject(TrustedPublishersStorageKey, StorageScope.APPLICATION, {});
    if (Array.isArray(trustedPublishers)) {
      this.storageService.remove(TrustedPublishersStorageKey, StorageScope.APPLICATION);
      return /* @__PURE__ */ Object.create(null);
    }
    return Object.keys(trustedPublishers).reduce((result, publisher) => {
      result[publisher.toLowerCase()] = trustedPublishers[publisher];
      return result;
    }, /* @__PURE__ */ Object.create(null));
  }
};
ExtensionManagementService = __decorateClass([
  __decorateParam(0, IExtensionManagementServerService),
  __decorateParam(1, IExtensionGalleryService),
  __decorateParam(2, IUserDataProfileService),
  __decorateParam(3, IUserDataProfilesService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IProductService),
  __decorateParam(6, IDownloadService),
  __decorateParam(7, IUserDataSyncEnablementService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IWorkspaceTrustRequestService),
  __decorateParam(10, IExtensionManifestPropertiesService),
  __decorateParam(11, IFileService),
  __decorateParam(12, ILogService),
  __decorateParam(13, IInstantiationService),
  __decorateParam(14, IExtensionsScannerService),
  __decorateParam(15, IAllowedExtensionsService),
  __decorateParam(16, IStorageService),
  __decorateParam(17, ITelemetryService)
], ExtensionManagementService);
let WorkspaceExtensionsManagementService = class extends Disposable {
  constructor(fileService, logService, workspaceService, extensionsScannerService, storageService, uriIdentityService, telemetryService) {
    super();
    this.fileService = fileService;
    this.logService = logService;
    this.workspaceService = workspaceService;
    this.extensionsScannerService = extensionsScannerService;
    this.storageService = storageService;
    this.uriIdentityService = uriIdentityService;
    this.telemetryService = telemetryService;
    this._onDidChangeInvalidExtensions = this._register(new Emitter());
    this.onDidChangeInvalidExtensions = this._onDidChangeInvalidExtensions.event;
    this.extensions = [];
    this.invalidExtensionWatchers = this._register(new DisposableStore());
    this._register(Event.throttle(this.fileService.onDidFilesChange, (last, e) => {
      (last = last ?? []).push(e);
      return last;
    }, 1e3, false)((events) => {
      const changedInvalidExtensions = this.extensions.filter((extension) => !extension.isValid && events.some((e) => e.affects(extension.location)));
      if (changedInvalidExtensions.length) {
        this.checkExtensionsValidity(changedInvalidExtensions);
      }
    }));
    this.initializePromise = this.initialize();
  }
  async initialize() {
    const existingLocations = this.getInstalledWorkspaceExtensionsLocations();
    if (!existingLocations.length) {
      return;
    }
    await Promise.allSettled(existingLocations.map(async (location) => {
      if (!this.workspaceService.isInsideWorkspace(location)) {
        this.logService.info(`Removing the workspace extension ${location.toString()} as it is not inside the workspace`);
        return;
      }
      if (!await this.fileService.exists(location)) {
        this.logService.info(`Removing the workspace extension ${location.toString()} as it does not exist`);
        return;
      }
      try {
        const extension = await this.scanWorkspaceExtension(location);
        if (extension) {
          this.extensions.push(extension);
        } else {
          this.logService.info(`Skipping workspace extension ${location.toString()} as it does not exist`);
        }
      } catch (error) {
        this.logService.error("Skipping the workspace extension", location.toString(), error);
      }
    }));
    this.saveWorkspaceExtensions();
  }
  watchInvalidExtensions() {
    this.invalidExtensionWatchers.clear();
    for (const extension of this.extensions) {
      if (!extension.isValid) {
        this.invalidExtensionWatchers.add(this.fileService.watch(extension.location));
      }
    }
  }
  async checkExtensionsValidity(extensions) {
    const validExtensions = [];
    await Promise.all(extensions.map(async (extension) => {
      const newExtension = await this.scanWorkspaceExtension(extension.location);
      if (newExtension?.isValid) {
        validExtensions.push(newExtension);
      }
    }));
    let changed = false;
    for (const extension of validExtensions) {
      const index = this.extensions.findIndex((e) => this.uriIdentityService.extUri.isEqual(e.location, extension.location));
      if (index !== -1) {
        changed = true;
        this.extensions.splice(index, 1, extension);
      }
    }
    if (changed) {
      this.saveWorkspaceExtensions();
      this._onDidChangeInvalidExtensions.fire(validExtensions);
    }
  }
  async getInstalled(includeInvalid) {
    await this.initializePromise;
    return this.extensions.filter((e) => includeInvalid || e.isValid);
  }
  async install(extension) {
    await this.initializePromise;
    const workspaceExtension = await this.scanWorkspaceExtension(extension.location);
    if (!workspaceExtension) {
      throw new Error("Cannot install the extension as it does not exist.");
    }
    const existingExtensionIndex = this.extensions.findIndex((e) => areSameExtensions(e.identifier, extension.identifier));
    if (existingExtensionIndex === -1) {
      this.extensions.push(workspaceExtension);
    } else {
      this.extensions.splice(existingExtensionIndex, 1, workspaceExtension);
    }
    this.saveWorkspaceExtensions();
    this.telemetryService.publicLog2("workspaceextension:install");
    return workspaceExtension;
  }
  async uninstall(extension) {
    await this.initializePromise;
    const existingExtensionIndex = this.extensions.findIndex((e) => areSameExtensions(e.identifier, extension.identifier));
    if (existingExtensionIndex !== -1) {
      this.extensions.splice(existingExtensionIndex, 1);
      this.saveWorkspaceExtensions();
    }
    this.telemetryService.publicLog2("workspaceextension:uninstall");
  }
  getInstalledWorkspaceExtensionsLocations() {
    const locations = [];
    try {
      const parsed = JSON.parse(this.storageService.get(WorkspaceExtensionsManagementService.WORKSPACE_EXTENSIONS_KEY, StorageScope.WORKSPACE, "[]"));
      if (Array.isArray(locations)) {
        for (const location of parsed) {
          if (isString(location)) {
            if (this.workspaceService.getWorkbenchState() === WorkbenchState.FOLDER) {
              locations.push(this.workspaceService.getWorkspace().folders[0].toResource(location));
            } else {
              this.logService.warn(`Invalid value for 'extensions' in workspace storage: ${location}`);
            }
          } else {
            locations.push(URI.revive(location));
          }
        }
      } else {
        this.logService.warn(`Invalid value for 'extensions' in workspace storage: ${locations}`);
      }
    } catch (error) {
      this.logService.warn(`Error parsing workspace extensions locations: ${getErrorMessage(error)}`);
    }
    return locations;
  }
  saveWorkspaceExtensions() {
    const locations = this.extensions.map((extension) => extension.location);
    if (this.workspaceService.getWorkbenchState() === WorkbenchState.FOLDER) {
      this.storageService.store(
        WorkspaceExtensionsManagementService.WORKSPACE_EXTENSIONS_KEY,
        JSON.stringify(coalesce(locations.map((location) => this.uriIdentityService.extUri.relativePath(this.workspaceService.getWorkspace().folders[0].uri, location)))),
        StorageScope.WORKSPACE,
        StorageTarget.MACHINE
      );
    } else {
      this.storageService.store(WorkspaceExtensionsManagementService.WORKSPACE_EXTENSIONS_KEY, JSON.stringify(locations), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
    this.watchInvalidExtensions();
  }
  async scanWorkspaceExtension(location) {
    const scannedExtension = await this.extensionsScannerService.scanExistingExtension(location, ExtensionType.User, { includeInvalid: true });
    return scannedExtension ? this.toLocalWorkspaceExtension(scannedExtension) : null;
  }
  async toLocalWorkspaceExtension(extension) {
    const stat = await this.fileService.resolve(extension.location);
    let readmeUrl;
    let changelogUrl;
    if (stat.children) {
      readmeUrl = stat.children.find(({ name }) => /^readme(\.txt|\.md|)$/i.test(name))?.resource;
      changelogUrl = stat.children.find(({ name }) => /^changelog(\.txt|\.md|)$/i.test(name))?.resource;
    }
    const validations = [...extension.validations];
    let isValid = extension.isValid;
    if (extension.manifest.main) {
      if (!await this.fileService.exists(this.uriIdentityService.extUri.joinPath(extension.location, extension.manifest.main))) {
        isValid = false;
        validations.push([Severity.Error, localize("main.notFound", "Cannot activate because {0} not found", extension.manifest.main)]);
      }
    }
    return {
      identifier: extension.identifier,
      type: extension.type,
      isBuiltin: extension.isBuiltin || !!extension.metadata?.isBuiltin,
      location: extension.location,
      manifest: extension.manifest,
      targetPlatform: extension.targetPlatform,
      validations,
      isValid,
      readmeUrl,
      changelogUrl,
      publisherDisplayName: extension.metadata?.publisherDisplayName,
      publisherId: extension.metadata?.publisherId || null,
      isApplicationScoped: !!extension.metadata?.isApplicationScoped,
      isMachineScoped: !!extension.metadata?.isMachineScoped,
      isPreReleaseVersion: !!extension.metadata?.isPreReleaseVersion,
      hasPreReleaseVersion: !!extension.metadata?.hasPreReleaseVersion,
      preRelease: !!extension.metadata?.preRelease,
      installedTimestamp: extension.metadata?.installedTimestamp,
      updated: !!extension.metadata?.updated,
      pinned: !!extension.metadata?.pinned,
      forceAutoUpdate: false,
      isWorkspaceScoped: true,
      private: false,
      source: "resource",
      size: extension.metadata?.size ?? 0
    };
  }
};
WorkspaceExtensionsManagementService.WORKSPACE_EXTENSIONS_KEY = "workspaceExtensions.locations";
WorkspaceExtensionsManagementService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IExtensionsScannerService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, ITelemetryService)
], WorkspaceExtensionsManagementService);
export {
  ExtensionManagementService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50LCBFdmVudE11bHRpcGxleGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHtcblx0SUxvY2FsRXh0ZW5zaW9uLCBJR2FsbGVyeUV4dGVuc2lvbiwgSUV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0LCBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIEluc3RhbGxPcHRpb25zLCBVbmluc3RhbGxPcHRpb25zLCBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0LCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUsIE1ldGFkYXRhLCBJbnN0YWxsT3BlcmF0aW9uLCBFWFRFTlNJT05fSU5TVEFMTF9TT1VSQ0VfQ09OVEVYVCwgSW5zdGFsbEV4dGVuc2lvbkluZm8sXG5cdElQcm9kdWN0VmVyc2lvbixcblx0RXh0ZW5zaW9uSW5zdGFsbFNvdXJjZSxcblx0RGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEsXG5cdFVuaW5zdGFsbEV4dGVuc2lvbkluZm8sXG5cdElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdEVYVEVOU0lPTl9JTlNUQUxMX1NLSVBfUFVCTElTSEVSX1RSVVNUX0NPTlRFWFQsXG59IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRGlkQ2hhbmdlUHJvZmlsZUZvclNlcnZlckV2ZW50LCBEaWRVbmluc3RhbGxFeHRlbnNpb25PblNlcnZlckV2ZW50LCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLCBJbnN0YWxsRXh0ZW5zaW9uT25TZXJ2ZXJFdmVudCwgSVB1Ymxpc2hlckluZm8sIElSZXNvdXJjZUV4dGVuc2lvbiwgSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBVbmluc3RhbGxFeHRlbnNpb25PblNlcnZlckV2ZW50IH0gZnJvbSAnLi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblR5cGUsIGlzTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uTWFuaWZlc3QsIGdldFdvcmtzcGFjZVN1cHBvcnRUeXBlTWVzc2FnZSwgVGFyZ2V0UGxhdGZvcm0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucywgY29tcHV0ZVRhcmdldFBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSURvd25sb2FkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Rvd25sb2FkL2NvbW1vbi9kb3dubG9hZC5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSwgZGlzdGluY3QsIGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSwgSVByb21wdEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSwgU3luY1Jlc291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSwgV29ya3NwYWNlVHJ1c3RSZXF1ZXN0QnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcsIGlzVW5kZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgRmlsZUNoYW5nZXNFdmVudCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLCBJU2Nhbm5lZEV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbnNTY2FubmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbW1hbmRVcmksIElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyB2ZXJpZmllZFB1Ymxpc2hlckljb24gfSBmcm9tICcuL2V4dGVuc2lvbnNJY29ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tb250RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9hYnN0cmFjdEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmpzJztcblxuY29uc3QgVHJ1c3RlZFB1Ymxpc2hlcnNTdG9yYWdlS2V5ID0gJ2V4dGVuc2lvbnMudHJ1c3RlZFB1Ymxpc2hlcnMnO1xuXG5mdW5jdGlvbiBpc0dhbGxlcnlFeHRlbnNpb24oZXh0ZW5zaW9uOiBJUmVzb3VyY2VFeHRlbnNpb24gfCBJR2FsbGVyeUV4dGVuc2lvbik6IGV4dGVuc2lvbiBpcyBJR2FsbGVyeUV4dGVuc2lvbiB7XG5cdHJldHVybiBleHRlbnNpb24udHlwZSA9PT0gJ2dhbGxlcnknO1xufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBDb21tb250RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgaW1wbGVtZW50cyBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdFRydXN0ZWRQdWJsaXNoZXJzOiByZWFkb25seSBzdHJpbmdbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkluc3RhbGxFeHRlbnNpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJbnN0YWxsRXh0ZW5zaW9uT25TZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uSW5zdGFsbEV4dGVuc2lvbjogRXZlbnQ8SW5zdGFsbEV4dGVuc2lvbk9uU2VydmVyRXZlbnQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW5zdGFsbEV4dGVuc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10+KCkpO1xuXHRyZWFkb25seSBvbkRpZEluc3RhbGxFeHRlbnNpb25zOiBFdmVudDxyZWFkb25seSBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uVW5pbnN0YWxsRXh0ZW5zaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VW5pbnN0YWxsRXh0ZW5zaW9uT25TZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uVW5pbnN0YWxsRXh0ZW5zaW9uOiBFdmVudDxVbmluc3RhbGxFeHRlbnNpb25PblNlcnZlckV2ZW50PjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPERpZFVuaW5zdGFsbEV4dGVuc2lvbk9uU2VydmVyRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVuaW5zdGFsbEV4dGVuc2lvbjogRXZlbnQ8RGlkVW5pbnN0YWxsRXh0ZW5zaW9uT25TZXJ2ZXJFdmVudD47XG5cblx0cmVhZG9ubHkgb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YTogRXZlbnQ8RGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGE+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUHJvZmlsZUF3YXJlSW5zdGFsbEV4dGVuc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10+KCkpO1xuXHRyZWFkb25seSBvblByb2ZpbGVBd2FyZURpZEluc3RhbGxFeHRlbnNpb25zOiBFdmVudDxyZWFkb25seSBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUHJvZmlsZUF3YXJlVW5pbnN0YWxsRXh0ZW5zaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RGlkVW5pbnN0YWxsRXh0ZW5zaW9uT25TZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvZmlsZUF3YXJlRGlkVW5pbnN0YWxsRXh0ZW5zaW9uOiBFdmVudDxEaWRVbmluc3RhbGxFeHRlbnNpb25PblNlcnZlckV2ZW50PjtcblxuXHRyZWFkb25seSBvblByb2ZpbGVBd2FyZURpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhOiBFdmVudDxEaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YT47XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm9maWxlOiBFdmVudDxEaWRDaGFuZ2VQcm9maWxlRm9yU2VydmVyRXZlbnQ+O1xuXG5cdHJlYWRvbmx5IG9uRGlkRW5hYmxlRXh0ZW5zaW9uczogRXZlbnQ8SUxvY2FsRXh0ZW5zaW9uW10+O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBzZXJ2ZXJzOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcltdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogV29ya3NwYWNlRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElEb3dubG9hZFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGRvd25sb2FkU2VydmljZTogSURvd25sb2FkU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNTY2FubmVyU2VydmljZTogSUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSxcblx0XHRASUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHByb2R1Y3RTZXJ2aWNlLCBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5kZWZhdWx0VHJ1c3RlZFB1Ymxpc2hlcnMgPSBwcm9kdWN0U2VydmljZS50cnVzdGVkRXh0ZW5zaW9uUHVibGlzaGVycyA/PyBbXTtcblx0XHR0aGlzLndvcmtzcGFjZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3Jrc3BhY2VFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UpKTtcblx0XHR0aGlzLm9uRGlkRW5hYmxlRXh0ZW5zaW9ucyA9IHRoaXMud29ya3NwYWNlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VJbnZhbGlkRXh0ZW5zaW9ucztcblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0dGhpcy5zZXJ2ZXJzLnB1c2godGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHR0aGlzLnNlcnZlcnMucHVzaCh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHR0aGlzLnNlcnZlcnMucHVzaCh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9uSW5zdGFsbEV4dGVuc2lvbkV2ZW50TXVsdGlwbGV4ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRXZlbnRNdWx0aXBsZXhlcjxJbnN0YWxsRXh0ZW5zaW9uT25TZXJ2ZXJFdmVudD4oKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25JbnN0YWxsRXh0ZW5zaW9uRXZlbnRNdWx0aXBsZXhlci5hZGQodGhpcy5fb25JbnN0YWxsRXh0ZW5zaW9uLmV2ZW50KSk7XG5cdFx0dGhpcy5vbkluc3RhbGxFeHRlbnNpb24gPSBvbkluc3RhbGxFeHRlbnNpb25FdmVudE11bHRpcGxleGVyLmV2ZW50O1xuXG5cdFx0Y29uc3Qgb25EaWRJbnN0YWxsRXh0ZW5zaW9uc0V2ZW50TXVsdGlwbGV4ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRXZlbnRNdWx0aXBsZXhlcjxyZWFkb25seSBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10+KCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkSW5zdGFsbEV4dGVuc2lvbnNFdmVudE11bHRpcGxleGVyLmFkZCh0aGlzLl9vbkRpZEluc3RhbGxFeHRlbnNpb25zLmV2ZW50KSk7XG5cdFx0dGhpcy5vbkRpZEluc3RhbGxFeHRlbnNpb25zID0gb25EaWRJbnN0YWxsRXh0ZW5zaW9uc0V2ZW50TXVsdGlwbGV4ZXIuZXZlbnQ7XG5cblx0XHRjb25zdCBvbkRpZFByb2ZpbGVBd2FyZUluc3RhbGxFeHRlbnNpb25zRXZlbnRNdWx0aXBsZXhlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFdmVudE11bHRpcGxleGVyPHJlYWRvbmx5IEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT4oKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRQcm9maWxlQXdhcmVJbnN0YWxsRXh0ZW5zaW9uc0V2ZW50TXVsdGlwbGV4ZXIuYWRkKHRoaXMuX29uRGlkUHJvZmlsZUF3YXJlSW5zdGFsbEV4dGVuc2lvbnMuZXZlbnQpKTtcblx0XHR0aGlzLm9uUHJvZmlsZUF3YXJlRGlkSW5zdGFsbEV4dGVuc2lvbnMgPSBvbkRpZFByb2ZpbGVBd2FyZUluc3RhbGxFeHRlbnNpb25zRXZlbnRNdWx0aXBsZXhlci5ldmVudDtcblxuXHRcdGNvbnN0IG9uVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnRNdWx0aXBsZXhlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFdmVudE11bHRpcGxleGVyPFVuaW5zdGFsbEV4dGVuc2lvbk9uU2VydmVyRXZlbnQ+KCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnRNdWx0aXBsZXhlci5hZGQodGhpcy5fb25Vbmluc3RhbGxFeHRlbnNpb24uZXZlbnQpKTtcblx0XHR0aGlzLm9uVW5pbnN0YWxsRXh0ZW5zaW9uID0gb25Vbmluc3RhbGxFeHRlbnNpb25FdmVudE11bHRpcGxleGVyLmV2ZW50O1xuXG5cdFx0Y29uc3Qgb25EaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudE11bHRpcGxleGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEV2ZW50TXVsdGlwbGV4ZXI8RGlkVW5pbnN0YWxsRXh0ZW5zaW9uT25TZXJ2ZXJFdmVudD4oKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudE11bHRpcGxleGVyLmFkZCh0aGlzLl9vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbi5ldmVudCkpO1xuXHRcdHRoaXMub25EaWRVbmluc3RhbGxFeHRlbnNpb24gPSBvbkRpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50TXVsdGlwbGV4ZXIuZXZlbnQ7XG5cblx0XHRjb25zdCBvbkRpZFByb2ZpbGVBd2FyZVVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50TXVsdGlwbGV4ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRXZlbnRNdWx0aXBsZXhlcjxEaWRVbmluc3RhbGxFeHRlbnNpb25PblNlcnZlckV2ZW50PigpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZFByb2ZpbGVBd2FyZVVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50TXVsdGlwbGV4ZXIuYWRkKHRoaXMuX29uRGlkUHJvZmlsZUF3YXJlVW5pbnN0YWxsRXh0ZW5zaW9uLmV2ZW50KSk7XG5cdFx0dGhpcy5vblByb2ZpbGVBd2FyZURpZFVuaW5zdGFsbEV4dGVuc2lvbiA9IG9uRGlkUHJvZmlsZUF3YXJlVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnRNdWx0aXBsZXhlci5ldmVudDtcblxuXHRcdGNvbnN0IG9uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhRXZlbnRNdWx0aXBsZXhlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFdmVudE11bHRpcGxleGVyPERpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhPigpKTtcblx0XHR0aGlzLm9uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEgPSBvbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYUV2ZW50TXVsdGlwbGV4ZXIuZXZlbnQ7XG5cblx0XHRjb25zdCBvbkRpZFByb2ZpbGVBd2FyZVVwZGF0ZUV4dGVuc2lvbk1ldGFkYUV2ZW50TXVsdGlwbGV4ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRXZlbnRNdWx0aXBsZXhlcjxEaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YT4oKSk7XG5cdFx0dGhpcy5vblByb2ZpbGVBd2FyZURpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhID0gb25EaWRQcm9maWxlQXdhcmVVcGRhdGVFeHRlbnNpb25NZXRhZGFFdmVudE11bHRpcGxleGVyLmV2ZW50O1xuXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VQcm9maWxlRXZlbnRNdWx0aXBsZXhlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFdmVudE11bHRpcGxleGVyPERpZENoYW5nZVByb2ZpbGVGb3JTZXJ2ZXJFdmVudD4oKSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZVByb2ZpbGUgPSBvbkRpZENoYW5nZVByb2ZpbGVFdmVudE11bHRpcGxleGVyLmV2ZW50O1xuXG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2YgdGhpcy5zZXJ2ZXJzKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihvbkluc3RhbGxFeHRlbnNpb25FdmVudE11bHRpcGxleGVyLmFkZChFdmVudC5tYXAoc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uSW5zdGFsbEV4dGVuc2lvbiwgZSA9PiAoeyAuLi5lLCBzZXJ2ZXIgfSkpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZEluc3RhbGxFeHRlbnNpb25zRXZlbnRNdWx0aXBsZXhlci5hZGQoc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkSW5zdGFsbEV4dGVuc2lvbnMpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkUHJvZmlsZUF3YXJlSW5zdGFsbEV4dGVuc2lvbnNFdmVudE11bHRpcGxleGVyLmFkZChzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25Qcm9maWxlQXdhcmVEaWRJbnN0YWxsRXh0ZW5zaW9ucykpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIob25Vbmluc3RhbGxFeHRlbnNpb25FdmVudE11bHRpcGxleGVyLmFkZChFdmVudC5tYXAoc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uVW5pbnN0YWxsRXh0ZW5zaW9uLCBlID0+ICh7IC4uLmUsIHNlcnZlciB9KSkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnRNdWx0aXBsZXhlci5hZGQoRXZlbnQubWFwKHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbiwgZSA9PiAoeyAuLi5lLCBzZXJ2ZXIgfSkpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZFByb2ZpbGVBd2FyZVVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50TXVsdGlwbGV4ZXIuYWRkKEV2ZW50Lm1hcChzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25Qcm9maWxlQXdhcmVEaWRVbmluc3RhbGxFeHRlbnNpb24sIGUgPT4gKHsgLi4uZSwgc2VydmVyIH0pKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGFFdmVudE11bHRpcGxleGVyLmFkZChzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRQcm9maWxlQXdhcmVVcGRhdGVFeHRlbnNpb25NZXRhZGFFdmVudE11bHRpcGxleGVyLmFkZChzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25Qcm9maWxlQXdhcmVEaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VQcm9maWxlRXZlbnRNdWx0aXBsZXhlci5hZGQoRXZlbnQubWFwKHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVByb2ZpbGUsIGUgPT4gKHsgLi4uZSwgc2VydmVyIH0pKSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25Qcm9maWxlQXdhcmVEaWRJbnN0YWxsRXh0ZW5zaW9ucyhyZXN1bHRzID0+IHtcblx0XHRcdGNvbnN0IHVudHJ1c3RlZFB1Ymxpc2hlcnMgPSBuZXcgTWFwPHN0cmluZywgSVB1Ymxpc2hlckluZm8+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXN1bHRzKSB7XG5cdFx0XHRcdGlmIChyZXN1bHQubG9jYWwgJiYgcmVzdWx0LnNvdXJjZSAmJiAhVVJJLmlzVXJpKHJlc3VsdC5zb3VyY2UpICYmICF0aGlzLmlzUHVibGlzaGVyVHJ1c3RlZChyZXN1bHQuc291cmNlKSkge1xuXHRcdFx0XHRcdHVudHJ1c3RlZFB1Ymxpc2hlcnMuc2V0KHJlc3VsdC5zb3VyY2UucHVibGlzaGVyLCB7IHB1Ymxpc2hlcjogcmVzdWx0LnNvdXJjZS5wdWJsaXNoZXIsIHB1Ymxpc2hlckRpc3BsYXlOYW1lOiByZXN1bHQuc291cmNlLnB1Ymxpc2hlckRpc3BsYXlOYW1lIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAodW50cnVzdGVkUHVibGlzaGVycy5zaXplKSB7XG5cdFx0XHRcdHRoaXMudHJ1c3RQdWJsaXNoZXJzKC4uLnVudHJ1c3RlZFB1Ymxpc2hlcnMudmFsdWVzKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIGdldEluc3RhbGxlZCh0eXBlPzogRXh0ZW5zaW9uVHlwZSwgcHJvZmlsZUxvY2F0aW9uPzogVVJJLCBwcm9kdWN0VmVyc2lvbj86IElQcm9kdWN0VmVyc2lvbik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCByZXN1bHQ6IElMb2NhbEV4dGVuc2lvbltdID0gW107XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwodGhpcy5zZXJ2ZXJzLm1hcChhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCh0eXBlLCBwcm9maWxlTG9jYXRpb24sIHByb2R1Y3RWZXJzaW9uKTtcblx0XHRcdGlmIChzZXJ2ZXIgPT09IHRoaXMuZ2V0V29ya3NwYWNlRXh0ZW5zaW9uc1NlcnZlcigpKSB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldEluc3RhbGxlZFdvcmtzcGFjZUV4dGVuc2lvbnModHJ1ZSk7XG5cdFx0XHRcdGluc3RhbGxlZC5wdXNoKC4uLndvcmtzcGFjZUV4dGVuc2lvbnMpO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goLi4uaW5zdGFsbGVkKTtcblx0XHR9KSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHVuaW5zdGFsbChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgb3B0aW9uczogVW5pbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnVuaW5zdGFsbEV4dGVuc2lvbnMoW3sgZXh0ZW5zaW9uLCBvcHRpb25zIH1dKTtcblx0fVxuXG5cdGFzeW5jIHVuaW5zdGFsbEV4dGVuc2lvbnMoZXh0ZW5zaW9uczogVW5pbnN0YWxsRXh0ZW5zaW9uSW5mb1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRXh0ZW5zaW9uczogSUxvY2FsRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRjb25zdCBncm91cGVkRXh0ZW5zaW9ucyA9IG5ldyBNYXA8SUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsIFVuaW5zdGFsbEV4dGVuc2lvbkluZm9bXT4oKTtcblxuXHRcdGNvbnN0IGFkZEV4dGVuc2lvblRvU2VydmVyID0gKHNlcnZlcjogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsIGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBvcHRpb25zPzogVW5pbnN0YWxsT3B0aW9ucykgPT4ge1xuXHRcdFx0bGV0IGV4dGVuc2lvbnMgPSBncm91cGVkRXh0ZW5zaW9ucy5nZXQoc2VydmVyKTtcblx0XHRcdGlmICghZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRncm91cGVkRXh0ZW5zaW9ucy5zZXQoc2VydmVyLCBleHRlbnNpb25zID0gW10pO1xuXHRcdFx0fVxuXHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKHsgZXh0ZW5zaW9uLCBvcHRpb25zIH0pO1xuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IHsgZXh0ZW5zaW9uLCBvcHRpb25zIH0gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKGV4dGVuc2lvbi5pc1dvcmtzcGFjZVNjb3BlZCkge1xuXHRcdFx0XHR3b3Jrc3BhY2VFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKGV4dGVuc2lvbik7XG5cdFx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbG9jYXRpb24gJHtleHRlbnNpb24ubG9jYXRpb24udG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdGFkZEV4dGVuc2lvblRvU2VydmVyKHNlcnZlciwgZXh0ZW5zaW9uLCBvcHRpb25zKTtcblx0XHRcdGlmICh0aGlzLnNlcnZlcnMubGVuZ3RoID4gMSAmJiBpc0xhbmd1YWdlUGFja0V4dGVuc2lvbihleHRlbnNpb24ubWFuaWZlc3QpKSB7XG5cdFx0XHRcdGNvbnN0IG90aGVyU2VydmVyczogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJbXSA9IHRoaXMuc2VydmVycy5maWx0ZXIocyA9PiBzICE9PSBzZXJ2ZXIpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IG90aGVyU2VydmVyIG9mIG90aGVyU2VydmVycykge1xuXHRcdFx0XHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IG90aGVyU2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCgpO1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkluT3RoZXJTZXJ2ZXIgPSBpbnN0YWxsZWQuZmluZChpID0+ICFpLmlzQnVpbHRpbiAmJiBhcmVTYW1lRXh0ZW5zaW9ucyhpLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvbkluT3RoZXJTZXJ2ZXIpIHtcblx0XHRcdFx0XHRcdGFkZEV4dGVuc2lvblRvU2VydmVyKG90aGVyU2VydmVyLCBleHRlbnNpb25Jbk90aGVyU2VydmVyLCBvcHRpb25zKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0Zm9yIChjb25zdCB3b3Jrc3BhY2VFeHRlbnNpb24gb2Ygd29ya3NwYWNlRXh0ZW5zaW9ucykge1xuXHRcdFx0cHJvbWlzZXMucHVzaCh0aGlzLnVuaW5zdGFsbEV4dGVuc2lvbkZyb21Xb3Jrc3BhY2Uod29ya3NwYWNlRXh0ZW5zaW9uKSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW3NlcnZlciwgZXh0ZW5zaW9uc10gb2YgZ3JvdXBlZEV4dGVuc2lvbnMuZW50cmllcygpKSB7XG5cdFx0XHRwcm9taXNlcy5wdXNoKHRoaXMudW5pbnN0YWxsSW5TZXJ2ZXIoc2VydmVyLCBleHRlbnNpb25zKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHByb21pc2VzKTtcblx0XHRjb25zdCBlcnJvcnMgPSByZXN1bHQuZmlsdGVyKHIgPT4gci5zdGF0dXMgPT09ICdyZWplY3RlZCcpLm1hcChyID0+IHIucmVhc29uKTtcblx0XHRpZiAoZXJyb3JzLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGVycm9ycy5tYXAoZSA9PiBlLm1lc3NhZ2UpLmpvaW4oJ1xcbicpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVuaW5zdGFsbEluU2VydmVyKHNlcnZlcjogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsIGV4dGVuc2lvbnM6IFVuaW5zdGFsbEV4dGVuc2lvbkluZm9bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChzZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0Zm9yIChjb25zdCB7IGV4dGVuc2lvbiB9IG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoRXh0ZW5zaW9uVHlwZS5Vc2VyKTtcblx0XHRcdFx0Y29uc3QgZGVwZW5kZW50Tm9uVUlFeHRlbnNpb25zID0gaW5zdGFsbGVkRXh0ZW5zaW9ucy5maWx0ZXIoaSA9PiAhdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLnByZWZlcnNFeGVjdXRlT25VSShpLm1hbmlmZXN0KVxuXHRcdFx0XHRcdCYmIGkubWFuaWZlc3QuZXh0ZW5zaW9uRGVwZW5kZW5jaWVzICYmIGkubWFuaWZlc3QuZXh0ZW5zaW9uRGVwZW5kZW5jaWVzLnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBleHRlbnNpb24uaWRlbnRpZmllcikpKTtcblx0XHRcdFx0aWYgKGRlcGVuZGVudE5vblVJRXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aHJvdyAobmV3IEVycm9yKHRoaXMuZ2V0RGVwZW5kZW50c0Vycm9yTWVzc2FnZShleHRlbnNpb24sIGRlcGVuZGVudE5vblVJRXh0ZW5zaW9ucykpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnVuaW5zdGFsbEV4dGVuc2lvbnMoZXh0ZW5zaW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGdldERlcGVuZGVudHNFcnJvck1lc3NhZ2UoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGRlcGVuZGVudHM6IElMb2NhbEV4dGVuc2lvbltdKTogc3RyaW5nIHtcblx0XHRpZiAoZGVwZW5kZW50cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2luZ2xlRGVwZW5kZW50RXJyb3InLCBcIkNhbm5vdCB1bmluc3RhbGwgZXh0ZW5zaW9uICd7MH0nLiBFeHRlbnNpb24gJ3sxfScgZGVwZW5kcyBvbiB0aGlzLlwiLFxuXHRcdFx0XHRleHRlbnNpb24ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLm1hbmlmZXN0Lm5hbWUsIGRlcGVuZGVudHNbMF0ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZGVwZW5kZW50c1swXS5tYW5pZmVzdC5uYW1lKTtcblx0XHR9XG5cdFx0aWYgKGRlcGVuZGVudHMubGVuZ3RoID09PSAyKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3R3b0RlcGVuZGVudHNFcnJvcicsIFwiQ2Fubm90IHVuaW5zdGFsbCBleHRlbnNpb24gJ3swfScuIEV4dGVuc2lvbnMgJ3sxfScgYW5kICd7Mn0nIGRlcGVuZCBvbiB0aGlzLlwiLFxuXHRcdFx0XHRleHRlbnNpb24ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLm1hbmlmZXN0Lm5hbWUsIGRlcGVuZGVudHNbMF0ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZGVwZW5kZW50c1swXS5tYW5pZmVzdC5uYW1lLCBkZXBlbmRlbnRzWzFdLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGRlcGVuZGVudHNbMV0ubWFuaWZlc3QubmFtZSk7XG5cdFx0fVxuXHRcdHJldHVybiBsb2NhbGl6ZSgnbXVsdGlwbGVEZXBlbmRlbnRzRXJyb3InLCBcIkNhbm5vdCB1bmluc3RhbGwgZXh0ZW5zaW9uICd7MH0nLiBFeHRlbnNpb25zICd7MX0nLCAnezJ9JyBhbmQgb3RoZXJzIGRlcGVuZCBvbiB0aGlzLlwiLFxuXHRcdFx0ZXh0ZW5zaW9uLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5tYW5pZmVzdC5uYW1lLCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGRlcGVuZGVudHNbMF0ubWFuaWZlc3QubmFtZSwgZGVwZW5kZW50c1sxXS5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBkZXBlbmRlbnRzWzFdLm1hbmlmZXN0Lm5hbWUpO1xuXG5cdH1cblxuXHR1cGRhdGVNZXRhZGF0YShleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgbWV0YWRhdGE6IFBhcnRpYWw8TWV0YWRhdGE+KTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLmdldFNlcnZlcihleHRlbnNpb24pO1xuXHRcdGlmIChzZXJ2ZXIpIHtcblx0XHRcdGNvbnN0IHByb2ZpbGUgPSBleHRlbnNpb24uaXNBcHBsaWNhdGlvblNjb3BlZCA/IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUgOiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGU7XG5cdFx0XHRyZXR1cm4gc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnVwZGF0ZU1ldGFkYXRhKGV4dGVuc2lvbiwgbWV0YWRhdGEsIHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGBJbnZhbGlkIGxvY2F0aW9uICR7ZXh0ZW5zaW9uLmxvY2F0aW9uLnRvU3RyaW5nKCl9YCk7XG5cdH1cblxuXHRhc3luYyByZXNldFBpbm5lZFN0YXRlRm9yQWxsVXNlckV4dGVuc2lvbnMocGlubmVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHRoaXMuc2VydmVycy5tYXAoc2VydmVyID0+IHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5yZXNldFBpbm5lZFN0YXRlRm9yQWxsVXNlckV4dGVuc2lvbnMocGlubmVkKSkpO1xuXHR9XG5cblx0emlwKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLmdldFNlcnZlcihleHRlbnNpb24pO1xuXHRcdGlmIChzZXJ2ZXIpIHtcblx0XHRcdHJldHVybiBzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuemlwKGV4dGVuc2lvbik7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChgSW52YWxpZCBsb2NhdGlvbiAke2V4dGVuc2lvbi5sb2NhdGlvbi50b1N0cmluZygpfWApO1xuXHR9XG5cblx0ZG93bmxvYWQoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLCBkb25vdFZlcmlmeVNpZ25hdHVyZTogYm9vbGVhbik6IFByb21pc2U8VVJJPiB7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZG93bmxvYWQoZXh0ZW5zaW9uLCBvcGVyYXRpb24sIGRvbm90VmVyaWZ5U2lnbmF0dXJlKTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZG93bmxvYWQgZXh0ZW5zaW9uJyk7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsKHZzaXg6IFVSSSwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMuZ2V0TWFuaWZlc3QodnNpeCk7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFsbFZTSVgodnNpeCwgbWFuaWZlc3QsIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbFZTSVgodnNpeDogVVJJLCBtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LCBvcHRpb25zPzogSW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IHNlcnZlcnNUb0luc3RhbGwgPSB0aGlzLmdldFNlcnZlcnNUb0luc3RhbGwobWFuaWZlc3QpO1xuXHRcdGlmIChzZXJ2ZXJzVG9JbnN0YWxsPy5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IHRoaXMuY2hlY2tGb3JXb3Jrc3BhY2VUcnVzdChtYW5pZmVzdCwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgW2xvY2FsXSA9IGF3YWl0IFByb21pc2VzLnNldHRsZWQoc2VydmVyc1RvSW5zdGFsbC5tYXAoc2VydmVyID0+IHRoaXMuaW5zdGFsbFZTSVhJblNlcnZlcih2c2l4LCBzZXJ2ZXIsIG9wdGlvbnMpKSk7XG5cdFx0XHRyZXR1cm4gbG9jYWw7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdCgnTm8gU2VydmVycyB0byBJbnN0YWxsJyk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlcnZlcnNUb0luc3RhbGwobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyW10gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdGlmIChpc0xhbmd1YWdlUGFja0V4dGVuc2lvbihtYW5pZmVzdCkpIHtcblx0XHRcdFx0Ly8gSW5zdGFsbCBvbiBib3RoIHNlcnZlcnNcblx0XHRcdFx0cmV0dXJuIFt0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciwgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyXTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UucHJlZmVyc0V4ZWN1dGVPblVJKG1hbmlmZXN0KSkge1xuXHRcdFx0XHQvLyBJbnN0YWxsIG9ubHkgb24gbG9jYWwgc2VydmVyXG5cdFx0XHRcdHJldHVybiBbdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJdO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSW5zdGFsbCBvbmx5IG9uIHJlbW90ZSBzZXJ2ZXJcblx0XHRcdHJldHVybiBbdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyXTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRyZXR1cm4gW3RoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyXTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIFt0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJdO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbEZyb21Mb2NhdGlvbihsb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRpZiAobG9jYXRpb24uc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEZyb21Mb2NhdGlvbihsb2NhdGlvbiwgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xvY2FsIGV4dGVuc2lvbiBtYW5hZ2VtZW50IHNlcnZlciBpcyBub3QgZm91bmQnKTtcblx0XHR9XG5cdFx0aWYgKGxvY2F0aW9uLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVSZW1vdGUpIHtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUxvY2F0aW9uKGxvY2F0aW9uLCB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcignUmVtb3RlIGV4dGVuc2lvbiBtYW5hZ2VtZW50IHNlcnZlciBpcyBub3QgZm91bmQnKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignV2ViIGV4dGVuc2lvbiBtYW5hZ2VtZW50IHNlcnZlciBpcyBub3QgZm91bmQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUxvY2F0aW9uKGxvY2F0aW9uLCB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBpbnN0YWxsVlNJWEluU2VydmVyKHZzaXg6IFVSSSwgc2VydmVyOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciwgb3B0aW9uczogSW5zdGFsbE9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHJldHVybiBzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbCh2c2l4LCBvcHRpb25zKTtcblx0fVxuXG5cdGdldE1hbmlmZXN0KHZzaXg6IFVSSSk6IFByb21pc2U8SUV4dGVuc2lvbk1hbmlmZXN0PiB7XG5cdFx0aWYgKHZzaXguc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRNYW5pZmVzdCh2c2l4KTtcblx0XHR9XG5cdFx0aWYgKHZzaXguc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldE1hbmlmZXN0KHZzaXgpO1xuXHRcdH1cblx0XHRpZiAodnNpeC5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRNYW5pZmVzdCh2c2l4KTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KCdObyBTZXJ2ZXJzJyk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBjYW5JbnN0YWxsKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24gfCBJUmVzb3VyY2VFeHRlbnNpb24pOiBQcm9taXNlPHRydWUgfCBJTWFya2Rvd25TdHJpbmc+IHtcblx0XHRpZiAoaXNHYWxsZXJ5RXh0ZW5zaW9uKGV4dGVuc2lvbikpIHtcblx0XHRcdHJldHVybiB0aGlzLmNhbkluc3RhbGxHYWxsZXJ5RXh0ZW5zaW9uKGV4dGVuc2lvbik7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNhbkluc3RhbGxSZXNvdXJjZUV4dGVuc2lvbihleHRlbnNpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjYW5JbnN0YWxsR2FsbGVyeUV4dGVuc2lvbihnYWxsZXJ5OiBJR2FsbGVyeUV4dGVuc2lvbik6IFByb21pc2U8dHJ1ZSB8IElNYXJrZG93blN0cmluZz4ge1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclxuXHRcdFx0JiYgYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY2FuSW5zdGFsbChnYWxsZXJ5KSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRNYW5pZmVzdChnYWxsZXJ5LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRpZiAoIW1hbmlmZXN0KSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChsb2NhbGl6ZSgnbWFuaWZlc3QgaXMgbm90IGZvdW5kJywgXCJNYW5pZmVzdCBpcyBub3QgZm91bmRcIikpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyXG5cdFx0XHQmJiBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY2FuSW5zdGFsbChnYWxsZXJ5KSA9PT0gdHJ1ZVxuXHRcdFx0JiYgdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmNhbkV4ZWN1dGVPbldvcmtzcGFjZShtYW5pZmVzdCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyXG5cdFx0XHQmJiBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY2FuSW5zdGFsbChnYWxsZXJ5KSA9PT0gdHJ1ZVxuXHRcdFx0JiYgdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmNhbkV4ZWN1dGVPbldlYihtYW5pZmVzdCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChsb2NhbGl6ZSgnY2Fubm90IGJlIGluc3RhbGxlZCcsIFwiQ2Fubm90IGluc3RhbGwgdGhlICd7MH0nIGV4dGVuc2lvbiBiZWNhdXNlIGl0IGlzIG5vdCBhdmFpbGFibGUgaW4gdGhpcyBzZXR1cC5cIiwgZ2FsbGVyeS5kaXNwbGF5TmFtZSB8fCBnYWxsZXJ5Lm5hbWUpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2FuSW5zdGFsbFJlc291cmNlRXh0ZW5zaW9uKGV4dGVuc2lvbjogSVJlc291cmNlRXh0ZW5zaW9uKTogUHJvbWlzZTx0cnVlIHwgSU1hcmtkb3duU3RyaW5nPiB7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuY2FuRXhlY3V0ZU9uV29ya3NwYWNlKGV4dGVuc2lvbi5tYW5pZmVzdCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5jYW5FeGVjdXRlT25XZWIoZXh0ZW5zaW9uLm1hbmlmZXN0KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KGxvY2FsaXplKCdjYW5ub3QgYmUgaW5zdGFsbGVkJywgXCJDYW5ub3QgaW5zdGFsbCB0aGUgJ3swfScgZXh0ZW5zaW9uIGJlY2F1c2UgaXQgaXMgbm90IGF2YWlsYWJsZSBpbiB0aGlzIHNldHVwLlwiLCBleHRlbnNpb24ubWFuaWZlc3QuZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUZyb21HYWxsZXJ5KGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uLCBleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgaW5zdGFsbE9wdGlvbnM/OiBJbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoZXh0ZW5zaW9uKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGBJbnZhbGlkIGxvY2F0aW9uICR7ZXh0ZW5zaW9uLmxvY2F0aW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VydmVyczogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJbXSA9IFtdO1xuXG5cdFx0Ly8gVXBkYXRlIExhbmd1YWdlIHBhY2sgb24gbG9jYWwgYW5kIHJlbW90ZSBzZXJ2ZXJzXG5cdFx0aWYgKGlzTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uKGV4dGVuc2lvbi5tYW5pZmVzdCkpIHtcblx0XHRcdHNlcnZlcnMucHVzaCguLi50aGlzLnNlcnZlcnMuZmlsdGVyKHNlcnZlciA9PiBzZXJ2ZXIgIT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzZXJ2ZXJzLnB1c2goc2VydmVyKTtcblx0XHR9XG5cblx0XHRpbnN0YWxsT3B0aW9ucyA9IHsgLi4uKGluc3RhbGxPcHRpb25zIHx8IHt9KSwgaXNBcHBsaWNhdGlvblNjb3BlZDogZXh0ZW5zaW9uLmlzQXBwbGljYXRpb25TY29wZWQgfTtcblx0XHRyZXR1cm4gUHJvbWlzZXMuc2V0dGxlZChzZXJ2ZXJzLm1hcChzZXJ2ZXIgPT4gc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeShnYWxsZXJ5LCBpbnN0YWxsT3B0aW9ucykpKS50aGVuKChbbG9jYWxdKSA9PiBsb2NhbCk7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoZXh0ZW5zaW9uczogSW5zdGFsbEV4dGVuc2lvbkluZm9bXSk6IFByb21pc2U8SW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IG5ldyBNYXA8c3RyaW5nLCBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0PigpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0J5U2VydmVyID0gbmV3IE1hcDxJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciwgSW5zdGFsbEV4dGVuc2lvbkluZm9bXT4oKTtcblx0XHRjb25zdCBtYW5pZmVzdHMgPSBhd2FpdCBQcm9taXNlLmFsbChleHRlbnNpb25zLm1hcChhc3luYyAoeyBleHRlbnNpb24gfSkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldE1hbmlmZXN0KGV4dGVuc2lvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAoIW1hbmlmZXN0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnTWFuaWZlc3QgaXMgbm90IGZvdW5kJywgXCJJbnN0YWxsaW5nIEV4dGVuc2lvbiB7MH0gZmFpbGVkOiBNYW5pZmVzdCBpcyBub3QgZm91bmQuXCIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24ubmFtZSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1hbmlmZXN0O1xuXHRcdH0pKTtcblxuXHRcdGlmIChleHRlbnNpb25zLnNvbWUoZSA9PiBlLm9wdGlvbnM/LmNvbnRleHQ/LltFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1BVQkxJU0hFUl9UUlVTVF9DT05URVhUXSAhPT0gdHJ1ZSkpIHtcblx0XHRcdGF3YWl0IHRoaXMuY2hlY2tGb3JUcnVzdGVkUHVibGlzaGVycyhleHRlbnNpb25zLm1hcCgoZSwgaW5kZXgpID0+ICh7IGV4dGVuc2lvbjogZS5leHRlbnNpb24sIG1hbmlmZXN0OiBtYW5pZmVzdHNbaW5kZXhdLCBjaGVja0ZvclBhY2tBbmREZXBlbmRlbmNpZXM6ICFlLm9wdGlvbnM/LmRvbm90SW5jbHVkZVBhY2tBbmREZXBlbmRlbmNpZXMgfSkpKTtcblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChleHRlbnNpb25zLm1hcChhc3luYyAoeyBleHRlbnNpb24sIG9wdGlvbnMgfSkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldE1hbmlmZXN0KGV4dGVuc2lvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGlmICghbWFuaWZlc3QpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ01hbmlmZXN0IGlzIG5vdCBmb3VuZCcsIFwiSW5zdGFsbGluZyBFeHRlbnNpb24gezB9IGZhaWxlZDogTWFuaWZlc3QgaXMgbm90IGZvdW5kLlwiLCBleHRlbnNpb24uZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLm5hbWUpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChvcHRpb25zPy5jb250ZXh0Py5bRVhURU5TSU9OX0lOU1RBTExfU09VUkNFX0NPTlRFWFRdICE9PSBFeHRlbnNpb25JbnN0YWxsU291cmNlLlNFVFRJTkdTX1NZTkMpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNoZWNrRm9yV29ya3NwYWNlVHJ1c3QobWFuaWZlc3QsIGZhbHNlKTtcblxuXHRcdFx0XHRcdGlmICghb3B0aW9ucz8uZG9ub3RJbmNsdWRlUGFja0FuZERlcGVuZGVuY2llcykge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jaGVja0luc3RhbGxpbmdFeHRlbnNpb25PbldlYihleHRlbnNpb24sIG1hbmlmZXN0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzZXJ2ZXJzID0gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyc1RvSW5zdGFsbChleHRlbnNpb24sIG1hbmlmZXN0KTtcblx0XHRcdFx0aWYgKCFvcHRpb25zLmlzTWFjaGluZVNjb3BlZCAmJiB0aGlzLmlzRXh0ZW5zaW9uc1N5bmNFbmFibGVkKCkpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJcblx0XHRcdFx0XHRcdCYmICFzZXJ2ZXJzLmluY2x1ZGVzKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKVxuXHRcdFx0XHRcdFx0JiYgYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY2FuSW5zdGFsbChleHRlbnNpb24pID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRzZXJ2ZXJzLnB1c2godGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiBzZXJ2ZXJzKSB7XG5cdFx0XHRcdFx0bGV0IGV4ZW5zaW9ucyA9IGV4dGVuc2lvbnNCeVNlcnZlci5nZXQoc2VydmVyKTtcblx0XHRcdFx0XHRpZiAoIWV4ZW5zaW9ucykge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uc0J5U2VydmVyLnNldChzZXJ2ZXIsIGV4ZW5zaW9ucyA9IFtdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZXhlbnNpb25zLnB1c2goeyBleHRlbnNpb24sIG9wdGlvbnMgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHJlc3VsdHMuc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCksIHtcblx0XHRcdFx0XHRpZGVudGlmaWVyOiBleHRlbnNpb24uaWRlbnRpZmllcixcblx0XHRcdFx0XHRzb3VyY2U6IGV4dGVuc2lvbiwgZXJyb3IsXG5cdFx0XHRcdFx0b3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLkluc3RhbGwsXG5cdFx0XHRcdFx0cHJvZmlsZUxvY2F0aW9uOiBvcHRpb25zLnByb2ZpbGVMb2NhdGlvbiA/PyB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFsuLi5leHRlbnNpb25zQnlTZXJ2ZXIuZW50cmllcygpXS5tYXAoYXN5bmMgKFtzZXJ2ZXIsIGV4dGVuc2lvbnNdKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2ZXJSZXN1bHRzID0gYXdhaXQgc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxHYWxsZXJ5RXh0ZW5zaW9ucyhleHRlbnNpb25zKTtcblx0XHRcdGZvciAoY29uc3QgcmVzdWx0IG9mIHNlcnZlclJlc3VsdHMpIHtcblx0XHRcdFx0cmVzdWx0cy5zZXQocmVzdWx0LmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwgcmVzdWx0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gWy4uLnJlc3VsdHMudmFsdWVzKCldO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbEZyb21HYWxsZXJ5KGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uLCBpbnN0YWxsT3B0aW9ucz86IEluc3RhbGxPcHRpb25zLCBzZXJ2ZXJzPzogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJbXSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldE1hbmlmZXN0KGdhbGxlcnksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmICghbWFuaWZlc3QpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnTWFuaWZlc3QgaXMgbm90IGZvdW5kJywgXCJJbnN0YWxsaW5nIEV4dGVuc2lvbiB7MH0gZmFpbGVkOiBNYW5pZmVzdCBpcyBub3QgZm91bmQuXCIsIGdhbGxlcnkuZGlzcGxheU5hbWUgfHwgZ2FsbGVyeS5uYW1lKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGluc3RhbGxPcHRpb25zPy5jb250ZXh0Py5bRVhURU5TSU9OX0lOU1RBTExfU0tJUF9QVUJMSVNIRVJfVFJVU1RfQ09OVEVYVF0gIT09IHRydWUpIHtcblx0XHRcdGF3YWl0IHRoaXMuY2hlY2tGb3JUcnVzdGVkUHVibGlzaGVycyhbeyBleHRlbnNpb246IGdhbGxlcnksIG1hbmlmZXN0LCBjaGVja0ZvclBhY2tBbmREZXBlbmRlbmNpZXM6ICFpbnN0YWxsT3B0aW9ucz8uZG9ub3RJbmNsdWRlUGFja0FuZERlcGVuZGVuY2llcyB9XSwpO1xuXHRcdH1cblxuXHRcdGlmIChpbnN0YWxsT3B0aW9ucz8uY29udGV4dD8uW0VYVEVOU0lPTl9JTlNUQUxMX1NPVVJDRV9DT05URVhUXSAhPT0gRXh0ZW5zaW9uSW5zdGFsbFNvdXJjZS5TRVRUSU5HU19TWU5DKSB7XG5cblx0XHRcdGF3YWl0IHRoaXMuY2hlY2tGb3JXb3Jrc3BhY2VUcnVzdChtYW5pZmVzdCwgZmFsc2UpO1xuXG5cdFx0XHRpZiAoIWluc3RhbGxPcHRpb25zPy5kb25vdEluY2x1ZGVQYWNrQW5kRGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY2hlY2tJbnN0YWxsaW5nRXh0ZW5zaW9uT25XZWIoZ2FsbGVyeSwgbWFuaWZlc3QpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHNlcnZlcnMgPSBzZXJ2ZXJzPy5sZW5ndGggPyB0aGlzLnZhbGlkU2VydmVycyhnYWxsZXJ5LCBtYW5pZmVzdCwgc2VydmVycykgOiBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJzVG9JbnN0YWxsKGdhbGxlcnksIG1hbmlmZXN0KTtcblx0XHRpZiAoIWluc3RhbGxPcHRpb25zIHx8IGlzVW5kZWZpbmVkKGluc3RhbGxPcHRpb25zLmlzTWFjaGluZVNjb3BlZCkpIHtcblx0XHRcdGNvbnN0IGlzTWFjaGluZVNjb3BlZCA9IGF3YWl0IHRoaXMuaGFzVG9GbGFnRXh0ZW5zaW9uc01hY2hpbmVTY29wZWQoW2dhbGxlcnldKTtcblx0XHRcdGluc3RhbGxPcHRpb25zID0geyAuLi4oaW5zdGFsbE9wdGlvbnMgfHwge30pLCBpc01hY2hpbmVTY29wZWQgfTtcblx0XHR9XG5cblx0XHRpZiAoIWluc3RhbGxPcHRpb25zLmlzTWFjaGluZVNjb3BlZCAmJiB0aGlzLmlzRXh0ZW5zaW9uc1N5bmNFbmFibGVkKCkpIHtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclxuXHRcdFx0XHQmJiAhc2VydmVycy5pbmNsdWRlcyh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcilcblx0XHRcdFx0JiYgYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY2FuSW5zdGFsbChnYWxsZXJ5KSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRzZXJ2ZXJzLnB1c2godGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlcy5zZXR0bGVkKHNlcnZlcnMubWFwKHNlcnZlciA9PiBzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEZyb21HYWxsZXJ5KGdhbGxlcnksIGluc3RhbGxPcHRpb25zKSkpLnRoZW4oKFtsb2NhbF0pID0+IGxvY2FsKTtcblx0fVxuXG5cdGFzeW5jIGdldEV4dGVuc2lvbnMobG9jYXRpb25zOiBVUklbXSk6IFByb21pc2U8SVJlc291cmNlRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBzY2FubmVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5NdWx0aXBsZUV4dGVuc2lvbnMobG9jYXRpb25zLCBFeHRlbnNpb25UeXBlLlVzZXIsIHsgaW5jbHVkZUludmFsaWQ6IHRydWUgfSk7XG5cdFx0Y29uc3QgcmVzdWx0OiBJUmVzb3VyY2VFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHNjYW5uZWRFeHRlbnNpb25zLm1hcChhc3luYyBzY2FubmVkRXh0ZW5zaW9uID0+IHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUV4dGVuc2lvbiA9IGF3YWl0IHRoaXMud29ya3NwYWNlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudG9Mb2NhbFdvcmtzcGFjZUV4dGVuc2lvbihzY2FubmVkRXh0ZW5zaW9uKTtcblx0XHRcdGlmICh3b3Jrc3BhY2VFeHRlbnNpb24pIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6ICdyZXNvdXJjZScsXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogd29ya3NwYWNlRXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHRcdFx0bG9jYXRpb246IHdvcmtzcGFjZUV4dGVuc2lvbi5sb2NhdGlvbixcblx0XHRcdFx0XHRtYW5pZmVzdDogd29ya3NwYWNlRXh0ZW5zaW9uLm1hbmlmZXN0LFxuXHRcdFx0XHRcdGNoYW5nZWxvZ1VyaTogd29ya3NwYWNlRXh0ZW5zaW9uLmNoYW5nZWxvZ1VybCxcblx0XHRcdFx0XHRyZWFkbWVVcmk6IHdvcmtzcGFjZUV4dGVuc2lvbi5yZWFkbWVVcmwsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Z2V0SW5zdGFsbGVkV29ya3NwYWNlRXh0ZW5zaW9uTG9jYXRpb25zKCk6IFVSSVtdIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWRXb3Jrc3BhY2VFeHRlbnNpb25zTG9jYXRpb25zKCk7XG5cdH1cblxuXHRhc3luYyBnZXRJbnN0YWxsZWRXb3Jrc3BhY2VFeHRlbnNpb25zKGluY2x1ZGVJbnZhbGlkOiBib29sZWFuKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZChpbmNsdWRlSW52YWxpZCk7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsUmVzb3VyY2VFeHRlbnNpb24oZXh0ZW5zaW9uOiBJUmVzb3VyY2VFeHRlbnNpb24sIGluc3RhbGxPcHRpb25zOiBJbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0aWYgKCF0aGlzLmNhbkluc3RhbGxSZXNvdXJjZUV4dGVuc2lvbihleHRlbnNpb24pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RoaXMgZXh0ZW5zaW9uIGNhbm5vdCBiZSBpbnN0YWxsZWQgaW4gdGhlIGN1cnJlbnQgd29ya3NwYWNlLicpO1xuXHRcdH1cblx0XHRpZiAoIWluc3RhbGxPcHRpb25zLmlzV29ya3NwYWNlU2NvcGVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YWxsRnJvbUxvY2F0aW9uKGV4dGVuc2lvbi5sb2NhdGlvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEluc3RhbGxpbmcgdGhlIGV4dGVuc2lvbiAke2V4dGVuc2lvbi5pZGVudGlmaWVyLmlkfSBmcm9tICR7ZXh0ZW5zaW9uLmxvY2F0aW9uLnRvU3RyaW5nKCl9IGluIHdvcmtzcGFjZWApO1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0V29ya3NwYWNlRXh0ZW5zaW9uc1NlcnZlcigpO1xuXHRcdHRoaXMuX29uSW5zdGFsbEV4dGVuc2lvbi5maXJlKHtcblx0XHRcdGlkZW50aWZpZXI6IGV4dGVuc2lvbi5pZGVudGlmaWVyLFxuXHRcdFx0c291cmNlOiBleHRlbnNpb24ubG9jYXRpb24sXG5cdFx0XHRzZXJ2ZXIsXG5cdFx0XHRhcHBsaWNhdGlvblNjb3BlZDogZmFsc2UsXG5cdFx0XHRwcm9maWxlTG9jYXRpb246IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsXG5cdFx0XHR3b3Jrc3BhY2VTY29wZWQ6IHRydWVcblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNoZWNrRm9yV29ya3NwYWNlVHJ1c3QoZXh0ZW5zaW9uLm1hbmlmZXN0LCB0cnVlKTtcblxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRXh0ZW5zaW9uID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsKGV4dGVuc2lvbik7XG5cblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBTdWNjZXNzZnVsbHkgaW5zdGFsbGVkIHRoZSBleHRlbnNpb24gJHt3b3Jrc3BhY2VFeHRlbnNpb24uaWRlbnRpZmllci5pZH0gZnJvbSAke2V4dGVuc2lvbi5sb2NhdGlvbi50b1N0cmluZygpfSBpbiB0aGUgd29ya3NwYWNlYCk7XG5cdFx0XHR0aGlzLl9vbkRpZEluc3RhbGxFeHRlbnNpb25zLmZpcmUoW3tcblx0XHRcdFx0aWRlbnRpZmllcjogd29ya3NwYWNlRXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHRcdHNvdXJjZTogZXh0ZW5zaW9uLmxvY2F0aW9uLFxuXHRcdFx0XHRvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb24uSW5zdGFsbCxcblx0XHRcdFx0YXBwbGljYXRpb25TY29wZWQ6IGZhbHNlLFxuXHRcdFx0XHRwcm9maWxlTG9jYXRpb246IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsXG5cdFx0XHRcdGxvY2FsOiB3b3Jrc3BhY2VFeHRlbnNpb24sXG5cdFx0XHRcdHdvcmtzcGFjZVNjb3BlZDogdHJ1ZVxuXHRcdFx0fV0pO1xuXHRcdFx0cmV0dXJuIHdvcmtzcGFjZUV4dGVuc2lvbjtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gaW5zdGFsbCB0aGUgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9IGZyb20gJHtleHRlbnNpb24ubG9jYXRpb24udG9TdHJpbmcoKX0gaW4gdGhlIHdvcmtzcGFjZWAsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0dGhpcy5fb25EaWRJbnN0YWxsRXh0ZW5zaW9ucy5maXJlKFt7XG5cdFx0XHRcdGlkZW50aWZpZXI6IGV4dGVuc2lvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRzb3VyY2U6IGV4dGVuc2lvbi5sb2NhdGlvbixcblx0XHRcdFx0b3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLkluc3RhbGwsXG5cdFx0XHRcdGFwcGxpY2F0aW9uU2NvcGVkOiBmYWxzZSxcblx0XHRcdFx0cHJvZmlsZUxvY2F0aW9uOiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLFxuXHRcdFx0XHRlcnJvcixcblx0XHRcdFx0d29ya3NwYWNlU2NvcGVkOiB0cnVlXG5cdFx0XHR9XSk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRJbnN0YWxsYWJsZVNlcnZlcnMoZ2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb24pOiBQcm9taXNlPElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyW10+IHtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0TWFuaWZlc3QoZ2FsbGVyeSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKCFtYW5pZmVzdCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGxvY2FsaXplKCdNYW5pZmVzdCBpcyBub3QgZm91bmQnLCBcIkluc3RhbGxpbmcgRXh0ZW5zaW9uIHswfSBmYWlsZWQ6IE1hbmlmZXN0IGlzIG5vdCBmb3VuZC5cIiwgZ2FsbGVyeS5kaXNwbGF5TmFtZSB8fCBnYWxsZXJ5Lm5hbWUpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0SW5zdGFsbGFibGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVycyhtYW5pZmVzdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVuaW5zdGFsbEV4dGVuc2lvbkZyb21Xb3Jrc3BhY2UoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWV4dGVuc2lvbi5pc1dvcmtzcGFjZVNjb3BlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUaGUgZXh0ZW5zaW9uIGlzIG5vdCBhIHdvcmtzcGFjZSBleHRlbnNpb24nKTtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgVW5pbnN0YWxsaW5nIHRoZSB3b3Jrc3BhY2UgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9IGZyb20gJHtleHRlbnNpb24ubG9jYXRpb24udG9TdHJpbmcoKX1gKTtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLmdldFdvcmtzcGFjZUV4dGVuc2lvbnNTZXJ2ZXIoKTtcblx0XHR0aGlzLl9vblVuaW5zdGFsbEV4dGVuc2lvbi5maXJlKHtcblx0XHRcdGlkZW50aWZpZXI6IGV4dGVuc2lvbi5pZGVudGlmaWVyLFxuXHRcdFx0c2VydmVyLFxuXHRcdFx0YXBwbGljYXRpb25TY29wZWQ6IGZhbHNlLFxuXHRcdFx0d29ya3NwYWNlU2NvcGVkOiB0cnVlLFxuXHRcdFx0cHJvZmlsZUxvY2F0aW9uOiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlXG5cdFx0fSk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS51bmluc3RhbGwoZXh0ZW5zaW9uKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBTdWNjZXNzZnVsbHkgdW5pbnN0YWxsZWQgdGhlIHdvcmtzcGFjZSBleHRlbnNpb24gJHtleHRlbnNpb24uaWRlbnRpZmllci5pZH0gZnJvbSAke2V4dGVuc2lvbi5sb2NhdGlvbi50b1N0cmluZygpfWApO1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8e30sIHtcblx0XHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRcdGNvbW1lbnQ6ICdVbmluc3RhbGwgd29ya3NwYWNlIGV4dGVuc2lvbic7XG5cdFx0XHR9Pignd29ya3NwYWNlZXh0ZW5zaW9uOnVuaW5zdGFsbCcpO1xuXHRcdFx0dGhpcy5fb25EaWRVbmluc3RhbGxFeHRlbnNpb24uZmlyZSh7XG5cdFx0XHRcdGlkZW50aWZpZXI6IGV4dGVuc2lvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRzZXJ2ZXIsXG5cdFx0XHRcdGFwcGxpY2F0aW9uU2NvcGVkOiBmYWxzZSxcblx0XHRcdFx0d29ya3NwYWNlU2NvcGVkOiB0cnVlLFxuXHRcdFx0XHRwcm9maWxlTG9jYXRpb246IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2Vcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byB1bmluc3RhbGwgdGhlIHdvcmtzcGFjZSBleHRlbnNpb24gJHtleHRlbnNpb24uaWRlbnRpZmllci5pZH0gZnJvbSAke2V4dGVuc2lvbi5sb2NhdGlvbi50b1N0cmluZygpfWAsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0dGhpcy5fb25EaWRVbmluc3RhbGxFeHRlbnNpb24uZmlyZSh7XG5cdFx0XHRcdGlkZW50aWZpZXI6IGV4dGVuc2lvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRzZXJ2ZXIsXG5cdFx0XHRcdGVycm9yLFxuXHRcdFx0XHRhcHBsaWNhdGlvblNjb3BlZDogZmFsc2UsXG5cdFx0XHRcdHdvcmtzcGFjZVNjb3BlZDogdHJ1ZSxcblx0XHRcdFx0cHJvZmlsZUxvY2F0aW9uOiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlXG5cdFx0XHR9KTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdmFsaWRTZXJ2ZXJzKGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uLCBtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LCBzZXJ2ZXJzOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcltdKTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJbXSB7XG5cdFx0Y29uc3QgaW5zdGFsbGFibGVTZXJ2ZXJzID0gdGhpcy5nZXRJbnN0YWxsYWJsZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJzKG1hbmlmZXN0KTtcblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiBzZXJ2ZXJzKSB7XG5cdFx0XHRpZiAoIWluc3RhbGxhYmxlU2VydmVycy5pbmNsdWRlcyhzZXJ2ZXIpKSB7XG5cdFx0XHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGxvY2FsaXplKCdjYW5ub3QgYmUgaW5zdGFsbGVkIGluIHNlcnZlcicsIFwiQ2Fubm90IGluc3RhbGwgdGhlICd7MH0nIGV4dGVuc2lvbiBiZWNhdXNlIGl0IGlzIG5vdCBhdmFpbGFibGUgaW4gdGhlICd7MX0nIHNldHVwLlwiLCBnYWxsZXJ5LmRpc3BsYXlOYW1lIHx8IGdhbGxlcnkubmFtZSwgc2VydmVyLmxhYmVsKSk7XG5cdFx0XHRcdGVycm9yLm5hbWUgPSBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlVuc3VwcG9ydGVkO1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHNlcnZlcnM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJzVG9JbnN0YWxsKGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uLCBtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogUHJvbWlzZTxJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcltdPiB7XG5cdFx0Y29uc3Qgc2VydmVyczogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJbXSA9IFtdO1xuXG5cdFx0Ly8gTGFuZ3VhZ2UgcGFja3Mgc2hvdWxkIGJlIGluc3RhbGxlZCBvbiBib3RoIGxvY2FsIGFuZCByZW1vdGUgc2VydmVyc1xuXHRcdGlmIChpc0xhbmd1YWdlUGFja0V4dGVuc2lvbihtYW5pZmVzdCkpIHtcblx0XHRcdHNlcnZlcnMucHVzaCguLi50aGlzLnNlcnZlcnMuZmlsdGVyKHNlcnZlciA9PiBzZXJ2ZXIgIT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikpO1xuXHRcdH1cblxuXHRcdGVsc2Uge1xuXHRcdFx0Y29uc3QgW3NlcnZlcl0gPSB0aGlzLmdldEluc3RhbGxhYmxlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcnMobWFuaWZlc3QpO1xuXHRcdFx0aWYgKHNlcnZlcikge1xuXHRcdFx0XHRzZXJ2ZXJzLnB1c2goc2VydmVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXNlcnZlcnMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihsb2NhbGl6ZSgnY2Fubm90IGJlIGluc3RhbGxlZCcsIFwiQ2Fubm90IGluc3RhbGwgdGhlICd7MH0nIGV4dGVuc2lvbiBiZWNhdXNlIGl0IGlzIG5vdCBhdmFpbGFibGUgaW4gdGhpcyBzZXR1cC5cIiwgZ2FsbGVyeS5kaXNwbGF5TmFtZSB8fCBnYWxsZXJ5Lm5hbWUpKTtcblx0XHRcdGVycm9yLm5hbWUgPSBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlVuc3VwcG9ydGVkO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNlcnZlcnM7XG5cdH1cblxuXHRwcml2YXRlIGdldEluc3RhbGxhYmxlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcnMobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyW10ge1xuXHRcdC8vIE9ubHkgbG9jYWwgc2VydmVyXG5cdFx0aWYgKHRoaXMuc2VydmVycy5sZW5ndGggPT09IDEgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiBbdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlcnZlcnM6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyW10gPSBbXTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbktpbmQgPSB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuZ2V0RXh0ZW5zaW9uS2luZChtYW5pZmVzdCk7XG5cdFx0Zm9yIChjb25zdCBraW5kIG9mIGV4dGVuc2lvbktpbmQpIHtcblx0XHRcdGlmIChraW5kID09PSAndWknICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdHNlcnZlcnMucHVzaCh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoa2luZCA9PT0gJ3dvcmtzcGFjZScgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdHNlcnZlcnMucHVzaCh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGtpbmQgPT09ICd3ZWInICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRzZXJ2ZXJzLnB1c2godGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBMb2NhbCBzZXJ2ZXIgY2FuIGFjY2VwdCBhbnkgZXh0ZW5zaW9uLlxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiAhc2VydmVycy5pbmNsdWRlcyh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikpIHtcblx0XHRcdHNlcnZlcnMucHVzaCh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNlcnZlcnM7XG5cdH1cblxuXHRwcml2YXRlIGlzRXh0ZW5zaW9uc1N5bmNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpICYmIHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNSZXNvdXJjZUVuYWJsZWQoU3luY1Jlc291cmNlLkV4dGVuc2lvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYXNUb0ZsYWdFeHRlbnNpb25zTWFjaGluZVNjb3BlZChleHRlbnNpb25zOiBJR2FsbGVyeUV4dGVuc2lvbltdKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHRoaXMuaXNFeHRlbnNpb25zU3luY0VuYWJsZWQoKSkge1xuXHRcdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQ8Ym9vbGVhbj4oe1xuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRtZXNzYWdlOiBleHRlbnNpb25zLmxlbmd0aCA9PT0gMSA/IGxvY2FsaXplKCdpbnN0YWxsIGV4dGVuc2lvbicsIFwiSW5zdGFsbCBFeHRlbnNpb25cIikgOiBsb2NhbGl6ZSgnaW5zdGFsbCBleHRlbnNpb25zJywgXCJJbnN0YWxsIEV4dGVuc2lvbnNcIiksXG5cdFx0XHRcdGRldGFpbDogZXh0ZW5zaW9ucy5sZW5ndGggPT09IDFcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdpbnN0YWxsIHNpbmdsZSBleHRlbnNpb24nLCBcIldvdWxkIHlvdSBsaWtlIHRvIGluc3RhbGwgYW5kIHN5bmNocm9uaXplICd7MH0nIGV4dGVuc2lvbiBhY3Jvc3MgeW91ciBkZXZpY2VzP1wiLCBleHRlbnNpb25zWzBdLmRpc3BsYXlOYW1lKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2luc3RhbGwgbXVsdGlwbGUgZXh0ZW5zaW9ucycsIFwiV291bGQgeW91IGxpa2UgdG8gaW5zdGFsbCBhbmQgc3luY2hyb25pemUgZXh0ZW5zaW9ucyBhY3Jvc3MgeW91ciBkZXZpY2VzP1wiKSxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ2luc3RhbGwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZJbnN0YWxsXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBmYWxzZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnaW5zdGFsbCBhbmQgZG8gbm8gc3luYycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJJbnN0YWxsIChEbyAmJm5vdCBzeW5jKVwiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRnZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCk6IFByb21pc2U8SUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3Q+IHtcblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXJ2ZXIoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciB8IG51bGwge1xuXHRcdGlmIChleHRlbnNpb24uaXNXb3Jrc3BhY2VTY29wZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFdvcmtzcGFjZUV4dGVuc2lvbnNTZXJ2ZXIoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UuZ2V0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcihleHRlbnNpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXb3Jrc3BhY2VFeHRlbnNpb25zU2VydmVyKCk6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyIHtcblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcjtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdObyBleHRlbnNpb24gc2VydmVyIGZvdW5kJyk7XG5cdH1cblxuXHRhc3luYyByZXF1ZXN0UHVibGlzaGVyVHJ1c3QoZXh0ZW5zaW9uczogSW5zdGFsbEV4dGVuc2lvbkluZm9bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1hbmlmZXN0cyA9IGF3YWl0IFByb21pc2UuYWxsKGV4dGVuc2lvbnMubWFwKGFzeW5jICh7IGV4dGVuc2lvbiB9KSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0TWFuaWZlc3QoZXh0ZW5zaW9uLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmICghbWFuaWZlc3QpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdNYW5pZmVzdCBpcyBub3QgZm91bmQnLCBcIkluc3RhbGxpbmcgRXh0ZW5zaW9uIHswfSBmYWlsZWQ6IE1hbmlmZXN0IGlzIG5vdCBmb3VuZC5cIiwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5uYW1lKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbWFuaWZlc3Q7XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgdGhpcy5jaGVja0ZvclRydXN0ZWRQdWJsaXNoZXJzKGV4dGVuc2lvbnMubWFwKChlLCBpbmRleCkgPT4gKHsgZXh0ZW5zaW9uOiBlLmV4dGVuc2lvbiwgbWFuaWZlc3Q6IG1hbmlmZXN0c1tpbmRleF0sIGNoZWNrRm9yUGFja0FuZERlcGVuZGVuY2llczogIWUub3B0aW9ucz8uZG9ub3RJbmNsdWRlUGFja0FuZERlcGVuZGVuY2llcyB9KSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjaGVja0ZvclRydXN0ZWRQdWJsaXNoZXJzKGV4dGVuc2lvbnM6IHsgZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbjsgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdDsgY2hlY2tGb3JQYWNrQW5kRGVwZW5kZW5jaWVzOiBib29sZWFuIH1bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHVudHJ1c3RlZEV4dGVuc2lvbnM6IElHYWxsZXJ5RXh0ZW5zaW9uW10gPSBbXTtcblx0XHRjb25zdCB1bnRydXN0ZWRFeHRlbnNpb25NYW5pZmVzdHM6IElFeHRlbnNpb25NYW5pZmVzdFtdID0gW107XG5cdFx0Y29uc3QgbWFuaWZlc3RzVG9HZXRPdGhlclVudHJ1c3RlZFB1Ymxpc2hlcnM6IElFeHRlbnNpb25NYW5pZmVzdFtdID0gW107XG5cdFx0Zm9yIChjb25zdCB7IGV4dGVuc2lvbiwgbWFuaWZlc3QsIGNoZWNrRm9yUGFja0FuZERlcGVuZGVuY2llcyB9IG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGlmICghZXh0ZW5zaW9uLnByaXZhdGUgJiYgIXRoaXMuaXNQdWJsaXNoZXJUcnVzdGVkKGV4dGVuc2lvbikpIHtcblx0XHRcdFx0dW50cnVzdGVkRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRcdHVudHJ1c3RlZEV4dGVuc2lvbk1hbmlmZXN0cy5wdXNoKG1hbmlmZXN0KTtcblx0XHRcdFx0aWYgKGNoZWNrRm9yUGFja0FuZERlcGVuZGVuY2llcykge1xuXHRcdFx0XHRcdG1hbmlmZXN0c1RvR2V0T3RoZXJVbnRydXN0ZWRQdWJsaXNoZXJzLnB1c2gobWFuaWZlc3QpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF1bnRydXN0ZWRFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG90aGVyVW50cnVzdGVkUHVibGlzaGVycyA9IG1hbmlmZXN0c1RvR2V0T3RoZXJVbnRydXN0ZWRQdWJsaXNoZXJzLmxlbmd0aCA/IGF3YWl0IHRoaXMuZ2V0T3RoZXJVbnRydXN0ZWRQdWJsaXNoZXJzKG1hbmlmZXN0c1RvR2V0T3RoZXJVbnRydXN0ZWRQdWJsaXNoZXJzKSA6IFtdO1xuXHRcdGNvbnN0IGFsbFB1Ymxpc2hlcnMgPSBbLi4uZGlzdGluY3QodW50cnVzdGVkRXh0ZW5zaW9ucywgZSA9PiBlLnB1Ymxpc2hlciksIC4uLm90aGVyVW50cnVzdGVkUHVibGlzaGVyc107XG5cdFx0Y29uc3QgdW52ZXJmaWllZFB1Ymxpc2hlcnMgPSBhbGxQdWJsaXNoZXJzLmZpbHRlcihwID0+ICFwLnB1Ymxpc2hlckRvbWFpbj8udmVyaWZpZWQpO1xuXHRcdGNvbnN0IHZlcmlmaWVkUHVibGlzaGVycyA9IGFsbFB1Ymxpc2hlcnMuZmlsdGVyKHAgPT4gcC5wdWJsaXNoZXJEb21haW4/LnZlcmlmaWVkKTtcblxuXHRcdHR5cGUgVHJ1c3RQdWJsaXNoZXJDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0Y29tbWVudDogJ1JlcG9ydCB0aGUgYWN0aW9uIHRha2VuIGJ5IHRoZSB1c2VyIG9uIHRoZSBwdWJsaXNoZXIgdHJ1c3QgZGlhbG9nJztcblx0XHRcdGFjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhY3Rpb24gdGFrZW4gYnkgdGhlIHVzZXIgb24gdGhlIHB1Ymxpc2hlciB0cnVzdCBkaWFsb2cuIENhbiBiZSB0cnVzdCwgbGVhcm4gbW9yZSBvciBjYW5jZWwuJyB9O1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaWRlbnRpZmllcnMgb2YgdGhlIGV4dGVuc2lvbiBmb3Igd2hpY2ggdGhlIHB1Ymxpc2hlciB0cnVzdCBkaWFsb2cgd2FzIHNob3duLicgfTtcblx0XHR9O1xuXHRcdHR5cGUgVHJ1c3RQdWJsaXNoZXJFdmVudCA9IHtcblx0XHRcdGFjdGlvbjogc3RyaW5nO1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW5zdGFsbEJ1dHRvbjogSVByb21wdEJ1dHRvbjx2b2lkPiA9IHtcblx0XHRcdGxhYmVsOiBhbGxQdWJsaXNoZXJzLmxlbmd0aCA+IDEgPyBsb2NhbGl6ZSh7IGtleTogJ3RydXN0IHB1Ymxpc2hlcnMgYW5kIGluc3RhbGwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiVHJ1c3QgUHVibGlzaGVycyAmICYmSW5zdGFsbFwiKSA6IGxvY2FsaXplKHsga2V5OiAndHJ1c3QgYW5kIGluc3RhbGwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiVHJ1c3QgUHVibGlzaGVyICYgJiZJbnN0YWxsXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFRydXN0UHVibGlzaGVyRXZlbnQsIFRydXN0UHVibGlzaGVyQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25zOnRydXN0UHVibGlzaGVyJywgeyBhY3Rpb246ICd0cnVzdCcsIGV4dGVuc2lvbklkOiB1bnRydXN0ZWRFeHRlbnNpb25zLm1hcChlID0+IGUuaWRlbnRpZmllci5pZCkuam9pbignLCcpIH0pO1xuXHRcdFx0XHR0aGlzLnRydXN0UHVibGlzaGVycyguLi5hbGxQdWJsaXNoZXJzLm1hcChwID0+ICh7IHB1Ymxpc2hlcjogcC5wdWJsaXNoZXIsIHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBwLnB1Ymxpc2hlckRpc3BsYXlOYW1lIH0pKSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGxlYXJuTW9yZUJ1dHRvbjogSVByb21wdEJ1dHRvbjx2b2lkPiA9IHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ2xlYXJuTW9yZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkxlYXJuIE1vcmVcIiksXG5cdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8VHJ1c3RQdWJsaXNoZXJFdmVudCwgVHJ1c3RQdWJsaXNoZXJDbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbnM6dHJ1c3RQdWJsaXNoZXInLCB7IGFjdGlvbjogJ2xlYXJuJywgZXh0ZW5zaW9uSWQ6IHVudHJ1c3RlZEV4dGVuc2lvbnMubWFwKGUgPT4gZS5pZGVudGlmaWVyLmlkKS5qb2luKCcsJykgfSk7XG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoJ3ZzY29kZS5vcGVuJywgVVJJLnBhcnNlKCdodHRwczovL2FrYS5tcy92c2NvZGUtZXh0ZW5zaW9uLXNlY3VyaXR5JykpKTtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGdldFB1Ymxpc2hlckxpbmsgPSAoeyBwdWJsaXNoZXJEaXNwbGF5TmFtZSwgcHVibGlzaGVyTGluayB9OiB7IHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBzdHJpbmc7IHB1Ymxpc2hlckxpbms/OiBzdHJpbmcgfSkgPT4ge1xuXHRcdFx0cmV0dXJuIHB1Ymxpc2hlckxpbmsgPyBgWyR7cHVibGlzaGVyRGlzcGxheU5hbWV9XSgke3B1Ymxpc2hlckxpbmt9KWAgOiBwdWJsaXNoZXJEaXNwbGF5TmFtZTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdW52ZXJpZmllZExpbmsgPSAnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXZlcmlmeS1wdWJsaXNoZXInO1xuXG5cdFx0Y29uc3QgdGl0bGUgPSBhbGxQdWJsaXNoZXJzLmxlbmd0aCA9PT0gMVxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hlY2tUcnVzdGVkUHVibGlzaGVyVGl0bGUnLCBcIkRvIHlvdSB0cnVzdCB0aGUgcHVibGlzaGVyIFxcXCJ7MH1cXFwiP1wiLCBhbGxQdWJsaXNoZXJzWzBdLnB1Ymxpc2hlckRpc3BsYXlOYW1lKVxuXHRcdFx0OiBhbGxQdWJsaXNoZXJzLmxlbmd0aCA9PT0gMlxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGVja1R3b1RydXN0ZWRQdWJsaXNoZXJzVGl0bGUnLCBcIkRvIHlvdSB0cnVzdCBwdWJsaXNoZXJzIFxcXCJ7MH1cXFwiIGFuZCBcXFwiezF9XFxcIj9cIiwgYWxsUHVibGlzaGVyc1swXS5wdWJsaXNoZXJEaXNwbGF5TmFtZSwgYWxsUHVibGlzaGVyc1sxXS5wdWJsaXNoZXJEaXNwbGF5TmFtZSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hlY2tBbGxUcnVzdGVkUHVibGlzaGVyc1RpdGxlJywgXCJEbyB5b3UgdHJ1c3QgdGhlIHB1Ymxpc2hlciBcXFwiezB9XFxcIiBhbmQgezF9IG90aGVycz9cIiwgYWxsUHVibGlzaGVyc1swXS5wdWJsaXNoZXJEaXNwbGF5TmFtZSwgYWxsUHVibGlzaGVycy5sZW5ndGggLSAxKTtcblxuXHRcdGNvbnN0IGN1c3RvbU1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUsIGlzVHJ1c3RlZDogdHJ1ZSB9KTtcblxuXHRcdGlmICh1bnRydXN0ZWRFeHRlbnNpb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gdW50cnVzdGVkRXh0ZW5zaW9uc1swXTtcblx0XHRcdGNvbnN0IG1hbmlmZXN0ID0gdW50cnVzdGVkRXh0ZW5zaW9uTWFuaWZlc3RzWzBdO1xuXHRcdFx0aWYgKG90aGVyVW50cnVzdGVkUHVibGlzaGVycy5sZW5ndGgpIHtcblx0XHRcdFx0Y3VzdG9tTWVzc2FnZS5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnZXh0ZW5zaW9uIHB1Ymxpc2hlZCBieSBtZXNzYWdlJywgXCJUaGUgZXh0ZW5zaW9uIHswfSBpcyBwdWJsaXNoZWQgYnkgezF9LlwiLCBgWyR7ZXh0ZW5zaW9uLmRpc3BsYXlOYW1lfV0oJHtleHRlbnNpb24uZGV0YWlsc0xpbmt9KWAsIGdldFB1Ymxpc2hlckxpbmsoZXh0ZW5zaW9uKSkpO1xuXHRcdFx0XHRjdXN0b21NZXNzYWdlLmFwcGVuZE1hcmtkb3duKCcmbmJzcDsnKTtcblx0XHRcdFx0Y29uc3QgY29tbWFuZFVyaSA9IGNyZWF0ZUNvbW1hbmRVcmkoJ2V4dGVuc2lvbi5vcGVuJywgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIG1hbmlmZXN0LmV4dGVuc2lvblBhY2s/Lmxlbmd0aCA/ICdleHRlbnNpb25QYWNrJyA6ICdkZXBlbmRlbmNpZXMnKS50b1N0cmluZygpO1xuXHRcdFx0XHRpZiAob3RoZXJVbnRydXN0ZWRQdWJsaXNoZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdGN1c3RvbU1lc3NhZ2UuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ3NpbmdsZVVudHJ1c3RlZFB1Ymxpc2hlcicsIFwiSW5zdGFsbGluZyB0aGlzIGV4dGVuc2lvbiB3aWxsIGFsc28gaW5zdGFsbCBbZXh0ZW5zaW9uc10oezB9KSBwdWJsaXNoZWQgYnkgezF9LlwiLCBjb21tYW5kVXJpLCBnZXRQdWJsaXNoZXJMaW5rKG90aGVyVW50cnVzdGVkUHVibGlzaGVyc1swXSkpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjdXN0b21NZXNzYWdlLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdtZXNzYWdlMycsIFwiSW5zdGFsbGluZyB0aGlzIGV4dGVuc2lvbiB3aWxsIGFsc28gaW5zdGFsbCBbZXh0ZW5zaW9uc10oezB9KSBwdWJsaXNoZWQgYnkgezF9IGFuZCB7Mn0uXCIsIGNvbW1hbmRVcmksIG90aGVyVW50cnVzdGVkUHVibGlzaGVycy5zbGljZSgwLCBvdGhlclVudHJ1c3RlZFB1Ymxpc2hlcnMubGVuZ3RoIC0gMSkubWFwKHAgPT4gZ2V0UHVibGlzaGVyTGluayhwKSkuam9pbignLCAnKSwgZ2V0UHVibGlzaGVyTGluayhvdGhlclVudHJ1c3RlZFB1Ymxpc2hlcnNbb3RoZXJVbnRydXN0ZWRQdWJsaXNoZXJzLmxlbmd0aCAtIDFdKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGN1c3RvbU1lc3NhZ2UuYXBwZW5kTWFya2Rvd24oJyZuYnNwOycpO1xuXHRcdFx0XHRjdXN0b21NZXNzYWdlLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdmaXJzdFRpbWVJbnN0YWxsaW5nTWVzc2FnZScsIFwiVGhpcyBpcyB0aGUgZmlyc3QgdGltZSB5b3UncmUgaW5zdGFsbGluZyBleHRlbnNpb25zIGZyb20gdGhlc2UgcHVibGlzaGVycy5cIikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y3VzdG9tTWVzc2FnZS5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnbWVzc2FnZTEnLCBcIlRoZSBleHRlbnNpb24gezB9IGlzIHB1Ymxpc2hlZCBieSB7MX0uIFRoaXMgaXMgdGhlIGZpcnN0IGV4dGVuc2lvbiB5b3UncmUgaW5zdGFsbGluZyBmcm9tIHRoaXMgcHVibGlzaGVyLlwiLCBgWyR7ZXh0ZW5zaW9uLmRpc3BsYXlOYW1lfV0oJHtleHRlbnNpb24uZGV0YWlsc0xpbmt9KWAsIGdldFB1Ymxpc2hlckxpbmsoZXh0ZW5zaW9uKSkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdXN0b21NZXNzYWdlLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdtdWx0aUluc3RhbGxNZXNzYWdlJywgXCJUaGlzIGlzIHRoZSBmaXJzdCB0aW1lIHlvdSdyZSBpbnN0YWxsaW5nIGV4dGVuc2lvbnMgZnJvbSBwdWJsaXNoZXJzIHswfSBhbmQgezF9LlwiLCBnZXRQdWJsaXNoZXJMaW5rKGFsbFB1Ymxpc2hlcnNbMF0pLCBnZXRQdWJsaXNoZXJMaW5rKGFsbFB1Ymxpc2hlcnNbYWxsUHVibGlzaGVycy5sZW5ndGggLSAxXSkpKTtcblx0XHR9XG5cblx0XHRpZiAodmVyaWZpZWRQdWJsaXNoZXJzLmxlbmd0aCB8fCB1bnZlcmZpaWVkUHVibGlzaGVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGZvciAoY29uc3QgcHVibGlzaGVyIG9mIHZlcmlmaWVkUHVibGlzaGVycykge1xuXHRcdFx0XHRjdXN0b21NZXNzYWdlLmFwcGVuZFRleHQoJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBwdWJsaXNoZXJWZXJpZmllZE1lc3NhZ2UgPSBsb2NhbGl6ZSgndmVyaWZpZWRQdWJsaXNoZXJXaXRoTmFtZScsIFwiezB9IGhhcyB2ZXJpZmllZCBvd25lcnNoaXAgb2YgezF9LlwiLCBnZXRQdWJsaXNoZXJMaW5rKHB1Ymxpc2hlciksIGBbJChsaW5rLWV4dGVybmFsKSAke1VSSS5wYXJzZShwdWJsaXNoZXIucHVibGlzaGVyRG9tYWluIS5saW5rKS5hdXRob3JpdHl9XSgke3B1Ymxpc2hlci5wdWJsaXNoZXJEb21haW4hLmxpbmt9KWApO1xuXHRcdFx0XHRjdXN0b21NZXNzYWdlLmFwcGVuZE1hcmtkb3duKGAkKCR7dmVyaWZpZWRQdWJsaXNoZXJJY29uLmlkfSkmbmJzcDske3B1Ymxpc2hlclZlcmlmaWVkTWVzc2FnZX1gKTtcblx0XHRcdH1cblx0XHRcdGlmICh1bnZlcmZpaWVkUHVibGlzaGVycy5sZW5ndGgpIHtcblx0XHRcdFx0Y3VzdG9tTWVzc2FnZS5hcHBlbmRUZXh0KCdcXG4nKTtcblx0XHRcdFx0aWYgKHVudmVyZmlpZWRQdWJsaXNoZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdGN1c3RvbU1lc3NhZ2UuYXBwZW5kTWFya2Rvd24oYCQoJHtDb2RpY29uLnVudmVyaWZpZWQuaWR9KSZuYnNwOyR7bG9jYWxpemUoJ3VudmVyaWZpZWRQdWJsaXNoZXJXaXRoTmFtZScsIFwiezB9IGlzIFsqKm5vdCoqIHZlcmlmaWVkXSh7MX0pLlwiLCBnZXRQdWJsaXNoZXJMaW5rKHVudmVyZmlpZWRQdWJsaXNoZXJzWzBdKSwgdW52ZXJpZmllZExpbmspfWApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGN1c3RvbU1lc3NhZ2UuYXBwZW5kTWFya2Rvd24oYCQoJHtDb2RpY29uLnVudmVyaWZpZWQuaWR9KSZuYnNwOyR7bG9jYWxpemUoJ3VudmVyaWZpZWRQdWJsaXNoZXJzJywgXCJ7MH0gYW5kIHsxfSBhcmUgWyoqbm90KiogdmVyaWZpZWRdKHsyfSkuXCIsIHVudmVyZmlpZWRQdWJsaXNoZXJzLnNsaWNlKDAsIHVudmVyZmlpZWRQdWJsaXNoZXJzLmxlbmd0aCAtIDEpLm1hcChwID0+IGdldFB1Ymxpc2hlckxpbmsocCkpLmpvaW4oJywgJyksIGdldFB1Ymxpc2hlckxpbmsodW52ZXJmaWllZFB1Ymxpc2hlcnNbdW52ZXJmaWllZFB1Ymxpc2hlcnMubGVuZ3RoIC0gMV0pLCB1bnZlcmlmaWVkTGluayl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y3VzdG9tTWVzc2FnZS5hcHBlbmRUZXh0KCdcXG4nKTtcblx0XHRcdGN1c3RvbU1lc3NhZ2UuYXBwZW5kTWFya2Rvd24oYCQoJHtDb2RpY29uLnVudmVyaWZpZWQuaWR9KSZuYnNwOyR7bG9jYWxpemUoJ2FsbFVudmVyaWZlZCcsIFwiQWxsIHB1Ymxpc2hlcnMgYXJlIFsqKm5vdCoqIHZlcmlmaWVkXSh7MH0pLlwiLCB1bnZlcmlmaWVkTGluayl9YCk7XG5cdFx0fVxuXG5cdFx0Y3VzdG9tTWVzc2FnZS5hcHBlbmRUZXh0KCdcXG4nKTtcblx0XHRpZiAoYWxsUHVibGlzaGVycy5sZW5ndGggPiAxKSB7XG5cdFx0XHRjdXN0b21NZXNzYWdlLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdtZXNzYWdlNCcsIFwiezB9IGhhcyBubyBjb250cm9sIG92ZXIgdGhlIGJlaGF2aW9yIG9mIHRoaXJkLXBhcnR5IGV4dGVuc2lvbnMsIGluY2x1ZGluZyBob3cgdGhleSBtYW5hZ2UgeW91ciBwZXJzb25hbCBkYXRhLiBQcm9jZWVkIG9ubHkgaWYgeW91IHRydXN0IHRoZSBwdWJsaXNoZXJzLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGN1c3RvbU1lc3NhZ2UuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ21lc3NhZ2UyJywgXCJ7MH0gaGFzIG5vIGNvbnRyb2wgb3ZlciB0aGUgYmVoYXZpb3Igb2YgdGhpcmQtcGFydHkgZXh0ZW5zaW9ucywgaW5jbHVkaW5nIGhvdyB0aGV5IG1hbmFnZSB5b3VyIHBlcnNvbmFsIGRhdGEuIFByb2NlZWQgb25seSBpZiB5b3UgdHJ1c3QgdGhlIHB1Ymxpc2hlci5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZykpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0bWVzc2FnZTogdGl0bGUsXG5cdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0YnV0dG9uczogW2luc3RhbGxCdXR0b24sIGxlYXJuTW9yZUJ1dHRvbl0sXG5cdFx0XHRjYW5jZWxCdXR0b246IHtcblx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8VHJ1c3RQdWJsaXNoZXJFdmVudCwgVHJ1c3RQdWJsaXNoZXJDbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbnM6dHJ1c3RQdWJsaXNoZXInLCB7IGFjdGlvbjogJ2NhbmNlbCcsIGV4dGVuc2lvbklkOiB1bnRydXN0ZWRFeHRlbnNpb25zLm1hcChlID0+IGUuaWRlbnRpZmllci5pZCkuam9pbignLCcpIH0pO1xuXHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Y3VzdG9tOiB7XG5cdFx0XHRcdG1hcmtkb3duRGV0YWlsczogW3sgbWFya2Rvd246IGN1c3RvbU1lc3NhZ2UsIGNsYXNzZXM6IFsnZXh0ZW5zaW9ucy1tYW5hZ2VtZW50LXB1Ymxpc2hlci10cnVzdC1kaWFsb2cnXSB9XSxcblx0XHRcdH1cblx0XHR9KTtcblxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRPdGhlclVudHJ1c3RlZFB1Ymxpc2hlcnMobWFuaWZlc3RzOiBJRXh0ZW5zaW9uTWFuaWZlc3RbXSk6IFByb21pc2U8eyBwdWJsaXNoZXI6IHN0cmluZzsgcHVibGlzaGVyRGlzcGxheU5hbWU6IHN0cmluZzsgcHVibGlzaGVyTGluaz86IHN0cmluZzsgcHVibGlzaGVyRG9tYWluPzogeyBsaW5rOiBzdHJpbmc7IHZlcmlmaWVkOiBib29sZWFuIH0gfVtdPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBtYW5pZmVzdCBvZiBtYW5pZmVzdHMpIHtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgWy4uLihtYW5pZmVzdC5leHRlbnNpb25QYWNrID8/IFtdKSwgLi4uKG1hbmlmZXN0LmV4dGVuc2lvbkRlcGVuZGVuY2llcyA/PyBbXSldKSB7XG5cdFx0XHRcdGNvbnN0IFtwdWJsaXNoZXJJZF0gPSBpZC5zcGxpdCgnLicpO1xuXHRcdFx0XHRpZiAocHVibGlzaGVySWQudG9Mb3dlckNhc2UoKSA9PT0gbWFuaWZlc3QucHVibGlzaGVyLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5pc1B1Ymxpc2hlclVzZXJUcnVzdGVkKHB1Ymxpc2hlcklkLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZXh0ZW5zaW9uSWRzLmFkZChpZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCFleHRlbnNpb25JZHMuc2l6ZSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBleHRlbnNpb25zID0gbmV3IE1hcDxzdHJpbmcsIElHYWxsZXJ5RXh0ZW5zaW9uPigpO1xuXHRcdGF3YWl0IHRoaXMuZ2V0RGVwZW5kZW5jaWVzQW5kUGFja2VkRXh0ZW5zaW9uc1JlY3Vyc2l2ZWx5KFsuLi5leHRlbnNpb25JZHNdLCBleHRlbnNpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBwdWJsaXNoZXJzID0gbmV3IE1hcDxzdHJpbmcsIElHYWxsZXJ5RXh0ZW5zaW9uPigpO1xuXHRcdGZvciAoY29uc3QgWywgZXh0ZW5zaW9uXSBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLnByaXZhdGUgfHwgdGhpcy5pc1B1Ymxpc2hlclRydXN0ZWQoZXh0ZW5zaW9uKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHB1Ymxpc2hlcnMuc2V0KGV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSwgZXh0ZW5zaW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIFsuLi5wdWJsaXNoZXJzLnZhbHVlcygpXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RGVwZW5kZW5jaWVzQW5kUGFja2VkRXh0ZW5zaW9uc1JlY3Vyc2l2ZWx5KHRvR2V0OiBzdHJpbmdbXSwgcmVzdWx0OiBNYXA8c3RyaW5nLCBJR2FsbGVyeUV4dGVuc2lvbj4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0b0dldC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKHRvR2V0Lm1hcChpZCA9PiAoeyBpZCB9KSksIHRva2VuKTtcblx0XHRmb3IgKGxldCBpZHggPSAwOyBpZHggPCBleHRlbnNpb25zLmxlbmd0aDsgaWR4KyspIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGV4dGVuc2lvbnNbaWR4XTtcblx0XHRcdHJlc3VsdC5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwgZXh0ZW5zaW9uKTtcblx0XHR9XG5cdFx0dG9HZXQgPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoaXNOb25FbXB0eUFycmF5KGV4dGVuc2lvbi5wcm9wZXJ0aWVzLmRlcGVuZGVuY2llcykpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBpZCBvZiBleHRlbnNpb24ucHJvcGVydGllcy5kZXBlbmRlbmNpZXMpIHtcblx0XHRcdFx0XHRpZiAoIXJlc3VsdC5oYXMoaWQudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdFx0XHRcdHRvR2V0LnB1c2goaWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGlzTm9uRW1wdHlBcnJheShleHRlbnNpb24ucHJvcGVydGllcy5leHRlbnNpb25QYWNrKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGV4dGVuc2lvbi5wcm9wZXJ0aWVzLmV4dGVuc2lvblBhY2spIHtcblx0XHRcdFx0XHRpZiAoIXJlc3VsdC5oYXMoaWQudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdFx0XHRcdHRvR2V0LnB1c2goaWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXREZXBlbmRlbmNpZXNBbmRQYWNrZWRFeHRlbnNpb25zUmVjdXJzaXZlbHkodG9HZXQsIHJlc3VsdCwgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjaGVja0ZvcldvcmtzcGFjZVRydXN0KG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QsIHJlcXVpcmVUcnVzdDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChyZXF1aXJlVHJ1c3QgfHwgdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmdldEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnRUeXBlKG1hbmlmZXN0KSA9PT0gZmFsc2UpIHtcblx0XHRcdGNvbnN0IGJ1dHRvbnM6IFdvcmtzcGFjZVRydXN0UmVxdWVzdEJ1dHRvbltdID0gW107XG5cdFx0XHRidXR0b25zLnB1c2goeyBsYWJlbDogbG9jYWxpemUoJ2V4dGVuc2lvbkluc3RhbGxXb3Jrc3BhY2VUcnVzdEJ1dHRvbicsIFwiVHJ1c3QgV29ya3NwYWNlICYgSW5zdGFsbFwiKSwgdHlwZTogJ0NvbnRpbnVlV2l0aFRydXN0JyB9KTtcblx0XHRcdGlmICghcmVxdWlyZVRydXN0KSB7XG5cdFx0XHRcdGJ1dHRvbnMucHVzaCh7IGxhYmVsOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uSW5zdGFsbFdvcmtzcGFjZVRydXN0Q29udGludWVCdXR0b24nLCBcIkluc3RhbGxcIiksIHR5cGU6ICdDb250aW51ZVdpdGhvdXRUcnVzdCcgfSk7XG5cdFx0XHR9XG5cdFx0XHRidXR0b25zLnB1c2goeyBsYWJlbDogbG9jYWxpemUoJ2V4dGVuc2lvbkluc3RhbGxXb3Jrc3BhY2VUcnVzdE1hbmFnZUJ1dHRvbicsIFwiTGVhcm4gTW9yZVwiKSwgdHlwZTogJ01hbmFnZScgfSk7XG5cdFx0XHRjb25zdCB0cnVzdFN0YXRlID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RXb3Jrc3BhY2VUcnVzdCh7XG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdleHRlbnNpb25JbnN0YWxsV29ya3NwYWNlVHJ1c3RNZXNzYWdlJywgXCJFbmFibGluZyB0aGlzIGV4dGVuc2lvbiByZXF1aXJlcyBhIHRydXN0ZWQgd29ya3NwYWNlLlwiKSxcblx0XHRcdFx0YnV0dG9uc1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmICh0cnVzdFN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjaGVja0luc3RhbGxpbmdFeHRlbnNpb25PbldlYihleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuc2VydmVycy5sZW5ndGggIT09IDEgfHwgdGhpcy5zZXJ2ZXJzWzBdICE9PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBub25XZWJFeHRlbnNpb25zID0gW107XG5cdFx0aWYgKG1hbmlmZXN0LmV4dGVuc2lvblBhY2s/Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhtYW5pZmVzdC5leHRlbnNpb25QYWNrLm1hcChpZCA9PiAoeyBpZCB9KSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5zZXJ2ZXJzWzBdLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmNhbkluc3RhbGwoZXh0ZW5zaW9uKSAhPT0gdHJ1ZSkge1xuXHRcdFx0XHRcdG5vbldlYkV4dGVuc2lvbnMucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAobm9uV2ViRXh0ZW5zaW9ucy5sZW5ndGggJiYgbm9uV2ViRXh0ZW5zaW9ucy5sZW5ndGggPT09IGV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoJ05vdCBzdXBwb3J0ZWQgaW4gV2ViJywgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5VbnN1cHBvcnRlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvZHVjdE5hbWUgPSBsb2NhbGl6ZSgnVlMgQ29kZSBmb3IgV2ViJywgXCJ7MH0gZm9yIHRoZSBXZWJcIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZyk7XG5cdFx0Y29uc3QgdmlydHVhbFdvcmtzcGFjZVN1cHBvcnQgPSB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuZ2V0RXh0ZW5zaW9uVmlydHVhbFdvcmtzcGFjZVN1cHBvcnRUeXBlKG1hbmlmZXN0KTtcblx0XHRjb25zdCB2aXJ0dWFsV29ya3NwYWNlU3VwcG9ydFJlYXNvbiA9IGdldFdvcmtzcGFjZVN1cHBvcnRUeXBlTWVzc2FnZShtYW5pZmVzdC5jYXBhYmlsaXRpZXM/LnZpcnR1YWxXb3Jrc3BhY2VzKTtcblx0XHRjb25zdCBoYXNMaW1pdGVkU3VwcG9ydCA9IHZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0ID09PSAnbGltaXRlZCcgfHwgISF2aXJ0dWFsV29ya3NwYWNlU3VwcG9ydFJlYXNvbjtcblxuXHRcdGlmICghbm9uV2ViRXh0ZW5zaW9ucy5sZW5ndGggJiYgIWhhc0xpbWl0ZWRTdXBwb3J0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGltaXRlZFN1cHBvcnRNZXNzYWdlID0gbG9jYWxpemUoJ2xpbWl0ZWQgc3VwcG9ydCcsIFwiJ3swfScgaGFzIGxpbWl0ZWQgZnVuY3Rpb25hbGl0eSBpbiB7MX0uXCIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgcHJvZHVjdE5hbWUpO1xuXHRcdGxldCBtZXNzYWdlOiBzdHJpbmc7XG5cdFx0bGV0IGJ1dHRvbnM6IElQcm9tcHRCdXR0b248dm9pZD5bXSA9IFtdO1xuXHRcdGxldCBkZXRhaWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGluc3RhbGxBbnl3YXlCdXR0b246IElQcm9tcHRCdXR0b248dm9pZD4gPSB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdpbnN0YWxsIGFueXdheXMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZJbnN0YWxsIEFueXdheVwiKSxcblx0XHRcdHJ1bjogKCkgPT4geyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHNob3dFeHRlbnNpb25zQnV0dG9uOiBJUHJvbXB0QnV0dG9uPHZvaWQ+ID0ge1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnc2hvd0V4dGVuc2lvbnMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTaG93IEV4dGVuc2lvbnNcIiksXG5cdFx0XHRydW46ICgpID0+IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoJ2V4dGVuc2lvbi5vcGVuJywgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsICdleHRlbnNpb25QYWNrJykpXG5cdFx0fTtcblxuXHRcdGlmIChub25XZWJFeHRlbnNpb25zLmxlbmd0aCAmJiBoYXNMaW1pdGVkU3VwcG9ydCkge1xuXHRcdFx0bWVzc2FnZSA9IGxpbWl0ZWRTdXBwb3J0TWVzc2FnZTtcblx0XHRcdGRldGFpbCA9IGAke3ZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0UmVhc29uID8gYCR7dmlydHVhbFdvcmtzcGFjZVN1cHBvcnRSZWFzb259XFxuYCA6ICcnfSR7bG9jYWxpemUoJ25vbiB3ZWIgZXh0ZW5zaW9ucyBkZXRhaWwnLCBcIkNvbnRhaW5zIGV4dGVuc2lvbnMgd2hpY2ggYXJlIG5vdCBzdXBwb3J0ZWQuXCIpfWA7XG5cdFx0XHRidXR0b25zID0gW1xuXHRcdFx0XHRpbnN0YWxsQW55d2F5QnV0dG9uLFxuXHRcdFx0XHRzaG93RXh0ZW5zaW9uc0J1dHRvblxuXHRcdFx0XTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChoYXNMaW1pdGVkU3VwcG9ydCkge1xuXHRcdFx0bWVzc2FnZSA9IGxpbWl0ZWRTdXBwb3J0TWVzc2FnZTtcblx0XHRcdGRldGFpbCA9IHZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0UmVhc29uIHx8IHVuZGVmaW5lZDtcblx0XHRcdGJ1dHRvbnMgPSBbaW5zdGFsbEFueXdheUJ1dHRvbl07XG5cdFx0fVxuXG5cdFx0ZWxzZSB7XG5cdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ25vbiB3ZWIgZXh0ZW5zaW9ucycsIFwiJ3swfScgY29udGFpbnMgZXh0ZW5zaW9ucyB3aGljaCBhcmUgbm90IHN1cHBvcnRlZCBpbiB7MX0uXCIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgcHJvZHVjdE5hbWUpO1xuXHRcdFx0YnV0dG9ucyA9IFtcblx0XHRcdFx0aW5zdGFsbEFueXdheUJ1dHRvbixcblx0XHRcdFx0c2hvd0V4dGVuc2lvbnNCdXR0b25cblx0XHRcdF07XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdGRldGFpbCxcblx0XHRcdGJ1dHRvbnMsXG5cdFx0XHRjYW5jZWxCdXR0b246IHtcblx0XHRcdFx0cnVuOiAoKSA9PiB7IHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpOyB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF90YXJnZXRQbGF0Zm9ybVByb21pc2U6IFByb21pc2U8VGFyZ2V0UGxhdGZvcm0+IHwgdW5kZWZpbmVkO1xuXHRnZXRUYXJnZXRQbGF0Zm9ybSgpOiBQcm9taXNlPFRhcmdldFBsYXRmb3JtPiB7XG5cdFx0aWYgKCF0aGlzLl90YXJnZXRQbGF0Zm9ybVByb21pc2UpIHtcblx0XHRcdHRoaXMuX3RhcmdldFBsYXRmb3JtUHJvbWlzZSA9IGNvbXB1dGVUYXJnZXRQbGF0Zm9ybSh0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGFyZ2V0UGxhdGZvcm1Qcm9taXNlO1xuXHR9XG5cblx0YXN5bmMgY2xlYW5VcCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQodGhpcy5zZXJ2ZXJzLm1hcChzZXJ2ZXIgPT4gc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmNsZWFuVXAoKSkpO1xuXHR9XG5cblx0dG9nZ2xlQXBwbGljYXRpb25TY29wZShleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLmdldFNlcnZlcihleHRlbnNpb24pO1xuXHRcdGlmIChzZXJ2ZXIpIHtcblx0XHRcdHJldHVybiBzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudG9nZ2xlQXBwbGljYXRpb25TY29wZShleHRlbnNpb24sIGZyb21Qcm9maWxlTG9jYXRpb24pO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBTdXBwb3J0ZWQnKTtcblx0fVxuXG5cdGNvcHlFeHRlbnNpb25zKGZyb206IFVSSSwgdG86IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm90IFN1cHBvcnRlZCcpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5jb3B5RXh0ZW5zaW9ucyhmcm9tLCB0byk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY29weUV4dGVuc2lvbnMoZnJvbSwgdG8pO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRyZWdpc3RlclBhcnRpY2lwYW50KCkgeyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBTdXBwb3J0ZWQnKTsgfVxuXHRpbnN0YWxsRXh0ZW5zaW9uc0Zyb21Qcm9maWxlKGV4dGVuc2lvbnM6IElFeHRlbnNpb25JZGVudGlmaWVyW10sIGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSwgdG9Qcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uW10+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgU3VwcG9ydGVkJyk7IH1cblxuXHRpc1B1Ymxpc2hlclRydXN0ZWQoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHB1Ymxpc2hlciA9IGV4dGVuc2lvbi5wdWJsaXNoZXIudG9Mb3dlckNhc2UoKTtcblx0XHRpZiAodGhpcy5kZWZhdWx0VHJ1c3RlZFB1Ymxpc2hlcnMuaW5jbHVkZXMocHVibGlzaGVyKSB8fCB0aGlzLmRlZmF1bHRUcnVzdGVkUHVibGlzaGVycy5pbmNsdWRlcyhleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoZSBleHRlbnNpb24gaXMgYWxsb3dlZCBieSBwdWJsaXNoZXIgb3IgZXh0ZW5zaW9uIGlkXG5cdFx0aWYgKHRoaXMuYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLmFsbG93ZWRFeHRlbnNpb25zQ29uZmlnVmFsdWUgJiYgdGhpcy5hbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UuaXNBbGxvd2VkKGV4dGVuc2lvbikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmlzUHVibGlzaGVyVXNlclRydXN0ZWQocHVibGlzaGVyKTtcblx0fVxuXG5cdHByaXZhdGUgaXNQdWJsaXNoZXJVc2VyVHJ1c3RlZChwdWJsaXNoZXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHRydXN0ZWRQdWJsaXNoZXJzID0gdGhpcy5nZXRUcnVzdGVkUHVibGlzaGVyc0Zyb21TdG9yYWdlKCk7XG5cdFx0cmV0dXJuICEhdHJ1c3RlZFB1Ymxpc2hlcnNbcHVibGlzaGVyXTtcblx0fVxuXG5cdGdldFRydXN0ZWRQdWJsaXNoZXJzKCk6IElQdWJsaXNoZXJJbmZvW10ge1xuXHRcdGNvbnN0IHRydXN0ZWRQdWJsaXNoZXJzID0gdGhpcy5nZXRUcnVzdGVkUHVibGlzaGVyc0Zyb21TdG9yYWdlKCk7XG5cdFx0cmV0dXJuIE9iamVjdC5rZXlzKHRydXN0ZWRQdWJsaXNoZXJzKS5tYXAocHVibGlzaGVyID0+IHRydXN0ZWRQdWJsaXNoZXJzW3B1Ymxpc2hlcl0pO1xuXHR9XG5cblx0dHJ1c3RQdWJsaXNoZXJzKC4uLnB1Ymxpc2hlcnM6IElQdWJsaXNoZXJJbmZvW10pOiB2b2lkIHtcblx0XHRjb25zdCB0cnVzdGVkUHVibGlzaGVycyA9IHRoaXMuZ2V0VHJ1c3RlZFB1Ymxpc2hlcnNGcm9tU3RvcmFnZSgpO1xuXHRcdGZvciAoY29uc3QgcHVibGlzaGVyIG9mIHB1Ymxpc2hlcnMpIHtcblx0XHRcdHRydXN0ZWRQdWJsaXNoZXJzW3B1Ymxpc2hlci5wdWJsaXNoZXIudG9Mb3dlckNhc2UoKV0gPSBwdWJsaXNoZXI7XG5cdFx0fVxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVHJ1c3RlZFB1Ymxpc2hlcnNTdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeSh0cnVzdGVkUHVibGlzaGVycyksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHVudHJ1c3RQdWJsaXNoZXJzKC4uLnB1Ymxpc2hlcnM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgdHJ1c3RlZFB1Ymxpc2hlcnMgPSB0aGlzLmdldFRydXN0ZWRQdWJsaXNoZXJzRnJvbVN0b3JhZ2UoKTtcblx0XHRmb3IgKGNvbnN0IHB1Ymxpc2hlciBvZiBwdWJsaXNoZXJzKSB7XG5cdFx0XHRkZWxldGUgdHJ1c3RlZFB1Ymxpc2hlcnNbcHVibGlzaGVyLnRvTG93ZXJDYXNlKCldO1xuXHRcdH1cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFRydXN0ZWRQdWJsaXNoZXJzU3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkodHJ1c3RlZFB1Ymxpc2hlcnMpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIGdldFRydXN0ZWRQdWJsaXNoZXJzRnJvbVN0b3JhZ2UoKTogSVN0cmluZ0RpY3Rpb25hcnk8SVB1Ymxpc2hlckluZm8+IHtcblx0XHRjb25zdCB0cnVzdGVkUHVibGlzaGVycyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0T2JqZWN0PElTdHJpbmdEaWN0aW9uYXJ5PElQdWJsaXNoZXJJbmZvPj4oVHJ1c3RlZFB1Ymxpc2hlcnNTdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIHt9KTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh0cnVzdGVkUHVibGlzaGVycykpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFRydXN0ZWRQdWJsaXNoZXJzU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdHJldHVybiBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdH1cblx0XHRyZXR1cm4gT2JqZWN0LmtleXModHJ1c3RlZFB1Ymxpc2hlcnMpLnJlZHVjZTxJU3RyaW5nRGljdGlvbmFyeTxJUHVibGlzaGVySW5mbz4+KChyZXN1bHQsIHB1Ymxpc2hlcikgPT4ge1xuXHRcdFx0cmVzdWx0W3B1Ymxpc2hlci50b0xvd2VyQ2FzZSgpXSA9IHRydXN0ZWRQdWJsaXNoZXJzW3B1Ymxpc2hlcl07XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0sIE9iamVjdC5jcmVhdGUobnVsbCkpO1xuXHR9XG59XG5cbmNsYXNzIFdvcmtzcGFjZUV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFdPUktTUEFDRV9FWFRFTlNJT05TX0tFWSA9ICd3b3Jrc3BhY2VFeHRlbnNpb25zLmxvY2F0aW9ucyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJbnZhbGlkRXh0ZW5zaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElMb2NhbEV4dGVuc2lvbltdPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJbnZhbGlkRXh0ZW5zaW9ucyA9IHRoaXMuX29uRGlkQ2hhbmdlSW52YWxpZEV4dGVuc2lvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zOiBJTG9jYWxFeHRlbnNpb25bXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGluaXRpYWxpemVQcm9taXNlOiBQcm9taXNlPHZvaWQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaW52YWxpZEV4dGVuc2lvbldhdGNoZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQudGhyb3R0bGU8RmlsZUNoYW5nZXNFdmVudCwgRmlsZUNoYW5nZXNFdmVudFtdPih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UsIChsYXN0LCBlKSA9PiB7XG5cdFx0XHQobGFzdCA9IGxhc3QgPz8gW10pLnB1c2goZSk7XG5cdFx0XHRyZXR1cm4gbGFzdDtcblx0XHR9LCAxMDAwLCBmYWxzZSkoZXZlbnRzID0+IHtcblx0XHRcdGNvbnN0IGNoYW5nZWRJbnZhbGlkRXh0ZW5zaW9ucyA9IHRoaXMuZXh0ZW5zaW9ucy5maWx0ZXIoZXh0ZW5zaW9uID0+ICFleHRlbnNpb24uaXNWYWxpZCAmJiBldmVudHMuc29tZShlID0+IGUuYWZmZWN0cyhleHRlbnNpb24ubG9jYXRpb24pKSk7XG5cdFx0XHRpZiAoY2hhbmdlZEludmFsaWRFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLmNoZWNrRXh0ZW5zaW9uc1ZhbGlkaXR5KGNoYW5nZWRJbnZhbGlkRXh0ZW5zaW9ucyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5pbml0aWFsaXplUHJvbWlzZSA9IHRoaXMuaW5pdGlhbGl6ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nTG9jYXRpb25zID0gdGhpcy5nZXRJbnN0YWxsZWRXb3Jrc3BhY2VFeHRlbnNpb25zTG9jYXRpb25zKCk7XG5cdFx0aWYgKCFleGlzdGluZ0xvY2F0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoZXhpc3RpbmdMb2NhdGlvbnMubWFwKGFzeW5jIGxvY2F0aW9uID0+IHtcblx0XHRcdGlmICghdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmlzSW5zaWRlV29ya3NwYWNlKGxvY2F0aW9uKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgUmVtb3ZpbmcgdGhlIHdvcmtzcGFjZSBleHRlbnNpb24gJHtsb2NhdGlvbi50b1N0cmluZygpfSBhcyBpdCBpcyBub3QgaW5zaWRlIHRoZSB3b3Jrc3BhY2VgKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCEoYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMobG9jYXRpb24pKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgUmVtb3ZpbmcgdGhlIHdvcmtzcGFjZSBleHRlbnNpb24gJHtsb2NhdGlvbi50b1N0cmluZygpfSBhcyBpdCBkb2VzIG5vdCBleGlzdGApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBhd2FpdCB0aGlzLnNjYW5Xb3Jrc3BhY2VFeHRlbnNpb24obG9jYXRpb24pO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5leHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgU2tpcHBpbmcgd29ya3NwYWNlIGV4dGVuc2lvbiAke2xvY2F0aW9uLnRvU3RyaW5nKCl9IGFzIGl0IGRvZXMgbm90IGV4aXN0YCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignU2tpcHBpbmcgdGhlIHdvcmtzcGFjZSBleHRlbnNpb24nLCBsb2NhdGlvbi50b1N0cmluZygpLCBlcnJvcik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zYXZlV29ya3NwYWNlRXh0ZW5zaW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSB3YXRjaEludmFsaWRFeHRlbnNpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuaW52YWxpZEV4dGVuc2lvbldhdGNoZXJzLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgdGhpcy5leHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoIWV4dGVuc2lvbi5pc1ZhbGlkKSB7XG5cdFx0XHRcdHRoaXMuaW52YWxpZEV4dGVuc2lvbldhdGNoZXJzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKGV4dGVuc2lvbi5sb2NhdGlvbikpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2hlY2tFeHRlbnNpb25zVmFsaWRpdHkoZXh0ZW5zaW9uczogSUxvY2FsRXh0ZW5zaW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2YWxpZEV4dGVuc2lvbnM6IElMb2NhbEV4dGVuc2lvbltdID0gW107XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoZXh0ZW5zaW9ucy5tYXAoYXN5bmMgZXh0ZW5zaW9uID0+IHtcblx0XHRcdGNvbnN0IG5ld0V4dGVuc2lvbiA9IGF3YWl0IHRoaXMuc2NhbldvcmtzcGFjZUV4dGVuc2lvbihleHRlbnNpb24ubG9jYXRpb24pO1xuXHRcdFx0aWYgKG5ld0V4dGVuc2lvbj8uaXNWYWxpZCkge1xuXHRcdFx0XHR2YWxpZEV4dGVuc2lvbnMucHVzaChuZXdFeHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgdmFsaWRFeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuZXh0ZW5zaW9ucy5maW5kSW5kZXgoZSA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChlLmxvY2F0aW9uLCBleHRlbnNpb24ubG9jYXRpb24pKTtcblx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9ucy5zcGxpY2UoaW5kZXgsIDEsIGV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdHRoaXMuc2F2ZVdvcmtzcGFjZUV4dGVuc2lvbnMoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSW52YWxpZEV4dGVuc2lvbnMuZmlyZSh2YWxpZEV4dGVuc2lvbnMpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldEluc3RhbGxlZChpbmNsdWRlSW52YWxpZDogYm9vbGVhbik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uW10+IHtcblx0XHRhd2FpdCB0aGlzLmluaXRpYWxpemVQcm9taXNlO1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnMuZmlsdGVyKGUgPT4gaW5jbHVkZUludmFsaWQgfHwgZS5pc1ZhbGlkKTtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGwoZXh0ZW5zaW9uOiBJUmVzb3VyY2VFeHRlbnNpb24pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGF3YWl0IHRoaXMuaW5pdGlhbGl6ZVByb21pc2U7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VFeHRlbnNpb24gPSBhd2FpdCB0aGlzLnNjYW5Xb3Jrc3BhY2VFeHRlbnNpb24oZXh0ZW5zaW9uLmxvY2F0aW9uKTtcblx0XHRpZiAoIXdvcmtzcGFjZUV4dGVuc2lvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgaW5zdGFsbCB0aGUgZXh0ZW5zaW9uIGFzIGl0IGRvZXMgbm90IGV4aXN0LicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4aXN0aW5nRXh0ZW5zaW9uSW5kZXggPSB0aGlzLmV4dGVuc2lvbnMuZmluZEluZGV4KGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdGlmIChleGlzdGluZ0V4dGVuc2lvbkluZGV4ID09PSAtMSkge1xuXHRcdFx0dGhpcy5leHRlbnNpb25zLnB1c2god29ya3NwYWNlRXh0ZW5zaW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5leHRlbnNpb25zLnNwbGljZShleGlzdGluZ0V4dGVuc2lvbkluZGV4LCAxLCB3b3Jrc3BhY2VFeHRlbnNpb24pO1xuXHRcdH1cblxuXHRcdHRoaXMuc2F2ZVdvcmtzcGFjZUV4dGVuc2lvbnMoKTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7fSwge1xuXHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRjb21tZW50OiAnSW5zdGFsbCB3b3Jrc3BhY2UgZXh0ZW5zaW9uJztcblx0XHR9Pignd29ya3NwYWNlZXh0ZW5zaW9uOmluc3RhbGwnKTtcblxuXHRcdHJldHVybiB3b3Jrc3BhY2VFeHRlbnNpb247XG5cdH1cblxuXHRhc3luYyB1bmluc3RhbGwoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmluaXRpYWxpemVQcm9taXNlO1xuXG5cdFx0Y29uc3QgZXhpc3RpbmdFeHRlbnNpb25JbmRleCA9IHRoaXMuZXh0ZW5zaW9ucy5maW5kSW5kZXgoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0aWYgKGV4aXN0aW5nRXh0ZW5zaW9uSW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvbnMuc3BsaWNlKGV4aXN0aW5nRXh0ZW5zaW9uSW5kZXgsIDEpO1xuXHRcdFx0dGhpcy5zYXZlV29ya3NwYWNlRXh0ZW5zaW9ucygpO1xuXHRcdH1cblxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHt9LCB7XG5cdFx0XHRvd25lcjogJ3NhbmR5MDgxJztcblx0XHRcdGNvbW1lbnQ6ICdVbmluc3RhbGwgd29ya3NwYWNlIGV4dGVuc2lvbic7XG5cdFx0fT4oJ3dvcmtzcGFjZWV4dGVuc2lvbjp1bmluc3RhbGwnKTtcblx0fVxuXG5cdGdldEluc3RhbGxlZFdvcmtzcGFjZUV4dGVuc2lvbnNMb2NhdGlvbnMoKTogVVJJW10ge1xuXHRcdGNvbnN0IGxvY2F0aW9uczogVVJJW10gPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChXb3Jrc3BhY2VFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UuV09SS1NQQUNFX0VYVEVOU0lPTlNfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAnW10nKSk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShsb2NhdGlvbnMpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgbG9jYXRpb24gb2YgcGFyc2VkKSB7XG5cdFx0XHRcdFx0aWYgKGlzU3RyaW5nKGxvY2F0aW9uKSkge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5GT0xERVIpIHtcblx0XHRcdFx0XHRcdFx0bG9jYXRpb25zLnB1c2godGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF0udG9SZXNvdXJjZShsb2NhdGlvbikpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEludmFsaWQgdmFsdWUgZm9yICdleHRlbnNpb25zJyBpbiB3b3Jrc3BhY2Ugc3RvcmFnZTogJHtsb2NhdGlvbn1gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bG9jYXRpb25zLnB1c2goVVJJLnJldml2ZShsb2NhdGlvbikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEludmFsaWQgdmFsdWUgZm9yICdleHRlbnNpb25zJyBpbiB3b3Jrc3BhY2Ugc3RvcmFnZTogJHtsb2NhdGlvbnN9YCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBFcnJvciBwYXJzaW5nIHdvcmtzcGFjZSBleHRlbnNpb25zIGxvY2F0aW9uczogJHtnZXRFcnJvck1lc3NhZ2UoZXJyb3IpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYXRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlV29ya3NwYWNlRXh0ZW5zaW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBsb2NhdGlvbnMgPSB0aGlzLmV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiBleHRlbnNpb24ubG9jYXRpb24pO1xuXHRcdGlmICh0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRk9MREVSKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFdvcmtzcGFjZUV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZS5XT1JLU1BBQ0VfRVhURU5TSU9OU19LRVksXG5cdFx0XHRcdEpTT04uc3RyaW5naWZ5KGNvYWxlc2NlKGxvY2F0aW9uc1xuXHRcdFx0XHRcdC5tYXAobG9jYXRpb24gPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLnJlbGF0aXZlUGF0aCh0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXS51cmksIGxvY2F0aW9uKSkpKSxcblx0XHRcdFx0U3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShXb3Jrc3BhY2VFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UuV09SS1NQQUNFX0VYVEVOU0lPTlNfS0VZLCBKU09OLnN0cmluZ2lmeShsb2NhdGlvbnMpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0XHR0aGlzLndhdGNoSW52YWxpZEV4dGVuc2lvbnMoKTtcblx0fVxuXG5cdGFzeW5jIHNjYW5Xb3Jrc3BhY2VFeHRlbnNpb24obG9jYXRpb246IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHNjYW5uZWRFeHRlbnNpb24gPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuRXhpc3RpbmdFeHRlbnNpb24obG9jYXRpb24sIEV4dGVuc2lvblR5cGUuVXNlciwgeyBpbmNsdWRlSW52YWxpZDogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gc2Nhbm5lZEV4dGVuc2lvbiA/IHRoaXMudG9Mb2NhbFdvcmtzcGFjZUV4dGVuc2lvbihzY2FubmVkRXh0ZW5zaW9uKSA6IG51bGw7XG5cdH1cblxuXHRhc3luYyB0b0xvY2FsV29ya3NwYWNlRXh0ZW5zaW9uKGV4dGVuc2lvbjogSVNjYW5uZWRFeHRlbnNpb24pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUoZXh0ZW5zaW9uLmxvY2F0aW9uKTtcblx0XHRsZXQgcmVhZG1lVXJsOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNoYW5nZWxvZ1VybDogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRyZWFkbWVVcmwgPSBzdGF0LmNoaWxkcmVuLmZpbmQoKHsgbmFtZSB9KSA9PiAvXnJlYWRtZShcXC50eHR8XFwubWR8KSQvaS50ZXN0KG5hbWUpKT8ucmVzb3VyY2U7XG5cdFx0XHRjaGFuZ2Vsb2dVcmwgPSBzdGF0LmNoaWxkcmVuLmZpbmQoKHsgbmFtZSB9KSA9PiAvXmNoYW5nZWxvZyhcXC50eHR8XFwubWR8KSQvaS50ZXN0KG5hbWUpKT8ucmVzb3VyY2U7XG5cdFx0fVxuXHRcdGNvbnN0IHZhbGlkYXRpb25zOiBbU2V2ZXJpdHksIHN0cmluZ11bXSA9IFsuLi5leHRlbnNpb24udmFsaWRhdGlvbnNdO1xuXHRcdGxldCBpc1ZhbGlkID0gZXh0ZW5zaW9uLmlzVmFsaWQ7XG5cdFx0aWYgKGV4dGVuc2lvbi5tYW5pZmVzdC5tYWluKSB7XG5cdFx0XHRpZiAoIShhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgoZXh0ZW5zaW9uLmxvY2F0aW9uLCBleHRlbnNpb24ubWFuaWZlc3QubWFpbikpKSkge1xuXHRcdFx0XHRpc1ZhbGlkID0gZmFsc2U7XG5cdFx0XHRcdHZhbGlkYXRpb25zLnB1c2goW1NldmVyaXR5LkVycm9yLCBsb2NhbGl6ZSgnbWFpbi5ub3RGb3VuZCcsIFwiQ2Fubm90IGFjdGl2YXRlIGJlY2F1c2UgezB9IG5vdCBmb3VuZFwiLCBleHRlbnNpb24ubWFuaWZlc3QubWFpbildKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkZW50aWZpZXI6IGV4dGVuc2lvbi5pZGVudGlmaWVyLFxuXHRcdFx0dHlwZTogZXh0ZW5zaW9uLnR5cGUsXG5cdFx0XHRpc0J1aWx0aW46IGV4dGVuc2lvbi5pc0J1aWx0aW4gfHwgISFleHRlbnNpb24ubWV0YWRhdGE/LmlzQnVpbHRpbixcblx0XHRcdGxvY2F0aW9uOiBleHRlbnNpb24ubG9jYXRpb24sXG5cdFx0XHRtYW5pZmVzdDogZXh0ZW5zaW9uLm1hbmlmZXN0LFxuXHRcdFx0dGFyZ2V0UGxhdGZvcm06IGV4dGVuc2lvbi50YXJnZXRQbGF0Zm9ybSxcblx0XHRcdHZhbGlkYXRpb25zLFxuXHRcdFx0aXNWYWxpZCxcblx0XHRcdHJlYWRtZVVybCxcblx0XHRcdGNoYW5nZWxvZ1VybCxcblx0XHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBleHRlbnNpb24ubWV0YWRhdGE/LnB1Ymxpc2hlckRpc3BsYXlOYW1lLFxuXHRcdFx0cHVibGlzaGVySWQ6IGV4dGVuc2lvbi5tZXRhZGF0YT8ucHVibGlzaGVySWQgfHwgbnVsbCxcblx0XHRcdGlzQXBwbGljYXRpb25TY29wZWQ6ICEhZXh0ZW5zaW9uLm1ldGFkYXRhPy5pc0FwcGxpY2F0aW9uU2NvcGVkLFxuXHRcdFx0aXNNYWNoaW5lU2NvcGVkOiAhIWV4dGVuc2lvbi5tZXRhZGF0YT8uaXNNYWNoaW5lU2NvcGVkLFxuXHRcdFx0aXNQcmVSZWxlYXNlVmVyc2lvbjogISFleHRlbnNpb24ubWV0YWRhdGE/LmlzUHJlUmVsZWFzZVZlcnNpb24sXG5cdFx0XHRoYXNQcmVSZWxlYXNlVmVyc2lvbjogISFleHRlbnNpb24ubWV0YWRhdGE/Lmhhc1ByZVJlbGVhc2VWZXJzaW9uLFxuXHRcdFx0cHJlUmVsZWFzZTogISFleHRlbnNpb24ubWV0YWRhdGE/LnByZVJlbGVhc2UsXG5cdFx0XHRpbnN0YWxsZWRUaW1lc3RhbXA6IGV4dGVuc2lvbi5tZXRhZGF0YT8uaW5zdGFsbGVkVGltZXN0YW1wLFxuXHRcdFx0dXBkYXRlZDogISFleHRlbnNpb24ubWV0YWRhdGE/LnVwZGF0ZWQsXG5cdFx0XHRwaW5uZWQ6ICEhZXh0ZW5zaW9uLm1ldGFkYXRhPy5waW5uZWQsXG5cdFx0XHRmb3JjZUF1dG9VcGRhdGU6IGZhbHNlLFxuXHRcdFx0aXNXb3Jrc3BhY2VTY29wZWQ6IHRydWUsXG5cdFx0XHRwcml2YXRlOiBmYWxzZSxcblx0XHRcdHNvdXJjZTogJ3Jlc291cmNlJyxcblx0XHRcdHNpemU6IGV4dGVuc2lvbi5tZXRhZGF0YT8uc2l6ZSA/PyAwLFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTLE9BQU8sd0JBQXdCO0FBQ2pEO0FBQUEsRUFDdUY7QUFBQSxFQUFvRjtBQUFBLEVBQTBCO0FBQUEsRUFBd0M7QUFBQSxFQUFrQjtBQUFBLEVBRTlQO0FBQUEsRUFHQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBQ1AsU0FBeUcseUNBQW1MO0FBQzVSLFNBQVMsZUFBZSx5QkFBNkMsc0NBQXNEO0FBQzNILFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CLDZCQUE2QjtBQUN6RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxVQUFVLFVBQVUsdUJBQXVCO0FBQ3BELFNBQVMsc0JB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QUFBQSxNQUN2QyxxQkFBcUIsQ0FBQyxDQUFDLFVBQVUsVUFBVTtBQUFBLE1BQzNDLHNCQUFzQixDQUFDLENBQUMsVUFBVSxVQUFVO0FBQUEsTUFDNUMsWUFBWSxDQUFDLENBQUMsVUFBVSxVQUFVO0FBQUEsTUFDbEMsb0JBQW9CLFVBQVUsVUFBVTtBQUFBLE1BQ3hDLFNBQVMsQ0FBQyxDQUFDLFVBQVUsVUFBVTtBQUFBLE1BQy9CLFFBQVEsQ0FBQyxDQUFDLFVBQVUsVUFBVTtBQUFBLE1BQzlCLGlCQUFpQjtBQUFBLE1BQ2pCLG1CQUFtQjtBQUFBLE1BQ25CLFNBQVM7QUFBQSxNQUNULFFBQVE7QUFBQSxNQUNSLE1BQU0sVUFBVSxVQUFVLFFBQVE7QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFDRDtBQXRPTSxxQ0FFbUIsMkJBQTJCO0FBRjlDLHVDQUFOO0FBQUEsRUFhRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBbkJHOyIsCiAgIm5hbWVzIjogWyJleHRlbnNpb25zIiwgInNlcnZlciIsICJleHRlbnNpb24iXQp9Cg==
