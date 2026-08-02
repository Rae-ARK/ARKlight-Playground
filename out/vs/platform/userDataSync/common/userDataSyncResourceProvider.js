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
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { IFileService } from "../../files/common/files.js";
import { getServiceMachineId } from "../../externalServices/common/serviceMachineId.js";
import { IStorageService } from "../../storage/common/storage.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncStoreService, SyncResource, UserDataSyncError, UserDataSyncErrorCode, USER_DATA_SYNC_SCHEME, CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM } from "./userDataSync.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { isSyncData } from "./abstractSynchronizer.js";
import { parseSnippets } from "./snippetsSync.js";
import { parseSettingsSyncContent } from "./settingsSync.js";
import { getKeybindingsContentFromSyncContent } from "./keybindingsSync.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { getTasksContentFromSyncContent } from "./tasksSync.js";
import { getMcpContentFromSyncContent } from "./mcpSync.js";
import { LocalExtensionsProvider, parseExtensions, stringify as stringifyExtensions } from "./extensionsSync.js";
import { LocalGlobalStateProvider, stringify as stringifyGlobalState } from "./globalStateSync.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { parseUserDataProfilesManifest, stringifyLocalProfiles } from "./userDataProfilesManifestSync.js";
import { toFormattedString } from "../../../base/common/jsonFormatter.js";
import { trim } from "../../../base/common/strings.js";
import { parsePrompts } from "./promptsSync/promptsSync.js";
let UserDataSyncResourceProviderService = class {
  constructor(userDataSyncStoreService, userDataSyncLocalStoreService, logService, uriIdentityService, environmentService, storageService, fileService, userDataProfilesService, configurationService, instantiationService) {
    this.userDataSyncStoreService = userDataSyncStoreService;
    this.userDataSyncLocalStoreService = userDataSyncLocalStoreService;
    this.logService = logService;
    this.environmentService = environmentService;
    this.storageService = storageService;
    this.fileService = fileService;
    this.userDataProfilesService = userDataProfilesService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.extUri = uriIdentityService.extUri;
  }
  async getRemoteSyncedProfiles() {
    const userData = await this.userDataSyncStoreService.readResource(SyncResource.Profiles, null, void 0);
    if (userData.content) {
      const syncData = this.parseSyncData(userData.content, SyncResource.Profiles);
      return parseUserDataProfilesManifest(syncData);
    }
    return [];
  }
  async getLocalSyncedProfiles(location) {
    const refs = await this.userDataSyncLocalStoreService.getAllResourceRefs(SyncResource.Profiles, void 0, location);
    if (refs.length) {
      const content = await this.userDataSyncLocalStoreService.resolveResourceContent(SyncResource.Profiles, refs[0].ref, void 0, location);
      if (content) {
        const syncData = this.parseSyncData(content, SyncResource.Profiles);
        return parseUserDataProfilesManifest(syncData);
      }
    }
    return [];
  }
  async getLocalSyncedMachines(location) {
    const refs = await this.userDataSyncLocalStoreService.getAllResourceRefs("machines", void 0, location);
    if (refs.length) {
      const content = await this.userDataSyncLocalStoreService.resolveResourceContent("machines", refs[0].ref, void 0, location);
      if (content) {
        const machinesData = JSON.parse(content);
        return machinesData.machines.map((m) => ({ ...m, isCurrent: false }));
      }
    }
    return [];
  }
  async getRemoteSyncResourceHandles(syncResource, profile) {
    const handles = await this.userDataSyncStoreService.getAllResourceRefs(syncResource, profile?.collection);
    return handles.map(({ created, ref }) => ({
      created,
      uri: this.toUri({
        remote: true,
        syncResource,
        profile: profile?.id ?? this.userDataProfilesService.defaultProfile.id,
        location: void 0,
        collection: profile?.collection,
        ref,
        node: void 0
      })
    }));
  }
  async getLocalSyncResourceHandles(syncResource, profile, location) {
    const handles = await this.userDataSyncLocalStoreService.getAllResourceRefs(syncResource, profile?.collection, location);
    return handles.map(({ created, ref }) => ({
      created,
      uri: this.toUri({
        remote: false,
        syncResource,
        profile: profile?.id ?? this.userDataProfilesService.defaultProfile.id,
        collection: profile?.collection,
        ref,
        node: void 0,
        location
      })
    }));
  }
  resolveUserDataSyncResource({ uri }) {
    const resolved = this.resolveUri(uri);
    const profile = resolved ? this.userDataProfilesService.profiles.find((p) => p.id === resolved.profile) : void 0;
    return resolved && profile ? { profile, syncResource: resolved?.syncResource } : void 0;
  }
  async getAssociatedResources({ uri }) {
    const resolved = this.resolveUri(uri);
    if (!resolved) {
      return [];
    }
    const profile = this.userDataProfilesService.profiles.find((p) => p.id === resolved.profile);
    switch (resolved.syncResource) {
      case SyncResource.Settings:
        return this.getSettingsAssociatedResources(uri, profile);
      case SyncResource.Keybindings:
        return this.getKeybindingsAssociatedResources(uri, profile);
      case SyncResource.Tasks:
        return this.getTasksAssociatedResources(uri, profile);
      case SyncResource.Mcp:
        return this.getMcpAssociatedResources(uri, profile);
      case SyncResource.Snippets:
        return this.getSnippetsAssociatedResources(uri, profile);
      case SyncResource.Prompts:
        return this.getPromptsAssociatedResources(uri, profile);
      case SyncResource.GlobalState:
        return this.getGlobalStateAssociatedResources(uri, profile);
      case SyncResource.Extensions:
        return this.getExtensionsAssociatedResources(uri, profile);
      case SyncResource.Profiles:
        return this.getProfilesAssociatedResources(uri, profile);
      case SyncResource.WorkspaceState:
        return [];
    }
  }
  async getMachineId({ uri }) {
    const resolved = this.resolveUri(uri);
    if (!resolved) {
      return void 0;
    }
    if (resolved.remote) {
      if (resolved.ref) {
        const { content } = await this.getUserData(resolved.syncResource, resolved.ref, resolved.collection);
        if (content) {
          const syncData = this.parseSyncData(content, resolved.syncResource);
          return syncData?.machineId;
        }
      }
      return void 0;
    }
    if (resolved.location) {
      if (resolved.ref) {
        const content = await this.userDataSyncLocalStoreService.resolveResourceContent(resolved.syncResource, resolved.ref, resolved.collection, resolved.location);
        if (content) {
          const syncData = this.parseSyncData(content, resolved.syncResource);
          return syncData?.machineId;
        }
      }
      return void 0;
    }
    return getServiceMachineId(this.environmentService, this.fileService, this.storageService);
  }
  async resolveContent(uri) {
    const resolved = this.resolveUri(uri);
    if (!resolved) {
      return null;
    }
    if (resolved.node === UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE) {
      return null;
    }
    if (resolved.ref) {
      const content = await this.getContentFromStore(resolved.remote, resolved.syncResource, resolved.collection, resolved.ref, resolved.location);
      if (resolved.node && content) {
        return this.resolveNodeContent(resolved.syncResource, content, resolved.node);
      }
      return content;
    }
    if (!resolved.remote && !resolved.node) {
      return this.resolveLatestContent(resolved.syncResource, resolved.profile);
    }
    return null;
  }
  async getContentFromStore(remote, syncResource, collection, ref, location) {
    if (remote) {
      const { content } = await this.getUserData(syncResource, ref, collection);
      return content;
    }
    return this.userDataSyncLocalStoreService.resolveResourceContent(syncResource, ref, collection, location);
  }
  resolveNodeContent(syncResource, content, node) {
    const syncData = this.parseSyncData(content, syncResource);
    switch (syncResource) {
      case SyncResource.Settings:
        return this.resolveSettingsNodeContent(syncData, node);
      case SyncResource.Keybindings:
        return this.resolveKeybindingsNodeContent(syncData, node);
      case SyncResource.Tasks:
        return this.resolveTasksNodeContent(syncData, node);
      case SyncResource.Mcp:
        return this.resolveMcpNodeContent(syncData, node);
      case SyncResource.Snippets:
        return this.resolveSnippetsNodeContent(syncData, node);
      case SyncResource.Prompts:
        return this.resolvePromptsNodeContent(syncData, node);
      case SyncResource.GlobalState:
        return this.resolveGlobalStateNodeContent(syncData, node);
      case SyncResource.Extensions:
        return this.resolveExtensionsNodeContent(syncData, node);
      case SyncResource.Profiles:
        return this.resolveProfileNodeContent(syncData, node);
      case SyncResource.WorkspaceState:
        return null;
    }
  }
  async resolveLatestContent(syncResource, profileId) {
    const profile = this.userDataProfilesService.profiles.find((p) => p.id === profileId);
    if (!profile) {
      return null;
    }
    switch (syncResource) {
      case SyncResource.GlobalState:
        return this.resolveLatestGlobalStateContent(profile);
      case SyncResource.Extensions:
        return this.resolveLatestExtensionsContent(profile);
      case SyncResource.Profiles:
        return this.resolveLatestProfilesContent(profile);
      case SyncResource.Settings:
        return null;
      case SyncResource.Keybindings:
        return null;
      case SyncResource.Tasks:
        return null;
      case SyncResource.Mcp:
        return null;
      case SyncResource.Snippets:
        return null;
      case SyncResource.Prompts:
        return null;
      case SyncResource.WorkspaceState:
        return null;
    }
  }
  getSettingsAssociatedResources(uri, profile) {
    const resource = this.extUri.joinPath(uri, "settings.json");
    const comparableResource = profile ? profile.settingsResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
    return [{ resource, comparableResource }];
  }
  resolveSettingsNodeContent(syncData, node) {
    switch (node) {
      case "settings.json":
        return parseSettingsSyncContent(syncData.content).settings;
    }
    return null;
  }
  getKeybindingsAssociatedResources(uri, profile) {
    const resource = this.extUri.joinPath(uri, "keybindings.json");
    const comparableResource = profile ? profile.keybindingsResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
    return [{ resource, comparableResource }];
  }
  resolveKeybindingsNodeContent(syncData, node) {
    switch (node) {
      case "keybindings.json":
        return getKeybindingsContentFromSyncContent(syncData.content, !!this.configurationService.getValue(CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM), this.logService);
    }
    return null;
  }
  getTasksAssociatedResources(uri, profile) {
    const resource = this.extUri.joinPath(uri, "tasks.json");
    const comparableResource = profile ? profile.tasksResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
    return [{ resource, comparableResource }];
  }
  resolveTasksNodeContent(syncData, node) {
    switch (node) {
      case "tasks.json":
        return getTasksContentFromSyncContent(syncData.content, this.logService);
    }
    return null;
  }
  async getSnippetsAssociatedResources(uri, profile) {
    const content = await this.resolveContent(uri);
    if (content) {
      const syncData = this.parseSyncData(content, SyncResource.Snippets);
      if (syncData) {
        const snippets = parseSnippets(syncData);
        const result = [];
        for (const snippet of Object.keys(snippets)) {
          const resource = this.extUri.joinPath(uri, snippet);
          const comparableResource = profile ? this.extUri.joinPath(profile.snippetsHome, snippet) : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
          result.push({ resource, comparableResource });
        }
        return result;
      }
    }
    return [];
  }
  resolveSnippetsNodeContent(syncData, node) {
    return parseSnippets(syncData)[node] || null;
  }
  async getPromptsAssociatedResources(uri, profile) {
    const content = await this.resolveContent(uri);
    if (content) {
      const syncData = this.parseSyncData(content, SyncResource.Prompts);
      if (syncData) {
        const prompts = parsePrompts(syncData);
        const result = [];
        for (const prompt of Object.keys(prompts)) {
          const resource = this.extUri.joinPath(uri, prompt);
          const comparableResource = profile ? this.extUri.joinPath(profile.promptsHome, prompt) : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
          result.push({ resource, comparableResource });
        }
        return result;
      }
    }
    return [];
  }
  resolvePromptsNodeContent(syncData, node) {
    return parsePrompts(syncData)[node] || null;
  }
  getExtensionsAssociatedResources(uri, profile) {
    const resource = this.extUri.joinPath(uri, "extensions.json");
    const comparableResource = profile ? this.toUri({
      remote: false,
      syncResource: SyncResource.Extensions,
      profile: profile.id,
      location: void 0,
      collection: void 0,
      ref: void 0,
      node: void 0
    }) : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
    return [{ resource, comparableResource }];
  }
  resolveExtensionsNodeContent(syncData, node) {
    switch (node) {
      case "extensions.json":
        return stringifyExtensions(parseExtensions(syncData), true);
    }
    return null;
  }
  async resolveLatestExtensionsContent(profile) {
    const { localExtensions } = await this.instantiationService.createInstance(LocalExtensionsProvider).getLocalExtensions(profile);
    return stringifyExtensions(localExtensions, true);
  }
  getGlobalStateAssociatedResources(uri, profile) {
    const resource = this.extUri.joinPath(uri, "globalState.json");
    const comparableResource = profile ? this.toUri({
      remote: false,
      syncResource: SyncResource.GlobalState,
      profile: profile.id,
      location: void 0,
      collection: void 0,
      ref: void 0,
      node: void 0
    }) : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
    return [{ resource, comparableResource }];
  }
  resolveGlobalStateNodeContent(syncData, node) {
    switch (node) {
      case "globalState.json":
        return stringifyGlobalState(JSON.parse(syncData.content), true);
    }
    return null;
  }
  async resolveLatestGlobalStateContent(profile) {
    const localGlobalState = await this.instantiationService.createInstance(LocalGlobalStateProvider).getLocalGlobalState(profile);
    return stringifyGlobalState(localGlobalState, true);
  }
  getProfilesAssociatedResources(uri, profile) {
    const resource = this.extUri.joinPath(uri, "profiles.json");
    const comparableResource = this.toUri({
      remote: false,
      syncResource: SyncResource.Profiles,
      profile: this.userDataProfilesService.defaultProfile.id,
      location: void 0,
      collection: void 0,
      ref: void 0,
      node: void 0
    });
    return [{ resource, comparableResource }];
  }
  resolveProfileNodeContent(syncData, node) {
    switch (node) {
      case "profiles.json":
        return toFormattedString(JSON.parse(syncData.content), {});
    }
    return null;
  }
  async resolveLatestProfilesContent(profile) {
    return stringifyLocalProfiles(this.userDataProfilesService.profiles.filter((p) => !p.isDefault && !p.isTransient), true);
  }
  toUri(syncResourceUriInfo) {
    const authority = syncResourceUriInfo.remote ? UserDataSyncResourceProviderService.REMOTE_BACKUP_AUTHORITY : UserDataSyncResourceProviderService.LOCAL_BACKUP_AUTHORITY;
    const paths = [];
    if (syncResourceUriInfo.location) {
      paths.push(`scheme:${syncResourceUriInfo.location.scheme}`);
      paths.push(`authority:${syncResourceUriInfo.location.authority}`);
      paths.push(trim(syncResourceUriInfo.location.path, "/"));
    }
    paths.push(`syncResource:${syncResourceUriInfo.syncResource}`);
    paths.push(`profile:${syncResourceUriInfo.profile}`);
    if (syncResourceUriInfo.collection) {
      paths.push(`collection:${syncResourceUriInfo.collection}`);
    }
    if (syncResourceUriInfo.ref) {
      paths.push(`ref:${syncResourceUriInfo.ref}`);
    }
    if (syncResourceUriInfo.node) {
      paths.push(syncResourceUriInfo.node);
    }
    return this.extUri.joinPath(URI.from({ scheme: USER_DATA_SYNC_SCHEME, authority, path: `/`, query: syncResourceUriInfo.location?.query, fragment: syncResourceUriInfo.location?.fragment }), ...paths);
  }
  resolveUri(uri) {
    if (uri.scheme !== USER_DATA_SYNC_SCHEME) {
      return void 0;
    }
    const paths = [];
    while (uri.path !== "/") {
      paths.unshift(this.extUri.basename(uri));
      uri = this.extUri.dirname(uri);
    }
    if (paths.length < 2) {
      return void 0;
    }
    const remote = uri.authority === UserDataSyncResourceProviderService.REMOTE_BACKUP_AUTHORITY;
    let scheme;
    let authority;
    const locationPaths = [];
    let syncResource;
    let profile;
    let collection;
    let ref;
    let node;
    while (paths.length) {
      const path = paths.shift();
      if (path.startsWith("scheme:")) {
        scheme = path.substring("scheme:".length);
      } else if (path.startsWith("authority:")) {
        authority = path.substring("authority:".length);
      } else if (path.startsWith("syncResource:")) {
        syncResource = path.substring("syncResource:".length);
      } else if (path.startsWith("profile:")) {
        profile = path.substring("profile:".length);
      } else if (path.startsWith("collection:")) {
        collection = path.substring("collection:".length);
      } else if (path.startsWith("ref:")) {
        ref = path.substring("ref:".length);
      } else if (!syncResource) {
        locationPaths.push(path);
      } else {
        node = path;
      }
    }
    return {
      remote,
      syncResource,
      profile,
      collection,
      ref,
      node,
      location: scheme && authority !== void 0 ? this.extUri.joinPath(URI.from({ scheme, authority, query: uri.query, fragment: uri.fragment, path: "/" }), ...locationPaths) : void 0
    };
  }
  parseSyncData(content, syncResource) {
    try {
      const syncData = JSON.parse(content);
      if (isSyncData(syncData)) {
        return syncData;
      }
    } catch (error) {
      this.logService.error(error);
    }
    throw new UserDataSyncError(localize("incompatible sync data", "Cannot parse sync data as it is not compatible with the current version."), UserDataSyncErrorCode.IncompatibleRemoteContent, syncResource);
  }
  async getUserData(syncResource, ref, collection) {
    const content = await this.userDataSyncStoreService.resolveResourceContent(syncResource, ref, collection);
    return { ref, content };
  }
  getMcpAssociatedResources(uri, profile) {
    const resource = this.extUri.joinPath(uri, "mcp.json");
    const comparableResource = profile ? profile.mcpResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
    return [{ resource, comparableResource }];
  }
  resolveMcpNodeContent(syncData, node) {
    switch (node) {
      case "mcp.json":
        return getMcpContentFromSyncContent(syncData.content, this.logService);
    }
    return null;
  }
};
UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE = "not-existing-resource";
UserDataSyncResourceProviderService.REMOTE_BACKUP_AUTHORITY = "remote-backup";
UserDataSyncResourceProviderService.LOCAL_BACKUP_AUTHORITY = "local-backup";
UserDataSyncResourceProviderService = __decorateClass([
  __decorateParam(0, IUserDataSyncStoreService),
  __decorateParam(1, IUserDataSyncLocalStoreService),
  __decorateParam(2, IUserDataSyncLogService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IUserDataProfilesService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IInstantiationService)
], UserDataSyncResourceProviderService);
export {
  UserDataSyncResourceProviderService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElFeHRVcmkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGdldFNlcnZpY2VNYWNoaW5lSWQgfSBmcm9tICcuLi8uLi9leHRlcm5hbFNlcnZpY2VzL2NvbW1vbi9zZXJ2aWNlTWFjaGluZUlkLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJU3luY0RhdGEsIElTeW5jUmVzb3VyY2VIYW5kbGUsIElVc2VyRGF0YSwgSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLCBJVXNlckRhdGFTeW5jTG9nU2VydmljZSwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgU3luY1Jlc291cmNlLCBVc2VyRGF0YVN5bmNFcnJvciwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLCBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIElVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZSwgSVN5bmNVc2VyRGF0YVByb2ZpbGUsIENPTkZJR19TWU5DX0tFWUJJTkRJTkdTX1BFUl9QTEFURk9STSwgSVVzZXJEYXRhU3luY1Jlc291cmNlIH0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgaXNTeW5jRGF0YSB9IGZyb20gJy4vYWJzdHJhY3RTeW5jaHJvbml6ZXIuanMnO1xuaW1wb3J0IHsgcGFyc2VTbmlwcGV0cyB9IGZyb20gJy4vc25pcHBldHNTeW5jLmpzJztcbmltcG9ydCB7IHBhcnNlU2V0dGluZ3NTeW5jQ29udGVudCB9IGZyb20gJy4vc2V0dGluZ3NTeW5jLmpzJztcbmltcG9ydCB7IGdldEtleWJpbmRpbmdzQ29udGVudEZyb21TeW5jQ29udGVudCB9IGZyb20gJy4va2V5YmluZGluZ3NTeW5jLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50IH0gZnJvbSAnLi90YXNrc1N5bmMuanMnO1xuaW1wb3J0IHsgZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudCB9IGZyb20gJy4vbWNwU3luYy5qcyc7XG5pbXBvcnQgeyBMb2NhbEV4dGVuc2lvbnNQcm92aWRlciwgcGFyc2VFeHRlbnNpb25zLCBzdHJpbmdpZnkgYXMgc3RyaW5naWZ5RXh0ZW5zaW9ucyB9IGZyb20gJy4vZXh0ZW5zaW9uc1N5bmMuanMnO1xuaW1wb3J0IHsgTG9jYWxHbG9iYWxTdGF0ZVByb3ZpZGVyLCBzdHJpbmdpZnkgYXMgc3RyaW5naWZ5R2xvYmFsU3RhdGUgfSBmcm9tICcuL2dsb2JhbFN0YXRlU3luYy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IHBhcnNlVXNlckRhdGFQcm9maWxlc01hbmlmZXN0LCBzdHJpbmdpZnlMb2NhbFByb2ZpbGVzIH0gZnJvbSAnLi91c2VyRGF0YVByb2ZpbGVzTWFuaWZlc3RTeW5jLmpzJztcbmltcG9ydCB7IHRvRm9ybWF0dGVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkZvcm1hdHRlci5qcyc7XG5pbXBvcnQgeyB0cmltIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJTWFjaGluZXNEYXRhLCBJVXNlckRhdGFTeW5jTWFjaGluZSB9IGZyb20gJy4vdXNlckRhdGFTeW5jTWFjaGluZXMuanMnO1xuaW1wb3J0IHsgcGFyc2VQcm9tcHRzIH0gZnJvbSAnLi9wcm9tcHRzU3luYy9wcm9tcHRzU3luYy5qcyc7XG5cbmludGVyZmFjZSBJU3luY1Jlc291cmNlVXJpSW5mbyB7XG5cdHJlYWRvbmx5IHJlbW90ZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2U7XG5cdHJlYWRvbmx5IHByb2ZpbGU6IHN0cmluZztcblx0cmVhZG9ubHkgY29sbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSByZWY6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbm9kZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBsb2NhdGlvbjogVVJJIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UgaW1wbGVtZW50cyBJVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBOT1RfRVhJU1RJTkdfUkVTT1VSQ0UgPSAnbm90LWV4aXN0aW5nLXJlc291cmNlJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVNT1RFX0JBQ0tVUF9BVVRIT1JJVFkgPSAncmVtb3RlLWJhY2t1cCc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IExPQ0FMX0JBQ0tVUF9BVVRIT1JJVFkgPSAnbG9jYWwtYmFja3VwJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGV4dFVyaTogSUV4dFVyaTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1N0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5leHRVcmkgPSB1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpO1xuXHR9XG5cblx0YXN5bmMgZ2V0UmVtb3RlU3luY2VkUHJvZmlsZXMoKTogUHJvbWlzZTxJU3luY1VzZXJEYXRhUHJvZmlsZVtdPiB7XG5cdFx0Y29uc3QgdXNlckRhdGEgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5yZWFkUmVzb3VyY2UoU3luY1Jlc291cmNlLlByb2ZpbGVzLCBudWxsLCB1bmRlZmluZWQpO1xuXHRcdGlmICh1c2VyRGF0YS5jb250ZW50KSB7XG5cdFx0XHRjb25zdCBzeW5jRGF0YSA9IHRoaXMucGFyc2VTeW5jRGF0YSh1c2VyRGF0YS5jb250ZW50LCBTeW5jUmVzb3VyY2UuUHJvZmlsZXMpO1xuXHRcdFx0cmV0dXJuIHBhcnNlVXNlckRhdGFQcm9maWxlc01hbmlmZXN0KHN5bmNEYXRhKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0YXN5bmMgZ2V0TG9jYWxTeW5jZWRQcm9maWxlcyhsb2NhdGlvbj86IFVSSSk6IFByb21pc2U8SVN5bmNVc2VyRGF0YVByb2ZpbGVbXT4ge1xuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLmdldEFsbFJlc291cmNlUmVmcyhTeW5jUmVzb3VyY2UuUHJvZmlsZXMsIHVuZGVmaW5lZCwgbG9jYXRpb24pO1xuXHRcdGlmIChyZWZzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UucmVzb2x2ZVJlc291cmNlQ29udGVudChTeW5jUmVzb3VyY2UuUHJvZmlsZXMsIHJlZnNbMF0ucmVmLCB1bmRlZmluZWQsIGxvY2F0aW9uKTtcblx0XHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRcdGNvbnN0IHN5bmNEYXRhID0gdGhpcy5wYXJzZVN5bmNEYXRhKGNvbnRlbnQsIFN5bmNSZXNvdXJjZS5Qcm9maWxlcyk7XG5cdFx0XHRcdHJldHVybiBwYXJzZVVzZXJEYXRhUHJvZmlsZXNNYW5pZmVzdChzeW5jRGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIGdldExvY2FsU3luY2VkTWFjaGluZXMobG9jYXRpb24/OiBVUkkpOiBQcm9taXNlPElVc2VyRGF0YVN5bmNNYWNoaW5lW10+IHtcblx0XHRjb25zdCByZWZzID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZS5nZXRBbGxSZXNvdXJjZVJlZnMoJ21hY2hpbmVzJywgdW5kZWZpbmVkLCBsb2NhdGlvbik7XG5cdFx0aWYgKHJlZnMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZS5yZXNvbHZlUmVzb3VyY2VDb250ZW50KCdtYWNoaW5lcycsIHJlZnNbMF0ucmVmLCB1bmRlZmluZWQsIGxvY2F0aW9uKTtcblx0XHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRcdGNvbnN0IG1hY2hpbmVzRGF0YTogSU1hY2hpbmVzRGF0YSA9IEpTT04ucGFyc2UoY29udGVudCk7XG5cdFx0XHRcdHJldHVybiBtYWNoaW5lc0RhdGEubWFjaGluZXMubWFwKG0gPT4gKHsgLi4ubSwgaXNDdXJyZW50OiBmYWxzZSB9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIGdldFJlbW90ZVN5bmNSZXNvdXJjZUhhbmRsZXMoc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UsIHByb2ZpbGU/OiBJU3luY1VzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8SVN5bmNSZXNvdXJjZUhhbmRsZVtdPiB7XG5cdFx0Y29uc3QgaGFuZGxlcyA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLmdldEFsbFJlc291cmNlUmVmcyhzeW5jUmVzb3VyY2UsIHByb2ZpbGU/LmNvbGxlY3Rpb24pO1xuXHRcdHJldHVybiBoYW5kbGVzLm1hcCgoeyBjcmVhdGVkLCByZWYgfSkgPT4gKHtcblx0XHRcdGNyZWF0ZWQsXG5cdFx0XHR1cmk6IHRoaXMudG9Vcmkoe1xuXHRcdFx0XHRyZW1vdGU6IHRydWUsXG5cdFx0XHRcdHN5bmNSZXNvdXJjZSxcblx0XHRcdFx0cHJvZmlsZTogcHJvZmlsZT8uaWQgPz8gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5pZCxcblx0XHRcdFx0bG9jYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29sbGVjdGlvbjogcHJvZmlsZT8uY29sbGVjdGlvbixcblx0XHRcdFx0cmVmLFxuXHRcdFx0XHRub2RlOiB1bmRlZmluZWQsXG5cdFx0XHR9KVxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIGdldExvY2FsU3luY1Jlc291cmNlSGFuZGxlcyhzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZSwgcHJvZmlsZT86IElTeW5jVXNlckRhdGFQcm9maWxlLCBsb2NhdGlvbj86IFVSSSk6IFByb21pc2U8SVN5bmNSZXNvdXJjZUhhbmRsZVtdPiB7XG5cdFx0Y29uc3QgaGFuZGxlcyA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UuZ2V0QWxsUmVzb3VyY2VSZWZzKHN5bmNSZXNvdXJjZSwgcHJvZmlsZT8uY29sbGVjdGlvbiwgbG9jYXRpb24pO1xuXHRcdHJldHVybiBoYW5kbGVzLm1hcCgoeyBjcmVhdGVkLCByZWYgfSkgPT4gKHtcblx0XHRcdGNyZWF0ZWQsXG5cdFx0XHR1cmk6IHRoaXMudG9Vcmkoe1xuXHRcdFx0XHRyZW1vdGU6IGZhbHNlLFxuXHRcdFx0XHRzeW5jUmVzb3VyY2UsXG5cdFx0XHRcdHByb2ZpbGU6IHByb2ZpbGU/LmlkID8/IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuaWQsXG5cdFx0XHRcdGNvbGxlY3Rpb246IHByb2ZpbGU/LmNvbGxlY3Rpb24sXG5cdFx0XHRcdHJlZixcblx0XHRcdFx0bm9kZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRsb2NhdGlvbixcblx0XHRcdH0pXG5cdFx0fSkpO1xuXHR9XG5cblx0cmVzb2x2ZVVzZXJEYXRhU3luY1Jlc291cmNlKHsgdXJpIH06IElTeW5jUmVzb3VyY2VIYW5kbGUpOiBJVXNlckRhdGFTeW5jUmVzb3VyY2UgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlVXJpKHVyaSk7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IHJlc29sdmVkID8gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5maW5kKHAgPT4gcC5pZCA9PT0gcmVzb2x2ZWQucHJvZmlsZSkgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHJlc29sdmVkICYmIHByb2ZpbGUgPyB7IHByb2ZpbGUsIHN5bmNSZXNvdXJjZTogcmVzb2x2ZWQ/LnN5bmNSZXNvdXJjZSB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0QXNzb2NpYXRlZFJlc291cmNlcyh7IHVyaSB9OiBJU3luY1Jlc291cmNlSGFuZGxlKTogUHJvbWlzZTx7IHJlc291cmNlOiBVUkk7IGNvbXBhcmFibGVSZXNvdXJjZTogVVJJIH1bXT4ge1xuXHRcdGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlVXJpKHVyaSk7XG5cdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2ZpbGUgPSB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLmZpbmQocCA9PiBwLmlkID09PSByZXNvbHZlZC5wcm9maWxlKTtcblx0XHRzd2l0Y2ggKHJlc29sdmVkLnN5bmNSZXNvdXJjZSkge1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuU2V0dGluZ3M6IHJldHVybiB0aGlzLmdldFNldHRpbmdzQXNzb2NpYXRlZFJlc291cmNlcyh1cmksIHByb2ZpbGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3M6IHJldHVybiB0aGlzLmdldEtleWJpbmRpbmdzQXNzb2NpYXRlZFJlc291cmNlcyh1cmksIHByb2ZpbGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuVGFza3M6IHJldHVybiB0aGlzLmdldFRhc2tzQXNzb2NpYXRlZFJlc291cmNlcyh1cmksIHByb2ZpbGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuTWNwOiByZXR1cm4gdGhpcy5nZXRNY3BBc3NvY2lhdGVkUmVzb3VyY2VzKHVyaSwgcHJvZmlsZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5TbmlwcGV0czogcmV0dXJuIHRoaXMuZ2V0U25pcHBldHNBc3NvY2lhdGVkUmVzb3VyY2VzKHVyaSwgcHJvZmlsZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5Qcm9tcHRzOiByZXR1cm4gdGhpcy5nZXRQcm9tcHRzQXNzb2NpYXRlZFJlc291cmNlcyh1cmksIHByb2ZpbGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuR2xvYmFsU3RhdGU6IHJldHVybiB0aGlzLmdldEdsb2JhbFN0YXRlQXNzb2NpYXRlZFJlc291cmNlcyh1cmksIHByb2ZpbGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuRXh0ZW5zaW9uczogcmV0dXJuIHRoaXMuZ2V0RXh0ZW5zaW9uc0Fzc29jaWF0ZWRSZXNvdXJjZXModXJpLCBwcm9maWxlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlByb2ZpbGVzOiByZXR1cm4gdGhpcy5nZXRQcm9maWxlc0Fzc29jaWF0ZWRSZXNvdXJjZXModXJpLCBwcm9maWxlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLldvcmtzcGFjZVN0YXRlOiByZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0TWFjaGluZUlkKHsgdXJpIH06IElTeW5jUmVzb3VyY2VIYW5kbGUpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlVXJpKHVyaSk7XG5cdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHJlc29sdmVkLnJlbW90ZSkge1xuXHRcdFx0aWYgKHJlc29sdmVkLnJlZikge1xuXHRcdFx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRoaXMuZ2V0VXNlckRhdGEocmVzb2x2ZWQuc3luY1Jlc291cmNlLCByZXNvbHZlZC5yZWYsIHJlc29sdmVkLmNvbGxlY3Rpb24pO1xuXHRcdFx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0XHRcdGNvbnN0IHN5bmNEYXRhID0gdGhpcy5wYXJzZVN5bmNEYXRhKGNvbnRlbnQsIHJlc29sdmVkLnN5bmNSZXNvdXJjZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHN5bmNEYXRhPy5tYWNoaW5lSWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc29sdmVkLmxvY2F0aW9uKSB7XG5cdFx0XHRpZiAocmVzb2x2ZWQucmVmKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLnJlc29sdmVSZXNvdXJjZUNvbnRlbnQocmVzb2x2ZWQuc3luY1Jlc291cmNlLCByZXNvbHZlZC5yZWYsIHJlc29sdmVkLmNvbGxlY3Rpb24sIHJlc29sdmVkLmxvY2F0aW9uKTtcblx0XHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0XHRjb25zdCBzeW5jRGF0YSA9IHRoaXMucGFyc2VTeW5jRGF0YShjb250ZW50LCByZXNvbHZlZC5zeW5jUmVzb3VyY2UpO1xuXHRcdFx0XHRcdHJldHVybiBzeW5jRGF0YT8ubWFjaGluZUlkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBnZXRTZXJ2aWNlTWFjaGluZUlkKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVDb250ZW50KHVyaTogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVVcmkodXJpKTtcblx0XHRpZiAoIXJlc29sdmVkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAocmVzb2x2ZWQubm9kZSA9PT0gVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuTk9UX0VYSVNUSU5HX1JFU09VUkNFKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAocmVzb2x2ZWQucmVmKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5nZXRDb250ZW50RnJvbVN0b3JlKHJlc29sdmVkLnJlbW90ZSwgcmVzb2x2ZWQuc3luY1Jlc291cmNlLCByZXNvbHZlZC5jb2xsZWN0aW9uLCByZXNvbHZlZC5yZWYsIHJlc29sdmVkLmxvY2F0aW9uKTtcblx0XHRcdGlmIChyZXNvbHZlZC5ub2RlICYmIGNvbnRlbnQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVzb2x2ZU5vZGVDb250ZW50KHJlc29sdmVkLnN5bmNSZXNvdXJjZSwgY29udGVudCwgcmVzb2x2ZWQubm9kZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY29udGVudDtcblx0XHR9XG5cblx0XHRpZiAoIXJlc29sdmVkLnJlbW90ZSAmJiAhcmVzb2x2ZWQubm9kZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVzb2x2ZUxhdGVzdENvbnRlbnQocmVzb2x2ZWQuc3luY1Jlc291cmNlLCByZXNvbHZlZC5wcm9maWxlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0Q29udGVudEZyb21TdG9yZShyZW1vdGU6IGJvb2xlYW4sIHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLCBjb2xsZWN0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlZjogc3RyaW5nLCBsb2NhdGlvbj86IFVSSSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRcdGlmIChyZW1vdGUpIHtcblx0XHRcdGNvbnN0IHsgY29udGVudCB9ID0gYXdhaXQgdGhpcy5nZXRVc2VyRGF0YShzeW5jUmVzb3VyY2UsIHJlZiwgY29sbGVjdGlvbik7XG5cdFx0XHRyZXR1cm4gY29udGVudDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UucmVzb2x2ZVJlc291cmNlQ29udGVudChzeW5jUmVzb3VyY2UsIHJlZiwgY29sbGVjdGlvbiwgbG9jYXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlTm9kZUNvbnRlbnQoc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UsIGNvbnRlbnQ6IHN0cmluZywgbm9kZTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0Y29uc3Qgc3luY0RhdGEgPSB0aGlzLnBhcnNlU3luY0RhdGEoY29udGVudCwgc3luY1Jlc291cmNlKTtcblx0XHRzd2l0Y2ggKHN5bmNSZXNvdXJjZSkge1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuU2V0dGluZ3M6IHJldHVybiB0aGlzLnJlc29sdmVTZXR0aW5nc05vZGVDb250ZW50KHN5bmNEYXRhLCBub2RlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLktleWJpbmRpbmdzOiByZXR1cm4gdGhpcy5yZXNvbHZlS2V5YmluZGluZ3NOb2RlQ29udGVudChzeW5jRGF0YSwgbm9kZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5UYXNrczogcmV0dXJuIHRoaXMucmVzb2x2ZVRhc2tzTm9kZUNvbnRlbnQoc3luY0RhdGEsIG5vZGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuTWNwOiByZXR1cm4gdGhpcy5yZXNvbHZlTWNwTm9kZUNvbnRlbnQoc3luY0RhdGEsIG5vZGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuU25pcHBldHM6IHJldHVybiB0aGlzLnJlc29sdmVTbmlwcGV0c05vZGVDb250ZW50KHN5bmNEYXRhLCBub2RlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlByb21wdHM6IHJldHVybiB0aGlzLnJlc29sdmVQcm9tcHRzTm9kZUNvbnRlbnQoc3luY0RhdGEsIG5vZGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuR2xvYmFsU3RhdGU6IHJldHVybiB0aGlzLnJlc29sdmVHbG9iYWxTdGF0ZU5vZGVDb250ZW50KHN5bmNEYXRhLCBub2RlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLkV4dGVuc2lvbnM6IHJldHVybiB0aGlzLnJlc29sdmVFeHRlbnNpb25zTm9kZUNvbnRlbnQoc3luY0RhdGEsIG5vZGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuUHJvZmlsZXM6IHJldHVybiB0aGlzLnJlc29sdmVQcm9maWxlTm9kZUNvbnRlbnQoc3luY0RhdGEsIG5vZGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuV29ya3NwYWNlU3RhdGU6IHJldHVybiBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUxhdGVzdENvbnRlbnQoc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UsIHByb2ZpbGVJZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmluZChwID0+IHAuaWQgPT09IHByb2ZpbGVJZCk7XG5cdFx0aWYgKCFwcm9maWxlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0c3dpdGNoIChzeW5jUmVzb3VyY2UpIHtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlOiByZXR1cm4gdGhpcy5yZXNvbHZlTGF0ZXN0R2xvYmFsU3RhdGVDb250ZW50KHByb2ZpbGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuRXh0ZW5zaW9uczogcmV0dXJuIHRoaXMucmVzb2x2ZUxhdGVzdEV4dGVuc2lvbnNDb250ZW50KHByb2ZpbGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuUHJvZmlsZXM6IHJldHVybiB0aGlzLnJlc29sdmVMYXRlc3RQcm9maWxlc0NvbnRlbnQocHJvZmlsZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5TZXR0aW5nczogcmV0dXJuIG51bGw7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5LZXliaW5kaW5nczogcmV0dXJuIG51bGw7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5UYXNrczogcmV0dXJuIG51bGw7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5NY3A6IHJldHVybiBudWxsO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuU25pcHBldHM6IHJldHVybiBudWxsO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuUHJvbXB0czogcmV0dXJuIG51bGw7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5Xb3Jrc3BhY2VTdGF0ZTogcmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXR0aW5nc0Fzc29jaWF0ZWRSZXNvdXJjZXModXJpOiBVUkksIHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQpOiB7IHJlc291cmNlOiBVUkk7IGNvbXBhcmFibGVSZXNvdXJjZTogVVJJIH1bXSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLmV4dFVyaS5qb2luUGF0aCh1cmksICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0Y29uc3QgY29tcGFyYWJsZVJlc291cmNlID0gcHJvZmlsZSA/IHByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSA6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHVyaSwgVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuTk9UX0VYSVNUSU5HX1JFU09VUkNFKTtcblx0XHRyZXR1cm4gW3sgcmVzb3VyY2UsIGNvbXBhcmFibGVSZXNvdXJjZSB9XTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZVNldHRpbmdzTm9kZUNvbnRlbnQoc3luY0RhdGE6IElTeW5jRGF0YSwgbm9kZTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0c3dpdGNoIChub2RlKSB7XG5cdFx0XHRjYXNlICdzZXR0aW5ncy5qc29uJzpcblx0XHRcdFx0cmV0dXJuIHBhcnNlU2V0dGluZ3NTeW5jQ29udGVudChzeW5jRGF0YS5jb250ZW50KS5zZXR0aW5ncztcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGdldEtleWJpbmRpbmdzQXNzb2NpYXRlZFJlc291cmNlcyh1cmk6IFVSSSwgcHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCk6IHsgcmVzb3VyY2U6IFVSSTsgY29tcGFyYWJsZVJlc291cmNlOiBVUkkgfVtdIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHVyaSwgJ2tleWJpbmRpbmdzLmpzb24nKTtcblx0XHRjb25zdCBjb21wYXJhYmxlUmVzb3VyY2UgPSBwcm9maWxlID8gcHJvZmlsZS5rZXliaW5kaW5nc1Jlc291cmNlIDogdGhpcy5leHRVcmkuam9pblBhdGgodXJpLCBVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5OT1RfRVhJU1RJTkdfUkVTT1VSQ0UpO1xuXHRcdHJldHVybiBbeyByZXNvdXJjZSwgY29tcGFyYWJsZVJlc291cmNlIH1dO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlS2V5YmluZGluZ3NOb2RlQ29udGVudChzeW5jRGF0YTogSVN5bmNEYXRhLCBub2RlOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRzd2l0Y2ggKG5vZGUpIHtcblx0XHRcdGNhc2UgJ2tleWJpbmRpbmdzLmpzb24nOlxuXHRcdFx0XHRyZXR1cm4gZ2V0S2V5YmluZGluZ3NDb250ZW50RnJvbVN5bmNDb250ZW50KHN5bmNEYXRhLmNvbnRlbnQsICEhdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShDT05GSUdfU1lOQ19LRVlCSU5ESU5HU19QRVJfUExBVEZPUk0pLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VGFza3NBc3NvY2lhdGVkUmVzb3VyY2VzKHVyaTogVVJJLCBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkKTogeyByZXNvdXJjZTogVVJJOyBjb21wYXJhYmxlUmVzb3VyY2U6IFVSSSB9W10ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5leHRVcmkuam9pblBhdGgodXJpLCAndGFza3MuanNvbicpO1xuXHRcdGNvbnN0IGNvbXBhcmFibGVSZXNvdXJjZSA9IHByb2ZpbGUgPyBwcm9maWxlLnRhc2tzUmVzb3VyY2UgOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh1cmksIFVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLk5PVF9FWElTVElOR19SRVNPVVJDRSk7XG5cdFx0cmV0dXJuIFt7IHJlc291cmNlLCBjb21wYXJhYmxlUmVzb3VyY2UgfV07XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVUYXNrc05vZGVDb250ZW50KHN5bmNEYXRhOiBJU3luY0RhdGEsIG5vZGU6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuXHRcdHN3aXRjaCAobm9kZSkge1xuXHRcdFx0Y2FzZSAndGFza3MuanNvbic6XG5cdFx0XHRcdHJldHVybiBnZXRUYXNrc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQoc3luY0RhdGEuY29udGVudCwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFNuaXBwZXRzQXNzb2NpYXRlZFJlc291cmNlcyh1cmk6IFVSSSwgcHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8eyByZXNvdXJjZTogVVJJOyBjb21wYXJhYmxlUmVzb3VyY2U6IFVSSSB9W10+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5yZXNvbHZlQ29udGVudCh1cmkpO1xuXHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRjb25zdCBzeW5jRGF0YSA9IHRoaXMucGFyc2VTeW5jRGF0YShjb250ZW50LCBTeW5jUmVzb3VyY2UuU25pcHBldHMpO1xuXHRcdFx0aWYgKHN5bmNEYXRhKSB7XG5cdFx0XHRcdGNvbnN0IHNuaXBwZXRzID0gcGFyc2VTbmlwcGV0cyhzeW5jRGF0YSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNuaXBwZXQgb2YgT2JqZWN0LmtleXMoc25pcHBldHMpKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLmV4dFVyaS5qb2luUGF0aCh1cmksIHNuaXBwZXQpO1xuXHRcdFx0XHRcdGNvbnN0IGNvbXBhcmFibGVSZXNvdXJjZSA9IHByb2ZpbGUgPyB0aGlzLmV4dFVyaS5qb2luUGF0aChwcm9maWxlLnNuaXBwZXRzSG9tZSwgc25pcHBldCkgOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh1cmksIFVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLk5PVF9FWElTVElOR19SRVNPVVJDRSk7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goeyByZXNvdXJjZSwgY29tcGFyYWJsZVJlc291cmNlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZVNuaXBwZXRzTm9kZUNvbnRlbnQoc3luY0RhdGE6IElTeW5jRGF0YSwgbm9kZTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHBhcnNlU25pcHBldHMoc3luY0RhdGEpW25vZGVdIHx8IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFByb21wdHNBc3NvY2lhdGVkUmVzb3VyY2VzKHVyaTogVVJJLCBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx7IHJlc291cmNlOiBVUkk7IGNvbXBhcmFibGVSZXNvdXJjZTogVVJJIH1bXT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnJlc29sdmVDb250ZW50KHVyaSk7XG5cdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdGNvbnN0IHN5bmNEYXRhID0gdGhpcy5wYXJzZVN5bmNEYXRhKGNvbnRlbnQsIFN5bmNSZXNvdXJjZS5Qcm9tcHRzKTtcblx0XHRcdGlmIChzeW5jRGF0YSkge1xuXHRcdFx0XHRjb25zdCBwcm9tcHRzID0gcGFyc2VQcm9tcHRzKHN5bmNEYXRhKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgcHJvbXB0IG9mIE9iamVjdC5rZXlzKHByb21wdHMpKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLmV4dFVyaS5qb2luUGF0aCh1cmksIHByb21wdCk7XG5cdFx0XHRcdFx0Y29uc3QgY29tcGFyYWJsZVJlc291cmNlID0gKHByb2ZpbGUpXG5cdFx0XHRcdFx0XHQ/IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHByb2ZpbGUucHJvbXB0c0hvbWUsIHByb21wdClcblx0XHRcdFx0XHRcdDogdGhpcy5leHRVcmkuam9pblBhdGgodXJpLCBVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5OT1RfRVhJU1RJTkdfUkVTT1VSQ0UpO1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHsgcmVzb3VyY2UsIGNvbXBhcmFibGVSZXNvdXJjZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVQcm9tcHRzTm9kZUNvbnRlbnQoc3luY0RhdGE6IElTeW5jRGF0YSwgbm9kZTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHBhcnNlUHJvbXB0cyhzeW5jRGF0YSlbbm9kZV0gfHwgbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RXh0ZW5zaW9uc0Fzc29jaWF0ZWRSZXNvdXJjZXModXJpOiBVUkksIHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQpOiB7IHJlc291cmNlOiBVUkk7IGNvbXBhcmFibGVSZXNvdXJjZTogVVJJIH1bXSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLmV4dFVyaS5qb2luUGF0aCh1cmksICdleHRlbnNpb25zLmpzb24nKTtcblx0XHRjb25zdCBjb21wYXJhYmxlUmVzb3VyY2UgPSBwcm9maWxlXG5cdFx0XHQ/IHRoaXMudG9Vcmkoe1xuXHRcdFx0XHRyZW1vdGU6IGZhbHNlLFxuXHRcdFx0XHRzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5FeHRlbnNpb25zLFxuXHRcdFx0XHRwcm9maWxlOiBwcm9maWxlLmlkLFxuXHRcdFx0XHRsb2NhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb2xsZWN0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlZjogdW5kZWZpbmVkLFxuXHRcdFx0XHRub2RlOiB1bmRlZmluZWQsXG5cdFx0XHR9KVxuXHRcdFx0OiB0aGlzLmV4dFVyaS5qb2luUGF0aCh1cmksIFVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLk5PVF9FWElTVElOR19SRVNPVVJDRSk7XG5cdFx0cmV0dXJuIFt7IHJlc291cmNlLCBjb21wYXJhYmxlUmVzb3VyY2UgfV07XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVFeHRlbnNpb25zTm9kZUNvbnRlbnQoc3luY0RhdGE6IElTeW5jRGF0YSwgbm9kZTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0c3dpdGNoIChub2RlKSB7XG5cdFx0XHRjYXNlICdleHRlbnNpb25zLmpzb24nOlxuXHRcdFx0XHRyZXR1cm4gc3RyaW5naWZ5RXh0ZW5zaW9ucyhwYXJzZUV4dGVuc2lvbnMoc3luY0RhdGEpLCB0cnVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVMYXRlc3RFeHRlbnNpb25zQ29udGVudChwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0Y29uc3QgeyBsb2NhbEV4dGVuc2lvbnMgfSA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxFeHRlbnNpb25zUHJvdmlkZXIpLmdldExvY2FsRXh0ZW5zaW9ucyhwcm9maWxlKTtcblx0XHRyZXR1cm4gc3RyaW5naWZ5RXh0ZW5zaW9ucyhsb2NhbEV4dGVuc2lvbnMsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRHbG9iYWxTdGF0ZUFzc29jaWF0ZWRSZXNvdXJjZXModXJpOiBVUkksIHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQpOiB7IHJlc291cmNlOiBVUkk7IGNvbXBhcmFibGVSZXNvdXJjZTogVVJJIH1bXSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLmV4dFVyaS5qb2luUGF0aCh1cmksICdnbG9iYWxTdGF0ZS5qc29uJyk7XG5cdFx0Y29uc3QgY29tcGFyYWJsZVJlc291cmNlID0gcHJvZmlsZVxuXHRcdFx0PyB0aGlzLnRvVXJpKHtcblx0XHRcdFx0cmVtb3RlOiBmYWxzZSxcblx0XHRcdFx0c3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuR2xvYmFsU3RhdGUsXG5cdFx0XHRcdHByb2ZpbGU6IHByb2ZpbGUuaWQsXG5cdFx0XHRcdGxvY2F0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbGxlY3Rpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVmOiB1bmRlZmluZWQsXG5cdFx0XHRcdG5vZGU6IHVuZGVmaW5lZCxcblx0XHRcdH0pXG5cdFx0XHQ6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHVyaSwgVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuTk9UX0VYSVNUSU5HX1JFU09VUkNFKTtcblx0XHRyZXR1cm4gW3sgcmVzb3VyY2UsIGNvbXBhcmFibGVSZXNvdXJjZSB9XTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZUdsb2JhbFN0YXRlTm9kZUNvbnRlbnQoc3luY0RhdGE6IElTeW5jRGF0YSwgbm9kZTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0c3dpdGNoIChub2RlKSB7XG5cdFx0XHRjYXNlICdnbG9iYWxTdGF0ZS5qc29uJzpcblx0XHRcdFx0cmV0dXJuIHN0cmluZ2lmeUdsb2JhbFN0YXRlKEpTT04ucGFyc2Uoc3luY0RhdGEuY29udGVudCksIHRydWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUxhdGVzdEdsb2JhbFN0YXRlQ29udGVudChwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0Y29uc3QgbG9jYWxHbG9iYWxTdGF0ZSA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxHbG9iYWxTdGF0ZVByb3ZpZGVyKS5nZXRMb2NhbEdsb2JhbFN0YXRlKHByb2ZpbGUpO1xuXHRcdHJldHVybiBzdHJpbmdpZnlHbG9iYWxTdGF0ZShsb2NhbEdsb2JhbFN0YXRlLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHJvZmlsZXNBc3NvY2lhdGVkUmVzb3VyY2VzKHVyaTogVVJJLCBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkKTogeyByZXNvdXJjZTogVVJJOyBjb21wYXJhYmxlUmVzb3VyY2U6IFVSSSB9W10ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5leHRVcmkuam9pblBhdGgodXJpLCAncHJvZmlsZXMuanNvbicpO1xuXHRcdGNvbnN0IGNvbXBhcmFibGVSZXNvdXJjZSA9IHRoaXMudG9Vcmkoe1xuXHRcdFx0cmVtb3RlOiBmYWxzZSxcblx0XHRcdHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLlByb2ZpbGVzLFxuXHRcdFx0cHJvZmlsZTogdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5pZCxcblx0XHRcdGxvY2F0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRjb2xsZWN0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRyZWY6IHVuZGVmaW5lZCxcblx0XHRcdG5vZGU6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRyZXR1cm4gW3sgcmVzb3VyY2UsIGNvbXBhcmFibGVSZXNvdXJjZSB9XTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZVByb2ZpbGVOb2RlQ29udGVudChzeW5jRGF0YTogSVN5bmNEYXRhLCBub2RlOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRzd2l0Y2ggKG5vZGUpIHtcblx0XHRcdGNhc2UgJ3Byb2ZpbGVzLmpzb24nOlxuXHRcdFx0XHRyZXR1cm4gdG9Gb3JtYXR0ZWRTdHJpbmcoSlNPTi5wYXJzZShzeW5jRGF0YS5jb250ZW50KSwge30pO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUxhdGVzdFByb2ZpbGVzQ29udGVudChwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0cmV0dXJuIHN0cmluZ2lmeUxvY2FsUHJvZmlsZXModGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5maWx0ZXIocCA9PiAhcC5pc0RlZmF1bHQgJiYgIXAuaXNUcmFuc2llbnQpLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgdG9Vcmkoc3luY1Jlc291cmNlVXJpSW5mbzogSVN5bmNSZXNvdXJjZVVyaUluZm8pOiBVUkkge1xuXHRcdGNvbnN0IGF1dGhvcml0eSA9IHN5bmNSZXNvdXJjZVVyaUluZm8ucmVtb3RlID8gVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuUkVNT1RFX0JBQ0tVUF9BVVRIT1JJVFkgOiBVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5MT0NBTF9CQUNLVVBfQVVUSE9SSVRZO1xuXHRcdGNvbnN0IHBhdGhzID0gW107XG5cdFx0aWYgKHN5bmNSZXNvdXJjZVVyaUluZm8ubG9jYXRpb24pIHtcblx0XHRcdHBhdGhzLnB1c2goYHNjaGVtZToke3N5bmNSZXNvdXJjZVVyaUluZm8ubG9jYXRpb24uc2NoZW1lfWApO1xuXHRcdFx0cGF0aHMucHVzaChgYXV0aG9yaXR5OiR7c3luY1Jlc291cmNlVXJpSW5mby5sb2NhdGlvbi5hdXRob3JpdHl9YCk7XG5cdFx0XHRwYXRocy5wdXNoKHRyaW0oc3luY1Jlc291cmNlVXJpSW5mby5sb2NhdGlvbi5wYXRoLCAnLycpKTtcblx0XHR9XG5cdFx0cGF0aHMucHVzaChgc3luY1Jlc291cmNlOiR7c3luY1Jlc291cmNlVXJpSW5mby5zeW5jUmVzb3VyY2V9YCk7XG5cdFx0cGF0aHMucHVzaChgcHJvZmlsZToke3N5bmNSZXNvdXJjZVVyaUluZm8ucHJvZmlsZX1gKTtcblx0XHRpZiAoc3luY1Jlc291cmNlVXJpSW5mby5jb2xsZWN0aW9uKSB7XG5cdFx0XHRwYXRocy5wdXNoKGBjb2xsZWN0aW9uOiR7c3luY1Jlc291cmNlVXJpSW5mby5jb2xsZWN0aW9ufWApO1xuXHRcdH1cblx0XHRpZiAoc3luY1Jlc291cmNlVXJpSW5mby5yZWYpIHtcblx0XHRcdHBhdGhzLnB1c2goYHJlZjoke3N5bmNSZXNvdXJjZVVyaUluZm8ucmVmfWApO1xuXHRcdH1cblx0XHRpZiAoc3luY1Jlc291cmNlVXJpSW5mby5ub2RlKSB7XG5cdFx0XHRwYXRocy5wdXNoKHN5bmNSZXNvdXJjZVVyaUluZm8ubm9kZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmV4dFVyaS5qb2luUGF0aChVUkkuZnJvbSh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHksIHBhdGg6IGAvYCwgcXVlcnk6IHN5bmNSZXNvdXJjZVVyaUluZm8ubG9jYXRpb24/LnF1ZXJ5LCBmcmFnbWVudDogc3luY1Jlc291cmNlVXJpSW5mby5sb2NhdGlvbj8uZnJhZ21lbnQgfSksIC4uLnBhdGhzKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZVVyaSh1cmk6IFVSSSk6IElTeW5jUmVzb3VyY2VVcmlJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodXJpLnNjaGVtZSAhPT0gVVNFUl9EQVRBX1NZTkNfU0NIRU1FKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwYXRoczogc3RyaW5nW10gPSBbXTtcblx0XHR3aGlsZSAodXJpLnBhdGggIT09ICcvJykge1xuXHRcdFx0cGF0aHMudW5zaGlmdCh0aGlzLmV4dFVyaS5iYXNlbmFtZSh1cmkpKTtcblx0XHRcdHVyaSA9IHRoaXMuZXh0VXJpLmRpcm5hbWUodXJpKTtcblx0XHR9XG5cdFx0aWYgKHBhdGhzLmxlbmd0aCA8IDIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlbW90ZSA9IHVyaS5hdXRob3JpdHkgPT09IFVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLlJFTU9URV9CQUNLVVBfQVVUSE9SSVRZO1xuXHRcdGxldCBzY2hlbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYXV0aG9yaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbG9jYXRpb25QYXRoczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHByb2ZpbGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY29sbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCByZWY6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbm9kZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHdoaWxlIChwYXRocy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHBhdGggPSBwYXRocy5zaGlmdCgpITtcblx0XHRcdGlmIChwYXRoLnN0YXJ0c1dpdGgoJ3NjaGVtZTonKSkge1xuXHRcdFx0XHRzY2hlbWUgPSBwYXRoLnN1YnN0cmluZygnc2NoZW1lOicubGVuZ3RoKTtcblx0XHRcdH0gZWxzZSBpZiAocGF0aC5zdGFydHNXaXRoKCdhdXRob3JpdHk6JykpIHtcblx0XHRcdFx0YXV0aG9yaXR5ID0gcGF0aC5zdWJzdHJpbmcoJ2F1dGhvcml0eTonLmxlbmd0aCk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhdGguc3RhcnRzV2l0aCgnc3luY1Jlc291cmNlOicpKSB7XG5cdFx0XHRcdHN5bmNSZXNvdXJjZSA9IHBhdGguc3Vic3RyaW5nKCdzeW5jUmVzb3VyY2U6Jy5sZW5ndGgpIGFzIFN5bmNSZXNvdXJjZTtcblx0XHRcdH0gZWxzZSBpZiAocGF0aC5zdGFydHNXaXRoKCdwcm9maWxlOicpKSB7XG5cdFx0XHRcdHByb2ZpbGUgPSBwYXRoLnN1YnN0cmluZygncHJvZmlsZTonLmxlbmd0aCk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhdGguc3RhcnRzV2l0aCgnY29sbGVjdGlvbjonKSkge1xuXHRcdFx0XHRjb2xsZWN0aW9uID0gcGF0aC5zdWJzdHJpbmcoJ2NvbGxlY3Rpb246Jy5sZW5ndGgpO1xuXHRcdFx0fSBlbHNlIGlmIChwYXRoLnN0YXJ0c1dpdGgoJ3JlZjonKSkge1xuXHRcdFx0XHRyZWYgPSBwYXRoLnN1YnN0cmluZygncmVmOicubGVuZ3RoKTtcblx0XHRcdH0gZWxzZSBpZiAoIXN5bmNSZXNvdXJjZSkge1xuXHRcdFx0XHRsb2NhdGlvblBhdGhzLnB1c2gocGF0aCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRub2RlID0gcGF0aDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlbW90ZSxcblx0XHRcdHN5bmNSZXNvdXJjZTogc3luY1Jlc291cmNlISxcblx0XHRcdHByb2ZpbGU6IHByb2ZpbGUhLFxuXHRcdFx0Y29sbGVjdGlvbixcblx0XHRcdHJlZixcblx0XHRcdG5vZGUsXG5cdFx0XHRsb2NhdGlvbjogc2NoZW1lICYmIGF1dGhvcml0eSAhPT0gdW5kZWZpbmVkID8gdGhpcy5leHRVcmkuam9pblBhdGgoVVJJLmZyb20oeyBzY2hlbWUsIGF1dGhvcml0eSwgcXVlcnk6IHVyaS5xdWVyeSwgZnJhZ21lbnQ6IHVyaS5mcmFnbWVudCwgcGF0aDogJy8nIH0pLCAuLi5sb2NhdGlvblBhdGhzKSA6IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlU3luY0RhdGEoY29udGVudDogc3RyaW5nLCBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZSk6IElTeW5jRGF0YSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN5bmNEYXRhOiBJU3luY0RhdGEgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdFx0aWYgKGlzU3luY0RhdGEoc3luY0RhdGEpKSB7XG5cdFx0XHRcdHJldHVybiBzeW5jRGF0YTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY0Vycm9yKGxvY2FsaXplKCdpbmNvbXBhdGlibGUgc3luYyBkYXRhJywgXCJDYW5ub3QgcGFyc2Ugc3luYyBkYXRhIGFzIGl0IGlzIG5vdCBjb21wYXRpYmxlIHdpdGggdGhlIGN1cnJlbnQgdmVyc2lvbi5cIiksIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5JbmNvbXBhdGlibGVSZW1vdGVDb250ZW50LCBzeW5jUmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRVc2VyRGF0YShzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZSwgcmVmOiBzdHJpbmcsIGNvbGxlY3Rpb24/OiBzdHJpbmcpOiBQcm9taXNlPElVc2VyRGF0YT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5yZXNvbHZlUmVzb3VyY2VDb250ZW50KHN5bmNSZXNvdXJjZSwgcmVmLCBjb2xsZWN0aW9uKTtcblx0XHRyZXR1cm4geyByZWYsIGNvbnRlbnQgfTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWNwQXNzb2NpYXRlZFJlc291cmNlcyh1cmk6IFVSSSwgcHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCk6IHsgcmVzb3VyY2U6IFVSSTsgY29tcGFyYWJsZVJlc291cmNlOiBVUkkgfVtdIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHVyaSwgJ21jcC5qc29uJyk7XG5cdFx0Y29uc3QgY29tcGFyYWJsZVJlc291cmNlID0gcHJvZmlsZSA/IHByb2ZpbGUubWNwUmVzb3VyY2UgOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh1cmksIFVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLk5PVF9FWElTVElOR19SRVNPVVJDRSk7XG5cdFx0cmV0dXJuIFt7IHJlc291cmNlLCBjb21wYXJhYmxlUmVzb3VyY2UgfV07XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVNY3BOb2RlQ29udGVudChzeW5jRGF0YTogSVN5bmNEYXRhLCBub2RlOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRzd2l0Y2ggKG5vZGUpIHtcblx0XHRcdGNhc2UgJ21jcC5qc29uJzpcblx0XHRcdFx0cmV0dXJuIGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQoc3luY0RhdGEuY29udGVudCwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBb0QsZ0NBQWdDLHlCQUF5QiwyQkFBMkIsY0FBYyxtQkFBbUIsdUJBQXVCLHVCQUFtRiw0Q0FBbUU7QUFDdFYsU0FB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
