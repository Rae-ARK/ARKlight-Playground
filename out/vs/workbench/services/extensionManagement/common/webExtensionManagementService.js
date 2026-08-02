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
import { ExtensionIdentifier, ExtensionType, TargetPlatform } from "../../../../platform/extensions/common/extensions.js";
import { InstallOperation, IExtensionGalleryService, IAllowedExtensionsService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { URI } from "../../../../base/common/uri.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { areSameExtensions, getGalleryExtensionId } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { IWebExtensionsScannerService } from "./extensionManagement.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { AbstractExtensionManagementService, AbstractExtensionTask, toExtensionManagementError } from "../../../../platform/extensionManagement/common/abstractExtensionManagementService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IExtensionManifestPropertiesService } from "../../extensions/common/extensionManifestPropertiesService.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { isBoolean, isUndefined } from "../../../../base/common/types.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { delta } from "../../../../base/common/arrays.js";
import { compare } from "../../../../base/common/strings.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
let WebExtensionManagementService = class extends AbstractExtensionManagementService {
  constructor(extensionGalleryService, telemetryService, logService, webExtensionsScannerService, extensionManifestPropertiesService, userDataProfileService, productService, allowedExtensionsService, userDataProfilesService, uriIdentityService) {
    super(extensionGalleryService, telemetryService, uriIdentityService, logService, productService, allowedExtensionsService, userDataProfilesService);
    this.webExtensionsScannerService = webExtensionsScannerService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.userDataProfileService = userDataProfileService;
    this.disposables = this._register(new DisposableStore());
    this._onDidChangeProfile = this._register(new Emitter());
    this.onDidChangeProfile = this._onDidChangeProfile.event;
    this._register(userDataProfileService.onDidChangeCurrentProfile((e) => {
      if (!this.uriIdentityService.extUri.isEqual(e.previous.extensionsResource, e.profile.extensionsResource)) {
        e.join(this.whenProfileChanged(e));
      }
    }));
  }
  get onProfileAwareInstallExtension() {
    return super.onInstallExtension;
  }
  get onInstallExtension() {
    return Event.filter(this.onProfileAwareInstallExtension, (e) => this.filterEvent(e), this.disposables);
  }
  get onProfileAwareDidInstallExtensions() {
    return super.onDidInstallExtensions;
  }
  get onDidInstallExtensions() {
    return Event.filter(
      Event.map(this.onProfileAwareDidInstallExtensions, (results) => results.filter((e) => this.filterEvent(e)), this.disposables),
      (results) => results.length > 0,
      this.disposables
    );
  }
  get onProfileAwareUninstallExtension() {
    return super.onUninstallExtension;
  }
  get onUninstallExtension() {
    return Event.filter(this.onProfileAwareUninstallExtension, (e) => this.filterEvent(e), this.disposables);
  }
  get onProfileAwareDidUninstallExtension() {
    return super.onDidUninstallExtension;
  }
  get onDidUninstallExtension() {
    return Event.filter(this.onProfileAwareDidUninstallExtension, (e) => this.filterEvent(e), this.disposables);
  }
  get onProfileAwareDidUpdateExtensionMetadata() {
    return super.onDidUpdateExtensionMetadata;
  }
  filterEvent({ profileLocation, applicationScoped }) {
    profileLocation = profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource;
    return applicationScoped || this.uriIdentityService.extUri.isEqual(this.userDataProfileService.currentProfile.extensionsResource, profileLocation);
  }
  async getTargetPlatform() {
    return TargetPlatform.WEB;
  }
  async isExtensionPlatformCompatible(extension) {
    if (this.isConfiguredToExecuteOnWeb(extension)) {
      return true;
    }
    return super.isExtensionPlatformCompatible(extension);
  }
  async getInstalled(type, profileLocation) {
    const extensions = [];
    if (type === void 0 || type === ExtensionType.System) {
      const systemExtensions = await this.webExtensionsScannerService.scanSystemExtensions();
      extensions.push(...systemExtensions);
    }
    if (type === void 0 || type === ExtensionType.User) {
      const userExtensions = await this.webExtensionsScannerService.scanUserExtensions(profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource);
      extensions.push(...userExtensions);
    }
    return extensions.map((e) => toLocalExtension(e));
  }
  async install(location, options = {}) {
    this.logService.trace("ExtensionManagementService#install", location.toString());
    const manifest = await this.webExtensionsScannerService.scanExtensionManifest(location);
    if (!manifest || !manifest.name || !manifest.version) {
      throw new Error(`Cannot find a valid extension from the location ${location.toString()}`);
    }
    const result = await this.installExtensions([{ manifest, extension: location, options }]);
    if (result[0]?.local) {
      return result[0]?.local;
    }
    if (result[0]?.error) {
      throw result[0].error;
    }
    throw toExtensionManagementError(new Error(`Unknown error while installing extension ${getGalleryExtensionId(manifest.publisher, manifest.name)}`));
  }
  installFromLocation(location, profileLocation) {
    return this.install(location, { profileLocation });
  }
  async deleteExtension(extension) {
  }
  async copyExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
    const target = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, toProfileLocation);
    const source = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, fromProfileLocation);
    metadata = { ...source?.metadata, ...metadata };
    let scanned;
    if (target) {
      scanned = await this.webExtensionsScannerService.updateMetadata(extension, { ...target.metadata, ...metadata }, toProfileLocation);
    } else {
      scanned = await this.webExtensionsScannerService.addExtension(extension.location, metadata, toProfileLocation);
    }
    return toLocalExtension(scanned);
  }
  async moveExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
    const target = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, toProfileLocation);
    const source = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, fromProfileLocation);
    metadata = { ...source?.metadata, ...metadata };
    let scanned;
    if (target) {
      scanned = await this.webExtensionsScannerService.updateMetadata(extension, { ...target.metadata, ...metadata }, toProfileLocation);
    } else {
      scanned = await this.webExtensionsScannerService.addExtension(extension.location, metadata, toProfileLocation);
      if (source) {
        await this.webExtensionsScannerService.removeExtension(source, fromProfileLocation);
      }
    }
    return toLocalExtension(scanned);
  }
  async removeExtension(extension, fromProfileLocation) {
    const source = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, fromProfileLocation);
    if (source) {
      await this.webExtensionsScannerService.removeExtension(source, fromProfileLocation);
    }
  }
  async installExtensionsFromProfile(extensions, fromProfileLocation, toProfileLocation) {
    const result = [];
    const extensionsToInstall = (await this.webExtensionsScannerService.scanUserExtensions(fromProfileLocation)).filter((e) => extensions.some((id) => areSameExtensions(id, e.identifier)));
    if (extensionsToInstall.length) {
      await Promise.allSettled(extensionsToInstall.map(async (e) => {
        let local = await this.installFromLocation(e.location, toProfileLocation);
        if (e.metadata) {
          local = await this.updateMetadata(local, e.metadata, fromProfileLocation);
        }
        result.push(local);
      }));
    }
    return result;
  }
  async updateMetadata(local, metadata, profileLocation) {
    if (metadata.isMachineScoped === false) {
      metadata.isMachineScoped = void 0;
    }
    if (metadata.isBuiltin === false) {
      metadata.isBuiltin = void 0;
    }
    if (metadata.pinned === false) {
      metadata.pinned = void 0;
    }
    const updatedExtension = await this.webExtensionsScannerService.updateMetadata(local, metadata, profileLocation);
    const updatedLocalExtension = toLocalExtension(updatedExtension);
    this._onDidUpdateExtensionMetadata.fire({ local: updatedLocalExtension, profileLocation });
    return updatedLocalExtension;
  }
  async copyExtensions(fromProfileLocation, toProfileLocation) {
    await this.webExtensionsScannerService.copyExtensions(fromProfileLocation, toProfileLocation, (e) => !e.metadata?.isApplicationScoped);
  }
  async getCompatibleVersion(extension, sameVersion, includePreRelease, productVersion) {
    const compatibleExtension = await super.getCompatibleVersion(extension, sameVersion, includePreRelease, productVersion);
    if (compatibleExtension) {
      return compatibleExtension;
    }
    if (this.isConfiguredToExecuteOnWeb(extension)) {
      return extension;
    }
    return null;
  }
  isConfiguredToExecuteOnWeb(gallery) {
    const configuredExtensionKind = this.extensionManifestPropertiesService.getUserConfiguredExtensionKind(gallery.identifier);
    return !!configuredExtensionKind && configuredExtensionKind.includes("web");
  }
  getCurrentExtensionsManifestLocation() {
    return this.userDataProfileService.currentProfile.extensionsResource;
  }
  createInstallExtensionTask(manifest, extension, options) {
    return new InstallExtensionTask(manifest, extension, options, this.webExtensionsScannerService, this.userDataProfilesService);
  }
  createUninstallExtensionTask(extension, options) {
    return new UninstallExtensionTask(extension, options, this.webExtensionsScannerService);
  }
  zip(extension) {
    throw new Error("unsupported");
  }
  getManifest(vsix) {
    throw new Error("unsupported");
  }
  download() {
    throw new Error("unsupported");
  }
  async cleanUp() {
  }
  async whenProfileChanged(e) {
    const previousProfileLocation = e.previous.extensionsResource;
    const currentProfileLocation = e.profile.extensionsResource;
    if (!previousProfileLocation || !currentProfileLocation) {
      throw new Error("This should not happen");
    }
    const oldExtensions = await this.webExtensionsScannerService.scanUserExtensions(previousProfileLocation);
    const newExtensions = await this.webExtensionsScannerService.scanUserExtensions(currentProfileLocation);
    const { added, removed } = delta(oldExtensions, newExtensions, (a, b) => compare(`${ExtensionIdentifier.toKey(a.identifier.id)}@${a.manifest.version}`, `${ExtensionIdentifier.toKey(b.identifier.id)}@${b.manifest.version}`));
    this._onDidChangeProfile.fire({ added: added.map((e2) => toLocalExtension(e2)), removed: removed.map((e2) => toLocalExtension(e2)) });
  }
};
WebExtensionManagementService = __decorateClass([
  __decorateParam(0, IExtensionGalleryService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IWebExtensionsScannerService),
  __decorateParam(4, IExtensionManifestPropertiesService),
  __decorateParam(5, IUserDataProfileService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IAllowedExtensionsService),
  __decorateParam(8, IUserDataProfilesService),
  __decorateParam(9, IUriIdentityService)
], WebExtensionManagementService);
function toLocalExtension(extension) {
  const metadata = getMetadata(void 0, extension);
  return {
    ...extension,
    identifier: { id: extension.identifier.id, uuid: metadata.id ?? extension.identifier.uuid },
    isMachineScoped: !!metadata.isMachineScoped,
    isApplicationScoped: !!metadata.isApplicationScoped,
    publisherId: metadata.publisherId || null,
    publisherDisplayName: metadata.publisherDisplayName,
    installedTimestamp: metadata.installedTimestamp,
    isPreReleaseVersion: !!metadata.isPreReleaseVersion,
    hasPreReleaseVersion: !!metadata.hasPreReleaseVersion,
    preRelease: extension.preRelease,
    targetPlatform: TargetPlatform.WEB,
    updated: !!metadata.updated,
    pinned: !!metadata?.pinned,
    forceAutoUpdate: false,
    private: !!metadata.private,
    isWorkspaceScoped: false,
    source: metadata?.source ?? (extension.identifier.uuid ? "gallery" : "resource"),
    size: metadata.size ?? 0
  };
}
function getMetadata(options, existingExtension) {
  const metadata = { ...existingExtension?.metadata || {} };
  metadata.isMachineScoped = options?.isMachineScoped || metadata.isMachineScoped;
  return metadata;
}
class InstallExtensionTask extends AbstractExtensionTask {
  constructor(manifest, extension, options, webExtensionsScannerService, userDataProfilesService) {
    super();
    this.manifest = manifest;
    this.extension = extension;
    this.options = options;
    this.webExtensionsScannerService = webExtensionsScannerService;
    this.userDataProfilesService = userDataProfilesService;
    this._operation = InstallOperation.Install;
    this._profileLocation = options.profileLocation;
    this.identifier = URI.isUri(extension) ? { id: getGalleryExtensionId(manifest.publisher, manifest.name) } : extension.identifier;
    this.source = extension;
  }
  get profileLocation() {
    return this._profileLocation;
  }
  get operation() {
    return isUndefined(this.options.operation) ? this._operation : this.options.operation;
  }
  async doRun(token) {
    const userExtensions = await this.webExtensionsScannerService.scanUserExtensions(this.options.profileLocation);
    const existingExtension = userExtensions.find((e) => areSameExtensions(e.identifier, this.identifier));
    if (existingExtension) {
      this._operation = InstallOperation.Update;
    }
    const metadata = getMetadata(this.options, existingExtension);
    if (!URI.isUri(this.extension)) {
      metadata.id = this.extension.identifier.uuid;
      metadata.publisherDisplayName = this.extension.publisherDisplayName;
      metadata.publisherId = this.extension.publisherId;
      metadata.installedTimestamp = Date.now();
      metadata.isPreReleaseVersion = this.extension.properties.isPreReleaseVersion;
      metadata.hasPreReleaseVersion = metadata.hasPreReleaseVersion || this.extension.properties.isPreReleaseVersion;
      metadata.isBuiltin = this.options.isBuiltin || existingExtension?.isBuiltin;
      metadata.isSystem = existingExtension?.type === ExtensionType.System ? true : void 0;
      metadata.updated = !!existingExtension;
      metadata.isApplicationScoped = this.options.isApplicationScoped || metadata.isApplicationScoped;
      metadata.private = this.extension.private;
      metadata.preRelease = isBoolean(this.options.preRelease) ? this.options.preRelease : this.options.installPreReleaseVersion || this.extension.properties.isPreReleaseVersion || metadata.preRelease;
      metadata.source = URI.isUri(this.extension) ? "resource" : "gallery";
    }
    metadata.pinned = this.options.installGivenVersion ? true : this.options.pinned ?? metadata.pinned;
    this._profileLocation = metadata.isApplicationScoped ? this.userDataProfilesService.defaultProfile.extensionsResource : this.options.profileLocation;
    const scannedExtension = URI.isUri(this.extension) ? await this.webExtensionsScannerService.addExtension(this.extension, metadata, this.profileLocation) : await this.webExtensionsScannerService.addExtensionFromGallery(this.extension, metadata, this.profileLocation);
    return toLocalExtension(scannedExtension);
  }
}
class UninstallExtensionTask extends AbstractExtensionTask {
  constructor(extension, options, webExtensionsScannerService) {
    super();
    this.extension = extension;
    this.options = options;
    this.webExtensionsScannerService = webExtensionsScannerService;
  }
  doRun(token) {
    return this.webExtensionsScannerService.removeExtension(this.extension, this.options.profileLocation);
  }
}
export {
  WebExtensionManagementService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi93ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIEV4dGVuc2lvblR5cGUsIElFeHRlbnNpb24sIElFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uTWFuaWZlc3QsIFRhcmdldFBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxFeHRlbnNpb24sIElHYWxsZXJ5RXh0ZW5zaW9uLCBJbnN0YWxsT3BlcmF0aW9uLCBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIE1ldGFkYXRhLCBJbnN0YWxsT3B0aW9ucywgSVByb2R1Y3RWZXJzaW9uLCBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucywgZ2V0R2FsbGVyeUV4dGVuc2lvbklkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgSVByb2ZpbGVBd2FyZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJU2Nhbm5lZEV4dGVuc2lvbiwgSVdlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZSB9IGZyb20gJy4vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEFic3RyYWN0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIEFic3RyYWN0RXh0ZW5zaW9uVGFzaywgSUluc3RhbGxFeHRlbnNpb25UYXNrLCBJbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMsIElVbmluc3RhbGxFeHRlbnNpb25UYXNrLCB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvciwgVW5pbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9hYnN0cmFjdEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzQm9vbGVhbiwgaXNVbmRlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBEaWRDaGFuZ2VVc2VyRGF0YVByb2ZpbGVFdmVudCwgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBkZWx0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBjb21wYXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBXZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIEFic3RyYWN0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgaW1wbGVtZW50cyBJUHJvZmlsZUF3YXJlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGdldCBvblByb2ZpbGVBd2FyZUluc3RhbGxFeHRlbnNpb24oKSB7IHJldHVybiBzdXBlci5vbkluc3RhbGxFeHRlbnNpb247IH1cblx0b3ZlcnJpZGUgZ2V0IG9uSW5zdGFsbEV4dGVuc2lvbigpIHsgcmV0dXJuIEV2ZW50LmZpbHRlcih0aGlzLm9uUHJvZmlsZUF3YXJlSW5zdGFsbEV4dGVuc2lvbiwgZSA9PiB0aGlzLmZpbHRlckV2ZW50KGUpLCB0aGlzLmRpc3Bvc2FibGVzKTsgfVxuXG5cdGdldCBvblByb2ZpbGVBd2FyZURpZEluc3RhbGxFeHRlbnNpb25zKCkgeyByZXR1cm4gc3VwZXIub25EaWRJbnN0YWxsRXh0ZW5zaW9uczsgfVxuXHRvdmVycmlkZSBnZXQgb25EaWRJbnN0YWxsRXh0ZW5zaW9ucygpIHtcblx0XHRyZXR1cm4gRXZlbnQuZmlsdGVyKFxuXHRcdFx0RXZlbnQubWFwKHRoaXMub25Qcm9maWxlQXdhcmVEaWRJbnN0YWxsRXh0ZW5zaW9ucywgcmVzdWx0cyA9PiByZXN1bHRzLmZpbHRlcihlID0+IHRoaXMuZmlsdGVyRXZlbnQoZSkpLCB0aGlzLmRpc3Bvc2FibGVzKSxcblx0XHRcdHJlc3VsdHMgPT4gcmVzdWx0cy5sZW5ndGggPiAwLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0fVxuXG5cdGdldCBvblByb2ZpbGVBd2FyZVVuaW5zdGFsbEV4dGVuc2lvbigpIHsgcmV0dXJuIHN1cGVyLm9uVW5pbnN0YWxsRXh0ZW5zaW9uOyB9XG5cdG92ZXJyaWRlIGdldCBvblVuaW5zdGFsbEV4dGVuc2lvbigpIHsgcmV0dXJuIEV2ZW50LmZpbHRlcih0aGlzLm9uUHJvZmlsZUF3YXJlVW5pbnN0YWxsRXh0ZW5zaW9uLCBlID0+IHRoaXMuZmlsdGVyRXZlbnQoZSksIHRoaXMuZGlzcG9zYWJsZXMpOyB9XG5cblx0Z2V0IG9uUHJvZmlsZUF3YXJlRGlkVW5pbnN0YWxsRXh0ZW5zaW9uKCkgeyByZXR1cm4gc3VwZXIub25EaWRVbmluc3RhbGxFeHRlbnNpb247IH1cblx0b3ZlcnJpZGUgZ2V0IG9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uKCkgeyByZXR1cm4gRXZlbnQuZmlsdGVyKHRoaXMub25Qcm9maWxlQXdhcmVEaWRVbmluc3RhbGxFeHRlbnNpb24sIGUgPT4gdGhpcy5maWx0ZXJFdmVudChlKSwgdGhpcy5kaXNwb3NhYmxlcyk7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVByb2ZpbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGFkZGVkOiBJTG9jYWxFeHRlbnNpb25bXTsgcmVhZG9ubHkgcmVtb3ZlZDogSUxvY2FsRXh0ZW5zaW9uW10gfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvZmlsZSA9IHRoaXMuX29uRGlkQ2hhbmdlUHJvZmlsZS5ldmVudDtcblxuXHRnZXQgb25Qcm9maWxlQXdhcmVEaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YSgpIHsgcmV0dXJuIHN1cGVyLm9uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGE7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVdlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZTogSVdlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlOiBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VycmVudFByb2ZpbGUoZSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGUucHJldmlvdXMuZXh0ZW5zaW9uc1Jlc291cmNlLCBlLnByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKSkge1xuXHRcdFx0XHRlLmpvaW4odGhpcy53aGVuUHJvZmlsZUNoYW5nZWQoZSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyRXZlbnQoeyBwcm9maWxlTG9jYXRpb24sIGFwcGxpY2F0aW9uU2NvcGVkIH06IHsgcHJvZmlsZUxvY2F0aW9uPzogVVJJOyBhcHBsaWNhdGlvblNjb3BlZD86IGJvb2xlYW4gfSk6IGJvb2xlYW4ge1xuXHRcdHByb2ZpbGVMb2NhdGlvbiA9IHByb2ZpbGVMb2NhdGlvbiA/PyB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlO1xuXHRcdHJldHVybiBhcHBsaWNhdGlvblNjb3BlZCB8fCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLCBwcm9maWxlTG9jYXRpb24pO1xuXHR9XG5cblx0YXN5bmMgZ2V0VGFyZ2V0UGxhdGZvcm0oKTogUHJvbWlzZTxUYXJnZXRQbGF0Zm9ybT4ge1xuXHRcdHJldHVybiBUYXJnZXRQbGF0Zm9ybS5XRUI7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgaXNFeHRlbnNpb25QbGF0Zm9ybUNvbXBhdGlibGUoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLmlzQ29uZmlndXJlZFRvRXhlY3V0ZU9uV2ViKGV4dGVuc2lvbikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIuaXNFeHRlbnNpb25QbGF0Zm9ybUNvbXBhdGlibGUoZXh0ZW5zaW9uKTtcblx0fVxuXG5cdGFzeW5jIGdldEluc3RhbGxlZCh0eXBlPzogRXh0ZW5zaW9uVHlwZSwgcHJvZmlsZUxvY2F0aW9uPzogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBbXTtcblx0XHRpZiAodHlwZSA9PT0gdW5kZWZpbmVkIHx8IHR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtKSB7XG5cdFx0XHRjb25zdCBzeXN0ZW1FeHRlbnNpb25zID0gYXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhblN5c3RlbUV4dGVuc2lvbnMoKTtcblx0XHRcdGV4dGVuc2lvbnMucHVzaCguLi5zeXN0ZW1FeHRlbnNpb25zKTtcblx0XHR9XG5cdFx0aWYgKHR5cGUgPT09IHVuZGVmaW5lZCB8fCB0eXBlID09PSBFeHRlbnNpb25UeXBlLlVzZXIpIHtcblx0XHRcdGNvbnN0IHVzZXJFeHRlbnNpb25zID0gYXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhblVzZXJFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbiA/PyB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdGV4dGVuc2lvbnMucHVzaCguLi51c2VyRXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiBleHRlbnNpb25zLm1hcChlID0+IHRvTG9jYWxFeHRlbnNpb24oZSkpO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbChsb2NhdGlvbjogVVJJLCBvcHRpb25zOiBJbnN0YWxsT3B0aW9ucyA9IHt9KTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlI2luc3RhbGwnLCBsb2NhdGlvbi50b1N0cmluZygpKTtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5FeHRlbnNpb25NYW5pZmVzdChsb2NhdGlvbik7XG5cdFx0aWYgKCFtYW5pZmVzdCB8fCAhbWFuaWZlc3QubmFtZSB8fCAhbWFuaWZlc3QudmVyc2lvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZmluZCBhIHZhbGlkIGV4dGVuc2lvbiBmcm9tIHRoZSBsb2NhdGlvbiAke2xvY2F0aW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuaW5zdGFsbEV4dGVuc2lvbnMoW3sgbWFuaWZlc3QsIGV4dGVuc2lvbjogbG9jYXRpb24sIG9wdGlvbnMgfV0pO1xuXHRcdGlmIChyZXN1bHRbMF0/LmxvY2FsKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0WzBdPy5sb2NhbDtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdFswXT8uZXJyb3IpIHtcblx0XHRcdHRocm93IHJlc3VsdFswXS5lcnJvcjtcblx0XHR9XG5cdFx0dGhyb3cgdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmV3IEVycm9yKGBVbmtub3duIGVycm9yIHdoaWxlIGluc3RhbGxpbmcgZXh0ZW5zaW9uICR7Z2V0R2FsbGVyeUV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSl9YCkpO1xuXHR9XG5cblx0aW5zdGFsbEZyb21Mb2NhdGlvbihsb2NhdGlvbjogVVJJLCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFsbChsb2NhdGlvbiwgeyBwcm9maWxlTG9jYXRpb24gfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZGVsZXRlRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gZG8gbm90aGluZ1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGNvcHlFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSwgdG9Qcm9maWxlTG9jYXRpb246IFVSSSwgbWV0YWRhdGE6IFBhcnRpYWw8TWV0YWRhdGE+KTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuRXhpc3RpbmdFeHRlbnNpb24oZXh0ZW5zaW9uLmxvY2F0aW9uLCBleHRlbnNpb24udHlwZSwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5FeGlzdGluZ0V4dGVuc2lvbihleHRlbnNpb24ubG9jYXRpb24sIGV4dGVuc2lvbi50eXBlLCBmcm9tUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRtZXRhZGF0YSA9IHsgLi4uc291cmNlPy5tZXRhZGF0YSwgLi4ubWV0YWRhdGEgfTtcblxuXHRcdGxldCBzY2FubmVkO1xuXHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdHNjYW5uZWQgPSBhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS51cGRhdGVNZXRhZGF0YShleHRlbnNpb24sIHsgLi4udGFyZ2V0Lm1ldGFkYXRhLCAuLi5tZXRhZGF0YSB9LCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNjYW5uZWQgPSBhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5hZGRFeHRlbnNpb24oZXh0ZW5zaW9uLmxvY2F0aW9uLCBtZXRhZGF0YSwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gdG9Mb2NhbEV4dGVuc2lvbihzY2FubmVkKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBtb3ZlRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkksIHRvUHJvZmlsZUxvY2F0aW9uOiBVUkksIG1ldGFkYXRhOiBQYXJ0aWFsPE1ldGFkYXRhPik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gYXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhbkV4aXN0aW5nRXh0ZW5zaW9uKGV4dGVuc2lvbi5sb2NhdGlvbiwgZXh0ZW5zaW9uLnR5cGUsIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuRXhpc3RpbmdFeHRlbnNpb24oZXh0ZW5zaW9uLmxvY2F0aW9uLCBleHRlbnNpb24udHlwZSwgZnJvbVByb2ZpbGVMb2NhdGlvbik7XG5cdFx0bWV0YWRhdGEgPSB7IC4uLnNvdXJjZT8ubWV0YWRhdGEsIC4uLm1ldGFkYXRhIH07XG5cblx0XHRsZXQgc2Nhbm5lZDtcblx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRzY2FubmVkID0gYXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UudXBkYXRlTWV0YWRhdGEoZXh0ZW5zaW9uLCB7IC4uLnRhcmdldC5tZXRhZGF0YSwgLi4ubWV0YWRhdGEgfSwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzY2FubmVkID0gYXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UuYWRkRXh0ZW5zaW9uKGV4dGVuc2lvbi5sb2NhdGlvbiwgbWV0YWRhdGEsIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdGlmIChzb3VyY2UpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UucmVtb3ZlRXh0ZW5zaW9uKHNvdXJjZSwgZnJvbVByb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0b0xvY2FsRXh0ZW5zaW9uKHNjYW5uZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHJlbW92ZUV4dGVuc2lvbihleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhbkV4aXN0aW5nRXh0ZW5zaW9uKGV4dGVuc2lvbi5sb2NhdGlvbiwgZXh0ZW5zaW9uLnR5cGUsIGZyb21Qcm9maWxlTG9jYXRpb24pO1xuXHRcdGlmIChzb3VyY2UpIHtcblx0XHRcdGF3YWl0IHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnJlbW92ZUV4dGVuc2lvbihzb3VyY2UsIGZyb21Qcm9maWxlTG9jYXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGluc3RhbGxFeHRlbnNpb25zRnJvbVByb2ZpbGUoZXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJLCB0b1Byb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUxvY2FsRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRjb25zdCBleHRlbnNpb25zVG9JbnN0YWxsID0gKGF3YWl0IHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5Vc2VyRXh0ZW5zaW9ucyhmcm9tUHJvZmlsZUxvY2F0aW9uKSlcblx0XHRcdC5maWx0ZXIoZSA9PiBleHRlbnNpb25zLnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaWQsIGUuaWRlbnRpZmllcikpKTtcblx0XHRpZiAoZXh0ZW5zaW9uc1RvSW5zdGFsbC5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChleHRlbnNpb25zVG9JbnN0YWxsLm1hcChhc3luYyBlID0+IHtcblx0XHRcdFx0bGV0IGxvY2FsID0gYXdhaXQgdGhpcy5pbnN0YWxsRnJvbUxvY2F0aW9uKGUubG9jYXRpb24sIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdFx0aWYgKGUubWV0YWRhdGEpIHtcblx0XHRcdFx0XHRsb2NhbCA9IGF3YWl0IHRoaXMudXBkYXRlTWV0YWRhdGEobG9jYWwsIGUubWV0YWRhdGEsIGZyb21Qcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGxvY2FsKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZU1ldGFkYXRhKGxvY2FsOiBJTG9jYWxFeHRlbnNpb24sIG1ldGFkYXRhOiBQYXJ0aWFsPE1ldGFkYXRhPiwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdC8vIHVuc2V0IGlmIGZhbHNlXG5cdFx0aWYgKG1ldGFkYXRhLmlzTWFjaGluZVNjb3BlZCA9PT0gZmFsc2UpIHtcblx0XHRcdG1ldGFkYXRhLmlzTWFjaGluZVNjb3BlZCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKG1ldGFkYXRhLmlzQnVpbHRpbiA9PT0gZmFsc2UpIHtcblx0XHRcdG1ldGFkYXRhLmlzQnVpbHRpbiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKG1ldGFkYXRhLnBpbm5lZCA9PT0gZmFsc2UpIHtcblx0XHRcdG1ldGFkYXRhLnBpbm5lZCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdXBkYXRlZEV4dGVuc2lvbiA9IGF3YWl0IHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnVwZGF0ZU1ldGFkYXRhKGxvY2FsLCBtZXRhZGF0YSwgcHJvZmlsZUxvY2F0aW9uKTtcblx0XHRjb25zdCB1cGRhdGVkTG9jYWxFeHRlbnNpb24gPSB0b0xvY2FsRXh0ZW5zaW9uKHVwZGF0ZWRFeHRlbnNpb24pO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEuZmlyZSh7IGxvY2FsOiB1cGRhdGVkTG9jYWxFeHRlbnNpb24sIHByb2ZpbGVMb2NhdGlvbiB9KTtcblx0XHRyZXR1cm4gdXBkYXRlZExvY2FsRXh0ZW5zaW9uO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgY29weUV4dGVuc2lvbnMoZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJLCB0b1Byb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UuY29weUV4dGVuc2lvbnMoZnJvbVByb2ZpbGVMb2NhdGlvbiwgdG9Qcm9maWxlTG9jYXRpb24sIGUgPT4gIWUubWV0YWRhdGE/LmlzQXBwbGljYXRpb25TY29wZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGdldENvbXBhdGlibGVWZXJzaW9uKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIHNhbWVWZXJzaW9uOiBib29sZWFuLCBpbmNsdWRlUHJlUmVsZWFzZTogYm9vbGVhbiwgcHJvZHVjdFZlcnNpb246IElQcm9kdWN0VmVyc2lvbik6IFByb21pc2U8SUdhbGxlcnlFeHRlbnNpb24gfCBudWxsPiB7XG5cdFx0Y29uc3QgY29tcGF0aWJsZUV4dGVuc2lvbiA9IGF3YWl0IHN1cGVyLmdldENvbXBhdGlibGVWZXJzaW9uKGV4dGVuc2lvbiwgc2FtZVZlcnNpb24sIGluY2x1ZGVQcmVSZWxlYXNlLCBwcm9kdWN0VmVyc2lvbik7XG5cdFx0aWYgKGNvbXBhdGlibGVFeHRlbnNpb24pIHtcblx0XHRcdHJldHVybiBjb21wYXRpYmxlRXh0ZW5zaW9uO1xuXHRcdH1cblx0XHRpZiAodGhpcy5pc0NvbmZpZ3VyZWRUb0V4ZWN1dGVPbldlYihleHRlbnNpb24pKSB7XG5cdFx0XHRyZXR1cm4gZXh0ZW5zaW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgaXNDb25maWd1cmVkVG9FeGVjdXRlT25XZWIoZ2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb24pOiBib29sZWFuIHtcblx0XHRjb25zdCBjb25maWd1cmVkRXh0ZW5zaW9uS2luZCA9IHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5nZXRVc2VyQ29uZmlndXJlZEV4dGVuc2lvbktpbmQoZ2FsbGVyeS5pZGVudGlmaWVyKTtcblx0XHRyZXR1cm4gISFjb25maWd1cmVkRXh0ZW5zaW9uS2luZCAmJiBjb25maWd1cmVkRXh0ZW5zaW9uS2luZC5pbmNsdWRlcygnd2ViJyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0Q3VycmVudEV4dGVuc2lvbnNNYW5pZmVzdExvY2F0aW9uKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlSW5zdGFsbEV4dGVuc2lvblRhc2sobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCwgZXh0ZW5zaW9uOiBVUkkgfCBJR2FsbGVyeUV4dGVuc2lvbiwgb3B0aW9uczogSW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zKTogSUluc3RhbGxFeHRlbnNpb25UYXNrIHtcblx0XHRyZXR1cm4gbmV3IEluc3RhbGxFeHRlbnNpb25UYXNrKG1hbmlmZXN0LCBleHRlbnNpb24sIG9wdGlvbnMsIHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVVbmluc3RhbGxFeHRlbnNpb25UYXNrKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBvcHRpb25zOiBVbmluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucyk6IElVbmluc3RhbGxFeHRlbnNpb25UYXNrIHtcblx0XHRyZXR1cm4gbmV3IFVuaW5zdGFsbEV4dGVuc2lvblRhc2soZXh0ZW5zaW9uLCBvcHRpb25zLCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZSk7XG5cdH1cblxuXHR6aXAoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPFVSST4geyB0aHJvdyBuZXcgRXJyb3IoJ3Vuc3VwcG9ydGVkJyk7IH1cblx0Z2V0TWFuaWZlc3QodnNpeDogVVJJKTogUHJvbWlzZTxJRXh0ZW5zaW9uTWFuaWZlc3Q+IHsgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCcpOyB9XG5cdGRvd25sb2FkKCk6IFByb21pc2U8VVJJPiB7IHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQnKTsgfVxuXG5cdGFzeW5jIGNsZWFuVXAoKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRwcml2YXRlIGFzeW5jIHdoZW5Qcm9maWxlQ2hhbmdlZChlOiBEaWRDaGFuZ2VVc2VyRGF0YVByb2ZpbGVFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByZXZpb3VzUHJvZmlsZUxvY2F0aW9uID0gZS5wcmV2aW91cy5leHRlbnNpb25zUmVzb3VyY2U7XG5cdFx0Y29uc3QgY3VycmVudFByb2ZpbGVMb2NhdGlvbiA9IGUucHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2U7XG5cdFx0aWYgKCFwcmV2aW91c1Byb2ZpbGVMb2NhdGlvbiB8fCAhY3VycmVudFByb2ZpbGVMb2NhdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUaGlzIHNob3VsZCBub3QgaGFwcGVuJyk7XG5cdFx0fVxuXHRcdGNvbnN0IG9sZEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuVXNlckV4dGVuc2lvbnMocHJldmlvdXNQcm9maWxlTG9jYXRpb24pO1xuXHRcdGNvbnN0IG5ld0V4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuVXNlckV4dGVuc2lvbnMoY3VycmVudFByb2ZpbGVMb2NhdGlvbik7XG5cdFx0Y29uc3QgeyBhZGRlZCwgcmVtb3ZlZCB9ID0gZGVsdGEob2xkRXh0ZW5zaW9ucywgbmV3RXh0ZW5zaW9ucywgKGEsIGIpID0+IGNvbXBhcmUoYCR7RXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShhLmlkZW50aWZpZXIuaWQpfUAke2EubWFuaWZlc3QudmVyc2lvbn1gLCBgJHtFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGIuaWRlbnRpZmllci5pZCl9QCR7Yi5tYW5pZmVzdC52ZXJzaW9ufWApKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVByb2ZpbGUuZmlyZSh7IGFkZGVkOiBhZGRlZC5tYXAoZSA9PiB0b0xvY2FsRXh0ZW5zaW9uKGUpKSwgcmVtb3ZlZDogcmVtb3ZlZC5tYXAoZSA9PiB0b0xvY2FsRXh0ZW5zaW9uKGUpKSB9KTtcblx0fVxufVxuXG5mdW5jdGlvbiB0b0xvY2FsRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IElMb2NhbEV4dGVuc2lvbiB7XG5cdGNvbnN0IG1ldGFkYXRhID0gZ2V0TWV0YWRhdGEodW5kZWZpbmVkLCBleHRlbnNpb24pO1xuXHRyZXR1cm4ge1xuXHRcdC4uLmV4dGVuc2lvbixcblx0XHRpZGVudGlmaWVyOiB7IGlkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgdXVpZDogbWV0YWRhdGEuaWQgPz8gZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCB9LFxuXHRcdGlzTWFjaGluZVNjb3BlZDogISFtZXRhZGF0YS5pc01hY2hpbmVTY29wZWQsXG5cdFx0aXNBcHBsaWNhdGlvblNjb3BlZDogISFtZXRhZGF0YS5pc0FwcGxpY2F0aW9uU2NvcGVkLFxuXHRcdHB1Ymxpc2hlcklkOiBtZXRhZGF0YS5wdWJsaXNoZXJJZCB8fCBudWxsLFxuXHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBtZXRhZGF0YS5wdWJsaXNoZXJEaXNwbGF5TmFtZSxcblx0XHRpbnN0YWxsZWRUaW1lc3RhbXA6IG1ldGFkYXRhLmluc3RhbGxlZFRpbWVzdGFtcCxcblx0XHRpc1ByZVJlbGVhc2VWZXJzaW9uOiAhIW1ldGFkYXRhLmlzUHJlUmVsZWFzZVZlcnNpb24sXG5cdFx0aGFzUHJlUmVsZWFzZVZlcnNpb246ICEhbWV0YWRhdGEuaGFzUHJlUmVsZWFzZVZlcnNpb24sXG5cdFx0cHJlUmVsZWFzZTogZXh0ZW5zaW9uLnByZVJlbGVhc2UsXG5cdFx0dGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtLldFQixcblx0XHR1cGRhdGVkOiAhIW1ldGFkYXRhLnVwZGF0ZWQsXG5cdFx0cGlubmVkOiAhIW1ldGFkYXRhPy5waW5uZWQsXG5cdFx0Zm9yY2VBdXRvVXBkYXRlOiBmYWxzZSxcblx0XHRwcml2YXRlOiAhIW1ldGFkYXRhLnByaXZhdGUsXG5cdFx0aXNXb3Jrc3BhY2VTY29wZWQ6IGZhbHNlLFxuXHRcdHNvdXJjZTogbWV0YWRhdGE/LnNvdXJjZSA/PyAoZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCA/ICdnYWxsZXJ5JyA6ICdyZXNvdXJjZScpLFxuXHRcdHNpemU6IG1ldGFkYXRhLnNpemUgPz8gMCxcblx0fTtcbn1cblxuZnVuY3Rpb24gZ2V0TWV0YWRhdGEob3B0aW9ucz86IEluc3RhbGxPcHRpb25zLCBleGlzdGluZ0V4dGVuc2lvbj86IElFeHRlbnNpb24pOiBNZXRhZGF0YSB7XG5cdGNvbnN0IG1ldGFkYXRhOiBNZXRhZGF0YSA9IHsgLi4uKCg8SVNjYW5uZWRFeHRlbnNpb24+ZXhpc3RpbmdFeHRlbnNpb24pPy5tZXRhZGF0YSB8fCB7fSkgfTtcblx0bWV0YWRhdGEuaXNNYWNoaW5lU2NvcGVkID0gb3B0aW9ucz8uaXNNYWNoaW5lU2NvcGVkIHx8IG1ldGFkYXRhLmlzTWFjaGluZVNjb3BlZDtcblx0cmV0dXJuIG1ldGFkYXRhO1xufVxuXG5jbGFzcyBJbnN0YWxsRXh0ZW5zaW9uVGFzayBleHRlbmRzIEFic3RyYWN0RXh0ZW5zaW9uVGFzazxJTG9jYWxFeHRlbnNpb24+IGltcGxlbWVudHMgSUluc3RhbGxFeHRlbnNpb25UYXNrIHtcblxuXHRyZWFkb25seSBpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcjtcblx0cmVhZG9ubHkgc291cmNlOiBVUkkgfCBJR2FsbGVyeUV4dGVuc2lvbjtcblxuXHRwcml2YXRlIF9wcm9maWxlTG9jYXRpb246IFVSSTtcblx0Z2V0IHByb2ZpbGVMb2NhdGlvbigpIHsgcmV0dXJuIHRoaXMuX3Byb2ZpbGVMb2NhdGlvbjsgfVxuXG5cdHByaXZhdGUgX29wZXJhdGlvbiA9IEluc3RhbGxPcGVyYXRpb24uSW5zdGFsbDtcblx0Z2V0IG9wZXJhdGlvbigpIHsgcmV0dXJuIGlzVW5kZWZpbmVkKHRoaXMub3B0aW9ucy5vcGVyYXRpb24pID8gdGhpcy5fb3BlcmF0aW9uIDogdGhpcy5vcHRpb25zLm9wZXJhdGlvbjsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb246IFVSSSB8IElHYWxsZXJ5RXh0ZW5zaW9uLFxuXHRcdHJlYWRvbmx5IG9wdGlvbnM6IEluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZTogSVdlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcHJvZmlsZUxvY2F0aW9uID0gb3B0aW9ucy5wcm9maWxlTG9jYXRpb247XG5cdFx0dGhpcy5pZGVudGlmaWVyID0gVVJJLmlzVXJpKGV4dGVuc2lvbikgPyB7IGlkOiBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQobWFuaWZlc3QucHVibGlzaGVyLCBtYW5pZmVzdC5uYW1lKSB9IDogZXh0ZW5zaW9uLmlkZW50aWZpZXI7XG5cdFx0dGhpcy5zb3VyY2UgPSBleHRlbnNpb247XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZG9SdW4odG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRjb25zdCB1c2VyRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5Vc2VyRXh0ZW5zaW9ucyh0aGlzLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uKTtcblx0XHRjb25zdCBleGlzdGluZ0V4dGVuc2lvbiA9IHVzZXJFeHRlbnNpb25zLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHRoaXMuaWRlbnRpZmllcikpO1xuXHRcdGlmIChleGlzdGluZ0V4dGVuc2lvbikge1xuXHRcdFx0dGhpcy5fb3BlcmF0aW9uID0gSW5zdGFsbE9wZXJhdGlvbi5VcGRhdGU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBnZXRNZXRhZGF0YSh0aGlzLm9wdGlvbnMsIGV4aXN0aW5nRXh0ZW5zaW9uKTtcblx0XHRpZiAoIVVSSS5pc1VyaSh0aGlzLmV4dGVuc2lvbikpIHtcblx0XHRcdG1ldGFkYXRhLmlkID0gdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci51dWlkO1xuXHRcdFx0bWV0YWRhdGEucHVibGlzaGVyRGlzcGxheU5hbWUgPSB0aGlzLmV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZTtcblx0XHRcdG1ldGFkYXRhLnB1Ymxpc2hlcklkID0gdGhpcy5leHRlbnNpb24ucHVibGlzaGVySWQ7XG5cdFx0XHRtZXRhZGF0YS5pbnN0YWxsZWRUaW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuXHRcdFx0bWV0YWRhdGEuaXNQcmVSZWxlYXNlVmVyc2lvbiA9IHRoaXMuZXh0ZW5zaW9uLnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbjtcblx0XHRcdG1ldGFkYXRhLmhhc1ByZVJlbGVhc2VWZXJzaW9uID0gbWV0YWRhdGEuaGFzUHJlUmVsZWFzZVZlcnNpb24gfHwgdGhpcy5leHRlbnNpb24ucHJvcGVydGllcy5pc1ByZVJlbGVhc2VWZXJzaW9uO1xuXHRcdFx0bWV0YWRhdGEuaXNCdWlsdGluID0gdGhpcy5vcHRpb25zLmlzQnVpbHRpbiB8fCBleGlzdGluZ0V4dGVuc2lvbj8uaXNCdWlsdGluO1xuXHRcdFx0bWV0YWRhdGEuaXNTeXN0ZW0gPSBleGlzdGluZ0V4dGVuc2lvbj8udHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0gPyB0cnVlIDogdW5kZWZpbmVkO1xuXHRcdFx0bWV0YWRhdGEudXBkYXRlZCA9ICEhZXhpc3RpbmdFeHRlbnNpb247XG5cdFx0XHRtZXRhZGF0YS5pc0FwcGxpY2F0aW9uU2NvcGVkID0gdGhpcy5vcHRpb25zLmlzQXBwbGljYXRpb25TY29wZWQgfHwgbWV0YWRhdGEuaXNBcHBsaWNhdGlvblNjb3BlZDtcblx0XHRcdG1ldGFkYXRhLnByaXZhdGUgPSB0aGlzLmV4dGVuc2lvbi5wcml2YXRlO1xuXHRcdFx0bWV0YWRhdGEucHJlUmVsZWFzZSA9IGlzQm9vbGVhbih0aGlzLm9wdGlvbnMucHJlUmVsZWFzZSlcblx0XHRcdFx0PyB0aGlzLm9wdGlvbnMucHJlUmVsZWFzZVxuXHRcdFx0XHQ6IHRoaXMub3B0aW9ucy5pbnN0YWxsUHJlUmVsZWFzZVZlcnNpb24gfHwgdGhpcy5leHRlbnNpb24ucHJvcGVydGllcy5pc1ByZVJlbGVhc2VWZXJzaW9uIHx8IG1ldGFkYXRhLnByZVJlbGVhc2U7XG5cdFx0XHRtZXRhZGF0YS5zb3VyY2UgPSBVUkkuaXNVcmkodGhpcy5leHRlbnNpb24pID8gJ3Jlc291cmNlJyA6ICdnYWxsZXJ5Jztcblx0XHR9XG5cdFx0bWV0YWRhdGEucGlubmVkID0gdGhpcy5vcHRpb25zLmluc3RhbGxHaXZlblZlcnNpb24gPyB0cnVlIDogKHRoaXMub3B0aW9ucy5waW5uZWQgPz8gbWV0YWRhdGEucGlubmVkKTtcblxuXHRcdHRoaXMuX3Byb2ZpbGVMb2NhdGlvbiA9IG1ldGFkYXRhLmlzQXBwbGljYXRpb25TY29wZWQgPyB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSA6IHRoaXMub3B0aW9ucy5wcm9maWxlTG9jYXRpb247XG5cdFx0Y29uc3Qgc2Nhbm5lZEV4dGVuc2lvbiA9IFVSSS5pc1VyaSh0aGlzLmV4dGVuc2lvbikgPyBhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5hZGRFeHRlbnNpb24odGhpcy5leHRlbnNpb24sIG1ldGFkYXRhLCB0aGlzLnByb2ZpbGVMb2NhdGlvbilcblx0XHRcdDogYXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UuYWRkRXh0ZW5zaW9uRnJvbUdhbGxlcnkodGhpcy5leHRlbnNpb24sIG1ldGFkYXRhLCB0aGlzLnByb2ZpbGVMb2NhdGlvbik7XG5cdFx0cmV0dXJuIHRvTG9jYWxFeHRlbnNpb24oc2Nhbm5lZEV4dGVuc2lvbik7XG5cdH1cbn1cblxuY2xhc3MgVW5pbnN0YWxsRXh0ZW5zaW9uVGFzayBleHRlbmRzIEFic3RyYWN0RXh0ZW5zaW9uVGFzazx2b2lkPiBpbXBsZW1lbnRzIElVbmluc3RhbGxFeHRlbnNpb25UYXNrIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbixcblx0XHRyZWFkb25seSBvcHRpb25zOiBVbmluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZTogSVdlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBkb1J1bih0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UucmVtb3ZlRXh0ZW5zaW9uKHRoaXMuZXh0ZW5zaW9uLCB0aGlzLm9wdGlvbnMucHJvZmlsZUxvY2F0aW9uKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHFCQUFxQixlQUFxRSxzQkFBc0I7QUFDekgsU0FBNkMsa0JBQWtCLDBCQUFxRSxpQ0FBaUM7QUFDckssU0FBUyxXQUFXO0FBQ3BCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsbUJBQW1CLDZCQUE2QjtBQUN6RCxTQUFxRSxvQ0FBb0M7QUFDekcsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxvQ0FBb0MsdUJBQW9HLGtDQUFpRTtBQUNsTixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVcsbUJBQW1CO0FBQ3ZDLFNBQXdDLCtCQUErQjtBQUN2RSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBRXpCLElBQU0sZ0NBQU4sY0FBNEMsbUNBQXNGO0FBQUEsRUEyQnhJLFlBQzJCLHlCQUNQLGtCQUNOLFlBQ2tDLDZCQUNPLG9DQUNaLHdCQUN6QixnQkFDVSwwQkFDRCx5QkFDTCxvQkFDcEI7QUFDRCxVQUFNLHlCQUF5QixrQkFBa0Isb0JBQW9CLFlBQVksZ0JBQWdCLDBCQUEwQix1QkFBdUI7QUFSbkc7QUFDTztBQUNaO0FBN0IzQyxTQUFpQixjQUFjLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBa0JuRSxTQUFpQixzQkFBc0IsS0FBSyxVQUFVLElBQUksUUFBb0YsQ0FBQztBQUMvSSxTQUFTLHFCQUFxQixLQUFLLG9CQUFvQjtBQWlCdEQsU0FBSyxVQUFVLHVCQUF1QiwwQkFBMEIsT0FBSztBQUNwRSxVQUFJLENBQUMsS0FBSyxtQkFBbUIsT0FBTyxRQUFRLEVBQUUsU0FBUyxvQkFB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
