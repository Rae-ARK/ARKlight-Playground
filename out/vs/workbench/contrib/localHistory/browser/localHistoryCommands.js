import { localize, localize2 } from "../../../../nls.js";
import { URI } from "../../../../base/common/uri.js";
import { Event } from "../../../../base/common/event.js";
import { Schemas } from "../../../../base/common/network.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { IWorkingCopyHistoryService } from "../../../services/workingCopy/common/workingCopyHistory.js";
import { API_OPEN_DIFF_EDITOR_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { LocalHistoryFileSystemProvider } from "./localHistoryFileSystemProvider.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { registerAction2, Action2, MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { basename, basenameOrAuthority, dirname } from "../../../../base/common/resources.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { EditorResourceAccessor, SaveSourceRegistry, SideBySideEditor } from "../../../common/editor.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IWorkingCopyService } from "../../../services/workingCopy/common/workingCopyService.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ActiveEditorContext, ResourceContextKey } from "../../../common/contextkeys.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { getLocalHistoryDateFormatter, LOCAL_HISTORY_ICON_RESTORE, LOCAL_HISTORY_MENU_CONTEXT_KEY } from "./localHistory.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { ResourceSet } from "../../../../base/common/map.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
const LOCAL_HISTORY_CATEGORY = localize2("localHistory.category", "Local History");
const CTX_LOCAL_HISTORY_ENABLED = ContextKeyExpr.has("config.workbench.localHistory.enabled");
const COMPARE_WITH_FILE_LABEL = localize2("localHistory.compareWithFile", "Compare with File");
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.compareWithFile",
      title: COMPARE_WITH_FILE_LABEL,
      menu: {
        id: MenuId.TimelineItemContext,
        group: "1_compare",
        order: 1,
        when: LOCAL_HISTORY_MENU_CONTEXT_KEY
      }
    });
  }
  async run(accessor, item) {
    const commandService = accessor.get(ICommandService);
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
      return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toDiffEditorArguments(entry, entry.workingCopy.resource));
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.compareWithPrevious",
      title: localize2("localHistory.compareWithPrevious", "Compare with Previous"),
      menu: {
        id: MenuId.TimelineItemContext,
        group: "1_compare",
        order: 2,
        when: LOCAL_HISTORY_MENU_CONTEXT_KEY
      }
    });
  }
  async run(accessor, item) {
    const commandService = accessor.get(ICommandService);
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const editorService = accessor.get(IEditorService);
    const { entry, previous } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
      if (!previous) {
        return openEntry(entry, editorService);
      }
      return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toDiffEditorArguments(previous, entry));
    }
  }
});
let itemSelectedForCompare = void 0;
const LocalHistoryItemSelectedForCompare = new RawContextKey("localHistoryItemSelectedForCompare", false, true);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.selectForCompare",
      title: localize2("localHistory.selectForCompare", "Select for Compare"),
      menu: {
        id: MenuId.TimelineItemContext,
        group: "2_compare_with",
        order: 2,
        when: LOCAL_HISTORY_MENU_CONTEXT_KEY
      }
    });
  }
  async run(accessor, item) {
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const contextKeyService = accessor.get(IContextKeyService);
    const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
      itemSelectedForCompare = item;
      LocalHistoryItemSelectedForCompare.bindTo(contextKeyService).set(true);
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.compareWithSelected",
      title: localize2("localHistory.compareWithSelected", "Compare with Selected"),
      menu: {
        id: MenuId.TimelineItemContext,
        group: "2_compare_with",
        order: 1,
        when: ContextKeyExpr.and(LOCAL_HISTORY_MENU_CONTEXT_KEY, LocalHistoryItemSelectedForCompare)
      }
    });
  }
  async run(accessor, item) {
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const commandService = accessor.get(ICommandService);
    if (!itemSelectedForCompare) {
      return;
    }
    const selectedEntry = (await findLocalHistoryEntry(workingCopyHistoryService, itemSelectedForCompare)).entry;
    if (!selectedEntry) {
      return;
    }
    const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
      return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toDiffEditorArguments(selectedEntry, entry));
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.open",
      title: localize2("localHistory.open", "Show Contents"),
      menu: {
        id: MenuId.TimelineItemContext,
        group: "3_contents",
        order: 1,
        when: LOCAL_HISTORY_MENU_CONTEXT_KEY
      }
    });
  }
  async run(accessor, item) {
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const editorService = accessor.get(IEditorService);
    const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
      return openEntry(entry, editorService);
    }
  }
});
const RESTORE_CONTENTS_LABEL = localize2("localHistory.restore", "Restore Contents");
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.restoreViaEditor",
      title: RESTORE_CONTENTS_LABEL,
      menu: {
        id: MenuId.EditorTitle,
        group: "navigation",
        order: -10,
        when: ResourceContextKey.Scheme.isEqualTo(LocalHistoryFileSystemProvider.SCHEMA)
      },
      icon: LOCAL_HISTORY_ICON_RESTORE
    });
  }
  async run(accessor, uri) {
    const { associatedResource, location } = LocalHistoryFileSystemProvider.fromLocalHistoryFileSystem(uri);
    return restore(accessor, { uri: associatedResource, handle: basenameOrAuthority(location) });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.restore",
      title: RESTORE_CONTENTS_LABEL,
      menu: {
        id: MenuId.TimelineItemContext,
        group: "3_contents",
        order: 2,
        when: LOCAL_HISTORY_MENU_CONTEXT_KEY
      }
    });
  }
  async run(accessor, item) {
    return restore(accessor, item);
  }
});
const restoreSaveSource = SaveSourceRegistry.registerSource("localHistoryRestore.source", localize("localHistoryRestore.source", "File Restored"));
async function restore(accessor, item) {
  const fileService = accessor.get(IFileService);
  const dialogService = accessor.get(IDialogService);
  const workingCopyService = accessor.get(IWorkingCopyService);
  const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
  const editorService = accessor.get(IEditorService);
  const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
  if (entry) {
    const { confirmed } = await dialogService.confirm({
      type: "warning",
      message: localize("confirmRestoreMessage", "Do you want to restore the contents of '{0}'?", basename(entry.workingCopy.resource)),
      detail: localize("confirmRestoreDetail", "Restoring will discard any unsaved changes."),
      primaryButton: localize({ key: "restoreButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Restore")
    });
    if (!confirmed) {
      return;
    }
    const workingCopies = workingCopyService.getAll(entry.workingCopy.resource);
    if (workingCopies) {
      for (const workingCopy of workingCopies) {
        if (workingCopy.isDirty()) {
          await workingCopy.revert({ soft: true });
        }
      }
    }
    try {
      await fileService.cloneFile(entry.location, entry.workingCopy.resource);
    } catch (error) {
      await dialogService.error(localize("unableToRestore", "Unable to restore '{0}'.", basename(entry.workingCopy.resource)), toErrorMessage(error));
      return;
    }
    if (workingCopies) {
      for (const workingCopy of workingCopies) {
        await workingCopy.revert({ force: true });
      }
    }
    await editorService.openEditor({ resource: entry.workingCopy.resource });
    await workingCopyHistoryService.addEntry({
      resource: entry.workingCopy.resource,
      source: restoreSaveSource
    }, CancellationToken.None);
    await closeEntry(entry, editorService);
  }
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.restoreViaPicker",
      title: localize2("localHistory.restoreViaPicker", "Find Entry to Restore"),
      f1: true,
      category: LOCAL_HISTORY_CATEGORY,
      precondition: CTX_LOCAL_HISTORY_ENABLED
    });
  }
  async run(accessor) {
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const quickInputService = accessor.get(IQuickInputService);
    const modelService = accessor.get(IModelService);
    const languageService = accessor.get(ILanguageService);
    const labelService = accessor.get(ILabelService);
    const editorService = accessor.get(IEditorService);
    const fileService = accessor.get(IFileService);
    const commandService = accessor.get(ICommandService);
    const historyService = accessor.get(IHistoryService);
    const resourcePickerDisposables = new DisposableStore();
    const resourcePicker = resourcePickerDisposables.add(quickInputService.createQuickPick());
    let cts = new CancellationTokenSource();
    resourcePickerDisposables.add(resourcePicker.onDidHide(() => cts.dispose(true)));
    resourcePicker.busy = true;
    resourcePicker.show();
    const resources = new ResourceSet(await workingCopyHistoryService.getAll(cts.token));
    const recentEditorResources = new ResourceSet(coalesce(historyService.getHistory().map(({ resource: resource2 }) => resource2)));
    const resourcesSortedByRecency = [];
    for (const resource2 of recentEditorResources) {
      if (resources.has(resource2)) {
        resourcesSortedByRecency.push(resource2);
        resources.delete(resource2);
      }
    }
    resourcesSortedByRecency.push(...[...resources].sort((r1, r2) => r1.fsPath < r2.fsPath ? -1 : 1));
    resourcePicker.busy = false;
    resourcePicker.placeholder = localize("restoreViaPicker.filePlaceholder", "Select the file to show local history for");
    resourcePicker.matchOnLabel = true;
    resourcePicker.matchOnDescription = true;
    resourcePicker.items = [...resourcesSortedByRecency].map((resource2) => ({
      resource: resource2,
      label: basenameOrAuthority(resource2),
      description: labelService.getUriLabel(dirname(resource2), { relative: true }),
      iconClasses: getIconClasses(modelService, languageService, resource2)
    }));
    await Event.toPromise(resourcePicker.onDidAccept);
    resourcePickerDisposables.dispose();
    const resource = resourcePicker.selectedItems.at(0)?.resource;
    if (!resource) {
      return;
    }
    const entryPickerDisposables = new DisposableStore();
    const entryPicker = entryPickerDisposables.add(quickInputService.createQuickPick());
    cts = new CancellationTokenSource();
    entryPickerDisposables.add(entryPicker.onDidHide(() => cts.dispose(true)));
    entryPicker.busy = true;
    entryPicker.show();
    const entries = await workingCopyHistoryService.getEntries(resource, cts.token);
    entryPicker.busy = false;
    entryPicker.canAcceptInBackground = true;
    entryPicker.placeholder = localize("restoreViaPicker.entryPlaceholder", "Select the local history entry to open");
    entryPicker.matchOnLabel = true;
    entryPicker.matchOnDescription = true;
    entryPicker.items = Array.from(entries).reverse().map((entry) => ({
      entry,
      label: `$(circle-outline) ${SaveSourceRegistry.getSourceLabel(entry.source)}`,
      description: toLocalHistoryEntryDateLabel(entry.timestamp)
    }));
    entryPickerDisposables.add(entryPicker.onDidAccept(async (e) => {
      if (!e.inBackground) {
        entryPickerDisposables.dispose();
      }
      const selectedItem = entryPicker.selectedItems.at(0);
      if (!selectedItem) {
        return;
      }
      const resourceExists = await fileService.exists(selectedItem.entry.workingCopy.resource);
      if (resourceExists) {
        return commandService.executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, ...toDiffEditorArguments(selectedItem.entry, selectedItem.entry.workingCopy.resource, { preserveFocus: e.inBackground }));
      }
      return openEntry(selectedItem.entry, editorService, { preserveFocus: e.inBackground });
    }));
  }
});
MenuRegistry.appendMenuItem(MenuId.TimelineTitle, { command: { id: "workbench.action.localHistory.restoreViaPicker", title: localize2("localHistory.restoreViaPickerMenu", "Local History: Find Entry to Restore...") }, group: "submenu", order: 1, when: CTX_LOCAL_HISTORY_ENABLED });
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.rename",
      title: localize2("localHistory.rename", "Rename"),
      menu: {
        id: MenuId.TimelineItemContext,
        group: "5_edit",
        order: 1,
        when: LOCAL_HISTORY_MENU_CONTEXT_KEY
      }
    });
  }
  async run(accessor, item) {
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const quickInputService = accessor.get(IQuickInputService);
    const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
      const disposables = new DisposableStore();
      const inputBox = disposables.add(quickInputService.createInputBox());
      inputBox.title = localize("renameLocalHistoryEntryTitle", "Rename Local History Entry");
      inputBox.ignoreFocusOut = true;
      inputBox.placeholder = localize("renameLocalHistoryPlaceholder", "Enter the new name of the local history entry");
      inputBox.value = SaveSourceRegistry.getSourceLabel(entry.source);
      inputBox.show();
      disposables.add(inputBox.onDidAccept(() => {
        if (inputBox.value) {
          workingCopyHistoryService.updateEntry(entry, { source: inputBox.value }, CancellationToken.None);
        }
        disposables.dispose();
      }));
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.delete",
      title: localize2("localHistory.delete", "Delete"),
      menu: {
        id: MenuId.TimelineItemContext,
        group: "5_edit",
        order: 2,
        when: LOCAL_HISTORY_MENU_CONTEXT_KEY
      }
    });
  }
  async run(accessor, item) {
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const editorService = accessor.get(IEditorService);
    const dialogService = accessor.get(IDialogService);
    const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
    if (entry) {
      const { confirmed } = await dialogService.confirm({
        type: "warning",
        message: localize("confirmDeleteMessage", "Do you want to delete the local history entry of '{0}' from {1}?", entry.workingCopy.name, toLocalHistoryEntryDateLabel(entry.timestamp)),
        detail: localize("confirmDeleteDetail", "This action is irreversible!"),
        primaryButton: localize({ key: "deleteButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Delete")
      });
      if (!confirmed) {
        return;
      }
      await workingCopyHistoryService.removeEntry(entry, CancellationToken.None);
      await closeEntry(entry, editorService);
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.deleteAll",
      title: localize2("localHistory.deleteAll", "Delete All"),
      f1: true,
      category: LOCAL_HISTORY_CATEGORY,
      precondition: CTX_LOCAL_HISTORY_ENABLED
    });
  }
  async run(accessor) {
    const dialogService = accessor.get(IDialogService);
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const { confirmed } = await dialogService.confirm({
      type: "warning",
      message: localize("confirmDeleteAllMessage", "Do you want to delete all entries of all files in local history?"),
      detail: localize("confirmDeleteAllDetail", "This action is irreversible!"),
      primaryButton: localize({ key: "deleteAllButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Delete All")
    });
    if (!confirmed) {
      return;
    }
    await workingCopyHistoryService.removeAll(CancellationToken.None);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.localHistory.create",
      title: localize2("localHistory.create", "Create Entry"),
      f1: true,
      category: LOCAL_HISTORY_CATEGORY,
      precondition: ContextKeyExpr.and(CTX_LOCAL_HISTORY_ENABLED, ActiveEditorContext)
    });
  }
  async run(accessor) {
    const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
    const quickInputService = accessor.get(IQuickInputService);
    const editorService = accessor.get(IEditorService);
    const labelService = accessor.get(ILabelService);
    const pathService = accessor.get(IPathService);
    const resource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (resource?.scheme !== pathService.defaultUriScheme && resource?.scheme !== Schemas.vscodeUserData) {
      return;
    }
    const disposables = new DisposableStore();
    const inputBox = disposables.add(quickInputService.createInputBox());
    inputBox.title = localize("createLocalHistoryEntryTitle", "Create Local History Entry");
    inputBox.ignoreFocusOut = true;
    inputBox.placeholder = localize("createLocalHistoryPlaceholder", "Enter the new name of the local history entry for '{0}'", labelService.getUriBasenameLabel(resource));
    inputBox.show();
    disposables.add(inputBox.onDidAccept(async () => {
      const entrySource = inputBox.value;
      disposables.dispose();
      if (entrySource) {
        await workingCopyHistoryService.addEntry({ resource, source: inputBox.value }, CancellationToken.None);
      }
    }));
  }
});
async function openEntry(entry, editorService, options) {
  const resource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: entry.location, associatedResource: entry.workingCopy.resource });
  await editorService.openEditor({
    resource,
    label: localize("localHistoryEditorLabel", "{0} ({1} \u2022 {2})", entry.workingCopy.name, SaveSourceRegistry.getSourceLabel(entry.source), toLocalHistoryEntryDateLabel(entry.timestamp)),
    options
  });
}
async function closeEntry(entry, editorService) {
  const resource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: entry.location, associatedResource: entry.workingCopy.resource });
  const editors = editorService.findEditors(resource, { supportSideBySide: SideBySideEditor.ANY });
  await editorService.closeEditors(editors, { preserveFocus: true });
}
function toDiffEditorArguments(arg1, arg2, options) {
  const originalResource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: arg1.location, associatedResource: arg1.workingCopy.resource });
  let label;
  let modifiedResource;
  if (URI.isUri(arg2)) {
    const resource = arg2;
    modifiedResource = resource;
    label = localize("localHistoryCompareToFileEditorLabel", "{0} ({1} \u2022 {2}) \u2194 {3}", arg1.workingCopy.name, SaveSourceRegistry.getSourceLabel(arg1.source), toLocalHistoryEntryDateLabel(arg1.timestamp), arg1.workingCopy.name);
  } else {
    const modified = arg2;
    modifiedResource = LocalHistoryFileSystemProvider.toLocalHistoryFileSystem({ location: modified.location, associatedResource: modified.workingCopy.resource });
    label = localize("localHistoryCompareToPreviousEditorLabel", "{0} ({1} \u2022 {2}) \u2194 {3} ({4} \u2022 {5})", arg1.workingCopy.name, SaveSourceRegistry.getSourceLabel(arg1.source), toLocalHistoryEntryDateLabel(arg1.timestamp), modified.workingCopy.name, SaveSourceRegistry.getSourceLabel(modified.source), toLocalHistoryEntryDateLabel(modified.timestamp));
  }
  return [
    originalResource,
    modifiedResource,
    label,
    options ? [void 0, options] : void 0
  ];
}
async function findLocalHistoryEntry(workingCopyHistoryService, descriptor) {
  let uri = descriptor.uri;
  if (uri.scheme === LocalHistoryFileSystemProvider.SCHEMA) {
    uri = LocalHistoryFileSystemProvider.fromLocalHistoryFileSystem(uri).associatedResource;
  }
  const entries = await workingCopyHistoryService.getEntries(uri, CancellationToken.None);
  let currentEntry = void 0;
  let previousEntry = void 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.id === descriptor.handle) {
      currentEntry = entry;
      previousEntry = entries[i - 1];
      break;
    }
  }
  return {
    entry: currentEntry,
    previous: previousEntry
  };
}
const SEP = /\//g;
function toLocalHistoryEntryDateLabel(timestamp) {
  return `${getLocalHistoryDateFormatter().format(timestamp).replace(SEP, "-")}`;
}
export {
  COMPARE_WITH_FILE_LABEL,
  findLocalHistoryEntry,
  toDiffEditorArguments
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2xvY2FsSGlzdG9yeS9icm93c2VyL2xvY2FsSGlzdG9yeUNvbW1hbmRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5LCBJV29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUhpc3RvcnkuanMnO1xuaW1wb3J0IHsgQVBJX09QRU5fRElGRl9FRElUT1JfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckNvbW1hbmRzLmpzJztcbmltcG9ydCB7IExvY2FsSGlzdG9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4vbG9jYWxIaXN0b3J5RmlsZVN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiwgTWVudUlkLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBiYXNlbmFtZU9yQXV0aG9yaXR5LCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBTYXZlU291cmNlUmVnaXN0cnksIFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aXZlRWRpdG9yQ29udGV4dCwgUmVzb3VyY2VDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBnZXRMb2NhbEhpc3RvcnlEYXRlRm9ybWF0dGVyLCBMT0NBTF9ISVNUT1JZX0lDT05fUkVTVE9SRSwgTE9DQUxfSElTVE9SWV9NRU5VX0NPTlRFWFRfS0VZIH0gZnJvbSAnLi9sb2NhbEhpc3RvcnkuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaGlzdG9yeS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5cbmNvbnN0IExPQ0FMX0hJU1RPUllfQ0FURUdPUlkgPSBsb2NhbGl6ZTIoJ2xvY2FsSGlzdG9yeS5jYXRlZ29yeScsICdMb2NhbCBIaXN0b3J5Jyk7XG5jb25zdCBDVFhfTE9DQUxfSElTVE9SWV9FTkFCTEVEID0gQ29udGV4dEtleUV4cHIuaGFzKCdjb25maWcud29ya2JlbmNoLmxvY2FsSGlzdG9yeS5lbmFibGVkJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRpbWVsaW5lQ29tbWFuZEFyZ3VtZW50IHtcblx0dXJpOiBVUkk7XG5cdGhhbmRsZTogc3RyaW5nO1xufVxuXG4vLyNyZWdpb24gQ29tcGFyZSB3aXRoIEZpbGVcblxuZXhwb3J0IGNvbnN0IENPTVBBUkVfV0lUSF9GSUxFX0xBQkVMID0gbG9jYWxpemUyKCdsb2NhbEhpc3RvcnkuY29tcGFyZVdpdGhGaWxlJywgJ0NvbXBhcmUgd2l0aCBGaWxlJyk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubG9jYWxIaXN0b3J5LmNvbXBhcmVXaXRoRmlsZScsXG5cdFx0XHR0aXRsZTogQ09NUEFSRV9XSVRIX0ZJTEVfTEFCRUwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGltZWxpbmVJdGVtQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX2NvbXBhcmUnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogTE9DQUxfSElTVE9SWV9NRU5VX0NPTlRFWFRfS0VZXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpdGVtOiBJVGltZWxpbmVDb21tYW5kQXJndW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgeyBlbnRyeSB9ID0gYXdhaXQgZmluZExvY2FsSGlzdG9yeUVudHJ5KHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UsIGl0ZW0pO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFQSV9PUEVOX0RJRkZfRURJVE9SX0NPTU1BTkRfSUQsIC4uLnRvRGlmZkVkaXRvckFyZ3VtZW50cyhlbnRyeSwgZW50cnkud29ya2luZ0NvcHkucmVzb3VyY2UpKTtcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIENvbXBhcmUgd2l0aCBQcmV2aW91c1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmxvY2FsSGlzdG9yeS5jb21wYXJlV2l0aFByZXZpb3VzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2xvY2FsSGlzdG9yeS5jb21wYXJlV2l0aFByZXZpb3VzJywgJ0NvbXBhcmUgd2l0aCBQcmV2aW91cycpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlRpbWVsaW5lSXRlbUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMV9jb21wYXJlJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IExPQ0FMX0hJU1RPUllfTUVOVV9DT05URVhUX0tFWVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaXRlbTogSVRpbWVsaW5lQ29tbWFuZEFyZ3VtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCB3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHsgZW50cnksIHByZXZpb3VzIH0gPSBhd2FpdCBmaW5kTG9jYWxIaXN0b3J5RW50cnkod29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSwgaXRlbSk7XG5cdFx0aWYgKGVudHJ5KSB7XG5cblx0XHRcdC8vIFdpdGhvdXQgYSBwcmV2aW91cyBlbnRyeSwganVzdCBzaG93IHRoZSBlbnRyeSBkaXJlY3RseVxuXHRcdFx0aWYgKCFwcmV2aW91cykge1xuXHRcdFx0XHRyZXR1cm4gb3BlbkVudHJ5KGVudHJ5LCBlZGl0b3JTZXJ2aWNlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3BlbiByZWFsIGRpZmYgZWRpdG9yXG5cdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQVBJX09QRU5fRElGRl9FRElUT1JfQ09NTUFORF9JRCwgLi4udG9EaWZmRWRpdG9yQXJndW1lbnRzKHByZXZpb3VzLCBlbnRyeSkpO1xuXHRcdH1cblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gU2VsZWN0IGZvciBDb21wYXJlIC8gQ29tcGFyZSB3aXRoIFNlbGVjdGVkXG5cbmxldCBpdGVtU2VsZWN0ZWRGb3JDb21wYXJlOiBJVGltZWxpbmVDb21tYW5kQXJndW1lbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cbmNvbnN0IExvY2FsSGlzdG9yeUl0ZW1TZWxlY3RlZEZvckNvbXBhcmUgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignbG9jYWxIaXN0b3J5SXRlbVNlbGVjdGVkRm9yQ29tcGFyZScsIGZhbHNlLCB0cnVlKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5sb2NhbEhpc3Rvcnkuc2VsZWN0Rm9yQ29tcGFyZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdsb2NhbEhpc3Rvcnkuc2VsZWN0Rm9yQ29tcGFyZScsICdTZWxlY3QgZm9yIENvbXBhcmUnKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UaW1lbGluZUl0ZW1Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzJfY29tcGFyZV93aXRoJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IExPQ0FMX0hJU1RPUllfTUVOVV9DT05URVhUX0tFWVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaXRlbTogSVRpbWVsaW5lQ29tbWFuZEFyZ3VtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHsgZW50cnkgfSA9IGF3YWl0IGZpbmRMb2NhbEhpc3RvcnlFbnRyeSh3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLCBpdGVtKTtcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdGl0ZW1TZWxlY3RlZEZvckNvbXBhcmUgPSBpdGVtO1xuXHRcdFx0TG9jYWxIaXN0b3J5SXRlbVNlbGVjdGVkRm9yQ29tcGFyZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpLnNldCh0cnVlKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmxvY2FsSGlzdG9yeS5jb21wYXJlV2l0aFNlbGVjdGVkJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2xvY2FsSGlzdG9yeS5jb21wYXJlV2l0aFNlbGVjdGVkJywgJ0NvbXBhcmUgd2l0aCBTZWxlY3RlZCcpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlRpbWVsaW5lSXRlbUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMl9jb21wYXJlX3dpdGgnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKExPQ0FMX0hJU1RPUllfTUVOVV9DT05URVhUX0tFWSwgTG9jYWxIaXN0b3J5SXRlbVNlbGVjdGVkRm9yQ29tcGFyZSlcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGl0ZW06IElUaW1lbGluZUNvbW1hbmRBcmd1bWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRpZiAoIWl0ZW1TZWxlY3RlZEZvckNvbXBhcmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3RlZEVudHJ5ID0gKGF3YWl0IGZpbmRMb2NhbEhpc3RvcnlFbnRyeSh3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLCBpdGVtU2VsZWN0ZWRGb3JDb21wYXJlKSkuZW50cnk7XG5cdFx0aWYgKCFzZWxlY3RlZEVudHJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBlbnRyeSB9ID0gYXdhaXQgZmluZExvY2FsSGlzdG9yeUVudHJ5KHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UsIGl0ZW0pO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFQSV9PUEVOX0RJRkZfRURJVE9SX0NPTU1BTkRfSUQsIC4uLnRvRGlmZkVkaXRvckFyZ3VtZW50cyhzZWxlY3RlZEVudHJ5LCBlbnRyeSkpO1xuXHRcdH1cblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gU2hvdyBDb250ZW50c1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmxvY2FsSGlzdG9yeS5vcGVuJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2xvY2FsSGlzdG9yeS5vcGVuJywgJ1Nob3cgQ29udGVudHMnKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UaW1lbGluZUl0ZW1Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzNfY29udGVudHMnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogTE9DQUxfSElTVE9SWV9NRU5VX0NPTlRFWFRfS0VZXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpdGVtOiBJVGltZWxpbmVDb21tYW5kQXJndW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHsgZW50cnkgfSA9IGF3YWl0IGZpbmRMb2NhbEhpc3RvcnlFbnRyeSh3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLCBpdGVtKTtcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdHJldHVybiBvcGVuRW50cnkoZW50cnksIGVkaXRvclNlcnZpY2UpO1xuXHRcdH1cblx0fVxufSk7XG5cbi8vI3JlZ2lvbiBSZXN0b3JlIENvbnRlbnRzXG5cbmNvbnN0IFJFU1RPUkVfQ09OVEVOVFNfTEFCRUwgPSBsb2NhbGl6ZTIoJ2xvY2FsSGlzdG9yeS5yZXN0b3JlJywgJ1Jlc3RvcmUgQ29udGVudHMnKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5sb2NhbEhpc3RvcnkucmVzdG9yZVZpYUVkaXRvcicsXG5cdFx0XHR0aXRsZTogUkVTVE9SRV9DT05URU5UU19MQUJFTCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IC0xMCxcblx0XHRcdFx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oTG9jYWxIaXN0b3J5RmlsZVN5c3RlbVByb3ZpZGVyLlNDSEVNQSlcblx0XHRcdH0sXG5cdFx0XHRpY29uOiBMT0NBTF9ISVNUT1JZX0lDT05fUkVTVE9SRVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IGFzc29jaWF0ZWRSZXNvdXJjZSwgbG9jYXRpb24gfSA9IExvY2FsSGlzdG9yeUZpbGVTeXN0ZW1Qcm92aWRlci5mcm9tTG9jYWxIaXN0b3J5RmlsZVN5c3RlbSh1cmkpO1xuXG5cdFx0cmV0dXJuIHJlc3RvcmUoYWNjZXNzb3IsIHsgdXJpOiBhc3NvY2lhdGVkUmVzb3VyY2UsIGhhbmRsZTogYmFzZW5hbWVPckF1dGhvcml0eShsb2NhdGlvbikgfSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmxvY2FsSGlzdG9yeS5yZXN0b3JlJyxcblx0XHRcdHRpdGxlOiBSRVNUT1JFX0NPTlRFTlRTX0xBQkVMLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlRpbWVsaW5lSXRlbUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnM19jb250ZW50cycsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBMT0NBTF9ISVNUT1JZX01FTlVfQ09OVEVYVF9LRVlcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGl0ZW06IElUaW1lbGluZUNvbW1hbmRBcmd1bWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiByZXN0b3JlKGFjY2Vzc29yLCBpdGVtKTtcblx0fVxufSk7XG5cbmNvbnN0IHJlc3RvcmVTYXZlU291cmNlID0gU2F2ZVNvdXJjZVJlZ2lzdHJ5LnJlZ2lzdGVyU291cmNlKCdsb2NhbEhpc3RvcnlSZXN0b3JlLnNvdXJjZScsIGxvY2FsaXplKCdsb2NhbEhpc3RvcnlSZXN0b3JlLnNvdXJjZScsIFwiRmlsZSBSZXN0b3JlZFwiKSk7XG5cbmFzeW5jIGZ1bmN0aW9uIHJlc3RvcmUoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGl0ZW06IElUaW1lbGluZUNvbW1hbmRBcmd1bWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0Y29uc3Qgd29ya2luZ0NvcHlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JraW5nQ29weVNlcnZpY2UpO1xuXHRjb25zdCB3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlKTtcblx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0Y29uc3QgeyBlbnRyeSB9ID0gYXdhaXQgZmluZExvY2FsSGlzdG9yeUVudHJ5KHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UsIGl0ZW0pO1xuXHRpZiAoZW50cnkpIHtcblxuXHRcdC8vIEFzayBmb3IgY29uZmlybWF0aW9uXG5cdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybVJlc3RvcmVNZXNzYWdlJywgXCJEbyB5b3Ugd2FudCB0byByZXN0b3JlIHRoZSBjb250ZW50cyBvZiAnezB9Jz9cIiwgYmFzZW5hbWUoZW50cnkud29ya2luZ0NvcHkucmVzb3VyY2UpKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NvbmZpcm1SZXN0b3JlRGV0YWlsJywgXCJSZXN0b3Jpbmcgd2lsbCBkaXNjYXJkIGFueSB1bnNhdmVkIGNoYW5nZXMuXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdyZXN0b3JlQnV0dG9uTGFiZWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZXN0b3JlXCIpXG5cdFx0fSk7XG5cblx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJldmVydCBhbGwgZGlydHkgd29ya2luZyBjb3BpZXMgZm9yIHRhcmdldFxuXHRcdGNvbnN0IHdvcmtpbmdDb3BpZXMgPSB3b3JraW5nQ29weVNlcnZpY2UuZ2V0QWxsKGVudHJ5LndvcmtpbmdDb3B5LnJlc291cmNlKTtcblx0XHRpZiAod29ya2luZ0NvcGllcykge1xuXHRcdFx0Zm9yIChjb25zdCB3b3JraW5nQ29weSBvZiB3b3JraW5nQ29waWVzKSB7XG5cdFx0XHRcdGlmICh3b3JraW5nQ29weS5pc0RpcnR5KCkpIHtcblx0XHRcdFx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXZlcnQoeyBzb2Z0OiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVwbGFjZSB0YXJnZXQgd2l0aCBjb250ZW50cyBvZiBoaXN0b3J5IGVudHJ5XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNsb25lRmlsZShlbnRyeS5sb2NhdGlvbiwgZW50cnkud29ya2luZ0NvcHkucmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdC8vIEl0IGlzIHBvc3NpYmxlIHRoYXQgd2UgZmFpbCB0byBjb3B5IHRoZSBoaXN0b3J5IGVudHJ5IHRvIHRoZVxuXHRcdFx0Ly8gZGVzdGluYXRpb24sIGZvciBleGFtcGxlIHdoZW4gdGhlIGRlc3RpbmF0aW9uIGlzIHdyaXRlIHByb3RlY3RlZC5cblx0XHRcdC8vIEluIHRoYXQgY2FzZSB0ZWxsIHRoZSB1c2VyIGFuZCByZXR1cm4sIGl0IGlzIHN0aWxsIHBvc3NpYmxlIGZvclxuXHRcdFx0Ly8gdGhlIHVzZXIgdG8gbWFudWFsbHkgY29weSB0aGUgY2hhbmdlcyBvdmVyIGZyb20gdGhlIGRpZmYgZWRpdG9yLlxuXG5cdFx0XHRhd2FpdCBkaWFsb2dTZXJ2aWNlLmVycm9yKGxvY2FsaXplKCd1bmFibGVUb1Jlc3RvcmUnLCBcIlVuYWJsZSB0byByZXN0b3JlICd7MH0nLlwiLCBiYXNlbmFtZShlbnRyeS53b3JraW5nQ29weS5yZXNvdXJjZSkpLCB0b0Vycm9yTWVzc2FnZShlcnJvcikpO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVzdG9yZSBhbGwgd29ya2luZyBjb3BpZXMgZm9yIHRhcmdldFxuXHRcdGlmICh3b3JraW5nQ29waWVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHdvcmtpbmdDb3B5IG9mIHdvcmtpbmdDb3BpZXMpIHtcblx0XHRcdFx0YXdhaXQgd29ya2luZ0NvcHkucmV2ZXJ0KHsgZm9yY2U6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiB0YXJnZXRcblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogZW50cnkud29ya2luZ0NvcHkucmVzb3VyY2UgfSk7XG5cblx0XHQvLyBBZGQgbmV3IGVudHJ5XG5cdFx0YXdhaXQgd29ya2luZ0NvcHlIaXN0b3J5U2VydmljZS5hZGRFbnRyeSh7XG5cdFx0XHRyZXNvdXJjZTogZW50cnkud29ya2luZ0NvcHkucmVzb3VyY2UsXG5cdFx0XHRzb3VyY2U6IHJlc3RvcmVTYXZlU291cmNlXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHQvLyBDbG9zZSBzb3VyY2Vcblx0XHRhd2FpdCBjbG9zZUVudHJ5KGVudHJ5LCBlZGl0b3JTZXJ2aWNlKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmxvY2FsSGlzdG9yeS5yZXN0b3JlVmlhUGlja2VyJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2xvY2FsSGlzdG9yeS5yZXN0b3JlVmlhUGlja2VyJywgJ0ZpbmQgRW50cnkgdG8gUmVzdG9yZScpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogTE9DQUxfSElTVE9SWV9DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ1RYX0xPQ0FMX0hJU1RPUllfRU5BQkxFRFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNb2RlbFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBsYWJlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhYmVsU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIaXN0b3J5U2VydmljZSk7XG5cblx0XHQvLyBTaG93IGFsbCByZXNvdXJjZXMgd2l0aCBhc3NvY2lhdGVkIGhpc3RvcnkgZW50cmllcyBpbiBwaWNrZXJcblx0XHQvLyB3aXRoIHByb2dyZXNzIGJlY2F1c2UgdGhpcyBvcGVyYXRpb24gd2lsbCB0YWtlIGxvbmdlciB0aGUgbW9yZVxuXHRcdC8vIGZpbGVzIGhhdmUgYmVlbiBzYXZlZCBvdmVyYWxsLlxuXHRcdC8vXG5cdFx0Ly8gU29ydCB0aGUgcmVzb3VyY2VzIGJ5IGhpc3RvcnkgdG8gcHV0IG1vcmUgcmVsZXZhbnQgZW50cmllc1xuXHRcdC8vIHRvIHRoZSB0b3AuXG5cblx0XHRjb25zdCByZXNvdXJjZVBpY2tlckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHJlc291cmNlUGlja2VyID0gcmVzb3VyY2VQaWNrZXJEaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtICYgeyByZXNvdXJjZTogVVJJIH0+KCkpO1xuXG5cdFx0bGV0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHJlc291cmNlUGlja2VyRGlzcG9zYWJsZXMuYWRkKHJlc291cmNlUGlja2VyLm9uRGlkSGlkZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXG5cdFx0cmVzb3VyY2VQaWNrZXIuYnVzeSA9IHRydWU7XG5cdFx0cmVzb3VyY2VQaWNrZXIuc2hvdygpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VzID0gbmV3IFJlc291cmNlU2V0KGF3YWl0IHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UuZ2V0QWxsKGN0cy50b2tlbikpO1xuXHRcdGNvbnN0IHJlY2VudEVkaXRvclJlc291cmNlcyA9IG5ldyBSZXNvdXJjZVNldChjb2FsZXNjZShoaXN0b3J5U2VydmljZS5nZXRIaXN0b3J5KCkubWFwKCh7IHJlc291cmNlIH0pID0+IHJlc291cmNlKSkpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VzU29ydGVkQnlSZWNlbmN5OiBVUklbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcmVjZW50RWRpdG9yUmVzb3VyY2VzKSB7XG5cdFx0XHRpZiAocmVzb3VyY2VzLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdFx0cmVzb3VyY2VzU29ydGVkQnlSZWNlbmN5LnB1c2gocmVzb3VyY2UpO1xuXHRcdFx0XHRyZXNvdXJjZXMuZGVsZXRlKHJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmVzb3VyY2VzU29ydGVkQnlSZWNlbmN5LnB1c2goLi4uWy4uLnJlc291cmNlc10uc29ydCgocjEsIHIyKSA9PiByMS5mc1BhdGggPCByMi5mc1BhdGggPyAtMSA6IDEpKTtcblxuXHRcdHJlc291cmNlUGlja2VyLmJ1c3kgPSBmYWxzZTtcblx0XHRyZXNvdXJjZVBpY2tlci5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdyZXN0b3JlVmlhUGlja2VyLmZpbGVQbGFjZWhvbGRlcicsIFwiU2VsZWN0IHRoZSBmaWxlIHRvIHNob3cgbG9jYWwgaGlzdG9yeSBmb3JcIik7XG5cdFx0cmVzb3VyY2VQaWNrZXIubWF0Y2hPbkxhYmVsID0gdHJ1ZTtcblx0XHRyZXNvdXJjZVBpY2tlci5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdHJlc291cmNlUGlja2VyLml0ZW1zID0gWy4uLnJlc291cmNlc1NvcnRlZEJ5UmVjZW5jeV0ubWFwKHJlc291cmNlID0+ICh7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdGxhYmVsOiBiYXNlbmFtZU9yQXV0aG9yaXR5KHJlc291cmNlKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGlybmFtZShyZXNvdXJjZSksIHsgcmVsYXRpdmU6IHRydWUgfSksXG5cdFx0XHRpY29uQ2xhc3NlczogZ2V0SWNvbkNsYXNzZXMobW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIHJlc291cmNlKVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShyZXNvdXJjZVBpY2tlci5vbkRpZEFjY2VwdCk7XG5cdFx0cmVzb3VyY2VQaWNrZXJEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IHJlc291cmNlUGlja2VyLnNlbGVjdGVkSXRlbXMuYXQoMCk/LnJlc291cmNlO1xuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTaG93IGFsbCBlbnRyaWVzIGZvciB0aGUgcGlja2VkIHJlc291cmNlIGluIGFub3RoZXIgcGlja2VyXG5cdFx0Ly8gYW5kIG9wZW4gdGhlIGVudHJ5IGluIHRoZSBlbmQgdGhhdCB3YXMgc2VsZWN0ZWQgYnkgdGhlIHVzZXJcblxuXHRcdGNvbnN0IGVudHJ5UGlja2VyRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZW50cnlQaWNrZXIgPSBlbnRyeVBpY2tlckRpc3Bvc2FibGVzLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0gJiB7IGVudHJ5OiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnkgfT4oKSk7XG5cblx0XHRjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRlbnRyeVBpY2tlckRpc3Bvc2FibGVzLmFkZChlbnRyeVBpY2tlci5vbkRpZEhpZGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblxuXHRcdGVudHJ5UGlja2VyLmJ1c3kgPSB0cnVlO1xuXHRcdGVudHJ5UGlja2VyLnNob3coKTtcblxuXHRcdGNvbnN0IGVudHJpZXMgPSBhd2FpdCB3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLmdldEVudHJpZXMocmVzb3VyY2UsIGN0cy50b2tlbik7XG5cblx0XHRlbnRyeVBpY2tlci5idXN5ID0gZmFsc2U7XG5cdFx0ZW50cnlQaWNrZXIuY2FuQWNjZXB0SW5CYWNrZ3JvdW5kID0gdHJ1ZTtcblx0XHRlbnRyeVBpY2tlci5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdyZXN0b3JlVmlhUGlja2VyLmVudHJ5UGxhY2Vob2xkZXInLCBcIlNlbGVjdCB0aGUgbG9jYWwgaGlzdG9yeSBlbnRyeSB0byBvcGVuXCIpO1xuXHRcdGVudHJ5UGlja2VyLm1hdGNoT25MYWJlbCA9IHRydWU7XG5cdFx0ZW50cnlQaWNrZXIubWF0Y2hPbkRlc2NyaXB0aW9uID0gdHJ1ZTtcblx0XHRlbnRyeVBpY2tlci5pdGVtcyA9IEFycmF5LmZyb20oZW50cmllcykucmV2ZXJzZSgpLm1hcChlbnRyeSA9PiAoe1xuXHRcdFx0ZW50cnksXG5cdFx0XHRsYWJlbDogYCQoY2lyY2xlLW91dGxpbmUpICR7U2F2ZVNvdXJjZVJlZ2lzdHJ5LmdldFNvdXJjZUxhYmVsKGVudHJ5LnNvdXJjZSl9YCxcblx0XHRcdGRlc2NyaXB0aW9uOiB0b0xvY2FsSGlzdG9yeUVudHJ5RGF0ZUxhYmVsKGVudHJ5LnRpbWVzdGFtcClcblx0XHR9KSk7XG5cblx0XHRlbnRyeVBpY2tlckRpc3Bvc2FibGVzLmFkZChlbnRyeVBpY2tlci5vbkRpZEFjY2VwdChhc3luYyBlID0+IHtcblx0XHRcdGlmICghZS5pbkJhY2tncm91bmQpIHtcblx0XHRcdFx0ZW50cnlQaWNrZXJEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlbGVjdGVkSXRlbSA9IGVudHJ5UGlja2VyLnNlbGVjdGVkSXRlbXMuYXQoMCk7XG5cdFx0XHRpZiAoIXNlbGVjdGVkSXRlbSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc291cmNlRXhpc3RzID0gYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKHNlbGVjdGVkSXRlbS5lbnRyeS53b3JraW5nQ29weS5yZXNvdXJjZSk7XG5cdFx0XHRpZiAocmVzb3VyY2VFeGlzdHMpIHtcblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFQSV9PUEVOX0RJRkZfRURJVE9SX0NPTU1BTkRfSUQsIC4uLnRvRGlmZkVkaXRvckFyZ3VtZW50cyhzZWxlY3RlZEl0ZW0uZW50cnksIHNlbGVjdGVkSXRlbS5lbnRyeS53b3JraW5nQ29weS5yZXNvdXJjZSwgeyBwcmVzZXJ2ZUZvY3VzOiBlLmluQmFja2dyb3VuZCB9KSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBvcGVuRW50cnkoc2VsZWN0ZWRJdGVtLmVudHJ5LCBlZGl0b3JTZXJ2aWNlLCB7IHByZXNlcnZlRm9jdXM6IGUuaW5CYWNrZ3JvdW5kIH0pO1xuXHRcdH0pKTtcblx0fVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVGltZWxpbmVUaXRsZSwgeyBjb21tYW5kOiB7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5sb2NhbEhpc3RvcnkucmVzdG9yZVZpYVBpY2tlcicsIHRpdGxlOiBsb2NhbGl6ZTIoJ2xvY2FsSGlzdG9yeS5yZXN0b3JlVmlhUGlja2VyTWVudScsICdMb2NhbCBIaXN0b3J5OiBGaW5kIEVudHJ5IHRvIFJlc3RvcmUuLi4nKSB9LCBncm91cDogJ3N1Ym1lbnUnLCBvcmRlcjogMSwgd2hlbjogQ1RYX0xPQ0FMX0hJU1RPUllfRU5BQkxFRCB9KTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBSZW5hbWVcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5sb2NhbEhpc3RvcnkucmVuYW1lJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2xvY2FsSGlzdG9yeS5yZW5hbWUnLCAnUmVuYW1lJyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGltZWxpbmVJdGVtQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICc1X2VkaXQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogTE9DQUxfSElTVE9SWV9NRU5VX0NPTlRFWFRfS0VZXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpdGVtOiBJVGltZWxpbmVDb21tYW5kQXJndW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgeyBlbnRyeSB9ID0gYXdhaXQgZmluZExvY2FsSGlzdG9yeUVudHJ5KHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UsIGl0ZW0pO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBpbnB1dEJveCA9IGRpc3Bvc2FibGVzLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVJbnB1dEJveCgpKTtcblx0XHRcdGlucHV0Qm94LnRpdGxlID0gbG9jYWxpemUoJ3JlbmFtZUxvY2FsSGlzdG9yeUVudHJ5VGl0bGUnLCBcIlJlbmFtZSBMb2NhbCBIaXN0b3J5IEVudHJ5XCIpO1xuXHRcdFx0aW5wdXRCb3guaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdFx0aW5wdXRCb3gucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgncmVuYW1lTG9jYWxIaXN0b3J5UGxhY2Vob2xkZXInLCBcIkVudGVyIHRoZSBuZXcgbmFtZSBvZiB0aGUgbG9jYWwgaGlzdG9yeSBlbnRyeVwiKTtcblx0XHRcdGlucHV0Qm94LnZhbHVlID0gU2F2ZVNvdXJjZVJlZ2lzdHJ5LmdldFNvdXJjZUxhYmVsKGVudHJ5LnNvdXJjZSk7XG5cdFx0XHRpbnB1dEJveC5zaG93KCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXRCb3gub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRpZiAoaW5wdXRCb3gudmFsdWUpIHtcblx0XHRcdFx0XHR3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLnVwZGF0ZUVudHJ5KGVudHJ5LCB7IHNvdXJjZTogaW5wdXRCb3gudmFsdWUgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gRGVsZXRlXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubG9jYWxIaXN0b3J5LmRlbGV0ZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdsb2NhbEhpc3RvcnkuZGVsZXRlJywgJ0RlbGV0ZScpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlRpbWVsaW5lSXRlbUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnNV9lZGl0Jyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IExPQ0FMX0hJU1RPUllfTUVOVV9DT05URVhUX0tFWVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaXRlbTogSVRpbWVsaW5lQ29tbWFuZEFyZ3VtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cblx0XHRjb25zdCB7IGVudHJ5IH0gPSBhd2FpdCBmaW5kTG9jYWxIaXN0b3J5RW50cnkod29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSwgaXRlbSk7XG5cdFx0aWYgKGVudHJ5KSB7XG5cblx0XHRcdC8vIEFzayBmb3IgY29uZmlybWF0aW9uXG5cdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybURlbGV0ZU1lc3NhZ2UnLCBcIkRvIHlvdSB3YW50IHRvIGRlbGV0ZSB0aGUgbG9jYWwgaGlzdG9yeSBlbnRyeSBvZiAnezB9JyBmcm9tIHsxfT9cIiwgZW50cnkud29ya2luZ0NvcHkubmFtZSwgdG9Mb2NhbEhpc3RvcnlFbnRyeURhdGVMYWJlbChlbnRyeS50aW1lc3RhbXApKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY29uZmlybURlbGV0ZURldGFpbCcsIFwiVGhpcyBhY3Rpb24gaXMgaXJyZXZlcnNpYmxlIVwiKSxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdkZWxldGVCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkRlbGV0ZVwiKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlbW92ZSB2aWEgc2VydmljZVxuXHRcdFx0YXdhaXQgd29ya2luZ0NvcHlIaXN0b3J5U2VydmljZS5yZW1vdmVFbnRyeShlbnRyeSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdC8vIENsb3NlIGFueSBvcGVuZWQgZWRpdG9yc1xuXHRcdFx0YXdhaXQgY2xvc2VFbnRyeShlbnRyeSwgZWRpdG9yU2VydmljZSk7XG5cdFx0fVxuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBEZWxldGUgQWxsXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubG9jYWxIaXN0b3J5LmRlbGV0ZUFsbCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdsb2NhbEhpc3RvcnkuZGVsZXRlQWxsJywgJ0RlbGV0ZSBBbGwnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IExPQ0FMX0hJU1RPUllfQ0FURUdPUlksXG5cdFx0XHRwcmVjb25kaXRpb246IENUWF9MT0NBTF9ISVNUT1JZX0VOQUJMRURcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCB3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdC8vIEFzayBmb3IgY29uZmlybWF0aW9uXG5cdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybURlbGV0ZUFsbE1lc3NhZ2UnLCBcIkRvIHlvdSB3YW50IHRvIGRlbGV0ZSBhbGwgZW50cmllcyBvZiBhbGwgZmlsZXMgaW4gbG9jYWwgaGlzdG9yeT9cIiksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjb25maXJtRGVsZXRlQWxsRGV0YWlsJywgXCJUaGlzIGFjdGlvbiBpcyBpcnJldmVyc2libGUhXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdkZWxldGVBbGxCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkRlbGV0ZSBBbGxcIiksXG5cdFx0fSk7XG5cblx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSB2aWEgc2VydmljZVxuXHRcdGF3YWl0IHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UucmVtb3ZlQWxsKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBDcmVhdGVcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5sb2NhbEhpc3RvcnkuY3JlYXRlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2xvY2FsSGlzdG9yeS5jcmVhdGUnLCAnQ3JlYXRlIEVudHJ5JyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBMT0NBTF9ISVNUT1JZX0NBVEVHT1JZLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ1RYX0xPQ0FMX0hJU1RPUllfRU5BQkxFRCwgQWN0aXZlRWRpdG9yQ29udGV4dClcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhYmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFiZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBwYXRoU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGF0aFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0aWYgKHJlc291cmNlPy5zY2hlbWUgIT09IHBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWUgJiYgcmVzb3VyY2U/LnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVVc2VyRGF0YSkge1xuXHRcdFx0cmV0dXJuOyAvLyBvbmx5IGVuYWJsZSBmb3Igc2VsZWN0ZWQgc2NoZW1lc1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGlucHV0Qm94ID0gZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZUlucHV0Qm94KCkpO1xuXHRcdGlucHV0Qm94LnRpdGxlID0gbG9jYWxpemUoJ2NyZWF0ZUxvY2FsSGlzdG9yeUVudHJ5VGl0bGUnLCBcIkNyZWF0ZSBMb2NhbCBIaXN0b3J5IEVudHJ5XCIpO1xuXHRcdGlucHV0Qm94Lmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRpbnB1dEJveC5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdjcmVhdGVMb2NhbEhpc3RvcnlQbGFjZWhvbGRlcicsIFwiRW50ZXIgdGhlIG5ldyBuYW1lIG9mIHRoZSBsb2NhbCBoaXN0b3J5IGVudHJ5IGZvciAnezB9J1wiLCBsYWJlbFNlcnZpY2UuZ2V0VXJpQmFzZW5hbWVMYWJlbChyZXNvdXJjZSkpO1xuXHRcdGlucHV0Qm94LnNob3coKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXRCb3gub25EaWRBY2NlcHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW50cnlTb3VyY2UgPSBpbnB1dEJveC52YWx1ZTtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdFx0aWYgKGVudHJ5U291cmNlKSB7XG5cdFx0XHRcdGF3YWl0IHdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UuYWRkRW50cnkoeyByZXNvdXJjZSwgc291cmNlOiBpbnB1dEJveC52YWx1ZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIEhlbHBlcnNcblxuYXN5bmMgZnVuY3Rpb24gb3BlbkVudHJ5KGVudHJ5OiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnksIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLCBvcHRpb25zPzogSUVkaXRvck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgcmVzb3VyY2UgPSBMb2NhbEhpc3RvcnlGaWxlU3lzdGVtUHJvdmlkZXIudG9Mb2NhbEhpc3RvcnlGaWxlU3lzdGVtKHsgbG9jYXRpb246IGVudHJ5LmxvY2F0aW9uLCBhc3NvY2lhdGVkUmVzb3VyY2U6IGVudHJ5LndvcmtpbmdDb3B5LnJlc291cmNlIH0pO1xuXG5cdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0cmVzb3VyY2UsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdsb2NhbEhpc3RvcnlFZGl0b3JMYWJlbCcsIFwiezB9ICh7MX0gXHUyMDIyIHsyfSlcIiwgZW50cnkud29ya2luZ0NvcHkubmFtZSwgU2F2ZVNvdXJjZVJlZ2lzdHJ5LmdldFNvdXJjZUxhYmVsKGVudHJ5LnNvdXJjZSksIHRvTG9jYWxIaXN0b3J5RW50cnlEYXRlTGFiZWwoZW50cnkudGltZXN0YW1wKSksXG5cdFx0b3B0aW9uc1xuXHR9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY2xvc2VFbnRyeShlbnRyeTogSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5LCBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCByZXNvdXJjZSA9IExvY2FsSGlzdG9yeUZpbGVTeXN0ZW1Qcm92aWRlci50b0xvY2FsSGlzdG9yeUZpbGVTeXN0ZW0oeyBsb2NhdGlvbjogZW50cnkubG9jYXRpb24sIGFzc29jaWF0ZWRSZXNvdXJjZTogZW50cnkud29ya2luZ0NvcHkucmVzb3VyY2UgfSk7XG5cblx0Y29uc3QgZWRpdG9ycyA9IGVkaXRvclNlcnZpY2UuZmluZEVkaXRvcnMocmVzb3VyY2UsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIH0pO1xuXHRhd2FpdCBlZGl0b3JTZXJ2aWNlLmNsb3NlRWRpdG9ycyhlZGl0b3JzLCB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0RpZmZFZGl0b3JBcmd1bWVudHMoZW50cnk6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSwgcmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElFZGl0b3JPcHRpb25zKTogdW5rbm93bltdO1xuZXhwb3J0IGZ1bmN0aW9uIHRvRGlmZkVkaXRvckFyZ3VtZW50cyhwcmV2aW91c0VudHJ5OiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnksIGVudHJ5OiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnksIG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucyk6IHVua25vd25bXTtcbmV4cG9ydCBmdW5jdGlvbiB0b0RpZmZFZGl0b3JBcmd1bWVudHMoYXJnMTogSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5LCBhcmcyOiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnkgfCBVUkksIG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucyk6IHVua25vd25bXSB7XG5cblx0Ly8gTGVmdCBoYW5kIHNpZGUgaXMgYWx3YXlzIGEgd29ya2luZyBjb3B5IGhpc3RvcnkgZW50cnlcblx0Y29uc3Qgb3JpZ2luYWxSZXNvdXJjZSA9IExvY2FsSGlzdG9yeUZpbGVTeXN0ZW1Qcm92aWRlci50b0xvY2FsSGlzdG9yeUZpbGVTeXN0ZW0oeyBsb2NhdGlvbjogYXJnMS5sb2NhdGlvbiwgYXNzb2NpYXRlZFJlc291cmNlOiBhcmcxLndvcmtpbmdDb3B5LnJlc291cmNlIH0pO1xuXG5cdGxldCBsYWJlbDogc3RyaW5nO1xuXG5cdC8vIFJpZ2h0IGhhbmQgc2lkZSBkZXBlbmRzIG9uIGhvdyB0aGUgbWV0aG9kIHdhcyBjYWxsZWRcblx0Ly8gYW5kIGlzIGVpdGhlciBhbm90aGVyIHdvcmtpbmcgY29weSBoaXN0b3J5IGVudHJ5XG5cdC8vIG9yIHRoZSBmaWxlIG9uIGRpc2suXG5cblx0bGV0IG1vZGlmaWVkUmVzb3VyY2U6IFVSSTtcblxuXHQvLyBDb21wYXJlIHdpdGggZmlsZSBvbiBkaXNrXG5cdGlmIChVUkkuaXNVcmkoYXJnMikpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IGFyZzI7XG5cblx0XHRtb2RpZmllZFJlc291cmNlID0gcmVzb3VyY2U7XG5cdFx0bGFiZWwgPSBsb2NhbGl6ZSgnbG9jYWxIaXN0b3J5Q29tcGFyZVRvRmlsZUVkaXRvckxhYmVsJywgXCJ7MH0gKHsxfSBcdTIwMjIgezJ9KSBcdTIxOTQgezN9XCIsIGFyZzEud29ya2luZ0NvcHkubmFtZSwgU2F2ZVNvdXJjZVJlZ2lzdHJ5LmdldFNvdXJjZUxhYmVsKGFyZzEuc291cmNlKSwgdG9Mb2NhbEhpc3RvcnlFbnRyeURhdGVMYWJlbChhcmcxLnRpbWVzdGFtcCksIGFyZzEud29ya2luZ0NvcHkubmFtZSk7XG5cdH1cblxuXHQvLyBDb21wYXJlIHdpdGggYW5vdGhlciBlbnRyeVxuXHRlbHNlIHtcblx0XHRjb25zdCBtb2RpZmllZCA9IGFyZzI7XG5cblx0XHRtb2RpZmllZFJlc291cmNlID0gTG9jYWxIaXN0b3J5RmlsZVN5c3RlbVByb3ZpZGVyLnRvTG9jYWxIaXN0b3J5RmlsZVN5c3RlbSh7IGxvY2F0aW9uOiBtb2RpZmllZC5sb2NhdGlvbiwgYXNzb2NpYXRlZFJlc291cmNlOiBtb2RpZmllZC53b3JraW5nQ29weS5yZXNvdXJjZSB9KTtcblx0XHRsYWJlbCA9IGxvY2FsaXplKCdsb2NhbEhpc3RvcnlDb21wYXJlVG9QcmV2aW91c0VkaXRvckxhYmVsJywgXCJ7MH0gKHsxfSBcdTIwMjIgezJ9KSBcdTIxOTQgezN9ICh7NH0gXHUyMDIyIHs1fSlcIiwgYXJnMS53b3JraW5nQ29weS5uYW1lLCBTYXZlU291cmNlUmVnaXN0cnkuZ2V0U291cmNlTGFiZWwoYXJnMS5zb3VyY2UpLCB0b0xvY2FsSGlzdG9yeUVudHJ5RGF0ZUxhYmVsKGFyZzEudGltZXN0YW1wKSwgbW9kaWZpZWQud29ya2luZ0NvcHkubmFtZSwgU2F2ZVNvdXJjZVJlZ2lzdHJ5LmdldFNvdXJjZUxhYmVsKG1vZGlmaWVkLnNvdXJjZSksIHRvTG9jYWxIaXN0b3J5RW50cnlEYXRlTGFiZWwobW9kaWZpZWQudGltZXN0YW1wKSk7XG5cdH1cblxuXHRyZXR1cm4gW1xuXHRcdG9yaWdpbmFsUmVzb3VyY2UsXG5cdFx0bW9kaWZpZWRSZXNvdXJjZSxcblx0XHRsYWJlbCxcblx0XHRvcHRpb25zID8gW3VuZGVmaW5lZCwgb3B0aW9uc10gOiB1bmRlZmluZWRcblx0XTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZpbmRMb2NhbEhpc3RvcnlFbnRyeSh3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlOiBJV29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSwgZGVzY3JpcHRvcjogSVRpbWVsaW5lQ29tbWFuZEFyZ3VtZW50KTogUHJvbWlzZTx7IGVudHJ5OiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnkgfCB1bmRlZmluZWQ7IHByZXZpb3VzOiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnkgfCB1bmRlZmluZWQgfT4ge1xuXG5cdC8vIFdoZW4gdGhlIHJlc291cmNlIFVSSSB1c2VzIHRoZSBgdnNjb2RlLWxvY2FsLWhpc3RvcnlgIHNjaGVtZSAoZS5nLlxuXHQvLyB3aGVuIHRyaWdnZXJlZCBmcm9tIHRoZSBkaWZmIGVkaXRvciksIG1hcCBpdCBiYWNrIHRvIHRoZSBvcmlnaW5hbFxuXHQvLyBmaWxlIFVSSSBzbyB0aGF0IHRoZSBoaXN0b3J5IHNlcnZpY2UgY2FuIGZpbmQgbWF0Y2hpbmcgZW50cmllcy5cblx0bGV0IHVyaSA9IGRlc2NyaXB0b3IudXJpO1xuXHRpZiAodXJpLnNjaGVtZSA9PT0gTG9jYWxIaXN0b3J5RmlsZVN5c3RlbVByb3ZpZGVyLlNDSEVNQSkge1xuXHRcdHVyaSA9IExvY2FsSGlzdG9yeUZpbGVTeXN0ZW1Qcm92aWRlci5mcm9tTG9jYWxIaXN0b3J5RmlsZVN5c3RlbSh1cmkpLmFzc29jaWF0ZWRSZXNvdXJjZTtcblx0fVxuXG5cdGNvbnN0IGVudHJpZXMgPSBhd2FpdCB3b3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLmdldEVudHJpZXModXJpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRsZXQgY3VycmVudEVudHJ5OiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGxldCBwcmV2aW91c0VudHJ5OiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgZW50cmllcy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGVudHJ5ID0gZW50cmllc1tpXTtcblxuXHRcdGlmIChlbnRyeS5pZCA9PT0gZGVzY3JpcHRvci5oYW5kbGUpIHtcblx0XHRcdGN1cnJlbnRFbnRyeSA9IGVudHJ5O1xuXHRcdFx0cHJldmlvdXNFbnRyeSA9IGVudHJpZXNbaSAtIDFdO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRlbnRyeTogY3VycmVudEVudHJ5LFxuXHRcdHByZXZpb3VzOiBwcmV2aW91c0VudHJ5XG5cdH07XG59XG5cbmNvbnN0IFNFUCA9IC9cXC8vZztcbmZ1bmN0aW9uIHRvTG9jYWxIaXN0b3J5RW50cnlEYXRlTGFiZWwodGltZXN0YW1wOiBudW1iZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7Z2V0TG9jYWxIaXN0b3J5RGF0ZUZvcm1hdHRlcigpLmZvcm1hdCh0aW1lc3RhbXApLnJlcGxhY2UoU0VQLCAnLScpfWA7IC8vIHByZXNlcnZpbmcgYC9gIHdpbGwgYnJlYWsgZWRpdG9yIGxhYmVscywgc28gcmVwbGFjZSBpdCB3aXRoIGEgbm9uLXBhdGggc3ltYm9sXG59XG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBbUMsa0NBQWtDO0FBQ3JFLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsZ0JBQWdCLG9CQUFvQixxQkFBcUI7QUFFbEUsU0FBUyxpQkFBaUIsU0FBUyxRQUFRLG9CQUFvQjtBQUMvRCxTQUFTLFVBQVUscUJBQXFCLGVBQWU7QUFDdkQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0Isb0JBQW9CLHdC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
