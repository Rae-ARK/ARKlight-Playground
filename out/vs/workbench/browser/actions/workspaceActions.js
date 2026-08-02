import { localize, localize2 } from "../../../nls.js";
import { IWorkspaceContextService, WorkbenchState, hasWorkspaceFileExtension } from "../../../platform/workspace/common/workspace.js";
import { IWorkspaceEditingService } from "../../services/workspaces/common/workspaceEditing.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { ICommandService } from "../../../platform/commands/common/commands.js";
import { ADD_ROOT_FOLDER_COMMAND_ID, ADD_ROOT_FOLDER_LABEL, PICK_WORKSPACE_FOLDER_COMMAND_ID, SET_ROOT_FOLDER_COMMAND_ID } from "./workspaceCommands.js";
import { IFileDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { MenuRegistry, MenuId, Action2, registerAction2 } from "../../../platform/actions/common/actions.js";
import { EmptyWorkspaceSupportContext, EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext, OpenFolderWorkspaceSupportContext, WorkbenchStateContext, WorkspaceFolderCountContext } from "../../common/contextkeys.js";
import { IHostService } from "../../services/host/browser/host.js";
import { KeyChord, KeyCode, KeyMod } from "../../../base/common/keyCodes.js";
import { ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { IWorkspacesService } from "../../../platform/workspaces/common/workspaces.js";
import { KeybindingWeight } from "../../../platform/keybinding/common/keybindingsRegistry.js";
import { IsMacNativeContext } from "../../../platform/contextkey/common/contextkeys.js";
import { Categories } from "../../../platform/action/common/actionCommonCategories.js";
const workspacesCategory = localize2("workspaces", "Workspaces");
const _OpenFileAction = class _OpenFileAction extends Action2 {
  constructor() {
    super({
      id: _OpenFileAction.ID,
      title: localize2("openFile", "Open File..."),
      category: Categories.File,
      f1: true,
      keybinding: {
        when: IsMacNativeContext.toNegated(),
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyO
      }
    });
  }
  async run(accessor, data) {
    const fileDialogService = accessor.get(IFileDialogService);
    return fileDialogService.pickFileAndOpen({ forceNewWindow: false, telemetryExtraData: data });
  }
};
_OpenFileAction.ID = "workbench.action.files.openFile";
let OpenFileAction = _OpenFileAction;
const _OpenFolderAction = class _OpenFolderAction extends Action2 {
  constructor() {
    super({
      id: _OpenFolderAction.ID,
      title: localize2("openFolder", "Open Folder..."),
      category: Categories.File,
      f1: true,
      precondition: OpenFolderWorkspaceSupportContext,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: void 0,
        linux: {
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyO)
        },
        win: {
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyO)
        }
      }
    });
  }
  async run(accessor, data) {
    const fileDialogService = accessor.get(IFileDialogService);
    return fileDialogService.pickFolderAndOpen({ forceNewWindow: false, telemetryExtraData: data });
  }
};
_OpenFolderAction.ID = "workbench.action.files.openFolder";
let OpenFolderAction = _OpenFolderAction;
const _OpenFolderViaWorkspaceAction = class _OpenFolderViaWorkspaceAction extends Action2 {
  constructor() {
    super({
      id: _OpenFolderViaWorkspaceAction.ID,
      title: localize2("openFolder", "Open Folder..."),
      category: Categories.File,
      f1: true,
      precondition: ContextKeyExpr.and(OpenFolderWorkspaceSupportContext.toNegated(), WorkbenchStateContext.isEqualTo("workspace")),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyO
      }
    });
  }
  run(accessor) {
    const commandService = accessor.get(ICommandService);
    return commandService.executeCommand(SET_ROOT_FOLDER_COMMAND_ID);
  }
};
// This action swaps the folders of a workspace with
// the selected folder and is a workaround for providing
// "Open Folder..." in environments that do not support
// this without having a workspace open (e.g. web serverless)
_OpenFolderViaWorkspaceAction.ID = "workbench.action.files.openFolderViaWorkspace";
let OpenFolderViaWorkspaceAction = _OpenFolderViaWorkspaceAction;
const _OpenFileFolderAction = class _OpenFileFolderAction extends Action2 {
  constructor() {
    super({
      id: _OpenFileFolderAction.ID,
      title: _OpenFileFolderAction.LABEL,
      category: Categories.File,
      f1: true,
      precondition: ContextKeyExpr.and(IsMacNativeContext, OpenFolderWorkspaceSupportContext),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyO
      }
    });
  }
  async run(accessor, data) {
    const fileDialogService = accessor.get(IFileDialogService);
    return fileDialogService.pickFileFolderAndOpen({ forceNewWindow: false, telemetryExtraData: data });
  }
};
_OpenFileFolderAction.ID = "workbench.action.files.openFileFolder";
_OpenFileFolderAction.LABEL = localize2("openFileFolder", "Open...");
let OpenFileFolderAction = _OpenFileFolderAction;
const _OpenWorkspaceAction = class _OpenWorkspaceAction extends Action2 {
  constructor() {
    super({
      id: _OpenWorkspaceAction.ID,
      title: localize2("openWorkspaceAction", "Open Workspace from File..."),
      category: Categories.File,
      f1: true,
      precondition: EnterMultiRootWorkspaceSupportContext
    });
  }
  async run(accessor, data) {
    const fileDialogService = accessor.get(IFileDialogService);
    return fileDialogService.pickWorkspaceAndOpen({ telemetryExtraData: data });
  }
};
_OpenWorkspaceAction.ID = "workbench.action.openWorkspace";
let OpenWorkspaceAction = _OpenWorkspaceAction;
const _CloseWorkspaceAction = class _CloseWorkspaceAction extends Action2 {
  constructor() {
    super({
      id: _CloseWorkspaceAction.ID,
      title: localize2("closeWorkspace", "Close Workspace"),
      category: workspacesCategory,
      f1: true,
      precondition: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("empty"), EmptyWorkspaceSupportContext, IsSessionsWindowContext.negate()),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyF)
      }
    });
  }
  async run(accessor) {
    const hostService = accessor.get(IHostService);
    const environmentService = accessor.get(IWorkbenchEnvironmentService);
    return hostService.openWindow({ forceReuseWindow: true, remoteAuthority: environmentService.remoteAuthority });
  }
};
_CloseWorkspaceAction.ID = "workbench.action.closeFolder";
let CloseWorkspaceAction = _CloseWorkspaceAction;
const _OpenWorkspaceConfigFileAction = class _OpenWorkspaceConfigFileAction extends Action2 {
  constructor() {
    super({
      id: _OpenWorkspaceConfigFileAction.ID,
      title: localize2("openWorkspaceConfigFile", "Open Workspace Configuration File"),
      category: workspacesCategory,
      f1: true,
      precondition: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("workspace"), IsSessionsWindowContext.negate())
    });
  }
  async run(accessor) {
    const contextService = accessor.get(IWorkspaceContextService);
    const editorService = accessor.get(IEditorService);
    const configuration = contextService.getWorkspace().configuration;
    if (configuration) {
      await editorService.openEditor({ resource: configuration, options: { pinned: true } });
    }
  }
};
_OpenWorkspaceConfigFileAction.ID = "workbench.action.openWorkspaceConfigFile";
let OpenWorkspaceConfigFileAction = _OpenWorkspaceConfigFileAction;
const _AddRootFolderAction = class _AddRootFolderAction extends Action2 {
  constructor() {
    super({
      id: _AddRootFolderAction.ID,
      title: ADD_ROOT_FOLDER_LABEL,
      category: workspacesCategory,
      f1: true,
      precondition: ContextKeyExpr.and(ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo("workspace")), IsSessionsWindowContext.negate())
    });
  }
  run(accessor) {
    const commandService = accessor.get(ICommandService);
    return commandService.executeCommand(ADD_ROOT_FOLDER_COMMAND_ID);
  }
};
_AddRootFolderAction.ID = "workbench.action.addRootFolder";
let AddRootFolderAction = _AddRootFolderAction;
const _RemoveRootFolderAction = class _RemoveRootFolderAction extends Action2 {
  constructor() {
    super({
      id: _RemoveRootFolderAction.ID,
      title: localize2("globalRemoveFolderFromWorkspace", "Remove Folder from Workspace..."),
      category: workspacesCategory,
      f1: true,
      precondition: ContextKeyExpr.and(WorkspaceFolderCountContext.notEqualsTo("0"), ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo("workspace")), IsSessionsWindowContext.negate())
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    const workspaceEditingService = accessor.get(IWorkspaceEditingService);
    const folder = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
    if (folder) {
      await workspaceEditingService.removeFolders([folder.uri]);
    }
  }
};
_RemoveRootFolderAction.ID = "workbench.action.removeRootFolder";
let RemoveRootFolderAction = _RemoveRootFolderAction;
const _SaveWorkspaceAsAction = class _SaveWorkspaceAsAction extends Action2 {
  constructor() {
    super({
      id: _SaveWorkspaceAsAction.ID,
      title: localize2("saveWorkspaceAsAction", "Save Workspace As..."),
      category: workspacesCategory,
      f1: true,
      precondition: ContextKeyExpr.and(EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext.negate())
    });
  }
  async run(accessor) {
    const workspaceEditingService = accessor.get(IWorkspaceEditingService);
    const contextService = accessor.get(IWorkspaceContextService);
    const configPathUri = await workspaceEditingService.pickNewWorkspacePath();
    if (configPathUri && hasWorkspaceFileExtension(configPathUri)) {
      switch (contextService.getWorkbenchState()) {
        case WorkbenchState.EMPTY:
        case WorkbenchState.FOLDER: {
          const folders = contextService.getWorkspace().folders.map((folder) => ({ uri: folder.uri }));
          return workspaceEditingService.createAndEnterWorkspace(folders, configPathUri);
        }
        case WorkbenchState.WORKSPACE:
          return workspaceEditingService.saveAndEnterWorkspace(configPathUri);
      }
    }
  }
};
_SaveWorkspaceAsAction.ID = "workbench.action.saveWorkspaceAs";
let SaveWorkspaceAsAction = _SaveWorkspaceAsAction;
const _DuplicateWorkspaceInNewWindowAction = class _DuplicateWorkspaceInNewWindowAction extends Action2 {
  constructor() {
    super({
      id: _DuplicateWorkspaceInNewWindowAction.ID,
      title: localize2("duplicateWorkspaceInNewWindow", "Duplicate As Workspace in New Window"),
      category: workspacesCategory,
      f1: true,
      precondition: ContextKeyExpr.and(EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext.negate())
    });
  }
  async run(accessor) {
    const workspaceContextService = accessor.get(IWorkspaceContextService);
    const workspaceEditingService = accessor.get(IWorkspaceEditingService);
    const hostService = accessor.get(IHostService);
    const workspacesService = accessor.get(IWorkspacesService);
    const environmentService = accessor.get(IWorkbenchEnvironmentService);
    const folders = workspaceContextService.getWorkspace().folders;
    const remoteAuthority = environmentService.remoteAuthority;
    const newWorkspace = await workspacesService.createUntitledWorkspace(folders, remoteAuthority);
    await workspaceEditingService.copyWorkspaceSettings(newWorkspace);
    return hostService.openWindow([{ workspaceUri: newWorkspace.configPath }], { forceNewWindow: true, remoteAuthority });
  }
};
_DuplicateWorkspaceInNewWindowAction.ID = "workbench.action.duplicateWorkspaceInNewWindow";
let DuplicateWorkspaceInNewWindowAction = _DuplicateWorkspaceInNewWindowAction;
registerAction2(AddRootFolderAction);
registerAction2(RemoveRootFolderAction);
registerAction2(OpenFileAction);
registerAction2(OpenFolderAction);
registerAction2(OpenFolderViaWorkspaceAction);
registerAction2(OpenFileFolderAction);
registerAction2(OpenWorkspaceAction);
registerAction2(OpenWorkspaceConfigFileAction);
registerAction2(CloseWorkspaceAction);
registerAction2(SaveWorkspaceAsAction);
registerAction2(DuplicateWorkspaceInNewWindowAction);
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "2_open",
  command: {
    id: OpenFileAction.ID,
    title: localize({ key: "miOpenFile", comment: ["&& denotes a mnemonic"] }, "&&Open File...")
  },
  order: 1,
  when: IsMacNativeContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "2_open",
  command: {
    id: OpenFolderAction.ID,
    title: localize({ key: "miOpenFolder", comment: ["&& denotes a mnemonic"] }, "Open &&Folder...")
  },
  order: 2,
  when: OpenFolderWorkspaceSupportContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "2_open",
  command: {
    id: OpenFolderViaWorkspaceAction.ID,
    title: localize({ key: "miOpenFolder", comment: ["&& denotes a mnemonic"] }, "Open &&Folder...")
  },
  order: 2,
  when: ContextKeyExpr.and(OpenFolderWorkspaceSupportContext.toNegated(), WorkbenchStateContext.isEqualTo("workspace"))
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "2_open",
  command: {
    id: OpenFileFolderAction.ID,
    title: localize({ key: "miOpen", comment: ["&& denotes a mnemonic"] }, "&&Open...")
  },
  order: 1,
  when: ContextKeyExpr.and(IsMacNativeContext, OpenFolderWorkspaceSupportContext)
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "2_open",
  command: {
    id: OpenWorkspaceAction.ID,
    title: localize({ key: "miOpenWorkspace", comment: ["&& denotes a mnemonic"] }, "Open Wor&&kspace from File...")
  },
  order: 3,
  when: EnterMultiRootWorkspaceSupportContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "3_workspace",
  command: {
    id: ADD_ROOT_FOLDER_COMMAND_ID,
    title: localize({ key: "miAddFolderToWorkspace", comment: ["&& denotes a mnemonic"] }, "A&&dd Folder to Workspace...")
  },
  when: ContextKeyExpr.and(ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo("workspace")), IsSessionsWindowContext.negate()),
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "3_workspace",
  command: {
    id: SaveWorkspaceAsAction.ID,
    title: localize("miSaveWorkspaceAs", "Save Workspace As...")
  },
  order: 2,
  when: ContextKeyExpr.and(EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "3_workspace",
  command: {
    id: DuplicateWorkspaceInNewWindowAction.ID,
    title: localize("duplicateWorkspace", "Duplicate Workspace")
  },
  order: 3,
  when: ContextKeyExpr.and(EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "6_close",
  command: {
    id: CloseWorkspaceAction.ID,
    title: localize({ key: "miCloseFolder", comment: ["&& denotes a mnemonic"] }, "Close &&Folder")
  },
  order: 3,
  when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("folder"), EmptyWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "6_close",
  command: {
    id: CloseWorkspaceAction.ID,
    title: localize({ key: "miCloseWorkspace", comment: ["&& denotes a mnemonic"] }, "Close &&Workspace")
  },
  order: 3,
  when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("workspace"), EmptyWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
export {
  AddRootFolderAction,
  OpenFileAction,
  OpenFileFolderAction,
  OpenFolderAction,
  OpenFolderViaWorkspaceAction,
  RemoveRootFolderAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL2FjdGlvbnMvd29ya3NwYWNlQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeURhdGEgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFdvcmtiZW5jaFN0YXRlLCBJV29ya3NwYWNlRm9sZGVyLCBoYXNXb3Jrc3BhY2VGaWxlRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlRWRpdGluZy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQUREX1JPT1RfRk9MREVSX0NPTU1BTkRfSUQsIEFERF9ST09UX0ZPTERFUl9MQUJFTCwgUElDS19XT1JLU1BBQ0VfRk9MREVSX0NPTU1BTkRfSUQsIFNFVF9ST09UX0ZPTERFUl9DT01NQU5EX0lEIH0gZnJvbSAnLi93b3Jrc3BhY2VDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IE1lbnVSZWdpc3RyeSwgTWVudUlkLCBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtcHR5V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIEVudGVyTXVsdGlSb290V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBPcGVuRm9sZGVyV29ya3NwYWNlU3VwcG9ydENvbnRleHQsIFdvcmtiZW5jaFN0YXRlQ29udGV4dCwgV29ya3NwYWNlRm9sZGVyQ291bnRDb250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJc01hY05hdGl2ZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5cbmNvbnN0IHdvcmtzcGFjZXNDYXRlZ29yeTogSUxvY2FsaXplZFN0cmluZyA9IGxvY2FsaXplMignd29ya3NwYWNlcycsICdXb3Jrc3BhY2VzJyk7XG5cbmV4cG9ydCBjbGFzcyBPcGVuRmlsZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLm9wZW5GaWxlJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlbkZpbGVBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuRmlsZScsICdPcGVuIEZpbGUuLi4nKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGUsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogSXNNYWNOYXRpdmVDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleU9cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZGF0YT86IElUZWxlbWV0cnlEYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZmlsZURpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVEaWFsb2dTZXJ2aWNlKTtcblxuXHRcdHJldHVybiBmaWxlRGlhbG9nU2VydmljZS5waWNrRmlsZUFuZE9wZW4oeyBmb3JjZU5ld1dpbmRvdzogZmFsc2UsIHRlbGVtZXRyeUV4dHJhRGF0YTogZGF0YSB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3BlbkZvbGRlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLm9wZW5Gb2xkZXInO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPcGVuRm9sZGVyQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkZvbGRlcicsICdPcGVuIEZvbGRlci4uLicpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRmlsZSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBPcGVuRm9sZGVyV29ya3NwYWNlU3VwcG9ydENvbnRleHQsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiB1bmRlZmluZWQsXG5cdFx0XHRcdGxpbnV4OiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlPKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3aW46IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleU8pXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZGF0YT86IElUZWxlbWV0cnlEYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZmlsZURpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVEaWFsb2dTZXJ2aWNlKTtcblxuXHRcdHJldHVybiBmaWxlRGlhbG9nU2VydmljZS5waWNrRm9sZGVyQW5kT3Blbih7IGZvcmNlTmV3V2luZG93OiBmYWxzZSwgdGVsZW1ldHJ5RXh0cmFEYXRhOiBkYXRhIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuRm9sZGVyVmlhV29ya3NwYWNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Ly8gVGhpcyBhY3Rpb24gc3dhcHMgdGhlIGZvbGRlcnMgb2YgYSB3b3Jrc3BhY2Ugd2l0aFxuXHQvLyB0aGUgc2VsZWN0ZWQgZm9sZGVyIGFuZCBpcyBhIHdvcmthcm91bmQgZm9yIHByb3ZpZGluZ1xuXHQvLyBcIk9wZW4gRm9sZGVyLi4uXCIgaW4gZW52aXJvbm1lbnRzIHRoYXQgZG8gbm90IHN1cHBvcnRcblx0Ly8gdGhpcyB3aXRob3V0IGhhdmluZyBhIHdvcmtzcGFjZSBvcGVuIChlLmcuIHdlYiBzZXJ2ZXJsZXNzKVxuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLm9wZW5Gb2xkZXJWaWFXb3Jrc3BhY2UnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPcGVuRm9sZGVyVmlhV29ya3NwYWNlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkZvbGRlcicsICdPcGVuIEZvbGRlci4uLicpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRmlsZSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoT3BlbkZvbGRlcldvcmtzcGFjZVN1cHBvcnRDb250ZXh0LnRvTmVnYXRlZCgpLCBXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKSksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5T1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdHJldHVybiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChTRVRfUk9PVF9GT0xERVJfQ09NTUFORF9JRCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5GaWxlRm9sZGVyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMub3BlbkZpbGVGb2xkZXInO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUw6IElMb2NhbGl6ZWRTdHJpbmcgPSBsb2NhbGl6ZTIoJ29wZW5GaWxlRm9sZGVyJywgJ09wZW4uLi4nKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlbkZpbGVGb2xkZXJBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogT3BlbkZpbGVGb2xkZXJBY3Rpb24uTEFCRUwsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChJc01hY05hdGl2ZUNvbnRleHQsIE9wZW5Gb2xkZXJXb3Jrc3BhY2VTdXBwb3J0Q29udGV4dCksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5T1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBkYXRhPzogSVRlbGVtZXRyeURhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmaWxlRGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZURpYWxvZ1NlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIGZpbGVEaWFsb2dTZXJ2aWNlLnBpY2tGaWxlRm9sZGVyQW5kT3Blbih7IGZvcmNlTmV3V2luZG93OiBmYWxzZSwgdGVsZW1ldHJ5RXh0cmFEYXRhOiBkYXRhIH0pO1xuXHR9XG59XG5cbmNsYXNzIE9wZW5Xb3Jrc3BhY2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5vcGVuV29ya3NwYWNlJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlbldvcmtzcGFjZUFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5Xb3Jrc3BhY2VBY3Rpb24nLCAnT3BlbiBXb3Jrc3BhY2UgZnJvbSBGaWxlLi4uJyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IEVudGVyTXVsdGlSb290V29ya3NwYWNlU3VwcG9ydENvbnRleHRcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZGF0YT86IElUZWxlbWV0cnlEYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZmlsZURpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVEaWFsb2dTZXJ2aWNlKTtcblxuXHRcdHJldHVybiBmaWxlRGlhbG9nU2VydmljZS5waWNrV29ya3NwYWNlQW5kT3Blbih7IHRlbGVtZXRyeUV4dHJhRGF0YTogZGF0YSB9KTtcblx0fVxufVxuXG5jbGFzcyBDbG9zZVdvcmtzcGFjZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlRm9sZGVyJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ2xvc2VXb3Jrc3BhY2VBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjbG9zZVdvcmtzcGFjZScsICdDbG9zZSBXb3Jrc3BhY2UnKSxcblx0XHRcdGNhdGVnb3J5OiB3b3Jrc3BhY2VzQ2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFdvcmtiZW5jaFN0YXRlQ29udGV4dC5ub3RFcXVhbHNUbygnZW1wdHknKSwgRW1wdHlXb3Jrc3BhY2VTdXBwb3J0Q29udGV4dCwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5Rilcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIGhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coeyBmb3JjZVJldXNlV2luZG93OiB0cnVlLCByZW1vdGVBdXRob3JpdHk6IGVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgfSk7XG5cdH1cbn1cblxuY2xhc3MgT3BlbldvcmtzcGFjZUNvbmZpZ0ZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5vcGVuV29ya3NwYWNlQ29uZmlnRmlsZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5Xb3Jrc3BhY2VDb25maWdGaWxlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbldvcmtzcGFjZUNvbmZpZ0ZpbGUnLCAnT3BlbiBXb3Jrc3BhY2UgQ29uZmlndXJhdGlvbiBGaWxlJyksXG5cdFx0XHRjYXRlZ29yeTogd29ya3NwYWNlc0NhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZXh0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IGNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmNvbmZpZ3VyYXRpb247XG5cdFx0aWYgKGNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBjb25maWd1cmF0aW9uLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0pO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWRkUm9vdEZvbGRlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmFkZFJvb3RGb2xkZXInO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBZGRSb290Rm9sZGVyQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IEFERF9ST09UX0ZPTERFUl9MQUJFTCxcblx0XHRcdGNhdGVnb3J5OiB3b3Jrc3BhY2VzQ2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm9yKEVudGVyTXVsdGlSb290V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIFdvcmtiZW5jaFN0YXRlQ29udGV4dC5pc0VxdWFsVG8oJ3dvcmtzcGFjZScpKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFERF9ST09UX0ZPTERFUl9DT01NQU5EX0lEKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVtb3ZlUm9vdEZvbGRlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLnJlbW92ZVJvb3RGb2xkZXInO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBSZW1vdmVSb290Rm9sZGVyQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZ2xvYmFsUmVtb3ZlRm9sZGVyRnJvbVdvcmtzcGFjZScsICdSZW1vdmUgRm9sZGVyIGZyb20gV29ya3NwYWNlLi4uJyksXG5cdFx0XHRjYXRlZ29yeTogd29ya3NwYWNlc0NhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChXb3Jrc3BhY2VGb2xkZXJDb3VudENvbnRleHQubm90RXF1YWxzVG8oJzAnKSwgQ29udGV4dEtleUV4cHIub3IoRW50ZXJNdWx0aVJvb3RXb3Jrc3BhY2VTdXBwb3J0Q29udGV4dCwgV29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnd29ya3NwYWNlJykpLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSlcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRWRpdGluZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGZvbGRlciA9IGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPElXb3Jrc3BhY2VGb2xkZXI+KFBJQ0tfV09SS1NQQUNFX0ZPTERFUl9DT01NQU5EX0lEKTtcblx0XHRpZiAoZm9sZGVyKSB7XG5cdFx0XHRhd2FpdCB3b3Jrc3BhY2VFZGl0aW5nU2VydmljZS5yZW1vdmVGb2xkZXJzKFtmb2xkZXIudXJpXSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFNhdmVXb3Jrc3BhY2VBc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLnNhdmVXb3Jrc3BhY2VBcyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNhdmVXb3Jrc3BhY2VBc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NhdmVXb3Jrc3BhY2VBc0FjdGlvbicsICdTYXZlIFdvcmtzcGFjZSBBcy4uLicpLFxuXHRcdFx0Y2F0ZWdvcnk6IHdvcmtzcGFjZXNDYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoRW50ZXJNdWx0aVJvb3RXb3Jrc3BhY2VTdXBwb3J0Q29udGV4dCwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VFZGl0aW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cblx0XHRjb25zdCBjb25maWdQYXRoVXJpID0gYXdhaXQgd29ya3NwYWNlRWRpdGluZ1NlcnZpY2UucGlja05ld1dvcmtzcGFjZVBhdGgoKTtcblx0XHRpZiAoY29uZmlnUGF0aFVyaSAmJiBoYXNXb3Jrc3BhY2VGaWxlRXh0ZW5zaW9uKGNvbmZpZ1BhdGhVcmkpKSB7XG5cdFx0XHRzd2l0Y2ggKGNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkpIHtcblx0XHRcdFx0Y2FzZSBXb3JrYmVuY2hTdGF0ZS5FTVBUWTpcblx0XHRcdFx0Y2FzZSBXb3JrYmVuY2hTdGF0ZS5GT0xERVI6IHtcblx0XHRcdFx0XHRjb25zdCBmb2xkZXJzID0gY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5tYXAoZm9sZGVyID0+ICh7IHVyaTogZm9sZGVyLnVyaSB9KSk7XG5cdFx0XHRcdFx0cmV0dXJuIHdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLmNyZWF0ZUFuZEVudGVyV29ya3NwYWNlKGZvbGRlcnMsIGNvbmZpZ1BhdGhVcmkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFOlxuXHRcdFx0XHRcdHJldHVybiB3b3Jrc3BhY2VFZGl0aW5nU2VydmljZS5zYXZlQW5kRW50ZXJXb3Jrc3BhY2UoY29uZmlnUGF0aFVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIER1cGxpY2F0ZVdvcmtzcGFjZUluTmV3V2luZG93QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZHVwbGljYXRlV29ya3NwYWNlSW5OZXdXaW5kb3cnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBEdXBsaWNhdGVXb3Jrc3BhY2VJbk5ld1dpbmRvd0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2R1cGxpY2F0ZVdvcmtzcGFjZUluTmV3V2luZG93JywgJ0R1cGxpY2F0ZSBBcyBXb3Jrc3BhY2UgaW4gTmV3IFdpbmRvdycpLFxuXHRcdFx0Y2F0ZWdvcnk6IHdvcmtzcGFjZXNDYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoRW50ZXJNdWx0aVJvb3RXb3Jrc3BhY2VTdXBwb3J0Q29udGV4dCwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSk7XG5cdFx0Y29uc3QgaG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhvc3RTZXJ2aWNlKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VzU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGZvbGRlcnMgPSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IGVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cblx0XHRjb25zdCBuZXdXb3Jrc3BhY2UgPSBhd2FpdCB3b3Jrc3BhY2VzU2VydmljZS5jcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShmb2xkZXJzLCByZW1vdGVBdXRob3JpdHkpO1xuXHRcdGF3YWl0IHdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLmNvcHlXb3Jrc3BhY2VTZXR0aW5ncyhuZXdXb3Jrc3BhY2UpO1xuXG5cdFx0cmV0dXJuIGhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coW3sgd29ya3NwYWNlVXJpOiBuZXdXb3Jrc3BhY2UuY29uZmlnUGF0aCB9XSwgeyBmb3JjZU5ld1dpbmRvdzogdHJ1ZSwgcmVtb3RlQXV0aG9yaXR5IH0pO1xuXHR9XG59XG5cbi8vIC0tLSBBY3Rpb25zIFJlZ2lzdHJhdGlvblxuXG5yZWdpc3RlckFjdGlvbjIoQWRkUm9vdEZvbGRlckFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoUmVtb3ZlUm9vdEZvbGRlckFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoT3BlbkZpbGVBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE9wZW5Gb2xkZXJBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE9wZW5Gb2xkZXJWaWFXb3Jrc3BhY2VBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE9wZW5GaWxlRm9sZGVyQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuV29ya3NwYWNlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuV29ya3NwYWNlQ29uZmlnRmlsZUFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoQ2xvc2VXb3Jrc3BhY2VBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNhdmVXb3Jrc3BhY2VBc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRHVwbGljYXRlV29ya3NwYWNlSW5OZXdXaW5kb3dBY3Rpb24pO1xuXG4vLyAtLS0gTWVudSBSZWdpc3RyYXRpb25cblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0Z3JvdXA6ICcyX29wZW4nLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IE9wZW5GaWxlQWN0aW9uLklELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pT3BlbkZpbGUnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZPcGVuIEZpbGUuLi5cIilcblx0fSxcblx0b3JkZXI6IDEsXG5cdHdoZW46IElzTWFjTmF0aXZlQ29udGV4dC50b05lZ2F0ZWQoKVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdGdyb3VwOiAnMl9vcGVuJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBPcGVuRm9sZGVyQWN0aW9uLklELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pT3BlbkZvbGRlcicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJPcGVuICYmRm9sZGVyLi4uXCIpXG5cdH0sXG5cdG9yZGVyOiAyLFxuXHR3aGVuOiBPcGVuRm9sZGVyV29ya3NwYWNlU3VwcG9ydENvbnRleHRcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRncm91cDogJzJfb3BlbicsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogT3BlbkZvbGRlclZpYVdvcmtzcGFjZUFjdGlvbi5JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaU9wZW5Gb2xkZXInLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiT3BlbiAmJkZvbGRlci4uLlwiKVxuXHR9LFxuXHRvcmRlcjogMixcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE9wZW5Gb2xkZXJXb3Jrc3BhY2VTdXBwb3J0Q29udGV4dC50b05lZ2F0ZWQoKSwgV29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnd29ya3NwYWNlJykpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0Z3JvdXA6ICcyX29wZW4nLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IE9wZW5GaWxlRm9sZGVyQWN0aW9uLklELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pT3BlbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk9wZW4uLi5cIilcblx0fSxcblx0b3JkZXI6IDEsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc01hY05hdGl2ZUNvbnRleHQsIE9wZW5Gb2xkZXJXb3Jrc3BhY2VTdXBwb3J0Q29udGV4dClcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRncm91cDogJzJfb3BlbicsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogT3BlbldvcmtzcGFjZUFjdGlvbi5JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaU9wZW5Xb3Jrc3BhY2UnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiT3BlbiBXb3ImJmtzcGFjZSBmcm9tIEZpbGUuLi5cIilcblx0fSxcblx0b3JkZXI6IDMsXG5cdHdoZW46IEVudGVyTXVsdGlSb290V29ya3NwYWNlU3VwcG9ydENvbnRleHRcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRncm91cDogJzNfd29ya3NwYWNlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBBRERfUk9PVF9GT0xERVJfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaUFkZEZvbGRlclRvV29ya3NwYWNlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkEmJmRkIEZvbGRlciB0byBXb3Jrc3BhY2UuLi5cIilcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm9yKEVudGVyTXVsdGlSb290V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIFdvcmtiZW5jaFN0YXRlQ29udGV4dC5pc0VxdWFsVG8oJ3dvcmtzcGFjZScpKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpLFxuXHRvcmRlcjogMVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdGdyb3VwOiAnM193b3Jrc3BhY2UnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFNhdmVXb3Jrc3BhY2VBc0FjdGlvbi5JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ21pU2F2ZVdvcmtzcGFjZUFzJywgXCJTYXZlIFdvcmtzcGFjZSBBcy4uLlwiKVxuXHR9LFxuXHRvcmRlcjogMixcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEVudGVyTXVsdGlSb290V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdGdyb3VwOiAnM193b3Jrc3BhY2UnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IER1cGxpY2F0ZVdvcmtzcGFjZUluTmV3V2luZG93QWN0aW9uLklELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnZHVwbGljYXRlV29ya3NwYWNlJywgXCJEdXBsaWNhdGUgV29ya3NwYWNlXCIpXG5cdH0sXG5cdG9yZGVyOiAzLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRW50ZXJNdWx0aVJvb3RXb3Jrc3BhY2VTdXBwb3J0Q29udGV4dCwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0Z3JvdXA6ICc2X2Nsb3NlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBDbG9zZVdvcmtzcGFjZUFjdGlvbi5JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaUNsb3NlRm9sZGVyJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkNsb3NlICYmRm9sZGVyXCIpXG5cdH0sXG5cdG9yZGVyOiAzLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnZm9sZGVyJyksIEVtcHR5V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdGdyb3VwOiAnNl9jbG9zZScsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQ2xvc2VXb3Jrc3BhY2VBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlDbG9zZVdvcmtzcGFjZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJDbG9zZSAmJldvcmtzcGFjZVwiKVxuXHR9LFxuXHRvcmRlcjogMyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFdvcmtiZW5jaFN0YXRlQ29udGV4dC5pc0VxdWFsVG8oJ3dvcmtzcGFjZScpLCBFbXB0eVdvcmtzcGFjZVN1cHBvcnRDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSlcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxVQUFVLGlC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
