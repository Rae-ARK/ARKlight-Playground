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
import { CancellationToken } from "../../../base/common/cancellation.js";
import { getErrorMessage, isCancellationError } from "../../../base/common/errors.js";
import { Schemas } from "../../../base/common/network.js";
import { basename } from "../../../base/common/resources.js";
import { gt } from "../../../base/common/semver/semver.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { EXTENSION_IDENTIFIER_REGEX, IExtensionGalleryService, IExtensionManagementService, InstallOperation } from "./extensionManagement.js";
import { areSameExtensions, getExtensionId, getGalleryExtensionId, getIdAndVersion } from "./extensionManagementUtil.js";
import { ExtensionType, EXTENSION_CATEGORIES } from "../../extensions/common/extensions.js";
import { IProductService } from "../../product/common/productService.js";
const notFound = (id) => localize("notFound", "Extension '{0}' not found.", id);
const useId = localize("useId", "Make sure you use the full extension ID, including the publisher, e.g.: {0}", "ms-dotnettools.csharp");
let ExtensionManagementCLI = class {
  constructor(extensionsForceVersionByQuality, logger, extensionManagementService, extensionGalleryService, productService) {
    this.extensionsForceVersionByQuality = extensionsForceVersionByQuality;
    this.logger = logger;
    this.extensionManagementService = extensionManagementService;
    this.extensionGalleryService = extensionGalleryService;
    this.productService = productService;
    this.extensionsForceVersionByQuality = this.extensionsForceVersionByQuality.map((e) => e.toLowerCase());
  }
  get location() {
    return void 0;
  }
  async listExtensions(showVersions, category, profileLocation) {
    let extensions = await this.extensionManagementService.getInstalled(ExtensionType.User, profileLocation);
    const categories = EXTENSION_CATEGORIES.map((c) => c.toLowerCase());
    if (category && category !== "") {
      if (categories.indexOf(category.toLowerCase()) < 0) {
        this.logger.info("Invalid category please enter a valid category. To list valid categories run --category without a category specified");
        return;
      }
      extensions = extensions.filter((e) => {
        if (e.manifest.categories) {
          const lowerCaseCategories = e.manifest.categories.map((c) => c.toLowerCase());
          return lowerCaseCategories.indexOf(category.toLowerCase()) > -1;
        }
        return false;
      });
    } else if (category === "") {
      this.logger.info("Possible Categories: ");
      categories.forEach((category2) => {
        this.logger.info(category2);
      });
      return;
    }
    if (this.location) {
      this.logger.info(localize("listFromLocation", "Extensions installed on {0}:", this.location));
    }
    extensions = extensions.sort((e1, e2) => e1.identifier.id.localeCompare(e2.identifier.id));
    let lastId = void 0;
    for (const extension of extensions) {
      if (lastId !== extension.identifier.id) {
        lastId = extension.identifier.id;
        this.logger.info(showVersions ? `${lastId}@${extension.manifest.version}` : lastId);
      }
    }
  }
  async installExtensions(extensions, builtinExtensions, installOptions, force) {
    const failed = [];
    try {
      if (extensions.length) {
        this.logger.info(this.location ? localize("installingExtensionsOnLocation", "Installing extensions on {0}...", this.location) : localize("installingExtensions", "Installing extensions..."));
      }
      const installVSIXInfos = [];
      const installExtensionInfos = [];
      const addInstallExtensionInfo = (id, version, isBuiltin) => {
        if (this.extensionsForceVersionByQuality?.some((e) => e === id.toLowerCase())) {
          version = this.productService.quality !== "stable" ? "prerelease" : void 0;
        }
        installExtensionInfos.push({ id, version: version !== "prerelease" ? version : void 0, installOptions: { ...installOptions, isBuiltin, installPreReleaseVersion: version === "prerelease" || installOptions.installPreReleaseVersion } });
      };
      for (const extension of extensions) {
        if (extension instanceof URI) {
          installVSIXInfos.push({ vsix: extension, installOptions });
        } else {
          const [id, version] = getIdAndVersion(extension);
          addInstallExtensionInfo(id, version, false);
        }
      }
      for (const extension of builtinExtensions) {
        if (extension instanceof URI) {
          installVSIXInfos.push({ vsix: extension, installOptions: { ...installOptions, isBuiltin: true, donotIncludePackAndDependencies: true } });
        } else {
          const [id, version] = getIdAndVersion(extension);
          addInstallExtensionInfo(id, version, true);
        }
      }
      const installed = await this.extensionManagementService.getInstalled(void 0, installOptions.profileLocation);
      if (installVSIXInfos.length) {
        await Promise.all(installVSIXInfos.map(async ({ vsix, installOptions: installOptions2 }) => {
          try {
            await this.installVSIX(vsix, installOptions2, force, installed);
          } catch (err) {
            this.logger.error(err);
            failed.push(vsix.toString());
          }
        }));
      }
      if (installExtensionInfos.length) {
        const failedGalleryExtensions = await this.installGalleryExtensions(installExtensionInfos, installed, force);
        failed.push(...failedGalleryExtensions);
      }
    } catch (error) {
      this.logger.error(localize("error while installing extensions", "Error while installing extensions: {0}", getErrorMessage(error)));
      throw error;
    }
    if (failed.length) {
      throw new Error(localize("installation failed", "Failed Installing Extensions: {0}", failed.join(", ")));
    }
  }
  async updateExtensions(profileLocation) {
    const installedExtensions = await this.extensionManagementService.getInstalled(ExtensionType.User, profileLocation);
    const installedExtensionsQuery = [];
    for (const extension of installedExtensions) {
      if (!!extension.identifier.uuid) {
        installedExtensionsQuery.push({ ...extension.identifier, preRelease: extension.preRelease });
      }
    }
    this.logger.trace(localize({ key: "updateExtensionsQuery", comment: ["Placeholder is for the count of extensions"] }, "Fetching latest versions for {0} extensions", installedExtensionsQuery.length));
    const availableVersions = await this.extensionGalleryService.getExtensions(installedExtensionsQuery, { compatible: true }, CancellationToken.None);
    const extensionsToUpdate = [];
    for (const newVersion of availableVersions) {
      for (const oldVersion of installedExtensions) {
        if (areSameExtensions(oldVersion.identifier, newVersion.identifier) && gt(newVersion.version, oldVersion.manifest.version)) {
          extensionsToUpdate.push({
            extension: newVersion,
            options: { operation: InstallOperation.Update, installPreReleaseVersion: oldVersion.preRelease, profileLocation, isApplicationScoped: oldVersion.isApplicationScoped }
          });
        }
      }
    }
    if (!extensionsToUpdate.length) {
      this.logger.info(localize("updateExtensionsNoExtensions", "No extension to update"));
      return;
    }
    this.logger.info(localize("updateExtensionsNewVersionsAvailable", "Updating extensions: {0}", extensionsToUpdate.map((ext) => ext.extension.identifier.id).join(", ")));
    const installationResult = await this.extensionManagementService.installGalleryExtensions(extensionsToUpdate);
    for (const extensionResult of installationResult) {
      if (extensionResult.error) {
        this.logger.error(localize("errorUpdatingExtension", "Error while updating extension {0}: {1}", extensionResult.identifier.id, getErrorMessage(extensionResult.error)));
      } else {
        this.logger.info(localize("successUpdate", "Extension '{0}' v{1} was successfully updated.", extensionResult.identifier.id, extensionResult.local?.manifest.version));
      }
    }
  }
  async installGalleryExtensions(installExtensionInfos, installed, force) {
    installExtensionInfos = installExtensionInfos.filter((installExtensionInfo) => {
      const { id, version, installOptions } = installExtensionInfo;
      const installedExtension = installed.find((i) => areSameExtensions(i.identifier, { id }));
      if (installedExtension) {
        const builtinAutoUpdateMessage = this.validateBuiltinExtensionEnabledWithAutoUpdates(installedExtension);
        if (builtinAutoUpdateMessage) {
          this.logger.info(builtinAutoUpdateMessage);
          return false;
        }
        if (!force && (!version || version === "prerelease" && installedExtension.preRelease)) {
          this.logger.info(localize("alreadyInstalled-checkAndUpdate", "Extension '{0}' v{1} is already installed. Use '--force' option to update to latest version or provide '@<version>' to install a specific version, for example: '{2}@1.2.3'.", id, installedExtension.manifest.version, id));
          return false;
        }
        if (version && installedExtension.manifest.version === version) {
          this.logger.info(localize("alreadyInstalled", "Extension '{0}' is already installed.", `${id}@${version}`));
          return false;
        }
        if (installedExtension.preRelease && version !== "prerelease") {
          installOptions.preRelease = false;
        }
      }
      return true;
    });
    if (!installExtensionInfos.length) {
      return [];
    }
    const failed = [];
    const extensionsToInstall = [];
    const galleryExtensions = await this.getGalleryExtensions(installExtensionInfos);
    await Promise.all(installExtensionInfos.map(async ({ id, version, installOptions }) => {
      const gallery = galleryExtensions.get(id.toLowerCase());
      if (!gallery) {
        this.logger.error(`${notFound(version ? `${id}@${version}` : id)}
${useId}`);
        failed.push(id);
        return;
      }
      try {
        const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
        if (manifest && !this.validateExtensionKind(manifest)) {
          return;
        }
      } catch (err) {
        this.logger.error(err.message || err.stack || err);
        failed.push(id);
        return;
      }
      const installedExtension = installed.find((e) => areSameExtensions(e.identifier, gallery.identifier));
      if (installedExtension) {
        if (gallery.version === installedExtension.manifest.version) {
          this.logger.info(localize("alreadyInstalled", "Extension '{0}' is already installed.", version ? `${id}@${version}` : id));
          return;
        }
        this.logger.info(localize("updateMessage", "Updating the extension '{0}' to the version {1}", id, gallery.version));
      }
      if (installOptions.isBuiltin) {
        this.logger.info(version ? localize("installing builtin with version", "Installing builtin extension '{0}' v{1}...", id, version) : localize("installing builtin ", "Installing builtin extension '{0}'...", id));
      } else {
        this.logger.info(version ? localize("installing with version", "Installing extension '{0}' v{1}...", id, version) : localize("installing", "Installing extension '{0}'...", id));
      }
      extensionsToInstall.push({
        extension: gallery,
        options: { ...installOptions, installGivenVersion: !!version, isApplicationScoped: installOptions.isApplicationScoped || installedExtension?.isApplicationScoped }
      });
    }));
    if (extensionsToInstall.length) {
      const installationResult = await this.extensionManagementService.installGalleryExtensions(extensionsToInstall);
      for (const extensionResult of installationResult) {
        if (extensionResult.error) {
          this.logger.error(localize("errorInstallingExtension", "Error while installing extension {0}: {1}", extensionResult.identifier.id, getErrorMessage(extensionResult.error)));
          failed.push(extensionResult.identifier.id);
        } else {
          this.logger.info(localize("successInstall", "Extension '{0}' v{1} was successfully installed.", extensionResult.identifier.id, extensionResult.local?.manifest.version));
        }
      }
    }
    return failed;
  }
  async installVSIX(vsix, installOptions, force, installedExtensions) {
    const manifest = await this.extensionManagementService.getManifest(vsix);
    if (!manifest) {
      throw new Error("Invalid vsix");
    }
    const valid = await this.validateVSIX(manifest, force, installOptions.profileLocation, installedExtensions);
    if (valid) {
      try {
        await this.extensionManagementService.install(vsix, { ...installOptions, installGivenVersion: true });
        this.logger.info(localize("successVsixInstall", "Extension '{0}' was successfully installed.", basename(vsix)));
      } catch (error) {
        if (isCancellationError(error)) {
          this.logger.info(localize("cancelVsixInstall", "Cancelled installing extension '{0}'.", basename(vsix)));
        } else {
          throw error;
        }
      }
    }
  }
  async getGalleryExtensions(extensions) {
    const galleryExtensions = /* @__PURE__ */ new Map();
    const preRelease = extensions.some((e) => e.installOptions.installPreReleaseVersion);
    const targetPlatform = await this.extensionManagementService.getTargetPlatform();
    const extensionInfos = [];
    for (const extension of extensions) {
      if (EXTENSION_IDENTIFIER_REGEX.test(extension.id)) {
        extensionInfos.push({ ...extension, preRelease });
      }
    }
    if (extensionInfos.length) {
      const result = await this.extensionGalleryService.getExtensions(extensionInfos, { targetPlatform }, CancellationToken.None);
      for (const extension of result) {
        galleryExtensions.set(extension.identifier.id.toLowerCase(), extension);
      }
    }
    return galleryExtensions;
  }
  validateExtensionKind(_manifest) {
    return true;
  }
  async validateVSIX(manifest, force, profileLocation, installedExtensions) {
    const extensionIdentifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name) };
    const existingExtension = installedExtensions.find((local) => areSameExtensions(extensionIdentifier, local.identifier));
    if (existingExtension) {
      const builtinAutoUpdateMessage = this.validateBuiltinExtensionEnabledWithAutoUpdates(existingExtension);
      if (builtinAutoUpdateMessage) {
        this.logger.info(builtinAutoUpdateMessage);
        return false;
      }
      if (!force) {
        if (gt(existingExtension.manifest.version, manifest.version)) {
          this.logger.info(localize("forceDowngrade", "A newer version of extension '{0}' v{1} is already installed. Use '--force' option to downgrade to older version.", existingExtension.identifier.id, existingExtension.manifest.version, manifest.version));
          return false;
        }
      }
    }
    return this.validateExtensionKind(manifest);
  }
  async uninstallExtensions(extensions, force, profileLocation) {
    const getId = async (extensionDescription) => {
      if (extensionDescription instanceof URI) {
        const manifest = await this.extensionManagementService.getManifest(extensionDescription);
        return getExtensionId(manifest.publisher, manifest.name);
      }
      return extensionDescription;
    };
    const uninstalledExtensions = [];
    for (const extension of extensions) {
      const id = await getId(extension);
      const installed = await this.extensionManagementService.getInstalled(void 0, profileLocation);
      const extensionsToUninstall = installed.filter((e) => areSameExtensions(e.identifier, { id }));
      if (!extensionsToUninstall.length) {
        throw new Error(`${this.notInstalled(id)}
${useId}`);
      }
      if (extensionsToUninstall.some((e) => e.type === ExtensionType.System)) {
        this.logger.info(localize("builtin", "Extension '{0}' is a Built-in extension and cannot be uninstalled", id));
        return;
      }
      if (!force && extensionsToUninstall.some((e) => e.isBuiltin)) {
        this.logger.info(localize("forceUninstall", "Extension '{0}' is marked as a Built-in extension by user. Please use '--force' option to uninstall it.", id));
        return;
      }
      this.logger.info(localize("uninstalling", "Uninstalling {0}...", id));
      for (const extensionToUninstall of extensionsToUninstall) {
        await this.extensionManagementService.uninstall(extensionToUninstall, { profileLocation });
        uninstalledExtensions.push(extensionToUninstall);
      }
      if (this.location) {
        this.logger.info(localize("successUninstallFromLocation", "Extension '{0}' was successfully uninstalled from {1}!", id, this.location));
      } else {
        this.logger.info(localize("successUninstall", "Extension '{0}' was successfully uninstalled!", id));
      }
    }
  }
  async locateExtension(extensions) {
    const installed = await this.extensionManagementService.getInstalled();
    extensions.forEach((e) => {
      installed.forEach((i) => {
        if (i.identifier.id === e) {
          if (i.location.scheme === Schemas.file) {
            this.logger.info(i.location.fsPath);
            return;
          }
        }
      });
    });
  }
  notInstalled(id) {
    return this.location ? localize("notInstalleddOnLocation", "Extension '{0}' is not installed on {1}.", id, this.location) : localize("notInstalled", "Extension '{0}' is not installed.", id);
  }
  validateBuiltinExtensionEnabledWithAutoUpdates(extension) {
    if (extension.isBuiltin && this.productService.builtInExtensionsEnabledWithAutoUpdates.some((e) => e.toLowerCase() === extension.identifier.id.toLowerCase()) && !extension.forceAutoUpdate) {
      return localize("builtinAutoUpdate", "Extension '{0}' is a built-in extension and not allowed to be updated in the current product quality '{1}'.", extension.identifier.id, this.productService.quality);
    }
    return void 0;
  }
};
ExtensionManagementCLI = __decorateClass([
  __decorateParam(2, IExtensionManagementService),
  __decorateParam(3, IExtensionGalleryService),
  __decorateParam(4, IProductService)
], ExtensionManagementCLI);
export {
  ExtensionManagementCLI
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRDTEkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRFcnJvck1lc3NhZ2UsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZ3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZW12ZXIvc2VtdmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFWFRFTlNJT05fSURFTlRJRklFUl9SRUdFWCwgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBJRXh0ZW5zaW9uSW5mbywgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJR2FsbGVyeUV4dGVuc2lvbiwgSUxvY2FsRXh0ZW5zaW9uLCBJbnN0YWxsT3B0aW9ucywgSW5zdGFsbEV4dGVuc2lvbkluZm8sIEluc3RhbGxPcGVyYXRpb24gfSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMsIGdldEV4dGVuc2lvbklkLCBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQsIGdldElkQW5kVmVyc2lvbiB9IGZyb20gJy4vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSwgRVhURU5TSU9OX0NBVEVHT1JJRVMsIElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ2dlciB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcblxuXG5jb25zdCBub3RGb3VuZCA9IChpZDogc3RyaW5nKSA9PiBsb2NhbGl6ZSgnbm90Rm91bmQnLCBcIkV4dGVuc2lvbiAnezB9JyBub3QgZm91bmQuXCIsIGlkKTtcbmNvbnN0IHVzZUlkID0gbG9jYWxpemUoJ3VzZUlkJywgXCJNYWtlIHN1cmUgeW91IHVzZSB0aGUgZnVsbCBleHRlbnNpb24gSUQsIGluY2x1ZGluZyB0aGUgcHVibGlzaGVyLCBlLmcuOiB7MH1cIiwgJ21zLWRvdG5ldHRvb2xzLmNzaGFycCcpO1xuXG50eXBlIEluc3RhbGxWU0lYSW5mbyA9IHsgdnNpeDogVVJJOyBpbnN0YWxsT3B0aW9uczogSW5zdGFsbE9wdGlvbnMgfTtcbnR5cGUgSW5zdGFsbEdhbGxlcnlFeHRlbnNpb25JbmZvID0geyBpZDogc3RyaW5nOyB2ZXJzaW9uPzogc3RyaW5nOyBpbnN0YWxsT3B0aW9uczogSW5zdGFsbE9wdGlvbnMgfTtcblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbk1hbmFnZW1lbnRDTEkge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc0ZvcmNlVmVyc2lvbkJ5UXVhbGl0eTogcmVhZG9ubHkgc3RyaW5nW10sXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGxvZ2dlcjogSUxvZ2dlcixcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5leHRlbnNpb25zRm9yY2VWZXJzaW9uQnlRdWFsaXR5ID0gdGhpcy5leHRlbnNpb25zRm9yY2VWZXJzaW9uQnlRdWFsaXR5Lm1hcChlID0+IGUudG9Mb3dlckNhc2UoKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0IGxvY2F0aW9uKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBsaXN0RXh0ZW5zaW9ucyhzaG93VmVyc2lvbnM6IGJvb2xlYW4sIGNhdGVnb3J5Pzogc3RyaW5nLCBwcm9maWxlTG9jYXRpb24/OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKEV4dGVuc2lvblR5cGUuVXNlciwgcHJvZmlsZUxvY2F0aW9uKTtcblx0XHRjb25zdCBjYXRlZ29yaWVzID0gRVhURU5TSU9OX0NBVEVHT1JJRVMubWFwKGMgPT4gYy50b0xvd2VyQ2FzZSgpKTtcblx0XHRpZiAoY2F0ZWdvcnkgJiYgY2F0ZWdvcnkgIT09ICcnKSB7XG5cdFx0XHRpZiAoY2F0ZWdvcmllcy5pbmRleE9mKGNhdGVnb3J5LnRvTG93ZXJDYXNlKCkpIDwgMCkge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKCdJbnZhbGlkIGNhdGVnb3J5IHBsZWFzZSBlbnRlciBhIHZhbGlkIGNhdGVnb3J5LiBUbyBsaXN0IHZhbGlkIGNhdGVnb3JpZXMgcnVuIC0tY2F0ZWdvcnkgd2l0aG91dCBhIGNhdGVnb3J5IHNwZWNpZmllZCcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRleHRlbnNpb25zID0gZXh0ZW5zaW9ucy5maWx0ZXIoZSA9PiB7XG5cdFx0XHRcdGlmIChlLm1hbmlmZXN0LmNhdGVnb3JpZXMpIHtcblx0XHRcdFx0XHRjb25zdCBsb3dlckNhc2VDYXRlZ29yaWVzOiBzdHJpbmdbXSA9IGUubWFuaWZlc3QuY2F0ZWdvcmllcy5tYXAoYyA9PiBjLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0XHRcdHJldHVybiBsb3dlckNhc2VDYXRlZ29yaWVzLmluZGV4T2YoY2F0ZWdvcnkudG9Mb3dlckNhc2UoKSkgPiAtMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKGNhdGVnb3J5ID09PSAnJykge1xuXHRcdFx0dGhpcy5sb2dnZXIuaW5mbygnUG9zc2libGUgQ2F0ZWdvcmllczogJyk7XG5cdFx0XHRjYXRlZ29yaWVzLmZvckVhY2goY2F0ZWdvcnkgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKGNhdGVnb3J5KTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5sb2NhdGlvbikge1xuXHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhsb2NhbGl6ZSgnbGlzdEZyb21Mb2NhdGlvbicsIFwiRXh0ZW5zaW9ucyBpbnN0YWxsZWQgb24gezB9OlwiLCB0aGlzLmxvY2F0aW9uKSk7XG5cdFx0fVxuXG5cdFx0ZXh0ZW5zaW9ucyA9IGV4dGVuc2lvbnMuc29ydCgoZTEsIGUyKSA9PiBlMS5pZGVudGlmaWVyLmlkLmxvY2FsZUNvbXBhcmUoZTIuaWRlbnRpZmllci5pZCkpO1xuXHRcdGxldCBsYXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRpZiAobGFzdElkICE9PSBleHRlbnNpb24uaWRlbnRpZmllci5pZCkge1xuXHRcdFx0XHRsYXN0SWQgPSBleHRlbnNpb24uaWRlbnRpZmllci5pZDtcblx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhzaG93VmVyc2lvbnMgPyBgJHtsYXN0SWR9QCR7ZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb259YCA6IGxhc3RJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGluc3RhbGxFeHRlbnNpb25zKGV4dGVuc2lvbnM6IChzdHJpbmcgfCBVUkkpW10sIGJ1aWx0aW5FeHRlbnNpb25zOiAoc3RyaW5nIHwgVVJJKVtdLCBpbnN0YWxsT3B0aW9uczogSW5zdGFsbE9wdGlvbnMsIGZvcmNlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZmFpbGVkOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChleHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKHRoaXMubG9jYXRpb24gPyBsb2NhbGl6ZSgnaW5zdGFsbGluZ0V4dGVuc2lvbnNPbkxvY2F0aW9uJywgXCJJbnN0YWxsaW5nIGV4dGVuc2lvbnMgb24gezB9Li4uXCIsIHRoaXMubG9jYXRpb24pIDogbG9jYWxpemUoJ2luc3RhbGxpbmdFeHRlbnNpb25zJywgXCJJbnN0YWxsaW5nIGV4dGVuc2lvbnMuLi5cIikpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpbnN0YWxsVlNJWEluZm9zOiBJbnN0YWxsVlNJWEluZm9bXSA9IFtdO1xuXHRcdFx0Y29uc3QgaW5zdGFsbEV4dGVuc2lvbkluZm9zOiBJbnN0YWxsR2FsbGVyeUV4dGVuc2lvbkluZm9bXSA9IFtdO1xuXHRcdFx0Y29uc3QgYWRkSW5zdGFsbEV4dGVuc2lvbkluZm8gPSAoaWQ6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBpc0J1aWx0aW46IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uc0ZvcmNlVmVyc2lvbkJ5UXVhbGl0eT8uc29tZShlID0+IGUgPT09IGlkLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRcdFx0dmVyc2lvbiA9IHRoaXMucHJvZHVjdFNlcnZpY2UucXVhbGl0eSAhPT0gJ3N0YWJsZScgPyAncHJlcmVsZWFzZScgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aW5zdGFsbEV4dGVuc2lvbkluZm9zLnB1c2goeyBpZCwgdmVyc2lvbjogdmVyc2lvbiAhPT0gJ3ByZXJlbGVhc2UnID8gdmVyc2lvbiA6IHVuZGVmaW5lZCwgaW5zdGFsbE9wdGlvbnM6IHsgLi4uaW5zdGFsbE9wdGlvbnMsIGlzQnVpbHRpbiwgaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiB2ZXJzaW9uID09PSAncHJlcmVsZWFzZScgfHwgaW5zdGFsbE9wdGlvbnMuaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uIH0gfSk7XG5cdFx0XHR9O1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRcdFx0aW5zdGFsbFZTSVhJbmZvcy5wdXNoKHsgdnNpeDogZXh0ZW5zaW9uLCBpbnN0YWxsT3B0aW9ucyB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBbaWQsIHZlcnNpb25dID0gZ2V0SWRBbmRWZXJzaW9uKGV4dGVuc2lvbik7XG5cdFx0XHRcdFx0YWRkSW5zdGFsbEV4dGVuc2lvbkluZm8oaWQsIHZlcnNpb24sIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgYnVpbHRpbkV4dGVuc2lvbnMpIHtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbiBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0XHRcdGluc3RhbGxWU0lYSW5mb3MucHVzaCh7IHZzaXg6IGV4dGVuc2lvbiwgaW5zdGFsbE9wdGlvbnM6IHsgLi4uaW5zdGFsbE9wdGlvbnMsIGlzQnVpbHRpbjogdHJ1ZSwgZG9ub3RJbmNsdWRlUGFja0FuZERlcGVuZGVuY2llczogdHJ1ZSB9IH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IFtpZCwgdmVyc2lvbl0gPSBnZXRJZEFuZFZlcnNpb24oZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHRhZGRJbnN0YWxsRXh0ZW5zaW9uSW5mbyhpZCwgdmVyc2lvbiwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQodW5kZWZpbmVkLCBpbnN0YWxsT3B0aW9ucy5wcm9maWxlTG9jYXRpb24pO1xuXG5cdFx0XHRpZiAoaW5zdGFsbFZTSVhJbmZvcy5sZW5ndGgpIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoaW5zdGFsbFZTSVhJbmZvcy5tYXAoYXN5bmMgKHsgdnNpeCwgaW5zdGFsbE9wdGlvbnMgfSkgPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbGxWU0lYKHZzaXgsIGluc3RhbGxPcHRpb25zLCBmb3JjZSwgaW5zdGFsbGVkKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nZ2VyLmVycm9yKGVycik7XG5cdFx0XHRcdFx0XHRmYWlsZWQucHVzaCh2c2l4LnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaW5zdGFsbEV4dGVuc2lvbkluZm9zLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBmYWlsZWRHYWxsZXJ5RXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuaW5zdGFsbEdhbGxlcnlFeHRlbnNpb25zKGluc3RhbGxFeHRlbnNpb25JbmZvcywgaW5zdGFsbGVkLCBmb3JjZSk7XG5cdFx0XHRcdGZhaWxlZC5wdXNoKC4uLmZhaWxlZEdhbGxlcnlFeHRlbnNpb25zKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dnZXIuZXJyb3IobG9jYWxpemUoJ2Vycm9yIHdoaWxlIGluc3RhbGxpbmcgZXh0ZW5zaW9ucycsIFwiRXJyb3Igd2hpbGUgaW5zdGFsbGluZyBleHRlbnNpb25zOiB7MH1cIiwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSkpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0aWYgKGZhaWxlZC5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnaW5zdGFsbGF0aW9uIGZhaWxlZCcsIFwiRmFpbGVkIEluc3RhbGxpbmcgRXh0ZW5zaW9uczogezB9XCIsIGZhaWxlZC5qb2luKCcsICcpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIHVwZGF0ZUV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uPzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKEV4dGVuc2lvblR5cGUuVXNlciwgcHJvZmlsZUxvY2F0aW9uKTtcblxuXHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbnNRdWVyeTogSUV4dGVuc2lvbkluZm9bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGluc3RhbGxlZEV4dGVuc2lvbnMpIHtcblx0XHRcdGlmICghIWV4dGVuc2lvbi5pZGVudGlmaWVyLnV1aWQpIHsgLy8gTm8gbmVlZCB0byBjaGVjayBuZXcgdmVyc2lvbiBmb3IgYW4gdW5wdWJsaXNoZWQgZXh0ZW5zaW9uXG5cdFx0XHRcdGluc3RhbGxlZEV4dGVuc2lvbnNRdWVyeS5wdXNoKHsgLi4uZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHByZVJlbGVhc2U6IGV4dGVuc2lvbi5wcmVSZWxlYXNlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubG9nZ2VyLnRyYWNlKGxvY2FsaXplKHsga2V5OiAndXBkYXRlRXh0ZW5zaW9uc1F1ZXJ5JywgY29tbWVudDogWydQbGFjZWhvbGRlciBpcyBmb3IgdGhlIGNvdW50IG9mIGV4dGVuc2lvbnMnXSB9LCBcIkZldGNoaW5nIGxhdGVzdCB2ZXJzaW9ucyBmb3IgezB9IGV4dGVuc2lvbnNcIiwgaW5zdGFsbGVkRXh0ZW5zaW9uc1F1ZXJ5Lmxlbmd0aCkpO1xuXHRcdGNvbnN0IGF2YWlsYWJsZVZlcnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKGluc3RhbGxlZEV4dGVuc2lvbnNRdWVyeSwgeyBjb21wYXRpYmxlOiB0cnVlIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvVXBkYXRlOiBJbnN0YWxsRXh0ZW5zaW9uSW5mb1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBuZXdWZXJzaW9uIG9mIGF2YWlsYWJsZVZlcnNpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG9sZFZlcnNpb24gb2YgaW5zdGFsbGVkRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRpZiAoYXJlU2FtZUV4dGVuc2lvbnMob2xkVmVyc2lvbi5pZGVudGlmaWVyLCBuZXdWZXJzaW9uLmlkZW50aWZpZXIpICYmIGd0KG5ld1ZlcnNpb24udmVyc2lvbiwgb2xkVmVyc2lvbi5tYW5pZmVzdC52ZXJzaW9uKSkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbnNUb1VwZGF0ZS5wdXNoKHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogbmV3VmVyc2lvbixcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHsgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLlVwZGF0ZSwgaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiBvbGRWZXJzaW9uLnByZVJlbGVhc2UsIHByb2ZpbGVMb2NhdGlvbiwgaXNBcHBsaWNhdGlvblNjb3BlZDogb2xkVmVyc2lvbi5pc0FwcGxpY2F0aW9uU2NvcGVkIH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghZXh0ZW5zaW9uc1RvVXBkYXRlLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhsb2NhbGl6ZSgndXBkYXRlRXh0ZW5zaW9uc05vRXh0ZW5zaW9ucycsIFwiTm8gZXh0ZW5zaW9uIHRvIHVwZGF0ZVwiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dnZXIuaW5mbyhsb2NhbGl6ZSgndXBkYXRlRXh0ZW5zaW9uc05ld1ZlcnNpb25zQXZhaWxhYmxlJywgXCJVcGRhdGluZyBleHRlbnNpb25zOiB7MH1cIiwgZXh0ZW5zaW9uc1RvVXBkYXRlLm1hcChleHQgPT4gZXh0LmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKS5qb2luKCcsICcpKSk7XG5cdFx0Y29uc3QgaW5zdGFsbGF0aW9uUmVzdWx0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoZXh0ZW5zaW9uc1RvVXBkYXRlKTtcblxuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uUmVzdWx0IG9mIGluc3RhbGxhdGlvblJlc3VsdCkge1xuXHRcdFx0aWYgKGV4dGVuc2lvblJlc3VsdC5lcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihsb2NhbGl6ZSgnZXJyb3JVcGRhdGluZ0V4dGVuc2lvbicsIFwiRXJyb3Igd2hpbGUgdXBkYXRpbmcgZXh0ZW5zaW9uIHswfTogezF9XCIsIGV4dGVuc2lvblJlc3VsdC5pZGVudGlmaWVyLmlkLCBnZXRFcnJvck1lc3NhZ2UoZXh0ZW5zaW9uUmVzdWx0LmVycm9yKSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhsb2NhbGl6ZSgnc3VjY2Vzc1VwZGF0ZScsIFwiRXh0ZW5zaW9uICd7MH0nIHZ7MX0gd2FzIHN1Y2Nlc3NmdWxseSB1cGRhdGVkLlwiLCBleHRlbnNpb25SZXN1bHQuaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uUmVzdWx0LmxvY2FsPy5tYW5pZmVzdC52ZXJzaW9uKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoaW5zdGFsbEV4dGVuc2lvbkluZm9zOiBJbnN0YWxsR2FsbGVyeUV4dGVuc2lvbkluZm9bXSwgaW5zdGFsbGVkOiBJTG9jYWxFeHRlbnNpb25bXSwgZm9yY2U6IGJvb2xlYW4pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0aW5zdGFsbEV4dGVuc2lvbkluZm9zID0gaW5zdGFsbEV4dGVuc2lvbkluZm9zLmZpbHRlcihpbnN0YWxsRXh0ZW5zaW9uSW5mbyA9PiB7XG5cdFx0XHRjb25zdCB7IGlkLCB2ZXJzaW9uLCBpbnN0YWxsT3B0aW9ucyB9ID0gaW5zdGFsbEV4dGVuc2lvbkluZm87XG5cdFx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb24gPSBpbnN0YWxsZWQuZmluZChpID0+IGFyZVNhbWVFeHRlbnNpb25zKGkuaWRlbnRpZmllciwgeyBpZCB9KSk7XG5cdFx0XHRpZiAoaW5zdGFsbGVkRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGNvbnN0IGJ1aWx0aW5BdXRvVXBkYXRlTWVzc2FnZSA9IHRoaXMudmFsaWRhdGVCdWlsdGluRXh0ZW5zaW9uRW5hYmxlZFdpdGhBdXRvVXBkYXRlcyhpbnN0YWxsZWRFeHRlbnNpb24pO1xuXHRcdFx0XHRpZiAoYnVpbHRpbkF1dG9VcGRhdGVNZXNzYWdlKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhidWlsdGluQXV0b1VwZGF0ZU1lc3NhZ2UpO1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWZvcmNlICYmICghdmVyc2lvbiB8fCAodmVyc2lvbiA9PT0gJ3ByZXJlbGVhc2UnICYmIGluc3RhbGxlZEV4dGVuc2lvbi5wcmVSZWxlYXNlKSkpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKGxvY2FsaXplKCdhbHJlYWR5SW5zdGFsbGVkLWNoZWNrQW5kVXBkYXRlJywgXCJFeHRlbnNpb24gJ3swfScgdnsxfSBpcyBhbHJlYWR5IGluc3RhbGxlZC4gVXNlICctLWZvcmNlJyBvcHRpb24gdG8gdXBkYXRlIHRvIGxhdGVzdCB2ZXJzaW9uIG9yIHByb3ZpZGUgJ0A8dmVyc2lvbj4nIHRvIGluc3RhbGwgYSBzcGVjaWZpYyB2ZXJzaW9uLCBmb3IgZXhhbXBsZTogJ3syfUAxLjIuMycuXCIsIGlkLCBpbnN0YWxsZWRFeHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiwgaWQpKTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHZlcnNpb24gJiYgaW5zdGFsbGVkRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24gPT09IHZlcnNpb24pIHtcblx0XHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKGxvY2FsaXplKCdhbHJlYWR5SW5zdGFsbGVkJywgXCJFeHRlbnNpb24gJ3swfScgaXMgYWxyZWFkeSBpbnN0YWxsZWQuXCIsIGAke2lkfUAke3ZlcnNpb259YCkpO1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaW5zdGFsbGVkRXh0ZW5zaW9uLnByZVJlbGVhc2UgJiYgdmVyc2lvbiAhPT0gJ3ByZXJlbGVhc2UnKSB7XG5cdFx0XHRcdFx0aW5zdGFsbE9wdGlvbnMucHJlUmVsZWFzZSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGlmICghaW5zdGFsbEV4dGVuc2lvbkluZm9zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZhaWxlZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBleHRlbnNpb25zVG9JbnN0YWxsOiBJbnN0YWxsRXh0ZW5zaW9uSW5mb1tdID0gW107XG5cdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldEdhbGxlcnlFeHRlbnNpb25zKGluc3RhbGxFeHRlbnNpb25JbmZvcyk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoaW5zdGFsbEV4dGVuc2lvbkluZm9zLm1hcChhc3luYyAoeyBpZCwgdmVyc2lvbiwgaW5zdGFsbE9wdGlvbnMgfSkgPT4ge1xuXHRcdFx0Y29uc3QgZ2FsbGVyeSA9IGdhbGxlcnlFeHRlbnNpb25zLmdldChpZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdGlmICghZ2FsbGVyeSkge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihgJHtub3RGb3VuZCh2ZXJzaW9uID8gYCR7aWR9QCR7dmVyc2lvbn1gIDogaWQpfVxcbiR7dXNlSWR9YCk7XG5cdFx0XHRcdGZhaWxlZC5wdXNoKGlkKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldE1hbmlmZXN0KGdhbGxlcnksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRpZiAobWFuaWZlc3QgJiYgIXRoaXMudmFsaWRhdGVFeHRlbnNpb25LaW5kKG1hbmlmZXN0KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMubG9nZ2VyLmVycm9yKGVyci5tZXNzYWdlIHx8IGVyci5zdGFjayB8fCBlcnIpO1xuXHRcdFx0XHRmYWlsZWQucHVzaChpZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbiA9IGluc3RhbGxlZC5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBnYWxsZXJ5LmlkZW50aWZpZXIpKTtcblx0XHRcdGlmIChpbnN0YWxsZWRFeHRlbnNpb24pIHtcblx0XHRcdFx0aWYgKGdhbGxlcnkudmVyc2lvbiA9PT0gaW5zdGFsbGVkRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24pIHtcblx0XHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKGxvY2FsaXplKCdhbHJlYWR5SW5zdGFsbGVkJywgXCJFeHRlbnNpb24gJ3swfScgaXMgYWxyZWFkeSBpbnN0YWxsZWQuXCIsIHZlcnNpb24gPyBgJHtpZH1AJHt2ZXJzaW9ufWAgOiBpZCkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKGxvY2FsaXplKCd1cGRhdGVNZXNzYWdlJywgXCJVcGRhdGluZyB0aGUgZXh0ZW5zaW9uICd7MH0nIHRvIHRoZSB2ZXJzaW9uIHsxfVwiLCBpZCwgZ2FsbGVyeS52ZXJzaW9uKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaW5zdGFsbE9wdGlvbnMuaXNCdWlsdGluKSB7XG5cdFx0XHRcdHRoaXMubG9nZ2VyLmluZm8odmVyc2lvbiA/IGxvY2FsaXplKCdpbnN0YWxsaW5nIGJ1aWx0aW4gd2l0aCB2ZXJzaW9uJywgXCJJbnN0YWxsaW5nIGJ1aWx0aW4gZXh0ZW5zaW9uICd7MH0nIHZ7MX0uLi5cIiwgaWQsIHZlcnNpb24pIDogbG9jYWxpemUoJ2luc3RhbGxpbmcgYnVpbHRpbiAnLCBcIkluc3RhbGxpbmcgYnVpbHRpbiBleHRlbnNpb24gJ3swfScuLi5cIiwgaWQpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubG9nZ2VyLmluZm8odmVyc2lvbiA/IGxvY2FsaXplKCdpbnN0YWxsaW5nIHdpdGggdmVyc2lvbicsIFwiSW5zdGFsbGluZyBleHRlbnNpb24gJ3swfScgdnsxfS4uLlwiLCBpZCwgdmVyc2lvbikgOiBsb2NhbGl6ZSgnaW5zdGFsbGluZycsIFwiSW5zdGFsbGluZyBleHRlbnNpb24gJ3swfScuLi5cIiwgaWQpKTtcblx0XHRcdH1cblx0XHRcdGV4dGVuc2lvbnNUb0luc3RhbGwucHVzaCh7XG5cdFx0XHRcdGV4dGVuc2lvbjogZ2FsbGVyeSxcblx0XHRcdFx0b3B0aW9uczogeyAuLi5pbnN0YWxsT3B0aW9ucywgaW5zdGFsbEdpdmVuVmVyc2lvbjogISF2ZXJzaW9uLCBpc0FwcGxpY2F0aW9uU2NvcGVkOiBpbnN0YWxsT3B0aW9ucy5pc0FwcGxpY2F0aW9uU2NvcGVkIHx8IGluc3RhbGxlZEV4dGVuc2lvbj8uaXNBcHBsaWNhdGlvblNjb3BlZCB9LFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKGV4dGVuc2lvbnNUb0luc3RhbGwubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBpbnN0YWxsYXRpb25SZXN1bHQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxHYWxsZXJ5RXh0ZW5zaW9ucyhleHRlbnNpb25zVG9JbnN0YWxsKTtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uUmVzdWx0IG9mIGluc3RhbGxhdGlvblJlc3VsdCkge1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uUmVzdWx0LmVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dnZXIuZXJyb3IobG9jYWxpemUoJ2Vycm9ySW5zdGFsbGluZ0V4dGVuc2lvbicsIFwiRXJyb3Igd2hpbGUgaW5zdGFsbGluZyBleHRlbnNpb24gezB9OiB7MX1cIiwgZXh0ZW5zaW9uUmVzdWx0LmlkZW50aWZpZXIuaWQsIGdldEVycm9yTWVzc2FnZShleHRlbnNpb25SZXN1bHQuZXJyb3IpKSk7XG5cdFx0XHRcdFx0ZmFpbGVkLnB1c2goZXh0ZW5zaW9uUmVzdWx0LmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubG9nZ2VyLmluZm8obG9jYWxpemUoJ3N1Y2Nlc3NJbnN0YWxsJywgXCJFeHRlbnNpb24gJ3swfScgdnsxfSB3YXMgc3VjY2Vzc2Z1bGx5IGluc3RhbGxlZC5cIiwgZXh0ZW5zaW9uUmVzdWx0LmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvblJlc3VsdC5sb2NhbD8ubWFuaWZlc3QudmVyc2lvbikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhaWxlZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5zdGFsbFZTSVgodnNpeDogVVJJLCBpbnN0YWxsT3B0aW9uczogSW5zdGFsbE9wdGlvbnMsIGZvcmNlOiBib29sZWFuLCBpbnN0YWxsZWRFeHRlbnNpb25zOiBJTG9jYWxFeHRlbnNpb25bXSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldE1hbmlmZXN0KHZzaXgpO1xuXHRcdGlmICghbWFuaWZlc3QpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCB2c2l4Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsaWQgPSBhd2FpdCB0aGlzLnZhbGlkYXRlVlNJWChtYW5pZmVzdCwgZm9yY2UsIGluc3RhbGxPcHRpb25zLnByb2ZpbGVMb2NhdGlvbiwgaW5zdGFsbGVkRXh0ZW5zaW9ucyk7XG5cdFx0aWYgKHZhbGlkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGwodnNpeCwgeyAuLi5pbnN0YWxsT3B0aW9ucywgaW5zdGFsbEdpdmVuVmVyc2lvbjogdHJ1ZSB9KTtcblx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhsb2NhbGl6ZSgnc3VjY2Vzc1ZzaXhJbnN0YWxsJywgXCJFeHRlbnNpb24gJ3swfScgd2FzIHN1Y2Nlc3NmdWxseSBpbnN0YWxsZWQuXCIsIGJhc2VuYW1lKHZzaXgpKSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKGxvY2FsaXplKCdjYW5jZWxWc2l4SW5zdGFsbCcsIFwiQ2FuY2VsbGVkIGluc3RhbGxpbmcgZXh0ZW5zaW9uICd7MH0nLlwiLCBiYXNlbmFtZSh2c2l4KSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRHYWxsZXJ5RXh0ZW5zaW9ucyhleHRlbnNpb25zOiBJbnN0YWxsR2FsbGVyeUV4dGVuc2lvbkluZm9bXSk6IFByb21pc2U8TWFwPHN0cmluZywgSUdhbGxlcnlFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgSUdhbGxlcnlFeHRlbnNpb24+KCk7XG5cdFx0Y29uc3QgcHJlUmVsZWFzZSA9IGV4dGVuc2lvbnMuc29tZShlID0+IGUuaW5zdGFsbE9wdGlvbnMuaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uKTtcblx0XHRjb25zdCB0YXJnZXRQbGF0Zm9ybSA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0VGFyZ2V0UGxhdGZvcm0oKTtcblx0XHRjb25zdCBleHRlbnNpb25JbmZvczogSUV4dGVuc2lvbkluZm9bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGlmIChFWFRFTlNJT05fSURFTlRJRklFUl9SRUdFWC50ZXN0KGV4dGVuc2lvbi5pZCkpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uSW5mb3MucHVzaCh7IC4uLmV4dGVuc2lvbiwgcHJlUmVsZWFzZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbkluZm9zLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKGV4dGVuc2lvbkluZm9zLCB7IHRhcmdldFBsYXRmb3JtIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgcmVzdWx0KSB7XG5cdFx0XHRcdGdhbGxlcnlFeHRlbnNpb25zLnNldChleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLCBleHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZ2FsbGVyeUV4dGVuc2lvbnM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdmFsaWRhdGVFeHRlbnNpb25LaW5kKF9tYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHZhbGlkYXRlVlNJWChtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LCBmb3JjZTogYm9vbGVhbiwgcHJvZmlsZUxvY2F0aW9uOiBVUkkgfCB1bmRlZmluZWQsIGluc3RhbGxlZEV4dGVuc2lvbnM6IElMb2NhbEV4dGVuc2lvbltdKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWRlbnRpZmllciA9IHsgaWQ6IGdldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpIH07XG5cdFx0Y29uc3QgZXhpc3RpbmdFeHRlbnNpb24gPSBpbnN0YWxsZWRFeHRlbnNpb25zLmZpbmQobG9jYWwgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZXh0ZW5zaW9uSWRlbnRpZmllciwgbG9jYWwuaWRlbnRpZmllcikpO1xuXG5cdFx0aWYgKGV4aXN0aW5nRXh0ZW5zaW9uKSB7XG5cdFx0XHRjb25zdCBidWlsdGluQXV0b1VwZGF0ZU1lc3NhZ2UgPSB0aGlzLnZhbGlkYXRlQnVpbHRpbkV4dGVuc2lvbkVuYWJsZWRXaXRoQXV0b1VwZGF0ZXMoZXhpc3RpbmdFeHRlbnNpb24pO1xuXHRcdFx0aWYgKGJ1aWx0aW5BdXRvVXBkYXRlTWVzc2FnZSkge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKGJ1aWx0aW5BdXRvVXBkYXRlTWVzc2FnZSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFmb3JjZSkge1xuXHRcdFx0XHRpZiAoZ3QoZXhpc3RpbmdFeHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiwgbWFuaWZlc3QudmVyc2lvbikpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKGxvY2FsaXplKCdmb3JjZURvd25ncmFkZScsIFwiQSBuZXdlciB2ZXJzaW9uIG9mIGV4dGVuc2lvbiAnezB9JyB2ezF9IGlzIGFscmVhZHkgaW5zdGFsbGVkLiBVc2UgJy0tZm9yY2UnIG9wdGlvbiB0byBkb3duZ3JhZGUgdG8gb2xkZXIgdmVyc2lvbi5cIiwgZXhpc3RpbmdFeHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXhpc3RpbmdFeHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiwgbWFuaWZlc3QudmVyc2lvbikpO1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnZhbGlkYXRlRXh0ZW5zaW9uS2luZChtYW5pZmVzdCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdW5pbnN0YWxsRXh0ZW5zaW9ucyhleHRlbnNpb25zOiAoc3RyaW5nIHwgVVJJKVtdLCBmb3JjZTogYm9vbGVhbiwgcHJvZmlsZUxvY2F0aW9uPzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ2V0SWQgPSBhc3luYyAoZXh0ZW5zaW9uRGVzY3JpcHRpb246IHN0cmluZyB8IFVSSSk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uRGVzY3JpcHRpb24gaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldE1hbmlmZXN0KGV4dGVuc2lvbkRlc2NyaXB0aW9uKTtcblx0XHRcdFx0cmV0dXJuIGdldEV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdFx0fTtcblxuXHRcdGNvbnN0IHVuaW5zdGFsbGVkRXh0ZW5zaW9uczogSUxvY2FsRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBpZCA9IGF3YWl0IGdldElkKGV4dGVuc2lvbik7XG5cdFx0XHRjb25zdCBpbnN0YWxsZWQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCh1bmRlZmluZWQsIHByb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zVG9Vbmluc3RhbGwgPSBpbnN0YWxsZWQuZmlsdGVyKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB7IGlkIH0pKTtcblx0XHRcdGlmICghZXh0ZW5zaW9uc1RvVW5pbnN0YWxsLmxlbmd0aCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYCR7dGhpcy5ub3RJbnN0YWxsZWQoaWQpfVxcbiR7dXNlSWR9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uc1RvVW5pbnN0YWxsLnNvbWUoZSA9PiBlLnR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtKSkge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKGxvY2FsaXplKCdidWlsdGluJywgXCJFeHRlbnNpb24gJ3swfScgaXMgYSBCdWlsdC1pbiBleHRlbnNpb24gYW5kIGNhbm5vdCBiZSB1bmluc3RhbGxlZFwiLCBpZCkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWZvcmNlICYmIGV4dGVuc2lvbnNUb1VuaW5zdGFsbC5zb21lKGUgPT4gZS5pc0J1aWx0aW4pKSB7XG5cdFx0XHRcdHRoaXMubG9nZ2VyLmluZm8obG9jYWxpemUoJ2ZvcmNlVW5pbnN0YWxsJywgXCJFeHRlbnNpb24gJ3swfScgaXMgbWFya2VkIGFzIGEgQnVpbHQtaW4gZXh0ZW5zaW9uIGJ5IHVzZXIuIFBsZWFzZSB1c2UgJy0tZm9yY2UnIG9wdGlvbiB0byB1bmluc3RhbGwgaXQuXCIsIGlkKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMubG9nZ2VyLmluZm8obG9jYWxpemUoJ3VuaW5zdGFsbGluZycsIFwiVW5pbnN0YWxsaW5nIHswfS4uLlwiLCBpZCkpO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb25Ub1VuaW5zdGFsbCBvZiBleHRlbnNpb25zVG9Vbmluc3RhbGwpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS51bmluc3RhbGwoZXh0ZW5zaW9uVG9Vbmluc3RhbGwsIHsgcHJvZmlsZUxvY2F0aW9uIH0pO1xuXHRcdFx0XHR1bmluc3RhbGxlZEV4dGVuc2lvbnMucHVzaChleHRlbnNpb25Ub1VuaW5zdGFsbCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmxvY2F0aW9uKSB7XG5cdFx0XHRcdHRoaXMubG9nZ2VyLmluZm8obG9jYWxpemUoJ3N1Y2Nlc3NVbmluc3RhbGxGcm9tTG9jYXRpb24nLCBcIkV4dGVuc2lvbiAnezB9JyB3YXMgc3VjY2Vzc2Z1bGx5IHVuaW5zdGFsbGVkIGZyb20gezF9IVwiLCBpZCwgdGhpcy5sb2NhdGlvbikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbyhsb2NhbGl6ZSgnc3VjY2Vzc1VuaW5zdGFsbCcsIFwiRXh0ZW5zaW9uICd7MH0nIHdhcyBzdWNjZXNzZnVsbHkgdW5pbnN0YWxsZWQhXCIsIGlkKSk7XG5cdFx0XHR9XG5cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgbG9jYXRlRXh0ZW5zaW9uKGV4dGVuc2lvbnM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoKTtcblx0XHRleHRlbnNpb25zLmZvckVhY2goZSA9PiB7XG5cdFx0XHRpbnN0YWxsZWQuZm9yRWFjaChpID0+IHtcblx0XHRcdFx0aWYgKGkuaWRlbnRpZmllci5pZCA9PT0gZSkge1xuXHRcdFx0XHRcdGlmIChpLmxvY2F0aW9uLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ2dlci5pbmZvKGkubG9jYXRpb24uZnNQYXRoKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBub3RJbnN0YWxsZWQoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLmxvY2F0aW9uID8gbG9jYWxpemUoJ25vdEluc3RhbGxlZGRPbkxvY2F0aW9uJywgXCJFeHRlbnNpb24gJ3swfScgaXMgbm90IGluc3RhbGxlZCBvbiB7MX0uXCIsIGlkLCB0aGlzLmxvY2F0aW9uKSA6IGxvY2FsaXplKCdub3RJbnN0YWxsZWQnLCBcIkV4dGVuc2lvbiAnezB9JyBpcyBub3QgaW5zdGFsbGVkLlwiLCBpZCk7XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlQnVpbHRpbkV4dGVuc2lvbkVuYWJsZWRXaXRoQXV0b1VwZGF0ZXMoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChleHRlbnNpb24uaXNCdWlsdGluICYmIHRoaXMucHJvZHVjdFNlcnZpY2UuYnVpbHRJbkV4dGVuc2lvbnNFbmFibGVkV2l0aEF1dG9VcGRhdGVzLnNvbWUoZSA9PiBlLnRvTG93ZXJDYXNlKCkgPT09IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpICYmICFleHRlbnNpb24uZm9yY2VBdXRvVXBkYXRlKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2J1aWx0aW5BdXRvVXBkYXRlJywgXCJFeHRlbnNpb24gJ3swfScgaXMgYSBidWlsdC1pbiBleHRlbnNpb24gYW5kIG5vdCBhbGxvd2VkIHRvIGJlIHVwZGF0ZWQgaW4gdGhlIGN1cnJlbnQgcHJvZHVjdCBxdWFsaXR5ICd7MX0nLlwiLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgdGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5KTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUJBQWlCLDJCQUEyQjtBQUNyRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxVQUFVO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE0QiwwQkFBMEMsNkJBQXVHLHdCQUF3QjtBQUM5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
