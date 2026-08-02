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
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions, TreeItemCollapsibleState } from "../../../common/views.js";
import { localize, localize2 } from "../../../../nls.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { TreeView, TreeViewPane } from "../../../browser/parts/views/treeView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ALL_SYNC_RESOURCES, IUserDataSyncService, SyncStatus, IUserDataSyncEnablementService, IUserDataAutoSyncService, UserDataSyncError, UserDataSyncErrorCode, getLastSyncResourceUri, SyncResource, IUserDataSyncResourceProviderService } from "../../../../platform/userDataSync/common/userDataSync.js";
import { registerAction2, Action2, MenuId } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { URI } from "../../../../base/common/uri.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { FolderThemeIcon } from "../../../../platform/theme/common/themeService.js";
import { fromNow } from "../../../../base/common/date.js";
import { IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { toAction } from "../../../../base/common/actions.js";
import { IUserDataSyncWorkbenchService, CONTEXT_SYNC_STATE, getSyncAreaLabel, CONTEXT_ACCOUNT_STATE, AccountStatus, CONTEXT_ENABLE_ACTIVITY_VIEWS, SYNC_TITLE, SYNC_CONFLICTS_VIEW_ID, CONTEXT_ENABLE_SYNC_CONFLICTS_VIEW, CONTEXT_HAS_CONFLICTS } from "../../../services/userDataSync/common/userDataSync.js";
import { IUserDataSyncMachinesService, isWebPlatform } from "../../../../platform/userDataSync/common/userDataSyncMachines.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { basename } from "../../../../base/common/resources.js";
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { UserDataSyncConflictsViewPane } from "./userDataSyncConflictsView.js";
let UserDataSyncDataViews = class extends Disposable {
  constructor(container, instantiationService, userDataSyncEnablementService, userDataSyncMachinesService, userDataSyncService) {
    super();
    this.instantiationService = instantiationService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.userDataSyncMachinesService = userDataSyncMachinesService;
    this.userDataSyncService = userDataSyncService;
    this.registerViews(container);
  }
  registerViews(container) {
    this.registerConflictsView(container);
    this.registerActivityView(container, true);
    this.registerMachinesView(container);
    this.registerActivityView(container, false);
    this.registerTroubleShootView(container);
    this.registerExternalActivityView(container);
  }
  registerConflictsView(container) {
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    const viewName = localize2("conflicts", "Conflicts");
    const viewDescriptor = {
      id: SYNC_CONFLICTS_VIEW_ID,
      name: viewName,
      ctorDescriptor: new SyncDescriptor(UserDataSyncConflictsViewPane),
      when: ContextKeyExpr.and(CONTEXT_ENABLE_SYNC_CONFLICTS_VIEW, CONTEXT_HAS_CONFLICTS),
      canToggleVisibility: false,
      canMoveView: false,
      treeView: this.instantiationService.createInstance(TreeView, SYNC_CONFLICTS_VIEW_ID, viewName.value),
      collapsed: false,
      order: 100
    };
    viewsRegistry.registerViews([viewDescriptor], container);
  }
  registerMachinesView(container) {
    const id = `workbench.views.sync.machines`;
    const name = localize2("synced machines", "Synced Machines");
    const treeView = this.instantiationService.createInstance(TreeView, id, name.value);
    const dataProvider = this.instantiationService.createInstance(UserDataSyncMachinesViewDataProvider, treeView);
    treeView.showRefreshAction = true;
    treeView.canSelectMany = true;
    treeView.dataProvider = dataProvider;
    this._register(Event.any(this.userDataSyncMachinesService.onDidChange, this.userDataSyncService.onDidResetRemote)(() => treeView.refresh()));
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    const viewDescriptor = {
      id,
      name,
      ctorDescriptor: new SyncDescriptor(TreeViewPane),
      when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available), CONTEXT_ENABLE_ACTIVITY_VIEWS),
      canToggleVisibility: true,
      canMoveView: false,
      treeView,
      collapsed: false,
      order: 300
    };
    viewsRegistry.registerViews([viewDescriptor], container);
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.sync.editMachineName`,
          title: localize("workbench.actions.sync.editMachineName", "Edit Name"),
          icon: Codicon.edit,
          menu: {
            id: MenuId.ViewItemContext,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", id)),
            group: "inline"
          }
        });
      }
      async run(accessor, handle) {
        const changed = await dataProvider.rename(handle.$treeItemHandle);
        if (changed) {
          await treeView.refresh();
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.sync.turnOffSyncOnMachine`,
          title: localize("workbench.actions.sync.turnOffSyncOnMachine", "Turn off Settings Sync"),
          menu: {
            id: MenuId.ViewItemContext,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", id), ContextKeyExpr.equals("viewItem", "sync-machine"))
          }
        });
      }
      async run(accessor, handle, selected) {
        if (await dataProvider.disable((selected || [handle]).map((handle2) => handle2.$treeItemHandle))) {
          await treeView.refresh();
        }
      }
    }));
  }
  registerActivityView(container, remote) {
    const id = `workbench.views.sync.${remote ? "remote" : "local"}Activity`;
    const name = remote ? localize2("remote sync activity title", "Sync Activity (Remote)") : localize2("local sync activity title", "Sync Activity (Local)");
    const treeView = this.instantiationService.createInstance(TreeView, id, name.value);
    treeView.showCollapseAllAction = true;
    treeView.showRefreshAction = true;
    treeView.dataProvider = remote ? this.instantiationService.createInstance(RemoteUserDataSyncActivityViewDataProvider) : this.instantiationService.createInstance(LocalUserDataSyncActivityViewDataProvider);
    this._register(Event.any(
      this.userDataSyncEnablementService.onDidChangeResourceEnablement,
      this.userDataSyncEnablementService.onDidChangeEnablement,
      this.userDataSyncService.onDidResetLocal,
      this.userDataSyncService.onDidResetRemote
    )(() => treeView.refresh()));
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    const viewDescriptor = {
      id,
      name,
      ctorDescriptor: new SyncDescriptor(TreeViewPane),
      when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available), CONTEXT_ENABLE_ACTIVITY_VIEWS),
      canToggleVisibility: true,
      canMoveView: false,
      treeView,
      collapsed: false,
      order: remote ? 200 : 400,
      hideByDefault: !remote
    };
    viewsRegistry.registerViews([viewDescriptor], container);
    this.registerDataViewActions(id);
  }
  registerExternalActivityView(container) {
    const id = `workbench.views.sync.externalActivity`;
    const name = localize2("downloaded sync activity title", "Sync Activity (Developer)");
    const dataProvider = this.instantiationService.createInstance(ExtractedUserDataSyncActivityViewDataProvider, void 0);
    const treeView = this.instantiationService.createInstance(TreeView, id, name.value);
    treeView.showCollapseAllAction = false;
    treeView.showRefreshAction = false;
    treeView.dataProvider = dataProvider;
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    const viewDescriptor = {
      id,
      name,
      ctorDescriptor: new SyncDescriptor(TreeViewPane),
      when: CONTEXT_ENABLE_ACTIVITY_VIEWS,
      canToggleVisibility: true,
      canMoveView: false,
      treeView,
      collapsed: false,
      hideByDefault: false
    };
    viewsRegistry.registerViews([viewDescriptor], container);
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.sync.loadActivity`,
          title: localize("workbench.actions.sync.loadActivity", "Load Sync Activity"),
          icon: Codicon.cloudUpload,
          menu: {
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", id),
            group: "navigation"
          }
        });
      }
      async run(accessor) {
        const fileDialogService = accessor.get(IFileDialogService);
        const result = await fileDialogService.showOpenDialog({
          title: localize("select sync activity file", "Select Sync Activity File or Folder"),
          canSelectFiles: true,
          canSelectFolders: true,
          canSelectMany: false
        });
        if (!result?.[0]) {
          return;
        }
        dataProvider.activityDataResource = result[0];
        await treeView.refresh();
      }
    }));
  }
  registerDataViewActions(viewId) {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.sync.${viewId}.resolveResource`,
          title: localize("workbench.actions.sync.resolveResourceRef", "Show raw JSON sync data"),
          menu: {
            id: MenuId.ViewItemContext,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", viewId), ContextKeyExpr.regex("viewItem", /sync-resource-.*/i))
          }
        });
      }
      async run(accessor, handle) {
        const { resource } = JSON.parse(handle.$treeItemHandle);
        const editorService = accessor.get(IEditorService);
        await editorService.openEditor({ resource: URI.parse(resource), options: { pinned: true } });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.sync.${viewId}.compareWithLocal`,
          title: localize("workbench.actions.sync.compareWithLocal", "Compare with Local"),
          menu: {
            id: MenuId.ViewItemContext,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", viewId), ContextKeyExpr.regex("viewItem", /sync-associatedResource-.*/i))
          }
        });
      }
      async run(accessor, handle) {
        const commandService = accessor.get(ICommandService);
        const { resource, comparableResource } = JSON.parse(handle.$treeItemHandle);
        const remoteResource = URI.parse(resource);
        const localResource = URI.parse(comparableResource);
        return commandService.executeCommand(
          API_OPEN_DIFF_EDITOR_COMMAND_ID,
          remoteResource,
          localResource,
          localize("remoteToLocalDiff", "{0} \u2194 {1}", localize({ key: "leftResourceName", comment: ["remote as in file in cloud"] }, "{0} (Remote)", basename(remoteResource)), localize({ key: "rightResourceName", comment: ["local as in file in disk"] }, "{0} (Local)", basename(localResource))),
          void 0
        );
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.sync.${viewId}.replaceCurrent`,
          title: localize("workbench.actions.sync.replaceCurrent", "Restore"),
          icon: Codicon.discard,
          menu: {
            id: MenuId.ViewItemContext,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", viewId), ContextKeyExpr.regex("viewItem", /sync-resource-.*/i), ContextKeyExpr.notEquals("viewItem", `sync-resource-${SyncResource.Profiles}`)),
            group: "inline"
          }
        });
      }
      async run(accessor, handle) {
        const dialogService = accessor.get(IDialogService);
        const userDataSyncService = accessor.get(IUserDataSyncService);
        const { syncResourceHandle, syncResource } = JSON.parse(handle.$treeItemHandle);
        const result = await dialogService.confirm({
          message: localize({ key: "confirm replace", comment: ["A confirmation message to replace current user data (settings, extensions, keybindings, snippets) with selected version"] }, "Would you like to replace your current {0} with selected?", getSyncAreaLabel(syncResource)),
          type: "info",
          title: SYNC_TITLE.value
        });
        if (result.confirmed) {
          return userDataSyncService.replace({ created: syncResourceHandle.created, uri: URI.revive(syncResourceHandle.uri) });
        }
      }
    }));
  }
  registerTroubleShootView(container) {
    const id = `workbench.views.sync.troubleshoot`;
    const name = localize2("troubleshoot", "Troubleshoot");
    const treeView = this.instantiationService.createInstance(TreeView, id, name.value);
    const dataProvider = this.instantiationService.createInstance(UserDataSyncTroubleshootViewDataProvider);
    treeView.showRefreshAction = true;
    treeView.dataProvider = dataProvider;
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    const viewDescriptor = {
      id,
      name,
      ctorDescriptor: new SyncDescriptor(TreeViewPane),
      when: CONTEXT_ENABLE_ACTIVITY_VIEWS,
      canToggleVisibility: true,
      canMoveView: false,
      treeView,
      collapsed: false,
      order: 500,
      hideByDefault: true
    };
    viewsRegistry.registerViews([viewDescriptor], container);
  }
};
UserDataSyncDataViews = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IUserDataSyncEnablementService),
  __decorateParam(3, IUserDataSyncMachinesService),
  __decorateParam(4, IUserDataSyncService)
], UserDataSyncDataViews);
let UserDataSyncActivityViewDataProvider = class {
  constructor(userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncWorkbenchService, notificationService, userDataProfilesService) {
    this.userDataSyncService = userDataSyncService;
    this.userDataSyncResourceProviderService = userDataSyncResourceProviderService;
    this.userDataAutoSyncService = userDataAutoSyncService;
    this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
    this.notificationService = notificationService;
    this.userDataProfilesService = userDataProfilesService;
    this.syncResourceHandlesByProfile = /* @__PURE__ */ new Map();
  }
  async getChildren(element) {
    try {
      if (!element) {
        return await this.getRoots();
      }
      if (element.profile || element.handle === this.userDataProfilesService.defaultProfile.id) {
        let promise = this.syncResourceHandlesByProfile.get(element.handle);
        if (!promise) {
          this.syncResourceHandlesByProfile.set(element.handle, promise = this.getSyncResourceHandles(element.profile));
        }
        return await promise;
      }
      if (element.syncResourceHandle) {
        return await this.getChildrenForSyncResourceTreeItem(element);
      }
      return [];
    } catch (error) {
      if (!(error instanceof UserDataSyncError)) {
        error = UserDataSyncError.toUserDataSyncError(error);
      }
      if (error instanceof UserDataSyncError && error.code === UserDataSyncErrorCode.IncompatibleRemoteContent) {
        this.notificationService.notify({
          severity: Severity.Error,
          message: error.message,
          actions: {
            primary: [
              toAction({
                id: "reset",
                label: localize("reset", "Reset Synced Data"),
                run: () => this.userDataSyncWorkbenchService.resetSyncedData()
              })
            ]
          }
        });
      } else {
        this.notificationService.error(error);
      }
      throw error;
    }
  }
  async getRoots() {
    this.syncResourceHandlesByProfile.clear();
    const roots = [];
    const profiles = await this.getProfiles();
    if (profiles.length) {
      const profileTreeItem = {
        handle: this.userDataProfilesService.defaultProfile.id,
        label: { label: this.userDataProfilesService.defaultProfile.name },
        collapsibleState: TreeItemCollapsibleState.Expanded
      };
      roots.push(profileTreeItem);
    } else {
      const defaultSyncResourceHandles = await this.getSyncResourceHandles();
      roots.push(...defaultSyncResourceHandles);
    }
    for (const profile of profiles) {
      const profileTreeItem = {
        handle: profile.id,
        label: { label: profile.name },
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        profile
      };
      roots.push(profileTreeItem);
    }
    return roots;
  }
  async getChildrenForSyncResourceTreeItem(element) {
    const syncResourceHandle = element.syncResourceHandle;
    const associatedResources = await this.userDataSyncResourceProviderService.getAssociatedResources(syncResourceHandle);
    const previousAssociatedResources = syncResourceHandle.previous ? await this.userDataSyncResourceProviderService.getAssociatedResources(syncResourceHandle.previous) : [];
    return associatedResources.map(({ resource, comparableResource }) => {
      const handle = JSON.stringify({ resource: resource.toString(), comparableResource: comparableResource.toString() });
      const previousResource = previousAssociatedResources.find((previous) => basename(previous.resource) === basename(resource))?.resource;
      return {
        handle,
        collapsibleState: TreeItemCollapsibleState.None,
        resourceUri: resource,
        command: previousResource ? {
          id: API_OPEN_DIFF_EDITOR_COMMAND_ID,
          title: "",
          arguments: [
            previousResource,
            resource,
            localize("sideBySideLabels", "{0} \u2194 {1}", `${basename(resource)} (${fromNow(syncResourceHandle.previous.created, true)})`, `${basename(resource)} (${fromNow(syncResourceHandle.created, true)})`),
            void 0
          ]
        } : {
          id: API_OPEN_EDITOR_COMMAND_ID,
          title: "",
          arguments: [resource, void 0, void 0]
        },
        contextValue: `sync-associatedResource-${syncResourceHandle.syncResource}`
      };
    });
  }
  async getSyncResourceHandles(profile) {
    const treeItems = [];
    const result = await Promise.all(ALL_SYNC_RESOURCES.map(async (syncResource) => {
      const resourceHandles = await this.getResourceHandles(syncResource, profile);
      return resourceHandles.map((resourceHandle, index) => ({ ...resourceHandle, syncResource, previous: resourceHandles[index + 1] }));
    }));
    const syncResourceHandles = result.flat().sort((a, b) => b.created - a.created);
    for (const syncResourceHandle of syncResourceHandles) {
      const handle = JSON.stringify({ syncResourceHandle, syncResource: syncResourceHandle.syncResource });
      treeItems.push({
        handle,
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        label: { label: getSyncAreaLabel(syncResourceHandle.syncResource) },
        description: fromNow(syncResourceHandle.created, true),
        tooltip: new Date(syncResourceHandle.created).toLocaleString(),
        themeIcon: FolderThemeIcon,
        syncResourceHandle,
        contextValue: `sync-resource-${syncResourceHandle.syncResource}`
      });
    }
    return treeItems;
  }
};
UserDataSyncActivityViewDataProvider = __decorateClass([
  __decorateParam(0, IUserDataSyncService),
  __decorateParam(1, IUserDataSyncResourceProviderService),
  __decorateParam(2, IUserDataAutoSyncService),
  __decorateParam(3, IUserDataSyncWorkbenchService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IUserDataProfilesService)
], UserDataSyncActivityViewDataProvider);
class LocalUserDataSyncActivityViewDataProvider extends UserDataSyncActivityViewDataProvider {
  getResourceHandles(syncResource, profile) {
    return this.userDataSyncResourceProviderService.getLocalSyncResourceHandles(syncResource, profile);
  }
  async getProfiles() {
    return this.userDataProfilesService.profiles.filter((p) => !p.isDefault).map((p) => ({
      id: p.id,
      collection: p.id,
      name: p.name
    }));
  }
}
let RemoteUserDataSyncActivityViewDataProvider = class extends UserDataSyncActivityViewDataProvider {
  constructor(userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncMachinesService, userDataSyncWorkbenchService, notificationService, userDataProfilesService) {
    super(userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncWorkbenchService, notificationService, userDataProfilesService);
    this.userDataSyncMachinesService = userDataSyncMachinesService;
  }
  async getChildren(element) {
    if (!element) {
      this.machinesPromise = void 0;
    }
    return super.getChildren(element);
  }
  getMachines() {
    if (this.machinesPromise === void 0) {
      this.machinesPromise = this.userDataSyncMachinesService.getMachines();
    }
    return this.machinesPromise;
  }
  getResourceHandles(syncResource, profile) {
    return this.userDataSyncResourceProviderService.getRemoteSyncResourceHandles(syncResource, profile);
  }
  getProfiles() {
    return this.userDataSyncResourceProviderService.getRemoteSyncedProfiles();
  }
  async getChildrenForSyncResourceTreeItem(element) {
    const children = await super.getChildrenForSyncResourceTreeItem(element);
    if (children.length) {
      const machineId = await this.userDataSyncResourceProviderService.getMachineId(element.syncResourceHandle);
      if (machineId) {
        const machines = await this.getMachines();
        const machine = machines.find(({ id }) => id === machineId);
        children[0].description = machine?.isCurrent ? localize({ key: "current", comment: ["Represents current machine"] }, "Current") : machine?.name;
      }
    }
    return children;
  }
};
RemoteUserDataSyncActivityViewDataProvider = __decorateClass([
  __decorateParam(0, IUserDataSyncService),
  __decorateParam(1, IUserDataSyncResourceProviderService),
  __decorateParam(2, IUserDataAutoSyncService),
  __decorateParam(3, IUserDataSyncMachinesService),
  __decorateParam(4, IUserDataSyncWorkbenchService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IUserDataProfilesService)
], RemoteUserDataSyncActivityViewDataProvider);
let ExtractedUserDataSyncActivityViewDataProvider = class extends UserDataSyncActivityViewDataProvider {
  constructor(activityDataResource, userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncWorkbenchService, notificationService, userDataProfilesService, fileService, uriIdentityService) {
    super(userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncWorkbenchService, notificationService, userDataProfilesService);
    this.activityDataResource = activityDataResource;
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
  }
  async getChildren(element) {
    if (!element) {
      this.machinesPromise = void 0;
      if (!this.activityDataResource) {
        return [];
      }
      const stat = await this.fileService.resolve(this.activityDataResource);
      if (stat.isDirectory) {
        this.activityDataLocation = this.activityDataResource;
      } else {
        this.activityDataLocation = this.uriIdentityService.extUri.joinPath(this.uriIdentityService.extUri.dirname(this.activityDataResource), "remoteActivity");
        try {
          await this.fileService.del(this.activityDataLocation, { recursive: true });
        } catch (e) {
        }
        await this.userDataSyncService.extractActivityData(this.activityDataResource, this.activityDataLocation);
      }
    }
    return super.getChildren(element);
  }
  getResourceHandles(syncResource, profile) {
    return this.userDataSyncResourceProviderService.getLocalSyncResourceHandles(syncResource, profile, this.activityDataLocation);
  }
  async getProfiles() {
    return this.userDataSyncResourceProviderService.getLocalSyncedProfiles(this.activityDataLocation);
  }
  async getChildrenForSyncResourceTreeItem(element) {
    const children = await super.getChildrenForSyncResourceTreeItem(element);
    if (children.length) {
      const machineId = await this.userDataSyncResourceProviderService.getMachineId(element.syncResourceHandle);
      if (machineId) {
        const machines = await this.getMachines();
        const machine = machines.find(({ id }) => id === machineId);
        children[0].description = machine?.isCurrent ? localize({ key: "current", comment: ["Represents current machine"] }, "Current") : machine?.name;
      }
    }
    return children;
  }
  getMachines() {
    if (this.machinesPromise === void 0) {
      this.machinesPromise = this.userDataSyncResourceProviderService.getLocalSyncedMachines(this.activityDataLocation);
    }
    return this.machinesPromise;
  }
};
ExtractedUserDataSyncActivityViewDataProvider = __decorateClass([
  __decorateParam(1, IUserDataSyncService),
  __decorateParam(2, IUserDataSyncResourceProviderService),
  __decorateParam(3, IUserDataAutoSyncService),
  __decorateParam(4, IUserDataSyncWorkbenchService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IUserDataProfilesService),
  __decorateParam(7, IFileService),
  __decorateParam(8, IUriIdentityService)
], ExtractedUserDataSyncActivityViewDataProvider);
let UserDataSyncMachinesViewDataProvider = class {
  constructor(treeView, userDataSyncMachinesService, quickInputService, notificationService, dialogService, userDataSyncWorkbenchService) {
    this.treeView = treeView;
    this.userDataSyncMachinesService = userDataSyncMachinesService;
    this.quickInputService = quickInputService;
    this.notificationService = notificationService;
    this.dialogService = dialogService;
    this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
  }
  async getChildren(element) {
    if (!element) {
      this.machinesPromise = void 0;
    }
    try {
      let machines = await this.getMachines();
      machines = machines.filter((m) => !m.disabled).sort((m1, m2) => m1.isCurrent ? -1 : 1);
      this.treeView.message = machines.length ? void 0 : localize("no machines", "No Machines");
      return machines.map(({ id, name, isCurrent, platform }) => ({
        handle: id,
        collapsibleState: TreeItemCollapsibleState.None,
        label: { label: name },
        description: isCurrent ? localize({ key: "current", comment: ["Current machine"] }, "Current") : void 0,
        themeIcon: platform && isWebPlatform(platform) ? Codicon.globe : Codicon.vm,
        contextValue: "sync-machine"
      }));
    } catch (error) {
      this.notificationService.error(error);
      return [];
    }
  }
  getMachines() {
    if (this.machinesPromise === void 0) {
      this.machinesPromise = this.userDataSyncMachinesService.getMachines();
    }
    return this.machinesPromise;
  }
  async disable(machineIds) {
    const machines = await this.getMachines();
    const machinesToDisable = machines.filter(({ id }) => machineIds.includes(id));
    if (!machinesToDisable.length) {
      throw new Error(localize("not found", "machine not found with id: {0}", machineIds.join(",")));
    }
    const result = await this.dialogService.confirm({
      type: "info",
      message: machinesToDisable.length > 1 ? localize("turn off sync on multiple machines", "Are you sure you want to turn off sync on selected machines?") : localize("turn off sync on machine", "Are you sure you want to turn off sync on {0}?", machinesToDisable[0].name),
      primaryButton: localize({ key: "turn off", comment: ["&& denotes a mnemonic"] }, "&&Turn off")
    });
    if (!result.confirmed) {
      return false;
    }
    if (machinesToDisable.some((machine) => machine.isCurrent)) {
      await this.userDataSyncWorkbenchService.turnoff(false);
    }
    const otherMachinesToDisable = machinesToDisable.filter((machine) => !machine.isCurrent).map((machine) => [machine.id, false]);
    if (otherMachinesToDisable.length) {
      await this.userDataSyncMachinesService.setEnablements(otherMachinesToDisable);
    }
    return true;
  }
  async rename(machineId) {
    const disposableStore = new DisposableStore();
    const inputBox = disposableStore.add(this.quickInputService.createInputBox());
    inputBox.placeholder = localize("placeholder", "Enter the name of the machine");
    inputBox.busy = true;
    inputBox.show();
    const machines = await this.getMachines();
    const machine = machines.find(({ id }) => id === machineId);
    const enabledMachines = machines.filter(({ disabled }) => !disabled);
    if (!machine) {
      inputBox.hide();
      disposableStore.dispose();
      throw new Error(localize("not found", "machine not found with id: {0}", machineId));
    }
    inputBox.busy = false;
    inputBox.value = machine.name;
    const validateMachineName = (machineName) => {
      machineName = machineName.trim();
      return machineName && !enabledMachines.some((m) => m.id !== machineId && m.name === machineName) ? machineName : null;
    };
    disposableStore.add(inputBox.onDidChangeValue(() => inputBox.validationMessage = validateMachineName(inputBox.value) ? "" : localize("valid message", "Machine name should be unique and not empty")));
    return new Promise((c, e) => {
      disposableStore.add(inputBox.onDidAccept(async () => {
        const machineName = validateMachineName(inputBox.value);
        disposableStore.dispose();
        if (machineName && machineName !== machine.name) {
          try {
            await this.userDataSyncMachinesService.renameMachine(machineId, machineName);
            c(true);
          } catch (error) {
            e(error);
          }
        } else {
          c(false);
        }
      }));
    });
  }
};
UserDataSyncMachinesViewDataProvider = __decorateClass([
  __decorateParam(1, IUserDataSyncMachinesService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, IUserDataSyncWorkbenchService)
], UserDataSyncMachinesViewDataProvider);
let UserDataSyncTroubleshootViewDataProvider = class {
  constructor(fileService, userDataSyncWorkbenchService, environmentService, uriIdentityService) {
    this.fileService = fileService;
    this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
    this.environmentService = environmentService;
    this.uriIdentityService = uriIdentityService;
  }
  async getChildren(element) {
    if (!element) {
      return [{
        handle: "SYNC_LOGS",
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        label: { label: localize("sync logs", "Logs") },
        themeIcon: Codicon.folder
      }, {
        handle: "LAST_SYNC_STATES",
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        label: { label: localize("last sync states", "Last Synced Remotes") },
        themeIcon: Codicon.folder
      }];
    }
    if (element.handle === "LAST_SYNC_STATES") {
      return this.getLastSyncStates();
    }
    if (element.handle === "SYNC_LOGS") {
      return this.getSyncLogs();
    }
    return [];
  }
  async getLastSyncStates() {
    const result = [];
    for (const syncResource of ALL_SYNC_RESOURCES) {
      const resource = getLastSyncResourceUri(void 0, syncResource, this.environmentService, this.uriIdentityService.extUri);
      if (await this.fileService.exists(resource)) {
        result.push({
          handle: resource.toString(),
          label: { label: getSyncAreaLabel(syncResource) },
          collapsibleState: TreeItemCollapsibleState.None,
          resourceUri: resource,
          command: { id: API_OPEN_EDITOR_COMMAND_ID, title: "", arguments: [resource, void 0, void 0] }
        });
      }
    }
    return result;
  }
  async getSyncLogs() {
    const logResources = await this.userDataSyncWorkbenchService.getAllLogResources();
    const result = [];
    for (const syncLogResource of logResources) {
      const logFolder = this.uriIdentityService.extUri.dirname(syncLogResource);
      result.push({
        handle: syncLogResource.toString(),
        collapsibleState: TreeItemCollapsibleState.None,
        resourceUri: syncLogResource,
        label: { label: this.uriIdentityService.extUri.basename(logFolder) },
        description: this.uriIdentityService.extUri.isEqual(logFolder, this.environmentService.logsHome) ? localize({ key: "current", comment: ["Represents current log file"] }, "Current") : void 0,
        command: { id: API_OPEN_EDITOR_COMMAND_ID, title: "", arguments: [syncLogResource, void 0, void 0] }
      });
    }
    return result;
  }
};
UserDataSyncTroubleshootViewDataProvider = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUserDataSyncWorkbenchService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IUriIdentityService)
], UserDataSyncTroubleshootViewDataProvider);
export {
  UserDataSyncDataViews
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3VzZXJEYXRhU3luYy9icm93c2VyL3VzZXJEYXRhU3luY1ZpZXdzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVZpZXdzUmVnaXN0cnksIEV4dGVuc2lvbnMsIElUcmVlVmlld0Rlc2NyaXB0b3IsIElUcmVlVmlld0RhdGFQcm92aWRlciwgSVRyZWVJdGVtLCBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUsIFRyZWVWaWV3SXRlbUhhbmRsZUFyZywgVmlld0NvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgVHJlZVZpZXcsIFRyZWVWaWV3UGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3MvdHJlZVZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBBTExfU1lOQ19SRVNPVVJDRVMsIElVc2VyRGF0YVN5bmNTZXJ2aWNlLCBJU3luY1Jlc291cmNlSGFuZGxlIGFzIElSZXNvdXJjZUhhbmRsZSwgU3luY1N0YXR1cywgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFBdXRvU3luY1NlcnZpY2UsIFVzZXJEYXRhU3luY0Vycm9yLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUsIGdldExhc3RTeW5jUmVzb3VyY2VVcmksIFN5bmNSZXNvdXJjZSwgSVN5bmNVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlEdG8gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRm9sZGVyVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBmcm9tTm93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSwgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLCBDT05URVhUX1NZTkNfU1RBVEUsIGdldFN5bmNBcmVhTGFiZWwsIENPTlRFWFRfQUNDT1VOVF9TVEFURSwgQWNjb3VudFN0YXR1cywgQ09OVEVYVF9FTkFCTEVfQUNUSVZJVFlfVklFV1MsIFNZTkNfVElUTEUsIFNZTkNfQ09ORkxJQ1RTX1ZJRVdfSUQsIENPTlRFWFRfRU5BQkxFX1NZTkNfQ09ORkxJQ1RTX1ZJRVcsIENPTlRFWFRfSEFTX0NPTkZMSUNUUyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UsIElVc2VyRGF0YVN5bmNNYWNoaW5lLCBpc1dlYlBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmNNYWNoaW5lcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IEFQSV9PUEVOX0RJRkZfRURJVE9SX0NPTU1BTkRfSUQsIEFQSV9PUEVOX0VESVRPUl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFTeW5jQ29uZmxpY3RzVmlld1BhbmUgfSBmcm9tICcuL3VzZXJEYXRhU3luY0NvbmZsaWN0c1ZpZXcuanMnO1xuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFTeW5jRGF0YVZpZXdzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBWaWV3Q29udGFpbmVyLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1NlcnZpY2U6IElVc2VyRGF0YVN5bmNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVnaXN0ZXJWaWV3cyhjb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclZpZXdzKGNvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IHZvaWQge1xuXHRcdHRoaXMucmVnaXN0ZXJDb25mbGljdHNWaWV3KGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLnJlZ2lzdGVyQWN0aXZpdHlWaWV3KGNvbnRhaW5lciwgdHJ1ZSk7XG5cdFx0dGhpcy5yZWdpc3Rlck1hY2hpbmVzVmlldyhjb250YWluZXIpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckFjdGl2aXR5Vmlldyhjb250YWluZXIsIGZhbHNlKTtcblx0XHR0aGlzLnJlZ2lzdGVyVHJvdWJsZVNob290Vmlldyhjb250YWluZXIpO1xuXHRcdHRoaXMucmVnaXN0ZXJFeHRlcm5hbEFjdGl2aXR5Vmlldyhjb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbmZsaWN0c1ZpZXcoY29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld3NSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpO1xuXHRcdGNvbnN0IHZpZXdOYW1lID0gbG9jYWxpemUyKCdjb25mbGljdHMnLCBcIkNvbmZsaWN0c1wiKTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjogSVRyZWVWaWV3RGVzY3JpcHRvciA9IHtcblx0XHRcdGlkOiBTWU5DX0NPTkZMSUNUU19WSUVXX0lELFxuXHRcdFx0bmFtZTogdmlld05hbWUsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFVzZXJEYXRhU3luY0NvbmZsaWN0c1ZpZXdQYW5lKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0VOQUJMRV9TWU5DX0NPTkZMSUNUU19WSUVXLCBDT05URVhUX0hBU19DT05GTElDVFMpLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogZmFsc2UsXG5cdFx0XHRjYW5Nb3ZlVmlldzogZmFsc2UsXG5cdFx0XHR0cmVlVmlldzogdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmVlVmlldywgU1lOQ19DT05GTElDVFNfVklFV19JRCwgdmlld05hbWUudmFsdWUpLFxuXHRcdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdG9yZGVyOiAxMDAsXG5cdFx0fTtcblx0XHR2aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3ZpZXdEZXNjcmlwdG9yXSwgY29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJNYWNoaW5lc1ZpZXcoY29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgaWQgPSBgd29ya2JlbmNoLnZpZXdzLnN5bmMubWFjaGluZXNgO1xuXHRcdGNvbnN0IG5hbWUgPSBsb2NhbGl6ZTIoJ3N5bmNlZCBtYWNoaW5lcycsIFwiU3luY2VkIE1hY2hpbmVzXCIpO1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmVlVmlldywgaWQsIG5hbWUudmFsdWUpO1xuXHRcdGNvbnN0IGRhdGFQcm92aWRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlckRhdGFTeW5jTWFjaGluZXNWaWV3RGF0YVByb3ZpZGVyLCB0cmVlVmlldyk7XG5cdFx0dHJlZVZpZXcuc2hvd1JlZnJlc2hBY3Rpb24gPSB0cnVlO1xuXHRcdHRyZWVWaWV3LmNhblNlbGVjdE1hbnkgPSB0cnVlO1xuXHRcdHRyZWVWaWV3LmRhdGFQcm92aWRlciA9IGRhdGFQcm92aWRlcjtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSh0aGlzLnVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZS5vbkRpZENoYW5nZSwgdGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLm9uRGlkUmVzZXRSZW1vdGUpKCgpID0+IHRyZWVWaWV3LnJlZnJlc2goKSkpO1xuXHRcdGNvbnN0IHZpZXdzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjogSVRyZWVWaWV3RGVzY3JpcHRvciA9IHtcblx0XHRcdGlkLFxuXHRcdFx0bmFtZSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoVHJlZVZpZXdQYW5lKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NZTkNfU1RBVEUubm90RXF1YWxzVG8oU3luY1N0YXR1cy5VbmluaXRpYWxpemVkKSwgQ09OVEVYVF9BQ0NPVU5UX1NUQVRFLmlzRXF1YWxUbyhBY2NvdW50U3RhdHVzLkF2YWlsYWJsZSksIENPTlRFWFRfRU5BQkxFX0FDVElWSVRZX1ZJRVdTKSxcblx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWUsXG5cdFx0XHRjYW5Nb3ZlVmlldzogZmFsc2UsXG5cdFx0XHR0cmVlVmlldyxcblx0XHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRvcmRlcjogMzAwLFxuXHRcdH07XG5cdFx0dmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKFt2aWV3RGVzY3JpcHRvcl0sIGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9ucy5zeW5jLmVkaXRNYWNoaW5lTmFtZWAsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9ucy5zeW5jLmVkaXRNYWNoaW5lTmFtZScsIFwiRWRpdCBOYW1lXCIpLFxuXHRcdFx0XHRcdGljb246IENvZGljb24uZWRpdCxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdJdGVtQ29udGV4dCxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBpZCkpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICdpbmxpbmUnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBoYW5kbGU6IFRyZWVWaWV3SXRlbUhhbmRsZUFyZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBjaGFuZ2VkID0gYXdhaXQgZGF0YVByb3ZpZGVyLnJlbmFtZShoYW5kbGUuJHRyZWVJdGVtSGFuZGxlKTtcblx0XHRcdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdFx0XHRhd2FpdCB0cmVlVmlldy5yZWZyZXNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9ucy5zeW5jLnR1cm5PZmZTeW5jT25NYWNoaW5lYCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb25zLnN5bmMudHVybk9mZlN5bmNPbk1hY2hpbmUnLCBcIlR1cm4gb2ZmIFNldHRpbmdzIFN5bmNcIiksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3SXRlbUNvbnRleHQsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgaWQpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdJdGVtJywgJ3N5bmMtbWFjaGluZScpKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaGFuZGxlOiBUcmVlVmlld0l0ZW1IYW5kbGVBcmcsIHNlbGVjdGVkPzogVHJlZVZpZXdJdGVtSGFuZGxlQXJnW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0aWYgKGF3YWl0IGRhdGFQcm92aWRlci5kaXNhYmxlKChzZWxlY3RlZCB8fCBbaGFuZGxlXSkubWFwKGhhbmRsZSA9PiBoYW5kbGUuJHRyZWVJdGVtSGFuZGxlKSkpIHtcblx0XHRcdFx0XHRhd2FpdCB0cmVlVmlldy5yZWZyZXNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJBY3Rpdml0eVZpZXcoY29udGFpbmVyOiBWaWV3Q29udGFpbmVyLCByZW1vdGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBpZCA9IGB3b3JrYmVuY2gudmlld3Muc3luYy4ke3JlbW90ZSA/ICdyZW1vdGUnIDogJ2xvY2FsJ31BY3Rpdml0eWA7XG5cdFx0Y29uc3QgbmFtZSA9IHJlbW90ZSA/IGxvY2FsaXplMigncmVtb3RlIHN5bmMgYWN0aXZpdHkgdGl0bGUnLCBcIlN5bmMgQWN0aXZpdHkgKFJlbW90ZSlcIikgOiBsb2NhbGl6ZTIoJ2xvY2FsIHN5bmMgYWN0aXZpdHkgdGl0bGUnLCBcIlN5bmMgQWN0aXZpdHkgKExvY2FsKVwiKTtcblx0XHRjb25zdCB0cmVlVmlldyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJlZVZpZXcsIGlkLCBuYW1lLnZhbHVlKTtcblx0XHR0cmVlVmlldy5zaG93Q29sbGFwc2VBbGxBY3Rpb24gPSB0cnVlO1xuXHRcdHRyZWVWaWV3LnNob3dSZWZyZXNoQWN0aW9uID0gdHJ1ZTtcblx0XHR0cmVlVmlldy5kYXRhUHJvdmlkZXIgPSByZW1vdGUgPyB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbW90ZVVzZXJEYXRhU3luY0FjdGl2aXR5Vmlld0RhdGFQcm92aWRlcilcblx0XHRcdDogdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbFVzZXJEYXRhU3luY0FjdGl2aXR5Vmlld0RhdGFQcm92aWRlcik7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkodGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5vbkRpZENoYW5nZVJlc291cmNlRW5hYmxlbWVudCxcblx0XHRcdHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VFbmFibGVtZW50LFxuXHRcdFx0dGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLm9uRGlkUmVzZXRMb2NhbCxcblx0XHRcdHRoaXMudXNlckRhdGFTeW5jU2VydmljZS5vbkRpZFJlc2V0UmVtb3RlKSgoKSA9PiB0cmVlVmlldy5yZWZyZXNoKCkpKTtcblx0XHRjb25zdCB2aWV3c1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KEV4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSk7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3I6IElUcmVlVmlld0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRpZCxcblx0XHRcdG5hbWUsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFRyZWVWaWV3UGFuZSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TWU5DX1NUQVRFLm5vdEVxdWFsc1RvKFN5bmNTdGF0dXMuVW5pbml0aWFsaXplZCksIENPTlRFWFRfQUNDT1VOVF9TVEFURS5pc0VxdWFsVG8oQWNjb3VudFN0YXR1cy5BdmFpbGFibGUpLCBDT05URVhUX0VOQUJMRV9BQ1RJVklUWV9WSUVXUyksXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRcdFx0Y2FuTW92ZVZpZXc6IGZhbHNlLFxuXHRcdFx0dHJlZVZpZXcsXG5cdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0b3JkZXI6IHJlbW90ZSA/IDIwMCA6IDQwMCxcblx0XHRcdGhpZGVCeURlZmF1bHQ6ICFyZW1vdGUsXG5cdFx0fTtcblx0XHR2aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3ZpZXdEZXNjcmlwdG9yXSwgY29udGFpbmVyKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJEYXRhVmlld0FjdGlvbnMoaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckV4dGVybmFsQWN0aXZpdHlWaWV3KGNvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IHZvaWQge1xuXHRcdGNvbnN0IGlkID0gYHdvcmtiZW5jaC52aWV3cy5zeW5jLmV4dGVybmFsQWN0aXZpdHlgO1xuXHRcdGNvbnN0IG5hbWUgPSBsb2NhbGl6ZTIoJ2Rvd25sb2FkZWQgc3luYyBhY3Rpdml0eSB0aXRsZScsIFwiU3luYyBBY3Rpdml0eSAoRGV2ZWxvcGVyKVwiKTtcblx0XHRjb25zdCBkYXRhUHJvdmlkZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dHJhY3RlZFVzZXJEYXRhU3luY0FjdGl2aXR5Vmlld0RhdGFQcm92aWRlciwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCB0cmVlVmlldyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJlZVZpZXcsIGlkLCBuYW1lLnZhbHVlKTtcblx0XHR0cmVlVmlldy5zaG93Q29sbGFwc2VBbGxBY3Rpb24gPSBmYWxzZTtcblx0XHR0cmVlVmlldy5zaG93UmVmcmVzaEFjdGlvbiA9IGZhbHNlO1xuXHRcdHRyZWVWaWV3LmRhdGFQcm92aWRlciA9IGRhdGFQcm92aWRlcjtcblxuXHRcdGNvbnN0IHZpZXdzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjogSVRyZWVWaWV3RGVzY3JpcHRvciA9IHtcblx0XHRcdGlkLFxuXHRcdFx0bmFtZSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoVHJlZVZpZXdQYW5lKSxcblx0XHRcdHdoZW46IENPTlRFWFRfRU5BQkxFX0FDVElWSVRZX1ZJRVdTLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZSxcblx0XHRcdGNhbk1vdmVWaWV3OiBmYWxzZSxcblx0XHRcdHRyZWVWaWV3LFxuXHRcdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdGhpZGVCeURlZmF1bHQ6IGZhbHNlLFxuXHRcdH07XG5cdFx0dmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKFt2aWV3RGVzY3JpcHRvcl0sIGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9ucy5zeW5jLmxvYWRBY3Rpdml0eWAsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9ucy5zeW5jLmxvYWRBY3Rpdml0eScsIFwiTG9hZCBTeW5jIEFjdGl2aXR5XCIpLFxuXHRcdFx0XHRcdGljb246IENvZGljb24uY2xvdWRVcGxvYWQsXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBpZCksXG5cdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IGZpbGVEaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlRGlhbG9nU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVEaWFsb2dTZXJ2aWNlLnNob3dPcGVuRGlhbG9nKHtcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NlbGVjdCBzeW5jIGFjdGl2aXR5IGZpbGUnLCBcIlNlbGVjdCBTeW5jIEFjdGl2aXR5IEZpbGUgb3IgRm9sZGVyXCIpLFxuXHRcdFx0XHRcdGNhblNlbGVjdEZpbGVzOiB0cnVlLFxuXHRcdFx0XHRcdGNhblNlbGVjdEZvbGRlcnM6IHRydWUsXG5cdFx0XHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoIXJlc3VsdD8uWzBdKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRhdGFQcm92aWRlci5hY3Rpdml0eURhdGFSZXNvdXJjZSA9IHJlc3VsdFswXTtcblx0XHRcdFx0YXdhaXQgdHJlZVZpZXcucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJEYXRhVmlld0FjdGlvbnModmlld0lkOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9ucy5zeW5jLiR7dmlld0lkfS5yZXNvbHZlUmVzb3VyY2VgLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbnMuc3luYy5yZXNvbHZlUmVzb3VyY2VSZWYnLCBcIlNob3cgcmF3IEpTT04gc3luYyBkYXRhXCIpLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld0l0ZW1Db250ZXh0LFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIHZpZXdJZCksIENvbnRleHRLZXlFeHByLnJlZ2V4KCd2aWV3SXRlbScsIC9zeW5jLXJlc291cmNlLS4qL2kpKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBoYW5kbGU6IFRyZWVWaWV3SXRlbUhhbmRsZUFyZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCB7IHJlc291cmNlIH0gPSA8eyByZXNvdXJjZTogc3RyaW5nIH0+SlNPTi5wYXJzZShoYW5kbGUuJHRyZWVJdGVtSGFuZGxlKTtcblx0XHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBVUkkucGFyc2UocmVzb3VyY2UpLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb25zLnN5bmMuJHt2aWV3SWR9LmNvbXBhcmVXaXRoTG9jYWxgLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbnMuc3luYy5jb21wYXJlV2l0aExvY2FsJywgXCJDb21wYXJlIHdpdGggTG9jYWxcIiksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3SXRlbUNvbnRleHQsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Jywgdmlld0lkKSwgQ29udGV4dEtleUV4cHIucmVnZXgoJ3ZpZXdJdGVtJywgL3N5bmMtYXNzb2NpYXRlZFJlc291cmNlLS4qL2kpKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBoYW5kbGU6IFRyZWVWaWV3SXRlbUhhbmRsZUFyZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCB7IHJlc291cmNlLCBjb21wYXJhYmxlUmVzb3VyY2UgfSA9IDx7IHJlc291cmNlOiBzdHJpbmc7IGNvbXBhcmFibGVSZXNvdXJjZTogc3RyaW5nIH0+SlNPTi5wYXJzZShoYW5kbGUuJHRyZWVJdGVtSGFuZGxlKTtcblx0XHRcdFx0Y29uc3QgcmVtb3RlUmVzb3VyY2UgPSBVUkkucGFyc2UocmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBsb2NhbFJlc291cmNlID0gVVJJLnBhcnNlKGNvbXBhcmFibGVSZXNvdXJjZSk7XG5cdFx0XHRcdHJldHVybiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBUElfT1BFTl9ESUZGX0VESVRPUl9DT01NQU5EX0lELFxuXHRcdFx0XHRcdHJlbW90ZVJlc291cmNlLFxuXHRcdFx0XHRcdGxvY2FsUmVzb3VyY2UsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3JlbW90ZVRvTG9jYWxEaWZmJywgXCJ7MH0gXHUyMTk0IHsxfVwiLCBsb2NhbGl6ZSh7IGtleTogJ2xlZnRSZXNvdXJjZU5hbWUnLCBjb21tZW50OiBbJ3JlbW90ZSBhcyBpbiBmaWxlIGluIGNsb3VkJ10gfSwgXCJ7MH0gKFJlbW90ZSlcIiwgYmFzZW5hbWUocmVtb3RlUmVzb3VyY2UpKSwgbG9jYWxpemUoeyBrZXk6ICdyaWdodFJlc291cmNlTmFtZScsIGNvbW1lbnQ6IFsnbG9jYWwgYXMgaW4gZmlsZSBpbiBkaXNrJ10gfSwgXCJ7MH0gKExvY2FsKVwiLCBiYXNlbmFtZShsb2NhbFJlc291cmNlKSkpLFxuXHRcdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb25zLnN5bmMuJHt2aWV3SWR9LnJlcGxhY2VDdXJyZW50YCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb25zLnN5bmMucmVwbGFjZUN1cnJlbnQnLCBcIlJlc3RvcmVcIiksXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5kaXNjYXJkLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld0l0ZW1Db250ZXh0LFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIHZpZXdJZCksIENvbnRleHRLZXlFeHByLnJlZ2V4KCd2aWV3SXRlbScsIC9zeW5jLXJlc291cmNlLS4qL2kpLCBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ3ZpZXdJdGVtJywgYHN5bmMtcmVzb3VyY2UtJHtTeW5jUmVzb3VyY2UuUHJvZmlsZXN9YCkpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICdpbmxpbmUnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBoYW5kbGU6IFRyZWVWaWV3SXRlbUhhbmRsZUFyZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgdXNlckRhdGFTeW5jU2VydmljZSA9IGFjY2Vzc29yLmdldChJVXNlckRhdGFTeW5jU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHsgc3luY1Jlc291cmNlSGFuZGxlLCBzeW5jUmVzb3VyY2UgfSA9IDx7IHN5bmNSZXNvdXJjZUhhbmRsZTogVXJpRHRvPElTeW5jUmVzb3VyY2VIYW5kbGU+OyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZSB9PkpTT04ucGFyc2UoaGFuZGxlLiR0cmVlSXRlbUhhbmRsZSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoeyBrZXk6ICdjb25maXJtIHJlcGxhY2UnLCBjb21tZW50OiBbJ0EgY29uZmlybWF0aW9uIG1lc3NhZ2UgdG8gcmVwbGFjZSBjdXJyZW50IHVzZXIgZGF0YSAoc2V0dGluZ3MsIGV4dGVuc2lvbnMsIGtleWJpbmRpbmdzLCBzbmlwcGV0cykgd2l0aCBzZWxlY3RlZCB2ZXJzaW9uJ10gfSwgXCJXb3VsZCB5b3UgbGlrZSB0byByZXBsYWNlIHlvdXIgY3VycmVudCB7MH0gd2l0aCBzZWxlY3RlZD9cIiwgZ2V0U3luY0FyZWFMYWJlbChzeW5jUmVzb3VyY2UpKSxcblx0XHRcdFx0XHR0eXBlOiAnaW5mbycsXG5cdFx0XHRcdFx0dGl0bGU6IFNZTkNfVElUTEUudmFsdWVcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVzZXJEYXRhU3luY1NlcnZpY2UucmVwbGFjZSh7IGNyZWF0ZWQ6IHN5bmNSZXNvdXJjZUhhbmRsZS5jcmVhdGVkLCB1cmk6IFVSSS5yZXZpdmUoc3luY1Jlc291cmNlSGFuZGxlLnVyaSkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJUcm91YmxlU2hvb3RWaWV3KGNvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IHZvaWQge1xuXHRcdGNvbnN0IGlkID0gYHdvcmtiZW5jaC52aWV3cy5zeW5jLnRyb3VibGVzaG9vdGA7XG5cdFx0Y29uc3QgbmFtZSA9IGxvY2FsaXplMigndHJvdWJsZXNob290JywgXCJUcm91Ymxlc2hvb3RcIik7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyZWVWaWV3LCBpZCwgbmFtZS52YWx1ZSk7XG5cdFx0Y29uc3QgZGF0YVByb3ZpZGVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVN5bmNUcm91Ymxlc2hvb3RWaWV3RGF0YVByb3ZpZGVyKTtcblx0XHR0cmVlVmlldy5zaG93UmVmcmVzaEFjdGlvbiA9IHRydWU7XG5cdFx0dHJlZVZpZXcuZGF0YVByb3ZpZGVyID0gZGF0YVByb3ZpZGVyO1xuXG5cdFx0Y29uc3Qgdmlld3NSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpO1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yOiBJVHJlZVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQsXG5cdFx0XHRuYW1lLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihUcmVlVmlld1BhbmUpLFxuXHRcdFx0d2hlbjogQ09OVEVYVF9FTkFCTEVfQUNUSVZJVFlfVklFV1MsXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRcdFx0Y2FuTW92ZVZpZXc6IGZhbHNlLFxuXHRcdFx0dHJlZVZpZXcsXG5cdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0b3JkZXI6IDUwMCxcblx0XHRcdGhpZGVCeURlZmF1bHQ6IHRydWVcblx0XHR9O1xuXHRcdHZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbdmlld0Rlc2NyaXB0b3JdLCBjb250YWluZXIpO1xuXG5cdH1cblxufVxuXG50eXBlIFByb2ZpbGUgPSBJVXNlckRhdGFQcm9maWxlIHwgSVN5bmNVc2VyRGF0YVByb2ZpbGU7XG5cbmludGVyZmFjZSBJU3luY1Jlc291cmNlSGFuZGxlIGV4dGVuZHMgSVJlc291cmNlSGFuZGxlIHtcblx0cHJvZmlsZUlkPzogc3RyaW5nO1xuXHRzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZTtcblx0cHJldmlvdXM/OiBJUmVzb3VyY2VIYW5kbGU7XG59XG5cbmludGVyZmFjZSBTeW5jUmVzb3VyY2VIYW5kbGVUcmVlSXRlbSBleHRlbmRzIElUcmVlSXRlbSB7XG5cdHN5bmNSZXNvdXJjZUhhbmRsZTogSVN5bmNSZXNvdXJjZUhhbmRsZTtcbn1cblxuaW50ZXJmYWNlIFByb2ZpbGVUcmVlSXRlbSBleHRlbmRzIElUcmVlSXRlbSB7XG5cdHByb2ZpbGU6IFByb2ZpbGU7XG59XG5cbmFic3RyYWN0IGNsYXNzIFVzZXJEYXRhU3luY0FjdGl2aXR5Vmlld0RhdGFQcm92aWRlcjxUID0gUHJvZmlsZT4gaW1wbGVtZW50cyBJVHJlZVZpZXdEYXRhUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3luY1Jlc291cmNlSGFuZGxlc0J5UHJvZmlsZSA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPFN5bmNSZXNvdXJjZUhhbmRsZVRyZWVJdGVtW10+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXNlckRhdGFTeW5jU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdXNlckRhdGFTeW5jU2VydmljZTogSVVzZXJEYXRhU3luY1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2U6IElVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZSxcblx0XHRASVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB1c2VyRGF0YUF1dG9TeW5jU2VydmljZTogSVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2U6IElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgZ2V0Q2hpbGRyZW4oZWxlbWVudD86IElUcmVlSXRlbSk6IFByb21pc2U8SVRyZWVJdGVtW10+IHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmdldFJvb3RzKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoKDxQcm9maWxlVHJlZUl0ZW0+ZWxlbWVudCkucHJvZmlsZSB8fCBlbGVtZW50LmhhbmRsZSA9PT0gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5pZCkge1xuXHRcdFx0XHRsZXQgcHJvbWlzZSA9IHRoaXMuc3luY1Jlc291cmNlSGFuZGxlc0J5UHJvZmlsZS5nZXQoZWxlbWVudC5oYW5kbGUpO1xuXHRcdFx0XHRpZiAoIXByb21pc2UpIHtcblx0XHRcdFx0XHR0aGlzLnN5bmNSZXNvdXJjZUhhbmRsZXNCeVByb2ZpbGUuc2V0KGVsZW1lbnQuaGFuZGxlLCBwcm9taXNlID0gdGhpcy5nZXRTeW5jUmVzb3VyY2VIYW5kbGVzKDxUPig8UHJvZmlsZVRyZWVJdGVtPmVsZW1lbnQpLnByb2ZpbGUpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYXdhaXQgcHJvbWlzZTtcblx0XHRcdH1cblx0XHRcdGlmICgoPFN5bmNSZXNvdXJjZUhhbmRsZVRyZWVJdGVtPmVsZW1lbnQpLnN5bmNSZXNvdXJjZUhhbmRsZSkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5nZXRDaGlsZHJlbkZvclN5bmNSZXNvdXJjZVRyZWVJdGVtKDxTeW5jUmVzb3VyY2VIYW5kbGVUcmVlSXRlbT5lbGVtZW50KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBbXTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCEoZXJyb3IgaW5zdGFuY2VvZiBVc2VyRGF0YVN5bmNFcnJvcikpIHtcblx0XHRcdFx0ZXJyb3IgPSBVc2VyRGF0YVN5bmNFcnJvci50b1VzZXJEYXRhU3luY0Vycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY0Vycm9yICYmIGVycm9yLmNvZGUgPT09IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5JbmNvbXBhdGlibGVSZW1vdGVDb250ZW50KSB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0XHRtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuXHRcdFx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IFtcblx0XHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdGlkOiAncmVzZXQnLFxuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVzZXQnLCBcIlJlc2V0IFN5bmNlZCBEYXRhXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy51c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLnJlc2V0U3luY2VkRGF0YSgpXG5cdFx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRSb290cygpOiBQcm9taXNlPElUcmVlSXRlbVtdPiB7XG5cdFx0dGhpcy5zeW5jUmVzb3VyY2VIYW5kbGVzQnlQcm9maWxlLmNsZWFyKCk7XG5cblx0XHRjb25zdCByb290czogSVRyZWVJdGVtW10gPSBbXTtcblxuXHRcdGNvbnN0IHByb2ZpbGVzID0gYXdhaXQgdGhpcy5nZXRQcm9maWxlcygpO1xuXHRcdGlmIChwcm9maWxlcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHByb2ZpbGVUcmVlSXRlbSA9IHtcblx0XHRcdFx0aGFuZGxlOiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmlkLFxuXHRcdFx0XHRsYWJlbDogeyBsYWJlbDogdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5uYW1lIH0sXG5cdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5FeHBhbmRlZCxcblx0XHRcdH07XG5cdFx0XHRyb290cy5wdXNoKHByb2ZpbGVUcmVlSXRlbSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRTeW5jUmVzb3VyY2VIYW5kbGVzID0gYXdhaXQgdGhpcy5nZXRTeW5jUmVzb3VyY2VIYW5kbGVzKCk7XG5cdFx0XHRyb290cy5wdXNoKC4uLmRlZmF1bHRTeW5jUmVzb3VyY2VIYW5kbGVzKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgcHJvZmlsZXMpIHtcblx0XHRcdGNvbnN0IHByb2ZpbGVUcmVlSXRlbTogUHJvZmlsZVRyZWVJdGVtID0ge1xuXHRcdFx0XHRoYW5kbGU6IHByb2ZpbGUuaWQsXG5cdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiBwcm9maWxlLm5hbWUgfSxcblx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZCxcblx0XHRcdFx0cHJvZmlsZSxcblx0XHRcdH07XG5cdFx0XHRyb290cy5wdXNoKHByb2ZpbGVUcmVlSXRlbSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJvb3RzO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldENoaWxkcmVuRm9yU3luY1Jlc291cmNlVHJlZUl0ZW0oZWxlbWVudDogU3luY1Jlc291cmNlSGFuZGxlVHJlZUl0ZW0pOiBQcm9taXNlPElUcmVlSXRlbVtdPiB7XG5cdFx0Y29uc3Qgc3luY1Jlc291cmNlSGFuZGxlID0gKDxTeW5jUmVzb3VyY2VIYW5kbGVUcmVlSXRlbT5lbGVtZW50KS5zeW5jUmVzb3VyY2VIYW5kbGU7XG5cdFx0Y29uc3QgYXNzb2NpYXRlZFJlc291cmNlcyA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuZ2V0QXNzb2NpYXRlZFJlc291cmNlcyhzeW5jUmVzb3VyY2VIYW5kbGUpO1xuXHRcdGNvbnN0IHByZXZpb3VzQXNzb2NpYXRlZFJlc291cmNlcyA9IHN5bmNSZXNvdXJjZUhhbmRsZS5wcmV2aW91cyA/IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuZ2V0QXNzb2NpYXRlZFJlc291cmNlcyhzeW5jUmVzb3VyY2VIYW5kbGUucHJldmlvdXMpIDogW107XG5cdFx0cmV0dXJuIGFzc29jaWF0ZWRSZXNvdXJjZXMubWFwKCh7IHJlc291cmNlLCBjb21wYXJhYmxlUmVzb3VyY2UgfSkgPT4ge1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gSlNPTi5zdHJpbmdpZnkoeyByZXNvdXJjZTogcmVzb3VyY2UudG9TdHJpbmcoKSwgY29tcGFyYWJsZVJlc291cmNlOiBjb21wYXJhYmxlUmVzb3VyY2UudG9TdHJpbmcoKSB9KTtcblx0XHRcdGNvbnN0IHByZXZpb3VzUmVzb3VyY2UgPSBwcmV2aW91c0Fzc29jaWF0ZWRSZXNvdXJjZXMuZmluZChwcmV2aW91cyA9PiBiYXNlbmFtZShwcmV2aW91cy5yZXNvdXJjZSkgPT09IGJhc2VuYW1lKHJlc291cmNlKSk/LnJlc291cmNlO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aGFuZGxlLFxuXHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSxcblx0XHRcdFx0cmVzb3VyY2VVcmk6IHJlc291cmNlLFxuXHRcdFx0XHRjb21tYW5kOiBwcmV2aW91c1Jlc291cmNlID8ge1xuXHRcdFx0XHRcdGlkOiBBUElfT1BFTl9ESUZGX0VESVRPUl9DT01NQU5EX0lELFxuXHRcdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0XHRhcmd1bWVudHM6IFtcblx0XHRcdFx0XHRcdHByZXZpb3VzUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdzaWRlQnlTaWRlTGFiZWxzJywgXCJ7MH0gXHUyMTk0IHsxfVwiLCBgJHtiYXNlbmFtZShyZXNvdXJjZSl9ICgke2Zyb21Ob3coc3luY1Jlc291cmNlSGFuZGxlLnByZXZpb3VzIS5jcmVhdGVkLCB0cnVlKX0pYCwgYCR7YmFzZW5hbWUocmVzb3VyY2UpfSAoJHtmcm9tTm93KHN5bmNSZXNvdXJjZUhhbmRsZS5jcmVhdGVkLCB0cnVlKX0pYCksXG5cdFx0XHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0gOiB7XG5cdFx0XHRcdFx0aWQ6IEFQSV9PUEVOX0VESVRPUl9DT01NQU5EX0lELFxuXHRcdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0XHRhcmd1bWVudHM6IFtyZXNvdXJjZSwgdW5kZWZpbmVkLCB1bmRlZmluZWRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbnRleHRWYWx1ZTogYHN5bmMtYXNzb2NpYXRlZFJlc291cmNlLSR7c3luY1Jlc291cmNlSGFuZGxlLnN5bmNSZXNvdXJjZX1gXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTeW5jUmVzb3VyY2VIYW5kbGVzKHByb2ZpbGU/OiBUKTogUHJvbWlzZTxTeW5jUmVzb3VyY2VIYW5kbGVUcmVlSXRlbVtdPiB7XG5cdFx0Y29uc3QgdHJlZUl0ZW1zOiBTeW5jUmVzb3VyY2VIYW5kbGVUcmVlSXRlbVtdID0gW107XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5hbGwoQUxMX1NZTkNfUkVTT1VSQ0VTLm1hcChhc3luYyBzeW5jUmVzb3VyY2UgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VIYW5kbGVzID0gYXdhaXQgdGhpcy5nZXRSZXNvdXJjZUhhbmRsZXMoc3luY1Jlc291cmNlLCBwcm9maWxlKTtcblx0XHRcdHJldHVybiByZXNvdXJjZUhhbmRsZXMubWFwKChyZXNvdXJjZUhhbmRsZSwgaW5kZXgpID0+ICh7IC4uLnJlc291cmNlSGFuZGxlLCBzeW5jUmVzb3VyY2UsIHByZXZpb3VzOiByZXNvdXJjZUhhbmRsZXNbaW5kZXggKyAxXSB9KSk7XG5cdFx0fSkpO1xuXHRcdGNvbnN0IHN5bmNSZXNvdXJjZUhhbmRsZXMgPSByZXN1bHQuZmxhdCgpLnNvcnQoKGEsIGIpID0+IGIuY3JlYXRlZCAtIGEuY3JlYXRlZCk7XG5cdFx0Zm9yIChjb25zdCBzeW5jUmVzb3VyY2VIYW5kbGUgb2Ygc3luY1Jlc291cmNlSGFuZGxlcykge1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gSlNPTi5zdHJpbmdpZnkoeyBzeW5jUmVzb3VyY2VIYW5kbGUsIHN5bmNSZXNvdXJjZTogc3luY1Jlc291cmNlSGFuZGxlLnN5bmNSZXNvdXJjZSB9KTtcblx0XHRcdHRyZWVJdGVtcy5wdXNoKHtcblx0XHRcdFx0aGFuZGxlLFxuXHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkLFxuXHRcdFx0XHRsYWJlbDogeyBsYWJlbDogZ2V0U3luY0FyZWFMYWJlbChzeW5jUmVzb3VyY2VIYW5kbGUuc3luY1Jlc291cmNlKSB9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZnJvbU5vdyhzeW5jUmVzb3VyY2VIYW5kbGUuY3JlYXRlZCwgdHJ1ZSksXG5cdFx0XHRcdHRvb2x0aXA6IG5ldyBEYXRlKHN5bmNSZXNvdXJjZUhhbmRsZS5jcmVhdGVkKS50b0xvY2FsZVN0cmluZygpLFxuXHRcdFx0XHR0aGVtZUljb246IEZvbGRlclRoZW1lSWNvbixcblx0XHRcdFx0c3luY1Jlc291cmNlSGFuZGxlLFxuXHRcdFx0XHRjb250ZXh0VmFsdWU6IGBzeW5jLXJlc291cmNlLSR7c3luY1Jlc291cmNlSGFuZGxlLnN5bmNSZXNvdXJjZX1gXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRyZWVJdGVtcztcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRQcm9maWxlcygpOiBQcm9taXNlPFByb2ZpbGVbXT47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRSZXNvdXJjZUhhbmRsZXMoc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UsIHByb2ZpbGU/OiBUKTogUHJvbWlzZTxJUmVzb3VyY2VIYW5kbGVbXT47XG59XG5cbmNsYXNzIExvY2FsVXNlckRhdGFTeW5jQWN0aXZpdHlWaWV3RGF0YVByb3ZpZGVyIGV4dGVuZHMgVXNlckRhdGFTeW5jQWN0aXZpdHlWaWV3RGF0YVByb3ZpZGVyPElTeW5jVXNlckRhdGFQcm9maWxlPiB7XG5cblx0cHJvdGVjdGVkIGdldFJlc291cmNlSGFuZGxlcyhzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZSwgcHJvZmlsZTogSVN5bmNVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQpOiBQcm9taXNlPElSZXNvdXJjZUhhbmRsZVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuZ2V0TG9jYWxTeW5jUmVzb3VyY2VIYW5kbGVzKHN5bmNSZXNvdXJjZSwgcHJvZmlsZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0UHJvZmlsZXMoKTogUHJvbWlzZTxJU3luY1VzZXJEYXRhUHJvZmlsZVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXNcblx0XHRcdC5maWx0ZXIocCA9PiAhcC5pc0RlZmF1bHQpXG5cdFx0XHQubWFwKHAgPT4gKHtcblx0XHRcdFx0aWQ6IHAuaWQsXG5cdFx0XHRcdGNvbGxlY3Rpb246IHAuaWQsXG5cdFx0XHRcdG5hbWU6IHAubmFtZSxcblx0XHRcdH0pKTtcblx0fVxufVxuXG5jbGFzcyBSZW1vdGVVc2VyRGF0YVN5bmNBY3Rpdml0eVZpZXdEYXRhUHJvdmlkZXIgZXh0ZW5kcyBVc2VyRGF0YVN5bmNBY3Rpdml0eVZpZXdEYXRhUHJvdmlkZXI8SVN5bmNVc2VyRGF0YVByb2ZpbGU+IHtcblxuXHRwcml2YXRlIG1hY2hpbmVzUHJvbWlzZTogUHJvbWlzZTxJVXNlckRhdGFTeW5jTWFjaGluZVtdPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVzZXJEYXRhU3luY1NlcnZpY2UgdXNlckRhdGFTeW5jU2VydmljZTogSVVzZXJEYXRhU3luY1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZSB1c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZTogSVVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFBdXRvU3luY1NlcnZpY2UgdXNlckRhdGFBdXRvU3luY1NlcnZpY2U6IElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZTogSVVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UgdXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZTogSVVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodXNlckRhdGFTeW5jU2VydmljZSwgdXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UsIHVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLCB1c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBnZXRDaGlsZHJlbihlbGVtZW50PzogSVRyZWVJdGVtKTogUHJvbWlzZTxJVHJlZUl0ZW1bXT4ge1xuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0dGhpcy5tYWNoaW5lc1Byb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBzdXBlci5nZXRDaGlsZHJlbihlbGVtZW50KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWFjaGluZXMoKTogUHJvbWlzZTxJVXNlckRhdGFTeW5jTWFjaGluZVtdPiB7XG5cdFx0aWYgKHRoaXMubWFjaGluZXNQcm9taXNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMubWFjaGluZXNQcm9taXNlID0gdGhpcy51c2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UuZ2V0TWFjaGluZXMoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubWFjaGluZXNQcm9taXNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFJlc291cmNlSGFuZGxlcyhzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZSwgcHJvZmlsZT86IElTeW5jVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTxJUmVzb3VyY2VIYW5kbGVbXT4ge1xuXHRcdHJldHVybiB0aGlzLnVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLmdldFJlbW90ZVN5bmNSZXNvdXJjZUhhbmRsZXMoc3luY1Jlc291cmNlLCBwcm9maWxlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRQcm9maWxlcygpOiBQcm9taXNlPElTeW5jVXNlckRhdGFQcm9maWxlW10+IHtcblx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5nZXRSZW1vdGVTeW5jZWRQcm9maWxlcygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGdldENoaWxkcmVuRm9yU3luY1Jlc291cmNlVHJlZUl0ZW0oZWxlbWVudDogU3luY1Jlc291cmNlSGFuZGxlVHJlZUl0ZW0pOiBQcm9taXNlPElUcmVlSXRlbVtdPiB7XG5cdFx0Y29uc3QgY2hpbGRyZW4gPSBhd2FpdCBzdXBlci5nZXRDaGlsZHJlbkZvclN5bmNSZXNvdXJjZVRyZWVJdGVtKGVsZW1lbnQpO1xuXHRcdGlmIChjaGlsZHJlbi5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG1hY2hpbmVJZCA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuZ2V0TWFjaGluZUlkKGVsZW1lbnQuc3luY1Jlc291cmNlSGFuZGxlKTtcblx0XHRcdGlmIChtYWNoaW5lSWQpIHtcblx0XHRcdFx0Y29uc3QgbWFjaGluZXMgPSBhd2FpdCB0aGlzLmdldE1hY2hpbmVzKCk7XG5cdFx0XHRcdGNvbnN0IG1hY2hpbmUgPSBtYWNoaW5lcy5maW5kKCh7IGlkIH0pID0+IGlkID09PSBtYWNoaW5lSWQpO1xuXHRcdFx0XHRjaGlsZHJlblswXS5kZXNjcmlwdGlvbiA9IG1hY2hpbmU/LmlzQ3VycmVudCA/IGxvY2FsaXplKHsga2V5OiAnY3VycmVudCcsIGNvbW1lbnQ6IFsnUmVwcmVzZW50cyBjdXJyZW50IG1hY2hpbmUnXSB9LCBcIkN1cnJlbnRcIikgOiBtYWNoaW5lPy5uYW1lO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY2hpbGRyZW47XG5cdH1cbn1cblxuY2xhc3MgRXh0cmFjdGVkVXNlckRhdGFTeW5jQWN0aXZpdHlWaWV3RGF0YVByb3ZpZGVyIGV4dGVuZHMgVXNlckRhdGFTeW5jQWN0aXZpdHlWaWV3RGF0YVByb3ZpZGVyPElTeW5jVXNlckRhdGFQcm9maWxlPiB7XG5cblx0cHJpdmF0ZSBtYWNoaW5lc1Byb21pc2U6IFByb21pc2U8SVVzZXJEYXRhU3luY01hY2hpbmVbXT4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBhY3Rpdml0eURhdGFMb2NhdGlvbjogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyBhY3Rpdml0eURhdGFSZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdEBJVXNlckRhdGFTeW5jU2VydmljZSB1c2VyRGF0YVN5bmNTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlIHVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlOiBJVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSB1c2VyRGF0YUF1dG9TeW5jU2VydmljZTogSVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSB1c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlOiBJVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih1c2VyRGF0YVN5bmNTZXJ2aWNlLCB1c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZSwgdXNlckRhdGFBdXRvU3luY1NlcnZpY2UsIHVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGdldENoaWxkcmVuKGVsZW1lbnQ/OiBJVHJlZUl0ZW0pOiBQcm9taXNlPElUcmVlSXRlbVtdPiB7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHR0aGlzLm1hY2hpbmVzUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdGlmICghdGhpcy5hY3Rpdml0eURhdGFSZXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKHRoaXMuYWN0aXZpdHlEYXRhUmVzb3VyY2UpO1xuXHRcdFx0aWYgKHN0YXQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0dGhpcy5hY3Rpdml0eURhdGFMb2NhdGlvbiA9IHRoaXMuYWN0aXZpdHlEYXRhUmVzb3VyY2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmFjdGl2aXR5RGF0YUxvY2F0aW9uID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5kaXJuYW1lKHRoaXMuYWN0aXZpdHlEYXRhUmVzb3VyY2UpLCAncmVtb3RlQWN0aXZpdHknKTtcblx0XHRcdFx0dHJ5IHsgYXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwodGhpcy5hY3Rpdml0eURhdGFMb2NhdGlvbiwgeyByZWN1cnNpdmU6IHRydWUgfSk7IH0gY2F0Y2ggKGUpIHsvKiBpZ25vcmUgKi8gfVxuXHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UuZXh0cmFjdEFjdGl2aXR5RGF0YSh0aGlzLmFjdGl2aXR5RGF0YVJlc291cmNlLCB0aGlzLmFjdGl2aXR5RGF0YUxvY2F0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLmdldENoaWxkcmVuKGVsZW1lbnQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFJlc291cmNlSGFuZGxlcyhzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZSwgcHJvZmlsZTogSVN5bmNVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQpOiBQcm9taXNlPElSZXNvdXJjZUhhbmRsZVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuZ2V0TG9jYWxTeW5jUmVzb3VyY2VIYW5kbGVzKHN5bmNSZXNvdXJjZSwgcHJvZmlsZSwgdGhpcy5hY3Rpdml0eURhdGFMb2NhdGlvbik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZ2V0UHJvZmlsZXMoKTogUHJvbWlzZTxJU3luY1VzZXJEYXRhUHJvZmlsZVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuZ2V0TG9jYWxTeW5jZWRQcm9maWxlcyh0aGlzLmFjdGl2aXR5RGF0YUxvY2F0aW9uKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBnZXRDaGlsZHJlbkZvclN5bmNSZXNvdXJjZVRyZWVJdGVtKGVsZW1lbnQ6IFN5bmNSZXNvdXJjZUhhbmRsZVRyZWVJdGVtKTogUHJvbWlzZTxJVHJlZUl0ZW1bXT4ge1xuXHRcdGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgc3VwZXIuZ2V0Q2hpbGRyZW5Gb3JTeW5jUmVzb3VyY2VUcmVlSXRlbShlbGVtZW50KTtcblx0XHRpZiAoY2hpbGRyZW4ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBtYWNoaW5lSWQgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLmdldE1hY2hpbmVJZChlbGVtZW50LnN5bmNSZXNvdXJjZUhhbmRsZSk7XG5cdFx0XHRpZiAobWFjaGluZUlkKSB7XG5cdFx0XHRcdGNvbnN0IG1hY2hpbmVzID0gYXdhaXQgdGhpcy5nZXRNYWNoaW5lcygpO1xuXHRcdFx0XHRjb25zdCBtYWNoaW5lID0gbWFjaGluZXMuZmluZCgoeyBpZCB9KSA9PiBpZCA9PT0gbWFjaGluZUlkKTtcblx0XHRcdFx0Y2hpbGRyZW5bMF0uZGVzY3JpcHRpb24gPSBtYWNoaW5lPy5pc0N1cnJlbnQgPyBsb2NhbGl6ZSh7IGtleTogJ2N1cnJlbnQnLCBjb21tZW50OiBbJ1JlcHJlc2VudHMgY3VycmVudCBtYWNoaW5lJ10gfSwgXCJDdXJyZW50XCIpIDogbWFjaGluZT8ubmFtZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNoaWxkcmVuO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYWNoaW5lcygpOiBQcm9taXNlPElVc2VyRGF0YVN5bmNNYWNoaW5lW10+IHtcblx0XHRpZiAodGhpcy5tYWNoaW5lc1Byb21pc2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5tYWNoaW5lc1Byb21pc2UgPSB0aGlzLnVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLmdldExvY2FsU3luY2VkTWFjaGluZXModGhpcy5hY3Rpdml0eURhdGFMb2NhdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1hY2hpbmVzUHJvbWlzZTtcblx0fVxufVxuXG5jbGFzcyBVc2VyRGF0YVN5bmNNYWNoaW5lc1ZpZXdEYXRhUHJvdmlkZXIgaW1wbGVtZW50cyBJVHJlZVZpZXdEYXRhUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgbWFjaGluZXNQcm9taXNlOiBQcm9taXNlPElVc2VyRGF0YVN5bmNNYWNoaW5lW10+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdHJlZVZpZXc6IFRyZWVWaWV3LFxuXHRcdEBJVXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2U6IElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdGFzeW5jIGdldENoaWxkcmVuKGVsZW1lbnQ/OiBJVHJlZUl0ZW0pOiBQcm9taXNlPElUcmVlSXRlbVtdPiB7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHR0aGlzLm1hY2hpbmVzUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGxldCBtYWNoaW5lcyA9IGF3YWl0IHRoaXMuZ2V0TWFjaGluZXMoKTtcblx0XHRcdG1hY2hpbmVzID0gbWFjaGluZXMuZmlsdGVyKG0gPT4gIW0uZGlzYWJsZWQpLnNvcnQoKG0xLCBtMikgPT4gbTEuaXNDdXJyZW50ID8gLTEgOiAxKTtcblx0XHRcdHRoaXMudHJlZVZpZXcubWVzc2FnZSA9IG1hY2hpbmVzLmxlbmd0aCA/IHVuZGVmaW5lZCA6IGxvY2FsaXplKCdubyBtYWNoaW5lcycsIFwiTm8gTWFjaGluZXNcIik7XG5cdFx0XHRyZXR1cm4gbWFjaGluZXMubWFwKCh7IGlkLCBuYW1lLCBpc0N1cnJlbnQsIHBsYXRmb3JtIH0pID0+ICh7XG5cdFx0XHRcdGhhbmRsZTogaWQsXG5cdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lLFxuXHRcdFx0XHRsYWJlbDogeyBsYWJlbDogbmFtZSB9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogaXNDdXJyZW50ID8gbG9jYWxpemUoeyBrZXk6ICdjdXJyZW50JywgY29tbWVudDogWydDdXJyZW50IG1hY2hpbmUnXSB9LCBcIkN1cnJlbnRcIikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRoZW1lSWNvbjogcGxhdGZvcm0gJiYgaXNXZWJQbGF0Zm9ybShwbGF0Zm9ybSkgPyBDb2RpY29uLmdsb2JlIDogQ29kaWNvbi52bSxcblx0XHRcdFx0Y29udGV4dFZhbHVlOiAnc3luYy1tYWNoaW5lJ1xuXHRcdFx0fSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0TWFjaGluZXMoKTogUHJvbWlzZTxJVXNlckRhdGFTeW5jTWFjaGluZVtdPiB7XG5cdFx0aWYgKHRoaXMubWFjaGluZXNQcm9taXNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMubWFjaGluZXNQcm9taXNlID0gdGhpcy51c2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UuZ2V0TWFjaGluZXMoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubWFjaGluZXNQcm9taXNlO1xuXHR9XG5cblx0YXN5bmMgZGlzYWJsZShtYWNoaW5lSWRzOiBzdHJpbmdbXSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG1hY2hpbmVzID0gYXdhaXQgdGhpcy5nZXRNYWNoaW5lcygpO1xuXHRcdGNvbnN0IG1hY2hpbmVzVG9EaXNhYmxlID0gbWFjaGluZXMuZmlsdGVyKCh7IGlkIH0pID0+IG1hY2hpbmVJZHMuaW5jbHVkZXMoaWQpKTtcblx0XHRpZiAoIW1hY2hpbmVzVG9EaXNhYmxlLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub3QgZm91bmQnLCBcIm1hY2hpbmUgbm90IGZvdW5kIHdpdGggaWQ6IHswfVwiLCBtYWNoaW5lSWRzLmpvaW4oJywnKSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICdpbmZvJyxcblx0XHRcdG1lc3NhZ2U6IG1hY2hpbmVzVG9EaXNhYmxlLmxlbmd0aCA+IDEgPyBsb2NhbGl6ZSgndHVybiBvZmYgc3luYyBvbiBtdWx0aXBsZSBtYWNoaW5lcycsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIHR1cm4gb2ZmIHN5bmMgb24gc2VsZWN0ZWQgbWFjaGluZXM/XCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3R1cm4gb2ZmIHN5bmMgb24gbWFjaGluZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIHR1cm4gb2ZmIHN5bmMgb24gezB9P1wiLCBtYWNoaW5lc1RvRGlzYWJsZVswXS5uYW1lKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAndHVybiBvZmYnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZUdXJuIG9mZlwiKSxcblx0XHR9KTtcblxuXHRcdGlmICghcmVzdWx0LmNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChtYWNoaW5lc1RvRGlzYWJsZS5zb21lKG1hY2hpbmUgPT4gbWFjaGluZS5pc0N1cnJlbnQpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UudHVybm9mZihmYWxzZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3RoZXJNYWNoaW5lc1RvRGlzYWJsZTogW3N0cmluZywgYm9vbGVhbl1bXSA9IG1hY2hpbmVzVG9EaXNhYmxlLmZpbHRlcihtYWNoaW5lID0+ICFtYWNoaW5lLmlzQ3VycmVudClcblx0XHRcdC5tYXAobWFjaGluZSA9PiAoW21hY2hpbmUuaWQsIGZhbHNlXSkpO1xuXHRcdGlmIChvdGhlck1hY2hpbmVzVG9EaXNhYmxlLmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2Uuc2V0RW5hYmxlbWVudHMob3RoZXJNYWNoaW5lc1RvRGlzYWJsZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyByZW5hbWUobWFjaGluZUlkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaW5wdXRCb3ggPSBkaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlSW5wdXRCb3goKSk7XG5cdFx0aW5wdXRCb3gucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgncGxhY2Vob2xkZXInLCBcIkVudGVyIHRoZSBuYW1lIG9mIHRoZSBtYWNoaW5lXCIpO1xuXHRcdGlucHV0Qm94LmJ1c3kgPSB0cnVlO1xuXHRcdGlucHV0Qm94LnNob3coKTtcblx0XHRjb25zdCBtYWNoaW5lcyA9IGF3YWl0IHRoaXMuZ2V0TWFjaGluZXMoKTtcblx0XHRjb25zdCBtYWNoaW5lID0gbWFjaGluZXMuZmluZCgoeyBpZCB9KSA9PiBpZCA9PT0gbWFjaGluZUlkKTtcblx0XHRjb25zdCBlbmFibGVkTWFjaGluZXMgPSBtYWNoaW5lcy5maWx0ZXIoKHsgZGlzYWJsZWQgfSkgPT4gIWRpc2FibGVkKTtcblx0XHRpZiAoIW1hY2hpbmUpIHtcblx0XHRcdGlucHV0Qm94LmhpZGUoKTtcblx0XHRcdGRpc3Bvc2FibGVTdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vdCBmb3VuZCcsIFwibWFjaGluZSBub3QgZm91bmQgd2l0aCBpZDogezB9XCIsIG1hY2hpbmVJZCkpO1xuXHRcdH1cblx0XHRpbnB1dEJveC5idXN5ID0gZmFsc2U7XG5cdFx0aW5wdXRCb3gudmFsdWUgPSBtYWNoaW5lLm5hbWU7XG5cdFx0Y29uc3QgdmFsaWRhdGVNYWNoaW5lTmFtZSA9IChtYWNoaW5lTmFtZTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG5cdFx0XHRtYWNoaW5lTmFtZSA9IG1hY2hpbmVOYW1lLnRyaW0oKTtcblx0XHRcdHJldHVybiBtYWNoaW5lTmFtZSAmJiAhZW5hYmxlZE1hY2hpbmVzLnNvbWUobSA9PiBtLmlkICE9PSBtYWNoaW5lSWQgJiYgbS5uYW1lID09PSBtYWNoaW5lTmFtZSkgPyBtYWNoaW5lTmFtZSA6IG51bGw7XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGlucHV0Qm94Lm9uRGlkQ2hhbmdlVmFsdWUoKCkgPT5cblx0XHRcdGlucHV0Qm94LnZhbGlkYXRpb25NZXNzYWdlID0gdmFsaWRhdGVNYWNoaW5lTmFtZShpbnB1dEJveC52YWx1ZSkgPyAnJyA6IGxvY2FsaXplKCd2YWxpZCBtZXNzYWdlJywgXCJNYWNoaW5lIG5hbWUgc2hvdWxkIGJlIHVuaXF1ZSBhbmQgbm90IGVtcHR5XCIpKSk7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPGJvb2xlYW4+KChjLCBlKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGlucHV0Qm94Lm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbWFjaGluZU5hbWUgPSB2YWxpZGF0ZU1hY2hpbmVOYW1lKGlucHV0Qm94LnZhbHVlKTtcblx0XHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0aWYgKG1hY2hpbmVOYW1lICYmIG1hY2hpbmVOYW1lICE9PSBtYWNoaW5lLm5hbWUpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UucmVuYW1lTWFjaGluZShtYWNoaW5lSWQsIG1hY2hpbmVOYW1lKTtcblx0XHRcdFx0XHRcdGModHJ1ZSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdGUoZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIFVzZXJEYXRhU3luY1Ryb3VibGVzaG9vdFZpZXdEYXRhUHJvdmlkZXIgaW1wbGVtZW50cyBJVHJlZVZpZXdEYXRhUHJvdmlkZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2U6IElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdGFzeW5jIGdldENoaWxkcmVuKGVsZW1lbnQ/OiBJVHJlZUl0ZW0pOiBQcm9taXNlPElUcmVlSXRlbVtdPiB7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0aGFuZGxlOiAnU1lOQ19MT0dTJyxcblx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZCxcblx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IGxvY2FsaXplKCdzeW5jIGxvZ3MnLCBcIkxvZ3NcIikgfSxcblx0XHRcdFx0dGhlbWVJY29uOiBDb2RpY29uLmZvbGRlcixcblx0XHRcdH0sIHtcblx0XHRcdFx0aGFuZGxlOiAnTEFTVF9TWU5DX1NUQVRFUycsXG5cdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQsXG5cdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiBsb2NhbGl6ZSgnbGFzdCBzeW5jIHN0YXRlcycsIFwiTGFzdCBTeW5jZWQgUmVtb3Rlc1wiKSB9LFxuXHRcdFx0XHR0aGVtZUljb246IENvZGljb24uZm9sZGVyLFxuXHRcdFx0fV07XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQuaGFuZGxlID09PSAnTEFTVF9TWU5DX1NUQVRFUycpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldExhc3RTeW5jU3RhdGVzKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQuaGFuZGxlID09PSAnU1lOQ19MT0dTJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0U3luY0xvZ3MoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldExhc3RTeW5jU3RhdGVzKCk6IFByb21pc2U8SVRyZWVJdGVtW10+IHtcblx0XHRjb25zdCByZXN1bHQ6IElUcmVlSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBzeW5jUmVzb3VyY2Ugb2YgQUxMX1NZTkNfUkVTT1VSQ0VTKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IGdldExhc3RTeW5jUmVzb3VyY2VVcmkodW5kZWZpbmVkLCBzeW5jUmVzb3VyY2UsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkpO1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKHJlc291cmNlKSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0aGFuZGxlOiByZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiBnZXRTeW5jQXJlYUxhYmVsKHN5bmNSZXNvdXJjZSkgfSxcblx0XHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSxcblx0XHRcdFx0XHRyZXNvdXJjZVVyaTogcmVzb3VyY2UsXG5cdFx0XHRcdFx0Y29tbWFuZDogeyBpZDogQVBJX09QRU5fRURJVE9SX0NPTU1BTkRfSUQsIHRpdGxlOiAnJywgYXJndW1lbnRzOiBbcmVzb3VyY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkXSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0U3luY0xvZ3MoKTogUHJvbWlzZTxJVHJlZUl0ZW1bXT4ge1xuXHRcdGNvbnN0IGxvZ1Jlc291cmNlcyA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5nZXRBbGxMb2dSZXNvdXJjZXMoKTtcblx0XHRjb25zdCByZXN1bHQ6IElUcmVlSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBzeW5jTG9nUmVzb3VyY2Ugb2YgbG9nUmVzb3VyY2VzKSB7XG5cdFx0XHRjb25zdCBsb2dGb2xkZXIgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZGlybmFtZShzeW5jTG9nUmVzb3VyY2UpO1xuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRoYW5kbGU6IHN5bmNMb2dSZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSxcblx0XHRcdFx0cmVzb3VyY2VVcmk6IHN5bmNMb2dSZXNvdXJjZSxcblx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5iYXNlbmFtZShsb2dGb2xkZXIpIH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChsb2dGb2xkZXIsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmxvZ3NIb21lKSA/IGxvY2FsaXplKHsga2V5OiAnY3VycmVudCcsIGNvbW1lbnQ6IFsnUmVwcmVzZW50cyBjdXJyZW50IGxvZyBmaWxlJ10gfSwgXCJDdXJyZW50XCIpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb21tYW5kOiB7IGlkOiBBUElfT1BFTl9FRElUT1JfQ09NTUFORF9JRCwgdGl0bGU6ICcnLCBhcmd1bWVudHM6IFtzeW5jTG9nUmVzb3VyY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkXSB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUF5QixZQUFtRSxnQ0FBc0U7QUFDbEssU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFVBQVUsb0JBQW9CO0FBQ3ZDLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsb0JBQW9CLHNCQUE4RCxZQUFZLGdDQUFnQywwQkFBMEIsbUJBQW1CLHVCQUF1Qix3QkFBd0IsY0FBb0MsNENBQTRDO0FBQ25ULFNBQVMsaUJBQWlCLFNBQVMsY0FBYztBQUNqRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFdBQW1CO0FBQzVCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FB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
