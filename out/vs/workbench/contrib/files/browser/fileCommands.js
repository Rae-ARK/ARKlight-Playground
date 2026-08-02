import * as nls from "../../../../nls.js";
import { EditorResourceAccessor, isEditorCommandsContext, SideBySideEditor, SaveReason, EditorsOrder, EditorInputCapabilities } from "../../../common/editor.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { isWorkspaceToOpen } from "../../../../platform/window/common/window.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IWorkspaceContextService, UNTITLED_WORKSPACE_NAME } from "../../../../platform/workspace/common/workspace.js";
import { ExplorerFocusCondition, TextFileContentProvider, VIEWLET_ID, ExplorerCompressedFocusContext, ExplorerCompressedFirstFocusContext, ExplorerCompressedLastFocusContext, FilesExplorerFocusCondition, ExplorerFolderContext, VIEW_ID } from "../common/files.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IContextKeyService, ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyMod, KeyCode, KeyChord } from "../../../../base/common/keyCodes.js";
import { isWeb, isWindows } from "../../../../base/common/platform.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { getResourceForCommand, getMultiSelectedResources, getOpenEditorsViewMultiSelection, IExplorerService } from "./files.js";
import { IWorkspaceEditingService } from "../../../services/workspaces/common/workspaceEditing.js";
import { resolveCommandsContext } from "../../../browser/parts/editor/editorCommandsContext.js";
import { Schemas } from "../../../../base/common/network.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IEditorGroupsService, GroupsOrder } from "../../../services/editor/common/editorGroupsService.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { basename, joinPath, isEqual } from "../../../../base/common/resources.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { toAction } from "../../../../base/common/actions.js";
import { EditorOpenSource, EditorResolution } from "../../../../platform/editor/common/editor.js";
import { hash } from "../../../../base/common/hash.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { ViewContainerLocation } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { OPEN_TO_SIDE_COMMAND_ID, COMPARE_WITH_SAVED_COMMAND_ID, SELECT_FOR_COMPARE_COMMAND_ID, ResourceSelectedForCompareContext, COMPARE_SELECTED_COMMAND_ID, COMPARE_RESOURCE_COMMAND_ID, COPY_PATH_COMMAND_ID, COPY_RELATIVE_PATH_COMMAND_ID, REVEAL_IN_EXPLORER_COMMAND_ID, OPEN_WITH_EXPLORER_COMMAND_ID, SAVE_FILE_COMMAND_ID, SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID, SAVE_FILE_AS_COMMAND_ID, SAVE_ALL_COMMAND_ID, SAVE_ALL_IN_GROUP_COMMAND_ID, SAVE_FILES_COMMAND_ID, REVERT_FILE_COMMAND_ID, REMOVE_ROOT_FOLDER_COMMAND_ID, PREVIOUS_COMPRESSED_FOLDER, NEXT_COMPRESSED_FOLDER, FIRST_COMPRESSED_FOLDER, LAST_COMPRESSED_FOLDER, NEW_UNTITLED_FILE_COMMAND_ID, NEW_UNTITLED_FILE_LABEL, NEW_FILE_COMMAND_ID } from "./fileConstants.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { RemoveRootFolderAction } from "../../../browser/actions/workspaceActions.js";
import { OpenEditorsView } from "./views/openEditorsView.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
const openWindowCommand = (accessor, toOpen, options) => {
  if (Array.isArray(toOpen)) {
    const hostService = accessor.get(IHostService);
    const environmentService = accessor.get(IEnvironmentService);
    toOpen = toOpen.map((openable) => {
      if (isWorkspaceToOpen(openable) && openable.workspaceUri.scheme === Schemas.untitled) {
        return {
          workspaceUri: joinPath(environmentService.untitledWorkspacesHome, openable.workspaceUri.path, UNTITLED_WORKSPACE_NAME)
        };
      }
      return openable;
    });
    hostService.openWindow(toOpen, options);
  }
};
const newWindowCommand = (accessor, options) => {
  const hostService = accessor.get(IHostService);
  hostService.openWindow(options);
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  when: ExplorerFocusCondition,
  primary: KeyMod.CtrlCmd | KeyCode.Enter,
  mac: {
    primary: KeyMod.WinCtrl | KeyCode.Enter
  },
  id: OPEN_TO_SIDE_COMMAND_ID,
  handler: async (accessor, resource) => {
    const editorService = accessor.get(IEditorService);
    const fileService = accessor.get(IFileService);
    const explorerService = accessor.get(IExplorerService);
    const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService, accessor.get(IEditorGroupsService), explorerService);
    if (resources.length) {
      const untitledResources = resources.filter((resource2) => resource2.scheme === Schemas.untitled);
      const fileResources = resources.filter((resource2) => resource2.scheme !== Schemas.untitled);
      const items = await Promise.all(fileResources.map(async (resource2) => {
        const item = explorerService.findClosest(resource2);
        if (item) {
          return item;
        }
        return await fileService.stat(resource2);
      }));
      const files = items.filter((i) => !i.isDirectory);
      const editors = files.map((f) => ({
        resource: f.resource,
        options: { pinned: true }
      })).concat(...untitledResources.map((untitledResource) => ({ resource: untitledResource, options: { pinned: true } })));
      await editorService.openEditors(editors, SIDE_GROUP);
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib + 10,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerFolderContext.toNegated()),
  primary: KeyCode.Enter,
  mac: {
    primary: KeyMod.CtrlCmd | KeyCode.DownArrow
  },
  id: "explorer.openAndPassFocus",
  handler: async (accessor, _resource) => {
    const editorService = accessor.get(IEditorService);
    const explorerService = accessor.get(IExplorerService);
    const resources = explorerService.getContext(true);
    if (resources.length) {
      await editorService.openEditors(resources.map((r) => ({ resource: r.resource, options: { preserveFocus: false, pinned: true } })));
    }
  }
});
const COMPARE_WITH_SAVED_SCHEMA = "showModifications";
let providerDisposables = [];
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: COMPARE_WITH_SAVED_COMMAND_ID,
  when: void 0,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyD),
  handler: async (accessor, resource) => {
    const instantiationService = accessor.get(IInstantiationService);
    const textModelService = accessor.get(ITextModelService);
    const editorService = accessor.get(IEditorService);
    const fileService = accessor.get(IFileService);
    const listService = accessor.get(IListService);
    let registerEditorListener = false;
    if (providerDisposables.length === 0) {
      registerEditorListener = true;
      const provider = instantiationService.createInstance(TextFileContentProvider);
      providerDisposables.push(provider);
      providerDisposables.push(textModelService.registerTextModelContentProvider(COMPARE_WITH_SAVED_SCHEMA, provider));
    }
    const uri = getResourceForCommand(resource, editorService, listService);
    if (uri && fileService.hasProvider(uri)) {
      const name = basename(uri);
      const editorLabel = nls.localize("modifiedLabel", "{0} (in file) \u2194 {1}", name, name);
      try {
        await TextFileContentProvider.open(uri, COMPARE_WITH_SAVED_SCHEMA, editorLabel, editorService, { pinned: true });
        if (registerEditorListener) {
          providerDisposables.push(editorService.onDidVisibleEditorsChange(() => {
            if (!editorService.editors.some((editor) => !!EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY, filterByScheme: COMPARE_WITH_SAVED_SCHEMA }))) {
              providerDisposables = dispose(providerDisposables);
            }
          }));
        }
      } catch {
        providerDisposables = dispose(providerDisposables);
      }
    }
  }
});
let globalResourceToCompare;
let resourceSelectedForCompareContext;
CommandsRegistry.registerCommand({
  id: SELECT_FOR_COMPARE_COMMAND_ID,
  handler: (accessor, resource) => {
    globalResourceToCompare = getResourceForCommand(resource, accessor.get(IEditorService), accessor.get(IListService));
    if (!resourceSelectedForCompareContext) {
      resourceSelectedForCompareContext = ResourceSelectedForCompareContext.bindTo(accessor.get(IContextKeyService));
    }
    resourceSelectedForCompareContext.set(true);
  }
});
CommandsRegistry.registerCommand({
  id: COMPARE_SELECTED_COMMAND_ID,
  handler: async (accessor, resource) => {
    const editorService = accessor.get(IEditorService);
    const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService, accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
    if (resources.length === 2) {
      return editorService.openEditor({
        original: { resource: resources[0] },
        modified: { resource: resources[1] },
        options: { pinned: true }
      });
    }
    return true;
  }
});
CommandsRegistry.registerCommand({
  id: COMPARE_RESOURCE_COMMAND_ID,
  handler: (accessor, resource) => {
    const editorService = accessor.get(IEditorService);
    const rightResource = getResourceForCommand(resource, editorService, accessor.get(IListService));
    if (globalResourceToCompare && rightResource) {
      editorService.openEditor({
        original: { resource: globalResourceToCompare },
        modified: { resource: rightResource },
        options: { pinned: true }
      });
    }
  }
});
async function resourcesToClipboard(resources, relative, clipboardService, labelService, configurationService) {
  if (resources.length) {
    const lineDelimiter = isWindows ? "\r\n" : "\n";
    let separator = void 0;
    const copyRelativeOrFullPathSeparatorSection = relative ? "explorer.copyRelativePathSeparator" : "explorer.copyPathSeparator";
    const copyRelativeOrFullPathSeparator = configurationService.getValue(copyRelativeOrFullPathSeparatorSection);
    if (copyRelativeOrFullPathSeparator === "/" || copyRelativeOrFullPathSeparator === "\\") {
      separator = copyRelativeOrFullPathSeparator;
    }
    const text = resources.map((resource) => labelService.getUriLabel(resource, { relative, noPrefix: true, separator })).join(lineDelimiter);
    await clipboardService.writeText(text);
  }
}
const copyPathCommandHandler = async (accessor, resource) => {
  const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
  await resourcesToClipboard(resources, false, accessor.get(IClipboardService), accessor.get(ILabelService), accessor.get(IConfigurationService));
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  when: EditorContextKeys.focus.toNegated(),
  primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC,
  win: {
    primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyC
  },
  id: COPY_PATH_COMMAND_ID,
  handler: copyPathCommandHandler
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  when: EditorContextKeys.focus,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC),
  win: {
    primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyC
  },
  id: COPY_PATH_COMMAND_ID,
  handler: copyPathCommandHandler
});
const copyRelativePathCommandHandler = async (accessor, resource) => {
  const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
  await resourcesToClipboard(resources, true, accessor.get(IClipboardService), accessor.get(ILabelService), accessor.get(IConfigurationService));
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  when: EditorContextKeys.focus.toNegated(),
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyC,
  win: {
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC)
  },
  id: COPY_RELATIVE_PATH_COMMAND_ID,
  handler: copyRelativePathCommandHandler
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  when: EditorContextKeys.focus,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyC),
  win: {
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC)
  },
  id: COPY_RELATIVE_PATH_COMMAND_ID,
  handler: copyRelativePathCommandHandler
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  when: void 0,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyP),
  id: "workbench.action.files.copyPathOfActiveFile",
  handler: async (accessor) => {
    const editorService = accessor.get(IEditorService);
    const activeInput = editorService.activeEditor;
    const resource = EditorResourceAccessor.getOriginalUri(activeInput, { supportSideBySide: SideBySideEditor.PRIMARY });
    const resources = resource ? [resource] : [];
    await resourcesToClipboard(resources, false, accessor.get(IClipboardService), accessor.get(ILabelService), accessor.get(IConfigurationService));
  }
});
CommandsRegistry.registerCommand({
  id: REVEAL_IN_EXPLORER_COMMAND_ID,
  handler: async (accessor, resource) => {
    const viewService = accessor.get(IViewsService);
    const contextService = accessor.get(IWorkspaceContextService);
    const explorerService = accessor.get(IExplorerService);
    const editorService = accessor.get(IEditorService);
    const listService = accessor.get(IListService);
    const uri = getResourceForCommand(resource, editorService, listService);
    if (uri && contextService.isInsideWorkspace(uri)) {
      const explorerView = await viewService.openView(VIEW_ID, false);
      if (explorerView) {
        const oldAutoReveal = explorerView.autoReveal;
        explorerView.autoReveal = false;
        explorerView.setExpanded(true);
        await explorerService.select(uri, "force");
        explorerView.focus();
        explorerView.autoReveal = oldAutoReveal;
      }
    } else {
      const openEditorsView = viewService.getViewWithId(OpenEditorsView.ID);
      if (openEditorsView) {
        openEditorsView.setExpanded(true);
        openEditorsView.focus();
      }
    }
  }
});
CommandsRegistry.registerCommand({
  id: OPEN_WITH_EXPLORER_COMMAND_ID,
  handler: async (accessor, resource) => {
    const editorService = accessor.get(IEditorService);
    const listService = accessor.get(IListService);
    const uri = getResourceForCommand(resource, editorService, listService);
    if (uri) {
      return editorService.openEditor({ resource: uri, options: { override: EditorResolution.PICK, source: EditorOpenSource.USER } });
    }
    return void 0;
  }
});
function expandSideBySideEditor({ groupId, editor }, options) {
  if (editor instanceof SideBySideEditorInput && !options?.saveAs && !(editor.primary.hasCapability(EditorInputCapabilities.Untitled) || editor.secondary.hasCapability(EditorInputCapabilities.Untitled)) && editor.secondary.isModified()) {
    return [{ groupId, editor: editor.primary }, { groupId, editor: editor.secondary }];
  }
  return [{ groupId, editor }];
}
function getEditorsFromCommandArgs(accessor, commandArgs, options) {
  if (!commandArgs?.some((arg) => isEditorCommandsContext(arg))) {
    return void 0;
  }
  const resolvedContext = resolveCommandsContext(commandArgs, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
  const editors = [];
  for (const { group, editors: groupEditors } of resolvedContext.groupedEditors) {
    for (const editor of groupEditors) {
      editors.push(...expandSideBySideEditor({ groupId: group.id, editor }, options));
    }
  }
  return editors;
}
async function saveSelectedEditors(accessor, options, commandArgs) {
  const editorGroupService = accessor.get(IEditorGroupsService);
  const codeEditorService = accessor.get(ICodeEditorService);
  const textFileService = accessor.get(ITextFileService);
  let editors = getEditorsFromCommandArgs(accessor, commandArgs, options);
  if (!editors) {
    editors = getOpenEditorsViewMultiSelection(accessor);
  }
  if (!editors) {
    const activeGroup = editorGroupService.activeGroup;
    if (activeGroup.activeEditor) {
      editors = expandSideBySideEditor({ groupId: activeGroup.id, editor: activeGroup.activeEditor }, options);
    }
  }
  if (!editors || editors.length === 0) {
    return;
  }
  await doSaveEditors(accessor, editors, options);
  const focusedCodeEditor = codeEditorService.getFocusedCodeEditor();
  if (focusedCodeEditor instanceof EmbeddedCodeEditorWidget && !focusedCodeEditor.isSimpleWidget) {
    const resource = focusedCodeEditor.getModel()?.uri;
    if (resource && !editors.some(({ editor }) => isEqual(EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }), resource))) {
      const model = textFileService.files.get(resource);
      if (!model?.isReadonly()) {
        await textFileService.save(resource, options);
      }
    }
  }
}
function saveDirtyEditorsOfGroups(accessor, groups, options) {
  const dirtyEditors = [];
  for (const group of groups) {
    for (const editor of group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
      if (editor.isDirty()) {
        dirtyEditors.push({ groupId: group.id, editor });
      }
    }
  }
  return doSaveEditors(accessor, dirtyEditors, options);
}
async function doSaveEditors(accessor, editors, options) {
  const editorService = accessor.get(IEditorService);
  const notificationService = accessor.get(INotificationService);
  const instantiationService = accessor.get(IInstantiationService);
  try {
    await editorService.save(editors, options);
  } catch (error) {
    if (!isCancellationError(error)) {
      const actions = [toAction({ id: "workbench.action.files.saveEditors", label: nls.localize("retry", "Retry"), run: () => instantiationService.invokeFunction((accessor2) => doSaveEditors(accessor2, editors, options)) })];
      const editorsToRevert = editors.filter(
        ({ editor }) => !editor.hasCapability(EditorInputCapabilities.Untitled)
        /* all except untitled to prevent unexpected data-loss */
      );
      if (editorsToRevert.length > 0) {
        actions.push(toAction({ id: "workbench.action.files.revertEditors", label: editorsToRevert.length > 1 ? nls.localize("revertAll", "Revert All") : nls.localize("revert", "Revert"), run: () => editorService.revert(editorsToRevert) }));
      }
      notificationService.notify({
        id: editors.map(({ editor }) => hash(editor.resource?.toString())).join(),
        // ensure unique notification ID per set of editor
        severity: Severity.Error,
        message: nls.localize({ key: "genericSaveError", comment: ["{0} is the resource that failed to save and {1} the error message"] }, "Failed to save '{0}': {1}", editors.map(({ editor }) => editor.getName()).join(", "), toErrorMessage(error, false)),
        actions: { primary: actions }
      });
    }
  }
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  when: void 0,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.CtrlCmd | KeyCode.KeyS,
  id: SAVE_FILE_COMMAND_ID,
  handler: (accessor, ...args) => {
    return saveSelectedEditors(accessor, {
      reason: SaveReason.EXPLICIT,
      force: true
      /* force save even when non-dirty */
    }, args);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  when: void 0,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyS),
  win: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS) },
  id: SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID,
  handler: (accessor) => {
    return saveSelectedEditors(accessor, { reason: SaveReason.EXPLICIT, force: true, skipSaveParticipants: true });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: SAVE_FILE_AS_COMMAND_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  when: void 0,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
  handler: (accessor, ...args) => {
    return saveSelectedEditors(accessor, { reason: SaveReason.EXPLICIT, saveAs: true }, args);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  when: void 0,
  weight: KeybindingWeight.WorkbenchContrib,
  primary: void 0,
  mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyS },
  win: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyS) },
  id: SAVE_ALL_COMMAND_ID,
  handler: (accessor) => {
    return saveDirtyEditorsOfGroups(accessor, accessor.get(IEditorGroupsService).getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE), { reason: SaveReason.EXPLICIT });
  }
});
CommandsRegistry.registerCommand({
  id: SAVE_ALL_IN_GROUP_COMMAND_ID,
  handler: (accessor, _, editorContext) => {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const resolvedContext = resolveCommandsContext([editorContext], accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));
    let groups = void 0;
    if (!resolvedContext.groupedEditors.length) {
      groups = editorGroupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    } else {
      groups = resolvedContext.groupedEditors.map(({ group }) => group);
    }
    return saveDirtyEditorsOfGroups(accessor, groups, { reason: SaveReason.EXPLICIT });
  }
});
CommandsRegistry.registerCommand({
  id: SAVE_FILES_COMMAND_ID,
  handler: async (accessor) => {
    const editorService = accessor.get(IEditorService);
    const res = await editorService.saveAll({ includeUntitled: false, reason: SaveReason.EXPLICIT });
    return res.success;
  }
});
CommandsRegistry.registerCommand({
  id: REVERT_FILE_COMMAND_ID,
  handler: async (accessor) => {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const editorService = accessor.get(IEditorService);
    let editors = getOpenEditorsViewMultiSelection(accessor);
    if (!editors) {
      const activeGroup = editorGroupService.activeGroup;
      if (activeGroup.activeEditor) {
        editors = [{ groupId: activeGroup.id, editor: activeGroup.activeEditor }];
      }
    }
    if (!editors || editors.length === 0) {
      return;
    }
    try {
      await editorService.revert(editors.filter(
        ({ editor }) => !editor.hasCapability(EditorInputCapabilities.Untitled)
        /* all except untitled */
      ), { force: true });
    } catch (error) {
      const notificationService = accessor.get(INotificationService);
      notificationService.error(nls.localize("genericRevertError", "Failed to revert '{0}': {1}", editors.map(({ editor }) => editor.getName()).join(", "), toErrorMessage(error, false)));
    }
  }
});
CommandsRegistry.registerCommand({
  id: REMOVE_ROOT_FOLDER_COMMAND_ID,
  handler: (accessor, resource) => {
    const contextService = accessor.get(IWorkspaceContextService);
    const uriIdentityService = accessor.get(IUriIdentityService);
    const workspace = contextService.getWorkspace();
    const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService)).filter(
      (resource2) => workspace.folders.some((folder) => uriIdentityService.extUri.isEqual(folder.uri, resource2))
      // Need to verify resources are workspaces since multi selection can trigger this command on some non workspace resources
    );
    if (resources.length === 0) {
      const commandService = accessor.get(ICommandService);
      return commandService.executeCommand(RemoveRootFolderAction.ID);
    }
    const workspaceEditingService = accessor.get(IWorkspaceEditingService);
    return workspaceEditingService.removeFolders(resources);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib + 10,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedFirstFocusContext.negate()),
  primary: KeyCode.LeftArrow,
  id: PREVIOUS_COMPRESSED_FOLDER,
  handler: (accessor) => {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    const viewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
    if (viewlet?.getId() !== VIEWLET_ID) {
      return;
    }
    const explorer = viewlet.getViewPaneContainer();
    const view = explorer.getExplorerView();
    view.previousCompressedStat();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib + 10,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedLastFocusContext.negate()),
  primary: KeyCode.RightArrow,
  id: NEXT_COMPRESSED_FOLDER,
  handler: (accessor) => {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    const viewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
    if (viewlet?.getId() !== VIEWLET_ID) {
      return;
    }
    const explorer = viewlet.getViewPaneContainer();
    const view = explorer.getExplorerView();
    view.nextCompressedStat();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib + 10,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedFirstFocusContext.negate()),
  primary: KeyCode.Home,
  id: FIRST_COMPRESSED_FOLDER,
  handler: (accessor) => {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    const viewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
    if (viewlet?.getId() !== VIEWLET_ID) {
      return;
    }
    const explorer = viewlet.getViewPaneContainer();
    const view = explorer.getExplorerView();
    view.firstCompressedStat();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib + 10,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedLastFocusContext.negate()),
  primary: KeyCode.End,
  id: LAST_COMPRESSED_FOLDER,
  handler: (accessor) => {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    const viewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
    if (viewlet?.getId() !== VIEWLET_ID) {
      return;
    }
    const explorer = viewlet.getViewPaneContainer();
    const view = explorer.getExplorerView();
    view.lastCompressedStat();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  weight: KeybindingWeight.WorkbenchContrib,
  when: null,
  primary: isWeb ? isWindows ? KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyN) : KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyN : KeyMod.CtrlCmd | KeyCode.KeyN,
  secondary: isWeb ? [KeyMod.CtrlCmd | KeyCode.KeyN] : void 0,
  id: NEW_UNTITLED_FILE_COMMAND_ID,
  metadata: {
    description: NEW_UNTITLED_FILE_LABEL,
    args: [
      {
        isOptional: true,
        name: "New Untitled Text File arguments",
        description: "The editor view type or language ID if known",
        schema: {
          "type": "object",
          "properties": {
            "viewType": {
              "type": "string"
            },
            "languageId": {
              "type": "string"
            }
          }
        }
      }
    ]
  },
  handler: async (accessor, args) => {
    const editorService = accessor.get(IEditorService);
    await editorService.openEditor({
      resource: void 0,
      options: {
        override: args?.viewType,
        pinned: true
      },
      languageId: args?.languageId
    });
  }
});
CommandsRegistry.registerCommand({
  id: NEW_FILE_COMMAND_ID,
  handler: async (accessor, args) => {
    const editorService = accessor.get(IEditorService);
    const dialogService = accessor.get(IFileDialogService);
    const fileService = accessor.get(IFileService);
    const createFileLocalized = nls.localize("newFileCommand.saveLabel", "Create File");
    const defaultFileUri = joinPath(await dialogService.defaultFilePath(), args?.fileName ?? "Untitled.txt");
    const saveUri = await dialogService.showSaveDialog({ saveLabel: createFileLocalized, title: createFileLocalized, defaultUri: defaultFileUri });
    if (!saveUri) {
      return;
    }
    await fileService.createFile(saveUri, void 0, { overwrite: true });
    await editorService.openEditor({
      resource: saveUri,
      options: {
        override: args?.viewType,
        pinned: true
      },
      languageId: args?.languageId
    });
  }
});
export {
  newWindowCommand,
  openWindowCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2Jyb3dzZXIvZmlsZUNvbW1hbmRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgSUVkaXRvckNvbW1hbmRzQ29udGV4dCwgaXNFZGl0b3JDb21tYW5kc0NvbnRleHQsIFNpZGVCeVNpZGVFZGl0b3IsIElFZGl0b3JJZGVudGlmaWVyLCBTYXZlUmVhc29uLCBFZGl0b3JzT3JkZXIsIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJV2luZG93T3BlbmFibGUsIElPcGVuV2luZG93T3B0aW9ucywgaXNXb3Jrc3BhY2VUb09wZW4sIElPcGVuRW1wdHlXaW5kb3dPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFVOVElUTEVEX1dPUktTUEFDRV9OQU1FIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgVGV4dEZpbGVDb250ZW50UHJvdmlkZXIsIFZJRVdMRVRfSUQsIEV4cGxvcmVyQ29tcHJlc3NlZEZvY3VzQ29udGV4dCwgRXhwbG9yZXJDb21wcmVzc2VkRmlyc3RGb2N1c0NvbnRleHQsIEV4cGxvcmVyQ29tcHJlc3NlZExhc3RGb2N1c0NvbnRleHQsIEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgRXhwbG9yZXJGb2xkZXJDb250ZXh0LCBWSUVXX0lEIH0gZnJvbSAnLi4vY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEV4cGxvcmVyVmlld1BhbmVDb250YWluZXIgfSBmcm9tICcuL2V4cGxvcmVyVmlld2xldC5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZEhhbmRsZXIsIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEtleU1vZCwgS2V5Q29kZSwgS2V5Q2hvcmQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBpc1dlYiwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRSZXNvdXJjZUZvckNvbW1hbmQsIGdldE11bHRpU2VsZWN0ZWRSZXNvdXJjZXMsIGdldE9wZW5FZGl0b3JzVmlld011bHRpU2VsZWN0aW9uLCBJRXhwbG9yZXJTZXJ2aWNlIH0gZnJvbSAnLi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VFZGl0aW5nLmpzJztcbmltcG9ydCB7IHJlc29sdmVDb21tYW5kc0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JDb21tYW5kc0NvbnRleHQuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQLCBJU2F2ZUVkaXRvcnNPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlLCBHcm91cHNPcmRlciwgSUVkaXRvckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGpvaW5QYXRoLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvZW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3BlblNvdXJjZSwgRWRpdG9yUmVzb2x1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBPUEVOX1RPX1NJREVfQ09NTUFORF9JRCwgQ09NUEFSRV9XSVRIX1NBVkVEX0NPTU1BTkRfSUQsIFNFTEVDVF9GT1JfQ09NUEFSRV9DT01NQU5EX0lELCBSZXNvdXJjZVNlbGVjdGVkRm9yQ29tcGFyZUNvbnRleHQsIENPTVBBUkVfU0VMRUNURURfQ09NTUFORF9JRCwgQ09NUEFSRV9SRVNPVVJDRV9DT01NQU5EX0lELCBDT1BZX1BBVEhfQ09NTUFORF9JRCwgQ09QWV9SRUxBVElWRV9QQVRIX0NPTU1BTkRfSUQsIFJFVkVBTF9JTl9FWFBMT1JFUl9DT01NQU5EX0lELCBPUEVOX1dJVEhfRVhQTE9SRVJfQ09NTUFORF9JRCwgU0FWRV9GSUxFX0NPTU1BTkRfSUQsIFNBVkVfRklMRV9XSVRIT1VUX0ZPUk1BVFRJTkdfQ09NTUFORF9JRCwgU0FWRV9GSUxFX0FTX0NPTU1BTkRfSUQsIFNBVkVfQUxMX0NPTU1BTkRfSUQsIFNBVkVfQUxMX0lOX0dST1VQX0NPTU1BTkRfSUQsIFNBVkVfRklMRVNfQ09NTUFORF9JRCwgUkVWRVJUX0ZJTEVfQ09NTUFORF9JRCwgUkVNT1ZFX1JPT1RfRk9MREVSX0NPTU1BTkRfSUQsIFBSRVZJT1VTX0NPTVBSRVNTRURfRk9MREVSLCBORVhUX0NPTVBSRVNTRURfRk9MREVSLCBGSVJTVF9DT01QUkVTU0VEX0ZPTERFUiwgTEFTVF9DT01QUkVTU0VEX0ZPTERFUiwgTkVXX1VOVElUTEVEX0ZJTEVfQ09NTUFORF9JRCwgTkVXX1VOVElUTEVEX0ZJTEVfTEFCRUwsIE5FV19GSUxFX0NPTU1BTkRfSUQgfSBmcm9tICcuL2ZpbGVDb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBSZW1vdmVSb290Rm9sZGVyQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL3dvcmtzcGFjZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgT3BlbkVkaXRvcnNWaWV3IH0gZnJvbSAnLi92aWV3cy9vcGVuRWRpdG9yc1ZpZXcuanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJWaWV3IH0gZnJvbSAnLi92aWV3cy9leHBsb3JlclZpZXcuanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IG9wZW5XaW5kb3dDb21tYW5kID0gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB0b09wZW46IElXaW5kb3dPcGVuYWJsZVtdLCBvcHRpb25zPzogSU9wZW5XaW5kb3dPcHRpb25zKSA9PiB7XG5cdGlmIChBcnJheS5pc0FycmF5KHRvT3BlbikpIHtcblx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblxuXHRcdC8vIHJld3JpdGUgdW50aXRsZWQ6IHdvcmtzcGFjZSBVUklzIHRvIHRoZSBhYnNvbHV0ZSBwYXRoIG9uIGRpc2tcblx0XHR0b09wZW4gPSB0b09wZW4ubWFwKG9wZW5hYmxlID0+IHtcblx0XHRcdGlmIChpc1dvcmtzcGFjZVRvT3BlbihvcGVuYWJsZSkgJiYgb3BlbmFibGUud29ya3NwYWNlVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHdvcmtzcGFjZVVyaTogam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVudGl0bGVkV29ya3NwYWNlc0hvbWUsIG9wZW5hYmxlLndvcmtzcGFjZVVyaS5wYXRoLCBVTlRJVExFRF9XT1JLU1BBQ0VfTkFNRSlcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG9wZW5hYmxlO1xuXHRcdH0pO1xuXG5cdFx0aG9zdFNlcnZpY2Uub3BlbldpbmRvdyh0b09wZW4sIG9wdGlvbnMpO1xuXHR9XG59O1xuXG5leHBvcnQgY29uc3QgbmV3V2luZG93Q29tbWFuZCA9IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgb3B0aW9ucz86IElPcGVuRW1wdHlXaW5kb3dPcHRpb25zKSA9PiB7XG5cdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdGhvc3RTZXJ2aWNlLm9wZW5XaW5kb3cob3B0aW9ucyk7XG59O1xuXG4vLyBDb21tYW5kIHJlZ2lzdHJhdGlvblxuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IEV4cGxvcmVyRm9jdXNDb25kaXRpb24sXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlcixcblx0bWFjOiB7XG5cdFx0cHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLkVudGVyXG5cdH0sXG5cdGlkOiBPUEVOX1RPX1NJREVfQ09NTUFORF9JRCwgaGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCByZXNvdXJjZTogVVJJIHwgb2JqZWN0KSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBleHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4cGxvcmVyU2VydmljZSk7XG5cdFx0Y29uc3QgcmVzb3VyY2VzID0gZ2V0TXVsdGlTZWxlY3RlZFJlc291cmNlcyhyZXNvdXJjZSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSksIGVkaXRvclNlcnZpY2UsIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGV4cGxvcmVyU2VydmljZSk7XG5cblx0XHQvLyBTZXQgc2lkZSBpbnB1dFxuXHRcdGlmIChyZXNvdXJjZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB1bnRpdGxlZFJlc291cmNlcyA9IHJlc291cmNlcy5maWx0ZXIocmVzb3VyY2UgPT4gcmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKTtcblx0XHRcdGNvbnN0IGZpbGVSZXNvdXJjZXMgPSByZXNvdXJjZXMuZmlsdGVyKHJlc291cmNlID0+IHJlc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy51bnRpdGxlZCk7XG5cblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgUHJvbWlzZS5hbGwoZmlsZVJlc291cmNlcy5tYXAoYXN5bmMgcmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gZXhwbG9yZXJTZXJ2aWNlLmZpbmRDbG9zZXN0KHJlc291cmNlKTtcblx0XHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0XHQvLyBFeHBsb3JlciBhbHJlYWR5IHJlc29sdmVkIHRoZSBpdGVtLCBubyBuZWVkIHRvIGdvIHRvIHRoZSBmaWxlIHNlcnZpY2UgIzEwOTc4MFxuXHRcdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGF3YWl0IGZpbGVTZXJ2aWNlLnN0YXQocmVzb3VyY2UpO1xuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgZmlsZXMgPSBpdGVtcy5maWx0ZXIoaSA9PiAhaS5pc0RpcmVjdG9yeSk7XG5cdFx0XHRjb25zdCBlZGl0b3JzID0gZmlsZXMubWFwKGYgPT4gKHtcblx0XHRcdFx0cmVzb3VyY2U6IGYucmVzb3VyY2UsXG5cdFx0XHRcdG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH1cblx0XHRcdH0pKS5jb25jYXQoLi4udW50aXRsZWRSZXNvdXJjZXMubWFwKHVudGl0bGVkUmVzb3VyY2UgPT4gKHsgcmVzb3VyY2U6IHVudGl0bGVkUmVzb3VyY2UsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSkpKTtcblxuXHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9ycyhlZGl0b3JzLCBTSURFX0dST1VQKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxMCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgRXhwbG9yZXJGb2xkZXJDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0bWFjOiB7XG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvd1xuXHR9LFxuXHRpZDogJ2V4cGxvcmVyLm9wZW5BbmRQYXNzRm9jdXMnLCBoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIF9yZXNvdXJjZTogVVJJIHwgb2JqZWN0KSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpO1xuXHRcdGNvbnN0IHJlc291cmNlcyA9IGV4cGxvcmVyU2VydmljZS5nZXRDb250ZXh0KHRydWUpO1xuXG5cdFx0aWYgKHJlc291cmNlcy5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcnMocmVzb3VyY2VzLm1hcChyID0+ICh7IHJlc291cmNlOiByLnJlc291cmNlLCBvcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IGZhbHNlLCBwaW5uZWQ6IHRydWUgfSB9KSkpO1xuXHRcdH1cblx0fVxufSk7XG5cbmNvbnN0IENPTVBBUkVfV0lUSF9TQVZFRF9TQ0hFTUEgPSAnc2hvd01vZGlmaWNhdGlvbnMnO1xubGV0IHByb3ZpZGVyRGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXTtcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogQ09NUEFSRV9XSVRIX1NBVkVEX0NPTU1BTkRfSUQsXG5cdHdoZW46IHVuZGVmaW5lZCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleUQpLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIHJlc291cmNlOiBVUkkgfCBvYmplY3QpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHRleHRNb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRNb2RlbFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgbGlzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKTtcblxuXHRcdC8vIFJlZ2lzdGVyIHByb3ZpZGVyIGF0IGZpcnN0IGFzIG5lZWRlZFxuXHRcdGxldCByZWdpc3RlckVkaXRvckxpc3RlbmVyID0gZmFsc2U7XG5cdFx0aWYgKHByb3ZpZGVyRGlzcG9zYWJsZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZWdpc3RlckVkaXRvckxpc3RlbmVyID0gdHJ1ZTtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUNvbnRlbnRQcm92aWRlcik7XG5cdFx0XHRwcm92aWRlckRpc3Bvc2FibGVzLnB1c2gocHJvdmlkZXIpO1xuXHRcdFx0cHJvdmlkZXJEaXNwb3NhYmxlcy5wdXNoKHRleHRNb2RlbFNlcnZpY2UucmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoQ09NUEFSRV9XSVRIX1NBVkVEX1NDSEVNQSwgcHJvdmlkZXIpKTtcblx0XHR9XG5cblx0XHQvLyBPcGVuIGVkaXRvciAob25seSByZXNvdXJjZXMgdGhhdCBjYW4gYmUgaGFuZGxlZCBieSBmaWxlIHNlcnZpY2UgYXJlIHN1cHBvcnRlZClcblx0XHRjb25zdCB1cmkgPSBnZXRSZXNvdXJjZUZvckNvbW1hbmQocmVzb3VyY2UsIGVkaXRvclNlcnZpY2UsIGxpc3RTZXJ2aWNlKTtcblx0XHRpZiAodXJpICYmIGZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHVyaSkpIHtcblx0XHRcdGNvbnN0IG5hbWUgPSBiYXNlbmFtZSh1cmkpO1xuXHRcdFx0Y29uc3QgZWRpdG9yTGFiZWwgPSBubHMubG9jYWxpemUoJ21vZGlmaWVkTGFiZWwnLCBcInswfSAoaW4gZmlsZSkgXHUyMTk0IHsxfVwiLCBuYW1lLCBuYW1lKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgVGV4dEZpbGVDb250ZW50UHJvdmlkZXIub3Blbih1cmksIENPTVBBUkVfV0lUSF9TQVZFRF9TQ0hFTUEsIGVkaXRvckxhYmVsLCBlZGl0b3JTZXJ2aWNlLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRcdFx0Ly8gRGlzcG9zZSBvbmNlIG5vIG1vcmUgZGlmZiBlZGl0b3IgaXMgb3BlbmVkIHdpdGggdGhlIHNjaGVtZVxuXHRcdFx0XHRpZiAocmVnaXN0ZXJFZGl0b3JMaXN0ZW5lcikge1xuXHRcdFx0XHRcdHByb3ZpZGVyRGlzcG9zYWJsZXMucHVzaChlZGl0b3JTZXJ2aWNlLm9uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFlZGl0b3JTZXJ2aWNlLmVkaXRvcnMuc29tZShlZGl0b3IgPT4gISFFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaShlZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuU0VDT05EQVJZLCBmaWx0ZXJCeVNjaGVtZTogQ09NUEFSRV9XSVRIX1NBVkVEX1NDSEVNQSB9KSkpIHtcblx0XHRcdFx0XHRcdFx0cHJvdmlkZXJEaXNwb3NhYmxlcyA9IGRpc3Bvc2UocHJvdmlkZXJEaXNwb3NhYmxlcyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0cHJvdmlkZXJEaXNwb3NhYmxlcyA9IGRpc3Bvc2UocHJvdmlkZXJEaXNwb3NhYmxlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxubGV0IGdsb2JhbFJlc291cmNlVG9Db21wYXJlOiBVUkkgfCB1bmRlZmluZWQ7XG5sZXQgcmVzb3VyY2VTZWxlY3RlZEZvckNvbXBhcmVDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IFNFTEVDVF9GT1JfQ09NUEFSRV9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IsIHJlc291cmNlOiBVUkkgfCBvYmplY3QpID0+IHtcblx0XHRnbG9iYWxSZXNvdXJjZVRvQ29tcGFyZSA9IGdldFJlc291cmNlRm9yQ29tbWFuZChyZXNvdXJjZSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdGlmICghcmVzb3VyY2VTZWxlY3RlZEZvckNvbXBhcmVDb250ZXh0KSB7XG5cdFx0XHRyZXNvdXJjZVNlbGVjdGVkRm9yQ29tcGFyZUNvbnRleHQgPSBSZXNvdXJjZVNlbGVjdGVkRm9yQ29tcGFyZUNvbnRleHQuYmluZFRvKGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpKTtcblx0XHR9XG5cdFx0cmVzb3VyY2VTZWxlY3RlZEZvckNvbXBhcmVDb250ZXh0LnNldCh0cnVlKTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IENPTVBBUkVfU0VMRUNURURfQ09NTUFORF9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCByZXNvdXJjZTogVVJJIHwgb2JqZWN0KSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgcmVzb3VyY2VzID0gZ2V0TXVsdGlTZWxlY3RlZFJlc291cmNlcyhyZXNvdXJjZSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSksIGVkaXRvclNlcnZpY2UsIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJRXhwbG9yZXJTZXJ2aWNlKSk7XG5cblx0XHRpZiAocmVzb3VyY2VzLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0cmV0dXJuIGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiByZXNvdXJjZXNbMF0gfSxcblx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IHJlc291cmNlc1sxXSB9LFxuXHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IENPTVBBUkVfUkVTT1VSQ0VfQ09NTUFORF9JRCxcblx0aGFuZGxlcjogKGFjY2Vzc29yLCByZXNvdXJjZTogVVJJIHwgb2JqZWN0KSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgcmlnaHRSZXNvdXJjZSA9IGdldFJlc291cmNlRm9yQ29tbWFuZChyZXNvdXJjZSwgZWRpdG9yU2VydmljZSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdGlmIChnbG9iYWxSZXNvdXJjZVRvQ29tcGFyZSAmJiByaWdodFJlc291cmNlKSB7XG5cdFx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogZ2xvYmFsUmVzb3VyY2VUb0NvbXBhcmUgfSxcblx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IHJpZ2h0UmVzb3VyY2UgfSxcblx0XHRcdFx0b3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59KTtcblxuYXN5bmMgZnVuY3Rpb24gcmVzb3VyY2VzVG9DbGlwYm9hcmQocmVzb3VyY2VzOiBVUklbXSwgcmVsYXRpdmU6IGJvb2xlYW4sIGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLCBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0aWYgKHJlc291cmNlcy5sZW5ndGgpIHtcblx0XHRjb25zdCBsaW5lRGVsaW1pdGVyID0gaXNXaW5kb3dzID8gJ1xcclxcbicgOiAnXFxuJztcblxuXHRcdGxldCBzZXBhcmF0b3I6ICcvJyB8ICdcXFxcJyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb3B5UmVsYXRpdmVPckZ1bGxQYXRoU2VwYXJhdG9yU2VjdGlvbiA9IHJlbGF0aXZlID8gJ2V4cGxvcmVyLmNvcHlSZWxhdGl2ZVBhdGhTZXBhcmF0b3InIDogJ2V4cGxvcmVyLmNvcHlQYXRoU2VwYXJhdG9yJztcblx0XHRjb25zdCBjb3B5UmVsYXRpdmVPckZ1bGxQYXRoU2VwYXJhdG9yOiAnLycgfCAnXFxcXCcgfCB1bmRlZmluZWQgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShjb3B5UmVsYXRpdmVPckZ1bGxQYXRoU2VwYXJhdG9yU2VjdGlvbik7XG5cdFx0aWYgKGNvcHlSZWxhdGl2ZU9yRnVsbFBhdGhTZXBhcmF0b3IgPT09ICcvJyB8fCBjb3B5UmVsYXRpdmVPckZ1bGxQYXRoU2VwYXJhdG9yID09PSAnXFxcXCcpIHtcblx0XHRcdHNlcGFyYXRvciA9IGNvcHlSZWxhdGl2ZU9yRnVsbFBhdGhTZXBhcmF0b3I7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dCA9IHJlc291cmNlcy5tYXAocmVzb3VyY2UgPT4gbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHJlc291cmNlLCB7IHJlbGF0aXZlLCBub1ByZWZpeDogdHJ1ZSwgc2VwYXJhdG9yIH0pKS5qb2luKGxpbmVEZWxpbWl0ZXIpO1xuXHRcdGF3YWl0IGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHRleHQpO1xuXHR9XG59XG5cbmNvbnN0IGNvcHlQYXRoQ29tbWFuZEhhbmRsZXI6IElDb21tYW5kSGFuZGxlciA9IGFzeW5jIChhY2Nlc3NvciwgcmVzb3VyY2U6IHVua25vd24pID0+IHtcblx0Y29uc3QgcmVzb3VyY2VzID0gZ2V0TXVsdGlTZWxlY3RlZFJlc291cmNlcyhyZXNvdXJjZSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJRXhwbG9yZXJTZXJ2aWNlKSk7XG5cdGF3YWl0IHJlc291cmNlc1RvQ2xpcGJvYXJkKHJlc291cmNlcywgZmFsc2UsIGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSksIGFjY2Vzc29yLmdldChJTGFiZWxTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkpO1xufTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cy50b05lZ2F0ZWQoKSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlDLFxuXHR3aW46IHtcblx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlDXG5cdH0sXG5cdGlkOiBDT1BZX1BBVEhfQ09NTUFORF9JRCxcblx0aGFuZGxlcjogY29weVBhdGhDb21tYW5kSGFuZGxlclxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsXG5cdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUMpLFxuXHR3aW46IHtcblx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlDXG5cdH0sXG5cdGlkOiBDT1BZX1BBVEhfQ09NTUFORF9JRCxcblx0aGFuZGxlcjogY29weVBhdGhDb21tYW5kSGFuZGxlclxufSk7XG5cbmNvbnN0IGNvcHlSZWxhdGl2ZVBhdGhDb21tYW5kSGFuZGxlcjogSUNvbW1hbmRIYW5kbGVyID0gYXN5bmMgKGFjY2Vzc29yLCByZXNvdXJjZTogdW5rbm93bikgPT4ge1xuXHRjb25zdCByZXNvdXJjZXMgPSBnZXRNdWx0aVNlbGVjdGVkUmVzb3VyY2VzKHJlc291cmNlLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpKTtcblx0YXdhaXQgcmVzb3VyY2VzVG9DbGlwYm9hcmQocmVzb3VyY2VzLCB0cnVlLCBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxhYmVsU2VydmljZSksIGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpKTtcbn07XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZm9jdXMudG9OZWdhdGVkKCksXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5Qyxcblx0d2luOiB7XG5cdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlDKVxuXHR9LFxuXHRpZDogQ09QWV9SRUxBVElWRV9QQVRIX0NPTU1BTkRfSUQsXG5cdGhhbmRsZXI6IGNvcHlSZWxhdGl2ZVBhdGhDb21tYW5kSGFuZGxlclxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsXG5cdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUMpLFxuXHR3aW46IHtcblx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUMpXG5cdH0sXG5cdGlkOiBDT1BZX1JFTEFUSVZFX1BBVEhfQ09NTUFORF9JRCxcblx0aGFuZGxlcjogY29weVJlbGF0aXZlUGF0aENvbW1hbmRIYW5kbGVyXG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiB1bmRlZmluZWQsXG5cdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleVApLFxuXHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMuY29weVBhdGhPZkFjdGl2ZUZpbGUnLFxuXHRoYW5kbGVyOiBhc3luYyBhY2Nlc3NvciA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgYWN0aXZlSW5wdXQgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0XHRjb25zdCByZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoYWN0aXZlSW5wdXQsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRjb25zdCByZXNvdXJjZXMgPSByZXNvdXJjZSA/IFtyZXNvdXJjZV0gOiBbXTtcblx0XHRhd2FpdCByZXNvdXJjZXNUb0NsaXBib2FyZChyZXNvdXJjZXMsIGZhbHNlLCBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxhYmVsU2VydmljZSksIGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IFJFVkVBTF9JTl9FWFBMT1JFUl9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIHJlc291cmNlOiBVUkkgfCBvYmplY3QpID0+IHtcblx0XHRjb25zdCB2aWV3U2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4cGxvcmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXhwbG9yZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBsaXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHVyaSA9IGdldFJlc291cmNlRm9yQ29tbWFuZChyZXNvdXJjZSwgZWRpdG9yU2VydmljZSwgbGlzdFNlcnZpY2UpO1xuXG5cdFx0aWYgKHVyaSAmJiBjb250ZXh0U2VydmljZS5pc0luc2lkZVdvcmtzcGFjZSh1cmkpKSB7XG5cdFx0XHRjb25zdCBleHBsb3JlclZpZXcgPSBhd2FpdCB2aWV3U2VydmljZS5vcGVuVmlldzxFeHBsb3JlclZpZXc+KFZJRVdfSUQsIGZhbHNlKTtcblx0XHRcdGlmIChleHBsb3JlclZpZXcpIHtcblx0XHRcdFx0Y29uc3Qgb2xkQXV0b1JldmVhbCA9IGV4cGxvcmVyVmlldy5hdXRvUmV2ZWFsO1xuXHRcdFx0XHQvLyBEaXNhYmxlIGF1dG9yZXZlYWwgYmVmb3JlIHJldmVhbGluZyB0aGUgZXhwbG9yZXIgdG8gcHJldmVudCBhIHJhY2UgYmV0d2VuZSBhdXRvIHJldmVhbCArIHNlbGVjdGlvblxuXHRcdFx0XHQvLyBGaXhlcyAjMTk3MjY4XG5cdFx0XHRcdGV4cGxvcmVyVmlldy5hdXRvUmV2ZWFsID0gZmFsc2U7XG5cdFx0XHRcdGV4cGxvcmVyVmlldy5zZXRFeHBhbmRlZCh0cnVlKTtcblx0XHRcdFx0YXdhaXQgZXhwbG9yZXJTZXJ2aWNlLnNlbGVjdCh1cmksICdmb3JjZScpO1xuXHRcdFx0XHRleHBsb3JlclZpZXcuZm9jdXMoKTtcblx0XHRcdFx0ZXhwbG9yZXJWaWV3LmF1dG9SZXZlYWwgPSBvbGRBdXRvUmV2ZWFsO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBEbyBub3QgcmV2ZWFsIHRoZSBvcGVuIGVkaXRvcnMgdmlldyBpZiBpdCdzIGhpZGRlbiBleHBsaWNpdGx5XG5cdFx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIyNzM3OFxuXHRcdFx0Y29uc3Qgb3BlbkVkaXRvcnNWaWV3ID0gdmlld1NlcnZpY2UuZ2V0Vmlld1dpdGhJZChPcGVuRWRpdG9yc1ZpZXcuSUQpO1xuXHRcdFx0aWYgKG9wZW5FZGl0b3JzVmlldykge1xuXHRcdFx0XHRvcGVuRWRpdG9yc1ZpZXcuc2V0RXhwYW5kZWQodHJ1ZSk7XG5cdFx0XHRcdG9wZW5FZGl0b3JzVmlldy5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IE9QRU5fV0lUSF9FWFBMT1JFUl9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIHJlc291cmNlOiBVUkkgfCBvYmplY3QpID0+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBsaXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHVyaSA9IGdldFJlc291cmNlRm9yQ29tbWFuZChyZXNvdXJjZSwgZWRpdG9yU2VydmljZSwgbGlzdFNlcnZpY2UpO1xuXHRcdGlmICh1cmkpIHtcblx0XHRcdHJldHVybiBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdXJpLCBvcHRpb25zOiB7IG92ZXJyaWRlOiBFZGl0b3JSZXNvbHV0aW9uLlBJQ0ssIHNvdXJjZTogRWRpdG9yT3BlblNvdXJjZS5VU0VSIH0gfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufSk7XG5cbi8vIFNhdmUgLyBTYXZlIEFzIC8gU2F2ZSBBbGwgLyBSZXZlcnRcblxuZnVuY3Rpb24gZXhwYW5kU2lkZUJ5U2lkZUVkaXRvcih7IGdyb3VwSWQsIGVkaXRvciB9OiBJRWRpdG9ySWRlbnRpZmllciwgb3B0aW9ucz86IElTYXZlRWRpdG9yc09wdGlvbnMpOiBJRWRpdG9ySWRlbnRpZmllcltdIHtcblxuXHQvLyBTcGVjaWFsIHRyZWF0bWVudCBmb3Igc2lkZSBieSBzaWRlIGVkaXRvcnM6IGlmIHRoZSBlZGl0b3Jcblx0Ly8gaGFzIDIgc2lkZXMsIHdlIGNvbnNpZGVyIGJvdGgsIHRvIHN1cHBvcnQgc2F2aW5nIGJvdGggc2lkZXMuXG5cdC8vIFdlIG9ubHkgYWxsb3cgdGhpcyB3aGVuIHNhdmluZywgbm90IGZvciBcIlNhdmUgQXNcIiBhbmQgbm90IGlmIGFueVxuXHQvLyBlZGl0b3IgaXMgdW50aXRsZWQgd2hpY2ggd291bGQgYnJpbmcgdXAgYSBcIlNhdmUgQXNcIiBkaWFsb2cgdG9vLlxuXHQvLyBJbiBhZGRpdGlvbiwgd2UgcmVxdWlyZSB0aGUgc2Vjb25kYXJ5IHNpZGUgdG8gYmUgbW9kaWZpZWQgdG8gbm90XG5cdC8vIHRyaWdnZXIgYSB0b3VjaCBvcGVyYXRpb24gdW5leHBlY3RlZGx5LlxuXHQvL1xuXHQvLyBTZWUgYWxzbyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNDE4MFxuXHQvLyBTZWUgYWxzbyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTA2MzMwXG5cdC8vIFNlZSBhbHNvIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xOTAyMTBcblx0aWYgKFxuXHRcdGVkaXRvciBpbnN0YW5jZW9mIFNpZGVCeVNpZGVFZGl0b3JJbnB1dCAmJlxuXHRcdCFvcHRpb25zPy5zYXZlQXMgJiYgIShlZGl0b3IucHJpbWFyeS5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkKSB8fCBlZGl0b3Iuc2Vjb25kYXJ5Lmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpKSAmJlxuXHRcdGVkaXRvci5zZWNvbmRhcnkuaXNNb2RpZmllZCgpXG5cdCkge1xuXHRcdHJldHVybiBbeyBncm91cElkLCBlZGl0b3I6IGVkaXRvci5wcmltYXJ5IH0sIHsgZ3JvdXBJZCwgZWRpdG9yOiBlZGl0b3Iuc2Vjb25kYXJ5IH1dO1xuXHR9XG5cblx0cmV0dXJuIFt7IGdyb3VwSWQsIGVkaXRvciB9XTtcbn1cblxuZnVuY3Rpb24gZ2V0RWRpdG9yc0Zyb21Db21tYW5kQXJncyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29tbWFuZEFyZ3M6IHVua25vd25bXSB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElTYXZlRWRpdG9yc09wdGlvbnMpOiBJRWRpdG9ySWRlbnRpZmllcltdIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFjb21tYW5kQXJncz8uc29tZShhcmcgPT4gaXNFZGl0b3JDb21tYW5kc0NvbnRleHQoYXJnKSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBvbmx5IHJlc3BlY3QgdGhlIGFyZ3VtZW50cyBpZiB0aGV5IGNvbnRhaW4gYW4gZXhwbGljaXQgZWRpdG9yIGNvbnRleHRcblx0fVxuXG5cdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoY29tbWFuZEFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblxuXHRjb25zdCBlZGl0b3JzOiBJRWRpdG9ySWRlbnRpZmllcltdID0gW107XG5cdGZvciAoY29uc3QgeyBncm91cCwgZWRpdG9yczogZ3JvdXBFZGl0b3JzIH0gb2YgcmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzKSB7XG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZ3JvdXBFZGl0b3JzKSB7XG5cdFx0XHRlZGl0b3JzLnB1c2goLi4uZXhwYW5kU2lkZUJ5U2lkZUVkaXRvcih7IGdyb3VwSWQ6IGdyb3VwLmlkLCBlZGl0b3IgfSwgb3B0aW9ucykpO1xuXHRcdH1cblx0fVxuXG5cdC8vIE5vdGU6IHdlIHJldHVybiB0aGUgKHBvc3NpYmx5IGVtcHR5KSByZXN1bHQgZXZlbiB3aGVuIHRoZSBleHBsaWNpdCBjb250ZXh0XG5cdC8vIG5vIGxvbmdlciByZXNvbHZlcyB0byBhbnkgZWRpdG9yIHRvIG5vdCBmYWxsIGJhY2sgdG8gb3RoZXIgZWRpdG9ycyB3aGljaFxuXHQvLyB3b3VsZCBlbmQgdXAgc2F2aW5nIGFuIGVkaXRvciB0aGUgY29tbWFuZCB3YXMgbm90IGludm9rZWQgZm9yXG5cdHJldHVybiBlZGl0b3JzO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzYXZlU2VsZWN0ZWRFZGl0b3JzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvcHRpb25zPzogSVNhdmVFZGl0b3JzT3B0aW9ucywgY29tbWFuZEFyZ3M/OiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgZWRpdG9yR3JvdXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0Y29uc3QgdGV4dEZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXh0RmlsZVNlcnZpY2UpO1xuXG5cdC8vIFJldHJpZXZlIHRoZSBlZGl0b3JzIGZyb20gdGhlIGNvbW1hbmQgYXJndW1lbnRzIGlmIHRoZXkgY29udGFpbiBhbiBleHBsaWNpdFxuXHQvLyBlZGl0b3IgY29udGV4dCAoZS5nLiB3aGVuIGludm9rZWQgZnJvbSB0aGUgZWRpdG9yIHRhYiBjb250ZXh0IG1lbnUpIGJlY2F1c2Vcblx0Ly8gdGhlIGVkaXRvciB0aGUgY29tbWFuZCB3YXMgdHJpZ2dlcmVkIGZvciBtYXkgbm90IGJlIHRoZSBhY3RpdmUgZWRpdG9yXG5cdGxldCBlZGl0b3JzID0gZ2V0RWRpdG9yc0Zyb21Db21tYW5kQXJncyhhY2Nlc3NvciwgY29tbWFuZEFyZ3MsIG9wdGlvbnMpO1xuXG5cdC8vIFJldHJpZXZlIHNlbGVjdGVkIG9yIGFjdGl2ZSBlZGl0b3Jcblx0aWYgKCFlZGl0b3JzKSB7XG5cdFx0ZWRpdG9ycyA9IGdldE9wZW5FZGl0b3JzVmlld011bHRpU2VsZWN0aW9uKGFjY2Vzc29yKTtcblx0fVxuXHRpZiAoIWVkaXRvcnMpIHtcblx0XHRjb25zdCBhY3RpdmVHcm91cCA9IGVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cDtcblx0XHRpZiAoYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRlZGl0b3JzID0gZXhwYW5kU2lkZUJ5U2lkZUVkaXRvcih7IGdyb3VwSWQ6IGFjdGl2ZUdyb3VwLmlkLCBlZGl0b3I6IGFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvciB9LCBvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRpZiAoIWVkaXRvcnMgfHwgZWRpdG9ycy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm47IC8vIG5vdGhpbmcgdG8gc2F2ZVxuXHR9XG5cblx0Ly8gU2F2ZSBlZGl0b3JzXG5cdGF3YWl0IGRvU2F2ZUVkaXRvcnMoYWNjZXNzb3IsIGVkaXRvcnMsIG9wdGlvbnMpO1xuXG5cdC8vIFNwZWNpYWwgdHJlYXRtZW50IGZvciBlbWJlZGRlZCBlZGl0b3JzOiBpZiB3ZSBkZXRlY3QgdGhhdCBmb2N1cyBpc1xuXHQvLyBpbnNpZGUgYW4gZW1iZWRkZWQgY29kZSBlZGl0b3IsIHdlIHNhdmUgdGhhdCBtb2RlbCBhcyB3ZWxsIGlmIHdlXG5cdC8vIGZpbmQgaXQgaW4gb3VyIHRleHQgZmlsZSBtb2RlbHMuIEN1cnJlbnRseSwgb25seSB0ZXh0dWFsIGVkaXRvcnNcblx0Ly8gc3VwcG9ydCBlbWJlZGRlZCBlZGl0b3JzLlxuXHRjb25zdCBmb2N1c2VkQ29kZUVkaXRvciA9IGNvZGVFZGl0b3JTZXJ2aWNlLmdldEZvY3VzZWRDb2RlRWRpdG9yKCk7XG5cdGlmIChmb2N1c2VkQ29kZUVkaXRvciBpbnN0YW5jZW9mIEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCAmJiAhZm9jdXNlZENvZGVFZGl0b3IuaXNTaW1wbGVXaWRnZXQpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IGZvY3VzZWRDb2RlRWRpdG9yLmdldE1vZGVsKCk/LnVyaTtcblxuXHRcdC8vIENoZWNrIHRoYXQgdGhlIHJlc291cmNlIG9mIHRoZSBtb2RlbCB3YXMgbm90IHNhdmVkIGFscmVhZHlcblx0XHRpZiAocmVzb3VyY2UgJiYgIWVkaXRvcnMuc29tZSgoeyBlZGl0b3IgfSkgPT4gaXNFcXVhbChFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaShlZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KSwgcmVzb3VyY2UpKSkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0ZXh0RmlsZVNlcnZpY2UuZmlsZXMuZ2V0KHJlc291cmNlKTtcblx0XHRcdGlmICghbW9kZWw/LmlzUmVhZG9ubHkoKSkge1xuXHRcdFx0XHRhd2FpdCB0ZXh0RmlsZVNlcnZpY2Uuc2F2ZShyZXNvdXJjZSwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIHNhdmVEaXJ0eUVkaXRvcnNPZkdyb3VwcyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZ3JvdXBzOiByZWFkb25seSBJRWRpdG9yR3JvdXBbXSwgb3B0aW9ucz86IElTYXZlRWRpdG9yc09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgZGlydHlFZGl0b3JzOiBJRWRpdG9ySWRlbnRpZmllcltdID0gW107XG5cdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpKSB7XG5cdFx0XHRpZiAoZWRpdG9yLmlzRGlydHkoKSkge1xuXHRcdFx0XHRkaXJ0eUVkaXRvcnMucHVzaCh7IGdyb3VwSWQ6IGdyb3VwLmlkLCBlZGl0b3IgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGRvU2F2ZUVkaXRvcnMoYWNjZXNzb3IsIGRpcnR5RWRpdG9ycywgb3B0aW9ucyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRvU2F2ZUVkaXRvcnMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcnM6IElFZGl0b3JJZGVudGlmaWVyW10sIG9wdGlvbnM/OiBJU2F2ZUVkaXRvcnNPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHR0cnkge1xuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uuc2F2ZShlZGl0b3JzLCBvcHRpb25zKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbdG9BY3Rpb24oeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMuc2F2ZUVkaXRvcnMnLCBsYWJlbDogbmxzLmxvY2FsaXplKCdyZXRyeScsIFwiUmV0cnlcIiksIHJ1bjogKCkgPT4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gZG9TYXZlRWRpdG9ycyhhY2Nlc3NvciwgZWRpdG9ycywgb3B0aW9ucykpIH0pXTtcblx0XHRcdGNvbnN0IGVkaXRvcnNUb1JldmVydCA9IGVkaXRvcnMuZmlsdGVyKCh7IGVkaXRvciB9KSA9PiAhZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpIC8qIGFsbCBleGNlcHQgdW50aXRsZWQgdG8gcHJldmVudCB1bmV4cGVjdGVkIGRhdGEtbG9zcyAqLyk7XG5cdFx0XHRpZiAoZWRpdG9yc1RvUmV2ZXJ0Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLnJldmVydEVkaXRvcnMnLCBsYWJlbDogZWRpdG9yc1RvUmV2ZXJ0Lmxlbmd0aCA+IDEgPyBubHMubG9jYWxpemUoJ3JldmVydEFsbCcsIFwiUmV2ZXJ0IEFsbFwiKSA6IG5scy5sb2NhbGl6ZSgncmV2ZXJ0JywgXCJSZXZlcnRcIiksIHJ1bjogKCkgPT4gZWRpdG9yU2VydmljZS5yZXZlcnQoZWRpdG9yc1RvUmV2ZXJ0KSB9KSk7XG5cdFx0XHR9XG5cblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0aWQ6IGVkaXRvcnMubWFwKCh7IGVkaXRvciB9KSA9PiBoYXNoKGVkaXRvci5yZXNvdXJjZT8udG9TdHJpbmcoKSkpLmpvaW4oKSwgLy8gZW5zdXJlIHVuaXF1ZSBub3RpZmljYXRpb24gSUQgcGVyIHNldCBvZiBlZGl0b3Jcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoeyBrZXk6ICdnZW5lcmljU2F2ZUVycm9yJywgY29tbWVudDogWyd7MH0gaXMgdGhlIHJlc291cmNlIHRoYXQgZmFpbGVkIHRvIHNhdmUgYW5kIHsxfSB0aGUgZXJyb3IgbWVzc2FnZSddIH0sIFwiRmFpbGVkIHRvIHNhdmUgJ3swfSc6IHsxfVwiLCBlZGl0b3JzLm1hcCgoeyBlZGl0b3IgfSkgPT4gZWRpdG9yLmdldE5hbWUoKSkuam9pbignLCAnKSwgdG9FcnJvck1lc3NhZ2UoZXJyb3IsIGZhbHNlKSksXG5cdFx0XHRcdGFjdGlvbnM6IHsgcHJpbWFyeTogYWN0aW9ucyB9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdHdoZW46IHVuZGVmaW5lZCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlTLFxuXHRpZDogU0FWRV9GSUxFX0NPTU1BTkRfSUQsXG5cdGhhbmRsZXI6IChhY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0cmV0dXJuIHNhdmVTZWxlY3RlZEVkaXRvcnMoYWNjZXNzb3IsIHsgcmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lULCBmb3JjZTogdHJ1ZSAvKiBmb3JjZSBzYXZlIGV2ZW4gd2hlbiBub24tZGlydHkgKi8gfSwgYXJncyk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0d2hlbjogdW5kZWZpbmVkLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5UyksXG5cdHdpbjogeyBwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVMpIH0sXG5cdGlkOiBTQVZFX0ZJTEVfV0lUSE9VVF9GT1JNQVRUSU5HX0NPTU1BTkRfSUQsXG5cdGhhbmRsZXI6IGFjY2Vzc29yID0+IHtcblx0XHRyZXR1cm4gc2F2ZVNlbGVjdGVkRWRpdG9ycyhhY2Nlc3NvciwgeyByZWFzb246IFNhdmVSZWFzb24uRVhQTElDSVQsIGZvcmNlOiB0cnVlIC8qIGZvcmNlIHNhdmUgZXZlbiB3aGVuIG5vbi1kaXJ0eSAqLywgc2tpcFNhdmVQYXJ0aWNpcGFudHM6IHRydWUgfSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IFNBVkVfRklMRV9BU19DT01NQU5EX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogdW5kZWZpbmVkLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Uyxcblx0aGFuZGxlcjogKGFjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHtcblx0XHRyZXR1cm4gc2F2ZVNlbGVjdGVkRWRpdG9ycyhhY2Nlc3NvciwgeyByZWFzb246IFNhdmVSZWFzb24uRVhQTElDSVQsIHNhdmVBczogdHJ1ZSB9LCBhcmdzKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHR3aGVuOiB1bmRlZmluZWQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRwcmltYXJ5OiB1bmRlZmluZWQsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleVMgfSxcblx0d2luOiB7IHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleVMpIH0sXG5cdGlkOiBTQVZFX0FMTF9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiBhY2Nlc3NvciA9PiB7XG5cdFx0cmV0dXJuIHNhdmVEaXJ0eUVkaXRvcnNPZkdyb3VwcyhhY2Nlc3NvciwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKS5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpLCB7IHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCB9KTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IFNBVkVfQUxMX0lOX0dST1VQX0NPTU1BTkRfSUQsXG5cdGhhbmRsZXI6IChhY2Nlc3NvciwgXzogVVJJIHwgb2JqZWN0LCBlZGl0b3JDb250ZXh0OiBJRWRpdG9yQ29tbWFuZHNDb250ZXh0KSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KFtlZGl0b3JDb250ZXh0XSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgZWRpdG9yR3JvdXBzU2VydmljZSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXG5cdFx0bGV0IGdyb3VwczogcmVhZG9ubHkgSUVkaXRvckdyb3VwW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKCFyZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRncm91cHMgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGdyb3VwcyA9IHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9ycy5tYXAoKHsgZ3JvdXAgfSkgPT4gZ3JvdXApO1xuXHRcdH1cblxuXHRcdHJldHVybiBzYXZlRGlydHlFZGl0b3JzT2ZHcm91cHMoYWNjZXNzb3IsIGdyb3VwcywgeyByZWFzb246IFNhdmVSZWFzb24uRVhQTElDSVQgfSk7XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBTQVZFX0ZJTEVTX0NPTU1BTkRfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IGVkaXRvclNlcnZpY2Uuc2F2ZUFsbCh7IGluY2x1ZGVVbnRpdGxlZDogZmFsc2UsIHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCB9KTtcblx0XHRyZXR1cm4gcmVzLnN1Y2Nlc3M7XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBSRVZFUlRfRklMRV9DT01NQU5EX0lELFxuXHRoYW5kbGVyOiBhc3luYyBhY2Nlc3NvciA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdC8vIFJldHJpZXZlIHNlbGVjdGVkIG9yIGFjdGl2ZSBlZGl0b3Jcblx0XHRsZXQgZWRpdG9ycyA9IGdldE9wZW5FZGl0b3JzVmlld011bHRpU2VsZWN0aW9uKGFjY2Vzc29yKTtcblx0XHRpZiAoIWVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZUdyb3VwID0gZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwO1xuXHRcdFx0aWYgKGFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRlZGl0b3JzID0gW3sgZ3JvdXBJZDogYWN0aXZlR3JvdXAuaWQsIGVkaXRvcjogYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yIH1dO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghZWRpdG9ycyB8fCBlZGl0b3JzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuOyAvLyBub3RoaW5nIHRvIHJldmVydFxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLnJldmVydChlZGl0b3JzLmZpbHRlcigoeyBlZGl0b3IgfSkgPT4gIWVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkKSAvKiBhbGwgZXhjZXB0IHVudGl0bGVkICovKSwgeyBmb3JjZTogdHJ1ZSB9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgnZ2VuZXJpY1JldmVydEVycm9yJywgXCJGYWlsZWQgdG8gcmV2ZXJ0ICd7MH0nOiB7MX1cIiwgZWRpdG9ycy5tYXAoKHsgZWRpdG9yIH0pID0+IGVkaXRvci5nZXROYW1lKCkpLmpvaW4oJywgJyksIHRvRXJyb3JNZXNzYWdlKGVycm9yLCBmYWxzZSkpKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBSRU1PVkVfUk9PVF9GT0xERVJfQ09NTUFORF9JRCxcblx0aGFuZGxlcjogKGFjY2Vzc29yLCByZXNvdXJjZTogVVJJIHwgb2JqZWN0KSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHRjb25zdCB1cmlJZGVudGl0eVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0Y29uc3QgcmVzb3VyY2VzID0gZ2V0TXVsdGlTZWxlY3RlZFJlc291cmNlcyhyZXNvdXJjZSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJRXhwbG9yZXJTZXJ2aWNlKSkuZmlsdGVyKHJlc291cmNlID0+XG5cdFx0XHR3b3Jrc3BhY2UuZm9sZGVycy5zb21lKGZvbGRlciA9PiB1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZm9sZGVyLnVyaSwgcmVzb3VyY2UpKSAvLyBOZWVkIHRvIHZlcmlmeSByZXNvdXJjZXMgYXJlIHdvcmtzcGFjZXMgc2luY2UgbXVsdGkgc2VsZWN0aW9uIGNhbiB0cmlnZ2VyIHRoaXMgY29tbWFuZCBvbiBzb21lIG5vbiB3b3Jrc3BhY2UgcmVzb3VyY2VzXG5cdFx0KTtcblxuXHRcdGlmIChyZXNvdXJjZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0Ly8gU2hvdyBhIHBpY2tlciBmb3IgdGhlIHVzZXIgdG8gY2hvb3NlIHdoaWNoIGZvbGRlciB0byByZW1vdmVcblx0XHRcdHJldHVybiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChSZW1vdmVSb290Rm9sZGVyQWN0aW9uLklEKTtcblx0XHR9XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VFZGl0aW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UpO1xuXHRcdHJldHVybiB3b3Jrc3BhY2VFZGl0aW5nU2VydmljZS5yZW1vdmVGb2xkZXJzKHJlc291cmNlcyk7XG5cdH1cbn0pO1xuXG4vLyBDb21wcmVzc2VkIGl0ZW0gbmF2aWdhdGlvblxuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxMCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgRXhwbG9yZXJDb21wcmVzc2VkRm9jdXNDb250ZXh0LCBFeHBsb3JlckNvbXByZXNzZWRGaXJzdEZvY3VzQ29udGV4dC5uZWdhdGUoKSksXG5cdHByaW1hcnk6IEtleUNvZGUuTGVmdEFycm93LFxuXHRpZDogUFJFVklPVVNfQ09NUFJFU1NFRF9GT0xERVIsXG5cdGhhbmRsZXI6IGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCBwYW5lQ29tcG9zaXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3bGV0ID0gcGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cblx0XHRpZiAodmlld2xldD8uZ2V0SWQoKSAhPT0gVklFV0xFVF9JRCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cGxvcmVyID0gdmlld2xldC5nZXRWaWV3UGFuZUNvbnRhaW5lcigpIGFzIEV4cGxvcmVyVmlld1BhbmVDb250YWluZXI7XG5cdFx0Y29uc3QgdmlldyA9IGV4cGxvcmVyLmdldEV4cGxvcmVyVmlldygpO1xuXHRcdHZpZXcucHJldmlvdXNDb21wcmVzc2VkU3RhdCgpO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMTAsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChGaWxlc0V4cGxvcmVyRm9jdXNDb25kaXRpb24sIEV4cGxvcmVyQ29tcHJlc3NlZEZvY3VzQ29udGV4dCwgRXhwbG9yZXJDb21wcmVzc2VkTGFzdEZvY3VzQ29udGV4dC5uZWdhdGUoKSksXG5cdHByaW1hcnk6IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0aWQ6IE5FWFRfQ09NUFJFU1NFRF9GT0xERVIsXG5cdGhhbmRsZXI6IGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCBwYW5lQ29tcG9zaXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3bGV0ID0gcGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cblx0XHRpZiAodmlld2xldD8uZ2V0SWQoKSAhPT0gVklFV0xFVF9JRCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cGxvcmVyID0gdmlld2xldC5nZXRWaWV3UGFuZUNvbnRhaW5lcigpIGFzIEV4cGxvcmVyVmlld1BhbmVDb250YWluZXI7XG5cdFx0Y29uc3QgdmlldyA9IGV4cGxvcmVyLmdldEV4cGxvcmVyVmlldygpO1xuXHRcdHZpZXcubmV4dENvbXByZXNzZWRTdGF0KCk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxMCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgRXhwbG9yZXJDb21wcmVzc2VkRm9jdXNDb250ZXh0LCBFeHBsb3JlckNvbXByZXNzZWRGaXJzdEZvY3VzQ29udGV4dC5uZWdhdGUoKSksXG5cdHByaW1hcnk6IEtleUNvZGUuSG9tZSxcblx0aWQ6IEZJUlNUX0NPTVBSRVNTRURfRk9MREVSLFxuXHRoYW5kbGVyOiBhY2Nlc3NvciA9PiB7XG5cdFx0Y29uc3QgcGFuZUNvbXBvc2l0ZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSk7XG5cdFx0Y29uc3Qgdmlld2xldCA9IHBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXG5cdFx0aWYgKHZpZXdsZXQ/LmdldElkKCkgIT09IFZJRVdMRVRfSUQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBleHBsb3JlciA9IHZpZXdsZXQuZ2V0Vmlld1BhbmVDb250YWluZXIoKSBhcyBFeHBsb3JlclZpZXdQYW5lQ29udGFpbmVyO1xuXHRcdGNvbnN0IHZpZXcgPSBleHBsb3Jlci5nZXRFeHBsb3JlclZpZXcoKTtcblx0XHR2aWV3LmZpcnN0Q29tcHJlc3NlZFN0YXQoKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRmlsZXNFeHBsb3JlckZvY3VzQ29uZGl0aW9uLCBFeHBsb3JlckNvbXByZXNzZWRGb2N1c0NvbnRleHQsIEV4cGxvcmVyQ29tcHJlc3NlZExhc3RGb2N1c0NvbnRleHQubmVnYXRlKCkpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkVuZCxcblx0aWQ6IExBU1RfQ09NUFJFU1NFRF9GT0xERVIsXG5cdGhhbmRsZXI6IGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCBwYW5lQ29tcG9zaXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3bGV0ID0gcGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cblx0XHRpZiAodmlld2xldD8uZ2V0SWQoKSAhPT0gVklFV0xFVF9JRCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cGxvcmVyID0gdmlld2xldC5nZXRWaWV3UGFuZUNvbnRhaW5lcigpIGFzIEV4cGxvcmVyVmlld1BhbmVDb250YWluZXI7XG5cdFx0Y29uc3QgdmlldyA9IGV4cGxvcmVyLmdldEV4cGxvcmVyVmlldygpO1xuXHRcdHZpZXcubGFzdENvbXByZXNzZWRTdGF0KCk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IG51bGwsXG5cdHByaW1hcnk6IGlzV2ViID8gKGlzV2luZG93cyA/IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleU4pIDogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlOKSA6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlOLFxuXHRzZWNvbmRhcnk6IGlzV2ViID8gW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlOXSA6IHVuZGVmaW5lZCxcblx0aWQ6IE5FV19VTlRJVExFRF9GSUxFX0NPTU1BTkRfSUQsXG5cdG1ldGFkYXRhOiB7XG5cdFx0ZGVzY3JpcHRpb246IE5FV19VTlRJVExFRF9GSUxFX0xBQkVMLFxuXHRcdGFyZ3M6IFtcblx0XHRcdHtcblx0XHRcdFx0aXNPcHRpb25hbDogdHJ1ZSxcblx0XHRcdFx0bmFtZTogJ05ldyBVbnRpdGxlZCBUZXh0IEZpbGUgYXJndW1lbnRzJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdUaGUgZWRpdG9yIHZpZXcgdHlwZSBvciBsYW5ndWFnZSBJRCBpZiBrbm93bicsXG5cdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHQndmlld1R5cGUnOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZydcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQnbGFuZ3VhZ2VJZCc6IHtcblx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdF1cblx0fSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCBhcmdzPzogeyBsYW5ndWFnZUlkPzogc3RyaW5nOyB2aWV3VHlwZT86IHN0cmluZyB9KSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0b3ZlcnJpZGU6IGFyZ3M/LnZpZXdUeXBlLFxuXHRcdFx0XHRwaW5uZWQ6IHRydWVcblx0XHRcdH0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhcmdzPy5sYW5ndWFnZUlkLFxuXHRcdH0pO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogTkVXX0ZJTEVfQ09NTUFORF9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCBhcmdzPzogeyBsYW5ndWFnZUlkPzogc3RyaW5nOyB2aWV3VHlwZT86IHN0cmluZzsgZmlsZU5hbWU/OiBzdHJpbmcgfSkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY3JlYXRlRmlsZUxvY2FsaXplZCA9IG5scy5sb2NhbGl6ZSgnbmV3RmlsZUNvbW1hbmQuc2F2ZUxhYmVsJywgXCJDcmVhdGUgRmlsZVwiKTtcblx0XHRjb25zdCBkZWZhdWx0RmlsZVVyaSA9IGpvaW5QYXRoKGF3YWl0IGRpYWxvZ1NlcnZpY2UuZGVmYXVsdEZpbGVQYXRoKCksIGFyZ3M/LmZpbGVOYW1lID8/ICdVbnRpdGxlZC50eHQnKTtcblxuXHRcdGNvbnN0IHNhdmVVcmkgPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLnNob3dTYXZlRGlhbG9nKHsgc2F2ZUxhYmVsOiBjcmVhdGVGaWxlTG9jYWxpemVkLCB0aXRsZTogY3JlYXRlRmlsZUxvY2FsaXplZCwgZGVmYXVsdFVyaTogZGVmYXVsdEZpbGVVcmkgfSk7XG5cblx0XHRpZiAoIXNhdmVVcmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGaWxlKHNhdmVVcmksIHVuZGVmaW5lZCwgeyBvdmVyd3JpdGU6IHRydWUgfSk7XG5cblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IHNhdmVVcmksXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdG92ZXJyaWRlOiBhcmdzPy52aWV3VHlwZSxcblx0XHRcdFx0cGlubmVkOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXJncz8ubGFuZ3VhZ2VJZCxcblx0XHR9KTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFFckIsU0FBUyx3QkFBZ0QseUJBQXlCLGtCQUFxQyxZQUFZLGNBQWMsK0JBQStCO0FBQ2hMLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQThDLHlCQUFrRDtBQUNoRyxTQUFTLG9CQUFvQjtBQUM3QixTQUEyQiw2QkFBNkI7QUFDeEQsU0FBUywwQkFBMEIsK0JBQStCO0FBQ2xFLFNBQVMsd0JBQXdCLHlCQUF5QixZQUFZLGdDQUFnQyxxQ0FBcUMsb0NBQW9DLDZCQUE2Qix1QkFBdUIsZUFBZTtBQUVsUCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFtQyx1QkFBdUI7QUFDbkUsU0FBc0Isb0JBQW9CLHNCQUFzQjtBQUNoRSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBUyxRQUFRLFNBQVMsZ0JBQWdCO0FBQzFDLFNBQVMsT0FBTyxpQkFBaUI7QUFDakMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUIsMkJBQTJCLGtDQUFrQyx3QkFBd0I7QUFDckgsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQixrQkFBdUM7QUFDaEUsU0FBUyxzQkFBc0IsbUJBQWlDO0FBQ2hFLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsVUFBVSxVQUFVLGVBQWU7QUFDNUMsU0FBc0IsZUFBZTtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxT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QUEsRUFDN0osV0FBVyxRQUFRLENBQUMsT0FBTyxVQUFVLFFBQVEsSUFBSSxJQUFJO0FBQUEsRUFDckQsSUFBSTtBQUFBLEVBQ0osVUFBVTtBQUFBLElBQ1QsYUFBYTtBQUFBLElBQ2IsTUFBTTtBQUFBLE1BQ0w7QUFBQSxRQUNDLFlBQVk7QUFBQSxRQUNaLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLFFBQVE7QUFBQSxVQUNQLFFBQVE7QUFBQSxVQUNSLGNBQWM7QUFBQSxZQUNiLFlBQVk7QUFBQSxjQUNYLFFBQVE7QUFBQSxZQUNUO0FBQUEsWUFDQSxjQUFjO0FBQUEsY0FDYixRQUFRO0FBQUEsWUFDVDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFDQSxTQUFTLE9BQU8sVUFBVSxTQUFzRDtBQUMvRSxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUVqRCxVQUFNLGNBQWMsV0FBVztBQUFBLE1BQzlCLFVBQVU7QUFBQSxNQUNWLFNBQVM7QUFBQSxRQUNSLFVBQVUsTUFBTTtBQUFBLFFBQ2hCLFFBQVE7QUFBQSxNQUNUO0FBQUEsTUFDQSxZQUFZLE1BQU07QUFBQSxJQUNuQixDQUFDO0FBQUEsRUFDRjtBQUNELENBQUM7QUFFRCxpQkFBaUIsZ0JBQWdCO0FBQUEsRUFDaEMsSUFBSTtBQUFBLEVBQ0osU0FBUyxPQUFPLFVBQVUsU0FBeUU7QUFDbEcsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGtCQUFrQjtBQUNyRCxVQUFNLGNBQWMsU0FBUyxJQUFJLFlBQVk7QUFFN0MsVUFBTSxzQkFBc0IsSUFBSSxTQUFTLDRCQUE0QixhQUFhO0FBQ2xGLFVBQU0saUJBQWlCLFNBQVMsTUFBTSxjQUFjLGdCQUFnQixHQUFHLE1BQU0sWUFBWSxjQUFjO0FBRXZHLFVBQU0sVUFBVSxNQUFNLGNBQWMsZUFBZSxFQUFFLFdBQVcscUJBQXFCLE9BQU8scUJBQXFCLFlBQVksZUFBZSxDQUFDO0FBRTdJLFFBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxJQUNEO0FBRUEsVUFBTSxZQUFZLFdBQVcsU0FBUyxRQUFXLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFFcEUsVUFBTSxjQUFjLFdBQVc7QUFBQSxNQUM5QixVQUFVO0FBQUEsTUFDVixTQUFTO0FBQUEsUUFDUixVQUFVLE1BQU07QUFBQSxRQUNoQixRQUFRO0FBQUEsTUFDVDtBQUFBLE1BQ0EsWUFBWSxNQUFNO0FBQUEsSUFDbkIsQ0FBQztBQUFBLEVBQ0Y7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogWyJyZXNvdXJjZSIsICJhY2Nlc3NvciJdCn0K
