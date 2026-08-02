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
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { isWeb } from "../../../../base/common/platform.js";
import { localize, localize2 } from "../../../../nls.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { ILifecycleService, LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { CURRENT_PROFILE_CONTEXT, HAS_PROFILES_CONTEXT, IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService, PROFILES_CATEGORY, PROFILES_TITLE, PROFILE_EXTENSION, isProfileURL } from "../../../services/userDataProfile/common/userDataProfile.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { URI } from "../../../../base/common/uri.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTagsService } from "../../tags/common/workspaceTags.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { EditorExtensions } from "../../../common/editor.js";
import { UserDataProfilesEditor, UserDataProfilesEditorInput, UserDataProfilesEditorInputSerializer } from "./userDataProfilesEditor.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IURLService } from "../../../../platform/url/common/url.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { Extensions as DndExtensions } from "../../../../platform/dnd/browser/dnd.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ITextEditorService } from "../../../services/textfile/common/textEditorService.js";
const OpenProfileMenu = new MenuId("OpenProfile");
const ProfilesMenu = new MenuId("Profiles");
let UserDataProfilesWorkbenchContribution = class extends Disposable {
  constructor(userDataProfileService, userDataProfilesService, userDataProfileManagementService, telemetryService, workspaceContextService, workspaceTagsService, contextKeyService, editorService, instantiationService, lifecycleService, urlService, environmentService) {
    super();
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.userDataProfileManagementService = userDataProfileManagementService;
    this.telemetryService = telemetryService;
    this.workspaceContextService = workspaceContextService;
    this.workspaceTagsService = workspaceTagsService;
    this.editorService = editorService;
    this.instantiationService = instantiationService;
    this.lifecycleService = lifecycleService;
    this.urlService = urlService;
    this.profilesDisposable = this._register(new MutableDisposable());
    this.currentProfileContext = CURRENT_PROFILE_CONTEXT.bindTo(contextKeyService);
    this.currentProfileContext.set(this.userDataProfileService.currentProfile.id);
    this._register(this.userDataProfileService.onDidChangeCurrentProfile((e) => {
      this.currentProfileContext.set(this.userDataProfileService.currentProfile.id);
    }));
    this.hasProfilesContext = HAS_PROFILES_CONTEXT.bindTo(contextKeyService);
    this.hasProfilesContext.set(this.userDataProfilesService.profiles.filter((p) => !p.isInternal).length > 1);
    this._register(this.userDataProfilesService.onDidChangeProfiles((e) => this.hasProfilesContext.set(this.userDataProfilesService.profiles.filter((p) => !p.isInternal).length > 1)));
    this.registerEditor();
    this.registerActions();
    this._register(this.urlService.registerHandler(this));
    if (isWeb) {
      lifecycleService.when(LifecyclePhase.Eventually).then(() => userDataProfilesService.cleanUp());
    }
    this.reportWorkspaceProfileInfo();
    if (environmentService.options?.profileToPreview) {
      lifecycleService.when(LifecyclePhase.Restored).then(() => this.handleURL(URI.revive(environmentService.options.profileToPreview)));
    }
    this.registerDropHandler();
  }
  async handleURL(uri) {
    if (isProfileURL(uri)) {
      const editor = await this.openProfilesEditor();
      if (editor) {
        editor.createNewProfile(uri);
        return true;
      }
    }
    return false;
  }
  async openProfilesEditor() {
    const editor = await this.editorService.openEditor(new UserDataProfilesEditorInput(this.instantiationService));
    return editor;
  }
  registerEditor() {
    Registry.as(EditorExtensions.EditorPane).registerEditorPane(
      EditorPaneDescriptor.create(
        UserDataProfilesEditor,
        UserDataProfilesEditor.ID,
        localize("userdataprofilesEditor", "Profiles Editor")
      ),
      [
        new SyncDescriptor(UserDataProfilesEditorInput)
      ]
    );
    Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(UserDataProfilesEditorInput.ID, UserDataProfilesEditorInputSerializer);
  }
  registerDropHandler() {
    const dndRegistry = Registry.as(DndExtensions.DragAndDropContribution);
    const that = this;
    this._register(dndRegistry.registerDropHandler(new class UserDataProfileDropHandler {
      async handleDrop(resource, accessor) {
        const uriIdentityService = accessor.get(IUriIdentityService);
        const userDataProfileImportExportService = accessor.get(IUserDataProfileImportExportService);
        const editorService = accessor.get(IEditorService);
        const textEditorService = accessor.get(ITextEditorService);
        const notificationService = accessor.get(INotificationService);
        if (uriIdentityService.extUri.extname(resource) === `.${PROFILE_EXTENSION}`) {
          const template = await userDataProfileImportExportService.resolveProfileTemplate(resource);
          if (!template) {
            notificationService.warn(localize("invalid profile", "The dropped profile is invalid."));
            editorService.openEditor(textEditorService.createTextEditor({ resource }));
            return true;
          }
          const editor = await that.openProfilesEditor();
          if (editor) {
            try {
              await editor.createNewProfile(resource);
            } catch (error) {
              return false;
            }
          }
          return true;
        }
        return false;
      }
    }()));
  }
  registerActions() {
    this.registerProfileSubMenu();
    this._register(this.registerManageProfilesAction());
    this._register(this.registerSwitchProfileAction());
    this.registerOpenProfileSubMenu();
    this.registerNewWindowWithProfileAction();
    this.registerProfilesActions();
    this._register(this.userDataProfilesService.onDidChangeProfiles(() => this.registerProfilesActions()));
    this._register(this.registerExportCurrentProfileAction());
    this.registerCreateFromCurrentProfileAction();
    this.registerNewProfileAction();
    this.registerDeleteProfileAction();
    this.registerHelpAction();
  }
  registerProfileSubMenu() {
    const getProfilesTitle = () => {
      return localize("profiles", "Profile ({0})", this.userDataProfileService.currentProfile.name);
    };
    MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
      get title() {
        return getProfilesTitle();
      },
      submenu: ProfilesMenu,
      group: "2_configuration",
      order: 1,
      when: HAS_PROFILES_CONTEXT
    });
    MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
      get title() {
        return getProfilesTitle();
      },
      submenu: ProfilesMenu,
      group: "2_configuration",
      order: 1,
      when: ContextKeyExpr.and(HAS_PROFILES_CONTEXT, IsSessionsWindowContext.negate())
    });
  }
  registerOpenProfileSubMenu() {
    MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
      title: localize("New Profile Window", "New Window with Profile"),
      submenu: OpenProfileMenu,
      group: "1_new",
      order: 4
    });
  }
  registerProfilesActions() {
    this.profilesDisposable.value = new DisposableStore();
    for (const profile of this.userDataProfilesService.profiles) {
      if (!profile.isInternal) {
        this.profilesDisposable.value.add(this.registerProfileEntryAction(profile));
        this.profilesDisposable.value.add(this.registerNewWindowAction(profile));
      }
    }
  }
  registerProfileEntryAction(profile) {
    const that = this;
    return registerAction2(class ProfileEntryAction extends Action2 {
      constructor() {
        super({
          id: `workbench.profiles.actions.profileEntry.${profile.id}`,
          title: profile.name,
          metadata: {
            description: localize2("change profile", "Switch to {0} profile", profile.name)
          },
          toggled: ContextKeyExpr.equals(CURRENT_PROFILE_CONTEXT.key, profile.id),
          menu: [
            {
              id: ProfilesMenu,
              group: "0_profiles"
            }
          ]
        });
      }
      async run(accessor) {
        if (that.userDataProfileService.currentProfile.id !== profile.id) {
          return that.userDataProfileManagementService.switchProfile(profile);
        }
      }
    });
  }
  registerNewWindowWithProfileAction() {
    return registerAction2(class NewWindowWithProfileAction extends Action2 {
      constructor() {
        super({
          id: `workbench.profiles.actions.newWindowWithProfile`,
          title: localize2("newWindowWithProfile", "New Window with Profile..."),
          category: PROFILES_CATEGORY,
          precondition: HAS_PROFILES_CONTEXT,
          f1: true
        });
      }
      async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        const userDataProfilesService = accessor.get(IUserDataProfilesService);
        const hostService = accessor.get(IHostService);
        const pick = await quickInputService.pick(
          userDataProfilesService.profiles.filter((profile) => !profile.isInternal).map((profile) => ({
            label: profile.name,
            profile
          })),
          {
            title: localize("new window with profile", "New Window with Profile"),
            placeHolder: localize("pick profile", "Select Profile"),
            canPickMany: false
          }
        );
        if (pick) {
          return hostService.openWindow({ remoteAuthority: null, forceProfile: pick.profile.name });
        }
      }
    });
  }
  registerNewWindowAction(profile) {
    const disposables = new DisposableStore();
    const id = `workbench.action.openProfile.${profile.name.replace("/s+/", "_")}`;
    const precondition = HAS_PROFILES_CONTEXT;
    disposables.add(registerAction2(class NewWindowAction extends Action2 {
      constructor() {
        super({
          id,
          title: localize2("openShort", "{0}", profile.name),
          metadata: {
            description: localize2("open profile", "Open New Window with {0} Profile", profile.name)
          },
          menu: {
            id: OpenProfileMenu,
            group: "0_profiles",
            when: precondition
          }
        });
      }
      run(accessor) {
        const hostService = accessor.get(IHostService);
        return hostService.openWindow({ remoteAuthority: null, forceProfile: profile.name });
      }
    }));
    disposables.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
      command: {
        id,
        category: PROFILES_CATEGORY,
        title: localize2("open", "Open {0} Profile", profile.name),
        precondition
      }
    }));
    return disposables;
  }
  registerSwitchProfileAction() {
    const that = this;
    return registerAction2(class SwitchProfileAction extends Action2 {
      constructor() {
        super({
          id: `workbench.profiles.actions.switchProfile`,
          title: localize2("switchProfile", "Switch Profile..."),
          category: PROFILES_CATEGORY,
          f1: true
        });
      }
      async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        const items = [];
        for (const profile of that.userDataProfilesService.profiles) {
          if (profile.isInternal) {
            continue;
          }
          items.push({
            id: profile.id,
            label: profile.id === that.userDataProfileService.currentProfile.id ? `$(check) ${profile.name}` : profile.name,
            profile
          });
        }
        const result = await quickInputService.pick(items.sort((a, b) => a.profile.name.localeCompare(b.profile.name)), {
          placeHolder: localize("selectProfile", "Select Profile")
        });
        if (result) {
          await that.userDataProfileManagementService.switchProfile(result.profile);
        }
      }
    });
  }
  registerManageProfilesAction() {
    const disposables = new DisposableStore();
    disposables.add(registerAction2(class ManageProfilesAction extends Action2 {
      constructor() {
        super({
          id: `workbench.profiles.actions.manageProfiles`,
          title: {
            ...localize2("manage profiles", "Profiles"),
            mnemonicTitle: localize({ key: "miOpenProfiles", comment: ["&& denotes a mnemonic"] }, "&&Profiles")
          },
          menu: [
            {
              id: MenuId.GlobalActivity,
              group: "2_configuration",
              order: 1,
              when: HAS_PROFILES_CONTEXT.negate()
            },
            {
              id: MenuId.MenubarPreferencesMenu,
              group: "2_configuration",
              order: 1,
              when: ContextKeyExpr.and(HAS_PROFILES_CONTEXT.negate(), IsSessionsWindowContext.negate())
            },
            {
              id: ProfilesMenu,
              group: "1_manage",
              order: 1
            }
          ]
        });
      }
      run(accessor) {
        const editorService = accessor.get(IEditorService);
        const instantiationService = accessor.get(IInstantiationService);
        return editorService.openEditor(new UserDataProfilesEditorInput(instantiationService));
      }
    }));
    disposables.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
      command: {
        id: "workbench.profiles.actions.manageProfiles",
        category: Categories.Preferences,
        title: localize2("open profiles", "Open Profiles (UI)")
      }
    }));
    return disposables;
  }
  registerExportCurrentProfileAction() {
    const that = this;
    const disposables = new DisposableStore();
    const id = "workbench.profiles.actions.exportProfile";
    disposables.add(registerAction2(class ExportProfileAction extends Action2 {
      constructor() {
        super({
          id,
          title: localize2("export profile", "Export Profile..."),
          category: PROFILES_CATEGORY,
          f1: true
        });
      }
      async run() {
        const editor = await that.openProfilesEditor();
        editor?.selectProfile(that.userDataProfileService.currentProfile);
      }
    }));
    disposables.add(MenuRegistry.appendMenuItem(MenuId.MenubarShare, {
      command: {
        id,
        title: localize2("export profile in share", "Export Profile ({0})...", that.userDataProfileService.currentProfile.name)
      }
    }));
    return disposables;
  }
  registerCreateFromCurrentProfileAction() {
    const that = this;
    this._register(registerAction2(class CreateFromCurrentProfileAction extends Action2 {
      constructor() {
        super({
          id: "workbench.profiles.actions.createFromCurrentProfile",
          title: localize2("save profile as", "Save Current Profile As..."),
          category: PROFILES_CATEGORY,
          f1: true
        });
      }
      async run() {
        const editor = await that.openProfilesEditor();
        editor?.createNewProfile(that.userDataProfileService.currentProfile);
      }
    }));
  }
  registerNewProfileAction() {
    const that = this;
    this._register(registerAction2(class CreateProfileAction extends Action2 {
      constructor() {
        super({
          id: "workbench.profiles.actions.createProfile",
          title: localize2("create profile", "New Profile..."),
          category: PROFILES_CATEGORY,
          f1: true,
          menu: [
            {
              id: OpenProfileMenu,
              group: "1_manage_profiles",
              order: 1
            }
          ]
        });
      }
      async run(accessor) {
        const editor = await that.openProfilesEditor();
        return editor?.createNewProfile();
      }
    }));
  }
  registerDeleteProfileAction() {
    this._register(registerAction2(class DeleteProfileAction extends Action2 {
      constructor() {
        super({
          id: "workbench.profiles.actions.deleteProfile",
          title: localize2("delete profile", "Delete Profile..."),
          category: PROFILES_CATEGORY,
          f1: true,
          precondition: HAS_PROFILES_CONTEXT
        });
      }
      async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        const userDataProfileService = accessor.get(IUserDataProfileService);
        const userDataProfilesService = accessor.get(IUserDataProfilesService);
        const userDataProfileManagementService = accessor.get(IUserDataProfileManagementService);
        const notificationService = accessor.get(INotificationService);
        const profiles = userDataProfilesService.profiles.filter((p) => !p.isDefault && !p.isInternal);
        if (profiles.length) {
          const picks = await quickInputService.pick(
            profiles.map((profile) => ({
              label: profile.name,
              description: profile.id === userDataProfileService.currentProfile.id ? localize("current", "Current") : void 0,
              profile
            })),
            {
              title: localize("delete specific profile", "Delete Profile..."),
              placeHolder: localize("pick profile to delete", "Select Profiles to Delete"),
              canPickMany: true
            }
          );
          if (picks) {
            try {
              await Promise.all(picks.map((pick) => userDataProfileManagementService.removeProfile(pick.profile)));
            } catch (error) {
              notificationService.error(error);
            }
          }
        }
      }
    }));
  }
  registerHelpAction() {
    this._register(registerAction2(class HelpAction extends Action2 {
      constructor() {
        super({
          id: "workbench.profiles.actions.help",
          title: PROFILES_TITLE,
          category: Categories.Help,
          menu: [{
            id: MenuId.CommandPalette
          }]
        });
      }
      run(accessor) {
        return accessor.get(IOpenerService).open(URI.parse("https://aka.ms/vscode-profiles-help"));
      }
    }));
  }
  async reportWorkspaceProfileInfo() {
    await this.lifecycleService.when(LifecyclePhase.Eventually);
    const count = this.userDataProfilesService.profiles.filter((p) => !p.isInternal).length - 1;
    if (count > 0) {
      this.telemetryService.publicLog2("profiles:count", { count });
    }
    const workspaceId = await this.workspaceTagsService.getTelemetryWorkspaceId(this.workspaceContextService.getWorkspace(), this.workspaceContextService.getWorkbenchState());
    this.telemetryService.publicLog2("workspaceProfileInfo", {
      workspaceId,
      defaultProfile: this.userDataProfileService.currentProfile.isDefault
    });
  }
};
UserDataProfilesWorkbenchContribution.ID = "workbench.contrib.userDataProfiles";
UserDataProfilesWorkbenchContribution = __decorateClass([
  __decorateParam(0, IUserDataProfileService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IUserDataProfileManagementService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, IWorkspaceTagsService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, ILifecycleService),
  __decorateParam(10, IURLService),
  __decorateParam(11, IBrowserWorkbenchEnvironmentService)
], UserDataProfilesWorkbenchContribution);
export {
  OpenProfileMenu,
  UserDataProfilesWorkbenchContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3VzZXJEYXRhUHJvZmlsZS9icm93c2VyL3VzZXJEYXRhUHJvZmlsZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24sIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDVVJSRU5UX1BST0ZJTEVfQ09OVEVYVCwgSEFTX1BST0ZJTEVTX0NPTlRFWFQsIElVc2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlLCBJVXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UsIElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLCBQUk9GSUxFU19DQVRFR09SWSwgUFJPRklMRVNfVElUTEUsIFBST0ZJTEVfRVhURU5TSU9OLCBpc1Byb2ZpbGVVUkwgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUYWdzU2VydmljZSB9IGZyb20gJy4uLy4uL3RhZ3MvY29tbW9uL3dvcmtzcGFjZVRhZ3MuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmVEZXNjcmlwdG9yLCBJRWRpdG9yUGFuZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9ucywgSUVkaXRvckZhY3RvcnlSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFQcm9maWxlc0VkaXRvciwgVXNlckRhdGFQcm9maWxlc0VkaXRvcklucHV0LCBVc2VyRGF0YVByb2ZpbGVzRWRpdG9ySW5wdXRTZXJpYWxpemVyIH0gZnJvbSAnLi91c2VyRGF0YVByb2ZpbGVzRWRpdG9yLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc0VkaXRvciB9IGZyb20gJy4uL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVVSTFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmwvY29tbW9uL3VybC5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgRG5kRXh0ZW5zaW9ucywgSURyYWdBbmREcm9wQ29udHJpYnV0aW9uUmVnaXN0cnksIElSZXNvdXJjZURyb3BIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVRleHRFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRFZGl0b3JTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IE9wZW5Qcm9maWxlTWVudSA9IG5ldyBNZW51SWQoJ09wZW5Qcm9maWxlJyk7XG5jb25zdCBQcm9maWxlc01lbnUgPSBuZXcgTWVudUlkKCdQcm9maWxlcycpO1xuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFQcm9maWxlc1dvcmtiZW5jaENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIudXNlckRhdGFQcm9maWxlcyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjdXJyZW50UHJvZmlsZUNvbnRleHQ6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzUHJvZmlsZXNDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRhZ3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVGFnc1NlcnZpY2U6IElXb3Jrc3BhY2VUYWdzU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElVUkxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJsU2VydmljZTogSVVSTFNlcnZpY2UsXG5cdFx0QElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY3VycmVudFByb2ZpbGVDb250ZXh0ID0gQ1VSUkVOVF9QUk9GSUxFX0NPTlRFWFQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuY3VycmVudFByb2ZpbGVDb250ZXh0LnNldCh0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaWQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlKGUgPT4ge1xuXHRcdFx0dGhpcy5jdXJyZW50UHJvZmlsZUNvbnRleHQuc2V0KHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5oYXNQcm9maWxlc0NvbnRleHQgPSBIQVNfUFJPRklMRVNfQ09OVEVYVC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzUHJvZmlsZXNDb250ZXh0LnNldCh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLmZpbHRlcihwID0+ICFwLmlzSW50ZXJuYWwpLmxlbmd0aCA+IDEpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2Uub25EaWRDaGFuZ2VQcm9maWxlcyhlID0+IHRoaXMuaGFzUHJvZmlsZXNDb250ZXh0LnNldCh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLmZpbHRlcihwID0+ICFwLmlzSW50ZXJuYWwpLmxlbmd0aCA+IDEpKSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRWRpdG9yKCk7XG5cdFx0dGhpcy5yZWdpc3RlckFjdGlvbnMoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXJsU2VydmljZS5yZWdpc3RlckhhbmRsZXIodGhpcykpO1xuXG5cdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHRsaWZlY3ljbGVTZXJ2aWNlLndoZW4oTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSkudGhlbigoKSA9PiB1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5jbGVhblVwKCkpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVwb3J0V29ya3NwYWNlUHJvZmlsZUluZm8oKTtcblxuXHRcdGlmIChlbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8ucHJvZmlsZVRvUHJldmlldykge1xuXHRcdFx0bGlmZWN5Y2xlU2VydmljZS53aGVuKExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKS50aGVuKCgpID0+IHRoaXMuaGFuZGxlVVJMKFVSSS5yZXZpdmUoZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnMhLnByb2ZpbGVUb1ByZXZpZXchKSkpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVnaXN0ZXJEcm9wSGFuZGxlcigpO1xuXHR9XG5cblx0YXN5bmMgaGFuZGxlVVJMKHVyaTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKGlzUHJvZmlsZVVSTCh1cmkpKSB7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSBhd2FpdCB0aGlzLm9wZW5Qcm9maWxlc0VkaXRvcigpO1xuXHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRlZGl0b3IuY3JlYXRlTmV3UHJvZmlsZSh1cmkpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuUHJvZmlsZXNFZGl0b3IoKTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlc0VkaXRvciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKG5ldyBVc2VyRGF0YVByb2ZpbGVzRWRpdG9ySW5wdXQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdHJldHVybiBlZGl0b3IgYXMgSVVzZXJEYXRhUHJvZmlsZXNFZGl0b3I7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRWRpdG9yKCk6IHZvaWQge1xuXHRcdFJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRcdFx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdFx0XHRVc2VyRGF0YVByb2ZpbGVzRWRpdG9yLFxuXHRcdFx0XHRVc2VyRGF0YVByb2ZpbGVzRWRpdG9yLklELFxuXHRcdFx0XHRsb2NhbGl6ZSgndXNlcmRhdGFwcm9maWxlc0VkaXRvcicsIFwiUHJvZmlsZXMgRWRpdG9yXCIpXG5cdFx0XHQpLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoVXNlckRhdGFQcm9maWxlc0VkaXRvcklucHV0KVxuXHRcdFx0XVxuXHRcdCk7XG5cdFx0UmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5yZWdpc3RlckVkaXRvclNlcmlhbGl6ZXIoVXNlckRhdGFQcm9maWxlc0VkaXRvcklucHV0LklELCBVc2VyRGF0YVByb2ZpbGVzRWRpdG9ySW5wdXRTZXJpYWxpemVyKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJEcm9wSGFuZGxlcigpOiB2b2lkIHtcblx0XHRjb25zdCBkbmRSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElEcmFnQW5kRHJvcENvbnRyaWJ1dGlvblJlZ2lzdHJ5PihEbmRFeHRlbnNpb25zLkRyYWdBbmREcm9wQ29udHJpYnV0aW9uKTtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihkbmRSZWdpc3RyeS5yZWdpc3RlckRyb3BIYW5kbGVyKG5ldyBjbGFzcyBVc2VyRGF0YVByb2ZpbGVEcm9wSGFuZGxlciBpbXBsZW1lbnRzIElSZXNvdXJjZURyb3BIYW5kbGVyIHtcblx0XHRcdGFzeW5jIGhhbmRsZURyb3AocmVzb3VyY2U6IFVSSSwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRcdFx0Y29uc3QgdXJpSWRlbnRpdHlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVcmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVc2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHRleHRFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXh0RWRpdG9yU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRpZiAodXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5leHRuYW1lKHJlc291cmNlKSA9PT0gYC4ke1BST0ZJTEVfRVhURU5TSU9OfWApIHtcblx0XHRcdFx0XHRjb25zdCB0ZW1wbGF0ZSA9IGF3YWl0IHVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UucmVzb2x2ZVByb2ZpbGVUZW1wbGF0ZShyZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKCF0ZW1wbGF0ZSkge1xuXHRcdFx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS53YXJuKGxvY2FsaXplKCdpbnZhbGlkIHByb2ZpbGUnLCBcIlRoZSBkcm9wcGVkIHByb2ZpbGUgaXMgaW52YWxpZC5cIikpO1xuXHRcdFx0XHRcdFx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHRleHRFZGl0b3JTZXJ2aWNlLmNyZWF0ZVRleHRFZGl0b3IoeyByZXNvdXJjZSB9KSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgdGhhdC5vcGVuUHJvZmlsZXNFZGl0b3IoKTtcblx0XHRcdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBlZGl0b3IuY3JlYXRlTmV3UHJvZmlsZShyZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQWN0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLnJlZ2lzdGVyUHJvZmlsZVN1Yk1lbnUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlZ2lzdGVyTWFuYWdlUHJvZmlsZXNBY3Rpb24oKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZWdpc3RlclN3aXRjaFByb2ZpbGVBY3Rpb24oKSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyT3BlblByb2ZpbGVTdWJNZW51KCk7XG5cdFx0dGhpcy5yZWdpc3Rlck5ld1dpbmRvd1dpdGhQcm9maWxlQWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlclByb2ZpbGVzQWN0aW9ucygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2Uub25EaWRDaGFuZ2VQcm9maWxlcygoKSA9PiB0aGlzLnJlZ2lzdGVyUHJvZmlsZXNBY3Rpb25zKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVnaXN0ZXJFeHBvcnRDdXJyZW50UHJvZmlsZUFjdGlvbigpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJDcmVhdGVGcm9tQ3VycmVudFByb2ZpbGVBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyTmV3UHJvZmlsZUFjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJEZWxldGVQcm9maWxlQWN0aW9uKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVySGVscEFjdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclByb2ZpbGVTdWJNZW51KCk6IHZvaWQge1xuXHRcdGNvbnN0IGdldFByb2ZpbGVzVGl0bGUgPSAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb2ZpbGVzJywgXCJQcm9maWxlICh7MH0pXCIsIHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5uYW1lKTtcblx0XHR9O1xuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuR2xvYmFsQWN0aXZpdHksIHtcblx0XHRcdGdldCB0aXRsZSgpIHtcblx0XHRcdFx0cmV0dXJuIGdldFByb2ZpbGVzVGl0bGUoKTtcblx0XHRcdH0sXG5cdFx0XHRzdWJtZW51OiBQcm9maWxlc01lbnUsXG5cdFx0XHRncm91cDogJzJfY29uZmlndXJhdGlvbicsXG5cdFx0XHRvcmRlcjogMSxcblx0XHRcdHdoZW46IEhBU19QUk9GSUxFU19DT05URVhUXG5cdFx0fSk7XG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyUHJlZmVyZW5jZXNNZW51LCB7XG5cdFx0XHRnZXQgdGl0bGUoKSB7XG5cdFx0XHRcdHJldHVybiBnZXRQcm9maWxlc1RpdGxlKCk7XG5cdFx0XHR9LFxuXHRcdFx0c3VibWVudTogUHJvZmlsZXNNZW51LFxuXHRcdFx0Z3JvdXA6ICcyX2NvbmZpZ3VyYXRpb24nLFxuXHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSEFTX1BST0ZJTEVTX0NPTlRFWFQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck9wZW5Qcm9maWxlU3ViTWVudSgpOiB2b2lkIHtcblx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdOZXcgUHJvZmlsZSBXaW5kb3cnLCBcIk5ldyBXaW5kb3cgd2l0aCBQcm9maWxlXCIpLFxuXHRcdFx0c3VibWVudTogT3BlblByb2ZpbGVNZW51LFxuXHRcdFx0Z3JvdXA6ICcxX25ldycsXG5cdFx0XHRvcmRlcjogNCxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvZmlsZXNEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVnaXN0ZXJQcm9maWxlc0FjdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5wcm9maWxlc0Rpc3Bvc2FibGUudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMpIHtcblx0XHRcdGlmICghcHJvZmlsZS5pc0ludGVybmFsKSB7XG5cdFx0XHRcdHRoaXMucHJvZmlsZXNEaXNwb3NhYmxlLnZhbHVlLmFkZCh0aGlzLnJlZ2lzdGVyUHJvZmlsZUVudHJ5QWN0aW9uKHByb2ZpbGUpKTtcblx0XHRcdFx0dGhpcy5wcm9maWxlc0Rpc3Bvc2FibGUudmFsdWUuYWRkKHRoaXMucmVnaXN0ZXJOZXdXaW5kb3dBY3Rpb24ocHJvZmlsZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJQcm9maWxlRW50cnlBY3Rpb24ocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRyZXR1cm4gcmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFByb2ZpbGVFbnRyeUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5wcm9maWxlcy5hY3Rpb25zLnByb2ZpbGVFbnRyeS4ke3Byb2ZpbGUuaWR9YCxcblx0XHRcdFx0XHR0aXRsZTogcHJvZmlsZS5uYW1lLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUyKCdjaGFuZ2UgcHJvZmlsZScsIFwiU3dpdGNoIHRvIHswfSBwcm9maWxlXCIsIHByb2ZpbGUubmFtZSksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoQ1VSUkVOVF9QUk9GSUxFX0NPTlRFWFQua2V5LCBwcm9maWxlLmlkKSxcblx0XHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiBQcm9maWxlc01lbnUsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnMF9wcm9maWxlcycsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHRpZiAodGhhdC51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlkICE9PSBwcm9maWxlLmlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoYXQudXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2Uuc3dpdGNoUHJvZmlsZShwcm9maWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck5ld1dpbmRvd1dpdGhQcm9maWxlQWN0aW9uKCk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gcmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5ld1dpbmRvd1dpdGhQcm9maWxlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLnByb2ZpbGVzLmFjdGlvbnMubmV3V2luZG93V2l0aFByb2ZpbGVgLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25ld1dpbmRvd1dpdGhQcm9maWxlJywgXCJOZXcgV2luZG93IHdpdGggUHJvZmlsZS4uLlwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogUFJPRklMRVNfQ0FURUdPUlksXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBIQVNfUFJPRklMRVNfQ09OVEVYVCxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgaG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhvc3RTZXJ2aWNlKTtcblxuXHRcdFx0XHRjb25zdCBwaWNrID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhcblx0XHRcdFx0XHR1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlc1xuXHRcdFx0XHRcdFx0LmZpbHRlcihwcm9maWxlID0+ICFwcm9maWxlLmlzSW50ZXJuYWwpXG5cdFx0XHRcdFx0XHQubWFwKHByb2ZpbGUgPT4gKHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IHByb2ZpbGUubmFtZSxcblx0XHRcdFx0XHRcdFx0cHJvZmlsZVxuXHRcdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbmV3IHdpbmRvdyB3aXRoIHByb2ZpbGUnLCBcIk5ldyBXaW5kb3cgd2l0aCBQcm9maWxlXCIpLFxuXHRcdFx0XHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdwaWNrIHByb2ZpbGUnLCBcIlNlbGVjdCBQcm9maWxlXCIpLFxuXHRcdFx0XHRcdFx0Y2FuUGlja01hbnk6IGZhbHNlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChwaWNrKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coeyByZW1vdGVBdXRob3JpdHk6IG51bGwsIGZvcmNlUHJvZmlsZTogcGljay5wcm9maWxlLm5hbWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJOZXdXaW5kb3dBY3Rpb24ocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGlkID0gYHdvcmtiZW5jaC5hY3Rpb24ub3BlblByb2ZpbGUuJHtwcm9maWxlLm5hbWUucmVwbGFjZSgnL1xccysvJywgJ18nKX1gO1xuXHRcdGNvbnN0IHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQgPSBIQVNfUFJPRklMRVNfQ09OVEVYVDtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3V2luZG93QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlblNob3J0JywgXCJ7MH1cIiwgcHJvZmlsZS5uYW1lKSxcblx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMignb3BlbiBwcm9maWxlJywgXCJPcGVuIE5ldyBXaW5kb3cgd2l0aCB7MH0gUHJvZmlsZVwiLCBwcm9maWxlLm5hbWUpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE9wZW5Qcm9maWxlTWVudSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnMF9wcm9maWxlcycsXG5cdFx0XHRcdFx0XHR3aGVuOiBwcmVjb25kaXRpb25cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3QgaG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhvc3RTZXJ2aWNlKTtcblx0XHRcdFx0cmV0dXJuIGhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coeyByZW1vdGVBdXRob3JpdHk6IG51bGwsIGZvcmNlUHJvZmlsZTogcHJvZmlsZS5uYW1lIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRjYXRlZ29yeTogUFJPRklMRVNfQ0FURUdPUlksXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW4nLCBcIk9wZW4gezB9IFByb2ZpbGVcIiwgcHJvZmlsZS5uYW1lKSxcblx0XHRcdFx0cHJlY29uZGl0aW9uXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJTd2l0Y2hQcm9maWxlQWN0aW9uKCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRyZXR1cm4gcmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFN3aXRjaFByb2ZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2gucHJvZmlsZXMuYWN0aW9ucy5zd2l0Y2hQcm9maWxlYCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzd2l0Y2hQcm9maWxlJywgJ1N3aXRjaCBQcm9maWxlLi4uJyksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBST0ZJTEVTX0NBVEVHT1JZLFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXG5cdFx0XHRcdGNvbnN0IGl0ZW1zOiBBcnJheTxJUXVpY2tQaWNrSXRlbSAmIHsgcHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSB9PiA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgdGhhdC51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcykge1xuXHRcdFx0XHRcdGlmIChwcm9maWxlLmlzSW50ZXJuYWwpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdGlkOiBwcm9maWxlLmlkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IHByb2ZpbGUuaWQgPT09IHRoYXQudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pZCA/IGAkKGNoZWNrKSAke3Byb2ZpbGUubmFtZX1gIDogcHJvZmlsZS5uYW1lLFxuXHRcdFx0XHRcdFx0cHJvZmlsZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soaXRlbXMuc29ydCgoYSwgYikgPT4gYS5wcm9maWxlLm5hbWUubG9jYWxlQ29tcGFyZShiLnByb2ZpbGUubmFtZSkpLCB7XG5cdFx0XHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdzZWxlY3RQcm9maWxlJywgXCJTZWxlY3QgUHJvZmlsZVwiKVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoYXQudXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2Uuc3dpdGNoUHJvZmlsZShyZXN1bHQucHJvZmlsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJNYW5hZ2VQcm9maWxlc0FjdGlvbigpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBNYW5hZ2VQcm9maWxlc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5wcm9maWxlcy5hY3Rpb25zLm1hbmFnZVByb2ZpbGVzYCxcblx0XHRcdFx0XHR0aXRsZToge1xuXHRcdFx0XHRcdFx0Li4ubG9jYWxpemUyKCdtYW5hZ2UgcHJvZmlsZXMnLCBcIlByb2ZpbGVzXCIpLFxuXHRcdFx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaU9wZW5Qcm9maWxlcycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlByb2ZpbGVzXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bWVudTogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLkdsb2JhbEFjdGl2aXR5LFxuXHRcdFx0XHRcdFx0XHRncm91cDogJzJfY29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdFx0XHR3aGVuOiBIQVNfUFJPRklMRVNfQ09OVEVYVC5uZWdhdGUoKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyUHJlZmVyZW5jZXNNZW51LFxuXHRcdFx0XHRcdFx0XHRncm91cDogJzJfY29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSEFTX1BST0ZJTEVTX0NPTlRFWFQubmVnYXRlKCksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aWQ6IFByb2ZpbGVzTWVudSxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICcxX21hbmFnZScsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRyZXR1cm4gZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKG5ldyBVc2VyRGF0YVByb2ZpbGVzRWRpdG9ySW5wdXQoaW5zdGFudGlhdGlvblNlcnZpY2UpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gucHJvZmlsZXMuYWN0aW9ucy5tYW5hZ2VQcm9maWxlcycsXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlByZWZlcmVuY2VzLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuIHByb2ZpbGVzJywgXCJPcGVuIFByb2ZpbGVzIChVSSlcIiksXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJFeHBvcnRDdXJyZW50UHJvZmlsZUFjdGlvbigpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaWQgPSAnd29ya2JlbmNoLnByb2ZpbGVzLmFjdGlvbnMuZXhwb3J0UHJvZmlsZSc7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBFeHBvcnRQcm9maWxlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2V4cG9ydCBwcm9maWxlJywgXCJFeHBvcnQgUHJvZmlsZS4uLlwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogUFJPRklMRVNfQ0FURUdPUlksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IHRoYXQub3BlblByb2ZpbGVzRWRpdG9yKCk7XG5cdFx0XHRcdGVkaXRvcj8uc2VsZWN0UHJvZmlsZSh0aGF0LnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyU2hhcmUsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2V4cG9ydCBwcm9maWxlIGluIHNoYXJlJywgXCJFeHBvcnQgUHJvZmlsZSAoezB9KS4uLlwiLCB0aGF0LnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubmFtZSksXG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXG5cdHByaXZhdGUgcmVnaXN0ZXJDcmVhdGVGcm9tQ3VycmVudFByb2ZpbGVBY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENyZWF0ZUZyb21DdXJyZW50UHJvZmlsZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5wcm9maWxlcy5hY3Rpb25zLmNyZWF0ZUZyb21DdXJyZW50UHJvZmlsZScsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2F2ZSBwcm9maWxlIGFzJywgXCJTYXZlIEN1cnJlbnQgUHJvZmlsZSBBcy4uLlwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogUFJPRklMRVNfQ0FURUdPUlksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IHRoYXQub3BlblByb2ZpbGVzRWRpdG9yKCk7XG5cdFx0XHRcdGVkaXRvcj8uY3JlYXRlTmV3UHJvZmlsZSh0aGF0LnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJOZXdQcm9maWxlQWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDcmVhdGVQcm9maWxlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLnByb2ZpbGVzLmFjdGlvbnMuY3JlYXRlUHJvZmlsZScsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignY3JlYXRlIHByb2ZpbGUnLCBcIk5ldyBQcm9maWxlLi4uXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQUk9GSUxFU19DQVRFR09SWSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiBPcGVuUHJvZmlsZU1lbnUsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnMV9tYW5hZ2VfcHJvZmlsZXMnLFxuXHRcdFx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSBhd2FpdCB0aGF0Lm9wZW5Qcm9maWxlc0VkaXRvcigpO1xuXHRcdFx0XHRyZXR1cm4gZWRpdG9yPy5jcmVhdGVOZXdQcm9maWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckRlbGV0ZVByb2ZpbGVBY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIERlbGV0ZVByb2ZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gucHJvZmlsZXMuYWN0aW9ucy5kZWxldGVQcm9maWxlJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkZWxldGUgcHJvZmlsZScsIFwiRGVsZXRlIFByb2ZpbGUuLi5cIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBST0ZJTEVTX0NBVEVHT1JZLFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogSEFTX1BST0ZJTEVTX0NPTlRFWFQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRcdGNvbnN0IHByb2ZpbGVzID0gdXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmlsdGVyKHAgPT4gIXAuaXNEZWZhdWx0ICYmICFwLmlzSW50ZXJuYWwpO1xuXHRcdFx0XHRpZiAocHJvZmlsZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGlja3MgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKFxuXHRcdFx0XHRcdFx0cHJvZmlsZXMubWFwKHByb2ZpbGUgPT4gKHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IHByb2ZpbGUubmFtZSxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHByb2ZpbGUuaWQgPT09IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaWQgPyBsb2NhbGl6ZSgnY3VycmVudCcsIFwiQ3VycmVudFwiKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0cHJvZmlsZVxuXHRcdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2RlbGV0ZSBzcGVjaWZpYyBwcm9maWxlJywgXCJEZWxldGUgUHJvZmlsZS4uLlwiKSxcblx0XHRcdFx0XHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdwaWNrIHByb2ZpbGUgdG8gZGVsZXRlJywgXCJTZWxlY3QgUHJvZmlsZXMgdG8gRGVsZXRlXCIpLFxuXHRcdFx0XHRcdFx0XHRjYW5QaWNrTWFueTogdHJ1ZVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0aWYgKHBpY2tzKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChwaWNrcy5tYXAocGljayA9PiB1c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZS5yZW1vdmVQcm9maWxlKHBpY2sucHJvZmlsZSkpKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJIZWxwQWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBIZWxwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLnByb2ZpbGVzLmFjdGlvbnMuaGVscCcsXG5cdFx0XHRcdFx0dGl0bGU6IFBST0ZJTEVTX1RJVExFLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkhlbHAsXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdW5rbm93biB7XG5cdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpLm9wZW4oVVJJLnBhcnNlKCdodHRwczovL2FrYS5tcy92c2NvZGUtcHJvZmlsZXMtaGVscCcpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlcG9ydFdvcmtzcGFjZVByb2ZpbGVJbmZvKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMubGlmZWN5Y2xlU2VydmljZS53aGVuKExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xuXG5cdFx0dHlwZSBVc2VyUHJvZmlsZXNDb3VudENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRjb21tZW50OiAnUmVwb3J0IHRoZSBudW1iZXIgb2YgdXNlciBwcm9maWxlcyBleGNsdWRpbmcgdGhlIGRlZmF1bHQgcHJvZmlsZSc7XG5cdFx0XHRjb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgdXNlciBwcm9maWxlcyBleGNsdWRpbmcgdGhlIGRlZmF1bHQgcHJvZmlsZScgfTtcblx0XHR9O1xuXHRcdHR5cGUgVXNlclByb2ZpbGVzQ291bnRFdmVudCA9IHtcblx0XHRcdGNvdW50OiBudW1iZXI7XG5cdFx0fTtcblx0XHRjb25zdCBjb3VudCA9IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmlsdGVyKHAgPT4gIXAuaXNJbnRlcm5hbCkubGVuZ3RoIC0gMTtcblx0XHRpZiAoY291bnQgPiAwKSB7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxVc2VyUHJvZmlsZXNDb3VudEV2ZW50LCBVc2VyUHJvZmlsZXNDb3VudENsYXNzaWZpY2F0aW9uPigncHJvZmlsZXM6Y291bnQnLCB7IGNvdW50IH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZUlkID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VUYWdzU2VydmljZS5nZXRUZWxlbWV0cnlXb3Jrc3BhY2VJZCh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLCB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkpO1xuXHRcdHR5cGUgV29ya3NwYWNlUHJvZmlsZUluZm9DbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0Y29tbWVudDogJ1JlcG9ydCBwcm9maWxlIGluZm9ybWF0aW9uIG9mIHRoZSBjdXJyZW50IHdvcmtzcGFjZSc7XG5cdFx0XHR3b3Jrc3BhY2VJZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0EgVVVJRCBnaXZlbiB0byBhIHdvcmtzcGFjZSB0byBpZGVudGlmeSBpdC4nIH07XG5cdFx0XHRkZWZhdWx0UHJvZmlsZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIHByb2ZpbGUgb2YgdGhlIHdvcmtzcGFjZSBpcyBkZWZhdWx0IG9yIG5vdC4nIH07XG5cdFx0fTtcblx0XHR0eXBlIFdvcmtzcGFjZVByb2ZpbGVJbmZvRXZlbnQgPSB7XG5cdFx0XHR3b3Jrc3BhY2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0ZGVmYXVsdFByb2ZpbGU6IGJvb2xlYW47XG5cdFx0fTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3Jrc3BhY2VQcm9maWxlSW5mb0V2ZW50LCBXb3Jrc3BhY2VQcm9maWxlSW5mb0NsYXNzaWZpY2F0aW9uPignd29ya3NwYWNlUHJvZmlsZUluZm8nLCB7XG5cdFx0XHR3b3Jrc3BhY2VJZCxcblx0XHRcdGRlZmF1bHRQcm9maWxlOiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLGlCQUE4Qix5QkFBeUI7QUFDNUUsU0FBUyxhQUFhO0FBRXRCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxTQUFTLFFBQVEsY0FBYyx1QkFBdUI7QUFDL0QsU0FBUyxnQkFBbUQsMEJBQTBCO0FBQ3RGLFNBQTJCLGdDQUFnQztBQUUzRCxTQUFTLG1CQUFtQixzQkFBc0I7QUFDbEQsU0FBUyx5QkFBeUIsc0JBQXNCLHFDQUFxQyxtQ0FBbUMseUJBQXlCLG1CQUFtQixnQkFBZ0IsbUJBQW1CLG9CQUFvQjtBQUNuTyxTQUFTLDBCQUEwQztBQUNuRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBaUQ7QUFDMUQsU0FBUyx3QkFBZ0Q7QUFDekQsU0FBUyx3QkFBd0IsNkJBQTZCLDZDQUE2QztBQUMzRyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDJDQUEyQztBQUNwRCxT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
