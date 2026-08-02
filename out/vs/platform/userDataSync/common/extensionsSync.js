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
import { Promises } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { getErrorMessage } from "../../../base/common/errors.js";
import { Event } from "../../../base/common/event.js";
import { toFormattedString } from "../../../base/common/jsonFormatter.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { compare } from "../../../base/common/strings.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { GlobalExtensionEnablementService } from "../../extensionManagement/common/extensionEnablementService.js";
import { IExtensionGalleryService, IExtensionManagementService, ExtensionManagementError, ExtensionManagementErrorCode, DISABLED_EXTENSIONS_STORAGE_PATH, EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, EXTENSION_INSTALL_SOURCE_CONTEXT, ExtensionInstallSource, EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT } from "../../extensionManagement/common/extensionManagement.js";
import { areSameExtensions } from "../../extensionManagement/common/extensionManagementUtil.js";
import { ExtensionStorageService, IExtensionStorageService } from "../../extensionManagement/common/extensionStorage.js";
import { ExtensionType, isApplicationScopedExtension } from "../../extensions/common/extensions.js";
import { IFileService } from "../../files/common/files.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ServiceCollection } from "../../instantiation/common/serviceCollection.js";
import { ILogService } from "../../log/common/log.js";
import { IStorageService } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { AbstractInitializer, AbstractSynchroniser, getSyncResourceLogLabel } from "./abstractSynchronizer.js";
import { merge } from "./extensionsMerge.js";
import { IIgnoredExtensionsManagementService } from "./ignoredExtensions.js";
import { Change, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, USER_DATA_SYNC_SCHEME } from "./userDataSync.js";
import { IUserDataProfileStorageService } from "../../userDataProfile/common/userDataProfileStorageService.js";
import { IProductService } from "../../product/common/productService.js";
async function parseAndMigrateExtensions(syncData, extensionManagementService) {
  const extensions = JSON.parse(syncData.content);
  if (syncData.version === 1 || syncData.version === 2) {
    const builtinExtensions = (await extensionManagementService.getInstalled(ExtensionType.System)).filter((e) => e.isBuiltin);
    for (const extension of extensions) {
      if (syncData.version === 1) {
        if (extension.enabled === false) {
          extension.disabled = true;
        }
        delete extension.enabled;
      }
      if (syncData.version === 2) {
        if (builtinExtensions.every((installed) => !areSameExtensions(installed.identifier, extension.identifier))) {
          extension.installed = true;
        }
      }
    }
  }
  return extensions;
}
function parseExtensions(syncData) {
  return JSON.parse(syncData.content);
}
function stringify(extensions, format) {
  extensions.sort((e1, e2) => {
    if (!e1.identifier.uuid && e2.identifier.uuid) {
      return -1;
    }
    if (e1.identifier.uuid && !e2.identifier.uuid) {
      return 1;
    }
    return compare(e1.identifier.id, e2.identifier.id);
  });
  return format ? toFormattedString(extensions, {}) : JSON.stringify(extensions);
}
let ExtensionsSynchroniser = class extends AbstractSynchroniser {
  constructor(profile, collection, environmentService, fileService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, extensionManagementService, ignoredExtensionsManagementService, logService, configurationService, userDataSyncEnablementService, telemetryService, extensionStorageService, uriIdentityService, userDataProfileStorageService, instantiationService) {
    super({ syncResource: SyncResource.Extensions, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
    this.extensionManagementService = extensionManagementService;
    this.ignoredExtensionsManagementService = ignoredExtensionsManagementService;
    this.instantiationService = instantiationService;
    /*
    	Version 3 - Introduce installed property to skip installing built in extensions
    	protected readonly version: number = 3;
    */
    /* Version 4: Change settings from `sync.${setting}` to `settingsSync.{setting}` */
    /* Version 5: Introduce extension state */
    /* Version 6: Added isApplicationScoped property */
    this.version = 6;
    this.previewResource = this.extUri.joinPath(this.syncPreviewFolder, "extensions.json");
    this.baseResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" });
    this.localResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" });
    this.remoteResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" });
    this.acceptedResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" });
    this.localExtensionsProvider = this.instantiationService.createInstance(LocalExtensionsProvider);
    this._register(
      Event.any(
        Event.filter(this.extensionManagementService.onDidInstallExtensions, ((e) => e.some(({ local }) => !!local))),
        Event.filter(this.extensionManagementService.onDidUninstallExtension, ((e) => !e.error)),
        Event.filter(userDataProfileStorageService.onDidChange, (e) => e.valueChanges.some(({ profile: profile2, changes }) => this.syncResource.profile.id === profile2.id && changes.some((change) => change.key === DISABLED_EXTENSIONS_STORAGE_PATH))),
        extensionStorageService.onDidChangeExtensionStorageToSync
      )(() => this.triggerLocalChange())
    );
  }
  async generateSyncPreview(remoteUserData, lastSyncUserData) {
    const remoteExtensions = remoteUserData.syncData ? await parseAndMigrateExtensions(remoteUserData.syncData, this.extensionManagementService) : null;
    const skippedExtensions = lastSyncUserData?.skippedExtensions ?? [];
    const builtinExtensions = lastSyncUserData?.builtinExtensions ?? null;
    const lastSyncExtensions = lastSyncUserData?.syncData ? await parseAndMigrateExtensions(lastSyncUserData.syncData, this.extensionManagementService) : null;
    const { localExtensions, ignoredExtensions } = await this.localExtensionsProvider.getLocalExtensions(this.syncResource.profile);
    if (remoteExtensions) {
      this.logService.trace(`${this.syncResourceLogLabel}: Merging remote extensions with local extensions...`);
    } else {
      this.logService.trace(`${this.syncResourceLogLabel}: Remote extensions does not exist. Synchronizing extensions for the first time.`);
    }
    const { local, remote } = merge(localExtensions, remoteExtensions, lastSyncExtensions, skippedExtensions, ignoredExtensions, builtinExtensions);
    const previewResult = {
      local,
      remote,
      content: this.getPreviewContent(localExtensions, local.added, local.updated, local.removed),
      localChange: local.added.length > 0 || local.removed.length > 0 || local.updated.length > 0 ? Change.Modified : Change.None,
      remoteChange: remote !== null ? Change.Modified : Change.None
    };
    const localContent = this.stringify(localExtensions, false);
    return [{
      skippedExtensions,
      builtinExtensions,
      baseResource: this.baseResource,
      baseContent: lastSyncExtensions ? this.stringify(lastSyncExtensions, false) : localContent,
      localResource: this.localResource,
      localContent,
      localExtensions,
      remoteResource: this.remoteResource,
      remoteExtensions,
      remoteContent: remoteExtensions ? this.stringify(remoteExtensions, false) : null,
      previewResource: this.previewResource,
      previewResult,
      localChange: previewResult.localChange,
      remoteChange: previewResult.remoteChange,
      acceptedResource: this.acceptedResource
    }];
  }
  async hasRemoteChanged(lastSyncUserData) {
    const lastSyncExtensions = lastSyncUserData.syncData ? await parseAndMigrateExtensions(lastSyncUserData.syncData, this.extensionManagementService) : null;
    const { localExtensions, ignoredExtensions } = await this.localExtensionsProvider.getLocalExtensions(this.syncResource.profile);
    const { remote } = merge(localExtensions, lastSyncExtensions, lastSyncExtensions, lastSyncUserData.skippedExtensions || [], ignoredExtensions, lastSyncUserData.builtinExtensions || []);
    return remote !== null;
  }
  getPreviewContent(localExtensions, added, updated, removed) {
    const preview = [...added, ...updated];
    const idsOrUUIDs = /* @__PURE__ */ new Set();
    const addIdentifier = (identifier) => {
      idsOrUUIDs.add(identifier.id.toLowerCase());
      if (identifier.uuid) {
        idsOrUUIDs.add(identifier.uuid);
      }
    };
    preview.forEach(({ identifier }) => addIdentifier(identifier));
    removed.forEach(addIdentifier);
    for (const localExtension of localExtensions) {
      if (idsOrUUIDs.has(localExtension.identifier.id.toLowerCase()) || localExtension.identifier.uuid && idsOrUUIDs.has(localExtension.identifier.uuid)) {
        continue;
      }
      preview.push(localExtension);
    }
    return this.stringify(preview, false);
  }
  async getMergeResult(resourcePreview, token) {
    return { ...resourcePreview.previewResult, hasConflicts: false };
  }
  async getAcceptResult(resourcePreview, resource, content, token) {
    if (this.extUri.isEqual(resource, this.localResource)) {
      return this.acceptLocal(resourcePreview);
    }
    if (this.extUri.isEqual(resource, this.remoteResource)) {
      return this.acceptRemote(resourcePreview);
    }
    if (this.extUri.isEqual(resource, this.previewResource)) {
      return resourcePreview.previewResult;
    }
    throw new Error(`Invalid Resource: ${resource.toString()}`);
  }
  async acceptLocal(resourcePreview) {
    const installedExtensions = await this.extensionManagementService.getInstalled(void 0, this.syncResource.profile.extensionsResource);
    const ignoredExtensions = this.ignoredExtensionsManagementService.getIgnoredExtensions(installedExtensions);
    const remoteExtensions = resourcePreview.remoteContent ? JSON.parse(resourcePreview.remoteContent) : null;
    const mergeResult = merge(resourcePreview.localExtensions, remoteExtensions, remoteExtensions, resourcePreview.skippedExtensions, ignoredExtensions, resourcePreview.builtinExtensions);
    const { local, remote } = mergeResult;
    return {
      content: resourcePreview.localContent,
      local,
      remote,
      localChange: local.added.length > 0 || local.removed.length > 0 || local.updated.length > 0 ? Change.Modified : Change.None,
      remoteChange: remote !== null ? Change.Modified : Change.None
    };
  }
  async acceptRemote(resourcePreview) {
    const installedExtensions = await this.extensionManagementService.getInstalled(void 0, this.syncResource.profile.extensionsResource);
    const ignoredExtensions = this.ignoredExtensionsManagementService.getIgnoredExtensions(installedExtensions);
    const remoteExtensions = resourcePreview.remoteContent ? JSON.parse(resourcePreview.remoteContent) : null;
    if (remoteExtensions !== null) {
      const mergeResult = merge(resourcePreview.localExtensions, remoteExtensions, resourcePreview.localExtensions, [], ignoredExtensions, resourcePreview.builtinExtensions);
      const { local, remote } = mergeResult;
      return {
        content: resourcePreview.remoteContent,
        local,
        remote,
        localChange: local.added.length > 0 || local.removed.length > 0 || local.updated.length > 0 ? Change.Modified : Change.None,
        remoteChange: remote !== null ? Change.Modified : Change.None
      };
    } else {
      return {
        content: resourcePreview.remoteContent,
        local: { added: [], removed: [], updated: [] },
        remote: null,
        localChange: Change.None,
        remoteChange: Change.None
      };
    }
  }
  async applyResult(remoteUserData, lastSyncUserData, resourcePreviews, force) {
    let { skippedExtensions, builtinExtensions, localExtensions } = resourcePreviews[0][0];
    const { local, remote, localChange, remoteChange } = resourcePreviews[0][1];
    if (localChange === Change.None && remoteChange === Change.None) {
      this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing extensions.`);
    }
    if (localChange !== Change.None) {
      await this.backupLocal(JSON.stringify(localExtensions));
      skippedExtensions = await this.localExtensionsProvider.updateLocalExtensions(local.added, local.removed, local.updated, skippedExtensions, this.syncResource.profile);
    }
    if (remote) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating remote extensions...`);
      const content = JSON.stringify(remote.all);
      remoteUserData = await this.updateRemoteUserData(content, force ? null : remoteUserData.ref);
      this.logService.info(`${this.syncResourceLogLabel}: Updated remote extensions.${remote.added.length ? ` Added: ${JSON.stringify(remote.added.map((e) => e.identifier.id))}.` : ""}${remote.updated.length ? ` Updated: ${JSON.stringify(remote.updated.map((e) => e.identifier.id))}.` : ""}${remote.removed.length ? ` Removed: ${JSON.stringify(remote.removed.map((e) => e.identifier.id))}.` : ""}`);
    }
    if (lastSyncUserData?.ref !== remoteUserData.ref) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized extensions...`);
      builtinExtensions = this.computeBuiltinExtensions(localExtensions, builtinExtensions);
      await this.updateLastSyncUserData(remoteUserData, { skippedExtensions, builtinExtensions });
      this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized extensions.${skippedExtensions.length ? ` Skipped: ${JSON.stringify(skippedExtensions.map((e) => e.identifier.id))}.` : ""}`);
    }
  }
  computeBuiltinExtensions(localExtensions, previousBuiltinExtensions) {
    const localExtensionsSet = /* @__PURE__ */ new Set();
    const builtinExtensions = [];
    for (const localExtension of localExtensions) {
      localExtensionsSet.add(localExtension.identifier.id.toLowerCase());
      if (!localExtension.installed) {
        builtinExtensions.push(localExtension.identifier);
      }
    }
    if (previousBuiltinExtensions) {
      for (const builtinExtension of previousBuiltinExtensions) {
        if (!localExtensionsSet.has(builtinExtension.id.toLowerCase())) {
          builtinExtensions.push(builtinExtension);
        }
      }
    }
    return builtinExtensions;
  }
  async resolveContent(uri) {
    if (this.extUri.isEqual(this.remoteResource, uri) || this.extUri.isEqual(this.baseResource, uri) || this.extUri.isEqual(this.localResource, uri) || this.extUri.isEqual(this.acceptedResource, uri)) {
      const content = await this.resolvePreviewContent(uri);
      return content ? this.stringify(JSON.parse(content), true) : content;
    }
    return null;
  }
  stringify(extensions, format) {
    return stringify(extensions, format);
  }
  async hasLocalData() {
    try {
      const { localExtensions } = await this.localExtensionsProvider.getLocalExtensions(this.syncResource.profile);
      if (localExtensions.some((e) => e.installed || e.disabled)) {
        return true;
      }
    } catch (error) {
    }
    return false;
  }
};
ExtensionsSynchroniser = __decorateClass([
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUserDataSyncStoreService),
  __decorateParam(6, IUserDataSyncLocalStoreService),
  __decorateParam(7, IExtensionManagementService),
  __decorateParam(8, IIgnoredExtensionsManagementService),
  __decorateParam(9, IUserDataSyncLogService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IUserDataSyncEnablementService),
  __decorateParam(12, ITelemetryService),
  __decorateParam(13, IExtensionStorageService),
  __decorateParam(14, IUriIdentityService),
  __decorateParam(15, IUserDataProfileStorageService),
  __decorateParam(16, IInstantiationService)
], ExtensionsSynchroniser);
let LocalExtensionsProvider = class {
  constructor(extensionManagementService, userDataProfileStorageService, extensionGalleryService, ignoredExtensionsManagementService, instantiationService, logService, productService) {
    this.extensionManagementService = extensionManagementService;
    this.userDataProfileStorageService = userDataProfileStorageService;
    this.extensionGalleryService = extensionGalleryService;
    this.ignoredExtensionsManagementService = ignoredExtensionsManagementService;
    this.instantiationService = instantiationService;
    this.logService = logService;
    this.productService = productService;
  }
  async getLocalExtensions(profile) {
    const installedExtensions = await this.extensionManagementService.getInstalled(void 0, profile.extensionsResource);
    const ignoredExtensions = this.ignoredExtensionsManagementService.getIgnoredExtensions(installedExtensions);
    const localExtensions = await this.withProfileScopedServices(profile, async (extensionEnablementService, extensionStorageService) => {
      const disabledExtensions = extensionEnablementService.getDisabledExtensions();
      return installedExtensions.map((extension) => {
        const { identifier, isBuiltin, manifest, preRelease, pinned, isApplicationScoped } = extension;
        const syncExtension = { identifier, preRelease, version: manifest.version, pinned: !!pinned };
        if (isApplicationScoped && !isApplicationScopedExtension(manifest)) {
          syncExtension.isApplicationScoped = isApplicationScoped;
        }
        if (this.productService.builtInExtensionsEnabledWithAutoUpdates?.some((id) => id.toLowerCase() === identifier.id.toLowerCase())) {
          syncExtension.isApplicationScoped = true;
        }
        if (disabledExtensions.some((disabledExtension) => areSameExtensions(disabledExtension, identifier))) {
          syncExtension.disabled = true;
        }
        if (!isBuiltin) {
          syncExtension.installed = true;
        }
        try {
          const keys = extensionStorageService.getKeysForSync({ id: identifier.id, version: manifest.version });
          if (keys) {
            const extensionStorageState = extensionStorageService.getExtensionState(extension, true) || {};
            syncExtension.state = Object.keys(extensionStorageState).reduce((state, key) => {
              if (keys.includes(key)) {
                state[key] = extensionStorageState[key];
              }
              return state;
            }, {});
          }
        } catch (error) {
          this.logService.info(`${getSyncResourceLogLabel(SyncResource.Extensions, profile)}: Error while parsing extension state`, getErrorMessage(error));
        }
        return syncExtension;
      });
    });
    return { localExtensions, ignoredExtensions };
  }
  async updateLocalExtensions(added, removed, updated, skippedExtensions, profile) {
    const syncResourceLogLabel = getSyncResourceLogLabel(SyncResource.Extensions, profile);
    const extensionsToInstall = [];
    const syncExtensionsToInstall = /* @__PURE__ */ new Map();
    const removeFromSkipped = [];
    const addToSkipped = [];
    const installedExtensions = await this.extensionManagementService.getInstalled(void 0, profile.extensionsResource);
    if (added.length || updated.length) {
      await this.withProfileScopedServices(profile, async (extensionEnablementService, extensionStorageService) => {
        await Promises.settled([...added, ...updated].map(async (e) => {
          const installedExtension = installedExtensions.find((installed) => areSameExtensions(installed.identifier, e.identifier));
          if (installedExtension && installedExtension.isBuiltin) {
            if (e.state && installedExtension.manifest.version === e.version) {
              this.updateExtensionState(e.state, installedExtension, installedExtension.manifest.version, extensionStorageService);
            }
            const isDisabled = extensionEnablementService.getDisabledExtensions().some((disabledExtension) => areSameExtensions(disabledExtension, e.identifier));
            if (isDisabled !== !!e.disabled) {
              if (e.disabled) {
                this.logService.trace(`${syncResourceLogLabel}: Disabling extension...`, e.identifier.id);
                await extensionEnablementService.disableExtension(e.identifier);
                this.logService.info(`${syncResourceLogLabel}: Disabled extension`, e.identifier.id);
              } else {
                this.logService.trace(`${syncResourceLogLabel}: Enabling extension...`, e.identifier.id);
                await extensionEnablementService.enableExtension(e.identifier);
                this.logService.info(`${syncResourceLogLabel}: Enabled extension`, e.identifier.id);
              }
            }
            removeFromSkipped.push(e.identifier);
            return;
          }
          const version = e.pinned ? e.version : void 0;
          const extension = (await this.extensionGalleryService.getExtensions([{ ...e.identifier, version, preRelease: version ? void 0 : e.preRelease }], CancellationToken.None))[0];
          if (e.state && (installedExtension ? installedExtension.manifest.version === e.version : !!extension)) {
            this.updateExtensionState(e.state, installedExtension || extension, installedExtension?.manifest.version, extensionStorageService);
          }
          if (extension) {
            try {
              const isDisabled = extensionEnablementService.getDisabledExtensions().some((disabledExtension) => areSameExtensions(disabledExtension, e.identifier));
              if (isDisabled !== !!e.disabled) {
                if (e.disabled) {
                  this.logService.trace(`${syncResourceLogLabel}: Disabling extension...`, e.identifier.id, extension.version);
                  await extensionEnablementService.disableExtension(extension.identifier);
                  this.logService.info(`${syncResourceLogLabel}: Disabled extension`, e.identifier.id, extension.version);
                } else {
                  this.logService.trace(`${syncResourceLogLabel}: Enabling extension...`, e.identifier.id, extension.version);
                  await extensionEnablementService.enableExtension(extension.identifier);
                  this.logService.info(`${syncResourceLogLabel}: Enabled extension`, e.identifier.id, extension.version);
                }
              }
              if (!installedExtension || installedExtension.preRelease !== e.preRelease || installedExtension.pinned !== e.pinned || version && installedExtension.manifest.version !== version) {
                if (await this.extensionManagementService.canInstall(extension) === true) {
                  extensionsToInstall.push({
                    extension,
                    options: {
                      isMachineScoped: false,
                      donotIncludePackAndDependencies: true,
                      installGivenVersion: e.pinned && !!e.version,
                      pinned: e.pinned,
                      installPreReleaseVersion: e.preRelease,
                      preRelease: e.preRelease,
                      profileLocation: profile.extensionsResource,
                      isApplicationScoped: e.isApplicationScoped,
                      context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true, [EXTENSION_INSTALL_SOURCE_CONTEXT]: ExtensionInstallSource.SETTINGS_SYNC, [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true }
                    }
                  });
                  syncExtensionsToInstall.set(extension.identifier.id.toLowerCase(), e);
                } else {
                  this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension because it cannot be installed.`, extension.displayName || extension.identifier.id);
                  addToSkipped.push(e);
                }
              }
            } catch (error) {
              addToSkipped.push(e);
              this.logService.error(error);
              this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension`, extension.displayName || extension.identifier.id);
            }
          } else {
            addToSkipped.push(e);
            this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension because the extension is not found.`, e.identifier.id);
          }
        }));
      });
    }
    if (removed.length) {
      const extensionsToRemove = installedExtensions.filter(({ identifier, isBuiltin }) => !isBuiltin && removed.some((r) => areSameExtensions(identifier, r)));
      await Promises.settled(extensionsToRemove.map(async (extensionToRemove) => {
        this.logService.trace(`${syncResourceLogLabel}: Uninstalling local extension...`, extensionToRemove.identifier.id);
        await this.extensionManagementService.uninstall(extensionToRemove, { donotIncludePack: true, donotCheckDependents: true, profileLocation: profile.extensionsResource });
        this.logService.info(`${syncResourceLogLabel}: Uninstalled local extension.`, extensionToRemove.identifier.id);
        removeFromSkipped.push(extensionToRemove.identifier);
      }));
    }
    const results = await this.extensionManagementService.installGalleryExtensions(extensionsToInstall);
    for (const { identifier, local, error, source } of results) {
      const gallery = source;
      if (local) {
        this.logService.info(`${syncResourceLogLabel}: Installed extension.`, identifier.id, gallery.version);
        removeFromSkipped.push(identifier);
      } else {
        const e = syncExtensionsToInstall.get(identifier.id.toLowerCase());
        if (e) {
          addToSkipped.push(e);
          this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension`, gallery.displayName || gallery.identifier.id);
        }
        if (error instanceof ExtensionManagementError && [ExtensionManagementErrorCode.Incompatible, ExtensionManagementErrorCode.IncompatibleApi, ExtensionManagementErrorCode.IncompatibleTargetPlatform].includes(error.code)) {
          this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension because the compatible extension is not found.`, gallery.displayName || gallery.identifier.id);
        } else if (error) {
          this.logService.error(error);
        }
      }
    }
    const newSkippedExtensions = [];
    for (const skippedExtension of skippedExtensions) {
      if (!removeFromSkipped.some((e) => areSameExtensions(e, skippedExtension.identifier))) {
        newSkippedExtensions.push(skippedExtension);
      }
    }
    for (const skippedExtension of addToSkipped) {
      if (!newSkippedExtensions.some((e) => areSameExtensions(e.identifier, skippedExtension.identifier))) {
        newSkippedExtensions.push(skippedExtension);
      }
    }
    return newSkippedExtensions;
  }
  updateExtensionState(state, extension, version, extensionStorageService) {
    const extensionState = extensionStorageService.getExtensionState(extension, true) || {};
    const keys = version ? extensionStorageService.getKeysForSync({ id: extension.identifier.id, version }) : void 0;
    if (keys) {
      keys.forEach((key) => {
        extensionState[key] = state[key];
      });
    } else {
      Object.keys(state).forEach((key) => extensionState[key] = state[key]);
    }
    extensionStorageService.setExtensionState(extension, extensionState, true);
  }
  async withProfileScopedServices(profile, fn) {
    return this.userDataProfileStorageService.withProfileScopedStorageService(
      profile,
      async (storageService) => {
        const disposables = new DisposableStore();
        const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IStorageService, storageService])));
        const extensionEnablementService = disposables.add(instantiationService.createInstance(GlobalExtensionEnablementService));
        const extensionStorageService = disposables.add(instantiationService.createInstance(ExtensionStorageService));
        try {
          return await fn(extensionEnablementService, extensionStorageService);
        } finally {
          disposables.dispose();
        }
      }
    );
  }
};
LocalExtensionsProvider = __decorateClass([
  __decorateParam(0, IExtensionManagementService),
  __decorateParam(1, IUserDataProfileStorageService),
  __decorateParam(2, IExtensionGalleryService),
  __decorateParam(3, IIgnoredExtensionsManagementService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IUserDataSyncLogService),
  __decorateParam(6, IProductService)
], LocalExtensionsProvider);
let AbstractExtensionsInitializer = class extends AbstractInitializer {
  constructor(extensionManagementService, ignoredExtensionsManagementService, fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService) {
    super(SyncResource.Extensions, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
    this.extensionManagementService = extensionManagementService;
    this.ignoredExtensionsManagementService = ignoredExtensionsManagementService;
  }
  async parseExtensions(remoteUserData) {
    return remoteUserData.syncData ? await parseAndMigrateExtensions(remoteUserData.syncData, this.extensionManagementService) : null;
  }
  generatePreview(remoteExtensions, localExtensions) {
    const installedExtensions = [];
    const newExtensions = [];
    const disabledExtensions = [];
    for (const extension of remoteExtensions) {
      if (this.ignoredExtensionsManagementService.hasToNeverSyncExtension(extension.identifier.id)) {
        continue;
      }
      const installedExtension = localExtensions.find((i) => areSameExtensions(i.identifier, extension.identifier));
      if (installedExtension) {
        installedExtensions.push(installedExtension);
        if (extension.disabled) {
          disabledExtensions.push(extension.identifier);
        }
      } else if (extension.installed) {
        newExtensions.push({ ...extension.identifier, preRelease: !!extension.preRelease });
        if (extension.disabled) {
          disabledExtensions.push(extension.identifier);
        }
      }
    }
    return { installedExtensions, newExtensions, disabledExtensions, remoteExtensions };
  }
};
AbstractExtensionsInitializer = __decorateClass([
  __decorateParam(0, IExtensionManagementService),
  __decorateParam(1, IIgnoredExtensionsManagementService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IUserDataProfilesService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IUriIdentityService)
], AbstractExtensionsInitializer);
export {
  AbstractExtensionsInitializer,
  ExtensionsSynchroniser,
  LocalExtensionsProvider,
  parseExtensions,
  stringify
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vZXh0ZW5zaW9uc1N5bmMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgdG9Gb3JtYXR0ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uRm9ybWF0dGVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjb21wYXJlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIElHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgSUxvY2FsRXh0ZW5zaW9uLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUsIElHYWxsZXJ5RXh0ZW5zaW9uLCBESVNBQkxFRF9FWFRFTlNJT05TX1NUT1JBR0VfUEFUSCwgRVhURU5TSU9OX0lOU1RBTExfU0tJUF9XQUxLVEhST1VHSF9DT05URVhULCBFWFRFTlNJT05fSU5TVEFMTF9TT1VSQ0VfQ09OVEVYVCwgSW5zdGFsbEV4dGVuc2lvbkluZm8sIEV4dGVuc2lvbkluc3RhbGxTb3VyY2UsIEVYVEVOU0lPTl9JTlNUQUxMX1NLSVBfUFVCTElTSEVSX1RSVVNUX0NPTlRFWFQgfSBmcm9tICcuLi8uLi9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UsIElFeHRlbnNpb25TdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvblN0b3JhZ2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSwgSUV4dGVuc2lvbklkZW50aWZpZXIsIGlzQXBwbGljYXRpb25TY29wZWRFeHRlbnNpb24gfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEluaXRpYWxpemVyLCBBYnN0cmFjdFN5bmNocm9uaXNlciwgZ2V0U3luY1Jlc291cmNlTG9nTGFiZWwsIElBY2NlcHRSZXN1bHQsIElNZXJnZVJlc3VsdCwgSVJlc291cmNlUHJldmlldyB9IGZyb20gJy4vYWJzdHJhY3RTeW5jaHJvbml6ZXIuanMnO1xuaW1wb3J0IHsgSU1lcmdlUmVzdWx0IGFzIElFeHRlbnNpb25NZXJnZVJlc3VsdCwgbWVyZ2UgfSBmcm9tICcuL2V4dGVuc2lvbnNNZXJnZS5qcyc7XG5pbXBvcnQgeyBJSWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4vaWdub3JlZEV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ2hhbmdlLCBJUmVtb3RlVXNlckRhdGEsIElTeW5jRGF0YSwgSVN5bmNFeHRlbnNpb24sIElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSwgSVVzZXJEYXRhU3luY2hyb25pc2VyLCBJVXNlckRhdGFTeW5jTG9nU2VydmljZSwgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLCBTeW5jUmVzb3VyY2UsIFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgSUxvY2FsU3luY0V4dGVuc2lvbiB9IGZyb20gJy4vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuXG50eXBlIElFeHRlbnNpb25SZXNvdXJjZU1lcmdlUmVzdWx0ID0gSUFjY2VwdFJlc3VsdCAmIElFeHRlbnNpb25NZXJnZVJlc3VsdDtcblxuaW50ZXJmYWNlIElFeHRlbnNpb25SZXNvdXJjZVByZXZpZXcgZXh0ZW5kcyBJUmVzb3VyY2VQcmV2aWV3IHtcblx0cmVhZG9ubHkgbG9jYWxFeHRlbnNpb25zOiBJTG9jYWxTeW5jRXh0ZW5zaW9uW107XG5cdHJlYWRvbmx5IHJlbW90ZUV4dGVuc2lvbnM6IElTeW5jRXh0ZW5zaW9uW10gfCBudWxsO1xuXHRyZWFkb25seSBza2lwcGVkRXh0ZW5zaW9uczogSVN5bmNFeHRlbnNpb25bXTtcblx0cmVhZG9ubHkgYnVpbHRpbkV4dGVuc2lvbnM6IElFeHRlbnNpb25JZGVudGlmaWVyW10gfCBudWxsO1xuXHRyZWFkb25seSBwcmV2aWV3UmVzdWx0OiBJRXh0ZW5zaW9uUmVzb3VyY2VNZXJnZVJlc3VsdDtcbn1cblxuaW50ZXJmYWNlIElMYXN0U3luY1VzZXJEYXRhIGV4dGVuZHMgSVJlbW90ZVVzZXJEYXRhIHtcblx0c2tpcHBlZEV4dGVuc2lvbnM6IElTeW5jRXh0ZW5zaW9uW10gfCB1bmRlZmluZWQ7XG5cdGJ1aWx0aW5FeHRlbnNpb25zOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdIHwgdW5kZWZpbmVkO1xufVxuXG5hc3luYyBmdW5jdGlvbiBwYXJzZUFuZE1pZ3JhdGVFeHRlbnNpb25zKHN5bmNEYXRhOiBJU3luY0RhdGEsIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UpOiBQcm9taXNlPElTeW5jRXh0ZW5zaW9uW10+IHtcblx0Y29uc3QgZXh0ZW5zaW9ucyA9IEpTT04ucGFyc2Uoc3luY0RhdGEuY29udGVudCk7XG5cdGlmIChzeW5jRGF0YS52ZXJzaW9uID09PSAxXG5cdFx0fHwgc3luY0RhdGEudmVyc2lvbiA9PT0gMlxuXHQpIHtcblx0XHRjb25zdCBidWlsdGluRXh0ZW5zaW9ucyA9IChhd2FpdCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoRXh0ZW5zaW9uVHlwZS5TeXN0ZW0pKS5maWx0ZXIoZSA9PiBlLmlzQnVpbHRpbik7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0Ly8gI3JlZ2lvbiBNaWdyYXRpb24gZnJvbSB2MSAoZW5hYmxlZCAtPiBkaXNhYmxlZClcblx0XHRcdGlmIChzeW5jRGF0YS52ZXJzaW9uID09PSAxKSB7XG5cdFx0XHRcdGlmIChleHRlbnNpb24uZW5hYmxlZCA9PT0gZmFsc2UpIHtcblx0XHRcdFx0XHRleHRlbnNpb24uZGlzYWJsZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRlbGV0ZSBleHRlbnNpb24uZW5hYmxlZDtcblx0XHRcdH1cblx0XHRcdC8vICNlbmRyZWdpb25cblxuXHRcdFx0Ly8gI3JlZ2lvbiBNaWdyYXRpb24gZnJvbSB2MiAoc2V0IGluc3RhbGxlZCBwcm9wZXJ0eSBvbiBleHRlbnNpb24pXG5cdFx0XHRpZiAoc3luY0RhdGEudmVyc2lvbiA9PT0gMikge1xuXHRcdFx0XHRpZiAoYnVpbHRpbkV4dGVuc2lvbnMuZXZlcnkoaW5zdGFsbGVkID0+ICFhcmVTYW1lRXh0ZW5zaW9ucyhpbnN0YWxsZWQuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKSkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbi5pbnN0YWxsZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyAjZW5kcmVnaW9uXG5cdFx0fVxuXHR9XG5cdHJldHVybiBleHRlbnNpb25zO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VFeHRlbnNpb25zKHN5bmNEYXRhOiBJU3luY0RhdGEpOiBJU3luY0V4dGVuc2lvbltdIHtcblx0cmV0dXJuIEpTT04ucGFyc2Uoc3luY0RhdGEuY29udGVudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdHJpbmdpZnkoZXh0ZW5zaW9uczogSVN5bmNFeHRlbnNpb25bXSwgZm9ybWF0OiBib29sZWFuKTogc3RyaW5nIHtcblx0ZXh0ZW5zaW9ucy5zb3J0KChlMSwgZTIpID0+IHtcblx0XHRpZiAoIWUxLmlkZW50aWZpZXIudXVpZCAmJiBlMi5pZGVudGlmaWVyLnV1aWQpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0aWYgKGUxLmlkZW50aWZpZXIudXVpZCAmJiAhZTIuaWRlbnRpZmllci51dWlkKSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbXBhcmUoZTEuaWRlbnRpZmllci5pZCwgZTIuaWRlbnRpZmllci5pZCk7XG5cdH0pO1xuXHRyZXR1cm4gZm9ybWF0ID8gdG9Gb3JtYXR0ZWRTdHJpbmcoZXh0ZW5zaW9ucywge30pIDogSlNPTi5zdHJpbmdpZnkoZXh0ZW5zaW9ucyk7XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25zU3luY2hyb25pc2VyIGV4dGVuZHMgQWJzdHJhY3RTeW5jaHJvbmlzZXIgaW1wbGVtZW50cyBJVXNlckRhdGFTeW5jaHJvbmlzZXIge1xuXG5cdC8qXG5cdFx0VmVyc2lvbiAzIC0gSW50cm9kdWNlIGluc3RhbGxlZCBwcm9wZXJ0eSB0byBza2lwIGluc3RhbGxpbmcgYnVpbHQgaW4gZXh0ZW5zaW9uc1xuXHRcdHByb3RlY3RlZCByZWFkb25seSB2ZXJzaW9uOiBudW1iZXIgPSAzO1xuXHQqL1xuXHQvKiBWZXJzaW9uIDQ6IENoYW5nZSBzZXR0aW5ncyBmcm9tIGBzeW5jLiR7c2V0dGluZ31gIHRvIGBzZXR0aW5nc1N5bmMue3NldHRpbmd9YCAqL1xuXHQvKiBWZXJzaW9uIDU6IEludHJvZHVjZSBleHRlbnNpb24gc3RhdGUgKi9cblx0LyogVmVyc2lvbiA2OiBBZGRlZCBpc0FwcGxpY2F0aW9uU2NvcGVkIHByb3BlcnR5ICovXG5cdHByb3RlY3RlZCByZWFkb25seSB2ZXJzaW9uOiBudW1iZXIgPSA2O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJldmlld1Jlc291cmNlOiBVUkkgPSB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCAnZXh0ZW5zaW9ucy5qc29uJyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYmFzZVJlc291cmNlOiBVUkkgPSB0aGlzLnByZXZpZXdSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2Jhc2UnIH0pO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxvY2FsUmVzb3VyY2U6IFVSSSA9IHRoaXMucHJldmlld1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlbW90ZVJlc291cmNlOiBVUkkgPSB0aGlzLnByZXZpZXdSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWNjZXB0ZWRSZXNvdXJjZTogVVJJID0gdGhpcy5wcmV2aWV3UmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsb2NhbEV4dGVuc2lvbnNQcm92aWRlcjogTG9jYWxFeHRlbnNpb25zUHJvdmlkZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Ly8gcHJvZmlsZUxvY2F0aW9uIGNoYW5nZXMgZm9yIGRlZmF1bHQgcHJvZmlsZVxuXHRcdHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsXG5cdFx0Y29sbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlIHVzZXJEYXRhU3luY1N0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlIHVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElJZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSUlnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UgZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2U6IElFeHRlbnNpb25TdG9yYWdlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZSB1c2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih7IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLkV4dGVuc2lvbnMsIHByb2ZpbGUgfSwgY29sbGVjdGlvbiwgZmlsZVNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgdXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsIHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHR0aGlzLmxvY2FsRXh0ZW5zaW9uc1Byb3ZpZGVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbEV4dGVuc2lvbnNQcm92aWRlcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRFdmVudC5hbnk8YW55Pihcblx0XHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRJbnN0YWxsRXh0ZW5zaW9ucywgKGUgPT4gZS5zb21lKCh7IGxvY2FsIH0pID0+ICEhbG9jYWwpKSksXG5cdFx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uLCAoZSA9PiAhZS5lcnJvcikpLFxuXHRcdFx0XHRFdmVudC5maWx0ZXIodXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2UsIGUgPT4gZS52YWx1ZUNoYW5nZXMuc29tZSgoeyBwcm9maWxlLCBjaGFuZ2VzIH0pID0+IHRoaXMuc3luY1Jlc291cmNlLnByb2ZpbGUuaWQgPT09IHByb2ZpbGUuaWQgJiYgY2hhbmdlcy5zb21lKGNoYW5nZSA9PiBjaGFuZ2Uua2V5ID09PSBESVNBQkxFRF9FWFRFTlNJT05TX1NUT1JBR0VfUEFUSCkpKSxcblx0XHRcdFx0ZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25TdG9yYWdlVG9TeW5jKSgoKSA9PiB0aGlzLnRyaWdnZXJMb2NhbENoYW5nZSgpKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2VuZXJhdGVTeW5jUHJldmlldyhyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJTGFzdFN5bmNVc2VyRGF0YSB8IG51bGwpOiBQcm9taXNlPElFeHRlbnNpb25SZXNvdXJjZVByZXZpZXdbXT4ge1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSA/IGF3YWl0IHBhcnNlQW5kTWlncmF0ZUV4dGVuc2lvbnMocmVtb3RlVXNlckRhdGEuc3luY0RhdGEsIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UpIDogbnVsbDtcblx0XHRjb25zdCBza2lwcGVkRXh0ZW5zaW9ucyA9IGxhc3RTeW5jVXNlckRhdGE/LnNraXBwZWRFeHRlbnNpb25zID8/IFtdO1xuXHRcdGNvbnN0IGJ1aWx0aW5FeHRlbnNpb25zID0gbGFzdFN5bmNVc2VyRGF0YT8uYnVpbHRpbkV4dGVuc2lvbnMgPz8gbnVsbDtcblx0XHRjb25zdCBsYXN0U3luY0V4dGVuc2lvbnMgPSBsYXN0U3luY1VzZXJEYXRhPy5zeW5jRGF0YSA/IGF3YWl0IHBhcnNlQW5kTWlncmF0ZUV4dGVuc2lvbnMobGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSwgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSkgOiBudWxsO1xuXG5cdFx0Y29uc3QgeyBsb2NhbEV4dGVuc2lvbnMsIGlnbm9yZWRFeHRlbnNpb25zIH0gPSBhd2FpdCB0aGlzLmxvY2FsRXh0ZW5zaW9uc1Byb3ZpZGVyLmdldExvY2FsRXh0ZW5zaW9ucyh0aGlzLnN5bmNSZXNvdXJjZS5wcm9maWxlKTtcblxuXHRcdGlmIChyZW1vdGVFeHRlbnNpb25zKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IE1lcmdpbmcgcmVtb3RlIGV4dGVuc2lvbnMgd2l0aCBsb2NhbCBleHRlbnNpb25zLi4uYCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogUmVtb3RlIGV4dGVuc2lvbnMgZG9lcyBub3QgZXhpc3QuIFN5bmNocm9uaXppbmcgZXh0ZW5zaW9ucyBmb3IgdGhlIGZpcnN0IHRpbWUuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBsb2NhbCwgcmVtb3RlIH0gPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGxhc3RTeW5jRXh0ZW5zaW9ucywgc2tpcHBlZEV4dGVuc2lvbnMsIGlnbm9yZWRFeHRlbnNpb25zLCBidWlsdGluRXh0ZW5zaW9ucyk7XG5cdFx0Y29uc3QgcHJldmlld1Jlc3VsdDogSUV4dGVuc2lvblJlc291cmNlTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRsb2NhbCwgcmVtb3RlLFxuXHRcdFx0Y29udGVudDogdGhpcy5nZXRQcmV2aWV3Q29udGVudChsb2NhbEV4dGVuc2lvbnMsIGxvY2FsLmFkZGVkLCBsb2NhbC51cGRhdGVkLCBsb2NhbC5yZW1vdmVkKSxcblx0XHRcdGxvY2FsQ2hhbmdlOiBsb2NhbC5hZGRlZC5sZW5ndGggPiAwIHx8IGxvY2FsLnJlbW92ZWQubGVuZ3RoID4gMCB8fCBsb2NhbC51cGRhdGVkLmxlbmd0aCA+IDAgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuTm9uZSxcblx0XHRcdHJlbW90ZUNoYW5nZTogcmVtb3RlICE9PSBudWxsID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLk5vbmUsXG5cdFx0fTtcblxuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHRoaXMuc3RyaW5naWZ5KGxvY2FsRXh0ZW5zaW9ucywgZmFsc2UpO1xuXHRcdHJldHVybiBbe1xuXHRcdFx0c2tpcHBlZEV4dGVuc2lvbnMsXG5cdFx0XHRidWlsdGluRXh0ZW5zaW9ucyxcblx0XHRcdGJhc2VSZXNvdXJjZTogdGhpcy5iYXNlUmVzb3VyY2UsXG5cdFx0XHRiYXNlQ29udGVudDogbGFzdFN5bmNFeHRlbnNpb25zID8gdGhpcy5zdHJpbmdpZnkobGFzdFN5bmNFeHRlbnNpb25zLCBmYWxzZSkgOiBsb2NhbENvbnRlbnQsXG5cdFx0XHRsb2NhbFJlc291cmNlOiB0aGlzLmxvY2FsUmVzb3VyY2UsXG5cdFx0XHRsb2NhbENvbnRlbnQsXG5cdFx0XHRsb2NhbEV4dGVuc2lvbnMsXG5cdFx0XHRyZW1vdGVSZXNvdXJjZTogdGhpcy5yZW1vdGVSZXNvdXJjZSxcblx0XHRcdHJlbW90ZUV4dGVuc2lvbnMsXG5cdFx0XHRyZW1vdGVDb250ZW50OiByZW1vdGVFeHRlbnNpb25zID8gdGhpcy5zdHJpbmdpZnkocmVtb3RlRXh0ZW5zaW9ucywgZmFsc2UpIDogbnVsbCxcblx0XHRcdHByZXZpZXdSZXNvdXJjZTogdGhpcy5wcmV2aWV3UmVzb3VyY2UsXG5cdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0bG9jYWxDaGFuZ2U6IHByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5hY2NlcHRlZFJlc291cmNlLFxuXHRcdH1dO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGhhc1JlbW90ZUNoYW5nZWQobGFzdFN5bmNVc2VyRGF0YTogSUxhc3RTeW5jVXNlckRhdGEpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBsYXN0U3luY0V4dGVuc2lvbnM6IElTeW5jRXh0ZW5zaW9uW10gfCBudWxsID0gbGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSA/IGF3YWl0IHBhcnNlQW5kTWlncmF0ZUV4dGVuc2lvbnMobGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSwgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSkgOiBudWxsO1xuXHRcdGNvbnN0IHsgbG9jYWxFeHRlbnNpb25zLCBpZ25vcmVkRXh0ZW5zaW9ucyB9ID0gYXdhaXQgdGhpcy5sb2NhbEV4dGVuc2lvbnNQcm92aWRlci5nZXRMb2NhbEV4dGVuc2lvbnModGhpcy5zeW5jUmVzb3VyY2UucHJvZmlsZSk7XG5cdFx0Y29uc3QgeyByZW1vdGUgfSA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgbGFzdFN5bmNFeHRlbnNpb25zLCBsYXN0U3luY0V4dGVuc2lvbnMsIGxhc3RTeW5jVXNlckRhdGEuc2tpcHBlZEV4dGVuc2lvbnMgfHwgW10sIGlnbm9yZWRFeHRlbnNpb25zLCBsYXN0U3luY1VzZXJEYXRhLmJ1aWx0aW5FeHRlbnNpb25zIHx8IFtdKTtcblx0XHRyZXR1cm4gcmVtb3RlICE9PSBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQcmV2aWV3Q29udGVudChsb2NhbEV4dGVuc2lvbnM6IElTeW5jRXh0ZW5zaW9uW10sIGFkZGVkOiBJU3luY0V4dGVuc2lvbltdLCB1cGRhdGVkOiBJU3luY0V4dGVuc2lvbltdLCByZW1vdmVkOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdKTogc3RyaW5nIHtcblx0XHRjb25zdCBwcmV2aWV3OiBJU3luY0V4dGVuc2lvbltdID0gWy4uLmFkZGVkLCAuLi51cGRhdGVkXTtcblxuXHRcdGNvbnN0IGlkc09yVVVJRHM6IFNldDxzdHJpbmc+ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgYWRkSWRlbnRpZmllciA9IChpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcikgPT4ge1xuXHRcdFx0aWRzT3JVVUlEcy5hZGQoaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdGlmIChpZGVudGlmaWVyLnV1aWQpIHtcblx0XHRcdFx0aWRzT3JVVUlEcy5hZGQoaWRlbnRpZmllci51dWlkKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHByZXZpZXcuZm9yRWFjaCgoeyBpZGVudGlmaWVyIH0pID0+IGFkZElkZW50aWZpZXIoaWRlbnRpZmllcikpO1xuXHRcdHJlbW92ZWQuZm9yRWFjaChhZGRJZGVudGlmaWVyKTtcblxuXHRcdGZvciAoY29uc3QgbG9jYWxFeHRlbnNpb24gb2YgbG9jYWxFeHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoaWRzT3JVVUlEcy5oYXMobG9jYWxFeHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKSB8fCAobG9jYWxFeHRlbnNpb24uaWRlbnRpZmllci51dWlkICYmIGlkc09yVVVJRHMuaGFzKGxvY2FsRXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCkpKSB7XG5cdFx0XHRcdC8vIHNraXBcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRwcmV2aWV3LnB1c2gobG9jYWxFeHRlbnNpb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnN0cmluZ2lmeShwcmV2aWV3LCBmYWxzZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0TWVyZ2VSZXN1bHQocmVzb3VyY2VQcmV2aWV3OiBJRXh0ZW5zaW9uUmVzb3VyY2VQcmV2aWV3LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElNZXJnZVJlc3VsdD4ge1xuXHRcdHJldHVybiB7IC4uLnJlc291cmNlUHJldmlldy5wcmV2aWV3UmVzdWx0LCBoYXNDb25mbGljdHM6IGZhbHNlIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0QWNjZXB0UmVzdWx0KHJlc291cmNlUHJldmlldzogSUV4dGVuc2lvblJlc291cmNlUHJldmlldywgcmVzb3VyY2U6IFVSSSwgY29udGVudDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRXh0ZW5zaW9uUmVzb3VyY2VNZXJnZVJlc3VsdD4ge1xuXG5cdFx0LyogQWNjZXB0IGxvY2FsIHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwocmVzb3VyY2UsIHRoaXMubG9jYWxSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmFjY2VwdExvY2FsKHJlc291cmNlUHJldmlldyk7XG5cdFx0fVxuXG5cdFx0LyogQWNjZXB0IHJlbW90ZSByZXNvdXJjZSAqL1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsKHJlc291cmNlLCB0aGlzLnJlbW90ZVJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuYWNjZXB0UmVtb3RlKHJlc291cmNlUHJldmlldyk7XG5cdFx0fVxuXG5cdFx0LyogQWNjZXB0IHByZXZpZXcgcmVzb3VyY2UgKi9cblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5wcmV2aWV3UmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQ7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIFJlc291cmNlOiAke3Jlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFjY2VwdExvY2FsKHJlc291cmNlUHJldmlldzogSUV4dGVuc2lvblJlc291cmNlUHJldmlldyk6IFByb21pc2U8SUV4dGVuc2lvblJlc291cmNlTWVyZ2VSZXN1bHQ+IHtcblx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQodW5kZWZpbmVkLCB0aGlzLnN5bmNSZXNvdXJjZS5wcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0Y29uc3QgaWdub3JlZEV4dGVuc2lvbnMgPSB0aGlzLmlnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0SWdub3JlZEV4dGVuc2lvbnMoaW5zdGFsbGVkRXh0ZW5zaW9ucyk7XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50ID8gSlNPTi5wYXJzZShyZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCkgOiBudWxsO1xuXHRcdGNvbnN0IG1lcmdlUmVzdWx0ID0gbWVyZ2UocmVzb3VyY2VQcmV2aWV3LmxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVzb3VyY2VQcmV2aWV3LnNraXBwZWRFeHRlbnNpb25zLCBpZ25vcmVkRXh0ZW5zaW9ucywgcmVzb3VyY2VQcmV2aWV3LmJ1aWx0aW5FeHRlbnNpb25zKTtcblx0XHRjb25zdCB7IGxvY2FsLCByZW1vdGUgfSA9IG1lcmdlUmVzdWx0O1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcubG9jYWxDb250ZW50LFxuXHRcdFx0bG9jYWwsXG5cdFx0XHRyZW1vdGUsXG5cdFx0XHRsb2NhbENoYW5nZTogbG9jYWwuYWRkZWQubGVuZ3RoID4gMCB8fCBsb2NhbC5yZW1vdmVkLmxlbmd0aCA+IDAgfHwgbG9jYWwudXBkYXRlZC5sZW5ndGggPiAwID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLk5vbmUsXG5cdFx0XHRyZW1vdGVDaGFuZ2U6IHJlbW90ZSAhPT0gbnVsbCA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5Ob25lLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFjY2VwdFJlbW90ZShyZXNvdXJjZVByZXZpZXc6IElFeHRlbnNpb25SZXNvdXJjZVByZXZpZXcpOiBQcm9taXNlPElFeHRlbnNpb25SZXNvdXJjZU1lcmdlUmVzdWx0PiB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKHVuZGVmaW5lZCwgdGhpcy5zeW5jUmVzb3VyY2UucHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGlnbm9yZWRFeHRlbnNpb25zID0gdGhpcy5pZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldElnbm9yZWRFeHRlbnNpb25zKGluc3RhbGxlZEV4dGVuc2lvbnMpO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSByZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCA/IEpTT04ucGFyc2UocmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQpIDogbnVsbDtcblx0XHRpZiAocmVtb3RlRXh0ZW5zaW9ucyAhPT0gbnVsbCkge1xuXHRcdFx0Y29uc3QgbWVyZ2VSZXN1bHQgPSBtZXJnZShyZXNvdXJjZVByZXZpZXcubG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCByZXNvdXJjZVByZXZpZXcubG9jYWxFeHRlbnNpb25zLCBbXSwgaWdub3JlZEV4dGVuc2lvbnMsIHJlc291cmNlUHJldmlldy5idWlsdGluRXh0ZW5zaW9ucyk7XG5cdFx0XHRjb25zdCB7IGxvY2FsLCByZW1vdGUgfSA9IG1lcmdlUmVzdWx0O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogcmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQsXG5cdFx0XHRcdGxvY2FsLFxuXHRcdFx0XHRyZW1vdGUsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBsb2NhbC5hZGRlZC5sZW5ndGggPiAwIHx8IGxvY2FsLnJlbW92ZWQubGVuZ3RoID4gMCB8fCBsb2NhbC51cGRhdGVkLmxlbmd0aCA+IDAgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuTm9uZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiByZW1vdGUgIT09IG51bGwgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuTm9uZSxcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50LFxuXHRcdFx0XHRsb2NhbDogeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCB1cGRhdGVkOiBbXSB9LFxuXHRcdFx0XHRyZW1vdGU6IG51bGwsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGFwcGx5UmVzdWx0KHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEsIGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSB8IG51bGwsIHJlc291cmNlUHJldmlld3M6IFtJRXh0ZW5zaW9uUmVzb3VyY2VQcmV2aWV3LCBJRXh0ZW5zaW9uUmVzb3VyY2VNZXJnZVJlc3VsdF1bXSwgZm9yY2U6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgeyBza2lwcGVkRXh0ZW5zaW9ucywgYnVpbHRpbkV4dGVuc2lvbnMsIGxvY2FsRXh0ZW5zaW9ucyB9ID0gcmVzb3VyY2VQcmV2aWV3c1swXVswXTtcblx0XHRjb25zdCB7IGxvY2FsLCByZW1vdGUsIGxvY2FsQ2hhbmdlLCByZW1vdGVDaGFuZ2UgfSA9IHJlc291cmNlUHJldmlld3NbMF1bMV07XG5cblx0XHRpZiAobG9jYWxDaGFuZ2UgPT09IENoYW5nZS5Ob25lICYmIHJlbW90ZUNoYW5nZSA9PT0gQ2hhbmdlLk5vbmUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBObyBjaGFuZ2VzIGZvdW5kIGR1cmluZyBzeW5jaHJvbml6aW5nIGV4dGVuc2lvbnMuYCk7XG5cdFx0fVxuXG5cdFx0aWYgKGxvY2FsQ2hhbmdlICE9PSBDaGFuZ2UuTm9uZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5iYWNrdXBMb2NhbChKU09OLnN0cmluZ2lmeShsb2NhbEV4dGVuc2lvbnMpKTtcblx0XHRcdHNraXBwZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5sb2NhbEV4dGVuc2lvbnNQcm92aWRlci51cGRhdGVMb2NhbEV4dGVuc2lvbnMobG9jYWwuYWRkZWQsIGxvY2FsLnJlbW92ZWQsIGxvY2FsLnVwZGF0ZWQsIHNraXBwZWRFeHRlbnNpb25zLCB0aGlzLnN5bmNSZXNvdXJjZS5wcm9maWxlKTtcblx0XHR9XG5cblx0XHRpZiAocmVtb3RlKSB7XG5cdFx0XHQvLyB1cGRhdGUgcmVtb3RlXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0aW5nIHJlbW90ZSBleHRlbnNpb25zLi4uYCk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkocmVtb3RlLmFsbCk7XG5cdFx0XHRyZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRoaXMudXBkYXRlUmVtb3RlVXNlckRhdGEoY29udGVudCwgZm9yY2UgPyBudWxsIDogcmVtb3RlVXNlckRhdGEucmVmKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGVkIHJlbW90ZSBleHRlbnNpb25zLiR7cmVtb3RlLmFkZGVkLmxlbmd0aCA/IGAgQWRkZWQ6ICR7SlNPTi5zdHJpbmdpZnkocmVtb3RlLmFkZGVkLm1hcChlID0+IGUuaWRlbnRpZmllci5pZCkpfS5gIDogJyd9JHtyZW1vdGUudXBkYXRlZC5sZW5ndGggPyBgIFVwZGF0ZWQ6ICR7SlNPTi5zdHJpbmdpZnkocmVtb3RlLnVwZGF0ZWQubWFwKGUgPT4gZS5pZGVudGlmaWVyLmlkKSl9LmAgOiAnJ30ke3JlbW90ZS5yZW1vdmVkLmxlbmd0aCA/IGAgUmVtb3ZlZDogJHtKU09OLnN0cmluZ2lmeShyZW1vdGUucmVtb3ZlZC5tYXAoZSA9PiBlLmlkZW50aWZpZXIuaWQpKX0uYCA6ICcnfWApO1xuXHRcdH1cblxuXHRcdGlmIChsYXN0U3luY1VzZXJEYXRhPy5yZWYgIT09IHJlbW90ZVVzZXJEYXRhLnJlZikge1xuXHRcdFx0Ly8gdXBkYXRlIGxhc3Qgc3luY1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyBsYXN0IHN5bmNocm9uaXplZCBleHRlbnNpb25zLi4uYCk7XG5cdFx0XHRidWlsdGluRXh0ZW5zaW9ucyA9IHRoaXMuY29tcHV0ZUJ1aWx0aW5FeHRlbnNpb25zKGxvY2FsRXh0ZW5zaW9ucywgYnVpbHRpbkV4dGVuc2lvbnMpO1xuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVMYXN0U3luY1VzZXJEYXRhKHJlbW90ZVVzZXJEYXRhLCB7IHNraXBwZWRFeHRlbnNpb25zLCBidWlsdGluRXh0ZW5zaW9ucyB9KTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGVkIGxhc3Qgc3luY2hyb25pemVkIGV4dGVuc2lvbnMuJHtza2lwcGVkRXh0ZW5zaW9ucy5sZW5ndGggPyBgIFNraXBwZWQ6ICR7SlNPTi5zdHJpbmdpZnkoc2tpcHBlZEV4dGVuc2lvbnMubWFwKGUgPT4gZS5pZGVudGlmaWVyLmlkKSl9LmAgOiAnJ31gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVCdWlsdGluRXh0ZW5zaW9ucyhsb2NhbEV4dGVuc2lvbnM6IElMb2NhbFN5bmNFeHRlbnNpb25bXSwgcHJldmlvdXNCdWlsdGluRXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSB8IG51bGwpOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdIHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnNTZXQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBidWlsdGluRXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgbG9jYWxFeHRlbnNpb24gb2YgbG9jYWxFeHRlbnNpb25zKSB7XG5cdFx0XHRsb2NhbEV4dGVuc2lvbnNTZXQuYWRkKGxvY2FsRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRpZiAoIWxvY2FsRXh0ZW5zaW9uLmluc3RhbGxlZCkge1xuXHRcdFx0XHRidWlsdGluRXh0ZW5zaW9ucy5wdXNoKGxvY2FsRXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocHJldmlvdXNCdWlsdGluRXh0ZW5zaW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBidWlsdGluRXh0ZW5zaW9uIG9mIHByZXZpb3VzQnVpbHRpbkV4dGVuc2lvbnMpIHtcblx0XHRcdFx0Ly8gQWRkIHByZXZpb3VzIGJ1aWx0aW4gZXh0ZW5zaW9uIGlmIGl0IGRvZXMgbm90IGV4aXN0IGluIGxvY2FsIGV4dGVuc2lvbnNcblx0XHRcdFx0aWYgKCFsb2NhbEV4dGVuc2lvbnNTZXQuaGFzKGJ1aWx0aW5FeHRlbnNpb24uaWQudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdFx0XHRidWlsdGluRXh0ZW5zaW9ucy5wdXNoKGJ1aWx0aW5FeHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBidWlsdGluRXh0ZW5zaW9ucztcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVDb250ZW50KHVyaTogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwodGhpcy5yZW1vdGVSZXNvdXJjZSwgdXJpKVxuXHRcdFx0fHwgdGhpcy5leHRVcmkuaXNFcXVhbCh0aGlzLmJhc2VSZXNvdXJjZSwgdXJpKVxuXHRcdFx0fHwgdGhpcy5leHRVcmkuaXNFcXVhbCh0aGlzLmxvY2FsUmVzb3VyY2UsIHVyaSlcblx0XHRcdHx8IHRoaXMuZXh0VXJpLmlzRXF1YWwodGhpcy5hY2NlcHRlZFJlc291cmNlLCB1cmkpXG5cdFx0KSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5yZXNvbHZlUHJldmlld0NvbnRlbnQodXJpKTtcblx0XHRcdHJldHVybiBjb250ZW50ID8gdGhpcy5zdHJpbmdpZnkoSlNPTi5wYXJzZShjb250ZW50KSwgdHJ1ZSkgOiBjb250ZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgc3RyaW5naWZ5KGV4dGVuc2lvbnM6IElTeW5jRXh0ZW5zaW9uW10sIGZvcm1hdDogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHN0cmluZ2lmeShleHRlbnNpb25zLCBmb3JtYXQpO1xuXHR9XG5cblx0YXN5bmMgaGFzTG9jYWxEYXRhKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB7IGxvY2FsRXh0ZW5zaW9ucyB9ID0gYXdhaXQgdGhpcy5sb2NhbEV4dGVuc2lvbnNQcm92aWRlci5nZXRMb2NhbEV4dGVuc2lvbnModGhpcy5zeW5jUmVzb3VyY2UucHJvZmlsZSk7XG5cdFx0XHRpZiAobG9jYWxFeHRlbnNpb25zLnNvbWUoZSA9PiBlLmluc3RhbGxlZCB8fCBlLmRpc2FibGVkKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0LyogaWdub3JlIGVycm9yICovXG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBMb2NhbEV4dGVuc2lvbnNQcm92aWRlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElJZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSUlnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgZ2V0TG9jYWxFeHRlbnNpb25zKHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHsgbG9jYWxFeHRlbnNpb25zOiBJTG9jYWxTeW5jRXh0ZW5zaW9uW107IGlnbm9yZWRFeHRlbnNpb25zOiBzdHJpbmdbXSB9PiB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKHVuZGVmaW5lZCwgcHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGlnbm9yZWRFeHRlbnNpb25zID0gdGhpcy5pZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldElnbm9yZWRFeHRlbnNpb25zKGluc3RhbGxlZEV4dGVuc2lvbnMpO1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMud2l0aFByb2ZpbGVTY29wZWRTZXJ2aWNlcyhwcm9maWxlLCBhc3luYyAoZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIGV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNhYmxlZEV4dGVuc2lvbnMgPSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXREaXNhYmxlZEV4dGVuc2lvbnMoKTtcblx0XHRcdHJldHVybiBpbnN0YWxsZWRFeHRlbnNpb25zXG5cdFx0XHRcdC5tYXAoZXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0XHRjb25zdCB7IGlkZW50aWZpZXIsIGlzQnVpbHRpbiwgbWFuaWZlc3QsIHByZVJlbGVhc2UsIHBpbm5lZCwgaXNBcHBsaWNhdGlvblNjb3BlZCB9ID0gZXh0ZW5zaW9uO1xuXHRcdFx0XHRcdGNvbnN0IHN5bmNFeHRlbnNpb246IElMb2NhbFN5bmNFeHRlbnNpb24gPSB7IGlkZW50aWZpZXIsIHByZVJlbGVhc2UsIHZlcnNpb246IG1hbmlmZXN0LnZlcnNpb24sIHBpbm5lZDogISFwaW5uZWQgfTtcblx0XHRcdFx0XHRpZiAoaXNBcHBsaWNhdGlvblNjb3BlZCAmJiAhaXNBcHBsaWNhdGlvblNjb3BlZEV4dGVuc2lvbihtYW5pZmVzdCkpIHtcblx0XHRcdFx0XHRcdHN5bmNFeHRlbnNpb24uaXNBcHBsaWNhdGlvblNjb3BlZCA9IGlzQXBwbGljYXRpb25TY29wZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0aGlzLnByb2R1Y3RTZXJ2aWNlLmJ1aWx0SW5FeHRlbnNpb25zRW5hYmxlZFdpdGhBdXRvVXBkYXRlcz8uc29tZShpZCA9PiBpZC50b0xvd2VyQ2FzZSgpID09PSBpZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRcdFx0XHRzeW5jRXh0ZW5zaW9uLmlzQXBwbGljYXRpb25TY29wZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZGlzYWJsZWRFeHRlbnNpb25zLnNvbWUoZGlzYWJsZWRFeHRlbnNpb24gPT4gYXJlU2FtZUV4dGVuc2lvbnMoZGlzYWJsZWRFeHRlbnNpb24sIGlkZW50aWZpZXIpKSkge1xuXHRcdFx0XHRcdFx0c3luY0V4dGVuc2lvbi5kaXNhYmxlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghaXNCdWlsdGluKSB7XG5cdFx0XHRcdFx0XHRzeW5jRXh0ZW5zaW9uLmluc3RhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBrZXlzID0gZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UuZ2V0S2V5c0ZvclN5bmMoeyBpZDogaWRlbnRpZmllci5pZCwgdmVyc2lvbjogbWFuaWZlc3QudmVyc2lvbiB9KTtcblx0XHRcdFx0XHRcdGlmIChrZXlzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvblN0b3JhZ2VTdGF0ZSA9IGV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlLmdldEV4dGVuc2lvblN0YXRlKGV4dGVuc2lvbiwgdHJ1ZSkgfHwge307XG5cdFx0XHRcdFx0XHRcdHN5bmNFeHRlbnNpb24uc3RhdGUgPSBPYmplY3Qua2V5cyhleHRlbnNpb25TdG9yYWdlU3RhdGUpLnJlZHVjZSgoc3RhdGU6IElTdHJpbmdEaWN0aW9uYXJ5PGFueT4sIGtleSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChrZXlzLmluY2x1ZGVzKGtleSkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHN0YXRlW2tleV0gPSBleHRlbnNpb25TdG9yYWdlU3RhdGVba2V5XTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0XHRcdFx0XHR9LCB7fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke2dldFN5bmNSZXNvdXJjZUxvZ0xhYmVsKFN5bmNSZXNvdXJjZS5FeHRlbnNpb25zLCBwcm9maWxlKX06IEVycm9yIHdoaWxlIHBhcnNpbmcgZXh0ZW5zaW9uIHN0YXRlYCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBzeW5jRXh0ZW5zaW9uO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblx0XHRyZXR1cm4geyBsb2NhbEV4dGVuc2lvbnMsIGlnbm9yZWRFeHRlbnNpb25zIH07XG5cdH1cblxuXHRhc3luYyB1cGRhdGVMb2NhbEV4dGVuc2lvbnMoYWRkZWQ6IElTeW5jRXh0ZW5zaW9uW10sIHJlbW92ZWQ6IElFeHRlbnNpb25JZGVudGlmaWVyW10sIHVwZGF0ZWQ6IElTeW5jRXh0ZW5zaW9uW10sIHNraXBwZWRFeHRlbnNpb25zOiBJU3luY0V4dGVuc2lvbltdLCBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTxJU3luY0V4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3Qgc3luY1Jlc291cmNlTG9nTGFiZWwgPSBnZXRTeW5jUmVzb3VyY2VMb2dMYWJlbChTeW5jUmVzb3VyY2UuRXh0ZW5zaW9ucywgcHJvZmlsZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvSW5zdGFsbDogSW5zdGFsbEV4dGVuc2lvbkluZm9bXSA9IFtdO1xuXHRcdGNvbnN0IHN5bmNFeHRlbnNpb25zVG9JbnN0YWxsID0gbmV3IE1hcDxzdHJpbmcsIElTeW5jRXh0ZW5zaW9uPigpO1xuXHRcdGNvbnN0IHJlbW92ZUZyb21Ta2lwcGVkOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdID0gW107XG5cdFx0Y29uc3QgYWRkVG9Ta2lwcGVkOiBJU3luY0V4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKHVuZGVmaW5lZCwgcHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXG5cdFx0Ly8gMS4gU3luYyBleHRlbnNpb25zIHN0YXRlIGZpcnN0IHNvIHRoYXQgdGhlIHN0b3JhZ2UgaXMgZmx1c2hlZCBhbmQgdXBkYXRlZCBpbiBhbGwgb3BlbmVkIHdpbmRvd3Ncblx0XHRpZiAoYWRkZWQubGVuZ3RoIHx8IHVwZGF0ZWQubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCB0aGlzLndpdGhQcm9maWxlU2NvcGVkU2VydmljZXMocHJvZmlsZSwgYXN5bmMgKGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBleHRlbnNpb25TdG9yYWdlU2VydmljZSkgPT4ge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKFsuLi5hZGRlZCwgLi4udXBkYXRlZF0ubWFwKGFzeW5jIGUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbiA9IGluc3RhbGxlZEV4dGVuc2lvbnMuZmluZChpbnN0YWxsZWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaW5zdGFsbGVkLmlkZW50aWZpZXIsIGUuaWRlbnRpZmllcikpO1xuXG5cdFx0XHRcdFx0Ly8gQnVpbHRpbiBFeHRlbnNpb24gU3luYzogRW5hYmxlbWVudCAmIFN0YXRlXG5cdFx0XHRcdFx0aWYgKGluc3RhbGxlZEV4dGVuc2lvbiAmJiBpbnN0YWxsZWRFeHRlbnNpb24uaXNCdWlsdGluKSB7XG5cdFx0XHRcdFx0XHRpZiAoZS5zdGF0ZSAmJiBpbnN0YWxsZWRFeHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiA9PT0gZS52ZXJzaW9uKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uU3RhdGUoZS5zdGF0ZSwgaW5zdGFsbGVkRXh0ZW5zaW9uLCBpbnN0YWxsZWRFeHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiwgZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgaXNEaXNhYmxlZCA9IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmdldERpc2FibGVkRXh0ZW5zaW9ucygpLnNvbWUoZGlzYWJsZWRFeHRlbnNpb24gPT4gYXJlU2FtZUV4dGVuc2lvbnMoZGlzYWJsZWRFeHRlbnNpb24sIGUuaWRlbnRpZmllcikpO1xuXHRcdFx0XHRcdFx0aWYgKGlzRGlzYWJsZWQgIT09ICEhZS5kaXNhYmxlZCkge1xuXHRcdFx0XHRcdFx0XHRpZiAoZS5kaXNhYmxlZCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IERpc2FibGluZyBleHRlbnNpb24uLi5gLCBlLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmRpc2FibGVFeHRlbnNpb24oZS5pZGVudGlmaWVyKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IERpc2FibGVkIGV4dGVuc2lvbmAsIGUuaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogRW5hYmxpbmcgZXh0ZW5zaW9uLi4uYCwgZS5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5lbmFibGVFeHRlbnNpb24oZS5pZGVudGlmaWVyKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IEVuYWJsZWQgZXh0ZW5zaW9uYCwgZS5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmVtb3ZlRnJvbVNraXBwZWQucHVzaChlLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFVzZXIgRXh0ZW5zaW9uIFN5bmM6IEluc3RhbGwvVXBkYXRlLCBFbmFibGVtZW50ICYgU3RhdGVcblx0XHRcdFx0XHRjb25zdCB2ZXJzaW9uID0gZS5waW5uZWQgPyBlLnZlcnNpb24gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gKGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyAuLi5lLmlkZW50aWZpZXIsIHZlcnNpb24sIHByZVJlbGVhc2U6IHZlcnNpb24gPyB1bmRlZmluZWQgOiBlLnByZVJlbGVhc2UgfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXTtcblxuXHRcdFx0XHRcdC8qIFVwZGF0ZSBleHRlbnNpb24gc3RhdGUgb25seSBpZlxuXHRcdFx0XHRcdCAqXHRleHRlbnNpb24gaXMgaW5zdGFsbGVkIGFuZCB2ZXJzaW9uIGlzIHNhbWUgYXMgc3luY2VkIHZlcnNpb24gb3Jcblx0XHRcdFx0XHQgKlx0ZXh0ZW5zaW9uIGlzIG5vdCBpbnN0YWxsZWQgYW5kIGluc3RhbGxhYmxlXG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0aWYgKGUuc3RhdGUgJiZcblx0XHRcdFx0XHRcdChpbnN0YWxsZWRFeHRlbnNpb24gPyBpbnN0YWxsZWRFeHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiA9PT0gZS52ZXJzaW9uIC8qIEluc3RhbGxlZCBhbmQgcmVtb3RlIGhhcyBzYW1lIHZlcnNpb24gKi9cblx0XHRcdFx0XHRcdFx0OiAhIWV4dGVuc2lvbiAvKiBJbnN0YWxsYWJsZSAqLylcblx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uU3RhdGUoZS5zdGF0ZSwgaW5zdGFsbGVkRXh0ZW5zaW9uIHx8IGV4dGVuc2lvbiwgaW5zdGFsbGVkRXh0ZW5zaW9uPy5tYW5pZmVzdC52ZXJzaW9uLCBleHRlbnNpb25TdG9yYWdlU2VydmljZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgaXNEaXNhYmxlZCA9IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmdldERpc2FibGVkRXh0ZW5zaW9ucygpLnNvbWUoZGlzYWJsZWRFeHRlbnNpb24gPT4gYXJlU2FtZUV4dGVuc2lvbnMoZGlzYWJsZWRFeHRlbnNpb24sIGUuaWRlbnRpZmllcikpO1xuXHRcdFx0XHRcdFx0XHRpZiAoaXNEaXNhYmxlZCAhPT0gISFlLmRpc2FibGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGUuZGlzYWJsZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IERpc2FibGluZyBleHRlbnNpb24uLi5gLCBlLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbi52ZXJzaW9uKTtcblx0XHRcdFx0XHRcdFx0XHRcdGF3YWl0IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmRpc2FibGVFeHRlbnNpb24oZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBEaXNhYmxlZCBleHRlbnNpb25gLCBlLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbi52ZXJzaW9uKTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogRW5hYmxpbmcgZXh0ZW5zaW9uLi4uYCwgZS5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24udmVyc2lvbik7XG5cdFx0XHRcdFx0XHRcdFx0XHRhd2FpdCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5lbmFibGVFeHRlbnNpb24oZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBFbmFibGVkIGV4dGVuc2lvbmAsIGUuaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uLnZlcnNpb24pO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGlmICghaW5zdGFsbGVkRXh0ZW5zaW9uIC8vIEluc3RhbGwgaWYgdGhlIGV4dGVuc2lvbiBkb2VzIG5vdCBleGlzdFxuXHRcdFx0XHRcdFx0XHRcdHx8IGluc3RhbGxlZEV4dGVuc2lvbi5wcmVSZWxlYXNlICE9PSBlLnByZVJlbGVhc2UgLy8gSW5zdGFsbCBpZiB0aGUgZXh0ZW5zaW9uIHByZS1yZWxlYXNlIHByZWZlcmVuY2UgaGFzIGNoYW5nZWRcblx0XHRcdFx0XHRcdFx0XHR8fCBpbnN0YWxsZWRFeHRlbnNpb24ucGlubmVkICE9PSBlLnBpbm5lZCAgLy8gSW5zdGFsbCBpZiB0aGUgZXh0ZW5zaW9uIHBpbm5lZCBwcmVmZXJlbmNlIGhhcyBjaGFuZ2VkXG5cdFx0XHRcdFx0XHRcdFx0fHwgKHZlcnNpb24gJiYgaW5zdGFsbGVkRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24gIT09IHZlcnNpb24pICAvLyBJbnN0YWxsIGlmIHRoZSBleHRlbnNpb24gdmVyc2lvbiBoYXMgY2hhbmdlZFxuXHRcdFx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5jYW5JbnN0YWxsKGV4dGVuc2lvbikgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbnNUb0luc3RhbGwucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbiwgb3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGlzTWFjaGluZVNjb3BlZDogZmFsc2UgLyogc2V0IGlzTWFjaGluZVNjb3BlZCB2YWx1ZSB0byBwcmV2ZW50IGluc3RhbGwgYW5kIHN5bmMgZGlhbG9nIGluIHdlYiAqLyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkb25vdEluY2x1ZGVQYWNrQW5kRGVwZW5kZW5jaWVzOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGluc3RhbGxHaXZlblZlcnNpb246IGUucGlubmVkICYmICEhZS52ZXJzaW9uLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHBpbm5lZDogZS5waW5uZWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0aW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiBlLnByZVJlbGVhc2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0cHJlUmVsZWFzZTogZS5wcmVSZWxlYXNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHByb2ZpbGVMb2NhdGlvbjogcHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0aXNBcHBsaWNhdGlvblNjb3BlZDogZS5pc0FwcGxpY2F0aW9uU2NvcGVkLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnRleHQ6IHsgW0VYVEVOU0lPTl9JTlNUQUxMX1NLSVBfV0FMS1RIUk9VR0hfQ09OVEVYVF06IHRydWUsIFtFWFRFTlNJT05fSU5TVEFMTF9TT1VSQ0VfQ09OVEVYVF06IEV4dGVuc2lvbkluc3RhbGxTb3VyY2UuU0VUVElOR1NfU1lOQywgW0VYVEVOU0lPTl9JTlNUQUxMX1NLSVBfUFVCTElTSEVSX1RSVVNUX0NPTlRFWFRdOiB0cnVlIH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRzeW5jRXh0ZW5zaW9uc1RvSW5zdGFsbC5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwgZSk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogU2tpcHBlZCBzeW5jaHJvbml6aW5nIGV4dGVuc2lvbiBiZWNhdXNlIGl0IGNhbm5vdCBiZSBpbnN0YWxsZWQuYCwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHRcdFx0XHRcdGFkZFRvU2tpcHBlZC5wdXNoKGUpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0YWRkVG9Ta2lwcGVkLnB1c2goZSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogU2tpcHBlZCBzeW5jaHJvbml6aW5nIGV4dGVuc2lvbmAsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGFkZFRvU2tpcHBlZC5wdXNoKGUpO1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBTa2lwcGVkIHN5bmNocm9uaXppbmcgZXh0ZW5zaW9uIGJlY2F1c2UgdGhlIGV4dGVuc2lvbiBpcyBub3QgZm91bmQuYCwgZS5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIDIuIE5leHQgdW5pbnN0YWxsIHRoZSByZW1vdmVkIGV4dGVuc2lvbnNcblx0XHRpZiAocmVtb3ZlZC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnNUb1JlbW92ZSA9IGluc3RhbGxlZEV4dGVuc2lvbnMuZmlsdGVyKCh7IGlkZW50aWZpZXIsIGlzQnVpbHRpbiB9KSA9PiAhaXNCdWlsdGluICYmIHJlbW92ZWQuc29tZShyID0+IGFyZVNhbWVFeHRlbnNpb25zKGlkZW50aWZpZXIsIHIpKSk7XG5cdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGV4dGVuc2lvbnNUb1JlbW92ZS5tYXAoYXN5bmMgZXh0ZW5zaW9uVG9SZW1vdmUgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBVbmluc3RhbGxpbmcgbG9jYWwgZXh0ZW5zaW9uLi4uYCwgZXh0ZW5zaW9uVG9SZW1vdmUuaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudW5pbnN0YWxsKGV4dGVuc2lvblRvUmVtb3ZlLCB7IGRvbm90SW5jbHVkZVBhY2s6IHRydWUsIGRvbm90Q2hlY2tEZXBlbmRlbnRzOiB0cnVlLCBwcm9maWxlTG9jYXRpb246IHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlIH0pO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVuaW5zdGFsbGVkIGxvY2FsIGV4dGVuc2lvbi5gLCBleHRlbnNpb25Ub1JlbW92ZS5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0cmVtb3ZlRnJvbVNraXBwZWQucHVzaChleHRlbnNpb25Ub1JlbW92ZS5pZGVudGlmaWVyKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyAzLiBJbnN0YWxsIGV4dGVuc2lvbnMgYXQgdGhlIGVuZFxuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxHYWxsZXJ5RXh0ZW5zaW9ucyhleHRlbnNpb25zVG9JbnN0YWxsKTtcblx0XHRmb3IgKGNvbnN0IHsgaWRlbnRpZmllciwgbG9jYWwsIGVycm9yLCBzb3VyY2UgfSBvZiByZXN1bHRzKSB7XG5cdFx0XHRjb25zdCBnYWxsZXJ5ID0gc291cmNlIGFzIElHYWxsZXJ5RXh0ZW5zaW9uO1xuXHRcdFx0aWYgKGxvY2FsKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogSW5zdGFsbGVkIGV4dGVuc2lvbi5gLCBpZGVudGlmaWVyLmlkLCBnYWxsZXJ5LnZlcnNpb24pO1xuXHRcdFx0XHRyZW1vdmVGcm9tU2tpcHBlZC5wdXNoKGlkZW50aWZpZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZSA9IHN5bmNFeHRlbnNpb25zVG9JbnN0YWxsLmdldChpZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0XHRpZiAoZSkge1xuXHRcdFx0XHRcdGFkZFRvU2tpcHBlZC5wdXNoKGUpO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogU2tpcHBlZCBzeW5jaHJvbml6aW5nIGV4dGVuc2lvbmAsIGdhbGxlcnkuZGlzcGxheU5hbWUgfHwgZ2FsbGVyeS5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IgJiYgW0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuSW5jb21wYXRpYmxlLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkluY29tcGF0aWJsZUFwaSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5JbmNvbXBhdGlibGVUYXJnZXRQbGF0Zm9ybV0uaW5jbHVkZXMoZXJyb3IuY29kZSkpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IFNraXBwZWQgc3luY2hyb25pemluZyBleHRlbnNpb24gYmVjYXVzZSB0aGUgY29tcGF0aWJsZSBleHRlbnNpb24gaXMgbm90IGZvdW5kLmAsIGdhbGxlcnkuZGlzcGxheU5hbWUgfHwgZ2FsbGVyeS5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0fSBlbHNlIGlmIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBuZXdTa2lwcGVkRXh0ZW5zaW9uczogSVN5bmNFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgc2tpcHBlZEV4dGVuc2lvbiBvZiBza2lwcGVkRXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKCFyZW1vdmVGcm9tU2tpcHBlZC5zb21lKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZSwgc2tpcHBlZEV4dGVuc2lvbi5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0bmV3U2tpcHBlZEV4dGVuc2lvbnMucHVzaChza2lwcGVkRXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBza2lwcGVkRXh0ZW5zaW9uIG9mIGFkZFRvU2tpcHBlZCkge1xuXHRcdFx0aWYgKCFuZXdTa2lwcGVkRXh0ZW5zaW9ucy5zb21lKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBza2lwcGVkRXh0ZW5zaW9uLmlkZW50aWZpZXIpKSkge1xuXHRcdFx0XHRuZXdTa2lwcGVkRXh0ZW5zaW9ucy5wdXNoKHNraXBwZWRFeHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbmV3U2tpcHBlZEV4dGVuc2lvbnM7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUV4dGVuc2lvblN0YXRlKHN0YXRlOiBJU3RyaW5nRGljdGlvbmFyeTxhbnk+LCBleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiB8IElHYWxsZXJ5RXh0ZW5zaW9uLCB2ZXJzaW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsIGV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlOiBJRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UpOiB2b2lkIHtcblx0XHRjb25zdCBleHRlbnNpb25TdGF0ZSA9IGV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlLmdldEV4dGVuc2lvblN0YXRlKGV4dGVuc2lvbiwgdHJ1ZSkgfHwge307XG5cdFx0Y29uc3Qga2V5cyA9IHZlcnNpb24gPyBleHRlbnNpb25TdG9yYWdlU2VydmljZS5nZXRLZXlzRm9yU3luYyh7IGlkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgdmVyc2lvbiB9KSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoa2V5cykge1xuXHRcdFx0a2V5cy5mb3JFYWNoKGtleSA9PiB7IGV4dGVuc2lvblN0YXRlW2tleV0gPSBzdGF0ZVtrZXldOyB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0T2JqZWN0LmtleXMoc3RhdGUpLmZvckVhY2goa2V5ID0+IGV4dGVuc2lvblN0YXRlW2tleV0gPSBzdGF0ZVtrZXldKTtcblx0XHR9XG5cdFx0ZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2Uuc2V0RXh0ZW5zaW9uU3RhdGUoZXh0ZW5zaW9uLCBleHRlbnNpb25TdGF0ZSwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdpdGhQcm9maWxlU2NvcGVkU2VydmljZXM8VD4ocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSwgZm46IChleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSUdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBleHRlbnNpb25TdG9yYWdlU2VydmljZTogSUV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2Uud2l0aFByb2ZpbGVTY29wZWRTdG9yYWdlU2VydmljZShwcm9maWxlLFxuXHRcdFx0YXN5bmMgc3RvcmFnZVNlcnZpY2UgPT4ge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2VdKSkpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSkpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25TdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25TdG9yYWdlU2VydmljZSkpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCBmbihleHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdH1cblxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25zSW5pdGlhbGl6ZXJQcmV2aWV3UmVzdWx0IHtcblx0cmVhZG9ubHkgaW5zdGFsbGVkRXh0ZW5zaW9uczogSUxvY2FsRXh0ZW5zaW9uW107XG5cdHJlYWRvbmx5IGRpc2FibGVkRXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXTtcblx0cmVhZG9ubHkgbmV3RXh0ZW5zaW9uczogKElFeHRlbnNpb25JZGVudGlmaWVyICYgeyBwcmVSZWxlYXNlOiBib29sZWFuIH0pW107XG5cdHJlYWRvbmx5IHJlbW90ZUV4dGVuc2lvbnM6IElTeW5jRXh0ZW5zaW9uW107XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdEV4dGVuc2lvbnNJbml0aWFsaXplciBleHRlbmRzIEFic3RyYWN0SW5pdGlhbGl6ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElJZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSUlnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFN5bmNSZXNvdXJjZS5FeHRlbnNpb25zLCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBmaWxlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgcGFyc2VFeHRlbnNpb25zKHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEpOiBQcm9taXNlPElTeW5jRXh0ZW5zaW9uW10gfCBudWxsPiB7XG5cdFx0cmV0dXJuIHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhID8gYXdhaXQgcGFyc2VBbmRNaWdyYXRlRXh0ZW5zaW9ucyhyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSwgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSkgOiBudWxsO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdlbmVyYXRlUHJldmlldyhyZW1vdGVFeHRlbnNpb25zOiBJU3luY0V4dGVuc2lvbltdLCBsb2NhbEV4dGVuc2lvbnM6IElMb2NhbEV4dGVuc2lvbltdKTogSUV4dGVuc2lvbnNJbml0aWFsaXplclByZXZpZXdSZXN1bHQge1xuXHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbnM6IElMb2NhbEV4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgbmV3RXh0ZW5zaW9uczogKElFeHRlbnNpb25JZGVudGlmaWVyICYgeyBwcmVSZWxlYXNlOiBib29sZWFuIH0pW10gPSBbXTtcblx0XHRjb25zdCBkaXNhYmxlZEV4dGVuc2lvbnM6IElFeHRlbnNpb25JZGVudGlmaWVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiByZW1vdGVFeHRlbnNpb25zKSB7XG5cdFx0XHRpZiAodGhpcy5pZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmhhc1RvTmV2ZXJTeW5jRXh0ZW5zaW9uKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSkge1xuXHRcdFx0XHQvLyBTa2lwIGV4dGVuc2lvbiBpZ25vcmVkIHRvIHN5bmNcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbiA9IGxvY2FsRXh0ZW5zaW9ucy5maW5kKGkgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0aWYgKGluc3RhbGxlZEV4dGVuc2lvbikge1xuXHRcdFx0XHRpbnN0YWxsZWRFeHRlbnNpb25zLnB1c2goaW5zdGFsbGVkRXh0ZW5zaW9uKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbi5kaXNhYmxlZCkge1xuXHRcdFx0XHRcdGRpc2FibGVkRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChleHRlbnNpb24uaW5zdGFsbGVkKSB7XG5cdFx0XHRcdG5ld0V4dGVuc2lvbnMucHVzaCh7IC4uLmV4dGVuc2lvbi5pZGVudGlmaWVyLCBwcmVSZWxlYXNlOiAhIWV4dGVuc2lvbi5wcmVSZWxlYXNlIH0pO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLmRpc2FibGVkKSB7XG5cdFx0XHRcdFx0ZGlzYWJsZWRFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IGluc3RhbGxlZEV4dGVuc2lvbnMsIG5ld0V4dGVuc2lvbnMsIGRpc2FibGVkRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucyB9O1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUV4QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLDBCQUEwQiw2QkFBaUYsMEJBQTBCLDhCQUFpRCxrQ0FBa0MsNENBQTRDLGtDQUF3RCx3QkFBd0Isc0RBQXNEO0FBQ25aLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCLGdDQUFnQztBQUNsRSxTQUFTLGVBQXFDLG9DQUFvQztBQUNsRixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUEyQixnQ0FBZ0M7QUFDM0QsU0FBUyxxQkFBcUIsc0JBQXNCLCtCQUE4RTtBQUNsSSxTQUFnRCxhQUFhO0FBQzdELFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsUUFBb0QsZ0NBQXVELHlCQUF5QixnQ0FBZ0MsMkJBQTJCLGNBQWMsNkJBQWtEO0FBQ3hRLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsdUJBQXVCO0FBaUJoQyxlQUFlLDBCQUEwQixVQUFxQiw0QkFBb0Y7QUFDakosUUFBTSxhQUFhLEtBQUssTUFBTSxTQUFTLE9BQU87QUFDOUMsTUFBSSxTQUFTLFlBQVksS0FDckIsU0FBUyxZQUFZLEdBQ3ZCO0FBQ0QsVUFBTSxxQkFBcUIsTUFBTSwyQkFBMkIsYUFBYSxjQUFjLE1BQU0sR0FBRyxPQUFPLE9BQUssRUFBRSxTQUFTO0FBQ3ZILGVBQVcsYUFBYSxZQUFZO0FBRW5DLFVBQUksU0FBUyxZQUFZLEdBQUc7QUFDM0IsWUFBSSxVQUFVLFlBQVksT0FBTztBQUNoQyxvQkFBVSxXQUFXO0FBQUEsUUFDdEI7QUFDQSxlQUFPLFVBQVU7QUFBQSxNQUNsQjtBQUlBLFVBQUksU0FBUyxZQUFZLEdBQUc7QUFDM0IsWUFBSSxrQkFBa0IsTUFBTSxlQUFhLENBQUMsa0JBQWtCLFVBQVUsWUFBWSxVQUFVLFVBQVUsQ0FBQyxHQUFHO0FBQ3pHLG9CQUFVLFlBQVk7QUFBQSxRQUN2QjtBQUFBLE1BQ0Q7QUFBQSxJQUVEO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMsZ0JBQWdCLFVBQXVDO0FBQ3RFLFNBQU8sS0FBSyxNQUFNLFNBQVMsT0FBTztBQUNuQztBQUVPLFNBQVMsVUFBVSxZQUE4QixRQUF5QjtBQUNoRixhQUFXLEtBQUssQ0FBQyxJQUFJLE9BQU87QUFDM0IsUUFBSSxDQUFDLEdBQUcsV0FBVyxRQUFRLEdBQUcsV0FBVyxNQUFNO0FBQzlDLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxHQUFHLFdBQVcsUUFBUSxDQUFDLEdBQUcsV0FBVyxNQUFNO0FBQzlDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxRQUFRLEdBQUcsV0FBVyxJQUFJLEdBQUcsV0FBVyxFQUFFO0FBQUEsRUFDbEQsQ0FBQztBQUNELFNBQU8sU0FBUyxrQkFBa0IsWUFBWSxDQUFDLENBQUMsSUFBSSxLQUFLLFVBQVUsVUFBVTtBQUM5RTtBQUVPLElBQU0seUJBQU4sY0FBcUMscUJBQXNEO0FBQUEsRUFtQmpHLFlBRUMsU0FDQSxZQUNxQixvQkFDUCxhQUNHLGdCQUNVLDBCQUNLLCtCQUNjLDRCQUNRLG9DQUM3QixZQUNGLHNCQUNTLCtCQUNiLGtCQUNPLHlCQUNMLG9CQUNXLCtCQUNRLHNCQUN2QztBQUNELFVBQU0sRUFBRSxjQUFjLGFBQWEsWUFBWSxRQUFRLEdBQUcsWUFBWSxhQUFhLG9CQUFvQixnQkFBZ0IsMEJBQTBCLCtCQUErQiwrQkFBK0Isa0JBQWtCLFlBQVksc0JBQXNCLGtCQUFrQjtBQVh2TztBQUNRO0FBUWQ7QUE1QnpDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBbUIsVUFBa0I7QUFFckMsU0FBaUIsa0JBQXVCLEtBQUssT0FBTyxTQUFTLEtBQUssbUJBQW1CLGlCQUFpQjtBQUN0RyxTQUFpQixlQUFvQixLQUFLLGdCQUFnQixLQUFLLEVBQUUsUUFBUSx1QkFBdUIsV0FBVyxPQUFPLENBQUM7QUFDbkgsU0FBaUIsZ0JBQXFCLEtBQUssZ0JBQWdCLEtBQUssRUFBRSxRQUFRLHVCQUF1QixXQUFXLFFBQVEsQ0FBQztBQUNySCxTQUFpQixpQkFBc0IsS0FBSyxnQkFBZ0IsS0FBSyxFQUFFLFFBQVEsdUJBQXVCLFdBQVcsU0FBUyxDQUFDO0FBQ3ZILFNBQWlCLG1CQUF3QixLQUFLLGdCQUFnQixLQUFLLEVBQUUsUUFBUSx1QkFBdUIsV0FBVyxXQUFXLENBQUM7QUF5QjFILFNBQUssMEJBQTBCLEtBQUsscUJBQXFCLGVBQWUsdUJBQXVCO0FBQy9GLFNBQUs7QUFBQSxNQUNKLE1BQU07QUFBQSxRQUNMLE1BQU0sT0FBTyxLQUFLLDJCQUEyQix5QkFBeUIsT0FBSyxFQUFFLEtBQUssQ0FBQyxFQUFFLE1BQU0sTUFBTSxDQUFDLENBQUMsS0FBSyxFQUFFO0FBQUEsUUFDMUcsTUFBTSxPQUFPLEtBQUssMkJBQTJCLDBCQUEwQixPQUFLLENBQUMsRUFBRSxNQUFNO0FBQUEsUUFDckYsTUFBTSxPQUFPLDhCQUE4QixhQUFhLE9BQUssRUFBRSxhQUFhLEtBQUssQ0FBQyxFQUFFLFNBQUFBLFVBQVMsUUFBUSxNQUFNLEtBQUssYUFBYSxRQUFRLE9BQU9BLFNBQVEsTUFBTSxRQUFRLEtBQUssWUFBVSxPQUFPLFFBQVEsZ0NBQWdDLENBQUMsQ0FBQztBQUFBLFFBQ2xPLHdCQUF3QjtBQUFBLE1BQWlDLEVBQUUsTUFBTSxLQUFLLG1CQUFtQixDQUFDO0FBQUEsSUFBQztBQUFBLEVBQzlGO0FBQUEsRUFFQSxNQUFnQixvQkFBb0IsZ0JBQWlDLGtCQUFrRjtBQUN0SixVQUFNLG1CQUFtQixlQUFlLFdBQVcsTUFBTSwwQkFBMEIsZUFBZSxVQUFVLEtBQUssMEJBQTBCLElBQUk7QUFDL0ksVUFBTSxvQkFBb0Isa0JBQWtCLHFCQUFxQixDQUFDO0FBQ2xFLFVBQU0sb0JBQW9CLGtCQUFrQixxQkFBcUI7QUFDakUsVUFBTSxxQkFBcUIsa0JBQWtCLFdBQVcsTUFBTSwwQkFBMEIsaUJBQWlCLFVBQVUsS0FBSywwQkFBMEIsSUFBSTtBQUV0SixVQUFNLEVBQUUsaUJBQWlCLGtCQUFrQixJQUFJLE1BQU0sS0FBSyx3QkFBd0IsbUJBQW1CLEtBQUssYUFBYSxPQUFPO0FBRTlILFFBQUksa0JBQWtCO0FBQ3JCLFdBQUssV0FBVyxNQUFNLEdBQUcsS0FBSyxvQkFBb0Isc0RBQXNEO0FBQUEsSUFDekcsT0FBTztBQUNOLFdBQUssV0FBVyxNQUFNLEdBQUcsS0FBSyxvQkFBb0Isa0ZBQWtGO0FBQUEsSUFDckk7QUFFQSxVQUFNLEVBQUUsT0FBTyxPQUFPLElBQUksTUFBTSxpQkFBaUIsa0JBQWtCLG9CQUFvQixtQkFBbUIsbUJBQW1CLGlCQUFpQjtBQUM5SSxVQUFNLGdCQUErQztBQUFBLE1BQ3BEO0FBQUEsTUFBTztBQUFBLE1BQ1AsU0FBUyxLQUFLLGtCQUFrQixpQkFBaUIsTUFBTSxPQUFPLE1BQU0sU0FBUyxNQUFNLE9BQU87QUFBQSxNQUMxRixhQUFhLE1BQU0sTUFBTSxTQUFTLEtBQUssTUFBTSxRQUFRLFNBQVMsS0FBSyxNQUFNLFFBQVEsU0FBUyxJQUFJLE9BQU8sV0FBVyxPQUFPO0FBQUEsTUFDdkgsY0FBYyxXQUFXLE9BQU8sT0FBTyxXQUFXLE9BQU87QUFBQSxJQUMxRDtBQUVBLFVBQU0sZUFBZSxLQUFLLFVBQVUsaUJBQWlCLEtBQUs7QUFDMUQsV0FBTyxDQUFDO0FBQUEsTUFDUDtBQUFBLE1BQ0E7QUFBQSxNQUNBLGNBQWMsS0FBSztBQUFBLE1BQ25CLGFBQWEscUJBQXFCLEtBQUssVUFBVSxvQkFBb0IsS0FBSyxJQUFJO0FBQUEsTUFDOUUsZUFBZSxLQUFLO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUEsTUFDQSxnQkFBZ0IsS0FBSztBQUFBLE1BQ3JCO0FBQUEsTUFDQSxlQUFlLG1CQUFtQixLQUFLLFVBQVUsa0JBQWtCLEtBQUssSUFBSTtBQUFBLE1BQzVFLGlCQUFpQixLQUFLO0FBQUEsTUFDdEI7QUFBQSxNQUNBLGFBQWEsY0FBYztBQUFBLE1BQzNCLGNBQWMsY0FBYztBQUFBLE1BQzVCLGtCQUFrQixLQUFLO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWdCLGlCQUFpQixrQkFBdUQ7QUFDdkYsVUFBTSxxQkFBOEMsaUJBQWlCLFdBQVcsTUFBTSwwQkFBMEIsaUJBQWlCLFVBQVUsS0FBSywwQkFBMEIsSUFBSTtBQUM5SyxVQUFNLEVBQUUsaUJBQWlCLGtCQUFrQixJQUFJLE1BQU0sS0FBSyx3QkFBd0IsbUJBQW1CLEtBQUssYUFBYSxPQUFPO0FBQzlILFVBQU0sRUFBRSxPQUFPLElBQUksTUFBTSxpQkFBaUIsb0JBQW9CLG9CQUFvQixpQkFBaUIscUJBQXFCLENBQUMsR0FBRyxtQkFBbUIsaUJBQWlCLHFCQUFxQixDQUFDLENBQUM7QUFDdkwsV0FBTyxXQUFXO0FBQUEsRUFDbkI7QUFBQSxFQUVRLGtCQUFrQixpQkFBbUMsT0FBeUIsU0FBMkIsU0FBeUM7QUFDekosVUFBTSxVQUE0QixDQUFDLEdBQUcsT0FBTyxHQUFHLE9BQU87QUFFdkQsVUFBTSxhQUEwQixvQkFBSSxJQUFZO0FBQ2hELFVBQU0sZ0JBQWdCLENBQUMsZUFBcUM7QUFDM0QsaUJBQVcsSUFBSSxXQUFXLEdBQUcsWUFBWSxDQUFDO0FBQzFDLFVBQUksV0FBVyxNQUFNO0FBQ3BCLG1CQUFXLElBQUksV0FBVyxJQUFJO0FBQUEsTUFDL0I7QUFBQSxJQUNEO0FBQ0EsWUFBUSxRQUFRLENBQUMsRUFBRSxXQUFXLE1BQU0sY0FBYyxVQUFVLENBQUM7QUFDN0QsWUFBUSxRQUFRLGFBQWE7QUFFN0IsZUFBVyxrQkFBa0IsaUJBQWlCO0FBQzdDLFVBQUksV0FBVyxJQUFJLGVBQWUsV0FBVyxHQUFHLFlBQVksQ0FBQyxLQUFNLGVBQWUsV0FBVyxRQUFRLFdBQVcsSUFBSSxlQUFlLFdBQVcsSUFBSSxHQUFJO0FBRXJKO0FBQUEsTUFDRDtBQUNBLGNBQVEsS0FBSyxjQUFjO0FBQUEsSUFDNUI7QUFFQSxXQUFPLEtBQUssVUFBVSxTQUFTLEtBQUs7QUFBQSxFQUNyQztBQUFBLEVBRUEsTUFBZ0IsZUFBZSxpQkFBNEMsT0FBaUQ7QUFDM0gsV0FBTyxFQUFFLEdBQUcsZ0JBQWdCLGVBQWUsY0FBYyxNQUFNO0FBQUEsRUFDaEU7QUFBQSxFQUVBLE1BQWdCLGdCQUFnQixpQkFBNEMsVUFBZSxTQUFvQyxPQUFrRTtBQUdoTSxRQUFJLEtBQUssT0FBTyxRQUFRLFVBQVUsS0FBSyxhQUFhLEdBQUc7QUFDdEQsYUFBTyxLQUFLLFlBQVksZUFBZTtBQUFBLElBQ3hDO0FBR0EsUUFBSSxLQUFLLE9BQU8sUUFBUSxVQUFVLEtBQUssY0FBYyxHQUFHO0FBQ3ZELGFBQU8sS0FBSyxhQUFhLGVBQWU7QUFBQSxJQUN6QztBQUdBLFFBQUksS0FBSyxPQUFPLFFBQVEsVUFBVSxLQUFLLGVBQWUsR0FBRztBQUN4RCxhQUFPLGdCQUFnQjtBQUFBLElBQ3hCO0FBRUEsVUFBTSxJQUFJLE1BQU0scUJBQXFCLFNBQVMsU0FBUyxDQUFDLEVBQUU7QUFBQSxFQUMzRDtBQUFBLEVBRUEsTUFBYyxZQUFZLGlCQUFvRjtBQUM3RyxVQUFNLHNCQUFzQixNQUFNLEtBQUssMkJBQTJCLGFBQWEsUUFBVyxLQUFLLGFBQWEsUUFBUSxrQkFBa0I7QUFDdEksVUFBTSxvQkFBb0IsS0FBSyxtQ0FBbUMscUJBQXFCLG1CQUFtQjtBQUMxRyxVQUFNLG1CQUFtQixnQkFBZ0IsZ0JBQWdCLEtBQUssTUFBTSxnQkFBZ0IsYUFBYSxJQUFJO0FBQ3JHLFVBQU0sY0FBYyxNQUFNLGdCQUFnQixpQkFBaUIsa0JBQWtCLGtCQUFrQixnQkFBZ0IsbUJBQW1CLG1CQUFtQixnQkFBZ0IsaUJBQWlCO0FBQ3RMLFVBQU0sRUFBRSxPQUFPLE9BQU8sSUFBSTtBQUMxQixXQUFPO0FBQUEsTUFDTixTQUFTLGdCQUFnQjtBQUFBLE1BQ3pCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsYUFBYSxNQUFNLE1BQU0sU0FBUyxLQUFLLE1BQU0sUUFBUSxTQUFTLEtBQUssTUFBTSxRQUFRLFNBQVMsSUFBSSxPQUFPLFdBQVcsT0FBTztBQUFBLE1BQ3ZILGNBQWMsV0FBVyxPQUFPLE9BQU8sV0FBVyxPQUFPO0FBQUEsSUFDMUQ7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGFBQWEsaUJBQW9GO0FBQzlHLFVBQU0sc0JBQXNCLE1BQU0sS0FBSywyQkFBMkIsYUFBYSxRQUFXLEtBQUssYUFBYSxRQUFRLGtCQUFrQjtBQUN0SSxVQUFNLG9CQUFvQixLQUFLLG1DQUFtQyxxQkFBcUIsbUJBQW1CO0FBQzFHLFVBQU0sbUJBQW1CLGdCQUFnQixnQkFBZ0IsS0FBSyxNQUFNLGdCQUFnQixhQUFhLElBQUk7QUFDckcsUUFBSSxxQkFBcUIsTUFBTTtBQUM5QixZQUFNLGNBQWMsTUFBTSxnQkFBZ0IsaUJBQWlCLGtCQUFrQixnQkFBZ0IsaUJBQWlCLENBQUMsR0FBRyxtQkFBbUIsZ0JBQWdCLGlCQUFpQjtBQUN0SyxZQUFNLEVBQUUsT0FBTyxPQUFPLElBQUk7QUFDMUIsYUFBTztBQUFBLFFBQ04sU0FBUyxnQkFBZ0I7QUFBQSxRQUN6QjtBQUFBLFFBQ0E7QUFBQSxRQUNBLGFBQWEsTUFBTSxNQUFNLFNBQVMsS0FBSyxNQUFNLFFBQVEsU0FBUyxLQUFLLE1BQU0sUUFBUSxTQUFTLElBQUksT0FBTyxXQUFXLE9BQU87QUFBQSxRQUN2SCxjQUFjLFdBQVcsT0FBTyxPQUFPLFdBQVcsT0FBTztBQUFBLE1BQzFEO0FBQUEsSUFDRCxPQUFPO0FBQ04sYUFBTztBQUFBLFFBQ04sU0FBUyxnQkFBZ0I7QUFBQSxRQUN6QixPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsU0FBUyxDQUFDLEdBQUcsU0FBUyxDQUFDLEVBQUU7QUFBQSxRQUM3QyxRQUFRO0FBQUEsUUFDUixhQUFhLE9BQU87QUFBQSxRQUNwQixjQUFjLE9BQU87QUFBQSxNQUN0QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFnQixZQUFZLGdCQUFpQyxrQkFBMEMsa0JBQWdGLE9BQStCO0FBQ3JOLFFBQUksRUFBRSxtQkFBbUIsbUJBQW1CLGdCQUFnQixJQUFJLGlCQUFpQixDQUFDLEVBQUUsQ0FBQztBQUNyRixVQUFNLEVBQUUsT0FBTyxRQUFRLGFBQWEsYUFBYSxJQUFJLGlCQUFpQixDQUFDLEVBQUUsQ0FBQztBQUUxRSxRQUFJLGdCQUFnQixPQUFPLFFBQVEsaUJBQWlCLE9BQU8sTUFBTTtBQUNoRSxXQUFLLFdBQVcsS0FBSyxHQUFHLEtBQUssb0JBQW9CLHFEQUFxRDtBQUFBLElBQ3ZHO0FBRUEsUUFBSSxnQkFBZ0IsT0FBTyxNQUFNO0FBQ2hDLFlBQU0sS0FBSyxZQUFZLEtBQUssVUFBVSxlQUFlLENBQUM7QUFDdEQsMEJBQW9CLE1BQU0sS0FBSyx3QkFBd0Isc0JBQXNCLE1BQU0sT0FBTyxNQUFNLFNBQVMsTUFBTSxTQUFTLG1CQUFtQixLQUFLLGFBQWEsT0FBTztBQUFBLElBQ3JLO0FBRUEsUUFBSSxRQUFRO0FBRVgsV0FBSyxXQUFXLE1BQU0sR0FBRyxLQUFLLG9CQUFvQixpQ0FBaUM7QUFDbkYsWUFBTSxVQUFVLEtBQUssVUFBVSxPQUFPLEdBQUc7QUFDekMsdUJBQWlCLE1BQU0sS0FBSyxxQkFBcUIsU0FBUyxRQUFRLE9BQU8sZUFBZSxHQUFHO0FBQzNGLFdBQUssV0FBVyxLQUFLLEdBQUcsS0FBSyxvQkFBb0IsK0JBQStCLE9BQU8sTUFBTSxTQUFTLFdBQVcsS0FBSyxVQUFVLE9BQU8sTUFBTSxJQUFJLE9BQUssRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxHQUFHLE9BQU8sUUFBUSxTQUFTLGFBQWEsS0FBSyxVQUFVLE9BQU8sUUFBUSxJQUFJLE9BQUssRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxHQUFHLE9BQU8sUUFBUSxTQUFTLGFBQWEsS0FBSyxVQUFVLE9BQU8sUUFBUSxJQUFJLE9BQUssRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO0FBQUEsSUFDbFk7QUFFQSxRQUFJLGtCQUFrQixRQUFRLGVBQWUsS0FBSztBQUVqRCxXQUFLLFdBQVcsTUFBTSxHQUFHLEtBQUssb0JBQW9CLDRDQUE0QztBQUM5RiwwQkFBb0IsS0FBSyx5QkFBeUIsaUJBQWlCLGlCQUFpQjtBQUNwRixZQUFNLEtBQUssdUJBQXVCLGdCQUFnQixFQUFFLG1CQUFtQixrQkFBa0IsQ0FBQztBQUMxRixXQUFLLFdBQVcsS0FBSyxHQUFHLEtBQUssb0JBQW9CLDBDQUEwQyxrQkFBa0IsU0FBUyxhQUFhLEtBQUssVUFBVSxrQkFBa0IsSUFBSSxPQUFLLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtBQUFBLElBQ3pNO0FBQUEsRUFDRDtBQUFBLEVBRVEseUJBQXlCLGlCQUF3QywyQkFBa0Y7QUFDMUosVUFBTSxxQkFBcUIsb0JBQUksSUFBWTtBQUMzQyxVQUFNLG9CQUE0QyxDQUFDO0FBQ25ELGVBQVcsa0JBQWtCLGlCQUFpQjtBQUM3Qyx5QkFBbUIsSUFBSSxlQUFlLFdBQVcsR0FBRyxZQUFZLENBQUM7QUFDakUsVUFBSSxDQUFDLGVBQWUsV0FBVztBQUM5QiwwQkFBa0IsS0FBSyxlQUFlLFVBQVU7QUFBQSxNQUNqRDtBQUFBLElBQ0Q7QUFDQSxRQUFJLDJCQUEyQjtBQUM5QixpQkFBVyxvQkFBb0IsMkJBQTJCO0FBRXpELFlBQUksQ0FBQyxtQkFBbUIsSUFBSSxpQkFBaUIsR0FBRyxZQUFZLENBQUMsR0FBRztBQUMvRCw0QkFBa0IsS0FBSyxnQkFBZ0I7QUFBQSxRQUN4QztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sZUFBZSxLQUFrQztBQUN0RCxRQUFJLEtBQUssT0FBTyxRQUFRLEtBQUssZ0JBQWdCLEdBQUcsS0FDNUMsS0FBSyxPQUFPLFFBQVEsS0FBSyxjQUFjLEdBQUcsS0FDMUMsS0FBSyxPQUFPLFFBQVEsS0FBSyxlQUFlLEdBQUcsS0FDM0MsS0FBSyxPQUFPLFFBQVEsS0FBSyxrQkFBa0IsR0FBRyxHQUNoRDtBQUNELFlBQU0sVUFBVSxNQUFNLEtBQUssc0JBQXNCLEdBQUc7QUFDcEQsYUFBTyxVQUFVLEtBQUssVUFBVSxLQUFLLE1BQU0sT0FBTyxHQUFHLElBQUksSUFBSTtBQUFBLElBQzlEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLFVBQVUsWUFBOEIsUUFBeUI7QUFDeEUsV0FBTyxVQUFVLFlBQVksTUFBTTtBQUFBLEVBQ3BDO0FBQUEsRUFFQSxNQUFNLGVBQWlDO0FBQ3RDLFFBQUk7QUFDSCxZQUFNLEVBQUUsZ0JBQWdCLElBQUksTUFBTSxLQUFLLHdCQUF3QixtQkFBbUIsS0FBSyxhQUFhLE9BQU87QUFDM0csVUFBSSxnQkFBZ0IsS0FBSyxPQUFLLEVBQUUsYUFBYSxFQUFFLFFBQVEsR0FBRztBQUN6RCxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsU0FBUyxPQUFPO0FBQUEsSUFFaEI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUVEO0FBeFFhLHlCQUFOO0FBQUEsRUF1Qko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBckNVO0FBMFFOLElBQU0sMEJBQU4sTUFBOEI7QUFBQSxFQUVwQyxZQUMrQyw0QkFDRywrQkFDTix5QkFDVyxvQ0FDZCxzQkFDRSxZQUNSLGdCQUNqQztBQVA2QztBQUNHO0FBQ047QUFDVztBQUNkO0FBQ0U7QUFDUjtBQUFBLEVBQy9CO0FBQUEsRUFFSixNQUFNLG1CQUFtQixTQUE2RztBQUNySSxVQUFNLHNCQUFzQixNQUFNLEtBQUssMkJBQTJCLGFBQWEsUUFBVyxRQUFRLGtCQUFrQjtBQUNwSCxVQUFNLG9CQUFvQixLQUFLLG1DQUFtQyxxQkFBcUIsbUJBQW1CO0FBQzFHLFVBQU0sa0JBQWtCLE1BQU0sS0FBSywwQkFBMEIsU0FBUyxPQUFPLDRCQUE0Qiw0QkFBNEI7QUFDcEksWUFBTSxxQkFBcUIsMkJBQTJCLHNCQUFzQjtBQUM1RSxhQUFPLG9CQUNMLElBQUksZUFBYTtBQUNqQixjQUFNLEVBQUUsWUFBWSxXQUFXLFVBQVUsWUFBWSxRQUFRLG9CQUFvQixJQUFJO0FBQ3JGLGNBQU0sZ0JBQXFDLEVBQUUsWUFBWSxZQUFZLFNBQVMsU0FBUyxTQUFTLFFBQVEsQ0FBQyxDQUFDLE9BQU87QUFDakgsWUFBSSx1QkFBdUIsQ0FBQyw2QkFBNkIsUUFBUSxHQUFHO0FBQ25FLHdCQUFjLHNCQUFzQjtBQUFBLFFBQ3JDO0FBQ0EsWUFBSSxLQUFLLGVBQWUseUNBQXlDLEtBQUssUUFBTSxHQUFHLFlBQVksTUFBTSxXQUFXLEdBQUcsWUFBWSxDQUFDLEdBQUc7QUFDOUgsd0JBQWMsc0JBQXNCO0FBQUEsUUFDckM7QUFDQSxZQUFJLG1CQUFtQixLQUFLLHVCQUFxQixrQkFBa0IsbUJBQW1CLFVBQVUsQ0FBQyxHQUFHO0FBQ25HLHdCQUFjLFdBQVc7QUFBQSxRQUMxQjtBQUNBLFlBQUksQ0FBQyxXQUFXO0FBQ2Ysd0JBQWMsWUFBWTtBQUFBLFFBQzNCO0FBQ0EsWUFBSTtBQUNILGdCQUFNLE9BQU8sd0JBQXdCLGVBQWUsRUFBRSxJQUFJLFdBQVcsSUFBSSxTQUFTLFNBQVMsUUFBUSxDQUFDO0FBQ3BHLGNBQUksTUFBTTtBQUNULGtCQUFNLHdCQUF3Qix3QkFBd0Isa0JBQWtCLFdBQVcsSUFBSSxLQUFLLENBQUM7QUFDN0YsMEJBQWMsUUFBUSxPQUFPLEtBQUsscUJBQXFCLEVBQUUsT0FBTyxDQUFDLE9BQStCLFFBQVE7QUFDdkcsa0JBQUksS0FBSyxTQUFTLEdBQUcsR0FBRztBQUN2QixzQkFBTSxHQUFHLElBQUksc0JBQXNCLEdBQUc7QUFBQSxjQUN2QztBQUNBLHFCQUFPO0FBQUEsWUFDUixHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ047QUFBQSxRQUNELFNBQVMsT0FBTztBQUNmLGVBQUssV0FBVyxLQUFLLEdBQUcsd0JBQXdCLGFBQWEsWUFBWSxPQUFPLENBQUMseUNBQXlDLGdCQUFnQixLQUFLLENBQUM7QUFBQSxRQUNqSjtBQUNBLGVBQU87QUFBQSxNQUNSLENBQUM7QUFBQSxJQUNILENBQUM7QUFDRCxXQUFPLEVBQUUsaUJBQWlCLGtCQUFrQjtBQUFBLEVBQzdDO0FBQUEsRUFFQSxNQUFNLHNCQUFzQixPQUF5QixTQUFpQyxTQUEyQixtQkFBcUMsU0FBc0Q7QUFDM00sVUFBTSx1QkFBdUIsd0JBQXdCLGFBQWEsWUFBWSxPQUFPO0FBQ3JGLFVBQU0sc0JBQThDLENBQUM7QUFDckQsVUFBTSwwQkFBMEIsb0JBQUksSUFBNEI7QUFDaEUsVUFBTSxvQkFBNEMsQ0FBQztBQUNuRCxVQUFNLGVBQWlDLENBQUM7QUFDeEMsVUFBTSxzQkFBc0IsTUFBTSxLQUFLLDJCQUEyQixhQUFhLFFBQVcsUUFBUSxrQkFBa0I7QUFHcEgsUUFBSSxNQUFNLFVBQVUsUUFBUSxRQUFRO0FBQ25DLFlBQU0sS0FBSywwQkFBMEIsU0FBUyxPQUFPLDRCQUE0Qiw0QkFBNEI7QUFDNUcsY0FBTSxTQUFTLFFBQVEsQ0FBQyxHQUFHLE9BQU8sR0FBRyxPQUFPLEVBQUUsSUFBSSxPQUFNLE1BQUs7QUFDNUQsZ0JBQU0scUJBQXFCLG9CQUFvQixLQUFLLGVBQWEsa0JBQWtCLFVBQVUsWUFBWSxFQUFFLFVBQVUsQ0FBQztBQUd0SCxjQUFJLHNCQUFzQixtQkFBbUIsV0FBVztBQUN2RCxnQkFBSSxFQUFFLFNBQVMsbUJBQW1CLFNBQVMsWUFBWSxFQUFFLFNBQVM7QUFDakUsbUJBQUsscUJBQXFCLEVBQUUsT0FBTyxvQkFBb0IsbUJBQW1CLFNBQVMsU0FBUyx1QkFBdUI7QUFBQSxZQUNwSDtBQUNBLGtCQUFNLGFBQWEsMkJBQTJCLHNCQUFzQixFQUFFLEtBQUssdUJBQXFCLGtCQUFrQixtQkFBbUIsRUFBRSxVQUFVLENBQUM7QUFDbEosZ0JBQUksZUFBZSxDQUFDLENBQUMsRUFBRSxVQUFVO0FBQ2hDLGtCQUFJLEVBQUUsVUFBVTtBQUNmLHFCQUFLLFdBQVcsTUFBTSxHQUFHLG9CQUFvQiw0QkFBNEIsRUFBRSxXQUFXLEVBQUU7QUFDeEYsc0JBQU0sMkJBQTJCLGlCQUFpQixFQUFFLFVBQVU7QUFDOUQscUJBQUssV0FBVyxLQUFLLEdBQUcsb0JBQW9CLHdCQUF3QixFQUFFLFdBQVcsRUFBRTtBQUFBLGNBQ3BGLE9BQU87QUFDTixxQkFBSyxXQUFXLE1BQU0sR0FBRyxvQkFBb0IsMkJBQTJCLEVBQUUsV0FBVyxFQUFFO0FBQ3ZGLHNCQUFNLDJCQUEyQixnQkFBZ0IsRUFBRSxVQUFVO0FBQzdELHFCQUFLLFdBQVcsS0FBSyxHQUFHLG9CQUFvQix1QkFBdUIsRUFBRSxXQUFXLEVBQUU7QUFBQSxjQUNuRjtBQUFBLFlBQ0Q7QUFDQSw4QkFBa0IsS0FBSyxFQUFFLFVBQVU7QUFDbkM7QUFBQSxVQUNEO0FBR0EsZ0JBQU0sVUFBVSxFQUFFLFNBQVMsRUFBRSxVQUFVO0FBQ3ZDLGdCQUFNLGFBQWEsTUFBTSxLQUFLLHdCQUF3QixjQUFjLENBQUMsRUFBRSxHQUFHLEVBQUUsWUFBWSxTQUFTLFlBQVksVUFBVSxTQUFZLEVBQUUsV0FBVyxDQUFDLEdBQUcsa0JBQWtCLElBQUksR0FBRyxDQUFDO0FBTTlLLGNBQUksRUFBRSxVQUNKLHFCQUFxQixtQkFBbUIsU0FBUyxZQUFZLEVBQUUsVUFDN0QsQ0FBQyxDQUFDLFlBQ0o7QUFDRCxpQkFBSyxxQkFBcUIsRUFBRSxPQUFPLHNCQUFzQixXQUFXLG9CQUFvQixTQUFTLFNBQVMsdUJBQXVCO0FBQUEsVUFDbEk7QUFFQSxjQUFJLFdBQVc7QUFDZCxnQkFBSTtBQUNILG9CQUFNLGFBQWEsMkJBQTJCLHNCQUFzQixFQUFFLEtBQUssdUJBQXFCLGtCQUFrQixtQkFBbUIsRUFBRSxVQUFVLENBQUM7QUFDbEosa0JBQUksZUFBZSxDQUFDLENBQUMsRUFBRSxVQUFVO0FBQ2hDLG9CQUFJLEVBQUUsVUFBVTtBQUNmLHVCQUFLLFdBQVcsTUFBTSxHQUFHLG9CQUFvQiw0QkFBNEIsRUFBRSxXQUFXLElBQUksVUFBVSxPQUFPO0FBQzNHLHdCQUFNLDJCQUEyQixpQkFBaUIsVUFBVSxVQUFVO0FBQ3RFLHVCQUFLLFdBQVcsS0FBSyxHQUFHLG9CQUFvQix3QkFBd0IsRUFBRSxXQUFXLElBQUksVUFBVSxPQUFPO0FBQUEsZ0JBQ3ZHLE9BQU87QUFDTix1QkFBSyxXQUFXLE1BQU0sR0FBRyxvQkFBb0IsMkJBQTJCLEVBQUUsV0FBVyxJQUFJLFVBQVUsT0FBTztBQUMxRyx3QkFBTSwyQkFBMkIsZ0JBQWdCLFVBQVUsVUFBVTtBQUNyRSx1QkFBSyxXQUFXLEtBQUssR0FBRyxvQkFBb0IsdUJBQXVCLEVBQUUsV0FBVyxJQUFJLFVBQVUsT0FBTztBQUFBLGdCQUN0RztBQUFBLGNBQ0Q7QUFFQSxrQkFBSSxDQUFDLHNCQUNELG1CQUFtQixlQUFlLEVBQUUsY0FDcEMsbUJBQW1CLFdBQVcsRUFBRSxVQUMvQixXQUFXLG1CQUFtQixTQUFTLFlBQVksU0FDdEQ7QUFDRCxvQkFBSSxNQUFNLEtBQUssMkJBQTJCLFdBQVcsU0FBUyxNQUFNLE1BQU07QUFDekUsc0NBQW9CLEtBQUs7QUFBQSxvQkFDeEI7QUFBQSxvQkFBVyxTQUFTO0FBQUEsc0JBQ25CLGlCQUFpQjtBQUFBLHNCQUNqQixpQ0FBaUM7QUFBQSxzQkFDakMscUJBQXFCLEVBQUUsVUFBVSxDQUFDLENBQUMsRUFBRTtBQUFBLHNCQUNyQyxRQUFRLEVBQUU7QUFBQSxzQkFDViwwQkFBMEIsRUFBRTtBQUFBLHNCQUM1QixZQUFZLEVBQUU7QUFBQSxzQkFDZCxpQkFBaUIsUUFBUTtBQUFBLHNCQUN6QixxQkFBcUIsRUFBRTtBQUFBLHNCQUN2QixTQUFTLEVBQUUsQ0FBQywwQ0FBMEMsR0FBRyxNQUFNLENBQUMsZ0NBQWdDLEdBQUcsdUJBQXVCLGVBQWUsQ0FBQyw4Q0FBOEMsR0FBRyxLQUFLO0FBQUEsb0JBQ2pNO0FBQUEsa0JBQ0QsQ0FBQztBQUNELDBDQUF3QixJQUFJLFVBQVUsV0FBVyxHQUFHLFlBQVksR0FBRyxDQUFDO0FBQUEsZ0JBQ3JFLE9BQU87QUFDTix1QkFBSyxXQUFXLEtBQUssR0FBRyxvQkFBb0IscUVBQXFFLFVBQVUsZUFBZSxVQUFVLFdBQVcsRUFBRTtBQUNqSywrQkFBYSxLQUFLLENBQUM7QUFBQSxnQkFDcEI7QUFBQSxjQUNEO0FBQUEsWUFDRCxTQUFTLE9BQU87QUFDZiwyQkFBYSxLQUFLLENBQUM7QUFDbkIsbUJBQUssV0FBVyxNQUFNLEtBQUs7QUFDM0IsbUJBQUssV0FBVyxLQUFLLEdBQUcsb0JBQW9CLHFDQUFxQyxVQUFVLGVBQWUsVUFBVSxXQUFXLEVBQUU7QUFBQSxZQUNsSTtBQUFBLFVBQ0QsT0FBTztBQUNOLHlCQUFhLEtBQUssQ0FBQztBQUNuQixpQkFBSyxXQUFXLEtBQUssR0FBRyxvQkFBb0IseUVBQXlFLEVBQUUsV0FBVyxFQUFFO0FBQUEsVUFDckk7QUFBQSxRQUNELENBQUMsQ0FBQztBQUFBLE1BQ0gsQ0FBQztBQUFBLElBQ0Y7QUFHQSxRQUFJLFFBQVEsUUFBUTtBQUNuQixZQUFNLHFCQUFxQixvQkFBb0IsT0FBTyxDQUFDLEVBQUUsWUFBWSxVQUFVLE1BQU0sQ0FBQyxhQUFhLFFBQVEsS0FBSyxPQUFLLGtCQUFrQixZQUFZLENBQUMsQ0FBQyxDQUFDO0FBQ3RKLFlBQU0sU0FBUyxRQUFRLG1CQUFtQixJQUFJLE9BQU0sc0JBQXFCO0FBQ3hFLGFBQUssV0FBVyxNQUFNLEdBQUcsb0JBQW9CLHFDQUFxQyxrQkFBa0IsV0FBVyxFQUFFO0FBQ2pILGNBQU0sS0FBSywyQkFBMkIsVUFBVSxtQkFBbUIsRUFBRSxrQkFBa0IsTUFBTSxzQkFBc0IsTUFBTSxpQkFBaUIsUUFBUSxtQkFBbUIsQ0FBQztBQUN0SyxhQUFLLFdBQVcsS0FBSyxHQUFHLG9CQUFvQixrQ0FBa0Msa0JBQWtCLFdBQVcsRUFBRTtBQUM3RywwQkFBa0IsS0FBSyxrQkFBa0IsVUFBVTtBQUFBLE1BQ3BELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFHQSxVQUFNLFVBQVUsTUFBTSxLQUFLLDJCQUEyQix5QkFBeUIsbUJBQW1CO0FBQ2xHLGVBQVcsRUFBRSxZQUFZLE9BQU8sT0FBTyxPQUFPLEtBQUssU0FBUztBQUMzRCxZQUFNLFVBQVU7QUFDaEIsVUFBSSxPQUFPO0FBQ1YsYUFBSyxXQUFXLEtBQUssR0FBRyxvQkFBb0IsMEJBQTBCLFdBQVcsSUFBSSxRQUFRLE9BQU87QUFDcEcsMEJBQWtCLEtBQUssVUFBVTtBQUFBLE1BQ2xDLE9BQU87QUFDTixjQUFNLElBQUksd0JBQXdCLElBQUksV0FBVyxHQUFHLFlBQVksQ0FBQztBQUNqRSxZQUFJLEdBQUc7QUFDTix1QkFBYSxLQUFLLENBQUM7QUFDbkIsZUFBSyxXQUFXLEtBQUssR0FBRyxvQkFBb0IscUNBQXFDLFFBQVEsZUFBZSxRQUFRLFdBQVcsRUFBRTtBQUFBLFFBQzlIO0FBQ0EsWUFBSSxpQkFBaUIsNEJBQTRCLENBQUMsNkJBQTZCLGNBQWMsNkJBQTZCLGlCQUFpQiw2QkFBNkIsMEJBQTBCLEVBQUUsU0FBUyxNQUFNLElBQUksR0FBRztBQUN6TixlQUFLLFdBQVcsS0FBSyxHQUFHLG9CQUFvQixvRkFBb0YsUUFBUSxlQUFlLFFBQVEsV0FBVyxFQUFFO0FBQUEsUUFDN0ssV0FBVyxPQUFPO0FBQ2pCLGVBQUssV0FBVyxNQUFNLEtBQUs7QUFBQSxRQUM1QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSx1QkFBeUMsQ0FBQztBQUNoRCxlQUFXLG9CQUFvQixtQkFBbUI7QUFDakQsVUFBSSxDQUFDLGtCQUFrQixLQUFLLE9BQUssa0JBQWtCLEdBQUcsaUJBQWlCLFVBQVUsQ0FBQyxHQUFHO0FBQ3BGLDZCQUFxQixLQUFLLGdCQUFnQjtBQUFBLE1BQzNDO0FBQUEsSUFDRDtBQUNBLGVBQVcsb0JBQW9CLGNBQWM7QUFDNUMsVUFBSSxDQUFDLHFCQUFxQixLQUFLLE9BQUssa0JBQWtCLEVBQUUsWUFBWSxpQkFBaUIsVUFBVSxDQUFDLEdBQUc7QUFDbEcsNkJBQXFCLEtBQUssZ0JBQWdCO0FBQUEsTUFDM0M7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHFCQUFxQixPQUErQixXQUFnRCxTQUE2Qix5QkFBeUQ7QUFDak0sVUFBTSxpQkFBaUIsd0JBQXdCLGtCQUFrQixXQUFXLElBQUksS0FBSyxDQUFDO0FBQ3RGLFVBQU0sT0FBTyxVQUFVLHdCQUF3QixlQUFlLEVBQUUsSUFBSSxVQUFVLFdBQVcsSUFBSSxRQUFRLENBQUMsSUFBSTtBQUMxRyxRQUFJLE1BQU07QUFDVCxXQUFLLFFBQVEsU0FBTztBQUFFLHVCQUFlLEdBQUcsSUFBSSxNQUFNLEdBQUc7QUFBQSxNQUFHLENBQUM7QUFBQSxJQUMxRCxPQUFPO0FBQ04sYUFBTyxLQUFLLEtBQUssRUFBRSxRQUFRLFNBQU8sZUFBZSxHQUFHLElBQUksTUFBTSxHQUFHLENBQUM7QUFBQSxJQUNuRTtBQUNBLDRCQUF3QixrQkFBa0IsV0FBVyxnQkFBZ0IsSUFBSTtBQUFBLEVBQzFFO0FBQUEsRUFFQSxNQUFjLDBCQUE2QixTQUEyQixJQUFrSjtBQUN2TixXQUFPLEtBQUssOEJBQThCO0FBQUEsTUFBZ0M7QUFBQSxNQUN6RSxPQUFNLG1CQUFrQjtBQUN2QixjQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsY0FBTSx1QkFBdUIsWUFBWSxJQUFJLEtBQUsscUJBQXFCLFlBQVksSUFBSSxrQkFBa0IsQ0FBQyxpQkFBaUIsY0FBYyxDQUFDLENBQUMsQ0FBQztBQUM1SSxjQUFNLDZCQUE2QixZQUFZLElBQUkscUJBQXFCLGVBQWUsZ0NBQWdDLENBQUM7QUFDeEgsY0FBTSwwQkFBMEIsWUFBWSxJQUFJLHFCQUFxQixlQUFlLHVCQUF1QixDQUFDO0FBQzVHLFlBQUk7QUFDSCxpQkFBTyxNQUFNLEdBQUcsNEJBQTRCLHVCQUF1QjtBQUFBLFFBQ3BFLFVBQUU7QUFDRCxzQkFBWSxRQUFRO0FBQUEsUUFDckI7QUFBQSxNQUNEO0FBQUEsSUFBQztBQUFBLEVBQ0g7QUFFRDtBQXBPYSwwQkFBTjtBQUFBLEVBR0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRVO0FBNk9OLElBQWUsZ0NBQWYsY0FBcUQsb0JBQW9CO0FBQUEsRUFFL0UsWUFDaUQsNEJBQ00sb0NBQ3hDLGFBQ1kseUJBQ0wsb0JBQ1IsWUFDSSxnQkFDSSxvQkFDcEI7QUFDRCxVQUFNLGFBQWEsWUFBWSx5QkFBeUIsb0JBQW9CLFlBQVksYUFBYSxnQkFBZ0Isa0JBQWtCO0FBVHZGO0FBQ007QUFBQSxFQVN2RDtBQUFBLEVBRUEsTUFBZ0IsZ0JBQWdCLGdCQUFtRTtBQUNsRyxXQUFPLGVBQWUsV0FBVyxNQUFNLDBCQUEwQixlQUFlLFVBQVUsS0FBSywwQkFBMEIsSUFBSTtBQUFBLEVBQzlIO0FBQUEsRUFFVSxnQkFBZ0Isa0JBQW9DLGlCQUF5RTtBQUN0SSxVQUFNLHNCQUF5QyxDQUFDO0FBQ2hELFVBQU0sZ0JBQW9FLENBQUM7QUFDM0UsVUFBTSxxQkFBNkMsQ0FBQztBQUNwRCxlQUFXLGFBQWEsa0JBQWtCO0FBQ3pDLFVBQUksS0FBSyxtQ0FBbUMsd0JBQXdCLFVBQVUsV0FBVyxFQUFFLEdBQUc7QUFFN0Y7QUFBQSxNQUNEO0FBRUEsWUFBTSxxQkFBcUIsZ0JBQWdCLEtBQUssT0FBSyxrQkFBa0IsRUFBRSxZQUFZLFVBQVUsVUFBVSxDQUFDO0FBQzFHLFVBQUksb0JBQW9CO0FBQ3ZCLDRCQUFvQixLQUFLLGtCQUFrQjtBQUMzQyxZQUFJLFVBQVUsVUFBVTtBQUN2Qiw2QkFBbUIsS0FBSyxVQUFVLFVBQVU7QUFBQSxRQUM3QztBQUFBLE1BQ0QsV0FBVyxVQUFVLFdBQVc7QUFDL0Isc0JBQWMsS0FBSyxFQUFFLEdBQUcsVUFBVSxZQUFZLFlBQVksQ0FBQyxDQUFDLFVBQVUsV0FBVyxDQUFDO0FBQ2xGLFlBQUksVUFBVSxVQUFVO0FBQ3ZCLDZCQUFtQixLQUFLLFVBQVUsVUFBVTtBQUFBLFFBQzdDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPLEVBQUUscUJBQXFCLGVBQWUsb0JBQW9CLGlCQUFpQjtBQUFBLEVBQ25GO0FBRUQ7QUE3Q3NCLGdDQUFmO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVZtQjsiLAogICJuYW1lcyI6IFsicHJvZmlsZSJdCn0K
