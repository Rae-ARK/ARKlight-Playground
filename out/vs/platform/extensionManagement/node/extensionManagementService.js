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
import * as fs from "fs";
import { Promises, Queue } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationError, getErrorMessage } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { hash } from "../../../base/common/hash.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../base/common/map.js";
import { Schemas } from "../../../base/common/network.js";
import * as path from "../../../base/common/path.js";
import { joinPath } from "../../../base/common/resources.js";
import * as semver from "../../../base/common/semver/semver.js";
import { isBoolean, isDefined, isUndefined } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import * as pfs from "../../../base/node/pfs.js";
import { extract, zip } from "../../../base/node/zip.js";
import * as nls from "../../../nls.js";
import { IDownloadService } from "../../download/common/download.js";
import { IEnvironmentService, INativeEnvironmentService } from "../../environment/common/environment.js";
import { AbstractExtensionManagementService, AbstractExtensionTask, toExtensionManagementError } from "../common/abstractExtensionManagementService.js";
import {
  ExtensionManagementError,
  ExtensionManagementErrorCode,
  IExtensionGalleryService,
  IExtensionManagementService,
  InstallOperation,
  EXTENSION_INSTALL_CLIENT_TARGET_PLATFORM_CONTEXT,
  ExtensionSignatureVerificationCode,
  computeSize,
  IAllowedExtensionsService,
  VerifyExtensionSignatureConfigKey,
  shouldRequireRepositorySignatureFor
} from "../common/extensionManagement.js";
import { areSameExtensions, computeTargetPlatform, ExtensionKey, getGalleryExtensionId, groupByExtension } from "../common/extensionManagementUtil.js";
import { IExtensionsProfileScannerService } from "../common/extensionsProfileScannerService.js";
import { IExtensionsScannerService } from "../common/extensionsScannerService.js";
import { ExtensionsDownloader } from "./extensionDownloader.js";
import { ExtensionsLifecycle } from "./extensionLifecycle.js";
import { fromExtractError, getManifest } from "./extensionManagementUtil.js";
import { ExtensionsManifestCache } from "./extensionsManifestCache.js";
import { ExtensionsWatcher } from "./extensionsWatcher.js";
import { ExtensionType, TargetPlatform } from "../../extensions/common/extensions.js";
import { isEngineValid } from "../../extensions/common/extensionValidator.js";
import { FileChangeType, FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { IInstantiationService, refineServiceDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IExtensionGalleryManifestService } from "../common/extensionGalleryManifest.js";
const INativeServerExtensionManagementService = refineServiceDecorator(IExtensionManagementService);
const DELETED_FOLDER_POSTFIX = ".vsctmp";
let ExtensionManagementService = class extends AbstractExtensionManagementService {
  constructor(galleryService, telemetryService, logService, environmentService, extensionsScannerService, extensionsProfileScannerService, downloadService, instantiationService, fileService, configurationService, extensionGalleryManifestService, productService, allowedExtensionsService, uriIdentityService, userDataProfilesService) {
    super(galleryService, telemetryService, uriIdentityService, logService, productService, allowedExtensionsService, userDataProfilesService);
    this.environmentService = environmentService;
    this.extensionsScannerService = extensionsScannerService;
    this.extensionsProfileScannerService = extensionsProfileScannerService;
    this.downloadService = downloadService;
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this.extractingGalleryExtensions = /* @__PURE__ */ new Map();
    this.knownDirectories = new ResourceSet();
    const extensionLifecycle = this._register(instantiationService.createInstance(ExtensionsLifecycle));
    this.extensionsScanner = this._register(instantiationService.createInstance(ExtensionsScanner, (extension) => extensionLifecycle.postUninstall(extension)));
    this.manifestCache = this._register(new ExtensionsManifestCache(userDataProfilesService, fileService, uriIdentityService, this, this.logService));
    this.extensionsDownloader = this._register(instantiationService.createInstance(ExtensionsDownloader));
    const extensionsWatcher = this._register(new ExtensionsWatcher(this, this.extensionsScannerService, userDataProfilesService, extensionsProfileScannerService, uriIdentityService, fileService, logService));
    this._register(extensionsWatcher.onDidChangeExtensionsByAnotherSource((e) => this.onDidChangeExtensionsFromAnotherSource(e)));
    this.watchForExtensionsNotInstalledBySystem();
  }
  getTargetPlatform() {
    if (!this._targetPlatformPromise) {
      this._targetPlatformPromise = computeTargetPlatform(this.fileService, this.logService);
    }
    return this._targetPlatformPromise;
  }
  async zip(extension) {
    this.logService.trace("ExtensionManagementService#zip", extension.identifier.id);
    const files = await this.collectFiles(extension);
    const location = await zip(joinPath(this.extensionsDownloader.extensionsDownloadDir, generateUuid()).fsPath, files);
    return URI.file(location);
  }
  async getManifest(vsix) {
    const { location, cleanup } = await this.downloadVsix(vsix);
    const zipPath = path.resolve(location.fsPath);
    try {
      return await getManifest(zipPath);
    } finally {
      await cleanup();
    }
  }
  getInstalled(type, profileLocation = this.userDataProfilesService.defaultProfile.extensionsResource, productVersion = { version: this.productService.version, date: this.productService.date }, language) {
    return this.extensionsScanner.scanExtensions(type ?? null, profileLocation, productVersion, language);
  }
  scanAllUserInstalledExtensions() {
    return this.extensionsScanner.scanAllUserExtensions();
  }
  scanInstalledExtensionAtLocation(location) {
    return this.extensionsScanner.scanUserExtensionAtLocation(location);
  }
  async install(vsix, options = {}) {
    this.logService.trace("ExtensionManagementService#install", vsix.toString());
    const { location, cleanup } = await this.downloadVsix(vsix);
    try {
      const manifest = await getManifest(path.resolve(location.fsPath));
      const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
      if (manifest.engines && manifest.engines.vscode && !isEngineValid(manifest.engines.vscode, this.productService.version, this.productService.date)) {
        throw new Error(nls.localize("incompatible", "Unable to install extension '{0}' as it is not compatible with VS Code '{1}'.", extensionId, this.productService.version));
      }
      const allowedToInstall = this.allowedExtensionsService.isAllowed({ id: extensionId, version: manifest.version, publisherDisplayName: void 0 });
      if (allowedToInstall !== true) {
        throw new Error(nls.localize("notAllowed", "This extension cannot be installed because {0}", allowedToInstall.value));
      }
      const results = await this.installExtensions([{ manifest, extension: location, options }]);
      const result = results.find(({ identifier }) => areSameExtensions(identifier, { id: extensionId }));
      if (result?.local) {
        return result.local;
      }
      if (result?.error) {
        throw result.error;
      }
      throw toExtensionManagementError(new Error(`Unknown error while installing extension ${extensionId}`));
    } finally {
      await cleanup();
    }
  }
  async installFromLocation(location, profileLocation) {
    this.logService.trace("ExtensionManagementService#installFromLocation", location.toString());
    const local = await this.extensionsScanner.scanUserExtensionAtLocation(location);
    if (!local || !local.manifest.name || !local.manifest.version) {
      throw new Error(`Cannot find a valid extension from the location ${location.toString()}`);
    }
    await this.addExtensionsToProfile([[local, { source: "resource" }]], profileLocation);
    this.logService.info("Successfully installed extension", local.identifier.id, profileLocation.toString());
    return local;
  }
  async installExtensionsFromProfile(extensions, fromProfileLocation, toProfileLocation) {
    this.logService.trace("ExtensionManagementService#installExtensionsFromProfile", extensions, fromProfileLocation.toString(), toProfileLocation.toString());
    const extensionsToInstall = (await this.getInstalled(ExtensionType.User, fromProfileLocation)).filter((e) => extensions.some((id) => areSameExtensions(id, e.identifier)));
    if (extensionsToInstall.length) {
      const metadata = await Promise.all(extensionsToInstall.map((e) => this.extensionsScanner.scanMetadata(e, fromProfileLocation)));
      await this.addExtensionsToProfile(extensionsToInstall.map((e, index) => [e, metadata[index]]), toProfileLocation);
      this.logService.info("Successfully installed extensions", extensionsToInstall.map((e) => e.identifier.id), toProfileLocation.toString());
    }
    return extensionsToInstall;
  }
  async updateMetadata(local, metadata, profileLocation) {
    this.logService.trace("ExtensionManagementService#updateMetadata", local.identifier.id);
    if (metadata.isPreReleaseVersion) {
      metadata.preRelease = true;
      metadata.hasPreReleaseVersion = true;
    }
    if (metadata.isMachineScoped === false) {
      metadata.isMachineScoped = void 0;
    }
    if (metadata.isBuiltin === false) {
      metadata.isBuiltin = void 0;
    }
    if (metadata.pinned === false) {
      metadata.pinned = void 0;
    }
    local = await this.extensionsScanner.updateMetadata(local, metadata, profileLocation);
    this.manifestCache.invalidate(profileLocation);
    this._onDidUpdateExtensionMetadata.fire({ local, profileLocation });
    return local;
  }
  deleteExtension(extension) {
    return this.extensionsScanner.deleteExtension(extension, "remove");
  }
  copyExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
    return this.extensionsScanner.copyExtension(extension, fromProfileLocation, toProfileLocation, metadata);
  }
  moveExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
    return this.extensionsScanner.moveExtension(extension, fromProfileLocation, toProfileLocation, metadata);
  }
  removeExtension(extension, fromProfileLocation) {
    return this.extensionsScanner.removeExtension(extension.identifier, fromProfileLocation);
  }
  copyExtensions(fromProfileLocation, toProfileLocation) {
    return this.extensionsScanner.copyExtensions(fromProfileLocation, toProfileLocation, { version: this.productService.version, date: this.productService.date });
  }
  deleteExtensions(...extensions) {
    return this.extensionsScanner.setExtensionsForRemoval(...extensions);
  }
  async cleanUp() {
    this.logService.trace("ExtensionManagementService#cleanUp");
    try {
      await this.extensionsScanner.cleanUp();
    } catch (error) {
      this.logService.error(error);
    }
  }
  async download(extension, operation, donotVerifySignature) {
    const { location } = await this.downloadExtension(extension, operation, !donotVerifySignature);
    return location;
  }
  async downloadVsix(vsix) {
    if (vsix.scheme === Schemas.file) {
      return { location: vsix, async cleanup() {
      } };
    }
    this.logService.trace("Downloading extension from", vsix.toString());
    const location = joinPath(this.extensionsDownloader.extensionsDownloadDir, generateUuid());
    await this.downloadService.download(vsix, location, "extensionManagement.downloadVsix");
    this.logService.info("Downloaded extension to", location.toString());
    const cleanup = async () => {
      try {
        await this.fileService.del(location);
      } catch (error) {
        this.logService.error(error);
      }
    };
    return { location, cleanup };
  }
  getCurrentExtensionsManifestLocation() {
    return this.userDataProfilesService.defaultProfile.extensionsResource;
  }
  createInstallExtensionTask(manifest, extension, options) {
    const extensionKey = extension instanceof URI ? new ExtensionKey({ id: getGalleryExtensionId(manifest.publisher, manifest.name) }, manifest.version) : ExtensionKey.create(extension);
    return this.instantiationService.createInstance(InstallExtensionInProfileTask, extensionKey, manifest, extension, options, (operation, token) => {
      if (extension instanceof URI) {
        return this.extractVSIX(extensionKey, extension, options, token);
      }
      let promise = this.extractingGalleryExtensions.get(extensionKey.toString());
      if (!promise) {
        this.extractingGalleryExtensions.set(extensionKey.toString(), promise = this.downloadAndExtractGalleryExtension(extensionKey, extension, operation, options, token));
        promise.finally(() => this.extractingGalleryExtensions.delete(extensionKey.toString()));
      }
      return promise;
    }, this.extensionsScanner);
  }
  createUninstallExtensionTask(extension, options) {
    return new UninstallExtensionInProfileTask(extension, options, this.extensionsProfileScannerService);
  }
  async downloadAndExtractGalleryExtension(extensionKey, gallery, operation, options, token) {
    const { verificationStatus, location } = await this.downloadExtension(gallery, operation, !options.donotVerifySignature, options.context?.[EXTENSION_INSTALL_CLIENT_TARGET_PLATFORM_CONTEXT]);
    try {
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      const manifest = await getManifest(location.fsPath);
      if (!new ExtensionKey(gallery.identifier, gallery.version).equals(new ExtensionKey({ id: getGalleryExtensionId(manifest.publisher, manifest.name) }, manifest.version))) {
        throw new ExtensionManagementError(nls.localize("invalidManifest", "Cannot install '{0}' extension because of manifest mismatch with Marketplace", gallery.identifier.id), ExtensionManagementErrorCode.Invalid);
      }
      const local = await this.extensionsScanner.extractUserExtension(
        extensionKey,
        location.fsPath,
        false,
        token
      );
      if (verificationStatus !== ExtensionSignatureVerificationCode.Success && this.environmentService.isBuilt) {
        try {
          await this.extensionsDownloader.delete(location);
        } catch (e) {
          this.logService.warn(`Error while deleting the downloaded file`, location.toString(), getErrorMessage(e));
        }
      }
      return { local, verificationStatus };
    } catch (error) {
      try {
        await this.extensionsDownloader.delete(location);
      } catch (e) {
        this.logService.warn(`Error while deleting the downloaded file`, location.toString(), getErrorMessage(e));
      }
      throw toExtensionManagementError(error);
    }
  }
  async downloadExtension(extension, operation, verifySignature, clientTargetPlatform) {
    if (verifySignature) {
      const value = this.configurationService.getValue(VerifyExtensionSignatureConfigKey);
      verifySignature = isBoolean(value) ? value : true;
    }
    const { location, verificationStatus } = await this.extensionsDownloader.download(extension, operation, verifySignature, clientTargetPlatform);
    const shouldRequireSignature = shouldRequireRepositorySignatureFor(extension.private, await this.extensionGalleryManifestService.getExtensionGalleryManifest());
    if (verificationStatus !== ExtensionSignatureVerificationCode.Success && !(verificationStatus === ExtensionSignatureVerificationCode.NotSigned && !shouldRequireSignature) && verifySignature && this.environmentService.isBuilt && await this.getTargetPlatform() !== TargetPlatform.LINUX_ARMHF) {
      try {
        await this.extensionsDownloader.delete(location);
      } catch (e) {
        this.logService.warn(`Error while deleting the downloaded file`, location.toString(), getErrorMessage(e));
      }
      if (!verificationStatus) {
        throw new ExtensionManagementError(nls.localize("signature verification not executed", "Signature verification was not executed."), ExtensionManagementErrorCode.SignatureVerificationInternal);
      }
      switch (verificationStatus) {
        case ExtensionSignatureVerificationCode.PackageIntegrityCheckFailed:
        case ExtensionSignatureVerificationCode.SignatureIsInvalid:
        case ExtensionSignatureVerificationCode.SignatureManifestIsInvalid:
        case ExtensionSignatureVerificationCode.SignatureIntegrityCheckFailed:
        case ExtensionSignatureVerificationCode.EntryIsMissing:
        case ExtensionSignatureVerificationCode.EntryIsTampered:
        case ExtensionSignatureVerificationCode.Untrusted:
        case ExtensionSignatureVerificationCode.CertificateRevoked:
        case ExtensionSignatureVerificationCode.SignatureIsNotValid:
        case ExtensionSignatureVerificationCode.SignatureArchiveHasTooManyEntries:
        case ExtensionSignatureVerificationCode.NotSigned:
          throw new ExtensionManagementError(nls.localize("signature verification failed", "Signature verification failed with '{0}' error.", verificationStatus), ExtensionManagementErrorCode.SignatureVerificationFailed);
      }
      throw new ExtensionManagementError(nls.localize("signature verification failed", "Signature verification failed with '{0}' error.", verificationStatus), ExtensionManagementErrorCode.SignatureVerificationInternal);
    }
    return { location, verificationStatus };
  }
  async extractVSIX(extensionKey, location, options, token) {
    const local = await this.extensionsScanner.extractUserExtension(
      extensionKey,
      path.resolve(location.fsPath),
      isBoolean(options.keepExisting) ? !options.keepExisting : true,
      token
    );
    return { local };
  }
  async collectFiles(extension) {
    const collectFilesFromDirectory = async (dir) => {
      let entries = await pfs.Promises.readdir(dir);
      entries = entries.map((e) => path.join(dir, e));
      const stats = await Promise.all(entries.map((e) => fs.promises.stat(e)));
      let promise = Promise.resolve([]);
      stats.forEach((stat, index) => {
        const entry = entries[index];
        if (stat.isFile()) {
          promise = promise.then((result) => [...result, entry]);
        }
        if (stat.isDirectory()) {
          promise = promise.then((result) => collectFilesFromDirectory(entry).then((files2) => [...result, ...files2]));
        }
      });
      return promise;
    };
    const files = await collectFilesFromDirectory(extension.location.fsPath);
    return files.map((f) => ({ path: `extension/${path.relative(extension.location.fsPath, f)}`, localPath: f }));
  }
  async onDidChangeExtensionsFromAnotherSource({ added, removed }) {
    if (removed) {
      const removedExtensions = added && this.uriIdentityService.extUri.isEqual(removed.profileLocation, added.profileLocation) ? removed.extensions.filter((e) => added.extensions.every((identifier) => !areSameExtensions(identifier, e))) : removed.extensions;
      for (const identifier of removedExtensions) {
        this.logService.info("Extensions removed from another source", identifier.id, removed.profileLocation.toString());
        this._onDidUninstallExtension.fire({ identifier, profileLocation: removed.profileLocation });
      }
    }
    if (added) {
      const extensions = await this.getInstalled(ExtensionType.User, added.profileLocation);
      const addedExtensions = extensions.filter((e) => added.extensions.some((identifier) => areSameExtensions(identifier, e.identifier)));
      this._onDidInstallExtensions.fire(addedExtensions.map((local) => {
        this.logService.info("Extensions added from another source", local.identifier.id, added.profileLocation.toString());
        return { identifier: local.identifier, local, profileLocation: added.profileLocation, operation: InstallOperation.None };
      }));
    }
  }
  async watchForExtensionsNotInstalledBySystem() {
    this._register(this.extensionsScanner.onExtract((resource) => this.knownDirectories.add(resource)));
    const stat = await this.fileService.resolve(this.extensionsScannerService.userExtensionsLocation);
    for (const childStat of stat.children ?? []) {
      if (childStat.isDirectory) {
        this.knownDirectories.add(childStat.resource);
      }
    }
    this._register(this.fileService.watch(this.extensionsScannerService.userExtensionsLocation));
    this._register(this.fileService.onDidFilesChange((e) => this.onDidFilesChange(e)));
  }
  async onDidFilesChange(e) {
    if (!e.affects(this.extensionsScannerService.userExtensionsLocation, FileChangeType.ADDED)) {
      return;
    }
    const added = [];
    for (const resource of e.rawAdded) {
      if (this.knownDirectories.has(resource)) {
        continue;
      }
      if (!this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.dirname(resource), this.extensionsScannerService.userExtensionsLocation)) {
        continue;
      }
      if (this.uriIdentityService.extUri.isEqual(resource, this.uriIdentityService.extUri.joinPath(this.extensionsScannerService.userExtensionsLocation, ".obsolete"))) {
        continue;
      }
      if (this.uriIdentityService.extUri.basename(resource).startsWith(".")) {
        continue;
      }
      if (this.uriIdentityService.extUri.basename(resource).endsWith(DELETED_FOLDER_POSTFIX)) {
        continue;
      }
      try {
        if (!(await this.fileService.stat(resource)).isDirectory) {
          continue;
        }
      } catch (error) {
        if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
          this.logService.error(error);
        }
        continue;
      }
      const extension = await this.extensionsScanner.scanUserExtensionAtLocation(resource);
      if (extension && extension.installedTimestamp === void 0) {
        this.knownDirectories.add(resource);
        added.push(extension);
      }
    }
    if (added.length) {
      await this.addExtensionsToProfile(added.map((e2) => [e2, void 0]), this.userDataProfilesService.defaultProfile.extensionsResource);
      this.logService.info("Added extensions to default profile from external source", added.map((e2) => e2.identifier.id));
    }
  }
  async addExtensionsToProfile(extensions, profileLocation) {
    const localExtensions = extensions.map((e) => e[0]);
    await this.extensionsScanner.unsetExtensionsForRemoval(...localExtensions.map((extension) => ExtensionKey.create(extension)));
    await this.extensionsProfileScannerService.addExtensionsToProfile(extensions, profileLocation);
    this._onDidInstallExtensions.fire(localExtensions.map((local) => ({ local, identifier: local.identifier, operation: InstallOperation.None, profileLocation })));
  }
};
ExtensionManagementService = __decorateClass([
  __decorateParam(0, IExtensionGalleryService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, ILogService),
  __decorateParam(3, INativeEnvironmentService),
  __decorateParam(4, IExtensionsScannerService),
  __decorateParam(5, IExtensionsProfileScannerService),
  __decorateParam(6, IDownloadService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IExtensionGalleryManifestService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IAllowedExtensionsService),
  __decorateParam(13, IUriIdentityService),
  __decorateParam(14, IUserDataProfilesService)
], ExtensionManagementService);
let ExtensionsScanner = class extends Disposable {
  constructor(beforeRemovingExtension, environmentService, fileService, extensionsScannerService, extensionsProfileScannerService, uriIdentityService, telemetryService, productService, userDataProfilesService, logService) {
    super();
    this.beforeRemovingExtension = beforeRemovingExtension;
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.extensionsScannerService = extensionsScannerService;
    this.extensionsProfileScannerService = extensionsProfileScannerService;
    this.uriIdentityService = uriIdentityService;
    this.telemetryService = telemetryService;
    this.productService = productService;
    this.userDataProfilesService = userDataProfilesService;
    this.logService = logService;
    this._onExtract = this._register(new Emitter());
    this.onExtract = this._onExtract.event;
    this.scanAllExtensionPromise = new ResourceMap();
    this.scanUserExtensionsPromise = new ResourceMap();
    this.obsoletedResource = joinPath(this.extensionsScannerService.userExtensionsLocation, ".obsolete");
    this.obsoleteFileLimiter = new Queue();
  }
  async cleanUp() {
    await this.removeTemporarilyDeletedFolders();
    await this.removeStaleAutoUpdateBuiltinExtensions();
    await this.deleteExtensionsMarkedForRemoval();
    await this.initializeExtensionSize();
  }
  async scanExtensions(type, profileLocation, productVersion, language) {
    try {
      const cacheKey = profileLocation.with({ query: language });
      const userScanOptions = { includeInvalid: true, profileLocation, productVersion, language };
      let scannedExtensions = [];
      if (type === null || type === ExtensionType.System) {
        let scanAllExtensionsPromise = this.scanAllExtensionPromise.get(cacheKey);
        if (!scanAllExtensionsPromise) {
          scanAllExtensionsPromise = this.extensionsScannerService.scanAllExtensions({ language }, userScanOptions).finally(() => this.scanAllExtensionPromise.delete(cacheKey));
          this.scanAllExtensionPromise.set(cacheKey, scanAllExtensionsPromise);
        }
        scannedExtensions.push(...await scanAllExtensionsPromise);
      } else if (type === ExtensionType.User) {
        let scanUserExtensionsPromise = this.scanUserExtensionsPromise.get(cacheKey);
        if (!scanUserExtensionsPromise) {
          scanUserExtensionsPromise = this.extensionsScannerService.scanUserExtensions(userScanOptions).finally(() => this.scanUserExtensionsPromise.delete(cacheKey));
          this.scanUserExtensionsPromise.set(cacheKey, scanUserExtensionsPromise);
        }
        scannedExtensions.push(...await scanUserExtensionsPromise);
      }
      scannedExtensions = type !== null ? scannedExtensions.filter((r) => r.type === type) : scannedExtensions;
      return await Promise.all(scannedExtensions.map((extension) => this.toLocalExtension(extension)));
    } catch (error) {
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.Scanning);
    }
  }
  async scanAllUserExtensions() {
    try {
      const scannedExtensions = await this.extensionsScannerService.scanAllUserExtensions();
      return await Promise.all(scannedExtensions.map((extension) => this.toLocalExtension(extension)));
    } catch (error) {
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.Scanning);
    }
  }
  async scanUserExtensionAtLocation(location) {
    try {
      const scannedExtension = await this.extensionsScannerService.scanExistingExtension(location, ExtensionType.User, { includeInvalid: true });
      if (scannedExtension) {
        return await this.toLocalExtension(scannedExtension);
      }
    } catch (error) {
      this.logService.error(error);
    }
    return null;
  }
  async extractUserExtension(extensionKey, zipPath, removeIfExists, token) {
    const folderName = extensionKey.toString();
    const tempLocation = URI.file(path.join(this.extensionsScannerService.userExtensionsLocation.fsPath, `.${generateUuid()}`));
    const extensionLocation = URI.file(path.join(this.extensionsScannerService.userExtensionsLocation.fsPath, folderName));
    if (await this.fileService.exists(extensionLocation)) {
      if (!removeIfExists) {
        try {
          return await this.scanLocalExtension(extensionLocation, ExtensionType.User);
        } catch (error) {
          this.logService.warn(`Error while scanning the existing extension at ${extensionLocation.path}. Deleting the existing extension and extracting it.`, getErrorMessage(error));
        }
      }
      try {
        await this.deleteExtensionFromLocation(extensionKey.id, extensionLocation, "removeExisting");
      } catch (error) {
        throw new ExtensionManagementError(nls.localize("errorDeleting", "Unable to delete the existing folder '{0}' while installing the extension '{1}'. Please delete the folder manually and try again", extensionLocation.fsPath, extensionKey.id), ExtensionManagementErrorCode.Delete);
      }
    }
    try {
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      try {
        this.logService.trace(`Started extracting the extension from ${zipPath} to ${extensionLocation.fsPath}`);
        await extract(zipPath, tempLocation.fsPath, { sourcePath: "extension", overwrite: true }, token);
        this.logService.info(`Extracted extension to ${extensionLocation}:`, extensionKey.id);
      } catch (e) {
        throw fromExtractError(e);
      }
      const metadata = { installedTimestamp: Date.now(), targetPlatform: extensionKey.targetPlatform };
      try {
        metadata.size = await computeSize(tempLocation, this.fileService);
      } catch (error) {
        this.logService.warn(`Error while getting the size of the extracted extension : ${tempLocation.fsPath}`, getErrorMessage(error));
      }
      try {
        await this.extensionsScannerService.updateManifestMetadata(tempLocation, metadata);
      } catch (error) {
        this.telemetryService.publicLog2("extension:extract", { extensionId: extensionKey.id, code: `${toFileOperationResult(error)}` });
        throw toExtensionManagementError(error, ExtensionManagementErrorCode.UpdateMetadata);
      }
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      try {
        this.logService.trace(`Started renaming the extension from ${tempLocation.fsPath} to ${extensionLocation.fsPath}`);
        await this.rename(tempLocation.fsPath, extensionLocation.fsPath);
        this.logService.info("Renamed to", extensionLocation.fsPath);
      } catch (error) {
        if (error.code === "ENOTEMPTY") {
          this.logService.info(`Rename failed because extension was installed by another source. So ignoring renaming.`, extensionKey.id);
          try {
            await this.fileService.del(tempLocation, { recursive: true });
          } catch (e) {
          }
        } else {
          this.logService.info(`Rename failed because of ${getErrorMessage(error)}. Deleted from extracted location`, tempLocation);
          throw error;
        }
      }
      this._onExtract.fire(extensionLocation);
    } catch (error) {
      try {
        await this.fileService.del(tempLocation, { recursive: true });
      } catch (e) {
      }
      throw error;
    }
    return this.scanLocalExtension(extensionLocation, ExtensionType.User);
  }
  async scanMetadata(local, profileLocation) {
    const extension = await this.getScannedExtension(local, profileLocation);
    return extension?.metadata;
  }
  async getScannedExtension(local, profileLocation) {
    const extensions = await this.extensionsProfileScannerService.scanProfileExtensions(profileLocation);
    return extensions.find((e) => areSameExtensions(e.identifier, local.identifier));
  }
  async updateMetadata(local, metadata, profileLocation) {
    try {
      await this.extensionsProfileScannerService.updateMetadata([[local, metadata]], profileLocation);
    } catch (error) {
      this.telemetryService.publicLog2("extension:extract", { extensionId: local.identifier.id, code: `${toFileOperationResult(error)}`, isProfile: !!profileLocation });
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.UpdateMetadata);
    }
    return this.scanLocalExtension(local.location, local.type, profileLocation);
  }
  async setExtensionsForRemoval(...extensions) {
    const extensionsToRemove = [];
    for (const extension of extensions) {
      if (await this.fileService.exists(extension.location)) {
        extensionsToRemove.push(extension);
      }
    }
    const extensionKeys = extensionsToRemove.map((e) => ExtensionKey.create(e));
    await this.withRemovedExtensions((removedExtensions) => extensionKeys.forEach((extensionKey) => {
      removedExtensions[extensionKey.toString()] = true;
      this.logService.info("Marked extension as removed", extensionKey.toString());
    }));
  }
  async unsetExtensionsForRemoval(...extensionKeys) {
    try {
      const results = [];
      await this.withRemovedExtensions((removedExtensions) => extensionKeys.forEach((extensionKey) => {
        if (removedExtensions[extensionKey.toString()]) {
          results.push(true);
          delete removedExtensions[extensionKey.toString()];
        } else {
          results.push(false);
        }
      }));
      return results;
    } catch (error) {
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.UnsetRemoved);
    }
  }
  async deleteExtension(extension, type) {
    if (this.uriIdentityService.extUri.isEqualOrParent(extension.location, this.extensionsScannerService.userExtensionsLocation)) {
      await this.deleteExtensionFromLocation(extension.identifier.id, extension.location, type);
      await this.unsetExtensionsForRemoval(ExtensionKey.create(extension));
    }
  }
  async copyExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
    const source = await this.getScannedExtension(extension, fromProfileLocation);
    const target = await this.getScannedExtension(extension, toProfileLocation);
    metadata = { ...source?.metadata, ...metadata };
    if (target) {
      if (this.uriIdentityService.extUri.isEqual(target.location, extension.location)) {
        await this.extensionsProfileScannerService.updateMetadata([[extension, { ...target.metadata, ...metadata }]], toProfileLocation);
      } else {
        const targetExtension = await this.scanLocalExtension(target.location, extension.type, toProfileLocation);
        await this.extensionsProfileScannerService.removeExtensionsFromProfile([targetExtension.identifier], toProfileLocation);
        await this.extensionsProfileScannerService.addExtensionsToProfile([[extension, { ...target.metadata, ...metadata }]], toProfileLocation);
      }
    } else {
      await this.extensionsProfileScannerService.addExtensionsToProfile([[extension, metadata]], toProfileLocation);
    }
    return this.scanLocalExtension(extension.location, extension.type, toProfileLocation);
  }
  async moveExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
    const source = await this.getScannedExtension(extension, fromProfileLocation);
    const target = await this.getScannedExtension(extension, toProfileLocation);
    metadata = { ...source?.metadata, ...metadata };
    if (target) {
      if (this.uriIdentityService.extUri.isEqual(target.location, extension.location)) {
        await this.extensionsProfileScannerService.updateMetadata([[extension, { ...target.metadata, ...metadata }]], toProfileLocation);
      } else {
        const targetExtension = await this.scanLocalExtension(target.location, extension.type, toProfileLocation);
        await this.removeExtension(targetExtension.identifier, toProfileLocation);
        await this.extensionsProfileScannerService.addExtensionsToProfile([[extension, { ...target.metadata, ...metadata }]], toProfileLocation);
      }
    } else {
      await this.extensionsProfileScannerService.addExtensionsToProfile([[extension, metadata]], toProfileLocation);
      if (source) {
        await this.removeExtension(source.identifier, fromProfileLocation);
      }
    }
    return this.scanLocalExtension(extension.location, extension.type, toProfileLocation);
  }
  async removeExtension(identifier, fromProfileLocation) {
    await this.extensionsProfileScannerService.removeExtensionsFromProfile([identifier], fromProfileLocation);
  }
  async copyExtensions(fromProfileLocation, toProfileLocation, productVersion) {
    const fromExtensions = await this.scanExtensions(ExtensionType.User, fromProfileLocation, productVersion);
    const extensions = await Promise.all(fromExtensions.filter((e) => !e.isApplicationScoped).map(async (e) => [e, await this.scanMetadata(e, fromProfileLocation)]));
    await this.extensionsProfileScannerService.addExtensionsToProfile(extensions, toProfileLocation);
  }
  async deleteExtensionFromLocation(id, location, type) {
    this.logService.trace(`Deleting ${type} extension from disk`, id, location.fsPath);
    const renamedLocation = this.uriIdentityService.extUri.joinPath(this.uriIdentityService.extUri.dirname(location), `${this.uriIdentityService.extUri.basename(location)}.${hash(generateUuid()).toString(16)}${DELETED_FOLDER_POSTFIX}`);
    await this.rename(location.fsPath, renamedLocation.fsPath);
    await this.fileService.del(renamedLocation, { recursive: true });
    this.logService.info(`Deleted ${type} extension from disk`, id, location.fsPath);
  }
  withRemovedExtensions(updateFn) {
    return this.obsoleteFileLimiter.queue(async () => {
      let raw;
      try {
        const content = await this.fileService.readFile(this.obsoletedResource, "utf8");
        raw = content.value.toString();
      } catch (error) {
        if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
          throw error;
        }
      }
      let removed = {};
      if (raw) {
        try {
          removed = JSON.parse(raw);
        } catch (e) {
        }
      }
      if (updateFn) {
        updateFn(removed);
        if (Object.keys(removed).length) {
          await this.fileService.writeFile(this.obsoletedResource, VSBuffer.fromString(JSON.stringify(removed)));
        } else {
          try {
            await this.fileService.del(this.obsoletedResource);
          } catch (error) {
            if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
              throw error;
            }
          }
        }
      }
      return removed;
    });
  }
  async rename(extractPath, renamePath) {
    try {
      await pfs.Promises.rename(
        extractPath,
        renamePath,
        2 * 60 * 1e3
        /* Retry for 2 minutes */
      );
    } catch (error) {
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.Rename);
    }
  }
  async scanLocalExtension(location, type, profileLocation) {
    try {
      if (profileLocation) {
        const scannedExtensions = await this.extensionsScannerService.scanUserExtensions({ profileLocation });
        const scannedExtension = scannedExtensions.find((e) => this.uriIdentityService.extUri.isEqual(e.location, location));
        if (scannedExtension) {
          return await this.toLocalExtension(scannedExtension);
        }
      } else {
        const scannedExtension = await this.extensionsScannerService.scanExistingExtension(location, type, { includeInvalid: true });
        if (scannedExtension) {
          return await this.toLocalExtension(scannedExtension);
        }
      }
      throw new ExtensionManagementError(nls.localize("cannot read", "Cannot read the extension from {0}", location.path), ExtensionManagementErrorCode.ScanningExtension);
    } catch (error) {
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.ScanningExtension);
    }
  }
  async toLocalExtension(extension) {
    let stat;
    try {
      stat = await this.fileService.resolve(extension.location);
    } catch (error) {
    }
    let readmeUrl;
    let changelogUrl;
    if (stat?.children) {
      readmeUrl = stat.children.find(({ name }) => /^readme(\.txt|\.md|)$/i.test(name))?.resource;
      changelogUrl = stat.children.find(({ name }) => /^changelog(\.txt|\.md|)$/i.test(name))?.resource;
    }
    return {
      identifier: extension.identifier,
      type: extension.type,
      isBuiltin: extension.isBuiltin || !!extension.metadata?.isBuiltin,
      location: extension.location,
      manifest: extension.manifest,
      targetPlatform: extension.targetPlatform,
      validations: extension.validations,
      isValid: extension.isValid,
      readmeUrl,
      changelogUrl,
      publisherDisplayName: extension.metadata?.publisherDisplayName,
      publisherId: extension.metadata?.publisherId || null,
      isApplicationScoped: !!extension.metadata?.isApplicationScoped,
      isMachineScoped: !!extension.metadata?.isMachineScoped,
      isPreReleaseVersion: !!extension.metadata?.isPreReleaseVersion,
      hasPreReleaseVersion: !!extension.metadata?.hasPreReleaseVersion,
      preRelease: extension.preRelease,
      installedTimestamp: extension.metadata?.installedTimestamp,
      updated: !!extension.metadata?.updated,
      pinned: !!extension.metadata?.pinned,
      forceAutoUpdate: extension.forceAutoUpdate,
      private: !!extension.metadata?.private,
      isWorkspaceScoped: false,
      source: extension.metadata?.source ?? (extension.identifier.uuid ? "gallery" : "vsix"),
      size: extension.metadata?.size ?? 0
    };
  }
  async initializeExtensionSize() {
    const extensions = await this.extensionsScannerService.scanAllUserExtensions();
    await Promise.all(extensions.map(async (extension) => {
      if (isDefined(extension.metadata?.installedTimestamp) && isUndefined(extension.metadata?.size)) {
        const size = await computeSize(extension.location, this.fileService);
        await this.extensionsScannerService.updateManifestMetadata(extension.location, { size });
      }
    }));
  }
  async removeStaleAutoUpdateBuiltinExtensions() {
    if (this.environmentService.extensionTestsLocationURI) {
      return;
    }
    const builtinExtensions = await this.extensionsScannerService.scanSystemExtensions({});
    const userExtensions = await this.extensionsScannerService.scanAllUserExtensions();
    const staleExtensions = userExtensions.filter((userExtension) => {
      if (!this.productService.builtInExtensionsEnabledWithAutoUpdates.some((id) => id.toLowerCase() === userExtension.identifier.id.toLowerCase())) {
        return false;
      }
      const builtinExtension = builtinExtensions.find((e) => areSameExtensions(e.identifier, userExtension.identifier));
      return builtinExtension && semver.lt(userExtension.manifest.version, builtinExtension.manifest.version);
    });
    if (staleExtensions.length) {
      this.logService.info("Removing stale auto-update builtin extensions:", staleExtensions.map((e) => `${e.identifier.id}@${e.manifest.version}`).join(", "));
      await this.extensionsProfileScannerService.removeExtensionsFromProfile(staleExtensions.map((e) => e.identifier), this.userDataProfilesService.defaultProfile.extensionsResource);
      await Promise.allSettled(staleExtensions.map((e) => this.deleteExtension(e, "stale auto-update builtin")));
    }
  }
  async deleteExtensionsMarkedForRemoval() {
    let removed;
    try {
      removed = await this.withRemovedExtensions();
    } catch (error) {
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.ReadRemoved);
    }
    if (Object.keys(removed).length === 0) {
      this.logService.debug(`No extensions are marked as removed.`);
      return;
    }
    this.logService.debug(`Deleting extensions marked as removed:`, Object.keys(removed));
    const extensions = await this.scanAllUserExtensions();
    const installed = /* @__PURE__ */ new Set();
    for (const e of extensions) {
      if (!removed[ExtensionKey.create(e).toString()]) {
        installed.add(e.identifier.id.toLowerCase());
      }
    }
    try {
      const byExtension = groupByExtension(extensions, (e) => e.identifier);
      await Promises.settled(byExtension.map(async (e) => {
        const latest = e.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version))[0];
        if (!installed.has(latest.identifier.id.toLowerCase())) {
          await this.beforeRemovingExtension(latest);
        }
      }));
    } catch (error) {
      this.logService.error(error);
    }
    const toRemove = extensions.filter((e) => e.installedTimestamp && removed[ExtensionKey.create(e).toString()]);
    await Promise.allSettled(toRemove.map((e) => this.deleteExtension(e, "marked for removal")));
  }
  async removeTemporarilyDeletedFolders() {
    this.logService.trace("ExtensionManagementService#removeTempDeleteFolders");
    let stat;
    try {
      stat = await this.fileService.resolve(this.extensionsScannerService.userExtensionsLocation);
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.error(error);
      }
      return;
    }
    if (!stat?.children) {
      return;
    }
    try {
      await Promise.allSettled(stat.children.map(async (child) => {
        if (!child.isDirectory || !child.name.endsWith(DELETED_FOLDER_POSTFIX)) {
          return;
        }
        this.logService.trace("Deleting the temporarily deleted folder", child.resource.toString());
        try {
          await this.fileService.del(child.resource, { recursive: true });
          this.logService.trace("Deleted the temporarily deleted folder", child.resource.toString());
        } catch (error) {
          if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
            this.logService.error(error);
          }
        }
      }));
    } catch (error) {
    }
  }
};
ExtensionsScanner = __decorateClass([
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IExtensionsScannerService),
  __decorateParam(4, IExtensionsProfileScannerService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IProductService),
  __decorateParam(8, IUserDataProfilesService),
  __decorateParam(9, ILogService)
], ExtensionsScanner);
let InstallExtensionInProfileTask = class extends AbstractExtensionTask {
  constructor(extensionKey, manifest, source, options, extractExtensionFn, extensionsScanner, uriIdentityService, galleryService, userDataProfilesService, extensionsScannerService, extensionsProfileScannerService, productService, logService) {
    super();
    this.extensionKey = extensionKey;
    this.manifest = manifest;
    this.source = source;
    this.options = options;
    this.extractExtensionFn = extractExtensionFn;
    this.extensionsScanner = extensionsScanner;
    this.uriIdentityService = uriIdentityService;
    this.galleryService = galleryService;
    this.userDataProfilesService = userDataProfilesService;
    this.extensionsScannerService = extensionsScannerService;
    this.extensionsProfileScannerService = extensionsProfileScannerService;
    this.productService = productService;
    this.logService = logService;
    this._operation = InstallOperation.Install;
    this.identifier = this.extensionKey.identifier;
  }
  get operation() {
    return this.options.operation ?? this._operation;
  }
  get verificationStatus() {
    return this._verificationStatus;
  }
  async doRun(token) {
    const installed = await this.extensionsScanner.scanExtensions(ExtensionType.User, this.options.profileLocation, this.options.productVersion);
    const existingExtension = installed.find((i) => areSameExtensions(i.identifier, this.identifier));
    if (existingExtension) {
      this._operation = InstallOperation.Update;
    }
    const system = await this.extensionsScanner.scanExtensions(ExtensionType.System, this.options.profileLocation, this.options.productVersion);
    const existingSystemExtension = system.find((i) => areSameExtensions(i.identifier, this.identifier));
    if (existingSystemExtension) {
      if (!existingSystemExtension.forceAutoUpdate) {
        throw new ExtensionManagementError(nls.localize("builtinAutoUpdate", "Extension '{0}' is a built-in extension and not allowed to be updated in the current product quality '{1}'.", existingSystemExtension.identifier.id, this.productService.quality), ExtensionManagementErrorCode.Incompatible);
      }
      if (semver.gt(existingSystemExtension.manifest.version, this.manifest.version)) {
        throw new ExtensionManagementError(nls.localize("builtinVersion", "Extension '{0}' is a built-in extension with version '{1}' and cannot be downgraded to version '{2}'.", existingSystemExtension.identifier.id, existingSystemExtension.manifest.version, this.manifest.version), ExtensionManagementErrorCode.Incompatible);
      }
    }
    const metadata = {
      isApplicationScoped: this.options.isApplicationScoped || existingExtension?.isApplicationScoped,
      isMachineScoped: this.options.isMachineScoped || existingExtension?.isMachineScoped,
      isBuiltin: this.options.isBuiltin || existingExtension?.isBuiltin,
      isSystem: existingExtension?.type === ExtensionType.System ? true : void 0,
      installedTimestamp: Date.now(),
      pinned: this.options.installGivenVersion ? true : this.options.pinned ?? existingExtension?.pinned,
      source: this.source instanceof URI ? "vsix" : "gallery"
    };
    let local;
    if (this.source instanceof URI) {
      if (existingExtension) {
        if (this.extensionKey.equals(new ExtensionKey(existingExtension.identifier, existingExtension.manifest.version))) {
          try {
            await this.extensionsScanner.deleteExtension(existingExtension, "existing");
          } catch (e) {
            throw new Error(nls.localize("restartCode", "Please restart VS Code before reinstalling {0}.", this.manifest.displayName || this.manifest.name));
          }
        }
      }
      const existingWithSameVersion = await this.unsetIfRemoved(this.extensionKey);
      if (existingWithSameVersion) {
        try {
          await this.extensionsScanner.deleteExtension(existingWithSameVersion, "existing");
        } catch (e) {
          throw new Error(nls.localize("restartCode", "Please restart VS Code before reinstalling {0}.", this.manifest.displayName || this.manifest.name));
        }
      }
    } else {
      metadata.id = this.source.identifier.uuid;
      metadata.publisherId = this.source.publisherId;
      metadata.publisherDisplayName = this.source.publisherDisplayName;
      metadata.targetPlatform = this.source.properties.targetPlatform;
      metadata.updated = !!existingExtension;
      metadata.private = this.source.private;
      metadata.isPreReleaseVersion = this.source.properties.isPreReleaseVersion;
      metadata.hasPreReleaseVersion = existingExtension?.hasPreReleaseVersion || this.source.properties.isPreReleaseVersion;
      metadata.preRelease = isBoolean(this.options.preRelease) ? this.options.preRelease : this.options.installPreReleaseVersion || this.source.properties.isPreReleaseVersion || existingExtension?.preRelease;
      if (existingExtension && existingExtension.type !== ExtensionType.System && existingExtension.manifest.version === this.source.version) {
        return this.extensionsScanner.updateMetadata(existingExtension, metadata, this.options.profileLocation);
      }
      local = await this.unsetIfRemoved(this.extensionKey);
    }
    if (token.isCancellationRequested) {
      throw toExtensionManagementError(new CancellationError());
    }
    if (!local) {
      const result2 = await this.extractExtensionFn(this.operation, token);
      local = result2.local;
      this._verificationStatus = result2.verificationStatus;
    }
    if (this.uriIdentityService.extUri.isEqual(this.userDataProfilesService.defaultProfile.extensionsResource, this.options.profileLocation)) {
      try {
        await this.extensionsScannerService.initializeDefaultProfileExtensions();
      } catch (error) {
        throw toExtensionManagementError(error, ExtensionManagementErrorCode.IntializeDefaultProfile);
      }
    }
    if (token.isCancellationRequested) {
      throw toExtensionManagementError(new CancellationError());
    }
    try {
      await this.extensionsProfileScannerService.addExtensionsToProfile([[local, metadata]], this.options.profileLocation, !local.isValid);
    } catch (error) {
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.AddToProfile);
    }
    const result = await this.extensionsScanner.scanLocalExtension(local.location, ExtensionType.User, this.options.profileLocation);
    if (!result) {
      throw new ExtensionManagementError("Cannot find the installed extension", ExtensionManagementErrorCode.InstalledExtensionNotFound);
    }
    if (this.source instanceof URI) {
      this.updateMetadata(local, token);
    }
    return result;
  }
  async unsetIfRemoved(extensionKey) {
    const [removed] = await this.extensionsScanner.unsetExtensionsForRemoval(extensionKey);
    if (removed) {
      this.logService.info("Removed the extension from removed list:", extensionKey.id);
      const userExtensions = await this.extensionsScanner.scanAllUserExtensions();
      return userExtensions.find((i) => ExtensionKey.create(i).equals(extensionKey));
    }
    return void 0;
  }
  async updateMetadata(extension, token) {
    try {
      let [galleryExtension] = await this.galleryService.getExtensions([{ id: extension.identifier.id, version: extension.manifest.version }], token);
      if (!galleryExtension) {
        [galleryExtension] = await this.galleryService.getExtensions([{ id: extension.identifier.id }], token);
      }
      if (galleryExtension) {
        const metadata = {
          id: galleryExtension.identifier.uuid,
          publisherDisplayName: galleryExtension.publisherDisplayName,
          publisherId: galleryExtension.publisherId,
          isPreReleaseVersion: galleryExtension.properties.isPreReleaseVersion,
          hasPreReleaseVersion: extension.hasPreReleaseVersion || galleryExtension.properties.isPreReleaseVersion,
          preRelease: galleryExtension.properties.isPreReleaseVersion || this.options.installPreReleaseVersion
        };
        await this.extensionsScanner.updateMetadata(extension, metadata, this.options.profileLocation);
      }
    } catch (error) {
    }
  }
};
InstallExtensionInProfileTask = __decorateClass([
  __decorateParam(6, IUriIdentityService),
  __decorateParam(7, IExtensionGalleryService),
  __decorateParam(8, IUserDataProfilesService),
  __decorateParam(9, IExtensionsScannerService),
  __decorateParam(10, IExtensionsProfileScannerService),
  __decorateParam(11, IProductService),
  __decorateParam(12, ILogService)
], InstallExtensionInProfileTask);
class UninstallExtensionInProfileTask extends AbstractExtensionTask {
  constructor(extension, options, extensionsProfileScannerService) {
    super();
    this.extension = extension;
    this.options = options;
    this.extensionsProfileScannerService = extensionsProfileScannerService;
  }
  doRun(token) {
    return this.extensionsProfileScannerService.removeExtensionsFromProfile([this.extension.identifier], this.options.profileLocation);
  }
}
export {
  ExtensionManagementService,
  ExtensionsScanner,
  INativeServerExtensionManagementService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvbm9kZS9leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IFByb21pc2VzLCBRdWV1ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCAqIGFzIHNlbXZlciBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZW12ZXIvc2VtdmVyLmpzJztcbmltcG9ydCB7IGlzQm9vbGVhbiwgaXNEZWZpbmVkLCBpc1VuZGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCAqIGFzIHBmcyBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IGV4dHJhY3QsIElGaWxlLCB6aXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvemlwLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSURvd25sb2FkU2VydmljZSB9IGZyb20gJy4uLy4uL2Rvd25sb2FkL2NvbW1vbi9kb3dubG9hZC5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlLCBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEFic3RyYWN0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIEFic3RyYWN0RXh0ZW5zaW9uVGFzaywgSUluc3RhbGxFeHRlbnNpb25UYXNrLCBJbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMsIElVbmluc3RhbGxFeHRlbnNpb25UYXNrLCB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvciwgVW5pbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vYWJzdHJhY3RFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5qcyc7XG5pbXBvcnQge1xuXHRFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUsIElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSUdhbGxlcnlFeHRlbnNpb24sIElMb2NhbEV4dGVuc2lvbiwgSW5zdGFsbE9wZXJhdGlvbixcblx0TWV0YWRhdGEsIEluc3RhbGxPcHRpb25zLFxuXHRJUHJvZHVjdFZlcnNpb24sXG5cdEVYVEVOU0lPTl9JTlNUQUxMX0NMSUVOVF9UQVJHRVRfUExBVEZPUk1fQ09OVEVYVCxcblx0RXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZSxcblx0Y29tcHV0ZVNpemUsXG5cdElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdFZlcmlmeUV4dGVuc2lvblNpZ25hdHVyZUNvbmZpZ0tleSxcblx0c2hvdWxkUmVxdWlyZVJlcG9zaXRvcnlTaWduYXR1cmVGb3IsXG59IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zLCBjb21wdXRlVGFyZ2V0UGxhdGZvcm0sIEV4dGVuc2lvbktleSwgZ2V0R2FsbGVyeUV4dGVuc2lvbklkLCBncm91cEJ5RXh0ZW5zaW9uIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLCBJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb24gfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLCBJU2Nhbm5lZEV4dGVuc2lvbiwgTWFuaWZlc3RNZXRhZGF0YSwgVXNlckV4dGVuc2lvbnNTY2FuT3B0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zU2Nhbm5lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc0Rvd25sb2FkZXIgfSBmcm9tICcuL2V4dGVuc2lvbkRvd25sb2FkZXIuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc0xpZmVjeWNsZSB9IGZyb20gJy4vZXh0ZW5zaW9uTGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGZyb21FeHRyYWN0RXJyb3IsIGdldE1hbmlmZXN0IH0gZnJvbSAnLi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zTWFuaWZlc3RDYWNoZSB9IGZyb20gJy4vZXh0ZW5zaW9uc01hbmlmZXN0Q2FjaGUuanMnO1xuaW1wb3J0IHsgRGlkQ2hhbmdlUHJvZmlsZUV4dGVuc2lvbnNFdmVudCwgRXh0ZW5zaW9uc1dhdGNoZXIgfSBmcm9tICcuL2V4dGVuc2lvbnNXYXRjaGVyLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblR5cGUsIElFeHRlbnNpb24sIElFeHRlbnNpb25NYW5pZmVzdCwgVGFyZ2V0UGxhdGZvcm0gfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGlzRW5naW5lVmFsaWQgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25WYWxpZGF0b3IuanMnO1xuaW1wb3J0IHsgRmlsZUNoYW5nZXNFdmVudCwgRmlsZUNoYW5nZVR5cGUsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlU2VydmljZSwgSUZpbGVTdGF0LCB0b0ZpbGVPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCByZWZpbmVTZXJ2aWNlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdC5qcyc7XG5cbmV4cG9ydCBjb25zdCBJTmF0aXZlU2VydmVyRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgPSByZWZpbmVTZXJ2aWNlRGVjb3JhdG9yPElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSU5hdGl2ZVNlcnZlckV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlPihJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UpO1xuZXhwb3J0IGludGVyZmFjZSBJTmF0aXZlU2VydmVyRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHNjYW5BbGxVc2VySW5zdGFsbGVkRXh0ZW5zaW9ucygpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbltdPjtcblx0c2Nhbkluc3RhbGxlZEV4dGVuc2lvbkF0TG9jYXRpb24obG9jYXRpb246IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uIHwgbnVsbD47XG5cdGRlbGV0ZUV4dGVuc2lvbnMoLi4uZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKTogUHJvbWlzZTx2b2lkPjtcbn1cblxudHlwZSBFeHRyYWN0RXh0ZW5zaW9uUmVzdWx0ID0geyByZWFkb25seSBsb2NhbDogSUxvY2FsRXh0ZW5zaW9uOyByZWFkb25seSB2ZXJpZmljYXRpb25TdGF0dXM/OiBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlIH07XG5cbmNvbnN0IERFTEVURURfRk9MREVSX1BPU1RGSVggPSAnLnZzY3RtcCc7XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIEFic3RyYWN0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgaW1wbGVtZW50cyBJTmF0aXZlU2VydmVyRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1NjYW5uZXI6IEV4dGVuc2lvbnNTY2FubmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1hbmlmZXN0Q2FjaGU6IEV4dGVuc2lvbnNNYW5pZmVzdENhY2hlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNEb3dubG9hZGVyOiBFeHRlbnNpb25zRG93bmxvYWRlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGV4dHJhY3RpbmdHYWxsZXJ5RXh0ZW5zaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPEV4dHJhY3RFeHRlbnNpb25SZXN1bHQ+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgZ2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2U6IElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJRG93bmxvYWRTZXJ2aWNlIHByaXZhdGUgZG93bmxvYWRTZXJ2aWNlOiBJRG93bmxvYWRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlIGFsbG93ZWRFeHRlbnNpb25zU2VydmljZTogSUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGdhbGxlcnlTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBleHRlbnNpb25MaWZlY3ljbGUgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zTGlmZWN5Y2xlKSk7XG5cdFx0dGhpcy5leHRlbnNpb25zU2Nhbm5lciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNTY2FubmVyLCBleHRlbnNpb24gPT4gZXh0ZW5zaW9uTGlmZWN5Y2xlLnBvc3RVbmluc3RhbGwoZXh0ZW5zaW9uKSkpO1xuXHRcdHRoaXMubWFuaWZlc3RDYWNoZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFeHRlbnNpb25zTWFuaWZlc3RDYWNoZSh1c2VyRGF0YVByb2ZpbGVzU2VydmljZSwgZmlsZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgdGhpcywgdGhpcy5sb2dTZXJ2aWNlKSk7XG5cdFx0dGhpcy5leHRlbnNpb25zRG93bmxvYWRlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNEb3dubG9hZGVyKSk7XG5cblx0XHRjb25zdCBleHRlbnNpb25zV2F0Y2hlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFeHRlbnNpb25zV2F0Y2hlcih0aGlzLCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZSwgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIGV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25zV2F0Y2hlci5vbkRpZENoYW5nZUV4dGVuc2lvbnNCeUFub3RoZXJTb3VyY2UoZSA9PiB0aGlzLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uc0Zyb21Bbm90aGVyU291cmNlKGUpKSk7XG5cdFx0dGhpcy53YXRjaEZvckV4dGVuc2lvbnNOb3RJbnN0YWxsZWRCeVN5c3RlbSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdGFyZ2V0UGxhdGZvcm1Qcm9taXNlOiBQcm9taXNlPFRhcmdldFBsYXRmb3JtPiB8IHVuZGVmaW5lZDtcblx0Z2V0VGFyZ2V0UGxhdGZvcm0oKTogUHJvbWlzZTxUYXJnZXRQbGF0Zm9ybT4ge1xuXHRcdGlmICghdGhpcy5fdGFyZ2V0UGxhdGZvcm1Qcm9taXNlKSB7XG5cdFx0XHR0aGlzLl90YXJnZXRQbGF0Zm9ybVByb21pc2UgPSBjb21wdXRlVGFyZ2V0UGxhdGZvcm0odGhpcy5maWxlU2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3RhcmdldFBsYXRmb3JtUHJvbWlzZTtcblx0fVxuXG5cdGFzeW5jIHppcChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbik6IFByb21pc2U8VVJJPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSN6aXAnLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCB0aGlzLmNvbGxlY3RGaWxlcyhleHRlbnNpb24pO1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gYXdhaXQgemlwKGpvaW5QYXRoKHRoaXMuZXh0ZW5zaW9uc0Rvd25sb2FkZXIuZXh0ZW5zaW9uc0Rvd25sb2FkRGlyLCBnZW5lcmF0ZVV1aWQoKSkuZnNQYXRoLCBmaWxlcyk7XG5cdFx0cmV0dXJuIFVSSS5maWxlKGxvY2F0aW9uKTtcblx0fVxuXG5cdGFzeW5jIGdldE1hbmlmZXN0KHZzaXg6IFVSSSk6IFByb21pc2U8SUV4dGVuc2lvbk1hbmlmZXN0PiB7XG5cdFx0Y29uc3QgeyBsb2NhdGlvbiwgY2xlYW51cCB9ID0gYXdhaXQgdGhpcy5kb3dubG9hZFZzaXgodnNpeCk7XG5cdFx0Y29uc3QgemlwUGF0aCA9IHBhdGgucmVzb2x2ZShsb2NhdGlvbi5mc1BhdGgpO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgZ2V0TWFuaWZlc3QoemlwUGF0aCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGNsZWFudXAoKTtcblx0XHR9XG5cdH1cblxuXHRnZXRJbnN0YWxsZWQodHlwZT86IEV4dGVuc2lvblR5cGUsIHByb2ZpbGVMb2NhdGlvbjogVVJJID0gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsIHByb2R1Y3RWZXJzaW9uOiBJUHJvZHVjdFZlcnNpb24gPSB7IHZlcnNpb246IHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgZGF0ZTogdGhpcy5wcm9kdWN0U2VydmljZS5kYXRlIH0sIGxhbmd1YWdlPzogc3RyaW5nKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnNjYW5FeHRlbnNpb25zKHR5cGUgPz8gbnVsbCwgcHJvZmlsZUxvY2F0aW9uLCBwcm9kdWN0VmVyc2lvbiwgbGFuZ3VhZ2UpO1xuXHR9XG5cblx0c2NhbkFsbFVzZXJJbnN0YWxsZWRFeHRlbnNpb25zKCk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zU2Nhbm5lci5zY2FuQWxsVXNlckV4dGVuc2lvbnMoKTtcblx0fVxuXG5cdHNjYW5JbnN0YWxsZWRFeHRlbnNpb25BdExvY2F0aW9uKGxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbiB8IG51bGw+IHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zU2Nhbm5lci5zY2FuVXNlckV4dGVuc2lvbkF0TG9jYXRpb24obG9jYXRpb24pO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbCh2c2l4OiBVUkksIG9wdGlvbnM6IEluc3RhbGxPcHRpb25zID0ge30pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UjaW5zdGFsbCcsIHZzaXgudG9TdHJpbmcoKSk7XG5cblx0XHRjb25zdCB7IGxvY2F0aW9uLCBjbGVhbnVwIH0gPSBhd2FpdCB0aGlzLmRvd25sb2FkVnNpeCh2c2l4KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KHBhdGgucmVzb2x2ZShsb2NhdGlvbi5mc1BhdGgpKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gZ2V0R2FsbGVyeUV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSk7XG5cdFx0XHRpZiAobWFuaWZlc3QuZW5naW5lcyAmJiBtYW5pZmVzdC5lbmdpbmVzLnZzY29kZSAmJiAhaXNFbmdpbmVWYWxpZChtYW5pZmVzdC5lbmdpbmVzLnZzY29kZSwgdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRhdGUpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2luY29tcGF0aWJsZScsIFwiVW5hYmxlIHRvIGluc3RhbGwgZXh0ZW5zaW9uICd7MH0nIGFzIGl0IGlzIG5vdCBjb21wYXRpYmxlIHdpdGggVlMgQ29kZSAnezF9Jy5cIiwgZXh0ZW5zaW9uSWQsIHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbikpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhbGxvd2VkVG9JbnN0YWxsID0gdGhpcy5hbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UuaXNBbGxvd2VkKHsgaWQ6IGV4dGVuc2lvbklkLCB2ZXJzaW9uOiBtYW5pZmVzdC52ZXJzaW9uLCBwdWJsaXNoZXJEaXNwbGF5TmFtZTogdW5kZWZpbmVkIH0pO1xuXHRcdFx0aWYgKGFsbG93ZWRUb0luc3RhbGwgIT09IHRydWUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnbm90QWxsb3dlZCcsIFwiVGhpcyBleHRlbnNpb24gY2Fubm90IGJlIGluc3RhbGxlZCBiZWNhdXNlIHswfVwiLCBhbGxvd2VkVG9JbnN0YWxsLnZhbHVlKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmluc3RhbGxFeHRlbnNpb25zKFt7IG1hbmlmZXN0LCBleHRlbnNpb246IGxvY2F0aW9uLCBvcHRpb25zIH1dKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc3VsdHMuZmluZCgoeyBpZGVudGlmaWVyIH0pID0+IGFyZVNhbWVFeHRlbnNpb25zKGlkZW50aWZpZXIsIHsgaWQ6IGV4dGVuc2lvbklkIH0pKTtcblx0XHRcdGlmIChyZXN1bHQ/LmxvY2FsKSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQubG9jYWw7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0Py5lcnJvcikge1xuXHRcdFx0XHR0aHJvdyByZXN1bHQuZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihuZXcgRXJyb3IoYFVua25vd24gZXJyb3Igd2hpbGUgaW5zdGFsbGluZyBleHRlbnNpb24gJHtleHRlbnNpb25JZH1gKSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGNsZWFudXAoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsRnJvbUxvY2F0aW9uKGxvY2F0aW9uOiBVUkksIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlI2luc3RhbGxGcm9tTG9jYXRpb24nLCBsb2NhdGlvbi50b1N0cmluZygpKTtcblx0XHRjb25zdCBsb2NhbCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuc2NhblVzZXJFeHRlbnNpb25BdExvY2F0aW9uKGxvY2F0aW9uKTtcblx0XHRpZiAoIWxvY2FsIHx8ICFsb2NhbC5tYW5pZmVzdC5uYW1lIHx8ICFsb2NhbC5tYW5pZmVzdC52ZXJzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBmaW5kIGEgdmFsaWQgZXh0ZW5zaW9uIGZyb20gdGhlIGxvY2F0aW9uICR7bG9jYXRpb24udG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5hZGRFeHRlbnNpb25zVG9Qcm9maWxlKFtbbG9jYWwsIHsgc291cmNlOiAncmVzb3VyY2UnIH1dXSwgcHJvZmlsZUxvY2F0aW9uKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnU3VjY2Vzc2Z1bGx5IGluc3RhbGxlZCBleHRlbnNpb24nLCBsb2NhbC5pZGVudGlmaWVyLmlkLCBwcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0cmV0dXJuIGxvY2FsO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbEV4dGVuc2lvbnNGcm9tUHJvZmlsZShleHRlbnNpb25zOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdLCBmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkksIHRvUHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbltdPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSNpbnN0YWxsRXh0ZW5zaW9uc0Zyb21Qcm9maWxlJywgZXh0ZW5zaW9ucywgZnJvbVByb2ZpbGVMb2NhdGlvbi50b1N0cmluZygpLCB0b1Byb2ZpbGVMb2NhdGlvbi50b1N0cmluZygpKTtcblx0XHRjb25zdCBleHRlbnNpb25zVG9JbnN0YWxsID0gKGF3YWl0IHRoaXMuZ2V0SW5zdGFsbGVkKEV4dGVuc2lvblR5cGUuVXNlciwgZnJvbVByb2ZpbGVMb2NhdGlvbikpLmZpbHRlcihlID0+IGV4dGVuc2lvbnMuc29tZShpZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpZCwgZS5pZGVudGlmaWVyKSkpO1xuXHRcdGlmIChleHRlbnNpb25zVG9JbnN0YWxsLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCBQcm9taXNlLmFsbChleHRlbnNpb25zVG9JbnN0YWxsLm1hcChlID0+IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuc2Nhbk1ldGFkYXRhKGUsIGZyb21Qcm9maWxlTG9jYXRpb24pKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmFkZEV4dGVuc2lvbnNUb1Byb2ZpbGUoZXh0ZW5zaW9uc1RvSW5zdGFsbC5tYXAoKGUsIGluZGV4KSA9PiBbZSwgbWV0YWRhdGFbaW5kZXhdXSksIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTdWNjZXNzZnVsbHkgaW5zdGFsbGVkIGV4dGVuc2lvbnMnLCBleHRlbnNpb25zVG9JbnN0YWxsLm1hcChlID0+IGUuaWRlbnRpZmllci5pZCksIHRvUHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZXh0ZW5zaW9uc1RvSW5zdGFsbDtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZU1ldGFkYXRhKGxvY2FsOiBJTG9jYWxFeHRlbnNpb24sIG1ldGFkYXRhOiBQYXJ0aWFsPE1ldGFkYXRhPiwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UjdXBkYXRlTWV0YWRhdGEnLCBsb2NhbC5pZGVudGlmaWVyLmlkKTtcblx0XHRpZiAobWV0YWRhdGEuaXNQcmVSZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0bWV0YWRhdGEucHJlUmVsZWFzZSA9IHRydWU7XG5cdFx0XHRtZXRhZGF0YS5oYXNQcmVSZWxlYXNlVmVyc2lvbiA9IHRydWU7XG5cdFx0fVxuXHRcdC8vIHVuc2V0IGlmIGZhbHNlXG5cdFx0aWYgKG1ldGFkYXRhLmlzTWFjaGluZVNjb3BlZCA9PT0gZmFsc2UpIHtcblx0XHRcdG1ldGFkYXRhLmlzTWFjaGluZVNjb3BlZCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKG1ldGFkYXRhLmlzQnVpbHRpbiA9PT0gZmFsc2UpIHtcblx0XHRcdG1ldGFkYXRhLmlzQnVpbHRpbiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKG1ldGFkYXRhLnBpbm5lZCA9PT0gZmFsc2UpIHtcblx0XHRcdG1ldGFkYXRhLnBpbm5lZCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bG9jYWwgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnVwZGF0ZU1ldGFkYXRhKGxvY2FsLCBtZXRhZGF0YSwgcHJvZmlsZUxvY2F0aW9uKTtcblx0XHR0aGlzLm1hbmlmZXN0Q2FjaGUuaW52YWxpZGF0ZShwcm9maWxlTG9jYXRpb24pO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEuZmlyZSh7IGxvY2FsLCBwcm9maWxlTG9jYXRpb24gfSk7XG5cdFx0cmV0dXJuIGxvY2FsO1xuXHR9XG5cblx0cHJvdGVjdGVkIGRlbGV0ZUV4dGVuc2lvbihleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLmRlbGV0ZUV4dGVuc2lvbihleHRlbnNpb24sICdyZW1vdmUnKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjb3B5RXh0ZW5zaW9uKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkksIHRvUHJvZmlsZUxvY2F0aW9uOiBVUkksIG1ldGFkYXRhOiBQYXJ0aWFsPE1ldGFkYXRhPik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuY29weUV4dGVuc2lvbihleHRlbnNpb24sIGZyb21Qcm9maWxlTG9jYXRpb24sIHRvUHJvZmlsZUxvY2F0aW9uLCBtZXRhZGF0YSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgbW92ZUV4dGVuc2lvbihleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJLCB0b1Byb2ZpbGVMb2NhdGlvbjogVVJJLCBtZXRhZGF0YTogUGFydGlhbDxNZXRhZGF0YT4pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLm1vdmVFeHRlbnNpb24oZXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uLCB0b1Byb2ZpbGVMb2NhdGlvbiwgbWV0YWRhdGEpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbW92ZUV4dGVuc2lvbihleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIucmVtb3ZlRXh0ZW5zaW9uKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBmcm9tUHJvZmlsZUxvY2F0aW9uKTtcblx0fVxuXG5cdGNvcHlFeHRlbnNpb25zKGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSwgdG9Qcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLmNvcHlFeHRlbnNpb25zKGZyb21Qcm9maWxlTG9jYXRpb24sIHRvUHJvZmlsZUxvY2F0aW9uLCB7IHZlcnNpb246IHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgZGF0ZTogdGhpcy5wcm9kdWN0U2VydmljZS5kYXRlIH0pO1xuXHR9XG5cblx0ZGVsZXRlRXh0ZW5zaW9ucyguLi5leHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zU2Nhbm5lci5zZXRFeHRlbnNpb25zRm9yUmVtb3ZhbCguLi5leHRlbnNpb25zKTtcblx0fVxuXG5cdGFzeW5jIGNsZWFuVXAoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSNjbGVhblVwJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuY2xlYW5VcCgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGRvd25sb2FkKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIG9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbiwgZG9ub3RWZXJpZnlTaWduYXR1cmU6IGJvb2xlYW4pOiBQcm9taXNlPFVSST4ge1xuXHRcdGNvbnN0IHsgbG9jYXRpb24gfSA9IGF3YWl0IHRoaXMuZG93bmxvYWRFeHRlbnNpb24oZXh0ZW5zaW9uLCBvcGVyYXRpb24sICFkb25vdFZlcmlmeVNpZ25hdHVyZSk7XG5cdFx0cmV0dXJuIGxvY2F0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb3dubG9hZFZzaXgodnNpeDogVVJJKTogUHJvbWlzZTx7IGxvY2F0aW9uOiBVUkk7IGNsZWFudXA6ICgpID0+IFByb21pc2U8dm9pZD4gfT4ge1xuXHRcdGlmICh2c2l4LnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRyZXR1cm4geyBsb2NhdGlvbjogdnNpeCwgYXN5bmMgY2xlYW51cCgpIHsgfSB9O1xuXHRcdH1cblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0Rvd25sb2FkaW5nIGV4dGVuc2lvbiBmcm9tJywgdnNpeC50b1N0cmluZygpKTtcblx0XHRjb25zdCBsb2NhdGlvbiA9IGpvaW5QYXRoKHRoaXMuZXh0ZW5zaW9uc0Rvd25sb2FkZXIuZXh0ZW5zaW9uc0Rvd25sb2FkRGlyLCBnZW5lcmF0ZVV1aWQoKSk7XG5cdFx0YXdhaXQgdGhpcy5kb3dubG9hZFNlcnZpY2UuZG93bmxvYWQodnNpeCwgbG9jYXRpb24sICdleHRlbnNpb25NYW5hZ2VtZW50LmRvd25sb2FkVnNpeCcpO1xuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdEb3dubG9hZGVkIGV4dGVuc2lvbiB0bycsIGxvY2F0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGNsZWFudXAgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChsb2NhdGlvbik7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0cmV0dXJuIHsgbG9jYXRpb24sIGNsZWFudXAgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRDdXJyZW50RXh0ZW5zaW9uc01hbmlmZXN0TG9jYXRpb24oKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlSW5zdGFsbEV4dGVuc2lvblRhc2sobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCwgZXh0ZW5zaW9uOiBVUkkgfCBJR2FsbGVyeUV4dGVuc2lvbiwgb3B0aW9uczogSW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zKTogSUluc3RhbGxFeHRlbnNpb25UYXNrIHtcblx0XHRjb25zdCBleHRlbnNpb25LZXkgPSBleHRlbnNpb24gaW5zdGFuY2VvZiBVUkkgPyBuZXcgRXh0ZW5zaW9uS2V5KHsgaWQ6IGdldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpIH0sIG1hbmlmZXN0LnZlcnNpb24pIDogRXh0ZW5zaW9uS2V5LmNyZWF0ZShleHRlbnNpb24pO1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxFeHRlbnNpb25JblByb2ZpbGVUYXNrLCBleHRlbnNpb25LZXksIG1hbmlmZXN0LCBleHRlbnNpb24sIG9wdGlvbnMsIChvcGVyYXRpb24sIHRva2VuKSA9PiB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmV4dHJhY3RWU0lYKGV4dGVuc2lvbktleSwgZXh0ZW5zaW9uLCBvcHRpb25zLCB0b2tlbik7XG5cdFx0XHR9XG5cdFx0XHRsZXQgcHJvbWlzZSA9IHRoaXMuZXh0cmFjdGluZ0dhbGxlcnlFeHRlbnNpb25zLmdldChleHRlbnNpb25LZXkudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoIXByb21pc2UpIHtcblx0XHRcdFx0dGhpcy5leHRyYWN0aW5nR2FsbGVyeUV4dGVuc2lvbnMuc2V0KGV4dGVuc2lvbktleS50b1N0cmluZygpLCBwcm9taXNlID0gdGhpcy5kb3dubG9hZEFuZEV4dHJhY3RHYWxsZXJ5RXh0ZW5zaW9uKGV4dGVuc2lvbktleSwgZXh0ZW5zaW9uLCBvcGVyYXRpb24sIG9wdGlvbnMsIHRva2VuKSk7XG5cdFx0XHRcdHByb21pc2UuZmluYWxseSgoKSA9PiB0aGlzLmV4dHJhY3RpbmdHYWxsZXJ5RXh0ZW5zaW9ucy5kZWxldGUoZXh0ZW5zaW9uS2V5LnRvU3RyaW5nKCkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwcm9taXNlO1xuXHRcdH0sIHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZVVuaW5zdGFsbEV4dGVuc2lvblRhc2soZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIG9wdGlvbnM6IFVuaW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zKTogSVVuaW5zdGFsbEV4dGVuc2lvblRhc2sge1xuXHRcdHJldHVybiBuZXcgVW5pbnN0YWxsRXh0ZW5zaW9uSW5Qcm9maWxlVGFzayhleHRlbnNpb24sIG9wdGlvbnMsIHRoaXMuZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvd25sb2FkQW5kRXh0cmFjdEdhbGxlcnlFeHRlbnNpb24oZXh0ZW5zaW9uS2V5OiBFeHRlbnNpb25LZXksIGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uLCBvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb24sIG9wdGlvbnM6IEluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxFeHRyYWN0RXh0ZW5zaW9uUmVzdWx0PiB7XG5cdFx0Y29uc3QgeyB2ZXJpZmljYXRpb25TdGF0dXMsIGxvY2F0aW9uIH0gPSBhd2FpdCB0aGlzLmRvd25sb2FkRXh0ZW5zaW9uKGdhbGxlcnksIG9wZXJhdGlvbiwgIW9wdGlvbnMuZG9ub3RWZXJpZnlTaWduYXR1cmUsIG9wdGlvbnMuY29udGV4dD8uW0VYVEVOU0lPTl9JTlNUQUxMX0NMSUVOVF9UQVJHRVRfUExBVEZPUk1fQ09OVEVYVF0gYXMgVGFyZ2V0UGxhdGZvcm0gfCB1bmRlZmluZWQpO1xuXHRcdHRyeSB7XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdmFsaWRhdGUgbWFuaWZlc3Rcblx0XHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QobG9jYXRpb24uZnNQYXRoKTtcblx0XHRcdGlmICghbmV3IEV4dGVuc2lvbktleShnYWxsZXJ5LmlkZW50aWZpZXIsIGdhbGxlcnkudmVyc2lvbikuZXF1YWxzKG5ldyBFeHRlbnNpb25LZXkoeyBpZDogZ2V0R2FsbGVyeUV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSkgfSwgbWFuaWZlc3QudmVyc2lvbikpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkTWFuaWZlc3QnLCBcIkNhbm5vdCBpbnN0YWxsICd7MH0nIGV4dGVuc2lvbiBiZWNhdXNlIG9mIG1hbmlmZXN0IG1pc21hdGNoIHdpdGggTWFya2V0cGxhY2VcIiwgZ2FsbGVyeS5pZGVudGlmaWVyLmlkKSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5JbnZhbGlkKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbG9jYWwgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLmV4dHJhY3RVc2VyRXh0ZW5zaW9uKFxuXHRcdFx0XHRleHRlbnNpb25LZXksXG5cdFx0XHRcdGxvY2F0aW9uLmZzUGF0aCxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdHRva2VuKTtcblxuXHRcdFx0aWYgKHZlcmlmaWNhdGlvblN0YXR1cyAhPT0gRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZS5TdWNjZXNzICYmIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNEb3dubG9hZGVyLmRlbGV0ZShsb2NhdGlvbik7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHQvKiBJZ25vcmUgKi9cblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRXJyb3Igd2hpbGUgZGVsZXRpbmcgdGhlIGRvd25sb2FkZWQgZmlsZWAsIGxvY2F0aW9uLnRvU3RyaW5nKCksIGdldEVycm9yTWVzc2FnZShlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgbG9jYWwsIHZlcmlmaWNhdGlvblN0YXR1cyB9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNEb3dubG9hZGVyLmRlbGV0ZShsb2NhdGlvbik7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8qIElnbm9yZSAqL1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRXJyb3Igd2hpbGUgZGVsZXRpbmcgdGhlIGRvd25sb2FkZWQgZmlsZWAsIGxvY2F0aW9uLnRvU3RyaW5nKCksIGdldEVycm9yTWVzc2FnZShlKSk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb3dubG9hZEV4dGVuc2lvbihleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb24sIHZlcmlmeVNpZ25hdHVyZTogYm9vbGVhbiwgY2xpZW50VGFyZ2V0UGxhdGZvcm0/OiBUYXJnZXRQbGF0Zm9ybSk6IFByb21pc2U8eyByZWFkb25seSBsb2NhdGlvbjogVVJJOyByZWFkb25seSB2ZXJpZmljYXRpb25TdGF0dXM6IEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUgfCB1bmRlZmluZWQgfT4ge1xuXHRcdGlmICh2ZXJpZnlTaWduYXR1cmUpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShWZXJpZnlFeHRlbnNpb25TaWduYXR1cmVDb25maWdLZXkpO1xuXHRcdFx0dmVyaWZ5U2lnbmF0dXJlID0gaXNCb29sZWFuKHZhbHVlKSA/IHZhbHVlIDogdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgeyBsb2NhdGlvbiwgdmVyaWZpY2F0aW9uU3RhdHVzIH0gPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNEb3dubG9hZGVyLmRvd25sb2FkKGV4dGVuc2lvbiwgb3BlcmF0aW9uLCB2ZXJpZnlTaWduYXR1cmUsIGNsaWVudFRhcmdldFBsYXRmb3JtKTtcblx0XHRjb25zdCBzaG91bGRSZXF1aXJlU2lnbmF0dXJlID0gc2hvdWxkUmVxdWlyZVJlcG9zaXRvcnlTaWduYXR1cmVGb3IoZXh0ZW5zaW9uLnByaXZhdGUsIGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5nZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QoKSk7XG5cblx0XHRpZiAoXG5cdFx0XHR2ZXJpZmljYXRpb25TdGF0dXMgIT09IEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUuU3VjY2Vzc1xuXHRcdFx0JiYgISh2ZXJpZmljYXRpb25TdGF0dXMgPT09IEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUuTm90U2lnbmVkICYmICFzaG91bGRSZXF1aXJlU2lnbmF0dXJlKVxuXHRcdFx0JiYgdmVyaWZ5U2lnbmF0dXJlXG5cdFx0XHQmJiB0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0J1aWx0XG5cdFx0XHQmJiAoYXdhaXQgdGhpcy5nZXRUYXJnZXRQbGF0Zm9ybSgpKSAhPT0gVGFyZ2V0UGxhdGZvcm0uTElOVVhfQVJNSEZcblx0XHQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc0Rvd25sb2FkZXIuZGVsZXRlKGxvY2F0aW9uKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0LyogSWdub3JlICovXG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBFcnJvciB3aGlsZSBkZWxldGluZyB0aGUgZG93bmxvYWRlZCBmaWxlYCwgbG9jYXRpb24udG9TdHJpbmcoKSwgZ2V0RXJyb3JNZXNzYWdlKGUpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF2ZXJpZmljYXRpb25TdGF0dXMpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihubHMubG9jYWxpemUoJ3NpZ25hdHVyZSB2ZXJpZmljYXRpb24gbm90IGV4ZWN1dGVkJywgXCJTaWduYXR1cmUgdmVyaWZpY2F0aW9uIHdhcyBub3QgZXhlY3V0ZWQuXCIpLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlNpZ25hdHVyZVZlcmlmaWNhdGlvbkludGVybmFsKTtcblx0XHRcdH1cblxuXHRcdFx0c3dpdGNoICh2ZXJpZmljYXRpb25TdGF0dXMpIHtcblx0XHRcdFx0Y2FzZSBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlLlBhY2thZ2VJbnRlZ3JpdHlDaGVja0ZhaWxlZDpcblx0XHRcdFx0Y2FzZSBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlLlNpZ25hdHVyZUlzSW52YWxpZDpcblx0XHRcdFx0Y2FzZSBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlLlNpZ25hdHVyZU1hbmlmZXN0SXNJbnZhbGlkOlxuXHRcdFx0XHRjYXNlIEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUuU2lnbmF0dXJlSW50ZWdyaXR5Q2hlY2tGYWlsZWQ6XG5cdFx0XHRcdGNhc2UgRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZS5FbnRyeUlzTWlzc2luZzpcblx0XHRcdFx0Y2FzZSBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlLkVudHJ5SXNUYW1wZXJlZDpcblx0XHRcdFx0Y2FzZSBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlLlVudHJ1c3RlZDpcblx0XHRcdFx0Y2FzZSBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlLkNlcnRpZmljYXRlUmV2b2tlZDpcblx0XHRcdFx0Y2FzZSBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlLlNpZ25hdHVyZUlzTm90VmFsaWQ6XG5cdFx0XHRcdGNhc2UgRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZS5TaWduYXR1cmVBcmNoaXZlSGFzVG9vTWFueUVudHJpZXM6XG5cdFx0XHRcdGNhc2UgRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZS5Ob3RTaWduZWQ6XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihubHMubG9jYWxpemUoJ3NpZ25hdHVyZSB2ZXJpZmljYXRpb24gZmFpbGVkJywgXCJTaWduYXR1cmUgdmVyaWZpY2F0aW9uIGZhaWxlZCB3aXRoICd7MH0nIGVycm9yLlwiLCB2ZXJpZmljYXRpb25TdGF0dXMpLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlNpZ25hdHVyZVZlcmlmaWNhdGlvbkZhaWxlZCk7XG5cdFx0XHR9XG5cblx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmxzLmxvY2FsaXplKCdzaWduYXR1cmUgdmVyaWZpY2F0aW9uIGZhaWxlZCcsIFwiU2lnbmF0dXJlIHZlcmlmaWNhdGlvbiBmYWlsZWQgd2l0aCAnezB9JyBlcnJvci5cIiwgdmVyaWZpY2F0aW9uU3RhdHVzKSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5TaWduYXR1cmVWZXJpZmljYXRpb25JbnRlcm5hbCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgbG9jYXRpb24sIHZlcmlmaWNhdGlvblN0YXR1cyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBleHRyYWN0VlNJWChleHRlbnNpb25LZXk6IEV4dGVuc2lvbktleSwgbG9jYXRpb246IFVSSSwgb3B0aW9uczogSW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEV4dHJhY3RFeHRlbnNpb25SZXN1bHQ+IHtcblx0XHRjb25zdCBsb2NhbCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuZXh0cmFjdFVzZXJFeHRlbnNpb24oXG5cdFx0XHRleHRlbnNpb25LZXksXG5cdFx0XHRwYXRoLnJlc29sdmUobG9jYXRpb24uZnNQYXRoKSxcblx0XHRcdGlzQm9vbGVhbihvcHRpb25zLmtlZXBFeGlzdGluZykgPyAhb3B0aW9ucy5rZWVwRXhpc3RpbmcgOiB0cnVlLFxuXHRcdFx0dG9rZW4pO1xuXHRcdHJldHVybiB7IGxvY2FsIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbGxlY3RGaWxlcyhleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbik6IFByb21pc2U8SUZpbGVbXT4ge1xuXG5cdFx0Y29uc3QgY29sbGVjdEZpbGVzRnJvbURpcmVjdG9yeSA9IGFzeW5jIChkaXI6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+ID0+IHtcblx0XHRcdGxldCBlbnRyaWVzID0gYXdhaXQgcGZzLlByb21pc2VzLnJlYWRkaXIoZGlyKTtcblx0XHRcdGVudHJpZXMgPSBlbnRyaWVzLm1hcChlID0+IHBhdGguam9pbihkaXIsIGUpKTtcblx0XHRcdGNvbnN0IHN0YXRzID0gYXdhaXQgUHJvbWlzZS5hbGwoZW50cmllcy5tYXAoZSA9PiBmcy5wcm9taXNlcy5zdGF0KGUpKSk7XG5cdFx0XHRsZXQgcHJvbWlzZTogUHJvbWlzZTxzdHJpbmdbXT4gPSBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdFx0c3RhdHMuZm9yRWFjaCgoc3RhdCwgaW5kZXgpID0+IHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBlbnRyaWVzW2luZGV4XTtcblx0XHRcdFx0aWYgKHN0YXQuaXNGaWxlKCkpIHtcblx0XHRcdFx0XHRwcm9taXNlID0gcHJvbWlzZS50aGVuKHJlc3VsdCA9PiAoWy4uLnJlc3VsdCwgZW50cnldKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHN0YXQuaXNEaXJlY3RvcnkoKSkge1xuXHRcdFx0XHRcdHByb21pc2UgPSBwcm9taXNlXG5cdFx0XHRcdFx0XHQudGhlbihyZXN1bHQgPT4gY29sbGVjdEZpbGVzRnJvbURpcmVjdG9yeShlbnRyeSlcblx0XHRcdFx0XHRcdFx0LnRoZW4oZmlsZXMgPT4gKFsuLi5yZXN1bHQsIC4uLmZpbGVzXSkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gcHJvbWlzZTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCBjb2xsZWN0RmlsZXNGcm9tRGlyZWN0b3J5KGV4dGVuc2lvbi5sb2NhdGlvbi5mc1BhdGgpO1xuXHRcdHJldHVybiBmaWxlcy5tYXAoZiA9PiAoeyBwYXRoOiBgZXh0ZW5zaW9uLyR7cGF0aC5yZWxhdGl2ZShleHRlbnNpb24ubG9jYXRpb24uZnNQYXRoLCBmKX1gLCBsb2NhbFBhdGg6IGYgfSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZENoYW5nZUV4dGVuc2lvbnNGcm9tQW5vdGhlclNvdXJjZSh7IGFkZGVkLCByZW1vdmVkIH06IERpZENoYW5nZVByb2ZpbGVFeHRlbnNpb25zRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAocmVtb3ZlZCkge1xuXHRcdFx0Y29uc3QgcmVtb3ZlZEV4dGVuc2lvbnMgPSBhZGRlZCAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChyZW1vdmVkLnByb2ZpbGVMb2NhdGlvbiwgYWRkZWQucHJvZmlsZUxvY2F0aW9uKVxuXHRcdFx0XHQ/IHJlbW92ZWQuZXh0ZW5zaW9ucy5maWx0ZXIoZSA9PiBhZGRlZC5leHRlbnNpb25zLmV2ZXJ5KGlkZW50aWZpZXIgPT4gIWFyZVNhbWVFeHRlbnNpb25zKGlkZW50aWZpZXIsIGUpKSlcblx0XHRcdFx0OiByZW1vdmVkLmV4dGVuc2lvbnM7XG5cdFx0XHRmb3IgKGNvbnN0IGlkZW50aWZpZXIgb2YgcmVtb3ZlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0V4dGVuc2lvbnMgcmVtb3ZlZCBmcm9tIGFub3RoZXIgc291cmNlJywgaWRlbnRpZmllci5pZCwgcmVtb3ZlZC5wcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uLmZpcmUoeyBpZGVudGlmaWVyLCBwcm9maWxlTG9jYXRpb246IHJlbW92ZWQucHJvZmlsZUxvY2F0aW9uIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoYWRkZWQpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIsIGFkZGVkLnByb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHRjb25zdCBhZGRlZEV4dGVuc2lvbnMgPSBleHRlbnNpb25zLmZpbHRlcihlID0+IGFkZGVkLmV4dGVuc2lvbnMuc29tZShpZGVudGlmaWVyID0+IGFyZVNhbWVFeHRlbnNpb25zKGlkZW50aWZpZXIsIGUuaWRlbnRpZmllcikpKTtcblx0XHRcdHRoaXMuX29uRGlkSW5zdGFsbEV4dGVuc2lvbnMuZmlyZShhZGRlZEV4dGVuc2lvbnMubWFwKGxvY2FsID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0V4dGVuc2lvbnMgYWRkZWQgZnJvbSBhbm90aGVyIHNvdXJjZScsIGxvY2FsLmlkZW50aWZpZXIuaWQsIGFkZGVkLnByb2ZpbGVMb2NhdGlvbi50b1N0cmluZygpKTtcblx0XHRcdFx0cmV0dXJuIHsgaWRlbnRpZmllcjogbG9jYWwuaWRlbnRpZmllciwgbG9jYWwsIHByb2ZpbGVMb2NhdGlvbjogYWRkZWQucHJvZmlsZUxvY2F0aW9uLCBvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb24uTm9uZSB9O1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkga25vd25EaXJlY3RvcmllcyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRwcml2YXRlIGFzeW5jIHdhdGNoRm9yRXh0ZW5zaW9uc05vdEluc3RhbGxlZEJ5U3lzdGVtKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIub25FeHRyYWN0KHJlc291cmNlID0+IHRoaXMua25vd25EaXJlY3Rvcmllcy5hZGQocmVzb3VyY2UpKSk7XG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZSh0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS51c2VyRXh0ZW5zaW9uc0xvY2F0aW9uKTtcblx0XHRmb3IgKGNvbnN0IGNoaWxkU3RhdCBvZiBzdGF0LmNoaWxkcmVuID8/IFtdKSB7XG5cdFx0XHRpZiAoY2hpbGRTdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdHRoaXMua25vd25EaXJlY3Rvcmllcy5hZGQoY2hpbGRTdGF0LnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS53YXRjaCh0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS51c2VyRXh0ZW5zaW9uc0xvY2F0aW9uKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4gdGhpcy5vbkRpZEZpbGVzQ2hhbmdlKGUpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkRmlsZXNDaGFuZ2UoZTogRmlsZUNoYW5nZXNFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghZS5hZmZlY3RzKHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnVzZXJFeHRlbnNpb25zTG9jYXRpb24sIEZpbGVDaGFuZ2VUeXBlLkFEREVEKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFkZGVkOiBJTG9jYWxFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgZS5yYXdBZGRlZCkge1xuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyBhIGtub3duIGRpcmVjdG9yeVxuXHRcdFx0aWYgKHRoaXMua25vd25EaXJlY3Rvcmllcy5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJcyBub3QgaW1tZWRpYXRlIGNoaWxkIG9mIGV4dGVuc2lvbnMgcmVzb3VyY2Vcblx0XHRcdGlmICghdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmRpcm5hbWUocmVzb3VyY2UpLCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS51c2VyRXh0ZW5zaW9uc0xvY2F0aW9uKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gLm9ic29sZXRlIGZpbGUgY2hhbmdlZFxuXHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHJlc291cmNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgodGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2UudXNlckV4dGVuc2lvbnNMb2NhdGlvbiwgJy5vYnNvbGV0ZScpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWdub3JlIGNoYW5nZXMgdG8gZmlsZXMgc3RhcnRpbmcgd2l0aCBgLmBcblx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpLnN0YXJ0c1dpdGgoJy4nKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWdub3JlIGNoYW5nZXMgdG8gdGhlIGRlbGV0ZWQgZm9sZGVyXG5cdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKS5lbmRzV2l0aChERUxFVEVEX0ZPTERFUl9QT1NURklYKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyBhIGRpcmVjdG9yeVxuXHRcdFx0XHRpZiAoIShhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQocmVzb3VyY2UpKS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGlmIHRoaXMgaXMgYW4gZXh0ZW5zaW9uIGFkZGVkIGJ5IGFub3RoZXIgc291cmNlXG5cdFx0XHQvLyBFeHRlbnNpb24gYWRkZWQgYnkgYW5vdGhlciBzb3VyY2Ugd2lsbCBub3QgaGF2ZSBpbnN0YWxsZWQgdGltZXN0YW1wXG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnNjYW5Vc2VyRXh0ZW5zaW9uQXRMb2NhdGlvbihyZXNvdXJjZSk7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uICYmIGV4dGVuc2lvbi5pbnN0YWxsZWRUaW1lc3RhbXAgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLmtub3duRGlyZWN0b3JpZXMuYWRkKHJlc291cmNlKTtcblx0XHRcdFx0YWRkZWQucHVzaChleHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChhZGRlZC5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IHRoaXMuYWRkRXh0ZW5zaW9uc1RvUHJvZmlsZShhZGRlZC5tYXAoZSA9PiBbZSwgdW5kZWZpbmVkXSksIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdBZGRlZCBleHRlbnNpb25zIHRvIGRlZmF1bHQgcHJvZmlsZSBmcm9tIGV4dGVybmFsIHNvdXJjZScsIGFkZGVkLm1hcChlID0+IGUuaWRlbnRpZmllci5pZCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYWRkRXh0ZW5zaW9uc1RvUHJvZmlsZShleHRlbnNpb25zOiBbSUxvY2FsRXh0ZW5zaW9uLCBNZXRhZGF0YSB8IHVuZGVmaW5lZF1bXSwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBleHRlbnNpb25zLm1hcChlID0+IGVbMF0pO1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIudW5zZXRFeHRlbnNpb25zRm9yUmVtb3ZhbCguLi5sb2NhbEV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiBFeHRlbnNpb25LZXkuY3JlYXRlKGV4dGVuc2lvbikpKTtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UuYWRkRXh0ZW5zaW9uc1RvUHJvZmlsZShleHRlbnNpb25zLCBwcm9maWxlTG9jYXRpb24pO1xuXHRcdHRoaXMuX29uRGlkSW5zdGFsbEV4dGVuc2lvbnMuZmlyZShsb2NhbEV4dGVuc2lvbnMubWFwKGxvY2FsID0+ICh7IGxvY2FsLCBpZGVudGlmaWVyOiBsb2NhbC5pZGVudGlmaWVyLCBvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb24uTm9uZSwgcHJvZmlsZUxvY2F0aW9uIH0pKSk7XG5cdH1cbn1cblxudHlwZSBVcGRhdGVNZXRhZGF0YUVycm9yQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnc2FuZHkwODEnO1xuXHRjb21tZW50OiAnVXBkYXRlIG1ldGFkYXRhIGVycm9yJztcblx0ZXh0ZW5zaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdleHRlbnNpb24gaWRlbnRpZmllcicgfTtcblx0Y29kZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdlcnJvciBjb2RlJyB9O1xuXHRpc1Byb2ZpbGU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSXMgd3JpdGluZyBpbnRvIHByb2ZpbGUnIH07XG59O1xudHlwZSBVcGRhdGVNZXRhZGF0YUVycm9yRXZlbnQgPSB7XG5cdGV4dGVuc2lvbklkOiBzdHJpbmc7XG5cdGNvZGU/OiBzdHJpbmc7XG5cdGlzUHJvZmlsZT86IGJvb2xlYW47XG59O1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uc1NjYW5uZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG9ic29sZXRlZFJlc291cmNlOiBVUkk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb2Jzb2xldGVGaWxlTGltaXRlcjogUXVldWU8SVN0cmluZ0RpY3Rpb25hcnk8Ym9vbGVhbj4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRXh0cmFjdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVSST4oKSk7XG5cdHJlYWRvbmx5IG9uRXh0cmFjdCA9IHRoaXMuX29uRXh0cmFjdC5ldmVudDtcblxuXHRwcml2YXRlIHNjYW5BbGxFeHRlbnNpb25Qcm9taXNlID0gbmV3IFJlc291cmNlTWFwPFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT4+KCk7XG5cdHByaXZhdGUgc2NhblVzZXJFeHRlbnNpb25zUHJvbWlzZSA9IG5ldyBSZXNvdXJjZU1hcDxQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYmVmb3JlUmVtb3ZpbmdFeHRlbnNpb246IChlOiBJTG9jYWxFeHRlbnNpb24pID0+IFByb21pc2U8dm9pZD4sXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zU2Nhbm5lclNlcnZpY2U6IElFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZTogSUV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5vYnNvbGV0ZWRSZXNvdXJjZSA9IGpvaW5QYXRoKHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnVzZXJFeHRlbnNpb25zTG9jYXRpb24sICcub2Jzb2xldGUnKTtcblx0XHR0aGlzLm9ic29sZXRlRmlsZUxpbWl0ZXIgPSBuZXcgUXVldWUoKTtcblx0fVxuXG5cdGFzeW5jIGNsZWFuVXAoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5yZW1vdmVUZW1wb3JhcmlseURlbGV0ZWRGb2xkZXJzKCk7XG5cdFx0YXdhaXQgdGhpcy5yZW1vdmVTdGFsZUF1dG9VcGRhdGVCdWlsdGluRXh0ZW5zaW9ucygpO1xuXHRcdGF3YWl0IHRoaXMuZGVsZXRlRXh0ZW5zaW9uc01hcmtlZEZvclJlbW92YWwoKTtcblx0XHQvL1RPRE86IFJlbW92ZSB0aGlzIGluaXRpaWFsaXphdGlvbiBhZnRlciBjb3VwZSBvZiByZWxlYXNlc1xuXHRcdGF3YWl0IHRoaXMuaW5pdGlhbGl6ZUV4dGVuc2lvblNpemUoKTtcblx0fVxuXG5cdGFzeW5jIHNjYW5FeHRlbnNpb25zKHR5cGU6IEV4dGVuc2lvblR5cGUgfCBudWxsLCBwcm9maWxlTG9jYXRpb246IFVSSSwgcHJvZHVjdFZlcnNpb246IElQcm9kdWN0VmVyc2lvbiwgbGFuZ3VhZ2U/OiBzdHJpbmcpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbltdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNhY2hlS2V5OiBVUkkgPSBwcm9maWxlTG9jYXRpb24ud2l0aCh7IHF1ZXJ5OiBsYW5ndWFnZSB9KTtcblx0XHRcdGNvbnN0IHVzZXJTY2FuT3B0aW9uczogVXNlckV4dGVuc2lvbnNTY2FuT3B0aW9ucyA9IHsgaW5jbHVkZUludmFsaWQ6IHRydWUsIHByb2ZpbGVMb2NhdGlvbiwgcHJvZHVjdFZlcnNpb24sIGxhbmd1YWdlIH07XG5cdFx0XHRsZXQgc2Nhbm5lZEV4dGVuc2lvbnM6IElTY2FubmVkRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdGlmICh0eXBlID09PSBudWxsIHx8IHR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtKSB7XG5cdFx0XHRcdGxldCBzY2FuQWxsRXh0ZW5zaW9uc1Byb21pc2UgPSB0aGlzLnNjYW5BbGxFeHRlbnNpb25Qcm9taXNlLmdldChjYWNoZUtleSk7XG5cdFx0XHRcdGlmICghc2NhbkFsbEV4dGVuc2lvbnNQcm9taXNlKSB7XG5cdFx0XHRcdFx0c2NhbkFsbEV4dGVuc2lvbnNQcm9taXNlID0gdGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhbkFsbEV4dGVuc2lvbnMoeyBsYW5ndWFnZSB9LCB1c2VyU2Nhbk9wdGlvbnMpXG5cdFx0XHRcdFx0XHQuZmluYWxseSgoKSA9PiB0aGlzLnNjYW5BbGxFeHRlbnNpb25Qcm9taXNlLmRlbGV0ZShjYWNoZUtleSkpO1xuXHRcdFx0XHRcdHRoaXMuc2NhbkFsbEV4dGVuc2lvblByb21pc2Uuc2V0KGNhY2hlS2V5LCBzY2FuQWxsRXh0ZW5zaW9uc1Byb21pc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNjYW5uZWRFeHRlbnNpb25zLnB1c2goLi4uYXdhaXQgc2NhbkFsbEV4dGVuc2lvbnNQcm9taXNlKTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5Vc2VyKSB7XG5cdFx0XHRcdGxldCBzY2FuVXNlckV4dGVuc2lvbnNQcm9taXNlID0gdGhpcy5zY2FuVXNlckV4dGVuc2lvbnNQcm9taXNlLmdldChjYWNoZUtleSk7XG5cdFx0XHRcdGlmICghc2NhblVzZXJFeHRlbnNpb25zUHJvbWlzZSkge1xuXHRcdFx0XHRcdHNjYW5Vc2VyRXh0ZW5zaW9uc1Byb21pc2UgPSB0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuVXNlckV4dGVuc2lvbnModXNlclNjYW5PcHRpb25zKVxuXHRcdFx0XHRcdFx0LmZpbmFsbHkoKCkgPT4gdGhpcy5zY2FuVXNlckV4dGVuc2lvbnNQcm9taXNlLmRlbGV0ZShjYWNoZUtleSkpO1xuXHRcdFx0XHRcdHRoaXMuc2NhblVzZXJFeHRlbnNpb25zUHJvbWlzZS5zZXQoY2FjaGVLZXksIHNjYW5Vc2VyRXh0ZW5zaW9uc1Byb21pc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNjYW5uZWRFeHRlbnNpb25zLnB1c2goLi4uYXdhaXQgc2NhblVzZXJFeHRlbnNpb25zUHJvbWlzZSk7XG5cdFx0XHR9XG5cdFx0XHRzY2FubmVkRXh0ZW5zaW9ucyA9IHR5cGUgIT09IG51bGwgPyBzY2FubmVkRXh0ZW5zaW9ucy5maWx0ZXIociA9PiByLnR5cGUgPT09IHR5cGUpIDogc2Nhbm5lZEV4dGVuc2lvbnM7XG5cdFx0XHRyZXR1cm4gYXdhaXQgUHJvbWlzZS5hbGwoc2Nhbm5lZEV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiB0aGlzLnRvTG9jYWxFeHRlbnNpb24oZXh0ZW5zaW9uKSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihlcnJvciwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5TY2FubmluZyk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2NhbkFsbFVzZXJFeHRlbnNpb25zKCk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uW10+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Nhbm5lZEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuQWxsVXNlckV4dGVuc2lvbnMoKTtcblx0XHRcdHJldHVybiBhd2FpdCBQcm9taXNlLmFsbChzY2FubmVkRXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IHRoaXMudG9Mb2NhbEV4dGVuc2lvbihleHRlbnNpb24pKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGVycm9yLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlNjYW5uaW5nKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzY2FuVXNlckV4dGVuc2lvbkF0TG9jYXRpb24obG9jYXRpb246IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uIHwgbnVsbD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzY2FubmVkRXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhbkV4aXN0aW5nRXh0ZW5zaW9uKGxvY2F0aW9uLCBFeHRlbnNpb25UeXBlLlVzZXIsIHsgaW5jbHVkZUludmFsaWQ6IHRydWUgfSk7XG5cdFx0XHRpZiAoc2Nhbm5lZEV4dGVuc2lvbikge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy50b0xvY2FsRXh0ZW5zaW9uKHNjYW5uZWRFeHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGFzeW5jIGV4dHJhY3RVc2VyRXh0ZW5zaW9uKGV4dGVuc2lvbktleTogRXh0ZW5zaW9uS2V5LCB6aXBQYXRoOiBzdHJpbmcsIHJlbW92ZUlmRXhpc3RzOiBib29sZWFuLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IGZvbGRlck5hbWUgPSBleHRlbnNpb25LZXkudG9TdHJpbmcoKTtcblx0XHRjb25zdCB0ZW1wTG9jYXRpb24gPSBVUkkuZmlsZShwYXRoLmpvaW4odGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2UudXNlckV4dGVuc2lvbnNMb2NhdGlvbi5mc1BhdGgsIGAuJHtnZW5lcmF0ZVV1aWQoKX1gKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uTG9jYXRpb24gPSBVUkkuZmlsZShwYXRoLmpvaW4odGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2UudXNlckV4dGVuc2lvbnNMb2NhdGlvbi5mc1BhdGgsIGZvbGRlck5hbWUpKTtcblxuXHRcdGlmIChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhleHRlbnNpb25Mb2NhdGlvbikpIHtcblx0XHRcdGlmICghcmVtb3ZlSWZFeGlzdHMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5zY2FuTG9jYWxFeHRlbnNpb24oZXh0ZW5zaW9uTG9jYXRpb24sIEV4dGVuc2lvblR5cGUuVXNlcik7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEVycm9yIHdoaWxlIHNjYW5uaW5nIHRoZSBleGlzdGluZyBleHRlbnNpb24gYXQgJHtleHRlbnNpb25Mb2NhdGlvbi5wYXRofS4gRGVsZXRpbmcgdGhlIGV4aXN0aW5nIGV4dGVuc2lvbiBhbmQgZXh0cmFjdGluZyBpdC5gLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRlbGV0ZUV4dGVuc2lvbkZyb21Mb2NhdGlvbihleHRlbnNpb25LZXkuaWQsIGV4dGVuc2lvbkxvY2F0aW9uLCAncmVtb3ZlRXhpc3RpbmcnKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmxzLmxvY2FsaXplKCdlcnJvckRlbGV0aW5nJywgXCJVbmFibGUgdG8gZGVsZXRlIHRoZSBleGlzdGluZyBmb2xkZXIgJ3swfScgd2hpbGUgaW5zdGFsbGluZyB0aGUgZXh0ZW5zaW9uICd7MX0nLiBQbGVhc2UgZGVsZXRlIHRoZSBmb2xkZXIgbWFudWFsbHkgYW5kIHRyeSBhZ2FpblwiLCBleHRlbnNpb25Mb2NhdGlvbi5mc1BhdGgsIGV4dGVuc2lvbktleS5pZCksIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuRGVsZXRlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFeHRyYWN0XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFN0YXJ0ZWQgZXh0cmFjdGluZyB0aGUgZXh0ZW5zaW9uIGZyb20gJHt6aXBQYXRofSB0byAke2V4dGVuc2lvbkxvY2F0aW9uLmZzUGF0aH1gKTtcblx0XHRcdFx0YXdhaXQgZXh0cmFjdCh6aXBQYXRoLCB0ZW1wTG9jYXRpb24uZnNQYXRoLCB7IHNvdXJjZVBhdGg6ICdleHRlbnNpb24nLCBvdmVyd3JpdGU6IHRydWUgfSwgdG9rZW4pO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgRXh0cmFjdGVkIGV4dGVuc2lvbiB0byAke2V4dGVuc2lvbkxvY2F0aW9ufTpgLCBleHRlbnNpb25LZXkuaWQpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aHJvdyBmcm9tRXh0cmFjdEVycm9yKGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtZXRhZGF0YTogTWFuaWZlc3RNZXRhZGF0YSA9IHsgaW5zdGFsbGVkVGltZXN0YW1wOiBEYXRlLm5vdygpLCB0YXJnZXRQbGF0Zm9ybTogZXh0ZW5zaW9uS2V5LnRhcmdldFBsYXRmb3JtIH07XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRtZXRhZGF0YS5zaXplID0gYXdhaXQgY29tcHV0ZVNpemUodGVtcExvY2F0aW9uLCB0aGlzLmZpbGVTZXJ2aWNlKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8vIExvZyAmIGlnbm9yZVxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRXJyb3Igd2hpbGUgZ2V0dGluZyB0aGUgc2l6ZSBvZiB0aGUgZXh0cmFjdGVkIGV4dGVuc2lvbiA6ICR7dGVtcExvY2F0aW9uLmZzUGF0aH1gLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2UudXBkYXRlTWFuaWZlc3RNZXRhZGF0YSh0ZW1wTG9jYXRpb24sIG1ldGFkYXRhKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFVwZGF0ZU1ldGFkYXRhRXJyb3JFdmVudCwgVXBkYXRlTWV0YWRhdGFFcnJvckNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uOmV4dHJhY3QnLCB7IGV4dGVuc2lvbklkOiBleHRlbnNpb25LZXkuaWQsIGNvZGU6IGAke3RvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcil9YCB9KTtcblx0XHRcdFx0dGhyb3cgdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoZXJyb3IsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuVXBkYXRlTWV0YWRhdGEpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlbmFtZVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBTdGFydGVkIHJlbmFtaW5nIHRoZSBleHRlbnNpb24gZnJvbSAke3RlbXBMb2NhdGlvbi5mc1BhdGh9IHRvICR7ZXh0ZW5zaW9uTG9jYXRpb24uZnNQYXRofWApO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnJlbmFtZSh0ZW1wTG9jYXRpb24uZnNQYXRoLCBleHRlbnNpb25Mb2NhdGlvbi5mc1BhdGgpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnUmVuYW1lZCB0bycsIGV4dGVuc2lvbkxvY2F0aW9uLmZzUGF0aCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAoZXJyb3IuY29kZSA9PT0gJ0VOT1RFTVBUWScpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgUmVuYW1lIGZhaWxlZCBiZWNhdXNlIGV4dGVuc2lvbiB3YXMgaW5zdGFsbGVkIGJ5IGFub3RoZXIgc291cmNlLiBTbyBpZ25vcmluZyByZW5hbWluZy5gLCBleHRlbnNpb25LZXkuaWQpO1xuXHRcdFx0XHRcdHRyeSB7IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHRlbXBMb2NhdGlvbiwgeyByZWN1cnNpdmU6IHRydWUgfSk7IH0gY2F0Y2ggKGUpIHsgLyogaWdub3JlICovIH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgUmVuYW1lIGZhaWxlZCBiZWNhdXNlIG9mICR7Z2V0RXJyb3JNZXNzYWdlKGVycm9yKX0uIERlbGV0ZWQgZnJvbSBleHRyYWN0ZWQgbG9jYXRpb25gLCB0ZW1wTG9jYXRpb24pO1xuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX29uRXh0cmFjdC5maXJlKGV4dGVuc2lvbkxvY2F0aW9uKTtcblxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0cnkgeyBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbCh0ZW1wTG9jYXRpb24sIHsgcmVjdXJzaXZlOiB0cnVlIH0pOyB9IGNhdGNoIChlKSB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5zY2FuTG9jYWxFeHRlbnNpb24oZXh0ZW5zaW9uTG9jYXRpb24sIEV4dGVuc2lvblR5cGUuVXNlcik7XG5cdH1cblxuXHRhc3luYyBzY2FuTWV0YWRhdGEobG9jYWw6IElMb2NhbEV4dGVuc2lvbiwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPE1ldGFkYXRhIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5nZXRTY2FubmVkRXh0ZW5zaW9uKGxvY2FsLCBwcm9maWxlTG9jYXRpb24pO1xuXHRcdHJldHVybiBleHRlbnNpb24/Lm1ldGFkYXRhO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTY2FubmVkRXh0ZW5zaW9uKGxvY2FsOiBJTG9jYWxFeHRlbnNpb24sIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLnNjYW5Qcm9maWxlRXh0ZW5zaW9ucyhwcm9maWxlTG9jYXRpb24pO1xuXHRcdHJldHVybiBleHRlbnNpb25zLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGxvY2FsLmlkZW50aWZpZXIpKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZU1ldGFkYXRhKGxvY2FsOiBJTG9jYWxFeHRlbnNpb24sIG1ldGFkYXRhOiBQYXJ0aWFsPE1ldGFkYXRhPiwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UudXBkYXRlTWV0YWRhdGEoW1tsb2NhbCwgbWV0YWRhdGFdXSwgcHJvZmlsZUxvY2F0aW9uKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8VXBkYXRlTWV0YWRhdGFFcnJvckV2ZW50LCBVcGRhdGVNZXRhZGF0YUVycm9yQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb246ZXh0cmFjdCcsIHsgZXh0ZW5zaW9uSWQ6IGxvY2FsLmlkZW50aWZpZXIuaWQsIGNvZGU6IGAke3RvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcil9YCwgaXNQcm9maWxlOiAhIXByb2ZpbGVMb2NhdGlvbiB9KTtcblx0XHRcdHRocm93IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGVycm9yLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlVwZGF0ZU1ldGFkYXRhKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuc2NhbkxvY2FsRXh0ZW5zaW9uKGxvY2FsLmxvY2F0aW9uLCBsb2NhbC50eXBlLCBwcm9maWxlTG9jYXRpb24pO1xuXHR9XG5cblx0YXN5bmMgc2V0RXh0ZW5zaW9uc0ZvclJlbW92YWwoLi4uZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvUmVtb3ZlID0gW107XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKGV4dGVuc2lvbi5sb2NhdGlvbikpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uc1RvUmVtb3ZlLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgZXh0ZW5zaW9uS2V5czogRXh0ZW5zaW9uS2V5W10gPSBleHRlbnNpb25zVG9SZW1vdmUubWFwKGUgPT4gRXh0ZW5zaW9uS2V5LmNyZWF0ZShlKSk7XG5cdFx0YXdhaXQgdGhpcy53aXRoUmVtb3ZlZEV4dGVuc2lvbnMocmVtb3ZlZEV4dGVuc2lvbnMgPT5cblx0XHRcdGV4dGVuc2lvbktleXMuZm9yRWFjaChleHRlbnNpb25LZXkgPT4ge1xuXHRcdFx0XHRyZW1vdmVkRXh0ZW5zaW9uc1tleHRlbnNpb25LZXkudG9TdHJpbmcoKV0gPSB0cnVlO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnTWFya2VkIGV4dGVuc2lvbiBhcyByZW1vdmVkJywgZXh0ZW5zaW9uS2V5LnRvU3RyaW5nKCkpO1xuXHRcdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgdW5zZXRFeHRlbnNpb25zRm9yUmVtb3ZhbCguLi5leHRlbnNpb25LZXlzOiBFeHRlbnNpb25LZXlbXSk6IFByb21pc2U8Ym9vbGVhbltdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdHM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdFx0YXdhaXQgdGhpcy53aXRoUmVtb3ZlZEV4dGVuc2lvbnMocmVtb3ZlZEV4dGVuc2lvbnMgPT5cblx0XHRcdFx0ZXh0ZW5zaW9uS2V5cy5mb3JFYWNoKGV4dGVuc2lvbktleSA9PiB7XG5cdFx0XHRcdFx0aWYgKHJlbW92ZWRFeHRlbnNpb25zW2V4dGVuc2lvbktleS50b1N0cmluZygpXSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0cy5wdXNoKHRydWUpO1xuXHRcdFx0XHRcdFx0ZGVsZXRlIHJlbW92ZWRFeHRlbnNpb25zW2V4dGVuc2lvbktleS50b1N0cmluZygpXTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzdWx0cy5wdXNoKGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdHJldHVybiByZXN1bHRzO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihlcnJvciwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5VbnNldFJlbW92ZWQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGRlbGV0ZUV4dGVuc2lvbihleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiB8IElTY2FubmVkRXh0ZW5zaW9uLCB0eXBlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWxPclBhcmVudChleHRlbnNpb24ubG9jYXRpb24sIHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnVzZXJFeHRlbnNpb25zTG9jYXRpb24pKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRlbGV0ZUV4dGVuc2lvbkZyb21Mb2NhdGlvbihleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uLmxvY2F0aW9uLCB0eXBlKTtcblx0XHRcdGF3YWl0IHRoaXMudW5zZXRFeHRlbnNpb25zRm9yUmVtb3ZhbChFeHRlbnNpb25LZXkuY3JlYXRlKGV4dGVuc2lvbikpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNvcHlFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSwgdG9Qcm9maWxlTG9jYXRpb246IFVSSSwgbWV0YWRhdGE6IFBhcnRpYWw8TWV0YWRhdGE+KTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCB0aGlzLmdldFNjYW5uZWRFeHRlbnNpb24oZXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCB0aGlzLmdldFNjYW5uZWRFeHRlbnNpb24oZXh0ZW5zaW9uLCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0bWV0YWRhdGEgPSB7IC4uLnNvdXJjZT8ubWV0YWRhdGEsIC4uLm1ldGFkYXRhIH07XG5cblx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodGFyZ2V0LmxvY2F0aW9uLCBleHRlbnNpb24ubG9jYXRpb24pKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS51cGRhdGVNZXRhZGF0YShbW2V4dGVuc2lvbiwgeyAuLi50YXJnZXQubWV0YWRhdGEsIC4uLm1ldGFkYXRhIH1dXSwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0RXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5zY2FuTG9jYWxFeHRlbnNpb24odGFyZ2V0LmxvY2F0aW9uLCBleHRlbnNpb24udHlwZSwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UucmVtb3ZlRXh0ZW5zaW9uc0Zyb21Qcm9maWxlKFt0YXJnZXRFeHRlbnNpb24uaWRlbnRpZmllcl0sIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLmFkZEV4dGVuc2lvbnNUb1Byb2ZpbGUoW1tleHRlbnNpb24sIHsgLi4udGFyZ2V0Lm1ldGFkYXRhLCAuLi5tZXRhZGF0YSB9XV0sIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLmFkZEV4dGVuc2lvbnNUb1Byb2ZpbGUoW1tleHRlbnNpb24sIG1ldGFkYXRhXV0sIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5zY2FuTG9jYWxFeHRlbnNpb24oZXh0ZW5zaW9uLmxvY2F0aW9uLCBleHRlbnNpb24udHlwZSwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHR9XG5cblx0YXN5bmMgbW92ZUV4dGVuc2lvbihleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJLCB0b1Byb2ZpbGVMb2NhdGlvbjogVVJJLCBtZXRhZGF0YTogUGFydGlhbDxNZXRhZGF0YT4pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IHRoaXMuZ2V0U2Nhbm5lZEV4dGVuc2lvbihleHRlbnNpb24sIGZyb21Qcm9maWxlTG9jYXRpb24pO1xuXHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IHRoaXMuZ2V0U2Nhbm5lZEV4dGVuc2lvbihleHRlbnNpb24sIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRtZXRhZGF0YSA9IHsgLi4uc291cmNlPy5tZXRhZGF0YSwgLi4ubWV0YWRhdGEgfTtcblxuXHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh0YXJnZXQubG9jYXRpb24sIGV4dGVuc2lvbi5sb2NhdGlvbikpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLnVwZGF0ZU1ldGFkYXRhKFtbZXh0ZW5zaW9uLCB7IC4uLnRhcmdldC5tZXRhZGF0YSwgLi4ubWV0YWRhdGEgfV1dLCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRFeHRlbnNpb24gPSBhd2FpdCB0aGlzLnNjYW5Mb2NhbEV4dGVuc2lvbih0YXJnZXQubG9jYXRpb24sIGV4dGVuc2lvbi50eXBlLCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVtb3ZlRXh0ZW5zaW9uKHRhcmdldEV4dGVuc2lvbi5pZGVudGlmaWVyLCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5hZGRFeHRlbnNpb25zVG9Qcm9maWxlKFtbZXh0ZW5zaW9uLCB7IC4uLnRhcmdldC5tZXRhZGF0YSwgLi4ubWV0YWRhdGEgfV1dLCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5hZGRFeHRlbnNpb25zVG9Qcm9maWxlKFtbZXh0ZW5zaW9uLCBtZXRhZGF0YV1dLCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHRpZiAoc291cmNlKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVtb3ZlRXh0ZW5zaW9uKHNvdXJjZS5pZGVudGlmaWVyLCBmcm9tUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5zY2FuTG9jYWxFeHRlbnNpb24oZXh0ZW5zaW9uLmxvY2F0aW9uLCBleHRlbnNpb24udHlwZSwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlRXh0ZW5zaW9uKGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyLCBmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UucmVtb3ZlRXh0ZW5zaW9uc0Zyb21Qcm9maWxlKFtpZGVudGlmaWVyXSwgZnJvbVByb2ZpbGVMb2NhdGlvbik7XG5cdH1cblxuXHRhc3luYyBjb3B5RXh0ZW5zaW9ucyhmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkksIHRvUHJvZmlsZUxvY2F0aW9uOiBVUkksIHByb2R1Y3RWZXJzaW9uOiBJUHJvZHVjdFZlcnNpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmcm9tRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuc2NhbkV4dGVuc2lvbnMoRXh0ZW5zaW9uVHlwZS5Vc2VyLCBmcm9tUHJvZmlsZUxvY2F0aW9uLCBwcm9kdWN0VmVyc2lvbik7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uczogW0lMb2NhbEV4dGVuc2lvbiwgTWV0YWRhdGEgfCB1bmRlZmluZWRdW10gPSBhd2FpdCBQcm9taXNlLmFsbChmcm9tRXh0ZW5zaW9uc1xuXHRcdFx0LmZpbHRlcihlID0+ICFlLmlzQXBwbGljYXRpb25TY29wZWQpIC8qIHJlbW92ZSBhcHBsaWNhdGlvbiBzY29wZWQgZXh0ZW5zaW9ucyAqL1xuXHRcdFx0Lm1hcChhc3luYyBlID0+IChbZSwgYXdhaXQgdGhpcy5zY2FuTWV0YWRhdGEoZSwgZnJvbVByb2ZpbGVMb2NhdGlvbildKSkpO1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5hZGRFeHRlbnNpb25zVG9Qcm9maWxlKGV4dGVuc2lvbnMsIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGVsZXRlRXh0ZW5zaW9uRnJvbUxvY2F0aW9uKGlkOiBzdHJpbmcsIGxvY2F0aW9uOiBVUkksIHR5cGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRGVsZXRpbmcgJHt0eXBlfSBleHRlbnNpb24gZnJvbSBkaXNrYCwgaWQsIGxvY2F0aW9uLmZzUGF0aCk7XG5cdFx0Y29uc3QgcmVuYW1lZExvY2F0aW9uID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5kaXJuYW1lKGxvY2F0aW9uKSwgYCR7dGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmJhc2VuYW1lKGxvY2F0aW9uKX0uJHtoYXNoKGdlbmVyYXRlVXVpZCgpKS50b1N0cmluZygxNil9JHtERUxFVEVEX0ZPTERFUl9QT1NURklYfWApO1xuXHRcdGF3YWl0IHRoaXMucmVuYW1lKGxvY2F0aW9uLmZzUGF0aCwgcmVuYW1lZExvY2F0aW9uLmZzUGF0aCk7XG5cdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwocmVuYW1lZExvY2F0aW9uLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgRGVsZXRlZCAke3R5cGV9IGV4dGVuc2lvbiBmcm9tIGRpc2tgLCBpZCwgbG9jYXRpb24uZnNQYXRoKTtcblx0fVxuXG5cdHByaXZhdGUgd2l0aFJlbW92ZWRFeHRlbnNpb25zKHVwZGF0ZUZuPzogKHJlbW92ZWQ6IElTdHJpbmdEaWN0aW9uYXJ5PGJvb2xlYW4+KSA9PiB2b2lkKTogUHJvbWlzZTxJU3RyaW5nRGljdGlvbmFyeTxib29sZWFuPj4ge1xuXHRcdHJldHVybiB0aGlzLm9ic29sZXRlRmlsZUxpbWl0ZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IHJhdzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodGhpcy5vYnNvbGV0ZWRSZXNvdXJjZSwgJ3V0ZjgnKTtcblx0XHRcdFx0cmF3ID0gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcmVtb3ZlZCA9IHt9O1xuXHRcdFx0aWYgKHJhdykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJlbW92ZWQgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHsgLyogaWdub3JlICovIH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHVwZGF0ZUZuKSB7XG5cdFx0XHRcdHVwZGF0ZUZuKHJlbW92ZWQpO1xuXHRcdFx0XHRpZiAoT2JqZWN0LmtleXMocmVtb3ZlZCkubGVuZ3RoKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUodGhpcy5vYnNvbGV0ZWRSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShyZW1vdmVkKSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbCh0aGlzLm9ic29sZXRlZFJlc291cmNlKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZW1vdmVkO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW5hbWUoZXh0cmFjdFBhdGg6IHN0cmluZywgcmVuYW1lUGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHBmcy5Qcm9taXNlcy5yZW5hbWUoZXh0cmFjdFBhdGgsIHJlbmFtZVBhdGgsIDIgKiA2MCAqIDEwMDAgLyogUmV0cnkgZm9yIDIgbWludXRlcyAqLyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGVycm9yLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlJlbmFtZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2NhbkxvY2FsRXh0ZW5zaW9uKGxvY2F0aW9uOiBVUkksIHR5cGU6IEV4dGVuc2lvblR5cGUsIHByb2ZpbGVMb2NhdGlvbj86IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChwcm9maWxlTG9jYXRpb24pIHtcblx0XHRcdFx0Y29uc3Qgc2Nhbm5lZEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuVXNlckV4dGVuc2lvbnMoeyBwcm9maWxlTG9jYXRpb24gfSk7XG5cdFx0XHRcdGNvbnN0IHNjYW5uZWRFeHRlbnNpb24gPSBzY2FubmVkRXh0ZW5zaW9ucy5maW5kKGUgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZS5sb2NhdGlvbiwgbG9jYXRpb24pKTtcblx0XHRcdFx0aWYgKHNjYW5uZWRFeHRlbnNpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy50b0xvY2FsRXh0ZW5zaW9uKHNjYW5uZWRFeHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBzY2FubmVkRXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhbkV4aXN0aW5nRXh0ZW5zaW9uKGxvY2F0aW9uLCB0eXBlLCB7IGluY2x1ZGVJbnZhbGlkOiB0cnVlIH0pO1xuXHRcdFx0XHRpZiAoc2Nhbm5lZEV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLnRvTG9jYWxFeHRlbnNpb24oc2Nhbm5lZEV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmxzLmxvY2FsaXplKCdjYW5ub3QgcmVhZCcsIFwiQ2Fubm90IHJlYWQgdGhlIGV4dGVuc2lvbiBmcm9tIHswfVwiLCBsb2NhdGlvbi5wYXRoKSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5TY2FubmluZ0V4dGVuc2lvbik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGVycm9yLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlNjYW5uaW5nRXh0ZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHRvTG9jYWxFeHRlbnNpb24oZXh0ZW5zaW9uOiBJU2Nhbm5lZEV4dGVuc2lvbik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0bGV0IHN0YXQ6IElGaWxlU3RhdCB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShleHRlbnNpb24ubG9jYXRpb24pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7LyogaWdub3JlICovIH1cblxuXHRcdGxldCByZWFkbWVVcmw6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY2hhbmdlbG9nVXJsOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHN0YXQ/LmNoaWxkcmVuKSB7XG5cdFx0XHRyZWFkbWVVcmwgPSBzdGF0LmNoaWxkcmVuLmZpbmQoKHsgbmFtZSB9KSA9PiAvXnJlYWRtZShcXC50eHR8XFwubWR8KSQvaS50ZXN0KG5hbWUpKT8ucmVzb3VyY2U7XG5cdFx0XHRjaGFuZ2Vsb2dVcmwgPSBzdGF0LmNoaWxkcmVuLmZpbmQoKHsgbmFtZSB9KSA9PiAvXmNoYW5nZWxvZyhcXC50eHR8XFwubWR8KSQvaS50ZXN0KG5hbWUpKT8ucmVzb3VyY2U7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRpZGVudGlmaWVyOiBleHRlbnNpb24uaWRlbnRpZmllcixcblx0XHRcdHR5cGU6IGV4dGVuc2lvbi50eXBlLFxuXHRcdFx0aXNCdWlsdGluOiBleHRlbnNpb24uaXNCdWlsdGluIHx8ICEhZXh0ZW5zaW9uLm1ldGFkYXRhPy5pc0J1aWx0aW4sXG5cdFx0XHRsb2NhdGlvbjogZXh0ZW5zaW9uLmxvY2F0aW9uLFxuXHRcdFx0bWFuaWZlc3Q6IGV4dGVuc2lvbi5tYW5pZmVzdCxcblx0XHRcdHRhcmdldFBsYXRmb3JtOiBleHRlbnNpb24udGFyZ2V0UGxhdGZvcm0sXG5cdFx0XHR2YWxpZGF0aW9uczogZXh0ZW5zaW9uLnZhbGlkYXRpb25zLFxuXHRcdFx0aXNWYWxpZDogZXh0ZW5zaW9uLmlzVmFsaWQsXG5cdFx0XHRyZWFkbWVVcmwsXG5cdFx0XHRjaGFuZ2Vsb2dVcmwsXG5cdFx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZTogZXh0ZW5zaW9uLm1ldGFkYXRhPy5wdWJsaXNoZXJEaXNwbGF5TmFtZSxcblx0XHRcdHB1Ymxpc2hlcklkOiBleHRlbnNpb24ubWV0YWRhdGE/LnB1Ymxpc2hlcklkIHx8IG51bGwsXG5cdFx0XHRpc0FwcGxpY2F0aW9uU2NvcGVkOiAhIWV4dGVuc2lvbi5tZXRhZGF0YT8uaXNBcHBsaWNhdGlvblNjb3BlZCxcblx0XHRcdGlzTWFjaGluZVNjb3BlZDogISFleHRlbnNpb24ubWV0YWRhdGE/LmlzTWFjaGluZVNjb3BlZCxcblx0XHRcdGlzUHJlUmVsZWFzZVZlcnNpb246ICEhZXh0ZW5zaW9uLm1ldGFkYXRhPy5pc1ByZVJlbGVhc2VWZXJzaW9uLFxuXHRcdFx0aGFzUHJlUmVsZWFzZVZlcnNpb246ICEhZXh0ZW5zaW9uLm1ldGFkYXRhPy5oYXNQcmVSZWxlYXNlVmVyc2lvbixcblx0XHRcdHByZVJlbGVhc2U6IGV4dGVuc2lvbi5wcmVSZWxlYXNlLFxuXHRcdFx0aW5zdGFsbGVkVGltZXN0YW1wOiBleHRlbnNpb24ubWV0YWRhdGE/Lmluc3RhbGxlZFRpbWVzdGFtcCxcblx0XHRcdHVwZGF0ZWQ6ICEhZXh0ZW5zaW9uLm1ldGFkYXRhPy51cGRhdGVkLFxuXHRcdFx0cGlubmVkOiAhIWV4dGVuc2lvbi5tZXRhZGF0YT8ucGlubmVkLFxuXHRcdFx0Zm9yY2VBdXRvVXBkYXRlOiBleHRlbnNpb24uZm9yY2VBdXRvVXBkYXRlLFxuXHRcdFx0cHJpdmF0ZTogISFleHRlbnNpb24ubWV0YWRhdGE/LnByaXZhdGUsXG5cdFx0XHRpc1dvcmtzcGFjZVNjb3BlZDogZmFsc2UsXG5cdFx0XHRzb3VyY2U6IGV4dGVuc2lvbi5tZXRhZGF0YT8uc291cmNlID8/IChleHRlbnNpb24uaWRlbnRpZmllci51dWlkID8gJ2dhbGxlcnknIDogJ3ZzaXgnKSxcblx0XHRcdHNpemU6IGV4dGVuc2lvbi5tZXRhZGF0YT8uc2l6ZSA/PyAwLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluaXRpYWxpemVFeHRlbnNpb25TaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuQWxsVXNlckV4dGVuc2lvbnMoKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChleHRlbnNpb25zLm1hcChhc3luYyBleHRlbnNpb24gPT4ge1xuXHRcdFx0Ly8gc2V0IHNpemUgaWYgbm90IHNldCBiZWZvcmVcblx0XHRcdGlmIChpc0RlZmluZWQoZXh0ZW5zaW9uLm1ldGFkYXRhPy5pbnN0YWxsZWRUaW1lc3RhbXApICYmIGlzVW5kZWZpbmVkKGV4dGVuc2lvbi5tZXRhZGF0YT8uc2l6ZSkpIHtcblx0XHRcdFx0Y29uc3Qgc2l6ZSA9IGF3YWl0IGNvbXB1dGVTaXplKGV4dGVuc2lvbi5sb2NhdGlvbiwgdGhpcy5maWxlU2VydmljZSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnVwZGF0ZU1hbmlmZXN0TWV0YWRhdGEoZXh0ZW5zaW9uLmxvY2F0aW9uLCB7IHNpemUgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW1vdmVTdGFsZUF1dG9VcGRhdGVCdWlsdGluRXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBidWlsdGluRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5TeXN0ZW1FeHRlbnNpb25zKHt9KTtcblx0XHRjb25zdCB1c2VyRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5BbGxVc2VyRXh0ZW5zaW9ucygpO1xuXHRcdGNvbnN0IHN0YWxlRXh0ZW5zaW9ucyA9IHVzZXJFeHRlbnNpb25zLmZpbHRlcih1c2VyRXh0ZW5zaW9uID0+IHtcblx0XHRcdGlmICghdGhpcy5wcm9kdWN0U2VydmljZS5idWlsdEluRXh0ZW5zaW9uc0VuYWJsZWRXaXRoQXV0b1VwZGF0ZXMuc29tZShpZCA9PiBpZC50b0xvd2VyQ2FzZSgpID09PSB1c2VyRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYnVpbHRpbkV4dGVuc2lvbiA9IGJ1aWx0aW5FeHRlbnNpb25zLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHVzZXJFeHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0cmV0dXJuIGJ1aWx0aW5FeHRlbnNpb24gJiYgc2VtdmVyLmx0KHVzZXJFeHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiwgYnVpbHRpbkV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uKTtcblx0XHR9KTtcblx0XHRpZiAoc3RhbGVFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1JlbW92aW5nIHN0YWxlIGF1dG8tdXBkYXRlIGJ1aWx0aW4gZXh0ZW5zaW9uczonLCBzdGFsZUV4dGVuc2lvbnMubWFwKGUgPT4gYCR7ZS5pZGVudGlmaWVyLmlkfUAke2UubWFuaWZlc3QudmVyc2lvbn1gKS5qb2luKCcsICcpKTtcblx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5yZW1vdmVFeHRlbnNpb25zRnJvbVByb2ZpbGUoc3RhbGVFeHRlbnNpb25zLm1hcChlID0+IGUuaWRlbnRpZmllciksIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChzdGFsZUV4dGVuc2lvbnMubWFwKGUgPT4gdGhpcy5kZWxldGVFeHRlbnNpb24oZSwgJ3N0YWxlIGF1dG8tdXBkYXRlIGJ1aWx0aW4nKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGVsZXRlRXh0ZW5zaW9uc01hcmtlZEZvclJlbW92YWwoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHJlbW92ZWQ6IElTdHJpbmdEaWN0aW9uYXJ5PGJvb2xlYW4+O1xuXHRcdHRyeSB7XG5cdFx0XHRyZW1vdmVkID0gYXdhaXQgdGhpcy53aXRoUmVtb3ZlZEV4dGVuc2lvbnMoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoZXJyb3IsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuUmVhZFJlbW92ZWQpO1xuXHRcdH1cblxuXHRcdGlmIChPYmplY3Qua2V5cyhyZW1vdmVkKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgTm8gZXh0ZW5zaW9ucyBhcmUgbWFya2VkIGFzIHJlbW92ZWQuYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBEZWxldGluZyBleHRlbnNpb25zIG1hcmtlZCBhcyByZW1vdmVkOmAsIE9iamVjdC5rZXlzKHJlbW92ZWQpKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnNjYW5BbGxVc2VyRXh0ZW5zaW9ucygpO1xuXHRcdGNvbnN0IGluc3RhbGxlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGUgb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKCFyZW1vdmVkW0V4dGVuc2lvbktleS5jcmVhdGUoZSkudG9TdHJpbmcoKV0pIHtcblx0XHRcdFx0aW5zdGFsbGVkLmFkZChlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIHJ1bm5pbmcgcG9zdCB1bmluc3RhbGwgdGFza3MgZm9yIGV4dGVuc2lvbnMgdGhhdCBhcmUgbm90IGluc3RhbGxlZCBhbnltb3JlXG5cdFx0XHRjb25zdCBieUV4dGVuc2lvbiA9IGdyb3VwQnlFeHRlbnNpb24oZXh0ZW5zaW9ucywgZSA9PiBlLmlkZW50aWZpZXIpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChieUV4dGVuc2lvbi5tYXAoYXN5bmMgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxhdGVzdCA9IGUuc29ydCgoYSwgYikgPT4gc2VtdmVyLnJjb21wYXJlKGEubWFuaWZlc3QudmVyc2lvbiwgYi5tYW5pZmVzdC52ZXJzaW9uKSlbMF07XG5cdFx0XHRcdGlmICghaW5zdGFsbGVkLmhhcyhsYXRlc3QuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuYmVmb3JlUmVtb3ZpbmdFeHRlbnNpb24obGF0ZXN0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvUmVtb3ZlID0gZXh0ZW5zaW9ucy5maWx0ZXIoZSA9PiBlLmluc3RhbGxlZFRpbWVzdGFtcCAvKiBJbnN0YWxsZWQgYnkgU3lzdGVtICovICYmIHJlbW92ZWRbRXh0ZW5zaW9uS2V5LmNyZWF0ZShlKS50b1N0cmluZygpXSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHRvUmVtb3ZlLm1hcChlID0+IHRoaXMuZGVsZXRlRXh0ZW5zaW9uKGUsICdtYXJrZWQgZm9yIHJlbW92YWwnKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW1vdmVUZW1wb3JhcmlseURlbGV0ZWRGb2xkZXJzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UjcmVtb3ZlVGVtcERlbGV0ZUZvbGRlcnMnKTtcblxuXHRcdGxldCBzdGF0O1xuXHRcdHRyeSB7XG5cdFx0XHRzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnVzZXJFeHRlbnNpb25zTG9jYXRpb24pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghc3RhdD8uY2hpbGRyZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHN0YXQuY2hpbGRyZW4ubWFwKGFzeW5jIGNoaWxkID0+IHtcblx0XHRcdFx0aWYgKCFjaGlsZC5pc0RpcmVjdG9yeSB8fCAhY2hpbGQubmFtZS5lbmRzV2l0aChERUxFVEVEX0ZPTERFUl9QT1NURklYKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0RlbGV0aW5nIHRoZSB0ZW1wb3JhcmlseSBkZWxldGVkIGZvbGRlcicsIGNoaWxkLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKGNoaWxkLnJlc291cmNlLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0RlbGV0ZWQgdGhlIHRlbXBvcmFyaWx5IGRlbGV0ZWQgZm9sZGVyJywgY2hpbGQucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHsgLyogaWdub3JlICovIH1cblx0fVxuXG59XG5cbmNsYXNzIEluc3RhbGxFeHRlbnNpb25JblByb2ZpbGVUYXNrIGV4dGVuZHMgQWJzdHJhY3RFeHRlbnNpb25UYXNrPElMb2NhbEV4dGVuc2lvbj4gaW1wbGVtZW50cyBJSW5zdGFsbEV4dGVuc2lvblRhc2sge1xuXG5cdHByaXZhdGUgX29wZXJhdGlvbiA9IEluc3RhbGxPcGVyYXRpb24uSW5zdGFsbDtcblx0Z2V0IG9wZXJhdGlvbigpIHsgcmV0dXJuIHRoaXMub3B0aW9ucy5vcGVyYXRpb24gPz8gdGhpcy5fb3BlcmF0aW9uOyB9XG5cblx0cHJpdmF0ZSBfdmVyaWZpY2F0aW9uU3RhdHVzOiBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlIHwgdW5kZWZpbmVkO1xuXHRnZXQgdmVyaWZpY2F0aW9uU3RhdHVzKCkgeyByZXR1cm4gdGhpcy5fdmVyaWZpY2F0aW9uU3RhdHVzOyB9XG5cblx0cmVhZG9ubHkgaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25LZXk6IEV4dGVuc2lvbktleSxcblx0XHRyZWFkb25seSBtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LFxuXHRcdHJlYWRvbmx5IHNvdXJjZTogSUdhbGxlcnlFeHRlbnNpb24gfCBVUkksXG5cdFx0cmVhZG9ubHkgb3B0aW9uczogSW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0cmFjdEV4dGVuc2lvbkZuOiAob3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8RXh0cmFjdEV4dGVuc2lvblJlc3VsdD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zU2Nhbm5lcjogRXh0ZW5zaW9uc1NjYW5uZXIsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zU2Nhbm5lclNlcnZpY2U6IElFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZTogSUV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5pZGVudGlmaWVyID0gdGhpcy5leHRlbnNpb25LZXkuaWRlbnRpZmllcjtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBkb1J1bih0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuc2NhbkV4dGVuc2lvbnMoRXh0ZW5zaW9uVHlwZS5Vc2VyLCB0aGlzLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLCB0aGlzLm9wdGlvbnMucHJvZHVjdFZlcnNpb24pO1xuXHRcdGNvbnN0IGV4aXN0aW5nRXh0ZW5zaW9uID0gaW5zdGFsbGVkLmZpbmQoaSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpLmlkZW50aWZpZXIsIHRoaXMuaWRlbnRpZmllcikpO1xuXHRcdGlmIChleGlzdGluZ0V4dGVuc2lvbikge1xuXHRcdFx0dGhpcy5fb3BlcmF0aW9uID0gSW5zdGFsbE9wZXJhdGlvbi5VcGRhdGU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3lzdGVtID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lci5zY2FuRXh0ZW5zaW9ucyhFeHRlbnNpb25UeXBlLlN5c3RlbSwgdGhpcy5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbiwgdGhpcy5vcHRpb25zLnByb2R1Y3RWZXJzaW9uKTtcblx0XHRjb25zdCBleGlzdGluZ1N5c3RlbUV4dGVuc2lvbiA9IHN5c3RlbS5maW5kKGkgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaS5pZGVudGlmaWVyLCB0aGlzLmlkZW50aWZpZXIpKTtcblx0XHRpZiAoZXhpc3RpbmdTeXN0ZW1FeHRlbnNpb24pIHtcblx0XHRcdGlmICghZXhpc3RpbmdTeXN0ZW1FeHRlbnNpb24uZm9yY2VBdXRvVXBkYXRlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmxzLmxvY2FsaXplKCdidWlsdGluQXV0b1VwZGF0ZScsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIGEgYnVpbHQtaW4gZXh0ZW5zaW9uIGFuZCBub3QgYWxsb3dlZCB0byBiZSB1cGRhdGVkIGluIHRoZSBjdXJyZW50IHByb2R1Y3QgcXVhbGl0eSAnezF9Jy5cIiwgZXhpc3RpbmdTeXN0ZW1FeHRlbnNpb24uaWRlbnRpZmllci5pZCwgdGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5KSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5JbmNvbXBhdGlibGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlbXZlci5ndChleGlzdGluZ1N5c3RlbUV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uLCB0aGlzLm1hbmlmZXN0LnZlcnNpb24pKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmxzLmxvY2FsaXplKCdidWlsdGluVmVyc2lvbicsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIGEgYnVpbHQtaW4gZXh0ZW5zaW9uIHdpdGggdmVyc2lvbiAnezF9JyBhbmQgY2Fubm90IGJlIGRvd25ncmFkZWQgdG8gdmVyc2lvbiAnezJ9Jy5cIiwgZXhpc3RpbmdTeXN0ZW1FeHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXhpc3RpbmdTeXN0ZW1FeHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiwgdGhpcy5tYW5pZmVzdC52ZXJzaW9uKSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5JbmNvbXBhdGlibGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1ldGFkYXRhOiBNZXRhZGF0YSA9IHtcblx0XHRcdGlzQXBwbGljYXRpb25TY29wZWQ6IHRoaXMub3B0aW9ucy5pc0FwcGxpY2F0aW9uU2NvcGVkIHx8IGV4aXN0aW5nRXh0ZW5zaW9uPy5pc0FwcGxpY2F0aW9uU2NvcGVkLFxuXHRcdFx0aXNNYWNoaW5lU2NvcGVkOiB0aGlzLm9wdGlvbnMuaXNNYWNoaW5lU2NvcGVkIHx8IGV4aXN0aW5nRXh0ZW5zaW9uPy5pc01hY2hpbmVTY29wZWQsXG5cdFx0XHRpc0J1aWx0aW46IHRoaXMub3B0aW9ucy5pc0J1aWx0aW4gfHwgZXhpc3RpbmdFeHRlbnNpb24/LmlzQnVpbHRpbixcblx0XHRcdGlzU3lzdGVtOiBleGlzdGluZ0V4dGVuc2lvbj8udHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0gPyB0cnVlIDogdW5kZWZpbmVkLFxuXHRcdFx0aW5zdGFsbGVkVGltZXN0YW1wOiBEYXRlLm5vdygpLFxuXHRcdFx0cGlubmVkOiB0aGlzLm9wdGlvbnMuaW5zdGFsbEdpdmVuVmVyc2lvbiA/IHRydWUgOiAodGhpcy5vcHRpb25zLnBpbm5lZCA/PyBleGlzdGluZ0V4dGVuc2lvbj8ucGlubmVkKSxcblx0XHRcdHNvdXJjZTogdGhpcy5zb3VyY2UgaW5zdGFuY2VvZiBVUkkgPyAndnNpeCcgOiAnZ2FsbGVyeScsXG5cdFx0fTtcblxuXHRcdGxldCBsb2NhbDogSUxvY2FsRXh0ZW5zaW9uIHwgdW5kZWZpbmVkO1xuXG5cdFx0Ly8gVlNJWFxuXHRcdGlmICh0aGlzLnNvdXJjZSBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0aWYgKGV4aXN0aW5nRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbktleS5lcXVhbHMobmV3IEV4dGVuc2lvbktleShleGlzdGluZ0V4dGVuc2lvbi5pZGVudGlmaWVyLCBleGlzdGluZ0V4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uKSkpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lci5kZWxldGVFeHRlbnNpb24oZXhpc3RpbmdFeHRlbnNpb24sICdleGlzdGluZycpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ3Jlc3RhcnRDb2RlJywgXCJQbGVhc2UgcmVzdGFydCBWUyBDb2RlIGJlZm9yZSByZWluc3RhbGxpbmcgezB9LlwiLCB0aGlzLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IHRoaXMubWFuaWZlc3QubmFtZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZW1vdmUgdGhlIGV4dGVuc2lvbiB3aXRoIHNhbWUgdmVyc2lvbiBpZiBpdCBpcyBhbHJlYWR5IHVuaW5zdGFsbGVkLlxuXHRcdFx0Ly8gSW5zdGFsbGluZyBhIFZTSVggZXh0ZW5zaW9uIHNoYWxsIHJlcGxhY2UgdGhlIGV4aXN0aW5nIGV4dGVuc2lvbiBhbHdheXMuXG5cdFx0XHRjb25zdCBleGlzdGluZ1dpdGhTYW1lVmVyc2lvbiA9IGF3YWl0IHRoaXMudW5zZXRJZlJlbW92ZWQodGhpcy5leHRlbnNpb25LZXkpO1xuXHRcdFx0aWYgKGV4aXN0aW5nV2l0aFNhbWVWZXJzaW9uKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lci5kZWxldGVFeHRlbnNpb24oZXhpc3RpbmdXaXRoU2FtZVZlcnNpb24sICdleGlzdGluZycpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgncmVzdGFydENvZGUnLCBcIlBsZWFzZSByZXN0YXJ0IFZTIENvZGUgYmVmb3JlIHJlaW5zdGFsbGluZyB7MH0uXCIsIHRoaXMubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgdGhpcy5tYW5pZmVzdC5uYW1lKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH1cblxuXHRcdC8vIEdhbGxlcnlcblx0XHRlbHNlIHtcblx0XHRcdG1ldGFkYXRhLmlkID0gdGhpcy5zb3VyY2UuaWRlbnRpZmllci51dWlkO1xuXHRcdFx0bWV0YWRhdGEucHVibGlzaGVySWQgPSB0aGlzLnNvdXJjZS5wdWJsaXNoZXJJZDtcblx0XHRcdG1ldGFkYXRhLnB1Ymxpc2hlckRpc3BsYXlOYW1lID0gdGhpcy5zb3VyY2UucHVibGlzaGVyRGlzcGxheU5hbWU7XG5cdFx0XHRtZXRhZGF0YS50YXJnZXRQbGF0Zm9ybSA9IHRoaXMuc291cmNlLnByb3BlcnRpZXMudGFyZ2V0UGxhdGZvcm07XG5cdFx0XHRtZXRhZGF0YS51cGRhdGVkID0gISFleGlzdGluZ0V4dGVuc2lvbjtcblx0XHRcdG1ldGFkYXRhLnByaXZhdGUgPSB0aGlzLnNvdXJjZS5wcml2YXRlO1xuXHRcdFx0bWV0YWRhdGEuaXNQcmVSZWxlYXNlVmVyc2lvbiA9IHRoaXMuc291cmNlLnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbjtcblx0XHRcdG1ldGFkYXRhLmhhc1ByZVJlbGVhc2VWZXJzaW9uID0gZXhpc3RpbmdFeHRlbnNpb24/Lmhhc1ByZVJlbGVhc2VWZXJzaW9uIHx8IHRoaXMuc291cmNlLnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbjtcblx0XHRcdG1ldGFkYXRhLnByZVJlbGVhc2UgPSBpc0Jvb2xlYW4odGhpcy5vcHRpb25zLnByZVJlbGVhc2UpXG5cdFx0XHRcdD8gdGhpcy5vcHRpb25zLnByZVJlbGVhc2Vcblx0XHRcdFx0OiB0aGlzLm9wdGlvbnMuaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uIHx8IHRoaXMuc291cmNlLnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbiB8fCBleGlzdGluZ0V4dGVuc2lvbj8ucHJlUmVsZWFzZTtcblxuXHRcdFx0aWYgKGV4aXN0aW5nRXh0ZW5zaW9uICYmIGV4aXN0aW5nRXh0ZW5zaW9uLnR5cGUgIT09IEV4dGVuc2lvblR5cGUuU3lzdGVtICYmIGV4aXN0aW5nRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24gPT09IHRoaXMuc291cmNlLnZlcnNpb24pIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIudXBkYXRlTWV0YWRhdGEoZXhpc3RpbmdFeHRlbnNpb24sIG1ldGFkYXRhLCB0aGlzLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVW5zZXQgaWYgdGhlIGV4dGVuc2lvbiBpcyB1bmluc3RhbGxlZCBhbmQgcmV0dXJuIHRoZSB1bnNldCBleHRlbnNpb24uXG5cdFx0XHRsb2NhbCA9IGF3YWl0IHRoaXMudW5zZXRJZlJlbW92ZWQodGhpcy5leHRlbnNpb25LZXkpO1xuXHRcdH1cblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhyb3cgdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdH1cblxuXHRcdGlmICghbG9jYWwpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXh0cmFjdEV4dGVuc2lvbkZuKHRoaXMub3BlcmF0aW9uLCB0b2tlbik7XG5cdFx0XHRsb2NhbCA9IHJlc3VsdC5sb2NhbDtcblx0XHRcdHRoaXMuX3ZlcmlmaWNhdGlvblN0YXR1cyA9IHJlc3VsdC52ZXJpZmljYXRpb25TdGF0dXM7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLCB0aGlzLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uKSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2UuaW5pdGlhbGl6ZURlZmF1bHRQcm9maWxlRXh0ZW5zaW9ucygpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoZXJyb3IsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuSW50aWFsaXplRGVmYXVsdFByb2ZpbGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhyb3cgdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UuYWRkRXh0ZW5zaW9uc1RvUHJvZmlsZShbW2xvY2FsLCBtZXRhZGF0YV1dLCB0aGlzLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLCAhbG9jYWwuaXNWYWxpZCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGVycm9yLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkFkZFRvUHJvZmlsZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lci5zY2FuTG9jYWxFeHRlbnNpb24obG9jYWwubG9jYXRpb24sIEV4dGVuc2lvblR5cGUuVXNlciwgdGhpcy5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbik7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoJ0Nhbm5vdCBmaW5kIHRoZSBpbnN0YWxsZWQgZXh0ZW5zaW9uJywgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5JbnN0YWxsZWRFeHRlbnNpb25Ob3RGb3VuZCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc291cmNlIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZU1ldGFkYXRhKGxvY2FsLCB0b2tlbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdW5zZXRJZlJlbW92ZWQoZXh0ZW5zaW9uS2V5OiBFeHRlbnNpb25LZXkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIElmIHRoZSBzYW1lIHZlcnNpb24gb2YgZXh0ZW5zaW9uIGlzIG1hcmtlZCBhcyByZW1vdmVkLCByZW1vdmUgaXQgZnJvbSB0aGVyZSBhbmQgcmV0dXJuIHRoZSBsb2NhbC5cblx0XHRjb25zdCBbcmVtb3ZlZF0gPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnVuc2V0RXh0ZW5zaW9uc0ZvclJlbW92YWwoZXh0ZW5zaW9uS2V5KTtcblx0XHRpZiAocmVtb3ZlZCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1JlbW92ZWQgdGhlIGV4dGVuc2lvbiBmcm9tIHJlbW92ZWQgbGlzdDonLCBleHRlbnNpb25LZXkuaWQpO1xuXHRcdFx0Y29uc3QgdXNlckV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnNjYW5BbGxVc2VyRXh0ZW5zaW9ucygpO1xuXHRcdFx0cmV0dXJuIHVzZXJFeHRlbnNpb25zLmZpbmQoaSA9PiBFeHRlbnNpb25LZXkuY3JlYXRlKGkpLmVxdWFscyhleHRlbnNpb25LZXkpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlTWV0YWRhdGEoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRsZXQgW2dhbGxlcnlFeHRlbnNpb25dID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKFt7IGlkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgdmVyc2lvbjogZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24gfV0sIHRva2VuKTtcblx0XHRcdGlmICghZ2FsbGVyeUV4dGVuc2lvbikge1xuXHRcdFx0XHRbZ2FsbGVyeUV4dGVuc2lvbl0gPSBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkIH1dLCB0b2tlbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZ2FsbGVyeUV4dGVuc2lvbikge1xuXHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IHtcblx0XHRcdFx0XHRpZDogZ2FsbGVyeUV4dGVuc2lvbi5pZGVudGlmaWVyLnV1aWQsXG5cdFx0XHRcdFx0cHVibGlzaGVyRGlzcGxheU5hbWU6IGdhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0cHVibGlzaGVySWQ6IGdhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVySWQsXG5cdFx0XHRcdFx0aXNQcmVSZWxlYXNlVmVyc2lvbjogZ2FsbGVyeUV4dGVuc2lvbi5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24sXG5cdFx0XHRcdFx0aGFzUHJlUmVsZWFzZVZlcnNpb246IGV4dGVuc2lvbi5oYXNQcmVSZWxlYXNlVmVyc2lvbiB8fCBnYWxsZXJ5RXh0ZW5zaW9uLnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbixcblx0XHRcdFx0XHRwcmVSZWxlYXNlOiBnYWxsZXJ5RXh0ZW5zaW9uLnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbiB8fCB0aGlzLm9wdGlvbnMuaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uXG5cdFx0XHRcdH07XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIudXBkYXRlTWV0YWRhdGEoZXh0ZW5zaW9uLCBtZXRhZGF0YSwgdGhpcy5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8qIElnbm9yZSBFcnJvciAqL1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBVbmluc3RhbGxFeHRlbnNpb25JblByb2ZpbGVUYXNrIGV4dGVuZHMgQWJzdHJhY3RFeHRlbnNpb25UYXNrPHZvaWQ+IGltcGxlbWVudHMgSVVuaW5zdGFsbEV4dGVuc2lvblRhc2sge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLFxuXHRcdHJlYWRvbmx5IG9wdGlvbnM6IFVuaW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZTogSUV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZG9SdW4odG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5yZW1vdmVFeHRlbnNpb25zRnJvbVByb2ZpbGUoW3RoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXJdLCB0aGlzLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksUUFBUTtBQUNwQixTQUFTLFVBQVUsYUFBYTtBQUNoQyxTQUFTLGdCQUFnQjtBQUd6QixTQUFTLG1CQUFtQix1QkFBdUI7QUFDbkQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGFBQWEsbUJBQW1CO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixZQUFZLFVBQVU7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsV0FBVyxXQUFXLG1CQUFtQjtBQUNsRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsU0FBZ0IsV0FBVztBQUNwQyxZQUFZLFNBQVM7QUFDckIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUIsaUNBQWlDO0FBQy9ELFNBQVMsb0NBQW9DLHVCQUFvRyxrQ0FBaUU7QUFDbE47QUFBQSxFQUNDO0FBQUEsRUFBMEI7QUFBQSxFQUE4QjtBQUFBLEVBQWdEO0FBQUEsRUFBaUU7QUFBQSxFQUd6SztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUNQLFNBQVMsbUJBQW1CLHVCQUF1QixjQUFjLHVCQUF1Qix3QkFBd0I7QUFDaEgsU0FBUyx3Q0FBa0U7QUFDM0UsU0FBUyxpQ0FBaUc7QUFDMUcsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQkFBa0IsbUJBQW1CO0FBQzlDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQTBDLHlCQUF5QjtBQUNuRSxTQUFTLGVBQStDLHNCQUFzQjtBQUM5RSxTQUFTLHFCQUFxQjtBQUM5QixTQUEyQixnQkFBZ0IscUJBQXFCLGNBQXlCLDZCQUE2QjtBQUN0SCxTQUFTLHVCQUF1Qiw4QkFBOEI7QUFDOUQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3Q0FBd0M7QUFFMUMsTUFBTSwwQ0FBMEMsdUJBQTZGLDJCQUEyQjtBQVUvSyxNQUFNLHlCQUF5QjtBQUV4QixJQUFNLDZCQUFOLGNBQXlDLG1DQUFzRjtBQUFBLEVBUXJJLFlBQzJCLGdCQUNQLGtCQUNOLFlBQytCLG9CQUNBLDBCQUNPLGlDQUN6QixpQkFDYyxzQkFDVCxhQUNTLHNCQUNhLGlDQUNwQyxnQkFDVSwwQkFDTixvQkFDSyx5QkFDekI7QUFDRCxVQUFNLGdCQUFnQixrQkFBa0Isb0JBQW9CLFlBQVksZ0JBQWdCLDBCQUEwQix1QkFBdUI7QUFiN0Y7QUFDQTtBQUNPO0FBQ3pCO0FBQ2M7QUFDVDtBQUNTO0FBQ2E7QUFidEQsU0FBaUIsOEJBQThCLG9CQUFJLElBQTZDO0FBMldoRyxTQUFpQixtQkFBbUIsSUFBSSxZQUFZO0FBdlZuRCxVQUFNLHFCQUFxQixLQUFLLFVBQVUscUJBQXFCLGVBQWUsbUJBQW1CLENBQUM7QUFDbEcsU0FBSyxvQkFBb0IsS0FBSyxVQUFVLHFCQUFxQixlQUFlLG1CQUFtQixlQUFhLG1CQUFtQixjQUFjLFNBQVMsQ0FBQyxDQUFDO0FBQ3hKLFNBQUssZ0JBQWdCLEtBQUssVUFBVSxJQUFJLHdCQUF3Qix5QkFBeUIsYUFBYSxvQkFBb0IsTUFBTSxLQUFLLFVBQVUsQ0FBQztBQUNoSixTQUFLLHVCQUF1QixLQUFLLFVBQVUscUJBQXFCLGVBQWUsb0JBQW9CLENBQUM7QUFFcEcsVUFBTSxvQkFBb0IsS0FBSyxVQUFVLElBQUksa0JBQWtCLE1BQU0sS0FBSywwQkFBMEIseUJBQXlCLGlDQUFpQyxvQkFBb0IsYUFBYSxVQUFVLENBQUM7QUFDMU0sU0FBSyxVQUFVLGtCQUFrQixxQ0FBcUMsT0FBSyxLQUFLLHVDQUF1QyxDQUFDLENBQUMsQ0FBQztBQUMxSCxTQUFLLHVDQUF1QztBQUFBLEVBQzdDO0FBQUEsRUFHQSxvQkFBNkM7QUFDNUMsUUFBSSxDQUFDLEtBQUssd0JBQXdCO0FBQ2pDLFdBQUsseUJBQXlCLHNCQUFzQixLQUFLLGFBQWEsS0FBSyxVQUFVO0FBQUEsSUFDdEY7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFNLElBQUksV0FBMEM7QUFDbkQsU0FBSyxXQUFXLE1BQU0sa0NBQWtDLFVBQVUsV0FBVyxFQUFFO0FBQy9FLFVBQU0sUUFBUSxNQUFNLEtBQUssYUFBYSxTQUFTO0FBQy9DLFVBQU0sV0FBVyxNQUFNLElBQUksU0FBUyxLQUFLLHFCQUFxQix1QkFBdUIsYUFBYSxDQUFDLEVBQUUsUUFBUSxLQUFLO0FBQ2xILFdBQU8sSUFBSSxLQUFLLFFBQVE7QUFBQSxFQUN6QjtBQUFBLEVBRUEsTUFBTSxZQUFZLE1BQXdDO0FBQ3pELFVBQU0sRUFBRSxVQUFVLFFBQVEsSUFBSSxNQUFNLEtBQUssYUFBYSxJQUFJO0FBQzFELFVBQU0sVUFBVSxLQUFLLFFBQVEsU0FBUyxNQUFNO0FBQzVDLFFBQUk7QUFDSCxhQUFPLE1BQU0sWUFBWSxPQUFPO0FBQUEsSUFDakMsVUFBRTtBQUNELFlBQU0sUUFBUTtBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQUEsRUFFQSxhQUFhLE1BQXNCLGtCQUF1QixLQUFLLHdCQUF3QixlQUFlLG9CQUFvQixpQkFBa0MsRUFBRSxTQUFTLEtBQUssZUFBZSxTQUFTLE1BQU0sS0FBSyxlQUFlLEtBQUssR0FBRyxVQUErQztBQUNwUixXQUFPLEtBQUssa0JBQWtCLGVBQWUsUUFBUSxNQUFNLGlCQUFpQixnQkFBZ0IsUUFBUTtBQUFBLEVBQ3JHO0FBQUEsRUFFQSxpQ0FBNkQ7QUFDNUQsV0FBTyxLQUFLLGtCQUFrQixzQkFBc0I7QUFBQSxFQUNyRDtBQUFBLEVBRUEsaUNBQWlDLFVBQWdEO0FBQ2hGLFdBQU8sS0FBSyxrQkFBa0IsNEJBQTRCLFFBQVE7QUFBQSxFQUNuRTtBQUFBLEVBRUEsTUFBTSxRQUFRLE1BQVcsVUFBMEIsQ0FBQyxHQUE2QjtBQUNoRixTQUFLLFdBQVcsTUFBTSxzQ0FBc0MsS0FBSyxTQUFTLENBQUM7QUFFM0UsVUFBTSxFQUFFLFVBQVUsUUFBUSxJQUFJLE1BQU0sS0FBSyxhQUFhLElBQUk7QUFFMUQsUUFBSTtBQUNILFlBQU0sV0FBVyxNQUFNLFlBQVksS0FBSyxRQUFRLFNBQVMsTUFBTSxDQUFDO0FBQ2hFLFlBQU0sY0FBYyxzQkFBc0IsU0FBUyxXQUFXLFNBQVMsSUFBSTtBQUMzRSxVQUFJLFNBQVMsV0FBVyxTQUFTLFFBQVEsVUFBVSxDQUFDLGNBQWMsU0FBUyxRQUFRLFFBQVEsS0FBSyxlQUFlLFNBQVMsS0FBSyxlQUFlLElBQUksR0FBRztBQUNsSixjQUFNLElBQUksTUFBTSxJQUFJLFNBQVMsZ0JBQWdCLGlGQUFpRixhQUFhLEtBQUssZUFBZSxPQUFPLENBQUM7QUFBQSxNQUN4SztBQUVBLFlBQU0sbUJBQW1CLEtBQUsseUJBQXlCLFVBQVUsRUFBRSxJQUFJLGFBQWEsU0FBUyxTQUFTLFNBQVMsc0JBQXNCLE9BQVUsQ0FBQztBQUNoSixVQUFJLHFCQUFxQixNQUFNO0FBQzlCLGNBQU0sSUFBSSxNQUFNLElBQUksU0FBUyxjQUFjLGtEQUFrRCxpQkFBaUIsS0FBSyxDQUFDO0FBQUEsTUFDckg7QUFFQSxZQUFNLFVBQVUsTUFBTSxLQUFLLGtCQUFrQixDQUFDLEVBQUUsVUFBVSxXQUFXLFVBQVUsUUFBUSxDQUFDLENBQUM7QUFDekYsWUFBTSxTQUFTLFFBQVEsS0FBSyxDQUFDLEVBQUUsV0FBVyxNQUFNLGtCQUFrQixZQUFZLEVBQUUsSUFBSSxZQUFZLENBQUMsQ0FBQztBQUNsRyxVQUFJLFFBQVEsT0FBTztBQUNsQixlQUFPLE9BQU87QUFBQSxNQUNmO0FBQ0EsVUFBSSxRQUFRLE9BQU87QUFDbEIsY0FBTSxPQUFPO0FBQUEsTUFDZDtBQUNBLFlBQU0sMkJBQTJCLElBQUksTUFBTSw0Q0FBNEMsV0FBVyxFQUFFLENBQUM7QUFBQSxJQUN0RyxVQUFFO0FBQ0QsWUFBTSxRQUFRO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sb0JBQW9CLFVBQWUsaUJBQWdEO0FBQ3hGLFNBQUssV0FBVyxNQUFNLGtEQUFrRCxTQUFTLFNBQVMsQ0FBQztBQUMzRixVQUFNLFFBQVEsTUFBTSxLQUFLLGtCQUFrQiw0QkFBNEIsUUFBUTtBQUMvRSxRQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sU0FBUyxRQUFRLENBQUMsTUFBTSxTQUFTLFNBQVM7QUFDOUQsWUFBTSxJQUFJLE1BQU0sbURBQW1ELFNBQVMsU0FBUyxDQUFDLEVBQUU7QUFBQSxJQUN6RjtBQUNBLFVBQU0sS0FBSyx1QkFBdUIsQ0FBQyxDQUFDLE9BQU8sRUFBRSxRQUFRLFdBQVcsQ0FBQyxDQUFDLEdBQUcsZUFBZTtBQUNwRixTQUFLLFdBQVcsS0FBSyxvQ0FBb0MsTUFBTSxXQUFXLElBQUksZ0JBQWdCLFNBQVMsQ0FBQztBQUN4RyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSw2QkFBNkIsWUFBb0MscUJBQTBCLG1CQUFvRDtBQUNwSixTQUFLLFdBQVcsTUFBTSwyREFBMkQsWUFBWSxvQkFBb0IsU0FBUyxHQUFHLGtCQUFrQixTQUFTLENBQUM7QUFDekosVUFBTSx1QkFBdUIsTUFBTSxLQUFLLGFBQWEsY0FBYyxNQUFNLG1CQUFtQixHQUFHLE9BQU8sT0FBSyxXQUFXLEtBQUssUUFBTSxrQkFBa0IsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0FBQ3JLLFFBQUksb0JBQW9CLFFBQVE7QUFDL0IsWUFBTSxXQUFXLE1BQU0sUUFBUSxJQUFJLG9CQUFvQixJQUFJLE9BQUssS0FBSyxrQkFBa0IsYUFBYSxHQUFHLG1CQUFtQixDQUFDLENBQUM7QUFDNUgsWUFBTSxLQUFLLHVCQUF1QixvQkFBb0IsSUFBSSxDQUFDLEdBQUcsVUFBVSxDQUFDLEdBQUcsU0FBUyxLQUFLLENBQUMsQ0FBQyxHQUFHLGlCQUFpQjtBQUNoSCxXQUFLLFdBQVcsS0FBSyxxQ0FBcUMsb0JBQW9CLElBQUksT0FBSyxFQUFFLFdBQVcsRUFBRSxHQUFHLGtCQUFrQixTQUFTLENBQUM7QUFBQSxJQUN0STtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLGVBQWUsT0FBd0IsVUFBNkIsaUJBQWdEO0FBQ3pILFNBQUssV0FBVyxNQUFNLDZDQUE2QyxNQUFNLFdBQVcsRUFBRTtBQUN0RixRQUFJLFNBQVMscUJBQXFCO0FBQ2pDLGVBQVMsYUFBYTtBQUN0QixlQUFTLHVCQUF1QjtBQUFBLElBQ2pDO0FBRUEsUUFBSSxTQUFTLG9CQUFvQixPQUFPO0FBQ3ZDLGVBQVMsa0JBQWtCO0FBQUEsSUFDNUI7QUFDQSxRQUFJLFNBQVMsY0FBYyxPQUFPO0FBQ2pDLGVBQVMsWUFBWTtBQUFBLElBQ3RCO0FBQ0EsUUFBSSxTQUFTLFdBQVcsT0FBTztBQUM5QixlQUFTLFNBQVM7QUFBQSxJQUNuQjtBQUNBLFlBQVEsTUFBTSxLQUFLLGtCQUFrQixlQUFlLE9BQU8sVUFBVSxlQUFlO0FBQ3BGLFNBQUssY0FBYyxXQUFXLGVBQWU7QUFDN0MsU0FBSyw4QkFBOEIsS0FBSyxFQUFFLE9BQU8sZ0JBQWdCLENBQUM7QUFDbEUsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVVLGdCQUFnQixXQUEyQztBQUNwRSxXQUFPLEtBQUssa0JBQWtCLGdCQUFnQixXQUFXLFFBQVE7QUFBQSxFQUNsRTtBQUFBLEVBRVUsY0FBYyxXQUE0QixxQkFBMEIsbUJBQXdCLFVBQXVEO0FBQzVKLFdBQU8sS0FBSyxrQkFBa0IsY0FBYyxXQUFXLHFCQUFxQixtQkFBbUIsUUFBUTtBQUFBLEVBQ3hHO0FBQUEsRUFFVSxjQUFjLFdBQTRCLHFCQUEwQixtQkFBd0IsVUFBdUQ7QUFDNUosV0FBTyxLQUFLLGtCQUFrQixjQUFjLFdBQVcscUJBQXFCLG1CQUFtQixRQUFRO0FBQUEsRUFDeEc7QUFBQSxFQUVVLGdCQUFnQixXQUE0QixxQkFBeUM7QUFDOUYsV0FBTyxLQUFLLGtCQUFrQixnQkFBZ0IsVUFBVSxZQUFZLG1CQUFtQjtBQUFBLEVBQ3hGO0FBQUEsRUFFQSxlQUFlLHFCQUEwQixtQkFBdUM7QUFDL0UsV0FBTyxLQUFLLGtCQUFrQixlQUFlLHFCQUFxQixtQkFBbUIsRUFBRSxTQUFTLEtBQUssZUFBZSxTQUFTLE1BQU0sS0FBSyxlQUFlLEtBQUssQ0FBQztBQUFBLEVBQzlKO0FBQUEsRUFFQSxvQkFBb0IsWUFBeUM7QUFDNUQsV0FBTyxLQUFLLGtCQUFrQix3QkFBd0IsR0FBRyxVQUFVO0FBQUEsRUFDcEU7QUFBQSxFQUVBLE1BQU0sVUFBeUI7QUFDOUIsU0FBSyxXQUFXLE1BQU0sb0NBQW9DO0FBQzFELFFBQUk7QUFDSCxZQUFNLEtBQUssa0JBQWtCLFFBQVE7QUFBQSxJQUN0QyxTQUFTLE9BQU87QUFDZixXQUFLLFdBQVcsTUFBTSxLQUFLO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLFNBQVMsV0FBOEIsV0FBNkIsc0JBQTZDO0FBQ3RILFVBQU0sRUFBRSxTQUFTLElBQUksTUFBTSxLQUFLLGtCQUFrQixXQUFXLFdBQVcsQ0FBQyxvQkFBb0I7QUFDN0YsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsYUFBYSxNQUFxRTtBQUMvRixRQUFJLEtBQUssV0FBVyxRQUFRLE1BQU07QUFDakMsYUFBTyxFQUFFLFVBQVUsTUFBTSxNQUFNLFVBQVU7QUFBQSxNQUFFLEVBQUU7QUFBQSxJQUM5QztBQUNBLFNBQUssV0FBVyxNQUFNLDhCQUE4QixLQUFLLFNBQVMsQ0FBQztBQUNuRSxVQUFNLFdBQVcsU0FBUyxLQUFLLHFCQUFxQix1QkFBdUIsYUFBYSxDQUFDO0FBQ3pGLFVBQU0sS0FBSyxnQkFBZ0IsU0FBUyxNQUFNLFVBQVUsa0NBQWtDO0FBQ3RGLFNBQUssV0FBVyxLQUFLLDJCQUEyQixTQUFTLFNBQVMsQ0FBQztBQUNuRSxVQUFNLFVBQVUsWUFBWTtBQUMzQixVQUFJO0FBQ0gsY0FBTSxLQUFLLFlBQVksSUFBSSxRQUFRO0FBQUEsTUFDcEMsU0FBUyxPQUFPO0FBQ2YsYUFBSyxXQUFXLE1BQU0sS0FBSztBQUFBLE1BQzVCO0FBQUEsSUFDRDtBQUNBLFdBQU8sRUFBRSxVQUFVLFFBQVE7QUFBQSxFQUM1QjtBQUFBLEVBRVUsdUNBQTRDO0FBQ3JELFdBQU8sS0FBSyx3QkFBd0IsZUFBZTtBQUFBLEVBQ3BEO0FBQUEsRUFFVSwyQkFBMkIsVUFBOEIsV0FBb0MsU0FBNkQ7QUFDbkssVUFBTSxlQUFlLHFCQUFxQixNQUFNLElBQUksYUFBYSxFQUFFLElBQUksc0JBQXNCLFNBQVMsV0FBVyxTQUFTLElBQUksRUFBRSxHQUFHLFNBQVMsT0FBTyxJQUFJLGFBQWEsT0FBTyxTQUFTO0FBQ3BMLFdBQU8sS0FBSyxxQkFBcUIsZUFBZSwrQkFBK0IsY0FBYyxVQUFVLFdBQVcsU0FBUyxDQUFDLFdBQVcsVUFBVTtBQUNoSixVQUFJLHFCQUFxQixLQUFLO0FBQzdCLGVBQU8sS0FBSyxZQUFZLGNBQWMsV0FBVyxTQUFTLEtBQUs7QUFBQSxNQUNoRTtBQUNBLFVBQUksVUFBVSxLQUFLLDRCQUE0QixJQUFJLGFBQWEsU0FBUyxDQUFDO0FBQzFFLFVBQUksQ0FBQyxTQUFTO0FBQ2IsYUFBSyw0QkFBNEIsSUFBSSxhQUFhLFNBQVMsR0FBRyxVQUFVLEtBQUssbUNBQW1DLGNBQWMsV0FBVyxXQUFXLFNBQVMsS0FBSyxDQUFDO0FBQ25LLGdCQUFRLFFBQVEsTUFBTSxLQUFLLDRCQUE0QixPQUFPLGFBQWEsU0FBUyxDQUFDLENBQUM7QUFBQSxNQUN2RjtBQUNBLGFBQU87QUFBQSxJQUNSLEdBQUcsS0FBSyxpQkFBaUI7QUFBQSxFQUMxQjtBQUFBLEVBRVUsNkJBQTZCLFdBQTRCLFNBQWlFO0FBQ25JLFdBQU8sSUFBSSxnQ0FBZ0MsV0FBVyxTQUFTLEtBQUssK0JBQStCO0FBQUEsRUFDcEc7QUFBQSxFQUVBLE1BQWMsbUNBQW1DLGNBQTRCLFNBQTRCLFdBQTZCLFNBQXNDLE9BQTJEO0FBQ3RPLFVBQU0sRUFBRSxvQkFBb0IsU0FBUyxJQUFJLE1BQU0sS0FBSyxrQkFBa0IsU0FBUyxXQUFXLENBQUMsUUFBUSxzQkFBc0IsUUFBUSxVQUFVLGdEQUFnRCxDQUErQjtBQUMxTixRQUFJO0FBRUgsVUFBSSxNQUFNLHlCQUF5QjtBQUNsQyxjQUFNLElBQUksa0JBQWtCO0FBQUEsTUFDN0I7QUFHQSxZQUFNLFdBQVcsTUFBTSxZQUFZLFNBQVMsTUFBTTtBQUNsRCxVQUFJLENBQUMsSUFBSSxhQUFhLFFBQVEsWUFBWSxRQUFRLE9BQU8sRUFBRSxPQUFPLElBQUksYUFBYSxFQUFFLElBQUksc0JBQXNCLFNBQVMsV0FBVyxTQUFTLElBQUksRUFBRSxHQUFHLFNBQVMsT0FBTyxDQUFDLEdBQUc7QUFDeEssY0FBTSxJQUFJLHlCQUF5QixJQUFJLFNBQVMsbUJBQW1CLGdGQUFnRixRQUFRLFdBQVcsRUFBRSxHQUFHLDZCQUE2QixPQUFPO0FBQUEsTUFDaE47QUFFQSxZQUFNLFFBQVEsTUFBTSxLQUFLLGtCQUFrQjtBQUFBLFFBQzFDO0FBQUEsUUFDQSxTQUFTO0FBQUEsUUFDVDtBQUFBLFFBQ0E7QUFBQSxNQUFLO0FBRU4sVUFBSSx1QkFBdUIsbUNBQW1DLFdBQVcsS0FBSyxtQkFBbUIsU0FBUztBQUN6RyxZQUFJO0FBQ0gsZ0JBQU0sS0FBSyxxQkFBcUIsT0FBTyxRQUFRO0FBQUEsUUFDaEQsU0FBUyxHQUFHO0FBRVgsZUFBSyxXQUFXLEtBQUssNENBQTRDLFNBQVMsU0FBUyxHQUFHLGdCQUFnQixDQUFDLENBQUM7QUFBQSxRQUN6RztBQUFBLE1BQ0Q7QUFFQSxhQUFPLEVBQUUsT0FBTyxtQkFBbUI7QUFBQSxJQUNwQyxTQUFTLE9BQU87QUFDZixVQUFJO0FBQ0gsY0FBTSxLQUFLLHFCQUFxQixPQUFPLFFBQVE7QUFBQSxNQUNoRCxTQUFTLEdBQUc7QUFFWCxhQUFLLFdBQVcsS0FBSyw0Q0FBNEMsU0FBUyxTQUFTLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQztBQUFBLE1BQ3pHO0FBQ0EsWUFBTSwyQkFBMkIsS0FBSztBQUFBLElBQ3ZDO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxrQkFBa0IsV0FBOEIsV0FBNkIsaUJBQTBCLHNCQUF5SjtBQUM3USxRQUFJLGlCQUFpQjtBQUNwQixZQUFNLFFBQVEsS0FBSyxxQkFBcUIsU0FBUyxpQ0FBaUM7QUFDbEYsd0JBQWtCLFVBQVUsS0FBSyxJQUFJLFFBQVE7QUFBQSxJQUM5QztBQUNBLFVBQU0sRUFBRSxVQUFVLG1CQUFtQixJQUFJLE1BQU0sS0FBSyxxQkFBcUIsU0FBUyxXQUFXLFdBQVcsaUJBQWlCLG9CQUFvQjtBQUM3SSxVQUFNLHlCQUF5QixvQ0FBb0MsVUFBVSxTQUFTLE1BQU0sS0FBSyxnQ0FBZ0MsNEJBQTRCLENBQUM7QUFFOUosUUFDQyx1QkFBdUIsbUNBQW1DLFdBQ3ZELEVBQUUsdUJBQXVCLG1DQUFtQyxhQUFhLENBQUMsMkJBQzFFLG1CQUNBLEtBQUssbUJBQW1CLFdBQ3ZCLE1BQU0sS0FBSyxrQkFBa0IsTUFBTyxlQUFlLGFBQ3REO0FBQ0QsVUFBSTtBQUNILGNBQU0sS0FBSyxxQkFBcUIsT0FBTyxRQUFRO0FBQUEsTUFDaEQsU0FBUyxHQUFHO0FBRVgsYUFBSyxXQUFXLEtBQUssNENBQTRDLFNBQVMsU0FBUyxHQUFHLGdCQUFnQixDQUFDLENBQUM7QUFBQSxNQUN6RztBQUVBLFVBQUksQ0FBQyxvQkFBb0I7QUFDeEIsY0FBTSxJQUFJLHlCQUF5QixJQUFJLFNBQVMsdUNBQXVDLDBDQUEwQyxHQUFHLDZCQUE2Qiw2QkFBNkI7QUFBQSxNQUMvTDtBQUVBLGNBQVEsb0JBQW9CO0FBQUEsUUFDM0IsS0FBSyxtQ0FBbUM7QUFBQSxRQUN4QyxLQUFLLG1DQUFtQztBQUFBLFFBQ3hDLEtBQUssbUNBQW1DO0FBQUEsUUFDeEMsS0FBSyxtQ0FBbUM7QUFBQSxRQUN4QyxLQUFLLG1DQUFtQztBQUFBLFFBQ3hDLEtBQUssbUNBQW1DO0FBQUEsUUFDeEMsS0FBSyxtQ0FBbUM7QUFBQSxRQUN4QyxLQUFLLG1DQUFtQztBQUFBLFFBQ3hDLEtBQUssbUNBQW1DO0FBQUEsUUFDeEMsS0FBSyxtQ0FBbUM7QUFBQSxRQUN4QyxLQUFLLG1DQUFtQztBQUN2QyxnQkFBTSxJQUFJLHlCQUF5QixJQUFJLFNBQVMsaUNBQWlDLG1EQUFtRCxrQkFBa0IsR0FBRyw2QkFBNkIsMkJBQTJCO0FBQUEsTUFDbk47QUFFQSxZQUFNLElBQUkseUJBQXlCLElBQUksU0FBUyxpQ0FBaUMsbURBQW1ELGtCQUFrQixHQUFHLDZCQUE2Qiw2QkFBNkI7QUFBQSxJQUNwTjtBQUVBLFdBQU8sRUFBRSxVQUFVLG1CQUFtQjtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxNQUFjLFlBQVksY0FBNEIsVUFBZSxTQUFzQyxPQUEyRDtBQUNySyxVQUFNLFFBQVEsTUFBTSxLQUFLLGtCQUFrQjtBQUFBLE1BQzFDO0FBQUEsTUFDQSxLQUFLLFFBQVEsU0FBUyxNQUFNO0FBQUEsTUFDNUIsVUFBVSxRQUFRLFlBQVksSUFBSSxDQUFDLFFBQVEsZUFBZTtBQUFBLE1BQzFEO0FBQUEsSUFBSztBQUNOLFdBQU8sRUFBRSxNQUFNO0FBQUEsRUFDaEI7QUFBQSxFQUVBLE1BQWMsYUFBYSxXQUE4QztBQUV4RSxVQUFNLDRCQUE0QixPQUFPLFFBQW1DO0FBQzNFLFVBQUksVUFBVSxNQUFNLElBQUksU0FBUyxRQUFRLEdBQUc7QUFDNUMsZ0JBQVUsUUFBUSxJQUFJLE9BQUssS0FBSyxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQzVDLFlBQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxRQUFRLElBQUksT0FBSyxHQUFHLFNBQVMsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUNyRSxVQUFJLFVBQTZCLFFBQVEsUUFBUSxDQUFDLENBQUM7QUFDbkQsWUFBTSxRQUFRLENBQUMsTUFBTSxVQUFVO0FBQzlCLGNBQU0sUUFBUSxRQUFRLEtBQUs7QUFDM0IsWUFBSSxLQUFLLE9BQU8sR0FBRztBQUNsQixvQkFBVSxRQUFRLEtBQUssWUFBVyxDQUFDLEdBQUcsUUFBUSxLQUFLLENBQUU7QUFBQSxRQUN0RDtBQUNBLFlBQUksS0FBSyxZQUFZLEdBQUc7QUFDdkIsb0JBQVUsUUFDUixLQUFLLFlBQVUsMEJBQTBCLEtBQUssRUFDN0MsS0FBSyxDQUFBQSxXQUFVLENBQUMsR0FBRyxRQUFRLEdBQUdBLE1BQUssQ0FBRSxDQUFDO0FBQUEsUUFDMUM7QUFBQSxNQUNELENBQUM7QUFDRCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sUUFBUSxNQUFNLDBCQUEwQixVQUFVLFNBQVMsTUFBTTtBQUN2RSxXQUFPLE1BQU0sSUFBSSxRQUFNLEVBQUUsTUFBTSxhQUFhLEtBQUssU0FBUyxVQUFVLFNBQVMsUUFBUSxDQUFDLENBQUMsSUFBSSxXQUFXLEVBQUUsRUFBRTtBQUFBLEVBQzNHO0FBQUEsRUFFQSxNQUFjLHVDQUF1QyxFQUFFLE9BQU8sUUFBUSxHQUFtRDtBQUN4SCxRQUFJLFNBQVM7QUFDWixZQUFNLG9CQUFvQixTQUFTLEtBQUssbUJBQW1CLE9BQU8sUUFBUSxRQUFRLGlCQUFpQixNQUFNLGVBQWUsSUFDckgsUUFBUSxXQUFXLE9BQU8sT0FBSyxNQUFNLFdBQVcsTUFBTSxnQkFBYyxDQUFDLGtCQUFrQixZQUFZLENBQUMsQ0FBQyxDQUFDLElBQ3RHLFFBQVE7QUFDWCxpQkFBVyxjQUFjLG1CQUFtQjtBQUMzQyxhQUFLLFdBQVcsS0FBSywwQ0FBMEMsV0FBVyxJQUFJLFFBQVEsZ0JBQWdCLFNBQVMsQ0FBQztBQUNoSCxhQUFLLHlCQUF5QixLQUFLLEVBQUUsWUFBWSxpQkFBaUIsUUFBUSxnQkFBZ0IsQ0FBQztBQUFBLE1BQzVGO0FBQUEsSUFDRDtBQUNBLFFBQUksT0FBTztBQUNWLFlBQU0sYUFBYSxNQUFNLEtBQUssYUFBYSxjQUFjLE1BQU0sTUFBTSxlQUFlO0FBQ3BGLFlBQU0sa0JBQWtCLFdBQVcsT0FBTyxPQUFLLE1BQU0sV0FBVyxLQUFLLGdCQUFjLGtCQUFrQixZQUFZLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDL0gsV0FBSyx3QkFBd0IsS0FBSyxnQkFBZ0IsSUFBSSxXQUFTO0FBQzlELGFBQUssV0FBVyxLQUFLLHdDQUF3QyxNQUFNLFdBQVcsSUFBSSxNQUFNLGdCQUFnQixTQUFTLENBQUM7QUFDbEgsZUFBTyxFQUFFLFlBQVksTUFBTSxZQUFZLE9BQU8saUJBQWlCLE1BQU0saUJBQWlCLFdBQVcsaUJBQWlCLEtBQUs7QUFBQSxNQUN4SCxDQUFDLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRDtBQUFBLEVBR0EsTUFBYyx5Q0FBd0Q7QUFDckUsU0FBSyxVQUFVLEtBQUssa0JBQWtCLFVBQVUsY0FBWSxLQUFLLGlCQUFpQixJQUFJLFFBQVEsQ0FBQyxDQUFDO0FBQ2hHLFVBQU0sT0FBTyxNQUFNLEtBQUssWUFBWSxRQUFRLEtBQUsseUJBQXlCLHNCQUFzQjtBQUNoRyxlQUFXLGFBQWEsS0FBSyxZQUFZLENBQUMsR0FBRztBQUM1QyxVQUFJLFVBQVUsYUFBYTtBQUMxQixhQUFLLGlCQUFpQixJQUFJLFVBQVUsUUFBUTtBQUFBLE1BQzdDO0FBQUEsSUFDRDtBQUNBLFNBQUssVUFBVSxLQUFLLFlBQVksTUFBTSxLQUFLLHlCQUF5QixzQkFBc0IsQ0FBQztBQUMzRixTQUFLLFVBQVUsS0FBSyxZQUFZLGlCQUFpQixPQUFLLEtBQUssaUJBQWlCLENBQUMsQ0FBQyxDQUFDO0FBQUEsRUFDaEY7QUFBQSxFQUVBLE1BQWMsaUJBQWlCLEdBQW9DO0FBQ2xFLFFBQUksQ0FBQyxFQUFFLFFBQVEsS0FBSyx5QkFBeUIsd0JBQXdCLGVBQWUsS0FBSyxHQUFHO0FBQzNGO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBMkIsQ0FBQztBQUNsQyxlQUFXLFlBQVksRUFBRSxVQUFVO0FBRWxDLFVBQUksS0FBSyxpQkFBaUIsSUFBSSxRQUFRLEdBQUc7QUFDeEM7QUFBQSxNQUNEO0FBR0EsVUFBSSxDQUFDLEtBQUssbUJBQW1CLE9BQU8sUUFBUSxLQUFLLG1CQUFtQixPQUFPLFFBQVEsUUFBUSxHQUFHLEtBQUsseUJBQXlCLHNCQUFzQixHQUFHO0FBQ3BKO0FBQUEsTUFDRDtBQUdBLFVBQUksS0FBSyxtQkFBbUIsT0FBTyxRQUFRLFVBQVUsS0FBSyxtQkFBbUIsT0FBTyxTQUFTLEtBQUsseUJBQXlCLHdCQUF3QixXQUFXLENBQUMsR0FBRztBQUNqSztBQUFBLE1BQ0Q7QUFHQSxVQUFJLEtBQUssbUJBQW1CLE9BQU8sU0FBUyxRQUFRLEVBQUUsV0FBVyxHQUFHLEdBQUc7QUFDdEU7QUFBQSxNQUNEO0FBR0EsVUFBSSxLQUFLLG1CQUFtQixPQUFPLFNBQVMsUUFBUSxFQUFFLFNBQVMsc0JBQXNCLEdBQUc7QUFDdkY7QUFBQSxNQUNEO0FBRUEsVUFBSTtBQUVILFlBQUksRUFBRSxNQUFNLEtBQUssWUFBWSxLQUFLLFFBQVEsR0FBRyxhQUFhO0FBQ3pEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsU0FBUyxPQUFPO0FBQ2YsWUFBSSxzQkFBc0IsS0FBSyxNQUFNLG9CQUFvQixnQkFBZ0I7QUFDeEUsZUFBSyxXQUFXLE1BQU0sS0FBSztBQUFBLFFBQzVCO0FBQ0E7QUFBQSxNQUNEO0FBSUEsWUFBTSxZQUFZLE1BQU0sS0FBSyxrQkFBa0IsNEJBQTRCLFFBQVE7QUFDbkYsVUFBSSxhQUFhLFVBQVUsdUJBQXVCLFFBQVc7QUFDNUQsYUFBSyxpQkFBaUIsSUFBSSxRQUFRO0FBQ2xDLGNBQU0sS0FBSyxTQUFTO0FBQUEsTUFDckI7QUFBQSxJQUNEO0FBRUEsUUFBSSxNQUFNLFFBQVE7QUFDakIsWUFBTSxLQUFLLHVCQUF1QixNQUFNLElBQUksQ0FBQUMsT0FBSyxDQUFDQSxJQUFHLE1BQVMsQ0FBQyxHQUFHLEtBQUssd0JBQXdCLGVBQWUsa0JBQWtCO0FBQ2hJLFdBQUssV0FBVyxLQUFLLDREQUE0RCxNQUFNLElBQUksQ0FBQUEsT0FBS0EsR0FBRSxXQUFXLEVBQUUsQ0FBQztBQUFBLElBQ2pIO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyx1QkFBdUIsWUFBdUQsaUJBQXFDO0FBQ2hJLFVBQU0sa0JBQWtCLFdBQVcsSUFBSSxPQUFLLEVBQUUsQ0FBQyxDQUFDO0FBQ2hELFVBQU0sS0FBSyxrQkFBa0IsMEJBQTBCLEdBQUcsZ0JBQWdCLElBQUksZUFBYSxhQUFhLE9BQU8sU0FBUyxDQUFDLENBQUM7QUFDMUgsVUFBTSxLQUFLLGdDQUFnQyx1QkFBdUIsWUFBWSxlQUFlO0FBQzdGLFNBQUssd0JBQXdCLEtBQUssZ0JBQWdCLElBQUksWUFBVSxFQUFFLE9BQU8sWUFBWSxNQUFNLFlBQVksV0FBVyxpQkFBaUIsTUFBTSxnQkFBZ0IsRUFBRSxDQUFDO0FBQUEsRUFDN0o7QUFDRDtBQS9iYSw2QkFBTjtBQUFBLEVBU0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdkJVO0FBOGNOLElBQU0sb0JBQU4sY0FBZ0MsV0FBVztBQUFBLEVBV2pELFlBQ2tCLHlCQUNxQixvQkFDUCxhQUNhLDBCQUNPLGlDQUNiLG9CQUNGLGtCQUNGLGdCQUNTLHlCQUNiLFlBQzdCO0FBQ0QsVUFBTTtBQVhXO0FBQ3FCO0FBQ1A7QUFDYTtBQUNPO0FBQ2I7QUFDRjtBQUNGO0FBQ1M7QUFDYjtBQWhCL0IsU0FBaUIsYUFBYSxLQUFLLFVBQVUsSUFBSSxRQUFhLENBQUM7QUFDL0QsU0FBUyxZQUFZLEtBQUssV0FBVztBQUVyQyxTQUFRLDBCQUEwQixJQUFJLFlBQTBDO0FBQ2hGLFNBQVEsNEJBQTRCLElBQUksWUFBMEM7QUFlakYsU0FBSyxvQkFBb0IsU0FBUyxLQUFLLHlCQUF5Qix3QkFBd0IsV0FBVztBQUNuRyxTQUFLLHNCQUFzQixJQUFJLE1BQU07QUFBQSxFQUN0QztBQUFBLEVBRUEsTUFBTSxVQUF5QjtBQUM5QixVQUFNLEtBQUssZ0NBQWdDO0FBQzNDLFVBQU0sS0FBSyx1Q0FBdUM7QUFDbEQsVUFBTSxLQUFLLGlDQUFpQztBQUU1QyxVQUFNLEtBQUssd0JBQXdCO0FBQUEsRUFDcEM7QUFBQSxFQUVBLE1BQU0sZUFBZSxNQUE0QixpQkFBc0IsZ0JBQWlDLFVBQStDO0FBQ3RKLFFBQUk7QUFDSCxZQUFNLFdBQWdCLGdCQUFnQixLQUFLLEVBQUUsT0FBTyxTQUFTLENBQUM7QUFDOUQsWUFBTSxrQkFBNkMsRUFBRSxnQkFBZ0IsTUFBTSxpQkFBaUIsZ0JBQWdCLFNBQVM7QUFDckgsVUFBSSxvQkFBeUMsQ0FBQztBQUM5QyxVQUFJLFNBQVMsUUFBUSxTQUFTLGNBQWMsUUFBUTtBQUNuRCxZQUFJLDJCQUEyQixLQUFLLHdCQUF3QixJQUFJLFFBQVE7QUFDeEUsWUFBSSxDQUFDLDBCQUEwQjtBQUM5QixxQ0FBMkIsS0FBSyx5QkFBeUIsa0JBQWtCLEVBQUUsU0FBUyxHQUFHLGVBQWUsRUFDdEcsUUFBUSxNQUFNLEtBQUssd0JBQXdCLE9BQU8sUUFBUSxDQUFDO0FBQzdELGVBQUssd0JBQXdCLElBQUksVUFBVSx3QkFBd0I7QUFBQSxRQUNwRTtBQUNBLDBCQUFrQixLQUFLLEdBQUcsTUFBTSx3QkFBd0I7QUFBQSxNQUN6RCxXQUFXLFNBQVMsY0FBYyxNQUFNO0FBQ3ZDLFlBQUksNEJBQTRCLEtBQUssMEJBQTBCLElBQUksUUFBUTtBQUMzRSxZQUFJLENBQUMsMkJBQTJCO0FBQy9CLHNDQUE0QixLQUFLLHlCQUF5QixtQkFBbUIsZUFBZSxFQUMxRixRQUFRLE1BQU0sS0FBSywwQkFBMEIsT0FBTyxRQUFRLENBQUM7QUFDL0QsZUFBSywwQkFBMEIsSUFBSSxVQUFVLHlCQUF5QjtBQUFBLFFBQ3ZFO0FBQ0EsMEJBQWtCLEtBQUssR0FBRyxNQUFNLHlCQUF5QjtBQUFBLE1BQzFEO0FBQ0EsMEJBQW9CLFNBQVMsT0FBTyxrQkFBa0IsT0FBTyxPQUFLLEVBQUUsU0FBUyxJQUFJLElBQUk7QUFDckYsYUFBTyxNQUFNLFFBQVEsSUFBSSxrQkFBa0IsSUFBSSxlQUFhLEtBQUssaUJBQWlCLFNBQVMsQ0FBQyxDQUFDO0FBQUEsSUFDOUYsU0FBUyxPQUFPO0FBQ2YsWUFBTSwyQkFBMkIsT0FBTyw2QkFBNkIsUUFBUTtBQUFBLElBQzlFO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSx3QkFBb0Q7QUFDekQsUUFBSTtBQUNILFlBQU0sb0JBQW9CLE1BQU0sS0FBSyx5QkFBeUIsc0JBQXNCO0FBQ3BGLGFBQU8sTUFBTSxRQUFRLElBQUksa0JBQWtCLElBQUksZUFBYSxLQUFLLGlCQUFpQixTQUFTLENBQUMsQ0FBQztBQUFBLElBQzlGLFNBQVMsT0FBTztBQUNmLFlBQU0sMkJBQTJCLE9BQU8sNkJBQTZCLFFBQVE7QUFBQSxJQUM5RTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sNEJBQTRCLFVBQWdEO0FBQ2pGLFFBQUk7QUFDSCxZQUFNLG1CQUFtQixNQUFNLEtBQUsseUJBQXlCLHNCQUFzQixVQUFVLGNBQWMsTUFBTSxFQUFFLGdCQUFnQixLQUFLLENBQUM7QUFDekksVUFBSSxrQkFBa0I7QUFDckIsZUFBTyxNQUFNLEtBQUssaUJBQWlCLGdCQUFnQjtBQUFBLE1BQ3BEO0FBQUEsSUFDRCxTQUFTLE9BQU87QUFDZixXQUFLLFdBQVcsTUFBTSxLQUFLO0FBQUEsSUFDNUI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxxQkFBcUIsY0FBNEIsU0FBaUIsZ0JBQXlCLE9BQW9EO0FBQ3BKLFVBQU0sYUFBYSxhQUFhLFNBQVM7QUFDekMsVUFBTSxlQUFlLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyx5QkFBeUIsdUJBQXVCLFFBQVEsSUFBSSxhQUFhLENBQUMsRUFBRSxDQUFDO0FBQzFILFVBQU0sb0JBQW9CLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyx5QkFBeUIsdUJBQXVCLFFBQVEsVUFBVSxDQUFDO0FBRXJILFFBQUksTUFBTSxLQUFLLFlBQVksT0FBTyxpQkFBaUIsR0FBRztBQUNyRCxVQUFJLENBQUMsZ0JBQWdCO0FBQ3BCLFlBQUk7QUFDSCxpQkFBTyxNQUFNLEtBQUssbUJBQW1CLG1CQUFtQixjQUFjLElBQUk7QUFBQSxRQUMzRSxTQUFTLE9BQU87QUFDZixlQUFLLFdBQVcsS0FBSyxrREFBa0Qsa0JBQWtCLElBQUksd0RBQXdELGdCQUFnQixLQUFLLENBQUM7QUFBQSxRQUM1SztBQUFBLE1BQ0Q7QUFFQSxVQUFJO0FBQ0gsY0FBTSxLQUFLLDRCQUE0QixhQUFhLElBQUksbUJBQW1CLGdCQUFnQjtBQUFBLE1BQzVGLFNBQVMsT0FBTztBQUNmLGNBQU0sSUFBSSx5QkFBeUIsSUFBSSxTQUFTLGlCQUFpQixvSUFBb0ksa0JBQWtCLFFBQVEsYUFBYSxFQUFFLEdBQUcsNkJBQTZCLE1BQU07QUFBQSxNQUNyUjtBQUFBLElBQ0Q7QUFFQSxRQUFJO0FBQ0gsVUFBSSxNQUFNLHlCQUF5QjtBQUNsQyxjQUFNLElBQUksa0JBQWtCO0FBQUEsTUFDN0I7QUFHQSxVQUFJO0FBQ0gsYUFBSyxXQUFXLE1BQU0seUNBQXlDLE9BQU8sT0FBTyxrQkFBa0IsTUFBTSxFQUFFO0FBQ3ZHLGNBQU0sUUFBUSxTQUFTLGFBQWEsUUFBUSxFQUFFLFlBQVksYUFBYSxXQUFXLEtBQUssR0FBRyxLQUFLO0FBQy9GLGFBQUssV0FBVyxLQUFLLDBCQUEwQixpQkFBaUIsS0FBSyxhQUFhLEVBQUU7QUFBQSxNQUNyRixTQUFTLEdBQUc7QUFDWCxjQUFNLGlCQUFpQixDQUFDO0FBQUEsTUFDekI7QUFFQSxZQUFNLFdBQTZCLEVBQUUsb0JBQW9CLEtBQUssSUFBSSxHQUFHLGdCQUFnQixhQUFhLGVBQWU7QUFDakgsVUFBSTtBQUNILGlCQUFTLE9BQU8sTUFBTSxZQUFZLGNBQWMsS0FBSyxXQUFXO0FBQUEsTUFDakUsU0FBUyxPQUFPO0FBRWYsYUFBSyxXQUFXLEtBQUssNkRBQTZELGFBQWEsTUFBTSxJQUFJLGdCQUFnQixLQUFLLENBQUM7QUFBQSxNQUNoSTtBQUVBLFVBQUk7QUFDSCxjQUFNLEtBQUsseUJBQXlCLHVCQUF1QixjQUFjLFFBQVE7QUFBQSxNQUNsRixTQUFTLE9BQU87QUFDZixhQUFLLGlCQUFpQixXQUF3RSxxQkFBcUIsRUFBRSxhQUFhLGFBQWEsSUFBSSxNQUFNLEdBQUcsc0JBQXNCLEtBQUssQ0FBQyxHQUFHLENBQUM7QUFDNUwsY0FBTSwyQkFBMkIsT0FBTyw2QkFBNkIsY0FBYztBQUFBLE1BQ3BGO0FBRUEsVUFBSSxNQUFNLHlCQUF5QjtBQUNsQyxjQUFNLElBQUksa0JBQWtCO0FBQUEsTUFDN0I7QUFHQSxVQUFJO0FBQ0gsYUFBSyxXQUFXLE1BQU0sdUNBQXVDLGFBQWEsTUFBTSxPQUFPLGtCQUFrQixNQUFNLEVBQUU7QUFDakgsY0FBTSxLQUFLLE9BQU8sYUFBYSxRQUFRLGtCQUFrQixNQUFNO0FBQy9ELGFBQUssV0FBVyxLQUFLLGNBQWMsa0JBQWtCLE1BQU07QUFBQSxNQUM1RCxTQUFTLE9BQU87QUFDZixZQUFJLE1BQU0sU0FBUyxhQUFhO0FBQy9CLGVBQUssV0FBVyxLQUFLLDBGQUEwRixhQUFhLEVBQUU7QUFDOUgsY0FBSTtBQUFFLGtCQUFNLEtBQUssWUFBWSxJQUFJLGNBQWMsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUFBLFVBQUcsU0FBUyxHQUFHO0FBQUEsVUFBZTtBQUFBLFFBQ2pHLE9BQU87QUFDTixlQUFLLFdBQVcsS0FBSyw0QkFBNEIsZ0JBQWdCLEtBQUssQ0FBQyxxQ0FBcUMsWUFBWTtBQUN4SCxnQkFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNEO0FBRUEsV0FBSyxXQUFXLEtBQUssaUJBQWlCO0FBQUEsSUFFdkMsU0FBUyxPQUFPO0FBQ2YsVUFBSTtBQUFFLGNBQU0sS0FBSyxZQUFZLElBQUksY0FBYyxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQUEsTUFBRyxTQUFTLEdBQUc7QUFBQSxNQUFlO0FBQ2hHLFlBQU07QUFBQSxJQUNQO0FBRUEsV0FBTyxLQUFLLG1CQUFtQixtQkFBbUIsY0FBYyxJQUFJO0FBQUEsRUFDckU7QUFBQSxFQUVBLE1BQU0sYUFBYSxPQUF3QixpQkFBcUQ7QUFDL0YsVUFBTSxZQUFZLE1BQU0sS0FBSyxvQkFBb0IsT0FBTyxlQUFlO0FBQ3ZFLFdBQU8sV0FBVztBQUFBLEVBQ25CO0FBQUEsRUFFQSxNQUFjLG9CQUFvQixPQUF3QixpQkFBcUU7QUFDOUgsVUFBTSxhQUFhLE1BQU0sS0FBSyxnQ0FBZ0Msc0JBQXNCLGVBQWU7QUFDbkcsV0FBTyxXQUFXLEtBQUssT0FBSyxrQkFBa0IsRUFBRSxZQUFZLE1BQU0sVUFBVSxDQUFDO0FBQUEsRUFDOUU7QUFBQSxFQUVBLE1BQU0sZUFBZSxPQUF3QixVQUE2QixpQkFBZ0Q7QUFDekgsUUFBSTtBQUNILFlBQU0sS0FBSyxnQ0FBZ0MsZUFBZSxDQUFDLENBQUMsT0FBTyxRQUFRLENBQUMsR0FBRyxlQUFlO0FBQUEsSUFDL0YsU0FBUyxPQUFPO0FBQ2YsV0FBSyxpQkFBaUIsV0FBd0UscUJBQXFCLEVBQUUsYUFBYSxNQUFNLFdBQVcsSUFBSSxNQUFNLEdBQUcsc0JBQXNCLEtBQUssQ0FBQyxJQUFJLFdBQVcsQ0FBQyxDQUFDLGdCQUFnQixDQUFDO0FBQzlOLFlBQU0sMkJBQTJCLE9BQU8sNkJBQTZCLGNBQWM7QUFBQSxJQUNwRjtBQUNBLFdBQU8sS0FBSyxtQkFBbUIsTUFBTSxVQUFVLE1BQU0sTUFBTSxlQUFlO0FBQUEsRUFDM0U7QUFBQSxFQUVBLE1BQU0sMkJBQTJCLFlBQXlDO0FBQ3pFLFVBQU0scUJBQXFCLENBQUM7QUFDNUIsZUFBVyxhQUFhLFlBQVk7QUFDbkMsVUFBSSxNQUFNLEtBQUssWUFBWSxPQUFPLFVBQVUsUUFBUSxHQUFHO0FBQ3RELDJCQUFtQixLQUFLLFNBQVM7QUFBQSxNQUNsQztBQUFBLElBQ0Q7QUFDQSxVQUFNLGdCQUFnQyxtQkFBbUIsSUFBSSxPQUFLLGFBQWEsT0FBTyxDQUFDLENBQUM7QUFDeEYsVUFBTSxLQUFLLHNCQUFzQix1QkFDaEMsY0FBYyxRQUFRLGtCQUFnQjtBQUNyQyx3QkFBa0IsYUFBYSxTQUFTLENBQUMsSUFBSTtBQUM3QyxXQUFLLFdBQVcsS0FBSywrQkFBK0IsYUFBYSxTQUFTLENBQUM7QUFBQSxJQUM1RSxDQUFDLENBQUM7QUFBQSxFQUNKO0FBQUEsRUFFQSxNQUFNLDZCQUE2QixlQUFtRDtBQUNyRixRQUFJO0FBQ0gsWUFBTSxVQUFxQixDQUFDO0FBQzVCLFlBQU0sS0FBSyxzQkFBc0IsdUJBQ2hDLGNBQWMsUUFBUSxrQkFBZ0I7QUFDckMsWUFBSSxrQkFBa0IsYUFBYSxTQUFTLENBQUMsR0FBRztBQUMvQyxrQkFBUSxLQUFLLElBQUk7QUFDakIsaUJBQU8sa0JBQWtCLGFBQWEsU0FBUyxDQUFDO0FBQUEsUUFDakQsT0FBTztBQUNOLGtCQUFRLEtBQUssS0FBSztBQUFBLFFBQ25CO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFDSCxhQUFPO0FBQUEsSUFDUixTQUFTLE9BQU87QUFDZixZQUFNLDJCQUEyQixPQUFPLDZCQUE2QixZQUFZO0FBQUEsSUFDbEY7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLGdCQUFnQixXQUFnRCxNQUE2QjtBQUNsRyxRQUFJLEtBQUssbUJBQW1CLE9BQU8sZ0JBQWdCLFVBQVUsVUFBVSxLQUFLLHlCQUF5QixzQkFBc0IsR0FBRztBQUM3SCxZQUFNLEtBQUssNEJBQTRCLFVBQVUsV0FBVyxJQUFJLFVBQVUsVUFBVSxJQUFJO0FBQ3hGLFlBQU0sS0FBSywwQkFBMEIsYUFBYSxPQUFPLFNBQVMsQ0FBQztBQUFBLElBQ3BFO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxjQUFjLFdBQTRCLHFCQUEwQixtQkFBd0IsVUFBdUQ7QUFDeEosVUFBTSxTQUFTLE1BQU0sS0FBSyxvQkFBb0IsV0FBVyxtQkFBbUI7QUFDNUUsVUFBTSxTQUFTLE1BQU0sS0FBSyxvQkFBb0IsV0FBVyxpQkFBaUI7QUFDMUUsZUFBVyxFQUFFLEdBQUcsUUFBUSxVQUFVLEdBQUcsU0FBUztBQUU5QyxRQUFJLFFBQVE7QUFDWCxVQUFJLEtBQUssbUJBQW1CLE9BQU8sUUFBUSxPQUFPLFVBQVUsVUFBVSxRQUFRLEdBQUc7QUFDaEYsY0FBTSxLQUFLLGdDQUFnQyxlQUFlLENBQUMsQ0FBQyxXQUFXLEVBQUUsR0FBRyxPQUFPLFVBQVUsR0FBRyxTQUFTLENBQUMsQ0FBQyxHQUFHLGlCQUFpQjtBQUFBLE1BQ2hJLE9BQU87QUFDTixjQUFNLGtCQUFrQixNQUFNLEtBQUssbUJBQW1CLE9BQU8sVUFBVSxVQUFVLE1BQU0saUJBQWlCO0FBQ3hHLGNBQU0sS0FBSyxnQ0FBZ0MsNEJBQTRCLENBQUMsZ0JBQWdCLFVBQVUsR0FBRyxpQkFBaUI7QUFDdEgsY0FBTSxLQUFLLGdDQUFnQyx1QkFBdUIsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLE9BQU8sVUFBVSxHQUFHLFNBQVMsQ0FBQyxDQUFDLEdBQUcsaUJBQWlCO0FBQUEsTUFDeEk7QUFBQSxJQUNELE9BQU87QUFDTixZQUFNLEtBQUssZ0NBQWdDLHVCQUF1QixDQUFDLENBQUMsV0FBVyxRQUFRLENBQUMsR0FBRyxpQkFBaUI7QUFBQSxJQUM3RztBQUVBLFdBQU8sS0FBSyxtQkFBbUIsVUFBVSxVQUFVLFVBQVUsTUFBTSxpQkFBaUI7QUFBQSxFQUNyRjtBQUFBLEVBRUEsTUFBTSxjQUFjLFdBQTRCLHFCQUEwQixtQkFBd0IsVUFBdUQ7QUFDeEosVUFBTSxTQUFTLE1BQU0sS0FBSyxvQkFBb0IsV0FBVyxtQkFBbUI7QUFDNUUsVUFBTSxTQUFTLE1BQU0sS0FBSyxvQkFBb0IsV0FBVyxpQkFBaUI7QUFDMUUsZUFBVyxFQUFFLEdBQUcsUUFBUSxVQUFVLEdBQUcsU0FBUztBQUU5QyxRQUFJLFFBQVE7QUFDWCxVQUFJLEtBQUssbUJBQW1CLE9BQU8sUUFBUSxPQUFPLFVBQVUsVUFBVSxRQUFRLEdBQUc7QUFDaEYsY0FBTSxLQUFLLGdDQUFnQyxlQUFlLENBQUMsQ0FBQyxXQUFXLEVBQUUsR0FBRyxPQUFPLFVBQVUsR0FBRyxTQUFTLENBQUMsQ0FBQyxHQUFHLGlCQUFpQjtBQUFBLE1BQ2hJLE9BQU87QUFDTixjQUFNLGtCQUFrQixNQUFNLEtBQUssbUJBQW1CLE9BQU8sVUFBVSxVQUFVLE1BQU0saUJBQWlCO0FBQ3hHLGNBQU0sS0FBSyxnQkFBZ0IsZ0JBQWdCLFlBQVksaUJBQWlCO0FBQ3hFLGNBQU0sS0FBSyxnQ0FBZ0MsdUJBQXVCLENBQUMsQ0FBQyxXQUFXLEVBQUUsR0FBRyxPQUFPLFVBQVUsR0FBRyxTQUFTLENBQUMsQ0FBQyxHQUFHLGlCQUFpQjtBQUFBLE1BQ3hJO0FBQUEsSUFDRCxPQUFPO0FBQ04sWUFBTSxLQUFLLGdDQUFnQyx1QkFBdUIsQ0FBQyxDQUFDLFdBQVcsUUFBUSxDQUFDLEdBQUcsaUJBQWlCO0FBQzVHLFVBQUksUUFBUTtBQUNYLGNBQU0sS0FBSyxnQkFBZ0IsT0FBTyxZQUFZLG1CQUFtQjtBQUFBLE1BQ2xFO0FBQUEsSUFDRDtBQUVBLFdBQU8sS0FBSyxtQkFBbUIsVUFBVSxVQUFVLFVBQVUsTUFBTSxpQkFBaUI7QUFBQSxFQUNyRjtBQUFBLEVBRUEsTUFBTSxnQkFBZ0IsWUFBa0MscUJBQXlDO0FBQ2hHLFVBQU0sS0FBSyxnQ0FBZ0MsNEJBQTRCLENBQUMsVUFBVSxHQUFHLG1CQUFtQjtBQUFBLEVBQ3pHO0FBQUEsRUFFQSxNQUFNLGVBQWUscUJBQTBCLG1CQUF3QixnQkFBZ0Q7QUFDdEgsVUFBTSxpQkFBaUIsTUFBTSxLQUFLLGVBQWUsY0FBYyxNQUFNLHFCQUFxQixjQUFjO0FBQ3hHLFVBQU0sYUFBd0QsTUFBTSxRQUFRLElBQUksZUFDOUUsT0FBTyxPQUFLLENBQUMsRUFBRSxtQkFBbUIsRUFDbEMsSUFBSSxPQUFNLE1BQU0sQ0FBQyxHQUFHLE1BQU0sS0FBSyxhQUFhLEdBQUcsbUJBQW1CLENBQUMsQ0FBRSxDQUFDO0FBQ3hFLFVBQU0sS0FBSyxnQ0FBZ0MsdUJBQXVCLFlBQVksaUJBQWlCO0FBQUEsRUFDaEc7QUFBQSxFQUVBLE1BQWMsNEJBQTRCLElBQVksVUFBZSxNQUE2QjtBQUNqRyxTQUFLLFdBQVcsTUFBTSxZQUFZLElBQUksd0JBQXdCLElBQUksU0FBUyxNQUFNO0FBQ2pGLFVBQU0sa0JBQWtCLEtBQUssbUJBQW1CLE9BQU8sU0FBUyxLQUFLLG1CQUFtQixPQUFPLFFBQVEsUUFBUSxHQUFHLEdBQUcsS0FBSyxtQkFBbUIsT0FBTyxTQUFTLFFBQVEsQ0FBQyxJQUFJLEtBQUssYUFBYSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsR0FBRyxzQkFBc0IsRUFBRTtBQUN0TyxVQUFNLEtBQUssT0FBTyxTQUFTLFFBQVEsZ0JBQWdCLE1BQU07QUFDekQsVUFBTSxLQUFLLFlBQVksSUFBSSxpQkFBaUIsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUMvRCxTQUFLLFdBQVcsS0FBSyxXQUFXLElBQUksd0JBQXdCLElBQUksU0FBUyxNQUFNO0FBQUEsRUFDaEY7QUFBQSxFQUVRLHNCQUFzQixVQUErRjtBQUM1SCxXQUFPLEtBQUssb0JBQW9CLE1BQU0sWUFBWTtBQUNqRCxVQUFJO0FBQ0osVUFBSTtBQUNILGNBQU0sVUFBVSxNQUFNLEtBQUssWUFBWSxTQUFTLEtBQUssbUJBQW1CLE1BQU07QUFDOUUsY0FBTSxRQUFRLE1BQU0sU0FBUztBQUFBLE1BQzlCLFNBQVMsT0FBTztBQUNmLFlBQUksc0JBQXNCLEtBQUssTUFBTSxvQkFBb0IsZ0JBQWdCO0FBQ3hFLGdCQUFNO0FBQUEsUUFDUDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLFVBQVUsQ0FBQztBQUNmLFVBQUksS0FBSztBQUNSLFlBQUk7QUFDSCxvQkFBVSxLQUFLLE1BQU0sR0FBRztBQUFBLFFBQ3pCLFNBQVMsR0FBRztBQUFBLFFBQWU7QUFBQSxNQUM1QjtBQUVBLFVBQUksVUFBVTtBQUNiLGlCQUFTLE9BQU87QUFDaEIsWUFBSSxPQUFPLEtBQUssT0FBTyxFQUFFLFFBQVE7QUFDaEMsZ0JBQU0sS0FBSyxZQUFZLFVBQVUsS0FBSyxtQkFBbUIsU0FBUyxXQUFXLEtBQUssVUFBVSxPQUFPLENBQUMsQ0FBQztBQUFBLFFBQ3RHLE9BQU87QUFDTixjQUFJO0FBQ0gsa0JBQU0sS0FBSyxZQUFZLElBQUksS0FBSyxpQkFBaUI7QUFBQSxVQUNsRCxTQUFTLE9BQU87QUFDZixnQkFBSSxzQkFBc0IsS0FBSyxNQUFNLG9CQUFvQixnQkFBZ0I7QUFDeEUsb0JBQU07QUFBQSxZQUNQO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsT0FBTyxhQUFxQixZQUFtQztBQUM1RSxRQUFJO0FBQ0gsWUFBTSxJQUFJLFNBQVM7QUFBQSxRQUFPO0FBQUEsUUFBYTtBQUFBLFFBQVksSUFBSSxLQUFLO0FBQUE7QUFBQSxNQUE4QjtBQUFBLElBQzNGLFNBQVMsT0FBTztBQUNmLFlBQU0sMkJBQTJCLE9BQU8sNkJBQTZCLE1BQU07QUFBQSxJQUM1RTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sbUJBQW1CLFVBQWUsTUFBcUIsaUJBQWlEO0FBQzdHLFFBQUk7QUFDSCxVQUFJLGlCQUFpQjtBQUNwQixjQUFNLG9CQUFvQixNQUFNLEtBQUsseUJBQXlCLG1CQUFtQixFQUFFLGdCQUFnQixDQUFDO0FBQ3BHLGNBQU0sbUJBQW1CLGtCQUFrQixLQUFLLE9BQUssS0FBSyxtQkFBbUIsT0FBTyxRQUFRLEVBQUUsVUFBVSxRQUFRLENBQUM7QUFDakgsWUFBSSxrQkFBa0I7QUFDckIsaUJBQU8sTUFBTSxLQUFLLGlCQUFpQixnQkFBZ0I7QUFBQSxRQUNwRDtBQUFBLE1BQ0QsT0FBTztBQUNOLGNBQU0sbUJBQW1CLE1BQU0sS0FBSyx5QkFBeUIsc0JBQXNCLFVBQVUsTUFBTSxFQUFFLGdCQUFnQixLQUFLLENBQUM7QUFDM0gsWUFBSSxrQkFBa0I7QUFDckIsaUJBQU8sTUFBTSxLQUFLLGlCQUFpQixnQkFBZ0I7QUFBQSxRQUNwRDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLElBQUkseUJBQXlCLElBQUksU0FBUyxlQUFlLHNDQUFzQyxTQUFTLElBQUksR0FBRyw2QkFBNkIsaUJBQWlCO0FBQUEsSUFDcEssU0FBUyxPQUFPO0FBQ2YsWUFBTSwyQkFBMkIsT0FBTyw2QkFBNkIsaUJBQWlCO0FBQUEsSUFDdkY7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGlCQUFpQixXQUF3RDtBQUN0RixRQUFJO0FBQ0osUUFBSTtBQUNILGFBQU8sTUFBTSxLQUFLLFlBQVksUUFBUSxVQUFVLFFBQVE7QUFBQSxJQUN6RCxTQUFTLE9BQU87QUFBQSxJQUFjO0FBRTlCLFFBQUk7QUFDSixRQUFJO0FBQ0osUUFBSSxNQUFNLFVBQVU7QUFDbkIsa0JBQVksS0FBSyxTQUFTLEtBQUssQ0FBQyxFQUFFLEtBQUssTUFBTSx5QkFBeUIsS0FBSyxJQUFJLENBQUMsR0FBRztBQUNuRixxQkFBZSxLQUFLLFNBQVMsS0FBSyxDQUFDLEVBQUUsS0FBSyxNQUFNLDRCQUE0QixLQUFLLElBQUksQ0FBQyxHQUFHO0FBQUEsSUFDMUY7QUFDQSxXQUFPO0FBQUEsTUFDTixZQUFZLFVBQVU7QUFBQSxNQUN0QixNQUFNLFVBQVU7QUFBQSxNQUNoQixXQUFXLFVBQVUsYUFBYSxDQUFDLENBQUMsVUFBVSxVQUFVO0FBQUEsTUFDeEQsVUFBVSxVQUFVO0FBQUEsTUFDcEIsVUFBVSxVQUFVO0FBQUEsTUFDcEIsZ0JBQWdCLFVBQVU7QUFBQSxNQUMxQixhQUFhLFVBQVU7QUFBQSxNQUN2QixTQUFTLFVBQVU7QUFBQSxNQUNuQjtBQUFBLE1BQ0E7QUFBQSxNQUNBLHNCQUFzQixVQUFVLFVBQVU7QUFBQSxNQUMxQyxhQUFhLFVBQVUsVUFBVSxlQUFlO0FBQUEsTUFDaEQscUJBQXFCLENBQUMsQ0FBQyxVQUFVLFVBQVU7QUFBQSxNQUMzQyxpQkFBaUIsQ0FBQyxDQUFDLFVBQVUsVUFBVTtBQUFBLE1BQ3ZDLHFCQUFxQixDQUFDLENBQUMsVUFBVSxVQUFVO0FBQUEsTUFDM0Msc0JBQXNCLENBQUMsQ0FBQyxVQUFVLFVBQVU7QUFBQSxNQUM1QyxZQUFZLFVBQVU7QUFBQSxNQUN0QixvQkFBb0IsVUFBVSxVQUFVO0FBQUEsTUFDeEMsU0FBUyxDQUFDLENBQUMsVUFBVSxVQUFVO0FBQUEsTUFDL0IsUUFBUSxDQUFDLENBQUMsVUFBVSxVQUFVO0FBQUEsTUFDOUIsaUJBQWlCLFVBQVU7QUFBQSxNQUMzQixTQUFTLENBQUMsQ0FBQyxVQUFVLFVBQVU7QUFBQSxNQUMvQixtQkFBbUI7QUFBQSxNQUNuQixRQUFRLFVBQVUsVUFBVSxXQUFXLFVBQVUsV0FBVyxPQUFPLFlBQVk7QUFBQSxNQUMvRSxNQUFNLFVBQVUsVUFBVSxRQUFRO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLDBCQUF5QztBQUN0RCxVQUFNLGFBQWEsTUFBTSxLQUFLLHlCQUF5QixzQkFBc0I7QUFDN0UsVUFBTSxRQUFRLElBQUksV0FBVyxJQUFJLE9BQU0sY0FBYTtBQUVuRCxVQUFJLFVBQVUsVUFBVSxVQUFVLGtCQUFrQixLQUFLLFlBQVksVUFBVSxVQUFVLElBQUksR0FBRztBQUMvRixjQUFNLE9BQU8sTUFBTSxZQUFZLFVBQVUsVUFBVSxLQUFLLFdBQVc7QUFDbkUsY0FBTSxLQUFLLHlCQUF5Qix1QkFBdUIsVUFBVSxVQUFVLEVBQUUsS0FBSyxDQUFDO0FBQUEsTUFDeEY7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLE1BQWMseUNBQXdEO0FBQ3JFLFFBQUksS0FBSyxtQkFBbUIsMkJBQTJCO0FBQ3REO0FBQUEsSUFDRDtBQUNBLFVBQU0sb0JBQW9CLE1BQU0sS0FBSyx5QkFBeUIscUJBQXFCLENBQUMsQ0FBQztBQUNyRixVQUFNLGlCQUFpQixNQUFNLEtBQUsseUJBQXlCLHNCQUFzQjtBQUNqRixVQUFNLGtCQUFrQixlQUFlLE9BQU8sbUJBQWlCO0FBQzlELFVBQUksQ0FBQyxLQUFLLGVBQWUsd0NBQXdDLEtBQUssUUFBTSxHQUFHLFlBQVksTUFBTSxjQUFjLFdBQVcsR0FBRyxZQUFZLENBQUMsR0FBRztBQUM1SSxlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sbUJBQW1CLGtCQUFrQixLQUFLLE9BQUssa0JBQWtCLEVBQUUsWUFBWSxjQUFjLFVBQVUsQ0FBQztBQUM5RyxhQUFPLG9CQUFvQixPQUFPLEdBQUcsY0FBYyxTQUFTLFNBQVMsaUJBQWlCLFNBQVMsT0FBTztBQUFBLElBQ3ZHLENBQUM7QUFDRCxRQUFJLGdCQUFnQixRQUFRO0FBQzNCLFdBQUssV0FBVyxLQUFLLGtEQUFrRCxnQkFBZ0IsSUFBSSxPQUFLLEdBQUcsRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLFNBQVMsT0FBTyxFQUFFLEVBQUUsS0FBSyxJQUFJLENBQUM7QUFDdEosWUFBTSxLQUFLLGdDQUFnQyw0QkFBNEIsZ0JBQWdCLElBQUksT0FBSyxFQUFFLFVBQVUsR0FBRyxLQUFLLHdCQUF3QixlQUFlLGtCQUFrQjtBQUM3SyxZQUFNLFFBQVEsV0FBVyxnQkFBZ0IsSUFBSSxPQUFLLEtBQUssZ0JBQWdCLEdBQUcsMkJBQTJCLENBQUMsQ0FBQztBQUFBLElBQ3hHO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxtQ0FBa0Q7QUFDL0QsUUFBSTtBQUNKLFFBQUk7QUFDSCxnQkFBVSxNQUFNLEtBQUssc0JBQXNCO0FBQUEsSUFDNUMsU0FBUyxPQUFPO0FBQ2YsWUFBTSwyQkFBMkIsT0FBTyw2QkFBNkIsV0FBVztBQUFBLElBQ2pGO0FBRUEsUUFBSSxPQUFPLEtBQUssT0FBTyxFQUFFLFdBQVcsR0FBRztBQUN0QyxXQUFLLFdBQVcsTUFBTSxzQ0FBc0M7QUFDNUQ7QUFBQSxJQUNEO0FBRUEsU0FBSyxXQUFXLE1BQU0sMENBQTBDLE9BQU8sS0FBSyxPQUFPLENBQUM7QUFFcEYsVUFBTSxhQUFhLE1BQU0sS0FBSyxzQkFBc0I7QUFDcEQsVUFBTSxZQUF5QixvQkFBSSxJQUFZO0FBQy9DLGVBQVcsS0FBSyxZQUFZO0FBQzNCLFVBQUksQ0FBQyxRQUFRLGFBQWEsT0FBTyxDQUFDLEVBQUUsU0FBUyxDQUFDLEdBQUc7QUFDaEQsa0JBQVUsSUFBSSxFQUFFLFdBQVcsR0FBRyxZQUFZLENBQUM7QUFBQSxNQUM1QztBQUFBLElBQ0Q7QUFFQSxRQUFJO0FBRUgsWUFBTSxjQUFjLGlCQUFpQixZQUFZLE9BQUssRUFBRSxVQUFVO0FBQ2xFLFlBQU0sU0FBUyxRQUFRLFlBQVksSUFBSSxPQUFNLE1BQUs7QUFDakQsY0FBTSxTQUFTLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxPQUFPLFNBQVMsRUFBRSxTQUFTLFNBQVMsRUFBRSxTQUFTLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFDMUYsWUFBSSxDQUFDLFVBQVUsSUFBSSxPQUFPLFdBQVcsR0FBRyxZQUFZLENBQUMsR0FBRztBQUN2RCxnQkFBTSxLQUFLLHdCQUF3QixNQUFNO0FBQUEsUUFDMUM7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0gsU0FBUyxPQUFPO0FBQ2YsV0FBSyxXQUFXLE1BQU0sS0FBSztBQUFBLElBQzVCO0FBRUEsVUFBTSxXQUFXLFdBQVcsT0FBTyxPQUFLLEVBQUUsc0JBQWdELFFBQVEsYUFBYSxPQUFPLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUNwSSxVQUFNLFFBQVEsV0FBVyxTQUFTLElBQUksT0FBSyxLQUFLLGdCQUFnQixHQUFHLG9CQUFvQixDQUFDLENBQUM7QUFBQSxFQUMxRjtBQUFBLEVBRUEsTUFBYyxrQ0FBaUQ7QUFDOUQsU0FBSyxXQUFXLE1BQU0sb0RBQW9EO0FBRTFFLFFBQUk7QUFDSixRQUFJO0FBQ0gsYUFBTyxNQUFNLEtBQUssWUFBWSxRQUFRLEtBQUsseUJBQXlCLHNCQUFzQjtBQUFBLElBQzNGLFNBQVMsT0FBTztBQUNmLFVBQUksc0JBQXNCLEtBQUssTUFBTSxvQkFBb0IsZ0JBQWdCO0FBQ3hFLGFBQUssV0FBVyxNQUFNLEtBQUs7QUFBQSxNQUM1QjtBQUNBO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxNQUFNLFVBQVU7QUFDcEI7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNILFlBQU0sUUFBUSxXQUFXLEtBQUssU0FBUyxJQUFJLE9BQU0sVUFBUztBQUN6RCxZQUFJLENBQUMsTUFBTSxlQUFlLENBQUMsTUFBTSxLQUFLLFNBQVMsc0JBQXNCLEdBQUc7QUFDdkU7QUFBQSxRQUNEO0FBQ0EsYUFBSyxXQUFXLE1BQU0sMkNBQTJDLE1BQU0sU0FBUyxTQUFTLENBQUM7QUFDMUYsWUFBSTtBQUNILGdCQUFNLEtBQUssWUFBWSxJQUFJLE1BQU0sVUFBVSxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQzlELGVBQUssV0FBVyxNQUFNLDBDQUEwQyxNQUFNLFNBQVMsU0FBUyxDQUFDO0FBQUEsUUFDMUYsU0FBUyxPQUFPO0FBQ2YsY0FBSSxzQkFBc0IsS0FBSyxNQUFNLG9CQUFvQixnQkFBZ0I7QUFDeEUsaUJBQUssV0FBVyxNQUFNLEtBQUs7QUFBQSxVQUM1QjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0gsU0FBUyxPQUFPO0FBQUEsSUFBZTtBQUFBLEVBQ2hDO0FBRUQ7QUFyZmEsb0JBQU47QUFBQSxFQWFKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXJCVTtBQXVmYixJQUFNLGdDQUFOLGNBQTRDLHNCQUF3RTtBQUFBLEVBVW5ILFlBQ2tCLGNBQ1IsVUFDQSxRQUNBLFNBQ1Esb0JBQ0EsbUJBQ3FCLG9CQUNLLGdCQUNBLHlCQUNDLDBCQUNPLGlDQUNqQixnQkFDSixZQUM3QjtBQUNELFVBQU07QUFkVztBQUNSO0FBQ0E7QUFDQTtBQUNRO0FBQ0E7QUFDcUI7QUFDSztBQUNBO0FBQ0M7QUFDTztBQUNqQjtBQUNKO0FBckIvQixTQUFRLGFBQWEsaUJBQWlCO0FBd0JyQyxTQUFLLGFBQWEsS0FBSyxhQUFhO0FBQUEsRUFDckM7QUFBQSxFQXhCQSxJQUFJLFlBQVk7QUFBRSxXQUFPLEtBQUssUUFBUSxhQUFhLEtBQUs7QUFBQSxFQUFZO0FBQUEsRUFHcEUsSUFBSSxxQkFBcUI7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFxQjtBQUFBLEVBdUI1RCxNQUFnQixNQUFNLE9BQW9EO0FBQ3pFLFVBQU0sWUFBWSxNQUFNLEtBQUssa0JBQWtCLGVBQWUsY0FBYyxNQUFNLEtBQUssUUFBUSxpQkFBaUIsS0FBSyxRQUFRLGNBQWM7QUFDM0ksVUFBTSxvQkFBb0IsVUFBVSxLQUFLLE9BQUssa0JBQWtCLEVBQUUsWUFBWSxLQUFLLFVBQVUsQ0FBQztBQUM5RixRQUFJLG1CQUFtQjtBQUN0QixXQUFLLGFBQWEsaUJBQWlCO0FBQUEsSUFDcEM7QUFFQSxVQUFNLFNBQVMsTUFBTSxLQUFLLGtCQUFrQixlQUFlLGNBQWMsUUFBUSxLQUFLLFFBQVEsaUJBQWlCLEtBQUssUUFBUSxjQUFjO0FBQzFJLFVBQU0sMEJBQTBCLE9BQU8sS0FBSyxPQUFLLGtCQUFrQixFQUFFLFlBQVksS0FBSyxVQUFVLENBQUM7QUFDakcsUUFBSSx5QkFBeUI7QUFDNUIsVUFBSSxDQUFDLHdCQUF3QixpQkFBaUI7QUFDN0MsY0FBTSxJQUFJLHlCQUF5QixJQUFJLFNBQVMscUJBQXFCLCtHQUErRyx3QkFBd0IsV0FBVyxJQUFJLEtBQUssZUFBZSxPQUFPLEdBQUcsNkJBQTZCLFlBQVk7QUFBQSxNQUNuUztBQUNBLFVBQUksT0FBTyxHQUFHLHdCQUF3QixTQUFTLFNBQVMsS0FBSyxTQUFTLE9BQU8sR0FBRztBQUMvRSxjQUFNLElBQUkseUJBQXlCLElBQUksU0FBUyxrQkFBa0IseUdBQXlHLHdCQUF3QixXQUFXLElBQUksd0JBQXdCLFNBQVMsU0FBUyxLQUFLLFNBQVMsT0FBTyxHQUFHLDZCQUE2QixZQUFZO0FBQUEsTUFDOVQ7QUFBQSxJQUNEO0FBRUEsVUFBTSxXQUFxQjtBQUFBLE1BQzFCLHFCQUFxQixLQUFLLFFBQVEsdUJBQXVCLG1CQUFtQjtBQUFBLE1BQzVFLGlCQUFpQixLQUFLLFFBQVEsbUJBQW1CLG1CQUFtQjtBQUFBLE1BQ3BFLFdBQVcsS0FBSyxRQUFRLGFBQWEsbUJBQW1CO0FBQUEsTUFDeEQsVUFBVSxtQkFBbUIsU0FBUyxjQUFjLFNBQVMsT0FBTztBQUFBLE1BQ3BFLG9CQUFvQixLQUFLLElBQUk7QUFBQSxNQUM3QixRQUFRLEtBQUssUUFBUSxzQkFBc0IsT0FBUSxLQUFLLFFBQVEsVUFBVSxtQkFBbUI7QUFBQSxNQUM3RixRQUFRLEtBQUssa0JBQWtCLE1BQU0sU0FBUztBQUFBLElBQy9DO0FBRUEsUUFBSTtBQUdKLFFBQUksS0FBSyxrQkFBa0IsS0FBSztBQUMvQixVQUFJLG1CQUFtQjtBQUN0QixZQUFJLEtBQUssYUFBYSxPQUFPLElBQUksYUFBYSxrQkFBa0IsWUFBWSxrQkFBa0IsU0FBUyxPQUFPLENBQUMsR0FBRztBQUNqSCxjQUFJO0FBQ0gsa0JBQU0sS0FBSyxrQkFBa0IsZ0JBQWdCLG1CQUFtQixVQUFVO0FBQUEsVUFDM0UsU0FBUyxHQUFHO0FBQ1gsa0JBQU0sSUFBSSxNQUFNLElBQUksU0FBUyxlQUFlLG1EQUFtRCxLQUFLLFNBQVMsZUFBZSxLQUFLLFNBQVMsSUFBSSxDQUFDO0FBQUEsVUFDaEo7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUlBLFlBQU0sMEJBQTBCLE1BQU0sS0FBSyxlQUFlLEtBQUssWUFBWTtBQUMzRSxVQUFJLHlCQUF5QjtBQUM1QixZQUFJO0FBQ0gsZ0JBQU0sS0FBSyxrQkFBa0IsZ0JBQWdCLHlCQUF5QixVQUFVO0FBQUEsUUFDakYsU0FBUyxHQUFHO0FBQ1gsZ0JBQU0sSUFBSSxNQUFNLElBQUksU0FBUyxlQUFlLG1EQUFtRCxLQUFLLFNBQVMsZUFBZSxLQUFLLFNBQVMsSUFBSSxDQUFDO0FBQUEsUUFDaEo7QUFBQSxNQUNEO0FBQUEsSUFFRCxPQUdLO0FBQ0osZUFBUyxLQUFLLEtBQUssT0FBTyxXQUFXO0FBQ3JDLGVBQVMsY0FBYyxLQUFLLE9BQU87QUFDbkMsZUFBUyx1QkFBdUIsS0FBSyxPQUFPO0FBQzVDLGVBQVMsaUJBQWlCLEtBQUssT0FBTyxXQUFXO0FBQ2pELGVBQVMsVUFBVSxDQUFDLENBQUM7QUFDckIsZUFBUyxVQUFVLEtBQUssT0FBTztBQUMvQixlQUFTLHNCQUFzQixLQUFLLE9BQU8sV0FBVztBQUN0RCxlQUFTLHVCQUF1QixtQkFBbUIsd0JBQXdCLEtBQUssT0FBTyxXQUFXO0FBQ2xHLGVBQVMsYUFBYSxVQUFVLEtBQUssUUFBUSxVQUFVLElBQ3BELEtBQUssUUFBUSxhQUNiLEtBQUssUUFBUSw0QkFBNEIsS0FBSyxPQUFPLFdBQVcsdUJBQXVCLG1CQUFtQjtBQUU3RyxVQUFJLHFCQUFxQixrQkFBa0IsU0FBUyxjQUFjLFVBQVUsa0JBQWtCLFNBQVMsWUFBWSxLQUFLLE9BQU8sU0FBUztBQUN2SSxlQUFPLEtBQUssa0JBQWtCLGVBQWUsbUJBQW1CLFVBQVUsS0FBSyxRQUFRLGVBQWU7QUFBQSxNQUN2RztBQUdBLGNBQVEsTUFBTSxLQUFLLGVBQWUsS0FBSyxZQUFZO0FBQUEsSUFDcEQ7QUFFQSxRQUFJLE1BQU0seUJBQXlCO0FBQ2xDLFlBQU0sMkJBQTJCLElBQUksa0JBQWtCLENBQUM7QUFBQSxJQUN6RDtBQUVBLFFBQUksQ0FBQyxPQUFPO0FBQ1gsWUFBTUMsVUFBUyxNQUFNLEtBQUssbUJBQW1CLEtBQUssV0FBVyxLQUFLO0FBQ2xFLGNBQVFBLFFBQU87QUFDZixXQUFLLHNCQUFzQkEsUUFBTztBQUFBLElBQ25DO0FBRUEsUUFBSSxLQUFLLG1CQUFtQixPQUFPLFFBQVEsS0FBSyx3QkFBd0IsZUFBZSxvQkFBb0IsS0FBSyxRQUFRLGVBQWUsR0FBRztBQUN6SSxVQUFJO0FBQ0gsY0FBTSxLQUFLLHlCQUF5QixtQ0FBbUM7QUFBQSxNQUN4RSxTQUFTLE9BQU87QUFDZixjQUFNLDJCQUEyQixPQUFPLDZCQUE2Qix1QkFBdUI7QUFBQSxNQUM3RjtBQUFBLElBQ0Q7QUFFQSxRQUFJLE1BQU0seUJBQXlCO0FBQ2xDLFlBQU0sMkJBQTJCLElBQUksa0JBQWtCLENBQUM7QUFBQSxJQUN6RDtBQUVBLFFBQUk7QUFDSCxZQUFNLEtBQUssZ0NBQWdDLHVCQUF1QixDQUFDLENBQUMsT0FBTyxRQUFRLENBQUMsR0FBRyxLQUFLLFFBQVEsaUJBQWlCLENBQUMsTUFBTSxPQUFPO0FBQUEsSUFDcEksU0FBUyxPQUFPO0FBQ2YsWUFBTSwyQkFBMkIsT0FBTyw2QkFBNkIsWUFBWTtBQUFBLElBQ2xGO0FBRUEsVUFBTSxTQUFTLE1BQU0sS0FBSyxrQkFBa0IsbUJBQW1CLE1BQU0sVUFBVSxjQUFjLE1BQU0sS0FBSyxRQUFRLGVBQWU7QUFDL0gsUUFBSSxDQUFDLFFBQVE7QUFDWixZQUFNLElBQUkseUJBQXlCLHVDQUF1Qyw2QkFBNkIsMEJBQTBCO0FBQUEsSUFDbEk7QUFFQSxRQUFJLEtBQUssa0JBQWtCLEtBQUs7QUFDL0IsV0FBSyxlQUFlLE9BQU8sS0FBSztBQUFBLElBQ2pDO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsZUFBZSxjQUFrRTtBQUU5RixVQUFNLENBQUMsT0FBTyxJQUFJLE1BQU0sS0FBSyxrQkFBa0IsMEJBQTBCLFlBQVk7QUFDckYsUUFBSSxTQUFTO0FBQ1osV0FBSyxXQUFXLEtBQUssNENBQTRDLGFBQWEsRUFBRTtBQUNoRixZQUFNLGlCQUFpQixNQUFNLEtBQUssa0JBQWtCLHNCQUFzQjtBQUMxRSxhQUFPLGVBQWUsS0FBSyxPQUFLLGFBQWEsT0FBTyxDQUFDLEVBQUUsT0FBTyxZQUFZLENBQUM7QUFBQSxJQUM1RTtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLGVBQWUsV0FBNEIsT0FBeUM7QUFDakcsUUFBSTtBQUNILFVBQUksQ0FBQyxnQkFBZ0IsSUFBSSxNQUFNLEtBQUssZUFBZSxjQUFjLENBQUMsRUFBRSxJQUFJLFVBQVUsV0FBVyxJQUFJLFNBQVMsVUFBVSxTQUFTLFFBQVEsQ0FBQyxHQUFHLEtBQUs7QUFDOUksVUFBSSxDQUFDLGtCQUFrQjtBQUN0QixTQUFDLGdCQUFnQixJQUFJLE1BQU0sS0FBSyxlQUFlLGNBQWMsQ0FBQyxFQUFFLElBQUksVUFBVSxXQUFXLEdBQUcsQ0FBQyxHQUFHLEtBQUs7QUFBQSxNQUN0RztBQUNBLFVBQUksa0JBQWtCO0FBQ3JCLGNBQU0sV0FBVztBQUFBLFVBQ2hCLElBQUksaUJBQWlCLFdBQVc7QUFBQSxVQUNoQyxzQkFBc0IsaUJBQWlCO0FBQUEsVUFDdkMsYUFBYSxpQkFBaUI7QUFBQSxVQUM5QixxQkFBcUIsaUJBQWlCLFdBQVc7QUFBQSxVQUNqRCxzQkFBc0IsVUFBVSx3QkFBd0IsaUJBQWlCLFdBQVc7QUFBQSxVQUNwRixZQUFZLGlCQUFpQixXQUFXLHVCQUF1QixLQUFLLFFBQVE7QUFBQSxRQUM3RTtBQUNBLGNBQU0sS0FBSyxrQkFBa0IsZUFBZSxXQUFXLFVBQVUsS0FBSyxRQUFRLGVBQWU7QUFBQSxNQUM5RjtBQUFBLElBQ0QsU0FBUyxPQUFPO0FBQUEsSUFFaEI7QUFBQSxFQUNEO0FBQ0Q7QUFsTE0sZ0NBQU47QUFBQSxFQWlCRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdkJHO0FBb0xOLE1BQU0sd0NBQXdDLHNCQUErRDtBQUFBLEVBRTVHLFlBQ1UsV0FDQSxTQUNRLGlDQUNoQjtBQUNELFVBQU07QUFKRztBQUNBO0FBQ1E7QUFBQSxFQUdsQjtBQUFBLEVBRVUsTUFBTSxPQUF5QztBQUN4RCxXQUFPLEtBQUssZ0NBQWdDLDRCQUE0QixDQUFDLEtBQUssVUFBVSxVQUFVLEdBQUcsS0FBSyxRQUFRLGVBQWU7QUFBQSxFQUNsSTtBQUVEOyIsCiAgIm5hbWVzIjogWyJmaWxlcyIsICJlIiwgInJlc3VsdCJdCn0K
