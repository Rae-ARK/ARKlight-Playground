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
import { Event } from "../../../../base/common/event.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { parse } from "../../../../base/common/marshalling.js";
import { isEqual } from "../../../../base/common/resources.js";
import { isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { IBulkEditService } from "../../../../editor/browser/services/bulkEditService.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { localize2 } from "../../../../nls.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { EditorExtensions } from "../../../common/editor.js";
import { IEditorResolverService, RegisteredEditorPriority } from "../../../services/editor/common/editorResolverService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IWorkingCopyEditorService } from "../../../services/workingCopy/common/workingCopyEditorService.js";
import { ResourceNotebookCellEdit } from "../../bulkEdit/browser/bulkCellEdits.js";
import { getReplView } from "../../debug/browser/repl.js";
import { REPL_VIEW_ID } from "../../debug/common/debug.js";
import { InlineChatController } from "../../inlineChat/browser/inlineChatController.js";
import { IInteractiveHistoryService } from "../../interactive/browser/interactiveHistoryService.js";
import { NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT } from "../../notebook/browser/controller/coreActions.js";
import * as icons from "../../notebook/browser/notebookIcons.js";
import { ReplEditorAccessibleView } from "../../notebook/browser/replEditorAccessibleView.js";
import { INotebookEditorService } from "../../notebook/browser/services/notebookEditorService.js";
import { CellEditType, CellKind, NotebookSetting, NotebookWorkingCopyTypeIdentifier, REPL_EDITOR_ID } from "../../notebook/common/notebookCommon.js";
import { IS_COMPOSITE_NOTEBOOK, MOST_RECENT_REPL_EDITOR, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_EDITOR_FOCUSED } from "../../notebook/common/notebookContextKeys.js";
import { INotebookEditorModelResolverService } from "../../notebook/common/notebookEditorModelResolverService.js";
import { INotebookService } from "../../notebook/common/notebookService.js";
import { isReplEditorControl, ReplEditor } from "./replEditor.js";
import { ReplEditorHistoryAccessibilityHelp, ReplEditorInputAccessibilityHelp } from "./replEditorAccessibilityHelp.js";
import { ReplEditorInput } from "./replEditorInput.js";
class ReplEditorSerializer {
  canSerialize(input) {
    return input.typeId === ReplEditorInput.ID;
  }
  serialize(input) {
    assertType(input instanceof ReplEditorInput);
    const data = {
      resource: input.resource,
      preferredResource: input.preferredResource,
      viewType: input.viewType,
      options: input.options,
      label: input.getName()
    };
    return JSON.stringify(data);
  }
  deserialize(instantiationService, raw) {
    const data = parse(raw);
    if (!data) {
      return void 0;
    }
    const { resource, viewType } = data;
    if (!data || !URI.isUri(resource) || typeof viewType !== "string") {
      return void 0;
    }
    const input = instantiationService.createInstance(ReplEditorInput, resource, data.label);
    return input;
  }
}
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    ReplEditor,
    REPL_EDITOR_ID,
    "REPL Editor"
  ),
  [
    new SyncDescriptor(ReplEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  ReplEditorInput.ID,
  ReplEditorSerializer
);
let ReplDocumentContribution = class extends Disposable {
  constructor(notebookService, editorResolverService, notebookEditorModelResolverService, instantiationService, configurationService) {
    super();
    this.notebookEditorModelResolverService = notebookEditorModelResolverService;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.editorInputCache = new ResourceMap();
    editorResolverService.registerEditor(
      // don't match anything, we don't need to support re-opening files as REPL editor at this point
      ` `,
      {
        id: "repl",
        label: "repl Editor",
        priority: RegisteredEditorPriority.option
      },
      {
        // We want to support all notebook types which could have any file extension,
        // so we just check if the resource corresponds to a notebook
        canSupportResource: (uri) => notebookService.getNotebookTextModel(uri) !== void 0,
        singlePerResource: true
      },
      {
        createUntitledEditorInput: async ({ resource, options }) => {
          if (resource) {
            const editor2 = this.editorInputCache.get(resource);
            if (editor2 && !editor2.isDisposed()) {
              return { editor: editor2, options };
            } else if (editor2) {
              this.editorInputCache.delete(resource);
            }
          }
          const scratchpad = this.configurationService.getValue(NotebookSetting.InteractiveWindowPromptToSave) !== true;
          const ref = await this.notebookEditorModelResolverService.resolve({ untitledResource: resource }, "jupyter-notebook", { scratchpad, viewType: "repl" });
          const notebookUri = ref.object.notebook.uri;
          Event.once(ref.object.notebook.onWillDispose)(() => {
            ref.dispose();
          });
          const label = options?.label ?? void 0;
          const editor = this.instantiationService.createInstance(ReplEditorInput, notebookUri, label);
          this.editorInputCache.set(notebookUri, editor);
          Event.once(editor.onWillDispose)(() => this.editorInputCache.delete(notebookUri));
          return { editor, options };
        },
        createEditorInput: async ({ resource, options }) => {
          if (this.editorInputCache.has(resource)) {
            return { editor: this.editorInputCache.get(resource), options };
          }
          const label = options?.label ?? void 0;
          const editor = this.instantiationService.createInstance(ReplEditorInput, resource, label);
          this.editorInputCache.set(resource, editor);
          Event.once(editor.onWillDispose)(() => this.editorInputCache.delete(resource));
          return { editor, options };
        }
      }
    );
  }
};
ReplDocumentContribution.ID = "workbench.contrib.replDocument";
ReplDocumentContribution = __decorateClass([
  __decorateParam(0, INotebookService),
  __decorateParam(1, IEditorResolverService),
  __decorateParam(2, INotebookEditorModelResolverService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IConfigurationService)
], ReplDocumentContribution);
let ReplWindowWorkingCopyEditorHandler = class extends Disposable {
  constructor(instantiationService, workingCopyEditorService, extensionService, notebookService) {
    super();
    this.instantiationService = instantiationService;
    this.workingCopyEditorService = workingCopyEditorService;
    this.extensionService = extensionService;
    this.notebookService = notebookService;
    this._installHandler();
  }
  async handles(workingCopy) {
    const notebookType = this._getNotebookType(workingCopy);
    if (!notebookType) {
      return false;
    }
    return !!notebookType && notebookType.viewType === "repl" && await this.notebookService.canResolve(notebookType.notebookType);
  }
  isOpen(workingCopy, editor) {
    if (!this.handles(workingCopy)) {
      return false;
    }
    return editor instanceof ReplEditorInput && isEqual(workingCopy.resource, editor.resource);
  }
  createEditor(workingCopy) {
    return this.instantiationService.createInstance(ReplEditorInput, workingCopy.resource, void 0);
  }
  async _installHandler() {
    await this.extensionService.whenInstalledExtensionsRegistered();
    this._register(this.workingCopyEditorService.registerHandler(this));
  }
  _getNotebookType(workingCopy) {
    return NotebookWorkingCopyTypeIdentifier.parse(workingCopy.typeId);
  }
};
ReplWindowWorkingCopyEditorHandler.ID = "workbench.contrib.replWorkingCopyEditorHandler";
ReplWindowWorkingCopyEditorHandler = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IWorkingCopyEditorService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, INotebookService)
], ReplWindowWorkingCopyEditorHandler);
registerWorkbenchContribution2(ReplWindowWorkingCopyEditorHandler.ID, ReplWindowWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ReplDocumentContribution.ID, ReplDocumentContribution, WorkbenchPhase.BlockRestore);
AccessibleViewRegistry.register(new ReplEditorInputAccessibilityHelp());
AccessibleViewRegistry.register(new ReplEditorHistoryAccessibilityHelp());
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "repl.focusLastItemExecuted",
      title: localize2("repl.focusLastReplOutput", "Focus Most Recent REPL Execution"),
      category: "REPL",
      menu: {
        id: MenuId.CommandPalette,
        when: MOST_RECENT_REPL_EDITOR
      },
      keybinding: [{
        primary: KeyChord(KeyMod.Alt | KeyCode.End, KeyMod.Alt | KeyCode.End),
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT,
        when: ContextKeyExpr.or(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_CELL_LIST_FOCUSED.negate())
      }],
      precondition: MOST_RECENT_REPL_EDITOR
    });
  }
  async run(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const editorControl = editorService.activeEditorPane?.getControl();
    const contextKeyService = accessor.get(IContextKeyService);
    let notebookEditor;
    if (editorControl && isReplEditorControl(editorControl)) {
      notebookEditor = editorControl.notebookEditor;
    } else {
      const uriString = MOST_RECENT_REPL_EDITOR.getValue(contextKeyService);
      const uri = uriString ? URI.parse(uriString) : void 0;
      if (!uri) {
        return;
      }
      const replEditor = editorService.findEditors(uri)[0];
      if (replEditor) {
        const editor = await editorService.openEditor(replEditor.editor, replEditor.groupId);
        const editorControl2 = editor?.getControl();
        if (editorControl2 && isReplEditorControl(editorControl2)) {
          notebookEditor = editorControl2.notebookEditor;
        }
      }
    }
    const viewModel = notebookEditor?.getViewModel();
    if (notebookEditor && viewModel) {
      const lastCellIndex = viewModel.length - 1;
      if (lastCellIndex >= 0) {
        const cell = viewModel.viewCells[lastCellIndex];
        notebookEditor.focusNotebookCell(cell, "container");
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "repl.input.focus",
      title: localize2("repl.input.focus", "Focus Input Editor"),
      category: "REPL",
      menu: {
        id: MenuId.CommandPalette,
        when: MOST_RECENT_REPL_EDITOR
      },
      keybinding: [{
        when: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED),
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT,
        primary: KeyMod.CtrlCmd | KeyCode.DownArrow
      }, {
        when: ContextKeyExpr.and(MOST_RECENT_REPL_EDITOR),
        weight: KeybindingWeight.WorkbenchContrib + 5,
        primary: KeyChord(KeyMod.Alt | KeyCode.Home, KeyMod.Alt | KeyCode.Home)
      }]
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorControl = editorService.activeEditorPane?.getControl();
    const contextKeyService = accessor.get(IContextKeyService);
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      editorService.activeEditorPane?.focus();
    } else {
      const uriString = MOST_RECENT_REPL_EDITOR.getValue(contextKeyService);
      const uri = uriString ? URI.parse(uriString) : void 0;
      if (!uri) {
        return;
      }
      const replEditor = editorService.findEditors(uri)[0];
      if (replEditor) {
        await editorService.openEditor({ resource: uri, options: { preserveFocus: false } }, replEditor.groupId);
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "repl.execute",
      title: localize2("repl.execute", "Execute REPL input"),
      category: "REPL",
      keybinding: [{
        when: ContextKeyExpr.and(
          IS_COMPOSITE_NOTEBOOK,
          ContextKeyExpr.equals("activeEditor", "workbench.editor.repl"),
          NOTEBOOK_CELL_LIST_FOCUSED.negate()
        ),
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      }, {
        when: ContextKeyExpr.and(
          IS_COMPOSITE_NOTEBOOK,
          ContextKeyExpr.equals("activeEditor", "workbench.editor.repl"),
          ContextKeyExpr.equals("config.interactiveWindow.executeWithShiftEnter", true),
          NOTEBOOK_CELL_LIST_FOCUSED.negate()
        ),
        primary: KeyMod.Shift | KeyCode.Enter,
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      }, {
        when: ContextKeyExpr.and(
          IS_COMPOSITE_NOTEBOOK,
          ContextKeyExpr.equals("activeEditor", "workbench.editor.repl"),
          ContextKeyExpr.equals("config.interactiveWindow.executeWithShiftEnter", false),
          NOTEBOOK_CELL_LIST_FOCUSED.negate()
        ),
        primary: KeyCode.Enter,
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      }],
      menu: [
        {
          id: MenuId.ReplInputExecute
        }
      ],
      icon: icons.executeIcon,
      f1: false,
      metadata: {
        description: "Execute the Contents of the Input Box",
        args: [
          {
            name: "resource",
            description: "Interactive resource Uri",
            isOptional: true
          }
        ]
      }
    });
  }
  async run(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const bulkEditService = accessor.get(IBulkEditService);
    const historyService = accessor.get(IInteractiveHistoryService);
    const notebookEditorService = accessor.get(INotebookEditorService);
    let editorControl;
    if (context) {
      const resourceUri = URI.revive(context);
      const editors = editorService.findEditors(resourceUri);
      for (const found of editors) {
        if (found.editor.typeId === ReplEditorInput.ID) {
          const editor = await editorService.openEditor(found.editor, found.groupId);
          editorControl = editor?.getControl();
          break;
        }
      }
    } else {
      editorControl = editorService.activeEditorPane?.getControl();
    }
    if (isReplEditorControl(editorControl)) {
      executeReplInput(bulkEditService, historyService, notebookEditorService, editorControl);
    }
  }
});
async function executeReplInput(bulkEditService, historyService, notebookEditorService, editorControl) {
  if (editorControl && editorControl.notebookEditor && editorControl.activeCodeEditor) {
    const notebookDocument = editorControl.notebookEditor.textModel;
    const textModel = editorControl.activeCodeEditor.getModel();
    const activeKernel = editorControl.notebookEditor.activeKernel;
    const language = activeKernel?.supportedLanguages[0] ?? PLAINTEXT_LANGUAGE_ID;
    if (notebookDocument && textModel) {
      const index = notebookDocument.length - 1;
      const value = textModel.getValue();
      if (isFalsyOrWhitespace(value)) {
        return;
      }
      const ctrl = InlineChatController.get(editorControl.activeCodeEditor);
      if (ctrl) {
        ctrl.acceptSession();
      }
      historyService.replaceLast(notebookDocument.uri, value);
      historyService.addToHistory(notebookDocument.uri, "");
      textModel.setValue("");
      notebookDocument.cells[index].resetTextBuffer(textModel.getTextBuffer());
      const collapseState = editorControl.notebookEditor.notebookOptions.getDisplayOptions().interactiveWindowCollapseCodeCells === "fromEditor" ? {
        inputCollapsed: false,
        outputCollapsed: false
      } : void 0;
      await bulkEditService.apply([
        new ResourceNotebookCellEdit(
          notebookDocument.uri,
          {
            editType: CellEditType.Replace,
            index,
            count: 0,
            cells: [{
              cellKind: CellKind.Code,
              mime: void 0,
              language,
              source: value,
              outputs: [],
              metadata: {},
              collapseState
            }]
          }
        )
      ]);
      const range = { start: index, end: index + 1 };
      editorControl.notebookEditor.revealCellRangeInView(range);
      await editorControl.notebookEditor.executeNotebookCells(editorControl.notebookEditor.getCellsInRange({ start: index, end: index + 1 }));
      const editor = notebookEditorService.getNotebookEditor(editorControl.notebookEditor.getId());
      if (editor) {
        editor.setSelections([range]);
        editor.setFocus(range);
      }
    }
  }
}
AccessibleViewRegistry.register(new ReplEditorAccessibleView());
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.find.replInputFocus",
  weight: KeybindingWeight.WorkbenchContrib + 1,
  when: ContextKeyExpr.equals("view", REPL_VIEW_ID),
  primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyF,
  secondary: [KeyCode.F3],
  handler: (accessor) => {
    getReplView(accessor.get(IViewsService))?.openFind();
  }
});
export {
  ReplDocumentContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3JlcGxOb3RlYm9vay9icm93c2VyL3JlcGwuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaXNGYWxzeU9yV2hpdGVzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQnVsa0VkaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZURlc2NyaXB0b3IsIElFZGl0b3JQYW5lUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9ucywgSUVkaXRvckNvbnRyb2wsIElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIElFZGl0b3JTZXJpYWxpemVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclJlc29sdmVyU2VydmljZSwgUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RWRpdG9ySGFuZGxlciwgSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0IH0gZnJvbSAnLi4vLi4vYnVsa0VkaXQvYnJvd3Nlci9idWxrQ2VsbEVkaXRzLmpzJztcbmltcG9ydCB7IGdldFJlcGxWaWV3IH0gZnJvbSAnLi4vLi4vZGVidWcvYnJvd3Nlci9yZXBsLmpzJztcbmltcG9ydCB7IFJFUExfVklFV19JRCB9IGZyb20gJy4uLy4uL2RlYnVnL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDaGF0Q29udHJvbGxlciB9IGZyb20gJy4uLy4uL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJSW50ZXJhY3RpdmVIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uL2ludGVyYWN0aXZlL2Jyb3dzZXIvaW50ZXJhY3RpdmVIaXN0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFQgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL2NvbnRyb2xsZXIvY29yZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0VkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgKiBhcyBpY29ucyBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rSWNvbnMuanMnO1xuaW1wb3J0IHsgUmVwbEVkaXRvckFjY2Vzc2libGVWaWV3IH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9yZXBsRWRpdG9yQWNjZXNzaWJsZVZpZXcuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvc2VydmljZXMvbm90ZWJvb2tFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgQ2VsbEtpbmQsIE5vdGVib29rU2V0dGluZywgTm90ZWJvb2tXb3JraW5nQ29weVR5cGVJZGVudGlmaWVyLCBSRVBMX0VESVRPUl9JRCB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJU19DT01QT1NJVEVfTk9URUJPT0ssIE1PU1RfUkVDRU5UX1JFUExfRURJVE9SLCBOT1RFQk9PS19DRUxMX0xJU1RfRk9DVVNFRCwgTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvcklucHV0T3B0aW9ucyB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNSZXBsRWRpdG9yQ29udHJvbCwgUmVwbEVkaXRvciwgUmVwbEVkaXRvckNvbnRyb2wgfSBmcm9tICcuL3JlcGxFZGl0b3IuanMnO1xuaW1wb3J0IHsgUmVwbEVkaXRvckhpc3RvcnlBY2Nlc3NpYmlsaXR5SGVscCwgUmVwbEVkaXRvcklucHV0QWNjZXNzaWJpbGl0eUhlbHAgfSBmcm9tICcuL3JlcGxFZGl0b3JBY2Nlc3NpYmlsaXR5SGVscC5qcyc7XG5pbXBvcnQgeyBSZXBsRWRpdG9ySW5wdXQgfSBmcm9tICcuL3JlcGxFZGl0b3JJbnB1dC5qcyc7XG5cbnR5cGUgU2VyaWFsaXplZE5vdGVib29rRWRpdG9yRGF0YSA9IHsgcmVzb3VyY2U6IFVSSTsgcHJlZmVycmVkUmVzb3VyY2U6IFVSSTsgdmlld1R5cGU6IHN0cmluZzsgb3B0aW9ucz86IE5vdGVib29rRWRpdG9ySW5wdXRPcHRpb25zOyBsYWJlbD86IHN0cmluZyB9O1xuY2xhc3MgUmVwbEVkaXRvclNlcmlhbGl6ZXIgaW1wbGVtZW50cyBJRWRpdG9yU2VyaWFsaXplciB7XG5cdGNhblNlcmlhbGl6ZShpbnB1dDogRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaW5wdXQudHlwZUlkID09PSBSZXBsRWRpdG9ySW5wdXQuSUQ7XG5cdH1cblx0c2VyaWFsaXplKGlucHV0OiBFZGl0b3JJbnB1dCk6IHN0cmluZyB7XG5cdFx0YXNzZXJ0VHlwZShpbnB1dCBpbnN0YW5jZW9mIFJlcGxFZGl0b3JJbnB1dCk7XG5cdFx0Y29uc3QgZGF0YTogU2VyaWFsaXplZE5vdGVib29rRWRpdG9yRGF0YSA9IHtcblx0XHRcdHJlc291cmNlOiBpbnB1dC5yZXNvdXJjZSxcblx0XHRcdHByZWZlcnJlZFJlc291cmNlOiBpbnB1dC5wcmVmZXJyZWRSZXNvdXJjZSxcblx0XHRcdHZpZXdUeXBlOiBpbnB1dC52aWV3VHlwZSxcblx0XHRcdG9wdGlvbnM6IGlucHV0Lm9wdGlvbnMsXG5cdFx0XHRsYWJlbDogaW5wdXQuZ2V0TmFtZSgpXG5cdFx0fTtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZGF0YSk7XG5cdH1cblx0ZGVzZXJpYWxpemUoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgcmF3OiBzdHJpbmcpIHtcblx0XHRjb25zdCBkYXRhID0gPFNlcmlhbGl6ZWROb3RlYm9va0VkaXRvckRhdGE+cGFyc2UocmF3KTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHsgcmVzb3VyY2UsIHZpZXdUeXBlIH0gPSBkYXRhO1xuXHRcdGlmICghZGF0YSB8fCAhVVJJLmlzVXJpKHJlc291cmNlKSB8fCB0eXBlb2Ygdmlld1R5cGUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlucHV0ID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVwbEVkaXRvcklucHV0LCByZXNvdXJjZSwgZGF0YS5sYWJlbCk7XG5cdFx0cmV0dXJuIGlucHV0O1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0UmVwbEVkaXRvcixcblx0XHRSRVBMX0VESVRPUl9JRCxcblx0XHQnUkVQTCBFZGl0b3InXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoUmVwbEVkaXRvcklucHV0KVxuXHRdXG4pO1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihcblx0UmVwbEVkaXRvcklucHV0LklELFxuXHRSZXBsRWRpdG9yU2VyaWFsaXplclxuKTtcblxuZXhwb3J0IGNsYXNzIFJlcGxEb2N1bWVudENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIucmVwbERvY3VtZW50JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcklucHV0Q2FjaGUgPSBuZXcgUmVzb3VyY2VNYXA8UmVwbEVkaXRvcklucHV0PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIG5vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRASUVkaXRvclJlc29sdmVyU2VydmljZSBlZGl0b3JSZXNvbHZlclNlcnZpY2U6IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZTogSU5vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGVkaXRvclJlc29sdmVyU2VydmljZS5yZWdpc3RlckVkaXRvcihcblx0XHRcdC8vIGRvbid0IG1hdGNoIGFueXRoaW5nLCB3ZSBkb24ndCBuZWVkIHRvIHN1cHBvcnQgcmUtb3BlbmluZyBmaWxlcyBhcyBSRVBMIGVkaXRvciBhdCB0aGlzIHBvaW50XG5cdFx0XHRgIGAsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAncmVwbCcsXG5cdFx0XHRcdGxhYmVsOiAncmVwbCBFZGl0b3InLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5Lm9wdGlvblxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Ly8gV2Ugd2FudCB0byBzdXBwb3J0IGFsbCBub3RlYm9vayB0eXBlcyB3aGljaCBjb3VsZCBoYXZlIGFueSBmaWxlIGV4dGVuc2lvbixcblx0XHRcdFx0Ly8gc28gd2UganVzdCBjaGVjayBpZiB0aGUgcmVzb3VyY2UgY29ycmVzcG9uZHMgdG8gYSBub3RlYm9va1xuXHRcdFx0XHRjYW5TdXBwb3J0UmVzb3VyY2U6IHVyaSA9PiBub3RlYm9va1NlcnZpY2UuZ2V0Tm90ZWJvb2tUZXh0TW9kZWwodXJpKSAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0XHRzaW5nbGVQZXJSZXNvdXJjZTogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlVW50aXRsZWRFZGl0b3JJbnB1dDogYXN5bmMgKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSkgPT4ge1xuXHRcdFx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5lZGl0b3JJbnB1dENhY2hlLmdldChyZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRpZiAoZWRpdG9yICYmICFlZGl0b3IuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IGVkaXRvciwgb3B0aW9ucyB9O1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChlZGl0b3IpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5lZGl0b3JJbnB1dENhY2hlLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHNjcmF0Y2hwYWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5JbnRlcmFjdGl2ZVdpbmRvd1Byb21wdFRvU2F2ZSkgIT09IHRydWU7XG5cdFx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5ub3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmUoeyB1bnRpdGxlZFJlc291cmNlOiByZXNvdXJjZSB9LCAnanVweXRlci1ub3RlYm9vaycsIHsgc2NyYXRjaHBhZCwgdmlld1R5cGU6ICdyZXBsJyB9KTtcblxuXHRcdFx0XHRcdGNvbnN0IG5vdGVib29rVXJpID0gcmVmLm9iamVjdC5ub3RlYm9vay51cmk7XG5cblx0XHRcdFx0XHQvLyB1bnRpdGxlZCBub3RlYm9va3MgYXJlIGRpc3Bvc2VkIHdoZW4gdGhleSBnZXQgc2F2ZWQuIHdlIHNob3VsZCBub3QgaG9sZCBhIHJlZmVyZW5jZVxuXHRcdFx0XHRcdC8vIHRvIHN1Y2ggYSBkaXNwb3NlZCBub3RlYm9vayBhbmQgdGhlcmVmb3JlIGRpc3Bvc2UgdGhlIHJlZmVyZW5jZSBhcyB3ZWxsXG5cdFx0XHRcdFx0RXZlbnQub25jZShyZWYub2JqZWN0Lm5vdGVib29rLm9uV2lsbERpc3Bvc2UpKCgpID0+IHtcblx0XHRcdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSAob3B0aW9ucyBhcyBJTm90ZWJvb2tFZGl0b3JPcHRpb25zKT8ubGFiZWwgPz8gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVwbEVkaXRvcklucHV0LCBub3RlYm9va1VyaSwgbGFiZWwpO1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9ySW5wdXRDYWNoZS5zZXQobm90ZWJvb2tVcmksIGVkaXRvcik7XG5cdFx0XHRcdFx0RXZlbnQub25jZShlZGl0b3Iub25XaWxsRGlzcG9zZSkoKCkgPT4gdGhpcy5lZGl0b3JJbnB1dENhY2hlLmRlbGV0ZShub3RlYm9va1VyaSkpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yLCBvcHRpb25zIH07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiBhc3luYyAoeyByZXNvdXJjZSwgb3B0aW9ucyB9KSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuZWRpdG9ySW5wdXRDYWNoZS5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBlZGl0b3I6IHRoaXMuZWRpdG9ySW5wdXRDYWNoZS5nZXQocmVzb3VyY2UpISwgb3B0aW9ucyB9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gKG9wdGlvbnMgYXMgSU5vdGVib29rRWRpdG9yT3B0aW9ucyk/LmxhYmVsID8/IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlcGxFZGl0b3JJbnB1dCwgcmVzb3VyY2UsIGxhYmVsKTtcblx0XHRcdFx0XHR0aGlzLmVkaXRvcklucHV0Q2FjaGUuc2V0KHJlc291cmNlLCBlZGl0b3IpO1xuXHRcdFx0XHRcdEV2ZW50Lm9uY2UoZWRpdG9yLm9uV2lsbERpc3Bvc2UpKCgpID0+IHRoaXMuZWRpdG9ySW5wdXRDYWNoZS5kZWxldGUocmVzb3VyY2UpKTtcblxuXHRcdFx0XHRcdHJldHVybiB7IGVkaXRvciwgb3B0aW9ucyB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxufVxuXG5jbGFzcyBSZXBsV2luZG93V29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24sIElXb3JraW5nQ29weUVkaXRvckhhbmRsZXIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5yZXBsV29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtpbmdDb3B5RWRpdG9yU2VydmljZTogSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5faW5zdGFsbEhhbmRsZXIoKTtcblx0fVxuXG5cdGFzeW5jIGhhbmRsZXMod29ya2luZ0NvcHk6IElXb3JraW5nQ29weUlkZW50aWZpZXIpIHtcblx0XHRjb25zdCBub3RlYm9va1R5cGUgPSB0aGlzLl9nZXROb3RlYm9va1R5cGUod29ya2luZ0NvcHkpO1xuXHRcdGlmICghbm90ZWJvb2tUeXBlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICEhbm90ZWJvb2tUeXBlICYmIG5vdGVib29rVHlwZS52aWV3VHlwZSA9PT0gJ3JlcGwnICYmIGF3YWl0IHRoaXMubm90ZWJvb2tTZXJ2aWNlLmNhblJlc29sdmUobm90ZWJvb2tUeXBlLm5vdGVib29rVHlwZSk7XG5cdH1cblxuXHRpc09wZW4od29ya2luZ0NvcHk6IElXb3JraW5nQ29weUlkZW50aWZpZXIsIGVkaXRvcjogRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuaGFuZGxlcyh3b3JraW5nQ29weSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdG9yIGluc3RhbmNlb2YgUmVwbEVkaXRvcklucHV0ICYmIGlzRXF1YWwod29ya2luZ0NvcHkucmVzb3VyY2UsIGVkaXRvci5yZXNvdXJjZSk7XG5cdH1cblxuXHRjcmVhdGVFZGl0b3Iod29ya2luZ0NvcHk6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVwbEVkaXRvcklucHV0LCB3b3JraW5nQ29weS5yZXNvdXJjZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2luc3RhbGxIYW5kbGVyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVySGFuZGxlcih0aGlzKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXROb3RlYm9va1R5cGUod29ya2luZ0NvcHk6IElXb3JraW5nQ29weUlkZW50aWZpZXIpIHtcblx0XHRyZXR1cm4gTm90ZWJvb2tXb3JraW5nQ29weVR5cGVJZGVudGlmaWVyLnBhcnNlKHdvcmtpbmdDb3B5LnR5cGVJZCk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFJlcGxXaW5kb3dXb3JraW5nQ29weUVkaXRvckhhbmRsZXIuSUQsIFJlcGxXaW5kb3dXb3JraW5nQ29weUVkaXRvckhhbmRsZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoUmVwbERvY3VtZW50Q29udHJpYnV0aW9uLklELCBSZXBsRG9jdW1lbnRDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5cbkFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IFJlcGxFZGl0b3JJbnB1dEFjY2Vzc2liaWxpdHlIZWxwKCkpO1xuQWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgUmVwbEVkaXRvckhpc3RvcnlBY2Nlc3NpYmlsaXR5SGVscCgpKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAncmVwbC5mb2N1c0xhc3RJdGVtRXhlY3V0ZWQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVwbC5mb2N1c0xhc3RSZXBsT3V0cHV0JywgJ0ZvY3VzIE1vc3QgUmVjZW50IFJFUEwgRXhlY3V0aW9uJyksXG5cdFx0XHRjYXRlZ29yeTogJ1JFUEwnLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBNT1NUX1JFQ0VOVF9SRVBMX0VESVRPUixcblx0XHRcdH0sXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQWx0IHwgS2V5Q29kZS5FbmQsIEtleU1vZC5BbHQgfCBLZXlDb2RlLkVuZCksXG5cdFx0XHRcdHdlaWdodDogTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hULFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihJU19DT01QT1NJVEVfTk9URUJPT0ssIE5PVEVCT09LX0NFTExfTElTVF9GT0NVU0VELm5lZ2F0ZSgpKVxuXHRcdFx0fV0sXG5cdFx0XHRwcmVjb25kaXRpb246IE1PU1RfUkVDRU5UX1JFUExfRURJVE9SXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBVcmlDb21wb25lbnRzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yQ29udHJvbCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0Q29udHJvbCgpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRsZXQgbm90ZWJvb2tFZGl0b3I6IE5vdGVib29rRWRpdG9yV2lkZ2V0IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChlZGl0b3JDb250cm9sICYmIGlzUmVwbEVkaXRvckNvbnRyb2woZWRpdG9yQ29udHJvbCkpIHtcblx0XHRcdG5vdGVib29rRWRpdG9yID0gZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdXJpU3RyaW5nID0gTU9TVF9SRUNFTlRfUkVQTF9FRElUT1IuZ2V0VmFsdWUoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdXJpID0gdXJpU3RyaW5nID8gVVJJLnBhcnNlKHVyaVN0cmluZykgOiB1bmRlZmluZWQ7XG5cblx0XHRcdGlmICghdXJpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlcGxFZGl0b3IgPSBlZGl0b3JTZXJ2aWNlLmZpbmRFZGl0b3JzKHVyaSlbMF07XG5cblx0XHRcdGlmIChyZXBsRWRpdG9yKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihyZXBsRWRpdG9yLmVkaXRvciwgcmVwbEVkaXRvci5ncm91cElkKTtcblx0XHRcdFx0Y29uc3QgZWRpdG9yQ29udHJvbCA9IGVkaXRvcj8uZ2V0Q29udHJvbCgpO1xuXG5cdFx0XHRcdGlmIChlZGl0b3JDb250cm9sICYmIGlzUmVwbEVkaXRvckNvbnRyb2woZWRpdG9yQ29udHJvbCkpIHtcblx0XHRcdFx0XHRub3RlYm9va0VkaXRvciA9IGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3I7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB2aWV3TW9kZWwgPSBub3RlYm9va0VkaXRvcj8uZ2V0Vmlld01vZGVsKCk7XG5cdFx0aWYgKG5vdGVib29rRWRpdG9yICYmIHZpZXdNb2RlbCkge1xuXHRcdFx0Ly8gbGFzdCBjZWxsIG9mIHRoZSB2aWV3bW9kZWwgaXMgdGhlIGxhc3QgY2VsbCBoaXN0b3J5XG5cdFx0XHRjb25zdCBsYXN0Q2VsbEluZGV4ID0gdmlld01vZGVsLmxlbmd0aCAtIDE7XG5cdFx0XHRpZiAobGFzdENlbGxJbmRleCA+PSAwKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB2aWV3TW9kZWwudmlld0NlbGxzW2xhc3RDZWxsSW5kZXhdO1xuXHRcdFx0XHRub3RlYm9va0VkaXRvci5mb2N1c05vdGVib29rQ2VsbChjZWxsLCAnY29udGFpbmVyJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAncmVwbC5pbnB1dC5mb2N1cycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZXBsLmlucHV0LmZvY3VzJywgJ0ZvY3VzIElucHV0IEVkaXRvcicpLFxuXHRcdFx0Y2F0ZWdvcnk6ICdSRVBMJyxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogTU9TVF9SRUNFTlRfUkVQTF9FRElUT1IsXG5cdFx0XHR9LFxuXHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElTX0NPTVBPU0lURV9OT1RFQk9PSywgTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQpLFxuXHRcdFx0XHR3ZWlnaHQ6IE5PVEVCT09LX0VESVRPUl9XSURHRVRfQUNUSU9OX1dFSUdIVCxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvd1xuXHRcdFx0fSwge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTU9TVF9SRUNFTlRfUkVQTF9FRElUT1IpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDUsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5BbHQgfCBLZXlDb2RlLkhvbWUsIEtleU1vZC5BbHQgfCBLZXlDb2RlLkhvbWUpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvckNvbnRyb2wgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU/LmdldENvbnRyb2woKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0aWYgKGVkaXRvckNvbnRyb2wgJiYgaXNSZXBsRWRpdG9yQ29udHJvbChlZGl0b3JDb250cm9sKSAmJiBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU/LmZvY3VzKCk7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0Y29uc3QgdXJpU3RyaW5nID0gTU9TVF9SRUNFTlRfUkVQTF9FRElUT1IuZ2V0VmFsdWUoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdXJpID0gdXJpU3RyaW5nID8gVVJJLnBhcnNlKHVyaVN0cmluZykgOiB1bmRlZmluZWQ7XG5cblx0XHRcdGlmICghdXJpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlcGxFZGl0b3IgPSBlZGl0b3JTZXJ2aWNlLmZpbmRFZGl0b3JzKHVyaSlbMF07XG5cblx0XHRcdGlmIChyZXBsRWRpdG9yKSB7XG5cdFx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB1cmksIG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogZmFsc2UgfSB9LCByZXBsRWRpdG9yLmdyb3VwSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3JlcGwuZXhlY3V0ZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZXBsLmV4ZWN1dGUnLCAnRXhlY3V0ZSBSRVBMIGlucHV0JyksXG5cdFx0XHRjYXRlZ29yeTogJ1JFUEwnLFxuXHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdElTX0NPTVBPU0lURV9OT1RFQk9PSyxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsICd3b3JrYmVuY2guZWRpdG9yLnJlcGwnKSxcblx0XHRcdFx0XHROT1RFQk9PS19DRUxMX0xJU1RfRk9DVVNFRC5uZWdhdGUoKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdHdlaWdodDogTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hUXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRJU19DT01QT1NJVEVfTk9URUJPT0ssXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCAnd29ya2JlbmNoLmVkaXRvci5yZXBsJyksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuaW50ZXJhY3RpdmVXaW5kb3cuZXhlY3V0ZVdpdGhTaGlmdEVudGVyJywgdHJ1ZSksXG5cdFx0XHRcdFx0Tk9URUJPT0tfQ0VMTF9MSVNUX0ZPQ1VTRUQubmVnYXRlKClcblx0XHRcdFx0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2VpZ2h0OiBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFRcblx0XHRcdH0sIHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdElTX0NPTVBPU0lURV9OT1RFQk9PSyxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsICd3b3JrYmVuY2guZWRpdG9yLnJlcGwnKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5pbnRlcmFjdGl2ZVdpbmRvdy5leGVjdXRlV2l0aFNoaWZ0RW50ZXInLCBmYWxzZSksXG5cdFx0XHRcdFx0Tk9URUJPT0tfQ0VMTF9MSVNUX0ZPQ1VTRUQubmVnYXRlKClcblx0XHRcdFx0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2VpZ2h0OiBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFRcblx0XHRcdH1dLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5SZXBsSW5wdXRFeGVjdXRlXG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRpY29uOiBpY29ucy5leGVjdXRlSWNvbixcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnRXhlY3V0ZSB0aGUgQ29udGVudHMgb2YgdGhlIElucHV0IEJveCcsXG5cdFx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lOiAncmVzb3VyY2UnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdJbnRlcmFjdGl2ZSByZXNvdXJjZSBVcmknLFxuXHRcdFx0XHRcdFx0aXNPcHRpb25hbDogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogVXJpQ29tcG9uZW50cyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGJ1bGtFZGl0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQnVsa0VkaXRTZXJ2aWNlKTtcblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJSW50ZXJhY3RpdmVIaXN0b3J5U2VydmljZSk7XG5cdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RlYm9va0VkaXRvclNlcnZpY2UpO1xuXHRcdGxldCBlZGl0b3JDb250cm9sOiBJRWRpdG9yQ29udHJvbCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoY29udGV4dCkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VVcmkgPSBVUkkucmV2aXZlKGNvbnRleHQpO1xuXHRcdFx0Y29uc3QgZWRpdG9ycyA9IGVkaXRvclNlcnZpY2UuZmluZEVkaXRvcnMocmVzb3VyY2VVcmkpO1xuXHRcdFx0Zm9yIChjb25zdCBmb3VuZCBvZiBlZGl0b3JzKSB7XG5cdFx0XHRcdGlmIChmb3VuZC5lZGl0b3IudHlwZUlkID09PSBSZXBsRWRpdG9ySW5wdXQuSUQpIHtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3IgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoZm91bmQuZWRpdG9yLCBmb3VuZC5ncm91cElkKTtcblx0XHRcdFx0XHRlZGl0b3JDb250cm9sID0gZWRpdG9yPy5nZXRDb250cm9sKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRlZGl0b3JDb250cm9sID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5nZXRDb250cm9sKCkgYXMgeyBub3RlYm9va0VkaXRvcjogTm90ZWJvb2tFZGl0b3JXaWRnZXQgfCB1bmRlZmluZWQ7IGNvZGVFZGl0b3I6IENvZGVFZGl0b3JXaWRnZXQgfSB8IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoaXNSZXBsRWRpdG9yQ29udHJvbChlZGl0b3JDb250cm9sKSkge1xuXHRcdFx0ZXhlY3V0ZVJlcGxJbnB1dChidWxrRWRpdFNlcnZpY2UsIGhpc3RvcnlTZXJ2aWNlLCBub3RlYm9va0VkaXRvclNlcnZpY2UsIGVkaXRvckNvbnRyb2wpO1xuXHRcdH1cblx0fVxufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVSZXBsSW5wdXQoXG5cdGJ1bGtFZGl0U2VydmljZTogSUJ1bGtFZGl0U2VydmljZSxcblx0aGlzdG9yeVNlcnZpY2U6IElJbnRlcmFjdGl2ZUhpc3RvcnlTZXJ2aWNlLFxuXHRub3RlYm9va0VkaXRvclNlcnZpY2U6IElOb3RlYm9va0VkaXRvclNlcnZpY2UsXG5cdGVkaXRvckNvbnRyb2w6IFJlcGxFZGl0b3JDb250cm9sKSB7XG5cblx0aWYgKGVkaXRvckNvbnRyb2wgJiYgZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvciAmJiBlZGl0b3JDb250cm9sLmFjdGl2ZUNvZGVFZGl0b3IpIHtcblx0XHRjb25zdCBub3RlYm9va0RvY3VtZW50ID0gZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWw7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yQ29udHJvbC5hY3RpdmVDb2RlRWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgYWN0aXZlS2VybmVsID0gZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci5hY3RpdmVLZXJuZWw7XG5cdFx0Y29uc3QgbGFuZ3VhZ2UgPSBhY3RpdmVLZXJuZWw/LnN1cHBvcnRlZExhbmd1YWdlc1swXSA/PyBQTEFJTlRFWFRfTEFOR1VBR0VfSUQ7XG5cblx0XHRpZiAobm90ZWJvb2tEb2N1bWVudCAmJiB0ZXh0TW9kZWwpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gbm90ZWJvb2tEb2N1bWVudC5sZW5ndGggLSAxO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSB0ZXh0TW9kZWwuZ2V0VmFsdWUoKTtcblxuXHRcdFx0aWYgKGlzRmFsc3lPcldoaXRlc3BhY2UodmFsdWUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSnVzdCBhY2NlcHQgYW55IGV4aXN0aW5nIGlubGluZSBjaGF0IGh1bmtcblx0XHRcdGNvbnN0IGN0cmwgPSBJbmxpbmVDaGF0Q29udHJvbGxlci5nZXQoZWRpdG9yQ29udHJvbC5hY3RpdmVDb2RlRWRpdG9yKTtcblx0XHRcdGlmIChjdHJsKSB7XG5cdFx0XHRcdGN0cmwuYWNjZXB0U2Vzc2lvbigpO1xuXHRcdFx0fVxuXG5cdFx0XHRoaXN0b3J5U2VydmljZS5yZXBsYWNlTGFzdChub3RlYm9va0RvY3VtZW50LnVyaSwgdmFsdWUpO1xuXHRcdFx0aGlzdG9yeVNlcnZpY2UuYWRkVG9IaXN0b3J5KG5vdGVib29rRG9jdW1lbnQudXJpLCAnJyk7XG5cdFx0XHR0ZXh0TW9kZWwuc2V0VmFsdWUoJycpO1xuXHRcdFx0bm90ZWJvb2tEb2N1bWVudC5jZWxsc1tpbmRleF0ucmVzZXRUZXh0QnVmZmVyKHRleHRNb2RlbC5nZXRUZXh0QnVmZmVyKCkpO1xuXG5cdFx0XHRjb25zdCBjb2xsYXBzZVN0YXRlID0gZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuZ2V0RGlzcGxheU9wdGlvbnMoKS5pbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzID09PSAnZnJvbUVkaXRvcicgP1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aW5wdXRDb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdG91dHB1dENvbGxhcHNlZDogZmFsc2Vcblx0XHRcdFx0fSA6XG5cdFx0XHRcdHVuZGVmaW5lZDtcblxuXHRcdFx0YXdhaXQgYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KFtcblx0XHRcdFx0bmV3IFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdChub3RlYm9va0RvY3VtZW50LnVyaSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0XHRpbmRleDogaW5kZXgsXG5cdFx0XHRcdFx0XHRjb3VudDogMCxcblx0XHRcdFx0XHRcdGNlbGxzOiBbe1xuXHRcdFx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRcdFx0bWltZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRsYW5ndWFnZSxcblx0XHRcdFx0XHRcdFx0c291cmNlOiB2YWx1ZSxcblx0XHRcdFx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdFx0XHRcdG1ldGFkYXRhOiB7fSxcblx0XHRcdFx0XHRcdFx0Y29sbGFwc2VTdGF0ZVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdClcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyByZXZlYWwgdGhlIGNlbGwgaW50byB2aWV3IGZpcnN0XG5cdFx0XHRjb25zdCByYW5nZSA9IHsgc3RhcnQ6IGluZGV4LCBlbmQ6IGluZGV4ICsgMSB9O1xuXHRcdFx0ZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci5yZXZlYWxDZWxsUmFuZ2VJblZpZXcocmFuZ2UpO1xuXHRcdFx0YXdhaXQgZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci5leGVjdXRlTm90ZWJvb2tDZWxscyhlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLmdldENlbGxzSW5SYW5nZSh7IHN0YXJ0OiBpbmRleCwgZW5kOiBpbmRleCArIDEgfSkpO1xuXG5cdFx0XHQvLyB1cGRhdGUgdGhlIHNlbGVjdGlvbiBhbmQgZm9jdXMgaW4gdGhlIGV4dGVuc2lvbiBob3N0IG1vZGVsXG5cdFx0XHRjb25zdCBlZGl0b3IgPSBub3RlYm9va0VkaXRvclNlcnZpY2UuZ2V0Tm90ZWJvb2tFZGl0b3IoZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci5nZXRJZCgpKTtcblx0XHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW3JhbmdlXSk7XG5cdFx0XHRcdGVkaXRvci5zZXRGb2N1cyhyYW5nZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbkFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IFJlcGxFZGl0b3JBY2Nlc3NpYmxlVmlldygpKTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5maW5kLnJlcGxJbnB1dEZvY3VzJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBSRVBMX1ZJRVdfSUQpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUYsXG5cdHNlY29uZGFyeTogW0tleUNvZGUuRjNdLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRnZXRSZXBsVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkpPy5vcGVuRmluZCgpO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsVUFBVSxTQUFTLGNBQWM7QUFDMUMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBZTtBQUN4QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQTBCO0FBQ25DLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxxQkFBcUIsd0JBQXdCO0FBQ3RELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQWlEO0FBQzFELFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFDdkYsU0FBUyx3QkFBbUY7QUFFNUYsU0FBUyx3QkFBd0IsZ0NBQWdDO0FBQ2pFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBRTlCLFNBQW9DLGlDQUFpQztBQUNyRSxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDRDQUE0QztBQUdyRCxZQUFZLFdBQVc7QUFDdkIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw4QkFB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
