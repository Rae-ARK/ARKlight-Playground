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
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { isBoolean, isObject, isString } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { EditorContributionInstantiation, registerEditorContribution } from "../../../../editor/browser/editorExtensions.js";
import { Context as SuggestContext } from "../../../../editor/contrib/suggest/browser/suggest.js";
import * as nls from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContext, IsMacNativeContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight, KeybindingsRegistry } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from "../../../browser/actions/workspaceCommands.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { resolveCommandsContext } from "../../../browser/parts/editor/editorCommandsContext.js";
import { RemoteNameContext, ResourceContextKey, WorkbenchStateContext } from "../../../common/contextkeys.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { EditorExtensions } from "../../../common/editor.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { KeybindingsEditorInput } from "../../../services/preferences/browser/keybindingsEditorInput.js";
import { DEFINE_KEYBINDING_EDITOR_CONTRIB_ID, IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { PreferencesEditorInput, SettingsEditor2Input } from "../../../services/preferences/common/preferencesEditorInput.js";
import { SettingsEditorModel } from "../../../services/preferences/common/preferencesModels.js";
import { CURRENT_PROFILE_CONTEXT, IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { ExplorerFolderContext, ExplorerRootContext } from "../../files/common/files.js";
import { CONTEXT_AI_SETTING_RESULTS_AVAILABLE, CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS, CONTEXT_KEYBINDINGS_SEARCH_HAS_VALUE, CONTEXT_KEYBINDING_FOCUS, CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_FIRST_ROW_FOCUS, CONTEXT_SETTINGS_JSON_EDITOR, CONTEXT_SETTINGS_ROW_FOCUS, CONTEXT_SETTINGS_SEARCH_FOCUS, CONTEXT_TOC_ROW_FOCUS, CONTEXT_WHEN_FOCUS, KEYBINDINGS_EDITOR_COMMAND_ACCEPT_WHEN, KEYBINDINGS_EDITOR_COMMAND_ADD, KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_HISTORY, KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, KEYBINDINGS_EDITOR_COMMAND_COPY, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE, KEYBINDINGS_EDITOR_COMMAND_DEFINE, KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN, KEYBINDINGS_EDITOR_COMMAND_FOCUS_KEYBINDINGS, KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS, KEYBINDINGS_EDITOR_COMMAND_REJECT_WHEN, KEYBINDINGS_EDITOR_COMMAND_REMOVE, KEYBINDINGS_EDITOR_COMMAND_RESET, KEYBINDINGS_EDITOR_COMMAND_SEARCH, KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR, KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE, KEYBINDINGS_EDITOR_SHOW_DEFAULT_KEYBINDINGS, KEYBINDINGS_EDITOR_SHOW_EXTENSION_KEYBINDINGS, KEYBINDINGS_EDITOR_SHOW_USER_KEYBINDINGS, REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG, SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU, SETTINGS_EDITOR_COMMAND_TOGGLE_AI_SEARCH } from "../common/preferences.js";
import { PreferencesContribution } from "../common/preferencesContribution.js";
import { KeybindingsEditor } from "./keybindingsEditor.js";
import { ConfigureLanguageBasedSettingsAction } from "./preferencesActions.js";
import { PreferencesEditor } from "./preferencesEditor.js";
import { preferencesOpenSettingsIcon } from "./preferencesIcons.js";
import { UserSettingsRenderer, WorkspaceSettingsRenderer } from "./preferencesRenderers.js";
import { SettingsEditor2, SettingsFocusContext } from "./settingsEditor2.js";
const SETTINGS_EDITOR_COMMAND_SEARCH = "settings.action.search";
const SETTINGS_EDITOR_COMMAND_FOCUS_FILE = "settings.action.focusSettingsFile";
const SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_FROM_SEARCH = "settings.action.focusSettingsFromSearch";
const SETTINGS_EDITOR_COMMAND_SHOW_PREVIOUS_SEARCH = "settings.action.showPreviousSearch";
const SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_FROM_SEARCH_ON_ENTER = "settings.action.focusSettingsFromSearchOnEnter";
const SETTINGS_EDITOR_COMMAND_FOCUS_SEARCH_FROM_SETTINGS = "settings.action.focusSearchFromSettings";
const SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_LIST = "settings.action.focusSettingsList";
const SETTINGS_EDITOR_COMMAND_FOCUS_TOC = "settings.action.focusTOC";
const SETTINGS_EDITOR_COMMAND_FOCUS_CONTROL = "settings.action.focusSettingControl";
const SETTINGS_EDITOR_COMMAND_FOCUS_UP = "settings.action.focusLevelUp";
const SETTINGS_EDITOR_COMMAND_SWITCH_TO_JSON = "settings.switchToJSON";
const SETTINGS_EDITOR_COMMAND_FILTER_ONLINE = "settings.filterByOnline";
const SETTINGS_EDITOR_COMMAND_FILTER_UNTRUSTED = "settings.filterUntrusted";
const SETTINGS_COMMAND_OPEN_SETTINGS = "workbench.action.openSettings";
const SETTINGS_COMMAND_FILTER_TELEMETRY = "settings.filterByTelemetry";
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    SettingsEditor2,
    SettingsEditor2.ID,
    nls.localize("settingsEditor2", "Settings Editor 2")
  ),
  [
    new SyncDescriptor(SettingsEditor2Input)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    PreferencesEditor,
    PreferencesEditor.ID,
    nls.localize("preferencesEditor", "Preferences Editor")
  ),
  [
    new SyncDescriptor(PreferencesEditorInput)
  ]
);
class PreferencesEditorInputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(editorInput) {
    return "";
  }
  deserialize(instantiationService) {
    return instantiationService.createInstance(PreferencesEditorInput);
  }
}
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    KeybindingsEditor,
    KeybindingsEditor.ID,
    nls.localize("keybindingsEditor", "Keybindings Editor")
  ),
  [
    new SyncDescriptor(KeybindingsEditorInput)
  ]
);
class KeybindingsEditorInputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(editorInput) {
    return "";
  }
  deserialize(instantiationService) {
    return instantiationService.createInstance(KeybindingsEditorInput);
  }
}
class SettingsEditor2InputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(input) {
    return "";
  }
  deserialize(instantiationService) {
    return instantiationService.createInstance(SettingsEditor2Input);
  }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(PreferencesEditorInput.ID, PreferencesEditorInputSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(KeybindingsEditorInput.ID, KeybindingsEditorInputSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(SettingsEditor2Input.ID, SettingsEditor2InputSerializer);
const OPEN_USER_SETTINGS_UI_TITLE = nls.localize2("openSettings2", "Open Settings (UI)");
const OPEN_USER_SETTINGS_JSON_TITLE = nls.localize2("openUserSettingsJson", "Open User Settings (JSON)");
const OPEN_APPLICATION_SETTINGS_JSON_TITLE = nls.localize2("openApplicationSettingsJson", "Open Application Settings (JSON)");
const category = Categories.Preferences;
function sanitizeBoolean(arg) {
  return isBoolean(arg) ? arg : void 0;
}
function sanitizeString(arg) {
  return isString(arg) ? arg : void 0;
}
function sanitizeOpenSettingsArgs(args) {
  if (!isObject(args)) {
    args = {};
  }
  let sanitizedObject = {
    focusSearch: sanitizeBoolean(args?.focusSearch),
    openToSide: sanitizeBoolean(args?.openToSide),
    query: sanitizeString(args?.query)
  };
  if (isString(args?.revealSetting?.key)) {
    sanitizedObject = {
      ...sanitizedObject,
      revealSetting: {
        key: args.revealSetting.key,
        edit: sanitizeBoolean(args.revealSetting?.edit)
      }
    };
  }
  return sanitizedObject;
}
let PreferencesActionsContribution = class extends Disposable {
  constructor(environmentService, userDataProfileService, preferencesService, workspaceContextService, labelService, extensionService, userDataProfilesService) {
    super();
    this.environmentService = environmentService;
    this.userDataProfileService = userDataProfileService;
    this.preferencesService = preferencesService;
    this.workspaceContextService = workspaceContextService;
    this.labelService = labelService;
    this.extensionService = extensionService;
    this.userDataProfilesService = userDataProfilesService;
    this.registerSettingsActions();
    this.registerKeybindingsActions();
    this.updatePreferencesEditorMenuItem();
    this._register(workspaceContextService.onDidChangeWorkbenchState(() => this.updatePreferencesEditorMenuItem()));
    this._register(workspaceContextService.onDidChangeWorkspaceFolders(() => this.updatePreferencesEditorMenuItemForWorkspaceFolders()));
  }
  registerSettingsActions() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_COMMAND_OPEN_SETTINGS,
          title: {
            ...nls.localize2("settings", "Settings"),
            mnemonicTitle: nls.localize({ key: "miOpenSettings", comment: ["&& denotes a mnemonic"] }, "&&Settings")
          },
          keybinding: {
            weight: KeybindingWeight.WorkbenchContrib,
            when: null,
            primary: KeyMod.CtrlCmd | KeyCode.Comma
          },
          menu: [{
            id: MenuId.GlobalActivity,
            group: "2_configuration",
            order: 2
          }, {
            id: MenuId.MenubarPreferencesMenu,
            group: "2_configuration",
            order: 2
          }]
        });
      }
      run(accessor, args) {
        const opts = typeof args === "string" ? { query: args } : sanitizeOpenSettingsArgs(args);
        return accessor.get(IPreferencesService).openSettings({ ...opts });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openSettings2",
          title: nls.localize2("openSettings2", "Open Settings (UI)"),
          category,
          f1: true
        });
      }
      run(accessor, args) {
        args = sanitizeOpenSettingsArgs(args);
        return accessor.get(IPreferencesService).openSettings({ jsonEditor: false, ...args });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openSettingsJson",
          title: OPEN_USER_SETTINGS_JSON_TITLE,
          metadata: {
            description: nls.localize2("workbench.action.openSettingsJson.description", "Opens the JSON file containing the current user profile settings")
          },
          category,
          f1: true
        });
      }
      run(accessor, args) {
        args = sanitizeOpenSettingsArgs(args);
        return accessor.get(IPreferencesService).openSettings({ jsonEditor: true, ...args });
      }
    }));
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openApplicationSettingsJson",
          title: OPEN_APPLICATION_SETTINGS_JSON_TITLE,
          category,
          menu: {
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.notEquals(CURRENT_PROFILE_CONTEXT.key, that.userDataProfilesService.defaultProfile.id)
          }
        });
      }
      run(accessor, args) {
        args = sanitizeOpenSettingsArgs(args);
        return accessor.get(IPreferencesService).openApplicationSettings({ jsonEditor: true, ...args });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openGlobalSettings",
          title: nls.localize2("openGlobalSettings", "Open User Settings"),
          category,
          f1: true
        });
      }
      run(accessor, args) {
        args = sanitizeOpenSettingsArgs(args);
        return accessor.get(IPreferencesService).openUserSettings(args);
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openRawDefaultSettings",
          title: nls.localize2("openRawDefaultSettings", "Open Default Settings (JSON)"),
          category,
          f1: true
        });
      }
      run(accessor) {
        return accessor.get(IPreferencesService).openRawDefaultSettings();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: ConfigureLanguageBasedSettingsAction.ID,
          title: ConfigureLanguageBasedSettingsAction.LABEL,
          category,
          f1: true
        });
      }
      run(accessor) {
        return accessor.get(IInstantiationService).createInstance(ConfigureLanguageBasedSettingsAction, ConfigureLanguageBasedSettingsAction.ID, ConfigureLanguageBasedSettingsAction.LABEL.value).run();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openWorkspaceSettings",
          title: nls.localize2("openWorkspaceSettings", "Open Workspace Settings"),
          category,
          menu: {
            id: MenuId.CommandPalette,
            when: WorkbenchStateContext.notEqualsTo("empty")
          }
        });
      }
      run(accessor, args) {
        args = typeof args === "string" ? { query: args } : sanitizeOpenSettingsArgs(args);
        return accessor.get(IPreferencesService).openWorkspaceSettings(args);
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openAccessibilitySettings",
          title: nls.localize2("openAccessibilitySettings", "Open Accessibility Settings"),
          category,
          menu: {
            id: MenuId.CommandPalette,
            when: WorkbenchStateContext.notEqualsTo("empty")
          }
        });
      }
      async run(accessor) {
        await accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: "@tag:accessibility" });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openWorkspaceSettingsFile",
          title: nls.localize2("openWorkspaceSettingsFile", "Open Workspace Settings (JSON)"),
          category,
          menu: {
            id: MenuId.CommandPalette,
            when: WorkbenchStateContext.notEqualsTo("empty")
          }
        });
      }
      run(accessor, args) {
        args = sanitizeOpenSettingsArgs(args);
        return accessor.get(IPreferencesService).openWorkspaceSettings({ jsonEditor: true, ...args });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openFolderSettings",
          title: nls.localize2("openFolderSettings", "Open Folder Settings"),
          category,
          menu: {
            id: MenuId.CommandPalette,
            when: WorkbenchStateContext.isEqualTo("workspace")
          }
        });
      }
      async run(accessor, args) {
        const commandService = accessor.get(ICommandService);
        const preferencesService = accessor.get(IPreferencesService);
        const workspaceFolder = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
        if (workspaceFolder) {
          args = sanitizeOpenSettingsArgs(args);
          await preferencesService.openFolderSettings({ folderUri: workspaceFolder.uri, ...args });
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openFolderSettingsFile",
          title: nls.localize2("openFolderSettingsFile", "Open Folder Settings (JSON)"),
          category,
          menu: {
            id: MenuId.CommandPalette,
            when: WorkbenchStateContext.isEqualTo("workspace")
          }
        });
      }
      async run(accessor, args) {
        const commandService = accessor.get(ICommandService);
        const preferencesService = accessor.get(IPreferencesService);
        const workspaceFolder = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
        if (workspaceFolder) {
          args = sanitizeOpenSettingsArgs(args);
          await preferencesService.openFolderSettings({ folderUri: workspaceFolder.uri, jsonEditor: true, ...args });
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "_workbench.action.openFolderSettings",
          title: nls.localize("openFolderSettings", "Open Folder Settings"),
          category,
          menu: {
            id: MenuId.ExplorerContext,
            group: "2_workspace",
            order: 20,
            when: ContextKeyExpr.and(ExplorerRootContext, ExplorerFolderContext)
          }
        });
      }
      async run(accessor, resource) {
        if (URI.isUri(resource)) {
          await accessor.get(IPreferencesService).openFolderSettings({ folderUri: resource });
        } else {
          const commandService = accessor.get(ICommandService);
          const preferencesService = accessor.get(IPreferencesService);
          const workspaceFolder = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
          if (workspaceFolder) {
            await preferencesService.openFolderSettings({ folderUri: workspaceFolder.uri });
          }
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FILTER_ONLINE,
          title: nls.localize({ key: "miOpenOnlineSettings", comment: ["&& denotes a mnemonic"] }, "&&Online Services Settings"),
          menu: {
            id: MenuId.MenubarPreferencesMenu,
            group: "3_settings",
            order: 1
          }
        });
      }
      run(accessor) {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof SettingsEditor2) {
          editorPane.focusSearch(`@tag:usesOnlineServices`);
        } else {
          accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: "@tag:usesOnlineServices" });
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_TOGGLE_AI_SEARCH,
          precondition: CONTEXT_SETTINGS_EDITOR,
          keybinding: {
            primary: KeyMod.CtrlCmd | KeyCode.KeyI,
            weight: KeybindingWeight.EditorContrib,
            when: CONTEXT_AI_SETTING_RESULTS_AVAILABLE
          },
          category,
          f1: true,
          title: nls.localize2("settings.toggleAiSearch", "Toggle AI Settings Search")
        });
      }
      run(accessor) {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof SettingsEditor2) {
          editorPane.toggleAiSearch();
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FILTER_UNTRUSTED,
          title: nls.localize2("filterUntrusted", "Show untrusted workspace settings")
        });
      }
      run(accessor) {
        accessor.get(IPreferencesService).openWorkspaceSettings({ jsonEditor: false, query: `@tag:${REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG}` });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_COMMAND_FILTER_TELEMETRY,
          title: nls.localize({ key: "miOpenTelemetrySettings", comment: ["&& denotes a mnemonic"] }, "&&Telemetry Settings")
        });
      }
      run(accessor) {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof SettingsEditor2) {
          editorPane.focusSearch(`@tag:telemetry`);
        } else {
          accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: "@tag:telemetry" });
        }
      }
    }));
    this.registerSettingsEditorActions();
    this.extensionService.whenInstalledExtensionsRegistered().then(() => {
      const remoteAuthority = this.environmentService.remoteAuthority;
      const hostLabel = this.labelService.getHostLabel(Schemas.vscodeRemote, remoteAuthority) || remoteAuthority;
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: "workbench.action.openRemoteSettings",
            title: nls.localize2("openRemoteSettings", "Open Remote Settings ({0})", hostLabel),
            category,
            menu: {
              id: MenuId.CommandPalette,
              when: RemoteNameContext.notEqualsTo("")
            }
          });
        }
        run(accessor, args) {
          args = sanitizeOpenSettingsArgs(args);
          return accessor.get(IPreferencesService).openRemoteSettings(args);
        }
      }));
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: "workbench.action.openRemoteSettingsFile",
            title: nls.localize2("openRemoteSettingsJSON", "Open Remote Settings (JSON) ({0})", hostLabel),
            category,
            menu: {
              id: MenuId.CommandPalette,
              when: RemoteNameContext.notEqualsTo("")
            }
          });
        }
        run(accessor, args) {
          args = sanitizeOpenSettingsArgs(args);
          return accessor.get(IPreferencesService).openRemoteSettings({ jsonEditor: true, ...args });
        }
      }));
    });
  }
  registerSettingsEditorActions() {
    function getPreferencesEditor(accessor) {
      const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
      if (activeEditorPane instanceof SettingsEditor2) {
        return activeEditorPane;
      }
      return null;
    }
    function settingsEditorFocusSearch(accessor) {
      const preferencesEditor = getPreferencesEditor(accessor);
      preferencesEditor?.focusSearch();
    }
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_SEARCH,
          precondition: CONTEXT_SETTINGS_EDITOR,
          keybinding: {
            primary: KeyMod.CtrlCmd | KeyCode.KeyF,
            weight: KeybindingWeight.EditorContrib,
            when: null
          },
          category,
          f1: true,
          title: nls.localize2("settings.focusSearch", "Focus Settings Search")
        });
      }
      run(accessor) {
        settingsEditorFocusSearch(accessor);
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS,
          precondition: CONTEXT_SETTINGS_EDITOR,
          keybinding: {
            primary: KeyCode.Escape,
            weight: KeybindingWeight.EditorContrib,
            when: CONTEXT_SETTINGS_SEARCH_FOCUS
          },
          category,
          f1: true,
          title: nls.localize2("settings.clearResults", "Clear Settings Search Results")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        preferencesEditor?.clearSearchResults();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_FILE,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated()),
          title: nls.localize("settings.focusFile", "Focus settings file")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        preferencesEditor?.navigateSearchHistoryNextOrFocusSettings();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_FROM_SEARCH,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated()),
          keybinding: {
            primary: KeyCode.DownArrow,
            weight: KeybindingWeight.WorkbenchContrib + 1,
            when: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated())
          },
          title: nls.localize("settings.focusFile", "Focus settings file")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        preferencesEditor?.navigateSearchHistoryNextOrFocusSettings();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_SHOW_PREVIOUS_SEARCH,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated()),
          keybinding: {
            primary: KeyCode.UpArrow,
            weight: KeybindingWeight.WorkbenchContrib + 1,
            when: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated())
          },
          title: nls.localize("settings.showPreviousSearch", "Show Previous Search in Settings")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        preferencesEditor?.navigateSearchHistoryPrevious();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_FROM_SEARCH_ON_ENTER,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated()),
          keybinding: {
            primary: KeyCode.Enter,
            weight: KeybindingWeight.WorkbenchContrib,
            when: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated())
          },
          title: nls.localize("settings.focusSettingsFromSearchOnEnter", "Focus First Setting from Search")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        preferencesEditor?.focusFirstSettingFromSearch();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_SEARCH_FROM_SETTINGS,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_ROW_FOCUS, CONTEXT_SETTINGS_FIRST_ROW_FOCUS),
          keybinding: {
            primary: KeyCode.UpArrow,
            // Win over the list's own `list.focusUp` command so the first row moves focus back to search.
            weight: KeybindingWeight.WorkbenchContrib + 1,
            when: null
          },
          title: nls.localize("settings.focusSearchFromSettings", "Focus Settings Search from Settings")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        preferencesEditor?.focusSearch();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_LIST,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR, CONTEXT_TOC_ROW_FOCUS),
          keybinding: {
            primary: KeyCode.Enter,
            weight: KeybindingWeight.WorkbenchContrib,
            when: null
          },
          title: nls.localize("settings.focusSettingsList", "Focus settings list")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        if (preferencesEditor instanceof SettingsEditor2) {
          preferencesEditor.focusSettings();
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_TOC,
          precondition: CONTEXT_SETTINGS_EDITOR,
          f1: true,
          keybinding: [
            {
              primary: KeyCode.LeftArrow,
              weight: KeybindingWeight.WorkbenchContrib,
              when: CONTEXT_SETTINGS_ROW_FOCUS
            }
          ],
          category,
          title: nls.localize2("settings.focusSettingsTOC", "Focus Settings Table of Contents")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        if (!(preferencesEditor instanceof SettingsEditor2)) {
          return;
        }
        preferencesEditor.focusTOC();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_CONTROL,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_ROW_FOCUS),
          keybinding: {
            primary: KeyCode.Enter,
            weight: KeybindingWeight.WorkbenchContrib
          },
          title: nls.localize("settings.focusSettingControl", "Focus Setting Control")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        if (!(preferencesEditor instanceof SettingsEditor2)) {
          return;
        }
        const activeElement = preferencesEditor.getContainer()?.ownerDocument.activeElement;
        if (activeElement?.classList.contains("monaco-list")) {
          preferencesEditor.focusSettings(true);
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU,
          precondition: CONTEXT_SETTINGS_EDITOR,
          keybinding: {
            primary: KeyMod.Shift | KeyCode.F9,
            weight: KeybindingWeight.WorkbenchContrib,
            when: null
          },
          f1: true,
          category,
          title: nls.localize2("settings.showContextMenu", "Show Setting Context Menu")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        if (preferencesEditor instanceof SettingsEditor2) {
          preferencesEditor.showContextMenu();
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_UP,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_SEARCH_FOCUS.toNegated(), CONTEXT_SETTINGS_JSON_EDITOR.toNegated()),
          keybinding: {
            primary: KeyCode.Escape,
            weight: KeybindingWeight.WorkbenchContrib,
            when: null
          },
          f1: true,
          category,
          title: nls.localize2("settings.focusLevelUp", "Move Focus Up One Level")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        if (!(preferencesEditor instanceof SettingsEditor2)) {
          return;
        }
        if (preferencesEditor.currentFocusContext === SettingsFocusContext.SettingControl) {
          preferencesEditor.focusSettings();
        } else if (preferencesEditor.currentFocusContext === SettingsFocusContext.SettingTree) {
          preferencesEditor.focusTOC();
        } else if (preferencesEditor.currentFocusContext === SettingsFocusContext.TableOfContents) {
          preferencesEditor.focusSearch();
        }
      }
    }));
  }
  registerKeybindingsActions() {
    const that = this;
    const category2 = nls.localize2("preferences", "Preferences");
    const id = "workbench.action.openGlobalKeybindings";
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id,
          title: nls.localize2("openGlobalKeybindings", "Open Keyboard Shortcuts"),
          shortTitle: nls.localize("keyboardShortcuts", "Keyboard Shortcuts"),
          category: category2,
          icon: preferencesOpenSettingsIcon,
          keybinding: {
            when: null,
            weight: KeybindingWeight.WorkbenchContrib,
            primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyS)
          },
          menu: [
            { id: MenuId.CommandPalette },
            {
              id: MenuId.EditorTitle,
              when: ResourceContextKey.Resource.isEqualTo(that.userDataProfileService.currentProfile.keybindingsResource.toString()),
              group: "navigation",
              order: 1
            },
            {
              id: MenuId.ModalEditorEditorTitle,
              when: ResourceContextKey.Resource.isEqualTo(that.userDataProfileService.currentProfile.keybindingsResource.toString()),
              group: "navigation",
              order: 1
            },
            {
              id: MenuId.GlobalActivity,
              group: "2_configuration",
              order: 4
            }
          ]
        });
      }
      run(accessor, ...args) {
        const query = typeof args[0] === "string" ? args[0] : void 0;
        const groupId = getEditorGroupFromArguments(accessor, args)?.id;
        return accessor.get(IPreferencesService).openGlobalKeybindingSettings(false, { query, groupId });
      }
    }));
    this._register(MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
      command: {
        id,
        title: nls.localize("keyboardShortcuts", "Keyboard Shortcuts")
      },
      group: "2_configuration",
      order: 4
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openDefaultKeybindingsFile",
          title: nls.localize2("openDefaultKeybindingsFile", "Open Default Keyboard Shortcuts (JSON)"),
          category: category2,
          menu: { id: MenuId.CommandPalette }
        });
      }
      run(accessor) {
        return accessor.get(IPreferencesService).openDefaultKeybindingsFile();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openGlobalKeybindingsFile",
          title: nls.localize2("openGlobalKeybindingsFile", "Open Keyboard Shortcuts (JSON)"),
          category: category2,
          icon: preferencesOpenSettingsIcon,
          menu: [
            { id: MenuId.CommandPalette },
            {
              id: MenuId.EditorTitle,
              when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
              group: "navigation"
            },
            {
              id: MenuId.ModalEditorEditorTitle,
              when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
              group: "navigation"
            }
          ]
        });
      }
      run(accessor, ...args) {
        const groupId = getEditorGroupFromArguments(accessor, args)?.id;
        return accessor.get(IPreferencesService).openGlobalKeybindingSettings(true, { groupId });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: KEYBINDINGS_EDITOR_SHOW_DEFAULT_KEYBINDINGS,
          title: nls.localize2("showDefaultKeybindings", "Show System Keybindings"),
          menu: [
            {
              id: MenuId.EditorTitle,
              when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
              group: "1_keyboard_preferences_actions"
            }
          ]
        });
      }
      run(accessor, ...args) {
        const group = getEditorGroupFromArguments(accessor, args);
        const editorPane = group?.activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.search("@source:system");
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: KEYBINDINGS_EDITOR_SHOW_EXTENSION_KEYBINDINGS,
          title: nls.localize2("showExtensionKeybindings", "Show Extension Keybindings"),
          menu: [
            {
              id: MenuId.EditorTitle,
              when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
              group: "1_keyboard_preferences_actions"
            }
          ]
        });
      }
      run(accessor, ...args) {
        const group = getEditorGroupFromArguments(accessor, args);
        const editorPane = group?.activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.search("@source:extension");
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: KEYBINDINGS_EDITOR_SHOW_USER_KEYBINDINGS,
          title: nls.localize2("showUserKeybindings", "Show User Keybindings"),
          menu: [
            {
              id: MenuId.EditorTitle,
              when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
              group: "1_keyboard_preferences_actions"
            }
          ]
        });
      }
      run(accessor, ...args) {
        const group = getEditorGroupFromArguments(accessor, args);
        const editorPane = group?.activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.search("@source:user");
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS,
          title: nls.localize("clear", "Clear Search Results"),
          keybinding: {
            weight: KeybindingWeight.WorkbenchContrib,
            when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS, CONTEXT_KEYBINDINGS_SEARCH_HAS_VALUE),
            primary: KeyCode.Escape
          }
        });
      }
      run(accessor) {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.clearSearchResults();
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_HISTORY,
          title: nls.localize("clearHistory", "Clear Keyboard Shortcuts Search History"),
          category: category2,
          menu: [
            {
              id: MenuId.CommandPalette,
              when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR)
            }
          ]
        });
      }
      run(accessor) {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.clearKeyboardShortcutSearchHistory();
        }
      }
    }));
    this.registerKeybindingEditorActions();
  }
  registerKeybindingEditorActions() {
    const that = this;
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_DEFINE,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS, CONTEXT_WHEN_FOCUS.toNegated()),
      primary: KeyCode.Enter,
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.defineKeybinding(editorPane.activeKeybindingEntry, false);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_ADD,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
      primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyA),
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.defineKeybinding(editorPane.activeKeybindingEntry, true);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
      primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyE),
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor && editorPane.activeKeybindingEntry.keybindingItem.keybinding) {
          editorPane.defineWhenExpression(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_REMOVE,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS, InputFocusedContext.toNegated()),
      primary: KeyCode.Delete,
      mac: {
        primary: KeyMod.CtrlCmd | KeyCode.Backspace
      },
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.removeKeybinding(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_RESET,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
      primary: 0,
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.resetKeybinding(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_SEARCH,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
      primary: KeyMod.CtrlCmd | KeyCode.KeyF,
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.focusSearch();
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS),
      primary: KeyMod.Alt | KeyCode.KeyK,
      mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyK },
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.recordSearchKeys();
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
      primary: KeyMod.Alt | KeyCode.KeyP,
      mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyP },
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.toggleSortByPrecedence();
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
      primary: 0,
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.showSimilarKeybindings(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_COPY,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS, CONTEXT_WHEN_FOCUS.negate()),
      primary: KeyMod.CtrlCmd | KeyCode.KeyC,
      handler: async (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          await editorPane.copyKeybinding(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
      primary: 0,
      handler: async (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          await editorPane.copyKeybindingCommand(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
      primary: 0,
      handler: async (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          await editorPane.copyKeybindingCommandTitle(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_FOCUS_KEYBINDINGS,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS),
      primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.focusKeybindings();
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_REJECT_WHEN,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_WHEN_FOCUS, SuggestContext.Visible.toNegated()),
      primary: KeyCode.Escape,
      handler: async (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.rejectWhenExpression(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_ACCEPT_WHEN,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_WHEN_FOCUS, SuggestContext.Visible.toNegated()),
      primary: KeyCode.Enter,
      handler: async (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.acceptWhenExpression(editorPane.activeKeybindingEntry);
        }
      }
    });
    const profileScopedActionDisposables = this._register(new DisposableStore());
    const registerProfileScopedActions = () => {
      profileScopedActionDisposables.clear();
      profileScopedActionDisposables.add(registerAction2(class DefineKeybindingAction extends Action2 {
        constructor() {
          const when = ResourceContextKey.Resource.isEqualTo(that.userDataProfileService.currentProfile.keybindingsResource.toString());
          super({
            id: "editor.action.defineKeybinding",
            title: nls.localize2("defineKeybinding.start", "Define Keybinding"),
            f1: true,
            precondition: when,
            keybinding: {
              weight: KeybindingWeight.WorkbenchContrib,
              when,
              primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK)
            },
            menu: {
              id: MenuId.EditorContent,
              when
            }
          });
        }
        async run(accessor) {
          const codeEditor = accessor.get(IEditorService).activeTextEditorControl;
          if (isCodeEditor(codeEditor)) {
            codeEditor.getContribution(DEFINE_KEYBINDING_EDITOR_CONTRIB_ID)?.showDefineKeybindingWidget();
          }
        }
      }));
    };
    registerProfileScopedActions();
    this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => registerProfileScopedActions()));
  }
  updatePreferencesEditorMenuItem() {
    const commandId = "_workbench.openWorkspaceSettingsEditor";
    if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE && !CommandsRegistry.getCommand(commandId)) {
      CommandsRegistry.registerCommand(commandId, () => this.preferencesService.openWorkspaceSettings({ jsonEditor: false }));
      const when = ContextKeyExpr.and(ResourceContextKey.Resource.isEqualTo(this.preferencesService.workspaceSettingsResource.toString()), WorkbenchStateContext.isEqualTo("workspace"), ContextKeyExpr.not("isInDiffEditor"));
      MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
        command: {
          id: commandId,
          title: OPEN_USER_SETTINGS_UI_TITLE,
          icon: preferencesOpenSettingsIcon
        },
        when,
        group: "navigation",
        order: 1
      });
      MenuRegistry.appendMenuItem(MenuId.ModalEditorEditorTitle, {
        command: {
          id: commandId,
          title: OPEN_USER_SETTINGS_UI_TITLE,
          icon: preferencesOpenSettingsIcon
        },
        when,
        group: "navigation",
        order: 1
      });
    }
    this.updatePreferencesEditorMenuItemForWorkspaceFolders();
  }
  updatePreferencesEditorMenuItemForWorkspaceFolders() {
    for (const folder of this.workspaceContextService.getWorkspace().folders) {
      const commandId = `_workbench.openFolderSettings.${folder.uri.toString()}`;
      if (!CommandsRegistry.getCommand(commandId)) {
        CommandsRegistry.registerCommand(commandId, (accessor, ...args) => {
          const groupId = getEditorGroupFromArguments(accessor, args)?.id;
          if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.FOLDER) {
            return this.preferencesService.openWorkspaceSettings({ jsonEditor: false, groupId });
          } else {
            return this.preferencesService.openFolderSettings({ folderUri: folder.uri, jsonEditor: false, groupId });
          }
        });
        const when = ContextKeyExpr.and(ResourceContextKey.Resource.isEqualTo(this.preferencesService.getFolderSettingsResource(folder.uri).toString()), ContextKeyExpr.not("isInDiffEditor"));
        MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
          command: {
            id: commandId,
            title: OPEN_USER_SETTINGS_UI_TITLE,
            icon: preferencesOpenSettingsIcon
          },
          when,
          group: "navigation",
          order: 1
        });
        MenuRegistry.appendMenuItem(MenuId.ModalEditorEditorTitle, {
          command: {
            id: commandId,
            title: OPEN_USER_SETTINGS_UI_TITLE,
            icon: preferencesOpenSettingsIcon
          },
          when,
          group: "navigation",
          order: 1
        });
      }
    }
  }
};
PreferencesActionsContribution.ID = "workbench.contrib.preferencesActions";
PreferencesActionsContribution = __decorateClass([
  __decorateParam(0, IWorkbenchEnvironmentService),
  __decorateParam(1, IUserDataProfileService),
  __decorateParam(2, IPreferencesService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, IExtensionService),
  __decorateParam(6, IUserDataProfilesService)
], PreferencesActionsContribution);
let SettingsEditorTitleContribution = class extends Disposable {
  constructor(userDataProfileService, userDataProfilesService) {
    super();
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.registerSettingsEditorTitleActions();
  }
  registerSettingsEditorTitleActions() {
    const registerOpenUserSettingsEditorFromJsonActionDisposables = this._register(new MutableDisposable());
    const registerOpenUserSettingsEditorFromJsonAction = () => {
      const openUserSettingsEditorWhen = ContextKeyExpr.and(
        CONTEXT_SETTINGS_EDITOR.toNegated(),
        ContextKeyExpr.or(
          ResourceContextKey.Resource.isEqualTo(this.userDataProfileService.currentProfile.settingsResource.toString()),
          ResourceContextKey.Resource.isEqualTo(this.userDataProfilesService.defaultProfile.settingsResource.toString())
        ),
        ContextKeyExpr.not("isInDiffEditor")
      );
      registerOpenUserSettingsEditorFromJsonActionDisposables.clear();
      registerOpenUserSettingsEditorFromJsonActionDisposables.value = registerAction2(class extends Action2 {
        constructor() {
          super({
            id: "_workbench.openUserSettingsEditor",
            title: OPEN_USER_SETTINGS_UI_TITLE,
            icon: preferencesOpenSettingsIcon,
            menu: [{
              id: MenuId.EditorTitle,
              when: openUserSettingsEditorWhen,
              group: "navigation",
              order: 1
            }, {
              id: MenuId.ModalEditorEditorTitle,
              when: openUserSettingsEditorWhen,
              group: "navigation",
              order: 1
            }]
          });
        }
        run(accessor, ...args) {
          const sanitizedArgs = sanitizeOpenSettingsArgs(args[0]);
          const groupId = getEditorGroupFromArguments(accessor, args)?.id;
          return accessor.get(IPreferencesService).openUserSettings({ jsonEditor: false, ...sanitizedArgs, groupId });
        }
      });
    };
    registerOpenUserSettingsEditorFromJsonAction();
    this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => {
      registerOpenUserSettingsEditorFromJsonAction();
    }));
    const openSettingsJsonWhen = ContextKeyExpr.and(CONTEXT_SETTINGS_JSON_EDITOR.toNegated(), CONTEXT_SETTINGS_EDITOR);
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_SWITCH_TO_JSON,
          title: nls.localize2("openSettingsJson", "Open Settings (JSON)"),
          icon: preferencesOpenSettingsIcon,
          menu: [{
            id: MenuId.EditorTitle,
            when: openSettingsJsonWhen,
            group: "navigation",
            order: 1
          }, {
            id: MenuId.ModalEditorEditorTitle,
            when: openSettingsJsonWhen,
            group: "navigation",
            order: 1
          }]
        });
      }
      run(accessor, ...args) {
        const group = getEditorGroupFromArguments(accessor, args);
        const editorPane = group?.activeEditorPane;
        if (editorPane instanceof SettingsEditor2) {
          return editorPane.switchToSettingsFile();
        }
        return null;
      }
    }));
  }
};
SettingsEditorTitleContribution.ID = "workbench.contrib.settingsEditorTitleBarActions";
SettingsEditorTitleContribution = __decorateClass([
  __decorateParam(0, IUserDataProfileService),
  __decorateParam(1, IUserDataProfilesService)
], SettingsEditorTitleContribution);
let SettingsEditorContribution = class extends Disposable {
  constructor(editor, instantiationService, preferencesService, workspaceContextService) {
    super();
    this.editor = editor;
    this.instantiationService = instantiationService;
    this.preferencesService = preferencesService;
    this.workspaceContextService = workspaceContextService;
    this.disposables = this._register(new DisposableStore());
    this._createPreferencesRenderer();
    this._register(this.editor.onDidChangeModel((e) => this._createPreferencesRenderer()));
    this._register(this.workspaceContextService.onDidChangeWorkbenchState(() => this._createPreferencesRenderer()));
  }
  async _createPreferencesRenderer() {
    this.disposables.clear();
    this.currentRenderer = void 0;
    const model = this.editor.getModel();
    if (model && /\.(json|code-workspace)$/.test(model.uri.path)) {
      const settingsModel = await this.preferencesService.createPreferencesEditorModel(model.uri);
      if (settingsModel instanceof SettingsEditorModel && this.editor.getModel()) {
        this.disposables.add(settingsModel);
        switch (settingsModel.configurationTarget) {
          case ConfigurationTarget.WORKSPACE:
            this.currentRenderer = this.disposables.add(this.instantiationService.createInstance(WorkspaceSettingsRenderer, this.editor, settingsModel));
            break;
          default:
            this.currentRenderer = this.disposables.add(this.instantiationService.createInstance(UserSettingsRenderer, this.editor, settingsModel));
            break;
        }
      }
      this.currentRenderer?.render();
    }
  }
};
SettingsEditorContribution.ID = "editor.contrib.settings";
SettingsEditorContribution = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IPreferencesService),
  __decorateParam(3, IWorkspaceContextService)
], SettingsEditorContribution);
function getEditorGroupFromArguments(accessor, args) {
  const context = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
  return context.groupedEditors[0]?.group;
}
registerWorkbenchContribution2(PreferencesActionsContribution.ID, PreferencesActionsContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(PreferencesContribution.ID, PreferencesContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(SettingsEditorTitleContribution.ID, SettingsEditorTitleContribution, WorkbenchPhase.AfterRestored);
registerEditorContribution(SettingsEditorContribution.ID, SettingsEditorContribution, EditorContributionInstantiation.AfterFirstRender);
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  title: nls.localize({ key: "miPreferences", comment: ["&& denotes a mnemonic"] }, "&&Preferences"),
  submenu: MenuId.MenubarPreferencesMenu,
  group: "5_autosave",
  order: 2,
  when: IsMacNativeContext.toNegated()
  // on macOS native the preferences menu is separate under the application menu
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIvcHJlZmVyZW5jZXMuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNCb29sZWFuLCBpc09iamVjdCwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIGlzQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbiwgcmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHQgYXMgU3VnZ2VzdENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdC5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJbnB1dEZvY3VzZWRDb250ZXh0LCBJc01hY05hdGl2ZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCwgS2V5YmluZGluZ3NSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFBJQ0tfV09SS1NQQUNFX0ZPTERFUl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL3dvcmtzcGFjZUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmVEZXNjcmlwdG9yLCBJRWRpdG9yUGFuZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUNvbW1hbmRzQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckNvbW1hbmRzQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBSZW1vdGVOYW1lQ29udGV4dCwgUmVzb3VyY2VDb250ZXh0S2V5LCBXb3JrYmVuY2hTdGF0ZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnMsIElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIElFZGl0b3JTZXJpYWxpemVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2Jyb3dzZXIva2V5YmluZGluZ3NFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBERUZJTkVfS0VZQklORElOR19FRElUT1JfQ09OVFJJQl9JRCwgSURlZmluZUtleWJpbmRpbmdFZGl0b3JDb250cmlidXRpb24sIElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgUHJlZmVyZW5jZXNFZGl0b3JJbnB1dCwgU2V0dGluZ3NFZGl0b3IySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXNFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTZXR0aW5nc0VkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzTW9kZWxzLmpzJztcbmltcG9ydCB7IENVUlJFTlRfUFJPRklMRV9DT05URVhULCBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IEV4cGxvcmVyRm9sZGVyQ29udGV4dCwgRXhwbG9yZXJSb290Q29udGV4dCB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0FJX1NFVFRJTkdfUkVTVUxUU19BVkFJTEFCTEUsIENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SLCBDT05URVhUX0tFWUJJTkRJTkdTX1NFQVJDSF9GT0NVUywgQ09OVEVYVF9LRVlCSU5ESU5HU19TRUFSQ0hfSEFTX1ZBTFVFLCBDT05URVhUX0tFWUJJTkRJTkdfRk9DVVMsIENPTlRFWFRfU0VUVElOR1NfRURJVE9SLCBDT05URVhUX1NFVFRJTkdTX0ZJUlNUX1JPV19GT0NVUywgQ09OVEVYVF9TRVRUSU5HU19KU09OX0VESVRPUiwgQ09OVEVYVF9TRVRUSU5HU19ST1dfRk9DVVMsIENPTlRFWFRfU0VUVElOR1NfU0VBUkNIX0ZPQ1VTLCBDT05URVhUX1RPQ19ST1dfRk9DVVMsIENPTlRFWFRfV0hFTl9GT0NVUywgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQUNDRVBUX1dIRU4sIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0FERCwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQ0xFQVJfU0VBUkNIX0hJU1RPUlksIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0NMRUFSX1NFQVJDSF9SRVNVTFRTLCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9DT1BZLCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9DT1BZX0NPTU1BTkQsIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0NPUFlfQ09NTUFORF9USVRMRSwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfREVGSU5FLCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9ERUZJTkVfV0hFTiwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfRk9DVVNfS0VZQklORElOR1MsIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1JFQ09SRF9TRUFSQ0hfS0VZUywgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfUkVKRUNUX1dIRU4sIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1JFTU9WRSwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfUkVTRVQsIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1NFQVJDSCwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfU0hPV19TSU1JTEFSLCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9TT1JUQllfUFJFQ0VERU5DRSwgS0VZQklORElOR1NfRURJVE9SX1NIT1dfREVGQVVMVF9LRVlCSU5ESU5HUywgS0VZQklORElOR1NfRURJVE9SX1NIT1dfRVhURU5TSU9OX0tFWUJJTkRJTkdTLCBLRVlCSU5ESU5HU19FRElUT1JfU0hPV19VU0VSX0tFWUJJTkRJTkdTLCBSRVFVSVJFX1RSVVNURURfV09SS1NQQUNFX1NFVFRJTkdfVEFHLCBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9DTEVBUl9TRUFSQ0hfUkVTVUxUUywgU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfU0hPV19DT05URVhUX01FTlUsIFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX1RPR0dMRV9BSV9TRUFSQ0ggfSBmcm9tICcuLi9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgUHJlZmVyZW5jZXNDb250cmlidXRpb24gfSBmcm9tICcuLi9jb21tb24vcHJlZmVyZW5jZXNDb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NFZGl0b3IgfSBmcm9tICcuL2tleWJpbmRpbmdzRWRpdG9yLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyZUxhbmd1YWdlQmFzZWRTZXR0aW5nc0FjdGlvbiB9IGZyb20gJy4vcHJlZmVyZW5jZXNBY3Rpb25zLmpzJztcbmltcG9ydCB7IFByZWZlcmVuY2VzRWRpdG9yIH0gZnJvbSAnLi9wcmVmZXJlbmNlc0VkaXRvci5qcyc7XG5pbXBvcnQgeyBwcmVmZXJlbmNlc09wZW5TZXR0aW5nc0ljb24gfSBmcm9tICcuL3ByZWZlcmVuY2VzSWNvbnMuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzUmVuZGVyZXIsIFVzZXJTZXR0aW5nc1JlbmRlcmVyLCBXb3Jrc3BhY2VTZXR0aW5nc1JlbmRlcmVyIH0gZnJvbSAnLi9wcmVmZXJlbmNlc1JlbmRlcmVycy5qcyc7XG5pbXBvcnQgeyBTZXR0aW5nc0VkaXRvcjIsIFNldHRpbmdzRm9jdXNDb250ZXh0IH0gZnJvbSAnLi9zZXR0aW5nc0VkaXRvcjIuanMnO1xuXG5jb25zdCBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9TRUFSQ0ggPSAnc2V0dGluZ3MuYWN0aW9uLnNlYXJjaCc7XG5cbmNvbnN0IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0ZPQ1VTX0ZJTEUgPSAnc2V0dGluZ3MuYWN0aW9uLmZvY3VzU2V0dGluZ3NGaWxlJztcbmNvbnN0IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0ZPQ1VTX1NFVFRJTkdTX0ZST01fU0VBUkNIID0gJ3NldHRpbmdzLmFjdGlvbi5mb2N1c1NldHRpbmdzRnJvbVNlYXJjaCc7XG5jb25zdCBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9TSE9XX1BSRVZJT1VTX1NFQVJDSCA9ICdzZXR0aW5ncy5hY3Rpb24uc2hvd1ByZXZpb3VzU2VhcmNoJztcbmNvbnN0IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0ZPQ1VTX1NFVFRJTkdTX0ZST01fU0VBUkNIX09OX0VOVEVSID0gJ3NldHRpbmdzLmFjdGlvbi5mb2N1c1NldHRpbmdzRnJvbVNlYXJjaE9uRW50ZXInO1xuY29uc3QgU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRk9DVVNfU0VBUkNIX0ZST01fU0VUVElOR1MgPSAnc2V0dGluZ3MuYWN0aW9uLmZvY3VzU2VhcmNoRnJvbVNldHRpbmdzJztcbmNvbnN0IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0ZPQ1VTX1NFVFRJTkdTX0xJU1QgPSAnc2V0dGluZ3MuYWN0aW9uLmZvY3VzU2V0dGluZ3NMaXN0JztcbmNvbnN0IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0ZPQ1VTX1RPQyA9ICdzZXR0aW5ncy5hY3Rpb24uZm9jdXNUT0MnO1xuY29uc3QgU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRk9DVVNfQ09OVFJPTCA9ICdzZXR0aW5ncy5hY3Rpb24uZm9jdXNTZXR0aW5nQ29udHJvbCc7XG5jb25zdCBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9GT0NVU19VUCA9ICdzZXR0aW5ncy5hY3Rpb24uZm9jdXNMZXZlbFVwJztcblxuY29uc3QgU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfU1dJVENIX1RPX0pTT04gPSAnc2V0dGluZ3Muc3dpdGNoVG9KU09OJztcbmNvbnN0IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0ZJTFRFUl9PTkxJTkUgPSAnc2V0dGluZ3MuZmlsdGVyQnlPbmxpbmUnO1xuY29uc3QgU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRklMVEVSX1VOVFJVU1RFRCA9ICdzZXR0aW5ncy5maWx0ZXJVbnRydXN0ZWQnO1xuXG5jb25zdCBTRVRUSU5HU19DT01NQU5EX09QRU5fU0VUVElOR1MgPSAnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnO1xuY29uc3QgU0VUVElOR1NfQ09NTUFORF9GSUxURVJfVEVMRU1FVFJZID0gJ3NldHRpbmdzLmZpbHRlckJ5VGVsZW1ldHJ5JztcblxuUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRTZXR0aW5nc0VkaXRvcjIsXG5cdFx0U2V0dGluZ3NFZGl0b3IyLklELFxuXHRcdG5scy5sb2NhbGl6ZSgnc2V0dGluZ3NFZGl0b3IyJywgXCJTZXR0aW5ncyBFZGl0b3IgMlwiKVxuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKFNldHRpbmdzRWRpdG9yMklucHV0KVxuXHRdXG4pO1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdFByZWZlcmVuY2VzRWRpdG9yLFxuXHRcdFByZWZlcmVuY2VzRWRpdG9yLklELFxuXHRcdG5scy5sb2NhbGl6ZSgncHJlZmVyZW5jZXNFZGl0b3InLCBcIlByZWZlcmVuY2VzIEVkaXRvclwiKVxuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKFByZWZlcmVuY2VzRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5cbmNsYXNzIFByZWZlcmVuY2VzRWRpdG9ySW5wdXRTZXJpYWxpemVyIGltcGxlbWVudHMgSUVkaXRvclNlcmlhbGl6ZXIge1xuXG5cdGNhblNlcmlhbGl6ZShlZGl0b3JJbnB1dDogRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHNlcmlhbGl6ZShlZGl0b3JJbnB1dDogRWRpdG9ySW5wdXQpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByZWZlcmVuY2VzRWRpdG9ySW5wdXQpO1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0S2V5YmluZGluZ3NFZGl0b3IsXG5cdFx0S2V5YmluZGluZ3NFZGl0b3IuSUQsXG5cdFx0bmxzLmxvY2FsaXplKCdrZXliaW5kaW5nc0VkaXRvcicsIFwiS2V5YmluZGluZ3MgRWRpdG9yXCIpXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoS2V5YmluZGluZ3NFZGl0b3JJbnB1dClcblx0XVxuKTtcblxuY2xhc3MgS2V5YmluZGluZ3NFZGl0b3JJbnB1dFNlcmlhbGl6ZXIgaW1wbGVtZW50cyBJRWRpdG9yU2VyaWFsaXplciB7XG5cblx0Y2FuU2VyaWFsaXplKGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0c2VyaWFsaXplKGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0ZGVzZXJpYWxpemUoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IEVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoS2V5YmluZGluZ3NFZGl0b3JJbnB1dCk7XG5cdH1cbn1cblxuY2xhc3MgU2V0dGluZ3NFZGl0b3IySW5wdXRTZXJpYWxpemVyIGltcGxlbWVudHMgSUVkaXRvclNlcmlhbGl6ZXIge1xuXG5cdGNhblNlcmlhbGl6ZShlZGl0b3JJbnB1dDogRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHNlcmlhbGl6ZShpbnB1dDogU2V0dGluZ3NFZGl0b3IySW5wdXQpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBTZXR0aW5nc0VkaXRvcjJJbnB1dCB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzRWRpdG9yMklucHV0KTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihQcmVmZXJlbmNlc0VkaXRvcklucHV0LklELCBQcmVmZXJlbmNlc0VkaXRvcklucHV0U2VyaWFsaXplcik7XG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihLZXliaW5kaW5nc0VkaXRvcklucHV0LklELCBLZXliaW5kaW5nc0VkaXRvcklucHV0U2VyaWFsaXplcik7XG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihTZXR0aW5nc0VkaXRvcjJJbnB1dC5JRCwgU2V0dGluZ3NFZGl0b3IySW5wdXRTZXJpYWxpemVyKTtcblxuY29uc3QgT1BFTl9VU0VSX1NFVFRJTkdTX1VJX1RJVExFID0gbmxzLmxvY2FsaXplMignb3BlblNldHRpbmdzMicsIFwiT3BlbiBTZXR0aW5ncyAoVUkpXCIpO1xuY29uc3QgT1BFTl9VU0VSX1NFVFRJTkdTX0pTT05fVElUTEUgPSBubHMubG9jYWxpemUyKCdvcGVuVXNlclNldHRpbmdzSnNvbicsIFwiT3BlbiBVc2VyIFNldHRpbmdzIChKU09OKVwiKTtcbmNvbnN0IE9QRU5fQVBQTElDQVRJT05fU0VUVElOR1NfSlNPTl9USVRMRSA9IG5scy5sb2NhbGl6ZTIoJ29wZW5BcHBsaWNhdGlvblNldHRpbmdzSnNvbicsIFwiT3BlbiBBcHBsaWNhdGlvbiBTZXR0aW5ncyAoSlNPTilcIik7XG5jb25zdCBjYXRlZ29yeSA9IENhdGVnb3JpZXMuUHJlZmVyZW5jZXM7XG5cbmludGVyZmFjZSBJT3BlblNldHRpbmdzQWN0aW9uT3B0aW9ucyB7XG5cdG9wZW5Ub1NpZGU/OiBib29sZWFuO1xuXHRxdWVyeT86IHN0cmluZztcblx0cmV2ZWFsU2V0dGluZz86IHtcblx0XHRrZXk6IHN0cmluZztcblx0XHRlZGl0PzogYm9vbGVhbjtcblx0fTtcblx0Zm9jdXNTZWFyY2g/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZUJvb2xlYW4oYXJnOiB1bmtub3duKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBpc0Jvb2xlYW4oYXJnKSA/IGFyZyA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVTdHJpbmcoYXJnOiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGlzU3RyaW5nKGFyZykgPyBhcmcgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplT3BlblNldHRpbmdzQXJncyhhcmdzOiBhbnkpOiBJT3BlblNldHRpbmdzQWN0aW9uT3B0aW9ucyB7XG5cdGlmICghaXNPYmplY3QoYXJncykpIHtcblx0XHRhcmdzID0ge307XG5cdH1cblxuXHRsZXQgc2FuaXRpemVkT2JqZWN0OiBJT3BlblNldHRpbmdzQWN0aW9uT3B0aW9ucyA9IHtcblx0XHRmb2N1c1NlYXJjaDogc2FuaXRpemVCb29sZWFuKGFyZ3M/LmZvY3VzU2VhcmNoKSxcblx0XHRvcGVuVG9TaWRlOiBzYW5pdGl6ZUJvb2xlYW4oYXJncz8ub3BlblRvU2lkZSksXG5cdFx0cXVlcnk6IHNhbml0aXplU3RyaW5nKGFyZ3M/LnF1ZXJ5KVxuXHR9O1xuXG5cdGlmIChpc1N0cmluZyhhcmdzPy5yZXZlYWxTZXR0aW5nPy5rZXkpKSB7XG5cdFx0c2FuaXRpemVkT2JqZWN0ID0ge1xuXHRcdFx0Li4uc2FuaXRpemVkT2JqZWN0LFxuXHRcdFx0cmV2ZWFsU2V0dGluZzoge1xuXHRcdFx0XHRrZXk6IGFyZ3MucmV2ZWFsU2V0dGluZy5rZXksXG5cdFx0XHRcdGVkaXQ6IHNhbml0aXplQm9vbGVhbihhcmdzLnJldmVhbFNldHRpbmc/LmVkaXQpXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHJldHVybiBzYW5pdGl6ZWRPYmplY3Q7XG59XG5cbmNsYXNzIFByZWZlcmVuY2VzQWN0aW9uc0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIucHJlZmVyZW5jZXNBY3Rpb25zJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJTZXR0aW5nc0FjdGlvbnMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyS2V5YmluZGluZ3NBY3Rpb25zKCk7XG5cblx0XHR0aGlzLnVwZGF0ZVByZWZlcmVuY2VzRWRpdG9yTWVudUl0ZW0oKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCgpID0+IHRoaXMudXBkYXRlUHJlZmVyZW5jZXNFZGl0b3JNZW51SXRlbSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCgpID0+IHRoaXMudXBkYXRlUHJlZmVyZW5jZXNFZGl0b3JNZW51SXRlbUZvcldvcmtzcGFjZUZvbGRlcnMoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNldHRpbmdzQWN0aW9ucygpIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFNFVFRJTkdTX0NPTU1BTkRfT1BFTl9TRVRUSU5HUyxcblx0XHRcdFx0XHR0aXRsZToge1xuXHRcdFx0XHRcdFx0Li4ubmxzLmxvY2FsaXplMignc2V0dGluZ3MnLCBcIlNldHRpbmdzXCIpLFxuXHRcdFx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlPcGVuU2V0dGluZ3MnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTZXR0aW5nc1wiKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdFx0d2hlbjogbnVsbCxcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Db21tYSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkdsb2JhbEFjdGl2aXR5LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICcyX2NvbmZpZ3VyYXRpb24nLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJQcmVmZXJlbmNlc01lbnUsXG5cdFx0XHRcdFx0XHRncm91cDogJzJfY29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogc3RyaW5nIHwgSU9wZW5TZXR0aW5nc0FjdGlvbk9wdGlvbnMpIHtcblx0XHRcdFx0Ly8gYXJncyB0YWtlcyBhIHN0cmluZyBmb3IgYmFja2NvbXBhdFxuXHRcdFx0XHRjb25zdCBvcHRzID0gdHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnID8geyBxdWVyeTogYXJncyB9IDogc2FuaXRpemVPcGVuU2V0dGluZ3NBcmdzKGFyZ3MpO1xuXHRcdFx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5TZXR0aW5ncyh7IC4uLm9wdHMgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzMicsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ29wZW5TZXR0aW5nczInLCBcIk9wZW4gU2V0dGluZ3MgKFVJKVwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M6IElPcGVuU2V0dGluZ3NBY3Rpb25PcHRpb25zKSB7XG5cdFx0XHRcdGFyZ3MgPSBzYW5pdGl6ZU9wZW5TZXR0aW5nc0FyZ3MoYXJncyk7XG5cdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlblNldHRpbmdzKHsganNvbkVkaXRvcjogZmFsc2UsIC4uLmFyZ3MgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3NKc29uJyxcblx0XHRcdFx0XHR0aXRsZTogT1BFTl9VU0VSX1NFVFRJTkdTX0pTT05fVElUTEUsXG5cdFx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5nc0pzb24uZGVzY3JpcHRpb24nLCBcIk9wZW5zIHRoZSBKU09OIGZpbGUgY29udGFpbmluZyB0aGUgY3VycmVudCB1c2VyIHByb2ZpbGUgc2V0dGluZ3NcIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogSU9wZW5TZXR0aW5nc0FjdGlvbk9wdGlvbnMpIHtcblx0XHRcdFx0YXJncyA9IHNhbml0aXplT3BlblNldHRpbmdzQXJncyhhcmdzKTtcblx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKS5vcGVuU2V0dGluZ3MoeyBqc29uRWRpdG9yOiB0cnVlLCAuLi5hcmdzIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkFwcGxpY2F0aW9uU2V0dGluZ3NKc29uJyxcblx0XHRcdFx0XHR0aXRsZTogT1BFTl9BUFBMSUNBVElPTl9TRVRUSU5HU19KU09OX1RJVExFLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoQ1VSUkVOVF9QUk9GSUxFX0NPTlRFWFQua2V5LCB0aGF0LnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmlkKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M6IElPcGVuU2V0dGluZ3NBY3Rpb25PcHRpb25zKSB7XG5cdFx0XHRcdGFyZ3MgPSBzYW5pdGl6ZU9wZW5TZXR0aW5nc0FyZ3MoYXJncyk7XG5cdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlbkFwcGxpY2F0aW9uU2V0dGluZ3MoeyBqc29uRWRpdG9yOiB0cnVlLCAuLi5hcmdzIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIE9wZW5zIHRoZSBVc2VyIHRhYiBvZiB0aGUgU2V0dGluZ3MgZWRpdG9yXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuR2xvYmFsU2V0dGluZ3MnLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdvcGVuR2xvYmFsU2V0dGluZ3MnLCBcIk9wZW4gVXNlciBTZXR0aW5nc1wiKSxcblx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M6IElPcGVuU2V0dGluZ3NBY3Rpb25PcHRpb25zKSB7XG5cdFx0XHRcdGFyZ3MgPSBzYW5pdGl6ZU9wZW5TZXR0aW5nc0FyZ3MoYXJncyk7XG5cdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlblVzZXJTZXR0aW5ncyhhcmdzKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuUmF3RGVmYXVsdFNldHRpbmdzJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignb3BlblJhd0RlZmF1bHRTZXR0aW5ncycsIFwiT3BlbiBEZWZhdWx0IFNldHRpbmdzIChKU09OKVwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKS5vcGVuUmF3RGVmYXVsdFNldHRpbmdzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBDb25maWd1cmVMYW5ndWFnZUJhc2VkU2V0dGluZ3NBY3Rpb24uSUQsXG5cdFx0XHRcdFx0dGl0bGU6IENvbmZpZ3VyZUxhbmd1YWdlQmFzZWRTZXR0aW5nc0FjdGlvbi5MQUJFTCxcblx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpLmNyZWF0ZUluc3RhbmNlKENvbmZpZ3VyZUxhbmd1YWdlQmFzZWRTZXR0aW5nc0FjdGlvbiwgQ29uZmlndXJlTGFuZ3VhZ2VCYXNlZFNldHRpbmdzQWN0aW9uLklELCBDb25maWd1cmVMYW5ndWFnZUJhc2VkU2V0dGluZ3NBY3Rpb24uTEFCRUwudmFsdWUpLnJ1bigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5Xb3Jrc3BhY2VTZXR0aW5ncycsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ29wZW5Xb3Jrc3BhY2VTZXR0aW5ncycsIFwiT3BlbiBXb3Jrc3BhY2UgU2V0dGluZ3NcIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHRcdHdoZW46IFdvcmtiZW5jaFN0YXRlQ29udGV4dC5ub3RFcXVhbHNUbygnZW1wdHknKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiBzdHJpbmcgfCBJT3BlblNldHRpbmdzQWN0aW9uT3B0aW9ucykge1xuXHRcdFx0XHQvLyBNYXRjaCB0aGUgYmVoYXZpb3VyIG9mIHdvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzXG5cdFx0XHRcdGFyZ3MgPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyB7IHF1ZXJ5OiBhcmdzIH0gOiBzYW5pdGl6ZU9wZW5TZXR0aW5nc0FyZ3MoYXJncyk7XG5cdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlbldvcmtzcGFjZVNldHRpbmdzKGFyZ3MpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkFjY2Vzc2liaWxpdHlTZXR0aW5ncycsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ29wZW5BY2Nlc3NpYmlsaXR5U2V0dGluZ3MnLCBcIk9wZW4gQWNjZXNzaWJpbGl0eSBTZXR0aW5nc1wiKSxcblx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0d2hlbjogV29ya2JlbmNoU3RhdGVDb250ZXh0Lm5vdEVxdWFsc1RvKCdlbXB0eScpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHRhd2FpdCBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlblNldHRpbmdzKHsganNvbkVkaXRvcjogZmFsc2UsIHF1ZXJ5OiAnQHRhZzphY2Nlc3NpYmlsaXR5JyB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuV29ya3NwYWNlU2V0dGluZ3NGaWxlJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignb3BlbldvcmtzcGFjZVNldHRpbmdzRmlsZScsIFwiT3BlbiBXb3Jrc3BhY2UgU2V0dGluZ3MgKEpTT04pXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBXb3JrYmVuY2hTdGF0ZUNvbnRleHQubm90RXF1YWxzVG8oJ2VtcHR5Jylcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzPzogSU9wZW5TZXR0aW5nc0FjdGlvbk9wdGlvbnMpIHtcblx0XHRcdFx0YXJncyA9IHNhbml0aXplT3BlblNldHRpbmdzQXJncyhhcmdzKTtcblx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKS5vcGVuV29ya3NwYWNlU2V0dGluZ3MoeyBqc29uRWRpdG9yOiB0cnVlLCAuLi5hcmdzIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5Gb2xkZXJTZXR0aW5ncycsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ29wZW5Gb2xkZXJTZXR0aW5ncycsIFwiT3BlbiBGb2xkZXIgU2V0dGluZ3NcIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHRcdHdoZW46IFdvcmtiZW5jaFN0YXRlQ29udGV4dC5pc0VxdWFsVG8oJ3dvcmtzcGFjZScpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IElPcGVuU2V0dGluZ3NBY3Rpb25PcHRpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHByZWZlcmVuY2VzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gYXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8SVdvcmtzcGFjZUZvbGRlcj4oUElDS19XT1JLU1BBQ0VfRk9MREVSX0NPTU1BTkRfSUQpO1xuXHRcdFx0XHRpZiAod29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHRcdFx0YXJncyA9IHNhbml0aXplT3BlblNldHRpbmdzQXJncyhhcmdzKTtcblx0XHRcdFx0XHRhd2FpdCBwcmVmZXJlbmNlc1NlcnZpY2Uub3BlbkZvbGRlclNldHRpbmdzKHsgZm9sZGVyVXJpOiB3b3Jrc3BhY2VGb2xkZXIudXJpLCAuLi5hcmdzIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkZvbGRlclNldHRpbmdzRmlsZScsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ29wZW5Gb2xkZXJTZXR0aW5nc0ZpbGUnLCBcIk9wZW4gRm9sZGVyIFNldHRpbmdzIChKU09OKVwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0d2hlbjogV29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnd29ya3NwYWNlJylcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzPzogSU9wZW5TZXR0aW5nc0FjdGlvbk9wdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgcHJlZmVyZW5jZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSBhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxJV29ya3NwYWNlRm9sZGVyPihQSUNLX1dPUktTUEFDRV9GT0xERVJfQ09NTUFORF9JRCk7XG5cdFx0XHRcdGlmICh3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdFx0XHRhcmdzID0gc2FuaXRpemVPcGVuU2V0dGluZ3NBcmdzKGFyZ3MpO1xuXHRcdFx0XHRcdGF3YWl0IHByZWZlcmVuY2VzU2VydmljZS5vcGVuRm9sZGVyU2V0dGluZ3MoeyBmb2xkZXJVcmk6IHdvcmtzcGFjZUZvbGRlci51cmksIGpzb25FZGl0b3I6IHRydWUsIC4uLmFyZ3MgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnX3dvcmtiZW5jaC5hY3Rpb24ub3BlbkZvbGRlclNldHRpbmdzJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdvcGVuRm9sZGVyU2V0dGluZ3MnLCBcIk9wZW4gRm9sZGVyIFNldHRpbmdzXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuRXhwbG9yZXJDb250ZXh0LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICcyX3dvcmtzcGFjZScsXG5cdFx0XHRcdFx0XHRvcmRlcjogMjAsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRXhwbG9yZXJSb290Q29udGV4dCwgRXhwbG9yZXJGb2xkZXJDb250ZXh0KVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc291cmNlPzogVVJJKSB7XG5cdFx0XHRcdGlmIChVUkkuaXNVcmkocmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0YXdhaXQgYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5Gb2xkZXJTZXR0aW5ncyh7IGZvbGRlclVyaTogcmVzb3VyY2UgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gYXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8SVdvcmtzcGFjZUZvbGRlcj4oUElDS19XT1JLU1BBQ0VfRk9MREVSX0NPTU1BTkRfSUQpO1xuXHRcdFx0XHRcdGlmICh3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHByZWZlcmVuY2VzU2VydmljZS5vcGVuRm9sZGVyU2V0dGluZ3MoeyBmb2xkZXJVcmk6IHdvcmtzcGFjZUZvbGRlci51cmkgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRklMVEVSX09OTElORSxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlPcGVuT25saW5lU2V0dGluZ3MnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZPbmxpbmUgU2VydmljZXMgU2V0dGluZ3NcIiksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyUHJlZmVyZW5jZXNNZW51LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICczX3NldHRpbmdzJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBTZXR0aW5nc0VkaXRvcjIpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLmZvY3VzU2VhcmNoKGBAdGFnOnVzZXNPbmxpbmVTZXJ2aWNlc2ApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKS5vcGVuU2V0dGluZ3MoeyBqc29uRWRpdG9yOiBmYWxzZSwgcXVlcnk6ICdAdGFnOnVzZXNPbmxpbmVTZXJ2aWNlcycgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9UT0dHTEVfQUlfU0VBUkNILFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9TRVRUSU5HU19FRElUT1IsXG5cdFx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUksXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0XHRcdHdoZW46IENPTlRFWFRfQUlfU0VUVElOR19SRVNVTFRTX0FWQUlMQUJMRVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3NldHRpbmdzLnRvZ2dsZUFpU2VhcmNoJywgXCJUb2dnbGUgQUkgU2V0dGluZ3MgU2VhcmNoXCIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgU2V0dGluZ3NFZGl0b3IyKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFuZS50b2dnbGVBaVNlYXJjaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRklMVEVSX1VOVFJVU1RFRCxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignZmlsdGVyVW50cnVzdGVkJywgXCJTaG93IHVudHJ1c3RlZCB3b3Jrc3BhY2Ugc2V0dGluZ3NcIiksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKS5vcGVuV29ya3NwYWNlU2V0dGluZ3MoeyBqc29uRWRpdG9yOiBmYWxzZSwgcXVlcnk6IGBAdGFnOiR7UkVRVUlSRV9UUlVTVEVEX1dPUktTUEFDRV9TRVRUSU5HX1RBR31gIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogU0VUVElOR1NfQ09NTUFORF9GSUxURVJfVEVMRU1FVFJZLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaU9wZW5UZWxlbWV0cnlTZXR0aW5ncycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlRlbGVtZXRyeSBTZXR0aW5nc1wiKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIFNldHRpbmdzRWRpdG9yMikge1xuXHRcdFx0XHRcdGVkaXRvclBhbmUuZm9jdXNTZWFyY2goYEB0YWc6dGVsZW1ldHJ5YCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5TZXR0aW5ncyh7IGpzb25FZGl0b3I6IGZhbHNlLCBxdWVyeTogJ0B0YWc6dGVsZW1ldHJ5JyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJTZXR0aW5nc0VkaXRvckFjdGlvbnMoKTtcblxuXHRcdHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKVxuXHRcdFx0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0XHRcdGNvbnN0IGhvc3RMYWJlbCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldEhvc3RMYWJlbChTY2hlbWFzLnZzY29kZVJlbW90ZSwgcmVtb3RlQXV0aG9yaXR5KSB8fCByZW1vdGVBdXRob3JpdHk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblJlbW90ZVNldHRpbmdzJyxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ29wZW5SZW1vdGVTZXR0aW5ncycsIFwiT3BlbiBSZW1vdGUgU2V0dGluZ3MgKHswfSlcIiwgaG9zdExhYmVsKSxcblx0XHRcdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0XHRcdHdoZW46IFJlbW90ZU5hbWVDb250ZXh0Lm5vdEVxdWFsc1RvKCcnKVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzPzogSU9wZW5TZXR0aW5nc0FjdGlvbk9wdGlvbnMpIHtcblx0XHRcdFx0XHRcdGFyZ3MgPSBzYW5pdGl6ZU9wZW5TZXR0aW5nc0FyZ3MoYXJncyk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5SZW1vdGVTZXR0aW5ncyhhcmdzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuUmVtb3RlU2V0dGluZ3NGaWxlJyxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ29wZW5SZW1vdGVTZXR0aW5nc0pTT04nLCBcIk9wZW4gUmVtb3RlIFNldHRpbmdzIChKU09OKSAoezB9KVwiLCBob3N0TGFiZWwpLFxuXHRcdFx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHRcdFx0d2hlbjogUmVtb3RlTmFtZUNvbnRleHQubm90RXF1YWxzVG8oJycpXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiBJT3BlblNldHRpbmdzQWN0aW9uT3B0aW9ucykge1xuXHRcdFx0XHRcdFx0YXJncyA9IHNhbml0aXplT3BlblNldHRpbmdzQXJncyhhcmdzKTtcblx0XHRcdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlblJlbW90ZVNldHRpbmdzKHsganNvbkVkaXRvcjogdHJ1ZSwgLi4uYXJncyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNldHRpbmdzRWRpdG9yQWN0aW9ucygpIHtcblx0XHRmdW5jdGlvbiBnZXRQcmVmZXJlbmNlc0VkaXRvcihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFNldHRpbmdzRWRpdG9yMiB8IG51bGwge1xuXHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdGlmIChhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgU2V0dGluZ3NFZGl0b3IyKSB7XG5cdFx0XHRcdHJldHVybiBhY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gc2V0dGluZ3NFZGl0b3JGb2N1c1NlYXJjaChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0Y29uc3QgcHJlZmVyZW5jZXNFZGl0b3IgPSBnZXRQcmVmZXJlbmNlc0VkaXRvcihhY2Nlc3Nvcik7XG5cdFx0XHRwcmVmZXJlbmNlc0VkaXRvcj8uZm9jdXNTZWFyY2goKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX1NFQVJDSCxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfU0VUVElOR1NfRURJVE9SLFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlGLFxuXHRcdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdFx0XHRcdFx0XHR3aGVuOiBudWxsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignc2V0dGluZ3MuZm9jdXNTZWFyY2gnLCBcIkZvY3VzIFNldHRpbmdzIFNlYXJjaFwiKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7IHNldHRpbmdzRWRpdG9yRm9jdXNTZWFyY2goYWNjZXNzb3IpOyB9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9DTEVBUl9TRUFSQ0hfUkVTVUxUUyxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfU0VUVElOR1NfRURJVE9SLFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdFx0XHRcdFx0XHR3aGVuOiBDT05URVhUX1NFVFRJTkdTX1NFQVJDSF9GT0NVU1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3NldHRpbmdzLmNsZWFyUmVzdWx0cycsIFwiQ2xlYXIgU2V0dGluZ3MgU2VhcmNoIFJlc3VsdHNcIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlc0VkaXRvciA9IGdldFByZWZlcmVuY2VzRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRcdFx0cHJlZmVyZW5jZXNFZGl0b3I/LmNsZWFyU2VhcmNoUmVzdWx0cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRk9DVVNfRklMRSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NFVFRJTkdTX1NFQVJDSF9GT0NVUywgU3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnc2V0dGluZ3MuZm9jdXNGaWxlJywgXCJGb2N1cyBzZXR0aW5ncyBmaWxlXCIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdFx0Y29uc3QgcHJlZmVyZW5jZXNFZGl0b3IgPSBnZXRQcmVmZXJlbmNlc0VkaXRvcihhY2Nlc3Nvcik7XG5cdFx0XHRcdHByZWZlcmVuY2VzRWRpdG9yPy5uYXZpZ2F0ZVNlYXJjaEhpc3RvcnlOZXh0T3JGb2N1c1NldHRpbmdzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9GT0NVU19TRVRUSU5HU19GUk9NX1NFQVJDSCxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NFVFRJTkdTX1NFQVJDSF9GT0NVUywgU3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TRVRUSU5HU19TRUFSQ0hfRk9DVVMsIFN1Z2dlc3RDb250ZXh0LlZpc2libGUudG9OZWdhdGVkKCkpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdzZXR0aW5ncy5mb2N1c0ZpbGUnLCBcIkZvY3VzIHNldHRpbmdzIGZpbGVcIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlc0VkaXRvciA9IGdldFByZWZlcmVuY2VzRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRcdFx0cHJlZmVyZW5jZXNFZGl0b3I/Lm5hdmlnYXRlU2VhcmNoSGlzdG9yeU5leHRPckZvY3VzU2V0dGluZ3MoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX1NIT1dfUFJFVklPVVNfU0VBUkNILFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU0VUVElOR1NfU0VBUkNIX0ZPQ1VTLCBTdWdnZXN0Q29udGV4dC5WaXNpYmxlLnRvTmVnYXRlZCgpKSxcblx0XHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TRVRUSU5HU19TRUFSQ0hfRk9DVVMsIFN1Z2dlc3RDb250ZXh0LlZpc2libGUudG9OZWdhdGVkKCkpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdzZXR0aW5ncy5zaG93UHJldmlvdXNTZWFyY2gnLCBcIlNob3cgUHJldmlvdXMgU2VhcmNoIGluIFNldHRpbmdzXCIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdFx0Y29uc3QgcHJlZmVyZW5jZXNFZGl0b3IgPSBnZXRQcmVmZXJlbmNlc0VkaXRvcihhY2Nlc3Nvcik7XG5cdFx0XHRcdHByZWZlcmVuY2VzRWRpdG9yPy5uYXZpZ2F0ZVNlYXJjaEhpc3RvcnlQcmV2aW91cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRk9DVVNfU0VUVElOR1NfRlJPTV9TRUFSQ0hfT05fRU5URVIsXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TRVRUSU5HU19TRUFSQ0hfRk9DVVMsIFN1Z2dlc3RDb250ZXh0LlZpc2libGUudG9OZWdhdGVkKCkpLFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NFVFRJTkdTX1NFQVJDSF9GT0NVUywgU3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKSlcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3NldHRpbmdzLmZvY3VzU2V0dGluZ3NGcm9tU2VhcmNoT25FbnRlcicsIFwiRm9jdXMgRmlyc3QgU2V0dGluZyBmcm9tIFNlYXJjaFwiKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRcdGNvbnN0IHByZWZlcmVuY2VzRWRpdG9yID0gZ2V0UHJlZmVyZW5jZXNFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdFx0XHRwcmVmZXJlbmNlc0VkaXRvcj8uZm9jdXNGaXJzdFNldHRpbmdGcm9tU2VhcmNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9GT0NVU19TRUFSQ0hfRlJPTV9TRVRUSU5HUyxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NFVFRJTkdTX0VESVRPUiwgQ09OVEVYVF9TRVRUSU5HU19ST1dfRk9DVVMsIENPTlRFWFRfU0VUVElOR1NfRklSU1RfUk9XX0ZPQ1VTKSxcblx0XHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdFx0XHQvLyBXaW4gb3ZlciB0aGUgbGlzdCdzIG93biBgbGlzdC5mb2N1c1VwYCBjb21tYW5kIHNvIHRoZSBmaXJzdCByb3cgbW92ZXMgZm9jdXMgYmFjayB0byBzZWFyY2guXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0XHRcdFx0XHR3aGVuOiBudWxsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdzZXR0aW5ncy5mb2N1c1NlYXJjaEZyb21TZXR0aW5ncycsIFwiRm9jdXMgU2V0dGluZ3MgU2VhcmNoIGZyb20gU2V0dGluZ3NcIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlc0VkaXRvciA9IGdldFByZWZlcmVuY2VzRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRcdFx0cHJlZmVyZW5jZXNFZGl0b3I/LmZvY3VzU2VhcmNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9GT0NVU19TRVRUSU5HU19MSVNULFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU0VUVElOR1NfRURJVE9SLCBDT05URVhUX1RPQ19ST1dfRk9DVVMpLFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRcdHdoZW46IG51bGxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3NldHRpbmdzLmZvY3VzU2V0dGluZ3NMaXN0JywgXCJGb2N1cyBzZXR0aW5ncyBsaXN0XCIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdFx0Y29uc3QgcHJlZmVyZW5jZXNFZGl0b3IgPSBnZXRQcmVmZXJlbmNlc0VkaXRvcihhY2Nlc3Nvcik7XG5cdFx0XHRcdGlmIChwcmVmZXJlbmNlc0VkaXRvciBpbnN0YW5jZW9mIFNldHRpbmdzRWRpdG9yMikge1xuXHRcdFx0XHRcdHByZWZlcmVuY2VzRWRpdG9yLmZvY3VzU2V0dGluZ3MoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRk9DVVNfVE9DLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9TRVRUSU5HU19FRElUT1IsXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0a2V5YmluZGluZzogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkxlZnRBcnJvdyxcblx0XHRcdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0XHRcdHdoZW46IENPTlRFWFRfU0VUVElOR1NfUk9XX0ZPQ1VTXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignc2V0dGluZ3MuZm9jdXNTZXR0aW5nc1RPQycsIFwiRm9jdXMgU2V0dGluZ3MgVGFibGUgb2YgQ29udGVudHNcIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlc0VkaXRvciA9IGdldFByZWZlcmVuY2VzRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRcdFx0aWYgKCEocHJlZmVyZW5jZXNFZGl0b3IgaW5zdGFuY2VvZiBTZXR0aW5nc0VkaXRvcjIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cHJlZmVyZW5jZXNFZGl0b3IuZm9jdXNUT0MoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0ZPQ1VTX0NPTlRST0wsXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TRVRUSU5HU19FRElUT1IsIENPTlRFWFRfU0VUVElOR1NfUk9XX0ZPQ1VTKSxcblx0XHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdzZXR0aW5ncy5mb2N1c1NldHRpbmdDb250cm9sJywgXCJGb2N1cyBTZXR0aW5nIENvbnRyb2xcIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlc0VkaXRvciA9IGdldFByZWZlcmVuY2VzRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRcdFx0aWYgKCEocHJlZmVyZW5jZXNFZGl0b3IgaW5zdGFuY2VvZiBTZXR0aW5nc0VkaXRvcjIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IHByZWZlcmVuY2VzRWRpdG9yLmdldENvbnRhaW5lcigpPy5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0XHRcdGlmIChhY3RpdmVFbGVtZW50Py5jbGFzc0xpc3QuY29udGFpbnMoJ21vbmFjby1saXN0JykpIHtcblx0XHRcdFx0XHRwcmVmZXJlbmNlc0VkaXRvci5mb2N1c1NldHRpbmdzKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9TSE9XX0NPTlRFWFRfTUVOVSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfU0VUVElOR1NfRURJVE9SLFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRjksXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRcdHdoZW46IG51bGxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdzZXR0aW5ncy5zaG93Q29udGV4dE1lbnUnLCBcIlNob3cgU2V0dGluZyBDb250ZXh0IE1lbnVcIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlc0VkaXRvciA9IGdldFByZWZlcmVuY2VzRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRcdFx0aWYgKHByZWZlcmVuY2VzRWRpdG9yIGluc3RhbmNlb2YgU2V0dGluZ3NFZGl0b3IyKSB7XG5cdFx0XHRcdFx0cHJlZmVyZW5jZXNFZGl0b3Iuc2hvd0NvbnRleHRNZW51KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0ZPQ1VTX1VQLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU0VUVElOR1NfRURJVE9SLCBDT05URVhUX1NFVFRJTkdTX1NFQVJDSF9GT0NVUy50b05lZ2F0ZWQoKSwgQ09OVEVYVF9TRVRUSU5HU19KU09OX0VESVRPUi50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRcdHdoZW46IG51bGxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdzZXR0aW5ncy5mb2N1c0xldmVsVXAnLCBcIk1vdmUgRm9jdXMgVXAgT25lIExldmVsXCIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdFx0Y29uc3QgcHJlZmVyZW5jZXNFZGl0b3IgPSBnZXRQcmVmZXJlbmNlc0VkaXRvcihhY2Nlc3Nvcik7XG5cdFx0XHRcdGlmICghKHByZWZlcmVuY2VzRWRpdG9yIGluc3RhbmNlb2YgU2V0dGluZ3NFZGl0b3IyKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChwcmVmZXJlbmNlc0VkaXRvci5jdXJyZW50Rm9jdXNDb250ZXh0ID09PSBTZXR0aW5nc0ZvY3VzQ29udGV4dC5TZXR0aW5nQ29udHJvbCkge1xuXHRcdFx0XHRcdHByZWZlcmVuY2VzRWRpdG9yLmZvY3VzU2V0dGluZ3MoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChwcmVmZXJlbmNlc0VkaXRvci5jdXJyZW50Rm9jdXNDb250ZXh0ID09PSBTZXR0aW5nc0ZvY3VzQ29udGV4dC5TZXR0aW5nVHJlZSkge1xuXHRcdFx0XHRcdHByZWZlcmVuY2VzRWRpdG9yLmZvY3VzVE9DKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocHJlZmVyZW5jZXNFZGl0b3IuY3VycmVudEZvY3VzQ29udGV4dCA9PT0gU2V0dGluZ3NGb2N1c0NvbnRleHQuVGFibGVPZkNvbnRlbnRzKSB7XG5cdFx0XHRcdFx0cHJlZmVyZW5jZXNFZGl0b3IuZm9jdXNTZWFyY2goKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJLZXliaW5kaW5nc0FjdGlvbnMoKSB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0Y29uc3QgY2F0ZWdvcnkgPSBubHMubG9jYWxpemUyKCdwcmVmZXJlbmNlcycsIFwiUHJlZmVyZW5jZXNcIik7XG5cdFx0Y29uc3QgaWQgPSAnd29ya2JlbmNoLmFjdGlvbi5vcGVuR2xvYmFsS2V5YmluZGluZ3MnO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignb3Blbkdsb2JhbEtleWJpbmRpbmdzJywgXCJPcGVuIEtleWJvYXJkIFNob3J0Y3V0c1wiKSxcblx0XHRcdFx0XHRzaG9ydFRpdGxlOiBubHMubG9jYWxpemUoJ2tleWJvYXJkU2hvcnRjdXRzJywgXCJLZXlib2FyZCBTaG9ydGN1dHNcIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0aWNvbjogcHJlZmVyZW5jZXNPcGVuU2V0dGluZ3NJY29uLFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdHdoZW46IG51bGwsXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Uylcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG1lbnU6IFtcblx0XHRcdFx0XHRcdHsgaWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSB9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdFx0XHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuUmVzb3VyY2UuaXNFcXVhbFRvKHRoYXQudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5rZXliaW5kaW5nc1Jlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuTW9kYWxFZGl0b3JFZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRcdFx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LlJlc291cmNlLmlzRXF1YWxUbyh0aGF0LnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLkdsb2JhbEFjdGl2aXR5LFxuXHRcdFx0XHRcdFx0XHRncm91cDogJzJfY29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiA0XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRcdGNvbnN0IHF1ZXJ5ID0gdHlwZW9mIGFyZ3NbMF0gPT09ICdzdHJpbmcnID8gYXJnc1swXSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgZ3JvdXBJZCA9IGdldEVkaXRvckdyb3VwRnJvbUFyZ3VtZW50cyhhY2Nlc3NvciwgYXJncyk/LmlkO1xuXHRcdFx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5HbG9iYWxLZXliaW5kaW5nU2V0dGluZ3MoZmFsc2UsIHsgcXVlcnksIGdyb3VwSWQgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclByZWZlcmVuY2VzTWVudSwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgna2V5Ym9hcmRTaG9ydGN1dHMnLCBcIktleWJvYXJkIFNob3J0Y3V0c1wiKSxcblx0XHRcdH0sXG5cdFx0XHRncm91cDogJzJfY29uZmlndXJhdGlvbicsXG5cdFx0XHRvcmRlcjogNFxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5EZWZhdWx0S2V5YmluZGluZ3NGaWxlJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignb3BlbkRlZmF1bHRLZXliaW5kaW5nc0ZpbGUnLCBcIk9wZW4gRGVmYXVsdCBLZXlib2FyZCBTaG9ydGN1dHMgKEpTT04pXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdG1lbnU6IHsgaWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSB9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlbkRlZmF1bHRLZXliaW5kaW5nc0ZpbGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuR2xvYmFsS2V5YmluZGluZ3NGaWxlJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignb3Blbkdsb2JhbEtleWJpbmRpbmdzRmlsZScsIFwiT3BlbiBLZXlib2FyZCBTaG9ydGN1dHMgKEpTT04pXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdGljb246IHByZWZlcmVuY2VzT3BlblNldHRpbmdzSWNvbixcblx0XHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0XHR7IGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUgfSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SKSxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuTW9kYWxFZGl0b3JFZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SKSxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXBJZCA9IGdldEVkaXRvckdyb3VwRnJvbUFyZ3VtZW50cyhhY2Nlc3NvciwgYXJncyk/LmlkO1xuXHRcdFx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5HbG9iYWxLZXliaW5kaW5nU2V0dGluZ3ModHJ1ZSwgeyBncm91cElkIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9TSE9XX0RFRkFVTFRfS0VZQklORElOR1MsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Nob3dEZWZhdWx0S2V5YmluZGluZ3MnLCBcIlNob3cgU3lzdGVtIEtleWJpbmRpbmdzXCIpLFxuXHRcdFx0XHRcdG1lbnU6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SKSxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICcxX2tleWJvYXJkX3ByZWZlcmVuY2VzX2FjdGlvbnMnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRcdGNvbnN0IGdyb3VwID0gZ2V0RWRpdG9yR3JvdXBGcm9tQXJndW1lbnRzKGFjY2Vzc29yLCBhcmdzKTtcblx0XHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGdyb3VwPy5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFuZS5zZWFyY2goJ0Bzb3VyY2U6c3lzdGVtJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBLRVlCSU5ESU5HU19FRElUT1JfU0hPV19FWFRFTlNJT05fS0VZQklORElOR1MsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Nob3dFeHRlbnNpb25LZXliaW5kaW5ncycsIFwiU2hvdyBFeHRlbnNpb24gS2V5YmluZGluZ3NcIiksXG5cdFx0XHRcdFx0bWVudTogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IpLFxuXHRcdFx0XHRcdFx0XHRncm91cDogJzFfa2V5Ym9hcmRfcHJlZmVyZW5jZXNfYWN0aW9ucydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBnZXRFZGl0b3JHcm91cEZyb21Bcmd1bWVudHMoYWNjZXNzb3IsIGFyZ3MpO1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gZ3JvdXA/LmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLnNlYXJjaCgnQHNvdXJjZTpleHRlbnNpb24nKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9TSE9XX1VTRVJfS0VZQklORElOR1MsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Nob3dVc2VyS2V5YmluZGluZ3MnLCBcIlNob3cgVXNlciBLZXliaW5kaW5nc1wiKSxcblx0XHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiksXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnMV9rZXlib2FyZF9wcmVmZXJlbmNlc19hY3Rpb25zJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdFx0XHRjb25zdCBncm91cCA9IGdldEVkaXRvckdyb3VwRnJvbUFyZ3VtZW50cyhhY2Nlc3NvciwgYXJncyk7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBncm91cD8uYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBLZXliaW5kaW5nc0VkaXRvcikge1xuXHRcdFx0XHRcdGVkaXRvclBhbmUuc2VhcmNoKCdAc291cmNlOnVzZXInKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0NMRUFSX1NFQVJDSF9SRVNVTFRTLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NsZWFyJywgXCJDbGVhciBTZWFyY2ggUmVzdWx0c1wiKSxcblx0XHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiwgQ09OVEVYVF9LRVlCSU5ESU5HU19TRUFSQ0hfRk9DVVMsIENPTlRFWFRfS0VZQklORElOR1NfU0VBUkNIX0hBU19WQUxVRSksXG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLmNsZWFyU2VhcmNoUmVzdWx0cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9DTEVBUl9TRUFSQ0hfSElTVE9SWSxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdjbGVhckhpc3RvcnknLCBcIkNsZWFyIEtleWJvYXJkIFNob3J0Y3V0cyBTZWFyY2ggSGlzdG9yeVwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiksXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFuZS5jbGVhcktleWJvYXJkU2hvcnRjdXRTZWFyY2hIaXN0b3J5KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyS2V5YmluZGluZ0VkaXRvckFjdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJLZXliaW5kaW5nRWRpdG9yQWN0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0RFRklORSxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SLCBDT05URVhUX0tFWUJJTkRJTkdfRk9DVVMsIENPTlRFWFRfV0hFTl9GT0NVUy50b05lZ2F0ZWQoKSksXG5cdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLmRlZmluZUtleWJpbmRpbmcoZWRpdG9yUGFuZS5hY3RpdmVLZXliaW5kaW5nRW50cnkhLCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0FERCxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SLCBDT05URVhUX0tFWUJJTkRJTkdfRk9DVVMpLFxuXHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlBKSxcblx0XHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnczogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFuZS5kZWZpbmVLZXliaW5kaW5nKGVkaXRvclBhbmUuYWN0aXZlS2V5YmluZGluZ0VudHJ5ISwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0RFRklORV9XSEVOLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IsIENPTlRFWFRfS0VZQklORElOR19GT0NVUyksXG5cdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUUpLFxuXHRcdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IgJiYgZWRpdG9yUGFuZS5hY3RpdmVLZXliaW5kaW5nRW50cnkhLmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmcpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLmRlZmluZVdoZW5FeHByZXNzaW9uKGVkaXRvclBhbmUuYWN0aXZlS2V5YmluZGluZ0VudHJ5ISk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1JFTU9WRSxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SLCBDT05URVhUX0tFWUJJTkRJTkdfRk9DVVMsIElucHV0Rm9jdXNlZENvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRcdFx0cHJpbWFyeTogS2V5Q29kZS5EZWxldGUsXG5cdFx0XHRtYWM6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzcGFjZVxuXHRcdFx0fSxcblx0XHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnczogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFuZS5yZW1vdmVLZXliaW5kaW5nKGVkaXRvclBhbmUuYWN0aXZlS2V5YmluZGluZ0VudHJ5ISk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1JFU0VULFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IsIENPTlRFWFRfS0VZQklORElOR19GT0NVUyksXG5cdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLnJlc2V0S2V5YmluZGluZyhlZGl0b3JQYW5lLmFjdGl2ZUtleWJpbmRpbmdFbnRyeSEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRcdGlkOiBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9TRUFSQ0gsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiksXG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Rixcblx0XHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnczogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFuZS5mb2N1c1NlYXJjaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRcdGlkOiBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9SRUNPUkRfU0VBUkNIX0tFWVMsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiwgQ09OVEVYVF9LRVlCSU5ESU5HU19TRUFSQ0hfRk9DVVMpLFxuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5Syxcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUsgfSxcblx0XHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnczogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFuZS5yZWNvcmRTZWFyY2hLZXlzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1NPUlRCWV9QUkVDRURFTkNFLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IpLFxuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5UCxcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleVAgfSxcblx0XHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnczogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFuZS50b2dnbGVTb3J0QnlQcmVjZWRlbmNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1NIT1dfU0lNSUxBUixcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SLCBDT05URVhUX0tFWUJJTkRJTkdfRk9DVVMpLFxuXHRcdFx0cHJpbWFyeTogMCxcblx0XHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnczogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFuZS5zaG93U2ltaWxhcktleWJpbmRpbmdzKGVkaXRvclBhbmUuYWN0aXZlS2V5YmluZGluZ0VudHJ5ISk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0NPUFksXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiwgQ09OVEVYVF9LRVlCSU5ESU5HX0ZPQ1VTLCBDT05URVhUX1dIRU5fRk9DVVMubmVnYXRlKCkpLFxuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUMsXG5cdFx0XHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIGFyZ3M6IHVua25vd24pID0+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBLZXliaW5kaW5nc0VkaXRvcikge1xuXHRcdFx0XHRcdGF3YWl0IGVkaXRvclBhbmUuY29weUtleWJpbmRpbmcoZWRpdG9yUGFuZS5hY3RpdmVLZXliaW5kaW5nRW50cnkhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQ09QWV9DT01NQU5ELFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IsIENPTlRFWFRfS0VZQklORElOR19GT0NVUyksXG5cdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRhd2FpdCBlZGl0b3JQYW5lLmNvcHlLZXliaW5kaW5nQ29tbWFuZChlZGl0b3JQYW5lLmFjdGl2ZUtleWJpbmRpbmdFbnRyeSEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRcdGlkOiBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9DT1BZX0NPTU1BTkRfVElUTEUsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiwgQ09OVEVYVF9LRVlCSU5ESU5HX0ZPQ1VTKSxcblx0XHRcdHByaW1hcnk6IDAsXG5cdFx0XHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIGFyZ3M6IHVua25vd24pID0+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBLZXliaW5kaW5nc0VkaXRvcikge1xuXHRcdFx0XHRcdGF3YWl0IGVkaXRvclBhbmUuY29weUtleWJpbmRpbmdDb21tYW5kVGl0bGUoZWRpdG9yUGFuZS5hY3RpdmVLZXliaW5kaW5nRW50cnkhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfRk9DVVNfS0VZQklORElOR1MsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiwgQ09OVEVYVF9LRVlCSU5ESU5HU19TRUFSQ0hfRk9DVVMpLFxuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnczogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFuZS5mb2N1c0tleWJpbmRpbmdzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1JFSkVDVF9XSEVOLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IsIENPTlRFWFRfV0hFTl9GT0NVUywgU3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKSksXG5cdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgYXJnczogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFuZS5yZWplY3RXaGVuRXhwcmVzc2lvbihlZGl0b3JQYW5lLmFjdGl2ZUtleWJpbmRpbmdFbnRyeSEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRcdGlkOiBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9BQ0NFUFRfV0hFTixcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SLCBDT05URVhUX1dIRU5fRk9DVVMsIFN1Z2dlc3RDb250ZXh0LlZpc2libGUudG9OZWdhdGVkKCkpLFxuXHRcdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0XHRcdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgYXJnczogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFuZS5hY2NlcHRXaGVuRXhwcmVzc2lvbihlZGl0b3JQYW5lLmFjdGl2ZUtleWJpbmRpbmdFbnRyeSEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBwcm9maWxlU2NvcGVkQWN0aW9uRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyUHJvZmlsZVNjb3BlZEFjdGlvbnMgPSAoKSA9PiB7XG5cdFx0XHRwcm9maWxlU2NvcGVkQWN0aW9uRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHByb2ZpbGVTY29wZWRBY3Rpb25EaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIERlZmluZUtleWJpbmRpbmdBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0Y29uc3Qgd2hlbiA9IFJlc291cmNlQ29udGV4dEtleS5SZXNvdXJjZS5pc0VxdWFsVG8odGhhdC51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmtleWJpbmRpbmdzUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmRlZmluZUtleWJpbmRpbmcnLFxuXHRcdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2RlZmluZUtleWJpbmRpbmcuc3RhcnQnLCBcIkRlZmluZSBLZXliaW5kaW5nXCIpLFxuXHRcdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0XHRwcmVjb25kaXRpb246IHdoZW4sXG5cdFx0XHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdFx0XHR3aGVuLFxuXHRcdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRlbnQsXG5cdFx0XHRcdFx0XHRcdHdoZW4sXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRjb25zdCBjb2RlRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHRcdFx0XHRpZiAoaXNDb2RlRWRpdG9yKGNvZGVFZGl0b3IpKSB7XG5cdFx0XHRcdFx0XHRjb2RlRWRpdG9yLmdldENvbnRyaWJ1dGlvbjxJRGVmaW5lS2V5YmluZGluZ0VkaXRvckNvbnRyaWJ1dGlvbj4oREVGSU5FX0tFWUJJTkRJTkdfRURJVE9SX0NPTlRSSUJfSUQpPy5zaG93RGVmaW5lS2V5YmluZGluZ1dpZGdldCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH07XG5cblx0XHRyZWdpc3RlclByb2ZpbGVTY29wZWRBY3Rpb25zKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VycmVudFByb2ZpbGUoKCkgPT4gcmVnaXN0ZXJQcm9maWxlU2NvcGVkQWN0aW9ucygpKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVByZWZlcmVuY2VzRWRpdG9yTWVudUl0ZW0oKSB7XG5cdFx0Y29uc3QgY29tbWFuZElkID0gJ193b3JrYmVuY2gub3BlbldvcmtzcGFjZVNldHRpbmdzRWRpdG9yJztcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UgJiYgIUNvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChjb21tYW5kSWQpKSB7XG5cdFx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChjb21tYW5kSWQsICgpID0+IHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Xb3Jrc3BhY2VTZXR0aW5ncyh7IGpzb25FZGl0b3I6IGZhbHNlIH0pKTtcblx0XHRcdGNvbnN0IHdoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoUmVzb3VyY2VDb250ZXh0S2V5LlJlc291cmNlLmlzRXF1YWxUbyh0aGlzLnByZWZlcmVuY2VzU2VydmljZS53b3Jrc3BhY2VTZXR0aW5nc1Jlc291cmNlIS50b1N0cmluZygpKSwgV29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnd29ya3NwYWNlJyksIENvbnRleHRLZXlFeHByLm5vdCgnaXNJbkRpZmZFZGl0b3InKSk7XG5cdFx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlLCB7XG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRpZDogY29tbWFuZElkLFxuXHRcdFx0XHRcdHRpdGxlOiBPUEVOX1VTRVJfU0VUVElOR1NfVUlfVElUTEUsXG5cdFx0XHRcdFx0aWNvbjogcHJlZmVyZW5jZXNPcGVuU2V0dGluZ3NJY29uXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdoZW4sXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9KTtcblx0XHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTW9kYWxFZGl0b3JFZGl0b3JUaXRsZSwge1xuXHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0aWQ6IGNvbW1hbmRJZCxcblx0XHRcdFx0XHR0aXRsZTogT1BFTl9VU0VSX1NFVFRJTkdTX1VJX1RJVExFLFxuXHRcdFx0XHRcdGljb246IHByZWZlcmVuY2VzT3BlblNldHRpbmdzSWNvblxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3aGVuLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlUHJlZmVyZW5jZXNFZGl0b3JNZW51SXRlbUZvcldvcmtzcGFjZUZvbGRlcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUHJlZmVyZW5jZXNFZGl0b3JNZW51SXRlbUZvcldvcmtzcGFjZUZvbGRlcnMoKSB7XG5cdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzKSB7XG5cdFx0XHRjb25zdCBjb21tYW5kSWQgPSBgX3dvcmtiZW5jaC5vcGVuRm9sZGVyU2V0dGluZ3MuJHtmb2xkZXIudXJpLnRvU3RyaW5nKCl9YDtcblx0XHRcdGlmICghQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKGNvbW1hbmRJZCkpIHtcblx0XHRcdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoY29tbWFuZElkLCAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGdyb3VwSWQgPSBnZXRFZGl0b3JHcm91cEZyb21Bcmd1bWVudHMoYWNjZXNzb3IsIGFyZ3MpPy5pZDtcblx0XHRcdFx0XHRpZiAodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5GT0xERVIpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuV29ya3NwYWNlU2V0dGluZ3MoeyBqc29uRWRpdG9yOiBmYWxzZSwgZ3JvdXBJZCB9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Gb2xkZXJTZXR0aW5ncyh7IGZvbGRlclVyaTogZm9sZGVyLnVyaSwganNvbkVkaXRvcjogZmFsc2UsIGdyb3VwSWQgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3Qgd2hlbiA9IENvbnRleHRLZXlFeHByLmFuZChSZXNvdXJjZUNvbnRleHRLZXkuUmVzb3VyY2UuaXNFcXVhbFRvKHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLmdldEZvbGRlclNldHRpbmdzUmVzb3VyY2UoZm9sZGVyLnVyaSkhLnRvU3RyaW5nKCkpLCBDb250ZXh0S2V5RXhwci5ub3QoJ2lzSW5EaWZmRWRpdG9yJykpO1xuXHRcdFx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlLCB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IGNvbW1hbmRJZCxcblx0XHRcdFx0XHRcdHRpdGxlOiBPUEVOX1VTRVJfU0VUVElOR1NfVUlfVElUTEUsXG5cdFx0XHRcdFx0XHRpY29uOiBwcmVmZXJlbmNlc09wZW5TZXR0aW5nc0ljb25cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHdoZW4sXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Nb2RhbEVkaXRvckVkaXRvclRpdGxlLCB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IGNvbW1hbmRJZCxcblx0XHRcdFx0XHRcdHRpdGxlOiBPUEVOX1VTRVJfU0VUVElOR1NfVUlfVElUTEUsXG5cdFx0XHRcdFx0XHRpY29uOiBwcmVmZXJlbmNlc09wZW5TZXR0aW5nc0ljb25cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHdoZW4sXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgU2V0dGluZ3NFZGl0b3JUaXRsZUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuc2V0dGluZ3NFZGl0b3JUaXRsZUJhckFjdGlvbnMnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVnaXN0ZXJTZXR0aW5nc0VkaXRvclRpdGxlQWN0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNldHRpbmdzRWRpdG9yVGl0bGVBY3Rpb25zKCkge1xuXHRcdGNvbnN0IHJlZ2lzdGVyT3BlblVzZXJTZXR0aW5nc0VkaXRvckZyb21Kc29uQWN0aW9uRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJPcGVuVXNlclNldHRpbmdzRWRpdG9yRnJvbUpzb25BY3Rpb24gPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBvcGVuVXNlclNldHRpbmdzRWRpdG9yV2hlbiA9IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q09OVEVYVF9TRVRUSU5HU19FRElUT1IudG9OZWdhdGVkKCksXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFJlc291cmNlQ29udGV4dEtleS5SZXNvdXJjZS5pc0VxdWFsVG8odGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0UmVzb3VyY2VDb250ZXh0S2V5LlJlc291cmNlLmlzRXF1YWxUbyh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UudG9TdHJpbmcoKSkpLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5ub3QoJ2lzSW5EaWZmRWRpdG9yJykpO1xuXHRcdFx0cmVnaXN0ZXJPcGVuVXNlclNldHRpbmdzRWRpdG9yRnJvbUpzb25BY3Rpb25EaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0cmVnaXN0ZXJPcGVuVXNlclNldHRpbmdzRWRpdG9yRnJvbUpzb25BY3Rpb25EaXNwb3NhYmxlcy52YWx1ZSA9IHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRpZDogJ193b3JrYmVuY2gub3BlblVzZXJTZXR0aW5nc0VkaXRvcicsXG5cdFx0XHRcdFx0XHR0aXRsZTogT1BFTl9VU0VSX1NFVFRJTkdTX1VJX1RJVExFLFxuXHRcdFx0XHRcdFx0aWNvbjogcHJlZmVyZW5jZXNPcGVuU2V0dGluZ3NJY29uLFxuXHRcdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRcdFx0d2hlbjogb3BlblVzZXJTZXR0aW5nc0VkaXRvcldoZW4sXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuTW9kYWxFZGl0b3JFZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRcdFx0d2hlbjogb3BlblVzZXJTZXR0aW5nc0VkaXRvcldoZW4sXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2FuaXRpemVkQXJncyA9IHNhbml0aXplT3BlblNldHRpbmdzQXJncyhhcmdzWzBdKTtcblx0XHRcdFx0XHRjb25zdCBncm91cElkID0gZ2V0RWRpdG9yR3JvdXBGcm9tQXJndW1lbnRzKGFjY2Vzc29yLCBhcmdzKT8uaWQ7XG5cdFx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKS5vcGVuVXNlclNldHRpbmdzKHsganNvbkVkaXRvcjogZmFsc2UsIC4uLnNhbml0aXplZEFyZ3MsIGdyb3VwSWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRyZWdpc3Rlck9wZW5Vc2VyU2V0dGluZ3NFZGl0b3JGcm9tSnNvbkFjdGlvbigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlKCgpID0+IHtcblx0XHRcdC8vIEZvcmNlIHRoZSBhY3Rpb24gdG8gY2hlY2sgdGhlIGNvbnRleHQgYWdhaW4uXG5cdFx0XHRyZWdpc3Rlck9wZW5Vc2VyU2V0dGluZ3NFZGl0b3JGcm9tSnNvbkFjdGlvbigpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG9wZW5TZXR0aW5nc0pzb25XaGVuID0gQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU0VUVElOR1NfSlNPTl9FRElUT1IudG9OZWdhdGVkKCksIENPTlRFWFRfU0VUVElOR1NfRURJVE9SKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX1NXSVRDSF9UT19KU09OLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdvcGVuU2V0dGluZ3NKc29uJywgXCJPcGVuIFNldHRpbmdzIChKU09OKVwiKSxcblx0XHRcdFx0XHRpY29uOiBwcmVmZXJlbmNlc09wZW5TZXR0aW5nc0ljb24sXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBvcGVuU2V0dGluZ3NKc29uV2hlbixcblx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuTW9kYWxFZGl0b3JFZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRcdHdoZW46IG9wZW5TZXR0aW5nc0pzb25XaGVuLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdFx0XHRjb25zdCBncm91cCA9IGdldEVkaXRvckdyb3VwRnJvbUFyZ3VtZW50cyhhY2Nlc3NvciwgYXJncyk7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBncm91cD8uYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBTZXR0aW5nc0VkaXRvcjIpIHtcblx0XHRcdFx0XHRyZXR1cm4gZWRpdG9yUGFuZS5zd2l0Y2hUb1NldHRpbmdzRmlsZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5jbGFzcyBTZXR0aW5nc0VkaXRvckNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICdlZGl0b3IuY29udHJpYi5zZXR0aW5ncyc7XG5cblx0cHJpdmF0ZSBjdXJyZW50UmVuZGVyZXI6IElQcmVmZXJlbmNlc1JlbmRlcmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jcmVhdGVQcmVmZXJlbmNlc1JlbmRlcmVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbChlID0+IHRoaXMuX2NyZWF0ZVByZWZlcmVuY2VzUmVuZGVyZXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZSgoKSA9PiB0aGlzLl9jcmVhdGVQcmVmZXJlbmNlc1JlbmRlcmVyKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVByZWZlcmVuY2VzUmVuZGVyZXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuY3VycmVudFJlbmRlcmVyID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChtb2RlbCAmJiAvXFwuKGpzb258Y29kZS13b3Jrc3BhY2UpJC8udGVzdChtb2RlbC51cmkucGF0aCkpIHtcblx0XHRcdC8vIEZhc3QgY2hlY2s6IHRoZSBwcmVmZXJlbmNlcyByZW5kZXJlciBjYW4gb25seSBhcHBlYXJcblx0XHRcdC8vIGluIHNldHRpbmdzIGZpbGVzIG9yIHdvcmtzcGFjZSBmaWxlc1xuXHRcdFx0Y29uc3Qgc2V0dGluZ3NNb2RlbCA9IGF3YWl0IHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLmNyZWF0ZVByZWZlcmVuY2VzRWRpdG9yTW9kZWwobW9kZWwudXJpKTtcblx0XHRcdGlmIChzZXR0aW5nc01vZGVsIGluc3RhbmNlb2YgU2V0dGluZ3NFZGl0b3JNb2RlbCAmJiB0aGlzLmVkaXRvci5nZXRNb2RlbCgpKSB7XG5cdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHNldHRpbmdzTW9kZWwpO1xuXHRcdFx0XHRzd2l0Y2ggKHNldHRpbmdzTW9kZWwuY29uZmlndXJhdGlvblRhcmdldCkge1xuXHRcdFx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U6XG5cdFx0XHRcdFx0XHR0aGlzLmN1cnJlbnRSZW5kZXJlciA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya3NwYWNlU2V0dGluZ3NSZW5kZXJlciwgdGhpcy5lZGl0b3IsIHNldHRpbmdzTW9kZWwpKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHR0aGlzLmN1cnJlbnRSZW5kZXJlciA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlclNldHRpbmdzUmVuZGVyZXIsIHRoaXMuZWRpdG9yLCBzZXR0aW5nc01vZGVsKSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmN1cnJlbnRSZW5kZXJlcj8ucmVuZGVyKCk7XG5cdFx0fVxuXHR9XG59XG5cblxuZnVuY3Rpb24gZ2V0RWRpdG9yR3JvdXBGcm9tQXJndW1lbnRzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiB1bmtub3duW10pOiBJRWRpdG9yR3JvdXAgfCB1bmRlZmluZWQge1xuXHRjb25zdCBjb250ZXh0ID0gcmVzb2x2ZUNvbW1hbmRzQ29udGV4dChhcmdzLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSk7XG5cdHJldHVybiBjb250ZXh0Lmdyb3VwZWRFZGl0b3JzWzBdPy5ncm91cDtcbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFByZWZlcmVuY2VzQWN0aW9uc0NvbnRyaWJ1dGlvbi5JRCwgUHJlZmVyZW5jZXNBY3Rpb25zQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFByZWZlcmVuY2VzQ29udHJpYnV0aW9uLklELCBQcmVmZXJlbmNlc0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihTZXR0aW5nc0VkaXRvclRpdGxlQ29udHJpYnV0aW9uLklELCBTZXR0aW5nc0VkaXRvclRpdGxlQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcblxucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oU2V0dGluZ3NFZGl0b3JDb250cmlidXRpb24uSUQsIFNldHRpbmdzRWRpdG9yQ29udHJpYnV0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkFmdGVyRmlyc3RSZW5kZXIpO1xuXG4vLyBQcmVmZXJlbmNlcyBtZW51XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVByZWZlcmVuY2VzJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUHJlZmVyZW5jZXNcIiksXG5cdHN1Ym1lbnU6IE1lbnVJZC5NZW51YmFyUHJlZmVyZW5jZXNNZW51LFxuXHRncm91cDogJzVfYXV0b3NhdmUnLFxuXHRvcmRlcjogMixcblx0d2hlbjogSXNNYWNOYXRpdmVDb250ZXh0LnRvTmVnYXRlZCgpIC8vIG9uIG1hY09TIG5hdGl2ZSB0aGUgcHJlZmVyZW5jZXMgbWVudSBpcyBzZXBhcmF0ZSB1bmRlciB0aGUgYXBwbGljYXRpb24gbWVudVxu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
