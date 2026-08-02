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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { GlobalExtensionEnablementService } from "../../../../platform/extensionManagement/common/extensionEnablementService.js";
import { EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT, EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionGalleryService, IExtensionManagementService, IGlobalExtensionEnablementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { ExtensionType } from "../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ProfileResourceType } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IUserDataProfileStorageService } from "../../../../platform/userDataProfile/common/userDataProfileStorageService.js";
import { TreeItemCollapsibleState } from "../../../common/views.js";
import { IWorkbenchExtensionManagementService } from "../../extensionManagement/common/extensionManagement.js";
import { IUserDataProfileService } from "../common/userDataProfile.js";
let ExtensionsResourceInitializer = class {
  constructor(userDataProfileService, extensionManagementService, extensionGalleryService, extensionEnablementService, logService) {
    this.userDataProfileService = userDataProfileService;
    this.extensionManagementService = extensionManagementService;
    this.extensionGalleryService = extensionGalleryService;
    this.extensionEnablementService = extensionEnablementService;
    this.logService = logService;
  }
  async initialize(content) {
    const profileExtensions = JSON.parse(content);
    const installedExtensions = await this.extensionManagementService.getInstalled(void 0, this.userDataProfileService.currentProfile.extensionsResource);
    const extensionsToEnableOrDisable = [];
    const extensionsToInstall = [];
    for (const e of profileExtensions) {
      const isDisabled = this.extensionEnablementService.getDisabledExtensions().some((disabledExtension) => areSameExtensions(disabledExtension, e.identifier));
      const installedExtension = installedExtensions.find((installed) => areSameExtensions(installed.identifier, e.identifier));
      if (!installedExtension || !installedExtension.isBuiltin && installedExtension.preRelease !== e.preRelease) {
        extensionsToInstall.push(e);
      }
      if (isDisabled !== !!e.disabled) {
        extensionsToEnableOrDisable.push({ extension: e.identifier, enable: !e.disabled });
      }
    }
    const extensionsToUninstall = installedExtensions.filter((extension) => !extension.isBuiltin && !profileExtensions.some(({ identifier }) => areSameExtensions(identifier, extension.identifier)));
    for (const { extension, enable } of extensionsToEnableOrDisable) {
      if (enable) {
        this.logService.trace(`Initializing Profile: Enabling extension...`, extension.id);
        await this.extensionEnablementService.enableExtension(extension);
        this.logService.info(`Initializing Profile: Enabled extension...`, extension.id);
      } else {
        this.logService.trace(`Initializing Profile: Disabling extension...`, extension.id);
        await this.extensionEnablementService.disableExtension(extension);
        this.logService.info(`Initializing Profile: Disabled extension...`, extension.id);
      }
    }
    if (extensionsToInstall.length) {
      const galleryExtensions = await this.extensionGalleryService.getExtensions(extensionsToInstall.map((e) => ({ ...e.identifier, version: e.version, hasPreRelease: e.version ? void 0 : e.preRelease })), CancellationToken.None);
      await Promise.all(extensionsToInstall.map(async (e) => {
        const extension = galleryExtensions.find((galleryExtension) => areSameExtensions(galleryExtension.identifier, e.identifier));
        if (!extension) {
          return;
        }
        if (await this.extensionManagementService.canInstall(extension) === true) {
          this.logService.trace(`Initializing Profile: Installing extension...`, extension.identifier.id, extension.version);
          await this.extensionManagementService.installFromGallery(extension, {
            isMachineScoped: false,
            /* set isMachineScoped value to prevent install and sync dialog in web */
            donotIncludePackAndDependencies: true,
            installGivenVersion: !!e.version,
            installPreReleaseVersion: e.preRelease,
            profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
            context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true, [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true }
          });
          this.logService.info(`Initializing Profile: Installed extension...`, extension.identifier.id, extension.version);
        } else {
          this.logService.info(`Initializing Profile: Skipped installing extension because it cannot be installed.`, extension.identifier.id);
        }
      }));
    }
    if (extensionsToUninstall.length) {
      await Promise.all(extensionsToUninstall.map((e) => this.extensionManagementService.uninstall(e)));
    }
  }
};
ExtensionsResourceInitializer = __decorateClass([
  __decorateParam(0, IUserDataProfileService),
  __decorateParam(1, IExtensionManagementService),
  __decorateParam(2, IExtensionGalleryService),
  __decorateParam(3, IGlobalExtensionEnablementService),
  __decorateParam(4, ILogService)
], ExtensionsResourceInitializer);
let ExtensionsResource = class {
  constructor(extensionManagementService, extensionGalleryService, userDataProfileStorageService, instantiationService, logService) {
    this.extensionManagementService = extensionManagementService;
    this.extensionGalleryService = extensionGalleryService;
    this.userDataProfileStorageService = userDataProfileStorageService;
    this.instantiationService = instantiationService;
    this.logService = logService;
  }
  async getContent(profile, exclude) {
    const extensions = await this.getLocalExtensions(profile);
    return this.toContent(extensions, exclude);
  }
  toContent(extensions, exclude) {
    return JSON.stringify(exclude?.length ? extensions.filter((e) => !exclude.includes(e.identifier.id.toLowerCase())) : extensions);
  }
  async apply(content, profile, progress, token) {
    return this.withProfileScopedServices(profile, async (extensionEnablementService) => {
      const profileExtensions = await this.getProfileExtensions(content);
      const installedExtensions = await this.extensionManagementService.getInstalled(void 0, profile.extensionsResource);
      const extensionsToEnableOrDisable = [];
      const extensionsToInstall = [];
      for (const e of profileExtensions) {
        const isDisabled = extensionEnablementService.getDisabledExtensions().some((disabledExtension) => areSameExtensions(disabledExtension, e.identifier));
        const installedExtension = installedExtensions.find((installed) => areSameExtensions(installed.identifier, e.identifier));
        if (!installedExtension || !installedExtension.isBuiltin && installedExtension.preRelease !== e.preRelease) {
          extensionsToInstall.push(e);
        }
        if (isDisabled !== !!e.disabled) {
          extensionsToEnableOrDisable.push({ extension: e.identifier, enable: !e.disabled });
        }
      }
      const extensionsToUninstall = installedExtensions.filter((extension) => !extension.isBuiltin && !profileExtensions.some(({ identifier }) => areSameExtensions(identifier, extension.identifier)) && !extension.isApplicationScoped);
      for (const { extension, enable } of extensionsToEnableOrDisable) {
        if (enable) {
          this.logService.trace(`Importing Profile (${profile.name}): Enabling extension...`, extension.id);
          await extensionEnablementService.enableExtension(extension);
          this.logService.info(`Importing Profile (${profile.name}): Enabled extension...`, extension.id);
        } else {
          this.logService.trace(`Importing Profile (${profile.name}): Disabling extension...`, extension.id);
          await extensionEnablementService.disableExtension(extension);
          this.logService.info(`Importing Profile (${profile.name}): Disabled extension...`, extension.id);
        }
      }
      if (extensionsToInstall.length) {
        this.logService.info(`Importing Profile (${profile.name}): Started installing extensions.`);
        const galleryExtensions = await this.extensionGalleryService.getExtensions(extensionsToInstall.map((e) => ({ ...e.identifier, version: e.version, hasPreRelease: e.version ? void 0 : e.preRelease })), CancellationToken.None);
        const installExtensionInfos = [];
        await Promise.all(extensionsToInstall.map(async (e) => {
          const extension = galleryExtensions.find((galleryExtension) => areSameExtensions(galleryExtension.identifier, e.identifier));
          if (!extension) {
            return;
          }
          if (await this.extensionManagementService.canInstall(extension) === true) {
            installExtensionInfos.push({
              extension,
              options: {
                isMachineScoped: false,
                /* set isMachineScoped value to prevent install and sync dialog in web */
                donotIncludePackAndDependencies: true,
                installGivenVersion: !!e.version,
                installPreReleaseVersion: e.preRelease,
                profileLocation: profile.extensionsResource,
                context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true }
              }
            });
          } else {
            this.logService.info(`Importing Profile (${profile.name}): Skipped installing extension because it cannot be installed.`, extension.identifier.id);
          }
        }));
        if (installExtensionInfos.length) {
          if (token) {
            await this.extensionManagementService.requestPublisherTrust(installExtensionInfos);
            for (const installExtensionInfo of installExtensionInfos) {
              if (token.isCancellationRequested) {
                return;
              }
              progress?.(localize("installingExtension", "Installing extension {0}...", installExtensionInfo.extension.displayName ?? installExtensionInfo.extension.identifier.id));
              await this.extensionManagementService.installFromGallery(installExtensionInfo.extension, installExtensionInfo.options);
            }
          } else {
            await this.extensionManagementService.installGalleryExtensions(installExtensionInfos);
          }
        }
        this.logService.info(`Importing Profile (${profile.name}): Finished installing extensions.`);
      }
      if (extensionsToUninstall.length) {
        await Promise.all(extensionsToUninstall.map((e) => this.extensionManagementService.uninstall(e)));
      }
    });
  }
  async copy(from, to, disableExtensions) {
    await this.extensionManagementService.copyExtensions(from.extensionsResource, to.extensionsResource);
    const extensionsToDisable = await this.withProfileScopedServices(from, async (extensionEnablementService) => extensionEnablementService.getDisabledExtensions());
    if (disableExtensions) {
      const extensions = await this.extensionManagementService.getInstalled(ExtensionType.User, to.extensionsResource);
      for (const extension of extensions) {
        extensionsToDisable.push(extension.identifier);
      }
    }
    await this.withProfileScopedServices(to, async (extensionEnablementService) => Promise.all(extensionsToDisable.map((extension) => extensionEnablementService.disableExtension(extension))));
  }
  async getLocalExtensions(profile) {
    return this.withProfileScopedServices(profile, async (extensionEnablementService) => {
      const result = /* @__PURE__ */ new Map();
      const installedExtensions = await this.extensionManagementService.getInstalled(void 0, profile.extensionsResource);
      const disabledExtensions = extensionEnablementService.getDisabledExtensions();
      for (const extension of installedExtensions) {
        const { identifier, preRelease } = extension;
        const disabled = disabledExtensions.some((disabledExtension) => areSameExtensions(disabledExtension, identifier));
        if (extension.isBuiltin && !disabled) {
          continue;
        }
        if (!extension.isBuiltin) {
          if (!extension.identifier.uuid) {
            continue;
          }
        }
        const existing = result.get(identifier.id.toLowerCase());
        if (existing?.disabled) {
          result.delete(identifier.id.toLowerCase());
        }
        const profileExtension = { identifier, displayName: extension.manifest.displayName };
        if (disabled) {
          profileExtension.disabled = true;
        }
        if (!extension.isBuiltin && extension.pinned) {
          profileExtension.version = extension.manifest.version;
        }
        if (!profileExtension.version && preRelease) {
          profileExtension.preRelease = true;
        }
        profileExtension.applicationScoped = extension.isApplicationScoped;
        result.set(profileExtension.identifier.id.toLowerCase(), profileExtension);
      }
      return [...result.values()];
    });
  }
  async getProfileExtensions(content) {
    return JSON.parse(content);
  }
  async withProfileScopedServices(profile, fn) {
    return this.userDataProfileStorageService.withProfileScopedStorageService(
      profile,
      async (storageService) => {
        const disposables = new DisposableStore();
        const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IStorageService, storageService])));
        const extensionEnablementService = disposables.add(instantiationService.createInstance(GlobalExtensionEnablementService));
        try {
          return await fn(extensionEnablementService);
        } finally {
          disposables.dispose();
        }
      }
    );
  }
};
ExtensionsResource = __decorateClass([
  __decorateParam(0, IWorkbenchExtensionManagementService),
  __decorateParam(1, IExtensionGalleryService),
  __decorateParam(2, IUserDataProfileStorageService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ILogService)
], ExtensionsResource);
class ExtensionsResourceTreeItem {
  constructor() {
    this.type = ProfileResourceType.Extensions;
    this.handle = ProfileResourceType.Extensions;
    this.label = { label: localize("extensions", "Extensions") };
    this.collapsibleState = TreeItemCollapsibleState.Expanded;
    this.contextValue = ProfileResourceType.Extensions;
    this.excludedExtensions = /* @__PURE__ */ new Set();
  }
  async getChildren() {
    const extensions = (await this.getExtensions()).sort((a, b) => (a.displayName ?? a.identifier.id).localeCompare(b.displayName ?? b.identifier.id));
    const that = this;
    return extensions.map((e) => ({
      ...e,
      handle: e.identifier.id.toLowerCase(),
      parent: this,
      label: { label: e.displayName || e.identifier.id },
      description: e.applicationScoped ? localize("all profiles and disabled", "All Profiles") : void 0,
      collapsibleState: TreeItemCollapsibleState.None,
      checkbox: that.checkbox ? {
        get isChecked() {
          return !that.excludedExtensions.has(e.identifier.id.toLowerCase());
        },
        set isChecked(value) {
          if (value) {
            that.excludedExtensions.delete(e.identifier.id.toLowerCase());
          } else {
            that.excludedExtensions.add(e.identifier.id.toLowerCase());
          }
        },
        tooltip: localize("exclude", "Select {0} Extension", e.displayName || e.identifier.id),
        accessibilityInformation: {
          label: localize("exclude", "Select {0} Extension", e.displayName || e.identifier.id)
        }
      } : void 0,
      themeIcon: Codicon.extensions,
      command: {
        id: "extension.open",
        title: "",
        arguments: [e.identifier.id, void 0, true]
      }
    }));
  }
  async hasContent() {
    const extensions = await this.getExtensions();
    return extensions.length > 0;
  }
}
let ExtensionsResourceExportTreeItem = class extends ExtensionsResourceTreeItem {
  constructor(profile, instantiationService) {
    super();
    this.profile = profile;
    this.instantiationService = instantiationService;
  }
  isFromDefaultProfile() {
    return !this.profile.isDefault && !!this.profile.useDefaultFlags?.extensions;
  }
  getExtensions() {
    return this.instantiationService.createInstance(ExtensionsResource).getLocalExtensions(this.profile);
  }
  async getContent() {
    return this.instantiationService.createInstance(ExtensionsResource).getContent(this.profile, [...this.excludedExtensions.values()]);
  }
};
ExtensionsResourceExportTreeItem = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ExtensionsResourceExportTreeItem);
let ExtensionsResourceImportTreeItem = class extends ExtensionsResourceTreeItem {
  constructor(content, instantiationService) {
    super();
    this.content = content;
    this.instantiationService = instantiationService;
  }
  isFromDefaultProfile() {
    return false;
  }
  getExtensions() {
    return this.instantiationService.createInstance(ExtensionsResource).getProfileExtensions(this.content);
  }
  async getContent() {
    const extensionsResource = this.instantiationService.createInstance(ExtensionsResource);
    const extensions = await extensionsResource.getProfileExtensions(this.content);
    return extensionsResource.toContent(extensions, [...this.excludedExtensions.values()]);
  }
};
ExtensionsResourceImportTreeItem = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ExtensionsResourceImportTreeItem);
export {
  ExtensionsResource,
  ExtensionsResourceExportTreeItem,
  ExtensionsResourceImportTreeItem,
  ExtensionsResourceInitializer,
  ExtensionsResourceTreeItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvYnJvd3Nlci9leHRlbnNpb25zUmVzb3VyY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OX0lOU1RBTExfU0tJUF9QVUJMSVNIRVJfVFJVU1RfQ09OVEVYVCwgRVhURU5TSU9OX0lOU1RBTExfU0tJUF9XQUxLVEhST1VHSF9DT05URVhULCBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIElFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIElHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgSUxvY2FsRXh0ZW5zaW9uLCBJbnN0YWxsRXh0ZW5zaW9uSW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUsIFByb2ZpbGVSZXNvdXJjZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUcmVlSXRlbUNoZWNrYm94U3RhdGUsIFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElQcm9maWxlUmVzb3VyY2UsIElQcm9maWxlUmVzb3VyY2VDaGlsZFRyZWVJdGVtLCBJUHJvZmlsZVJlc291cmNlSW5pdGlhbGl6ZXIsIElQcm9maWxlUmVzb3VyY2VUcmVlSXRlbSwgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcblxuaW50ZXJmYWNlIElQcm9maWxlRXh0ZW5zaW9uIHtcblx0aWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXI7XG5cdGRpc3BsYXlOYW1lPzogc3RyaW5nO1xuXHRwcmVSZWxlYXNlPzogYm9vbGVhbjtcblx0YXBwbGljYXRpb25TY29wZWQ/OiBib29sZWFuO1xuXHRkaXNhYmxlZD86IGJvb2xlYW47XG5cdHZlcnNpb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25zUmVzb3VyY2VJbml0aWFsaXplciBpbXBsZW1lbnRzIElQcm9maWxlUmVzb3VyY2VJbml0aWFsaXplciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgaW5pdGlhbGl6ZShjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm9maWxlRXh0ZW5zaW9uczogSVByb2ZpbGVFeHRlbnNpb25bXSA9IEpTT04ucGFyc2UoY29udGVudCk7XG5cdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKHVuZGVmaW5lZCwgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvRW5hYmxlT3JEaXNhYmxlOiB7IGV4dGVuc2lvbjogSUV4dGVuc2lvbklkZW50aWZpZXI7IGVuYWJsZTogYm9vbGVhbiB9W10gPSBbXTtcblx0XHRjb25zdCBleHRlbnNpb25zVG9JbnN0YWxsOiBJUHJvZmlsZUV4dGVuc2lvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBlIG9mIHByb2ZpbGVFeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBpc0Rpc2FibGVkID0gdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXREaXNhYmxlZEV4dGVuc2lvbnMoKS5zb21lKGRpc2FibGVkRXh0ZW5zaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGRpc2FibGVkRXh0ZW5zaW9uLCBlLmlkZW50aWZpZXIpKTtcblx0XHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbiA9IGluc3RhbGxlZEV4dGVuc2lvbnMuZmluZChpbnN0YWxsZWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaW5zdGFsbGVkLmlkZW50aWZpZXIsIGUuaWRlbnRpZmllcikpO1xuXHRcdFx0aWYgKCFpbnN0YWxsZWRFeHRlbnNpb24gfHwgKCFpbnN0YWxsZWRFeHRlbnNpb24uaXNCdWlsdGluICYmIGluc3RhbGxlZEV4dGVuc2lvbi5wcmVSZWxlYXNlICE9PSBlLnByZVJlbGVhc2UpKSB7XG5cdFx0XHRcdGV4dGVuc2lvbnNUb0luc3RhbGwucHVzaChlKTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0Rpc2FibGVkICE9PSAhIWUuZGlzYWJsZWQpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uc1RvRW5hYmxlT3JEaXNhYmxlLnB1c2goeyBleHRlbnNpb246IGUuaWRlbnRpZmllciwgZW5hYmxlOiAhZS5kaXNhYmxlZCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvVW5pbnN0YWxsOiBJTG9jYWxFeHRlbnNpb25bXSA9IGluc3RhbGxlZEV4dGVuc2lvbnMuZmlsdGVyKGV4dGVuc2lvbiA9PiAhZXh0ZW5zaW9uLmlzQnVpbHRpbiAmJiAhcHJvZmlsZUV4dGVuc2lvbnMuc29tZSgoeyBpZGVudGlmaWVyIH0pID0+IGFyZVNhbWVFeHRlbnNpb25zKGlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkpO1xuXHRcdGZvciAoY29uc3QgeyBleHRlbnNpb24sIGVuYWJsZSB9IG9mIGV4dGVuc2lvbnNUb0VuYWJsZU9yRGlzYWJsZSkge1xuXHRcdFx0aWYgKGVuYWJsZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEluaXRpYWxpemluZyBQcm9maWxlOiBFbmFibGluZyBleHRlbnNpb24uLi5gLCBleHRlbnNpb24uaWQpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmVuYWJsZUV4dGVuc2lvbihleHRlbnNpb24pO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgSW5pdGlhbGl6aW5nIFByb2ZpbGU6IEVuYWJsZWQgZXh0ZW5zaW9uLi4uYCwgZXh0ZW5zaW9uLmlkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgSW5pdGlhbGl6aW5nIFByb2ZpbGU6IERpc2FibGluZyBleHRlbnNpb24uLi5gLCBleHRlbnNpb24uaWQpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmRpc2FibGVFeHRlbnNpb24oZXh0ZW5zaW9uKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEluaXRpYWxpemluZyBQcm9maWxlOiBEaXNhYmxlZCBleHRlbnNpb24uLi5gLCBleHRlbnNpb24uaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uc1RvSW5zdGFsbC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKGV4dGVuc2lvbnNUb0luc3RhbGwubWFwKGUgPT4gKHsgLi4uZS5pZGVudGlmaWVyLCB2ZXJzaW9uOiBlLnZlcnNpb24sIGhhc1ByZVJlbGVhc2U6IGUudmVyc2lvbiA/IHVuZGVmaW5lZCA6IGUucHJlUmVsZWFzZSB9KSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZXh0ZW5zaW9uc1RvSW5zdGFsbC5tYXAoYXN5bmMgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGdhbGxlcnlFeHRlbnNpb25zLmZpbmQoZ2FsbGVyeUV4dGVuc2lvbiA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhnYWxsZXJ5RXh0ZW5zaW9uLmlkZW50aWZpZXIsIGUuaWRlbnRpZmllcikpO1xuXHRcdFx0XHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5jYW5JbnN0YWxsKGV4dGVuc2lvbikgPT09IHRydWUpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEluaXRpYWxpemluZyBQcm9maWxlOiBJbnN0YWxsaW5nIGV4dGVuc2lvbi4uLmAsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24udmVyc2lvbik7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUdhbGxlcnkoZXh0ZW5zaW9uLCB7XG5cdFx0XHRcdFx0XHRpc01hY2hpbmVTY29wZWQ6IGZhbHNlLC8qIHNldCBpc01hY2hpbmVTY29wZWQgdmFsdWUgdG8gcHJldmVudCBpbnN0YWxsIGFuZCBzeW5jIGRpYWxvZyBpbiB3ZWIgKi9cblx0XHRcdFx0XHRcdGRvbm90SW5jbHVkZVBhY2tBbmREZXBlbmRlbmNpZXM6IHRydWUsXG5cdFx0XHRcdFx0XHRpbnN0YWxsR2l2ZW5WZXJzaW9uOiAhIWUudmVyc2lvbixcblx0XHRcdFx0XHRcdGluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbjogZS5wcmVSZWxlYXNlLFxuXHRcdFx0XHRcdFx0cHJvZmlsZUxvY2F0aW9uOiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLFxuXHRcdFx0XHRcdFx0Y29udGV4dDogeyBbRVhURU5TSU9OX0lOU1RBTExfU0tJUF9XQUxLVEhST1VHSF9DT05URVhUXTogdHJ1ZSwgW0VYVEVOU0lPTl9JTlNUQUxMX1NLSVBfUFVCTElTSEVSX1RSVVNUX0NPTlRFWFRdOiB0cnVlIH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgSW5pdGlhbGl6aW5nIFByb2ZpbGU6IEluc3RhbGxlZCBleHRlbnNpb24uLi5gLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uLnZlcnNpb24pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBJbml0aWFsaXppbmcgUHJvZmlsZTogU2tpcHBlZCBpbnN0YWxsaW5nIGV4dGVuc2lvbiBiZWNhdXNlIGl0IGNhbm5vdCBiZSBpbnN0YWxsZWQuYCwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb25zVG9Vbmluc3RhbGwubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChleHRlbnNpb25zVG9Vbmluc3RhbGwubWFwKGUgPT4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS51bmluc3RhbGwoZSkpKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNSZXNvdXJjZSBpbXBsZW1lbnRzIElQcm9maWxlUmVzb3VyY2Uge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdGFzeW5jIGdldENvbnRlbnQocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSwgZXhjbHVkZT86IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5nZXRMb2NhbEV4dGVuc2lvbnMocHJvZmlsZSk7XG5cdFx0cmV0dXJuIHRoaXMudG9Db250ZW50KGV4dGVuc2lvbnMsIGV4Y2x1ZGUpO1xuXHR9XG5cblx0dG9Db250ZW50KGV4dGVuc2lvbnM6IElQcm9maWxlRXh0ZW5zaW9uW10sIGV4Y2x1ZGU/OiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGV4Y2x1ZGU/Lmxlbmd0aCA/IGV4dGVuc2lvbnMuZmlsdGVyKGUgPT4gIWV4Y2x1ZGUuaW5jbHVkZXMoZS5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpKSA6IGV4dGVuc2lvbnMpO1xuXHR9XG5cblx0YXN5bmMgYXBwbHkoY29udGVudDogc3RyaW5nLCBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLCBwcm9ncmVzcz86IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy53aXRoUHJvZmlsZVNjb3BlZFNlcnZpY2VzKHByb2ZpbGUsIGFzeW5jIChleHRlbnNpb25FbmFibGVtZW50U2VydmljZSkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZmlsZUV4dGVuc2lvbnM6IElQcm9maWxlRXh0ZW5zaW9uW10gPSBhd2FpdCB0aGlzLmdldFByb2ZpbGVFeHRlbnNpb25zKGNvbnRlbnQpO1xuXHRcdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKHVuZGVmaW5lZCwgcHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uc1RvRW5hYmxlT3JEaXNhYmxlOiB7IGV4dGVuc2lvbjogSUV4dGVuc2lvbklkZW50aWZpZXI7IGVuYWJsZTogYm9vbGVhbiB9W10gPSBbXTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnNUb0luc3RhbGw6IElQcm9maWxlRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZSBvZiBwcm9maWxlRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRjb25zdCBpc0Rpc2FibGVkID0gZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZ2V0RGlzYWJsZWRFeHRlbnNpb25zKCkuc29tZShkaXNhYmxlZEV4dGVuc2lvbiA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhkaXNhYmxlZEV4dGVuc2lvbiwgZS5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbiA9IGluc3RhbGxlZEV4dGVuc2lvbnMuZmluZChpbnN0YWxsZWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaW5zdGFsbGVkLmlkZW50aWZpZXIsIGUuaWRlbnRpZmllcikpO1xuXHRcdFx0XHRpZiAoIWluc3RhbGxlZEV4dGVuc2lvbiB8fCAoIWluc3RhbGxlZEV4dGVuc2lvbi5pc0J1aWx0aW4gJiYgaW5zdGFsbGVkRXh0ZW5zaW9uLnByZVJlbGVhc2UgIT09IGUucHJlUmVsZWFzZSkpIHtcblx0XHRcdFx0XHRleHRlbnNpb25zVG9JbnN0YWxsLnB1c2goZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGlzRGlzYWJsZWQgIT09ICEhZS5kaXNhYmxlZCkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbnNUb0VuYWJsZU9yRGlzYWJsZS5wdXNoKHsgZXh0ZW5zaW9uOiBlLmlkZW50aWZpZXIsIGVuYWJsZTogIWUuZGlzYWJsZWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGV4dGVuc2lvbnNUb1VuaW5zdGFsbDogSUxvY2FsRXh0ZW5zaW9uW10gPSBpbnN0YWxsZWRFeHRlbnNpb25zLmZpbHRlcihleHRlbnNpb24gPT4gIWV4dGVuc2lvbi5pc0J1aWx0aW4gJiYgIXByb2ZpbGVFeHRlbnNpb25zLnNvbWUoKHsgaWRlbnRpZmllciB9KSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpICYmICFleHRlbnNpb24uaXNBcHBsaWNhdGlvblNjb3BlZCk7XG5cdFx0XHRmb3IgKGNvbnN0IHsgZXh0ZW5zaW9uLCBlbmFibGUgfSBvZiBleHRlbnNpb25zVG9FbmFibGVPckRpc2FibGUpIHtcblx0XHRcdFx0aWYgKGVuYWJsZSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgSW1wb3J0aW5nIFByb2ZpbGUgKCR7cHJvZmlsZS5uYW1lfSk6IEVuYWJsaW5nIGV4dGVuc2lvbi4uLmAsIGV4dGVuc2lvbi5pZCk7XG5cdFx0XHRcdFx0YXdhaXQgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlRXh0ZW5zaW9uKGV4dGVuc2lvbik7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEltcG9ydGluZyBQcm9maWxlICgke3Byb2ZpbGUubmFtZX0pOiBFbmFibGVkIGV4dGVuc2lvbi4uLmAsIGV4dGVuc2lvbi5pZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBJbXBvcnRpbmcgUHJvZmlsZSAoJHtwcm9maWxlLm5hbWV9KTogRGlzYWJsaW5nIGV4dGVuc2lvbi4uLmAsIGV4dGVuc2lvbi5pZCk7XG5cdFx0XHRcdFx0YXdhaXQgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZGlzYWJsZUV4dGVuc2lvbihleHRlbnNpb24pO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBJbXBvcnRpbmcgUHJvZmlsZSAoJHtwcm9maWxlLm5hbWV9KTogRGlzYWJsZWQgZXh0ZW5zaW9uLi4uYCwgZXh0ZW5zaW9uLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbnNUb0luc3RhbGwubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBJbXBvcnRpbmcgUHJvZmlsZSAoJHtwcm9maWxlLm5hbWV9KTogU3RhcnRlZCBpbnN0YWxsaW5nIGV4dGVuc2lvbnMuYCk7XG5cdFx0XHRcdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKGV4dGVuc2lvbnNUb0luc3RhbGwubWFwKGUgPT4gKHsgLi4uZS5pZGVudGlmaWVyLCB2ZXJzaW9uOiBlLnZlcnNpb24sIGhhc1ByZVJlbGVhc2U6IGUudmVyc2lvbiA/IHVuZGVmaW5lZCA6IGUucHJlUmVsZWFzZSB9KSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRjb25zdCBpbnN0YWxsRXh0ZW5zaW9uSW5mb3M6IEluc3RhbGxFeHRlbnNpb25JbmZvW10gPSBbXTtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZXh0ZW5zaW9uc1RvSW5zdGFsbC5tYXAoYXN5bmMgZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZ2FsbGVyeUV4dGVuc2lvbnMuZmluZChnYWxsZXJ5RXh0ZW5zaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGdhbGxlcnlFeHRlbnNpb24uaWRlbnRpZmllciwgZS5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdFx0aWYgKCFleHRlbnNpb24pIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY2FuSW5zdGFsbChleHRlbnNpb24pID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRpbnN0YWxsRXh0ZW5zaW9uSW5mb3MucHVzaCh7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbixcblx0XHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRcdGlzTWFjaGluZVNjb3BlZDogZmFsc2UsLyogc2V0IGlzTWFjaGluZVNjb3BlZCB2YWx1ZSB0byBwcmV2ZW50IGluc3RhbGwgYW5kIHN5bmMgZGlhbG9nIGluIHdlYiAqL1xuXHRcdFx0XHRcdFx0XHRcdGRvbm90SW5jbHVkZVBhY2tBbmREZXBlbmRlbmNpZXM6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0aW5zdGFsbEdpdmVuVmVyc2lvbjogISFlLnZlcnNpb24sXG5cdFx0XHRcdFx0XHRcdFx0aW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiBlLnByZVJlbGVhc2UsXG5cdFx0XHRcdFx0XHRcdFx0cHJvZmlsZUxvY2F0aW9uOiBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0XHRjb250ZXh0OiB7IFtFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1dBTEtUSFJPVUdIX0NPTlRFWFRdOiB0cnVlIH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBJbXBvcnRpbmcgUHJvZmlsZSAoJHtwcm9maWxlLm5hbWV9KTogU2tpcHBlZCBpbnN0YWxsaW5nIGV4dGVuc2lvbiBiZWNhdXNlIGl0IGNhbm5vdCBiZSBpbnN0YWxsZWQuYCwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRpZiAoaW5zdGFsbEV4dGVuc2lvbkluZm9zLmxlbmd0aCkge1xuXHRcdFx0XHRcdGlmICh0b2tlbikge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5yZXF1ZXN0UHVibGlzaGVyVHJ1c3QoaW5zdGFsbEV4dGVuc2lvbkluZm9zKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgaW5zdGFsbEV4dGVuc2lvbkluZm8gb2YgaW5zdGFsbEV4dGVuc2lvbkluZm9zKSB7XG5cdFx0XHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRwcm9ncmVzcz8uKGxvY2FsaXplKCdpbnN0YWxsaW5nRXh0ZW5zaW9uJywgXCJJbnN0YWxsaW5nIGV4dGVuc2lvbiB7MH0uLi5cIiwgaW5zdGFsbEV4dGVuc2lvbkluZm8uZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IGluc3RhbGxFeHRlbnNpb25JbmZvLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSk7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEZyb21HYWxsZXJ5KGluc3RhbGxFeHRlbnNpb25JbmZvLmV4dGVuc2lvbiwgaW5zdGFsbEV4dGVuc2lvbkluZm8ub3B0aW9ucyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEdhbGxlcnlFeHRlbnNpb25zKGluc3RhbGxFeHRlbnNpb25JbmZvcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBJbXBvcnRpbmcgUHJvZmlsZSAoJHtwcm9maWxlLm5hbWV9KTogRmluaXNoZWQgaW5zdGFsbGluZyBleHRlbnNpb25zLmApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbnNUb1VuaW5zdGFsbC5sZW5ndGgpIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZXh0ZW5zaW9uc1RvVW5pbnN0YWxsLm1hcChlID0+IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudW5pbnN0YWxsKGUpKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBjb3B5KGZyb206IElVc2VyRGF0YVByb2ZpbGUsIHRvOiBJVXNlckRhdGFQcm9maWxlLCBkaXNhYmxlRXh0ZW5zaW9uczogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY29weUV4dGVuc2lvbnMoZnJvbS5leHRlbnNpb25zUmVzb3VyY2UsIHRvLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvRGlzYWJsZSA9IGF3YWl0IHRoaXMud2l0aFByb2ZpbGVTY29wZWRTZXJ2aWNlcyhmcm9tLCBhc3luYyAoZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UpID0+XG5cdFx0XHRleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXREaXNhYmxlZEV4dGVuc2lvbnMoKSk7XG5cdFx0aWYgKGRpc2FibGVFeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoRXh0ZW5zaW9uVHlwZS5Vc2VyLCB0by5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRleHRlbnNpb25zVG9EaXNhYmxlLnB1c2goZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLndpdGhQcm9maWxlU2NvcGVkU2VydmljZXModG8sIGFzeW5jIChleHRlbnNpb25FbmFibGVtZW50U2VydmljZSkgPT5cblx0XHRcdFByb21pc2UuYWxsKGV4dGVuc2lvbnNUb0Rpc2FibGUubWFwKGV4dGVuc2lvbiA9PiBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5kaXNhYmxlRXh0ZW5zaW9uKGV4dGVuc2lvbikpKSk7XG5cdH1cblxuXHRhc3luYyBnZXRMb2NhbEV4dGVuc2lvbnMocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8SVByb2ZpbGVFeHRlbnNpb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLndpdGhQcm9maWxlU2NvcGVkU2VydmljZXMocHJvZmlsZSwgYXN5bmMgKGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgTWFwPHN0cmluZywgSVByb2ZpbGVFeHRlbnNpb24gJiB7IGRpc3BsYXlOYW1lPzogc3RyaW5nIH0+KCk7XG5cdFx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQodW5kZWZpbmVkLCBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBkaXNhYmxlZEV4dGVuc2lvbnMgPSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXREaXNhYmxlZEV4dGVuc2lvbnMoKTtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGluc3RhbGxlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgeyBpZGVudGlmaWVyLCBwcmVSZWxlYXNlIH0gPSBleHRlbnNpb247XG5cdFx0XHRcdGNvbnN0IGRpc2FibGVkID0gZGlzYWJsZWRFeHRlbnNpb25zLnNvbWUoZGlzYWJsZWRFeHRlbnNpb24gPT4gYXJlU2FtZUV4dGVuc2lvbnMoZGlzYWJsZWRFeHRlbnNpb24sIGlkZW50aWZpZXIpKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbi5pc0J1aWx0aW4gJiYgIWRpc2FibGVkKSB7XG5cdFx0XHRcdFx0Ly8gc2tpcCBlbmFibGVkIGJ1aWx0aW4gZXh0ZW5zaW9uc1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uLmlzQnVpbHRpbikge1xuXHRcdFx0XHRcdGlmICghZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCkge1xuXHRcdFx0XHRcdFx0Ly8gc2tpcCB1c2VyIGV4dGVuc2lvbnMgd2l0aG91dCB1dWlkXG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZXhpc3RpbmcgPSByZXN1bHQuZ2V0KGlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRcdGlmIChleGlzdGluZz8uZGlzYWJsZWQpIHtcblx0XHRcdFx0XHQvLyBSZW1vdmUgdGhlIGR1cGxpY2F0ZSBkaXNhYmxlZCBleHRlbnNpb25cblx0XHRcdFx0XHRyZXN1bHQuZGVsZXRlKGlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcHJvZmlsZUV4dGVuc2lvbjogSVByb2ZpbGVFeHRlbnNpb24gPSB7IGlkZW50aWZpZXIsIGRpc3BsYXlOYW1lOiBleHRlbnNpb24ubWFuaWZlc3QuZGlzcGxheU5hbWUgfTtcblx0XHRcdFx0aWYgKGRpc2FibGVkKSB7XG5cdFx0XHRcdFx0cHJvZmlsZUV4dGVuc2lvbi5kaXNhYmxlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFleHRlbnNpb24uaXNCdWlsdGluICYmIGV4dGVuc2lvbi5waW5uZWQpIHtcblx0XHRcdFx0XHRwcm9maWxlRXh0ZW5zaW9uLnZlcnNpb24gPSBleHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXByb2ZpbGVFeHRlbnNpb24udmVyc2lvbiAmJiBwcmVSZWxlYXNlKSB7XG5cdFx0XHRcdFx0cHJvZmlsZUV4dGVuc2lvbi5wcmVSZWxlYXNlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwcm9maWxlRXh0ZW5zaW9uLmFwcGxpY2F0aW9uU2NvcGVkID0gZXh0ZW5zaW9uLmlzQXBwbGljYXRpb25TY29wZWQ7XG5cdFx0XHRcdHJlc3VsdC5zZXQocHJvZmlsZUV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCksIHByb2ZpbGVFeHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFsuLi5yZXN1bHQudmFsdWVzKCldO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0UHJvZmlsZUV4dGVuc2lvbnMoY29udGVudDogc3RyaW5nKTogUHJvbWlzZTxJUHJvZmlsZUV4dGVuc2lvbltdPiB7XG5cdFx0cmV0dXJuIEpTT04ucGFyc2UoY29udGVudCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdpdGhQcm9maWxlU2NvcGVkU2VydmljZXM8VD4ocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSwgZm46IChleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSUdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2Uud2l0aFByb2ZpbGVTY29wZWRTdG9yYWdlU2VydmljZShwcm9maWxlLFxuXHRcdFx0YXN5bmMgc3RvcmFnZVNlcnZpY2UgPT4ge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2VdKSkpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSkpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCBmbihleHRlbnNpb25FbmFibGVtZW50U2VydmljZSk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRXh0ZW5zaW9uc1Jlc291cmNlVHJlZUl0ZW0gaW1wbGVtZW50cyBJUHJvZmlsZVJlc291cmNlVHJlZUl0ZW0ge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSBQcm9maWxlUmVzb3VyY2VUeXBlLkV4dGVuc2lvbnM7XG5cdHJlYWRvbmx5IGhhbmRsZSA9IFByb2ZpbGVSZXNvdXJjZVR5cGUuRXh0ZW5zaW9ucztcblx0cmVhZG9ubHkgbGFiZWwgPSB7IGxhYmVsOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucycsIFwiRXh0ZW5zaW9uc1wiKSB9O1xuXHRyZWFkb25seSBjb2xsYXBzaWJsZVN0YXRlID0gVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkV4cGFuZGVkO1xuXHRjb250ZXh0VmFsdWUgPSBQcm9maWxlUmVzb3VyY2VUeXBlLkV4dGVuc2lvbnM7XG5cdGNoZWNrYm94OiBJVHJlZUl0ZW1DaGVja2JveFN0YXRlIHwgdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBleGNsdWRlZEV4dGVuc2lvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRhc3luYyBnZXRDaGlsZHJlbigpOiBQcm9taXNlPEFycmF5PElQcm9maWxlUmVzb3VyY2VDaGlsZFRyZWVJdGVtICYgSVByb2ZpbGVFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IChhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnMoKSkuc29ydCgoYSwgYikgPT4gKGEuZGlzcGxheU5hbWUgPz8gYS5pZGVudGlmaWVyLmlkKS5sb2NhbGVDb21wYXJlKGIuZGlzcGxheU5hbWUgPz8gYi5pZGVudGlmaWVyLmlkKSk7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0cmV0dXJuIGV4dGVuc2lvbnMubWFwPElQcm9maWxlUmVzb3VyY2VDaGlsZFRyZWVJdGVtICYgSVByb2ZpbGVFeHRlbnNpb24+KGUgPT4gKHtcblx0XHRcdC4uLmUsXG5cdFx0XHRoYW5kbGU6IGUuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLFxuXHRcdFx0cGFyZW50OiB0aGlzLFxuXHRcdFx0bGFiZWw6IHsgbGFiZWw6IGUuZGlzcGxheU5hbWUgfHwgZS5pZGVudGlmaWVyLmlkIH0sXG5cdFx0XHRkZXNjcmlwdGlvbjogZS5hcHBsaWNhdGlvblNjb3BlZCA/IGxvY2FsaXplKCdhbGwgcHJvZmlsZXMgYW5kIGRpc2FibGVkJywgXCJBbGwgUHJvZmlsZXNcIikgOiB1bmRlZmluZWQsXG5cdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSxcblx0XHRcdGNoZWNrYm94OiB0aGF0LmNoZWNrYm94ID8ge1xuXHRcdFx0XHRnZXQgaXNDaGVja2VkKCkgeyByZXR1cm4gIXRoYXQuZXhjbHVkZWRFeHRlbnNpb25zLmhhcyhlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7IH0sXG5cdFx0XHRcdHNldCBpc0NoZWNrZWQodmFsdWU6IGJvb2xlYW4pIHtcblx0XHRcdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0XHRcdHRoYXQuZXhjbHVkZWRFeHRlbnNpb25zLmRlbGV0ZShlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoYXQuZXhjbHVkZWRFeHRlbnNpb25zLmFkZChlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZXhjbHVkZScsIFwiU2VsZWN0IHswfSBFeHRlbnNpb25cIiwgZS5kaXNwbGF5TmFtZSB8fCBlLmlkZW50aWZpZXIuaWQpLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb246IHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2V4Y2x1ZGUnLCBcIlNlbGVjdCB7MH0gRXh0ZW5zaW9uXCIsIGUuZGlzcGxheU5hbWUgfHwgZS5pZGVudGlmaWVyLmlkKSxcblx0XHRcdFx0fVxuXHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdHRoZW1lSWNvbjogQ29kaWNvbi5leHRlbnNpb25zLFxuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogJ2V4dGVuc2lvbi5vcGVuJyxcblx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRhcmd1bWVudHM6IFtlLmlkZW50aWZpZXIuaWQsIHVuZGVmaW5lZCwgdHJ1ZV1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBoYXNDb250ZW50KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnMoKTtcblx0XHRyZXR1cm4gZXh0ZW5zaW9ucy5sZW5ndGggPiAwO1xuXHR9XG5cblx0YWJzdHJhY3QgaXNGcm9tRGVmYXVsdFByb2ZpbGUoKTogYm9vbGVhbjtcblx0YWJzdHJhY3QgZ2V0Q29udGVudCgpOiBQcm9taXNlPHN0cmluZz47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRFeHRlbnNpb25zKCk6IFByb21pc2U8SVByb2ZpbGVFeHRlbnNpb25bXT47XG5cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNSZXNvdXJjZUV4cG9ydFRyZWVJdGVtIGV4dGVuZHMgRXh0ZW5zaW9uc1Jlc291cmNlVHJlZUl0ZW0ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGlzRnJvbURlZmF1bHRQcm9maWxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5wcm9maWxlLmlzRGVmYXVsdCAmJiAhIXRoaXMucHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/LmV4dGVuc2lvbnM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0RXh0ZW5zaW9ucygpOiBQcm9taXNlPElQcm9maWxlRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zUmVzb3VyY2UpLmdldExvY2FsRXh0ZW5zaW9ucyh0aGlzLnByb2ZpbGUpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29udGVudCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNSZXNvdXJjZSkuZ2V0Q29udGVudCh0aGlzLnByb2ZpbGUsIFsuLi50aGlzLmV4Y2x1ZGVkRXh0ZW5zaW9ucy52YWx1ZXMoKV0pO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNSZXNvdXJjZUltcG9ydFRyZWVJdGVtIGV4dGVuZHMgRXh0ZW5zaW9uc1Jlc291cmNlVHJlZUl0ZW0ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGVudDogc3RyaW5nLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0aXNGcm9tRGVmYXVsdFByb2ZpbGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldEV4dGVuc2lvbnMoKTogUHJvbWlzZTxJUHJvZmlsZUV4dGVuc2lvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc1Jlc291cmNlKS5nZXRQcm9maWxlRXh0ZW5zaW9ucyh0aGlzLmNvbnRlbnQpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29udGVudCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNSZXNvdXJjZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgZXh0ZW5zaW9uc1Jlc291cmNlLmdldFByb2ZpbGVFeHRlbnNpb25zKHRoaXMuY29udGVudCk7XG5cdFx0cmV0dXJuIGV4dGVuc2lvbnNSZXNvdXJjZS50b0NvbnRlbnQoZXh0ZW5zaW9ucywgWy4uLnRoaXMuZXhjbHVkZWRFeHRlbnNpb25zLnZhbHVlcygpXSk7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxnREFBZ0QsNENBQTRDLDBCQUFnRCw2QkFBNkIseUNBQWdGO0FBQ2xRLFNBQVMseUJBQXlCO0FBQ2xDLFNB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
