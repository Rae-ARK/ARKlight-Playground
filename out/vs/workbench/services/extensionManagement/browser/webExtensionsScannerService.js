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
import { IBuiltinExtensionsScannerService, ExtensionType, TargetPlatform, parseEnabledApiProposalNames } from "../../../../platform/extensions/common/extensions.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { IWebExtensionsScannerService } from "../common/extensionManagement.js";
import { isWeb, Language } from "../../../../base/common/platform.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { FileOperationResult, IFileService } from "../../../../platform/files/common/files.js";
import { Queue } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { IExtensionGalleryService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { areSameExtensions, getGalleryExtensionId, getExtensionId, isMalicious } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localizeManifest } from "../../../../platform/extensionManagement/common/extensionNls.js";
import { localize, localize2 } from "../../../../nls.js";
import * as semver from "../../../../base/common/semver/semver.js";
import { isString, isUndefined } from "../../../../base/common/types.js";
import { getErrorMessage } from "../../../../base/common/errors.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { IExtensionManifestPropertiesService } from "../../extensions/common/extensionManifestPropertiesService.js";
import { IExtensionResourceLoaderService, migratePlatformSpecificExtensionGalleryResourceURL } from "../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { basename } from "../../../../base/common/path.js";
import { IExtensionStorageService } from "../../../../platform/extensionManagement/common/extensionStorage.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { validateExtensionManifest } from "../../../../platform/extensions/common/extensionValidator.js";
import Severity from "../../../../base/common/severity.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
function isGalleryExtensionInfo(obj) {
  const galleryExtensionInfo = obj;
  return typeof galleryExtensionInfo?.id === "string" && (galleryExtensionInfo.preRelease === void 0 || typeof galleryExtensionInfo.preRelease === "boolean") && (galleryExtensionInfo.migrateStorageFrom === void 0 || typeof galleryExtensionInfo.migrateStorageFrom === "string");
}
function isUriComponents(obj) {
  if (!obj) {
    return false;
  }
  const thing = obj;
  return typeof thing?.path === "string" && typeof thing?.scheme === "string";
}
let WebExtensionsScannerService = class extends Disposable {
  constructor(environmentService, builtinExtensionsScannerService, fileService, logService, galleryService, extensionManifestPropertiesService, extensionResourceLoaderService, extensionStorageService, storageService, productService, userDataProfilesService, uriIdentityService, lifecycleService) {
    super();
    this.environmentService = environmentService;
    this.builtinExtensionsScannerService = builtinExtensionsScannerService;
    this.fileService = fileService;
    this.logService = logService;
    this.galleryService = galleryService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.extensionResourceLoaderService = extensionResourceLoaderService;
    this.extensionStorageService = extensionStorageService;
    this.storageService = storageService;
    this.productService = productService;
    this.userDataProfilesService = userDataProfilesService;
    this.uriIdentityService = uriIdentityService;
    this.systemExtensionsCacheResource = void 0;
    this.customBuiltinExtensionsCacheResource = void 0;
    this.resourcesAccessQueueMap = new ResourceMap();
    if (isWeb) {
      this.systemExtensionsCacheResource = joinPath(environmentService.userRoamingDataHome, "systemExtensionsCache.json");
      this.customBuiltinExtensionsCacheResource = joinPath(environmentService.userRoamingDataHome, "customBuiltinExtensionsCache.json");
      lifecycleService.when(LifecyclePhase.Eventually).then(() => this.updateCaches());
    }
  }
  readCustomBuiltinExtensionsInfoFromEnv() {
    if (!this._customBuiltinExtensionsInfoPromise) {
      this._customBuiltinExtensionsInfoPromise = (async () => {
        let extensions = [];
        const extensionLocations = [];
        const extensionGalleryResources = [];
        const extensionsToMigrate = [];
        const customBuiltinExtensionsInfo = this.environmentService.options && Array.isArray(this.environmentService.options.additionalBuiltinExtensions) ? this.environmentService.options.additionalBuiltinExtensions.map((additionalBuiltinExtension) => isString(additionalBuiltinExtension) ? { id: additionalBuiltinExtension } : additionalBuiltinExtension) : [];
        for (const e of customBuiltinExtensionsInfo) {
          if (isGalleryExtensionInfo(e)) {
            extensions.push({ id: e.id, preRelease: !!e.preRelease });
            if (e.migrateStorageFrom) {
              extensionsToMigrate.push([e.migrateStorageFrom, e.id]);
            }
          } else if (isUriComponents(e)) {
            const extensionLocation = URI.revive(e);
            if (await this.extensionResourceLoaderService.isExtensionGalleryResource(extensionLocation)) {
              extensionGalleryResources.push(extensionLocation);
            } else {
              extensionLocations.push(extensionLocation);
            }
          }
        }
        if (extensions.length) {
          extensions = await this.checkAdditionalBuiltinExtensions(extensions);
        }
        if (extensions.length) {
          this.logService.info("Found additional builtin gallery extensions in env", extensions);
        }
        if (extensionLocations.length) {
          this.logService.info("Found additional builtin location extensions in env", extensionLocations.map((e) => e.toString()));
        }
        if (extensionGalleryResources.length) {
          this.logService.info("Found additional builtin extension gallery resources in env", extensionGalleryResources.map((e) => e.toString()));
        }
        return { extensions, extensionsToMigrate, extensionLocations, extensionGalleryResources };
      })();
    }
    return this._customBuiltinExtensionsInfoPromise;
  }
  async checkAdditionalBuiltinExtensions(extensions) {
    const extensionsControlManifest = await this.galleryService.getExtensionsControlManifest();
    const result = [];
    for (const extension of extensions) {
      if (isMalicious({ id: extension.id }, extensionsControlManifest.malicious)) {
        this.logService.info(`Checking additional builtin extensions: Ignoring '${extension.id}' because it is reported to be malicious.`);
        continue;
      }
      const deprecationInfo = extensionsControlManifest.deprecated[extension.id.toLowerCase()];
      if (deprecationInfo?.extension?.autoMigrate) {
        const preReleaseExtensionId = deprecationInfo.extension.id;
        this.logService.info(`Checking additional builtin extensions: '${extension.id}' is deprecated, instead using '${preReleaseExtensionId}'`);
        result.push({ id: preReleaseExtensionId, preRelease: !!extension.preRelease });
      } else {
        result.push(extension);
      }
    }
    return result;
  }
  /**
   * All system extensions bundled with the product
   */
  async readSystemExtensions() {
    const systemExtensions = await this.builtinExtensionsScannerService.scanBuiltinExtensions();
    const cachedSystemExtensions = await Promise.all((await this.readSystemExtensionsCache()).map((e) => this.toScannedExtension(e, true, ExtensionType.System)));
    const result = /* @__PURE__ */ new Map();
    for (const extension of [...systemExtensions, ...cachedSystemExtensions]) {
      const existing = result.get(extension.identifier.id.toLowerCase());
      if (existing) {
        if (semver.gt(existing.manifest.version, extension.manifest.version)) {
          continue;
        }
      }
      result.set(extension.identifier.id.toLowerCase(), extension);
    }
    return [...result.values()];
  }
  /**
   * All extensions defined via `additionalBuiltinExtensions` API
   */
  async readCustomBuiltinExtensions(scanOptions) {
    const [customBuiltinExtensionsFromLocations, customBuiltinExtensionsFromGallery] = await Promise.all([
      this.getCustomBuiltinExtensionsFromLocations(scanOptions),
      this.getCustomBuiltinExtensionsFromGallery(scanOptions)
    ]);
    const customBuiltinExtensions = [...customBuiltinExtensionsFromLocations, ...customBuiltinExtensionsFromGallery];
    await this.migrateExtensionsStorage(customBuiltinExtensions);
    return customBuiltinExtensions;
  }
  async getCustomBuiltinExtensionsFromLocations(scanOptions) {
    const { extensionLocations } = await this.readCustomBuiltinExtensionsInfoFromEnv();
    if (!extensionLocations.length) {
      return [];
    }
    const result = [];
    await Promise.allSettled(extensionLocations.map(async (extensionLocation) => {
      try {
        const webExtension = await this.toWebExtension(extensionLocation);
        const extension = await this.toScannedExtension(webExtension, true);
        if (extension.isValid || !scanOptions?.skipInvalidExtensions) {
          result.push(extension);
        } else {
          this.logService.info(`Skipping invalid additional builtin extension ${webExtension.identifier.id}`);
        }
      } catch (error) {
        this.logService.info(`Error while fetching the additional builtin extension ${extensionLocation.toString()}.`, getErrorMessage(error));
      }
    }));
    return result;
  }
  async getCustomBuiltinExtensionsFromGallery(scanOptions) {
    if (!this.galleryService.isEnabled()) {
      this.logService.info("Ignoring fetching additional builtin extensions from gallery as it is disabled.");
      return [];
    }
    const result = [];
    const { extensions, extensionGalleryResources } = await this.readCustomBuiltinExtensionsInfoFromEnv();
    try {
      const cacheValue = JSON.stringify({
        extensions: extensions.sort((a, b) => a.id.localeCompare(b.id)),
        extensionGalleryResources: extensionGalleryResources.map((e) => e.toString()).sort()
      });
      const useCache = this.storageService.get("additionalBuiltinExtensions", StorageScope.APPLICATION, "{}") === cacheValue;
      const webExtensions = await (useCache ? this.getCustomBuiltinExtensionsFromCache() : this.updateCustomBuiltinExtensionsCache());
      if (webExtensions.length) {
        await Promise.all(webExtensions.map(async (webExtension) => {
          try {
            const extension = await this.toScannedExtension(webExtension, true);
            if (extension.isValid || !scanOptions?.skipInvalidExtensions) {
              result.push(extension);
            } else {
              this.logService.info(`Skipping invalid additional builtin gallery extension ${webExtension.identifier.id}`);
            }
          } catch (error) {
            this.logService.info(`Ignoring additional builtin extension ${webExtension.identifier.id} because there is an error while converting it into scanned extension`, getErrorMessage(error));
          }
        }));
      }
      this.storageService.store("additionalBuiltinExtensions", cacheValue, StorageScope.APPLICATION, StorageTarget.MACHINE);
    } catch (error) {
      this.logService.info("Ignoring following additional builtin extensions as there is an error while fetching them from gallery", extensions.map(({ id }) => id), getErrorMessage(error));
    }
    return result;
  }
  async getCustomBuiltinExtensionsFromCache() {
    const cachedCustomBuiltinExtensions = await this.readCustomBuiltinExtensionsCache();
    const webExtensionsMap = /* @__PURE__ */ new Map();
    for (const webExtension of cachedCustomBuiltinExtensions) {
      const existing = webExtensionsMap.get(webExtension.identifier.id.toLowerCase());
      if (existing) {
        if (semver.gt(existing.version, webExtension.version)) {
          continue;
        }
      }
      if (webExtension.metadata?.isPreReleaseVersion && !webExtension.metadata?.preRelease) {
        webExtension.metadata.preRelease = true;
      }
      webExtensionsMap.set(webExtension.identifier.id.toLowerCase(), webExtension);
    }
    return [...webExtensionsMap.values()];
  }
  async migrateExtensionsStorage(customBuiltinExtensions) {
    if (!this._migrateExtensionsStoragePromise) {
      this._migrateExtensionsStoragePromise = (async () => {
        const { extensionsToMigrate } = await this.readCustomBuiltinExtensionsInfoFromEnv();
        if (!extensionsToMigrate.length) {
          return;
        }
        const fromExtensions = await this.galleryService.getExtensions(extensionsToMigrate.map(([id]) => ({ id })), CancellationToken.None);
        try {
          await Promise.allSettled(extensionsToMigrate.map(async ([from, to]) => {
            const toExtension = customBuiltinExtensions.find((extension) => areSameExtensions(extension.identifier, { id: to }));
            if (toExtension) {
              const fromExtension = fromExtensions.find((extension) => areSameExtensions(extension.identifier, { id: from }));
              const fromExtensionManifest = fromExtension ? await this.galleryService.getManifest(fromExtension, CancellationToken.None) : null;
              const fromExtensionId = fromExtensionManifest ? getExtensionId(fromExtensionManifest.publisher, fromExtensionManifest.name) : from;
              const toExtensionId = getExtensionId(toExtension.manifest.publisher, toExtension.manifest.name);
              this.extensionStorageService.addToMigrationList(fromExtensionId, toExtensionId);
            } else {
              this.logService.info(`Skipped migrating extension storage from '${from}' to '${to}', because the '${to}' extension is not found.`);
            }
          }));
        } catch (error) {
          this.logService.error(error);
        }
      })();
    }
    return this._migrateExtensionsStoragePromise;
  }
  async updateCaches() {
    await this.updateSystemExtensionsCache();
    await this.updateCustomBuiltinExtensionsCache();
  }
  async updateSystemExtensionsCache() {
    const systemExtensions = await this.builtinExtensionsScannerService.scanBuiltinExtensions();
    const cachedSystemExtensions = (await this.readSystemExtensionsCache()).filter((cached) => {
      const systemExtension = systemExtensions.find((e) => areSameExtensions(e.identifier, cached.identifier));
      return systemExtension && semver.gt(cached.version, systemExtension.manifest.version);
    });
    await this.writeSystemExtensionsCache(() => cachedSystemExtensions);
  }
  async updateCustomBuiltinExtensionsCache() {
    if (!this._updateCustomBuiltinExtensionsCachePromise) {
      this._updateCustomBuiltinExtensionsCachePromise = (async () => {
        this.logService.info("Updating additional builtin extensions cache");
        const { extensions, extensionGalleryResources } = await this.readCustomBuiltinExtensionsInfoFromEnv();
        const [galleryWebExtensions, extensionGalleryResourceWebExtensions] = await Promise.all([
          this.resolveBuiltinGalleryExtensions(extensions),
          this.resolveBuiltinExtensionGalleryResources(extensionGalleryResources)
        ]);
        const webExtensionsMap = /* @__PURE__ */ new Map();
        for (const webExtension of [...galleryWebExtensions, ...extensionGalleryResourceWebExtensions]) {
          webExtensionsMap.set(webExtension.identifier.id.toLowerCase(), webExtension);
        }
        await this.resolveDependenciesAndPackedExtensions(extensionGalleryResourceWebExtensions, webExtensionsMap);
        const webExtensions = [...webExtensionsMap.values()];
        await this.writeCustomBuiltinExtensionsCache(() => webExtensions);
        return webExtensions;
      })();
    }
    return this._updateCustomBuiltinExtensionsCachePromise;
  }
  async resolveBuiltinExtensionGalleryResources(extensionGalleryResources) {
    if (extensionGalleryResources.length === 0) {
      return [];
    }
    const result = /* @__PURE__ */ new Map();
    const extensionInfos = [];
    await Promise.all(extensionGalleryResources.map(async (extensionGalleryResource) => {
      try {
        const webExtension = await this.toWebExtensionFromExtensionGalleryResource(extensionGalleryResource);
        result.set(webExtension.identifier.id.toLowerCase(), webExtension);
        extensionInfos.push({ id: webExtension.identifier.id, version: webExtension.version });
      } catch (error) {
        this.logService.info(`Ignoring additional builtin extension from gallery resource ${extensionGalleryResource.toString()} because there is an error while converting it into web extension`, getErrorMessage(error));
      }
    }));
    const galleryExtensions = await this.galleryService.getExtensions(extensionInfos, CancellationToken.None);
    for (const galleryExtension of galleryExtensions) {
      const webExtension = result.get(galleryExtension.identifier.id.toLowerCase());
      if (webExtension) {
        result.set(galleryExtension.identifier.id.toLowerCase(), {
          ...webExtension,
          identifier: { id: webExtension.identifier.id, uuid: galleryExtension.identifier.uuid },
          readmeUri: galleryExtension.assets.readme ? URI.parse(galleryExtension.assets.readme.uri) : void 0,
          changelogUri: galleryExtension.assets.changelog ? URI.parse(galleryExtension.assets.changelog.uri) : void 0,
          metadata: { isPreReleaseVersion: galleryExtension.properties.isPreReleaseVersion, preRelease: galleryExtension.properties.isPreReleaseVersion, isBuiltin: true, pinned: true }
        });
      }
    }
    return [...result.values()];
  }
  async resolveBuiltinGalleryExtensions(extensions) {
    if (extensions.length === 0) {
      return [];
    }
    const webExtensions = [];
    const galleryExtensionsMap = await this.getExtensionsWithDependenciesAndPackedExtensions(extensions);
    const missingExtensions = extensions.filter(({ id }) => !galleryExtensionsMap.has(id.toLowerCase()));
    if (missingExtensions.length) {
      this.logService.info("Skipping the additional builtin extensions because their compatible versions are not found.", missingExtensions);
    }
    await Promise.all([...galleryExtensionsMap.values()].map(async (gallery) => {
      try {
        const webExtension = await this.toWebExtensionFromGallery(gallery, { isPreReleaseVersion: gallery.properties.isPreReleaseVersion, preRelease: gallery.properties.isPreReleaseVersion, isBuiltin: true });
        webExtensions.push(webExtension);
      } catch (error) {
        this.logService.info(`Ignoring additional builtin extension ${gallery.identifier.id} because there is an error while converting it into web extension`, getErrorMessage(error));
      }
    }));
    return webExtensions;
  }
  async resolveDependenciesAndPackedExtensions(webExtensions, result) {
    const extensionInfos = [];
    for (const webExtension of webExtensions) {
      for (const e of [...webExtension.manifest?.extensionDependencies ?? [], ...webExtension.manifest?.extensionPack ?? []]) {
        if (!result.has(e.toLowerCase())) {
          extensionInfos.push({ id: e, version: webExtension.version });
        }
      }
    }
    if (extensionInfos.length === 0) {
      return;
    }
    const galleryExtensions = await this.getExtensionsWithDependenciesAndPackedExtensions(extensionInfos, /* @__PURE__ */ new Set([...result.keys()]));
    await Promise.all([...galleryExtensions.values()].map(async (gallery) => {
      try {
        const webExtension = await this.toWebExtensionFromGallery(gallery, { isPreReleaseVersion: gallery.properties.isPreReleaseVersion, preRelease: gallery.properties.isPreReleaseVersion, isBuiltin: true });
        result.set(webExtension.identifier.id.toLowerCase(), webExtension);
      } catch (error) {
        this.logService.info(`Ignoring additional builtin extension ${gallery.identifier.id} because there is an error while converting it into web extension`, getErrorMessage(error));
      }
    }));
  }
  async getExtensionsWithDependenciesAndPackedExtensions(toGet, seen = /* @__PURE__ */ new Set(), result = /* @__PURE__ */ new Map()) {
    if (toGet.length === 0) {
      return result;
    }
    const extensions = await this.galleryService.getExtensions(toGet, { compatible: true, targetPlatform: TargetPlatform.WEB }, CancellationToken.None);
    const packsAndDependencies = /* @__PURE__ */ new Map();
    for (const extension of extensions) {
      result.set(extension.identifier.id.toLowerCase(), extension);
      for (const id of [...isNonEmptyArray(extension.properties.dependencies) ? extension.properties.dependencies : [], ...isNonEmptyArray(extension.properties.extensionPack) ? extension.properties.extensionPack : []]) {
        if (!result.has(id.toLowerCase()) && !packsAndDependencies.has(id.toLowerCase()) && !seen.has(id.toLowerCase())) {
          const extensionInfo = toGet.find((e) => areSameExtensions(e, extension.identifier));
          packsAndDependencies.set(id.toLowerCase(), { id, preRelease: extensionInfo?.preRelease });
        }
      }
    }
    return this.getExtensionsWithDependenciesAndPackedExtensions([...packsAndDependencies.values()].filter(({ id }) => !result.has(id.toLowerCase())), seen, result);
  }
  async scanSystemExtensions() {
    return this.readSystemExtensions();
  }
  async scanUserExtensions(profileLocation, scanOptions) {
    const extensions = /* @__PURE__ */ new Map();
    const customBuiltinExtensions = await this.readCustomBuiltinExtensions(scanOptions);
    for (const extension of customBuiltinExtensions) {
      extensions.set(extension.identifier.id.toLowerCase(), extension);
    }
    const installedExtensions = await this.scanInstalledExtensions(profileLocation, scanOptions);
    for (const extension of installedExtensions) {
      extensions.set(extension.identifier.id.toLowerCase(), extension);
    }
    return [...extensions.values()];
  }
  async scanExtensionsUnderDevelopment() {
    const devExtensions = this.environmentService.options?.developmentOptions?.extensions;
    const result = [];
    if (Array.isArray(devExtensions)) {
      await Promise.allSettled(devExtensions.map(async (devExtension) => {
        try {
          const location = URI.revive(devExtension);
          if (URI.isUri(location)) {
            const webExtension = await this.toWebExtension(location);
            result.push(await this.toScannedExtension(webExtension, false));
          } else {
            this.logService.info(`Skipping the extension under development ${devExtension} as it is not URI type.`);
          }
        } catch (error) {
          this.logService.info(`Error while fetching the extension under development ${devExtension.toString()}.`, getErrorMessage(error));
        }
      }));
    }
    return result;
  }
  async scanExistingExtension(extensionLocation, extensionType, profileLocation) {
    if (extensionType === ExtensionType.System) {
      const systemExtensions = await this.scanSystemExtensions();
      return systemExtensions.find((e) => e.location.toString() === extensionLocation.toString()) || null;
    }
    const userExtensions = await this.scanUserExtensions(profileLocation);
    return userExtensions.find((e) => e.location.toString() === extensionLocation.toString()) || null;
  }
  async scanExtensionManifest(extensionLocation) {
    try {
      return await this.getExtensionManifest(extensionLocation);
    } catch (error) {
      this.logService.warn(`Error while fetching manifest from ${extensionLocation.toString()}`, getErrorMessage(error));
      return null;
    }
  }
  async addExtensionFromGallery(galleryExtension, metadata, profileLocation) {
    const webExtension = await this.toWebExtensionFromGallery(galleryExtension, metadata);
    return this.addWebExtension(webExtension, profileLocation);
  }
  async addExtension(location, metadata, profileLocation) {
    const webExtension = await this.toWebExtension(location, void 0, void 0, void 0, void 0, void 0, void 0, metadata);
    const extension = await this.toScannedExtension(webExtension, false);
    await this.addToInstalledExtensions([webExtension], profileLocation);
    return extension;
  }
  async removeExtension(extension, profileLocation) {
    await this.writeInstalledExtensions(profileLocation, (installedExtensions) => installedExtensions.filter((installedExtension) => !areSameExtensions(installedExtension.identifier, extension.identifier)));
  }
  async updateMetadata(extension, metadata, profileLocation) {
    let updatedExtension = void 0;
    await this.writeInstalledExtensions(profileLocation, (installedExtensions) => {
      const result = [];
      for (const installedExtension of installedExtensions) {
        if (areSameExtensions(extension.identifier, installedExtension.identifier)) {
          installedExtension.metadata = { ...installedExtension.metadata, ...metadata };
          updatedExtension = installedExtension;
          result.push(installedExtension);
        } else {
          result.push(installedExtension);
        }
      }
      return result;
    });
    if (!updatedExtension) {
      throw new Error("Extension not found");
    }
    return this.toScannedExtension(updatedExtension, extension.isBuiltin);
  }
  async copyExtensions(fromProfileLocation, toProfileLocation, filter) {
    const extensionsToCopy = [];
    const fromWebExtensions = await this.readInstalledExtensions(fromProfileLocation);
    await Promise.all(fromWebExtensions.map(async (webExtension) => {
      const scannedExtension = await this.toScannedExtension(webExtension, false);
      if (filter(scannedExtension)) {
        extensionsToCopy.push(webExtension);
      }
    }));
    if (extensionsToCopy.length) {
      await this.addToInstalledExtensions(extensionsToCopy, toProfileLocation);
    }
  }
  async addWebExtension(webExtension, profileLocation) {
    const isSystem = !!(await this.scanSystemExtensions()).find((e) => areSameExtensions(e.identifier, webExtension.identifier));
    const isBuiltin = !!webExtension.metadata?.isBuiltin;
    const extension = await this.toScannedExtension(webExtension, isBuiltin);
    if (isSystem) {
      await this.writeSystemExtensionsCache((systemExtensions) => {
        systemExtensions = systemExtensions.filter((extension2) => !areSameExtensions(extension2.identifier, webExtension.identifier));
        systemExtensions.push(webExtension);
        return systemExtensions;
      });
      return extension;
    }
    if (isBuiltin) {
      await this.writeCustomBuiltinExtensionsCache((customBuiltinExtensions) => {
        customBuiltinExtensions = customBuiltinExtensions.filter((extension2) => !areSameExtensions(extension2.identifier, webExtension.identifier));
        customBuiltinExtensions.push(webExtension);
        return customBuiltinExtensions;
      });
      const installedExtensions = await this.readInstalledExtensions(profileLocation);
      if (installedExtensions.some((e) => areSameExtensions(e.identifier, webExtension.identifier))) {
        await this.addToInstalledExtensions([webExtension], profileLocation);
      }
      return extension;
    }
    await this.addToInstalledExtensions([webExtension], profileLocation);
    return extension;
  }
  async addToInstalledExtensions(webExtensions, profileLocation) {
    await this.writeInstalledExtensions(profileLocation, (installedExtensions) => {
      installedExtensions = installedExtensions.filter((installedExtension) => webExtensions.some((extension) => !areSameExtensions(installedExtension.identifier, extension.identifier)));
      installedExtensions.push(...webExtensions);
      return installedExtensions;
    });
  }
  async scanInstalledExtensions(profileLocation, scanOptions) {
    let installedExtensions = await this.readInstalledExtensions(profileLocation);
    if (!this.uriIdentityService.extUri.isEqual(profileLocation, this.userDataProfilesService.defaultProfile.extensionsResource)) {
      installedExtensions = installedExtensions.filter((i) => !i.metadata?.isApplicationScoped);
      const defaultProfileExtensions = await this.readInstalledExtensions(this.userDataProfilesService.defaultProfile.extensionsResource);
      installedExtensions.push(...defaultProfileExtensions.filter((i) => i.metadata?.isApplicationScoped));
    }
    installedExtensions.sort((a, b) => a.identifier.id < b.identifier.id ? -1 : a.identifier.id > b.identifier.id ? 1 : semver.rcompare(a.version, b.version));
    const result = /* @__PURE__ */ new Map();
    for (const webExtension of installedExtensions) {
      const existing = result.get(webExtension.identifier.id.toLowerCase());
      if (existing && semver.gt(existing.manifest.version, webExtension.version)) {
        continue;
      }
      const extension = await this.toScannedExtension(webExtension, false);
      if (extension.isValid || !scanOptions?.skipInvalidExtensions) {
        result.set(extension.identifier.id.toLowerCase(), extension);
      } else {
        this.logService.info(`Skipping invalid installed extension ${webExtension.identifier.id}`);
      }
    }
    return [...result.values()];
  }
  async toWebExtensionFromGallery(galleryExtension, metadata) {
    const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({
      publisher: galleryExtension.publisher,
      name: galleryExtension.name,
      version: galleryExtension.version,
      targetPlatform: galleryExtension.properties.targetPlatform === TargetPlatform.WEB ? TargetPlatform.WEB : void 0
    }, "extension");
    if (!extensionLocation) {
      throw new Error("No extension gallery service configured.");
    }
    return this.toWebExtensionFromExtensionGalleryResource(
      extensionLocation,
      galleryExtension.identifier,
      galleryExtension.assets.readme ? URI.parse(galleryExtension.assets.readme.uri) : void 0,
      galleryExtension.assets.changelog ? URI.parse(galleryExtension.assets.changelog.uri) : void 0,
      metadata
    );
  }
  async toWebExtensionFromExtensionGalleryResource(extensionLocation, identifier, readmeUri, changelogUri, metadata) {
    const extensionResources = await this.listExtensionResources(extensionLocation);
    const packageNLSResources = this.getPackageNLSResourceMapFromResources(extensionResources);
    const fallbackPackageNLSResource = extensionResources.find((e) => basename(e) === "package.nls.json");
    return this.toWebExtension(
      extensionLocation,
      identifier,
      void 0,
      packageNLSResources,
      fallbackPackageNLSResource ? URI.parse(fallbackPackageNLSResource) : null,
      readmeUri,
      changelogUri,
      metadata
    );
  }
  getPackageNLSResourceMapFromResources(extensionResources) {
    const packageNLSResources = /* @__PURE__ */ new Map();
    extensionResources.forEach((e) => {
      const regexResult = /package\.nls\.([\w-]+)\.json/.exec(basename(e));
      if (regexResult?.[1]) {
        packageNLSResources.set(regexResult[1], URI.parse(e));
      }
    });
    return packageNLSResources;
  }
  async toWebExtension(extensionLocation, identifier, manifest, packageNLSUris, fallbackPackageNLSUri, readmeUri, changelogUri, metadata) {
    if (!manifest) {
      try {
        manifest = await this.getExtensionManifest(extensionLocation);
      } catch (error) {
        throw new Error(`Error while fetching manifest from the location '${extensionLocation.toString()}'. ${getErrorMessage(error)}`);
      }
    }
    if (!this.extensionManifestPropertiesService.canExecuteOnWeb(manifest)) {
      throw new Error(localize("not a web extension", "Cannot add '{0}' because this extension is not a web extension.", manifest.displayName || manifest.name));
    }
    if (fallbackPackageNLSUri === void 0) {
      try {
        fallbackPackageNLSUri = joinPath(extensionLocation, "package.nls.json");
        await this.extensionResourceLoaderService.readExtensionResource(fallbackPackageNLSUri);
      } catch (error) {
        fallbackPackageNLSUri = void 0;
      }
    }
    const defaultManifestTranslations = fallbackPackageNLSUri ? URI.isUri(fallbackPackageNLSUri) ? await this.getTranslations(fallbackPackageNLSUri) : fallbackPackageNLSUri : null;
    return {
      identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name), uuid: identifier?.uuid },
      version: manifest.version,
      location: extensionLocation,
      manifest,
      readmeUri,
      changelogUri,
      packageNLSUris,
      fallbackPackageNLSUri: URI.isUri(fallbackPackageNLSUri) ? fallbackPackageNLSUri : void 0,
      defaultManifestTranslations,
      metadata
    };
  }
  async toScannedExtension(webExtension, isBuiltin, type = ExtensionType.User) {
    const validations = [];
    let manifest = webExtension.manifest;
    if (!manifest) {
      try {
        manifest = await this.getExtensionManifest(webExtension.location);
      } catch (error) {
        validations.push([Severity.Error, `Error while fetching manifest from the location '${webExtension.location}'. ${getErrorMessage(error)}`]);
      }
    }
    if (!manifest) {
      const [publisher, name] = webExtension.identifier.id.split(".");
      manifest = {
        name,
        publisher,
        version: webExtension.version,
        engines: { vscode: "*" }
      };
    }
    const packageNLSUri = webExtension.packageNLSUris?.get(Language.value().toLowerCase());
    const fallbackPackageNLS = webExtension.defaultManifestTranslations ?? webExtension.fallbackPackageNLSUri;
    if (packageNLSUri) {
      manifest = await this.translateManifest(manifest, packageNLSUri, fallbackPackageNLS);
    } else if (fallbackPackageNLS) {
      manifest = await this.translateManifest(manifest, fallbackPackageNLS);
    }
    const uuid = webExtension.metadata?.id;
    validations.push(...validateExtensionManifest(this.productService.version, this.productService.date, webExtension.location, manifest, false));
    let isValid = true;
    for (const [severity, message] of validations) {
      if (severity === Severity.Error) {
        isValid = false;
        this.logService.error(message);
      }
    }
    if (manifest.enabledApiProposals) {
      manifest.enabledApiProposals = parseEnabledApiProposalNames([...manifest.enabledApiProposals]);
    }
    return {
      identifier: { id: webExtension.identifier.id, uuid: webExtension.identifier.uuid || uuid },
      location: webExtension.location,
      manifest,
      type,
      isBuiltin,
      readmeUrl: webExtension.readmeUri,
      changelogUrl: webExtension.changelogUri,
      metadata: webExtension.metadata,
      targetPlatform: TargetPlatform.WEB,
      validations,
      isValid,
      preRelease: !!webExtension.metadata?.preRelease
    };
  }
  async listExtensionResources(extensionLocation) {
    try {
      const result = await this.extensionResourceLoaderService.readExtensionResource(extensionLocation);
      return JSON.parse(result);
    } catch (error) {
      this.logService.warn("Error while fetching extension resources list", getErrorMessage(error));
    }
    return [];
  }
  async translateManifest(manifest, nlsURL, fallbackNLS) {
    try {
      const translations = URI.isUri(nlsURL) ? await this.getTranslations(nlsURL) : nlsURL;
      const fallbackTranslations = URI.isUri(fallbackNLS) ? await this.getTranslations(fallbackNLS) : fallbackNLS;
      if (translations) {
        manifest = localizeManifest(this.logService, manifest, translations, fallbackTranslations);
      }
    } catch (error) {
    }
    return manifest;
  }
  async getExtensionManifest(location) {
    const url = joinPath(location, "package.json");
    const content = await this.extensionResourceLoaderService.readExtensionResource(url);
    return JSON.parse(content);
  }
  async getTranslations(nlsUrl) {
    try {
      const content = await this.extensionResourceLoaderService.readExtensionResource(nlsUrl);
      return JSON.parse(content);
    } catch (error) {
      this.logService.error(`Error while fetching translations of an extension`, nlsUrl.toString(), getErrorMessage(error));
    }
    return void 0;
  }
  async readInstalledExtensions(profileLocation) {
    return this.withWebExtensions(profileLocation);
  }
  writeInstalledExtensions(profileLocation, updateFn) {
    return this.withWebExtensions(profileLocation, updateFn);
  }
  readCustomBuiltinExtensionsCache() {
    return this.withWebExtensions(this.customBuiltinExtensionsCacheResource);
  }
  writeCustomBuiltinExtensionsCache(updateFn) {
    return this.withWebExtensions(this.customBuiltinExtensionsCacheResource, updateFn);
  }
  readSystemExtensionsCache() {
    return this.withWebExtensions(this.systemExtensionsCacheResource);
  }
  writeSystemExtensionsCache(updateFn) {
    return this.withWebExtensions(this.systemExtensionsCacheResource, updateFn);
  }
  async withWebExtensions(file, updateFn) {
    if (!file) {
      return [];
    }
    return this.getResourceAccessQueue(file).queue(async () => {
      let webExtensions = [];
      try {
        const content = await this.fileService.readFile(file);
        const storedWebExtensions = JSON.parse(content.value.toString());
        for (const e of storedWebExtensions) {
          if (!e.location || !e.identifier || !e.version) {
            this.logService.info("Ignoring invalid extension while scanning", storedWebExtensions);
            continue;
          }
          let packageNLSUris;
          if (e.packageNLSUris) {
            packageNLSUris = /* @__PURE__ */ new Map();
            Object.entries(e.packageNLSUris).forEach(([key, value]) => packageNLSUris.set(key, URI.revive(value)));
          }
          webExtensions.push({
            identifier: e.identifier,
            version: e.version,
            location: URI.revive(e.location),
            manifest: e.manifest,
            readmeUri: URI.revive(e.readmeUri),
            changelogUri: URI.revive(e.changelogUri),
            packageNLSUris,
            fallbackPackageNLSUri: URI.revive(e.fallbackPackageNLSUri),
            defaultManifestTranslations: e.defaultManifestTranslations,
            packageNLSUri: URI.revive(e.packageNLSUri),
            metadata: e.metadata
          });
        }
        try {
          webExtensions = await this.migrateWebExtensions(webExtensions, file);
        } catch (error) {
          this.logService.error(`Error while migrating scanned extensions in ${file.toString()}`, getErrorMessage(error));
        }
      } catch (error) {
        if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
          this.logService.error(error);
        }
      }
      if (updateFn) {
        await this.storeWebExtensions(webExtensions = updateFn(webExtensions), file);
      }
      return webExtensions;
    });
  }
  async migrateWebExtensions(webExtensions, file) {
    let update = false;
    webExtensions = await Promise.all(webExtensions.map(async (webExtension) => {
      if (!webExtension.manifest) {
        try {
          webExtension.manifest = await this.getExtensionManifest(webExtension.location);
          update = true;
        } catch (error) {
          this.logService.error(`Error while updating manifest of an extension in ${file.toString()}`, webExtension.identifier.id, getErrorMessage(error));
        }
      }
      if (isUndefined(webExtension.defaultManifestTranslations)) {
        if (webExtension.fallbackPackageNLSUri) {
          try {
            const content = await this.extensionResourceLoaderService.readExtensionResource(webExtension.fallbackPackageNLSUri);
            webExtension.defaultManifestTranslations = JSON.parse(content);
            update = true;
          } catch (error) {
            this.logService.error(`Error while fetching default manifest translations of an extension`, webExtension.identifier.id, getErrorMessage(error));
          }
        } else {
          update = true;
          webExtension.defaultManifestTranslations = null;
        }
      }
      const migratedLocation = migratePlatformSpecificExtensionGalleryResourceURL(webExtension.location, TargetPlatform.WEB);
      if (migratedLocation) {
        update = true;
        webExtension.location = migratedLocation;
      }
      if (isUndefined(webExtension.metadata?.hasPreReleaseVersion) && webExtension.metadata?.preRelease) {
        update = true;
        webExtension.metadata.hasPreReleaseVersion = true;
      }
      return webExtension;
    }));
    if (update) {
      await this.storeWebExtensions(webExtensions, file);
    }
    return webExtensions;
  }
  async storeWebExtensions(webExtensions, file) {
    function toStringDictionary(dictionary) {
      if (!dictionary) {
        return void 0;
      }
      const result = /* @__PURE__ */ Object.create(null);
      dictionary.forEach((value, key) => result[key] = value.toJSON());
      return result;
    }
    const storedWebExtensions = webExtensions.map((e) => ({
      identifier: e.identifier,
      version: e.version,
      manifest: e.manifest,
      location: e.location.toJSON(),
      readmeUri: e.readmeUri?.toJSON(),
      changelogUri: e.changelogUri?.toJSON(),
      packageNLSUris: toStringDictionary(e.packageNLSUris),
      defaultManifestTranslations: e.defaultManifestTranslations,
      fallbackPackageNLSUri: e.fallbackPackageNLSUri?.toJSON(),
      metadata: e.metadata
    }));
    await this.fileService.writeFile(file, VSBuffer.fromString(JSON.stringify(storedWebExtensions)));
  }
  getResourceAccessQueue(file) {
    let resourceQueue = this.resourcesAccessQueueMap.get(file);
    if (!resourceQueue) {
      this.resourcesAccessQueueMap.set(file, resourceQueue = new Queue());
    }
    return resourceQueue;
  }
};
WebExtensionsScannerService = __decorateClass([
  __decorateParam(0, IBrowserWorkbenchEnvironmentService),
  __decorateParam(1, IBuiltinExtensionsScannerService),
  __decorateParam(2, IFileService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IExtensionGalleryService),
  __decorateParam(5, IExtensionManifestPropertiesService),
  __decorateParam(6, IExtensionResourceLoaderService),
  __decorateParam(7, IExtensionStorageService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, IProductService),
  __decorateParam(10, IUserDataProfilesService),
  __decorateParam(11, IUriIdentityService),
  __decorateParam(12, ILifecycleService)
], WebExtensionsScannerService);
if (isWeb) {
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: "workbench.extensions.action.openInstalledWebExtensionsResource",
        title: localize2("openInstalledWebExtensionsResource", "Open Installed Web Extensions Resource"),
        category: Categories.Developer,
        f1: true,
        precondition: IsWebContext
      });
    }
    run(serviceAccessor) {
      const editorService = serviceAccessor.get(IEditorService);
      const userDataProfileService = serviceAccessor.get(IUserDataProfileService);
      editorService.openEditor({ resource: userDataProfileService.currentProfile.extensionsResource });
    }
  });
}
registerSingleton(IWebExtensionsScannerService, WebExtensionsScannerService, InstantiationType.Delayed);
export {
  WebExtensionsScannerService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2Jyb3dzZXIvd2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUJ1aWx0aW5FeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsIEV4dGVuc2lvblR5cGUsIElFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uTWFuaWZlc3QsIFRhcmdldFBsYXRmb3JtLCBJUmVsYXhlZEV4dGVuc2lvbk1hbmlmZXN0LCBwYXJzZUVuYWJsZWRBcGlQcm9wb3NhbE5hbWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTY2FubmVkRXh0ZW5zaW9uLCBJV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLCBTY2FuT3B0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGlzV2ViLCBMYW5ndWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFF1ZXVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIElFeHRlbnNpb25JbmZvLCBJR2FsbGVyeUV4dGVuc2lvbiwgSUdhbGxlcnlNZXRhZGF0YSwgTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zLCBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQsIGdldEV4dGVuc2lvbklkLCBpc01hbGljaW91cyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVRyYW5zbGF0aW9ucywgbG9jYWxpemVNYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk5scy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIHNlbXZlciBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZW12ZXIvc2VtdmVyLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nLCBpc1VuZGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSwgbWlncmF0ZVBsYXRmb3JtU3BlY2lmaWNFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VVUkwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25SZXNvdXJjZUxvYWRlci9jb21tb24vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IElzV2ViQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25TdG9yYWdlLmpzJztcbmltcG9ydCB7IGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdmFsaWRhdGVFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvblZhbGlkYXRvci5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuXG50eXBlIEdhbGxlcnlFeHRlbnNpb25JbmZvID0geyByZWFkb25seSBpZDogc3RyaW5nOyBwcmVSZWxlYXNlPzogYm9vbGVhbjsgbWlncmF0ZVN0b3JhZ2VGcm9tPzogc3RyaW5nIH07XG50eXBlIEV4dGVuc2lvbkluZm8gPSB7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHByZVJlbGVhc2U6IGJvb2xlYW4gfTtcblxuZnVuY3Rpb24gaXNHYWxsZXJ5RXh0ZW5zaW9uSW5mbyhvYmo6IHVua25vd24pOiBvYmogaXMgR2FsbGVyeUV4dGVuc2lvbkluZm8ge1xuXHRjb25zdCBnYWxsZXJ5RXh0ZW5zaW9uSW5mbyA9IG9iaiBhcyBHYWxsZXJ5RXh0ZW5zaW9uSW5mbyB8IHVuZGVmaW5lZDtcblx0cmV0dXJuIHR5cGVvZiBnYWxsZXJ5RXh0ZW5zaW9uSW5mbz8uaWQgPT09ICdzdHJpbmcnXG5cdFx0JiYgKGdhbGxlcnlFeHRlbnNpb25JbmZvLnByZVJlbGVhc2UgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgZ2FsbGVyeUV4dGVuc2lvbkluZm8ucHJlUmVsZWFzZSA9PT0gJ2Jvb2xlYW4nKVxuXHRcdCYmIChnYWxsZXJ5RXh0ZW5zaW9uSW5mby5taWdyYXRlU3RvcmFnZUZyb20gPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgZ2FsbGVyeUV4dGVuc2lvbkluZm8ubWlncmF0ZVN0b3JhZ2VGcm9tID09PSAnc3RyaW5nJyk7XG59XG5cbmZ1bmN0aW9uIGlzVXJpQ29tcG9uZW50cyhvYmo6IHVua25vd24pOiBvYmogaXMgVXJpQ29tcG9uZW50cyB7XG5cdGlmICghb2JqKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IHRoaW5nID0gb2JqIGFzIFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQ7XG5cdHJldHVybiB0eXBlb2YgdGhpbmc/LnBhdGggPT09ICdzdHJpbmcnICYmXG5cdFx0dHlwZW9mIHRoaW5nPy5zY2hlbWUgPT09ICdzdHJpbmcnO1xufVxuXG5pbnRlcmZhY2UgSVN0b3JlZFdlYkV4dGVuc2lvbiB7XG5cdHJlYWRvbmx5IGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyO1xuXHRyZWFkb25seSB2ZXJzaW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxvY2F0aW9uOiBVcmlDb21wb25lbnRzO1xuXHRyZWFkb25seSBtYW5pZmVzdD86IElFeHRlbnNpb25NYW5pZmVzdDtcblx0cmVhZG9ubHkgcmVhZG1lVXJpPzogVXJpQ29tcG9uZW50cztcblx0cmVhZG9ubHkgY2hhbmdlbG9nVXJpPzogVXJpQ29tcG9uZW50cztcblx0Ly8gZGVwcmVjYXRlZCBpbiBmYXZvciBvZiBwYWNrYWdlTkxTVXJpcyAmIGZhbGxiYWNrUGFja2FnZU5MU1VyaVxuXHRyZWFkb25seSBwYWNrYWdlTkxTVXJpPzogVXJpQ29tcG9uZW50cztcblx0cmVhZG9ubHkgcGFja2FnZU5MU1VyaXM/OiBJU3RyaW5nRGljdGlvbmFyeTxVcmlDb21wb25lbnRzPjtcblx0cmVhZG9ubHkgZmFsbGJhY2tQYWNrYWdlTkxTVXJpPzogVXJpQ29tcG9uZW50cztcblx0cmVhZG9ubHkgZGVmYXVsdE1hbmlmZXN0VHJhbnNsYXRpb25zPzogSVRyYW5zbGF0aW9ucyB8IG51bGw7XG5cdHJlYWRvbmx5IG1ldGFkYXRhPzogTWV0YWRhdGE7XG59XG5cbmludGVyZmFjZSBJV2ViRXh0ZW5zaW9uIHtcblx0aWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXI7XG5cdHZlcnNpb246IHN0cmluZztcblx0bG9jYXRpb246IFVSSTtcblx0bWFuaWZlc3Q/OiBJRXh0ZW5zaW9uTWFuaWZlc3Q7XG5cdHJlYWRtZVVyaT86IFVSSTtcblx0Y2hhbmdlbG9nVXJpPzogVVJJO1xuXHQvLyBkZXByZWNhdGVkIGluIGZhdm9yIG9mIHBhY2thZ2VOTFNVcmlzICYgZmFsbGJhY2tQYWNrYWdlTkxTVXJpXG5cdHBhY2thZ2VOTFNVcmk/OiBVUkk7XG5cdHBhY2thZ2VOTFNVcmlzPzogTWFwPHN0cmluZywgVVJJPjtcblx0ZmFsbGJhY2tQYWNrYWdlTkxTVXJpPzogVVJJO1xuXHRkZWZhdWx0TWFuaWZlc3RUcmFuc2xhdGlvbnM/OiBJVHJhbnNsYXRpb25zIHwgbnVsbDtcblx0bWV0YWRhdGE/OiBNZXRhZGF0YTtcbn1cblxuZXhwb3J0IGNsYXNzIFdlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHN5c3RlbUV4dGVuc2lvbnNDYWNoZVJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZVJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVzb3VyY2VzQWNjZXNzUXVldWVNYXAgPSBuZXcgUmVzb3VyY2VNYXA8UXVldWU8SVdlYkV4dGVuc2lvbltdPj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQnVpbHRpbkV4dGVuc2lvbnNTY2FubmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGJ1aWx0aW5FeHRlbnNpb25zU2Nhbm5lclNlcnZpY2U6IElCdWlsdGluRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBnYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2U6IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TdG9yYWdlU2VydmljZTogSUV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHRoaXMuc3lzdGVtRXh0ZW5zaW9uc0NhY2hlUmVzb3VyY2UgPSBqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UudXNlclJvYW1pbmdEYXRhSG9tZSwgJ3N5c3RlbUV4dGVuc2lvbnNDYWNoZS5qc29uJyk7XG5cdFx0XHR0aGlzLmN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zQ2FjaGVSZXNvdXJjZSA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLCAnY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZS5qc29uJyk7XG5cblx0XHRcdC8vIEV2ZW50dWFsbHkgdXBkYXRlIGNhY2hlc1xuXHRcdFx0bGlmZWN5Y2xlU2VydmljZS53aGVuKExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpLnRoZW4oKCkgPT4gdGhpcy51cGRhdGVDYWNoZXMoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNJbmZvUHJvbWlzZTogUHJvbWlzZTx7IGV4dGVuc2lvbnM6IEV4dGVuc2lvbkluZm9bXTsgZXh0ZW5zaW9uc1RvTWlncmF0ZTogW3N0cmluZywgc3RyaW5nXVtdOyBleHRlbnNpb25Mb2NhdGlvbnM6IFVSSVtdOyBleHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VzOiBVUklbXSB9PiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNJbmZvRnJvbUVudigpOiBQcm9taXNlPHsgZXh0ZW5zaW9uczogRXh0ZW5zaW9uSW5mb1tdOyBleHRlbnNpb25zVG9NaWdyYXRlOiBbc3RyaW5nLCBzdHJpbmddW107IGV4dGVuc2lvbkxvY2F0aW9uczogVVJJW107IGV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZXM6IFVSSVtdIH0+IHtcblx0XHRpZiAoIXRoaXMuX2N1c3RvbUJ1aWx0aW5FeHRlbnNpb25zSW5mb1Byb21pc2UpIHtcblx0XHRcdHRoaXMuX2N1c3RvbUJ1aWx0aW5FeHRlbnNpb25zSW5mb1Byb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsZXQgZXh0ZW5zaW9uczogRXh0ZW5zaW9uSW5mb1tdID0gW107XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkxvY2F0aW9uczogVVJJW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlczogVVJJW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uc1RvTWlncmF0ZTogW3N0cmluZywgc3RyaW5nXVtdID0gW107XG5cdFx0XHRcdGNvbnN0IGN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zSW5mbyA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnMgJiYgQXJyYXkuaXNBcnJheSh0aGlzLmVudmlyb25tZW50U2VydmljZS5vcHRpb25zLmFkZGl0aW9uYWxCdWlsdGluRXh0ZW5zaW9ucylcblx0XHRcdFx0XHQ/IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnMuYWRkaXRpb25hbEJ1aWx0aW5FeHRlbnNpb25zLm1hcChhZGRpdGlvbmFsQnVpbHRpbkV4dGVuc2lvbiA9PiBpc1N0cmluZyhhZGRpdGlvbmFsQnVpbHRpbkV4dGVuc2lvbikgPyB7IGlkOiBhZGRpdGlvbmFsQnVpbHRpbkV4dGVuc2lvbiB9IDogYWRkaXRpb25hbEJ1aWx0aW5FeHRlbnNpb24pXG5cdFx0XHRcdFx0OiBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBlIG9mIGN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zSW5mbykge1xuXHRcdFx0XHRcdGlmIChpc0dhbGxlcnlFeHRlbnNpb25JbmZvKGUpKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb25zLnB1c2goeyBpZDogZS5pZCwgcHJlUmVsZWFzZTogISFlLnByZVJlbGVhc2UgfSk7XG5cdFx0XHRcdFx0XHRpZiAoZS5taWdyYXRlU3RvcmFnZUZyb20pIHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uc1RvTWlncmF0ZS5wdXNoKFtlLm1pZ3JhdGVTdG9yYWdlRnJvbSwgZS5pZF0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNVcmlDb21wb25lbnRzKGUpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25Mb2NhdGlvbiA9IFVSSS5yZXZpdmUoZSk7XG5cdFx0XHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UuaXNFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2UoZXh0ZW5zaW9uTG9jYXRpb24pKSB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZXMucHVzaChleHRlbnNpb25Mb2NhdGlvbik7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25Mb2NhdGlvbnMucHVzaChleHRlbnNpb25Mb2NhdGlvbik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmNoZWNrQWRkaXRpb25hbEJ1aWx0aW5FeHRlbnNpb25zKGV4dGVuc2lvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdGb3VuZCBhZGRpdGlvbmFsIGJ1aWx0aW4gZ2FsbGVyeSBleHRlbnNpb25zIGluIGVudicsIGV4dGVuc2lvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHRlbnNpb25Mb2NhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0ZvdW5kIGFkZGl0aW9uYWwgYnVpbHRpbiBsb2NhdGlvbiBleHRlbnNpb25zIGluIGVudicsIGV4dGVuc2lvbkxvY2F0aW9ucy5tYXAoZSA9PiBlLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnRm91bmQgYWRkaXRpb25hbCBidWlsdGluIGV4dGVuc2lvbiBnYWxsZXJ5IHJlc291cmNlcyBpbiBlbnYnLCBleHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VzLm1hcChlID0+IGUudG9TdHJpbmcoKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IGV4dGVuc2lvbnMsIGV4dGVuc2lvbnNUb01pZ3JhdGUsIGV4dGVuc2lvbkxvY2F0aW9ucywgZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlcyB9O1xuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2N1c3RvbUJ1aWx0aW5FeHRlbnNpb25zSW5mb1Byb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNoZWNrQWRkaXRpb25hbEJ1aWx0aW5FeHRlbnNpb25zKGV4dGVuc2lvbnM6IEV4dGVuc2lvbkluZm9bXSk6IFByb21pc2U8RXh0ZW5zaW9uSW5mb1tdPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpO1xuXHRcdGNvbnN0IHJlc3VsdDogRXh0ZW5zaW9uSW5mb1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKGlzTWFsaWNpb3VzKHsgaWQ6IGV4dGVuc2lvbi5pZCB9LCBleHRlbnNpb25zQ29udHJvbE1hbmlmZXN0Lm1hbGljaW91cykpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYENoZWNraW5nIGFkZGl0aW9uYWwgYnVpbHRpbiBleHRlbnNpb25zOiBJZ25vcmluZyAnJHtleHRlbnNpb24uaWR9JyBiZWNhdXNlIGl0IGlzIHJlcG9ydGVkIHRvIGJlIG1hbGljaW91cy5gKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkZXByZWNhdGlvbkluZm8gPSBleHRlbnNpb25zQ29udHJvbE1hbmlmZXN0LmRlcHJlY2F0ZWRbZXh0ZW5zaW9uLmlkLnRvTG93ZXJDYXNlKCldO1xuXHRcdFx0aWYgKGRlcHJlY2F0aW9uSW5mbz8uZXh0ZW5zaW9uPy5hdXRvTWlncmF0ZSkge1xuXHRcdFx0XHRjb25zdCBwcmVSZWxlYXNlRXh0ZW5zaW9uSWQgPSBkZXByZWNhdGlvbkluZm8uZXh0ZW5zaW9uLmlkO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgQ2hlY2tpbmcgYWRkaXRpb25hbCBidWlsdGluIGV4dGVuc2lvbnM6ICcke2V4dGVuc2lvbi5pZH0nIGlzIGRlcHJlY2F0ZWQsIGluc3RlYWQgdXNpbmcgJyR7cHJlUmVsZWFzZUV4dGVuc2lvbklkfSdgKTtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyBpZDogcHJlUmVsZWFzZUV4dGVuc2lvbklkLCBwcmVSZWxlYXNlOiAhIWV4dGVuc2lvbi5wcmVSZWxlYXNlIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBBbGwgc3lzdGVtIGV4dGVuc2lvbnMgYnVuZGxlZCB3aXRoIHRoZSBwcm9kdWN0XG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIHJlYWRTeXN0ZW1FeHRlbnNpb25zKCk6IFByb21pc2U8SUV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3Qgc3lzdGVtRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuYnVpbHRpbkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuQnVpbHRpbkV4dGVuc2lvbnMoKTtcblx0XHRjb25zdCBjYWNoZWRTeXN0ZW1FeHRlbnNpb25zID0gYXdhaXQgUHJvbWlzZS5hbGwoKGF3YWl0IHRoaXMucmVhZFN5c3RlbUV4dGVuc2lvbnNDYWNoZSgpKS5tYXAoZSA9PiB0aGlzLnRvU2Nhbm5lZEV4dGVuc2lvbihlLCB0cnVlLCBFeHRlbnNpb25UeXBlLlN5c3RlbSkpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBJRXh0ZW5zaW9uPigpO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIFsuLi5zeXN0ZW1FeHRlbnNpb25zLCAuLi5jYWNoZWRTeXN0ZW1FeHRlbnNpb25zXSkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSByZXN1bHQuZ2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdC8vIEluY2FzZSB0aGVyZSBhcmUgZHVwbGljYXRlcyBhbHdheXMgdGFrZSB0aGUgbGF0ZXN0IHZlcnNpb25cblx0XHRcdFx0aWYgKHNlbXZlci5ndChleGlzdGluZy5tYW5pZmVzdC52ZXJzaW9uLCBleHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbikpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnNldChleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLCBleHRlbnNpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gWy4uLnJlc3VsdC52YWx1ZXMoKV07XG5cdH1cblxuXHQvKipcblx0ICogQWxsIGV4dGVuc2lvbnMgZGVmaW5lZCB2aWEgYGFkZGl0aW9uYWxCdWlsdGluRXh0ZW5zaW9uc2AgQVBJXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIHJlYWRDdXN0b21CdWlsdGluRXh0ZW5zaW9ucyhzY2FuT3B0aW9ucz86IFNjYW5PcHRpb25zKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgW2N1c3RvbUJ1aWx0aW5FeHRlbnNpb25zRnJvbUxvY2F0aW9ucywgY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNGcm9tR2FsbGVyeV0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLmdldEN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zRnJvbUxvY2F0aW9ucyhzY2FuT3B0aW9ucyksXG5cdFx0XHR0aGlzLmdldEN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zRnJvbUdhbGxlcnkoc2Nhbk9wdGlvbnMpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zOiBJU2Nhbm5lZEV4dGVuc2lvbltdID0gWy4uLmN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zRnJvbUxvY2F0aW9ucywgLi4uY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNGcm9tR2FsbGVyeV07XG5cdFx0YXdhaXQgdGhpcy5taWdyYXRlRXh0ZW5zaW9uc1N0b3JhZ2UoY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnMpO1xuXHRcdHJldHVybiBjdXN0b21CdWlsdGluRXh0ZW5zaW9ucztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0Q3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNGcm9tTG9jYXRpb25zKHNjYW5PcHRpb25zPzogU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCB7IGV4dGVuc2lvbkxvY2F0aW9ucyB9ID0gYXdhaXQgdGhpcy5yZWFkQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNJbmZvRnJvbUVudigpO1xuXHRcdGlmICghZXh0ZW5zaW9uTG9jYXRpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IElTY2FubmVkRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoZXh0ZW5zaW9uTG9jYXRpb25zLm1hcChhc3luYyBleHRlbnNpb25Mb2NhdGlvbiA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB3ZWJFeHRlbnNpb24gPSBhd2FpdCB0aGlzLnRvV2ViRXh0ZW5zaW9uKGV4dGVuc2lvbkxvY2F0aW9uKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy50b1NjYW5uZWRFeHRlbnNpb24od2ViRXh0ZW5zaW9uLCB0cnVlKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbi5pc1ZhbGlkIHx8ICFzY2FuT3B0aW9ucz8uc2tpcEludmFsaWRFeHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgU2tpcHBpbmcgaW52YWxpZCBhZGRpdGlvbmFsIGJ1aWx0aW4gZXh0ZW5zaW9uICR7d2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBFcnJvciB3aGlsZSBmZXRjaGluZyB0aGUgYWRkaXRpb25hbCBidWlsdGluIGV4dGVuc2lvbiAke2V4dGVuc2lvbkxvY2F0aW9uLnRvU3RyaW5nKCl9LmAsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0Zyb21HYWxsZXJ5KHNjYW5PcHRpb25zPzogU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRpZiAoIXRoaXMuZ2FsbGVyeVNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdJZ25vcmluZyBmZXRjaGluZyBhZGRpdGlvbmFsIGJ1aWx0aW4gZXh0ZW5zaW9ucyBmcm9tIGdhbGxlcnkgYXMgaXQgaXMgZGlzYWJsZWQuJyk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogSVNjYW5uZWRFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHsgZXh0ZW5zaW9ucywgZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlcyB9ID0gYXdhaXQgdGhpcy5yZWFkQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNJbmZvRnJvbUVudigpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjYWNoZVZhbHVlID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRleHRlbnNpb25zOiBleHRlbnNpb25zLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSksXG5cdFx0XHRcdGV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZXM6IGV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZXMubWFwKGUgPT4gZS50b1N0cmluZygpKS5zb3J0KClcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgdXNlQ2FjaGUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldCgnYWRkaXRpb25hbEJ1aWx0aW5FeHRlbnNpb25zJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCAne30nKSA9PT0gY2FjaGVWYWx1ZTtcblx0XHRcdGNvbnN0IHdlYkV4dGVuc2lvbnMgPSBhd2FpdCAodXNlQ2FjaGUgPyB0aGlzLmdldEN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zRnJvbUNhY2hlKCkgOiB0aGlzLnVwZGF0ZUN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zQ2FjaGUoKSk7XG5cdFx0XHRpZiAod2ViRXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwod2ViRXh0ZW5zaW9ucy5tYXAoYXN5bmMgd2ViRXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy50b1NjYW5uZWRFeHRlbnNpb24od2ViRXh0ZW5zaW9uLCB0cnVlKTtcblx0XHRcdFx0XHRcdGlmIChleHRlbnNpb24uaXNWYWxpZCB8fCAhc2Nhbk9wdGlvbnM/LnNraXBJbnZhbGlkRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFNraXBwaW5nIGludmFsaWQgYWRkaXRpb25hbCBidWlsdGluIGdhbGxlcnkgZXh0ZW5zaW9uICR7d2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9YCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBJZ25vcmluZyBhZGRpdGlvbmFsIGJ1aWx0aW4gZXh0ZW5zaW9uICR7d2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9IGJlY2F1c2UgdGhlcmUgaXMgYW4gZXJyb3Igd2hpbGUgY29udmVydGluZyBpdCBpbnRvIHNjYW5uZWQgZXh0ZW5zaW9uYCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdhZGRpdGlvbmFsQnVpbHRpbkV4dGVuc2lvbnMnLCBjYWNoZVZhbHVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdJZ25vcmluZyBmb2xsb3dpbmcgYWRkaXRpb25hbCBidWlsdGluIGV4dGVuc2lvbnMgYXMgdGhlcmUgaXMgYW4gZXJyb3Igd2hpbGUgZmV0Y2hpbmcgdGhlbSBmcm9tIGdhbGxlcnknLCBleHRlbnNpb25zLm1hcCgoeyBpZCB9KSA9PiBpZCksIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0Zyb21DYWNoZSgpOiBQcm9taXNlPElXZWJFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IGNhY2hlZEN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zID0gYXdhaXQgdGhpcy5yZWFkQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZSgpO1xuXHRcdGNvbnN0IHdlYkV4dGVuc2lvbnNNYXAgPSBuZXcgTWFwPHN0cmluZywgSVdlYkV4dGVuc2lvbj4oKTtcblx0XHRmb3IgKGNvbnN0IHdlYkV4dGVuc2lvbiBvZiBjYWNoZWRDdXN0b21CdWlsdGluRXh0ZW5zaW9ucykge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB3ZWJFeHRlbnNpb25zTWFwLmdldCh3ZWJFeHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHQvLyBJbmNhc2UgdGhlcmUgYXJlIGR1cGxpY2F0ZXMgYWx3YXlzIHRha2UgdGhlIGxhdGVzdCB2ZXJzaW9uXG5cdFx0XHRcdGlmIChzZW12ZXIuZ3QoZXhpc3RpbmcudmVyc2lvbiwgd2ViRXh0ZW5zaW9uLnZlcnNpb24pKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8qIFVwZGF0ZSBwcmVSZWxlYXNlIGZsYWcgaW4gdGhlIGNhY2hlIC0gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE0MjgzMSAqL1xuXHRcdFx0aWYgKHdlYkV4dGVuc2lvbi5tZXRhZGF0YT8uaXNQcmVSZWxlYXNlVmVyc2lvbiAmJiAhd2ViRXh0ZW5zaW9uLm1ldGFkYXRhPy5wcmVSZWxlYXNlKSB7XG5cdFx0XHRcdHdlYkV4dGVuc2lvbi5tZXRhZGF0YS5wcmVSZWxlYXNlID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHdlYkV4dGVuc2lvbnNNYXAuc2V0KHdlYkV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCksIHdlYkV4dGVuc2lvbik7XG5cdFx0fVxuXHRcdHJldHVybiBbLi4ud2ViRXh0ZW5zaW9uc01hcC52YWx1ZXMoKV07XG5cdH1cblxuXHRwcml2YXRlIF9taWdyYXRlRXh0ZW5zaW9uc1N0b3JhZ2VQcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFzeW5jIG1pZ3JhdGVFeHRlbnNpb25zU3RvcmFnZShjdXN0b21CdWlsdGluRXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9taWdyYXRlRXh0ZW5zaW9uc1N0b3JhZ2VQcm9taXNlKSB7XG5cdFx0XHR0aGlzLl9taWdyYXRlRXh0ZW5zaW9uc1N0b3JhZ2VQcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBleHRlbnNpb25zVG9NaWdyYXRlIH0gPSBhd2FpdCB0aGlzLnJlYWRDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0luZm9Gcm9tRW52KCk7XG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uc1RvTWlncmF0ZS5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZnJvbUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoZXh0ZW5zaW9uc1RvTWlncmF0ZS5tYXAoKFtpZF0pID0+ICh7IGlkIH0pKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKGV4dGVuc2lvbnNUb01pZ3JhdGUubWFwKGFzeW5jIChbZnJvbSwgdG9dKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB0b0V4dGVuc2lvbiA9IGN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zLmZpbmQoZXh0ZW5zaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGV4dGVuc2lvbi5pZGVudGlmaWVyLCB7IGlkOiB0byB9KSk7XG5cdFx0XHRcdFx0XHRpZiAodG9FeHRlbnNpb24pIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZnJvbUV4dGVuc2lvbiA9IGZyb21FeHRlbnNpb25zLmZpbmQoZXh0ZW5zaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGV4dGVuc2lvbi5pZGVudGlmaWVyLCB7IGlkOiBmcm9tIH0pKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZnJvbUV4dGVuc2lvbk1hbmlmZXN0ID0gZnJvbUV4dGVuc2lvbiA/IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0TWFuaWZlc3QoZnJvbUV4dGVuc2lvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkgOiBudWxsO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmcm9tRXh0ZW5zaW9uSWQgPSBmcm9tRXh0ZW5zaW9uTWFuaWZlc3QgPyBnZXRFeHRlbnNpb25JZChmcm9tRXh0ZW5zaW9uTWFuaWZlc3QucHVibGlzaGVyLCBmcm9tRXh0ZW5zaW9uTWFuaWZlc3QubmFtZSkgOiBmcm9tO1xuXHRcdFx0XHRcdFx0XHRjb25zdCB0b0V4dGVuc2lvbklkID0gZ2V0RXh0ZW5zaW9uSWQodG9FeHRlbnNpb24ubWFuaWZlc3QucHVibGlzaGVyLCB0b0V4dGVuc2lvbi5tYW5pZmVzdC5uYW1lKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5leHRlbnNpb25TdG9yYWdlU2VydmljZS5hZGRUb01pZ3JhdGlvbkxpc3QoZnJvbUV4dGVuc2lvbklkLCB0b0V4dGVuc2lvbklkKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBTa2lwcGVkIG1pZ3JhdGluZyBleHRlbnNpb24gc3RvcmFnZSBmcm9tICcke2Zyb219JyB0byAnJHt0b30nLCBiZWNhdXNlIHRoZSAnJHt0b30nIGV4dGVuc2lvbiBpcyBub3QgZm91bmQuYCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9taWdyYXRlRXh0ZW5zaW9uc1N0b3JhZ2VQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVDYWNoZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy51cGRhdGVTeXN0ZW1FeHRlbnNpb25zQ2FjaGUoKTtcblx0XHRhd2FpdCB0aGlzLnVwZGF0ZUN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zQ2FjaGUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlU3lzdGVtRXh0ZW5zaW9uc0NhY2hlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN5c3RlbUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmJ1aWx0aW5FeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhbkJ1aWx0aW5FeHRlbnNpb25zKCk7XG5cdFx0Y29uc3QgY2FjaGVkU3lzdGVtRXh0ZW5zaW9ucyA9IChhd2FpdCB0aGlzLnJlYWRTeXN0ZW1FeHRlbnNpb25zQ2FjaGUoKSlcblx0XHRcdC5maWx0ZXIoY2FjaGVkID0+IHtcblx0XHRcdFx0Y29uc3Qgc3lzdGVtRXh0ZW5zaW9uID0gc3lzdGVtRXh0ZW5zaW9ucy5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBjYWNoZWQuaWRlbnRpZmllcikpO1xuXHRcdFx0XHRyZXR1cm4gc3lzdGVtRXh0ZW5zaW9uICYmIHNlbXZlci5ndChjYWNoZWQudmVyc2lvbiwgc3lzdGVtRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24pO1xuXHRcdFx0fSk7XG5cdFx0YXdhaXQgdGhpcy53cml0ZVN5c3RlbUV4dGVuc2lvbnNDYWNoZSgoKSA9PiBjYWNoZWRTeXN0ZW1FeHRlbnNpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zQ2FjaGVQcm9taXNlOiBQcm9taXNlPElXZWJFeHRlbnNpb25bXT4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZSgpOiBQcm9taXNlPElXZWJFeHRlbnNpb25bXT4ge1xuXHRcdGlmICghdGhpcy5fdXBkYXRlQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZVByb21pc2UpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZUN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zQ2FjaGVQcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1VwZGF0aW5nIGFkZGl0aW9uYWwgYnVpbHRpbiBleHRlbnNpb25zIGNhY2hlJyk7XG5cdFx0XHRcdGNvbnN0IHsgZXh0ZW5zaW9ucywgZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlcyB9ID0gYXdhaXQgdGhpcy5yZWFkQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNJbmZvRnJvbUVudigpO1xuXHRcdFx0XHRjb25zdCBbZ2FsbGVyeVdlYkV4dGVuc2lvbnMsIGV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVdlYkV4dGVuc2lvbnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdHRoaXMucmVzb2x2ZUJ1aWx0aW5HYWxsZXJ5RXh0ZW5zaW9ucyhleHRlbnNpb25zKSxcblx0XHRcdFx0XHR0aGlzLnJlc29sdmVCdWlsdGluRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlcyhleHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VzKVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0Y29uc3Qgd2ViRXh0ZW5zaW9uc01hcCA9IG5ldyBNYXA8c3RyaW5nLCBJV2ViRXh0ZW5zaW9uPigpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHdlYkV4dGVuc2lvbiBvZiBbLi4uZ2FsbGVyeVdlYkV4dGVuc2lvbnMsIC4uLmV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVdlYkV4dGVuc2lvbnNdKSB7XG5cdFx0XHRcdFx0d2ViRXh0ZW5zaW9uc01hcC5zZXQod2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwgd2ViRXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0aGlzLnJlc29sdmVEZXBlbmRlbmNpZXNBbmRQYWNrZWRFeHRlbnNpb25zKGV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVdlYkV4dGVuc2lvbnMsIHdlYkV4dGVuc2lvbnNNYXApO1xuXHRcdFx0XHRjb25zdCB3ZWJFeHRlbnNpb25zID0gWy4uLndlYkV4dGVuc2lvbnNNYXAudmFsdWVzKCldO1xuXHRcdFx0XHRhd2FpdCB0aGlzLndyaXRlQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZSgoKSA9PiB3ZWJFeHRlbnNpb25zKTtcblx0XHRcdFx0cmV0dXJuIHdlYkV4dGVuc2lvbnM7XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdXBkYXRlQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZVByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVCdWlsdGluRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlcyhleHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VzOiBVUklbXSk6IFByb21pc2U8SVdlYkV4dGVuc2lvbltdPiB7XG5cdFx0aWYgKGV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBJV2ViRXh0ZW5zaW9uPigpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbkluZm9zOiBJRXh0ZW5zaW9uSW5mb1tdID0gW107XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlcy5tYXAoYXN5bmMgZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHdlYkV4dGVuc2lvbiA9IGF3YWl0IHRoaXMudG9XZWJFeHRlbnNpb25Gcm9tRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlKGV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZSk7XG5cdFx0XHRcdHJlc3VsdC5zZXQod2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwgd2ViRXh0ZW5zaW9uKTtcblx0XHRcdFx0ZXh0ZW5zaW9uSW5mb3MucHVzaCh7IGlkOiB3ZWJFeHRlbnNpb24uaWRlbnRpZmllci5pZCwgdmVyc2lvbjogd2ViRXh0ZW5zaW9uLnZlcnNpb24gfSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgSWdub3JpbmcgYWRkaXRpb25hbCBidWlsdGluIGV4dGVuc2lvbiBmcm9tIGdhbGxlcnkgcmVzb3VyY2UgJHtleHRlbnNpb25HYWxsZXJ5UmVzb3VyY2UudG9TdHJpbmcoKX0gYmVjYXVzZSB0aGVyZSBpcyBhbiBlcnJvciB3aGlsZSBjb252ZXJ0aW5nIGl0IGludG8gd2ViIGV4dGVuc2lvbmAsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBnYWxsZXJ5RXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhleHRlbnNpb25JbmZvcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Zm9yIChjb25zdCBnYWxsZXJ5RXh0ZW5zaW9uIG9mIGdhbGxlcnlFeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCB3ZWJFeHRlbnNpb24gPSByZXN1bHQuZ2V0KGdhbGxlcnlFeHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdGlmICh3ZWJFeHRlbnNpb24pIHtcblx0XHRcdFx0cmVzdWx0LnNldChnYWxsZXJ5RXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwge1xuXHRcdFx0XHRcdC4uLndlYkV4dGVuc2lvbixcblx0XHRcdFx0XHRpZGVudGlmaWVyOiB7IGlkOiB3ZWJFeHRlbnNpb24uaWRlbnRpZmllci5pZCwgdXVpZDogZ2FsbGVyeUV4dGVuc2lvbi5pZGVudGlmaWVyLnV1aWQgfSxcblx0XHRcdFx0XHRyZWFkbWVVcmk6IGdhbGxlcnlFeHRlbnNpb24uYXNzZXRzLnJlYWRtZSA/IFVSSS5wYXJzZShnYWxsZXJ5RXh0ZW5zaW9uLmFzc2V0cy5yZWFkbWUudXJpKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjaGFuZ2Vsb2dVcmk6IGdhbGxlcnlFeHRlbnNpb24uYXNzZXRzLmNoYW5nZWxvZyA/IFVSSS5wYXJzZShnYWxsZXJ5RXh0ZW5zaW9uLmFzc2V0cy5jaGFuZ2Vsb2cudXJpKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtZXRhZGF0YTogeyBpc1ByZVJlbGVhc2VWZXJzaW9uOiBnYWxsZXJ5RXh0ZW5zaW9uLnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbiwgcHJlUmVsZWFzZTogZ2FsbGVyeUV4dGVuc2lvbi5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24sIGlzQnVpbHRpbjogdHJ1ZSwgcGlubmVkOiB0cnVlIH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbLi4ucmVzdWx0LnZhbHVlcygpXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUJ1aWx0aW5HYWxsZXJ5RXh0ZW5zaW9ucyhleHRlbnNpb25zOiBJRXh0ZW5zaW9uSW5mb1tdKTogUHJvbWlzZTxJV2ViRXh0ZW5zaW9uW10+IHtcblx0XHRpZiAoZXh0ZW5zaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3Qgd2ViRXh0ZW5zaW9uczogSVdlYkV4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnNNYXAgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnNXaXRoRGVwZW5kZW5jaWVzQW5kUGFja2VkRXh0ZW5zaW9ucyhleHRlbnNpb25zKTtcblx0XHRjb25zdCBtaXNzaW5nRXh0ZW5zaW9ucyA9IGV4dGVuc2lvbnMuZmlsdGVyKCh7IGlkIH0pID0+ICFnYWxsZXJ5RXh0ZW5zaW9uc01hcC5oYXMoaWQudG9Mb3dlckNhc2UoKSkpO1xuXHRcdGlmIChtaXNzaW5nRXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTa2lwcGluZyB0aGUgYWRkaXRpb25hbCBidWlsdGluIGV4dGVuc2lvbnMgYmVjYXVzZSB0aGVpciBjb21wYXRpYmxlIHZlcnNpb25zIGFyZSBub3QgZm91bmQuJywgbWlzc2luZ0V4dGVuc2lvbnMpO1xuXHRcdH1cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbLi4uZ2FsbGVyeUV4dGVuc2lvbnNNYXAudmFsdWVzKCldLm1hcChhc3luYyBnYWxsZXJ5ID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHdlYkV4dGVuc2lvbiA9IGF3YWl0IHRoaXMudG9XZWJFeHRlbnNpb25Gcm9tR2FsbGVyeShnYWxsZXJ5LCB7IGlzUHJlUmVsZWFzZVZlcnNpb246IGdhbGxlcnkucHJvcGVydGllcy5pc1ByZVJlbGVhc2VWZXJzaW9uLCBwcmVSZWxlYXNlOiBnYWxsZXJ5LnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbiwgaXNCdWlsdGluOiB0cnVlIH0pO1xuXHRcdFx0XHR3ZWJFeHRlbnNpb25zLnB1c2god2ViRXh0ZW5zaW9uKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBJZ25vcmluZyBhZGRpdGlvbmFsIGJ1aWx0aW4gZXh0ZW5zaW9uICR7Z2FsbGVyeS5pZGVudGlmaWVyLmlkfSBiZWNhdXNlIHRoZXJlIGlzIGFuIGVycm9yIHdoaWxlIGNvbnZlcnRpbmcgaXQgaW50byB3ZWIgZXh0ZW5zaW9uYCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHJldHVybiB3ZWJFeHRlbnNpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlRGVwZW5kZW5jaWVzQW5kUGFja2VkRXh0ZW5zaW9ucyh3ZWJFeHRlbnNpb25zOiBJV2ViRXh0ZW5zaW9uW10sIHJlc3VsdDogTWFwPHN0cmluZywgSVdlYkV4dGVuc2lvbj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb25JbmZvczogSUV4dGVuc2lvbkluZm9bXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgd2ViRXh0ZW5zaW9uIG9mIHdlYkV4dGVuc2lvbnMpIHtcblx0XHRcdGZvciAoY29uc3QgZSBvZiBbLi4uKHdlYkV4dGVuc2lvbi5tYW5pZmVzdD8uZXh0ZW5zaW9uRGVwZW5kZW5jaWVzID8/IFtdKSwgLi4uKHdlYkV4dGVuc2lvbi5tYW5pZmVzdD8uZXh0ZW5zaW9uUGFjayA/PyBbXSldKSB7XG5cdFx0XHRcdGlmICghcmVzdWx0LmhhcyhlLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSW5mb3MucHVzaCh7IGlkOiBlLCB2ZXJzaW9uOiB3ZWJFeHRlbnNpb24udmVyc2lvbiB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uSW5mb3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25zV2l0aERlcGVuZGVuY2llc0FuZFBhY2tlZEV4dGVuc2lvbnMoZXh0ZW5zaW9uSW5mb3MsIG5ldyBTZXQ8c3RyaW5nPihbLi4ucmVzdWx0LmtleXMoKV0pKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbLi4uZ2FsbGVyeUV4dGVuc2lvbnMudmFsdWVzKCldLm1hcChhc3luYyBnYWxsZXJ5ID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHdlYkV4dGVuc2lvbiA9IGF3YWl0IHRoaXMudG9XZWJFeHRlbnNpb25Gcm9tR2FsbGVyeShnYWxsZXJ5LCB7IGlzUHJlUmVsZWFzZVZlcnNpb246IGdhbGxlcnkucHJvcGVydGllcy5pc1ByZVJlbGVhc2VWZXJzaW9uLCBwcmVSZWxlYXNlOiBnYWxsZXJ5LnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbiwgaXNCdWlsdGluOiB0cnVlIH0pO1xuXHRcdFx0XHRyZXN1bHQuc2V0KHdlYkV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCksIHdlYkV4dGVuc2lvbik7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgSWdub3JpbmcgYWRkaXRpb25hbCBidWlsdGluIGV4dGVuc2lvbiAke2dhbGxlcnkuaWRlbnRpZmllci5pZH0gYmVjYXVzZSB0aGVyZSBpcyBhbiBlcnJvciB3aGlsZSBjb252ZXJ0aW5nIGl0IGludG8gd2ViIGV4dGVuc2lvbmAsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RXh0ZW5zaW9uc1dpdGhEZXBlbmRlbmNpZXNBbmRQYWNrZWRFeHRlbnNpb25zKHRvR2V0OiBJRXh0ZW5zaW9uSW5mb1tdLCBzZWVuOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpLCByZXN1bHQ6IE1hcDxzdHJpbmcsIElHYWxsZXJ5RXh0ZW5zaW9uPiA9IG5ldyBNYXA8c3RyaW5nLCBJR2FsbGVyeUV4dGVuc2lvbj4oKSk6IFByb21pc2U8TWFwPHN0cmluZywgSUdhbGxlcnlFeHRlbnNpb24+PiB7XG5cdFx0aWYgKHRvR2V0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyh0b0dldCwgeyBjb21wYXRpYmxlOiB0cnVlLCB0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0uV0VCIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHBhY2tzQW5kRGVwZW5kZW5jaWVzID0gbmV3IE1hcDxzdHJpbmcsIElFeHRlbnNpb25JbmZvPigpO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdHJlc3VsdC5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwgZXh0ZW5zaW9uKTtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgWy4uLihpc05vbkVtcHR5QXJyYXkoZXh0ZW5zaW9uLnByb3BlcnRpZXMuZGVwZW5kZW5jaWVzKSA/IGV4dGVuc2lvbi5wcm9wZXJ0aWVzLmRlcGVuZGVuY2llcyA6IFtdKSwgLi4uKGlzTm9uRW1wdHlBcnJheShleHRlbnNpb24ucHJvcGVydGllcy5leHRlbnNpb25QYWNrKSA/IGV4dGVuc2lvbi5wcm9wZXJ0aWVzLmV4dGVuc2lvblBhY2sgOiBbXSldKSB7XG5cdFx0XHRcdGlmICghcmVzdWx0LmhhcyhpZC50b0xvd2VyQ2FzZSgpKSAmJiAhcGFja3NBbmREZXBlbmRlbmNpZXMuaGFzKGlkLnRvTG93ZXJDYXNlKCkpICYmICFzZWVuLmhhcyhpZC50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkluZm8gPSB0b0dldC5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0XHRwYWNrc0FuZERlcGVuZGVuY2llcy5zZXQoaWQudG9Mb3dlckNhc2UoKSwgeyBpZCwgcHJlUmVsZWFzZTogZXh0ZW5zaW9uSW5mbz8ucHJlUmVsZWFzZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXRFeHRlbnNpb25zV2l0aERlcGVuZGVuY2llc0FuZFBhY2tlZEV4dGVuc2lvbnMoWy4uLnBhY2tzQW5kRGVwZW5kZW5jaWVzLnZhbHVlcygpXS5maWx0ZXIoKHsgaWQgfSkgPT4gIXJlc3VsdC5oYXMoaWQudG9Mb3dlckNhc2UoKSkpLCBzZWVuLCByZXN1bHQpO1xuXHR9XG5cblx0YXN5bmMgc2NhblN5c3RlbUV4dGVuc2lvbnMoKTogUHJvbWlzZTxJRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy5yZWFkU3lzdGVtRXh0ZW5zaW9ucygpO1xuXHR9XG5cblx0YXN5bmMgc2NhblVzZXJFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbjogVVJJLCBzY2FuT3B0aW9ucz86IFNjYW5PcHRpb25zKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJU2Nhbm5lZEV4dGVuc2lvbj4oKTtcblxuXHRcdC8vIEN1c3RvbSBidWlsdGluIGV4dGVuc2lvbnMgZGVmaW5lZCB0aHJvdWdoIGBhZGRpdGlvbmFsQnVpbHRpbkV4dGVuc2lvbnNgIEFQSVxuXHRcdGNvbnN0IGN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zID0gYXdhaXQgdGhpcy5yZWFkQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnMoc2Nhbk9wdGlvbnMpO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zKSB7XG5cdFx0XHRleHRlbnNpb25zLnNldChleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLCBleHRlbnNpb24pO1xuXHRcdH1cblxuXHRcdC8vIFVzZXIgSW5zdGFsbGVkIGV4dGVuc2lvbnNcblx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5zY2FuSW5zdGFsbGVkRXh0ZW5zaW9ucyhwcm9maWxlTG9jYXRpb24sIHNjYW5PcHRpb25zKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBpbnN0YWxsZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRleHRlbnNpb25zLnNldChleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLCBleHRlbnNpb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiBbLi4uZXh0ZW5zaW9ucy52YWx1ZXMoKV07XG5cdH1cblxuXHRhc3luYyBzY2FuRXh0ZW5zaW9uc1VuZGVyRGV2ZWxvcG1lbnQoKTogUHJvbWlzZTxJRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBkZXZFeHRlbnNpb25zID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8uZGV2ZWxvcG1lbnRPcHRpb25zPy5leHRlbnNpb25zO1xuXHRcdGNvbnN0IHJlc3VsdDogSUV4dGVuc2lvbltdID0gW107XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoZGV2RXh0ZW5zaW9ucykpIHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChkZXZFeHRlbnNpb25zLm1hcChhc3luYyBkZXZFeHRlbnNpb24gPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGxvY2F0aW9uID0gVVJJLnJldml2ZShkZXZFeHRlbnNpb24pO1xuXHRcdFx0XHRcdGlmIChVUkkuaXNVcmkobG9jYXRpb24pKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB3ZWJFeHRlbnNpb24gPSBhd2FpdCB0aGlzLnRvV2ViRXh0ZW5zaW9uKGxvY2F0aW9uKTtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGF3YWl0IHRoaXMudG9TY2FubmVkRXh0ZW5zaW9uKHdlYkV4dGVuc2lvbiwgZmFsc2UpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFNraXBwaW5nIHRoZSBleHRlbnNpb24gdW5kZXIgZGV2ZWxvcG1lbnQgJHtkZXZFeHRlbnNpb259IGFzIGl0IGlzIG5vdCBVUkkgdHlwZS5gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEVycm9yIHdoaWxlIGZldGNoaW5nIHRoZSBleHRlbnNpb24gdW5kZXIgZGV2ZWxvcG1lbnQgJHtkZXZFeHRlbnNpb24udG9TdHJpbmcoKX0uYCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIHNjYW5FeGlzdGluZ0V4dGVuc2lvbihleHRlbnNpb25Mb2NhdGlvbjogVVJJLCBleHRlbnNpb25UeXBlOiBFeHRlbnNpb25UeXBlLCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb24gfCBudWxsPiB7XG5cdFx0aWYgKGV4dGVuc2lvblR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtKSB7XG5cdFx0XHRjb25zdCBzeXN0ZW1FeHRlbnNpb25zID0gYXdhaXQgdGhpcy5zY2FuU3lzdGVtRXh0ZW5zaW9ucygpO1xuXHRcdFx0cmV0dXJuIHN5c3RlbUV4dGVuc2lvbnMuZmluZChlID0+IGUubG9jYXRpb24udG9TdHJpbmcoKSA9PT0gZXh0ZW5zaW9uTG9jYXRpb24udG9TdHJpbmcoKSkgfHwgbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgdXNlckV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnNjYW5Vc2VyRXh0ZW5zaW9ucyhwcm9maWxlTG9jYXRpb24pO1xuXHRcdHJldHVybiB1c2VyRXh0ZW5zaW9ucy5maW5kKGUgPT4gZS5sb2NhdGlvbi50b1N0cmluZygpID09PSBleHRlbnNpb25Mb2NhdGlvbi50b1N0cmluZygpKSB8fCBudWxsO1xuXHR9XG5cblx0YXN5bmMgc2NhbkV4dGVuc2lvbk1hbmlmZXN0KGV4dGVuc2lvbkxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElFeHRlbnNpb25NYW5pZmVzdCB8IG51bGw+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZ2V0RXh0ZW5zaW9uTWFuaWZlc3QoZXh0ZW5zaW9uTG9jYXRpb24pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRXJyb3Igd2hpbGUgZmV0Y2hpbmcgbWFuaWZlc3QgZnJvbSAke2V4dGVuc2lvbkxvY2F0aW9uLnRvU3RyaW5nKCl9YCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBhZGRFeHRlbnNpb25Gcm9tR2FsbGVyeShnYWxsZXJ5RXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgbWV0YWRhdGE6IE1ldGFkYXRhLCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb24+IHtcblx0XHRjb25zdCB3ZWJFeHRlbnNpb24gPSBhd2FpdCB0aGlzLnRvV2ViRXh0ZW5zaW9uRnJvbUdhbGxlcnkoZ2FsbGVyeUV4dGVuc2lvbiwgbWV0YWRhdGEpO1xuXHRcdHJldHVybiB0aGlzLmFkZFdlYkV4dGVuc2lvbih3ZWJFeHRlbnNpb24sIHByb2ZpbGVMb2NhdGlvbik7XG5cdH1cblxuXHRhc3luYyBhZGRFeHRlbnNpb24obG9jYXRpb246IFVSSSwgbWV0YWRhdGE6IE1ldGFkYXRhLCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb24+IHtcblx0XHRjb25zdCB3ZWJFeHRlbnNpb24gPSBhd2FpdCB0aGlzLnRvV2ViRXh0ZW5zaW9uKGxvY2F0aW9uLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBtZXRhZGF0YSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy50b1NjYW5uZWRFeHRlbnNpb24od2ViRXh0ZW5zaW9uLCBmYWxzZSk7XG5cdFx0YXdhaXQgdGhpcy5hZGRUb0luc3RhbGxlZEV4dGVuc2lvbnMoW3dlYkV4dGVuc2lvbl0sIHByb2ZpbGVMb2NhdGlvbik7XG5cdFx0cmV0dXJuIGV4dGVuc2lvbjtcblx0fVxuXG5cdGFzeW5jIHJlbW92ZUV4dGVuc2lvbihleHRlbnNpb246IElTY2FubmVkRXh0ZW5zaW9uLCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMud3JpdGVJbnN0YWxsZWRFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbiwgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9PiBpbnN0YWxsZWRFeHRlbnNpb25zLmZpbHRlcihpbnN0YWxsZWRFeHRlbnNpb24gPT4gIWFyZVNhbWVFeHRlbnNpb25zKGluc3RhbGxlZEV4dGVuc2lvbi5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZU1ldGFkYXRhKGV4dGVuc2lvbjogSVNjYW5uZWRFeHRlbnNpb24sIG1ldGFkYXRhOiBQYXJ0aWFsPE1ldGFkYXRhPiwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uPiB7XG5cdFx0bGV0IHVwZGF0ZWRFeHRlbnNpb246IElXZWJFeHRlbnNpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0YXdhaXQgdGhpcy53cml0ZUluc3RhbGxlZEV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uLCBpbnN0YWxsZWRFeHRlbnNpb25zID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogSVdlYkV4dGVuc2lvbltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbiBvZiBpbnN0YWxsZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRcdGlmIChhcmVTYW1lRXh0ZW5zaW9ucyhleHRlbnNpb24uaWRlbnRpZmllciwgaW5zdGFsbGVkRXh0ZW5zaW9uLmlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdFx0aW5zdGFsbGVkRXh0ZW5zaW9uLm1ldGFkYXRhID0geyAuLi5pbnN0YWxsZWRFeHRlbnNpb24ubWV0YWRhdGEsIC4uLm1ldGFkYXRhIH07XG5cdFx0XHRcdFx0dXBkYXRlZEV4dGVuc2lvbiA9IGluc3RhbGxlZEV4dGVuc2lvbjtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChpbnN0YWxsZWRFeHRlbnNpb24pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGluc3RhbGxlZEV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cdFx0aWYgKCF1cGRhdGVkRXh0ZW5zaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4dGVuc2lvbiBub3QgZm91bmQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMudG9TY2FubmVkRXh0ZW5zaW9uKHVwZGF0ZWRFeHRlbnNpb24sIGV4dGVuc2lvbi5pc0J1aWx0aW4pO1xuXHR9XG5cblx0YXN5bmMgY29weUV4dGVuc2lvbnMoZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJLCB0b1Byb2ZpbGVMb2NhdGlvbjogVVJJLCBmaWx0ZXI6IChleHRlbnNpb246IElTY2FubmVkRXh0ZW5zaW9uKSA9PiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvQ29weTogSVdlYkV4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgZnJvbVdlYkV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnJlYWRJbnN0YWxsZWRFeHRlbnNpb25zKGZyb21Qcm9maWxlTG9jYXRpb24pO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKGZyb21XZWJFeHRlbnNpb25zLm1hcChhc3luYyB3ZWJFeHRlbnNpb24gPT4ge1xuXHRcdFx0Y29uc3Qgc2Nhbm5lZEV4dGVuc2lvbiA9IGF3YWl0IHRoaXMudG9TY2FubmVkRXh0ZW5zaW9uKHdlYkV4dGVuc2lvbiwgZmFsc2UpO1xuXHRcdFx0aWYgKGZpbHRlcihzY2FubmVkRXh0ZW5zaW9uKSkge1xuXHRcdFx0XHRleHRlbnNpb25zVG9Db3B5LnB1c2god2ViRXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0aWYgKGV4dGVuc2lvbnNUb0NvcHkubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmFkZFRvSW5zdGFsbGVkRXh0ZW5zaW9ucyhleHRlbnNpb25zVG9Db3B5LCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhZGRXZWJFeHRlbnNpb24od2ViRXh0ZW5zaW9uOiBJV2ViRXh0ZW5zaW9uLCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb24+IHtcblx0XHRjb25zdCBpc1N5c3RlbSA9ICEhKGF3YWl0IHRoaXMuc2NhblN5c3RlbUV4dGVuc2lvbnMoKSkuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgd2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRjb25zdCBpc0J1aWx0aW4gPSAhIXdlYkV4dGVuc2lvbi5tZXRhZGF0YT8uaXNCdWlsdGluO1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IGF3YWl0IHRoaXMudG9TY2FubmVkRXh0ZW5zaW9uKHdlYkV4dGVuc2lvbiwgaXNCdWlsdGluKTtcblxuXHRcdGlmIChpc1N5c3RlbSkge1xuXHRcdFx0YXdhaXQgdGhpcy53cml0ZVN5c3RlbUV4dGVuc2lvbnNDYWNoZShzeXN0ZW1FeHRlbnNpb25zID0+IHtcblx0XHRcdFx0Ly8gUmVtb3ZlIHRoZSBleGlzdGluZyBleHRlbnNpb24gdG8gYXZvaWQgZHVwbGljYXRlc1xuXHRcdFx0XHRzeXN0ZW1FeHRlbnNpb25zID0gc3lzdGVtRXh0ZW5zaW9ucy5maWx0ZXIoZXh0ZW5zaW9uID0+ICFhcmVTYW1lRXh0ZW5zaW9ucyhleHRlbnNpb24uaWRlbnRpZmllciwgd2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0c3lzdGVtRXh0ZW5zaW9ucy5wdXNoKHdlYkV4dGVuc2lvbik7XG5cdFx0XHRcdHJldHVybiBzeXN0ZW1FeHRlbnNpb25zO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gZXh0ZW5zaW9uO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBjdXN0b20gYnVpbHRpbiBleHRlbnNpb25zIHRvIGN1c3RvbSBidWlsdGluIGV4dGVuc2lvbnMgY2FjaGVcblx0XHRpZiAoaXNCdWlsdGluKSB7XG5cdFx0XHRhd2FpdCB0aGlzLndyaXRlQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZShjdXN0b21CdWlsdGluRXh0ZW5zaW9ucyA9PiB7XG5cdFx0XHRcdC8vIFJlbW92ZSB0aGUgZXhpc3RpbmcgZXh0ZW5zaW9uIHRvIGF2b2lkIGR1cGxpY2F0ZXNcblx0XHRcdFx0Y3VzdG9tQnVpbHRpbkV4dGVuc2lvbnMgPSBjdXN0b21CdWlsdGluRXh0ZW5zaW9ucy5maWx0ZXIoZXh0ZW5zaW9uID0+ICFhcmVTYW1lRXh0ZW5zaW9ucyhleHRlbnNpb24uaWRlbnRpZmllciwgd2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0Y3VzdG9tQnVpbHRpbkV4dGVuc2lvbnMucHVzaCh3ZWJFeHRlbnNpb24pO1xuXHRcdFx0XHRyZXR1cm4gY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnM7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMucmVhZEluc3RhbGxlZEV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdC8vIEFsc28gYWRkIHRvIGluc3RhbGxlZCBleHRlbnNpb25zIGlmIGl0IGlzIGluc3RhbGxlZCB0byB1cGRhdGUgaXRzIHZlcnNpb25cblx0XHRcdGlmIChpbnN0YWxsZWRFeHRlbnNpb25zLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHdlYkV4dGVuc2lvbi5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5hZGRUb0luc3RhbGxlZEV4dGVuc2lvbnMoW3dlYkV4dGVuc2lvbl0sIHByb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZXh0ZW5zaW9uO1xuXHRcdH1cblxuXHRcdC8vIEFkZCB0byBpbnN0YWxsZWQgZXh0ZW5zaW9uc1xuXHRcdGF3YWl0IHRoaXMuYWRkVG9JbnN0YWxsZWRFeHRlbnNpb25zKFt3ZWJFeHRlbnNpb25dLCBwcm9maWxlTG9jYXRpb24pO1xuXHRcdHJldHVybiBleHRlbnNpb247XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFkZFRvSW5zdGFsbGVkRXh0ZW5zaW9ucyh3ZWJFeHRlbnNpb25zOiBJV2ViRXh0ZW5zaW9uW10sIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy53cml0ZUluc3RhbGxlZEV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uLCBpbnN0YWxsZWRFeHRlbnNpb25zID0+IHtcblx0XHRcdC8vIFJlbW92ZSB0aGUgZXhpc3RpbmcgZXh0ZW5zaW9uIHRvIGF2b2lkIGR1cGxpY2F0ZXNcblx0XHRcdGluc3RhbGxlZEV4dGVuc2lvbnMgPSBpbnN0YWxsZWRFeHRlbnNpb25zLmZpbHRlcihpbnN0YWxsZWRFeHRlbnNpb24gPT4gd2ViRXh0ZW5zaW9ucy5zb21lKGV4dGVuc2lvbiA9PiAhYXJlU2FtZUV4dGVuc2lvbnMoaW5zdGFsbGVkRXh0ZW5zaW9uLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkpO1xuXHRcdFx0aW5zdGFsbGVkRXh0ZW5zaW9ucy5wdXNoKC4uLndlYkV4dGVuc2lvbnMpO1xuXHRcdFx0cmV0dXJuIGluc3RhbGxlZEV4dGVuc2lvbnM7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNjYW5JbnN0YWxsZWRFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbjogVVJJLCBzY2FuT3B0aW9ucz86IFNjYW5PcHRpb25zKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbltdPiB7XG5cdFx0bGV0IGluc3RhbGxlZEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnJlYWRJbnN0YWxsZWRFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbik7XG5cblx0XHQvLyBJZiBjdXJyZW50IHByb2ZpbGUgaXMgbm90IGEgZGVmYXVsdCBwcm9maWxlLCB0aGVuIGFkZCB0aGUgYXBwbGljYXRpb24gZXh0ZW5zaW9ucyB0byB0aGUgbGlzdFxuXHRcdGlmICghdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocHJvZmlsZUxvY2F0aW9uLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSkpIHtcblx0XHRcdC8vIFJlbW92ZSBhcHBsaWNhdGlvbiBleHRlbnNpb25zIGZyb20gdGhlIG5vbiBkZWZhdWx0IHByb2ZpbGVcblx0XHRcdGluc3RhbGxlZEV4dGVuc2lvbnMgPSBpbnN0YWxsZWRFeHRlbnNpb25zLmZpbHRlcihpID0+ICFpLm1ldGFkYXRhPy5pc0FwcGxpY2F0aW9uU2NvcGVkKTtcblx0XHRcdC8vIEFkZCBhcHBsaWNhdGlvbiBleHRlbnNpb25zIGZyb20gdGhlIGRlZmF1bHQgcHJvZmlsZSB0byB0aGUgbGlzdFxuXHRcdFx0Y29uc3QgZGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5yZWFkSW5zdGFsbGVkRXh0ZW5zaW9ucyh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0XHRpbnN0YWxsZWRFeHRlbnNpb25zLnB1c2goLi4uZGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zLmZpbHRlcihpID0+IGkubWV0YWRhdGE/LmlzQXBwbGljYXRpb25TY29wZWQpKTtcblx0XHR9XG5cblx0XHRpbnN0YWxsZWRFeHRlbnNpb25zLnNvcnQoKGEsIGIpID0+IGEuaWRlbnRpZmllci5pZCA8IGIuaWRlbnRpZmllci5pZCA/IC0xIDogYS5pZGVudGlmaWVyLmlkID4gYi5pZGVudGlmaWVyLmlkID8gMSA6IHNlbXZlci5yY29tcGFyZShhLnZlcnNpb24sIGIudmVyc2lvbikpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBJU2Nhbm5lZEV4dGVuc2lvbj4oKTtcblx0XHRmb3IgKGNvbnN0IHdlYkV4dGVuc2lvbiBvZiBpbnN0YWxsZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHJlc3VsdC5nZXQod2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRpZiAoZXhpc3RpbmcgJiYgc2VtdmVyLmd0KGV4aXN0aW5nLm1hbmlmZXN0LnZlcnNpb24sIHdlYkV4dGVuc2lvbi52ZXJzaW9uKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGF3YWl0IHRoaXMudG9TY2FubmVkRXh0ZW5zaW9uKHdlYkV4dGVuc2lvbiwgZmFsc2UpO1xuXHRcdFx0aWYgKGV4dGVuc2lvbi5pc1ZhbGlkIHx8ICFzY2FuT3B0aW9ucz8uc2tpcEludmFsaWRFeHRlbnNpb25zKSB7XG5cdFx0XHRcdHJlc3VsdC5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwgZXh0ZW5zaW9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBTa2lwcGluZyBpbnZhbGlkIGluc3RhbGxlZCBleHRlbnNpb24gJHt3ZWJFeHRlbnNpb24uaWRlbnRpZmllci5pZH1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFsuLi5yZXN1bHQudmFsdWVzKCldO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0b1dlYkV4dGVuc2lvbkZyb21HYWxsZXJ5KGdhbGxlcnlFeHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBtZXRhZGF0YT86IE1ldGFkYXRhKTogUHJvbWlzZTxJV2ViRXh0ZW5zaW9uPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uTG9jYXRpb24gPSBhd2FpdCB0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5nZXRFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VVUkwoe1xuXHRcdFx0cHVibGlzaGVyOiBnYWxsZXJ5RXh0ZW5zaW9uLnB1Ymxpc2hlcixcblx0XHRcdG5hbWU6IGdhbGxlcnlFeHRlbnNpb24ubmFtZSxcblx0XHRcdHZlcnNpb246IGdhbGxlcnlFeHRlbnNpb24udmVyc2lvbixcblx0XHRcdHRhcmdldFBsYXRmb3JtOiBnYWxsZXJ5RXh0ZW5zaW9uLnByb3BlcnRpZXMudGFyZ2V0UGxhdGZvcm0gPT09IFRhcmdldFBsYXRmb3JtLldFQiA/IFRhcmdldFBsYXRmb3JtLldFQiA6IHVuZGVmaW5lZFxuXHRcdH0sICdleHRlbnNpb24nKTtcblxuXHRcdGlmICghZXh0ZW5zaW9uTG9jYXRpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gZXh0ZW5zaW9uIGdhbGxlcnkgc2VydmljZSBjb25maWd1cmVkLicpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnRvV2ViRXh0ZW5zaW9uRnJvbUV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZShleHRlbnNpb25Mb2NhdGlvbixcblx0XHRcdGdhbGxlcnlFeHRlbnNpb24uaWRlbnRpZmllcixcblx0XHRcdGdhbGxlcnlFeHRlbnNpb24uYXNzZXRzLnJlYWRtZSA/IFVSSS5wYXJzZShnYWxsZXJ5RXh0ZW5zaW9uLmFzc2V0cy5yZWFkbWUudXJpKSA6IHVuZGVmaW5lZCxcblx0XHRcdGdhbGxlcnlFeHRlbnNpb24uYXNzZXRzLmNoYW5nZWxvZyA/IFVSSS5wYXJzZShnYWxsZXJ5RXh0ZW5zaW9uLmFzc2V0cy5jaGFuZ2Vsb2cudXJpKSA6IHVuZGVmaW5lZCxcblx0XHRcdG1ldGFkYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdG9XZWJFeHRlbnNpb25Gcm9tRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlKGV4dGVuc2lvbkxvY2F0aW9uOiBVUkksIGlkZW50aWZpZXI/OiBJRXh0ZW5zaW9uSWRlbnRpZmllciwgcmVhZG1lVXJpPzogVVJJLCBjaGFuZ2Vsb2dVcmk/OiBVUkksIG1ldGFkYXRhPzogTWV0YWRhdGEpOiBQcm9taXNlPElXZWJFeHRlbnNpb24+IHtcblx0XHRjb25zdCBleHRlbnNpb25SZXNvdXJjZXMgPSBhd2FpdCB0aGlzLmxpc3RFeHRlbnNpb25SZXNvdXJjZXMoZXh0ZW5zaW9uTG9jYXRpb24pO1xuXHRcdGNvbnN0IHBhY2thZ2VOTFNSZXNvdXJjZXMgPSB0aGlzLmdldFBhY2thZ2VOTFNSZXNvdXJjZU1hcEZyb21SZXNvdXJjZXMoZXh0ZW5zaW9uUmVzb3VyY2VzKTtcblxuXHRcdC8vIFRoZSBmYWxsYmFjaywgaW4gRW5nbGlzaCwgd2lsbCBmaWxsIGluIGFueSBnYXBzIG1pc3NpbmcgaW4gdGhlIGxvY2FsaXplZCBmaWxlLlxuXHRcdGNvbnN0IGZhbGxiYWNrUGFja2FnZU5MU1Jlc291cmNlID0gZXh0ZW5zaW9uUmVzb3VyY2VzLmZpbmQoZSA9PiBiYXNlbmFtZShlKSA9PT0gJ3BhY2thZ2UubmxzLmpzb24nKTtcblx0XHRyZXR1cm4gdGhpcy50b1dlYkV4dGVuc2lvbihcblx0XHRcdGV4dGVuc2lvbkxvY2F0aW9uLFxuXHRcdFx0aWRlbnRpZmllcixcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHBhY2thZ2VOTFNSZXNvdXJjZXMsXG5cdFx0XHRmYWxsYmFja1BhY2thZ2VOTFNSZXNvdXJjZSA/IFVSSS5wYXJzZShmYWxsYmFja1BhY2thZ2VOTFNSZXNvdXJjZSkgOiBudWxsLFxuXHRcdFx0cmVhZG1lVXJpLFxuXHRcdFx0Y2hhbmdlbG9nVXJpLFxuXHRcdFx0bWV0YWRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQYWNrYWdlTkxTUmVzb3VyY2VNYXBGcm9tUmVzb3VyY2VzKGV4dGVuc2lvblJlc291cmNlczogc3RyaW5nW10pOiBNYXA8c3RyaW5nLCBVUkk+IHtcblx0XHRjb25zdCBwYWNrYWdlTkxTUmVzb3VyY2VzID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblx0XHRleHRlbnNpb25SZXNvdXJjZXMuZm9yRWFjaChlID0+IHtcblx0XHRcdC8vIEdyYWIgYWxsIHBhY2thZ2UubmxzLntsYW5ndWFnZX0uanNvbiBmaWxlc1xuXHRcdFx0Y29uc3QgcmVnZXhSZXN1bHQgPSAvcGFja2FnZVxcLm5sc1xcLihbXFx3LV0rKVxcLmpzb24vLmV4ZWMoYmFzZW5hbWUoZSkpO1xuXHRcdFx0aWYgKHJlZ2V4UmVzdWx0Py5bMV0pIHtcblx0XHRcdFx0cGFja2FnZU5MU1Jlc291cmNlcy5zZXQocmVnZXhSZXN1bHRbMV0sIFVSSS5wYXJzZShlKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHBhY2thZ2VOTFNSZXNvdXJjZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHRvV2ViRXh0ZW5zaW9uKGV4dGVuc2lvbkxvY2F0aW9uOiBVUkksIGlkZW50aWZpZXI/OiBJRXh0ZW5zaW9uSWRlbnRpZmllciwgbWFuaWZlc3Q/OiBJRXh0ZW5zaW9uTWFuaWZlc3QsIHBhY2thZ2VOTFNVcmlzPzogTWFwPHN0cmluZywgVVJJPiwgZmFsbGJhY2tQYWNrYWdlTkxTVXJpPzogVVJJIHwgSVRyYW5zbGF0aW9ucyB8IG51bGwsIHJlYWRtZVVyaT86IFVSSSwgY2hhbmdlbG9nVXJpPzogVVJJLCBtZXRhZGF0YT86IE1ldGFkYXRhKTogUHJvbWlzZTxJV2ViRXh0ZW5zaW9uPiB7XG5cdFx0aWYgKCFtYW5pZmVzdCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bWFuaWZlc3QgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbk1hbmlmZXN0KGV4dGVuc2lvbkxvY2F0aW9uKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRXJyb3Igd2hpbGUgZmV0Y2hpbmcgbWFuaWZlc3QgZnJvbSB0aGUgbG9jYXRpb24gJyR7ZXh0ZW5zaW9uTG9jYXRpb24udG9TdHJpbmcoKX0nLiAke2dldEVycm9yTWVzc2FnZShlcnJvcil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuY2FuRXhlY3V0ZU9uV2ViKG1hbmlmZXN0KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub3QgYSB3ZWIgZXh0ZW5zaW9uJywgXCJDYW5ub3QgYWRkICd7MH0nIGJlY2F1c2UgdGhpcyBleHRlbnNpb24gaXMgbm90IGEgd2ViIGV4dGVuc2lvbi5cIiwgbWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgbWFuaWZlc3QubmFtZSkpO1xuXHRcdH1cblxuXHRcdGlmIChmYWxsYmFja1BhY2thZ2VOTFNVcmkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZmFsbGJhY2tQYWNrYWdlTkxTVXJpID0gam9pblBhdGgoZXh0ZW5zaW9uTG9jYXRpb24sICdwYWNrYWdlLm5scy5qc29uJyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLnJlYWRFeHRlbnNpb25SZXNvdXJjZShmYWxsYmFja1BhY2thZ2VOTFNVcmkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0ZmFsbGJhY2tQYWNrYWdlTkxTVXJpID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBkZWZhdWx0TWFuaWZlc3RUcmFuc2xhdGlvbnM6IElUcmFuc2xhdGlvbnMgfCBudWxsIHwgdW5kZWZpbmVkID0gZmFsbGJhY2tQYWNrYWdlTkxTVXJpID8gVVJJLmlzVXJpKGZhbGxiYWNrUGFja2FnZU5MU1VyaSkgPyBhd2FpdCB0aGlzLmdldFRyYW5zbGF0aW9ucyhmYWxsYmFja1BhY2thZ2VOTFNVcmkpIDogZmFsbGJhY2tQYWNrYWdlTkxTVXJpIDogbnVsbDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZGVudGlmaWVyOiB7IGlkOiBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQobWFuaWZlc3QucHVibGlzaGVyLCBtYW5pZmVzdC5uYW1lKSwgdXVpZDogaWRlbnRpZmllcj8udXVpZCB9LFxuXHRcdFx0dmVyc2lvbjogbWFuaWZlc3QudmVyc2lvbixcblx0XHRcdGxvY2F0aW9uOiBleHRlbnNpb25Mb2NhdGlvbixcblx0XHRcdG1hbmlmZXN0LFxuXHRcdFx0cmVhZG1lVXJpLFxuXHRcdFx0Y2hhbmdlbG9nVXJpLFxuXHRcdFx0cGFja2FnZU5MU1VyaXMsXG5cdFx0XHRmYWxsYmFja1BhY2thZ2VOTFNVcmk6IFVSSS5pc1VyaShmYWxsYmFja1BhY2thZ2VOTFNVcmkpID8gZmFsbGJhY2tQYWNrYWdlTkxTVXJpIDogdW5kZWZpbmVkLFxuXHRcdFx0ZGVmYXVsdE1hbmlmZXN0VHJhbnNsYXRpb25zLFxuXHRcdFx0bWV0YWRhdGEsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdG9TY2FubmVkRXh0ZW5zaW9uKHdlYkV4dGVuc2lvbjogSVdlYkV4dGVuc2lvbiwgaXNCdWlsdGluOiBib29sZWFuLCB0eXBlOiBFeHRlbnNpb25UeXBlID0gRXh0ZW5zaW9uVHlwZS5Vc2VyKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IHZhbGlkYXRpb25zOiBbU2V2ZXJpdHksIHN0cmluZ11bXSA9IFtdO1xuXHRcdGxldCBtYW5pZmVzdDogSVJlbGF4ZWRFeHRlbnNpb25NYW5pZmVzdCB8IHVuZGVmaW5lZCA9IHdlYkV4dGVuc2lvbi5tYW5pZmVzdDtcblxuXHRcdGlmICghbWFuaWZlc3QpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25NYW5pZmVzdCh3ZWJFeHRlbnNpb24ubG9jYXRpb24pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dmFsaWRhdGlvbnMucHVzaChbU2V2ZXJpdHkuRXJyb3IsIGBFcnJvciB3aGlsZSBmZXRjaGluZyBtYW5pZmVzdCBmcm9tIHRoZSBsb2NhdGlvbiAnJHt3ZWJFeHRlbnNpb24ubG9jYXRpb259Jy4gJHtnZXRFcnJvck1lc3NhZ2UoZXJyb3IpfWBdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIW1hbmlmZXN0KSB7XG5cdFx0XHRjb25zdCBbcHVibGlzaGVyLCBuYW1lXSA9IHdlYkV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnNwbGl0KCcuJyk7XG5cdFx0XHRtYW5pZmVzdCA9IHtcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0cHVibGlzaGVyLFxuXHRcdFx0XHR2ZXJzaW9uOiB3ZWJFeHRlbnNpb24udmVyc2lvbixcblx0XHRcdFx0ZW5naW5lczogeyB2c2NvZGU6ICcqJyB9LFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBwYWNrYWdlTkxTVXJpID0gd2ViRXh0ZW5zaW9uLnBhY2thZ2VOTFNVcmlzPy5nZXQoTGFuZ3VhZ2UudmFsdWUoKS50b0xvd2VyQ2FzZSgpKTtcblx0XHRjb25zdCBmYWxsYmFja1BhY2thZ2VOTFMgPSB3ZWJFeHRlbnNpb24uZGVmYXVsdE1hbmlmZXN0VHJhbnNsYXRpb25zID8/IHdlYkV4dGVuc2lvbi5mYWxsYmFja1BhY2thZ2VOTFNVcmk7XG5cblx0XHRpZiAocGFja2FnZU5MU1VyaSkge1xuXHRcdFx0bWFuaWZlc3QgPSBhd2FpdCB0aGlzLnRyYW5zbGF0ZU1hbmlmZXN0KG1hbmlmZXN0LCBwYWNrYWdlTkxTVXJpLCBmYWxsYmFja1BhY2thZ2VOTFMpO1xuXHRcdH0gZWxzZSBpZiAoZmFsbGJhY2tQYWNrYWdlTkxTKSB7XG5cdFx0XHRtYW5pZmVzdCA9IGF3YWl0IHRoaXMudHJhbnNsYXRlTWFuaWZlc3QobWFuaWZlc3QsIGZhbGxiYWNrUGFja2FnZU5MUyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXVpZCA9ICg8SUdhbGxlcnlNZXRhZGF0YSB8IHVuZGVmaW5lZD53ZWJFeHRlbnNpb24ubWV0YWRhdGEpPy5pZDtcblxuXHRcdHZhbGlkYXRpb25zLnB1c2goLi4udmFsaWRhdGVFeHRlbnNpb25NYW5pZmVzdCh0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZSwgd2ViRXh0ZW5zaW9uLmxvY2F0aW9uLCBtYW5pZmVzdCwgZmFsc2UpKTtcblx0XHRsZXQgaXNWYWxpZCA9IHRydWU7XG5cdFx0Zm9yIChjb25zdCBbc2V2ZXJpdHksIG1lc3NhZ2VdIG9mIHZhbGlkYXRpb25zKSB7XG5cdFx0XHRpZiAoc2V2ZXJpdHkgPT09IFNldmVyaXR5LkVycm9yKSB7XG5cdFx0XHRcdGlzVmFsaWQgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKG1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChtYW5pZmVzdC5lbmFibGVkQXBpUHJvcG9zYWxzKSB7XG5cdFx0XHRtYW5pZmVzdC5lbmFibGVkQXBpUHJvcG9zYWxzID0gcGFyc2VFbmFibGVkQXBpUHJvcG9zYWxOYW1lcyhbLi4ubWFuaWZlc3QuZW5hYmxlZEFwaVByb3Bvc2Fsc10pO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZGVudGlmaWVyOiB7IGlkOiB3ZWJFeHRlbnNpb24uaWRlbnRpZmllci5pZCwgdXVpZDogd2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCB8fCB1dWlkIH0sXG5cdFx0XHRsb2NhdGlvbjogd2ViRXh0ZW5zaW9uLmxvY2F0aW9uLFxuXHRcdFx0bWFuaWZlc3QsXG5cdFx0XHR0eXBlLFxuXHRcdFx0aXNCdWlsdGluLFxuXHRcdFx0cmVhZG1lVXJsOiB3ZWJFeHRlbnNpb24ucmVhZG1lVXJpLFxuXHRcdFx0Y2hhbmdlbG9nVXJsOiB3ZWJFeHRlbnNpb24uY2hhbmdlbG9nVXJpLFxuXHRcdFx0bWV0YWRhdGE6IHdlYkV4dGVuc2lvbi5tZXRhZGF0YSxcblx0XHRcdHRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybS5XRUIsXG5cdFx0XHR2YWxpZGF0aW9ucyxcblx0XHRcdGlzVmFsaWQsXG5cdFx0XHRwcmVSZWxlYXNlOiAhIXdlYkV4dGVuc2lvbi5tZXRhZGF0YT8ucHJlUmVsZWFzZSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsaXN0RXh0ZW5zaW9uUmVzb3VyY2VzKGV4dGVuc2lvbkxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLnJlYWRFeHRlbnNpb25SZXNvdXJjZShleHRlbnNpb25Mb2NhdGlvbik7XG5cdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShyZXN1bHQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignRXJyb3Igd2hpbGUgZmV0Y2hpbmcgZXh0ZW5zaW9uIHJlc291cmNlcyBsaXN0JywgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJhbnNsYXRlTWFuaWZlc3QobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCwgbmxzVVJMOiBJVHJhbnNsYXRpb25zIHwgVVJJLCBmYWxsYmFja05MUz86IElUcmFuc2xhdGlvbnMgfCBVUkkpOiBQcm9taXNlPElSZWxheGVkRXh0ZW5zaW9uTWFuaWZlc3Q+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdHJhbnNsYXRpb25zID0gVVJJLmlzVXJpKG5sc1VSTCkgPyBhd2FpdCB0aGlzLmdldFRyYW5zbGF0aW9ucyhubHNVUkwpIDogbmxzVVJMO1xuXHRcdFx0Y29uc3QgZmFsbGJhY2tUcmFuc2xhdGlvbnMgPSBVUkkuaXNVcmkoZmFsbGJhY2tOTFMpID8gYXdhaXQgdGhpcy5nZXRUcmFuc2xhdGlvbnMoZmFsbGJhY2tOTFMpIDogZmFsbGJhY2tOTFM7XG5cdFx0XHRpZiAodHJhbnNsYXRpb25zKSB7XG5cdFx0XHRcdG1hbmlmZXN0ID0gbG9jYWxpemVNYW5pZmVzdCh0aGlzLmxvZ1NlcnZpY2UsIG1hbmlmZXN0LCB0cmFuc2xhdGlvbnMsIGZhbGxiYWNrVHJhbnNsYXRpb25zKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikgeyAvKiBpZ25vcmUgKi8gfVxuXHRcdHJldHVybiBtYW5pZmVzdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RXh0ZW5zaW9uTWFuaWZlc3QobG9jYXRpb246IFVSSSk6IFByb21pc2U8SUV4dGVuc2lvbk1hbmlmZXN0PiB7XG5cdFx0Y29uc3QgdXJsID0gam9pblBhdGgobG9jYXRpb24sICdwYWNrYWdlLmpzb24nKTtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UucmVhZEV4dGVuc2lvblJlc291cmNlKHVybCk7XG5cdFx0cmV0dXJuIEpTT04ucGFyc2UoY29udGVudCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFRyYW5zbGF0aW9ucyhubHNVcmw6IFVSSSk6IFByb21pc2U8SVRyYW5zbGF0aW9ucyB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UucmVhZEV4dGVuc2lvblJlc291cmNlKG5sc1VybCk7XG5cdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShjb250ZW50KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciB3aGlsZSBmZXRjaGluZyB0cmFuc2xhdGlvbnMgb2YgYW4gZXh0ZW5zaW9uYCwgbmxzVXJsLnRvU3RyaW5nKCksIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWFkSW5zdGFsbGVkRXh0ZW5zaW9ucyhwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SVdlYkV4dGVuc2lvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMud2l0aFdlYkV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgd3JpdGVJbnN0YWxsZWRFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbjogVVJJLCB1cGRhdGVGbjogKGV4dGVuc2lvbnM6IElXZWJFeHRlbnNpb25bXSkgPT4gSVdlYkV4dGVuc2lvbltdKTogUHJvbWlzZTxJV2ViRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy53aXRoV2ViRXh0ZW5zaW9ucyhwcm9maWxlTG9jYXRpb24sIHVwZGF0ZUZuKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZEN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zQ2FjaGUoKTogUHJvbWlzZTxJV2ViRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy53aXRoV2ViRXh0ZW5zaW9ucyh0aGlzLmN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zQ2FjaGVSZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIHdyaXRlQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZSh1cGRhdGVGbjogKGV4dGVuc2lvbnM6IElXZWJFeHRlbnNpb25bXSkgPT4gSVdlYkV4dGVuc2lvbltdKTogUHJvbWlzZTxJV2ViRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy53aXRoV2ViRXh0ZW5zaW9ucyh0aGlzLmN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zQ2FjaGVSZXNvdXJjZSwgdXBkYXRlRm4pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkU3lzdGVtRXh0ZW5zaW9uc0NhY2hlKCk6IFByb21pc2U8SVdlYkV4dGVuc2lvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMud2l0aFdlYkV4dGVuc2lvbnModGhpcy5zeXN0ZW1FeHRlbnNpb25zQ2FjaGVSZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIHdyaXRlU3lzdGVtRXh0ZW5zaW9uc0NhY2hlKHVwZGF0ZUZuOiAoZXh0ZW5zaW9uczogSVdlYkV4dGVuc2lvbltdKSA9PiBJV2ViRXh0ZW5zaW9uW10pOiBQcm9taXNlPElXZWJFeHRlbnNpb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLndpdGhXZWJFeHRlbnNpb25zKHRoaXMuc3lzdGVtRXh0ZW5zaW9uc0NhY2hlUmVzb3VyY2UsIHVwZGF0ZUZuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2l0aFdlYkV4dGVuc2lvbnMoZmlsZTogVVJJIHwgdW5kZWZpbmVkLCB1cGRhdGVGbj86IChleHRlbnNpb25zOiBJV2ViRXh0ZW5zaW9uW10pID0+IElXZWJFeHRlbnNpb25bXSk6IFByb21pc2U8SVdlYkV4dGVuc2lvbltdPiB7XG5cdFx0aWYgKCFmaWxlKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdldFJlc291cmNlQWNjZXNzUXVldWUoZmlsZSkucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IHdlYkV4dGVuc2lvbnM6IElXZWJFeHRlbnNpb25bXSA9IFtdO1xuXG5cdFx0XHQvLyBSZWFkXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShmaWxlKTtcblx0XHRcdFx0Y29uc3Qgc3RvcmVkV2ViRXh0ZW5zaW9uczogSVN0b3JlZFdlYkV4dGVuc2lvbltdID0gSlNPTi5wYXJzZShjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGUgb2Ygc3RvcmVkV2ViRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdGlmICghZS5sb2NhdGlvbiB8fCAhZS5pZGVudGlmaWVyIHx8ICFlLnZlcnNpb24pIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdJZ25vcmluZyBpbnZhbGlkIGV4dGVuc2lvbiB3aGlsZSBzY2FubmluZycsIHN0b3JlZFdlYkV4dGVuc2lvbnMpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxldCBwYWNrYWdlTkxTVXJpczogTWFwPHN0cmluZywgVVJJPiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAoZS5wYWNrYWdlTkxTVXJpcykge1xuXHRcdFx0XHRcdFx0cGFja2FnZU5MU1VyaXMgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXHRcdFx0XHRcdFx0T2JqZWN0LmVudHJpZXMoZS5wYWNrYWdlTkxTVXJpcykuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiBwYWNrYWdlTkxTVXJpcyEuc2V0KGtleSwgVVJJLnJldml2ZSh2YWx1ZSkpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR3ZWJFeHRlbnNpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0aWRlbnRpZmllcjogZS5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdFx0dmVyc2lvbjogZS52ZXJzaW9uLFxuXHRcdFx0XHRcdFx0bG9jYXRpb246IFVSSS5yZXZpdmUoZS5sb2NhdGlvbiksXG5cdFx0XHRcdFx0XHRtYW5pZmVzdDogZS5tYW5pZmVzdCxcblx0XHRcdFx0XHRcdHJlYWRtZVVyaTogVVJJLnJldml2ZShlLnJlYWRtZVVyaSksXG5cdFx0XHRcdFx0XHRjaGFuZ2Vsb2dVcmk6IFVSSS5yZXZpdmUoZS5jaGFuZ2Vsb2dVcmkpLFxuXHRcdFx0XHRcdFx0cGFja2FnZU5MU1VyaXMsXG5cdFx0XHRcdFx0XHRmYWxsYmFja1BhY2thZ2VOTFNVcmk6IFVSSS5yZXZpdmUoZS5mYWxsYmFja1BhY2thZ2VOTFNVcmkpLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdE1hbmlmZXN0VHJhbnNsYXRpb25zOiBlLmRlZmF1bHRNYW5pZmVzdFRyYW5zbGF0aW9ucyxcblx0XHRcdFx0XHRcdHBhY2thZ2VOTFNVcmk6IFVSSS5yZXZpdmUoZS5wYWNrYWdlTkxTVXJpKSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiBlLm1ldGFkYXRhLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR3ZWJFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5taWdyYXRlV2ViRXh0ZW5zaW9ucyh3ZWJFeHRlbnNpb25zLCBmaWxlKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHdoaWxlIG1pZ3JhdGluZyBzY2FubmVkIGV4dGVuc2lvbnMgaW4gJHtmaWxlLnRvU3RyaW5nKCl9YCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0LyogSWdub3JlICovXG5cdFx0XHRcdGlmICgoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlXG5cdFx0XHRpZiAodXBkYXRlRm4pIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zdG9yZVdlYkV4dGVuc2lvbnMod2ViRXh0ZW5zaW9ucyA9IHVwZGF0ZUZuKHdlYkV4dGVuc2lvbnMpLCBmaWxlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHdlYkV4dGVuc2lvbnM7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1pZ3JhdGVXZWJFeHRlbnNpb25zKHdlYkV4dGVuc2lvbnM6IElXZWJFeHRlbnNpb25bXSwgZmlsZTogVVJJKTogUHJvbWlzZTxJV2ViRXh0ZW5zaW9uW10+IHtcblx0XHRsZXQgdXBkYXRlID0gZmFsc2U7XG5cdFx0d2ViRXh0ZW5zaW9ucyA9IGF3YWl0IFByb21pc2UuYWxsKHdlYkV4dGVuc2lvbnMubWFwKGFzeW5jIHdlYkV4dGVuc2lvbiA9PiB7XG5cdFx0XHRpZiAoIXdlYkV4dGVuc2lvbi5tYW5pZmVzdCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHdlYkV4dGVuc2lvbi5tYW5pZmVzdCA9IGF3YWl0IHRoaXMuZ2V0RXh0ZW5zaW9uTWFuaWZlc3Qod2ViRXh0ZW5zaW9uLmxvY2F0aW9uKTtcblx0XHRcdFx0XHR1cGRhdGUgPSB0cnVlO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRXJyb3Igd2hpbGUgdXBkYXRpbmcgbWFuaWZlc3Qgb2YgYW4gZXh0ZW5zaW9uIGluICR7ZmlsZS50b1N0cmluZygpfWAsIHdlYkV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGlzVW5kZWZpbmVkKHdlYkV4dGVuc2lvbi5kZWZhdWx0TWFuaWZlc3RUcmFuc2xhdGlvbnMpKSB7XG5cdFx0XHRcdGlmICh3ZWJFeHRlbnNpb24uZmFsbGJhY2tQYWNrYWdlTkxTVXJpKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5yZWFkRXh0ZW5zaW9uUmVzb3VyY2Uod2ViRXh0ZW5zaW9uLmZhbGxiYWNrUGFja2FnZU5MU1VyaSk7XG5cdFx0XHRcdFx0XHR3ZWJFeHRlbnNpb24uZGVmYXVsdE1hbmlmZXN0VHJhbnNsYXRpb25zID0gSlNPTi5wYXJzZShjb250ZW50KTtcblx0XHRcdFx0XHRcdHVwZGF0ZSA9IHRydWU7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRXJyb3Igd2hpbGUgZmV0Y2hpbmcgZGVmYXVsdCBtYW5pZmVzdCB0cmFuc2xhdGlvbnMgb2YgYW4gZXh0ZW5zaW9uYCwgd2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR1cGRhdGUgPSB0cnVlO1xuXHRcdFx0XHRcdHdlYkV4dGVuc2lvbi5kZWZhdWx0TWFuaWZlc3RUcmFuc2xhdGlvbnMgPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtaWdyYXRlZExvY2F0aW9uID0gbWlncmF0ZVBsYXRmb3JtU3BlY2lmaWNFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VVUkwod2ViRXh0ZW5zaW9uLmxvY2F0aW9uLCBUYXJnZXRQbGF0Zm9ybS5XRUIpO1xuXHRcdFx0aWYgKG1pZ3JhdGVkTG9jYXRpb24pIHtcblx0XHRcdFx0dXBkYXRlID0gdHJ1ZTtcblx0XHRcdFx0d2ViRXh0ZW5zaW9uLmxvY2F0aW9uID0gbWlncmF0ZWRMb2NhdGlvbjtcblx0XHRcdH1cblx0XHRcdGlmIChpc1VuZGVmaW5lZCh3ZWJFeHRlbnNpb24ubWV0YWRhdGE/Lmhhc1ByZVJlbGVhc2VWZXJzaW9uKSAmJiB3ZWJFeHRlbnNpb24ubWV0YWRhdGE/LnByZVJlbGVhc2UpIHtcblx0XHRcdFx0dXBkYXRlID0gdHJ1ZTtcblx0XHRcdFx0d2ViRXh0ZW5zaW9uLm1ldGFkYXRhLmhhc1ByZVJlbGVhc2VWZXJzaW9uID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB3ZWJFeHRlbnNpb247XG5cdFx0fSkpO1xuXHRcdGlmICh1cGRhdGUpIHtcblx0XHRcdGF3YWl0IHRoaXMuc3RvcmVXZWJFeHRlbnNpb25zKHdlYkV4dGVuc2lvbnMsIGZpbGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gd2ViRXh0ZW5zaW9ucztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3RvcmVXZWJFeHRlbnNpb25zKHdlYkV4dGVuc2lvbnM6IElXZWJFeHRlbnNpb25bXSwgZmlsZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0ZnVuY3Rpb24gdG9TdHJpbmdEaWN0aW9uYXJ5KGRpY3Rpb25hcnk6IE1hcDxzdHJpbmcsIFVSST4gfCB1bmRlZmluZWQpOiBJU3RyaW5nRGljdGlvbmFyeTxVcmlDb21wb25lbnRzPiB8IHVuZGVmaW5lZCB7XG5cdFx0XHRpZiAoIWRpY3Rpb25hcnkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3VsdDogSVN0cmluZ0RpY3Rpb25hcnk8VXJpQ29tcG9uZW50cz4gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0ZGljdGlvbmFyeS5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiByZXN1bHRba2V5XSA9IHZhbHVlLnRvSlNPTigpKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdGNvbnN0IHN0b3JlZFdlYkV4dGVuc2lvbnM6IElTdG9yZWRXZWJFeHRlbnNpb25bXSA9IHdlYkV4dGVuc2lvbnMubWFwKGUgPT4gKHtcblx0XHRcdGlkZW50aWZpZXI6IGUuaWRlbnRpZmllcixcblx0XHRcdHZlcnNpb246IGUudmVyc2lvbixcblx0XHRcdG1hbmlmZXN0OiBlLm1hbmlmZXN0LFxuXHRcdFx0bG9jYXRpb246IGUubG9jYXRpb24udG9KU09OKCksXG5cdFx0XHRyZWFkbWVVcmk6IGUucmVhZG1lVXJpPy50b0pTT04oKSxcblx0XHRcdGNoYW5nZWxvZ1VyaTogZS5jaGFuZ2Vsb2dVcmk/LnRvSlNPTigpLFxuXHRcdFx0cGFja2FnZU5MU1VyaXM6IHRvU3RyaW5nRGljdGlvbmFyeShlLnBhY2thZ2VOTFNVcmlzKSxcblx0XHRcdGRlZmF1bHRNYW5pZmVzdFRyYW5zbGF0aW9uczogZS5kZWZhdWx0TWFuaWZlc3RUcmFuc2xhdGlvbnMsXG5cdFx0XHRmYWxsYmFja1BhY2thZ2VOTFNVcmk6IGUuZmFsbGJhY2tQYWNrYWdlTkxTVXJpPy50b0pTT04oKSxcblx0XHRcdG1ldGFkYXRhOiBlLm1ldGFkYXRhXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoc3RvcmVkV2ViRXh0ZW5zaW9ucykpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVzb3VyY2VBY2Nlc3NRdWV1ZShmaWxlOiBVUkkpOiBRdWV1ZTxJV2ViRXh0ZW5zaW9uW10+IHtcblx0XHRsZXQgcmVzb3VyY2VRdWV1ZSA9IHRoaXMucmVzb3VyY2VzQWNjZXNzUXVldWVNYXAuZ2V0KGZpbGUpO1xuXHRcdGlmICghcmVzb3VyY2VRdWV1ZSkge1xuXHRcdFx0dGhpcy5yZXNvdXJjZXNBY2Nlc3NRdWV1ZU1hcC5zZXQoZmlsZSwgcmVzb3VyY2VRdWV1ZSA9IG5ldyBRdWV1ZTxJV2ViRXh0ZW5zaW9uW10+KCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzb3VyY2VRdWV1ZTtcblx0fVxuXG59XG5cbmlmIChpc1dlYikge1xuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24ub3Blbkluc3RhbGxlZFdlYkV4dGVuc2lvbnNSZXNvdXJjZScsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5JbnN0YWxsZWRXZWJFeHRlbnNpb25zUmVzb3VyY2UnLCAnT3BlbiBJbnN0YWxsZWQgV2ViIEV4dGVuc2lvbnMgUmVzb3VyY2UnKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBJc1dlYkNvbnRleHRcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRydW4oc2VydmljZUFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gc2VydmljZUFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlID0gc2VydmljZUFjY2Vzc29yLmdldChJVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cdFx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UgfSk7XG5cdFx0fVxuXHR9KTtcbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVdlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZSwgV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQ0FBa0MsZUFBcUUsZ0JBQTJDLG9DQUFvQztBQUMvTCxTQUFTLDJDQUEyQztBQUNwRCxTQUE0QixvQ0FBaUQ7QUFDN0UsU0FBUyxPQUFPLGdCQUFnQjtBQUNoQyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUEwQjtBQUNuQyxTQUE2QixxQkFBcUIsb0JBQW9CO0FBQ3RFLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdC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
