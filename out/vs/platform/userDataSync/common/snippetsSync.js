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
import { VSBuffer } from "../../../base/common/buffer.js";
import { Event } from "../../../base/common/event.js";
import { deepClone } from "../../../base/common/objects.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { FileOperationError, FileOperationResult, IFileService } from "../../files/common/files.js";
import { IStorageService } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { AbstractInitializer, AbstractSynchroniser } from "./abstractSynchronizer.js";
import { areSame, merge } from "./snippetsMerge.js";
import { Change, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, USER_DATA_SYNC_SCHEME } from "./userDataSync.js";
function parseSnippets(syncData) {
  return JSON.parse(syncData.content);
}
let SnippetsSynchroniser = class extends AbstractSynchroniser {
  constructor(profile, collection, environmentService, fileService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, logService, configurationService, userDataSyncEnablementService, telemetryService, uriIdentityService) {
    super({ syncResource: SyncResource.Snippets, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
    this.version = 1;
    this.snippetsFolder = profile.snippetsHome;
    this._register(this.fileService.watch(environmentService.userRoamingDataHome));
    this._register(this.fileService.watch(this.snippetsFolder));
    this._register(Event.filter(this.fileService.onDidFilesChange, (e) => e.affects(this.snippetsFolder))(() => this.triggerLocalChange()));
  }
  async generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine) {
    const local = await this.getSnippetsFileContents();
    const localSnippets = this.toSnippetsContents(local);
    const remoteSnippets = remoteUserData.syncData ? this.parseSnippets(remoteUserData.syncData) : null;
    lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
    const lastSyncSnippets = lastSyncUserData && lastSyncUserData.syncData ? this.parseSnippets(lastSyncUserData.syncData) : null;
    if (remoteSnippets) {
      this.logService.trace(`${this.syncResourceLogLabel}: Merging remote snippets with local snippets...`);
    } else {
      this.logService.trace(`${this.syncResourceLogLabel}: Remote snippets does not exist. Synchronizing snippets for the first time.`);
    }
    const mergeResult = merge(localSnippets, remoteSnippets, lastSyncSnippets);
    return this.getResourcePreviews(mergeResult, local, remoteSnippets || {}, lastSyncSnippets || {});
  }
  async hasRemoteChanged(lastSyncUserData) {
    const lastSyncSnippets = lastSyncUserData.syncData ? this.parseSnippets(lastSyncUserData.syncData) : null;
    if (lastSyncSnippets === null) {
      return true;
    }
    const local = await this.getSnippetsFileContents();
    const localSnippets = this.toSnippetsContents(local);
    const mergeResult = merge(localSnippets, lastSyncSnippets, lastSyncSnippets);
    return Object.keys(mergeResult.remote.added).length > 0 || Object.keys(mergeResult.remote.updated).length > 0 || mergeResult.remote.removed.length > 0 || mergeResult.conflicts.length > 0;
  }
  async getMergeResult(resourcePreview, token) {
    return resourcePreview.previewResult;
  }
  async getAcceptResult(resourcePreview, resource, content, token) {
    if (this.extUri.isEqualOrParent(resource, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }))) {
      return {
        content: resourcePreview.fileContent ? resourcePreview.fileContent.value.toString() : null,
        localChange: Change.None,
        remoteChange: resourcePreview.fileContent ? resourcePreview.remoteContent !== null ? Change.Modified : Change.Added : Change.Deleted
      };
    }
    if (this.extUri.isEqualOrParent(resource, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }))) {
      return {
        content: resourcePreview.remoteContent,
        localChange: resourcePreview.remoteContent !== null ? resourcePreview.fileContent ? Change.Modified : Change.Added : Change.Deleted,
        remoteChange: Change.None
      };
    }
    if (this.extUri.isEqualOrParent(resource, this.syncPreviewFolder)) {
      if (content === void 0) {
        return {
          content: resourcePreview.previewResult.content,
          localChange: resourcePreview.previewResult.localChange,
          remoteChange: resourcePreview.previewResult.remoteChange
        };
      } else {
        return {
          content,
          localChange: content === null ? resourcePreview.fileContent !== null ? Change.Deleted : Change.None : Change.Modified,
          remoteChange: content === null ? resourcePreview.remoteContent !== null ? Change.Deleted : Change.None : Change.Modified
        };
      }
    }
    throw new Error(`Invalid Resource: ${resource.toString()}`);
  }
  async applyResult(remoteUserData, lastSyncUserData, resourcePreviews, force) {
    const accptedResourcePreviews = resourcePreviews.map(([resourcePreview, acceptResult]) => ({ ...resourcePreview, acceptResult }));
    if (accptedResourcePreviews.every(({ localChange, remoteChange }) => localChange === Change.None && remoteChange === Change.None)) {
      this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing snippets.`);
    }
    if (accptedResourcePreviews.some(({ localChange }) => localChange !== Change.None)) {
      await this.updateLocalBackup(accptedResourcePreviews);
      await this.updateLocalSnippets(accptedResourcePreviews, force);
    }
    if (accptedResourcePreviews.some(({ remoteChange }) => remoteChange !== Change.None)) {
      remoteUserData = await this.updateRemoteSnippets(accptedResourcePreviews, remoteUserData, force);
    }
    if (lastSyncUserData?.ref !== remoteUserData.ref) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized snippets...`);
      await this.updateLastSyncUserData(remoteUserData);
      this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized snippets`);
    }
    for (const { previewResource } of accptedResourcePreviews) {
      try {
        await this.fileService.del(previewResource);
      } catch (e) {
      }
    }
  }
  getResourcePreviews(snippetsMergeResult, localFileContent, remoteSnippets, baseSnippets) {
    const resourcePreviews = /* @__PURE__ */ new Map();
    for (const key of Object.keys(snippetsMergeResult.local.added)) {
      const previewResult = {
        content: snippetsMergeResult.local.added[key],
        hasConflicts: false,
        localChange: Change.Added,
        remoteChange: Change.None
      };
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: null,
        fileContent: null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        localContent: null,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remoteSnippets[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of Object.keys(snippetsMergeResult.local.updated)) {
      const previewResult = {
        content: snippetsMergeResult.local.updated[key],
        hasConflicts: false,
        localChange: Change.Modified,
        remoteChange: Change.None
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: baseSnippets[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key],
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remoteSnippets[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of snippetsMergeResult.local.removed) {
      const previewResult = {
        content: null,
        hasConflicts: false,
        localChange: Change.Deleted,
        remoteChange: Change.None
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: baseSnippets[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key],
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: null,
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of Object.keys(snippetsMergeResult.remote.added)) {
      const previewResult = {
        content: snippetsMergeResult.remote.added[key],
        hasConflicts: false,
        localChange: Change.None,
        remoteChange: Change.Added
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: baseSnippets[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key],
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: null,
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of Object.keys(snippetsMergeResult.remote.updated)) {
      const previewResult = {
        content: snippetsMergeResult.remote.updated[key],
        hasConflicts: false,
        localChange: Change.None,
        remoteChange: Change.Modified
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: baseSnippets[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key],
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remoteSnippets[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of snippetsMergeResult.remote.removed) {
      const previewResult = {
        content: null,
        hasConflicts: false,
        localChange: Change.None,
        remoteChange: Change.Deleted
      };
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: baseSnippets[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: null,
        localContent: null,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remoteSnippets[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of snippetsMergeResult.conflicts) {
      const previewResult = {
        content: baseSnippets[key] ?? null,
        hasConflicts: true,
        localChange: localFileContent[key] ? Change.Modified : Change.Added,
        remoteChange: remoteSnippets[key] ? Change.Modified : Change.Added
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: baseSnippets[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key] || null,
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remoteSnippets[key] || null,
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of Object.keys(localFileContent)) {
      if (!resourcePreviews.has(key)) {
        const previewResult = {
          content: localFileContent[key] ? localFileContent[key].value.toString() : null,
          hasConflicts: false,
          localChange: Change.None,
          remoteChange: Change.None
        };
        const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
        resourcePreviews.set(key, {
          baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
          baseContent: baseSnippets[key] ?? null,
          localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
          fileContent: localFileContent[key] || null,
          localContent,
          remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
          remoteContent: remoteSnippets[key] || null,
          previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
          previewResult,
          localChange: previewResult.localChange,
          remoteChange: previewResult.remoteChange,
          acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
        });
      }
    }
    return [...resourcePreviews.values()];
  }
  async resolveContent(uri) {
    if (this.extUri.isEqualOrParent(uri, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" })) || this.extUri.isEqualOrParent(uri, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" })) || this.extUri.isEqualOrParent(uri, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" })) || this.extUri.isEqualOrParent(uri, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" }))) {
      return this.resolvePreviewContent(uri);
    }
    return null;
  }
  async hasLocalData() {
    try {
      const localSnippets = await this.getSnippetsFileContents();
      if (Object.keys(localSnippets).length) {
        return true;
      }
    } catch (error) {
    }
    return false;
  }
  async updateLocalBackup(resourcePreviews) {
    const local = {};
    for (const resourcePreview of resourcePreviews) {
      if (resourcePreview.fileContent) {
        local[this.extUri.basename(resourcePreview.localResource)] = resourcePreview.fileContent;
      }
    }
    await this.backupLocal(JSON.stringify(this.toSnippetsContents(local)));
  }
  async updateLocalSnippets(resourcePreviews, force) {
    for (const { fileContent, acceptResult, localResource, remoteResource, localChange } of resourcePreviews) {
      if (localChange !== Change.None) {
        const key = remoteResource ? this.extUri.basename(remoteResource) : this.extUri.basename(localResource);
        const resource = this.extUri.joinPath(this.snippetsFolder, key);
        if (localChange === Change.Deleted) {
          this.logService.trace(`${this.syncResourceLogLabel}: Deleting snippet...`, this.extUri.basename(resource));
          await this.fileService.del(resource);
          this.logService.info(`${this.syncResourceLogLabel}: Deleted snippet`, this.extUri.basename(resource));
        } else if (localChange === Change.Added) {
          this.logService.trace(`${this.syncResourceLogLabel}: Creating snippet...`, this.extUri.basename(resource));
          await this.fileService.createFile(resource, VSBuffer.fromString(acceptResult.content), { overwrite: force });
          this.logService.info(`${this.syncResourceLogLabel}: Created snippet`, this.extUri.basename(resource));
        } else {
          this.logService.trace(`${this.syncResourceLogLabel}: Updating snippet...`, this.extUri.basename(resource));
          await this.fileService.writeFile(resource, VSBuffer.fromString(acceptResult.content), force ? void 0 : fileContent);
          this.logService.info(`${this.syncResourceLogLabel}: Updated snippet`, this.extUri.basename(resource));
        }
      }
    }
  }
  async updateRemoteSnippets(resourcePreviews, remoteUserData, forcePush) {
    const currentSnippets = remoteUserData.syncData ? this.parseSnippets(remoteUserData.syncData) : {};
    const newSnippets = deepClone(currentSnippets);
    for (const { acceptResult, localResource, remoteResource, remoteChange } of resourcePreviews) {
      if (remoteChange !== Change.None) {
        const key = localResource ? this.extUri.basename(localResource) : this.extUri.basename(remoteResource);
        if (remoteChange === Change.Deleted) {
          delete newSnippets[key];
        } else {
          newSnippets[key] = acceptResult.content;
        }
      }
    }
    if (!areSame(currentSnippets, newSnippets)) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating remote snippets...`);
      remoteUserData = await this.updateRemoteUserData(JSON.stringify(newSnippets), forcePush ? null : remoteUserData.ref);
      this.logService.info(`${this.syncResourceLogLabel}: Updated remote snippets`);
    }
    return remoteUserData;
  }
  parseSnippets(syncData) {
    return parseSnippets(syncData);
  }
  toSnippetsContents(snippetsFileContents) {
    const snippets = {};
    for (const key of Object.keys(snippetsFileContents)) {
      snippets[key] = snippetsFileContents[key].value.toString();
    }
    return snippets;
  }
  async getSnippetsFileContents() {
    const snippets = {};
    let stat;
    try {
      stat = await this.fileService.resolve(this.snippetsFolder);
    } catch (e) {
      if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
        return snippets;
      } else {
        throw e;
      }
    }
    for (const entry of stat.children || []) {
      const resource = entry.resource;
      const extension = this.extUri.extname(resource);
      if (extension === ".json" || extension === ".code-snippets") {
        const key = this.extUri.relativePath(this.snippetsFolder, resource);
        const content = await this.fileService.readFile(resource);
        snippets[key] = content;
      }
    }
    return snippets;
  }
};
SnippetsSynchroniser = __decorateClass([
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUserDataSyncStoreService),
  __decorateParam(6, IUserDataSyncLocalStoreService),
  __decorateParam(7, IUserDataSyncLogService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IUserDataSyncEnablementService),
  __decorateParam(10, ITelemetryService),
  __decorateParam(11, IUriIdentityService)
], SnippetsSynchroniser);
let SnippetsInitializer = class extends AbstractInitializer {
  constructor(fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService) {
    super(SyncResource.Snippets, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
  }
  async doInitialize(remoteUserData) {
    const remoteSnippets = remoteUserData.syncData ? JSON.parse(remoteUserData.syncData.content) : null;
    if (!remoteSnippets) {
      this.logService.info("Skipping initializing snippets because remote snippets does not exist.");
      return;
    }
    const isEmpty = await this.isEmpty();
    if (!isEmpty) {
      this.logService.info("Skipping initializing snippets because local snippets exist.");
      return;
    }
    for (const key of Object.keys(remoteSnippets)) {
      const content = remoteSnippets[key];
      if (content) {
        const resource = this.extUri.joinPath(this.userDataProfilesService.defaultProfile.snippetsHome, key);
        await this.fileService.createFile(resource, VSBuffer.fromString(content));
        this.logService.info("Created snippet", this.extUri.basename(resource));
      }
    }
    await this.updateLastSyncUserData(remoteUserData);
  }
  async isEmpty() {
    try {
      const stat = await this.fileService.resolve(this.userDataProfilesService.defaultProfile.snippetsHome);
      return !stat.children?.length;
    } catch (error) {
      return error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND;
    }
  }
};
SnippetsInitializer = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IUserDataSyncLogService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUriIdentityService)
], SnippetsInitializer);
export {
  SnippetsInitializer,
  SnippetsSynchroniser,
  parseSnippets
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vc25pcHBldHNTeW5jLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGRlZXBDbG9uZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlQ29udGVudCwgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXQgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RJbml0aWFsaXplciwgQWJzdHJhY3RTeW5jaHJvbmlzZXIsIElBY2NlcHRSZXN1bHQsIElGaWxlUmVzb3VyY2VQcmV2aWV3LCBJTWVyZ2VSZXN1bHQgfSBmcm9tICcuL2Fic3RyYWN0U3luY2hyb25pemVyLmpzJztcbmltcG9ydCB7IGFyZVNhbWUsIElNZXJnZVJlc3VsdCBhcyBJU25pcHBldHNNZXJnZVJlc3VsdCwgbWVyZ2UgfSBmcm9tICcuL3NuaXBwZXRzTWVyZ2UuanMnO1xuaW1wb3J0IHsgQ2hhbmdlLCBJUmVtb3RlVXNlckRhdGEsIElTeW5jRGF0YSwgSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLCBJVXNlckRhdGFTeW5jaHJvbmlzZXIsIElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLCBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIFN5bmNSZXNvdXJjZSwgVVNFUl9EQVRBX1NZTkNfU0NIRU1FIH0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuXG5pbnRlcmZhY2UgSVNuaXBwZXRzUmVzb3VyY2VQcmV2aWV3IGV4dGVuZHMgSUZpbGVSZXNvdXJjZVByZXZpZXcge1xuXHRwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQ7XG59XG5cbmludGVyZmFjZSBJU25pcHBldHNBY2NlcHRlZFJlc291cmNlUHJldmlldyBleHRlbmRzIElGaWxlUmVzb3VyY2VQcmV2aWV3IHtcblx0YWNjZXB0UmVzdWx0OiBJQWNjZXB0UmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VTbmlwcGV0cyhzeW5jRGF0YTogSVN5bmNEYXRhKTogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiB7XG5cdHJldHVybiBKU09OLnBhcnNlKHN5bmNEYXRhLmNvbnRlbnQpO1xufVxuXG5leHBvcnQgY2xhc3MgU25pcHBldHNTeW5jaHJvbmlzZXIgZXh0ZW5kcyBBYnN0cmFjdFN5bmNocm9uaXNlciBpbXBsZW1lbnRzIElVc2VyRGF0YVN5bmNocm9uaXNlciB7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IHZlcnNpb246IG51bWJlciA9IDE7XG5cdHByaXZhdGUgcmVhZG9ubHkgc25pcHBldHNGb2xkZXI6IFVSSTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLFxuXHRcdGNvbGxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU25pcHBldHMsIHByb2ZpbGUgfSwgY29sbGVjdGlvbiwgZmlsZVNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgdXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsIHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHR0aGlzLnNuaXBwZXRzRm9sZGVyID0gcHJvZmlsZS5zbmlwcGV0c0hvbWU7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS53YXRjaChlbnZpcm9ubWVudFNlcnZpY2UudXNlclJvYW1pbmdEYXRhSG9tZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2godGhpcy5zbmlwcGV0c0ZvbGRlcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UsIGUgPT4gZS5hZmZlY3RzKHRoaXMuc25pcHBldHNGb2xkZXIpKSgoKSA9PiB0aGlzLnRyaWdnZXJMb2NhbENoYW5nZSgpKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2VuZXJhdGVTeW5jUHJldmlldyhyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCBpc1JlbW90ZURhdGFGcm9tQ3VycmVudE1hY2hpbmU6IGJvb2xlYW4pOiBQcm9taXNlPElTbmlwcGV0c1Jlc291cmNlUHJldmlld1tdPiB7XG5cdFx0Y29uc3QgbG9jYWwgPSBhd2FpdCB0aGlzLmdldFNuaXBwZXRzRmlsZUNvbnRlbnRzKCk7XG5cdFx0Y29uc3QgbG9jYWxTbmlwcGV0cyA9IHRoaXMudG9TbmlwcGV0c0NvbnRlbnRzKGxvY2FsKTtcblx0XHRjb25zdCByZW1vdGVTbmlwcGV0czogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiB8IG51bGwgPSByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSA/IHRoaXMucGFyc2VTbmlwcGV0cyhyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSkgOiBudWxsO1xuXG5cdFx0Ly8gVXNlIHJlbW90ZSBkYXRhIGFzIGxhc3Qgc3luYyBkYXRhIGlmIGxhc3Qgc3luYyBkYXRhIGRvZXMgbm90IGV4aXN0IGFuZCByZW1vdGUgZGF0YSBpcyBmcm9tIHNhbWUgbWFjaGluZVxuXHRcdGxhc3RTeW5jVXNlckRhdGEgPSBsYXN0U3luY1VzZXJEYXRhID09PSBudWxsICYmIGlzUmVtb3RlRGF0YUZyb21DdXJyZW50TWFjaGluZSA/IHJlbW90ZVVzZXJEYXRhIDogbGFzdFN5bmNVc2VyRGF0YTtcblx0XHRjb25zdCBsYXN0U3luY1NuaXBwZXRzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+IHwgbnVsbCA9IGxhc3RTeW5jVXNlckRhdGEgJiYgbGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSA/IHRoaXMucGFyc2VTbmlwcGV0cyhsYXN0U3luY1VzZXJEYXRhLnN5bmNEYXRhKSA6IG51bGw7XG5cblx0XHRpZiAocmVtb3RlU25pcHBldHMpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogTWVyZ2luZyByZW1vdGUgc25pcHBldHMgd2l0aCBsb2NhbCBzbmlwcGV0cy4uLmApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFJlbW90ZSBzbmlwcGV0cyBkb2VzIG5vdCBleGlzdC4gU3luY2hyb25pemluZyBzbmlwcGV0cyBmb3IgdGhlIGZpcnN0IHRpbWUuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVyZ2VSZXN1bHQgPSBtZXJnZShsb2NhbFNuaXBwZXRzLCByZW1vdGVTbmlwcGV0cywgbGFzdFN5bmNTbmlwcGV0cyk7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UmVzb3VyY2VQcmV2aWV3cyhtZXJnZVJlc3VsdCwgbG9jYWwsIHJlbW90ZVNuaXBwZXRzIHx8IHt9LCBsYXN0U3luY1NuaXBwZXRzIHx8IHt9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBoYXNSZW1vdGVDaGFuZ2VkKGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGxhc3RTeW5jU25pcHBldHM6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4gfCBudWxsID0gbGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSA/IHRoaXMucGFyc2VTbmlwcGV0cyhsYXN0U3luY1VzZXJEYXRhLnN5bmNEYXRhKSA6IG51bGw7XG5cdFx0aWYgKGxhc3RTeW5jU25pcHBldHMgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBsb2NhbCA9IGF3YWl0IHRoaXMuZ2V0U25pcHBldHNGaWxlQ29udGVudHMoKTtcblx0XHRjb25zdCBsb2NhbFNuaXBwZXRzID0gdGhpcy50b1NuaXBwZXRzQ29udGVudHMobG9jYWwpO1xuXHRcdGNvbnN0IG1lcmdlUmVzdWx0ID0gbWVyZ2UobG9jYWxTbmlwcGV0cywgbGFzdFN5bmNTbmlwcGV0cywgbGFzdFN5bmNTbmlwcGV0cyk7XG5cdFx0cmV0dXJuIE9iamVjdC5rZXlzKG1lcmdlUmVzdWx0LnJlbW90ZS5hZGRlZCkubGVuZ3RoID4gMCB8fCBPYmplY3Qua2V5cyhtZXJnZVJlc3VsdC5yZW1vdGUudXBkYXRlZCkubGVuZ3RoID4gMCB8fCBtZXJnZVJlc3VsdC5yZW1vdGUucmVtb3ZlZC5sZW5ndGggPiAwIHx8IG1lcmdlUmVzdWx0LmNvbmZsaWN0cy5sZW5ndGggPiAwO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldE1lcmdlUmVzdWx0KHJlc291cmNlUHJldmlldzogSVNuaXBwZXRzUmVzb3VyY2VQcmV2aWV3LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElNZXJnZVJlc3VsdD4ge1xuXHRcdHJldHVybiByZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZXRBY2NlcHRSZXN1bHQocmVzb3VyY2VQcmV2aWV3OiBJU25pcHBldHNSZXNvdXJjZVByZXZpZXcsIHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFjY2VwdFJlc3VsdD4ge1xuXG5cdFx0LyogQWNjZXB0IGxvY2FsIHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgdGhpcy5zeW5jUHJldmlld0ZvbGRlci53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5maWxlQ29udGVudCA/IHJlc291cmNlUHJldmlldy5maWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpIDogbnVsbCxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHJlc291cmNlUHJldmlldy5maWxlQ29udGVudFxuXHRcdFx0XHRcdD8gcmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQgIT09IG51bGwgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuQWRkZWRcblx0XHRcdFx0XHQ6IENoYW5nZS5EZWxldGVkXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8qIEFjY2VwdCByZW1vdGUgcmVzb3VyY2UgKi9cblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHJlc291cmNlLCB0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogcmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQgIT09IG51bGxcblx0XHRcdFx0XHQ/IHJlc291cmNlUHJldmlldy5maWxlQ29udGVudCA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5BZGRlZFxuXHRcdFx0XHRcdDogQ2hhbmdlLkRlbGV0ZWQsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8qIEFjY2VwdCBwcmV2aWV3IHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgdGhpcy5zeW5jUHJldmlld0ZvbGRlcikpIHtcblx0XHRcdGlmIChjb250ZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdC5jb250ZW50LFxuXHRcdFx0XHRcdGxvY2FsQ2hhbmdlOiByZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHJlc291cmNlUHJldmlldy5wcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0XHRsb2NhbENoYW5nZTogY29udGVudCA9PT0gbnVsbFxuXHRcdFx0XHRcdFx0PyByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQgIT09IG51bGwgPyBDaGFuZ2UuRGVsZXRlZCA6IENoYW5nZS5Ob25lXG5cdFx0XHRcdFx0XHQ6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdFx0XHRyZW1vdGVDaGFuZ2U6IGNvbnRlbnQgPT09IG51bGxcblx0XHRcdFx0XHRcdD8gcmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQgIT09IG51bGwgPyBDaGFuZ2UuRGVsZXRlZCA6IENoYW5nZS5Ob25lXG5cdFx0XHRcdFx0XHQ6IENoYW5nZS5Nb2RpZmllZFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBSZXNvdXJjZTogJHtyZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGFwcGx5UmVzdWx0KHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEsIGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSB8IG51bGwsIHJlc291cmNlUHJldmlld3M6IFtJU25pcHBldHNSZXNvdXJjZVByZXZpZXcsIElBY2NlcHRSZXN1bHRdW10sIGZvcmNlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYWNjcHRlZFJlc291cmNlUHJldmlld3M6IElTbmlwcGV0c0FjY2VwdGVkUmVzb3VyY2VQcmV2aWV3W10gPSByZXNvdXJjZVByZXZpZXdzLm1hcCgoW3Jlc291cmNlUHJldmlldywgYWNjZXB0UmVzdWx0XSkgPT4gKHsgLi4ucmVzb3VyY2VQcmV2aWV3LCBhY2NlcHRSZXN1bHQgfSkpO1xuXHRcdGlmIChhY2NwdGVkUmVzb3VyY2VQcmV2aWV3cy5ldmVyeSgoeyBsb2NhbENoYW5nZSwgcmVtb3RlQ2hhbmdlIH0pID0+IGxvY2FsQ2hhbmdlID09PSBDaGFuZ2UuTm9uZSAmJiByZW1vdGVDaGFuZ2UgPT09IENoYW5nZS5Ob25lKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IE5vIGNoYW5nZXMgZm91bmQgZHVyaW5nIHN5bmNocm9uaXppbmcgc25pcHBldHMuYCk7XG5cdFx0fVxuXG5cdFx0aWYgKGFjY3B0ZWRSZXNvdXJjZVByZXZpZXdzLnNvbWUoKHsgbG9jYWxDaGFuZ2UgfSkgPT4gbG9jYWxDaGFuZ2UgIT09IENoYW5nZS5Ob25lKSkge1xuXHRcdFx0Ly8gYmFjayB1cCBhbGwgc25pcHBldHNcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTG9jYWxCYWNrdXAoYWNjcHRlZFJlc291cmNlUHJldmlld3MpO1xuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVMb2NhbFNuaXBwZXRzKGFjY3B0ZWRSZXNvdXJjZVByZXZpZXdzLCBmb3JjZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGFjY3B0ZWRSZXNvdXJjZVByZXZpZXdzLnNvbWUoKHsgcmVtb3RlQ2hhbmdlIH0pID0+IHJlbW90ZUNoYW5nZSAhPT0gQ2hhbmdlLk5vbmUpKSB7XG5cdFx0XHRyZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRoaXMudXBkYXRlUmVtb3RlU25pcHBldHMoYWNjcHRlZFJlc291cmNlUHJldmlld3MsIHJlbW90ZVVzZXJEYXRhLCBmb3JjZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGxhc3RTeW5jVXNlckRhdGE/LnJlZiAhPT0gcmVtb3RlVXNlckRhdGEucmVmKSB7XG5cdFx0XHQvLyB1cGRhdGUgbGFzdCBzeW5jXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0aW5nIGxhc3Qgc3luY2hyb25pemVkIHNuaXBwZXRzLi4uYCk7XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUxhc3RTeW5jVXNlckRhdGEocmVtb3RlVXNlckRhdGEpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0ZWQgbGFzdCBzeW5jaHJvbml6ZWQgc25pcHBldHNgKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHsgcHJldmlld1Jlc291cmNlIH0gb2YgYWNjcHRlZFJlc291cmNlUHJldmlld3MpIHtcblx0XHRcdC8vIERlbGV0ZSB0aGUgcHJldmlld1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwocHJldmlld1Jlc291cmNlKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHsgLyogaWdub3JlICovIH1cblx0XHR9XG5cblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVzb3VyY2VQcmV2aWV3cyhzbmlwcGV0c01lcmdlUmVzdWx0OiBJU25pcHBldHNNZXJnZVJlc3VsdCwgbG9jYWxGaWxlQ29udGVudDogSVN0cmluZ0RpY3Rpb25hcnk8SUZpbGVDb250ZW50PiwgcmVtb3RlU25pcHBldHM6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4sIGJhc2VTbmlwcGV0czogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPik6IElTbmlwcGV0c1Jlc291cmNlUHJldmlld1tdIHtcblx0XHRjb25zdCByZXNvdXJjZVByZXZpZXdzOiBNYXA8c3RyaW5nLCBJU25pcHBldHNSZXNvdXJjZVByZXZpZXc+ID0gbmV3IE1hcDxzdHJpbmcsIElTbmlwcGV0c1Jlc291cmNlUHJldmlldz4oKTtcblxuXHRcdC8qIFNuaXBwZXRzIGFkZGVkIHJlbW90ZWx5IC0+IGFkZCBsb2NhbGx5ICovXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoc25pcHBldHNNZXJnZVJlc3VsdC5sb2NhbC5hZGRlZCkpIHtcblx0XHRcdGNvbnN0IHByZXZpZXdSZXN1bHQ6IElNZXJnZVJlc3VsdCA9IHtcblx0XHRcdFx0Y29udGVudDogc25pcHBldHNNZXJnZVJlc3VsdC5sb2NhbC5hZGRlZFtrZXldLFxuXHRcdFx0XHRoYXNDb25mbGljdHM6IGZhbHNlLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLkFkZGVkLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0fTtcblx0XHRcdHJlc291cmNlUHJldmlld3Muc2V0KGtleSwge1xuXHRcdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSxcblx0XHRcdFx0YmFzZUNvbnRlbnQ6IG51bGwsXG5cdFx0XHRcdGZpbGVDb250ZW50OiBudWxsLFxuXHRcdFx0XHRsb2NhbFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pLFxuXHRcdFx0XHRsb2NhbENvbnRlbnQ6IG51bGwsXG5cdFx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSxcblx0XHRcdFx0cmVtb3RlQ29udGVudDogcmVtb3RlU25pcHBldHNba2V5XSxcblx0XHRcdFx0cHJldmlld1Jlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLFxuXHRcdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0LyogU25pcHBldHMgdXBkYXRlZCByZW1vdGVseSAtPiB1cGRhdGUgbG9jYWxseSAqL1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHNuaXBwZXRzTWVyZ2VSZXN1bHQubG9jYWwudXBkYXRlZCkpIHtcblx0XHRcdGNvbnN0IHByZXZpZXdSZXN1bHQ6IElNZXJnZVJlc3VsdCA9IHtcblx0XHRcdFx0Y29udGVudDogc25pcHBldHNNZXJnZVJlc3VsdC5sb2NhbC51cGRhdGVkW2tleV0sXG5cdFx0XHRcdGhhc0NvbmZsaWN0czogZmFsc2UsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTW9kaWZpZWQsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gbG9jYWxGaWxlQ29udGVudFtrZXldID8gbG9jYWxGaWxlQ29udGVudFtrZXldLnZhbHVlLnRvU3RyaW5nKCkgOiBudWxsO1xuXHRcdFx0cmVzb3VyY2VQcmV2aWV3cy5zZXQoa2V5LCB7XG5cdFx0XHRcdGJhc2VSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2Jhc2UnIH0pLFxuXHRcdFx0XHRiYXNlQ29udGVudDogYmFzZVNuaXBwZXRzW2tleV0gPz8gbnVsbCxcblx0XHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSxcblx0XHRcdFx0ZmlsZUNvbnRlbnQ6IGxvY2FsRmlsZUNvbnRlbnRba2V5XSxcblx0XHRcdFx0bG9jYWxDb250ZW50LFxuXHRcdFx0XHRyZW1vdGVSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSksXG5cdFx0XHRcdHJlbW90ZUNvbnRlbnQ6IHJlbW90ZVNuaXBwZXRzW2tleV0sXG5cdFx0XHRcdHByZXZpZXdSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KSxcblx0XHRcdFx0cHJldmlld1Jlc3VsdCxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IHByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogcHJldmlld1Jlc3VsdC5yZW1vdGVDaGFuZ2UsXG5cdFx0XHRcdGFjY2VwdGVkUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8qIFNuaXBwZXRzIHJlbW92ZWQgcmVtb3RlbHkgLT4gcmVtb3ZlIGxvY2FsbHkgKi9cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBzbmlwcGV0c01lcmdlUmVzdWx0LmxvY2FsLnJlbW92ZWQpIHtcblx0XHRcdGNvbnN0IHByZXZpZXdSZXN1bHQ6IElNZXJnZVJlc3VsdCA9IHtcblx0XHRcdFx0Y29udGVudDogbnVsbCxcblx0XHRcdFx0aGFzQ29uZmxpY3RzOiBmYWxzZSxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5EZWxldGVkLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGxvY2FsRmlsZUNvbnRlbnRba2V5XSA/IGxvY2FsRmlsZUNvbnRlbnRba2V5XS52YWx1ZS50b1N0cmluZygpIDogbnVsbDtcblx0XHRcdHJlc291cmNlUHJldmlld3Muc2V0KGtleSwge1xuXHRcdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSxcblx0XHRcdFx0YmFzZUNvbnRlbnQ6IGJhc2VTbmlwcGV0c1trZXldID8/IG51bGwsXG5cdFx0XHRcdGxvY2FsUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSksXG5cdFx0XHRcdGZpbGVDb250ZW50OiBsb2NhbEZpbGVDb250ZW50W2tleV0sXG5cdFx0XHRcdGxvY2FsQ29udGVudCxcblx0XHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pLFxuXHRcdFx0XHRyZW1vdGVDb250ZW50OiBudWxsLFxuXHRcdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSksXG5cdFx0XHRcdHByZXZpZXdSZXN1bHQsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LmxvY2FsQ2hhbmdlLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0XHRhY2NlcHRlZFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYWNjZXB0ZWQnIH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvKiBTbmlwcGV0cyBhZGRlZCBsb2NhbGx5IC0+IGFkZCByZW1vdGVseSAqL1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHNuaXBwZXRzTWVyZ2VSZXN1bHQucmVtb3RlLmFkZGVkKSkge1xuXHRcdFx0Y29uc3QgcHJldmlld1Jlc3VsdDogSU1lcmdlUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBzbmlwcGV0c01lcmdlUmVzdWx0LnJlbW90ZS5hZGRlZFtrZXldLFxuXHRcdFx0XHRoYXNDb25mbGljdHM6IGZhbHNlLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLkFkZGVkLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGxvY2FsRmlsZUNvbnRlbnRba2V5XSA/IGxvY2FsRmlsZUNvbnRlbnRba2V5XS52YWx1ZS50b1N0cmluZygpIDogbnVsbDtcblx0XHRcdHJlc291cmNlUHJldmlld3Muc2V0KGtleSwge1xuXHRcdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSxcblx0XHRcdFx0YmFzZUNvbnRlbnQ6IGJhc2VTbmlwcGV0c1trZXldID8/IG51bGwsXG5cdFx0XHRcdGxvY2FsUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSksXG5cdFx0XHRcdGZpbGVDb250ZW50OiBsb2NhbEZpbGVDb250ZW50W2tleV0sXG5cdFx0XHRcdGxvY2FsQ29udGVudCxcblx0XHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pLFxuXHRcdFx0XHRyZW1vdGVDb250ZW50OiBudWxsLFxuXHRcdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSksXG5cdFx0XHRcdHByZXZpZXdSZXN1bHQsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LmxvY2FsQ2hhbmdlLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0XHRhY2NlcHRlZFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYWNjZXB0ZWQnIH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvKiBTbmlwcGV0cyB1cGRhdGVkIGxvY2FsbHkgLT4gdXBkYXRlIHJlbW90ZWx5ICovXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoc25pcHBldHNNZXJnZVJlc3VsdC5yZW1vdGUudXBkYXRlZCkpIHtcblx0XHRcdGNvbnN0IHByZXZpZXdSZXN1bHQ6IElNZXJnZVJlc3VsdCA9IHtcblx0XHRcdFx0Y29udGVudDogc25pcHBldHNNZXJnZVJlc3VsdC5yZW1vdGUudXBkYXRlZFtrZXldLFxuXHRcdFx0XHRoYXNDb25mbGljdHM6IGZhbHNlLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk1vZGlmaWVkLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGxvY2FsRmlsZUNvbnRlbnRba2V5XSA/IGxvY2FsRmlsZUNvbnRlbnRba2V5XS52YWx1ZS50b1N0cmluZygpIDogbnVsbDtcblx0XHRcdHJlc291cmNlUHJldmlld3Muc2V0KGtleSwge1xuXHRcdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSxcblx0XHRcdFx0YmFzZUNvbnRlbnQ6IGJhc2VTbmlwcGV0c1trZXldID8/IG51bGwsXG5cdFx0XHRcdGxvY2FsUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSksXG5cdFx0XHRcdGZpbGVDb250ZW50OiBsb2NhbEZpbGVDb250ZW50W2tleV0sXG5cdFx0XHRcdGxvY2FsQ29udGVudCxcblx0XHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pLFxuXHRcdFx0XHRyZW1vdGVDb250ZW50OiByZW1vdGVTbmlwcGV0c1trZXldLFxuXHRcdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSksXG5cdFx0XHRcdHByZXZpZXdSZXN1bHQsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LmxvY2FsQ2hhbmdlLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0XHRhY2NlcHRlZFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYWNjZXB0ZWQnIH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvKiBTbmlwcGV0cyByZW1vdmVkIGxvY2FsbHkgLT4gcmVtb3ZlIHJlbW90ZWx5ICovXG5cdFx0Zm9yIChjb25zdCBrZXkgb2Ygc25pcHBldHNNZXJnZVJlc3VsdC5yZW1vdGUucmVtb3ZlZCkge1xuXHRcdFx0Y29uc3QgcHJldmlld1Jlc3VsdDogSU1lcmdlUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBudWxsLFxuXHRcdFx0XHRoYXNDb25mbGljdHM6IGZhbHNlLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLkRlbGV0ZWQsXG5cdFx0XHR9O1xuXHRcdFx0cmVzb3VyY2VQcmV2aWV3cy5zZXQoa2V5LCB7XG5cdFx0XHRcdGJhc2VSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2Jhc2UnIH0pLFxuXHRcdFx0XHRiYXNlQ29udGVudDogYmFzZVNuaXBwZXRzW2tleV0gPz8gbnVsbCxcblx0XHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSxcblx0XHRcdFx0ZmlsZUNvbnRlbnQ6IG51bGwsXG5cdFx0XHRcdGxvY2FsQ29udGVudDogbnVsbCxcblx0XHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pLFxuXHRcdFx0XHRyZW1vdGVDb250ZW50OiByZW1vdGVTbmlwcGV0c1trZXldLFxuXHRcdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSksXG5cdFx0XHRcdHByZXZpZXdSZXN1bHQsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LmxvY2FsQ2hhbmdlLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0XHRhY2NlcHRlZFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYWNjZXB0ZWQnIH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvKiBTbmlwcGV0cyB3aXRoIGNvbmZsaWN0cyAqL1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIHNuaXBwZXRzTWVyZ2VSZXN1bHQuY29uZmxpY3RzKSB7XG5cdFx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IGJhc2VTbmlwcGV0c1trZXldID8/IG51bGwsXG5cdFx0XHRcdGhhc0NvbmZsaWN0czogdHJ1ZSxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IGxvY2FsRmlsZUNvbnRlbnRba2V5XSA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5BZGRlZCxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiByZW1vdGVTbmlwcGV0c1trZXldID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLkFkZGVkXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gbG9jYWxGaWxlQ29udGVudFtrZXldID8gbG9jYWxGaWxlQ29udGVudFtrZXldLnZhbHVlLnRvU3RyaW5nKCkgOiBudWxsO1xuXHRcdFx0cmVzb3VyY2VQcmV2aWV3cy5zZXQoa2V5LCB7XG5cdFx0XHRcdGJhc2VSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2Jhc2UnIH0pLFxuXHRcdFx0XHRiYXNlQ29udGVudDogYmFzZVNuaXBwZXRzW2tleV0gPz8gbnVsbCxcblx0XHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSxcblx0XHRcdFx0ZmlsZUNvbnRlbnQ6IGxvY2FsRmlsZUNvbnRlbnRba2V5XSB8fCBudWxsLFxuXHRcdFx0XHRsb2NhbENvbnRlbnQsXG5cdFx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSxcblx0XHRcdFx0cmVtb3RlQ29udGVudDogcmVtb3RlU25pcHBldHNba2V5XSB8fCBudWxsLFxuXHRcdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSksXG5cdFx0XHRcdHByZXZpZXdSZXN1bHQsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LmxvY2FsQ2hhbmdlLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0XHRhY2NlcHRlZFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYWNjZXB0ZWQnIH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvKiBVbm1vZGlmaWVkIFNuaXBwZXRzICovXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMobG9jYWxGaWxlQ29udGVudCkpIHtcblx0XHRcdGlmICghcmVzb3VyY2VQcmV2aWV3cy5oYXMoa2V5KSkge1xuXHRcdFx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRcdFx0Y29udGVudDogbG9jYWxGaWxlQ29udGVudFtrZXldID8gbG9jYWxGaWxlQ29udGVudFtrZXldLnZhbHVlLnRvU3RyaW5nKCkgOiBudWxsLFxuXHRcdFx0XHRcdGhhc0NvbmZsaWN0czogZmFsc2UsXG5cdFx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk5vbmVcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gbG9jYWxGaWxlQ29udGVudFtrZXldID8gbG9jYWxGaWxlQ29udGVudFtrZXldLnZhbHVlLnRvU3RyaW5nKCkgOiBudWxsO1xuXHRcdFx0XHRyZXNvdXJjZVByZXZpZXdzLnNldChrZXksIHtcblx0XHRcdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSxcblx0XHRcdFx0XHRiYXNlQ29udGVudDogYmFzZVNuaXBwZXRzW2tleV0gPz8gbnVsbCxcblx0XHRcdFx0XHRsb2NhbFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pLFxuXHRcdFx0XHRcdGZpbGVDb250ZW50OiBsb2NhbEZpbGVDb250ZW50W2tleV0gfHwgbnVsbCxcblx0XHRcdFx0XHRsb2NhbENvbnRlbnQsXG5cdFx0XHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pLFxuXHRcdFx0XHRcdHJlbW90ZUNvbnRlbnQ6IHJlbW90ZVNuaXBwZXRzW2tleV0gfHwgbnVsbCxcblx0XHRcdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSksXG5cdFx0XHRcdFx0cHJldmlld1Jlc3VsdCxcblx0XHRcdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0XHRcdGFjY2VwdGVkUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSlcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi5yZXNvdXJjZVByZXZpZXdzLnZhbHVlcygpXTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlc29sdmVDb250ZW50KHVyaTogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWxPclBhcmVudCh1cmksIHRoaXMuc3luY1ByZXZpZXdGb2xkZXIud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pKVxuXHRcdFx0fHwgdGhpcy5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHVyaSwgdGhpcy5zeW5jUHJldmlld0ZvbGRlci53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSlcblx0XHRcdHx8IHRoaXMuZXh0VXJpLmlzRXF1YWxPclBhcmVudCh1cmksIHRoaXMuc3luY1ByZXZpZXdGb2xkZXIud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSlcblx0XHRcdHx8IHRoaXMuZXh0VXJpLmlzRXF1YWxPclBhcmVudCh1cmksIHRoaXMuc3luY1ByZXZpZXdGb2xkZXIud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSkpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlUHJldmlld0NvbnRlbnQodXJpKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRhc3luYyBoYXNMb2NhbERhdGEoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxvY2FsU25pcHBldHMgPSBhd2FpdCB0aGlzLmdldFNuaXBwZXRzRmlsZUNvbnRlbnRzKCk7XG5cdFx0XHRpZiAoT2JqZWN0LmtleXMobG9jYWxTbmlwcGV0cykubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvKiBpZ25vcmUgZXJyb3IgKi9cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVMb2NhbEJhY2t1cChyZXNvdXJjZVByZXZpZXdzOiBJRmlsZVJlc291cmNlUHJldmlld1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbG9jYWw6IElTdHJpbmdEaWN0aW9uYXJ5PElGaWxlQ29udGVudD4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IHJlc291cmNlUHJldmlldyBvZiByZXNvdXJjZVByZXZpZXdzKSB7XG5cdFx0XHRpZiAocmVzb3VyY2VQcmV2aWV3LmZpbGVDb250ZW50KSB7XG5cdFx0XHRcdGxvY2FsW3RoaXMuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlUHJldmlldy5sb2NhbFJlc291cmNlKV0gPSByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuYmFja3VwTG9jYWwoSlNPTi5zdHJpbmdpZnkodGhpcy50b1NuaXBwZXRzQ29udGVudHMobG9jYWwpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUxvY2FsU25pcHBldHMocmVzb3VyY2VQcmV2aWV3czogSVNuaXBwZXRzQWNjZXB0ZWRSZXNvdXJjZVByZXZpZXdbXSwgZm9yY2U6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHsgZmlsZUNvbnRlbnQsIGFjY2VwdFJlc3VsdCwgbG9jYWxSZXNvdXJjZSwgcmVtb3RlUmVzb3VyY2UsIGxvY2FsQ2hhbmdlIH0gb2YgcmVzb3VyY2VQcmV2aWV3cykge1xuXHRcdFx0aWYgKGxvY2FsQ2hhbmdlICE9PSBDaGFuZ2UuTm9uZSkge1xuXHRcdFx0XHRjb25zdCBrZXkgPSByZW1vdGVSZXNvdXJjZSA/IHRoaXMuZXh0VXJpLmJhc2VuYW1lKHJlbW90ZVJlc291cmNlKSA6IHRoaXMuZXh0VXJpLmJhc2VuYW1lKGxvY2FsUmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc25pcHBldHNGb2xkZXIsIGtleSk7XG5cblx0XHRcdFx0Ly8gUmVtb3ZlZFxuXHRcdFx0XHRpZiAobG9jYWxDaGFuZ2UgPT09IENoYW5nZS5EZWxldGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBEZWxldGluZyBzbmlwcGV0Li4uYCwgdGhpcy5leHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChyZXNvdXJjZSk7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IERlbGV0ZWQgc25pcHBldGAsIHRoaXMuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBZGRlZFxuXHRcdFx0XHRlbHNlIGlmIChsb2NhbENoYW5nZSA9PT0gQ2hhbmdlLkFkZGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBDcmVhdGluZyBzbmlwcGV0Li4uYCwgdGhpcy5leHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNyZWF0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoYWNjZXB0UmVzdWx0LmNvbnRlbnQhKSwgeyBvdmVyd3JpdGU6IGZvcmNlIH0pO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBDcmVhdGVkIHNuaXBwZXRgLCB0aGlzLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVXBkYXRlZFxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0aW5nIHNuaXBwZXQuLi5gLCB0aGlzLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSkpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGFjY2VwdFJlc3VsdC5jb250ZW50ISksIGZvcmNlID8gdW5kZWZpbmVkIDogZmlsZUNvbnRlbnQhKTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCBzbmlwcGV0YCwgdGhpcy5leHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlUmVtb3RlU25pcHBldHMocmVzb3VyY2VQcmV2aWV3czogSVNuaXBwZXRzQWNjZXB0ZWRSZXNvdXJjZVByZXZpZXdbXSwgcmVtb3RlVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSwgZm9yY2VQdXNoOiBib29sZWFuKTogUHJvbWlzZTxJUmVtb3RlVXNlckRhdGE+IHtcblx0XHRjb25zdCBjdXJyZW50U25pcHBldHM6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4gPSByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSA/IHRoaXMucGFyc2VTbmlwcGV0cyhyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSkgOiB7fTtcblx0XHRjb25zdCBuZXdTbmlwcGV0czogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiA9IGRlZXBDbG9uZShjdXJyZW50U25pcHBldHMpO1xuXG5cdFx0Zm9yIChjb25zdCB7IGFjY2VwdFJlc3VsdCwgbG9jYWxSZXNvdXJjZSwgcmVtb3RlUmVzb3VyY2UsIHJlbW90ZUNoYW5nZSB9IG9mIHJlc291cmNlUHJldmlld3MpIHtcblx0XHRcdGlmIChyZW1vdGVDaGFuZ2UgIT09IENoYW5nZS5Ob25lKSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IGxvY2FsUmVzb3VyY2UgPyB0aGlzLmV4dFVyaS5iYXNlbmFtZShsb2NhbFJlc291cmNlKSA6IHRoaXMuZXh0VXJpLmJhc2VuYW1lKHJlbW90ZVJlc291cmNlKTtcblx0XHRcdFx0aWYgKHJlbW90ZUNoYW5nZSA9PT0gQ2hhbmdlLkRlbGV0ZWQpIHtcblx0XHRcdFx0XHRkZWxldGUgbmV3U25pcHBldHNba2V5XTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRuZXdTbmlwcGV0c1trZXldID0gYWNjZXB0UmVzdWx0LmNvbnRlbnQhO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFhcmVTYW1lKGN1cnJlbnRTbmlwcGV0cywgbmV3U25pcHBldHMpKSB7XG5cdFx0XHQvLyB1cGRhdGUgcmVtb3RlXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0aW5nIHJlbW90ZSBzbmlwcGV0cy4uLmApO1xuXHRcdFx0cmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0aGlzLnVwZGF0ZVJlbW90ZVVzZXJEYXRhKEpTT04uc3RyaW5naWZ5KG5ld1NuaXBwZXRzKSwgZm9yY2VQdXNoID8gbnVsbCA6IHJlbW90ZVVzZXJEYXRhLnJlZik7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCByZW1vdGUgc25pcHBldHNgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlbW90ZVVzZXJEYXRhO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZVNuaXBwZXRzKHN5bmNEYXRhOiBJU3luY0RhdGEpOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gcGFyc2VTbmlwcGV0cyhzeW5jRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIHRvU25pcHBldHNDb250ZW50cyhzbmlwcGV0c0ZpbGVDb250ZW50czogSVN0cmluZ0RpY3Rpb25hcnk8SUZpbGVDb250ZW50Pik6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4ge1xuXHRcdGNvbnN0IHNuaXBwZXRzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+ID0ge307XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoc25pcHBldHNGaWxlQ29udGVudHMpKSB7XG5cdFx0XHRzbmlwcGV0c1trZXldID0gc25pcHBldHNGaWxlQ29udGVudHNba2V5XS52YWx1ZS50b1N0cmluZygpO1xuXHRcdH1cblx0XHRyZXR1cm4gc25pcHBldHM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFNuaXBwZXRzRmlsZUNvbnRlbnRzKCk6IFByb21pc2U8SVN0cmluZ0RpY3Rpb25hcnk8SUZpbGVDb250ZW50Pj4ge1xuXHRcdGNvbnN0IHNuaXBwZXRzOiBJU3RyaW5nRGljdGlvbmFyeTxJRmlsZUNvbnRlbnQ+ID0ge307XG5cdFx0bGV0IHN0YXQ6IElGaWxlU3RhdDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZSh0aGlzLnNuaXBwZXRzRm9sZGVyKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBObyBzbmlwcGV0c1xuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBGaWxlT3BlcmF0aW9uRXJyb3IgJiYgZS5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHJldHVybiBzbmlwcGV0cztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZW50cnkgb2Ygc3RhdC5jaGlsZHJlbiB8fCBbXSkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBlbnRyeS5yZXNvdXJjZTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZXh0VXJpLmV4dG5hbWUocmVzb3VyY2UpO1xuXHRcdFx0aWYgKGV4dGVuc2lvbiA9PT0gJy5qc29uJyB8fCBleHRlbnNpb24gPT09ICcuY29kZS1zbmlwcGV0cycpIHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gdGhpcy5leHRVcmkucmVsYXRpdmVQYXRoKHRoaXMuc25pcHBldHNGb2xkZXIsIHJlc291cmNlKSE7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRcdFx0c25pcHBldHNba2V5XSA9IGNvbnRlbnQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBzbmlwcGV0cztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU25pcHBldHNJbml0aWFsaXplciBleHRlbmRzIEFic3RyYWN0SW5pdGlhbGl6ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihTeW5jUmVzb3VyY2UuU25pcHBldHMsIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGxvZ1NlcnZpY2UsIGZpbGVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBkb0luaXRpYWxpemUocmVtb3RlVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlbW90ZVNuaXBwZXRzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+IHwgbnVsbCA9IHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhID8gSlNPTi5wYXJzZShyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YS5jb250ZW50KSA6IG51bGw7XG5cdFx0aWYgKCFyZW1vdGVTbmlwcGV0cykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1NraXBwaW5nIGluaXRpYWxpemluZyBzbmlwcGV0cyBiZWNhdXNlIHJlbW90ZSBzbmlwcGV0cyBkb2VzIG5vdCBleGlzdC4nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc0VtcHR5ID0gYXdhaXQgdGhpcy5pc0VtcHR5KCk7XG5cdFx0aWYgKCFpc0VtcHR5KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnU2tpcHBpbmcgaW5pdGlhbGl6aW5nIHNuaXBwZXRzIGJlY2F1c2UgbG9jYWwgc25pcHBldHMgZXhpc3QuJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocmVtb3RlU25pcHBldHMpKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gcmVtb3RlU25pcHBldHNba2V5XTtcblx0XHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUsIGtleSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdDcmVhdGVkIHNuaXBwZXQnLCB0aGlzLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMudXBkYXRlTGFzdFN5bmNVc2VyRGF0YShyZW1vdGVVc2VyRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGlzRW1wdHkoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUpO1xuXHRcdFx0cmV0dXJuICFzdGF0LmNoaWxkcmVuPy5sZW5ndGg7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHJldHVybiAoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORDtcblx0XHR9XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUd6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0IscUJBQW1DLG9CQUErQjtBQUMvRixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUEyQixnQ0FBZ0M7QUFDM0QsU0FBUyxxQkFBcUIsNEJBQStFO0FBQzdHLFNBQVMsU0FBK0MsYUFBYTtBQUNyRSxTQUFTLFFBQW9DLGdDQUF1RCx5QkFBeUIsZ0NBQWdDLDJCQUEyQixjQUFjLDZCQUE2QjtBQVU1TixTQUFTLGNBQWMsVUFBZ0Q7QUFDN0UsU0FBTyxLQUFLLE1BQU0sU0FBUyxPQUFPO0FBQ25DO0FBRU8sSUFBTSx1QkFBTixjQUFtQyxxQkFBc0Q7QUFBQSxFQUsvRixZQUNDLFNBQ0EsWUFDcUIsb0JBQ1AsYUFDRyxnQkFDVSwwQkFDSywrQkFDUCxZQUNGLHNCQUNTLCtCQUNiLGtCQUNFLG9CQUNwQjtBQUNELFVBQU0sRUFBRSxjQUFjLGFBQWEsVUFBVSxRQUFRLEdBQUcsWUFBWSxhQUFhLG9CQUFvQixnQkFBZ0IsMEJBQTBCLCtCQUErQiwrQkFBK0Isa0JBQWtCLFlBQVksc0JBQXNCLGtCQUFrQjtBQWpCcFIsU0FBbUIsVUFBa0I7QUFrQnBDLFNBQUssaUJBQWlCLFFBQVE7QUFDOUIsU0FBSyxVQUFVLEtBQUssWUFBWSxNQUFNLG1C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
