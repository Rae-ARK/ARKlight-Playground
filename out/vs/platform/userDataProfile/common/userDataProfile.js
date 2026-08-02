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
import { hash } from "../../../base/common/hash.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { basename, joinPath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from "../../workspace/common/workspace.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { Promises } from "../../../base/common/async.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { escapeRegExpCharacters } from "../../../base/common/strings.js";
import { isString } from "../../../base/common/types.js";
const AGENTS_WINDOW_PROFILE_ID = "agents";
const AGENTS_WINDOW_PROFILE_FLAGS = {
  settings: true,
  keybindings: true,
  prompts: true,
  mcp: true,
  languageModels: true,
  snippets: true,
  tasks: true,
  extensions: true
};
var ProfileResourceType = /* @__PURE__ */ ((ProfileResourceType2) => {
  ProfileResourceType2["Settings"] = "settings";
  ProfileResourceType2["Keybindings"] = "keybindings";
  ProfileResourceType2["Snippets"] = "snippets";
  ProfileResourceType2["Prompts"] = "prompts";
  ProfileResourceType2["Tasks"] = "tasks";
  ProfileResourceType2["Extensions"] = "extensions";
  ProfileResourceType2["GlobalState"] = "globalState";
  ProfileResourceType2["Mcp"] = "mcp";
  ProfileResourceType2["LanguageModels"] = "languageModels";
  return ProfileResourceType2;
})(ProfileResourceType || {});
function isUserDataProfile(thing) {
  const candidate = thing;
  return !!(candidate && typeof candidate === "object" && typeof candidate.id === "string" && typeof candidate.isDefault === "boolean" && typeof candidate.name === "string" && URI.isUri(candidate.location) && URI.isUri(candidate.globalStorageHome) && URI.isUri(candidate.settingsResource) && URI.isUri(candidate.keybindingsResource) && URI.isUri(candidate.tasksResource) && URI.isUri(candidate.snippetsHome) && URI.isUri(candidate.promptsHome) && URI.isUri(candidate.extensionsResource) && URI.isUri(candidate.mcpResource) && URI.isUri(candidate.languageModelsResource) && URI.isUri(candidate.agentPluginsHome));
}
const IUserDataProfilesService = createDecorator("IUserDataProfilesService");
function reviveProfile(profile, scheme) {
  return {
    id: profile.id,
    isDefault: profile.isDefault,
    name: profile.name,
    icon: profile.icon,
    location: URI.revive(profile.location).with({ scheme }),
    globalStorageHome: URI.revive(profile.globalStorageHome).with({ scheme }),
    settingsResource: URI.revive(profile.settingsResource).with({ scheme }),
    keybindingsResource: URI.revive(profile.keybindingsResource).with({ scheme }),
    tasksResource: URI.revive(profile.tasksResource).with({ scheme }),
    snippetsHome: URI.revive(profile.snippetsHome).with({ scheme }),
    promptsHome: URI.revive(profile.promptsHome).with({ scheme }),
    extensionsResource: URI.revive(profile.extensionsResource).with({ scheme }),
    mcpResource: URI.revive(profile.mcpResource).with({ scheme }),
    languageModelsResource: URI.revive(profile.languageModelsResource).with({ scheme }),
    agentPluginsHome: URI.revive(profile.agentPluginsHome),
    cacheHome: URI.revive(profile.cacheHome).with({ scheme }),
    useDefaultFlags: profile.useDefaultFlags,
    isTransient: profile.isTransient,
    isInternal: profile.isInternal,
    isAgentsWindowProfile: profile.isAgentsWindowProfile,
    workspaces: profile.workspaces?.map((w) => URI.revive(w))
  };
}
function toUserDataProfile(id, name, location, profilesCacheHome, options, defaultProfile) {
  const isAgentsWindowProfile = id === AGENTS_WINDOW_PROFILE_ID;
  return {
    id,
    name,
    location,
    isDefault: false,
    icon: options?.icon,
    globalStorageHome: defaultProfile && options?.useDefaultFlags?.globalState ? defaultProfile.globalStorageHome : joinPath(location, "globalStorage"),
    settingsResource: defaultProfile && options?.useDefaultFlags?.settings ? defaultProfile.settingsResource : joinPath(location, "settings.json"),
    keybindingsResource: defaultProfile && options?.useDefaultFlags?.keybindings ? defaultProfile.keybindingsResource : joinPath(location, "keybindings.json"),
    tasksResource: defaultProfile && options?.useDefaultFlags?.tasks ? defaultProfile.tasksResource : joinPath(location, "tasks.json"),
    snippetsHome: defaultProfile && options?.useDefaultFlags?.snippets ? defaultProfile.snippetsHome : joinPath(location, "snippets"),
    promptsHome: defaultProfile && options?.useDefaultFlags?.prompts ? defaultProfile.promptsHome : joinPath(location, "prompts"),
    extensionsResource: defaultProfile && options?.useDefaultFlags?.extensions ? defaultProfile.extensionsResource : joinPath(location, "extensions.json"),
    mcpResource: defaultProfile && options?.useDefaultFlags?.mcp ? defaultProfile.mcpResource : joinPath(location, "mcp.json"),
    languageModelsResource: defaultProfile && options?.useDefaultFlags?.languageModels ? defaultProfile.languageModelsResource : joinPath(location, "chatLanguageModels.json"),
    agentPluginsHome: defaultProfile ? defaultProfile.agentPluginsHome : joinPath(location, "agent-plugins"),
    cacheHome: joinPath(profilesCacheHome, id),
    useDefaultFlags: options?.useDefaultFlags,
    isTransient: options?.transient,
    isInternal: isAgentsWindowProfile || options?.transient,
    isAgentsWindowProfile,
    workspaces: options?.workspaces
  };
}
const SYSTEM_PROFILES_HOME = "builtin";
let UserDataProfilesService = class extends Disposable {
  constructor(environmentService, fileService, uriIdentityService, logService) {
    super();
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this._onDidChangeProfiles = this._register(new Emitter());
    this.onDidChangeProfiles = this._onDidChangeProfiles.event;
    this._onWillCreateProfile = this._register(new Emitter());
    this.onWillCreateProfile = this._onWillCreateProfile.event;
    this._onWillRemoveProfile = this._register(new Emitter());
    this.onWillRemoveProfile = this._onWillRemoveProfile.event;
    this._onDidResetWorkspaces = this._register(new Emitter());
    this.onDidResetWorkspaces = this._onDidResetWorkspaces.event;
    this.profileCreationPromises = /* @__PURE__ */ new Map();
    this.transientProfilesObject = {
      profiles: [],
      emptyWindows: /* @__PURE__ */ new Map()
    };
    this.profilesHome = joinPath(this.environmentService.userRoamingDataHome, "profiles");
    this.profilesCacheHome = joinPath(this.environmentService.cacheHome, "CachedProfilesData");
  }
  get defaultProfile() {
    return this.profiles[0];
  }
  get profiles() {
    return [...this.profilesObject.profiles, ...this.transientProfilesObject.profiles];
  }
  init() {
    this._profilesObject = void 0;
  }
  get profilesObject() {
    if (!this._profilesObject) {
      const defaultProfile = this.createDefaultProfile();
      const profiles = [defaultProfile];
      try {
        for (const storedProfile of this.getStoredProfiles()) {
          if (this.isInvalidProfile(storedProfile)) {
            this.logService.warn("Skipping the invalid stored profile", storedProfile.location || storedProfile.name);
            continue;
          }
          const id = basename(storedProfile.location);
          profiles.push(toUserDataProfile(
            id,
            storedProfile.name,
            storedProfile.location,
            this.profilesCacheHome,
            {
              icon: storedProfile.icon,
              useDefaultFlags: id === AGENTS_WINDOW_PROFILE_ID ? AGENTS_WINDOW_PROFILE_FLAGS : storedProfile.useDefaultFlags
            },
            defaultProfile
          ));
        }
      } catch (error) {
        this.logService.error(error);
      }
      const emptyWindows = /* @__PURE__ */ new Map();
      if (profiles.length) {
        try {
          const profileAssociaitions = this.getStoredProfileAssociations();
          if (profileAssociaitions.workspaces) {
            for (const [workspacePath, profileId] of Object.entries(profileAssociaitions.workspaces)) {
              const workspace = URI.parse(workspacePath);
              const profile = profiles.find((p) => p.id === profileId);
              if (profile) {
                const workspaces = profile.workspaces ? profile.workspaces.slice(0) : [];
                workspaces.push(workspace);
                profile.workspaces = workspaces;
              }
            }
          }
          if (profileAssociaitions.emptyWindows) {
            for (const [windowId, profileId] of Object.entries(profileAssociaitions.emptyWindows)) {
              const profile = profiles.find((p) => p.id === profileId);
              if (profile) {
                emptyWindows.set(windowId, profile);
              }
            }
          }
        } catch (error) {
          this.logService.error(error);
        }
      }
      this._profilesObject = { profiles, emptyWindows };
    }
    return this._profilesObject;
  }
  isInvalidProfile(storedProfile) {
    if (!storedProfile.name) {
      return true;
    }
    if (!isString(storedProfile.name)) {
      return true;
    }
    if (!storedProfile.location) {
      return true;
    }
    return false;
  }
  createDefaultProfile() {
    const defaultProfile = toUserDataProfile("__default__profile__", localize("defaultProfile", "Default"), this.environmentService.userRoamingDataHome, this.profilesCacheHome);
    return { ...defaultProfile, extensionsResource: this.getDefaultProfileExtensionsLocation() ?? defaultProfile.extensionsResource, isDefault: true };
  }
  async createTransientProfile(workspaceIdentifier) {
    const namePrefix = `Temp`;
    const nameRegEx = new RegExp(`${escapeRegExpCharacters(namePrefix)}\\s(\\d+)`);
    let nameIndex = 0;
    for (const profile of this.profiles) {
      const matches = nameRegEx.exec(profile.name);
      const index = matches ? parseInt(matches[1]) : 0;
      nameIndex = index > nameIndex ? index : nameIndex;
    }
    const name = `${namePrefix} ${nameIndex + 1}`;
    return this.createProfile(hash(generateUuid()).toString(16), name, { transient: true }, workspaceIdentifier);
  }
  async createNamedProfile(name, options, workspaceIdentifier) {
    return this.createProfile(hash(generateUuid()).toString(16), name, options, workspaceIdentifier);
  }
  async createProfile(id, name, options, workspaceIdentifier) {
    const profile = await this.doCreateProfile(id, name, options, workspaceIdentifier);
    return profile;
  }
  async doCreateProfile(id, name, options, workspaceIdentifier) {
    if (!isString(name) || !name) {
      throw new Error("Name of the profile is mandatory and must be of type `string`");
    }
    let profileCreationPromise = this.profileCreationPromises.get(name);
    if (!profileCreationPromise) {
      profileCreationPromise = (async () => {
        try {
          const existing = this.profiles.find((p) => p.id === id || id !== AGENTS_WINDOW_PROFILE_ID && !p.isTransient && !options?.transient && p.name === name);
          if (existing) {
            throw new Error(`Profile with ${name} name already exists`);
          }
          const workspace = workspaceIdentifier ? this.getWorkspace(workspaceIdentifier) : void 0;
          if (URI.isUri(workspace)) {
            options = { ...options, workspaces: [workspace] };
          }
          const profile = toUserDataProfile(
            id,
            name,
            this.uriIdentityService.extUri.joinPath(this.profilesHome, ...id === AGENTS_WINDOW_PROFILE_ID ? [SYSTEM_PROFILES_HOME, id] : [id]),
            this.profilesCacheHome,
            id === AGENTS_WINDOW_PROFILE_ID ? {} : options,
            this.defaultProfile
          );
          await this.fileService.createFolder(profile.location);
          const joiners = [];
          this._onWillCreateProfile.fire({
            profile,
            join(promise) {
              joiners.push(promise);
            }
          });
          await Promises.settled(joiners);
          if (workspace && !URI.isUri(workspace)) {
            this.updateEmptyWindowAssociation(workspace, profile, !!profile.isTransient);
          }
          this.updateProfiles([profile], [], []);
          return this.profiles.find((p) => p.id === profile.id) ?? profile;
        } finally {
          this.profileCreationPromises.delete(name);
        }
      })();
      this.profileCreationPromises.set(name, profileCreationPromise);
    }
    return profileCreationPromise;
  }
  async updateProfile(profile, options) {
    if (profile.isAgentsWindowProfile) {
      throw new Error("Cannot update agents window profile");
    }
    const profilesToUpdate = [];
    for (const existing of this.profiles) {
      let profileToUpdate;
      if (profile.id === existing.id) {
        if (!existing.isDefault) {
          profileToUpdate = toUserDataProfile(existing.id, options.name ?? existing.name, existing.location, this.profilesCacheHome, {
            icon: options.icon === null ? void 0 : options.icon ?? existing.icon,
            transient: options.transient ?? existing.isTransient,
            useDefaultFlags: options.useDefaultFlags ?? existing.useDefaultFlags,
            workspaces: options.workspaces ?? existing.workspaces
          }, this.defaultProfile);
        } else if (options.workspaces) {
          profileToUpdate = existing;
          profileToUpdate.workspaces = options.workspaces;
        }
      } else if (options.workspaces) {
        const workspaces = existing.workspaces?.filter((w1) => !options.workspaces?.some((w2) => this.uriIdentityService.extUri.isEqual(w1, w2)));
        if (existing.workspaces?.length !== workspaces?.length) {
          profileToUpdate = existing;
          profileToUpdate.workspaces = workspaces;
        }
      }
      if (profileToUpdate) {
        profilesToUpdate.push(profileToUpdate);
      }
    }
    if (!profilesToUpdate.length) {
      if (profile.isDefault) {
        throw new Error("Cannot update default profile");
      }
      throw new Error(`Profile '${profile.name}' does not exist`);
    }
    this.updateProfiles([], [], profilesToUpdate);
    const updatedProfile = this.profiles.find((p) => p.id === profile.id);
    if (!updatedProfile) {
      throw new Error(`Profile '${profile.name}' was not updated`);
    }
    return updatedProfile;
  }
  async removeProfile(profileToRemove) {
    if (profileToRemove.isDefault) {
      throw new Error("Cannot remove default profile");
    }
    const profile = this.profiles.find((p) => p.id === profileToRemove.id);
    if (!profile) {
      throw new Error(`Profile '${profileToRemove.name}' does not exist`);
    }
    const joiners = [];
    this._onWillRemoveProfile.fire({
      profile,
      join(promise) {
        joiners.push(promise);
      }
    });
    try {
      await Promise.allSettled(joiners);
    } catch (error) {
      this.logService.error(error);
    }
    this.updateProfiles([], [profile], []);
    try {
      await this.fileService.del(profile.cacheHome, { recursive: true });
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.error(error);
      }
    }
  }
  async setProfileForWorkspace(workspaceIdentifier, profileToSet) {
    const profile = this.profiles.find((p) => p.id === profileToSet.id);
    if (!profile) {
      throw new Error(`Profile '${profileToSet.name}' does not exist`);
    }
    const workspace = this.getWorkspace(workspaceIdentifier);
    if (URI.isUri(workspace)) {
      const workspaces = profile.workspaces ? [...profile.workspaces] : [];
      if (!workspaces.some((w) => this.uriIdentityService.extUri.isEqual(w, workspace))) {
        workspaces.push(workspace);
        await this.updateProfile(profile, { workspaces });
      }
    } else {
      this.updateEmptyWindowAssociation(workspace, profile, false);
      this.updateStoredProfiles(this.profiles);
    }
  }
  unsetWorkspace(workspaceIdentifier, transient = false) {
    const workspace = this.getWorkspace(workspaceIdentifier);
    if (URI.isUri(workspace)) {
      const currentlyAssociatedProfile = this.getProfileForWorkspace(workspaceIdentifier);
      if (currentlyAssociatedProfile) {
        this.updateProfile(currentlyAssociatedProfile, { workspaces: currentlyAssociatedProfile.workspaces?.filter((w) => !this.uriIdentityService.extUri.isEqual(w, workspace)) });
      }
    } else {
      this.updateEmptyWindowAssociation(workspace, void 0, transient);
      this.updateStoredProfiles(this.profiles);
    }
  }
  async resetWorkspaces() {
    this.transientProfilesObject.emptyWindows.clear();
    this.profilesObject.emptyWindows.clear();
    for (const profile of this.profiles) {
      profile.workspaces = void 0;
    }
    this.updateProfiles([], [], this.profiles);
    this._onDidResetWorkspaces.fire();
  }
  async cleanUp() {
    try {
      if (await this.fileService.exists(this.profilesHome)) {
        const stat = await this.fileService.resolve(this.profilesHome);
        await Promise.all((stat.children || []).filter((child) => child.isDirectory && child.name !== SYSTEM_PROFILES_HOME && this.profiles.every((p) => !this.uriIdentityService.extUri.isEqual(p.location, child.resource))).map((child) => this.fileService.del(child.resource, { recursive: true })));
      }
    } catch (error) {
      this.logService.error("Error deleting redundant profile folders", error);
    }
    try {
      const existing = this.getStoredProfiles();
      const valid = [];
      for (const storedProfile of this.getStoredProfiles()) {
        if (this.isInvalidProfile(storedProfile)) {
          this.logService.warn(`Invalid user data profile found: ${storedProfile.name}`);
        } else {
          valid.push(storedProfile);
        }
      }
      if (existing.length !== valid.length) {
        this.saveStoredProfiles(valid);
      }
    } catch (error) {
      this.logService.error("Error removing invalid stored profiles", error);
    }
  }
  async cleanUpTransientProfiles() {
    const unAssociatedTransientProfiles = this.transientProfilesObject.profiles.filter((p) => !this.isProfileAssociatedToWorkspace(p));
    await Promise.allSettled(unAssociatedTransientProfiles.map((p) => this.removeProfile(p)));
  }
  getProfileForWorkspace(workspaceIdentifier) {
    const workspace = this.getWorkspace(workspaceIdentifier);
    if (URI.isUri(workspace) && this.uriIdentityService.extUri.isEqual(workspace, this.environmentService.agentSessionsWorkspace)) {
      return this.profiles.find((p) => p.isAgentsWindowProfile);
    }
    return URI.isUri(workspace) ? this.profiles.find((p) => p.workspaces?.some((w) => this.uriIdentityService.extUri.isEqual(w, workspace))) : this.profilesObject.emptyWindows.get(workspace) ?? this.transientProfilesObject.emptyWindows.get(workspace);
  }
  getWorkspace(workspaceIdentifier) {
    if (isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
      return workspaceIdentifier.uri;
    }
    if (isWorkspaceIdentifier(workspaceIdentifier)) {
      return workspaceIdentifier.configPath;
    }
    return workspaceIdentifier.id;
  }
  isProfileAssociatedToWorkspace(profile) {
    if (profile.workspaces?.length) {
      return true;
    }
    if ([...this.profilesObject.emptyWindows.values()].some((windowProfile) => this.uriIdentityService.extUri.isEqual(windowProfile.location, profile.location))) {
      return true;
    }
    if ([...this.transientProfilesObject.emptyWindows.values()].some((windowProfile) => this.uriIdentityService.extUri.isEqual(windowProfile.location, profile.location))) {
      return true;
    }
    return false;
  }
  updateProfiles(added, removed, updated, donotTrigger = false) {
    const allProfiles = [...this.profiles, ...added];
    const transientProfiles = this.transientProfilesObject.profiles;
    this.transientProfilesObject.profiles = [];
    const profiles = [];
    for (let profile of allProfiles) {
      if (removed.some((p) => profile.id === p.id)) {
        for (const windowId of [...this.profilesObject.emptyWindows.keys()]) {
          if (profile.id === this.profilesObject.emptyWindows.get(windowId)?.id) {
            this.profilesObject.emptyWindows.delete(windowId);
          }
        }
        continue;
      }
      if (!profile.isDefault) {
        profile = updated.find((p) => profile.id === p.id) ?? profile;
        const transientProfile = transientProfiles.find((p) => profile.id === p.id);
        if (profile.isTransient) {
          this.transientProfilesObject.profiles.push(profile);
        } else {
          if (transientProfile) {
            for (const [windowId, p] of this.transientProfilesObject.emptyWindows.entries()) {
              if (profile.id === p.id) {
                this.transientProfilesObject.emptyWindows.delete(windowId);
                this.profilesObject.emptyWindows.set(windowId, profile);
                break;
              }
            }
          }
        }
      }
      if (profile.workspaces?.length === 0) {
        profile.workspaces = void 0;
      }
      profiles.push(profile);
    }
    this.updateStoredProfiles(profiles);
    if (!donotTrigger) {
      this.triggerProfilesChanges(added, removed, updated);
    }
  }
  triggerProfilesChanges(added, removed, updated) {
    this._onDidChangeProfiles.fire({ added, removed, updated, all: this.profiles });
  }
  updateEmptyWindowAssociation(windowId, newProfile, transient) {
    transient = newProfile?.isTransient ? true : transient;
    if (transient) {
      if (newProfile) {
        this.transientProfilesObject.emptyWindows.set(windowId, newProfile);
      } else {
        this.transientProfilesObject.emptyWindows.delete(windowId);
      }
    } else {
      this.transientProfilesObject.emptyWindows.delete(windowId);
      if (newProfile) {
        this.profilesObject.emptyWindows.set(windowId, newProfile);
      } else {
        this.profilesObject.emptyWindows.delete(windowId);
      }
    }
  }
  updateStoredProfiles(profiles) {
    const storedProfiles = [];
    const workspaces = {};
    const emptyWindows = {};
    for (const profile of profiles) {
      if (profile.isTransient) {
        continue;
      }
      if (!profile.isDefault) {
        storedProfiles.push({
          location: profile.location,
          name: profile.name,
          icon: profile.icon,
          useDefaultFlags: profile.useDefaultFlags
        });
      }
      if (profile.workspaces) {
        for (const workspace of profile.workspaces) {
          workspaces[workspace.toString()] = profile.id;
        }
      }
    }
    for (const [windowId, profile] of this.profilesObject.emptyWindows.entries()) {
      emptyWindows[windowId.toString()] = profile.id;
    }
    this.saveStoredProfileAssociations({ workspaces, emptyWindows });
    this.saveStoredProfiles(storedProfiles);
    this._profilesObject = void 0;
  }
  getStoredProfiles() {
    return [];
  }
  saveStoredProfiles(storedProfiles) {
    throw new Error("not implemented");
  }
  getStoredProfileAssociations() {
    return {};
  }
  saveStoredProfileAssociations(storedProfileAssociations) {
    throw new Error("not implemented");
  }
  getDefaultProfileExtensionsLocation() {
    return void 0;
  }
};
UserDataProfilesService.PROFILES_KEY = "userDataProfiles";
UserDataProfilesService.PROFILE_ASSOCIATIONS_KEY = "profileAssociations";
UserDataProfilesService = __decorateClass([
  __decorateParam(0, IEnvironmentService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, ILogService)
], UserDataProfilesService);
class InMemoryUserDataProfilesService extends UserDataProfilesService {
  constructor() {
    super(...arguments);
    this.storedProfiles = [];
    this.storedProfileAssociations = {};
  }
  getStoredProfiles() {
    return this.storedProfiles;
  }
  saveStoredProfiles(storedProfiles) {
    this.storedProfiles = storedProfiles;
  }
  getStoredProfileAssociations() {
    return this.storedProfileAssociations;
  }
  saveStoredProfileAssociations(storedProfileAssociations) {
    this.storedProfileAssociations = storedProfileAssociations;
  }
}
export {
  AGENTS_WINDOW_PROFILE_ID,
  IUserDataProfilesService,
  InMemoryUserDataProfilesService,
  ProfileResourceType,
  UserDataProfilesService,
  isUserDataProfile,
  reviveProfile,
  toUserDataProfile
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUR0byB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlU2VydmljZSwgdG9GaWxlT3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQW55V29ya3NwYWNlSWRlbnRpZmllciwgaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCBpc1dvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nLCBNdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5leHBvcnQgY29uc3QgQUdFTlRTX1dJTkRPV19QUk9GSUxFX0lEID0gJ2FnZW50cyc7XG5cbmNvbnN0IEFHRU5UU19XSU5ET1dfUFJPRklMRV9GTEFHUzogVXNlRGVmYXVsdFByb2ZpbGVGbGFncyA9IHtcblx0c2V0dGluZ3M6IHRydWUsXG5cdGtleWJpbmRpbmdzOiB0cnVlLFxuXHRwcm9tcHRzOiB0cnVlLFxuXHRtY3A6IHRydWUsXG5cdGxhbmd1YWdlTW9kZWxzOiB0cnVlLFxuXHRzbmlwcGV0czogdHJ1ZSxcblx0dGFza3M6IHRydWUsXG5cdGV4dGVuc2lvbnM6IHRydWUsXG59O1xuXG5leHBvcnQgY29uc3QgZW51bSBQcm9maWxlUmVzb3VyY2VUeXBlIHtcblx0U2V0dGluZ3MgPSAnc2V0dGluZ3MnLFxuXHRLZXliaW5kaW5ncyA9ICdrZXliaW5kaW5ncycsXG5cdFNuaXBwZXRzID0gJ3NuaXBwZXRzJyxcblx0UHJvbXB0cyA9ICdwcm9tcHRzJyxcblx0VGFza3MgPSAndGFza3MnLFxuXHRFeHRlbnNpb25zID0gJ2V4dGVuc2lvbnMnLFxuXHRHbG9iYWxTdGF0ZSA9ICdnbG9iYWxTdGF0ZScsXG5cdE1jcCA9ICdtY3AnLFxuXHRMYW5ndWFnZU1vZGVscyA9ICdsYW5ndWFnZU1vZGVscycsXG59XG5cbi8qKlxuICogRmxhZ3MgdG8gaW5kaWNhdGUgd2hldGhlciB0byB1c2UgdGhlIGRlZmF1bHQgcHJvZmlsZSBvciBub3QuXG4gKi9cbmV4cG9ydCB0eXBlIFVzZURlZmF1bHRQcm9maWxlRmxhZ3MgPSB7IFtrZXkgaW4gUHJvZmlsZVJlc291cmNlVHlwZV0/OiBib29sZWFuIH07XG5leHBvcnQgdHlwZSBQcm9maWxlUmVzb3VyY2VUeXBlRmxhZ3MgPSBVc2VEZWZhdWx0UHJvZmlsZUZsYWdzO1xuZXhwb3J0IHR5cGUgU2V0dGluZ1ZhbHVlID0gc3RyaW5nIHwgYm9vbGVhbiB8IG51bWJlciB8IHVuZGVmaW5lZCB8IG51bGwgfCBvYmplY3Q7XG5leHBvcnQgdHlwZSBJU2V0dGluZ3NEaWN0aW9uYXJ5ID0gUmVjb3JkPHN0cmluZywgU2V0dGluZ1ZhbHVlPjtcblxuZXhwb3J0IGludGVyZmFjZSBJVXNlckRhdGFQcm9maWxlIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgaXNEZWZhdWx0OiBib29sZWFuO1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxvY2F0aW9uOiBVUkk7XG5cdHJlYWRvbmx5IGdsb2JhbFN0b3JhZ2VIb21lOiBVUkk7XG5cdHJlYWRvbmx5IHNldHRpbmdzUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkga2V5YmluZGluZ3NSZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSB0YXNrc1Jlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IHNuaXBwZXRzSG9tZTogVVJJO1xuXHRyZWFkb25seSBwcm9tcHRzSG9tZTogVVJJO1xuXHRyZWFkb25seSBleHRlbnNpb25zUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgbWNwUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNSZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBhZ2VudFBsdWdpbnNIb21lOiBVUkk7XG5cdHJlYWRvbmx5IGNhY2hlSG9tZTogVVJJO1xuXHRyZWFkb25seSB1c2VEZWZhdWx0RmxhZ3M/OiBVc2VEZWZhdWx0UHJvZmlsZUZsYWdzO1xuXHRyZWFkb25seSBpc0ludGVybmFsPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNUcmFuc2llbnQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBpc0FnZW50c1dpbmRvd1Byb2ZpbGU/OiBib29sZWFuO1xuXHRyZWFkb25seSB3b3Jrc3BhY2VzPzogcmVhZG9ubHkgVVJJW107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1VzZXJEYXRhUHJvZmlsZSh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIElVc2VyRGF0YVByb2ZpbGUge1xuXHRjb25zdCBjYW5kaWRhdGUgPSB0aGluZyBhcyBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkO1xuXG5cdHJldHVybiAhIShjYW5kaWRhdGUgJiYgdHlwZW9mIGNhbmRpZGF0ZSA9PT0gJ29iamVjdCdcblx0XHQmJiB0eXBlb2YgY2FuZGlkYXRlLmlkID09PSAnc3RyaW5nJ1xuXHRcdCYmIHR5cGVvZiBjYW5kaWRhdGUuaXNEZWZhdWx0ID09PSAnYm9vbGVhbidcblx0XHQmJiB0eXBlb2YgY2FuZGlkYXRlLm5hbWUgPT09ICdzdHJpbmcnXG5cdFx0JiYgVVJJLmlzVXJpKGNhbmRpZGF0ZS5sb2NhdGlvbilcblx0XHQmJiBVUkkuaXNVcmkoY2FuZGlkYXRlLmdsb2JhbFN0b3JhZ2VIb21lKVxuXHRcdCYmIFVSSS5pc1VyaShjYW5kaWRhdGUuc2V0dGluZ3NSZXNvdXJjZSlcblx0XHQmJiBVUkkuaXNVcmkoY2FuZGlkYXRlLmtleWJpbmRpbmdzUmVzb3VyY2UpXG5cdFx0JiYgVVJJLmlzVXJpKGNhbmRpZGF0ZS50YXNrc1Jlc291cmNlKVxuXHRcdCYmIFVSSS5pc1VyaShjYW5kaWRhdGUuc25pcHBldHNIb21lKVxuXHRcdCYmIFVSSS5pc1VyaShjYW5kaWRhdGUucHJvbXB0c0hvbWUpXG5cdFx0JiYgVVJJLmlzVXJpKGNhbmRpZGF0ZS5leHRlbnNpb25zUmVzb3VyY2UpXG5cdFx0JiYgVVJJLmlzVXJpKGNhbmRpZGF0ZS5tY3BSZXNvdXJjZSlcblx0XHQmJiBVUkkuaXNVcmkoY2FuZGlkYXRlLmxhbmd1YWdlTW9kZWxzUmVzb3VyY2UpXG5cdFx0JiYgVVJJLmlzVXJpKGNhbmRpZGF0ZS5hZ2VudFBsdWdpbnNIb21lKVxuXHQpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQYXJzZWRVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbj86IHN0cmluZztcblx0cmVhZG9ubHkgc2V0dGluZ3M/OiBJU2V0dGluZ3NEaWN0aW9uYXJ5O1xuXHRyZWFkb25seSBnbG9iYWxTdGF0ZT86IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN5c3RlbVByb2ZpbGVUZW1wbGF0ZSBleHRlbmRzIElQYXJzZWRVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIERpZENoYW5nZVByb2ZpbGVzRXZlbnQgPSB7IHJlYWRvbmx5IGFkZGVkOiByZWFkb25seSBJVXNlckRhdGFQcm9maWxlW107IHJlYWRvbmx5IHJlbW92ZWQ6IHJlYWRvbmx5IElVc2VyRGF0YVByb2ZpbGVbXTsgcmVhZG9ubHkgdXBkYXRlZDogcmVhZG9ubHkgSVVzZXJEYXRhUHJvZmlsZVtdOyByZWFkb25seSBhbGw6IHJlYWRvbmx5IElVc2VyRGF0YVByb2ZpbGVbXSB9O1xuXG5leHBvcnQgdHlwZSBXaWxsQ3JlYXRlUHJvZmlsZUV2ZW50ID0ge1xuXHRwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlO1xuXHRqb2luKHByb21pc2U6IFByb21pc2U8dm9pZD4pOiB2b2lkO1xufTtcblxuZXhwb3J0IHR5cGUgV2lsbFJlbW92ZVByb2ZpbGVFdmVudCA9IHtcblx0cHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZTtcblx0am9pbihwcm9taXNlOiBQcm9taXNlPHZvaWQ+KTogdm9pZDtcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVVzZXJEYXRhUHJvZmlsZU9wdGlvbnMge1xuXHRyZWFkb25seSBpY29uPzogc3RyaW5nO1xuXHRyZWFkb25seSB1c2VEZWZhdWx0RmxhZ3M/OiBVc2VEZWZhdWx0UHJvZmlsZUZsYWdzO1xuXHRyZWFkb25seSB0cmFuc2llbnQ/OiBib29sZWFuO1xuXHRyZWFkb25seSB3b3Jrc3BhY2VzPzogcmVhZG9ubHkgVVJJW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVVzZXJEYXRhUHJvZmlsZVVwZGF0ZU9wdGlvbnMgZXh0ZW5kcyBPbWl0PElVc2VyRGF0YVByb2ZpbGVPcHRpb25zLCAnaWNvbic+IHtcblx0cmVhZG9ubHkgbmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbj86IHN0cmluZyB8IG51bGw7XG59XG5cbmV4cG9ydCBjb25zdCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlPignSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlJyk7XG5leHBvcnQgaW50ZXJmYWNlIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBwcm9maWxlc0hvbWU6IFVSSTtcblx0cmVhZG9ubHkgZGVmYXVsdFByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGU7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm9maWxlczogRXZlbnQ8RGlkQ2hhbmdlUHJvZmlsZXNFdmVudD47XG5cdHJlYWRvbmx5IHByb2ZpbGVzOiByZWFkb25seSBJVXNlckRhdGFQcm9maWxlW107XG5cblx0cmVhZG9ubHkgb25EaWRSZXNldFdvcmtzcGFjZXM6IEV2ZW50PHZvaWQ+O1xuXG5cdGNyZWF0ZU5hbWVkUHJvZmlsZShuYW1lOiBzdHJpbmcsIG9wdGlvbnM/OiBJVXNlckRhdGFQcm9maWxlT3B0aW9ucywgd29ya3NwYWNlSWRlbnRpZmllcj86IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlPjtcblx0Y3JlYXRlVHJhbnNpZW50UHJvZmlsZSh3b3Jrc3BhY2VJZGVudGlmaWVyPzogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIpOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGU+O1xuXHRjcmVhdGVQcm9maWxlKGlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgb3B0aW9ucz86IElVc2VyRGF0YVByb2ZpbGVPcHRpb25zLCB3b3Jrc3BhY2VJZGVudGlmaWVyPzogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIpOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGU+O1xuXHR1cGRhdGVQcm9maWxlKHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsIG9wdGlvbnM/OiBJVXNlckRhdGFQcm9maWxlVXBkYXRlT3B0aW9ucywpOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGU+O1xuXHRyZW1vdmVQcm9maWxlKHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdHNldFByb2ZpbGVGb3JXb3Jrc3BhY2Uod29ya3NwYWNlSWRlbnRpZmllcjogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIsIHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHZvaWQ+O1xuXHRyZXNldFdvcmtzcGFjZXMoKTogUHJvbWlzZTx2b2lkPjtcblxuXHRjbGVhblVwKCk6IFByb21pc2U8dm9pZD47XG5cdGNsZWFuVXBUcmFuc2llbnRQcm9maWxlcygpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmV2aXZlUHJvZmlsZShwcm9maWxlOiBVcmlEdG88SVVzZXJEYXRhUHJvZmlsZT4sIHNjaGVtZTogc3RyaW5nKTogSVVzZXJEYXRhUHJvZmlsZSB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IHByb2ZpbGUuaWQsXG5cdFx0aXNEZWZhdWx0OiBwcm9maWxlLmlzRGVmYXVsdCxcblx0XHRuYW1lOiBwcm9maWxlLm5hbWUsXG5cdFx0aWNvbjogcHJvZmlsZS5pY29uLFxuXHRcdGxvY2F0aW9uOiBVUkkucmV2aXZlKHByb2ZpbGUubG9jYXRpb24pLndpdGgoeyBzY2hlbWUgfSksXG5cdFx0Z2xvYmFsU3RvcmFnZUhvbWU6IFVSSS5yZXZpdmUocHJvZmlsZS5nbG9iYWxTdG9yYWdlSG9tZSkud2l0aCh7IHNjaGVtZSB9KSxcblx0XHRzZXR0aW5nc1Jlc291cmNlOiBVUkkucmV2aXZlKHByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSkud2l0aCh7IHNjaGVtZSB9KSxcblx0XHRrZXliaW5kaW5nc1Jlc291cmNlOiBVUkkucmV2aXZlKHByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZSkud2l0aCh7IHNjaGVtZSB9KSxcblx0XHR0YXNrc1Jlc291cmNlOiBVUkkucmV2aXZlKHByb2ZpbGUudGFza3NSZXNvdXJjZSkud2l0aCh7IHNjaGVtZSB9KSxcblx0XHRzbmlwcGV0c0hvbWU6IFVSSS5yZXZpdmUocHJvZmlsZS5zbmlwcGV0c0hvbWUpLndpdGgoeyBzY2hlbWUgfSksXG5cdFx0cHJvbXB0c0hvbWU6IFVSSS5yZXZpdmUocHJvZmlsZS5wcm9tcHRzSG9tZSkud2l0aCh7IHNjaGVtZSB9KSxcblx0XHRleHRlbnNpb25zUmVzb3VyY2U6IFVSSS5yZXZpdmUocHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpLndpdGgoeyBzY2hlbWUgfSksXG5cdFx0bWNwUmVzb3VyY2U6IFVSSS5yZXZpdmUocHJvZmlsZS5tY3BSZXNvdXJjZSkud2l0aCh7IHNjaGVtZSB9KSxcblx0XHRsYW5ndWFnZU1vZGVsc1Jlc291cmNlOiBVUkkucmV2aXZlKHByb2ZpbGUubGFuZ3VhZ2VNb2RlbHNSZXNvdXJjZSkud2l0aCh7IHNjaGVtZSB9KSxcblx0XHRhZ2VudFBsdWdpbnNIb21lOiBVUkkucmV2aXZlKHByb2ZpbGUuYWdlbnRQbHVnaW5zSG9tZSksXG5cdFx0Y2FjaGVIb21lOiBVUkkucmV2aXZlKHByb2ZpbGUuY2FjaGVIb21lKS53aXRoKHsgc2NoZW1lIH0pLFxuXHRcdHVzZURlZmF1bHRGbGFnczogcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3MsXG5cdFx0aXNUcmFuc2llbnQ6IHByb2ZpbGUuaXNUcmFuc2llbnQsXG5cdFx0aXNJbnRlcm5hbDogcHJvZmlsZS5pc0ludGVybmFsLFxuXHRcdGlzQWdlbnRzV2luZG93UHJvZmlsZTogcHJvZmlsZS5pc0FnZW50c1dpbmRvd1Byb2ZpbGUsXG5cdFx0d29ya3NwYWNlczogcHJvZmlsZS53b3Jrc3BhY2VzPy5tYXAodyA9PiBVUkkucmV2aXZlKHcpKSxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvVXNlckRhdGFQcm9maWxlKGlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgbG9jYXRpb246IFVSSSwgcHJvZmlsZXNDYWNoZUhvbWU6IFVSSSwgb3B0aW9ucz86IElVc2VyRGF0YVByb2ZpbGVPcHRpb25zLCBkZWZhdWx0UHJvZmlsZT86IElVc2VyRGF0YVByb2ZpbGUpOiBJVXNlckRhdGFQcm9maWxlIHtcblx0Y29uc3QgaXNBZ2VudHNXaW5kb3dQcm9maWxlID0gaWQgPT09IEFHRU5UU19XSU5ET1dfUFJPRklMRV9JRDtcblx0cmV0dXJuIHtcblx0XHRpZCxcblx0XHRuYW1lLFxuXHRcdGxvY2F0aW9uLFxuXHRcdGlzRGVmYXVsdDogZmFsc2UsXG5cdFx0aWNvbjogb3B0aW9ucz8uaWNvbixcblx0XHRnbG9iYWxTdG9yYWdlSG9tZTogZGVmYXVsdFByb2ZpbGUgJiYgb3B0aW9ucz8udXNlRGVmYXVsdEZsYWdzPy5nbG9iYWxTdGF0ZSA/IGRlZmF1bHRQcm9maWxlLmdsb2JhbFN0b3JhZ2VIb21lIDogam9pblBhdGgobG9jYXRpb24sICdnbG9iYWxTdG9yYWdlJyksXG5cdFx0c2V0dGluZ3NSZXNvdXJjZTogZGVmYXVsdFByb2ZpbGUgJiYgb3B0aW9ucz8udXNlRGVmYXVsdEZsYWdzPy5zZXR0aW5ncyA/IGRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UgOiBqb2luUGF0aChsb2NhdGlvbiwgJ3NldHRpbmdzLmpzb24nKSxcblx0XHRrZXliaW5kaW5nc1Jlc291cmNlOiBkZWZhdWx0UHJvZmlsZSAmJiBvcHRpb25zPy51c2VEZWZhdWx0RmxhZ3M/LmtleWJpbmRpbmdzID8gZGVmYXVsdFByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZSA6IGpvaW5QYXRoKGxvY2F0aW9uLCAna2V5YmluZGluZ3MuanNvbicpLFxuXHRcdHRhc2tzUmVzb3VyY2U6IGRlZmF1bHRQcm9maWxlICYmIG9wdGlvbnM/LnVzZURlZmF1bHRGbGFncz8udGFza3MgPyBkZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlIDogam9pblBhdGgobG9jYXRpb24sICd0YXNrcy5qc29uJyksXG5cdFx0c25pcHBldHNIb21lOiBkZWZhdWx0UHJvZmlsZSAmJiBvcHRpb25zPy51c2VEZWZhdWx0RmxhZ3M/LnNuaXBwZXRzID8gZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lIDogam9pblBhdGgobG9jYXRpb24sICdzbmlwcGV0cycpLFxuXHRcdHByb21wdHNIb21lOiBkZWZhdWx0UHJvZmlsZSAmJiBvcHRpb25zPy51c2VEZWZhdWx0RmxhZ3M/LnByb21wdHMgPyBkZWZhdWx0UHJvZmlsZS5wcm9tcHRzSG9tZSA6IGpvaW5QYXRoKGxvY2F0aW9uLCAncHJvbXB0cycpLFxuXHRcdGV4dGVuc2lvbnNSZXNvdXJjZTogZGVmYXVsdFByb2ZpbGUgJiYgb3B0aW9ucz8udXNlRGVmYXVsdEZsYWdzPy5leHRlbnNpb25zID8gZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlIDogam9pblBhdGgobG9jYXRpb24sICdleHRlbnNpb25zLmpzb24nKSxcblx0XHRtY3BSZXNvdXJjZTogZGVmYXVsdFByb2ZpbGUgJiYgb3B0aW9ucz8udXNlRGVmYXVsdEZsYWdzPy5tY3AgPyBkZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZSA6IGpvaW5QYXRoKGxvY2F0aW9uLCAnbWNwLmpzb24nKSxcblx0XHRsYW5ndWFnZU1vZGVsc1Jlc291cmNlOiBkZWZhdWx0UHJvZmlsZSAmJiBvcHRpb25zPy51c2VEZWZhdWx0RmxhZ3M/Lmxhbmd1YWdlTW9kZWxzID8gZGVmYXVsdFByb2ZpbGUubGFuZ3VhZ2VNb2RlbHNSZXNvdXJjZSA6IGpvaW5QYXRoKGxvY2F0aW9uLCAnY2hhdExhbmd1YWdlTW9kZWxzLmpzb24nKSxcblx0XHRhZ2VudFBsdWdpbnNIb21lOiBkZWZhdWx0UHJvZmlsZSA/IGRlZmF1bHRQcm9maWxlLmFnZW50UGx1Z2luc0hvbWUgOiBqb2luUGF0aChsb2NhdGlvbiwgJ2FnZW50LXBsdWdpbnMnKSxcblx0XHRjYWNoZUhvbWU6IGpvaW5QYXRoKHByb2ZpbGVzQ2FjaGVIb21lLCBpZCksXG5cdFx0dXNlRGVmYXVsdEZsYWdzOiBvcHRpb25zPy51c2VEZWZhdWx0RmxhZ3MsXG5cdFx0aXNUcmFuc2llbnQ6IG9wdGlvbnM/LnRyYW5zaWVudCxcblx0XHRpc0ludGVybmFsOiBpc0FnZW50c1dpbmRvd1Byb2ZpbGUgfHwgb3B0aW9ucz8udHJhbnNpZW50LFxuXHRcdGlzQWdlbnRzV2luZG93UHJvZmlsZSxcblx0XHR3b3Jrc3BhY2VzOiBvcHRpb25zPy53b3Jrc3BhY2VzLFxuXHR9O1xufVxuXG5leHBvcnQgdHlwZSBVc2VyRGF0YVByb2ZpbGVzT2JqZWN0ID0ge1xuXHRwcm9maWxlczogSVVzZXJEYXRhUHJvZmlsZVtdO1xuXHRlbXB0eVdpbmRvd3M6IE1hcDxzdHJpbmcsIElVc2VyRGF0YVByb2ZpbGU+O1xufTtcblxuZXhwb3J0IHR5cGUgU3RvcmVkVXNlckRhdGFQcm9maWxlID0ge1xuXHRuYW1lOiBzdHJpbmc7XG5cdGxvY2F0aW9uOiBVUkk7XG5cdGljb24/OiBzdHJpbmc7XG5cdHVzZURlZmF1bHRGbGFncz86IFVzZURlZmF1bHRQcm9maWxlRmxhZ3M7XG59O1xuXG5leHBvcnQgdHlwZSBTdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zID0ge1xuXHR3b3Jrc3BhY2VzPzogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPjtcblx0ZW1wdHlXaW5kb3dzPzogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPjtcbn07XG5cbmNvbnN0IFNZU1RFTV9QUk9GSUxFU19IT01FID0gJ2J1aWx0aW4nO1xuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIHN0YXRpYyByZWFkb25seSBQUk9GSUxFU19LRVkgPSAndXNlckRhdGFQcm9maWxlcyc7XG5cdHByb3RlY3RlZCBzdGF0aWMgcmVhZG9ubHkgUFJPRklMRV9BU1NPQ0lBVElPTlNfS0VZID0gJ3Byb2ZpbGVBc3NvY2lhdGlvbnMnO1xuXG5cdHJlYWRvbmx5IHByb2ZpbGVzSG9tZTogVVJJO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb2ZpbGVzQ2FjaGVIb21lOiBVUkk7XG5cblx0Z2V0IGRlZmF1bHRQcm9maWxlKCk6IElVc2VyRGF0YVByb2ZpbGUgeyByZXR1cm4gdGhpcy5wcm9maWxlc1swXTsgfVxuXHRnZXQgcHJvZmlsZXMoKTogSVVzZXJEYXRhUHJvZmlsZVtdIHsgcmV0dXJuIFsuLi50aGlzLnByb2ZpbGVzT2JqZWN0LnByb2ZpbGVzLCAuLi50aGlzLnRyYW5zaWVudFByb2ZpbGVzT2JqZWN0LnByb2ZpbGVzXTsgfVxuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VQcm9maWxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPERpZENoYW5nZVByb2ZpbGVzRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVByb2ZpbGVzID0gdGhpcy5fb25EaWRDaGFuZ2VQcm9maWxlcy5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uV2lsbENyZWF0ZVByb2ZpbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxXaWxsQ3JlYXRlUHJvZmlsZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25XaWxsQ3JlYXRlUHJvZmlsZSA9IHRoaXMuX29uV2lsbENyZWF0ZVByb2ZpbGUuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbldpbGxSZW1vdmVQcm9maWxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8V2lsbFJlbW92ZVByb2ZpbGVFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbFJlbW92ZVByb2ZpbGUgPSB0aGlzLl9vbldpbGxSZW1vdmVQcm9maWxlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVzZXRXb3Jrc3BhY2VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVzZXRXb3Jrc3BhY2VzID0gdGhpcy5fb25EaWRSZXNldFdvcmtzcGFjZXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBwcm9maWxlQ3JlYXRpb25Qcm9taXNlcyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGU+PigpO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSB0cmFuc2llbnRQcm9maWxlc09iamVjdDogVXNlckRhdGFQcm9maWxlc09iamVjdCA9IHtcblx0XHRwcm9maWxlczogW10sXG5cdFx0ZW1wdHlXaW5kb3dzOiBuZXcgTWFwKClcblx0fTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcm90ZWN0ZWQgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJvdGVjdGVkIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJvdGVjdGVkIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJvdGVjdGVkIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5wcm9maWxlc0hvbWUgPSBqb2luUGF0aCh0aGlzLmVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLCAncHJvZmlsZXMnKTtcblx0XHR0aGlzLnByb2ZpbGVzQ2FjaGVIb21lID0gam9pblBhdGgodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuY2FjaGVIb21lLCAnQ2FjaGVkUHJvZmlsZXNEYXRhJyk7XG5cdH1cblxuXHRpbml0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3Byb2ZpbGVzT2JqZWN0ID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9wcm9maWxlc09iamVjdDogVXNlckRhdGFQcm9maWxlc09iamVjdCB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIGdldCBwcm9maWxlc09iamVjdCgpOiBVc2VyRGF0YVByb2ZpbGVzT2JqZWN0IHtcblx0XHRpZiAoIXRoaXMuX3Byb2ZpbGVzT2JqZWN0KSB7XG5cdFx0XHRjb25zdCBkZWZhdWx0UHJvZmlsZSA9IHRoaXMuY3JlYXRlRGVmYXVsdFByb2ZpbGUoKTtcblx0XHRcdGNvbnN0IHByb2ZpbGVzOiBBcnJheTxNdXRhYmxlPElVc2VyRGF0YVByb2ZpbGU+PiA9IFtkZWZhdWx0UHJvZmlsZV07XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHN0b3JlZFByb2ZpbGUgb2YgdGhpcy5nZXRTdG9yZWRQcm9maWxlcygpKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuaXNJbnZhbGlkUHJvZmlsZShzdG9yZWRQcm9maWxlKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1NraXBwaW5nIHRoZSBpbnZhbGlkIHN0b3JlZCBwcm9maWxlJywgc3RvcmVkUHJvZmlsZS5sb2NhdGlvbiB8fCBzdG9yZWRQcm9maWxlLm5hbWUpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGlkID0gYmFzZW5hbWUoc3RvcmVkUHJvZmlsZS5sb2NhdGlvbik7XG5cdFx0XHRcdFx0cHJvZmlsZXMucHVzaCh0b1VzZXJEYXRhUHJvZmlsZShcblx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0c3RvcmVkUHJvZmlsZS5uYW1lLFxuXHRcdFx0XHRcdFx0c3RvcmVkUHJvZmlsZS5sb2NhdGlvbixcblx0XHRcdFx0XHRcdHRoaXMucHJvZmlsZXNDYWNoZUhvbWUsXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGljb246IHN0b3JlZFByb2ZpbGUuaWNvbixcblx0XHRcdFx0XHRcdFx0dXNlRGVmYXVsdEZsYWdzOiBpZCA9PT0gQUdFTlRTX1dJTkRPV19QUk9GSUxFX0lEID8gQUdFTlRTX1dJTkRPV19QUk9GSUxFX0ZMQUdTIDogc3RvcmVkUHJvZmlsZS51c2VEZWZhdWx0RmxhZ3MsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZGVmYXVsdFByb2ZpbGUpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVtcHR5V2luZG93cyA9IG5ldyBNYXA8c3RyaW5nLCBJVXNlckRhdGFQcm9maWxlPigpO1xuXHRcdFx0aWYgKHByb2ZpbGVzLmxlbmd0aCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHByb2ZpbGVBc3NvY2lhaXRpb25zID0gdGhpcy5nZXRTdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zKCk7XG5cdFx0XHRcdFx0aWYgKHByb2ZpbGVBc3NvY2lhaXRpb25zLndvcmtzcGFjZXMpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgW3dvcmtzcGFjZVBhdGgsIHByb2ZpbGVJZF0gb2YgT2JqZWN0LmVudHJpZXMocHJvZmlsZUFzc29jaWFpdGlvbnMud29ya3NwYWNlcykpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gVVJJLnBhcnNlKHdvcmtzcGFjZVBhdGgpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBwcm9maWxlID0gcHJvZmlsZXMuZmluZChwID0+IHAuaWQgPT09IHByb2ZpbGVJZCk7XG5cdFx0XHRcdFx0XHRcdGlmIChwcm9maWxlKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlcyA9IHByb2ZpbGUud29ya3NwYWNlcyA/IHByb2ZpbGUud29ya3NwYWNlcy5zbGljZSgwKSA6IFtdO1xuXHRcdFx0XHRcdFx0XHRcdHdvcmtzcGFjZXMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdFx0XHRcdFx0XHRcdHByb2ZpbGUud29ya3NwYWNlcyA9IHdvcmtzcGFjZXM7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHByb2ZpbGVBc3NvY2lhaXRpb25zLmVtcHR5V2luZG93cykge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBbd2luZG93SWQsIHByb2ZpbGVJZF0gb2YgT2JqZWN0LmVudHJpZXMocHJvZmlsZUFzc29jaWFpdGlvbnMuZW1wdHlXaW5kb3dzKSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBwcm9maWxlID0gcHJvZmlsZXMuZmluZChwID0+IHAuaWQgPT09IHByb2ZpbGVJZCk7XG5cdFx0XHRcdFx0XHRcdGlmIChwcm9maWxlKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZW1wdHlXaW5kb3dzLnNldCh3aW5kb3dJZCwgcHJvZmlsZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcHJvZmlsZXNPYmplY3QgPSB7IHByb2ZpbGVzLCBlbXB0eVdpbmRvd3MgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2ZpbGVzT2JqZWN0O1xuXHR9XG5cblx0cHJpdmF0ZSBpc0ludmFsaWRQcm9maWxlKHN0b3JlZFByb2ZpbGU6IFN0b3JlZFVzZXJEYXRhUHJvZmlsZSk6IGJvb2xlYW4ge1xuXHRcdGlmICghc3RvcmVkUHJvZmlsZS5uYW1lKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFpc1N0cmluZyhzdG9yZWRQcm9maWxlLm5hbWUpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFzdG9yZWRQcm9maWxlLmxvY2F0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZURlZmF1bHRQcm9maWxlKCkge1xuXHRcdGNvbnN0IGRlZmF1bHRQcm9maWxlID0gdG9Vc2VyRGF0YVByb2ZpbGUoJ19fZGVmYXVsdF9fcHJvZmlsZV9fJywgbG9jYWxpemUoJ2RlZmF1bHRQcm9maWxlJywgXCJEZWZhdWx0XCIpLCB0aGlzLmVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLCB0aGlzLnByb2ZpbGVzQ2FjaGVIb21lKTtcblx0XHRyZXR1cm4geyAuLi5kZWZhdWx0UHJvZmlsZSwgZXh0ZW5zaW9uc1Jlc291cmNlOiB0aGlzLmdldERlZmF1bHRQcm9maWxlRXh0ZW5zaW9uc0xvY2F0aW9uKCkgPz8gZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLCBpc0RlZmF1bHQ6IHRydWUgfTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVRyYW5zaWVudFByb2ZpbGUod29ya3NwYWNlSWRlbnRpZmllcj86IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlPiB7XG5cdFx0Y29uc3QgbmFtZVByZWZpeCA9IGBUZW1wYDtcblx0XHRjb25zdCBuYW1lUmVnRXggPSBuZXcgUmVnRXhwKGAke2VzY2FwZVJlZ0V4cENoYXJhY3RlcnMobmFtZVByZWZpeCl9XFxcXHMoXFxcXGQrKWApO1xuXHRcdGxldCBuYW1lSW5kZXggPSAwO1xuXHRcdGZvciAoY29uc3QgcHJvZmlsZSBvZiB0aGlzLnByb2ZpbGVzKSB7XG5cdFx0XHRjb25zdCBtYXRjaGVzID0gbmFtZVJlZ0V4LmV4ZWMocHJvZmlsZS5uYW1lKTtcblx0XHRcdGNvbnN0IGluZGV4ID0gbWF0Y2hlcyA/IHBhcnNlSW50KG1hdGNoZXNbMV0pIDogMDtcblx0XHRcdG5hbWVJbmRleCA9IGluZGV4ID4gbmFtZUluZGV4ID8gaW5kZXggOiBuYW1lSW5kZXg7XG5cdFx0fVxuXHRcdGNvbnN0IG5hbWUgPSBgJHtuYW1lUHJlZml4fSAke25hbWVJbmRleCArIDF9YDtcblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVQcm9maWxlKGhhc2goZ2VuZXJhdGVVdWlkKCkpLnRvU3RyaW5nKDE2KSwgbmFtZSwgeyB0cmFuc2llbnQ6IHRydWUgfSwgd29ya3NwYWNlSWRlbnRpZmllcik7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVOYW1lZFByb2ZpbGUobmFtZTogc3RyaW5nLCBvcHRpb25zPzogSVVzZXJEYXRhUHJvZmlsZU9wdGlvbnMsIHdvcmtzcGFjZUlkZW50aWZpZXI/OiBJQW55V29ya3NwYWNlSWRlbnRpZmllcik6IFByb21pc2U8SVVzZXJEYXRhUHJvZmlsZT4ge1xuXHRcdHJldHVybiB0aGlzLmNyZWF0ZVByb2ZpbGUoaGFzaChnZW5lcmF0ZVV1aWQoKSkudG9TdHJpbmcoMTYpLCBuYW1lLCBvcHRpb25zLCB3b3Jrc3BhY2VJZGVudGlmaWVyKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVByb2ZpbGUoaWQ6IHN0cmluZywgbmFtZTogc3RyaW5nLCBvcHRpb25zPzogSVVzZXJEYXRhUHJvZmlsZU9wdGlvbnMsIHdvcmtzcGFjZUlkZW50aWZpZXI/OiBJQW55V29ya3NwYWNlSWRlbnRpZmllcik6IFByb21pc2U8SVVzZXJEYXRhUHJvZmlsZT4ge1xuXHRcdGNvbnN0IHByb2ZpbGUgPSBhd2FpdCB0aGlzLmRvQ3JlYXRlUHJvZmlsZShpZCwgbmFtZSwgb3B0aW9ucywgd29ya3NwYWNlSWRlbnRpZmllcik7XG5cblx0XHRyZXR1cm4gcHJvZmlsZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9DcmVhdGVQcm9maWxlKGlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgb3B0aW9ucz86IElVc2VyRGF0YVByb2ZpbGVPcHRpb25zLCB3b3Jrc3BhY2VJZGVudGlmaWVyPzogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIpOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGU+IHtcblx0XHRpZiAoIWlzU3RyaW5nKG5hbWUpIHx8ICFuYW1lKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05hbWUgb2YgdGhlIHByb2ZpbGUgaXMgbWFuZGF0b3J5IGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2AnKTtcblx0XHR9XG5cblx0XHRsZXQgcHJvZmlsZUNyZWF0aW9uUHJvbWlzZSA9IHRoaXMucHJvZmlsZUNyZWF0aW9uUHJvbWlzZXMuZ2V0KG5hbWUpO1xuXHRcdGlmICghcHJvZmlsZUNyZWF0aW9uUHJvbWlzZSkge1xuXHRcdFx0cHJvZmlsZUNyZWF0aW9uUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLnByb2ZpbGVzLmZpbmQocCA9PiBwLmlkID09PSBpZCB8fCAoaWQgIT09IEFHRU5UU19XSU5ET1dfUFJPRklMRV9JRCAmJiAhcC5pc1RyYW5zaWVudCAmJiAhb3B0aW9ucz8udHJhbnNpZW50ICYmIHAubmFtZSA9PT0gbmFtZSkpO1xuXHRcdFx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQcm9maWxlIHdpdGggJHtuYW1lfSBuYW1lIGFscmVhZHkgZXhpc3RzYCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gd29ya3NwYWNlSWRlbnRpZmllciA/IHRoaXMuZ2V0V29ya3NwYWNlKHdvcmtzcGFjZUlkZW50aWZpZXIpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChVUkkuaXNVcmkod29ya3NwYWNlKSkge1xuXHRcdFx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgd29ya3NwYWNlczogW3dvcmtzcGFjZV0gfTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBwcm9maWxlID0gdG9Vc2VyRGF0YVByb2ZpbGUoXG5cdFx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0XHR0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgodGhpcy5wcm9maWxlc0hvbWUsIC4uLihpZCA9PT0gQUdFTlRTX1dJTkRPV19QUk9GSUxFX0lEID8gW1NZU1RFTV9QUk9GSUxFU19IT01FLCBpZF0gOiBbaWRdKSksXG5cdFx0XHRcdFx0XHR0aGlzLnByb2ZpbGVzQ2FjaGVIb21lLFxuXHRcdFx0XHRcdFx0aWQgPT09IEFHRU5UU19XSU5ET1dfUFJPRklMRV9JRCA/IHt9IDogb3B0aW9ucyxcblx0XHRcdFx0XHRcdHRoaXMuZGVmYXVsdFByb2ZpbGUpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHByb2ZpbGUubG9jYXRpb24pO1xuXG5cdFx0XHRcdFx0Y29uc3Qgam9pbmVyczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0XHRcdFx0dGhpcy5fb25XaWxsQ3JlYXRlUHJvZmlsZS5maXJlKHtcblx0XHRcdFx0XHRcdHByb2ZpbGUsXG5cdFx0XHRcdFx0XHRqb2luKHByb21pc2UpIHtcblx0XHRcdFx0XHRcdFx0am9pbmVycy5wdXNoKHByb21pc2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoam9pbmVycyk7XG5cblx0XHRcdFx0XHRpZiAod29ya3NwYWNlICYmICFVUkkuaXNVcmkod29ya3NwYWNlKSkge1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVFbXB0eVdpbmRvd0Fzc29jaWF0aW9uKHdvcmtzcGFjZSwgcHJvZmlsZSwgISFwcm9maWxlLmlzVHJhbnNpZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVQcm9maWxlcyhbcHJvZmlsZV0sIFtdLCBbXSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMucHJvZmlsZXMuZmluZChwID0+IHAuaWQgPT09IHByb2ZpbGUuaWQpID8/IHByb2ZpbGU7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0dGhpcy5wcm9maWxlQ3JlYXRpb25Qcm9taXNlcy5kZWxldGUobmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKCk7XG5cdFx0XHR0aGlzLnByb2ZpbGVDcmVhdGlvblByb21pc2VzLnNldChuYW1lLCBwcm9maWxlQ3JlYXRpb25Qcm9taXNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHByb2ZpbGVDcmVhdGlvblByb21pc2U7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVQcm9maWxlKHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsIG9wdGlvbnM6IElVc2VyRGF0YVByb2ZpbGVVcGRhdGVPcHRpb25zKTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlPiB7XG5cdFx0aWYgKHByb2ZpbGUuaXNBZ2VudHNXaW5kb3dQcm9maWxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB1cGRhdGUgYWdlbnRzIHdpbmRvdyBwcm9maWxlJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvZmlsZXNUb1VwZGF0ZTogSVVzZXJEYXRhUHJvZmlsZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBleGlzdGluZyBvZiB0aGlzLnByb2ZpbGVzKSB7XG5cdFx0XHRsZXQgcHJvZmlsZVRvVXBkYXRlOiBNdXRhYmxlPElVc2VyRGF0YVByb2ZpbGU+IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAocHJvZmlsZS5pZCA9PT0gZXhpc3RpbmcuaWQpIHtcblx0XHRcdFx0aWYgKCFleGlzdGluZy5pc0RlZmF1bHQpIHtcblx0XHRcdFx0XHRwcm9maWxlVG9VcGRhdGUgPSB0b1VzZXJEYXRhUHJvZmlsZShleGlzdGluZy5pZCwgb3B0aW9ucy5uYW1lID8/IGV4aXN0aW5nLm5hbWUsIGV4aXN0aW5nLmxvY2F0aW9uLCB0aGlzLnByb2ZpbGVzQ2FjaGVIb21lLCB7XG5cdFx0XHRcdFx0XHRpY29uOiBvcHRpb25zLmljb24gPT09IG51bGwgPyB1bmRlZmluZWQgOiBvcHRpb25zLmljb24gPz8gZXhpc3RpbmcuaWNvbixcblx0XHRcdFx0XHRcdHRyYW5zaWVudDogb3B0aW9ucy50cmFuc2llbnQgPz8gZXhpc3RpbmcuaXNUcmFuc2llbnQsXG5cdFx0XHRcdFx0XHR1c2VEZWZhdWx0RmxhZ3M6IG9wdGlvbnMudXNlRGVmYXVsdEZsYWdzID8/IGV4aXN0aW5nLnVzZURlZmF1bHRGbGFncyxcblx0XHRcdFx0XHRcdHdvcmtzcGFjZXM6IG9wdGlvbnMud29ya3NwYWNlcyA/PyBleGlzdGluZy53b3Jrc3BhY2VzLFxuXHRcdFx0XHRcdH0sIHRoaXMuZGVmYXVsdFByb2ZpbGUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG9wdGlvbnMud29ya3NwYWNlcykge1xuXHRcdFx0XHRcdHByb2ZpbGVUb1VwZGF0ZSA9IGV4aXN0aW5nO1xuXHRcdFx0XHRcdHByb2ZpbGVUb1VwZGF0ZS53b3Jrc3BhY2VzID0gb3B0aW9ucy53b3Jrc3BhY2VzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGVsc2UgaWYgKG9wdGlvbnMud29ya3NwYWNlcykge1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VzID0gZXhpc3Rpbmcud29ya3NwYWNlcz8uZmlsdGVyKHcxID0+ICFvcHRpb25zLndvcmtzcGFjZXM/LnNvbWUodzIgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodzEsIHcyKSkpO1xuXHRcdFx0XHRpZiAoZXhpc3Rpbmcud29ya3NwYWNlcz8ubGVuZ3RoICE9PSB3b3Jrc3BhY2VzPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRwcm9maWxlVG9VcGRhdGUgPSBleGlzdGluZztcblx0XHRcdFx0XHRwcm9maWxlVG9VcGRhdGUud29ya3NwYWNlcyA9IHdvcmtzcGFjZXM7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHByb2ZpbGVUb1VwZGF0ZSkge1xuXHRcdFx0XHRwcm9maWxlc1RvVXBkYXRlLnB1c2gocHJvZmlsZVRvVXBkYXRlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXByb2ZpbGVzVG9VcGRhdGUubGVuZ3RoKSB7XG5cdFx0XHRpZiAocHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdXBkYXRlIGRlZmF1bHQgcHJvZmlsZScpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQcm9maWxlICcke3Byb2ZpbGUubmFtZX0nIGRvZXMgbm90IGV4aXN0YCk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVQcm9maWxlcyhbXSwgW10sIHByb2ZpbGVzVG9VcGRhdGUpO1xuXG5cdFx0Y29uc3QgdXBkYXRlZFByb2ZpbGUgPSB0aGlzLnByb2ZpbGVzLmZpbmQocCA9PiBwLmlkID09PSBwcm9maWxlLmlkKTtcblx0XHRpZiAoIXVwZGF0ZWRQcm9maWxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFByb2ZpbGUgJyR7cHJvZmlsZS5uYW1lfScgd2FzIG5vdCB1cGRhdGVkYCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVwZGF0ZWRQcm9maWxlO1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlUHJvZmlsZShwcm9maWxlVG9SZW1vdmU6IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAocHJvZmlsZVRvUmVtb3ZlLmlzRGVmYXVsdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgcmVtb3ZlIGRlZmF1bHQgcHJvZmlsZScpO1xuXHRcdH1cblx0XHRjb25zdCBwcm9maWxlID0gdGhpcy5wcm9maWxlcy5maW5kKHAgPT4gcC5pZCA9PT0gcHJvZmlsZVRvUmVtb3ZlLmlkKTtcblx0XHRpZiAoIXByb2ZpbGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgUHJvZmlsZSAnJHtwcm9maWxlVG9SZW1vdmUubmFtZX0nIGRvZXMgbm90IGV4aXN0YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgam9pbmVyczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0dGhpcy5fb25XaWxsUmVtb3ZlUHJvZmlsZS5maXJlKHtcblx0XHRcdHByb2ZpbGUsXG5cdFx0XHRqb2luKHByb21pc2UpIHtcblx0XHRcdFx0am9pbmVycy5wdXNoKHByb21pc2UpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChqb2luZXJzKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVByb2ZpbGVzKFtdLCBbcHJvZmlsZV0sIFtdKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChwcm9maWxlLmNhY2hlSG9tZSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2V0UHJvZmlsZUZvcldvcmtzcGFjZSh3b3Jrc3BhY2VJZGVudGlmaWVyOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciwgcHJvZmlsZVRvU2V0OiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IHRoaXMucHJvZmlsZXMuZmluZChwID0+IHAuaWQgPT09IHByb2ZpbGVUb1NldC5pZCk7XG5cdFx0aWYgKCFwcm9maWxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFByb2ZpbGUgJyR7cHJvZmlsZVRvU2V0Lm5hbWV9JyBkb2VzIG5vdCBleGlzdGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuZ2V0V29ya3NwYWNlKHdvcmtzcGFjZUlkZW50aWZpZXIpO1xuXHRcdGlmIChVUkkuaXNVcmkod29ya3NwYWNlKSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlcyA9IHByb2ZpbGUud29ya3NwYWNlcyA/IFsuLi5wcm9maWxlLndvcmtzcGFjZXNdIDogW107XG5cdFx0XHRpZiAoIXdvcmtzcGFjZXMuc29tZSh3ID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHcsIHdvcmtzcGFjZSkpKSB7XG5cdFx0XHRcdHdvcmtzcGFjZXMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZVByb2ZpbGUocHJvZmlsZSwgeyB3b3Jrc3BhY2VzIH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUVtcHR5V2luZG93QXNzb2NpYXRpb24od29ya3NwYWNlLCBwcm9maWxlLCBmYWxzZSk7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0b3JlZFByb2ZpbGVzKHRoaXMucHJvZmlsZXMpO1xuXHRcdH1cblx0fVxuXG5cdHVuc2V0V29ya3NwYWNlKHdvcmtzcGFjZUlkZW50aWZpZXI6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyLCB0cmFuc2llbnQ6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuZ2V0V29ya3NwYWNlKHdvcmtzcGFjZUlkZW50aWZpZXIpO1xuXHRcdGlmIChVUkkuaXNVcmkod29ya3NwYWNlKSkge1xuXHRcdFx0Y29uc3QgY3VycmVudGx5QXNzb2NpYXRlZFByb2ZpbGUgPSB0aGlzLmdldFByb2ZpbGVGb3JXb3Jrc3BhY2Uod29ya3NwYWNlSWRlbnRpZmllcik7XG5cdFx0XHRpZiAoY3VycmVudGx5QXNzb2NpYXRlZFByb2ZpbGUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVQcm9maWxlKGN1cnJlbnRseUFzc29jaWF0ZWRQcm9maWxlLCB7IHdvcmtzcGFjZXM6IGN1cnJlbnRseUFzc29jaWF0ZWRQcm9maWxlLndvcmtzcGFjZXM/LmZpbHRlcih3ID0+ICF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh3LCB3b3Jrc3BhY2UpKSB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy51cGRhdGVFbXB0eVdpbmRvd0Fzc29jaWF0aW9uKHdvcmtzcGFjZSwgdW5kZWZpbmVkLCB0cmFuc2llbnQpO1xuXHRcdFx0dGhpcy51cGRhdGVTdG9yZWRQcm9maWxlcyh0aGlzLnByb2ZpbGVzKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXNldFdvcmtzcGFjZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFuc2llbnRQcm9maWxlc09iamVjdC5lbXB0eVdpbmRvd3MuY2xlYXIoKTtcblx0XHR0aGlzLnByb2ZpbGVzT2JqZWN0LmVtcHR5V2luZG93cy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgcHJvZmlsZSBvZiB0aGlzLnByb2ZpbGVzKSB7XG5cdFx0XHQoPE11dGFibGU8SVVzZXJEYXRhUHJvZmlsZT4+cHJvZmlsZSkud29ya3NwYWNlcyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVQcm9maWxlcyhbXSwgW10sIHRoaXMucHJvZmlsZXMpO1xuXHRcdHRoaXMuX29uRGlkUmVzZXRXb3Jrc3BhY2VzLmZpcmUoKTtcblx0fVxuXG5cdGFzeW5jIGNsZWFuVXAoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyh0aGlzLnByb2ZpbGVzSG9tZSkpIHtcblx0XHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZSh0aGlzLnByb2ZpbGVzSG9tZSk7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKChzdGF0LmNoaWxkcmVuIHx8IFtdKVxuXHRcdFx0XHRcdC5maWx0ZXIoY2hpbGQgPT4gY2hpbGQuaXNEaXJlY3RvcnkgJiYgY2hpbGQubmFtZSAhPT0gU1lTVEVNX1BST0ZJTEVTX0hPTUUgJiYgdGhpcy5wcm9maWxlcy5ldmVyeShwID0+ICF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChwLmxvY2F0aW9uLCBjaGlsZC5yZXNvdXJjZSkpKVxuXHRcdFx0XHRcdC5tYXAoY2hpbGQgPT4gdGhpcy5maWxlU2VydmljZS5kZWwoY2hpbGQucmVzb3VyY2UsIHsgcmVjdXJzaXZlOiB0cnVlIH0pKSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRXJyb3IgZGVsZXRpbmcgcmVkdW5kYW50IHByb2ZpbGUgZm9sZGVycycsIGVycm9yKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLmdldFN0b3JlZFByb2ZpbGVzKCk7XG5cdFx0XHRjb25zdCB2YWxpZDogU3RvcmVkVXNlckRhdGFQcm9maWxlW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3Qgc3RvcmVkUHJvZmlsZSBvZiB0aGlzLmdldFN0b3JlZFByb2ZpbGVzKCkpIHtcblx0XHRcdFx0aWYgKHRoaXMuaXNJbnZhbGlkUHJvZmlsZShzdG9yZWRQcm9maWxlKSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBJbnZhbGlkIHVzZXIgZGF0YSBwcm9maWxlIGZvdW5kOiAke3N0b3JlZFByb2ZpbGUubmFtZX1gKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR2YWxpZC5wdXNoKHN0b3JlZFByb2ZpbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXhpc3RpbmcubGVuZ3RoICE9PSB2YWxpZC5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5zYXZlU3RvcmVkUHJvZmlsZXModmFsaWQpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Vycm9yIHJlbW92aW5nIGludmFsaWQgc3RvcmVkIHByb2ZpbGVzJywgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNsZWFuVXBUcmFuc2llbnRQcm9maWxlcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1bkFzc29jaWF0ZWRUcmFuc2llbnRQcm9maWxlcyA9IHRoaXMudHJhbnNpZW50UHJvZmlsZXNPYmplY3QucHJvZmlsZXMuZmlsdGVyKHAgPT4gIXRoaXMuaXNQcm9maWxlQXNzb2NpYXRlZFRvV29ya3NwYWNlKHApKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQodW5Bc3NvY2lhdGVkVHJhbnNpZW50UHJvZmlsZXMubWFwKHAgPT4gdGhpcy5yZW1vdmVQcm9maWxlKHApKSk7XG5cdH1cblxuXHRnZXRQcm9maWxlRm9yV29ya3NwYWNlKHdvcmtzcGFjZUlkZW50aWZpZXI6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyKTogSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5nZXRXb3Jrc3BhY2Uod29ya3NwYWNlSWRlbnRpZmllcik7XG5cblx0XHRpZiAoVVJJLmlzVXJpKHdvcmtzcGFjZSkgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwod29ya3NwYWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZS5hZ2VudFNlc3Npb25zV29ya3NwYWNlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucHJvZmlsZXMuZmluZChwID0+IHAuaXNBZ2VudHNXaW5kb3dQcm9maWxlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gVVJJLmlzVXJpKHdvcmtzcGFjZSlcblx0XHRcdD8gdGhpcy5wcm9maWxlcy5maW5kKHAgPT4gcC53b3Jrc3BhY2VzPy5zb21lKHcgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodywgd29ya3NwYWNlKSkpXG5cdFx0XHQ6ICh0aGlzLnByb2ZpbGVzT2JqZWN0LmVtcHR5V2luZG93cy5nZXQod29ya3NwYWNlKSA/PyB0aGlzLnRyYW5zaWVudFByb2ZpbGVzT2JqZWN0LmVtcHR5V2luZG93cy5nZXQod29ya3NwYWNlKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0V29ya3NwYWNlKHdvcmtzcGFjZUlkZW50aWZpZXI6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyKTogVVJJIHwgc3RyaW5nIHtcblx0XHRpZiAoaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZUlkZW50aWZpZXIpKSB7XG5cdFx0XHRyZXR1cm4gd29ya3NwYWNlSWRlbnRpZmllci51cmk7XG5cdFx0fVxuXHRcdGlmIChpc1dvcmtzcGFjZUlkZW50aWZpZXIod29ya3NwYWNlSWRlbnRpZmllcikpIHtcblx0XHRcdHJldHVybiB3b3Jrc3BhY2VJZGVudGlmaWVyLmNvbmZpZ1BhdGg7XG5cdFx0fVxuXHRcdHJldHVybiB3b3Jrc3BhY2VJZGVudGlmaWVyLmlkO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1Byb2ZpbGVBc3NvY2lhdGVkVG9Xb3Jrc3BhY2UocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IGJvb2xlYW4ge1xuXHRcdGlmIChwcm9maWxlLndvcmtzcGFjZXM/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChbLi4udGhpcy5wcm9maWxlc09iamVjdC5lbXB0eVdpbmRvd3MudmFsdWVzKCldLnNvbWUod2luZG93UHJvZmlsZSA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh3aW5kb3dQcm9maWxlLmxvY2F0aW9uLCBwcm9maWxlLmxvY2F0aW9uKSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoWy4uLnRoaXMudHJhbnNpZW50UHJvZmlsZXNPYmplY3QuZW1wdHlXaW5kb3dzLnZhbHVlcygpXS5zb21lKHdpbmRvd1Byb2ZpbGUgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwod2luZG93UHJvZmlsZS5sb2NhdGlvbiwgcHJvZmlsZS5sb2NhdGlvbikpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQcm9maWxlcyhhZGRlZDogSVVzZXJEYXRhUHJvZmlsZVtdLCByZW1vdmVkOiBJVXNlckRhdGFQcm9maWxlW10sIHVwZGF0ZWQ6IElVc2VyRGF0YVByb2ZpbGVbXSwgZG9ub3RUcmlnZ2VyOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRjb25zdCBhbGxQcm9maWxlczogTXV0YWJsZTxJVXNlckRhdGFQcm9maWxlPltdID0gWy4uLnRoaXMucHJvZmlsZXMsIC4uLmFkZGVkXTtcblxuXHRcdGNvbnN0IHRyYW5zaWVudFByb2ZpbGVzID0gdGhpcy50cmFuc2llbnRQcm9maWxlc09iamVjdC5wcm9maWxlcztcblx0XHR0aGlzLnRyYW5zaWVudFByb2ZpbGVzT2JqZWN0LnByb2ZpbGVzID0gW107XG5cblx0XHRjb25zdCBwcm9maWxlczogSVVzZXJEYXRhUHJvZmlsZVtdID0gW107XG5cblx0XHRmb3IgKGxldCBwcm9maWxlIG9mIGFsbFByb2ZpbGVzKSB7XG5cdFx0XHQvLyByZW1vdmVkXG5cdFx0XHRpZiAocmVtb3ZlZC5zb21lKHAgPT4gcHJvZmlsZS5pZCA9PT0gcC5pZCkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB3aW5kb3dJZCBvZiBbLi4udGhpcy5wcm9maWxlc09iamVjdC5lbXB0eVdpbmRvd3Mua2V5cygpXSkge1xuXHRcdFx0XHRcdGlmIChwcm9maWxlLmlkID09PSB0aGlzLnByb2ZpbGVzT2JqZWN0LmVtcHR5V2luZG93cy5nZXQod2luZG93SWQpPy5pZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5wcm9maWxlc09iamVjdC5lbXB0eVdpbmRvd3MuZGVsZXRlKHdpbmRvd0lkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghcHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdFx0cHJvZmlsZSA9IHVwZGF0ZWQuZmluZChwID0+IHByb2ZpbGUuaWQgPT09IHAuaWQpID8/IHByb2ZpbGU7XG5cdFx0XHRcdGNvbnN0IHRyYW5zaWVudFByb2ZpbGUgPSB0cmFuc2llbnRQcm9maWxlcy5maW5kKHAgPT4gcHJvZmlsZS5pZCA9PT0gcC5pZCk7XG5cdFx0XHRcdGlmIChwcm9maWxlLmlzVHJhbnNpZW50KSB7XG5cdFx0XHRcdFx0dGhpcy50cmFuc2llbnRQcm9maWxlc09iamVjdC5wcm9maWxlcy5wdXNoKHByb2ZpbGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmICh0cmFuc2llbnRQcm9maWxlKSB7XG5cdFx0XHRcdFx0XHQvLyBNb3ZlIHRoZSBlbXB0eSB3aW5kb3cgYXNzb2NpYXRpb25zIGZyb20gdGhlIHRyYW5zaWVudCBwcm9maWxlIHRvIHRoZSBwZXJzaXN0ZWQgcHJvZmlsZVxuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBbd2luZG93SWQsIHBdIG9mIHRoaXMudHJhbnNpZW50UHJvZmlsZXNPYmplY3QuZW1wdHlXaW5kb3dzLmVudHJpZXMoKSkge1xuXHRcdFx0XHRcdFx0XHRpZiAocHJvZmlsZS5pZCA9PT0gcC5pZCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMudHJhbnNpZW50UHJvZmlsZXNPYmplY3QuZW1wdHlXaW5kb3dzLmRlbGV0ZSh3aW5kb3dJZCk7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5wcm9maWxlc09iamVjdC5lbXB0eVdpbmRvd3Muc2V0KHdpbmRvd0lkLCBwcm9maWxlKTtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJvZmlsZS53b3Jrc3BhY2VzPy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cHJvZmlsZS53b3Jrc3BhY2VzID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRwcm9maWxlcy5wdXNoKHByb2ZpbGUpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlU3RvcmVkUHJvZmlsZXMocHJvZmlsZXMpO1xuXG5cdFx0aWYgKCFkb25vdFRyaWdnZXIpIHtcblx0XHRcdHRoaXMudHJpZ2dlclByb2ZpbGVzQ2hhbmdlcyhhZGRlZCwgcmVtb3ZlZCwgdXBkYXRlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHRyaWdnZXJQcm9maWxlc0NoYW5nZXMoYWRkZWQ6IElVc2VyRGF0YVByb2ZpbGVbXSwgcmVtb3ZlZDogSVVzZXJEYXRhUHJvZmlsZVtdLCB1cGRhdGVkOiBJVXNlckRhdGFQcm9maWxlW10pIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVByb2ZpbGVzLmZpcmUoeyBhZGRlZCwgcmVtb3ZlZCwgdXBkYXRlZCwgYWxsOiB0aGlzLnByb2ZpbGVzIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFbXB0eVdpbmRvd0Fzc29jaWF0aW9uKHdpbmRvd0lkOiBzdHJpbmcsIG5ld1Byb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQsIHRyYW5zaWVudDogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIEZvcmNlIHRyYW5zaWVudCBpZiB0aGUgbmV3IHByb2ZpbGUgdG8gYXNzb2NpYXRlIGlzIHRyYW5zaWVudFxuXHRcdHRyYW5zaWVudCA9IG5ld1Byb2ZpbGU/LmlzVHJhbnNpZW50ID8gdHJ1ZSA6IHRyYW5zaWVudDtcblxuXHRcdGlmICh0cmFuc2llbnQpIHtcblx0XHRcdGlmIChuZXdQcm9maWxlKSB7XG5cdFx0XHRcdHRoaXMudHJhbnNpZW50UHJvZmlsZXNPYmplY3QuZW1wdHlXaW5kb3dzLnNldCh3aW5kb3dJZCwgbmV3UHJvZmlsZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRyYW5zaWVudFByb2ZpbGVzT2JqZWN0LmVtcHR5V2luZG93cy5kZWxldGUod2luZG93SWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGVsc2Uge1xuXHRcdFx0Ly8gVW5zZXQgdGhlIHRyYW5zaWV0IGFzc29jaWF0aW9uIGlmIGFueVxuXHRcdFx0dGhpcy50cmFuc2llbnRQcm9maWxlc09iamVjdC5lbXB0eVdpbmRvd3MuZGVsZXRlKHdpbmRvd0lkKTtcblx0XHRcdGlmIChuZXdQcm9maWxlKSB7XG5cdFx0XHRcdHRoaXMucHJvZmlsZXNPYmplY3QuZW1wdHlXaW5kb3dzLnNldCh3aW5kb3dJZCwgbmV3UHJvZmlsZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnByb2ZpbGVzT2JqZWN0LmVtcHR5V2luZG93cy5kZWxldGUod2luZG93SWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU3RvcmVkUHJvZmlsZXMocHJvZmlsZXM6IElVc2VyRGF0YVByb2ZpbGVbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHN0b3JlZFByb2ZpbGVzOiBTdG9yZWRVc2VyRGF0YVByb2ZpbGVbXSA9IFtdO1xuXHRcdGNvbnN0IHdvcmtzcGFjZXM6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4gPSB7fTtcblx0XHRjb25zdCBlbXB0eVdpbmRvd3M6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4gPSB7fTtcblxuXHRcdGZvciAoY29uc3QgcHJvZmlsZSBvZiBwcm9maWxlcykge1xuXHRcdFx0aWYgKHByb2ZpbGUuaXNUcmFuc2llbnQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdHN0b3JlZFByb2ZpbGVzLnB1c2goe1xuXHRcdFx0XHRcdGxvY2F0aW9uOiBwcm9maWxlLmxvY2F0aW9uLFxuXHRcdFx0XHRcdG5hbWU6IHByb2ZpbGUubmFtZSxcblx0XHRcdFx0XHRpY29uOiBwcm9maWxlLmljb24sXG5cdFx0XHRcdFx0dXNlRGVmYXVsdEZsYWdzOiBwcm9maWxlLnVzZURlZmF1bHRGbGFncyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJvZmlsZS53b3Jrc3BhY2VzKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgd29ya3NwYWNlIG9mIHByb2ZpbGUud29ya3NwYWNlcykge1xuXHRcdFx0XHRcdHdvcmtzcGFjZXNbd29ya3NwYWNlLnRvU3RyaW5nKCldID0gcHJvZmlsZS5pZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW3dpbmRvd0lkLCBwcm9maWxlXSBvZiB0aGlzLnByb2ZpbGVzT2JqZWN0LmVtcHR5V2luZG93cy5lbnRyaWVzKCkpIHtcblx0XHRcdGVtcHR5V2luZG93c1t3aW5kb3dJZC50b1N0cmluZygpXSA9IHByb2ZpbGUuaWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5zYXZlU3RvcmVkUHJvZmlsZUFzc29jaWF0aW9ucyh7IHdvcmtzcGFjZXMsIGVtcHR5V2luZG93cyB9KTtcblx0XHR0aGlzLnNhdmVTdG9yZWRQcm9maWxlcyhzdG9yZWRQcm9maWxlcyk7XG5cdFx0dGhpcy5fcHJvZmlsZXNPYmplY3QgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0U3RvcmVkUHJvZmlsZXMoKTogU3RvcmVkVXNlckRhdGFQcm9maWxlW10geyByZXR1cm4gW107IH1cblx0cHJvdGVjdGVkIHNhdmVTdG9yZWRQcm9maWxlcyhzdG9yZWRQcm9maWxlczogU3RvcmVkVXNlckRhdGFQcm9maWxlW10pOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXG5cdHByb3RlY3RlZCBnZXRTdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zKCk6IFN0b3JlZFByb2ZpbGVBc3NvY2lhdGlvbnMgeyByZXR1cm4ge307IH1cblx0cHJvdGVjdGVkIHNhdmVTdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zKHN0b3JlZFByb2ZpbGVBc3NvY2lhdGlvbnM6IFN0b3JlZFByb2ZpbGVBc3NvY2lhdGlvbnMpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRwcm90ZWN0ZWQgZ2V0RGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zTG9jYXRpb24oKTogVVJJIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxufVxuXG5leHBvcnQgY2xhc3MgSW5NZW1vcnlVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBleHRlbmRzIFVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHtcblx0cHJpdmF0ZSBzdG9yZWRQcm9maWxlczogU3RvcmVkVXNlckRhdGFQcm9maWxlW10gPSBbXTtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFN0b3JlZFByb2ZpbGVzKCk6IFN0b3JlZFVzZXJEYXRhUHJvZmlsZVtdIHsgcmV0dXJuIHRoaXMuc3RvcmVkUHJvZmlsZXM7IH1cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNhdmVTdG9yZWRQcm9maWxlcyhzdG9yZWRQcm9maWxlczogU3RvcmVkVXNlckRhdGFQcm9maWxlW10pOiB2b2lkIHsgdGhpcy5zdG9yZWRQcm9maWxlcyA9IHN0b3JlZFByb2ZpbGVzOyB9XG5cblx0cHJpdmF0ZSBzdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zOiBTdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zID0ge307XG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRTdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zKCk6IFN0b3JlZFByb2ZpbGVBc3NvY2lhdGlvbnMgeyByZXR1cm4gdGhpcy5zdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zOyB9XG5cdHByb3RlY3RlZCBvdmVycmlkZSBzYXZlU3RvcmVkUHJvZmlsZUFzc29jaWF0aW9ucyhzdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zOiBTdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zKTogdm9pZCB7IHRoaXMuc3RvcmVkUHJvZmlsZUFzc29jaWF0aW9ucyA9IHN0b3JlZFByb2ZpbGVBc3NvY2lhdGlvbnM7IH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxVQUFVLGdCQUFnQjtBQUNuQyxTQUFTLFdBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCLGNBQWMsNkJBQTZCO0FB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
