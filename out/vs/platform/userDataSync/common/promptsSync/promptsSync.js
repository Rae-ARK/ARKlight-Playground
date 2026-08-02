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
import { Event } from "../../../../base/common/event.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { deepClone } from "../../../../base/common/objects.js";
import { IStorageService } from "../../../storage/common/storage.js";
import { ITelemetryService } from "../../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../../uriIdentity/common/uriIdentity.js";
import { IEnvironmentService } from "../../../environment/common/environment.js";
import { IConfigurationService } from "../../../configuration/common/configuration.js";
import { areSame, merge } from "./promptsMerge.js";
import { AbstractSynchroniser } from "../abstractSynchronizer.js";
import { FileOperationError, FileOperationResult, IFileService } from "../../../files/common/files.js";
import { Change, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, USER_DATA_SYNC_SCHEME } from "../userDataSync.js";
function parsePrompts(syncData) {
  return JSON.parse(syncData.content);
}
let PromptsSynchronizer = class extends AbstractSynchroniser {
  constructor(profile, collection, environmentService, fileService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, logService, configurationService, userDataSyncEnablementService, telemetryService, uriIdentityService) {
    const syncResource = { syncResource: SyncResource.Prompts, profile };
    super(
      syncResource,
      collection,
      fileService,
      environmentService,
      storageService,
      userDataSyncStoreService,
      userDataSyncLocalStoreService,
      userDataSyncEnablementService,
      telemetryService,
      logService,
      configurationService,
      uriIdentityService
    );
    this.version = 1;
    this.promptsFolder = profile.promptsHome;
    this._register(this.fileService.watch(environmentService.userRoamingDataHome));
    this._register(this.fileService.watch(this.promptsFolder));
    this._register(Event.filter(this.fileService.onDidFilesChange, (e) => e.affects(this.promptsFolder))(() => this.triggerLocalChange()));
  }
  async generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine) {
    const local = await this.getPromptsFileContents();
    const localPrompts = this.toPromptContents(local);
    const remotePrompts = remoteUserData.syncData ? this.parsePrompts(remoteUserData.syncData) : null;
    lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
    const lastSyncPrompts = lastSyncUserData && lastSyncUserData.syncData ? this.parsePrompts(lastSyncUserData.syncData) : null;
    if (remotePrompts) {
      this.logService.trace(`${this.syncResourceLogLabel}: Merging remote prompts with local prompts...`);
    } else {
      this.logService.trace(`${this.syncResourceLogLabel}: Remote prompts does not exist. Synchronizing prompts for the first time.`);
    }
    const mergeResult = merge(localPrompts, remotePrompts, lastSyncPrompts);
    return this.getResourcePreviews(mergeResult, local, remotePrompts || {}, lastSyncPrompts || {});
  }
  async hasRemoteChanged(lastSyncUserData) {
    const lastSync = lastSyncUserData.syncData ? this.parsePrompts(lastSyncUserData.syncData) : null;
    if (lastSync === null) {
      return true;
    }
    const local = await this.getPromptsFileContents();
    const localPrompts = this.toPromptContents(local);
    const mergeResult = merge(localPrompts, lastSync, lastSync);
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
      this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing prompts.`);
    }
    if (accptedResourcePreviews.some(({ localChange }) => localChange !== Change.None)) {
      await this.updateLocalBackup(accptedResourcePreviews);
      await this.updateLocalPrompts(accptedResourcePreviews, force);
    }
    if (accptedResourcePreviews.some(({ remoteChange }) => remoteChange !== Change.None)) {
      remoteUserData = await this.updateRemotePrompts(accptedResourcePreviews, remoteUserData, force);
    }
    if (lastSyncUserData?.ref !== remoteUserData.ref) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized prompts...`);
      await this.updateLastSyncUserData(remoteUserData);
      this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized prompts`);
    }
    for (const { previewResource } of accptedResourcePreviews) {
      try {
        await this.fileService.del(previewResource);
      } catch (e) {
      }
    }
  }
  getResourcePreviews(mergeResult, localFileContent, remote, base) {
    const resourcePreviews = /* @__PURE__ */ new Map();
    for (const key of Object.keys(mergeResult.local.added)) {
      const previewResult = {
        content: mergeResult.local.added[key],
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
        remoteContent: remote[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of Object.keys(mergeResult.local.updated)) {
      const previewResult = {
        content: mergeResult.local.updated[key],
        hasConflicts: false,
        localChange: Change.Modified,
        remoteChange: Change.None
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: base[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key],
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remote[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of mergeResult.local.removed) {
      const previewResult = {
        content: null,
        hasConflicts: false,
        localChange: Change.Deleted,
        remoteChange: Change.None
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: base[key] ?? null,
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
    for (const key of Object.keys(mergeResult.remote.added)) {
      const previewResult = {
        content: mergeResult.remote.added[key],
        hasConflicts: false,
        localChange: Change.None,
        remoteChange: Change.Added
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: base[key] ?? null,
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
    for (const key of Object.keys(mergeResult.remote.updated)) {
      const previewResult = {
        content: mergeResult.remote.updated[key],
        hasConflicts: false,
        localChange: Change.None,
        remoteChange: Change.Modified
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: base[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key],
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remote[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of mergeResult.remote.removed) {
      const previewResult = {
        content: null,
        hasConflicts: false,
        localChange: Change.None,
        remoteChange: Change.Deleted
      };
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: base[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: null,
        localContent: null,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remote[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of mergeResult.conflicts) {
      const previewResult = {
        content: base[key] ?? null,
        hasConflicts: true,
        localChange: localFileContent[key] ? Change.Modified : Change.Added,
        remoteChange: remote[key] ? Change.Modified : Change.Added
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: base[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key] || null,
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remote[key] || null,
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
          baseContent: base[key] ?? null,
          localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
          fileContent: localFileContent[key] || null,
          localContent,
          remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
          remoteContent: remote[key] || null,
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
      const local = await this.getPromptsFileContents();
      if (Object.keys(local).length) {
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
    await this.backupLocal(JSON.stringify(this.toPromptContents(local)));
  }
  async updateLocalPrompts(resourcePreviews, force) {
    for (const { fileContent, acceptResult, localResource, remoteResource, localChange } of resourcePreviews) {
      if (localChange !== Change.None) {
        const key = remoteResource ? this.extUri.basename(remoteResource) : this.extUri.basename(localResource);
        const resource = this.extUri.joinPath(this.promptsFolder, key);
        if (localChange === Change.Deleted) {
          this.logService.trace(`${this.syncResourceLogLabel}: Deleting prompt...`, this.extUri.basename(resource));
          await this.fileService.del(resource);
          this.logService.info(`${this.syncResourceLogLabel}: Deleted prompt`, this.extUri.basename(resource));
        } else if (localChange === Change.Added) {
          this.logService.trace(`${this.syncResourceLogLabel}: Creating prompt...`, this.extUri.basename(resource));
          await this.fileService.createFile(resource, VSBuffer.fromString(acceptResult.content), { overwrite: force });
          this.logService.info(`${this.syncResourceLogLabel}: Created prompt`, this.extUri.basename(resource));
        } else {
          this.logService.trace(`${this.syncResourceLogLabel}: Updating prompt...`, this.extUri.basename(resource));
          await this.fileService.writeFile(resource, VSBuffer.fromString(acceptResult.content), force ? void 0 : fileContent);
          this.logService.info(`${this.syncResourceLogLabel}: Updated prompt`, this.extUri.basename(resource));
        }
      }
    }
  }
  async updateRemotePrompts(resourcePreviews, remoteUserData, forcePush) {
    const currentPrompts = remoteUserData.syncData ? this.parsePrompts(remoteUserData.syncData) : {};
    const newPrompts = deepClone(currentPrompts);
    for (const { acceptResult, localResource, remoteResource, remoteChange } of resourcePreviews) {
      if (remoteChange !== Change.None) {
        const key = localResource ? this.extUri.basename(localResource) : this.extUri.basename(remoteResource);
        if (remoteChange === Change.Deleted) {
          delete newPrompts[key];
        } else {
          newPrompts[key] = acceptResult.content;
        }
      }
    }
    if (!areSame(currentPrompts, newPrompts)) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating remote prompts...`);
      remoteUserData = await this.updateRemoteUserData(JSON.stringify(newPrompts), forcePush ? null : remoteUserData.ref);
      this.logService.info(`${this.syncResourceLogLabel}: Updated remote prompts`);
    }
    return remoteUserData;
  }
  parsePrompts(syncData) {
    return parsePrompts(syncData);
  }
  toPromptContents(fileContents) {
    const prompts = {};
    for (const key of Object.keys(fileContents)) {
      prompts[key] = fileContents[key].value.toString();
    }
    return prompts;
  }
  async getPromptsFileContents() {
    const prompts = {};
    let stat;
    try {
      stat = await this.fileService.resolve(this.promptsFolder);
    } catch (e) {
      if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
        return prompts;
      } else {
        throw e;
      }
    }
    for (const entry of stat.children || []) {
      const resource = entry.resource;
      const path = resource.path;
      if ([".prompt.md", ".instructions.md", ".chatmode.md", ".agent.md"].some((ext) => path.endsWith(ext))) {
        const key = this.extUri.relativePath(this.promptsFolder, resource);
        const content = await this.fileService.readFile(resource);
        prompts[key] = content;
      }
    }
    return prompts;
  }
};
PromptsSynchronizer = __decorateClass([
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
], PromptsSynchronizer);
export {
  PromptsSynchronizer,
  parsePrompts
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vcHJvbXB0c1N5bmMvcHJvbXB0c1N5bmMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5cbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUgfSBmcm9tICcuLi8uLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGFyZVNhbWUsIElNZXJnZVJlc3VsdCBhcyBJUHJvbXB0c01lcmdlUmVzdWx0LCBtZXJnZSB9IGZyb20gJy4vcHJvbXB0c01lcmdlLmpzJztcbmltcG9ydCB7IEFic3RyYWN0U3luY2hyb25pc2VyLCBJQWNjZXB0UmVzdWx0LCBJRmlsZVJlc291cmNlUHJldmlldywgSU1lcmdlUmVzdWx0IH0gZnJvbSAnLi4vYWJzdHJhY3RTeW5jaHJvbml6ZXIuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZUNvbnRlbnQsIElGaWxlU2VydmljZSwgSUZpbGVTdGF0IH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IENoYW5nZSwgSVJlbW90ZVVzZXJEYXRhLCBJU3luY0RhdGEsIElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSwgSVVzZXJEYXRhU3luY2hyb25pc2VyLCBJVXNlckRhdGFTeW5jTG9nU2VydmljZSwgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLCBTeW5jUmVzb3VyY2UsIFVTRVJfREFUQV9TWU5DX1NDSEVNRSB9IGZyb20gJy4uL3VzZXJEYXRhU3luYy5qcyc7XG5cbmludGVyZmFjZSBJUHJvbXB0c1Jlc291cmNlUHJldmlldyBleHRlbmRzIElGaWxlUmVzb3VyY2VQcmV2aWV3IHtcblx0cHJldmlld1Jlc3VsdDogSU1lcmdlUmVzdWx0O1xufVxuXG5pbnRlcmZhY2UgSVByb21wdHNBY2NlcHRlZFJlc291cmNlUHJldmlldyBleHRlbmRzIElGaWxlUmVzb3VyY2VQcmV2aWV3IHtcblx0YWNjZXB0UmVzdWx0OiBJQWNjZXB0UmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VQcm9tcHRzKHN5bmNEYXRhOiBJU3luY0RhdGEpOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+IHtcblx0cmV0dXJuIEpTT04ucGFyc2Uoc3luY0RhdGEuY29udGVudCk7XG59XG5cbi8qKlxuICogU3luY2hyb25pemVyIGNsYXNzIGZvciB0aGUgXCJ1c2VyXCIgcHJvbXB0IGZpbGVzLlxuICogQWRvcHRlZCBmcm9tIHtAbGluayBTbmlwcGV0c1N5bmNocm9uaXNlcn0uXG4gKi9cbmV4cG9ydCBjbGFzcyBQcm9tcHRzU3luY2hyb25pemVyIGV4dGVuZHMgQWJzdHJhY3RTeW5jaHJvbmlzZXIgaW1wbGVtZW50cyBJVXNlckRhdGFTeW5jaHJvbmlzZXIge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSB2ZXJzaW9uOiBudW1iZXIgPSAxO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb21wdHNGb2xkZXI6IFVSSTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLFxuXHRcdGNvbGxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IHN5bmNSZXNvdXJjZSA9IHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuUHJvbXB0cywgcHJvZmlsZSB9O1xuXHRcdHN1cGVyKFxuXHRcdFx0c3luY1Jlc291cmNlLFxuXHRcdFx0Y29sbGVjdGlvbixcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0ZW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHR1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFx0XHR1c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSxcblx0XHRcdHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdFx0dGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHVyaUlkZW50aXR5U2VydmljZSxcblx0XHQpO1xuXG5cdFx0dGhpcy5wcm9tcHRzRm9sZGVyID0gcHJvZmlsZS5wcm9tcHRzSG9tZTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKGVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS53YXRjaCh0aGlzLnByb21wdHNGb2xkZXIpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlLCBlID0+IGUuYWZmZWN0cyh0aGlzLnByb21wdHNGb2xkZXIpKSgoKSA9PiB0aGlzLnRyaWdnZXJMb2NhbENoYW5nZSgpKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2VuZXJhdGVTeW5jUHJldmlldyhyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCBpc1JlbW90ZURhdGFGcm9tQ3VycmVudE1hY2hpbmU6IGJvb2xlYW4pOiBQcm9taXNlPElQcm9tcHRzUmVzb3VyY2VQcmV2aWV3W10+IHtcblx0XHRjb25zdCBsb2NhbCA9IGF3YWl0IHRoaXMuZ2V0UHJvbXB0c0ZpbGVDb250ZW50cygpO1xuXHRcdGNvbnN0IGxvY2FsUHJvbXB0cyA9IHRoaXMudG9Qcm9tcHRDb250ZW50cyhsb2NhbCk7XG5cdFx0Y29uc3QgcmVtb3RlUHJvbXB0czogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiB8IG51bGwgPSByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSA/IHRoaXMucGFyc2VQcm9tcHRzKHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhKSA6IG51bGw7XG5cblx0XHQvLyBVc2UgcmVtb3RlIGRhdGEgYXMgbGFzdCBzeW5jIGRhdGEgaWYgbGFzdCBzeW5jIGRhdGEgZG9lcyBub3QgZXhpc3QgYW5kIHJlbW90ZSBkYXRhIGlzIGZyb20gc2FtZSBtYWNoaW5lXG5cdFx0bGFzdFN5bmNVc2VyRGF0YSA9IGxhc3RTeW5jVXNlckRhdGEgPT09IG51bGwgJiYgaXNSZW1vdGVEYXRhRnJvbUN1cnJlbnRNYWNoaW5lID8gcmVtb3RlVXNlckRhdGEgOiBsYXN0U3luY1VzZXJEYXRhO1xuXHRcdGNvbnN0IGxhc3RTeW5jUHJvbXB0czogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiB8IG51bGwgPSBsYXN0U3luY1VzZXJEYXRhICYmIGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEgPyB0aGlzLnBhcnNlUHJvbXB0cyhsYXN0U3luY1VzZXJEYXRhLnN5bmNEYXRhKSA6IG51bGw7XG5cblx0XHRpZiAocmVtb3RlUHJvbXB0cykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBNZXJnaW5nIHJlbW90ZSBwcm9tcHRzIHdpdGggbG9jYWwgcHJvbXB0cy4uLmApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFJlbW90ZSBwcm9tcHRzIGRvZXMgbm90IGV4aXN0LiBTeW5jaHJvbml6aW5nIHByb21wdHMgZm9yIHRoZSBmaXJzdCB0aW1lLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lcmdlUmVzdWx0ID0gbWVyZ2UobG9jYWxQcm9tcHRzLCByZW1vdGVQcm9tcHRzLCBsYXN0U3luY1Byb21wdHMpO1xuXHRcdHJldHVybiB0aGlzLmdldFJlc291cmNlUHJldmlld3MobWVyZ2VSZXN1bHQsIGxvY2FsLCByZW1vdGVQcm9tcHRzIHx8IHt9LCBsYXN0U3luY1Byb21wdHMgfHwge30pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGhhc1JlbW90ZUNoYW5nZWQobGFzdFN5bmNVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgbGFzdFN5bmM6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4gfCBudWxsID0gbGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSA/IHRoaXMucGFyc2VQcm9tcHRzKGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEpIDogbnVsbDtcblx0XHRpZiAobGFzdFN5bmMgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBsb2NhbCA9IGF3YWl0IHRoaXMuZ2V0UHJvbXB0c0ZpbGVDb250ZW50cygpO1xuXHRcdGNvbnN0IGxvY2FsUHJvbXB0cyA9IHRoaXMudG9Qcm9tcHRDb250ZW50cyhsb2NhbCk7XG5cdFx0Y29uc3QgbWVyZ2VSZXN1bHQgPSBtZXJnZShsb2NhbFByb21wdHMsIGxhc3RTeW5jLCBsYXN0U3luYyk7XG5cdFx0cmV0dXJuIE9iamVjdC5rZXlzKG1lcmdlUmVzdWx0LnJlbW90ZS5hZGRlZCkubGVuZ3RoID4gMCB8fCBPYmplY3Qua2V5cyhtZXJnZVJlc3VsdC5yZW1vdGUudXBkYXRlZCkubGVuZ3RoID4gMCB8fCBtZXJnZVJlc3VsdC5yZW1vdGUucmVtb3ZlZC5sZW5ndGggPiAwIHx8IG1lcmdlUmVzdWx0LmNvbmZsaWN0cy5sZW5ndGggPiAwO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldE1lcmdlUmVzdWx0KHJlc291cmNlUHJldmlldzogSVByb21wdHNSZXNvdXJjZVByZXZpZXcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SU1lcmdlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHJlc291cmNlUHJldmlldy5wcmV2aWV3UmVzdWx0O1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldEFjY2VwdFJlc3VsdChyZXNvdXJjZVByZXZpZXc6IElQcm9tcHRzUmVzb3VyY2VQcmV2aWV3LCByZXNvdXJjZTogVVJJLCBjb250ZW50OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBY2NlcHRSZXN1bHQ+IHtcblxuXHRcdC8qIEFjY2VwdCBsb2NhbCByZXNvdXJjZSAqL1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQocmVzb3VyY2UsIHRoaXMuc3luY1ByZXZpZXdGb2xkZXIud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSkpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQgPyByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSA6IG51bGwsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnRcblx0XHRcdFx0XHQ/IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50ICE9PSBudWxsID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLkFkZGVkXG5cdFx0XHRcdFx0OiBDaGFuZ2UuRGVsZXRlZFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvKiBBY2NlcHQgcmVtb3RlIHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgdGhpcy5zeW5jUHJldmlld0ZvbGRlci53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSkpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50ICE9PSBudWxsXG5cdFx0XHRcdFx0PyByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuQWRkZWRcblx0XHRcdFx0XHQ6IENoYW5nZS5EZWxldGVkLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvKiBBY2NlcHQgcHJldmlldyByZXNvdXJjZSAqL1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQocmVzb3VyY2UsIHRoaXMuc3luY1ByZXZpZXdGb2xkZXIpKSB7XG5cdFx0XHRpZiAoY29udGVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y29udGVudDogcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQuY29udGVudCxcblx0XHRcdFx0XHRsb2NhbENoYW5nZTogcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRcdFx0cmVtb3RlQ2hhbmdlOiByZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdC5yZW1vdGVDaGFuZ2UsXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdFx0bG9jYWxDaGFuZ2U6IGNvbnRlbnQgPT09IG51bGxcblx0XHRcdFx0XHRcdD8gcmVzb3VyY2VQcmV2aWV3LmZpbGVDb250ZW50ICE9PSBudWxsID8gQ2hhbmdlLkRlbGV0ZWQgOiBDaGFuZ2UuTm9uZVxuXHRcdFx0XHRcdFx0OiBDaGFuZ2UuTW9kaWZpZWQsXG5cdFx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBjb250ZW50ID09PSBudWxsXG5cdFx0XHRcdFx0XHQ/IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50ICE9PSBudWxsID8gQ2hhbmdlLkRlbGV0ZWQgOiBDaGFuZ2UuTm9uZVxuXHRcdFx0XHRcdFx0OiBDaGFuZ2UuTW9kaWZpZWRcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgUmVzb3VyY2U6ICR7cmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBhcHBseVJlc3VsdChyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCByZXNvdXJjZVByZXZpZXdzOiBbSVByb21wdHNSZXNvdXJjZVByZXZpZXcsIElBY2NlcHRSZXN1bHRdW10sIGZvcmNlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYWNjcHRlZFJlc291cmNlUHJldmlld3M6IElQcm9tcHRzQWNjZXB0ZWRSZXNvdXJjZVByZXZpZXdbXSA9IHJlc291cmNlUHJldmlld3MubWFwKChbcmVzb3VyY2VQcmV2aWV3LCBhY2NlcHRSZXN1bHRdKSA9PiAoeyAuLi5yZXNvdXJjZVByZXZpZXcsIGFjY2VwdFJlc3VsdCB9KSk7XG5cdFx0aWYgKGFjY3B0ZWRSZXNvdXJjZVByZXZpZXdzLmV2ZXJ5KCh7IGxvY2FsQ2hhbmdlLCByZW1vdGVDaGFuZ2UgfSkgPT4gbG9jYWxDaGFuZ2UgPT09IENoYW5nZS5Ob25lICYmIHJlbW90ZUNoYW5nZSA9PT0gQ2hhbmdlLk5vbmUpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogTm8gY2hhbmdlcyBmb3VuZCBkdXJpbmcgc3luY2hyb25pemluZyBwcm9tcHRzLmApO1xuXHRcdH1cblxuXHRcdGlmIChhY2NwdGVkUmVzb3VyY2VQcmV2aWV3cy5zb21lKCh7IGxvY2FsQ2hhbmdlIH0pID0+IGxvY2FsQ2hhbmdlICE9PSBDaGFuZ2UuTm9uZSkpIHtcblx0XHRcdC8vIGJhY2sgdXAgYWxsIHByb21wdHNcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTG9jYWxCYWNrdXAoYWNjcHRlZFJlc291cmNlUHJldmlld3MpO1xuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVMb2NhbFByb21wdHMoYWNjcHRlZFJlc291cmNlUHJldmlld3MsIGZvcmNlKTtcblx0XHR9XG5cblx0XHRpZiAoYWNjcHRlZFJlc291cmNlUHJldmlld3Muc29tZSgoeyByZW1vdGVDaGFuZ2UgfSkgPT4gcmVtb3RlQ2hhbmdlICE9PSBDaGFuZ2UuTm9uZSkpIHtcblx0XHRcdHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGhpcy51cGRhdGVSZW1vdGVQcm9tcHRzKGFjY3B0ZWRSZXNvdXJjZVByZXZpZXdzLCByZW1vdGVVc2VyRGF0YSwgZm9yY2UpO1xuXHRcdH1cblxuXHRcdGlmIChsYXN0U3luY1VzZXJEYXRhPy5yZWYgIT09IHJlbW90ZVVzZXJEYXRhLnJlZikge1xuXHRcdFx0Ly8gdXBkYXRlIGxhc3Qgc3luY1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyBsYXN0IHN5bmNocm9uaXplZCBwcm9tcHRzLi4uYCk7XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUxhc3RTeW5jVXNlckRhdGEocmVtb3RlVXNlckRhdGEpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0ZWQgbGFzdCBzeW5jaHJvbml6ZWQgcHJvbXB0c2ApO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgeyBwcmV2aWV3UmVzb3VyY2UgfSBvZiBhY2NwdGVkUmVzb3VyY2VQcmV2aWV3cykge1xuXHRcdFx0Ly8gRGVsZXRlIHRoZSBwcmV2aWV3XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChwcmV2aWV3UmVzb3VyY2UpO1xuXHRcdFx0fSBjYXRjaCAoZSkgeyAvKiBpZ25vcmUgKi8gfVxuXHRcdH1cblxuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZXNvdXJjZVByZXZpZXdzKFxuXHRcdG1lcmdlUmVzdWx0OiBJUHJvbXB0c01lcmdlUmVzdWx0LFxuXHRcdGxvY2FsRmlsZUNvbnRlbnQ6IElTdHJpbmdEaWN0aW9uYXJ5PElGaWxlQ29udGVudD4sXG5cdFx0cmVtb3RlOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+LFxuXHRcdGJhc2U6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4sXG5cdCk6IElQcm9tcHRzUmVzb3VyY2VQcmV2aWV3W10ge1xuXHRcdGNvbnN0IHJlc291cmNlUHJldmlld3M6IE1hcDxzdHJpbmcsIElQcm9tcHRzUmVzb3VyY2VQcmV2aWV3PiA9IG5ldyBNYXA8c3RyaW5nLCBJUHJvbXB0c1Jlc291cmNlUHJldmlldz4oKTtcblxuXHRcdC8qIFByb21wdHMgYWRkZWQgcmVtb3RlbHkgLT4gYWRkIGxvY2FsbHkgKi9cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhtZXJnZVJlc3VsdC5sb2NhbC5hZGRlZCkpIHtcblx0XHRcdGNvbnN0IHByZXZpZXdSZXN1bHQ6IElNZXJnZVJlc3VsdCA9IHtcblx0XHRcdFx0Y29udGVudDogbWVyZ2VSZXN1bHQubG9jYWwuYWRkZWRba2V5XSxcblx0XHRcdFx0aGFzQ29uZmxpY3RzOiBmYWxzZSxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5BZGRlZCxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdH07XG5cdFx0XHRyZXNvdXJjZVByZXZpZXdzLnNldChrZXksIHtcblx0XHRcdFx0YmFzZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSksXG5cdFx0XHRcdGJhc2VDb250ZW50OiBudWxsLFxuXHRcdFx0XHRmaWxlQ29udGVudDogbnVsbCxcblx0XHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSxcblx0XHRcdFx0bG9jYWxDb250ZW50OiBudWxsLFxuXHRcdFx0XHRyZW1vdGVSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSksXG5cdFx0XHRcdHJlbW90ZUNvbnRlbnQ6IHJlbW90ZVtrZXldLFxuXHRcdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSksXG5cdFx0XHRcdHByZXZpZXdSZXN1bHQsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LmxvY2FsQ2hhbmdlLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0XHRhY2NlcHRlZFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYWNjZXB0ZWQnIH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvKiBQcm9tcHRzIHVwZGF0ZWQgcmVtb3RlbHkgLT4gdXBkYXRlIGxvY2FsbHkgKi9cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhtZXJnZVJlc3VsdC5sb2NhbC51cGRhdGVkKSkge1xuXHRcdFx0Y29uc3QgcHJldmlld1Jlc3VsdDogSU1lcmdlUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBtZXJnZVJlc3VsdC5sb2NhbC51cGRhdGVkW2tleV0sXG5cdFx0XHRcdGhhc0NvbmZsaWN0czogZmFsc2UsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTW9kaWZpZWQsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gbG9jYWxGaWxlQ29udGVudFtrZXldID8gbG9jYWxGaWxlQ29udGVudFtrZXldLnZhbHVlLnRvU3RyaW5nKCkgOiBudWxsO1xuXHRcdFx0cmVzb3VyY2VQcmV2aWV3cy5zZXQoa2V5LCB7XG5cdFx0XHRcdGJhc2VSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2Jhc2UnIH0pLFxuXHRcdFx0XHRiYXNlQ29udGVudDogYmFzZVtrZXldID8/IG51bGwsXG5cdFx0XHRcdGxvY2FsUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSksXG5cdFx0XHRcdGZpbGVDb250ZW50OiBsb2NhbEZpbGVDb250ZW50W2tleV0sXG5cdFx0XHRcdGxvY2FsQ29udGVudCxcblx0XHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pLFxuXHRcdFx0XHRyZW1vdGVDb250ZW50OiByZW1vdGVba2V5XSxcblx0XHRcdFx0cHJldmlld1Jlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLFxuXHRcdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0LyogUHJvbXB0cyByZW1vdmVkIHJlbW90ZWx5IC0+IHJlbW92ZSBsb2NhbGx5ICovXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgbWVyZ2VSZXN1bHQubG9jYWwucmVtb3ZlZCkge1xuXHRcdFx0Y29uc3QgcHJldmlld1Jlc3VsdDogSU1lcmdlUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBudWxsLFxuXHRcdFx0XHRoYXNDb25mbGljdHM6IGZhbHNlLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLkRlbGV0ZWQsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gbG9jYWxGaWxlQ29udGVudFtrZXldID8gbG9jYWxGaWxlQ29udGVudFtrZXldLnZhbHVlLnRvU3RyaW5nKCkgOiBudWxsO1xuXHRcdFx0cmVzb3VyY2VQcmV2aWV3cy5zZXQoa2V5LCB7XG5cdFx0XHRcdGJhc2VSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2Jhc2UnIH0pLFxuXHRcdFx0XHRiYXNlQ29udGVudDogYmFzZVtrZXldID8/IG51bGwsXG5cdFx0XHRcdGxvY2FsUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSksXG5cdFx0XHRcdGZpbGVDb250ZW50OiBsb2NhbEZpbGVDb250ZW50W2tleV0sXG5cdFx0XHRcdGxvY2FsQ29udGVudCxcblx0XHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pLFxuXHRcdFx0XHRyZW1vdGVDb250ZW50OiBudWxsLFxuXHRcdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSksXG5cdFx0XHRcdHByZXZpZXdSZXN1bHQsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LmxvY2FsQ2hhbmdlLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0XHRhY2NlcHRlZFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYWNjZXB0ZWQnIH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvKiBQcm9tcHRzIGFkZGVkIGxvY2FsbHkgLT4gYWRkIHJlbW90ZWx5ICovXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMobWVyZ2VSZXN1bHQucmVtb3RlLmFkZGVkKSkge1xuXHRcdFx0Y29uc3QgcHJldmlld1Jlc3VsdDogSU1lcmdlUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBtZXJnZVJlc3VsdC5yZW1vdGUuYWRkZWRba2V5XSxcblx0XHRcdFx0aGFzQ29uZmxpY3RzOiBmYWxzZSxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5BZGRlZCxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBsb2NhbEZpbGVDb250ZW50W2tleV0gPyBsb2NhbEZpbGVDb250ZW50W2tleV0udmFsdWUudG9TdHJpbmcoKSA6IG51bGw7XG5cdFx0XHRyZXNvdXJjZVByZXZpZXdzLnNldChrZXksIHtcblx0XHRcdFx0YmFzZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSksXG5cdFx0XHRcdGJhc2VDb250ZW50OiBiYXNlW2tleV0gPz8gbnVsbCxcblx0XHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSxcblx0XHRcdFx0ZmlsZUNvbnRlbnQ6IGxvY2FsRmlsZUNvbnRlbnRba2V5XSxcblx0XHRcdFx0bG9jYWxDb250ZW50LFxuXHRcdFx0XHRyZW1vdGVSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSksXG5cdFx0XHRcdHJlbW90ZUNvbnRlbnQ6IG51bGwsXG5cdFx0XHRcdHByZXZpZXdSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KSxcblx0XHRcdFx0cHJldmlld1Jlc3VsdCxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IHByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogcHJldmlld1Jlc3VsdC5yZW1vdGVDaGFuZ2UsXG5cdFx0XHRcdGFjY2VwdGVkUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8qIFByb21wdHMgdXBkYXRlZCBsb2NhbGx5IC0+IHVwZGF0ZSByZW1vdGVseSAqL1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKG1lcmdlUmVzdWx0LnJlbW90ZS51cGRhdGVkKSkge1xuXHRcdFx0Y29uc3QgcHJldmlld1Jlc3VsdDogSU1lcmdlUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBtZXJnZVJlc3VsdC5yZW1vdGUudXBkYXRlZFtrZXldLFxuXHRcdFx0XHRoYXNDb25mbGljdHM6IGZhbHNlLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk1vZGlmaWVkLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGxvY2FsRmlsZUNvbnRlbnRba2V5XSA/IGxvY2FsRmlsZUNvbnRlbnRba2V5XS52YWx1ZS50b1N0cmluZygpIDogbnVsbDtcblx0XHRcdHJlc291cmNlUHJldmlld3Muc2V0KGtleSwge1xuXHRcdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSxcblx0XHRcdFx0YmFzZUNvbnRlbnQ6IGJhc2Vba2V5XSA/PyBudWxsLFxuXHRcdFx0XHRsb2NhbFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pLFxuXHRcdFx0XHRmaWxlQ29udGVudDogbG9jYWxGaWxlQ29udGVudFtrZXldLFxuXHRcdFx0XHRsb2NhbENvbnRlbnQsXG5cdFx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSxcblx0XHRcdFx0cmVtb3RlQ29udGVudDogcmVtb3RlW2tleV0sXG5cdFx0XHRcdHByZXZpZXdSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KSxcblx0XHRcdFx0cHJldmlld1Jlc3VsdCxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IHByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogcHJldmlld1Jlc3VsdC5yZW1vdGVDaGFuZ2UsXG5cdFx0XHRcdGFjY2VwdGVkUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8qIFByb21wdHMgcmVtb3ZlZCBsb2NhbGx5IC0+IHJlbW92ZSByZW1vdGVseSAqL1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIG1lcmdlUmVzdWx0LnJlbW90ZS5yZW1vdmVkKSB7XG5cdFx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IG51bGwsXG5cdFx0XHRcdGhhc0NvbmZsaWN0czogZmFsc2UsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuRGVsZXRlZCxcblx0XHRcdH07XG5cdFx0XHRyZXNvdXJjZVByZXZpZXdzLnNldChrZXksIHtcblx0XHRcdFx0YmFzZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSksXG5cdFx0XHRcdGJhc2VDb250ZW50OiBiYXNlW2tleV0gPz8gbnVsbCxcblx0XHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSxcblx0XHRcdFx0ZmlsZUNvbnRlbnQ6IG51bGwsXG5cdFx0XHRcdGxvY2FsQ29udGVudDogbnVsbCxcblx0XHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pLFxuXHRcdFx0XHRyZW1vdGVDb250ZW50OiByZW1vdGVba2V5XSxcblx0XHRcdFx0cHJldmlld1Jlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLFxuXHRcdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0LyogUHJvbXB0cyB3aXRoIGNvbmZsaWN0cyAqL1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIG1lcmdlUmVzdWx0LmNvbmZsaWN0cykge1xuXHRcdFx0Y29uc3QgcHJldmlld1Jlc3VsdDogSU1lcmdlUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBiYXNlW2tleV0gPz8gbnVsbCxcblx0XHRcdFx0aGFzQ29uZmxpY3RzOiB0cnVlLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogbG9jYWxGaWxlQ29udGVudFtrZXldID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLkFkZGVkLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHJlbW90ZVtrZXldID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLkFkZGVkXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gbG9jYWxGaWxlQ29udGVudFtrZXldID8gbG9jYWxGaWxlQ29udGVudFtrZXldLnZhbHVlLnRvU3RyaW5nKCkgOiBudWxsO1xuXHRcdFx0cmVzb3VyY2VQcmV2aWV3cy5zZXQoa2V5LCB7XG5cdFx0XHRcdGJhc2VSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2Jhc2UnIH0pLFxuXHRcdFx0XHRiYXNlQ29udGVudDogYmFzZVtrZXldID8/IG51bGwsXG5cdFx0XHRcdGxvY2FsUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSksXG5cdFx0XHRcdGZpbGVDb250ZW50OiBsb2NhbEZpbGVDb250ZW50W2tleV0gfHwgbnVsbCxcblx0XHRcdFx0bG9jYWxDb250ZW50LFxuXHRcdFx0XHRyZW1vdGVSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSksXG5cdFx0XHRcdHJlbW90ZUNvbnRlbnQ6IHJlbW90ZVtrZXldIHx8IG51bGwsXG5cdFx0XHRcdHByZXZpZXdSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KSxcblx0XHRcdFx0cHJldmlld1Jlc3VsdCxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IHByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogcHJldmlld1Jlc3VsdC5yZW1vdGVDaGFuZ2UsXG5cdFx0XHRcdGFjY2VwdGVkUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8qIFVubW9kaWZpZWQgUHJvbXB0cyAqL1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGxvY2FsRmlsZUNvbnRlbnQpKSB7XG5cdFx0XHRpZiAoIXJlc291cmNlUHJldmlld3MuaGFzKGtleSkpIHtcblx0XHRcdFx0Y29uc3QgcHJldmlld1Jlc3VsdDogSU1lcmdlUmVzdWx0ID0ge1xuXHRcdFx0XHRcdGNvbnRlbnQ6IGxvY2FsRmlsZUNvbnRlbnRba2V5XSA/IGxvY2FsRmlsZUNvbnRlbnRba2V5XS52YWx1ZS50b1N0cmluZygpIDogbnVsbCxcblx0XHRcdFx0XHRoYXNDb25mbGljdHM6IGZhbHNlLFxuXHRcdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Ob25lXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGxvY2FsRmlsZUNvbnRlbnRba2V5XSA/IGxvY2FsRmlsZUNvbnRlbnRba2V5XS52YWx1ZS50b1N0cmluZygpIDogbnVsbDtcblx0XHRcdFx0cmVzb3VyY2VQcmV2aWV3cy5zZXQoa2V5LCB7XG5cdFx0XHRcdFx0YmFzZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSksXG5cdFx0XHRcdFx0YmFzZUNvbnRlbnQ6IGJhc2Vba2V5XSA/PyBudWxsLFxuXHRcdFx0XHRcdGxvY2FsUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSksXG5cdFx0XHRcdFx0ZmlsZUNvbnRlbnQ6IGxvY2FsRmlsZUNvbnRlbnRba2V5XSB8fCBudWxsLFxuXHRcdFx0XHRcdGxvY2FsQ29udGVudCxcblx0XHRcdFx0XHRyZW1vdGVSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSksXG5cdFx0XHRcdFx0cmVtb3RlQ29udGVudDogcmVtb3RlW2tleV0gfHwgbnVsbCxcblx0XHRcdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSksXG5cdFx0XHRcdFx0cHJldmlld1Jlc3VsdCxcblx0XHRcdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0XHRcdGFjY2VwdGVkUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSlcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi5yZXNvdXJjZVByZXZpZXdzLnZhbHVlcygpXTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlc29sdmVDb250ZW50KHVyaTogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWxPclBhcmVudCh1cmksIHRoaXMuc3luY1ByZXZpZXdGb2xkZXIud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pKVxuXHRcdFx0fHwgdGhpcy5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHVyaSwgdGhpcy5zeW5jUHJldmlld0ZvbGRlci53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSlcblx0XHRcdHx8IHRoaXMuZXh0VXJpLmlzRXF1YWxPclBhcmVudCh1cmksIHRoaXMuc3luY1ByZXZpZXdGb2xkZXIud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSlcblx0XHRcdHx8IHRoaXMuZXh0VXJpLmlzRXF1YWxPclBhcmVudCh1cmksIHRoaXMuc3luY1ByZXZpZXdGb2xkZXIud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSkpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlUHJldmlld0NvbnRlbnQodXJpKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRhc3luYyBoYXNMb2NhbERhdGEoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxvY2FsID0gYXdhaXQgdGhpcy5nZXRQcm9tcHRzRmlsZUNvbnRlbnRzKCk7XG5cdFx0XHRpZiAoT2JqZWN0LmtleXMobG9jYWwpLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0LyogaWdub3JlIGVycm9yICovXG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlTG9jYWxCYWNrdXAocmVzb3VyY2VQcmV2aWV3czogSUZpbGVSZXNvdXJjZVByZXZpZXdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxvY2FsOiBJU3RyaW5nRGljdGlvbmFyeTxJRmlsZUNvbnRlbnQ+ID0ge307XG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZVByZXZpZXcgb2YgcmVzb3VyY2VQcmV2aWV3cykge1xuXHRcdFx0aWYgKHJlc291cmNlUHJldmlldy5maWxlQ29udGVudCkge1xuXHRcdFx0XHRsb2NhbFt0aGlzLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZVByZXZpZXcubG9jYWxSZXNvdXJjZSldID0gcmVzb3VyY2VQcmV2aWV3LmZpbGVDb250ZW50O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLmJhY2t1cExvY2FsKEpTT04uc3RyaW5naWZ5KHRoaXMudG9Qcm9tcHRDb250ZW50cyhsb2NhbCkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlTG9jYWxQcm9tcHRzKHJlc291cmNlUHJldmlld3M6IElQcm9tcHRzQWNjZXB0ZWRSZXNvdXJjZVByZXZpZXdbXSwgZm9yY2U6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHsgZmlsZUNvbnRlbnQsIGFjY2VwdFJlc3VsdCwgbG9jYWxSZXNvdXJjZSwgcmVtb3RlUmVzb3VyY2UsIGxvY2FsQ2hhbmdlIH0gb2YgcmVzb3VyY2VQcmV2aWV3cykge1xuXHRcdFx0aWYgKGxvY2FsQ2hhbmdlICE9PSBDaGFuZ2UuTm9uZSkge1xuXHRcdFx0XHRjb25zdCBrZXkgPSByZW1vdGVSZXNvdXJjZSA/IHRoaXMuZXh0VXJpLmJhc2VuYW1lKHJlbW90ZVJlc291cmNlKSA6IHRoaXMuZXh0VXJpLmJhc2VuYW1lKGxvY2FsUmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMucHJvbXB0c0ZvbGRlciwga2V5KTtcblxuXHRcdFx0XHQvLyBSZW1vdmVkXG5cdFx0XHRcdGlmIChsb2NhbENoYW5nZSA9PT0gQ2hhbmdlLkRlbGV0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IERlbGV0aW5nIHByb21wdC4uLmAsIHRoaXMuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwocmVzb3VyY2UpO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBEZWxldGVkIHByb21wdGAsIHRoaXMuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBZGRlZFxuXHRcdFx0XHRlbHNlIGlmIChsb2NhbENoYW5nZSA9PT0gQ2hhbmdlLkFkZGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBDcmVhdGluZyBwcm9tcHQuLi5gLCB0aGlzLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSkpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhhY2NlcHRSZXN1bHQuY29udGVudCEpLCB7IG92ZXJ3cml0ZTogZm9yY2UgfSk7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IENyZWF0ZWQgcHJvbXB0YCwgdGhpcy5leHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFVwZGF0ZWRcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyBwcm9tcHQuLi5gLCB0aGlzLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSkpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGFjY2VwdFJlc3VsdC5jb250ZW50ISksIGZvcmNlID8gdW5kZWZpbmVkIDogZmlsZUNvbnRlbnQhKTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCBwcm9tcHRgLCB0aGlzLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVSZW1vdGVQcm9tcHRzKHJlc291cmNlUHJldmlld3M6IElQcm9tcHRzQWNjZXB0ZWRSZXNvdXJjZVByZXZpZXdbXSwgcmVtb3RlVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSwgZm9yY2VQdXNoOiBib29sZWFuKTogUHJvbWlzZTxJUmVtb3RlVXNlckRhdGE+IHtcblx0XHRjb25zdCBjdXJyZW50UHJvbXB0czogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiA9IHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhID8gdGhpcy5wYXJzZVByb21wdHMocmVtb3RlVXNlckRhdGEuc3luY0RhdGEpIDoge307XG5cdFx0Y29uc3QgbmV3UHJvbXB0czogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiA9IGRlZXBDbG9uZShjdXJyZW50UHJvbXB0cyk7XG5cblx0XHRmb3IgKGNvbnN0IHsgYWNjZXB0UmVzdWx0LCBsb2NhbFJlc291cmNlLCByZW1vdGVSZXNvdXJjZSwgcmVtb3RlQ2hhbmdlIH0gb2YgcmVzb3VyY2VQcmV2aWV3cykge1xuXHRcdFx0aWYgKHJlbW90ZUNoYW5nZSAhPT0gQ2hhbmdlLk5vbmUpIHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gbG9jYWxSZXNvdXJjZSA/IHRoaXMuZXh0VXJpLmJhc2VuYW1lKGxvY2FsUmVzb3VyY2UpIDogdGhpcy5leHRVcmkuYmFzZW5hbWUocmVtb3RlUmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAocmVtb3RlQ2hhbmdlID09PSBDaGFuZ2UuRGVsZXRlZCkge1xuXHRcdFx0XHRcdGRlbGV0ZSBuZXdQcm9tcHRzW2tleV07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmV3UHJvbXB0c1trZXldID0gYWNjZXB0UmVzdWx0LmNvbnRlbnQhO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFhcmVTYW1lKGN1cnJlbnRQcm9tcHRzLCBuZXdQcm9tcHRzKSkge1xuXHRcdFx0Ly8gdXBkYXRlIHJlbW90ZVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyByZW1vdGUgcHJvbXB0cy4uLmApO1xuXHRcdFx0cmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0aGlzLnVwZGF0ZVJlbW90ZVVzZXJEYXRhKEpTT04uc3RyaW5naWZ5KG5ld1Byb21wdHMpLCBmb3JjZVB1c2ggPyBudWxsIDogcmVtb3RlVXNlckRhdGEucmVmKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGVkIHJlbW90ZSBwcm9tcHRzYCk7XG5cdFx0fVxuXHRcdHJldHVybiByZW1vdGVVc2VyRGF0YTtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VQcm9tcHRzKHN5bmNEYXRhOiBJU3luY0RhdGEpOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gcGFyc2VQcm9tcHRzKHN5bmNEYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgdG9Qcm9tcHRDb250ZW50cyhmaWxlQ29udGVudHM6IElTdHJpbmdEaWN0aW9uYXJ5PElGaWxlQ29udGVudD4pOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+IHtcblx0XHRjb25zdCBwcm9tcHRzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+ID0ge307XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoZmlsZUNvbnRlbnRzKSkge1xuXHRcdFx0cHJvbXB0c1trZXldID0gZmlsZUNvbnRlbnRzW2tleV0udmFsdWUudG9TdHJpbmcoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHByb21wdHM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFByb21wdHNGaWxlQ29udGVudHMoKTogUHJvbWlzZTxJU3RyaW5nRGljdGlvbmFyeTxJRmlsZUNvbnRlbnQ+PiB7XG5cdFx0Y29uc3QgcHJvbXB0czogSVN0cmluZ0RpY3Rpb25hcnk8SUZpbGVDb250ZW50PiA9IHt9O1xuXHRcdGxldCBzdGF0OiBJRmlsZVN0YXQ7XG5cdFx0dHJ5IHtcblx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUodGhpcy5wcm9tcHRzRm9sZGVyKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBObyBwcm9tcHRzXG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIEZpbGVPcGVyYXRpb25FcnJvciAmJiBlLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0cmV0dXJuIHByb21wdHM7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHN0YXQuY2hpbGRyZW4gfHwgW10pIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gZW50cnkucmVzb3VyY2U7XG5cdFx0XHRjb25zdCBwYXRoID0gcmVzb3VyY2UucGF0aDtcblx0XHRcdGlmIChbJy5wcm9tcHQubWQnLCAnLmluc3RydWN0aW9ucy5tZCcsICcuY2hhdG1vZGUubWQnLCAnLmFnZW50Lm1kJ10uc29tZShleHQgPT4gcGF0aC5lbmRzV2l0aChleHQpKSkge1xuXHRcdFx0XHRjb25zdCBrZXkgPSB0aGlzLmV4dFVyaS5yZWxhdGl2ZVBhdGgodGhpcy5wcm9tcHRzRm9sZGVyLCByZXNvdXJjZSkhO1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0XHRcdHByb21wdHNba2V5XSA9IGNvbnRlbnQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb21wdHM7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVC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
