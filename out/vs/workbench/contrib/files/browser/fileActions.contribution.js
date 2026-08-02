import * as nls from "../../../../nls.js";
import { ToggleAutoSaveAction, FocusFilesExplorer, GlobalCompareResourcesAction, ShowActiveFileInExplorer, CompareWithClipboardAction, NEW_FILE_COMMAND_ID, NEW_FILE_LABEL, NEW_FOLDER_COMMAND_ID, NEW_FOLDER_LABEL, TRIGGER_RENAME_LABEL, MOVE_FILE_TO_TRASH_LABEL, COPY_FILE_LABEL, PASTE_FILE_LABEL, FileCopiedContext, renameHandler, moveFileToTrashHandler, copyFileHandler, pasteFileHandler, deleteFileHandler, cutFileHandler, DOWNLOAD_COMMAND_ID, openFilePreserveFocusHandler, DOWNLOAD_LABEL, OpenActiveFileInEmptyWorkspace, UPLOAD_COMMAND_ID, UPLOAD_LABEL, CompareNewUntitledTextFilesAction, SetActiveEditorReadonlyInSession, SetActiveEditorWriteableInSession, ToggleActiveEditorReadonlyInSession, ResetActiveEditorReadonlyInSession } from "./fileActions.js";
import { revertLocalChangesCommand, acceptLocalChangesCommand, CONFLICT_RESOLUTION_CONTEXT } from "./editors/textFileSaveErrorHandler.js";
import { MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { KeyMod, KeyCode } from "../../../../base/common/keyCodes.js";
import { openWindowCommand, newWindowCommand } from "./fileCommands.js";
import { COPY_PATH_COMMAND_ID, REVEAL_IN_EXPLORER_COMMAND_ID, OPEN_TO_SIDE_COMMAND_ID, REVERT_FILE_COMMAND_ID, SAVE_FILE_COMMAND_ID, SAVE_FILE_LABEL, SAVE_FILE_AS_COMMAND_ID, SAVE_FILE_AS_LABEL, SAVE_ALL_IN_GROUP_COMMAND_ID, OpenEditorsGroupContext, COMPARE_WITH_SAVED_COMMAND_ID, COMPARE_RESOURCE_COMMAND_ID, SELECT_FOR_COMPARE_COMMAND_ID, ResourceSelectedForCompareContext, OpenEditorsDirtyEditorContext, COMPARE_SELECTED_COMMAND_ID, REMOVE_ROOT_FOLDER_COMMAND_ID, REMOVE_ROOT_FOLDER_LABEL, SAVE_FILES_COMMAND_ID, COPY_RELATIVE_PATH_COMMAND_ID, SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID, SAVE_FILE_WITHOUT_FORMATTING_LABEL, OpenEditorsReadonlyEditorContext, OPEN_WITH_EXPLORER_COMMAND_ID, NEW_UNTITLED_FILE_COMMAND_ID, NEW_UNTITLED_FILE_LABEL, SAVE_ALL_COMMAND_ID, OpenEditorsSelectedFileOrUntitledContext } from "./fileConstants.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { FilesExplorerFocusCondition, ExplorerRootContext, ExplorerFolderContext, ExplorerResourceWritableContext, ExplorerResourceCut, ExplorerResourceMoveableToTrash, ExplorerResourceAvailableEditorIdsContext, FoldersViewVisibleContext } from "../common/files.js";
import { ADD_ROOT_FOLDER_COMMAND_ID, ADD_ROOT_FOLDER_LABEL } from "../../../browser/actions/workspaceCommands.js";
import { CLOSE_SAVED_EDITORS_COMMAND_ID, CLOSE_EDITORS_IN_GROUP_COMMAND_ID, CLOSE_EDITOR_COMMAND_ID, CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, REOPEN_WITH_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { AutoSaveAfterShortDelayContext } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { WorkbenchListDoubleSelection } from "../../../../platform/list/browser/listService.js";
import { Schemas } from "../../../../base/common/network.js";
import { DirtyWorkingCopiesContext, EnterMultiRootWorkspaceSupportContext, HasWebFileSystemAccess, IsSessionsWindowContext, WorkbenchStateContext, WorkspaceFolderCountContext, SidebarFocusContext, ActiveEditorCanRevertContext, ActiveEditorContext, ActiveEditorDirtyContext, ResourceContextKey, ActiveEditorAvailableEditorIdsContext, MultipleEditorsSelectedInGroupContext, TwoEditorsSelectedInGroupContext, SelectedEditorsInGroupFileOrUntitledResourceContextKey } from "../../../common/contextkeys.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { IExplorerService } from "./files.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
registerAction2(GlobalCompareResourcesAction);
registerAction2(FocusFilesExplorer);
registerAction2(ShowActiveFileInExplorer);
registerAction2(CompareWithClipboardAction);
registerAction2(CompareNewUntitledTextFilesAction);
registerAction2(ToggleAutoSaveAction);
registerAction2(OpenActiveFileInEmptyWorkspace);
registerAction2(SetActiveEditorReadonlyInSession);
registerAction2(SetActiveEditorWriteableInSession);
registerAction2(ToggleActiveEditorReadonlyInSession);
registerAction2(ResetActiveEditorReadonlyInSession);
CommandsRegistry.registerCommand("_files.windowOpen", openWindowCommand);
CommandsRegistry.registerCommand("_files.newWindow", newWindowCommand);
const explorerCommandsWeightBonus = 10;
const RENAME_ID = "renameFile";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: RENAME_ID,
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated(), ExplorerResourceWritableContext),
  primary: KeyCode.F2,
  mac: {
    primary: KeyCode.Enter
  },
  handler: renameHandler
});
const MOVE_FILE_TO_TRASH_ID = "moveFileToTrash";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: MOVE_FILE_TO_TRASH_ID,
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceMoveableToTrash),
  primary: KeyCode.Delete,
  mac: {
    primary: KeyMod.CtrlCmd | KeyCode.Backspace,
    secondary: [KeyCode.Delete]
  },
  handler: moveFileToTrashHandler
});
const DELETE_FILE_ID = "deleteFile";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: DELETE_FILE_ID,
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: FilesExplorerFocusCondition,
  primary: KeyMod.Shift | KeyCode.Delete,
  mac: {
    primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Backspace
  },
  handler: deleteFileHandler
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: DELETE_FILE_ID,
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceMoveableToTrash.toNegated()),
  primary: KeyCode.Delete,
  mac: {
    primary: KeyMod.CtrlCmd | KeyCode.Backspace
  },
  handler: deleteFileHandler
});
const CUT_FILE_ID = "filesExplorer.cut";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CUT_FILE_ID,
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated(), ExplorerResourceWritableContext),
  primary: KeyMod.CtrlCmd | KeyCode.KeyX,
  handler: cutFileHandler
});
const COPY_FILE_ID = "filesExplorer.copy";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: COPY_FILE_ID,
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated()),
  primary: KeyMod.CtrlCmd | KeyCode.KeyC,
  handler: copyFileHandler
});
const PASTE_FILE_ID = "filesExplorer.paste";
CommandsRegistry.registerCommand(PASTE_FILE_ID, pasteFileHandler);
KeybindingsRegistry.registerKeybindingRule({
  id: `^${PASTE_FILE_ID}`,
  // the `^` enables pasting files into the explorer by preventing default bubble up
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceWritableContext),
  primary: KeyMod.CtrlCmd | KeyCode.KeyV
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "filesExplorer.cancelCut",
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceCut),
  primary: KeyCode.Escape,
  handler: async (accessor) => {
    const explorerService = accessor.get(IExplorerService);
    await explorerService.setToCopy([], true);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "filesExplorer.openFilePreserveFocus",
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerFolderContext.toNegated()),
  primary: KeyCode.Space,
  handler: openFilePreserveFocusHandler
});
const copyPathCommand = {
  id: COPY_PATH_COMMAND_ID,
  title: nls.localize("copyPath", "Copy Path")
};
const copyRelativePathCommand = {
  id: COPY_RELATIVE_PATH_COMMAND_ID,
  title: nls.localize("copyRelativePath", "Copy Relative Path")
};
const revealInSideBarCommand = {
  id: REVEAL_IN_EXPLORER_COMMAND_ID,
  title: nls.localize("revealInSideBar", "Reveal in Explorer View")
};
appendEditorTitleContextMenuItem(SAVE_FILE_COMMAND_ID, SAVE_FILE_LABEL.value, ActiveEditorDirtyContext, "1_close_save", true, 10);
appendEditorTitleContextMenuItem(SAVE_FILE_AS_COMMAND_ID, SAVE_FILE_AS_LABEL.value, ActiveEditorDirtyContext, "1_close_save", false, 20);
appendEditorTitleContextMenuItem(COPY_PATH_COMMAND_ID, copyPathCommand.title, ResourceContextKey.IsFileSystemResource, "1_cutcopypaste", true);
appendEditorTitleContextMenuItem(COPY_RELATIVE_PATH_COMMAND_ID, copyRelativePathCommand.title, ResourceContextKey.IsFileSystemResource, "1_cutcopypaste", true);
appendEditorTitleContextMenuItem(revealInSideBarCommand.id, revealInSideBarCommand.title, ResourceContextKey.IsFileSystemResource, "2_files", false, 1);
function appendEditorTitleContextMenuItem(id, title, when, group, supportsMultiSelect, order) {
  const precondition = supportsMultiSelect !== true ? MultipleEditorsSelectedInGroupContext.negate() : void 0;
  MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
    command: { id, title, precondition },
    when,
    group,
    order
  });
}
appendSaveConflictEditorTitleAction("workbench.files.action.acceptLocalChanges", nls.localize("acceptLocalChanges", "Use your changes and overwrite file contents"), Codicon.check, -10, acceptLocalChangesCommand);
appendSaveConflictEditorTitleAction("workbench.files.action.revertLocalChanges", nls.localize("revertLocalChanges", "Discard your changes and revert to file contents"), Codicon.discard, -9, revertLocalChangesCommand);
function appendSaveConflictEditorTitleAction(id, title, icon, order, command) {
  CommandsRegistry.registerCommand(id, command);
  MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
    command: { id, title, icon },
    when: ContextKeyExpr.equals(CONFLICT_RESOLUTION_CONTEXT, true),
    group: "navigation",
    order
  });
}
function appendToCommandPalette({ id, title, category, metadata }, when) {
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
      id,
      title,
      category,
      metadata
    },
    when
  });
}
appendToCommandPalette({
  id: COPY_PATH_COMMAND_ID,
  title: nls.localize2("copyPathOfActive", "Copy Path of Active File"),
  category: Categories.File
}, IsSessionsWindowContext.negate());
appendToCommandPalette({
  id: COPY_RELATIVE_PATH_COMMAND_ID,
  title: nls.localize2("copyRelativePathOfActive", "Copy Relative Path of Active File"),
  category: Categories.File
}, IsSessionsWindowContext.negate());
appendToCommandPalette({
  id: SAVE_FILE_COMMAND_ID,
  title: SAVE_FILE_LABEL,
  category: Categories.File
});
appendToCommandPalette({
  id: SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID,
  title: SAVE_FILE_WITHOUT_FORMATTING_LABEL,
  category: Categories.File
});
appendToCommandPalette({
  id: SAVE_ALL_IN_GROUP_COMMAND_ID,
  title: nls.localize2("saveAllInGroup", "Save All in Group"),
  category: Categories.File
}, IsSessionsWindowContext.negate());
appendToCommandPalette({
  id: SAVE_FILES_COMMAND_ID,
  title: nls.localize2("saveFiles", "Save All Files"),
  category: Categories.File
}, IsSessionsWindowContext.negate());
appendToCommandPalette({
  id: REVERT_FILE_COMMAND_ID,
  title: nls.localize2("revert", "Revert File"),
  category: Categories.File
}, IsSessionsWindowContext.negate());
appendToCommandPalette({
  id: COMPARE_WITH_SAVED_COMMAND_ID,
  title: nls.localize2("compareActiveWithSaved", "Compare Active File with Saved"),
  category: Categories.File,
  metadata: {
    description: nls.localize2("compareActiveWithSavedMeta", "Opens a new diff editor to compare the active file with the version on disk.")
  }
});
appendToCommandPalette({
  id: SAVE_FILE_AS_COMMAND_ID,
  title: SAVE_FILE_AS_LABEL,
  category: Categories.File
}, IsSessionsWindowContext.negate());
appendToCommandPalette({
  id: NEW_FILE_COMMAND_ID,
  title: NEW_FILE_LABEL,
  category: Categories.File
}, ContextKeyExpr.and(WorkspaceFolderCountContext.notEqualsTo("0"), IsSessionsWindowContext.negate()));
appendToCommandPalette({
  id: NEW_FOLDER_COMMAND_ID,
  title: NEW_FOLDER_LABEL,
  category: Categories.File,
  metadata: { description: nls.localize2("newFolderDescription", "Create a new folder or directory") }
}, ContextKeyExpr.and(WorkspaceFolderCountContext.notEqualsTo("0"), IsSessionsWindowContext.negate()));
appendToCommandPalette({
  id: NEW_UNTITLED_FILE_COMMAND_ID,
  title: NEW_UNTITLED_FILE_LABEL,
  category: Categories.File
}, IsSessionsWindowContext.negate());
const isFileOrUntitledResourceContextKey = ContextKeyExpr.or(ResourceContextKey.IsFileSystemResource, ResourceContextKey.Scheme.isEqualTo(Schemas.untitled));
const openToSideCommand = {
  id: OPEN_TO_SIDE_COMMAND_ID,
  title: nls.localize("openToSide", "Open to the Side")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "navigation",
  order: 10,
  command: openToSideCommand,
  when: isFileOrUntitledResourceContextKey
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "1_open",
  order: 10,
  command: {
    id: REOPEN_WITH_COMMAND_ID,
    title: nls.localize("reopenWith", "Reopen Editor With...")
  },
  when: ContextKeyExpr.and(
    // Editors with Available Choices to Open With
    ActiveEditorAvailableEditorIdsContext,
    // Not: editor groups
    OpenEditorsGroupContext.toNegated()
  )
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "1_cutcopypaste",
  order: 10,
  command: copyPathCommand,
  when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "1_cutcopypaste",
  order: 20,
  command: copyRelativePathCommand,
  when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "2_save",
  order: 10,
  command: {
    id: SAVE_FILE_COMMAND_ID,
    title: SAVE_FILE_LABEL,
    precondition: OpenEditorsDirtyEditorContext
  },
  when: ContextKeyExpr.or(
    // Untitled Editors
    ResourceContextKey.Scheme.isEqualTo(Schemas.untitled),
    // Or:
    ContextKeyExpr.and(
      // Not: editor groups
      OpenEditorsGroupContext.toNegated(),
      // Not: readonly editors
      OpenEditorsReadonlyEditorContext.toNegated(),
      // Not: auto save after short delay
      AutoSaveAfterShortDelayContext.toNegated()
    )
  )
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "2_save",
  order: 20,
  command: {
    id: REVERT_FILE_COMMAND_ID,
    title: nls.localize("revert", "Revert File"),
    precondition: OpenEditorsDirtyEditorContext
  },
  when: ContextKeyExpr.and(
    // Not: editor groups
    OpenEditorsGroupContext.toNegated(),
    // Not: readonly editors
    OpenEditorsReadonlyEditorContext.toNegated(),
    // Not: untitled editors (revert closes them)
    ResourceContextKey.Scheme.notEqualsTo(Schemas.untitled),
    // Not: auto save after short delay
    AutoSaveAfterShortDelayContext.toNegated()
  )
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "2_save",
  order: 30,
  command: {
    id: SAVE_ALL_IN_GROUP_COMMAND_ID,
    title: nls.localize("saveAll", "Save All"),
    precondition: DirtyWorkingCopiesContext
  },
  // Editor Group
  when: OpenEditorsGroupContext
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "3_compare",
  order: 10,
  command: {
    id: COMPARE_WITH_SAVED_COMMAND_ID,
    title: nls.localize("compareWithSaved", "Compare with Saved"),
    precondition: OpenEditorsDirtyEditorContext
  },
  when: ContextKeyExpr.and(ResourceContextKey.IsFileSystemResource, AutoSaveAfterShortDelayContext.toNegated(), WorkbenchListDoubleSelection.toNegated())
});
const compareResourceCommand = {
  id: COMPARE_RESOURCE_COMMAND_ID,
  title: nls.localize("compareWithSelected", "Compare with Selected")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "3_compare",
  order: 20,
  command: compareResourceCommand,
  when: ContextKeyExpr.and(ResourceContextKey.HasResource, ResourceSelectedForCompareContext, isFileOrUntitledResourceContextKey, WorkbenchListDoubleSelection.toNegated())
});
const selectForCompareCommand = {
  id: SELECT_FOR_COMPARE_COMMAND_ID,
  title: nls.localize("compareSource", "Select for Compare")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "3_compare",
  order: 30,
  command: selectForCompareCommand,
  when: ContextKeyExpr.and(ResourceContextKey.HasResource, isFileOrUntitledResourceContextKey, WorkbenchListDoubleSelection.toNegated())
});
const compareSelectedCommand = {
  id: COMPARE_SELECTED_COMMAND_ID,
  title: nls.localize("compareSelected", "Compare Selected")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "3_compare",
  order: 30,
  command: compareSelectedCommand,
  when: ContextKeyExpr.and(ResourceContextKey.HasResource, WorkbenchListDoubleSelection, OpenEditorsSelectedFileOrUntitledContext)
});
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
  group: "1_compare",
  order: 30,
  command: compareSelectedCommand,
  when: ContextKeyExpr.and(ResourceContextKey.HasResource, TwoEditorsSelectedInGroupContext, SelectedEditorsInGroupFileOrUntitledResourceContextKey)
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "4_close",
  order: 10,
  command: {
    id: CLOSE_EDITOR_COMMAND_ID,
    title: nls.localize("close", "Close")
  },
  when: OpenEditorsGroupContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "4_close",
  order: 20,
  command: {
    id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
    title: nls.localize("closeOthers", "Close Others")
  },
  when: OpenEditorsGroupContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "4_close",
  order: 30,
  command: {
    id: CLOSE_SAVED_EDITORS_COMMAND_ID,
    title: nls.localize("closeSaved", "Close Saved")
  }
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "4_close",
  order: 40,
  command: {
    id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
    title: nls.localize("closeAll", "Close All")
  }
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "navigation",
  order: 4,
  command: {
    id: NEW_FILE_COMMAND_ID,
    title: NEW_FILE_LABEL,
    precondition: ExplorerResourceWritableContext
  },
  when: ExplorerFolderContext
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "navigation",
  order: 6,
  command: {
    id: NEW_FOLDER_COMMAND_ID,
    title: NEW_FOLDER_LABEL,
    precondition: ExplorerResourceWritableContext
  },
  when: ExplorerFolderContext
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "navigation",
  order: 10,
  command: openToSideCommand,
  when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.HasResource)
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "navigation",
  order: 20,
  command: {
    id: OPEN_WITH_EXPLORER_COMMAND_ID,
    title: nls.localize("explorerOpenWith", "Open With...")
  },
  when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ExplorerResourceAvailableEditorIdsContext)
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "3_compare",
  order: 20,
  command: compareResourceCommand,
  when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.HasResource, ResourceSelectedForCompareContext, WorkbenchListDoubleSelection.toNegated())
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "3_compare",
  order: 30,
  command: selectForCompareCommand,
  when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.HasResource, WorkbenchListDoubleSelection.toNegated())
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "3_compare",
  order: 30,
  command: compareSelectedCommand,
  when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.HasResource, WorkbenchListDoubleSelection)
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "5_cutcopypaste",
  order: 8,
  command: {
    id: CUT_FILE_ID,
    title: nls.localize("cut", "Cut")
  },
  when: ContextKeyExpr.and(ExplorerRootContext.toNegated(), ExplorerResourceWritableContext)
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "5_cutcopypaste",
  order: 10,
  command: {
    id: COPY_FILE_ID,
    title: COPY_FILE_LABEL
  },
  when: ExplorerRootContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "5_cutcopypaste",
  order: 20,
  command: {
    id: PASTE_FILE_ID,
    title: PASTE_FILE_LABEL,
    precondition: ContextKeyExpr.and(ExplorerResourceWritableContext, FileCopiedContext)
  },
  when: ExplorerFolderContext
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "5b_importexport",
  order: 10,
  command: {
    id: DOWNLOAD_COMMAND_ID,
    title: DOWNLOAD_LABEL
  },
  when: ContextKeyExpr.or(
    // native: for any remote resource
    ContextKeyExpr.and(IsWebContext.toNegated(), ResourceContextKey.Scheme.notEqualsTo(Schemas.file)),
    // web: for any files
    ContextKeyExpr.and(IsWebContext, ExplorerFolderContext.toNegated(), ExplorerRootContext.toNegated()),
    // web: for any folders if file system API support is provided
    ContextKeyExpr.and(IsWebContext, HasWebFileSystemAccess)
  )
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "5b_importexport",
  order: 20,
  command: {
    id: UPLOAD_COMMAND_ID,
    title: UPLOAD_LABEL
  },
  when: ContextKeyExpr.and(
    // only in web
    IsWebContext,
    // only on folders
    ExplorerFolderContext,
    // only on writable folders
    ExplorerResourceWritableContext
  )
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "6_copypath",
  order: 10,
  command: copyPathCommand,
  when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "6_copypath",
  order: 20,
  command: copyRelativePathCommand,
  when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "2_workspace",
  order: 10,
  command: {
    id: ADD_ROOT_FOLDER_COMMAND_ID,
    title: ADD_ROOT_FOLDER_LABEL
  },
  when: ContextKeyExpr.and(ExplorerRootContext, ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo("workspace")))
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "2_workspace",
  order: 30,
  command: {
    id: REMOVE_ROOT_FOLDER_COMMAND_ID,
    title: REMOVE_ROOT_FOLDER_LABEL
  },
  when: ContextKeyExpr.and(ExplorerRootContext, ExplorerFolderContext, ContextKeyExpr.and(WorkspaceFolderCountContext.notEqualsTo("0"), ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo("workspace"))))
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "7_modification",
  order: 10,
  command: {
    id: RENAME_ID,
    title: TRIGGER_RENAME_LABEL,
    precondition: ExplorerResourceWritableContext
  },
  when: ExplorerRootContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "7_modification",
  order: 20,
  command: {
    id: MOVE_FILE_TO_TRASH_ID,
    title: MOVE_FILE_TO_TRASH_LABEL
  },
  alt: {
    id: DELETE_FILE_ID,
    title: nls.localize("deleteFile", "Delete Permanently")
  },
  when: ContextKeyExpr.and(ExplorerRootContext.toNegated(), ExplorerResourceMoveableToTrash)
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "7_modification",
  order: 20,
  command: {
    id: DELETE_FILE_ID,
    title: nls.localize("deleteFile", "Delete Permanently")
  },
  when: ContextKeyExpr.and(ExplorerRootContext.toNegated(), ExplorerResourceMoveableToTrash.toNegated())
});
for (const menuId of [MenuId.EmptyEditorGroupContext, MenuId.EditorTabsBarContext]) {
  MenuRegistry.appendMenuItem(menuId, { command: { id: NEW_UNTITLED_FILE_COMMAND_ID, title: nls.localize("newFile", "New Text File") }, group: "1_file", order: 10 });
  MenuRegistry.appendMenuItem(menuId, { command: { id: "workbench.action.quickOpen", title: nls.localize("openFile", "Open File...") }, group: "1_file", order: 20 });
}
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "1_new",
  command: {
    id: NEW_UNTITLED_FILE_COMMAND_ID,
    title: nls.localize({ key: "miNewFile", comment: ["&& denotes a mnemonic"] }, "&&New Text File")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "4_save",
  command: {
    id: SAVE_FILE_COMMAND_ID,
    title: nls.localize({ key: "miSave", comment: ["&& denotes a mnemonic"] }, "&&Save"),
    precondition: ContextKeyExpr.or(ActiveEditorContext, ContextKeyExpr.and(FoldersViewVisibleContext, SidebarFocusContext))
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "4_save",
  command: {
    id: SAVE_FILE_AS_COMMAND_ID,
    title: nls.localize({ key: "miSaveAs", comment: ["&& denotes a mnemonic"] }, "Save &&As..."),
    precondition: ContextKeyExpr.or(ActiveEditorContext, ContextKeyExpr.and(FoldersViewVisibleContext, SidebarFocusContext))
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "4_save",
  command: {
    id: SAVE_ALL_COMMAND_ID,
    title: nls.localize({ key: "miSaveAll", comment: ["&& denotes a mnemonic"] }, "Save A&&ll"),
    precondition: DirtyWorkingCopiesContext
  },
  order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "5_autosave",
  command: {
    id: ToggleAutoSaveAction.ID,
    title: nls.localize({ key: "miAutoSave", comment: ["&& denotes a mnemonic"] }, "A&&uto Save"),
    toggled: ContextKeyExpr.notEquals("config.files.autoSave", "off")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "6_close",
  command: {
    id: REVERT_FILE_COMMAND_ID,
    title: nls.localize({ key: "miRevert", comment: ["&& denotes a mnemonic"] }, "Re&&vert File"),
    precondition: ContextKeyExpr.or(
      // Active editor can revert
      ContextKeyExpr.and(ActiveEditorCanRevertContext),
      // Explorer focused but not on untitled
      ContextKeyExpr.and(ResourceContextKey.Scheme.notEqualsTo(Schemas.untitled), FoldersViewVisibleContext, SidebarFocusContext)
    )
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "6_close",
  command: {
    id: CLOSE_EDITOR_COMMAND_ID,
    title: nls.localize({ key: "miCloseEditor", comment: ["&& denotes a mnemonic"] }, "&&Close Editor"),
    precondition: ContextKeyExpr.or(ActiveEditorContext, ContextKeyExpr.and(FoldersViewVisibleContext, SidebarFocusContext))
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
  group: "3_global_nav",
  command: {
    id: "workbench.action.quickOpen",
    title: nls.localize({ key: "miGotoFile", comment: ["&& denotes a mnemonic"] }, "Go to &&File...")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.ChatAttachmentsContext, {
  group: "navigation",
  order: 10,
  command: openToSideCommand,
  when: ContextKeyExpr.and(ResourceContextKey.IsFileSystemResource, ExplorerFolderContext.toNegated())
});
MenuRegistry.appendMenuItem(MenuId.ChatAttachmentsContext, {
  group: "navigation",
  order: 20,
  command: revealInSideBarCommand,
  when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.ChatAttachmentsContext, {
  group: "1_cutcopypaste",
  order: 10,
  command: copyPathCommand,
  when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.ChatAttachmentsContext, {
  group: "1_cutcopypaste",
  order: 20,
  command: copyRelativePathCommand,
  when: ResourceContextKey.IsFileSystemResource
});
for (const menuId of [MenuId.ChatInlineResourceAnchorContext, MenuId.ChatInputResourceAttachmentContext]) {
  MenuRegistry.appendMenuItem(menuId, {
    group: "navigation",
    order: 10,
    command: openToSideCommand,
    when: ContextKeyExpr.and(ResourceContextKey.HasResource, ExplorerFolderContext.toNegated())
  });
  MenuRegistry.appendMenuItem(menuId, {
    group: "navigation",
    order: 20,
    command: revealInSideBarCommand,
    when: ResourceContextKey.IsFileSystemResource
  });
  MenuRegistry.appendMenuItem(menuId, {
    group: "1_cutcopypaste",
    order: 10,
    command: copyPathCommand,
    when: ResourceContextKey.IsFileSystemResource
  });
  MenuRegistry.appendMenuItem(menuId, {
    group: "1_cutcopypaste",
    order: 20,
    command: copyRelativePathCommand,
    when: ResourceContextKey.IsFileSystemResource
  });
}
export {
  appendEditorTitleContextMenuItem,
  appendToCommandPalette,
  revealInSideBarCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2Jyb3dzZXIvZmlsZUFjdGlvbnMuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBUb2dnbGVBdXRvU2F2ZUFjdGlvbiwgRm9jdXNGaWxlc0V4cGxvcmVyLCBHbG9iYWxDb21wYXJlUmVzb3VyY2VzQWN0aW9uLCBTaG93QWN0aXZlRmlsZUluRXhwbG9yZXIsIENvbXBhcmVXaXRoQ2xpcGJvYXJkQWN0aW9uLCBORVdfRklMRV9DT01NQU5EX0lELCBORVdfRklMRV9MQUJFTCwgTkVXX0ZPTERFUl9DT01NQU5EX0lELCBORVdfRk9MREVSX0xBQkVMLCBUUklHR0VSX1JFTkFNRV9MQUJFTCwgTU9WRV9GSUxFX1RPX1RSQVNIX0xBQkVMLCBDT1BZX0ZJTEVfTEFCRUwsIFBBU1RFX0ZJTEVfTEFCRUwsIEZpbGVDb3BpZWRDb250ZXh0LCByZW5hbWVIYW5kbGVyLCBtb3ZlRmlsZVRvVHJhc2hIYW5kbGVyLCBjb3B5RmlsZUhhbmRsZXIsIHBhc3RlRmlsZUhhbmRsZXIsIGRlbGV0ZUZpbGVIYW5kbGVyLCBjdXRGaWxlSGFuZGxlciwgRE9XTkxPQURfQ09NTUFORF9JRCwgb3BlbkZpbGVQcmVzZXJ2ZUZvY3VzSGFuZGxlciwgRE9XTkxPQURfTEFCRUwsIE9wZW5BY3RpdmVGaWxlSW5FbXB0eVdvcmtzcGFjZSwgVVBMT0FEX0NPTU1BTkRfSUQsIFVQTE9BRF9MQUJFTCwgQ29tcGFyZU5ld1VudGl0bGVkVGV4dEZpbGVzQWN0aW9uLCBTZXRBY3RpdmVFZGl0b3JSZWFkb25seUluU2Vzc2lvbiwgU2V0QWN0aXZlRWRpdG9yV3JpdGVhYmxlSW5TZXNzaW9uLCBUb2dnbGVBY3RpdmVFZGl0b3JSZWFkb25seUluU2Vzc2lvbiwgUmVzZXRBY3RpdmVFZGl0b3JSZWFkb25seUluU2Vzc2lvbiB9IGZyb20gJy4vZmlsZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgcmV2ZXJ0TG9jYWxDaGFuZ2VzQ29tbWFuZCwgYWNjZXB0TG9jYWxDaGFuZ2VzQ29tbWFuZCwgQ09ORkxJQ1RfUkVTT0xVVElPTl9DT05URVhUIH0gZnJvbSAnLi9lZGl0b3JzL3RleHRGaWxlU2F2ZUVycm9ySGFuZGxlci5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IEtleU1vZCwgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IG9wZW5XaW5kb3dDb21tYW5kLCBuZXdXaW5kb3dDb21tYW5kIH0gZnJvbSAnLi9maWxlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ09QWV9QQVRIX0NPTU1BTkRfSUQsIFJFVkVBTF9JTl9FWFBMT1JFUl9DT01NQU5EX0lELCBPUEVOX1RPX1NJREVfQ09NTUFORF9JRCwgUkVWRVJUX0ZJTEVfQ09NTUFORF9JRCwgU0FWRV9GSUxFX0NPTU1BTkRfSUQsIFNBVkVfRklMRV9MQUJFTCwgU0FWRV9GSUxFX0FTX0NPTU1BTkRfSUQsIFNBVkVfRklMRV9BU19MQUJFTCwgU0FWRV9BTExfSU5fR1JPVVBfQ09NTUFORF9JRCwgT3BlbkVkaXRvcnNHcm91cENvbnRleHQsIENPTVBBUkVfV0lUSF9TQVZFRF9DT01NQU5EX0lELCBDT01QQVJFX1JFU09VUkNFX0NPTU1BTkRfSUQsIFNFTEVDVF9GT1JfQ09NUEFSRV9DT01NQU5EX0lELCBSZXNvdXJjZVNlbGVjdGVkRm9yQ29tcGFyZUNvbnRleHQsIE9wZW5FZGl0b3JzRGlydHlFZGl0b3JDb250ZXh0LCBDT01QQVJFX1NFTEVDVEVEX0NPTU1BTkRfSUQsIFJFTU9WRV9ST09UX0ZPTERFUl9DT01NQU5EX0lELCBSRU1PVkVfUk9PVF9GT0xERVJfTEFCRUwsIFNBVkVfRklMRVNfQ09NTUFORF9JRCwgQ09QWV9SRUxBVElWRV9QQVRIX0NPTU1BTkRfSUQsIFNBVkVfRklMRV9XSVRIT1VUX0ZPUk1BVFRJTkdfQ09NTUFORF9JRCwgU0FWRV9GSUxFX1dJVEhPVVRfRk9STUFUVElOR19MQUJFTCwgT3BlbkVkaXRvcnNSZWFkb25seUVkaXRvckNvbnRleHQsIE9QRU5fV0lUSF9FWFBMT1JFUl9DT01NQU5EX0lELCBORVdfVU5USVRMRURfRklMRV9DT01NQU5EX0lELCBORVdfVU5USVRMRURfRklMRV9MQUJFTCwgU0FWRV9BTExfQ09NTUFORF9JRCwgT3BlbkVkaXRvcnNTZWxlY3RlZEZpbGVPclVudGl0bGVkQ29udGV4dCB9IGZyb20gJy4vZmlsZUNvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZEhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBGaWxlc0V4cGxvcmVyRm9jdXNDb25kaXRpb24sIEV4cGxvcmVyUm9vdENvbnRleHQsIEV4cGxvcmVyRm9sZGVyQ29udGV4dCwgRXhwbG9yZXJSZXNvdXJjZVdyaXRhYmxlQ29udGV4dCwgRXhwbG9yZXJSZXNvdXJjZUN1dCwgRXhwbG9yZXJSZXNvdXJjZU1vdmVhYmxlVG9UcmFzaCwgRXhwbG9yZXJSZXNvdXJjZUF2YWlsYWJsZUVkaXRvcklkc0NvbnRleHQsIEZvbGRlcnNWaWV3VmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgQUREX1JPT1RfRk9MREVSX0NPTU1BTkRfSUQsIEFERF9ST09UX0ZPTERFUl9MQUJFTCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy93b3Jrc3BhY2VDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDTE9TRV9TQVZFRF9FRElUT1JTX0NPTU1BTkRfSUQsIENMT1NFX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCwgQ0xPU0VfRURJVE9SX0NPTU1BTkRfSUQsIENMT1NFX09USEVSX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCwgUkVPUEVOX1dJVEhfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckNvbW1hbmRzLmpzJztcbmltcG9ydCB7IEF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hMaXN0RG91YmxlU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IERpcnR5V29ya2luZ0NvcGllc0NvbnRleHQsIEVudGVyTXVsdGlSb290V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIEhhc1dlYkZpbGVTeXN0ZW1BY2Nlc3MsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBXb3JrYmVuY2hTdGF0ZUNvbnRleHQsIFdvcmtzcGFjZUZvbGRlckNvdW50Q29udGV4dCwgU2lkZWJhckZvY3VzQ29udGV4dCwgQWN0aXZlRWRpdG9yQ2FuUmV2ZXJ0Q29udGV4dCwgQWN0aXZlRWRpdG9yQ29udGV4dCwgQWN0aXZlRWRpdG9yRGlydHlDb250ZXh0LCBSZXNvdXJjZUNvbnRleHRLZXksIEFjdGl2ZUVkaXRvckF2YWlsYWJsZUVkaXRvcklkc0NvbnRleHQsIE11bHRpcGxlRWRpdG9yc1NlbGVjdGVkSW5Hcm91cENvbnRleHQsIFR3b0VkaXRvcnNTZWxlY3RlZEluR3JvdXBDb250ZXh0LCBTZWxlY3RlZEVkaXRvcnNJbkdyb3VwRmlsZU9yVW50aXRsZWRSZXNvdXJjZUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSXNXZWJDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuL2ZpbGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcblxuLy8gQ29udHJpYnV0ZSBHbG9iYWwgQWN0aW9uc1xuXG5yZWdpc3RlckFjdGlvbjIoR2xvYmFsQ29tcGFyZVJlc291cmNlc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRm9jdXNGaWxlc0V4cGxvcmVyKTtcbnJlZ2lzdGVyQWN0aW9uMihTaG93QWN0aXZlRmlsZUluRXhwbG9yZXIpO1xucmVnaXN0ZXJBY3Rpb24yKENvbXBhcmVXaXRoQ2xpcGJvYXJkQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihDb21wYXJlTmV3VW50aXRsZWRUZXh0RmlsZXNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZUF1dG9TYXZlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuQWN0aXZlRmlsZUluRW1wdHlXb3Jrc3BhY2UpO1xucmVnaXN0ZXJBY3Rpb24yKFNldEFjdGl2ZUVkaXRvclJlYWRvbmx5SW5TZXNzaW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTZXRBY3RpdmVFZGl0b3JXcml0ZWFibGVJblNlc3Npb24pO1xucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZUFjdGl2ZUVkaXRvclJlYWRvbmx5SW5TZXNzaW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihSZXNldEFjdGl2ZUVkaXRvclJlYWRvbmx5SW5TZXNzaW9uKTtcblxuLy8gQ29tbWFuZHNcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfZmlsZXMud2luZG93T3BlbicsIG9wZW5XaW5kb3dDb21tYW5kKTtcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfZmlsZXMubmV3V2luZG93JywgbmV3V2luZG93Q29tbWFuZCk7XG5cbmNvbnN0IGV4cGxvcmVyQ29tbWFuZHNXZWlnaHRCb251cyA9IDEwOyAvLyBnaXZlIG91ciBjb21tYW5kcyBhIGxpdHRsZSBiaXQgbW9yZSB3ZWlnaHQgb3ZlciBvdGhlciBkZWZhdWx0IGxpc3QvdHJlZSBjb21tYW5kc1xuXG5jb25zdCBSRU5BTUVfSUQgPSAncmVuYW1lRmlsZSc7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IFJFTkFNRV9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyBleHBsb3JlckNvbW1hbmRzV2VpZ2h0Qm9udXMsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChGaWxlc0V4cGxvcmVyRm9jdXNDb25kaXRpb24sIEV4cGxvcmVyUm9vdENvbnRleHQudG9OZWdhdGVkKCksIEV4cGxvcmVyUmVzb3VyY2VXcml0YWJsZUNvbnRleHQpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkYyLFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyXG5cdH0sXG5cdGhhbmRsZXI6IHJlbmFtZUhhbmRsZXJcbn0pO1xuXG5jb25zdCBNT1ZFX0ZJTEVfVE9fVFJBU0hfSUQgPSAnbW92ZUZpbGVUb1RyYXNoJztcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogTU9WRV9GSUxFX1RPX1RSQVNIX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIGV4cGxvcmVyQ29tbWFuZHNXZWlnaHRCb251cyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgRXhwbG9yZXJSZXNvdXJjZU1vdmVhYmxlVG9UcmFzaCksXG5cdHByaW1hcnk6IEtleUNvZGUuRGVsZXRlLFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NwYWNlLFxuXHRcdHNlY29uZGFyeTogW0tleUNvZGUuRGVsZXRlXVxuXHR9LFxuXHRoYW5kbGVyOiBtb3ZlRmlsZVRvVHJhc2hIYW5kbGVyXG59KTtcblxuY29uc3QgREVMRVRFX0ZJTEVfSUQgPSAnZGVsZXRlRmlsZSc7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IERFTEVURV9GSUxFX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIGV4cGxvcmVyQ29tbWFuZHNXZWlnaHRCb251cyxcblx0d2hlbjogRmlsZXNFeHBsb3JlckZvY3VzQ29uZGl0aW9uLFxuXHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRlbGV0ZSxcblx0bWFjOiB7XG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5CYWNrc3BhY2Vcblx0fSxcblx0aGFuZGxlcjogZGVsZXRlRmlsZUhhbmRsZXJcbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IERFTEVURV9GSUxFX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIGV4cGxvcmVyQ29tbWFuZHNXZWlnaHRCb251cyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgRXhwbG9yZXJSZXNvdXJjZU1vdmVhYmxlVG9UcmFzaC50b05lZ2F0ZWQoKSksXG5cdHByaW1hcnk6IEtleUNvZGUuRGVsZXRlLFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NwYWNlXG5cdH0sXG5cdGhhbmRsZXI6IGRlbGV0ZUZpbGVIYW5kbGVyXG59KTtcblxuY29uc3QgQ1VUX0ZJTEVfSUQgPSAnZmlsZXNFeHBsb3Jlci5jdXQnO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBDVVRfRklMRV9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyBleHBsb3JlckNvbW1hbmRzV2VpZ2h0Qm9udXMsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChGaWxlc0V4cGxvcmVyRm9jdXNDb25kaXRpb24sIEV4cGxvcmVyUm9vdENvbnRleHQudG9OZWdhdGVkKCksIEV4cGxvcmVyUmVzb3VyY2VXcml0YWJsZUNvbnRleHQpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5WCxcblx0aGFuZGxlcjogY3V0RmlsZUhhbmRsZXIsXG59KTtcblxuY29uc3QgQ09QWV9GSUxFX0lEID0gJ2ZpbGVzRXhwbG9yZXIuY29weSc7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IENPUFlfRklMRV9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyBleHBsb3JlckNvbW1hbmRzV2VpZ2h0Qm9udXMsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChGaWxlc0V4cGxvcmVyRm9jdXNDb25kaXRpb24sIEV4cGxvcmVyUm9vdENvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Qyxcblx0aGFuZGxlcjogY29weUZpbGVIYW5kbGVyLFxufSk7XG5cbmNvbnN0IFBBU1RFX0ZJTEVfSUQgPSAnZmlsZXNFeHBsb3Jlci5wYXN0ZSc7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKFBBU1RFX0ZJTEVfSUQsIHBhc3RlRmlsZUhhbmRsZXIpO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogYF4ke1BBU1RFX0ZJTEVfSUR9YCwgLy8gdGhlIGBeYCBlbmFibGVzIHBhc3RpbmcgZmlsZXMgaW50byB0aGUgZXhwbG9yZXIgYnkgcHJldmVudGluZyBkZWZhdWx0IGJ1YmJsZSB1cFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIGV4cGxvcmVyQ29tbWFuZHNXZWlnaHRCb251cyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgRXhwbG9yZXJSZXNvdXJjZVdyaXRhYmxlQ29udGV4dCksXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlWLFxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2ZpbGVzRXhwbG9yZXIuY2FuY2VsQ3V0Jyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyBleHBsb3JlckNvbW1hbmRzV2VpZ2h0Qm9udXMsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChGaWxlc0V4cGxvcmVyRm9jdXNDb25kaXRpb24sIEV4cGxvcmVyUmVzb3VyY2VDdXQpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgZXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpO1xuXHRcdGF3YWl0IGV4cGxvcmVyU2VydmljZS5zZXRUb0NvcHkoW10sIHRydWUpO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnZmlsZXNFeHBsb3Jlci5vcGVuRmlsZVByZXNlcnZlRm9jdXMnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIGV4cGxvcmVyQ29tbWFuZHNXZWlnaHRCb251cyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgRXhwbG9yZXJGb2xkZXJDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0cHJpbWFyeTogS2V5Q29kZS5TcGFjZSxcblx0aGFuZGxlcjogb3BlbkZpbGVQcmVzZXJ2ZUZvY3VzSGFuZGxlclxufSk7XG5cbmNvbnN0IGNvcHlQYXRoQ29tbWFuZCA9IHtcblx0aWQ6IENPUFlfUEFUSF9DT01NQU5EX0lELFxuXHR0aXRsZTogbmxzLmxvY2FsaXplKCdjb3B5UGF0aCcsIFwiQ29weSBQYXRoXCIpXG59O1xuXG5jb25zdCBjb3B5UmVsYXRpdmVQYXRoQ29tbWFuZCA9IHtcblx0aWQ6IENPUFlfUkVMQVRJVkVfUEFUSF9DT01NQU5EX0lELFxuXHR0aXRsZTogbmxzLmxvY2FsaXplKCdjb3B5UmVsYXRpdmVQYXRoJywgXCJDb3B5IFJlbGF0aXZlIFBhdGhcIilcbn07XG5cbmV4cG9ydCBjb25zdCByZXZlYWxJblNpZGVCYXJDb21tYW5kID0ge1xuXHRpZDogUkVWRUFMX0lOX0VYUExPUkVSX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ3JldmVhbEluU2lkZUJhcicsIFwiUmV2ZWFsIGluIEV4cGxvcmVyIFZpZXdcIilcbn07XG5cbi8vIEVkaXRvciBUaXRsZSBDb250ZXh0IE1lbnVcbmFwcGVuZEVkaXRvclRpdGxlQ29udGV4dE1lbnVJdGVtKFNBVkVfRklMRV9DT01NQU5EX0lELCBTQVZFX0ZJTEVfTEFCRUwudmFsdWUsIEFjdGl2ZUVkaXRvckRpcnR5Q29udGV4dCwgJzFfY2xvc2Vfc2F2ZScsIHRydWUsIDEwKTtcbmFwcGVuZEVkaXRvclRpdGxlQ29udGV4dE1lbnVJdGVtKFNBVkVfRklMRV9BU19DT01NQU5EX0lELCBTQVZFX0ZJTEVfQVNfTEFCRUwudmFsdWUsIEFjdGl2ZUVkaXRvckRpcnR5Q29udGV4dCwgJzFfY2xvc2Vfc2F2ZScsIGZhbHNlLCAyMCk7XG5hcHBlbmRFZGl0b3JUaXRsZUNvbnRleHRNZW51SXRlbShDT1BZX1BBVEhfQ09NTUFORF9JRCwgY29weVBhdGhDb21tYW5kLnRpdGxlLCBSZXNvdXJjZUNvbnRleHRLZXkuSXNGaWxlU3lzdGVtUmVzb3VyY2UsICcxX2N1dGNvcHlwYXN0ZScsIHRydWUpO1xuYXBwZW5kRWRpdG9yVGl0bGVDb250ZXh0TWVudUl0ZW0oQ09QWV9SRUxBVElWRV9QQVRIX0NPTU1BTkRfSUQsIGNvcHlSZWxhdGl2ZVBhdGhDb21tYW5kLnRpdGxlLCBSZXNvdXJjZUNvbnRleHRLZXkuSXNGaWxlU3lzdGVtUmVzb3VyY2UsICcxX2N1dGNvcHlwYXN0ZScsIHRydWUpO1xuYXBwZW5kRWRpdG9yVGl0bGVDb250ZXh0TWVudUl0ZW0ocmV2ZWFsSW5TaWRlQmFyQ29tbWFuZC5pZCwgcmV2ZWFsSW5TaWRlQmFyQ29tbWFuZC50aXRsZSwgUmVzb3VyY2VDb250ZXh0S2V5LklzRmlsZVN5c3RlbVJlc291cmNlLCAnMl9maWxlcycsIGZhbHNlLCAxKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGVuZEVkaXRvclRpdGxlQ29udGV4dE1lbnVJdGVtKGlkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcsIHdoZW46IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkLCBncm91cDogc3RyaW5nLCBzdXBwb3J0c011bHRpU2VsZWN0OiBib29sZWFuLCBvcmRlcj86IG51bWJlcik6IHZvaWQge1xuXHRjb25zdCBwcmVjb25kaXRpb24gPSBzdXBwb3J0c011bHRpU2VsZWN0ICE9PSB0cnVlID8gTXVsdGlwbGVFZGl0b3JzU2VsZWN0ZWRJbkdyb3VwQ29udGV4dC5uZWdhdGUoKSA6IHVuZGVmaW5lZDtcblxuXHQvLyBNZW51XG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7XG5cdFx0Y29tbWFuZDogeyBpZCwgdGl0bGUsIHByZWNvbmRpdGlvbiB9LFxuXHRcdHdoZW4sXG5cdFx0Z3JvdXAsXG5cdFx0b3JkZXIsXG5cdH0pO1xufVxuXG4vLyBFZGl0b3IgVGl0bGUgTWVudSBmb3IgQ29uZmxpY3QgUmVzb2x1dGlvblxuYXBwZW5kU2F2ZUNvbmZsaWN0RWRpdG9yVGl0bGVBY3Rpb24oJ3dvcmtiZW5jaC5maWxlcy5hY3Rpb24uYWNjZXB0TG9jYWxDaGFuZ2VzJywgbmxzLmxvY2FsaXplKCdhY2NlcHRMb2NhbENoYW5nZXMnLCBcIlVzZSB5b3VyIGNoYW5nZXMgYW5kIG92ZXJ3cml0ZSBmaWxlIGNvbnRlbnRzXCIpLCBDb2RpY29uLmNoZWNrLCAtMTAsIGFjY2VwdExvY2FsQ2hhbmdlc0NvbW1hbmQpO1xuYXBwZW5kU2F2ZUNvbmZsaWN0RWRpdG9yVGl0bGVBY3Rpb24oJ3dvcmtiZW5jaC5maWxlcy5hY3Rpb24ucmV2ZXJ0TG9jYWxDaGFuZ2VzJywgbmxzLmxvY2FsaXplKCdyZXZlcnRMb2NhbENoYW5nZXMnLCBcIkRpc2NhcmQgeW91ciBjaGFuZ2VzIGFuZCByZXZlcnQgdG8gZmlsZSBjb250ZW50c1wiKSwgQ29kaWNvbi5kaXNjYXJkLCAtOSwgcmV2ZXJ0TG9jYWxDaGFuZ2VzQ29tbWFuZCk7XG5cbmZ1bmN0aW9uIGFwcGVuZFNhdmVDb25mbGljdEVkaXRvclRpdGxlQWN0aW9uKGlkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcsIGljb246IFRoZW1lSWNvbiwgb3JkZXI6IG51bWJlciwgY29tbWFuZDogSUNvbW1hbmRIYW5kbGVyKTogdm9pZCB7XG5cblx0Ly8gQ29tbWFuZFxuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChpZCwgY29tbWFuZCk7XG5cblx0Ly8gQWN0aW9uXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHtcblx0XHRjb21tYW5kOiB7IGlkLCB0aXRsZSwgaWNvbiB9LFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscyhDT05GTElDVF9SRVNPTFVUSU9OX0NPTlRFWFQsIHRydWUpLFxuXHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0b3JkZXJcblx0fSk7XG59XG5cbi8vIE1lbnUgcmVnaXN0cmF0aW9uIC0gY29tbWFuZCBwYWxldHRlXG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBlbmRUb0NvbW1hbmRQYWxldHRlKHsgaWQsIHRpdGxlLCBjYXRlZ29yeSwgbWV0YWRhdGEgfTogSUNvbW1hbmRBY3Rpb24sIHdoZW4/OiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IHZvaWQge1xuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7XG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQsXG5cdFx0XHR0aXRsZSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0bWV0YWRhdGFcblx0XHR9LFxuXHRcdHdoZW5cblx0fSk7XG59XG5cbmFwcGVuZFRvQ29tbWFuZFBhbGV0dGUoe1xuXHRpZDogQ09QWV9QQVRIX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBubHMubG9jYWxpemUyKCdjb3B5UGF0aE9mQWN0aXZlJywgXCJDb3B5IFBhdGggb2YgQWN0aXZlIEZpbGVcIiksXG5cdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGVcbn0sIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKTtcbmFwcGVuZFRvQ29tbWFuZFBhbGV0dGUoe1xuXHRpZDogQ09QWV9SRUxBVElWRV9QQVRIX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBubHMubG9jYWxpemUyKCdjb3B5UmVsYXRpdmVQYXRoT2ZBY3RpdmUnLCBcIkNvcHkgUmVsYXRpdmUgUGF0aCBvZiBBY3RpdmUgRmlsZVwiKSxcblx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRmlsZVxufSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpO1xuXG5hcHBlbmRUb0NvbW1hbmRQYWxldHRlKHtcblx0aWQ6IFNBVkVfRklMRV9DT01NQU5EX0lELFxuXHR0aXRsZTogU0FWRV9GSUxFX0xBQkVMLFxuXHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlXG59KTtcblxuYXBwZW5kVG9Db21tYW5kUGFsZXR0ZSh7XG5cdGlkOiBTQVZFX0ZJTEVfV0lUSE9VVF9GT1JNQVRUSU5HX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBTQVZFX0ZJTEVfV0lUSE9VVF9GT1JNQVRUSU5HX0xBQkVMLFxuXHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlXG59KTtcblxuYXBwZW5kVG9Db21tYW5kUGFsZXR0ZSh7XG5cdGlkOiBTQVZFX0FMTF9JTl9HUk9VUF9DT01NQU5EX0lELFxuXHR0aXRsZTogbmxzLmxvY2FsaXplMignc2F2ZUFsbEluR3JvdXAnLCBcIlNhdmUgQWxsIGluIEdyb3VwXCIpLFxuXHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlXG59LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSk7XG5cbmFwcGVuZFRvQ29tbWFuZFBhbGV0dGUoe1xuXHRpZDogU0FWRV9GSUxFU19DT01NQU5EX0lELFxuXHR0aXRsZTogbmxzLmxvY2FsaXplMignc2F2ZUZpbGVzJywgXCJTYXZlIEFsbCBGaWxlc1wiKSxcblx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRmlsZVxufSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpO1xuXG5hcHBlbmRUb0NvbW1hbmRQYWxldHRlKHtcblx0aWQ6IFJFVkVSVF9GSUxFX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBubHMubG9jYWxpemUyKCdyZXZlcnQnLCBcIlJldmVydCBGaWxlXCIpLFxuXHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlXG59LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSk7XG5cbmFwcGVuZFRvQ29tbWFuZFBhbGV0dGUoe1xuXHRpZDogQ09NUEFSRV9XSVRIX1NBVkVEX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBubHMubG9jYWxpemUyKCdjb21wYXJlQWN0aXZlV2l0aFNhdmVkJywgXCJDb21wYXJlIEFjdGl2ZSBGaWxlIHdpdGggU2F2ZWRcIiksXG5cdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGUsXG5cdG1ldGFkYXRhOiB7XG5cdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ2NvbXBhcmVBY3RpdmVXaXRoU2F2ZWRNZXRhJywgXCJPcGVucyBhIG5ldyBkaWZmIGVkaXRvciB0byBjb21wYXJlIHRoZSBhY3RpdmUgZmlsZSB3aXRoIHRoZSB2ZXJzaW9uIG9uIGRpc2suXCIpXG5cdH1cbn0pO1xuXG5hcHBlbmRUb0NvbW1hbmRQYWxldHRlKHtcblx0aWQ6IFNBVkVfRklMRV9BU19DT01NQU5EX0lELFxuXHR0aXRsZTogU0FWRV9GSUxFX0FTX0xBQkVMLFxuXHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlXG59LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSk7XG5cbmFwcGVuZFRvQ29tbWFuZFBhbGV0dGUoe1xuXHRpZDogTkVXX0ZJTEVfQ09NTUFORF9JRCxcblx0dGl0bGU6IE5FV19GSUxFX0xBQkVMLFxuXHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlXG59LCBDb250ZXh0S2V5RXhwci5hbmQoV29ya3NwYWNlRm9sZGVyQ291bnRDb250ZXh0Lm5vdEVxdWFsc1RvKCcwJyksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKSk7XG5cbmFwcGVuZFRvQ29tbWFuZFBhbGV0dGUoe1xuXHRpZDogTkVXX0ZPTERFUl9DT01NQU5EX0lELFxuXHR0aXRsZTogTkVXX0ZPTERFUl9MQUJFTCxcblx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRmlsZSxcblx0bWV0YWRhdGE6IHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ25ld0ZvbGRlckRlc2NyaXB0aW9uJywgXCJDcmVhdGUgYSBuZXcgZm9sZGVyIG9yIGRpcmVjdG9yeVwiKSB9XG59LCBDb250ZXh0S2V5RXhwci5hbmQoV29ya3NwYWNlRm9sZGVyQ291bnRDb250ZXh0Lm5vdEVxdWFsc1RvKCcwJyksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKSk7XG5cbmFwcGVuZFRvQ29tbWFuZFBhbGV0dGUoe1xuXHRpZDogTkVXX1VOVElUTEVEX0ZJTEVfQ09NTUFORF9JRCxcblx0dGl0bGU6IE5FV19VTlRJVExFRF9GSUxFX0xBQkVMLFxuXHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlXG59LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSk7XG5cbi8vIE1lbnUgcmVnaXN0cmF0aW9uIC0gb3BlbiBlZGl0b3JzXG5cbmNvbnN0IGlzRmlsZU9yVW50aXRsZWRSZXNvdXJjZUNvbnRleHRLZXkgPSBDb250ZXh0S2V5RXhwci5vcihSZXNvdXJjZUNvbnRleHRLZXkuSXNGaWxlU3lzdGVtUmVzb3VyY2UsIFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudW50aXRsZWQpKTtcblxuY29uc3Qgb3BlblRvU2lkZUNvbW1hbmQgPSB7XG5cdGlkOiBPUEVOX1RPX1NJREVfQ09NTUFORF9JRCxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnb3BlblRvU2lkZScsIFwiT3BlbiB0byB0aGUgU2lkZVwiKVxufTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuT3BlbkVkaXRvcnNDb250ZXh0LCB7XG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdG9yZGVyOiAxMCxcblx0Y29tbWFuZDogb3BlblRvU2lkZUNvbW1hbmQsXG5cdHdoZW46IGlzRmlsZU9yVW50aXRsZWRSZXNvdXJjZUNvbnRleHRLZXlcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk9wZW5FZGl0b3JzQ29udGV4dCwge1xuXHRncm91cDogJzFfb3BlbicsXG5cdG9yZGVyOiAxMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBSRU9QRU5fV0lUSF9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3Jlb3BlbldpdGgnLCBcIlJlb3BlbiBFZGl0b3IgV2l0aC4uLlwiKVxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Ly8gRWRpdG9ycyB3aXRoIEF2YWlsYWJsZSBDaG9pY2VzIHRvIE9wZW4gV2l0aFxuXHRcdEFjdGl2ZUVkaXRvckF2YWlsYWJsZUVkaXRvcklkc0NvbnRleHQsXG5cdFx0Ly8gTm90OiBlZGl0b3IgZ3JvdXBzXG5cdFx0T3BlbkVkaXRvcnNHcm91cENvbnRleHQudG9OZWdhdGVkKClcblx0KVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuT3BlbkVkaXRvcnNDb250ZXh0LCB7XG5cdGdyb3VwOiAnMV9jdXRjb3B5cGFzdGUnLFxuXHRvcmRlcjogMTAsXG5cdGNvbW1hbmQ6IGNvcHlQYXRoQ29tbWFuZCxcblx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LklzRmlsZVN5c3RlbVJlc291cmNlXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5PcGVuRWRpdG9yc0NvbnRleHQsIHtcblx0Z3JvdXA6ICcxX2N1dGNvcHlwYXN0ZScsXG5cdG9yZGVyOiAyMCxcblx0Y29tbWFuZDogY29weVJlbGF0aXZlUGF0aENvbW1hbmQsXG5cdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5Jc0ZpbGVTeXN0ZW1SZXNvdXJjZVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuT3BlbkVkaXRvcnNDb250ZXh0LCB7XG5cdGdyb3VwOiAnMl9zYXZlJyxcblx0b3JkZXI6IDEwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFNBVkVfRklMRV9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBTQVZFX0ZJTEVfTEFCRUwsXG5cdFx0cHJlY29uZGl0aW9uOiBPcGVuRWRpdG9yc0RpcnR5RWRpdG9yQ29udGV4dFxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihcblx0XHQvLyBVbnRpdGxlZCBFZGl0b3JzXG5cdFx0UmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy51bnRpdGxlZCksXG5cdFx0Ly8gT3I6XG5cdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Ly8gTm90OiBlZGl0b3IgZ3JvdXBzXG5cdFx0XHRPcGVuRWRpdG9yc0dyb3VwQ29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdC8vIE5vdDogcmVhZG9ubHkgZWRpdG9yc1xuXHRcdFx0T3BlbkVkaXRvcnNSZWFkb25seUVkaXRvckNvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0XHQvLyBOb3Q6IGF1dG8gc2F2ZSBhZnRlciBzaG9ydCBkZWxheVxuXHRcdFx0QXV0b1NhdmVBZnRlclNob3J0RGVsYXlDb250ZXh0LnRvTmVnYXRlZCgpXG5cdFx0KVxuXHQpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5PcGVuRWRpdG9yc0NvbnRleHQsIHtcblx0Z3JvdXA6ICcyX3NhdmUnLFxuXHRvcmRlcjogMjAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogUkVWRVJUX0ZJTEVfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdyZXZlcnQnLCBcIlJldmVydCBGaWxlXCIpLFxuXHRcdHByZWNvbmRpdGlvbjogT3BlbkVkaXRvcnNEaXJ0eUVkaXRvckNvbnRleHRcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdC8vIE5vdDogZWRpdG9yIGdyb3Vwc1xuXHRcdE9wZW5FZGl0b3JzR3JvdXBDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdC8vIE5vdDogcmVhZG9ubHkgZWRpdG9yc1xuXHRcdE9wZW5FZGl0b3JzUmVhZG9ubHlFZGl0b3JDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdC8vIE5vdDogdW50aXRsZWQgZWRpdG9ycyAocmV2ZXJ0IGNsb3NlcyB0aGVtKVxuXHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUubm90RXF1YWxzVG8oU2NoZW1hcy51bnRpdGxlZCksXG5cdFx0Ly8gTm90OiBhdXRvIHNhdmUgYWZ0ZXIgc2hvcnQgZGVsYXlcblx0XHRBdXRvU2F2ZUFmdGVyU2hvcnREZWxheUNvbnRleHQudG9OZWdhdGVkKClcblx0KVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuT3BlbkVkaXRvcnNDb250ZXh0LCB7XG5cdGdyb3VwOiAnMl9zYXZlJyxcblx0b3JkZXI6IDMwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFNBVkVfQUxMX0lOX0dST1VQX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnc2F2ZUFsbCcsIFwiU2F2ZSBBbGxcIiksXG5cdFx0cHJlY29uZGl0aW9uOiBEaXJ0eVdvcmtpbmdDb3BpZXNDb250ZXh0XG5cdH0sXG5cdC8vIEVkaXRvciBHcm91cFxuXHR3aGVuOiBPcGVuRWRpdG9yc0dyb3VwQ29udGV4dFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuT3BlbkVkaXRvcnNDb250ZXh0LCB7XG5cdGdyb3VwOiAnM19jb21wYXJlJyxcblx0b3JkZXI6IDEwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENPTVBBUkVfV0lUSF9TQVZFRF9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NvbXBhcmVXaXRoU2F2ZWQnLCBcIkNvbXBhcmUgd2l0aCBTYXZlZFwiKSxcblx0XHRwcmVjb25kaXRpb246IE9wZW5FZGl0b3JzRGlydHlFZGl0b3JDb250ZXh0XG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChSZXNvdXJjZUNvbnRleHRLZXkuSXNGaWxlU3lzdGVtUmVzb3VyY2UsIEF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5Q29udGV4dC50b05lZ2F0ZWQoKSwgV29ya2JlbmNoTGlzdERvdWJsZVNlbGVjdGlvbi50b05lZ2F0ZWQoKSlcbn0pO1xuXG5jb25zdCBjb21wYXJlUmVzb3VyY2VDb21tYW5kID0ge1xuXHRpZDogQ09NUEFSRV9SRVNPVVJDRV9DT01NQU5EX0lELFxuXHR0aXRsZTogbmxzLmxvY2FsaXplKCdjb21wYXJlV2l0aFNlbGVjdGVkJywgXCJDb21wYXJlIHdpdGggU2VsZWN0ZWRcIilcbn07XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk9wZW5FZGl0b3JzQ29udGV4dCwge1xuXHRncm91cDogJzNfY29tcGFyZScsXG5cdG9yZGVyOiAyMCxcblx0Y29tbWFuZDogY29tcGFyZVJlc291cmNlQ29tbWFuZCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFJlc291cmNlQ29udGV4dEtleS5IYXNSZXNvdXJjZSwgUmVzb3VyY2VTZWxlY3RlZEZvckNvbXBhcmVDb250ZXh0LCBpc0ZpbGVPclVudGl0bGVkUmVzb3VyY2VDb250ZXh0S2V5LCBXb3JrYmVuY2hMaXN0RG91YmxlU2VsZWN0aW9uLnRvTmVnYXRlZCgpKVxufSk7XG5cbmNvbnN0IHNlbGVjdEZvckNvbXBhcmVDb21tYW5kID0ge1xuXHRpZDogU0VMRUNUX0ZPUl9DT01QQVJFX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ2NvbXBhcmVTb3VyY2UnLCBcIlNlbGVjdCBmb3IgQ29tcGFyZVwiKVxufTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuT3BlbkVkaXRvcnNDb250ZXh0LCB7XG5cdGdyb3VwOiAnM19jb21wYXJlJyxcblx0b3JkZXI6IDMwLFxuXHRjb21tYW5kOiBzZWxlY3RGb3JDb21wYXJlQ29tbWFuZCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFJlc291cmNlQ29udGV4dEtleS5IYXNSZXNvdXJjZSwgaXNGaWxlT3JVbnRpdGxlZFJlc291cmNlQ29udGV4dEtleSwgV29ya2JlbmNoTGlzdERvdWJsZVNlbGVjdGlvbi50b05lZ2F0ZWQoKSlcbn0pO1xuXG5jb25zdCBjb21wYXJlU2VsZWN0ZWRDb21tYW5kID0ge1xuXHRpZDogQ09NUEFSRV9TRUxFQ1RFRF9DT01NQU5EX0lELFxuXHR0aXRsZTogbmxzLmxvY2FsaXplKCdjb21wYXJlU2VsZWN0ZWQnLCBcIkNvbXBhcmUgU2VsZWN0ZWRcIilcbn07XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk9wZW5FZGl0b3JzQ29udGV4dCwge1xuXHRncm91cDogJzNfY29tcGFyZScsXG5cdG9yZGVyOiAzMCxcblx0Y29tbWFuZDogY29tcGFyZVNlbGVjdGVkQ29tbWFuZCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFJlc291cmNlQ29udGV4dEtleS5IYXNSZXNvdXJjZSwgV29ya2JlbmNoTGlzdERvdWJsZVNlbGVjdGlvbiwgT3BlbkVkaXRvcnNTZWxlY3RlZEZpbGVPclVudGl0bGVkQ29udGV4dClcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlQ29udGV4dCwge1xuXHRncm91cDogJzFfY29tcGFyZScsXG5cdG9yZGVyOiAzMCxcblx0Y29tbWFuZDogY29tcGFyZVNlbGVjdGVkQ29tbWFuZCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFJlc291cmNlQ29udGV4dEtleS5IYXNSZXNvdXJjZSwgVHdvRWRpdG9yc1NlbGVjdGVkSW5Hcm91cENvbnRleHQsIFNlbGVjdGVkRWRpdG9yc0luR3JvdXBGaWxlT3JVbnRpdGxlZFJlc291cmNlQ29udGV4dEtleSlcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk9wZW5FZGl0b3JzQ29udGV4dCwge1xuXHRncm91cDogJzRfY2xvc2UnLFxuXHRvcmRlcjogMTAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQ0xPU0VfRURJVE9SX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2xvc2UnLCBcIkNsb3NlXCIpXG5cdH0sXG5cdHdoZW46IE9wZW5FZGl0b3JzR3JvdXBDb250ZXh0LnRvTmVnYXRlZCgpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5PcGVuRWRpdG9yc0NvbnRleHQsIHtcblx0Z3JvdXA6ICc0X2Nsb3NlJyxcblx0b3JkZXI6IDIwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENMT1NFX09USEVSX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdjbG9zZU90aGVycycsIFwiQ2xvc2UgT3RoZXJzXCIpXG5cdH0sXG5cdHdoZW46IE9wZW5FZGl0b3JzR3JvdXBDb250ZXh0LnRvTmVnYXRlZCgpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5PcGVuRWRpdG9yc0NvbnRleHQsIHtcblx0Z3JvdXA6ICc0X2Nsb3NlJyxcblx0b3JkZXI6IDMwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENMT1NFX1NBVkVEX0VESVRPUlNfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdjbG9zZVNhdmVkJywgXCJDbG9zZSBTYXZlZFwiKVxuXHR9XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5PcGVuRWRpdG9yc0NvbnRleHQsIHtcblx0Z3JvdXA6ICc0X2Nsb3NlJyxcblx0b3JkZXI6IDQwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENMT1NFX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdjbG9zZUFsbCcsIFwiQ2xvc2UgQWxsXCIpXG5cdH1cbn0pO1xuXG4vLyBNZW51IHJlZ2lzdHJhdGlvbiAtIGV4cGxvcmVyXG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB7XG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdG9yZGVyOiA0LFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IE5FV19GSUxFX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IE5FV19GSUxFX0xBQkVMLFxuXHRcdHByZWNvbmRpdGlvbjogRXhwbG9yZXJSZXNvdXJjZVdyaXRhYmxlQ29udGV4dFxuXHR9LFxuXHR3aGVuOiBFeHBsb3JlckZvbGRlckNvbnRleHRcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkV4cGxvcmVyQ29udGV4dCwge1xuXHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRvcmRlcjogNixcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBORVdfRk9MREVSX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IE5FV19GT0xERVJfTEFCRUwsXG5cdFx0cHJlY29uZGl0aW9uOiBFeHBsb3JlclJlc291cmNlV3JpdGFibGVDb250ZXh0XG5cdH0sXG5cdHdoZW46IEV4cGxvcmVyRm9sZGVyQ29udGV4dFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB7XG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdG9yZGVyOiAxMCxcblx0Y29tbWFuZDogb3BlblRvU2lkZUNvbW1hbmQsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFeHBsb3JlckZvbGRlckNvbnRleHQudG9OZWdhdGVkKCksIFJlc291cmNlQ29udGV4dEtleS5IYXNSZXNvdXJjZSlcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkV4cGxvcmVyQ29udGV4dCwge1xuXHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRvcmRlcjogMjAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogT1BFTl9XSVRIX0VYUExPUkVSX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnZXhwbG9yZXJPcGVuV2l0aCcsIFwiT3BlbiBXaXRoLi4uXCIpLFxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRXhwbG9yZXJGb2xkZXJDb250ZXh0LnRvTmVnYXRlZCgpLCBFeHBsb3JlclJlc291cmNlQXZhaWxhYmxlRWRpdG9ySWRzQ29udGV4dCksXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FeHBsb3JlckNvbnRleHQsIHtcblx0Z3JvdXA6ICczX2NvbXBhcmUnLFxuXHRvcmRlcjogMjAsXG5cdGNvbW1hbmQ6IGNvbXBhcmVSZXNvdXJjZUNvbW1hbmQsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFeHBsb3JlckZvbGRlckNvbnRleHQudG9OZWdhdGVkKCksIFJlc291cmNlQ29udGV4dEtleS5IYXNSZXNvdXJjZSwgUmVzb3VyY2VTZWxlY3RlZEZvckNvbXBhcmVDb250ZXh0LCBXb3JrYmVuY2hMaXN0RG91YmxlU2VsZWN0aW9uLnRvTmVnYXRlZCgpKVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB7XG5cdGdyb3VwOiAnM19jb21wYXJlJyxcblx0b3JkZXI6IDMwLFxuXHRjb21tYW5kOiBzZWxlY3RGb3JDb21wYXJlQ29tbWFuZCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEV4cGxvcmVyRm9sZGVyQ29udGV4dC50b05lZ2F0ZWQoKSwgUmVzb3VyY2VDb250ZXh0S2V5Lkhhc1Jlc291cmNlLCBXb3JrYmVuY2hMaXN0RG91YmxlU2VsZWN0aW9uLnRvTmVnYXRlZCgpKVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB7XG5cdGdyb3VwOiAnM19jb21wYXJlJyxcblx0b3JkZXI6IDMwLFxuXHRjb21tYW5kOiBjb21wYXJlU2VsZWN0ZWRDb21tYW5kLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRXhwbG9yZXJGb2xkZXJDb250ZXh0LnRvTmVnYXRlZCgpLCBSZXNvdXJjZUNvbnRleHRLZXkuSGFzUmVzb3VyY2UsIFdvcmtiZW5jaExpc3REb3VibGVTZWxlY3Rpb24pXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FeHBsb3JlckNvbnRleHQsIHtcblx0Z3JvdXA6ICc1X2N1dGNvcHlwYXN0ZScsXG5cdG9yZGVyOiA4LFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENVVF9GSUxFX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2N1dCcsIFwiQ3V0XCIpLFxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRXhwbG9yZXJSb290Q29udGV4dC50b05lZ2F0ZWQoKSwgRXhwbG9yZXJSZXNvdXJjZVdyaXRhYmxlQ29udGV4dClcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkV4cGxvcmVyQ29udGV4dCwge1xuXHRncm91cDogJzVfY3V0Y29weXBhc3RlJyxcblx0b3JkZXI6IDEwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENPUFlfRklMRV9JRCxcblx0XHR0aXRsZTogQ09QWV9GSUxFX0xBQkVMLFxuXHR9LFxuXHR3aGVuOiBFeHBsb3JlclJvb3RDb250ZXh0LnRvTmVnYXRlZCgpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FeHBsb3JlckNvbnRleHQsIHtcblx0Z3JvdXA6ICc1X2N1dGNvcHlwYXN0ZScsXG5cdG9yZGVyOiAyMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBQQVNURV9GSUxFX0lELFxuXHRcdHRpdGxlOiBQQVNURV9GSUxFX0xBQkVMLFxuXHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEV4cGxvcmVyUmVzb3VyY2VXcml0YWJsZUNvbnRleHQsIEZpbGVDb3BpZWRDb250ZXh0KVxuXHR9LFxuXHR3aGVuOiBFeHBsb3JlckZvbGRlckNvbnRleHRcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkV4cGxvcmVyQ29udGV4dCwgKHtcblx0Z3JvdXA6ICc1Yl9pbXBvcnRleHBvcnQnLFxuXHRvcmRlcjogMTAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogRE9XTkxPQURfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogRE9XTkxPQURfTEFCRUxcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0Ly8gbmF0aXZlOiBmb3IgYW55IHJlbW90ZSByZXNvdXJjZVxuXHRcdENvbnRleHRLZXlFeHByLmFuZChJc1dlYkNvbnRleHQudG9OZWdhdGVkKCksIFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUubm90RXF1YWxzVG8oU2NoZW1hcy5maWxlKSksXG5cdFx0Ly8gd2ViOiBmb3IgYW55IGZpbGVzXG5cdFx0Q29udGV4dEtleUV4cHIuYW5kKElzV2ViQ29udGV4dCwgRXhwbG9yZXJGb2xkZXJDb250ZXh0LnRvTmVnYXRlZCgpLCBFeHBsb3JlclJvb3RDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0XHQvLyB3ZWI6IGZvciBhbnkgZm9sZGVycyBpZiBmaWxlIHN5c3RlbSBBUEkgc3VwcG9ydCBpcyBwcm92aWRlZFxuXHRcdENvbnRleHRLZXlFeHByLmFuZChJc1dlYkNvbnRleHQsIEhhc1dlYkZpbGVTeXN0ZW1BY2Nlc3MpXG5cdClcbn0pKTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FeHBsb3JlckNvbnRleHQsICh7XG5cdGdyb3VwOiAnNWJfaW1wb3J0ZXhwb3J0Jyxcblx0b3JkZXI6IDIwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFVQTE9BRF9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBVUExPQURfTEFCRUwsXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHQvLyBvbmx5IGluIHdlYlxuXHRcdElzV2ViQ29udGV4dCxcblx0XHQvLyBvbmx5IG9uIGZvbGRlcnNcblx0XHRFeHBsb3JlckZvbGRlckNvbnRleHQsXG5cdFx0Ly8gb25seSBvbiB3cml0YWJsZSBmb2xkZXJzXG5cdFx0RXhwbG9yZXJSZXNvdXJjZVdyaXRhYmxlQ29udGV4dFxuXHQpXG59KSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB7XG5cdGdyb3VwOiAnNl9jb3B5cGF0aCcsXG5cdG9yZGVyOiAxMCxcblx0Y29tbWFuZDogY29weVBhdGhDb21tYW5kLFxuXHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuSXNGaWxlU3lzdGVtUmVzb3VyY2Vcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkV4cGxvcmVyQ29udGV4dCwge1xuXHRncm91cDogJzZfY29weXBhdGgnLFxuXHRvcmRlcjogMjAsXG5cdGNvbW1hbmQ6IGNvcHlSZWxhdGl2ZVBhdGhDb21tYW5kLFxuXHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuSXNGaWxlU3lzdGVtUmVzb3VyY2Vcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkV4cGxvcmVyQ29udGV4dCwge1xuXHRncm91cDogJzJfd29ya3NwYWNlJyxcblx0b3JkZXI6IDEwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IEFERF9ST09UX0ZPTERFUl9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBBRERfUk9PVF9GT0xERVJfTEFCRUwsXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFeHBsb3JlclJvb3RDb250ZXh0LCBDb250ZXh0S2V5RXhwci5vcihFbnRlck11bHRpUm9vdFdvcmtzcGFjZVN1cHBvcnRDb250ZXh0LCBXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKSkpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FeHBsb3JlckNvbnRleHQsIHtcblx0Z3JvdXA6ICcyX3dvcmtzcGFjZScsXG5cdG9yZGVyOiAzMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBSRU1PVkVfUk9PVF9GT0xERVJfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogUkVNT1ZFX1JPT1RfRk9MREVSX0xBQkVMLFxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRXhwbG9yZXJSb290Q29udGV4dCwgRXhwbG9yZXJGb2xkZXJDb250ZXh0LCBDb250ZXh0S2V5RXhwci5hbmQoV29ya3NwYWNlRm9sZGVyQ291bnRDb250ZXh0Lm5vdEVxdWFsc1RvKCcwJyksIENvbnRleHRLZXlFeHByLm9yKEVudGVyTXVsdGlSb290V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIFdvcmtiZW5jaFN0YXRlQ29udGV4dC5pc0VxdWFsVG8oJ3dvcmtzcGFjZScpKSkpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FeHBsb3JlckNvbnRleHQsIHtcblx0Z3JvdXA6ICc3X21vZGlmaWNhdGlvbicsXG5cdG9yZGVyOiAxMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBSRU5BTUVfSUQsXG5cdFx0dGl0bGU6IFRSSUdHRVJfUkVOQU1FX0xBQkVMLFxuXHRcdHByZWNvbmRpdGlvbjogRXhwbG9yZXJSZXNvdXJjZVdyaXRhYmxlQ29udGV4dCxcblx0fSxcblx0d2hlbjogRXhwbG9yZXJSb290Q29udGV4dC50b05lZ2F0ZWQoKVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB7XG5cdGdyb3VwOiAnN19tb2RpZmljYXRpb24nLFxuXHRvcmRlcjogMjAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogTU9WRV9GSUxFX1RPX1RSQVNIX0lELFxuXHRcdHRpdGxlOiBNT1ZFX0ZJTEVfVE9fVFJBU0hfTEFCRUxcblx0fSxcblx0YWx0OiB7XG5cdFx0aWQ6IERFTEVURV9GSUxFX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2RlbGV0ZUZpbGUnLCBcIkRlbGV0ZSBQZXJtYW5lbnRseVwiKVxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRXhwbG9yZXJSb290Q29udGV4dC50b05lZ2F0ZWQoKSwgRXhwbG9yZXJSZXNvdXJjZU1vdmVhYmxlVG9UcmFzaClcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkV4cGxvcmVyQ29udGV4dCwge1xuXHRncm91cDogJzdfbW9kaWZpY2F0aW9uJyxcblx0b3JkZXI6IDIwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IERFTEVURV9GSUxFX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2RlbGV0ZUZpbGUnLCBcIkRlbGV0ZSBQZXJtYW5lbnRseVwiKVxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRXhwbG9yZXJSb290Q29udGV4dC50b05lZ2F0ZWQoKSwgRXhwbG9yZXJSZXNvdXJjZU1vdmVhYmxlVG9UcmFzaC50b05lZ2F0ZWQoKSlcbn0pO1xuXG4vLyBFbXB0eSBFZGl0b3IgR3JvdXAgLyBFZGl0b3IgVGFicyBDb250YWluZXIgQ29udGV4dCBNZW51XG5mb3IgKGNvbnN0IG1lbnVJZCBvZiBbTWVudUlkLkVtcHR5RWRpdG9yR3JvdXBDb250ZXh0LCBNZW51SWQuRWRpdG9yVGFic0JhckNvbnRleHRdKSB7XG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51SWQsIHsgY29tbWFuZDogeyBpZDogTkVXX1VOVElUTEVEX0ZJTEVfQ09NTUFORF9JRCwgdGl0bGU6IG5scy5sb2NhbGl6ZSgnbmV3RmlsZScsIFwiTmV3IFRleHQgRmlsZVwiKSB9LCBncm91cDogJzFfZmlsZScsIG9yZGVyOiAxMCB9KTtcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwgeyBjb21tYW5kOiB7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW4nLCB0aXRsZTogbmxzLmxvY2FsaXplKCdvcGVuRmlsZScsIFwiT3BlbiBGaWxlLi4uXCIpIH0sIGdyb3VwOiAnMV9maWxlJywgb3JkZXI6IDIwIH0pO1xufVxuXG4vLyBGaWxlIG1lbnVcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0Z3JvdXA6ICcxX25ldycsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogTkVXX1VOVElUTEVEX0ZJTEVfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlOZXdGaWxlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTmV3IFRleHQgRmlsZVwiKVxuXHR9LFxuXHRvcmRlcjogMVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdGdyb3VwOiAnNF9zYXZlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBTQVZFX0ZJTEVfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlTYXZlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmU2F2ZVwiKSxcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKEFjdGl2ZUVkaXRvckNvbnRleHQsIENvbnRleHRLZXlFeHByLmFuZChGb2xkZXJzVmlld1Zpc2libGVDb250ZXh0LCBTaWRlYmFyRm9jdXNDb250ZXh0KSlcblx0fSxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRncm91cDogJzRfc2F2ZScsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU0FWRV9GSUxFX0FTX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pU2F2ZUFzJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlNhdmUgJiZBcy4uLlwiKSxcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKEFjdGl2ZUVkaXRvckNvbnRleHQsIENvbnRleHRLZXlFeHByLmFuZChGb2xkZXJzVmlld1Zpc2libGVDb250ZXh0LCBTaWRlYmFyRm9jdXNDb250ZXh0KSlcblx0fSxcblx0b3JkZXI6IDJcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRncm91cDogJzRfc2F2ZScsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU0FWRV9BTExfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlTYXZlQWxsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlNhdmUgQSYmbGxcIiksXG5cdFx0cHJlY29uZGl0aW9uOiBEaXJ0eVdvcmtpbmdDb3BpZXNDb250ZXh0XG5cdH0sXG5cdG9yZGVyOiAzXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0Z3JvdXA6ICc1X2F1dG9zYXZlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBUb2dnbGVBdXRvU2F2ZUFjdGlvbi5JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlBdXRvU2F2ZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJBJiZ1dG8gU2F2ZVwiKSxcblx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2NvbmZpZy5maWxlcy5hdXRvU2F2ZScsICdvZmYnKVxuXHR9LFxuXHRvcmRlcjogMVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdGdyb3VwOiAnNl9jbG9zZScsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogUkVWRVJUX0ZJTEVfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlSZXZlcnQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiUmUmJnZlcnQgRmlsZVwiKSxcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0Ly8gQWN0aXZlIGVkaXRvciBjYW4gcmV2ZXJ0XG5cdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoQWN0aXZlRWRpdG9yQ2FuUmV2ZXJ0Q29udGV4dCksXG5cdFx0XHQvLyBFeHBsb3JlciBmb2N1c2VkIGJ1dCBub3Qgb24gdW50aXRsZWRcblx0XHRcdENvbnRleHRLZXlFeHByLmFuZChSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLm5vdEVxdWFsc1RvKFNjaGVtYXMudW50aXRsZWQpLCBGb2xkZXJzVmlld1Zpc2libGVDb250ZXh0LCBTaWRlYmFyRm9jdXNDb250ZXh0KVxuXHRcdCksXG5cdH0sXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0Z3JvdXA6ICc2X2Nsb3NlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBDTE9TRV9FRElUT1JfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlDbG9zZUVkaXRvcicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNsb3NlIEVkaXRvclwiKSxcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKEFjdGl2ZUVkaXRvckNvbnRleHQsIENvbnRleHRLZXlFeHByLmFuZChGb2xkZXJzVmlld1Zpc2libGVDb250ZXh0LCBTaWRlYmFyRm9jdXNDb250ZXh0KSlcblx0fSxcblx0b3JkZXI6IDJcbn0pO1xuXG4vLyBHbyB0byBtZW51XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckdvTWVudSwge1xuXHRncm91cDogJzNfZ2xvYmFsX25hdicsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ucXVpY2tPcGVuJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlHb3RvRmlsZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJHbyB0byAmJkZpbGUuLi5cIilcblx0fSxcblx0b3JkZXI6IDFcbn0pO1xuXG5cbi8vIENoYXQgdXNlZCBhdHRhY2htZW50IGFuY2hvciBjb250ZXh0IG1lbnVcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5DaGF0QXR0YWNobWVudHNDb250ZXh0LCB7XG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdG9yZGVyOiAxMCxcblx0Y29tbWFuZDogb3BlblRvU2lkZUNvbW1hbmQsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChSZXNvdXJjZUNvbnRleHRLZXkuSXNGaWxlU3lzdGVtUmVzb3VyY2UsIEV4cGxvcmVyRm9sZGVyQ29udGV4dC50b05lZ2F0ZWQoKSlcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNoYXRBdHRhY2htZW50c0NvbnRleHQsIHtcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0b3JkZXI6IDIwLFxuXHRjb21tYW5kOiByZXZlYWxJblNpZGVCYXJDb21tYW5kLFxuXHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuSXNGaWxlU3lzdGVtUmVzb3VyY2Vcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNoYXRBdHRhY2htZW50c0NvbnRleHQsIHtcblx0Z3JvdXA6ICcxX2N1dGNvcHlwYXN0ZScsXG5cdG9yZGVyOiAxMCxcblx0Y29tbWFuZDogY29weVBhdGhDb21tYW5kLFxuXHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuSXNGaWxlU3lzdGVtUmVzb3VyY2Vcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNoYXRBdHRhY2htZW50c0NvbnRleHQsIHtcblx0Z3JvdXA6ICcxX2N1dGNvcHlwYXN0ZScsXG5cdG9yZGVyOiAyMCxcblx0Y29tbWFuZDogY29weVJlbGF0aXZlUGF0aENvbW1hbmQsXG5cdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5Jc0ZpbGVTeXN0ZW1SZXNvdXJjZVxufSk7XG5cbi8vIENoYXQgcmVzb3VyY2UgYW5jaG9yIGF0dGFjaG1lbnRzL2FuY2hvcnMgY29udGV4dCBtZW51XG5cbmZvciAoY29uc3QgbWVudUlkIG9mIFtNZW51SWQuQ2hhdElubGluZVJlc291cmNlQW5jaG9yQ29udGV4dCwgTWVudUlkLkNoYXRJbnB1dFJlc291cmNlQXR0YWNobWVudENvbnRleHRdKSB7XG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51SWQsIHtcblx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdG9yZGVyOiAxMCxcblx0XHRjb21tYW5kOiBvcGVuVG9TaWRlQ29tbWFuZCxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoUmVzb3VyY2VDb250ZXh0S2V5Lkhhc1Jlc291cmNlLCBFeHBsb3JlckZvbGRlckNvbnRleHQudG9OZWdhdGVkKCkpXG5cdH0pO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51SWQsIHtcblx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdG9yZGVyOiAyMCxcblx0XHRjb21tYW5kOiByZXZlYWxJblNpZGVCYXJDb21tYW5kLFxuXHRcdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5Jc0ZpbGVTeXN0ZW1SZXNvdXJjZVxuXHR9KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0obWVudUlkLCB7XG5cdFx0Z3JvdXA6ICcxX2N1dGNvcHlwYXN0ZScsXG5cdFx0b3JkZXI6IDEwLFxuXHRcdGNvbW1hbmQ6IGNvcHlQYXRoQ29tbWFuZCxcblx0XHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuSXNGaWxlU3lzdGVtUmVzb3VyY2Vcblx0fSk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdGdyb3VwOiAnMV9jdXRjb3B5cGFzdGUnLFxuXHRcdG9yZGVyOiAyMCxcblx0XHRjb21tYW5kOiBjb3B5UmVsYXRpdmVQYXRoQ29tbWFuZCxcblx0XHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuSXNGaWxlU3lzdGVtUmVzb3VyY2Vcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxzQkFBc0Isb0JBQW9CLDhCQUE4QiwwQkFBMEIsNEJBQTRCLHFCQUFxQixnQkFBZ0IsdUJBQXVCLGtCQUFrQixzQkFBc0IsMEJBQTBCLGlCQUFpQixrQkFBa0IsbUJBQW1CLGVBQWUsd0JBQXdCLGlCQUFpQixrQkFBa0IsbUJBQW1CLGdCQUFnQixxQkFBcUIsOEJBQThCLGdCQUFnQixnQ0FBZ0MsbUJBQW1CLGNBQWMsbUNBQW1DLGtDQUFrQyxtQ0FBbUMscUNBQXFDLDBDQUEwQztBQUNudUIsU0FBUywyQkFBMkIsMkJBQTJCLG1DQUFtQztBQUNsRyxTQUFTLFFBQVEsY0FBYyx1QkFBdUI7QUFFdEQsU0FBUyxRQUFRLGVBQWU7QUFDaEMsU0FBUyxtQkFBbUIsd0JBQXdCO0FBQ3BELFNBQVMsc0JBQXNCLCtCQUErQix5QkFBeUIsd0JBQXdCLHNCQUFzQixpQkFBaUIseUJBQXlCLG9CQUFvQiw4QkFBOEIseUJBQXlCLCtCQUErQiw2QkFBNkIsK0JBQStCLG1DQUFtQywrQkFBK0IsNkJBQTZCLCtCQUErQiwwQkFBMEIsdUJBQXVCLCtCQUErQix5Q0FBeUMsb0NBQW9DLGtDQUFrQywrQkFBK0IsOEJBQThCLHlCQUF5QixxQkFBcUIsZ0RBQWdEO0FBQzd5QixTQUFTLHdCQUF5QztBQUNsRCxTQUFTLHNCQUE0QztBQUNyRCxTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBUyw2QkFBNkIscUJBQXFCLHVCQUF1QixpQ0FBaUMscUJBQXFCLGlDQUFpQywyQ0FBMkMsaUNBQWlDO0FBQ3JQLFNBQVMsNEJBQTRCLDZCQUE2QjtBQUNsRSxTQUFTLGdD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
