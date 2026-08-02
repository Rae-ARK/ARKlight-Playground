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
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { AbstractExtensionsInitializer } from "../../../../platform/userDataSync/common/extensionsSync.js";
import { GlobalStateInitializer, UserDataSyncStoreTypeSynchronizer } from "../../../../platform/userDataSync/common/globalStateSync.js";
import { KeybindingsInitializer } from "../../../../platform/userDataSync/common/keybindingsSync.js";
import { SettingsInitializer } from "../../../../platform/userDataSync/common/settingsSync.js";
import { SnippetsInitializer } from "../../../../platform/userDataSync/common/snippetsSync.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { UserDataSyncStoreClient } from "../../../../platform/userDataSync/common/userDataSyncStoreService.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IRequestService } from "../../../../platform/request/common/request.js";
import { IUserDataSyncLogService, IUserDataSyncStoreManagementService, SyncResource } from "../../../../platform/userDataSync/common/userDataSync.js";
import { getCurrentAuthenticationSessionInfo } from "../../authentication/browser/authenticationService.js";
import { getSyncAreaLabel } from "../common/userDataSync.js";
import { isWeb } from "../../../../base/common/platform.js";
import { Barrier, Promises } from "../../../../base/common/async.js";
import { EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT, IExtensionGalleryService, IExtensionManagementService, IGlobalExtensionEnablementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IExtensionService, toExtensionDescription } from "../../extensions/common/extensions.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { IIgnoredExtensionsManagementService } from "../../../../platform/userDataSync/common/ignoredExtensions.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../base/common/resources.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IExtensionStorageService } from "../../../../platform/extensionManagement/common/extensionStorage.js";
import { TasksInitializer } from "../../../../platform/userDataSync/common/tasksSync.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
let UserDataSyncInitializer = class {
  constructor(environmentService, secretStorageService, userDataSyncStoreManagementService, fileService, userDataProfilesService, storageService, productService, requestService, logService, uriIdentityService) {
    this.environmentService = environmentService;
    this.secretStorageService = secretStorageService;
    this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
    this.fileService = fileService;
    this.userDataProfilesService = userDataProfilesService;
    this.storageService = storageService;
    this.productService = productService;
    this.requestService = requestService;
    this.logService = logService;
    this.uriIdentityService = uriIdentityService;
    this.initialized = [];
    this.initializationFinished = new Barrier();
    this.globalStateUserData = null;
    this.createUserDataSyncStoreClient().then((userDataSyncStoreClient) => {
      if (!userDataSyncStoreClient) {
        this.initializationFinished.open();
      }
    });
  }
  createUserDataSyncStoreClient() {
    if (!this._userDataSyncStoreClientPromise) {
      this._userDataSyncStoreClientPromise = (async () => {
        try {
          if (!isWeb) {
            this.logService.trace(`Skipping initializing user data in desktop`);
            return;
          }
          if (!this.storageService.isNew(StorageScope.APPLICATION)) {
            this.logService.trace(`Skipping initializing user data as application was opened before`);
            return;
          }
          if (!this.storageService.isNew(StorageScope.WORKSPACE)) {
            this.logService.trace(`Skipping initializing user data as workspace was opened before`);
            return;
          }
          if (this.environmentService.options?.settingsSyncOptions?.authenticationProvider && !this.environmentService.options.settingsSyncOptions.enabled) {
            this.logService.trace(`Skipping initializing user data as settings sync is disabled`);
            return;
          }
          let authenticationSession;
          try {
            authenticationSession = await getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService);
          } catch (error) {
            this.logService.error(error);
          }
          if (!authenticationSession) {
            this.logService.trace(`Skipping initializing user data as authentication session is not set`);
            return;
          }
          await this.initializeUserDataSyncStore(authenticationSession);
          const userDataSyncStore = this.userDataSyncStoreManagementService.userDataSyncStore;
          if (!userDataSyncStore) {
            this.logService.trace(`Skipping initializing user data as sync service is not provided`);
            return;
          }
          const userDataSyncStoreClient = new UserDataSyncStoreClient(userDataSyncStore.url, this.productService, this.requestService, this.logService, this.environmentService, this.fileService, this.storageService);
          userDataSyncStoreClient.setAuthToken(authenticationSession.accessToken, authenticationSession.providerId);
          const manifest = await userDataSyncStoreClient.manifest(null);
          if (manifest === null) {
            userDataSyncStoreClient.dispose();
            this.logService.trace(`Skipping initializing user data as there is no data`);
            return;
          }
          this.logService.info(`Using settings sync service ${userDataSyncStore.url.toString()} for initialization`);
          return userDataSyncStoreClient;
        } catch (error) {
          this.logService.error(error);
          return;
        }
      })();
    }
    return this._userDataSyncStoreClientPromise;
  }
  async initializeUserDataSyncStore(authenticationSession) {
    const userDataSyncStore = this.userDataSyncStoreManagementService.userDataSyncStore;
    if (!userDataSyncStore?.canSwitch) {
      return;
    }
    const disposables = new DisposableStore();
    try {
      const userDataSyncStoreClient = disposables.add(new UserDataSyncStoreClient(userDataSyncStore.url, this.productService, this.requestService, this.logService, this.environmentService, this.fileService, this.storageService));
      userDataSyncStoreClient.setAuthToken(authenticationSession.accessToken, authenticationSession.providerId);
      this.globalStateUserData = await userDataSyncStoreClient.readResource(SyncResource.GlobalState, null);
      if (this.globalStateUserData) {
        const userDataSyncStoreType = new UserDataSyncStoreTypeSynchronizer(userDataSyncStoreClient, this.storageService, this.environmentService, this.fileService, this.logService).getSyncStoreType(this.globalStateUserData);
        if (userDataSyncStoreType) {
          await this.userDataSyncStoreManagementService.switch(userDataSyncStoreType);
          if (!isEqual(userDataSyncStore.url, this.userDataSyncStoreManagementService.userDataSyncStore?.url)) {
            this.logService.info("Switched settings sync store");
            this.globalStateUserData = null;
          }
        }
      }
    } finally {
      disposables.dispose();
    }
  }
  async whenInitializationFinished() {
    await this.initializationFinished.wait();
  }
  async requiresInitialization() {
    this.logService.trace(`UserDataInitializationService#requiresInitialization`);
    const userDataSyncStoreClient = await this.createUserDataSyncStoreClient();
    return !!userDataSyncStoreClient;
  }
  async initializeRequiredResources() {
    this.logService.trace(`UserDataInitializationService#initializeRequiredResources`);
    return this.initialize([SyncResource.Settings, SyncResource.GlobalState]);
  }
  async initializeOtherResources(instantiationService) {
    try {
      this.logService.trace(`UserDataInitializationService#initializeOtherResources`);
      await Promise.allSettled([this.initialize([SyncResource.Keybindings, SyncResource.Snippets, SyncResource.Tasks]), this.initializeExtensions(instantiationService)]);
    } finally {
      this.initializationFinished.open();
    }
  }
  async initializeExtensions(instantiationService) {
    try {
      await Promise.all([this.initializeInstalledExtensions(instantiationService), this.initializeNewExtensions(instantiationService)]);
    } finally {
      this.initialized.push(SyncResource.Extensions);
    }
  }
  async initializeInstalledExtensions(instantiationService) {
    if (!this.initializeInstalledExtensionsPromise) {
      this.initializeInstalledExtensionsPromise = (async () => {
        this.logService.trace(`UserDataInitializationService#initializeInstalledExtensions`);
        const extensionsPreviewInitializer = await this.getExtensionsPreviewInitializer(instantiationService);
        if (extensionsPreviewInitializer) {
          await instantiationService.createInstance(InstalledExtensionsInitializer, extensionsPreviewInitializer).initialize();
        }
      })();
    }
    return this.initializeInstalledExtensionsPromise;
  }
  async initializeNewExtensions(instantiationService) {
    if (!this.initializeNewExtensionsPromise) {
      this.initializeNewExtensionsPromise = (async () => {
        this.logService.trace(`UserDataInitializationService#initializeNewExtensions`);
        const extensionsPreviewInitializer = await this.getExtensionsPreviewInitializer(instantiationService);
        if (extensionsPreviewInitializer) {
          await instantiationService.createInstance(NewExtensionsInitializer, extensionsPreviewInitializer).initialize();
        }
      })();
    }
    return this.initializeNewExtensionsPromise;
  }
  getExtensionsPreviewInitializer(instantiationService) {
    if (!this.extensionsPreviewInitializerPromise) {
      this.extensionsPreviewInitializerPromise = (async () => {
        const userDataSyncStoreClient = await this.createUserDataSyncStoreClient();
        if (!userDataSyncStoreClient) {
          return null;
        }
        const userData = await userDataSyncStoreClient.readResource(SyncResource.Extensions, null);
        return instantiationService.createInstance(ExtensionsPreviewInitializer, userData);
      })();
    }
    return this.extensionsPreviewInitializerPromise;
  }
  async initialize(syncResources) {
    const userDataSyncStoreClient = await this.createUserDataSyncStoreClient();
    if (!userDataSyncStoreClient) {
      return;
    }
    await Promises.settled(syncResources.map(async (syncResource) => {
      try {
        if (this.initialized.includes(syncResource)) {
          this.logService.info(`${getSyncAreaLabel(syncResource)} initialized already.`);
          return;
        }
        this.initialized.push(syncResource);
        this.logService.trace(`Initializing ${getSyncAreaLabel(syncResource)}`);
        const initializer = this.createSyncResourceInitializer(syncResource);
        const userData = await userDataSyncStoreClient.readResource(syncResource, syncResource === SyncResource.GlobalState ? this.globalStateUserData : null);
        await initializer.initialize(userData);
        this.logService.info(`Initialized ${getSyncAreaLabel(syncResource)}`);
      } catch (error) {
        this.logService.info(`Error while initializing ${getSyncAreaLabel(syncResource)}`);
        this.logService.error(error);
      }
    }));
  }
  createSyncResourceInitializer(syncResource) {
    switch (syncResource) {
      case SyncResource.Settings:
        return new SettingsInitializer(this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.storageService, this.uriIdentityService);
      case SyncResource.Keybindings:
        return new KeybindingsInitializer(this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.storageService, this.uriIdentityService);
      case SyncResource.Tasks:
        return new TasksInitializer(this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.storageService, this.uriIdentityService);
      case SyncResource.Snippets:
        return new SnippetsInitializer(this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.storageService, this.uriIdentityService);
      case SyncResource.GlobalState:
        return new GlobalStateInitializer(this.storageService, this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.uriIdentityService);
    }
    throw new Error(`Cannot create initializer for ${syncResource}`);
  }
};
UserDataSyncInitializer = __decorateClass([
  __decorateParam(0, IBrowserWorkbenchEnvironmentService),
  __decorateParam(1, ISecretStorageService),
  __decorateParam(2, IUserDataSyncStoreManagementService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IUserDataProfilesService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IRequestService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IUriIdentityService)
], UserDataSyncInitializer);
let ExtensionsPreviewInitializer = class extends AbstractExtensionsInitializer {
  constructor(extensionsData, extensionManagementService, ignoredExtensionsManagementService, fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService) {
    super(extensionManagementService, ignoredExtensionsManagementService, fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService);
    this.extensionsData = extensionsData;
    this.preview = null;
  }
  getPreview() {
    if (!this.previewPromise) {
      this.previewPromise = super.initialize(this.extensionsData).then(() => this.preview);
    }
    return this.previewPromise;
  }
  initialize() {
    throw new Error("should not be called directly");
  }
  async doInitialize(remoteUserData) {
    const remoteExtensions = await this.parseExtensions(remoteUserData);
    if (!remoteExtensions) {
      this.logService.info("Skipping initializing extensions because remote extensions does not exist.");
      return;
    }
    const installedExtensions = await this.extensionManagementService.getInstalled();
    this.preview = this.generatePreview(remoteExtensions, installedExtensions);
  }
};
ExtensionsPreviewInitializer = __decorateClass([
  __decorateParam(1, IExtensionManagementService),
  __decorateParam(2, IIgnoredExtensionsManagementService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IUserDataProfilesService),
  __decorateParam(5, IEnvironmentService),
  __decorateParam(6, IUserDataSyncLogService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IUriIdentityService)
], ExtensionsPreviewInitializer);
let InstalledExtensionsInitializer = class {
  constructor(extensionsPreviewInitializer, extensionEnablementService, extensionStorageService, logService) {
    this.extensionsPreviewInitializer = extensionsPreviewInitializer;
    this.extensionEnablementService = extensionEnablementService;
    this.extensionStorageService = extensionStorageService;
    this.logService = logService;
  }
  async initialize() {
    const preview = await this.extensionsPreviewInitializer.getPreview();
    if (!preview) {
      return;
    }
    for (const installedExtension of preview.installedExtensions) {
      const syncExtension = preview.remoteExtensions.find(({ identifier }) => areSameExtensions(identifier, installedExtension.identifier));
      if (syncExtension?.state) {
        const extensionState = this.extensionStorageService.getExtensionState(installedExtension, true) || {};
        Object.keys(syncExtension.state).forEach((key) => extensionState[key] = syncExtension.state[key]);
        this.extensionStorageService.setExtensionState(installedExtension, extensionState, true);
      }
    }
    if (preview.disabledExtensions.length) {
      for (const identifier of preview.disabledExtensions) {
        this.logService.trace(`Disabling extension...`, identifier.id);
        await this.extensionEnablementService.disableExtension(identifier);
        this.logService.info(`Disabling extension`, identifier.id);
      }
    }
  }
};
InstalledExtensionsInitializer = __decorateClass([
  __decorateParam(1, IGlobalExtensionEnablementService),
  __decorateParam(2, IExtensionStorageService),
  __decorateParam(3, IUserDataSyncLogService)
], InstalledExtensionsInitializer);
let NewExtensionsInitializer = class {
  constructor(extensionsPreviewInitializer, extensionService, extensionStorageService, galleryService, extensionManagementService, logService) {
    this.extensionsPreviewInitializer = extensionsPreviewInitializer;
    this.extensionService = extensionService;
    this.extensionStorageService = extensionStorageService;
    this.galleryService = galleryService;
    this.extensionManagementService = extensionManagementService;
    this.logService = logService;
  }
  async initialize() {
    const preview = await this.extensionsPreviewInitializer.getPreview();
    if (!preview) {
      return;
    }
    const newlyEnabledExtensions = [];
    const targetPlatform = await this.extensionManagementService.getTargetPlatform();
    const galleryExtensions = await this.galleryService.getExtensions(preview.newExtensions, { targetPlatform, compatible: true }, CancellationToken.None);
    for (const galleryExtension of galleryExtensions) {
      try {
        const extensionToSync = preview.remoteExtensions.find(({ identifier }) => areSameExtensions(identifier, galleryExtension.identifier));
        if (!extensionToSync) {
          continue;
        }
        if (extensionToSync.state) {
          this.extensionStorageService.setExtensionState(galleryExtension, extensionToSync.state, true);
        }
        this.logService.trace(`Installing extension...`, galleryExtension.identifier.id);
        const local = await this.extensionManagementService.installFromGallery(galleryExtension, {
          isMachineScoped: false,
          /* set isMachineScoped to prevent install and sync dialog in web */
          donotIncludePackAndDependencies: true,
          installGivenVersion: !!extensionToSync.version,
          installPreReleaseVersion: extensionToSync.preRelease,
          context: { [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true }
        });
        if (!preview.disabledExtensions.some((identifier) => areSameExtensions(identifier, galleryExtension.identifier))) {
          newlyEnabledExtensions.push(local);
        }
        this.logService.info(`Installed extension.`, galleryExtension.identifier.id);
      } catch (error) {
        this.logService.error(error);
      }
    }
    const canEnabledExtensions = newlyEnabledExtensions.filter((e) => this.extensionService.canAddExtension(toExtensionDescription(e)));
    if (!await this.areExtensionsRunning(canEnabledExtensions)) {
      await new Promise((c, e) => {
        const disposable = this.extensionService.onDidChangeExtensions(async () => {
          try {
            if (await this.areExtensionsRunning(canEnabledExtensions)) {
              disposable.dispose();
              c();
            }
          } catch (error) {
            e(error);
          }
        });
      });
    }
  }
  async areExtensionsRunning(extensions) {
    await this.extensionService.whenInstalledExtensionsRegistered();
    const runningExtensions = this.extensionService.extensions;
    return extensions.every((e) => runningExtensions.some((r) => areSameExtensions({ id: r.identifier.value }, e.identifier)));
  }
};
NewExtensionsInitializer = __decorateClass([
  __decorateParam(1, IExtensionService),
  __decorateParam(2, IExtensionStorageService),
  __decorateParam(3, IExtensionGalleryService),
  __decorateParam(4, IExtensionManagementService),
  __decorateParam(5, IUserDataSyncLogService)
], NewExtensionsInitializer);
export {
  UserDataSyncInitializer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyRGF0YVN5bmMvYnJvd3Nlci91c2VyRGF0YVN5bmNJbml0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IEFic3RyYWN0RXh0ZW5zaW9uc0luaXRpYWxpemVyLCBJRXh0ZW5zaW9uc0luaXRpYWxpemVyUHJldmlld1Jlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vZXh0ZW5zaW9uc1N5bmMuanMnO1xuaW1wb3J0IHsgR2xvYmFsU3RhdGVJbml0aWFsaXplciwgVXNlckRhdGFTeW5jU3RvcmVUeXBlU3luY2hyb25pemVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi9nbG9iYWxTdGF0ZVN5bmMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NJbml0aWFsaXplciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24va2V5YmluZGluZ3NTeW5jLmpzJztcbmltcG9ydCB7IFNldHRpbmdzSW5pdGlhbGl6ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3NldHRpbmdzU3luYy5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0c0luaXRpYWxpemVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi9zbmlwcGV0c1N5bmMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNTdG9yZUNsaWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSVJlbW90ZVVzZXJEYXRhLCBJVXNlckRhdGEsIElVc2VyRGF0YVN5bmNSZXNvdXJjZUluaXRpYWxpemVyLCBJVXNlckRhdGFTeW5jTG9nU2VydmljZSwgSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsIFN5bmNSZXNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8sIGdldEN1cnJlbnRBdXRoZW50aWNhdGlvblNlc3Npb25JbmZvIH0gZnJvbSAnLi4vLi4vYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0U3luY0FyZWFMYWJlbCB9IGZyb20gJy4uL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBCYXJyaWVyLCBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVYVEVOU0lPTl9JTlNUQUxMX1NLSVBfUFVCTElTSEVSX1RSVVNUX0NPTlRFWFQsIElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIElMb2NhbEV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSwgdG9FeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBJSWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vaWdub3JlZEV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25TdG9yYWdlLmpzJztcbmltcG9ydCB7IFRhc2tzSW5pdGlhbGl6ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3Rhc2tzU3luYy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YUluaXRpYWxpemVyIH0gZnJvbSAnLi4vLi4vdXNlckRhdGEvYnJvd3Nlci91c2VyRGF0YUluaXQuanMnO1xuaW1wb3J0IHsgSVNlY3JldFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc2VjcmV0cy9jb21tb24vc2VjcmV0cy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBVc2VyRGF0YVN5bmNJbml0aWFsaXplciBpbXBsZW1lbnRzIElVc2VyRGF0YUluaXRpYWxpemVyIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpbml0aWFsaXplZDogU3luY1Jlc291cmNlW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBpbml0aWFsaXphdGlvbkZpbmlzaGVkID0gbmV3IEJhcnJpZXIoKTtcblx0cHJpdmF0ZSBnbG9iYWxTdGF0ZVVzZXJEYXRhOiBJVXNlckRhdGEgfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZWNyZXRTdG9yYWdlU2VydmljZTogSVNlY3JldFN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmNyZWF0ZVVzZXJEYXRhU3luY1N0b3JlQ2xpZW50KCkudGhlbih1c2VyRGF0YVN5bmNTdG9yZUNsaWVudCA9PiB7XG5cdFx0XHRpZiAoIXVzZXJEYXRhU3luY1N0b3JlQ2xpZW50KSB7XG5cdFx0XHRcdHRoaXMuaW5pdGlhbGl6YXRpb25GaW5pc2hlZC5vcGVuKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF91c2VyRGF0YVN5bmNTdG9yZUNsaWVudFByb21pc2U6IFByb21pc2U8VXNlckRhdGFTeW5jU3RvcmVDbGllbnQgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNyZWF0ZVVzZXJEYXRhU3luY1N0b3JlQ2xpZW50KCk6IFByb21pc2U8VXNlckRhdGFTeW5jU3RvcmVDbGllbnQgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX3VzZXJEYXRhU3luY1N0b3JlQ2xpZW50UHJvbWlzZSkge1xuXHRcdFx0dGhpcy5fdXNlckRhdGFTeW5jU3RvcmVDbGllbnRQcm9taXNlID0gKGFzeW5jICgpOiBQcm9taXNlPFVzZXJEYXRhU3luY1N0b3JlQ2xpZW50IHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0aWYgKCFpc1dlYikge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBTa2lwcGluZyBpbml0aWFsaXppbmcgdXNlciBkYXRhIGluIGRlc2t0b3BgKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIXRoaXMuc3RvcmFnZVNlcnZpY2UuaXNOZXcoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBTa2lwcGluZyBpbml0aWFsaXppbmcgdXNlciBkYXRhIGFzIGFwcGxpY2F0aW9uIHdhcyBvcGVuZWQgYmVmb3JlYCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCF0aGlzLnN0b3JhZ2VTZXJ2aWNlLmlzTmV3KFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFNraXBwaW5nIGluaXRpYWxpemluZyB1c2VyIGRhdGEgYXMgd29ya3NwYWNlIHdhcyBvcGVuZWQgYmVmb3JlYCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LnNldHRpbmdzU3luY09wdGlvbnM/LmF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgJiYgIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnMuc2V0dGluZ3NTeW5jT3B0aW9ucy5lbmFibGVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFNraXBwaW5nIGluaXRpYWxpemluZyB1c2VyIGRhdGEgYXMgc2V0dGluZ3Mgc3luYyBpcyBkaXNhYmxlZGApO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGxldCBhdXRoZW50aWNhdGlvblNlc3Npb247XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF1dGhlbnRpY2F0aW9uU2Vzc2lvbiA9IGF3YWl0IGdldEN1cnJlbnRBdXRoZW50aWNhdGlvblNlc3Npb25JbmZvKHRoaXMuc2VjcmV0U3RvcmFnZVNlcnZpY2UsIHRoaXMucHJvZHVjdFNlcnZpY2UpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIWF1dGhlbnRpY2F0aW9uU2Vzc2lvbikge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBTa2lwcGluZyBpbml0aWFsaXppbmcgdXNlciBkYXRhIGFzIGF1dGhlbnRpY2F0aW9uIHNlc3Npb24gaXMgbm90IHNldGApO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuaW5pdGlhbGl6ZVVzZXJEYXRhU3luY1N0b3JlKGF1dGhlbnRpY2F0aW9uU2Vzc2lvbik7XG5cblx0XHRcdFx0XHRjb25zdCB1c2VyRGF0YVN5bmNTdG9yZSA9IHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZTtcblx0XHRcdFx0XHRpZiAoIXVzZXJEYXRhU3luY1N0b3JlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFNraXBwaW5nIGluaXRpYWxpemluZyB1c2VyIGRhdGEgYXMgc3luYyBzZXJ2aWNlIGlzIG5vdCBwcm92aWRlZGApO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHVzZXJEYXRhU3luY1N0b3JlQ2xpZW50ID0gbmV3IFVzZXJEYXRhU3luY1N0b3JlQ2xpZW50KHVzZXJEYXRhU3luY1N0b3JlLnVybCwgdGhpcy5wcm9kdWN0U2VydmljZSwgdGhpcy5yZXF1ZXN0U2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy5maWxlU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSk7XG5cdFx0XHRcdFx0dXNlckRhdGFTeW5jU3RvcmVDbGllbnQuc2V0QXV0aFRva2VuKGF1dGhlbnRpY2F0aW9uU2Vzc2lvbi5hY2Nlc3NUb2tlbiwgYXV0aGVudGljYXRpb25TZXNzaW9uLnByb3ZpZGVySWQpO1xuXG5cdFx0XHRcdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB1c2VyRGF0YVN5bmNTdG9yZUNsaWVudC5tYW5pZmVzdChudWxsKTtcblx0XHRcdFx0XHRpZiAobWFuaWZlc3QgPT09IG51bGwpIHtcblx0XHRcdFx0XHRcdHVzZXJEYXRhU3luY1N0b3JlQ2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgU2tpcHBpbmcgaW5pdGlhbGl6aW5nIHVzZXIgZGF0YSBhcyB0aGVyZSBpcyBubyBkYXRhYCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFVzaW5nIHNldHRpbmdzIHN5bmMgc2VydmljZSAke3VzZXJEYXRhU3luY1N0b3JlLnVybC50b1N0cmluZygpfSBmb3IgaW5pdGlhbGl6YXRpb25gKTtcblx0XHRcdFx0XHRyZXR1cm4gdXNlckRhdGFTeW5jU3RvcmVDbGllbnQ7XG5cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fdXNlckRhdGFTeW5jU3RvcmVDbGllbnRQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplVXNlckRhdGFTeW5jU3RvcmUoYXV0aGVudGljYXRpb25TZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb25JbmZvKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXNlckRhdGFTeW5jU3RvcmUgPSB0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UudXNlckRhdGFTeW5jU3RvcmU7XG5cdFx0aWYgKCF1c2VyRGF0YVN5bmNTdG9yZT8uY2FuU3dpdGNoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHVzZXJEYXRhU3luY1N0b3JlQ2xpZW50ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBVc2VyRGF0YVN5bmNTdG9yZUNsaWVudCh1c2VyRGF0YVN5bmNTdG9yZS51cmwsIHRoaXMucHJvZHVjdFNlcnZpY2UsIHRoaXMucmVxdWVzdFNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMuc3RvcmFnZVNlcnZpY2UpKTtcblx0XHRcdHVzZXJEYXRhU3luY1N0b3JlQ2xpZW50LnNldEF1dGhUb2tlbihhdXRoZW50aWNhdGlvblNlc3Npb24uYWNjZXNzVG9rZW4sIGF1dGhlbnRpY2F0aW9uU2Vzc2lvbi5wcm92aWRlcklkKTtcblxuXHRcdFx0Ly8gQ2FjaGUgZ2xvYmFsIHN0YXRlIGRhdGEgZm9yIGdsb2JhbCBzdGF0ZSBpbml0aWFsaXphdGlvblxuXHRcdFx0dGhpcy5nbG9iYWxTdGF0ZVVzZXJEYXRhID0gYXdhaXQgdXNlckRhdGFTeW5jU3RvcmVDbGllbnQucmVhZFJlc291cmNlKFN5bmNSZXNvdXJjZS5HbG9iYWxTdGF0ZSwgbnVsbCk7XG5cblx0XHRcdGlmICh0aGlzLmdsb2JhbFN0YXRlVXNlckRhdGEpIHtcblx0XHRcdFx0Y29uc3QgdXNlckRhdGFTeW5jU3RvcmVUeXBlID0gbmV3IFVzZXJEYXRhU3luY1N0b3JlVHlwZVN5bmNocm9uaXplcih1c2VyRGF0YVN5bmNTdG9yZUNsaWVudCwgdGhpcy5zdG9yYWdlU2VydmljZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSkuZ2V0U3luY1N0b3JlVHlwZSh0aGlzLmdsb2JhbFN0YXRlVXNlckRhdGEpO1xuXHRcdFx0XHRpZiAodXNlckRhdGFTeW5jU3RvcmVUeXBlKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnN3aXRjaCh1c2VyRGF0YVN5bmNTdG9yZVR5cGUpO1xuXG5cdFx0XHRcdFx0Ly8gVW5zZXQgY2FjaGVkIGdsb2JhbCBzdGF0ZSBkYXRhIGlmIHVybHMgYXJlIGNoYW5nZWRcblx0XHRcdFx0XHRpZiAoIWlzRXF1YWwodXNlckRhdGFTeW5jU3RvcmUudXJsLCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UudXNlckRhdGFTeW5jU3RvcmU/LnVybCkpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTd2l0Y2hlZCBzZXR0aW5ncyBzeW5jIHN0b3JlJyk7XG5cdFx0XHRcdFx0XHR0aGlzLmdsb2JhbFN0YXRlVXNlckRhdGEgPSBudWxsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgd2hlbkluaXRpYWxpemF0aW9uRmluaXNoZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5pbml0aWFsaXphdGlvbkZpbmlzaGVkLndhaXQoKTtcblx0fVxuXG5cdGFzeW5jIHJlcXVpcmVzSW5pdGlhbGl6YXRpb24oKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBVc2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZSNyZXF1aXJlc0luaXRpYWxpemF0aW9uYCk7XG5cdFx0Y29uc3QgdXNlckRhdGFTeW5jU3RvcmVDbGllbnQgPSBhd2FpdCB0aGlzLmNyZWF0ZVVzZXJEYXRhU3luY1N0b3JlQ2xpZW50KCk7XG5cdFx0cmV0dXJuICEhdXNlckRhdGFTeW5jU3RvcmVDbGllbnQ7XG5cdH1cblxuXHRhc3luYyBpbml0aWFsaXplUmVxdWlyZWRSZXNvdXJjZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBVc2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZSNpbml0aWFsaXplUmVxdWlyZWRSZXNvdXJjZXNgKTtcblx0XHRyZXR1cm4gdGhpcy5pbml0aWFsaXplKFtTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIFN5bmNSZXNvdXJjZS5HbG9iYWxTdGF0ZV0pO1xuXHR9XG5cblx0YXN5bmMgaW5pdGlhbGl6ZU90aGVyUmVzb3VyY2VzKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBVc2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZSNpbml0aWFsaXplT3RoZXJSZXNvdXJjZXNgKTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChbdGhpcy5pbml0aWFsaXplKFtTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3MsIFN5bmNSZXNvdXJjZS5TbmlwcGV0cywgU3luY1Jlc291cmNlLlRhc2tzXSksIHRoaXMuaW5pdGlhbGl6ZUV4dGVuc2lvbnMoaW5zdGFudGlhdGlvblNlcnZpY2UpXSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuaW5pdGlhbGl6YXRpb25GaW5pc2hlZC5vcGVuKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplRXh0ZW5zaW9ucyhpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFt0aGlzLmluaXRpYWxpemVJbnN0YWxsZWRFeHRlbnNpb25zKGluc3RhbnRpYXRpb25TZXJ2aWNlKSwgdGhpcy5pbml0aWFsaXplTmV3RXh0ZW5zaW9ucyhpbnN0YW50aWF0aW9uU2VydmljZSldKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5pbml0aWFsaXplZC5wdXNoKFN5bmNSZXNvdXJjZS5FeHRlbnNpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluaXRpYWxpemVJbnN0YWxsZWRFeHRlbnNpb25zUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0YXN5bmMgaW5pdGlhbGl6ZUluc3RhbGxlZEV4dGVuc2lvbnMoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pbml0aWFsaXplSW5zdGFsbGVkRXh0ZW5zaW9uc1Byb21pc2UpIHtcblx0XHRcdHRoaXMuaW5pdGlhbGl6ZUluc3RhbGxlZEV4dGVuc2lvbnNQcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBVc2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZSNpbml0aWFsaXplSW5zdGFsbGVkRXh0ZW5zaW9uc2ApO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyID0gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXIpIHtcblx0XHRcdFx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsZWRFeHRlbnNpb25zSW5pdGlhbGl6ZXIsIGV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXIpLmluaXRpYWxpemUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuaW5pdGlhbGl6ZUluc3RhbGxlZEV4dGVuc2lvbnNQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplTmV3RXh0ZW5zaW9uc1Byb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXN5bmMgaW5pdGlhbGl6ZU5ld0V4dGVuc2lvbnMoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pbml0aWFsaXplTmV3RXh0ZW5zaW9uc1Byb21pc2UpIHtcblx0XHRcdHRoaXMuaW5pdGlhbGl6ZU5ld0V4dGVuc2lvbnNQcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBVc2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZSNpbml0aWFsaXplTmV3RXh0ZW5zaW9uc2ApO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyID0gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXIpIHtcblx0XHRcdFx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOZXdFeHRlbnNpb25zSW5pdGlhbGl6ZXIsIGV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXIpLmluaXRpYWxpemUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuaW5pdGlhbGl6ZU5ld0V4dGVuc2lvbnNQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBleHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyUHJvbWlzZTogUHJvbWlzZTxFeHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyIHwgbnVsbD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0RXh0ZW5zaW9uc1ByZXZpZXdJbml0aWFsaXplcihpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogUHJvbWlzZTxFeHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyIHwgbnVsbD4ge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5leHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVzZXJEYXRhU3luY1N0b3JlQ2xpZW50ID0gYXdhaXQgdGhpcy5jcmVhdGVVc2VyRGF0YVN5bmNTdG9yZUNsaWVudCgpO1xuXHRcdFx0XHRpZiAoIXVzZXJEYXRhU3luY1N0b3JlQ2xpZW50KSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdXNlckRhdGEgPSBhd2FpdCB1c2VyRGF0YVN5bmNTdG9yZUNsaWVudC5yZWFkUmVzb3VyY2UoU3luY1Jlc291cmNlLkV4dGVuc2lvbnMsIG51bGwpO1xuXHRcdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc1ByZXZpZXdJbml0aWFsaXplciwgdXNlckRhdGEpO1xuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1ByZXZpZXdJbml0aWFsaXplclByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluaXRpYWxpemUoc3luY1Jlc291cmNlczogU3luY1Jlc291cmNlW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1c2VyRGF0YVN5bmNTdG9yZUNsaWVudCA9IGF3YWl0IHRoaXMuY3JlYXRlVXNlckRhdGFTeW5jU3RvcmVDbGllbnQoKTtcblx0XHRpZiAoIXVzZXJEYXRhU3luY1N0b3JlQ2xpZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChzeW5jUmVzb3VyY2VzLm1hcChhc3luYyBzeW5jUmVzb3VyY2UgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKHRoaXMuaW5pdGlhbGl6ZWQuaW5jbHVkZXMoc3luY1Jlc291cmNlKSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke2dldFN5bmNBcmVhTGFiZWwoc3luY1Jlc291cmNlKX0gaW5pdGlhbGl6ZWQgYWxyZWFkeS5gKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5pbml0aWFsaXplZC5wdXNoKHN5bmNSZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgSW5pdGlhbGl6aW5nICR7Z2V0U3luY0FyZWFMYWJlbChzeW5jUmVzb3VyY2UpfWApO1xuXHRcdFx0XHRjb25zdCBpbml0aWFsaXplciA9IHRoaXMuY3JlYXRlU3luY1Jlc291cmNlSW5pdGlhbGl6ZXIoc3luY1Jlc291cmNlKTtcblx0XHRcdFx0Y29uc3QgdXNlckRhdGEgPSBhd2FpdCB1c2VyRGF0YVN5bmNTdG9yZUNsaWVudC5yZWFkUmVzb3VyY2Uoc3luY1Jlc291cmNlLCBzeW5jUmVzb3VyY2UgPT09IFN5bmNSZXNvdXJjZS5HbG9iYWxTdGF0ZSA/IHRoaXMuZ2xvYmFsU3RhdGVVc2VyRGF0YSA6IG51bGwpO1xuXHRcdFx0XHRhd2FpdCBpbml0aWFsaXplci5pbml0aWFsaXplKHVzZXJEYXRhKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEluaXRpYWxpemVkICR7Z2V0U3luY0FyZWFMYWJlbChzeW5jUmVzb3VyY2UpfWApO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEVycm9yIHdoaWxlIGluaXRpYWxpemluZyAke2dldFN5bmNBcmVhTGFiZWwoc3luY1Jlc291cmNlKX1gKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVN5bmNSZXNvdXJjZUluaXRpYWxpemVyKHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlKTogSVVzZXJEYXRhU3luY1Jlc291cmNlSW5pdGlhbGl6ZXIge1xuXHRcdHN3aXRjaCAoc3luY1Jlc291cmNlKSB7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5TZXR0aW5nczogcmV0dXJuIG5ldyBTZXR0aW5nc0luaXRpYWxpemVyKHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuc3RvcmFnZVNlcnZpY2UsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLktleWJpbmRpbmdzOiByZXR1cm4gbmV3IEtleWJpbmRpbmdzSW5pdGlhbGl6ZXIodGhpcy5maWxlU2VydmljZSwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuVGFza3M6IHJldHVybiBuZXcgVGFza3NJbml0aWFsaXplcih0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5TbmlwcGV0czogcmV0dXJuIG5ldyBTbmlwcGV0c0luaXRpYWxpemVyKHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuc3RvcmFnZVNlcnZpY2UsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlOiByZXR1cm4gbmV3IEdsb2JhbFN0YXRlSW5pdGlhbGl6ZXIodGhpcy5zdG9yYWdlU2VydmljZSwgdGhpcy5maWxlU2VydmljZSwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBjcmVhdGUgaW5pdGlhbGl6ZXIgZm9yICR7c3luY1Jlc291cmNlfWApO1xuXHR9XG5cbn1cblxuY2xhc3MgRXh0ZW5zaW9uc1ByZXZpZXdJbml0aWFsaXplciBleHRlbmRzIEFic3RyYWN0RXh0ZW5zaW9uc0luaXRpYWxpemVyIHtcblxuXHRwcml2YXRlIHByZXZpZXdQcm9taXNlOiBQcm9taXNlPElFeHRlbnNpb25zSW5pdGlhbGl6ZXJQcmV2aWV3UmVzdWx0IHwgbnVsbD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcHJldmlldzogSUV4dGVuc2lvbnNJbml0aWFsaXplclByZXZpZXdSZXN1bHQgfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNEYXRhOiBJVXNlckRhdGEsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZSBpZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJSWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgbG9nU2VydmljZTogSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIGlnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UsIGZpbGVTZXJ2aWNlLCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0fVxuXG5cdGdldFByZXZpZXcoKTogUHJvbWlzZTxJRXh0ZW5zaW9uc0luaXRpYWxpemVyUHJldmlld1Jlc3VsdCB8IG51bGw+IHtcblx0XHRpZiAoIXRoaXMucHJldmlld1Byb21pc2UpIHtcblx0XHRcdHRoaXMucHJldmlld1Byb21pc2UgPSBzdXBlci5pbml0aWFsaXplKHRoaXMuZXh0ZW5zaW9uc0RhdGEpLnRoZW4oKCkgPT4gdGhpcy5wcmV2aWV3KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMucHJldmlld1Byb21pc2U7XG5cdH1cblxuXHRvdmVycmlkZSBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignc2hvdWxkIG5vdCBiZSBjYWxsZWQgZGlyZWN0bHknKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBkb0luaXRpYWxpemUocmVtb3RlVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnBhcnNlRXh0ZW5zaW9ucyhyZW1vdGVVc2VyRGF0YSk7XG5cdFx0aWYgKCFyZW1vdGVFeHRlbnNpb25zKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnU2tpcHBpbmcgaW5pdGlhbGl6aW5nIGV4dGVuc2lvbnMgYmVjYXVzZSByZW1vdGUgZXh0ZW5zaW9ucyBkb2VzIG5vdCBleGlzdC4nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKCk7XG5cdFx0dGhpcy5wcmV2aWV3ID0gdGhpcy5nZW5lcmF0ZVByZXZpZXcocmVtb3RlRXh0ZW5zaW9ucywgaW5zdGFsbGVkRXh0ZW5zaW9ucyk7XG5cdH1cbn1cblxuY2xhc3MgSW5zdGFsbGVkRXh0ZW5zaW9uc0luaXRpYWxpemVyIGltcGxlbWVudHMgSVVzZXJEYXRhU3luY1Jlc291cmNlSW5pdGlhbGl6ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1ByZXZpZXdJbml0aWFsaXplcjogRXh0ZW5zaW9uc1ByZXZpZXdJbml0aWFsaXplcixcblx0XHRASUdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2U6IElFeHRlbnNpb25TdG9yYWdlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByZXZpZXcgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXIuZ2V0UHJldmlldygpO1xuXHRcdGlmICghcHJldmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIDEuIEluaXRpYWxpc2UgYWxyZWFkeSBpbnN0YWxsZWQgZXh0ZW5zaW9ucyBzdGF0ZVxuXHRcdGZvciAoY29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9uIG9mIHByZXZpZXcuaW5zdGFsbGVkRXh0ZW5zaW9ucykge1xuXHRcdFx0Y29uc3Qgc3luY0V4dGVuc2lvbiA9IHByZXZpZXcucmVtb3RlRXh0ZW5zaW9ucy5maW5kKCh7IGlkZW50aWZpZXIgfSkgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaWRlbnRpZmllciwgaW5zdGFsbGVkRXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdGlmIChzeW5jRXh0ZW5zaW9uPy5zdGF0ZSkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25TdGF0ZSA9IHRoaXMuZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UuZ2V0RXh0ZW5zaW9uU3RhdGUoaW5zdGFsbGVkRXh0ZW5zaW9uLCB0cnVlKSB8fCB7fTtcblx0XHRcdFx0T2JqZWN0LmtleXMoc3luY0V4dGVuc2lvbi5zdGF0ZSkuZm9yRWFjaChrZXkgPT4gZXh0ZW5zaW9uU3RhdGVba2V5XSA9IHN5bmNFeHRlbnNpb24uc3RhdGUhW2tleV0pO1xuXHRcdFx0XHR0aGlzLmV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlLnNldEV4dGVuc2lvblN0YXRlKGluc3RhbGxlZEV4dGVuc2lvbiwgZXh0ZW5zaW9uU3RhdGUsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIDIuIEluaXRpYWxpc2UgZXh0ZW5zaW9ucyBlbmFibGVtZW50XG5cdFx0aWYgKHByZXZpZXcuZGlzYWJsZWRFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0Zm9yIChjb25zdCBpZGVudGlmaWVyIG9mIHByZXZpZXcuZGlzYWJsZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRGlzYWJsaW5nIGV4dGVuc2lvbi4uLmAsIGlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmRpc2FibGVFeHRlbnNpb24oaWRlbnRpZmllcik7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBEaXNhYmxpbmcgZXh0ZW5zaW9uYCwgaWRlbnRpZmllci5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIE5ld0V4dGVuc2lvbnNJbml0aWFsaXplciBpbXBsZW1lbnRzIElVc2VyRGF0YVN5bmNSZXNvdXJjZUluaXRpYWxpemVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXI6IEV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXIsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlOiBJRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcmV2aWV3ID0gYXdhaXQgdGhpcy5leHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyLmdldFByZXZpZXcoKTtcblx0XHRpZiAoIXByZXZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBuZXdseUVuYWJsZWRFeHRlbnNpb25zOiBJTG9jYWxFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHRhcmdldFBsYXRmb3JtID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRUYXJnZXRQbGF0Zm9ybSgpO1xuXHRcdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKHByZXZpZXcubmV3RXh0ZW5zaW9ucywgeyB0YXJnZXRQbGF0Zm9ybSwgY29tcGF0aWJsZTogdHJ1ZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRmb3IgKGNvbnN0IGdhbGxlcnlFeHRlbnNpb24gb2YgZ2FsbGVyeUV4dGVuc2lvbnMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblRvU3luYyA9IHByZXZpZXcucmVtb3RlRXh0ZW5zaW9ucy5maW5kKCh7IGlkZW50aWZpZXIgfSkgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaWRlbnRpZmllciwgZ2FsbGVyeUV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uVG9TeW5jKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvblRvU3luYy5zdGF0ZSkge1xuXHRcdFx0XHRcdHRoaXMuZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2Uuc2V0RXh0ZW5zaW9uU3RhdGUoZ2FsbGVyeUV4dGVuc2lvbiwgZXh0ZW5zaW9uVG9TeW5jLnN0YXRlLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEluc3RhbGxpbmcgZXh0ZW5zaW9uLi4uYCwgZ2FsbGVyeUV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0Y29uc3QgbG9jYWwgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeShnYWxsZXJ5RXh0ZW5zaW9uLCB7XG5cdFx0XHRcdFx0aXNNYWNoaW5lU2NvcGVkOiBmYWxzZSwgLyogc2V0IGlzTWFjaGluZVNjb3BlZCB0byBwcmV2ZW50IGluc3RhbGwgYW5kIHN5bmMgZGlhbG9nIGluIHdlYiAqL1xuXHRcdFx0XHRcdGRvbm90SW5jbHVkZVBhY2tBbmREZXBlbmRlbmNpZXM6IHRydWUsXG5cdFx0XHRcdFx0aW5zdGFsbEdpdmVuVmVyc2lvbjogISFleHRlbnNpb25Ub1N5bmMudmVyc2lvbixcblx0XHRcdFx0XHRpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb246IGV4dGVuc2lvblRvU3luYy5wcmVSZWxlYXNlLFxuXHRcdFx0XHRcdGNvbnRleHQ6IHsgW0VYVEVOU0lPTl9JTlNUQUxMX1NLSVBfUFVCTElTSEVSX1RSVVNUX0NPTlRFWFRdOiB0cnVlIH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghcHJldmlldy5kaXNhYmxlZEV4dGVuc2lvbnMuc29tZShpZGVudGlmaWVyID0+IGFyZVNhbWVFeHRlbnNpb25zKGlkZW50aWZpZXIsIGdhbGxlcnlFeHRlbnNpb24uaWRlbnRpZmllcikpKSB7XG5cdFx0XHRcdFx0bmV3bHlFbmFibGVkRXh0ZW5zaW9ucy5wdXNoKGxvY2FsKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgSW5zdGFsbGVkIGV4dGVuc2lvbi5gLCBnYWxsZXJ5RXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjYW5FbmFibGVkRXh0ZW5zaW9ucyA9IG5ld2x5RW5hYmxlZEV4dGVuc2lvbnMuZmlsdGVyKGUgPT4gdGhpcy5leHRlbnNpb25TZXJ2aWNlLmNhbkFkZEV4dGVuc2lvbih0b0V4dGVuc2lvbkRlc2NyaXB0aW9uKGUpKSk7XG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5hcmVFeHRlbnNpb25zUnVubmluZyhjYW5FbmFibGVkRXh0ZW5zaW9ucykpKSB7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigoYywgZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5leHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9ucyhhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGlmIChhd2FpdCB0aGlzLmFyZUV4dGVuc2lvbnNSdW5uaW5nKGNhbkVuYWJsZWRFeHRlbnNpb25zKSkge1xuXHRcdFx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0YygpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRlKGVycm9yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhcmVFeHRlbnNpb25zUnVubmluZyhleHRlbnNpb25zOiBJTG9jYWxFeHRlbnNpb25bXSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRjb25zdCBydW5uaW5nRXh0ZW5zaW9ucyA9IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zO1xuXHRcdHJldHVybiBleHRlbnNpb25zLmV2ZXJ5KGUgPT4gcnVubmluZ0V4dGVuc2lvbnMuc29tZShyID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IHIuaWRlbnRpZmllci52YWx1ZSB9LCBlLmlkZW50aWZpZXIpKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMscUNBQTBFO0FBQ25GLFNBQVMsd0JBQXdCLHlDQUF5QztBQUMxRSxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUF1RSx5QkFBeUIscUNBQXFDLG9CQUFvQjtBQUN6SixTQUFvQywyQ0FBMkM7QUFDL0UsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsU0FBUyxnQkFBZ0I7QUFDbEMsU0FBUyxnREFBZ0QsMEJBQTBCLDZCQUE2Qix5Q0FBMEQ7QUFDMUss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
