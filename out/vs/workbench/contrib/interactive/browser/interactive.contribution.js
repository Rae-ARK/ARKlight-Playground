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
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { parse } from "../../../../base/common/marshalling.js";
import { Schemas } from "../../../../base/common/network.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { IBulkEditService } from "../../../../editor/browser/services/bulkEditService.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { peekViewBorder } from "../../../../editor/contrib/peekView/browser/peekView.js";
import { Context as SuggestContext } from "../../../../editor/contrib/suggest/browser/suggest.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { EditorActivation } from "../../../../platform/editor/common/editor.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { contrastBorder, ifDefinedThenElse, listInactiveSelectionBackground, registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { EditorExtensions, EditorsOrder } from "../../../common/editor.js";
import { PANEL_BORDER } from "../../../common/theme.js";
import { ResourceNotebookCellEdit } from "../../bulkEdit/browser/bulkCellEdits.js";
import { ReplEditorSettings, INTERACTIVE_INPUT_CURSOR_BOUNDARY } from "./interactiveCommon.js";
import { IInteractiveDocumentService, InteractiveDocumentService } from "./interactiveDocumentService.js";
import { InteractiveEditor } from "./interactiveEditor.js";
import { InteractiveEditorInput } from "./interactiveEditorInput.js";
import { IInteractiveHistoryService, InteractiveHistoryService } from "./interactiveHistoryService.js";
import { NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT } from "../../notebook/browser/controller/coreActions.js";
import * as icons from "../../notebook/browser/notebookIcons.js";
import { INotebookEditorService } from "../../notebook/browser/services/notebookEditorService.js";
import { CellEditType, CellKind, CellUri, INTERACTIVE_WINDOW_EDITOR_ID, NotebookSetting, NotebookWorkingCopyTypeIdentifier } from "../../notebook/common/notebookCommon.js";
import { InteractiveWindowOpen, IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED } from "../../notebook/common/notebookContextKeys.js";
import { INotebookKernelService } from "../../notebook/common/notebookKernelService.js";
import { INotebookService } from "../../notebook/common/notebookService.js";
import { columnToEditorGroup } from "../../../services/editor/common/editorGroupColumn.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorResolverService, RegisteredEditorPriority } from "../../../services/editor/common/editorResolverService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IWorkingCopyEditorService } from "../../../services/workingCopy/common/workingCopyEditorService.js";
import { isReplEditorControl } from "../../replNotebook/browser/replEditor.js";
import { InlineChatController } from "../../inlineChat/browser/inlineChatController.js";
import { IsLinuxContext, IsWindowsContext } from "../../../../platform/contextkey/common/contextkeys.js";
const interactiveWindowCategory = localize2("interactiveWindow", "Interactive Window");
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    InteractiveEditor,
    INTERACTIVE_WINDOW_EDITOR_ID,
    "Interactive Window"
  ),
  [
    new SyncDescriptor(InteractiveEditorInput)
  ]
);
let InteractiveDocumentContribution = class extends Disposable {
  constructor(notebookService, editorResolverService, editorService, instantiationService) {
    super();
    this.instantiationService = instantiationService;
    const info = notebookService.getContributedNotebookType("interactive");
    if (!info) {
      this._register(notebookService.registerContributedNotebookType("interactive", {
        providerDisplayName: "Interactive Notebook",
        displayName: "Interactive",
        filenamePattern: ["*.interactive"],
        priority: RegisteredEditorPriority.builtin
      }));
    }
    editorResolverService.registerEditor(
      `${Schemas.vscodeInteractiveInput}:/**`,
      {
        id: "vscode-interactive-input",
        label: "Interactive Editor",
        priority: RegisteredEditorPriority.exclusive
      },
      {
        canSupportResource: (uri) => uri.scheme === Schemas.vscodeInteractiveInput,
        singlePerResource: true
      },
      {
        createEditorInput: ({ resource }) => {
          const editorInput = editorService.findEditors({
            resource,
            editorId: "interactive",
            typeId: InteractiveEditorInput.ID
          }, { order: EditorsOrder.SEQUENTIAL }).at(0);
          return editorInput;
        }
      }
    );
    editorResolverService.registerEditor(
      `*.interactive`,
      {
        id: "interactive",
        label: "Interactive Editor",
        priority: RegisteredEditorPriority.exclusive
      },
      {
        canSupportResource: (uri) => uri.scheme === Schemas.untitled && extname(uri) === ".interactive" || uri.scheme === Schemas.vscodeNotebookCell && extname(uri) === ".interactive",
        singlePerResource: true
      },
      {
        createEditorInput: ({ resource, options }) => {
          const data = CellUri.parse(resource);
          let cellOptions;
          let iwResource = resource;
          if (data) {
            cellOptions = { resource, options };
            iwResource = data.notebook;
          }
          const notebookOptions = {
            ...options,
            cellOptions,
            cellRevealType: void 0,
            cellSelections: void 0,
            isReadOnly: void 0,
            viewState: void 0,
            indexedCellOptions: void 0
          };
          const editorInput = createEditor(iwResource, this.instantiationService);
          return {
            editor: editorInput,
            options: notebookOptions
          };
        },
        createUntitledEditorInput: ({ resource, options }) => {
          if (!resource) {
            throw new Error("Interactive window editors must have a resource name");
          }
          const data = CellUri.parse(resource);
          let cellOptions;
          if (data) {
            cellOptions = { resource, options };
          }
          const notebookOptions = {
            ...options,
            cellOptions,
            cellRevealType: void 0,
            cellSelections: void 0,
            isReadOnly: void 0,
            viewState: void 0,
            indexedCellOptions: void 0
          };
          const editorInput = createEditor(resource, this.instantiationService);
          return {
            editor: editorInput,
            options: notebookOptions
          };
        }
      }
    );
  }
};
InteractiveDocumentContribution.ID = "workbench.contrib.interactiveDocument";
InteractiveDocumentContribution = __decorateClass([
  __decorateParam(0, INotebookService),
  __decorateParam(1, IEditorResolverService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IInstantiationService)
], InteractiveDocumentContribution);
let InteractiveInputContentProvider = class {
  constructor(textModelService, _modelService) {
    this._modelService = _modelService;
    this._registration = textModelService.registerTextModelContentProvider(Schemas.vscodeInteractiveInput, this);
  }
  dispose() {
    this._registration.dispose();
  }
  async provideTextContent(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    const result = this._modelService.createModel("", null, resource, false);
    return result;
  }
};
InteractiveInputContentProvider.ID = "workbench.contrib.interactiveInputContentProvider";
InteractiveInputContentProvider = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService)
], InteractiveInputContentProvider);
function createEditor(resource, instantiationService) {
  const counter = /\/Interactive-(\d+)/.exec(resource.path);
  const inputBoxPath = counter && counter[1] ? `/InteractiveInput-${counter[1]}` : "InteractiveInput";
  const inputUri = URI.from({ scheme: Schemas.vscodeInteractiveInput, path: inputBoxPath });
  const editorInput = InteractiveEditorInput.create(instantiationService, resource, inputUri);
  return editorInput;
}
let InteractiveWindowWorkingCopyEditorHandler = class extends Disposable {
  constructor(_instantiationService, _workingCopyEditorService, _extensionService) {
    super();
    this._instantiationService = _instantiationService;
    this._workingCopyEditorService = _workingCopyEditorService;
    this._extensionService = _extensionService;
    this._installHandler();
  }
  handles(workingCopy) {
    const viewType = this._getViewType(workingCopy);
    return !!viewType && viewType === "interactive";
  }
  isOpen(workingCopy, editor) {
    if (!this.handles(workingCopy)) {
      return false;
    }
    return editor instanceof InteractiveEditorInput && isEqual(workingCopy.resource, editor.resource);
  }
  createEditor(workingCopy) {
    return createEditor(workingCopy.resource, this._instantiationService);
  }
  async _installHandler() {
    await this._extensionService.whenInstalledExtensionsRegistered();
    this._register(this._workingCopyEditorService.registerHandler(this));
  }
  _getViewType(workingCopy) {
    return NotebookWorkingCopyTypeIdentifier.parse(workingCopy.typeId)?.viewType;
  }
};
InteractiveWindowWorkingCopyEditorHandler.ID = "workbench.contrib.interactiveWindowWorkingCopyEditorHandler";
InteractiveWindowWorkingCopyEditorHandler = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IWorkingCopyEditorService),
  __decorateParam(2, IExtensionService)
], InteractiveWindowWorkingCopyEditorHandler);
registerWorkbenchContribution2(InteractiveDocumentContribution.ID, InteractiveDocumentContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(InteractiveInputContentProvider.ID, InteractiveInputContentProvider, {
  editorTypeId: INTERACTIVE_WINDOW_EDITOR_ID
});
registerWorkbenchContribution2(InteractiveWindowWorkingCopyEditorHandler.ID, InteractiveWindowWorkingCopyEditorHandler, {
  editorTypeId: INTERACTIVE_WINDOW_EDITOR_ID
});
class InteractiveEditorSerializer {
  canSerialize(editor) {
    if (!(editor instanceof InteractiveEditorInput)) {
      return false;
    }
    return URI.isUri(editor.primary.resource) && URI.isUri(editor.inputResource);
  }
  serialize(input) {
    if (!this.canSerialize(input)) {
      return void 0;
    }
    return JSON.stringify({
      resource: input.primary.resource,
      inputResource: input.inputResource,
      name: input.getName(),
      language: input.language
    });
  }
  deserialize(instantiationService, raw) {
    const data = parse(raw);
    if (!data) {
      return void 0;
    }
    const { resource, inputResource, name, language } = data;
    if (!URI.isUri(resource) || !URI.isUri(inputResource)) {
      return void 0;
    }
    const input = InteractiveEditorInput.create(instantiationService, resource, inputResource, name, language);
    return input;
  }
}
InteractiveEditorSerializer.ID = InteractiveEditorInput.ID;
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  InteractiveEditorSerializer.ID,
  InteractiveEditorSerializer
);
registerSingleton(IInteractiveHistoryService, InteractiveHistoryService, InstantiationType.Delayed);
registerSingleton(IInteractiveDocumentService, InteractiveDocumentService, InstantiationType.Delayed);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "_interactive.open",
      title: localize2("interactive.open", "Open Interactive Window"),
      f1: false,
      category: interactiveWindowCategory,
      metadata: {
        description: localize("interactive.open", "Open Interactive Window"),
        args: [
          {
            name: "showOptions",
            description: "Show Options",
            schema: {
              type: "object",
              properties: {
                "viewColumn": {
                  type: "number",
                  default: -1
                },
                "preserveFocus": {
                  type: "boolean",
                  default: true
                }
              }
            }
          },
          {
            name: "resource",
            description: "Interactive resource Uri",
            isOptional: true
          },
          {
            name: "controllerId",
            description: "Notebook controller Id",
            isOptional: true
          },
          {
            name: "title",
            description: "Notebook editor title",
            isOptional: true
          }
        ]
      }
    });
  }
  async run(accessor, showOptions, resource, id, title) {
    const editorService = accessor.get(IEditorService);
    const editorGroupService = accessor.get(IEditorGroupsService);
    const historyService = accessor.get(IInteractiveHistoryService);
    const kernelService = accessor.get(INotebookKernelService);
    const logService = accessor.get(ILogService);
    const configurationService = accessor.get(IConfigurationService);
    const group = columnToEditorGroup(editorGroupService, configurationService, typeof showOptions === "number" ? showOptions : showOptions?.viewColumn);
    const editorOptions = {
      activation: EditorActivation.PRESERVE,
      preserveFocus: typeof showOptions !== "number" ? showOptions?.preserveFocus ?? false : false
    };
    if (resource && extname(resource) === ".interactive") {
      logService.debug("Open interactive window from resource:", resource.toString());
      const resourceUri = URI.revive(resource);
      const editors = editorService.findEditors(resourceUri).filter((id2) => id2.editor instanceof InteractiveEditorInput && id2.editor.resource?.toString() === resourceUri.toString());
      if (editors.length) {
        logService.debug("Find existing interactive window:", resource.toString());
        const editorInput2 = editors[0].editor;
        const currentGroup = editors[0].groupId;
        const editor = await editorService.openEditor(editorInput2, editorOptions, currentGroup);
        const editorControl2 = editor?.getControl();
        return {
          notebookUri: editorInput2.resource,
          inputUri: editorInput2.inputResource,
          notebookEditorId: editorControl2?.notebookEditor?.getId()
        };
      }
    }
    const existingNotebookDocument = /* @__PURE__ */ new Set();
    editorService.getEditors(EditorsOrder.SEQUENTIAL).forEach((editor) => {
      if (editor.editor.resource) {
        existingNotebookDocument.add(editor.editor.resource.toString());
      }
    });
    let notebookUri = void 0;
    let inputUri = void 0;
    let counter = 1;
    do {
      notebookUri = URI.from({ scheme: Schemas.untitled, path: `/Interactive-${counter}.interactive` });
      inputUri = URI.from({ scheme: Schemas.vscodeInteractiveInput, path: `/InteractiveInput-${counter}` });
      counter++;
    } while (existingNotebookDocument.has(notebookUri.toString()));
    InteractiveEditorInput.setName(notebookUri, title);
    logService.debug("Open new interactive window:", notebookUri.toString(), inputUri.toString());
    if (id) {
      const allKernels = kernelService.getMatchingKernel({ uri: notebookUri, notebookType: "interactive" }).all;
      const preferredKernel = allKernels.find((kernel) => kernel.id === id);
      if (preferredKernel) {
        kernelService.preselectKernelForNotebook(preferredKernel, { uri: notebookUri, notebookType: "interactive" });
      }
    }
    historyService.clearHistory(notebookUri);
    const editorInput = { resource: notebookUri, options: editorOptions };
    const editorPane = await editorService.openEditor(editorInput, group);
    const editorControl = editorPane?.getControl();
    logService.debug("New interactive window opened. Notebook editor id", editorControl?.notebookEditor?.getId());
    return { notebookUri, inputUri, notebookEditorId: editorControl?.notebookEditor?.getId() };
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.execute",
      title: localize2("interactive.execute", "Execute Code"),
      category: interactiveWindowCategory,
      keybinding: [{
        // when: NOTEBOOK_CELL_LIST_FOCUSED,
        when: ContextKeyExpr.and(
          IS_COMPOSITE_NOTEBOOK,
          ContextKeyExpr.equals("activeEditor", "workbench.editor.interactive")
        ),
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      }, {
        when: ContextKeyExpr.and(
          IS_COMPOSITE_NOTEBOOK,
          ContextKeyExpr.equals("activeEditor", "workbench.editor.interactive"),
          ContextKeyExpr.equals("config.interactiveWindow.executeWithShiftEnter", true)
        ),
        primary: KeyMod.Shift | KeyCode.Enter,
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      }, {
        when: ContextKeyExpr.and(
          IS_COMPOSITE_NOTEBOOK,
          ContextKeyExpr.equals("activeEditor", "workbench.editor.interactive"),
          ContextKeyExpr.equals("config.interactiveWindow.executeWithShiftEnter", false)
        ),
        primary: KeyCode.Enter,
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      }],
      menu: [
        {
          id: MenuId.InteractiveInputExecute
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
        if (found.editor.typeId === InteractiveEditorInput.ID) {
          const editor = await editorService.openEditor(found.editor, found.groupId);
          editorControl = editor?.getControl();
          break;
        }
      }
    } else {
      editorControl = editorService.activeEditorPane?.getControl();
    }
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      const notebookDocument = editorControl.notebookEditor.textModel;
      const textModel = editorControl.activeCodeEditor?.getModel();
      const activeKernel = editorControl.notebookEditor.activeKernel;
      const language = activeKernel?.supportedLanguages[0] ?? PLAINTEXT_LANGUAGE_ID;
      if (notebookDocument && textModel && editorControl.activeCodeEditor) {
        const index = notebookDocument.length;
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
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.input.clear",
      title: localize2("interactive.input.clear", "Clear the interactive window input editor contents"),
      category: interactiveWindowCategory,
      f1: false
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      const notebookDocument = editorControl.notebookEditor.textModel;
      const editor = editorControl.activeCodeEditor;
      const range = editor?.getModel()?.getFullModelRange();
      if (notebookDocument && editor && range) {
        editor.executeEdits("", [EditOperation.replace(range, null)]);
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.history.previous",
      title: localize2("interactive.history.previous", "Previous value in history"),
      category: interactiveWindowCategory,
      f1: false,
      keybinding: {
        when: ContextKeyExpr.and(
          INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo("bottom"),
          INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo("none"),
          SuggestContext.Visible.toNegated()
        ),
        primary: KeyCode.UpArrow,
        weight: KeybindingWeight.WorkbenchContrib
      },
      precondition: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED.negate())
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const historyService = accessor.get(IInteractiveHistoryService);
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      const notebookDocument = editorControl.notebookEditor.textModel;
      const textModel = editorControl.activeCodeEditor?.getModel();
      if (notebookDocument && textModel) {
        const previousValue = historyService.getPreviousValue(notebookDocument.uri);
        if (previousValue) {
          textModel.setValue(previousValue);
        }
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.history.next",
      title: localize2("interactive.history.next", "Next value in history"),
      category: interactiveWindowCategory,
      f1: false,
      keybinding: {
        when: ContextKeyExpr.and(
          INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo("top"),
          INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo("none"),
          SuggestContext.Visible.toNegated()
        ),
        primary: KeyCode.DownArrow,
        weight: KeybindingWeight.WorkbenchContrib
      },
      precondition: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED.negate())
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const historyService = accessor.get(IInteractiveHistoryService);
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      const notebookDocument = editorControl.notebookEditor.textModel;
      const textModel = editorControl.activeCodeEditor?.getModel();
      if (notebookDocument && textModel) {
        const nextValue = historyService.getNextValue(notebookDocument.uri);
        if (nextValue !== null) {
          textModel.setValue(nextValue);
        }
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.scrollToTop",
      title: localize("interactiveScrollToTop", "Scroll to Top"),
      keybinding: {
        when: ContextKeyExpr.equals("activeEditor", "workbench.editor.interactive"),
        primary: KeyMod.CtrlCmd | KeyCode.Home,
        mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow },
        weight: KeybindingWeight.WorkbenchContrib
      },
      category: interactiveWindowCategory
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      if (editorControl.notebookEditor.getLength() === 0) {
        return;
      }
      editorControl.notebookEditor.revealCellRangeInView({ start: 0, end: 1 });
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.scrollToBottom",
      title: localize("interactiveScrollToBottom", "Scroll to Bottom"),
      keybinding: {
        when: ContextKeyExpr.equals("activeEditor", "workbench.editor.interactive"),
        primary: KeyMod.CtrlCmd | KeyCode.End,
        mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow },
        weight: KeybindingWeight.WorkbenchContrib
      },
      category: interactiveWindowCategory
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      if (editorControl.notebookEditor.getLength() === 0) {
        return;
      }
      const len = editorControl.notebookEditor.getLength();
      editorControl.notebookEditor.revealCellRangeInView({ start: len - 1, end: len });
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.input.focus",
      title: localize2("interactive.input.focus", "Focus Input Editor"),
      category: interactiveWindowCategory,
      menu: {
        id: MenuId.CommandPalette,
        when: InteractiveWindowOpen
      }
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      editorService.activeEditorPane?.focus();
    } else {
      const openEditors = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
      const interactiveWindow = Iterable.find(openEditors, (identifier) => {
        return identifier.editor.typeId === InteractiveEditorInput.ID;
      });
      if (interactiveWindow) {
        const editorInput = interactiveWindow.editor;
        const currentGroup = interactiveWindow.groupId;
        const editor = await editorService.openEditor(editorInput, currentGroup);
        const editorControl2 = editor?.getControl();
        if (editorControl2 && isReplEditorControl(editorControl2) && editorControl2.notebookEditor) {
          editorService.activeEditorPane?.focus();
        }
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "interactive.history.focus",
      title: localize2("interactive.history.focus", "Focus History"),
      category: interactiveWindowCategory,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.equals("activeEditor", "workbench.editor.interactive")
      },
      keybinding: [
        {
          // On mac, require that the cursor is at the top of the input, to avoid stealing cmd+up to move the cursor to the top
          when: ContextKeyExpr.and(
            INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo("bottom"),
            INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo("none")
          ),
          weight: KeybindingWeight.WorkbenchContrib + 5,
          primary: KeyMod.CtrlCmd | KeyCode.UpArrow
        },
        {
          when: ContextKeyExpr.or(IsWindowsContext, IsLinuxContext),
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.CtrlCmd | KeyCode.UpArrow
        }
      ],
      precondition: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED.negate())
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
      editorControl.notebookEditor.focus();
    }
  }
});
registerColor("interactive.activeCodeBorder", {
  dark: ifDefinedThenElse(peekViewBorder, peekViewBorder, "#007acc"),
  light: ifDefinedThenElse(peekViewBorder, peekViewBorder, "#007acc"),
  hcDark: contrastBorder,
  hcLight: contrastBorder
}, localize("interactive.activeCodeBorder", "The border color for the current interactive code cell when the editor has focus."));
registerColor("interactive.inactiveCodeBorder", {
  //dark: theme.getColor(listInactiveSelectionBackground) ?? transparent(listInactiveSelectionBackground, 1),
  dark: ifDefinedThenElse(listInactiveSelectionBackground, listInactiveSelectionBackground, "#37373D"),
  light: ifDefinedThenElse(listInactiveSelectionBackground, listInactiveSelectionBackground, "#E4E6F1"),
  hcDark: PANEL_BORDER,
  hcLight: PANEL_BORDER
}, localize("interactive.inactiveCodeBorder", "The border color for the current interactive code cell when the editor does not have focus."));
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "interactiveWindow",
  order: 100,
  type: "object",
  "properties": {
    [ReplEditorSettings.interactiveWindowAlwaysScrollOnNewCell]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("interactiveWindow.alwaysScrollOnNewCell", "Automatically scroll the interactive window to show the output of the last statement executed. If this value is false, the window will only scroll if the last cell was already the one scrolled to.")
    },
    [NotebookSetting.InteractiveWindowPromptToSave]: {
      type: "boolean",
      default: false,
      markdownDescription: localize("interactiveWindow.promptToSaveOnClose", "Prompt to save the interactive window when it is closed. Only new interactive windows will be affected by this setting change.")
    },
    [ReplEditorSettings.executeWithShiftEnter]: {
      type: "boolean",
      default: false,
      markdownDescription: localize("interactiveWindow.executeWithShiftEnter", "Execute the Interactive Window (REPL) input box with shift+enter, so that enter can be used to create a newline."),
      tags: ["replExecute"]
    },
    [ReplEditorSettings.showExecutionHint]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("interactiveWindow.showExecutionHint", "Display a hint in the Interactive Window (REPL) input box to indicate how to execute code."),
      tags: ["replExecute"]
    }
  }
});
export {
  InteractiveDocumentContribution,
  InteractiveEditorSerializer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ludGVyYWN0aXZlL2Jyb3dzZXIvaW50ZXJhY3RpdmUuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGV4dG5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaXNGYWxzeU9yV2hpdGVzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElCdWxrRWRpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBwZWVrVmlld0JvcmRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3BlZWtWaWV3L2Jyb3dzZXIvcGVla1ZpZXcuanMnO1xuaW1wb3J0IHsgQ29udGV4dCBhcyBTdWdnZXN0Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0LmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxvY2FsaXplZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGl2YXRpb24sIElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgY29udHJhc3RCb3JkZXIsIGlmRGVmaW5lZFRoZW5FbHNlLCBsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kLCByZWdpc3RlckNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZURlc2NyaXB0b3IsIElFZGl0b3JQYW5lUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9ucywgRWRpdG9yc09yZGVyLCBJRWRpdG9yQ29udHJvbCwgSUVkaXRvckZhY3RvcnlSZWdpc3RyeSwgSUVkaXRvclNlcmlhbGl6ZXIsIElVbnR5cGVkRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBQQU5FTF9CT1JERVIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0IH0gZnJvbSAnLi4vLi4vYnVsa0VkaXQvYnJvd3Nlci9idWxrQ2VsbEVkaXRzLmpzJztcbmltcG9ydCB7IFJlcGxFZGl0b3JTZXR0aW5ncywgSU5URVJBQ1RJVkVfSU5QVVRfQ1VSU09SX0JPVU5EQVJZIH0gZnJvbSAnLi9pbnRlcmFjdGl2ZUNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJSW50ZXJhY3RpdmVEb2N1bWVudFNlcnZpY2UsIEludGVyYWN0aXZlRG9jdW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi9pbnRlcmFjdGl2ZURvY3VtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbnRlcmFjdGl2ZUVkaXRvciB9IGZyb20gJy4vaW50ZXJhY3RpdmVFZGl0b3IuanMnO1xuaW1wb3J0IHsgSW50ZXJhY3RpdmVFZGl0b3JJbnB1dCB9IGZyb20gJy4vaW50ZXJhY3RpdmVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJSW50ZXJhY3RpdmVIaXN0b3J5U2VydmljZSwgSW50ZXJhY3RpdmVIaXN0b3J5U2VydmljZSB9IGZyb20gJy4vaW50ZXJhY3RpdmVIaXN0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFQgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL2NvbnRyb2xsZXIvY29yZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCAqIGFzIGljb25zIGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tJY29ucy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va0VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRUeXBlLCBDZWxsS2luZCwgQ2VsbFVyaSwgSU5URVJBQ1RJVkVfV0lORE9XX0VESVRPUl9JRCwgTm90ZWJvb2tTZXR0aW5nLCBOb3RlYm9va1dvcmtpbmdDb3B5VHlwZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSW50ZXJhY3RpdmVXaW5kb3dPcGVuLCBJU19DT01QT1NJVEVfTk9URUJPT0ssIE5PVEVCT09LX0VESVRPUl9GT0NVU0VEIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rS2VybmVsU2VydmljZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY29sdW1uVG9FZGl0b3JHcm91cCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBDb2x1bW4uanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclJlc29sdmVyU2VydmljZSwgUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RWRpdG9ySGFuZGxlciwgSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNSZXBsRWRpdG9yQ29udHJvbCwgUmVwbEVkaXRvckNvbnRyb2wgfSBmcm9tICcuLi8uLi9yZXBsTm90ZWJvb2svYnJvd3Nlci9yZXBsRWRpdG9yLmpzJztcbmltcG9ydCB7IElubGluZUNoYXRDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vaW5saW5lQ2hhdC9icm93c2VyL2lubGluZUNoYXRDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElzTGludXhDb250ZXh0LCBJc1dpbmRvd3NDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuXG5jb25zdCBpbnRlcmFjdGl2ZVdpbmRvd0NhdGVnb3J5OiBJTG9jYWxpemVkU3RyaW5nID0gbG9jYWxpemUyKCdpbnRlcmFjdGl2ZVdpbmRvdycsIFwiSW50ZXJhY3RpdmUgV2luZG93XCIpO1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdEludGVyYWN0aXZlRWRpdG9yLFxuXHRcdElOVEVSQUNUSVZFX1dJTkRPV19FRElUT1JfSUQsXG5cdFx0J0ludGVyYWN0aXZlIFdpbmRvdydcblx0KSxcblx0W1xuXHRcdG5ldyBTeW5jRGVzY3JpcHRvcihJbnRlcmFjdGl2ZUVkaXRvcklucHV0KVxuXHRdXG4pO1xuXG5leHBvcnQgY2xhc3MgSW50ZXJhY3RpdmVEb2N1bWVudENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuaW50ZXJhY3RpdmVEb2N1bWVudCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOb3RlYm9va1NlcnZpY2Ugbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIGVkaXRvclJlc29sdmVyU2VydmljZTogSUVkaXRvclJlc29sdmVyU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGluZm8gPSBub3RlYm9va1NlcnZpY2UuZ2V0Q29udHJpYnV0ZWROb3RlYm9va1R5cGUoJ2ludGVyYWN0aXZlJyk7XG5cblx0XHQvLyBXZSBuZWVkIHRvIGNvbnRyaWJ1dGUgYSBub3RlYm9vayB0eXBlIGZvciB0aGUgSW50ZXJhY3RpdmUgV2luZG93IHRvIHByb3ZpZGUgbm90ZWJvb2sgbW9kZWxzLlxuXHRcdGlmICghaW5mbykge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobm90ZWJvb2tTZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0ZWROb3RlYm9va1R5cGUoJ2ludGVyYWN0aXZlJywge1xuXHRcdFx0XHRwcm92aWRlckRpc3BsYXlOYW1lOiAnSW50ZXJhY3RpdmUgTm90ZWJvb2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0ludGVyYWN0aXZlJyxcblx0XHRcdFx0ZmlsZW5hbWVQYXR0ZXJuOiBbJyouaW50ZXJhY3RpdmUnXSxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5idWlsdGluXG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0ZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKFxuXHRcdFx0YCR7U2NoZW1hcy52c2NvZGVJbnRlcmFjdGl2ZUlucHV0fTovKipgLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3ZzY29kZS1pbnRlcmFjdGl2ZS1pbnB1dCcsXG5cdFx0XHRcdGxhYmVsOiAnSW50ZXJhY3RpdmUgRWRpdG9yJyxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leGNsdXNpdmVcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGNhblN1cHBvcnRSZXNvdXJjZTogdXJpID0+IHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlSW50ZXJhY3RpdmVJbnB1dCxcblx0XHRcdFx0c2luZ2xlUGVyUmVzb3VyY2U6IHRydWVcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoeyByZXNvdXJjZSB9KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9ySW5wdXQgPSBlZGl0b3JTZXJ2aWNlLmZpbmRFZGl0b3JzKHtcblx0XHRcdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRcdFx0ZWRpdG9ySWQ6ICdpbnRlcmFjdGl2ZScsXG5cdFx0XHRcdFx0XHR0eXBlSWQ6IEludGVyYWN0aXZlRWRpdG9ySW5wdXQuSURcblx0XHRcdFx0XHR9LCB7IG9yZGVyOiBFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCB9KS5hdCgwKTtcblx0XHRcdFx0XHRyZXR1cm4gZWRpdG9ySW5wdXQhO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGVkaXRvclJlc29sdmVyU2VydmljZS5yZWdpc3RlckVkaXRvcihcblx0XHRcdGAqLmludGVyYWN0aXZlYCxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdpbnRlcmFjdGl2ZScsXG5cdFx0XHRcdGxhYmVsOiAnSW50ZXJhY3RpdmUgRWRpdG9yJyxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leGNsdXNpdmVcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGNhblN1cHBvcnRSZXNvdXJjZTogdXJpID0+XG5cdFx0XHRcdFx0KHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQgJiYgZXh0bmFtZSh1cmkpID09PSAnLmludGVyYWN0aXZlJykgfHxcblx0XHRcdFx0XHQodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwgJiYgZXh0bmFtZSh1cmkpID09PSAnLmludGVyYWN0aXZlJyksXG5cdFx0XHRcdHNpbmdsZVBlclJlc291cmNlOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSBDZWxsVXJpLnBhcnNlKHJlc291cmNlKTtcblx0XHRcdFx0XHRsZXQgY2VsbE9wdGlvbnM6IElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRsZXQgaXdSZXNvdXJjZSA9IHJlc291cmNlO1xuXG5cdFx0XHRcdFx0aWYgKGRhdGEpIHtcblx0XHRcdFx0XHRcdGNlbGxPcHRpb25zID0geyByZXNvdXJjZSwgb3B0aW9ucyB9O1xuXHRcdFx0XHRcdFx0aXdSZXNvdXJjZSA9IGRhdGEubm90ZWJvb2s7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tPcHRpb25zOiBJTm90ZWJvb2tFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkID0ge1xuXHRcdFx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0XHRcdGNlbGxPcHRpb25zLFxuXHRcdFx0XHRcdFx0Y2VsbFJldmVhbFR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGNlbGxTZWxlY3Rpb25zOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRpc1JlYWRPbmx5OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR2aWV3U3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGluZGV4ZWRDZWxsT3B0aW9uczogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdGNvbnN0IGVkaXRvcklucHV0ID0gY3JlYXRlRWRpdG9yKGl3UmVzb3VyY2UsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRlZGl0b3I6IGVkaXRvcklucHV0LFxuXHRcdFx0XHRcdFx0b3B0aW9uczogbm90ZWJvb2tPcHRpb25zXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3JlYXRlVW50aXRsZWRFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSkgPT4ge1xuXHRcdFx0XHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW50ZXJhY3RpdmUgd2luZG93IGVkaXRvcnMgbXVzdCBoYXZlIGEgcmVzb3VyY2UgbmFtZScpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBkYXRhID0gQ2VsbFVyaS5wYXJzZShyZXNvdXJjZSk7XG5cdFx0XHRcdFx0bGV0IGNlbGxPcHRpb25zOiBJVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cblx0XHRcdFx0XHRpZiAoZGF0YSkge1xuXHRcdFx0XHRcdFx0Y2VsbE9wdGlvbnMgPSB7IHJlc291cmNlLCBvcHRpb25zIH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tPcHRpb25zOiBJTm90ZWJvb2tFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0XHRcdGNlbGxPcHRpb25zLFxuXHRcdFx0XHRcdFx0Y2VsbFJldmVhbFR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGNlbGxTZWxlY3Rpb25zOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRpc1JlYWRPbmx5OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR2aWV3U3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGluZGV4ZWRDZWxsT3B0aW9uczogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdGNvbnN0IGVkaXRvcklucHV0ID0gY3JlYXRlRWRpdG9yKHJlc291cmNlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZWRpdG9yOiBlZGl0b3JJbnB1dCxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IG5vdGVib29rT3B0aW9uc1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG59XG5cbmNsYXNzIEludGVyYWN0aXZlSW5wdXRDb250ZW50UHJvdmlkZXIgaW1wbGVtZW50cyBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuaW50ZXJhY3RpdmVJbnB1dENvbnRlbnRQcm92aWRlcic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0cmF0aW9uOiBJRGlzcG9zYWJsZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb24gPSB0ZXh0TW9kZWxTZXJ2aWNlLnJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKFNjaGVtYXMudnNjb2RlSW50ZXJhY3RpdmVJbnB1dCwgdGhpcyk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlVGV4dENvbnRlbnQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVRleHRNb2RlbCB8IG51bGw+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogSVRleHRNb2RlbCB8IG51bGwgPSB0aGlzLl9tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJycsIG51bGwsIHJlc291cmNlLCBmYWxzZSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVFZGl0b3IocmVzb3VyY2U6IFVSSSwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IEVkaXRvcklucHV0IHtcblx0Y29uc3QgY291bnRlciA9IC9cXC9JbnRlcmFjdGl2ZS0oXFxkKykvLmV4ZWMocmVzb3VyY2UucGF0aCk7XG5cdGNvbnN0IGlucHV0Qm94UGF0aCA9IGNvdW50ZXIgJiYgY291bnRlclsxXSA/IGAvSW50ZXJhY3RpdmVJbnB1dC0ke2NvdW50ZXJbMV19YCA6ICdJbnRlcmFjdGl2ZUlucHV0Jztcblx0Y29uc3QgaW5wdXRVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVJbnRlcmFjdGl2ZUlucHV0LCBwYXRoOiBpbnB1dEJveFBhdGggfSk7XG5cdGNvbnN0IGVkaXRvcklucHV0ID0gSW50ZXJhY3RpdmVFZGl0b3JJbnB1dC5jcmVhdGUoaW5zdGFudGlhdGlvblNlcnZpY2UsIHJlc291cmNlLCBpbnB1dFVyaSk7XG5cblx0cmV0dXJuIGVkaXRvcklucHV0O1xufVxuXG5jbGFzcyBJbnRlcmFjdGl2ZVdpbmRvd1dvcmtpbmdDb3B5RWRpdG9ySGFuZGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJV29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuaW50ZXJhY3RpdmVXaW5kb3dXb3JraW5nQ29weUVkaXRvckhhbmRsZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3JraW5nQ29weUVkaXRvclNlcnZpY2U6IElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5faW5zdGFsbEhhbmRsZXIoKTtcblx0fVxuXG5cdGhhbmRsZXMod29ya2luZ0NvcHk6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCB2aWV3VHlwZSA9IHRoaXMuX2dldFZpZXdUeXBlKHdvcmtpbmdDb3B5KTtcblx0XHRyZXR1cm4gISF2aWV3VHlwZSAmJiB2aWV3VHlwZSA9PT0gJ2ludGVyYWN0aXZlJztcblxuXHR9XG5cblx0aXNPcGVuKHdvcmtpbmdDb3B5OiBJV29ya2luZ0NvcHlJZGVudGlmaWVyLCBlZGl0b3I6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmhhbmRsZXMod29ya2luZ0NvcHkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXRvciBpbnN0YW5jZW9mIEludGVyYWN0aXZlRWRpdG9ySW5wdXQgJiYgaXNFcXVhbCh3b3JraW5nQ29weS5yZXNvdXJjZSwgZWRpdG9yLnJlc291cmNlKTtcblx0fVxuXG5cdGNyZWF0ZUVkaXRvcih3b3JraW5nQ29weTogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IEVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4gY3JlYXRlRWRpdG9yKHdvcmtpbmdDb3B5LnJlc291cmNlLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbnN0YWxsSGFuZGxlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVySGFuZGxlcih0aGlzKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRWaWV3VHlwZSh3b3JraW5nQ29weTogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIE5vdGVib29rV29ya2luZ0NvcHlUeXBlSWRlbnRpZmllci5wYXJzZSh3b3JraW5nQ29weS50eXBlSWQpPy52aWV3VHlwZTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoSW50ZXJhY3RpdmVEb2N1bWVudENvbnRyaWJ1dGlvbi5JRCwgSW50ZXJhY3RpdmVEb2N1bWVudENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihJbnRlcmFjdGl2ZUlucHV0Q29udGVudFByb3ZpZGVyLklELCBJbnRlcmFjdGl2ZUlucHV0Q29udGVudFByb3ZpZGVyLCB7XG5cdGVkaXRvclR5cGVJZDogSU5URVJBQ1RJVkVfV0lORE9XX0VESVRPUl9JRFxufSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoSW50ZXJhY3RpdmVXaW5kb3dXb3JraW5nQ29weUVkaXRvckhhbmRsZXIuSUQsIEludGVyYWN0aXZlV2luZG93V29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyLCB7XG5cdGVkaXRvclR5cGVJZDogSU5URVJBQ1RJVkVfV0lORE9XX0VESVRPUl9JRFxufSk7XG5cbnR5cGUgaW50ZXJhY3RpdmVFZGl0b3JJbnB1dERhdGEgPSB7IHJlc291cmNlOiBVUkk7IGlucHV0UmVzb3VyY2U6IFVSSTsgbmFtZTogc3RyaW5nOyBsYW5ndWFnZTogc3RyaW5nIH07XG5cbmV4cG9ydCBjbGFzcyBJbnRlcmFjdGl2ZUVkaXRvclNlcmlhbGl6ZXIgaW1wbGVtZW50cyBJRWRpdG9yU2VyaWFsaXplciB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSBJbnRlcmFjdGl2ZUVkaXRvcklucHV0LklEO1xuXG5cdGNhblNlcmlhbGl6ZShlZGl0b3I6IEVkaXRvcklucHV0KTogZWRpdG9yIGlzIEludGVyYWN0aXZlRWRpdG9ySW5wdXQge1xuXHRcdGlmICghKGVkaXRvciBpbnN0YW5jZW9mIEludGVyYWN0aXZlRWRpdG9ySW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFVSSS5pc1VyaShlZGl0b3IucHJpbWFyeS5yZXNvdXJjZSkgJiYgVVJJLmlzVXJpKGVkaXRvci5pbnB1dFJlc291cmNlKTtcblx0fVxuXG5cdHNlcmlhbGl6ZShpbnB1dDogRWRpdG9ySW5wdXQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5jYW5TZXJpYWxpemUoaW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRyZXNvdXJjZTogaW5wdXQucHJpbWFyeS5yZXNvdXJjZSxcblx0XHRcdGlucHV0UmVzb3VyY2U6IGlucHV0LmlucHV0UmVzb3VyY2UsXG5cdFx0XHRuYW1lOiBpbnB1dC5nZXROYW1lKCksXG5cdFx0XHRsYW5ndWFnZTogaW5wdXQubGFuZ3VhZ2Vcblx0XHR9KTtcblx0fVxuXG5cdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHJhdzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgZGF0YSA9IDxpbnRlcmFjdGl2ZUVkaXRvcklucHV0RGF0YT5wYXJzZShyYXcpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgeyByZXNvdXJjZSwgaW5wdXRSZXNvdXJjZSwgbmFtZSwgbGFuZ3VhZ2UgfSA9IGRhdGE7XG5cdFx0aWYgKCFVUkkuaXNVcmkocmVzb3VyY2UpIHx8ICFVUkkuaXNVcmkoaW5wdXRSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5wdXQgPSBJbnRlcmFjdGl2ZUVkaXRvcklucHV0LmNyZWF0ZShpbnN0YW50aWF0aW9uU2VydmljZSwgcmVzb3VyY2UsIGlucHV0UmVzb3VyY2UsIG5hbWUsIGxhbmd1YWdlKTtcblx0XHRyZXR1cm4gaW5wdXQ7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KVxuXHQucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKFxuXHRcdEludGVyYWN0aXZlRWRpdG9yU2VyaWFsaXplci5JRCxcblx0XHRJbnRlcmFjdGl2ZUVkaXRvclNlcmlhbGl6ZXIpO1xuXG5yZWdpc3RlclNpbmdsZXRvbihJSW50ZXJhY3RpdmVIaXN0b3J5U2VydmljZSwgSW50ZXJhY3RpdmVIaXN0b3J5U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJSW50ZXJhY3RpdmVEb2N1bWVudFNlcnZpY2UsIEludGVyYWN0aXZlRG9jdW1lbnRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnX2ludGVyYWN0aXZlLm9wZW4nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUub3BlbicsICdPcGVuIEludGVyYWN0aXZlIFdpbmRvdycpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0Y2F0ZWdvcnk6IGludGVyYWN0aXZlV2luZG93Q2F0ZWdvcnksXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ludGVyYWN0aXZlLm9wZW4nLCAnT3BlbiBJbnRlcmFjdGl2ZSBXaW5kb3cnKSxcblx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6ICdzaG93T3B0aW9ucycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Nob3cgT3B0aW9ucycsXG5cdFx0XHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHQndmlld0NvbHVtbic6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogLTFcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdCdwcmVzZXJ2ZUZvY3VzJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6ICdyZXNvdXJjZScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0ludGVyYWN0aXZlIHJlc291cmNlIFVyaScsXG5cdFx0XHRcdFx0XHRpc09wdGlvbmFsOiB0cnVlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lOiAnY29udHJvbGxlcklkJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnTm90ZWJvb2sgY29udHJvbGxlciBJZCcsXG5cdFx0XHRcdFx0XHRpc09wdGlvbmFsOiB0cnVlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lOiAndGl0bGUnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdOb3RlYm9vayBlZGl0b3IgdGl0bGUnLFxuXHRcdFx0XHRcdFx0aXNPcHRpb25hbDogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNob3dPcHRpb25zPzogbnVtYmVyIHwgeyB2aWV3Q29sdW1uPzogbnVtYmVyOyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiB9LCByZXNvdXJjZT86IFVSSSwgaWQ/OiBzdHJpbmcsIHRpdGxlPzogc3RyaW5nKTogUHJvbWlzZTx7IG5vdGVib29rVXJpOiBVUkk7IGlucHV0VXJpOiBVUkk7IG5vdGVib29rRWRpdG9ySWQ/OiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUludGVyYWN0aXZlSGlzdG9yeVNlcnZpY2UpO1xuXHRcdGNvbnN0IGtlcm5lbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGVib29rS2VybmVsU2VydmljZSk7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBncm91cCA9IGNvbHVtblRvRWRpdG9yR3JvdXAoZWRpdG9yR3JvdXBTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgdHlwZW9mIHNob3dPcHRpb25zID09PSAnbnVtYmVyJyA/IHNob3dPcHRpb25zIDogc2hvd09wdGlvbnM/LnZpZXdDb2x1bW4pO1xuXHRcdGNvbnN0IGVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHRhY3RpdmF0aW9uOiBFZGl0b3JBY3RpdmF0aW9uLlBSRVNFUlZFLFxuXHRcdFx0cHJlc2VydmVGb2N1czogdHlwZW9mIHNob3dPcHRpb25zICE9PSAnbnVtYmVyJyA/IChzaG93T3B0aW9ucz8ucHJlc2VydmVGb2N1cyA/PyBmYWxzZSkgOiBmYWxzZVxuXHRcdH07XG5cblx0XHRpZiAocmVzb3VyY2UgJiYgZXh0bmFtZShyZXNvdXJjZSkgPT09ICcuaW50ZXJhY3RpdmUnKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLmRlYnVnKCdPcGVuIGludGVyYWN0aXZlIHdpbmRvdyBmcm9tIHJlc291cmNlOicsIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VVcmkgPSBVUkkucmV2aXZlKHJlc291cmNlKTtcblx0XHRcdGNvbnN0IGVkaXRvcnMgPSBlZGl0b3JTZXJ2aWNlLmZpbmRFZGl0b3JzKHJlc291cmNlVXJpKS5maWx0ZXIoaWQgPT4gaWQuZWRpdG9yIGluc3RhbmNlb2YgSW50ZXJhY3RpdmVFZGl0b3JJbnB1dCAmJiBpZC5lZGl0b3IucmVzb3VyY2U/LnRvU3RyaW5nKCkgPT09IHJlc291cmNlVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKGVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2UuZGVidWcoJ0ZpbmQgZXhpc3RpbmcgaW50ZXJhY3RpdmUgd2luZG93OicsIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRjb25zdCBlZGl0b3JJbnB1dCA9IGVkaXRvcnNbMF0uZWRpdG9yIGFzIEludGVyYWN0aXZlRWRpdG9ySW5wdXQ7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRHcm91cCA9IGVkaXRvcnNbMF0uZ3JvdXBJZDtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGVkaXRvcklucHV0LCBlZGl0b3JPcHRpb25zLCBjdXJyZW50R3JvdXApO1xuXHRcdFx0XHRjb25zdCBlZGl0b3JDb250cm9sID0gZWRpdG9yPy5nZXRDb250cm9sKCkgYXMgUmVwbEVkaXRvckNvbnRyb2w7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRub3RlYm9va1VyaTogZWRpdG9ySW5wdXQucmVzb3VyY2UsXG5cdFx0XHRcdFx0aW5wdXRVcmk6IGVkaXRvcklucHV0LmlucHV0UmVzb3VyY2UsXG5cdFx0XHRcdFx0bm90ZWJvb2tFZGl0b3JJZDogZWRpdG9yQ29udHJvbD8ubm90ZWJvb2tFZGl0b3I/LmdldElkKClcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBleGlzdGluZ05vdGVib29rRG9jdW1lbnQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRlZGl0b3JTZXJ2aWNlLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpLmZvckVhY2goZWRpdG9yID0+IHtcblx0XHRcdGlmIChlZGl0b3IuZWRpdG9yLnJlc291cmNlKSB7XG5cdFx0XHRcdGV4aXN0aW5nTm90ZWJvb2tEb2N1bWVudC5hZGQoZWRpdG9yLmVkaXRvci5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGxldCBub3RlYm9va1VyaTogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBpbnB1dFVyaTogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBjb3VudGVyID0gMTtcblx0XHRkbyB7XG5cdFx0XHRub3RlYm9va1VyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkLCBwYXRoOiBgL0ludGVyYWN0aXZlLSR7Y291bnRlcn0uaW50ZXJhY3RpdmVgIH0pO1xuXHRcdFx0aW5wdXRVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVJbnRlcmFjdGl2ZUlucHV0LCBwYXRoOiBgL0ludGVyYWN0aXZlSW5wdXQtJHtjb3VudGVyfWAgfSk7XG5cblx0XHRcdGNvdW50ZXIrKztcblx0XHR9IHdoaWxlIChleGlzdGluZ05vdGVib29rRG9jdW1lbnQuaGFzKG5vdGVib29rVXJpLnRvU3RyaW5nKCkpKTtcblx0XHRJbnRlcmFjdGl2ZUVkaXRvcklucHV0LnNldE5hbWUobm90ZWJvb2tVcmksIHRpdGxlKTtcblxuXHRcdGxvZ1NlcnZpY2UuZGVidWcoJ09wZW4gbmV3IGludGVyYWN0aXZlIHdpbmRvdzonLCBub3RlYm9va1VyaS50b1N0cmluZygpLCBpbnB1dFVyaS50b1N0cmluZygpKTtcblxuXHRcdGlmIChpZCkge1xuXHRcdFx0Y29uc3QgYWxsS2VybmVscyA9IGtlcm5lbFNlcnZpY2UuZ2V0TWF0Y2hpbmdLZXJuZWwoeyB1cmk6IG5vdGVib29rVXJpLCBub3RlYm9va1R5cGU6ICdpbnRlcmFjdGl2ZScgfSkuYWxsO1xuXHRcdFx0Y29uc3QgcHJlZmVycmVkS2VybmVsID0gYWxsS2VybmVscy5maW5kKGtlcm5lbCA9PiBrZXJuZWwuaWQgPT09IGlkKTtcblx0XHRcdGlmIChwcmVmZXJyZWRLZXJuZWwpIHtcblx0XHRcdFx0a2VybmVsU2VydmljZS5wcmVzZWxlY3RLZXJuZWxGb3JOb3RlYm9vayhwcmVmZXJyZWRLZXJuZWwsIHsgdXJpOiBub3RlYm9va1VyaSwgbm90ZWJvb2tUeXBlOiAnaW50ZXJhY3RpdmUnIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGhpc3RvcnlTZXJ2aWNlLmNsZWFySGlzdG9yeShub3RlYm9va1VyaSk7XG5cdFx0Y29uc3QgZWRpdG9ySW5wdXQ6IElVbnR5cGVkRWRpdG9ySW5wdXQgPSB7IHJlc291cmNlOiBub3RlYm9va1VyaSwgb3B0aW9uczogZWRpdG9yT3B0aW9ucyB9O1xuXHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoZWRpdG9ySW5wdXQsIGdyb3VwKTtcblx0XHRjb25zdCBlZGl0b3JDb250cm9sID0gZWRpdG9yUGFuZT8uZ2V0Q29udHJvbCgpIGFzIFJlcGxFZGl0b3JDb250cm9sO1xuXHRcdC8vIEV4dGVuc2lvbnMgbXVzdCByZXRhaW4gcmVmZXJlbmNlcyB0byB0aGVzZSBVUklzIHRvIG1hbmlwdWxhdGUgdGhlIGludGVyYWN0aXZlIGVkaXRvclxuXHRcdGxvZ1NlcnZpY2UuZGVidWcoJ05ldyBpbnRlcmFjdGl2ZSB3aW5kb3cgb3BlbmVkLiBOb3RlYm9vayBlZGl0b3IgaWQnLCBlZGl0b3JDb250cm9sPy5ub3RlYm9va0VkaXRvcj8uZ2V0SWQoKSk7XG5cdFx0cmV0dXJuIHsgbm90ZWJvb2tVcmksIGlucHV0VXJpLCBub3RlYm9va0VkaXRvcklkOiBlZGl0b3JDb250cm9sPy5ub3RlYm9va0VkaXRvcj8uZ2V0SWQoKSB9O1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnaW50ZXJhY3RpdmUuZXhlY3V0ZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5leGVjdXRlJywgJ0V4ZWN1dGUgQ29kZScpLFxuXHRcdFx0Y2F0ZWdvcnk6IGludGVyYWN0aXZlV2luZG93Q2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHQvLyB3aGVuOiBOT1RFQk9PS19DRUxMX0xJU1RfRk9DVVNFRCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdElTX0NPTVBPU0lURV9OT1RFQk9PSyxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsICd3b3JrYmVuY2guZWRpdG9yLmludGVyYWN0aXZlJylcblx0XHRcdFx0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHR3ZWlnaHQ6IE5PVEVCT09LX0VESVRPUl9XSURHRVRfQUNUSU9OX1dFSUdIVFxuXHRcdFx0fSwge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0SVNfQ09NUE9TSVRFX05PVEVCT09LLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgJ3dvcmtiZW5jaC5lZGl0b3IuaW50ZXJhY3RpdmUnKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5pbnRlcmFjdGl2ZVdpbmRvdy5leGVjdXRlV2l0aFNoaWZ0RW50ZXInLCB0cnVlKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHR3ZWlnaHQ6IE5PVEVCT09LX0VESVRPUl9XSURHRVRfQUNUSU9OX1dFSUdIVFxuXHRcdFx0fSwge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0SVNfQ09NUE9TSVRFX05PVEVCT09LLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgJ3dvcmtiZW5jaC5lZGl0b3IuaW50ZXJhY3RpdmUnKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5pbnRlcmFjdGl2ZVdpbmRvdy5leGVjdXRlV2l0aFNoaWZ0RW50ZXInLCBmYWxzZSlcblx0XHRcdFx0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2VpZ2h0OiBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFRcblx0XHRcdH1dLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5JbnRlcmFjdGl2ZUlucHV0RXhlY3V0ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHRcdGljb246IGljb25zLmV4ZWN1dGVJY29uLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdFeGVjdXRlIHRoZSBDb250ZW50cyBvZiB0aGUgSW5wdXQgQm94Jyxcblx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6ICdyZXNvdXJjZScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0ludGVyYWN0aXZlIHJlc291cmNlIFVyaScsXG5cdFx0XHRcdFx0XHRpc09wdGlvbmFsOiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBVcmlDb21wb25lbnRzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgYnVsa0VkaXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElCdWxrRWRpdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnRlcmFjdGl2ZUhpc3RvcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RlYm9va0VkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGVib29rRWRpdG9yU2VydmljZSk7XG5cdFx0bGV0IGVkaXRvckNvbnRyb2w6IElFZGl0b3JDb250cm9sIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChjb250ZXh0KSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZVVyaSA9IFVSSS5yZXZpdmUoY29udGV4dCk7XG5cdFx0XHRjb25zdCBlZGl0b3JzID0gZWRpdG9yU2VydmljZS5maW5kRWRpdG9ycyhyZXNvdXJjZVVyaSk7XG5cdFx0XHRmb3IgKGNvbnN0IGZvdW5kIG9mIGVkaXRvcnMpIHtcblx0XHRcdFx0aWYgKGZvdW5kLmVkaXRvci50eXBlSWQgPT09IEludGVyYWN0aXZlRWRpdG9ySW5wdXQuSUQpIHtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3IgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoZm91bmQuZWRpdG9yLCBmb3VuZC5ncm91cElkKTtcblx0XHRcdFx0XHRlZGl0b3JDb250cm9sID0gZWRpdG9yPy5nZXRDb250cm9sKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRlZGl0b3JDb250cm9sID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5nZXRDb250cm9sKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvckNvbnRyb2wgJiYgaXNSZXBsRWRpdG9yQ29udHJvbChlZGl0b3JDb250cm9sKSAmJiBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRjb25zdCBub3RlYm9va0RvY3VtZW50ID0gZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSBlZGl0b3JDb250cm9sLmFjdGl2ZUNvZGVFZGl0b3I/LmdldE1vZGVsKCk7XG5cdFx0XHRjb25zdCBhY3RpdmVLZXJuZWwgPSBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLmFjdGl2ZUtlcm5lbDtcblx0XHRcdGNvbnN0IGxhbmd1YWdlID0gYWN0aXZlS2VybmVsPy5zdXBwb3J0ZWRMYW5ndWFnZXNbMF0gPz8gUExBSU5URVhUX0xBTkdVQUdFX0lEO1xuXG5cdFx0XHRpZiAobm90ZWJvb2tEb2N1bWVudCAmJiB0ZXh0TW9kZWwgJiYgZWRpdG9yQ29udHJvbC5hY3RpdmVDb2RlRWRpdG9yKSB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gbm90ZWJvb2tEb2N1bWVudC5sZW5ndGg7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gdGV4dE1vZGVsLmdldFZhbHVlKCk7XG5cblx0XHRcdFx0aWYgKGlzRmFsc3lPcldoaXRlc3BhY2UodmFsdWUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY3RybCA9IElubGluZUNoYXRDb250cm9sbGVyLmdldChlZGl0b3JDb250cm9sLmFjdGl2ZUNvZGVFZGl0b3IpO1xuXHRcdFx0XHRpZiAoY3RybCkge1xuXHRcdFx0XHRcdGN0cmwuYWNjZXB0U2Vzc2lvbigpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aGlzdG9yeVNlcnZpY2UucmVwbGFjZUxhc3Qobm90ZWJvb2tEb2N1bWVudC51cmksIHZhbHVlKTtcblx0XHRcdFx0aGlzdG9yeVNlcnZpY2UuYWRkVG9IaXN0b3J5KG5vdGVib29rRG9jdW1lbnQudXJpLCAnJyk7XG5cdFx0XHRcdHRleHRNb2RlbC5zZXRWYWx1ZSgnJyk7XG5cblx0XHRcdFx0Y29uc3QgY29sbGFwc2VTdGF0ZSA9IGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLmdldERpc3BsYXlPcHRpb25zKCkuaW50ZXJhY3RpdmVXaW5kb3dDb2xsYXBzZUNvZGVDZWxscyA9PT0gJ2Zyb21FZGl0b3InID9cblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpbnB1dENvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRvdXRwdXRDb2xsYXBzZWQ6IGZhbHNlXG5cdFx0XHRcdFx0fSA6XG5cdFx0XHRcdFx0dW5kZWZpbmVkO1xuXG5cdFx0XHRcdGF3YWl0IGJ1bGtFZGl0U2VydmljZS5hcHBseShbXG5cdFx0XHRcdFx0bmV3IFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdChub3RlYm9va0RvY3VtZW50LnVyaSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdFx0XHRpbmRleDogaW5kZXgsXG5cdFx0XHRcdFx0XHRcdGNvdW50OiAwLFxuXHRcdFx0XHRcdFx0XHRjZWxsczogW3tcblx0XHRcdFx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRcdFx0XHRtaW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0bGFuZ3VhZ2UsXG5cdFx0XHRcdFx0XHRcdFx0c291cmNlOiB2YWx1ZSxcblx0XHRcdFx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0XHRcdFx0XHRtZXRhZGF0YToge30sXG5cdFx0XHRcdFx0XHRcdFx0Y29sbGFwc2VTdGF0ZVxuXHRcdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdClcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0Ly8gcmV2ZWFsIHRoZSBjZWxsIGludG8gdmlldyBmaXJzdFxuXHRcdFx0XHRjb25zdCByYW5nZSA9IHsgc3RhcnQ6IGluZGV4LCBlbmQ6IGluZGV4ICsgMSB9O1xuXHRcdFx0XHRlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLnJldmVhbENlbGxSYW5nZUluVmlldyhyYW5nZSk7XG5cdFx0XHRcdGF3YWl0IGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IuZXhlY3V0ZU5vdGVib29rQ2VsbHMoZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci5nZXRDZWxsc0luUmFuZ2UoeyBzdGFydDogaW5kZXgsIGVuZDogaW5kZXggKyAxIH0pKTtcblxuXHRcdFx0XHQvLyB1cGRhdGUgdGhlIHNlbGVjdGlvbiBhbmQgZm9jdXMgaW4gdGhlIGV4dGVuc2lvbiBob3N0IG1vZGVsXG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IG5vdGVib29rRWRpdG9yU2VydmljZS5nZXROb3RlYm9va0VkaXRvcihlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLmdldElkKCkpO1xuXHRcdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW3JhbmdlXSk7XG5cdFx0XHRcdFx0ZWRpdG9yLnNldEZvY3VzKHJhbmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2ludGVyYWN0aXZlLmlucHV0LmNsZWFyJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLmlucHV0LmNsZWFyJywgJ0NsZWFyIHRoZSBpbnRlcmFjdGl2ZSB3aW5kb3cgaW5wdXQgZWRpdG9yIGNvbnRlbnRzJyksXG5cdFx0XHRjYXRlZ29yeTogaW50ZXJhY3RpdmVXaW5kb3dDYXRlZ29yeSxcblx0XHRcdGYxOiBmYWxzZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yQ29udHJvbCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0Q29udHJvbCgpO1xuXG5cdFx0aWYgKGVkaXRvckNvbnRyb2wgJiYgaXNSZXBsRWRpdG9yQ29udHJvbChlZGl0b3JDb250cm9sKSAmJiBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRjb25zdCBub3RlYm9va0RvY3VtZW50ID0gZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSBlZGl0b3JDb250cm9sLmFjdGl2ZUNvZGVFZGl0b3I7XG5cdFx0XHRjb25zdCByYW5nZSA9IGVkaXRvcj8uZ2V0TW9kZWwoKT8uZ2V0RnVsbE1vZGVsUmFuZ2UoKTtcblxuXG5cdFx0XHRpZiAobm90ZWJvb2tEb2N1bWVudCAmJiBlZGl0b3IgJiYgcmFuZ2UpIHtcblx0XHRcdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cygnJywgW0VkaXRPcGVyYXRpb24ucmVwbGFjZShyYW5nZSwgbnVsbCldKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdpbnRlcmFjdGl2ZS5oaXN0b3J5LnByZXZpb3VzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLmhpc3RvcnkucHJldmlvdXMnLCAnUHJldmlvdXMgdmFsdWUgaW4gaGlzdG9yeScpLFxuXHRcdFx0Y2F0ZWdvcnk6IGludGVyYWN0aXZlV2luZG93Q2F0ZWdvcnksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRJTlRFUkFDVElWRV9JTlBVVF9DVVJTT1JfQk9VTkRBUlkubm90RXF1YWxzVG8oJ2JvdHRvbScpLFxuXHRcdFx0XHRcdElOVEVSQUNUSVZFX0lOUFVUX0NVUlNPUl9CT1VOREFSWS5ub3RFcXVhbHNUbygnbm9uZScpLFxuXHRcdFx0XHRcdFN1Z2dlc3RDb250ZXh0LlZpc2libGUudG9OZWdhdGVkKClcblx0XHRcdFx0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKElTX0NPTVBPU0lURV9OT1RFQk9PSywgTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQubmVnYXRlKCkpXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJSW50ZXJhY3RpdmVIaXN0b3J5U2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yQ29udHJvbCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0Q29udHJvbCgpO1xuXG5cblxuXHRcdGlmIChlZGl0b3JDb250cm9sICYmIGlzUmVwbEVkaXRvckNvbnRyb2woZWRpdG9yQ29udHJvbCkgJiYgZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvcikge1xuXHRcdFx0Y29uc3Qgbm90ZWJvb2tEb2N1bWVudCA9IGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsO1xuXHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yQ29udHJvbC5hY3RpdmVDb2RlRWRpdG9yPy5nZXRNb2RlbCgpO1xuXG5cdFx0XHRpZiAobm90ZWJvb2tEb2N1bWVudCAmJiB0ZXh0TW9kZWwpIHtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXNWYWx1ZSA9IGhpc3RvcnlTZXJ2aWNlLmdldFByZXZpb3VzVmFsdWUobm90ZWJvb2tEb2N1bWVudC51cmkpO1xuXHRcdFx0XHRpZiAocHJldmlvdXNWYWx1ZSkge1xuXHRcdFx0XHRcdHRleHRNb2RlbC5zZXRWYWx1ZShwcmV2aW91c1ZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2ludGVyYWN0aXZlLmhpc3RvcnkubmV4dCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5oaXN0b3J5Lm5leHQnLCAnTmV4dCB2YWx1ZSBpbiBoaXN0b3J5JyksXG5cdFx0XHRjYXRlZ29yeTogaW50ZXJhY3RpdmVXaW5kb3dDYXRlZ29yeSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdElOVEVSQUNUSVZFX0lOUFVUX0NVUlNPUl9CT1VOREFSWS5ub3RFcXVhbHNUbygndG9wJyksXG5cdFx0XHRcdFx0SU5URVJBQ1RJVkVfSU5QVVRfQ1VSU09SX0JPVU5EQVJZLm5vdEVxdWFsc1RvKCdub25lJyksXG5cdFx0XHRcdFx0U3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChJU19DT01QT1NJVEVfTk9URUJPT0ssIE5PVEVCT09LX0VESVRPUl9GT0NVU0VELm5lZ2F0ZSgpKVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUludGVyYWN0aXZlSGlzdG9yeVNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvckNvbnRyb2wgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU/LmdldENvbnRyb2woKTtcblxuXHRcdGlmIChlZGl0b3JDb250cm9sICYmIGlzUmVwbEVkaXRvckNvbnRyb2woZWRpdG9yQ29udHJvbCkgJiYgZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvcikge1xuXHRcdFx0Y29uc3Qgbm90ZWJvb2tEb2N1bWVudCA9IGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsO1xuXHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yQ29udHJvbC5hY3RpdmVDb2RlRWRpdG9yPy5nZXRNb2RlbCgpO1xuXG5cdFx0XHRpZiAobm90ZWJvb2tEb2N1bWVudCAmJiB0ZXh0TW9kZWwpIHtcblx0XHRcdFx0Y29uc3QgbmV4dFZhbHVlID0gaGlzdG9yeVNlcnZpY2UuZ2V0TmV4dFZhbHVlKG5vdGVib29rRG9jdW1lbnQudXJpKTtcblx0XHRcdFx0aWYgKG5leHRWYWx1ZSAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdHRleHRNb2RlbC5zZXRWYWx1ZShuZXh0VmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdpbnRlcmFjdGl2ZS5zY3JvbGxUb1RvcCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2ludGVyYWN0aXZlU2Nyb2xsVG9Ub3AnLCAnU2Nyb2xsIHRvIFRvcCcpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsICd3b3JrYmVuY2guZWRpdG9yLmludGVyYWN0aXZlJyksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Ib21lLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3cgfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogaW50ZXJhY3RpdmVXaW5kb3dDYXRlZ29yeSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvckNvbnRyb2wgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU/LmdldENvbnRyb2woKTtcblxuXHRcdGlmIChlZGl0b3JDb250cm9sICYmIGlzUmVwbEVkaXRvckNvbnRyb2woZWRpdG9yQ29udHJvbCkgJiYgZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvcikge1xuXHRcdFx0aWYgKGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IuZ2V0TGVuZ3RoKCkgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLnJldmVhbENlbGxSYW5nZUluVmlldyh7IHN0YXJ0OiAwLCBlbmQ6IDEgfSk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnaW50ZXJhY3RpdmUuc2Nyb2xsVG9Cb3R0b20nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdpbnRlcmFjdGl2ZVNjcm9sbFRvQm90dG9tJywgJ1Njcm9sbCB0byBCb3R0b20nKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCAnd29ya2JlbmNoLmVkaXRvci5pbnRlcmFjdGl2ZScpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW5kLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdyB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBpbnRlcmFjdGl2ZVdpbmRvd0NhdGVnb3J5LFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yQ29udHJvbCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0Q29udHJvbCgpO1xuXG5cdFx0aWYgKGVkaXRvckNvbnRyb2wgJiYgaXNSZXBsRWRpdG9yQ29udHJvbChlZGl0b3JDb250cm9sKSAmJiBlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRpZiAoZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci5nZXRMZW5ndGgoKSA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxlbiA9IGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IuZ2V0TGVuZ3RoKCk7XG5cdFx0XHRlZGl0b3JDb250cm9sLm5vdGVib29rRWRpdG9yLnJldmVhbENlbGxSYW5nZUluVmlldyh7IHN0YXJ0OiBsZW4gLSAxLCBlbmQ6IGxlbiB9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdpbnRlcmFjdGl2ZS5pbnB1dC5mb2N1cycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5pbnB1dC5mb2N1cycsICdGb2N1cyBJbnB1dCBFZGl0b3InKSxcblx0XHRcdGNhdGVnb3J5OiBpbnRlcmFjdGl2ZVdpbmRvd0NhdGVnb3J5LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBJbnRlcmFjdGl2ZVdpbmRvd09wZW5cblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JDb250cm9sID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5nZXRDb250cm9sKCk7XG5cblx0XHRpZiAoZWRpdG9yQ29udHJvbCAmJiBpc1JlcGxFZGl0b3JDb250cm9sKGVkaXRvckNvbnRyb2wpICYmIGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IpIHtcblx0XHRcdGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZm9jdXMoKTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHQvLyBmaW5kIGFuZCBvcGVuIHRoZSBtb3N0IHJlY2VudCBpbnRlcmFjdGl2ZSB3aW5kb3dcblx0XHRcdGNvbnN0IG9wZW5FZGl0b3JzID0gZWRpdG9yU2VydmljZS5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0XHRjb25zdCBpbnRlcmFjdGl2ZVdpbmRvdyA9IEl0ZXJhYmxlLmZpbmQob3BlbkVkaXRvcnMsIGlkZW50aWZpZXIgPT4geyByZXR1cm4gaWRlbnRpZmllci5lZGl0b3IudHlwZUlkID09PSBJbnRlcmFjdGl2ZUVkaXRvcklucHV0LklEOyB9KTtcblx0XHRcdGlmIChpbnRlcmFjdGl2ZVdpbmRvdykge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JJbnB1dCA9IGludGVyYWN0aXZlV2luZG93LmVkaXRvciBhcyBJbnRlcmFjdGl2ZUVkaXRvcklucHV0O1xuXHRcdFx0XHRjb25zdCBjdXJyZW50R3JvdXAgPSBpbnRlcmFjdGl2ZVdpbmRvdy5ncm91cElkO1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoZWRpdG9ySW5wdXQsIGN1cnJlbnRHcm91cCk7XG5cdFx0XHRcdGNvbnN0IGVkaXRvckNvbnRyb2wgPSBlZGl0b3I/LmdldENvbnRyb2woKTtcblxuXHRcdFx0XHRpZiAoZWRpdG9yQ29udHJvbCAmJiBpc1JlcGxFZGl0b3JDb250cm9sKGVkaXRvckNvbnRyb2wpICYmIGVkaXRvckNvbnRyb2wubm90ZWJvb2tFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU/LmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdpbnRlcmFjdGl2ZS5oaXN0b3J5LmZvY3VzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLmhpc3RvcnkuZm9jdXMnLCAnRm9jdXMgSGlzdG9yeScpLFxuXHRcdFx0Y2F0ZWdvcnk6IGludGVyYWN0aXZlV2luZG93Q2F0ZWdvcnksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgJ3dvcmtiZW5jaC5lZGl0b3IuaW50ZXJhY3RpdmUnKSxcblx0XHRcdH0sXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHQvLyBPbiBtYWMsIHJlcXVpcmUgdGhhdCB0aGUgY3Vyc29yIGlzIGF0IHRoZSB0b3Agb2YgdGhlIGlucHV0LCB0byBhdm9pZCBzdGVhbGluZyBjbWQrdXAgdG8gbW92ZSB0aGUgY3Vyc29yIHRvIHRoZSB0b3Bcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdElOVEVSQUNUSVZFX0lOUFVUX0NVUlNPUl9CT1VOREFSWS5ub3RFcXVhbHNUbygnYm90dG9tJyksXG5cdFx0XHRcdFx0SU5URVJBQ1RJVkVfSU5QVVRfQ1VSU09SX0JPVU5EQVJZLm5vdEVxdWFsc1RvKCdub25lJykpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDUsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihJc1dpbmRvd3NDb250ZXh0LCBJc0xpbnV4Q29udGV4dCksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdH1dLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoSVNfQ09NUE9TSVRFX05PVEVCT09LLCBOT1RFQk9PS19FRElUT1JfRk9DVVNFRC5uZWdhdGUoKSlcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvckNvbnRyb2wgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU/LmdldENvbnRyb2woKTtcblxuXHRcdGlmIChlZGl0b3JDb250cm9sICYmIGlzUmVwbEVkaXRvckNvbnRyb2woZWRpdG9yQ29udHJvbCkgJiYgZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvcikge1xuXHRcdFx0ZWRpdG9yQ29udHJvbC5ub3RlYm9va0VkaXRvci5mb2N1cygpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQ29sb3IoJ2ludGVyYWN0aXZlLmFjdGl2ZUNvZGVCb3JkZXInLCB7XG5cdGRhcms6IGlmRGVmaW5lZFRoZW5FbHNlKHBlZWtWaWV3Qm9yZGVyLCBwZWVrVmlld0JvcmRlciwgJyMwMDdhY2MnKSxcblx0bGlnaHQ6IGlmRGVmaW5lZFRoZW5FbHNlKHBlZWtWaWV3Qm9yZGVyLCBwZWVrVmlld0JvcmRlciwgJyMwMDdhY2MnKSxcblx0aGNEYXJrOiBjb250cmFzdEJvcmRlcixcblx0aGNMaWdodDogY29udHJhc3RCb3JkZXJcbn0sIGxvY2FsaXplKCdpbnRlcmFjdGl2ZS5hY3RpdmVDb2RlQm9yZGVyJywgJ1RoZSBib3JkZXIgY29sb3IgZm9yIHRoZSBjdXJyZW50IGludGVyYWN0aXZlIGNvZGUgY2VsbCB3aGVuIHRoZSBlZGl0b3IgaGFzIGZvY3VzLicpKTtcblxucmVnaXN0ZXJDb2xvcignaW50ZXJhY3RpdmUuaW5hY3RpdmVDb2RlQm9yZGVyJywge1xuXHQvL2Rhcms6IHRoZW1lLmdldENvbG9yKGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQpID8/IHRyYW5zcGFyZW50KGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQsIDEpLFxuXHRkYXJrOiBpZkRlZmluZWRUaGVuRWxzZShsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kLCBsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kLCAnIzM3MzczRCcpLFxuXHRsaWdodDogaWZEZWZpbmVkVGhlbkVsc2UobGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCwgbGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCwgJyNFNEU2RjEnKSxcblx0aGNEYXJrOiBQQU5FTF9CT1JERVIsXG5cdGhjTGlnaHQ6IFBBTkVMX0JPUkRFUlxufSwgbG9jYWxpemUoJ2ludGVyYWN0aXZlLmluYWN0aXZlQ29kZUJvcmRlcicsICdUaGUgYm9yZGVyIGNvbG9yIGZvciB0aGUgY3VycmVudCBpbnRlcmFjdGl2ZSBjb2RlIGNlbGwgd2hlbiB0aGUgZWRpdG9yIGRvZXMgbm90IGhhdmUgZm9jdXMuJykpO1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRpZDogJ2ludGVyYWN0aXZlV2luZG93Jyxcblx0b3JkZXI6IDEwMCxcblx0dHlwZTogJ29iamVjdCcsXG5cdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFtSZXBsRWRpdG9yU2V0dGluZ3MuaW50ZXJhY3RpdmVXaW5kb3dBbHdheXNTY3JvbGxPbk5ld0NlbGxdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ludGVyYWN0aXZlV2luZG93LmFsd2F5c1Njcm9sbE9uTmV3Q2VsbCcsIFwiQXV0b21hdGljYWxseSBzY3JvbGwgdGhlIGludGVyYWN0aXZlIHdpbmRvdyB0byBzaG93IHRoZSBvdXRwdXQgb2YgdGhlIGxhc3Qgc3RhdGVtZW50IGV4ZWN1dGVkLiBJZiB0aGlzIHZhbHVlIGlzIGZhbHNlLCB0aGUgd2luZG93IHdpbGwgb25seSBzY3JvbGwgaWYgdGhlIGxhc3QgY2VsbCB3YXMgYWxyZWFkeSB0aGUgb25lIHNjcm9sbGVkIHRvLlwiKVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5JbnRlcmFjdGl2ZVdpbmRvd1Byb21wdFRvU2F2ZV06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ludGVyYWN0aXZlV2luZG93LnByb21wdFRvU2F2ZU9uQ2xvc2UnLCBcIlByb21wdCB0byBzYXZlIHRoZSBpbnRlcmFjdGl2ZSB3aW5kb3cgd2hlbiBpdCBpcyBjbG9zZWQuIE9ubHkgbmV3IGludGVyYWN0aXZlIHdpbmRvd3Mgd2lsbCBiZSBhZmZlY3RlZCBieSB0aGlzIHNldHRpbmcgY2hhbmdlLlwiKVxuXHRcdH0sXG5cdFx0W1JlcGxFZGl0b3JTZXR0aW5ncy5leGVjdXRlV2l0aFNoaWZ0RW50ZXJdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdpbnRlcmFjdGl2ZVdpbmRvdy5leGVjdXRlV2l0aFNoaWZ0RW50ZXInLCBcIkV4ZWN1dGUgdGhlIEludGVyYWN0aXZlIFdpbmRvdyAoUkVQTCkgaW5wdXQgYm94IHdpdGggc2hpZnQrZW50ZXIsIHNvIHRoYXQgZW50ZXIgY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGEgbmV3bGluZS5cIiksXG5cdFx0XHR0YWdzOiBbJ3JlcGxFeGVjdXRlJ11cblx0XHR9LFxuXHRcdFtSZXBsRWRpdG9yU2V0dGluZ3Muc2hvd0V4ZWN1dGlvbkhpbnRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ludGVyYWN0aXZlV2luZG93LnNob3dFeGVjdXRpb25IaW50JywgXCJEaXNwbGF5IGEgaGludCBpbiB0aGUgSW50ZXJhY3RpdmUgV2luZG93IChSRVBMKSBpbnB1dCBib3ggdG8gaW5kaWNhdGUgaG93IHRvIGV4ZWN1dGUgY29kZS5cIiksXG5cdFx0XHR0YWdzOiBbJ3JlcGxFeGVjdXRlJ11cblx0XHR9XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLGtCQUErQjtBQUN4QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxlQUFlO0FBQ2pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBb0MseUJBQXlCO0FBQzdELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVyxzQkFBc0I7QUFDMUMsU0FBUyxVQUFVLGlCQUFpQjtBQUVwQyxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBaUMsY0FBYywrQkFBK0I7QUFDOUUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBa0Q7QUFDM0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCLG1CQUFtQixpQ0FBaUMscUJBQXFCO0FBQ2xHLFNBQVMsNEJBQWlEO0FBQzFELFNBQWlDLGdCQUFnQixzQ0FBc0M7QUFDdkYsU0FBUyxrQkFBa0Isb0JBQW9HO0FBRS9ILFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsb0JBQW9CLHlDQUF5QztBQUN0RSxTQUFTLDZCQUE2QixrQ0FBa0M7QUFDeEUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw0QkFBNEIsaUNBQWlDO0FBQ3RFLFNBQVMsNENBQTRDO0FBRXJELFlB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QUFDO0FBQUEsTUFDRCxjQUFjLGVBQWUsSUFBSSx1QkFBdUIsd0JBQXdCLE9BQU8sQ0FBQztBQUFBLElBQ3pGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBMkM7QUFDcEQsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsVUFBTSxnQkFBZ0IsY0FBYyxrQkFBa0IsV0FBVztBQUVqRSxRQUFJLGlCQUFpQixvQkFBb0IsYUFBYSxLQUFLLGNBQWMsZ0JBQWdCO0FBQ3hGLG9CQUFjLGVBQWUsTUFBTTtBQUFBLElBQ3BDO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFRCxjQUFjLGdDQUFnQztBQUFBLEVBQzdDLE1BQU0sa0JBQWtCLGdCQUFnQixnQkFBZ0IsU0FBUztBQUFBLEVBQ2pFLE9BQU8sa0JBQWtCLGdCQUFnQixnQkFBZ0IsU0FBUztBQUFBLEVBQ2xFLFFBQVE7QUFBQSxFQUNSLFNBQVM7QUFDVixHQUFHLFNBQVMsZ0NBQWdDLG1GQUFtRixDQUFDO0FBRWhJLGNBQWMsa0NBQWtDO0FBQUE7QUFBQSxFQUUvQyxNQUFNLGtCQUFrQixpQ0FBaUMsaUNBQWlDLFNBQVM7QUFBQSxFQUNuRyxPQUFPLGtCQUFrQixpQ0FBaUMsaUNBQWlDLFNBQVM7QUFBQSxFQUNwRyxRQUFRO0FBQUEsRUFDUixTQUFTO0FBQ1YsR0FBRyxTQUFTLGtDQUFrQyw2RkFBNkYsQ0FBQztBQUU1SSxTQUFTLEdBQTJCLHdCQUF3QixhQUFhLEVBQUUsc0JBQXNCO0FBQUEsRUFDaEcsSUFBSTtBQUFBLEVBQ0osT0FBTztBQUFBLEVBQ1AsTUFBTTtBQUFBLEVBQ04sY0FBYztBQUFBLElBQ2IsQ0FBQyxtQkFBbUIsc0NBQXNDLEdBQUc7QUFBQSxNQUM1RCxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxxQkFBcUIsU0FBUywyQ0FBMkMsc01BQXNNO0FBQUEsSUFDaFI7QUFBQSxJQUNBLENBQUMsZ0JBQWdCLDZCQUE2QixHQUFHO0FBQUEsTUFDaEQsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QscUJBQXFCLFNBQVMseUNBQXlDLGdJQUFnSTtBQUFBLElBQ3hNO0FBQUEsSUFDQSxDQUFDLG1CQUFtQixxQkFBcUIsR0FBRztBQUFBLE1BQzNDLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULHFCQUFxQixTQUFTLDJDQUEyQyxrSEFBa0g7QUFBQSxNQUMzTCxNQUFNLENBQUMsYUFBYTtBQUFBLElBQ3JCO0FBQUEsSUFDQSxDQUFDLG1CQUFtQixpQkFBaUIsR0FBRztBQUFBLE1BQ3ZDLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULHFCQUFxQixTQUFTLHVDQUF1Qyw0RkFBNEY7QUFBQSxNQUNqSyxNQUFNLENBQUMsYUFBYTtBQUFBLElBQ3JCO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbImlkIiwgImVkaXRvcklucHV0IiwgImVkaXRvckNvbnRyb2wiXQp9Cg==
