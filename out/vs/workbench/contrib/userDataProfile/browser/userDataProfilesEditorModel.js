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
import { Action, Separator, toAction } from "../../../../base/common/actions.js";
import { Emitter } from "../../../../base/common/event.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { isMarkdownString } from "../../../../base/common/htmlContent.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isUserDataProfile, IUserDataProfilesService, ProfileResourceType, toUserDataProfile } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { isProfileURL, IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import * as arrays from "../../../../base/common/arrays.js";
import { equals } from "../../../../base/common/objects.js";
import { EditorModel } from "../../../common/editor/editorModel.js";
import { ExtensionsResourceExportTreeItem, ExtensionsResourceImportTreeItem } from "../../../services/userDataProfile/browser/extensionsResource.js";
import { SettingsResource, SettingsResourceTreeItem } from "../../../services/userDataProfile/browser/settingsResource.js";
import { KeybindingsResource, KeybindingsResourceTreeItem } from "../../../services/userDataProfile/browser/keybindingsResource.js";
import { TasksResource, TasksResourceTreeItem } from "../../../services/userDataProfile/browser/tasksResource.js";
import { SnippetsResource, SnippetsResourceTreeItem } from "../../../services/userDataProfile/browser/snippetsResource.js";
import { McpProfileResource, McpResourceTreeItem } from "../../../services/userDataProfile/browser/mcpProfileResource.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { InMemoryFileSystemProvider } from "../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { createCancelablePromise, RunOnceScheduler } from "../../../../base/common/async.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { API_OPEN_EDITOR_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { CONFIG_NEW_WINDOW_PROFILE } from "../../../common/configuration.js";
import { ResourceMap, ResourceSet } from "../../../../base/common/map.js";
import { getErrorMessage } from "../../../../base/common/errors.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IWorkspaceContextService, WORKSPACE_SUFFIX } from "../../../../platform/workspace/common/workspace.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { isString } from "../../../../base/common/types.js";
import { IWorkbenchExtensionManagementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
function isProfileResourceTypeElement(element) {
  return element.resourceType !== void 0;
}
function isProfileResourceChildElement(element) {
  return element.label !== void 0;
}
let AbstractUserDataProfileElement = class extends Disposable {
  constructor(name, icon, flags, workspaces, isActive, userDataProfileManagementService, userDataProfilesService, commandService, workspaceContextService, hostService, uriIdentityService, fileService, extensionManagementService, instantiationService) {
    super();
    this.userDataProfileManagementService = userDataProfileManagementService;
    this.userDataProfilesService = userDataProfilesService;
    this.commandService = commandService;
    this.workspaceContextService = workspaceContextService;
    this.hostService = hostService;
    this.uriIdentityService = uriIdentityService;
    this.fileService = fileService;
    this.extensionManagementService = extensionManagementService;
    this.instantiationService = instantiationService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.saveScheduler = this._register(new RunOnceScheduler(() => this.doSave(), 500));
    this._name = "";
    this._active = false;
    this._disabled = false;
    this._name = name;
    this._icon = icon;
    this._flags = flags;
    this._workspaces = workspaces;
    this._active = isActive;
    this._register(this.onDidChange((e) => {
      if (!e.message) {
        this.validate();
      }
      this.save();
    }));
    this._register(this.extensionManagementService.onProfileAwareDidInstallExtensions((results) => {
      const profile = this.getProfileToWatch();
      if (profile && results.some((r) => !r.error && (r.applicationScoped || this.uriIdentityService.extUri.isEqual(r.profileLocation, profile.extensionsResource)))) {
        this._onDidChange.fire({ extensions: true });
      }
    }));
    this._register(this.extensionManagementService.onProfileAwareDidUninstallExtension((e) => {
      const profile = this.getProfileToWatch();
      if (profile && !e.error && (e.applicationScoped || this.uriIdentityService.extUri.isEqual(e.profileLocation, profile.extensionsResource))) {
        this._onDidChange.fire({ extensions: true });
      }
    }));
    this._register(this.extensionManagementService.onProfileAwareDidUpdateExtensionMetadata((e) => {
      const profile = this.getProfileToWatch();
      if (profile && e.local.isApplicationScoped || this.uriIdentityService.extUri.isEqual(e.profileLocation, profile?.extensionsResource)) {
        this._onDidChange.fire({ extensions: true });
      }
    }));
  }
  get name() {
    return this._name;
  }
  set name(name) {
    name = name.trim();
    if (this._name !== name) {
      this._name = name;
      this._onDidChange.fire({ name: true });
    }
  }
  get icon() {
    return this._icon;
  }
  set icon(icon) {
    if (this._icon !== icon) {
      this._icon = icon;
      this._onDidChange.fire({ icon: true });
    }
  }
  get workspaces() {
    return this._workspaces;
  }
  set workspaces(workspaces) {
    if (!arrays.equals(this._workspaces, workspaces, (a, b) => a.toString() === b.toString())) {
      this._workspaces = workspaces;
      this._onDidChange.fire({ workspaces: true });
    }
  }
  get flags() {
    return this._flags;
  }
  set flags(flags) {
    if (!equals(this._flags, flags)) {
      this._flags = flags;
      this._onDidChange.fire({ flags: true });
    }
  }
  get active() {
    return this._active;
  }
  set active(active) {
    if (this._active !== active) {
      this._active = active;
      this._onDidChange.fire({ active: true });
    }
  }
  get message() {
    return this._message;
  }
  set message(message) {
    if (this._message !== message) {
      this._message = message;
      this._onDidChange.fire({ message: true });
    }
  }
  get disabled() {
    return this._disabled;
  }
  set disabled(saving) {
    if (this._disabled !== saving) {
      this._disabled = saving;
      this._onDidChange.fire({ disabled: true });
    }
  }
  getFlag(key) {
    return this.flags?.[key] ?? false;
  }
  setFlag(key, value) {
    const flags = this.flags ? { ...this.flags } : {};
    if (value) {
      flags[key] = true;
    } else {
      delete flags[key];
    }
    this.flags = flags;
  }
  validate() {
    if (!this.name) {
      this.message = localize("name required", "Profile name is required and must be a non-empty value.");
      return;
    }
    if (this.shouldValidateName() && this.name !== this.getInitialName() && this.userDataProfilesService.profiles.some((p) => p.name === this.name)) {
      this.message = localize("profileExists", "Profile with name {0} already exists.", this.name);
      return;
    }
    if (this.flags && this.flags.settings && this.flags.keybindings && this.flags.tasks && this.flags.snippets && this.flags.extensions) {
      this.message = localize("invalid configurations", "The profile should contain at least one configuration.");
      return;
    }
    this.message = void 0;
  }
  async getChildren(resourceType) {
    if (resourceType === void 0) {
      const resourceTypes = [
        ProfileResourceType.Settings,
        ProfileResourceType.Keybindings,
        ProfileResourceType.Tasks,
        ProfileResourceType.Mcp,
        ProfileResourceType.Snippets,
        ProfileResourceType.Extensions
      ];
      return Promise.all(resourceTypes.map(async (r) => {
        const children = r === ProfileResourceType.Settings || r === ProfileResourceType.Keybindings || r === ProfileResourceType.Tasks || r === ProfileResourceType.Mcp ? await this.getChildrenForResourceType(r) : [];
        return {
          handle: r,
          checkbox: void 0,
          resourceType: r,
          openAction: children.length ? toAction({
            id: "_open",
            label: localize("open", "Open to the Side"),
            class: ThemeIcon.asClassName(Codicon.goToFile),
            run: () => children[0]?.openAction?.run()
          }) : void 0
        };
      }));
    }
    return this.getChildrenForResourceType(resourceType);
  }
  async getChildrenForResourceType(resourceType) {
    return [];
  }
  async getChildrenFromProfile(profile, resourceType) {
    profile = this.getFlag(resourceType) ? this.userDataProfilesService.defaultProfile : profile;
    let children = [];
    switch (resourceType) {
      case ProfileResourceType.Settings:
        children = await this.instantiationService.createInstance(SettingsResourceTreeItem, profile).getChildren();
        break;
      case ProfileResourceType.Keybindings:
        children = await this.instantiationService.createInstance(KeybindingsResourceTreeItem, profile).getChildren();
        break;
      case ProfileResourceType.Snippets:
        children = await this.instantiationService.createInstance(SnippetsResourceTreeItem, profile).getChildren() ?? [];
        break;
      case ProfileResourceType.Tasks:
        children = await this.instantiationService.createInstance(TasksResourceTreeItem, profile).getChildren();
        break;
      case ProfileResourceType.Mcp:
        children = await this.instantiationService.createInstance(McpResourceTreeItem, profile).getChildren();
        break;
      case ProfileResourceType.Extensions:
        children = await this.instantiationService.createInstance(ExtensionsResourceExportTreeItem, profile).getChildren();
        break;
    }
    return children.map((child) => this.toUserDataProfileResourceChildElement(child));
  }
  toUserDataProfileResourceChildElement(child, primaryActions, contextMenuActions) {
    return {
      handle: child.handle,
      checkbox: child.checkbox,
      label: child.label ? isMarkdownString(child.label.label) ? child.label.label.value : child.label.label : "",
      description: isString(child.description) ? child.description : void 0,
      resource: URI.revive(child.resourceUri),
      icon: child.themeIcon,
      openAction: toAction({
        id: "_openChild",
        label: localize("open", "Open to the Side"),
        class: ThemeIcon.asClassName(Codicon.goToFile),
        run: async () => {
          if (child.parent.type === ProfileResourceType.Extensions) {
            await this.commandService.executeCommand("extension.open", child.handle, void 0, true, void 0, true);
          } else if (child.resourceUri) {
            await this.commandService.executeCommand(API_OPEN_EDITOR_COMMAND_ID, child.resourceUri, [SIDE_GROUP], void 0);
          }
        }
      }),
      actions: {
        primary: primaryActions,
        contextMenu: contextMenuActions
      }
    };
  }
  getInitialName() {
    return "";
  }
  shouldValidateName() {
    return true;
  }
  getCurrentWorkspace() {
    const workspace = this.workspaceContextService.getWorkspace();
    return workspace.configuration ?? workspace.folders[0]?.uri;
  }
  openWorkspace(workspace) {
    if (this.uriIdentityService.extUri.extname(workspace) === WORKSPACE_SUFFIX) {
      this.hostService.openWindow([{ workspaceUri: workspace }], { forceNewWindow: true });
    } else {
      this.hostService.openWindow([{ folderUri: workspace }], { forceNewWindow: true });
    }
  }
  save() {
    this.saveScheduler.schedule();
  }
  hasUnsavedChanges(profile) {
    if (this.name !== profile.name) {
      return true;
    }
    if (this.icon !== profile.icon) {
      return true;
    }
    if (!equals(this.flags ?? {}, profile.useDefaultFlags ?? {})) {
      return true;
    }
    if (!arrays.equals(this.workspaces ?? [], profile.workspaces ?? [], (a, b) => a.toString() === b.toString())) {
      return true;
    }
    return false;
  }
  async saveProfile(profile) {
    if (!this.hasUnsavedChanges(profile)) {
      return;
    }
    this.validate();
    if (this.message) {
      return;
    }
    const useDefaultFlags = this.flags ? this.flags.settings && this.flags.keybindings && this.flags.tasks && this.flags.globalState && this.flags.extensions ? void 0 : this.flags : void 0;
    return await this.userDataProfileManagementService.updateProfile(profile, {
      name: this.name,
      icon: this.icon,
      useDefaultFlags: profile.useDefaultFlags && !useDefaultFlags ? {} : useDefaultFlags,
      workspaces: this.workspaces
    });
  }
};
AbstractUserDataProfileElement = __decorateClass([
  __decorateParam(5, IUserDataProfileManagementService),
  __decorateParam(6, IUserDataProfilesService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IHostService),
  __decorateParam(10, IUriIdentityService),
  __decorateParam(11, IFileService),
  __decorateParam(12, IWorkbenchExtensionManagementService),
  __decorateParam(13, IInstantiationService)
], AbstractUserDataProfileElement);
let UserDataProfileElement = class extends AbstractUserDataProfileElement {
  constructor(_profile, titleButtons, actions, userDataProfileService, configurationService, userDataProfileManagementService, userDataProfilesService, commandService, workspaceContextService, hostService, uriIdentityService, fileService, extensionManagementService, instantiationService) {
    super(
      _profile.name,
      _profile.icon,
      _profile.useDefaultFlags,
      _profile.workspaces,
      userDataProfileService.currentProfile.id === _profile.id,
      userDataProfileManagementService,
      userDataProfilesService,
      commandService,
      workspaceContextService,
      hostService,
      uriIdentityService,
      fileService,
      extensionManagementService,
      instantiationService
    );
    this._profile = _profile;
    this.titleButtons = titleButtons;
    this.actions = actions;
    this.userDataProfileService = userDataProfileService;
    this.configurationService = configurationService;
    this._isNewWindowProfile = false;
    this._isNewWindowProfile = this.configurationService.getValue(CONFIG_NEW_WINDOW_PROFILE) === this.profile.name;
    this._register(configurationService.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration(CONFIG_NEW_WINDOW_PROFILE)) {
          this.isNewWindowProfile = this.configurationService.getValue(CONFIG_NEW_WINDOW_PROFILE) === this.profile.name;
        }
      }
    ));
    this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => this.active = this.userDataProfileService.currentProfile.id === this.profile.id));
    this._register(this.userDataProfilesService.onDidChangeProfiles(({ updated }) => {
      const profile = updated.find((p) => p.id === this.profile.id);
      if (profile) {
        this._profile = profile;
        this.reset();
        this._onDidChange.fire({ profile: true });
      }
    }));
    this._register(fileService.watch(this.profile.snippetsHome));
    this._register(fileService.onDidFilesChange((e) => {
      if (e.affects(this.profile.snippetsHome)) {
        this._onDidChange.fire({ snippets: true });
      }
    }));
  }
  get profile() {
    return this._profile;
  }
  getProfileToWatch() {
    return this.profile;
  }
  reset() {
    this.name = this._profile.name;
    this.icon = this._profile.icon;
    this.flags = this._profile.useDefaultFlags;
    this.workspaces = this._profile.workspaces;
  }
  updateWorkspaces(toAdd, toRemove) {
    const workspaces = new ResourceSet(this.workspaces ?? []);
    for (const workspace of toAdd) {
      workspaces.add(workspace);
    }
    for (const workspace of toRemove) {
      workspaces.delete(workspace);
    }
    this.workspaces = [...workspaces.values()];
  }
  async toggleNewWindowProfile() {
    if (this._isNewWindowProfile) {
      await this.configurationService.updateValue(CONFIG_NEW_WINDOW_PROFILE, null);
    } else {
      await this.configurationService.updateValue(CONFIG_NEW_WINDOW_PROFILE, this.profile.name);
    }
  }
  get isNewWindowProfile() {
    return this._isNewWindowProfile;
  }
  set isNewWindowProfile(isNewWindowProfile) {
    if (this._isNewWindowProfile !== isNewWindowProfile) {
      this._isNewWindowProfile = isNewWindowProfile;
      this._onDidChange.fire({ newWindowProfile: true });
    }
  }
  async toggleCurrentWindowProfile() {
    if (this.userDataProfileService.currentProfile.id === this.profile.id) {
      await this.userDataProfileManagementService.switchProfile(this.userDataProfilesService.defaultProfile);
    } else {
      await this.userDataProfileManagementService.switchProfile(this.profile);
    }
  }
  async doSave() {
    await this.saveProfile(this.profile);
  }
  async getChildrenForResourceType(resourceType) {
    if (resourceType === ProfileResourceType.Extensions) {
      const children = await this.instantiationService.createInstance(ExtensionsResourceExportTreeItem, this.profile).getChildren();
      return children.map((child) => this.toUserDataProfileResourceChildElement(
        child,
        void 0,
        [{
          id: "applyToAllProfiles",
          label: localize("applyToAllProfiles", "Apply Extension to all Profiles"),
          checked: child.applicationScoped,
          enabled: true,
          class: "",
          tooltip: "",
          run: async () => {
            const extensions = await this.extensionManagementService.getInstalled(void 0, this.profile.extensionsResource);
            const extension = extensions.find((e) => areSameExtensions(e.identifier, child.identifier));
            if (extension) {
              await this.extensionManagementService.toggleApplicationScope(extension, this.profile.extensionsResource);
            }
          }
        }]
      ));
    }
    return this.getChildrenFromProfile(this.profile, resourceType);
  }
  getInitialName() {
    return this.profile.name;
  }
};
UserDataProfileElement = __decorateClass([
  __decorateParam(3, IUserDataProfileService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IUserDataProfileManagementService),
  __decorateParam(6, IUserDataProfilesService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IHostService),
  __decorateParam(10, IUriIdentityService),
  __decorateParam(11, IFileService),
  __decorateParam(12, IWorkbenchExtensionManagementService),
  __decorateParam(13, IInstantiationService)
], UserDataProfileElement);
const USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME = "userdataprofiletemplatepreview";
let NewProfileElement = class extends AbstractUserDataProfileElement {
  constructor(copyFrom, titleButtons, actions, userDataProfileImportExportService, userDataProfileManagementService, userDataProfilesService, commandService, workspaceContextService, hostService, uriIdentityService, fileService, extensionManagementService, instantiationService) {
    super(
      "",
      void 0,
      void 0,
      void 0,
      false,
      userDataProfileManagementService,
      userDataProfilesService,
      commandService,
      workspaceContextService,
      hostService,
      uriIdentityService,
      fileService,
      extensionManagementService,
      instantiationService
    );
    this.titleButtons = titleButtons;
    this.actions = actions;
    this.userDataProfileImportExportService = userDataProfileImportExportService;
    this._copyFromTemplates = new ResourceMap();
    this.template = null;
    this.previewProfileWatchDisposables = this._register(new DisposableStore());
    this.name = this.defaultName = this.getNewProfileName();
    this._copyFrom = copyFrom;
    this._copyFlags = this.getCopyFlagsFrom(copyFrom);
    this.initialize();
    this._register(this.fileService.registerProvider(USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME, this._register(new InMemoryFileSystemProvider())));
    this._register(toDisposable(() => {
      if (this.previewProfile) {
        this.userDataProfilesService.removeProfile(this.previewProfile);
      }
    }));
  }
  get copyFromTemplates() {
    return this._copyFromTemplates;
  }
  get copyFrom() {
    return this._copyFrom;
  }
  set copyFrom(copyFrom) {
    if (this._copyFrom !== copyFrom) {
      this._copyFrom = copyFrom;
      this._onDidChange.fire({ copyFrom: true });
      this.flags = void 0;
      this.copyFlags = this.getCopyFlagsFrom(copyFrom);
      if (copyFrom instanceof URI) {
        this.templatePromise?.cancel();
        this.templatePromise = void 0;
      }
      this.initialize();
    }
  }
  get copyFlags() {
    return this._copyFlags;
  }
  set copyFlags(flags) {
    if (!equals(this._copyFlags, flags)) {
      this._copyFlags = flags;
      this._onDidChange.fire({ copyFlags: true });
    }
  }
  get previewProfile() {
    return this._previewProfile;
  }
  set previewProfile(profile) {
    if (this._previewProfile !== profile) {
      this._previewProfile = profile;
      this._onDidChange.fire({ preview: true });
      this.previewProfileWatchDisposables.clear();
      if (this._previewProfile) {
        this.previewProfileWatchDisposables.add(this.fileService.watch(this._previewProfile.snippetsHome));
        this.previewProfileWatchDisposables.add(this.fileService.onDidFilesChange((e) => {
          if (!this._previewProfile) {
            return;
          }
          if (e.affects(this._previewProfile.snippetsHome)) {
            this._onDidChange.fire({ snippets: true });
          }
        }));
      }
    }
  }
  getProfileToWatch() {
    return this.previewProfile;
  }
  getCopyFlagsFrom(copyFrom) {
    return copyFrom ? {
      settings: true,
      keybindings: true,
      snippets: true,
      tasks: true,
      extensions: true,
      mcp: true
    } : void 0;
  }
  async initialize() {
    this.disabled = true;
    try {
      if (this.copyFrom instanceof URI) {
        await this.resolveTemplate(this.copyFrom);
        if (this.template) {
          this.copyFromTemplates.set(this.copyFrom, this.template.name);
          if (this.defaultName === this.name) {
            this.name = this.defaultName = this.template.name ?? "";
          }
          if (this.defaultIcon === this.icon) {
            this.icon = this.defaultIcon = this.template.icon;
          }
          this.setCopyFlag(ProfileResourceType.Settings, !!this.template.settings);
          this.setCopyFlag(ProfileResourceType.Keybindings, !!this.template.keybindings);
          this.setCopyFlag(ProfileResourceType.Tasks, !!this.template.tasks);
          this.setCopyFlag(ProfileResourceType.Snippets, !!this.template.snippets);
          this.setCopyFlag(ProfileResourceType.Extensions, !!this.template.extensions);
          this.setCopyFlag(ProfileResourceType.Mcp, !!this.template.mcp);
          this._onDidChange.fire({ copyFromInfo: true });
        }
        return;
      }
      if (isUserDataProfile(this.copyFrom)) {
        if (this.defaultName === this.name) {
          this.name = this.defaultName = localize("copy from", "{0} (Copy)", this.copyFrom.name);
        }
        if (this.defaultIcon === this.icon) {
          this.icon = this.defaultIcon = this.copyFrom.icon;
        }
        this.setCopyFlag(ProfileResourceType.Settings, true);
        this.setCopyFlag(ProfileResourceType.Keybindings, true);
        this.setCopyFlag(ProfileResourceType.Tasks, true);
        this.setCopyFlag(ProfileResourceType.Snippets, true);
        this.setCopyFlag(ProfileResourceType.Extensions, true);
        this.setCopyFlag(ProfileResourceType.Mcp, true);
        this._onDidChange.fire({ copyFromInfo: true });
        return;
      }
      if (this.defaultName === this.name) {
        this.name = this.defaultName = this.getNewProfileName();
      }
      if (this.defaultIcon === this.icon) {
        this.icon = this.defaultIcon = void 0;
      }
      this.setCopyFlag(ProfileResourceType.Settings, false);
      this.setCopyFlag(ProfileResourceType.Keybindings, false);
      this.setCopyFlag(ProfileResourceType.Tasks, false);
      this.setCopyFlag(ProfileResourceType.Snippets, false);
      this.setCopyFlag(ProfileResourceType.Extensions, false);
      this.setCopyFlag(ProfileResourceType.Mcp, false);
      this._onDidChange.fire({ copyFromInfo: true });
    } finally {
      this.disabled = false;
    }
  }
  getNewProfileName() {
    const name = localize("untitled", "Untitled");
    const nameRegEx = new RegExp(`${name}\\s(\\d+)`);
    let nameIndex = 0;
    for (const profile of this.userDataProfilesService.profiles) {
      const matches = nameRegEx.exec(profile.name);
      const index = matches ? parseInt(matches[1]) : 0;
      nameIndex = index > nameIndex ? index : nameIndex;
    }
    return `${name} ${nameIndex + 1}`;
  }
  async resolveTemplate(uri) {
    if (!this.templatePromise) {
      this.templatePromise = createCancelablePromise(async (token) => {
        const template = await this.userDataProfileImportExportService.resolveProfileTemplate(uri);
        if (!token.isCancellationRequested) {
          this.template = template;
        }
      });
    }
    await this.templatePromise;
    return this.template;
  }
  hasResource(resourceType) {
    if (this.template) {
      switch (resourceType) {
        case ProfileResourceType.Settings:
          return !!this.template.settings;
        case ProfileResourceType.Keybindings:
          return !!this.template.keybindings;
        case ProfileResourceType.Snippets:
          return !!this.template.snippets;
        case ProfileResourceType.Tasks:
          return !!this.template.tasks;
        case ProfileResourceType.Extensions:
          return !!this.template.extensions;
      }
    }
    return true;
  }
  getCopyFlag(key) {
    return this.copyFlags?.[key] ?? false;
  }
  setCopyFlag(key, value) {
    const flags = this.copyFlags ? { ...this.copyFlags } : {};
    flags[key] = value;
    this.copyFlags = flags;
  }
  getCopyFromName() {
    if (isUserDataProfile(this.copyFrom)) {
      return this.copyFrom.name;
    }
    if (this.copyFrom instanceof URI) {
      return this.copyFromTemplates.get(this.copyFrom);
    }
    return void 0;
  }
  async getChildrenForResourceType(resourceType) {
    if (this.getFlag(resourceType)) {
      return this.getChildrenFromProfile(this.userDataProfilesService.defaultProfile, resourceType);
    }
    if (!this.getCopyFlag(resourceType)) {
      return [];
    }
    if (this.previewProfile) {
      return this.getChildrenFromProfile(this.previewProfile, resourceType);
    }
    if (this.copyFrom instanceof URI) {
      await this.resolveTemplate(this.copyFrom);
      if (!this.template) {
        return [];
      }
      return this.getChildrenFromProfileTemplate(this.template, resourceType);
    }
    if (this.copyFrom) {
      return this.getChildrenFromProfile(this.copyFrom, resourceType);
    }
    return [];
  }
  async getChildrenFromProfileTemplate(profileTemplate, resourceType) {
    const location = URI.from({ scheme: USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME, path: `/root/profiles/${profileTemplate.name}` });
    const cacheLocation = URI.from({ scheme: USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME, path: `/root/cache/${profileTemplate.name}` });
    const profile = toUserDataProfile(generateUuid(), this.name, location, cacheLocation);
    switch (resourceType) {
      case ProfileResourceType.Settings:
        if (profileTemplate.settings) {
          await this.instantiationService.createInstance(SettingsResource).apply(profileTemplate.settings, profile);
          return this.getChildrenFromProfile(profile, resourceType);
        }
        return [];
      case ProfileResourceType.Keybindings:
        if (profileTemplate.keybindings) {
          await this.instantiationService.createInstance(KeybindingsResource).apply(profileTemplate.keybindings, profile);
          return this.getChildrenFromProfile(profile, resourceType);
        }
        return [];
      case ProfileResourceType.Snippets:
        if (profileTemplate.snippets) {
          await this.instantiationService.createInstance(SnippetsResource).apply(profileTemplate.snippets, profile);
          return this.getChildrenFromProfile(profile, resourceType);
        }
        return [];
      case ProfileResourceType.Tasks:
        if (profileTemplate.tasks) {
          await this.instantiationService.createInstance(TasksResource).apply(profileTemplate.tasks, profile);
          return this.getChildrenFromProfile(profile, resourceType);
        }
        return [];
      case ProfileResourceType.Mcp:
        if (profileTemplate.mcp) {
          await this.instantiationService.createInstance(McpProfileResource).apply(profileTemplate.mcp, profile);
          return this.getChildrenFromProfile(profile, resourceType);
        }
        return [];
      case ProfileResourceType.Extensions:
        if (profileTemplate.extensions) {
          const children = await this.instantiationService.createInstance(ExtensionsResourceImportTreeItem, profileTemplate.extensions).getChildren();
          return children.map((child) => this.toUserDataProfileResourceChildElement(child));
        }
        return [];
    }
    return [];
  }
  shouldValidateName() {
    return !this.copyFrom;
  }
  getInitialName() {
    return this.previewProfile?.name ?? "";
  }
  async doSave() {
    if (this.previewProfile) {
      const profile = await this.saveProfile(this.previewProfile);
      if (profile) {
        this.previewProfile = profile;
      }
    }
  }
};
NewProfileElement = __decorateClass([
  __decorateParam(3, IUserDataProfileImportExportService),
  __decorateParam(4, IUserDataProfileManagementService),
  __decorateParam(5, IUserDataProfilesService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IWorkspaceContextService),
  __decorateParam(8, IHostService),
  __decorateParam(9, IUriIdentityService),
  __decorateParam(10, IFileService),
  __decorateParam(11, IWorkbenchExtensionManagementService),
  __decorateParam(12, IInstantiationService)
], NewProfileElement);
let UserDataProfilesEditorModel = class extends EditorModel {
  constructor(userDataProfileService, userDataProfilesService, userDataProfileManagementService, userDataProfileImportExportService, dialogService, telemetryService, hostService, productService, openerService, instantiationService) {
    super();
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.userDataProfileManagementService = userDataProfileManagementService;
    this.userDataProfileImportExportService = userDataProfileImportExportService;
    this.dialogService = dialogService;
    this.telemetryService = telemetryService;
    this.hostService = hostService;
    this.productService = productService;
    this.openerService = openerService;
    this.instantiationService = instantiationService;
    this._profiles = [];
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    for (const profile of userDataProfilesService.profiles) {
      if (!profile.isInternal) {
        this._profiles.push(this.createProfileElement(profile));
      }
    }
    this._register(toDisposable(() => this._profiles.splice(0, this._profiles.length).map(([, disposables]) => disposables.dispose())));
    this._register(userDataProfilesService.onDidChangeProfiles((e) => this.onDidChangeProfiles(e)));
  }
  static getInstance(instantiationService) {
    if (!UserDataProfilesEditorModel.INSTANCE) {
      UserDataProfilesEditorModel.INSTANCE = instantiationService.createInstance(UserDataProfilesEditorModel);
    }
    return UserDataProfilesEditorModel.INSTANCE;
  }
  get profiles() {
    return this._profiles.map(([profile]) => profile).sort((a, b) => {
      if (a instanceof NewProfileElement) {
        return 1;
      }
      if (b instanceof NewProfileElement) {
        return -1;
      }
      if (a instanceof UserDataProfileElement && a.profile.isDefault) {
        return -1;
      }
      if (b instanceof UserDataProfileElement && b.profile.isDefault) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }
  onDidChangeProfiles(e) {
    let changed = false;
    for (const profile of e.added) {
      if (!profile.isInternal && profile.name !== this.newProfileElement?.name) {
        changed = true;
        this._profiles.push(this.createProfileElement(profile));
      }
    }
    for (const profile of e.removed) {
      if (profile.id === this.newProfileElement?.previewProfile?.id) {
        this.newProfileElement.previewProfile = void 0;
      }
      const index = this._profiles.findIndex(([p]) => p instanceof UserDataProfileElement && p.profile.id === profile.id);
      if (index !== -1) {
        changed = true;
        this._profiles.splice(index, 1).map(([, disposables]) => disposables.dispose());
      }
    }
    if (changed) {
      this._onDidChange.fire(void 0);
    }
  }
  getTemplates() {
    if (!this.templates) {
      this.templates = this.userDataProfileManagementService.getBuiltinProfileTemplates();
    }
    return this.templates;
  }
  createProfileElement(profile) {
    const disposables = new DisposableStore();
    const activateAction = disposables.add(new Action(
      "userDataProfile.activate",
      localize("active", "Use this Profile for Current Window"),
      ThemeIcon.asClassName(Codicon.check),
      true,
      () => this.userDataProfileManagementService.switchProfile(profileElement.profile)
    ));
    const copyFromProfileAction = disposables.add(new Action(
      "userDataProfile.copyFromProfile",
      localize("copyFromProfile", "Duplicate..."),
      ThemeIcon.asClassName(Codicon.copy),
      true,
      () => this.createNewProfile(profileElement.profile)
    ));
    const exportAction = disposables.add(new Action(
      "userDataProfile.export",
      localize("export", "Export..."),
      ThemeIcon.asClassName(Codicon.export),
      true,
      () => this.userDataProfileImportExportService.exportProfile(profile)
    ));
    const deleteAction = disposables.add(new Action(
      "userDataProfile.delete",
      localize("delete", "Delete"),
      ThemeIcon.asClassName(Codicon.trash),
      true,
      () => this.removeProfile(profileElement.profile)
    ));
    const newWindowAction = disposables.add(new Action(
      "userDataProfile.newWindow",
      localize("open new window", "Open New Window with this Profile"),
      ThemeIcon.asClassName(Codicon.emptyWindow),
      true,
      () => this.openWindow(profileElement.profile)
    ));
    const primaryActions = [];
    primaryActions.push(activateAction);
    primaryActions.push(newWindowAction);
    const secondaryActions = [];
    secondaryActions.push(copyFromProfileAction);
    secondaryActions.push(exportAction);
    if (!profile.isDefault) {
      secondaryActions.push(new Separator());
      secondaryActions.push(deleteAction);
    }
    const profileElement = disposables.add(this.instantiationService.createInstance(
      UserDataProfileElement,
      profile,
      [[], []],
      [primaryActions, secondaryActions]
    ));
    activateAction.enabled = this.userDataProfileService.currentProfile.id !== profileElement.profile.id;
    disposables.add(this.userDataProfileService.onDidChangeCurrentProfile(() => activateAction.enabled = this.userDataProfileService.currentProfile.id !== profileElement.profile.id));
    return [profileElement, disposables];
  }
  async createNewProfile(copyFrom) {
    if (this.newProfileElement) {
      const result = await this.dialogService.confirm({
        type: "info",
        message: localize("new profile exists", "A new profile is already being created. Do you want to discard it and create a new one?"),
        primaryButton: localize("discard", "Discard & Create"),
        cancelButton: localize("cancel", "Cancel")
      });
      if (!result.confirmed) {
        return;
      }
      this.revert();
    }
    if (copyFrom instanceof URI) {
      try {
        await this.userDataProfileImportExportService.resolveProfileTemplate(copyFrom);
      } catch (error) {
        this.dialogService.error(getErrorMessage(error));
        return;
      }
    }
    if (!this.newProfileElement) {
      const disposables = new DisposableStore();
      const cancellationTokenSource = new CancellationTokenSource();
      disposables.add(toDisposable(() => cancellationTokenSource.dispose(true)));
      const primaryActions = [];
      const secondaryActions = [];
      const createAction = disposables.add(new Action(
        "userDataProfile.create",
        localize("create", "Create"),
        void 0,
        true,
        () => this.saveNewProfile(false, cancellationTokenSource.token)
      ));
      primaryActions.push(createAction);
      if (isWeb && copyFrom instanceof URI && isProfileURL(copyFrom)) {
        primaryActions.push(disposables.add(new Action(
          "userDataProfile.createInDesktop",
          localize("import in desktop", "Create in {0}", this.productService.nameLong),
          void 0,
          true,
          () => this.openerService.open(copyFrom, { openExternal: true })
        )));
      }
      const cancelAction = disposables.add(new Action(
        "userDataProfile.cancel",
        localize("cancel", "Cancel"),
        ThemeIcon.asClassName(Codicon.trash),
        true,
        () => this.discardNewProfile()
      ));
      secondaryActions.push(cancelAction);
      const previewProfileAction = disposables.add(new Action(
        "userDataProfile.preview",
        localize("preview", "Preview"),
        ThemeIcon.asClassName(Codicon.openPreview),
        true,
        () => this.previewNewProfile(cancellationTokenSource.token)
      ));
      secondaryActions.push(previewProfileAction);
      const exportAction = disposables.add(new Action(
        "userDataProfile.export",
        localize("export", "Export..."),
        ThemeIcon.asClassName(Codicon.export),
        isUserDataProfile(copyFrom),
        () => this.exportNewProfile(cancellationTokenSource.token)
      ));
      this.newProfileElement = disposables.add(this.instantiationService.createInstance(
        NewProfileElement,
        copyFrom,
        [primaryActions, secondaryActions],
        [[cancelAction], [exportAction]]
      ));
      const updateCreateActionLabel = () => {
        if (createAction.enabled) {
          if (this.newProfileElement?.copyFrom && this.userDataProfilesService.profiles.some((p) => !p.isInternal && p.name === this.newProfileElement?.name)) {
            createAction.label = localize("replace", "Replace");
          } else {
            createAction.label = localize("create", "Create");
          }
        }
      };
      updateCreateActionLabel();
      disposables.add(this.newProfileElement.onDidChange((e) => {
        if (e.preview || e.disabled || e.message) {
          createAction.enabled = !this.newProfileElement?.disabled && !this.newProfileElement?.message;
          previewProfileAction.enabled = !this.newProfileElement?.previewProfile && !this.newProfileElement?.disabled && !this.newProfileElement?.message;
        }
        if (e.name || e.copyFrom) {
          updateCreateActionLabel();
          exportAction.enabled = isUserDataProfile(this.newProfileElement?.copyFrom);
        }
      }));
      disposables.add(this.userDataProfilesService.onDidChangeProfiles((e) => {
        updateCreateActionLabel();
        this.newProfileElement?.validate();
      }));
      this._profiles.push([this.newProfileElement, disposables]);
      this._onDidChange.fire(this.newProfileElement);
    }
    return this.newProfileElement;
  }
  revert() {
    this.removeNewProfile();
    this._onDidChange.fire(void 0);
  }
  removeNewProfile() {
    if (this.newProfileElement) {
      const index = this._profiles.findIndex(([p]) => p === this.newProfileElement);
      if (index !== -1) {
        this._profiles.splice(index, 1).map(([, disposables]) => disposables.dispose());
      }
      this.newProfileElement = void 0;
    }
  }
  async previewNewProfile(token) {
    if (!this.newProfileElement) {
      return;
    }
    if (this.newProfileElement.previewProfile) {
      return;
    }
    const profile = await this.saveNewProfile(true, token);
    if (profile) {
      this.newProfileElement.previewProfile = profile;
      if (isWeb) {
        await this.userDataProfileManagementService.switchProfile(profile);
      } else {
        await this.openWindow(profile);
      }
    }
  }
  async exportNewProfile(token) {
    if (!this.newProfileElement) {
      return;
    }
    if (!isUserDataProfile(this.newProfileElement.copyFrom)) {
      return;
    }
    const profile = toUserDataProfile(
      generateUuid(),
      this.newProfileElement.name,
      this.newProfileElement.copyFrom.location,
      this.newProfileElement.copyFrom.cacheHome,
      {
        icon: this.newProfileElement.icon,
        useDefaultFlags: this.newProfileElement.flags
      },
      this.userDataProfilesService.defaultProfile
    );
    await this.userDataProfileImportExportService.exportProfile(profile, this.newProfileElement.copyFlags);
  }
  async saveNewProfile(transient, token) {
    if (!this.newProfileElement) {
      return void 0;
    }
    this.newProfileElement.validate();
    if (this.newProfileElement.message) {
      return void 0;
    }
    this.newProfileElement.disabled = true;
    let profile;
    try {
      if (this.newProfileElement.previewProfile) {
        if (!transient) {
          profile = await this.userDataProfileManagementService.updateProfile(this.newProfileElement.previewProfile, { transient: false });
        }
      } else {
        const { flags, icon, name, copyFrom } = this.newProfileElement;
        const useDefaultFlags = flags ? flags.settings && flags.keybindings && flags.tasks && flags.globalState && flags.extensions ? void 0 : flags : void 0;
        const createProfileTelemetryData = { source: copyFrom instanceof URI ? "template" : isUserDataProfile(copyFrom) ? "profile" : copyFrom ? "external" : void 0 };
        if (copyFrom instanceof URI) {
          const template = await this.newProfileElement.resolveTemplate(copyFrom);
          if (template) {
            this.telemetryService.publicLog2("userDataProfile.createFromTemplate", createProfileTelemetryData);
            profile = await this.userDataProfileImportExportService.createProfileFromTemplate(
              template,
              {
                name,
                useDefaultFlags,
                icon,
                resourceTypeFlags: this.newProfileElement.copyFlags,
                transient
              },
              token ?? CancellationToken.None
            );
          }
        } else if (isUserDataProfile(copyFrom)) {
          profile = await this.userDataProfileImportExportService.createFromProfile(
            copyFrom,
            {
              name,
              useDefaultFlags,
              icon,
              resourceTypeFlags: this.newProfileElement.copyFlags,
              transient
            },
            token ?? CancellationToken.None
          );
        } else {
          profile = await this.userDataProfileManagementService.createProfile(name, { useDefaultFlags, icon, transient });
        }
      }
    } finally {
      if (this.newProfileElement) {
        this.newProfileElement.disabled = false;
      }
    }
    if (token?.isCancellationRequested) {
      if (profile) {
        try {
          await this.userDataProfileManagementService.removeProfile(profile);
        } catch (error) {
        }
      }
      return;
    }
    if (profile && !profile.isInternal && this.newProfileElement) {
      this.removeNewProfile();
      const existing = this._profiles.find(([p]) => p.name === profile.name);
      if (existing) {
        this._onDidChange.fire(existing[0]);
      } else {
        this.onDidChangeProfiles({ added: [profile], removed: [], updated: [], all: this.userDataProfilesService.profiles });
      }
    }
    return profile;
  }
  async discardNewProfile() {
    if (!this.newProfileElement) {
      return;
    }
    if (this.newProfileElement.previewProfile) {
      await this.userDataProfileManagementService.removeProfile(this.newProfileElement.previewProfile);
      return;
    }
    this.removeNewProfile();
    this._onDidChange.fire(void 0);
  }
  async removeProfile(profile) {
    const result = await this.dialogService.confirm({
      type: "info",
      message: localize("deleteProfile", "Are you sure you want to delete the profile '{0}'?", profile.name),
      primaryButton: localize("delete", "Delete"),
      cancelButton: localize("cancel", "Cancel")
    });
    if (result.confirmed) {
      await this.userDataProfileManagementService.removeProfile(profile);
    }
  }
  async openWindow(profile) {
    await this.hostService.openWindow({ forceProfile: profile.name });
  }
};
UserDataProfilesEditorModel = __decorateClass([
  __decorateParam(0, IUserDataProfileService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IUserDataProfileManagementService),
  __decorateParam(3, IUserDataProfileImportExportService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, IHostService),
  __decorateParam(7, IProductService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IInstantiationService)
], UserDataProfilesEditorModel);
export {
  AbstractUserDataProfileElement,
  NewProfileElement,
  UserDataProfileElement,
  UserDataProfilesEditorModel,
  isProfileResourceChildElement,
  isProfileResourceTypeElement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3VzZXJEYXRhUHJvZmlsZS9icm93c2VyL3VzZXJEYXRhUHJvZmlsZXNFZGl0b3JNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgU2VwYXJhdG9yLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc01hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IERpZENoYW5nZVByb2ZpbGVzRXZlbnQsIGlzVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIFByb2ZpbGVSZXNvdXJjZVR5cGUsIFByb2ZpbGVSZXNvdXJjZVR5cGVGbGFncywgdG9Vc2VyRGF0YVByb2ZpbGUsIFVzZURlZmF1bHRQcm9maWxlRmxhZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJUHJvZmlsZVJlc291cmNlQ2hpbGRUcmVlSXRlbSwgSVByb2ZpbGVUZW1wbGF0ZUluZm8sIGlzUHJvZmlsZVVSTCwgSVVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UsIElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSwgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIElVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBhcnJheXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZXNvdXJjZUV4cG9ydFRyZWVJdGVtLCBFeHRlbnNpb25zUmVzb3VyY2VJbXBvcnRUcmVlSXRlbSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9icm93c2VyL2V4dGVuc2lvbnNSZXNvdXJjZS5qcyc7XG5pbXBvcnQgeyBTZXR0aW5nc1Jlc291cmNlLCBTZXR0aW5nc1Jlc291cmNlVHJlZUl0ZW0gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvYnJvd3Nlci9zZXR0aW5nc1Jlc291cmNlLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVzb3VyY2UsIEtleWJpbmRpbmdzUmVzb3VyY2VUcmVlSXRlbSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9icm93c2VyL2tleWJpbmRpbmdzUmVzb3VyY2UuanMnO1xuaW1wb3J0IHsgVGFza3NSZXNvdXJjZSwgVGFza3NSZXNvdXJjZVRyZWVJdGVtIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2Jyb3dzZXIvdGFza3NSZXNvdXJjZS5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0c1Jlc291cmNlLCBTbmlwcGV0c1Jlc291cmNlVHJlZUl0ZW0gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvYnJvd3Nlci9zbmlwcGV0c1Jlc291cmNlLmpzJztcbmltcG9ydCB7IE1jcFByb2ZpbGVSZXNvdXJjZSwgTWNwUmVzb3VyY2VUcmVlSXRlbSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9icm93c2VyL21jcFByb2ZpbGVSZXNvdXJjZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVHJlZUl0ZW1DaGVja2JveFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IEFQSV9PUEVOX0VESVRPUl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDT05GSUdfTkVXX1dJTkRPV19QUk9GSUxFIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAsIFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXT1JLU1BBQ0VfU1VGRklYIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5cbmV4cG9ydCB0eXBlIENoYW5nZUV2ZW50ID0ge1xuXHRyZWFkb25seSBuYW1lPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaWNvbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGZsYWdzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgd29ya3NwYWNlcz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGFjdGl2ZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1lc3NhZ2U/OiBib29sZWFuO1xuXHRyZWFkb25seSBjb3B5RnJvbT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvcHlGcm9tSW5mbz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvcHlGbGFncz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHByZXZpZXc/OiBib29sZWFuO1xuXHRyZWFkb25seSBwcm9maWxlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZXh0ZW5zaW9ucz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNuaXBwZXRzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGlzYWJsZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBuZXdXaW5kb3dQcm9maWxlPzogYm9vbGVhbjtcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb2ZpbGVDaGlsZEVsZW1lbnQge1xuXHRyZWFkb25seSBoYW5kbGU6IHN0cmluZztcblx0cmVhZG9ubHkgb3BlbkFjdGlvbj86IElBY3Rpb247XG5cdHJlYWRvbmx5IGFjdGlvbnM/OiB7XG5cdFx0cmVhZG9ubHkgcHJpbWFyeT86IElBY3Rpb25bXTtcblx0XHRyZWFkb25seSBjb250ZXh0TWVudT86IElBY3Rpb25bXTtcblx0fTtcblx0cmVhZG9ubHkgY2hlY2tib3g/OiBJVHJlZUl0ZW1DaGVja2JveFN0YXRlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcm9maWxlUmVzb3VyY2VUeXBlRWxlbWVudCBleHRlbmRzIElQcm9maWxlQ2hpbGRFbGVtZW50IHtcblx0cmVhZG9ubHkgcmVzb3VyY2VUeXBlOiBQcm9maWxlUmVzb3VyY2VUeXBlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcm9maWxlUmVzb3VyY2VUeXBlQ2hpbGRFbGVtZW50IGV4dGVuZHMgSVByb2ZpbGVDaGlsZEVsZW1lbnQge1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb3VyY2U/OiBVUkk7XG5cdHJlYWRvbmx5IGljb24/OiBUaGVtZUljb247XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1Byb2ZpbGVSZXNvdXJjZVR5cGVFbGVtZW50KGVsZW1lbnQ6IElQcm9maWxlQ2hpbGRFbGVtZW50KTogZWxlbWVudCBpcyBJUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQge1xuXHRyZXR1cm4gKGVsZW1lbnQgYXMgSVByb2ZpbGVSZXNvdXJjZVR5cGVFbGVtZW50KS5yZXNvdXJjZVR5cGUgIT09IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUHJvZmlsZVJlc291cmNlQ2hpbGRFbGVtZW50KGVsZW1lbnQ6IElQcm9maWxlQ2hpbGRFbGVtZW50KTogZWxlbWVudCBpcyBJUHJvZmlsZVJlc291cmNlVHlwZUNoaWxkRWxlbWVudCB7XG5cdHJldHVybiAoZWxlbWVudCBhcyBJUHJvZmlsZVJlc291cmNlVHlwZUNoaWxkRWxlbWVudCkubGFiZWwgIT09IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzYXZlU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5kb1NhdmUoKSwgNTAwKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bmFtZTogc3RyaW5nLFxuXHRcdGljb246IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRmbGFnczogVXNlRGVmYXVsdFByb2ZpbGVGbGFncyB8IHVuZGVmaW5lZCxcblx0XHR3b3Jrc3BhY2VzOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCxcblx0XHRpc0FjdGl2ZTogYm9vbGVhbixcblx0XHRASVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZTogSVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9uYW1lID0gbmFtZTtcblx0XHR0aGlzLl9pY29uID0gaWNvbjtcblx0XHR0aGlzLl9mbGFncyA9IGZsYWdzO1xuXHRcdHRoaXMuX3dvcmtzcGFjZXMgPSB3b3Jrc3BhY2VzO1xuXHRcdHRoaXMuX2FjdGl2ZSA9IGlzQWN0aXZlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoIWUubWVzc2FnZSkge1xuXHRcdFx0XHR0aGlzLnZhbGlkYXRlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNhdmUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vblByb2ZpbGVBd2FyZURpZEluc3RhbGxFeHRlbnNpb25zKHJlc3VsdHMgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZmlsZSA9IHRoaXMuZ2V0UHJvZmlsZVRvV2F0Y2goKTtcblx0XHRcdGlmIChwcm9maWxlICYmIHJlc3VsdHMuc29tZShyID0+ICFyLmVycm9yICYmIChyLmFwcGxpY2F0aW9uU2NvcGVkIHx8IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHIucHJvZmlsZUxvY2F0aW9uLCBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSkpKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgZXh0ZW5zaW9uczogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vblByb2ZpbGVBd2FyZURpZFVuaW5zdGFsbEV4dGVuc2lvbihlID0+IHtcblx0XHRcdGNvbnN0IHByb2ZpbGUgPSB0aGlzLmdldFByb2ZpbGVUb1dhdGNoKCk7XG5cdFx0XHRpZiAocHJvZmlsZSAmJiAhZS5lcnJvciAmJiAoZS5hcHBsaWNhdGlvblNjb3BlZCB8fCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChlLnByb2ZpbGVMb2NhdGlvbiwgcHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgZXh0ZW5zaW9uczogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vblByb2ZpbGVBd2FyZURpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhKGUgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZmlsZSA9IHRoaXMuZ2V0UHJvZmlsZVRvV2F0Y2goKTtcblx0XHRcdGlmIChwcm9maWxlICYmIGUubG9jYWwuaXNBcHBsaWNhdGlvblNjb3BlZCB8fCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChlLnByb2ZpbGVMb2NhdGlvbiwgcHJvZmlsZT8uZXh0ZW5zaW9uc1Jlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgZXh0ZW5zaW9uczogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9uYW1lID0gJyc7XG5cdGdldCBuYW1lKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl9uYW1lOyB9XG5cdHNldCBuYW1lKG5hbWU6IHN0cmluZykge1xuXHRcdG5hbWUgPSBuYW1lLnRyaW0oKTtcblx0XHRpZiAodGhpcy5fbmFtZSAhPT0gbmFtZSkge1xuXHRcdFx0dGhpcy5fbmFtZSA9IG5hbWU7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgbmFtZTogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pY29uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldCBpY29uKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9pY29uOyB9XG5cdHNldCBpY29uKGljb246IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9pY29uICE9PSBpY29uKSB7XG5cdFx0XHR0aGlzLl9pY29uID0gaWNvbjtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBpY29uOiB0cnVlIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dvcmtzcGFjZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkO1xuXHRnZXQgd29ya3NwYWNlcygpOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl93b3Jrc3BhY2VzOyB9XG5cdHNldCB3b3Jrc3BhY2VzKHdvcmtzcGFjZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKCFhcnJheXMuZXF1YWxzKHRoaXMuX3dvcmtzcGFjZXMsIHdvcmtzcGFjZXMsIChhLCBiKSA9PiBhLnRvU3RyaW5nKCkgPT09IGIudG9TdHJpbmcoKSkpIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZXMgPSB3b3Jrc3BhY2VzO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IHdvcmtzcGFjZXM6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmxhZ3M6IFVzZURlZmF1bHRQcm9maWxlRmxhZ3MgfCB1bmRlZmluZWQ7XG5cdGdldCBmbGFncygpOiBVc2VEZWZhdWx0UHJvZmlsZUZsYWdzIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2ZsYWdzOyB9XG5cdHNldCBmbGFncyhmbGFnczogVXNlRGVmYXVsdFByb2ZpbGVGbGFncyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICghZXF1YWxzKHRoaXMuX2ZsYWdzLCBmbGFncykpIHtcblx0XHRcdHRoaXMuX2ZsYWdzID0gZmxhZ3M7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgZmxhZ3M6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aXZlOiBib29sZWFuID0gZmFsc2U7XG5cdGdldCBhY3RpdmUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9hY3RpdmU7IH1cblx0c2V0IGFjdGl2ZShhY3RpdmU6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5fYWN0aXZlICE9PSBhY3RpdmUpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZSA9IGFjdGl2ZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBhY3RpdmU6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQgbWVzc2FnZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fbWVzc2FnZTsgfVxuXHRzZXQgbWVzc2FnZShtZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGhpcy5fbWVzc2FnZSAhPT0gbWVzc2FnZSkge1xuXHRcdFx0dGhpcy5fbWVzc2FnZSA9IG1lc3NhZ2U7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgbWVzc2FnZTogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kaXNhYmxlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRnZXQgZGlzYWJsZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9kaXNhYmxlZDsgfVxuXHRzZXQgZGlzYWJsZWQoc2F2aW5nOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX2Rpc2FibGVkICE9PSBzYXZpbmcpIHtcblx0XHRcdHRoaXMuX2Rpc2FibGVkID0gc2F2aW5nO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGRpc2FibGVkOiB0cnVlIH0pO1xuXHRcdH1cblx0fVxuXG5cdGdldEZsYWcoa2V5OiBQcm9maWxlUmVzb3VyY2VUeXBlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZmxhZ3M/LltrZXldID8/IGZhbHNlO1xuXHR9XG5cblx0c2V0RmxhZyhrZXk6IFByb2ZpbGVSZXNvdXJjZVR5cGUsIHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgZmxhZ3MgPSB0aGlzLmZsYWdzID8geyAuLi50aGlzLmZsYWdzIH0gOiB7fTtcblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdGZsYWdzW2tleV0gPSB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZWxldGUgZmxhZ3Nba2V5XTtcblx0XHR9XG5cdFx0dGhpcy5mbGFncyA9IGZsYWdzO1xuXHR9XG5cblx0dmFsaWRhdGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm5hbWUpIHtcblx0XHRcdHRoaXMubWVzc2FnZSA9IGxvY2FsaXplKCduYW1lIHJlcXVpcmVkJywgXCJQcm9maWxlIG5hbWUgaXMgcmVxdWlyZWQgYW5kIG11c3QgYmUgYSBub24tZW1wdHkgdmFsdWUuXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5zaG91bGRWYWxpZGF0ZU5hbWUoKSAmJiB0aGlzLm5hbWUgIT09IHRoaXMuZ2V0SW5pdGlhbE5hbWUoKSAmJiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLnNvbWUocCA9PiBwLm5hbWUgPT09IHRoaXMubmFtZSkpIHtcblx0XHRcdHRoaXMubWVzc2FnZSA9IGxvY2FsaXplKCdwcm9maWxlRXhpc3RzJywgXCJQcm9maWxlIHdpdGggbmFtZSB7MH0gYWxyZWFkeSBleGlzdHMuXCIsIHRoaXMubmFtZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChcblx0XHRcdHRoaXMuZmxhZ3MgJiYgdGhpcy5mbGFncy5zZXR0aW5ncyAmJiB0aGlzLmZsYWdzLmtleWJpbmRpbmdzICYmIHRoaXMuZmxhZ3MudGFza3MgJiYgdGhpcy5mbGFncy5zbmlwcGV0cyAmJiB0aGlzLmZsYWdzLmV4dGVuc2lvbnNcblx0XHQpIHtcblx0XHRcdHRoaXMubWVzc2FnZSA9IGxvY2FsaXplKCdpbnZhbGlkIGNvbmZpZ3VyYXRpb25zJywgXCJUaGUgcHJvZmlsZSBzaG91bGQgY29udGFpbiBhdCBsZWFzdCBvbmUgY29uZmlndXJhdGlvbi5cIik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGdldENoaWxkcmVuKHJlc291cmNlVHlwZT86IFByb2ZpbGVSZXNvdXJjZVR5cGUpOiBQcm9taXNlPElQcm9maWxlQ2hpbGRFbGVtZW50W10+IHtcblx0XHRpZiAocmVzb3VyY2VUeXBlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlVHlwZXMgPSBbXG5cdFx0XHRcdFByb2ZpbGVSZXNvdXJjZVR5cGUuU2V0dGluZ3MsXG5cdFx0XHRcdFByb2ZpbGVSZXNvdXJjZVR5cGUuS2V5YmluZGluZ3MsXG5cdFx0XHRcdFByb2ZpbGVSZXNvdXJjZVR5cGUuVGFza3MsXG5cdFx0XHRcdFByb2ZpbGVSZXNvdXJjZVR5cGUuTWNwLFxuXHRcdFx0XHRQcm9maWxlUmVzb3VyY2VUeXBlLlNuaXBwZXRzLFxuXHRcdFx0XHRQcm9maWxlUmVzb3VyY2VUeXBlLkV4dGVuc2lvbnNcblx0XHRcdF07XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocmVzb3VyY2VUeXBlcy5tYXA8UHJvbWlzZTxJUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQ+Pihhc3luYyByID0+IHtcblx0XHRcdFx0Y29uc3QgY2hpbGRyZW4gPSAociA9PT0gUHJvZmlsZVJlc291cmNlVHlwZS5TZXR0aW5nc1xuXHRcdFx0XHRcdHx8IHIgPT09IFByb2ZpbGVSZXNvdXJjZVR5cGUuS2V5YmluZGluZ3Ncblx0XHRcdFx0XHR8fCByID09PSBQcm9maWxlUmVzb3VyY2VUeXBlLlRhc2tzXG5cdFx0XHRcdFx0fHwgciA9PT0gUHJvZmlsZVJlc291cmNlVHlwZS5NY3ApID8gYXdhaXQgdGhpcy5nZXRDaGlsZHJlbkZvclJlc291cmNlVHlwZShyKSA6IFtdO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGhhbmRsZTogcixcblx0XHRcdFx0XHRjaGVja2JveDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJlc291cmNlVHlwZTogcixcblx0XHRcdFx0XHRvcGVuQWN0aW9uOiBjaGlsZHJlbi5sZW5ndGhcblx0XHRcdFx0XHRcdD8gdG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRpZDogJ19vcGVuJyxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdvcGVuJywgXCJPcGVuIHRvIHRoZSBTaWRlXCIpLFxuXHRcdFx0XHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZ29Ub0ZpbGUpLFxuXHRcdFx0XHRcdFx0XHRydW46ICgpID0+IGNoaWxkcmVuWzBdPy5vcGVuQWN0aW9uPy5ydW4oKVxuXHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkXG5cdFx0XHRcdH07XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdldENoaWxkcmVuRm9yUmVzb3VyY2VUeXBlKHJlc291cmNlVHlwZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0Q2hpbGRyZW5Gb3JSZXNvdXJjZVR5cGUocmVzb3VyY2VUeXBlOiBQcm9maWxlUmVzb3VyY2VUeXBlKTogUHJvbWlzZTxJUHJvZmlsZUNoaWxkRWxlbWVudFtdPiB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldENoaWxkcmVuRnJvbVByb2ZpbGUocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSwgcmVzb3VyY2VUeXBlOiBQcm9maWxlUmVzb3VyY2VUeXBlKTogUHJvbWlzZTxJUHJvZmlsZVJlc291cmNlVHlwZUNoaWxkRWxlbWVudFtdPiB7XG5cdFx0cHJvZmlsZSA9IHRoaXMuZ2V0RmxhZyhyZXNvdXJjZVR5cGUpID8gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSA6IHByb2ZpbGU7XG5cdFx0bGV0IGNoaWxkcmVuOiBJUHJvZmlsZVJlc291cmNlQ2hpbGRUcmVlSXRlbVtdID0gW107XG5cdFx0c3dpdGNoIChyZXNvdXJjZVR5cGUpIHtcblx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5TZXR0aW5nczpcblx0XHRcdFx0Y2hpbGRyZW4gPSBhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzUmVzb3VyY2VUcmVlSXRlbSwgcHJvZmlsZSkuZ2V0Q2hpbGRyZW4oKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuS2V5YmluZGluZ3M6XG5cdFx0XHRcdGNoaWxkcmVuID0gYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShLZXliaW5kaW5nc1Jlc291cmNlVHJlZUl0ZW0sIHByb2ZpbGUpLmdldENoaWxkcmVuKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLlNuaXBwZXRzOlxuXHRcdFx0XHRjaGlsZHJlbiA9IChhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRzUmVzb3VyY2VUcmVlSXRlbSwgcHJvZmlsZSkuZ2V0Q2hpbGRyZW4oKSkgPz8gW107XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLlRhc2tzOlxuXHRcdFx0XHRjaGlsZHJlbiA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGFza3NSZXNvdXJjZVRyZWVJdGVtLCBwcm9maWxlKS5nZXRDaGlsZHJlbigpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5NY3A6XG5cdFx0XHRcdGNoaWxkcmVuID0gYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BSZXNvdXJjZVRyZWVJdGVtLCBwcm9maWxlKS5nZXRDaGlsZHJlbigpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5FeHRlbnNpb25zOlxuXHRcdFx0XHRjaGlsZHJlbiA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc1Jlc291cmNlRXhwb3J0VHJlZUl0ZW0sIHByb2ZpbGUpLmdldENoaWxkcmVuKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRyZXR1cm4gY2hpbGRyZW4ubWFwPElQcm9maWxlUmVzb3VyY2VUeXBlQ2hpbGRFbGVtZW50PihjaGlsZCA9PiB0aGlzLnRvVXNlckRhdGFQcm9maWxlUmVzb3VyY2VDaGlsZEVsZW1lbnQoY2hpbGQpKTtcblx0fVxuXG5cdHByb3RlY3RlZCB0b1VzZXJEYXRhUHJvZmlsZVJlc291cmNlQ2hpbGRFbGVtZW50KGNoaWxkOiBJUHJvZmlsZVJlc291cmNlQ2hpbGRUcmVlSXRlbSwgcHJpbWFyeUFjdGlvbnM/OiBJQWN0aW9uW10sIGNvbnRleHRNZW51QWN0aW9ucz86IElBY3Rpb25bXSk6IElQcm9maWxlUmVzb3VyY2VUeXBlQ2hpbGRFbGVtZW50IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aGFuZGxlOiBjaGlsZC5oYW5kbGUsXG5cdFx0XHRjaGVja2JveDogY2hpbGQuY2hlY2tib3gsXG5cdFx0XHRsYWJlbDogY2hpbGQubGFiZWwgPyAoaXNNYXJrZG93blN0cmluZyhjaGlsZC5sYWJlbC5sYWJlbCkgPyBjaGlsZC5sYWJlbC5sYWJlbC52YWx1ZSA6IGNoaWxkLmxhYmVsLmxhYmVsKSA6ICcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGlzU3RyaW5nKGNoaWxkLmRlc2NyaXB0aW9uKSA/IGNoaWxkLmRlc2NyaXB0aW9uIDogdW5kZWZpbmVkLFxuXHRcdFx0cmVzb3VyY2U6IFVSSS5yZXZpdmUoY2hpbGQucmVzb3VyY2VVcmkpLFxuXHRcdFx0aWNvbjogY2hpbGQudGhlbWVJY29uLFxuXHRcdFx0b3BlbkFjdGlvbjogdG9BY3Rpb24oe1xuXHRcdFx0XHRpZDogJ19vcGVuQ2hpbGQnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ29wZW4nLCBcIk9wZW4gdG8gdGhlIFNpZGVcIiksXG5cdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5nb1RvRmlsZSksXG5cdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChjaGlsZC5wYXJlbnQudHlwZSA9PT0gUHJvZmlsZVJlc291cmNlVHlwZS5FeHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdleHRlbnNpb24ub3BlbicsIGNoaWxkLmhhbmRsZSwgdW5kZWZpbmVkLCB0cnVlLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoY2hpbGQucmVzb3VyY2VVcmkpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQVBJX09QRU5fRURJVE9SX0NPTU1BTkRfSUQsIGNoaWxkLnJlc291cmNlVXJpLCBbU0lERV9HUk9VUF0sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0cHJpbWFyeTogcHJpbWFyeUFjdGlvbnMsXG5cdFx0XHRcdGNvbnRleHRNZW51OiBjb250ZXh0TWVudUFjdGlvbnMsXG5cdFx0XHR9XG5cdFx0fTtcblxuXHR9XG5cblx0Z2V0SW5pdGlhbE5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRzaG91bGRWYWxpZGF0ZU5hbWUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRnZXRDdXJyZW50V29ya3NwYWNlKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRyZXR1cm4gd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gPz8gd29ya3NwYWNlLmZvbGRlcnNbMF0/LnVyaTtcblx0fVxuXG5cdG9wZW5Xb3Jrc3BhY2Uod29ya3NwYWNlOiBVUkkpOiB2b2lkIHtcblx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmV4dG5hbWUod29ya3NwYWNlKSA9PT0gV09SS1NQQUNFX1NVRkZJWCkge1xuXHRcdFx0dGhpcy5ob3N0U2VydmljZS5vcGVuV2luZG93KFt7IHdvcmtzcGFjZVVyaTogd29ya3NwYWNlIH1dLCB7IGZvcmNlTmV3V2luZG93OiB0cnVlIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coW3sgZm9sZGVyVXJpOiB3b3Jrc3BhY2UgfV0sIHsgZm9yY2VOZXdXaW5kb3c6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0c2F2ZSgpOiB2b2lkIHtcblx0XHR0aGlzLnNhdmVTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgaGFzVW5zYXZlZENoYW5nZXMocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLm5hbWUgIT09IHByb2ZpbGUubmFtZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmljb24gIT09IHByb2ZpbGUuaWNvbikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghZXF1YWxzKHRoaXMuZmxhZ3MgPz8ge30sIHByb2ZpbGUudXNlRGVmYXVsdEZsYWdzID8/IHt9KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghYXJyYXlzLmVxdWFscyh0aGlzLndvcmtzcGFjZXMgPz8gW10sIHByb2ZpbGUud29ya3NwYWNlcyA/PyBbXSwgKGEsIGIpID0+IGEudG9TdHJpbmcoKSA9PT0gYi50b1N0cmluZygpKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBzYXZlUHJvZmlsZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLmhhc1Vuc2F2ZWRDaGFuZ2VzKHByb2ZpbGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMudmFsaWRhdGUoKTtcblx0XHRpZiAodGhpcy5tZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHVzZURlZmF1bHRGbGFnczogVXNlRGVmYXVsdFByb2ZpbGVGbGFncyB8IHVuZGVmaW5lZCA9IHRoaXMuZmxhZ3Ncblx0XHRcdD8gdGhpcy5mbGFncy5zZXR0aW5ncyAmJiB0aGlzLmZsYWdzLmtleWJpbmRpbmdzICYmIHRoaXMuZmxhZ3MudGFza3MgJiYgdGhpcy5mbGFncy5nbG9iYWxTdGF0ZSAmJiB0aGlzLmZsYWdzLmV4dGVuc2lvbnMgPyB1bmRlZmluZWQgOiB0aGlzLmZsYWdzXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdHJldHVybiBhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLnVwZGF0ZVByb2ZpbGUocHJvZmlsZSwge1xuXHRcdFx0bmFtZTogdGhpcy5uYW1lLFxuXHRcdFx0aWNvbjogdGhpcy5pY29uLFxuXHRcdFx0dXNlRGVmYXVsdEZsYWdzOiBwcm9maWxlLnVzZURlZmF1bHRGbGFncyAmJiAhdXNlRGVmYXVsdEZsYWdzID8ge30gOiB1c2VEZWZhdWx0RmxhZ3MsXG5cdFx0XHR3b3Jrc3BhY2VzOiB0aGlzLndvcmtzcGFjZXNcblx0XHR9KTtcblx0fVxuXG5cdGFic3RyYWN0IHJlYWRvbmx5IHRpdGxlQnV0dG9uczogW0FjdGlvbltdLCBBY3Rpb25bXV07XG5cdGFic3RyYWN0IHJlYWRvbmx5IGFjdGlvbnM6IFtJQWN0aW9uW10sIElBY3Rpb25bXV07XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGRvU2F2ZSgpOiBQcm9taXNlPHZvaWQ+O1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0UHJvZmlsZVRvV2F0Y2goKTogSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgZXh0ZW5kcyBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQge1xuXG5cdGdldCBwcm9maWxlKCk6IElVc2VyRGF0YVByb2ZpbGUgeyByZXR1cm4gdGhpcy5fcHJvZmlsZTsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX3Byb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsXG5cdFx0cmVhZG9ubHkgdGl0bGVCdXR0b25zOiBbQWN0aW9uW10sIEFjdGlvbltdXSxcblx0XHRyZWFkb25seSBhY3Rpb25zOiBbSUFjdGlvbltdLCBJQWN0aW9uW11dLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UgdXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Ugd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdF9wcm9maWxlLm5hbWUsXG5cdFx0XHRfcHJvZmlsZS5pY29uLFxuXHRcdFx0X3Byb2ZpbGUudXNlRGVmYXVsdEZsYWdzLFxuXHRcdFx0X3Byb2ZpbGUud29ya3NwYWNlcyxcblx0XHRcdHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaWQgPT09IF9wcm9maWxlLmlkLFxuXHRcdFx0dXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0XHR1c2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRcdGNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0XHRob3N0U2VydmljZSxcblx0XHRcdHVyaUlkZW50aXR5U2VydmljZSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0ZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHQpO1xuXHRcdHRoaXMuX2lzTmV3V2luZG93UHJvZmlsZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQ09ORklHX05FV19XSU5ET1dfUFJPRklMRSkgPT09IHRoaXMucHJvZmlsZS5uYW1lO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENPTkZJR19ORVdfV0lORE9XX1BST0ZJTEUpKSB7XG5cdFx0XHRcdHRoaXMuaXNOZXdXaW5kb3dQcm9maWxlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShDT05GSUdfTkVXX1dJTkRPV19QUk9GSUxFKSA9PT0gdGhpcy5wcm9maWxlLm5hbWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlKCgpID0+IHRoaXMuYWN0aXZlID0gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlkID09PSB0aGlzLnByb2ZpbGUuaWQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvZmlsZXMoKHsgdXBkYXRlZCB9KSA9PiB7XG5cdFx0XHRjb25zdCBwcm9maWxlID0gdXBkYXRlZC5maW5kKHAgPT4gcC5pZCA9PT0gdGhpcy5wcm9maWxlLmlkKTtcblx0XHRcdGlmIChwcm9maWxlKSB7XG5cdFx0XHRcdHRoaXMuX3Byb2ZpbGUgPSBwcm9maWxlO1xuXHRcdFx0XHR0aGlzLnJlc2V0KCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBwcm9maWxlOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihmaWxlU2VydmljZS53YXRjaCh0aGlzLnByb2ZpbGUuc25pcHBldHNIb21lKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHModGhpcy5wcm9maWxlLnNuaXBwZXRzSG9tZSkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IHNuaXBwZXRzOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRQcm9maWxlVG9XYXRjaCgpOiBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5wcm9maWxlO1xuXHR9XG5cblx0cmVzZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5uYW1lID0gdGhpcy5fcHJvZmlsZS5uYW1lO1xuXHRcdHRoaXMuaWNvbiA9IHRoaXMuX3Byb2ZpbGUuaWNvbjtcblx0XHR0aGlzLmZsYWdzID0gdGhpcy5fcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M7XG5cdFx0dGhpcy53b3Jrc3BhY2VzID0gdGhpcy5fcHJvZmlsZS53b3Jrc3BhY2VzO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZVdvcmtzcGFjZXModG9BZGQ6IFVSSVtdLCB0b1JlbW92ZTogVVJJW10pOiB2b2lkIHtcblx0XHRjb25zdCB3b3Jrc3BhY2VzID0gbmV3IFJlc291cmNlU2V0KHRoaXMud29ya3NwYWNlcyA/PyBbXSk7XG5cdFx0Zm9yIChjb25zdCB3b3Jrc3BhY2Ugb2YgdG9BZGQpIHtcblx0XHRcdHdvcmtzcGFjZXMuYWRkKHdvcmtzcGFjZSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgd29ya3NwYWNlIG9mIHRvUmVtb3ZlKSB7XG5cdFx0XHR3b3Jrc3BhY2VzLmRlbGV0ZSh3b3Jrc3BhY2UpO1xuXHRcdH1cblx0XHR0aGlzLndvcmtzcGFjZXMgPSBbLi4ud29ya3NwYWNlcy52YWx1ZXMoKV07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdG9nZ2xlTmV3V2luZG93UHJvZmlsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5faXNOZXdXaW5kb3dQcm9maWxlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKENPTkZJR19ORVdfV0lORE9XX1BST0ZJTEUsIG51bGwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKENPTkZJR19ORVdfV0lORE9XX1BST0ZJTEUsIHRoaXMucHJvZmlsZS5uYW1lKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc05ld1dpbmRvd1Byb2ZpbGU6IGJvb2xlYW4gPSBmYWxzZTtcblx0Z2V0IGlzTmV3V2luZG93UHJvZmlsZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2lzTmV3V2luZG93UHJvZmlsZTsgfVxuXHRzZXQgaXNOZXdXaW5kb3dQcm9maWxlKGlzTmV3V2luZG93UHJvZmlsZTogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9pc05ld1dpbmRvd1Byb2ZpbGUgIT09IGlzTmV3V2luZG93UHJvZmlsZSkge1xuXHRcdFx0dGhpcy5faXNOZXdXaW5kb3dQcm9maWxlID0gaXNOZXdXaW5kb3dQcm9maWxlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IG5ld1dpbmRvd1Byb2ZpbGU6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIHRvZ2dsZUN1cnJlbnRXaW5kb3dQcm9maWxlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaWQgPT09IHRoaXMucHJvZmlsZS5pZCkge1xuXHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZS5zd2l0Y2hQcm9maWxlKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLnN3aXRjaFByb2ZpbGUodGhpcy5wcm9maWxlKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZG9TYXZlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuc2F2ZVByb2ZpbGUodGhpcy5wcm9maWxlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBnZXRDaGlsZHJlbkZvclJlc291cmNlVHlwZShyZXNvdXJjZVR5cGU6IFByb2ZpbGVSZXNvdXJjZVR5cGUpOiBQcm9taXNlPElQcm9maWxlQ2hpbGRFbGVtZW50W10+IHtcblx0XHRpZiAocmVzb3VyY2VUeXBlID09PSBQcm9maWxlUmVzb3VyY2VUeXBlLkV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zUmVzb3VyY2VFeHBvcnRUcmVlSXRlbSwgdGhpcy5wcm9maWxlKS5nZXRDaGlsZHJlbigpO1xuXHRcdFx0cmV0dXJuIGNoaWxkcmVuLm1hcDxJUHJvZmlsZVJlc291cmNlVHlwZUNoaWxkRWxlbWVudD4oY2hpbGQgPT5cblx0XHRcdFx0dGhpcy50b1VzZXJEYXRhUHJvZmlsZVJlc291cmNlQ2hpbGRFbGVtZW50KFxuXHRcdFx0XHRcdGNoaWxkLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0aWQ6ICdhcHBseVRvQWxsUHJvZmlsZXMnLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhcHBseVRvQWxsUHJvZmlsZXMnLCBcIkFwcGx5IEV4dGVuc2lvbiB0byBhbGwgUHJvZmlsZXNcIiksXG5cdFx0XHRcdFx0XHRjaGVja2VkOiBjaGlsZC5hcHBsaWNhdGlvblNjb3BlZCxcblx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRjbGFzczogJycsXG5cdFx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQodW5kZWZpbmVkLCB0aGlzLnByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZXh0ZW5zaW9ucy5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBjaGlsZC5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnRvZ2dsZUFwcGxpY2F0aW9uU2NvcGUoZXh0ZW5zaW9uLCB0aGlzLnByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXRDaGlsZHJlbkZyb21Qcm9maWxlKHRoaXMucHJvZmlsZSwgcmVzb3VyY2VUeXBlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEluaXRpYWxOYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMucHJvZmlsZS5uYW1lO1xuXHR9XG5cbn1cblxuY29uc3QgVVNFUl9EQVRBX1BST0ZJTEVfVEVNUExBVEVfUFJFVklFV19TQ0hFTUUgPSAndXNlcmRhdGFwcm9maWxldGVtcGxhdGVwcmV2aWV3JztcblxuZXhwb3J0IGNsYXNzIE5ld1Byb2ZpbGVFbGVtZW50IGV4dGVuZHMgQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50IHtcblxuXHRwcml2YXRlIF9jb3B5RnJvbVRlbXBsYXRlcyA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCk7XG5cdGdldCBjb3B5RnJvbVRlbXBsYXRlcygpOiBSZXNvdXJjZU1hcDxzdHJpbmc+IHsgcmV0dXJuIHRoaXMuX2NvcHlGcm9tVGVtcGxhdGVzOyB9XG5cblx0cHJpdmF0ZSB0ZW1wbGF0ZVByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRlbXBsYXRlOiBJVXNlckRhdGFQcm9maWxlVGVtcGxhdGUgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIGRlZmF1bHROYW1lOiBzdHJpbmc7XG5cdHByaXZhdGUgZGVmYXVsdEljb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb3B5RnJvbTogVVJJIHwgSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCxcblx0XHRyZWFkb25seSB0aXRsZUJ1dHRvbnM6IFtBY3Rpb25bXSwgQWN0aW9uW11dLFxuXHRcdHJlYWRvbmx5IGFjdGlvbnM6IFtJQWN0aW9uW10sIElBY3Rpb25bXV0sXG5cblx0XHRASVVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHQnJyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZhbHNlLFxuXHRcdFx0dXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0XHR1c2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRcdGNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0XHRob3N0U2VydmljZSxcblx0XHRcdHVyaUlkZW50aXR5U2VydmljZSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0ZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHQpO1xuXHRcdHRoaXMubmFtZSA9IHRoaXMuZGVmYXVsdE5hbWUgPSB0aGlzLmdldE5ld1Byb2ZpbGVOYW1lKCk7XG5cdFx0dGhpcy5fY29weUZyb20gPSBjb3B5RnJvbTtcblx0XHR0aGlzLl9jb3B5RmxhZ3MgPSB0aGlzLmdldENvcHlGbGFnc0Zyb20oY29weUZyb20pO1xuXHRcdHRoaXMuaW5pdGlhbGl6ZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihVU0VSX0RBVEFfUFJPRklMRV9URU1QTEFURV9QUkVWSUVXX1NDSEVNRSwgdGhpcy5fcmVnaXN0ZXIobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnByZXZpZXdQcm9maWxlKSB7XG5cdFx0XHRcdHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucmVtb3ZlUHJvZmlsZSh0aGlzLnByZXZpZXdQcm9maWxlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb3B5RnJvbTogSVVzZXJEYXRhUHJvZmlsZSB8IFVSSSB8IHVuZGVmaW5lZDtcblx0Z2V0IGNvcHlGcm9tKCk6IElVc2VyRGF0YVByb2ZpbGUgfCBVUkkgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fY29weUZyb207IH1cblx0c2V0IGNvcHlGcm9tKGNvcHlGcm9tOiBJVXNlckRhdGFQcm9maWxlIHwgVVJJIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuX2NvcHlGcm9tICE9PSBjb3B5RnJvbSkge1xuXHRcdFx0dGhpcy5fY29weUZyb20gPSBjb3B5RnJvbTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBjb3B5RnJvbTogdHJ1ZSB9KTtcblx0XHRcdHRoaXMuZmxhZ3MgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmNvcHlGbGFncyA9IHRoaXMuZ2V0Q29weUZsYWdzRnJvbShjb3B5RnJvbSk7XG5cdFx0XHRpZiAoY29weUZyb20gaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdFx0dGhpcy50ZW1wbGF0ZVByb21pc2U/LmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLnRlbXBsYXRlUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuaW5pdGlhbGl6ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NvcHlGbGFnczogUHJvZmlsZVJlc291cmNlVHlwZUZsYWdzIHwgdW5kZWZpbmVkO1xuXHRnZXQgY29weUZsYWdzKCk6IFByb2ZpbGVSZXNvdXJjZVR5cGVGbGFncyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9jb3B5RmxhZ3M7IH1cblx0c2V0IGNvcHlGbGFncyhmbGFnczogUHJvZmlsZVJlc291cmNlVHlwZUZsYWdzIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKCFlcXVhbHModGhpcy5fY29weUZsYWdzLCBmbGFncykpIHtcblx0XHRcdHRoaXMuX2NvcHlGbGFncyA9IGZsYWdzO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGNvcHlGbGFnczogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHByZXZpZXdQcm9maWxlV2F0Y2hEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX3ByZXZpZXdQcm9maWxlOiBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkO1xuXHRnZXQgcHJldmlld1Byb2ZpbGUoKTogSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9wcmV2aWV3UHJvZmlsZTsgfVxuXHRzZXQgcHJldmlld1Byb2ZpbGUocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9wcmV2aWV3UHJvZmlsZSAhPT0gcHJvZmlsZSkge1xuXHRcdFx0dGhpcy5fcHJldmlld1Byb2ZpbGUgPSBwcm9maWxlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IHByZXZpZXc6IHRydWUgfSk7XG5cdFx0XHR0aGlzLnByZXZpZXdQcm9maWxlV2F0Y2hEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0aWYgKHRoaXMuX3ByZXZpZXdQcm9maWxlKSB7XG5cdFx0XHRcdHRoaXMucHJldmlld1Byb2ZpbGVXYXRjaERpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKHRoaXMuX3ByZXZpZXdQcm9maWxlLnNuaXBwZXRzSG9tZSkpO1xuXHRcdFx0XHR0aGlzLnByZXZpZXdQcm9maWxlV2F0Y2hEaXNwb3NhYmxlcy5hZGQodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRcdGlmICghdGhpcy5fcHJldmlld1Byb2ZpbGUpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGUuYWZmZWN0cyh0aGlzLl9wcmV2aWV3UHJvZmlsZS5zbmlwcGV0c0hvbWUpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgc25pcHBldHM6IHRydWUgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGdldFByb2ZpbGVUb1dhdGNoKCk6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnByZXZpZXdQcm9maWxlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb3B5RmxhZ3NGcm9tKGNvcHlGcm9tOiBVUkkgfCBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkKTogUHJvZmlsZVJlc291cmNlVHlwZUZsYWdzIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gY29weUZyb20gPyB7XG5cdFx0XHRzZXR0aW5nczogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmdzOiB0cnVlLFxuXHRcdFx0c25pcHBldHM6IHRydWUsXG5cdFx0XHR0YXNrczogdHJ1ZSxcblx0XHRcdGV4dGVuc2lvbnM6IHRydWUsXG5cdFx0XHRtY3A6IHRydWVcblx0XHR9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZGlzYWJsZWQgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5jb3B5RnJvbSBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnJlc29sdmVUZW1wbGF0ZSh0aGlzLmNvcHlGcm9tKTtcblx0XHRcdFx0aWYgKHRoaXMudGVtcGxhdGUpIHtcblx0XHRcdFx0XHR0aGlzLmNvcHlGcm9tVGVtcGxhdGVzLnNldCh0aGlzLmNvcHlGcm9tLCB0aGlzLnRlbXBsYXRlLm5hbWUpO1xuXHRcdFx0XHRcdGlmICh0aGlzLmRlZmF1bHROYW1lID09PSB0aGlzLm5hbWUpIHtcblx0XHRcdFx0XHRcdHRoaXMubmFtZSA9IHRoaXMuZGVmYXVsdE5hbWUgPSB0aGlzLnRlbXBsYXRlLm5hbWUgPz8gJyc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0aGlzLmRlZmF1bHRJY29uID09PSB0aGlzLmljb24pIHtcblx0XHRcdFx0XHRcdHRoaXMuaWNvbiA9IHRoaXMuZGVmYXVsdEljb24gPSB0aGlzLnRlbXBsYXRlLmljb247XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuc2V0Q29weUZsYWcoUHJvZmlsZVJlc291cmNlVHlwZS5TZXR0aW5ncywgISF0aGlzLnRlbXBsYXRlLnNldHRpbmdzKTtcblx0XHRcdFx0XHR0aGlzLnNldENvcHlGbGFnKFByb2ZpbGVSZXNvdXJjZVR5cGUuS2V5YmluZGluZ3MsICEhdGhpcy50ZW1wbGF0ZS5rZXliaW5kaW5ncyk7XG5cdFx0XHRcdFx0dGhpcy5zZXRDb3B5RmxhZyhQcm9maWxlUmVzb3VyY2VUeXBlLlRhc2tzLCAhIXRoaXMudGVtcGxhdGUudGFza3MpO1xuXHRcdFx0XHRcdHRoaXMuc2V0Q29weUZsYWcoUHJvZmlsZVJlc291cmNlVHlwZS5TbmlwcGV0cywgISF0aGlzLnRlbXBsYXRlLnNuaXBwZXRzKTtcblx0XHRcdFx0XHR0aGlzLnNldENvcHlGbGFnKFByb2ZpbGVSZXNvdXJjZVR5cGUuRXh0ZW5zaW9ucywgISF0aGlzLnRlbXBsYXRlLmV4dGVuc2lvbnMpO1xuXHRcdFx0XHRcdHRoaXMuc2V0Q29weUZsYWcoUHJvZmlsZVJlc291cmNlVHlwZS5NY3AsICEhdGhpcy50ZW1wbGF0ZS5tY3ApO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBjb3B5RnJvbUluZm86IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNVc2VyRGF0YVByb2ZpbGUodGhpcy5jb3B5RnJvbSkpIHtcblx0XHRcdFx0aWYgKHRoaXMuZGVmYXVsdE5hbWUgPT09IHRoaXMubmFtZSkge1xuXHRcdFx0XHRcdHRoaXMubmFtZSA9IHRoaXMuZGVmYXVsdE5hbWUgPSBsb2NhbGl6ZSgnY29weSBmcm9tJywgXCJ7MH0gKENvcHkpXCIsIHRoaXMuY29weUZyb20ubmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuZGVmYXVsdEljb24gPT09IHRoaXMuaWNvbikge1xuXHRcdFx0XHRcdHRoaXMuaWNvbiA9IHRoaXMuZGVmYXVsdEljb24gPSB0aGlzLmNvcHlGcm9tLmljb247XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5zZXRDb3B5RmxhZyhQcm9maWxlUmVzb3VyY2VUeXBlLlNldHRpbmdzLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5zZXRDb3B5RmxhZyhQcm9maWxlUmVzb3VyY2VUeXBlLktleWJpbmRpbmdzLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5zZXRDb3B5RmxhZyhQcm9maWxlUmVzb3VyY2VUeXBlLlRhc2tzLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5zZXRDb3B5RmxhZyhQcm9maWxlUmVzb3VyY2VUeXBlLlNuaXBwZXRzLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5zZXRDb3B5RmxhZyhQcm9maWxlUmVzb3VyY2VUeXBlLkV4dGVuc2lvbnMsIHRydWUpO1xuXHRcdFx0XHR0aGlzLnNldENvcHlGbGFnKFByb2ZpbGVSZXNvdXJjZVR5cGUuTWNwLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGNvcHlGcm9tSW5mbzogdHJ1ZSB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5kZWZhdWx0TmFtZSA9PT0gdGhpcy5uYW1lKSB7XG5cdFx0XHRcdHRoaXMubmFtZSA9IHRoaXMuZGVmYXVsdE5hbWUgPSB0aGlzLmdldE5ld1Byb2ZpbGVOYW1lKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5kZWZhdWx0SWNvbiA9PT0gdGhpcy5pY29uKSB7XG5cdFx0XHRcdHRoaXMuaWNvbiA9IHRoaXMuZGVmYXVsdEljb24gPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNldENvcHlGbGFnKFByb2ZpbGVSZXNvdXJjZVR5cGUuU2V0dGluZ3MsIGZhbHNlKTtcblx0XHRcdHRoaXMuc2V0Q29weUZsYWcoUHJvZmlsZVJlc291cmNlVHlwZS5LZXliaW5kaW5ncywgZmFsc2UpO1xuXHRcdFx0dGhpcy5zZXRDb3B5RmxhZyhQcm9maWxlUmVzb3VyY2VUeXBlLlRhc2tzLCBmYWxzZSk7XG5cdFx0XHR0aGlzLnNldENvcHlGbGFnKFByb2ZpbGVSZXNvdXJjZVR5cGUuU25pcHBldHMsIGZhbHNlKTtcblx0XHRcdHRoaXMuc2V0Q29weUZsYWcoUHJvZmlsZVJlc291cmNlVHlwZS5FeHRlbnNpb25zLCBmYWxzZSk7XG5cdFx0XHR0aGlzLnNldENvcHlGbGFnKFByb2ZpbGVSZXNvdXJjZVR5cGUuTWNwLCBmYWxzZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgY29weUZyb21JbmZvOiB0cnVlIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmRpc2FibGVkID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXROZXdQcm9maWxlTmFtZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG5hbWUgPSBsb2NhbGl6ZSgndW50aXRsZWQnLCBcIlVudGl0bGVkXCIpO1xuXHRcdGNvbnN0IG5hbWVSZWdFeCA9IG5ldyBSZWdFeHAoYCR7bmFtZX1cXFxccyhcXFxcZCspYCk7XG5cdFx0bGV0IG5hbWVJbmRleCA9IDA7XG5cdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMpIHtcblx0XHRcdGNvbnN0IG1hdGNoZXMgPSBuYW1lUmVnRXguZXhlYyhwcm9maWxlLm5hbWUpO1xuXHRcdFx0Y29uc3QgaW5kZXggPSBtYXRjaGVzID8gcGFyc2VJbnQobWF0Y2hlc1sxXSkgOiAwO1xuXHRcdFx0bmFtZUluZGV4ID0gaW5kZXggPiBuYW1lSW5kZXggPyBpbmRleCA6IG5hbWVJbmRleDtcblx0XHR9XG5cdFx0cmV0dXJuIGAke25hbWV9ICR7bmFtZUluZGV4ICsgMX1gO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVRlbXBsYXRlKHVyaTogVVJJKTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlVGVtcGxhdGUgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLnRlbXBsYXRlUHJvbWlzZSkge1xuXHRcdFx0dGhpcy50ZW1wbGF0ZVByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyB0b2tlbiA9PiB7XG5cdFx0XHRcdGNvbnN0IHRlbXBsYXRlID0gYXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlLnJlc29sdmVQcm9maWxlVGVtcGxhdGUodXJpKTtcblx0XHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHRoaXMudGVtcGxhdGUgPSB0ZW1wbGF0ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMudGVtcGxhdGVQcm9taXNlO1xuXHRcdHJldHVybiB0aGlzLnRlbXBsYXRlO1xuXHR9XG5cblx0aGFzUmVzb3VyY2UocmVzb3VyY2VUeXBlOiBQcm9maWxlUmVzb3VyY2VUeXBlKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMudGVtcGxhdGUpIHtcblx0XHRcdHN3aXRjaCAocmVzb3VyY2VUeXBlKSB7XG5cdFx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5TZXR0aW5nczpcblx0XHRcdFx0XHRyZXR1cm4gISF0aGlzLnRlbXBsYXRlLnNldHRpbmdzO1xuXHRcdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuS2V5YmluZGluZ3M6XG5cdFx0XHRcdFx0cmV0dXJuICEhdGhpcy50ZW1wbGF0ZS5rZXliaW5kaW5ncztcblx0XHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLlNuaXBwZXRzOlxuXHRcdFx0XHRcdHJldHVybiAhIXRoaXMudGVtcGxhdGUuc25pcHBldHM7XG5cdFx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5UYXNrczpcblx0XHRcdFx0XHRyZXR1cm4gISF0aGlzLnRlbXBsYXRlLnRhc2tzO1xuXHRcdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuRXh0ZW5zaW9uczpcblx0XHRcdFx0XHRyZXR1cm4gISF0aGlzLnRlbXBsYXRlLmV4dGVuc2lvbnM7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Z2V0Q29weUZsYWcoa2V5OiBQcm9maWxlUmVzb3VyY2VUeXBlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29weUZsYWdzPy5ba2V5XSA/PyBmYWxzZTtcblx0fVxuXG5cdHNldENvcHlGbGFnKGtleTogUHJvZmlsZVJlc291cmNlVHlwZSwgdmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBmbGFncyA9IHRoaXMuY29weUZsYWdzID8geyAuLi50aGlzLmNvcHlGbGFncyB9IDoge307XG5cdFx0ZmxhZ3Nba2V5XSA9IHZhbHVlO1xuXHRcdHRoaXMuY29weUZsYWdzID0gZmxhZ3M7XG5cdH1cblxuXHRnZXRDb3B5RnJvbU5hbWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaXNVc2VyRGF0YVByb2ZpbGUodGhpcy5jb3B5RnJvbSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmNvcHlGcm9tLm5hbWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmNvcHlGcm9tIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb3B5RnJvbVRlbXBsYXRlcy5nZXQodGhpcy5jb3B5RnJvbSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZ2V0Q2hpbGRyZW5Gb3JSZXNvdXJjZVR5cGUocmVzb3VyY2VUeXBlOiBQcm9maWxlUmVzb3VyY2VUeXBlKTogUHJvbWlzZTxJUHJvZmlsZUNoaWxkRWxlbWVudFtdPiB7XG5cdFx0aWYgKHRoaXMuZ2V0RmxhZyhyZXNvdXJjZVR5cGUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRDaGlsZHJlbkZyb21Qcm9maWxlKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUsIHJlc291cmNlVHlwZSk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5nZXRDb3B5RmxhZyhyZXNvdXJjZVR5cGUpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGlmICh0aGlzLnByZXZpZXdQcm9maWxlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRDaGlsZHJlbkZyb21Qcm9maWxlKHRoaXMucHJldmlld1Byb2ZpbGUsIHJlc291cmNlVHlwZSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmNvcHlGcm9tIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJlc29sdmVUZW1wbGF0ZSh0aGlzLmNvcHlGcm9tKTtcblx0XHRcdGlmICghdGhpcy50ZW1wbGF0ZSkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRDaGlsZHJlbkZyb21Qcm9maWxlVGVtcGxhdGUodGhpcy50ZW1wbGF0ZSwgcmVzb3VyY2VUeXBlKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuY29weUZyb20pIHtcblx0XHRcdHJldHVybiB0aGlzLmdldENoaWxkcmVuRnJvbVByb2ZpbGUodGhpcy5jb3B5RnJvbSwgcmVzb3VyY2VUeXBlKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRDaGlsZHJlbkZyb21Qcm9maWxlVGVtcGxhdGUocHJvZmlsZVRlbXBsYXRlOiBJVXNlckRhdGFQcm9maWxlVGVtcGxhdGUsIHJlc291cmNlVHlwZTogUHJvZmlsZVJlc291cmNlVHlwZSk6IFByb21pc2U8SVByb2ZpbGVSZXNvdXJjZVR5cGVDaGlsZEVsZW1lbnRbXT4ge1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gVVJJLmZyb20oeyBzY2hlbWU6IFVTRVJfREFUQV9QUk9GSUxFX1RFTVBMQVRFX1BSRVZJRVdfU0NIRU1FLCBwYXRoOiBgL3Jvb3QvcHJvZmlsZXMvJHtwcm9maWxlVGVtcGxhdGUubmFtZX1gIH0pO1xuXHRcdGNvbnN0IGNhY2hlTG9jYXRpb24gPSBVUkkuZnJvbSh7IHNjaGVtZTogVVNFUl9EQVRBX1BST0ZJTEVfVEVNUExBVEVfUFJFVklFV19TQ0hFTUUsIHBhdGg6IGAvcm9vdC9jYWNoZS8ke3Byb2ZpbGVUZW1wbGF0ZS5uYW1lfWAgfSk7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IHRvVXNlckRhdGFQcm9maWxlKGdlbmVyYXRlVXVpZCgpLCB0aGlzLm5hbWUsIGxvY2F0aW9uLCBjYWNoZUxvY2F0aW9uKTtcblx0XHRzd2l0Y2ggKHJlc291cmNlVHlwZSkge1xuXHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLlNldHRpbmdzOlxuXHRcdFx0XHRpZiAocHJvZmlsZVRlbXBsYXRlLnNldHRpbmdzKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nc1Jlc291cmNlKS5hcHBseShwcm9maWxlVGVtcGxhdGUuc2V0dGluZ3MsIHByb2ZpbGUpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmdldENoaWxkcmVuRnJvbVByb2ZpbGUocHJvZmlsZSwgcmVzb3VyY2VUeXBlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuS2V5YmluZGluZ3M6XG5cdFx0XHRcdGlmIChwcm9maWxlVGVtcGxhdGUua2V5YmluZGluZ3MpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEtleWJpbmRpbmdzUmVzb3VyY2UpLmFwcGx5KHByb2ZpbGVUZW1wbGF0ZS5rZXliaW5kaW5ncywgcHJvZmlsZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0Q2hpbGRyZW5Gcm9tUHJvZmlsZShwcm9maWxlLCByZXNvdXJjZVR5cGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5TbmlwcGV0czpcblx0XHRcdFx0aWYgKHByb2ZpbGVUZW1wbGF0ZS5zbmlwcGV0cykge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldHNSZXNvdXJjZSkuYXBwbHkocHJvZmlsZVRlbXBsYXRlLnNuaXBwZXRzLCBwcm9maWxlKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRDaGlsZHJlbkZyb21Qcm9maWxlKHByb2ZpbGUsIHJlc291cmNlVHlwZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLlRhc2tzOlxuXHRcdFx0XHRpZiAocHJvZmlsZVRlbXBsYXRlLnRhc2tzKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUYXNrc1Jlc291cmNlKS5hcHBseShwcm9maWxlVGVtcGxhdGUudGFza3MsIHByb2ZpbGUpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmdldENoaWxkcmVuRnJvbVByb2ZpbGUocHJvZmlsZSwgcmVzb3VyY2VUeXBlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuTWNwOlxuXHRcdFx0XHRpZiAocHJvZmlsZVRlbXBsYXRlLm1jcCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwUHJvZmlsZVJlc291cmNlKS5hcHBseShwcm9maWxlVGVtcGxhdGUubWNwLCBwcm9maWxlKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRDaGlsZHJlbkZyb21Qcm9maWxlKHByb2ZpbGUsIHJlc291cmNlVHlwZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLkV4dGVuc2lvbnM6XG5cdFx0XHRcdGlmIChwcm9maWxlVGVtcGxhdGUuZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zUmVzb3VyY2VJbXBvcnRUcmVlSXRlbSwgcHJvZmlsZVRlbXBsYXRlLmV4dGVuc2lvbnMpLmdldENoaWxkcmVuKCk7XG5cdFx0XHRcdFx0cmV0dXJuIGNoaWxkcmVuLm1hcChjaGlsZCA9PiB0aGlzLnRvVXNlckRhdGFQcm9maWxlUmVzb3VyY2VDaGlsZEVsZW1lbnQoY2hpbGQpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdG92ZXJyaWRlIHNob3VsZFZhbGlkYXRlTmFtZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuY29weUZyb207XG5cdH1cblxuXHRvdmVycmlkZSBnZXRJbml0aWFsTmFtZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnByZXZpZXdQcm9maWxlPy5uYW1lID8/ICcnO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGRvU2F2ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5wcmV2aWV3UHJvZmlsZSkge1xuXHRcdFx0Y29uc3QgcHJvZmlsZSA9IGF3YWl0IHRoaXMuc2F2ZVByb2ZpbGUodGhpcy5wcmV2aWV3UHJvZmlsZSk7XG5cdFx0XHRpZiAocHJvZmlsZSkge1xuXHRcdFx0XHR0aGlzLnByZXZpZXdQcm9maWxlID0gcHJvZmlsZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JNb2RlbCBleHRlbmRzIEVkaXRvck1vZGVsIHtcblxuXHRwcml2YXRlIHN0YXRpYyBJTlNUQU5DRTogVXNlckRhdGFQcm9maWxlc0VkaXRvck1vZGVsIHwgdW5kZWZpbmVkO1xuXHRzdGF0aWMgZ2V0SW5zdGFuY2UoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JNb2RlbCB7XG5cdFx0aWYgKCFVc2VyRGF0YVByb2ZpbGVzRWRpdG9yTW9kZWwuSU5TVEFOQ0UpIHtcblx0XHRcdFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JNb2RlbC5JTlNUQU5DRSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JNb2RlbCk7XG5cdFx0fVxuXHRcdHJldHVybiBVc2VyRGF0YVByb2ZpbGVzRWRpdG9yTW9kZWwuSU5TVEFOQ0U7XG5cdH1cblxuXHRwcml2YXRlIF9wcm9maWxlczogW0Fic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCwgRGlzcG9zYWJsZVN0b3JlXVtdID0gW107XG5cdGdldCBwcm9maWxlcygpOiBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2ZpbGVzXG5cdFx0XHQubWFwKChbcHJvZmlsZV0pID0+IHByb2ZpbGUpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0XHRpZiAoYSBpbnN0YW5jZW9mIE5ld1Byb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGIgaW5zdGFuY2VvZiBOZXdQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYSBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgJiYgYS5wcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYiBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgJiYgYi5wcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIG5ld1Byb2ZpbGVFbGVtZW50OiBOZXdQcm9maWxlRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSB0ZW1wbGF0ZXM6IFByb21pc2U8cmVhZG9ubHkgSVByb2ZpbGVUZW1wbGF0ZUluZm9bXT4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZTogSVVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzKSB7XG5cdFx0XHRpZiAoIXByb2ZpbGUuaXNJbnRlcm5hbCkge1xuXHRcdFx0XHR0aGlzLl9wcm9maWxlcy5wdXNoKHRoaXMuY3JlYXRlUHJvZmlsZUVsZW1lbnQocHJvZmlsZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fcHJvZmlsZXMuc3BsaWNlKDAsIHRoaXMuX3Byb2ZpbGVzLmxlbmd0aCkubWFwKChbLCBkaXNwb3NhYmxlc10pID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5vbkRpZENoYW5nZVByb2ZpbGVzKGUgPT4gdGhpcy5vbkRpZENoYW5nZVByb2ZpbGVzKGUpKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlUHJvZmlsZXMoZTogRGlkQ2hhbmdlUHJvZmlsZXNFdmVudCk6IHZvaWQge1xuXHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIGUuYWRkZWQpIHtcblx0XHRcdGlmICghcHJvZmlsZS5pc0ludGVybmFsICYmIHByb2ZpbGUubmFtZSAhPT0gdGhpcy5uZXdQcm9maWxlRWxlbWVudD8ubmFtZSkge1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fcHJvZmlsZXMucHVzaCh0aGlzLmNyZWF0ZVByb2ZpbGVFbGVtZW50KHByb2ZpbGUpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIGUucmVtb3ZlZCkge1xuXHRcdFx0aWYgKHByb2ZpbGUuaWQgPT09IHRoaXMubmV3UHJvZmlsZUVsZW1lbnQ/LnByZXZpZXdQcm9maWxlPy5pZCkge1xuXHRcdFx0XHR0aGlzLm5ld1Byb2ZpbGVFbGVtZW50LnByZXZpZXdQcm9maWxlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9wcm9maWxlcy5maW5kSW5kZXgoKFtwXSkgPT4gcCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgJiYgcC5wcm9maWxlLmlkID09PSBwcm9maWxlLmlkKTtcblx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX3Byb2ZpbGVzLnNwbGljZShpbmRleCwgMSkubWFwKChbLCBkaXNwb3NhYmxlc10pID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0VGVtcGxhdGVzKCk6IFByb21pc2U8cmVhZG9ubHkgSVByb2ZpbGVUZW1wbGF0ZUluZm9bXT4ge1xuXHRcdGlmICghdGhpcy50ZW1wbGF0ZXMpIHtcblx0XHRcdHRoaXMudGVtcGxhdGVzID0gdGhpcy51c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZS5nZXRCdWlsdGluUHJvZmlsZVRlbXBsYXRlcygpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy50ZW1wbGF0ZXM7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVByb2ZpbGVFbGVtZW50KHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBbVXNlckRhdGFQcm9maWxlRWxlbWVudCwgRGlzcG9zYWJsZVN0b3JlXSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBhY3RpdmF0ZUFjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0J3VzZXJEYXRhUHJvZmlsZS5hY3RpdmF0ZScsXG5cdFx0XHRsb2NhbGl6ZSgnYWN0aXZlJywgXCJVc2UgdGhpcyBQcm9maWxlIGZvciBDdXJyZW50IFdpbmRvd1wiKSxcblx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNoZWNrKSxcblx0XHRcdHRydWUsXG5cdFx0XHQoKSA9PiB0aGlzLnVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLnN3aXRjaFByb2ZpbGUocHJvZmlsZUVsZW1lbnQucHJvZmlsZSlcblx0XHQpKTtcblxuXHRcdGNvbnN0IGNvcHlGcm9tUHJvZmlsZUFjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0J3VzZXJEYXRhUHJvZmlsZS5jb3B5RnJvbVByb2ZpbGUnLFxuXHRcdFx0bG9jYWxpemUoJ2NvcHlGcm9tUHJvZmlsZScsIFwiRHVwbGljYXRlLi4uXCIpLFxuXHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY29weSksXG5cdFx0XHR0cnVlLCAoKSA9PiB0aGlzLmNyZWF0ZU5ld1Byb2ZpbGUocHJvZmlsZUVsZW1lbnQucHJvZmlsZSlcblx0XHQpKTtcblxuXHRcdGNvbnN0IGV4cG9ydEFjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0J3VzZXJEYXRhUHJvZmlsZS5leHBvcnQnLFxuXHRcdFx0bG9jYWxpemUoJ2V4cG9ydCcsIFwiRXhwb3J0Li4uXCIpLFxuXHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZXhwb3J0KSxcblx0XHRcdHRydWUsXG5cdFx0XHQoKSA9PiB0aGlzLnVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UuZXhwb3J0UHJvZmlsZShwcm9maWxlKVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgZGVsZXRlQWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHQndXNlckRhdGFQcm9maWxlLmRlbGV0ZScsXG5cdFx0XHRsb2NhbGl6ZSgnZGVsZXRlJywgXCJEZWxldGVcIiksXG5cdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi50cmFzaCksXG5cdFx0XHR0cnVlLFxuXHRcdFx0KCkgPT4gdGhpcy5yZW1vdmVQcm9maWxlKHByb2ZpbGVFbGVtZW50LnByb2ZpbGUpXG5cdFx0KSk7XG5cblx0XHRjb25zdCBuZXdXaW5kb3dBY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbihcblx0XHRcdCd1c2VyRGF0YVByb2ZpbGUubmV3V2luZG93Jyxcblx0XHRcdGxvY2FsaXplKCdvcGVuIG5ldyB3aW5kb3cnLCBcIk9wZW4gTmV3IFdpbmRvdyB3aXRoIHRoaXMgUHJvZmlsZVwiKSxcblx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmVtcHR5V2luZG93KSxcblx0XHRcdHRydWUsXG5cdFx0XHQoKSA9PiB0aGlzLm9wZW5XaW5kb3cocHJvZmlsZUVsZW1lbnQucHJvZmlsZSlcblx0XHQpKTtcblxuXHRcdGNvbnN0IHByaW1hcnlBY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKGFjdGl2YXRlQWN0aW9uKTtcblx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKG5ld1dpbmRvd0FjdGlvbik7XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5QWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0c2Vjb25kYXJ5QWN0aW9ucy5wdXNoKGNvcHlGcm9tUHJvZmlsZUFjdGlvbik7XG5cdFx0c2Vjb25kYXJ5QWN0aW9ucy5wdXNoKGV4cG9ydEFjdGlvbik7XG5cdFx0aWYgKCFwcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0c2Vjb25kYXJ5QWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRzZWNvbmRhcnlBY3Rpb25zLnB1c2goZGVsZXRlQWN0aW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9maWxlRWxlbWVudCA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQsXG5cdFx0XHRwcm9maWxlLFxuXHRcdFx0W1tdLCBbXV0sXG5cdFx0XHRbcHJpbWFyeUFjdGlvbnMsIHNlY29uZGFyeUFjdGlvbnNdXG5cdFx0KSk7XG5cblx0XHRhY3RpdmF0ZUFjdGlvbi5lbmFibGVkID0gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlkICE9PSBwcm9maWxlRWxlbWVudC5wcm9maWxlLmlkO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VDdXJyZW50UHJvZmlsZSgoKSA9PlxuXHRcdFx0YWN0aXZhdGVBY3Rpb24uZW5hYmxlZCA9IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pZCAhPT0gcHJvZmlsZUVsZW1lbnQucHJvZmlsZS5pZCkpO1xuXG5cdFx0cmV0dXJuIFtwcm9maWxlRWxlbWVudCwgZGlzcG9zYWJsZXNdO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlTmV3UHJvZmlsZShjb3B5RnJvbT86IFVSSSB8IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLm5ld1Byb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdHR5cGU6ICdpbmZvJyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ25ldyBwcm9maWxlIGV4aXN0cycsIFwiQSBuZXcgcHJvZmlsZSBpcyBhbHJlYWR5IGJlaW5nIGNyZWF0ZWQuIERvIHlvdSB3YW50IHRvIGRpc2NhcmQgaXQgYW5kIGNyZWF0ZSBhIG5ldyBvbmU/XCIpLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgnZGlzY2FyZCcsIFwiRGlzY2FyZCAmIENyZWF0ZVwiKSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiBsb2NhbGl6ZSgnY2FuY2VsJywgXCJDYW5jZWxcIilcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMucmV2ZXJ0KCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvcHlGcm9tIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UucmVzb2x2ZVByb2ZpbGVUZW1wbGF0ZShjb3B5RnJvbSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmRpYWxvZ1NlcnZpY2UuZXJyb3IoZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMubmV3UHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnM6IEFjdGlvbltdID0gW107XG5cdFx0XHRjb25zdCBzZWNvbmRhcnlBY3Rpb25zOiBBY3Rpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgY3JlYXRlQWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHRcdCd1c2VyRGF0YVByb2ZpbGUuY3JlYXRlJyxcblx0XHRcdFx0bG9jYWxpemUoJ2NyZWF0ZScsIFwiQ3JlYXRlXCIpLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdCgpID0+IHRoaXMuc2F2ZU5ld1Byb2ZpbGUoZmFsc2UsIGNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKVxuXHRcdFx0KSk7XG5cdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKGNyZWF0ZUFjdGlvbik7XG5cdFx0XHRpZiAoaXNXZWIgJiYgY29weUZyb20gaW5zdGFuY2VvZiBVUkkgJiYgaXNQcm9maWxlVVJMKGNvcHlGcm9tKSkge1xuXHRcdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdCd1c2VyRGF0YVByb2ZpbGUuY3JlYXRlSW5EZXNrdG9wJyxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnaW1wb3J0IGluIGRlc2t0b3AnLCBcIkNyZWF0ZSBpbiB7MH1cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZyksXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0KCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oY29weUZyb20sIHsgb3BlbkV4dGVybmFsOiB0cnVlIH0pXG5cdFx0XHRcdCkpKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNhbmNlbEFjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0XHQndXNlckRhdGFQcm9maWxlLmNhbmNlbCcsXG5cdFx0XHRcdGxvY2FsaXplKCdjYW5jZWwnLCBcIkNhbmNlbFwiKSxcblx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24udHJhc2gpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmRpc2NhcmROZXdQcm9maWxlKClcblx0XHRcdCkpO1xuXHRcdFx0c2Vjb25kYXJ5QWN0aW9ucy5wdXNoKGNhbmNlbEFjdGlvbik7XG5cdFx0XHRjb25zdCBwcmV2aWV3UHJvZmlsZUFjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0XHQndXNlckRhdGFQcm9maWxlLnByZXZpZXcnLFxuXHRcdFx0XHRsb2NhbGl6ZSgncHJldmlldycsIFwiUHJldmlld1wiKSxcblx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ub3BlblByZXZpZXcpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQoKSA9PiB0aGlzLnByZXZpZXdOZXdQcm9maWxlKGNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKVxuXHRcdFx0KSk7XG5cdFx0XHRzZWNvbmRhcnlBY3Rpb25zLnB1c2gocHJldmlld1Byb2ZpbGVBY3Rpb24pO1xuXHRcdFx0Y29uc3QgZXhwb3J0QWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHRcdCd1c2VyRGF0YVByb2ZpbGUuZXhwb3J0Jyxcblx0XHRcdFx0bG9jYWxpemUoJ2V4cG9ydCcsIFwiRXhwb3J0Li4uXCIpLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5leHBvcnQpLFxuXHRcdFx0XHRpc1VzZXJEYXRhUHJvZmlsZShjb3B5RnJvbSksXG5cdFx0XHRcdCgpID0+IHRoaXMuZXhwb3J0TmV3UHJvZmlsZShjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbilcblx0XHRcdCkpO1xuXHRcdFx0dGhpcy5uZXdQcm9maWxlRWxlbWVudCA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld1Byb2ZpbGVFbGVtZW50LFxuXHRcdFx0XHRjb3B5RnJvbSxcblx0XHRcdFx0W3ByaW1hcnlBY3Rpb25zLCBzZWNvbmRhcnlBY3Rpb25zXSxcblx0XHRcdFx0W1tjYW5jZWxBY3Rpb25dLCBbZXhwb3J0QWN0aW9uXV0sXG5cdFx0XHQpKTtcblx0XHRcdGNvbnN0IHVwZGF0ZUNyZWF0ZUFjdGlvbkxhYmVsID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAoY3JlYXRlQWN0aW9uLmVuYWJsZWQpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5uZXdQcm9maWxlRWxlbWVudD8uY29weUZyb20gJiYgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5zb21lKHAgPT4gIXAuaXNJbnRlcm5hbCAmJiBwLm5hbWUgPT09IHRoaXMubmV3UHJvZmlsZUVsZW1lbnQ/Lm5hbWUpKSB7XG5cdFx0XHRcdFx0XHRjcmVhdGVBY3Rpb24ubGFiZWwgPSBsb2NhbGl6ZSgncmVwbGFjZScsIFwiUmVwbGFjZVwiKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y3JlYXRlQWN0aW9uLmxhYmVsID0gbG9jYWxpemUoJ2NyZWF0ZScsIFwiQ3JlYXRlXCIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHVwZGF0ZUNyZWF0ZUFjdGlvbkxhYmVsKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5uZXdQcm9maWxlRWxlbWVudC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdFx0aWYgKGUucHJldmlldyB8fCBlLmRpc2FibGVkIHx8IGUubWVzc2FnZSkge1xuXHRcdFx0XHRcdGNyZWF0ZUFjdGlvbi5lbmFibGVkID0gIXRoaXMubmV3UHJvZmlsZUVsZW1lbnQ/LmRpc2FibGVkICYmICF0aGlzLm5ld1Byb2ZpbGVFbGVtZW50Py5tZXNzYWdlO1xuXHRcdFx0XHRcdHByZXZpZXdQcm9maWxlQWN0aW9uLmVuYWJsZWQgPSAhdGhpcy5uZXdQcm9maWxlRWxlbWVudD8ucHJldmlld1Byb2ZpbGUgJiYgIXRoaXMubmV3UHJvZmlsZUVsZW1lbnQ/LmRpc2FibGVkICYmICF0aGlzLm5ld1Byb2ZpbGVFbGVtZW50Py5tZXNzYWdlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLm5hbWUgfHwgZS5jb3B5RnJvbSkge1xuXHRcdFx0XHRcdHVwZGF0ZUNyZWF0ZUFjdGlvbkxhYmVsKCk7XG5cdFx0XHRcdFx0ZXhwb3J0QWN0aW9uLmVuYWJsZWQgPSBpc1VzZXJEYXRhUHJvZmlsZSh0aGlzLm5ld1Byb2ZpbGVFbGVtZW50Py5jb3B5RnJvbSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvZmlsZXMoKGUpID0+IHtcblx0XHRcdFx0dXBkYXRlQ3JlYXRlQWN0aW9uTGFiZWwoKTtcblx0XHRcdFx0dGhpcy5uZXdQcm9maWxlRWxlbWVudD8udmFsaWRhdGUoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3Byb2ZpbGVzLnB1c2goW3RoaXMubmV3UHJvZmlsZUVsZW1lbnQsIGRpc3Bvc2FibGVzXSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHRoaXMubmV3UHJvZmlsZUVsZW1lbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5uZXdQcm9maWxlRWxlbWVudDtcblx0fVxuXG5cdHJldmVydCgpOiB2b2lkIHtcblx0XHR0aGlzLnJlbW92ZU5ld1Byb2ZpbGUoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZU5ld1Byb2ZpbGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubmV3UHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fcHJvZmlsZXMuZmluZEluZGV4KChbcF0pID0+IHAgPT09IHRoaXMubmV3UHJvZmlsZUVsZW1lbnQpO1xuXHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHR0aGlzLl9wcm9maWxlcy5zcGxpY2UoaW5kZXgsIDEpLm1hcCgoWywgZGlzcG9zYWJsZXNdKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5uZXdQcm9maWxlRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByZXZpZXdOZXdQcm9maWxlKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5uZXdQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5uZXdQcm9maWxlRWxlbWVudC5wcmV2aWV3UHJvZmlsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcm9maWxlID0gYXdhaXQgdGhpcy5zYXZlTmV3UHJvZmlsZSh0cnVlLCB0b2tlbik7XG5cdFx0aWYgKHByb2ZpbGUpIHtcblx0XHRcdHRoaXMubmV3UHJvZmlsZUVsZW1lbnQucHJldmlld1Byb2ZpbGUgPSBwcm9maWxlO1xuXHRcdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2Uuc3dpdGNoUHJvZmlsZShwcm9maWxlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMub3BlbldpbmRvdyhwcm9maWxlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGV4cG9ydE5ld1Byb2ZpbGUodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm5ld1Byb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghaXNVc2VyRGF0YVByb2ZpbGUodGhpcy5uZXdQcm9maWxlRWxlbWVudC5jb3B5RnJvbSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcHJvZmlsZSA9IHRvVXNlckRhdGFQcm9maWxlKFxuXHRcdFx0Z2VuZXJhdGVVdWlkKCksXG5cdFx0XHR0aGlzLm5ld1Byb2ZpbGVFbGVtZW50Lm5hbWUsXG5cdFx0XHR0aGlzLm5ld1Byb2ZpbGVFbGVtZW50LmNvcHlGcm9tLmxvY2F0aW9uLFxuXHRcdFx0dGhpcy5uZXdQcm9maWxlRWxlbWVudC5jb3B5RnJvbS5jYWNoZUhvbWUsXG5cdFx0XHR7XG5cdFx0XHRcdGljb246IHRoaXMubmV3UHJvZmlsZUVsZW1lbnQuaWNvbixcblx0XHRcdFx0dXNlRGVmYXVsdEZsYWdzOiB0aGlzLm5ld1Byb2ZpbGVFbGVtZW50LmZsYWdzLFxuXHRcdFx0fSxcblx0XHRcdHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGVcblx0XHQpO1xuXHRcdGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZS5leHBvcnRQcm9maWxlKHByb2ZpbGUsIHRoaXMubmV3UHJvZmlsZUVsZW1lbnQuY29weUZsYWdzKTtcblx0fVxuXG5cdGFzeW5jIHNhdmVOZXdQcm9maWxlKHRyYW5zaWVudD86IGJvb2xlYW4sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMubmV3UHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5uZXdQcm9maWxlRWxlbWVudC52YWxpZGF0ZSgpO1xuXHRcdGlmICh0aGlzLm5ld1Byb2ZpbGVFbGVtZW50Lm1lc3NhZ2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5uZXdQcm9maWxlRWxlbWVudC5kaXNhYmxlZCA9IHRydWU7XG5cdFx0bGV0IHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQ7XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKHRoaXMubmV3UHJvZmlsZUVsZW1lbnQucHJldmlld1Byb2ZpbGUpIHtcblx0XHRcdFx0aWYgKCF0cmFuc2llbnQpIHtcblx0XHRcdFx0XHRwcm9maWxlID0gYXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZS51cGRhdGVQcm9maWxlKHRoaXMubmV3UHJvZmlsZUVsZW1lbnQucHJldmlld1Byb2ZpbGUsIHsgdHJhbnNpZW50OiBmYWxzZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHsgZmxhZ3MsIGljb24sIG5hbWUsIGNvcHlGcm9tIH0gPSB0aGlzLm5ld1Byb2ZpbGVFbGVtZW50O1xuXHRcdFx0XHRjb25zdCB1c2VEZWZhdWx0RmxhZ3M6IFVzZURlZmF1bHRQcm9maWxlRmxhZ3MgfCB1bmRlZmluZWQgPSBmbGFnc1xuXHRcdFx0XHRcdD8gZmxhZ3Muc2V0dGluZ3MgJiYgZmxhZ3Mua2V5YmluZGluZ3MgJiYgZmxhZ3MudGFza3MgJiYgZmxhZ3MuZ2xvYmFsU3RhdGUgJiYgZmxhZ3MuZXh0ZW5zaW9ucyA/IHVuZGVmaW5lZCA6IGZsYWdzXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0dHlwZSBDcmVhdGVQcm9maWxlSW5mb0NsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdSZXBvcnQgd2hlbiBwcm9maWxlIGlzIGFib3V0IHRvIGJlIGNyZWF0ZWQnO1xuXHRcdFx0XHRcdHNvdXJjZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1R5cGUgb2YgcHJvZmlsZSBzb3VyY2UnIH07XG5cdFx0XHRcdH07XG5cdFx0XHRcdHR5cGUgQ3JlYXRlUHJvZmlsZUluZm9FdmVudCA9IHtcblx0XHRcdFx0XHRzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgY3JlYXRlUHJvZmlsZVRlbGVtZXRyeURhdGE6IENyZWF0ZVByb2ZpbGVJbmZvRXZlbnQgPSB7IHNvdXJjZTogY29weUZyb20gaW5zdGFuY2VvZiBVUkkgPyAndGVtcGxhdGUnIDogaXNVc2VyRGF0YVByb2ZpbGUoY29weUZyb20pID8gJ3Byb2ZpbGUnIDogY29weUZyb20gPyAnZXh0ZXJuYWwnIDogdW5kZWZpbmVkIH07XG5cblx0XHRcdFx0aWYgKGNvcHlGcm9tIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGVtcGxhdGUgPSBhd2FpdCB0aGlzLm5ld1Byb2ZpbGVFbGVtZW50LnJlc29sdmVUZW1wbGF0ZShjb3B5RnJvbSk7XG5cdFx0XHRcdFx0aWYgKHRlbXBsYXRlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDcmVhdGVQcm9maWxlSW5mb0V2ZW50LCBDcmVhdGVQcm9maWxlSW5mb0NsYXNzaWZpY2F0aW9uPigndXNlckRhdGFQcm9maWxlLmNyZWF0ZUZyb21UZW1wbGF0ZScsIGNyZWF0ZVByb2ZpbGVUZWxlbWV0cnlEYXRhKTtcblx0XHRcdFx0XHRcdHByb2ZpbGUgPSBhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UuY3JlYXRlUHJvZmlsZUZyb21UZW1wbGF0ZShcblx0XHRcdFx0XHRcdFx0dGVtcGxhdGUsXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRcdFx0XHRcdHVzZURlZmF1bHRGbGFncyxcblx0XHRcdFx0XHRcdFx0XHRpY29uLFxuXHRcdFx0XHRcdFx0XHRcdHJlc291cmNlVHlwZUZsYWdzOiB0aGlzLm5ld1Byb2ZpbGVFbGVtZW50LmNvcHlGbGFncyxcblx0XHRcdFx0XHRcdFx0XHR0cmFuc2llbnRcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0dG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNVc2VyRGF0YVByb2ZpbGUoY29weUZyb20pKSB7XG5cdFx0XHRcdFx0cHJvZmlsZSA9IGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZS5jcmVhdGVGcm9tUHJvZmlsZShcblx0XHRcdFx0XHRcdGNvcHlGcm9tLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRcdFx0XHR1c2VEZWZhdWx0RmxhZ3MsXG5cdFx0XHRcdFx0XHRcdGljb246IGljb24sXG5cdFx0XHRcdFx0XHRcdHJlc291cmNlVHlwZUZsYWdzOiB0aGlzLm5ld1Byb2ZpbGVFbGVtZW50LmNvcHlGbGFncyxcblx0XHRcdFx0XHRcdFx0dHJhbnNpZW50XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0dG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cHJvZmlsZSA9IGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UuY3JlYXRlUHJvZmlsZShuYW1lLCB7IHVzZURlZmF1bHRGbGFncywgaWNvbiwgdHJhbnNpZW50IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmICh0aGlzLm5ld1Byb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMubmV3UHJvZmlsZUVsZW1lbnQuZGlzYWJsZWQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRpZiAocHJvZmlsZSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UucmVtb3ZlUHJvZmlsZShwcm9maWxlKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChwcm9maWxlICYmICFwcm9maWxlLmlzSW50ZXJuYWwgJiYgdGhpcy5uZXdQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0dGhpcy5yZW1vdmVOZXdQcm9maWxlKCk7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Byb2ZpbGVzLmZpbmQoKFtwXSkgPT4gcC5uYW1lID09PSBwcm9maWxlLm5hbWUpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoZXhpc3RpbmdbMF0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5vbkRpZENoYW5nZVByb2ZpbGVzKHsgYWRkZWQ6IFtwcm9maWxlXSwgcmVtb3ZlZDogW10sIHVwZGF0ZWQ6IFtdLCBhbGw6IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb2ZpbGU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRpc2NhcmROZXdQcm9maWxlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5uZXdQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5uZXdQcm9maWxlRWxlbWVudC5wcmV2aWV3UHJvZmlsZSkge1xuXHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZS5yZW1vdmVQcm9maWxlKHRoaXMubmV3UHJvZmlsZUVsZW1lbnQucHJldmlld1Byb2ZpbGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnJlbW92ZU5ld1Byb2ZpbGUoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbW92ZVByb2ZpbGUocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICdpbmZvJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdkZWxldGVQcm9maWxlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlIHRoZSBwcm9maWxlICd7MH0nP1wiLCBwcm9maWxlLm5hbWUpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2RlbGV0ZScsIFwiRGVsZXRlXCIpLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiBsb2NhbGl6ZSgnY2FuY2VsJywgXCJDYW5jZWxcIilcblx0XHR9KTtcblx0XHRpZiAocmVzdWx0LmNvbmZpcm1lZCkge1xuXHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZS5yZW1vdmVQcm9maWxlKHByb2ZpbGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbldpbmRvdyhwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5ob3N0U2VydmljZS5vcGVuV2luZG93KHsgZm9yY2VQcm9maWxlOiBwcm9maWxlLm5hbWUgfSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxRQUFpQixXQUFXLGdCQUFnQjtBQUNyRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBaUMsbUJBQXFDLDBCQUEwQixxQkFBK0MseUJBQWlEO0FBQ2hNLFNBQThELGNBQWMscUNBQXFDLG1DQUFtQywrQkFBeUQ7QUFDN00sU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBUyxXQUFXO0FBQ3BCLFlBQVksWUFBWTtBQUN4QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0Msd0NBQXdDO0FBQ25GLFNBQVMsa0JBQWtCLGdDQUFnQztBQUMzRCxTQUFTLHFCQUFxQixtQ0FBbUM7QUFDakUsU0FBUyxlQUFlLDZCQUE2QjtBQUNyRCxTQUFTLGtCQUFrQixnQ0FBZ0M7QUFDM0QsU0FBUyxvQkFBb0IsMkJBQTJCO0FBQ3hELFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG9CQUFvQjtBQUM3QixTQUE0Qix5QkFBeUIsd0JBQXdCO0FBQzdFLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CLCtCQUErQjtBQUUzRCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGFBQWEsbUJBQW1CO0FBQ3pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEwQix3QkFBd0I7QUFDM0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0Q0FBNEM7QUFDckQsU0FBUyx5QkFBeUI7QUF5QzNCLFNBQVMsNkJBQTZCLFNBQXVFO0FBQ25ILFNBQVEsUUFBd0MsaUJBQWlCO0FBQ2xFO0FBRU8sU0FBUyw4QkFBOEIsU0FBNEU7QUFDekgsU0FBUSxRQUE2QyxVQUFVO0FBQ2hFO0FBRU8sSUFBZSxpQ0FBZixjQUFzRCxXQUFXO0FBQUEsRUFPdkUsWUFDQyxNQUNBLE1BQ0EsT0FDQSxZQUNBLFVBQ3NELGtDQUNULHlCQUNULGdCQUNTLHlCQUNaLGFBQ08sb0JBQ1AsYUFDd0IsNEJBQ2Ysc0JBQ3pDO0FBQ0QsVUFBTTtBQVZnRDtBQUNUO0FBQ1Q7QUFDUztBQUNaO0FBQ087QUFDUDtBQUN3QjtBQUNmO0FBbkIzQyxTQUFtQixlQUFlLEtBQUssVUFBVSxJQUFJLFFBQXFCLENBQUM7QUFDM0UsU0FBUyxjQUFjLEtBQUssYUFBYTtBQUV6QyxTQUFpQixnQkFBZ0IsS0FBSyxVQUFVLElBQUksaUJBQWlCLE1BQU0sS0FBSyxPQUFPLEdBQUcsR0FBRyxDQUFDO0FBa0Q5RixTQUFRLFFBQVE7QUFxQ2hCLFNBQVEsVUFBbUI7QUFrQjNCLFNBQVEsWUFBcUI7QUF0RjVCLFNBQUssUUFBUTtBQUNiLFNBQUssUUFBUTtBQUNiLFNBQUssU0FBUztBQUNkLFNBQUssY0FBYztBQUNuQixTQUFLLFVBQVU7QUFDZixTQUFLLFVBQVUsS0FBSyxZQUFZLE9BQUs7QUFDcEMsVUFBSSxDQUFDLEVBQUUsU0FBUztBQUNmLGFBQUssU0FBUztBQUFBLE1BQ2Y7QUFDQSxXQUFLLEtBQUs7QUFBQSxJQUNYLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLDJCQUEyQixtQ0FBbUMsYUFBVztBQUM1RixZQUFNLFVBQVUsS0FBSyxrQkFBa0I7QUFDdkMsVUFBSSxXQUFXLFFBQVEsS0FBSyxPQUFLLENBQUMsRUFBRSxVQUFVLEVBQUUscUJBQXFCLEtBQUssbUJBQW1CLE9BQU8sUUFBUSxFQUFFLGlCQUFpQixRQUFRLGtCQUFrQixFQUFFLEdBQUc7QUFDN0osYUFBSyxhQUFhLEtBQUssRUFBRSxZQUFZLEtBQUssQ0FBQztBQUFBLE1BQzVDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsS0FBSywyQkFBMkIsb0NBQW9DLE9BQUs7QUFDdkYsWUFBTSxVQUFVLEtBQUssa0JBQWtCO0FBQ3ZDLFVBQUksV0FBVyxDQUFDLEVBQUUsVUFBVSxFQUFFLHFCQUFxQixLQUFLLG1CQUFtQixPQUFPLFFBQVEsRUFBRSxpQkFBaUIsUUFBUSxrQkFBa0IsSUFBSTtBQUMxSSxhQUFLLGFBQWEsS0FBSyxFQUFFLFlBQVksS0FBSyxDQUFDO0FBQUEsTUFDNUM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLDJCQUEyQix5Q0FBeUMsT0FBSztBQUM1RixZQUFNLFVBQVUsS0FBSyxrQkFBa0I7QUFDdkMsVUFBSSxXQUFXLEVBQUUsTUFBTSx1QkFBdUIsS0FBSyxtQkFBbUIsT0FBTyxRQUFRLEVBQUUsaUJBQWlCLFNBQVMsa0JBQWtCLEdBQUc7QUFDckksYUFBSyxhQUFhLEtBQUssRUFBRSxZQUFZLEtBQUssQ0FBQztBQUFBLE1BQzVDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFHQSxJQUFJLE9BQWU7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFPO0FBQUEsRUFDeEMsSUFBSSxLQUFLLE1BQWM7QUFDdEIsV0FBTyxLQUFLLEtBQUs7QUFDakIsUUFBSSxLQUFLLFVBQVUsTUFBTTtBQUN4QixXQUFLLFFBQVE7QUFDYixXQUFLLGFBQWEsS0FBSyxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBQUEsSUFDdEM7QUFBQSxFQUNEO0FBQUEsRUFHQSxJQUFJLE9BQTJCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBTztBQUFBLEVBQ3BELElBQUksS0FBSyxNQUEwQjtBQUNsQyxRQUFJLEtBQUssVUFBVSxNQUFNO0FBQ3hCLFdBQUssUUFBUTtBQUNiLFdBQUssYUFBYSxLQUFLLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFBQSxFQUdBLElBQUksYUFBeUM7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFhO0FBQUEsRUFDeEUsSUFBSSxXQUFXLFlBQXdDO0FBQ3RELFFBQUksQ0FBQyxPQUFPLE9BQU8sS0FBSyxhQUFhLFlBQVksQ0FBQyxHQUFHLE1BQU0sRUFBRSxTQUFTLE1BQU0sRUFBRSxTQUFTLENBQUMsR0FBRztBQUMxRixXQUFLLGNBQWM7QUFDbkIsV0FBSyxhQUFhLEtBQUssRUFBRSxZQUFZLEtBQUssQ0FBQztBQUFBLElBQzVDO0FBQUEsRUFDRDtBQUFBLEVBR0EsSUFBSSxRQUE0QztBQUFFLFdBQU8sS0FBSztBQUFBLEVBQVE7QUFBQSxFQUN0RSxJQUFJLE1BQU0sT0FBMkM7QUFDcEQsUUFBSSxDQUFDLE9BQU8sS0FBSyxRQUFRLEtBQUssR0FBRztBQUNoQyxXQUFLLFNBQVM7QUFDZCxXQUFLLGFBQWEsS0FBSyxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBQUEsSUFDdkM7QUFBQSxFQUNEO0FBQUEsRUFHQSxJQUFJLFNBQWtCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBUztBQUFBLEVBQzdDLElBQUksT0FBTyxRQUFpQjtBQUMzQixRQUFJLEtBQUssWUFBWSxRQUFRO0FBQzVCLFdBQUssVUFBVTtBQUNmLFdBQUssYUFBYSxLQUFLLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFBQSxJQUN4QztBQUFBLEVBQ0Q7QUFBQSxFQUdBLElBQUksVUFBOEI7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFVO0FBQUEsRUFDMUQsSUFBSSxRQUFRLFNBQTZCO0FBQ3hDLFFBQUksS0FBSyxhQUFhLFNBQVM7QUFDOUIsV0FBSyxXQUFXO0FBQ2hCLFdBQUssYUFBYSxLQUFLLEVBQUUsU0FBUyxLQUFLLENBQUM7QUFBQSxJQUN6QztBQUFBLEVBQ0Q7QUFBQSxFQUdBLElBQUksV0FBb0I7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFXO0FBQUEsRUFDakQsSUFBSSxTQUFTLFFBQWlCO0FBQzdCLFFBQUksS0FBSyxjQUFjLFFBQVE7QUFDOUIsV0FBSyxZQUFZO0FBQ2pCLFdBQUssYUFBYSxLQUFLLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFBQSxJQUMxQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLFFBQVEsS0FBbUM7QUFDMUMsV0FBTyxLQUFLLFFBQVEsR0FBRyxLQUFLO0FBQUEsRUFDN0I7QUFBQSxFQUVBLFFBQVEsS0FBMEIsT0FBc0I7QUFDdkQsVUFBTSxRQUFRLEtBQUssUUFBUSxFQUFFLEdBQUcsS0FBSyxNQUFNLElBQUksQ0FBQztBQUNoRCxRQUFJLE9BQU87QUFDVixZQUFNLEdBQUcsSUFBSTtBQUFBLElBQ2QsT0FBTztBQUNOLGFBQU8sTUFBTSxHQUFHO0FBQUEsSUFDakI7QUFDQSxTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQUEsRUFFQSxXQUFpQjtBQUNoQixRQUFJLENBQUMsS0FBSyxNQUFNO0FBQ2YsV0FBSyxVQUFVLFNBQVMsaUJBQWlCLHlEQUF5RDtBQUNsRztBQUFBLElBQ0Q7QUFDQSxRQUFJLEtBQUssbUJBQW1CLEtBQUssS0FBSyxTQUFTLEtBQUssZUFBZSxLQUFLLEtBQUssd0JBQXdCLFNBQVMsS0FBSyxPQUFLLEVBQUUsU0FBUyxLQUFLLElBQUksR0FBRztBQUM5SSxXQUFLLFVBQVUsU0FBUyxpQkFBaUIseUNBQXlDLEtBQUssSUFBSTtBQUMzRjtBQUFBLElBQ0Q7QUFDQSxRQUNDLEtBQUssU0FBUyxLQUFLLE1BQU0sWUFBWSxLQUFLLE1BQU0sZUFBZSxLQUFLLE1BQU0sU0FBUyxLQUFLLE1BQU0sWUFBWSxLQUFLLE1BQU0sWUFDcEg7QUFDRCxXQUFLLFVBQVUsU0FBUywwQkFBMEIsd0RBQXdEO0FBQzFHO0FBQUEsSUFDRDtBQUNBLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQUEsRUFFQSxNQUFNLFlBQVksY0FBcUU7QUFDdEYsUUFBSSxpQkFBaUIsUUFBVztBQUMvQixZQUFNLGdCQUFnQjtBQUFBLFFBQ3JCLG9CQUFvQjtBQUFBLFFBQ3BCLG9CQUFvQjtBQUFBLFFBQ3BCLG9CQUFvQjtBQUFBLFFBQ3BCLG9CQUFvQjtBQUFBLFFBQ3BCLG9CQUFvQjtBQUFBLFFBQ3BCLG9CQUFvQjtBQUFBLE1BQ3JCO0FBQ0EsYUFBTyxRQUFRLElBQUksY0FBYyxJQUEwQyxPQUFNLE1BQUs7QUFDckYsY0FBTSxXQUFZLE1BQU0sb0JBQW9CLFlBQ3hDLE1BQU0sb0JBQW9CLGVBQzFCLE1BQU0sb0JBQW9CLFNBQzFCLE1BQU0sb0JBQW9CLE1BQU8sTUFBTSxLQUFLLDJCQUEyQixDQUFDLElBQUksQ0FBQztBQUNqRixlQUFPO0FBQUEsVUFDTixRQUFRO0FBQUEsVUFDUixVQUFVO0FBQUEsVUFDVixjQUFjO0FBQUEsVUFDZCxZQUFZLFNBQVMsU0FDbEIsU0FBUztBQUFBLFlBQ1YsSUFBSTtBQUFBLFlBQ0osT0FBTyxTQUFTLFFBQVEsa0JBQWtCO0FBQUEsWUFDMUMsT0FBTyxVQUFVLFlBQVksUUFBUSxRQUFRO0FBQUEsWUFDN0MsS0FBSyxNQUFNLFNBQVMsQ0FBQyxHQUFHLFlBQVksSUFBSTtBQUFBLFVBQ3pDLENBQUMsSUFDQztBQUFBLFFBQ0o7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFDQSxXQUFPLEtBQUssMkJBQTJCLFlBQVk7QUFBQSxFQUNwRDtBQUFBLEVBRUEsTUFBZ0IsMkJBQTJCLGNBQW9FO0FBQzlHLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQWdCLHVCQUF1QixTQUEyQixjQUFnRjtBQUNqSixjQUFVLEtBQUssUUFBUSxZQUFZLElBQUksS0FBSyx3QkFBd0IsaUJBQWlCO0FBQ3JGLFFBQUksV0FBNEMsQ0FBQztBQUNqRCxZQUFRLGNBQWM7QUFBQSxNQUNyQixLQUFLLG9CQUFvQjtBQUN4QixtQkFBVyxNQUFNLEtBQUsscUJBQXFCLGVBQWUsMEJBQTBCLE9BQU8sRUFBRSxZQUFZO0FBQ3pHO0FBQUEsTUFDRCxLQUFLLG9CQUFvQjtBQUN4QixtQkFBVyxNQUFNLEtBQUsscUJBQXFCLGVBQWUsNkJBQTZCLE9BQU8sRUFBRSxZQUFZO0FBQzVHO0FBQUEsTUFDRCxLQUFLLG9CQUFvQjtBQUN4QixtQkFBWSxNQUFNLEtBQUsscUJBQXFCLGVBQWUsMEJBQTBCLE9BQU8sRUFBRSxZQUFZLEtBQU0sQ0FBQztBQUNqSDtBQUFBLE1BQ0QsS0FBSyxvQkFBb0I7QUFDeEIsbUJBQVcsTUFBTSxLQUFLLHFCQUFxQixlQUFlLHVCQUF1QixPQUFPLEVBQUUsWUFBWTtBQUN0RztBQUFBLE1BQ0QsS0FBSyxvQkFBb0I7QUFDeEIsbUJBQVcsTUFBTSxLQUFLLHFCQUFxQixlQUFlLHFCQUFxQixPQUFPLEVBQUUsWUFBWTtBQUNwRztBQUFBLE1BQ0QsS0FBSyxvQkFBb0I7QUFDeEIsbUJBQVcsTUFBTSxLQUFLLHFCQUFxQixlQUFlLGtDQUFrQyxPQUFPLEVBQUUsWUFBWTtBQUNqSDtBQUFBLElBQ0Y7QUFDQSxXQUFPLFNBQVMsSUFBc0MsV0FBUyxLQUFLLHNDQUFzQyxLQUFLLENBQUM7QUFBQSxFQUNqSDtBQUFBLEVBRVUsc0NBQXNDLE9BQXNDLGdCQUE0QixvQkFBa0U7QUFDbkwsV0FBTztBQUFBLE1BQ04sUUFBUSxNQUFNO0FBQUEsTUFDZCxVQUFVLE1BQU07QUFBQSxNQUNoQixPQUFPLE1BQU0sUUFBUyxpQkFBaUIsTUFBTSxNQUFNLEtBQUssSUFBSSxNQUFNLE1BQU0sTUFBTSxRQUFRLE1BQU0sTUFBTSxRQUFTO0FBQUEsTUFDM0csYUFBYSxTQUFTLE1BQU0sV0FBVyxJQUFJLE1BQU0sY0FBYztBQUFBLE1BQy9ELFVBQVUsSUFBSSxPQUFPLE1BQU0sV0FBVztBQUFBLE1BQ3RDLE1BQU0sTUFBTTtBQUFBLE1BQ1osWUFBWSxTQUFTO0FBQUEsUUFDcEIsSUFBSTtBQUFBLFFBQ0osT0FBTyxTQUFTLFFBQVEsa0JBQWtCO0FBQUEsUUFDMUMsT0FBTyxVQUFVLFlBQVksUUFBUSxRQUFRO0FBQUEsUUFDN0MsS0FBSyxZQUFZO0FBQ2hCLGNBQUksTUFBTSxPQUFPLFNBQVMsb0JBQW9CLFlBQVk7QUFDekQsa0JBQU0sS0FBSyxlQUFlLGVBQWUsa0JBQWtCLE1BQU0sUUFBUSxRQUFXLE1BQU0sUUFBVyxJQUFJO0FBQUEsVUFDMUcsV0FBVyxNQUFNLGFBQWE7QUFDN0Isa0JBQU0sS0FBSyxlQUFlLGVBQWUsNEJBQTRCLE1BQU0sYUFBYSxDQUFDLFVBQVUsR0FBRyxNQUFTO0FBQUEsVUFDaEg7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRCxTQUFTO0FBQUEsUUFDUixTQUFTO0FBQUEsUUFDVCxhQUFhO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFBQSxFQUVEO0FBQUEsRUFFQSxpQkFBeUI7QUFDeEIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLHFCQUE4QjtBQUM3QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsc0JBQXVDO0FBQ3RDLFVBQU0sWUFBWSxLQUFLLHdCQUF3QixhQUFhO0FBQzVELFdBQU8sVUFBVSxpQkFBaUIsVUFBVSxRQUFRLENBQUMsR0FBRztBQUFBLEVBQ3pEO0FBQUEsRUFFQSxjQUFjLFdBQXNCO0FBQ25DLFFBQUksS0FBSyxtQkFBbUIsT0FBTyxRQUFRLFNBQVMsTUFBTSxrQkFBa0I7QUFDM0UsV0FBSyxZQUFZLFdBQVcsQ0FBQyxFQUFFLGNBQWMsVUFBVSxDQUFDLEdBQUcsRUFBRSxnQkFBZ0IsS0FBSyxDQUFDO0FBQUEsSUFDcEYsT0FBTztBQUNOLFdBQUssWUFBWSxXQUFXLENBQUMsRUFBRSxXQUFXLFVBQVUsQ0FBQyxHQUFHLEVBQUUsZ0JBQWdCLEtBQUssQ0FBQztBQUFBLElBQ2pGO0FBQUEsRUFDRDtBQUFBLEVBRUEsT0FBYTtBQUNaLFNBQUssY0FBYyxTQUFTO0FBQUEsRUFDN0I7QUFBQSxFQUVRLGtCQUFrQixTQUFvQztBQUM3RCxRQUFJLEtBQUssU0FBUyxRQUFRLE1BQU07QUFDL0IsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLEtBQUssU0FBUyxRQUFRLE1BQU07QUFDL0IsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLENBQUMsT0FBTyxLQUFLLFNBQVMsQ0FBQyxHQUFHLFFBQVEsbUJBQW1CLENBQUMsQ0FBQyxHQUFHO0FBQzdELGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLE9BQU8sT0FBTyxLQUFLLGNBQWMsQ0FBQyxHQUFHLFFBQVEsY0FBYyxDQUFDLEdBQUcsQ0FBQyxHQUFHLE1BQU0sRUFBRSxTQUFTLE1BQU0sRUFBRSxTQUFTLENBQUMsR0FBRztBQUM3RyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFnQixZQUFZLFNBQWtFO0FBQzdGLFFBQUksQ0FBQyxLQUFLLGtCQUFrQixPQUFPLEdBQUc7QUFDckM7QUFBQSxJQUNEO0FBQ0EsU0FBSyxTQUFTO0FBQ2QsUUFBSSxLQUFLLFNBQVM7QUFDakI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxrQkFBc0QsS0FBSyxRQUM5RCxLQUFLLE1BQU0sWUFBWSxLQUFLLE1BQU0sZUFBZSxLQUFLLE1BQU0sU0FBUyxLQUFLLE1BQU0sZUFBZSxLQUFLLE1BQU0sYUFBYSxTQUFZLEtBQUssUUFDeEk7QUFFSCxXQUFPLE1BQU0sS0FBSyxpQ0FBaUMsY0FBYyxTQUFTO0FBQUEsTUFDekUsTUFBTSxLQUFLO0FBQUEsTUFDWCxNQUFNLEtBQUs7QUFBQSxNQUNYLGlCQUFpQixRQUFRLG1CQUFtQixDQUFDLGtCQUFrQixDQUFDLElBQUk7QUFBQSxNQUNwRSxZQUFZLEtBQUs7QUFBQSxJQUNsQixDQUFDO0FBQUEsRUFDRjtBQU9EO0FBcFRzQixpQ0FBZjtBQUFBLEVBYUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBckJtQjtBQXNUZixJQUFNLHlCQUFOLGNBQXFDLCtCQUErQjtBQUFBLEVBSTFFLFlBQ1MsVUFDQyxjQUNBLFNBQ2lDLHdCQUNGLHNCQUNMLGtDQUNULHlCQUNULGdCQUNTLHlCQUNaLGFBQ08sb0JBQ1AsYUFDd0IsNEJBQ2Ysc0JBQ3RCO0FBQ0Q7QUFBQSxNQUNDLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULHVCQUF1QixlQUFlLE9BQU8sU0FBUztBQUFBLE1BQ3REO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBOUJRO0FBQ0M7QUFDQTtBQUNpQztBQUNGO0FBaUZ6QyxTQUFRLHNCQUErQjtBQXREdEMsU0FBSyxzQkFBc0IsS0FBSyxxQkFBcUIsU0FBUyx5QkFBeUIsTUFBTSxLQUFLLFFBQVE7QUFDMUcsU0FBSyxVQUFVLHFCQUFxQjtBQUFBLE1BQXlCLE9BQUs7QUFDakUsWUFBSSxFQUFFLHFCQUFxQix5QkFBeUIsR0FBRztBQUN0RCxlQUFLLHFCQUFxQixLQUFLLHFCQUFxQixTQUFTLHlCQUF5QixNQUFNLEtBQUssUUFBUTtBQUFBLFFBQzFHO0FBQUEsTUFDRDtBQUFBLElBQ0EsQ0FBQztBQUNELFNBQUssVUFBVSxLQUFLLHVCQUF1QiwwQkFBMEIsTUFBTSxLQUFLLFNBQVMsS0FBSyx1QkFBdUIsZUFBZSxPQUFPLEtBQUssUUFBUSxFQUFFLENBQUM7QUFDM0osU0FBSyxVQUFVLEtBQUssd0JBQXdCLG9CQUFvQixDQUFDLEVBQUUsUUFBUSxNQUFNO0FBQ2hGLFlBQU0sVUFBVSxRQUFRLEtBQUssT0FBSyxFQUFFLE9BQU8sS0FBSyxRQUFRLEVBQUU7QUFDMUQsVUFBSSxTQUFTO0FBQ1osYUFBSyxXQUFXO0FBQ2hCLGFBQUssTUFBTTtBQUNYLGFBQUssYUFBYSxLQUFLLEVBQUUsU0FBUyxLQUFLLENBQUM7QUFBQSxNQUN6QztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLFlBQVksTUFBTSxLQUFLLFFBQVEsWUFBWSxDQUFDO0FBQzNELFNBQUssVUFBVSxZQUFZLGlCQUFpQixPQUFLO0FBQ2hELFVBQUksRUFBRSxRQUFRLEtBQUssUUFBUSxZQUFZLEdBQUc7QUFDekMsYUFBSyxhQUFhLEtBQUssRUFBRSxVQUFVLEtBQUssQ0FBQztBQUFBLE1BQzFDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUF4REEsSUFBSSxVQUE0QjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQVU7QUFBQSxFQTBEOUMsb0JBQWtEO0FBQzNELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLFFBQWM7QUFDYixTQUFLLE9BQU8sS0FBSyxTQUFTO0FBQzFCLFNBQUssT0FBTyxLQUFLLFNBQVM7QUFDMUIsU0FBSyxRQUFRLEtBQUssU0FBUztBQUMzQixTQUFLLGFBQWEsS0FBSyxTQUFTO0FBQUEsRUFDakM7QUFBQSxFQUVPLGlCQUFpQixPQUFjLFVBQXVCO0FBQzVELFVBQU0sYUFBYSxJQUFJLFlBQVksS0FBSyxjQUFjLENBQUMsQ0FBQztBQUN4RCxlQUFXLGFBQWEsT0FBTztBQUM5QixpQkFBVyxJQUFJLFNBQVM7QUFBQSxJQUN6QjtBQUNBLGVBQVcsYUFBYSxVQUFVO0FBQ2pDLGlCQUFXLE9BQU8sU0FBUztBQUFBLElBQzVCO0FBQ0EsU0FBSyxhQUFhLENBQUMsR0FBRyxXQUFXLE9BQU8sQ0FBQztBQUFBLEVBQzFDO0FBQUEsRUFFQSxNQUFhLHlCQUF3QztBQUNwRCxRQUFJLEtBQUsscUJBQXFCO0FBQzdCLFlBQU0sS0FBSyxxQkFBcUIsWUFBWSwyQkFBMkIsSUFBSTtBQUFBLElBQzVFLE9BQU87QUFDTixZQUFNLEtBQUsscUJBQXFCLFlBQVksMkJBQTJCLEtBQUssUUFBUSxJQUFJO0FBQUEsSUFDekY7QUFBQSxFQUNEO0FBQUEsRUFHQSxJQUFJLHFCQUE4QjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQXFCO0FBQUEsRUFDckUsSUFBSSxtQkFBbUIsb0JBQTZCO0FBQ25ELFFBQUksS0FBSyx3QkFBd0Isb0JBQW9CO0FBQ3BELFdBQUssc0JBQXNCO0FBQzNCLFdBQUssYUFBYSxLQUFLLEVBQUUsa0JBQWtCLEtBQUssQ0FBQztBQUFBLElBQ2xEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYSw2QkFBNEM7QUFDeEQsUUFBSSxLQUFLLHVCQUF1QixlQUFlLE9BQU8sS0FBSyxRQUFRLElBQUk7QUFDdEUsWUFBTSxLQUFLLGlDQUFpQyxjQUFjLEtBQUssd0JBQXdCLGNBQWM7QUFBQSxJQUN0RyxPQUFPO0FBQ04sWUFBTSxLQUFLLGlDQUFpQyxjQUFjLEtBQUssT0FBTztBQUFBLElBQ3ZFO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBeUIsU0FBd0I7QUFDaEQsVUFBTSxLQUFLLFlBQVksS0FBSyxPQUFPO0FBQUEsRUFDcEM7QUFBQSxFQUVBLE1BQXlCLDJCQUEyQixjQUFvRTtBQUN2SCxRQUFJLGlCQUFpQixvQkFBb0IsWUFBWTtBQUNwRCxZQUFNLFdBQVcsTUFBTSxLQUFLLHFCQUFxQixlQUFlLGtDQUFrQyxLQUFLLE9BQU8sRUFBRSxZQUFZO0FBQzVILGFBQU8sU0FBUyxJQUFzQyxXQUNyRCxLQUFLO0FBQUEsUUFDSjtBQUFBLFFBQ0E7QUFBQSxRQUNBLENBQUM7QUFBQSxVQUNBLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxzQkFBc0IsaUNBQWlDO0FBQUEsVUFDdkUsU0FBUyxNQUFNO0FBQUEsVUFDZixTQUFTO0FBQUEsVUFDVCxPQUFPO0FBQUEsVUFDUCxTQUFTO0FBQUEsVUFDVCxLQUFLLFlBQVk7QUFDaEIsa0JBQU0sYUFBYSxNQUFNLEtBQUssMkJBQTJCLGFBQWEsUUFBVyxLQUFLLFFBQVEsa0JBQWtCO0FBQ2hILGtCQUFNLFlBQVksV0FBVyxLQUFLLE9BQUssa0JBQWtCLEVBQUUsWUFBWSxNQUFNLFVBQVUsQ0FBQztBQUN4RixnQkFBSSxXQUFXO0FBQ2Qsb0JBQU0sS0FBSywyQkFBMkIsdUJBQXVCLFdBQVcsS0FBSyxRQUFRLGtCQUFrQjtBQUFBLFlBQ3hHO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0g7QUFDQSxXQUFPLEtBQUssdUJBQXVCLEtBQUssU0FBUyxZQUFZO0FBQUEsRUFDOUQ7QUFBQSxFQUVTLGlCQUF5QjtBQUNqQyxXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBRUQ7QUE5SWEseUJBQU47QUFBQSxFQVFKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBbEJVO0FBZ0piLE1BQU0sNENBQTRDO0FBRTNDLElBQU0sb0JBQU4sY0FBZ0MsK0JBQStCO0FBQUEsRUFXckUsWUFDQyxVQUNTLGNBQ0EsU0FFNkMsb0NBQ25CLGtDQUNULHlCQUNULGdCQUNTLHlCQUNaLGFBQ08sb0JBQ1AsYUFDd0IsNEJBQ2Ysc0JBQ3RCO0FBQ0Q7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUE3QlM7QUFDQTtBQUU2QztBQWR2RCxTQUFRLHFCQUFxQixJQUFJLFlBQW9CO0FBSXJELFNBQVEsV0FBNEM7QUEwRXBELFNBQWlCLGlDQUFpQyxLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQXJDckYsU0FBSyxPQUFPLEtBQUssY0FBYyxLQUFLLGtCQUFrQjtBQUN0RCxTQUFLLFlBQVk7QUFDakIsU0FBSyxhQUFhLEtBQUssaUJBQWlCLFFBQVE7QUFDaEQsU0FBSyxXQUFXO0FBQ2hCLFNBQUssVUFBVSxLQUFLLFlBQVksaUJBQWlCLDJDQUEyQyxLQUFLLFVBQVUsSUFBSSwyQkFBMkIsQ0FBQyxDQUFDLENBQUM7QUFDN0ksU0FBSyxVQUFVLGFBQWEsTUFBTTtBQUNqQyxVQUFJLEtBQUssZ0JBQWdCO0FBQ3hCLGFBQUssd0JBQXdCLGNBQWMsS0FBSyxjQUFjO0FBQUEsTUFDL0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQWxEQSxJQUFJLG9CQUF5QztBQUFFLFdBQU8sS0FBSztBQUFBLEVBQW9CO0FBQUEsRUFxRC9FLElBQUksV0FBK0M7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFXO0FBQUEsRUFDNUUsSUFBSSxTQUFTLFVBQThDO0FBQzFELFFBQUksS0FBSyxjQUFjLFVBQVU7QUFDaEMsV0FBSyxZQUFZO0FBQ2pCLFdBQUssYUFBYSxLQUFLLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFDekMsV0FBSyxRQUFRO0FBQ2IsV0FBSyxZQUFZLEtBQUssaUJBQWlCLFFBQVE7QUFDL0MsVUFBSSxvQkFBb0IsS0FBSztBQUM1QixhQUFLLGlCQUFpQixPQUFPO0FBQzdCLGFBQUssa0JBQWtCO0FBQUEsTUFDeEI7QUFDQSxXQUFLLFdBQVc7QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFBQSxFQUdBLElBQUksWUFBa0Q7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFZO0FBQUEsRUFDaEYsSUFBSSxVQUFVLE9BQTZDO0FBQzFELFFBQUksQ0FBQyxPQUFPLEtBQUssWUFBWSxLQUFLLEdBQUc7QUFDcEMsV0FBSyxhQUFhO0FBQ2xCLFdBQUssYUFBYSxLQUFLLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFBQSxJQUMzQztBQUFBLEVBQ0Q7QUFBQSxFQUlBLElBQUksaUJBQStDO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBaUI7QUFBQSxFQUNsRixJQUFJLGVBQWUsU0FBdUM7QUFDekQsUUFBSSxLQUFLLG9CQUFvQixTQUFTO0FBQ3JDLFdBQUssa0JBQWtCO0FBQ3ZCLFdBQUssYUFBYSxLQUFLLEVBQUUsU0FBUyxLQUFLLENBQUM7QUFDeEMsV0FBSywrQkFBK0IsTUFBTTtBQUMxQyxVQUFJLEtBQUssaUJBQWlCO0FBQ3pCLGFBQUssK0JBQStCLElBQUksS0FBSyxZQUFZLE1BQU0sS0FBSyxnQkFBZ0IsWUFBWSxDQUFDO0FBQ2pHLGFBQUssK0JBQStCLElBQUksS0FBSyxZQUFZLGlCQUFpQixPQUFLO0FBQzlFLGNBQUksQ0FBQyxLQUFLLGlCQUFpQjtBQUMxQjtBQUFBLFVBQ0Q7QUFDQSxjQUFJLEVBQUUsUUFBUSxLQUFLLGdCQUFnQixZQUFZLEdBQUc7QUFDakQsaUJBQUssYUFBYSxLQUFLLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFBQSxVQUMxQztBQUFBLFFBQ0QsQ0FBQyxDQUFDO0FBQUEsTUFDSDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFVSxvQkFBa0Q7QUFDM0QsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRVEsaUJBQWlCLFVBQW9GO0FBQzVHLFdBQU8sV0FBVztBQUFBLE1BQ2pCLFVBQVU7QUFBQSxNQUNWLGFBQWE7QUFBQSxNQUNiLFVBQVU7QUFBQSxNQUNWLE9BQU87QUFBQSxNQUNQLFlBQVk7QUFBQSxNQUNaLEtBQUs7QUFBQSxJQUNOLElBQUk7QUFBQSxFQUNMO0FBQUEsRUFFQSxNQUFjLGFBQTRCO0FBQ3pDLFNBQUssV0FBVztBQUNoQixRQUFJO0FBQ0gsVUFBSSxLQUFLLG9CQUFvQixLQUFLO0FBQ2pDLGNBQU0sS0FBSyxnQkFBZ0IsS0FBSyxRQUFRO0FBQ3hDLFlBQUksS0FBSyxVQUFVO0FBQ2xCLGVBQUssa0JBQWtCLElBQUksS0FBSyxVQUFVLEtBQUssU0FBUyxJQUFJO0FBQzVELGNBQUksS0FBSyxnQkFBZ0IsS0FBSyxNQUFNO0FBQ25DLGlCQUFLLE9BQU8sS0FBSyxjQUFjLEtBQUssU0FBUyxRQUFRO0FBQUEsVUFDdEQ7QUFDQSxjQUFJLEtBQUssZ0JBQWdCLEtBQUssTUFBTTtBQUNuQyxpQkFBSyxPQUFPLEtBQUssY0FBYyxLQUFLLFNBQVM7QUFBQSxVQUM5QztBQUNBLGVBQUssWUFBWSxvQkFBb0IsVUFBVSxDQUFDLENBQUMsS0FBSyxTQUFTLFFBQVE7QUFDdkUsZUFBSyxZQUFZLG9CQUFvQixhQUFhLENBQUMsQ0FBQyxLQUFLLFNBQVMsV0FBVztBQUM3RSxlQUFLLFlBQVksb0JBQW9CLE9BQU8sQ0FBQyxDQUFDLEtBQUssU0FBUyxLQUFLO0FBQ2pFLGVBQUssWUFBWSxvQkFBb0IsVUFBVSxDQUFDLENBQUMsS0FBSyxTQUFTLFFBQVE7QUFDdkUsZUFBSyxZQUFZLG9CQUFvQixZQUFZLENBQUMsQ0FBQyxLQUFLLFNBQVMsVUFBVTtBQUMzRSxlQUFLLFlBQVksb0JBQW9CLEtBQUssQ0FBQyxDQUFDLEtBQUssU0FBUyxHQUFHO0FBQzdELGVBQUssYUFBYSxLQUFLLEVBQUUsY0FBYyxLQUFLLENBQUM7QUFBQSxRQUM5QztBQUNBO0FBQUEsTUFDRDtBQUVBLFVBQUksa0JBQWtCLEtBQUssUUFBUSxHQUFHO0FBQ3JDLFlBQUksS0FBSyxnQkFBZ0IsS0FBSyxNQUFNO0FBQ25DLGVBQUssT0FBTyxLQUFLLGNBQWMsU0FBUyxhQUFhLGNBQWMsS0FBSyxTQUFTLElBQUk7QUFBQSxRQUN0RjtBQUNBLFlBQUksS0FBSyxnQkFBZ0IsS0FBSyxNQUFNO0FBQ25DLGVBQUssT0FBTyxLQUFLLGNBQWMsS0FBSyxTQUFTO0FBQUEsUUFDOUM7QUFDQSxhQUFLLFlBQVksb0JBQW9CLFVBQVUsSUFBSTtBQUNuRCxhQUFLLFlBQVksb0JBQW9CLGFBQWEsSUFBSTtBQUN0RCxhQUFLLFlBQVksb0JBQW9CLE9BQU8sSUFBSTtBQUNoRCxhQUFLLFlBQVksb0JBQW9CLFVBQVUsSUFBSTtBQUNuRCxhQUFLLFlBQVksb0JBQW9CLFlBQVksSUFBSTtBQUNyRCxhQUFLLFlBQVksb0JBQW9CLEtBQUssSUFBSTtBQUM5QyxhQUFLLGFBQWEsS0FBSyxFQUFFLGNBQWMsS0FBSyxDQUFDO0FBQzdDO0FBQUEsTUFDRDtBQUVBLFVBQUksS0FBSyxnQkFBZ0IsS0FBSyxNQUFNO0FBQ25DLGFBQUssT0FBTyxLQUFLLGNBQWMsS0FBSyxrQkFBa0I7QUFBQSxNQUN2RDtBQUNBLFVBQUksS0FBSyxnQkFBZ0IsS0FBSyxNQUFNO0FBQ25DLGFBQUssT0FBTyxLQUFLLGNBQWM7QUFBQSxNQUNoQztBQUNBLFdBQUssWUFBWSxvQkFBb0IsVUFBVSxLQUFLO0FBQ3BELFdBQUssWUFBWSxvQkFBb0IsYUFBYSxLQUFLO0FBQ3ZELFdBQUssWUFBWSxvQkFBb0IsT0FBTyxLQUFLO0FBQ2pELFdBQUssWUFBWSxvQkFBb0IsVUFBVSxLQUFLO0FBQ3BELFdBQUssWUFBWSxvQkFBb0IsWUFBWSxLQUFLO0FBQ3RELFdBQUssWUFBWSxvQkFBb0IsS0FBSyxLQUFLO0FBQy9DLFdBQUssYUFBYSxLQUFLLEVBQUUsY0FBYyxLQUFLLENBQUM7QUFBQSxJQUM5QyxVQUFFO0FBQ0QsV0FBSyxXQUFXO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBQUEsRUFFUSxvQkFBNEI7QUFDbkMsVUFBTSxPQUFPLFNBQVMsWUFBWSxVQUFVO0FBQzVDLFVBQU0sWUFBWSxJQUFJLE9BQU8sR0FBRyxJQUFJLFdBQVc7QUFDL0MsUUFBSSxZQUFZO0FBQ2hCLGVBQVcsV0FBVyxLQUFLLHdCQUF3QixVQUFVO0FBQzVELFlBQU0sVUFBVSxVQUFVLEtBQUssUUFBUSxJQUFJO0FBQzNDLFlBQU0sUUFBUSxVQUFVLFNBQVMsUUFBUSxDQUFDLENBQUMsSUFBSTtBQUMvQyxrQkFBWSxRQUFRLFlBQVksUUFBUTtBQUFBLElBQ3pDO0FBQ0EsV0FBTyxHQUFHLElBQUksSUFBSSxZQUFZLENBQUM7QUFBQSxFQUNoQztBQUFBLEVBRUEsTUFBTSxnQkFBZ0IsS0FBb0Q7QUFDekUsUUFBSSxDQUFDLEtBQUssaUJBQWlCO0FBQzFCLFdBQUssa0JBQWtCLHdCQUF3QixPQUFNLFVBQVM7QUFDN0QsY0FBTSxXQUFXLE1BQU0sS0FBSyxtQ0FBbUMsdUJBQXVCLEdBQUc7QUFDekYsWUFBSSxDQUFDLE1BQU0seUJBQXlCO0FBQ25DLGVBQUssV0FBVztBQUFBLFFBQ2pCO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUNBLFVBQU0sS0FBSztBQUNYLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLFlBQVksY0FBNEM7QUFDdkQsUUFBSSxLQUFLLFVBQVU7QUFDbEIsY0FBUSxjQUFjO0FBQUEsUUFDckIsS0FBSyxvQkFBb0I7QUFDeEIsaUJBQU8sQ0FBQyxDQUFDLEtBQUssU0FBUztBQUFBLFFBQ3hCLEtBQUssb0JBQW9CO0FBQ3hCLGlCQUFPLENBQUMsQ0FBQyxLQUFLLFNBQVM7QUFBQSxRQUN4QixLQUFLLG9CQUFvQjtBQUN4QixpQkFBTyxDQUFDLENBQUMsS0FBSyxTQUFTO0FBQUEsUUFDeEIsS0FBSyxvQkFBb0I7QUFDeEIsaUJBQU8sQ0FBQyxDQUFDLEtBQUssU0FBUztBQUFBLFFBQ3hCLEtBQUssb0JBQW9CO0FBQ3hCLGlCQUFPLENBQUMsQ0FBQyxLQUFLLFNBQVM7QUFBQSxNQUN6QjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsWUFBWSxLQUFtQztBQUM5QyxXQUFPLEtBQUssWUFBWSxHQUFHLEtBQUs7QUFBQSxFQUNqQztBQUFBLEVBRUEsWUFBWSxLQUEwQixPQUFzQjtBQUMzRCxVQUFNLFFBQVEsS0FBSyxZQUFZLEVBQUUsR0FBRyxLQUFLLFVBQVUsSUFBSSxDQUFDO0FBQ3hELFVBQU0sR0FBRyxJQUFJO0FBQ2IsU0FBSyxZQUFZO0FBQUEsRUFDbEI7QUFBQSxFQUVBLGtCQUFzQztBQUNyQyxRQUFJLGtCQUFrQixLQUFLLFFBQVEsR0FBRztBQUNyQyxhQUFPLEtBQUssU0FBUztBQUFBLElBQ3RCO0FBQ0EsUUFBSSxLQUFLLG9CQUFvQixLQUFLO0FBQ2pDLGFBQU8sS0FBSyxrQkFBa0IsSUFBSSxLQUFLLFFBQVE7QUFBQSxJQUNoRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUF5QiwyQkFBMkIsY0FBb0U7QUFDdkgsUUFBSSxLQUFLLFFBQVEsWUFBWSxHQUFHO0FBQy9CLGFBQU8sS0FBSyx1QkFBdUIsS0FBSyx3QkFBd0IsZ0JBQWdCLFlBQVk7QUFBQSxJQUM3RjtBQUNBLFFBQUksQ0FBQyxLQUFLLFlBQVksWUFBWSxHQUFHO0FBQ3BDLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFDQSxRQUFJLEtBQUssZ0JBQWdCO0FBQ3hCLGFBQU8sS0FBSyx1QkFBdUIsS0FBSyxnQkFBZ0IsWUFBWTtBQUFBLElBQ3JFO0FBQ0EsUUFBSSxLQUFLLG9CQUFvQixLQUFLO0FBQ2pDLFlBQU0sS0FBSyxnQkFBZ0IsS0FBSyxRQUFRO0FBQ3hDLFVBQUksQ0FBQyxLQUFLLFVBQVU7QUFDbkIsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUNBLGFBQU8sS0FBSywrQkFBK0IsS0FBSyxVQUFVLFlBQVk7QUFBQSxJQUN2RTtBQUNBLFFBQUksS0FBSyxVQUFVO0FBQ2xCLGFBQU8sS0FBSyx1QkFBdUIsS0FBSyxVQUFVLFlBQVk7QUFBQSxJQUMvRDtBQUNBLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQWMsK0JBQStCLGlCQUEyQyxjQUFnRjtBQUN2SyxVQUFNLFdBQVcsSUFBSSxLQUFLLEVBQUUsUUFBUSwyQ0FBMkMsTUFBTSxrQkFBa0IsZ0JBQWdCLElBQUksR0FBRyxDQUFDO0FBQy9ILFVBQU0sZ0JBQWdCLElBQUksS0FBSyxFQUFFLFFBQVEsMkNBQTJDLE1BQU0sZUFBZSxnQkFBZ0IsSUFBSSxHQUFHLENBQUM7QUFDakksVUFBTSxVQUFVLGtCQUFrQixhQUFhLEdBQUcsS0FBSyxNQUFNLFVBQVUsYUFBYTtBQUNwRixZQUFRLGNBQWM7QUFBQSxNQUNyQixLQUFLLG9CQUFvQjtBQUN4QixZQUFJLGdCQUFnQixVQUFVO0FBQzdCLGdCQUFNLEtBQUsscUJBQXFCLGVBQWUsZ0JBQWdCLEVBQUUsTUFBTSxnQkFBZ0IsVUFBVSxPQUFPO0FBQ3hHLGlCQUFPLEtBQUssdUJBQXVCLFNBQVMsWUFBWTtBQUFBLFFBQ3pEO0FBQ0EsZUFBTyxDQUFDO0FBQUEsTUFDVCxLQUFLLG9CQUFvQjtBQUN4QixZQUFJLGdCQUFnQixhQUFhO0FBQ2hDLGdCQUFNLEtBQUsscUJBQXFCLGVBQWUsbUJBQW1CLEVBQUUsTUFBTSxnQkFBZ0IsYUFBYSxPQUFPO0FBQzlHLGlCQUFPLEtBQUssdUJBQXVCLFNBQVMsWUFBWTtBQUFBLFFBQ3pEO0FBQ0EsZUFBTyxDQUFDO0FBQUEsTUFDVCxLQUFLLG9CQUFvQjtBQUN4QixZQUFJLGdCQUFnQixVQUFVO0FBQzdCLGdCQUFNLEtBQUsscUJBQXFCLGVBQWUsZ0JBQWdCLEVBQUUsTUFBTSxnQkFBZ0IsVUFBVSxPQUFPO0FBQ3hHLGlCQUFPLEtBQUssdUJBQXVCLFNBQVMsWUFBWTtBQUFBLFFBQ3pEO0FBQ0EsZUFBTyxDQUFDO0FBQUEsTUFDVCxLQUFLLG9CQUFvQjtBQUN4QixZQUFJLGdCQUFnQixPQUFPO0FBQzFCLGdCQUFNLEtBQUsscUJBQXFCLGVBQWUsYUFBYSxFQUFFLE1BQU0sZ0JBQWdCLE9BQU8sT0FBTztBQUNsRyxpQkFBTyxLQUFLLHVCQUF1QixTQUFTLFlBQVk7QUFBQSxRQUN6RDtBQUNBLGVBQU8sQ0FBQztBQUFBLE1BQ1QsS0FBSyxvQkFBb0I7QUFDeEIsWUFBSSxnQkFBZ0IsS0FBSztBQUN4QixnQkFBTSxLQUFLLHFCQUFxQixlQUFlLGtCQUFrQixFQUFFLE1BQU0sZ0JBQWdCLEtBQUssT0FBTztBQUNyRyxpQkFBTyxLQUFLLHVCQUF1QixTQUFTLFlBQVk7QUFBQSxRQUN6RDtBQUNBLGVBQU8sQ0FBQztBQUFBLE1BQ1QsS0FBSyxvQkFBb0I7QUFDeEIsWUFBSSxnQkFBZ0IsWUFBWTtBQUMvQixnQkFBTSxXQUFXLE1BQU0sS0FBSyxxQkFBcUIsZUFBZSxrQ0FBa0MsZ0JBQWdCLFVBQVUsRUFBRSxZQUFZO0FBQzFJLGlCQUFPLFNBQVMsSUFBSSxXQUFTLEtBQUssc0NBQXNDLEtBQUssQ0FBQztBQUFBLFFBQy9FO0FBQ0EsZUFBTyxDQUFDO0FBQUEsSUFDVjtBQUNBLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFBQSxFQUVTLHFCQUE4QjtBQUN0QyxXQUFPLENBQUMsS0FBSztBQUFBLEVBQ2Q7QUFBQSxFQUVTLGlCQUF5QjtBQUNqQyxXQUFPLEtBQUssZ0JBQWdCLFFBQVE7QUFBQSxFQUNyQztBQUFBLEVBRUEsTUFBeUIsU0FBd0I7QUFDaEQsUUFBSSxLQUFLLGdCQUFnQjtBQUN4QixZQUFNLFVBQVUsTUFBTSxLQUFLLFlBQVksS0FBSyxjQUFjO0FBQzFELFVBQUksU0FBUztBQUNaLGFBQUssaUJBQWlCO0FBQUEsTUFDdkI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBblVhLG9CQUFOO0FBQUEsRUFnQko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXpCVTtBQXFVTixJQUFNLDhCQUFOLGNBQTBDLFlBQVk7QUFBQSxFQXNDNUQsWUFDMkMsd0JBQ0MseUJBQ1Msa0NBQ0Usb0NBQ3JCLGVBQ0csa0JBQ0wsYUFDRyxnQkFDRCxlQUNPLHNCQUN2QztBQUNELFVBQU07QUFYb0M7QUFDQztBQUNTO0FBQ0U7QUFDckI7QUFDRztBQUNMO0FBQ0c7QUFDRDtBQUNPO0FBdEN6QyxTQUFRLFlBQWlFLENBQUM7QUF1QjFFLFNBQVEsZUFBZSxLQUFLLFVBQVUsSUFBSSxRQUFvRCxDQUFDO0FBQy9GLFNBQVMsY0FBYyxLQUFLLGFBQWE7QUFpQnhDLGVBQVcsV0FBVyx3QkFBd0IsVUFBVTtBQUN2RCxVQUFJLENBQUMsUUFBUSxZQUFZO0FBQ3hCLGFBQUssVUFBVSxLQUFLLEtBQUsscUJBQXFCLE9BQU8sQ0FBQztBQUFBLE1BQ3ZEO0FBQUEsSUFDRDtBQUNBLFNBQUssVUFBVSxhQUFhLE1BQU0sS0FBSyxVQUFVLE9BQU8sR0FBRyxLQUFLLFVBQVUsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsV0FBVyxNQUFNLFlBQVksUUFBUSxDQUFDLENBQUMsQ0FBQztBQUNsSSxTQUFLLFVBQVUsd0JBQXdCLG9CQUFvQixPQUFLLEtBQUssb0JBQW9CLENBQUMsQ0FBQyxDQUFDO0FBQUEsRUFDN0Y7QUFBQSxFQXZEQSxPQUFPLFlBQVksc0JBQTBFO0FBQzVGLFFBQUksQ0FBQyw0QkFBNEIsVUFBVTtBQUMxQyxrQ0FBNEIsV0FBVyxxQkFBcUIsZUFBZSwyQkFBMkI7QUFBQSxJQUN2RztBQUNBLFdBQU8sNEJBQTRCO0FBQUEsRUFDcEM7QUFBQSxFQUdBLElBQUksV0FBNkM7QUFDaEQsV0FBTyxLQUFLLFVBQ1YsSUFBSSxDQUFDLENBQUMsT0FBTyxNQUFNLE9BQU8sRUFDMUIsS0FBSyxDQUFDLEdBQUcsTUFBTTtBQUNmLFVBQUksYUFBYSxtQkFBbUI7QUFDbkMsZUFBTztBQUFBLE1BQ1I7QUFDQSxVQUFJLGFBQWEsbUJBQW1CO0FBQ25DLGVBQU87QUFBQSxNQUNSO0FBQ0EsVUFBSSxhQUFhLDBCQUEwQixFQUFFLFFBQVEsV0FBVztBQUMvRCxlQUFPO0FBQUEsTUFDUjtBQUNBLFVBQUksYUFBYSwwQkFBMEIsRUFBRSxRQUFRLFdBQVc7QUFDL0QsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPLEVBQUUsS0FBSyxjQUFjLEVBQUUsSUFBSTtBQUFBLElBQ25DLENBQUM7QUFBQSxFQUNIO0FBQUEsRUErQlEsb0JBQW9CLEdBQWlDO0FBQzVELFFBQUksVUFBVTtBQUNkLGVBQVcsV0FBVyxFQUFFLE9BQU87QUFDOUIsVUFBSSxDQUFDLFFBQVEsY0FBYyxRQUFRLFNBQVMsS0FBSyxtQkFBbUIsTUFBTTtBQUN6RSxrQkFBVTtBQUNWLGFBQUssVUFBVSxLQUFLLEtBQUsscUJBQXFCLE9BQU8sQ0FBQztBQUFBLE1BQ3ZEO0FBQUEsSUFDRDtBQUNBLGVBQVcsV0FBVyxFQUFFLFNBQVM7QUFDaEMsVUFBSSxRQUFRLE9BQU8sS0FBSyxtQkFBbUIsZ0JBQWdCLElBQUk7QUFDOUQsYUFBSyxrQkFBa0IsaUJBQWlCO0FBQUEsTUFDekM7QUFDQSxZQUFNLFFBQVEsS0FBSyxVQUFVLFVBQVUsQ0FBQyxDQUFDLENBQUMsTUFBTSxhQUFhLDBCQUEwQixFQUFFLFFBQVEsT0FBTyxRQUFRLEVBQUU7QUFDbEgsVUFBSSxVQUFVLElBQUk7QUFDakIsa0JBQVU7QUFDVixhQUFLLFVBQVUsT0FBTyxPQUFPLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLFdBQVcsTUFBTSxZQUFZLFFBQVEsQ0FBQztBQUFBLE1BQy9FO0FBQUEsSUFDRDtBQUNBLFFBQUksU0FBUztBQUNaLFdBQUssYUFBYSxLQUFLLE1BQVM7QUFBQSxJQUNqQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLGVBQXlEO0FBQ3hELFFBQUksQ0FBQyxLQUFLLFdBQVc7QUFDcEIsV0FBSyxZQUFZLEtBQUssaUNBQWlDLDJCQUEyQjtBQUFBLElBQ25GO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRVEscUJBQXFCLFNBQXNFO0FBQ2xHLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUV4QyxVQUFNLGlCQUFpQixZQUFZLElBQUksSUFBSTtBQUFBLE1BQzFDO0FBQUEsTUFDQSxTQUFTLFVBQVUscUNBQXFDO0FBQUEsTUFDeEQsVUFBVSxZQUFZLFFBQVEsS0FBSztBQUFBLE1BQ25DO0FBQUEsTUFDQSxNQUFNLEtBQUssaUNBQWlDLGNBQWMsZUFBZSxPQUFPO0FBQUEsSUFDakYsQ0FBQztBQUVELFVBQU0sd0JBQXdCLFlBQVksSUFBSSxJQUFJO0FBQUEsTUFDakQ7QUFBQSxNQUNBLFNBQVMsbUJBQW1CLGNBQWM7QUFBQSxNQUMxQyxVQUFVLFlBQVksUUFBUSxJQUFJO0FBQUEsTUFDbEM7QUFBQSxNQUFNLE1BQU0sS0FBSyxpQkFBaUIsZUFBZSxPQUFPO0FBQUEsSUFDekQsQ0FBQztBQUVELFVBQU0sZUFBZSxZQUFZLElBQUksSUFBSTtBQUFBLE1BQ3hDO0FBQUEsTUFDQSxTQUFTLFVBQVUsV0FBVztBQUFBLE1BQzlCLFVBQVUsWUFBWSxRQUFRLE1BQU07QUFBQSxNQUNwQztBQUFBLE1BQ0EsTUFBTSxLQUFLLG1DQUFtQyxjQUFjLE9BQU87QUFBQSxJQUNwRSxDQUFDO0FBRUQsVUFBTSxlQUFlLFlBQVksSUFBSSxJQUFJO0FBQUEsTUFDeEM7QUFBQSxNQUNBLFNBQVMsVUFBVSxRQUFRO0FBQUEsTUFDM0IsVUFBVSxZQUFZLFFBQVEsS0FBSztBQUFBLE1BQ25DO0FBQUEsTUFDQSxNQUFNLEtBQUssY0FBYyxlQUFlLE9BQU87QUFBQSxJQUNoRCxDQUFDO0FBRUQsVUFBTSxrQkFBa0IsWUFBWSxJQUFJLElBQUk7QUFBQSxNQUMzQztBQUFBLE1BQ0EsU0FBUyxtQkFBbUIsbUNBQW1DO0FBQUEsTUFDL0QsVUFBVSxZQUFZLFFBQVEsV0FBVztBQUFBLE1BQ3pDO0FBQUEsTUFDQSxNQUFNLEtBQUssV0FBVyxlQUFlLE9BQU87QUFBQSxJQUM3QyxDQUFDO0FBRUQsVUFBTSxpQkFBNEIsQ0FBQztBQUNuQyxtQkFBZSxLQUFLLGNBQWM7QUFDbEMsbUJBQWUsS0FBSyxlQUFlO0FBQ25DLFVBQU0sbUJBQThCLENBQUM7QUFDckMscUJBQWlCLEtBQUsscUJBQXFCO0FBQzNDLHFCQUFpQixLQUFLLFlBQVk7QUFDbEMsUUFBSSxDQUFDLFFBQVEsV0FBVztBQUN2Qix1QkFBaUIsS0FBSyxJQUFJLFVBQVUsQ0FBQztBQUNyQyx1QkFBaUIsS0FBSyxZQUFZO0FBQUEsSUFDbkM7QUFFQSxVQUFNLGlCQUFpQixZQUFZLElBQUksS0FBSyxxQkFBcUI7QUFBQSxNQUFlO0FBQUEsTUFDL0U7QUFBQSxNQUNBLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ1AsQ0FBQyxnQkFBZ0IsZ0JBQWdCO0FBQUEsSUFDbEMsQ0FBQztBQUVELG1CQUFlLFVBQVUsS0FBSyx1QkFBdUIsZUFBZSxPQUFPLGVBQWUsUUFBUTtBQUNsRyxnQkFBWSxJQUFJLEtBQUssdUJBQXVCLDBCQUEwQixNQUNyRSxlQUFlLFVBQVUsS0FBSyx1QkFBdUIsZUFBZSxPQUFPLGVBQWUsUUFBUSxFQUFFLENBQUM7QUFFdEcsV0FBTyxDQUFDLGdCQUFnQixXQUFXO0FBQUEsRUFDcEM7QUFBQSxFQUVBLE1BQU0saUJBQWlCLFVBQXdGO0FBQzlHLFFBQUksS0FBSyxtQkFBbUI7QUFDM0IsWUFBTSxTQUFTLE1BQU0sS0FBSyxjQUFjLFFBQVE7QUFBQSxRQUMvQyxNQUFNO0FBQUEsUUFDTixTQUFTLFNBQVMsc0JBQXNCLHlGQUF5RjtBQUFBLFFBQ2pJLGVBQWUsU0FBUyxXQUFXLGtCQUFrQjtBQUFBLFFBQ3JELGNBQWMsU0FBUyxVQUFVLFFBQVE7QUFBQSxNQUMxQyxDQUFDO0FBQ0QsVUFBSSxDQUFDLE9BQU8sV0FBVztBQUN0QjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLE9BQU87QUFBQSxJQUNiO0FBRUEsUUFBSSxvQkFBb0IsS0FBSztBQUM1QixVQUFJO0FBQ0gsY0FBTSxLQUFLLG1DQUFtQyx1QkFBdUIsUUFBUTtBQUFBLE1BQzlFLFNBQVMsT0FBTztBQUNmLGFBQUssY0FBYyxNQUFNLGdCQUFnQixLQUFLLENBQUM7QUFDL0M7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxLQUFLLG1CQUFtQjtBQUM1QixZQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsWUFBTSwwQkFBMEIsSUFBSSx3QkFBd0I7QUFDNUQsa0JBQVksSUFBSSxhQUFhLE1BQU0sd0JBQXdCLFFBQVEsSUFBSSxDQUFDLENBQUM7QUFDekUsWUFBTSxpQkFBMkIsQ0FBQztBQUNsQyxZQUFNLG1CQUE2QixDQUFDO0FBQ3BDLFlBQU0sZUFBZSxZQUFZLElBQUksSUFBSTtBQUFBLFFBQ3hDO0FBQUEsUUFDQSxTQUFTLFVBQVUsUUFBUTtBQUFBLFFBQzNCO0FBQUEsUUFDQTtBQUFBLFFBQ0EsTUFBTSxLQUFLLGVBQWUsT0FBTyx3QkFBd0IsS0FBSztBQUFBLE1BQy9ELENBQUM7QUFDRCxxQkFBZSxLQUFLLFlBQVk7QUFDaEMsVUFBSSxTQUFTLG9CQUFvQixPQUFPLGFBQWEsUUFBUSxHQUFHO0FBQy9ELHVCQUFlLEtBQUssWUFBWSxJQUFJLElBQUk7QUFBQSxVQUN2QztBQUFBLFVBQ0EsU0FBUyxxQkFBcUIsaUJBQWlCLEtBQUssZUFBZSxRQUFRO0FBQUEsVUFDM0U7QUFBQSxVQUNBO0FBQUEsVUFDQSxNQUFNLEtBQUssY0FBYyxLQUFLLFVBQVUsRUFBRSxjQUFjLEtBQUssQ0FBQztBQUFBLFFBQy9ELENBQUMsQ0FBQztBQUFBLE1BQ0g7QUFDQSxZQUFNLGVBQWUsWUFBWSxJQUFJLElBQUk7QUFBQSxRQUN4QztBQUFBLFFBQ0EsU0FBUyxVQUFVLFFBQVE7QUFBQSxRQUMzQixVQUFVLFlBQVksUUFBUSxLQUFLO0FBQUEsUUFDbkM7QUFBQSxRQUNBLE1BQU0sS0FBSyxrQkFBa0I7QUFBQSxNQUM5QixDQUFDO0FBQ0QsdUJBQWlCLEtBQUssWUFBWTtBQUNsQyxZQUFNLHVCQUF1QixZQUFZLElBQUksSUFBSTtBQUFBLFFBQ2hEO0FBQUEsUUFDQSxTQUFTLFdBQVcsU0FBUztBQUFBLFFBQzdCLFVBQVUsWUFBWSxRQUFRLFdBQVc7QUFBQSxRQUN6QztBQUFBLFFBQ0EsTUFBTSxLQUFLLGtCQUFrQix3QkFBd0IsS0FBSztBQUFBLE1BQzNELENBQUM7QUFDRCx1QkFBaUIsS0FBSyxvQkFBb0I7QUFDMUMsWUFBTSxlQUFlLFlBQVksSUFBSSxJQUFJO0FBQUEsUUFDeEM7QUFBQSxRQUNBLFNBQVMsVUFBVSxXQUFXO0FBQUEsUUFDOUIsVUFBVSxZQUFZLFFBQVEsTUFBTTtBQUFBLFFBQ3BDLGtCQUFrQixRQUFRO0FBQUEsUUFDMUIsTUFBTSxLQUFLLGlCQUFpQix3QkFBd0IsS0FBSztBQUFBLE1BQzFELENBQUM7QUFDRCxXQUFLLG9CQUFvQixZQUFZLElBQUksS0FBSyxxQkFBcUI7QUFBQSxRQUFlO0FBQUEsUUFDakY7QUFBQSxRQUNBLENBQUMsZ0JBQWdCLGdCQUFnQjtBQUFBLFFBQ2pDLENBQUMsQ0FBQyxZQUFZLEdBQUcsQ0FBQyxZQUFZLENBQUM7QUFBQSxNQUNoQyxDQUFDO0FBQ0QsWUFBTSwwQkFBMEIsTUFBTTtBQUNyQyxZQUFJLGFBQWEsU0FBUztBQUN6QixjQUFJLEtBQUssbUJBQW1CLFlBQVksS0FBSyx3QkFBd0IsU0FBUyxLQUFLLE9BQUssQ0FBQyxFQUFFLGNBQWMsRUFBRSxTQUFTLEtBQUssbUJBQW1CLElBQUksR0FBRztBQUNsSix5QkFBYSxRQUFRLFNBQVMsV0FBVyxTQUFTO0FBQUEsVUFDbkQsT0FBTztBQUNOLHlCQUFhLFFBQVEsU0FBUyxVQUFVLFFBQVE7QUFBQSxVQUNqRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsOEJBQXdCO0FBQ3hCLGtCQUFZLElBQUksS0FBSyxrQkFBa0IsWUFBWSxPQUFLO0FBQ3ZELFlBQUksRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFNBQVM7QUFDekMsdUJBQWEsVUFBVSxDQUFDLEtBQUssbUJBQW1CLFlBQVksQ0FBQyxLQUFLLG1CQUFtQjtBQUNyRiwrQkFBcUIsVUFBVSxDQUFDLEtBQUssbUJBQW1CLGtCQUFrQixDQUFDLEtBQUssbUJBQW1CLFlBQVksQ0FBQyxLQUFLLG1CQUFtQjtBQUFBLFFBQ3pJO0FBQ0EsWUFBSSxFQUFFLFFBQVEsRUFBRSxVQUFVO0FBQ3pCLGtDQUF3QjtBQUN4Qix1QkFBYSxVQUFVLGtCQUFrQixLQUFLLG1CQUFtQixRQUFRO0FBQUEsUUFDMUU7QUFBQSxNQUNELENBQUMsQ0FBQztBQUNGLGtCQUFZLElBQUksS0FBSyx3QkFBd0Isb0JBQW9CLENBQUMsTUFBTTtBQUN2RSxnQ0FBd0I7QUFDeEIsYUFBSyxtQkFBbUIsU0FBUztBQUFBLE1BQ2xDLENBQUMsQ0FBQztBQUNGLFdBQUssVUFBVSxLQUFLLENBQUMsS0FBSyxtQkFBbUIsV0FBVyxDQUFDO0FBQ3pELFdBQUssYUFBYSxLQUFLLEtBQUssaUJBQWlCO0FBQUEsSUFDOUM7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxTQUFlO0FBQ2QsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxhQUFhLEtBQUssTUFBUztBQUFBLEVBQ2pDO0FBQUEsRUFFUSxtQkFBeUI7QUFDaEMsUUFBSSxLQUFLLG1CQUFtQjtBQUMzQixZQUFNLFFBQVEsS0FBSyxVQUFVLFVBQVUsQ0FBQyxDQUFDLENBQUMsTUFBTSxNQUFNLEtBQUssaUJBQWlCO0FBQzVFLFVBQUksVUFBVSxJQUFJO0FBQ2pCLGFBQUssVUFBVSxPQUFPLE9BQU8sQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsV0FBVyxNQUFNLFlBQVksUUFBUSxDQUFDO0FBQUEsTUFDL0U7QUFDQSxXQUFLLG9CQUFvQjtBQUFBLElBQzFCO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxrQkFBa0IsT0FBeUM7QUFDeEUsUUFBSSxDQUFDLEtBQUssbUJBQW1CO0FBQzVCO0FBQUEsSUFDRDtBQUNBLFFBQUksS0FBSyxrQkFBa0IsZ0JBQWdCO0FBQzFDO0FBQUEsSUFDRDtBQUNBLFVBQU0sVUFBVSxNQUFNLEtBQUssZUFBZSxNQUFNLEtBQUs7QUFDckQsUUFBSSxTQUFTO0FBQ1osV0FBSyxrQkFBa0IsaUJBQWlCO0FBQ3hDLFVBQUksT0FBTztBQUNWLGNBQU0sS0FBSyxpQ0FBaUMsY0FBYyxPQUFPO0FBQUEsTUFDbEUsT0FBTztBQUNOLGNBQU0sS0FBSyxXQUFXLE9BQU87QUFBQSxNQUM5QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGlCQUFpQixPQUF5QztBQUN2RSxRQUFJLENBQUMsS0FBSyxtQkFBbUI7QUFDNUI7QUFBQSxJQUNEO0FBQ0EsUUFBSSxDQUFDLGtCQUFrQixLQUFLLGtCQUFrQixRQUFRLEdBQUc7QUFDeEQ7QUFBQSxJQUNEO0FBQ0EsVUFBTSxVQUFVO0FBQUEsTUFDZixhQUFhO0FBQUEsTUFDYixLQUFLLGtCQUFrQjtBQUFBLE1BQ3ZCLEtBQUssa0JBQWtCLFNBQVM7QUFBQSxNQUNoQyxLQUFLLGtCQUFrQixTQUFTO0FBQUEsTUFDaEM7QUFBQSxRQUNDLE1BQU0sS0FBSyxrQkFBa0I7QUFBQSxRQUM3QixpQkFBaUIsS0FBSyxrQkFBa0I7QUFBQSxNQUN6QztBQUFBLE1BQ0EsS0FBSyx3QkFBd0I7QUFBQSxJQUM5QjtBQUNBLFVBQU0sS0FBSyxtQ0FBbUMsY0FBYyxTQUFTLEtBQUssa0JBQWtCLFNBQVM7QUFBQSxFQUN0RztBQUFBLEVBRUEsTUFBTSxlQUFlLFdBQXFCLE9BQWtFO0FBQzNHLFFBQUksQ0FBQyxLQUFLLG1CQUFtQjtBQUM1QixhQUFPO0FBQUEsSUFDUjtBQUVBLFNBQUssa0JBQWtCLFNBQVM7QUFDaEMsUUFBSSxLQUFLLGtCQUFrQixTQUFTO0FBQ25DLGFBQU87QUFBQSxJQUNSO0FBRUEsU0FBSyxrQkFBa0IsV0FBVztBQUNsQyxRQUFJO0FBRUosUUFBSTtBQUNILFVBQUksS0FBSyxrQkFBa0IsZ0JBQWdCO0FBQzFDLFlBQUksQ0FBQyxXQUFXO0FBQ2Ysb0JBQVUsTUFBTSxLQUFLLGlDQUFpQyxjQUFjLEtBQUssa0JBQWtCLGdCQUFnQixFQUFFLFdBQVcsTUFBTSxDQUFDO0FBQUEsUUFDaEk7QUFBQSxNQUNELE9BQ0s7QUFDSixjQUFNLEVBQUUsT0FBTyxNQUFNLE1BQU0sU0FBUyxJQUFJLEtBQUs7QUFDN0MsY0FBTSxrQkFBc0QsUUFDekQsTUFBTSxZQUFZLE1BQU0sZUFBZSxNQUFNLFNBQVMsTUFBTSxlQUFlLE1BQU0sYUFBYSxTQUFZLFFBQzFHO0FBVUgsY0FBTSw2QkFBcUQsRUFBRSxRQUFRLG9CQUFvQixNQUFNLGFBQWEsa0JBQWtCLFFBQVEsSUFBSSxZQUFZLFdBQVcsYUFBYSxPQUFVO0FBRXhMLFlBQUksb0JBQW9CLEtBQUs7QUFDNUIsZ0JBQU0sV0FBVyxNQUFNLEtBQUssa0JBQWtCLGdCQUFnQixRQUFRO0FBQ3RFLGNBQUksVUFBVTtBQUNiLGlCQUFLLGlCQUFpQixXQUFvRSxzQ0FBc0MsMEJBQTBCO0FBQzFKLHNCQUFVLE1BQU0sS0FBSyxtQ0FBbUM7QUFBQSxjQUN2RDtBQUFBLGNBQ0E7QUFBQSxnQkFDQztBQUFBLGdCQUNBO0FBQUEsZ0JBQ0E7QUFBQSxnQkFDQSxtQkFBbUIsS0FBSyxrQkFBa0I7QUFBQSxnQkFDMUM7QUFBQSxjQUNEO0FBQUEsY0FDQSxTQUFTLGtCQUFrQjtBQUFBLFlBQzVCO0FBQUEsVUFDRDtBQUFBLFFBQ0QsV0FBVyxrQkFBa0IsUUFBUSxHQUFHO0FBQ3ZDLG9CQUFVLE1BQU0sS0FBSyxtQ0FBbUM7QUFBQSxZQUN2RDtBQUFBLFlBQ0E7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxjQUNBLG1CQUFtQixLQUFLLGtCQUFrQjtBQUFBLGNBQzFDO0FBQUEsWUFDRDtBQUFBLFlBQ0EsU0FBUyxrQkFBa0I7QUFBQSxVQUM1QjtBQUFBLFFBQ0QsT0FBTztBQUNOLG9CQUFVLE1BQU0sS0FBSyxpQ0FBaUMsY0FBYyxNQUFNLEVBQUUsaUJBQWlCLE1BQU0sVUFBVSxDQUFDO0FBQUEsUUFDL0c7QUFBQSxNQUNEO0FBQUEsSUFDRCxVQUFFO0FBQ0QsVUFBSSxLQUFLLG1CQUFtQjtBQUMzQixhQUFLLGtCQUFrQixXQUFXO0FBQUEsTUFDbkM7QUFBQSxJQUNEO0FBRUEsUUFBSSxPQUFPLHlCQUF5QjtBQUNuQyxVQUFJLFNBQVM7QUFDWixZQUFJO0FBQ0gsZ0JBQU0sS0FBSyxpQ0FBaUMsY0FBYyxPQUFPO0FBQUEsUUFDbEUsU0FBUyxPQUFPO0FBQUEsUUFFaEI7QUFBQSxNQUNEO0FBQ0E7QUFBQSxJQUNEO0FBRUEsUUFBSSxXQUFXLENBQUMsUUFBUSxjQUFjLEtBQUssbUJBQW1CO0FBQzdELFdBQUssaUJBQWlCO0FBQ3RCLFlBQU0sV0FBVyxLQUFLLFVBQVUsS0FBSyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsU0FBUyxRQUFRLElBQUk7QUFDckUsVUFBSSxVQUFVO0FBQ2IsYUFBSyxhQUFhLEtBQUssU0FBUyxDQUFDLENBQUM7QUFBQSxNQUNuQyxPQUFPO0FBQ04sYUFBSyxvQkFBb0IsRUFBRSxPQUFPLENBQUMsT0FBTyxHQUFHLFNBQVMsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxHQUFHLEtBQUssS0FBSyx3QkFBd0IsU0FBUyxDQUFDO0FBQUEsTUFDcEg7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsb0JBQW1DO0FBQ2hELFFBQUksQ0FBQyxLQUFLLG1CQUFtQjtBQUM1QjtBQUFBLElBQ0Q7QUFDQSxRQUFJLEtBQUssa0JBQWtCLGdCQUFnQjtBQUMxQyxZQUFNLEtBQUssaUNBQWlDLGNBQWMsS0FBSyxrQkFBa0IsY0FBYztBQUMvRjtBQUFBLElBQ0Q7QUFDQSxTQUFLLGlCQUFpQjtBQUN0QixTQUFLLGFBQWEsS0FBSyxNQUFTO0FBQUEsRUFDakM7QUFBQSxFQUVBLE1BQWMsY0FBYyxTQUEwQztBQUNyRSxVQUFNLFNBQVMsTUFBTSxLQUFLLGNBQWMsUUFBUTtBQUFBLE1BQy9DLE1BQU07QUFBQSxNQUNOLFNBQVMsU0FBUyxpQkFBaUIsc0RBQXNELFFBQVEsSUFBSTtBQUFBLE1BQ3JHLGVBQWUsU0FBUyxVQUFVLFFBQVE7QUFBQSxNQUMxQyxjQUFjLFNBQVMsVUFBVSxRQUFRO0FBQUEsSUFDMUMsQ0FBQztBQUNELFFBQUksT0FBTyxXQUFXO0FBQ3JCLFlBQU0sS0FBSyxpQ0FBaUMsY0FBYyxPQUFPO0FBQUEsSUFDbEU7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLFdBQVcsU0FBMEM7QUFDbEUsVUFBTSxLQUFLLFlBQVksV0FBVyxFQUFFLGNBQWMsUUFBUSxLQUFLLENBQUM7QUFBQSxFQUNqRTtBQUNEO0FBdGJhLDhCQUFOO0FBQUEsRUF1Q0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWhEVTsiLAogICJuYW1lcyI6IFtdCn0K
