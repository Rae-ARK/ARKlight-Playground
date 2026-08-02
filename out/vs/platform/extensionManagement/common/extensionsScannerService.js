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
import { coalesce } from "../../../base/common/arrays.js";
import { ThrottledDelayer } from "../../../base/common/async.js";
import * as objects from "../../../base/common/objects.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { getErrorMessage } from "../../../base/common/errors.js";
import { getNodeType, parse } from "../../../base/common/json.js";
import { getParseErrorMessage } from "../../../base/common/jsonErrorMessages.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { FileAccess, Schemas } from "../../../base/common/network.js";
import * as path from "../../../base/common/path.js";
import * as platform from "../../../base/common/platform.js";
import { basename, isEqual, joinPath } from "../../../base/common/resources.js";
import * as semver from "../../../base/common/semver/semver.js";
import Severity from "../../../base/common/severity.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { areSameExtensions, computeTargetPlatform, getExtensionId, getGalleryExtensionId } from "./extensionManagementUtil.js";
import { ExtensionType, ExtensionIdentifier, TargetPlatform, UNDEFINED_PUBLISHER, BUILTIN_MANIFEST_CACHE_FILE, USER_MANIFEST_CACHE_FILE, ExtensionIdentifierMap, parseEnabledApiProposalNames } from "../../extensions/common/extensions.js";
import { validateExtensionManifest } from "../../extensions/common/extensionValidator.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { createDecorator, IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { Emitter } from "../../../base/common/event.js";
import { revive } from "../../../base/common/marshalling.js";
import { ExtensionsProfileScanningError, ExtensionsProfileScanningErrorCode, IExtensionsProfileScannerService } from "./extensionsProfileScannerService.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { localizeManifest } from "./extensionNls.js";
var Translations;
((Translations2) => {
  function equals(a, b) {
    if (a === b) {
      return true;
    }
    const aKeys = Object.keys(a);
    const bKeys = /* @__PURE__ */ new Set();
    for (const key of Object.keys(b)) {
      bKeys.add(key);
    }
    if (aKeys.length !== bKeys.size) {
      return false;
    }
    for (const key of aKeys) {
      if (a[key] !== b[key]) {
        return false;
      }
      bKeys.delete(key);
    }
    return bKeys.size === 0;
  }
  Translations2.equals = equals;
})(Translations || (Translations = {}));
function getProductBuiltInExtensionsEnabledWithAutoUpdates(productService, environmentService) {
  const result = /* @__PURE__ */ new Set();
  for (const id of productService.builtInExtensionsEnabledWithAutoUpdates) {
    const toLowerCaseId = id.toLowerCase();
    if (environmentService.skipBuiltinExtensions?.some((skipId) => skipId.toLowerCase() === toLowerCaseId)) {
      continue;
    }
    result.add(toLowerCaseId);
  }
  return result;
}
const IExtensionsScannerService = createDecorator("IExtensionsScannerService");
let AbstractExtensionsScannerService = class extends Disposable {
  constructor(systemExtensionsLocation, userExtensionsLocation, extensionsControlLocation, currentProfile, userDataProfilesService, extensionsProfileScannerService, fileService, logService, environmentService, productService, uriIdentityService, instantiationService) {
    super();
    this.systemExtensionsLocation = systemExtensionsLocation;
    this.userExtensionsLocation = userExtensionsLocation;
    this.extensionsControlLocation = extensionsControlLocation;
    this.userDataProfilesService = userDataProfilesService;
    this.extensionsProfileScannerService = extensionsProfileScannerService;
    this.fileService = fileService;
    this.logService = logService;
    this.environmentService = environmentService;
    this.productService = productService;
    this.uriIdentityService = uriIdentityService;
    this.instantiationService = instantiationService;
    this._onDidChangeCache = this._register(new Emitter());
    this.onDidChangeCache = this._onDidChangeCache.event;
    this.initializeDefaultProfileExtensionsPromise = void 0;
    this.systemExtensionsCachedScanner = this._register(this.instantiationService.createInstance(CachedExtensionsScanner, currentProfile));
    this.userExtensionsCachedScanner = this._register(this.instantiationService.createInstance(CachedExtensionsScanner, currentProfile));
    this.extensionsScanner = this._register(this.instantiationService.createInstance(ExtensionsScanner));
    this._register(this.systemExtensionsCachedScanner.onDidChangeCache(() => this._onDidChangeCache.fire(ExtensionType.System)));
    this._register(this.userExtensionsCachedScanner.onDidChangeCache(() => this._onDidChangeCache.fire(ExtensionType.User)));
  }
  getTargetPlatform() {
    if (!this._targetPlatformPromise) {
      this._targetPlatformPromise = computeTargetPlatform(this.fileService, this.logService);
    }
    return this._targetPlatformPromise;
  }
  async scanAllExtensions(systemScanOptions, userScanOptions) {
    const [system, user] = await Promise.all([
      this.scanSystemExtensions(systemScanOptions),
      this.scanUserExtensions(userScanOptions)
    ]);
    return this.dedupExtensions(system, user, [], await this.getTargetPlatform(), true);
  }
  async scanSystemExtensions(scanOptions) {
    const promises = [];
    promises.push(this.scanDefaultSystemExtensions(scanOptions.language));
    promises.push(this.scanDevSystemExtensions(scanOptions.language, !!scanOptions.checkControlFile));
    const [defaultSystemExtensions, devSystemExtensions] = await Promise.all(promises);
    let allSystemExtensions = [...defaultSystemExtensions, ...devSystemExtensions];
    if (this.environmentService.skipBuiltinExtensions?.length) {
      const skipSet = new Set(this.environmentService.skipBuiltinExtensions.map((id) => id.toLowerCase()));
      allSystemExtensions = allSystemExtensions.filter((ext) => !skipSet.has(ext.identifier.id.toLowerCase()));
    }
    return this.applyScanOptions(allSystemExtensions, ExtensionType.System, { pickLatest: false });
  }
  async scanUserExtensions(scanOptions) {
    this.logService.trace("Started scanning user extensions", scanOptions.profileLocation);
    const profileScanOptions = this.uriIdentityService.extUri.isEqual(scanOptions.profileLocation, this.userDataProfilesService.defaultProfile.extensionsResource) ? { bailOutWhenFileNotFound: true } : void 0;
    const extensionsScannerInput = await this.createExtensionScannerInput(scanOptions.profileLocation, true, ExtensionType.User, scanOptions.language, true, profileScanOptions, scanOptions.productVersion ?? this.getProductVersion());
    const extensionsScanner = scanOptions.useCache && !extensionsScannerInput.devMode ? this.userExtensionsCachedScanner : this.extensionsScanner;
    let extensions;
    try {
      extensions = await extensionsScanner.scanExtensions(extensionsScannerInput);
    } catch (error) {
      if (error instanceof ExtensionsProfileScanningError && error.code === ExtensionsProfileScanningErrorCode.ERROR_PROFILE_NOT_FOUND) {
        await this.doInitializeDefaultProfileExtensions();
        extensions = await extensionsScanner.scanExtensions(extensionsScannerInput);
      } else {
        throw error;
      }
    }
    extensions = await this.applyScanOptions(extensions, ExtensionType.User, { includeInvalid: scanOptions.includeInvalid, pickLatest: true });
    this.logService.trace("Scanned user extensions:", extensions.length);
    return extensions;
  }
  async scanAllUserExtensions(scanOptions = { includeInvalid: true, includeAllVersions: true }) {
    const extensionsScannerInput = await this.createExtensionScannerInput(this.userExtensionsLocation, false, ExtensionType.User, void 0, true, void 0, this.getProductVersion());
    const extensions = await this.extensionsScanner.scanExtensions(extensionsScannerInput);
    return this.applyScanOptions(extensions, ExtensionType.User, { includeAllVersions: scanOptions.includeAllVersions, includeInvalid: scanOptions.includeInvalid });
  }
  async scanExtensionsUnderDevelopment(existingExtensions, scanOptions) {
    if (this.environmentService.isExtensionDevelopment && this.environmentService.extensionDevelopmentLocationURI) {
      const extensions = (await Promise.all(this.environmentService.extensionDevelopmentLocationURI.filter((extLoc) => extLoc.scheme === Schemas.file).map(async (extensionDevelopmentLocationURI) => {
        const input = await this.createExtensionScannerInput(extensionDevelopmentLocationURI, false, ExtensionType.User, scanOptions.language, false, void 0, this.getProductVersion());
        const extensions2 = await this.extensionsScanner.scanOneOrMultipleExtensions(input);
        return extensions2.map((extension) => {
          extension.type = existingExtensions.find((e) => areSameExtensions(e.identifier, extension.identifier))?.type ?? extension.type;
          return this.extensionsScanner.validate(extension, input);
        });
      }))).flat();
      return this.applyScanOptions(extensions, "development", { includeInvalid: scanOptions.includeInvalid, pickLatest: true });
    }
    return [];
  }
  async scanExistingExtension(extensionLocation, extensionType, scanOptions) {
    const extensionsScannerInput = await this.createExtensionScannerInput(extensionLocation, false, extensionType, scanOptions.language, true, void 0, this.getProductVersion());
    const extension = await this.extensionsScanner.scanExtension(extensionsScannerInput);
    if (!extension) {
      return null;
    }
    if (!scanOptions.includeInvalid && !extension.isValid) {
      return null;
    }
    return extension;
  }
  async scanOneOrMultipleExtensions(extensionLocation, extensionType, scanOptions) {
    const extensionsScannerInput = await this.createExtensionScannerInput(extensionLocation, false, extensionType, scanOptions.language, true, void 0, this.getProductVersion());
    const extensions = await this.extensionsScanner.scanOneOrMultipleExtensions(extensionsScannerInput);
    return this.applyScanOptions(extensions, extensionType, { includeInvalid: scanOptions.includeInvalid, pickLatest: true });
  }
  async scanMultipleExtensions(extensionLocations, extensionType, scanOptions) {
    const extensions = [];
    await Promise.all(extensionLocations.map(async (extensionLocation) => {
      const scannedExtensions = await this.scanOneOrMultipleExtensions(extensionLocation, extensionType, scanOptions);
      extensions.push(...scannedExtensions);
    }));
    return this.applyScanOptions(extensions, extensionType, { includeInvalid: scanOptions.includeInvalid, pickLatest: true });
  }
  async updateManifestMetadata(extensionLocation, metaData) {
    const manifestLocation = joinPath(extensionLocation, "package.json");
    const content = (await this.fileService.readFile(manifestLocation)).value.toString();
    const manifest = JSON.parse(content);
    manifest.__metadata = { ...manifest.__metadata, ...metaData };
    await this.fileService.writeFile(joinPath(extensionLocation, "package.json"), VSBuffer.fromString(JSON.stringify(manifest, null, "	")));
  }
  async initializeDefaultProfileExtensions() {
    try {
      await this.extensionsProfileScannerService.scanProfileExtensions(this.userDataProfilesService.defaultProfile.extensionsResource, { bailOutWhenFileNotFound: true });
    } catch (error) {
      if (error instanceof ExtensionsProfileScanningError && error.code === ExtensionsProfileScanningErrorCode.ERROR_PROFILE_NOT_FOUND) {
        await this.doInitializeDefaultProfileExtensions();
      } else {
        throw error;
      }
    }
  }
  async doInitializeDefaultProfileExtensions() {
    if (!this.initializeDefaultProfileExtensionsPromise) {
      this.initializeDefaultProfileExtensionsPromise = (async () => {
        try {
          this.logService.info("Started initializing default profile extensions in extensions installation folder.", this.userExtensionsLocation.toString());
          const userExtensions = await this.scanAllUserExtensions({ includeInvalid: true });
          if (userExtensions.length) {
            await this.extensionsProfileScannerService.addExtensionsToProfile(userExtensions.map((e) => [e, e.metadata]), this.userDataProfilesService.defaultProfile.extensionsResource);
          } else {
            try {
              await this.fileService.createFile(this.userDataProfilesService.defaultProfile.extensionsResource, VSBuffer.fromString(JSON.stringify([])));
            } catch (error) {
              if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
                this.logService.warn("Failed to create default profile extensions manifest in extensions installation folder.", this.userExtensionsLocation.toString(), getErrorMessage(error));
              }
            }
          }
          this.logService.info("Completed initializing default profile extensions in extensions installation folder.", this.userExtensionsLocation.toString());
        } catch (error) {
          this.logService.error(error);
        } finally {
          this.initializeDefaultProfileExtensionsPromise = void 0;
        }
      })();
    }
    return this.initializeDefaultProfileExtensionsPromise;
  }
  async applyScanOptions(extensions, type, scanOptions = {}) {
    if (!scanOptions.includeAllVersions) {
      extensions = this.dedupExtensions(type === ExtensionType.System ? extensions : void 0, type === ExtensionType.User ? extensions : void 0, type === "development" ? extensions : void 0, await this.getTargetPlatform(), !!scanOptions.pickLatest);
    }
    if (!scanOptions.includeInvalid) {
      extensions = extensions.filter((extension) => extension.isValid);
    }
    return extensions.sort((a, b) => {
      const aLastSegment = path.basename(a.location.fsPath);
      const bLastSegment = path.basename(b.location.fsPath);
      if (aLastSegment < bLastSegment) {
        return -1;
      }
      if (aLastSegment > bLastSegment) {
        return 1;
      }
      return 0;
    });
  }
  dedupExtensions(system, user, development, targetPlatform, pickLatest) {
    const pick = (existing, extension, isDevelopment) => {
      if (!isDevelopment && !(existing.isBuiltin || extension.isBuiltin)) {
        if (existing.metadata?.isApplicationScoped && !extension.metadata?.isApplicationScoped) {
          return false;
        }
        if (!existing.metadata?.isApplicationScoped && extension.metadata?.isApplicationScoped) {
          return true;
        }
      }
      if (existing.isValid && !extension.isValid) {
        return false;
      }
      if (existing.isValid === extension.isValid) {
        if (pickLatest && semver.gt(existing.manifest.version, extension.manifest.version)) {
          this.logService.debug(`Skipping extension ${extension.location.path} with lower version ${extension.manifest.version} in favour of ${existing.location.path} with version ${existing.manifest.version}`);
          return false;
        }
        if (semver.eq(existing.manifest.version, extension.manifest.version)) {
          if (existing.type === ExtensionType.System) {
            this.logService.debug(`Skipping extension ${extension.location.path} in favour of system extension ${existing.location.path} with same version`);
            return false;
          }
          if (existing.targetPlatform === targetPlatform) {
            this.logService.debug(`Skipping extension ${extension.location.path} from different target platform ${extension.targetPlatform}`);
            return false;
          }
        }
      }
      if (isDevelopment) {
        this.logService.warn(`Overwriting user extension ${existing.location.path} with ${extension.location.path}.`);
      } else {
        this.logService.debug(`Overwriting user extension ${existing.location.path} with ${extension.location.path}.`);
      }
      return true;
    };
    const result = new ExtensionIdentifierMap();
    system?.forEach((extension) => {
      const existing = result.get(extension.identifier.id);
      if (!existing || pick(existing, extension, false)) {
        result.set(extension.identifier.id, extension);
      }
    });
    const productBuiltInExtensionsEnabledWithAutoUpdates = getProductBuiltInExtensionsEnabledWithAutoUpdates(this.productService, this.environmentService);
    user?.forEach((extension) => {
      const existing = result.get(extension.identifier.id);
      if (!existing && system && extension.type === ExtensionType.System) {
        this.logService.debug(`Skipping obsolete system extension ${extension.location.path}.`);
        return;
      }
      if (productBuiltInExtensionsEnabledWithAutoUpdates.has(extension.identifier.id.toLowerCase()) && !extension.forceAutoUpdate) {
        this.logService.info(`Skipping user installed builtin extension ${extension.identifier.id} with version ${extension.manifest.version} because it is not allowed to in the current product quality ${this.productService.quality}`);
        return;
      }
      if (!existing || pick(existing, extension, false)) {
        result.set(extension.identifier.id, extension);
      }
    });
    development?.forEach((extension) => {
      const existing = result.get(extension.identifier.id);
      if (!existing || pick(existing, extension, true)) {
        result.set(extension.identifier.id, extension);
      }
      result.set(extension.identifier.id, extension);
    });
    return [...result.values()];
  }
  async scanDefaultSystemExtensions(language) {
    this.logService.trace("Started scanning system extensions");
    const extensionsScannerInput = await this.createExtensionScannerInput(this.systemExtensionsLocation, false, ExtensionType.System, language, true, void 0, this.getProductVersion());
    const extensionsScanner = extensionsScannerInput.devMode ? this.extensionsScanner : this.systemExtensionsCachedScanner;
    const result = await extensionsScanner.scanExtensions(extensionsScannerInput);
    this.logService.trace("Scanned system extensions:", result.length);
    return result;
  }
  async scanDevSystemExtensions(language, checkControlFile) {
    const devSystemExtensionsList = this.environmentService.isBuilt ? [] : this.productService.builtInExtensions;
    if (!devSystemExtensionsList?.length) {
      return [];
    }
    this.logService.trace("Started scanning dev system extensions");
    const builtinExtensionControl = checkControlFile ? await this.getBuiltInExtensionControl() : {};
    const devSystemExtensionsLocations = [];
    const devSystemExtensionsLocation = URI.file(path.normalize(path.join(FileAccess.asFileUri("").fsPath, "..", ".build", "builtInExtensions")));
    for (const extension of devSystemExtensionsList) {
      const controlState = builtinExtensionControl[extension.name] || "marketplace";
      switch (controlState) {
        case "disabled":
          break;
        case "marketplace":
          devSystemExtensionsLocations.push(joinPath(devSystemExtensionsLocation, extension.name));
          break;
        default:
          devSystemExtensionsLocations.push(URI.file(controlState));
          break;
      }
    }
    const result = await Promise.all(devSystemExtensionsLocations.map(async (location) => this.extensionsScanner.scanExtension(await this.createExtensionScannerInput(location, false, ExtensionType.System, language, true, void 0, this.getProductVersion()))));
    this.logService.trace("Scanned dev system extensions:", result.length);
    return coalesce(result);
  }
  async getBuiltInExtensionControl() {
    try {
      const content = await this.fileService.readFile(this.extensionsControlLocation);
      return JSON.parse(content.value.toString());
    } catch (error) {
      return {};
    }
  }
  async createExtensionScannerInput(location, profile, type, language, validate, profileScanOptions, productVersion) {
    const translations = await this.getTranslations(language ?? platform.language);
    const mtime = await this.getMtime(location);
    const applicationExtensionsLocation = profile && !this.uriIdentityService.extUri.isEqual(location, this.userDataProfilesService.defaultProfile.extensionsResource) ? this.userDataProfilesService.defaultProfile.extensionsResource : void 0;
    const applicationExtensionsLocationMtime = applicationExtensionsLocation ? await this.getMtime(applicationExtensionsLocation) : void 0;
    return new ExtensionScannerInput(
      location,
      mtime,
      applicationExtensionsLocation,
      applicationExtensionsLocationMtime,
      profile,
      profileScanOptions,
      type,
      validate,
      productVersion.version,
      productVersion.date,
      this.productService.commit,
      !this.environmentService.isBuilt,
      language,
      translations
    );
  }
  async getMtime(location) {
    try {
      const stat = await this.fileService.stat(location);
      if (typeof stat.mtime === "number") {
        return stat.mtime;
      }
    } catch (err) {
    }
    return void 0;
  }
  getProductVersion() {
    return {
      version: this.productService.version,
      date: this.productService.date
    };
  }
};
AbstractExtensionsScannerService = __decorateClass([
  __decorateParam(4, IUserDataProfilesService),
  __decorateParam(5, IExtensionsProfileScannerService),
  __decorateParam(6, IFileService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IEnvironmentService),
  __decorateParam(9, IProductService),
  __decorateParam(10, IUriIdentityService),
  __decorateParam(11, IInstantiationService)
], AbstractExtensionsScannerService);
class ExtensionScannerInput {
  constructor(location, mtime, applicationExtensionslocation, applicationExtensionslocationMtime, profile, profileScanOptions, type, validate, productVersion, productDate, productCommit, devMode, language, translations) {
    this.location = location;
    this.mtime = mtime;
    this.applicationExtensionslocation = applicationExtensionslocation;
    this.applicationExtensionslocationMtime = applicationExtensionslocationMtime;
    this.profile = profile;
    this.profileScanOptions = profileScanOptions;
    this.type = type;
    this.validate = validate;
    this.productVersion = productVersion;
    this.productDate = productDate;
    this.productCommit = productCommit;
    this.devMode = devMode;
    this.language = language;
    this.translations = translations;
  }
  static createNlsConfiguration(input) {
    return {
      language: input.language,
      pseudo: input.language === "pseudo",
      devMode: input.devMode,
      translations: input.translations
    };
  }
  static equals(a, b) {
    return isEqual(a.location, b.location) && a.mtime === b.mtime && isEqual(a.applicationExtensionslocation, b.applicationExtensionslocation) && a.applicationExtensionslocationMtime === b.applicationExtensionslocationMtime && a.profile === b.profile && objects.equals(a.profileScanOptions, b.profileScanOptions) && a.type === b.type && a.validate === b.validate && a.productVersion === b.productVersion && a.productDate === b.productDate && a.productCommit === b.productCommit && a.devMode === b.devMode && a.language === b.language && Translations.equals(a.translations, b.translations);
  }
}
let ExtensionsScanner = class extends Disposable {
  constructor(extensionsProfileScannerService, uriIdentityService, fileService, productService, environmentService, logService) {
    super();
    this.extensionsProfileScannerService = extensionsProfileScannerService;
    this.uriIdentityService = uriIdentityService;
    this.fileService = fileService;
    this.logService = logService;
    this.productQuality = productService.quality;
    this.productBuiltInExtensionsEnabledWithAutoUpdates = getProductBuiltInExtensionsEnabledWithAutoUpdates(productService, environmentService);
  }
  async scanExtensions(input) {
    return input.profile ? this.scanExtensionsFromProfile(input) : this.scanExtensionsFromLocation(input);
  }
  async scanExtensionsFromLocation(input) {
    const stat = await this.fileService.resolve(input.location);
    if (!stat.children?.length) {
      return [];
    }
    const extensions = await Promise.all(
      stat.children.map(async (c) => {
        if (!c.isDirectory) {
          return null;
        }
        if (input.type === ExtensionType.User && basename(c.resource).indexOf(".") === 0) {
          return null;
        }
        const extensionScannerInput = new ExtensionScannerInput(c.resource, input.mtime, input.applicationExtensionslocation, input.applicationExtensionslocationMtime, input.profile, input.profileScanOptions, input.type, input.validate, input.productVersion, input.productDate, input.productCommit, input.devMode, input.language, input.translations);
        return this.scanExtension(extensionScannerInput);
      })
    );
    return coalesce(extensions).sort((a, b) => a.location.path < b.location.path ? -1 : 1);
  }
  async scanExtensionsFromProfile(input) {
    let profileExtensions = await this.scanExtensionsFromProfileResource(input.location, () => true, input);
    if (input.applicationExtensionslocation && !this.uriIdentityService.extUri.isEqual(input.location, input.applicationExtensionslocation)) {
      profileExtensions = profileExtensions.filter((e) => !e.metadata?.isApplicationScoped);
      const applicationExtensions = await this.scanExtensionsFromProfileResource(input.applicationExtensionslocation, (e) => !!e.metadata?.isBuiltin || !!e.metadata?.isApplicationScoped, input);
      profileExtensions.push(...applicationExtensions);
    }
    return profileExtensions;
  }
  async scanExtensionsFromProfileResource(profileResource, filter, input) {
    const scannedProfileExtensions = await this.extensionsProfileScannerService.scanProfileExtensions(profileResource, input.profileScanOptions);
    if (!scannedProfileExtensions.length) {
      return [];
    }
    const extensions = await Promise.all(
      scannedProfileExtensions.map(async (extensionInfo) => {
        if (filter(extensionInfo)) {
          const extensionScannerInput = new ExtensionScannerInput(extensionInfo.location, input.mtime, input.applicationExtensionslocation, input.applicationExtensionslocationMtime, input.profile, input.profileScanOptions, input.type, input.validate, input.productVersion, input.productDate, input.productCommit, input.devMode, input.language, input.translations);
          return this.scanExtension(extensionScannerInput, extensionInfo);
        }
        return null;
      })
    );
    return coalesce(extensions);
  }
  async scanOneOrMultipleExtensions(input) {
    try {
      if (await this.fileService.exists(joinPath(input.location, "package.json"))) {
        const extension = await this.scanExtension(input);
        return extension ? [extension] : [];
      } else {
        return await this.scanExtensions(input);
      }
    } catch (error) {
      this.logService.error(`Error scanning extensions at ${input.location.path}:`, getErrorMessage(error));
      return [];
    }
  }
  async scanExtension(input, scannedProfileExtension) {
    const validations = [];
    let isValid = true;
    let manifest;
    try {
      manifest = await this.scanExtensionManifest(input.location);
    } catch (e) {
      if (scannedProfileExtension) {
        validations.push([Severity.Error, getErrorMessage(e)]);
        isValid = false;
        const [publisher, name] = scannedProfileExtension.identifier.id.split(".");
        manifest = {
          name,
          publisher,
          version: scannedProfileExtension.version,
          engines: { vscode: "" }
        };
      } else {
        if (input.type !== ExtensionType.System) {
          this.logService.error(e);
        }
        return null;
      }
    }
    if (!manifest.publisher) {
      manifest.publisher = UNDEFINED_PUBLISHER;
    }
    let metadata;
    if (scannedProfileExtension) {
      metadata = {
        ...scannedProfileExtension.metadata,
        size: manifest.__metadata?.size
      };
    } else if (manifest.__metadata) {
      metadata = {
        installedTimestamp: manifest.__metadata.installedTimestamp,
        size: manifest.__metadata.size,
        targetPlatform: manifest.__metadata.targetPlatform
      };
    }
    delete manifest.__metadata;
    const id = getGalleryExtensionId(manifest.publisher, manifest.name);
    const identifier = metadata?.id ? { id, uuid: metadata.id } : { id };
    const type = metadata?.isSystem ? ExtensionType.System : input.type;
    const isBuiltin = type === ExtensionType.System || !!metadata?.isBuiltin;
    try {
      manifest = await this.translateManifest(input.location, manifest, ExtensionScannerInput.createNlsConfiguration(input));
    } catch (error) {
      this.logService.warn("Failed to translate manifest", getErrorMessage(error));
    }
    let extension = {
      type,
      identifier,
      manifest,
      location: input.location,
      isBuiltin,
      targetPlatform: metadata?.targetPlatform ?? TargetPlatform.UNDEFINED,
      publisherDisplayName: metadata?.publisherDisplayName,
      metadata,
      isValid,
      validations,
      preRelease: !!metadata?.preRelease,
      forceAutoUpdate: this.productBuiltInExtensionsEnabledWithAutoUpdates.has(id.toLowerCase()) && this.productQuality === "stable"
    };
    if (input.validate) {
      extension = this.validate(extension, input);
    }
    if (manifest.enabledApiProposals) {
      manifest.originalEnabledApiProposals = manifest.enabledApiProposals;
      manifest.enabledApiProposals = parseEnabledApiProposalNames([...manifest.enabledApiProposals]);
    }
    return extension;
  }
  validate(extension, input) {
    let isValid = extension.isValid;
    const validations = validateExtensionManifest(input.productVersion, input.productDate, input.location, extension.manifest, extension.isBuiltin);
    for (const [severity, message] of validations) {
      if (severity === Severity.Error) {
        isValid = false;
        this.logService.error(this.formatMessage(input.location, message));
      }
    }
    extension.isValid = isValid;
    extension.validations = [...extension.validations, ...validations];
    return extension;
  }
  async scanExtensionManifest(extensionLocation) {
    const manifestLocation = joinPath(extensionLocation, "package.json");
    let content;
    try {
      content = (await this.fileService.readFile(manifestLocation)).value.toString();
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.error(this.formatMessage(extensionLocation, localize("fileReadFail", "Cannot read file {0}: {1}.", manifestLocation.path, error.message)));
      }
      throw error;
    }
    let manifest;
    try {
      manifest = JSON.parse(content);
    } catch (err) {
      const errors = [];
      parse(content, errors);
      for (const e of errors) {
        this.logService.error(this.formatMessage(extensionLocation, localize("jsonParseFail", "Failed to parse {0}: [{1}, {2}] {3}.", manifestLocation.path, e.offset, e.length, getParseErrorMessage(e.error))));
      }
      throw err;
    }
    if (getNodeType(manifest) !== "object") {
      const errorMessage = this.formatMessage(extensionLocation, localize("jsonParseInvalidType", "Invalid manifest file {0}: Not a JSON object.", manifestLocation.path));
      this.logService.error(errorMessage);
      throw new Error(errorMessage);
    }
    return manifest;
  }
  async translateManifest(extensionLocation, extensionManifest, nlsConfiguration) {
    const localizedMessages = await this.getLocalizedMessages(extensionLocation, extensionManifest, nlsConfiguration);
    if (localizedMessages) {
      try {
        const errors = [];
        const defaults = await this.resolveOriginalMessageBundle(localizedMessages.default, errors);
        if (errors.length > 0) {
          errors.forEach((error) => {
            this.logService.error(this.formatMessage(extensionLocation, localize("jsonsParseReportErrors", "Failed to parse {0}: {1}.", localizedMessages.default?.path, getParseErrorMessage(error.error))));
          });
          return extensionManifest;
        } else if (getNodeType(localizedMessages) !== "object") {
          this.logService.error(this.formatMessage(extensionLocation, localize("jsonInvalidFormat", "Invalid format {0}: JSON object expected.", localizedMessages.default?.path)));
          return extensionManifest;
        }
        const localized = localizedMessages.values || /* @__PURE__ */ Object.create(null);
        return localizeManifest(this.logService, extensionManifest, localized, defaults);
      } catch (error) {
      }
    }
    return extensionManifest;
  }
  async getLocalizedMessages(extensionLocation, extensionManifest, nlsConfiguration) {
    const defaultPackageNLS = joinPath(extensionLocation, "package.nls.json");
    const reportErrors = (localized, errors) => {
      errors.forEach((error) => {
        this.logService.error(this.formatMessage(extensionLocation, localize("jsonsParseReportErrors", "Failed to parse {0}: {1}.", localized?.path, getParseErrorMessage(error.error))));
      });
    };
    const reportInvalidFormat = (localized) => {
      this.logService.error(this.formatMessage(extensionLocation, localize("jsonInvalidFormat", "Invalid format {0}: JSON object expected.", localized?.path)));
    };
    const translationId = `${extensionManifest.publisher}.${extensionManifest.name}`;
    const translationPath = nlsConfiguration.translations[translationId];
    if (translationPath) {
      try {
        const translationResource = URI.file(translationPath);
        const content = (await this.fileService.readFile(translationResource)).value.toString();
        const errors = [];
        const translationBundle = parse(content, errors);
        if (errors.length > 0) {
          reportErrors(translationResource, errors);
          return { values: void 0, default: defaultPackageNLS };
        } else if (getNodeType(translationBundle) !== "object") {
          reportInvalidFormat(translationResource);
          return { values: void 0, default: defaultPackageNLS };
        } else {
          const values = translationBundle.contents ? translationBundle.contents.package : void 0;
          return { values, default: defaultPackageNLS };
        }
      } catch (error) {
        return { values: void 0, default: defaultPackageNLS };
      }
    } else {
      const exists = await this.fileService.exists(defaultPackageNLS);
      if (!exists) {
        return void 0;
      }
      let messageBundle;
      try {
        messageBundle = await this.findMessageBundles(extensionLocation, nlsConfiguration);
      } catch (error) {
        return void 0;
      }
      if (!messageBundle.localized) {
        return { values: void 0, default: messageBundle.original };
      }
      try {
        const messageBundleContent = (await this.fileService.readFile(messageBundle.localized)).value.toString();
        const errors = [];
        const messages = parse(messageBundleContent, errors);
        if (errors.length > 0) {
          reportErrors(messageBundle.localized, errors);
          return { values: void 0, default: messageBundle.original };
        } else if (getNodeType(messages) !== "object") {
          reportInvalidFormat(messageBundle.localized);
          return { values: void 0, default: messageBundle.original };
        }
        return { values: messages, default: messageBundle.original };
      } catch (error) {
        return { values: void 0, default: messageBundle.original };
      }
    }
  }
  /**
   * Parses original message bundle, returns null if the original message bundle is null.
   */
  async resolveOriginalMessageBundle(originalMessageBundle, errors) {
    if (originalMessageBundle) {
      try {
        const originalBundleContent = (await this.fileService.readFile(originalMessageBundle)).value.toString();
        return parse(originalBundleContent, errors);
      } catch (error) {
      }
    }
    return;
  }
  /**
   * Finds localized message bundle and the original (unlocalized) one.
   * If the localized file is not present, returns null for the original and marks original as localized.
   */
  findMessageBundles(extensionLocation, nlsConfiguration) {
    return new Promise((c, e) => {
      const loop = (locale) => {
        const toCheck = joinPath(extensionLocation, `package.nls.${locale}.json`);
        this.fileService.exists(toCheck).then((exists) => {
          if (exists) {
            c({ localized: toCheck, original: joinPath(extensionLocation, "package.nls.json") });
          }
          const index = locale.lastIndexOf("-");
          if (index === -1) {
            c({ localized: joinPath(extensionLocation, "package.nls.json"), original: null });
          } else {
            locale = locale.substring(0, index);
            loop(locale);
          }
        });
      };
      if (nlsConfiguration.devMode || nlsConfiguration.pseudo || !nlsConfiguration.language) {
        return c({ localized: joinPath(extensionLocation, "package.nls.json"), original: null });
      }
      loop(nlsConfiguration.language);
    });
  }
  formatMessage(extensionLocation, message) {
    return `[${extensionLocation.path}]: ${message}`;
  }
};
ExtensionsScanner = __decorateClass([
  __decorateParam(0, IExtensionsProfileScannerService),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IProductService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, ILogService)
], ExtensionsScanner);
let CachedExtensionsScanner = class extends ExtensionsScanner {
  constructor(currentProfile, userDataProfilesService, extensionsProfileScannerService, uriIdentityService, fileService, productService, environmentService, logService) {
    super(extensionsProfileScannerService, uriIdentityService, fileService, productService, environmentService, logService);
    this.currentProfile = currentProfile;
    this.userDataProfilesService = userDataProfilesService;
    this.cacheValidatorThrottler = this._register(new ThrottledDelayer(3e3));
    this._onDidChangeCache = this._register(new Emitter());
    this.onDidChangeCache = this._onDidChangeCache.event;
  }
  async scanExtensions(input) {
    const cacheFile = this.getCacheFile(input);
    const cacheContents = await this.readExtensionCache(cacheFile);
    this.input = input;
    if (cacheContents && cacheContents.input && ExtensionScannerInput.equals(cacheContents.input, this.input)) {
      this.logService.debug("Using cached extensions scan result", input.type === ExtensionType.System ? "system" : "user", input.location.toString());
      this.cacheValidatorThrottler.trigger(() => this.validateCache());
      return cacheContents.result.map((extension) => {
        extension.location = URI.revive(extension.location);
        return extension;
      });
    }
    const result = await super.scanExtensions(input);
    await this.writeExtensionCache(cacheFile, { input, result });
    return result;
  }
  async readExtensionCache(cacheFile) {
    try {
      const cacheRawContents = await this.fileService.readFile(cacheFile);
      const extensionCacheData = JSON.parse(cacheRawContents.value.toString());
      return { result: extensionCacheData.result, input: revive(extensionCacheData.input) };
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.debug("Error while reading the extension cache file:", cacheFile.path, getErrorMessage(error));
      }
    }
    return null;
  }
  async writeExtensionCache(cacheFile, cacheContents) {
    try {
      await this.fileService.writeFile(cacheFile, VSBuffer.fromString(JSON.stringify(cacheContents)));
    } catch (error) {
      this.logService.debug("Error while writing the extension cache file:", cacheFile.path, getErrorMessage(error));
    }
  }
  async validateCache() {
    if (!this.input) {
      return;
    }
    const cacheFile = this.getCacheFile(this.input);
    const cacheContents = await this.readExtensionCache(cacheFile);
    if (!cacheContents) {
      return;
    }
    const actual = cacheContents.result;
    const expected = JSON.parse(JSON.stringify(await super.scanExtensions(this.input)));
    if (objects.equals(expected, actual)) {
      return;
    }
    try {
      this.logService.info("Invalidating Cache", actual, expected);
      await this.fileService.del(cacheFile);
      this._onDidChangeCache.fire();
    } catch (error) {
      this.logService.error(error);
    }
  }
  getCacheFile(input) {
    const profile = this.getProfile(input);
    return this.uriIdentityService.extUri.joinPath(profile.cacheHome, input.type === ExtensionType.System ? BUILTIN_MANIFEST_CACHE_FILE : USER_MANIFEST_CACHE_FILE);
  }
  getProfile(input) {
    if (input.type === ExtensionType.System) {
      return this.userDataProfilesService.defaultProfile;
    }
    if (!input.profile) {
      return this.userDataProfilesService.defaultProfile;
    }
    if (this.uriIdentityService.extUri.isEqual(input.location, this.currentProfile.extensionsResource)) {
      return this.currentProfile;
    }
    return this.userDataProfilesService.profiles.find((p) => this.uriIdentityService.extUri.isEqual(input.location, p.extensionsResource)) ?? this.currentProfile;
  }
};
CachedExtensionsScanner = __decorateClass([
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IExtensionsProfileScannerService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, IFileService),
  __decorateParam(5, IProductService),
  __decorateParam(6, IEnvironmentService),
  __decorateParam(7, ILogService)
], CachedExtensionsScanner);
function toExtensionDescription(extension, isUnderDevelopment) {
  const id = getExtensionId(extension.manifest.publisher, extension.manifest.name);
  return {
    id,
    identifier: new ExtensionIdentifier(id),
    isBuiltin: extension.type === ExtensionType.System,
    isUserBuiltin: extension.type === ExtensionType.User && extension.isBuiltin,
    isUnderDevelopment,
    extensionLocation: extension.location,
    uuid: extension.identifier.uuid,
    targetPlatform: extension.targetPlatform,
    publisherDisplayName: extension.publisherDisplayName,
    preRelease: extension.preRelease,
    ...extension.manifest
  };
}
class NativeExtensionsScannerService extends AbstractExtensionsScannerService {
  constructor(systemExtensionsLocation, userExtensionsLocation, userHome, currentProfile, userDataProfilesService, extensionsProfileScannerService, fileService, logService, environmentService, productService, uriIdentityService, instantiationService) {
    super(
      systemExtensionsLocation,
      userExtensionsLocation,
      joinPath(userHome, ".vscode-oss-dev", "extensions", "control.json"),
      currentProfile,
      userDataProfilesService,
      extensionsProfileScannerService,
      fileService,
      logService,
      environmentService,
      productService,
      uriIdentityService,
      instantiationService
    );
    this.translationsPromise = (async () => {
      if (platform.translationsConfigFile) {
        try {
          const content = await this.fileService.readFile(URI.file(platform.translationsConfigFile));
          return JSON.parse(content.value.toString());
        } catch (err) {
        }
      }
      return /* @__PURE__ */ Object.create(null);
    })();
  }
  getTranslations(language) {
    return this.translationsPromise;
  }
}
export {
  AbstractExtensionsScannerService,
  ExtensionScannerInput,
  IExtensionsScannerService,
  NativeExtensionsScannerService,
  Translations,
  toExtensionDescription
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbnNTY2FubmVyU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGdldE5vZGVUeXBlLCBwYXJzZSwgUGFyc2VFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgZ2V0UGFyc2VFcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uRXJyb3JNZXNzYWdlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MsIFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgaXNFcXVhbCwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0ICogYXMgc2VtdmVyIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NlbXZlci9zZW12ZXIuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElQcm9kdWN0VmVyc2lvbiwgTWV0YWRhdGEgfSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMsIGNvbXB1dGVUYXJnZXRQbGF0Zm9ybSwgZ2V0RXh0ZW5zaW9uSWQsIGdldEdhbGxlcnlFeHRlbnNpb25JZCB9IGZyb20gJy4vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSwgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbk1hbmlmZXN0LCBUYXJnZXRQbGF0Zm9ybSwgSUV4dGVuc2lvbklkZW50aWZpZXIsIElSZWxheGVkRXh0ZW5zaW9uTWFuaWZlc3QsIFVOREVGSU5FRF9QVUJMSVNIRVIsIElFeHRlbnNpb25EZXNjcmlwdGlvbiwgQlVJTFRJTl9NQU5JRkVTVF9DQUNIRV9GSUxFLCBVU0VSX01BTklGRVNUX0NBQ0hFX0ZJTEUsIEV4dGVuc2lvbklkZW50aWZpZXJNYXAsIHBhcnNlRW5hYmxlZEFwaVByb3Bvc2FsTmFtZXMgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IHZhbGlkYXRlRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25WYWxpZGF0b3IuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlLCB0b0ZpbGVPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyByZXZpdmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUHJvZmlsZVNjYW5uaW5nRXJyb3IsIEV4dGVuc2lvbnNQcm9maWxlU2Nhbm5pbmdFcnJvckNvZGUsIElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLCBJUHJvZmlsZUV4dGVuc2lvbnNTY2FuT3B0aW9ucywgSVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uIH0gZnJvbSAnLi9leHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemVNYW5pZmVzdCB9IGZyb20gJy4vZXh0ZW5zaW9uTmxzLmpzJztcblxuZXhwb3J0IHR5cGUgTWFuaWZlc3RNZXRhZGF0YSA9IFBhcnRpYWw8e1xuXHR0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm07XG5cdGluc3RhbGxlZFRpbWVzdGFtcDogbnVtYmVyO1xuXHRzaXplOiBudW1iZXI7XG59PjtcblxuZXhwb3J0IHR5cGUgSVNjYW5uZWRFeHRlbnNpb25NYW5pZmVzdCA9IElSZWxheGVkRXh0ZW5zaW9uTWFuaWZlc3QgJiB7IF9fbWV0YWRhdGE/OiBNYW5pZmVzdE1ldGFkYXRhIH07XG5cbmludGVyZmFjZSBJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb24ge1xuXHR0eXBlOiBFeHRlbnNpb25UeXBlO1xuXHRpc0J1aWx0aW46IGJvb2xlYW47XG5cdGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyO1xuXHRtYW5pZmVzdDogSVJlbGF4ZWRFeHRlbnNpb25NYW5pZmVzdDtcblx0bG9jYXRpb246IFVSSTtcblx0dGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtO1xuXHRwdWJsaXNoZXJEaXNwbGF5TmFtZT86IHN0cmluZztcblx0bWV0YWRhdGE6IE1ldGFkYXRhIHwgdW5kZWZpbmVkO1xuXHRpc1ZhbGlkOiBib29sZWFuO1xuXHR2YWxpZGF0aW9uczogcmVhZG9ubHkgW1NldmVyaXR5LCBzdHJpbmddW107XG5cdHByZVJlbGVhc2U6IGJvb2xlYW47XG5cdGZvcmNlQXV0b1VwZGF0ZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgSVNjYW5uZWRFeHRlbnNpb24gPSBSZWFkb25seTxJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb24+ICYgeyBtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0IH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHJhbnNsYXRpb25zIHtcblx0W2lkOiBzdHJpbmddOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVHJhbnNsYXRpb25zIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGVxdWFscyhhOiBUcmFuc2xhdGlvbnMsIGI6IFRyYW5zbGF0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdGlmIChhID09PSBiKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgYUtleXMgPSBPYmplY3Qua2V5cyhhKTtcblx0XHRjb25zdCBiS2V5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhiKSkge1xuXHRcdFx0YktleXMuYWRkKGtleSk7XG5cdFx0fVxuXHRcdGlmIChhS2V5cy5sZW5ndGggIT09IGJLZXlzLnNpemUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBhS2V5cykge1xuXHRcdFx0aWYgKGFba2V5XSAhPT0gYltrZXldKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGJLZXlzLmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0XHRyZXR1cm4gYktleXMuc2l6ZSA9PT0gMDtcblx0fVxufVxuXG5pbnRlcmZhY2UgTWVzc2FnZUJhZyB7XG5cdFtrZXk6IHN0cmluZ106IHN0cmluZyB8IHsgbWVzc2FnZTogc3RyaW5nOyBjb21tZW50OiBzdHJpbmdbXSB9O1xufVxuXG5pbnRlcmZhY2UgVHJhbnNsYXRpb25CdW5kbGUge1xuXHRjb250ZW50czoge1xuXHRcdHBhY2thZ2U6IE1lc3NhZ2VCYWc7XG5cdH07XG59XG5cbmludGVyZmFjZSBMb2NhbGl6ZWRNZXNzYWdlcyB7XG5cdHZhbHVlczogTWVzc2FnZUJhZyB8IHVuZGVmaW5lZDtcblx0ZGVmYXVsdDogVVJJIHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIElCdWlsdEluRXh0ZW5zaW9uQ29udHJvbCB7XG5cdFtuYW1lOiBzdHJpbmddOiAnbWFya2V0cGxhY2UnIHwgJ2Rpc2FibGVkJyB8IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZ2V0UHJvZHVjdEJ1aWx0SW5FeHRlbnNpb25zRW5hYmxlZFdpdGhBdXRvVXBkYXRlcyhwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UpOiBTZXQ8c3RyaW5nPiB7XG5cdGNvbnN0IHJlc3VsdCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRmb3IgKGNvbnN0IGlkIG9mIHByb2R1Y3RTZXJ2aWNlLmJ1aWx0SW5FeHRlbnNpb25zRW5hYmxlZFdpdGhBdXRvVXBkYXRlcykge1xuXHRcdGNvbnN0IHRvTG93ZXJDYXNlSWQgPSBpZC50b0xvd2VyQ2FzZSgpO1xuXHRcdGlmIChlbnZpcm9ubWVudFNlcnZpY2Uuc2tpcEJ1aWx0aW5FeHRlbnNpb25zPy5zb21lKHNraXBJZCA9PiBza2lwSWQudG9Mb3dlckNhc2UoKSA9PT0gdG9Mb3dlckNhc2VJZCkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRyZXN1bHQuYWRkKHRvTG93ZXJDYXNlSWQpO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCB0eXBlIFN5c3RlbUV4dGVuc2lvbnNTY2FuT3B0aW9ucyA9IHtcblx0cmVhZG9ubHkgY2hlY2tDb250cm9sRmlsZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGxhbmd1YWdlPzogc3RyaW5nO1xufTtcblxuZXhwb3J0IHR5cGUgVXNlckV4dGVuc2lvbnNTY2FuT3B0aW9ucyA9IHtcblx0cmVhZG9ubHkgcHJvZmlsZUxvY2F0aW9uOiBVUkk7XG5cdHJlYWRvbmx5IGluY2x1ZGVJbnZhbGlkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbGFuZ3VhZ2U/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHVzZUNhY2hlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgcHJvZHVjdFZlcnNpb24/OiBJUHJvZHVjdFZlcnNpb247XG59O1xuXG5leHBvcnQgdHlwZSBTY2FuT3B0aW9ucyA9IHtcblx0cmVhZG9ubHkgaW5jbHVkZUludmFsaWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBsYW5ndWFnZT86IHN0cmluZztcbn07XG5cbmV4cG9ydCBjb25zdCBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2U+KCdJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlJyk7XG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgc3lzdGVtRXh0ZW5zaW9uc0xvY2F0aW9uOiBVUkk7XG5cdHJlYWRvbmx5IHVzZXJFeHRlbnNpb25zTG9jYXRpb246IFVSSTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDYWNoZTogRXZlbnQ8RXh0ZW5zaW9uVHlwZT47XG5cblx0c2NhbkFsbEV4dGVuc2lvbnMoc3lzdGVtU2Nhbk9wdGlvbnM6IFN5c3RlbUV4dGVuc2lvbnNTY2FuT3B0aW9ucywgdXNlclNjYW5PcHRpb25zOiBVc2VyRXh0ZW5zaW9uc1NjYW5PcHRpb25zKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbltdPjtcblx0c2NhblN5c3RlbUV4dGVuc2lvbnMoc2Nhbk9wdGlvbnM6IFN5c3RlbUV4dGVuc2lvbnNTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT47XG5cdHNjYW5Vc2VyRXh0ZW5zaW9ucyhzY2FuT3B0aW9uczogVXNlckV4dGVuc2lvbnNTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT47XG5cdHNjYW5BbGxVc2VyRXh0ZW5zaW9ucygpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+O1xuXG5cdHNjYW5FeHRlbnNpb25zVW5kZXJEZXZlbG9wbWVudChleGlzdGluZ0V4dGVuc2lvbnM6IElTY2FubmVkRXh0ZW5zaW9uW10sIHNjYW5PcHRpb25zOiBTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT47XG5cdHNjYW5FeGlzdGluZ0V4dGVuc2lvbihleHRlbnNpb25Mb2NhdGlvbjogVVJJLCBleHRlbnNpb25UeXBlOiBFeHRlbnNpb25UeXBlLCBzY2FuT3B0aW9uczogU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uIHwgbnVsbD47XG5cdHNjYW5NdWx0aXBsZUV4dGVuc2lvbnMoZXh0ZW5zaW9uTG9jYXRpb25zOiBVUklbXSwgZXh0ZW5zaW9uVHlwZTogRXh0ZW5zaW9uVHlwZSwgc2Nhbk9wdGlvbnM6IFNjYW5PcHRpb25zKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbltdPjtcblx0c2Nhbk9uZU9yTXVsdGlwbGVFeHRlbnNpb25zKGV4dGVuc2lvbkxvY2F0aW9uOiBVUkksIGV4dGVuc2lvblR5cGU6IEV4dGVuc2lvblR5cGUsIHNjYW5PcHRpb25zOiBTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT47XG5cblx0dXBkYXRlTWFuaWZlc3RNZXRhZGF0YShleHRlbnNpb25Mb2NhdGlvbjogVVJJLCBtZXRhZGF0YTogTWFuaWZlc3RNZXRhZGF0YSk6IFByb21pc2U8dm9pZD47XG5cdGluaXRpYWxpemVEZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnMoKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0RXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0VHJhbnNsYXRpb25zKGxhbmd1YWdlOiBzdHJpbmcpOiBQcm9taXNlPFRyYW5zbGF0aW9ucz47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDYWNoZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEV4dGVuc2lvblR5cGU+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNhY2hlID0gdGhpcy5fb25EaWRDaGFuZ2VDYWNoZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHN5c3RlbUV4dGVuc2lvbnNDYWNoZWRTY2FubmVyOiBDYWNoZWRFeHRlbnNpb25zU2Nhbm5lcjtcblx0cHJpdmF0ZSByZWFkb25seSB1c2VyRXh0ZW5zaW9uc0NhY2hlZFNjYW5uZXI6IENhY2hlZEV4dGVuc2lvbnNTY2FubmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNTY2FubmVyOiBFeHRlbnNpb25zU2Nhbm5lcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBzeXN0ZW1FeHRlbnNpb25zTG9jYXRpb246IFVSSSxcblx0XHRyZWFkb25seSB1c2VyRXh0ZW5zaW9uc0xvY2F0aW9uOiBVUkksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zQ29udHJvbExvY2F0aW9uOiBVUkksXG5cdFx0Y3VycmVudFByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBleHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnN5c3RlbUV4dGVuc2lvbnNDYWNoZWRTY2FubmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDYWNoZWRFeHRlbnNpb25zU2Nhbm5lciwgY3VycmVudFByb2ZpbGUpKTtcblx0XHR0aGlzLnVzZXJFeHRlbnNpb25zQ2FjaGVkU2Nhbm5lciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2FjaGVkRXh0ZW5zaW9uc1NjYW5uZXIsIGN1cnJlbnRQcm9maWxlKSk7XG5cdFx0dGhpcy5leHRlbnNpb25zU2Nhbm5lciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc1NjYW5uZXIpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3lzdGVtRXh0ZW5zaW9uc0NhY2hlZFNjYW5uZXIub25EaWRDaGFuZ2VDYWNoZSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUNhY2hlLmZpcmUoRXh0ZW5zaW9uVHlwZS5TeXN0ZW0pKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRXh0ZW5zaW9uc0NhY2hlZFNjYW5uZXIub25EaWRDaGFuZ2VDYWNoZSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUNhY2hlLmZpcmUoRXh0ZW5zaW9uVHlwZS5Vc2VyKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdGFyZ2V0UGxhdGZvcm1Qcm9taXNlOiBQcm9taXNlPFRhcmdldFBsYXRmb3JtPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXRUYXJnZXRQbGF0Zm9ybSgpOiBQcm9taXNlPFRhcmdldFBsYXRmb3JtPiB7XG5cdFx0aWYgKCF0aGlzLl90YXJnZXRQbGF0Zm9ybVByb21pc2UpIHtcblx0XHRcdHRoaXMuX3RhcmdldFBsYXRmb3JtUHJvbWlzZSA9IGNvbXB1dGVUYXJnZXRQbGF0Zm9ybSh0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGFyZ2V0UGxhdGZvcm1Qcm9taXNlO1xuXHR9XG5cblx0YXN5bmMgc2NhbkFsbEV4dGVuc2lvbnMoc3lzdGVtU2Nhbk9wdGlvbnM6IFN5c3RlbUV4dGVuc2lvbnNTY2FuT3B0aW9ucywgdXNlclNjYW5PcHRpb25zOiBVc2VyRXh0ZW5zaW9uc1NjYW5PcHRpb25zKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgW3N5c3RlbSwgdXNlcl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLnNjYW5TeXN0ZW1FeHRlbnNpb25zKHN5c3RlbVNjYW5PcHRpb25zKSxcblx0XHRcdHRoaXMuc2NhblVzZXJFeHRlbnNpb25zKHVzZXJTY2FuT3B0aW9ucyksXG5cdFx0XSk7XG5cdFx0cmV0dXJuIHRoaXMuZGVkdXBFeHRlbnNpb25zKHN5c3RlbSwgdXNlciwgW10sIGF3YWl0IHRoaXMuZ2V0VGFyZ2V0UGxhdGZvcm0oKSwgdHJ1ZSk7XG5cdH1cblxuXHRhc3luYyBzY2FuU3lzdGVtRXh0ZW5zaW9ucyhzY2FuT3B0aW9uczogU3lzdGVtRXh0ZW5zaW9uc1NjYW5PcHRpb25zKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uW10+W10gPSBbXTtcblx0XHRwcm9taXNlcy5wdXNoKHRoaXMuc2NhbkRlZmF1bHRTeXN0ZW1FeHRlbnNpb25zKHNjYW5PcHRpb25zLmxhbmd1YWdlKSk7XG5cdFx0cHJvbWlzZXMucHVzaCh0aGlzLnNjYW5EZXZTeXN0ZW1FeHRlbnNpb25zKHNjYW5PcHRpb25zLmxhbmd1YWdlLCAhIXNjYW5PcHRpb25zLmNoZWNrQ29udHJvbEZpbGUpKTtcblx0XHRjb25zdCBbZGVmYXVsdFN5c3RlbUV4dGVuc2lvbnMsIGRldlN5c3RlbUV4dGVuc2lvbnNdID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdGxldCBhbGxTeXN0ZW1FeHRlbnNpb25zID0gWy4uLmRlZmF1bHRTeXN0ZW1FeHRlbnNpb25zLCAuLi5kZXZTeXN0ZW1FeHRlbnNpb25zXTtcblxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5za2lwQnVpbHRpbkV4dGVuc2lvbnM/Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3Qgc2tpcFNldCA9IG5ldyBTZXQodGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uuc2tpcEJ1aWx0aW5FeHRlbnNpb25zLm1hcChpZCA9PiBpZC50b0xvd2VyQ2FzZSgpKSk7XG5cdFx0XHRhbGxTeXN0ZW1FeHRlbnNpb25zID0gYWxsU3lzdGVtRXh0ZW5zaW9ucy5maWx0ZXIoZXh0ID0+ICFza2lwU2V0LmhhcyhleHQuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuYXBwbHlTY2FuT3B0aW9ucyhhbGxTeXN0ZW1FeHRlbnNpb25zLCBFeHRlbnNpb25UeXBlLlN5c3RlbSwgeyBwaWNrTGF0ZXN0OiBmYWxzZSB9KTtcblx0fVxuXG5cdGFzeW5jIHNjYW5Vc2VyRXh0ZW5zaW9ucyhzY2FuT3B0aW9uczogVXNlckV4dGVuc2lvbnNTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnU3RhcnRlZCBzY2FubmluZyB1c2VyIGV4dGVuc2lvbnMnLCBzY2FuT3B0aW9ucy5wcm9maWxlTG9jYXRpb24pO1xuXHRcdGNvbnN0IHByb2ZpbGVTY2FuT3B0aW9uczogSVByb2ZpbGVFeHRlbnNpb25zU2Nhbk9wdGlvbnMgfCB1bmRlZmluZWQgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChzY2FuT3B0aW9ucy5wcm9maWxlTG9jYXRpb24sIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKSA/IHsgYmFpbE91dFdoZW5GaWxlTm90Rm91bmQ6IHRydWUgfSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBleHRlbnNpb25zU2Nhbm5lcklucHV0ID0gYXdhaXQgdGhpcy5jcmVhdGVFeHRlbnNpb25TY2FubmVySW5wdXQoc2Nhbk9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLCB0cnVlLCBFeHRlbnNpb25UeXBlLlVzZXIsIHNjYW5PcHRpb25zLmxhbmd1YWdlLCB0cnVlLCBwcm9maWxlU2Nhbk9wdGlvbnMsIHNjYW5PcHRpb25zLnByb2R1Y3RWZXJzaW9uID8/IHRoaXMuZ2V0UHJvZHVjdFZlcnNpb24oKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1NjYW5uZXIgPSBzY2FuT3B0aW9ucy51c2VDYWNoZSAmJiAhZXh0ZW5zaW9uc1NjYW5uZXJJbnB1dC5kZXZNb2RlID8gdGhpcy51c2VyRXh0ZW5zaW9uc0NhY2hlZFNjYW5uZXIgOiB0aGlzLmV4dGVuc2lvbnNTY2FubmVyO1xuXHRcdGxldCBleHRlbnNpb25zOiBJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb25bXTtcblx0XHR0cnkge1xuXHRcdFx0ZXh0ZW5zaW9ucyA9IGF3YWl0IGV4dGVuc2lvbnNTY2FubmVyLnNjYW5FeHRlbnNpb25zKGV4dGVuc2lvbnNTY2FubmVySW5wdXQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBFeHRlbnNpb25zUHJvZmlsZVNjYW5uaW5nRXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmluZ0Vycm9yQ29kZS5FUlJPUl9QUk9GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvSW5pdGlhbGl6ZURlZmF1bHRQcm9maWxlRXh0ZW5zaW9ucygpO1xuXHRcdFx0XHRleHRlbnNpb25zID0gYXdhaXQgZXh0ZW5zaW9uc1NjYW5uZXIuc2NhbkV4dGVuc2lvbnMoZXh0ZW5zaW9uc1NjYW5uZXJJbnB1dCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuYXBwbHlTY2FuT3B0aW9ucyhleHRlbnNpb25zLCBFeHRlbnNpb25UeXBlLlVzZXIsIHsgaW5jbHVkZUludmFsaWQ6IHNjYW5PcHRpb25zLmluY2x1ZGVJbnZhbGlkLCBwaWNrTGF0ZXN0OiB0cnVlIH0pO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnU2Nhbm5lZCB1c2VyIGV4dGVuc2lvbnM6JywgZXh0ZW5zaW9ucy5sZW5ndGgpO1xuXHRcdHJldHVybiBleHRlbnNpb25zO1xuXHR9XG5cblx0YXN5bmMgc2NhbkFsbFVzZXJFeHRlbnNpb25zKHNjYW5PcHRpb25zOiB7IGluY2x1ZGVBbGxWZXJzaW9ucz86IGJvb2xlYW47IGluY2x1ZGVJbnZhbGlkOiBib29sZWFuIH0gPSB7IGluY2x1ZGVJbnZhbGlkOiB0cnVlLCBpbmNsdWRlQWxsVmVyc2lvbnM6IHRydWUgfSk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNTY2FubmVySW5wdXQgPSBhd2FpdCB0aGlzLmNyZWF0ZUV4dGVuc2lvblNjYW5uZXJJbnB1dCh0aGlzLnVzZXJFeHRlbnNpb25zTG9jYXRpb24sIGZhbHNlLCBFeHRlbnNpb25UeXBlLlVzZXIsIHVuZGVmaW5lZCwgdHJ1ZSwgdW5kZWZpbmVkLCB0aGlzLmdldFByb2R1Y3RWZXJzaW9uKCkpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnNjYW5FeHRlbnNpb25zKGV4dGVuc2lvbnNTY2FubmVySW5wdXQpO1xuXHRcdHJldHVybiB0aGlzLmFwcGx5U2Nhbk9wdGlvbnMoZXh0ZW5zaW9ucywgRXh0ZW5zaW9uVHlwZS5Vc2VyLCB7IGluY2x1ZGVBbGxWZXJzaW9uczogc2Nhbk9wdGlvbnMuaW5jbHVkZUFsbFZlcnNpb25zLCBpbmNsdWRlSW52YWxpZDogc2Nhbk9wdGlvbnMuaW5jbHVkZUludmFsaWQgfSk7XG5cdH1cblxuXHRhc3luYyBzY2FuRXh0ZW5zaW9uc1VuZGVyRGV2ZWxvcG1lbnQoZXhpc3RpbmdFeHRlbnNpb25zOiBJU2Nhbm5lZEV4dGVuc2lvbltdLCBzY2FuT3B0aW9uczogU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNFeHRlbnNpb25EZXZlbG9wbWVudCAmJiB0aGlzLmVudmlyb25tZW50U2VydmljZS5leHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zID0gKGF3YWl0IFByb21pc2UuYWxsKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmV4dGVuc2lvbkRldmVsb3BtZW50TG9jYXRpb25VUkkuZmlsdGVyKGV4dExvYyA9PiBleHRMb2Muc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpXG5cdFx0XHRcdC5tYXAoYXN5bmMgZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaW5wdXQgPSBhd2FpdCB0aGlzLmNyZWF0ZUV4dGVuc2lvblNjYW5uZXJJbnB1dChleHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJLCBmYWxzZSwgRXh0ZW5zaW9uVHlwZS5Vc2VyLCBzY2FuT3B0aW9ucy5sYW5ndWFnZSwgZmFsc2UgLyogZG8gbm90IHZhbGlkYXRlICovLCB1bmRlZmluZWQsIHRoaXMuZ2V0UHJvZHVjdFZlcnNpb24oKSk7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuc2Nhbk9uZU9yTXVsdGlwbGVFeHRlbnNpb25zKGlucHV0KTtcblx0XHRcdFx0XHRyZXR1cm4gZXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0XHRcdC8vIE92ZXJyaWRlIHRoZSBleHRlbnNpb24gdHlwZSBmcm9tIHRoZSBleGlzdGluZyBleHRlbnNpb25zXG5cdFx0XHRcdFx0XHRleHRlbnNpb24udHlwZSA9IGV4aXN0aW5nRXh0ZW5zaW9ucy5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpPy50eXBlID8/IGV4dGVuc2lvbi50eXBlO1xuXHRcdFx0XHRcdFx0Ly8gVmFsaWRhdGUgdGhlIGV4dGVuc2lvblxuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIudmFsaWRhdGUoZXh0ZW5zaW9uLCBpbnB1dCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pKSlcblx0XHRcdFx0LmZsYXQoKTtcblx0XHRcdHJldHVybiB0aGlzLmFwcGx5U2Nhbk9wdGlvbnMoZXh0ZW5zaW9ucywgJ2RldmVsb3BtZW50JywgeyBpbmNsdWRlSW52YWxpZDogc2Nhbk9wdGlvbnMuaW5jbHVkZUludmFsaWQsIHBpY2tMYXRlc3Q6IHRydWUgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIHNjYW5FeGlzdGluZ0V4dGVuc2lvbihleHRlbnNpb25Mb2NhdGlvbjogVVJJLCBleHRlbnNpb25UeXBlOiBFeHRlbnNpb25UeXBlLCBzY2FuT3B0aW9uczogU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNTY2FubmVySW5wdXQgPSBhd2FpdCB0aGlzLmNyZWF0ZUV4dGVuc2lvblNjYW5uZXJJbnB1dChleHRlbnNpb25Mb2NhdGlvbiwgZmFsc2UsIGV4dGVuc2lvblR5cGUsIHNjYW5PcHRpb25zLmxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHRoaXMuZ2V0UHJvZHVjdFZlcnNpb24oKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lci5zY2FuRXh0ZW5zaW9uKGV4dGVuc2lvbnNTY2FubmVySW5wdXQpO1xuXHRcdGlmICghZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKCFzY2FuT3B0aW9ucy5pbmNsdWRlSW52YWxpZCAmJiAhZXh0ZW5zaW9uLmlzVmFsaWQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gZXh0ZW5zaW9uO1xuXHR9XG5cblx0YXN5bmMgc2Nhbk9uZU9yTXVsdGlwbGVFeHRlbnNpb25zKGV4dGVuc2lvbkxvY2F0aW9uOiBVUkksIGV4dGVuc2lvblR5cGU6IEV4dGVuc2lvblR5cGUsIHNjYW5PcHRpb25zOiBTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNTY2FubmVySW5wdXQgPSBhd2FpdCB0aGlzLmNyZWF0ZUV4dGVuc2lvblNjYW5uZXJJbnB1dChleHRlbnNpb25Mb2NhdGlvbiwgZmFsc2UsIGV4dGVuc2lvblR5cGUsIHNjYW5PcHRpb25zLmxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHRoaXMuZ2V0UHJvZHVjdFZlcnNpb24oKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuc2Nhbk9uZU9yTXVsdGlwbGVFeHRlbnNpb25zKGV4dGVuc2lvbnNTY2FubmVySW5wdXQpO1xuXHRcdHJldHVybiB0aGlzLmFwcGx5U2Nhbk9wdGlvbnMoZXh0ZW5zaW9ucywgZXh0ZW5zaW9uVHlwZSwgeyBpbmNsdWRlSW52YWxpZDogc2Nhbk9wdGlvbnMuaW5jbHVkZUludmFsaWQsIHBpY2tMYXRlc3Q6IHRydWUgfSk7XG5cdH1cblxuXHRhc3luYyBzY2FuTXVsdGlwbGVFeHRlbnNpb25zKGV4dGVuc2lvbkxvY2F0aW9uczogVVJJW10sIGV4dGVuc2lvblR5cGU6IEV4dGVuc2lvblR5cGUsIHNjYW5PcHRpb25zOiBTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnM6IElSZWxheGVkU2Nhbm5lZEV4dGVuc2lvbltdID0gW107XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoZXh0ZW5zaW9uTG9jYXRpb25zLm1hcChhc3luYyBleHRlbnNpb25Mb2NhdGlvbiA9PiB7XG5cdFx0XHRjb25zdCBzY2FubmVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuc2Nhbk9uZU9yTXVsdGlwbGVFeHRlbnNpb25zKGV4dGVuc2lvbkxvY2F0aW9uLCBleHRlbnNpb25UeXBlLCBzY2FuT3B0aW9ucyk7XG5cdFx0XHRleHRlbnNpb25zLnB1c2goLi4uc2Nhbm5lZEV4dGVuc2lvbnMpO1xuXHRcdH0pKTtcblx0XHRyZXR1cm4gdGhpcy5hcHBseVNjYW5PcHRpb25zKGV4dGVuc2lvbnMsIGV4dGVuc2lvblR5cGUsIHsgaW5jbHVkZUludmFsaWQ6IHNjYW5PcHRpb25zLmluY2x1ZGVJbnZhbGlkLCBwaWNrTGF0ZXN0OiB0cnVlIH0pO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlTWFuaWZlc3RNZXRhZGF0YShleHRlbnNpb25Mb2NhdGlvbjogVVJJLCBtZXRhRGF0YTogTWFuaWZlc3RNZXRhZGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1hbmlmZXN0TG9jYXRpb24gPSBqb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgJ3BhY2thZ2UuanNvbicpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShtYW5pZmVzdExvY2F0aW9uKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRjb25zdCBtYW5pZmVzdDogSVNjYW5uZWRFeHRlbnNpb25NYW5pZmVzdCA9IEpTT04ucGFyc2UoY29udGVudCk7XG5cdFx0bWFuaWZlc3QuX19tZXRhZGF0YSA9IHsgLi4ubWFuaWZlc3QuX19tZXRhZGF0YSwgLi4ubWV0YURhdGEgfTtcblxuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGpvaW5QYXRoKGV4dGVuc2lvbkxvY2F0aW9uLCAncGFja2FnZS5qc29uJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkobWFuaWZlc3QsIG51bGwsICdcXHQnKSkpO1xuXHR9XG5cblx0YXN5bmMgaW5pdGlhbGl6ZURlZmF1bHRQcm9maWxlRXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLnNjYW5Qcm9maWxlRXh0ZW5zaW9ucyh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSwgeyBiYWlsT3V0V2hlbkZpbGVOb3RGb3VuZDogdHJ1ZSB9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmluZ0Vycm9yICYmIGVycm9yLmNvZGUgPT09IEV4dGVuc2lvbnNQcm9maWxlU2Nhbm5pbmdFcnJvckNvZGUuRVJST1JfUFJPRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kb0luaXRpYWxpemVEZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaW5pdGlhbGl6ZURlZmF1bHRQcm9maWxlRXh0ZW5zaW9uc1Byb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXN5bmMgZG9Jbml0aWFsaXplRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pbml0aWFsaXplRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5pbml0aWFsaXplRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1N0YXJ0ZWQgaW5pdGlhbGl6aW5nIGRlZmF1bHQgcHJvZmlsZSBleHRlbnNpb25zIGluIGV4dGVuc2lvbnMgaW5zdGFsbGF0aW9uIGZvbGRlci4nLCB0aGlzLnVzZXJFeHRlbnNpb25zTG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0Y29uc3QgdXNlckV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnNjYW5BbGxVc2VyRXh0ZW5zaW9ucyh7IGluY2x1ZGVJbnZhbGlkOiB0cnVlIH0pO1xuXHRcdFx0XHRcdGlmICh1c2VyRXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5hZGRFeHRlbnNpb25zVG9Qcm9maWxlKHVzZXJFeHRlbnNpb25zLm1hcChlID0+IFtlLCBlLm1ldGFkYXRhXSksIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5jcmVhdGVGaWxlKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KFtdKSkpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignRmFpbGVkIHRvIGNyZWF0ZSBkZWZhdWx0IHByb2ZpbGUgZXh0ZW5zaW9ucyBtYW5pZmVzdCBpbiBleHRlbnNpb25zIGluc3RhbGxhdGlvbiBmb2xkZXIuJywgdGhpcy51c2VyRXh0ZW5zaW9uc0xvY2F0aW9uLnRvU3RyaW5nKCksIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdDb21wbGV0ZWQgaW5pdGlhbGl6aW5nIGRlZmF1bHQgcHJvZmlsZSBleHRlbnNpb25zIGluIGV4dGVuc2lvbnMgaW5zdGFsbGF0aW9uIGZvbGRlci4nLCB0aGlzLnVzZXJFeHRlbnNpb25zTG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLmluaXRpYWxpemVEZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnNQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5pbml0aWFsaXplRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXBwbHlTY2FuT3B0aW9ucyhleHRlbnNpb25zOiBJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb25bXSwgdHlwZTogRXh0ZW5zaW9uVHlwZSB8ICdkZXZlbG9wbWVudCcsIHNjYW5PcHRpb25zOiB7IGluY2x1ZGVBbGxWZXJzaW9ucz86IGJvb2xlYW47IGluY2x1ZGVJbnZhbGlkPzogYm9vbGVhbjsgcGlja0xhdGVzdD86IGJvb2xlYW4gfSA9IHt9KTogUHJvbWlzZTxJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdGlmICghc2Nhbk9wdGlvbnMuaW5jbHVkZUFsbFZlcnNpb25zKSB7XG5cdFx0XHRleHRlbnNpb25zID0gdGhpcy5kZWR1cEV4dGVuc2lvbnModHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0gPyBleHRlbnNpb25zIDogdW5kZWZpbmVkLCB0eXBlID09PSBFeHRlbnNpb25UeXBlLlVzZXIgPyBleHRlbnNpb25zIDogdW5kZWZpbmVkLCB0eXBlID09PSAnZGV2ZWxvcG1lbnQnID8gZXh0ZW5zaW9ucyA6IHVuZGVmaW5lZCwgYXdhaXQgdGhpcy5nZXRUYXJnZXRQbGF0Zm9ybSgpLCAhIXNjYW5PcHRpb25zLnBpY2tMYXRlc3QpO1xuXHRcdH1cblx0XHRpZiAoIXNjYW5PcHRpb25zLmluY2x1ZGVJbnZhbGlkKSB7XG5cdFx0XHRleHRlbnNpb25zID0gZXh0ZW5zaW9ucy5maWx0ZXIoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5pc1ZhbGlkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4dGVuc2lvbnMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0Y29uc3QgYUxhc3RTZWdtZW50ID0gcGF0aC5iYXNlbmFtZShhLmxvY2F0aW9uLmZzUGF0aCk7XG5cdFx0XHRjb25zdCBiTGFzdFNlZ21lbnQgPSBwYXRoLmJhc2VuYW1lKGIubG9jYXRpb24uZnNQYXRoKTtcblx0XHRcdGlmIChhTGFzdFNlZ21lbnQgPCBiTGFzdFNlZ21lbnQpIHtcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFMYXN0U2VnbWVudCA+IGJMYXN0U2VnbWVudCkge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH1cblx0XHRcdHJldHVybiAwO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBkZWR1cEV4dGVuc2lvbnMoc3lzdGVtOiBJU2Nhbm5lZEV4dGVuc2lvbltdIHwgdW5kZWZpbmVkLCB1c2VyOiBJU2Nhbm5lZEV4dGVuc2lvbltdIHwgdW5kZWZpbmVkLCBkZXZlbG9wbWVudDogSVNjYW5uZWRFeHRlbnNpb25bXSB8IHVuZGVmaW5lZCwgdGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtLCBwaWNrTGF0ZXN0OiBib29sZWFuKTogSVNjYW5uZWRFeHRlbnNpb25bXSB7XG5cdFx0Y29uc3QgcGljayA9IChleGlzdGluZzogSVNjYW5uZWRFeHRlbnNpb24sIGV4dGVuc2lvbjogSVNjYW5uZWRFeHRlbnNpb24sIGlzRGV2ZWxvcG1lbnQ6IGJvb2xlYW4pOiBib29sZWFuID0+IHtcblx0XHRcdGlmICghaXNEZXZlbG9wbWVudCAmJiAhKGV4aXN0aW5nLmlzQnVpbHRpbiB8fCBleHRlbnNpb24uaXNCdWlsdGluKSkge1xuXHRcdFx0XHRpZiAoZXhpc3RpbmcubWV0YWRhdGE/LmlzQXBwbGljYXRpb25TY29wZWQgJiYgIWV4dGVuc2lvbi5tZXRhZGF0YT8uaXNBcHBsaWNhdGlvblNjb3BlZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWV4aXN0aW5nLm1ldGFkYXRhPy5pc0FwcGxpY2F0aW9uU2NvcGVkICYmIGV4dGVuc2lvbi5tZXRhZGF0YT8uaXNBcHBsaWNhdGlvblNjb3BlZCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXhpc3RpbmcuaXNWYWxpZCAmJiAhZXh0ZW5zaW9uLmlzVmFsaWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV4aXN0aW5nLmlzVmFsaWQgPT09IGV4dGVuc2lvbi5pc1ZhbGlkKSB7XG5cdFx0XHRcdGlmIChwaWNrTGF0ZXN0ICYmIHNlbXZlci5ndChleGlzdGluZy5tYW5pZmVzdC52ZXJzaW9uLCBleHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbikpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFNraXBwaW5nIGV4dGVuc2lvbiAke2V4dGVuc2lvbi5sb2NhdGlvbi5wYXRofSB3aXRoIGxvd2VyIHZlcnNpb24gJHtleHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbn0gaW4gZmF2b3VyIG9mICR7ZXhpc3RpbmcubG9jYXRpb24ucGF0aH0gd2l0aCB2ZXJzaW9uICR7ZXhpc3RpbmcubWFuaWZlc3QudmVyc2lvbn1gKTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNlbXZlci5lcShleGlzdGluZy5tYW5pZmVzdC52ZXJzaW9uLCBleHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbikpIHtcblx0XHRcdFx0XHRpZiAoZXhpc3RpbmcudHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0pIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgU2tpcHBpbmcgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uLmxvY2F0aW9uLnBhdGh9IGluIGZhdm91ciBvZiBzeXN0ZW0gZXh0ZW5zaW9uICR7ZXhpc3RpbmcubG9jYXRpb24ucGF0aH0gd2l0aCBzYW1lIHZlcnNpb25gKTtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGV4aXN0aW5nLnRhcmdldFBsYXRmb3JtID09PSB0YXJnZXRQbGF0Zm9ybSkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBTa2lwcGluZyBleHRlbnNpb24gJHtleHRlbnNpb24ubG9jYXRpb24ucGF0aH0gZnJvbSBkaWZmZXJlbnQgdGFyZ2V0IHBsYXRmb3JtICR7ZXh0ZW5zaW9uLnRhcmdldFBsYXRmb3JtfWApO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGlzRGV2ZWxvcG1lbnQpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYE92ZXJ3cml0aW5nIHVzZXIgZXh0ZW5zaW9uICR7ZXhpc3RpbmcubG9jYXRpb24ucGF0aH0gd2l0aCAke2V4dGVuc2lvbi5sb2NhdGlvbi5wYXRofS5gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgT3ZlcndyaXRpbmcgdXNlciBleHRlbnNpb24gJHtleGlzdGluZy5sb2NhdGlvbi5wYXRofSB3aXRoICR7ZXh0ZW5zaW9uLmxvY2F0aW9uLnBhdGh9LmApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxJU2Nhbm5lZEV4dGVuc2lvbj4oKTtcblx0XHRzeXN0ZW0/LmZvckVhY2goKGV4dGVuc2lvbikgPT4ge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSByZXN1bHQuZ2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdGlmICghZXhpc3RpbmcgfHwgcGljayhleGlzdGluZywgZXh0ZW5zaW9uLCBmYWxzZSkpIHtcblx0XHRcdFx0cmVzdWx0LnNldChleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBwcm9kdWN0QnVpbHRJbkV4dGVuc2lvbnNFbmFibGVkV2l0aEF1dG9VcGRhdGVzID0gZ2V0UHJvZHVjdEJ1aWx0SW5FeHRlbnNpb25zRW5hYmxlZFdpdGhBdXRvVXBkYXRlcyh0aGlzLnByb2R1Y3RTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSk7XG5cdFx0dXNlcj8uZm9yRWFjaCgoZXh0ZW5zaW9uKSA9PiB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHJlc3VsdC5nZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0aWYgKCFleGlzdGluZyAmJiBzeXN0ZW0gJiYgZXh0ZW5zaW9uLnR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgU2tpcHBpbmcgb2Jzb2xldGUgc3lzdGVtIGV4dGVuc2lvbiAke2V4dGVuc2lvbi5sb2NhdGlvbi5wYXRofS5gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByb2R1Y3RCdWlsdEluRXh0ZW5zaW9uc0VuYWJsZWRXaXRoQXV0b1VwZGF0ZXMuaGFzKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpICYmICFleHRlbnNpb24uZm9yY2VBdXRvVXBkYXRlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBTa2lwcGluZyB1c2VyIGluc3RhbGxlZCBidWlsdGluIGV4dGVuc2lvbiAke2V4dGVuc2lvbi5pZGVudGlmaWVyLmlkfSB3aXRoIHZlcnNpb24gJHtleHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbn0gYmVjYXVzZSBpdCBpcyBub3QgYWxsb3dlZCB0byBpbiB0aGUgY3VycmVudCBwcm9kdWN0IHF1YWxpdHkgJHt0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHl9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghZXhpc3RpbmcgfHwgcGljayhleGlzdGluZywgZXh0ZW5zaW9uLCBmYWxzZSkpIHtcblx0XHRcdFx0cmVzdWx0LnNldChleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRkZXZlbG9wbWVudD8uZm9yRWFjaChleHRlbnNpb24gPT4ge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSByZXN1bHQuZ2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdGlmICghZXhpc3RpbmcgfHwgcGljayhleGlzdGluZywgZXh0ZW5zaW9uLCB0cnVlKSkge1xuXHRcdFx0XHRyZXN1bHQuc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnNldChleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gWy4uLnJlc3VsdC52YWx1ZXMoKV07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNjYW5EZWZhdWx0U3lzdGVtRXh0ZW5zaW9ucyhsYW5ndWFnZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnU3RhcnRlZCBzY2FubmluZyBzeXN0ZW0gZXh0ZW5zaW9ucycpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNTY2FubmVySW5wdXQgPSBhd2FpdCB0aGlzLmNyZWF0ZUV4dGVuc2lvblNjYW5uZXJJbnB1dCh0aGlzLnN5c3RlbUV4dGVuc2lvbnNMb2NhdGlvbiwgZmFsc2UsIEV4dGVuc2lvblR5cGUuU3lzdGVtLCBsYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB0aGlzLmdldFByb2R1Y3RWZXJzaW9uKCkpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNTY2FubmVyID0gZXh0ZW5zaW9uc1NjYW5uZXJJbnB1dC5kZXZNb2RlID8gdGhpcy5leHRlbnNpb25zU2Nhbm5lciA6IHRoaXMuc3lzdGVtRXh0ZW5zaW9uc0NhY2hlZFNjYW5uZXI7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXh0ZW5zaW9uc1NjYW5uZXIuc2NhbkV4dGVuc2lvbnMoZXh0ZW5zaW9uc1NjYW5uZXJJbnB1dCk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdTY2FubmVkIHN5c3RlbSBleHRlbnNpb25zOicsIHJlc3VsdC5sZW5ndGgpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNjYW5EZXZTeXN0ZW1FeHRlbnNpb25zKGxhbmd1YWdlOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNoZWNrQ29udHJvbEZpbGU6IGJvb2xlYW4pOiBQcm9taXNlPElSZWxheGVkU2Nhbm5lZEV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgZGV2U3lzdGVtRXh0ZW5zaW9uc0xpc3QgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0J1aWx0ID8gW10gOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmJ1aWx0SW5FeHRlbnNpb25zO1xuXHRcdGlmICghZGV2U3lzdGVtRXh0ZW5zaW9uc0xpc3Q/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnU3RhcnRlZCBzY2FubmluZyBkZXYgc3lzdGVtIGV4dGVuc2lvbnMnKTtcblx0XHRjb25zdCBidWlsdGluRXh0ZW5zaW9uQ29udHJvbCA9IGNoZWNrQ29udHJvbEZpbGUgPyBhd2FpdCB0aGlzLmdldEJ1aWx0SW5FeHRlbnNpb25Db250cm9sKCkgOiB7fTtcblx0XHRjb25zdCBkZXZTeXN0ZW1FeHRlbnNpb25zTG9jYXRpb25zOiBVUklbXSA9IFtdO1xuXHRcdGNvbnN0IGRldlN5c3RlbUV4dGVuc2lvbnNMb2NhdGlvbiA9IFVSSS5maWxlKHBhdGgubm9ybWFsaXplKHBhdGguam9pbihGaWxlQWNjZXNzLmFzRmlsZVVyaSgnJykuZnNQYXRoLCAnLi4nLCAnLmJ1aWxkJywgJ2J1aWx0SW5FeHRlbnNpb25zJykpKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBkZXZTeXN0ZW1FeHRlbnNpb25zTGlzdCkge1xuXHRcdFx0Y29uc3QgY29udHJvbFN0YXRlID0gYnVpbHRpbkV4dGVuc2lvbkNvbnRyb2xbZXh0ZW5zaW9uLm5hbWVdIHx8ICdtYXJrZXRwbGFjZSc7XG5cdFx0XHRzd2l0Y2ggKGNvbnRyb2xTdGF0ZSkge1xuXHRcdFx0XHRjYXNlICdkaXNhYmxlZCc6XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ21hcmtldHBsYWNlJzpcblx0XHRcdFx0XHRkZXZTeXN0ZW1FeHRlbnNpb25zTG9jYXRpb25zLnB1c2goam9pblBhdGgoZGV2U3lzdGVtRXh0ZW5zaW9uc0xvY2F0aW9uLCBleHRlbnNpb24ubmFtZSkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGRldlN5c3RlbUV4dGVuc2lvbnNMb2NhdGlvbnMucHVzaChVUkkuZmlsZShjb250cm9sU3RhdGUpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5hbGwoZGV2U3lzdGVtRXh0ZW5zaW9uc0xvY2F0aW9ucy5tYXAoYXN5bmMgbG9jYXRpb24gPT4gdGhpcy5leHRlbnNpb25zU2Nhbm5lci5zY2FuRXh0ZW5zaW9uKChhd2FpdCB0aGlzLmNyZWF0ZUV4dGVuc2lvblNjYW5uZXJJbnB1dChsb2NhdGlvbiwgZmFsc2UsIEV4dGVuc2lvblR5cGUuU3lzdGVtLCBsYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB0aGlzLmdldFByb2R1Y3RWZXJzaW9uKCkpKSkpKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1NjYW5uZWQgZGV2IHN5c3RlbSBleHRlbnNpb25zOicsIHJlc3VsdC5sZW5ndGgpO1xuXHRcdHJldHVybiBjb2FsZXNjZShyZXN1bHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRCdWlsdEluRXh0ZW5zaW9uQ29udHJvbCgpOiBQcm9taXNlPElCdWlsdEluRXh0ZW5zaW9uQ29udHJvbD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLmV4dGVuc2lvbnNDb250cm9sTG9jYXRpb24pO1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2UoY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlRXh0ZW5zaW9uU2Nhbm5lcklucHV0KGxvY2F0aW9uOiBVUkksIHByb2ZpbGU6IGJvb2xlYW4sIHR5cGU6IEV4dGVuc2lvblR5cGUsIGxhbmd1YWdlOiBzdHJpbmcgfCB1bmRlZmluZWQsIHZhbGlkYXRlOiBib29sZWFuLCBwcm9maWxlU2Nhbk9wdGlvbnM6IElQcm9maWxlRXh0ZW5zaW9uc1NjYW5PcHRpb25zIHwgdW5kZWZpbmVkLCBwcm9kdWN0VmVyc2lvbjogSVByb2R1Y3RWZXJzaW9uKTogUHJvbWlzZTxFeHRlbnNpb25TY2FubmVySW5wdXQ+IHtcblx0XHRjb25zdCB0cmFuc2xhdGlvbnMgPSBhd2FpdCB0aGlzLmdldFRyYW5zbGF0aW9ucyhsYW5ndWFnZSA/PyBwbGF0Zm9ybS5sYW5ndWFnZSk7XG5cdFx0Y29uc3QgbXRpbWUgPSBhd2FpdCB0aGlzLmdldE10aW1lKGxvY2F0aW9uKTtcblx0XHRjb25zdCBhcHBsaWNhdGlvbkV4dGVuc2lvbnNMb2NhdGlvbiA9IHByb2ZpbGUgJiYgIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGxvY2F0aW9uLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSkgPyB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhcHBsaWNhdGlvbkV4dGVuc2lvbnNMb2NhdGlvbk10aW1lID0gYXBwbGljYXRpb25FeHRlbnNpb25zTG9jYXRpb24gPyBhd2FpdCB0aGlzLmdldE10aW1lKGFwcGxpY2F0aW9uRXh0ZW5zaW9uc0xvY2F0aW9uKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gbmV3IEV4dGVuc2lvblNjYW5uZXJJbnB1dChcblx0XHRcdGxvY2F0aW9uLFxuXHRcdFx0bXRpbWUsXG5cdFx0XHRhcHBsaWNhdGlvbkV4dGVuc2lvbnNMb2NhdGlvbixcblx0XHRcdGFwcGxpY2F0aW9uRXh0ZW5zaW9uc0xvY2F0aW9uTXRpbWUsXG5cdFx0XHRwcm9maWxlLFxuXHRcdFx0cHJvZmlsZVNjYW5PcHRpb25zLFxuXHRcdFx0dHlwZSxcblx0XHRcdHZhbGlkYXRlLFxuXHRcdFx0cHJvZHVjdFZlcnNpb24udmVyc2lvbixcblx0XHRcdHByb2R1Y3RWZXJzaW9uLmRhdGUsXG5cdFx0XHR0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdCxcblx0XHRcdCF0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0J1aWx0LFxuXHRcdFx0bGFuZ3VhZ2UsXG5cdFx0XHR0cmFuc2xhdGlvbnMsXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0TXRpbWUobG9jYXRpb246IFVSSSk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQobG9jYXRpb24pO1xuXHRcdFx0aWYgKHR5cGVvZiBzdGF0Lm10aW1lID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRyZXR1cm4gc3RhdC5tdGltZTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIFRoYXQncyBvay4uLlxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQcm9kdWN0VmVyc2lvbigpOiBJUHJvZHVjdFZlcnNpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR2ZXJzaW9uOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sXG5cdFx0XHRkYXRlOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRhdGUsXG5cdFx0fTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25TY2FubmVySW5wdXQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBsb2NhdGlvbjogVVJJLFxuXHRcdHB1YmxpYyByZWFkb25seSBtdGltZTogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBhcHBsaWNhdGlvbkV4dGVuc2lvbnNsb2NhdGlvbjogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBhcHBsaWNhdGlvbkV4dGVuc2lvbnNsb2NhdGlvbk10aW1lOiBudW1iZXIgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHByb2ZpbGU6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IHByb2ZpbGVTY2FuT3B0aW9uczogSVByb2ZpbGVFeHRlbnNpb25zU2Nhbk9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHR5cGU6IEV4dGVuc2lvblR5cGUsXG5cdFx0cHVibGljIHJlYWRvbmx5IHZhbGlkYXRlOiBib29sZWFuLFxuXHRcdHB1YmxpYyByZWFkb25seSBwcm9kdWN0VmVyc2lvbjogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBwcm9kdWN0RGF0ZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBwcm9kdWN0Q29tbWl0OiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGRldk1vZGU6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IGxhbmd1YWdlOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHRyYW5zbGF0aW9uczogVHJhbnNsYXRpb25zXG5cdCkge1xuXHRcdC8vIEtlZXAgZW1wdHkhISAoSlNPTi5wYXJzZSlcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlTmxzQ29uZmlndXJhdGlvbihpbnB1dDogRXh0ZW5zaW9uU2Nhbm5lcklucHV0KTogTmxzQ29uZmlndXJhdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhbmd1YWdlOiBpbnB1dC5sYW5ndWFnZSxcblx0XHRcdHBzZXVkbzogaW5wdXQubGFuZ3VhZ2UgPT09ICdwc2V1ZG8nLFxuXHRcdFx0ZGV2TW9kZTogaW5wdXQuZGV2TW9kZSxcblx0XHRcdHRyYW5zbGF0aW9uczogaW5wdXQudHJhbnNsYXRpb25zXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZXF1YWxzKGE6IEV4dGVuc2lvblNjYW5uZXJJbnB1dCwgYjogRXh0ZW5zaW9uU2Nhbm5lcklucHV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdGlzRXF1YWwoYS5sb2NhdGlvbiwgYi5sb2NhdGlvbilcblx0XHRcdCYmIGEubXRpbWUgPT09IGIubXRpbWVcblx0XHRcdCYmIGlzRXF1YWwoYS5hcHBsaWNhdGlvbkV4dGVuc2lvbnNsb2NhdGlvbiwgYi5hcHBsaWNhdGlvbkV4dGVuc2lvbnNsb2NhdGlvbilcblx0XHRcdCYmIGEuYXBwbGljYXRpb25FeHRlbnNpb25zbG9jYXRpb25NdGltZSA9PT0gYi5hcHBsaWNhdGlvbkV4dGVuc2lvbnNsb2NhdGlvbk10aW1lXG5cdFx0XHQmJiBhLnByb2ZpbGUgPT09IGIucHJvZmlsZVxuXHRcdFx0JiYgb2JqZWN0cy5lcXVhbHMoYS5wcm9maWxlU2Nhbk9wdGlvbnMsIGIucHJvZmlsZVNjYW5PcHRpb25zKVxuXHRcdFx0JiYgYS50eXBlID09PSBiLnR5cGVcblx0XHRcdCYmIGEudmFsaWRhdGUgPT09IGIudmFsaWRhdGVcblx0XHRcdCYmIGEucHJvZHVjdFZlcnNpb24gPT09IGIucHJvZHVjdFZlcnNpb25cblx0XHRcdCYmIGEucHJvZHVjdERhdGUgPT09IGIucHJvZHVjdERhdGVcblx0XHRcdCYmIGEucHJvZHVjdENvbW1pdCA9PT0gYi5wcm9kdWN0Q29tbWl0XG5cdFx0XHQmJiBhLmRldk1vZGUgPT09IGIuZGV2TW9kZVxuXHRcdFx0JiYgYS5sYW5ndWFnZSA9PT0gYi5sYW5ndWFnZVxuXHRcdFx0JiYgVHJhbnNsYXRpb25zLmVxdWFscyhhLnRyYW5zbGF0aW9ucywgYi50cmFuc2xhdGlvbnMpXG5cdFx0KTtcblx0fVxufVxuXG50eXBlIE5sc0NvbmZpZ3VyYXRpb24gPSB7XG5cdGxhbmd1YWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHBzZXVkbzogYm9vbGVhbjtcblx0ZGV2TW9kZTogYm9vbGVhbjtcblx0dHJhbnNsYXRpb25zOiBUcmFuc2xhdGlvbnM7XG59O1xuXG5jbGFzcyBFeHRlbnNpb25zU2Nhbm5lciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFF1YWxpdHk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBwcm9kdWN0QnVpbHRJbkV4dGVuc2lvbnNFbmFibGVkV2l0aEF1dG9VcGRhdGVzOiBTZXQ8c3RyaW5nPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2U6IElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnByb2R1Y3RRdWFsaXR5ID0gcHJvZHVjdFNlcnZpY2UucXVhbGl0eTtcblx0XHR0aGlzLnByb2R1Y3RCdWlsdEluRXh0ZW5zaW9uc0VuYWJsZWRXaXRoQXV0b1VwZGF0ZXMgPSBnZXRQcm9kdWN0QnVpbHRJbkV4dGVuc2lvbnNFbmFibGVkV2l0aEF1dG9VcGRhdGVzKHByb2R1Y3RTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UpO1xuXHR9XG5cblx0YXN5bmMgc2NhbkV4dGVuc2lvbnMoaW5wdXQ6IEV4dGVuc2lvblNjYW5uZXJJbnB1dCk6IFByb21pc2U8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gaW5wdXQucHJvZmlsZVxuXHRcdFx0PyB0aGlzLnNjYW5FeHRlbnNpb25zRnJvbVByb2ZpbGUoaW5wdXQpXG5cdFx0XHQ6IHRoaXMuc2NhbkV4dGVuc2lvbnNGcm9tTG9jYXRpb24oaW5wdXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzY2FuRXh0ZW5zaW9uc0Zyb21Mb2NhdGlvbihpbnB1dDogRXh0ZW5zaW9uU2Nhbm5lcklucHV0KTogUHJvbWlzZTxJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUoaW5wdXQubG9jYXRpb24pO1xuXHRcdGlmICghc3RhdC5jaGlsZHJlbj8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCBQcm9taXNlLmFsbDxJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb24gfCBudWxsPihcblx0XHRcdHN0YXQuY2hpbGRyZW4ubWFwKGFzeW5jIGMgPT4ge1xuXHRcdFx0XHRpZiAoIWMuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBEbyBub3QgY29uc2lkZXIgdXNlciBleHRlbnNpb24gZm9sZGVyIHN0YXJ0aW5nIHdpdGggYC5gXG5cdFx0XHRcdGlmIChpbnB1dC50eXBlID09PSBFeHRlbnNpb25UeXBlLlVzZXIgJiYgYmFzZW5hbWUoYy5yZXNvdXJjZSkuaW5kZXhPZignLicpID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uU2Nhbm5lcklucHV0ID0gbmV3IEV4dGVuc2lvblNjYW5uZXJJbnB1dChjLnJlc291cmNlLCBpbnB1dC5tdGltZSwgaW5wdXQuYXBwbGljYXRpb25FeHRlbnNpb25zbG9jYXRpb24sIGlucHV0LmFwcGxpY2F0aW9uRXh0ZW5zaW9uc2xvY2F0aW9uTXRpbWUsIGlucHV0LnByb2ZpbGUsIGlucHV0LnByb2ZpbGVTY2FuT3B0aW9ucywgaW5wdXQudHlwZSwgaW5wdXQudmFsaWRhdGUsIGlucHV0LnByb2R1Y3RWZXJzaW9uLCBpbnB1dC5wcm9kdWN0RGF0ZSwgaW5wdXQucHJvZHVjdENvbW1pdCwgaW5wdXQuZGV2TW9kZSwgaW5wdXQubGFuZ3VhZ2UsIGlucHV0LnRyYW5zbGF0aW9ucyk7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNjYW5FeHRlbnNpb24oZXh0ZW5zaW9uU2Nhbm5lcklucHV0KTtcblx0XHRcdH0pKTtcblx0XHRyZXR1cm4gY29hbGVzY2UoZXh0ZW5zaW9ucylcblx0XHRcdC8vIFNvcnQ6IE1ha2Ugc3VyZSBleHRlbnNpb25zIGFyZSBpbiB0aGUgc2FtZSBvcmRlciBhbHdheXMuIEhlbHBzIGNhY2hlIGludmFsaWRhdGlvbiBldmVuIGlmIHRoZSBvcmRlciBjaGFuZ2VzLlxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEubG9jYXRpb24ucGF0aCA8IGIubG9jYXRpb24ucGF0aCA/IC0xIDogMSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNjYW5FeHRlbnNpb25zRnJvbVByb2ZpbGUoaW5wdXQ6IEV4dGVuc2lvblNjYW5uZXJJbnB1dCk6IFByb21pc2U8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRsZXQgcHJvZmlsZUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnNjYW5FeHRlbnNpb25zRnJvbVByb2ZpbGVSZXNvdXJjZShpbnB1dC5sb2NhdGlvbiwgKCkgPT4gdHJ1ZSwgaW5wdXQpO1xuXHRcdGlmIChpbnB1dC5hcHBsaWNhdGlvbkV4dGVuc2lvbnNsb2NhdGlvbiAmJiAhdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoaW5wdXQubG9jYXRpb24sIGlucHV0LmFwcGxpY2F0aW9uRXh0ZW5zaW9uc2xvY2F0aW9uKSkge1xuXHRcdFx0cHJvZmlsZUV4dGVuc2lvbnMgPSBwcm9maWxlRXh0ZW5zaW9ucy5maWx0ZXIoZSA9PiAhZS5tZXRhZGF0YT8uaXNBcHBsaWNhdGlvblNjb3BlZCk7XG5cdFx0XHRjb25zdCBhcHBsaWNhdGlvbkV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnNjYW5FeHRlbnNpb25zRnJvbVByb2ZpbGVSZXNvdXJjZShpbnB1dC5hcHBsaWNhdGlvbkV4dGVuc2lvbnNsb2NhdGlvbiwgKGUpID0+ICEhZS5tZXRhZGF0YT8uaXNCdWlsdGluIHx8ICEhZS5tZXRhZGF0YT8uaXNBcHBsaWNhdGlvblNjb3BlZCwgaW5wdXQpO1xuXHRcdFx0cHJvZmlsZUV4dGVuc2lvbnMucHVzaCguLi5hcHBsaWNhdGlvbkV4dGVuc2lvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvZmlsZUV4dGVuc2lvbnM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNjYW5FeHRlbnNpb25zRnJvbVByb2ZpbGVSZXNvdXJjZShwcm9maWxlUmVzb3VyY2U6IFVSSSwgZmlsdGVyOiAoZXh0ZW5zaW9uSW5mbzogSVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uKSA9PiBib29sZWFuLCBpbnB1dDogRXh0ZW5zaW9uU2Nhbm5lcklucHV0KTogUHJvbWlzZTxJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHNjYW5uZWRQcm9maWxlRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5zY2FuUHJvZmlsZUV4dGVuc2lvbnMocHJvZmlsZVJlc291cmNlLCBpbnB1dC5wcm9maWxlU2Nhbk9wdGlvbnMpO1xuXHRcdGlmICghc2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgUHJvbWlzZS5hbGw8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uIHwgbnVsbD4oXG5cdFx0XHRzY2FubmVkUHJvZmlsZUV4dGVuc2lvbnMubWFwKGFzeW5jIGV4dGVuc2lvbkluZm8gPT4ge1xuXHRcdFx0XHRpZiAoZmlsdGVyKGV4dGVuc2lvbkluZm8pKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uU2Nhbm5lcklucHV0ID0gbmV3IEV4dGVuc2lvblNjYW5uZXJJbnB1dChleHRlbnNpb25JbmZvLmxvY2F0aW9uLCBpbnB1dC5tdGltZSwgaW5wdXQuYXBwbGljYXRpb25FeHRlbnNpb25zbG9jYXRpb24sIGlucHV0LmFwcGxpY2F0aW9uRXh0ZW5zaW9uc2xvY2F0aW9uTXRpbWUsIGlucHV0LnByb2ZpbGUsIGlucHV0LnByb2ZpbGVTY2FuT3B0aW9ucywgaW5wdXQudHlwZSwgaW5wdXQudmFsaWRhdGUsIGlucHV0LnByb2R1Y3RWZXJzaW9uLCBpbnB1dC5wcm9kdWN0RGF0ZSwgaW5wdXQucHJvZHVjdENvbW1pdCwgaW5wdXQuZGV2TW9kZSwgaW5wdXQubGFuZ3VhZ2UsIGlucHV0LnRyYW5zbGF0aW9ucyk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuc2NhbkV4dGVuc2lvbihleHRlbnNpb25TY2FubmVySW5wdXQsIGV4dGVuc2lvbkluZm8pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fSkpO1xuXHRcdHJldHVybiBjb2FsZXNjZShleHRlbnNpb25zKTtcblx0fVxuXG5cdGFzeW5jIHNjYW5PbmVPck11bHRpcGxlRXh0ZW5zaW9ucyhpbnB1dDogRXh0ZW5zaW9uU2Nhbm5lcklucHV0KTogUHJvbWlzZTxJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMoam9pblBhdGgoaW5wdXQubG9jYXRpb24sICdwYWNrYWdlLmpzb24nKSkpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5zY2FuRXh0ZW5zaW9uKGlucHV0KTtcblx0XHRcdFx0cmV0dXJuIGV4dGVuc2lvbiA/IFtleHRlbnNpb25dIDogW107XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5zY2FuRXh0ZW5zaW9ucyhpbnB1dCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRXJyb3Igc2Nhbm5pbmcgZXh0ZW5zaW9ucyBhdCAke2lucHV0LmxvY2F0aW9uLnBhdGh9OmAsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNjYW5FeHRlbnNpb24oaW5wdXQ6IEV4dGVuc2lvblNjYW5uZXJJbnB1dCk6IFByb21pc2U8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uIHwgbnVsbD47XG5cdGFzeW5jIHNjYW5FeHRlbnNpb24oaW5wdXQ6IEV4dGVuc2lvblNjYW5uZXJJbnB1dCwgc2Nhbm5lZFByb2ZpbGVFeHRlbnNpb246IElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbik6IFByb21pc2U8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uPjtcblx0YXN5bmMgc2NhbkV4dGVuc2lvbihpbnB1dDogRXh0ZW5zaW9uU2Nhbm5lcklucHV0LCBzY2FubmVkUHJvZmlsZUV4dGVuc2lvbj86IElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbik6IFByb21pc2U8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHZhbGlkYXRpb25zOiBbU2V2ZXJpdHksIHN0cmluZ11bXSA9IFtdO1xuXHRcdGxldCBpc1ZhbGlkID0gdHJ1ZTtcblx0XHRsZXQgbWFuaWZlc3Q6IElTY2FubmVkRXh0ZW5zaW9uTWFuaWZlc3Q7XG5cdFx0dHJ5IHtcblx0XHRcdG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5zY2FuRXh0ZW5zaW9uTWFuaWZlc3QoaW5wdXQubG9jYXRpb24pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmIChzY2FubmVkUHJvZmlsZUV4dGVuc2lvbikge1xuXHRcdFx0XHR2YWxpZGF0aW9ucy5wdXNoKFtTZXZlcml0eS5FcnJvciwgZ2V0RXJyb3JNZXNzYWdlKGUpXSk7XG5cdFx0XHRcdGlzVmFsaWQgPSBmYWxzZTtcblx0XHRcdFx0Y29uc3QgW3B1Ymxpc2hlciwgbmFtZV0gPSBzY2FubmVkUHJvZmlsZUV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnNwbGl0KCcuJyk7XG5cdFx0XHRcdG1hbmlmZXN0ID0ge1xuXHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0cHVibGlzaGVyLFxuXHRcdFx0XHRcdHZlcnNpb246IHNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uLnZlcnNpb24sXG5cdFx0XHRcdFx0ZW5naW5lczogeyB2c2NvZGU6ICcnIH1cblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChpbnB1dC50eXBlICE9PSBFeHRlbnNpb25UeXBlLlN5c3RlbSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBhbGxvdyBwdWJsaXNoZXIgdG8gYmUgdW5kZWZpbmVkIHRvIG1ha2UgdGhlIGluaXRpYWwgZXh0ZW5zaW9uIGF1dGhvcmluZyBleHBlcmllbmNlIHNtb290aGVyXG5cdFx0aWYgKCFtYW5pZmVzdC5wdWJsaXNoZXIpIHtcblx0XHRcdG1hbmlmZXN0LnB1Ymxpc2hlciA9IFVOREVGSU5FRF9QVUJMSVNIRVI7XG5cdFx0fVxuXG5cdFx0bGV0IG1ldGFkYXRhOiBNZXRhZGF0YSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoc2Nhbm5lZFByb2ZpbGVFeHRlbnNpb24pIHtcblx0XHRcdG1ldGFkYXRhID0ge1xuXHRcdFx0XHQuLi5zY2FubmVkUHJvZmlsZUV4dGVuc2lvbi5tZXRhZGF0YSxcblx0XHRcdFx0c2l6ZTogbWFuaWZlc3QuX19tZXRhZGF0YT8uc2l6ZSxcblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmIChtYW5pZmVzdC5fX21ldGFkYXRhKSB7XG5cdFx0XHRtZXRhZGF0YSA9IHtcblx0XHRcdFx0aW5zdGFsbGVkVGltZXN0YW1wOiBtYW5pZmVzdC5fX21ldGFkYXRhLmluc3RhbGxlZFRpbWVzdGFtcCxcblx0XHRcdFx0c2l6ZTogbWFuaWZlc3QuX19tZXRhZGF0YS5zaXplLFxuXHRcdFx0XHR0YXJnZXRQbGF0Zm9ybTogbWFuaWZlc3QuX19tZXRhZGF0YS50YXJnZXRQbGF0Zm9ybSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZGVsZXRlIG1hbmlmZXN0Ll9fbWV0YWRhdGE7XG5cdFx0Y29uc3QgaWQgPSBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQobWFuaWZlc3QucHVibGlzaGVyLCBtYW5pZmVzdC5uYW1lKTtcblx0XHRjb25zdCBpZGVudGlmaWVyID0gbWV0YWRhdGE/LmlkID8geyBpZCwgdXVpZDogbWV0YWRhdGEuaWQgfSA6IHsgaWQgfTtcblx0XHRjb25zdCB0eXBlID0gbWV0YWRhdGE/LmlzU3lzdGVtID8gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0gOiBpbnB1dC50eXBlO1xuXHRcdGNvbnN0IGlzQnVpbHRpbiA9IHR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtIHx8ICEhbWV0YWRhdGE/LmlzQnVpbHRpbjtcblx0XHR0cnkge1xuXHRcdFx0bWFuaWZlc3QgPSBhd2FpdCB0aGlzLnRyYW5zbGF0ZU1hbmlmZXN0KGlucHV0LmxvY2F0aW9uLCBtYW5pZmVzdCwgRXh0ZW5zaW9uU2Nhbm5lcklucHV0LmNyZWF0ZU5sc0NvbmZpZ3VyYXRpb24oaW5wdXQpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ0ZhaWxlZCB0byB0cmFuc2xhdGUgbWFuaWZlc3QnLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHR9XG5cdFx0bGV0IGV4dGVuc2lvbjogSVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uID0ge1xuXHRcdFx0dHlwZSxcblx0XHRcdGlkZW50aWZpZXIsXG5cdFx0XHRtYW5pZmVzdCxcblx0XHRcdGxvY2F0aW9uOiBpbnB1dC5sb2NhdGlvbixcblx0XHRcdGlzQnVpbHRpbixcblx0XHRcdHRhcmdldFBsYXRmb3JtOiBtZXRhZGF0YT8udGFyZ2V0UGxhdGZvcm0gPz8gVGFyZ2V0UGxhdGZvcm0uVU5ERUZJTkVELFxuXHRcdFx0cHVibGlzaGVyRGlzcGxheU5hbWU6IG1ldGFkYXRhPy5wdWJsaXNoZXJEaXNwbGF5TmFtZSxcblx0XHRcdG1ldGFkYXRhLFxuXHRcdFx0aXNWYWxpZCxcblx0XHRcdHZhbGlkYXRpb25zLFxuXHRcdFx0cHJlUmVsZWFzZTogISFtZXRhZGF0YT8ucHJlUmVsZWFzZSxcblx0XHRcdGZvcmNlQXV0b1VwZGF0ZTogdGhpcy5wcm9kdWN0QnVpbHRJbkV4dGVuc2lvbnNFbmFibGVkV2l0aEF1dG9VcGRhdGVzLmhhcyhpZC50b0xvd2VyQ2FzZSgpKSAmJiB0aGlzLnByb2R1Y3RRdWFsaXR5ID09PSAnc3RhYmxlJyxcblx0XHR9O1xuXHRcdGlmIChpbnB1dC52YWxpZGF0ZSkge1xuXHRcdFx0ZXh0ZW5zaW9uID0gdGhpcy52YWxpZGF0ZShleHRlbnNpb24sIGlucHV0KTtcblx0XHR9XG5cdFx0aWYgKG1hbmlmZXN0LmVuYWJsZWRBcGlQcm9wb3NhbHMpIHtcblx0XHRcdG1hbmlmZXN0Lm9yaWdpbmFsRW5hYmxlZEFwaVByb3Bvc2FscyA9IG1hbmlmZXN0LmVuYWJsZWRBcGlQcm9wb3NhbHM7XG5cdFx0XHRtYW5pZmVzdC5lbmFibGVkQXBpUHJvcG9zYWxzID0gcGFyc2VFbmFibGVkQXBpUHJvcG9zYWxOYW1lcyhbLi4ubWFuaWZlc3QuZW5hYmxlZEFwaVByb3Bvc2Fsc10pO1xuXHRcdH1cblx0XHRyZXR1cm4gZXh0ZW5zaW9uO1xuXHR9XG5cblx0dmFsaWRhdGUoZXh0ZW5zaW9uOiBJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb24sIGlucHV0OiBFeHRlbnNpb25TY2FubmVySW5wdXQpOiBJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb24ge1xuXHRcdGxldCBpc1ZhbGlkID0gZXh0ZW5zaW9uLmlzVmFsaWQ7XG5cdFx0Y29uc3QgdmFsaWRhdGlvbnMgPSB2YWxpZGF0ZUV4dGVuc2lvbk1hbmlmZXN0KGlucHV0LnByb2R1Y3RWZXJzaW9uLCBpbnB1dC5wcm9kdWN0RGF0ZSwgaW5wdXQubG9jYXRpb24sIGV4dGVuc2lvbi5tYW5pZmVzdCwgZXh0ZW5zaW9uLmlzQnVpbHRpbik7XG5cdFx0Zm9yIChjb25zdCBbc2V2ZXJpdHksIG1lc3NhZ2VdIG9mIHZhbGlkYXRpb25zKSB7XG5cdFx0XHRpZiAoc2V2ZXJpdHkgPT09IFNldmVyaXR5LkVycm9yKSB7XG5cdFx0XHRcdGlzVmFsaWQgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKHRoaXMuZm9ybWF0TWVzc2FnZShpbnB1dC5sb2NhdGlvbiwgbWVzc2FnZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRleHRlbnNpb24uaXNWYWxpZCA9IGlzVmFsaWQ7XG5cdFx0ZXh0ZW5zaW9uLnZhbGlkYXRpb25zID0gWy4uLmV4dGVuc2lvbi52YWxpZGF0aW9ucywgLi4udmFsaWRhdGlvbnNdO1xuXHRcdHJldHVybiBleHRlbnNpb247XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNjYW5FeHRlbnNpb25NYW5pZmVzdChleHRlbnNpb25Mb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbk1hbmlmZXN0PiB7XG5cdFx0Y29uc3QgbWFuaWZlc3RMb2NhdGlvbiA9IGpvaW5QYXRoKGV4dGVuc2lvbkxvY2F0aW9uLCAncGFja2FnZS5qc29uJyk7XG5cdFx0bGV0IGNvbnRlbnQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnRlbnQgPSAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShtYW5pZmVzdExvY2F0aW9uKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKHRoaXMuZm9ybWF0TWVzc2FnZShleHRlbnNpb25Mb2NhdGlvbiwgbG9jYWxpemUoJ2ZpbGVSZWFkRmFpbCcsIFwiQ2Fubm90IHJlYWQgZmlsZSB7MH06IHsxfS5cIiwgbWFuaWZlc3RMb2NhdGlvbi5wYXRoLCBlcnJvci5tZXNzYWdlKSkpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHRcdGxldCBtYW5pZmVzdDogSVNjYW5uZWRFeHRlbnNpb25NYW5pZmVzdDtcblx0XHR0cnkge1xuXHRcdFx0bWFuaWZlc3QgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gaW52YWxpZCBKU09OLCBsZXQncyBnZXQgZ29vZCBlcnJvcnNcblx0XHRcdGNvbnN0IGVycm9yczogUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRwYXJzZShjb250ZW50LCBlcnJvcnMpO1xuXHRcdFx0Zm9yIChjb25zdCBlIG9mIGVycm9ycykge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IodGhpcy5mb3JtYXRNZXNzYWdlKGV4dGVuc2lvbkxvY2F0aW9uLCBsb2NhbGl6ZSgnanNvblBhcnNlRmFpbCcsIFwiRmFpbGVkIHRvIHBhcnNlIHswfTogW3sxfSwgezJ9XSB7M30uXCIsIG1hbmlmZXN0TG9jYXRpb24ucGF0aCwgZS5vZmZzZXQsIGUubGVuZ3RoLCBnZXRQYXJzZUVycm9yTWVzc2FnZShlLmVycm9yKSkpKTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdFx0aWYgKGdldE5vZGVUeXBlKG1hbmlmZXN0KSAhPT0gJ29iamVjdCcpIHtcblx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9IHRoaXMuZm9ybWF0TWVzc2FnZShleHRlbnNpb25Mb2NhdGlvbiwgbG9jYWxpemUoJ2pzb25QYXJzZUludmFsaWRUeXBlJywgXCJJbnZhbGlkIG1hbmlmZXN0IGZpbGUgezB9OiBOb3QgYSBKU09OIG9iamVjdC5cIiwgbWFuaWZlc3RMb2NhdGlvbi5wYXRoKSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3JNZXNzYWdlKTtcblx0XHRcdHRocm93IG5ldyBFcnJvcihlcnJvck1lc3NhZ2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gbWFuaWZlc3Q7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHRyYW5zbGF0ZU1hbmlmZXN0KGV4dGVuc2lvbkxvY2F0aW9uOiBVUkksIGV4dGVuc2lvbk1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QsIG5sc0NvbmZpZ3VyYXRpb246IE5sc0NvbmZpZ3VyYXRpb24pOiBQcm9taXNlPElFeHRlbnNpb25NYW5pZmVzdD4ge1xuXHRcdGNvbnN0IGxvY2FsaXplZE1lc3NhZ2VzID0gYXdhaXQgdGhpcy5nZXRMb2NhbGl6ZWRNZXNzYWdlcyhleHRlbnNpb25Mb2NhdGlvbiwgZXh0ZW5zaW9uTWFuaWZlc3QsIG5sc0NvbmZpZ3VyYXRpb24pO1xuXHRcdGlmIChsb2NhbGl6ZWRNZXNzYWdlcykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZXJyb3JzOiBQYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdFx0Ly8gcmVzb2x2ZU9yaWdpbmFsTWVzc2FnZUJ1bmRsZSByZXR1cm5zIG51bGwgaWYgbG9jYWxpemVkTWVzc2FnZXMuZGVmYXVsdCA9PT0gdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0cyA9IGF3YWl0IHRoaXMucmVzb2x2ZU9yaWdpbmFsTWVzc2FnZUJ1bmRsZShsb2NhbGl6ZWRNZXNzYWdlcy5kZWZhdWx0LCBlcnJvcnMpO1xuXHRcdFx0XHRpZiAoZXJyb3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRlcnJvcnMuZm9yRWFjaCgoZXJyb3IpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcih0aGlzLmZvcm1hdE1lc3NhZ2UoZXh0ZW5zaW9uTG9jYXRpb24sIGxvY2FsaXplKCdqc29uc1BhcnNlUmVwb3J0RXJyb3JzJywgXCJGYWlsZWQgdG8gcGFyc2UgezB9OiB7MX0uXCIsIGxvY2FsaXplZE1lc3NhZ2VzLmRlZmF1bHQ/LnBhdGgsIGdldFBhcnNlRXJyb3JNZXNzYWdlKGVycm9yLmVycm9yKSkpKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZXR1cm4gZXh0ZW5zaW9uTWFuaWZlc3Q7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZ2V0Tm9kZVR5cGUobG9jYWxpemVkTWVzc2FnZXMpICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcih0aGlzLmZvcm1hdE1lc3NhZ2UoZXh0ZW5zaW9uTG9jYXRpb24sIGxvY2FsaXplKCdqc29uSW52YWxpZEZvcm1hdCcsIFwiSW52YWxpZCBmb3JtYXQgezB9OiBKU09OIG9iamVjdCBleHBlY3RlZC5cIiwgbG9jYWxpemVkTWVzc2FnZXMuZGVmYXVsdD8ucGF0aCkpKTtcblx0XHRcdFx0XHRyZXR1cm4gZXh0ZW5zaW9uTWFuaWZlc3Q7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbG9jYWxpemVkID0gbG9jYWxpemVkTWVzc2FnZXMudmFsdWVzIHx8IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZU1hbmlmZXN0KHRoaXMubG9nU2VydmljZSwgZXh0ZW5zaW9uTWFuaWZlc3QsIGxvY2FsaXplZCwgZGVmYXVsdHMpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0LypJZ25vcmUgRXJyb3IqL1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZXh0ZW5zaW9uTWFuaWZlc3Q7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldExvY2FsaXplZE1lc3NhZ2VzKGV4dGVuc2lvbkxvY2F0aW9uOiBVUkksIGV4dGVuc2lvbk1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QsIG5sc0NvbmZpZ3VyYXRpb246IE5sc0NvbmZpZ3VyYXRpb24pOiBQcm9taXNlPExvY2FsaXplZE1lc3NhZ2VzIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZGVmYXVsdFBhY2thZ2VOTFMgPSBqb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgJ3BhY2thZ2UubmxzLmpzb24nKTtcblx0XHRjb25zdCByZXBvcnRFcnJvcnMgPSAobG9jYWxpemVkOiBVUkkgfCBudWxsLCBlcnJvcnM6IFBhcnNlRXJyb3JbXSk6IHZvaWQgPT4ge1xuXHRcdFx0ZXJyb3JzLmZvckVhY2goKGVycm9yKSA9PiB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcih0aGlzLmZvcm1hdE1lc3NhZ2UoZXh0ZW5zaW9uTG9jYXRpb24sIGxvY2FsaXplKCdqc29uc1BhcnNlUmVwb3J0RXJyb3JzJywgXCJGYWlsZWQgdG8gcGFyc2UgezB9OiB7MX0uXCIsIGxvY2FsaXplZD8ucGF0aCwgZ2V0UGFyc2VFcnJvck1lc3NhZ2UoZXJyb3IuZXJyb3IpKSkpO1xuXHRcdFx0fSk7XG5cdFx0fTtcblx0XHRjb25zdCByZXBvcnRJbnZhbGlkRm9ybWF0ID0gKGxvY2FsaXplZDogVVJJIHwgbnVsbCk6IHZvaWQgPT4ge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKHRoaXMuZm9ybWF0TWVzc2FnZShleHRlbnNpb25Mb2NhdGlvbiwgbG9jYWxpemUoJ2pzb25JbnZhbGlkRm9ybWF0JywgXCJJbnZhbGlkIGZvcm1hdCB7MH06IEpTT04gb2JqZWN0IGV4cGVjdGVkLlwiLCBsb2NhbGl6ZWQ/LnBhdGgpKSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRyYW5zbGF0aW9uSWQgPSBgJHtleHRlbnNpb25NYW5pZmVzdC5wdWJsaXNoZXJ9LiR7ZXh0ZW5zaW9uTWFuaWZlc3QubmFtZX1gO1xuXHRcdGNvbnN0IHRyYW5zbGF0aW9uUGF0aCA9IG5sc0NvbmZpZ3VyYXRpb24udHJhbnNsYXRpb25zW3RyYW5zbGF0aW9uSWRdO1xuXG5cdFx0aWYgKHRyYW5zbGF0aW9uUGF0aCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdHJhbnNsYXRpb25SZXNvdXJjZSA9IFVSSS5maWxlKHRyYW5zbGF0aW9uUGF0aCk7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0cmFuc2xhdGlvblJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdFx0Y29uc3QgZXJyb3JzOiBQYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgdHJhbnNsYXRpb25CdW5kbGU6IFRyYW5zbGF0aW9uQnVuZGxlID0gcGFyc2UoY29udGVudCwgZXJyb3JzKTtcblx0XHRcdFx0aWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0cmVwb3J0RXJyb3JzKHRyYW5zbGF0aW9uUmVzb3VyY2UsIGVycm9ycyk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdmFsdWVzOiB1bmRlZmluZWQsIGRlZmF1bHQ6IGRlZmF1bHRQYWNrYWdlTkxTIH07XG5cdFx0XHRcdH0gZWxzZSBpZiAoZ2V0Tm9kZVR5cGUodHJhbnNsYXRpb25CdW5kbGUpICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdHJlcG9ydEludmFsaWRGb3JtYXQodHJhbnNsYXRpb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdmFsdWVzOiB1bmRlZmluZWQsIGRlZmF1bHQ6IGRlZmF1bHRQYWNrYWdlTkxTIH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgdmFsdWVzID0gdHJhbnNsYXRpb25CdW5kbGUuY29udGVudHMgPyB0cmFuc2xhdGlvbkJ1bmRsZS5jb250ZW50cy5wYWNrYWdlIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHJldHVybiB7IHZhbHVlczogdmFsdWVzLCBkZWZhdWx0OiBkZWZhdWx0UGFja2FnZU5MUyB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRyZXR1cm4geyB2YWx1ZXM6IHVuZGVmaW5lZCwgZGVmYXVsdDogZGVmYXVsdFBhY2thZ2VOTFMgfTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMoZGVmYXVsdFBhY2thZ2VOTFMpO1xuXHRcdFx0aWYgKCFleGlzdHMpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGxldCBtZXNzYWdlQnVuZGxlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bWVzc2FnZUJ1bmRsZSA9IGF3YWl0IHRoaXMuZmluZE1lc3NhZ2VCdW5kbGVzKGV4dGVuc2lvbkxvY2F0aW9uLCBubHNDb25maWd1cmF0aW9uKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW1lc3NhZ2VCdW5kbGUubG9jYWxpemVkKSB7XG5cdFx0XHRcdHJldHVybiB7IHZhbHVlczogdW5kZWZpbmVkLCBkZWZhdWx0OiBtZXNzYWdlQnVuZGxlLm9yaWdpbmFsIH07XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlQnVuZGxlQ29udGVudCA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1lc3NhZ2VCdW5kbGUubG9jYWxpemVkKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdFx0Y29uc3QgZXJyb3JzOiBQYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZXM6IE1lc3NhZ2VCYWcgPSBwYXJzZShtZXNzYWdlQnVuZGxlQ29udGVudCwgZXJyb3JzKTtcblx0XHRcdFx0aWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0cmVwb3J0RXJyb3JzKG1lc3NhZ2VCdW5kbGUubG9jYWxpemVkLCBlcnJvcnMpO1xuXHRcdFx0XHRcdHJldHVybiB7IHZhbHVlczogdW5kZWZpbmVkLCBkZWZhdWx0OiBtZXNzYWdlQnVuZGxlLm9yaWdpbmFsIH07XG5cdFx0XHRcdH0gZWxzZSBpZiAoZ2V0Tm9kZVR5cGUobWVzc2FnZXMpICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdHJlcG9ydEludmFsaWRGb3JtYXQobWVzc2FnZUJ1bmRsZS5sb2NhbGl6ZWQpO1xuXHRcdFx0XHRcdHJldHVybiB7IHZhbHVlczogdW5kZWZpbmVkLCBkZWZhdWx0OiBtZXNzYWdlQnVuZGxlLm9yaWdpbmFsIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsgdmFsdWVzOiBtZXNzYWdlcywgZGVmYXVsdDogbWVzc2FnZUJ1bmRsZS5vcmlnaW5hbCB9O1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIHsgdmFsdWVzOiB1bmRlZmluZWQsIGRlZmF1bHQ6IG1lc3NhZ2VCdW5kbGUub3JpZ2luYWwgfTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUGFyc2VzIG9yaWdpbmFsIG1lc3NhZ2UgYnVuZGxlLCByZXR1cm5zIG51bGwgaWYgdGhlIG9yaWdpbmFsIG1lc3NhZ2UgYnVuZGxlIGlzIG51bGwuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVPcmlnaW5hbE1lc3NhZ2VCdW5kbGUob3JpZ2luYWxNZXNzYWdlQnVuZGxlOiBVUkkgfCBudWxsLCBlcnJvcnM6IFBhcnNlRXJyb3JbXSk6IFByb21pc2U8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChvcmlnaW5hbE1lc3NhZ2VCdW5kbGUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsQnVuZGxlQ29udGVudCA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKG9yaWdpbmFsTWVzc2FnZUJ1bmRsZSkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdHJldHVybiBwYXJzZShvcmlnaW5hbEJ1bmRsZUNvbnRlbnQsIGVycm9ycyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvKiBJZ25vcmUgRXJyb3IgKi9cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmRzIGxvY2FsaXplZCBtZXNzYWdlIGJ1bmRsZSBhbmQgdGhlIG9yaWdpbmFsICh1bmxvY2FsaXplZCkgb25lLlxuXHQgKiBJZiB0aGUgbG9jYWxpemVkIGZpbGUgaXMgbm90IHByZXNlbnQsIHJldHVybnMgbnVsbCBmb3IgdGhlIG9yaWdpbmFsIGFuZCBtYXJrcyBvcmlnaW5hbCBhcyBsb2NhbGl6ZWQuXG5cdCAqL1xuXHRwcml2YXRlIGZpbmRNZXNzYWdlQnVuZGxlcyhleHRlbnNpb25Mb2NhdGlvbjogVVJJLCBubHNDb25maWd1cmF0aW9uOiBObHNDb25maWd1cmF0aW9uKTogUHJvbWlzZTx7IGxvY2FsaXplZDogVVJJOyBvcmlnaW5hbDogVVJJIHwgbnVsbCB9PiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHsgbG9jYWxpemVkOiBVUkk7IG9yaWdpbmFsOiBVUkkgfCBudWxsIH0+KChjLCBlKSA9PiB7XG5cdFx0XHRjb25zdCBsb29wID0gKGxvY2FsZTogc3RyaW5nKTogdm9pZCA9PiB7XG5cdFx0XHRcdGNvbnN0IHRvQ2hlY2sgPSBqb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgYHBhY2thZ2UubmxzLiR7bG9jYWxlfS5qc29uYCk7XG5cdFx0XHRcdHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKHRvQ2hlY2spLnRoZW4oZXhpc3RzID0+IHtcblx0XHRcdFx0XHRpZiAoZXhpc3RzKSB7XG5cdFx0XHRcdFx0XHRjKHsgbG9jYWxpemVkOiB0b0NoZWNrLCBvcmlnaW5hbDogam9pblBhdGgoZXh0ZW5zaW9uTG9jYXRpb24sICdwYWNrYWdlLm5scy5qc29uJykgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gbG9jYWxlLmxhc3RJbmRleE9mKCctJyk7XG5cdFx0XHRcdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdFx0Yyh7IGxvY2FsaXplZDogam9pblBhdGgoZXh0ZW5zaW9uTG9jYXRpb24sICdwYWNrYWdlLm5scy5qc29uJyksIG9yaWdpbmFsOiBudWxsIH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRsb2NhbGUgPSBsb2NhbGUuc3Vic3RyaW5nKDAsIGluZGV4KTtcblx0XHRcdFx0XHRcdGxvb3AobG9jYWxlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblx0XHRcdGlmIChubHNDb25maWd1cmF0aW9uLmRldk1vZGUgfHwgbmxzQ29uZmlndXJhdGlvbi5wc2V1ZG8gfHwgIW5sc0NvbmZpZ3VyYXRpb24ubGFuZ3VhZ2UpIHtcblx0XHRcdFx0cmV0dXJuIGMoeyBsb2NhbGl6ZWQ6IGpvaW5QYXRoKGV4dGVuc2lvbkxvY2F0aW9uLCAncGFja2FnZS5ubHMuanNvbicpLCBvcmlnaW5hbDogbnVsbCB9KTtcblx0XHRcdH1cblx0XHRcdGxvb3AobmxzQ29uZmlndXJhdGlvbi5sYW5ndWFnZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGZvcm1hdE1lc3NhZ2UoZXh0ZW5zaW9uTG9jYXRpb246IFVSSSwgbWVzc2FnZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYFske2V4dGVuc2lvbkxvY2F0aW9uLnBhdGh9XTogJHttZXNzYWdlfWA7XG5cdH1cblxufVxuXG5pbnRlcmZhY2UgSUV4dGVuc2lvbkNhY2hlRGF0YSB7XG5cdGlucHV0OiBFeHRlbnNpb25TY2FubmVySW5wdXQ7XG5cdHJlc3VsdDogSVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uW107XG59XG5cbmNsYXNzIENhY2hlZEV4dGVuc2lvbnNTY2FubmVyIGV4dGVuZHMgRXh0ZW5zaW9uc1NjYW5uZXIge1xuXG5cdHByaXZhdGUgaW5wdXQ6IEV4dGVuc2lvblNjYW5uZXJJbnB1dCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBjYWNoZVZhbGlkYXRvclRocm90dGxlcjogVGhyb3R0bGVkRGVsYXllcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZWREZWxheWVyKDMwMDApKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNhY2hlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2FjaGUgPSB0aGlzLl9vbkRpZENoYW5nZUNhY2hlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY3VycmVudFByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlIGV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2U6IElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBmaWxlU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgbG9nU2VydmljZSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzY2FuRXh0ZW5zaW9ucyhpbnB1dDogRXh0ZW5zaW9uU2Nhbm5lcklucHV0KTogUHJvbWlzZTxJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IGNhY2hlRmlsZSA9IHRoaXMuZ2V0Q2FjaGVGaWxlKGlucHV0KTtcblx0XHRjb25zdCBjYWNoZUNvbnRlbnRzID0gYXdhaXQgdGhpcy5yZWFkRXh0ZW5zaW9uQ2FjaGUoY2FjaGVGaWxlKTtcblx0XHR0aGlzLmlucHV0ID0gaW5wdXQ7XG5cdFx0aWYgKGNhY2hlQ29udGVudHMgJiYgY2FjaGVDb250ZW50cy5pbnB1dCAmJiBFeHRlbnNpb25TY2FubmVySW5wdXQuZXF1YWxzKGNhY2hlQ29udGVudHMuaW5wdXQsIHRoaXMuaW5wdXQpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1VzaW5nIGNhY2hlZCBleHRlbnNpb25zIHNjYW4gcmVzdWx0JywgaW5wdXQudHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0gPyAnc3lzdGVtJyA6ICd1c2VyJywgaW5wdXQubG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0XHR0aGlzLmNhY2hlVmFsaWRhdG9yVGhyb3R0bGVyLnRyaWdnZXIoKCkgPT4gdGhpcy52YWxpZGF0ZUNhY2hlKCkpO1xuXHRcdFx0cmV0dXJuIGNhY2hlQ29udGVudHMucmVzdWx0Lm1hcCgoZXh0ZW5zaW9uKSA9PiB7XG5cdFx0XHRcdC8vIHJldml2ZSBVUkkgb2JqZWN0XG5cdFx0XHRcdGV4dGVuc2lvbi5sb2NhdGlvbiA9IFVSSS5yZXZpdmUoZXh0ZW5zaW9uLmxvY2F0aW9uKTtcblx0XHRcdFx0cmV0dXJuIGV4dGVuc2lvbjtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdXBlci5zY2FuRXh0ZW5zaW9ucyhpbnB1dCk7XG5cdFx0YXdhaXQgdGhpcy53cml0ZUV4dGVuc2lvbkNhY2hlKGNhY2hlRmlsZSwgeyBpbnB1dCwgcmVzdWx0IH0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlYWRFeHRlbnNpb25DYWNoZShjYWNoZUZpbGU6IFVSSSk6IFByb21pc2U8SUV4dGVuc2lvbkNhY2hlRGF0YSB8IG51bGw+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY2FjaGVSYXdDb250ZW50cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoY2FjaGVGaWxlKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbkNhY2hlRGF0YTogSUV4dGVuc2lvbkNhY2hlRGF0YSA9IEpTT04ucGFyc2UoY2FjaGVSYXdDb250ZW50cy52YWx1ZS50b1N0cmluZygpKTtcblx0XHRcdHJldHVybiB7IHJlc3VsdDogZXh0ZW5zaW9uQ2FjaGVEYXRhLnJlc3VsdCwgaW5wdXQ6IHJldml2ZShleHRlbnNpb25DYWNoZURhdGEuaW5wdXQpIH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnRXJyb3Igd2hpbGUgcmVhZGluZyB0aGUgZXh0ZW5zaW9uIGNhY2hlIGZpbGU6JywgY2FjaGVGaWxlLnBhdGgsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd3JpdGVFeHRlbnNpb25DYWNoZShjYWNoZUZpbGU6IFVSSSwgY2FjaGVDb250ZW50czogSUV4dGVuc2lvbkNhY2hlRGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShjYWNoZUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoY2FjaGVDb250ZW50cykpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdFcnJvciB3aGlsZSB3cml0aW5nIHRoZSBleHRlbnNpb24gY2FjaGUgZmlsZTonLCBjYWNoZUZpbGUucGF0aCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZUNhY2hlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pbnB1dCkge1xuXHRcdFx0Ly8gSW5wdXQgaGFzIGJlZW4gdW5zZXQgYnkgdGhlIHRpbWUgd2UgZ2V0IGhlcmUsIHNvIHNraXAgdmFsaWRhdGlvblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhY2hlRmlsZSA9IHRoaXMuZ2V0Q2FjaGVGaWxlKHRoaXMuaW5wdXQpO1xuXHRcdGNvbnN0IGNhY2hlQ29udGVudHMgPSBhd2FpdCB0aGlzLnJlYWRFeHRlbnNpb25DYWNoZShjYWNoZUZpbGUpO1xuXHRcdGlmICghY2FjaGVDb250ZW50cykge1xuXHRcdFx0Ly8gQ2FjaGUgaGFzIGJlZW4gZGVsZXRlZCBieSBzb21lb25lIGVsc2UsIHdoaWNoIGlzIHBlcmZlY3RseSBmaW5lLi4uXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0dWFsID0gY2FjaGVDb250ZW50cy5yZXN1bHQ7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGF3YWl0IHN1cGVyLnNjYW5FeHRlbnNpb25zKHRoaXMuaW5wdXQpKSk7XG5cdFx0aWYgKG9iamVjdHMuZXF1YWxzKGV4cGVjdGVkLCBhY3R1YWwpKSB7XG5cdFx0XHQvLyBDYWNoZSBpcyB2YWxpZCBhbmQgcnVubmluZyB3aXRoIGl0IGlzIHBlcmZlY3RseSBmaW5lLi4uXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdJbnZhbGlkYXRpbmcgQ2FjaGUnLCBhY3R1YWwsIGV4cGVjdGVkKTtcblx0XHRcdC8vIENhY2hlIGlzIGludmFsaWQsIGRlbGV0ZSBpdFxuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwoY2FjaGVGaWxlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2FjaGUuZmlyZSgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0Q2FjaGVGaWxlKGlucHV0OiBFeHRlbnNpb25TY2FubmVySW5wdXQpOiBVUkkge1xuXHRcdGNvbnN0IHByb2ZpbGUgPSB0aGlzLmdldFByb2ZpbGUoaW5wdXQpO1xuXHRcdHJldHVybiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgocHJvZmlsZS5jYWNoZUhvbWUsIGlucHV0LnR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtID8gQlVJTFRJTl9NQU5JRkVTVF9DQUNIRV9GSUxFIDogVVNFUl9NQU5JRkVTVF9DQUNIRV9GSUxFKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHJvZmlsZShpbnB1dDogRXh0ZW5zaW9uU2Nhbm5lcklucHV0KTogSVVzZXJEYXRhUHJvZmlsZSB7XG5cdFx0aWYgKGlucHV0LnR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZTtcblx0XHR9XG5cdFx0aWYgKCFpbnB1dC5wcm9maWxlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGlucHV0LmxvY2F0aW9uLCB0aGlzLmN1cnJlbnRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmN1cnJlbnRQcm9maWxlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5maW5kKHAgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoaW5wdXQubG9jYXRpb24sIHAuZXh0ZW5zaW9uc1Jlc291cmNlKSkgPz8gdGhpcy5jdXJyZW50UHJvZmlsZTtcblx0fVxuXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0V4dGVuc2lvbkRlc2NyaXB0aW9uKGV4dGVuc2lvbjogSVNjYW5uZWRFeHRlbnNpb24sIGlzVW5kZXJEZXZlbG9wbWVudDogYm9vbGVhbik6IElFeHRlbnNpb25EZXNjcmlwdGlvbiB7XG5cdGNvbnN0IGlkID0gZ2V0RXh0ZW5zaW9uSWQoZXh0ZW5zaW9uLm1hbmlmZXN0LnB1Ymxpc2hlciwgZXh0ZW5zaW9uLm1hbmlmZXN0Lm5hbWUpO1xuXHRyZXR1cm4ge1xuXHRcdGlkLFxuXHRcdGlkZW50aWZpZXI6IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKGlkKSxcblx0XHRpc0J1aWx0aW46IGV4dGVuc2lvbi50eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbSxcblx0XHRpc1VzZXJCdWlsdGluOiBleHRlbnNpb24udHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5Vc2VyICYmIGV4dGVuc2lvbi5pc0J1aWx0aW4sXG5cdFx0aXNVbmRlckRldmVsb3BtZW50LFxuXHRcdGV4dGVuc2lvbkxvY2F0aW9uOiBleHRlbnNpb24ubG9jYXRpb24sXG5cdFx0dXVpZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCxcblx0XHR0YXJnZXRQbGF0Zm9ybTogZXh0ZW5zaW9uLnRhcmdldFBsYXRmb3JtLFxuXHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUsXG5cdFx0cHJlUmVsZWFzZTogZXh0ZW5zaW9uLnByZVJlbGVhc2UsXG5cdFx0Li4uZXh0ZW5zaW9uLm1hbmlmZXN0LFxuXHR9O1xufVxuXG5leHBvcnQgY2xhc3MgTmF0aXZlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UgaW1wbGVtZW50cyBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRyYW5zbGF0aW9uc1Byb21pc2U6IFByb21pc2U8VHJhbnNsYXRpb25zPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRzeXN0ZW1FeHRlbnNpb25zTG9jYXRpb246IFVSSSxcblx0XHR1c2VyRXh0ZW5zaW9uc0xvY2F0aW9uOiBVUkksXG5cdFx0dXNlckhvbWU6IFVSSSxcblx0XHRjdXJyZW50UHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSxcblx0XHR1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdGV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2U6IElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLFxuXHRcdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0ZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0dXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0c3lzdGVtRXh0ZW5zaW9uc0xvY2F0aW9uLFxuXHRcdFx0dXNlckV4dGVuc2lvbnNMb2NhdGlvbixcblx0XHRcdGpvaW5QYXRoKHVzZXJIb21lLCAnLnZzY29kZS1vc3MtZGV2JywgJ2V4dGVuc2lvbnMnLCAnY29udHJvbC5qc29uJyksXG5cdFx0XHRjdXJyZW50UHJvZmlsZSxcblx0XHRcdHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCBleHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy50cmFuc2xhdGlvbnNQcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChwbGF0Zm9ybS50cmFuc2xhdGlvbnNDb25maWdGaWxlKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZpbGUocGxhdGZvcm0udHJhbnNsYXRpb25zQ29uZmlnRmlsZSkpO1xuXHRcdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikgeyAvKiBJZ25vcmUgRXJyb3IgKi8gfVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0fSkoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRUcmFuc2xhdGlvbnMobGFuZ3VhZ2U6IHN0cmluZyk6IFByb21pc2U8VHJhbnNsYXRpb25zPiB7XG5cdFx0cmV0dXJuIHRoaXMudHJhbnNsYXRpb25zUHJvbWlzZTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JBQXdCO0FBQ2pDLFlBQVksYUFBYTtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWEsYUFBeUI7QUFDL0MsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxZQUFZLGVBQWU7QUFDcEMsWUFBWSxVQUFVO0FBQ3RCLFlBQVksY0FBYztBQUMxQixTQUFTLFVBQVUsU0FBUyxnQkFBZ0I7QUFDNUMsWUFBWSxZQUFZO0FBQ3hCLE9BQU8sY0FBYztBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxtQkFBbUIsdUJBQXVCLGdCQUFnQiw2QkFBNkI7QUFDaEcsU0FBUyxlQUFlLHFCQUF5QyxnQkFBaUUscUJBQTRDLDZCQUE2QiwwQkFBMEIsd0JBQXdCLG9DQUFvQztBQUNqUyxTQUFTLGlDQUFpQztBQUMxQyxT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LFNBQVMsS0FBSyxPQUFLLEtBQUssbUJBQW1CLE9BQU8sUUFBUSxNQUFNLFVBQVUsRUFBRSxrQkFBa0IsQ0FBQyxLQUFLLEtBQUs7QUFBQSxFQUM5STtBQUVEO0FBNUdNLDBCQUFOO0FBQUEsRUFVRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBaEJHO0FBOEdDLFNBQVMsdUJBQXVCLFdBQThCLG9CQUFvRDtBQUN4SCxRQUFNLEtBQUssZUFBZSxVQUFVLFNBQVMsV0FBVyxVQUFVLFNBQVMsSUFBSTtBQUMvRSxTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0EsWUFBWSxJQUFJLG9CQUFvQixFQUFFO0FBQUEsSUFDdEMsV0FBVyxVQUFVLFNBQVMsY0FBYztBQUFBLElBQzVDLGVBQWUsVUFBVSxTQUFTLGNBQWMsUUFBUSxVQUFVO0FBQUEsSUFDbEU7QUFBQSxJQUNBLG1CQUFtQixVQUFVO0FBQUEsSUFDN0IsTUFBTSxVQUFVLFdBQVc7QUFBQSxJQUMzQixnQkFBZ0IsVUFBVTtBQUFBLElBQzFCLHNCQUFzQixVQUFVO0FBQUEsSUFDaEMsWUFBWSxVQUFVO0FBQUEsSUFDdEIsR0FBRyxVQUFVO0FBQUEsRUFDZDtBQUNEO0FBRU8sTUFBTSx1Q0FBdUMsaUNBQXNFO0FBQUEsRUFJekgsWUFDQywwQkFDQSx3QkFDQSxVQUNBLGdCQUNBLHlCQUNBLGlDQUNBLGFBQ0EsWUFDQSxvQkFDQSxnQkFDQSxvQkFDQSxzQkFDQztBQUNEO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxNQUNBLFNBQVMsVUFBVSxtQkFBbUIsY0FBYyxjQUFjO0FBQUEsTUFDbEU7QUFBQSxNQUNBO0FBQUEsTUFBeUI7QUFBQSxNQUFpQztBQUFBLE1BQWE7QUFBQSxNQUFZO0FBQUEsTUFBb0I7QUFBQSxNQUFnQjtBQUFBLE1BQW9CO0FBQUEsSUFBb0I7QUFDaEssU0FBSyx1QkFBdUIsWUFBWTtBQUN2QyxVQUFJLFNBQVMsd0JBQXdCO0FBQ3BDLFlBQUk7QUFDSCxnQkFBTSxVQUFVLE1BQU0sS0FBSyxZQUFZLFNBQVMsSUFBSSxLQUFLLFNBQVMsc0JBQXNCLENBQUM7QUFDekYsaUJBQU8sS0FBSyxNQUFNLFFBQVEsTUFBTSxTQUFTLENBQUM7QUFBQSxRQUMzQyxTQUFTLEtBQUs7QUFBQSxRQUFxQjtBQUFBLE1BQ3BDO0FBQ0EsYUFBTyx1QkFBTyxPQUFPLElBQUk7QUFBQSxJQUMxQixHQUFHO0FBQUEsRUFDSjtBQUFBLEVBRVUsZ0JBQWdCLFVBQXlDO0FBQ2xFLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFFRDsiLAogICJuYW1lcyI6IFsiVHJhbnNsYXRpb25zIiwgImV4dGVuc2lvbnMiXQp9Cg==
