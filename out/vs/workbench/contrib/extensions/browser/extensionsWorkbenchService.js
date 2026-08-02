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
var __decorateParam = (index2, decorator) => (target, key) => decorator(target, key, index2);
import * as nls from "../../../../nls.js";
import * as semver from "../../../../base/common/semver/semver.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { index } from "../../../../base/common/arrays.js";
import { Promises, ThrottledDelayer, createCancelablePromise, disposableTimeout } from "../../../../base/common/async.js";
import { CancellationError, getErrorMessage, isCancellationError } from "../../../../base/common/errors.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { singlePagePager } from "../../../../base/common/paging.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import {
  IExtensionGalleryService,
  InstallOperation,
  WEB_EXTENSION_TAG,
  isTargetPlatformCompatible,
  EXTENSION_IDENTIFIER_REGEX,
  TargetPlatformToString,
  IAllowedExtensionsService,
  AllowedExtensionsConfigKey,
  EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT,
  ExtensionManagementError,
  ExtensionManagementErrorCode,
  shouldRequireRepositorySignatureFor
} from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IWorkbenchExtensionManagementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData, areSameExtensions, groupByExtension, getGalleryExtensionId, findMatchingMaliciousEntry } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { URI } from "../../../../base/common/uri.js";
import { ExtensionState, AutoUpdateConfigurationKey, AutoUpdateDelayConfigurationKey, AutoCheckUpdatesConfigurationKey, HasOutdatedExtensionsContext, ExtensionRuntimeActionType, AutoRestartConfigurationKey, VIEWLET_ID } from "../common/extensions.js";
import { ACTIVE_GROUP, IEditorService, MODAL_GROUP, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IURLService } from "../../../../platform/url/common/url.js";
import { ExtensionsInput } from "../common/extensionsInput.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import * as resources from "../../../../base/common/resources.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ExtensionType, TargetPlatform, ExtensionIdentifier, isApplicationScopedExtension } from "../../../../platform/extensions/common/extensions.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { FileAccess } from "../../../../base/common/network.js";
import { IIgnoredExtensionsManagementService } from "../../../../platform/userDataSync/common/ignoredExtensions.js";
import { IUserDataAutoSyncService, IUserDataSyncEnablementService, SyncResource } from "../../../../platform/userDataSync/common/userDataSync.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { isDefined, isString, isUndefined } from "../../../../base/common/types.js";
import { IExtensionManifestPropertiesService } from "../../../services/extensions/common/extensionManifestPropertiesService.js";
import { IExtensionService, toExtension, toExtensionDescription } from "../../../services/extensions/common/extensions.js";
import { isWeb, language } from "../../../../base/common/platform.js";
import { getLocale } from "../../../../platform/languagePacks/common/languagePacks.js";
import { ILocaleService } from "../../../services/localization/common/locale.js";
import { TelemetryTrustedValue } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { ILifecycleService, LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IUpdateService, StateType } from "../../../../platform/update/common/update.js";
import { isEngineValid } from "../../../../platform/extensions/common/extensionValidator.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ShowCurrentReleaseNotesActionId } from "../../update/common/update.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { ExtensionGalleryResourceType, ExtensionGalleryServiceUrlConfigKey, getExtensionGalleryManifestResourceUri, IExtensionGalleryManifestService } from "../../../../platform/extensionManagement/common/extensionGalleryManifest.js";
import { fromNow } from "../../../../base/common/date.js";
import { hash } from "../../../../base/common/hash.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IMeteredConnectionService } from "../../../../platform/meteredConnection/common/meteredConnection.js";
let Extension = class {
  constructor(stateProvider, runtimeStateProvider, server, local, _gallery, resourceExtensionInfo, galleryService, telemetryService, logService, fileService, productService) {
    this.stateProvider = stateProvider;
    this.runtimeStateProvider = runtimeStateProvider;
    this.server = server;
    this.local = local;
    this._gallery = _gallery;
    this.resourceExtensionInfo = resourceExtensionInfo;
    this.galleryService = galleryService;
    this.telemetryService = telemetryService;
    this.logService = logService;
    this.fileService = fileService;
    this.productService = productService;
    this.enablementState = EnablementState.EnabledGlobally;
    this.galleryResourcesCache = /* @__PURE__ */ new Map();
  }
  get resourceExtension() {
    if (this.resourceExtensionInfo) {
      return this.resourceExtensionInfo.resourceExtension;
    }
    if (this.local?.isWorkspaceScoped) {
      return {
        type: "resource",
        identifier: this.local.identifier,
        location: this.local.location,
        manifest: this.local.manifest,
        changelogUri: this.local.changelogUrl,
        readmeUri: this.local.readmeUrl
      };
    }
    return void 0;
  }
  get gallery() {
    return this._gallery;
  }
  set gallery(gallery) {
    this._gallery = gallery;
    this.galleryResourcesCache.clear();
  }
  get missingFromGallery() {
    return !!this._missingFromGallery;
  }
  set missingFromGallery(missing) {
    this._missingFromGallery = missing;
  }
  get type() {
    return this.local ? this.local.type : ExtensionType.User;
  }
  get isBuiltin() {
    return this.local ? this.local.isBuiltin : false;
  }
  get isWorkspaceScoped() {
    if (this.local) {
      return this.local.isWorkspaceScoped;
    }
    if (this.resourceExtensionInfo) {
      return this.resourceExtensionInfo.isWorkspaceScoped;
    }
    return false;
  }
  get name() {
    if (this.gallery) {
      return this.gallery.name;
    }
    return this.getManifestFromLocalOrResource()?.name ?? "";
  }
  get displayName() {
    if (this.gallery) {
      return this.gallery.displayName || this.gallery.name;
    }
    return this.getManifestFromLocalOrResource()?.displayName ?? this.name;
  }
  get identifier() {
    if (this.gallery) {
      return this.gallery.identifier;
    }
    if (this.resourceExtension) {
      return this.resourceExtension.identifier;
    }
    return this.local?.identifier ?? { id: "" };
  }
  get uuid() {
    return this.gallery ? this.gallery.identifier.uuid : this.local?.identifier.uuid;
  }
  get publisher() {
    if (this.gallery) {
      return this.gallery.publisher;
    }
    return this.getManifestFromLocalOrResource()?.publisher ?? "";
  }
  get publisherDisplayName() {
    if (this.gallery) {
      return this.gallery.publisherDisplayName || this.gallery.publisher;
    }
    if (this.local?.publisherDisplayName) {
      return this.local.publisherDisplayName;
    }
    return this.publisher;
  }
  get publisherUrl() {
    return this.gallery?.publisherLink ? URI.parse(this.gallery.publisherLink) : void 0;
  }
  get publisherDomain() {
    return this.gallery?.publisherDomain;
  }
  get publisherSponsorLink() {
    return this.gallery?.publisherSponsorLink ? URI.parse(this.gallery.publisherSponsorLink) : void 0;
  }
  get version() {
    return this.local ? this.local.manifest.version : this.latestVersion;
  }
  get private() {
    return this.gallery ? this.gallery.private : this.local ? this.local.private : false;
  }
  get pinned() {
    return !!this.local?.pinned;
  }
  get latestVersion() {
    return this.gallery ? this.gallery.version : this.getManifestFromLocalOrResource()?.version ?? "";
  }
  get description() {
    return this.gallery ? this.gallery.description : this.getManifestFromLocalOrResource()?.description ?? "";
  }
  get url() {
    return this.gallery?.detailsLink;
  }
  get iconUrl() {
    return this.galleryIconUrl || this.resourceExtensionIconUrl || this.localIconUrl || this.defaultIconUrl;
  }
  get iconUrlFallback() {
    return this.gallery?.assets.icon?.fallbackUri;
  }
  get localIconUrl() {
    if (this.local && this.local.manifest.icon) {
      return FileAccess.uriToBrowserUri(resources.joinPath(this.local.location, this.local.manifest.icon)).toString(true);
    }
    return void 0;
  }
  get resourceExtensionIconUrl() {
    if (this.resourceExtension?.manifest.icon) {
      return FileAccess.uriToBrowserUri(resources.joinPath(this.resourceExtension.location, this.resourceExtension.manifest.icon)).toString(true);
    }
    return void 0;
  }
  get galleryIconUrl() {
    return this.gallery?.assets.icon?.uri;
  }
  get defaultIconUrl() {
    if (this.type === ExtensionType.System && this.local) {
      if (this.local.manifest && this.local.manifest.contributes) {
        if (Array.isArray(this.local.manifest.contributes.themes) && this.local.manifest.contributes.themes.length) {
          return FileAccess.asBrowserUri("vs/workbench/contrib/extensions/browser/media/theme-icon.png").toString(true);
        }
        if (Array.isArray(this.local.manifest.contributes.grammars) && this.local.manifest.contributes.grammars.length) {
          return FileAccess.asBrowserUri("vs/workbench/contrib/extensions/browser/media/language-icon.svg").toString(true);
        }
      }
    }
    return void 0;
  }
  get repository() {
    return this.gallery && this.gallery.assets.repository ? this.gallery.assets.repository.uri : void 0;
  }
  get licenseUrl() {
    return this.gallery && this.gallery.assets.license ? this.gallery.assets.license.uri : void 0;
  }
  get supportUrl() {
    return this.gallery && this.gallery.supportLink ? this.gallery.supportLink : void 0;
  }
  get state() {
    return this.stateProvider(this);
  }
  get isMalicious() {
    return !!this.malicious || this.enablementState === EnablementState.DisabledByMalicious;
  }
  get maliciousInfoLink() {
    return this.malicious?.learnMoreLink;
  }
  get installCount() {
    return this.gallery ? this.gallery.installCount : void 0;
  }
  get rating() {
    return this.gallery ? this.gallery.rating : void 0;
  }
  get ratingCount() {
    return this.gallery ? this.gallery.ratingCount : void 0;
  }
  get ratingUrl() {
    return this.gallery?.ratingLink;
  }
  get outdated() {
    try {
      if (!this.gallery || !this.local) {
        return false;
      }
      if (this.type === ExtensionType.System && this.productService.quality === "stable" && !this.productService.builtInExtensionsEnabledWithAutoUpdates?.some((id) => id.toLowerCase() === this.identifier.id.toLowerCase())) {
        return false;
      }
      if (!this.local.preRelease && this.gallery.properties.isPreReleaseVersion) {
        return false;
      }
      if (semver.gt(this.latestVersion, this.version)) {
        return true;
      }
      if (this.outdatedTargetPlatform) {
        return true;
      }
    } catch (error) {
    }
    return false;
  }
  get outdatedTargetPlatform() {
    return !!this.local && !!this.gallery && ![TargetPlatform.UNDEFINED, TargetPlatform.WEB].includes(this.local.targetPlatform) && this.gallery.properties.targetPlatform !== TargetPlatform.WEB && this.local.targetPlatform !== this.gallery.properties.targetPlatform && semver.eq(this.latestVersion, this.version);
  }
  get runtimeState() {
    return this.runtimeStateProvider(this);
  }
  get telemetryData() {
    const { local, gallery } = this;
    if (gallery) {
      return getGalleryExtensionTelemetryData(gallery);
    } else if (local) {
      return getLocalExtensionTelemetryData(local);
    } else {
      return {};
    }
  }
  get preview() {
    return this.local?.manifest.preview ?? this.gallery?.preview ?? false;
  }
  get preRelease() {
    return !!this.local?.preRelease;
  }
  get isPreReleaseVersion() {
    if (this.local) {
      return this.local.isPreReleaseVersion;
    }
    return !!this.gallery?.properties.isPreReleaseVersion;
  }
  get hasPreReleaseVersion() {
    return this.gallery ? this.gallery.hasPreReleaseVersion : !!this.local?.hasPreReleaseVersion;
  }
  get hasReleaseVersion() {
    return !!this.resourceExtension || !!this.gallery?.hasReleaseVersion;
  }
  getLocal() {
    return this.local && !this.outdated ? this.local : void 0;
  }
  async getManifest(token) {
    const local = this.getLocal();
    if (local) {
      return local.manifest;
    }
    if (this.gallery) {
      return this.getGalleryManifest(token);
    }
    if (this.resourceExtension) {
      return this.resourceExtension.manifest;
    }
    return null;
  }
  async getGalleryManifest(token = CancellationToken.None) {
    if (this.gallery) {
      let cache = this.galleryResourcesCache.get("manifest");
      if (!cache) {
        if (this.gallery.assets.manifest) {
          this.galleryResourcesCache.set("manifest", cache = this.galleryService.getManifest(this.gallery, token).catch((e) => {
            this.galleryResourcesCache.delete("manifest");
            throw e;
          }));
        } else {
          this.logService.error(nls.localize("Manifest is not found", "Manifest is not found"), this.identifier.id);
        }
      }
      return cache;
    }
    return null;
  }
  hasReadme() {
    if (this.local && this.local.readmeUrl) {
      return true;
    }
    if (this.gallery && this.gallery.assets.readme) {
      return true;
    }
    if (this.resourceExtension?.readmeUri) {
      return true;
    }
    return this.type === ExtensionType.System;
  }
  async getReadme(token) {
    const local = this.getLocal();
    if (local?.readmeUrl) {
      const content = await this.fileService.readFile(local.readmeUrl);
      return content.value.toString();
    }
    if (this.gallery) {
      if (this.gallery.assets.readme) {
        return this.galleryService.getReadme(this.gallery, token);
      }
      this.telemetryService.publicLog("extensions:NotFoundReadMe", this.telemetryData);
    }
    if (this.type === ExtensionType.System) {
      return Promise.resolve(`# ${this.displayName || this.name}
**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.
## Features
${this.description}
`);
    }
    if (this.resourceExtension?.readmeUri) {
      const content = await this.fileService.readFile(this.resourceExtension?.readmeUri);
      return content.value.toString();
    }
    return Promise.reject(new Error("not available"));
  }
  hasChangelog() {
    if (this.local && this.local.changelogUrl) {
      return true;
    }
    if (this.gallery && this.gallery.assets.changelog) {
      return true;
    }
    return this.type === ExtensionType.System;
  }
  async getChangelog(token) {
    const local = this.getLocal();
    if (local?.changelogUrl) {
      const content = await this.fileService.readFile(local.changelogUrl);
      return content.value.toString();
    }
    if (this.gallery?.assets.changelog) {
      return this.galleryService.getChangelog(this.gallery, token);
    }
    if (this.type === ExtensionType.System) {
      return Promise.resolve(`Please check the [VS Code Release Notes](command:${ShowCurrentReleaseNotesActionId}) for changes to the built-in extensions.`);
    }
    return Promise.reject(new Error("not available"));
  }
  get categories() {
    const { local, gallery, resourceExtension } = this;
    if (local && local.manifest.categories && !this.outdated) {
      return local.manifest.categories;
    }
    if (gallery) {
      return gallery.categories;
    }
    if (resourceExtension) {
      return resourceExtension.manifest.categories ?? [];
    }
    return [];
  }
  get tags() {
    const { gallery } = this;
    if (gallery) {
      return gallery.tags.filter((tag) => !tag.startsWith("_"));
    }
    return [];
  }
  get dependencies() {
    const { local, gallery, resourceExtension } = this;
    if (local && local.manifest.extensionDependencies && !this.outdated) {
      return local.manifest.extensionDependencies;
    }
    if (gallery) {
      return gallery.properties.dependencies || [];
    }
    if (resourceExtension) {
      return resourceExtension.manifest.extensionDependencies || [];
    }
    return [];
  }
  get extensionPack() {
    const { local, gallery, resourceExtension } = this;
    if (local && local.manifest.extensionPack && !this.outdated) {
      return local.manifest.extensionPack;
    }
    if (gallery) {
      return gallery.properties.extensionPack || [];
    }
    if (resourceExtension) {
      return resourceExtension.manifest.extensionPack || [];
    }
    return [];
  }
  setExtensionsControlManifest(extensionsControlManifest) {
    this.malicious = findMatchingMaliciousEntry(this.identifier, extensionsControlManifest.malicious);
    this.deprecationInfo = extensionsControlManifest.deprecated ? extensionsControlManifest.deprecated[this.identifier.id.toLowerCase()] : void 0;
  }
  getManifestFromLocalOrResource() {
    if (this.local) {
      return this.local.manifest;
    }
    if (this.resourceExtension) {
      return this.resourceExtension.manifest;
    }
    return null;
  }
};
Extension = __decorateClass([
  __decorateParam(6, IExtensionGalleryService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IFileService),
  __decorateParam(10, IProductService)
], Extension);
const EXTENSIONS_AUTO_UPDATE_KEY = "extensions.autoUpdate";
const EXTENSIONS_DONOT_AUTO_UPDATE_KEY = "extensions.donotAutoUpdate";
const EXTENSIONS_DISMISSED_NOTIFICATIONS_KEY = "extensions.dismissedNotifications";
let Extensions = class extends Disposable {
  constructor(server, stateProvider, runtimeStateProvider, isWorkspaceServer, galleryService, extensionEnablementService, workbenchExtensionManagementService, telemetryService, instantiationService) {
    super();
    this.server = server;
    this.stateProvider = stateProvider;
    this.runtimeStateProvider = runtimeStateProvider;
    this.isWorkspaceServer = isWorkspaceServer;
    this.galleryService = galleryService;
    this.extensionEnablementService = extensionEnablementService;
    this.workbenchExtensionManagementService = workbenchExtensionManagementService;
    this.telemetryService = telemetryService;
    this.instantiationService = instantiationService;
    this._onChange = this._register(new Emitter());
    this._onReset = this._register(new Emitter());
    this.installing = [];
    this.uninstalling = [];
    this.installed = [];
    this._register(server.extensionManagementService.onInstallExtension((e) => this.onInstallExtension(e)));
    this._register(server.extensionManagementService.onDidInstallExtensions((e) => this.onDidInstallExtensions(e)));
    this._register(server.extensionManagementService.onUninstallExtension((e) => this.onUninstallExtension(e.identifier)));
    this._register(server.extensionManagementService.onDidUninstallExtension((e) => this.onDidUninstallExtension(e)));
    this._register(server.extensionManagementService.onDidUpdateExtensionMetadata((e) => this.onDidUpdateExtensionMetadata(e.local)));
    this._register(server.extensionManagementService.onDidChangeProfile(() => this.reset()));
    this._register(extensionEnablementService.onEnablementChanged((e) => this.onEnablementChanged(e)));
    this._register(Event.any(this.onChange, this.onReset)(() => this._local = void 0));
    if (this.isWorkspaceServer) {
      this._register(this.workbenchExtensionManagementService.onInstallExtension((e) => {
        if (e.workspaceScoped) {
          this.onInstallExtension(e);
        }
      }));
      this._register(this.workbenchExtensionManagementService.onDidInstallExtensions((e) => {
        const result = e.filter((e2) => e2.workspaceScoped);
        if (result.length) {
          this.onDidInstallExtensions(result);
        }
      }));
      this._register(this.workbenchExtensionManagementService.onUninstallExtension((e) => {
        if (e.workspaceScoped) {
          this.onUninstallExtension(e.identifier);
        }
      }));
      this._register(this.workbenchExtensionManagementService.onDidUninstallExtension((e) => {
        if (e.workspaceScoped) {
          this.onDidUninstallExtension(e);
        }
      }));
    }
  }
  get onChange() {
    return this._onChange.event;
  }
  get onReset() {
    return this._onReset.event;
  }
  get local() {
    if (!this._local) {
      this._local = [];
      for (const extension of this.installed) {
        this._local.push(extension);
      }
      for (const extension of this.installing) {
        if (!this.installed.some((installed) => areSameExtensions(installed.identifier, extension.identifier))) {
          this._local.push(extension);
        }
      }
    }
    return this._local;
  }
  async queryInstalled(productVersion) {
    await this.fetchInstalledExtensions(productVersion);
    this._onChange.fire(void 0);
    return this.local;
  }
  async syncInstalledExtensionsWithGallery(galleryExtensions, productVersion, flagExtensionsMissingFromGallery) {
    const extensions = await this.mapInstalledExtensionWithCompatibleGalleryExtension(galleryExtensions, productVersion);
    for (const [extension, gallery] of extensions) {
      if (extension.local && extension.local.type !== ExtensionType.System && !extension.local.identifier.uuid) {
        extension.local = await this.updateMetadata(extension.local, gallery);
      }
      if (!extension.gallery || extension.gallery.version !== gallery.version || extension.gallery.properties.targetPlatform !== gallery.properties.targetPlatform) {
        extension.gallery = gallery;
        this._onChange.fire({ extension });
      }
    }
    if (flagExtensionsMissingFromGallery) {
      const extensionsToQuery = [];
      for (const extension of this.local) {
        if (extension.gallery) {
          continue;
        }
        if (extension.missingFromGallery) {
          continue;
        }
        if (!extension.identifier.uuid) {
          continue;
        }
        if (!flagExtensionsMissingFromGallery.some((f) => areSameExtensions(f, extension.identifier))) {
          continue;
        }
        extensionsToQuery.push(extension);
      }
      if (extensionsToQuery.length) {
        const queryResult = await this.galleryService.getExtensions(extensionsToQuery.map((e) => ({ ...e.identifier, version: e.version })), CancellationToken.None);
        const queriedIds = [];
        const missingIds = [];
        for (const extension of extensionsToQuery) {
          queriedIds.push(extension.identifier.id);
          const gallery = queryResult.find((g) => areSameExtensions(g.identifier, extension.identifier));
          if (gallery) {
            extension.gallery = gallery;
          } else {
            extension.missingFromGallery = true;
            missingIds.push(extension.identifier.id);
          }
          this._onChange.fire({ extension });
        }
        this.telemetryService.publicLog2("extensions:missingFromGallery", {
          queriedIds: new TelemetryTrustedValue(queriedIds.join(";")),
          missingIds: new TelemetryTrustedValue(missingIds.join(";"))
        });
      }
    }
  }
  async mapInstalledExtensionWithCompatibleGalleryExtension(galleryExtensions, productVersion) {
    const mappedExtensions = this.mapInstalledExtensionWithGalleryExtension(galleryExtensions);
    const targetPlatform = await this.server.extensionManagementService.getTargetPlatform();
    const compatibleGalleryExtensions = [];
    const compatibleGalleryExtensionsToFetch = [];
    await Promise.allSettled(mappedExtensions.map(async ([extension, gallery]) => {
      if (extension.local) {
        if (await this.galleryService.isExtensionCompatible(gallery, extension.local.preRelease, targetPlatform, productVersion)) {
          compatibleGalleryExtensions.push(gallery);
        } else {
          compatibleGalleryExtensionsToFetch.push({ ...extension.local.identifier, preRelease: extension.local.preRelease });
        }
      }
    }));
    if (compatibleGalleryExtensionsToFetch.length) {
      const result = await this.galleryService.getExtensions(compatibleGalleryExtensionsToFetch, { targetPlatform, compatible: true, queryAllVersions: true, productVersion }, CancellationToken.None);
      compatibleGalleryExtensions.push(...result);
    }
    return this.mapInstalledExtensionWithGalleryExtension(compatibleGalleryExtensions);
  }
  mapInstalledExtensionWithGalleryExtension(galleryExtensions) {
    const mappedExtensions = [];
    const byUUID = /* @__PURE__ */ new Map(), byID = /* @__PURE__ */ new Map();
    for (const gallery of galleryExtensions) {
      byUUID.set(gallery.identifier.uuid, gallery);
      byID.set(gallery.identifier.id.toLowerCase(), gallery);
    }
    for (const installed of this.installed) {
      if (installed.uuid) {
        const gallery = byUUID.get(installed.uuid);
        if (gallery) {
          mappedExtensions.push([installed, gallery]);
          continue;
        }
      }
      if (installed.local?.source !== "resource") {
        const gallery = byID.get(installed.identifier.id.toLowerCase());
        if (gallery) {
          mappedExtensions.push([installed, gallery]);
        }
      }
    }
    return mappedExtensions;
  }
  async updateMetadata(localExtension, gallery) {
    let isPreReleaseVersion = false;
    if (localExtension.manifest.version !== gallery.version) {
      this.telemetryService.publicLog2("galleryService:updateMetadata");
      const galleryWithLocalVersion = (await this.galleryService.getExtensions([{ ...localExtension.identifier, version: localExtension.manifest.version }], CancellationToken.None))[0];
      isPreReleaseVersion = !!galleryWithLocalVersion?.properties?.isPreReleaseVersion;
    }
    return this.workbenchExtensionManagementService.updateMetadata(localExtension, { id: gallery.identifier.uuid, publisherDisplayName: gallery.publisherDisplayName, publisherId: gallery.publisherId, isPreReleaseVersion });
  }
  canInstall(galleryExtension) {
    return this.server.extensionManagementService.canInstall(galleryExtension);
  }
  onInstallExtension(event) {
    const { source } = event;
    if (source && !URI.isUri(source)) {
      const extension = this.installed.find((e) => areSameExtensions(e.identifier, source.identifier)) ?? this.instantiationService.createInstance(Extension, this.stateProvider, this.runtimeStateProvider, this.server, void 0, source, void 0);
      this.installing.push(extension);
      this._onChange.fire({ extension });
    }
  }
  async fetchInstalledExtensions(productVersion) {
    const extensionsControlManifest = await this.server.extensionManagementService.getExtensionsControlManifest();
    const all = await this.server.extensionManagementService.getInstalled(void 0, void 0, productVersion);
    if (this.isWorkspaceServer) {
      all.push(...await this.workbenchExtensionManagementService.getInstalledWorkspaceExtensions(true));
    }
    const installed = groupByExtension(all, (r) => r.identifier).reduce((result, extensions) => {
      if (extensions.length === 1) {
        result.push(extensions[0]);
      } else {
        let workspaceExtension, userExtension, systemExtension;
        for (const extension2 of extensions) {
          if (extension2.isWorkspaceScoped) {
            workspaceExtension = extension2;
          } else if (extension2.type === ExtensionType.User) {
            userExtension = extension2;
          } else {
            systemExtension = extension2;
          }
        }
        const extension = workspaceExtension ?? userExtension ?? systemExtension;
        if (extension) {
          result.push(extension);
        }
      }
      return result;
    }, []);
    const byId = index(this.installed, (e) => e.local ? e.local.identifier.id : e.identifier.id);
    this.installed = installed.map((local) => {
      const extension = byId[local.identifier.id] || this.instantiationService.createInstance(Extension, this.stateProvider, this.runtimeStateProvider, this.server, local, void 0, void 0);
      extension.local = local;
      extension.enablementState = this.extensionEnablementService.getEnablementState(local);
      extension.setExtensionsControlManifest(extensionsControlManifest);
      return extension;
    });
  }
  async reset() {
    this.installed = [];
    this.installing = [];
    this.uninstalling = [];
    await this.fetchInstalledExtensions();
    this._onReset.fire();
  }
  async onDidInstallExtensions(results) {
    const extensions = [];
    for (const event of results) {
      const { local, source } = event;
      const gallery = source && !URI.isUri(source) ? source : void 0;
      const location = source && URI.isUri(source) ? source : void 0;
      const installingExtension = gallery ? this.installing.filter((e) => areSameExtensions(e.identifier, gallery.identifier))[0] : null;
      this.installing = installingExtension ? this.installing.filter((e) => e !== installingExtension) : this.installing;
      let extension = installingExtension ? installingExtension : location || local ? this.instantiationService.createInstance(Extension, this.stateProvider, this.runtimeStateProvider, this.server, local, void 0, void 0) : void 0;
      if (extension) {
        if (local) {
          const installed = this.installed.filter((e) => areSameExtensions(e.identifier, extension.identifier))[0];
          if (installed) {
            extension = installed;
          } else {
            this.installed.push(extension);
          }
          extension.local = local;
          if (!extension.gallery) {
            extension.gallery = gallery;
          }
          extension.enablementState = this.extensionEnablementService.getEnablementState(local);
        }
        extensions.push(extension);
      }
      this._onChange.fire(!local || !extension ? void 0 : { extension, operation: event.operation });
    }
    if (extensions.length) {
      const manifest = await this.server.extensionManagementService.getExtensionsControlManifest();
      for (const extension of extensions) {
        extension.setExtensionsControlManifest(manifest);
      }
      this.matchInstalledExtensionsWithGallery(extensions);
    }
  }
  async onDidUpdateExtensionMetadata(local) {
    const extension = this.installed.find((e) => areSameExtensions(e.identifier, local.identifier));
    if (extension?.local) {
      extension.local = local;
      this._onChange.fire({ extension });
    }
  }
  async matchInstalledExtensionsWithGallery(extensions) {
    const toMatch = extensions.filter((e) => e.local && !e.gallery && e.local.source !== "resource");
    if (!toMatch.length) {
      return;
    }
    if (!this.galleryService.isEnabled()) {
      return;
    }
    const galleryExtensions = await this.galleryService.getExtensions(toMatch.map((e) => ({ ...e.identifier, preRelease: e.local?.preRelease })), { compatible: true, targetPlatform: await this.server.extensionManagementService.getTargetPlatform() }, CancellationToken.None);
    for (const extension of extensions) {
      const compatible = galleryExtensions.find((e) => areSameExtensions(e.identifier, extension.identifier));
      if (compatible) {
        extension.gallery = compatible;
        this._onChange.fire({ extension });
      }
    }
  }
  onUninstallExtension(identifier) {
    const extension = this.installed.filter((e) => areSameExtensions(e.identifier, identifier))[0];
    if (extension) {
      const uninstalling = this.uninstalling.filter((e) => areSameExtensions(e.identifier, identifier))[0] || extension;
      this.uninstalling = [uninstalling, ...this.uninstalling.filter((e) => !areSameExtensions(e.identifier, identifier))];
      this._onChange.fire(uninstalling ? { extension: uninstalling } : void 0);
    }
  }
  onDidUninstallExtension({ identifier, error }) {
    const uninstalled = this.uninstalling.find((e) => areSameExtensions(e.identifier, identifier)) || this.installed.find((e) => areSameExtensions(e.identifier, identifier));
    this.uninstalling = this.uninstalling.filter((e) => !areSameExtensions(e.identifier, identifier));
    if (!error) {
      this.installed = this.installed.filter((e) => !areSameExtensions(e.identifier, identifier));
    }
    if (uninstalled) {
      this._onChange.fire({ extension: uninstalled });
    }
  }
  onEnablementChanged(platformExtensions) {
    const extensions = this.local.filter((e) => platformExtensions.some((p) => areSameExtensions(e.identifier, p.identifier)));
    for (const extension of extensions) {
      if (extension.local) {
        const enablementState = this.extensionEnablementService.getEnablementState(extension.local);
        if (enablementState !== extension.enablementState) {
          extension.enablementState = enablementState;
          this._onChange.fire({ extension });
        }
      }
    }
  }
  getExtensionState(extension) {
    if (extension.gallery && this.installing.some((e) => !!e.gallery && areSameExtensions(e.gallery.identifier, extension.gallery.identifier))) {
      return ExtensionState.Installing;
    }
    if (this.uninstalling.some((e) => areSameExtensions(e.identifier, extension.identifier))) {
      return ExtensionState.Uninstalling;
    }
    const local = this.installed.filter((e) => e === extension || e.gallery && extension.gallery && areSameExtensions(e.gallery.identifier, extension.gallery.identifier))[0];
    return local ? ExtensionState.Installed : ExtensionState.Uninstalled;
  }
};
Extensions = __decorateClass([
  __decorateParam(4, IExtensionGalleryService),
  __decorateParam(5, IWorkbenchExtensionEnablementService),
  __decorateParam(6, IWorkbenchExtensionManagementService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IInstantiationService)
], Extensions);
let ExtensionsWorkbenchService = class extends Disposable {
  constructor(instantiationService, editorService, extensionManagementService, galleryService, extensionGalleryManifestService, configurationService, telemetryService, notificationService, urlService, extensionEnablementService, hostService, progressService, extensionManagementServerService, languageService, extensionsSyncManagementService, userDataAutoSyncService, productService, contextKeyService, extensionManifestPropertiesService, logService, extensionService, localeService, lifecycleService, fileService, userDataProfileService, userDataProfilesService, storageService, dialogService, userDataSyncEnablementService, updateService, uriIdentityService, workspaceContextService, viewsService, fileDialogService, quickInputService, allowedExtensionsService, meteredConnectionService) {
    super();
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.extensionManagementService = extensionManagementService;
    this.galleryService = galleryService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this.configurationService = configurationService;
    this.telemetryService = telemetryService;
    this.notificationService = notificationService;
    this.extensionEnablementService = extensionEnablementService;
    this.hostService = hostService;
    this.progressService = progressService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.languageService = languageService;
    this.extensionsSyncManagementService = extensionsSyncManagementService;
    this.userDataAutoSyncService = userDataAutoSyncService;
    this.productService = productService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.logService = logService;
    this.extensionService = extensionService;
    this.localeService = localeService;
    this.lifecycleService = lifecycleService;
    this.fileService = fileService;
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.storageService = storageService;
    this.dialogService = dialogService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.updateService = updateService;
    this.uriIdentityService = uriIdentityService;
    this.workspaceContextService = workspaceContextService;
    this.viewsService = viewsService;
    this.fileDialogService = fileDialogService;
    this.quickInputService = quickInputService;
    this.allowedExtensionsService = allowedExtensionsService;
    this.meteredConnectionService = meteredConnectionService;
    this.localExtensions = null;
    this.remoteExtensions = null;
    this.webExtensions = null;
    this.extensionsServers = [];
    this._onChange = this._register(new Emitter());
    this._onDidChangeExtensionsNotification = this._register(new Emitter());
    this.onDidChangeExtensionsNotification = this._onDidChangeExtensionsNotification.event;
    this._onReset = this._register(new Emitter());
    this.installing = [];
    this.tasksInProgress = [];
    this.delayedAutoUpdateCheckTimer = this._register(new MutableDisposable());
    this.extensionGalleryManifest = null;
    this.autoRestartListenerDisposable = this._register(new MutableDisposable());
    this.hasOutdatedExtensionsContextKey = HasOutdatedExtensionsContext.bindTo(contextKeyService);
    if (extensionManagementServerService.localExtensionManagementServer) {
      this.localExtensions = this._register(instantiationService.createInstance(
        Extensions,
        extensionManagementServerService.localExtensionManagementServer,
        (ext) => this.getExtensionState(ext),
        (ext) => this.getRuntimeState(ext),
        !extensionManagementServerService.remoteExtensionManagementServer
      ));
      this._register(this.localExtensions.onChange((e) => this.onDidChangeExtensions(e?.extension)));
      this._register(this.localExtensions.onReset((e) => this.reset()));
      this.extensionsServers.push(this.localExtensions);
    }
    if (extensionManagementServerService.remoteExtensionManagementServer) {
      this.remoteExtensions = this._register(instantiationService.createInstance(
        Extensions,
        extensionManagementServerService.remoteExtensionManagementServer,
        (ext) => this.getExtensionState(ext),
        (ext) => this.getRuntimeState(ext),
        true
      ));
      this._register(this.remoteExtensions.onChange((e) => this.onDidChangeExtensions(e?.extension)));
      this._register(this.remoteExtensions.onReset((e) => this.reset()));
      this.extensionsServers.push(this.remoteExtensions);
    }
    if (extensionManagementServerService.webExtensionManagementServer) {
      this.webExtensions = this._register(instantiationService.createInstance(
        Extensions,
        extensionManagementServerService.webExtensionManagementServer,
        (ext) => this.getExtensionState(ext),
        (ext) => this.getRuntimeState(ext),
        !(extensionManagementServerService.remoteExtensionManagementServer || extensionManagementServerService.localExtensionManagementServer)
      ));
      this._register(this.webExtensions.onChange((e) => this.onDidChangeExtensions(e?.extension)));
      this._register(this.webExtensions.onReset((e) => this.reset()));
      this.extensionsServers.push(this.webExtensions);
    }
    this.updatesCheckDelayer = new ThrottledDelayer(ExtensionsWorkbenchService.UpdatesCheckInterval);
    this.autoUpdateDelayer = new ThrottledDelayer(1e3);
    this._register(toDisposable(() => {
      this.updatesCheckDelayer.cancel();
      this.autoUpdateDelayer.cancel();
    }));
    urlService.registerHandler(this);
    this.whenInitialized = this.initialize();
  }
  get onChange() {
    return this._onChange.event;
  }
  get onReset() {
    return this._onReset.event;
  }
  async initialize() {
    await Promise.all([this.queryLocal(), this.extensionService.whenInstalledExtensionsRegistered()]);
    if (this._store.isDisposed) {
      return;
    }
    this.onDidChangeRunningExtensions(this.extensionService.extensions, []);
    this._register(this.extensionService.onDidChangeExtensions(({ added, removed }) => this.onDidChangeRunningExtensions(added, removed)));
    await this.lifecycleService.when(LifecyclePhase.Eventually);
    if (this._store.isDisposed) {
      return;
    }
    this.initializeAutoUpdate();
    this.extensionGalleryManifestService.getExtensionGalleryManifest().then((manifest) => {
      if (this._store.isDisposed) {
        return;
      }
      this.updateExtensionGalleryManifest(manifest);
      this._register(this.extensionGalleryManifestService.onDidChangeExtensionGalleryManifest((manifest2) => this.updateExtensionGalleryManifest(manifest2)));
    }).catch((e) => this.logService.error("Error while fetching extension gallery manifest", e));
    this.updateExtensionsNotificaiton();
    this.reportInstalledExtensionsTelemetry();
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, EXTENSIONS_DISMISSED_NOTIFICATIONS_KEY, this._store)((e) => this.onDidDismissedNotificationsValueChange()));
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, EXTENSIONS_AUTO_UPDATE_KEY, this._store)((e) => this.onDidSelectedExtensionToAutoUpdateValueChange()));
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, EXTENSIONS_DONOT_AUTO_UPDATE_KEY, this._store)((e) => this.onDidSelectedExtensionToAutoUpdateValueChange()));
    this._register(Event.debounce(this.onChange, () => void 0, 100)(() => {
      this.updateExtensionsNotificaiton();
      this.reportProgressFromOtherSources();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ExtensionGalleryServiceUrlConfigKey)) {
        this.updateExtensionsNotificaiton();
      }
    }));
  }
  initializeAutoUpdate() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AutoUpdateConfigurationKey)) {
        if (!this.isAutoUpdateEnabled()) {
          this.delayedAutoUpdateCheckTimer.value = void 0;
        } else {
          this.eventuallyAutoUpdateExtensions();
        }
        this._onChange.fire(void 0);
      }
      if (e.affectsConfiguration(AutoUpdateDelayConfigurationKey)) {
        this.delayedAutoUpdateCheckTimer.value = void 0;
        if (this.isAutoUpdateEnabled()) {
          this.eventuallyAutoUpdateExtensions();
        }
        this._onChange.fire(void 0);
      }
      if (e.affectsConfiguration(AutoCheckUpdatesConfigurationKey)) {
        if (this.isAutoCheckUpdatesEnabled()) {
          this.checkForUpdates(`Enabled auto check updates`);
        }
      }
    }));
    this._register(this.extensionEnablementService.onEnablementChanged((platformExtensions) => {
      if (this.isAutoCheckUpdatesEnabled() && this.getAutoUpdateValue() === "on" && platformExtensions.some((e) => this.extensionEnablementService.isEnabled(e))) {
        this.checkForUpdates("Extension enablement changed");
      }
    }));
    this._register(Event.debounce(this.onChange, () => void 0, 100)(() => this.hasOutdatedExtensionsContextKey.set(this.outdated.length > 0)));
    this._register(this.updateService.onStateChange((e) => {
      if (e.type === StateType.CheckingForUpdates && e.explicit || e.type === StateType.AvailableForDownload || e.type === StateType.Downloaded) {
        this.telemetryService.publicLog2("extensions:updatecheckonproductupdate");
        if (this.isAutoCheckUpdatesEnabled()) {
          this.checkForUpdates("Product update");
        }
      }
    }));
    this._register(this.allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => {
      if (this.isAutoCheckUpdatesEnabled()) {
        this.checkForUpdates("Allowed extensions changed");
      }
    }));
    this._register(this.meteredConnectionService.onDidChangeIsConnectionMetered(() => {
      if (this.isAutoCheckUpdatesEnabled()) {
        this.checkForUpdates("Connection is no longer metered");
      }
      if (isWeb && !this.isAutoUpdateEnabled()) {
        this.autoUpdateBuiltinExtensions();
      }
    }));
    this.hasOutdatedExtensionsContextKey.set(this.outdated.length > 0);
    this.eventuallyCheckForUpdates(true);
    if (isWeb) {
      this.syncPinnedBuiltinExtensions();
      if (!this.isAutoUpdateEnabled()) {
        this.autoUpdateBuiltinExtensions();
      }
    }
    this.registerAutoRestartListener();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AutoRestartConfigurationKey)) {
        this.registerAutoRestartListener();
      }
    }));
  }
  updateExtensionGalleryManifest(manifest) {
    this.extensionGalleryManifest = manifest;
    this.updateExtensionsNotificaiton();
  }
  isAutoUpdateEnabled() {
    if (this.meteredConnectionService.isConnectionMetered) {
      return false;
    }
    return this.getAutoUpdateValue() !== "off";
  }
  getAutoUpdateValue() {
    const autoUpdate = this.configurationService.getValue(AutoUpdateConfigurationKey);
    if (autoUpdate === "off" || autoUpdate === false || autoUpdate === "onlySelectedExtensions") {
      return "off";
    }
    return "on";
  }
  isAutoUpdateDelayed(extension) {
    if (!extension.outdated) {
      return false;
    }
    if (!this.shouldAutoUpdateExtension(extension)) {
      return false;
    }
    return this.getAutoUpdateDelayRemaining(extension) > 0;
  }
  getAutoUpdateDelayRemaining(extension) {
    if (this.isFromTrustedPublisher(extension)) {
      return 0;
    }
    const lastUpdated = extension.gallery?.lastUpdated;
    if (!Number.isFinite(lastUpdated) || !lastUpdated) {
      return 0;
    }
    const elapsed = Date.now() - lastUpdated;
    if (elapsed < 0) {
      return 0;
    }
    const delayPeriod = this.getAutoUpdateDelay();
    return Math.max(0, delayPeriod - elapsed);
  }
  getAutoUpdateDelay() {
    const delayHours = this.configurationService.getValue(AutoUpdateDelayConfigurationKey) ?? 2;
    return delayHours * 60 * 60 * 1e3;
  }
  isFromTrustedPublisher(extension) {
    const trustedPublishers = this.productService.trustedExtensionPublishers;
    if (!trustedPublishers?.length) {
      return false;
    }
    const publisher = extension.publisher.toLowerCase();
    return trustedPublishers.includes(publisher) || trustedPublishers.includes(extension.publisherDisplayName.toLowerCase());
  }
  async updateAutoUpdateForAllExtensions(isAutoUpdateEnabled) {
    const wasAutoUpdateEnabled = this.isAutoUpdateEnabled();
    if (wasAutoUpdateEnabled === isAutoUpdateEnabled) {
      return;
    }
    const result = await this.dialogService.confirm({
      title: nls.localize("confirmEnableDisableAutoUpdate", "Auto Update Extensions"),
      message: isAutoUpdateEnabled ? nls.localize("confirmEnableAutoUpdate", "Do you want to enable auto update for extensions?") : nls.localize("confirmDisableAutoUpdate", "Do you want to disable auto update for extensions?"),
      detail: nls.localize("confirmEnableDisableAutoUpdateDetail", "This will reset any auto update settings you have set for individual extensions.")
    });
    if (!result.confirmed) {
      return;
    }
    this.setEnabledAutoUpdateExtensions([]);
    await this.configurationService.updateValue(AutoUpdateConfigurationKey, isAutoUpdateEnabled ? "on" : "off");
    this.setDisabledAutoUpdateExtensions([]);
    await this.updateExtensionsPinnedState(!isAutoUpdateEnabled);
    this._onChange.fire(void 0);
  }
  registerAutoRestartListener() {
    this.autoRestartListenerDisposable.value = void 0;
    if (this.configurationService.getValue(AutoRestartConfigurationKey) === true) {
      this.autoRestartListenerDisposable.value = this.hostService.onDidChangeFocus((focus) => {
        if (!focus && this.configurationService.getValue(AutoRestartConfigurationKey) === true) {
          this.updateRunningExtensions(void 0, true);
        }
      });
    }
  }
  reportInstalledExtensionsTelemetry() {
    const extensionIds = this.installed.filter((extension) => !extension.isBuiltin && (extension.enablementState === EnablementState.EnabledWorkspace || extension.enablementState === EnablementState.EnabledGlobally)).map((extension) => ExtensionIdentifier.toKey(extension.identifier.id));
    this.telemetryService.publicLog2("installedExtensions", { extensionIds: new TelemetryTrustedValue(extensionIds.join(";")), count: extensionIds.length });
  }
  async onDidChangeRunningExtensions(added, removed) {
    const changedExtensions = [];
    const extensionsToFetch = [];
    for (const desc of added) {
      const extension = this.installed.find((e) => areSameExtensions({ id: desc.identifier.value, uuid: desc.uuid }, e.identifier));
      if (extension) {
        changedExtensions.push(extension);
      } else {
        extensionsToFetch.push(desc);
      }
    }
    const workspaceExtensions = [];
    for (const desc of removed) {
      if (this.workspaceContextService.isInsideWorkspace(desc.extensionLocation)) {
        workspaceExtensions.push(desc);
      } else {
        extensionsToFetch.push(desc);
      }
    }
    if (extensionsToFetch.length) {
      const extensions = await this.getExtensions(extensionsToFetch.map((e) => ({ id: e.identifier.value, uuid: e.uuid })), CancellationToken.None);
      changedExtensions.push(...extensions);
    }
    if (workspaceExtensions.length) {
      const extensions = await this.getResourceExtensions(workspaceExtensions.map((e) => e.extensionLocation), true);
      changedExtensions.push(...extensions);
    }
    for (const changedExtension of changedExtensions) {
      this._onChange.fire(changedExtension);
    }
  }
  updateExtensionsPinnedState(pinned) {
    return this.progressService.withProgress({
      location: ProgressLocation.Extensions,
      title: nls.localize("updatingExtensions", "Updating Extensions Auto Update State")
    }, () => this.extensionManagementService.resetPinnedStateForAllUserExtensions(pinned));
  }
  reset() {
    for (const task of this.tasksInProgress) {
      task.cancel();
    }
    this.tasksInProgress = [];
    this.installing = [];
    this.onDidChangeExtensions();
    this._onReset.fire();
  }
  onDidChangeExtensions(extension) {
    this._installed = void 0;
    this._local = void 0;
    this._onChange.fire(extension);
  }
  get local() {
    if (!this._local) {
      if (this.extensionsServers.length === 1) {
        this._local = this.installed;
      } else {
        this._local = [];
        const byId = groupByExtension(this.installed, (r) => r.identifier);
        for (const extensions of byId) {
          this._local.push(this.getPrimaryExtension(extensions));
        }
      }
    }
    return this._local;
  }
  get installed() {
    if (!this._installed) {
      this._installed = [];
      for (const extensions of this.extensionsServers) {
        for (const extension of extensions.local) {
          this._installed.push(extension);
        }
      }
    }
    return this._installed;
  }
  get outdated() {
    return this.installed.filter((e) => e.outdated && e.local && e.state === ExtensionState.Installed);
  }
  async queryLocal(server) {
    if (server) {
      if (this.localExtensions && this.extensionManagementServerService.localExtensionManagementServer === server) {
        return this.localExtensions.queryInstalled(this.getProductVersion());
      }
      if (this.remoteExtensions && this.extensionManagementServerService.remoteExtensionManagementServer === server) {
        return this.remoteExtensions.queryInstalled(this.getProductVersion());
      }
      if (this.webExtensions && this.extensionManagementServerService.webExtensionManagementServer === server) {
        return this.webExtensions.queryInstalled(this.getProductVersion());
      }
    }
    if (this.localExtensions) {
      try {
        await this.localExtensions.queryInstalled(this.getProductVersion());
      } catch (error) {
        this.logService.error(error);
      }
    }
    if (this.remoteExtensions) {
      try {
        await this.remoteExtensions.queryInstalled(this.getProductVersion());
      } catch (error) {
        this.logService.error(error);
      }
    }
    if (this.webExtensions) {
      try {
        await this.webExtensions.queryInstalled(this.getProductVersion());
      } catch (error) {
        this.logService.error(error);
      }
    }
    return this.local;
  }
  async queryGallery(arg1, arg2) {
    if (!this.galleryService.isEnabled()) {
      return singlePagePager([]);
    }
    const options = CancellationToken.isCancellationToken(arg1) ? {} : arg1;
    const token = CancellationToken.isCancellationToken(arg1) ? arg1 : arg2;
    options.text = options.text ? this.resolveQueryText(options.text) : options.text;
    options.includePreRelease = isUndefined(options.includePreRelease) ? this.extensionManagementService.preferPreReleases : options.includePreRelease;
    const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
    const pager = await this.galleryService.query(options, token);
    this.syncInstalledExtensionsWithGallery(pager.firstPage);
    return {
      firstPage: pager.firstPage.map((gallery) => this.fromGallery(gallery, extensionsControlManifest)),
      total: pager.total,
      pageSize: pager.pageSize,
      getPage: async (pageIndex, token2) => {
        const page = await pager.getPage(pageIndex, token2);
        this.syncInstalledExtensionsWithGallery(page);
        return page.map((gallery) => this.fromGallery(gallery, extensionsControlManifest));
      }
    };
  }
  async getExtensions(extensionInfos, arg1, arg2) {
    if (!this.galleryService.isEnabled()) {
      return [];
    }
    extensionInfos.forEach((e) => e.preRelease = e.preRelease ?? this.extensionManagementService.preferPreReleases);
    const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
    const galleryExtensions = await this.galleryService.getExtensions(extensionInfos, arg1, arg2);
    this.syncInstalledExtensionsWithGallery(galleryExtensions);
    return galleryExtensions.map((gallery) => this.fromGallery(gallery, extensionsControlManifest));
  }
  async getResourceExtensions(locations, isWorkspaceScoped) {
    const resourceExtensions = await this.extensionManagementService.getExtensions(locations);
    return resourceExtensions.map((resourceExtension) => this.getInstalledExtensionMatchingLocation(resourceExtension.location) ?? this.instantiationService.createInstance(Extension, (ext) => this.getExtensionState(ext), (ext) => this.getRuntimeState(ext), void 0, void 0, void 0, { resourceExtension, isWorkspaceScoped }));
  }
  onDidDismissedNotificationsValueChange() {
    if (this.dismissedNotificationsValue !== this.getDismissedNotificationsValue()) {
      this._dismissedNotificationsValue = void 0;
      this.updateExtensionsNotificaiton();
    }
  }
  updateExtensionsNotificaiton() {
    const computedNotificiations = this.computeExtensionsNotifications();
    const dismissedNotifications = [];
    let extensionsNotification;
    if (computedNotificiations.length) {
      for (const dismissedNotification of this.getDismissedNotifications()) {
        if (computedNotificiations.some((e) => e.key === dismissedNotification)) {
          dismissedNotifications.push(dismissedNotification);
        }
      }
      if (!dismissedNotifications.includes(computedNotificiations[0].key)) {
        extensionsNotification = {
          message: computedNotificiations[0].message,
          severity: computedNotificiations[0].severity,
          extensions: computedNotificiations[0].extensions,
          query: computedNotificiations[0].query,
          action: computedNotificiations[0].action,
          key: computedNotificiations[0].key,
          dismiss: () => {
            this.setDismissedNotifications([...this.getDismissedNotifications(), computedNotificiations[0].key]);
            this.updateExtensionsNotificaiton();
          }
        };
      }
    }
    this.setDismissedNotifications(dismissedNotifications);
    if (this.extensionsNotification?.key !== extensionsNotification?.key) {
      this.extensionsNotification = extensionsNotification;
      this._onDidChangeExtensionsNotification.fire(this.extensionsNotification);
    }
  }
  computeExtensionsNotifications() {
    const computedNotificiations = [];
    const disallowedExtensions = this.local.filter((e) => e.enablementState === EnablementState.DisabledByAllowlist);
    if (disallowedExtensions.length) {
      computedNotificiations.push({
        message: this.configurationService.inspect(AllowedExtensionsConfigKey).policy ? nls.localize("disallowed extensions by policy", "Some extensions are disabled because they are not allowed by your system administrator.") : nls.localize("disallowed extensions", "Some extensions are disabled because they are configured not to be allowed."),
        severity: Severity.Warning,
        extensions: disallowedExtensions,
        key: "disallowedExtensions:" + disallowedExtensions.sort((a, b) => a.identifier.id.localeCompare(b.identifier.id)).map((e) => e.identifier.id.toLowerCase()).join("-")
      });
    }
    const invalidExtensions = this.local.filter((e) => e.enablementState === EnablementState.DisabledByInvalidExtension && !e.isWorkspaceScoped);
    if (invalidExtensions.length) {
      if (invalidExtensions.some(
        (e) => e.local && e.local.manifest.engines?.vscode && !isEngineValid(e.local.manifest.engines.vscode, this.productService.version, this.productService.date)
      )) {
        computedNotificiations.push({
          message: nls.localize("incompatibleExtensions", "Some extensions are disabled due to version incompatibility. Review and update them."),
          severity: Severity.Warning,
          extensions: invalidExtensions,
          key: "incompatibleExtensions:" + invalidExtensions.sort((a, b) => a.identifier.id.localeCompare(b.identifier.id)).map((e) => `${e.identifier.id.toLowerCase()}@${e.local?.manifest.version}`).join("-")
        });
      } else {
        computedNotificiations.push({
          message: nls.localize("invalidExtensions", "Invalid extensions detected. Review them."),
          severity: Severity.Warning,
          extensions: invalidExtensions,
          key: "invalidExtensions:" + invalidExtensions.sort((a, b) => a.identifier.id.localeCompare(b.identifier.id)).map((e) => `${e.identifier.id.toLowerCase()}@${e.local?.manifest.version}`).join("-")
        });
      }
    }
    if (!this.configurationService.getValue(AutoRestartConfigurationKey)) {
      const restartRequiredExtensions = this.local.filter((e) => e.runtimeState !== void 0 && (e.runtimeState.action === ExtensionRuntimeActionType.RestartExtensions || e.runtimeState.action === ExtensionRuntimeActionType.ReloadWindow));
      if (restartRequiredExtensions.length) {
        const needsReload = restartRequiredExtensions.some((e) => e.runtimeState?.action === ExtensionRuntimeActionType.ReloadWindow);
        computedNotificiations.push({
          message: needsReload ? nls.localize("extensions need reload", "Extensions require a window reload to apply updates.") : nls.localize("extensions need restart", "All extensions require a restart to apply updates."),
          severity: Severity.Info,
          extensions: restartRequiredExtensions,
          query: "@restartrequired",
          action: {
            label: needsReload ? nls.localize("reload window", "Reload Window") : nls.localize("restart extensions action", "Restart Extensions"),
            run: () => {
              if (needsReload) {
                this.hostService.reload();
              } else {
                this.updateRunningExtensions();
              }
            }
          },
          key: "restartRequired:" + restartRequiredExtensions.sort((a, b) => a.identifier.id.localeCompare(b.identifier.id)).map((e) => e.identifier.id.toLowerCase()).join("-")
        });
      }
    }
    const deprecatedExtensions = this.local.filter((e) => !!e.deprecationInfo && e.local && this.extensionEnablementService.isEnabled(e.local));
    if (deprecatedExtensions.length) {
      computedNotificiations.push({
        message: nls.localize("deprecated extensions", "Deprecated extensions detected. Review them and migrate to alternatives."),
        severity: Severity.Warning,
        extensions: deprecatedExtensions,
        key: "deprecatedExtensions:" + deprecatedExtensions.sort((a, b) => a.identifier.id.localeCompare(b.identifier.id)).map((e) => e.identifier.id.toLowerCase()).join("-")
      });
    }
    const privateMarketplaceUrl = this.configurationService.inspect(ExtensionGalleryServiceUrlConfigKey).policyValue;
    if (privateMarketplaceUrl) {
      const message = new MarkdownString();
      let linkUri = this.extensionGalleryManifest ? getExtensionGalleryManifestResourceUri(this.extensionGalleryManifest, ExtensionGalleryResourceType.ContactSupportUri) : void 0;
      if (!linkUri) {
        const settingsQuery = `@hasPolicy ${ExtensionGalleryServiceUrlConfigKey}`;
        linkUri = `command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify(settingsQuery))}`;
        message.isTrusted = { enabledCommands: ["workbench.action.openSettings"] };
      }
      message.appendMarkdown(nls.localize("privateMarketplace", "This window is connected to a [private extension marketplace]({0}) managed by your organization.", linkUri));
      computedNotificiations.push({
        message,
        severity: Severity.Info,
        extensions: [],
        key: `privateMarketplace:${hash(privateMarketplaceUrl)}:${hash(linkUri)}`
      });
    }
    return computedNotificiations;
  }
  getExtensionsNotification() {
    return this.extensionsNotification;
  }
  resolveQueryText(text) {
    text = text.replace(/@web/g, `tag:"${WEB_EXTENSION_TAG}"`);
    const extensionRegex = /\bext:([^\s]+)\b/g;
    if (extensionRegex.test(text)) {
      text = text.replace(extensionRegex, (m, ext) => {
        const lookup = this.productService.extensionKeywords || {};
        const keywords = lookup[ext] || [];
        const languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(URI.file(`.${ext}`));
        const languageName = languageId && this.languageService.getLanguageName(languageId);
        const languageTag = languageName ? ` tag:"${languageName}"` : "";
        return `tag:"__ext_${ext}" tag:"__ext_.${ext}" ${keywords.map((tag) => `tag:"${tag}"`).join(" ")}${languageTag} tag:"${ext}"`;
      });
    }
    return text.substr(0, 350);
  }
  fromGallery(gallery, extensionsControlManifest) {
    let extension = this.getInstalledExtensionMatchingGallery(gallery);
    if (!extension) {
      extension = this.instantiationService.createInstance(Extension, (ext) => this.getExtensionState(ext), (ext) => this.getRuntimeState(ext), void 0, void 0, gallery, void 0);
      extension.setExtensionsControlManifest(extensionsControlManifest);
    }
    return extension;
  }
  getInstalledExtensionMatchingGallery(gallery) {
    for (const installed of this.local) {
      if (installed.identifier.uuid) {
        if (installed.identifier.uuid === gallery.identifier.uuid) {
          return installed;
        }
      } else if (installed.local?.source !== "resource") {
        if (areSameExtensions(installed.identifier, gallery.identifier)) {
          return installed;
        }
      }
    }
    return null;
  }
  getInstalledExtensionMatchingLocation(location) {
    return this.local.find((e) => e.local && this.uriIdentityService.extUri.isEqualOrParent(location, e.local?.location)) ?? null;
  }
  async open(extension, options) {
    if (typeof extension === "string") {
      const id = extension;
      extension = this.installed.find((e) => areSameExtensions(e.identifier, { id })) ?? (await this.getExtensions([{ id: extension }], CancellationToken.None))[0];
    }
    if (!extension) {
      throw new Error(`Extension not found. ${extension}`);
    }
    const useModal = this.configurationService.getValue("extensions.allowOpenInModalEditor");
    await this.editorService.openEditor(this.instantiationService.createInstance(ExtensionsInput, extension), options, options?.sideByside ? SIDE_GROUP : useModal ? MODAL_GROUP : ACTIVE_GROUP);
  }
  async openSearch(searchValue, preserveFocus) {
    const viewPaneContainer = (await this.viewsService.openViewContainer(VIEWLET_ID, true))?.getViewPaneContainer();
    if (!viewPaneContainer) {
      this.logService.trace("ExtensionsWorkbenchService#openSearch: extension view pane container was not available");
      return;
    }
    viewPaneContainer.search(searchValue);
    if (!preserveFocus) {
      viewPaneContainer.focus();
    }
  }
  getExtensionRuntimeStatus(extension) {
    const extensionsStatus = this.extensionService.getExtensionsStatus();
    for (const id of Object.keys(extensionsStatus)) {
      if (areSameExtensions({ id }, extension.identifier)) {
        return extensionsStatus[id];
      }
    }
    return void 0;
  }
  async updateRunningExtensions(message = nls.localize("restart", "Changing extension enablement"), auto = false) {
    const toAdd = [];
    const toRemove = [];
    const extensionsToCheck = [...this.local];
    for (const extension of extensionsToCheck) {
      const runtimeState = extension.runtimeState;
      if (!runtimeState || runtimeState.action !== ExtensionRuntimeActionType.RestartExtensions) {
        continue;
      }
      if (extension.state === ExtensionState.Uninstalled) {
        toRemove.push(extension.identifier.id);
        continue;
      }
      if (!extension.local) {
        continue;
      }
      const isEnabled = this.extensionEnablementService.isEnabled(extension.local);
      if (isEnabled) {
        const runningExtension = this.extensionService.extensions.find((e) => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, extension.identifier));
        if (runningExtension) {
          toRemove.push(runningExtension.identifier.value);
        }
        toAdd.push(extension.local);
      } else {
        toRemove.push(extension.identifier.id);
      }
    }
    for (const extension of this.extensionService.extensions) {
      if (extension.isUnderDevelopment) {
        continue;
      }
      if (extensionsToCheck.some((e) => areSameExtensions({ id: extension.identifier.value, uuid: extension.uuid }, e.local?.identifier ?? e.identifier))) {
        continue;
      }
      toRemove.push(extension.identifier.value);
    }
    if (toAdd.length || toRemove.length) {
      if (await this.extensionService.stopExtensionHosts(message, auto)) {
        await this.extensionService.startExtensionHosts({ toAdd, toRemove });
        if (auto) {
          this.notificationService.notify({
            severity: Severity.Info,
            message: nls.localize("extensionsAutoRestart", "Extensions were auto restarted to enable updates."),
            priority: NotificationPriority.SILENT
          });
        }
        this.telemetryService.publicLog2("extensions:autorestart", { count: toAdd.length + toRemove.length, auto });
      }
    }
  }
  getRuntimeState(extension) {
    const isUninstalled = extension.state === ExtensionState.Uninstalled;
    const runningExtension = this.extensionService.extensions.find((e) => areSameExtensions({ id: e.identifier.value }, extension.identifier));
    const reloadAction = this.extensionManagementServerService.remoteExtensionManagementServer ? ExtensionRuntimeActionType.ReloadWindow : ExtensionRuntimeActionType.RestartExtensions;
    const reloadActionLabel = reloadAction === ExtensionRuntimeActionType.ReloadWindow ? nls.localize("reload", "reload window") : nls.localize("restart extensions", "restart extensions");
    if (isUninstalled) {
      const canRemoveRunningExtension = runningExtension && this.extensionService.canRemoveExtension(runningExtension);
      const isSameExtensionRunning = runningExtension && (!extension.server || extension.server === this.extensionManagementServerService.getExtensionManagementServer(toExtension(runningExtension))) && (!extension.resourceExtension || this.uriIdentityService.extUri.isEqual(extension.resourceExtension.location, runningExtension.extensionLocation));
      if (!canRemoveRunningExtension && isSameExtensionRunning && !runningExtension.isUnderDevelopment) {
        return { action: reloadAction, reason: nls.localize("postUninstallTooltip", "Please {0} to complete the uninstallation of this extension.", reloadActionLabel) };
      }
      return void 0;
    }
    if (extension.local) {
      const isSameExtensionRunning = runningExtension && extension.server === this.extensionManagementServerService.getExtensionManagementServer(toExtension(runningExtension));
      const isEnabled = this.extensionEnablementService.isEnabled(extension.local);
      if (runningExtension) {
        if (isEnabled) {
          if (this.extensionService.canAddExtension(toExtensionDescription(extension.local))) {
            return void 0;
          }
          const runningExtensionServer = this.extensionManagementServerService.getExtensionManagementServer(toExtension(runningExtension));
          if (isSameExtensionRunning) {
            if (!runningExtension.isUnderDevelopment && (extension.version !== runningExtension.version || extension.local.targetPlatform !== runningExtension.targetPlatform)) {
              const productCurrentVersion = this.getProductCurrentVersion();
              const productUpdateVersion = this.getProductUpdateVersion();
              if (productUpdateVersion && !isEngineValid(extension.local.manifest.engines.vscode, productCurrentVersion.version, productCurrentVersion.date) && isEngineValid(extension.local.manifest.engines.vscode, productUpdateVersion.version, productUpdateVersion.date)) {
                const state = this.updateService.state;
                if (state.type === StateType.AvailableForDownload) {
                  return { action: ExtensionRuntimeActionType.DownloadUpdate, reason: nls.localize("postUpdateDownloadTooltip", "Please update {0} to enable the updated extension.", this.productService.nameLong) };
                }
                if (state.type === StateType.Downloaded) {
                  return { action: ExtensionRuntimeActionType.ApplyUpdate, reason: nls.localize("postUpdateUpdateTooltip", "Please update {0} to enable the updated extension.", this.productService.nameLong) };
                }
                if (state.type === StateType.Ready) {
                  return { action: ExtensionRuntimeActionType.QuitAndInstall, reason: nls.localize("postUpdateRestartTooltip", "Please restart {0} to enable the updated extension.", this.productService.nameLong) };
                }
                return void 0;
              }
              return { action: reloadAction, reason: nls.localize("postUpdateTooltip", "Please {0} to enable the updated extension.", reloadActionLabel) };
            }
            if (this.extensionsServers.length > 1) {
              const extensionInOtherServer = this.installed.filter((e) => areSameExtensions(e.identifier, extension.identifier) && e.server !== extension.server)[0];
              if (extensionInOtherServer) {
                if (runningExtensionServer === this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnUI(extension.local.manifest) && extensionInOtherServer.server === this.extensionManagementServerService.localExtensionManagementServer) {
                  return { action: reloadAction, reason: nls.localize("enable locally", "Please {0} to enable this extension locally.", reloadActionLabel) };
                }
                if (runningExtensionServer === this.extensionManagementServerService.localExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(extension.local.manifest) && extensionInOtherServer.server === this.extensionManagementServerService.remoteExtensionManagementServer) {
                  return { action: reloadAction, reason: nls.localize("enable remote", "Please {0} to enable this extension in {1}.", reloadActionLabel, this.extensionManagementServerService.remoteExtensionManagementServer?.label) };
                }
              }
            }
          } else {
            if (extension.server === this.extensionManagementServerService.localExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.remoteExtensionManagementServer) {
              if (this.extensionManifestPropertiesService.prefersExecuteOnUI(extension.local.manifest)) {
                return { action: reloadAction, reason: nls.localize("postEnableTooltip", "Please {0} to enable this extension.", reloadActionLabel) };
              }
            }
            if (extension.server === this.extensionManagementServerService.remoteExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.localExtensionManagementServer) {
              if (this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(extension.local.manifest)) {
                return { action: reloadAction, reason: nls.localize("postEnableTooltip", "Please {0} to enable this extension.", reloadActionLabel) };
              }
            }
          }
          return void 0;
        } else {
          if (isSameExtensionRunning && !runningExtension.isUnderDevelopment) {
            return { action: reloadAction, reason: nls.localize("postDisableTooltip", "Please {0} to disable this extension.", reloadActionLabel) };
          }
        }
        return void 0;
      } else {
        if (isEnabled && !this.extensionService.canAddExtension(toExtensionDescription(extension.local))) {
          return { action: reloadAction, reason: nls.localize("postEnableTooltip", "Please {0} to enable this extension.", reloadActionLabel) };
        }
        const otherServer = extension.server ? extension.server === this.extensionManagementServerService.localExtensionManagementServer ? this.extensionManagementServerService.remoteExtensionManagementServer : this.extensionManagementServerService.localExtensionManagementServer : null;
        if (otherServer && extension.enablementState === EnablementState.DisabledByExtensionKind) {
          const extensionInOtherServer = this.local.filter((e) => areSameExtensions(e.identifier, extension.identifier) && e.server === otherServer)[0];
          if (extensionInOtherServer && extensionInOtherServer.local && this.extensionEnablementService.isEnabled(extensionInOtherServer.local)) {
            return { action: reloadAction, reason: nls.localize("postEnableTooltip", "Please {0} to enable this extension.", reloadActionLabel) };
          }
        }
      }
    }
    return void 0;
  }
  getPrimaryExtension(extensions) {
    if (extensions.length === 1) {
      return extensions[0];
    }
    const enabledExtensions = extensions.filter((e) => e.local && this.extensionEnablementService.isEnabled(e.local));
    if (enabledExtensions.length === 1) {
      return enabledExtensions[0];
    }
    const extensionsToChoose = enabledExtensions.length ? enabledExtensions : extensions;
    const manifest = extensionsToChoose.find((e) => e.local && e.local.manifest)?.local?.manifest;
    if (!manifest) {
      return extensionsToChoose[0];
    }
    const extensionKinds = this.extensionManifestPropertiesService.getExtensionKind(manifest);
    let extension = extensionsToChoose.find((extension2) => {
      for (const extensionKind of extensionKinds) {
        switch (extensionKind) {
          case "ui":
            if (extension2.server === this.extensionManagementServerService.localExtensionManagementServer) {
              return true;
            }
            return false;
          case "workspace":
            if (extension2.server === this.extensionManagementServerService.remoteExtensionManagementServer) {
              return true;
            }
            return false;
          case "web":
            if (extension2.server === this.extensionManagementServerService.webExtensionManagementServer) {
              return true;
            }
            return false;
        }
      }
      return false;
    });
    if (!extension && this.extensionManagementServerService.localExtensionManagementServer) {
      extension = extensionsToChoose.find((extension2) => {
        for (const extensionKind of extensionKinds) {
          switch (extensionKind) {
            case "workspace":
              if (extension2.server === this.extensionManagementServerService.localExtensionManagementServer) {
                return true;
              }
              return false;
            case "web":
              if (extension2.server === this.extensionManagementServerService.localExtensionManagementServer) {
                return true;
              }
              return false;
          }
        }
        return false;
      });
    }
    if (!extension && this.extensionManagementServerService.webExtensionManagementServer) {
      extension = extensionsToChoose.find((extension2) => {
        for (const extensionKind of extensionKinds) {
          switch (extensionKind) {
            case "web":
              if (extension2.server === this.extensionManagementServerService.webExtensionManagementServer) {
                return true;
              }
              return false;
          }
        }
        return false;
      });
    }
    if (!extension && this.extensionManagementServerService.remoteExtensionManagementServer) {
      extension = extensionsToChoose.find((extension2) => {
        for (const extensionKind of extensionKinds) {
          switch (extensionKind) {
            case "web":
              if (extension2.server === this.extensionManagementServerService.remoteExtensionManagementServer) {
                return true;
              }
              return false;
          }
        }
        return false;
      });
    }
    return extension || extensions[0];
  }
  getExtensionState(extension) {
    if (this.installing.some((i) => areSameExtensions(i.identifier, extension.identifier) && (!extension.server || i.server === extension.server))) {
      return ExtensionState.Installing;
    }
    if (this.remoteExtensions) {
      const state = this.remoteExtensions.getExtensionState(extension);
      if (state !== ExtensionState.Uninstalled) {
        return state;
      }
    }
    if (this.webExtensions) {
      const state = this.webExtensions.getExtensionState(extension);
      if (state !== ExtensionState.Uninstalled) {
        return state;
      }
    }
    if (this.localExtensions) {
      return this.localExtensions.getExtensionState(extension);
    }
    return ExtensionState.Uninstalled;
  }
  async checkForUpdates(reason, onlyBuiltin) {
    if (reason) {
      this.logService.trace(`[Extensions]: Checking for updates. Reason: ${reason}`);
    } else {
      this.logService.trace(`[Extensions]: Checking for updates`);
    }
    if (!this.galleryService.isEnabled()) {
      return;
    }
    const extensions = [];
    if (this.localExtensions) {
      extensions.push(this.localExtensions);
    }
    if (this.remoteExtensions) {
      extensions.push(this.remoteExtensions);
    }
    if (this.webExtensions) {
      extensions.push(this.webExtensions);
    }
    if (!extensions.length) {
      return;
    }
    const infos = [];
    for (const installed of this.local) {
      if (onlyBuiltin && !installed.isBuiltin) {
        continue;
      }
      if (!installed.local?.forceAutoUpdate && installed.isBuiltin && !installed.local?.pinned && (installed.type === ExtensionType.System || !installed.local?.identifier.uuid)) {
        continue;
      }
      if (installed.local?.source === "resource") {
        continue;
      }
      infos.push({ ...installed.identifier, preRelease: !!installed.local?.preRelease, currentVersion: installed.isBuiltin ? installed.version : void 0 });
    }
    if (infos.length) {
      const targetPlatform = await extensions[0].server.extensionManagementService.getTargetPlatform();
      this.telemetryService.publicLog2("galleryService:checkingForUpdates", {
        count: infos.length
      });
      this.logService.trace(`Checking updates for extensions`, infos.map((e) => e.id).join(", "));
      const galleryExtensions = await this.galleryService.getExtensions(infos, { targetPlatform, compatible: true, productVersion: this.getProductVersion() }, CancellationToken.None);
      if (galleryExtensions.length) {
        await this.syncInstalledExtensionsWithGallery(galleryExtensions, infos);
      }
    }
  }
  async updateAll() {
    const toUpdate = [];
    this.outdated.forEach((extension) => {
      if (extension.gallery) {
        toUpdate.push({
          extension: extension.gallery,
          options: {
            operation: InstallOperation.Update,
            installPreReleaseVersion: extension.local?.isPreReleaseVersion,
            profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
            isApplicationScoped: extension.local?.isApplicationScoped,
            context: { [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true }
          }
        });
      }
    });
    return this.extensionManagementService.installGalleryExtensions(toUpdate);
  }
  async downloadVSIX(extensionId, versionKind) {
    let version;
    if (versionKind === "any") {
      version = await this.pickVersionToDownload(extensionId);
      if (!version) {
        return;
      }
    }
    const extensionInfo = version ? { id: extensionId, version: version.version } : { id: extensionId, preRelease: versionKind === "prerelease" };
    const queryOptions = version ? {} : { compatible: true };
    let [galleryExtension] = await this.galleryService.getExtensions([extensionInfo], queryOptions, CancellationToken.None);
    if (!galleryExtension) {
      throw new Error(nls.localize("extension not found", "Extension '{0}' not found.", extensionId));
    }
    let targetPlatform = galleryExtension.properties.targetPlatform;
    const options = [];
    for (const targetPlatform2 of version?.targetPlatforms ?? galleryExtension.allTargetPlatforms) {
      if (targetPlatform2 !== TargetPlatform.UNKNOWN && targetPlatform2 !== TargetPlatform.UNIVERSAL) {
        options.push({
          label: targetPlatform2 === TargetPlatform.UNDEFINED ? nls.localize("allplatforms", "All Platforms") : TargetPlatformToString(targetPlatform2),
          id: targetPlatform2
        });
      }
    }
    if (options.length > 1) {
      const message = nls.localize("platform placeholder", "Please select the platform for which you want to download the VSIX");
      const option = await this.quickInputService.pick(options.sort((a, b) => a.label.localeCompare(b.label)), { placeHolder: message });
      if (!option) {
        return;
      }
      targetPlatform = option.id;
    }
    if (targetPlatform !== galleryExtension.properties.targetPlatform) {
      [galleryExtension] = await this.galleryService.getExtensions([extensionInfo], { ...queryOptions, targetPlatform }, CancellationToken.None);
    }
    const result = await this.fileDialogService.showOpenDialog({
      title: nls.localize("download title", "Select folder to download the VSIX"),
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: nls.localize("download", "Download")
    });
    if (!result?.[0]) {
      return;
    }
    this.progressService.withProgress({ location: ProgressLocation.Notification }, async (progress) => {
      try {
        progress.report({ message: nls.localize("downloading...", "Downloading VSIX...") });
        const name = `${galleryExtension.identifier.id}-${galleryExtension.version}${targetPlatform !== TargetPlatform.UNDEFINED && targetPlatform !== TargetPlatform.UNIVERSAL && targetPlatform !== TargetPlatform.UNKNOWN ? `-${targetPlatform}` : ""}.vsix`;
        await this.galleryService.download(galleryExtension, this.uriIdentityService.extUri.joinPath(result[0], name), InstallOperation.None);
        this.notificationService.info(nls.localize("download.completed", "Successfully downloaded the VSIX"));
      } catch (error) {
        this.notificationService.error(nls.localize("download.failed", "Error while downloading the VSIX: {0}", getErrorMessage(error)));
      }
    });
  }
  async pickVersionToDownload(extensionId) {
    const allVersions = await this.galleryService.getAllVersions({ id: extensionId });
    if (!allVersions.length) {
      await this.dialogService.info(nls.localize("no versions", "This extension has no other versions."));
      return;
    }
    const picks = allVersions.map((v, i) => {
      return {
        id: v.version,
        label: v.version,
        description: `${fromNow(new Date(Date.parse(v.date)), true)}${v.isPreReleaseVersion ? ` (${nls.localize("pre-release", "pre-release")})` : ""}`,
        ariaLabel: `${v.isPreReleaseVersion ? "Pre-Release version" : "Release version"} ${v.version}`,
        data: v
      };
    });
    const pick = await this.quickInputService.pick(
      picks,
      {
        placeHolder: nls.localize("selectVersion", "Select Version to Download"),
        matchOnDetail: true
      }
    );
    return pick?.data;
  }
  async syncInstalledExtensionsWithGallery(gallery, flagExtensionsMissingFromGallery) {
    const extensions = [];
    if (this.localExtensions) {
      extensions.push(this.localExtensions);
    }
    if (this.remoteExtensions) {
      extensions.push(this.remoteExtensions);
    }
    if (this.webExtensions) {
      extensions.push(this.webExtensions);
    }
    if (!extensions.length) {
      return;
    }
    await Promise.allSettled(extensions.map((extensions2) => extensions2.syncInstalledExtensionsWithGallery(gallery, this.getProductVersion(), flagExtensionsMissingFromGallery)));
    if (this.outdated.length) {
      this.logService.info(`Auto updating outdated extensions.`, this.outdated.map((e) => e.identifier.id).join(", "));
      this.eventuallyAutoUpdateExtensions();
    }
  }
  isAutoCheckUpdatesEnabled() {
    if (this.meteredConnectionService.isConnectionMetered) {
      return false;
    }
    return this.configurationService.getValue(AutoCheckUpdatesConfigurationKey);
  }
  eventuallyCheckForUpdates(immediate = false) {
    this.updatesCheckDelayer.cancel();
    this.updatesCheckDelayer.trigger(async () => {
      if (this.isAutoCheckUpdatesEnabled()) {
        await this.checkForUpdates();
      }
      this.eventuallyCheckForUpdates();
    }, immediate ? 0 : this.getUpdatesCheckInterval()).then(void 0, (err) => null);
  }
  getUpdatesCheckInterval() {
    if (this.productService.quality === "insider" && this.getProductUpdateVersion()) {
      return 1e3 * 60 * 60 * 1;
    }
    return ExtensionsWorkbenchService.UpdatesCheckInterval;
  }
  eventuallyAutoUpdateExtensions() {
    this.autoUpdateDelayer.trigger(() => this.autoUpdateExtensions()).then(void 0, (err) => null);
  }
  async autoUpdateBuiltinExtensions() {
    if (this.meteredConnectionService.isConnectionMetered) {
      return;
    }
    await this.checkForUpdates(void 0, true);
    const toUpdate = this.outdated.filter((e) => e.isBuiltin);
    await Promises.settled(toUpdate.map((e) => this.install(e, e.local?.preRelease ? { installPreReleaseVersion: true } : void 0)));
  }
  async syncPinnedBuiltinExtensions() {
    const infos = [];
    for (const installed of this.local) {
      if (installed.isBuiltin && installed.local?.pinned && installed.local?.identifier.uuid) {
        infos.push({ ...installed.identifier, version: installed.version });
      }
    }
    if (infos.length) {
      const galleryExtensions = await this.galleryService.getExtensions(infos, CancellationToken.None);
      if (galleryExtensions.length) {
        await this.syncInstalledExtensionsWithGallery(galleryExtensions);
      }
    }
  }
  async autoUpdateExtensions() {
    if (this.meteredConnectionService.isConnectionMetered) {
      this.logService.trace("[Extensions]: Skipping auto-update because connection is metered");
      return;
    }
    const toUpdate = [];
    const disabledAutoUpdate = [];
    const consentRequired = [];
    let soonestDelayRemaining = Number.MAX_SAFE_INTEGER;
    for (const extension of this.outdated) {
      if (!this.shouldAutoUpdateExtension(extension)) {
        disabledAutoUpdate.push(extension.identifier.id);
        continue;
      }
      if (!extension.local?.forceAutoUpdate) {
        const delayRemaining = this.getAutoUpdateDelayRemaining(extension);
        if (delayRemaining > 0) {
          this.logService.trace("Auto update delayed for extension", extension.identifier.id);
          soonestDelayRemaining = Math.min(soonestDelayRemaining, delayRemaining);
          continue;
        }
      }
      if (await this.shouldRequireConsentToUpdate(extension)) {
        consentRequired.push(extension.identifier.id);
        continue;
      }
      toUpdate.push(extension);
    }
    if (soonestDelayRemaining < Number.MAX_SAFE_INTEGER) {
      this.delayedAutoUpdateCheckTimer.value = disposableTimeout(() => this.eventuallyCheckForUpdates(true), soonestDelayRemaining);
    } else {
      this.delayedAutoUpdateCheckTimer.value = void 0;
    }
    if (disabledAutoUpdate.length) {
      this.logService.trace("Auto update disabled for extensions", disabledAutoUpdate.join(", "));
    }
    if (consentRequired.length) {
      this.logService.info("Auto update consent required for extensions", consentRequired.join(", "));
    }
    if (!toUpdate.length) {
      return;
    }
    const productVersion = this.getProductVersion();
    await Promises.settled(toUpdate.map((e) => this.install(e, e.local?.preRelease ? { installPreReleaseVersion: true, productVersion } : { productVersion })));
  }
  getProductVersion() {
    return this.getProductUpdateVersion() ?? this.getProductCurrentVersion();
  }
  getProductCurrentVersion() {
    return { version: this.productService.version, date: this.productService.date };
  }
  getProductUpdateVersion() {
    switch (this.updateService.state.type) {
      case StateType.AvailableForDownload:
      case StateType.Downloaded:
      case StateType.Updating:
      case StateType.Ready: {
        const version = this.updateService.state.update.productVersion;
        if (version && semver.valid(version)) {
          return { version, date: this.updateService.state.update.timestamp ? new Date(this.updateService.state.update.timestamp).toISOString() : void 0 };
        }
      }
    }
    return void 0;
  }
  shouldAutoUpdateExtension(extension) {
    if (extension.deprecationInfo?.disallowInstall) {
      return false;
    }
    if (extension.local?.forceAutoUpdate) {
      return true;
    }
    const autoUpdateValue = this.getAutoUpdateValue();
    if (autoUpdateValue === "off") {
      const extensionsToAutoUpdate = this.getEnabledAutoUpdateExtensions();
      const extensionId = extension.identifier.id.toLowerCase();
      if (extensionsToAutoUpdate.includes(extensionId)) {
        return true;
      }
      if (this.isAutoUpdateEnabledForPublisher(extension.publisher) && !extensionsToAutoUpdate.includes(`-${extensionId}`)) {
        return true;
      }
      return false;
    }
    if (extension.pinned) {
      return false;
    }
    const disabledAutoUpdateExtensions = this.getDisabledAutoUpdateExtensions();
    if (disabledAutoUpdateExtensions.includes(extension.identifier.id.toLowerCase())) {
      return false;
    }
    return extension.enablementState !== EnablementState.DisabledGlobally && extension.enablementState !== EnablementState.DisabledWorkspace;
  }
  async shouldRequireConsentToUpdate(extension) {
    if (!extension.outdated) {
      return;
    }
    if (!extension.gallery || !extension.local) {
      return;
    }
    if (extension.local.identifier.uuid && extension.local.identifier.uuid !== extension.gallery.identifier.uuid) {
      return nls.localize("consentRequiredToUpdateRepublishedExtension", "The marketplace metadata of this extension changed, likely due to a re-publish.");
    }
    if (!extension.local.manifest.engines.vscode || extension.local.manifest.main || extension.local.manifest.browser) {
      return;
    }
    if (isDefined(extension.gallery.properties?.executesCode)) {
      if (!extension.gallery.properties.executesCode) {
        return;
      }
    } else {
      const manifest = extension instanceof Extension ? await extension.getGalleryManifest() : await this.galleryService.getManifest(extension.gallery, CancellationToken.None);
      if (!manifest?.main && !manifest?.browser) {
        return;
      }
    }
    return nls.localize("consentRequiredToUpdate", "The update for {0} extension introduces executable code, which is not present in the currently installed version.", extension.displayName);
  }
  isAutoUpdateEnabledFor(extensionOrPublisher) {
    if (isString(extensionOrPublisher)) {
      if (EXTENSION_IDENTIFIER_REGEX.test(extensionOrPublisher)) {
        throw new Error("Expected publisher string, found extension identifier");
      }
      if (this.isAutoUpdateEnabled()) {
        return true;
      }
      return this.isAutoUpdateEnabledForPublisher(extensionOrPublisher);
    }
    return this.shouldAutoUpdateExtension(extensionOrPublisher);
  }
  isAutoUpdateEnabledForPublisher(publisher) {
    const publishersToAutoUpdate = this.getPublishersToAutoUpdate();
    return publishersToAutoUpdate.includes(publisher.toLowerCase());
  }
  async updateAutoUpdateEnablementFor(extensionOrPublisher, enable) {
    if (this.isAutoUpdateEnabled()) {
      if (isString(extensionOrPublisher)) {
        throw new Error("Expected extension, found publisher string");
      }
      const disabledAutoUpdateExtensions = this.getDisabledAutoUpdateExtensions();
      const extensionId = extensionOrPublisher.identifier.id.toLowerCase();
      const extensionIndex = disabledAutoUpdateExtensions.indexOf(extensionId);
      if (enable) {
        if (extensionIndex !== -1) {
          disabledAutoUpdateExtensions.splice(extensionIndex, 1);
        }
      } else {
        if (extensionIndex === -1) {
          disabledAutoUpdateExtensions.push(extensionId);
        }
      }
      this.setDisabledAutoUpdateExtensions(disabledAutoUpdateExtensions);
      if (enable && extensionOrPublisher.local && extensionOrPublisher.pinned) {
        await this.extensionManagementService.updateMetadata(extensionOrPublisher.local, { pinned: false });
      }
      this._onChange.fire(extensionOrPublisher);
    } else {
      const enabledAutoUpdateExtensions = this.getEnabledAutoUpdateExtensions();
      if (isString(extensionOrPublisher)) {
        if (EXTENSION_IDENTIFIER_REGEX.test(extensionOrPublisher)) {
          throw new Error("Expected publisher string, found extension identifier");
        }
        extensionOrPublisher = extensionOrPublisher.toLowerCase();
        if (this.isAutoUpdateEnabledFor(extensionOrPublisher) !== enable) {
          if (enable) {
            enabledAutoUpdateExtensions.push(extensionOrPublisher);
          } else {
            if (enabledAutoUpdateExtensions.includes(extensionOrPublisher)) {
              enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(extensionOrPublisher), 1);
            }
          }
        }
        this.setEnabledAutoUpdateExtensions(enabledAutoUpdateExtensions);
        for (const e of this.installed) {
          if (e.publisher.toLowerCase() === extensionOrPublisher) {
            this._onChange.fire(e);
          }
        }
      } else {
        const extensionId = extensionOrPublisher.identifier.id.toLowerCase();
        const enableAutoUpdatesForPublisher = this.isAutoUpdateEnabledFor(extensionOrPublisher.publisher.toLowerCase());
        const enableAutoUpdatesForExtension = enabledAutoUpdateExtensions.includes(extensionId);
        const disableAutoUpdatesForExtension = enabledAutoUpdateExtensions.includes(`-${extensionId}`);
        if (enable) {
          if (disableAutoUpdatesForExtension) {
            enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(`-${extensionId}`), 1);
          }
          if (enableAutoUpdatesForPublisher) {
            if (enableAutoUpdatesForExtension) {
              enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(extensionId), 1);
            }
          } else {
            if (!enableAutoUpdatesForExtension) {
              enabledAutoUpdateExtensions.push(extensionId);
            }
          }
        } else {
          if (enableAutoUpdatesForExtension) {
            enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(extensionId), 1);
          }
          if (enableAutoUpdatesForPublisher) {
            if (!disableAutoUpdatesForExtension) {
              enabledAutoUpdateExtensions.push(`-${extensionId}`);
            }
          } else {
            if (disableAutoUpdatesForExtension) {
              enabledAutoUpdateExtensions.splice(enabledAutoUpdateExtensions.indexOf(`-${extensionId}`), 1);
            }
          }
        }
        this.setEnabledAutoUpdateExtensions(enabledAutoUpdateExtensions);
        this._onChange.fire(extensionOrPublisher);
      }
    }
    if (enable) {
      this.autoUpdateExtensions();
    }
  }
  onDidSelectedExtensionToAutoUpdateValueChange() {
    if (this.enabledAuotUpdateExtensionsValue !== this.getEnabledAutoUpdateExtensionsValue() || this.disabledAutoUpdateExtensionsValue !== this.getDisabledAutoUpdateExtensionsValue()) {
      const userExtensions = this.installed.filter((e) => !e.isBuiltin);
      const groupBy = (extensions) => {
        const shouldAutoUpdate2 = [];
        const shouldNotAutoUpdate2 = [];
        for (const extension of extensions) {
          if (this.shouldAutoUpdateExtension(extension)) {
            shouldAutoUpdate2.push(extension);
          } else {
            shouldNotAutoUpdate2.push(extension);
          }
        }
        return [shouldAutoUpdate2, shouldNotAutoUpdate2];
      };
      const [wasShouldAutoUpdate, wasShouldNotAutoUpdate] = groupBy(userExtensions);
      this._enabledAutoUpdateExtensionsValue = void 0;
      this._disabledAutoUpdateExtensionsValue = void 0;
      const [shouldAutoUpdate, shouldNotAutoUpdate] = groupBy(userExtensions);
      for (const e of wasShouldAutoUpdate ?? []) {
        if (shouldNotAutoUpdate?.includes(e)) {
          this._onChange.fire(e);
        }
      }
      for (const e of wasShouldNotAutoUpdate ?? []) {
        if (shouldAutoUpdate?.includes(e)) {
          this._onChange.fire(e);
        }
      }
    }
  }
  async canInstall(extension) {
    if (!(extension instanceof Extension)) {
      return new MarkdownString().appendText(nls.localize("not an extension", "The provided object is not an extension."));
    }
    if (extension.isMalicious) {
      return new MarkdownString().appendText(nls.localize("malicious", "This extension is reported to be problematic."));
    }
    if (extension.deprecationInfo?.disallowInstall) {
      return new MarkdownString().appendText(nls.localize("disallowed", "This extension is disallowed to be installed."));
    }
    if (extension.gallery) {
      if (!extension.gallery.isSigned && shouldRequireRepositorySignatureFor(extension.private, await this.extensionGalleryManifestService.getExtensionGalleryManifest())) {
        return new MarkdownString().appendText(nls.localize("not signed", "This extension is not signed."));
      }
      const localResult = this.localExtensions ? await this.localExtensions.canInstall(extension.gallery) : void 0;
      if (localResult === true) {
        return true;
      }
      const remoteResult = this.remoteExtensions ? await this.remoteExtensions.canInstall(extension.gallery) : void 0;
      if (remoteResult === true) {
        return true;
      }
      const webResult = this.webExtensions ? await this.webExtensions.canInstall(extension.gallery) : void 0;
      if (webResult === true) {
        return true;
      }
      return localResult ?? remoteResult ?? webResult ?? new MarkdownString().appendText(nls.localize("cannot be installed", "Cannot install the '{0}' extension because it is not available in this setup.", extension.displayName ?? extension.identifier.id));
    }
    if (extension.resourceExtension && await this.extensionManagementService.canInstall(extension.resourceExtension) === true) {
      return true;
    }
    return new MarkdownString().appendText(nls.localize("cannot be installed", "Cannot install the '{0}' extension because it is not available in this setup.", extension.displayName ?? extension.identifier.id));
  }
  async install(arg, installOptions = {}, progressLocation) {
    const extension = await this._install(arg, installOptions, progressLocation);
    if (!extension) {
      throw new Error(nls.localize("unknown", "Unable to install extension"));
    }
    if (installOptions.enable) {
      if (extension.enablementState === EnablementState.DisabledWorkspace || extension.enablementState === EnablementState.DisabledGlobally) {
        if (installOptions.justification) {
          const result = await this.dialogService.confirm({
            title: nls.localize("enableExtensionTitle", "Enable Extension"),
            message: nls.localize("enableExtensionMessage", "Would you like to enable '{0}' extension?", extension.displayName),
            detail: isString(installOptions.justification) ? installOptions.justification : installOptions.justification.reason,
            primaryButton: isString(installOptions.justification) ? nls.localize({ key: "enableButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Enable Extension") : nls.localize({ key: "enableButtonLabelWithAction", comment: ["&& denotes a mnemonic"] }, "&&Enable Extension and {0}", installOptions.justification.action)
          });
          if (!result.confirmed) {
            throw new CancellationError();
          }
        }
        await this.setEnablement(extension, extension.enablementState === EnablementState.DisabledWorkspace ? EnablementState.EnabledWorkspace : EnablementState.EnabledGlobally);
      }
      await this.waitUntilExtensionIsEnabled(extension);
    }
    return extension;
  }
  async _install(arg, installOptions = {}, progressLocation) {
    let installable;
    let extension;
    let servers;
    if (arg instanceof URI) {
      installable = arg;
    } else {
      let installableInfo;
      let gallery;
      if (isString(arg)) {
        extension = this.local.find((e) => areSameExtensions(e.identifier, { id: arg }));
        if (extension?.isBuiltin) {
          if (this.productService.builtInExtensionsEnabledWithAutoUpdates?.some((id) => id.toLowerCase() === arg.toLowerCase())) {
            return extension;
          }
        } else {
          installableInfo = { id: arg, version: installOptions.version, preRelease: installOptions.installPreReleaseVersion ?? this.extensionManagementService.preferPreReleases };
        }
      } else if (arg.gallery) {
        extension = arg;
        gallery = arg.gallery;
        if (installOptions.version && installOptions.version !== gallery?.version) {
          installableInfo = { id: extension.identifier.id, version: installOptions.version };
        }
      } else if (arg.resourceExtension) {
        extension = arg;
        installable = arg.resourceExtension;
      }
      if (installableInfo) {
        const targetPlatform = extension?.server ? await extension.server.extensionManagementService.getTargetPlatform() : void 0;
        gallery = (await this.galleryService.getExtensions([installableInfo], { targetPlatform }, CancellationToken.None)).at(0);
      }
      if (!extension && gallery) {
        extension = this.instantiationService.createInstance(Extension, (ext) => this.getExtensionState(ext), (ext) => this.getRuntimeState(ext), void 0, void 0, gallery, void 0);
        extension.setExtensionsControlManifest(await this.extensionManagementService.getExtensionsControlManifest());
      }
      if (extension?.isMalicious) {
        throw new Error(nls.localize("malicious", "This extension is reported to be problematic."));
      }
      if (gallery) {
        if (installOptions.installEverywhere) {
          servers = [];
          const installableServers = await this.extensionManagementService.getInstallableServers(gallery);
          for (const extensionsServer of this.extensionsServers) {
            if (installableServers.includes(extensionsServer.server) && !extensionsServer.local.find((e) => areSameExtensions(e.identifier, gallery.identifier))) {
              servers.push(extensionsServer.server);
            }
          }
        } else if (installOptions.enable && extension?.local) {
          servers = [];
          if (extension.enablementState === EnablementState.DisabledByExtensionKind) {
            const [installableServer] = await this.extensionManagementService.getInstallableServers(gallery);
            if (installableServer) {
              servers.push(installableServer);
            }
          }
        }
      }
      if (!servers || servers.length) {
        if (!installable) {
          if (!gallery) {
            const id = isString(arg) ? arg : arg.identifier.id;
            const manifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
            const reportIssueUri = manifest ? getExtensionGalleryManifestResourceUri(manifest, ExtensionGalleryResourceType.ContactSupportUri) : void 0;
            const reportIssueMessage = reportIssueUri ? nls.localize("report issue", "If this issue persists, please report it at {0}", reportIssueUri.toString()) : "";
            if (installOptions.version) {
              const message = nls.localize("not found version", "The extension '{0}' cannot be installed because the requested version '{1}' was not found.", id, installOptions.version);
              throw new ExtensionManagementError(reportIssueMessage ? `${message} ${reportIssueMessage}` : message, ExtensionManagementErrorCode.NotFound);
            } else {
              const message = nls.localize("not found", "The extension '{0}' cannot be installed because it was not found.", id);
              throw new ExtensionManagementError(reportIssueMessage ? `${message} ${reportIssueMessage}` : message, ExtensionManagementErrorCode.NotFound);
            }
          }
          installable = gallery;
        }
        if (installOptions.version) {
          installOptions.installGivenVersion = true;
        }
        if (extension?.isWorkspaceScoped) {
          installOptions.isWorkspaceScoped = true;
        }
      }
    }
    if (installable) {
      if (installOptions.justification) {
        const syncCheck = isUndefined(installOptions.isMachineScoped) && this.userDataSyncEnablementService.isEnabled() && this.userDataSyncEnablementService.isResourceEnabled(SyncResource.Extensions);
        const buttons = [];
        buttons.push({
          label: isString(installOptions.justification) || !installOptions.justification.action ? nls.localize({ key: "installButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Install Extension") : nls.localize({ key: "installButtonLabelWithAction", comment: ["&& denotes a mnemonic"] }, "&&Install Extension and {0}", installOptions.justification.action),
          run: () => true
        });
        if (!extension) {
          buttons.push({ label: nls.localize("open", "Open Extension"), run: () => {
            this.open(extension);
            return false;
          } });
        }
        const result = await this.dialogService.prompt({
          title: nls.localize("installExtensionTitle", "Install Extension"),
          message: extension ? nls.localize("installExtensionMessage", "Would you like to install '{0}' extension from '{1}'?", extension.displayName, extension.publisherDisplayName) : nls.localize("installVSIXMessage", "Would you like to install the extension?"),
          detail: isString(installOptions.justification) ? installOptions.justification : installOptions.justification.reason,
          cancelButton: true,
          buttons,
          checkbox: syncCheck ? {
            label: nls.localize("sync extension", "Sync this extension"),
            checked: true
          } : void 0
        });
        if (!result.result) {
          throw new CancellationError();
        }
        if (syncCheck) {
          installOptions.isMachineScoped = !result.checkboxChecked;
        }
      }
      if (installable instanceof URI) {
        extension = await this.doInstall(void 0, () => this.installFromVSIX(installable, installOptions), progressLocation);
      } else if (extension) {
        if (extension.resourceExtension) {
          extension = await this.doInstall(extension, () => this.extensionManagementService.installResourceExtension(installable, installOptions), progressLocation);
        } else {
          extension = await this.doInstall(extension, () => this.installFromGallery(extension, installable, installOptions, servers), progressLocation);
        }
      }
    }
    return extension;
  }
  async installInServer(extension, server, installOptions) {
    await this.doInstall(extension, async () => {
      const local = extension.local;
      if (!local) {
        throw new Error("Extension not found");
      }
      if (!extension.gallery) {
        extension = (await this.getExtensions([{ ...extension.identifier, preRelease: local.preRelease }], CancellationToken.None))[0] ?? extension;
      }
      if (extension.gallery) {
        return server.extensionManagementService.installFromGallery(extension.gallery, { installPreReleaseVersion: local.preRelease, ...installOptions });
      }
      const targetPlatform = await server.extensionManagementService.getTargetPlatform();
      if (!isTargetPlatformCompatible(local.targetPlatform, [local.targetPlatform], targetPlatform)) {
        throw new Error(nls.localize("incompatible", "Can't install '{0}' extension because it is not compatible.", extension.identifier.id));
      }
      const vsix = await this.extensionManagementService.zip(local);
      try {
        return await server.extensionManagementService.install(vsix);
      } finally {
        try {
          await this.fileService.del(vsix);
        } catch (error) {
          this.logService.error(error);
        }
      }
    });
  }
  canSetLanguage(extension) {
    if (!isWeb) {
      return false;
    }
    if (!extension.gallery) {
      return false;
    }
    const locale = getLocale(extension.gallery);
    if (!locale) {
      return false;
    }
    return true;
  }
  async setLanguage(extension) {
    if (!this.canSetLanguage(extension)) {
      throw new Error("Can not set language");
    }
    const locale = getLocale(extension.gallery);
    if (locale === language) {
      return;
    }
    const localizedLanguageName = extension.gallery?.properties?.localizedLanguages?.[0];
    return this.localeService.setLocale({ id: locale, galleryExtension: extension.gallery, extensionId: extension.identifier.id, label: localizedLanguageName ?? extension.displayName });
  }
  setEnablement(extensions, enablementState) {
    extensions = Array.isArray(extensions) ? extensions : [extensions];
    return this.promptAndSetEnablement(extensions, enablementState);
  }
  async uninstall(e) {
    const extension = e.local ? e : this.local.find((local) => areSameExtensions(local.identifier, e.identifier));
    if (!extension?.local) {
      throw new Error("Missing local");
    }
    if (extension.local.isApplicationScoped && this.userDataProfilesService.profiles.length > 1) {
      const { confirmed } = await this.dialogService.confirm({
        title: nls.localize("uninstallApplicationScoped", "Uninstall Extension"),
        type: Severity.Info,
        message: nls.localize("uninstallApplicationScopedMessage", "Would you like to Uninstall {0} from all profiles?", extension.displayName),
        primaryButton: nls.localize("uninstallAllProfiles", "Uninstall (All Profiles)")
      });
      if (!confirmed) {
        throw new CancellationError();
      }
    }
    const extensionsToUninstall = [{ extension: extension.local }];
    if (!areSameExtensions(extension.identifier, { id: this.productService.defaultChatAgent.extensionId })) {
      for (const packExtension of this.getAllPackedExtensions(extension, this.local)) {
        if (packExtension.local && !extensionsToUninstall.some((e2) => areSameExtensions(e2.extension.identifier, packExtension.identifier))) {
          extensionsToUninstall.push({ extension: packExtension.local });
        }
      }
    }
    const dependents = [];
    let extensionsFromAllProfiles;
    for (const { extension: extension2 } of extensionsToUninstall) {
      const installedExtensions = [];
      if (extension2.isApplicationScoped && this.userDataProfilesService.profiles.length > 1) {
        if (!extensionsFromAllProfiles) {
          extensionsFromAllProfiles = [];
          await Promise.allSettled(this.userDataProfilesService.profiles.map(async (profile) => {
            const installed = await this.extensionManagementService.getInstalled(ExtensionType.User, profile.extensionsResource);
            for (const local of installed) {
              extensionsFromAllProfiles?.push([local, profile.extensionsResource]);
            }
          }));
        }
        installedExtensions.push(...extensionsFromAllProfiles);
      } else {
        for (const { local } of this.local) {
          if (local) {
            installedExtensions.push([local, void 0]);
          }
        }
      }
      for (const [local, profileLocation] of installedExtensions) {
        if (areSameExtensions(local.identifier, extension2.identifier)) {
          continue;
        }
        if (!local.manifest.extensionDependencies || local.manifest.extensionDependencies.length === 0) {
          continue;
        }
        if (extension2.manifest.extensionPack?.some((id) => areSameExtensions({ id }, local.identifier))) {
          continue;
        }
        if (dependents.some((d) => d.manifest.extensionPack?.some((id) => areSameExtensions({ id }, local.identifier)))) {
          continue;
        }
        if (local.manifest.extensionDependencies.some((dep) => areSameExtensions(extension2.identifier, { id: dep }))) {
          dependents.push(local);
          extensionsToUninstall.push({ extension: local, options: { profileLocation } });
        }
      }
    }
    if (dependents.length) {
      const { result } = await this.dialogService.prompt({
        title: nls.localize("uninstallDependents", "Uninstall Extension with Dependents"),
        type: Severity.Warning,
        message: this.getErrorMessageForUninstallingAnExtensionWithDependents(extension, dependents),
        buttons: [{
          label: nls.localize("uninstallAll", "Uninstall All"),
          run: () => true
        }],
        cancelButton: {
          run: () => false
        }
      });
      if (!result) {
        throw new CancellationError();
      }
    }
    return this.withProgress({
      location: ProgressLocation.Extensions,
      title: nls.localize("uninstallingExtension", "Uninstalling extension..."),
      source: `${extension.identifier.id}`
    }, () => this.extensionManagementService.uninstallExtensions(extensionsToUninstall).then(() => void 0));
  }
  getAllPackedExtensions(extension, installed, checked = []) {
    if (checked.some((e) => areSameExtensions(e.identifier, extension.identifier))) {
      return [];
    }
    checked.push(extension);
    const extensionsPack = extension.extensionPack ?? [];
    if (extensionsPack.length) {
      const packedExtensions = [];
      for (const i of installed) {
        if (!i.isBuiltin && extensionsPack.some((id) => areSameExtensions({ id }, i.identifier))) {
          packedExtensions.push(i);
        }
      }
      const packOfPackedExtensions = [];
      for (const packedExtension of packedExtensions) {
        packOfPackedExtensions.push(...this.getAllPackedExtensions(packedExtension, installed, checked));
      }
      return [...packedExtensions, ...packOfPackedExtensions];
    }
    return [];
  }
  getErrorMessageForUninstallingAnExtensionWithDependents(extension, dependents) {
    if (dependents.length === 1) {
      return nls.localize("singleDependentUninstallError", "Cannot uninstall '{0}' extension alone. '{1}' extension depends on this. Do you want to uninstall all these extensions?", extension.displayName, dependents[0].manifest.displayName);
    }
    if (dependents.length === 2) {
      return nls.localize(
        "twoDependentsUninstallError",
        "Cannot uninstall '{0}' extension alone. '{1}' and '{2}' extensions depend on this. Do you want to uninstall all these extensions?",
        extension.displayName,
        dependents[0].manifest.displayName,
        dependents[1].manifest.displayName
      );
    }
    return nls.localize(
      "multipleDependentsUninstallError",
      "Cannot uninstall '{0}' extension alone. '{1}', '{2}' and other extensions depend on this. Do you want to uninstall all these extensions?",
      extension.displayName,
      dependents[0].manifest.displayName,
      dependents[1].manifest.displayName
    );
  }
  isExtensionIgnoredToSync(extension) {
    return extension.local ? !this.isInstalledExtensionSynced(extension.local) : this.extensionsSyncManagementService.hasToNeverSyncExtension(extension.identifier.id);
  }
  async togglePreRelease(extension) {
    if (!extension.local) {
      return;
    }
    if (extension.preRelease !== extension.isPreReleaseVersion) {
      await this.extensionManagementService.updateMetadata(extension.local, { preRelease: !extension.preRelease });
      return;
    }
    await this.install(extension, { installPreReleaseVersion: !extension.preRelease, preRelease: !extension.preRelease });
  }
  async toggleExtensionIgnoredToSync(extension) {
    const extensionsIncludingPackedExtensions = [extension, ...this.getAllPackedExtensions(extension, this.local)];
    for (const e of extensionsIncludingPackedExtensions) {
      const isIgnored = this.isExtensionIgnoredToSync(e);
      if (e.local && isIgnored && e.local.isMachineScoped) {
        await this.extensionManagementService.updateMetadata(e.local, { isMachineScoped: false });
      } else {
        await this.extensionsSyncManagementService.updateIgnoredExtensions(e.identifier.id, !isIgnored);
      }
    }
    await this.userDataAutoSyncService.triggerSync(["IgnoredExtensionsUpdated"]);
  }
  async toggleApplyExtensionToAllProfiles(extension) {
    const extensionsIncludingPackedExtensions = [extension, ...this.getAllPackedExtensions(extension, this.local)];
    const allExtensionServers = this.getAllExtensionServers();
    await Promise.allSettled(extensionsIncludingPackedExtensions.map(async (e) => {
      if (!e.local || isApplicationScopedExtension(e.local.manifest) || e.isBuiltin) {
        return;
      }
      const isApplicationScoped = e.local.isApplicationScoped;
      await Promise.all(allExtensionServers.map(async (extensionServer) => {
        const local = extensionServer.local.find((local2) => areSameExtensions(e.identifier, local2.identifier))?.local;
        if (local && local.isApplicationScoped === isApplicationScoped) {
          await this.extensionManagementService.toggleApplicationScope(local, this.userDataProfileService.currentProfile.extensionsResource);
        }
      }));
    }));
  }
  getAllExtensionServers() {
    const extensions = [];
    if (this.localExtensions) {
      extensions.push(this.localExtensions);
    }
    if (this.remoteExtensions) {
      extensions.push(this.remoteExtensions);
    }
    if (this.webExtensions) {
      extensions.push(this.webExtensions);
    }
    return extensions;
  }
  isInstalledExtensionSynced(extension) {
    if (extension.isMachineScoped) {
      return false;
    }
    if (this.extensionsSyncManagementService.hasToAlwaysSyncExtension(extension.identifier.id)) {
      return true;
    }
    return !this.extensionsSyncManagementService.hasToNeverSyncExtension(extension.identifier.id);
  }
  doInstall(extension, installTask, progressLocation) {
    const title = extension ? nls.localize("installing named extension", "Installing '{0}' extension...", extension.displayName) : nls.localize("installing extension", "Installing extension...");
    return this.withProgress({
      location: progressLocation ?? ProgressLocation.Extensions,
      title
    }, async () => {
      try {
        if (extension) {
          this.installing.push(extension);
          this._onChange.fire(extension);
        }
        const local = await installTask();
        return await this.waitAndGetInstalledExtension(local.identifier);
      } finally {
        if (extension) {
          this.installing = this.installing.filter((e) => e !== extension);
          this._onChange.fire(void 0);
        }
      }
    });
  }
  async installFromVSIX(vsix, installOptions) {
    const manifest = await this.extensionManagementService.getManifest(vsix);
    const existingExtension = this.local.find((local) => areSameExtensions(local.identifier, { id: getGalleryExtensionId(manifest.publisher, manifest.name) }));
    if (existingExtension) {
      installOptions = installOptions || {};
      if (existingExtension.latestVersion === manifest.version) {
        installOptions.pinned = installOptions.pinned ?? (existingExtension.local?.pinned || !this.shouldAutoUpdateExtension(existingExtension));
      } else {
        installOptions.installGivenVersion = true;
      }
    }
    return this.extensionManagementService.installVSIX(vsix, manifest, installOptions);
  }
  installFromGallery(extension, gallery, installOptions, servers) {
    installOptions = installOptions ?? {};
    installOptions.pinned = installOptions.pinned ?? (extension.local?.pinned || !this.shouldAutoUpdateExtension(extension));
    if (extension.local && !servers) {
      installOptions.productVersion = this.getProductVersion();
      installOptions.operation = InstallOperation.Update;
      return this.extensionManagementService.updateFromGallery(gallery, extension.local, installOptions);
    } else {
      return this.extensionManagementService.installFromGallery(gallery, installOptions, servers);
    }
  }
  async waitAndGetInstalledExtension(identifier) {
    let installedExtension = this.local.find((local) => areSameExtensions(local.identifier, identifier));
    if (!installedExtension) {
      await Event.toPromise(Event.filter(this.onChange, (e) => !!e && this.local.some((local) => areSameExtensions(local.identifier, identifier))));
    }
    installedExtension = this.local.find((local) => areSameExtensions(local.identifier, identifier));
    if (!installedExtension) {
      throw new Error("Extension should have been installed");
    }
    return installedExtension;
  }
  async waitUntilExtensionIsEnabled(extension) {
    if (this.extensionService.extensions.find((e) => ExtensionIdentifier.equals(e.identifier, extension.identifier.id))) {
      return;
    }
    if (!extension.local || !this.extensionService.canAddExtension(toExtensionDescription(extension.local))) {
      return;
    }
    await new Promise((c, e) => {
      const disposable = this.extensionService.onDidChangeExtensions(() => {
        try {
          if (this.extensionService.extensions.find((e2) => ExtensionIdentifier.equals(e2.identifier, extension.identifier.id))) {
            disposable.dispose();
            c();
          }
        } catch (error) {
          e(error);
        }
      });
    });
  }
  promptAndSetEnablement(extensions, enablementState) {
    const enable = enablementState === EnablementState.EnabledGlobally || enablementState === EnablementState.EnabledWorkspace;
    if (enable) {
      const allDependenciesAndPackedExtensions = this.getExtensionsRecursively(extensions, this.local, enablementState, { dependencies: true, pack: true });
      return this.checkAndSetEnablement(extensions, allDependenciesAndPackedExtensions, enablementState);
    } else {
      const packedExtensions = this.getExtensionsRecursively(extensions, this.local, enablementState, { dependencies: false, pack: true });
      if (packedExtensions.length) {
        return this.checkAndSetEnablement(extensions, packedExtensions, enablementState);
      }
      return this.checkAndSetEnablement(extensions, [], enablementState);
    }
  }
  async checkAndSetEnablement(extensions, otherExtensions, enablementState) {
    const allExtensions = [...extensions, ...otherExtensions];
    const enable = enablementState === EnablementState.EnabledGlobally || enablementState === EnablementState.EnabledWorkspace;
    if (!enable) {
      for (const extension of extensions) {
        const dependents = this.getDependentsAfterDisablement(extension, allExtensions, this.local);
        if (dependents.length) {
          const { result } = await this.dialogService.prompt({
            title: nls.localize("disableDependents", "Disable Extension with Dependents"),
            type: Severity.Warning,
            message: this.getDependentsErrorMessageForDisablement(extension, allExtensions, dependents),
            buttons: [{
              label: nls.localize("disable all", "Disable All"),
              run: () => true
            }],
            cancelButton: {
              run: () => false
            }
          });
          if (!result) {
            throw new CancellationError();
          }
          await this.checkAndSetEnablement(dependents, [extension], enablementState);
        }
      }
    }
    return this.doSetEnablement(allExtensions, enablementState);
  }
  getExtensionsRecursively(extensions, installed, enablementState, options, checked = []) {
    const toCheck = extensions.filter((e) => checked.indexOf(e) === -1);
    if (toCheck.length) {
      for (const extension of toCheck) {
        checked.push(extension);
      }
      const extensionsToEanbleOrDisable = installed.filter((i) => {
        if (checked.indexOf(i) !== -1) {
          return false;
        }
        const enable = enablementState === EnablementState.EnabledGlobally || enablementState === EnablementState.EnabledWorkspace;
        const isExtensionEnabled = i.enablementState === EnablementState.EnabledGlobally || i.enablementState === EnablementState.EnabledWorkspace;
        if (enable === isExtensionEnabled) {
          return false;
        }
        return (enable || !i.isBuiltin) && (options.dependencies || options.pack) && extensions.some(
          (extension) => options.dependencies && extension.dependencies.some((id) => areSameExtensions({ id }, i.identifier)) || options.pack && extension.extensionPack.some((id) => areSameExtensions({ id }, i.identifier))
        );
      });
      if (extensionsToEanbleOrDisable.length) {
        extensionsToEanbleOrDisable.push(...this.getExtensionsRecursively(extensionsToEanbleOrDisable, installed, enablementState, options, checked));
      }
      return extensionsToEanbleOrDisable;
    }
    return [];
  }
  getDependentsAfterDisablement(extension, extensionsToDisable, installed) {
    return installed.filter((i) => {
      if (i.dependencies.length === 0) {
        return false;
      }
      if (i === extension) {
        return false;
      }
      if (!this.extensionEnablementService.isEnabledEnablementState(i.enablementState)) {
        return false;
      }
      if (extensionsToDisable.indexOf(i) !== -1) {
        return false;
      }
      return i.dependencies.some((dep) => [extension, ...extensionsToDisable].some((d) => areSameExtensions(d.identifier, { id: dep })));
    });
  }
  getDependentsErrorMessageForDisablement(extension, allDisabledExtensions, dependents) {
    for (const e of [extension, ...allDisabledExtensions]) {
      const dependentsOfTheExtension = dependents.filter((d) => d.dependencies.some((id) => areSameExtensions({ id }, e.identifier)));
      if (dependentsOfTheExtension.length) {
        return this.getErrorMessageForDisablingAnExtensionWithDependents(e, dependentsOfTheExtension);
      }
    }
    return "";
  }
  getErrorMessageForDisablingAnExtensionWithDependents(extension, dependents) {
    if (dependents.length === 1) {
      return nls.localize("singleDependentError", "Cannot disable '{0}' extension alone. '{1}' extension depends on this. Do you want to disable all these extensions?", extension.displayName, dependents[0].displayName);
    }
    if (dependents.length === 2) {
      return nls.localize(
        "twoDependentsError",
        "Cannot disable '{0}' extension alone. '{1}' and '{2}' extensions depend on this. Do you want to disable all these extensions?",
        extension.displayName,
        dependents[0].displayName,
        dependents[1].displayName
      );
    }
    return nls.localize(
      "multipleDependentsError",
      "Cannot disable '{0}' extension alone. '{1}', '{2}' and other extensions depend on this. Do you want to disable all these extensions?",
      extension.displayName,
      dependents[0].displayName,
      dependents[1].displayName
    );
  }
  async doSetEnablement(extensions, enablementState) {
    return await this.extensionEnablementService.setEnablement(extensions.map((e) => e.local), enablementState);
  }
  reportProgressFromOtherSources() {
    if (this.installed.some((e) => e.state === ExtensionState.Installing || e.state === ExtensionState.Uninstalling)) {
      if (!this._activityCallBack) {
        this.withProgress({ location: ProgressLocation.Extensions }, () => new Promise((resolve) => this._activityCallBack = resolve));
      }
    } else {
      this._activityCallBack?.();
      this._activityCallBack = void 0;
    }
  }
  withProgress(options, task) {
    return this.progressService.withProgress(options, async () => {
      const cancelableTask = createCancelablePromise(() => task());
      this.tasksInProgress.push(cancelableTask);
      try {
        return await cancelableTask;
      } finally {
        const index2 = this.tasksInProgress.indexOf(cancelableTask);
        if (index2 !== -1) {
          this.tasksInProgress.splice(index2, 1);
        }
      }
    });
  }
  onError(err) {
    if (isCancellationError(err)) {
      return;
    }
    const message = err && err.message || "";
    if (/getaddrinfo ENOTFOUND|getaddrinfo ENOENT|connect EACCES|connect ECONNREFUSED/.test(message)) {
      return;
    }
    this.notificationService.error(err);
  }
  handleURL(uri, options) {
    if (!/^extension/.test(uri.path)) {
      return Promise.resolve(false);
    }
    this.onOpenExtensionUrl(uri);
    return Promise.resolve(true);
  }
  onOpenExtensionUrl(uri) {
    const match = /^extension\/([^/]+)$/.exec(uri.path);
    if (!match) {
      return;
    }
    const extensionId = match[1];
    this.queryLocal().then(async (local) => {
      let extension = local.find((local2) => areSameExtensions(local2.identifier, { id: extensionId }));
      if (!extension) {
        [extension] = await this.getExtensions([{ id: extensionId }], { source: "uri" }, CancellationToken.None);
      }
      if (extension) {
        await this.hostService.focus(mainWindow);
        await this.open(extension);
      }
    }).then(void 0, (error) => this.onError(error));
  }
  getPublishersToAutoUpdate() {
    return this.getEnabledAutoUpdateExtensions().filter((id) => !EXTENSION_IDENTIFIER_REGEX.test(id));
  }
  getEnabledAutoUpdateExtensions() {
    try {
      const parsedValue = JSON.parse(this.enabledAuotUpdateExtensionsValue);
      if (Array.isArray(parsedValue)) {
        return parsedValue;
      }
    } catch (e) {
    }
    return [];
  }
  setEnabledAutoUpdateExtensions(enabledAutoUpdateExtensions) {
    this.enabledAuotUpdateExtensionsValue = JSON.stringify(enabledAutoUpdateExtensions);
  }
  get enabledAuotUpdateExtensionsValue() {
    if (!this._enabledAutoUpdateExtensionsValue) {
      this._enabledAutoUpdateExtensionsValue = this.getEnabledAutoUpdateExtensionsValue();
    }
    return this._enabledAutoUpdateExtensionsValue;
  }
  set enabledAuotUpdateExtensionsValue(enabledAuotUpdateExtensionsValue) {
    if (this.enabledAuotUpdateExtensionsValue !== enabledAuotUpdateExtensionsValue) {
      this._enabledAutoUpdateExtensionsValue = enabledAuotUpdateExtensionsValue;
      this.setEnabledAutoUpdateExtensionsValue(enabledAuotUpdateExtensionsValue);
    }
  }
  getEnabledAutoUpdateExtensionsValue() {
    return this.storageService.get(EXTENSIONS_AUTO_UPDATE_KEY, StorageScope.APPLICATION, "[]");
  }
  setEnabledAutoUpdateExtensionsValue(value) {
    this.storageService.store(EXTENSIONS_AUTO_UPDATE_KEY, value, StorageScope.APPLICATION, StorageTarget.USER);
  }
  getDisabledAutoUpdateExtensions() {
    try {
      const parsedValue = JSON.parse(this.disabledAutoUpdateExtensionsValue);
      if (Array.isArray(parsedValue)) {
        return parsedValue;
      }
    } catch (e) {
    }
    return [];
  }
  setDisabledAutoUpdateExtensions(disabledAutoUpdateExtensions) {
    this.disabledAutoUpdateExtensionsValue = JSON.stringify(disabledAutoUpdateExtensions);
  }
  get disabledAutoUpdateExtensionsValue() {
    if (!this._disabledAutoUpdateExtensionsValue) {
      this._disabledAutoUpdateExtensionsValue = this.getDisabledAutoUpdateExtensionsValue();
    }
    return this._disabledAutoUpdateExtensionsValue;
  }
  set disabledAutoUpdateExtensionsValue(disabledAutoUpdateExtensionsValue) {
    if (this.disabledAutoUpdateExtensionsValue !== disabledAutoUpdateExtensionsValue) {
      this._disabledAutoUpdateExtensionsValue = disabledAutoUpdateExtensionsValue;
      this.setDisabledAutoUpdateExtensionsValue(disabledAutoUpdateExtensionsValue);
    }
  }
  getDisabledAutoUpdateExtensionsValue() {
    return this.storageService.get(EXTENSIONS_DONOT_AUTO_UPDATE_KEY, StorageScope.APPLICATION, "[]");
  }
  setDisabledAutoUpdateExtensionsValue(value) {
    this.storageService.store(EXTENSIONS_DONOT_AUTO_UPDATE_KEY, value, StorageScope.APPLICATION, StorageTarget.USER);
  }
  getDismissedNotifications() {
    try {
      const parsedValue = JSON.parse(this.dismissedNotificationsValue);
      if (Array.isArray(parsedValue)) {
        return parsedValue;
      }
    } catch (e) {
    }
    return [];
  }
  setDismissedNotifications(dismissedNotifications) {
    this.dismissedNotificationsValue = JSON.stringify(dismissedNotifications);
  }
  get dismissedNotificationsValue() {
    if (!this._dismissedNotificationsValue) {
      this._dismissedNotificationsValue = this.getDismissedNotificationsValue();
    }
    return this._dismissedNotificationsValue;
  }
  set dismissedNotificationsValue(dismissedNotificationsValue) {
    if (this.dismissedNotificationsValue !== dismissedNotificationsValue) {
      this._dismissedNotificationsValue = dismissedNotificationsValue;
      this.setDismissedNotificationsValue(dismissedNotificationsValue);
    }
  }
  getDismissedNotificationsValue() {
    return this.storageService.get(EXTENSIONS_DISMISSED_NOTIFICATIONS_KEY, StorageScope.PROFILE, "[]");
  }
  setDismissedNotificationsValue(value) {
    this.storageService.store(EXTENSIONS_DISMISSED_NOTIFICATIONS_KEY, value, StorageScope.PROFILE, StorageTarget.USER);
  }
};
ExtensionsWorkbenchService.UpdatesCheckInterval = 1e3 * 60 * 60 * 12;
ExtensionsWorkbenchService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, IWorkbenchExtensionManagementService),
  __decorateParam(3, IExtensionGalleryService),
  __decorateParam(4, IExtensionGalleryManifestService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IURLService),
  __decorateParam(9, IWorkbenchExtensionEnablementService),
  __decorateParam(10, IHostService),
  __decorateParam(11, IProgressService),
  __decorateParam(12, IExtensionManagementServerService),
  __decorateParam(13, ILanguageService),
  __decorateParam(14, IIgnoredExtensionsManagementService),
  __decorateParam(15, IUserDataAutoSyncService),
  __decorateParam(16, IProductService),
  __decorateParam(17, IContextKeyService),
  __decorateParam(18, IExtensionManifestPropertiesService),
  __decorateParam(19, ILogService),
  __decorateParam(20, IExtensionService),
  __decorateParam(21, ILocaleService),
  __decorateParam(22, ILifecycleService),
  __decorateParam(23, IFileService),
  __decorateParam(24, IUserDataProfileService),
  __decorateParam(25, IUserDataProfilesService),
  __decorateParam(26, IStorageService),
  __decorateParam(27, IDialogService),
  __decorateParam(28, IUserDataSyncEnablementService),
  __decorateParam(29, IUpdateService),
  __decorateParam(30, IUriIdentityService),
  __decorateParam(31, IWorkspaceContextService),
  __decorateParam(32, IViewsService),
  __decorateParam(33, IFileDialogService),
  __decorateParam(34, IQuickInputService),
  __decorateParam(35, IAllowedExtensionsService),
  __decorateParam(36, IMeteredConnectionService)
], ExtensionsWorkbenchService);
export {
  Extension,
  ExtensionsWorkbenchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgc2VtdmVyIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NlbXZlci9zZW12ZXIuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBpbmRleCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgUHJvbWlzZXMsIFRocm90dGxlZERlbGF5ZXIsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yLCBnZXRFcnJvck1lc3NhZ2UsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUGFnZXIsIHNpbmdsZVBhZ2VQYWdlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhZ2luZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7XG5cdElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUxvY2FsRXh0ZW5zaW9uLCBJR2FsbGVyeUV4dGVuc2lvbiwgSVF1ZXJ5T3B0aW9ucyxcblx0SW5zdGFsbEV4dGVuc2lvbkV2ZW50LCBEaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudCwgSW5zdGFsbE9wZXJhdGlvbiwgV0VCX0VYVEVOU0lPTl9UQUcsIEluc3RhbGxFeHRlbnNpb25SZXN1bHQsXG5cdElFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0LCBJRXh0ZW5zaW9uSW5mbywgSUV4dGVuc2lvblF1ZXJ5T3B0aW9ucywgSURlcHJlY2F0aW9uSW5mbywgaXNUYXJnZXRQbGF0Zm9ybUNvbXBhdGlibGUsIEluc3RhbGxFeHRlbnNpb25JbmZvLCBFWFRFTlNJT05fSURFTlRJRklFUl9SRUdFWCxcblx0SW5zdGFsbE9wdGlvbnMsIElQcm9kdWN0VmVyc2lvbixcblx0VW5pbnN0YWxsRXh0ZW5zaW9uSW5mbyxcblx0VGFyZ2V0UGxhdGZvcm1Ub1N0cmluZyxcblx0SUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSxcblx0QWxsb3dlZEV4dGVuc2lvbnNDb25maWdLZXksXG5cdEVYVEVOU0lPTl9JTlNUQUxMX1NLSVBfUFVCTElTSEVSX1RSVVNUX0NPTlRFWFQsXG5cdEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcixcblx0RXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZSxcblx0TWFsaWNpb3VzRXh0ZW5zaW9uSW5mbyxcblx0c2hvdWxkUmVxdWlyZVJlcG9zaXRvcnlTaWduYXR1cmVGb3IsXG5cdElHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvblxufSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgRW5hYmxlbWVudFN0YXRlLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLCBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIElSZXNvdXJjZUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgZ2V0R2FsbGVyeUV4dGVuc2lvblRlbGVtZXRyeURhdGEsIGdldExvY2FsRXh0ZW5zaW9uVGVsZW1ldHJ5RGF0YSwgYXJlU2FtZUV4dGVuc2lvbnMsIGdyb3VwQnlFeHRlbnNpb24sIGdldEdhbGxlcnlFeHRlbnNpb25JZCwgZmluZE1hdGNoaW5nTWFsaWNpb3VzRW50cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb24sIEV4dGVuc2lvblN0YXRlLCBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIEF1dG9VcGRhdGVDb25maWd1cmF0aW9uS2V5LCBBdXRvVXBkYXRlRGVsYXlDb25maWd1cmF0aW9uS2V5LCBBdXRvQ2hlY2tVcGRhdGVzQ29uZmlndXJhdGlvbktleSwgSGFzT3V0ZGF0ZWRFeHRlbnNpb25zQ29udGV4dCwgQXV0b1VwZGF0ZUNvbmZpZ3VyYXRpb25WYWx1ZSwgSW5zdGFsbEV4dGVuc2lvbk9wdGlvbnMsIEV4dGVuc2lvblJ1bnRpbWVTdGF0ZSwgRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUsIEF1dG9SZXN0YXJ0Q29uZmlndXJhdGlvbktleSwgVklFV0xFVF9JRCwgSUV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lciwgSUV4dGVuc2lvbnNOb3RpZmljYXRpb24gfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIElFZGl0b3JTZXJ2aWNlLCBNT0RBTF9HUk9VUCwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVVJMU2VydmljZSwgSVVSTEhhbmRsZXIsIElPcGVuVVJMT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VybC9jb21tb24vdXJsLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNJbnB1dCwgSUV4dGVuc2lvbkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uc0lucHV0LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzT3B0aW9ucywgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgTm90aWZpY2F0aW9uUHJpb3JpdHksIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdCwgRXh0ZW5zaW9uVHlwZSwgSUV4dGVuc2lvbiBhcyBJUGxhdGZvcm1FeHRlbnNpb24sIFRhcmdldFBsYXRmb3JtLCBFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpc0FwcGxpY2F0aW9uU2NvcGVkRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUlnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL2lnbm9yZWRFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSwgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBTeW5jUmVzb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQsIGlzU3RyaW5nLCBpc1VuZGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSwgSUV4dGVuc2lvbnNTdGF0dXMgYXMgSUV4dGVuc2lvblJ1bnRpbWVTdGF0dXMsIHRvRXh0ZW5zaW9uLCB0b0V4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBpc1dlYiwgbGFuZ3VhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBnZXRMb2NhbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYW5ndWFnZVBhY2tzL2NvbW1vbi9sYW5ndWFnZVBhY2tzLmpzJztcbmltcG9ydCB7IElMb2NhbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbG9jYWxpemF0aW9uL2NvbW1vbi9sb2NhbGUuanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJRmlsZURpYWxvZ1NlcnZpY2UsIElQcm9tcHRCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElVcGRhdGVTZXJ2aWNlLCBTdGF0ZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBpc0VuZ2luZVZhbGlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uVmFsaWRhdG9yLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgU2hvd0N1cnJlbnRSZWxlYXNlTm90ZXNBY3Rpb25JZCB9IGZyb20gJy4uLy4uL3VwZGF0ZS9jb21tb24vdXBkYXRlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVR5cGUsIEV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlVXJsQ29uZmlnS2V5LCBnZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaSwgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QuanMnO1xuaW1wb3J0IHsgZnJvbU5vdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21ldGVyZWRDb25uZWN0aW9uL2NvbW1vbi9tZXRlcmVkQ29ubmVjdGlvbi5qcyc7XG5cbmludGVyZmFjZSBJRXh0ZW5zaW9uU3RhdGVQcm92aWRlcjxUPiB7XG5cdChleHRlbnNpb246IEV4dGVuc2lvbik6IFQ7XG59XG5cbmludGVyZmFjZSBJbnN0YWxsZWRFeHRlbnNpb25zRXZlbnQge1xuXHRyZWFkb25seSBleHRlbnNpb25JZHM6IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+O1xuXHRyZWFkb25seSBjb3VudDogbnVtYmVyO1xufVxudHlwZSBFeHRlbnNpb25zTG9hZENsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2RpZ2l0YXJhbGQnO1xuXHRjb21tZW50OiAnSGVscHMgdG8gdW5kZXJzdGFuZCB3aGljaCBleHRlbnNpb25zIGFyZSB0aGUgbW9zdCBhY3RpdmVseSB1c2VkLic7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbklkczogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbGlzdCBvZiBleHRlbnNpb24gaWRzIHRoYXQgYXJlIGluc3RhbGxlZC4nIH07XG5cdHJlYWRvbmx5IGNvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgZXh0ZW5zaW9ucyB0aGF0IGFyZSBpbnN0YWxsZWQuJyB9O1xufTtcblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbiBpbXBsZW1lbnRzIElFeHRlbnNpb24ge1xuXG5cdHB1YmxpYyBlbmFibGVtZW50U3RhdGU6IEVuYWJsZW1lbnRTdGF0ZSA9IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkR2xvYmFsbHk7XG5cblx0cHJpdmF0ZSBnYWxsZXJ5UmVzb3VyY2VzQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgYW55PigpO1xuXG5cdHByaXZhdGUgX21pc3NpbmdGcm9tR2FsbGVyeTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHN0YXRlUHJvdmlkZXI6IElFeHRlbnNpb25TdGF0ZVByb3ZpZGVyPEV4dGVuc2lvblN0YXRlPixcblx0XHRwcml2YXRlIHJ1bnRpbWVTdGF0ZVByb3ZpZGVyOiBJRXh0ZW5zaW9uU3RhdGVQcm92aWRlcjxFeHRlbnNpb25SdW50aW1lU3RhdGUgfCB1bmRlZmluZWQ+LFxuXHRcdHB1YmxpYyByZWFkb25seSBzZXJ2ZXI6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyBsb2NhbDogSUxvY2FsRXh0ZW5zaW9uIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgX2dhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVzb3VyY2VFeHRlbnNpb25JbmZvOiB7IHJlc291cmNlRXh0ZW5zaW9uOiBJUmVzb3VyY2VFeHRlbnNpb247IGlzV29ya3NwYWNlU2NvcGVkOiBib29sZWFuIH0gfCB1bmRlZmluZWQsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2Vcblx0KSB7XG5cdH1cblxuXHRnZXQgcmVzb3VyY2VFeHRlbnNpb24oKTogSVJlc291cmNlRXh0ZW5zaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5yZXNvdXJjZUV4dGVuc2lvbkluZm8pIHtcblx0XHRcdHJldHVybiB0aGlzLnJlc291cmNlRXh0ZW5zaW9uSW5mby5yZXNvdXJjZUV4dGVuc2lvbjtcblx0XHR9XG5cdFx0aWYgKHRoaXMubG9jYWw/LmlzV29ya3NwYWNlU2NvcGVkKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiAncmVzb3VyY2UnLFxuXHRcdFx0XHRpZGVudGlmaWVyOiB0aGlzLmxvY2FsLmlkZW50aWZpZXIsXG5cdFx0XHRcdGxvY2F0aW9uOiB0aGlzLmxvY2FsLmxvY2F0aW9uLFxuXHRcdFx0XHRtYW5pZmVzdDogdGhpcy5sb2NhbC5tYW5pZmVzdCxcblx0XHRcdFx0Y2hhbmdlbG9nVXJpOiB0aGlzLmxvY2FsLmNoYW5nZWxvZ1VybCxcblx0XHRcdFx0cmVhZG1lVXJpOiB0aGlzLmxvY2FsLnJlYWRtZVVybCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgZ2FsbGVyeSgpOiBJR2FsbGVyeUV4dGVuc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2dhbGxlcnk7XG5cdH1cblxuXHRzZXQgZ2FsbGVyeShnYWxsZXJ5OiBJR2FsbGVyeUV4dGVuc2lvbiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2dhbGxlcnkgPSBnYWxsZXJ5O1xuXHRcdHRoaXMuZ2FsbGVyeVJlc291cmNlc0NhY2hlLmNsZWFyKCk7XG5cdH1cblxuXHRnZXQgbWlzc2luZ0Zyb21HYWxsZXJ5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX21pc3NpbmdGcm9tR2FsbGVyeTtcblx0fVxuXG5cdHNldCBtaXNzaW5nRnJvbUdhbGxlcnkobWlzc2luZzogYm9vbGVhbikge1xuXHRcdHRoaXMuX21pc3NpbmdGcm9tR2FsbGVyeSA9IG1pc3Npbmc7XG5cdH1cblxuXHRnZXQgdHlwZSgpOiBFeHRlbnNpb25UeXBlIHtcblx0XHRyZXR1cm4gdGhpcy5sb2NhbCA/IHRoaXMubG9jYWwudHlwZSA6IEV4dGVuc2lvblR5cGUuVXNlcjtcblx0fVxuXG5cdGdldCBpc0J1aWx0aW4oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubG9jYWwgPyB0aGlzLmxvY2FsLmlzQnVpbHRpbiA6IGZhbHNlO1xuXHR9XG5cblx0Z2V0IGlzV29ya3NwYWNlU2NvcGVkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmxvY2FsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5sb2NhbC5pc1dvcmtzcGFjZVNjb3BlZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMucmVzb3VyY2VFeHRlbnNpb25JbmZvKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvdXJjZUV4dGVuc2lvbkluZm8uaXNXb3Jrc3BhY2VTY29wZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGdldCBuYW1lKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuZ2FsbGVyeSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeS5uYW1lO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXRNYW5pZmVzdEZyb21Mb2NhbE9yUmVzb3VyY2UoKT8ubmFtZSA/PyAnJztcblx0fVxuXG5cdGdldCBkaXNwbGF5TmFtZSgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLmdhbGxlcnkpIHtcblx0XHRcdHJldHVybiB0aGlzLmdhbGxlcnkuZGlzcGxheU5hbWUgfHwgdGhpcy5nYWxsZXJ5Lm5hbWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZ2V0TWFuaWZlc3RGcm9tTG9jYWxPclJlc291cmNlKCk/LmRpc3BsYXlOYW1lID8/IHRoaXMubmFtZTtcblx0fVxuXG5cdGdldCBpZGVudGlmaWVyKCk6IElFeHRlbnNpb25JZGVudGlmaWVyIHtcblx0XHRpZiAodGhpcy5nYWxsZXJ5KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5LmlkZW50aWZpZXI7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnJlc291cmNlRXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvdXJjZUV4dGVuc2lvbi5pZGVudGlmaWVyO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5sb2NhbD8uaWRlbnRpZmllciA/PyB7IGlkOiAnJyB9O1xuXHR9XG5cblx0Z2V0IHV1aWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5ID8gdGhpcy5nYWxsZXJ5LmlkZW50aWZpZXIudXVpZCA6IHRoaXMubG9jYWw/LmlkZW50aWZpZXIudXVpZDtcblx0fVxuXG5cdGdldCBwdWJsaXNoZXIoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5nYWxsZXJ5KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5LnB1Ymxpc2hlcjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TWFuaWZlc3RGcm9tTG9jYWxPclJlc291cmNlKCk/LnB1Ymxpc2hlciA/PyAnJztcblx0fVxuXG5cdGdldCBwdWJsaXNoZXJEaXNwbGF5TmFtZSgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLmdhbGxlcnkpIHtcblx0XHRcdHJldHVybiB0aGlzLmdhbGxlcnkucHVibGlzaGVyRGlzcGxheU5hbWUgfHwgdGhpcy5nYWxsZXJ5LnB1Ymxpc2hlcjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5sb2NhbD8ucHVibGlzaGVyRGlzcGxheU5hbWUpIHtcblx0XHRcdHJldHVybiB0aGlzLmxvY2FsLnB1Ymxpc2hlckRpc3BsYXlOYW1lO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnB1Ymxpc2hlcjtcblx0fVxuXG5cdGdldCBwdWJsaXNoZXJVcmwoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5Py5wdWJsaXNoZXJMaW5rID8gVVJJLnBhcnNlKHRoaXMuZ2FsbGVyeS5wdWJsaXNoZXJMaW5rKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBwdWJsaXNoZXJEb21haW4oKTogeyBsaW5rOiBzdHJpbmc7IHZlcmlmaWVkOiBib29sZWFuIH0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnk/LnB1Ymxpc2hlckRvbWFpbjtcblx0fVxuXG5cdGdldCBwdWJsaXNoZXJTcG9uc29yTGluaygpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnk/LnB1Ymxpc2hlclNwb25zb3JMaW5rID8gVVJJLnBhcnNlKHRoaXMuZ2FsbGVyeS5wdWJsaXNoZXJTcG9uc29yTGluaykgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgdmVyc2lvbigpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmxvY2FsID8gdGhpcy5sb2NhbC5tYW5pZmVzdC52ZXJzaW9uIDogdGhpcy5sYXRlc3RWZXJzaW9uO1xuXHR9XG5cblx0Z2V0IHByaXZhdGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeSA/IHRoaXMuZ2FsbGVyeS5wcml2YXRlIDogdGhpcy5sb2NhbCA/IHRoaXMubG9jYWwucHJpdmF0ZSA6IGZhbHNlO1xuXHR9XG5cblx0Z2V0IHBpbm5lZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmxvY2FsPy5waW5uZWQ7XG5cdH1cblxuXHRnZXQgbGF0ZXN0VmVyc2lvbigpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnkgPyB0aGlzLmdhbGxlcnkudmVyc2lvbiA6IHRoaXMuZ2V0TWFuaWZlc3RGcm9tTG9jYWxPclJlc291cmNlKCk/LnZlcnNpb24gPz8gJyc7XG5cdH1cblxuXHRnZXQgZGVzY3JpcHRpb24oKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5ID8gdGhpcy5nYWxsZXJ5LmRlc2NyaXB0aW9uIDogdGhpcy5nZXRNYW5pZmVzdEZyb21Mb2NhbE9yUmVzb3VyY2UoKT8uZGVzY3JpcHRpb24gPz8gJyc7XG5cdH1cblxuXHRnZXQgdXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeT8uZGV0YWlsc0xpbms7XG5cdH1cblxuXHRnZXQgaWNvblVybCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnlJY29uVXJsIHx8IHRoaXMucmVzb3VyY2VFeHRlbnNpb25JY29uVXJsIHx8IHRoaXMubG9jYWxJY29uVXJsIHx8IHRoaXMuZGVmYXVsdEljb25Vcmw7XG5cdH1cblxuXHRnZXQgaWNvblVybEZhbGxiYWNrKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeT8uYXNzZXRzLmljb24/LmZhbGxiYWNrVXJpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgbG9jYWxJY29uVXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMubG9jYWwgJiYgdGhpcy5sb2NhbC5tYW5pZmVzdC5pY29uKSB7XG5cdFx0XHRyZXR1cm4gRmlsZUFjY2Vzcy51cmlUb0Jyb3dzZXJVcmkocmVzb3VyY2VzLmpvaW5QYXRoKHRoaXMubG9jYWwubG9jYXRpb24sIHRoaXMubG9jYWwubWFuaWZlc3QuaWNvbikpLnRvU3RyaW5nKHRydWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgcmVzb3VyY2VFeHRlbnNpb25JY29uVXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMucmVzb3VyY2VFeHRlbnNpb24/Lm1hbmlmZXN0Lmljb24pIHtcblx0XHRcdHJldHVybiBGaWxlQWNjZXNzLnVyaVRvQnJvd3NlclVyaShyZXNvdXJjZXMuam9pblBhdGgodGhpcy5yZXNvdXJjZUV4dGVuc2lvbi5sb2NhdGlvbiwgdGhpcy5yZXNvdXJjZUV4dGVuc2lvbi5tYW5pZmVzdC5pY29uKSkudG9TdHJpbmcodHJ1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldCBnYWxsZXJ5SWNvblVybCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnk/LmFzc2V0cy5pY29uPy51cmk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBkZWZhdWx0SWNvblVybCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLnR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtICYmIHRoaXMubG9jYWwpIHtcblx0XHRcdGlmICh0aGlzLmxvY2FsLm1hbmlmZXN0ICYmIHRoaXMubG9jYWwubWFuaWZlc3QuY29udHJpYnV0ZXMpIHtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkodGhpcy5sb2NhbC5tYW5pZmVzdC5jb250cmlidXRlcy50aGVtZXMpICYmIHRoaXMubG9jYWwubWFuaWZlc3QuY29udHJpYnV0ZXMudGhlbWVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybiBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaSgndnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZW5zaW9ucy9icm93c2VyL21lZGlhL3RoZW1lLWljb24ucG5nJykudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkodGhpcy5sb2NhbC5tYW5pZmVzdC5jb250cmlidXRlcy5ncmFtbWFycykgJiYgdGhpcy5sb2NhbC5tYW5pZmVzdC5jb250cmlidXRlcy5ncmFtbWFycy5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXR1cm4gRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoJ3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9tZWRpYS9sYW5ndWFnZS1pY29uLnN2ZycpLnRvU3RyaW5nKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgcmVwb3NpdG9yeSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnkgJiYgdGhpcy5nYWxsZXJ5LmFzc2V0cy5yZXBvc2l0b3J5ID8gdGhpcy5nYWxsZXJ5LmFzc2V0cy5yZXBvc2l0b3J5LnVyaSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBsaWNlbnNlVXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeSAmJiB0aGlzLmdhbGxlcnkuYXNzZXRzLmxpY2Vuc2UgPyB0aGlzLmdhbGxlcnkuYXNzZXRzLmxpY2Vuc2UudXJpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IHN1cHBvcnRVcmwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5ICYmIHRoaXMuZ2FsbGVyeS5zdXBwb3J0TGluayA/IHRoaXMuZ2FsbGVyeS5zdXBwb3J0TGluayA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBzdGF0ZSgpOiBFeHRlbnNpb25TdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhdGVQcm92aWRlcih0aGlzKTtcblx0fVxuXG5cdHByaXZhdGUgbWFsaWNpb3VzOiBNYWxpY2lvdXNFeHRlbnNpb25JbmZvIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZ2V0IGlzTWFsaWNpb3VzKCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiAhIXRoaXMubWFsaWNpb3VzIHx8IHRoaXMuZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeU1hbGljaW91cztcblx0fVxuXG5cdHB1YmxpYyBnZXQgbWFsaWNpb3VzSW5mb0xpbmsoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5tYWxpY2lvdXM/LmxlYXJuTW9yZUxpbms7XG5cdH1cblxuXHRwdWJsaWMgZGVwcmVjYXRpb25JbmZvOiBJRGVwcmVjYXRpb25JbmZvIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBpbnN0YWxsQ291bnQoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5ID8gdGhpcy5nYWxsZXJ5Lmluc3RhbGxDb3VudCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCByYXRpbmcoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5ID8gdGhpcy5nYWxsZXJ5LnJhdGluZyA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCByYXRpbmdDb3VudCgpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnkgPyB0aGlzLmdhbGxlcnkucmF0aW5nQ291bnQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgcmF0aW5nVXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeT8ucmF0aW5nTGluaztcblx0fVxuXG5cdGdldCBvdXRkYXRlZCgpOiBib29sZWFuIHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKCF0aGlzLmdhbGxlcnkgfHwgIXRoaXMubG9jYWwpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRG8gbm90IGFsbG93IHVwZGF0aW5nIHN5c3RlbSBleHRlbnNpb25zIGluIHN0YWJsZVxuXHRcdFx0aWYgKHRoaXMudHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0gJiYgdGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5ID09PSAnc3RhYmxlJyAmJiAhdGhpcy5wcm9kdWN0U2VydmljZS5idWlsdEluRXh0ZW5zaW9uc0VuYWJsZWRXaXRoQXV0b1VwZGF0ZXM/LnNvbWUoaWQgPT4gaWQudG9Mb3dlckNhc2UoKSA9PT0gdGhpcy5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5sb2NhbC5wcmVSZWxlYXNlICYmIHRoaXMuZ2FsbGVyeS5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlbXZlci5ndCh0aGlzLmxhdGVzdFZlcnNpb24sIHRoaXMudmVyc2lvbikpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5vdXRkYXRlZFRhcmdldFBsYXRmb3JtKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvKiBJZ25vcmUgKi9cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0IG91dGRhdGVkVGFyZ2V0UGxhdGZvcm0oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5sb2NhbCAmJiAhIXRoaXMuZ2FsbGVyeVxuXHRcdFx0JiYgIVtUYXJnZXRQbGF0Zm9ybS5VTkRFRklORUQsIFRhcmdldFBsYXRmb3JtLldFQl0uaW5jbHVkZXModGhpcy5sb2NhbC50YXJnZXRQbGF0Zm9ybSlcblx0XHRcdCYmIHRoaXMuZ2FsbGVyeS5wcm9wZXJ0aWVzLnRhcmdldFBsYXRmb3JtICE9PSBUYXJnZXRQbGF0Zm9ybS5XRUJcblx0XHRcdCYmIHRoaXMubG9jYWwudGFyZ2V0UGxhdGZvcm0gIT09IHRoaXMuZ2FsbGVyeS5wcm9wZXJ0aWVzLnRhcmdldFBsYXRmb3JtXG5cdFx0XHQmJiBzZW12ZXIuZXEodGhpcy5sYXRlc3RWZXJzaW9uLCB0aGlzLnZlcnNpb24pO1xuXHR9XG5cblx0Z2V0IHJ1bnRpbWVTdGF0ZSgpOiBFeHRlbnNpb25SdW50aW1lU3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnJ1bnRpbWVTdGF0ZVByb3ZpZGVyKHRoaXMpO1xuXHR9XG5cblx0Z2V0IHRlbGVtZXRyeURhdGEoKTogYW55IHtcblx0XHRjb25zdCB7IGxvY2FsLCBnYWxsZXJ5IH0gPSB0aGlzO1xuXG5cdFx0aWYgKGdhbGxlcnkpIHtcblx0XHRcdHJldHVybiBnZXRHYWxsZXJ5RXh0ZW5zaW9uVGVsZW1ldHJ5RGF0YShnYWxsZXJ5KTtcblx0XHR9IGVsc2UgaWYgKGxvY2FsKSB7XG5cdFx0XHRyZXR1cm4gZ2V0TG9jYWxFeHRlbnNpb25UZWxlbWV0cnlEYXRhKGxvY2FsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0fVxuXG5cdGdldCBwcmV2aWV3KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmxvY2FsPy5tYW5pZmVzdC5wcmV2aWV3ID8/IHRoaXMuZ2FsbGVyeT8ucHJldmlldyA/PyBmYWxzZTtcblx0fVxuXG5cdGdldCBwcmVSZWxlYXNlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMubG9jYWw/LnByZVJlbGVhc2U7XG5cdH1cblxuXHRnZXQgaXNQcmVSZWxlYXNlVmVyc2lvbigpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5sb2NhbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMubG9jYWwuaXNQcmVSZWxlYXNlVmVyc2lvbjtcblx0XHR9XG5cdFx0cmV0dXJuICEhdGhpcy5nYWxsZXJ5Py5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb247XG5cdH1cblxuXHRnZXQgaGFzUHJlUmVsZWFzZVZlcnNpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeSA/IHRoaXMuZ2FsbGVyeS5oYXNQcmVSZWxlYXNlVmVyc2lvbiA6ICEhdGhpcy5sb2NhbD8uaGFzUHJlUmVsZWFzZVZlcnNpb247XG5cdH1cblxuXHRnZXQgaGFzUmVsZWFzZVZlcnNpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5yZXNvdXJjZUV4dGVuc2lvbiB8fCAhIXRoaXMuZ2FsbGVyeT8uaGFzUmVsZWFzZVZlcnNpb247XG5cdH1cblxuXHRwcml2YXRlIGdldExvY2FsKCk6IElMb2NhbEV4dGVuc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubG9jYWwgJiYgIXRoaXMub3V0ZGF0ZWQgPyB0aGlzLmxvY2FsIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0TWFuaWZlc3QodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRXh0ZW5zaW9uTWFuaWZlc3QgfCBudWxsPiB7XG5cdFx0Y29uc3QgbG9jYWwgPSB0aGlzLmdldExvY2FsKCk7XG5cdFx0aWYgKGxvY2FsKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWwubWFuaWZlc3Q7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZ2FsbGVyeSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0R2FsbGVyeU1hbmlmZXN0KHRva2VuKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5yZXNvdXJjZUV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVzb3VyY2VFeHRlbnNpb24ubWFuaWZlc3Q7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRhc3luYyBnZXRHYWxsZXJ5TWFuaWZlc3QodG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8SUV4dGVuc2lvbk1hbmlmZXN0IHwgbnVsbD4ge1xuXHRcdGlmICh0aGlzLmdhbGxlcnkpIHtcblx0XHRcdGxldCBjYWNoZSA9IHRoaXMuZ2FsbGVyeVJlc291cmNlc0NhY2hlLmdldCgnbWFuaWZlc3QnKTtcblx0XHRcdGlmICghY2FjaGUpIHtcblx0XHRcdFx0aWYgKHRoaXMuZ2FsbGVyeS5hc3NldHMubWFuaWZlc3QpIHtcblx0XHRcdFx0XHR0aGlzLmdhbGxlcnlSZXNvdXJjZXNDYWNoZS5zZXQoJ21hbmlmZXN0JywgY2FjaGUgPSB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldE1hbmlmZXN0KHRoaXMuZ2FsbGVyeSwgdG9rZW4pXG5cdFx0XHRcdFx0XHQuY2F0Y2goZSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZ2FsbGVyeVJlc291cmNlc0NhY2hlLmRlbGV0ZSgnbWFuaWZlc3QnKTtcblx0XHRcdFx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IobmxzLmxvY2FsaXplKCdNYW5pZmVzdCBpcyBub3QgZm91bmQnLCBcIk1hbmlmZXN0IGlzIG5vdCBmb3VuZFwiKSwgdGhpcy5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNhY2hlO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGhhc1JlYWRtZSgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5sb2NhbCAmJiB0aGlzLmxvY2FsLnJlYWRtZVVybCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZ2FsbGVyeSAmJiB0aGlzLmdhbGxlcnkuYXNzZXRzLnJlYWRtZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucmVzb3VyY2VFeHRlbnNpb24/LnJlYWRtZVVyaSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMudHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW07XG5cdH1cblxuXHRhc3luYyBnZXRSZWFkbWUodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBsb2NhbCA9IHRoaXMuZ2V0TG9jYWwoKTtcblx0XHRpZiAobG9jYWw/LnJlYWRtZVVybCkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUobG9jYWwucmVhZG1lVXJsKTtcblx0XHRcdHJldHVybiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZ2FsbGVyeSkge1xuXHRcdFx0aWYgKHRoaXMuZ2FsbGVyeS5hc3NldHMucmVhZG1lKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldFJlYWRtZSh0aGlzLmdhbGxlcnksIHRva2VuKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2coJ2V4dGVuc2lvbnM6Tm90Rm91bmRSZWFkTWUnLCB0aGlzLnRlbGVtZXRyeURhdGEpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGAjICR7dGhpcy5kaXNwbGF5TmFtZSB8fCB0aGlzLm5hbWV9XG4qKk5vdGljZToqKiBUaGlzIGV4dGVuc2lvbiBpcyBidW5kbGVkIHdpdGggVmlzdWFsIFN0dWRpbyBDb2RlLiBJdCBjYW4gYmUgZGlzYWJsZWQgYnV0IG5vdCB1bmluc3RhbGxlZC5cbiMjIEZlYXR1cmVzXG4ke3RoaXMuZGVzY3JpcHRpb259XG5gKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5yZXNvdXJjZUV4dGVuc2lvbj8ucmVhZG1lVXJpKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLnJlc291cmNlRXh0ZW5zaW9uPy5yZWFkbWVVcmkpO1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdub3QgYXZhaWxhYmxlJykpO1xuXHR9XG5cblx0aGFzQ2hhbmdlbG9nKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmxvY2FsICYmIHRoaXMubG9jYWwuY2hhbmdlbG9nVXJsKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5nYWxsZXJ5ICYmIHRoaXMuZ2FsbGVyeS5hc3NldHMuY2hhbmdlbG9nKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy50eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbTtcblx0fVxuXG5cdGFzeW5jIGdldENoYW5nZWxvZyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGxvY2FsID0gdGhpcy5nZXRMb2NhbCgpO1xuXHRcdGlmIChsb2NhbD8uY2hhbmdlbG9nVXJsKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShsb2NhbC5jaGFuZ2Vsb2dVcmwpO1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5nYWxsZXJ5Py5hc3NldHMuY2hhbmdlbG9nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRDaGFuZ2Vsb2codGhpcy5nYWxsZXJ5LCB0b2tlbik7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0pIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoYFBsZWFzZSBjaGVjayB0aGUgW1ZTIENvZGUgUmVsZWFzZSBOb3Rlc10oY29tbWFuZDoke1Nob3dDdXJyZW50UmVsZWFzZU5vdGVzQWN0aW9uSWR9KSBmb3IgY2hhbmdlcyB0byB0aGUgYnVpbHQtaW4gZXh0ZW5zaW9ucy5gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdub3QgYXZhaWxhYmxlJykpO1xuXHR9XG5cblx0Z2V0IGNhdGVnb3JpZXMoKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdGNvbnN0IHsgbG9jYWwsIGdhbGxlcnksIHJlc291cmNlRXh0ZW5zaW9uIH0gPSB0aGlzO1xuXHRcdGlmIChsb2NhbCAmJiBsb2NhbC5tYW5pZmVzdC5jYXRlZ29yaWVzICYmICF0aGlzLm91dGRhdGVkKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWwubWFuaWZlc3QuY2F0ZWdvcmllcztcblx0XHR9XG5cdFx0aWYgKGdhbGxlcnkpIHtcblx0XHRcdHJldHVybiBnYWxsZXJ5LmNhdGVnb3JpZXM7XG5cdFx0fVxuXHRcdGlmIChyZXNvdXJjZUV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlRXh0ZW5zaW9uLm1hbmlmZXN0LmNhdGVnb3JpZXMgPz8gW107XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGdldCB0YWdzKCk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0XHRjb25zdCB7IGdhbGxlcnkgfSA9IHRoaXM7XG5cdFx0aWYgKGdhbGxlcnkpIHtcblx0XHRcdHJldHVybiBnYWxsZXJ5LnRhZ3MuZmlsdGVyKHRhZyA9PiAhdGFnLnN0YXJ0c1dpdGgoJ18nKSk7XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGdldCBkZXBlbmRlbmNpZXMoKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHsgbG9jYWwsIGdhbGxlcnksIHJlc291cmNlRXh0ZW5zaW9uIH0gPSB0aGlzO1xuXHRcdGlmIChsb2NhbCAmJiBsb2NhbC5tYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXMgJiYgIXRoaXMub3V0ZGF0ZWQpIHtcblx0XHRcdHJldHVybiBsb2NhbC5tYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXM7XG5cdFx0fVxuXHRcdGlmIChnYWxsZXJ5KSB7XG5cdFx0XHRyZXR1cm4gZ2FsbGVyeS5wcm9wZXJ0aWVzLmRlcGVuZGVuY2llcyB8fCBbXTtcblx0XHR9XG5cdFx0aWYgKHJlc291cmNlRXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm4gcmVzb3VyY2VFeHRlbnNpb24ubWFuaWZlc3QuZXh0ZW5zaW9uRGVwZW5kZW5jaWVzIHx8IFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRnZXQgZXh0ZW5zaW9uUGFjaygpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgeyBsb2NhbCwgZ2FsbGVyeSwgcmVzb3VyY2VFeHRlbnNpb24gfSA9IHRoaXM7XG5cdFx0aWYgKGxvY2FsICYmIGxvY2FsLm1hbmlmZXN0LmV4dGVuc2lvblBhY2sgJiYgIXRoaXMub3V0ZGF0ZWQpIHtcblx0XHRcdHJldHVybiBsb2NhbC5tYW5pZmVzdC5leHRlbnNpb25QYWNrO1xuXHRcdH1cblx0XHRpZiAoZ2FsbGVyeSkge1xuXHRcdFx0cmV0dXJuIGdhbGxlcnkucHJvcGVydGllcy5leHRlbnNpb25QYWNrIHx8IFtdO1xuXHRcdH1cblx0XHRpZiAocmVzb3VyY2VFeHRlbnNpb24pIHtcblx0XHRcdHJldHVybiByZXNvdXJjZUV4dGVuc2lvbi5tYW5pZmVzdC5leHRlbnNpb25QYWNrIHx8IFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRzZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3Q6IElFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KTogdm9pZCB7XG5cdFx0dGhpcy5tYWxpY2lvdXMgPSBmaW5kTWF0Y2hpbmdNYWxpY2lvdXNFbnRyeSh0aGlzLmlkZW50aWZpZXIsIGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QubWFsaWNpb3VzKTtcblx0XHR0aGlzLmRlcHJlY2F0aW9uSW5mbyA9IGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QuZGVwcmVjYXRlZCA/IGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QuZGVwcmVjYXRlZFt0aGlzLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKV0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldE1hbmlmZXN0RnJvbUxvY2FsT3JSZXNvdXJjZSgpOiBJRXh0ZW5zaW9uTWFuaWZlc3QgfCBudWxsIHtcblx0XHRpZiAodGhpcy5sb2NhbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMubG9jYWwubWFuaWZlc3Q7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnJlc291cmNlRXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvdXJjZUV4dGVuc2lvbi5tYW5pZmVzdDtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cblxuY29uc3QgRVhURU5TSU9OU19BVVRPX1VQREFURV9LRVkgPSAnZXh0ZW5zaW9ucy5hdXRvVXBkYXRlJztcbmNvbnN0IEVYVEVOU0lPTlNfRE9OT1RfQVVUT19VUERBVEVfS0VZID0gJ2V4dGVuc2lvbnMuZG9ub3RBdXRvVXBkYXRlJztcbmNvbnN0IEVYVEVOU0lPTlNfRElTTUlTU0VEX05PVElGSUNBVElPTlNfS0VZID0gJ2V4dGVuc2lvbnMuZGlzbWlzc2VkTm90aWZpY2F0aW9ucyc7XG5cbmNsYXNzIEV4dGVuc2lvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgZXh0ZW5zaW9uOiBFeHRlbnNpb247IG9wZXJhdGlvbj86IEluc3RhbGxPcGVyYXRpb24gfSB8IHVuZGVmaW5lZD4oKSk7XG5cdGdldCBvbkNoYW5nZSgpIHsgcmV0dXJuIHRoaXMuX29uQ2hhbmdlLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25SZXNldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25SZXNldCgpIHsgcmV0dXJuIHRoaXMuX29uUmVzZXQuZXZlbnQ7IH1cblxuXHRwcml2YXRlIGluc3RhbGxpbmc6IEV4dGVuc2lvbltdID0gW107XG5cdHByaXZhdGUgdW5pbnN0YWxsaW5nOiBFeHRlbnNpb25bXSA9IFtdO1xuXHRwcml2YXRlIGluc3RhbGxlZDogRXh0ZW5zaW9uW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBzZXJ2ZXI6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc3RhdGVQcm92aWRlcjogSUV4dGVuc2lvblN0YXRlUHJvdmlkZXI8RXh0ZW5zaW9uU3RhdGU+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcnVudGltZVN0YXRlUHJvdmlkZXI6IElFeHRlbnNpb25TdGF0ZVByb3ZpZGVyPEV4dGVuc2lvblJ1bnRpbWVTdGF0ZSB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpc1dvcmtzcGFjZVNlcnZlcjogYm9vbGVhbixcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZ2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkluc3RhbGxFeHRlbnNpb24oZSA9PiB0aGlzLm9uSW5zdGFsbEV4dGVuc2lvbihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZEluc3RhbGxFeHRlbnNpb25zKGUgPT4gdGhpcy5vbkRpZEluc3RhbGxFeHRlbnNpb25zKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uVW5pbnN0YWxsRXh0ZW5zaW9uKGUgPT4gdGhpcy5vblVuaW5zdGFsbEV4dGVuc2lvbihlLmlkZW50aWZpZXIpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uKGUgPT4gdGhpcy5vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhKGUgPT4gdGhpcy5vbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhKGUubG9jYWwpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvZmlsZSgoKSA9PiB0aGlzLnJlc2V0KCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5vbkVuYWJsZW1lbnRDaGFuZ2VkKGUgPT4gdGhpcy5vbkVuYWJsZW1lbnRDaGFuZ2VkKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KHRoaXMub25DaGFuZ2UsIHRoaXMub25SZXNldCkoKCkgPT4gdGhpcy5fbG9jYWwgPSB1bmRlZmluZWQpKTtcblx0XHRpZiAodGhpcy5pc1dvcmtzcGFjZVNlcnZlcikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkluc3RhbGxFeHRlbnNpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLndvcmtzcGFjZVNjb3BlZCkge1xuXHRcdFx0XHRcdHRoaXMub25JbnN0YWxsRXh0ZW5zaW9uKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkSW5zdGFsbEV4dGVuc2lvbnMoZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGUuZmlsdGVyKGUgPT4gZS53b3Jrc3BhY2VTY29wZWQpO1xuXHRcdFx0XHRpZiAocmVzdWx0Lmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMub25EaWRJbnN0YWxsRXh0ZW5zaW9ucyhyZXN1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uVW5pbnN0YWxsRXh0ZW5zaW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS53b3Jrc3BhY2VTY29wZWQpIHtcblx0XHRcdFx0XHR0aGlzLm9uVW5pbnN0YWxsRXh0ZW5zaW9uKGUuaWRlbnRpZmllcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVbmluc3RhbGxFeHRlbnNpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLndvcmtzcGFjZVNjb3BlZCkge1xuXHRcdFx0XHRcdHRoaXMub25EaWRVbmluc3RhbGxFeHRlbnNpb24oZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9sb2NhbDogRXh0ZW5zaW9uW10gfCB1bmRlZmluZWQ7XG5cdGdldCBsb2NhbCgpOiBFeHRlbnNpb25bXSB7XG5cdFx0aWYgKCF0aGlzLl9sb2NhbCkge1xuXHRcdFx0dGhpcy5fbG9jYWwgPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIHRoaXMuaW5zdGFsbGVkKSB7XG5cdFx0XHRcdHRoaXMuX2xvY2FsLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIHRoaXMuaW5zdGFsbGluZykge1xuXHRcdFx0XHRpZiAoIXRoaXMuaW5zdGFsbGVkLnNvbWUoaW5zdGFsbGVkID0+IGFyZVNhbWVFeHRlbnNpb25zKGluc3RhbGxlZC5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9jYWwucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9sb2NhbDtcblx0fVxuXG5cdGFzeW5jIHF1ZXJ5SW5zdGFsbGVkKHByb2R1Y3RWZXJzaW9uOiBJUHJvZHVjdFZlcnNpb24pOiBQcm9taXNlPElFeHRlbnNpb25bXT4ge1xuXHRcdGF3YWl0IHRoaXMuZmV0Y2hJbnN0YWxsZWRFeHRlbnNpb25zKHByb2R1Y3RWZXJzaW9uKTtcblx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHRoaXMubG9jYWw7XG5cdH1cblxuXHRhc3luYyBzeW5jSW5zdGFsbGVkRXh0ZW5zaW9uc1dpdGhHYWxsZXJ5KGdhbGxlcnlFeHRlbnNpb25zOiBJR2FsbGVyeUV4dGVuc2lvbltdLCBwcm9kdWN0VmVyc2lvbjogSVByb2R1Y3RWZXJzaW9uLCBmbGFnRXh0ZW5zaW9uc01pc3NpbmdGcm9tR2FsbGVyeT86IElFeHRlbnNpb25JbmZvW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5tYXBJbnN0YWxsZWRFeHRlbnNpb25XaXRoQ29tcGF0aWJsZUdhbGxlcnlFeHRlbnNpb24oZ2FsbGVyeUV4dGVuc2lvbnMsIHByb2R1Y3RWZXJzaW9uKTtcblx0XHRmb3IgKGNvbnN0IFtleHRlbnNpb24sIGdhbGxlcnldIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdC8vIHVwZGF0ZSBtZXRhZGF0YSBvZiB0aGUgZXh0ZW5zaW9uIGlmIGl0IGRvZXMgbm90IGV4aXN0XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLmxvY2FsICYmIGV4dGVuc2lvbi5sb2NhbC50eXBlICE9PSBFeHRlbnNpb25UeXBlLlN5c3RlbSAmJiAhZXh0ZW5zaW9uLmxvY2FsLmlkZW50aWZpZXIudXVpZCkge1xuXHRcdFx0XHRleHRlbnNpb24ubG9jYWwgPSBhd2FpdCB0aGlzLnVwZGF0ZU1ldGFkYXRhKGV4dGVuc2lvbi5sb2NhbCwgZ2FsbGVyeSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWV4dGVuc2lvbi5nYWxsZXJ5IHx8IGV4dGVuc2lvbi5nYWxsZXJ5LnZlcnNpb24gIT09IGdhbGxlcnkudmVyc2lvbiB8fCBleHRlbnNpb24uZ2FsbGVyeS5wcm9wZXJ0aWVzLnRhcmdldFBsYXRmb3JtICE9PSBnYWxsZXJ5LnByb3BlcnRpZXMudGFyZ2V0UGxhdGZvcm0pIHtcblx0XHRcdFx0ZXh0ZW5zaW9uLmdhbGxlcnkgPSBnYWxsZXJ5O1xuXHRcdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHsgZXh0ZW5zaW9uIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBEZXRlY3QgZXh0ZW5zaW9ucyB0aGF0IGRvIG5vdCBoYXZlIGEgY29ycmVzcG9uZGluZyBnYWxsZXJ5IGVudHJ5LlxuXHRcdGlmIChmbGFnRXh0ZW5zaW9uc01pc3NpbmdGcm9tR2FsbGVyeSkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uc1RvUXVlcnkgPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIHRoaXMubG9jYWwpIHtcblx0XHRcdFx0Ly8gRXh0ZW5zaW9uIGlzIGFscmVhZHkgcGFpcmVkIHdpdGggYSBnYWxsZXJ5IG9iamVjdFxuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLmdhbGxlcnkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBBbHJlYWR5IGZsYWdnZWQgYXMgbWlzc2luZyBmcm9tIGdhbGxlcnlcblx0XHRcdFx0aWYgKGV4dGVuc2lvbi5taXNzaW5nRnJvbUdhbGxlcnkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBBIFVVSUQgaW5kaWNhdGVzIGV4dGVuc2lvbiBvcmlnaW5hdGVkIGZyb20gZ2FsbGVyeVxuXHRcdFx0XHRpZiAoIWV4dGVuc2lvbi5pZGVudGlmaWVyLnV1aWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBFeHRlbnNpb24gaXMgbm90IHByZXNlbnQgaW4gdGhlIHNldCB3ZSBhcmUgY29uY2VybmVkIGFib3V0XG5cdFx0XHRcdGlmICghZmxhZ0V4dGVuc2lvbnNNaXNzaW5nRnJvbUdhbGxlcnkuc29tZShmID0+IGFyZVNhbWVFeHRlbnNpb25zKGYsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRleHRlbnNpb25zVG9RdWVyeS5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uc1RvUXVlcnkubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IHF1ZXJ5UmVzdWx0ID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKGV4dGVuc2lvbnNUb1F1ZXJ5Lm1hcChlID0+ICh7IC4uLmUuaWRlbnRpZmllciwgdmVyc2lvbjogZS52ZXJzaW9uIH0pKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGNvbnN0IHF1ZXJpZWRJZHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdGNvbnN0IG1pc3NpbmdJZHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnNUb1F1ZXJ5KSB7XG5cdFx0XHRcdFx0cXVlcmllZElkcy5wdXNoKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHRjb25zdCBnYWxsZXJ5ID0gcXVlcnlSZXN1bHQuZmluZChnID0+IGFyZVNhbWVFeHRlbnNpb25zKGcuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0XHRpZiAoZ2FsbGVyeSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmdhbGxlcnkgPSBnYWxsZXJ5O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24ubWlzc2luZ0Zyb21HYWxsZXJ5ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdG1pc3NpbmdJZHMucHVzaChleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoeyBleHRlbnNpb24gfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dHlwZSBNaXNzaW5nRnJvbUdhbGxlcnlDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRvd25lcjogJ2pvc2hzcGljZXInO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdSZXBvcnQgd2hlbiBpbnN0YWxsZWQgZXh0ZW5zaW9ucyBhcmUgbm8gbG9uZ2VyIGF2YWlsYWJsZSBpbiB0aGUgZ2FsbGVyeSc7XG5cdFx0XHRcdFx0cXVlcmllZElkczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0V4dGVuc2lvbnMgcXVlcmllZCBhcyBwb3RlbnRpYWxseSBtaXNzaW5nIGZyb20gZ2FsbGVyeScgfTtcblx0XHRcdFx0XHRtaXNzaW5nSWRzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRXh0ZW5zaW9ucyBkZXRlcm1pbmVkIG1pc3NpbmcgZnJvbSBnYWxsZXJ5JyB9O1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR0eXBlIE1pc3NpbmdGcm9tR2FsbGVyeUV2ZW50ID0ge1xuXHRcdFx0XHRcdHJlYWRvbmx5IHF1ZXJpZWRJZHM6IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+O1xuXHRcdFx0XHRcdHJlYWRvbmx5IG1pc3NpbmdJZHM6IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+O1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxNaXNzaW5nRnJvbUdhbGxlcnlFdmVudCwgTWlzc2luZ0Zyb21HYWxsZXJ5Q2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25zOm1pc3NpbmdGcm9tR2FsbGVyeScsIHtcblx0XHRcdFx0XHRxdWVyaWVkSWRzOiBuZXcgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlKHF1ZXJpZWRJZHMuam9pbignOycpKSxcblx0XHRcdFx0XHRtaXNzaW5nSWRzOiBuZXcgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlKG1pc3NpbmdJZHMuam9pbignOycpKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1hcEluc3RhbGxlZEV4dGVuc2lvbldpdGhDb21wYXRpYmxlR2FsbGVyeUV4dGVuc2lvbihnYWxsZXJ5RXh0ZW5zaW9uczogSUdhbGxlcnlFeHRlbnNpb25bXSwgcHJvZHVjdFZlcnNpb246IElQcm9kdWN0VmVyc2lvbik6IFByb21pc2U8W0V4dGVuc2lvbiwgSUdhbGxlcnlFeHRlbnNpb25dW10+IHtcblx0XHRjb25zdCBtYXBwZWRFeHRlbnNpb25zID0gdGhpcy5tYXBJbnN0YWxsZWRFeHRlbnNpb25XaXRoR2FsbGVyeUV4dGVuc2lvbihnYWxsZXJ5RXh0ZW5zaW9ucyk7XG5cdFx0Y29uc3QgdGFyZ2V0UGxhdGZvcm0gPSBhd2FpdCB0aGlzLnNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRUYXJnZXRQbGF0Zm9ybSgpO1xuXHRcdGNvbnN0IGNvbXBhdGlibGVHYWxsZXJ5RXh0ZW5zaW9uczogSUdhbGxlcnlFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGNvbXBhdGlibGVHYWxsZXJ5RXh0ZW5zaW9uc1RvRmV0Y2g6IElFeHRlbnNpb25JbmZvW10gPSBbXTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQobWFwcGVkRXh0ZW5zaW9ucy5tYXAoYXN5bmMgKFtleHRlbnNpb24sIGdhbGxlcnldKSA9PiB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLmxvY2FsKSB7XG5cdFx0XHRcdGlmIChhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmlzRXh0ZW5zaW9uQ29tcGF0aWJsZShnYWxsZXJ5LCBleHRlbnNpb24ubG9jYWwucHJlUmVsZWFzZSwgdGFyZ2V0UGxhdGZvcm0sIHByb2R1Y3RWZXJzaW9uKSkge1xuXHRcdFx0XHRcdGNvbXBhdGlibGVHYWxsZXJ5RXh0ZW5zaW9ucy5wdXNoKGdhbGxlcnkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbXBhdGlibGVHYWxsZXJ5RXh0ZW5zaW9uc1RvRmV0Y2gucHVzaCh7IC4uLmV4dGVuc2lvbi5sb2NhbC5pZGVudGlmaWVyLCBwcmVSZWxlYXNlOiBleHRlbnNpb24ubG9jYWwucHJlUmVsZWFzZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRpZiAoY29tcGF0aWJsZUdhbGxlcnlFeHRlbnNpb25zVG9GZXRjaC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhjb21wYXRpYmxlR2FsbGVyeUV4dGVuc2lvbnNUb0ZldGNoLCB7IHRhcmdldFBsYXRmb3JtLCBjb21wYXRpYmxlOiB0cnVlLCBxdWVyeUFsbFZlcnNpb25zOiB0cnVlLCBwcm9kdWN0VmVyc2lvbiB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbXBhdGlibGVHYWxsZXJ5RXh0ZW5zaW9ucy5wdXNoKC4uLnJlc3VsdCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1hcEluc3RhbGxlZEV4dGVuc2lvbldpdGhHYWxsZXJ5RXh0ZW5zaW9uKGNvbXBhdGlibGVHYWxsZXJ5RXh0ZW5zaW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIG1hcEluc3RhbGxlZEV4dGVuc2lvbldpdGhHYWxsZXJ5RXh0ZW5zaW9uKGdhbGxlcnlFeHRlbnNpb25zOiBJR2FsbGVyeUV4dGVuc2lvbltdKTogW0V4dGVuc2lvbiwgSUdhbGxlcnlFeHRlbnNpb25dW10ge1xuXHRcdGNvbnN0IG1hcHBlZEV4dGVuc2lvbnM6IFtFeHRlbnNpb24sIElHYWxsZXJ5RXh0ZW5zaW9uXVtdID0gW107XG5cdFx0Y29uc3QgYnlVVUlEID0gbmV3IE1hcDxzdHJpbmcsIElHYWxsZXJ5RXh0ZW5zaW9uPigpLCBieUlEID0gbmV3IE1hcDxzdHJpbmcsIElHYWxsZXJ5RXh0ZW5zaW9uPigpO1xuXHRcdGZvciAoY29uc3QgZ2FsbGVyeSBvZiBnYWxsZXJ5RXh0ZW5zaW9ucykge1xuXHRcdFx0YnlVVUlELnNldChnYWxsZXJ5LmlkZW50aWZpZXIudXVpZCwgZ2FsbGVyeSk7XG5cdFx0XHRieUlELnNldChnYWxsZXJ5LmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwgZ2FsbGVyeSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgaW5zdGFsbGVkIG9mIHRoaXMuaW5zdGFsbGVkKSB7XG5cdFx0XHRpZiAoaW5zdGFsbGVkLnV1aWQpIHtcblx0XHRcdFx0Y29uc3QgZ2FsbGVyeSA9IGJ5VVVJRC5nZXQoaW5zdGFsbGVkLnV1aWQpO1xuXHRcdFx0XHRpZiAoZ2FsbGVyeSkge1xuXHRcdFx0XHRcdG1hcHBlZEV4dGVuc2lvbnMucHVzaChbaW5zdGFsbGVkLCBnYWxsZXJ5XSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChpbnN0YWxsZWQubG9jYWw/LnNvdXJjZSAhPT0gJ3Jlc291cmNlJykge1xuXHRcdFx0XHRjb25zdCBnYWxsZXJ5ID0gYnlJRC5nZXQoaW5zdGFsbGVkLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRcdGlmIChnYWxsZXJ5KSB7XG5cdFx0XHRcdFx0bWFwcGVkRXh0ZW5zaW9ucy5wdXNoKFtpbnN0YWxsZWQsIGdhbGxlcnldKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbWFwcGVkRXh0ZW5zaW9ucztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlTWV0YWRhdGEobG9jYWxFeHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgZ2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb24pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGxldCBpc1ByZVJlbGVhc2VWZXJzaW9uID0gZmFsc2U7XG5cdFx0aWYgKGxvY2FsRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24gIT09IGdhbGxlcnkudmVyc2lvbikge1xuXHRcdFx0dHlwZSBHYWxsZXJ5U2VydmljZU1hdGNoSW5zdGFsbGVkRXh0ZW5zaW9uQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0XHRjb21tZW50OiAnUmVwb3J0IHdoZW4gYSByZXF1ZXN0IGlzIG1hZGUgdG8gdXBkYXRlIG1ldGFkYXRhIG9mIGFuIGluc3RhbGxlZCBleHRlbnNpb24nO1xuXHRcdFx0fTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHt9LCBHYWxsZXJ5U2VydmljZU1hdGNoSW5zdGFsbGVkRXh0ZW5zaW9uQ2xhc3NpZmljYXRpb24+KCdnYWxsZXJ5U2VydmljZTp1cGRhdGVNZXRhZGF0YScpO1xuXHRcdFx0Y29uc3QgZ2FsbGVyeVdpdGhMb2NhbFZlcnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uIHwgdW5kZWZpbmVkID0gKGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyAuLi5sb2NhbEV4dGVuc2lvbi5pZGVudGlmaWVyLCB2ZXJzaW9uOiBsb2NhbEV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlbMF07XG5cdFx0XHRpc1ByZVJlbGVhc2VWZXJzaW9uID0gISFnYWxsZXJ5V2l0aExvY2FsVmVyc2lvbj8ucHJvcGVydGllcz8uaXNQcmVSZWxlYXNlVmVyc2lvbjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMud29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudXBkYXRlTWV0YWRhdGEobG9jYWxFeHRlbnNpb24sIHsgaWQ6IGdhbGxlcnkuaWRlbnRpZmllci51dWlkLCBwdWJsaXNoZXJEaXNwbGF5TmFtZTogZ2FsbGVyeS5wdWJsaXNoZXJEaXNwbGF5TmFtZSwgcHVibGlzaGVySWQ6IGdhbGxlcnkucHVibGlzaGVySWQsIGlzUHJlUmVsZWFzZVZlcnNpb24gfSk7XG5cdH1cblxuXHRjYW5JbnN0YWxsKGdhbGxlcnlFeHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uKTogUHJvbWlzZTx0cnVlIHwgSU1hcmtkb3duU3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmNhbkluc3RhbGwoZ2FsbGVyeUV4dGVuc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIG9uSW5zdGFsbEV4dGVuc2lvbihldmVudDogSW5zdGFsbEV4dGVuc2lvbkV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgeyBzb3VyY2UgfSA9IGV2ZW50O1xuXHRcdGlmIChzb3VyY2UgJiYgIVVSSS5pc1VyaShzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLmluc3RhbGxlZC5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBzb3VyY2UuaWRlbnRpZmllcikpXG5cdFx0XHRcdD8/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uLCB0aGlzLnN0YXRlUHJvdmlkZXIsIHRoaXMucnVudGltZVN0YXRlUHJvdmlkZXIsIHRoaXMuc2VydmVyLCB1bmRlZmluZWQsIHNvdXJjZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuaW5zdGFsbGluZy5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHsgZXh0ZW5zaW9uIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZmV0Y2hJbnN0YWxsZWRFeHRlbnNpb25zKHByb2R1Y3RWZXJzaW9uPzogSVByb2R1Y3RWZXJzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCA9IGF3YWl0IHRoaXMuc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTtcblx0XHRjb25zdCBhbGwgPSBhd2FpdCB0aGlzLnNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQodW5kZWZpbmVkLCB1bmRlZmluZWQsIHByb2R1Y3RWZXJzaW9uKTtcblx0XHRpZiAodGhpcy5pc1dvcmtzcGFjZVNlcnZlcikge1xuXHRcdFx0YWxsLnB1c2goLi4uYXdhaXQgdGhpcy53b3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWRXb3Jrc3BhY2VFeHRlbnNpb25zKHRydWUpKTtcblx0XHR9XG5cblx0XHQvLyBkZWR1cCB3b3Jrc3BhY2UsIHVzZXIgYW5kIHN5c3RlbSBleHRlbnNpb25zIGJ5IGdpdmluZyBwcmlvcml0eSB0byB3b3Jrc3BhY2UgZmlyc3QgYW5kIHRoZW4gdG8gdXNlciBleHRlbnNpb24uXG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gZ3JvdXBCeUV4dGVuc2lvbihhbGwsIHIgPT4gci5pZGVudGlmaWVyKS5yZWR1Y2UoKHJlc3VsdCwgZXh0ZW5zaW9ucykgPT4ge1xuXHRcdFx0aWYgKGV4dGVuc2lvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGV4dGVuc2lvbnNbMF0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IHdvcmtzcGFjZUV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uIHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVzZXJFeHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiB8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzeXN0ZW1FeHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdGlmIChleHRlbnNpb24uaXNXb3Jrc3BhY2VTY29wZWQpIHtcblx0XHRcdFx0XHRcdHdvcmtzcGFjZUV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGV4dGVuc2lvbi50eXBlID09PSBFeHRlbnNpb25UeXBlLlVzZXIpIHtcblx0XHRcdFx0XHRcdHVzZXJFeHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHN5c3RlbUV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gd29ya3NwYWNlRXh0ZW5zaW9uID8/IHVzZXJFeHRlbnNpb24gPz8gc3lzdGVtRXh0ZW5zaW9uO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9LCBbXSk7XG5cblx0XHRjb25zdCBieUlkID0gaW5kZXgodGhpcy5pbnN0YWxsZWQsIGUgPT4gZS5sb2NhbCA/IGUubG9jYWwuaWRlbnRpZmllci5pZCA6IGUuaWRlbnRpZmllci5pZCk7XG5cdFx0dGhpcy5pbnN0YWxsZWQgPSBpbnN0YWxsZWQubWFwKGxvY2FsID0+IHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGJ5SWRbbG9jYWwuaWRlbnRpZmllci5pZF0gfHwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb24sIHRoaXMuc3RhdGVQcm92aWRlciwgdGhpcy5ydW50aW1lU3RhdGVQcm92aWRlciwgdGhpcy5zZXJ2ZXIsIGxvY2FsLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRleHRlbnNpb24ubG9jYWwgPSBsb2NhbDtcblx0XHRcdGV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPSB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmdldEVuYWJsZW1lbnRTdGF0ZShsb2NhbCk7XG5cdFx0XHRleHRlbnNpb24uc2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdChleHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KTtcblx0XHRcdHJldHVybiBleHRlbnNpb247XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc2V0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuaW5zdGFsbGVkID0gW107XG5cdFx0dGhpcy5pbnN0YWxsaW5nID0gW107XG5cdFx0dGhpcy51bmluc3RhbGxpbmcgPSBbXTtcblx0XHRhd2FpdCB0aGlzLmZldGNoSW5zdGFsbGVkRXh0ZW5zaW9ucygpO1xuXHRcdHRoaXMuX29uUmVzZXQuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZEluc3RhbGxFeHRlbnNpb25zKHJlc3VsdHM6IHJlYWRvbmx5IEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnM6IEV4dGVuc2lvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBldmVudCBvZiByZXN1bHRzKSB7XG5cdFx0XHRjb25zdCB7IGxvY2FsLCBzb3VyY2UgfSA9IGV2ZW50O1xuXHRcdFx0Y29uc3QgZ2FsbGVyeSA9IHNvdXJjZSAmJiAhVVJJLmlzVXJpKHNvdXJjZSkgPyBzb3VyY2UgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBsb2NhdGlvbiA9IHNvdXJjZSAmJiBVUkkuaXNVcmkoc291cmNlKSA/IHNvdXJjZSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGluc3RhbGxpbmdFeHRlbnNpb24gPSBnYWxsZXJ5ID8gdGhpcy5pbnN0YWxsaW5nLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZ2FsbGVyeS5pZGVudGlmaWVyKSlbMF0gOiBudWxsO1xuXHRcdFx0dGhpcy5pbnN0YWxsaW5nID0gaW5zdGFsbGluZ0V4dGVuc2lvbiA/IHRoaXMuaW5zdGFsbGluZy5maWx0ZXIoZSA9PiBlICE9PSBpbnN0YWxsaW5nRXh0ZW5zaW9uKSA6IHRoaXMuaW5zdGFsbGluZztcblxuXHRcdFx0bGV0IGV4dGVuc2lvbjogRXh0ZW5zaW9uIHwgdW5kZWZpbmVkID0gaW5zdGFsbGluZ0V4dGVuc2lvbiA/IGluc3RhbGxpbmdFeHRlbnNpb25cblx0XHRcdFx0OiAobG9jYXRpb24gfHwgbG9jYWwpID8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb24sIHRoaXMuc3RhdGVQcm92aWRlciwgdGhpcy5ydW50aW1lU3RhdGVQcm92aWRlciwgdGhpcy5zZXJ2ZXIsIGxvY2FsLCB1bmRlZmluZWQsIHVuZGVmaW5lZClcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0aWYgKGxvY2FsKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5zdGFsbGVkID0gdGhpcy5pbnN0YWxsZWQuZmlsdGVyKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24hLmlkZW50aWZpZXIpKVswXTtcblx0XHRcdFx0XHRpZiAoaW5zdGFsbGVkKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24gPSBpbnN0YWxsZWQ7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuaW5zdGFsbGVkLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uLmxvY2FsID0gbG9jYWw7XG5cdFx0XHRcdFx0aWYgKCFleHRlbnNpb24uZ2FsbGVyeSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmdhbGxlcnkgPSBnYWxsZXJ5O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRleHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID0gdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXRFbmFibGVtZW50U3RhdGUobG9jYWwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGV4dGVuc2lvbnMucHVzaChleHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZSghbG9jYWwgfHwgIWV4dGVuc2lvbiA/IHVuZGVmaW5lZCA6IHsgZXh0ZW5zaW9uLCBvcGVyYXRpb246IGV2ZW50Lm9wZXJhdGlvbiB9KTtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5zZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRleHRlbnNpb24uc2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdChtYW5pZmVzdCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm1hdGNoSW5zdGFsbGVkRXh0ZW5zaW9uc1dpdGhHYWxsZXJ5KGV4dGVuc2lvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YShsb2NhbDogSUxvY2FsRXh0ZW5zaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gdGhpcy5pbnN0YWxsZWQuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgbG9jYWwuaWRlbnRpZmllcikpO1xuXHRcdGlmIChleHRlbnNpb24/LmxvY2FsKSB7XG5cdFx0XHRleHRlbnNpb24ubG9jYWwgPSBsb2NhbDtcblx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoeyBleHRlbnNpb24gfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBtYXRjaEluc3RhbGxlZEV4dGVuc2lvbnNXaXRoR2FsbGVyeShleHRlbnNpb25zOiBFeHRlbnNpb25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRvTWF0Y2ggPSBleHRlbnNpb25zLmZpbHRlcihlID0+IGUubG9jYWwgJiYgIWUuZ2FsbGVyeSAmJiBlLmxvY2FsLnNvdXJjZSAhPT0gJ3Jlc291cmNlJyk7XG5cdFx0aWYgKCF0b01hdGNoLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuZ2FsbGVyeVNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnModG9NYXRjaC5tYXAoZSA9PiAoeyAuLi5lLmlkZW50aWZpZXIsIHByZVJlbGVhc2U6IGUubG9jYWw/LnByZVJlbGVhc2UgfSkpLCB7IGNvbXBhdGlibGU6IHRydWUsIHRhcmdldFBsYXRmb3JtOiBhd2FpdCB0aGlzLnNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRUYXJnZXRQbGF0Zm9ybSgpIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IGNvbXBhdGlibGUgPSBnYWxsZXJ5RXh0ZW5zaW9ucy5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0aWYgKGNvbXBhdGlibGUpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uLmdhbGxlcnkgPSBjb21wYXRpYmxlO1xuXHRcdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHsgZXh0ZW5zaW9uIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Vbmluc3RhbGxFeHRlbnNpb24oaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIpOiB2b2lkIHtcblx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLmluc3RhbGxlZC5maWx0ZXIoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGlkZW50aWZpZXIpKVswXTtcblx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRjb25zdCB1bmluc3RhbGxpbmcgPSB0aGlzLnVuaW5zdGFsbGluZy5maWx0ZXIoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGlkZW50aWZpZXIpKVswXSB8fCBleHRlbnNpb247XG5cdFx0XHR0aGlzLnVuaW5zdGFsbGluZyA9IFt1bmluc3RhbGxpbmcsIC4uLnRoaXMudW5pbnN0YWxsaW5nLmZpbHRlcihlID0+ICFhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGlkZW50aWZpZXIpKV07XG5cdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHVuaW5zdGFsbGluZyA/IHsgZXh0ZW5zaW9uOiB1bmluc3RhbGxpbmcgfSA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFVuaW5zdGFsbEV4dGVuc2lvbih7IGlkZW50aWZpZXIsIGVycm9yIH06IERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgdW5pbnN0YWxsZWQgPSB0aGlzLnVuaW5zdGFsbGluZy5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBpZGVudGlmaWVyKSkgfHwgdGhpcy5pbnN0YWxsZWQuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgaWRlbnRpZmllcikpO1xuXHRcdHRoaXMudW5pbnN0YWxsaW5nID0gdGhpcy51bmluc3RhbGxpbmcuZmlsdGVyKGUgPT4gIWFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgaWRlbnRpZmllcikpO1xuXHRcdGlmICghZXJyb3IpIHtcblx0XHRcdHRoaXMuaW5zdGFsbGVkID0gdGhpcy5pbnN0YWxsZWQuZmlsdGVyKGUgPT4gIWFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgaWRlbnRpZmllcikpO1xuXHRcdH1cblx0XHRpZiAodW5pbnN0YWxsZWQpIHtcblx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoeyBleHRlbnNpb246IHVuaW5zdGFsbGVkIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25FbmFibGVtZW50Q2hhbmdlZChwbGF0Zm9ybUV4dGVuc2lvbnM6IHJlYWRvbmx5IElQbGF0Zm9ybUV4dGVuc2lvbltdKSB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IHRoaXMubG9jYWwuZmlsdGVyKGUgPT4gcGxhdGZvcm1FeHRlbnNpb25zLnNvbWUocCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHAuaWRlbnRpZmllcikpKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLmxvY2FsKSB7XG5cdFx0XHRcdGNvbnN0IGVuYWJsZW1lbnRTdGF0ZSA9IHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZ2V0RW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbi5sb2NhbCk7XG5cdFx0XHRcdGlmIChlbmFibGVtZW50U3RhdGUgIT09IGV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUpIHtcblx0XHRcdFx0XHRleHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID0gZW5hYmxlbWVudFN0YXRlO1xuXHRcdFx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoeyBleHRlbnNpb24gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRFeHRlbnNpb25TdGF0ZShleHRlbnNpb246IEV4dGVuc2lvbik6IEV4dGVuc2lvblN0YXRlIHtcblx0XHRpZiAoZXh0ZW5zaW9uLmdhbGxlcnkgJiYgdGhpcy5pbnN0YWxsaW5nLnNvbWUoZSA9PiAhIWUuZ2FsbGVyeSAmJiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmdhbGxlcnkuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmdhbGxlcnkhLmlkZW50aWZpZXIpKSkge1xuXHRcdFx0cmV0dXJuIEV4dGVuc2lvblN0YXRlLkluc3RhbGxpbmc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnVuaW5zdGFsbGluZy5zb21lKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpKSB7XG5cdFx0XHRyZXR1cm4gRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsaW5nO1xuXHRcdH1cblx0XHRjb25zdCBsb2NhbCA9IHRoaXMuaW5zdGFsbGVkLmZpbHRlcihlID0+IGUgPT09IGV4dGVuc2lvbiB8fCAoZS5nYWxsZXJ5ICYmIGV4dGVuc2lvbi5nYWxsZXJ5ICYmIGFyZVNhbWVFeHRlbnNpb25zKGUuZ2FsbGVyeS5pZGVudGlmaWVyLCBleHRlbnNpb24uZ2FsbGVyeS5pZGVudGlmaWVyKSkpWzBdO1xuXHRcdHJldHVybiBsb2NhbCA/IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZCA6IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIElVUkxIYW5kbGVyIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBVcGRhdGVzQ2hlY2tJbnRlcnZhbCA9IDEwMDAgKiA2MCAqIDYwICogMTI7IC8vIDEyIGhvdXJzXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgaGFzT3V0ZGF0ZWRFeHRlbnNpb25zQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBsb2NhbEV4dGVuc2lvbnM6IEV4dGVuc2lvbnMgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSByZW1vdGVFeHRlbnNpb25zOiBFeHRlbnNpb25zIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgd2ViRXh0ZW5zaW9uczogRXh0ZW5zaW9ucyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNTZXJ2ZXJzOiBFeHRlbnNpb25zW10gPSBbXTtcblxuXHRwcml2YXRlIHVwZGF0ZXNDaGVja0RlbGF5ZXI6IFRocm90dGxlZERlbGF5ZXI8dm9pZD47XG5cdHByaXZhdGUgYXV0b1VwZGF0ZURlbGF5ZXI6IFRocm90dGxlZERlbGF5ZXI8dm9pZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25DaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRXh0ZW5zaW9uIHwgdW5kZWZpbmVkPigpKTtcblx0Z2V0IG9uQ2hhbmdlKCk6IEV2ZW50PElFeHRlbnNpb24gfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX29uQ2hhbmdlLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSBleHRlbnNpb25zTm90aWZpY2F0aW9uOiBJRXh0ZW5zaW9uc05vdGlmaWNhdGlvbiAmIHsgcmVhZG9ubHkga2V5OiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VFeHRlbnNpb25zTm90aWZpY2F0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUV4dGVuc2lvbnNOb3RpZmljYXRpb24gfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUV4dGVuc2lvbnNOb3RpZmljYXRpb24gPSB0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnNOb3RpZmljYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25SZXNldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25SZXNldCgpIHsgcmV0dXJuIHRoaXMuX29uUmVzZXQuZXZlbnQ7IH1cblxuXHRwcml2YXRlIGluc3RhbGxpbmc6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRwcml2YXRlIHRhc2tzSW5Qcm9ncmVzczogQ2FuY2VsYWJsZVByb21pc2U8YW55PltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVsYXllZEF1dG9VcGRhdGVDaGVja1RpbWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHJlYWRvbmx5IHdoZW5Jbml0aWFsaXplZDogUHJvbWlzZTx2b2lkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZ2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVVSTFNlcnZpY2UgdXJsU2VydmljZTogSVVSTFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElJZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1N5bmNNYW5hZ2VtZW50U2VydmljZTogSUlnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlOiBJVXNlckRhdGFBdXRvU3luY1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2U6IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJTG9jYWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvY2FsZVNlcnZpY2U6IElMb2NhbGVTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXBkYXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZVNlcnZpY2U6IElVcGRhdGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlOiBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLFxuXHRcdEBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlOiBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmhhc091dGRhdGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkgPSBIYXNPdXRkYXRlZEV4dGVuc2lvbnNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0dGhpcy5sb2NhbEV4dGVuc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zLFxuXHRcdFx0XHRleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsXG5cdFx0XHRcdGV4dCA9PiB0aGlzLmdldEV4dGVuc2lvblN0YXRlKGV4dCksXG5cdFx0XHRcdGV4dCA9PiB0aGlzLmdldFJ1bnRpbWVTdGF0ZShleHQpLFxuXHRcdFx0XHQhZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclxuXHRcdFx0KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxvY2FsRXh0ZW5zaW9ucy5vbkNoYW5nZShlID0+IHRoaXMub25EaWRDaGFuZ2VFeHRlbnNpb25zKGU/LmV4dGVuc2lvbikpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubG9jYWxFeHRlbnNpb25zLm9uUmVzZXQoZSA9PiB0aGlzLnJlc2V0KCkpKTtcblx0XHRcdHRoaXMuZXh0ZW5zaW9uc1NlcnZlcnMucHVzaCh0aGlzLmxvY2FsRXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHR0aGlzLnJlbW90ZUV4dGVuc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zLFxuXHRcdFx0XHRleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLFxuXHRcdFx0XHRleHQgPT4gdGhpcy5nZXRFeHRlbnNpb25TdGF0ZShleHQpLFxuXHRcdFx0XHRleHQgPT4gdGhpcy5nZXRSdW50aW1lU3RhdGUoZXh0KSxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlbW90ZUV4dGVuc2lvbnMub25DaGFuZ2UoZSA9PiB0aGlzLm9uRGlkQ2hhbmdlRXh0ZW5zaW9ucyhlPy5leHRlbnNpb24pKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlbW90ZUV4dGVuc2lvbnMub25SZXNldChlID0+IHRoaXMucmVzZXQoKSkpO1xuXHRcdFx0dGhpcy5leHRlbnNpb25zU2VydmVycy5wdXNoKHRoaXMucmVtb3RlRXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHR0aGlzLndlYkV4dGVuc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zLFxuXHRcdFx0XHRleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLFxuXHRcdFx0XHRleHQgPT4gdGhpcy5nZXRFeHRlbnNpb25TdGF0ZShleHQpLFxuXHRcdFx0XHRleHQgPT4gdGhpcy5nZXRSdW50aW1lU3RhdGUoZXh0KSxcblx0XHRcdFx0IShleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyIHx8IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcilcblx0XHRcdCkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53ZWJFeHRlbnNpb25zLm9uQ2hhbmdlKGUgPT4gdGhpcy5vbkRpZENoYW5nZUV4dGVuc2lvbnMoZT8uZXh0ZW5zaW9uKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53ZWJFeHRlbnNpb25zLm9uUmVzZXQoZSA9PiB0aGlzLnJlc2V0KCkpKTtcblx0XHRcdHRoaXMuZXh0ZW5zaW9uc1NlcnZlcnMucHVzaCh0aGlzLndlYkV4dGVuc2lvbnMpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlc0NoZWNrRGVsYXllciA9IG5ldyBUaHJvdHRsZWREZWxheWVyPHZvaWQ+KEV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLlVwZGF0ZXNDaGVja0ludGVydmFsKTtcblx0XHR0aGlzLmF1dG9VcGRhdGVEZWxheWVyID0gbmV3IFRocm90dGxlZERlbGF5ZXI8dm9pZD4oMTAwMCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlc0NoZWNrRGVsYXllci5jYW5jZWwoKTtcblx0XHRcdHRoaXMuYXV0b1VwZGF0ZURlbGF5ZXIuY2FuY2VsKCk7XG5cdFx0fSkpO1xuXG5cdFx0dXJsU2VydmljZS5yZWdpc3RlckhhbmRsZXIodGhpcyk7XG5cblx0XHR0aGlzLndoZW5Jbml0aWFsaXplZCA9IHRoaXMuaW5pdGlhbGl6ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIGluaXRpYWxpemUgbG9jYWwgZXh0ZW5zaW9uc1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFt0aGlzLnF1ZXJ5TG9jYWwoKSwgdGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpXSk7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5vbkRpZENoYW5nZVJ1bm5pbmdFeHRlbnNpb25zKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLCBbXSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9ucygoeyBhZGRlZCwgcmVtb3ZlZCB9KSA9PiB0aGlzLm9uRGlkQ2hhbmdlUnVubmluZ0V4dGVuc2lvbnMoYWRkZWQsIHJlbW92ZWQpKSk7XG5cblx0XHRhd2FpdCB0aGlzLmxpZmVjeWNsZVNlcnZpY2Uud2hlbihMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KTtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5pdGlhbGl6ZUF1dG9VcGRhdGUoKTtcblx0XHR0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KClcblx0XHRcdC50aGVuKG1hbmlmZXN0ID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy51cGRhdGVFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QobWFuaWZlc3QpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QobWFuaWZlc3QgPT4gdGhpcy51cGRhdGVFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QobWFuaWZlc3QpKSk7XG5cdFx0XHR9KVxuXHRcdFx0LmNhdGNoKGUgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFcnJvciB3aGlsZSBmZXRjaGluZyBleHRlbnNpb24gZ2FsbGVyeSBtYW5pZmVzdCcsIGUpKTtcblx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvbnNOb3RpZmljYWl0b24oKTtcblx0XHR0aGlzLnJlcG9ydEluc3RhbGxlZEV4dGVuc2lvbnNUZWxlbWV0cnkoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLlBST0ZJTEUsIEVYVEVOU0lPTlNfRElTTUlTU0VEX05PVElGSUNBVElPTlNfS0VZLCB0aGlzLl9zdG9yZSkoZSA9PiB0aGlzLm9uRGlkRGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlQ2hhbmdlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBFWFRFTlNJT05TX0FVVE9fVVBEQVRFX0tFWSwgdGhpcy5fc3RvcmUpKGUgPT4gdGhpcy5vbkRpZFNlbGVjdGVkRXh0ZW5zaW9uVG9BdXRvVXBkYXRlVmFsdWVDaGFuZ2UoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIEVYVEVOU0lPTlNfRE9OT1RfQVVUT19VUERBVEVfS0VZLCB0aGlzLl9zdG9yZSkoZSA9PiB0aGlzLm9uRGlkU2VsZWN0ZWRFeHRlbnNpb25Ub0F1dG9VcGRhdGVWYWx1ZUNoYW5nZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZGVib3VuY2UodGhpcy5vbkNoYW5nZSwgKCkgPT4gdW5kZWZpbmVkLCAxMDApKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uc05vdGlmaWNhaXRvbigpO1xuXHRcdFx0dGhpcy5yZXBvcnRQcm9ncmVzc0Zyb21PdGhlclNvdXJjZXMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihFeHRlbnNpb25HYWxsZXJ5U2VydmljZVVybENvbmZpZ0tleSkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVFeHRlbnNpb25zTm90aWZpY2FpdG9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplQXV0b1VwZGF0ZSgpOiB2b2lkIHtcblx0XHQvLyBSZWdpc3RlciBsaXN0ZW5lcnMgZm9yIGF1dG8gdXBkYXRlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQXV0b1VwZGF0ZUNvbmZpZ3VyYXRpb25LZXkpKSB7XG5cdFx0XHRcdGlmICghdGhpcy5pc0F1dG9VcGRhdGVFbmFibGVkKCkpIHtcblx0XHRcdFx0XHQvLyBBdXRvIHVwZGF0ZSBkaXNhYmxlZCBcdTIwMTQgY2FuY2VsIGFueSBwZW5kaW5nIGRlbGF5ZWQgcmUtY2hlY2tcblx0XHRcdFx0XHR0aGlzLmRlbGF5ZWRBdXRvVXBkYXRlQ2hlY2tUaW1lci52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmV2ZW50dWFsbHlBdXRvVXBkYXRlRXh0ZW5zaW9ucygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFRoZSBhdXRvIHVwZGF0ZSB2YWx1ZSBhZmZlY3RzIHdoZXRoZXIgYW4gZXh0ZW5zaW9uIGlzIHNob3duIGFzIGRlbGF5ZWRcblx0XHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQXV0b1VwZGF0ZURlbGF5Q29uZmlndXJhdGlvbktleSkpIHtcblx0XHRcdFx0Ly8gVGhlIGRlbGF5IGFmZmVjdHMgd2hlbiBkZWxheWVkIHVwZGF0ZXMgYXJlIGFwcGxpZWQgXHUyMDE0IGNhbmNlbCBhbnkgcGVuZGluZ1xuXHRcdFx0XHQvLyBkZWxheWVkIHJlLWNoZWNrIGFuZCByZS1ydW4gdGhlIHNjaGVkdWxpbmcgcGF0aCB3aXRoIHRoZSBuZXcgZGVsYXkuXG5cdFx0XHRcdHRoaXMuZGVsYXllZEF1dG9VcGRhdGVDaGVja1RpbWVyLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodGhpcy5pc0F1dG9VcGRhdGVFbmFibGVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLmV2ZW50dWFsbHlBdXRvVXBkYXRlRXh0ZW5zaW9ucygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFRoZSBkZWxheSBhZmZlY3RzIHdoZXRoZXIgYW4gZXh0ZW5zaW9uIGlzIHNob3duIGFzIGRlbGF5ZWRcblx0XHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQXV0b0NoZWNrVXBkYXRlc0NvbmZpZ3VyYXRpb25LZXkpKSB7XG5cdFx0XHRcdGlmICh0aGlzLmlzQXV0b0NoZWNrVXBkYXRlc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuY2hlY2tGb3JVcGRhdGVzKGBFbmFibGVkIGF1dG8gY2hlY2sgdXBkYXRlc2ApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2Uub25FbmFibGVtZW50Q2hhbmdlZChwbGF0Zm9ybUV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNBdXRvQ2hlY2tVcGRhdGVzRW5hYmxlZCgpICYmIHRoaXMuZ2V0QXV0b1VwZGF0ZVZhbHVlKCkgPT09ICdvbicgJiYgcGxhdGZvcm1FeHRlbnNpb25zLnNvbWUoZSA9PiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZChlKSkpIHtcblx0XHRcdFx0dGhpcy5jaGVja0ZvclVwZGF0ZXMoJ0V4dGVuc2lvbiBlbmFibGVtZW50IGNoYW5nZWQnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZGVib3VuY2UodGhpcy5vbkNoYW5nZSwgKCkgPT4gdW5kZWZpbmVkLCAxMDApKCgpID0+IHRoaXMuaGFzT3V0ZGF0ZWRFeHRlbnNpb25zQ29udGV4dEtleS5zZXQodGhpcy5vdXRkYXRlZC5sZW5ndGggPiAwKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXBkYXRlU2VydmljZS5vblN0YXRlQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKChlLnR5cGUgPT09IFN0YXRlVHlwZS5DaGVja2luZ0ZvclVwZGF0ZXMgJiYgZS5leHBsaWNpdCkgfHwgZS50eXBlID09PSBTdGF0ZVR5cGUuQXZhaWxhYmxlRm9yRG93bmxvYWQgfHwgZS50eXBlID09PSBTdGF0ZVR5cGUuRG93bmxvYWRlZCkge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7fSwge1xuXHRcdFx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdSZXBvcnQgd2hlbiB1cGRhdGUgY2hlY2sgaXMgdHJpZ2dlcmVkIG9uIHByb2R1Y3QgdXBkYXRlJztcblx0XHRcdFx0fT4oJ2V4dGVuc2lvbnM6dXBkYXRlY2hlY2tvbnByb2R1Y3R1cGRhdGUnKTtcblx0XHRcdFx0aWYgKHRoaXMuaXNBdXRvQ2hlY2tVcGRhdGVzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5jaGVja0ZvclVwZGF0ZXMoJ1Byb2R1Y3QgdXBkYXRlJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFsbG93ZWRFeHRlbnNpb25zU2VydmljZS5vbkRpZENoYW5nZUFsbG93ZWRFeHRlbnNpb25zQ29uZmlnVmFsdWUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNBdXRvQ2hlY2tVcGRhdGVzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdHRoaXMuY2hlY2tGb3JVcGRhdGVzKCdBbGxvd2VkIGV4dGVuc2lvbnMgY2hhbmdlZCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlSXNDb25uZWN0aW9uTWV0ZXJlZCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc0F1dG9DaGVja1VwZGF0ZXNFbmFibGVkKCkpIHtcblx0XHRcdFx0dGhpcy5jaGVja0ZvclVwZGF0ZXMoJ0Nvbm5lY3Rpb24gaXMgbm8gbG9uZ2VyIG1ldGVyZWQnKTtcblx0XHRcdH1cblx0XHRcdGlmIChpc1dlYiAmJiAhdGhpcy5pc0F1dG9VcGRhdGVFbmFibGVkKCkpIHtcblx0XHRcdFx0dGhpcy5hdXRvVXBkYXRlQnVpbHRpbkV4dGVuc2lvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBVcGRhdGUgQXV0b1VwZGF0ZSBDb250ZXh0c1xuXHRcdHRoaXMuaGFzT3V0ZGF0ZWRFeHRlbnNpb25zQ29udGV4dEtleS5zZXQodGhpcy5vdXRkYXRlZC5sZW5ndGggPiAwKTtcblxuXHRcdC8vIENoZWNrIGZvciB1cGRhdGVzXG5cdFx0dGhpcy5ldmVudHVhbGx5Q2hlY2tGb3JVcGRhdGVzKHRydWUpO1xuXG5cdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHR0aGlzLnN5bmNQaW5uZWRCdWlsdGluRXh0ZW5zaW9ucygpO1xuXHRcdFx0Ly8gQWx3YXlzIGF1dG8gdXBkYXRlIGJ1aWx0aW4gZXh0ZW5zaW9ucyBpbiB3ZWJcblx0XHRcdGlmICghdGhpcy5pc0F1dG9VcGRhdGVFbmFibGVkKCkpIHtcblx0XHRcdFx0dGhpcy5hdXRvVXBkYXRlQnVpbHRpbkV4dGVuc2lvbnMoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnJlZ2lzdGVyQXV0b1Jlc3RhcnRMaXN0ZW5lcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQXV0b1Jlc3RhcnRDb25maWd1cmF0aW9uS2V5KSkge1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyQXV0b1Jlc3RhcnRMaXN0ZW5lcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0OiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgdXBkYXRlRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KG1hbmlmZXN0OiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0IHwgbnVsbCk6IHZvaWQge1xuXHRcdHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0ID0gbWFuaWZlc3Q7XG5cdFx0dGhpcy51cGRhdGVFeHRlbnNpb25zTm90aWZpY2FpdG9uKCk7XG5cdH1cblxuXHRwcml2YXRlIGlzQXV0b1VwZGF0ZUVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMubWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlLmlzQ29ubmVjdGlvbk1ldGVyZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0QXV0b1VwZGF0ZVZhbHVlKCkgIT09ICdvZmYnO1xuXHR9XG5cblx0Z2V0QXV0b1VwZGF0ZVZhbHVlKCk6IEF1dG9VcGRhdGVDb25maWd1cmF0aW9uVmFsdWUge1xuXHRcdGNvbnN0IGF1dG9VcGRhdGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPEF1dG9VcGRhdGVDb25maWd1cmF0aW9uVmFsdWUgfCBib29sZWFuIHwgJ29ubHlFbmFibGVkRXh0ZW5zaW9ucycgfCAnb25seVNlbGVjdGVkRXh0ZW5zaW9ucycgfCAnZGVsYXllZCc+KEF1dG9VcGRhdGVDb25maWd1cmF0aW9uS2V5KTtcblx0XHRpZiAoYXV0b1VwZGF0ZSA9PT0gJ29mZicgfHwgYXV0b1VwZGF0ZSA9PT0gZmFsc2UgfHwgYXV0b1VwZGF0ZSA9PT0gJ29ubHlTZWxlY3RlZEV4dGVuc2lvbnMnKSB7XG5cdFx0XHRyZXR1cm4gJ29mZic7XG5cdFx0fVxuXHRcdHJldHVybiAnb24nO1xuXHR9XG5cblx0aXNBdXRvVXBkYXRlRGVsYXllZChleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHtcblx0XHRpZiAoIWV4dGVuc2lvbi5vdXRkYXRlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuc2hvdWxkQXV0b1VwZGF0ZUV4dGVuc2lvbihleHRlbnNpb24pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdldEF1dG9VcGRhdGVEZWxheVJlbWFpbmluZyhleHRlbnNpb24pID4gMDtcblx0fVxuXG5cdGdldEF1dG9VcGRhdGVEZWxheVJlbWFpbmluZyhleHRlbnNpb246IElFeHRlbnNpb24pOiBudW1iZXIge1xuXHRcdC8vIEV4dGVuc2lvbnMgZnJvbSBwdWJsaXNoZXJzIHRydXN0ZWQgYnkgdGhlIHByb2R1Y3QgYXJlIGF1dG8gdXBkYXRlZCB3aXRob3V0IGRlbGF5LlxuXHRcdGlmICh0aGlzLmlzRnJvbVRydXN0ZWRQdWJsaXNoZXIoZXh0ZW5zaW9uKSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGNvbnN0IGxhc3RVcGRhdGVkID0gZXh0ZW5zaW9uLmdhbGxlcnk/Lmxhc3RVcGRhdGVkO1xuXHRcdGlmICghTnVtYmVyLmlzRmluaXRlKGxhc3RVcGRhdGVkKSB8fCAhbGFzdFVwZGF0ZWQpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRjb25zdCBlbGFwc2VkID0gRGF0ZS5ub3coKSAtIGxhc3RVcGRhdGVkO1xuXHRcdGlmIChlbGFwc2VkIDwgMCkge1xuXHRcdFx0Ly8gRnV0dXJlIHRpbWVzdGFtcCAoY2xvY2sgc2tldykgXHUyMDE0IHRyZWF0IGFzIG5vdCBkZWxheWVkXG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0Y29uc3QgZGVsYXlQZXJpb2QgPSB0aGlzLmdldEF1dG9VcGRhdGVEZWxheSgpO1xuXHRcdHJldHVybiBNYXRoLm1heCgwLCBkZWxheVBlcmlvZCAtIGVsYXBzZWQpO1xuXHR9XG5cblx0Z2V0QXV0b1VwZGF0ZURlbGF5KCk6IG51bWJlciB7XG5cdFx0Y29uc3QgZGVsYXlIb3VycyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihBdXRvVXBkYXRlRGVsYXlDb25maWd1cmF0aW9uS2V5KSA/PyAyO1xuXHRcdHJldHVybiBkZWxheUhvdXJzICogNjAgKiA2MCAqIDEwMDA7IC8vIENvbnZlcnQgaG91cnMgdG8gbWlsbGlzZWNvbmRzXG5cdH1cblxuXHRwcml2YXRlIGlzRnJvbVRydXN0ZWRQdWJsaXNoZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdHJ1c3RlZFB1Ymxpc2hlcnMgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRFeHRlbnNpb25QdWJsaXNoZXJzO1xuXHRcdGlmICghdHJ1c3RlZFB1Ymxpc2hlcnM/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBwdWJsaXNoZXIgPSBleHRlbnNpb24ucHVibGlzaGVyLnRvTG93ZXJDYXNlKCk7XG5cdFx0cmV0dXJuIHRydXN0ZWRQdWJsaXNoZXJzLmluY2x1ZGVzKHB1Ymxpc2hlcilcblx0XHRcdHx8IHRydXN0ZWRQdWJsaXNoZXJzLmluY2x1ZGVzKGV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZS50b0xvd2VyQ2FzZSgpKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUF1dG9VcGRhdGVGb3JBbGxFeHRlbnNpb25zKGlzQXV0b1VwZGF0ZUVuYWJsZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3YXNBdXRvVXBkYXRlRW5hYmxlZCA9IHRoaXMuaXNBdXRvVXBkYXRlRW5hYmxlZCgpO1xuXHRcdGlmICh3YXNBdXRvVXBkYXRlRW5hYmxlZCA9PT0gaXNBdXRvVXBkYXRlRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NvbmZpcm1FbmFibGVEaXNhYmxlQXV0b1VwZGF0ZScsIFwiQXV0byBVcGRhdGUgRXh0ZW5zaW9uc1wiKSxcblx0XHRcdG1lc3NhZ2U6IGlzQXV0b1VwZGF0ZUVuYWJsZWRcblx0XHRcdFx0PyBubHMubG9jYWxpemUoJ2NvbmZpcm1FbmFibGVBdXRvVXBkYXRlJywgXCJEbyB5b3Ugd2FudCB0byBlbmFibGUgYXV0byB1cGRhdGUgZm9yIGV4dGVuc2lvbnM/XCIpXG5cdFx0XHRcdDogbmxzLmxvY2FsaXplKCdjb25maXJtRGlzYWJsZUF1dG9VcGRhdGUnLCBcIkRvIHlvdSB3YW50IHRvIGRpc2FibGUgYXV0byB1cGRhdGUgZm9yIGV4dGVuc2lvbnM/XCIpLFxuXHRcdFx0ZGV0YWlsOiBubHMubG9jYWxpemUoJ2NvbmZpcm1FbmFibGVEaXNhYmxlQXV0b1VwZGF0ZURldGFpbCcsIFwiVGhpcyB3aWxsIHJlc2V0IGFueSBhdXRvIHVwZGF0ZSBzZXR0aW5ncyB5b3UgaGF2ZSBzZXQgZm9yIGluZGl2aWR1YWwgZXh0ZW5zaW9ucy5cIiksXG5cdFx0fSk7XG5cdFx0aWYgKCFyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVzZXQgZXh0ZW5zaW9ucyBlbmFibGVkIGZvciBhdXRvIHVwZGF0ZSBmaXJzdCB0byBwcmV2ZW50IHRoZW0gZnJvbSBiZWluZyB1cGRhdGVkXG5cdFx0dGhpcy5zZXRFbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMoW10pO1xuXG5cdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShBdXRvVXBkYXRlQ29uZmlndXJhdGlvbktleSwgaXNBdXRvVXBkYXRlRW5hYmxlZCA/ICdvbicgOiAnb2ZmJyk7XG5cblx0XHR0aGlzLnNldERpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMoW10pO1xuXHRcdGF3YWl0IHRoaXMudXBkYXRlRXh0ZW5zaW9uc1Bpbm5lZFN0YXRlKCFpc0F1dG9VcGRhdGVFbmFibGVkKTtcblx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGF1dG9SZXN0YXJ0TGlzdGVuZXJEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlZ2lzdGVyQXV0b1Jlc3RhcnRMaXN0ZW5lcigpOiB2b2lkIHtcblx0XHR0aGlzLmF1dG9SZXN0YXJ0TGlzdGVuZXJEaXNwb3NhYmxlLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEF1dG9SZXN0YXJ0Q29uZmlndXJhdGlvbktleSkgPT09IHRydWUpIHtcblx0XHRcdHRoaXMuYXV0b1Jlc3RhcnRMaXN0ZW5lckRpc3Bvc2FibGUudmFsdWUgPSB0aGlzLmhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMoZm9jdXMgPT4ge1xuXHRcdFx0XHRpZiAoIWZvY3VzICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQXV0b1Jlc3RhcnRDb25maWd1cmF0aW9uS2V5KSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlUnVubmluZ0V4dGVuc2lvbnModW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXBvcnRJbnN0YWxsZWRFeHRlbnNpb25zVGVsZW1ldHJ5KCkge1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkcyA9IHRoaXMuaW5zdGFsbGVkLmZpbHRlcihleHRlbnNpb24gPT5cblx0XHRcdCFleHRlbnNpb24uaXNCdWlsdGluICYmXG5cdFx0XHQoZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UgfHxcblx0XHRcdFx0ZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSkpXG5cdFx0XHQubWFwKGV4dGVuc2lvbiA9PiBFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSk7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SW5zdGFsbGVkRXh0ZW5zaW9uc0V2ZW50LCBFeHRlbnNpb25zTG9hZENsYXNzaWZpY2F0aW9uPignaW5zdGFsbGVkRXh0ZW5zaW9ucycsIHsgZXh0ZW5zaW9uSWRzOiBuZXcgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlKGV4dGVuc2lvbklkcy5qb2luKCc7JykpLCBjb3VudDogZXh0ZW5zaW9uSWRzLmxlbmd0aCB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRDaGFuZ2VSdW5uaW5nRXh0ZW5zaW9ucyhhZGRlZDogUmVhZG9ubHlBcnJheTxJRXh0ZW5zaW9uRGVzY3JpcHRpb24+LCByZW1vdmVkOiBSZWFkb25seUFycmF5PElFeHRlbnNpb25EZXNjcmlwdGlvbj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGFuZ2VkRXh0ZW5zaW9uczogSUV4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvRmV0Y2g6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBkZXNjIG9mIGFkZGVkKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLmluc3RhbGxlZC5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZDogZGVzYy5pZGVudGlmaWVyLnZhbHVlLCB1dWlkOiBkZXNjLnV1aWQgfSwgZS5pZGVudGlmaWVyKSk7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGNoYW5nZWRFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGV4dGVuc2lvbnNUb0ZldGNoLnB1c2goZGVzYyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmtzcGFjZUV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBkZXNjIG9mIHJlbW92ZWQpIHtcblx0XHRcdGlmICh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmlzSW5zaWRlV29ya3NwYWNlKGRlc2MuZXh0ZW5zaW9uTG9jYXRpb24pKSB7XG5cdFx0XHRcdHdvcmtzcGFjZUV4dGVuc2lvbnMucHVzaChkZXNjKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGV4dGVuc2lvbnNUb0ZldGNoLnB1c2goZGVzYyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb25zVG9GZXRjaC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnMoZXh0ZW5zaW9uc1RvRmV0Y2gubWFwKGUgPT4gKHsgaWQ6IGUuaWRlbnRpZmllci52YWx1ZSwgdXVpZDogZS51dWlkIH0pKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjaGFuZ2VkRXh0ZW5zaW9ucy5wdXNoKC4uLmV4dGVuc2lvbnMpO1xuXHRcdH1cblx0XHRpZiAod29ya3NwYWNlRXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldFJlc291cmNlRXh0ZW5zaW9ucyh3b3Jrc3BhY2VFeHRlbnNpb25zLm1hcChlID0+IGUuZXh0ZW5zaW9uTG9jYXRpb24pLCB0cnVlKTtcblx0XHRcdGNoYW5nZWRFeHRlbnNpb25zLnB1c2goLi4uZXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgY2hhbmdlZEV4dGVuc2lvbiBvZiBjaGFuZ2VkRXh0ZW5zaW9ucykge1xuXHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZShjaGFuZ2VkRXh0ZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUV4dGVuc2lvbnNQaW5uZWRTdGF0ZShwaW5uZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLkV4dGVuc2lvbnMsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCd1cGRhdGluZ0V4dGVuc2lvbnMnLCBcIlVwZGF0aW5nIEV4dGVuc2lvbnMgQXV0byBVcGRhdGUgU3RhdGVcIiksXG5cdFx0fSwgKCkgPT4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5yZXNldFBpbm5lZFN0YXRlRm9yQWxsVXNlckV4dGVuc2lvbnMocGlubmVkKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlc2V0KCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgdGFzayBvZiB0aGlzLnRhc2tzSW5Qcm9ncmVzcykge1xuXHRcdFx0dGFzay5jYW5jZWwoKTtcblx0XHR9XG5cdFx0dGhpcy50YXNrc0luUHJvZ3Jlc3MgPSBbXTtcblx0XHR0aGlzLmluc3RhbGxpbmcgPSBbXTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlRXh0ZW5zaW9ucygpO1xuXHRcdHRoaXMuX29uUmVzZXQuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUV4dGVuc2lvbnMoZXh0ZW5zaW9uPzogSUV4dGVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuX2luc3RhbGxlZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sb2NhbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKGV4dGVuc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIF9sb2NhbDogSUV4dGVuc2lvbltdIHwgdW5kZWZpbmVkO1xuXHRnZXQgbG9jYWwoKTogSUV4dGVuc2lvbltdIHtcblx0XHRpZiAoIXRoaXMuX2xvY2FsKSB7XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb25zU2VydmVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0dGhpcy5fbG9jYWwgPSB0aGlzLmluc3RhbGxlZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvY2FsID0gW107XG5cdFx0XHRcdGNvbnN0IGJ5SWQgPSBncm91cEJ5RXh0ZW5zaW9uKHRoaXMuaW5zdGFsbGVkLCByID0+IHIuaWRlbnRpZmllcik7XG5cdFx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9ucyBvZiBieUlkKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9jYWwucHVzaCh0aGlzLmdldFByaW1hcnlFeHRlbnNpb24oZXh0ZW5zaW9ucykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9sb2NhbDtcblx0fVxuXG5cdHByaXZhdGUgX2luc3RhbGxlZDogSUV4dGVuc2lvbltdIHwgdW5kZWZpbmVkO1xuXHRnZXQgaW5zdGFsbGVkKCk6IElFeHRlbnNpb25bXSB7XG5cdFx0aWYgKCF0aGlzLl9pbnN0YWxsZWQpIHtcblx0XHRcdHRoaXMuX2luc3RhbGxlZCA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb25zIG9mIHRoaXMuZXh0ZW5zaW9uc1NlcnZlcnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucy5sb2NhbCkge1xuXHRcdFx0XHRcdHRoaXMuX2luc3RhbGxlZC5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbGxlZDtcblx0fVxuXG5cdGdldCBvdXRkYXRlZCgpOiBJRXh0ZW5zaW9uW10ge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbGxlZC5maWx0ZXIoZSA9PiBlLm91dGRhdGVkICYmIGUubG9jYWwgJiYgZS5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkKTtcblx0fVxuXG5cdGFzeW5jIHF1ZXJ5TG9jYWwoc2VydmVyPzogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpOiBQcm9taXNlPElFeHRlbnNpb25bXT4ge1xuXHRcdGlmIChzZXJ2ZXIpIHtcblx0XHRcdGlmICh0aGlzLmxvY2FsRXh0ZW5zaW9ucyAmJiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciA9PT0gc2VydmVyKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmxvY2FsRXh0ZW5zaW9ucy5xdWVyeUluc3RhbGxlZCh0aGlzLmdldFByb2R1Y3RWZXJzaW9uKCkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMucmVtb3RlRXh0ZW5zaW9ucyAmJiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgPT09IHNlcnZlcikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW1vdGVFeHRlbnNpb25zLnF1ZXJ5SW5zdGFsbGVkKHRoaXMuZ2V0UHJvZHVjdFZlcnNpb24oKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy53ZWJFeHRlbnNpb25zICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciA9PT0gc2VydmVyKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLndlYkV4dGVuc2lvbnMucXVlcnlJbnN0YWxsZWQodGhpcy5nZXRQcm9kdWN0VmVyc2lvbigpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5sb2NhbEV4dGVuc2lvbnMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMubG9jYWxFeHRlbnNpb25zLnF1ZXJ5SW5zdGFsbGVkKHRoaXMuZ2V0UHJvZHVjdFZlcnNpb24oKSk7XG5cdFx0XHR9XG5cdFx0XHRjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMucmVtb3RlRXh0ZW5zaW9ucykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5yZW1vdGVFeHRlbnNpb25zLnF1ZXJ5SW5zdGFsbGVkKHRoaXMuZ2V0UHJvZHVjdFZlcnNpb24oKSk7XG5cdFx0XHR9XG5cdFx0XHRjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMud2ViRXh0ZW5zaW9ucykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zLnF1ZXJ5SW5zdGFsbGVkKHRoaXMuZ2V0UHJvZHVjdFZlcnNpb24oKSk7XG5cdFx0XHR9XG5cdFx0XHRjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubG9jYWw7XG5cdH1cblxuXHRxdWVyeUdhbGxlcnkodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUGFnZXI8SUV4dGVuc2lvbj4+O1xuXHRxdWVyeUdhbGxlcnkob3B0aW9uczogSVF1ZXJ5T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUGFnZXI8SUV4dGVuc2lvbj4+O1xuXHRhc3luYyBxdWVyeUdhbGxlcnkoYXJnMTogYW55LCBhcmcyPzogYW55KTogUHJvbWlzZTxJUGFnZXI8SUV4dGVuc2lvbj4+IHtcblx0XHRpZiAoIXRoaXMuZ2FsbGVyeVNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiBzaW5nbGVQYWdlUGFnZXIoW10pO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnM6IElRdWVyeU9wdGlvbnMgPSBDYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblRva2VuKGFyZzEpID8ge30gOiBhcmcxO1xuXHRcdGNvbnN0IHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uVG9rZW4oYXJnMSkgPyBhcmcxIDogYXJnMjtcblx0XHRvcHRpb25zLnRleHQgPSBvcHRpb25zLnRleHQgPyB0aGlzLnJlc29sdmVRdWVyeVRleHQob3B0aW9ucy50ZXh0KSA6IG9wdGlvbnMudGV4dDtcblx0XHRvcHRpb25zLmluY2x1ZGVQcmVSZWxlYXNlID0gaXNVbmRlZmluZWQob3B0aW9ucy5pbmNsdWRlUHJlUmVsZWFzZSkgPyB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnByZWZlclByZVJlbGVhc2VzIDogb3B0aW9ucy5pbmNsdWRlUHJlUmVsZWFzZTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTtcblx0XHRjb25zdCBwYWdlciA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UucXVlcnkob3B0aW9ucywgdG9rZW4pO1xuXHRcdHRoaXMuc3luY0luc3RhbGxlZEV4dGVuc2lvbnNXaXRoR2FsbGVyeShwYWdlci5maXJzdFBhZ2UpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRmaXJzdFBhZ2U6IHBhZ2VyLmZpcnN0UGFnZS5tYXAoZ2FsbGVyeSA9PiB0aGlzLmZyb21HYWxsZXJ5KGdhbGxlcnksIGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QpKSxcblx0XHRcdHRvdGFsOiBwYWdlci50b3RhbCxcblx0XHRcdHBhZ2VTaXplOiBwYWdlci5wYWdlU2l6ZSxcblx0XHRcdGdldFBhZ2U6IGFzeW5jIChwYWdlSW5kZXgsIHRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBhZ2UgPSBhd2FpdCBwYWdlci5nZXRQYWdlKHBhZ2VJbmRleCwgdG9rZW4pO1xuXHRcdFx0XHR0aGlzLnN5bmNJbnN0YWxsZWRFeHRlbnNpb25zV2l0aEdhbGxlcnkocGFnZSk7XG5cdFx0XHRcdHJldHVybiBwYWdlLm1hcChnYWxsZXJ5ID0+IHRoaXMuZnJvbUdhbGxlcnkoZ2FsbGVyeSwgZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCkpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRnZXRFeHRlbnNpb25zKGV4dGVuc2lvbkluZm9zOiBJRXh0ZW5zaW9uSW5mb1tdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElFeHRlbnNpb25bXT47XG5cdGdldEV4dGVuc2lvbnMoZXh0ZW5zaW9uSW5mb3M6IElFeHRlbnNpb25JbmZvW10sIG9wdGlvbnM6IElFeHRlbnNpb25RdWVyeU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUV4dGVuc2lvbltdPjtcblx0YXN5bmMgZ2V0RXh0ZW5zaW9ucyhleHRlbnNpb25JbmZvczogSUV4dGVuc2lvbkluZm9bXSwgYXJnMTogYW55LCBhcmcyPzogYW55KTogUHJvbWlzZTxJRXh0ZW5zaW9uW10+IHtcblx0XHRpZiAoIXRoaXMuZ2FsbGVyeVNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRleHRlbnNpb25JbmZvcy5mb3JFYWNoKGUgPT4gZS5wcmVSZWxlYXNlID0gZS5wcmVSZWxlYXNlID8/IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UucHJlZmVyUHJlUmVsZWFzZXMpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTtcblx0XHRjb25zdCBnYWxsZXJ5RXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhleHRlbnNpb25JbmZvcywgYXJnMSwgYXJnMik7XG5cdFx0dGhpcy5zeW5jSW5zdGFsbGVkRXh0ZW5zaW9uc1dpdGhHYWxsZXJ5KGdhbGxlcnlFeHRlbnNpb25zKTtcblx0XHRyZXR1cm4gZ2FsbGVyeUV4dGVuc2lvbnMubWFwKGdhbGxlcnkgPT4gdGhpcy5mcm9tR2FsbGVyeShnYWxsZXJ5LCBleHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KSk7XG5cdH1cblxuXHRhc3luYyBnZXRSZXNvdXJjZUV4dGVuc2lvbnMobG9jYXRpb25zOiBVUklbXSwgaXNXb3Jrc3BhY2VTY29wZWQ6IGJvb2xlYW4pOiBQcm9taXNlPElFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHJlc291cmNlRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhsb2NhdGlvbnMpO1xuXHRcdHJldHVybiByZXNvdXJjZUV4dGVuc2lvbnMubWFwKHJlc291cmNlRXh0ZW5zaW9uID0+IHRoaXMuZ2V0SW5zdGFsbGVkRXh0ZW5zaW9uTWF0Y2hpbmdMb2NhdGlvbihyZXNvdXJjZUV4dGVuc2lvbi5sb2NhdGlvbilcblx0XHRcdD8/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uLCBleHQgPT4gdGhpcy5nZXRFeHRlbnNpb25TdGF0ZShleHQpLCBleHQgPT4gdGhpcy5nZXRSdW50aW1lU3RhdGUoZXh0KSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyByZXNvdXJjZUV4dGVuc2lvbiwgaXNXb3Jrc3BhY2VTY29wZWQgfSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZERpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZUNoYW5nZSgpOiB2b2lkIHtcblx0XHRpZiAoXG5cdFx0XHR0aGlzLmRpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSAhPT0gdGhpcy5nZXREaXNtaXNzZWROb3RpZmljYXRpb25zVmFsdWUoKSAvKiBUaGlzIGNoZWNrcyBpZiBjdXJyZW50IHdpbmRvdyBjaGFuZ2VkIHRoZSB2YWx1ZSBvciBub3QgKi9cblx0XHQpIHtcblx0XHRcdHRoaXMuX2Rpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uc05vdGlmaWNhaXRvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRXh0ZW5zaW9uc05vdGlmaWNhaXRvbigpOiB2b2lkIHtcblx0XHRjb25zdCBjb21wdXRlZE5vdGlmaWNpYXRpb25zID0gdGhpcy5jb21wdXRlRXh0ZW5zaW9uc05vdGlmaWNhdGlvbnMoKTtcblx0XHRjb25zdCBkaXNtaXNzZWROb3RpZmljYXRpb25zOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0bGV0IGV4dGVuc2lvbnNOb3RpZmljYXRpb246IElFeHRlbnNpb25zTm90aWZpY2F0aW9uICYgeyBrZXk6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChjb21wdXRlZE5vdGlmaWNpYXRpb25zLmxlbmd0aCkge1xuXHRcdFx0Ly8gcG9wdWxhdGUgZGlzbWlzc2VkIG5vdGlmaWNhdGlvbnMgd2l0aCB0aGUgb25lcyB0aGF0IGFyZSBzdGlsbCB2YWxpZFxuXHRcdFx0Zm9yIChjb25zdCBkaXNtaXNzZWROb3RpZmljYXRpb24gb2YgdGhpcy5nZXREaXNtaXNzZWROb3RpZmljYXRpb25zKCkpIHtcblx0XHRcdFx0aWYgKGNvbXB1dGVkTm90aWZpY2lhdGlvbnMuc29tZShlID0+IGUua2V5ID09PSBkaXNtaXNzZWROb3RpZmljYXRpb24pKSB7XG5cdFx0XHRcdFx0ZGlzbWlzc2VkTm90aWZpY2F0aW9ucy5wdXNoKGRpc21pc3NlZE5vdGlmaWNhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICghZGlzbWlzc2VkTm90aWZpY2F0aW9ucy5pbmNsdWRlcyhjb21wdXRlZE5vdGlmaWNpYXRpb25zWzBdLmtleSkpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uc05vdGlmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRtZXNzYWdlOiBjb21wdXRlZE5vdGlmaWNpYXRpb25zWzBdLm1lc3NhZ2UsXG5cdFx0XHRcdFx0c2V2ZXJpdHk6IGNvbXB1dGVkTm90aWZpY2lhdGlvbnNbMF0uc2V2ZXJpdHksXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uczogY29tcHV0ZWROb3RpZmljaWF0aW9uc1swXS5leHRlbnNpb25zLFxuXHRcdFx0XHRcdHF1ZXJ5OiBjb21wdXRlZE5vdGlmaWNpYXRpb25zWzBdLnF1ZXJ5LFxuXHRcdFx0XHRcdGFjdGlvbjogY29tcHV0ZWROb3RpZmljaWF0aW9uc1swXS5hY3Rpb24sXG5cdFx0XHRcdFx0a2V5OiBjb21wdXRlZE5vdGlmaWNpYXRpb25zWzBdLmtleSxcblx0XHRcdFx0XHRkaXNtaXNzOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnNldERpc21pc3NlZE5vdGlmaWNhdGlvbnMoWy4uLnRoaXMuZ2V0RGlzbWlzc2VkTm90aWZpY2F0aW9ucygpLCBjb21wdXRlZE5vdGlmaWNpYXRpb25zWzBdLmtleV0pO1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVFeHRlbnNpb25zTm90aWZpY2FpdG9uKCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5zZXREaXNtaXNzZWROb3RpZmljYXRpb25zKGRpc21pc3NlZE5vdGlmaWNhdGlvbnMpO1xuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uc05vdGlmaWNhdGlvbj8ua2V5ICE9PSBleHRlbnNpb25zTm90aWZpY2F0aW9uPy5rZXkpIHtcblx0XHRcdHRoaXMuZXh0ZW5zaW9uc05vdGlmaWNhdGlvbiA9IGV4dGVuc2lvbnNOb3RpZmljYXRpb247XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnNOb3RpZmljYXRpb24uZmlyZSh0aGlzLmV4dGVuc2lvbnNOb3RpZmljYXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUV4dGVuc2lvbnNOb3RpZmljYXRpb25zKCk6IEFycmF5PE9taXQ8SUV4dGVuc2lvbnNOb3RpZmljYXRpb24sICdkaXNtaXNzJz4gJiB7IGtleTogc3RyaW5nIH0+IHtcblx0XHRjb25zdCBjb21wdXRlZE5vdGlmaWNpYXRpb25zOiBBcnJheTxPbWl0PElFeHRlbnNpb25zTm90aWZpY2F0aW9uLCAnZGlzbWlzcyc+ICYgeyBrZXk6IHN0cmluZyB9PiA9IFtdO1xuXG5cdFx0Y29uc3QgZGlzYWxsb3dlZEV4dGVuc2lvbnMgPSB0aGlzLmxvY2FsLmZpbHRlcihlID0+IGUuZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUFsbG93bGlzdCk7XG5cdFx0aWYgKGRpc2FsbG93ZWRFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0Y29tcHV0ZWROb3RpZmljaWF0aW9ucy5wdXNoKHtcblx0XHRcdFx0bWVzc2FnZTogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KEFsbG93ZWRFeHRlbnNpb25zQ29uZmlnS2V5KS5wb2xpY3lcblx0XHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgnZGlzYWxsb3dlZCBleHRlbnNpb25zIGJ5IHBvbGljeScsIFwiU29tZSBleHRlbnNpb25zIGFyZSBkaXNhYmxlZCBiZWNhdXNlIHRoZXkgYXJlIG5vdCBhbGxvd2VkIGJ5IHlvdXIgc3lzdGVtIGFkbWluaXN0cmF0b3IuXCIpXG5cdFx0XHRcdFx0OiBubHMubG9jYWxpemUoJ2Rpc2FsbG93ZWQgZXh0ZW5zaW9ucycsIFwiU29tZSBleHRlbnNpb25zIGFyZSBkaXNhYmxlZCBiZWNhdXNlIHRoZXkgYXJlIGNvbmZpZ3VyZWQgbm90IHRvIGJlIGFsbG93ZWQuXCIpLFxuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0ZXh0ZW5zaW9uczogZGlzYWxsb3dlZEV4dGVuc2lvbnMsXG5cdFx0XHRcdGtleTogJ2Rpc2FsbG93ZWRFeHRlbnNpb25zOicgKyBkaXNhbGxvd2VkRXh0ZW5zaW9ucy5zb3J0KChhLCBiKSA9PiBhLmlkZW50aWZpZXIuaWQubG9jYWxlQ29tcGFyZShiLmlkZW50aWZpZXIuaWQpKS5tYXAoZSA9PiBlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSkuam9pbignLScpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW52YWxpZEV4dGVuc2lvbnMgPSB0aGlzLmxvY2FsLmZpbHRlcihlID0+IGUuZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUludmFsaWRFeHRlbnNpb24gJiYgIWUuaXNXb3Jrc3BhY2VTY29wZWQpO1xuXHRcdGlmIChpbnZhbGlkRXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdGlmIChpbnZhbGlkRXh0ZW5zaW9ucy5zb21lKGUgPT4gZS5sb2NhbCAmJiBlLmxvY2FsLm1hbmlmZXN0LmVuZ2luZXM/LnZzY29kZSAmJlxuXHRcdFx0XHQhaXNFbmdpbmVWYWxpZChlLmxvY2FsLm1hbmlmZXN0LmVuZ2luZXMudnNjb2RlLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZSlcblx0XHRcdCkpIHtcblx0XHRcdFx0Y29tcHV0ZWROb3RpZmljaWF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2luY29tcGF0aWJsZUV4dGVuc2lvbnMnLCBcIlNvbWUgZXh0ZW5zaW9ucyBhcmUgZGlzYWJsZWQgZHVlIHRvIHZlcnNpb24gaW5jb21wYXRpYmlsaXR5LiBSZXZpZXcgYW5kIHVwZGF0ZSB0aGVtLlwiKSxcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRleHRlbnNpb25zOiBpbnZhbGlkRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRrZXk6ICdpbmNvbXBhdGlibGVFeHRlbnNpb25zOicgKyBpbnZhbGlkRXh0ZW5zaW9ucy5zb3J0KChhLCBiKSA9PiBhLmlkZW50aWZpZXIuaWQubG9jYWxlQ29tcGFyZShiLmlkZW50aWZpZXIuaWQpKS5tYXAoZSA9PiBgJHtlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKX1AJHtlLmxvY2FsPy5tYW5pZmVzdC52ZXJzaW9ufWApLmpvaW4oJy0nKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb21wdXRlZE5vdGlmaWNpYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnaW52YWxpZEV4dGVuc2lvbnMnLCBcIkludmFsaWQgZXh0ZW5zaW9ucyBkZXRlY3RlZC4gUmV2aWV3IHRoZW0uXCIpLFxuXHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdGV4dGVuc2lvbnM6IGludmFsaWRFeHRlbnNpb25zLFxuXHRcdFx0XHRcdGtleTogJ2ludmFsaWRFeHRlbnNpb25zOicgKyBpbnZhbGlkRXh0ZW5zaW9ucy5zb3J0KChhLCBiKSA9PiBhLmlkZW50aWZpZXIuaWQubG9jYWxlQ29tcGFyZShiLmlkZW50aWZpZXIuaWQpKS5tYXAoZSA9PiBgJHtlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKX1AJHtlLmxvY2FsPy5tYW5pZmVzdC52ZXJzaW9ufWApLmpvaW4oJy0nKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEF1dG9SZXN0YXJ0Q29uZmlndXJhdGlvbktleSkpIHtcblx0XHRcdGNvbnN0IHJlc3RhcnRSZXF1aXJlZEV4dGVuc2lvbnMgPSB0aGlzLmxvY2FsLmZpbHRlcihlID0+IGUucnVudGltZVN0YXRlICE9PSB1bmRlZmluZWQgJiYgKGUucnVudGltZVN0YXRlLmFjdGlvbiA9PT0gRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUuUmVzdGFydEV4dGVuc2lvbnMgfHwgZS5ydW50aW1lU3RhdGUuYWN0aW9uID09PSBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5SZWxvYWRXaW5kb3cpKTtcblx0XHRcdGlmIChyZXN0YXJ0UmVxdWlyZWRFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBuZWVkc1JlbG9hZCA9IHJlc3RhcnRSZXF1aXJlZEV4dGVuc2lvbnMuc29tZShlID0+IGUucnVudGltZVN0YXRlPy5hY3Rpb24gPT09IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLlJlbG9hZFdpbmRvdyk7XG5cdFx0XHRcdGNvbXB1dGVkTm90aWZpY2lhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bWVzc2FnZTogbmVlZHNSZWxvYWRcblx0XHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdleHRlbnNpb25zIG5lZWQgcmVsb2FkJywgXCJFeHRlbnNpb25zIHJlcXVpcmUgYSB3aW5kb3cgcmVsb2FkIHRvIGFwcGx5IHVwZGF0ZXMuXCIpXG5cdFx0XHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9ucyBuZWVkIHJlc3RhcnQnLCBcIkFsbCBleHRlbnNpb25zIHJlcXVpcmUgYSByZXN0YXJ0IHRvIGFwcGx5IHVwZGF0ZXMuXCIpLFxuXHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdGV4dGVuc2lvbnM6IHJlc3RhcnRSZXF1aXJlZEV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0cXVlcnk6ICdAcmVzdGFydHJlcXVpcmVkJyxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdGxhYmVsOiBuZWVkc1JlbG9hZFxuXHRcdFx0XHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgncmVsb2FkIHdpbmRvdycsIFwiUmVsb2FkIFdpbmRvd1wiKVxuXHRcdFx0XHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgncmVzdGFydCBleHRlbnNpb25zIGFjdGlvbicsIFwiUmVzdGFydCBFeHRlbnNpb25zXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChuZWVkc1JlbG9hZCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuaG9zdFNlcnZpY2UucmVsb2FkKCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy51cGRhdGVSdW5uaW5nRXh0ZW5zaW9ucygpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRrZXk6ICdyZXN0YXJ0UmVxdWlyZWQ6JyArIHJlc3RhcnRSZXF1aXJlZEV4dGVuc2lvbnMuc29ydCgoYSwgYikgPT4gYS5pZGVudGlmaWVyLmlkLmxvY2FsZUNvbXBhcmUoYi5pZGVudGlmaWVyLmlkKSkubWFwKGUgPT4gZS5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpLmpvaW4oJy0nKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVwcmVjYXRlZEV4dGVuc2lvbnMgPSB0aGlzLmxvY2FsLmZpbHRlcihlID0+ICEhZS5kZXByZWNhdGlvbkluZm8gJiYgZS5sb2NhbCAmJiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZChlLmxvY2FsKSk7XG5cdFx0aWYgKGRlcHJlY2F0ZWRFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0Y29tcHV0ZWROb3RpZmljaWF0aW9ucy5wdXNoKHtcblx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdkZXByZWNhdGVkIGV4dGVuc2lvbnMnLCBcIkRlcHJlY2F0ZWQgZXh0ZW5zaW9ucyBkZXRlY3RlZC4gUmV2aWV3IHRoZW0gYW5kIG1pZ3JhdGUgdG8gYWx0ZXJuYXRpdmVzLlwiKSxcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdGV4dGVuc2lvbnM6IGRlcHJlY2F0ZWRFeHRlbnNpb25zLFxuXHRcdFx0XHRrZXk6ICdkZXByZWNhdGVkRXh0ZW5zaW9uczonICsgZGVwcmVjYXRlZEV4dGVuc2lvbnMuc29ydCgoYSwgYikgPT4gYS5pZGVudGlmaWVyLmlkLmxvY2FsZUNvbXBhcmUoYi5pZGVudGlmaWVyLmlkKSkubWFwKGUgPT4gZS5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpLmpvaW4oJy0nKSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByaXZhdGVNYXJrZXRwbGFjZVVybCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxzdHJpbmc+KEV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlVXJsQ29uZmlnS2V5KS5wb2xpY3lWYWx1ZTtcblx0XHRpZiAocHJpdmF0ZU1hcmtldHBsYWNlVXJsKSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKCk7XG5cdFx0XHRsZXQgbGlua1VyaTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdGhpcy5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgPyBnZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaSh0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZS5Db250YWN0U3VwcG9ydFVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIWxpbmtVcmkpIHtcblx0XHRcdFx0Y29uc3Qgc2V0dGluZ3NRdWVyeSA9IGBAaGFzUG9saWN5ICR7RXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2VVcmxDb25maWdLZXl9YDtcblx0XHRcdFx0bGlua1VyaSA9IGBjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzPyR7ZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KHNldHRpbmdzUXVlcnkpKX1gO1xuXHRcdFx0XHRtZXNzYWdlLmlzVHJ1c3RlZCA9IHsgZW5hYmxlZENvbW1hbmRzOiBbJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJ10gfTtcblx0XHRcdH1cblx0XHRcdG1lc3NhZ2UuYXBwZW5kTWFya2Rvd24obmxzLmxvY2FsaXplKCdwcml2YXRlTWFya2V0cGxhY2UnLCBcIlRoaXMgd2luZG93IGlzIGNvbm5lY3RlZCB0byBhIFtwcml2YXRlIGV4dGVuc2lvbiBtYXJrZXRwbGFjZV0oezB9KSBtYW5hZ2VkIGJ5IHlvdXIgb3JnYW5pemF0aW9uLlwiLCBsaW5rVXJpKSk7XG5cdFx0XHRjb21wdXRlZE5vdGlmaWNpYXRpb25zLnB1c2goe1xuXHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0ZXh0ZW5zaW9uczogW10sXG5cdFx0XHRcdGtleTogYHByaXZhdGVNYXJrZXRwbGFjZToke2hhc2gocHJpdmF0ZU1hcmtldHBsYWNlVXJsKX06JHtoYXNoKGxpbmtVcmkpfWAsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29tcHV0ZWROb3RpZmljaWF0aW9ucztcblx0fVxuXG5cdGdldEV4dGVuc2lvbnNOb3RpZmljYXRpb24oKTogSUV4dGVuc2lvbnNOb3RpZmljYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNOb3RpZmljYXRpb247XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVRdWVyeVRleHQodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHR0ZXh0ID0gdGV4dC5yZXBsYWNlKC9Ad2ViL2csIGB0YWc6XCIke1dFQl9FWFRFTlNJT05fVEFHfVwiYCk7XG5cblx0XHRjb25zdCBleHRlbnNpb25SZWdleCA9IC9cXGJleHQ6KFteXFxzXSspXFxiL2c7XG5cdFx0aWYgKGV4dGVuc2lvblJlZ2V4LnRlc3QodGV4dCkpIHtcblx0XHRcdHRleHQgPSB0ZXh0LnJlcGxhY2UoZXh0ZW5zaW9uUmVnZXgsIChtLCBleHQpID0+IHtcblxuXHRcdFx0XHQvLyBHZXQgY3VyYXRlZCBrZXl3b3Jkc1xuXHRcdFx0XHRjb25zdCBsb29rdXAgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvbktleXdvcmRzIHx8IHt9O1xuXHRcdFx0XHRjb25zdCBrZXl3b3JkcyA9IGxvb2t1cFtleHRdIHx8IFtdO1xuXG5cdFx0XHRcdC8vIEdldCBtb2RlIG5hbWVcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZShVUkkuZmlsZShgLiR7ZXh0fWApKTtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VOYW1lID0gbGFuZ3VhZ2VJZCAmJiB0aGlzLmxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZU5hbWUobGFuZ3VhZ2VJZCk7XG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlVGFnID0gbGFuZ3VhZ2VOYW1lID8gYCB0YWc6XCIke2xhbmd1YWdlTmFtZX1cImAgOiAnJztcblxuXHRcdFx0XHQvLyBDb25zdHJ1Y3QgYSByaWNoIHF1ZXJ5XG5cdFx0XHRcdHJldHVybiBgdGFnOlwiX19leHRfJHtleHR9XCIgdGFnOlwiX19leHRfLiR7ZXh0fVwiICR7a2V5d29yZHMubWFwKHRhZyA9PiBgdGFnOlwiJHt0YWd9XCJgKS5qb2luKCcgJyl9JHtsYW5ndWFnZVRhZ30gdGFnOlwiJHtleHR9XCJgO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB0ZXh0LnN1YnN0cigwLCAzNTApO1xuXHR9XG5cblx0cHJpdmF0ZSBmcm9tR2FsbGVyeShnYWxsZXJ5OiBJR2FsbGVyeUV4dGVuc2lvbiwgZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdDogSUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QpOiBJRXh0ZW5zaW9uIHtcblx0XHRsZXQgZXh0ZW5zaW9uID0gdGhpcy5nZXRJbnN0YWxsZWRFeHRlbnNpb25NYXRjaGluZ0dhbGxlcnkoZ2FsbGVyeSk7XG5cdFx0aWYgKCFleHRlbnNpb24pIHtcblx0XHRcdGV4dGVuc2lvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uLCBleHQgPT4gdGhpcy5nZXRFeHRlbnNpb25TdGF0ZShleHQpLCBleHQgPT4gdGhpcy5nZXRSdW50aW1lU3RhdGUoZXh0KSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGdhbGxlcnksIHVuZGVmaW5lZCk7XG5cdFx0XHQoPEV4dGVuc2lvbj5leHRlbnNpb24pLnNldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCk7XG5cdFx0fVxuXHRcdHJldHVybiBleHRlbnNpb247XG5cdH1cblxuXHRwcml2YXRlIGdldEluc3RhbGxlZEV4dGVuc2lvbk1hdGNoaW5nR2FsbGVyeShnYWxsZXJ5OiBJR2FsbGVyeUV4dGVuc2lvbik6IElFeHRlbnNpb24gfCBudWxsIHtcblx0XHRmb3IgKGNvbnN0IGluc3RhbGxlZCBvZiB0aGlzLmxvY2FsKSB7XG5cdFx0XHRpZiAoaW5zdGFsbGVkLmlkZW50aWZpZXIudXVpZCkgeyAvLyBJbnN0YWxsZWQgZnJvbSBHYWxsZXJ5XG5cdFx0XHRcdGlmIChpbnN0YWxsZWQuaWRlbnRpZmllci51dWlkID09PSBnYWxsZXJ5LmlkZW50aWZpZXIudXVpZCkge1xuXHRcdFx0XHRcdHJldHVybiBpbnN0YWxsZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaW5zdGFsbGVkLmxvY2FsPy5zb3VyY2UgIT09ICdyZXNvdXJjZScpIHtcblx0XHRcdFx0aWYgKGFyZVNhbWVFeHRlbnNpb25zKGluc3RhbGxlZC5pZGVudGlmaWVyLCBnYWxsZXJ5LmlkZW50aWZpZXIpKSB7IC8vIEluc3RhbGxlZCBmcm9tIG90aGVyIHNvdXJjZXNcblx0XHRcdFx0XHRyZXR1cm4gaW5zdGFsbGVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRJbnN0YWxsZWRFeHRlbnNpb25NYXRjaGluZ0xvY2F0aW9uKGxvY2F0aW9uOiBVUkkpOiBJRXh0ZW5zaW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMubG9jYWwuZmluZChlID0+IGUubG9jYWwgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWxPclBhcmVudChsb2NhdGlvbiwgZS5sb2NhbD8ubG9jYXRpb24pKSA/PyBudWxsO1xuXHR9XG5cblx0YXN5bmMgb3BlbihleHRlbnNpb246IElFeHRlbnNpb24gfCBzdHJpbmcsIG9wdGlvbnM/OiBJRXh0ZW5zaW9uRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0eXBlb2YgZXh0ZW5zaW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y29uc3QgaWQgPSBleHRlbnNpb247XG5cdFx0XHRleHRlbnNpb24gPSB0aGlzLmluc3RhbGxlZC5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB7IGlkIH0pKSA/PyAoYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25zKFt7IGlkOiBleHRlbnNpb24gfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXTtcblx0XHR9XG5cdFx0aWYgKCFleHRlbnNpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRXh0ZW5zaW9uIG5vdCBmb3VuZC4gJHtleHRlbnNpb259YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHVzZU1vZGFsID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZXh0ZW5zaW9ucy5hbGxvd09wZW5Jbk1vZGFsRWRpdG9yJyk7XG5cdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zSW5wdXQsIGV4dGVuc2lvbiksIG9wdGlvbnMsIG9wdGlvbnM/LnNpZGVCeXNpZGUgPyBTSURFX0dST1VQIDogdXNlTW9kYWwgPyBNT0RBTF9HUk9VUCA6IEFDVElWRV9HUk9VUCk7XG5cdH1cblxuXHRhc3luYyBvcGVuU2VhcmNoKHNlYXJjaFZhbHVlOiBzdHJpbmcsIHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgdmlld1BhbmVDb250YWluZXIgPSAoYXdhaXQgdGhpcy52aWV3c1NlcnZpY2Uub3BlblZpZXdDb250YWluZXIoVklFV0xFVF9JRCwgdHJ1ZSkpPy5nZXRWaWV3UGFuZUNvbnRhaW5lcigpIGFzIElFeHRlbnNpb25zVmlld1BhbmVDb250YWluZXIgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCF2aWV3UGFuZUNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSNvcGVuU2VhcmNoOiBleHRlbnNpb24gdmlldyBwYW5lIGNvbnRhaW5lciB3YXMgbm90IGF2YWlsYWJsZScpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR2aWV3UGFuZUNvbnRhaW5lci5zZWFyY2goc2VhcmNoVmFsdWUpO1xuXHRcdGlmICghcHJlc2VydmVGb2N1cykge1xuXHRcdFx0dmlld1BhbmVDb250YWluZXIuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRnZXRFeHRlbnNpb25SdW50aW1lU3RhdHVzKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IElFeHRlbnNpb25SdW50aW1lU3RhdHVzIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBleHRlbnNpb25zU3RhdHVzID0gdGhpcy5leHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbnNTdGF0dXMoKTtcblx0XHRmb3IgKGNvbnN0IGlkIG9mIE9iamVjdC5rZXlzKGV4dGVuc2lvbnNTdGF0dXMpKSB7XG5cdFx0XHRpZiAoYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBleHRlbnNpb24uaWRlbnRpZmllcikpIHtcblx0XHRcdFx0cmV0dXJuIGV4dGVuc2lvbnNTdGF0dXNbaWRdO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlUnVubmluZ0V4dGVuc2lvbnMobWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgncmVzdGFydCcsIFwiQ2hhbmdpbmcgZXh0ZW5zaW9uIGVuYWJsZW1lbnRcIiksIGF1dG86IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRvQWRkOiBJTG9jYWxFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHRvUmVtb3ZlOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvQ2hlY2sgPSBbLi4udGhpcy5sb2NhbF07XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9uc1RvQ2hlY2spIHtcblx0XHRcdGNvbnN0IHJ1bnRpbWVTdGF0ZSA9IGV4dGVuc2lvbi5ydW50aW1lU3RhdGU7XG5cdFx0XHRpZiAoIXJ1bnRpbWVTdGF0ZSB8fCBydW50aW1lU3RhdGUuYWN0aW9uICE9PSBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5SZXN0YXJ0RXh0ZW5zaW9ucykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChleHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGVkKSB7XG5cdFx0XHRcdHRvUmVtb3ZlLnB1c2goZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghZXh0ZW5zaW9uLmxvY2FsKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaXNFbmFibGVkID0gdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoZXh0ZW5zaW9uLmxvY2FsKTtcblx0XHRcdGlmIChpc0VuYWJsZWQpIHtcblx0XHRcdFx0Y29uc3QgcnVubmluZ0V4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkOiBlLmlkZW50aWZpZXIudmFsdWUsIHV1aWQ6IGUudXVpZCB9LCBleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0XHRpZiAocnVubmluZ0V4dGVuc2lvbikge1xuXHRcdFx0XHRcdHRvUmVtb3ZlLnB1c2gocnVubmluZ0V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0b0FkZC5wdXNoKGV4dGVuc2lvbi5sb2NhbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0b1JlbW92ZS5wdXNoKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKGV4dGVuc2lvbi5pc1VuZGVyRGV2ZWxvcG1lbnQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uc1RvQ2hlY2suc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlLCB1dWlkOiBleHRlbnNpb24udXVpZCB9LCBlLmxvY2FsPy5pZGVudGlmaWVyID8/IGUuaWRlbnRpZmllcikpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRXh0ZW5zaW9uIGlzIHJ1bm5pbmcgYnV0IGRvZXNuJ3QgZXhpc3QgbG9jYWxseS4gUmVtb3ZlIGl0IGZyb20gcnVubmluZyBleHRlbnNpb25zLlxuXHRcdFx0dG9SZW1vdmUucHVzaChleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRvQWRkLmxlbmd0aCB8fCB0b1JlbW92ZS5sZW5ndGgpIHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2Uuc3RvcEV4dGVuc2lvbkhvc3RzKG1lc3NhZ2UsIGF1dG8pKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5zdGFydEV4dGVuc2lvbkhvc3RzKHsgdG9BZGQsIHRvUmVtb3ZlIH0pO1xuXHRcdFx0XHRpZiAoYXV0bykge1xuXHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2V4dGVuc2lvbnNBdXRvUmVzdGFydCcsIFwiRXh0ZW5zaW9ucyB3ZXJlIGF1dG8gcmVzdGFydGVkIHRvIGVuYWJsZSB1cGRhdGVzLlwiKSxcblx0XHRcdFx0XHRcdHByaW9yaXR5OiBOb3RpZmljYXRpb25Qcmlvcml0eS5TSUxFTlRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0eXBlIEV4dGVuc2lvbnNBdXRvUmVzdGFydENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdSZXBvcnQgd2hlbiBleHRlbnNpb25zIGFyZSBhdXRvIHJlc3RhcnRlZCc7XG5cdFx0XHRcdFx0Y291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgZXh0ZW5zaW9ucyBhdXRvIHJlc3RhcnRlZCcgfTtcblx0XHRcdFx0XHRhdXRvOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgcmVzdGFydCB3YXMgdHJpZ2dlcmVkIGF1dG9tYXRpY2FsbHknIH07XG5cdFx0XHRcdH07XG5cdFx0XHRcdHR5cGUgRXh0ZW5zaW9uc0F1dG9SZXN0YXJ0RXZlbnQgPSB7XG5cdFx0XHRcdFx0Y291bnQ6IG51bWJlcjtcblx0XHRcdFx0XHRhdXRvOiBib29sZWFuO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFeHRlbnNpb25zQXV0b1Jlc3RhcnRFdmVudCwgRXh0ZW5zaW9uc0F1dG9SZXN0YXJ0Q2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25zOmF1dG9yZXN0YXJ0JywgeyBjb3VudDogdG9BZGQubGVuZ3RoICsgdG9SZW1vdmUubGVuZ3RoLCBhdXRvIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0UnVudGltZVN0YXRlKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IEV4dGVuc2lvblJ1bnRpbWVTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaXNVbmluc3RhbGxlZCA9IGV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsZWQ7XG5cdFx0Y29uc3QgcnVubmluZ0V4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkOiBlLmlkZW50aWZpZXIudmFsdWUgfSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRjb25zdCByZWxvYWRBY3Rpb24gPSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgPyBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5SZWxvYWRXaW5kb3cgOiBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5SZXN0YXJ0RXh0ZW5zaW9ucztcblx0XHRjb25zdCByZWxvYWRBY3Rpb25MYWJlbCA9IHJlbG9hZEFjdGlvbiA9PT0gRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUuUmVsb2FkV2luZG93ID8gbmxzLmxvY2FsaXplKCdyZWxvYWQnLCBcInJlbG9hZCB3aW5kb3dcIikgOiBubHMubG9jYWxpemUoJ3Jlc3RhcnQgZXh0ZW5zaW9ucycsIFwicmVzdGFydCBleHRlbnNpb25zXCIpO1xuXG5cdFx0aWYgKGlzVW5pbnN0YWxsZWQpIHtcblx0XHRcdGNvbnN0IGNhblJlbW92ZVJ1bm5pbmdFeHRlbnNpb24gPSBydW5uaW5nRXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uU2VydmljZS5jYW5SZW1vdmVFeHRlbnNpb24ocnVubmluZ0V4dGVuc2lvbik7XG5cdFx0XHRjb25zdCBpc1NhbWVFeHRlbnNpb25SdW5uaW5nID0gcnVubmluZ0V4dGVuc2lvblxuXHRcdFx0XHQmJiAoIWV4dGVuc2lvbi5zZXJ2ZXIgfHwgZXh0ZW5zaW9uLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5nZXRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKHRvRXh0ZW5zaW9uKHJ1bm5pbmdFeHRlbnNpb24pKSlcblx0XHRcdFx0JiYgKCFleHRlbnNpb24ucmVzb3VyY2VFeHRlbnNpb24gfHwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZXh0ZW5zaW9uLnJlc291cmNlRXh0ZW5zaW9uLmxvY2F0aW9uLCBydW5uaW5nRXh0ZW5zaW9uLmV4dGVuc2lvbkxvY2F0aW9uKSk7XG5cdFx0XHRpZiAoIWNhblJlbW92ZVJ1bm5pbmdFeHRlbnNpb24gJiYgaXNTYW1lRXh0ZW5zaW9uUnVubmluZyAmJiAhcnVubmluZ0V4dGVuc2lvbi5pc1VuZGVyRGV2ZWxvcG1lbnQpIHtcblx0XHRcdFx0cmV0dXJuIHsgYWN0aW9uOiByZWxvYWRBY3Rpb24sIHJlYXNvbjogbmxzLmxvY2FsaXplKCdwb3N0VW5pbnN0YWxsVG9vbHRpcCcsIFwiUGxlYXNlIHswfSB0byBjb21wbGV0ZSB0aGUgdW5pbnN0YWxsYXRpb24gb2YgdGhpcyBleHRlbnNpb24uXCIsIHJlbG9hZEFjdGlvbkxhYmVsKSB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbi5sb2NhbCkge1xuXHRcdFx0Y29uc3QgaXNTYW1lRXh0ZW5zaW9uUnVubmluZyA9IHJ1bm5pbmdFeHRlbnNpb24gJiYgZXh0ZW5zaW9uLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5nZXRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKHRvRXh0ZW5zaW9uKHJ1bm5pbmdFeHRlbnNpb24pKTtcblx0XHRcdGNvbnN0IGlzRW5hYmxlZCA9IHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKGV4dGVuc2lvbi5sb2NhbCk7XG5cblx0XHRcdC8vIEV4dGVuc2lvbiBpcyBydW5uaW5nXG5cdFx0XHRpZiAocnVubmluZ0V4dGVuc2lvbikge1xuXHRcdFx0XHRpZiAoaXNFbmFibGVkKSB7XG5cdFx0XHRcdFx0Ly8gTm8gUmVsb2FkIGlzIHJlcXVpcmVkIGlmIGV4dGVuc2lvbiBjYW4gcnVuIHdpdGhvdXQgcmVsb2FkXG5cdFx0XHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5jYW5BZGRFeHRlbnNpb24odG9FeHRlbnNpb25EZXNjcmlwdGlvbihleHRlbnNpb24ubG9jYWwpKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcnVubmluZ0V4dGVuc2lvblNlcnZlciA9IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UuZ2V0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcih0b0V4dGVuc2lvbihydW5uaW5nRXh0ZW5zaW9uKSk7XG5cblx0XHRcdFx0XHRpZiAoaXNTYW1lRXh0ZW5zaW9uUnVubmluZykge1xuXHRcdFx0XHRcdFx0Ly8gRGlmZmVyZW50IHZlcnNpb24gb3IgdGFyZ2V0IHBsYXRmb3JtIG9mIHNhbWUgZXh0ZW5zaW9uIGlzIHJ1bm5pbmcuIFJlcXVpcmVzIHJlbG9hZCB0byBydW4gdGhlIGN1cnJlbnQgdmVyc2lvblxuXHRcdFx0XHRcdFx0aWYgKCFydW5uaW5nRXh0ZW5zaW9uLmlzVW5kZXJEZXZlbG9wbWVudCAmJiAoZXh0ZW5zaW9uLnZlcnNpb24gIT09IHJ1bm5pbmdFeHRlbnNpb24udmVyc2lvbiB8fCBleHRlbnNpb24ubG9jYWwudGFyZ2V0UGxhdGZvcm0gIT09IHJ1bm5pbmdFeHRlbnNpb24udGFyZ2V0UGxhdGZvcm0pKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHByb2R1Y3RDdXJyZW50VmVyc2lvbiA9IHRoaXMuZ2V0UHJvZHVjdEN1cnJlbnRWZXJzaW9uKCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHByb2R1Y3RVcGRhdGVWZXJzaW9uID0gdGhpcy5nZXRQcm9kdWN0VXBkYXRlVmVyc2lvbigpO1xuXHRcdFx0XHRcdFx0XHRpZiAocHJvZHVjdFVwZGF0ZVZlcnNpb25cblx0XHRcdFx0XHRcdFx0XHQmJiAhaXNFbmdpbmVWYWxpZChleHRlbnNpb24ubG9jYWwubWFuaWZlc3QuZW5naW5lcy52c2NvZGUsIHByb2R1Y3RDdXJyZW50VmVyc2lvbi52ZXJzaW9uLCBwcm9kdWN0Q3VycmVudFZlcnNpb24uZGF0ZSlcblx0XHRcdFx0XHRcdFx0XHQmJiBpc0VuZ2luZVZhbGlkKGV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdC5lbmdpbmVzLnZzY29kZSwgcHJvZHVjdFVwZGF0ZVZlcnNpb24udmVyc2lvbiwgcHJvZHVjdFVwZGF0ZVZlcnNpb24uZGF0ZSlcblx0XHRcdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnVwZGF0ZVNlcnZpY2Uuc3RhdGU7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHN0YXRlLnR5cGUgPT09IFN0YXRlVHlwZS5BdmFpbGFibGVGb3JEb3dubG9hZCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgYWN0aW9uOiBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5Eb3dubG9hZFVwZGF0ZSwgcmVhc29uOiBubHMubG9jYWxpemUoJ3Bvc3RVcGRhdGVEb3dubG9hZFRvb2x0aXAnLCBcIlBsZWFzZSB1cGRhdGUgezB9IHRvIGVuYWJsZSB0aGUgdXBkYXRlZCBleHRlbnNpb24uXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpIH07XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuRG93bmxvYWRlZCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgYWN0aW9uOiBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5BcHBseVVwZGF0ZSwgcmVhc29uOiBubHMubG9jYWxpemUoJ3Bvc3RVcGRhdGVVcGRhdGVUb29sdGlwJywgXCJQbGVhc2UgdXBkYXRlIHswfSB0byBlbmFibGUgdGhlIHVwZGF0ZWQgZXh0ZW5zaW9uLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSB9O1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLlJlYWR5KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4geyBhY3Rpb246IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLlF1aXRBbmRJbnN0YWxsLCByZWFzb246IG5scy5sb2NhbGl6ZSgncG9zdFVwZGF0ZVJlc3RhcnRUb29sdGlwJywgXCJQbGVhc2UgcmVzdGFydCB7MH0gdG8gZW5hYmxlIHRoZSB1cGRhdGVkIGV4dGVuc2lvbi5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZykgfTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyBhY3Rpb246IHJlbG9hZEFjdGlvbiwgcmVhc29uOiBubHMubG9jYWxpemUoJ3Bvc3RVcGRhdGVUb29sdGlwJywgXCJQbGVhc2UgezB9IHRvIGVuYWJsZSB0aGUgdXBkYXRlZCBleHRlbnNpb24uXCIsIHJlbG9hZEFjdGlvbkxhYmVsKSB9O1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb25zU2VydmVycy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkluT3RoZXJTZXJ2ZXIgPSB0aGlzLmluc3RhbGxlZC5maWx0ZXIoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSAmJiBlLnNlcnZlciAhPT0gZXh0ZW5zaW9uLnNlcnZlcilbMF07XG5cdFx0XHRcdFx0XHRcdGlmIChleHRlbnNpb25Jbk90aGVyU2VydmVyKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gVGhpcyBleHRlbnNpb24gcHJlZmVycyB0byBydW4gb24gVUkvTG9jYWwgc2lkZSBidXQgaXMgcnVubmluZyBpbiByZW1vdGVcblx0XHRcdFx0XHRcdFx0XHRpZiAocnVubmluZ0V4dGVuc2lvblNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5wcmVmZXJzRXhlY3V0ZU9uVUkoZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0KSAmJiBleHRlbnNpb25Jbk90aGVyU2VydmVyLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB7IGFjdGlvbjogcmVsb2FkQWN0aW9uLCByZWFzb246IG5scy5sb2NhbGl6ZSgnZW5hYmxlIGxvY2FsbHknLCBcIlBsZWFzZSB7MH0gdG8gZW5hYmxlIHRoaXMgZXh0ZW5zaW9uIGxvY2FsbHkuXCIsIHJlbG9hZEFjdGlvbkxhYmVsKSB9O1xuXHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdC8vIFRoaXMgZXh0ZW5zaW9uIHByZWZlcnMgdG8gcnVuIG9uIFdvcmtzcGFjZS9SZW1vdGUgc2lkZSBidXQgaXMgcnVubmluZyBpbiBsb2NhbFxuXHRcdFx0XHRcdFx0XHRcdGlmIChydW5uaW5nRXh0ZW5zaW9uU2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UucHJlZmVyc0V4ZWN1dGVPbldvcmtzcGFjZShleHRlbnNpb24ubG9jYWwubWFuaWZlc3QpICYmIGV4dGVuc2lvbkluT3RoZXJTZXJ2ZXIuc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB7IGFjdGlvbjogcmVsb2FkQWN0aW9uLCByZWFzb246IG5scy5sb2NhbGl6ZSgnZW5hYmxlIHJlbW90ZScsIFwiUGxlYXNlIHswfSB0byBlbmFibGUgdGhpcyBleHRlbnNpb24gaW4gezF9LlwiLCByZWxvYWRBY3Rpb25MYWJlbCwgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyPy5sYWJlbCkgfTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cblx0XHRcdFx0XHRcdGlmIChleHRlbnNpb24uc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiBydW5uaW5nRXh0ZW5zaW9uU2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0XHRcdFx0Ly8gVGhpcyBleHRlbnNpb24gcHJlZmVycyB0byBydW4gb24gVUkvTG9jYWwgc2lkZSBidXQgaXMgcnVubmluZyBpbiByZW1vdGVcblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5wcmVmZXJzRXhlY3V0ZU9uVUkoZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0KSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB7IGFjdGlvbjogcmVsb2FkQWN0aW9uLCByZWFzb246IG5scy5sb2NhbGl6ZSgncG9zdEVuYWJsZVRvb2x0aXAnLCBcIlBsZWFzZSB7MH0gdG8gZW5hYmxlIHRoaXMgZXh0ZW5zaW9uLlwiLCByZWxvYWRBY3Rpb25MYWJlbCkgfTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5zZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiBydW5uaW5nRXh0ZW5zaW9uU2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRcdFx0XHQvLyBUaGlzIGV4dGVuc2lvbiBwcmVmZXJzIHRvIHJ1biBvbiBXb3Jrc3BhY2UvUmVtb3RlIHNpZGUgYnV0IGlzIHJ1bm5pbmcgaW4gbG9jYWxcblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5wcmVmZXJzRXhlY3V0ZU9uV29ya3NwYWNlKGV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdCkpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4geyBhY3Rpb246IHJlbG9hZEFjdGlvbiwgcmVhc29uOiBubHMubG9jYWxpemUoJ3Bvc3RFbmFibGVUb29sdGlwJywgXCJQbGVhc2UgezB9IHRvIGVuYWJsZSB0aGlzIGV4dGVuc2lvbi5cIiwgcmVsb2FkQWN0aW9uTGFiZWwpIH07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoaXNTYW1lRXh0ZW5zaW9uUnVubmluZyAmJiAhcnVubmluZ0V4dGVuc2lvbi5pc1VuZGVyRGV2ZWxvcG1lbnQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGFjdGlvbjogcmVsb2FkQWN0aW9uLCByZWFzb246IG5scy5sb2NhbGl6ZSgncG9zdERpc2FibGVUb29sdGlwJywgXCJQbGVhc2UgezB9IHRvIGRpc2FibGUgdGhpcyBleHRlbnNpb24uXCIsIHJlbG9hZEFjdGlvbkxhYmVsKSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFeHRlbnNpb24gaXMgbm90IHJ1bm5pbmdcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRpZiAoaXNFbmFibGVkICYmICF0aGlzLmV4dGVuc2lvblNlcnZpY2UuY2FuQWRkRXh0ZW5zaW9uKHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24oZXh0ZW5zaW9uLmxvY2FsKSkpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBhY3Rpb246IHJlbG9hZEFjdGlvbiwgcmVhc29uOiBubHMubG9jYWxpemUoJ3Bvc3RFbmFibGVUb29sdGlwJywgXCJQbGVhc2UgezB9IHRvIGVuYWJsZSB0aGlzIGV4dGVuc2lvbi5cIiwgcmVsb2FkQWN0aW9uTGFiZWwpIH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBvdGhlclNlcnZlciA9IGV4dGVuc2lvbi5zZXJ2ZXIgPyBleHRlbnNpb24uc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciA/IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciA6IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyIDogbnVsbDtcblx0XHRcdFx0aWYgKG90aGVyU2VydmVyICYmIGV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RXh0ZW5zaW9uS2luZCkge1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkluT3RoZXJTZXJ2ZXIgPSB0aGlzLmxvY2FsLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpICYmIGUuc2VydmVyID09PSBvdGhlclNlcnZlcilbMF07XG5cdFx0XHRcdFx0Ly8gU2FtZSBleHRlbnNpb24gaW4gb3RoZXIgc2VydmVyIGV4aXN0cyBhbmRcblx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uSW5PdGhlclNlcnZlciAmJiBleHRlbnNpb25Jbk90aGVyU2VydmVyLmxvY2FsICYmIHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKGV4dGVuc2lvbkluT3RoZXJTZXJ2ZXIubG9jYWwpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBhY3Rpb246IHJlbG9hZEFjdGlvbiwgcmVhc29uOiBubHMubG9jYWxpemUoJ3Bvc3RFbmFibGVUb29sdGlwJywgXCJQbGVhc2UgezB9IHRvIGVuYWJsZSB0aGlzIGV4dGVuc2lvbi5cIiwgcmVsb2FkQWN0aW9uTGFiZWwpIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFByaW1hcnlFeHRlbnNpb24oZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKTogSUV4dGVuc2lvbiB7XG5cdFx0aWYgKGV4dGVuc2lvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gZXh0ZW5zaW9uc1swXTtcblx0XHR9XG5cblx0XHRjb25zdCBlbmFibGVkRXh0ZW5zaW9ucyA9IGV4dGVuc2lvbnMuZmlsdGVyKGUgPT4gZS5sb2NhbCAmJiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZChlLmxvY2FsKSk7XG5cdFx0aWYgKGVuYWJsZWRFeHRlbnNpb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIGVuYWJsZWRFeHRlbnNpb25zWzBdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbnNUb0Nob29zZSA9IGVuYWJsZWRFeHRlbnNpb25zLmxlbmd0aCA/IGVuYWJsZWRFeHRlbnNpb25zIDogZXh0ZW5zaW9ucztcblx0XHRjb25zdCBtYW5pZmVzdCA9IGV4dGVuc2lvbnNUb0Nob29zZS5maW5kKGUgPT4gZS5sb2NhbCAmJiBlLmxvY2FsLm1hbmlmZXN0KT8ubG9jYWw/Lm1hbmlmZXN0O1xuXG5cdFx0Ly8gTWFuaWZlc3QgaXMgbm90IGZvdW5kIHdoaWNoIHNob3VsZCBub3QgaGFwcGVuLlxuXHRcdC8vIEluIHdoaWNoIGNhc2UgcmV0dXJuIHRoZSBmaXJzdCBleHRlbnNpb24uXG5cdFx0aWYgKCFtYW5pZmVzdCkge1xuXHRcdFx0cmV0dXJuIGV4dGVuc2lvbnNUb0Nob29zZVswXTtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25LaW5kcyA9IHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5nZXRFeHRlbnNpb25LaW5kKG1hbmlmZXN0KTtcblxuXHRcdGxldCBleHRlbnNpb24gPSBleHRlbnNpb25zVG9DaG9vc2UuZmluZChleHRlbnNpb24gPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb25LaW5kIG9mIGV4dGVuc2lvbktpbmRzKSB7XG5cdFx0XHRcdHN3aXRjaCAoZXh0ZW5zaW9uS2luZCkge1xuXHRcdFx0XHRcdGNhc2UgJ3VpJzpcblx0XHRcdFx0XHRcdC8qIFVJIGV4dGVuc2lvbiBpcyBjaG9zZW4gb25seSBpZiBpdCBpcyBpbnN0YWxsZWQgbG9jYWxseSAqL1xuXHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5zZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdGNhc2UgJ3dvcmtzcGFjZSc6XG5cdFx0XHRcdFx0XHQvKiBDaG9vc2UgcmVtb3RlIHdvcmtzcGFjZSBleHRlbnNpb24gaWYgZXhpc3RzICovXG5cdFx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdGNhc2UgJ3dlYic6XG5cdFx0XHRcdFx0XHQvKiBDaG9vc2Ugd2ViIGV4dGVuc2lvbiBpZiBleGlzdHMgKi9cblx0XHRcdFx0XHRcdGlmIChleHRlbnNpb24uc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblxuXHRcdGlmICghZXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRleHRlbnNpb24gPSBleHRlbnNpb25zVG9DaG9vc2UuZmluZChleHRlbnNpb24gPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbktpbmQgb2YgZXh0ZW5zaW9uS2luZHMpIHtcblx0XHRcdFx0XHRzd2l0Y2ggKGV4dGVuc2lvbktpbmQpIHtcblx0XHRcdFx0XHRcdGNhc2UgJ3dvcmtzcGFjZSc6XG5cdFx0XHRcdFx0XHRcdC8qIENob29zZSBsb2NhbCB3b3Jrc3BhY2UgZXh0ZW5zaW9uIGlmIGV4aXN0cyAqL1xuXHRcdFx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHRjYXNlICd3ZWInOlxuXHRcdFx0XHRcdFx0XHQvKiBDaG9vc2UgbG9jYWwgd2ViIGV4dGVuc2lvbiBpZiBleGlzdHMgKi9cblx0XHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5zZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoIWV4dGVuc2lvbiAmJiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdGV4dGVuc2lvbiA9IGV4dGVuc2lvbnNUb0Nob29zZS5maW5kKGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uS2luZCBvZiBleHRlbnNpb25LaW5kcykge1xuXHRcdFx0XHRcdHN3aXRjaCAoZXh0ZW5zaW9uS2luZCkge1xuXHRcdFx0XHRcdFx0Y2FzZSAnd2ViJzpcblx0XHRcdFx0XHRcdFx0LyogQ2hvb3NlIHdlYiBleHRlbnNpb24gaWYgZXhpc3RzICovXG5cdFx0XHRcdFx0XHRcdGlmIChleHRlbnNpb24uc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICghZXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0ZXh0ZW5zaW9uID0gZXh0ZW5zaW9uc1RvQ2hvb3NlLmZpbmQoZXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb25LaW5kIG9mIGV4dGVuc2lvbktpbmRzKSB7XG5cdFx0XHRcdFx0c3dpdGNoIChleHRlbnNpb25LaW5kKSB7XG5cdFx0XHRcdFx0XHRjYXNlICd3ZWInOlxuXHRcdFx0XHRcdFx0XHQvKiBDaG9vc2UgcmVtb3RlIHdlYiBleHRlbnNpb24gaWYgZXhpc3RzICovXG5cdFx0XHRcdFx0XHRcdGlmIChleHRlbnNpb24uc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBleHRlbnNpb24gfHwgZXh0ZW5zaW9uc1swXTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RXh0ZW5zaW9uU3RhdGUoZXh0ZW5zaW9uOiBFeHRlbnNpb24pOiBFeHRlbnNpb25TdGF0ZSB7XG5cdFx0aWYgKHRoaXMuaW5zdGFsbGluZy5zb21lKGkgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikgJiYgKCFleHRlbnNpb24uc2VydmVyIHx8IGkuc2VydmVyID09PSBleHRlbnNpb24uc2VydmVyKSkpIHtcblx0XHRcdHJldHVybiBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsaW5nO1xuXHRcdH1cblx0XHRpZiAodGhpcy5yZW1vdGVFeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMucmVtb3RlRXh0ZW5zaW9ucy5nZXRFeHRlbnNpb25TdGF0ZShleHRlbnNpb24pO1xuXHRcdFx0aWYgKHN0YXRlICE9PSBFeHRlbnNpb25TdGF0ZS5Vbmluc3RhbGxlZCkge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLndlYkV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy53ZWJFeHRlbnNpb25zLmdldEV4dGVuc2lvblN0YXRlKGV4dGVuc2lvbik7XG5cdFx0XHRpZiAoc3RhdGUgIT09IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGVkKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMubG9jYWxFeHRlbnNpb25zKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5sb2NhbEV4dGVuc2lvbnMuZ2V0RXh0ZW5zaW9uU3RhdGUoZXh0ZW5zaW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGVkO1xuXHR9XG5cblx0YXN5bmMgY2hlY2tGb3JVcGRhdGVzKHJlYXNvbj86IHN0cmluZywgb25seUJ1aWx0aW4/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHJlYXNvbikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbRXh0ZW5zaW9uc106IENoZWNraW5nIGZvciB1cGRhdGVzLiBSZWFzb246ICR7cmVhc29ufWApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtFeHRlbnNpb25zXTogQ2hlY2tpbmcgZm9yIHVwZGF0ZXNgKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmdhbGxlcnlTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGV4dGVuc2lvbnM6IEV4dGVuc2lvbnNbXSA9IFtdO1xuXHRcdGlmICh0aGlzLmxvY2FsRXh0ZW5zaW9ucykge1xuXHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKHRoaXMubG9jYWxFeHRlbnNpb25zKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMucmVtb3RlRXh0ZW5zaW9ucykge1xuXHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKHRoaXMucmVtb3RlRXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLndlYkV4dGVuc2lvbnMpIHtcblx0XHRcdGV4dGVuc2lvbnMucHVzaCh0aGlzLndlYkV4dGVuc2lvbnMpO1xuXHRcdH1cblx0XHRpZiAoIWV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGluZm9zOiBJRXh0ZW5zaW9uSW5mb1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBpbnN0YWxsZWQgb2YgdGhpcy5sb2NhbCkge1xuXHRcdFx0aWYgKG9ubHlCdWlsdGluICYmICFpbnN0YWxsZWQuaXNCdWlsdGluKSB7XG5cdFx0XHRcdC8vIFNraXAgaWYgY2hlY2sgdXBkYXRlcyBvbmx5IGZvciBidWlsdGluIGV4dGVuc2lvbnMgYW5kIGN1cnJlbnQgZXh0ZW5zaW9uIGlzIG5vdCBidWlsdGluLlxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghaW5zdGFsbGVkLmxvY2FsPy5mb3JjZUF1dG9VcGRhdGUgJiYgaW5zdGFsbGVkLmlzQnVpbHRpbiAmJiAhaW5zdGFsbGVkLmxvY2FsPy5waW5uZWQgJiYgKGluc3RhbGxlZC50eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbSB8fCAhaW5zdGFsbGVkLmxvY2FsPy5pZGVudGlmaWVyLnV1aWQpKSB7XG5cdFx0XHRcdC8vIFNraXAgY2hlY2tpbmcgdXBkYXRlcyBmb3IgYSBidWlsdGluIGV4dGVuc2lvbiBpZiBpdCBpcyBhIHN5c3RlbSBleHRlbnNpb24gb3IgaWYgaXQgZG9lcyBub3QgaGF2ZSBhIE1hcmtldHBsYWNlIGlkZW50aWZpZXJcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaW5zdGFsbGVkLmxvY2FsPy5zb3VyY2UgPT09ICdyZXNvdXJjZScpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpbmZvcy5wdXNoKHsgLi4uaW5zdGFsbGVkLmlkZW50aWZpZXIsIHByZVJlbGVhc2U6ICEhaW5zdGFsbGVkLmxvY2FsPy5wcmVSZWxlYXNlLCBjdXJyZW50VmVyc2lvbjogaW5zdGFsbGVkLmlzQnVpbHRpbiA/IGluc3RhbGxlZC52ZXJzaW9uIDogdW5kZWZpbmVkIH0pO1xuXHRcdH1cblx0XHRpZiAoaW5mb3MubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB0YXJnZXRQbGF0Zm9ybSA9IGF3YWl0IGV4dGVuc2lvbnNbMF0uc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldFRhcmdldFBsYXRmb3JtKCk7XG5cdFx0XHR0eXBlIEdhbGxlcnlTZXJ2aWNlVXBkYXRlc0NoZWNrQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0XHRjb21tZW50OiAnUmVwb3J0IHdoZW4gYSByZXF1ZXN0IGlzIG1hZGUgdG8gY2hlY2sgZm9yIHVwZGF0ZXMgb2YgZXh0ZW5zaW9ucyc7XG5cdFx0XHRcdGNvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnTnVtYmVyIG9mIGV4dGVuc2lvbnMgdG8gY2hlY2sgdXBkYXRlJyB9O1xuXHRcdFx0fTtcblx0XHRcdHR5cGUgR2FsbGVyeVNlcnZpY2VVcGRhdGVzQ2hlY2tFdmVudCA9IHtcblx0XHRcdFx0Y291bnQ6IG51bWJlcjtcblx0XHRcdH07XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxHYWxsZXJ5U2VydmljZVVwZGF0ZXNDaGVja0V2ZW50LCBHYWxsZXJ5U2VydmljZVVwZGF0ZXNDaGVja0NsYXNzaWZpY2F0aW9uPignZ2FsbGVyeVNlcnZpY2U6Y2hlY2tpbmdGb3JVcGRhdGVzJywge1xuXHRcdFx0XHRjb3VudDogaW5mb3MubGVuZ3RoLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYENoZWNraW5nIHVwZGF0ZXMgZm9yIGV4dGVuc2lvbnNgLCBpbmZvcy5tYXAoZSA9PiBlLmlkKS5qb2luKCcsICcpKTtcblx0XHRcdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKGluZm9zLCB7IHRhcmdldFBsYXRmb3JtLCBjb21wYXRpYmxlOiB0cnVlLCBwcm9kdWN0VmVyc2lvbjogdGhpcy5nZXRQcm9kdWN0VmVyc2lvbigpIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0aWYgKGdhbGxlcnlFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnN5bmNJbnN0YWxsZWRFeHRlbnNpb25zV2l0aEdhbGxlcnkoZ2FsbGVyeUV4dGVuc2lvbnMsIGluZm9zKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyB1cGRhdGVBbGwoKTogUHJvbWlzZTxJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10+IHtcblx0XHRjb25zdCB0b1VwZGF0ZTogSW5zdGFsbEV4dGVuc2lvbkluZm9bXSA9IFtdO1xuXHRcdHRoaXMub3V0ZGF0ZWQuZm9yRWFjaCgoZXh0ZW5zaW9uKSA9PiB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLmdhbGxlcnkpIHtcblx0XHRcdFx0dG9VcGRhdGUucHVzaCh7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiBleHRlbnNpb24uZ2FsbGVyeSxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb24uVXBkYXRlLFxuXHRcdFx0XHRcdFx0aW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiBleHRlbnNpb24ubG9jYWw/LmlzUHJlUmVsZWFzZVZlcnNpb24sXG5cdFx0XHRcdFx0XHRwcm9maWxlTG9jYXRpb246IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRpc0FwcGxpY2F0aW9uU2NvcGVkOiBleHRlbnNpb24ubG9jYWw/LmlzQXBwbGljYXRpb25TY29wZWQsXG5cdFx0XHRcdFx0XHRjb250ZXh0OiB7IFtFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1BVQkxJU0hFUl9UUlVTVF9DT05URVhUXTogdHJ1ZSB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnModG9VcGRhdGUpO1xuXHR9XG5cblx0YXN5bmMgZG93bmxvYWRWU0lYKGV4dGVuc2lvbklkOiBzdHJpbmcsIHZlcnNpb25LaW5kOiAncHJlcmVsZWFzZScgfCAncmVsZWFzZScgfCAnYW55Jyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCB2ZXJzaW9uOiBJR2FsbGVyeUV4dGVuc2lvblZlcnNpb24gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHZlcnNpb25LaW5kID09PSAnYW55Jykge1xuXHRcdFx0dmVyc2lvbiA9IGF3YWl0IHRoaXMucGlja1ZlcnNpb25Ub0Rvd25sb2FkKGV4dGVuc2lvbklkKTtcblx0XHRcdGlmICghdmVyc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uSW5mbyA9IHZlcnNpb24gPyB7IGlkOiBleHRlbnNpb25JZCwgdmVyc2lvbjogdmVyc2lvbi52ZXJzaW9uIH0gOiB7IGlkOiBleHRlbnNpb25JZCwgcHJlUmVsZWFzZTogdmVyc2lvbktpbmQgPT09ICdwcmVyZWxlYXNlJyB9O1xuXHRcdGNvbnN0IHF1ZXJ5T3B0aW9uczogSUV4dGVuc2lvblF1ZXJ5T3B0aW9ucyA9IHZlcnNpb24gPyB7fSA6IHsgY29tcGF0aWJsZTogdHJ1ZSB9O1xuXG5cdFx0bGV0IFtnYWxsZXJ5RXh0ZW5zaW9uXSA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbZXh0ZW5zaW9uSW5mb10sIHF1ZXJ5T3B0aW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKCFnYWxsZXJ5RXh0ZW5zaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdleHRlbnNpb24gbm90IGZvdW5kJywgXCJFeHRlbnNpb24gJ3swfScgbm90IGZvdW5kLlwiLCBleHRlbnNpb25JZCkpO1xuXHRcdH1cblxuXHRcdGxldCB0YXJnZXRQbGF0Zm9ybSA9IGdhbGxlcnlFeHRlbnNpb24ucHJvcGVydGllcy50YXJnZXRQbGF0Zm9ybTtcblx0XHRjb25zdCBvcHRpb25zID0gW107XG5cdFx0Zm9yIChjb25zdCB0YXJnZXRQbGF0Zm9ybSBvZiB2ZXJzaW9uPy50YXJnZXRQbGF0Zm9ybXMgPz8gZ2FsbGVyeUV4dGVuc2lvbi5hbGxUYXJnZXRQbGF0Zm9ybXMpIHtcblx0XHRcdGlmICh0YXJnZXRQbGF0Zm9ybSAhPT0gVGFyZ2V0UGxhdGZvcm0uVU5LTk9XTiAmJiB0YXJnZXRQbGF0Zm9ybSAhPT0gVGFyZ2V0UGxhdGZvcm0uVU5JVkVSU0FMKSB7XG5cdFx0XHRcdG9wdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IHRhcmdldFBsYXRmb3JtID09PSBUYXJnZXRQbGF0Zm9ybS5VTkRFRklORUQgPyBubHMubG9jYWxpemUoJ2FsbHBsYXRmb3JtcycsIFwiQWxsIFBsYXRmb3Jtc1wiKSA6IFRhcmdldFBsYXRmb3JtVG9TdHJpbmcodGFyZ2V0UGxhdGZvcm0pLFxuXHRcdFx0XHRcdGlkOiB0YXJnZXRQbGF0Zm9ybVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMubGVuZ3RoID4gMSkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgncGxhdGZvcm0gcGxhY2Vob2xkZXInLCBcIlBsZWFzZSBzZWxlY3QgdGhlIHBsYXRmb3JtIGZvciB3aGljaCB5b3Ugd2FudCB0byBkb3dubG9hZCB0aGUgVlNJWFwiKTtcblx0XHRcdGNvbnN0IG9wdGlvbiA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayhvcHRpb25zLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSksIHsgcGxhY2VIb2xkZXI6IG1lc3NhZ2UgfSk7XG5cdFx0XHRpZiAoIW9wdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0YXJnZXRQbGF0Zm9ybSA9IG9wdGlvbi5pZDtcblx0XHR9XG5cblx0XHRpZiAodGFyZ2V0UGxhdGZvcm0gIT09IGdhbGxlcnlFeHRlbnNpb24ucHJvcGVydGllcy50YXJnZXRQbGF0Zm9ybSkge1xuXHRcdFx0W2dhbGxlcnlFeHRlbnNpb25dID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKFtleHRlbnNpb25JbmZvXSwgeyAuLi5xdWVyeU9wdGlvbnMsIHRhcmdldFBsYXRmb3JtIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd09wZW5EaWFsb2coe1xuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnZG93bmxvYWQgdGl0bGUnLCBcIlNlbGVjdCBmb2xkZXIgdG8gZG93bmxvYWQgdGhlIFZTSVhcIiksXG5cdFx0XHRjYW5TZWxlY3RGaWxlczogZmFsc2UsXG5cdFx0XHRjYW5TZWxlY3RGb2xkZXJzOiB0cnVlLFxuXHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRvcGVuTGFiZWw6IG5scy5sb2NhbGl6ZSgnZG93bmxvYWQnLCBcIkRvd25sb2FkXCIpLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXN1bHQ/LlswXSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbiB9LCBhc3luYyBwcm9ncmVzcyA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBubHMubG9jYWxpemUoJ2Rvd25sb2FkaW5nLi4uJywgXCJEb3dubG9hZGluZyBWU0lYLi4uXCIpIH0pO1xuXHRcdFx0XHRjb25zdCBuYW1lID0gYCR7Z2FsbGVyeUV4dGVuc2lvbi5pZGVudGlmaWVyLmlkfS0ke2dhbGxlcnlFeHRlbnNpb24udmVyc2lvbn0ke3RhcmdldFBsYXRmb3JtICE9PSBUYXJnZXRQbGF0Zm9ybS5VTkRFRklORUQgJiYgdGFyZ2V0UGxhdGZvcm0gIT09IFRhcmdldFBsYXRmb3JtLlVOSVZFUlNBTCAmJiB0YXJnZXRQbGF0Zm9ybSAhPT0gVGFyZ2V0UGxhdGZvcm0uVU5LTk9XTiA/IGAtJHt0YXJnZXRQbGF0Zm9ybX1gIDogJyd9LnZzaXhgO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmRvd25sb2FkKGdhbGxlcnlFeHRlbnNpb24sIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aChyZXN1bHRbMF0sIG5hbWUpLCBJbnN0YWxsT3BlcmF0aW9uLk5vbmUpO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhubHMubG9jYWxpemUoJ2Rvd25sb2FkLmNvbXBsZXRlZCcsIFwiU3VjY2Vzc2Z1bGx5IGRvd25sb2FkZWQgdGhlIFZTSVhcIikpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgnZG93bmxvYWQuZmFpbGVkJywgXCJFcnJvciB3aGlsZSBkb3dubG9hZGluZyB0aGUgVlNJWDogezB9XCIsIGdldEVycm9yTWVzc2FnZShlcnJvcikpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcGlja1ZlcnNpb25Ub0Rvd25sb2FkKGV4dGVuc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPElHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFsbFZlcnNpb25zID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRBbGxWZXJzaW9ucyh7IGlkOiBleHRlbnNpb25JZCB9KTtcblx0XHRpZiAoIWFsbFZlcnNpb25zLmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmluZm8obmxzLmxvY2FsaXplKCdubyB2ZXJzaW9ucycsIFwiVGhpcyBleHRlbnNpb24gaGFzIG5vIG90aGVyIHZlcnNpb25zLlwiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGlja3MgPSBhbGxWZXJzaW9ucy5tYXAoKHYsIGkpID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiB2LnZlcnNpb24sXG5cdFx0XHRcdGxhYmVsOiB2LnZlcnNpb24sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgJHtmcm9tTm93KG5ldyBEYXRlKERhdGUucGFyc2Uodi5kYXRlKSksIHRydWUpfSR7di5pc1ByZVJlbGVhc2VWZXJzaW9uID8gYCAoJHtubHMubG9jYWxpemUoJ3ByZS1yZWxlYXNlJywgXCJwcmUtcmVsZWFzZVwiKX0pYCA6ICcnfWAsXG5cdFx0XHRcdGFyaWFMYWJlbDogYCR7di5pc1ByZVJlbGVhc2VWZXJzaW9uID8gJ1ByZS1SZWxlYXNlIHZlcnNpb24nIDogJ1JlbGVhc2UgdmVyc2lvbid9ICR7di52ZXJzaW9ufWAsXG5cdFx0XHRcdGRhdGE6IHYsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdGNvbnN0IHBpY2sgPSBhd2FpdCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsXG5cdFx0XHR7XG5cdFx0XHRcdHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ3NlbGVjdFZlcnNpb24nLCBcIlNlbGVjdCBWZXJzaW9uIHRvIERvd25sb2FkXCIpLFxuXHRcdFx0XHRtYXRjaE9uRGV0YWlsOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRyZXR1cm4gcGljaz8uZGF0YTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3luY0luc3RhbGxlZEV4dGVuc2lvbnNXaXRoR2FsbGVyeShnYWxsZXJ5OiBJR2FsbGVyeUV4dGVuc2lvbltdLCBmbGFnRXh0ZW5zaW9uc01pc3NpbmdGcm9tR2FsbGVyeT86IElFeHRlbnNpb25JbmZvW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb25zOiBFeHRlbnNpb25zW10gPSBbXTtcblx0XHRpZiAodGhpcy5sb2NhbEV4dGVuc2lvbnMpIHtcblx0XHRcdGV4dGVuc2lvbnMucHVzaCh0aGlzLmxvY2FsRXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnJlbW90ZUV4dGVuc2lvbnMpIHtcblx0XHRcdGV4dGVuc2lvbnMucHVzaCh0aGlzLnJlbW90ZUV4dGVuc2lvbnMpO1xuXHRcdH1cblx0XHRpZiAodGhpcy53ZWJFeHRlbnNpb25zKSB7XG5cdFx0XHRleHRlbnNpb25zLnB1c2godGhpcy53ZWJFeHRlbnNpb25zKTtcblx0XHR9XG5cdFx0aWYgKCFleHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoZXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9ucyA9PiBleHRlbnNpb25zLnN5bmNJbnN0YWxsZWRFeHRlbnNpb25zV2l0aEdhbGxlcnkoZ2FsbGVyeSwgdGhpcy5nZXRQcm9kdWN0VmVyc2lvbigpLCBmbGFnRXh0ZW5zaW9uc01pc3NpbmdGcm9tR2FsbGVyeSkpKTtcblx0XHRpZiAodGhpcy5vdXRkYXRlZC5sZW5ndGgpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBBdXRvIHVwZGF0aW5nIG91dGRhdGVkIGV4dGVuc2lvbnMuYCwgdGhpcy5vdXRkYXRlZC5tYXAoZSA9PiBlLmlkZW50aWZpZXIuaWQpLmpvaW4oJywgJykpO1xuXHRcdFx0dGhpcy5ldmVudHVhbGx5QXV0b1VwZGF0ZUV4dGVuc2lvbnMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGlzQXV0b0NoZWNrVXBkYXRlc0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMubWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlLmlzQ29ubmVjdGlvbk1ldGVyZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQXV0b0NoZWNrVXBkYXRlc0NvbmZpZ3VyYXRpb25LZXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBldmVudHVhbGx5Q2hlY2tGb3JVcGRhdGVzKGltbWVkaWF0ZSA9IGZhbHNlKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVzQ2hlY2tEZWxheWVyLmNhbmNlbCgpO1xuXHRcdHRoaXMudXBkYXRlc0NoZWNrRGVsYXllci50cmlnZ2VyKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzQXV0b0NoZWNrVXBkYXRlc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNoZWNrRm9yVXBkYXRlcygpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5ldmVudHVhbGx5Q2hlY2tGb3JVcGRhdGVzKCk7XG5cdFx0fSwgaW1tZWRpYXRlID8gMCA6IHRoaXMuZ2V0VXBkYXRlc0NoZWNrSW50ZXJ2YWwoKSkudGhlbih1bmRlZmluZWQsIGVyciA9PiBudWxsKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VXBkYXRlc0NoZWNrSW50ZXJ2YWwoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5ID09PSAnaW5zaWRlcicgJiYgdGhpcy5nZXRQcm9kdWN0VXBkYXRlVmVyc2lvbigpKSB7XG5cdFx0XHRyZXR1cm4gMTAwMCAqIDYwICogNjAgKiAxOyAvLyAxIGhvdXJcblx0XHR9XG5cdFx0cmV0dXJuIEV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLlVwZGF0ZXNDaGVja0ludGVydmFsO1xuXHR9XG5cblx0cHJpdmF0ZSBldmVudHVhbGx5QXV0b1VwZGF0ZUV4dGVuc2lvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5hdXRvVXBkYXRlRGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMuYXV0b1VwZGF0ZUV4dGVuc2lvbnMoKSlcblx0XHRcdC50aGVuKHVuZGVmaW5lZCwgZXJyID0+IG51bGwpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhdXRvVXBkYXRlQnVpbHRpbkV4dGVuc2lvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMubWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlLmlzQ29ubmVjdGlvbk1ldGVyZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5jaGVja0ZvclVwZGF0ZXModW5kZWZpbmVkLCB0cnVlKTtcblx0XHRjb25zdCB0b1VwZGF0ZSA9IHRoaXMub3V0ZGF0ZWQuZmlsdGVyKGUgPT4gZS5pc0J1aWx0aW4pO1xuXHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQodG9VcGRhdGUubWFwKGUgPT4gdGhpcy5pbnN0YWxsKGUsIGUubG9jYWw/LnByZVJlbGVhc2UgPyB7IGluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbjogdHJ1ZSB9IDogdW5kZWZpbmVkKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzeW5jUGlubmVkQnVpbHRpbkV4dGVuc2lvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5mb3M6IElFeHRlbnNpb25JbmZvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGluc3RhbGxlZCBvZiB0aGlzLmxvY2FsKSB7XG5cdFx0XHRpZiAoaW5zdGFsbGVkLmlzQnVpbHRpbiAmJiBpbnN0YWxsZWQubG9jYWw/LnBpbm5lZCAmJiBpbnN0YWxsZWQubG9jYWw/LmlkZW50aWZpZXIudXVpZCkge1xuXHRcdFx0XHRpbmZvcy5wdXNoKHsgLi4uaW5zdGFsbGVkLmlkZW50aWZpZXIsIHZlcnNpb246IGluc3RhbGxlZC52ZXJzaW9uIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoaW5mb3MubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBnYWxsZXJ5RXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhpbmZvcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAoZ2FsbGVyeUV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc3luY0luc3RhbGxlZEV4dGVuc2lvbnNXaXRoR2FsbGVyeShnYWxsZXJ5RXh0ZW5zaW9ucyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhdXRvVXBkYXRlRXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5tZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UuaXNDb25uZWN0aW9uTWV0ZXJlZCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbRXh0ZW5zaW9uc106IFNraXBwaW5nIGF1dG8tdXBkYXRlIGJlY2F1c2UgY29ubmVjdGlvbiBpcyBtZXRlcmVkJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9VcGRhdGU6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGRpc2FibGVkQXV0b1VwZGF0ZSA9IFtdO1xuXHRcdGNvbnN0IGNvbnNlbnRSZXF1aXJlZCA9IFtdO1xuXHRcdGxldCBzb29uZXN0RGVsYXlSZW1haW5pbmcgPSBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUjtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiB0aGlzLm91dGRhdGVkKSB7XG5cdFx0XHRpZiAoIXRoaXMuc2hvdWxkQXV0b1VwZGF0ZUV4dGVuc2lvbihleHRlbnNpb24pKSB7XG5cdFx0XHRcdGRpc2FibGVkQXV0b1VwZGF0ZS5wdXNoKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBOZXcgdmVyc2lvbnMgYXJlIGF1dG8gdXBkYXRlZCBvbmx5IGFmdGVyIHRoZSBkZWxheSB3aW5kb3cgaGFzIHBhc3NlZCBzaW5jZSB0aGV5IHdlcmUgcHVibGlzaGVkLlxuXHRcdFx0aWYgKCFleHRlbnNpb24ubG9jYWw/LmZvcmNlQXV0b1VwZGF0ZSkge1xuXHRcdFx0XHRjb25zdCBkZWxheVJlbWFpbmluZyA9IHRoaXMuZ2V0QXV0b1VwZGF0ZURlbGF5UmVtYWluaW5nKGV4dGVuc2lvbik7XG5cdFx0XHRcdGlmIChkZWxheVJlbWFpbmluZyA+IDApIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0F1dG8gdXBkYXRlIGRlbGF5ZWQgZm9yIGV4dGVuc2lvbicsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHRzb29uZXN0RGVsYXlSZW1haW5pbmcgPSBNYXRoLm1pbihzb29uZXN0RGVsYXlSZW1haW5pbmcsIGRlbGF5UmVtYWluaW5nKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGF3YWl0IHRoaXMuc2hvdWxkUmVxdWlyZUNvbnNlbnRUb1VwZGF0ZShleHRlbnNpb24pKSB7XG5cdFx0XHRcdGNvbnNlbnRSZXF1aXJlZC5wdXNoKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0b1VwZGF0ZS5wdXNoKGV4dGVuc2lvbik7XG5cdFx0fVxuXG5cdFx0aWYgKHNvb25lc3REZWxheVJlbWFpbmluZyA8IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSB7XG5cdFx0XHR0aGlzLmRlbGF5ZWRBdXRvVXBkYXRlQ2hlY2tUaW1lci52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHRoaXMuZXZlbnR1YWxseUNoZWNrRm9yVXBkYXRlcyh0cnVlKSwgc29vbmVzdERlbGF5UmVtYWluaW5nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kZWxheWVkQXV0b1VwZGF0ZUNoZWNrVGltZXIudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGRpc2FibGVkQXV0b1VwZGF0ZS5sZW5ndGgpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnQXV0byB1cGRhdGUgZGlzYWJsZWQgZm9yIGV4dGVuc2lvbnMnLCBkaXNhYmxlZEF1dG9VcGRhdGUuam9pbignLCAnKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnNlbnRSZXF1aXJlZC5sZW5ndGgpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdBdXRvIHVwZGF0ZSBjb25zZW50IHJlcXVpcmVkIGZvciBleHRlbnNpb25zJywgY29uc2VudFJlcXVpcmVkLmpvaW4oJywgJykpO1xuXHRcdH1cblxuXHRcdGlmICghdG9VcGRhdGUubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvZHVjdFZlcnNpb24gPSB0aGlzLmdldFByb2R1Y3RWZXJzaW9uKCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZCh0b1VwZGF0ZS5tYXAoZSA9PiB0aGlzLmluc3RhbGwoZSwgZS5sb2NhbD8ucHJlUmVsZWFzZSA/IHsgaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiB0cnVlLCBwcm9kdWN0VmVyc2lvbiB9IDogeyBwcm9kdWN0VmVyc2lvbiB9KSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQcm9kdWN0VmVyc2lvbigpOiBJUHJvZHVjdFZlcnNpb24ge1xuXHRcdHJldHVybiB0aGlzLmdldFByb2R1Y3RVcGRhdGVWZXJzaW9uKCkgPz8gdGhpcy5nZXRQcm9kdWN0Q3VycmVudFZlcnNpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHJvZHVjdEN1cnJlbnRWZXJzaW9uKCk6IElQcm9kdWN0VmVyc2lvbiB7XG5cdFx0cmV0dXJuIHsgdmVyc2lvbjogdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLCBkYXRlOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRhdGUgfTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHJvZHVjdFVwZGF0ZVZlcnNpb24oKTogSVByb2R1Y3RWZXJzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRzd2l0Y2ggKHRoaXMudXBkYXRlU2VydmljZS5zdGF0ZS50eXBlKSB7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5BdmFpbGFibGVGb3JEb3dubG9hZDpcblx0XHRcdGNhc2UgU3RhdGVUeXBlLkRvd25sb2FkZWQ6XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5VcGRhdGluZzpcblx0XHRcdGNhc2UgU3RhdGVUeXBlLlJlYWR5OiB7XG5cdFx0XHRcdGNvbnN0IHZlcnNpb24gPSB0aGlzLnVwZGF0ZVNlcnZpY2Uuc3RhdGUudXBkYXRlLnByb2R1Y3RWZXJzaW9uO1xuXHRcdFx0XHRpZiAodmVyc2lvbiAmJiBzZW12ZXIudmFsaWQodmVyc2lvbikpIHtcblx0XHRcdFx0XHRyZXR1cm4geyB2ZXJzaW9uLCBkYXRlOiB0aGlzLnVwZGF0ZVNlcnZpY2Uuc3RhdGUudXBkYXRlLnRpbWVzdGFtcCA/IG5ldyBEYXRlKHRoaXMudXBkYXRlU2VydmljZS5zdGF0ZS51cGRhdGUudGltZXN0YW1wKS50b0lTT1N0cmluZygpIDogdW5kZWZpbmVkIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkQXV0b1VwZGF0ZUV4dGVuc2lvbihleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHtcblx0XHRpZiAoZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mbz8uZGlzYWxsb3dJbnN0YWxsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGV4dGVuc2lvbi5sb2NhbD8uZm9yY2VBdXRvVXBkYXRlKSB7XG5cdFx0XHQvLyBFeHRlbnNpb25zIG1hcmtlZCBmb3IgYXV0by11cGRhdGUgYXJlIGFsd2F5cyBhdXRvLXVwZGF0ZWRcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF1dG9VcGRhdGVWYWx1ZSA9IHRoaXMuZ2V0QXV0b1VwZGF0ZVZhbHVlKCk7XG5cblx0XHRpZiAoYXV0b1VwZGF0ZVZhbHVlID09PSAnb2ZmJykge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uc1RvQXV0b1VwZGF0ZSA9IHRoaXMuZ2V0RW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zKCk7XG5cdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uc1RvQXV0b1VwZGF0ZS5pbmNsdWRlcyhleHRlbnNpb25JZCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5pc0F1dG9VcGRhdGVFbmFibGVkRm9yUHVibGlzaGVyKGV4dGVuc2lvbi5wdWJsaXNoZXIpICYmICFleHRlbnNpb25zVG9BdXRvVXBkYXRlLmluY2x1ZGVzKGAtJHtleHRlbnNpb25JZH1gKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uLnBpbm5lZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMgPSB0aGlzLmdldERpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMoKTtcblx0XHRpZiAoZGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5pbmNsdWRlcyhleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIEF1dG8tdXBkYXRlIGlzIG9uOyBvbmx5IHVwZGF0ZSBlbmFibGVkIGV4dGVuc2lvbnMuXG5cdFx0cmV0dXJuIGV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgIT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEdsb2JhbGx5ICYmIGV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgIT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZTtcblx0fVxuXG5cdGFzeW5jIHNob3VsZFJlcXVpcmVDb25zZW50VG9VcGRhdGUoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIWV4dGVuc2lvbi5vdXRkYXRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghZXh0ZW5zaW9uLmdhbGxlcnkgfHwgIWV4dGVuc2lvbi5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb24ubG9jYWwuaWRlbnRpZmllci51dWlkICYmIGV4dGVuc2lvbi5sb2NhbC5pZGVudGlmaWVyLnV1aWQgIT09IGV4dGVuc2lvbi5nYWxsZXJ5LmlkZW50aWZpZXIudXVpZCkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnY29uc2VudFJlcXVpcmVkVG9VcGRhdGVSZXB1Ymxpc2hlZEV4dGVuc2lvbicsIFwiVGhlIG1hcmtldHBsYWNlIG1ldGFkYXRhIG9mIHRoaXMgZXh0ZW5zaW9uIGNoYW5nZWQsIGxpa2VseSBkdWUgdG8gYSByZS1wdWJsaXNoLlwiKTtcblx0XHR9XG5cblx0XHRpZiAoIWV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdC5lbmdpbmVzLnZzY29kZSB8fCBleHRlbnNpb24ubG9jYWwubWFuaWZlc3QubWFpbiB8fCBleHRlbnNpb24ubG9jYWwubWFuaWZlc3QuYnJvd3Nlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpc0RlZmluZWQoZXh0ZW5zaW9uLmdhbGxlcnkucHJvcGVydGllcz8uZXhlY3V0ZXNDb2RlKSkge1xuXHRcdFx0aWYgKCFleHRlbnNpb24uZ2FsbGVyeS5wcm9wZXJ0aWVzLmV4ZWN1dGVzQ29kZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0ID0gZXh0ZW5zaW9uIGluc3RhbmNlb2YgRXh0ZW5zaW9uXG5cdFx0XHRcdD8gYXdhaXQgZXh0ZW5zaW9uLmdldEdhbGxlcnlNYW5pZmVzdCgpXG5cdFx0XHRcdDogYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRNYW5pZmVzdChleHRlbnNpb24uZ2FsbGVyeSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAoIW1hbmlmZXN0Py5tYWluICYmICFtYW5pZmVzdD8uYnJvd3Nlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnY29uc2VudFJlcXVpcmVkVG9VcGRhdGUnLCBcIlRoZSB1cGRhdGUgZm9yIHswfSBleHRlbnNpb24gaW50cm9kdWNlcyBleGVjdXRhYmxlIGNvZGUsIHdoaWNoIGlzIG5vdCBwcmVzZW50IGluIHRoZSBjdXJyZW50bHkgaW5zdGFsbGVkIHZlcnNpb24uXCIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSk7XG5cdH1cblxuXHRpc0F1dG9VcGRhdGVFbmFibGVkRm9yKGV4dGVuc2lvbk9yUHVibGlzaGVyOiBJRXh0ZW5zaW9uIHwgc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKGlzU3RyaW5nKGV4dGVuc2lvbk9yUHVibGlzaGVyKSkge1xuXHRcdFx0aWYgKEVYVEVOU0lPTl9JREVOVElGSUVSX1JFR0VYLnRlc3QoZXh0ZW5zaW9uT3JQdWJsaXNoZXIpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgcHVibGlzaGVyIHN0cmluZywgZm91bmQgZXh0ZW5zaW9uIGlkZW50aWZpZXInKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlzQXV0b1VwZGF0ZUVuYWJsZWQoKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmlzQXV0b1VwZGF0ZUVuYWJsZWRGb3JQdWJsaXNoZXIoZXh0ZW5zaW9uT3JQdWJsaXNoZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5zaG91bGRBdXRvVXBkYXRlRXh0ZW5zaW9uKGV4dGVuc2lvbk9yUHVibGlzaGVyKTtcblx0fVxuXG5cdHByaXZhdGUgaXNBdXRvVXBkYXRlRW5hYmxlZEZvclB1Ymxpc2hlcihwdWJsaXNoZXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHB1Ymxpc2hlcnNUb0F1dG9VcGRhdGUgPSB0aGlzLmdldFB1Ymxpc2hlcnNUb0F1dG9VcGRhdGUoKTtcblx0XHRyZXR1cm4gcHVibGlzaGVyc1RvQXV0b1VwZGF0ZS5pbmNsdWRlcyhwdWJsaXNoZXIudG9Mb3dlckNhc2UoKSk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVBdXRvVXBkYXRlRW5hYmxlbWVudEZvcihleHRlbnNpb25PclB1Ymxpc2hlcjogSUV4dGVuc2lvbiB8IHN0cmluZywgZW5hYmxlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaXNBdXRvVXBkYXRlRW5hYmxlZCgpKSB7XG5cdFx0XHRpZiAoaXNTdHJpbmcoZXh0ZW5zaW9uT3JQdWJsaXNoZXIpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgZXh0ZW5zaW9uLCBmb3VuZCBwdWJsaXNoZXIgc3RyaW5nJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zID0gdGhpcy5nZXREaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zKCk7XG5cdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IGV4dGVuc2lvbk9yUHVibGlzaGVyLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbkluZGV4ID0gZGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5pbmRleE9mKGV4dGVuc2lvbklkKTtcblx0XHRcdGlmIChlbmFibGUpIHtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbkluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdGRpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMuc3BsaWNlKGV4dGVuc2lvbkluZGV4LCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGlmIChleHRlbnNpb25JbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRkaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNldERpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMoZGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucyk7XG5cdFx0XHRpZiAoZW5hYmxlICYmIGV4dGVuc2lvbk9yUHVibGlzaGVyLmxvY2FsICYmIGV4dGVuc2lvbk9yUHVibGlzaGVyLnBpbm5lZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnVwZGF0ZU1ldGFkYXRhKGV4dGVuc2lvbk9yUHVibGlzaGVyLmxvY2FsLCB7IHBpbm5lZDogZmFsc2UgfSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKGV4dGVuc2lvbk9yUHVibGlzaGVyKTtcblx0XHR9XG5cblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucyA9IHRoaXMuZ2V0RW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zKCk7XG5cdFx0XHRpZiAoaXNTdHJpbmcoZXh0ZW5zaW9uT3JQdWJsaXNoZXIpKSB7XG5cdFx0XHRcdGlmIChFWFRFTlNJT05fSURFTlRJRklFUl9SRUdFWC50ZXN0KGV4dGVuc2lvbk9yUHVibGlzaGVyKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgcHVibGlzaGVyIHN0cmluZywgZm91bmQgZXh0ZW5zaW9uIGlkZW50aWZpZXInKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRleHRlbnNpb25PclB1Ymxpc2hlciA9IGV4dGVuc2lvbk9yUHVibGlzaGVyLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGlmICh0aGlzLmlzQXV0b1VwZGF0ZUVuYWJsZWRGb3IoZXh0ZW5zaW9uT3JQdWJsaXNoZXIpICE9PSBlbmFibGUpIHtcblx0XHRcdFx0XHRpZiAoZW5hYmxlKSB7XG5cdFx0XHRcdFx0XHRlbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMucHVzaChleHRlbnNpb25PclB1Ymxpc2hlcik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlmIChlbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMuaW5jbHVkZXMoZXh0ZW5zaW9uT3JQdWJsaXNoZXIpKSB7XG5cdFx0XHRcdFx0XHRcdGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5zcGxpY2UoZW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zLmluZGV4T2YoZXh0ZW5zaW9uT3JQdWJsaXNoZXIpLCAxKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5zZXRFbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMoZW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zKTtcblx0XHRcdFx0Zm9yIChjb25zdCBlIG9mIHRoaXMuaW5zdGFsbGVkKSB7XG5cdFx0XHRcdFx0aWYgKGUucHVibGlzaGVyLnRvTG93ZXJDYXNlKCkgPT09IGV4dGVuc2lvbk9yUHVibGlzaGVyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBleHRlbnNpb25PclB1Ymxpc2hlci5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGNvbnN0IGVuYWJsZUF1dG9VcGRhdGVzRm9yUHVibGlzaGVyID0gdGhpcy5pc0F1dG9VcGRhdGVFbmFibGVkRm9yKGV4dGVuc2lvbk9yUHVibGlzaGVyLnB1Ymxpc2hlci50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdFx0Y29uc3QgZW5hYmxlQXV0b1VwZGF0ZXNGb3JFeHRlbnNpb24gPSBlbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMuaW5jbHVkZXMoZXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHRjb25zdCBkaXNhYmxlQXV0b1VwZGF0ZXNGb3JFeHRlbnNpb24gPSBlbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMuaW5jbHVkZXMoYC0ke2V4dGVuc2lvbklkfWApO1xuXG5cdFx0XHRcdGlmIChlbmFibGUpIHtcblx0XHRcdFx0XHRpZiAoZGlzYWJsZUF1dG9VcGRhdGVzRm9yRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0XHRlbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMuc3BsaWNlKGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5pbmRleE9mKGAtJHtleHRlbnNpb25JZH1gKSwgMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlbmFibGVBdXRvVXBkYXRlc0ZvclB1Ymxpc2hlcikge1xuXHRcdFx0XHRcdFx0aWYgKGVuYWJsZUF1dG9VcGRhdGVzRm9yRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0XHRcdGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5zcGxpY2UoZW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zLmluZGV4T2YoZXh0ZW5zaW9uSWQpLCAxKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKCFlbmFibGVBdXRvVXBkYXRlc0ZvckV4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0XHRlbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMucHVzaChleHRlbnNpb25JZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIERpc2FibGUgQXV0byBVcGRhdGVzXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGlmIChlbmFibGVBdXRvVXBkYXRlc0ZvckV4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0ZW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zLnNwbGljZShlbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMuaW5kZXhPZihleHRlbnNpb25JZCksIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZW5hYmxlQXV0b1VwZGF0ZXNGb3JQdWJsaXNoZXIpIHtcblx0XHRcdFx0XHRcdGlmICghZGlzYWJsZUF1dG9VcGRhdGVzRm9yRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0XHRcdGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5wdXNoKGAtJHtleHRlbnNpb25JZH1gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKGRpc2FibGVBdXRvVXBkYXRlc0ZvckV4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0XHRlbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMuc3BsaWNlKGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucy5pbmRleE9mKGAtJHtleHRlbnNpb25JZH1gKSwgMSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuc2V0RW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zKGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucyk7XG5cdFx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoZXh0ZW5zaW9uT3JQdWJsaXNoZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChlbmFibGUpIHtcblx0XHRcdHRoaXMuYXV0b1VwZGF0ZUV4dGVuc2lvbnMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkU2VsZWN0ZWRFeHRlbnNpb25Ub0F1dG9VcGRhdGVWYWx1ZUNoYW5nZSgpOiB2b2lkIHtcblx0XHRpZiAoXG5cdFx0XHR0aGlzLmVuYWJsZWRBdW90VXBkYXRlRXh0ZW5zaW9uc1ZhbHVlICE9PSB0aGlzLmdldEVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlKCkgLyogVGhpcyBjaGVja3MgaWYgY3VycmVudCB3aW5kb3cgY2hhbmdlZCB0aGUgdmFsdWUgb3Igbm90ICovXG5cdFx0XHR8fCB0aGlzLmRpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSAhPT0gdGhpcy5nZXREaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUoKSAvKiBUaGlzIGNoZWNrcyBpZiBjdXJyZW50IHdpbmRvdyBjaGFuZ2VkIHRoZSB2YWx1ZSBvciBub3QgKi9cblx0XHQpIHtcblx0XHRcdGNvbnN0IHVzZXJFeHRlbnNpb25zID0gdGhpcy5pbnN0YWxsZWQuZmlsdGVyKGUgPT4gIWUuaXNCdWlsdGluKTtcblx0XHRcdGNvbnN0IGdyb3VwQnkgPSAoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKTogSUV4dGVuc2lvbltdW10gPT4ge1xuXHRcdFx0XHRjb25zdCBzaG91bGRBdXRvVXBkYXRlOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdFx0Y29uc3Qgc2hvdWxkTm90QXV0b1VwZGF0ZTogSUV4dGVuc2lvbltdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5zaG91bGRBdXRvVXBkYXRlRXh0ZW5zaW9uKGV4dGVuc2lvbikpIHtcblx0XHRcdFx0XHRcdHNob3VsZEF1dG9VcGRhdGUucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzaG91bGROb3RBdXRvVXBkYXRlLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFtzaG91bGRBdXRvVXBkYXRlLCBzaG91bGROb3RBdXRvVXBkYXRlXTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IFt3YXNTaG91bGRBdXRvVXBkYXRlLCB3YXNTaG91bGROb3RBdXRvVXBkYXRlXSA9IGdyb3VwQnkodXNlckV4dGVuc2lvbnMpO1xuXHRcdFx0dGhpcy5fZW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9kaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBbc2hvdWxkQXV0b1VwZGF0ZSwgc2hvdWxkTm90QXV0b1VwZGF0ZV0gPSBncm91cEJ5KHVzZXJFeHRlbnNpb25zKTtcblxuXHRcdFx0Zm9yIChjb25zdCBlIG9mIHdhc1Nob3VsZEF1dG9VcGRhdGUgPz8gW10pIHtcblx0XHRcdFx0aWYgKHNob3VsZE5vdEF1dG9VcGRhdGU/LmluY2x1ZGVzKGUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZShlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBlIG9mIHdhc1Nob3VsZE5vdEF1dG9VcGRhdGUgPz8gW10pIHtcblx0XHRcdFx0aWYgKHNob3VsZEF1dG9VcGRhdGU/LmluY2x1ZGVzKGUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZShlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNhbkluc3RhbGwoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogUHJvbWlzZTx0cnVlIHwgSU1hcmtkb3duU3RyaW5nPiB7XG5cdFx0aWYgKCEoZXh0ZW5zaW9uIGluc3RhbmNlb2YgRXh0ZW5zaW9uKSkge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQobmxzLmxvY2FsaXplKCdub3QgYW4gZXh0ZW5zaW9uJywgXCJUaGUgcHJvdmlkZWQgb2JqZWN0IGlzIG5vdCBhbiBleHRlbnNpb24uXCIpKTtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uLmlzTWFsaWNpb3VzKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChubHMubG9jYWxpemUoJ21hbGljaW91cycsIFwiVGhpcyBleHRlbnNpb24gaXMgcmVwb3J0ZWQgdG8gYmUgcHJvYmxlbWF0aWMuXCIpKTtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mbz8uZGlzYWxsb3dJbnN0YWxsKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChubHMubG9jYWxpemUoJ2Rpc2FsbG93ZWQnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGRpc2FsbG93ZWQgdG8gYmUgaW5zdGFsbGVkLlwiKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGV4dGVuc2lvbi5nYWxsZXJ5KSB7XG5cdFx0XHRpZiAoIWV4dGVuc2lvbi5nYWxsZXJ5LmlzU2lnbmVkICYmIHNob3VsZFJlcXVpcmVSZXBvc2l0b3J5U2lnbmF0dXJlRm9yKGV4dGVuc2lvbi5wcml2YXRlLCBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KCkpKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KG5scy5sb2NhbGl6ZSgnbm90IHNpZ25lZCcsIFwiVGhpcyBleHRlbnNpb24gaXMgbm90IHNpZ25lZC5cIikpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsb2NhbFJlc3VsdCA9IHRoaXMubG9jYWxFeHRlbnNpb25zID8gYXdhaXQgdGhpcy5sb2NhbEV4dGVuc2lvbnMuY2FuSW5zdGFsbChleHRlbnNpb24uZ2FsbGVyeSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAobG9jYWxSZXN1bHQgPT09IHRydWUpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlbW90ZVJlc3VsdCA9IHRoaXMucmVtb3RlRXh0ZW5zaW9ucyA/IGF3YWl0IHRoaXMucmVtb3RlRXh0ZW5zaW9ucy5jYW5JbnN0YWxsKGV4dGVuc2lvbi5nYWxsZXJ5KSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChyZW1vdGVSZXN1bHQgPT09IHRydWUpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdlYlJlc3VsdCA9IHRoaXMud2ViRXh0ZW5zaW9ucyA/IGF3YWl0IHRoaXMud2ViRXh0ZW5zaW9ucy5jYW5JbnN0YWxsKGV4dGVuc2lvbi5nYWxsZXJ5KSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmICh3ZWJSZXN1bHQgPT09IHRydWUpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBsb2NhbFJlc3VsdCA/PyByZW1vdGVSZXN1bHQgPz8gd2ViUmVzdWx0ID8/IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQobmxzLmxvY2FsaXplKCdjYW5ub3QgYmUgaW5zdGFsbGVkJywgXCJDYW5ub3QgaW5zdGFsbCB0aGUgJ3swfScgZXh0ZW5zaW9uIGJlY2F1c2UgaXQgaXMgbm90IGF2YWlsYWJsZSBpbiB0aGlzIHNldHVwLlwiLCBleHRlbnNpb24uZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpKTtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uLnJlc291cmNlRXh0ZW5zaW9uICYmIGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY2FuSW5zdGFsbChleHRlbnNpb24ucmVzb3VyY2VFeHRlbnNpb24pID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChubHMubG9jYWxpemUoJ2Nhbm5vdCBiZSBpbnN0YWxsZWQnLCBcIkNhbm5vdCBpbnN0YWxsIHRoZSAnezB9JyBleHRlbnNpb24gYmVjYXVzZSBpdCBpcyBub3QgYXZhaWxhYmxlIGluIHRoaXMgc2V0dXAuXCIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSA/PyBleHRlbnNpb24uaWRlbnRpZmllci5pZCkpO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbChhcmc6IHN0cmluZyB8IFVSSSB8IElFeHRlbnNpb24sIGluc3RhbGxPcHRpb25zOiBJbnN0YWxsRXh0ZW5zaW9uT3B0aW9ucyA9IHt9LCBwcm9ncmVzc0xvY2F0aW9uPzogUHJvZ3Jlc3NMb2NhdGlvbiB8IHN0cmluZyk6IFByb21pc2U8SUV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuX2luc3RhbGwoYXJnLCBpbnN0YWxsT3B0aW9ucywgcHJvZ3Jlc3NMb2NhdGlvbik7XG5cblx0XHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgndW5rbm93bicsIFwiVW5hYmxlIHRvIGluc3RhbGwgZXh0ZW5zaW9uXCIpKTtcblx0XHR9XG5cblx0XHRpZiAoaW5zdGFsbE9wdGlvbnMuZW5hYmxlKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlIHx8IGV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEdsb2JhbGx5KSB7XG5cdFx0XHRcdGlmIChpbnN0YWxsT3B0aW9ucy5qdXN0aWZpY2F0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnZW5hYmxlRXh0ZW5zaW9uVGl0bGUnLCBcIkVuYWJsZSBFeHRlbnNpb25cIiksXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2VuYWJsZUV4dGVuc2lvbk1lc3NhZ2UnLCBcIldvdWxkIHlvdSBsaWtlIHRvIGVuYWJsZSAnezB9JyBleHRlbnNpb24/XCIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSksXG5cdFx0XHRcdFx0XHRkZXRhaWw6IGlzU3RyaW5nKGluc3RhbGxPcHRpb25zLmp1c3RpZmljYXRpb24pID8gaW5zdGFsbE9wdGlvbnMuanVzdGlmaWNhdGlvbiA6IGluc3RhbGxPcHRpb25zLmp1c3RpZmljYXRpb24ucmVhc29uLFxuXHRcdFx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogaXNTdHJpbmcoaW5zdGFsbE9wdGlvbnMuanVzdGlmaWNhdGlvbikgPyBubHMubG9jYWxpemUoeyBrZXk6ICdlbmFibGVCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkVuYWJsZSBFeHRlbnNpb25cIikgOiBubHMubG9jYWxpemUoeyBrZXk6ICdlbmFibGVCdXR0b25MYWJlbFdpdGhBY3Rpb24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZFbmFibGUgRXh0ZW5zaW9uIGFuZCB7MH1cIiwgaW5zdGFsbE9wdGlvbnMuanVzdGlmaWNhdGlvbi5hY3Rpb24pLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmICghcmVzdWx0LmNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2V0RW5hYmxlbWVudChleHRlbnNpb24sIGV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSA/IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlIDogRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLndhaXRVbnRpbEV4dGVuc2lvbklzRW5hYmxlZChleHRlbnNpb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiBleHRlbnNpb247XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbnN0YWxsKGFyZzogc3RyaW5nIHwgVVJJIHwgSUV4dGVuc2lvbiwgaW5zdGFsbE9wdGlvbnM6IEluc3RhbGxFeHRlbnNpb25PcHRpb25zID0ge30sIHByb2dyZXNzTG9jYXRpb24/OiBQcm9ncmVzc0xvY2F0aW9uIHwgc3RyaW5nKTogUHJvbWlzZTxJRXh0ZW5zaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IGluc3RhbGxhYmxlOiBVUkkgfCBJR2FsbGVyeUV4dGVuc2lvbiB8IElSZXNvdXJjZUV4dGVuc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzZXJ2ZXJzOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcltdIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGFyZyBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0aW5zdGFsbGFibGUgPSBhcmc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBpbnN0YWxsYWJsZUluZm86IElFeHRlbnNpb25JbmZvIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBJbnN0YWxsIGJ5IGlkXG5cdFx0XHRpZiAoaXNTdHJpbmcoYXJnKSkge1xuXHRcdFx0XHRleHRlbnNpb24gPSB0aGlzLmxvY2FsLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQ6IGFyZyB9KSk7XG5cdFx0XHRcdGlmIChleHRlbnNpb24/LmlzQnVpbHRpbikge1xuXHRcdFx0XHRcdGlmICh0aGlzLnByb2R1Y3RTZXJ2aWNlLmJ1aWx0SW5FeHRlbnNpb25zRW5hYmxlZFdpdGhBdXRvVXBkYXRlcz8uc29tZShpZCA9PiBpZC50b0xvd2VyQ2FzZSgpID09PSBhcmcudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBleHRlbnNpb247XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGluc3RhbGxhYmxlSW5mbyA9IHsgaWQ6IGFyZywgdmVyc2lvbjogaW5zdGFsbE9wdGlvbnMudmVyc2lvbiwgcHJlUmVsZWFzZTogaW5zdGFsbE9wdGlvbnMuaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uID8/IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UucHJlZmVyUHJlUmVsZWFzZXMgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gSW5zdGFsbCBieSBnYWxsZXJ5XG5cdFx0XHRlbHNlIGlmIChhcmcuZ2FsbGVyeSkge1xuXHRcdFx0XHRleHRlbnNpb24gPSBhcmc7XG5cdFx0XHRcdGdhbGxlcnkgPSBhcmcuZ2FsbGVyeTtcblx0XHRcdFx0aWYgKGluc3RhbGxPcHRpb25zLnZlcnNpb24gJiYgaW5zdGFsbE9wdGlvbnMudmVyc2lvbiAhPT0gZ2FsbGVyeT8udmVyc2lvbikge1xuXHRcdFx0XHRcdGluc3RhbGxhYmxlSW5mbyA9IHsgaWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCB2ZXJzaW9uOiBpbnN0YWxsT3B0aW9ucy52ZXJzaW9uIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIEluc3RhbGwgYnkgcmVzb3VyY2Vcblx0XHRcdGVsc2UgaWYgKGFyZy5yZXNvdXJjZUV4dGVuc2lvbikge1xuXHRcdFx0XHRleHRlbnNpb24gPSBhcmc7XG5cdFx0XHRcdGluc3RhbGxhYmxlID0gYXJnLnJlc291cmNlRXh0ZW5zaW9uO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaW5zdGFsbGFibGVJbmZvKSB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldFBsYXRmb3JtID0gZXh0ZW5zaW9uPy5zZXJ2ZXIgPyBhd2FpdCBleHRlbnNpb24uc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldFRhcmdldFBsYXRmb3JtKCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGdhbGxlcnkgPSAoYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKFtpbnN0YWxsYWJsZUluZm9dLCB7IHRhcmdldFBsYXRmb3JtIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5hdCgwKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFleHRlbnNpb24gJiYgZ2FsbGVyeSkge1xuXHRcdFx0XHRleHRlbnNpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbiwgZXh0ID0+IHRoaXMuZ2V0RXh0ZW5zaW9uU3RhdGUoZXh0KSwgZXh0ID0+IHRoaXMuZ2V0UnVudGltZVN0YXRlKGV4dCksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBnYWxsZXJ5LCB1bmRlZmluZWQpO1xuXHRcdFx0XHQoPEV4dGVuc2lvbj5leHRlbnNpb24pLnNldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXh0ZW5zaW9uPy5pc01hbGljaW91cykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdtYWxpY2lvdXMnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIHJlcG9ydGVkIHRvIGJlIHByb2JsZW1hdGljLlwiKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChnYWxsZXJ5KSB7XG5cdFx0XHRcdC8vIElmIHJlcXVlc3RlZCB0byBpbnN0YWxsIGV2ZXJ5d2hlcmVcblx0XHRcdFx0Ly8gdGhlbiBpbnN0YWxsIHRoZSBleHRlbnNpb24gaW4gYWxsIHRoZSBzZXJ2ZXJzIHdoZXJlIGl0IGlzIG5vdCBpbnN0YWxsZWRcblx0XHRcdFx0aWYgKGluc3RhbGxPcHRpb25zLmluc3RhbGxFdmVyeXdoZXJlKSB7XG5cdFx0XHRcdFx0c2VydmVycyA9IFtdO1xuXHRcdFx0XHRcdGNvbnN0IGluc3RhbGxhYmxlU2VydmVycyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGFibGVTZXJ2ZXJzKGdhbGxlcnkpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uc1NlcnZlciBvZiB0aGlzLmV4dGVuc2lvbnNTZXJ2ZXJzKSB7XG5cdFx0XHRcdFx0XHRpZiAoaW5zdGFsbGFibGVTZXJ2ZXJzLmluY2x1ZGVzKGV4dGVuc2lvbnNTZXJ2ZXIuc2VydmVyKSAmJiAhZXh0ZW5zaW9uc1NlcnZlci5sb2NhbC5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBnYWxsZXJ5LmlkZW50aWZpZXIpKSkge1xuXHRcdFx0XHRcdFx0XHRzZXJ2ZXJzLnB1c2goZXh0ZW5zaW9uc1NlcnZlci5zZXJ2ZXIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBJZiByZXF1ZXN0ZWQgdG8gZW5hYmxlIGFuZCBleHRlbnNpb24gaXMgYWxyZWFkeSBpbnN0YWxsZWRcblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGV4dGVuc2lvbiBpcyBkaXNhYmxlZCBiZWNhdXNlIG9mIGV4dGVuc2lvbiBraW5kXG5cdFx0XHRcdC8vIElmIHNvLCBpbnN0YWxsIHRoZSBleHRlbnNpb24gaW4gdGhlIHNlcnZlciB0aGF0IGlzIGNvbXBhdGlibGUuXG5cdFx0XHRcdGVsc2UgaWYgKGluc3RhbGxPcHRpb25zLmVuYWJsZSAmJiBleHRlbnNpb24/LmxvY2FsKSB7XG5cdFx0XHRcdFx0c2VydmVycyA9IFtdO1xuXHRcdFx0XHRcdGlmIChleHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUV4dGVuc2lvbktpbmQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IFtpbnN0YWxsYWJsZVNlcnZlcl0gPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxhYmxlU2VydmVycyhnYWxsZXJ5KTtcblx0XHRcdFx0XHRcdGlmIChpbnN0YWxsYWJsZVNlcnZlcikge1xuXHRcdFx0XHRcdFx0XHRzZXJ2ZXJzLnB1c2goaW5zdGFsbGFibGVTZXJ2ZXIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXNlcnZlcnMgfHwgc2VydmVycy5sZW5ndGgpIHtcblx0XHRcdFx0aWYgKCFpbnN0YWxsYWJsZSkge1xuXHRcdFx0XHRcdGlmICghZ2FsbGVyeSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaWQgPSBpc1N0cmluZyhhcmcpID8gYXJnIDogKDxJRXh0ZW5zaW9uPmFyZykuaWRlbnRpZmllci5pZDtcblx0XHRcdFx0XHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLmdldEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCgpO1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVwb3J0SXNzdWVVcmkgPSBtYW5pZmVzdCA/IGdldEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFJlc291cmNlVXJpKG1hbmlmZXN0LCBFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VUeXBlLkNvbnRhY3RTdXBwb3J0VXJpKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdGNvbnN0IHJlcG9ydElzc3VlTWVzc2FnZSA9IHJlcG9ydElzc3VlVXJpID8gbmxzLmxvY2FsaXplKCdyZXBvcnQgaXNzdWUnLCBcIklmIHRoaXMgaXNzdWUgcGVyc2lzdHMsIHBsZWFzZSByZXBvcnQgaXQgYXQgezB9XCIsIHJlcG9ydElzc3VlVXJpLnRvU3RyaW5nKCkpIDogJyc7XG5cdFx0XHRcdFx0XHRpZiAoaW5zdGFsbE9wdGlvbnMudmVyc2lvbikge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdub3QgZm91bmQgdmVyc2lvbicsIFwiVGhlIGV4dGVuc2lvbiAnezB9JyBjYW5ub3QgYmUgaW5zdGFsbGVkIGJlY2F1c2UgdGhlIHJlcXVlc3RlZCB2ZXJzaW9uICd7MX0nIHdhcyBub3QgZm91bmQuXCIsIGlkLCBpbnN0YWxsT3B0aW9ucy52ZXJzaW9uKTtcblx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihyZXBvcnRJc3N1ZU1lc3NhZ2UgPyBgJHttZXNzYWdlfSAke3JlcG9ydElzc3VlTWVzc2FnZX1gIDogbWVzc2FnZSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5Ob3RGb3VuZCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdub3QgZm91bmQnLCBcIlRoZSBleHRlbnNpb24gJ3swfScgY2Fubm90IGJlIGluc3RhbGxlZCBiZWNhdXNlIGl0IHdhcyBub3QgZm91bmQuXCIsIGlkKTtcblx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihyZXBvcnRJc3N1ZU1lc3NhZ2UgPyBgJHttZXNzYWdlfSAke3JlcG9ydElzc3VlTWVzc2FnZX1gIDogbWVzc2FnZSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5Ob3RGb3VuZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGluc3RhbGxhYmxlID0gZ2FsbGVyeTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaW5zdGFsbE9wdGlvbnMudmVyc2lvbikge1xuXHRcdFx0XHRcdGluc3RhbGxPcHRpb25zLmluc3RhbGxHaXZlblZlcnNpb24gPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHRlbnNpb24/LmlzV29ya3NwYWNlU2NvcGVkKSB7XG5cdFx0XHRcdFx0aW5zdGFsbE9wdGlvbnMuaXNXb3Jrc3BhY2VTY29wZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGluc3RhbGxhYmxlKSB7XG5cdFx0XHRpZiAoaW5zdGFsbE9wdGlvbnMuanVzdGlmaWNhdGlvbikge1xuXHRcdFx0XHRjb25zdCBzeW5jQ2hlY2sgPSBpc1VuZGVmaW5lZChpbnN0YWxsT3B0aW9ucy5pc01hY2hpbmVTY29wZWQpICYmIHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkgJiYgdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc1Jlc291cmNlRW5hYmxlZChTeW5jUmVzb3VyY2UuRXh0ZW5zaW9ucyk7XG5cdFx0XHRcdGNvbnN0IGJ1dHRvbnM6IElQcm9tcHRCdXR0b248Ym9vbGVhbj5bXSA9IFtdO1xuXHRcdFx0XHRidXR0b25zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBpc1N0cmluZyhpbnN0YWxsT3B0aW9ucy5qdXN0aWZpY2F0aW9uKSB8fCAhaW5zdGFsbE9wdGlvbnMuanVzdGlmaWNhdGlvbi5hY3Rpb25cblx0XHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKHsga2V5OiAnaW5zdGFsbEJ1dHRvbkxhYmVsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmSW5zdGFsbCBFeHRlbnNpb25cIilcblx0XHRcdFx0XHRcdDogbmxzLmxvY2FsaXplKHsga2V5OiAnaW5zdGFsbEJ1dHRvbkxhYmVsV2l0aEFjdGlvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkluc3RhbGwgRXh0ZW5zaW9uIGFuZCB7MH1cIiwgaW5zdGFsbE9wdGlvbnMuanVzdGlmaWNhdGlvbi5hY3Rpb24pLCBydW46ICgpID0+IHRydWVcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0YnV0dG9ucy5wdXNoKHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnb3BlbicsIFwiT3BlbiBFeHRlbnNpb25cIiksIHJ1bjogKCkgPT4geyB0aGlzLm9wZW4oZXh0ZW5zaW9uISk7IHJldHVybiBmYWxzZTsgfSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0PGJvb2xlYW4+KHtcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdpbnN0YWxsRXh0ZW5zaW9uVGl0bGUnLCBcIkluc3RhbGwgRXh0ZW5zaW9uXCIpLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGV4dGVuc2lvbiA/IG5scy5sb2NhbGl6ZSgnaW5zdGFsbEV4dGVuc2lvbk1lc3NhZ2UnLCBcIldvdWxkIHlvdSBsaWtlIHRvIGluc3RhbGwgJ3swfScgZXh0ZW5zaW9uIGZyb20gJ3sxfSc/XCIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSwgZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lKSA6IG5scy5sb2NhbGl6ZSgnaW5zdGFsbFZTSVhNZXNzYWdlJywgXCJXb3VsZCB5b3UgbGlrZSB0byBpbnN0YWxsIHRoZSBleHRlbnNpb24/XCIpLFxuXHRcdFx0XHRcdGRldGFpbDogaXNTdHJpbmcoaW5zdGFsbE9wdGlvbnMuanVzdGlmaWNhdGlvbikgPyBpbnN0YWxsT3B0aW9ucy5qdXN0aWZpY2F0aW9uIDogaW5zdGFsbE9wdGlvbnMuanVzdGlmaWNhdGlvbi5yZWFzb24sXG5cdFx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlLFxuXHRcdFx0XHRcdGJ1dHRvbnMsXG5cdFx0XHRcdFx0Y2hlY2tib3g6IHN5bmNDaGVjayA/IHtcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3N5bmMgZXh0ZW5zaW9uJywgXCJTeW5jIHRoaXMgZXh0ZW5zaW9uXCIpLFxuXHRcdFx0XHRcdFx0Y2hlY2tlZDogdHJ1ZSxcblx0XHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKCFyZXN1bHQucmVzdWx0KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHN5bmNDaGVjaykge1xuXHRcdFx0XHRcdGluc3RhbGxPcHRpb25zLmlzTWFjaGluZVNjb3BlZCA9ICFyZXN1bHQuY2hlY2tib3hDaGVja2VkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoaW5zdGFsbGFibGUgaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5kb0luc3RhbGwodW5kZWZpbmVkLCAoKSA9PiB0aGlzLmluc3RhbGxGcm9tVlNJWChpbnN0YWxsYWJsZSwgaW5zdGFsbE9wdGlvbnMpLCBwcm9ncmVzc0xvY2F0aW9uKTtcblx0XHRcdH0gZWxzZSBpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGlmIChleHRlbnNpb24ucmVzb3VyY2VFeHRlbnNpb24pIHtcblx0XHRcdFx0XHRleHRlbnNpb24gPSBhd2FpdCB0aGlzLmRvSW5zdGFsbChleHRlbnNpb24sICgpID0+IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbFJlc291cmNlRXh0ZW5zaW9uKGluc3RhbGxhYmxlIGFzIElSZXNvdXJjZUV4dGVuc2lvbiwgaW5zdGFsbE9wdGlvbnMpLCBwcm9ncmVzc0xvY2F0aW9uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRleHRlbnNpb24gPSBhd2FpdCB0aGlzLmRvSW5zdGFsbChleHRlbnNpb24sICgpID0+IHRoaXMuaW5zdGFsbEZyb21HYWxsZXJ5KGV4dGVuc2lvbiEsIGluc3RhbGxhYmxlIGFzIElHYWxsZXJ5RXh0ZW5zaW9uLCBpbnN0YWxsT3B0aW9ucywgc2VydmVycyksIHByb2dyZXNzTG9jYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBleHRlbnNpb247XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsSW5TZXJ2ZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBzZXJ2ZXI6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLCBpbnN0YWxsT3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5kb0luc3RhbGwoZXh0ZW5zaW9uLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2NhbCA9IGV4dGVuc2lvbi5sb2NhbDtcblx0XHRcdGlmICghbG9jYWwpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHRlbnNpb24gbm90IGZvdW5kJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWV4dGVuc2lvbi5nYWxsZXJ5KSB7XG5cdFx0XHRcdGV4dGVuc2lvbiA9IChhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnMoW3sgLi4uZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHByZVJlbGVhc2U6IGxvY2FsLnByZVJlbGVhc2UgfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXSA/PyBleHRlbnNpb247XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLmdhbGxlcnkpIHtcblx0XHRcdFx0cmV0dXJuIHNlcnZlci5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUdhbGxlcnkoZXh0ZW5zaW9uLmdhbGxlcnksIHsgaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiBsb2NhbC5wcmVSZWxlYXNlLCAuLi5pbnN0YWxsT3B0aW9ucyB9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGFyZ2V0UGxhdGZvcm0gPSBhd2FpdCBzZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0VGFyZ2V0UGxhdGZvcm0oKTtcblx0XHRcdGlmICghaXNUYXJnZXRQbGF0Zm9ybUNvbXBhdGlibGUobG9jYWwudGFyZ2V0UGxhdGZvcm0sIFtsb2NhbC50YXJnZXRQbGF0Zm9ybV0sIHRhcmdldFBsYXRmb3JtKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdpbmNvbXBhdGlibGUnLCBcIkNhbid0IGluc3RhbGwgJ3swfScgZXh0ZW5zaW9uIGJlY2F1c2UgaXQgaXMgbm90IGNvbXBhdGlibGUuXCIsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZzaXggPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnppcChsb2NhbCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGwodnNpeCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHZzaXgpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGNhblNldExhbmd1YWdlKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmICghaXNXZWIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIWV4dGVuc2lvbi5nYWxsZXJ5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9jYWxlID0gZ2V0TG9jYWxlKGV4dGVuc2lvbi5nYWxsZXJ5KTtcblx0XHRpZiAoIWxvY2FsZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0YXN5bmMgc2V0TGFuZ3VhZ2UoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmNhblNldExhbmd1YWdlKGV4dGVuc2lvbikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2FuIG5vdCBzZXQgbGFuZ3VhZ2UnKTtcblx0XHR9XG5cdFx0Y29uc3QgbG9jYWxlID0gZ2V0TG9jYWxlKGV4dGVuc2lvbi5nYWxsZXJ5ISk7XG5cdFx0aWYgKGxvY2FsZSA9PT0gbGFuZ3VhZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbG9jYWxpemVkTGFuZ3VhZ2VOYW1lID0gZXh0ZW5zaW9uLmdhbGxlcnk/LnByb3BlcnRpZXM/LmxvY2FsaXplZExhbmd1YWdlcz8uWzBdO1xuXHRcdHJldHVybiB0aGlzLmxvY2FsZVNlcnZpY2Uuc2V0TG9jYWxlKHsgaWQ6IGxvY2FsZSwgZ2FsbGVyeUV4dGVuc2lvbjogZXh0ZW5zaW9uLmdhbGxlcnksIGV4dGVuc2lvbklkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgbGFiZWw6IGxvY2FsaXplZExhbmd1YWdlTmFtZSA/PyBleHRlbnNpb24uZGlzcGxheU5hbWUgfSk7XG5cdH1cblxuXHRzZXRFbmFibGVtZW50KGV4dGVuc2lvbnM6IElFeHRlbnNpb24gfCBJRXh0ZW5zaW9uW10sIGVuYWJsZW1lbnRTdGF0ZTogRW5hYmxlbWVudFN0YXRlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0ZXh0ZW5zaW9ucyA9IEFycmF5LmlzQXJyYXkoZXh0ZW5zaW9ucykgPyBleHRlbnNpb25zIDogW2V4dGVuc2lvbnNdO1xuXHRcdHJldHVybiB0aGlzLnByb21wdEFuZFNldEVuYWJsZW1lbnQoZXh0ZW5zaW9ucywgZW5hYmxlbWVudFN0YXRlKTtcblx0fVxuXG5cdGFzeW5jIHVuaW5zdGFsbChlOiBJRXh0ZW5zaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gZS5sb2NhbCA/IGUgOiB0aGlzLmxvY2FsLmZpbmQobG9jYWwgPT4gYXJlU2FtZUV4dGVuc2lvbnMobG9jYWwuaWRlbnRpZmllciwgZS5pZGVudGlmaWVyKSk7XG5cdFx0aWYgKCFleHRlbnNpb24/LmxvY2FsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgbG9jYWwnKTtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uLmxvY2FsLmlzQXBwbGljYXRpb25TY29wZWQgJiYgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCd1bmluc3RhbGxBcHBsaWNhdGlvblNjb3BlZCcsIFwiVW5pbnN0YWxsIEV4dGVuc2lvblwiKSxcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd1bmluc3RhbGxBcHBsaWNhdGlvblNjb3BlZE1lc3NhZ2UnLCBcIldvdWxkIHlvdSBsaWtlIHRvIFVuaW5zdGFsbCB7MH0gZnJvbSBhbGwgcHJvZmlsZXM/XCIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSksXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IG5scy5sb2NhbGl6ZSgndW5pbnN0YWxsQWxsUHJvZmlsZXMnLCBcIlVuaW5zdGFsbCAoQWxsIFByb2ZpbGVzKVwiKVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25zVG9Vbmluc3RhbGw6IFVuaW5zdGFsbEV4dGVuc2lvbkluZm9bXSA9IFt7IGV4dGVuc2lvbjogZXh0ZW5zaW9uLmxvY2FsIH1dO1xuXHRcdGlmICghYXJlU2FtZUV4dGVuc2lvbnMoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHsgaWQ6IHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudC5leHRlbnNpb25JZCB9KSkge1xuXHRcdFx0Zm9yIChjb25zdCBwYWNrRXh0ZW5zaW9uIG9mIHRoaXMuZ2V0QWxsUGFja2VkRXh0ZW5zaW9ucyhleHRlbnNpb24sIHRoaXMubG9jYWwpKSB7XG5cdFx0XHRcdGlmIChwYWNrRXh0ZW5zaW9uLmxvY2FsICYmICFleHRlbnNpb25zVG9Vbmluc3RhbGwuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHBhY2tFeHRlbnNpb24uaWRlbnRpZmllcikpKSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uc1RvVW5pbnN0YWxsLnB1c2goeyBleHRlbnNpb246IHBhY2tFeHRlbnNpb24ubG9jYWwgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBkZXBlbmRlbnRzOiBJTG9jYWxFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGxldCBleHRlbnNpb25zRnJvbUFsbFByb2ZpbGVzOiBbSUxvY2FsRXh0ZW5zaW9uLCBVUkldW10gfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCB7IGV4dGVuc2lvbiB9IG9mIGV4dGVuc2lvbnNUb1VuaW5zdGFsbCkge1xuXHRcdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9uczogW0lMb2NhbEV4dGVuc2lvbiwgVVJJIHwgdW5kZWZpbmVkXVtdID0gW107XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLmlzQXBwbGljYXRpb25TY29wZWQgJiYgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uc0Zyb21BbGxQcm9maWxlcykge1xuXHRcdFx0XHRcdGV4dGVuc2lvbnNGcm9tQWxsUHJvZmlsZXMgPSBbXTtcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5tYXAoYXN5bmMgcHJvZmlsZSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbnN0YWxsZWQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIsIHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgbG9jYWwgb2YgaW5zdGFsbGVkKSB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbnNGcm9tQWxsUHJvZmlsZXM/LnB1c2goW2xvY2FsLCBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZV0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpbnN0YWxsZWRFeHRlbnNpb25zLnB1c2goLi4uZXh0ZW5zaW9uc0Zyb21BbGxQcm9maWxlcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHsgbG9jYWwgfSBvZiB0aGlzLmxvY2FsKSB7XG5cdFx0XHRcdFx0aWYgKGxvY2FsKSB7XG5cdFx0XHRcdFx0XHRpbnN0YWxsZWRFeHRlbnNpb25zLnB1c2goW2xvY2FsLCB1bmRlZmluZWRdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgW2xvY2FsLCBwcm9maWxlTG9jYXRpb25dIG9mIGluc3RhbGxlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0aWYgKGFyZVNhbWVFeHRlbnNpb25zKGxvY2FsLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghbG9jYWwubWFuaWZlc3QuZXh0ZW5zaW9uRGVwZW5kZW5jaWVzIHx8IGxvY2FsLm1hbmlmZXN0LmV4dGVuc2lvbkRlcGVuZGVuY2llcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLm1hbmlmZXN0LmV4dGVuc2lvblBhY2s/LnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBsb2NhbC5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZGVwZW5kZW50cy5zb21lKGQgPT4gZC5tYW5pZmVzdC5leHRlbnNpb25QYWNrPy5zb21lKGlkID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQgfSwgbG9jYWwuaWRlbnRpZmllcikpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsb2NhbC5tYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXMuc29tZShkZXAgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHsgaWQ6IGRlcCB9KSkpIHtcblx0XHRcdFx0XHRkZXBlbmRlbnRzLnB1c2gobG9jYWwpO1xuXHRcdFx0XHRcdGV4dGVuc2lvbnNUb1VuaW5zdGFsbC5wdXNoKHsgZXh0ZW5zaW9uOiBsb2NhbCwgb3B0aW9uczogeyBwcm9maWxlTG9jYXRpb24gfSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkZXBlbmRlbnRzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCd1bmluc3RhbGxEZXBlbmRlbnRzJywgXCJVbmluc3RhbGwgRXh0ZW5zaW9uIHdpdGggRGVwZW5kZW50c1wiKSxcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bWVzc2FnZTogdGhpcy5nZXRFcnJvck1lc3NhZ2VGb3JVbmluc3RhbGxpbmdBbkV4dGVuc2lvbldpdGhEZXBlbmRlbnRzKGV4dGVuc2lvbiwgZGVwZW5kZW50cyksXG5cdFx0XHRcdGJ1dHRvbnM6IFt7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgndW5pbnN0YWxsQWxsJywgXCJVbmluc3RhbGwgQWxsXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdHJ1ZVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBmYWxzZVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5FeHRlbnNpb25zLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgndW5pbnN0YWxsaW5nRXh0ZW5zaW9uJywgJ1VuaW5zdGFsbGluZyBleHRlbnNpb24uLi4nKSxcblx0XHRcdHNvdXJjZTogYCR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9YFxuXHRcdH0sICgpID0+IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudW5pbnN0YWxsRXh0ZW5zaW9ucyhleHRlbnNpb25zVG9Vbmluc3RhbGwpLnRoZW4oKCkgPT4gdW5kZWZpbmVkKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFsbFBhY2tlZEV4dGVuc2lvbnMoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBpbnN0YWxsZWQ6IElFeHRlbnNpb25bXSwgY2hlY2tlZDogSUV4dGVuc2lvbltdID0gW10pOiBJRXh0ZW5zaW9uW10ge1xuXHRcdGlmIChjaGVja2VkLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y2hlY2tlZC5wdXNoKGV4dGVuc2lvbik7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1BhY2sgPSBleHRlbnNpb24uZXh0ZW5zaW9uUGFjayA/PyBbXTtcblx0XHRpZiAoZXh0ZW5zaW9uc1BhY2subGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBwYWNrZWRFeHRlbnNpb25zOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgaSBvZiBpbnN0YWxsZWQpIHtcblx0XHRcdFx0aWYgKCFpLmlzQnVpbHRpbiAmJiBleHRlbnNpb25zUGFjay5zb21lKGlkID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQgfSwgaS5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0XHRwYWNrZWRFeHRlbnNpb25zLnB1c2goaSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhY2tPZlBhY2tlZEV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBwYWNrZWRFeHRlbnNpb24gb2YgcGFja2VkRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRwYWNrT2ZQYWNrZWRFeHRlbnNpb25zLnB1c2goLi4udGhpcy5nZXRBbGxQYWNrZWRFeHRlbnNpb25zKHBhY2tlZEV4dGVuc2lvbiwgaW5zdGFsbGVkLCBjaGVja2VkKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gWy4uLnBhY2tlZEV4dGVuc2lvbnMsIC4uLnBhY2tPZlBhY2tlZEV4dGVuc2lvbnNdO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIGdldEVycm9yTWVzc2FnZUZvclVuaW5zdGFsbGluZ0FuRXh0ZW5zaW9uV2l0aERlcGVuZGVudHMoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBkZXBlbmRlbnRzOiBJTG9jYWxFeHRlbnNpb25bXSk6IHN0cmluZyB7XG5cdFx0aWYgKGRlcGVuZGVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdzaW5nbGVEZXBlbmRlbnRVbmluc3RhbGxFcnJvcicsIFwiQ2Fubm90IHVuaW5zdGFsbCAnezB9JyBleHRlbnNpb24gYWxvbmUuICd7MX0nIGV4dGVuc2lvbiBkZXBlbmRzIG9uIHRoaXMuIERvIHlvdSB3YW50IHRvIHVuaW5zdGFsbCBhbGwgdGhlc2UgZXh0ZW5zaW9ucz9cIiwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0LmRpc3BsYXlOYW1lKTtcblx0XHR9XG5cdFx0aWYgKGRlcGVuZGVudHMubGVuZ3RoID09PSAyKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd0d29EZXBlbmRlbnRzVW5pbnN0YWxsRXJyb3InLCBcIkNhbm5vdCB1bmluc3RhbGwgJ3swfScgZXh0ZW5zaW9uIGFsb25lLiAnezF9JyBhbmQgJ3syfScgZXh0ZW5zaW9ucyBkZXBlbmQgb24gdGhpcy4gRG8geW91IHdhbnQgdG8gdW5pbnN0YWxsIGFsbCB0aGVzZSBleHRlbnNpb25zP1wiLFxuXHRcdFx0XHRleHRlbnNpb24uZGlzcGxheU5hbWUsIGRlcGVuZGVudHNbMF0ubWFuaWZlc3QuZGlzcGxheU5hbWUsIGRlcGVuZGVudHNbMV0ubWFuaWZlc3QuZGlzcGxheU5hbWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdtdWx0aXBsZURlcGVuZGVudHNVbmluc3RhbGxFcnJvcicsIFwiQ2Fubm90IHVuaW5zdGFsbCAnezB9JyBleHRlbnNpb24gYWxvbmUuICd7MX0nLCAnezJ9JyBhbmQgb3RoZXIgZXh0ZW5zaW9ucyBkZXBlbmQgb24gdGhpcy4gRG8geW91IHdhbnQgdG8gdW5pbnN0YWxsIGFsbCB0aGVzZSBleHRlbnNpb25zP1wiLFxuXHRcdFx0ZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLCBkZXBlbmRlbnRzWzBdLm1hbmlmZXN0LmRpc3BsYXlOYW1lLCBkZXBlbmRlbnRzWzFdLm1hbmlmZXN0LmRpc3BsYXlOYW1lKTtcblx0fVxuXG5cdGlzRXh0ZW5zaW9uSWdub3JlZFRvU3luYyhleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZXh0ZW5zaW9uLmxvY2FsID8gIXRoaXMuaXNJbnN0YWxsZWRFeHRlbnNpb25TeW5jZWQoZXh0ZW5zaW9uLmxvY2FsKVxuXHRcdFx0OiB0aGlzLmV4dGVuc2lvbnNTeW5jTWFuYWdlbWVudFNlcnZpY2UuaGFzVG9OZXZlclN5bmNFeHRlbnNpb24oZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlUHJlUmVsZWFzZShleHRlbnNpb246IElFeHRlbnNpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWV4dGVuc2lvbi5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uLnByZVJlbGVhc2UgIT09IGV4dGVuc2lvbi5pc1ByZVJlbGVhc2VWZXJzaW9uKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnVwZGF0ZU1ldGFkYXRhKGV4dGVuc2lvbi5sb2NhbCwgeyBwcmVSZWxlYXNlOiAhZXh0ZW5zaW9uLnByZVJlbGVhc2UgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuaW5zdGFsbChleHRlbnNpb24sIHsgaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiAhZXh0ZW5zaW9uLnByZVJlbGVhc2UsIHByZVJlbGVhc2U6ICFleHRlbnNpb24ucHJlUmVsZWFzZSB9KTtcblx0fVxuXG5cdGFzeW5jIHRvZ2dsZUV4dGVuc2lvbklnbm9yZWRUb1N5bmMoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0luY2x1ZGluZ1BhY2tlZEV4dGVuc2lvbnMgPSBbZXh0ZW5zaW9uLCAuLi50aGlzLmdldEFsbFBhY2tlZEV4dGVuc2lvbnMoZXh0ZW5zaW9uLCB0aGlzLmxvY2FsKV07XG5cdFx0Ly8gVXBkYXRlZCBpbiBzeW5jIHRvIHByZXZlbnQgcmFjZSBjb25kaXRpb25zXG5cdFx0Zm9yIChjb25zdCBlIG9mIGV4dGVuc2lvbnNJbmNsdWRpbmdQYWNrZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBpc0lnbm9yZWQgPSB0aGlzLmlzRXh0ZW5zaW9uSWdub3JlZFRvU3luYyhlKTtcblx0XHRcdGlmIChlLmxvY2FsICYmIGlzSWdub3JlZCAmJiBlLmxvY2FsLmlzTWFjaGluZVNjb3BlZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnVwZGF0ZU1ldGFkYXRhKGUubG9jYWwsIHsgaXNNYWNoaW5lU2NvcGVkOiBmYWxzZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1N5bmNNYW5hZ2VtZW50U2VydmljZS51cGRhdGVJZ25vcmVkRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIuaWQsICFpc0lnbm9yZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLnRyaWdnZXJTeW5jKFsnSWdub3JlZEV4dGVuc2lvbnNVcGRhdGVkJ10pO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlQXBwbHlFeHRlbnNpb25Ub0FsbFByb2ZpbGVzKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNJbmNsdWRpbmdQYWNrZWRFeHRlbnNpb25zID0gW2V4dGVuc2lvbiwgLi4udGhpcy5nZXRBbGxQYWNrZWRFeHRlbnNpb25zKGV4dGVuc2lvbiwgdGhpcy5sb2NhbCldO1xuXHRcdGNvbnN0IGFsbEV4dGVuc2lvblNlcnZlcnMgPSB0aGlzLmdldEFsbEV4dGVuc2lvblNlcnZlcnMoKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoZXh0ZW5zaW9uc0luY2x1ZGluZ1BhY2tlZEV4dGVuc2lvbnMubWFwKGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKCFlLmxvY2FsIHx8IGlzQXBwbGljYXRpb25TY29wZWRFeHRlbnNpb24oZS5sb2NhbC5tYW5pZmVzdCkgfHwgZS5pc0J1aWx0aW4pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaXNBcHBsaWNhdGlvblNjb3BlZCA9IGUubG9jYWwuaXNBcHBsaWNhdGlvblNjb3BlZDtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGFsbEV4dGVuc2lvblNlcnZlcnMubWFwKGFzeW5jIGV4dGVuc2lvblNlcnZlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGxvY2FsID0gZXh0ZW5zaW9uU2VydmVyLmxvY2FsLmZpbmQobG9jYWwgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBsb2NhbC5pZGVudGlmaWVyKSk/LmxvY2FsO1xuXHRcdFx0XHRpZiAobG9jYWwgJiYgbG9jYWwuaXNBcHBsaWNhdGlvblNjb3BlZCA9PT0gaXNBcHBsaWNhdGlvblNjb3BlZCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudG9nZ2xlQXBwbGljYXRpb25TY29wZShsb2NhbCwgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFsbEV4dGVuc2lvblNlcnZlcnMoKTogRXh0ZW5zaW9uc1tdIHtcblx0XHRjb25zdCBleHRlbnNpb25zOiBFeHRlbnNpb25zW10gPSBbXTtcblx0XHRpZiAodGhpcy5sb2NhbEV4dGVuc2lvbnMpIHtcblx0XHRcdGV4dGVuc2lvbnMucHVzaCh0aGlzLmxvY2FsRXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnJlbW90ZUV4dGVuc2lvbnMpIHtcblx0XHRcdGV4dGVuc2lvbnMucHVzaCh0aGlzLnJlbW90ZUV4dGVuc2lvbnMpO1xuXHRcdH1cblx0XHRpZiAodGhpcy53ZWJFeHRlbnNpb25zKSB7XG5cdFx0XHRleHRlbnNpb25zLnB1c2godGhpcy53ZWJFeHRlbnNpb25zKTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4dGVuc2lvbnM7XG5cdH1cblxuXHRwcml2YXRlIGlzSW5zdGFsbGVkRXh0ZW5zaW9uU3luY2VkKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKGV4dGVuc2lvbi5pc01hY2hpbmVTY29wZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uc1N5bmNNYW5hZ2VtZW50U2VydmljZS5oYXNUb0Fsd2F5c1N5bmNFeHRlbnNpb24oZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuICF0aGlzLmV4dGVuc2lvbnNTeW5jTWFuYWdlbWVudFNlcnZpY2UuaGFzVG9OZXZlclN5bmNFeHRlbnNpb24oZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0luc3RhbGwoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uIHwgdW5kZWZpbmVkLCBpbnN0YWxsVGFzazogKCkgPT4gUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+LCBwcm9ncmVzc0xvY2F0aW9uPzogUHJvZ3Jlc3NMb2NhdGlvbiB8IHN0cmluZyk6IFByb21pc2U8SUV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IHRpdGxlID0gZXh0ZW5zaW9uID8gbmxzLmxvY2FsaXplKCdpbnN0YWxsaW5nIG5hbWVkIGV4dGVuc2lvbicsIFwiSW5zdGFsbGluZyAnezB9JyBleHRlbnNpb24uLi5cIiwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSA6IG5scy5sb2NhbGl6ZSgnaW5zdGFsbGluZyBleHRlbnNpb24nLCAnSW5zdGFsbGluZyBleHRlbnNpb24uLi4nKTtcblx0XHRyZXR1cm4gdGhpcy53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0bG9jYXRpb246IHByb2dyZXNzTG9jYXRpb24gPz8gUHJvZ3Jlc3NMb2NhdGlvbi5FeHRlbnNpb25zLFxuXHRcdFx0dGl0bGVcblx0XHR9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5pbnN0YWxsaW5nLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKGV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbG9jYWwgPSBhd2FpdCBpbnN0YWxsVGFzaygpO1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy53YWl0QW5kR2V0SW5zdGFsbGVkRXh0ZW5zaW9uKGxvY2FsLmlkZW50aWZpZXIpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHRoaXMuaW5zdGFsbGluZyA9IHRoaXMuaW5zdGFsbGluZy5maWx0ZXIoZSA9PiBlICE9PSBleHRlbnNpb24pO1xuXHRcdFx0XHRcdC8vIFRyaWdnZXIgdGhlIGNoYW5nZSB3aXRob3V0IHBhc3NpbmcgdGhlIGV4dGVuc2lvbiBiZWNhdXNlIGl0IGlzIHJlcGxhY2VkIGJ5IGEgbmV3IGluc3RhbmNlLlxuXHRcdFx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbnN0YWxsRnJvbVZTSVgodnNpeDogVVJJLCBpbnN0YWxsT3B0aW9uczogSW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRNYW5pZmVzdCh2c2l4KTtcblx0XHRjb25zdCBleGlzdGluZ0V4dGVuc2lvbiA9IHRoaXMubG9jYWwuZmluZChsb2NhbCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhsb2NhbC5pZGVudGlmaWVyLCB7IGlkOiBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQobWFuaWZlc3QucHVibGlzaGVyLCBtYW5pZmVzdC5uYW1lKSB9KSk7XG5cdFx0aWYgKGV4aXN0aW5nRXh0ZW5zaW9uKSB7XG5cdFx0XHRpbnN0YWxsT3B0aW9ucyA9IGluc3RhbGxPcHRpb25zIHx8IHt9O1xuXHRcdFx0aWYgKGV4aXN0aW5nRXh0ZW5zaW9uLmxhdGVzdFZlcnNpb24gPT09IG1hbmlmZXN0LnZlcnNpb24pIHtcblx0XHRcdFx0aW5zdGFsbE9wdGlvbnMucGlubmVkID0gaW5zdGFsbE9wdGlvbnMucGlubmVkID8/IChleGlzdGluZ0V4dGVuc2lvbi5sb2NhbD8ucGlubmVkIHx8ICF0aGlzLnNob3VsZEF1dG9VcGRhdGVFeHRlbnNpb24oZXhpc3RpbmdFeHRlbnNpb24pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGluc3RhbGxPcHRpb25zLmluc3RhbGxHaXZlblZlcnNpb24gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsVlNJWCh2c2l4LCBtYW5pZmVzdCwgaW5zdGFsbE9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbnN0YWxsRnJvbUdhbGxlcnkoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBnYWxsZXJ5OiBJR2FsbGVyeUV4dGVuc2lvbiwgaW5zdGFsbE9wdGlvbnM6IEluc3RhbGxFeHRlbnNpb25PcHRpb25zLCBzZXJ2ZXJzOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcltdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRpbnN0YWxsT3B0aW9ucyA9IGluc3RhbGxPcHRpb25zID8/IHt9O1xuXHRcdGluc3RhbGxPcHRpb25zLnBpbm5lZCA9IGluc3RhbGxPcHRpb25zLnBpbm5lZCA/PyAoZXh0ZW5zaW9uLmxvY2FsPy5waW5uZWQgfHwgIXRoaXMuc2hvdWxkQXV0b1VwZGF0ZUV4dGVuc2lvbihleHRlbnNpb24pKTtcblx0XHRpZiAoZXh0ZW5zaW9uLmxvY2FsICYmICFzZXJ2ZXJzKSB7XG5cdFx0XHRpbnN0YWxsT3B0aW9ucy5wcm9kdWN0VmVyc2lvbiA9IHRoaXMuZ2V0UHJvZHVjdFZlcnNpb24oKTtcblx0XHRcdGluc3RhbGxPcHRpb25zLm9wZXJhdGlvbiA9IEluc3RhbGxPcGVyYXRpb24uVXBkYXRlO1xuXHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudXBkYXRlRnJvbUdhbGxlcnkoZ2FsbGVyeSwgZXh0ZW5zaW9uLmxvY2FsLCBpbnN0YWxsT3B0aW9ucyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeShnYWxsZXJ5LCBpbnN0YWxsT3B0aW9ucywgc2VydmVycyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3YWl0QW5kR2V0SW5zdGFsbGVkRXh0ZW5zaW9uKGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyKTogUHJvbWlzZTxJRXh0ZW5zaW9uPiB7XG5cdFx0bGV0IGluc3RhbGxlZEV4dGVuc2lvbiA9IHRoaXMubG9jYWwuZmluZChsb2NhbCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhsb2NhbC5pZGVudGlmaWVyLCBpZGVudGlmaWVyKSk7XG5cdFx0aWYgKCFpbnN0YWxsZWRFeHRlbnNpb24pIHtcblx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShFdmVudC5maWx0ZXIodGhpcy5vbkNoYW5nZSwgZSA9PiAhIWUgJiYgdGhpcy5sb2NhbC5zb21lKGxvY2FsID0+IGFyZVNhbWVFeHRlbnNpb25zKGxvY2FsLmlkZW50aWZpZXIsIGlkZW50aWZpZXIpKSkpO1xuXHRcdH1cblx0XHRpbnN0YWxsZWRFeHRlbnNpb24gPSB0aGlzLmxvY2FsLmZpbmQobG9jYWwgPT4gYXJlU2FtZUV4dGVuc2lvbnMobG9jYWwuaWRlbnRpZmllciwgaWRlbnRpZmllcikpO1xuXHRcdGlmICghaW5zdGFsbGVkRXh0ZW5zaW9uKSB7XG5cdFx0XHQvLyBUaGlzIHNob3VsZCBub3QgaGFwcGVuXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4dGVuc2lvbiBzaG91bGQgaGF2ZSBiZWVuIGluc3RhbGxlZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gaW5zdGFsbGVkRXh0ZW5zaW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3YWl0VW50aWxFeHRlbnNpb25Jc0VuYWJsZWQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLmZpbmQoZSA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFleHRlbnNpb24ubG9jYWwgfHwgIXRoaXMuZXh0ZW5zaW9uU2VydmljZS5jYW5BZGRFeHRlbnNpb24odG9FeHRlbnNpb25EZXNjcmlwdGlvbihleHRlbnNpb24ubG9jYWwpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigoYywgZSkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnMoKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5maW5kKGUgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCkpKSB7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdGMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0ZShlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBwcm9tcHRBbmRTZXRFbmFibGVtZW50KGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSwgZW5hYmxlbWVudFN0YXRlOiBFbmFibGVtZW50U3RhdGUpOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IGVuYWJsZSA9IGVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSB8fCBlbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlO1xuXHRcdGlmIChlbmFibGUpIHtcblx0XHRcdGNvbnN0IGFsbERlcGVuZGVuY2llc0FuZFBhY2tlZEV4dGVuc2lvbnMgPSB0aGlzLmdldEV4dGVuc2lvbnNSZWN1cnNpdmVseShleHRlbnNpb25zLCB0aGlzLmxvY2FsLCBlbmFibGVtZW50U3RhdGUsIHsgZGVwZW5kZW5jaWVzOiB0cnVlLCBwYWNrOiB0cnVlIH0pO1xuXHRcdFx0cmV0dXJuIHRoaXMuY2hlY2tBbmRTZXRFbmFibGVtZW50KGV4dGVuc2lvbnMsIGFsbERlcGVuZGVuY2llc0FuZFBhY2tlZEV4dGVuc2lvbnMsIGVuYWJsZW1lbnRTdGF0ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHBhY2tlZEV4dGVuc2lvbnMgPSB0aGlzLmdldEV4dGVuc2lvbnNSZWN1cnNpdmVseShleHRlbnNpb25zLCB0aGlzLmxvY2FsLCBlbmFibGVtZW50U3RhdGUsIHsgZGVwZW5kZW5jaWVzOiBmYWxzZSwgcGFjazogdHJ1ZSB9KTtcblx0XHRcdGlmIChwYWNrZWRFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5jaGVja0FuZFNldEVuYWJsZW1lbnQoZXh0ZW5zaW9ucywgcGFja2VkRXh0ZW5zaW9ucywgZW5hYmxlbWVudFN0YXRlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmNoZWNrQW5kU2V0RW5hYmxlbWVudChleHRlbnNpb25zLCBbXSwgZW5hYmxlbWVudFN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNoZWNrQW5kU2V0RW5hYmxlbWVudChleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10sIG90aGVyRXh0ZW5zaW9uczogSUV4dGVuc2lvbltdLCBlbmFibGVtZW50U3RhdGU6IEVuYWJsZW1lbnRTdGF0ZSk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgYWxsRXh0ZW5zaW9ucyA9IFsuLi5leHRlbnNpb25zLCAuLi5vdGhlckV4dGVuc2lvbnNdO1xuXHRcdGNvbnN0IGVuYWJsZSA9IGVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSB8fCBlbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlO1xuXHRcdGlmICghZW5hYmxlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGRlcGVuZGVudHMgPSB0aGlzLmdldERlcGVuZGVudHNBZnRlckRpc2FibGVtZW50KGV4dGVuc2lvbiwgYWxsRXh0ZW5zaW9ucywgdGhpcy5sb2NhbCk7XG5cdFx0XHRcdGlmIChkZXBlbmRlbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2Rpc2FibGVEZXBlbmRlbnRzJywgXCJEaXNhYmxlIEV4dGVuc2lvbiB3aXRoIERlcGVuZGVudHNcIiksXG5cdFx0XHRcdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogdGhpcy5nZXREZXBlbmRlbnRzRXJyb3JNZXNzYWdlRm9yRGlzYWJsZW1lbnQoZXh0ZW5zaW9uLCBhbGxFeHRlbnNpb25zLCBkZXBlbmRlbnRzKSxcblx0XHRcdFx0XHRcdGJ1dHRvbnM6IFt7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2Rpc2FibGUgYWxsJywgJ0Rpc2FibGUgQWxsJyksXG5cdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdHJ1ZVxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHRjYW5jZWxCdXR0b246IHtcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBmYWxzZVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jaGVja0FuZFNldEVuYWJsZW1lbnQoZGVwZW5kZW50cywgW2V4dGVuc2lvbl0sIGVuYWJsZW1lbnRTdGF0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZG9TZXRFbmFibGVtZW50KGFsbEV4dGVuc2lvbnMsIGVuYWJsZW1lbnRTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEV4dGVuc2lvbnNSZWN1cnNpdmVseShleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10sIGluc3RhbGxlZDogSUV4dGVuc2lvbltdLCBlbmFibGVtZW50U3RhdGU6IEVuYWJsZW1lbnRTdGF0ZSwgb3B0aW9uczogeyBkZXBlbmRlbmNpZXM6IGJvb2xlYW47IHBhY2s6IGJvb2xlYW4gfSwgY2hlY2tlZDogSUV4dGVuc2lvbltdID0gW10pOiBJRXh0ZW5zaW9uW10ge1xuXHRcdGNvbnN0IHRvQ2hlY2sgPSBleHRlbnNpb25zLmZpbHRlcihlID0+IGNoZWNrZWQuaW5kZXhPZihlKSA9PT0gLTEpO1xuXHRcdGlmICh0b0NoZWNrLmxlbmd0aCkge1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgdG9DaGVjaykge1xuXHRcdFx0XHRjaGVja2VkLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGV4dGVuc2lvbnNUb0VhbmJsZU9yRGlzYWJsZSA9IGluc3RhbGxlZC5maWx0ZXIoaSA9PiB7XG5cdFx0XHRcdGlmIChjaGVja2VkLmluZGV4T2YoaSkgIT09IC0xKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVuYWJsZSA9IGVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSB8fCBlbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlO1xuXHRcdFx0XHRjb25zdCBpc0V4dGVuc2lvbkVuYWJsZWQgPSBpLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSB8fCBpLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2U7XG5cdFx0XHRcdGlmIChlbmFibGUgPT09IGlzRXh0ZW5zaW9uRW5hYmxlZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gKGVuYWJsZSB8fCAhaS5pc0J1aWx0aW4pIC8vIEluY2x1ZGUgYWxsIEV4dGVuc2lvbnMgZm9yIGVuYWJsZW1lbnQgYW5kIG9ubHkgbm9uIGJ1aWx0aW4gZXh0ZW5zaW9ucyBmb3IgZGlzYWJsZW1lbnRcblx0XHRcdFx0XHQmJiAob3B0aW9ucy5kZXBlbmRlbmNpZXMgfHwgb3B0aW9ucy5wYWNrKVxuXHRcdFx0XHRcdCYmIGV4dGVuc2lvbnMuc29tZShleHRlbnNpb24gPT5cblx0XHRcdFx0XHRcdChvcHRpb25zLmRlcGVuZGVuY2llcyAmJiBleHRlbnNpb24uZGVwZW5kZW5jaWVzLnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBpLmlkZW50aWZpZXIpKSlcblx0XHRcdFx0XHRcdHx8IChvcHRpb25zLnBhY2sgJiYgZXh0ZW5zaW9uLmV4dGVuc2lvblBhY2suc29tZShpZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkIH0sIGkuaWRlbnRpZmllcikpKVxuXHRcdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdGlmIChleHRlbnNpb25zVG9FYW5ibGVPckRpc2FibGUubGVuZ3RoKSB7XG5cdFx0XHRcdGV4dGVuc2lvbnNUb0VhbmJsZU9yRGlzYWJsZS5wdXNoKC4uLnRoaXMuZ2V0RXh0ZW5zaW9uc1JlY3Vyc2l2ZWx5KGV4dGVuc2lvbnNUb0VhbmJsZU9yRGlzYWJsZSwgaW5zdGFsbGVkLCBlbmFibGVtZW50U3RhdGUsIG9wdGlvbnMsIGNoZWNrZWQpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBleHRlbnNpb25zVG9FYW5ibGVPckRpc2FibGU7XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVwZW5kZW50c0FmdGVyRGlzYWJsZW1lbnQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBleHRlbnNpb25zVG9EaXNhYmxlOiBJRXh0ZW5zaW9uW10sIGluc3RhbGxlZDogSUV4dGVuc2lvbltdKTogSUV4dGVuc2lvbltdIHtcblx0XHRyZXR1cm4gaW5zdGFsbGVkLmZpbHRlcihpID0+IHtcblx0XHRcdGlmIChpLmRlcGVuZGVuY2llcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGkgPT09IGV4dGVuc2lvbikge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKGkuZW5hYmxlbWVudFN0YXRlKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uc1RvRGlzYWJsZS5pbmRleE9mKGkpICE9PSAtMSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaS5kZXBlbmRlbmNpZXMuc29tZShkZXAgPT4gW2V4dGVuc2lvbiwgLi4uZXh0ZW5zaW9uc1RvRGlzYWJsZV0uc29tZShkID0+IGFyZVNhbWVFeHRlbnNpb25zKGQuaWRlbnRpZmllciwgeyBpZDogZGVwIH0pKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldERlcGVuZGVudHNFcnJvck1lc3NhZ2VGb3JEaXNhYmxlbWVudChleHRlbnNpb246IElFeHRlbnNpb24sIGFsbERpc2FibGVkRXh0ZW5zaW9uczogSUV4dGVuc2lvbltdLCBkZXBlbmRlbnRzOiBJRXh0ZW5zaW9uW10pOiBzdHJpbmcge1xuXHRcdGZvciAoY29uc3QgZSBvZiBbZXh0ZW5zaW9uLCAuLi5hbGxEaXNhYmxlZEV4dGVuc2lvbnNdKSB7XG5cdFx0XHRjb25zdCBkZXBlbmRlbnRzT2ZUaGVFeHRlbnNpb24gPSBkZXBlbmRlbnRzLmZpbHRlcihkID0+IGQuZGVwZW5kZW5jaWVzLnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBlLmlkZW50aWZpZXIpKSk7XG5cdFx0XHRpZiAoZGVwZW5kZW50c09mVGhlRXh0ZW5zaW9uLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRFcnJvck1lc3NhZ2VGb3JEaXNhYmxpbmdBbkV4dGVuc2lvbldpdGhEZXBlbmRlbnRzKGUsIGRlcGVuZGVudHNPZlRoZUV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHByaXZhdGUgZ2V0RXJyb3JNZXNzYWdlRm9yRGlzYWJsaW5nQW5FeHRlbnNpb25XaXRoRGVwZW5kZW50cyhleHRlbnNpb246IElFeHRlbnNpb24sIGRlcGVuZGVudHM6IElFeHRlbnNpb25bXSk6IHN0cmluZyB7XG5cdFx0aWYgKGRlcGVuZGVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdzaW5nbGVEZXBlbmRlbnRFcnJvcicsIFwiQ2Fubm90IGRpc2FibGUgJ3swfScgZXh0ZW5zaW9uIGFsb25lLiAnezF9JyBleHRlbnNpb24gZGVwZW5kcyBvbiB0aGlzLiBEbyB5b3Ugd2FudCB0byBkaXNhYmxlIGFsbCB0aGVzZSBleHRlbnNpb25zP1wiLCBleHRlbnNpb24uZGlzcGxheU5hbWUsIGRlcGVuZGVudHNbMF0uZGlzcGxheU5hbWUpO1xuXHRcdH1cblx0XHRpZiAoZGVwZW5kZW50cy5sZW5ndGggPT09IDIpIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3R3b0RlcGVuZGVudHNFcnJvcicsIFwiQ2Fubm90IGRpc2FibGUgJ3swfScgZXh0ZW5zaW9uIGFsb25lLiAnezF9JyBhbmQgJ3syfScgZXh0ZW5zaW9ucyBkZXBlbmQgb24gdGhpcy4gRG8geW91IHdhbnQgdG8gZGlzYWJsZSBhbGwgdGhlc2UgZXh0ZW5zaW9ucz9cIixcblx0XHRcdFx0ZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLCBkZXBlbmRlbnRzWzBdLmRpc3BsYXlOYW1lLCBkZXBlbmRlbnRzWzFdLmRpc3BsYXlOYW1lKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnbXVsdGlwbGVEZXBlbmRlbnRzRXJyb3InLCBcIkNhbm5vdCBkaXNhYmxlICd7MH0nIGV4dGVuc2lvbiBhbG9uZS4gJ3sxfScsICd7Mn0nIGFuZCBvdGhlciBleHRlbnNpb25zIGRlcGVuZCBvbiB0aGlzLiBEbyB5b3Ugd2FudCB0byBkaXNhYmxlIGFsbCB0aGVzZSBleHRlbnNpb25zP1wiLFxuXHRcdFx0ZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLCBkZXBlbmRlbnRzWzBdLmRpc3BsYXlOYW1lLCBkZXBlbmRlbnRzWzFdLmRpc3BsYXlOYW1lKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TZXRFbmFibGVtZW50KGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSwgZW5hYmxlbWVudFN0YXRlOiBFbmFibGVtZW50U3RhdGUpOiBQcm9taXNlPGJvb2xlYW5bXT4ge1xuXHRcdHJldHVybiBhd2FpdCB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLnNldEVuYWJsZW1lbnQoZXh0ZW5zaW9ucy5tYXAoZSA9PiBlLmxvY2FsISksIGVuYWJsZW1lbnRTdGF0ZSk7XG5cdH1cblxuXHQvLyBDdXJyZW50IHNlcnZpY2UgcmVwb3J0cyBwcm9ncmVzcyB3aGVuIGluc3RhbGxpbmcvdW5pbnN0YWxsaW5nIGV4dGVuc2lvbnNcblx0Ly8gVGhpcyBpcyB0byByZXBvcnQgcHJvZ3Jlc3MgZm9yIG90aGVyIHNvdXJjZXMgb2YgZXh0ZW5zaW9uIGluc3RhbGwvdW5pbnN0YWxsIGNoYW5nZXNcblx0Ly8gU2luY2Ugd2UgY2Fubm90IGRpZmZlcmVudGlhdGUgYmV0d2VlbiB0aGUgdHdvLCB3ZSByZXBvcnQgcHJvZ3Jlc3MgZm9yIGFsbCBleHRlbnNpb24gaW5zdGFsbC91bmluc3RhbGwgY2hhbmdlc1xuXHRwcml2YXRlIF9hY3Rpdml0eUNhbGxCYWNrOiAoKHZhbHVlOiB2b2lkKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZXBvcnRQcm9ncmVzc0Zyb21PdGhlclNvdXJjZXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaW5zdGFsbGVkLnNvbWUoZSA9PiBlLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsaW5nIHx8IGUuc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGluZykpIHtcblx0XHRcdGlmICghdGhpcy5fYWN0aXZpdHlDYWxsQmFjaykge1xuXHRcdFx0XHR0aGlzLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLkV4dGVuc2lvbnMgfSwgKCkgPT4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB0aGlzLl9hY3Rpdml0eUNhbGxCYWNrID0gcmVzb2x2ZSkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hY3Rpdml0eUNhbGxCYWNrPy4oKTtcblx0XHRcdHRoaXMuX2FjdGl2aXR5Q2FsbEJhY2sgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB3aXRoUHJvZ3Jlc3M8VD4ob3B0aW9uczogSVByb2dyZXNzT3B0aW9ucywgdGFzazogKCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuXHRcdHJldHVybiB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Mob3B0aW9ucywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FuY2VsYWJsZVRhc2sgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSgoKSA9PiB0YXNrKCkpO1xuXHRcdFx0dGhpcy50YXNrc0luUHJvZ3Jlc3MucHVzaChjYW5jZWxhYmxlVGFzayk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgY2FuY2VsYWJsZVRhc2s7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMudGFza3NJblByb2dyZXNzLmluZGV4T2YoY2FuY2VsYWJsZVRhc2spO1xuXHRcdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0dGhpcy50YXNrc0luUHJvZ3Jlc3Muc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVycm9yKGVycjogYW55KTogdm9pZCB7XG5cdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgJiYgZXJyLm1lc3NhZ2UgfHwgJyc7XG5cblx0XHRpZiAoL2dldGFkZHJpbmZvIEVOT1RGT1VORHxnZXRhZGRyaW5mbyBFTk9FTlR8Y29ubmVjdCBFQUNDRVN8Y29ubmVjdCBFQ09OTlJFRlVTRUQvLnRlc3QobWVzc2FnZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyKTtcblx0fVxuXG5cdGhhbmRsZVVSTCh1cmk6IFVSSSwgb3B0aW9ucz86IElPcGVuVVJMT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghL15leHRlbnNpb24vLnRlc3QodXJpLnBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcblx0XHR9XG5cblx0XHR0aGlzLm9uT3BlbkV4dGVuc2lvblVybCh1cmkpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uT3BlbkV4dGVuc2lvblVybCh1cmk6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IG1hdGNoID0gL15leHRlbnNpb25cXC8oW14vXSspJC8uZXhlYyh1cmkucGF0aCk7XG5cblx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBtYXRjaFsxXTtcblxuXHRcdHRoaXMucXVlcnlMb2NhbCgpLnRoZW4oYXN5bmMgbG9jYWwgPT4ge1xuXHRcdFx0bGV0IGV4dGVuc2lvbiA9IGxvY2FsLmZpbmQobG9jYWwgPT4gYXJlU2FtZUV4dGVuc2lvbnMobG9jYWwuaWRlbnRpZmllciwgeyBpZDogZXh0ZW5zaW9uSWQgfSkpO1xuXHRcdFx0aWYgKCFleHRlbnNpb24pIHtcblx0XHRcdFx0W2V4dGVuc2lvbl0gPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnMoW3sgaWQ6IGV4dGVuc2lvbklkIH1dLCB7IHNvdXJjZTogJ3VyaScgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuaG9zdFNlcnZpY2UuZm9jdXMobWFpbldpbmRvdyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMub3BlbihleHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdH0pLnRoZW4odW5kZWZpbmVkLCBlcnJvciA9PiB0aGlzLm9uRXJyb3IoZXJyb3IpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHVibGlzaGVyc1RvQXV0b1VwZGF0ZSgpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0RW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zKCkuZmlsdGVyKGlkID0+ICFFWFRFTlNJT05fSURFTlRJRklFUl9SRUdFWC50ZXN0KGlkKSk7XG5cdH1cblxuXHRnZXRFbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMoKTogc3RyaW5nW10ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWRWYWx1ZSA9IEpTT04ucGFyc2UodGhpcy5lbmFibGVkQXVvdFVwZGF0ZUV4dGVuc2lvbnNWYWx1ZSk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwYXJzZWRWYWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuIHBhcnNlZFZhbHVlO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHsgLyogSWdub3JlICovIH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIHNldEVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucyhlbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkQXVvdFVwZGF0ZUV4dGVuc2lvbnNWYWx1ZSA9IEpTT04uc3RyaW5naWZ5KGVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF9lbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBlbmFibGVkQXVvdFVwZGF0ZUV4dGVuc2lvbnNWYWx1ZSgpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fZW5hYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUpIHtcblx0XHRcdHRoaXMuX2VuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlID0gdGhpcy5nZXRFbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9lbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0IGVuYWJsZWRBdW90VXBkYXRlRXh0ZW5zaW9uc1ZhbHVlKGVuYWJsZWRBdW90VXBkYXRlRXh0ZW5zaW9uc1ZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5lbmFibGVkQXVvdFVwZGF0ZUV4dGVuc2lvbnNWYWx1ZSAhPT0gZW5hYmxlZEF1b3RVcGRhdGVFeHRlbnNpb25zVmFsdWUpIHtcblx0XHRcdHRoaXMuX2VuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlID0gZW5hYmxlZEF1b3RVcGRhdGVFeHRlbnNpb25zVmFsdWU7XG5cdFx0XHR0aGlzLnNldEVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlKGVuYWJsZWRBdW90VXBkYXRlRXh0ZW5zaW9uc1ZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEVuYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEVYVEVOU0lPTlNfQVVUT19VUERBVEVfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sICdbXScpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRFbmFibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShFWFRFTlNJT05TX0FVVE9fVVBEQVRFX0tFWSwgdmFsdWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdGdldERpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnMoKTogc3RyaW5nW10ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWRWYWx1ZSA9IEpTT04ucGFyc2UodGhpcy5kaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocGFyc2VkVmFsdWUpKSB7XG5cdFx0XHRcdHJldHVybiBwYXJzZWRWYWx1ZTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7IC8qIElnbm9yZSAqLyB9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXREaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zKGRpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUgPSBKU09OLnN0cmluZ2lmeShkaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBkaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUoKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuX2Rpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSkge1xuXHRcdFx0dGhpcy5fZGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlID0gdGhpcy5nZXREaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgZGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlKGRpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMuZGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlICE9PSBkaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUpIHtcblx0XHRcdHRoaXMuX2Rpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSA9IGRpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZTtcblx0XHRcdHRoaXMuc2V0RGlzYWJsZWRBdXRvVXBkYXRlRXh0ZW5zaW9uc1ZhbHVlKGRpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXREaXNhYmxlZEF1dG9VcGRhdGVFeHRlbnNpb25zVmFsdWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoRVhURU5TSU9OU19ET05PVF9BVVRPX1VQREFURV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgJ1tdJyk7XG5cdH1cblxuXHRwcml2YXRlIHNldERpc2FibGVkQXV0b1VwZGF0ZUV4dGVuc2lvbnNWYWx1ZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShFWFRFTlNJT05TX0RPTk9UX0FVVE9fVVBEQVRFX0tFWSwgdmFsdWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGlzbWlzc2VkTm90aWZpY2F0aW9ucygpOiBzdHJpbmdbXSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZFZhbHVlID0gSlNPTi5wYXJzZSh0aGlzLmRpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwYXJzZWRWYWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuIHBhcnNlZFZhbHVlO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHsgLyogSWdub3JlICovIH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIHNldERpc21pc3NlZE5vdGlmaWNhdGlvbnMoZGlzbWlzc2VkTm90aWZpY2F0aW9uczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHR0aGlzLmRpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSA9IEpTT04uc3RyaW5naWZ5KGRpc21pc3NlZE5vdGlmaWNhdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IGRpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSgpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fZGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlKSB7XG5cdFx0XHR0aGlzLl9kaXNtaXNzZWROb3RpZmljYXRpb25zVmFsdWUgPSB0aGlzLmdldERpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9kaXNtaXNzZWROb3RpZmljYXRpb25zVmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIHNldCBkaXNtaXNzZWROb3RpZmljYXRpb25zVmFsdWUoZGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5kaXNtaXNzZWROb3RpZmljYXRpb25zVmFsdWUgIT09IGRpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSkge1xuXHRcdFx0dGhpcy5fZGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlID0gZGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlO1xuXHRcdFx0dGhpcy5zZXREaXNtaXNzZWROb3RpZmljYXRpb25zVmFsdWUoZGlzbWlzc2VkTm90aWZpY2F0aW9uc1ZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldERpc21pc3NlZE5vdGlmaWNhdGlvbnNWYWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChFWFRFTlNJT05TX0RJU01JU1NFRF9OT1RJRklDQVRJT05TX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICdbXScpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXREaXNtaXNzZWROb3RpZmljYXRpb25zVmFsdWUodmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoRVhURU5TSU9OU19ESVNNSVNTRURfTk9USUZJQ0FUSU9OU19LRVksIHZhbHVlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFlBQVk7QUFDeEIsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQTRCLFVBQVUsa0JBQWtCLHlCQUF5Qix5QkFBeUI7QUFDMUcsU0FBUyxtQkFBbUIsaUJBQWlCLDJCQUEyQjtBQUN4RSxTQUFTLFlBQVksbUJBQW1CLG9CQUFvQjtBQUM1RCxTQUFpQix1QkFBdUI7QUFDeEMsU0FBUyx5QkFBeUI7QUFDbEM7QUFBQSxFQUNDO0FBQUEsRUFDbUQ7QUFBQSxFQUFrQjtBQUFBLEVBQ2lCO0FBQUEsRUFBa0Q7QUFBQSxFQUd4STtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFFQTtBQUFBLE9BRU07QUFDUCxTQUFTLHNDQUFzQyxpQkFBaUIsbUNBQStELDRDQUFnRTtBQUMvTCxTQUFTLGtDQUFrQyxnQ0FBZ0MsbUJBQW1CLGtCQUFrQix1QkFBdUIsa0NBQWtDO0FBQ3pLLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsV0FBVztBQUNwQixTQUFx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O0FBQzNCLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFBQSxFQUVRLDBCQUEwQix3QkFBd0M7QUFDekUsU0FBSyw4QkFBOEIsS0FBSyxVQUFVLHNCQUFzQjtBQUFBLEVBQ3pFO0FBQUEsRUFHQSxJQUFZLDhCQUFzQztBQUNqRCxRQUFJLENBQUMsS0FBSyw4QkFBOEI7QUFDdkMsV0FBSywrQkFBK0IsS0FBSywrQkFBK0I7QUFBQSxJQUN6RTtBQUVBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQVksNEJBQTRCLDZCQUFxQztBQUM1RSxRQUFJLEtBQUssZ0NBQWdDLDZCQUE2QjtBQUNyRSxXQUFLLCtCQUErQjtBQUNwQyxXQUFLLCtCQUErQiwyQkFBMkI7QUFBQSxJQUNoRTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGlDQUF5QztBQUNoRCxXQUFPLEtBQUssZUFBZSxJQUFJLHdDQUF3QyxhQUFhLFNBQVMsSUFBSTtBQUFBLEVBQ2xHO0FBQUEsRUFFUSwrQkFBK0IsT0FBcUI7QUFDM0QsU0FBSyxlQUFlLE1BQU0sd0NBQXdDLE9BQU8sYUFBYSxTQUFTLGNBQWMsSUFBSTtBQUFBLEVBQ2xIO0FBRUQ7QUFoNkVhLDJCQUVZLHVCQUF1QixNQUFPLEtBQUssS0FBSztBQUZwRCw2QkFBTjtBQUFBLEVBZ0NKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FwRVU7IiwKICAibmFtZXMiOiBbImUiLCAiZXh0ZW5zaW9uIiwgIm1hbmlmZXN0IiwgInRva2VuIiwgInRhcmdldFBsYXRmb3JtIiwgImV4dGVuc2lvbnMiLCAic2hvdWxkQXV0b1VwZGF0ZSIsICJzaG91bGROb3RBdXRvVXBkYXRlIiwgImxvY2FsIiwgImluZGV4Il0KfQo=
