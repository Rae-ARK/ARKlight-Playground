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
import { toFormattedString } from "../../../base/common/jsonFormatter.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { IFileService } from "../../files/common/files.js";
import { IStorageService } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { AbstractSynchroniser } from "./abstractSynchronizer.js";
import { merge } from "./userDataProfilesManifestMerge.js";
import { Change, IUserDataSyncEnablementService, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncStoreService, SyncResource, USER_DATA_SYNC_SCHEME, UserDataSyncError, UserDataSyncErrorCode } from "./userDataSync.js";
let UserDataProfilesManifestSynchroniser = class extends AbstractSynchroniser {
  constructor(profile, collection, userDataProfilesService, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, logService, configurationService, userDataSyncEnablementService, telemetryService, uriIdentityService) {
    super({ syncResource: SyncResource.Profiles, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
    this.userDataProfilesService = userDataProfilesService;
    this.version = 2;
    this.previewResource = this.extUri.joinPath(this.syncPreviewFolder, "profiles.json");
    this.baseResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" });
    this.localResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" });
    this.remoteResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" });
    this.acceptedResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" });
    this._register(userDataProfilesService.onDidChangeProfiles(() => this.triggerLocalChange()));
  }
  async getLastSyncedProfiles() {
    const lastSyncUserData = await this.getLastSyncUserData();
    return lastSyncUserData?.syncData ? parseUserDataProfilesManifest(lastSyncUserData.syncData) : null;
  }
  async getRemoteSyncedProfiles(refOrLatestData) {
    const lastSyncUserData = await this.getLastSyncUserData();
    const remoteUserData = await this.getLatestRemoteUserData(refOrLatestData, lastSyncUserData);
    return remoteUserData?.syncData ? parseUserDataProfilesManifest(remoteUserData.syncData) : null;
  }
  async generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine) {
    const remoteProfiles = remoteUserData.syncData ? parseUserDataProfilesManifest(remoteUserData.syncData) : null;
    const lastSyncProfiles = lastSyncUserData?.syncData ? parseUserDataProfilesManifest(lastSyncUserData.syncData) : null;
    const localProfiles = this.getLocalUserDataProfiles();
    const { local, remote } = merge(localProfiles, remoteProfiles, lastSyncProfiles, []);
    const previewResult = {
      local,
      remote,
      content: lastSyncProfiles ? this.stringifyRemoteProfiles(lastSyncProfiles) : null,
      localChange: local.added.length > 0 || local.removed.length > 0 || local.updated.length > 0 ? Change.Modified : Change.None,
      remoteChange: remote !== null ? Change.Modified : Change.None
    };
    const localContent = stringifyLocalProfiles(localProfiles, false);
    return [{
      baseResource: this.baseResource,
      baseContent: lastSyncProfiles ? this.stringifyRemoteProfiles(lastSyncProfiles) : null,
      localResource: this.localResource,
      localContent,
      remoteResource: this.remoteResource,
      remoteContent: remoteProfiles ? this.stringifyRemoteProfiles(remoteProfiles) : null,
      remoteProfiles,
      previewResource: this.previewResource,
      previewResult,
      localChange: previewResult.localChange,
      remoteChange: previewResult.remoteChange,
      acceptedResource: this.acceptedResource
    }];
  }
  async hasRemoteChanged(lastSyncUserData) {
    const lastSyncProfiles = lastSyncUserData?.syncData ? parseUserDataProfilesManifest(lastSyncUserData.syncData) : null;
    const localProfiles = this.getLocalUserDataProfiles();
    const { remote } = merge(localProfiles, lastSyncProfiles, lastSyncProfiles, []);
    return !!remote?.added.length || !!remote?.removed.length || !!remote?.updated.length;
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
    const localProfiles = this.getLocalUserDataProfiles();
    const mergeResult = merge(localProfiles, null, null, []);
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
    const remoteProfiles = resourcePreview.remoteContent ? JSON.parse(resourcePreview.remoteContent) : null;
    const lastSyncProfiles = [];
    const localProfiles = [];
    for (const profile of this.getLocalUserDataProfiles()) {
      const remoteProfile = remoteProfiles?.find((remoteProfile2) => remoteProfile2.id === profile.id);
      if (remoteProfile) {
        lastSyncProfiles.push({ id: profile.id, name: profile.name, collection: remoteProfile.collection });
        localProfiles.push(profile);
      }
    }
    if (remoteProfiles !== null) {
      const mergeResult = merge(localProfiles, remoteProfiles, lastSyncProfiles, []);
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
    const { local, remote, localChange, remoteChange } = resourcePreviews[0][1];
    if (localChange === Change.None && remoteChange === Change.None) {
      this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing profiles.`);
    }
    const remoteProfiles = resourcePreviews[0][0].remoteProfiles || [];
    if (remoteProfiles.length + (remote?.added.length ?? 0) - (remote?.removed.length ?? 0) > 20) {
      throw new UserDataSyncError("Too many profiles to sync. Please remove some profiles and try again.", UserDataSyncErrorCode.LocalTooManyProfiles);
    }
    if (localChange !== Change.None) {
      await this.backupLocal(stringifyLocalProfiles(this.getLocalUserDataProfiles(), false));
      await Promise.all(local.removed.map(async (profile) => {
        this.logService.trace(`${this.syncResourceLogLabel}: Removing '${profile.name}' profile...`);
        await this.userDataProfilesService.removeProfile(profile);
        this.logService.info(`${this.syncResourceLogLabel}: Removed profile '${profile.name}'.`);
      }));
      await Promise.all(local.added.map(async (profile) => {
        this.logService.trace(`${this.syncResourceLogLabel}: Creating '${profile.name}' profile...`);
        await this.userDataProfilesService.createProfile(profile.id, profile.name, { icon: profile.icon, useDefaultFlags: profile.useDefaultFlags });
        this.logService.info(`${this.syncResourceLogLabel}: Created profile '${profile.name}'.`);
      }));
      await Promise.all(local.updated.map(async (profile) => {
        const localProfile = this.userDataProfilesService.profiles.find((p) => p.id === profile.id);
        if (localProfile) {
          this.logService.trace(`${this.syncResourceLogLabel}: Updating '${profile.name}' profile...`);
          await this.userDataProfilesService.updateProfile(localProfile, { name: profile.name, icon: profile.icon, useDefaultFlags: profile.useDefaultFlags });
          this.logService.info(`${this.syncResourceLogLabel}: Updated profile '${profile.name}'.`);
        } else {
          this.logService.info(`${this.syncResourceLogLabel}: Could not find profile with id '${profile.id}' to update.`);
        }
      }));
    }
    if (remoteChange !== Change.None) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating remote profiles...`);
      const addedCollections = [];
      const canAddRemoteProfiles = remoteProfiles.length + (remote?.added.length ?? 0) <= 20;
      if (canAddRemoteProfiles) {
        for (const profile of remote?.added || []) {
          const collection = await this.userDataSyncStoreService.createCollection(this.syncHeaders);
          this.logService.trace(`${this.syncResourceLogLabel}: Created collection "${collection}" for "${profile.name}".`);
          addedCollections.push(collection);
          remoteProfiles.push({ id: profile.id, name: profile.name, collection, icon: profile.icon, useDefaultFlags: profile.useDefaultFlags });
        }
      } else {
        this.logService.info(`${this.syncResourceLogLabel}: Could not create remote profiles as there are too many profiles.`);
      }
      for (const profile of remote?.removed || []) {
        remoteProfiles.splice(remoteProfiles.findIndex(({ id }) => profile.id === id), 1);
      }
      for (const profile of remote?.updated || []) {
        const profileToBeUpdated = remoteProfiles.find(({ id }) => profile.id === id);
        if (profileToBeUpdated) {
          remoteProfiles.splice(remoteProfiles.indexOf(profileToBeUpdated), 1, { ...profileToBeUpdated, id: profile.id, name: profile.name, icon: profile.icon, useDefaultFlags: profile.useDefaultFlags });
        }
      }
      try {
        remoteUserData = await this.updateRemoteProfiles(remoteProfiles, force ? null : remoteUserData.ref);
        this.logService.info(`${this.syncResourceLogLabel}: Updated remote profiles.${canAddRemoteProfiles && remote?.added.length ? ` Added: ${JSON.stringify(remote.added.map((e) => e.name))}.` : ""}${remote?.updated.length ? ` Updated: ${JSON.stringify(remote.updated.map((e) => e.name))}.` : ""}${remote?.removed.length ? ` Removed: ${JSON.stringify(remote.removed.map((e) => e.name))}.` : ""}`);
      } catch (error) {
        if (addedCollections.length) {
          this.logService.info(`${this.syncResourceLogLabel}: Failed to update remote profiles. Cleaning up added collections...`);
          for (const collection of addedCollections) {
            await this.userDataSyncStoreService.deleteCollection(collection, this.syncHeaders);
          }
        }
        throw error;
      }
      for (const profile of remote?.removed || []) {
        await this.userDataSyncStoreService.deleteCollection(profile.collection, this.syncHeaders);
      }
    }
    if (lastSyncUserData?.ref !== remoteUserData.ref) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized profiles...`);
      await this.updateLastSyncUserData(remoteUserData);
      this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized profiles.`);
    }
  }
  async updateRemoteProfiles(profiles, ref) {
    return this.updateRemoteUserData(this.stringifyRemoteProfiles(profiles), ref);
  }
  async hasLocalData() {
    return this.getLocalUserDataProfiles().length > 0;
  }
  async resolveContent(uri) {
    if (this.extUri.isEqual(this.remoteResource, uri) || this.extUri.isEqual(this.baseResource, uri) || this.extUri.isEqual(this.localResource, uri) || this.extUri.isEqual(this.acceptedResource, uri)) {
      const content = await this.resolvePreviewContent(uri);
      return content ? toFormattedString(JSON.parse(content), {}) : content;
    }
    return null;
  }
  getLocalUserDataProfiles() {
    return this.userDataProfilesService.profiles.filter((p) => !p.isDefault && !p.isTransient);
  }
  stringifyRemoteProfiles(profiles) {
    return JSON.stringify([...profiles].sort((a, b) => a.name.localeCompare(b.name)));
  }
};
UserDataProfilesManifestSynchroniser = __decorateClass([
  __decorateParam(2, IUserDataProfilesService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IUserDataSyncStoreService),
  __decorateParam(7, IUserDataSyncLocalStoreService),
  __decorateParam(8, IUserDataSyncLogService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IUserDataSyncEnablementService),
  __decorateParam(11, ITelemetryService),
  __decorateParam(12, IUriIdentityService)
], UserDataProfilesManifestSynchroniser);
function stringifyLocalProfiles(profiles, format) {
  const result = [...profiles].sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ id: p.id, name: p.name }));
  return format ? toFormattedString(result, {}) : JSON.stringify(result);
}
function parseUserDataProfilesManifest(syncData) {
  return JSON.parse(syncData.content);
}
export {
  UserDataProfilesManifestSynchroniser,
  parseUserDataProfilesManifest,
  stringifyLocalProfiles
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFQcm9maWxlc01hbmlmZXN0U3luYy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IHRvRm9ybWF0dGVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkZvcm1hdHRlci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFN5bmNocm9uaXNlciwgSUFjY2VwdFJlc3VsdCwgSU1lcmdlUmVzdWx0LCBJUmVzb3VyY2VQcmV2aWV3IH0gZnJvbSAnLi9hYnN0cmFjdFN5bmNocm9uaXplci5qcyc7XG5pbXBvcnQgeyBtZXJnZSB9IGZyb20gJy4vdXNlckRhdGFQcm9maWxlc01hbmlmZXN0TWVyZ2UuanMnO1xuaW1wb3J0IHsgQ2hhbmdlLCBJUmVtb3RlVXNlckRhdGEsIElTeW5jRGF0YSwgSVN5bmNVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YSwgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFTeW5jaHJvbmlzZXIsIElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSwgSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsIElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIFN5bmNSZXNvdXJjZSwgVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBVc2VyRGF0YVN5bmNFcnJvciwgVXNlckRhdGFTeW5jRXJyb3JDb2RlIH0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuXG5pbnRlcmZhY2UgSVVzZXJEYXRhUHJvZmlsZU1hbmlmZXN0UmVzb3VyY2VNZXJnZVJlc3VsdCBleHRlbmRzIElBY2NlcHRSZXN1bHQge1xuXHRyZWFkb25seSBsb2NhbDogeyBhZGRlZDogSVN5bmNVc2VyRGF0YVByb2ZpbGVbXTsgcmVtb3ZlZDogSVVzZXJEYXRhUHJvZmlsZVtdOyB1cGRhdGVkOiBJU3luY1VzZXJEYXRhUHJvZmlsZVtdIH07XG5cdHJlYWRvbmx5IHJlbW90ZTogeyBhZGRlZDogSVVzZXJEYXRhUHJvZmlsZVtdOyByZW1vdmVkOiBJU3luY1VzZXJEYXRhUHJvZmlsZVtdOyB1cGRhdGVkOiBJVXNlckRhdGFQcm9maWxlW10gfSB8IG51bGw7XG59XG5cbmludGVyZmFjZSBJVXNlckRhdGFQcm9maWxlc01hbmlmZXN0UmVzb3VyY2VQcmV2aWV3IGV4dGVuZHMgSVJlc291cmNlUHJldmlldyB7XG5cdHJlYWRvbmx5IHByZXZpZXdSZXN1bHQ6IElVc2VyRGF0YVByb2ZpbGVNYW5pZmVzdFJlc291cmNlTWVyZ2VSZXN1bHQ7XG5cdHJlYWRvbmx5IHJlbW90ZVByb2ZpbGVzOiBJU3luY1VzZXJEYXRhUHJvZmlsZVtdIHwgbnVsbDtcbn1cblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhUHJvZmlsZXNNYW5pZmVzdFN5bmNocm9uaXNlciBleHRlbmRzIEFic3RyYWN0U3luY2hyb25pc2VyIGltcGxlbWVudHMgSVVzZXJEYXRhU3luY2hyb25pc2VyIHtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyID0gMjtcblx0cmVhZG9ubHkgcHJldmlld1Jlc291cmNlOiBVUkkgPSB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCAncHJvZmlsZXMuanNvbicpO1xuXHRyZWFkb25seSBiYXNlUmVzb3VyY2U6IFVSSSA9IHRoaXMucHJldmlld1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSk7XG5cdHJlYWRvbmx5IGxvY2FsUmVzb3VyY2U6IFVSSSA9IHRoaXMucHJldmlld1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pO1xuXHRyZWFkb25seSByZW1vdGVSZXNvdXJjZTogVVJJID0gdGhpcy5wcmV2aWV3UmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pO1xuXHRyZWFkb25seSBhY2NlcHRlZFJlc291cmNlOiBVUkkgPSB0aGlzLnByZXZpZXdSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLFxuXHRcdGNvbGxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuUHJvZmlsZXMsIHByb2ZpbGUgfSwgY29sbGVjdGlvbiwgZmlsZVNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgdXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsIHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5vbkRpZENoYW5nZVByb2ZpbGVzKCgpID0+IHRoaXMudHJpZ2dlckxvY2FsQ2hhbmdlKCkpKTtcblx0fVxuXG5cdGFzeW5jIGdldExhc3RTeW5jZWRQcm9maWxlcygpOiBQcm9taXNlPElTeW5jVXNlckRhdGFQcm9maWxlW10gfCBudWxsPiB7XG5cdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRoaXMuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdHJldHVybiBsYXN0U3luY1VzZXJEYXRhPy5zeW5jRGF0YSA/IHBhcnNlVXNlckRhdGFQcm9maWxlc01hbmlmZXN0KGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEpIDogbnVsbDtcblx0fVxuXG5cdGFzeW5jIGdldFJlbW90ZVN5bmNlZFByb2ZpbGVzKHJlZk9yTGF0ZXN0RGF0YTogc3RyaW5nIHwgSVVzZXJEYXRhIHwgbnVsbCk6IFByb21pc2U8SVN5bmNVc2VyRGF0YVByb2ZpbGVbXSB8IG51bGw+IHtcblx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGhpcy5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0aGlzLmdldExhdGVzdFJlbW90ZVVzZXJEYXRhKHJlZk9yTGF0ZXN0RGF0YSwgbGFzdFN5bmNVc2VyRGF0YSk7XG5cdFx0cmV0dXJuIHJlbW90ZVVzZXJEYXRhPy5zeW5jRGF0YSA/IHBhcnNlVXNlckRhdGFQcm9maWxlc01hbmlmZXN0KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhKSA6IG51bGw7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2VuZXJhdGVTeW5jUHJldmlldyhyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCBpc1JlbW90ZURhdGFGcm9tQ3VycmVudE1hY2hpbmU6IGJvb2xlYW4pOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGVzTWFuaWZlc3RSZXNvdXJjZVByZXZpZXdbXT4ge1xuXHRcdGNvbnN0IHJlbW90ZVByb2ZpbGVzOiBJU3luY1VzZXJEYXRhUHJvZmlsZVtdIHwgbnVsbCA9IHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhID8gcGFyc2VVc2VyRGF0YVByb2ZpbGVzTWFuaWZlc3QocmVtb3RlVXNlckRhdGEuc3luY0RhdGEpIDogbnVsbDtcblx0XHRjb25zdCBsYXN0U3luY1Byb2ZpbGVzOiBJU3luY1VzZXJEYXRhUHJvZmlsZVtdIHwgbnVsbCA9IGxhc3RTeW5jVXNlckRhdGE/LnN5bmNEYXRhID8gcGFyc2VVc2VyRGF0YVByb2ZpbGVzTWFuaWZlc3QobGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSkgOiBudWxsO1xuXHRcdGNvbnN0IGxvY2FsUHJvZmlsZXMgPSB0aGlzLmdldExvY2FsVXNlckRhdGFQcm9maWxlcygpO1xuXG5cdFx0Y29uc3QgeyBsb2NhbCwgcmVtb3RlIH0gPSBtZXJnZShsb2NhbFByb2ZpbGVzLCByZW1vdGVQcm9maWxlcywgbGFzdFN5bmNQcm9maWxlcywgW10pO1xuXHRcdGNvbnN0IHByZXZpZXdSZXN1bHQ6IElVc2VyRGF0YVByb2ZpbGVNYW5pZmVzdFJlc291cmNlTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRsb2NhbCwgcmVtb3RlLFxuXHRcdFx0Y29udGVudDogbGFzdFN5bmNQcm9maWxlcyA/IHRoaXMuc3RyaW5naWZ5UmVtb3RlUHJvZmlsZXMobGFzdFN5bmNQcm9maWxlcykgOiBudWxsLFxuXHRcdFx0bG9jYWxDaGFuZ2U6IGxvY2FsLmFkZGVkLmxlbmd0aCA+IDAgfHwgbG9jYWwucmVtb3ZlZC5sZW5ndGggPiAwIHx8IGxvY2FsLnVwZGF0ZWQubGVuZ3RoID4gMCA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5Ob25lLFxuXHRcdFx0cmVtb3RlQ2hhbmdlOiByZW1vdGUgIT09IG51bGwgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuTm9uZSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5TG9jYWxQcm9maWxlcyhsb2NhbFByb2ZpbGVzLCBmYWxzZSk7XG5cdFx0cmV0dXJuIFt7XG5cdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuYmFzZVJlc291cmNlLFxuXHRcdFx0YmFzZUNvbnRlbnQ6IGxhc3RTeW5jUHJvZmlsZXMgPyB0aGlzLnN0cmluZ2lmeVJlbW90ZVByb2ZpbGVzKGxhc3RTeW5jUHJvZmlsZXMpIDogbnVsbCxcblx0XHRcdGxvY2FsUmVzb3VyY2U6IHRoaXMubG9jYWxSZXNvdXJjZSxcblx0XHRcdGxvY2FsQ29udGVudCxcblx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLnJlbW90ZVJlc291cmNlLFxuXHRcdFx0cmVtb3RlQ29udGVudDogcmVtb3RlUHJvZmlsZXMgPyB0aGlzLnN0cmluZ2lmeVJlbW90ZVByb2ZpbGVzKHJlbW90ZVByb2ZpbGVzKSA6IG51bGwsXG5cdFx0XHRyZW1vdGVQcm9maWxlcyxcblx0XHRcdHByZXZpZXdSZXNvdXJjZTogdGhpcy5wcmV2aWV3UmVzb3VyY2UsXG5cdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0bG9jYWxDaGFuZ2U6IHByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5hY2NlcHRlZFJlc291cmNlXG5cdFx0fV07XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgaGFzUmVtb3RlQ2hhbmdlZChsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBsYXN0U3luY1Byb2ZpbGVzOiBJU3luY1VzZXJEYXRhUHJvZmlsZVtdIHwgbnVsbCA9IGxhc3RTeW5jVXNlckRhdGE/LnN5bmNEYXRhID8gcGFyc2VVc2VyRGF0YVByb2ZpbGVzTWFuaWZlc3QobGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSkgOiBudWxsO1xuXHRcdGNvbnN0IGxvY2FsUHJvZmlsZXMgPSB0aGlzLmdldExvY2FsVXNlckRhdGFQcm9maWxlcygpO1xuXHRcdGNvbnN0IHsgcmVtb3RlIH0gPSBtZXJnZShsb2NhbFByb2ZpbGVzLCBsYXN0U3luY1Byb2ZpbGVzLCBsYXN0U3luY1Byb2ZpbGVzLCBbXSk7XG5cdFx0cmV0dXJuICEhcmVtb3RlPy5hZGRlZC5sZW5ndGggfHwgISFyZW1vdGU/LnJlbW92ZWQubGVuZ3RoIHx8ICEhcmVtb3RlPy51cGRhdGVkLmxlbmd0aDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZXRNZXJnZVJlc3VsdChyZXNvdXJjZVByZXZpZXc6IElVc2VyRGF0YVByb2ZpbGVzTWFuaWZlc3RSZXNvdXJjZVByZXZpZXcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SU1lcmdlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHsgLi4ucmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQsIGhhc0NvbmZsaWN0czogZmFsc2UgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZXRBY2NlcHRSZXN1bHQocmVzb3VyY2VQcmV2aWV3OiBJVXNlckRhdGFQcm9maWxlc01hbmlmZXN0UmVzb3VyY2VQcmV2aWV3LCByZXNvdXJjZTogVVJJLCBjb250ZW50OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBY2NlcHRSZXN1bHQ+IHtcblx0XHQvKiBBY2NlcHQgbG9jYWwgcmVzb3VyY2UgKi9cblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5sb2NhbFJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuYWNjZXB0TG9jYWwocmVzb3VyY2VQcmV2aWV3KTtcblx0XHR9XG5cblx0XHQvKiBBY2NlcHQgcmVtb3RlIHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwocmVzb3VyY2UsIHRoaXMucmVtb3RlUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hY2NlcHRSZW1vdGUocmVzb3VyY2VQcmV2aWV3KTtcblx0XHR9XG5cblx0XHQvKiBBY2NlcHQgcHJldmlldyByZXNvdXJjZSAqL1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsKHJlc291cmNlLCB0aGlzLnByZXZpZXdSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiByZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdDtcblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgUmVzb3VyY2U6ICR7cmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYWNjZXB0TG9jYWwocmVzb3VyY2VQcmV2aWV3OiBJVXNlckRhdGFQcm9maWxlc01hbmlmZXN0UmVzb3VyY2VQcmV2aWV3KTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlTWFuaWZlc3RSZXNvdXJjZU1lcmdlUmVzdWx0PiB7XG5cdFx0Y29uc3QgbG9jYWxQcm9maWxlcyA9IHRoaXMuZ2V0TG9jYWxVc2VyRGF0YVByb2ZpbGVzKCk7XG5cdFx0Y29uc3QgbWVyZ2VSZXN1bHQgPSBtZXJnZShsb2NhbFByb2ZpbGVzLCBudWxsLCBudWxsLCBbXSk7XG5cdFx0Y29uc3QgeyBsb2NhbCwgcmVtb3RlIH0gPSBtZXJnZVJlc3VsdDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogcmVzb3VyY2VQcmV2aWV3LmxvY2FsQ29udGVudCxcblx0XHRcdGxvY2FsLFxuXHRcdFx0cmVtb3RlLFxuXHRcdFx0bG9jYWxDaGFuZ2U6IGxvY2FsLmFkZGVkLmxlbmd0aCA+IDAgfHwgbG9jYWwucmVtb3ZlZC5sZW5ndGggPiAwIHx8IGxvY2FsLnVwZGF0ZWQubGVuZ3RoID4gMCA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5Ob25lLFxuXHRcdFx0cmVtb3RlQ2hhbmdlOiByZW1vdGUgIT09IG51bGwgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuTm9uZSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhY2NlcHRSZW1vdGUocmVzb3VyY2VQcmV2aWV3OiBJVXNlckRhdGFQcm9maWxlc01hbmlmZXN0UmVzb3VyY2VQcmV2aWV3KTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlTWFuaWZlc3RSZXNvdXJjZU1lcmdlUmVzdWx0PiB7XG5cdFx0Y29uc3QgcmVtb3RlUHJvZmlsZXM6IElTeW5jVXNlckRhdGFQcm9maWxlW10gPSByZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCA/IEpTT04ucGFyc2UocmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQpIDogbnVsbDtcblx0XHRjb25zdCBsYXN0U3luY1Byb2ZpbGVzOiBJU3luY1VzZXJEYXRhUHJvZmlsZVtdID0gW107XG5cdFx0Y29uc3QgbG9jYWxQcm9maWxlczogSVVzZXJEYXRhUHJvZmlsZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHRoaXMuZ2V0TG9jYWxVc2VyRGF0YVByb2ZpbGVzKCkpIHtcblx0XHRcdGNvbnN0IHJlbW90ZVByb2ZpbGUgPSByZW1vdGVQcm9maWxlcz8uZmluZChyZW1vdGVQcm9maWxlID0+IHJlbW90ZVByb2ZpbGUuaWQgPT09IHByb2ZpbGUuaWQpO1xuXHRcdFx0aWYgKHJlbW90ZVByb2ZpbGUpIHtcblx0XHRcdFx0bGFzdFN5bmNQcm9maWxlcy5wdXNoKHsgaWQ6IHByb2ZpbGUuaWQsIG5hbWU6IHByb2ZpbGUubmFtZSwgY29sbGVjdGlvbjogcmVtb3RlUHJvZmlsZS5jb2xsZWN0aW9uIH0pO1xuXHRcdFx0XHRsb2NhbFByb2ZpbGVzLnB1c2gocHJvZmlsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChyZW1vdGVQcm9maWxlcyAhPT0gbnVsbCkge1xuXHRcdFx0Y29uc3QgbWVyZ2VSZXN1bHQgPSBtZXJnZShsb2NhbFByb2ZpbGVzLCByZW1vdGVQcm9maWxlcywgbGFzdFN5bmNQcm9maWxlcywgW10pO1xuXHRcdFx0Y29uc3QgeyBsb2NhbCwgcmVtb3RlIH0gPSBtZXJnZVJlc3VsdDtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50LFxuXHRcdFx0XHRsb2NhbCxcblx0XHRcdFx0cmVtb3RlLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogbG9jYWwuYWRkZWQubGVuZ3RoID4gMCB8fCBsb2NhbC5yZW1vdmVkLmxlbmd0aCA+IDAgfHwgbG9jYWwudXBkYXRlZC5sZW5ndGggPiAwID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLk5vbmUsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogcmVtb3RlICE9PSBudWxsID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLk5vbmUsXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCxcblx0XHRcdFx0bG9jYWw6IHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgdXBkYXRlZDogW10gfSxcblx0XHRcdFx0cmVtb3RlOiBudWxsLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBhcHBseVJlc3VsdChyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCByZXNvdXJjZVByZXZpZXdzOiBbSVVzZXJEYXRhUHJvZmlsZXNNYW5pZmVzdFJlc291cmNlUHJldmlldywgSVVzZXJEYXRhUHJvZmlsZU1hbmlmZXN0UmVzb3VyY2VNZXJnZVJlc3VsdF1bXSwgZm9yY2U6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IGxvY2FsLCByZW1vdGUsIGxvY2FsQ2hhbmdlLCByZW1vdGVDaGFuZ2UgfSA9IHJlc291cmNlUHJldmlld3NbMF1bMV07XG5cdFx0aWYgKGxvY2FsQ2hhbmdlID09PSBDaGFuZ2UuTm9uZSAmJiByZW1vdGVDaGFuZ2UgPT09IENoYW5nZS5Ob25lKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogTm8gY2hhbmdlcyBmb3VuZCBkdXJpbmcgc3luY2hyb25pemluZyBwcm9maWxlcy5gKTtcblx0XHR9XG5cblx0XHRjb25zdCByZW1vdGVQcm9maWxlcyA9IHJlc291cmNlUHJldmlld3NbMF1bMF0ucmVtb3RlUHJvZmlsZXMgfHwgW107XG5cdFx0aWYgKHJlbW90ZVByb2ZpbGVzLmxlbmd0aCArIChyZW1vdGU/LmFkZGVkLmxlbmd0aCA/PyAwKSAtIChyZW1vdGU/LnJlbW92ZWQubGVuZ3RoID8/IDApID4gMjApIHtcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNFcnJvcignVG9vIG1hbnkgcHJvZmlsZXMgdG8gc3luYy4gUGxlYXNlIHJlbW92ZSBzb21lIHByb2ZpbGVzIGFuZCB0cnkgYWdhaW4uJywgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkxvY2FsVG9vTWFueVByb2ZpbGVzKTtcblx0XHR9XG5cblx0XHRpZiAobG9jYWxDaGFuZ2UgIT09IENoYW5nZS5Ob25lKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmJhY2t1cExvY2FsKHN0cmluZ2lmeUxvY2FsUHJvZmlsZXModGhpcy5nZXRMb2NhbFVzZXJEYXRhUHJvZmlsZXMoKSwgZmFsc2UpKTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGxvY2FsLnJlbW92ZWQubWFwKGFzeW5jIHByb2ZpbGUgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFJlbW92aW5nICcke3Byb2ZpbGUubmFtZX0nIHByb2ZpbGUuLi5gKTtcblx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5yZW1vdmVQcm9maWxlKHByb2ZpbGUpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogUmVtb3ZlZCBwcm9maWxlICcke3Byb2ZpbGUubmFtZX0nLmApO1xuXHRcdFx0fSkpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwobG9jYWwuYWRkZWQubWFwKGFzeW5jIHByb2ZpbGUgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IENyZWF0aW5nICcke3Byb2ZpbGUubmFtZX0nIHByb2ZpbGUuLi5gKTtcblx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5jcmVhdGVQcm9maWxlKHByb2ZpbGUuaWQsIHByb2ZpbGUubmFtZSwgeyBpY29uOiBwcm9maWxlLmljb24sIHVzZURlZmF1bHRGbGFnczogcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3MgfSk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBDcmVhdGVkIHByb2ZpbGUgJyR7cHJvZmlsZS5uYW1lfScuYCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChsb2NhbC51cGRhdGVkLm1hcChhc3luYyBwcm9maWxlID0+IHtcblx0XHRcdFx0Y29uc3QgbG9jYWxQcm9maWxlID0gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5maW5kKHAgPT4gcC5pZCA9PT0gcHJvZmlsZS5pZCk7XG5cdFx0XHRcdGlmIChsb2NhbFByb2ZpbGUpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0aW5nICcke3Byb2ZpbGUubmFtZX0nIHByb2ZpbGUuLi5gKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnVwZGF0ZVByb2ZpbGUobG9jYWxQcm9maWxlLCB7IG5hbWU6IHByb2ZpbGUubmFtZSwgaWNvbjogcHJvZmlsZS5pY29uLCB1c2VEZWZhdWx0RmxhZ3M6IHByb2ZpbGUudXNlRGVmYXVsdEZsYWdzIH0pO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGVkIHByb2ZpbGUgJyR7cHJvZmlsZS5uYW1lfScuYCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IENvdWxkIG5vdCBmaW5kIHByb2ZpbGUgd2l0aCBpZCAnJHtwcm9maWxlLmlkfScgdG8gdXBkYXRlLmApO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlbW90ZUNoYW5nZSAhPT0gQ2hhbmdlLk5vbmUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRpbmcgcmVtb3RlIHByb2ZpbGVzLi4uYCk7XG5cdFx0XHRjb25zdCBhZGRlZENvbGxlY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgY2FuQWRkUmVtb3RlUHJvZmlsZXMgPSByZW1vdGVQcm9maWxlcy5sZW5ndGggKyAocmVtb3RlPy5hZGRlZC5sZW5ndGggPz8gMCkgPD0gMjA7XG5cdFx0XHRpZiAoY2FuQWRkUmVtb3RlUHJvZmlsZXMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHJlbW90ZT8uYWRkZWQgfHwgW10pIHtcblx0XHRcdFx0XHRjb25zdCBjb2xsZWN0aW9uID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UuY3JlYXRlQ29sbGVjdGlvbih0aGlzLnN5bmNIZWFkZXJzKTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IENyZWF0ZWQgY29sbGVjdGlvbiBcIiR7Y29sbGVjdGlvbn1cIiBmb3IgXCIke3Byb2ZpbGUubmFtZX1cIi5gKTtcblx0XHRcdFx0XHRhZGRlZENvbGxlY3Rpb25zLnB1c2goY29sbGVjdGlvbik7XG5cdFx0XHRcdFx0cmVtb3RlUHJvZmlsZXMucHVzaCh7IGlkOiBwcm9maWxlLmlkLCBuYW1lOiBwcm9maWxlLm5hbWUsIGNvbGxlY3Rpb24sIGljb246IHByb2ZpbGUuaWNvbiwgdXNlRGVmYXVsdEZsYWdzOiBwcm9maWxlLnVzZURlZmF1bHRGbGFncyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IENvdWxkIG5vdCBjcmVhdGUgcmVtb3RlIHByb2ZpbGVzIGFzIHRoZXJlIGFyZSB0b28gbWFueSBwcm9maWxlcy5gKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgcHJvZmlsZSBvZiByZW1vdGU/LnJlbW92ZWQgfHwgW10pIHtcblx0XHRcdFx0cmVtb3RlUHJvZmlsZXMuc3BsaWNlKHJlbW90ZVByb2ZpbGVzLmZpbmRJbmRleCgoeyBpZCB9KSA9PiBwcm9maWxlLmlkID09PSBpZCksIDEpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHJlbW90ZT8udXBkYXRlZCB8fCBbXSkge1xuXHRcdFx0XHRjb25zdCBwcm9maWxlVG9CZVVwZGF0ZWQgPSByZW1vdGVQcm9maWxlcy5maW5kKCh7IGlkIH0pID0+IHByb2ZpbGUuaWQgPT09IGlkKTtcblx0XHRcdFx0aWYgKHByb2ZpbGVUb0JlVXBkYXRlZCkge1xuXHRcdFx0XHRcdHJlbW90ZVByb2ZpbGVzLnNwbGljZShyZW1vdGVQcm9maWxlcy5pbmRleE9mKHByb2ZpbGVUb0JlVXBkYXRlZCksIDEsIHsgLi4ucHJvZmlsZVRvQmVVcGRhdGVkLCBpZDogcHJvZmlsZS5pZCwgbmFtZTogcHJvZmlsZS5uYW1lLCBpY29uOiBwcm9maWxlLmljb24sIHVzZURlZmF1bHRGbGFnczogcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3MgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0aGlzLnVwZGF0ZVJlbW90ZVByb2ZpbGVzKHJlbW90ZVByb2ZpbGVzLCBmb3JjZSA/IG51bGwgOiByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCByZW1vdGUgcHJvZmlsZXMuJHtjYW5BZGRSZW1vdGVQcm9maWxlcyAmJiByZW1vdGU/LmFkZGVkLmxlbmd0aCA/IGAgQWRkZWQ6ICR7SlNPTi5zdHJpbmdpZnkocmVtb3RlLmFkZGVkLm1hcChlID0+IGUubmFtZSkpfS5gIDogJyd9JHtyZW1vdGU/LnVwZGF0ZWQubGVuZ3RoID8gYCBVcGRhdGVkOiAke0pTT04uc3RyaW5naWZ5KHJlbW90ZS51cGRhdGVkLm1hcChlID0+IGUubmFtZSkpfS5gIDogJyd9JHtyZW1vdGU/LnJlbW92ZWQubGVuZ3RoID8gYCBSZW1vdmVkOiAke0pTT04uc3RyaW5naWZ5KHJlbW90ZS5yZW1vdmVkLm1hcChlID0+IGUubmFtZSkpfS5gIDogJyd9YCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAoYWRkZWRDb2xsZWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogRmFpbGVkIHRvIHVwZGF0ZSByZW1vdGUgcHJvZmlsZXMuIENsZWFuaW5nIHVwIGFkZGVkIGNvbGxlY3Rpb25zLi4uYCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjb2xsZWN0aW9uIG9mIGFkZGVkQ29sbGVjdGlvbnMpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLmRlbGV0ZUNvbGxlY3Rpb24oY29sbGVjdGlvbiwgdGhpcy5zeW5jSGVhZGVycyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgcmVtb3RlPy5yZW1vdmVkIHx8IFtdKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLmRlbGV0ZUNvbGxlY3Rpb24ocHJvZmlsZS5jb2xsZWN0aW9uLCB0aGlzLnN5bmNIZWFkZXJzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobGFzdFN5bmNVc2VyRGF0YT8ucmVmICE9PSByZW1vdGVVc2VyRGF0YS5yZWYpIHtcblx0XHRcdC8vIHVwZGF0ZSBsYXN0IHN5bmNcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRpbmcgbGFzdCBzeW5jaHJvbml6ZWQgcHJvZmlsZXMuLi5gKTtcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTGFzdFN5bmNVc2VyRGF0YShyZW1vdGVVc2VyRGF0YSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCBsYXN0IHN5bmNocm9uaXplZCBwcm9maWxlcy5gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB1cGRhdGVSZW1vdGVQcm9maWxlcyhwcm9maWxlczogSVN5bmNVc2VyRGF0YVByb2ZpbGVbXSwgcmVmOiBzdHJpbmcgfCBudWxsKTogUHJvbWlzZTxJUmVtb3RlVXNlckRhdGE+IHtcblx0XHRyZXR1cm4gdGhpcy51cGRhdGVSZW1vdGVVc2VyRGF0YSh0aGlzLnN0cmluZ2lmeVJlbW90ZVByb2ZpbGVzKHByb2ZpbGVzKSwgcmVmKTtcblx0fVxuXG5cdGFzeW5jIGhhc0xvY2FsRGF0YSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRMb2NhbFVzZXJEYXRhUHJvZmlsZXMoKS5sZW5ndGggPiAwO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUNvbnRlbnQodXJpOiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbCh0aGlzLnJlbW90ZVJlc291cmNlLCB1cmkpXG5cdFx0XHR8fCB0aGlzLmV4dFVyaS5pc0VxdWFsKHRoaXMuYmFzZVJlc291cmNlLCB1cmkpXG5cdFx0XHR8fCB0aGlzLmV4dFVyaS5pc0VxdWFsKHRoaXMubG9jYWxSZXNvdXJjZSwgdXJpKVxuXHRcdFx0fHwgdGhpcy5leHRVcmkuaXNFcXVhbCh0aGlzLmFjY2VwdGVkUmVzb3VyY2UsIHVyaSlcblx0XHQpIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnJlc29sdmVQcmV2aWV3Q29udGVudCh1cmkpO1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQgPyB0b0Zvcm1hdHRlZFN0cmluZyhKU09OLnBhcnNlKGNvbnRlbnQpLCB7fSkgOiBjb250ZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TG9jYWxVc2VyRGF0YVByb2ZpbGVzKCk6IElVc2VyRGF0YVByb2ZpbGVbXSB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmlsdGVyKHAgPT4gIXAuaXNEZWZhdWx0ICYmICFwLmlzVHJhbnNpZW50KTtcblx0fVxuXG5cdHByaXZhdGUgc3RyaW5naWZ5UmVtb3RlUHJvZmlsZXMocHJvZmlsZXM6IElTeW5jVXNlckRhdGFQcm9maWxlW10pOiBzdHJpbmcge1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShbLi4ucHJvZmlsZXNdLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpKTtcblx0fVxuXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdHJpbmdpZnlMb2NhbFByb2ZpbGVzKHByb2ZpbGVzOiBJVXNlckRhdGFQcm9maWxlW10sIGZvcm1hdDogYm9vbGVhbik6IHN0cmluZyB7XG5cdGNvbnN0IHJlc3VsdCA9IFsuLi5wcm9maWxlc10uc29ydCgoYSwgYikgPT4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSkubWFwKHAgPT4gKHsgaWQ6IHAuaWQsIG5hbWU6IHAubmFtZSB9KSk7XG5cdHJldHVybiBmb3JtYXQgPyB0b0Zvcm1hdHRlZFN0cmluZyhyZXN1bHQsIHt9KSA6IEpTT04uc3RyaW5naWZ5KHJlc3VsdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVVzZXJEYXRhUHJvZmlsZXNNYW5pZmVzdChzeW5jRGF0YTogSVN5bmNEYXRhKTogSVN5bmNVc2VyRGF0YVByb2ZpbGVbXSB7XG5cdHJldHVybiBKU09OLnBhcnNlKHN5bmNEYXRhLmNvbnRlbnQpO1xufVxuXG5cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBMkIsZ0NBQWdDO0FBQzNELFNBQVMsNEJBQTJFO0FBQ3BGLFNBQVMsYUFBYTtBQUN0QixTQUFTLFFBQXFFLGdDQUF1RCxnQ0FBZ0MseUJBQXlCLDJCQUEyQixjQUFjLHVCQUF1QixtQkFBbUIsNkJBQTZCO0FBWXZTLElBQU0sdUNBQU4sY0FBbUQscUJBQXNEO0FBQUEsRUFTL0csWUFDQyxTQUNBLFlBQzJDLHlCQUM3QixhQUNPLG9CQUNKLGdCQUNVLDBCQUNLLCtCQUNQLFlBQ0Ysc0JBQ1MsK0JBQ2Isa0JBQ0Usb0JBQ3BCO0FBQ0QsVUFBTSxFQUFFLGNBQWMsYUFBYSxVQUFVLFFBQVEsR0FBRyxZQUFZLGFBQWEsb0JBQW9CLGdCQUFnQiwwQkFBMEIsK0JBQStCLCtCQUErQixrQkFBa0IsWUFBWSxzQkFBc0Isa0JBQWtCO0FBWnhPO0FBVjVDLFNBQW1CLFVBQWtCO0FBQ3JDLFNBQVMsa0JBQXVCLEtBQUssT0FBTyxTQUFTLEtBQUssbUJBQW1CLGVBQWU7QUFDNUYsU0FBUyxlQUFvQixLQUFLLGdCQUFnQixLQUFLLEVBQUUsUUFBUSx1QkFBdUIsV0FBVyxPQUFPLENBQUM7QUFDM0csU0FBUyxnQkFBcUIsS0FBSyxnQkFB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QUFHLEtBQUssb0JBQW9CLDBDQUEwQztBQUM1RixZQUFNLEtBQUssdUJBQXVCLGNBQWM7QUFDaEQsV0FBSyxXQUFXLEtBQUssR0FBRyxLQUFLLG9CQUFvQix1Q0FBdUM7QUFBQSxJQUN6RjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0scUJBQXFCLFVBQWtDLEtBQThDO0FBQzFHLFdBQU8sS0FBSyxxQkFBcUIsS0FBSyx3QkFBd0IsUUFBUSxHQUFHLEdBQUc7QUFBQSxFQUM3RTtBQUFBLEVBRUEsTUFBTSxlQUFpQztBQUN0QyxXQUFPLEtBQUsseUJBQXlCLEVBQUUsU0FBUztBQUFBLEVBQ2pEO0FBQUEsRUFFQSxNQUFNLGVBQWUsS0FBa0M7QUFDdEQsUUFBSSxLQUFLLE9BQU8sUUFBUSxLQUFLLGdCQUFnQixHQUFHLEtBQzVDLEtBQUssT0FBTyxRQUFRLEtBQUssY0FBYyxHQUFHLEtBQzFDLEtBQUssT0FBTyxRQUFRLEtBQUssZUFBZSxHQUFHLEtBQzNDLEtBQUssT0FBTyxRQUFRLEtBQUssa0JBQWtCLEdBQUcsR0FDaEQ7QUFDRCxZQUFNLFVBQVUsTUFBTSxLQUFLLHNCQUFzQixHQUFHO0FBQ3BELGFBQU8sVUFBVSxrQkFBa0IsS0FBSyxNQUFNLE9BQU8sR0FBRyxDQUFDLENBQUMsSUFBSTtBQUFBLElBQy9EO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLDJCQUErQztBQUN0RCxXQUFPLEtBQUssd0JBQXdCLFNBQVMsT0FBTyxPQUFLLENBQUMsRUFBRSxhQUFhLENBQUMsRUFBRSxXQUFXO0FBQUEsRUFDeEY7QUFBQSxFQUVRLHdCQUF3QixVQUEwQztBQUN6RSxXQUFPLEtBQUssVUFBVSxDQUFDLEdBQUcsUUFBUSxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUFBLEVBQ2pGO0FBRUQ7QUFqUWEsdUNBQU47QUFBQSxFQVlKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdEJVO0FBbVFOLFNBQVMsdUJBQXVCLFVBQThCLFFBQXlCO0FBQzdGLFFBQU0sU0FBUyxDQUFDLEdBQUcsUUFBUSxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLGNBQWMsRUFBRSxJQUFJLENBQUMsRUFBRSxJQUFJLFFBQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxNQUFNLEVBQUUsS0FBSyxFQUFFO0FBQy9HLFNBQU8sU0FBUyxrQkFBa0IsUUFBUSxDQUFDLENBQUMsSUFBSSxLQUFLLFVBQVUsTUFBTTtBQUN0RTtBQUVPLFNBQVMsOEJBQThCLFVBQTZDO0FBQzFGLFNBQU8sS0FBSyxNQUFNLFNBQVMsT0FBTztBQUNuQzsiLAogICJuYW1lcyI6IFsicmVtb3RlUHJvZmlsZSJdCn0K
